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
// Fix hallazgos QA #12, #13 y #8: ya no simula el envío con
// Math.random(). Encola la alerta en 'cola_alertas' (persiste ante
// una caída del servidor) e intenta procesarla de inmediato contra
// el proveedor SMTP/WhatsApp real configurado en alertas_config. El
// resultado que se reporta es el resultado real de esa conexión —
// determinístico, no aleatorio — y cualquier reintento pendiente
// queda agendado con backoff real (5/15/30 min) para que lo recoja
// el cron de server.js.
// ─────────────────────────────────────────────────
router.post('/probar', autenticar, async (req, res) => {
    const { tipo, destinatario } = req.body; // tipo: 'correo' o 'whatsapp'

    if (!tipo || !destinatario) {
        return res.status(400).json({ error: 'Tipo de prueba (correo/whatsapp) y destinatario son requeridos.' });
    }
    if (!['correo', 'whatsapp'].includes(tipo)) {
        return res.status(400).json({ error: "Tipo inválido. Usa 'correo' o 'whatsapp'." });
    }

    const config = db.prepare('SELECT * FROM alertas_config WHERE id = 1').get() || {};

    const idCola = encolarAlerta({
        tipo,
        destinatario,
        asunto: 'SAT Control Manager — Mensaje de prueba',
        mensaje: `Este es un mensaje de prueba de canal (${tipo}) generado desde la configuración de alertas.`,
        max_intentos: config.max_reintentos || 3
    });

    const resultado = await procesarColaAlertas();
    const alertaFinal = db.prepare('SELECT * FROM cola_alertas WHERE id = ?').get(idCola);

    if (alertaFinal.estatus === 'enviado') {
        registrarLog({
            usuario_id: req.user.id,
            usuario_email: req.user.email,
            accion: 'ALERTAS_PRUEBA_ENVIADA',
            detalle: `Prueba de alertas (${tipo}) enviada a ${destinatario} en el intento ${alertaFinal.intentos_realizados}.`,
            ip_origen: obtenerIP(req)
        });

        return res.json({
            ok: true,
            mensaje: `Mensaje de prueba enviado exitosamente a ${destinatario}.`,
            intentos_realizados: alertaFinal.intentos_realizados
        });
    }

    // 'pendiente' significa que falló este intento pero aún hay reintentos
    // programados (backoff real); 'fallido' significa que ya se agotaron.
    registrarLog({
        usuario_id: req.user.id,
        usuario_email: req.user.email,
        accion: 'ALERTAS_PRUEBA_FALLIDA',
        detalle: `Fallo al enviar prueba de alertas (${tipo}) a ${destinatario}: ${alertaFinal.ultimo_error}`,
        ip_origen: obtenerIP(req)
    });

    return res.status(502).json({
        error: alertaFinal.ultimo_error || `Fallo al enviar mensaje a ${destinatario}.`,
        codigo: 'FALLO_PROVEEDOR_ALERTAS',
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
