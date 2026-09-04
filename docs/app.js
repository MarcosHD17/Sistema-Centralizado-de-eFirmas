/* =============================================================
   SAT Control Manager — Dashboard Arquitectura v2.3.4
   docs/app.js — JavaScript modular puro (sin dependencias externas)
   ============================================================= */

'use strict';

// ══════════════════════════════════════════════════════════════
// 0. DATA — Base de conocimiento del sistema
// ══════════════════════════════════════════════════════════════

const MODULES = [
  // ── CORE ──
  {
    id: 'server',
    file: 'server.js',
    path: 'server.js',
    layer: 'core',
    badge: 'core',
    icon: '🚀',
    what: 'Punto de entrada único del servidor. Monta Express, registra middlewares CORS/JSON, enlaza todos los routers de la API, lanza los cronjobs (recálculo semafórico nocturno + procesamiento de cola de alertas cada minuto) y gestiona el apagado seguro (SIGINT).',
    why: 'Existe como "composer root" para que ningún módulo necesite conocer a los demás. Al aislarlo se puede sustituir el framework (Express 5 → Fastify) sin tocar la lógica de negocio.',
    critical: 'Cambiar el orden de registro de rutas puede ocultar endpoints (ej: /:rfc antes de /dashboard/kpis causó el QA#1). Los cronjobs deben iniciar DESPUÉS de db.ready.',
    deps: ['src/db/database.js', 'src/utils/semaforo.js', 'src/utils/ledger.js', 'src/utils/colaAlertas.js', 'src/routes/auth.js', 'src/routes/usuarios.js', 'src/routes/contribuyentes.js', 'src/routes/alertas.js', 'src/routes/downloads.js', 'src/routes/solicitudes.js', 'src/routes/bitacora.js']
  },
  // ── DB ──
  {
    id: 'database',
    file: 'database.js',
    path: 'src/db/database.js',
    layer: 'db',
    badge: 'db',
    icon: '🗄️',
    what: 'Singleton de conexión SQLite (better-sqlite3). Activa WAL + FOREIGN KEYS. Ejecuta auto-migraciones idempotentes al arrancar (agrega columnas faltantes sin romper BDs existentes). Exporta la instancia db lista para usar en todo el servidor.',
    why: 'Singleton garantiza una sola conexión compartida (better-sqlite3 es síncrono y single-threaded). La migración automática elimina pasos manuales al desplegar actualizaciones.',
    critical: 'Nunca crear una segunda instancia de Database(). La ruta DB_PATH debe resolverse con path.resolve() para funcionar en cualquier OS. Quitar WAL degrada lecturas concurrentes.',
    deps: []
  },
  {
    id: 'init',
    file: 'init.js',
    path: 'src/db/init.js',
    layer: 'db',
    badge: 'db',
    icon: '🏗️',
    what: 'Script de inicialización one-shot (npm run init-db). Crea todas las tablas del schema.sql usando CREATE TABLE IF NOT EXISTS. Solo se ejecuta manualmente para setup inicial o reseteo completo.',
    why: 'Separado de database.js para no correr DDL completo en cada inicio de servidor. Idem para CI/CD: el pipeline puede crear la BD limpia sin levantar Express.',
    critical: 'No reemplaza la auto-migración de database.js para columnas nuevas. Si se borra y recrea la BD en producción, se perderán datos históricos (bitácora, contribuyentes).',
    deps: ['src/db/database.js']
  },
  // ── MIDDLEWARE ──
  {
    id: 'mw_auth',
    file: 'auth.js (middleware)',
    path: 'src/middleware/auth.js',
    layer: 'mw',
    badge: 'mw',
    icon: '🔐',
    what: 'Middleware JWT: verifica el token Bearer con jwt.verify(), adjunta el payload a req.user y pasa al siguiente handler. Expone requerirRol(...roles) para RBAC declarativo y obtenerIP(req) para auditoría de IP real (soporta X-Forwarded-For de proxies).',
    why: 'Desacoplado de Express en una función pura para que todos los routers puedan aplicar auth sin copiar lógica. El RBAC como HOF (Higher-Order Function) evita condicionales dispersos en cada ruta.',
    critical: 'JWT_SECRET debe ser larga y aleatoria (min 32 chars). Nunca retornar 200 con un token inválido. requerirRol() debe aplicarse SIEMPRE antes de cualquier operación de escritura.',
    deps: []
  },
  // ── ROUTES ──
  {
    id: 'route_auth',
    file: 'auth.js (routes)',
    path: 'src/routes/auth.js',
    layer: 'route',
    badge: 'route',
    icon: '🔑',
    what: 'Maneja login (email+password+TOTP opcional), activación de cuenta con token de onboarding, setup/verify de 2FA (otplib) y /me. Implementa rate-limiting por IP (5 req/15 min) y bloqueo por cuenta (5 intentos → 15 min) contra fuerza bruta.',
    why: 'Separado de contribuyentes para acotar el alcance del rate-limiter solo al endpoint de login sin afectar el resto de la API.',
    critical: 'La respuesta a TOTP_REQUERIDO debe ser HTTP 200 (el frontend depende de ello). El loginLimiter aplica solo a intentos fallidos (skipSuccessfulRequests: true). No cambiar bcrypt rounds sin migrar hashes existentes.',
    deps: ['src/db/database.js', 'src/middleware/auth.js', 'src/utils/ledger.js']
  },
  {
    id: 'route_contribuyentes',
    file: 'contribuyentes.js (routes)',
    path: 'src/routes/contribuyentes.js',
    layer: 'route',
    badge: 'route',
    icon: '👤',
    what: 'CRUD completo de expedientes. Registrar (con validación RFC regex mexicano + duplicado), renovar (archiva en historial_renovaciones dentro de una transacción atómica), baja soft-delete, extraer metadatos X.509 del .cer, consultar clave privada cifrada (límite 10/día + TOTP requerido), generar token de descarga temporal.',
    why: 'Es el módulo más grande (589 líneas) porque concentra toda la lógica de negocio del expediente. La extracción de metadatos del .cer en el backend garantiza que los datos del formulario son reales, no inventados.',
    critical: 'GET /dashboard/kpis DEBE declararse antes de GET /:rfc. Nunca exponer key_payload_cifrado en el GET normal. La renovación debe ser una transacción atómica (historial + actualización).',
    deps: ['src/db/database.js', 'src/middleware/auth.js', 'src/utils/ledger.js', 'src/utils/semaforo.js', 'src/utils/colaAlertas.js', 'src/utils/token.js', 'src/services/emailService.js', 'src/services/whatsappService.js']
  },
  {
    id: 'route_alertas',
    file: 'alertas.js (routes)',
    path: 'src/routes/alertas.js',
    layer: 'route',
    badge: 'route',
    icon: '🔔',
    what: 'Configuración de umbrales semafóricos y canales de notificación. PUT /config cifra las credenciales SMTP/WhatsApp con AES-256-GCM antes de guardarlas. POST /probar encola y ejecuta inmediatamente la alerta con backoff real. POST /recalcular fuerza el recálculo semafórico.',
    why: 'Separado del semáforo para no mezclar la lógica de configuración (CRUD) con el cálculo (dominio puro). Las credenciales se cifran aquí y se descifran solo en colaAlertas (mínimo privilegio).',
    critical: 'umbral_critico < umbral_preventivo siempre. Las credenciales NUNCA se devuelven en el GET. ENCRYPTION_KEY debe existir en .env antes de guardar config; si cambia, todas las credenciales guardadas son indescryptables.',
    deps: ['src/db/database.js', 'src/middleware/auth.js', 'src/utils/ledger.js', 'src/utils/semaforo.js', 'src/utils/crypto.js', 'src/utils/colaAlertas.js']
  },
  {
    id: 'route_usuarios',
    file: 'usuarios.js (routes)',
    path: 'src/routes/usuarios.js',
    layer: 'route',
    badge: 'route',
    icon: '👥',
    what: 'CRUD de usuarios con RBAC. Alta con token de onboarding de 24h (el admin NO define la contraseña). PUT actualiza con validación previa de email duplicado. POST /desactivar hace baja atómica + reasignación de cartera de contribuyentes.',
    why: 'La reasignación de cartera en transacción atómica evita que contribuyentes queden huérfanos si el proceso cae a mitad. El token de onboarding sigue el principio de mínimo privilegio (el admin no conoce la password del nuevo usuario).',
    critical: 'La reasignación de cartera y la baja del usuario deben ocurrir en la misma transacción. En producción, el token_activacion NO se retorna en la respuesta HTTP; solo se envía por correo.',
    deps: ['src/db/database.js', 'src/middleware/auth.js', 'src/utils/ledger.js']
  },
  {
    id: 'route_downloads',
    file: 'downloads.js (routes)',
    path: 'src/routes/downloads.js',
    layer: 'route',
    badge: 'route',
    icon: '📥',
    what: 'Consumo público de tokens de descarga de único uso. Valida: existencia, no-usado, no-expirado. La entrega (CER/KEY/ZIP) se hace en una transacción atómica con is_used=0 en el WHERE para prevenir doble descarga concurrente. También maneja solicitudes de renovación públicas.',
    why: 'La condición AND is_used=0 en el UPDATE es el mecanismo anti-replay: incluso dos requests simultáneos solo uno logrará cambiar la fila (el otro recibirá changes===0).',
    critical: 'La transacción atómica de consumo es la única protección contra doble descarga. Quitar AND is_used=0 permite descargas repetidas. El ZIP actual usa metadata simulada; en prod leer blobs reales de almacenamiento seguro.',
    deps: ['src/db/database.js', 'src/utils/token.js', 'src/utils/ledger.js', 'src/middleware/auth.js']
  },
  {
    id: 'route_bitacora',
    file: 'bitacora.js (routes)',
    path: 'src/routes/bitacora.js',
    layer: 'route',
    badge: 'route',
    icon: '📋',
    what: 'GET paginado de la bitácora ledger-chain con filtros por acción/usuario/fecha. Expone el endpoint de verificación de integridad del ledger para que los administradores puedan detectar manipulaciones.',
    why: 'La bitácora es inmutable por diseño (no hay PUT/DELETE). Separar la lectura de la escritura (ledger.js) impide que una ruta de auditoría pueda alterar registros.',
    critical: 'Nunca agregar endpoints PUT/DELETE a este router. El orden ASC por id es necesario para que verificarIntegridadLedger() funcione correctamente.',
    deps: ['src/db/database.js', 'src/middleware/auth.js', 'src/utils/ledger.js']
  },
  {
    id: 'route_solicitudes',
    file: 'solicitudes.js (routes)',
    path: 'src/routes/solicitudes.js',
    layer: 'route',
    badge: 'route',
    icon: '📝',
    what: 'Gestión de solicitudes de renovación enviadas desde la página de error de token expirado. Lista y permite marcar solicitudes como procesadas. Endpoint de acceso público con validación mínima.',
    why: 'Desacoplado de downloads.js para no mezclar el flujo de consumo de tokens (crítico) con la gestión de solicitudes (operativo).',
    critical: 'No revelar si un RFC existe o no en la respuesta pública (evita enumeración de contribuyentes). El endpoint de listado sí requiere autenticación.',
    deps: ['src/db/database.js', 'src/middleware/auth.js', 'src/utils/ledger.js']
  },
  // ── UTILS ──
  {
    id: 'util_semaforo',
    file: 'semaforo.js',
    path: 'src/utils/semaforo.js',
    layer: 'util',
    badge: 'util',
    icon: '🚦',
    what: 'Motor de cálculo de estatus semafórico. calcularEstatus(fecha_vencimiento, config) retorna {dias_restantes, estatus, color} comparando fechas en UTC 00:00 (evita desfases de zona horaria). recalcularTodos(db) actualiza todos los contribuyentes en una sola transacción.',
    why: 'Función pura sin side effects para poder testarla en aislamiento. El cálculo UTC-normalizado es un requisito de negocio (CU-02 v1.1) para garantizar consistencia entre zonas horarias.',
    critical: 'La fecha de comparación DEBE fijarse a UTC 00:00:00. Cambiar los umbrales default (30/90) sin actualizar alertas_config rompería la consistencia para BDs ya inicializadas.',
    deps: []
  },
  {
    id: 'util_ledger',
    file: 'ledger.js',
    path: 'src/utils/ledger.js',
    layer: 'util',
    badge: 'util',
    icon: '🔗',
    what: 'Sistema de bitácora ledger-chain inmutable. Cada registro incluye el hash SHA-256 del registro anterior (prev_hash) para formar una cadena donde cualquier modificación rompe la secuencia. registrarLog() y verificarIntegridadLedger().',
    why: 'El ledger-chain es el mecanismo de no-repudio del sistema: un auditor puede detectar si alguien borró o editó un log. Desacoplado de las rutas para que cualquier módulo pueda registrar sin conocer la implementación.',
    critical: 'NUNCA borrar registros de bitacora_logs (rompería la cadena de hashes). No cambiar el formato del string "contenido" a hashear sin migrar todos los registros existentes.',
    deps: ['src/db/database.js']
  },
  {
    id: 'util_crypto',
    file: 'crypto.js (server)',
    path: 'src/utils/crypto.js',
    layer: 'util',
    badge: 'util',
    icon: '🔒',
    what: 'Cifrado simétrico AES-256-GCM para secretos del servidor en reposo (credenciales SMTP, token WhatsApp). cifrar() genera IV aleatorio de 12 bytes y retorna JSON {iv, tag, ciphertext} en hex. descifrar() verifica el auth-tag antes de entregar el texto plano.',
    why: 'Sustituye la codificación Base64 anterior que era trivialmente reversible. GCM es AEAD: detecta si el ciphertext fue alterado. IV aleatorio por mensaje previene ataques de frecuencia.',
    critical: 'ENCRYPTION_KEY debe ser de exactamente 32 bytes (64 chars hex). Si cambia la key, TODOS los secretos guardados en BD se vuelven indescryptables. Nunca loggear la llave maestra.',
    deps: []
  },
  {
    id: 'util_colaAlertas',
    file: 'colaAlertas.js',
    path: 'src/utils/colaAlertas.js',
    layer: 'util',
    badge: 'util',
    icon: '📨',
    what: 'Cola persistente de alertas con reintentos y backoff real (5/15/30 min). encolarAlerta() persiste en tabla cola_alertas. procesarColaAlertas() procesa pendientes cuyo proximo_reintento_en ≤ ahora. El estado persiste ante caídas del servidor.',
    why: 'Reemplaza el bucle for síncrono en memoria anterior: si el servidor caía con alertas pendientes, se perdían. La cola en SQLite garantiza que ninguna notificación se pierde.',
    critical: 'procesarColaAlertas() es async — siempre await en server.js. El backoff usa minutos reales (no ms simulados). El cron de 1 min en server.js es el motor de polling.',
    deps: ['src/db/database.js', 'src/utils/ledger.js', 'src/utils/mailer.js', 'src/utils/whatsapp.js']
  },
  {
    id: 'util_token',
    file: 'token.js',
    path: 'src/utils/token.js',
    layer: 'util',
    badge: 'util',
    icon: '🎫',
    what: 'Tres utilidades de tokens seguros: generarTokenSeguro() (32 bytes → 64 hex chars), hashToken() (SHA-256 para almacenamiento seguro), calcularExpiracion(ttlMinutos) (formato YYYY-MM-DD HH:MM:SS compatible con SQLite).',
    why: 'Los tokens de descarga se almacenan hasheados (nunca en plano) para que incluso con acceso a la BD no se puedan construir URLs válidas. Separado del resto para poder mockear en tests.',
    critical: 'hashToken() usa SHA-256 (no bcrypt) porque es un token de búsqueda, no una contraseña. Nunca almacenar el token plano en la BD. TTL máximo 1440 min (24h) forzado en la ruta.',
    deps: []
  },
  {
    id: 'util_mailer',
    file: 'mailer.js',
    path: 'src/utils/mailer.js',
    layer: 'util',
    badge: 'util',
    icon: '📧',
    what: 'Envío real de correos SMTP (nodemailer). construirTransporte() descifra la contraseña SMTP de alertas_config con descifrar() y crea el transporter. enviarCorreo() lanza el error sin capturarlo para que la cola de alertas decida el reintento.',
    why: 'Desacoplado de colaAlertas.js para separar "qué enviar" de "cómo enviar". El error sin capturar es intencional: el backoff vive en la cola, no aquí.',
    critical: 'Si ENCRYPTION_KEY cambia, construirTransporte() fallará al descifrar la contraseña. No agregar try/catch interno: el fallo debe propagarse a procesarColaAlertas().',
    deps: ['src/utils/crypto.js']
  },
  {
    id: 'util_whatsapp',
    file: 'whatsapp.js',
    path: 'src/utils/whatsapp.js',
    layer: 'util',
    badge: 'util',
    icon: '💬',
    what: 'Envío de mensajes WhatsApp vía Twilio SDK oficial. Soporta mensajes de texto y plantillas aprobadas (ContentSid / ContentVariables). Auto-normaliza formato internacional de México (+521).',
    why: 'Desacopla la API de Twilio de la lógica de reintentos en colaAlertas.js. Maneja TLS preventivo para evitar fallos por proxies SSL locales.',
    critical: 'En México (+52), WhatsApp exige el prefijo +521 antes de los 10 dígitos. Omitir el 1 genera el error 63015 de Twilio.',
    deps: ['twilio']
  },
  // ── SERVICES ──
  {
    id: 'svc_email',
    file: 'emailService.js',
    path: 'src/services/emailService.js',
    layer: 'service',
    badge: 'service',
    icon: '✉️',
    what: 'Servicio de correo de alto nivel para enlaces temporales de descarga. Usa credenciales SMTP de .env (Yahoo / custom) con fallback a Ethereal sandbox.',
    why: 'Separado de mailer.js porque se usa para la generación bajo demanda de tokens de descarga temporal.',
    critical: 'No loggear contraseñas SMTP en consola. Retorna { success, previewUrl } para integración fluida con la UI.',
    deps: ['nodemailer']
  },
  {
    id: 'svc_whatsapp',
    file: 'whatsappService.js',
    path: 'src/services/whatsappService.js',
    layer: 'service',
    badge: 'service',
    icon: '📱',
    what: 'Servicio WhatsApp de alto nivel para notificación de enlaces temporales vía Twilio. Formatea plantilla con Razón Social, RFC y enlace de autodestrucción.',
    why: 'Mismo contrato que emailService.js ({ success, sid, error }). Normaliza a +521 y retorna el Twilio SID para auditoría.',
    critical: 'El destinatario se normaliza automáticamente a +521 en México para asegurar la entrega sin errores 63015.',
    deps: ['src/utils/whatsapp.js']
  },
  // ── FRONTEND / UI ──
  {
    id: 'fe_app',
    file: 'app.js (frontend)',
    path: 'public/js/app.js',
    layer: 'ui',
    badge: 'ui',
    icon: '🖥️',
    what: 'Orquestador principal de la SPA. En DOMContentLoaded llama a cada función de inicialización de módulo: inicializarAuth(), inicializarRouter(), inicializarFiltrosDashboard(), inicializarCargaContribuyentes(), inicializarConfigAlertas(), inicializarGestionUsuarios(), inicializarBitacoraLedger(), inicializarEnlacesTemporales().',
    why: 'El patrón de "inicializadores opcionales" (typeof fn === function) permite cargar módulos de forma condicional según la página o permisos, sin throw si falta alguno.',
    critical: 'El orden de inicialización importa: Auth → Router → Vistas. No reordenar. Cada módulo de vista debe exponer una función nombrada globalmente (sin bundler).',
    deps: ['public/js/auth.js', 'public/js/router.js', 'public/js/config.js', 'public/js/views/dashboard.js', 'public/js/views/contribuyentes.js', 'public/js/views/alertas.js', 'public/js/views/usuarios.js', 'public/js/views/bitacora.js', 'public/js/views/downloadLinks.js']
  },
  {
    id: 'fe_auth',
    file: 'auth.js (frontend)',
    path: 'public/js/auth.js',
    layer: 'ui',
    badge: 'ui',
    icon: '🔐',
    what: 'Lógica de autenticación del cliente: manejo del formulario de login, flujo de 2 pasos para TOTP, persistencia del JWT en localStorage, modo offline/demo cuando el backend no está disponible, logout y actualización del avatar/nombre en el sidebar.',
    why: 'Centraliza la gestión de sesión para que ninguna vista necesite conocer el flujo de login. El modo demo permite presentar el sistema sin backend real.',
    critical: 'El token se guarda en localStorage (no sessionStorage) para persistir entre pestañas. El health-check de /api/health activa el modo offline. Nunca exponer el JWT en logs de consola.',
    deps: ['public/js/config.js']
  },
  {
    id: 'fe_router',
    file: 'router.js (frontend)',
    path: 'public/js/router.js',
    layer: 'ui',
    badge: 'ui',
    icon: '🗺️',
    what: 'Enrutador SPA del cliente. Conmuta visibilidad de .content-section según el .sidebar-item clicado. Dispara hooks de carga lazy (cargarTablero, cargarUsuarios, etc.) al navegar. Expone window.abrirSeccionCompartir(rfc) para deep-linking.',
    why: 'Sin bundler ni History API: usa atributos data-target para mantener la SPA simple y compatible con apertura directa (doble click en index.html).',
    critical: 'Cada sección HTML debe tener un id que coincida exactamente con el data-target del sidebar. No usar pushState sin adaptar el servidor para servir el HTML en todas las rutas.',
    deps: ['public/js/views/dashboard.js', 'public/js/views/alertas.js', 'public/js/views/contribuyentes.js', 'public/js/views/bitacora.js', 'public/js/views/downloadLinks.js', 'public/js/views/usuarios.js']
  },
  {
    id: 'fe_config',
    file: 'config.js (frontend)',
    path: 'public/js/config.js',
    layer: 'ui',
    badge: 'ui',
    icon: '⚙️',
    what: 'Configuración global del cliente: API_URL base, variables globales (token, usuarioActual, modoOffline), función apiFetch() (wrapper de fetch con inyección automática de Authorization Bearer y manejo de errores HTTP), showToast() y datos de demo para modo offline.',
    why: 'Centralizar API_URL y apiFetch() evita duplicar la lógica de headers/errores en cada vista. El modo demo con datos hardcodeados permite demostraciones sin servidor.',
    critical: 'apiFetch() lanza un Error con el mensaje del servidor en caso de error HTTP, por lo que todas las vistas deben envolverlo en try/catch. Cambiar API_URL requiere actualizar CORS_ALLOWED_ORIGINS en el servidor.',
    deps: []
  },
  {
    id: 'fe_crypto',
    file: 'crypto.js (frontend)',
    path: 'public/js/crypto.js',
    layer: 'ui',
    badge: 'ui',
    icon: '🛡️',
    what: 'Cifrado AES-GCM en el navegador usando Web Crypto API nativa. Cifra la contraseña y el archivo .key del contribuyente ANTES de enviarlos al servidor. La clave de cifrado es la contraseña del usuario (nunca viaja al servidor).',
    why: 'Principio de Zero-Knowledge en el servidor: el backend almacena key_payload_cifrado pero no puede descifrarlo sin la contraseña del usuario. Incluso con acceso a la BD, las claves privadas están protegidas.',
    critical: 'Si el usuario olvida su contraseña, el .key cifrado es irrecuperable. La Web Crypto API no está disponible en HTTP (solo HTTPS o localhost). Nunca pasar la contraseña al backend.',
    deps: []
  },
  {
    id: 'fe_dashboard',
    file: 'dashboard.js (view)',
    path: 'public/js/views/dashboard.js',
    layer: 'ui',
    badge: 'ui',
    icon: '📊',
    what: 'Vista principal del tablero ejecutivo. Carga KPIs desde GET /api/contribuyentes/dashboard/kpis (total, vigentes, preventivos, críticos, expirados, próximos a vencer). Renderiza las tarjetas con colores semafóricos y la tabla de próximos vencimientos.',
    why: 'La vista solo consume el endpoint de KPIs (ya calculado en el servidor) en vez de calcular los conteos localmente, garantizando consistencia con el motor semafórico.',
    critical: 'El endpoint /dashboard/kpis está declarado ANTES de /:rfc en el servidor (fix QA#1). Cambiar la URL del endpoint en el servidor requiere actualizar esta vista.',
    deps: ['public/js/config.js']
  },
  {
    id: 'fe_contribuyentes',
    file: 'contribuyentes.js (view)',
    path: 'public/js/views/contribuyentes.js',
    layer: 'ui',
    badge: 'ui',
    icon: '📁',
    what: 'Gestión completa de expedientes desde el cliente. Lectura de .cer via FileReader, envío a /extraer-certificado para obtener metadatos X.509, cifrado del .key en el navegador antes de enviar, CRUD de expedientes con búsqueda y filtros.',
    why: 'El .key NUNCA se sube en texto plano al servidor: se cifra con Web Crypto API en el cliente. El .cer sí se sube en base64 porque es el certificado PÚBLICO.',
    critical: 'El cifrado del .key debe completarse ANTES de la llamada POST. Nunca enviar el archivo .key sin cifrar. La extracción de metadatos del .cer es una llamada al backend (usa node:crypto X509Certificate, no Web Crypto).',
    deps: ['public/js/config.js', 'public/js/crypto.js']
  },
  // ── SCHEMA ──
  {
    id: 'schema',
    file: 'schema.sql',
    path: 'schema.sql',
    layer: 'db',
    badge: 'db',
    icon: '📐',
    what: 'Esquema relacional SQLite completo: usuarios (RBAC + 2FA + bloqueo), contribuyentes (estatus semafórico + soft-delete + clave cifrada), historial_renovaciones, alertas_config (credenciales cifradas AES-256), consultas_contrasena_log, bitacora_logs (ledger-chain), cola_alertas (reintentos persistentes), download_tokens, solicitudes_renovacion. Con índices de rendimiento.',
    why: 'Todas las tablas usan CREATE IF NOT EXISTS para ser idempotentes. El CHECK en estatus/rol/tipo garantiza integridad a nivel de BD sin depender solo de la aplicación.',
    critical: 'Cambiar el formato de fecha (TEXT YYYY-MM-DD) en contribuyentes rompería calcularEstatus(). El campo prev_hash de bitacora_logs NO puede ser NULL arbitrariamente (GENESIS solo en el primer registro).',
    deps: []
  }
];

// ── Impact data: dependencias por módulo (usadas por, con snippets) ──
const IMPACT_DATA = {
  'src/db/database.js': {
    ficha: 'Singleton de base de datos SQLite. Es el único punto de acceso a la BD en todo el servidor. Configura WAL mode y Foreign Keys.',
    risks: ['ALTO: Si se crea una segunda instancia de Database(), se producen bloqueos de escritura.', 'ALTO: Cambiar DB_PATH sin actualizar la variable de entorno causa inicio fallido.', 'MEDIO: Quitar WAL mode reduce el rendimiento en lecturas concurrentes.'],
    dependents: [
      { file: 'src/utils/ledger.js', fn: 'registrarLog()', line: '12-13', contract: 'db.prepare(...).run()', snippet: `const db = require('../db/database');\n// Uso en registrarLog():\ndb.prepare(\`INSERT INTO bitacora_logs ...\`).run(...)` },
      { file: 'src/utils/semaforo.js', fn: 'recalcularTodos(db)', line: '54-73', contract: 'db (parámetro de función)', snippet: `function recalcularTodos(db) {\n  const config = db.prepare(\n    'SELECT * FROM alertas_config WHERE id = 1'\n  ).get() || {};\n  // db es pasado como parámetro desde server.js\n}` },
      { file: 'src/utils/colaAlertas.js', fn: 'encolarAlerta(), procesarColaAlertas()', line: '13', contract: 'db.prepare(...).run/.all', snippet: `const db = require('../db/database');\n// Inserción en cola:\ndb.prepare(\`INSERT INTO cola_alertas ...\`).run(...)` },
      { file: 'src/routes/auth.js', fn: 'POST /login, GET /me', line: '19', contract: 'db.prepare().get/run', snippet: `const db = require('../db/database');\n// Login:\nconst usuario = db.prepare(\n  'SELECT * FROM usuarios WHERE email = ?'\n).get(email);` },
      { file: 'src/routes/contribuyentes.js', fn: 'GET,POST,PUT,DELETE', line: '19', contract: 'db.prepare().all/get/run', snippet: `const db = require('../db/database');\n// Renovación atómica:\nconst renovar = db.transaction(() => {\n  db.prepare('INSERT INTO historial_renovaciones ...')\n    .run(...);\n});` }
    ]
  },
  'src/utils/semaforo.js': {
    ficha: 'Motor de cálculo semafórico puro (sin side effects). Determina el estatus de un certificado en base a sus días restantes y los umbrales configurados. Todo en UTC 00:00.',
    risks: ['ALTO: No usar UTC al comparar fechas causa diferencias de ±1 día dependiendo de la zona horaria del servidor.', 'MEDIO: Cambiar los umbrales default sin actualizar alertas_config causa inconsistencia entre el cálculo y la config guardada.'],
    dependents: [
      { file: 'server.js', fn: 'recalcularTodos(db) en cronjob', line: '17,126,138', contract: 'recalcularTodos(db) → number', snippet: `const { recalcularTodos } = require('./src/utils/semaforo');\n// Cron nocturno 00:00 UTC:\ncron.schedule('0 0 * * *', () => {\n  const total = recalcularTodos(db);\n});` },
      { file: 'src/routes/contribuyentes.js', fn: 'POST /, PUT /:rfc, GET /', line: '22,103,315', contract: 'calcularEstatus(fecha, config) → {dias_restantes, estatus, color}', snippet: `const { calcularEstatus } = require('../utils/semaforo');\n// Al registrar un nuevo contribuyente:\nconst { dias_restantes, estatus } = calcularEstatus(\n  fecha_vencimiento, config\n);` },
      { file: 'src/routes/alertas.js', fn: 'POST /recalcular', line: '17,233', contract: 'recalcularTodos(db) → number', snippet: `const { recalcularTodos } = require('../utils/semaforo');\n// Recálculo manual:\nconst totalActualizados = recalcularTodos(db);` }
    ]
  },
  'src/middleware/auth.js': {
    ficha: 'Middleware de autenticación JWT y control RBAC. Proporciona autenticar, requerirRol() y obtenerIP() a todas las rutas protegidas.',
    risks: ['CRÍTICO: Si JWT_SECRET es débil o predecible, los tokens pueden forjarse.', 'ALTO: requerirRol() sin autenticar primero retorna 401 (req.user undefined).', 'MEDIO: Cambiar el nombre de las funciones exportadas rompe todos los routers.'],
    dependents: [
      { file: 'src/routes/auth.js', fn: 'GET /me, POST /totp/*', line: '20', contract: 'autenticar (middleware), obtenerIP(req)', snippet: `const { autenticar, obtenerIP } = require('../middleware/auth');\n// Ruta protegida:\nrouter.get('/me', autenticar, (req, res) => {\n  // req.user disponible aquí\n});` },
      { file: 'src/routes/contribuyentes.js', fn: 'Todos los endpoints', line: '20', contract: 'autenticar, requerirRol(...roles), obtenerIP(req)', snippet: `const { autenticar, requerirRol, obtenerIP } = require('../middleware/auth');\n// Solo admin/supervisor/operador pueden crear:\nrouter.post('/', autenticar, requerirRol('admin','supervisor','operador'),\n  (req, res) => { /* ... */ }\n);` },
      { file: 'src/routes/alertas.js', fn: 'PUT /config, POST /recalcular', line: '15', contract: 'autenticar, requerirRol, obtenerIP', snippet: `// Solo admin/supervisor pueden modificar config de alertas:\nrouter.put('/config', autenticar, requerirRol('admin','supervisor'),\n  (req, res) => { /* ... */ }\n);` }
    ]
  },
  'src/utils/ledger.js': {
    ficha: 'Sistema de bitácora ledger-chain inmutable. Cada registro encadena el hash SHA-256 del anterior, haciendo cualquier modificación detectable.',
    risks: ['CRÍTICO: Borrar registros de bitacora_logs rompe la cadena de hashes. El primer fallo en verificarIntegridadLedger() apunta al registro manipulado.', 'ALTO: Cambiar el formato del string de contenido a hashear invalida todos los registros históricos.', 'BAJO: El ledger no usa transacciones explícitas; en caso de error, el registro simplemente no se guarda.'],
    dependents: [
      { file: 'server.js', fn: 'middleware de error global', line: '18,101', contract: 'registrarLog({accion, detalle, ip_origen})', snippet: `const { registrarLog } = require('./src/utils/ledger');\n// Error global:\nregistrarLog({\n  accion: 'SISTEMA_ERROR_INTERNO',\n  detalle: \`Error: \${err.message}\`,\n  ip_origen: req.headers['x-forwarded-for']\n});` },
      { file: 'src/routes/auth.js', fn: 'POST /login (éxito y fallo)', line: '21,83,149', contract: 'registrarLog({usuario_id, usuario_email, accion, detalle, ip_origen})', snippet: `const { registrarLog } = require('../utils/ledger');\n// Login exitoso:\nregistrarLog({\n  usuario_id: usuario.id,\n  usuario_email: usuario.email,\n  accion: 'AUTH_LOGIN_OK',\n  detalle: \`Rol: \${usuario.rol}\`,\n  ip_origen: ip\n});` },
      { file: 'src/utils/colaAlertas.js', fn: 'procesarColaAlertas() — fallo definitivo', line: '14,91', contract: 'registrarLog({accion, detalle})', snippet: `const { registrarLog } = require('./ledger');\n// Al agotar reintentos:\nregistrarLog({\n  accion: 'ALERTA_COLA_FALLO_DEFINITIVO',\n  detalle: \`Tipo: \${alerta.tipo} | Intentos: \${intentos}\`,\n  ip_origen: null\n});` }
    ]
  },
  'src/utils/crypto.js': {
    ficha: 'Cifrado AES-256-GCM del servidor. Protege credenciales SMTP y tokens WhatsApp en la base de datos. Requiere ENCRYPTION_KEY de 32 bytes en .env.',
    risks: ['CRÍTICO: Cambiar ENCRYPTION_KEY deja todos los secretos guardados en BD irrecuperables.', 'CRÍTICO: Si ENCRYPTION_KEY no está en .env, el servidor crashea al intentar cifrar/descifrar.', 'ALTO: Usar el mismo IV para múltiples mensajes rompería la seguridad (ya prevenido con crypto.randomBytes).'],
    dependents: [
      { file: 'src/routes/alertas.js', fn: 'PUT /config (cifrar credenciales)', line: '18,82', contract: 'cifrar(textoPlano) → JSON string', snippet: `const { cifrar } = require('../utils/crypto');\n// Al guardar contraseña SMTP:\npassCifrado = correo_smtp_pass\n  ? cifrar(correo_smtp_pass)\n  : existente.correo_smtp_pass_cifrado;` },
      { file: 'src/utils/mailer.js', fn: 'construirTransporte(config)', line: '13,30', contract: 'descifrar(payloadCifrado) → string', snippet: `const { descifrar } = require('./crypto');\n// Al construir el transporte SMTP:\nconst passPlano = descifrar(\n  config.correo_smtp_pass_cifrado\n);` }
    ]
  },
  'src/utils/colaAlertas.js': {
    ficha: 'Cola persistente de alertas con backoff real. Encola alertas en SQLite y las procesa con reintentos 5/15/30 min. Invocada por el cron de 1 min en server.js.',
    risks: ['ALTO: Si el cron de 1 min en server.js se elimina, las alertas quedan en la cola indefinidamente.', 'MEDIO: procesarColaAlertas() es async — llamar sin await en server.js causa unhandled promise rejection.', 'BAJO: La cola no tiene prioridades; alertas urgentes y normales se procesan en orden de creación.'],
    dependents: [
      { file: 'server.js', fn: 'cron cada minuto', line: '19,149', contract: 'procesarColaAlertas() → Promise<{procesadas,enviadas,fallidas}>', snippet: `const { procesarColaAlertas } = require('./src/utils/colaAlertas');\n// Cron 1 min:\ncron.schedule('* * * * *', async () => {\n  const resultado = await procesarColaAlertas();\n});` },
      { file: 'src/routes/alertas.js', fn: 'POST /probar', line: '19,180', contract: 'encolarAlerta({tipo,dest,asunto,mensaje,max_intentos}), procesarColaAlertas()', snippet: `const { encolarAlerta, procesarColaAlertas } = require('../utils/colaAlertas');\n// Prueba inmediata:\nconst idCola = encolarAlerta({ tipo, destinatario, asunto, mensaje });\nconst resultado = await procesarColaAlertas();` },
      { file: 'src/routes/contribuyentes.js', fn: 'POST /:rfc/key (límite excedido)', line: '23,420', contract: 'encolarAlerta({tipo,dest,asunto,mensaje})', snippet: `const { encolarAlerta } = require('../utils/colaAlertas');\n// Alerta a supervisores al exceder límite:\nencolarAlerta({\n  tipo: 'correo',\n  destinatario: r.email,\n  asunto: 'Límite diario de consultas de clave excedido',\n  mensaje: \`El usuario \${req.user.email} alcanzó el límite...\`\n});` }
    ]
  }
};

// ══════════════════════════════════════════════════════════════
// 1. SIMULADOR REACTIVO
// ══════════════════════════════════════════════════════════════

const SCENARIOS = {
  login: {
    name: 'POST /api/auth/login',
    relevantControls: ['simRol', 'simJWT', 'simTOTP'],
    pipeline(state) {
      const steps = [
        { num: 1, label: 'server.js', detail: 'Recibe la petición. Aplica loginLimiter (rate-limit: 5 req / 15 min por IP)', color: 'bg-indigo-900/50 border-indigo-700/50' },
        { num: 2, label: 'src/routes/auth.js', detail: 'Extrae email + password + totp_code del body', color: 'bg-indigo-900/40 border-indigo-700/40' },
        { num: 3, label: 'src/db/database.js', detail: 'SELECT * FROM usuarios WHERE email = ?', color: 'bg-blue-900/40 border-blue-700/40' },
      ];
      if (state.rol === 'anonimo') {
        steps.push({ num: 4, label: 'Verificación de credenciales', detail: 'Usuario no encontrado → registrarLog(AUTH_LOGIN_FALLO)', color: 'bg-red-900/40 border-red-700/40' });
        return { steps, events: 'intentos_fallidos++\nPosible bloqueo de cuenta si intentos >= 5', verdict: { type: 'red', msg: '🚫 HTTP 401 — Credenciales incorrectas. Fallo registrado en ledger-chain.' } };
      }
      steps.push({ num: 4, label: 'bcryptjs.compareSync()', detail: 'Comparación segura de hash de contraseña', color: 'bg-blue-900/40 border-blue-700/40' });
      if (!state.jwt) {
        return { steps, events: 'Sesión no iniciada, sin token Bearer', verdict: { type: 'yellow', msg: '⚠️ Sin token JWT: la petición llegará pero solo pasará el loginLimiter. Los endpoints protegidos retornarán 401.' } };
      }
      if (state.totp) {
        steps.push({ num: 5, label: 'otplib.authenticator.verify()', detail: 'Valida código TOTP de 6 dígitos', color: 'bg-purple-900/40 border-purple-700/40' });
        steps.push({ num: 6, label: 'jwt.sign()', detail: 'Genera JWT con payload {id,email,nombre,rol,totp_activado}', color: 'bg-green-900/40 border-green-700/40' });
        steps.push({ num: 7, label: 'src/utils/ledger.js', detail: 'registrarLog(AUTH_LOGIN_OK)', color: 'bg-teal-900/40 border-teal-700/40' });
        return { steps, events: 'intentos_fallidos = 0\nbloqueado_hasta = NULL\nJWT emitido, expira en 1h', verdict: { type: 'green', msg: '✅ HTTP 200 — Login exitoso con 2FA. JWT retornado. Evento registrado en bitácora inmutable.' } };
      }
      steps.push({ num: 5, label: 'Verificar TOTP', detail: 'totp_activado = false → no requiere código', color: 'bg-slate-800/40 border-slate-700/40' });
      steps.push({ num: 6, label: 'jwt.sign()', detail: 'Genera JWT con payload {id,email,nombre,rol,totp_activado}', color: 'bg-green-900/40 border-green-700/40' });
      steps.push({ num: 7, label: 'src/utils/ledger.js', detail: 'registrarLog(AUTH_LOGIN_OK)', color: 'bg-teal-900/40 border-teal-700/40' });
      return { steps, events: 'intentos_fallidos = 0\nbloqueado_hasta = NULL\nJWT emitido, expira en 1h', verdict: { type: 'green', msg: '✅ HTTP 200 — Login exitoso (sin 2FA). JWT retornado. Evento en bitácora.' } };
    }
  },
  register: {
    name: 'POST /api/contribuyentes',
    relevantControls: ['simRol', 'simJWT', 'simDias'],
    pipeline(state) {
      if (!state.jwt) return { steps: [{ num: 1, label: 'src/middleware/auth.js', detail: 'autenticar() → Token ausente', color: 'bg-red-900/40 border-red-700/40' }], events: 'No se procede al handler', verdict: { type: 'red', msg: '🚫 HTTP 401 — Token de autenticación requerido.' } };
      if (state.rol === 'anonimo') return { steps: [{ num: 1, label: 'src/middleware/auth.js', detail: 'autenticar() → Token inválido/expirado', color: 'bg-red-900/40 border-red-700/40' }], events: 'TokenExpiredError o JsonWebTokenError', verdict: { type: 'red', msg: '🚫 HTTP 401 — Token inválido o sesión expirada.' } };
      const steps = [
        { num: 1, label: 'src/middleware/auth.js', detail: `autenticar() → OK (rol: ${state.rol})`, color: 'bg-indigo-900/40 border-indigo-700/40' },
        { num: 2, label: 'requerirRol(admin/supervisor/operador)', detail: `Rol "${state.rol}" permitido ✓`, color: 'bg-indigo-900/30 border-indigo-700/30' },
        { num: 3, label: 'src/routes/contribuyentes.js', detail: 'Validar RFC regex mexicano + check de duplicado en BD', color: 'bg-blue-900/40 border-blue-700/40' },
        { num: 4, label: 'src/utils/semaforo.js', detail: `calcularEstatus(fecha_vencimiento=${state.dias}d) → ${getSemaforoEstatus(state.dias, state.umbralCrit, state.umbralPrev)}`, color: 'bg-purple-900/40 border-purple-700/40' },
        { num: 5, label: 'src/db/database.js', detail: 'INSERT INTO contribuyentes (...) VALUES (...)', color: 'bg-blue-900/40 border-blue-700/40' },
        { num: 6, label: 'src/utils/ledger.js', detail: 'registrarLog(CONTRIBUYENTE_CREAR)', color: 'bg-teal-900/40 border-teal-700/40' }
      ];
      const est = getSemaforoEstatus(state.dias, state.umbralCrit, state.umbralPrev);
      const color = est === 'vigente' ? 'green' : est === 'preventivo' ? 'yellow' : 'red';
      return { steps, events: `RFC: ALFA920101XYZ\nEstatus calculado: ${est}\nDías restantes: ${state.dias}`, verdict: { type: color, msg: `✅ HTTP 201 — Expediente registrado. Semáforo: ${est.toUpperCase()} (${state.dias} días). Evento en bitácora.` } };
    }
  },
  kpis: {
    name: 'GET /api/contribuyentes/dashboard/kpis',
    relevantControls: ['simRol', 'simJWT'],
    pipeline(state) {
      if (!state.jwt) return { steps: [{ num: 1, label: 'src/middleware/auth.js', detail: 'autenticar() → Sin token', color: 'bg-red-900/40 border-red-700/40' }], events: '', verdict: { type: 'red', msg: '🚫 HTTP 401 — Token requerido.' } };
      const steps = [
        { num: 1, label: 'server.js', detail: 'Router catch-all evalúa rutas en orden declarado', color: 'bg-indigo-900/40 border-indigo-700/40' },
        { num: 2, label: 'src/routes/contribuyentes.js', detail: '⚡ GET /dashboard/kpis debe estar ANTES de GET /:rfc (fix QA#1)', color: 'bg-yellow-900/40 border-yellow-700/40' },
        { num: 3, label: 'src/middleware/auth.js', detail: `autenticar() → OK (rol: ${state.rol})`, color: 'bg-indigo-900/40 border-indigo-700/40' },
        { num: 4, label: 'src/db/database.js', detail: state.rol === 'operador' ? 'COUNT(*) WHERE activo=1 AND responsable_id=? (solo su cartera)' : 'COUNT(*) WHERE activo=1 (todos)', color: 'bg-blue-900/40 border-blue-700/40' },
      ];
      const note = state.rol === 'operador' ? 'Operador ve SOLO su cartera (responsable_id = user.id)' : 'Admin/Supervisor ven TODOS los contribuyentes activos';
      return { steps, events: note, verdict: { type: 'green', msg: '✅ HTTP 200 — KPIs retornados: {total, vigentes, preventivos, criticos, expirados, proximos_a_vencer}.' } };
    }
  },
  key: {
    name: 'POST /api/contribuyentes/:rfc/key',
    relevantControls: ['simRol', 'simJWT', 'simTOTP'],
    pipeline(state) {
      if (!state.jwt) return { steps: [{ num: 1, label: 'src/middleware/auth.js', detail: 'autenticar() → Sin token', color: 'bg-red-900/40 border-red-700/40' }], events: '', verdict: { type: 'red', msg: '🚫 HTTP 401 — Token requerido.' } };
      if (state.rol === 'operador' || state.rol === 'anonimo') return {
        steps: [
          { num: 1, label: 'src/middleware/auth.js', detail: `autenticar() OK, requerirRol('admin','supervisor')`, color: 'bg-red-900/40 border-red-700/40' },
        ],
        events: `Rol "${state.rol}" no autorizado`,
        verdict: { type: 'red', msg: `🚫 HTTP 403 — Acceso denegado. Requiere rol: admin o supervisor.` }
      };
      if (!state.totp) return {
        steps: [
          { num: 1, label: 'src/middleware/auth.js', detail: `autenticar() OK, requerirRol('admin','supervisor') OK`, color: 'bg-indigo-900/40 border-indigo-700/40' },
          { num: 2, label: 'src/routes/contribuyentes.js', detail: 'Verificar req.user.totp_activado === true', color: 'bg-red-900/40 border-red-700/40' },
        ],
        events: 'totp_activado = false',
        verdict: { type: 'red', msg: '🚫 HTTP 403 — Se requiere 2FA activo para consultar claves privadas (TOTP_REQUERIDO).' }
      };
      const steps = [
        { num: 1, label: 'src/middleware/auth.js', detail: `autenticar() + requerirRol('admin','supervisor') → OK`, color: 'bg-indigo-900/40 border-indigo-700/40' },
        { num: 2, label: 'Verificar TOTP', detail: 'req.user.totp_activado === true ✓', color: 'bg-green-900/40 border-green-700/40' },
        { num: 3, label: 'Verificar límite diario', detail: 'COUNT(*) FROM consultas_contrasena_log WHERE usuario_id=? AND fecha_consulta=today', color: 'bg-blue-900/40 border-blue-700/40' },
        { num: 4, label: 'SELECT key_payload_cifrado', detail: 'Retorna el payload AES-GCM-256 cifrado en cliente (el servidor NO puede descifrarlo)', color: 'bg-purple-900/40 border-purple-700/40' },
        { num: 5, label: 'INSERT consultas_contrasena_log', detail: 'Registra la consulta para control del límite diario', color: 'bg-blue-900/40 border-blue-700/40' },
        { num: 6, label: 'src/utils/ledger.js', detail: 'registrarLog(CONSULTA_KEY_PRIVADA)', color: 'bg-teal-900/40 border-teal-700/40' }
      ];
      return { steps, events: 'consultas_hoy: 1/10\nEl cliente descifra el payload con su contraseña', verdict: { type: 'green', msg: '✅ HTTP 200 — Payload cifrado retornado. El servidor NUNCA puede descifrarlo (Zero-Knowledge). Auditado en bitácora.' } };
    }
  },
  alert: {
    name: 'POST /api/alertas/probar',
    relevantControls: ['simJWT', 'simCanal'],
    pipeline(state) {
      if (!state.jwt) return { steps: [{ num: 1, label: 'src/middleware/auth.js', detail: 'Sin token', color: 'bg-red-900/40 border-red-700/40' }], events: '', verdict: { type: 'red', msg: '🚫 HTTP 401.' } };
      const steps = [
        { num: 1, label: 'src/routes/alertas.js', detail: `Validar formato ${state.canal === 'whatsapp' ? 'E.164 (+521234567890)' : 'email válido'}`, color: 'bg-indigo-900/40 border-indigo-700/40' },
        { num: 2, label: 'src/utils/colaAlertas.js', detail: 'encolarAlerta() → INSERT INTO cola_alertas', color: 'bg-blue-900/40 border-blue-700/40' },
        { num: 3, label: 'src/utils/colaAlertas.js', detail: 'procesarColaAlertas() → intento inmediato', color: 'bg-purple-900/40 border-purple-700/40' },
        { num: 4, label: state.canal === 'correo' ? 'src/utils/mailer.js' : 'src/utils/whatsapp.js', detail: state.canal === 'correo' ? 'construirTransporte() → descifrar(SMTP_PASS) → sendMail()' : 'descifrar(WA_TOKEN) → POST al proveedor API', color: 'bg-yellow-900/40 border-yellow-700/40' },
        { num: 5, label: 'Resultado', detail: 'Si éxito: UPDATE cola_alertas SET estatus=enviado. Si falla: backoff 5/15/30 min', color: 'bg-teal-900/40 border-teal-700/40' },
      ];
      return { steps, events: `Canal: ${state.canal}\nBackoff: 5 → 15 → 30 min (max 3 intentos)`, verdict: { type: 'yellow', msg: `⚡ HTTP 200/502 según resultado real del proveedor. La alerta persiste en cola_alertas incluso si el servidor cae.` } };
    }
  },
  download: {
    name: 'GET /api/download/:token',
    relevantControls: ['simJWT'],
    pipeline(state) {
      const steps = [
        { num: 1, label: 'src/routes/downloads.js', detail: 'Endpoint PÚBLICO (sin autenticar)', color: 'bg-slate-800/40 border-slate-700/40' },
        { num: 2, label: 'src/utils/token.js', detail: 'hashToken(token) → SHA-256', color: 'bg-purple-900/40 border-purple-700/40' },
        { num: 3, label: 'src/db/database.js', detail: 'JOIN download_tokens + contribuyentes WHERE token_hash=?', color: 'bg-blue-900/40 border-blue-700/40' },
        { num: 4, label: 'Validaciones', detail: '¿Existe? ¿is_used=0? ¿expires_at > ahora?', color: 'bg-yellow-900/40 border-yellow-700/40' },
        { num: 5, label: 'Transacción atómica', detail: 'UPDATE WHERE is_used=0 → si changes=0: ya fue descargado (concurrente)', color: 'bg-indigo-900/40 border-indigo-700/40' },
        { num: 6, label: 'src/utils/ledger.js', detail: 'registrarLog(DESCARGA_CER/KEY/ZIP)', color: 'bg-teal-900/40 border-teal-700/40' },
        { num: 7, label: 'Entrega del archivo', detail: 'res.send(buffer) con Content-Disposition attachment', color: 'bg-green-900/40 border-green-700/40' }
      ];
      return { steps, events: 'is_used = 1 (ya no puede descargarse de nuevo)\nRegistro en bitácora inmutable', verdict: { type: 'green', msg: '✅ Archivo entregado. El token queda marcado como usado (único uso). Cualquier reintento recibirá HTTP 410.' } };
    }
  },
  recalc: {
    name: 'POST /api/alertas/recalcular (o cron 00:00 UTC)',
    relevantControls: ['simRol', 'simJWT', 'simUmbralCrit', 'simUmbralPrev'],
    pipeline(state) {
      if (!state.jwt) return { steps: [{ num: 1, label: 'src/middleware/auth.js', detail: 'Sin token', color: 'bg-red-900/40 border-red-700/40' }], events: '', verdict: { type: 'red', msg: '🚫 HTTP 401.' } };
      if (state.rol === 'operador' || state.rol === 'anonimo') return { steps: [{ num: 1, label: 'requerirRol', detail: `Rol "${state.rol}" no permitido`, color: 'bg-red-900/40 border-red-700/40' }], events: '', verdict: { type: 'red', msg: '🚫 HTTP 403 — Solo admin/supervisor pueden recalcular.' } };
      const steps = [
        { num: 1, label: 'src/routes/alertas.js', detail: 'POST /recalcular — autenticar + requerirRol(admin,supervisor)', color: 'bg-indigo-900/40 border-indigo-700/40' },
        { num: 2, label: 'src/utils/semaforo.js', detail: 'recalcularTodos(db): SELECT todos los contribuyentes', color: 'bg-purple-900/40 border-purple-700/40' },
        { num: 3, label: 'Motor semafórico', detail: `Para cada contribuyente: calcularEstatus(fecha, {umbral_critico:${state.umbralCrit}, umbral_preventivo:${state.umbralPrev}})`, color: 'bg-yellow-900/40 border-yellow-700/40' },
        { num: 4, label: 'src/db/database.js', detail: 'Transacción: UPDATE contribuyentes SET estatus=?, dias_restantes=? para cada uno', color: 'bg-blue-900/40 border-blue-700/40' },
        { num: 5, label: 'src/utils/ledger.js', detail: 'registrarLog(SEMAFORO_RECALCULAR_MANUAL)', color: 'bg-teal-900/40 border-teal-700/40' }
      ];
      return { steps, events: `Umbrales aplicados: Crítico=${state.umbralCrit}d, Preventivo=${state.umbralPrev}d\nTodos los contribuyentes actualizados en una transacción atómica`, verdict: { type: 'green', msg: `✅ HTTP 200 — Recálculo completado. Umbrales: crítico≤${state.umbralCrit}d (rojo), preventivo≤${state.umbralPrev}d (amarillo), vigente>${state.umbralPrev}d (verde).` } };
    }
  }
};

function getSemaforoEstatus(dias, crit, prev) {
  dias = parseInt(dias); crit = parseInt(crit); prev = parseInt(prev);
  if (dias <= 0) return 'expirado';
  if (dias <= crit) return 'critico';
  if (dias <= prev) return 'preventivo';
  return 'vigente';
}

function renderPipeline(steps) {
  return steps.map((s, i) => `
    <div class="pipeline-step border ${s.color}" style="transition-delay:${i * 60}ms">
      <span class="step-num bg-indigo-600 text-white">${s.num}</span>
      <div>
        <div class="font-mono text-indigo-200 font-medium text-xs">${s.label}</div>
        <div class="text-slate-300 text-xs mt-0.5">${s.detail}</div>
      </div>
    </div>
  `).join('');
}

function renderVerdict(v) {
  if (!v) return '';
  const cls = { green: 'verdict-green', yellow: 'verdict-yellow', red: 'verdict-red', grey: 'verdict-grey' };
  return `<div class="verdict ${cls[v.type] || 'verdict-grey'}">${v.msg}</div>`;
}

function runSimulator() {
  const endpoint = document.getElementById('simEndpoint')?.value || 'login';
  const state = {
    rol: document.getElementById('simRol')?.value || 'admin',
    jwt: document.getElementById('simJWT')?.checked ?? true,
    totp: document.getElementById('simTOTP')?.checked ?? false,
    dias: document.getElementById('simDias')?.value ?? 45,
    canal: document.getElementById('simCanal')?.value || 'correo',
    umbralCrit: document.getElementById('simUmbralCrit')?.value ?? 30,
    umbralPrev: document.getElementById('simUmbralPrev')?.value ?? 90
  };

  const scenario = SCENARIOS[endpoint];
  if (!scenario) return;

  const result = scenario.pipeline(state);

  const pipelineEl = document.getElementById('simPipeline');
  const eventsEl = document.getElementById('simEvents');
  const verdictEl = document.getElementById('simVerdict');

  if (pipelineEl) {
    pipelineEl.innerHTML = renderPipeline(result.steps);
    setTimeout(() => {
      pipelineEl.querySelectorAll('.pipeline-step').forEach(el => el.classList.add('visible'));
    }, 10);
  }
  if (eventsEl) eventsEl.textContent = result.events || '—';
  if (verdictEl) verdictEl.innerHTML = renderVerdict(result.verdict);

  // Show/hide contextual controls
  const diasCtrl = document.getElementById('ctrlDias');
  const canalCtrl = document.getElementById('ctrlCanal');
  if (diasCtrl) diasCtrl.style.display = ['register', 'recalc'].includes(endpoint) ? 'flex' : 'none';
  if (canalCtrl) canalCtrl.style.display = endpoint === 'alert' ? 'flex' : 'none';
}

// ══════════════════════════════════════════════════════════════
// 2. CATÁLOGO DE MÓDULOS
// ══════════════════════════════════════════════════════════════

const BADGE_LABELS = { core: 'Core', route: 'Ruta', service: 'Servicio', util: 'Util', db: 'BD', mw: 'Middleware', ui: 'Frontend' };

function renderModuleCard(mod) {
  return `
    <div class="module-card" data-layer="${mod.layer}" data-search="${(mod.file + mod.path + mod.what + mod.why).toLowerCase()}">
      <div class="flex items-start gap-3 mb-2">
        <span class="text-xl">${mod.icon}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-mono text-sm font-semibold text-white">${mod.file}</span>
            <span class="badge badge-${mod.badge}">${BADGE_LABELS[mod.badge] || mod.badge}</span>
          </div>
          <div class="text-xs text-slate-400 font-mono mt-0.5">${mod.path}</div>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-xs">
        <div>
          <div class="text-indigo-300 font-semibold mb-1">🎯 ¿Qué hace?</div>
          <div class="text-slate-300 leading-relaxed">${mod.what}</div>
        </div>
        <div>
          <div class="text-yellow-300 font-semibold mb-1">💡 ¿Por qué existe?</div>
          <div class="text-slate-300 leading-relaxed">${mod.why}</div>
        </div>
        <div>
          <div class="text-red-300 font-semibold mb-1">⚠️ Regla crítica</div>
          <div class="text-slate-300 leading-relaxed">${mod.critical}</div>
        </div>
      </div>
      ${mod.deps && mod.deps.length ? `
        <div class="mt-3 flex flex-wrap gap-1">
          ${mod.deps.map(d => `<span class="badge" style="background:rgba(255,255,255,0.04);color:#94a3b8;border-color:rgba(255,255,255,0.08);font-size:0.68rem">${d}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderCatalog() {
  const container = document.getElementById('catalogList');
  if (!container) return;
  container.innerHTML = MODULES.map(renderModuleCard).join('');
}

function filterCatalog() {
  const query = (document.getElementById('catalogSearch')?.value || '').toLowerCase();
  const activeLayer = document.querySelector('.filter-chip.active-chip')?.dataset?.layer || 'all';
  document.querySelectorAll('.module-card').forEach(card => {
    const layerMatch = activeLayer === 'all' || card.dataset.layer === activeLayer;
    const searchMatch = !query || card.dataset.search.includes(query);
    card.classList.toggle('hidden-card', !(layerMatch && searchMatch));
  });
}

// ══════════════════════════════════════════════════════════════
// 3. ANALIZADOR DE IMPACTO
// ══════════════════════════════════════════════════════════════

function populateImpactSelect() {
  const sel = document.getElementById('impactSelect');
  if (!sel) return;
  const keys = Object.keys(IMPACT_DATA);
  keys.forEach(k => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k;
    sel.appendChild(opt);
  });
}

function renderImpact(fileId) {
  const data = IMPACT_DATA[fileId];
  const result = document.getElementById('impactResult');
  const placeholder = document.getElementById('impactPlaceholder');
  if (!data) { result?.classList.add('hidden'); placeholder?.classList.remove('hidden'); return; }

  result?.classList.remove('hidden');
  placeholder?.classList.add('hidden');

  // Ficha
  const mod = MODULES.find(m => m.path === fileId);
  const fichaEl = document.getElementById('impactFicha');
  if (fichaEl && mod) {
    fichaEl.innerHTML = `
      <div class="flex items-center gap-2 mb-3">
        <span class="text-2xl">${mod.icon}</span>
        <div>
          <div class="font-mono font-bold text-white text-sm">${mod.file}</div>
          <span class="badge badge-${mod.badge} mt-1">${BADGE_LABELS[mod.badge] || mod.badge}</span>
        </div>
      </div>
      <p class="text-sm text-slate-300 leading-relaxed mb-3">${data.ficha}</p>
      <div class="text-xs text-slate-400 font-mono">${mod.path}</div>
    `;
  }

  // Riesgos
  const risksEl = document.getElementById('impactRisks');
  if (risksEl) {
    risksEl.innerHTML = data.risks.map(r => {
      const level = r.startsWith('CRÍTICO') ? 'risk-high' : r.startsWith('ALTO') ? 'risk-high' : r.startsWith('MEDIO') ? 'risk-med' : 'risk-low';
      const icon = r.startsWith('CRÍTICO') || r.startsWith('ALTO') ? '🚨' : r.startsWith('MEDIO') ? '⚠️' : '💡';
      return `<div class="dep-item mb-2"><span class="${level} font-semibold text-xs">${icon} ${r}</span></div>`;
    }).join('');
  }

  // Dependientes con snippets
  const depsEl = document.getElementById('impactDeps');
  if (depsEl) {
    depsEl.innerHTML = data.dependents.map(d => `
      <div class="dep-item">
        <div class="flex items-center gap-2 mb-1">
          <span class="font-mono text-xs font-bold text-indigo-300">${d.file}</span>
          <span class="badge" style="background:rgba(251,191,36,0.1);color:#fbbf24;border-color:rgba(251,191,36,0.2)">${d.fn}</span>
          ${d.line ? `<span class="text-xs text-slate-500">L.${d.line}</span>` : ''}
        </div>
        <div class="text-xs text-slate-400 mb-2">Contrato: <span class="font-mono text-slate-300">${d.contract}</span></div>
        <pre style="margin-top:0.4rem"><button class="copy-btn" onclick="copyCode(this)">Copiar</button><code>${escapeHtml(d.snippet)}</code></pre>
      </div>
    `).join('');
  }
}

// ══════════════════════════════════════════════════════════════
// 4. RECETAS DE DESARROLLO
// ══════════════════════════════════════════════════════════════

const RECIPES = [
  {
    title: '🛤️ Cómo agregar un nuevo endpoint a la API REST',
    steps: [
      {
        label: '1. Crear el archivo de ruta en src/routes/',
        code: `// src/routes/miNuevaRuta.js
'use strict';

const express = require('express');
const db = require('../db/database');
const { autenticar, requerirRol, obtenerIP } = require('../middleware/auth');
const { registrarLog } = require('../utils/ledger');

const router = express.Router();

// GET /api/mi-ruta
router.get('/', autenticar, (req, res) => {
  const datos = db.prepare('SELECT * FROM mi_tabla').all();
  res.json({ data: datos });
});

// POST /api/mi-ruta — solo admin
router.post('/', autenticar, requerirRol('admin'), (req, res) => {
  const { campo1, campo2 } = req.body;
  if (!campo1) {
    return res.status(400).json({ error: 'campo1 es requerido.' });
  }

  const resultado = db.prepare(
    'INSERT INTO mi_tabla (campo1, campo2) VALUES (?, ?)'
  ).run(campo1, campo2);

  registrarLog({
    usuario_id: req.user.id,
    usuario_email: req.user.email,
    accion: 'MI_ACCION_CREAR',
    detalle: \`campo1: \${campo1}\`,
    ip_origen: obtenerIP(req)
  });

  res.status(201).json({ ok: true, id: resultado.lastInsertRowid });
});

module.exports = router;`
      },
      {
        label: '2. Registrar el router en server.js',
        code: `// server.js — agregar ANTES del middleware de error global
const miNuevaRuta = require('./src/routes/miNuevaRuta');
app.use('/api/mi-ruta', miNuevaRuta);`
      },
      {
        label: '3. Agregar la tabla al schema (si es nueva)',
        code: `-- schema.sql
CREATE TABLE IF NOT EXISTS mi_tabla (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    campo1     TEXT NOT NULL,
    campo2     TEXT,
    creado_en  INTEGER NOT NULL DEFAULT (unixepoch()),
    actualizado_en INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Ejecutar: npm run init-db`
      }
    ]
  },
  {
    title: '🔔 Cómo agregar un nuevo tipo de alerta/notificación',
    steps: [
      {
        label: '1. Encolar la alerta desde cualquier módulo',
        code: `// Desde cualquier ruta o util donde ocurra el evento:
const { encolarAlerta } = require('../utils/colaAlertas');

// La alerta se persiste en BD y se envía con backoff automático
encolarAlerta({
  tipo: 'correo',         // 'correo' | 'whatsapp'
  destinatario: 'admin@empresa.com',
  asunto: 'Alerta: Certificado próximo a vencer',
  mensaje: \`El RFC ALFA920101XYZ vence en 3 días.\`,
  max_intentos: 3         // opcional, default 3
});`
      },
      {
        label: '2. El cron de 1 min en server.js procesa la cola automáticamente',
        code: `// server.js — ya está configurado:
cron.schedule('* * * * *', async () => {
  const resultado = await procesarColaAlertas();
  // resultado: { procesadas, enviadas, fallidas }
});

// Si necesitas envío inmediato (sin esperar el cron):
const { procesarColaAlertas } = require('./src/utils/colaAlertas');
const idCola = encolarAlerta({ ... });
await procesarColaAlertas(); // procesa la cola ahora`
      },
      {
        label: '3. Verificar que la configuración SMTP/WhatsApp está activa',
        code: `// La config vive en la tabla alertas_config (id=1).
// Para activar correo, el admin debe ir a PUT /api/alertas/config con:
{
  "correo_activo": true,
  "correo_smtp_host": "smtp.gmail.com",
  "correo_smtp_puerto": 587,
  "correo_smtp_usuario": "sistema@empresa.com",
  "correo_smtp_pass": "contraseña_app"  // se cifra con AES-256-GCM
}`
      }
    ]
  },
  {
    title: '🔐 Cómo agregar un nuevo nivel de RBAC o permiso',
    steps: [
      {
        label: '1. Modificar el CHECK en schema.sql y la validación en usuarios.js',
        code: `-- schema.sql: Agregar el nuevo rol al CHECK
rol TEXT NOT NULL CHECK(rol IN ('admin', 'supervisor', 'operador', 'auditor'))

-- src/routes/usuarios.js: Actualizar la lista de roles válidos
const roles_validos = ['admin', 'supervisor', 'operador', 'auditor'];`
      },
      {
        label: '2. Aplicar el nuevo rol en las rutas que correspondan',
        code: `// src/routes/bitacora.js — solo auditor puede ver bitácora completa:
router.get('/', autenticar, requerirRol('admin', 'supervisor', 'auditor'),
  (req, res) => { /* ... */ }
);

// requerirRol() acepta N roles como parámetros rest:
// requerirRol('admin')                → solo admin
// requerirRol('admin', 'supervisor')  → admin o supervisor
// requerirRol('admin', 'auditor')     → admin o auditor`
      },
      {
        label: '3. Actualizar la UI para mostrar/ocultar secciones según el rol',
        code: `// public/js/auth.js — en iniciarSesionUsuario():
const navBitacora = document.querySelector('[data-target="bitacora"]');
if (navBitacora) {
  // Ocultar a operadores sin permiso de auditoría
  navBitacora.style.display =
    ['admin', 'supervisor', 'auditor'].includes(user.rol)
      ? 'block' : 'none';
}`
      }
    ]
  },
  {
    title: '🚦 Cómo modificar los umbrales del semáforo de vencimiento',
    steps: [
      {
        label: '1. Actualizar vía API (recomendado, sin tocar código)',
        code: `// PUT /api/alertas/config con token de admin/supervisor:
// Ejemplo con fetch desde el cliente:
await apiFetch('/alertas/config', {
  method: 'PUT',
  body: JSON.stringify({
    umbral_critico_dias: 15,    // Rojo si quedan ≤ 15 días
    umbral_preventivo_dias: 60  // Amarillo si quedan ≤ 60 días
  })
});

// Luego forzar el recálculo para aplicar a todos los contribuyentes:
await apiFetch('/alertas/recalcular', { method: 'POST' });`
      },
      {
        label: '2. La lógica de cálculo está en src/utils/semaforo.js (no modificar directamente)',
        code: `// src/utils/semaforo.js — función pura de cálculo:
function calcularEstatus(fecha_vencimiento, config = {}) {
  const umbralCritico    = config.umbral_critico_dias    || 30;
  const umbralPreventivo = config.umbral_preventivo_dias || 90;

  // Comparación UTC para evitar desfases de zona horaria
  const hoyUTC = new Date();
  hoyUTC.setUTCHours(0, 0, 0, 0);

  // Retorna: { dias_restantes, estatus, color }
  // estatus: 'vigente' | 'preventivo' | 'critico' | 'expirado'
}

// NUNCA cambiar los defaults aquí sin actualizar alertas_config en BD`
      },
      {
        label: '3. El recálculo automático corre cada noche a las 00:00 UTC (cron en server.js)',
        code: `// server.js — cron nocturno (ya configurado):
cron.schedule('0 0 * * *', () => {
  const total = recalcularTodos(db);  // Actualiza TODOS los contribuyentes
  console.log(\`[Cron] \${total} contribuyentes actualizados\`);
}, { timezone: 'UTC' });

// Para forzar manualmente:
// POST /api/alertas/recalcular  (requiere rol admin/supervisor)`
      }
    ]
  },
  {
    title: '📦 Cómo crear una nueva vista en el frontend SPA',
    steps: [
      {
        label: '1. Crear el módulo de vista en public/js/views/',
        code: `// public/js/views/miVista.js
// Exponer funciones globalmente (sin bundler/módulos ES)

function inicializarMiVista() {
  // Configurar event listeners, formularios, etc.
  const btnCargar = document.getElementById('btnCargarMiVista');
  if (btnCargar) btnCargar.addEventListener('click', cargarMiVista);
}

async function cargarMiVista() {
  try {
    const datos = await apiFetch('/mi-ruta');  // usa config.js
    renderizarMiVista(datos);
  } catch (err) {
    showToast('Error al cargar datos: ' + err.message, 'danger');
  }
}

function renderizarMiVista(datos) {
  const contenedor = document.getElementById('miVistaContenedor');
  if (!contenedor) return;
  contenedor.innerHTML = datos.data.map(item =>
    \`<div class="card">\${item.campo1}</div>\`
  ).join('');
}`
      },
      {
        label: '2. Agregar la sección HTML en index.html',
        code: `<!-- index.html — dentro del sidebar y del contenido principal -->

<!-- Sidebar item -->
<a class="sidebar-item" data-target="miVista" href="#">
  📋 Mi Vista
</a>

<!-- Sección de contenido -->
<div id="miVista" class="content-section">
  <div id="miVistaContenedor">
    <!-- Contenido renderizado por JS -->
  </div>
  <button id="btnCargarMiVista">Cargar Datos</button>
</div>`
      },
      {
        label: '3. Registrar el script y el inicializador en app.js',
        code: `<!-- index.html — agregar el script antes del cierre de </body> -->
<script src="/js/views/miVista.js"></script>

// public/js/app.js — agregar en DOMContentLoaded:
if (typeof inicializarMiVista === 'function') inicializarMiVista();

// Y en router.js, agregar el hook de carga lazy:
if (targetId === 'miVista' && typeof cargarMiVista === 'function') {
  cargarMiVista();
}`
      }
    ]
  },
  {
    title: '🔗 Cómo generar y consumir un token de descarga temporal',
    steps: [
      {
        label: '1. Generar el token (ruta autenticada)',
        code: `// POST /api/contribuyentes/:rfc/download-token
// Con token JWT de admin/supervisor/operador:
const response = await apiFetch(\`/contribuyentes/\${rfc}/download-token\`, {
  method: 'POST',
  body: JSON.stringify({
    file_type: 'ZIP',     // 'CER' | 'KEY' | 'ZIP'
    ttl_minutes: 60,      // Tiempo de vigencia (1-1440 min)
    email_destino: 'contribuyente@email.com',   // Opcional: envía correo
    whatsappDestino: '+521234567890'             // Opcional: envía WhatsApp
  })
});

// Respuesta: { download_url, expires_at, file_type, preview_url }`
      },
      {
        label: '2. El consumidor descarga sin autenticación (token es el secreto)',
        code: `// GET /api/download/:token  (URL de único uso)
// El token se consume una sola vez. Intentos repetidos → HTTP 410.

// Internamente en downloads.js:
// 1. hashToken(token) → SHA-256
// 2. SELECT donde token_hash = ?
// 3. Validar: existe, is_used=0, expires_at > ahora
// 4. UPDATE SET is_used=1 WHERE is_used=0  ← anti-replay atómico
// 5. Entregar el archivo`
      },
      {
        label: '3. Flujo de seguridad completo',
        code: `// El token seguro se genera con crypto.randomBytes(32) → 64 chars hex
// Solo el hash SHA-256 se almacena en BD (nunca el token plano)
// Incluso con acceso a la BD, no se puede reconstruir la URL de descarga

// src/utils/token.js:
function generarTokenSeguro() {
  return crypto.randomBytes(32).toString('hex');
}
function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}`
      }
    ]
  }
];

function renderRecipes() {
  const container = document.getElementById('recipesContainer');
  if (!container) return;
  container.innerHTML = RECIPES.map((recipe, i) => `
    <div class="recipe-card">
      <div class="recipe-header" onclick="toggleRecipe(${i})">
        <span class="text-sm font-semibold text-white">${recipe.title}</span>
        <span class="text-slate-400 text-lg" id="recipeArrow${i}">▸</span>
      </div>
      <div class="recipe-body" id="recipeBody${i}">
        ${recipe.steps.map((step, j) => `
          <div class="recipe-step">
            <div class="step-circle">${j + 1}</div>
            <div class="flex-1">
              <div class="text-sm font-semibold text-white mb-2">${step.label}</div>
              <div class="relative">
                <pre><button class="copy-btn" onclick="copyCode(this)">Copiar</button><code>${escapeHtml(step.code)}</code></pre>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

window.toggleRecipe = function(i) {
  const body = document.getElementById(`recipeBody${i}`);
  const arrow = document.getElementById(`recipeArrow${i}`);
  if (!body) return;
  body.classList.toggle('open');
  if (arrow) arrow.textContent = body.classList.contains('open') ? '▾' : '▸';
};

// ══════════════════════════════════════════════════════════════
// 5. REGLAS DE ORO
// ══════════════════════════════════════════════════════════════

const GOLDEN_RULES = [
  {
    antipattern: '🚫 Declarar GET /:rfc ANTES de GET /dashboard/kpis en Express',
    fix: '✅ Las rutas estáticas y específicas siempre ANTES de las dinámicas con parámetros (/:id). Express evalúa en orden de declaración.',
    severity: 'CRÍTICO',
    context: 'src/routes/contribuyentes.js — fix QA#1'
  },
  {
    antipattern: '🚫 Almacenar contraseñas SMTP o tokens API en texto plano en la BD',
    fix: '✅ Usar cifrar() de src/utils/crypto.js (AES-256-GCM). ENCRYPTION_KEY solo en .env, nunca en el repositorio.',
    severity: 'CRÍTICO',
    context: 'src/utils/crypto.js — fix QA ALTA'
  },
  {
    antipattern: '🚫 Crear múltiples instancias de Database() (better-sqlite3)',
    fix: '✅ Importar siempre el singleton exportado por src/db/database.js. Never new Database() en otro módulo.',
    severity: 'CRÍTICO',
    context: 'src/db/database.js'
  },
  {
    antipattern: '🚫 Borrar o editar registros de la tabla bitacora_logs',
    fix: '✅ La bitácora es de solo escritura (INSERT). Modificar un registro rompe la cadena SHA-256 y lo detecta verificarIntegridadLedger().',
    severity: 'CRÍTICO',
    context: 'src/utils/ledger.js'
  },
  {
    antipattern: '🚫 Enviar el archivo .key de la e.Firma en texto plano al backend',
    fix: '✅ Cifrar con Web Crypto API (AES-GCM) en el cliente ANTES de enviar. El servidor almacena key_payload_cifrado sin poder descifrarlo.',
    severity: 'CRÍTICO',
    context: 'public/js/crypto.js — principio Zero-Knowledge'
  },
  {
    antipattern: '🚫 Retornar key_payload_cifrado en GET /api/contribuyentes/:rfc',
    fix: '✅ Usar desestructuración para omitir el campo: const { key_payload_cifrado, ...datosPublicos } = contribuyente',
    severity: 'CRÍTICO',
    context: 'src/routes/contribuyentes.js L.261'
  },
  {
    antipattern: '🚫 Aplicar requerirRol() sin autenticar() antes',
    fix: '✅ Siempre: router.method("/ruta", autenticar, requerirRol(...), handler). autenticar carga req.user; sin él, requerirRol() retorna 401.',
    severity: 'ALTO',
    context: 'src/middleware/auth.js'
  },
  {
    antipattern: '🚫 Comparar fechas de certificados sin normalizar a UTC 00:00',
    fix: '✅ hoyUTC.setUTCHours(0,0,0,0) antes de comparar. La fecha de vencimiento se parsea como YYYY-MM-DDT00:00:00Z explícitamente.',
    severity: 'ALTO',
    context: 'src/utils/semaforo.js'
  },
  {
    antipattern: '🚫 Hacer UPDATE de is_used sin la condición AND is_used=0',
    fix: '✅ La cláusula AND is_used=0 en el UPDATE es el único mecanismo anti-replay para descargas concurrentes. Eliminarla permite doble descarga.',
    severity: 'ALTO',
    context: 'src/routes/downloads.js L.295-299'
  },
  {
    antipattern: '🚫 Exponer token_activacion en la respuesta HTTP en producción',
    fix: '✅ El token solo se retorna en NODE_ENV=development. En producción, se envía exclusivamente por correo al usuario.',
    severity: 'ALTO',
    context: 'src/routes/usuarios.js — fix QA MEDIA'
  },
  {
    antipattern: '🚫 Cambiar ENCRYPTION_KEY en producción sin migrar los secretos cifrados',
    fix: '✅ Si se rota la key: (1) descifrar todos los secretos con la key vieja, (2) volver a cifrar con la nueva, (3) actualizar alertas_config.',
    severity: 'ALTO',
    context: 'src/utils/crypto.js'
  },
  {
    antipattern: '🚫 Usar Math.random() para simular envíos de alertas',
    fix: '✅ Usar procesarColaAlertas() que conecta con el proveedor SMTP/WhatsApp real y retorna el resultado determinístico real.',
    severity: 'MEDIO',
    context: 'src/utils/colaAlertas.js — fix QA#12,#13'
  },
  {
    antipattern: '🚫 Omitir la propiedad responsable_id al crear un contribuyente',
    fix: '✅ responsable_id = req.user.id. Es FK NOT NULL a usuarios. Sin él, el INSERT falla con FOREIGN KEY constraint.',
    severity: 'MEDIO',
    context: 'src/routes/contribuyentes.js — schema.sql'
  },
  {
    antipattern: '🚫 Procesar procesarColaAlertas() sin await en contexto async',
    fix: '✅ Siempre await procesarColaAlertas(). Es async (usa nodemailer / fetch). Sin await, los errores son unhandled Promise rejections.',
    severity: 'MEDIO',
    context: 'src/utils/colaAlertas.js'
  },
  {
    antipattern: '🚫 Usar cron sin timezone: "UTC" para el recálculo semafórico',
    fix: '✅ Agregar { timezone: "UTC" } en cron.schedule(). Sin esto, el cron corre en la hora local del servidor, no en UTC 00:00.',
    severity: 'MEDIO',
    context: 'server.js L.136'
  },
  {
    antipattern: '🚫 Agregar endpoints DELETE/PUT a src/routes/bitacora.js',
    fix: '✅ La bitácora es de solo lectura (GET) y escritura (INSERT via ledger.js). No existe ruta de modificación por diseño.',
    severity: 'CRÍTICO',
    context: 'src/routes/bitacora.js'
  }
];

function renderGoldenRules() {
  const container = document.getElementById('goldenRules');
  if (!container) return;

  const byLevel = ['CRÍTICO', 'ALTO', 'MEDIO'];
  const levelColors = {
    'CRÍTICO': { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', text: '#f87171' },
    'ALTO': { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', text: '#fbbf24' },
    'MEDIO': { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.25)', text: '#818cf8' }
  };

  container.innerHTML = byLevel.map(level => {
    const rules = GOLDEN_RULES.filter(r => r.severity === level);
    const c = levelColors[level];
    return `
      <div class="mb-6">
        <h3 class="text-sm font-bold mb-3" style="color:${c.text}">
          ${level === 'CRÍTICO' ? '🚨' : level === 'ALTO' ? '⚠️' : '💡'} Severidad ${level} (${rules.length} reglas)
        </h3>
        ${rules.map(r => `
          <div class="rule-row">
            <div class="dep-item" style="background:${c.bg};border-color:${c.border}">
              <div class="text-xs font-semibold mb-1" style="color:${c.text}">🚫 Anti-patrón</div>
              <div class="text-sm text-slate-200">${r.antipattern}</div>
              <div class="text-xs text-slate-500 mt-1.5 font-mono">${r.context}</div>
            </div>
            <div class="dep-item" style="background:rgba(16,185,129,0.06);border-color:rgba(16,185,129,0.2)">
              <div class="text-xs font-semibold mb-1 text-green-300">✅ Buena práctica obligatoria</div>
              <div class="text-sm text-slate-200">${r.fix}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// UTILIDADES
// ══════════════════════════════════════════════════════════════

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.copyCode = function(btn) {
  const pre = btn.parentElement;
  const code = pre.querySelector('code');
  if (!code) return;
  navigator.clipboard.writeText(code.textContent).then(() => {
    showToast('✓ Código copiado al portapapeles');
    btn.textContent = '✓';
    setTimeout(() => { btn.textContent = 'Copiar'; }, 1500);
  });
};

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ══════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

  // ── Tab navigation ──
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      const section = document.getElementById(btn.dataset.section);
      if (section) section.classList.add('active');
    });
  });

  // ── Section 1: Simulador ──
  const simControls = ['simEndpoint', 'simRol', 'simJWT', 'simTOTP', 'simDias', 'simCanal', 'simUmbralCrit', 'simUmbralPrev'];
  simControls.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', runSimulator);
    if (el && el.tagName === 'INPUT' && el.type === 'number') el.addEventListener('input', runSimulator);
  });
  runSimulator(); // Run on load

  // ── Section 2: Catálogo ──
  renderCatalog();
  document.getElementById('catalogSearch')?.addEventListener('input', filterCatalog);
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active-chip'));
      chip.classList.add('active-chip');
      filterCatalog();
    });
  });

  // ── Section 3: Impacto ──
  populateImpactSelect();
  document.getElementById('impactSelect')?.addEventListener('change', e => {
    renderImpact(e.target.value);
  });

  // ── Section 4: Recetas ──
  renderRecipes();

  // ── Section 5: Reglas de Oro ──
  renderGoldenRules();

  console.log('[SAT Docs] Dashboard de arquitectura cargado correctamente. v2.3.4');
});
