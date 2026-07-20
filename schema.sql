-- ============================================================
-- Versión: v2.2.0
-- Archivo: schema.sql
-- Descripción: Esquema de base de datos relacional oficial para
-- SAT Control Manager (SQLite).
-- ============================================================

-- Tabla de Usuarios con roles RBAC (Administrador, Supervisor, Operador)
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

-- Tabla de Expedientes de Contribuyentes
CREATE TABLE IF NOT EXISTS contribuyentes (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    rfc                 TEXT NOT NULL UNIQUE,
    razon_social        TEXT NOT NULL,
    email_contacto      TEXT,
    telefono_contacto   TEXT,
    fecha_emision       TEXT NOT NULL,
    fecha_vencimiento   TEXT NOT NULL,
    -- Payload cifrado AES-GCM-256 de la clave privada (.key) generado en el cliente
    key_payload_cifrado TEXT,
    -- Metadatos extraídos del certificado (.cer)
    cer_numero_serie    TEXT,
    cer_emisor          TEXT,
    -- Estatus calculado por el motor semafórico
    estatus             TEXT NOT NULL DEFAULT 'vigente' CHECK(estatus IN ('vigente', 'preventivo', 'critico', 'expirado')),
    dias_restantes      INTEGER,
    -- Soft-delete (CU-01c): 1 = activo/visible, 0 = dado de baja
    activo               INTEGER NOT NULL DEFAULT 1,
    responsable_id      INTEGER NOT NULL REFERENCES usuarios(id),
    creado_en           INTEGER NOT NULL DEFAULT (unixepoch()),
    actualizado_en      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Tabla de Historial de Renovaciones de Certificados
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

-- Tabla de Configuración de Alertas Semafóricas y Canales de Notificación
CREATE TABLE IF NOT EXISTS alertas_config (
    id                          INTEGER PRIMARY KEY DEFAULT 1,
    umbral_critico_dias         INTEGER NOT NULL DEFAULT 30,
    umbral_preventivo_dias      INTEGER NOT NULL DEFAULT 90,
    correo_activo               INTEGER NOT NULL DEFAULT 1,
    whatsapp_activo             INTEGER NOT NULL DEFAULT 0,
    correo_smtp_host            TEXT,
    correo_smtp_puerto          INTEGER DEFAULT 587,
    correo_smtp_usuario         TEXT,
    correo_smtp_pass_cifrado    TEXT,
    whatsapp_api_token_cifrado  TEXT,
    whatsapp_numero_origen      TEXT,
    max_reintentos              INTEGER NOT NULL DEFAULT 3,
    actualizado_en              INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Tabla de Consultas de Claves Privadas (Límite diario por Operador)
CREATE TABLE IF NOT EXISTS consultas_contrasena_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
    contribuyente_rfc TEXT NOT NULL,
    fecha_consulta  TEXT NOT NULL DEFAULT (date('now')),
    consultado_en   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Tabla de Bitácora Ledger-Chain Inmutable (Integridad Criptográfica SHA-256)
CREATE TABLE IF NOT EXISTS bitacora_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp_utc   INTEGER NOT NULL DEFAULT (unixepoch()),
    usuario_id      INTEGER REFERENCES usuarios(id),
    usuario_email   TEXT,
    accion          TEXT NOT NULL,
    detalle         TEXT,
    ip_origen       TEXT,
    prev_hash       TEXT,
    current_hash    TEXT NOT NULL
);

-- Tabla de Cola de Alertas con Reintentos Persistentes (OBS-005)
-- Sobrevive a reinicios del servidor: una alerta pendiente no se
-- pierde si el proceso cae a mitad de un reintento.
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

-- Índices de Rendimiento
CREATE INDEX IF NOT EXISTS idx_contribuyentes_estatus ON contribuyentes(estatus);
CREATE INDEX IF NOT EXISTS idx_contribuyentes_responsable ON contribuyentes(responsable_id);
CREATE INDEX IF NOT EXISTS idx_contribuyentes_vencimiento ON contribuyentes(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_bitacora_timestamp ON bitacora_logs(timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS idx_bitacora_usuario ON bitacora_logs(usuario_id);
CREATE INDEX IF NOT EXISTS idx_consultas_usuario_fecha ON consultas_contrasena_log(usuario_id, fecha_consulta);
CREATE INDEX IF NOT EXISTS idx_cola_alertas_estatus ON cola_alertas(estatus, proximo_reintento_en);
CREATE INDEX IF NOT EXISTS idx_contribuyentes_activo ON contribuyentes(activo);
