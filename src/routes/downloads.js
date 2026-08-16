'use strict';

const express = require('express');
const db = require('../db/database');
const { hashToken } = require('../utils/token');
const { registrarLog } = require('../utils/ledger');
const { obtenerIP } = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────────
// GET /api/download/:token
// Consumo público de enlace seguro de descarga (Una sola vez)
// ─────────────────────────────────────────────────
router.get('/:token', (req, res) => {
    const { token } = req.params;
    const ip = obtenerIP(req);

    if (!token) {
        return res.status(400).json({ error: 'Token no proporcionado.' });
    }

    try {
        const tokenHash = hashToken(token);

        // Consultar el token y cruzar con contribuyentes
        const registro = db.prepare(`
            SELECT d.*, c.rfc, c.razon_social, c.key_payload_cifrado, c.cer_numero_serie
            FROM download_tokens d
            JOIN contribuyentes c ON d.contribuyente_id = c.id
            WHERE d.token_hash = ?
        `).get(tokenHash);

        if (!registro) {
            return res.status(404).json({ error: 'El enlace de descarga no existe o es inválido.' });
        }

        const ahora = new Date().toISOString().replace('T', ' ').substring(0, 19);
        
        // Validación de expiración y consumo previo
        if (registro.is_used === 1 || registro.expires_at < ahora) {
            registrarLog({
                usuario_id: null,
                usuario_email: 'SISTEMA_DESCARGAS',
                accion: 'INTENTO_DESCARGA_FALLIDO',
                detalle: `RFC: ${registro.rfc} | Tipo: ${registro.file_type} | Razón: Expirado o ya usado.`,
                ip_origen: ip
            });
            return res.status(410).json({ ok: false, error: 'El enlace de descarga ha expirado o ya ha sido utilizado.' });
        }

        // Transacción atómica de consumo
        const procesarDescarga = db.transaction(() => {
            db.prepare(`
                UPDATE download_tokens 
                SET is_used = 1, ip_descarga = ? 
                WHERE id = ?
            `).run(ip, registro.id);

            let accionLog = 'DESCARGA_DESCONOCIDA';
            if (registro.file_type === 'CER') accionLog = 'DESCARGA_CERTIFICADO_TEMPORAL';
            else if (registro.file_type === 'KEY') accionLog = 'DESCARGA_KEY_TEMPORAL';
            else if (registro.file_type === 'ZIP') accionLog = 'DESCARGA_FIEL_ZIP_COMPLETA';
            
            registrarLog({
                usuario_id: null,
                usuario_email: 'SISTEMA_DESCARGAS',
                accion: accionLog,
                detalle: `RFC: ${registro.rfc} | Archivo entregado correctamente por token de único uso.`,
                ip_origen: ip
            });
        });

        procesarDescarga();

        // Entregar el archivo correspondiente
        if (registro.file_type === 'CER') {
            res.setHeader('Content-Type', 'application/x-x509-ca-cert');
            res.setHeader('Content-Disposition', `attachment; filename="${registro.rfc}.cer"`);
            // Dado que la DB actualmente solo almacena metadatos y no el blob .cer completo, 
            // simulamos el certificado. En producción esto leería de un blob seguro.
            const cerPayload = `-----BEGIN CERTIFICATE-----\nMetadata del contribuyente:\nRFC: ${registro.rfc}\nNúmero de Serie: ${registro.cer_numero_serie || 'N/A'}\n-----END CERTIFICATE-----`;
            return res.send(cerPayload);
        } else if (registro.file_type === 'KEY') {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${registro.rfc}.key"`);
            return res.send(registro.key_payload_cifrado || '');
        } else if (registro.file_type === 'ZIP') {
            try {
                const AdmZip = require('adm-zip');
                const zip = new AdmZip();
                
                if (!registro.cer_numero_serie || !registro.key_payload_cifrado) {
                    throw new Error('Faltan archivos (CER o KEY) para construir el paquete ZIP.');
                }
                
                const cerPayload = `-----BEGIN CERTIFICATE-----\nMetadata del contribuyente:\nRFC: ${registro.rfc}\nNúmero de Serie: ${registro.cer_numero_serie}\n-----END CERTIFICATE-----`;
                zip.addFile(`${registro.rfc}.cer`, Buffer.from(cerPayload, 'utf8'));
                zip.addFile(`${registro.rfc}.key`, Buffer.from(registro.key_payload_cifrado, 'utf8'));
                
                const zipBuffer = zip.toBuffer();
                res.setHeader('Content-Type', 'application/zip');
                res.setHeader('Content-Disposition', `attachment; filename="${registro.rfc}_FIEL_COMPLETA.zip"`);
                return res.send(zipBuffer);
            } catch (zipError) {
                console.error('[Descargas] Error al construir ZIP:', zipError);
                return res.status(500).json({ error: 'Ocurrió un error al procesar el archivo ZIP.', detalle: zipError.message });
            }
        }

    } catch (err) {
        console.error('[Descargas] Error:', err.message);
        res.status(500).json({ error: 'Ocurrió un error interno al procesar el enlace de descarga.' });
    }
});

module.exports = router;
