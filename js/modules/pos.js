/* ═══════════════════════════════════════════════════════════
   pos.js — Point of Sale Module
   ═══════════════════════════════════════════════════════════ */
const POS = (() => {
  let _activeCat = 'all';
  let _searchQuery = '';
  let _cartExpanded = false; // mobile-only: bottom sheet peek/expand state — starts peeked so the product grid gets the screen

  /* ── Render ── */
  const render = () => {
    const categories = DB.getCategories();
    const settings = DB.getSettings();
    const sym = settings.currencySymbol;

    return `
    <div class="pos-layout">
      <!-- LEFT: Products Panel -->
      <div class="pos-products-panel">
        <!-- Category Tabs -->
        <div class="pos-categories" id="pos-categories">
          <button class="cat-btn active" data-cat="all" onclick="POS.filterCat('all')">
            <span class="cat-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></span> Todo
          </button>
          ${categories.map(c => `
            <button class="cat-btn" data-cat="${c.id}" onclick="POS.filterCat('${c.id}')">
              <span class="cat-icon">${c.icon}</span> ${escapeHtml(c.name)}
            </button>
          `).join('')}
        </div>
        <!-- Search -->
        <div class="pos-search-bar">
          <div class="search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" class="form-control search-input" id="pos-search"
              placeholder="Buscar producto..." oninput="POS.handleSearch(this.value)" />
          </div>
        </div>
        <!-- Products Grid -->
        <div class="pos-products-grid" id="pos-products-grid">
          ${renderProducts()}
        </div>
      </div>

      <!-- RIGHT: Cart Panel -->
      <div class="pos-cart-panel${_cartExpanded ? '' : ' cart-collapsed'}" id="pos-cart-panel">
        <!-- Mobile drag handle: tap to peek/expand the order sheet -->
        <button class="cart-sheet-toggle" id="cart-sheet-toggle" onclick="POS.toggleCartSheet()" title="Ver/ocultar orden">
          <span class="cart-sheet-handle"></span>
        </button>

        <!-- Order Type -->
        <div class="cart-order-type">
          <button class="order-type-btn active" id="ot-llevar" onclick="POS.setType('llevar')">
            <span class="ot-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/></svg></span><span>Llevar</span>
          </button>
          <button class="order-type-btn" id="ot-delivery" onclick="POS.setType('delivery')">
            <span class="ot-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/><path d="M14 17h-4M5 17H3V9h4l3-3h5v5h4v6h-2M15 11h3"/></svg></span><span>Delivery</span>
          </button>
          <button class="order-type-btn" id="ot-mesa" onclick="POS.setType('mesa')">
            <span class="ot-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="10" width="18" height="3" rx="1"/><line x1="5" y1="13" x2="5" y2="21"/><line x1="19" y1="13" x2="19" y2="21"/><line x1="9" y1="10" x2="9" y2="7"/><line x1="15" y1="10" x2="15" y2="7"/></svg></span><span>Mesa</span>
          </button>
        </div>

        <!-- Customer Quick Select -->
        <div class="cart-customer-bar" onclick="POS.openCustomerSelect()" id="cart-customer-bar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span class="cart-customer-name" id="cart-customer-name">Sin cliente asignado</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>

        <!-- Table Quick Select (solo visible cuando type === 'mesa') -->
        <div class="cart-customer-bar" onclick="POS.openTableSelect()" id="cart-table-bar" style="display:none">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="10" width="18" height="3" rx="1"/><line x1="5" y1="13" x2="5" y2="21"/><line x1="19" y1="13" x2="19" y2="21"/><line x1="9" y1="10" x2="9" y2="7"/><line x1="15" y1="10" x2="15" y2="7"/></svg>
          <span class="cart-customer-name" id="cart-table-name">Selecciona una mesa</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>

        <!-- Hold Orders -->
        <div class="hold-orders-bar" id="hold-orders-bar"></div>

        <!-- Cart Header -->
        <div class="cart-header">
          <div class="cart-title">
            🛒 Orden
            <div class="cart-badge" id="cart-count">0</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" onclick="POS.clearCart()" title="Limpiar carrito">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            </button>
          </div>
        </div>

        <!-- Cart Items -->
        <div class="cart-items" id="cart-items">
          <div class="cart-empty" id="cart-empty">
            <div class="cart-empty-icon">🛒</div>
            <div class="cart-empty-text">Selecciona productos para comenzar</div>
          </div>
        </div>

        <!-- Cart Summary -->
        <div class="cart-summary" id="cart-summary">
          <div class="cart-sum-row">
            <span class="cart-sum-label">Subtotal</span>
            <span class="cart-sum-val" id="cart-subtotal">${sym}0.00</span>
          </div>
          <div class="cart-discount-row">
            <input type="number" class="cart-discount-input" id="cart-discount-val" placeholder="Descuento" min="0"
              onchange="POS.applyDiscount(this.value)" />
            <button class="cart-discount-type-btn active" id="disc-btn-pct" onclick="POS.setDiscountType('percent')">%</button>
            <button class="cart-discount-type-btn" id="disc-btn-fix" onclick="POS.setDiscountType('fixed')">${sym}</button>
          </div>
          <div class="cart-sum-row" id="cart-discount-row" style="display:none">
            <span class="cart-sum-label" style="color:var(--ps-orange)">Descuento</span>
            <span class="cart-sum-val" style="color:var(--ps-orange)" id="cart-discount-display">-${sym}0.00</span>
          </div>
          <div class="cart-sum-row total">
            <span>TOTAL</span>
            <span class="cart-sum-val" id="cart-total">${sym}0.00</span>
          </div>
          <textarea class="cart-notes-input" id="cart-notes" placeholder="Notas de la orden..." rows="1"
            onchange="POS.setNotes(this.value)"></textarea>
        </div>

        <!-- Actions -->
        <div class="cart-actions">
          <button class="btn-checkout" id="btn-checkout" onclick="POS.openPayment()" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            COBRAR
          </button>
          <button class="btn-hold" onclick="POS.holdOrder()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            Poner en espera
          </button>
        </div>
      </div>
    </div>
    `;
  };

  const renderProducts = () => {
    const all = DB.getProducts();
    let products = _activeCat === 'all'
      ? all
      : all.filter(p => p.categoryId === _activeCat);

    if(_searchQuery) {
      const q = _searchQuery.toLowerCase();
      products = products.filter(p => p.name.toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q));
    }

    if(!products.length) return `<div class="empty-state col-span-3"><div class="empty-icon" style="font-size:2.5rem;opacity:0.3">&#9898;</div><div class="empty-title">Sin resultados</div></div>`;

    const sym = DB.getSettings().currencySymbol;
    return products.map(p => {
      const priceText = p.sizes && p.sizes.length > 0
        ? `Desde ${sym}${p.sizes[0].price}`
        : `${sym}${p.basePrice}`;
      return `
        <div class="product-card ${p.available?'':'unavailable'} ${p.image?'has-image':''}" data-cat="${p.categoryId}"
             onclick="${p.available?`POS.tapProduct('${p.id}')`:''}" id="pc-${p.id}"
             style="${p.image ? `background-image:url(${escapeHtml(p.image)})` : ''}">
          ${!p.available ? '<div class="product-badge-top">Agotado</div>' : ''}
          <div class="product-card-body">
            <div class="product-name">${escapeHtml(p.name)}</div>
            ${p.description ? `<div class="product-desc">${escapeHtml(p.description)}</div>` : '<div class="product-desc"></div>'}
            <div class="product-footer">
              <div class="product-price">${priceText}</div>
              ${p.available ? `<button class="product-add-btn" onclick="event.stopPropagation();POS.tapProduct('${p.id}')">+</button>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  };

  /* ── Cart Rendering ── */
  const updateCartUI = () => {
    const cart = State.get('cart');
    const count = State.cart.count();
    const subtotal = State.cart.getSubtotal();
    const discount = State.cart.getDiscount();
    const total = State.cart.getTotal();
    const sym = DB.getSettings().currencySymbol;

    // Mobile bottom sheet: peek while browsing, auto-expand the moment an
    // item lands so the customer sees what they just added; auto-peek again
    // once the cart is cleared/checked out so the grid gets the screen back.
    if (window.matchMedia('(max-width:900px)').matches) {
      const panel = document.getElementById('pos-cart-panel');
      if (panel) {
        if (cart.items.length > 0 && !_cartExpanded) {
          _cartExpanded = true;
          panel.classList.remove('cart-collapsed');
        } else if (cart.items.length === 0 && _cartExpanded) {
          _cartExpanded = false;
          panel.classList.add('cart-collapsed');
        }
      }
    }

    const countEl = document.getElementById('cart-count');
    if(countEl) countEl.textContent = count;

    const checkoutBtn = document.getElementById('btn-checkout');
    if(checkoutBtn) checkoutBtn.disabled = count === 0;

    const cartItemsEl = document.getElementById('cart-items');
    const cartEmptyEl = document.getElementById('cart-empty');
    if(!cartItemsEl) return;

    if(cart.items.length === 0) {
      cartItemsEl.innerHTML = `<div class="cart-empty" id="cart-empty"><div class="cart-empty-icon" style="font-size:2.5rem;opacity:0.2">&#9776;</div><div class="cart-empty-text">Selecciona productos para comenzar</div></div>`;
    } else {
      cartItemsEl.innerHTML = cart.items.map(item => `
        <div class="cart-item" id="ci-${item._uid}">
          <div class="cart-item-accent"></div>
          <div class="cart-item-body">
            <div class="cart-item-name">${escapeHtml(item.name)}${item.size?` <span style="color:var(--text-muted);font-weight:400;font-size:0.75rem">(${escapeHtml(item.size)})</span>`:''}</div>
            ${item.mods && item.mods.length ? `<div class="cart-item-mods">+ ${item.mods.map(m=>escapeHtml(m.name)).join(', ')}</div>` : ''}
            ${item.notes ? `<div class="cart-item-mods">Nota: ${escapeHtml(item.notes)}</div>` : ''}
            <div class="cart-item-price">${sym}${item.subtotal.toFixed(2)}</div>
          </div>
          <div class="cart-item-actions">
            <button class="cart-qty-btn" onclick="POS.changeQty('${item._uid}',-1)">−</button>
            <span class="cart-qty">${item.qty}</span>
            <button class="cart-qty-btn" onclick="POS.changeQty('${item._uid}',1)">+</button>
            <button class="cart-del-btn" onclick="POS.removeItem('${item._uid}')">✕</button>
          </div>
        </div>
      `).join('');
    }

    const subtotalEl = document.getElementById('cart-subtotal');
    const totalEl    = document.getElementById('cart-total');
    const discRow    = document.getElementById('cart-discount-row');
    const discDisp   = document.getElementById('cart-discount-display');

    if(subtotalEl) subtotalEl.textContent = `${sym}${subtotal.toFixed(2)}`;
    if(totalEl)    totalEl.textContent    = `${sym}${total.toFixed(2)}`;
    if(discRow)    discRow.style.display  = discount > 0 ? 'flex' : 'none';
    if(discDisp)   discDisp.textContent   = `-${sym}${discount.toFixed(2)}`;

    // Hold orders bar
    updateHoldBar(cart.holdOrders || []);

    // Customer bar
    const custName = document.getElementById('cart-customer-name');
    if(custName) {
      if(cart.customerId) {
        const cust = DB.getCustomer(cart.customerId);
        custName.textContent = cust ? cust.name : 'Sin cliente';
      } else {
        custName.textContent = 'Sin cliente asignado';
      }
    }

    // Order type buttons
    ['llevar','delivery','mesa'].forEach(t => {
      const btn = document.getElementById(`ot-${t}`);
      if(btn) btn.classList.toggle('active', cart.type === t);
    });

    // Table bar (solo para pedidos tipo 'mesa')
    const tableBar = document.getElementById('cart-table-bar');
    if(tableBar) tableBar.style.display = cart.type === 'mesa' ? 'flex' : 'none';
    const tableName = document.getElementById('cart-table-name');
    if(tableName) {
      if(cart.tableId) {
        const t = DB.getTable(cart.tableId);
        tableName.textContent = t ? t.name : 'Mesa no encontrada';
      } else {
        tableName.textContent = 'Selecciona una mesa';
      }
    }
  };

  const updateHoldBar = (held) => {
    const bar = document.getElementById('hold-orders-bar');
    if(!bar) return;
    if(!held || held.length === 0) { bar.innerHTML = ''; return; }
    bar.innerHTML = held.map(h => `
      <div class="hold-order-chip" onclick="POS.resumeHold(${h.holdId})">
        🕒 En espera (${h.heldAt}) — ${h.items.length} items
      </div>
    `).join('');
  };

  /* ── Actions ── */
  const filterCat = (catId) => {
    _activeCat = catId;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === catId));
    const grid = document.getElementById('pos-products-grid');
    if(grid) grid.innerHTML = renderProducts();
  };

  const handleSearch = (q) => {
    _searchQuery = q;
    const grid = document.getElementById('pos-products-grid');
    if(grid) grid.innerHTML = renderProducts();
  };

  const setType = (type) => {
    State.patch('cart', { type });
    updateCartUI();
  };

  const tapProduct = (productId) => {
    const product = DB.getProduct(productId);
    if(!product) return;

    const hasSizes = product.sizes && product.sizes.length > 0;
    const hasExtras = product.extras && product.extras.length > 0;

    if(!hasSizes && !hasExtras) {
      State.cart.addItem(product);
      updateCartUI();
      Notify.beep(660, 60, 0.2);
      // Animate card
      const card = document.getElementById(`pc-${productId}`);
      if(card) { card.style.transform = 'scale(0.95)'; setTimeout(() => card.style.transform = '', 150); }
      return;
    }

    // Show modifier modal
    openModifierModal(product);
  };

  const openModifierModal = (product) => {
    const hasSizes = product.sizes && product.sizes.length > 0;
    const hasExtras = product.extras && product.extras.length > 0;
    let selectedSize = hasSizes ? product.sizes[0] : null;
    let selectedExtras = hasExtras ? product.extras.map(e => ({...e, selected:false})) : [];
    const sym = DB.getSettings().currencySymbol;

    const getPrice = () => {
      const base = selectedSize ? selectedSize.price : product.basePrice;
      const ext = selectedExtras.filter(e=>e.selected).reduce((s,e)=>s+e.price,0);
      return base + ext;
    };

    const buildModalBody = () => `
      <div class="modal-header">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:1.5rem" class="prod-svg-icon">${product.emoji || '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 22h20L12 2z"/></svg>'}</span>
          <div>
            <div class="modal-title">${escapeHtml(product.name)}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary)">${escapeHtml(product.description||'')}</div>
          </div>
        </div>
        <button class="modal-close" onclick="PizzaPos.ui.closeModal()">✕</button>
      </div>
      <div class="modal-body" id="mod-modal-body">
        ${hasSizes ? `
          <div class="mod-section">
            <div class="mod-section-title">Tamaño</div>
            <div class="mod-options" id="size-options">
              ${product.sizes.map((s,i) => `
                <div class="mod-option ${i===0?'selected':''}" onclick="POS._selectSize(${i})" id="sz-${i}">
                  ${escapeHtml(s.name)} <span class="mod-extra">${sym}${s.price}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        ${hasExtras ? `
          <div class="mod-section">
            <div class="mod-section-title">Extras (opcional)</div>
            <div class="mod-options" id="extra-options">
              ${product.extras.map((e,i) => `
                <div class="mod-option" onclick="POS._toggleExtra(${i})" id="ex-${i}">
                  ${escapeHtml(e.name)} <span class="mod-extra">+${sym}${e.price}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        <div class="mod-section">
          <div class="mod-section-title">Notas especiales</div>
          <input type="text" class="form-control form-control-sm" id="mod-notes" placeholder="Ej: sin picante, bien cocida..." />
        </div>
      </div>
      <div class="modal-footer" style="justify-content:space-between;align-items:center">
        <div style="font-size:1.25rem;font-weight:800;color:var(--ps-orange)" id="mod-price">${sym}${getPrice()}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" onclick="PizzaPos.ui.closeModal()">Cancelar</button>
          <button class="btn btn-primary" onclick="POS._confirmModifiers('${product.id}')">Agregar al carrito</button>
        </div>
      </div>
    `;

    PizzaPos.ui.showModal(buildModalBody());

    // Store state in closures via window._modState
    window._modState = { product, selectedSize, selectedExtras, getPrice };
  };

  // Select size in modifier modal
  window.POS = window.POS || {};
  const _selectSize = (idx) => {
    const { product, selectedExtras } = window._modState;
    window._modState.selectedSize = product.sizes[idx];
    document.querySelectorAll('[id^="sz-"]').forEach((el,i) => el.classList.toggle('selected', i===idx));
    const priceEl = document.getElementById('mod-price');
    if(priceEl) {
      const base = window._modState.selectedSize.price;
      const ext = (window._modState.selectedExtras||[]).filter(e=>e.selected).reduce((s,e)=>s+e.price,0);
      priceEl.textContent = `${DB.getSettings().currencySymbol}${(base+ext)}`;
    }
  };

  const _toggleExtra = (idx) => {
    window._modState.selectedExtras[idx].selected = !window._modState.selectedExtras[idx].selected;
    const el = document.getElementById(`ex-${idx}`);
    if(el) el.classList.toggle('selected', window._modState.selectedExtras[idx].selected);
    const priceEl = document.getElementById('mod-price');
    if(priceEl) {
      const base = window._modState.selectedSize ? window._modState.selectedSize.price : window._modState.product.basePrice;
      const ext = window._modState.selectedExtras.filter(e=>e.selected).reduce((s,e)=>s+e.price,0);
      priceEl.textContent = `${DB.getSettings().currencySymbol}${(base+ext)}`;
    }
  };

  const _confirmModifiers = (productId) => {
    const { product, selectedSize, selectedExtras } = window._modState;
    const notes = document.getElementById('mod-notes')?.value || '';
    State.cart.addItem(product, selectedSize, selectedExtras, notes);
    PizzaPos.ui.closeModal();
    updateCartUI();
    Notify.beep(660, 60, 0.2);
  };

  const changeQty = (uid, delta) => {
    const cart = State.get('cart');
    const item = cart.items.find(i => i._uid === uid);
    if(!item) return;
    State.cart.setQty(uid, item.qty + delta);
    updateCartUI();
  };

  const removeItem = (uid) => {
    State.cart.removeItem(uid);
    updateCartUI();
  };

  const clearCart = async () => {
    if(State.get('cart').items.length === 0) return;
    const ok = await Notify.confirm('Limpiar carrito', '¿Deseas vaciar el carrito actual?', {confirmClass:'btn-danger', confirmText:'Vaciar'});
    if(ok) { State.cart.clear(); updateCartUI(); }
  };

  const holdOrder = () => {
    if(State.get('cart').items.length === 0) { Notify.warning('Carrito vacío', 'Agrega productos primero'); return; }
    State.cart.hold();
    updateCartUI();
    Notify.info('Orden en espera', 'La orden fue guardada temporalmente');
  };

  const resumeHold = (holdId) => {
    State.cart.resumeHold(holdId);
    updateCartUI();
  };

  const applyDiscount = (val) => {
    State.patch('cart', { discount: parseFloat(val) || 0 });
    updateCartUI();
  };

  const setDiscountType = (type) => {
    State.patch('cart', { discountType: type });
    document.getElementById('disc-btn-pct')?.classList.toggle('active', type==='percent');
    document.getElementById('disc-btn-fix')?.classList.toggle('active', type==='fixed');
    updateCartUI();
  };

  const setNotes = (v) => State.patch('cart', { notes: v });

  const openCustomerSelect = () => {
    const customers = DB.getCustomers();
    const sym = DB.getSettings().currencySymbol;
    PizzaPos.ui.showModal(`
      <div class="modal-header"><div class="modal-title">👤 Seleccionar Cliente</div><button class="modal-close" onclick="PizzaPos.ui.closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="search-wrap mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="search" class="form-control search-input" placeholder="Buscar cliente..." oninput="POS._filterCustomers(this.value)" id="cust-search" />
        </div>
        <button class="btn btn-ghost btn-full mb-2" onclick="POS._selectCustomer(null)">✕ Sin cliente</button>
        <div id="cust-list">
          ${customers.map(c => `
            <button class="btn btn-ghost btn-full" style="justify-content:flex-start;gap:10px;margin-bottom:4px" onclick="POS._selectCustomer('${c.id}')">
              <div class="avatar avatar-sm av-orange">${escapeHtml(c.name[0])}</div>
              <div style="text-align:left"><div style="font-weight:600">${escapeHtml(c.name)}</div><div style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(c.phone)} · ${c.points} pts</div></div>
            </button>
          `).join('')}
        </div>
      </div>
    `, 'modal-sm');
  };

  const _filterCustomers = (q) => {
    const list = document.getElementById('cust-list');
    if(!list) return;
    const customers = DB.searchCustomers(q);
    list.innerHTML = customers.map(c => `
      <button class="btn btn-ghost btn-full" style="justify-content:flex-start;gap:10px;margin-bottom:4px" onclick="POS._selectCustomer('${c.id}')">
        <div class="avatar avatar-sm av-orange">${escapeHtml(c.name[0])}</div>
        <div style="text-align:left"><div style="font-weight:600">${escapeHtml(c.name)}</div><div style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(c.phone)} · ${c.points} pts</div></div>
      </button>
    `).join('');
  };

  const _selectCustomer = (id) => {
    State.patch('cart', { customerId: id });
    PizzaPos.ui.closeModal();
    updateCartUI();
  };

  const openTableSelect = () => {
    const cart = State.get('cart');
    const tables = DB.getTables().filter(t => t.status === 'free' || t.id === cart.tableId);
    PizzaPos.ui.showModal(`
      <div class="modal-header"><div class="modal-title">🪑 Seleccionar Mesa</div><button class="modal-close" onclick="PizzaPos.ui.closeModal()">✕</button></div>
      <div class="modal-body">
        ${tables.length === 0
          ? `<div class="empty-state" style="padding:20px;text-align:center;color:var(--text-muted)">No hay mesas libres en este momento.</div>`
          : tables.map(t => `
            <button class="btn btn-ghost btn-full" style="justify-content:space-between;margin-bottom:4px" onclick="POS._selectTable('${t.id}')">
              <span>${escapeHtml(t.name)}</span><span style="color:var(--text-muted)">Capacidad ${t.capacity ?? '—'}</span>
            </button>
          `).join('')}
      </div>
    `, 'modal-sm');
  };

  const _selectTable = (id) => {
    State.patch('cart', { tableId: id });
    PizzaPos.ui.closeModal();
    updateCartUI();
  };

  /* ── Payment Modal ── */
  const openPayment = () => {
    if(State.cart.count() === 0) return;
    const total = State.cart.getTotal();
    const sym = DB.getSettings().currencySymbol;
    let selectedMethod = 'cash';

    PizzaPos.ui.showModal(`
      <div class="modal-header"><div class="modal-title">💳 Cobrar Orden</div><button class="modal-close" onclick="PizzaPos.ui.closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="payment-total-display">
          <div class="payment-total-label">Total a cobrar</div>
          <div class="payment-total-amount">${sym}${total.toFixed(2)}</div>
        </div>
        <div class="payment-methods" id="payment-methods">
          <button class="payment-method-btn active" id="pm-cash" onclick="POS._selectPayMethod('cash')">
            <span class="pm-icon">💵</span><span class="pm-label">Efectivo</span>
          </button>
          <button class="payment-method-btn" id="pm-card" onclick="POS._selectPayMethod('card')">
            <span class="pm-icon">💳</span><span class="pm-label">Tarjeta</span>
          </button>
          <button class="payment-method-btn" id="pm-transfer" onclick="POS._selectPayMethod('transfer')">
            <span class="pm-icon">📲</span><span class="pm-label">Transferencia</span>
          </button>
          <button class="payment-method-btn" id="pm-mixed" onclick="POS._selectPayMethod('mixed')">
            <span class="pm-icon">🔀</span><span class="pm-label">Pago Mixto</span>
          </button>
        </div>
        <div class="cash-calc" id="cash-calc">
          <div class="cash-calc-title">Calculadora de cambio</div>
          <div class="cash-calc-row">
            <span style="color:var(--text-secondary)">Efectivo recibido</span>
            <input type="number" class="cash-input" id="cash-received" placeholder="0.00" step="0.01"
              oninput="POS._calcChange(${total})" value="" />
          </div>
          <div class="cash-calc-row">
            <span style="color:var(--text-secondary)">Cambio</span>
            <span class="change-amount" id="change-amount">${sym}0.00</span>
          </div>
          <div class="quick-amounts">
            ${[50,100,200,500].map(a => `<button class="quick-amt" onclick="POS._quickAmt(${a},${total})">${sym}${a}</button>`).join('')}
          </div>
        </div>
        <div class="cash-calc" id="mixed-calc" style="display:none">
          <div class="cash-calc-title">Dividir pago</div>
          <div class="cash-calc-row">
            <span style="color:var(--text-secondary)">💵 Efectivo</span>
            <input type="number" class="cash-input" id="mixed-cash" placeholder="0.00" step="0.01" min="0" oninput="POS._calcMixed(${total})" value="0" />
          </div>
          <div class="cash-calc-row">
            <span style="color:var(--text-secondary)">💳 Tarjeta</span>
            <input type="number" class="cash-input" id="mixed-card" placeholder="0.00" step="0.01" min="0" oninput="POS._calcMixed(${total})" value="0" />
          </div>
          <div class="cash-calc-row">
            <span style="color:var(--text-secondary)">📲 Transferencia</span>
            <input type="number" class="cash-input" id="mixed-transfer" placeholder="0.00" step="0.01" min="0" oninput="POS._calcMixed(${total})" value="0" />
          </div>
          <div class="cash-calc-row">
            <span style="color:var(--text-secondary)">Asignado / Total</span>
            <span class="change-amount" id="mixed-remaining">${sym}0.00 / ${sym}${total.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="PizzaPos.ui.closeModal()">Cancelar</button>
        <button class="btn btn-success btn-lg" onclick="POS.processPayment()">
          ✓ Confirmar Pago
        </button>
      </div>
    `);

    window._paymentState = { method: 'cash', total };
    setTimeout(() => document.getElementById('cash-received')?.focus(), 50);
  };

  const _selectPayMethod = (method) => {
    window._paymentState.method = method;
    document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`pm-${method}`)?.classList.add('active');
    const cashCalc = document.getElementById('cash-calc');
    if(cashCalc) cashCalc.style.display = method === 'cash' ? 'block' : 'none';
    const mixedCalc = document.getElementById('mixed-calc');
    if(mixedCalc) mixedCalc.style.display = method === 'mixed' ? 'block' : 'none';
  };

  const _calcMixed = (total) => {
    const cash = parseFloat(document.getElementById('mixed-cash')?.value) || 0;
    const card = parseFloat(document.getElementById('mixed-card')?.value) || 0;
    const transfer = parseFloat(document.getElementById('mixed-transfer')?.value) || 0;
    const assigned = cash + card + transfer;
    const sym = DB.getSettings().currencySymbol;
    const el = document.getElementById('mixed-remaining');
    if(el) {
      el.textContent = `${sym}${assigned.toFixed(2)} / ${sym}${total.toFixed(2)}`;
      el.style.color = Math.abs(assigned - total) < 0.01 ? 'var(--success)' : 'var(--danger)';
    }
  };

  const _calcChange = (total) => {
    const received = parseFloat(document.getElementById('cash-received')?.value) || 0;
    const change = received - total;
    const sym = DB.getSettings().currencySymbol;
    const el = document.getElementById('change-amount');
    if(el) {
      el.textContent = `${sym}${Math.max(0, change).toFixed(2)}`;
      el.style.color = change < 0 ? 'var(--danger)' : 'var(--success)';
    }
  };

  const _quickAmt = (amount, total) => {
    const inp = document.getElementById('cash-received');
    if(inp) { inp.value = amount; _calcChange(total); }
  };

  const processPayment = async () => {
    const { method, total } = window._paymentState || {};
    const cart = State.get('cart');
    const settings = DB.getSettings();

    // Cash validation
    if(method === 'cash') {
      const received = parseFloat(document.getElementById('cash-received')?.value) || 0;
      if(received < total) {
        Notify.error('Monto insuficiente', `El efectivo recibido (${settings.currencySymbol}${received.toFixed(2)}) es menor al total`);
        return;
      }
      window._paymentState.cashGiven = received;
      window._paymentState.cashChange = received - total;
    }

    // Mixed payment validation: lo asignado entre métodos debe cuadrar con el total
    if(method === 'mixed') {
      const mCash = parseFloat(document.getElementById('mixed-cash')?.value) || 0;
      const mCard = parseFloat(document.getElementById('mixed-card')?.value) || 0;
      const mTransfer = parseFloat(document.getElementById('mixed-transfer')?.value) || 0;
      const assigned = mCash + mCard + mTransfer;
      if(Math.abs(assigned - total) > 0.01) {
        Notify.error('Montos no cuadran', `Lo asignado (${settings.currencySymbol}${assigned.toFixed(2)}) debe ser igual al total (${settings.currencySymbol}${total.toFixed(2)})`);
        return;
      }
      window._paymentState.mixedBreakdown = { cash: mCash, card: mCard, transfer: mTransfer };
    }

    // Mesa requiere una mesa asignada antes de cobrar
    if(cart.type === 'mesa' && !cart.tableId) {
      Notify.error('Selecciona una mesa', 'Debes asignar una mesa antes de cobrar esta orden');
      return;
    }

    // Build & save order
    const subtotal = State.cart.getSubtotal();
    const discount = State.cart.getDiscount();
    const tax = State.cart.getTax();

    const order = await DB.createOrder({
      type: cart.type, customerId: cart.customerId, tableId: cart.tableId || null,
      items: cart.items.map(({_key, _uid, ...rest}) => rest),
      subtotal, discount, discountType: cart.discountType,
      tax, total, paymentMethod: method,
      cashGiven: window._paymentState.cashGiven || null,
      cashChange: window._paymentState.cashChange || null,
      mixedBreakdown: window._paymentState.mixedBreakdown || null,
      notes: cart.notes, status: 'open', cashierId: State.get('currentUser')?.id
    });

    // Ocupar la mesa con esta orden
    if(cart.type === 'mesa' && cart.tableId) {
      const t = DB.getTable(cart.tableId);
      if(t) await DB.saveTable({ ...t, status:'occupied', orderId: order.id });
    }

    // Update customer points
    if(cart.customerId) {
      const cust = DB.getCustomer(cart.customerId);
      if(cust) {
        const pts = Math.floor(total / 10);
        DB.saveCustomer({ ...cust, points: cust.points + pts, totalSpent: cust.totalSpent + total, visits: cust.visits + 1 });
      }
    }

    // Deduct Inventory based on Direct Link or Recipes
    const lowStockAlerts = [];
    cart.items.forEach(item => {
      const prod = DB.getProduct(item.productId);
      
      let deductedDirectly = false;
      
      // 1. If product is linked directly to an inventory item (e.g. Beverages)
      if (prod && prod.inventoryId) {
        const invItem = DB.getInventoryItem(prod.inventoryId);
        if (invItem) {
          invItem.currentStock = Math.max(0, invItem.currentStock - item.qty);
          DB.saveInventoryItem(invItem);
          if (invItem.currentStock <= invItem.minStock) {
            lowStockAlerts.push(`${escapeHtml(invItem.name)} (${invItem.currentStock.toFixed(0)} ${escapeHtml(invItem.unit)} restantes)`);
          }
          deductedDirectly = true;
        }
      }

      // 2. Fallback for beverages without explicit link (match by name)
      const isBeverage = prod && (prod.categoryId === 'c3' || prod.categoryId === 'bebidas' || prod.name.toLowerCase().includes('coca cola') || prod.name.toLowerCase().includes('fanta') || prod.name.toLowerCase().includes('agua'));
      if (!deductedDirectly && isBeverage) {
        const invItem = DB.getBeverageInventory().find(i => i.name === prod.name);
        if (invItem) {
          invItem.currentStock = Math.max(0, invItem.currentStock - item.qty);
          DB.saveInventoryItem(invItem);
          if (invItem.currentStock <= invItem.minStock) {
            lowStockAlerts.push(`${escapeHtml(invItem.name)} (${invItem.currentStock.toFixed(0)} ${escapeHtml(invItem.unit)} restantes)`);
          }
          deductedDirectly = true;
        }
      }

      // 3. Deduct by recipe (if not fully deducted as a simple 1-to-1 item, or even if it was, maybe it has a recipe)
      if (!deductedDirectly) {
        const recipe = DB.getRecipe(item.productId, item.size || '');
        if (recipe && recipe.ingredients) {
          recipe.ingredients.forEach(ing => {
            const invItem = DB.getInventoryItem(ing.inventoryId);
            if (invItem) {
              invItem.currentStock = Math.max(0, invItem.currentStock - (ing.qty * item.qty));
              DB.saveInventoryItem(invItem);
              if (invItem.currentStock <= invItem.minStock) {
                lowStockAlerts.push(`${escapeHtml(invItem.name)} (${invItem.currentStock.toFixed(2)} ${escapeHtml(invItem.unit)} restantes)`);
              }
            }
          });
        }
      }
    });

    if(lowStockAlerts.length > 0) {
      const uniqueAlerts = [...new Set(lowStockAlerts)];
      Notify.warning('⚠️ Stock Bajo', uniqueAlerts.join(', '));
    }

    PizzaPos.ui.closeModal();
    State.cart.clear();
    updateCartUI();
    PizzaPos.updateHeaderStats();
    
    // Update kitchen badge immediately
    const kitchenActive = DB.getActiveOrders().filter(o => ['open', 'cooking', 'ready'].includes(o.status)).length;
    PizzaPos.updateNavBadge('kitchen', kitchenActive);

    // Show success + print option
    const sym = settings.currencySymbol;
    const changeStr = window._paymentState.cashChange > 0 ? `<br><br>Cambio: <strong>${sym}${(window._paymentState.cashChange||0).toFixed(2)}</strong>` : '';
    PizzaPos.ui.showModal(`
      <div class="modal-body" style="text-align:center;padding:32px">
        <div style="margin-bottom:12px;color:var(--success)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="64" height="64"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg></div>
        <div style="font-size:1.5rem;font-weight:800;color:var(--success)">¡Pago recibido!</div>
        <div style="margin-top:8px;color:var(--text-secondary)">Orden #${order.number} — ${sym}${total.toFixed(2)}${changeStr}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="PizzaPos.ui.closeModal()">Cerrar</button>
        <button class="btn btn-primary" onclick="Printer.print(${JSON.stringify(order).replace(/\"/g, '&quot;')}); PizzaPos.ui.closeModal()">
          Imprimir Ticket
        </button>
      </div>
    `, 'modal-sm');

    Notify.soundSuccess();
    Notify.success('Pago completado', `Orden #${order.number} procesada exitosamente`);
  };

  /* Mobile-only: toggles the order/cart bottom-sheet between peek and expanded */
  const toggleCartSheet = () => {
    _cartExpanded = !_cartExpanded;
    document.getElementById('pos-cart-panel')?.classList.toggle('cart-collapsed', !_cartExpanded);
  };

  /* ── Init & Destroy ── */
  let _offCartUpdate = null;
  const init = () => {
    if(_offCartUpdate) _offCartUpdate();
    _offCartUpdate = State.on('cart:updated', updateCartUI);
    updateCartUI(); // Force render on load
  };
  
  const destroy = () => {
    if(_offCartUpdate) { _offCartUpdate(); _offCartUpdate = null; }
  };

  return {
    render, init, destroy, filterCat, handleSearch, setType, tapProduct, toggleCartSheet,
    openModifierModal, _selectSize, _toggleExtra, _confirmModifiers,
    changeQty, removeItem, clearCart, holdOrder, resumeHold,
    applyDiscount, setDiscountType, setNotes,
    openCustomerSelect, _filterCustomers, _selectCustomer,
    openTableSelect, _selectTable,
    openPayment, _selectPayMethod, _calcChange, _quickAmt, processPayment
  };
})();
