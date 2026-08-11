# PRD: Enlaces Temporales de Descarga Segura con Token Expirable (TTL) y Único Uso

## 1. Objetivo
Implementar un mecanismo seguro para compartir archivos de certificados (`.cer`) y llaves cifradas (`.key`) mediante enlaces temporales de único uso y tiempo de vida configurable, evitando el envío de adjuntos en texto plano por correo o mensajería.

## 2. Puntos de Acoplamiento en la Arquitectura
- **Estructura DB (`src/db/init.js`)**: Agregar la tabla `download_tokens`.
- **Generación (`src/routes/contribuyentes.js`)**: Endpoint autenticado `POST /api/contribuyentes/:rfc/download-token`.
- **Consumo (`src/routes/downloads.js`)**: Endpoint público `GET /api/download/:token` expuesto en `server.js`.

## 3. Requisitos Funcionales
- **Generación de Token:** El usuario autenticado solicita un enlace indicando el `rfc` del contribuyente, el tipo de archivo (`'CER'` o `'KEY'`) y el tiempo de expiración (TTL en minutos/horas).
- **Estructura de Datos (`download_tokens`):**
  - `id`: INTEGER PRIMARY KEY AUTOINCREMENT
  - `token_hash`: TEXT NOT NULL UNIQUE (SHA-256 del token original)
  - `contribuyente_id`: INTEGER NOT NULL (FK a `contribuyentes(id)`)
  - `file_type`: TEXT NOT NULL ('CER' o 'KEY')
  - `expires_at`: DATETIME NOT NULL
  - `is_used`: INTEGER DEFAULT 0 (0 = Disponible, 1 = Usado)
  - `created_by`: INTEGER NOT NULL (FK a `usuarios(id)`)
  - `created_at`: DATETIME DEFAULT CURRENT_TIMESTAMP
- **Consumo de Token:**
  1. El cliente accede a `/api/download/:token`.
  2. Se calcula el SHA-256 de `:token` y se busca en `download_tokens`.
  3. Se valida que `is_used == 0` y `expires_at > DATETIME('now')`.
  4. En una transacción atómica síncrona (`db.transaction`):
     - Marca `is_used = 1`.
     - Registra la acción en `bitacora_logs` encadenando el hash con `registrarEnLedger(...)`.
     - Retorna el archivo binario/payload con cabeceras `Content-Type` y `Content-Disposition: attachment`.
- **Respuestas de Error:** Si el token no existe, ya fue usado o expiró, responde HTTP 410 (Gone) o HTTP 404 (Not Found) sin revelar detalles internos.

## 4. Requisitos de Seguridad e Integridad
- Entropía: Mínimo 32 bytes aleatorios (`crypto.randomBytes(32).toString('hex')`).
- Hashing DB: Solo se persiste el hash SHA-256 del token.
- Integridad Ledger: Todo consumo exitoso o fallido se audita en `bitacora_logs`.