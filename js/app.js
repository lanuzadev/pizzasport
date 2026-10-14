/* ═══════════════════════════════════════════════════════════
   app.js — Main Application: Router, Auth, UI, Init
   ═══════════════════════════════════════════════════════════ */

/* RBAC: rutas permitidas por rol. Única fuente de verdad — la usan tanto
   el router (bloquea la navegación) como applyRoleRestrictions (oculta los
   botones del menú) para que nunca se desincronicen entre sí. */
const PERMISSIONS = {
  admin: ['pos', 'tables', 'inventory', 'kitchen', 'customers', 'marketing', 'dashboard', 'menu', 'cash', 'settings'],
  cashier: ['pos', 'tables', 'inventory', 'customers', 'kitchen']
};

/* Expose as global namespace */
window.PizzaPos = {

  /* ════════════════════════════
     AUTH
     ════════════════════════════ */
  auth: {
    _selectedUser: null,
    _pinBuffer: '',
    _users: [],
    _submitting: false,

    // `users` = lista pública (sin PIN) obtenida de DB.fetchLoginUsers() antes de iniciar sesión
    init(users = []) {
      this._users = users;
      const list = document.getElementById('user-list');
      if (!list) return;

      list.innerHTML = users.map(u => {
        const roleLabels = { admin: 'Administrador', cashier: 'Cajero' };
        const roleColors = { admin: '#E8231A', cashier: '#3B82F6' };
        return `
          <button class="user-card" onclick="PizzaPos.auth.selectUser('${u.id}')">
            <div class="user-avatar" style="background:${roleColors[u.role] || '#666'}22;color:${roleColors[u.role] || '#999'}">${escapeHtml(u.initials || u.name[0])}</div>
            <div><div class="user-info-name">${escapeHtml(u.name)}</div><div class="user-info-role">${roleLabels[u.role] || u.role}</div></div>
          </button>`;
      }).join('');
    },

    selectUser(userId) {
      const user = this._users.find(u => u.id === userId);
      if (!user) return;
      this._selectedUser = user;
      this._pinBuffer = '';

      const roleColors = { admin: '#E8231A', cashier: '#3B82F6' };
      const roleLabels = { admin: 'Administrador', cashier: 'Cajero' };

      document.getElementById('user-select-screen').style.display = 'none';
      document.getElementById('pin-screen').style.display = 'block';
      document.getElementById('selected-avatar').textContent = user.initials || user.name[0];
      document.getElementById('selected-avatar').style.background = (roleColors[user.role] || '#666') + '22';
      document.getElementById('selected-avatar').style.color = roleColors[user.role] || '#999';
      document.getElementById('selected-user-name').textContent = user.name;
      document.getElementById('selected-user-role').textContent = roleLabels[user.role] || user.role;
      document.getElementById('pin-error').textContent = '';
      this._updateDots();
    },

    backToUsers() {
      this._selectedUser = null; this._pinBuffer = '';
      document.getElementById('user-select-screen').style.display = 'block';
      document.getElementById('pin-screen').style.display = 'none';
    },

    pressPin(digit) {
      if (this._pinBuffer.length >= 4) return;
      this._pinBuffer += digit;
      this._updateDots();
      if (this._pinBuffer.length === 4) setTimeout(() => this.submitPin(), 100);
    },

    clearPin() {
      this._pinBuffer = this._pinBuffer.slice(0, -1);
      this._updateDots();
    },

    _updateDots() {
      document.querySelectorAll('.pin-dot').forEach((dot, i) => {
        dot.classList.toggle('filled', i < this._pinBuffer.length);
      });
    },

    async submitPin() {
      if (!this._selectedUser || this._submitting) return;
      this._submitting = true;
      const result = await DB.login(this._selectedUser.id, this._pinBuffer);
      this._submitting = false;

      if (result.success) {
        this.loginSuccess(result.user);
      } else {
        const err = document.getElementById('pin-error');
        err.textContent = result.error || 'PIN incorrecto. Inténtalo de nuevo.';
        err.style.animation = 'none';
        setTimeout(() => err.style.animation = '', 10);
        this._pinBuffer = '';
        this._updateDots();
        Notify.soundError();
        setTimeout(() => { err.textContent = ''; }, 2500);
      }
    },

    async loginSuccess(user) {
      State.set('currentUser', user);
      const loginScreen = document.getElementById('login-screen');
      const app = document.getElementById('app');
      loginScreen.style.opacity = '0';
      loginScreen.style.transition = 'opacity 0.4s ease';
      setTimeout(() => { loginScreen.classList.add('hidden'); app.classList.remove('hidden'); }, 400);

      // Init app (carga el store completo autenticado + arranca el polling)
      await PizzaPos.initApp(user);
      Notify.success(`¡Bienvenido, ${escapeHtml(user.name)}!`, new Date().toLocaleTimeString('es'));
    },

    logout() {
      DB.logout();
      const app = document.getElementById('app');
      const loginScreen = document.getElementById('login-screen');
      app.classList.add('hidden');
      loginScreen.classList.remove('hidden');
      loginScreen.style.opacity = '1';
      State.set('currentUser', null);
      // Reset PIN screen
      document.getElementById('user-select-screen').style.display = 'block';
      document.getElementById('pin-screen').style.display = 'none';
      PizzaPos.auth._pinBuffer = '';
    }
  },

  /* ════════════════════════════
     ROUTER
     ════════════════════════════ */
  router: {
    _currentModule: null,
    _destroyHandlers: {},

    go(route) {
      // Role-Based Access Control (RBAC)
      const user = State.get('currentUser');
      if (user) {
        const allowedRoutes = PERMISSIONS[user.role] || [];
        if (!allowedRoutes.includes(route)) {
          Notify.error('Acceso denegado', 'No tienes permiso para ver esta sección');
          return;
        }
      }

      // Destroy previous module
      if (this._currentModule?.destroy) this._currentModule.destroy();

      // Update nav active state (sidebar + bottom tab bar share data-route)
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll(`[data-route="${route}"]`).forEach(b => b.classList.add('active'));

      // On mobile, navigating closes the drawer/"Más" sheet if it was open
      PizzaPos.ui.closeSidebarDrawer();

      // Page titles
      const titles = {
        tables: 'Mesas', pos: 'Punto de Venta', inventory: 'Inventario',
        kitchen: 'Cocina', customers: 'Clientes', marketing: 'Marketing',
        dashboard: 'Dashboard', menu: 'Menú', cash: 'Caja', settings: 'Configuración'
      };
      const el = document.getElementById('header-title');
      if (el) el.textContent = titles[route] || route;

      State.set('currentRoute', route);

      // Module map
      const modules = {
        tables: Tables, pos: POS, kitchen: Kitchen, dashboard: Dashboard,
        customers: Customers, marketing: Marketing,
        menu: MenuAdmin, cash: Cash, inventory: Inventory, settings: Settings
      };

      const mod = modules[route];
      if (!mod) return;
      this._currentModule = mod;

      // Render
      const container = document.getElementById('view-container');
      if (!container) return;
      container.innerHTML = mod.render();
      container.classList.add('animate-fade');
      setTimeout(() => container.classList.remove('animate-fade'), 300);
      PizzaPos.ui.labelDataTables(container);

      // Init module
      if (mod.init) mod.init();
    }
  },

  /* ════════════════════════════
     UI HELPERS
     ════════════════════════════ */
  ui: {
    showModal(content, sizeClass = '') {
      const overlay = document.getElementById('modal-overlay');
      const container = document.getElementById('modal-container');
      if (!overlay || !container) return;
      container.className = `modal-container ${sizeClass}`;
      container.innerHTML = content;
      overlay.classList.add('active');
    },

    closeModal(e) {
      if (e && e.target !== document.getElementById('modal-overlay')) return;
      const overlay = document.getElementById('modal-overlay');
      if (overlay) overlay.classList.remove('active');
    },

    toggleSidebar() {
      const sidebar = document.getElementById('sidebar');
      const wrapper = document.querySelector('.main-wrapper');
      if (window.innerWidth > 768) {
        const isExp = sidebar.classList.toggle('expanded');
        State.set('sidebarExpanded', isExp);
        wrapper?.classList.toggle('sidebar-expanded', isExp);
      } else {
        this.openSidebarDrawer();
      }
    },

    // Mobile-only: sidebar presented as an off-canvas drawer with a dimming backdrop
    // ("Más" tab in the bottom nav), independent from the desktop expand/collapse toggle.
    openSidebarDrawer() {
      document.getElementById('sidebar')?.classList.add('mobile-open');
      document.getElementById('sidebar-backdrop')?.classList.add('active');
    },

    closeSidebarDrawer() {
      document.getElementById('sidebar')?.classList.remove('mobile-open');
      document.getElementById('sidebar-backdrop')?.classList.remove('active');
    },

    // Mobile: labels every <td> in a .data-table with its column's <th>
    // text (data-label), which the @640px CSS turns into a stacked card
    // list — reading a table on a phone otherwise means scrolling sideways.
    // Called after every route render, and by a MutationObserver for
    // modules that patch a table back in later (e.g. a filter re-render)
    // without going through router.go again.
    labelDataTables(root) {
      root.querySelectorAll('table.data-table').forEach(table => {
        const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
        if (!headers.length) return;
        table.querySelectorAll('tbody tr').forEach(tr => {
          [...tr.children].forEach((td, i) => {
            if (td.tagName === 'TD' && !td.hasAttribute('colspan') && headers[i] && !td.hasAttribute('data-label')) {
              td.setAttribute('data-label', headers[i]);
            }
          });
        });
      });
    }
  },

  /* ════════════════════════════
     HEADER / CLOCK
     ════════════════════════════ */
  updateHeaderStats() {
    const validStatuses = ['open', 'cooking', 'ready', 'paid'];
    const todayOrders = DB.getOrdersToday().filter(o => validStatuses.includes(o.status));
    const totalSales = todayOrders.reduce((s, o) => s + o.total, 0);
    const sym = DB.getSettings().currencySymbol;
    const salesEl = document.getElementById('hdr-sales');
    const ordersEl = document.getElementById('hdr-orders');
    if (salesEl) salesEl.textContent = `${sym}${totalSales.toLocaleString('es', { minimumFractionDigits: 2 })}`;
    if (ordersEl) ordersEl.textContent = todayOrders.length;
    
    PizzaPos.checkLowStock();
  },

  checkLowStock() {
    const inv = DB.getInventory();
    const lowItems = inv.filter(i => i.currentStock <= i.minStock);
    const badge = document.getElementById('header-alert-badge');
    if (!badge) return;
    
    if (lowItems.length > 0) {
      badge.style.display = 'flex';
      badge.textContent = lowItems.length;
    } else {
      badge.style.display = 'none';
      badge.textContent = '0';
    }
  },

  showMessagesModal() {
    const inv = DB.getInventory();
    const lowItems = inv.filter(i => i.currentStock <= i.minStock);
    
    let html = `<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">Todo en orden</div><p style="color:var(--text-secondary)">No hay productos con stock bajo en este momento.</p></div>`;
    
    if (lowItems.length > 0) {
      html = `
        <div style="margin-bottom:16px;color:var(--text-secondary)">
          Los siguientes insumos/bebidas han alcanzado o están por debajo de su stock mínimo configurado.
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto;padding-right:8px;">
          ${lowItems.map(i => `
            <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-3);padding:12px;border-radius:var(--radius);border-left:4px solid var(--ps-red)">
              <div>
                <div style="font-weight:700">${escapeHtml(i.name)}</div>
                <div style="font-size:0.8rem;color:var(--text-muted)">Tipo: ${i.type==='beverage'?'Bebida':'Insumo'}</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:1.1rem;font-weight:800;color:var(--ps-red)">${i.currentStock.toFixed(1)} ${escapeHtml(i.unit)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted)">Mínimo: ${i.minStock}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    PizzaPos.ui.showModal(`
      <div class="modal-header">
        <div class="modal-title">🔔 Centro de Mensajes</div>
        <button class="modal-close" onclick="PizzaPos.ui.closeModal()">✕</button>
      </div>
      <div class="modal-body">
        ${html}
      </div>
    `);
  },

  updateNavBadge(module, count) {
    // Updates the badge on every nav button for this route (sidebar + bottom tab bar)
    document.querySelectorAll(`[data-route="${module}"]`).forEach(btn => {
      let badge = btn.querySelector('.nav-badge');
      if (count > 0) {
        if (!badge) { badge = document.createElement('div'); badge.className = 'nav-badge'; btn.appendChild(badge); }
        badge.textContent = count;
      } else if (badge) badge.remove();
    });
  },

  startClock() {
    const update = () => {
      const el = document.getElementById('header-clock');
      if (el) el.textContent = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    update();
    setInterval(update, 1000);
  },

  updateHeaderUser(user) {
    const roleLabels = { admin: 'Administrador', cashier: 'Cajero' };
    const roleColors = { admin: '#E8231A', cashier: '#3B82F6' };
    const avatarEl = document.getElementById('header-avatar');
    const nameEl = document.getElementById('header-user-name');
    const roleEl = document.getElementById('header-user-role');
    if (avatarEl) { avatarEl.textContent = user.initials || user.name[0]; avatarEl.style.background = (roleColors[user.role] || '#666') + '22'; avatarEl.style.color = roleColors[user.role] || '#999'; }
    if (nameEl) nameEl.textContent = user.name;
    if (roleEl) roleEl.textContent = roleLabels[user.role] || user.role;
  },

  /* ════════════════════════════
     INIT APP (after login)
     ════════════════════════════ */
  async initApp(user) {
    // Carga protegida del store completo + arranca el polling de 5s (requiere sesión)
    await DB.init();

    const activeCart = DB.getRaw('active_cart');
    if (activeCart) State.set('cart', activeCart);

    // Force currency update for demo
    let sets = DB.getSettings();
    if (sets.currency === 'Q' || sets.currencySymbol === 'Q') {
      sets.currency = 'Córdoba';
      sets.currencySymbol = 'C$';
      DB.saveSettings(sets);
    }

    // Apply theme (ya con settings reales cargadas)
    const theme = DB.getSettings().theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);

    this.startClock();
    this.updateHeaderUser(user);
    this.updateHeaderStats();
    this.applyRoleRestrictions(user);
    POS.init();

    this.router.go('pos');

    // Update delivery/kitchen badges
    const deliveries = DB.getRaw('ps_deliveries') || [];
    this.updateNavBadge('delivery', deliveries.filter(d => ['pending', 'assigned', 'on_way'].includes(d.status)).length);
    const kitchenActive = DB.getActiveOrders().filter(o => ['open', 'cooking', 'ready'].includes(o.status)).length;
    this.updateNavBadge('kitchen', kitchenActive);
    // Birthday alert
    this._checkBirthdays();
  },

  _checkBirthdays() {
    const customers = DB.getCustomers();
    const today = new Date().toISOString().slice(5, 10); // MM-DD
    const bday = customers.filter(c => c.birthdate && c.birthdate.slice(5, 10) === today);
    if (bday.length > 0) {
      setTimeout(() => Notify.info(`🎂 Cumpleaños hoy`, `${bday.map(c => escapeHtml(c.name)).join(', ')} — ¡considera enviar una promo!`, 8000), 2000);
    }
  },

  applyRoleRestrictions(user) {
    const allowed = PERMISSIONS[user.role] || [];

    document.querySelectorAll('[data-route]').forEach(btn => {
      const routeId = btn.dataset.route;
      btn.style.display = allowed.includes(routeId) ? '' : 'none';
    });
  },

  /* ════════════════════════════
     BOOT
     ════════════════════════════ */
  async boot() {
    // Tema cacheado para evitar parpadeo antes de que carguen los settings reales (post-login)
    try { document.documentElement.setAttribute('data-theme', localStorage.getItem('ps_theme') || 'dark'); } catch(e) {}

    // Fase pública: solo lo necesario para la pantalla de login (sin sesión, sin datos sensibles).
    // El store completo (productos, órdenes, settings...) se carga en initApp(), después del login.
    const loginUsers = await DB.fetchLoginUsers();
    PizzaPos.auth.init(loginUsers);

    // Sesión expirada/inválida (token vencido, servidor reiniciado, etc.) → forzar login de nuevo.
    window.addEventListener('auth-expired', () => {
      Notify.warning('Sesión expirada', 'Vuelve a iniciar sesión');
      PizzaPos.auth.logout();
    });

    // Keyboard shortcut: Escape closes modal
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const overlay = document.getElementById('modal-overlay');
        if (overlay?.classList.contains('active')) overlay.classList.remove('active');
      }
      // PIN keyboard support
      const pinScreen = document.getElementById('pin-screen');
      if (pinScreen && pinScreen.style.display !== 'none') {
        if (e.key >= '0' && e.key <= '9') PizzaPos.auth.pressPin(e.key);
        if (e.key === 'Backspace') PizzaPos.auth.clearPin();
        if (e.key === 'Enter') PizzaPos.auth.submitPin();
      }
    });

    // Register PWA service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => { });
    }

    // Catches tables a module re-renders on its own (e.g. a filter/refresh
    // that patches #view-container without going through router.go again)
    // so labelDataTables() still runs and the mobile card layout still
    // applies. router.go() covers the common case (a full route render);
    // this is the safety net for everything else.
    const viewContainer = document.getElementById('view-container');
    if (viewContainer) {
      let pending = false;
      new MutationObserver(() => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; PizzaPos.ui.labelDataTables(viewContainer); });
      }).observe(viewContainer, { childList: true, subtree: true });
    }

    // Login screen particles animation
    this._initParticles();
  },

  _initParticles() {
    const container = document.getElementById('login-particles');
    if (!container) return;
    const emojis = ['🍕', '🍅', '🧀', '🫒', '🍗', '🌶️'];
    for (let i = 0; i < 12; i++) {
      const p = document.createElement('div');
      p.style.cssText = `
        position:absolute;font-size:${Math.random() * 20 + 14}px;
        left:${Math.random() * 100}%;top:${Math.random() * 100}%;
        opacity:${Math.random() * 0.15 + 0.05};
        animation:float${Math.floor(Math.random() * 3) + 1} ${Math.random() * 8 + 6}s ease-in-out infinite;
        animation-delay:-${Math.random() * 6}s;
        pointer-events:none;user-select:none;
      `;
      p.textContent = emojis[i % emojis.length];
      container.appendChild(p);
    }

    // Add float animations
    if (!document.getElementById('particle-style')) {
      const style = document.createElement('style');
      style.id = 'particle-style';
      style.textContent = `
        @keyframes float1 { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-20px) rotate(10deg)} }
        @keyframes float2 { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(15px) rotate(-8deg)} }
        @keyframes float3 { 0%,100%{transform:translateY(-8px) rotate(-5deg)} 50%{transform:translateY(10px) rotate(12deg)} }
      `;
      document.head.appendChild(style);
    }
  }
};

/* ── Boot on DOM ready ── */
document.addEventListener('DOMContentLoaded', () => PizzaPos.boot());
