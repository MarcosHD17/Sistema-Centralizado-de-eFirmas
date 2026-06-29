# Walkthrough - Implementación del Backend e Integración Criptográfica (v2.2.0)

Hemos completado exitosamente la transición de la plataforma **SAT Control Manager** de una interfaz estática interactiva (mockup) a una aplicación web conectada a una API REST real con base de datos relacional y robustas políticas de seguridad.

---

## 🛠️ Cambios Realizados

### 1. Base de Datos Relacional y Esquema
* **Modelo Relacional:** Diseñamos e implementamos el archivo [schema.sql](file:///C:/Users/Marko/Documents/GitHub/Sistema%20Centralizado%20de%20eFirmas/schema.sql) que especifica la estructura relacional del proyecto en SQLite.
* **Integridad Criptográfica (Ledger-Chain):** La tabla `bitacora_logs` calcula para cada registro un hash SHA-256 basado en el contenido del evento y el hash del registro anterior (`prev_hash`). Cualquier alteración manual en la BD romperá la firma de la cadena.
* **Script de Inicialización y Semillas:** Creamos [init.js](file:///C:/Users/Marko/Documents/GitHub/Sistema%20Centralizado%20de%20eFirmas/src/db/init.js) que genera automáticamente la BD y crea las semillas por defecto si la base de datos está vacía:
  * **Usuario Admin:** `admin@fiel.mx` / `Admin1234.`
  * **Bitácora:** Registro de bloque génesis inicial de auditoría.

### 2. Capa de Backend (Node.js + Express)
* **JWT y RBAC (Rol Based Access Control):** Configuramos tokens Bearer JWT firmados con expiración. Los middlewares en [auth.js](file:///C:/Users/Marko/Documents/GitHub/Sistema%20Centralizado%20de%20eFirmas/src/middleware/auth.js) validan los privilegios de los endpoints (`admin`, `supervisor`, `operador`) y registran las IPs.
* **Control de Umbrales Semafóricos (UTC):** El motor en [semaforo.js](file:///C:/Users/Marko/Documents/GitHub/Sistema%20Centralizado%20de%20eFirmas/src/utils/semaforo.js) ejecuta el recálculo semafórico a las **00:00 UTC** en el servidor para evitar desfases horarios regionales de los clientes:
  * **Verde (Vigente):** > 90 días restantes.
  * **Amarillo (Preventivo):** 31 a 90 días restantes.
  * **Rojo (Crítico):** 1 a 30 días restantes.
  * **Negro (Expirado):** ≤ 0 días restantes.
* **Límites de Consulta Diario (CU-04):** El backend restringe a un máximo de **10 consultas diarias** de claves privadas por operador. Toda consulta valida que el usuario tenga el token **2FA (TOTP)** configurado y activo.
* **Simulador de Alertas con Backoff Exponencial:** El endpoint `/api/alertas/probar` simula la caída de proveedores SMTP o WhatsApp y reintenta el envío en intervalos exponenciales (ej. 100ms, 200ms, 400ms...) antes de reportar un fallo inmutable en la bitácora.

### 3. Frontend Integrado (index.html)
* **Criptografía del Lado del Cliente (Nativa):** En lugar de transmitir contraseñas en texto plano al servidor, la SPA utiliza la API nativa **Web Crypto** en el navegador para generar un Salt y IV aleatorios, derivar una clave PBKDF2 de la contraseña y cifrar con **AES-GCM de 256 bits** el archivo de clave privada `.key` antes de enviarlo al backend.
* **Login Overlay Elegante:** Inyectamos un modal de inicio de sesión premium con efecto glassmorphism al inicio de la página que requiere autenticación.
* **Sincronización Completa con la API:** Enlazamos los KPI del tablero, gráficos SVG de dona, tablas de contribuyentes, registros de bitácora, configuraciones semafóricas y creación de usuarios a la API local.
* **Modo Demostración Offline (Resiliencia):** Si la SPA no detecta el servidor backend local corriendo, activa de forma transparente el modo demostración local (in memory), haciendo que el frontend siga siendo 100% funcional si se despliega en GitHub Pages sin backend.

---

## 🧪 Pruebas de Funcionamiento Realizadas

1. **Creación de la base de datos:** `npm run init-db` inicializó las tablas y semillas.
2. **Arranque del servidor backend:** Levantó en `http://localhost:3001` sin advertencias de dependencias.
3. **Petición HTTP de inicio de sesión:**
   ```powershell
   Invoke-RestMethod -Uri http://localhost:3001/api/auth/login -Method Post -Body (@{email='admin@fiel.mx'; password='Admin1234.'} | ConvertTo-Json) -ContentType "application/json"
   ```
   **Resultado:** Regresó exitosamente el Token JWT generado.

---

## 🚀 Cómo ejecutar localmente

1. Ejecuta la instalación de dependencias en la terminal si descargas el repositorio:
   ```bash
   npm install
   ```
2. Inicializa la base de datos de desarrollo:
   ```bash
   npm run init-db
   ```
3. Arranca el servidor Express:
   ```bash
   npm run dev
   ```
4. Abre [index.html](file:///C:/Users/Marko/Documents/GitHub/Sistema%20Centralizado%20de%20eFirmas/index.html) directamente en tu navegador.
