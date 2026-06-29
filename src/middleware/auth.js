// ============================================================
// Versión: v2.2.0
// Archivo: src/middleware/auth.js
// Descripción: Middleware de autenticación JWT y control RBAC.
// Verifica el token Bearer en el encabezado Authorization y
// adjunta el usuario decodificado a req.user para las rutas.
// ============================================================

'use strict';

const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * Middleware principal de autenticación.
 * Verifica el token JWT y adjunta el payload a req.user.
 */
function autenticar(req, res, next) {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de autenticación requerido.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Sesión expirada. Por favor, inicia sesión nuevamente.' });
        }
        return res.status(401).json({ error: 'Token inválido.' });
    }
}

/**
 * Middleware de control de acceso basado en roles (RBAC).
 * Uso: router.get('/ruta', autenticar, requerirRol('admin'), handler)
 * @param {...string} roles - Roles permitidos ('admin', 'supervisor', 'operador')
 */
function requerirRol(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'No autenticado.' });
        }
        if (!roles.includes(req.user.rol)) {
            return res.status(403).json({
                error: `Acceso denegado. Requiere rol: ${roles.join(' o ')}.`
            });
        }
        next();
    };
}

/**
 * Extrae la IP real del cliente, considerando proxies.
 * @param {object} req - Request de Express
 * @returns {string}
 */
function obtenerIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.socket?.remoteAddress
        || 'desconocida';
}

module.exports = { autenticar, requerirRol, obtenerIP };
