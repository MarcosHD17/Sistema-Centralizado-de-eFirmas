// ============================================================
// Versión: v2.2.3
// Archivo: public/js/views/alertas.js
// Descripción: Configuración de alertas, umbrales del semáforo
//              (crítico / preventivo) y pruebas del motor de mensajería.
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

    if (btnTestAlert) {
        btnTestAlert.addEventListener('click', async () => {
            try {
                showToast('Iniciando prueba del motor de alertas...', 'info');

                const data = await apiFetch('/alertas/probar', {
                    method: 'POST',
                    body: JSON.stringify({
                        tipo: 'correo',
                        destinatario: 'contacto@despacho.com'
                    })
                });

                const logs = data.intentos.map(i => `Intento ${i.intento}: ${i.estatus.toUpperCase()} (${i.backoff_delay_ms}ms)`).join('\n');
                alert(`[Simulación del Motor de Alertas]\n\n${logs}\n\n${data.mensaje}`);
                showToast(data.mensaje, 'success');
            } catch (err) {
                showToast('Error al procesar la prueba de alertas.', 'danger');
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
