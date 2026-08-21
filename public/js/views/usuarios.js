// ============================================================
// Versión: v2.2.3
// Archivo: public/js/views/usuarios.js
// Descripción: Gestión de usuarios del sistema, roles (admin, supervisor,
//              operador), alta de usuarios y baja con reasignación de cartera.
// ============================================================

async function cargarUsuarios() {
    const userTableBody = document.querySelector('#userTable tbody');
    if (!userTableBody) return;

    try {
        const usuarios = await apiFetch('/usuarios');
        userTableBody.innerHTML = '';

        usuarios.forEach(u => {
            const tr = document.createElement('tr');

            let badgeClass = 'badge-success';
            if (u.estatus === 'pendiente') badgeClass = 'badge-warning';
            if (u.estatus === 'inactivo') badgeClass = 'badge-danger';

            tr.innerHTML = `
                <td><strong>${u.nombre}</strong></td>
                <td>${u.email}</td>
                <td><span style="color: var(--info); font-weight: 600;">${u.rol.toUpperCase()}</span></td>
                <td>${u.total_asignados || 0} contribuyentes</td>
                <td><span class="badge ${badgeClass}"><span class="badge-dot"></span>${u.estatus.toUpperCase()}</span></td>
                <td>
                    ${u.estatus === 'activo' && usuarioActual && u.id !== usuarioActual.id
                    ? `<button type="button" class="btn-desactivar-usuario" data-id="${u.id}" style="color: var(--danger); font-weight: 600; font-size: 8.5pt; cursor: pointer; background:none; border:none;">Dar de baja</button>`
                    : '--'}
                </td>
            `;
            userTableBody.appendChild(tr);
        });

        // Eventos para dar de baja y reasignar cartera
        document.querySelectorAll('.btn-desactivar-usuario').forEach(btn => {
            btn.addEventListener('click', () => darDeBajaUsuario(btn.getAttribute('data-id')));
        });

    } catch (err) {
        showToast('Error al cargar la lista de usuarios.', 'danger');
    }
}

function inicializarGestionUsuarios() {
    const modal = document.getElementById('addUserModal');
    const btnOpenAddUser = document.getElementById('btnOpenAddUser');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const btnCancelUser = document.getElementById('btnCancelUser');
    const addUserForm = document.getElementById('addUserForm');

    if (btnOpenAddUser) {
        btnOpenAddUser.addEventListener('click', () => {
            if (usuarioActual && usuarioActual.rol !== 'admin') {
                showToast('Solo administradores pueden agregar usuarios.', 'danger');
                return;
            }
            if (modal) modal.classList.add('active');
        });
    }

    const hideModal = () => {
        if (modal) modal.classList.remove('active');
        if (addUserForm) addUserForm.reset();
    };

    if (btnCloseModal) btnCloseModal.addEventListener('click', hideModal);
    if (btnCancelUser) btnCancelUser.addEventListener('click', hideModal);

    if (addUserForm) {
        addUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nombre = document.getElementById('newUserName').value;
            const email = document.getElementById('newUserEmail').value;
            let rol = document.getElementById('newUserRole').value;

            // Mapear rol a minúsculas para el backend
            if (rol.includes('Administrador')) rol = 'admin';
            else if (rol.includes('Supervisor')) rol = 'supervisor';
            else rol = 'operador';

            try {
                const respuesta = await apiFetch('/usuarios', {
                    method: 'POST',
                    body: JSON.stringify({ nombre, email, rol })
                });

                showToast(`Usuario creado. Token de onboarding generado.`, 'success');
                alert(`[ONBOARDING SEGURO] Token generado para el usuario:\n${respuesta.token_activacion}\n\nEnlace de activación:\nhttp://localhost:3001/api/auth/activar`);

                hideModal();
                cargarUsuarios();
            } catch (err) {
                showToast(err.message, 'danger');
            }
        });
    }
}

async function darDeBajaUsuario(userId) {
    const reasignarA = prompt('Introduce el ID del usuario activo para reasignar la cartera de contribuyentes:');
    if (!reasignarA) return;

    try {
        const data = await apiFetch(`/usuarios/${userId}/desactivar`, {
            method: 'POST',
            body: JSON.stringify({ reasignar_a_id: parseInt(reasignarA) })
        });

        showToast(data.message, 'success');
        cargarUsuarios();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}
