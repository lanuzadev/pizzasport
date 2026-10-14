/* ═══════════════════════════════════════════════════════════
   state.js — Reactive Global State
   ═══════════════════════════════════════════════════════════ */
const State = (() => {
  const _defaultCart = { items:[], type:'mesa', tableId:null, customerId:null, discount:0, discountType:'percent', notes:'', holdOrders:[] };
  
  let _state = {
    currentUser: null,
    currentRoute: 'pos',
    cart: _defaultCart,
    kitchenOrders: [],
    sidebarExpanded: false,
    selectedTable: null,
    cashSession: null,
  };

  const _listeners = {};

  const on = (event, fn) => {
    if(!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
    return () => off(event, fn);
  };
  const off = (event, fn) => {
    if(_listeners[event]) _listeners[event] = _listeners[event].filter(f => f !== fn);
  };
  const emit = (event, data) => {
    (_listeners[event] || []).forEach(fn => fn(data));
  };

  const get = k => k ? _state[k] : {..._state};
  const set = (k, v) => {
    const old = _state[k];
    _state[k] = typeof v === 'function' ? v(old) : v;
    if (k === 'cart' && window.DB) window.DB.setRaw('active_cart', _state[k]);
    emit('change:'+k, _state[k]);
    emit('change', { key:k, value:_state[k] });
  };
  const patch = (k, v) => {
    _state[k] = { ..._state[k], ...v };
    if (k === 'cart' && window.DB) window.DB.setRaw('active_cart', _state[k]);
    emit('change:'+k, _state[k]);
    emit('change', { key:k, value:_state[k] });
  };

  /* ── Cart Helpers ── */
  const cart = {
    addItem(product, size=null, extras=[], notes='') {
      const items = [..._state.cart.items];
      const unitPrice = size ? size.price : product.basePrice;
      const mods = extras.filter(e => e.selected).map(e => ({ name: e.name, price: e.price }));
      const extraCost = mods.reduce((s,m) => s + m.price, 0);
      const finalPrice = unitPrice + extraCost;

      const key = `${product.id}|${size?.name||''}|${mods.map(m=>m.name).join(',')}`;
      const existing = items.find(i => i._key === key);

      if(existing && !notes) {
        existing.qty++;
        existing.subtotal = existing.qty * existing.unitPrice;
      } else {
        items.push({
          _key:key, _uid: Date.now()+'_'+Math.random().toString(36).slice(2),
          productId:product.id, name:product.name, emoji:product.emoji||'🍕',
          size:size?.name||null, mods, notes,
          qty:1, unitPrice:finalPrice, subtotal:finalPrice
        });
      }
      set('cart', {..._state.cart, items});
      emit('cart:updated', _state.cart);
    },

    removeItem(uid) {
      const items = _state.cart.items.filter(i => i._uid !== uid);
      set('cart', {..._state.cart, items});
      emit('cart:updated', _state.cart);
    },

    setQty(uid, qty) {
      if(qty <= 0) { cart.removeItem(uid); return; }
      const items = _state.cart.items.map(i => i._uid===uid ? {...i, qty, subtotal:i.unitPrice*qty} : i);
      set('cart', {..._state.cart, items});
      emit('cart:updated', _state.cart);
    },

    clear() {
      set('cart', { items:[], type:'mesa', tableId:null, customerId:null, discount:0, discountType:'percent', notes:'', holdOrders:_state.cart.holdOrders||[] });
      emit('cart:updated', _state.cart);
    },

    hold() {
      if(_state.cart.items.length === 0) return;
      const held = [...(_state.cart.holdOrders||[])];
      const { holdOrders: _discard, ...cartDataToHold } = _state.cart;
      held.push({ ...cartDataToHold, holdId: Date.now(), heldAt: new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}) });
      set('cart', { items:[], type:'mesa', tableId:null, customerId:null, discount:0, discountType:'percent', notes:'', holdOrders:held });
      emit('cart:updated', _state.cart);
    },

    resumeHold(holdId) {
      const held = _state.cart.holdOrders || [];
      const target = held.find(h => h.holdId === holdId);
      if(!target) return;
      if(_state.cart.items.length > 0) cart.hold();
      
      // Re-fetch holdOrders since cart.hold() adds a new one
      const updatedHeld = _state.cart.holdOrders || [];
      const remaining = updatedHeld.filter(h => h.holdId !== holdId);
      
      const { holdOrders: _discard, ...targetData } = target;
      set('cart', { ...targetData, holdOrders: remaining });
      emit('cart:updated', _state.cart);
    },

    getSubtotal() {
      return _state.cart.items.reduce((s,i) => s + i.subtotal, 0);
    },

    getDiscount() {
      const sub = cart.getSubtotal();
      const { discount, discountType } = _state.cart;
      if(!discount || discount <= 0) return 0;
      return discountType === 'percent' ? sub * (Math.min(discount, 100)/100) : Math.min(discount, sub);
    },

    getTotal() {
      const settings = DB.getSettings();
      const sub = cart.getSubtotal();
      const disc = cart.getDiscount();
      const tax = settings.taxEnabled ? (sub-disc) * (settings.taxRate/100) : 0;
      return sub - disc + tax;
    },

    getTax() {
      const settings = DB.getSettings();
      if(!settings.taxEnabled) return 0;
      return (cart.getSubtotal() - cart.getDiscount()) * (settings.taxRate/100);
    },

    count() { return _state.cart.items.reduce((s,i) => s+i.qty, 0); }
  };

  return { get, set, patch, on, off, emit, cart };
})();
