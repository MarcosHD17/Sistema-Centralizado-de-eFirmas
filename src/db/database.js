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

module.exports = db;
