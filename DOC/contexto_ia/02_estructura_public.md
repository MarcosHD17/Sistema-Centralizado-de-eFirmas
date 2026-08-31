# Estructura de `public/` — Frontend Modular

Esta carpeta contiene el frontend SPA modularizado. Súbela junto con los archivos raíz sueltos.

```
public/
├── css/
│   └── main.css
└── js/
    ├── app.js
    ├── auth.js
    ├── config.js
    ├── crypto.js
    ├── router.js
    └── views/
        ├── dashboard.js
        ├── contribuyentes.js
        ├── downloadLinks.js
        ├── alertas.js
        ├── bitacora.js
        └── usuarios.js
```

> **Historia:** El frontend era originalmente un `index.html` monolítico de ~160KB con todo CSS y JS embebido. En el Paso 12 se modularizó completamente sin alterar ninguna función ni el flujo criptográfico.

---

## `public/css/`

### `main.css` (~24KB)
Todo el CSS de la SPA en un solo archivo.
- Diseño oscuro (dark mode) con glassmorphism
- Variables CSS para el sistema de colores y espaciado
- Estilos del semáforo de vencimiento (verde/amarillo/rojo)
- Estilos de la barra lateral, modales, tablas, formularios
- Animaciones de carga y transiciones

---

## `public/js/` — Módulos raíz

### `app.js`
Entry point de la aplicación.
- Inicializa la app cuando el DOM está listo
- Conecta el router con los eventos del navegador (`hashchange`, `popstate`)
- Verifica si hay sesión activa al cargar

### `config.js`
Constantes globales de la aplicación.
- `API_BASE_URL` — URL del backend (por defecto `http://localhost:3001`)
- TTL defaults para la generación de enlaces temporales
- Configuración de parámetros de UI

### `auth.js`
Lógica de autenticación del lado del cliente.
- `login(email, password)` — POST al backend, guarda JWT en `sessionStorage`
- `logout()` — limpia sessionStorage, redirige al login
- `getAuthHeaders()` — retorna `{ Authorization: 'Bearer <token>' }` para las peticiones fetch
- `getUser()` — obtiene el usuario actual decodificando el JWT local

### `crypto.js`
Descifrado **en el navegador** usando Web Crypto API.
- `derivarClave(password, salt)` — PBKDF2 con SHA-256, 100,000 iteraciones
- `descifrarArchivo(blobCifrado, password)` — AES-GCM-256 usando la clave derivada
- **IMPORTANTE:** Esta es la única capa donde se descifran los archivos FIEL. El servidor NUNCA ve el contenido en claro.

### `router.js`
Router SPA basado en hash (`#/ruta`).
- Mapea rutas a vistas: `#/dashboard`, `#/contribuyentes`, `#/alertas`, `#/bitacora`, `#/usuarios`, `#/download-links`
- Maneja redirección al login si no hay sesión
- Renderiza la vista correspondiente en el contenedor principal

---

## `public/js/views/`

### `dashboard.js`
Vista principal con métricas generales.
- Conteo de contribuyentes por estatus de semáforo
- Resumen de alertas activas
- Accesos rápidos a las secciones

### `contribuyentes.js`
Vista de gestión de contribuyentes.
- Tabla con RFC, razón social, estatus semáforo, días para vencer
- Formulario de alta/edición de contribuyente
- Upload de archivos `.cer` y `.key`
- Link `[Compartir]` por cada fila → navega a `downloadLinks` con el RFC preseleccionado

### `downloadLinks.js` ⭐ Relevante para Paso 17
Vista de generación de enlaces temporales.
- Selector de contribuyente (o precargado desde `[Compartir]`)
- Tipo de archivo: CER / KEY / ZIP
- TTL: minutos/horas
- Campo de correo electrónico del destinatario ✅ ya existe
- **Campo de número WhatsApp del destinatario** ❌ pendiente agregar (Paso 17)
- Muestra el enlace generado con opción de copiar
- Lista de tokens activos con estado (usado/vigente/expirado)

### `alertas.js`
Vista de configuración del sistema de alertas.
- Tabla de contribuyentes con semáforo visual
- Panel de configuración de umbrales (días crítico/preventivo)
- Panel de configuración de canales:
  - Correo: host, puerto, usuario, contraseña ✅
  - WhatsApp: token API, número origen, activar/desactivar ⚠️ (verificar si existe en UI)
- Botón "Probar canal" para enviar mensaje de prueba
- Botón "Recalcular semáforo" manual

### `bitacora.js`
Vista de auditoría con verificación de integridad.
- Tabla paginada de todos los eventos del sistema
- Filtros por usuario, acción, fecha
- Indicador visual de integridad del ledger (✅ cadena íntegra / ❌ cadena rota)
- Tipos de acción incluyen: `LOGIN`, `CONTRIBUYENTE_CREAR`, `FIEL_UPLOAD`, `TOKEN_DESCARGA_GENERAR`, `DESCARGA_FIEL_CER`, `DESCARGA_FIEL_KEY`, `DESCARGA_FIEL_ZIP_COMPLETA`, `ENVIO_CORREO_ENLACE_TEMPORAL`, `ENVIO_WHATSAPP_ENLACE_TEMPORAL` (este último pendiente)

### `usuarios.js`
Vista de gestión de usuarios del sistema.
- CRUD de usuarios con roles: `admin`, `supervisor`, `operador`
- Solo `admin` puede crear/editar/eliminar usuarios
