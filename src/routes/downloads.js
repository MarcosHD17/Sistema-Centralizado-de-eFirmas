'use strict';

const express = require('express');
const db = require('../db/database');
const { hashToken } = require('../utils/token');
const { registrarLog } = require('../utils/ledger');
const { obtenerIP } = require('../middleware/auth');

const router = express.Router();

function renderErrorPage(title, icon, message) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SAT Control Manager - ${title}</title>
    <style>
        :root {
            --bg-dark: #0f172a;
            --bg-card: #1e293b;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --accent: #3b82f6;
            --accent-hover: #2563eb;
            --border-color: #334155;
        }
        body {
            margin: 0;
            padding: 0;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            background-color: var(--bg-dark);
            color: var(--text-main);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        .container {
            background-color: var(--bg-card);
            padding: 3rem 2.5rem;
            border-radius: 1rem;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
            max-width: 26rem;
            width: 100%;
            text-align: center;
            margin: 1rem;
            border: 1px solid var(--border-color);
        }
        .icon {
            font-size: 4.5rem;
            margin-bottom: 1.5rem;
            animation: fadeInScale 0.5s ease-out forwards;
        }
        h1 {
            font-size: 1.5rem;
            font-weight: 600;
            margin: 0 0 1rem 0;
            letter-spacing: -0.025em;
        }
        p {
            color: var(--text-muted);
            line-height: 1.6;
            margin: 0 0 2rem 0;
            font-size: 0.95rem;
        }
        .btn {
            display: inline-block;
            background-color: var(--accent);
            color: white;
            text-decoration: none;
            padding: 0.875rem 1.5rem;
            border-radius: 0.5rem;
            font-weight: 500;
            transition: all 0.2s ease;
            border: none;
            cursor: pointer;
            box-sizing: border-box;
            width: 100%;
        }
        .btn:hover {
            background-color: var(--accent-hover);
            transform: translateY(-1px);
        }
        @keyframes fadeInScale {
            0% { opacity: 0; transform: scale(0.9); }
            100% { opacity: 1; transform: scale(1); }
        }
        .modal {
            display: none;
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(4px);
            align-items: center; justify-content: center;
        }
        .modal.active { display: flex; }
        .modal-content {
            background: var(--bg-card);
            padding: 2rem;
            border-radius: 1rem;
            width: 90%; max-width: 400px;
            border: 1px solid var(--border-color);
            text-align: left;
        }
        .form-group { margin-bottom: 1rem; }
        .form-group label { display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.9rem; }
        .form-group input, .form-group textarea {
            width: 100%; padding: 0.75rem; border-radius: 0.5rem;
            background: rgba(0,0,0,0.2); border: 1px solid var(--border-color);
            color: #fff; box-sizing: border-box;
            font-family: inherit;
        }
        .form-actions { display: flex; gap: 1rem; margin-top: 1.5rem; }
        .btn-secondary { background: var(--border-color); }
        .btn-secondary:hover { background: #475569; }
    </style>
</head>
<body>
    <div class="container" id="mainContainer">
        <div class="icon">${icon}</div>
        <h1>${title}</h1>
        <p>${message}</p>
        <button class="btn" onclick="document.getElementById('solicitudModal').classList.add('active')">Solicitar Nuevo Enlace</button>
    </div>

    <div class="modal" id="solicitudModal">
        <div class="modal-content">
            <h2 style="margin-top: 0; margin-bottom: 1.5rem; font-size: 1.25rem;">Solicitar Renovación</h2>
            <form id="solicitudForm" onsubmit="enviarSolicitud(event)">
                <div class="form-group">
                    <label>RFC</label>
                    <input type="text" id="reqRfc" required placeholder="Ej. ALFA920101XYZ">
                </div>
                <div class="form-group">
                    <label>Correo Electrónico</label>
                    <input type="email" id="reqEmail" required placeholder="tu@correo.com">
                </div>
                <div class="form-group">
                    <label>Motivo (Opcional)</label>
                    <textarea id="reqMotivo" rows="3" placeholder="Breve motivo de reexpedición..."></textarea>
                </div>
                <div id="reqFeedback" style="color: var(--accent); font-size: 0.9rem; margin-bottom: 1rem; display: none;"></div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('solicitudModal').classList.remove('active')">Cancelar</button>
                    <button type="submit" class="btn" id="btnSubmitReq">Enviar Solicitud</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        async function enviarSolicitud(e) {
            e.preventDefault();
            const rfc = document.getElementById('reqRfc').value;
            const email = document.getElementById('reqEmail').value;
            const motivo = document.getElementById('reqMotivo').value;
            const btn = document.getElementById('btnSubmitReq');
            const feedback = document.getElementById('reqFeedback');
            
            btn.disabled = true;
            btn.innerText = 'Enviando...';
            
            try {
                const response = await fetch('/api/download/solicitar-renovacion', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rfc, email, motivo })
                });
                const data = await response.json();
                
                feedback.style.display = 'block';
                feedback.innerText = data.mensaje || data.error;
                
                if (response.ok) {
                    feedback.style.color = 'var(--success)';
                    setTimeout(() => {
                        document.getElementById('solicitudModal').classList.remove('active');
                        document.getElementById('solicitudForm').reset();
                        feedback.style.display = 'none';
                        btn.disabled = false;
                        btn.innerText = 'Enviar Solicitud';
                    }, 2500);
                } else {
                    feedback.style.color = 'red';
                    btn.disabled = false;
                    btn.innerText = 'Enviar Solicitud';
                }
            } catch (err) {
                feedback.style.display = 'block';
                feedback.style.color = 'red';
                feedback.innerText = 'Error de conexión.';
                btn.disabled = false;
                btn.innerText = 'Enviar Solicitud';
            }
        }
    </script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────
// POST /api/download/solicitar-renovacion
// Solicitud pública de reexpedición
// ─────────────────────────────────────────────────
router.post('/solicitar-renovacion', express.json(), (req, res) => {
    const { rfc, email, motivo } = req.body;
    const ip = obtenerIP(req);

    if (!rfc || !email) {
        return res.status(400).json({ error: 'RFC y correo son obligatorios.' });
    }

    try {
        const contribuyente = db.prepare('SELECT id FROM contribuyentes WHERE rfc = ? AND activo = 1').get(rfc.toUpperCase());
        if (!contribuyente) {
            // No revelamos si existe o no por seguridad
            return res.json({ ok: true, mensaje: 'Solicitud recibida. Si el RFC es válido, será procesada pronto.' });
        }

        db.prepare(`
            INSERT INTO solicitudes_renovacion (rfc, email_solicitante, motivo)
            VALUES (?, ?, ?)
        `).run(rfc.toUpperCase(), email, motivo || null);

        registrarLog({
            usuario_id: null,
            usuario_email: 'SISTEMA_PUBLICO',
            accion: 'SOLICITUD_RENOVACION_CREADA',
            detalle: `RFC: ${rfc.toUpperCase()} | Solicitante: ${email}`,
            ip_origen: ip
        });

        res.json({ ok: true, mensaje: 'Solicitud enviada correctamente. Te notificaremos al correo.' });
    } catch (err) {
        console.error('[Descargas] Error al solicitar renovación:', err);
        res.status(500).json({ error: 'Error interno al procesar la solicitud.' });
    }
});

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
            return res.status(404).send(renderErrorPage('Enlace no encontrado', '🔍', 'El enlace de descarga no existe o es inválido.'));
        }

        const ahora = new Date().toISOString().replace('T', ' ').substring(0, 19);
        
        // Validación de consumo previo
        if (registro.is_used === 1) {
            registrarLog({
                usuario_id: null,
                usuario_email: 'SISTEMA_DESCARGAS',
                accion: 'ENLACE_YA_USADO',
                detalle: `RFC: ${registro.rfc} | Tipo: ${registro.file_type} | Intento de descarga bloqueado.`,
                ip_origen: ip
            });
            return res.status(410).send(renderErrorPage('Enlace utilizado', '🔒', 'Este enlace era de un solo uso y ya ha sido descargado previamente por razones de seguridad.'));
        }

        // Validación de expiración
        if (registro.expires_at < ahora) {
            registrarLog({
                usuario_id: null,
                usuario_email: 'SISTEMA_DESCARGAS',
                accion: 'ENLACE_EXPIRADO',
                detalle: `RFC: ${registro.rfc} | Tipo: ${registro.file_type} | El tiempo de vigencia del token caducó.`,
                ip_origen: ip
            });
            return res.status(410).send(renderErrorPage('Tiempo agotado', '⏳', 'El tiempo de vigencia de este enlace ha expirado.'));
        }

        // Transacción atómica de consumo
        const procesarDescarga = db.transaction(() => {
            const updateResult = db.prepare(`
                UPDATE download_tokens 
                SET is_used = 1, ip_descarga = ? 
                WHERE id = ? AND is_used = 0
            `).run(ip, registro.id);

            if (updateResult.changes === 0) {
                throw new Error('ALREADY_USED_CONCURRENT');
            }

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

        try {
            procesarDescarga();
        } catch (e) {
            if (e.message === 'ALREADY_USED_CONCURRENT') {
                registrarLog({
                    usuario_id: null,
                    usuario_email: 'SISTEMA_DESCARGAS',
                    accion: 'ENLACE_YA_USADO',
                    detalle: `RFC: ${registro.rfc} | Tipo: ${registro.file_type} | Intento de segunda descarga concurrente bloqueado.`,
                    ip_origen: ip
                });
                return res.status(410).send(renderErrorPage('Enlace utilizado', '🔒', 'Este enlace era de un solo uso y ya ha sido descargado previamente por razones de seguridad.'));
            }
            throw e;
        }

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
