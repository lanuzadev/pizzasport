/* ═══════════════════════════════════════════════════════════
   kitchen.js — Kitchen Display System Module
   ═══════════════════════════════════════════════════════════ */
const Kitchen = (() => {
  let _interval = null;
  let _refreshInterval = null;
  let _soundOn = true;
  let _lastOrderCount = 0;
  let _mobileTab = 'open'; // mobile-only: which single column (open/cooking/ready) is shown — no more sideways swiping between them

  const statusLabels = { open:'Pendiente', cooking:'Preparando', ready:'Lista', paid:'Entregada' };
  const typeLabels   = { mesa:'Mesa', llevar:'Llevar', delivery:'Delivery' };

  const render = () => {
    return `
    <div class="kitchen-view">
      <div class="kitchen-header">
        <div class="kitchen-clock" id="kitchen-clock"></div>
        <div class="kitchen-stats">
          <div class="kitchen-stat pending">
            <div class="kitchen-stat-num" id="ks-pending">0</div>
            <div class="kitchen-stat-label">Pendientes</div>
          </div>
          <div class="kitchen-stat in-progress">
            <div class="kitchen-stat-num" id="ks-preparing">0</div>
            <div class="kitchen-stat-label">Preparando</div>
          </div>
          <div class="kitchen-stat done">
            <div class="kitchen-stat-num" id="ks-ready">0</div>
            <div class="kitchen-stat-label">Listas</div>
          </div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
          <button class="kitchen-sound-btn ${_soundOn?'active':''}" id="kitchen-sound-btn" onclick="Kitchen.toggleSound()">
            ${_soundOn ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Sonido ON' : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> Sonido OFF'}
          </button>
          <button class="btn btn-secondary btn-sm" onclick="Kitchen.refresh()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Actualizar
          </button>
        </div>
      </div>
      <!-- Mobile only: switches which single column shows below instead of
           swiping sideways between them (see kitchen.css @900px). -->
      <div class="tabs kitchen-mobile-tabs" id="kitchen-tabs">
        <button class="tab-btn ${_mobileTab==='open'?'active':''}" data-status="open" onclick="Kitchen.setTab('open')">Pendientes <span class="kanban-col-count" id="tabcount-open">0</span></button>
        <button class="tab-btn ${_mobileTab==='cooking'?'active':''}" data-status="cooking" onclick="Kitchen.setTab('cooking')">Horno <span class="kanban-col-count" id="tabcount-cooking">0</span></button>
        <button class="tab-btn ${_mobileTab==='ready'?'active':''}" data-status="ready" onclick="Kitchen.setTab('ready')">Listas <span class="kanban-col-count" id="tabcount-ready">0</span></button>
      </div>
      <div class="kitchen-kanban" id="kitchen-kanban" data-mobile-tab="${_mobileTab}">
        <div class="kanban-col col-pending">
          <div class="kanban-col-header">
            <div class="kanban-col-title">PENDIENTES <span class="kanban-col-count" id="count-open">0</span></div>
          </div>
          <div class="kanban-col-body" id="col-open"></div>
        </div>
        <div class="kanban-col col-cooking">
          <div class="kanban-col-header">
            <div class="kanban-col-title">EN EL HORNO <span class="kanban-col-count" id="count-cooking">0</span></div>
          </div>
          <div class="kanban-col-body" id="col-cooking"></div>
        </div>
        <div class="kanban-col col-ready">
          <div class="kanban-col-header">
            <div class="kanban-col-title">LISTAS <span class="kanban-col-count" id="count-ready">0</span></div>
          </div>
          <div class="kanban-col-body" id="col-ready"></div>
        </div>
      </div>
    </div>
    `;
  };

  // Mobile-only: switch which single column is visible (see kitchen.css @900px)
  const setTab = (status) => {
    _mobileTab = status;
    const kanban = document.getElementById('kitchen-kanban');
    if (kanban) kanban.dataset.mobileTab = status;
    document.querySelectorAll('#kitchen-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.status === status));
  };

  const renderOrderCard = (order) => {
    const customer = DB.getCustomers ? DB.getCustomers().find(c => c.id === order.customerId) : null;
    const customerName = escapeHtml(customer ? customer.name : 'Cliente General');
    
    // Fallback logic for old "mesa" orders to just show customer name
    let typeText = typeLabels[order.type] || order.type;
    if (order.type === 'mesa') typeText = 'Pedido';
    
    const typeDisplay = `${typeText} - ${customerName}`;

    const itemsHTML = order.items.map(item => `
      <div class="kitchen-item">
        <div class="kitchen-item-qty">${item.qty}</div>
        <div>
          <div class="kitchen-item-name">${escapeHtml(item.name)}${item.size ? ` (${escapeHtml(item.size)})` : ''}</div>
          ${item.mods && item.mods.length ? `<div class="kitchen-item-mods">+ ${item.mods.map(m=>escapeHtml(m.name)).join(', ')}</div>` : ''}
        </div>
      </div>
    `).join('');

    const actions = () => {
      const btnHorno = `<button class="kitchen-action-btn prepare" onclick="Kitchen.setStatus('${order.id}','cooking')"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/></svg> Al Horno</button>`;
      const btnLista = `<button class="kitchen-action-btn ready" onclick="Kitchen.setStatus('${order.id}','ready')"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Lista</button>`;
      const btnEntregar = `<button class="kitchen-action-btn done" onclick="Kitchen.setStatus('${order.id}','paid')"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Entregar</button>`;

      if(order.status === 'open') return btnHorno + btnLista;
      if(order.status === 'cooking') return btnLista + btnEntregar;
      if(order.status === 'ready') return btnEntregar;
      return '';
    };

    return `
      <div class="kitchen-card" id="kc-${order.id}" data-created="${order.createdAt}" data-status="${order.status}">
        <div class="kitchen-card-header ${order.status === 'open' ? 'pending' : order.status === 'cooking' ? 'preparing' : 'ready'}">
          <div>
            <div class="kitchen-order-num" style="display:flex;align-items:center;gap:8px;">
              #${order.number}
              <button class="btn btn-ghost" style="padding:4px;color:var(--text-secondary);" onclick="Kitchen.showRecipe('${order.id}')" title="Ver Receta">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </button>
            </div>
            <div class="kitchen-order-type">${typeDisplay}</div>
          </div>
          <div class="kitchen-timer normal" id="timer-${order.id}">--:--</div>
        </div>
        <div class="kitchen-items">${itemsHTML}</div>
        ${order.notes ? `<div class="kitchen-notes"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> ${escapeHtml(order.notes)}</div>` : ''}
        <div class="kitchen-card-actions">${actions()}</div>
      </div>
    `;
  };

  const setStatus = async (orderId, status) => {
    const order = DB.getOrder(orderId);
    await DB.updateOrder(orderId, {
      status,
      ...(status==='cooking' ? {cookingStartedAt:new Date().toISOString()} : {}),
      ...(status==='paid' ? {closedAt:new Date().toISOString()} : {})
    });
    // Al entregar una orden de mesa, liberar la mesa automáticamente —
    // solo si sigue apuntando a ESTA orden (evita liberar una mesa que un
    // mesero ya reasignó/liberó manualmente entre el checkout y la entrega).
    if(status === 'paid' && order?.type === 'mesa' && order.tableId) {
      const t = DB.getTable(order.tableId);
      if(t && t.orderId === order.id) await DB.saveTable({ ...t, status:'free', orderId:null });
    }
    refresh();
    if(status === 'ready') Notify.soundSuccess();
  };

  const refresh = () => {
    const kanban = document.getElementById('kitchen-kanban');
    if(!kanban) return;
    const orders = DB.getActiveOrders().filter(o => ['open','cooking','ready'].includes(o.status));

    // Sound for new orders
    if(_soundOn && orders.length > _lastOrderCount) Notify.soundNewOrder();
    _lastOrderCount = orders.length;

    const openOrders = orders.filter(o => o.status === 'open');
    const cookOrders = orders.filter(o => o.status === 'cooking');
    const readyOrders = orders.filter(o => o.status === 'ready');

    const updateColumn = (colId, colOrders, emptyMsg) => {
      const col = document.getElementById(colId);
      if(!col) return;
      if(colOrders.length === 0) {
        col.innerHTML = `<div style="opacity:0.3;text-align:center;padding:20px;">${emptyMsg}</div>`;
        return;
      }
      // Remove old
      const validIds = colOrders.map(o => `kc-${o.id}`);
      Array.from(col.children).forEach(child => {
        if(child.id && child.id.startsWith('kc-') && !validIds.includes(child.id)) child.remove();
      });
      // Clear empty msg if present
      if(col.firstElementChild && !col.firstElementChild.id) col.innerHTML = '';
      
      // Add new
      colOrders.forEach(order => {
        let card = document.getElementById(`kc-${order.id}`);
        if(!card) {
          const div = document.createElement('div');
          div.innerHTML = renderOrderCard(order).trim();
          col.appendChild(div.firstChild);
        }
      });
    };

    updateColumn('col-open', openOrders, 'Sin pendientes');
    updateColumn('col-cooking', cookOrders, 'Horno vacío');
    updateColumn('col-ready', readyOrders, 'No hay pizzas listas');

    // Update counts (desktop column headers + mobile tab badges)
    const countOpen = document.getElementById('count-open');
    if(countOpen) countOpen.textContent = openOrders.length;
    const countCooking = document.getElementById('count-cooking');
    if(countCooking) countCooking.textContent = cookOrders.length;
    const countReady = document.getElementById('count-ready');
    if(countReady) countReady.textContent = readyOrders.length;
    const tabCountOpen = document.getElementById('tabcount-open');
    if(tabCountOpen) tabCountOpen.textContent = openOrders.length;
    const tabCountCooking = document.getElementById('tabcount-cooking');
    if(tabCountCooking) tabCountCooking.textContent = cookOrders.length;
    const tabCountReady = document.getElementById('tabcount-ready');
    if(tabCountReady) tabCountReady.textContent = readyOrders.length;

    // Update global header stats
    ['pending','preparing','ready'].forEach((k,i) => {
      const el = document.getElementById(`ks-${k}`);
      if(el) el.textContent = [openOrders.length,cookOrders.length,readyOrders.length][i];
    });

    // Update nav badge
    PizzaPos.updateNavBadge('kitchen', orders.length > 0 ? orders.length : 0);
  };

  const updateClock = () => {
    const el = document.getElementById('kitchen-clock');
    if(el) el.textContent = new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  };

  const toggleSound = () => {
    _soundOn = !_soundOn;
    const btn = document.getElementById('kitchen-sound-btn');
    if(btn) { btn.innerHTML = _soundOn ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Sonido ON' : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> Sonido OFF'; btn.classList.toggle('active', _soundOn); }
  };

  const init = () => {
    _interval = setInterval(() => {
      updateClock();
      const orders = DB.getActiveOrders().filter(o => ['open','cooking','ready'].includes(o.status));
      let playAlarm = false;

      orders.forEach(order => {
        const card = document.getElementById(`kc-${order.id}`);
        const timerEl = document.getElementById(`timer-${order.id}`);
        if(!card || !timerEl) return;

        if(order.status === 'open') {
          // Pendientes: sin reloj corriendo, todavía no entra al horno.
          timerEl.textContent = 'Pendiente';
          timerEl.className = 'kitchen-timer normal';
        }
        else if (order.status === 'cooking') {
          // Cuenta regresiva desde que entró al horno (no desde que se creó el pedido)
          const cookingStart = new Date(order.cookingStartedAt || order.createdAt);
          const elapsedSeconds = Math.floor((Date.now() - cookingStart.getTime()) / 1000);
          const TOTAL_SECONDS = (DB.getSettings().kitchenTimerMinutes || 30) * 60;
          const remaining = TOTAL_SECONDS - elapsedSeconds;

          if (remaining > 0) {
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;
            timerEl.textContent = `-${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
            timerEl.className = remaining < 300 ? 'kitchen-timer urgent' : 'kitchen-timer normal'; // Red if < 5 mins
            card.classList.remove('alarm-active');
          } else {
            // Alarm state (00:00)
            const over = Math.abs(remaining);
            const m = Math.floor(over / 60);
            const s = over % 60;
            timerEl.textContent = `+${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
            timerEl.className = 'kitchen-timer alarm-text';
            card.classList.add('alarm-active');
            playAlarm = true; // Flag to play sound this second
          }
        }
        else if (order.status === 'ready') {
          timerEl.textContent = 'LISTA';
          timerEl.className = 'kitchen-timer normal';
          card.classList.remove('alarm-active');
        }
      });

      // Play continuous alarm sound if any order is at 00:00 and sound is ON
      if(playAlarm && _soundOn) {
        Notify.beep(900, 300, 0.5); // Loud beep
      }
    }, 1000);

    // Poll for new orders every 10s
    _refreshInterval = setInterval(refresh, 10000);
    updateClock();
    refresh(); // Load immediately on init to avoid blank screen
  };

  const destroy = () => {
    if(_interval) { clearInterval(_interval); _interval = null; }
    if(_refreshInterval) { clearInterval(_refreshInterval); _refreshInterval = null; }
  };

  const showRecipe = (orderId) => {
    const orders = DB.getActiveOrders();
    const order = orders.find(o => o.id == orderId);
    if(!order) return;
    
    let html = `<div style="text-align:left; max-height:400px; overflow-y:auto;">`;
    const inventory = DB.getInventory();
    
    let hasRecipes = false;
    order.items.forEach(item => {
      const recipe = DB.getRecipe(item.productId, item.size);
      if(recipe && recipe.ingredients && recipe.ingredients.length > 0) {
        hasRecipes = true;
        html += `<div style="margin-bottom:15px; padding:10px; background:var(--bg-3); border-radius:var(--radius);">
          <strong style="color:var(--ps-orange);">${escapeHtml(item.name)} ${item.size ? `(${escapeHtml(item.size)})` : ''}</strong> x${item.qty}
          <ul style="margin-top:8px; padding-left:20px; font-size:0.95rem; color:var(--text-primary);">`;

        recipe.ingredients.forEach(ing => {
          const invItem = inventory.find(i => i.id === ing.inventoryId);
          const name = escapeHtml(invItem ? invItem.name : 'Desconocido');
          const unit = escapeHtml(invItem ? invItem.unit : '');
          html += `<li style="margin-bottom:4px;">${(ing.qty * item.qty).toFixed(2)} ${unit} de <strong>${name}</strong></li>`;
        });
        html += `</ul></div>`;
      }
    });
    
    if(!hasRecipes) {
      html += `<p style="color:var(--text-muted);text-align:center;padding:20px 0;">No hay recetas configuradas para los productos de esta orden.</p>`;
    }
    
    html += `</div>`;
    
    PizzaPos.ui.showModal(`
      <div class="modal-header"><div class="modal-title">Receta - Orden #${order.number}</div></div>
      <div class="modal-body">${html}</div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="PizzaPos.ui.closeModal()">Cerrar</button>
      </div>
    `);
  };

  return { render, init, destroy, setStatus, refresh, toggleSound, showRecipe, setTab };
})();
