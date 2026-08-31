# Módulo WhatsApp — Estado Actual (COMPLETADO ✅)

> **Actualizado:** 2026-08-31 — Paso 17 completado. Todo mergeado en `main` (commit `ef908a5`).

## Resumen de estado

| Canal | Estado |
|-------|--------|
| Correo electrónico (SMTP Yahoo) | ✅ **Funciona en producción** |
| WhatsApp | ✅ **Integrado y funcional** — requiere `WHATSAPP_API_URL` en `.env` |

---

## Arquitectura implementada

### Archivos nuevos / modificados en el Paso 17

| Archivo | Tipo | Cambio |
|---------|------|--------|
| `src/services/whatsappService.js` | **NUEVO** | Servicio análogo a `emailService.js` |
| `src/routes/contribuyentes.js` | Modificado | WhatsApp en endpoint `download-token` |
| `src/routes/alertas.js` | Modificado | Validación E.164 en `POST /probar` |
| `src/utils/whatsapp.js` | Modificado | `AbortSignal.timeout(10000)` en fetch |
| `src/routes/usuarios.js` | Modificado | `token_activacion` oculto en producción |
| `public/js/crypto.js` | Modificado | Validación tamaño `.key` < 1MB |
| `public/js/views/downloadLinks.js` | Modificado | Campo WhatsApp + validación E.164 |
| `public/js/views/alertas.js` | Modificado | Config WhatsApp (número, token, toggle) |
| `index.html` | Modificado | Inputs HTML para ambas secciones |

---

## Cómo funciona el flujo completo

### Envío de enlace temporal por WhatsApp
1. El usuario selecciona un contribuyente en la vista `downloadLinks`
2. Ingresa el número de WhatsApp en formato E.164 (`+521234567890`)
3. El frontend valida el formato antes de enviar
4. `POST /api/contribuyentes/:rfc/download-token` recibe `whatsappDestino`
5. El backend valida de nuevo el formato E.164
6. Llama a `enviarEnlaceTemporalWhatsApp()` de `whatsappService.js`
7. Este llama a `enviarWhatsapp()` de `whatsapp.js`
8. Descifra el token API con AES-GCM, hace `POST` al proveedor con timeout de 10s
9. Registra `ENVIO_WHATSAPP_ENLACE_TEMPORAL` o `ENVIO_WHATSAPP_ENLACE_FALLO` en bitácora
10. El fallo no bloquea la respuesta (mismo patrón que el correo)

### Configuración del canal WhatsApp (en UI de Alertas)
1. Admin abre la sección de Alertas
2. Ingresa número de origen y token API del proveedor
3. Hace clic en "Guardar Config. WhatsApp"
4. El token se cifra con AES-GCM antes de guardarse en `alertas_config`
5. Para probar: selecciona canal "WhatsApp", ingresa número destino, clic en "Enviar Alerta de Prueba"

---

## Variable de entorno requerida

```env
WHATSAPP_API_URL=https://api.tuproveedor.com/v1/messages
```

Sin esta variable, `enviarWhatsapp()` lanza `Error('WHATSAPP_API_URL no está configurada...')` — falla con mensaje claro, no silenciosamente.

---

## Hallazgos resueltos (análisis Claude)

| # | Severidad | Descripción | Fix |
|---|-----------|-------------|-----|
| #1 | INFO | `colaAlertas.js` ya tenía WhatsApp conectado | Sin cambios |
| #2 | **ALTA** | `POST /probar` no validaba formato E.164 | Regex `^\+[1-9]\d{7,14}$` agregado |
| #3 | MEDIA | `fetch` sin timeout podía atascar el cron | `AbortSignal.timeout(10000)` |
| #4 | MEDIA | `token_activacion` expuesto en producción | Oculto cuando `NODE_ENV=production` |
| #5 | BAJA | Sin validación de tamaño de `.key` | Límite de 1MB antes de cifrar |
| #6 | BAJA | Botón no se deshabilitaba durante envío | Cubierto en `downloadLinks.js` |

---

## Proveedores compatibles

El adaptador es genérico — cualquier proveedor REST con `Authorization: Bearer` funciona:

| Proveedor | Compatibilidad |
|-----------|---------------|
| UltraMsg | ✅ Directo |
| CallMeBot | ✅ Directo |
| ChatAPI | ✅ Directo |
| Twilio WhatsApp | ⚠️ Puede requerir ajuste del body |
| Meta Cloud API (oficial) | ⚠️ Requiere template messages |

Si el proveedor usa un formato de body diferente, solo se ajusta el objeto `body` dentro de `enviarWhatsapp()` en `src/utils/whatsapp.js`.
