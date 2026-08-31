// ============================================================
// Versión: v2.2.1
// Archivo: src/utils/whatsapp.js
// Descripción: Envío REAL de WhatsApp vía un webhook REST genérico
// (fix hallazgo QA #12). En vez de amarrar el proyecto a un SDK
// propietario específico (Twilio, Meta Cloud API, etc.), se expone
// un adaptador HTTP simple compatible con la mayoría de proveedores
// que exponen una API REST con autenticación Bearer:
//
//   POST {WHATSAPP_API_URL}
//   Authorization: Bearer <whatsapp_api_token descifrado>
//   { "from": "<numero_origen>", "to": "<destinatario>", "message": "<texto>" }
//
// Configura WHATSAPP_API_URL en el .env apuntando al endpoint real
// del proveedor contratado. Si el proveedor usa un formato de body
// distinto, ajustar el payload en enviarWhatsapp().
// ============================================================

'use strict';

const { descifrar } = require('./crypto');

async function enviarWhatsapp(config, destinatario, mensaje) {
    if (!config.whatsapp_activo) {
        throw new Error('El canal de WhatsApp está desactivado en la configuración de alertas.');
    }
    if (!config.whatsapp_api_token_cifrado || !config.whatsapp_numero_origen) {
        throw new Error('Faltan credenciales de WhatsApp (token o número de origen) en la configuración de alertas.');
    }

    const apiUrl = process.env.WHATSAPP_API_URL;
    if (!apiUrl) {
        throw new Error('WHATSAPP_API_URL no está configurada en el entorno del servidor.');
    }

    const tokenPlano = descifrar(config.whatsapp_api_token_cifrado);

    // Fix hallazgo QA MEDIA: agregar timeout para evitar que el cron de la cola
    // se atasque indefinidamente si el proveedor de WhatsApp no responde.
    const respuesta = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokenPlano}`
        },
        body: JSON.stringify({
            from: config.whatsapp_numero_origen,
            to: destinatario,
            message: mensaje
        }),
        signal: AbortSignal.timeout(10000) // 10 segundos máximo
    });

    if (!respuesta.ok) {
        const texto = await respuesta.text().catch(() => '');
        throw new Error(`El proveedor de WhatsApp respondió ${respuesta.status}: ${texto}`);
    }

    return respuesta.json().catch(() => ({}));
}

module.exports = { enviarWhatsapp };
