// ============================================================
// Versión: v2.2.1
// Archivo: src/utils/colaAlertas.js
// Descripción: Cola persistente de reintentos de mensajería
// (fix hallazgo QA #13). Reemplaza el 'for' síncrono en memoria de
// alertas.js: ahora cada alerta pendiente queda en la tabla
// cola_alertas y sobrevive a una caída/reinicio del servidor.
// Backoff real: 5, 15 y 30 minutos entre intentos (antes: ms simulados).
// ============================================================

'use strict';

const db = require('../db/database');
const { registrarLog } = require('./ledger');
const { enviarCorreo } = require('./mailer');
const { enviarWhatsapp } = require('./whatsapp');

// Backoff en minutos, tal como pide la especificación de negocio
const BACKOFF_MINUTOS = [5, 15, 30];

/**
 * Encola una alerta para envío. No la envía de inmediato: el
 * procesamiento real ocurre en procesarColaAlertas() (invocado por
 * el cron de server.js o manualmente).
 */
function encolarAlerta({ tipo, destinatario, asunto = null, mensaje, max_intentos = 3 }) {
    const resultado = db.prepare(`
        INSERT INTO cola_alertas (tipo, destinatario, asunto, mensaje, max_intentos, proximo_reintento_en)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(tipo, destinatario, asunto, mensaje, max_intentos, Math.floor(Date.now() / 1000));

    return resultado.lastInsertRowid;
}

/**
 * Procesa todas las alertas pendientes cuyo proximo_reintento_en ya
 * se cumplió. Pensado para ejecutarse periódicamente (cron) o bajo
 * demanda desde POST /api/alertas/probar.
 * @returns {{procesadas: number, enviadas: number, fallidas: number}}
 */
async function procesarColaAlertas() {
    const config = db.prepare('SELECT * FROM alertas_config WHERE id = 1').get() || {};
    const ahora = Math.floor(Date.now() / 1000);

    const pendientes = db.prepare(`
        SELECT * FROM cola_alertas
        WHERE estatus = 'pendiente' AND proximo_reintento_en <= ?
    `).all(ahora);

    let enviadas = 0, fallidas = 0;

    for (const alerta of pendientes) {
        try {
            if (alerta.tipo === 'correo') {
                await enviarCorreo(config, alerta.destinatario, alerta.asunto, alerta.mensaje);
            } else {
                await enviarWhatsapp(config, alerta.destinatario, alerta.mensaje);
            }

            db.prepare(`
                UPDATE cola_alertas
                SET estatus = 'enviado', intentos_realizados = intentos_realizados + 1, actualizado_en = ?
                WHERE id = ?
            `).run(ahora, alerta.id);

            enviadas++;
        } catch (err) {
            const intentos = alerta.intentos_realizados + 1;
            const agotado = intentos >= alerta.max_intentos;
            const minutosEspera = BACKOFF_MINUTOS[Math.min(intentos - 1, BACKOFF_MINUTOS.length - 1)];

            db.prepare(`
                UPDATE cola_alertas
                SET intentos_realizados = ?,
                    estatus = ?,
                    ultimo_error = ?,
                    proximo_reintento_en = ?,
                    actualizado_en = ?
                WHERE id = ?
            `).run(
                intentos,
                agotado ? 'fallido' : 'pendiente',
                err.message,
                ahora + (minutosEspera * 60),
                ahora,
                alerta.id
            );

            if (agotado) {
                fallidas++;
                registrarLog({
                    accion: 'ALERTA_COLA_FALLO_DEFINITIVO',
                    detalle: `Tipo: ${alerta.tipo} | Destinatario: ${alerta.destinatario} | Intentos: ${intentos} | Error: ${err.message}`,
                    ip_origen: null
                });
            }
        }
    }

    return { procesadas: pendientes.length, enviadas, fallidas };
}

module.exports = { encolarAlerta, procesarColaAlertas };
