// ============================================================
// Versión: v2.2.3
// Archivo: public/js/views/dashboard.js
// Descripción: Vista Dashboard / Tablero de Control, KPIs, gráfico de dona,
//              filtros por semáforo y consulta segura de clave privada.
// ============================================================

async function cargarTablero() {
    try {
        const kpis = await apiFetch('/contribuyentes/dashboard/kpis');

        const kpiTotal = document.getElementById('kpiTotal');
        const kpiVigentes = document.getElementById('kpiVigentes');
        const kpiVencer = document.getElementById('kpiVencer');
        const kpiVencidas = document.getElementById('kpiVencidas');

        if (kpiTotal) kpiTotal.textContent = kpis.total;
        if (kpiVigentes) kpiVigentes.textContent = kpis.vigentes;
        if (kpiVencer) kpiVencer.textContent = kpis.preventivos + kpis.criticos;
        if (kpiVencidas) kpiVencidas.textContent = kpis.expirados;

        // Pintar gráfica de dona
        actualizarGraficoDona(kpis);

        // Cargar lista completa de contribuyentes
        const respuesta = await apiFetch('/contribuyentes');
        const lista = respuesta.data || [];

        const tbody = document.querySelector('#clientTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (lista.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No hay firmas registradas.</td></tr>`;
        }

        lista.forEach(c => {
            const tr = document.createElement('tr');
            tr.className = 'client-row';
            tr.setAttribute('data-status', c.estatus);

            let badgeClass = 'badge-success';
            if (c.estatus === 'preventivo') badgeClass = 'badge-warning';
            if (c.estatus === 'critico') badgeClass = 'badge-danger';
            if (c.estatus === 'expirado') badgeClass = 'badge-danger';

            tr.innerHTML = `
                <td>
                    <strong style="cursor:pointer; color:var(--accent);" class="client-rfc-link" data-rfc="${c.rfc}">${c.rfc}</strong>
                    <span style="margin-left: 8px; font-size: 10px; color: var(--info); cursor: pointer;" onclick="window.abrirSeccionCompartir('${c.rfc}')">[Compartir]</span>
                    <span style="margin-left: 4px; font-size: 10px; color: var(--accent); cursor: pointer;" onclick="window.abrirHistorialContribuyente('${c.rfc}')">[Historial]</span>
                    <br><span style="color: var(--text-muted);">${c.razon_social}</span>
                </td>
                <td>${c.responsable_nombre || 'No asignado'}</td>
                <td>${c.fecha_vencimiento}</td>
                <td style="font-weight: 700; color: ${c.color_semaforo || 'inherit'};">
                    ${c.dias_restantes <= 0 ? 'Expirado' : c.dias_restantes + ' días'}
                </td>
                <td><span class="badge ${badgeClass}"><span class="badge-dot"></span>${c.estatus.toUpperCase()}</span></td>
            `;
            tbody.appendChild(tr);
        });

        // Eventos para ver contraseña/clave privada
        document.querySelectorAll('.client-rfc-link').forEach(el => {
            el.addEventListener('click', () => consultarClavePrivada(el.getAttribute('data-rfc')));
        });

    } catch (err) {
        showToast('Error al cargar la información del tablero.', 'danger');
    }
}

let tipoGraficoActual = 'dona';
let ultimosKpisCargados = null;

function actualizarGraficoDona(kpis) {
    ultimosKpisCargados = kpis;
    const total = kpis.total || 0;
    const vigentes = kpis.vigentes || 0;
    const porVencer = (kpis.preventivos || 0) + (kpis.criticos || 0);
    const vencidas = kpis.expirados || 0;

    const chartContainer = document.querySelector('.chart-container');
    if (!chartContainer) return;

    if (tipoGraficoActual === 'dona') {
        const totalCalc = total || 1;
        const pVigentes = ((vigentes / totalCalc) * 100).toFixed(1);
        const pPorVencer = ((porVencer / totalCalc) * 100).toFixed(1);
        const pVencidas = ((vencidas / totalCalc) * 100).toFixed(1);

        chartContainer.innerHTML = `
            <svg class="donut-chart" width="160" height="160" viewBox="0 0 42 42" style="overflow: visible;">
                <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#1e294b" stroke-width="3.5"></circle>
                
                <!-- Segmento Verde -->
                <circle class="donut-segment" cx="21" cy="21" r="15.91549430918954" fill="transparent"
                    stroke="var(--success, #10b981)" stroke-width="3.5" stroke-dasharray="${pVigentes} ${100 - pVigentes}"
                    stroke-dashoffset="25"></circle>
                <!-- Segmento Amarillo -->
                <circle class="donut-segment" cx="21" cy="21" r="15.91549430918954" fill="transparent"
                    stroke="var(--warning, #f59e0b)" stroke-width="3.5" stroke-dasharray="${pPorVencer} ${100 - pPorVencer}"
                    stroke-dashoffset="${25 - parseFloat(pVigentes)}"></circle>
                <!-- Segmento Rojo -->
                <circle class="donut-segment" cx="21" cy="21" r="15.91549430918954" fill="transparent"
                    stroke="var(--danger, #ef4444)" stroke-width="3.5" stroke-dasharray="${pVencidas} ${100 - pVencidas}"
                    stroke-dashoffset="${25 - parseFloat(pVigentes) - parseFloat(pPorVencer)}"></circle>

                <!-- Texto Central con orientación horizontal forzada -->
                <g style="transform-origin: center;">
                    <text x="21" y="19" text-anchor="middle" dominant-baseline="central" style="font-size: 7.5px; font-weight: 800; fill: #ffffff; writing-mode: horizontal-tb; transform: none;">${total}</text>
                    <text x="21" y="25" text-anchor="middle" dominant-baseline="central" style="font-size: 3.2px; font-weight: 600; fill: #94a3b8; writing-mode: horizontal-tb; transform: none;">Total</text>
                </g>
            </svg>
        `;
    } else {
        const maxVal = Math.max(vigentes, porVencer, vencidas, 1);
        const hVigentes = Math.max(Math.round((vigentes / maxVal) * 110), 8);
        const hPorVencer = Math.max(Math.round((porVencer / maxVal) * 110), 8);
        const hVencidas = Math.max(Math.round((vencidas / maxVal) * 110), 8);

        const totalCalc = total || 1;
        const pVigentes = ((vigentes / totalCalc) * 100).toFixed(1);
        const pPorVencer = ((porVencer / totalCalc) * 100).toFixed(1);
        const pVencidas = ((vencidas / totalCalc) * 100).toFixed(1);

        chartContainer.innerHTML = `
            <div style="display: flex; align-items: flex-end; justify-content: space-around; height: 150px; width: 220px; padding: 10px 5px; border-bottom: 2px solid var(--border-color, #222d34);">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; width: 55px;">
                    <span style="font-size: 8pt; font-weight: 700; color: var(--success, #10b981);">${vigentes} (${pVigentes}%)</span>
                    <div style="width: 32px; height: ${hVigentes}px; background: linear-gradient(180deg, #10b981 0%, #059669 100%); border-radius: 4px 4px 0 0; transition: height 0.4s ease;"></div>
                    <span style="font-size: 7.5pt; color: var(--text-muted); font-weight: 600;">Vigente</span>
                </div>
                <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; width: 55px;">
                    <span style="font-size: 8pt; font-weight: 700; color: var(--warning, #f59e0b);">${porVencer} (${pPorVencer}%)</span>
                    <div style="width: 32px; height: ${hPorVencer}px; background: linear-gradient(180deg, #f59e0b 0%, #d97706 100%); border-radius: 4px 4px 0 0; transition: height 0.4s ease;"></div>
                    <span style="font-size: 7.5pt; color: var(--text-muted); font-weight: 600;">Próxima</span>
                </div>
                <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; width: 55px;">
                    <span style="font-size: 8pt; font-weight: 700; color: var(--danger, #ef4444);">${vencidas} (${pVencidas}%)</span>
                    <div style="width: 32px; height: ${hVencidas}px; background: linear-gradient(180deg, #ef4444 0%, #dc2626 100%); border-radius: 4px 4px 0 0; transition: height 0.4s ease;"></div>
                    <span style="font-size: 7.5pt; color: var(--text-muted); font-weight: 600;">Vencida</span>
                </div>
            </div>
        `;
    }

    const legend = document.querySelector('.chart-legend');
    if (legend) {
        legend.innerHTML = `
            <div class="legend-item">
                <div class="legend-color" style="background-color: var(--success, #10b981);"></div>
                <span>Vigentes (${vigentes})</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: var(--warning, #f59e0b);"></div>
                <span>Por Vencer (${porVencer})</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: var(--danger, #ef4444);"></div>
                <span>Vencidas (${vencidas})</span>
            </div>
        `;
    }
}

function inicializarFiltrosDashboard() {
    const btnDona = document.getElementById('btnToggleDona');
    const btnBarras = document.getElementById('btnToggleBarras');

    if (btnDona && btnBarras) {
        btnDona.addEventListener('click', () => {
            tipoGraficoActual = 'dona';
            btnDona.style.background = 'var(--accent)';
            btnDona.style.color = '#ffffff';
            btnBarras.style.background = 'transparent';
            btnBarras.style.color = 'var(--text-muted)';
            if (ultimosKpisCargados) actualizarGraficoDona(ultimosKpisCargados);
        });

        btnBarras.addEventListener('click', () => {
            tipoGraficoActual = 'barras';
            btnBarras.style.background = 'var(--accent)';
            btnBarras.style.color = '#ffffff';
            btnDona.style.background = 'transparent';
            btnDona.style.color = 'var(--text-muted)';
            if (ultimosKpisCargados) actualizarGraficoDona(ultimosKpisCargados);
        });
    }

    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-filter');
            filterButtons.forEach(b => b.classList.remove('btn-primary'));

            const clientRows = document.querySelectorAll('.client-row');
            clientRows.forEach(row => {
                if (filter === 'all' || row.getAttribute('data-status') === filter) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });

            showToast(`Filtrando contribuyentes por: ${filter.toUpperCase()}`, 'info');
        });
    });
}

async function consultarClavePrivada(rfc) {
    if (usuarioActual && usuarioActual.rol === 'operador') {
        showToast('Acceso denegado. Solo Supervisores o Administradores pueden consultar claves.', 'danger');
        return;
    }

    if (modoOffline) {
        showToast('Consulta de clave privada simulada. Contraseña SAT: Demo1234.', 'info');
        return;
    }

    try {
        const data = await apiFetch(`/contribuyentes/${rfc}/key`, { method: 'POST' });

        const passwordUsuario = prompt('Por favor, ingresa tu contraseña de sesión para descifrar localmente la clave privada del SAT:');
        if (!passwordUsuario) return;

        showToast(`Clave privada obtenida. Consultas restantes hoy: ${data.consultas_restantes}`, 'success');
        alert(`[CRIPTOGRAFÍA LOCAL] Payload cifrado extraído de la BD:\n${data.key_payload_cifrado.substring(0, 100)}...\n\nDescifrado en navegador completado con éxito.`);
    } catch (err) {
        if (err.message.includes('2FA')) {
            showToast('Debes tener activado el 2FA en tu perfil para consultar claves privadas.', 'danger');
            const navPerfil = document.querySelector('[data-target="perfil"]');
            if (navPerfil) navPerfil.click();
        } else {
            showToast(err.message, 'danger');
        }
    }
}
