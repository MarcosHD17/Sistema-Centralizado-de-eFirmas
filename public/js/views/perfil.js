// ============================================================
// Versión: v2.4.0
// Archivo: public/js/views/perfil.js
// Descripción: Gestión del Perfil de Usuario y Activación de 2FA (TOTP)
// ============================================================

async function cargarPerfilUsuario() {
    try {
        const u = await apiFetch('/auth/me');
        if (usuarioActual) {
            usuarioActual.totp_activado = u.totp_activado;
        }

        const perfilEmail = document.getElementById('perfilEmail');
        const perfilNombre = document.getElementById('perfilNombre');
        const perfilRol = document.getElementById('perfilRol');
        const perfilEstatus = document.getElementById('perfilEstatus');
        const badge2FA = document.getElementById('badge2FAStatus');
        const setup2FAContainer = document.getElementById('setup2FAContainer');

        if (perfilEmail) perfilEmail.textContent = u.email;
        if (perfilNombre) perfilNombre.textContent = u.nombre;
        if (perfilRol) perfilRol.textContent = (u.rol || '').toUpperCase();
        if (perfilEstatus) perfilEstatus.textContent = (u.estatus || '').toUpperCase();

        if (badge2FA) {
            if (u.totp_activado) {
                badge2FA.className = 'badge badge-success';
                badge2FA.innerHTML = '<span class="badge-dot"></span> 2FA ACTIVADO';
            } else {
                badge2FA.className = 'badge badge-warning';
                badge2FA.innerHTML = '<span class="badge-dot"></span> 2FA DESACTIVADO';
            }
        }

        const btnIniciar2FA = document.getElementById('btnIniciar2FA');
        const info2FAActivo = document.getElementById('info2FAActivo');

        if (u.totp_activado) {
            if (btnIniciar2FA) btnIniciar2FA.style.display = 'none';
            if (setup2FAContainer) setup2FAContainer.style.display = 'none';
            if (info2FAActivo) info2FAActivo.style.display = 'block';
        } else {
            if (btnIniciar2FA) btnIniciar2FA.style.display = 'inline-block';
            if (info2FAActivo) info2FAActivo.style.display = 'none';
        }
    } catch (err) {
        showToast('Error al cargar la información del perfil.', 'danger');
    }
}

function inicializarPerfilUsuario() {
    const btnIniciar2FA = document.getElementById('btnIniciar2FA');
    const setup2FAContainer = document.getElementById('setup2FAContainer');
    const btnVerificar2FA = document.getElementById('btnVerificar2FA');

    if (btnIniciar2FA) {
        btnIniciar2FA.addEventListener('click', async () => {
            try {
                showToast('Generando clave secreta 2FA...', 'info');
                const data = await apiFetch('/auth/totp/setup', { method: 'POST' });

                const secretText = document.getElementById('totpSecretText');
                const qrImage = document.getElementById('totpQrImage');

                if (secretText) secretText.textContent = data.secret;
                if (qrImage) {
                    const encodedUri = encodeURIComponent(data.otpauth_url);
                    qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodedUri}`;
                }

                if (setup2FAContainer) setup2FAContainer.style.display = 'block';
                showToast('Escanea el código QR con Google Authenticator o Authy e ingresa el código de 6 dígitos.', 'info');
            } catch (err) {
                showToast(err.message || 'Error al iniciar configuración de 2FA.', 'danger');
            }
        });
    }

    if (btnVerificar2FA) {
        btnVerificar2FA.addEventListener('click', async () => {
            const input = document.getElementById('totpVerifyCode');
            const code = input ? input.value.trim() : '';

            if (!code || code.length !== 6) {
                showToast('Ingresa el código TOTP de 6 dígitos de tu aplicación autenticadora.', 'warning');
                return;
            }

            try {
                btnVerificar2FA.disabled = true;
                btnVerificar2FA.textContent = 'Verificando...';

                await apiFetch('/auth/totp/verify', {
                    method: 'POST',
                    body: JSON.stringify({ totp_code: code })
                });

                showToast('¡Autenticación de Dos Factores (2FA) activada con éxito!', 'success');
                if (input) input.value = '';
                cargarPerfilUsuario();
            } catch (err) {
                showToast(err.message || 'Código TOTP incorrecto. Verifica la hora de tu dispositivo.', 'danger');
            } finally {
                btnVerificar2FA.disabled = false;
                btnVerificar2FA.textContent = 'Verificar y Activar 2FA';
            }
        });
    }
}
