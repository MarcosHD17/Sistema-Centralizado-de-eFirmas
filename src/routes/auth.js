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
const rateLimit  = require('express-rate-limit');
const { authenticator } = require('otplib');
const db         = require('../db/database');
const { autenticar, obtenerIP } = require('../middleware/auth');
const { registrarLog } = require('../utils/ledger');
require('dotenv').config();

const router = express.Router();

// Fix hallazgo QA #14: sin esto, un atacante con email/password válidos
// podía intentar fuerza bruta contra el código TOTP de 6 dígitos sin
// ningún freno. Límite por IP: 5 intentos fallidos cada 15 minutos.
// Se complementa con el bloqueo por cuenta más abajo (intentos_fallidos /
// bloqueado_hasta), que protege incluso si el atacante rota de IP.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos.' }
});

const MAX_INTENTOS_CUENTA = 5;
const BLOQUEO_MINUTOS = 15;

// ─────────────────────────────────────────────────
// POST /api/auth/login
// Inicia sesión con email + contraseña + TOTP (si está activado)
// ─────────────────────────────────────────────────
router.post('/login', loginLimiter, (req, res) => {
    const { email, password, totp_code } = req.body;
    const ip = obtenerIP(req);

    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña son requeridos.' });
    }

    const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
    const ahora = Math.floor(Date.now() / 1000);

    // Fix hallazgo QA #14 (bloqueo por cuenta): si la cuenta está
    // temporalmente bloqueada por demasiados intentos fallidos, no se
    // evalúa la contraseña en absoluto.
    if (usuario && usuario.bloqueado_hasta && usuario.bloqueado_hasta > ahora) {
        const minutosRestantes = Math.ceil((usuario.bloqueado_hasta - ahora) / 60);
        return res.status(423).json({
            error: `Cuenta bloqueada temporalmente por demasiados intentos fallidos. Intenta en ${minutosRestantes} minuto(s).`,
            codigo: 'CUENTA_BLOQUEADA'
        });
    }

    if (!usuario || !bcrypt.compareSync(password, usuario.password_hash)) {
        if (usuario) {
            const intentos = usuario.intentos_fallidos + 1;
            const bloquear = intentos >= MAX_INTENTOS_CUENTA;
            db.prepare(`
                UPDATE usuarios
                SET intentos_fallidos = ?, bloqueado_hasta = ?
                WHERE id = ?
            `).run(
                bloquear ? 0 : intentos,
                bloquear ? ahora + (BLOQUEO_MINUTOS * 60) : usuario.bloqueado_hasta,
                usuario.id
            );
        }
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
            // Fix hallazgo QA #6: se conserva el HTTP 200 (el frontend ya
            // depende de este contrato para mostrar el segundo paso), pero
            // ahora se agrega 'codigo' explícito, consistente con el resto
            // de la API, para que cualquier cliente lo distinga sin tener
            // que inferirlo solo del booleano.
            return res.status(200).json({
                requiere_totp: true,
                codigo: 'TOTP_REQUERIDO',
                message: 'Por favor ingresa el código de autenticación de dos factores.'
            });
        }
        const esValido = authenticator.verify({ token: totp_code, secret: usuario.totp_secret });
        if (!esValido) {
            const intentos = usuario.intentos_fallidos + 1;
            const bloquear = intentos >= MAX_INTENTOS_CUENTA;
            db.prepare(`
                UPDATE usuarios
                SET intentos_fallidos = ?, bloqueado_hasta = ?
                WHERE id = ?
            `).run(
                bloquear ? 0 : intentos,
                bloquear ? ahora + (BLOQUEO_MINUTOS * 60) : usuario.bloqueado_hasta,
                usuario.id
            );
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

    // Login exitoso: limpiar contador de intentos fallidos
    db.prepare('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?').run(usuario.id);

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
