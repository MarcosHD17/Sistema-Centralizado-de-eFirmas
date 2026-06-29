// ============================================================
// Versión: v2.2.0
// Archivo: src/routes/usuarios.js
// Descripción: Gestión de usuarios del sistema con RBAC.
// GET    /api/usuarios          → Listar usuarios (admin/supervisor)
// POST   /api/usuarios          → Crear nuevo usuario con token de onboarding (CU-05 v1.1)
// PUT    /api/usuarios/:id      → Actualizar datos de usuario
// POST   /api/usuarios/:id/desactivar → Baja y reasignación de cartera (CU-05b v1.1)
// ============================================================

'use strict';

const express = require('express');
const crypto  = require('crypto');
const db      = require('../db/database');
const { autenticar, requerirRol, obtenerIP } = require('../middleware/auth');
const { registrarLog } = require('../utils/ledger');

const router = express.Router();

// ─────────────────────────────────────────────────
// GET /api/usuarios
// Listar todos los usuarios del sistema
// ─────────────────────────────────────────────────
router.get('/', autenticar, requerirRol('admin', 'supervisor'), (req, res) => {
    const usuarios = db.prepare(`
        SELECT id, nombre, email, rol, totp_activado, estatus, creado_en, actualizado_en
        FROM usuarios ORDER BY creado_en DESC
    `).all();

    // Contar contribuyentes asignados a cada usuario
    const resultado = usuarios.map(u => {
        const total_asignados = db.prepare(
            'SELECT COUNT(*) AS n FROM contribuyentes WHERE responsable_id = ?'
        ).get(u.id).n;
        return { ...u, total_asignados };
    });

    res.json(resultado);
});

// ─────────────────────────────────────────────────
// POST /api/usuarios
// Crear nuevo usuario con onboarding seguro (CU-05 v1.1)
// Genera token de un solo uso con expiración de 24 horas.
// El administrador NO define la contraseña inicial.
// ─────────────────────────────────────────────────
router.post('/', autenticar, requerirRol('admin'), (req, res) => {
    const { nombre, email, rol } = req.body;

    if (!nombre || !email || !rol) {
        return res.status(400).json({ error: 'Nombre, email y rol son requeridos.' });
    }

    const roles_validos = ['admin', 'supervisor', 'operador'];
    if (!roles_validos.includes(rol)) {
        return res.status(400).json({ error: `Rol inválido. Opciones: ${roles_validos.join(', ')}` });
    }

    // Verificar email duplicado
    const existente = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
    if (existente) {
        return res.status(409).json({ error: 'Ya existe un usuario registrado con ese email.' });
    }

    // Generar token de activación seguro (32 bytes hex = 64 caracteres)
    const token_activacion = crypto.randomBytes(32).toString('hex');
    // Expira en 24 horas
    const token_expira_en  = Math.floor(Date.now() / 1000) + (24 * 60 * 60);

    // El password_hash es un placeholder inútil — el usuario debe activar su cuenta
    const bcrypt = require('bcryptjs');
    const password_placeholder = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

    try {
        const resultado = db.prepare(`
            INSERT INTO usuarios (nombre, email, password_hash, rol, estatus, token_activacion, token_expira_en)
            VALUES (?, ?, ?, ?, 'pendiente', ?, ?)
        `).run(nombre, email, password_placeholder, rol, token_activacion, token_expira_en);

        registrarLog({
            usuario_id: req.user.id,
            usuario_email: req.user.email,
            accion: 'USUARIO_CREAR',
            detalle: `Nuevo usuario creado: ${email} | Rol: ${rol} | Estado: pendiente de activación.`,
            ip_origen: obtenerIP(req)
        });

        // En producción, este token se enviaría por correo al nuevo usuario.
        // En esta versión de desarrollo, se retorna en la respuesta.
        res.status(201).json({
            ok: true,
            id: resultado.lastInsertRowid,
            nombre, email, rol,
            estatus: 'pendiente',
            token_activacion,
            instruccion: `Enviar al usuario el enlace de activación con el token. El token expira en 24 horas.`,
            enlace_activacion: `/activar?token=${token_activacion}`
        });
    } catch (err) {
        res.status(500).json({ error: 'Error al crear el usuario.', detalle: err.message });
    }
});

// ─────────────────────────────────────────────────
// PUT /api/usuarios/:id
// Actualizar nombre, email o rol de un usuario
// ─────────────────────────────────────────────────
router.put('/:id', autenticar, requerirRol('admin'), (req, res) => {
    const { id } = req.params;
    const { nombre, email, rol } = req.body;

    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    if (!usuario) {
        return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    db.prepare(`
        UPDATE usuarios
        SET nombre = COALESCE(?, nombre),
            email  = COALESCE(?, email),
            rol    = COALESCE(?, rol),
            actualizado_en = ?
        WHERE id = ?
    `).run(nombre || null, email || null, rol || null, Math.floor(Date.now() / 1000), id);

    registrarLog({
        usuario_id: req.user.id,
        usuario_email: req.user.email,
        accion: 'USUARIO_ACTUALIZAR',
        detalle: `Usuario ID ${id} actualizado. Campos: nombre=${nombre}, email=${email}, rol=${rol}`,
        ip_origen: obtenerIP(req)
    });

    res.json({ ok: true, message: 'Usuario actualizado correctamente.' });
});

// ─────────────────────────────────────────────────
// POST /api/usuarios/:id/desactivar
// Baja de usuario con reasignación de cartera (CU-05b v1.1)
// Reasigna todos los contribuyentes del usuario dado de baja
// al usuario receptor indicado en el body.
// ─────────────────────────────────────────────────
router.post('/:id/desactivar', autenticar, requerirRol('admin'), (req, res) => {
    const { id } = req.params;
    const { reasignar_a_id } = req.body;

    if (!reasignar_a_id) {
        return res.status(400).json({ error: 'Se requiere el ID del usuario receptor (reasignar_a_id).' });
    }

    const usuario_baja     = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    const usuario_receptor = db.prepare('SELECT * FROM usuarios WHERE id = ? AND estatus = "activo"').get(reasignar_a_id);

    if (!usuario_baja) {
        return res.status(404).json({ error: 'Usuario a dar de baja no encontrado.' });
    }
    if (!usuario_receptor) {
        return res.status(404).json({ error: 'Usuario receptor no encontrado o inactivo.' });
    }
    if (parseInt(id) === parseInt(reasignar_a_id)) {
        return res.status(400).json({ error: 'El usuario de baja y el receptor no pueden ser el mismo.' });
    }

    const desactivar = db.transaction(() => {
        const ahora = Math.floor(Date.now() / 1000);

        // 1. Reasignar cartera de contribuyentes
        const { changes } = db.prepare(
            'UPDATE contribuyentes SET responsable_id = ?, actualizado_en = ? WHERE responsable_id = ?'
        ).run(reasignar_a_id, ahora, id);

        // 2. Desactivar al usuario
        db.prepare(
            'UPDATE usuarios SET estatus = "inactivo", actualizado_en = ? WHERE id = ?'
        ).run(ahora, id);

        return changes;
    });

    const contribuyentes_reasignados = desactivar();

    registrarLog({
        usuario_id: req.user.id,
        usuario_email: req.user.email,
        accion: 'USUARIO_BAJA',
        detalle: `Usuario dado de baja: ${usuario_baja.email} (ID: ${id}). ${contribuyentes_reasignados} contribuyentes reasignados a ${usuario_receptor.email} (ID: ${reasignar_a_id}).`,
        ip_origen: obtenerIP(req)
    });

    res.json({
        ok: true,
        contribuyentes_reasignados,
        message: `Usuario desactivado. ${contribuyentes_reasignados} contribuyentes reasignados a ${usuario_receptor.nombre}.`
    });
});

module.exports = router;
