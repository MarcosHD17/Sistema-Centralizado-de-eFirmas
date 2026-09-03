// ============================================================
// Versión: v2.2.1
// Archivo: src/utils/mailer.js
// Descripción: Envío REAL de correo vía SMTP (fix hallazgo QA #12).
// Sustituye el simulador basado en Math.random() de alertas.js.
// Las credenciales se leen cifradas de alertas_config y se
// descifran en memoria únicamente para construir el transporte.
// ============================================================

'use strict';

const nodemailer = require('nodemailer');
const { descifrar } = require('./crypto');

/**
 * Construye un transporte SMTP a partir de la configuración guardada
 * en alertas_config. Lanza un error explícito si falta algo, en vez
 * de fingir éxito (a diferencia del simulador anterior).
 * @param {object} config - Fila de alertas_config
 * @returns {import('nodemailer').Transporter}
 */
function construirTransporte(config) {
    if (config.correo_activo === 0) {
        throw new Error('El canal de correo está desactivado en la configuración de alertas.');
    }
    const host = config.correo_smtp_host || process.env.SMTP_HOST;
    const puerto = config.correo_smtp_puerto || parseInt(process.env.SMTP_PORT) || 587;
    const usuario = config.correo_smtp_usuario || process.env.SMTP_USER;
    const passPlano = config.correo_smtp_pass_cifrado
        ? descifrar(config.correo_smtp_pass_cifrado)
        : process.env.SMTP_PASS;

    if (!host || !usuario || !passPlano) {
        throw new Error('Faltan credenciales SMTP (host, usuario o contraseña) en la configuración de alertas o en .env.');
    }

    const isSecure = process.env.SMTP_SECURE !== undefined
        ? process.env.SMTP_SECURE === 'true'
        : puerto === 465;

    return nodemailer.createTransport({
        host: host,
        port: puerto,
        secure: isSecure,
        auth: {
            user: usuario,
            pass: passPlano
        },
        tls: { rejectUnauthorized: false }
    });
}

/**
 * Envía un correo real. No atrapa errores: el llamador (la cola de
 * alertas) decide cómo reintentar o reportar el fallo.
 * @param {object} config - Fila de alertas_config
 * @param {string} destinatario
 * @param {string} asunto
 * @param {string} mensaje
 */
async function enviarCorreo(config, destinatario, asunto, mensaje) {
    const transporte = construirTransporte(config);
    const remitente = process.env.EMAIL_FROM || config.correo_smtp_usuario || process.env.SMTP_USER;
    return transporte.sendMail({
        from: remitente,
        to: destinatario,
        subject: asunto || 'SAT Control Manager — Notificación',
        text: mensaje
    });
}

module.exports = { enviarCorreo, construirTransporte };
