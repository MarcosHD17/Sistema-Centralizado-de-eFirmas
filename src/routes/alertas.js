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

    // Para esta versión local de desarrollo, el "cifrado" de llaves del server se simula con base64.
    // En producción se usaría cifrado simétrico AES-256-GCM usando la llave de sesión del server.
    const passCifrado = correo_smtp_pass 
        ? Buffer.from(correo_smtp_pass).toString('base64') 
        : existente.correo_smtp_pass_cifrado;

    const tokenCifrado = whatsapp_api_token 
        ? Buffer.from(whatsapp_api_token).toString('base64') 
        : existente.whatsapp_api_token_cifrado;

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
// Simulación de envío de alerta de prueba (CU-02b v1.1)
// Muestra el flujo completo con reintentos y backoff exponencial simulado
// ─────────────────────────────────────────────────
router.post('/probar', autenticar, (req, res) => {
    const { tipo, destinatario } = req.body; // tipo: 'correo' o 'whatsapp'

    if (!tipo || !destinatario) {
        return res.status(400).json({ error: 'Tipo de prueba (correo/whatsapp) y destinatario son requeridos.' });
    }

    const config = db.prepare('SELECT * FROM alertas_config WHERE id = 1').get() || {};
    const maxIntentos = config.max_reintentos || 3;
    const bitacoraReintentos = [];

    // Simulador de motor de envío con reintentos y backoff exponencial (CU-02)
    let enviadoExitosamente = false;
    
    for (let intento = 1; intento <= maxIntentos; intento++) {
        // Simular retraso de backoff exponencial en milisegundos: 100 * 2^(intento - 1)
        const delayMs = 100 * Math.pow(2, intento - 1);
        
        // Simular una probabilidad de fallo temporal en los primeros intentos (ej. fallo de red 60%)
        const esFalloTemporal = intento < maxIntentos && Math.random() < 0.6;

        bitacoraReintentos.push({
            intento,
            backoff_delay_ms: delayMs,
            timestamp: new Date().toISOString(),
            estatus: esFalloTemporal ? 'fallo_temporal_red' : 'exito',
            detalle: esFalloTemporal 
                ? `Fallo al conectar con el servidor de ${tipo}. Reintentando con retraso de ${delayMs}ms...`
                : `Mensaje de prueba enviado exitosamente a ${destinatario} en el intento ${intento}.`
        });

        if (!esFalloTemporal) {
            enviadoExitosamente = true;
            break;
        }
    }

    if (enviadoExitosamente) {
        registrarLog({
            usuario_id: req.user.id,
            usuario_email: req.user.email,
            accion: 'ALERTAS_PRUEBA_ENVIADA',
            detalle: `Prueba de alertas (${tipo}) enviada a ${destinatario}. Intentos requeridos: ${bitacoraReintentos.length}`,
            ip_origen: obtenerIP(req)
        });

        return res.json({
            ok: true,
            mensaje: `Mensaje de prueba enviado exitosamente a ${destinatario}.`,
            intentos: bitacoraReintentos
        });
    } else {
        registrarLog({
            usuario_id: req.user.id,
            usuario_email: req.user.email,
            accion: 'ALERTAS_PRUEBA_FALLIDA',
            detalle: `Error definitivo al enviar prueba de alertas (${tipo}) a ${destinatario} tras ${maxIntentos} intentos.`,
            ip_origen: obtenerIP(req)
        });

        return res.status(502).json({
            error: `Fallo definitivo al enviar mensaje a ${destinatario} tras ${maxIntentos} intentos con backoff exponencial.`,
            codigo: 'FALLO_PROVEEDOR_ALERTAS',
            intentos: bitacoraReintentos
        });
    }
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
