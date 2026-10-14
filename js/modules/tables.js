/* ═══════════════════════════════════════════════════════════
   tables.js — Módulo de Mesas (dine-in)
   ═══════════════════════════════════════════════════════════ */
const Tables = (() => {

  const render = () => {
    const isAdmin = State.get('currentUser')?.role === 'admin';
    return `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div class="page-header">
        <div><div class="page-title">🪑 Mesas</div><div class="page-subtitle">Estado de mesas y órdenes en sitio</div></div>
        ${isAdmin ? `<button class="btn btn-primary" onclick="Tables.openTableForm()">+ Nueva mesa</button>` : ''}
      </div>
      <div style="flex:1;overflow-y:auto;padding:0 24px 24px" id="tables-grid-wrap">
        ${renderGrid()}
      </div>
    </div>`;
  };

  const renderGrid = () => {
    const tables = DB.getTables();
    if(tables.length === 0) {
      return `<div class="empty-state" style="padding:40px;text-align:center;color:var(--text-muted)">No hay mesas registradas.</div>`;
    }
    return `<div class="tables-grid">${tables.map(renderCard).join('')}</div>`;
  };

  const renderCard = (t) => {
    const isAdmin = State.get('currentUser')?.role === 'admin';
    const occupied = t.status === 'occupied';
    const order = occupied && t.orderId ? DB.getOrder(t.orderId) : null;
    return `
      <div class="table-card ${occupied ? 'occupied' : 'free'}" onclick="Tables.tapTable('${t.id}')">
        ${isAdmin ? `
        <div class="table-card-admin-actions">
          <button class="table-card-edit" onclick="event.stopPropagation();Tables.openTableForm('${t.id}')" title="Editar mesa">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </button>
          ${!occupied ? `<button class="table-card-edit" onclick="event.stopPropagation();Tables.deleteTable('${t.id}')" title="Eliminar mesa">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>` : ''}
        </div>` : ''}
        <div class="table-card-icon">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="10" width="18" height="3" rx="1"/><line x1="5" y1="13" x2="5" y2="21"/><line x1="19" y1="13" x2="19" y2="21"/><line x1="9" y1="10" x2="9" y2="7"/><line x1="15" y1="10" x2="15" y2="7"/>
          </svg>
        </div>
        <div class="table-card-name">${escapeHtml(t.name)}</div>
        <div class="table-card-capacity">Capacidad ${t.capacity ?? '—'}</div>
        <div class="badge ${occupied ? 'badge-red' : 'badge-green'}">${occupied ? 'Ocupada' : 'Libre'}</div>
        ${order ? `<div class="table-card-order">Orden #${order.number}</div>` : ''}
      </div>`;
  };

  const refresh = () => {
    const el = document.getElementById('tables-grid-wrap');
    if(el) el.innerHTML = renderGrid();
  };

  /* ── Interacción principal ── */
  const tapTable = (id) => {
    const t = DB.getTable(id);
    if(!t) return;
    if(t.status === 'occupied') return showOccupiedInfo(t);
    return startOrderAtTable(t);
  };

  const startOrderAtTable = (t) => {
    const cart = State.get('cart');
    const proceed = () => {
      State.cart.clear();
      State.patch('cart', { type:'mesa', tableId: t.id });
      PizzaPos.router.go('pos');
    };
    if(cart.items && cart.items.length > 0) {
      Notify.confirm('Carrito con productos', 'Ya tienes productos en la orden actual. ¿Descartarlos y comenzar la orden de esta mesa?', { confirmClass:'btn-danger', confirmText:'Descartar y continuar' })
        .then(ok => { if(ok) proceed(); });
    } else {
      proceed();
    }
  };

  const showOccupiedInfo = (t) => {
    const isAdmin = State.get('currentUser')?.role === 'admin';
    const order = t.orderId ? DB.getOrder(t.orderId) : null;
    const since = order ? new Date(order.createdAt).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' }) : null;
    PizzaPos.ui.showModal(`
      <div class="modal-header">
        <div class="modal-title">🪑 ${escapeHtml(t.name)}</div>
        <button class="modal-close" onclick="PizzaPos.ui.closeModal()">✕</button>
      </div>
      <div class="modal-body">
        ${order ? `
          <p>Orden <strong>#${order.number}</strong> — abierta a las ${since}</p>
          <p style="color:var(--text-muted);font-size:0.875rem">${order.items.length} producto(s)</p>
        ` : `<p style="color:var(--text-muted)">Esta mesa está marcada como ocupada pero no tiene una orden asociada.</p>`}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="PizzaPos.ui.closeModal()">Cerrar</button>
        ${isAdmin ? `<button class="btn btn-danger" onclick="Tables.freeTable('${t.id}')">Liberar mesa</button>` : ''}
      </div>
    `, 'modal-sm');
  };

  const freeTable = async (id) => {
    const t = DB.getTable(id);
    if(!t) return;
    const ok = await Notify.confirm('Liberar mesa', 'Esto libera la mesa para reasignarla sin cerrar el pedido asociado. ¿Continuar?', { confirmClass:'btn-danger', confirmText:'Liberar' });
    if(!ok) return;
    await DB.saveTable({ ...t, status:'free', orderId:null });
    PizzaPos.ui.closeModal();
    refresh();
    Notify.success('Mesa liberada');
  };

  /* ── CRUD (solo admin) ── */
  const openTableForm = (id = null) => {
    const t = id ? DB.getTable(id) : null;
    PizzaPos.ui.showModal(`
      <div class="modal-header">
        <div class="modal-title">${t ? 'Editar' : 'Nueva'} Mesa</div>
        <button class="modal-close" onclick="PizzaPos.ui.closeModal()">✕</button>
      </div>
      <div class="modal-body form-row">
        <div class="form-group">
          <label class="form-label">Nombre</label>
          <input type="text" id="tf-name" class="form-control" value="${escapeHtml(t?.name || '')}" placeholder="Ej: Mesa 11">
        </div>
        <div class="form-group">
          <label class="form-label">Capacidad</label>
          <input type="number" id="tf-capacity" class="form-control" min="1" step="1" value="${t?.capacity ?? 4}">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="PizzaPos.ui.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="Tables.saveTableForm('${id || ''}')">Guardar</button>
      </div>
    `, 'modal-md');
  };

  const saveTableForm = async (id) => {
    const name = document.getElementById('tf-name').value.trim();
    const capacity = parseInt(document.getElementById('tf-capacity').value, 10) || 1;
    if(!name) { Notify.error('Falta el nombre', 'Ingresa un nombre para la mesa'); return; }

    const existing = id ? DB.getTable(id) : null;
    await DB.saveTable({
      ...(existing || { status:'free', orderId:null }),
      id: id || undefined,
      name, capacity
    });
    PizzaPos.ui.closeModal();
    refresh();
    Notify.success(existing ? 'Mesa actualizada' : 'Mesa creada', name);
  };

  const deleteTable = async (id) => {
    const t = DB.getTable(id);
    if(!t) return;
    if(t.status !== 'free') { Notify.error('No se puede eliminar', 'Libera la mesa antes de eliminarla'); return; }
    const ok = await Notify.confirm('Eliminar mesa', `¿Eliminar "${escapeHtml(t.name)}"?`, { confirmClass:'btn-danger', confirmText:'Eliminar' });
    if(!ok) return;
    await DB.deleteTable(id);
    refresh();
    Notify.success('Mesa eliminada');
  };

  const init = () => {};

  return {
    render, init,
    tapTable, freeTable,
    openTableForm, saveTableForm, deleteTable
  };
})();
