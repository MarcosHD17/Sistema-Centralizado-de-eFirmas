# STATE: Estado del Proyecto y Registro de Cambios

## Proyecto: SAT Control Manager (v2.4.2)
## Feature Activa: Fix de Rotación de Dona CSS, Exposición de Handlers Globales en UI, Selector Dinámico de Gráficas y RBAC — Merge en `main`.

---

#### 📌 Estado Actual
- **Fase:** ✅ COMPLETADO — Eliminación de rotación global SVG en CSS para texto central nivelado a 0°, exposición de funciones `window` para habilitación de botones de historial y contraseña en la tabla del tablero ejecutivo.
- **Rama Git Activa:** `main` (estable)
- **Última Actualización:** 2026-09-08

---

### 📋 Tablero de Tareas

- [x] **Paso 1:** Auditoría de código real y matching con NotebookLM (Completado - 95% Match).
- [x] **Paso 2:** Creación de archivos de gobernanza (`.cursorrules`, `PRD_SCE.md`, `STATE.md`).
- [x] **Paso 3:** Limpieza de Working Tree e higiene de Git (Commit de ajuste y creación de rama `feature/secure-download-links`).
- [x] **Paso 4:** Definición de DDL para la tabla `download_tokens` en `src/db/init.js`.
- [x] **Paso 5:** Implementación de servicio de tokens y hashing SHA-256 (`src/utils/token.js`).
- [x] **Paso 6:** Implementación del endpoint de generación `POST /api/contribuyentes/:rfc/download-token`.
- [x] **Paso 7:** Implementación del endpoint público de consumo `GET /api/download/:token` con transacción e integración al Ledger.
- [x] **Paso 8:** Pruebas de QA y seguridad (expiración, reuso de token, verificación de bitácora).
- [x] **Paso 9:** Code Review y Merge a `main`.
- [x] **Paso 10:** Refactorización UI/UX (Traslado de "Compartir FIEL" a barra lateral).
- [x] **Paso 11:** Inicialización de DB, verificación de arquitectura y emisión de protocolo de pruebas.
- [x] **Paso 12:** Modularización de la interfaz web en `public/css/` y `public/js/`.
- [x] **Paso 13:** Flujo de expiración, solicitud de renovación por correo y panel de aprobación administrativa.
- [x] **Paso 14:** Integración y verificación de transporte SMTP Real (Yahoo, puerto 587 STARTTLS) con fallback defensivo.
- [x] **Paso 15:** Integración y resolución de conflictos de merge en `index.html`.
- [x] **Paso 16:** Documentación técnica y Manual de Usuario final en `DOC/manual_usuario.md`.
- [x] **Paso 17:** Integración real de notificaciones por WhatsApp vía **Twilio SDK oficial**.
- [x] **Paso 18:** Dashboard Interactivo de Arquitectura y Simulador Reactivo en Vivo (`docs/index.html` + `docs/app.js`).
- [x] **Paso 19:** Auto-normalización de números celulares de México (`+521`), soporte para Twilio Content Templates (`contentSid` / `contentVariables`) y verificación de entrega end-to-end (`Status: delivered`).
- [x] **Paso 20:** Unificación y corrección de handlers del botón "Enviar Alerta de Prueba" en `index.html` y `public/js/views/alertas.js`, actualización del endpoint `/api/alertas/probar` a Twilio SDK directo con mensajes ricos y telemetría de auditoría en la bitácora.
- [x] **Paso 21:** Implementación de auto-reconexión en la SPA (`public/js/config.js`) al re-detectar el servidor backend activo tras un reinicio o corte de conexión.
- [x] **Paso 22:** **Redirección de Activación 2FA a Mi Perfil (Mejora #3):** Implementación de la sección y vista `public/js/views/perfil.js` con QR y verificación TOTP de 6 dígitos. Redirección corregida desde consultas de clave hacia `[data-target="perfil"]`.
- [x] **Paso 23:** **Rediseño de Gráfica a Barras Verticales (Mejora #1):** Sustitución de la dona SVG por gráfica de barras verticales estilizadas (Vigente / Próxima / Vencida) con conteos y porcentajes horizontales legibles.
- [x] **Paso 24:** **Historial por Contribuyente (Mejora #2):** Nuevo endpoint `GET /api/contribuyentes/:rfc/historial` y modal interactivo de auditoría y operaciones cronológicas en el cliente (`window.abrirHistorialContribuyente`).
- [x] **Paso 25:** **RBAC Diferenciado por Rol (Mejora #4):** Mapa de navegación por rol (`admin`, `supervisor`, `operador`) en `public/js/router.js` con visibilidad dinámica de sidebar y guards de navegación en el cliente y backend.
- [x] **Paso 26:** **Selector Dinámico de Gráficas (Dona / Barras):** Implementación de controles interactivos `🍩 Dona` / `📊 Barras` en el encabezado de la tarjeta de estatus. Conserva el gráfico de dona original con el número central horizontal recto (`dominant-baseline="central"` y `writing-mode: horizontal-tb`).
- [x] **Paso 27:** **Acceso Directo a Contraseñas en Tablero:** Enlace explícito `🔑 Contraseña` en cada fila de contribuyente de la tabla "Atención Urgente y Estatus de Clientes", manteniendo el flujo de validación 2FA y telemetría de auditoría.
- [x] **Paso 28:** **Fix de Rotación CSS de Dona (Hallazgó #31):** Eliminación de `transform: rotate(-90deg)` en `.donut-chart` para evitar la inclinación vertical del texto central, manteniéndolo a 0° horizontal nivelado.
- [x] **Paso 29:** **Habilitación de Handlers Globales en UI (Hallazgo #32):** Exposición explícita de `window.consultarClavePrivada` y `window.abrirHistorialContribuyente` garantizando la ejecución directa al presionar los enlaces de la tabla.

---

### 📝 Bitácora de Hallazgos y Decisiones
- **2026-08-01 a 2026-08-31:** Hitos del 1 al 17 (Auditoría, DDL `download_tokens`, Ledger-chain, ZIP completo, SMTP Yahoo, modularización SPA).
- **2026-09-02:** Construcción del Dashboard Interactivo de Arquitectura en `docs/index.html` y `docs/app.js`.
- **2026-09-03:** Migración del módulo WhatsApp (`src/utils/whatsapp.js`) al SDK oficial `twilio`.
- **2026-09-04:** Integración de auto-normalización `+521` México, Content Templates y suite de verificación e2e.
- **2026-09-08:** **Implementación de las 4 Mejoras de Dashboard, Auditoría y RBAC (v2.4.0):**
  - Fix de redirección 2FA a vista `perfil` e integración de verificación TOTP.
  - Rediseño visual a barras verticales para la distribución de estatus semafórico.
  - Endpoint `GET /:rfc/historial` y modal de auditoría por contribuyente.
  - Control de acceso RBAC por rol en menú, rutas SPA y consultas de backend.
- **2026-09-08:** **Experiencia de Usuario y Visualización Flexible (v2.4.1):**
  - Selector dinámico entre vista de dona circular (con alineación horizontal de texto corregida) y barras verticales.
  - Botón visible `🔑 Contraseña` en la tabla de Atención Urgente para agilizar consultas autorizadas.
- **2026-09-08:** **Resolución de Defectos Visuales e Interacción (v2.4.2):**
  - Eliminación de `transform: rotate(-90deg)` en CSS para garantizar texto central plano a 0°.
  - Exposición explícita en `window` de funciones de historial y consulta de clave privada.
