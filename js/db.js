/* ═══════════════════════════════════════════════════════════
   db.js — Data Layer: localStorage + Mock Data
   ═══════════════════════════════════════════════════════════ */
const DB = (() => {
  let _store = {};
  let _pollInterval = null;

  /* ── Auth: token de sesión emitido por POST /api/login ── */
  let _authToken = null;
  try { _authToken = localStorage.getItem('ps_auth_token'); } catch(e) {}
  let _authExpiredNotified = false;

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    ...(_authToken ? { 'Authorization': `Bearer ${_authToken}` } : {})
  });

  const handleUnauthorized = () => {
    if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
    if (_authExpiredNotified) return;
    _authExpiredNotified = true;
    _authToken = null;
    try { localStorage.removeItem('ps_auth_token'); } catch(e) {}
    window.dispatchEvent(new CustomEvent('auth-expired'));
  };

  const login = async (userId, pin) => {
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, pin })
      });
      const data = await res.json();
      if (!res.ok) return { success:false, error: data.error || 'No se pudo iniciar sesión' };
      _authToken = data.token;
      _authExpiredNotified = false;
      try { localStorage.setItem('ps_auth_token', _authToken); } catch(e) {}
      return { success:true, user: data.user };
    } catch(e) {
      return { success:false, error:'No se pudo conectar al servidor' };
    }
  };

  const logout = () => {
    if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
    if (_authToken) fetch('/api/logout', { method:'POST', headers: authHeaders() }).catch(()=>{});
    _authToken = null;
    _authExpiredNotified = false;
    try { localStorage.removeItem('ps_auth_token'); } catch(e) {}
  };

  // Lista pública (sin PIN) para la pantalla de selección de usuario, antes de iniciar sesión.
  const fetchLoginUsers = async () => {
    try {
      const res = await fetch('/api/login-users');
      if (res.ok) return await res.json();
    } catch(e) { console.warn('No se pudo obtener la lista de usuarios:', e); }
    return [];
  };

  // fetch autenticado genérico, para llamadas puntuales fuera de get/set (ej. /api/reset)
  const apiFetch = (path, options={}) => fetch(path, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers||{}) }
  }).then(r => { if (r.status === 401) handleUnauthorized(); return r; });

  // Upsert/delete de UN item dentro de un array-key (orders, inventory) sin
  // sobreescribir el array completo — evita perder ediciones concurrentes de
  // otro dispositivo a OTROS items del mismo array. Devuelve false si no se
  // pudo confirmar contra el servidor (el caller decide el fallback).
  const syncItem = async (key, item, op='upsert') => {
    try {
      const res = await apiFetch('/api/sync-item', {
        method: 'POST',
        body: JSON.stringify({ key, item, op })
      });
      return res.ok;
    } catch(e) {
      return false;
    }
  };

  let _syncFailing = false;
  const get = k => {
    return _store[k] ?? null;
  };
  const set = (k,v) => {
    _store[k] = v;

    // Sync to SQLite backend
    fetch('/api/sync', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ key: k, value: v })
    }).then(r => {
      if (r.status === 401) { handleUnauthorized(); return; }
      if (r.ok) _syncFailing = false;
    }).catch(e => {
      console.warn('Backend sync failed:', e);
      // Avisar una sola vez por episodio de desconexión, no en cada escritura fallida
      if (!_syncFailing) {
        _syncFailing = true;
        if (typeof Notify !== 'undefined') {
          Notify.warning('Sin conexión con el servidor', 'Los cambios no se están guardando — revisa la red', 5000);
        }
      }
    });
  };

  /* ── Default Data ── */
  const DEFAULTS = {
    settings: {
      bizName:'PizzaSport', bizAddress:'Dirección del local', bizPhone:'Teléfono',
      bizEmail:'', bizRFC:'', currency:'Córdoba', currencySymbol:'C$',
      taxRate:0, taxEnabled:false, ticketFooter:'¡Gracias por su visita! 🍕',
      ticketHeader:'', ticketLogo:'assets/pizzamono.png', ticketSlogan:'🍕 PizzaSport — Siempre fresca, siempre deliciosa', printCopies:1, primaryColor:'#E8231A',
      soundEnabled:true, theme:'dark',
      printerBridgeName:'AndroidPrinter', printerPaperWidth:'80', printerAutoCut:true, printerOpenDrawer:false,
      printerCharset:'PC437', printerFeedLines:4, ticketMarginMM:2, ticketOffsetXMM:0,
      printerCharsPerLine:0, printerFontSize:'normal', ticketLogoSizeMM:24,
      kitchenTimerMinutes:30, vipThreshold:1000
    },
    users: [],
    categories: [
      { id:'c1', name:'Pizzas', icon:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pizza"><path d="m12 14-1 1"></path><path d="m13.75 18.25-1.25 1.42"></path><path d="M17.775 5.654a15.68 15.68 0 0 0-12.121 12.12"></path><path d="M18.8 9.3a1 1 0 0 0 2.1 7.7"></path><path d="M21.964 20.732a1 1 0 0 1-1.232 1.232l-18-5a1 1 0 0 1-.695-1.232A19.68 19.68 0 0 1 15.732 2.037a1 1 0 0 1 1.232.695z"></path></svg>', order:1 },
      { id:'c2', name:'Slice', icon:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pizza"><path d="m12 14-1 1"></path><path d="m13.75 18.25-1.25 1.42"></path><path d="M17.775 5.654a15.68 15.68 0 0 0-12.121 12.12"></path><path d="M18.8 9.3a1 1 0 0 0 2.1 7.7"></path><path d="M21.964 20.732a1 1 0 0 1-1.232 1.232l-18-5a1 1 0 0 1-.695-1.232A19.68 19.68 0 0 1 15.732 2.037a1 1 0 0 1 1.232.695z"></path></svg>', order:2 },
      { id:'c3', name:'Bebidas', icon:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cup-soda"><path d="m8 22 1-15h6l1 15"/><path d="M7 7h10"/><path d="M12 2v5"/></svg>', order:3 },
      { id:'c4', name:'Extras', icon:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>', order:4 }
    ],
    products: [
      // PIZZAS
      { id:'p1', name:'Pizza Clásica', categoryId:'c1', basePrice:230, description:'Jamón y queso', available:true, image:'assets/pizza_classic.png',
        sizes:[{name:'Mediana',price:230},{name:'Grande',price:320}], extras:[] },
      { id:'p2', name:'Pizza de Peperoni', categoryId:'c1', basePrice:250, description:'Jamón y peperoni', available:true, image:'assets/pizza_pepperoni.png',
        sizes:[{name:'Mediana',price:250},{name:'Grande',price:340}], extras:[] },
      { id:'p3', name:'Pizza de Tres Carnes', categoryId:'c1', basePrice:260, description:'Jamón-peperoni-salami', available:true,
        sizes:[{name:'Mediana',price:260},{name:'Grande',price:350}], extras:[] },
      { id:'p4', name:'Pizza Hawaiana', categoryId:'c1', basePrice:270, description:'Jamón y piña', available:true,
        sizes:[{name:'Mediana',price:270},{name:'Grande',price:360}], extras:[] },
      { id:'p5', name:'Pizza Vegetariana', categoryId:'c1', basePrice:290, description:'Hongos-aceitunas-tomate-cebolla', available:true,
        sizes:[{name:'Mediana',price:290},{name:'Grande',price:360}], extras:[] },
      { id:'p6', name:'Pizza de Hongos', categoryId:'c1', basePrice:280, description:'Jamón con hongos', available:true,
        sizes:[{name:'Mediana',price:280},{name:'Grande',price:350}], extras:[] },
      { id:'p7', name:'Pizza Especial', categoryId:'c1', basePrice:310, description:'Jamón-peperoni-salami-hongos-aceitunas-cebolla-chiltoma', available:true,
        sizes:[{name:'Mediana',price:310},{name:'Grande',price:380}], extras:[] },
      { id:'p8', name:'Pizza Pinolera', categoryId:'c1', basePrice:290, description:'Frijoles molidos-salchichón picante/chorizo criollo-cebolla-chiltoma', available:true,
        sizes:[{name:'Mediana',price:290},{name:'Grande',price:360}], extras:[] },
      { id:'p9', name:'Cheesy Crust', categoryId:'c1', basePrice:40, description:'Borde de queso', available:true,
        sizes:[{name:'Mediana',price:40},{name:'Grande',price:60}], extras:[] },
      
      // SLICE
      { id:'p10', name:'Slice Jamón', categoryId:'c2', basePrice:32, description:'', available:true, image:'assets/pizza_slice.png', sizes:[], extras:[] },
      { id:'p11', name:'Slice Hawaiana', categoryId:'c2', basePrice:35, description:'', available:true, sizes:[], extras:[] },
      { id:'p12', name:'Empaque Slice', categoryId:'c2', basePrice:30, description:'', available:true, sizes:[], extras:[] },

      // BEBIDAS
      { id:'p13', name:'Gaseosa 12 onz', categoryId:'c3', basePrice:22, description:'', available:true, sizes:[], extras:[] },
      { id:'p15', name:'Coca Cola 2.5L', categoryId:'c3', basePrice:60, description:'', available:true, image:'assets/drink_soda.png', sizes:[], extras:[], inventoryId: 'inv4' },
      { id:'p16', name:'Fanta 2.5L', categoryId:'c3', basePrice:60, description:'', available:true, image:'assets/drink_soda.png', sizes:[], extras:[], inventoryId: 'inv5' },
      { id:'p17', name:'Agua Embotellada', categoryId:'c3', basePrice:25, description:'', available:true, image:'assets/drink_soda.png', sizes:[], extras:[], inventoryId: 'inv6' },
      { id:'p20', name:'Jamón/Peperoni/Salami', categoryId:'c4', basePrice:30, description:'', available:true, sizes:[], extras:[] },
      { id:'p21', name:'Cebolla y Chiltoma', categoryId:'c4', basePrice:30, description:'', available:true, sizes:[], extras:[] },
      { id:'p22', name:'Aceitunas', categoryId:'c4', basePrice:35, description:'', available:true, sizes:[], extras:[] }
    ],
    tables: [
      { id:'t1', name:'Mesa 1', capacity:4, status:'free', orderId:null, x:10, y:10 },
      { id:'t2', name:'Mesa 2', capacity:4, status:'free', orderId:null, x:10, y:40 },
      { id:'t3', name:'Mesa 3', capacity:6, status:'free', orderId:null, x:10, y:70 },
      { id:'t4', name:'Mesa 4', capacity:4, status:'free', orderId:null, x:40, y:10 },
      { id:'t5', name:'Mesa 5', capacity:4, status:'free', orderId:null, x:40, y:40 },
      { id:'t6', name:'Mesa 6', capacity:2, status:'free', orderId:null, x:40, y:70 },
      { id:'t7', name:'Mesa 7', capacity:6, status:'free', orderId:null, x:70, y:10 },
      { id:'t8', name:'Mesa 8', capacity:8, status:'free', orderId:null, x:70, y:40 },
      { id:'t9', name:'Barra 1', capacity:2, status:'free', orderId:null, x:70, y:70 },
      { id:'t10',name:'Barra 2', capacity:2, status:'free', orderId:null, x:70, y:88 }
    ],
    customers: [],
    inventory: [
      { id: 'inv1', name: 'Salsa para pizza', unit: 'Oz', currentStock: 150, minStock: 20, type: 'raw', cost: 1.2 },
      { id: 'inv2', name: 'Queso Mozzarella', unit: 'Lbs', currentStock: 20, minStock: 5, type: 'raw', cost: 90 },
      { id: 'inv3', name: 'Jamón', unit: 'Lbs', currentStock: 10, minStock: 2, type: 'raw', cost: 75 },
      { id: 'inv4', name: 'Coca Cola 2.5L', unit: 'Unidades', currentStock: 24, minStock: 6, type: 'beverage', cost: 42 },
      { id: 'inv5', name: 'Fanta 2.5L', unit: 'Unidades', currentStock: 12, minStock: 6, type: 'beverage', cost: 42 },
      { id: 'inv6', name: 'Agua Embotellada', unit: 'Unidades', currentStock: 48, minStock: 12, type: 'beverage', cost: 10 }
    ],
    recipes: [
      { id: 'rec1', productId: 'p1', sizeName: 'Grande', ingredients: [{inventoryId: 'inv1', qty: 1.5}, {inventoryId: 'inv2', qty: 0.75}, {inventoryId: 'inv3', qty: 0.36}] }
    ],
    orders: [],
    cashSessions: [],
    campaigns: [],
    orderCounter: 1
  };

  /* ── Init & Polling: fetch backend data and sync ──
     Se llama DESPUÉS de un login exitoso (/api/state requiere sesión).
     Antes del login, la única llamada válida es fetchLoginUsers(). ── */
  const initFull = async () => {
    try {
      const res = await fetch('/api/state', { headers: authHeaders() });
      if(res.status === 401) { handleUnauthorized(); return; }
      if(res.ok) {
        const state = await res.json();
        Object.keys(state).forEach(k => {
          _store[k] = state[k];
        });
      }
    } catch(e) {
      console.warn('Backend server not reachable, using in-memory defaults');
    }

    // Start polling every 5 seconds to sync data across devices
    if(_pollInterval) clearInterval(_pollInterval);
    _pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/state', { headers: authHeaders() });
        if(res.status === 401) { handleUnauthorized(); return; }
        if(res.ok) {
          const state = await res.json();
          Object.keys(state).forEach(k => _store[k] = state[k]);
          window.dispatchEvent(new CustomEvent('db-update'));
        }
      } catch(e) {}
    }, 5000);
    // Let the loop below seed defaults only if they are missing
    Object.keys(DEFAULTS).forEach(k => {
      if(get(k) === null) set(k, DEFAULTS[k]);
    });
    if(!get('orders') || get('orders').length === 0) {
      set('orders', []);
    }
  };

  /* ── Generate realistic demo orders ── */
  const _generateDemoOrders = () => {
    const orders = [];
    const products = DEFAULTS.products;
    const now = new Date();
    let id = 1;

    // Generate 30 days of orders
    for(let d = 29; d >= 0; d--) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      const numOrders = Math.floor(Math.random()*8) + 3;

      for(let o = 0; o < numOrders; o++) {
        const hour = Math.floor(Math.random()*10) + 11; // 11am-9pm
        const min  = Math.floor(Math.random()*60);
        date.setHours(hour, min, 0, 0);

        const numItems = Math.floor(Math.random()*3) + 1;
        const items = [];
        let subtotal = 0;

        for(let i = 0; i < numItems; i++) {
          const p = products[Math.floor(Math.random()*products.length)];
          const qty = Math.random() > 0.7 ? 2 : 1;
          const price = p.sizes && p.sizes.length > 0
            ? p.sizes[Math.floor(Math.random()*p.sizes.length)].price
            : p.basePrice;
          subtotal += price * qty;
          items.push({ productId:p.id, name:p.name, qty, unitPrice:price, subtotal:price*qty, emoji:p.emoji, mods:[], notes:'' });
        }

        const discount = Math.random() > 0.8 ? subtotal*0.1 : 0;
        const total = subtotal - discount;
        const methods = ['cash','card','transfer'];
        const method = methods[Math.floor(Math.random()*methods.length)];
        const types = ['mesa','llevar','delivery'];
        const type = types[Math.floor(Math.random()*types.length)];

        orders.push({
          id: `ord-${id}`, number: id,
          type, tableId: type==='mesa' ? `t${Math.floor(Math.random()*8)+1}` : null,
          customerId: Math.random()>0.5 ? `cl${Math.floor(Math.random()*5)+1}` : null,
          items, subtotal: Math.round(subtotal*100)/100,
          discount: Math.round(discount*100)/100,
          discountType: discount>0?'percent':null,
          total: Math.round(total*100)/100,
          status:'paid', paymentMethod:method,
          createdAt:date.toISOString(), closedAt:date.toISOString(),
          cashierId:'u1', notes:''
        });
        id++;
      }
    }
    return orders;
  };

  /* ── CRUD Helpers ── */
  const getAll   = k => get(k) || [];
  const getById  = (k,id) => getAll(k).find(i => i.id === id) || null;
  const create   = (k,item) => { const arr = getAll(k); arr.push(item); set(k,arr); return item; };
  const update   = (k,id,data) => {
    const arr = getAll(k);
    const idx = arr.findIndex(i => i.id === id);
    if(idx < 0) return null;
    arr[idx] = {...arr[idx], ...data};
    set(k,arr);
    return arr[idx];
  };
  const remove2  = (k,id) => { const arr = getAll(k).filter(i => i.id !== id); set(k,arr); };
  const nextId   = k => `${k}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;

  /* ── Order Number ──
     Server-autoritativo: evita números duplicados cuando dos tablets
     hacen checkout dentro de la misma ventana de poll (5s). Si el
     servidor no responde, cae al contador local (puede colisionar,
     pero permite seguir vendiendo sin conexión). ── */
  const nextOrderNumber = async () => {
    try {
      const res = await apiFetch('/api/next-order-number', { method:'POST' });
      if(res.ok) {
        const data = await res.json();
        _store.orderCounter = data.number + 1; // mantiene el caché local razonable
        return data.number;
      }
    } catch(e) {}
    const n = (get('orderCounter') || 1);
    set('orderCounter', n+1);
    return n;
  };

  /* ── Public API ── */
  return {
    init: initFull,
    // Auth
    login, logout, fetchLoginUsers, apiFetch,
    // IDs
    nextId,
    // Settings
    getSettings: () => get('settings') || DEFAULTS.settings,
    saveSettings: s => set('settings', s),
    // Users
    getUsers:   () => getAll('users'),
    getUser:    id => getById('users', id),
    createUser: u  => create('users', {...u, id:nextId('u')}),
    updateUser: (id,d) => update('users', id, d),
    deleteUser: id => remove2('users', id),
    // Categories
    getCategories: () => getAll('categories').sort((a,b) => a.order-b.order),
    saveCategory:  c => c.id ? update('categories',c.id,c) : create('categories',{...c,id:nextId('c')}),
    deleteCategory:id => remove2('categories',id),
    // Products
    getProducts:    () => getAll('products'),
    getProduct:     id => getById('products',id),
    // products usa merge por-item: los productos pueden traer fotos en
    // base64 (varias decenas de KB c/u) — sincronizar el array completo en
    // cada edición (hasta un simple toggle de disponibilidad) reenviaría
    // TODAS las fotos de TODOS los productos cada vez.
    saveProduct: async (p) => {
      const product = p.id ? p : { ...p, id: nextId('p') };
      const arr = getAll('products');
      const idx = arr.findIndex(x => x.id === product.id);
      if(idx > -1) arr[idx] = product; else arr.push(product);
      _store.products = arr;
      const synced = await syncItem('products', product, 'upsert');
      if(!synced) set('products', arr);
      return product;
    },
    deleteProduct: async (id) => {
      const arr = getAll('products').filter(x => x.id !== id);
      _store.products = arr;
      const synced = await syncItem('products', {id}, 'delete');
      if(!synced) set('products', arr);
    },
    getByCategory:  cid => getAll('products').filter(p => p.categoryId===cid && p.available),
    // Tables
    getTables:  () => getAll('tables'),
    getTable:   id => getById('tables', id),
    // tables usa merge por-item (igual que products/inventory/orders): dos
    // meseros sentando/liberando mesas distintas desde tablets distintas en
    // la misma ventana de poll (5s) ya no pueden pisarse entre sí.
    saveTable: async (t) => {
      const table = t.id ? t : { ...t, id: nextId('t') };
      const arr = getAll('tables');
      const idx = arr.findIndex(x => x.id === table.id);
      if(idx > -1) arr[idx] = table; else arr.push(table);
      _store.tables = arr;
      const synced = await syncItem('tables', table, 'upsert');
      if(!synced) set('tables', arr);
      return table;
    },
    deleteTable: async (id) => {
      const arr = getAll('tables').filter(x => x.id !== id);
      _store.tables = arr;
      const synced = await syncItem('tables', {id}, 'delete');
      if(!synced) set('tables', arr);
    },
    // Customers
    getCustomers: () => getAll('customers'),
    getCustomer:  id => getById('customers',id),
    saveCustomer: c => c.id ? update('customers',c.id,c) : create('customers',{...c,id:nextId('cl')}),
    deleteCustomer:id => remove2('customers',id),
    searchCustomers: q => getAll('customers').filter(c =>
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      c.phone.includes(q) || (c.email||'').toLowerCase().includes(q.toLowerCase())
    ),
    // Orders
    getOrders:     () => getAll('orders'),
    getOrder:      id => getById('orders',id),
    getActiveOrders:() => getAll('orders').filter(o => ['open', 'cooking', 'ready'].includes(o.status)),
    getOrdersToday:() => {
      const today = new Date().toDateString();
      return getAll('orders').filter(o => new Date(o.createdAt).toDateString() === today);
    },
    // orders usa merge por-item (POST /api/sync-item) en vez de sobreescribir
    // el array completo: dos tablets creando/editando pedidos distintos en la
    // misma ventana de poll (5s) ya no pueden pisarse entre sí.
    createOrder:   async (o) => {
      const number = await nextOrderNumber();
      const order = { status:'open', ...o, id:nextId('ord'), number, createdAt:new Date().toISOString() };
      const arr = getAll('orders');
      arr.push(order);
      _store.orders = arr; // reflejo local inmediato
      const synced = await syncItem('orders', order, 'upsert');
      if(!synced) set('orders', arr); // sin conexión: cae al comportamiento anterior (array completo)
      return order;
    },
    updateOrder:   async (id, d) => {
      const arr = getAll('orders');
      const idx = arr.findIndex(o => o.id === id);
      if(idx < 0) return null;
      arr[idx] = { ...arr[idx], ...d };
      _store.orders = arr;
      const synced = await syncItem('orders', arr[idx], 'upsert');
      if(!synced) set('orders', arr);
      return arr[idx];
    },
    // Cash Sessions
    getCashSessions:() => getAll('cashSessions'),
    getOpenSession: () => getAll('cashSessions').find(s => !s.closedAt) || null,
    // Server-autoritativo: evita que dos tablets abran caja a la vez (chequea
    // contra el valor más reciente de la BD, no el caché local desactualizado).
    // Devuelve { success:false, session } con la sesión ya abierta si hay conflicto.
    createSession: async (s) => {
      try {
        const res = await apiFetch('/api/open-cash-session', { method:'POST', body: JSON.stringify(s) });
        const data = await res.json();
        if(res.status === 409) return { success:false, session:data.session };
        if(!res.ok) throw new Error(data.error || 'No se pudo abrir caja');
        const sessions = getAll('cashSessions');
        sessions.push(data.session);
        _store.cashSessions = sessions; // reflejo local inmediato, sin re-sync (el server ya lo persistió)
        return { success:true, session:data.session };
      } catch(e) {
        // Sin conexión: cae al comportamiento local anterior (puede colisionar entre tablets)
        const session = { ...s, id:nextId('cs'), openedAt:new Date().toISOString() };
        create('cashSessions', session);
        return { success:true, session, offline:true };
      }
    },
    closeSession:   (id,d) => update('cashSessions',id,{...d,closedAt:new Date().toISOString()}),
    // Campaigns
    getCampaigns: () => getAll('campaigns'),
    saveCampaign: c => c.id ? update('campaigns',c.id,c) : create('campaigns',{...c,id:nextId('cam')}),
    /* Inventory & Recipes */
    getInventory: () => get('inventory') || [],
    getRawInventory: () => (get('inventory') || []).filter(i => i.type !== 'beverage'),
    getBeverageInventory: () => (get('inventory') || []).filter(i => i.type === 'beverage'),
    getInventoryItem: (id) => (get('inventory') || []).find(i => i.id === id),
    // inventory usa merge por-item (POST /api/sync-item): una venta que
    // descuenta stock en una tablet ya no puede pisar una edición de stock
    // hecha en otra tablet en la misma ventana de poll (5s).
    saveInventoryItem: async (item) => {
      if(!item.type) item.type = 'raw';
      const inv = get('inventory') || [];
      const idx = inv.findIndex(i => i.id === item.id);
      if(idx > -1) inv[idx] = item; else inv.push(item);
      _store.inventory = inv;
      const synced = await syncItem('inventory', item, 'upsert');
      if(!synced) set('inventory', inv);
    },
    deleteInventoryItem: async (id) => {
      const inv = (get('inventory') || []).filter(i => i.id !== id);
      _store.inventory = inv;
      const synced = await syncItem('inventory', {id}, 'delete');
      if(!synced) set('inventory', inv);
    },
    // Recipes
    getRecipes: () => getAll('recipes'),
    getRecipe: (productId, sizeName) => getAll('recipes').find(r => r.productId === productId && (r.sizeName === sizeName || !sizeName)),
    saveRecipe: r => {
      const existing = getAll('recipes').find(x => x.productId === r.productId && x.sizeName === r.sizeName);
      if (existing) {
        return update('recipes', existing.id, r);
      } else {
        return create('recipes', {...r, id: nextId('rec')});
      }
    },
    deleteRecipe: id => remove2('recipes', id),
    // Raw
    getRaw: get, setRaw: set
  };
})();
