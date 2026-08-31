# Estructura de `src/` — Backend

Esta carpeta contiene **todo el backend** de la aplicación. Es la primera que debes subir a la IA.

```
src/
├── db/
│   ├── database.js
│   └── init.js
├── middleware/
│   └── auth.js
├── routes/
│   ├── auth.js
│   ├── contribuyentes.js
│   ├── downloads.js
│   ├── solicitudes.js
│   ├── alertas.js
│   ├── bitacora.js
│   └── usuarios.js
├── services/
│   └── emailService.js
└── utils/
    ├── crypto.js
    ├── ledger.js
    ├── token.js
    ├── colaAlertas.js
    ├── semaforo.js
    ├── mailer.js
    └── whatsapp.js
```

---

## `src/db/`

### `database.js`
Singleton de conexión SQLite usando `better-sqlite3`. Garantiza que solo exista una instancia de la conexión en todo el proceso Node.

### `init.js`
DDL completo de la base de datos. Define y crea (si no existen) todas las tablas:
- `usuarios` — cuentas del sistema con roles (admin, supervisor, operador)
- `contribuyentes` — datos del contribuyente + blobs cifrados `.cer` y `.key`
- `bitacora_logs` — ledger de auditoría inmutable con encadenamiento SHA-256
- `download_tokens` — tokens temporales de único uso para descarga segura
- `solicitudes_renovacion` — solicitudes que hace el contribuyente para un nuevo enlace
- `alertas_config` — configuración de umbrales y credenciales SMTP/WhatsApp (cifradas)
- `cola_alertas` — cola persistente de mensajes con reintentos y backoff

---

## `src/middleware/`

### `auth.js`
Middleware Express de autenticación JWT.
- Extrae el token del header `Authorization: Bearer <token>`
- Verifica la firma con `JWT_SECRET` del `.env`
- Adjunta `req.user` con `{ id, email, rol }` para uso en los routes
- Exporta también `requerirRol(...roles)` para autorización por rol y `obtenerIP(req)` para logging

---

## `src/routes/`

### `auth.js`
- `POST /api/auth/login` — verifica credenciales, retorna JWT
- `POST /api/auth/logout` — invalidación lógica (el JWT es stateless, el frontend lo borra)
- `GET /api/auth/me` — retorna datos del usuario autenticado

### `contribuyentes.js` ⭐ Archivo más grande (~27KB)
- CRUD completo de contribuyentes
- `POST /api/contribuyentes/:rfc/upload` — recibe `.cer` y `.key`, los cifra con AES-GCM y los guarda
- `POST /api/contribuyentes/:rfc/download-token` — genera token temporal de único uso
  - Acepta `emailDestino` → envía correo con `emailService.js` ✅
  - Acepta `whatsappDestino` → **pendiente de implementar** ❌
- `[Compartir]` link en la tabla de contribuyentes apunta a la vista `downloadLinks`

### `downloads.js`
- `GET /api/download/:token` — endpoint **público** (sin JWT)
  - Calcula SHA-256 del token recibido, busca en `download_tokens`
  - Valida `is_used == 0` y `expires_at > DATETIME('now')`
  - En transacción atómica: marca `is_used = 1`, registra en bitácora, retorna archivo
  - Soporta `file_type`: `CER`, `KEY`, `ZIP` (agrupa ambos con `adm-zip`)
  - HTTP 410 Gone si el token ya fue usado o expiró

### `solicitudes.js`
- `POST /api/download/solicitar-renovacion` — el contribuyente (sin cuenta) solicita nuevo enlace
- `GET /api/solicitudes` — panel admin: lista solicitudes pendientes
- `POST /api/solicitudes/:id/aprobar` — admin genera nuevo token y lo envía por correo

### `alertas.js`
- `GET /api/alertas/config` — obtiene umbrales y estado de canales (sin devolver credenciales cifradas)
- `PUT /api/alertas/config` — actualiza umbrales y credenciales SMTP/WhatsApp (las cifra con AES-GCM antes de guardar)
- `POST /api/alertas/probar` — encola una alerta de prueba y la procesa inmediatamente
  - Acepta `tipo: 'correo'` ✅ funciona
  - Acepta `tipo: 'whatsapp'` ❌ encola pero no se procesa porque `mailer.js` no tiene WhatsApp
- `POST /api/alertas/recalcular` — fuerza recálculo manual del semáforo

### `bitacora.js`
- `GET /api/bitacora` — lista paginada de logs con filtros
- Incluye verificación de integridad del ledger (compara hashes encadenados)

### `usuarios.js`
- CRUD completo de usuarios del sistema con roles

---

## `src/services/`

### `emailService.js` ✅ FUNCIONA EN PRODUCCIÓN
- `getTransporter()` — crea transporte Nodemailer:
  - Si `SMTP_HOST` y `SMTP_USER` están en `.env` → usa SMTP real (Yahoo configurado)
  - Si no → genera cuenta Ethereal automáticamente (para pruebas locales)
  - Llama a `transporter.verify()` para validar la conexión antes de usarla
- `enviarEnlaceTemporal({ emailDestino, rfc, razonSocial, fileType, downloadUrl, expiresAt })`
  - Envía correo HTML estilizado con el enlace temporal
  - Retorna `{ success, previewUrl, messageId }`

---

## `src/utils/`

### `crypto.js`
Cifrado y descifrado AES-GCM-256 a nivel de servidor.
- `cifrar(texto)` → genera IV aleatorio de 12 bytes, cifra, retorna `iv:datos` como hex
- `descifrar(textoCifrado)` → extrae IV, descifra con `ENCRYPTION_KEY` del `.env`
- Usado para: credenciales SMTP, token WhatsApp, y blobs de archivos FIEL

### `ledger.js`
- `registrarLog({ usuario_id, usuario_email, accion, detalle, ip_origen })`
  - Obtiene el hash del último registro
  - Calcula SHA-256 de `(hash_anterior + accion + detalle + timestamp)`
  - Inserta en `bitacora_logs` con el hash encadenado
  - **Garantiza inmutabilidad:** cualquier alteración de un registro rompe la cadena

### `token.js`
- `generarToken()` → `crypto.randomBytes(32).toString('hex')` (64 chars, 256 bits de entropía)
- `hashearToken(token)` → SHA-256 del token (solo el hash se persiste en DB)
- `calcularExpiracion(ttlMinutos)` → retorna `DATE('now', '+N minutes')` para SQLite

### `colaAlertas.js`
Cola persistente en tabla `cola_alertas` con reintentos automáticos.
- `encolarAlerta({ tipo, destinatario, asunto, mensaje, max_intentos })`
- `procesarColaAlertas()` — procesa alertas pendientes:
  - Si `tipo === 'correo'` → llama a `mailer.js` ✅
  - Si `tipo === 'whatsapp'` → **no hace nada actualmente** ❌ (pendiente Paso 17)
  - Backoff: 5 min → 15 min → 30 min entre reintentos
  - Se ejecuta cada minuto desde el cron de `server.js`

### `semaforo.js`
- `recalcularTodos(db)` — actualiza `dias_para_vencer` y `estatus_semaforo` de todos los contribuyentes
  - VERDE: > umbral preventivo días
  - AMARILLO: entre umbral crítico y preventivo
  - ROJO: < umbral crítico días o ya vencido
- Se ejecuta al inicio del servidor y cada día a las 00:00 UTC vía cron

### `mailer.js`
Wrapper sobre `emailService.js` para uso desde `colaAlertas.js`.
- **Solo tiene correo.** No tiene integración WhatsApp. Pendiente Paso 17.

### `whatsapp.js`
Adaptador HTTP REST genérico para WhatsApp. **Ya implementado pero no conectado.**
- `enviarWhatsapp(config, destinatario, mensaje)`
  - Lee `WHATSAPP_API_URL` del `.env`
  - Descifra `config.whatsapp_api_token_cifrado` con `descifrar()`
  - Hace `POST` con `Authorization: Bearer <token>` al proveedor
  - Body: `{ from: config.whatsapp_numero_origen, to: destinatario, message: mensaje }`
  - Compatible con cualquier proveedor REST: Twilio, Meta Cloud API, etc.
  - **No usa ningún SDK propietario** (decisión de diseño intencional)
