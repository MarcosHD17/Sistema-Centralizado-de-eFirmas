// ============================================================
// Versión: v2.2.3
// Archivo: public/js/config.js
// Descripción: Estado global de la SPA, wrapper de peticiones HTTP,
//              sistema de toasts y modo demostración offline.
// ============================================================

// --- ESTADO GLOBAL DE LA SPA ---
const API_URL = 'http://localhost:3001/api';
let token = localStorage.getItem('sat_token') || null;
let usuarioActual = null;
let modoOffline = false;

// --- SISTEMA DE TOASTS FLOTANTES ---
const toastContainer = document.getElementById('toastContainer');

function showToast(message, type = 'success') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = '✓';
    if (type === 'warning') icon = '⚠';
    if (type === 'danger') icon = '✗';

    toast.innerHTML = `
        <span style="font-weight: bold; font-size: 11pt; margin-right: 6px;">${icon}</span>
        <div>${message}</div>
    `;

    toastContainer.appendChild(toast);

    // Forzar reflow para animación
    setTimeout(() => toast.classList.add('show'), 50);

    // Eliminar después de 4 segundos
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// --- MODO DEMOSTRACIÓN OFFLINE (RESILIENCIA) ---
let demoData = null;

function inicializarDatosDemo() {
    const ahora = Math.floor(Date.now() / 1000);
    demoData = {
        usuario: { id: 1, nombre: 'Demo Admin', email: 'demo@fiel.mx', rol: 'admin', totp_activado: false },
        contribuyentes: [
            { rfc: 'MOGO890101HA2', razon_social: 'Marcos Gómez Ocaña (Demo)', fecha_vencimiento: '2030-06-21', dias_restantes: 1459, estatus: 'vigente', color_semaforo: '#10b981', responsable_nombre: 'Demo Admin' },
            { rfc: 'DEMO850505XX1', razon_social: 'Comercializadora Demo SA de CV', fecha_vencimiento: '2026-08-10', dias_restantes: 24, estatus: 'critico', color_semaforo: '#ef4444', responsable_nombre: 'Demo Admin' }
        ]
    };
    showToast('Modo demostración: datos de ejemplo cargados en memoria (sin backend).', 'info');
}

async function mockRequest(endpoint, options = {}) {
    if (!demoData) inicializarDatosDemo();
    const metodo = (options.method || 'GET').toUpperCase();

    if (endpoint === '/auth/login' && metodo === 'POST') {
        return { token: 'demo-token', usuario: demoData.usuario };
    }
    if (endpoint === '/auth/me') {
        return demoData.usuario;
    }
    if (endpoint === '/contribuyentes/dashboard/kpis') {
        const c = demoData.contribuyentes;
        return {
            total: c.length,
            vigentes: c.filter(x => x.estatus === 'vigente').length,
            preventivos: c.filter(x => x.estatus === 'preventivo').length,
            criticos: c.filter(x => x.estatus === 'critico').length,
            expirados: c.filter(x => x.estatus === 'expirado').length,
            proximos_a_vencer: c.filter(x => x.dias_restantes <= 30)
        };
    }
    if (endpoint.startsWith('/contribuyentes') && metodo === 'GET') {
        return { data: demoData.contribuyentes, pagina: 1, limite: 20 };
    }
    if (endpoint === '/bitacora/integridad') {
        return { valida: true, registros: 1, primer_fallo_id: null, tiempo_verificacion_ms: 0, mensaje: '✓ Modo demostración: no hay ledger real que auditar.' };
    }

    throw new Error('Esta acción no está disponible en modo demostración (sin backend conectado).');
}

// --- MANEJADOR DE PETICIONES HTTP (FETCH WRAPPER) ---
async function apiFetch(endpoint, options = {}) {
    if (modoOffline) {
        try {
            const check = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(1500) });
            if (check.ok) {
                modoOffline = false;
                console.log('[API] Backend reconectado exitosamente.');
                const titleSpan = document.querySelector('.navbar-title span');
                if (titleSpan) {
                    titleSpan.textContent = 'SAT Control Manager';
                    titleSpan.style.color = '';
                }
            }
        } catch (e) {
            console.warn('[Offline] Petición simulada:', endpoint);
            return mockRequest(endpoint, options);
        }
    }

    const url = `${API_URL}${endpoint}`;
    options.headers = options.headers || {};
    options.headers['Content-Type'] = 'application/json';
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(url, options);

        if (response.status === 401) {
            showToast('Tu sesión ha expirado. Por favor ingresa de nuevo.', 'danger');
            if (typeof logout === 'function') logout();
            throw new Error('Sesión expirada');
        }

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Ocurrió un error en el servidor.');
        }
        return data;
    } catch (err) {
        if (err.message.includes('Failed to fetch') || err.message.includes('fetch failed')) {
            console.error('[API] Backend no detectado. Activando Modo Offline / Demo local.');
            modoOffline = true;
            const titleSpan = document.querySelector('.navbar-title span');
            if (titleSpan) {
                titleSpan.textContent = 'Modo Demostración Offline';
                titleSpan.style.borderColor = 'var(--warning)';
                titleSpan.style.color = 'var(--warning)';
            }
            showToast('Backend no detectado. Iniciando en modo demostración local.', 'warning');
            const loginOverlay = document.getElementById('loginOverlay');
            if (loginOverlay) loginOverlay.classList.add('hidden');
            inicializarDatosDemo();
            return mockRequest(endpoint, options);
        }
        throw err;
    }
}
