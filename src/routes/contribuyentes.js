// ============================================================
// Versión: v2.2.0
// Archivo: src/routes/contribuyentes.js
// Descripción: CRUD completo de expedientes de contribuyentes.
// GET    /api/contribuyentes          → Listar (con filtros y paginación)
// POST   /api/contribuyentes          → Registrar nuevo expediente (CU-01 v1.1)
// GET    /api/contribuyentes/:rfc     → Obtener expediente por RFC
// PUT    /api/contribuyentes/:rfc     → Renovar certificado (CU-01b)
// DELETE /api/contribuyentes/:rfc     → Dar de baja (soft-delete)
// POST   /api/contribuyentes/:rfc/key → Consultar contraseña cifrada (CU-04, límite 10/día)
// GET    /api/dashboard/kpis          → KPIs del tablero ejecutivo
// ============================================================

'use strict';

const express = require('express');
const db = require('../db/database');
const { autenticar, requerirRol, obtenerIP } = require('../middleware/auth');
const { registrarLog } = require('../utils/ledger');
const { calcularEstatus } = require('../utils/semaforo');
require('dotenv').config();

const router = express.Router();

// ─────────────────────────────────────────────────
// GET /api/contribuyentes
// Lista todos los contribuyentes con filtros opcionales
// ─────────────────────────────────────────────────
router.get('/', autenticar, (req, res) => {
    const { estatus, rfc, pagina = 1, limite = 20 } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(limite);

    let query = `
        SELECT c.*, u.nombre AS responsable_nombre
        FROM contribuyentes c
        LEFT JOIN usuarios u ON c.responsable_id = u.id
        WHERE 1=1
    `;
    const params = [];

    // Los operadores solo ven sus propios contribuyentes
    if (req.user.rol === 'operador') {
        query += ' AND c.responsable_id = ?';
        params.push(req.user.id);
    }

    if (estatus) { query += ' AND c.estatus = ?'; params.push(estatus); }
    if (rfc)     { query += ' AND c.rfc LIKE ?';  params.push(`%${rfc}%`); }

    query += ' ORDER BY c.fecha_vencimiento ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limite), offset);

    const contribuyentes = db.prepare(query).all(...params);

    // Actualizar estatus al vuelo para mayor precisión
    const config = db.prepare('SELECT * FROM alertas_config WHERE id = 1').get() || {};
    const resultado = contribuyentes.map(c => {
        const { dias_restantes, estatus: est, color } = calcularEstatus(c.fecha_vencimiento, config);
        return { ...c, dias_restantes, estatus: est, color_semaforo: color };
    });

    res.json({ data: resultado, pagina: parseInt(pagina), limite: parseInt(limite) });
});

// ─────────────────────────────────────────────────
// POST /api/contribuyentes
// Registrar nuevo expediente (CU-01 v1.1)
// Verifica RFC duplicado antes de guardar
// ─────────────────────────────────────────────────
router.post('/', autenticar, requerirRol('admin', 'supervisor', 'operador'), (req, res) => {
    const {
        rfc, razon_social, email_contacto, telefono_contacto,
        fecha_emision, fecha_vencimiento,
        key_payload_cifrado,  // JSON cifrado en el cliente (AES-GCM-256)
        cer_numero_serie, cer_emisor
    } = req.body;

    // Validaciones básicas
    if (!rfc || !razon_social || !fecha_emision || !fecha_vencimiento) {
        return res.status(400).json({ error: 'RFC, razón social, fecha de emisión y vencimiento son requeridos.' });
    }

    // Validación de formato RFC mexicano
    const rfcRegex = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
    if (!rfcRegex.test(rfc.toUpperCase())) {
        return res.status(400).json({ error: 'Formato de RFC inválido.' });
    }

    // Verificar duplicidad de RFC (CU-01 v1.1)
    const existente = db.prepare('SELECT id FROM contribuyentes WHERE rfc = ?').get(rfc.toUpperCase());
    if (existente) {
        return res.status(409).json({
            error: 'RFC duplicado. Este contribuyente ya tiene un expediente registrado.',
            codigo: 'RFC_DUPLICADO',
            sugerencia: 'Use el endpoint de renovación PUT /api/contribuyentes/:rfc para actualizar el certificado.'
        });
    }

    const config = db.prepare('SELECT * FROM alertas_config WHERE id = 1').get() || {};
    const { dias_restantes, estatus } = calcularEstatus(fecha_vencimiento, config);

    try {
        const resultado = db.prepare(`
            INSERT INTO contribuyentes
                (rfc, razon_social, email_contacto, telefono_contacto, fecha_emision, fecha_vencimiento,
                 key_payload_cifrado, cer_numero_serie, cer_emisor, estatus, dias_restantes, responsable_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            rfc.toUpperCase(), razon_social, email_contacto || null, telefono_contacto || null,
            fecha_emision, fecha_vencimiento,
            key_payload_cifrado || null,
            cer_numero_serie || null, cer_emisor || null,
            estatus, dias_restantes, req.user.id
        );

        registrarLog({
            usuario_id: req.user.id,
            usuario_email: req.user.email,
            accion: 'CONTRIBUYENTE_CREAR',
            detalle: `RFC: ${rfc.toUpperCase()} | Razón social: ${razon_social} | Vence: ${fecha_vencimiento} | Estatus: ${estatus}`,
            ip_origen: obtenerIP(req)
        });

        res.status(201).json({
            ok: true,
            id: resultado.lastInsertRowid,
            rfc: rfc.toUpperCase(),
            estatus, dias_restantes
        });
    } catch (err) {
        res.status(500).json({ error: 'Error al registrar el contribuyente.', detalle: err.message });
    }
});

// ─────────────────────────────────────────────────
// GET /api/contribuyentes/:rfc
// Obtener expediente completo por RFC
// ─────────────────────────────────────────────────
router.get('/:rfc', autenticar, (req, res) => {
    const rfc = req.params.rfc.toUpperCase();

    let query = `
        SELECT c.*, u.nombre AS responsable_nombre, u.email AS responsable_email
        FROM contribuyentes c
        LEFT JOIN usuarios u ON c.responsable_id = u.id
        WHERE c.rfc = ?
    `;
    const params = [rfc];

    // Operador solo puede ver sus propios contribuyentes
    if (req.user.rol === 'operador') {
        query += ' AND c.responsable_id = ?';
        params.push(req.user.id);
    }

    const contribuyente = db.prepare(query).get(...params);

    if (!contribuyente) {
        return res.status(404).json({ error: `Contribuyente con RFC ${rfc} no encontrado.` });
    }

    // NO incluir key_payload_cifrado en esta respuesta por seguridad
    const { key_payload_cifrado, ...datosPublicos } = contribuyente;
    const config = db.prepare('SELECT * FROM alertas_config WHERE id = 1').get() || {};
    const { dias_restantes, estatus, color } = calcularEstatus(contribuyente.fecha_vencimiento, config);

    res.json({ ...datosPublicos, dias_restantes, estatus, color_semaforo: color });
});

// ─────────────────────────────────────────────────
// PUT /api/contribuyentes/:rfc
// Renovación de certificado (CU-01b v1.1):
// Archiva el certificado anterior en historial_renovaciones
// y actualiza el expediente con los nuevos datos
// ─────────────────────────────────────────────────
router.put('/:rfc', autenticar, requerirRol('admin', 'supervisor', 'operador'), (req, res) => {
    const rfc = req.params.rfc.toUpperCase();
    const {
        fecha_emision, fecha_vencimiento,
        key_payload_cifrado, cer_numero_serie, cer_emisor,
        email_contacto, telefono_contacto
    } = req.body;

    if (!fecha_emision || !fecha_vencimiento) {
        return res.status(400).json({ error: 'Las nuevas fechas de emisión y vencimiento son requeridas.' });
    }

    const existente = db.prepare('SELECT * FROM contribuyentes WHERE rfc = ?').get(rfc);
    if (!existente) {
        return res.status(404).json({ error: `Contribuyente con RFC ${rfc} no encontrado.` });
    }

    const renovar = db.transaction(() => {
        const ahora = Math.floor(Date.now() / 1000);

        // 1. Archivar el certificado anterior en el historial
        db.prepare(`
            INSERT INTO historial_renovaciones
                (contribuyente_id, rfc, fecha_emision_ant, fecha_vencimiento_ant, cer_numero_serie_ant, renovado_por_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(existente.id, rfc, existente.fecha_emision, existente.fecha_vencimiento,
                existente.cer_numero_serie, req.user.id);

        // 2. Calcular nuevo estatus
        const config = db.prepare('SELECT * FROM alertas_config WHERE id = 1').get() || {};
        const { dias_restantes, estatus } = calcularEstatus(fecha_vencimiento, config);

        // 3. Actualizar el expediente con los nuevos datos
        db.prepare(`
            UPDATE contribuyentes
            SET fecha_emision = ?, fecha_vencimiento = ?, key_payload_cifrado = ?,
                cer_numero_serie = ?, cer_emisor = ?, estatus = ?, dias_restantes = ?,
                email_contacto = COALESCE(?, email_contacto),
                telefono_contacto = COALESCE(?, telefono_contacto),
                actualizado_en = ?
            WHERE rfc = ?
        `).run(fecha_emision, fecha_vencimiento, key_payload_cifrado || existente.key_payload_cifrado,
               cer_numero_serie || existente.cer_numero_serie, cer_emisor || existente.cer_emisor,
               estatus, dias_restantes, email_contacto, telefono_contacto, ahora, rfc);

        return { estatus, dias_restantes };
    });

    const { estatus, dias_restantes } = renovar();

    registrarLog({
        usuario_id: req.user.id,
        usuario_email: req.user.email,
        accion: 'CONTRIBUYENTE_RENOVAR',
        detalle: `RFC: ${rfc} | Nuevo vencimiento: ${fecha_vencimiento} | Estatus: ${estatus}`,
        ip_origen: obtenerIP(req)
    });

    res.json({ ok: true, rfc, estatus, dias_restantes, message: 'Certificado renovado y archivado exitosamente.' });
});

// ─────────────────────────────────────────────────
// POST /api/contribuyentes/:rfc/key
// Consultar el payload cifrado de la clave privada (CU-04 v1.1)
// Solo Admin/Supervisor con TOTP activo. Límite: 10/día.
// NOTA: El payload retornado se descifra ÚNICAMENTE en el cliente
//       con la contraseña del usuario (nunca pasa por el servidor).
// ─────────────────────────────────────────────────
router.post('/:rfc/key', autenticar, requerirRol('admin', 'supervisor'), (req, res) => {
    const rfc = req.params.rfc.toUpperCase();
    const ip = obtenerIP(req);
    const MAX = parseInt(process.env.MAX_PASSWORD_QUERIES_PER_DAY) || 10;

    // Verificar que el usuario tenga 2FA activo (requerimiento CU-04 v1.1)
    if (!req.user.totp_activado) {
        return res.status(403).json({
            error: 'Se requiere autenticación de dos factores (2FA) para consultar claves privadas.',
            codigo: 'TOTP_REQUERIDO'
        });
    }

    // Verificar límite diario de consultas
    const hoy = new Date().toISOString().split('T')[0];
    const consultas_hoy = db.prepare(
        'SELECT COUNT(*) AS total FROM consultas_contrasena_log WHERE usuario_id = ? AND fecha_consulta = ?'
    ).get(req.user.id, hoy).total;

    if (consultas_hoy >= MAX) {
        registrarLog({
            usuario_id: req.user.id,
            usuario_email: req.user.email,
            accion: 'CONSULTA_KEY_LIMITE_EXCEDIDO',
            detalle: `Intentó consultar la clave de RFC: ${rfc}. Límite diario (${MAX}) alcanzado.`,
            ip_origen: ip
        });
        return res.status(429).json({
            error: `Límite diario de ${MAX} consultas de claves alcanzado. Intenta mañana.`,
            codigo: 'LIMITE_DIARIO_EXCEDIDO'
        });
    }

    const contribuyente = db.prepare(
        'SELECT key_payload_cifrado, razon_social FROM contribuyentes WHERE rfc = ?'
    ).get(rfc);

    if (!contribuyente) {
        return res.status(404).json({ error: `Contribuyente con RFC ${rfc} no encontrado.` });
    }

    if (!contribuyente.key_payload_cifrado) {
        return res.status(404).json({ error: 'Este contribuyente no tiene una clave privada registrada.' });
    }

    // Registrar la consulta en el log de control de límite
    db.prepare(
        'INSERT INTO consultas_contrasena_log (usuario_id, contribuyente_rfc, fecha_consulta) VALUES (?, ?, ?)'
    ).run(req.user.id, rfc, hoy);

    // Registrar en la bitácora inmutable
    registrarLog({
        usuario_id: req.user.id,
        usuario_email: req.user.email,
        accion: 'CONSULTA_KEY_PRIVADA',
        detalle: `RFC: ${rfc} | Razón social: ${contribuyente.razon_social} | Consulta ${consultas_hoy + 1}/${MAX} del día.`,
        ip_origen: ip
    });

    // Se retorna el payload cifrado — el cliente lo descifra con su contraseña
    res.json({
        rfc,
        key_payload_cifrado: contribuyente.key_payload_cifrado,
        consultas_usadas: consultas_hoy + 1,
        consultas_restantes: MAX - (consultas_hoy + 1)
    });
});

// ─────────────────────────────────────────────────
// GET /api/dashboard/kpis
// KPIs para el tablero ejecutivo
// ─────────────────────────────────────────────────
router.get('/dashboard/kpis', autenticar, (req, res) => {
    let whereClause = '';
    const params = [];

    if (req.user.rol === 'operador') {
        whereClause = 'WHERE responsable_id = ?';
        params.push(req.user.id);
    }

    const total        = db.prepare(`SELECT COUNT(*) AS n FROM contribuyentes ${whereClause}`).get(...params).n;
    const vigentes     = db.prepare(`SELECT COUNT(*) AS n FROM contribuyentes ${whereClause ? whereClause + ' AND' : 'WHERE'} estatus = 'vigente'`).get(...params).n;
    const preventivos  = db.prepare(`SELECT COUNT(*) AS n FROM contribuyentes ${whereClause ? whereClause + ' AND' : 'WHERE'} estatus = 'preventivo'`).get(...params).n;
    const criticos     = db.prepare(`SELECT COUNT(*) AS n FROM contribuyentes ${whereClause ? whereClause + ' AND' : 'WHERE'} estatus = 'critico'`).get(...params).n;
    const expirados    = db.prepare(`SELECT COUNT(*) AS n FROM contribuyentes ${whereClause ? whereClause + ' AND' : 'WHERE'} estatus = 'expirado'`).get(...params).n;

    // Próximos a vencer en los siguientes 30 días
    const proximos30d = db.prepare(`
        SELECT rfc, razon_social, fecha_vencimiento, dias_restantes, estatus
        FROM contribuyentes ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} dias_restantes BETWEEN 0 AND 30
        ORDER BY dias_restantes ASC LIMIT 5
    `).all(...params);

    res.json({
        total, vigentes, preventivos, criticos, expirados,
        proximos_a_vencer: proximos30d
    });
});

module.exports = router;
