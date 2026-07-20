// ============================================================
// Versión: v2.2.0
// Archivo: src/db/database.js
// Descripción: Conexión y configuración de la base de datos SQLite
// con better-sqlite3 (síncrono, ideal para Node.js sin concurrencia
// masiva). Exporta la instancia de la DB lista para uso en rutas.
// ============================================================

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Ruta de la base de datos desde variable de entorno
const dbPath = path.resolve(process.env.DB_PATH || './data/sat_control.db');

// Asegurar que el directorio data/ existe antes de crear la BD
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Crear/abrir la conexión a la base de datos
const db = new Database(dbPath);

// Activar WAL (Write-Ahead Logging) para mejor rendimiento en lecturas concurrentes
db.pragma('journal_mode = WAL');
// Activar FOREIGN KEYS para integridad referencial
db.pragma('foreign_keys = ON');

console.log(`[DB] Conexión establecida: ${dbPath}`);

// ------------------------------------------------------------
// Auto-migración idempotente para bases de datos ya existentes:
// 'npm run init-db' solo corre CREATE TABLE IF NOT EXISTS, así que
// una BD creada con una versión anterior del esquema no recibe
// columnas nuevas automáticamente. Este bloque las agrega si faltan,
// sin afectar instalaciones que ya las tengan.
// ------------------------------------------------------------
function agregarColumnaSiFalta(tabla, columna, definicion) {
    const columnas = db.prepare(`PRAGMA table_info(${tabla})`).all().map(c => c.name);
    if (!columnas.includes(columna)) {
        db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
        console.log(`[DB] Migración: columna '${columna}' agregada a '${tabla}'.`);
    }
}

try {
    const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    if (tablas.includes('contribuyentes')) {
        agregarColumnaSiFalta('contribuyentes', 'activo', 'INTEGER NOT NULL DEFAULT 1');
    }
    if (tablas.includes('usuarios')) {
        agregarColumnaSiFalta('usuarios', 'intentos_fallidos', 'INTEGER NOT NULL DEFAULT 0');
        agregarColumnaSiFalta('usuarios', 'bloqueado_hasta', 'INTEGER');
    }
} catch (err) {
    console.error('[DB] Error durante la auto-migración:', err.message);
}

module.exports = db;
