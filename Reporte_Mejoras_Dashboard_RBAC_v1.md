# Reporte de Mejoras — Dashboard, Auditoría y RBAC
**SAT Control Manager v2.2.4** | Fecha: 2026-09-08

---

## 1. Gráfica "Distribución de Estatus" — orientación

**Diagnóstico:** el donut central usa un label "Total" con orientación incorrecta (probable `transform: rotate()` o `writing-mode` heredado del contenedor SVG). No es un bug de datos, es CSS/SVG.

**Opciones:**

| Opción | Descripción | Esfuerzo |
|---|---|---|
| A. Fix mínimo | Quitar el `transform`/`writing-mode` del `<text>` central del donut para que "Total" se lea horizontal | Bajo |
| B. Rediseño | Sustituir el donut por **gráfica de barras verticales** (Vigentes / Por Vencer / Vencidas), más legible para 3 categorías | Bajo-Medio |

**Recomendación:** Opción B — con solo 3 categorías, barras verticales comunican mejor la magnitud que un donut, y evita el problema de rotación de raíz.

**Archivo afectado:** `public/js/views/dashboard.js` (función de render del SVG del donut). No requiere cambios de backend; consume el mismo endpoint `/api/contribuyentes/dashboard/kpis`.

---

## 2. Historial por contribuyente + consulta de contraseña

**Estado actual:** existe `bitacora_logs` (ledger global) pero no hay una vista filtrada por `rfc`, ni endpoint dedicado.

**Solución propuesta:**

- **Backend** — nuevo endpoint en `contribuyentes.js`:
  ```
  GET /api/contribuyentes/:rfc/historial
  ```
  Combina `bitacora_logs` (filtrado por `rfc`/`contribuyente_id`) + `historial_renovaciones`. Devuelve línea de tiempo: altas, renovaciones, descargas, consultas de contraseña, cambios de responsable.

- **"Ver contraseña"** — reutilizar el flujo ya definido en CU-04 (UC-SaaS-v1.1), no crear uno nuevo:
  - Endpoint `GET /api/contribuyentes/:rfc/password` (o el que ya exista para descifrado en memoria).
  - Precondición: 2FA TOTP validado en la petición.
  - Límite: 10 consultas/día por operador (`consultas_contrasena_log`).
  - Cada acceso exitoso o denegado se escribe en `bitacora_logs` (evento `CONSULTA_PASS`).

- **Frontend** — en la vista de detalle del contribuyente (`views/contribuyentes.js`), agregar tab/modal "Historial" que llama al nuevo endpoint, y botón "Ver contraseña" que dispara el modal de 2FA antes de mostrar el dato (nunca mostrarlo sin verificación, nunca cachear en el DOM más de lo necesario).

**Esfuerzo:** Medio (1 endpoint nuevo + 1 vista + reutilización de lógica 2FA existente).

---

## 3. Redirección a "config alertas" al pedir contraseña

**Lo que está pasando:** el comportamiento de fondo es **correcto por diseño** (CU-04, UC-SaaS-v1.1): consultar contraseñas/claves privadas exige tener 2FA (TOTP) activo en el perfil del usuario. Si el usuario no tiene `totp_secret` configurado, el sistema debe bloquear el acceso.

**El bug real:** el mensaje *"Debes tener activado el 2FA..."* está redirigiendo a **Configuración de Alertas** en vez de a **Configuración de Perfil / 2FA**. Es un error de ruteo en el frontend, no un error de lógica de seguridad.

**Fix:**
- Ubicar el handler que dispara este mensaje (probablemente en `views/contribuyentes.js` o `downloadLinks.js`, al intentar consulta de clave).
- Cambiar el `router.navigate('alertas')` (o equivalente) por `router.navigate('perfil')` / vista de configuración de 2FA del usuario en sesión.
- Si no existe aún una vista de "Mi Perfil → Activar 2FA", crearla (QR + input de código de verificación), ya que el manual de usuario la referencia (Sección 1) pero no está confirmada como implementada.

**Esfuerzo:** Bajo si la vista de perfil/2FA ya existe (solo corregir el redirect); Medio si hay que construir la vista de activación de 2FA.

---

## 4. Interfaz diferenciada por rol (no solo Admin)

**Estado actual:** un único frontend, mismas vistas para todos los roles, sin ocultar según `rol`.

**Solución propuesta (frontend + backend):**

- **Frontend (`public/js/router.js` + `app.js`):**
  - Leer `rol` del JWT decodificado tras login.
  - Definir un mapa de permisos por vista, ej.:
    ```js
    const MENU_POR_ROL = {
      admin:      ['dashboard','contribuyentes','usuarios','alertas','bitacora','solicitudes'],
      supervisor: ['dashboard','contribuyentes','bitacora','solicitudes'],
      operador:   ['dashboard','contribuyentes']
    };
    ```
  - Ocultar del sidebar los ítems no permitidos y bloquear la ruta directa (si el operador escribe la URL manualmente, redirigir a dashboard).
  - Para `operador`: la vista "Contribuyentes" debe cargar por default solo `responsable_id == usuario_actual` (ya validado en backend para `PUT`, falta confirmar en `GET`).

- **Backend:** reforzar que **todos** los endpoints de contribuyentes (no solo `PUT`) filtren por `responsable_id` cuando el rol es `operador`, no solo confiar en el frontend.

- **Vista nueva sugerida:** landing "Mis Contribuyentes" para operador, en vez del dashboard ejecutivo completo (que tiene KPIs de toda la cartera, no relevantes para su rol).

**Esfuerzo:** Medio-Alto — es un refactor transversal (router + guards + validación backend en varios endpoints GET).

---

## Priorización sugerida

| # | Ítem | Impacto | Esfuerzo | Prioridad |
|---|---|---|---|---|
| 3 | Fix redirect 2FA | Alto (bloquea flujo de consulta de claves) | Bajo | 🔴 Inmediata |
| 1 | Gráfica vertical | Bajo (visual) | Bajo | 🟡 Rápida |
| 2 | Historial + ver contraseña | Alto (auditoría/operación diaria) | Medio | 🟡 Sprint actual |
| 4 | UI por rol | Alto (seguridad/UX multiusuario) | Medio-Alto | 🔵 Próximo sprint |

---

*Reporte generado para seguimiento interno del proyecto SAT Control Manager.*
