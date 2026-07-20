// ============================================================
// Versión: v2.2.0
// Archivo: server.js
// Descripción: Servidor principal Express para la API del
// Sistema Centralizado de eFirmas (SAT Control Manager).
// ============================================================

'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

const db = require('./src/db/database');
const { recalcularTodos } = require('./src/utils/semaforo');
const { registrarLog } = require('./src/utils/ledger');
const { procesarColaAlertas } = require('./src/utils/colaAlertas');

// Inicializar Express
const app = express();
const PORT = process.env.PORT || 3001;

// Fix QA-MEDIA (server.js): CORS restrictivo por variable de entorno.
// CORS_ALLOWED_ORIGINS admite una lista separada por comas, ej.:
//   CORS_ALLOWED_ORIGINS=https://midespacho.github.io,http://localhost:5500
// Si la variable no está definida, se usa un valor por defecto seguro
// solo para desarrollo local (evita dejar el servidor abierto por accidente
// si alguien olvida configurar el .env en producción).
const ORIGENES_PERMITIDOS = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

// Configurar Middleware
app.use(cors({
    origin: (origin, callback) => {
        // Peticiones sin header Origin (curl, Postman, apps móviles, mismo servidor)
        // se permiten porque no representan un navegador de terceros.
        if (!origin || ORIGENES_PERMITIDOS.includes(origin)) {
            return callback(null, true);
        }
        console.warn(`[CORS] Origen rechazado: ${origin}`);
        return callback(new Error('Origen no autorizado por la política de CORS.'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' })); // Permitir payloads de certificados

// Servir el frontend de forma estática si es necesario
app.use(express.static(path.join(__dirname)));

// Logger middleware para la consola
app.use((req, res, next) => {
    console.log(`[API] ${new Date().toISOString()} - ${req.method} ${req.url} - IP: ${req.ip}`);
    next();
});

// Importar Routers
const authRouter = require('./src/routes/auth');
const usuariosRouter = require('./src/routes/usuarios');
const contribuyentesRouter = require('./src/routes/contribuyentes');
const bitacoraRouter = require('./src/routes/bitacora');
const alertasRouter = require('./src/routes/alertas');

// Registrar Rutas de la API
app.use('/api/auth', authRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/contribuyentes', contribuyentesRouter);
app.use('/api/bitacora', bitacoraRouter);
app.use('/api/alertas', alertasRouter);

// Ruta de estado de salud (Health Check)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '2.2.0',
        db_connected: !!db
    });
});

// Middleware para manejo global de errores
app.use((err, req, res, next) => {
    console.error('[Error Global]', err.stack);

    // Los rechazos de CORS no son errores internos del servidor: son un 403.
    if (err.message === 'Origen no autorizado por la política de CORS.') {
        return res.status(403).json({ error: err.message });
    }

    // Intentar registrar el fallo en la bitácora si es posible
    try {
        registrarLog({
            accion: 'SISTEMA_ERROR_INTERNO',
            detalle: `Error: ${err.message}`,
            ip_origen: req.headers['x-forwarded-for'] || req.socket.remoteAddress
        });
    } catch (e) {
        console.error('[Error Ledger]', e.message);
    }

    res.status(500).json({
        error: 'Ocurrió un error interno en el servidor.',
        detalle: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Arrancar el Servidor
const servidor = app.listen(PORT, () => {
    console.log(`============================================================`);
    console.log(`🚀 SAT Control Manager Backend iniciado correctamente`);
    console.log(`📡 Puerto: ${PORT}`);
    console.log(`🔗 URL local: http://localhost:${PORT}`);
    console.log(`============================================================`);

    // Ejecutar recálculo semafórico inicial al arrancar el servidor
    try {
        const total = recalcularTodos(db);
        console.log(`[Semáforo] Recálculo automático completado. Contribuyentes procesados: ${total}`);
    } catch (err) {
        console.error('[Semáforo] Error al realizar recálculo inicial:', err.message);
    }

    // Fix hallazgo QA #15: antes el recálculo solo ocurría al iniciar el
    // servidor o de forma manual (POST /api/alertas/recalcular). Si el
    // proceso llevaba varios días corriendo sin reiniciarse, los estatus
    // quedaban desactualizados. Ahora corre todos los días a las 00:00 UTC.
    cron.schedule('0 0 * * *', () => {
        try {
            const total = recalcularTodos(db);
            console.log(`[Cron] Recálculo semafórico nocturno completado. Contribuyentes procesados: ${total}`);
        } catch (err) {
            console.error('[Cron] Error en el recálculo semafórico nocturno:', err.message);
        }
    }, { timezone: 'UTC' });

    // Fix hallazgo QA #13: procesa la cola persistente de alertas
    // (reintentos con backoff real de 5/15/30 min) cada minuto, para que
    // los mensajes agendados por /api/alertas/probar o por el aviso a
    // supervisores (hallazgo #16) efectivamente se envíen con el tiempo.
    cron.schedule('* * * * *', async () => {
        try {
            const resultado = await procesarColaAlertas();
            if (resultado.procesadas > 0) {
                console.log(`[Cron] Cola de alertas: ${resultado.enviadas} enviadas, ${resultado.fallidas} fallidas definitivamente, de ${resultado.procesadas} procesadas.`);
            }
        } catch (err) {
            console.error('[Cron] Error al procesar la cola de alertas:', err.message);
        }
    });
});

// Manejar apagado seguro del servidor
process.on('SIGINT', () => {
    console.log('\n[Sistema] Cerrando servidor backend...');
    servidor.close(() => {
        console.log('[DB] Cerrando conexión de base de datos...');
        db.close();
        console.log('[Sistema] Backend detenido de manera segura. ¡Hasta luego!');
        process.exit(0);
    });
});
