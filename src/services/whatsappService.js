// ============================================================
// Versión: v2.3.0
// Archivo: src/services/whatsappService.js
// Descripción: Servicio de alto nivel para enviar enlaces temporales
// de descarga por WhatsApp usando Twilio SDK (vía src/utils/whatsapp.js).
//
// Equivalente a emailService.js pero para el canal de WhatsApp.
// Usa la config de alertas_config de la BD + credenciales Twilio del .env.
//
// Requiere en .env:
//   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// Y en alertas_config (vía PUT /api/alertas/config):
//   whatsapp_activo=1
//   whatsapp_numero_origen=whatsapp:+14155238886  (o tu número aprobado)
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
 * Envía el enlace temporal de descarga por WhatsApp vía Twilio.
 * Siempre retorna { success, error? } — nunca lanza excepción.
 *
 * @param {object} params
 * @param {string} params.numeroDestino - Formato E.164, ej: +521234567890
 * @param {string} params.rfc
 * @param {string} params.razonSocial
 * @param {string} params.fileType - 'CER' | 'KEY' | 'ZIP'
 * @param {string} params.downloadUrl - URL completa del token de descarga
 * @param {string} params.expiresAt - Fecha de expiración (ISO/SQLite datetime)
 * @returns {Promise<{ success: boolean, sid?: string, error?: string }>}
 */
async function enviarEnlaceTemporalWhatsApp({ numeroDestino, rfc, razonSocial, fileType, downloadUrl, expiresAt }) {
    try {
        if (!numeroDestino || !/^\+[1-9]\d{7,14}$/.test(numeroDestino)) {
            return {
                success: false,
                error: 'Número de WhatsApp inválido. Usa formato internacional (ej. +521234567890).'
            };
        }

        const config = db.prepare('SELECT * FROM alertas_config WHERE id = 1').get() || {};

        const expiraTexto = new Date(expiresAt).toLocaleString('es-MX', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });

        const mensaje =
            `📄 *SAT Control Manager*\n\n` +
            `Se generó un enlace de descarga seguro para:\n\n` +
            `🏢 *Razón Social:* ${razonSocial}\n` +
            `🆔 *RFC:* ${rfc}\n` +
            `📁 *Archivo:* ${nombreArchivo(fileType)}\n\n` +
            `🔗 *Descarga:* ${downloadUrl}\n\n` +
            `⚠️ *Aviso de seguridad:* Este enlace es de *único uso* y se autodestruye ` +
            `tras la primera descarga exitosa, o expira el ${expiraTexto}.\n\n` +
            `_No compartas este enlace con terceros._`;

        const resultado = await enviarWhatsapp(config, numeroDestino, mensaje);

        return { success: true, sid: resultado?.sid };
    } catch (error) {
        console.error('[WhatsApp Service] Error enviando mensaje Twilio:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = { enviarEnlaceTemporalWhatsApp };
