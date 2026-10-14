# STATE: Estado del Proyecto y Registro de Cambios

## Proyecto: SAT Control Manager (v2.4.3)
## Feature Activa: Estabilización de Frontend SPA — Puente seguro de sesión window.usuarioActual, corrección DOM de perfil, RBAC de sidebar y registro formal de deuda técnica.

---

#### 📌 Estado Actual
- **Fase:** ✅ COMPLETADO — Resolución de ReferenceError en dashboard, corrección estructural de árbol DOM en sección perfil/2FA, implementación estricta de MENU_POR_ROL en navegación SPA e inventario de deuda técnica del inline script.
- **Rama Git Activa:** `main` (estable)
- **Última Actualización:** 2026-10-14

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
- [x] **Paso 28:** **Fix de Rotación CSS de Dona (Hallazgo #31):** Eliminación de `transform: rotate(-90deg)` en `.donut-chart` para evitar la inclinación vertical del texto central, manteniéndolo a 0° horizontal nivelado.
- [x] **Paso 29:** **Habilitación de Handlers Globales en UI (Hallazgo #32):** Exposición explícita de `window.consultarClavePrivada` y `window.abrirHistorialContribuyente` garantizando la ejecución directa al presionar los enlaces de la tabla.
- [x] **Paso 30:** **Estabilización de Frontend y RBAC (v2.4.3 / Hallazgos #33, #34 y #35):**
  - Implementación de puente de estado seguro en `window` (`usuarioActual`, `modoOffline`, `showToast`, `apiFetch`) con getters de solo lectura, resolviendo `ReferenceError: usuarioActual is not defined` en `dashboard.js`.
  - Corrección de anidamiento HTML en `index.html`: adición de etiquetas de cierre `</div>` y `</section>` en `tabSolicitudes` / `enlaces`, permitiendo que `<section id="perfil">` renderice correctamente en lugar de quedar en blanco.
  - Implementación integral de la matriz `MENU_POR_ROL` en el router inline y en `public/js/router.js`, ocultando secciones restringidas para roles `supervisor` (`alertas`, `usuarios`) y `operador` (`alertas`, `bitacora`), con fallback restrictivo a `operador`.

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
- **2026-10-14:** **Estabilización de Frontend SPA y Corrección de Defectos Críticos (v2.4.3):**
  - **Hallazgo #33:** Resolución del fallo `ReferenceError: usuarioActual is not defined` en `dashboard.js` al consultar claves privadas. Se implementó un puente seguro mediante `Object.defineProperties(window, ...)` con getters de solo lectura, protegiendo el estado interno del closure inline contra reasignaciones no autorizadas.
  - **Hallazgo #34:** Corrección de la vista `#perfil` en blanco. Se identificó un árbol DOM roto en `index.html` donde `#tabSolicitudes` y `#enlaces` carecían de etiquetas de cierre, dejando `#perfil` anidado dentro de un contenedor inactivo. Se agregaron los cierres y se enlazó la carga de datos (`cargarPerfilUsuario`) e inicialización de eventos (`inicializarPerfilUsuario`).
  - **Hallazgo #35:** Ocultación y guards de RBAC corregidos en sidebar. Se aplicó `MENU_POR_ROL` en la navegación inline, eliminando el fallo donde supervisores y operadores veían secciones restringidas (`alertas`, `usuarios`, `bitacora`), y se blindó el fallback del router para caer en `operador` en lugar de `admin`.

---

### ⚠️ Registro Formal de Deuda Técnica (Frontend Monolítico vs Modular)
- **Diagnóstico:** El archivo `index.html` mantiene un bloque `<script>` inline de aproximadamente 1,400 líneas que ejecuta la lógica real de la SPA en el navegador. Aunque existe una estructura modular en `public/js/` (`config.js`, `auth.js`, `router.js`, `app.js`), `index.html` solo carga selectivamente `contribuyentes.js`, `dashboard.js` y `perfil.js`.
- **Riesgo:** Esta duplicidad parcial es la causa raíz de las discrepancias de scope (closures aislados), comportamientos divergentes de RBAC y dificultad de mantenimiento.
- **Mitigación v2.4.3:** Se estableció un puente de interoperabilidad seguro y se sincronizaron las matrices de permisos en ambos lados.
- **Plan de Liquidación Futura:** En una fase de refactorización pura (sin cambios funcionales), extraer el script inline de `index.html` y migrar la SPA al flujo estándar de módulos desacoplados bajo `public/js/`.
