// ============================================================
// Versión: v2.3.1
// Archivo: src/utils/whatsapp.js
// Descripción: Envío REAL de WhatsApp vía Twilio SDK oficial.
// Soporta tanto mensajes de texto libre (body) como Plantillas Aprobadas (ContentSid / ContentVariables).
//
// Requiere en .env:
//   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   TWILIO_CONTENT_SID=HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (Opcional: ID plantilla aprobada)
//
// El número de origen (whatsapp_numero_origen en alertas_config o TWILIO_WHATSAPP_FROM)
// debe ser el Sandbox o el número aprobado de Twilio en formato:
//   whatsapp:+14155238886   ← Sandbox de Twilio
//   whatsapp:+521XXXXXXXXXX ← Número propio aprobado
// ============================================================

'use strict';

require('dotenv').config();

/**
 * Envía un mensaje de WhatsApp usando el SDK oficial de Twilio.
 * Soporta tanto texto libre (body) como plantillas aprobadas (contentSid + contentVariables).
 *
 * @param {object} config - Fila de alertas_config (de la BD)
 * @param {string} destinatario - Número en formato E.164, ej: +521234567890
 * @param {string} mensaje - Texto del mensaje (usado si no hay contentSid)
 * @param {object} [options] - Opciones adicionales ({ contentSid, contentVariables, variables })
 */
async function enviarWhatsapp(config, destinatario, mensaje, options = {}) {
    if (config.whatsapp_activo === 0 && !process.env.TWILIO_WHATSAPP_FROM) {
        throw new Error('El canal de WhatsApp está desactivado en la configuración de alertas.');
    }
    const numeroOrigen = config.whatsapp_numero_origen || process.env.TWILIO_WHATSAPP_FROM;
    if (!numeroOrigen) {
        throw new Error(
            'Falta el número de origen de WhatsApp en la configuración de alertas o en .env. ' +
            'Usa el formato: whatsapp:+14155238886 (Sandbox Twilio) o whatsapp:+52XXXXXXXXXX'
        );
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
        throw new Error(
            'TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN no están configurados en el .env del servidor.'
        );
    }

    // Previene fallos por proxies SSL locales o antivirus (UNABLE_TO_VERIFY_LEAF_SIGNATURE)
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    let twilioClient;
    try {
        const twilio = require('twilio');
        twilioClient = twilio(accountSid, authToken);
    } catch (err) {
        throw new Error(
            'El paquete "twilio" no está instalado. Ejecuta: npm install twilio'
        );
    }

    const from = numeroOrigen.startsWith('whatsapp:')
        ? numeroOrigen
        : `whatsapp:${numeroOrigen}`;

    const to = destinatario.startsWith('whatsapp:')
        ? destinatario
        : `whatsapp:${destinatario}`;

    const payload = { from, to };

    // Soporte para Plantillas Aprobadas (ContentSid / ContentVariables de Twilio)
    if (options.contentSid) {
        payload.contentSid = options.contentSid;
        const vars = options.contentVariables || options.variables;
        if (vars) {
            payload.contentVariables = typeof vars === 'string' ? vars : JSON.stringify(vars);
        }
    } else {
        payload.body = mensaje;
    }

    const message = await twilioClient.messages.create(payload);

    return { sid: message.sid, status: message.status };
}

module.exports = { enviarWhatsapp };
