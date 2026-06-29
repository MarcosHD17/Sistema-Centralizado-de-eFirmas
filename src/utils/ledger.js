// ============================================================
// Versión: v2.2.0
// Archivo: src/utils/ledger.js
// Descripción: Utilidad para el sistema de bitácora ledger-chain
// inmutable. Cada registro incluye el hash SHA-256 del registro
// anterior para detectar manipulaciones (CU-04 v1.1).
// ============================================================

'use strict';

const crypto = require('crypto');
const db = require('../db/database');

/**
 * Obtiene el hash del último registro de la bitácora.
 * Retorna null si la bitácora está vacía (primer registro).
 */
function getUltimoHash() {
    const fila = db.prepare(
        'SELECT current_hash FROM bitacora_logs ORDER BY id DESC LIMIT 1'
    ).get();
    return fila ? fila.current_hash : null;
}

/**
 * Calcula el SHA-256 de un string dado.
 * @param {string} data
 * @returns {string} Hash hexadecimal
 */
function calcularHash(data) {
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Registra una acción en la bitácora ledger-chain inmutable.
 * @param {object} entrada
 * @param {number|null} entrada.usuario_id - ID del usuario que realizó la acción
 * @param {string|null} entrada.usuario_email - Email del usuario
 * @param {string}      entrada.accion - Código de acción (ej. 'AUTH_LOGIN', 'CONTRIBUYENTE_CREAR')
 * @param {string|null} entrada.detalle - Descripción adicional en texto plano
 * @param {string|null} entrada.ip_origen - IP del cliente
 */
function registrarLog({ usuario_id = null, usuario_email = null, accion, detalle = null, ip_origen = null }) {
    const timestamp_utc = Math.floor(Date.now() / 1000);
    const prev_hash = getUltimoHash();

    // El contenido a hashear incluye todos los campos del registro
    // para garantizar que cualquier modificación rompa la cadena
    const contenido = `${timestamp_utc}|${usuario_email || ''}|${accion}|${detalle || ''}|${ip_origen || ''}|${prev_hash || 'GENESIS'}`;
    const current_hash = calcularHash(contenido);

    db.prepare(`
        INSERT INTO bitacora_logs (timestamp_utc, usuario_id, usuario_email, accion, detalle, ip_origen, prev_hash, current_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(timestamp_utc, usuario_id, usuario_email, accion, detalle, ip_origen, prev_hash, current_hash);
}

/**
 * Verifica la integridad completa de la cadena de bitácora.
 * @returns {{ valida: boolean, registros: number, primer_fallo_id: number|null }}
 */
function verificarIntegridadLedger() {
    const registros = db.prepare('SELECT * FROM bitacora_logs ORDER BY id ASC').all();
    let prev_hash = null;

    for (const reg of registros) {
        const contenido = `${reg.timestamp_utc}|${reg.usuario_email || ''}|${reg.accion}|${reg.detalle || ''}|${reg.ip_origen || ''}|${prev_hash || 'GENESIS'}`;
        const hash_calculado = calcularHash(contenido);

        if (hash_calculado !== reg.current_hash || reg.prev_hash !== prev_hash) {
            return { valida: false, registros: registros.length, primer_fallo_id: reg.id };
        }
        prev_hash = reg.current_hash;
    }

    return { valida: true, registros: registros.length, primer_fallo_id: null };
}

module.exports = { registrarLog, verificarIntegridadLedger };
