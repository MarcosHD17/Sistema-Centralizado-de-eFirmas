// ============================================================
// Versión: v2.2.3 — Paso 17: WhatsApp
// Archivo: public/js/views/alertas.js
// Descripción: Configuración de alertas, umbrales del semáforo
//              (crítico / preventivo), configuración de canales
//              (Correo + WhatsApp) y pruebas del motor de mensajería.
// ============================================================

async function cargarAlertasConfig() {
    try {
        const config = await apiFetch('/alertas/config');
        const sliderCritico = document.getElementById('sliderCritico');
        const labelCritico = document.getElementById('labelCritico');
        const sliderPreventivo = document.getElementById('sliderPreventivo');
        const labelPreventivo = document.getElementById('labelPreventivo');

        if (sliderCritico) sliderCritico.value = config.umbral_critico_dias;
        if (labelCritico) labelCritico.textContent = `${config.umbral_critico_dias} días`;

        if (sliderPreventivo) sliderPreventivo.value = config.umbral_preventivo_dias;
        if (labelPreventivo) labelPreventivo.textContent = `${config.umbral_preventivo_dias} días`;

        const chCorreo = document.querySelector('[data-channel="Correo Crítico"]');
        const chWA = document.querySelector('[data-channel="WhatsApp Crítico"]');

        if (chCorreo) chCorreo.checked = !!config.correo_activo;
        if (chWA) chWA.checked = !!config.whatsapp_activo;

        // Paso 17: cargar configuración de WhatsApp
        const waNumero = document.getElementById('whatsappNumeroOrigen');
        const waTokenStatus = document.getElementById('whatsappTokenStatus');
        const waTokenInput = document.getElementById('whatsappApiToken');

        if (waNumero) waNumero.value = config.whatsapp_numero_origen || '';
        if (waTokenStatus) {
            waTokenStatus.textContent = config.whatsapp_api_token_configurado
                ? '✓ Token configurado' : '⚠ Sin token';
            waTokenStatus.style.color = config.whatsapp_api_token_configurado
                ? 'var(--success)' : 'var(--warning)';
        }
        if (waTokenInput) waTokenInput.value = ''; // nunca se precarga el secreto
    } catch (err) {
        showToast('Error al cargar la configuración de alertas.', 'danger');
    }
}

function inicializarConfigAlertas() {
    const sliderCritico = document.getElementById('sliderCritico');
    const labelCritico = document.getElementById('labelCritico');
    const sliderPreventivo = document.getElementById('sliderPreventivo');
    const labelPreventivo = document.getElementById('labelPreventivo');
    const btnTestAlert = document.getElementById('btnTestAlert');

    if (sliderCritico) {
        sliderCritico.addEventListener('input', (e) => {
            if (labelCritico) labelCritico.textContent = `${e.target.value} días`;
        });
        sliderCritico.addEventListener('change', async (e) => {
            await guardarUmbrales(e.target.value, sliderPreventivo ? sliderPreventivo.value : 90);
        });
    }

    if (sliderPreventivo) {
        sliderPreventivo.addEventListener('input', (e) => {
            if (labelPreventivo) labelPreventivo.textContent = `${e.target.value} días`;
        });
        sliderPreventivo.addEventListener('change', async (e) => {
            await guardarUmbrales(sliderCritico ? sliderCritico.value : 30, e.target.value);
        });
    }

    document.querySelectorAll('.alert-toggle').forEach(el => {
        el.addEventListener('change', async (e) => {
            const channel = e.target.getAttribute('data-channel');
            const active = e.target.checked ? 1 : 0;

            try {
                const body = {};
                if (channel.includes('Correo')) body.correo_activo = active;
                if (channel.includes('WhatsApp')) body.whatsapp_activo = active;

                await apiFetch('/alertas/config', {
                    method: 'PUT',
                    body: JSON.stringify(body)
                });
                showToast(`Canal ${channel} actualizado.`, 'success');
            } catch (err) {
                showToast(err.message, 'danger');
            }
        });
    });

    // Paso 17: guardar número de origen y token de WhatsApp
    const waNumero = document.getElementById('whatsappNumeroOrigen');
    const waTokenInput = document.getElementById('whatsappApiToken');
    const btnSaveWhatsapp = document.getElementById('btnSaveWhatsappConfig');

    if (btnSaveWhatsapp) {
        btnSaveWhatsapp.addEventListener('click', async () => {
            try {
                const body = {};
                if (waNumero && waNumero.value.trim()) body.whatsapp_numero_origen = waNumero.value.trim();
                if (waTokenInput && waTokenInput.value.trim()) body.whatsapp_api_token = waTokenInput.value.trim();

                if (Object.keys(body).length === 0) {
                    showToast('No hay cambios para guardar.', 'warning');
                    return;
                }

                await apiFetch('/alertas/config', { method: 'PUT', body: JSON.stringify(body) });
                showToast('Configuración de WhatsApp actualizada.', 'success');
                if (waTokenInput) waTokenInput.value = '';
                cargarAlertasConfig();
            } catch (err) {
                showToast(err.message, 'danger');
            }
        });
    }

    if (btnTestAlert) {
        btnTestAlert.addEventListener('click', async () => {
            const tipoSelect = document.getElementById('testAlertTipo');
            const destinoInput = document.getElementById('testAlertDestino');
            const tipo = tipoSelect ? tipoSelect.value : 'correo';
            let destinatario = destinoInput && destinoInput.value.trim()
                ? destinoInput.value.trim()
                : (tipo === 'whatsapp' ? '+528116054215' : 'contacto@despacho.com');

            if (tipo === 'whatsapp') {
                destinatario = destinatario.replace(/[\s\-\(\)]/g, '');
                if (/^\d{10}$/.test(destinatario)) destinatario = `+521${destinatario}`;
                else if (/^\+52\d{10}$/.test(destinatario)) destinatario = destinatario.replace('+52', '+521');
                else if (/^52\d{10}$/.test(destinatario)) destinatario = `+521${destinatario.slice(2)}`;
                else if (!destinatario.startsWith('+')) destinatario = `+${destinatario}`;
            }

            try {
                showToast(`Enviando prueba por ${tipo}...`, 'info');

                const data = await apiFetch('/alertas/probar', {
                    method: 'POST',
                    body: JSON.stringify({ tipo, destinatario })
                });

                showToast(data.mensaje, 'success');
            } catch (err) {
                showToast(err.message || 'Error al procesar la prueba de alertas.', 'danger');
            }
        });
    }
}

async function guardarUmbrales(critico, preventivo) {
    if (parseInt(critico) >= parseInt(preventivo)) {
        showToast('El umbral crítico debe ser menor al preventivo.', 'warning');
        return;
    }
    try {
        await apiFetch('/alertas/config', {
            method: 'PUT',
            body: JSON.stringify({
                umbral_critico_dias: parseInt(critico),
                umbral_preventivo_dias: parseInt(preventivo)
            })
        });
        showToast('Umbrales de semáforo actualizados.', 'success');
    } catch (err) {
        showToast(err.message, 'danger');
    }
}
