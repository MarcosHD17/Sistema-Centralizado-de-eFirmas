// ============================================================
// Versión: v2.2.0
// Archivo: src/routes/contribuyentes.js
// Descripción: CRUD completo de expedientes de contribuyentes.
// GET    /api/contribuyentes                  → Listar (con filtros y paginación)
// POST   /api/contribuyentes                  → Registrar nuevo expediente (CU-01 v1.1)
// GET    /api/contribuyentes/dashboard/kpis    → KPIs del tablero ejecutivo (declarada antes de '/:rfc' — fix QA #1)
// GET    /api/contribuyentes/:rfc              → Obtener expediente por RFC
// PUT    /api/contribuyentes/:rfc              → Renovar certificado (CU-01b), con validación de cartera (fix QA #2)
// DELETE /api/contribuyentes/:rfc              → Dar de baja (soft-delete, admin/supervisor) [fix QA #5]
// POST   /api/contribuyentes/extraer-certificado → Leer metadatos reales del .cer (X.509) [fix QA #11]
// POST   /api/contribuyentes/:rfc/key          → Consultar contraseña cifrada (CU-04, límite 10/día)
// ============================================================

'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const { autenticar, requerirRol, obtenerIP } = require('../middleware/auth');
const { registrarLog } = require('../utils/ledger');
const { calcularEstatus } = require('../utils/semaforo');
const { encolarAlerta } = require('../utils/colaAlertas');
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
        WHERE c.activo = 1
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
// POST /api/contribuyentes/extraer-certificado
// Fix hallazgo QA #11 (parte 1/2): lee metadatos REALES del
// certificado público .cer (RFC/razón social vía subject, fechas de
// vigencia, número de serie, emisor) usando el módulo nativo 'crypto'
// de Node (crypto.X509Certificate, disponible desde Node 15.6+).
// Solo procesa el archivo .cer PÚBLICO — la contraseña y el archivo
// .key NUNCA se envían a este ni a ningún otro endpoint del backend,
// consistente con el criterio de aceptación de CU-01.
// ─────────────────────────────────────────────────
router.post('/extraer-certificado', autenticar, requerirRol('admin', 'supervisor', 'operador'), (req, res) => {
    const { cer_base64 } = req.body;

    if (!cer_base64) {
        return res.status(400).json({ error: 'Se requiere el archivo .cer codificado en base64 (campo cer_base64).' });
    }

    let x509;
    try {
        const cerBuffer = Buffer.from(cer_base64, 'base64');
        x509 = new crypto.X509Certificate(cerBuffer);
    } catch (err) {
        return res.status(400).json({
            error: 'El archivo no es un certificado X.509 válido o está corrupto.',
            codigo: 'CERTIFICADO_INVALIDO',
            detalle: err.message
        });
    }

    // El campo "subject" trae pares clave=valor (ej. "CN=..., x500UniqueIdentifier=RFC...").
    // Los CSD/e.firma del SAT suelen incluir el RFC en x500UniqueIdentifier o en el CN;
    // se intentan ambos patrones y se deja vacío si no se puede inferir con certeza,
    // para que el operador lo confirme manualmente en el formulario.
    const subject = x509.subject || '';
    const partes = Object.fromEntries(
        subject.split('\n').map(l => l.split('=').map(s => s.trim())).filter(p => p.length === 2)
    );

    const rfcDetectado = (partes['x500UniqueIdentifier'] || '').toUpperCase().match(/^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/)
        ? partes['x500UniqueIdentifier'].toUpperCase()
        : '';

    res.json({
        rfc_detectado: rfcDetectado,
        razon_social_detectada: partes['CN'] || partes['O'] || '',
        fecha_emision: x509.validFrom ? new Date(x509.validFrom).toISOString().split('T')[0] : '',
        fecha_vencimiento: x509.validTo ? new Date(x509.validTo).toISOString().split('T')[0] : '',
        cer_numero_serie: x509.serialNumber || '',
        cer_emisor: x509.issuer || '',
        requiere_confirmacion_manual: !rfcDetectado,
        mensaje: rfcDetectado
            ? 'Certificado leído correctamente. Verifica los datos antes de guardar.'
            : 'Certificado leído, pero no fue posible inferir el RFC automáticamente. Complétalo manualmente.'
    });
});

// ─────────────────────────────────────────────────
// GET /api/contribuyentes/dashboard/kpis
// KPIs para el tablero ejecutivo
// NOTA (fix QA-CRÍTICO #1): esta ruta DEBE declararse antes que
// GET '/:rfc'. Express evalúa las rutas en el orden en que se
// registran; si '/:rfc' se declara primero, intercepta cualquier
// petición a '/dashboard/kpis' interpretando 'dashboard' como si
// fuera un RFC, y el endpoint de KPIs nunca es alcanzado.
// ─────────────────────────────────────────────────
router.get('/dashboard/kpis', autenticar, (req, res) => {
    // Fix hallazgo #5: los KPIs deben excluir contribuyentes dados de baja
    let whereClause = 'WHERE activo = 1';
    const params = [];

    if (req.user.rol === 'operador') {
        whereClause += ' AND responsable_id = ?';
        params.push(req.user.id);
    }

    const total        = db.prepare(`SELECT COUNT(*) AS n FROM contribuyentes ${whereClause}`).get(...params).n;
    const vigentes     = db.prepare(`SELECT COUNT(*) AS n FROM contribuyentes ${whereClause} AND estatus = 'vigente'`).get(...params).n;
    const preventivos  = db.prepare(`SELECT COUNT(*) AS n FROM contribuyentes ${whereClause} AND estatus = 'preventivo'`).get(...params).n;
    const criticos     = db.prepare(`SELECT COUNT(*) AS n FROM contribuyentes ${whereClause} AND estatus = 'critico'`).get(...params).n;
    const expirados    = db.prepare(`SELECT COUNT(*) AS n FROM contribuyentes ${whereClause} AND estatus = 'expirado'`).get(...params).n;

    // Próximos a vencer en los siguientes 30 días
    const proximos30d = db.prepare(`
        SELECT rfc, razon_social, fecha_vencimiento, dias_restantes, estatus
        FROM contribuyentes ${whereClause}
        AND dias_restantes BETWEEN 0 AND 30
        ORDER BY dias_restantes ASC LIMIT 5
    `).all(...params);

    res.json({
        total, vigentes, preventivos, criticos, expirados,
        proximos_a_vencer: proximos30d
    });
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
        WHERE c.rfc = ? AND c.activo = 1
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

    const existente = db.prepare('SELECT * FROM contribuyentes WHERE rfc = ? AND activo = 1').get(rfc);
    if (!existente) {
        return res.status(404).json({ error: `Contribuyente con RFC ${rfc} no encontrado.` });
    }

    // Fix QA-CRÍTICO #2 (fuga de RBAC): a diferencia de GET /:rfc, este
    // endpoint no validaba que un operador solo pueda renovar contribuyentes
    // de su propia cartera. Se aplica el mismo criterio de aislamiento que
    // ya usa el listado y la consulta individual (responsable_id === req.user.id).
    if (req.user.rol === 'operador' && existente.responsable_id !== req.user.id) {
        return res.status(403).json({
            error: 'No tienes permiso para renovar un contribuyente fuera de tu cartera asignada.',
            codigo: 'FUERA_DE_CARTERA'
        });
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
// DELETE /api/contribuyentes/:rfc
// Dar de baja un expediente (soft-delete, CU-01c) — fix hallazgo QA #5.
// No se borra físicamente el registro (se conserva para auditoría e
// historial_renovaciones); solo se marca activo = 0 y desaparece de
// los listados normales. Restringido a admin/supervisor: es una
// acción destructiva que no debe quedar en manos de operadores.
// ─────────────────────────────────────────────────
router.delete('/:rfc', autenticar, requerirRol('admin', 'supervisor'), (req, res) => {
    const rfc = req.params.rfc.toUpperCase();

    const existente = db.prepare('SELECT * FROM contribuyentes WHERE rfc = ? AND activo = 1').get(rfc);
    if (!existente) {
        return res.status(404).json({ error: `Contribuyente con RFC ${rfc} no encontrado.` });
    }

    db.prepare(
        'UPDATE contribuyentes SET activo = 0, actualizado_en = ? WHERE rfc = ?'
    ).run(Math.floor(Date.now() / 1000), rfc);

    registrarLog({
        usuario_id: req.user.id,
        usuario_email: req.user.email,
        accion: 'CONTRIBUYENTE_BAJA',
        detalle: `RFC: ${rfc} | Razón social: ${existente.razon_social} | Dado de baja (soft-delete).`,
        ip_origen: obtenerIP(req)
    });

    res.json({ ok: true, rfc, message: 'Contribuyente dado de baja exitosamente.' });
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

        // Fix hallazgo QA #16: antes solo quedaba en la bitácora; ahora se
        // notifica proactivamente a supervisores/admins activos en vez de
        // depender de que alguien revise los logs manualmente.
        try {
            const responsables = db.prepare(
                "SELECT email FROM usuarios WHERE rol IN ('admin', 'supervisor') AND estatus = 'activo'"
            ).all();
            for (const r of responsables) {
                encolarAlerta({
                    tipo: 'correo',
                    destinatario: r.email,
                    asunto: 'Límite diario de consultas de clave excedido',
                    mensaje: `El usuario ${req.user.email} alcanzó el límite diario de ${MAX} consultas de claves privadas (último intento sobre RFC ${rfc}). Revisa la bitácora de auditoría.`
                });
            }
        } catch (e) {
            console.error('[Alertas] No fue posible encolar la notificación a supervisores:', e.message);
        }

        return res.status(429).json({
            error: `Límite diario de ${MAX} consultas de claves alcanzado. Intenta mañana.`,
            codigo: 'LIMITE_DIARIO_EXCEDIDO'
        });
    }

    const contribuyente = db.prepare(
        'SELECT key_payload_cifrado, razon_social FROM contribuyentes WHERE rfc = ? AND activo = 1'
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
// POST /api/contribuyentes/:rfc/download-token
// Generar un token temporal para descarga segura de archivos (CER o KEY)
// ─────────────────────────────────────────────────
router.post('/:rfc/download-token', autenticar, requerirRol('admin', 'supervisor', 'operador'), async (req, res) => {
    const rfc = req.params.rfc.toUpperCase();
    const { file_type, ttl_minutes = 60, email_destino, whatsappDestino } = req.body;
    const { generarTokenSeguro, hashToken, calcularExpiracion } = require('../utils/token');
    const { enviarEnlaceTemporal } = require('../services/emailService');
    const { enviarEnlaceTemporalWhatsApp } = require('../services/whatsappService');

    if (!file_type || !['CER', 'KEY', 'ZIP'].includes(file_type.toUpperCase())) {
        return res.status(400).json({ error: 'file_type debe ser CER, KEY o ZIP.' });
    }

    const ttl = parseInt(ttl_minutes);
    if (isNaN(ttl) || ttl <= 0 || ttl > 1440) {
        return res.status(400).json({ error: 'ttl_minutes debe ser un número entre 1 y 1440 (24 horas).' });
    }

    const contribuyente = db.prepare('SELECT id, razon_social, cer_numero_serie, key_payload_cifrado FROM contribuyentes WHERE rfc = ? AND activo = 1').get(rfc);
    if (!contribuyente) {
        return res.status(404).json({ error: `Contribuyente con RFC ${rfc} no encontrado.` });
    }

    if (file_type.toUpperCase() === 'ZIP') {
        if (!contribuyente.cer_numero_serie || !contribuyente.key_payload_cifrado) {
            return res.status(400).json({ error: 'El contribuyente no cuenta con ambos archivos (.cer y .key) registrados para generar un paquete ZIP' });
        }
    }

    try {
        const tokenPlano = generarTokenSeguro();
        const tokenHash = hashToken(tokenPlano);
        const fechaExpiracion = calcularExpiracion(ttl);
        const ip_creacion = obtenerIP(req);

        db.prepare(`
            INSERT INTO download_tokens 
            (token_hash, contribuyente_id, file_type, expires_at, created_by, ip_creacion)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(tokenHash, contribuyente.id, file_type.toUpperCase(), fechaExpiracion, req.user.id, ip_creacion);

        registrarLog({
            usuario_id: req.user.id,
            usuario_email: req.user.email,
            accion: 'GENERACION_ENLACE_DESCARGA',
            detalle: `RFC: ${rfc} | Archivo: ${file_type.toUpperCase()} | TTL: ${ttl} min | Expira: ${fechaExpiracion}`,
            ip_origen: ip_creacion
        });

        const downloadUrl = `/api/download/${tokenPlano}`;
        let previewUrl = null;

        // Si se provee un email de destino, enviar el correo de notificación
        if (email_destino) {
            const emailResult = await enviarEnlaceTemporal({
                emailDestino: email_destino,
                rfc: rfc,
                razonSocial: contribuyente.razon_social,
                fileType: file_type.toUpperCase(),
                downloadUrl: req.protocol + '://' + req.get('host') + downloadUrl,
                expiresAt: fechaExpiracion
            });

            if (emailResult.success) {
                registrarLog({
                    usuario_id: req.user.id,
                    usuario_email: req.user.email,
                    accion: 'ENVIO_CORREO_ENLACE_TEMPORAL',
                    detalle: `Enviado a: ${email_destino} | RFC: ${rfc} | Archivo: ${file_type.toUpperCase()}`,
                    ip_origen: ip_creacion
                });
                previewUrl = emailResult.previewUrl;
            } else {
                console.error(`[Token Correo] Falló el envío de correo a ${email_destino}: ${emailResult.error}`);
            }
        }

    const whatsappDestinoRaw = req.body.whatsappDestino || req.body.whatsapp_destino || req.body.whatsapp || req.body.whatsappNumero || req.body.whatsapp_numero;
        let whatsappResultado = null;
        if (whatsappDestinoRaw) {
            let limpio = String(whatsappDestinoRaw).replace(/[\s\-\(\)]/g, '').trim();
            if (/^\d{10}$/.test(limpio)) limpio = `+521${limpio}`;
            else if (/^\+52\d{10}$/.test(limpio)) limpio = limpio.replace('+52', '+521');
            else if (/^52\d{10}$/.test(limpio)) limpio = `+521${limpio.slice(2)}`;
            else if (!limpio.startsWith('+')) limpio = `+${limpio}`;

            const whatsappDestinoNorm = limpio;

            const wappResult = await enviarEnlaceTemporalWhatsApp({
                numeroDestino: whatsappDestinoNorm,
                rfc,
                razonSocial: contribuyente.razon_social,
                fileType: file_type.toUpperCase(),
                downloadUrl: req.protocol + '://' + req.get('host') + downloadUrl,
                expiresAt: fechaExpiracion
            });
            whatsappResultado = wappResult;

            registrarLog({
                usuario_id: req.user.id,
                usuario_email: req.user.email,
                accion: wappResult.success ? 'ENVIO_WHATSAPP_ENLACE_TEMPORAL' : 'ENVIO_WHATSAPP_ENLACE_FALLO',
                detalle: `RFC: ${rfc} | Destino: ${whatsappDestinoNorm} | Modo: ${wappResult.modo_envio}${wappResult.sid ? ' | SID: ' + wappResult.sid : ''}${wappResult.error ? ' | Error: ' + wappResult.error : ''}`,
                ip_origen: ip_creacion
            });

            if (!wappResult.success) {
                console.error(`[Token WhatsApp] Falló el envío a ${whatsappDestinoNorm}: ${wappResult.error}`);
            }
        }

        res.status(201).json({
            ok: true,
            mensaje: 'Enlace temporal creado exitosamente',
            download_url: downloadUrl,
            expires_at: fechaExpiracion,
            file_type: file_type.toUpperCase(),
            preview_url: previewUrl,
            whatsapp_resultado: whatsappResultado
        });
    } catch (err) {
        console.error(`[Token ZIP] Error interno al generar token para ${rfc}:`, err);
        res.status(500).json({ error: 'Error al generar el token de descarga.', detalle: err.message });
    }
});

module.exports = router;
