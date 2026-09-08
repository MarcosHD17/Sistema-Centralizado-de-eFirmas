// ============================================================
// Versión: v2.2.3
// Archivo: public/js/views/contribuyentes.js
// Descripción: Carga de e.firmas (archivos .cer y .key), extracción
//              X.509 de certificados y cifrado local de claves privadas.
// ============================================================

let loadedFiles = [];

function inicializarCargaContribuyentes() {
    const fileInput = document.getElementById('fileInput');
    const fileList = document.getElementById('fileList');
    const btnExtract = document.getElementById('btnExtract');
    const loaderOverlay = document.getElementById('loaderOverlay');
    const extractedPreview = document.getElementById('extractedPreview');
    const uploadForm = document.getElementById('uploadForm');
    const dropzone = document.getElementById('dropzone');
    const btnSaveFirm = document.getElementById('btnSaveFirm');

    if (dropzone) {
        ['dragenter', 'dragover'].forEach(name => {
            dropzone.addEventListener(name, (e) => {
                e.preventDefault();
                dropzone.classList.add('dragover');
            });
        });
        ['dragleave', 'drop'].forEach(name => {
            dropzone.addEventListener(name, (e) => {
                e.preventDefault();
                dropzone.classList.remove('dragover');
            });
        });
        dropzone.addEventListener('drop', (e) => {
            handleFiles(e.dataTransfer.files);
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            handleFiles(e.target.files);
        });
    }

    if (btnExtract) {
        btnExtract.addEventListener('click', async () => {
            if (loadedFiles.length < 2) {
                showToast('Carga tanto el archivo .cer como el .key para continuar.', 'warning');
                return;
            }
            const cerFile = loadedFiles.find(f => f.name.toLowerCase().endsWith('.cer'));
            const keyFile = loadedFiles.find(f => f.name.toLowerCase().endsWith('.key'));
            if (!cerFile || !keyFile) {
                showToast('Se requiere exactamente un archivo .cer y un archivo .key.', 'warning');
                return;
            }
            const password = document.getElementById('keyPassword').value;
            if (!password) {
                showToast('Introduce la contraseña del certificado SAT.', 'warning');
                return;
            }

            if (loaderOverlay) loaderOverlay.style.display = 'flex';
            try {
                const cerBase64 = await fileToBase64(cerFile);
                const datos = await apiFetch('/contribuyentes/extraer-certificado', {
                    method: 'POST',
                    body: JSON.stringify({ cer_base64: cerBase64 })
                });

                document.getElementById('previewRfc').value = datos.rfc_detectado || '';
                document.getElementById('previewNombre').value = datos.razon_social_detectada || '';
                document.getElementById('previewEmision').value = datos.fecha_emision || '';
                document.getElementById('previewVencimiento').value = datos.fecha_vencimiento || '';
                document.getElementById('extractedMensaje').textContent = datos.mensaje;

                if (extractedPreview) extractedPreview.style.display = 'block';
                showToast(datos.mensaje, datos.requiere_confirmacion_manual ? 'warning' : 'success');
            } catch (err) {
                showToast(err.message || 'Error al leer el certificado.', 'danger');
            } finally {
                if (loaderOverlay) loaderOverlay.style.display = 'none';
            }
        });
    }

    if (btnSaveFirm) {
        btnSaveFirm.addEventListener('click', async () => {
            try {
                const rfc = document.getElementById('previewRfc').value.trim().toUpperCase();
                const razon_social = document.getElementById('previewNombre').value.trim();
                const fecha_emision = document.getElementById('previewEmision').value;
                const fecha_vencimiento = document.getElementById('previewVencimiento').value;
                const password = document.getElementById('keyPassword').value;
                const keyFile = loadedFiles.find(f => f.name.toLowerCase().endsWith('.key'));

                if (!rfc || !razon_social || !fecha_emision || !fecha_vencimiento) {
                    showToast('Completa RFC, razón social y ambas fechas antes de guardar.', 'warning');
                    return;
                }
                if (!keyFile || !password) {
                    showToast('Falta el archivo .key o la contraseña.', 'warning');
                    return;
                }

                btnSaveFirm.disabled = true;
                btnSaveFirm.textContent = 'Cifrando y guardando...';

                const keyPayloadCifrado = await cifrarClaveLocal(keyFile, password);

                await apiFetch('/contribuyentes', {
                    method: 'POST',
                    body: JSON.stringify({
                        rfc, razon_social, fecha_emision, fecha_vencimiento,
                        key_payload_cifrado: keyPayloadCifrado
                    })
                });

                showToast(`e.firma de ${rfc} cifrada y guardada exitosamente en el expediente digital.`, 'success');

                if (uploadForm) uploadForm.reset();
                loadedFiles = [];
                renderFiles();
                if (extractedPreview) extractedPreview.style.display = 'none';
                await cargarTablero();

                setTimeout(() => {
                    const navDash = document.querySelector('[data-target="dashboard"]');
                    if (navDash) navDash.click();
                }, 500);
            } catch (err) {
                showToast(err.message, 'danger');
            } finally {
                btnSaveFirm.disabled = false;
                btnSaveFirm.textContent = 'Guardar Expediente Cifrado';
            }
        });
    }
}

function handleFiles(files) {
    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.name.endsWith('.cer') || f.name.endsWith('.key')) {
            loadedFiles.push(f);
        } else {
            showToast(`Archivo inválido: ${f.name}. Debe ser .cer o .key.`, 'danger');
        }
    }
    renderFiles();
}

function renderFiles() {
    const fileList = document.getElementById('fileList');
    if (!fileList) return;
    fileList.innerHTML = '';

    loadedFiles.forEach((f, idx) => {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.innerHTML = `
            <div class="file-item-info">
                <svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                <span>${f.name} (${(f.size / 1024).toFixed(1)} KB)</span>
            </div>
            <span style="color: var(--danger); cursor: pointer; font-weight: bold;" data-idx="${idx}" class="remove-file">&times;</span>
        `;
        fileList.appendChild(div);
    });

    document.querySelectorAll('.remove-file').forEach(el => {
        el.addEventListener('click', (e) => {
            loadedFiles.splice(parseInt(e.target.getAttribute('data-idx')), 1);
            renderFiles();
        });
    });
}

window.abrirHistorialContribuyente = async function(rfc) {
    const modal = document.getElementById('modalHistorial');
    const container = document.getElementById('historialTimelineContainer');
    const subTitle = document.getElementById('modalHistorialSub');

    if (!modal || !container) return;

    modal.classList.add('active');
    if (subTitle) subTitle.textContent = `Cargando operaciones registradas para RFC: ${rfc}...`;
    container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Cargando historial de auditoría...</p>';

    try {
        const res = await apiFetch(`/contribuyentes/${rfc}/historial`);
        if (subTitle) subTitle.textContent = `${res.razon_social} (${res.rfc}) — Total de eventos: ${res.total_eventos}`;

        if (!res.eventos || res.eventos.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">No se encontraron eventos registrados para este contribuyente.</p>';
            return;
        }

        container.innerHTML = '';
        res.eventos.forEach(evt => {
            const item = document.createElement('div');
            item.style.cssText = 'padding: 10px 14px; border-left: 3px solid var(--accent); background: rgba(255, 255, 255, 0.03); border-radius: 0 6px 6px 0; font-size: 9pt;';

            let icon = '📌';
            let color = 'var(--accent)';
            if (evt.tipo === 'AUDITORIA') { icon = '🛡️'; color = '#3b82f6'; }
            if (evt.tipo === 'RENOVACION') { icon = '🔄'; color = '#10b981'; }
            if (evt.tipo === 'TOKEN_DESCARGA') { icon = '📥'; color = '#f59e0b'; }

            item.style.borderLeftColor = color;

            const fechaFormat = new Date(evt.fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

            item.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-weight: 700; color: ${color}; font-size: 9pt;">${icon} ${evt.titulo}</span>
                    <span style="font-size: 7.5pt; color: var(--text-muted);">${fechaFormat}</span>
                </div>
                <p style="color: #e2e8f0; margin-bottom: 4px; font-size: 8.5pt;">${evt.descripcion}</p>
                <div style="font-size: 7.5pt; color: var(--text-muted);">Usuario/IP: <strong style="color:#aaa;">${evt.usuario || 'Sistema'}</strong></div>
            `;
            container.appendChild(item);
        });
    } catch (err) {
        container.innerHTML = `<p style="text-align: center; color: var(--danger); padding: 20px;">Error al cargar el historial: ${err.message}</p>`;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modalHistorial');
    const btnClose = document.getElementById('btnCloseHistorialModal');
    const btnCerrar = document.getElementById('btnCerrarHistorial');

    const cerrarModal = () => {
        if (modal) modal.classList.remove('active');
    };

    if (btnClose) btnClose.addEventListener('click', cerrarModal);
    if (btnCerrar) btnCerrar.addEventListener('click', cerrarModal);
});
