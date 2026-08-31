# SAT Control Manager — Resumen General del Proyecto

**Versión:** v2.2.3 (estable en `main`)  
**Stack:** Node.js + Express + SQLite (better-sqlite3) + SPA Vanilla JS (Web Crypto API)  
**Última actualización de este documento:** 2026-08-31

---

## ¿Qué hace el sistema?

Aplicación web **self-hosted** para despachos contables/fiscales que centraliza la gestión de eFirmas (FIEL/e.firma del SAT México). Permite almacenar los certificados `.cer` y llaves privadas `.key` de múltiples contribuyentes **cifradas con AES-GCM-256** usando la contraseña del propio cliente como llave maestra (nunca se guarda en texto plano).

### Funcionalidades principales
- **Gestión de contribuyentes** con sus archivos FIEL cifrados
- **Bitácora inmutable tipo Ledger** (cada registro encadena el hash SHA-256 del anterior)
- **Sistema de alertas** con semáforo de vencimiento de certificados (VERDE/AMARILLO/ROJO)
- **Descarga segura** mediante tokens temporales de único uso con TTL configurable
- **Envío de correo** con Nodemailer (SMTP Yahoo real + fallback Ethereal para pruebas) ✅
- **Envío por WhatsApp** — adaptador listo, pendiente de conectar al flujo ❌
- **Panel de solicitudes de renovación** para que el contribuyente pida nuevo enlace sin reexponer credenciales

---

## ✅ Qué ya está hecho (todo mergeado en `main`)

| Paso | Descripción |
|------|-------------|
| 1 | Auditoría de código y matching con NotebookLM (95% Match) |
| 2 | Creación de archivos de gobernanza (`.cursorrules`, `PRD_SCE.md`, `STATE.md`) |
| 3 | Limpieza de Working Tree e higiene de Git |
| 4 | DDL tabla `download_tokens` en `src/db/init.js` |
| 5 | Módulo de tokens seguros SHA-256 (`src/utils/token.js`) |
| 6 | Endpoint protegido `POST /api/contribuyentes/:rfc/download-token` |
| 7 | Endpoint público `GET /api/download/:token` con transacción atómica |
| 8 | QA y pruebas de seguridad (expiración, reuso, bitácora) |
| 9 | Code Review y Merge a `main` |
| 10 | Refactorización UI/UX — "Compartir FIEL" a barra lateral |
| 11 | Verificación de arquitectura v2.2.3 + protocolo de pruebas |
| 12 | Modularización frontend SPA → `public/css/` + `public/js/` |
| 13 | Flujo de expiración + solicitud de renovación por correo + panel admin |
| 14 | SMTP Real Yahoo + fallback Ethereal + sanitización `.env` |
| 15 | Resolución de conflictos de merge `index.html` + deploy a `main` |
| 16 | Documentación técnica y Manual de Usuario en `DOC/` |

---

## 🔲 Qué falta — Paso 17 (único pendiente formal)

**Notificaciones por WhatsApp.**

- ✅ El correo electrónico **ya funciona** en producción
- ❌ WhatsApp: el módulo `src/utils/whatsapp.js` existe pero **no está conectado** al flujo de alertas ni al envío de enlaces temporales

Ver detalle en [`04_modulo_whatsapp.md`](./04_modulo_whatsapp.md)  
Ver instrucciones completas para IA en [`05_instrucciones_auditoria_e_implementacion.md`](./05_instrucciones_auditoria_e_implementacion.md)

---

## Principios de seguridad críticos

> **NUNCA** se descifran archivos `.key` en el servidor.  
> El descifrado ocurre **solo en el navegador** con Web Crypto API + PBKDF2.  
> El servidor solo almacena y entrega el blob cifrado.

- `ENCRYPTION_KEY` en `.env` → para cifrar metadatos y credenciales de config (SMTP pass, WhatsApp token)
- El Ledger de bitácora es **inmutable por diseño** — no hay función de borrado ni edición de logs

---

## Archivos que NUNCA se deben subir a una IA o repositorio público

| Archivo | Motivo |
|---------|--------|
| `.env` | Credenciales, claves secretas, tokens de API |
| `prueba.cer` | Certificado digital — datos privados del SAT |
| `node_modules/` | Innecesario, muy pesado |
| `.git/` | Historial interno de Git |
| `data/` | Puede contener datos reales de usuarios/empresas |
