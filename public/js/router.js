// ============================================================
// Versión: v2.4.0
// Archivo: public/js/router.js
// Descripción: Enrutamiento SPA con RBAC diferenciado por rol.
// ============================================================

const MENU_POR_ROL = {
    admin:      ['dashboard', 'registro', 'alertas', 'usuarios', 'bitacora', 'enlaces', 'perfil'],
    supervisor: ['dashboard', 'registro', 'bitacora', 'enlaces', 'perfil'],
    operador:   ['dashboard', 'registro', 'enlaces', 'perfil']
};

function aplicarPermisosPorRol() {
    const rol = (window.usuarioActual && window.usuarioActual.rol)
        ? window.usuarioActual.rol.toLowerCase()
        : 'admin';

    const permitidos = MENU_POR_ROL[rol] || MENU_POR_ROL.admin;
    const sidebarItems = document.querySelectorAll('.sidebar-item');

    sidebarItems.forEach(item => {
        const target = item.getAttribute('data-target');
        if (permitidos.includes(target)) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

function inicializarRouter() {
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    const sections = document.querySelectorAll('.content-section');

    aplicarPermisosPorRol();

    sidebarItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            const targetId = item.getAttribute('data-target');
            const rol = (window.usuarioActual && window.usuarioActual.rol)
                ? window.usuarioActual.rol.toLowerCase()
                : 'admin';

            const permitidos = MENU_POR_ROL[rol] || MENU_POR_ROL.admin;

            // Guard RBAC en cliente: no permitir navegar a vistas fuera de su rol
            if (!permitidos.includes(targetId)) {
                showToast('Acceso denegado. Tu rol no tiene permisos para acceder a esta sección.', 'warning');
                const dashItem = document.querySelector('[data-target="dashboard"]');
                if (dashItem) dashItem.click();
                return;
            }

            // Remover clase activa de todos los ítems y secciones
            sidebarItems.forEach(si => si.classList.remove('active'));
            sections.forEach(sec => sec.classList.remove('active'));

            item.classList.add('active');
            const targetSection = document.getElementById(targetId);
            if (targetSection) targetSection.classList.add('active');

            // Cargar datos específicos al cambiar de sección
            if (targetId === 'dashboard' && typeof cargarTablero === 'function') cargarTablero();
            if (targetId === 'usuarios' && typeof cargarUsuarios === 'function') cargarUsuarios();
            if (targetId === 'bitacora' && typeof cargarBitacora === 'function') cargarBitacora();
            if (targetId === 'alertas' && typeof cargarAlertasConfig === 'function') cargarAlertasConfig();
            if (targetId === 'enlaces' && typeof cargarEnlacesDropdown === 'function') cargarEnlacesDropdown();
            if (targetId === 'perfil' && typeof cargarPerfilUsuario === 'function') cargarPerfilUsuario();
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
