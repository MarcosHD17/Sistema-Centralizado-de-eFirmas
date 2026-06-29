// ============================================================
// Versión: v2.2.0
// Archivo: src/routes/bitacora.js
// Descripción: Endpoints de consulta de la bitácora de auditoría
// ledger-chain inmutable y verificación de integridad (CU-04 v1.1).
// GET  /api/bitacora              → Listar registros con filtros y paginación
// GET  /api/bitacora/integridad   → Verificar integridad del ledger completo
// ============================================================

'use strict';

const express = require('express');
const db      = require('../db/database');
const { autenticar, requerirRol } = require('../middleware/auth');
const { verificarIntegridadLedger } = require('../utils/ledger');

const router = express.Router();

// ─────────────────────────────────────────────────
// GET /api/bitacora
// Consulta paginada de la bitácora con filtros opcionales
// Solo accesible para admin y supervisor
// ─────────────────────────────────────────────────
router.get('/', autenticar, requerirRol('admin', 'supervisor'), (req, res) => {
    const {
        pagina  = 1,
        limite  = 50,
        accion,
        usuario_email,
        desde,   // timestamp unix o fecha YYYY-MM-DD
        hasta
    } = req.query;

    const offset = (parseInt(pagina) - 1) * parseInt(limite);

    let query = 'SELECT * FROM bitacora_logs WHERE 1=1';
    const params = [];

    if (accion) {
        query += ' AND accion LIKE ?';
        params.push(`%${accion}%`);
    }
    if (usuario_email) {
        query += ' AND usuario_email LIKE ?';
        params.push(`%${usuario_email}%`);
    }
    if (desde) {
        const ts = isNaN(desde) ? Math.floor(new Date(desde).getTime() / 1000) : parseInt(desde);
        query += ' AND timestamp_utc >= ?';
        params.push(ts);
    }
    if (hasta) {
        const ts = isNaN(hasta) ? Math.floor(new Date(hasta + 'T23:59:59Z').getTime() / 1000) : parseInt(hasta);
        query += ' AND timestamp_utc <= ?';
        params.push(ts);
    }

    // Contar total de registros para paginación
    const totalQuery = query.replace('SELECT *', 'SELECT COUNT(*) AS total');
    const total = db.prepare(totalQuery).get(...params).total;

    query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limite), offset);

    const registros = db.prepare(query).all(...params);

    // Convertir timestamps unix a ISO 8601 para legibilidad
    const data = registros.map(r => ({
        ...r,
        timestamp_iso: new Date(r.timestamp_utc * 1000).toISOString()
    }));

    res.json({
        total,
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        paginas_totales: Math.ceil(total / parseInt(limite)),
        data
    });
});

// ─────────────────────────────────────────────────
// GET /api/bitacora/integridad
// Verifica la cadena SHA-256 del ledger completo.
// Detecta cualquier modificación a los registros de la BD.
// Solo accesible para admin.
// ─────────────────────────────────────────────────
router.get('/integridad', autenticar, requerirRol('admin'), (req, res) => {
    const inicio = Date.now();
    const resultado = verificarIntegridadLedger();
    const ms = Date.now() - inicio;

    res.json({
        ...resultado,
        tiempo_verificacion_ms: ms,
        mensaje: resultado.valida
            ? `✓ La bitácora es íntegra. ${resultado.registros} registros verificados correctamente.`
            : `⚠ Se detectó una alteración en el registro ID ${resultado.primer_fallo_id}. La cadena está rota.`
    });
});

module.exports = router;
