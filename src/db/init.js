// ============================================================
// Versión: v2.2.0
// Archivo: src/db/init.js
// Descripción: Script de inicialización del esquema relacional de
// la base de datos SQLite. Ejecutar con: npm run init-db
// Tablas: usuarios, contribuyentes, historial_renovaciones,
//         alertas_config, bitacora_logs (ledger-chain inmutable)
// ============================================================

'use strict';

const db = require('./database');

console.log('[DB] Iniciando creación del esquema...');

// Ejecutar todas las sentencias DDL en una sola transacción atómica
const initSchema = db.transaction(() => {

    // ─────────────────────────────────────────────────
    // TABLA: usuarios
    // Gestión de usuarios del sistema con soporte RBAC
    // Roles: 'admin', 'supervisor', 'operador'
    // ─────────────────────────────────────────────────
    db.exec(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre          TEXT NOT NULL,
            email           TEXT NOT NULL UNIQUE,
            password_hash   TEXT NOT NULL,
            rol             TEXT NOT NULL CHECK(rol IN ('admin', 'supervisor', 'operador')),
            totp_secret     TEXT,
            totp_activado   INTEGER NOT NULL DEFAULT 0,
            -- Control de fuerza bruta (OBS-001): intentos fallidos consecutivos y bloqueo temporal
            intentos_fallidos INTEGER NOT NULL DEFAULT 0,
            bloqueado_hasta   INTEGER,
            estatus         TEXT NOT NULL DEFAULT 'pendiente' CHECK(estatus IN ('activo', 'inactivo', 'pendiente')),
            token_activacion TEXT,
            token_expira_en INTEGER,
            creado_en       INTEGER NOT NULL DEFAULT (unixepoch()),
            actualizado_en  INTEGER NOT NULL DEFAULT (unixepoch())
        );
    `);

    // ─────────────────────────────────────────────────
    // TABLA: contribuyentes
    // Expedientes fiscales de los contribuyentes con
    // la clave cifrada del SAT almacenada como payload AES-GCM
    // NUNCA se almacena la contraseña en texto plano
    // ─────────────────────────────────────────────────
    db.exec(`
        CREATE TABLE IF NOT EXISTS contribuyentes (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            rfc                 TEXT NOT NULL UNIQUE,
            razon_social        TEXT NOT NULL,
            email_contacto      TEXT,
            telefono_contacto   TEXT,
            fecha_emision       TEXT NOT NULL,
            fecha_vencimiento   TEXT NOT NULL,
            -- Payload cifrado AES-GCM-256 de la clave privada (.key)
            -- Formato JSON: { iv, salt, ciphertext, tag } (cifrado en cliente)
            key_payload_cifrado TEXT,
            -- Metadatos del certificado .cer (número de serie, emisor)
            cer_numero_serie    TEXT,
            cer_emisor          TEXT,
            -- Estatus calculado por el cronjob diario del semáforo
            estatus             TEXT NOT NULL DEFAULT 'vigente' CHECK(estatus IN ('vigente', 'preventivo', 'critico', 'expirado')),
            -- Días restantes calculados al último proceso del cronjob
            dias_restantes      INTEGER,
            -- Soft-delete (CU-01c): 1 = activo/visible, 0 = dado de baja
            activo              INTEGER NOT NULL DEFAULT 1,
            responsable_id      INTEGER NOT NULL REFERENCES usuarios(id),
            creado_en           INTEGER NOT NULL DEFAULT (unixepoch()),
            actualizado_en      INTEGER NOT NULL DEFAULT (unixepoch())
        );
    `);

    // ─────────────────────────────────────────────────
    // TABLA: historial_renovaciones
    // Archivo histórico de certificados anteriores de un
    // contribuyente cuando se realiza una renovación (CU-01b)
    // ─────────────────────────────────────────────────
    db.exec(`
        CREATE TABLE IF NOT EXISTS historial_renovaciones (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            contribuyente_id    INTEGER NOT NULL REFERENCES contribuyentes(id),
            rfc                 TEXT NOT NULL,
            fecha_emision_ant   TEXT NOT NULL,
            fecha_vencimiento_ant TEXT NOT NULL,
            cer_numero_serie_ant TEXT,
            renovado_por_id     INTEGER NOT NULL REFERENCES usuarios(id),
            renovado_en         INTEGER NOT NULL DEFAULT (unixepoch())
        );
    `);

    // ─────────────────────────────────────────────────
    // TABLA: alertas_config
    // Configuración del motor semafórico y canales de
    // notificación por despacho (una fila global por sistema)
    // ─────────────────────────────────────────────────
    db.exec(`
        CREATE TABLE IF NOT EXISTS alertas_config (
            id                          INTEGER PRIMARY KEY DEFAULT 1,
            -- Umbrales del semáforo (CU-02 v1.1 con operadores precisos)
            umbral_critico_dias         INTEGER NOT NULL DEFAULT 30,
            umbral_preventivo_dias      INTEGER NOT NULL DEFAULT 90,
            -- Canales de notificación
            correo_activo               INTEGER NOT NULL DEFAULT 1,
            whatsapp_activo             INTEGER NOT NULL DEFAULT 0,
            correo_smtp_host            TEXT,
            correo_smtp_puerto          INTEGER DEFAULT 587,
            correo_smtp_usuario         TEXT,
            correo_smtp_pass_cifrado    TEXT,
            whatsapp_api_token_cifrado  TEXT,
            whatsapp_numero_origen      TEXT,
            -- Control de reintentos (backoff exponencial CU-02 v1.1)
            max_reintentos              INTEGER NOT NULL DEFAULT 3,
            actualizado_en              INTEGER NOT NULL DEFAULT (unixepoch())
        );
    `);

    // Insertar configuración por defecto si no existe
    db.exec(`
        INSERT OR IGNORE INTO alertas_config (id) VALUES (1);
    `);

    // ─────────────────────────────────────────────────
    // TABLA: consultas_contrasena_log
    // Control del límite diario de consultas de contraseña
    // por operador (máx 10 por día - CU-04 v1.1)
    // ─────────────────────────────────────────────────
    db.exec(`
        CREATE TABLE IF NOT EXISTS consultas_contrasena_log (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
            contribuyente_rfc TEXT NOT NULL,
            fecha_consulta  TEXT NOT NULL DEFAULT (date('now')),
            consultado_en   INTEGER NOT NULL DEFAULT (unixepoch())
        );
    `);

    // ─────────────────────────────────────────────────
    // TABLA: bitacora_logs  ← LEDGER-CHAIN INMUTABLE
    // Cada registro incluye el hash SHA-256 del registro
    // anterior para detectar cualquier manipulación (CU-04 v1.1)
    // Retención mínima: 5 años (requerimiento CFDI/SAT México)
    // ─────────────────────────────────────────────────
    db.exec(`
        CREATE TABLE IF NOT EXISTS bitacora_logs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp_utc   INTEGER NOT NULL DEFAULT (unixepoch()),
            usuario_id      INTEGER REFERENCES usuarios(id),
            usuario_email   TEXT,
            accion          TEXT NOT NULL,
            detalle         TEXT,
            ip_origen       TEXT,
            -- Hash del registro anterior (NULL para el primer registro)
            prev_hash       TEXT,
            -- SHA-256 de: id|timestamp|usuario_email|accion|detalle|ip|prev_hash
            current_hash    TEXT NOT NULL
        );
    `);

    // ─────────────────────────────────────────────────
    // TABLA: cola_alertas
    // Cola persistente de reintentos de mensajería (OBS-005).
    // Sobrevive a caídas/reinicios del servidor a mitad de un envío.
    // ─────────────────────────────────────────────────
    db.exec(`
        CREATE TABLE IF NOT EXISTS cola_alertas (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo                TEXT NOT NULL CHECK(tipo IN ('correo', 'whatsapp')),
            destinatario        TEXT NOT NULL,
            asunto              TEXT,
            mensaje             TEXT NOT NULL,
            intentos_realizados INTEGER NOT NULL DEFAULT 0,
            max_intentos        INTEGER NOT NULL DEFAULT 3,
            proximo_reintento_en INTEGER NOT NULL DEFAULT (unixepoch()),
            estatus             TEXT NOT NULL DEFAULT 'pendiente' CHECK(estatus IN ('pendiente', 'enviado', 'fallido')),
            ultimo_error        TEXT,
            creado_en           INTEGER NOT NULL DEFAULT (unixepoch()),
            actualizado_en      INTEGER NOT NULL DEFAULT (unixepoch())
        );
    `);

    // ─────────────────────────────────────────────────
    // ÍNDICES para optimizar consultas frecuentes
    // ─────────────────────────────────────────────────
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_contribuyentes_estatus ON contribuyentes(estatus);
        CREATE INDEX IF NOT EXISTS idx_contribuyentes_responsable ON contribuyentes(responsable_id);
        CREATE INDEX IF NOT EXISTS idx_contribuyentes_vencimiento ON contribuyentes(fecha_vencimiento);
        CREATE INDEX IF NOT EXISTS idx_contribuyentes_activo ON contribuyentes(activo);
        CREATE INDEX IF NOT EXISTS idx_bitacora_timestamp ON bitacora_logs(timestamp_utc DESC);
        CREATE INDEX IF NOT EXISTS idx_bitacora_usuario ON bitacora_logs(usuario_id);
        CREATE INDEX IF NOT EXISTS idx_consultas_usuario_fecha ON consultas_contrasena_log(usuario_id, fecha_consulta);
        CREATE INDEX IF NOT EXISTS idx_cola_alertas_estatus ON cola_alertas(estatus, proximo_reintento_en);
    `);

});

// Ejecutar la transacción de inicialización
try {
    initSchema();
    console.log('[DB] ✓ Esquema creado exitosamente.');
    
    // Insertar usuario administrador semilla si la tabla está vacía
    const totalUsuarios = db.prepare('SELECT COUNT(*) AS total FROM usuarios').get().total;
    if (totalUsuarios === 0) {
        const bcrypt = require('bcryptjs');
        const passHash = bcrypt.hashSync('Admin1234.', 12);
        
        db.prepare(`
            INSERT INTO usuarios (nombre, email, password_hash, rol, estatus)
            VALUES ('Administrador Central', 'admin@fiel.mx', ?, 'admin', 'activo')
        `).run(passHash);
        
        console.log('[DB] Seed: Usuario administrador creado (admin@fiel.mx / Admin1234.)');
    }

    // Inicializar bitácora ledger con un bloque génesis si está vacía
    const totalLogs = db.prepare('SELECT COUNT(*) AS total FROM bitacora_logs').get().total;
    if (totalLogs === 0) {
        const crypto = require('crypto');
        const timestamp_utc = Math.floor(Date.now() / 1000);
        const prev_hash = null;
        const accion = 'SISTEMA_INICIALIZACION';
        const detalle = 'Bloque génesis: Inicialización del ledger inmutable de auditoría.';
        const usuario_email = 'sistema@fiel.mx';
        const ip_origen = '127.0.0.1';
        
        const contenido = `${timestamp_utc}|${usuario_email}|${accion}|${detalle}|${ip_origen}|GENESIS`;
        const current_hash = crypto.createHash('sha256').update(contenido, 'utf8').digest('hex');
        
        db.prepare(`
            INSERT INTO bitacora_logs (timestamp_utc, usuario_email, accion, detalle, ip_origen, prev_hash, current_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(timestamp_utc, usuario_email, accion, detalle, ip_origen, prev_hash, current_hash);
        
        console.log('[DB] Seed: Registro génesis insertado en bitacora_logs.');
    }

    console.log('[DB] Tablas disponibles:');
    const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    tablas.forEach(t => console.log(`   - ${t.name}`));
} catch (err) {
    console.error('[DB] Error al inicializar el esquema:', err.message);
    process.exit(1);
}

db.close();

