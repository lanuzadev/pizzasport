/* ═══════════════════════════════════════════════════════════
   customers.js — CRM Module
   ═══════════════════════════════════════════════════════════ */
const Customers = (() => {
  let _filter = 'all';
  let _search = '';

  const render = () => `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div class="page-header">
        <div>
          <div class="page-title">👥 Clientes</div>
          <div class="page-subtitle">Gestión de clientes y fidelización</div>
        </div>
        <button class="btn btn-primary" onclick="Customers.openForm()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo cliente
        </button>
      </div>

      <div style="padding:12px 24px;display:flex;gap:12px;align-items:center;flex-shrink:0">
        <div class="search-wrap" style="flex:1;max-width:340px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="search" class="form-control search-input" placeholder="Buscar por nombre, teléfono..." oninput="Customers.search(this.value)" />
        </div>
        <div class="tabs">
          <button class="tab-btn active" id="cf-all" onclick="Customers.filter('all')">Todos</button>
          <button class="tab-btn" id="cf-vip" onclick="Customers.filter('vip')">⭐ VIP</button>
          <button class="tab-btn" id="cf-bday" onclick="Customers.filter('birthday')">🎂 Cumpleaños</button>
        </div>
      </div>

      <div style="flex:1;overflow-y:auto;padding:0 24px 24px">
        <div id="customers-list">${renderList()}</div>
      </div>
    </div>
  `;

  const renderList = () => {
    const vipThreshold = DB.getSettings().vipThreshold;
    let customers = DB.getCustomers();
    if(_search) customers = customers.filter(c =>
      c.name.toLowerCase().includes(_search.toLowerCase()) ||
      c.phone.includes(_search) || (c.email||'').toLowerCase().includes(_search.toLowerCase())
    );
    if(_filter === 'vip') customers = customers.filter(c => c.totalSpent >= vipThreshold);
    if(_filter === 'birthday') {
      const today = new Date();
      customers = customers.filter(c => {
        if(!c.birthdate) return false;
        const bd = new Date(c.birthdate);
        return bd.getMonth() === today.getMonth() && bd.getDate() === today.getDate();
      });
    }
    customers.sort((a,b) => b.totalSpent - a.totalSpent);

    if(!customers.length) return `<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">Sin clientes</div><div class="empty-subtitle">Agrega tu primer cliente</div></div>`;

    const sym = DB.getSettings().currencySymbol;
    return `
      <table class="data-table">
        <thead><tr>
          <th>Cliente</th><th>Teléfono</th><th>Visitas</th>
          <th>Puntos</th><th>Total gastado</th><th>Acciones</th>
        </tr></thead>
        <tbody>
          ${customers.map(c => {
            const isVip = c.totalSpent >= vipThreshold;
            const isBday = (() => { if(!c.birthdate) return false; const bd=new Date(c.birthdate); const now=new Date(); return bd.getMonth()===now.getMonth()&&bd.getDate()===now.getDate(); })();
            const colors = ['av-red','av-green','av-orange','av-blue','av-purple'];
            const color = colors[c.name.charCodeAt(0)%5];
            return `
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="avatar avatar-sm ${color}">${escapeHtml(c.name[0])}</div>
                  <div>
                    <div style="font-weight:600">${escapeHtml(c.name)} ${isVip?'⭐':''} ${isBday?'🎂':''}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(c.email||'—')}</div>
                  </div>
                </div>
              </td>
              <td>${escapeHtml(c.phone)}</td>
              <td>${c.visits}</td>
              <td><span class="badge badge-orange">${c.points} pts</span></td>
              <td style="font-weight:700;color:var(--ps-orange)">${sym}${c.totalSpent.toFixed(2)}</td>
              <td>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-secondary btn-sm" onclick="Customers.openHistory('${c.id}')">Historial</button>
                  <button class="btn btn-ghost btn-icon-sm" onclick="Customers.openForm('${c.id}')" title="Editar">✏️</button>
                  <button class="btn btn-ghost btn-icon-sm" onclick="Customers.delete('${c.id}')" title="Eliminar" style="color:var(--danger)">🗑️</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  };

  const refresh = () => {
    const el = document.getElementById('customers-list');
    if(el) el.innerHTML = renderList();
  };

  const search = (q) => { _search = q; refresh(); };
  const filter = (f) => {
    _filter = f;
    ['all','vip','birthday'].forEach(k => document.getElementById(`cf-${k}`)?.classList.toggle('active', k === f));
    refresh();
  };

  const openForm = (id=null) => {
    const c = id ? DB.getCustomer(id) : {};
    const isAdmin = State.get('currentUser')?.role === 'admin';
    PizzaPos.ui.showModal(`
      <div class="modal-header">
        <div class="modal-title">${id?'Editar':'Nuevo'} Cliente</div>
        <button class="modal-close" onclick="PizzaPos.ui.closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-row form-row-2">
          <div class="form-group">
            <label class="form-label">Nombre <span class="required">*</span></label>
            <input type="text" class="form-control" id="cf-name" value="${escapeHtml(c.name||'')}" placeholder="Nombre completo" />
          </div>
          <div class="form-group">
            <label class="form-label">Teléfono <span class="required">*</span></label>
            <input type="tel" class="form-control" id="cf-phone" value="${escapeHtml(c.phone||'')}" placeholder="Número de teléfono" />
          </div>
        </div>
        <div class="form-row form-row-2">
          <div class="form-group">
            <label class="form-label">Correo electrónico</label>
            <input type="email" class="form-control" id="cf-email" value="${escapeHtml(c.email||'')}" placeholder="correo@ejemplo.com" />
          </div>
          <div class="form-group">
            <label class="form-label">Fecha de cumpleaños</label>
            <input type="date" class="form-control" id="cf-bday" value="${c.birthdate||''}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Dirección</label>
          <input type="text" class="form-control" id="cf-addr" value="${escapeHtml(c.address||'')}" placeholder="Dirección de entrega" />
        </div>
        ${id && isAdmin ? `
        <div class="form-row form-row-2">
          <div class="form-group">
            <label class="form-label">Puntos acumulados</label>
            <input type="number" class="form-control" id="cf-points" value="${c.points||0}" />
          </div>
          <div class="form-group">
            <label class="form-label">Visitas</label>
            <input type="number" class="form-control" id="cf-visits" value="${c.visits||0}" />
          </div>
        </div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="PizzaPos.ui.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="Customers.save('${id||''}')">Guardar</button>
      </div>
    `);
  };

  const save = (id) => {
    const name  = document.getElementById('cf-name')?.value?.trim();
    const phone = document.getElementById('cf-phone')?.value?.trim();
    if(!name || !phone) { Notify.warning('Campos requeridos', 'Nombre y teléfono son obligatorios'); return; }
    const existing = id ? DB.getCustomer(id) : null;
    // Los campos de puntos/visitas solo existen en el DOM para admins (ver
    // openForm) — si no están, se preserva el valor actual en vez de
    // resetearlo a 0 cada vez que un cajero edita otro dato del cliente.
    const pointsInput = document.getElementById('cf-points');
    const visitsInput = document.getElementById('cf-visits');
    const data = {
      id: id || undefined,
      name, phone,
      email:    document.getElementById('cf-email')?.value?.trim() || '',
      birthdate:document.getElementById('cf-bday')?.value || '',
      address:  document.getElementById('cf-addr')?.value?.trim() || '',
      points:   pointsInput ? (parseInt(pointsInput.value)||0) : (existing?.points||0),
      visits:   visitsInput ? (parseInt(visitsInput.value)||0) : (existing?.visits||0),
      totalSpent: existing?.totalSpent||0,
      createdAt: existing?.createdAt || new Date().toISOString()
    };
    DB.saveCustomer(data);
    PizzaPos.ui.closeModal();
    refresh();
    Notify.success(id?'Cliente actualizado':'Cliente creado', escapeHtml(name));
  };

  const openHistory = (id) => {
    const c = DB.getCustomer(id);
    if(!c) return;
    const validStatuses = ['open', 'cooking', 'ready', 'paid'];
    const orders = DB.getOrders().filter(o => o.customerId === id && validStatuses.includes(o.status))
                                 .sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
    const sym = DB.getSettings().currencySymbol;
    PizzaPos.ui.showModal(`
      <div class="modal-header">
        <div class="modal-title">📋 Historial — ${escapeHtml(c.name)}</div>
        <button class="modal-close" onclick="PizzaPos.ui.closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="mini-stats-row-3" style="margin-bottom:16px">
          <div style="text-align:center;background:var(--bg-3);padding:12px;border-radius:var(--radius)">
            <div style="font-size:1.25rem;font-weight:800;color:var(--ps-orange)">${sym}${c.totalSpent.toFixed(2)}</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">Total gastado</div>
          </div>
          <div style="text-align:center;background:var(--bg-3);padding:12px;border-radius:var(--radius)">
            <div style="font-size:1.25rem;font-weight:800;color:var(--ps-green)">${c.visits}</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">Visitas</div>
          </div>
          <div style="text-align:center;background:var(--bg-3);padding:12px;border-radius:var(--radius)">
            <div style="font-size:1.25rem;font-weight:800;color:var(--ps-red)">${c.points}</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">Puntos</div>
          </div>
        </div>
        ${orders.length ? `
          <table class="data-table">
            <thead><tr><th>#</th><th>Fecha</th><th>Items</th><th>Total</th></tr></thead>
            <tbody>
              ${orders.map(o => `
                <tr>
                  <td>#${o.number}</td>
                  <td>${new Date(o.createdAt).toLocaleDateString('es')}</td>
                  <td style="color:var(--text-secondary);font-size:0.8rem">${o.items.map(i=>escapeHtml(i.name)).join(', ')}</td>
                  <td style="font-weight:700;color:var(--ps-orange)">${sym}${o.total.toFixed(2)}</td>
                </tr>`).join('')}
            </tbody>
          </table>` : '<div class="empty-state"><div class="empty-subtitle">Sin órdenes registradas</div></div>'}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="PizzaPos.ui.closeModal()">Cerrar</button>
      </div>
    `, 'modal-lg');
  };

  const deleteFn = async (id) => {
    const c = DB.getCustomer(id);
    const ok = await Notify.confirm('Eliminar cliente', `¿Eliminar a ${escapeHtml(c?.name)}? Esta acción no se puede deshacer.`, {confirmClass:'btn-danger', confirmText:'Eliminar', icon:'🗑️'});
    if(ok) { DB.deleteCustomer(id); refresh(); Notify.success('Cliente eliminado'); }
  };

  return { render, init:()=>{}, search, filter, openForm, save, openHistory, delete:deleteFn };
})();
