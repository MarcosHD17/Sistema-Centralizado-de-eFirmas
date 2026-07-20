# Análisis de Pruebas y Reporte de Errores — SAT Control Manager v2.2.4

Se presenta el informe de análisis de pruebas, hallazgos verificados y resolución de errores para la plataforma **SAT Control Manager**, elaborado por el Arquitecto de Software y Programador Senior Polyglot.

---

## 🚀 Estado de la Inicialización de Servicios

1. **Instalación de Dependencias (`npm install`):**
   * Comando ejecutado de manera exitosa. Se detectó una advertencia menor no bloqueante de `node-gyp` debido a la falta de un entorno local de Python para compilar `better-sqlite3`. Sin embargo, la carpeta `node_modules` preexistente contenía los binarios funcionales correctos, por lo que el backend se comunica con SQLite sin inconvenientes.
2. **Inicialización de la Base de Datos (`npm run init-db`):**
   * El proceso se completó con éxito. Se creó la base de datos `data/sat_control.db` con el esquema relacional íntegro, el bloque génesis de la bitácora criptográfica y el usuario administrador semilla (`admin@fiel.mx` / `Admin1234.`).
3. **Inicio del Servidor de Desarrollo (`npm run dev`):**
   * El servidor se encuentra activo de fondo en el puerto `3001` procesando peticiones.

---

## 🛠️ Errores Críticos Detectados y Corregidos (Fuera del Excel)

Durante la puesta en marcha de los servicios, se detectaron y corrigieron de inmediato dos bloqueos del sistema de nivel arquitectónico:

### 1. Crasheo de Arranque del Servidor (TypeError en Middleware)
* **Defecto:** El archivo `src/middleware/auth.js` de la carpeta middleware fue sobreescrito en el commit anterior por el archivo de rutas `src/routes/auth.js`. Al intentar importarse a sí mismo, exportaba un objeto Express Router en lugar de las funciones de middleware (`autenticar`, `requerirRol`, `obtenerIP`), causando un fallo fatal de tipo `TypeError: argument handler must be a function` al registrar las rutas y deteniendo por completo el backend.
* **Corrección:** 
  * Se restauró el archivo `src/middleware/auth.js` a su versión original utilizando Git.
  * Se actualizó la versión del archivo a `v2.2.3` y posteriormente a `v2.2.4`.
  * Se actualizó la versión general en `package.json` a `2.2.4`.
  * Se realizó el commit correspondiente en Git.

### 2. Variable de Entorno `ENCRYPTION_KEY` Inexistente
* **Defecto:** La lógica del backend utiliza cifrado simétrico AES-256-GCM para proteger credenciales SMTP y de WhatsApp en reposo. Para esto, requiere una llave maestra de 32 bytes (64 caracteres hexadecimales) definida en la variable de entorno `ENCRYPTION_KEY` dentro del archivo `.env`. Al no estar declarada en el `.env` provisto, la API fallaba con errores HTTP 500 (`No fue posible cifrar las credenciales proporcionadas`) al intentar guardar configuraciones de canales.
* **Corrección:**
  * Se generó una clave de 32 bytes criptográficamente segura: `afc4f534058f0bf1ad7627924ad0e2a1b2c0afd3d5f96e9ec49ba1a375bb7d00`.
  * Se añadió la variable al archivo `.env` (ignorado en Git por seguridad).
  * Se verificó que la API cifre y descifre sin errores tras reiniciar el servidor.

---

## 📊 Verificación del Plan de Pruebas SAT Control Manager

De acuerdo con el documento `Plan_de_Pruebas_SAT_Control_Manager (3).xlsx`, se verificó la corrección de los **18 hallazgos críticos corregidos** mediante pruebas de integración local (Powershell / Node.js). A continuación se detalla la efectividad de cada corrección:

| ID Hallazgo | Componente / Ruta | Defecto Anterior | Estado de Corrección (Verificado) |
| :--- | :--- | :--- | :--- |
| **#1** | `contribuyentes.js` | La ruta `GET /:rfc` estaba declarada antes que `GET /dashboard/kpis`, haciendo que la API del tablero fuera inalcanzable (match erróneo con RFC='DASHBOARD'). | **✅ Corregido:** Las rutas fueron reordenadas. El endpoint de KPIs responde correctamente con HTTP 200 y JSON estructurado. |
| **#2** | `contribuyentes.js` | `PUT /:rfc` (renovación) no validaba la cartera de contribuyentes asignados para operadores. | **✅ Corregido:** Ahora comprueba el rol. Si es operador, valida que `responsable_id == req.user.id`; de lo contrario, responde 403 Forbidden. |
| **#3** | `alertas.js` | Las credenciales críticas se "cifraban" solo convirtiendo el string a Base64 en la base de datos. | **✅ Corregido:** Ahora se usa cifrado AES-256-GCM real con autenticación de datos asociados (AEAD) vía `utils/crypto.js`. |
| **#4** | `usuarios.js` | La ruta `PUT /usuarios/:id` no validaba correos duplicados, causando una excepción de base de datos no controlada (HTTP 500). | **✅ Corregido:** Implementada verificación previa que valida la existencia del email y retorna un error 409 Conflict controlado. |
| **#5** | `contribuyentes.js` | El endpoint de baja `DELETE /:rfc` estaba documentado pero no existía en el código del enrutador. | **✅ Corregido:** Implementado endpoint de baja lógica (soft-delete) marcando la columna `activo = 0` (exclusivo para Admin/Supervisor). |
| **#6** | `server.js` | CORS abierto a todos los orígenes (`*`) en rutas de escritura. | **✅ Corregido:** Implementado allow-list mediante `CORS_ALLOWED_ORIGINS` en el archivo de entorno. |
| **#7** | `auth.js` | Login con 2FA activo pero sin código TOTP retornaba un HTTP 200 sin código explícito de control. | **✅ Corregido:** Ahora el cuerpo de la respuesta con HTTP 200 incluye de forma explítica el código `TOTP_REQUERIDO` para facilitar el flujo en dos pasos del cliente. |
| **#8** | `alertas.js` | El simulador de envío de alertas de prueba usaba valores aleatorios (`Math.random()`), impidiendo pruebas deterministas. | **✅ Corregido:** Se reemplazó por reintentos de envío reales a través de la nueva cola de alertas persistente. |
| **#9** | `index.html` | Errores de sintaxis fatales por dos bloques `catch` huérfanos (sin `try`), lo cual rompía toda la SPA en cualquier navegador. | **✅ Corregido:** Estructura de bloques `try/catch` balanceada (15/15). La SPA carga y parsea el script inline exitosamente. |
| **#10** | `index.html` | El botón de verificación de integridad del ledger no existía en la UI, imposibilitando auditar de forma manual desde el cliente. | **✅ Corregido:** Agregado el botón `#btnVerifyLedger` con su respectivo handler en la interfaz web para verificar la cadena de bloques. |
| **#11** | `index.html` | El flujo de registro de firmas (CU-01) estaba simulado por completo en el DOM y no se conectaba a la base de datos real. | **✅ Corregido:** Se enlazaron las acciones del frontend para leer metadatos reales, cifrar localmente la clave `.key` con AES-GCM-256 en cliente y persistir los datos vía POST. |
| **#12** | `alertas.js` | El motor de mensajería carecía de implementaciones para envío real de correos o WhatsApp. | **✅ Corregido:** Implementados `utils/mailer.js` (SMTP vía nodemailer) y `utils/whatsapp.js` (peticiones HTTP REST). |
| **#13** | `alertas.js` | El backoff exponencial de las alertas se simulaba de forma síncrona en memoria, perdiendo las alertas en caso de caída del servidor. | **✅ Corregido:** Creada la tabla `cola_alertas` en base de datos. Se procesan los reintentos persistentes con backoff programado de 5, 15 y 30 minutos. |
| **#14** | `auth.js` | Ausencia de rate limiting en el login, permitiendo ataques de fuerza bruta al TOTP. | **✅ Corregido:** Se integró `express-rate-limit` por IP y bloqueo temporal por cuenta de 15 minutos tras 5 intentos fallidos acumulados. |
| **#15** | `server.js` | No existía un servicio automático para el recálculo semafórico nocturno de vigencias. | **✅ Corregido:** Programado un cron job en el servidor usando `node-cron` a las 00:00 UTC. |
| **#16** | `contribuyentes.js` | No se alertaba a los administradores cuando un operador alcanzaba el límite diario de consultas de clave (10 consultas). | **✅ Corregido:** Al exceder el límite diario, el sistema encola automáticamente una alerta a los supervisores y administradores activos. |
| **#17** | `index.html` | Variables globales críticas (`API_URL`, `token`, `usuarioActual`, `modoOffline`) no declaradas, causando fallos ReferenceError. | **✅ Corregido:** Declaradas al inicio del script inline para asegurar un correcto ciclo de vida e inicio. |
| **#18** | `index.html` | Funciones `inicializarDatosDemo()` y `mockRequest()` invocadas en el modo offline pero ausentes. | **✅ Corregido:** Ambas funciones implementadas con mock-data en memoria para garantizar que el frontend funcione de forma autónoma. |

---

## 🔍 Hallazgos de Nuevos Errores o Áreas de Oportunidad

Analizando minuciosamente el código del backend, se detectaron las siguientes áreas de oportunidad y posibles incidencias para desarrollo futuro:

1. **Variables de Ejemplo Faltantes en el `.env` (Baja):**
   * El backend cuenta con integraciones reales para SMTP y WhatsApp, pero el archivo `.env` no provee las variables correspondientes a nivel de documentación (ej. `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, etc.) ni la propia `ENCRYPTION_KEY`. Se recomienda crear un archivo `.env.example` en la raíz del proyecto para documentar estas variables de forma segura.
2. **Ambivalencia en Fronteras del Semáforo (Baja):**
   * Las reglas de negocio especifican rangos semafóricos (ej. "entre 30 y 90 días"). Sin embargo, el código utiliza comparaciones menores o iguales (`<= 90` y `<= 30`), lo cual puede provocar desfases menores de estatus si el valor cae exactamente en la frontera. Esto se documentó en el caso de prueba `CU02-02` y `CU02-04`, y requiere alineación formal con negocio en la próxima etapa.
