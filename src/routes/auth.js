// ============================================================
// Versión: v2.2.0
// Archivo: src/routes/auth.js
// Descripción: Rutas de autenticación del sistema.
// POST /api/auth/login        → Iniciar sesión (email + password + TOTP opcional)
// POST /api/auth/activar      → Activar cuenta con token de onboarding (CU-05 v1.1)
// POST /api/auth/totp/setup   → Configurar 2FA (devuelve QR secret)
// POST /api/auth/totp/verify  → Verificar y activar TOTP
// GET  /api/auth/me           → Perfil del usuario actual
// ============================================================

'use strict';

const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { authenticator } = require('otplib');
const db         = require('../db/database');
const { autenticar, obtenerIP } = require('../middleware/auth');
const { registrarLog } = require('../utils/ledger');
require('dotenv').config();

const router = express.Router();

// ─────────────────────────────────────────────────
// POST /api/auth/login
// Inicia sesión con email + contraseña + TOTP (si está activado)
// ─────────────────────────────────────────────────
router.post('/login', (req, res) => {
    const { email, password, totp_code } = req.body;
    const ip = obtenerIP(req);

    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña son requeridos.' });
    }

    const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);

    if (!usuario || !bcrypt.compareSync(password, usuario.password_hash)) {
        registrarLog({
            accion: 'AUTH_LOGIN_FALLO',
            detalle: `Intento fallido para email: ${email}`,
            ip_origen: ip
        });
        return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    if (usuario.estatus !== 'activo') {
        return res.status(403).json({ error: 'Cuenta inactiva o pendiente de activación.' });
    }

    // Verificar TOTP si está activado (requerido para ver contraseñas - CU-04)
    if (usuario.totp_activado) {
        if (!totp_code) {
            return res.status(200).json({
                requiere_totp: true,
                message: 'Por favor ingresa el código de autenticación de dos factores.'
            });
        }
        const esValido = authenticator.verify({ token: totp_code, secret: usuario.totp_secret });
        if (!esValido) {
            registrarLog({
                usuario_id: usuario.id,
                usuario_email: usuario.email,
                accion: 'AUTH_TOTP_FALLO',
                detalle: 'Código TOTP incorrecto.',
                ip_origen: ip
            });
            return res.status(401).json({ error: 'Código 2FA inválido o expirado.' });
        }
    }

    // Generar el token JWT de sesión
    const payload = {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        rol: usuario.rol,
        totp_activado: !!usuario.totp_activado
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '1h'
    });

    registrarLog({
        usuario_id: usuario.id,
        usuario_email: usuario.email,
        accion: 'AUTH_LOGIN_OK',
        detalle: `Inicio de sesión exitoso. Rol: ${usuario.rol}`,
        ip_origen: ip
    });

    res.json({
        token,
        usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, totp_activado: !!usuario.totp_activado }
    });
});

// ─────────────────────────────────────────────────
// POST /api/auth/activar
// Flujo de onboarding seguro (CU-05 v1.1):
// El nuevo usuario usa el token de un solo uso (email) para
// establecer su propia contraseña de forma privada.
// ─────────────────────────────────────────────────
router.post('/activar', (req, res) => {
    const { token_activacion, nueva_password } = req.body;

    if (!token_activacion || !nueva_password) {
        return res.status(400).json({ error: 'Token de activación y nueva contraseña son requeridos.' });
    }

    if (nueva_password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    }

    const ahora = Math.floor(Date.now() / 1000);
    const usuario = db.prepare(
        'SELECT * FROM usuarios WHERE token_activacion = ? AND token_expira_en > ?'
    ).get(token_activacion, ahora);

    if (!usuario) {
        return res.status(400).json({ error: 'Token de activación inválido o expirado.' });
    }

    const password_hash = bcrypt.hashSync(nueva_password, 12);

    db.prepare(`
        UPDATE usuarios
        SET password_hash = ?, estatus = 'activo', token_activacion = NULL, token_expira_en = NULL, actualizado_en = ?
        WHERE id = ?
    `).run(password_hash, ahora, usuario.id);

    registrarLog({
        usuario_id: usuario.id,
        usuario_email: usuario.email,
        accion: 'AUTH_CUENTA_ACTIVADA',
        detalle: 'Cuenta activada mediante token de onboarding.',
        ip_origen: obtenerIP(req)
    });

    res.json({ ok: true, message: 'Cuenta activada correctamente. Ya puedes iniciar sesión.' });
});

// ─────────────────────────────────────────────────
// POST /api/auth/totp/setup
// Genera un nuevo secreto TOTP y lo retorna para mostrar el QR
// ─────────────────────────────────────────────────
router.post('/totp/setup', autenticar, (req, res) => {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(req.user.email, process.env.APP_NAME || 'SAT Control Manager', secret);

    // Guardar secreto temporal (aún no activado)
    db.prepare('UPDATE usuarios SET totp_secret = ? WHERE id = ?').run(secret, req.user.id);

    res.json({ secret, otpauth_url: otpauth });
});

// ─────────────────────────────────────────────────
// POST /api/auth/totp/verify
// Verifica el código TOTP y activa el 2FA para el usuario
// ─────────────────────────────────────────────────
router.post('/totp/verify', autenticar, (req, res) => {
    const { totp_code } = req.body;
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.user.id);

    if (!usuario.totp_secret) {
        return res.status(400).json({ error: 'Primero configura el 2FA en /totp/setup.' });
    }

    const esValido = authenticator.verify({ token: totp_code, secret: usuario.totp_secret });

    if (!esValido) {
        return res.status(400).json({ error: 'Código TOTP incorrecto. Verifica la hora de tu dispositivo.' });
    }

    db.prepare('UPDATE usuarios SET totp_activado = 1, actualizado_en = ? WHERE id = ?')
        .run(Math.floor(Date.now() / 1000), usuario.id);

    registrarLog({
        usuario_id: usuario.id,
        usuario_email: usuario.email,
        accion: 'AUTH_2FA_ACTIVADO',
        detalle: 'Autenticación de dos factores activada.',
        ip_origen: obtenerIP(req)
    });

    res.json({ ok: true, message: '2FA activado correctamente.' });
});

// ─────────────────────────────────────────────────
// GET /api/auth/me
// Retorna el perfil del usuario actual autenticado
// ─────────────────────────────────────────────────
router.get('/me', autenticar, (req, res) => {
    const usuario = db.prepare(
        'SELECT id, nombre, email, rol, totp_activado, estatus, creado_en FROM usuarios WHERE id = ?'
    ).get(req.user.id);

    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json(usuario);
});

module.exports = router;
