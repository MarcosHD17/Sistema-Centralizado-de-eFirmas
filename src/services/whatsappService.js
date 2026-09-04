// ============================================================
// Versión: v2.3.3
// Archivo: src/services/whatsappService.js
// Descripción: Servicio de alto nivel para enviar enlaces temporales
// de descarga por WhatsApp usando Twilio SDK (vía src/utils/whatsapp.js).
// Utiliza el estilo de mensaje original completo con formato Markdown,
// emojis, Razón Social, RFC, aviso de autodestrucción y enlace.
// ============================================================

'use strict';

const db = require('../db/database');
const { enviarWhatsapp } = require('../utils/whatsapp');

function nombreArchivo(fileType) {
    if (fileType === 'CER') return 'Certificado Público (.cer)';
    if (fileType === 'KEY') return 'Clave Privada Cifrada (.key)';
    if (fileType === 'ZIP') return 'Paquete Completo (.zip)';
    return fileType;
}

/**
 * Envía el enlace temporal de descarga por WhatsApp vía Twilio
 * usando el formato de mensaje completo estructurado original.
 * Siempre retorna { success, modo_envio, sid?, error? } — nunca lanza excepción.
 *
 * @param {object} params
 * @param {string} params.numeroDestino - Formato E.164 o 10 dígitos, ej: 8116054215 / +5218116054215
 * @param {string} params.rfc
 * @param {string} params.razonSocial
 * @param {string} params.fileType - 'CER' | 'KEY' | 'ZIP'
 * @param {string} params.downloadUrl - URL completa del token de descarga
 * @param {string} params.expiresAt - Fecha de expiración (ISO/SQLite datetime)
 * @param {boolean} [params.useContentTemplate=false] - Si es true, usa TWILIO_CONTENT_SID si está configurada
 * @returns {Promise<{ success: boolean, modo_envio: string, sid?: string, error?: string }>}
 */
async function enviarEnlaceTemporalWhatsApp({ numeroDestino, rfc, razonSocial, fileType, downloadUrl, expiresAt, useContentTemplate = false }) {
    try {
        if (!numeroDestino) {
            return {
                success: false,
                modo_envio: 'Desconocido',
                error: 'Número de WhatsApp destino es requerido.'
            };
        }

        // Normalizar formato internacional México (+521)
        let limpio = String(numeroDestino).replace(/[\s\-\(\)]/g, '').trim();
        if (/^\d{10}$/.test(limpio)) limpio = `+521${limpio}`;
        else if (/^\+52\d{10}$/.test(limpio)) limpio = limpio.replace('+52', '+521');
        else if (/^52\d{10}$/.test(limpio)) limpio = `+521${limpio.slice(2)}`;
        else if (!limpio.startsWith('+')) limpio = `+${limpio}`;

        if (!/^\+[1-9]\d{7,14}$/.test(limpio)) {
            return {
                success: false,
                modo_envio: 'Desconocido',
                error: 'Número de WhatsApp inválido. Usa 10 dígitos o formato internacional, ej: +5218116054215'
            };
        }

        const config = db.prepare('SELECT * FROM alertas_config WHERE id = 1').get() || {};

        const expiraTexto = new Date(expiresAt).toLocaleString('es-MX', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });

        // Estilo de mensaje original completo con formato rico
        const mensajeText =
            `📄 *SAT Control Manager*\n\n` +
            `Se generó un enlace de descarga seguro para:\n\n` +
            `🏢 *Razón Social:* ${razonSocial}\n` +
            `🆔 *RFC:* ${rfc}\n` +
            `📁 *Archivo:* ${nombreArchivo(fileType)}\n\n` +
            `⚠️ *Aviso de seguridad:* Este enlace es de *único uso* y se autodestruye ` +
            `tras la primera descarga exitosa, o expira el ${expiraTexto}.\n\n` +
            `_No compartas este enlace con terceros._`;

        const options = {};
        let modoEnvio = 'Mensaje Formateado Original';

        if (useContentTemplate && process.env.TWILIO_CONTENT_SID) {
            modoEnvio = `Content Template (${process.env.TWILIO_CONTENT_SID})`;
            options.contentSid = process.env.TWILIO_CONTENT_SID;
            options.contentVariables = JSON.stringify({
                "1": rfc,
                "2": downloadUrl
            });
        }

        const resultado = await enviarWhatsapp(config, limpio, mensajeText, options);

        return {
            success: true,
            modo_envio: modoEnvio,
            sid: resultado?.sid
        };
    } catch (error) {
        console.error('[WhatsApp Service] Error enviando mensaje Twilio:', error.message);
        return {
            success: false,
            modo_envio: 'Mensaje Formateado Original',
            error: error.message
        };
    }
}

module.exports = { enviarEnlaceTemporalWhatsApp };
