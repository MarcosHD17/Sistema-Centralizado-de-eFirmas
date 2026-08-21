'use strict';

const express = require('express');
const db = require('../db/database');
const { autenticar, requerirRol, obtenerIP } = require('../middleware/auth');
const { registrarLog } = require('../utils/ledger');
const { generarTokenSeguro, hashToken, calcularExpiracion } = require('../utils/token');
const { enviarEnlaceTemporal } = require('../services/emailService');

const router = express.Router();

// ─────────────────────────────────────────────────
// GET /api/solicitudes
// Listar solicitudes de renovación
// ─────────────────────────────────────────────────
router.get('/', autenticar, (req, res) => {
    try {
        const solicitudes = db.prepare(`
            SELECT s.*, c.razon_social 
            FROM solicitudes_renovacion s
            LEFT JOIN contribuyentes c ON s.rfc = c.rfc
            ORDER BY s.estado = 'PENDIENTE' DESC, s.created_at DESC
        `).all();

        res.json({ data: solicitudes });
    } catch (err) {
        console.error('[Solicitudes] Error al listar:', err);
        res.status(500).json({ error: 'Error interno al listar solicitudes.' });
    }
});

// ─────────────────────────────────────────────────
// POST /api/solicitudes/:id/aprobar
// Aprobar solicitud, generar token y enviarlo
// ─────────────────────────────────────────────────
router.post('/:id/aprobar', autenticar, requerirRol('admin', 'supervisor'), async (req, res) => {
    const { id } = req.params;
    const ip = obtenerIP(req);

    try {
        const solicitud = db.prepare('SELECT * FROM solicitudes_renovacion WHERE id = ?').get(id);
        if (!solicitud) {
            return res.status(404).json({ error: 'Solicitud no encontrada.' });
        }
        if (solicitud.estado !== 'PENDIENTE') {
            return res.status(400).json({ error: 'La solicitud ya ha sido procesada.' });
        }

        const contribuyente = db.prepare('SELECT id, razon_social, cer_numero_serie, key_payload_cifrado FROM contribuyentes WHERE rfc = ? AND activo = 1').get(solicitud.rfc);
        if (!contribuyente) {
            return res.status(404).json({ error: 'El contribuyente asociado a la solicitud no existe o está inactivo.' });
        }

        // Determinar tipo de archivo a enviar (ZIP si tiene ambos, CER si no)
        let file_type = 'CER';
        if (contribuyente.cer_numero_serie && contribuyente.key_payload_cifrado) {
            file_type = 'ZIP';
        }

        const ttl = 1440; // 24 horas para reexpedición
        const tokenPlano = generarTokenSeguro();
        const tokenHash = hashToken(tokenPlano);
        const fechaExpiracion = calcularExpiracion(ttl);

        // Transacción atómica
        const procesar = db.transaction(() => {
            // 1. Insertar token
            db.prepare(`
                INSERT INTO download_tokens 
                (token_hash, contribuyente_id, file_type, expires_at, created_by, ip_creacion)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(tokenHash, contribuyente.id, file_type, fechaExpiracion, req.user.id, ip);

            // 2. Actualizar solicitud
            db.prepare(`
                UPDATE solicitudes_renovacion 
                SET estado = 'APROBADA', resolved_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `).run(id);
        });

        procesar();

        const downloadUrl = `/api/download/${tokenPlano}`;

        // 3. Enviar correo
        const emailResult = await enviarEnlaceTemporal({
            emailDestino: solicitud.email_solicitante,
            rfc: solicitud.rfc,
            razonSocial: contribuyente.razon_social,
            fileType: file_type,
            downloadUrl: req.protocol + '://' + req.get('host') + downloadUrl,
            expiresAt: fechaExpiracion
        });

        if (!emailResult.success) {
            console.error('[Solicitudes] Error enviando correo:', emailResult.error);
        } else {
            console.log('📧 Correo de renovación enviado a:', solicitud.email_solicitante);
            if (emailResult.previewUrl) console.log('🔗 URL de previsualización (Ethereal):', emailResult.previewUrl);
        }

        // 4. Registrar auditoría
        registrarLog({
            usuario_id: req.user.id,
            usuario_email: req.user.email,
            accion: 'SOLICITUD_RENOVACION_APROBADA',
            detalle: `RFC: ${solicitud.rfc} | Archivo: ${file_type} | Solicitante: ${solicitud.email_solicitante}`,
            ip_origen: ip
        });

        res.json({ 
            ok: true, 
            mensaje: 'Solicitud aprobada y token enviado correctamente.',
            previewUrl: emailResult.previewUrl || null 
        });
    } catch (err) {
        console.error('[Solicitudes] Error al aprobar:', err);
        res.status(500).json({ error: 'Error interno al procesar la aprobación.' });
    }
});

// ─────────────────────────────────────────────────
// POST /api/solicitudes/:id/rechazar
// Rechazar solicitud
// ─────────────────────────────────────────────────
router.post('/:id/rechazar', autenticar, requerirRol('admin', 'supervisor'), (req, res) => {
    const { id } = req.params;
    const ip = obtenerIP(req);

    try {
        const solicitud = db.prepare('SELECT * FROM solicitudes_renovacion WHERE id = ?').get(id);
        if (!solicitud) {
            return res.status(404).json({ error: 'Solicitud no encontrada.' });
        }
        if (solicitud.estado !== 'PENDIENTE') {
            return res.status(400).json({ error: 'La solicitud ya ha sido procesada.' });
        }

        db.prepare(`
            UPDATE solicitudes_renovacion 
            SET estado = 'RECHAZADA', resolved_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `).run(id);

        registrarLog({
            usuario_id: req.user.id,
            usuario_email: req.user.email,
            accion: 'SOLICITUD_RENOVACION_RECHAZADA',
            detalle: `RFC: ${solicitud.rfc} | Solicitante: ${solicitud.email_solicitante}`,
            ip_origen: ip
        });

        res.json({ ok: true, mensaje: 'Solicitud rechazada.' });
    } catch (err) {
        console.error('[Solicitudes] Error al rechazar:', err);
        res.status(500).json({ error: 'Error interno al procesar el rechazo.' });
    }
});

module.exports = router;
