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
    if (!config.correo_activo) {
        throw new Error('El canal de correo está desactivado en la configuración de alertas.');
    }
    if (!config.correo_smtp_host || !config.correo_smtp_usuario || !config.correo_smtp_pass_cifrado) {
        throw new Error('Faltan credenciales SMTP (host, usuario o contraseña) en la configuración de alertas.');
    }

    const passPlano = descifrar(config.correo_smtp_pass_cifrado);

    return nodemailer.createTransport({
        host: config.correo_smtp_host,
        port: config.correo_smtp_puerto || 587,
        secure: (config.correo_smtp_puerto || 587) === 465,
        auth: {
            user: config.correo_smtp_usuario,
            pass: passPlano
        }
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
    return transporte.sendMail({
        from: config.correo_smtp_usuario,
        to: destinatario,
        subject: asunto || 'SAT Control Manager — Notificación',
        text: mensaje
    });
}

module.exports = { enviarCorreo, construirTransporte };
