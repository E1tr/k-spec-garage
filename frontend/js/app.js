'use strict';

(() => {
    const API_BASE = '/api';
    const TOKEN_KEY = 'kspec_token';
    const STATUS_STEPS = ['Pendiente', 'En elevador', 'Esperando piezas', 'Listo para recoger'];

    const state = {
        token: localStorage.getItem(TOKEN_KEY) || null,
        user: null,
        currentView: 'landing',
        vehicles: [],
        orders: [],
        adminStatusFilter: 'ALL',
        adminOrderSearch: '',
        adminVehicleSearch: '',
        pendingService: null,
        confirmCallback: null
    };

    // =========================================================================
    // Utilidades
    // =========================================================================
    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => Array.from(document.querySelectorAll(selector));

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatCurrency(amount) {
        const num = Number(amount) || 0;
        return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: num % 1 === 0 ? 0 : 2,
            maximumFractionDigits: 2
        }).format(num);
    }

    function formatDate(dateStr) {
        if (!dateStr) return 'Sin fecha';
        const parts = String(dateStr).split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
    }

    function getTodayIso() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function getStatusBadgeClass(status) {
        switch (status) {
            case 'Pendiente':
                return 'badge-pendiente';
            case 'En elevador':
                return 'badge-elevador';
            case 'Esperando piezas':
                return 'badge-piezas';
            case 'Listo para recoger':
                return 'badge-listo';
            default:
                return 'badge-pendiente';
        }
    }

    function renderProgressSteps(status) {
        const currentIndex = Math.max(0, STATUS_STEPS.indexOf(status));
        const shortLabels = ['Pendiente', 'Elevador', 'Piezas', 'Listo'];
        return `
            <div class="progress-steps" aria-label="Progreso de la orden: ${escapeHtml(status)}">
                ${STATUS_STEPS.map((_, idx) => {
                    let cls = 'progress-step';
                    if (status === 'Listo para recoger' || idx < currentIndex) {
                        cls += ' completed';
                    } else if (idx === currentIndex) {
                        cls += ' current';
                    }
                    const symbol = (status === 'Listo para recoger' || idx < currentIndex) ? '✓' : String(idx + 1);
                    return `<div class="${cls}"><span>${symbol}</span><small>${shortLabels[idx]}</small></div>`;
                }).join('')}
            </div>
        `;
    }

    function renderPlate(matricula) {
        return `
            <div class="eu-plate" title="Matrícula">
                <span class="eu-plate-band">E</span>
                <span class="eu-plate-num">${escapeHtml(matricula || '---')}</span>
            </div>
        `;
    }

    function showToast(message, type = 'info') {
        const container = $('#toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(16px)';
            toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            setTimeout(() => toast.remove(), 220);
        }, 3600);
    }

    function showFormError(el, message) {
        if (!el) return;
        if (!message) {
            el.textContent = '';
            el.classList.add('hidden');
            return;
        }
        el.textContent = message;
        el.classList.remove('hidden');
    }

    function setButtonLoading(btn, isLoading, loadingText = 'Procesando...') {
        if (!btn) return;
        if (isLoading) {
            btn.dataset.originalText = btn.textContent;
            btn.textContent = loadingText;
            btn.disabled = true;
        } else {
            btn.textContent = btn.dataset.originalText || btn.textContent;
            btn.disabled = false;
        }
    }

    // =========================================================================
    // Cliente HTTP
    // =========================================================================
    async function apiFetch(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        if (state.token) {
            headers.Authorization = `Bearer ${state.token}`;
        }

        let response;
        try {
            response = await fetch(`${API_BASE}${endpoint}`, {
                ...options,
                headers
            });
        } catch (err) {
            throw new Error('No se pudo conectar con el servidor de K-Spec Garage.');
        }

        let data = {};
        try {
            data = await response.json();
        } catch (_) {
            data = {};
        }

        if (response.status === 401 && state.token && !options.skipAuthReset) {
            clearSession();
            showToast('Tu sesión ha expirado. Inicia sesión de nuevo.', 'error');
            switchView('auth');
            setAuthTab('login');
        }

        if (!response.ok) {
            throw new Error(data.error || `Error del servidor (${response.status})`);
        }

        return data;
    }

    async function checkApiHealth() {
        const indicator = $('#api-health-indicator');
        const label = $('#api-health-text');
        if (!indicator || !label) return;

        try {
            const data = await apiFetch('/health', { skipAuthReset: true });
            if (data && data.status === 'ok') {
                indicator.classList.remove('offline');
                indicator.classList.add('online');
                label.textContent = 'API Online · Boxes activos';
                return;
            }
        } catch (_) {
            // Fallthrough a estado offline
        }
        indicator.classList.remove('online');
        indicator.classList.add('offline');
        label.textContent = 'API sin conexión';
    }

    // =========================================================================
    // Gestión de Sesión y Navegación SPA
    // =========================================================================
    function saveSession(token, user) {
        state.token = token;
        state.user = user;
        localStorage.setItem(TOKEN_KEY, token);
        updateNavbar();
    }

    function clearSession() {
        state.token = null;
        state.user = null;
        state.vehicles = [];
        state.orders = [];
        localStorage.removeItem(TOKEN_KEY);
        updateNavbar();
    }

    function updateNavbar() {
        const guestActions = $('#nav-guest-actions');
        const userActions = $('#nav-user-actions');
        const heroCta = $('#hero-cta-primary');

        if (state.user) {
            guestActions.classList.add('hidden');
            userActions.classList.remove('hidden');

            const isAdmin = state.user.rol === 'admin';
            $('#nav-user-name').textContent = state.user.nombre;
            const roleBadge = $('#nav-user-role');
            roleBadge.textContent = isAdmin ? 'ADMIN' : 'CLIENTE';
            roleBadge.classList.toggle('role-admin', isAdmin);
            $('#nav-dashboard-label').textContent = isAdmin ? 'Panel Taller' : 'Mi Garaje';

            if (heroCta) {
                heroCta.firstChild.textContent = isAdmin ? 'Ir al Panel de Taller ' : 'Ir a Mi Garaje ';
            }
        } else {
            guestActions.classList.remove('hidden');
            userActions.classList.add('hidden');
            if (heroCta) {
                heroCta.firstChild.textContent = 'Acceder a Mi Garaje ';
            }
        }
    }

    function closeMobileMenu() {
        const navLinks = $('#nav-links');
        const toggle = $('#nav-toggle');
        navLinks.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
    }

    function switchView(viewName) {
        state.currentView = viewName;
        $$('.view').forEach((section) => {
            section.classList.toggle('active', section.id === `view-${viewName}`);
        });
        const publicLinks = $('#nav-public-links');
        if (publicLinks) {
            const isDashboard = viewName === 'client' || viewName === 'admin';
            publicLinks.classList.toggle('hidden', isDashboard);
        }
        closeMobileMenu();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function setAuthTab(tab) {
        const isLogin = tab === 'login';
        $('#tab-login').classList.toggle('active', isLogin);
        $('#tab-login').setAttribute('aria-selected', String(isLogin));
        $('#tab-register').classList.toggle('active', !isLogin);
        $('#tab-register').setAttribute('aria-selected', String(!isLogin));

        $('#form-login').classList.toggle('hidden', !isLogin);
        $('#form-register').classList.toggle('hidden', isLogin);

        $('#auth-title').textContent = isLogin ? 'Iniciar sesión' : 'Crear cuenta de cliente';
        $('#auth-subtitle').textContent = isLogin
            ? 'Accede a tu garaje, citas activas o al panel de jefe de taller.'
            : 'Regístrate para guardar tus vehículos y pedir cita en K-Spec Garage.';

        showFormError($('#login-error'), '');
        showFormError($('#register-error'), '');
    }

    async function goToDashboard() {
        if (!state.user) {
            switchView('auth');
            setAuthTab('login');
            return;
        }

        if (state.user.rol === 'admin') {
            switchView('admin');
            await loadAdminDashboard();
        } else {
            switchView('client');
            await loadClientDashboard();

            if (state.pendingService) {
                const service = state.pendingService;
                state.pendingService = null;
                openOrderModal(service);
            }
        }
    }

    // =========================================================================
    // Modales
    // =========================================================================
    function openModal(id) {
        const modal = $(`#${id}`);
        if (!modal) return;
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(id) {
        const modal = $(`#${id}`);
        if (!modal) return;
        modal.classList.add('hidden');
        if ($$('.modal-backdrop:not(.hidden)').length === 0) {
            document.body.style.overflow = '';
        }
    }

    function closeAllModals() {
        $$('.modal-backdrop').forEach((m) => m.classList.add('hidden'));
        document.body.style.overflow = '';
    }

    function openConfirmModal(title, message, acceptLabel, callback) {
        $('#modal-confirm-title').textContent = title;
        $('#modal-confirm-message').textContent = message;
        $('#btn-confirm-accept').textContent = acceptLabel || 'Confirmar';
        state.confirmCallback = callback;
        openModal('modal-confirm');
    }

    // =========================================================================
    // Portal Cliente
    // =========================================================================
    async function loadClientDashboard() {
        $('#client-welcome').textContent = `Hola, ${state.user.nombre}`;
        const contactParts = [state.user.email];
        if (state.user.telefono) contactParts.push(`Tel. ${state.user.telefono}`);
        $('#client-contact-line').textContent = contactParts.join(' · ');

        try {
            const [vehicles, orders] = await Promise.all([
                apiFetch('/vehicles'),
                apiFetch('/orders')
            ]);
            state.vehicles = Array.isArray(vehicles) ? vehicles : [];
            state.orders = Array.isArray(orders) ? orders : [];
            renderClientDashboard();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    function renderClientDashboard() {
        const totalVehicles = state.vehicles.length;
        const activeOrders = state.orders.filter((o) => o.estado !== 'Listo para recoger').length;
        const readyOrders = state.orders.filter((o) => o.estado === 'Listo para recoger').length;
        const totalBudget = state.orders.reduce((sum, o) => sum + (Number(o.presupuesto) || 0), 0);

        $('#client-kpi-vehicles').textContent = String(totalVehicles);
        $('#client-kpi-active').textContent = String(activeOrders);
        $('#client-kpi-ready').textContent = String(readyOrders);
        $('#client-kpi-budget').textContent = formatCurrency(totalBudget);

        $('#client-orders-count').textContent = String(state.orders.length);
        $('#client-vehicles-count').textContent = String(totalVehicles);

        renderClientOrders();
        renderClientVehicles();
    }

    function renderClientOrders() {
        const container = $('#client-orders-list');
        if (!state.orders.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Todavía no tienes citas registradas</h3>
                    <p>${state.vehicles.length
                        ? 'Solicita tu primera cita y sigue en directo el avance desde el elevador.'
                        : 'Primero registra un vehículo en tu garaje para poder reservar cita en el taller.'}</p>
                    <button type="button" class="btn btn-primary" id="btn-empty-order-cta">
                        ${state.vehicles.length ? '+ Solicitar primera cita' : '+ Añadir mi primer vehículo'}
                    </button>
                </div>
            `;
            const emptyBtn = $('#btn-empty-order-cta');
            if (emptyBtn) {
                emptyBtn.addEventListener('click', () => {
                    if (state.vehicles.length) openOrderModal();
                    else openVehicleModal();
                });
            }
            return;
        }

        container.innerHTML = state.orders.map((order) => {
            const v = order.vehicle_id;
            const vehicleTitle = v ? `${v.marca} ${v.modelo}` : 'Vehículo eliminado';
            const vehicleMeta = v ? `${v.anio}${v.motor ? ` · ${v.motor}` : ''}` : 'Sin datos del vehículo';
            const plateHtml = v ? renderPlate(v.matricula) : '';

            return `
                <article class="order-card">
                    <div class="order-card-top">
                        <div>
                            <h3 class="order-title">${escapeHtml(order.servicio)}</h3>
                            <p class="order-date">Cita: ${escapeHtml(formatDate(order.fecha_cita))}</p>
                        </div>
                        <span class="badge ${getStatusBadgeClass(order.estado)}">${escapeHtml(order.estado)}</span>
                    </div>

                    <div class="order-vehicle-row">
                        <div>
                            <div class="order-vehicle-name">${escapeHtml(vehicleTitle)}</div>
                            <div class="order-vehicle-meta">${escapeHtml(vehicleMeta)}</div>
                        </div>
                        ${plateHtml}
                    </div>

                    ${renderProgressSteps(order.estado)}

                    ${order.descripcion_cliente ? `<p class="order-desc"><strong>Tu solicitud:</strong> ${escapeHtml(order.descripcion_cliente)}</p>` : ''}

                    <div class="order-notes">
                        <strong>NOTAS DEL TALLER</strong>
                        ${escapeHtml(order.notas_taller || 'Pendiente de revisión inicial por el mecánico.')}
                    </div>

                    <div class="order-card-footer">
                        <div class="order-budget">
                            <span>PRESUPUESTO ESTIMADO</span>
                            <strong>${order.presupuesto > 0 ? formatCurrency(order.presupuesto) : 'Pendiente de valorar'}</strong>
                        </div>
                    </div>
                </article>
            `;
        }).join('');
    }

    function renderClientVehicles() {
        const container = $('#client-vehicles-list');
        if (!state.vehicles.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Tu garaje está vacío</h3>
                    <p>Añade tu coche con matrícula y motor para solicitar citas de mantenimiento o preparación.</p>
                    <button type="button" class="btn btn-primary" id="btn-empty-vehicle-cta">+ Registrar vehículo</button>
                </div>
            `;
            const emptyBtn = $('#btn-empty-vehicle-cta');
            if (emptyBtn) emptyBtn.addEventListener('click', openVehicleModal);
            return;
        }

        container.innerHTML = state.vehicles.map((vehicle) => `
            <article class="vehicle-card">
                <div class="vehicle-card-top">
                    <div>
                        <span class="vehicle-brand">${escapeHtml(vehicle.marca)}</span>
                        <h3 class="vehicle-model">${escapeHtml(vehicle.modelo)}</h3>
                    </div>
                    ${renderPlate(vehicle.matricula)}
                </div>

                <div class="vehicle-specs">
                    <span class="spec-chip">Año ${escapeHtml(vehicle.anio)}</span>
                    <span class="spec-chip">${escapeHtml(vehicle.motor || 'Motor sin especificar')}</span>
                </div>

                <div class="vehicle-card-footer">
                    <button type="button" class="btn btn-secondary btn-sm" data-book-vehicle="${escapeHtml(vehicle._id)}">
                        Pedir cita
                    </button>
                    <button type="button" class="btn btn-outline-danger btn-sm" data-delete-vehicle="${escapeHtml(vehicle._id)}" data-vehicle-label="${escapeHtml(`${vehicle.marca} ${vehicle.modelo} (${vehicle.matricula})`)}">
                        Eliminar
                    </button>
                </div>
            </article>
        `).join('');
    }

    function openVehicleModal() {
        $('#form-vehicle').reset();
        showFormError($('#vehicle-error'), '');
        openModal('modal-vehicle');
        $('#veh-marca').focus();
    }

    function openOrderModal(preselectedService = null, preselectedVehicleId = null) {
        if (!state.vehicles.length) {
            showToast('Primero registra un vehículo en tu garaje para pedir cita.', 'info');
            openVehicleModal();
            return;
        }

        $('#form-order').reset();
        showFormError($('#order-error'), '');

        const vehicleSelect = $('#order-vehicle');
        vehicleSelect.innerHTML = state.vehicles.map((v) =>
            `<option value="${escapeHtml(v._id)}">${escapeHtml(`${v.marca} ${v.modelo} — ${v.matricula}`)}</option>`
        ).join('');

        if (preselectedVehicleId) {
            vehicleSelect.value = preselectedVehicleId;
        }

        const dateInput = $('#order-fecha');
        dateInput.min = getTodayIso();
        dateInput.value = getTodayIso();

        const presetSelect = $('#order-service-preset');
        const customWrap = $('#order-custom-service-wrap');
        const customInput = $('#order-service-custom');

        if (preselectedService) {
            const exists = Array.from(presetSelect.options).some((opt) => opt.value === preselectedService);
            if (exists) {
                presetSelect.value = preselectedService;
                customWrap.classList.add('hidden');
            } else {
                presetSelect.value = '__custom__';
                customWrap.classList.remove('hidden');
                customInput.value = preselectedService;
            }
        } else {
            customWrap.classList.add('hidden');
        }

        openModal('modal-order');
    }

    // =========================================================================
    // Panel Admin (Jefe de Taller)
    // =========================================================================
    async function loadAdminDashboard() {
        try {
            const [orders, vehicles] = await Promise.all([
                apiFetch('/orders'),
                apiFetch('/vehicles')
            ]);
            state.orders = Array.isArray(orders) ? orders : [];
            state.vehicles = Array.isArray(vehicles) ? vehicles : [];
            renderAdminDashboard();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    function renderAdminDashboard() {
        const total = state.orders.length;
        const pending = state.orders.filter((o) => o.estado === 'Pendiente').length;
        const working = state.orders.filter((o) => o.estado === 'En elevador' || o.estado === 'Esperando piezas').length;
        const ready = state.orders.filter((o) => o.estado === 'Listo para recoger').length;
        const revenue = state.orders.reduce((sum, o) => sum + (Number(o.presupuesto) || 0), 0);

        $('#admin-kpi-total').textContent = String(total);
        $('#admin-kpi-pending').textContent = String(pending);
        $('#admin-kpi-working').textContent = String(working);
        $('#admin-kpi-ready').textContent = String(ready);
        $('#admin-kpi-revenue').textContent = formatCurrency(revenue);

        $('#admin-orders-count').textContent = String(total);
        $('#admin-vehicles-count').textContent = String(state.vehicles.length);

        renderAdminOrders();
        renderAdminVehicles();
    }

    function renderAdminOrders() {
        const container = $('#admin-orders-list');
        const query = state.adminOrderSearch.trim().toLowerCase();

        const filtered = state.orders.filter((order) => {
            if (state.adminStatusFilter !== 'ALL' && order.estado !== state.adminStatusFilter) {
                return false;
            }
            if (!query) return true;

            const haystack = [
                order.servicio,
                order.estado,
                order.descripcion_cliente,
                order.notas_taller,
                order.client_id?.nombre,
                order.client_id?.email,
                order.client_id?.telefono,
                order.vehicle_id?.marca,
                order.vehicle_id?.modelo,
                order.vehicle_id?.matricula
            ].filter(Boolean).join(' ').toLowerCase();

            return haystack.includes(query);
        });

        if (!filtered.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No hay órdenes que coincidan</h3>
                    <p>Prueba a cambiar el filtro de estado o el término de búsqueda.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map((order) => {
            const c = order.client_id;
            const v = order.vehicle_id;
            const clientName = c ? c.nombre : 'Cliente eliminado';
            const clientContact = c ? [c.email, c.telefono].filter(Boolean).join(' · ') : '';
            const vehicleTitle = v ? `${v.marca} ${v.modelo}` : 'Vehículo eliminado';
            const vehicleMeta = v ? `${v.anio}${v.motor ? ` · ${v.motor}` : ''}` : '';

            return `
                <article class="order-card">
                    <div class="order-card-top">
                        <div>
                            <h3 class="order-title">${escapeHtml(order.servicio)}</h3>
                            <p class="order-date">Cita: ${escapeHtml(formatDate(order.fecha_cita))}</p>
                        </div>
                        <span class="badge ${getStatusBadgeClass(order.estado)}">${escapeHtml(order.estado)}</span>
                    </div>

                    <div class="order-client-row">
                        <strong>Cliente: ${escapeHtml(clientName)}</strong>
                        <span>${escapeHtml(clientContact)}</span>
                    </div>

                    <div class="order-vehicle-row">
                        <div>
                            <div class="order-vehicle-name">${escapeHtml(vehicleTitle)}</div>
                            <div class="order-vehicle-meta">${escapeHtml(vehicleMeta)}</div>
                        </div>
                        ${v ? renderPlate(v.matricula) : ''}
                    </div>

                    ${renderProgressSteps(order.estado)}

                    ${order.descripcion_cliente ? `<p class="order-desc"><strong>Petición del cliente:</strong> ${escapeHtml(order.descripcion_cliente)}</p>` : ''}

                    <div class="order-notes">
                        <strong>NOTAS DE TALLER</strong>
                        ${escapeHtml(order.notas_taller || 'Sin notas registradas.')}
                    </div>

                    <div class="order-card-footer">
                        <div class="order-budget">
                            <span>PRESUPUESTO</span>
                            <strong>${formatCurrency(order.presupuesto)}</strong>
                        </div>
                        <div class="order-actions">
                            <button type="button" class="btn btn-primary btn-sm" data-admin-edit-order="${escapeHtml(order._id)}">
                                Gestionar
                            </button>
                            <button type="button" class="btn btn-outline-danger btn-sm" data-admin-delete-order="${escapeHtml(order._id)}" data-order-label="${escapeHtml(order.servicio)}">
                                Eliminar
                            </button>
                        </div>
                    </div>
                </article>
            `;
        }).join('');
    }

    function renderAdminVehicles() {
        const container = $('#admin-vehicles-list');
        const query = state.adminVehicleSearch.trim().toLowerCase();

        const filtered = state.vehicles.filter((v) => {
            if (!query) return true;
            const haystack = [
                v.marca,
                v.modelo,
                v.matricula,
                v.motor,
                v.anio,
                v.owner_id?.nombre,
                v.owner_id?.email
            ].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(query);
        });

        if (!filtered.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No hay vehículos para mostrar</h3>
                    <p>Cuando los clientes den de alta sus coches aparecerán en este directorio.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map((v) => {
            const owner = v.owner_id;
            const ownerText = owner
                ? `${owner.nombre}${owner.telefono ? ` · ${owner.telefono}` : ''} (${owner.email})`
                : 'Propietario no disponible';

            return `
                <article class="vehicle-card">
                    <div class="vehicle-card-top">
                        <div>
                            <span class="vehicle-brand">${escapeHtml(v.marca)}</span>
                            <h3 class="vehicle-model">${escapeHtml(v.modelo)}</h3>
                        </div>
                        ${renderPlate(v.matricula)}
                    </div>

                    <div class="vehicle-specs">
                        <span class="spec-chip">Año ${escapeHtml(v.anio)}</span>
                        <span class="spec-chip">${escapeHtml(v.motor || 'Motor sin especificar')}</span>
                    </div>

                    <div class="vehicle-owner">
                        <strong>Propietario:</strong> ${escapeHtml(ownerText)}
                    </div>

                    <div class="vehicle-card-footer">
                        <span class="muted-text mono-text" style="font-size:0.75rem;">ID ${escapeHtml(String(v._id).slice(-6).toUpperCase())}</span>
                        <button type="button" class="btn btn-outline-danger btn-sm" data-delete-vehicle="${escapeHtml(v._id)}" data-vehicle-label="${escapeHtml(`${v.marca} ${v.modelo} (${v.matricula})`)}">
                            Eliminar
                        </button>
                    </div>
                </article>
            `;
        }).join('');
    }

    function openAdminOrderModal(orderId) {
        const order = state.orders.find((o) => o._id === orderId);
        if (!order) return;

        $('#admin-edit-id').value = order._id;
        $('#admin-edit-estado').value = order.estado || 'Pendiente';
        $('#admin-edit-presupuesto').value = Number(order.presupuesto) || 0;
        $('#admin-edit-notas').value = order.notas_taller || '';
        showFormError($('#admin-edit-error'), '');

        const v = order.vehicle_id;
        const c = order.client_id;
        $('#admin-edit-summary').innerHTML = `
            <strong>${escapeHtml(order.servicio)}</strong>
            <span class="muted-text">${v ? escapeHtml(`${v.marca} ${v.modelo} (${v.matricula})`) : 'Vehículo eliminado'} · Cita ${escapeHtml(formatDate(order.fecha_cita))}</span>
            <span class="muted-text">Cliente: ${c ? escapeHtml(`${c.nombre} (${c.email})`) : 'Sin datos'}</span>
        `;

        openModal('modal-admin-order');
    }

    // =========================================================================
    // Eventos y Formularios
    // =========================================================================
    function bindEvents() {
        // Menú móvil
        $('#nav-toggle').addEventListener('click', () => {
            const navLinks = $('#nav-links');
            const isOpen = navLinks.classList.toggle('open');
            $('#nav-toggle').setAttribute('aria-expanded', String(isOpen));
        });

        // Brand -> portada
        $('#brand-logo').addEventListener('click', (e) => {
            e.preventDefault();
            switchView('landing');
        });

        // Navegación genérica
        $$('[data-nav]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                switchView(el.dataset.nav);
            });
        });

        // Scroll a secciones de la portada
        $$('[data-scroll]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = el.dataset.scroll;
                if (state.currentView !== 'landing') {
                    switchView('landing');
                }
                closeMobileMenu();
                const target = document.getElementById(targetId);
                if (target) {
                    setTimeout(() => target.scrollIntoView({ behavior: 'smooth' }), 60);
                }
            });
        });

        // Abrir vista Auth
        $$('[data-open-auth]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (state.user) {
                    goToDashboard();
                    return;
                }
                switchView('auth');
                setAuthTab(btn.dataset.openAuth);
            });
        });

        // CTA Principal del Hero
        $('#hero-cta-primary').addEventListener('click', () => {
            if (state.user) {
                goToDashboard();
            } else {
                switchView('auth');
                setAuthTab('login');
            }
        });

        // Botones "Solicitar →" en tarjetas de servicios
        $$('[data-book-service]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const service = btn.dataset.bookService;
                if (!state.user) {
                    state.pendingService = service;
                    switchView('auth');
                    setAuthTab('login');
                    showToast('Inicia sesión o regístrate para reservar este servicio.', 'info');
                    return;
                }
                if (state.user.rol === 'admin') {
                    goToDashboard();
                    showToast('Las citas se solicitan desde una cuenta de cliente.', 'info');
                    return;
                }
                state.pendingService = service;
                goToDashboard();
            });
        });

        // Botón ir al dashboard desde navbar
        $('#btn-go-dashboard').addEventListener('click', () => goToDashboard());

        // Logout
        $('#btn-logout').addEventListener('click', () => {
            clearSession();
            showToast('Sesión cerrada correctamente.', 'info');
            switchView('landing');
        });

        // Pestañas Login / Registro
        $$('[data-auth-tab]').forEach((tab) => {
            tab.addEventListener('click', () => setAuthTab(tab.dataset.authTab));
        });

        // Botones Demo
        $('#btn-demo-client').addEventListener('click', () => {
            $('#login-email').value = 'cliente@kspec.es';
            $('#login-password').value = 'cliente123';
            $('#form-login').requestSubmit();
        });

        $('#btn-demo-admin').addEventListener('click', () => {
            $('#login-email').value = 'admin@kspec.es';
            $('#login-password').value = 'admin123';
            $('#form-login').requestSubmit();
        });

        // Submit Login
        $('#form-login').addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorEl = $('#login-error');
            const submitBtn = $('#btn-login-submit');
            showFormError(errorEl, '');

            const email = $('#login-email').value.trim();
            const password = $('#login-password').value;

            if (!email || !password) {
                showFormError(errorEl, 'Introduce tu correo electrónico y contraseña.');
                return;
            }

            setButtonLoading(submitBtn, true, 'Accediendo...');
            try {
                const data = await apiFetch('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ email, password }),
                    skipAuthReset: true
                });
                saveSession(data.token, data.user);
                showToast(`¡Bienvenido de nuevo, ${data.user.nombre}!`, 'success');
                await goToDashboard();
            } catch (err) {
                showFormError(errorEl, err.message);
            } finally {
                setButtonLoading(submitBtn, false);
            }
        });

        // Submit Registro
        $('#form-register').addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorEl = $('#register-error');
            const submitBtn = $('#btn-register-submit');
            showFormError(errorEl, '');

            const nombre = $('#reg-nombre').value.trim();
            const email = $('#reg-email').value.trim();
            const telefono = $('#reg-telefono').value.trim();
            const password = $('#reg-password').value;

            if (!nombre || !email || !password) {
                showFormError(errorEl, 'Nombre, correo y contraseña son obligatorios.');
                return;
            }
            if (password.length < 6) {
                showFormError(errorEl, 'La contraseña debe tener al menos 6 caracteres.');
                return;
            }

            setButtonLoading(submitBtn, true, 'Creando cuenta...');
            try {
                const data = await apiFetch('/auth/register', {
                    method: 'POST',
                    body: JSON.stringify({ nombre, email, telefono, password }),
                    skipAuthReset: true
                });
                saveSession(data.token, data.user);
                showToast('Cuenta creada correctamente. ¡Bienvenido a K-Spec Garage!', 'success');
                await goToDashboard();
            } catch (err) {
                showFormError(errorEl, err.message);
            } finally {
                setButtonLoading(submitBtn, false);
            }
        });

        // Pestañas del Portal Cliente
        $$('[data-client-tab]').forEach((tab) => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.clientTab;
                $$('[data-client-tab]').forEach((t) => t.classList.toggle('active', t === tab));
                $('#client-panel-orders').classList.toggle('hidden', target !== 'orders');
                $('#client-panel-vehicles').classList.toggle('hidden', target !== 'vehicles');
            });
        });

        // Pestañas del Panel Admin
        $$('[data-admin-tab]').forEach((tab) => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.adminTab;
                $$('[data-admin-tab]').forEach((t) => t.classList.toggle('active', t === tab));
                $('#admin-panel-orders').classList.toggle('hidden', target !== 'orders');
                $('#admin-panel-vehicles').classList.toggle('hidden', target !== 'vehicles');
            });
        });

        // Botones de acciones Cliente
        $('#btn-open-vehicle-modal').addEventListener('click', openVehicleModal);
        $('#btn-open-order-modal').addEventListener('click', () => openOrderModal());

        // Servicio personalizado en modal de cita
        $('#order-service-preset').addEventListener('change', (e) => {
            const isCustom = e.target.value === '__custom__';
            $('#order-custom-service-wrap').classList.toggle('hidden', !isCustom);
            if (isCustom) $('#order-service-custom').focus();
        });

        // Submit Nuevo Vehículo
        $('#form-vehicle').addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorEl = $('#vehicle-error');
            const submitBtn = $('#btn-vehicle-submit');
            showFormError(errorEl, '');

            const marca = $('#veh-marca').value.trim();
            const modelo = $('#veh-modelo').value.trim();
            const anio = Number($('#veh-anio').value);
            const matricula = $('#veh-matricula').value.trim().toUpperCase();
            const motor = $('#veh-motor').value.trim();

            if (!marca || !modelo || !anio || !matricula) {
                showFormError(errorEl, 'Marca, modelo, año y matrícula son obligatorios.');
                return;
            }
            if (anio < 1950 || anio > 2030) {
                showFormError(errorEl, 'Introduce un año de vehículo válido.');
                return;
            }

            setButtonLoading(submitBtn, true, 'Guardando...');
            try {
                await apiFetch('/vehicles', {
                    method: 'POST',
                    body: JSON.stringify({ marca, modelo, anio, matricula, motor })
                });
                closeModal('modal-vehicle');
                showToast('Vehículo añadido a tu garaje.', 'success');
                await loadClientDashboard();
            } catch (err) {
                showFormError(errorEl, err.message);
            } finally {
                setButtonLoading(submitBtn, false);
            }
        });

        // Submit Nueva Cita
        $('#form-order').addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorEl = $('#order-error');
            const submitBtn = $('#btn-order-submit');
            showFormError(errorEl, '');

            const vehicle_id = $('#order-vehicle').value;
            const preset = $('#order-service-preset').value;
            const servicio = preset === '__custom__'
                ? $('#order-service-custom').value.trim()
                : preset;
            const fecha_cita = $('#order-fecha').value;
            const descripcion_cliente = $('#order-descripcion').value.trim();

            if (!vehicle_id || !servicio || !fecha_cita) {
                showFormError(errorEl, 'Selecciona vehículo, servicio y fecha para la cita.');
                return;
            }

            setButtonLoading(submitBtn, true, 'Enviando cita...');
            try {
                await apiFetch('/orders', {
                    method: 'POST',
                    body: JSON.stringify({ vehicle_id, servicio, descripcion_cliente, fecha_cita })
                });
                closeModal('modal-order');
                showToast('Cita solicitada correctamente. Te avisaremos al revisarla.', 'success');
                await loadClientDashboard();
            } catch (err) {
                showFormError(errorEl, err.message);
            } finally {
                setButtonLoading(submitBtn, false);
            }
        });

        // Filtros y búsqueda Admin
        $('#admin-status-filters').addEventListener('click', (e) => {
            const pill = e.target.closest('[data-status]');
            if (!pill) return;
            state.adminStatusFilter = pill.dataset.status;
            $$('#admin-status-filters .filter-pill').forEach((p) => p.classList.toggle('active', p === pill));
            renderAdminOrders();
        });

        $('#admin-order-search').addEventListener('input', (e) => {
            state.adminOrderSearch = e.target.value;
            renderAdminOrders();
        });

        $('#admin-vehicle-search').addEventListener('input', (e) => {
            state.adminVehicleSearch = e.target.value;
            renderAdminVehicles();
        });

        $('#btn-admin-refresh').addEventListener('click', async () => {
            await loadAdminDashboard();
            showToast('Datos de taller actualizados.', 'info');
        });

        // Submit Editar Orden (Admin)
        $('#form-admin-order').addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorEl = $('#admin-edit-error');
            const submitBtn = $('#btn-admin-edit-submit');
            showFormError(errorEl, '');

            const id = $('#admin-edit-id').value;
            const estado = $('#admin-edit-estado').value;
            const presupuesto = Number($('#admin-edit-presupuesto').value);
            const notas_taller = $('#admin-edit-notas').value.trim();

            if (Number.isNaN(presupuesto) || presupuesto < 0) {
                showFormError(errorEl, 'El presupuesto debe ser un número mayor o igual a 0.');
                return;
            }

            setButtonLoading(submitBtn, true, 'Guardando...');
            try {
                await apiFetch(`/orders/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ estado, presupuesto, notas_taller })
                });
                closeModal('modal-admin-order');
                showToast('Orden actualizada correctamente.', 'success');
                await loadAdminDashboard();
            } catch (err) {
                showFormError(errorEl, err.message);
            } finally {
                setButtonLoading(submitBtn, false);
            }
        });

        // Delegación de eventos en listas dinámicas (vehículos y órdenes)
        document.addEventListener('click', (e) => {
            const bookVehicleBtn = e.target.closest('[data-book-vehicle]');
            if (bookVehicleBtn) {
                openOrderModal(null, bookVehicleBtn.dataset.bookVehicle);
                return;
            }

            const deleteVehicleBtn = e.target.closest('[data-delete-vehicle]');
            if (deleteVehicleBtn) {
                const vehicleId = deleteVehicleBtn.dataset.deleteVehicle;
                const label = deleteVehicleBtn.dataset.vehicleLabel || 'este vehículo';
                openConfirmModal(
                    'Eliminar vehículo',
                    `¿Seguro que quieres eliminar ${label} del registro?`,
                    'Sí, eliminar',
                    async () => {
                        await apiFetch(`/vehicles/${vehicleId}`, { method: 'DELETE' });
                        showToast('Vehículo eliminado.', 'success');
                        if (state.user?.rol === 'admin') await loadAdminDashboard();
                        else await loadClientDashboard();
                    }
                );
                return;
            }

            const editOrderBtn = e.target.closest('[data-admin-edit-order]');
            if (editOrderBtn) {
                openAdminOrderModal(editOrderBtn.dataset.adminEditOrder);
                return;
            }

            const deleteOrderBtn = e.target.closest('[data-admin-delete-order]');
            if (deleteOrderBtn) {
                const orderId = deleteOrderBtn.dataset.adminDeleteOrder;
                const label = deleteOrderBtn.dataset.orderLabel || 'esta orden';
                openConfirmModal(
                    'Eliminar orden de taller',
                    `¿Seguro que deseas eliminar permanentemente la orden "${label}"?`,
                    'Eliminar orden',
                    async () => {
                        await apiFetch(`/orders/${orderId}`, { method: 'DELETE' });
                        showToast('Orden eliminada del sistema.', 'success');
                        await loadAdminDashboard();
                    }
                );
            }
        });

        // Modal Confirmación: aceptar
        $('#btn-confirm-accept').addEventListener('click', async () => {
            const btn = $('#btn-confirm-accept');
            if (!state.confirmCallback) {
                closeModal('modal-confirm');
                return;
            }
            setButtonLoading(btn, true, 'Eliminando...');
            try {
                await state.confirmCallback();
                closeModal('modal-confirm');
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                state.confirmCallback = null;
                setButtonLoading(btn, false);
            }
        });

        // Cerrar modales con botón, backdrop o tecla Escape
        $$('[data-close-modal]').forEach((btn) => {
            btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
        });

        $$('.modal-backdrop').forEach((backdrop) => {
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) closeModal(backdrop.id);
            });
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAllModals();
        });
    }

    // =========================================================================
    // Inicialización
    // =========================================================================
    async function init() {
        bindEvents();
        checkApiHealth();

        if (state.token) {
            try {
                const data = await apiFetch('/auth/me', { skipAuthReset: true });
                if (data && data.user) {
                    state.user = data.user;
                    updateNavbar();
                    await goToDashboard();
                    return;
                }
            } catch (_) {
                clearSession();
            }
        }

        updateNavbar();
        switchView('landing');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
