# Módulo WhatsApp — Estado Actual y Pendientes

## Resumen ejecutivo

| Canal | Estado |
|-------|--------|
| Correo electrónico (SMTP Yahoo) | ✅ **Funciona en producción** |
| WhatsApp | ❌ **Adaptador listo, NO conectado al flujo** |

---

## Lo que YA existe (no tocar)

### `src/utils/whatsapp.js`
Adaptador HTTP REST genérico. **Ya implementado y funcional como módulo aislado.**

```js
async function enviarWhatsapp(config, destinatario, mensaje)
```

**Cómo funciona:**
1. Verifica que `config.whatsapp_activo === true`
2. Verifica que `config.whatsapp_api_token_cifrado` y `config.whatsapp_numero_origen` existan
3. Lee `WHATSAPP_API_URL` del `.env`
4. Descifra el token con `descifrar()` (AES-GCM-256)
5. Hace `POST` al proveedor con:
   ```json
   {
     "from": "<numero_origen>",
     "to": "<destinatario>",
     "message": "<mensaje>"
   }
   ```
   Header: `Authorization: Bearer <token_descifrado>`
6. Retorna el JSON de respuesta del proveedor o lanza Error

**Decisión de diseño:** No usa ningún SDK propietario (Twilio SDK, Meta SDK, whatsapp-web.js). Es un adaptador HTTP genérico para no amarrar el proyecto a un solo proveedor. Si el proveedor tiene un formato de body diferente, solo se ajusta el payload en `enviarWhatsapp()`.

### `src/routes/alertas.js` — Ya configurado en BD
- `GET /api/alertas/config` ya devuelve `whatsapp_api_token_configurado: true/false` (sin exponer el token)
- `PUT /api/alertas/config` ya recibe `whatsapp_api_token` y `whatsapp_numero_origen`, los cifra con AES-GCM y los guarda en `alertas_config`
- `POST /api/alertas/probar` ya acepta `tipo: 'whatsapp'` — encola la alerta pero **no se procesa** porque `colaAlertas.js` no llama a `enviarWhatsapp()`

---

## Lo que FALTA implementar (Paso 17)

### Gap 1 — `src/utils/colaAlertas.js`
Cuando `procesarColaAlertas()` encuentra una alerta con `tipo === 'whatsapp'`, actualmente la ignora o falla.

**Fix:** Agregar el branch de WhatsApp en la función procesadora, igual que el branch de correo con `mailer.js`.

```js
// Lo que debe hacer:
if (alerta.tipo === 'whatsapp') {
    const config = db.prepare('SELECT * FROM alertas_config WHERE id = 1').get();
    await enviarWhatsapp(config, alerta.destinatario, alerta.mensaje);
}
```

### Gap 2 — `src/services/whatsappService.js` (archivo nuevo)
Análogo a `emailService.js`. Debe tener:

```js
async function enviarEnlaceTemporalWhatsApp({ 
    numeroDestino, rfc, razonSocial, fileType, downloadUrl, expiresAt 
})
```

El mensaje debe ser texto plano con emojis (WhatsApp no admite HTML):
```
🔐 SAT Control Manager
Se generó un enlace seguro para: RAZON_SOCIAL (RFC)
Archivo: Paquete Completo (.zip)
🔗 Descarga aquí: https://...
⚠️ Enlace de único uso. Expira: DD/MM/YYYY HH:MM
```

### Gap 3 — `src/routes/contribuyentes.js`
En `POST /api/contribuyentes/:rfc/download-token`, después de generar el token:

```js
// Ya existe esto para correo:
if (emailDestino) {
    await enviarEnlaceTemporal({ emailDestino, rfc, ... });
    registrarLog({ accion: 'ENVIO_CORREO_ENLACE_TEMPORAL', ... });
}

// Agregar esto para WhatsApp:
if (whatsappDestino) {
    await enviarEnlaceTemporalWhatsApp({ numeroDestino: whatsappDestino, rfc, ... });
    registrarLog({ accion: 'ENVIO_WHATSAPP_ENLACE_TEMPORAL', ... });
}
```

Si falla el envío, **no bloquear la respuesta** — reportarlo como advertencia (mismo patrón que el correo).

### Gap 4 — `public/js/views/downloadLinks.js`
Agregar campo de input para número WhatsApp debajo del campo de correo existente:

```html
<input type="tel" id="whatsappDestino" placeholder="+521234567890" />
```

Enviarlo como `whatsappDestino` en el body del `POST`.

### Gap 5 — `public/js/views/alertas.js`
Verificar que la vista de configuración tenga campos para:
- Toggle `whatsapp_activo`
- Input `whatsapp_api_token` (tipo password)
- Input `whatsapp_numero_origen`

Si no existen, agregarlos con el mismo patrón visual de los campos SMTP.

---

## Variable de entorno requerida

```env
WHATSAPP_API_URL=https://api.tuproveedor.com/v1/messages
```

Esta variable debe estar documentada en los comentarios del código. Si no está definida, `enviarWhatsapp()` lanza un `Error` con mensaje claro (no falla silenciosamente).

---

## Proveedores compatibles (ejemplos)

El adaptador es genérico — cualquier proveedor con API REST Bearer funciona:

| Proveedor | Notas |
|-----------|-------|
| Twilio WhatsApp | Puede requerir ajuste en el formato del body |
| Meta Cloud API (oficial) | Puede requerir ajuste en el body (template messages) |
| UltraMsg | Compatible directo con el formato actual |
| CallMeBot | Compatible directo |
| ChatAPI | Compatible directo |

Si el proveedor usa un formato de body diferente, solo se modifica el objeto `body` dentro de `enviarWhatsapp()` en `src/utils/whatsapp.js`.
