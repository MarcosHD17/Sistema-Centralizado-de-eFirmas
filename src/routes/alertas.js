// ============================================================
// Versión: v2.2.0
// Archivo: src/routes/alertas.js
// Descripción: Rutas de configuración y motor de alertas.
// GET  /api/alertas/config      → Obtener configuración de alertas y canales
// PUT  /api/alertas/config      → Actualizar configuración (admin/supervisor)
// POST /api/alertas/probar      → Envío manual de alerta de prueba (SMTP/WhatsApp) (CU-02b)
// POST /api/alertas/recalcular  → Forzar recálculo semafórico UTC (cronjob manual) (CU-02)
// ============================================================

'use strict';

const express = require('express');
const db      = require('../db/database');
const { autenticar, requerirRol, obtenerIP } = require('../middleware/auth');
const { registrarLog } = require('../utils/ledger');
const { recalcularTodos } = require('../utils/semaforo');
const { cifrar } = require('../utils/crypto');
const { encolarAlerta, procesarColaAlertas } = require('../utils/colaAlertas');

const router = express.Router();

// ─────────────────────────────────────────────────
// GET /api/alertas/config
// Obtiene los umbrales de alerta y canales configurados
// ─────────────────────────────────────────────────
router.get('/config', autenticar, (req, res) => {
    const config = db.prepare('SELECT * FROM alertas_config WHERE id = 1').get();
    
    if (!config) {
        return res.status(404).json({ error: 'Configuración de alertas no encontrada.' });
    }

    // Ocultar contraseña del SMTP y token de WhatsApp en la respuesta por seguridad
    const respuestaSegura = {
        ...config,
        correo_smtp_pass_configurado: !!config.correo_smtp_pass_cifrado,
        whatsapp_api_token_configurado: !!config.whatsapp_api_token_cifrado
    };
    delete respuestaSegura.correo_smtp_pass_cifrado;
    delete respuestaSegura.whatsapp_api_token_cifrado;

    res.json(respuestaSegura);
});

// ─────────────────────────────────────────────────
// PUT /api/alertas/config
// Actualizar umbrales y credenciales de alertas (admin/supervisor)
// ─────────────────────────────────────────────────
router.put('/config', autenticar, requerirRol('admin', 'supervisor'), (req, res) => {
    const {
        umbral_critico_dias,
        umbral_preventivo_dias,
        correo_activo,
        whatsapp_activo,
        correo_smtp_host,
        correo_smtp_puerto,
        correo_smtp_usuario,
        correo_smtp_pass,         // Se envía en texto plano en la petición HTTPS
        whatsapp_api_token,       // Se envía en texto plano en la petición HTTPS
        whatsapp_numero_origen,
        max_reintentos
    } = req.body;

    const ahora = Math.floor(Date.now() / 1000);
    const existente = db.prepare('SELECT * FROM alertas_config WHERE id = 1').get();

    // Validar umbrales lógicos (Crítico < Preventivo)
    if (umbral_critico_dias !== undefined && umbral_preventivo_dias !== undefined) {
        if (parseInt(umbral_critico_dias) >= parseInt(umbral_preventivo_dias)) {
            return res.status(400).json({
                error: 'El umbral crítico (rojo) debe ser menor que el umbral preventivo (amarillo).'
            });
        }
    }

    // Fix QA-ALTA (alertas.js): cifrado simétrico REAL con AES-256-GCM
    // (src/utils/crypto.js) usando ENCRYPTION_KEY del entorno del servidor,
    // en vez de la codificación Base64 anterior (que era trivialmente reversible).
    let passCifrado, tokenCifrado;
    try {
        passCifrado = correo_smtp_pass
            ? cifrar(correo_smtp_pass)
            : existente.correo_smtp_pass_cifrado;

        tokenCifrado = whatsapp_api_token
            ? cifrar(whatsapp_api_token)
            : existente.whatsapp_api_token_cifrado;
    } catch (err) {
        // Fallo típico: ENCRYPTION_KEY ausente o mal formada en el .env
        return res.status(500).json({
            error: 'No fue posible cifrar las credenciales proporcionadas.',
            detalle: err.message
        });
    }

    try {
        db.prepare(`
            UPDATE alertas_config
            SET umbral_critico_dias = COALESCE(?, umbral_critico_dias),
                umbral_preventivo_dias = COALESCE(?, umbral_preventivo_dias),
                correo_activo = COALESCE(?, correo_activo),
                whatsapp_activo = COALESCE(?, whatsapp_activo),
                correo_smtp_host = COALESCE(?, correo_smtp_host),
                correo_smtp_puerto = COALESCE(?, correo_smtp_puerto),
                correo_smtp_usuario = COALESCE(?, correo_smtp_usuario),
                correo_smtp_pass_cifrado = ?,
                whatsapp_api_token_cifrado = ?,
                whatsapp_numero_origen = COALESCE(?, whatsapp_numero_origen),
                max_reintentos = COALESCE(?, max_reintentos),
                actualizado_en = ?
            WHERE id = 1
        `).run(
            umbral_critico_dias !== undefined ? parseInt(umbral_critico_dias) : null,
            umbral_preventivo_dias !== undefined ? parseInt(umbral_preventivo_dias) : null,
            correo_activo !== undefined ? (correo_activo ? 1 : 0) : null,
            whatsapp_activo !== undefined ? (whatsapp_activo ? 1 : 0) : null,
            correo_smtp_host || null,
            correo_smtp_puerto !== undefined ? parseInt(correo_smtp_puerto) : null,
            correo_smtp_usuario || null,
            passCifrado,
            tokenCifrado,
            whatsapp_numero_origen || null,
            max_reintentos !== undefined ? parseInt(max_reintentos) : null,
            ahora
        );

        registrarLog({
            usuario_id: req.user.id,
            usuario_email: req.user.email,
            accion: 'ALERTAS_CONFIG_MODIFICAR',
            detalle: `Configuración de alertas modificada. Umbral crítico: ${umbral_critico_dias}d, preventivo: ${umbral_preventivo_dias}d. Canales: Correo=${correo_activo}, WhatsApp=${whatsapp_activo}`,
            ip_origen: obtenerIP(req)
        });

        res.json({ ok: true, message: 'Configuración de alertas actualizada exitosamente.' });
    } catch (err) {
        res.status(500).json({ error: 'Error al actualizar la configuración.', detalle: err.message });
    }
});

// ─────────────────────────────────────────────────
// POST /api/alertas/probar
// Envía un mensaje de prueba real por WhatsApp (Twilio SDK) o Correo (SMTP).
// — WhatsApp: usa el mismo mensaje rico con emojis y formato Markdown que se usa
//   al generar enlaces temporales, con normalización automática +521 para México.
// — Correo: envía HTML estructurado con asunto y firma de la plataforma.
// ─────────────────────────────────────────────────
router.post('/probar', autenticar, async (req, res) => {
    const { tipo, destinatario } = req.body;

    if (!tipo || !destinatario) {
        return res.status(400).json({ error: 'Tipo de prueba (correo/whatsapp) y destinatario son requeridos.' });
    }
    if (!['correo', 'whatsapp'].includes(tipo)) {
        return res.status(400).json({ error: "Tipo inválido. Usa 'correo' o 'whatsapp'." });
    }

    let destFinal = destinatario.trim();

    if (tipo === 'whatsapp') {
        // Normalizar número México +521
        destFinal = destFinal.replace(/[\s\-\(\)]/g, '');
        if (/^\d{10}$/.test(destFinal)) destFinal = `+521${destFinal}`;
        else if (/^\+52\d{10}$/.test(destFinal)) destFinal = destFinal.replace('+52', '+521');
        else if (/^52\d{10}$/.test(destFinal)) destFinal = `+521${destFinal.slice(2)}`;
        else if (!destFinal.startsWith('+')) destFinal = `+${destFinal}`;

        if (!/^\+[1-9]\d{7,14}$/.test(destFinal)) {
            return res.status(400).json({
                error: 'Número de WhatsApp inválido. Usa 10 dígitos o formato internacional, ej: +5218116054215',
                codigo: 'FORMATO_WHATSAPP_INVALIDO'
            });
        }

        // Enviar directamente con Twilio (mismo estilo rico que el enlace temporal)
        try {
            const { enviarWhatsapp } = require('../utils/whatsapp');
            const config = db.prepare('SELECT * FROM alertas_config WHERE id = 1').get() || {};

            const ahora = new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Monterrey' });

            const mensaje =
                `🧪 *SAT Control Manager — Prueba de Canal*\n\n` +
                `✅ La integración de WhatsApp está funcionando correctamente.\n\n` +
                `📅 *Fecha y hora:* ${ahora}\n` +
                `📲 *Canal:* WhatsApp (Twilio Sandbox)\n` +
                `🔔 *Tipo:* Mensaje de prueba manual\n\n` +
                `_Puedes cerrar este mensaje. Ninguna acción es requerida._`;

            const options = {};
            if (process.env.TWILIO_CONTENT_SID) {
                options.contentSid = process.env.TWILIO_CONTENT_SID;
                options.contentVariables = JSON.stringify({ "1": "PRUEBA", "2": "http://localhost:3001" });
            }

            const resultado = await enviarWhatsapp(config, destFinal, mensaje, options);

            const modoEnvio = options.contentSid
                ? `Content Template (${process.env.TWILIO_CONTENT_SID})`
                : 'Mensaje Formateado Original';

            registrarLog({
                usuario_id: req.user.id,
                usuario_email: req.user.email,
                accion: 'ALERTAS_PRUEBA_ENVIADA',
                detalle: `Prueba WhatsApp → ${destFinal} | Modo: ${modoEnvio} | SID: ${resultado.sid}`,
                ip_origen: obtenerIP(req)
            });

            return res.json({
                ok: true,
                mensaje: `✅ Mensaje de prueba WhatsApp enviado a ${destFinal}`,
                sid: resultado.sid,
                modo_envio: modoEnvio,
                destinatario_normalizado: destFinal
            });
        } catch (err) {
            registrarLog({
                usuario_id: req.user.id,
                usuario_email: req.user.email,
                accion: 'ALERTAS_PRUEBA_FALLIDA',
                detalle: `Fallo prueba WhatsApp → ${destFinal}: ${err.message}`,
                ip_origen: obtenerIP(req)
            });

            return res.status(502).json({
                error: err.message || `Fallo al enviar mensaje WhatsApp a ${destFinal}.`,
                codigo: 'FALLO_TWILIO_WHATSAPP'
            });
        }
    }

    // Correo: usar cola de alertas con mensaje HTML estructurado
    if (tipo === 'correo' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destFinal)) {
        return res.status(400).json({
            error: 'Dirección de correo electrónico inválida.',
            codigo: 'FORMATO_CORREO_INVALIDO'
        });
    }

    const config = db.prepare('SELECT * FROM alertas_config WHERE id = 1').get() || {};

    const idCola = encolarAlerta({
        tipo,
        destinatario: destFinal,
        asunto: '🧪 SAT Control Manager — Prueba de Canal (Correo)',
        mensaje: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
  <h2 style="color:#10b981">✅ Prueba de Canal — SAT Control Manager</h2>
  <p>La integración de <strong>Correo Electrónico</strong> está funcionando correctamente.</p>
  <p style="color:#8696a0;font-size:12px">Este mensaje fue generado de forma manual desde la sección <em>Configurar Alertas</em>.</p>
  <hr style="border:1px solid #eee">
  <p style="font-size:11px;color:#aaa">SAT Control Manager • Plataforma de e.firma</p>
</div>`,
        max_intentos: config.max_reintentos || 3
    });

    const resultado = await procesarColaAlertas();
    const alertaFinal = db.prepare('SELECT * FROM cola_alertas WHERE id = ?').get(idCola);

    if (alertaFinal.estatus === 'enviado') {
        registrarLog({
            usuario_id: req.user.id,
            usuario_email: req.user.email,
            accion: 'ALERTAS_PRUEBA_ENVIADA',
            detalle: `Prueba de correo enviada a ${destFinal} en el intento ${alertaFinal.intentos_realizados}.`,
            ip_origen: obtenerIP(req)
        });

        return res.json({
            ok: true,
            mensaje: `✅ Correo de prueba enviado a ${destFinal}`,
            intentos_realizados: alertaFinal.intentos_realizados
        });
    }

    registrarLog({
        usuario_id: req.user.id,
        usuario_email: req.user.email,
        accion: 'ALERTAS_PRUEBA_FALLIDA',
        detalle: `Fallo al enviar prueba de correo a ${destFinal}: ${alertaFinal.ultimo_error}`,
        ip_origen: obtenerIP(req)
    });

    return res.status(502).json({
        error: alertaFinal.ultimo_error || `Fallo al enviar correo a ${destFinal}.`,
        codigo: 'FALLO_SMTP_CORREO',
        estatus_cola: alertaFinal.estatus,
        proximo_reintento_en: alertaFinal.estatus === 'pendiente'
            ? new Date(alertaFinal.proximo_reintento_en * 1000).toISOString()
            : null
    });
});

// ─────────────────────────────────────────────────
// POST /api/alertas/recalcular
// Fuerza el recálculo manual de días restantes y estatus semafórico (UTC 00:00)
// ─────────────────────────────────────────────────
router.post('/recalcular', autenticar, requerirRol('admin', 'supervisor'), (req, res) => {
    try {
        const totalActualizados = recalcularTodos(db);

        registrarLog({
            usuario_id: req.user.id,
            usuario_email: req.user.email,
            accion: 'SEMAFORO_RECALCULAR_MANUAL',
            detalle: `Recálculo semafórico ejecutado manualmente. Contribuyentes actualizados: ${totalActualizados}`,
            ip_origen: obtenerIP(req)
        });

        res.json({
            ok: true,
            contribuyentes_procesados: totalActualizados,
            message: `Semáforo recalculado en UTC 00:00 para los ${totalActualizados} contribuyentes.`
        });
    } catch (err) {
        res.status(500).json({ error: 'Error al recalcular el semáforo.', detalle: err.message });
    }
});

module.exports = router;
