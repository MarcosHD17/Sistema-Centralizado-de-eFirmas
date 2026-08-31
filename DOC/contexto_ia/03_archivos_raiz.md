# Archivos Raíz — Qué Subir y Qué No

## ✅ Archivos raíz que sí debes subir a una IA

| Archivo | Tamaño | Descripción |
|---------|--------|-------------|
| `server.js` | ~7KB | Entry point del servidor Express |
| `schema.sql` | ~6KB | DDL de referencia de toda la base de datos |
| `package.json` | ~1KB | Dependencias del proyecto |
| `index.html` | ~160KB | Shell HTML de la SPA (carga los módulos de `public/js/`) |

---

## 🚫 Archivos que NUNCA debes subir

| Archivo/Carpeta | Motivo |
|-----------------|--------|
| `.env` | ⚠️ **Credenciales, claves secretas, tokens de API** |
| `prueba.cer` | ⚠️ **Certificado digital — datos privados del SAT** |
| `node_modules/` | ❌ Innecesario, muy pesado (miles de archivos) |
| `.git/` | ❌ Historial interno de Git |
| `package-lock.json` | ❌ Generado automáticamente |
| `data/` | ⚠️ Puede contener datos reales de usuarios/empresas |

---

## Descripción de cada archivo raíz

### `server.js`
Entry point principal del servidor Express. Hace:
1. Configura CORS restrictivo leyendo `CORS_ALLOWED_ORIGINS` del `.env`
2. Monta todos los routers de `src/routes/`
3. Sirve el frontend estático (`index.html` + `public/`)
4. Logger middleware de consola para cada petición
5. Middleware global de manejo de errores con registro en bitácora
6. Health check en `GET /api/health`
7. **Cron 1:** Recálculo semafórico todos los días a las 00:00 UTC
8. **Cron 2:** Procesamiento de la cola de alertas cada minuto (reintentos con backoff)
9. Apagado seguro con `SIGINT` — cierra la conexión DB antes de salir

### `schema.sql`
DDL de referencia (no ejecutado directamente — `src/db/init.js` lo ejecuta en código).
Útil para:
- Entender la estructura completa de la base de datos de un vistazo
- Referencia para la IA al analizar queries en los routes
- Documentación del esquema para el equipo

### `package.json`
Dependencias principales:
```
express          — Framework HTTP
better-sqlite3   — SQLite síncrono de alto rendimiento
jsonwebtoken     — Autenticación JWT
bcrypt           — Hash de contraseñas de usuarios
dotenv           — Variables de entorno desde .env
cors             — Middleware CORS
multer           — Upload de archivos (.cer, .key)
nodemailer       — Envío de correos SMTP
adm-zip          — Generación de paquetes ZIP (CER + KEY)
node-cron        — Cron jobs (recálculo semáforo + cola alertas)
```

### `index.html`
Shell HTML mínimo de la SPA. Contiene:
- Links a `public/css/main.css`
- Tags `<script type="module">` que cargan los módulos de `public/js/`
- Contenedor raíz donde el router inyecta las vistas
- Meta tags de seguridad (CSP, X-Frame-Options)

---

## Variables de entorno requeridas (`.env`)

> No subas este archivo. Pero la IA necesita saber qué variables existen para analizar el código correctamente.

```env
# Servidor
PORT=3001
NODE_ENV=development

# JWT
JWT_SECRET=clave_secreta_muy_larga

# Cifrado AES-GCM-256 (para credenciales de config, NO para archivos FIEL)
ENCRYPTION_KEY=clave_hex_de_64_caracteres

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500

# SMTP (Yahoo configurado)
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tucorreo@yahoo.com
SMTP_PASS=app_password_yahoo
EMAIL_FROM="SAT Control Manager" <no-reply@satcontrol.local>

# WhatsApp (pendiente de configurar con proveedor real)
WHATSAPP_API_URL=https://api.tuproveedor.com/v1/messages
```
