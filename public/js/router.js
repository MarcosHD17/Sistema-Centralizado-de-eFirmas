// ============================================================
// Versión: v2.2.3
// Archivo: public/js/router.js
// Descripción: Enrutamiento en cliente para SPA (Single Page Application),
//              conmutación de vistas en sidebar y hooks de navegación.
// ============================================================

function inicializarRouter() {
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    const sections = document.querySelectorAll('.content-section');

    sidebarItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            // Remover clase activa de todos los ítems y secciones
            sidebarItems.forEach(si => si.classList.remove('active'));
            sections.forEach(sec => sec.classList.remove('active'));

            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            const targetSection = document.getElementById(targetId);
            if (targetSection) targetSection.classList.add('active');

            // Cargar datos específicos al cambiar de sección
            if (targetId === 'dashboard' && typeof cargarTablero === 'function') cargarTablero();
            if (targetId === 'usuarios' && typeof cargarUsuarios === 'function') cargarUsuarios();
            if (targetId === 'bitacora' && typeof cargarBitacora === 'function') cargarBitacora();
            if (targetId === 'alertas' && typeof cargarAlertasConfig === 'function') cargarAlertasConfig();
            if (targetId === 'enlaces' && typeof cargarEnlacesDropdown === 'function') cargarEnlacesDropdown();
        });
    });
}

// Hook global para redirigir directamente a la sección de compartir FIEL
window.abrirSeccionCompartir = function(rfc) {
    const navEnlaces = document.querySelector('[data-target="enlaces"]');
    if (navEnlaces) navEnlaces.click();

    setTimeout(() => {
        const select = document.getElementById('shareRfcSelect');
        if (select) select.value = rfc;
        const shareResult = document.getElementById('shareResult');
        if (shareResult) shareResult.classList.add('hidden');
    }, 400);
};
