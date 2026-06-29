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
require('dotenv').config();

const db = require('./src/db/database');
const { recalcularTodos } = require('./src/utils/semaforo');
const { registrarLog } = require('./src/utils/ledger');

// Inicializar Express
const app = express();
const PORT = process.env.PORT || 3001;

// Configurar Middleware
app.use(cors({
    origin: '*', // En producción, especificar el dominio del frontend (ej. GitHub Pages)
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
