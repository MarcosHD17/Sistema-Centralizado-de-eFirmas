# Walkthrough - Mejoras de Dashboard, Auditoría, Perfil 2FA y RBAC (v2.4.1)

Hemos completado la implementación de las mejoras detalladas en **Reporte_Mejoras_Dashboard_RBAC_v1.md** y las solicitudes adicionales de personalización y experiencia de usuario del tablero ejecutivo.

---

## 🛠️ Cambios Realizados

### 1. Fix de Redirección 2FA & Módulo de Mi Perfil (`public/js/views/perfil.js` & `index.html`)
* **Corrección de Ruteo:** Se corrigieron los handlers de consulta de clave privada (`dashboard.js` e `index.html`) para que, al requerir 2FA, redirijan a `[data-target="perfil"]` en lugar de `alertas`.
* **Vista de Perfil y Activación TOTP:** Se creó la vista **Mi Perfil (2FA)** en la SPA. Permite ver la información del usuario en sesión, estado de 2FA y provee la interfaz para solicitar el secreto QR (`/api/auth/totp/setup`) y verificar el código de 6 dígitos (`/api/auth/totp/verify`) para activar la autenticación de dos factores.

### 2. Selector Dinámico de Visualización de Estatus: Dona vs Barras (`public/js/views/dashboard.js` & `index.html`)
* **Controles Interactivos:** Botones conmutadores `🍩 Dona` y `📊 Barras` en la cabecera de la tarjeta para alternar la visualización en tiempo real sin recargar datos.
* **Texto Central Recto:** En la modalidad de dona se aplicaron directivas SVG estrictas (`dominant-baseline="central"`, `writing-mode: horizontal-tb`) garantizando que el total y la etiqueta "Total" aparezcan perfectamente nivelados en horizontal.

### 3. Historial por Contribuyente & Línea de Tiempo (`src/routes/contribuyentes.js` & `public/js/views/contribuyentes.js`)
* **Nuevo Endpoint Backend:** `GET /api/contribuyentes/:rfc/historial` unifica eventos de `bitacora_logs`, `historial_renovaciones` y `download_tokens` asociados al RFC.
* **Modal Interactivo:** Se integró la función `window.abrirHistorialContribuyente(rfc)` y la ventana modal `#modalHistorial` en la SPA para visualizar la auditoría completa de un expediente.

### 4. Interfaz Diferenciada por Rol - RBAC (`public/js/router.js`, `public/js/auth.js` & `src/routes/contribuyentes.js`)
* **Mapa de Menú por Rol:**
  - `admin`: Accesos completos (`dashboard`, `registro`, `alertas`, `usuarios`, `bitacora`, `enlaces`, `perfil`).
  - `supervisor`: Accesos operativos y auditoría (`dashboard`, `registro`, `bitacora`, `enlaces`, `perfil`).
  - `operador`: Accesos limitados a su cartera (`dashboard`, `registro`, `enlaces`, `perfil`).
* **Guards de Navegación:** El router bloquea intentos de navegación a rutas no autorizadas por URL o script, redirigiendo a `dashboard` con aviso.
* **Filtro de Backend:** Reforzado en `GET /api/contribuyentes` y `GET /api/contribuyentes/dashboard/kpis` para que los operadores solo vean sus contribuyentes asignados.

### 5. Acceso Directo a Contraseñas en Tablero (`public/js/views/dashboard.js`)
* **Botón Visible `🔑 Contraseña`:** Se agregó un botón de acción directa en la columna de cada contribuyente en la tabla "Atención Urgente y Estatus de Clientes", complementando a `[Compartir]` e `[Historial]`.
* **Seguridad 2FA:** Se preserva el control estricto que valida si el usuario cuenta con 2FA activo y registra la auditoría correspondiente en bitácora.

---

## 🧪 Pruebas de Funcionamiento Realizadas

1. **Verificación de Sintaxis JS:**
   - `node -e "new (require('vm').Script)(readFileSync('...'))"` ejecutado exitosamente en todos los módulos de vista y rutas.

2. **Verificación de Enrutamiento y Permisos:**
   - Pruebas de roles `admin`, `supervisor` y `operador` validadas contra el mapa `MENU_POR_ROL`.

3. **Verificación de la Interfaz del Tablero:**
   - Toggle dinámico dona/barras verificado con KPIs reactivos.
   - Enlace `🔑 Contraseña` funcional vinculado al modal de consulta y verificación TOTP.
