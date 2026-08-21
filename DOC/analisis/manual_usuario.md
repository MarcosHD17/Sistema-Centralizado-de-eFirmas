# Manual de Usuario — SAT Control Manager
**Sistema Centralizado para el Monitoreo y Gestión de e.firmas · v2.2.3**

> **Audiencia:** Este manual está dirigido a tres perfiles: **Administradores** (configuración y supervisión completa del sistema), **Operadores** (gestión de expedientes y generación de enlaces) y **Contribuyentes/Clientes** (descarga de sus archivos fiscales a través del portal seguro).

---

## Índice

1. [Propósito y Arquitectura de Seguridad Zero-Trust](#sección-1)
2. [Tablero de Control y Monitoreo de e.firmas](#sección-2)
3. [Registro y Gestión de Expedientes Digitales (FIEL)](#sección-3)
4. [Ecosistema de Enlaces Temporales y Descargas Seguras](#sección-4)
5. [Flujo de Renovación de Enlaces Caducados](#sección-5)
6. [Auditoría, Bitácora e Integridad (Ledger SHA-256)](#sección-6)
7. [Preguntas Frecuentes y Solución de Problemas](#sección-7)

---

## Sección 1: Propósito y Arquitectura de Seguridad Zero-Trust {#sección-1}

### ¿Por qué nunca enviamos archivos `.cer` o `.key` por correo?

La firma electrónica avanzada (e.firma o FIEL) de un contribuyente equivale a su firma autógrafa ante el SAT. Los archivos `.cer` (certificado público) y `.key` (llave privada) en conjunto otorgan la capacidad de firmar declaraciones, trámites y contratos con validez fiscal y legal. Enviarlos como adjuntos de correo electrónico los expone a:

- **Interceptación** por actores maliciosos en la red.
- **Filtración** si la cuenta de correo del remitente o destinatario es comprometida.
- **Reenvíos accidentales** a destinatarios no autorizados.

SAT Control Manager **elimina este riesgo** usando un modelo de **Zero-Trust**: la plataforma nunca envía los archivos directamente, sino un enlace temporal de acceso único.

### Cómo protege el sistema la identidad fiscal

| Mecanismo | Qué hace | Beneficio |
|---|---|---|
| **Cifrado AES-GCM-256 en cliente** | Los archivos `.key` se cifran en el navegador del administrador antes de ser almacenados en el servidor | El servidor jamás ve la llave privada en texto plano |
| **Tokens de un solo uso (Single-Use)** | Cada enlace de descarga solo puede usarse una vez; después queda invalidado automáticamente | Un enlace interceptado ya no sirve si fue usado antes |
| **TTL configurable (Time-To-Live)** | Los enlaces expiran automáticamente (horas o días) sin intervención manual | Un enlace robado que no se usa a tiempo pierde toda utilidad |
| **Hashing SHA-256 en base de datos** | El servidor nunca almacena el token original, solo su huella criptográfica | Si la base de datos fuera extraída, los tokens serían inútiles |
| **Autenticación 2FA/TOTP** | El acceso a datos confidenciales requiere un segundo factor de verificación | Una contraseña robada sola no es suficiente para acceder |

### Autenticación de Doble Factor (2FA/TOTP)

El sistema puede requerir que Administradores y Operadores configuren un **autenticador de tiempo real** (como Google Authenticator, Authy o similar) para acceder a secciones sensibles. El código de 6 dígitos caduca cada 30 segundos y nunca se reutiliza, haciendo prácticamente imposible el acceso no autorizado, incluso con usuario y contraseña comprometidos.

---

## Sección 2: Tablero de Control y Monitoreo de e.firmas {#sección-2}

Al iniciar sesión, el administrador u operador accede al **Tablero de Control**, el centro de mando del sistema.

### Semáforo Fiscal — Métricas KPI

El tablero muestra cuatro indicadores clave en tiempo real:

| Indicador | Color | Significado |
|---|---|---|
| **Total de Firmas** | Azul | Número total de contribuyentes con expediente registrado |
| **Vigentes** | Verde | e.firmas con más de 90 días de vigencia restante |
| **En Riesgo** | Amarillo | e.firmas que vencen en los próximos 90 días — requieren atención |
| **Vencidas** | Rojo | e.firmas expiradas — el contribuyente no puede realizar trámites ante el SAT |

> **Acción recomendada:** Revise diariamente los indicadores **En Riesgo** y **Vencidas** para proactivamente contactar a los contribuyentes afectados antes de que su firma pierda validez.

### Listado General de Contribuyentes

La tabla principal muestra todos los expedientes registrados con las columnas:
- **Razón Social / RFC** — Identidad fiscal del contribuyente.
- **Vigencia** — Fecha exacta de expiración de la e.firma.
- **Estado** — Badge de color alineado al semáforo fiscal.
- **Acciones** — Botones para ver detalle, gestionar o compartir archivos.

Use la barra de búsqueda para filtrar por RFC o Razón Social de forma instantánea.

---

## Sección 3: Registro y Gestión de Expedientes Digitales (FIEL) {#sección-3}

### Carga de archivos `.cer` y `.key`

Para registrar un nuevo contribuyente o actualizar su expediente:

1. Navegue a **"Contribuyentes"** en la barra lateral.
2. Haga clic en **"+ Nuevo Contribuyente"** o seleccione uno existente para editarlo.
3. En la zona de carga (dropzone), arrastre y suelte los archivos:
   - El archivo de **Certificado Público** (`.cer`)
   - El archivo de **Llave Privada** (`.key`)
4. El sistema procesará los archivos automáticamente.

### Extracción automática de metadatos

Una vez cargados, el sistema extrae y valida automáticamente:
- **Razón Social** — Nombre completo del contribuyente registrado ante el SAT.
- **RFC** — Registro Federal de Contribuyentes (clave única de identificación).
- **Fecha de emisión** y **Fecha de vencimiento** de la e.firma.
- **Número de serie del certificado** y **emisor** (SAT / CERTIFICA).

Estos datos se muestran en una vista previa antes de confirmar el guardado. Si algún campo no coincide con los registros del despacho, puede corregirlo manualmente.

### Asignación de operadores responsables

Cada expediente puede asignarse a un **Operador responsable** del equipo. Esto permite:
- Filtrar la vista de cada operador para mostrar solo sus clientes asignados.
- Que el sistema envíe alertas automáticas al operador cuando una firma esté próxima a vencer.
- Tener trazabilidad de quién gestionó cada expediente en la bitácora de auditoría.

---

## Sección 4: Ecosistema de Enlaces Temporales y Descargas Seguras {#sección-4}

Esta es la funcionalidad central y más importante del sistema para la distribución segura de archivos fiscales.

### Cómo generar un enlace seguro

Existen dos puntos de acceso:

**Opción A — Desde el listado de contribuyentes:**
1. Localice al contribuyente en la tabla principal.
2. Haga clic en el botón **`[Compartir]`** (ícono de enlace) junto al RFC.

**Opción B — Desde la barra lateral:**
1. Haga clic en **"Generador de Enlaces"** en el menú lateral.
2. Seleccione el contribuyente del listado.

En ambos casos se abrirá el modal de configuración del enlace.

### Configuración del enlace en el modal

| Campo | Descripción |
|---|---|
| **Tipo de Descarga** | Seleccione qué archivos incluirá el enlace |
| ↳ Solo Certificado Público | Entrega únicamente el archivo `.cer` |
| ↳ Solo Llave Privada | Entrega únicamente el archivo `.key` |
| ↳ Paquete Completo | Empaqueta ambos archivos en un `.zip` descargable |
| **Tiempo de Expiración (TTL)** | Cuánto tiempo será válido el enlace antes de caducar automáticamente |
| **Correo electrónico (opcional)** | Si se ingresa, el sistema envía el enlace directamente al cliente via SMTP |

### Envío del enlace

- **Con correo:** El sistema despacha el enlace automáticamente al correo del cliente a través del servicio SMTP configurado (Yahoo). Se mostrará una notificación de éxito en pantalla y el evento quedará registrado en la bitácora.
- **Sin correo:** Puede copiar el enlace al portapapeles con el botón **"Copiar Enlace"** y enviarlo por el canal de comunicación preferido (WhatsApp, portal interno, etc.).

### Experiencia de descarga del contribuyente (cliente)

Cuando el cliente hace clic en el enlace:

1. Es dirigido al **portal seguro de descarga** del sistema.
2. El servidor valida silenciosamente:
   - Que el enlace no haya expirado (TTL).
   - Que el enlace no haya sido usado anteriormente.
3. Si la validación es exitosa, la descarga comienza de forma inmediata y automática.
4. **Bloqueo defensivo inmediato:** En el mismo instante en que la descarga es exitosa, el sistema marca el token como `USADO` en la base de datos. Cualquier intento posterior de usar el mismo enlace recibirá una respuesta `HTTP 410 Gone`, protegiendo los archivos ante re-descargas no autorizadas.

---

## Sección 5: Flujo de Renovación de Enlaces Caducados {#sección-5}

Si el cliente intenta acceder a un enlace que ya fue usado o cuyo tiempo de vida expiró, el sistema activa el flujo de renovación.

### Lo que ve el cliente (pantalla de enlace vencido)

El portal muestra una pantalla informativa que indica que el enlace no está disponible por razones de seguridad. No se revelan detalles técnicos internos al usuario final.

### Paso 1 — El cliente solicita renovación

En la misma pantalla de expiración, el cliente encontrará un formulario sencillo:
1. Ingresa su **dirección de correo electrónico**.
2. Hace clic en **"Solicitar nuevo enlace"**.
3. El sistema registra la solicitud y muestra un mensaje de confirmación indicando que el despacho procesará su petición.

### Paso 2 — Revisión administrativa

El Administrador u Operador autorizado verá la solicitud pendiente en:
- La pestaña **"Solicitudes de Renovación"** en la barra lateral del panel.
- (Opcionalmente) Una alerta o badge con el número de solicitudes pendientes.

La tabla de solicitudes muestra:
- RFC del contribuyente solicitante.
- Correo electrónico ingresado por el cliente.
- Fecha y hora de la solicitud.
- Estado (Pendiente / Aprobada).

### Paso 3 — Autorización y emisión del nuevo enlace

1. El Administrador revisa la solicitud y hace clic en **"Aprobar"**.
2. El sistema genera automáticamente un **nuevo token seguro** con su propio TTL.
3. El nuevo enlace es despachado por correo electrónico al cliente vía SMTP **sin que el administrador deba manipular ni volver a acceder a los archivos** manualmente.
4. La acción queda registrada en la bitácora de auditoría.

> **Principio de seguridad:** En ningún momento del flujo de renovación se re-exponen las contraseñas de las llaves privadas ni los archivos en texto plano. El administrador solo autoriza; el sistema genera y entrega.

---

## Sección 6: Auditoría, Bitácora e Integridad (Ledger SHA-256) {#sección-6}

### ¿Qué es la Bitácora de Auditoría?

El sistema mantiene un registro inmutable de **todas las acciones relevantes** realizadas en la plataforma. Este registro actúa como un **libro mayor contable** (Ledger) — cada entrada está encadenada criptográficamente con la anterior, de modo que cualquier alteración posterior sería detectable.

### Eventos registrados automáticamente

| Evento | Descripción |
|---|---|
| `LOGIN_EXITOSO` | Inicio de sesión correcto de un usuario |
| `LOGIN_FALLIDO` | Intento de acceso con credenciales incorrectas |
| `DESCARGA_FIEL_CER` | Descarga exitosa de un certificado vía enlace temporal |
| `DESCARGA_FIEL_KEY` | Descarga exitosa de una llave privada vía enlace temporal |
| `DESCARGA_FIEL_ZIP_COMPLETA` | Descarga del paquete completo (.zip) vía enlace temporal |
| `TOKEN_EXPIRADO` | Intento de acceso a un enlace ya vencido |
| `TOKEN_REUTILIZADO` | Intento de reutilización de un enlace ya consumido |
| `ENVIO_CORREO_ENLACE_TEMPORAL` | Despacho exitoso de enlace por correo al contribuyente |
| `RENOVACION_APROBADA` | Aprobación administrativa de una solicitud de renovación |

### Consulta de la Bitácora

1. Navegue a **"Bitácora"** en la barra lateral.
2. Podrá filtrar por fecha, tipo de evento o usuario responsable.
3. Cada registro muestra: fecha/hora, usuario que ejecutó la acción, RFC afectado, tipo de evento y detalle adicional.

### Verificación de Integridad del Ledger

Para certificar que la base de datos **no ha sido alterada** desde su instalación:

1. Navegue a la sección **"Bitácora"**.
2. Haga clic en el botón **"Verificar Integridad del Ledger"**.
3. El sistema recalcula la cadena de hashes SHA-256 desde el primer registro hasta el último.
4. Si todos los hashes coinciden, se mostrará un badge verde: **"Ledger Íntegro ✓"**.
5. Si se detecta alguna discrepancia, el sistema indicará el registro exacto donde ocurrió la anomalía.

> **Para auditorías externas:** Esta función es particularmente útil cuando una autoridad, cliente o auditor solicita evidencia de que los registros de acceso a los archivos fiscales son auténticos e inalterados.

---

## Sección 7: Preguntas Frecuentes y Solución de Problemas {#sección-7}

---

**❓ ¿Qué hacer si el enlace dice "Enlace usado o no disponible"?**

Esto significa que los archivos ya fueron descargados exitosamente en un intento anterior, el tiempo de vida del enlace expiró, o el enlace fue revocado por el administrador.

**Solución para el cliente:** Utilice el formulario de **"Solicitar Renovación"** disponible en la misma pantalla de error, ingresando su correo electrónico. Su despacho recibirá la solicitud y generará un nuevo enlace.

**Solución para el administrador:** Vaya al listado de contribuyentes, haga clic en `[Compartir]` junto al RFC afectado y genere un nuevo enlace manualmente.

---

**❓ ¿Por qué el sistema me pide 2FA al intentar ver o gestionar archivos confidenciales?**

El sistema implementa **Zero-Trust**: incluso estando autenticado, ciertas operaciones de alto riesgo (como visualizar rutas de archivos o gestionar llaves privadas) requieren una verificación adicional de identidad en tiempo real.

**Solución:** Abra su aplicación autenticadora (Google Authenticator, Authy, etc.) y escriba el código de 6 dígitos mostrado para su cuenta de SAT Control Manager. El código es válido por 30 segundos.

---

**❓ ¿Qué hacer si el correo de notificación no llega a la bandeja de entrada del contribuyente?**

1. **Verificar carpeta de Spam/No Deseado:** Los correos transaccionales a veces son clasificados como spam por filtros automáticos.
2. **Verificar el correo en el sistema:** Confirme que el correo registrado en el expediente o ingresado durante la solicitud de renovación es correcto (sin espacios adicionales o errores tipográficos).
3. **Reenvío manual:** Genere un nuevo enlace desde el panel de administración y cópielo al portapapeles para enviarlo por un canal alternativo (ej. WhatsApp o llamada telefónica).
4. **Estado del servicio SMTP:** Si ningún correo llega a ningún destinatario, el Administrador del sistema debe verificar que las variables de entorno `SMTP_USER` y `SMTP_PASS` en el archivo `.env` del servidor sean correctas y que la cuenta de correo no haya suspendido el acceso para aplicaciones de terceros.

---

**❓ ¿Cuánto tiempo puedo configurar como TTL para un enlace?**

El tiempo de expiración (TTL) es configurable por el Administrador u Operador al momento de generar cada enlace. Las opciones disponibles van desde **1 hora** hasta **7 días**. Se recomienda usar el tiempo mínimo necesario para la situación de cada cliente: por ejemplo, 24 horas para clientes que serán contactados de inmediato, y hasta 72 horas si hay diferencia horaria o el cliente tiene disponibilidad limitada.

---

**❓ ¿Puede el mismo contribuyente descargar el `.cer` y el `.key` por separado con distintos enlaces?**

Sí. El Administrador puede generar múltiples enlaces independientes para el mismo contribuyente: uno para el certificado (`.cer`) y otro para la llave privada (`.key`), cada uno con su propio TTL y política de un solo uso. También puede generarse un **Paquete Completo (`.zip`)** que incluye ambos archivos en una sola descarga.

---

*Documento generado el 2026-08-21 | SAT Control Manager v2.2.3 | Confidencial — Uso interno del despacho*
