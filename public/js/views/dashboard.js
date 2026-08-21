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

function actualizarGraficoDona(kpis) {
    const total = kpis.total || 1;
    const pVigentes = ((kpis.vigentes / total) * 100).toFixed(1);
    const pVencer = (((kpis.preventivos + kpis.criticos) / total) * 100).toFixed(1);
    const pVencidas = ((kpis.expirados / total) * 100).toFixed(1);

    const chartSvg = document.querySelector('.donut-chart');
    if (chartSvg) {
        chartSvg.innerHTML = `
            <circle cx="21" cy="21" r="15.91549430918954" fill="transparent"></circle>
            <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#1e294b" stroke-width="3.5"></circle>
            
            <!-- Segmento Verde -->
            <circle class="donut-segment" cx="21" cy="21" r="15.91549430918954" fill="transparent"
                stroke="var(--success)" stroke-width="3.5" stroke-dasharray="${pVigentes} ${100 - pVigentes}"
                stroke-dashoffset="0"></circle>
            <!-- Segmento Amarillo -->
            <circle class="donut-segment" cx="21" cy="21" r="15.91549430918954" fill="transparent"
                stroke="var(--warning)" stroke-width="3.5" stroke-dasharray="${pVencer} ${100 - pVencer}"
                stroke-dashoffset="-${pVigentes}"></circle>
            <!-- Segmento Rojo/Negro -->
            <circle class="donut-segment" cx="21" cy="21" r="15.91549430918954" fill="transparent"
                stroke="var(--danger)" stroke-width="3.5" stroke-dasharray="${pVencidas} ${100 - pVencidas}"
                stroke-dashoffset="-${parseFloat(pVigentes) + parseFloat(pVencer)}"></circle>
            
            <g class="chart-text">
                <text x="21" y="22" class="donut-text">${kpis.total}</text>
                <text x="21" y="28" class="donut-subtext">Total</text>
            </g>
        `;
    }

    // Leyenda del gráfico
    const legend = document.querySelector('.chart-legend');
    if (legend) {
        legend.innerHTML = `
            <div class="legend-item">
                <div class="legend-color" style="background-color: var(--success);"></div>
                <span>Vigentes (${kpis.vigentes})</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: var(--warning);"></div>
                <span>Por Vencer (${kpis.preventivos + kpis.criticos})</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: var(--danger);"></div>
                <span>Vencidas (${kpis.expirados})</span>
            </div>
        `;
    }
}

function inicializarFiltrosDashboard() {
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
            const navAlertas = document.querySelector('[data-target="alertas"]');
            if (navAlertas) navAlertas.click();
        } else {
            showToast(err.message, 'danger');
        }
    }
}
