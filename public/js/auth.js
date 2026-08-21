// ============================================================
// Versión: v2.2.3
// Archivo: public/js/auth.js
// Descripción: Lógica de autenticación, control de sesión JWT,
//              soporte 2FA/TOTP y logout del usuario.
// ============================================================

function inicializarAuth() {
    const loginForm = document.getElementById('loginForm');
    const loginOverlay = document.getElementById('loginOverlay');
    const loginErrorMessage = document.getElementById('loginErrorMessage');
    const totpField = document.getElementById('totpField');
    const btnLogout = document.getElementById('btnLogout');

    if (token) {
        // Verificar sesión existente
        iniciarSesionUsuario();
    } else {
        // Consultar el health-check para verificar disponibilidad del backend
        fetch(`${API_URL}/health`).catch(() => {
            modoOffline = true;
            if (loginOverlay) loginOverlay.classList.add('hidden');
            const titleSpan = document.querySelector('.navbar-title span');
            if (titleSpan) {
                titleSpan.textContent = 'Modo Demostración Offline';
                titleSpan.style.borderColor = 'var(--warning)';
                titleSpan.style.color = 'var(--warning)';
            }
            inicializarDatosDemo();
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const totp_code = document.getElementById('loginTotp').value || null;

            if (loginErrorMessage) loginErrorMessage.style.display = 'none';

            try {
                const data = await apiFetch('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ email, password, totp_code })
                });

                if (data.requiere_totp) {
                    if (totpField) totpField.style.display = 'block';
                    document.getElementById('loginTotp').setAttribute('required', 'true');
                    showToast(data.message, 'warning');
                    return;
                }

                // Guardar credenciales de sesión
                token = data.token;
                localStorage.setItem('sat_token', token);
                usuarioActual = data.usuario;

                showToast('Inicio de sesión exitoso.', 'success');
                if (loginOverlay) loginOverlay.classList.add('hidden');

                iniciarSesionUsuario();
            } catch (err) {
                if (loginErrorMessage) {
                    loginErrorMessage.textContent = err.message;
                    loginErrorMessage.style.display = 'block';
                }
                showToast('Error de autenticación.', 'danger');
            }
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', logout);
    }
}

function iniciarSesionUsuario() {
    apiFetch('/auth/me')
        .then(user => {
            usuarioActual = user;
            const userNameEl = document.getElementById('sidebarUserName');
            const userRoleEl = document.getElementById('sidebarUserRole');
            const navNameEl = document.getElementById('navbarUserName');
            const userAvatarEl = document.getElementById('sidebarUserAvatar');
            const loginOverlay = document.getElementById('loginOverlay');

            if (userNameEl) userNameEl.textContent = user.nombre;
            if (userRoleEl) userRoleEl.textContent = user.rol.toUpperCase();
            if (navNameEl) navNameEl.textContent = user.nombre;

            // Iniciales del avatar
            if (userAvatarEl && user.nombre) {
                const iniciales = user.nombre.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
                userAvatarEl.textContent = iniciales;
            }

            // Ocultar sección de gestión de usuarios si el operador no es admin
            const navUsuarios = document.querySelector('[data-target="usuarios"]');
            if (navUsuarios) {
                if (user.rol === 'operador') {
                    navUsuarios.style.display = 'none';
                } else {
                    navUsuarios.style.display = 'block';
                }
            }

            if (loginOverlay) loginOverlay.classList.add('hidden');
            if (typeof cargarTablero === 'function') cargarTablero();
        })
        .catch(() => {
            logout();
        });
}

function logout() {
    token = null;
    usuarioActual = null;
    localStorage.removeItem('sat_token');
    const loginOverlay = document.getElementById('loginOverlay');
    const loginForm = document.getElementById('loginForm');
    const totpField = document.getElementById('totpField');
    const loginTotp = document.getElementById('loginTotp');

    if (loginOverlay) loginOverlay.classList.remove('hidden');
    if (loginForm) loginForm.reset();
    if (totpField) totpField.style.display = 'none';
    if (loginTotp) loginTotp.removeAttribute('required');
    showToast('Sesión cerrada correctamente.', 'info');
}
