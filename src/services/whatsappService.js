// ============================================================
// Archivo: src/services/whatsappService.js
// Descripción: Envío de enlaces temporales de descarga vía WhatsApp.
// Análogo a emailService.js. Usa el adaptador REST genérico de
// src/utils/whatsapp.js (Bearer token, compatible con cualquier
// proveedor: Twilio, Meta Cloud API, etc.).
//
// Requiere en .env:
//   WHATSAPP_API_URL=https://api.tuproveedor.com/v1/messages
// y en alertas_config: whatsapp_activo=1, whatsapp_numero_origen,
// whatsapp_api_token_cifrado (cifrado con src/utils/crypto.js).
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
 * Envía el enlace temporal de descarga por WhatsApp.
 * No lanza excepción: siempre retorna { success, error? } igual que emailService.
 * @param {object} params
 * @param {string} params.numeroDestino - Formato E.164, ej: +521234567890
 */
async function enviarEnlaceTemporalWhatsApp({ numeroDestino, rfc, razonSocial, fileType, downloadUrl, expiresAt }) {
    try {
        if (!numeroDestino || !/^\+[1-9]\d{7,14}$/.test(numeroDestino)) {
            return { success: false, error: 'Número de WhatsApp inválido. Usa formato internacional (ej. +521234567890).' };
        }

        const config = db.prepare('SELECT * FROM alertas_config WHERE id = 1').get() || {};

        const expiraTexto = new Date(expiresAt).toLocaleString('es-MX');
        const mensaje =
            `📄 *SAT Control Manager*\n\n` +
            `Se generó un enlace de descarga seguro para:\n\n` +
            `🏢 *Razón Social:* ${razonSocial}\n` +
            `🆔 *RFC:* ${rfc}\n` +
            `📁 *Archivo:* ${nombreArchivo(fileType)}\n\n` +
            `🔗 Descarga: ${downloadUrl}\n\n` +
            `⚠️ *Aviso:* Este enlace es de único uso y se autodestruye tras la primera descarga, o expira el ${expiraTexto}.`;

        await enviarWhatsapp(config, numeroDestino, mensaje);

        return { success: true };
    } catch (error) {
        console.error('[WhatsApp Service] Error enviando mensaje:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = { enviarEnlaceTemporalWhatsApp };
