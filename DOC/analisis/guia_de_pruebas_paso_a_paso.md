# Guía Paso a Paso de Pruebas — SAT Control Manager v2.2.3

Esta guía detalla los métodos y flujos paso a paso para probar todas las funcionalidades del sistema **SAT Control Manager**, incluyendo la interfaz gráfica Web (SPA), la API REST y las nuevas funciones de **Enlaces de Descarga Seguros**, **Empaquetado FIEL (.zip)** y **Envío Real de Correos SMTP (Yahoo Mail)**.

---

## 🌐 Opción 1: Pruebas desde la Interfaz Web (Navegador)

### Paso 1: Abrir la Aplicación
1. Abre tu navegador web en: **[http://localhost:3001](http://localhost:3001)**
2. Aparecerá el modal de inicio de sesión (*glassmorphism*).

### Paso 2: Iniciar Sesión como Administrador
* **Email:** `admin@fiel.mx`
* **Contraseña:** `Admin1234.`
* Haz clic en **"Iniciar Sesión"**.

---

### Paso 3: Probar los Nuevos Módulos y Flujos

#### A. Enlaces de Descarga y Envío por Correo (Nueva Función)
1. Dirígete a la sección de **"Contribuyentes"** o **"Enlaces de Descarga"** en el menú lateral.
2. Selecciona un contribuyente registrado.
3. Elige el tipo de archivo que deseas compartir:
   * **Certificado Público (.cer)**
   * **Clave Privada Cifrada (.key)**
   * **Paquete Completo (.zip)** *(Nueva característica de empaquetado)*
4. Ingresa un correo electrónico de destino donde quieras recibir el enlace (ejemplo: tu correo personal).
5. Haz clic en **"Generar y Enviar Enlace"**.
6. **Verificación:**
   * Revisa la bandeja de entrada del correo especificado.
   * Recibirás un correo con diseño corporativo emitido desde `breakingdark@yahoo.com`.
   * Haz clic en el botón **"Descargar Archivos"** del correo para comprobar la descarga segura.
   * Si intentas abrir el enlace por segunda vez, verás la pantalla de seguridad indicando que el enlace ya expiró/se autodestruyó por ser de único uso.

#### B. Solicitudes de Renovación (Nueva Función)
1. Ingresa a la sección de **"Solicitudes"**.
2. Revisa la lista de solicitudes de renovación pendientes.
3. Como Administrador/Supervisor, haz clic en **"Aprobar"**.
4. El sistema generará el token seguro y enviará automáticamente el correo con el enlace temporal al contribuyente.

#### C. Prueba de Alertas SMTP
1. Entra a la pestaña **"Alertas"** en el menú lateral.
2. Ve a la subsección **"Probar Canales de Alerta"**.
3. Selecciona **Canal: Correo Electrónico**.
4. Escribe un correo destinatario y haz clic en **"Enviar Alerta de Prueba"**.
5. Verás el estatus en pantalla y el mensaje llegará a través del servidor SMTP de Yahoo.

#### D. Verificación del Ledger Criptográfico (Bitácora)
1. Ve a la sección **"Bitácora"**.
2. Verás el registro en tiempo real de todos los eventos (logins, descargas, aprobaciones).
3. Haz clic en el botón superior **"Verificar Ledger"**.
4. El sistema auditará la cadena de bloques SHA-256 e indicará con un badge verde que la cadena está 100% íntegra.

---

## ⚡ Opción 2: Pruebas Automatizadas vía API / PowerShell

Si deseas ejecutar pruebas directas sobre los endpoints de la API, puedes abrir una terminal de PowerShell y ejecutar los siguientes comandos:

### 1. Obtener Token de Acceso
```powershell
$body = @{ email = 'admin@fiel.mx'; password = 'Admin1234.' } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method Post -Body $body -ContentType "application/json"
$token = $login.token
$headers = @{ Authorization = "Bearer $token" }
Write-Host "Token obtenido exitosamente" -ForegroundColor Green
```

### 2. Probar Envío de Correo de Alerta
```powershell
$alertaBody = @{ tipo = 'correo'; destinatario = 'tu_correo@ejemplo.com' } | ConvertTo-Json
$resAlerta = Invoke-RestMethod -Uri "http://localhost:3001/api/alertas/probar" -Method Post -Body $alertaBody -ContentType "application/json" -Headers $headers
$resAlerta | ConvertTo-Json
```

### 3. Verificar Integridad del Ledger
```powershell
$integridad = Invoke-RestMethod -Uri "http://localhost:3001/api/bitacora/integridad" -Method Get -Headers $headers
Write-Host "Ledger Valido:" $integridad.valida " - Total registros:" $integridad.registros -ForegroundColor Cyan
```
