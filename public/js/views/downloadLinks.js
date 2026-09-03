// ============================================================
// Versión: v2.2.3 — Paso 17: WhatsApp
// Archivo: public/js/views/downloadLinks.js
// Descripción: Generación y gestión de Enlaces Temporales de Descarga Segura
//              (TTL, Single-Use, Paquetes ZIP, Notificación por Correo y WhatsApp).
// ============================================================

async function cargarEnlacesDropdown() {
    try {
        const res = await apiFetch('/contribuyentes');
        const lista = res.data || [];
        const select = document.getElementById('shareRfcSelect');
        if (!select) return;

        const currentValue = select.value;

        select.innerHTML = '<option value="">-- Seleccione un contribuyente --</option>';
        lista.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.rfc;
            opt.textContent = `${c.rfc} - ${c.razon_social}`;
            select.appendChild(opt);
        });

        if (currentValue && lista.find(c => c.rfc === currentValue)) {
            select.value = currentValue;
        }
    } catch (err) {
        showToast('Error al cargar la lista de contribuyentes', 'danger');
    }
}

function inicializarEnlacesTemporales() {
    const shareForm = document.getElementById('shareForm');
    const btnCopyShareUrl = document.getElementById('btnCopyShareUrl');

    if (shareForm) {
        shareForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const rfc = document.getElementById('shareRfcSelect').value;
            const fileType = document.getElementById('shareFileType').value;
            const ttl = document.getElementById('shareTtl').value;
            const emailDestino = document.getElementById('shareEmailDestino').value;
            const whatsappInput = document.getElementById('shareWhatsappDestino');
            let whatsappDestino = whatsappInput ? whatsappInput.value.trim().replace(/[\s\-\(\)]/g, '') : '';
            if (/^\d{10}$/.test(whatsappDestino)) whatsappDestino = `+521${whatsappDestino}`;
            else if (/^\+52\d{10}$/.test(whatsappDestino)) whatsappDestino = whatsappDestino.replace('+52', '+521');
            else if (/^52\d{10}$/.test(whatsappDestino)) whatsappDestino = `+521${whatsappDestino.slice(2)}`;
            else if (whatsappDestino && !whatsappDestino.startsWith('+')) whatsappDestino = `+${whatsappDestino}`;

            if (!rfc) {
                showToast('Selecciona un contribuyente.', 'warning');
                return;
            }

            if (whatsappDestino && !/^\+[1-9]\d{7,14}$/.test(whatsappDestino)) {
                showToast('Número de WhatsApp inválido. Usa 10 dígitos o formato internacional, ej: +528116054215', 'warning');
                return;
            }

            try {
                const btn = document.getElementById('btnGenerateShare');
                if (btn) {
                    btn.disabled = true;
                    btn.textContent = 'Generando...';
                }

                const payload = { file_type: fileType, ttl_minutes: ttl };
                if (emailDestino) payload.email_destino = emailDestino;
                if (whatsappDestino) payload.whatsappDestino = whatsappDestino;

                const data = await apiFetch(`/contribuyentes/${rfc}/download-token`, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                const fullUrl = window.location.origin + data.download_url;
                const shareUrlInput = document.getElementById('shareUrlInput');
                const shareResult = document.getElementById('shareResult');

                if (shareUrlInput) shareUrlInput.value = fullUrl;
                if (shareResult) shareResult.classList.remove('hidden');

                const previewContainer = document.getElementById('shareEmailPreview');
                if (previewContainer) {
                    if (data.preview_url) {
                        previewContainer.style.display = 'block';
                        previewContainer.innerHTML = `<a href="${data.preview_url}" target="_blank" style="display: block; font-size: 12px; color: #3b82f6; text-decoration: none; padding: 8px; border: 1px solid #3b82f6; border-radius: 4px; background: rgba(59, 130, 246, 0.1);">📧 Ver vista previa del correo enviado (Ethereal)</a>`;
                    } else {
                        previewContainer.style.display = 'none';
                    }
                }

                if (data.whatsapp_resultado) {
                    if (data.whatsapp_resultado.success) {
                        showToast('Enlace generado y mensaje de WhatsApp enviado.', 'success');
                    } else {
                        showToast(`Enlace generado, pero WhatsApp falló: ${data.whatsapp_resultado.error}`, 'warning');
                    }
                } else {
                    showToast('Enlace de único uso generado correctamente.', 'success');
                }
            } catch (err) {
                showToast(err.message || 'Error al generar el enlace', 'danger');
            } finally {
                const btn = document.getElementById('btnGenerateShare');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Generar Enlace Seguro';
                }
            }
        });
    }

    if (btnCopyShareUrl) {
        btnCopyShareUrl.addEventListener('click', () => {
            const urlInput = document.getElementById('shareUrlInput');
            if (urlInput) {
                urlInput.select();
                document.execCommand('copy');
                showToast('Enlace copiado al portapapeles', 'success');
            }
        });
    }
}
