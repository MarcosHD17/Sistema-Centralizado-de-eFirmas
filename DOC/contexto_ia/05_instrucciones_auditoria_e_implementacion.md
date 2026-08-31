# Instrucciones para IA Externa — Auditoría e Implementación WhatsApp

## Rol que debes asumir
Eres un desarrollador senior especialista en Node.js, Express, SQLite y seguridad de APIs. Tienes acceso completo al código fuente de este proyecto. Tu trabajo es:
1. Revisar y auditar todo el código
2. Detectar errores, vulnerabilidades y malas prácticas
3. Implementar la única feature pendiente: **notificaciones por WhatsApp (Paso 17)**

Lee primero estos documentos de contexto antes de revisar el código:
- `00_resumen_proyecto.md` — qué hace el sistema y qué está hecho
- `01_estructura_src.md` — estructura y descripción del backend
- `02_estructura_public.md` — estructura y descripción del frontend
- `03_archivos_raiz.md` — archivos raíz y variables de entorno
- `04_modulo_whatsapp.md` — estado del módulo WhatsApp y qué falta

---

## FASE 1 — Auditoría completa del código

Revisa **todos los archivos** que te compartí y reporta hallazgos en las siguientes categorías:

### 1.1 Errores de código
- Bugs lógicos, condiciones mal evaluadas, race conditions
- Manejo incorrecto de errores (try/catch faltantes, promesas sin await)
- Variables no definidas, imports faltantes
- Queries SQL con posibles problemas

### 1.2 Vulnerabilidades de seguridad
Revisa específicamente:

- **Autenticación JWT (`src/middleware/auth.js`):**
  - ¿Valida correctamente el token?
  - ¿Hay rutas que deberían estar protegidas y no lo están?

- **Autorización por roles (`src/routes/`):**
  - ¿Hay endpoints que requieren rol `admin` pero no lo verifican con `requerirRol()`?
  - ¿Un usuario `operador` puede hacer operaciones de `admin`?

- **Descarga de archivos (`src/routes/downloads.js`):**
  - ¿El token de único uso realmente se invalida en transacción atómica?
  - ¿Es posible una condición de carrera entre dos peticiones simultáneas con el mismo token?

- **Criptografía (`src/utils/crypto.js`):**
  - ¿AES-GCM-256 está implementado correctamente?
  - ¿El IV es aleatorio y único por operación de cifrado?
  - ¿Hay algún riesgo de reutilización de IV?

- **Exposición de datos sensibles:**
  - ¿Algún endpoint devuelve el `token_hash`, blobs cifrados, rutas internas o mensajes de error que revelen información del sistema?
  - ¿El endpoint `GET /api/alertas/config` oculta correctamente las credenciales?

- **CORS (`server.js`):**
  - ¿La política de CORS es correcta para producción?
  - ¿Qué pasa si `CORS_ALLOWED_ORIGINS` no está en el `.env`?

- **Rate limiting:**
  - ¿El endpoint `POST /api/auth/login` tiene protección contra fuerza bruta?
  - Si no existe, señálalo como hallazgo ALTA

- **Validación de inputs:**
  - ¿Los endpoints validan tipos y longitudes antes de operar en la DB?
  - ¿Es posible inyectar datos malformados?

- **Upload de archivos (`src/routes/contribuyentes.js`):**
  - ¿`multer` valida el tipo MIME y el tamaño de los archivos `.cer` y `.key`?
  - ¿Hay riesgo de path traversal en los nombres de archivo?

### 1.3 Malas prácticas
- Código duplicado que debería estar en un helper
- Logs que exponen información sensible en producción (`NODE_ENV`)
- Funciones asíncronas que podrían bloquear el event loop innecesariamente

### Formato del reporte de auditoría
Para cada hallazgo, usa este formato:

```
## Hallazgo #N

- **Severidad:** CRÍTICA / ALTA / MEDIA / BAJA
- **Archivo:** src/routes/ejemplo.js
- **Línea aproximada:** ~45
- **Descripción:** Qué es el problema
- **Impacto:** Qué puede pasar si no se corrige
- **Solución propuesta:** Cómo corregirlo (con código si aplica)
```

---

## FASE 2 — Implementar Paso 17: Notificaciones por WhatsApp

### Contexto previo (lee `04_modulo_whatsapp.md` para el detalle completo)

**Ya existe y funciona:**
- `src/utils/whatsapp.js` — adaptador HTTP REST con `enviarWhatsapp(config, destinatario, mensaje)`
- `src/routes/alertas.js` — ya guarda y cifra el token WhatsApp, ya acepta `tipo: 'whatsapp'` en `/probar`
- `src/utils/colaAlertas.js` — cola persistente con backoff, se ejecuta cada minuto

**Lo que falta conectar:**
1. `colaAlertas.js` no llama a `enviarWhatsapp()` cuando procesa alertas de tipo `'whatsapp'`
2. No existe `src/services/whatsappService.js` (equivalente a `emailService.js`)
3. `src/routes/contribuyentes.js` no envía por WhatsApp al generar un token temporal
4. `public/js/views/downloadLinks.js` no tiene campo de número WhatsApp
5. `public/js/views/alertas.js` puede que no tenga campos de configuración de WhatsApp en la UI

### Implementación requerida

#### 2.1 — `src/utils/colaAlertas.js`
Conectar `enviarWhatsapp()` al procesador de la cola cuando `tipo === 'whatsapp'`.
- Importar `{ enviarWhatsapp }` de `../utils/whatsapp`
- Obtener la `config` de `alertas_config` (igual que se hace para correo)
- Construir el mensaje de texto plano con emojis (WhatsApp no admite HTML)
- Manejar el error igual que el correo: marcar como fallido con `ultimo_error`, programar reintento

#### 2.2 — `src/services/whatsappService.js` (archivo nuevo)
Crear análogo a `emailService.js` con:

```js
async function enviarEnlaceTemporalWhatsApp({ 
    numeroDestino, rfc, razonSocial, fileType, downloadUrl, expiresAt 
})
```

Formato del mensaje (texto plano, sin HTML):
```
🔐 SAT Control Manager
Se generó un enlace de descarga seguro para:

📋 {razonSocial}
🔑 RFC: {rfc}
📁 Tipo: {fileType}

🔗 Descargar:
{downloadUrl}

⚠️ Enlace de ÚNICO USO
Expira: {fecha formateada}

Este mensaje fue generado automáticamente.
```

Retornar `{ success: true }` o `{ success: false, error: '...' }`.

#### 2.3 — `src/routes/contribuyentes.js`
En `POST /api/contribuyentes/:rfc/download-token`, agregar después del bloque de correo:

```js
if (whatsappDestino) {
    const resultadoWapp = await enviarEnlaceTemporalWhatsApp({
        numeroDestino: whatsappDestino,
        rfc, razonSocial, fileType: tipo_archivo,
        downloadUrl, expiresAt
    });
    registrarLog({
        usuario_id: req.user.id,
        usuario_email: req.user.email,
        accion: 'ENVIO_WHATSAPP_ENLACE_TEMPORAL',
        detalle: `Enlace temporal enviado por WhatsApp a ${whatsappDestino} para ${rfc}`,
        ip_origen: obtenerIP(req)
    });
}
```

Si falla, **no bloquear la respuesta** — misma política que el correo.

#### 2.4 — `public/js/views/downloadLinks.js`
Agregar campo de número WhatsApp debajo del campo de correo, con el mismo estilo visual:

```html
<input type="tel" id="input-whatsapp" placeholder="+521234567890"
       pattern="^\+[0-9]{10,15}$" />
```

Incluirlo como `whatsappDestino` en el body del `fetch POST`.

#### 2.5 — `public/js/views/alertas.js`
Si los campos de configuración de WhatsApp no existen, agregarlos en la sección de configuración de canales:
- Toggle para activar/desactivar WhatsApp
- Input `whatsapp_api_token` (tipo password, con botón show/hide)
- Input `whatsapp_numero_origen` (formato internacional)

### Restricciones de implementación
- **No cambies la arquitectura existente.** Sigue el mismo patrón que el correo.
- **No instales ningún SDK propietario** (no instales twilio, whatsapp-web.js, etc.). El adaptador REST genérico es intencional.
- **Todo envío** (exitoso o fallido) debe registrarse en `bitacora_logs` via `registrarLog()`.
- **No expongas el token de WhatsApp** en ninguna respuesta de la API.

---

## FASE 3 — Verificación final

Después de implementar, verifica que:

1. `POST /api/alertas/probar` con `{ tipo: 'whatsapp', destinatario: '+521234567890' }` llama realmente al proveedor (aunque falle por falta de `WHATSAPP_API_URL` en este entorno — debe fallar con error claro, no silenciosamente)

2. El token se descifra correctamente antes de usarlo en el header `Authorization`

3. Si `WHATSAPP_API_URL` no está en `.env`, el sistema falla con error `'WHATSAPP_API_URL no está configurada en el entorno del servidor.'` — no silenciosamente

4. Si `whatsapp_activo = 0` en `alertas_config`, no se intenta ningún envío

5. El campo de WhatsApp en `downloadLinks.js` funciona independientemente del campo de correo — puedes enviar por ambos, solo uno o ninguno

---

## Notas de seguridad críticas del sistema (no modificar estos comportamientos)

> **NUNCA** descifres archivos `.key` del contribuyente en el servidor.  
> El descifrado ocurre **solo en el navegador** usando Web Crypto API + PBKDF2.  
> El servidor solo almacena y entrega el blob cifrado.

- `ENCRYPTION_KEY` en `.env` → solo para cifrar metadatos y credenciales de config
- El **Ledger de bitácora** es inmutable por diseño. No implementes borrado ni edición de logs.
- Los tokens de descarga solo se persisten como hash SHA-256, **nunca** el token original.
