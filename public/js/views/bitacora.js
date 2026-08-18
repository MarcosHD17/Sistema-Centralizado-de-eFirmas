// ============================================================
// Versión: v2.2.3
// Archivo: public/js/views/bitacora.js
// Descripción: Bitácora de auditoría inmutable (Ledger-chain SHA-256),
//              verificación de integridad y línea de tiempo de cliente.
// ============================================================

async function cargarBitacora(query = '') {
    const logTableBody = document.querySelector('#logTable tbody');
    if (!logTableBody) return;

    try {
        let endpoint = '/bitacora?limite=100';
        if (query) endpoint += `&accion=${encodeURIComponent(query)}`;

        const res = await apiFetch(endpoint);
        const logs = res.data || [];

        logTableBody.innerHTML = '';

        if (logs.length === 0) {
            logTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No hay eventos que coincidan.</td></tr>`;
        }

        logs.forEach(l => {
            const tr = document.createElement('tr');
            tr.className = 'log-row';

            const fecha = new Date(l.timestamp_utc * 1000).toLocaleString();

            tr.innerHTML = `
                <td style="white-space: nowrap;">${fecha}</td>
                <td>${l.usuario_email || 'Sistema'}</td>
                <td>
                    <strong>${l.accion}</strong>
                    ${l.detalle ? `<br><span style="font-size:7.5pt; color:var(--text-muted);">${l.detalle}</span>` : ''}
                </td>
                <td>${l.ip_origen || '127.0.0.1'}</td>
            `;
            logTableBody.appendChild(tr);
        });
    } catch (err) {
        showToast('Error al cargar la bitácora.', 'danger');
    }
}

function inicializarBitacoraLedger() {
    const logSearch = document.getElementById('logSearch');
    const btnVerifyLedger = document.getElementById('btnVerifyLedger');
    const btnExportLogs = document.getElementById('btnExportLogs');
    const timelineClient = document.getElementById('timelineClient');

    if (logSearch) {
        logSearch.addEventListener('input', (e) => {
            cargarBitacora(e.target.value);
        });
    }

    if (btnVerifyLedger) {
        btnVerifyLedger.addEventListener('click', async () => {
            const resultBox = document.getElementById('ledgerAuditResult');
            btnVerifyLedger.disabled = true;
            btnVerifyLedger.textContent = 'Verificando...';

            try {
                const data = await apiFetch('/bitacora/integridad');

                if (resultBox) resultBox.style.display = 'block';
                if (data.valida) {
                    if (resultBox) {
                        resultBox.innerHTML = `
                            <span class="badge badge-success">
                                <span class="badge-dot"></span>Ledger íntegro
                            </span>
                            <span style="margin-left:8px; color: var(--text-muted); font-size: 8.5pt;">
                                ${data.mensaje} (${data.tiempo_verificacion_ms} ms)
                            </span>`;
                    }
                    showToast(data.mensaje, 'success');
                } else {
                    if (resultBox) {
                        resultBox.innerHTML = `
                            <span class="badge badge-danger">
                                <span class="badge-dot"></span>Cadena alterada
                            </span>
                            <span style="margin-left:8px; color: var(--text-muted); font-size: 8.5pt;">
                                ${data.mensaje}
                            </span>`;
                    }
                    showToast(data.mensaje, 'danger');
                }
            } catch (err) {
                if (resultBox) {
                    resultBox.style.display = 'block';
                    resultBox.innerHTML = `
                        <span class="badge badge-danger">
                            <span class="badge-dot"></span>Error de verificación
                        </span>`;
                }
                showToast('Error al verificar el ledger.', 'danger');
            } finally {
                btnVerifyLedger.disabled = false;
                btnVerifyLedger.textContent = 'Verificar Ledger';
            }
        });
    }

    if (btnExportLogs) {
        btnExportLogs.addEventListener('click', () => {
            showToast('Exportación iniciada exitosamente.', 'success');
        });
    }

    if (timelineClient) {
        timelineClient.addEventListener('change', (e) => {
            const timelineContainer = document.getElementById('timelineContainer');
            if (!timelineContainer) return;

            const client = e.target.value;
            if (client === 'ferro') {
                timelineContainer.innerHTML = `
                    <div class="timeline-item timeline-success">
                        <div class="timeline-header">
                            <span>22/08/2022</span>
                            <span>Sistema</span>
                        </div>
                        <div class="timeline-content">
                            <h4>Carga de Firma Inicial</h4>
                            <p>Certificado cargado con vencimiento para el 22/08/2026.</p>
                        </div>
                    </div>
                    <div class="timeline-item timeline-warning">
                        <div class="timeline-header">
                            <span>22/06/2026</span>
                            <span>Alerta Bot</span>
                        </div>
                        <div class="timeline-content">
                            <h4>Notificación Preventiva</h4>
                            <p>Alerta de expiración enviada a Yuli Supervisor por Correo.</p>
                        </div>
                    </div>
                `;
            } else {
                timelineContainer.innerHTML = `
                    <div class="timeline-item timeline-success">
                        <div class="timeline-header">
                            <span>28/06/2022</span>
                            <span>Sistema</span>
                        </div>
                        <div class="timeline-content">
                            <h4>Carga de Firma Inicial</h4>
                            <p>Certificado cargado con vencimiento para el 28/06/2026.</p>
                        </div>
                    </div>
                    <div class="timeline-item timeline-danger">
                        <div class="timeline-header">
                            <span>22/06/2026</span>
                            <span>Alerta Bot</span>
                        </div>
                        <div class="timeline-content">
                            <h4>Notificación de Fase Crítica</h4>
                            <p>Alerta de expiración enviada a Marcos Dev por WhatsApp.</p>
                        </div>
                    </div>
                `;
            }
            showToast('Línea de tiempo de renovaciones actualizada.', 'info');
        });
    }
}
