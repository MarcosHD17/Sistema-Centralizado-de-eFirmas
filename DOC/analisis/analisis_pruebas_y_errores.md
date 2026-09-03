# Análisis de Pruebas y Reporte de Errores — SAT Control Manager v2.3.2

Se presenta el informe de análisis de pruebas, hallazgos verificados y resolución de errores para la plataforma **SAT Control Manager**, elaborado por el Arquitecto de Software y Programador Senior Polyglot.

---

## 🚀 Estado de la Inicialización de Servicios

1. **Instalación de Dependencias (`npm install`):**
   * Comando ejecutado de manera exitosa. Se instaló la librería oficial `twilio` para soporte de mensajería WhatsApp.
2. **Inicialización de la Base de Datos (`npm run init-db`):**
   * El proceso se completó con éxito. Se creó la base de datos `data/sat_control.db` con el esquema relacional íntegro, el bloque génesis de la bitácora criptográfica y el usuario administrador semilla (`admin@fiel.mx` / `Admin1234.`).
3. **Inicio del Servidor de Desarrollo (`npm run dev`):**
   * El servidor se encuentra activo procesando peticiones en el puerto `3001`.

---

## 🛠️ Errores Críticos Detectados y Corregidos (Fuera del Excel)

Durante la puesta en marcha de los servicios, se detectaron y corrigieron de inmediato dos bloqueos del sistema de nivel arquitectónico:

### 1. Crasheo de Arranque del Servidor (TypeError en Middleware)
* **Defecto:** El archivo `src/middleware/auth.js` de la carpeta middleware fue sobreescrito en el commit anterior por el archivo de rutas `src/routes/auth.js`. Al intentar importarse a sí mismo, exportaba un objeto Express Router en lugar de las funciones de middleware (`autenticar`, `requerirRol`, `obtenerIP`), causando un fallo fatal de tipo `TypeError: argument handler must be a function` al registrar las rutas y deteniendo por completo el backend.
* **Corrección:** 
  * Se restauró el archivo `src/middleware/auth.js` a su versión original utilizando Git.
  * Se actualizó la versión del archivo a `v2.2.3` y posteriormente a `v2.3.2`.

### 2. Variable de Entorno `ENCRYPTION_KEY` Inexistente
* **Defecto:** La lógica del backend utiliza cifrado simétrico AES-256-GCM para proteger credenciales SMTP y de WhatsApp en reposo. Para esto, requiere una llave maestra de 32 bytes (64 caracteres hexadecimales) definida en la variable de entorno `ENCRYPTION_KEY` dentro del archivo `.env`. Al no estar declarada en el `.env` provisto, la API fallaba con errores HTTP 500 (`No fue posible cifrar las credenciales proporcionadas`) al intentar guardar configuraciones de canales.
* **Corrección:**
  * Se generó una clave de 32 bytes criptográficamente segura: `afc4f534058f0bf1ad7627924ad0e2a1b2c0afd3d5f96e9ec49ba1a375bb7d00`.
  * Se añadió la variable al archivo `.env` (ignorado en Git por seguridad).

---

## 📱 Diagnóstico e Integración de Twilio WhatsApp API & Content Templates (v2.3.2)

### 📲 Hallazgo de Entrega Asíncrona vs HTTP 201 en Twilio API
* **Defecto / Comportamiento:** La llamada `twilioClient.messages.create()` responde de forma síncrona con un estado HTTP 201 y asigna un `MessageSid` (ej. `SM...` o `MM...`), indicando únicamente que el mensaje fue **encolado exitosamente**. Sin embargo, esto **no garantiza la entrega en el dispositivo destino** si:
  1. El mensaje es de texto libre (freeform) con URLs/Markdown fuera de la ventana de sesión de 24 horas de WhatsApp.
  2. El número de teléfono no incluye el prefijo internacional `+521` para números móviles de México.
  3. No se utiliza una Plantilla Aprobada (**Content Template**) en producción.

### 🇲🇽 Normalización Automática de Celulares de México (`+521`)
* **Causa del Error 63015 de Twilio:** La red Meta/WhatsApp para México exige el prefijo **`+521`** seguido de los 10 dígitos celulares (ej. `+5218116054215`). Si la petición se realiza con `+528116054215` (sin el `1`), Twilio encola la petición pero Meta la descarta asíncronamente devolviendo el error `63015: Channel User not found`.
* **Solución:** Se implementó una función de auto-normalización en frontend (`downloadLinks.js`, `alertas.js`) y backend (`contribuyentes.js`, `alertas.js`, `whatsappService.js`) que transforma automáticamente entradas de 10 dígitos o `+52` al estándar internacional `+521`.

### 📑 Plantillas Aprobadas (`TWILIO_CONTENT_SID`) y Fallback Defensivo
* **Lógica Implementada:**
  - Si la variable `TWILIO_CONTENT_SID` está definida en el `.env`, `whatsappService.js` despacha el mensaje utilizando `contentSid` y sus `contentVariables` estructuradas (`{"1": rfc, "2": downloadUrl}`).
  - Si `TWILIO_CONTENT_SID` no está configurada, el servicio emite una advertencia en consola (`console.warn`) y cae defensivamente al mensaje freeform con el enlace completo, asegurando que el canal no quede deshabilitado durante fases de prueba o Sandbox.

### 📜 Auditoría Transparente en Bitácora (`bitacora_logs`)
* **Registro de Auditoría:** Para evitar ambigüedades en futuras auditorías sobre por qué algunos envíos se entregan y otros fallan según las reglas de Meta, el campo `detalle` de `bitacora_logs` registra explícitamente el modo de envío utilizado:
  - `ENVIO_WHATSAPP_ENLACE_TEMPORAL | RFC: SDT200101XYZ | Destino: +5218116054215 | Modo: Content Template (HXb5b...) | SID: MM...`
  - `ENVIO_WHATSAPP_ENLACE_TEMPORAL | RFC: SDT200101XYZ | Destino: +5218116054215 | Modo: Freeform (sin plantilla) | SID: SM...`

---

## 📊 Verificación del Plan de Pruebas SAT Control Manager

| ID Hallazgo | Componente / Ruta | Defecto Anterior | Estado de Corrección (Verificado) |
| :--- | :--- | :--- | :--- |
| **#1** | `contribuyentes.js` | La ruta `GET /:rfc` estaba declarada antes que `GET /dashboard/kpis`, haciendo que la API del tablero fuera inalcanzable. | **✅ Corregido:** Las rutas fueron reordenadas. El endpoint de KPIs responde correctamente con HTTP 200 y JSON estructurado. |
| **#2** | `contribuyentes.js` | `PUT /:rfc` (renovación) no validaba la cartera de contribuyentes asignados para operadores. | **✅ Corregido:** Valida rol. Si es operador, requiere `responsable_id == req.user.id`; de lo contrario, responde 403. |
| **#3** | `alertas.js` | Las credenciales críticas se "cifraban" convirtiendo el string a Base64. | **✅ Corregido:** Cifrado AES-256-GCM real con autenticación AEAD vía `utils/crypto.js`. |
| **#4** | `usuarios.js` | `PUT /usuarios/:id` no validaba correos duplicados, causando HTTP 500. | **✅ Corregido:** Verificación previa que retorna error 409 Conflict controlado. |
| **#5** | `contribuyentes.js` | Endpoint de baja `DELETE /:rfc` ausente en el código. | **✅ Corregido:** Implementada baja lógica (`activo = 0`). |
| **#6** | `server.js` | CORS abierto a todos los orígenes (`*`). | **✅ Corregido:** Implementado allow-list mediante `CORS_ALLOWED_ORIGINS`. |
| **#7** | `auth.js` | Login con 2FA activo sin código TOTP no retornaba código explícito. | **✅ Corregido:** Incluye código `TOTP_REQUERIDO` en la respuesta. |
| **#8** | `alertas.js` | El simulador de alertas usaba `Math.random()`. | **✅ Corregido:** Sustituido por envíos reales vía cola de alertas persistente. |
| **#9** | `index.html` | Errores de sintaxis fatales por bloques `catch` huérfanos. | **✅ Corregido:** Bloques `try/catch` balanceados. |
| **#10** | `index.html` | Botón de verificación de integridad del ledger ausente en la UI. | **✅ Corregido:** Agregado botón `#btnVerifyLedger` con su handler en la SPA. |
| **#11** | `index.html` | Registro de firmas (CU-01) no se conectaba a la base de datos real. | **✅ Corregido:** Enlazado con metadatos X.509 y cifrado AES-GCM-256 en cliente. |
| **#12** | `alertas.js` | Ausencia de adaptadores reales para correo y WhatsApp. | **✅ Corregido:** Implementados `utils/mailer.js` (SMTP Yahoo) y `utils/whatsapp.js` (Twilio SDK). |
| **#13** | `alertas.js` | Backoff exponencial en memoria se perdía tras caídas de servidor. | **✅ Corregido:** Creada la tabla `cola_alertas` con reintentos de 5, 15 y 30 min. |
| **#14** | `auth.js` | Ausencia de rate limiting en el login. | **✅ Corregido:** Rate limiter por IP y bloqueo de 15 min tras 5 fallos. |
| **#15** | `server.js` | Ausencia de recálculo semafórico nocturno. | **✅ Corregido:** Cron job programado a las 00:00 UTC. |
| **#16** | `contribuyentes.js` | Sin alerta al superar límite diario de 10 consultas de clave. | **✅ Corregido:** Encola alerta automática a supervisores al exceder la cuota. |
| **#17** | `index.html` | Variables globales críticas no declaradas. | **✅ Corregido:** Declaradas al inicio de la SPA. |
| **#18** | `index.html` | Funciones demo invocadas en modo offline ausentes. | **✅ Corregido:** Implementados datos demo locales en memoria. |
| **#19** | `whatsapp.js` | Incompatibilidad con formato celular de México. | **✅ Corregido:** Auto-formato `+521` (evita Error 63015 de Twilio/Meta). |
| **#20** | `whatsapp.js` | Notificaciones descartadas fuera de la ventana de 24 horas. | **✅ Corregido:** Integración de Twilio Content Templates (`contentSid` / `contentVariables`). |
