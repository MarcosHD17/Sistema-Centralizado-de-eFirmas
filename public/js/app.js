// ============================================================
// Versión: v2.2.3
// Archivo: public/js/app.js
// Descripción: Script principal de inicialización de la SPA. Orquesta los
//              módulos de autenticación, enrutamiento, dashboard, alertas,
//              contribuyentes, usuarios, bitacora y enlaces temporales.
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('[SPA] Inicializando módulos de interfaz...');

    // 1. Inicializar Autenticación y Estado de Sesión
    if (typeof inicializarAuth === 'function') inicializarAuth();

    // 2. Inicializar Enrutador de Navegación SPA
    if (typeof inicializarRouter === 'function') inicializarRouter();

    // 3. Inicializar Componentes de Vistas
    if (typeof inicializarFiltrosDashboard === 'function') inicializarFiltrosDashboard();
    if (typeof inicializarCargaContribuyentes === 'function') inicializarCargaContribuyentes();
    if (typeof inicializarConfigAlertas === 'function') inicializarConfigAlertas();
    if (typeof inicializarGestionUsuarios === 'function') inicializarGestionUsuarios();
    if (typeof inicializarBitacoraLedger === 'function') inicializarBitacoraLedger();
    if (typeof inicializarEnlacesTemporales === 'function') inicializarEnlacesTemporales();

    console.log('[SPA] ✓ Módulos cargados e inicializados correctamente.');
});
