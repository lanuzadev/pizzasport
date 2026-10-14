/* ═══════════════════════════════════════════════════════════
   cash.js — Cash Register / Caja Module
   ═══════════════════════════════════════════════════════════ */
const Cash = (() => {
  // Un pago "mixto" reparte su total entre efectivo/tarjeta/transferencia —
  // cada porción debe sumar al método que realmente le corresponde (la
  // porción en efectivo sí es dinero real en el cajón), no perderse.
  const sumByMethod = (orders, method) => orders.reduce((s,o) => {
    if(o.paymentMethod === method) return s + o.total;
    if(o.paymentMethod === 'mixed' && o.mixedBreakdown) return s + (o.mixedBreakdown[method] || 0);
    return s;
  }, 0);

  const render = () => {
    const session = DB.getOpenSession();
    const sym = DB.getSettings().currencySymbol;
    const validStatuses = ['open', 'cooking', 'ready', 'paid'];
    const todayOrders = DB.getOrdersToday().filter(o => validStatuses.includes(o.status));

    const totalCash     = sumByMethod(todayOrders, 'cash');
    const totalCard     = sumByMethod(todayOrders, 'card');
    const totalTransfer = sumByMethod(todayOrders, 'transfer');
    const totalSales    = todayOrders.reduce((s,o)=>s+o.total,0);

    const movs = DB.getRaw('ps_cash_movements') || [];
    const sessionMovs = session ? movs.filter(m => m.sessionId ? m.sessionId === session.id : new Date(m.createdAt) >= new Date(session.openedAt)) : [];
    const totalMovIn = sessionMovs.filter(m=>m.type==='in').reduce((s,m)=>s+m.amount,0);
    const totalMovOut = sessionMovs.filter(m=>m.type==='out').reduce((s,m)=>s+m.amount,0);
    const expectedCash = session ? (session.initialAmount + totalCash + totalMovIn - totalMovOut) : 0;

    return `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div class="page-header">
        <div><div class="page-title">💰 Caja</div><div class="page-subtitle">Control de caja y corte del turno</div></div>
        ${!session ? `<button class="btn btn-primary" onclick="Cash.openSession()">🔓 Abrir caja</button>`
                   : `<button class="btn btn-danger" onclick="Cash.closeSession()">🔒 Cerrar caja</button>`}
      </div>

      <!-- Session status -->
      <div style="padding:0 24px;margin-bottom:8px">
        <div style="background:${session?'var(--ps-green-glow)':'var(--danger-bg)'};border:1px solid ${session?'var(--ps-green)':'var(--danger)'};
                    border-radius:var(--radius-lg);padding:14px 20px;display:flex;align-items:center;gap:12px">
          <div style="font-size:1.5rem">${session?'🟢':'🔴'}</div>
          <div>
            <div style="font-weight:700;color:${session?'var(--ps-green)':'var(--danger)'}">
              ${session ? 'Caja ABIERTA' : 'Caja CERRADA'}
            </div>
            ${session ? `<div style="font-size:0.8rem;color:var(--text-muted)">
              Apertura: ${new Date(session.openedAt).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})} —
              Cajero: ${State.get('currentUser')?.name||'—'} —
              Monto inicial: ${sym}${(session.initialAmount||0).toFixed(2)}
            </div>` : '<div style="font-size:0.8rem;color:var(--text-muted)">Abre la caja para comenzar a operar</div>'}
          </div>
        </div>
      </div>

      <div style="flex:1;overflow-y:auto;padding:0 24px 24px;display:flex;flex-direction:column;gap:16px">
        <!-- Sales totals -->
        <div class="stats-row-5">
          ${[
            {icon:'💵',label:'Ventas Efectivo',val:totalCash,color:'green'},
            {icon:'💳',label:'Tarjeta',val:totalCard,color:'blue'},
            {icon:'📲',label:'Transferencia',val:totalTransfer,color:'purple'},
            {icon:'📊',label:'Total Ventas',val:totalSales,color:'orange'},
            {icon:'🏦',label:'Efectivo en Caja',val:expectedCash,color:'green'}
          ].map(s=>`
            <div class="stat-card" ${s.label==='Efectivo en Caja' ? 'style="border:2px solid var(--success)"' : ''}>
              <div class="stat-icon ${s.color}">${s.icon}</div>
              <div class="stat-body">
                <div class="stat-number">${sym}${s.val.toFixed(2)}</div>
                <div class="stat-name" ${s.label==='Efectivo en Caja' ? 'style="font-weight:bold;color:var(--success)"' : ''}>${s.label}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Cash movements + orders table -->
        <div class="split-1-2">
          <!-- Cash movements -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">💸 Movimientos</div>
              <button class="btn btn-secondary btn-sm" onclick="Cash.addMovement()">+ Agregar</button>
            </div>
            <div id="movements-list">${renderMovements()}</div>
          </div>

          <!-- Today's orders -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">📋 Órdenes del día</div>
              <span class="badge badge-orange">${todayOrders.length} órdenes</span>
            </div>
            <div style="overflow-x:auto">
              ${todayOrders.length ? `
              <table class="data-table">
                <thead><tr><th>#</th><th>Tipo</th><th>Items</th><th>Pago</th><th>Total</th><th>Hora</th></tr></thead>
                <tbody>
                  ${[...todayOrders].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(o => `
                    <tr>
                      <td style="font-weight:700">#${o.number}</td>
                      <td>${{mesa:'🍽️',llevar:'🛍️',delivery:'🛵'}[o.type]||'📋'} ${o.type}</td>
                      <td style="font-size:0.8rem;color:var(--text-muted)">${o.items.length} items</td>
                      <td><span class="badge ${o.paymentMethod==='cash'?'badge-green':o.paymentMethod==='card'?'badge-blue':o.paymentMethod==='mixed'?'badge-orange':'badge-purple'}">${{cash:'Efectivo',card:'Tarjeta',transfer:'Transf.',mixed:'Mixto'}[o.paymentMethod]||o.paymentMethod}</span></td>
                      <td style="font-weight:700;color:var(--ps-orange)">${sym}${o.total.toFixed(2)}</td>
                      <td style="font-size:0.8rem;color:var(--text-muted)">${new Date(o.createdAt).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>` : '<div class="empty-state"><div class="empty-subtitle">Sin ventas registradas hoy</div></div>'}
            </div>
          </div>
        </div>

        <!-- Sessions history -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">📅 Historial de sesiones</div>
            <button class="btn btn-secondary btn-sm" onclick="Cash.printReport()">🖨️ Imprimir corte</button>
          </div>
          ${renderSessionsHistory()}
        </div>
      </div>
    </div>`;
  };

  const renderMovements = () => {
    const movs = DB.getRaw('ps_cash_movements') || [];
    const sym = DB.getSettings().currencySymbol;
    const today = movs.filter(m => new Date(m.createdAt).toDateString() === new Date().toDateString());
    if(!today.length) return `<div class="empty-state"><div class="empty-subtitle">Sin movimientos hoy</div></div>`;
    return `<div style="display:flex;flex-direction:column;gap:6px">
      ${today.map(m => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg-3);border-radius:var(--radius)">
          <span style="font-size:1rem">${m.type==='in'?'⬇️':'⬆️'}</span>
          <div style="flex:1"><div style="font-size:0.85rem;font-weight:600">${escapeHtml(m.description)}</div><div style="font-size:0.72rem;color:var(--text-muted)">${new Date(m.createdAt).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</div></div>
          <span style="font-weight:700;color:${m.type==='in'?'var(--success)':'var(--danger)'}">${m.type==='in'?'+':'-'}${sym}${m.amount.toFixed(2)}</span>
        </div>
      `).join('')}
    </div>`;
  };

  const renderSessionsHistory = () => {
    const sessions = [...DB.getCashSessions()].sort((a,b) => new Date(b.openedAt)-new Date(a.openedAt)).slice(0,10);
    const sym = DB.getSettings().currencySymbol;
    if(!sessions.length) return `<div class="empty-state"><div class="empty-subtitle">Sin sesiones registradas</div></div>`;
    return `<table class="data-table">
      <thead><tr><th>Apertura</th><th>Cierre</th><th>Cajero</th><th>Monto inicial</th><th>Ventas</th><th>Estado</th></tr></thead>
      <tbody>
        ${sessions.map(s => `
          <tr>
            <td>${new Date(s.openedAt).toLocaleString('es',{dateStyle:'short',timeStyle:'short'})}</td>
            <td>${s.closedAt?new Date(s.closedAt).toLocaleString('es',{dateStyle:'short',timeStyle:'short'}):'—'}</td>
            <td>${escapeHtml(s.userName||'—')}</td>
            <td>${sym}${(s.initialAmount||0).toFixed(2)}</td>
            <td style="font-weight:700;color:var(--ps-orange)">${sym}${(s.totalSales||0).toFixed(2)}</td>
            <td><span class="badge ${s.closedAt?'badge-gray':'badge-green'}">${s.closedAt?'Cerrada':'Abierta'}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  };

  const openSession = async () => {
    const amount = await Notify.prompt('Abrir caja', 'Ingresa el monto inicial de caja', '0.00');
    if(amount === null) return;
    const initial = parseFloat(amount) || 0;
    const result = await DB.createSession({
      initialAmount:initial, totalSales:0, totalCash:0, totalCard:0, totalTransfer:0,
      userName:State.get('currentUser')?.name || 'Usuario'
    });
    if(!result.success) {
      Notify.warning('Caja ya abierta', `${escapeHtml(result.session?.userName||'Otro usuario')} ya abrió la caja a las ${new Date(result.session?.openedAt).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}`);
      PizzaPos.router.go('cash');
      return;
    }
    PizzaPos.router.go('cash');
    Notify.success('Caja abierta', `Monto inicial: ${DB.getSettings().currencySymbol}${initial.toFixed(2)}`);
  };

  const closeSession = async () => {
    const session = DB.getOpenSession();
    if(!session) return;
    const ok = await Notify.confirm('Cerrar caja', '¿Deseas cerrar la sesión de caja actual? Se generará el corte.', {confirmClass:'btn-danger', confirmText:'Cerrar caja'});
    if(!ok) return;

    const validStatuses = ['open', 'cooking', 'ready', 'paid'];
    const todayOrders = DB.getOrdersToday().filter(o => validStatuses.includes(o.status));
    const totalCash     = sumByMethod(todayOrders, 'cash');
    const totalCard     = sumByMethod(todayOrders, 'card');
    const totalTransfer = sumByMethod(todayOrders, 'transfer');
    const totalSales    = todayOrders.reduce((s,o)=>s+o.total,0);

    const movs = DB.getRaw('ps_cash_movements') || [];
    const sessionMovs = movs.filter(m => m.sessionId ? m.sessionId === session.id : new Date(m.createdAt) >= new Date(session.openedAt));
    const totalMovIn = sessionMovs.filter(m=>m.type==='in').reduce((s,m)=>s+m.amount,0);
    const totalMovOut = sessionMovs.filter(m=>m.type==='out').reduce((s,m)=>s+m.amount,0);
    const expectedCash = session.initialAmount + totalCash + totalMovIn - totalMovOut;

    const closed = DB.closeSession(session.id, { totalSales, totalCash, totalCard, totalTransfer, totalMovIn, totalMovOut, expectedCash, userName:State.get('currentUser')?.name });
    Printer.printCashReport(closed);
    PizzaPos.router.go('cash');
    Notify.success('Caja cerrada', `Efectivo esperado: ${DB.getSettings().currencySymbol}${expectedCash.toFixed(2)}`);
  };

  const addMovement = async () => {
    if(!DB.getOpenSession()) { Notify.warning('Caja cerrada', 'Abre la caja antes de registrar movimientos'); return; }
    PizzaPos.ui.showModal(`
      <div class="modal-header"><div class="modal-title">💸 Agregar movimiento</div><button class="modal-close" onclick="PizzaPos.ui.closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Tipo</label>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary btn-full" id="mv-in" onclick="Cash.setMvType('in')">⬇️ Ingreso</button>
            <button class="btn btn-secondary btn-full" id="mv-out" onclick="Cash.setMvType('out')">⬆️ Retiro</button>
          </div>
        </div>
        <div class="form-group"><label class="form-label">Monto</label><input type="number" class="form-control" id="mv-amount" placeholder="0.00" min="0" step="0.01" /></div>
        <div class="form-group"><label class="form-label">Descripción</label><input type="text" class="form-control" id="mv-desc" placeholder="Ej: Retiro para cambio, Ingreso de ventas..." /></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="PizzaPos.ui.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="Cash.saveMovement()">Guardar</button>
      </div>
    `, 'modal-sm');
    window._mvType = 'in';
  };

  const setMvType = (type) => {
    window._mvType = type;
    document.getElementById('mv-in').className = `btn btn-full ${type==='in'?'btn-primary':'btn-secondary'}`;
    document.getElementById('mv-out').className = `btn btn-full ${type==='out'?'btn-primary':'btn-secondary'}`;
  };

  const saveMovement = () => {
    const session = DB.getOpenSession();
    if(!session) { Notify.warning('Caja cerrada', 'Abre la caja antes de registrar movimientos'); PizzaPos.ui.closeModal(); return; }
    const amount = parseFloat(document.getElementById('mv-amount')?.value)||0;
    const desc   = document.getElementById('mv-desc')?.value?.trim() || 'Sin descripción';
    if(amount <= 0) { Notify.warning('Monto inválido', 'Ingresa un monto mayor a 0'); return; }
    const movs = DB.getRaw('ps_cash_movements') || [];
    movs.push({ id:`mov-${Date.now()}`, sessionId:session.id, type:window._mvType||'in', amount, description:desc, createdAt:new Date().toISOString(), userId:State.get('currentUser')?.id });
    DB.setRaw('ps_cash_movements', movs);
    PizzaPos.ui.closeModal();
    PizzaPos.router.go('cash');
    Notify.success('Movimiento registrado', `${window._mvType==='in'?'Ingreso':'Retiro'}: ${DB.getSettings().currencySymbol}${amount.toFixed(2)}`);
  };

  const printReport = () => {
    const session = DB.getOpenSession() || DB.getCashSessions().slice(-1)[0];
    if(!session) { Notify.warning('Sin sesión', 'No hay datos de caja para imprimir'); return; }
    const validStatuses = ['open', 'cooking', 'ready', 'paid'];
    const todayOrders = DB.getOrdersToday().filter(o => validStatuses.includes(o.status));
    const totalSales = todayOrders.reduce((s,o)=>s+o.total,0);
    Printer.printCashReport({ ...session, totalSales, userName:State.get('currentUser')?.name });
  };

  return { render, init:()=>{}, openSession, closeSession, addMovement, setMvType, saveMovement, printReport };
})();
