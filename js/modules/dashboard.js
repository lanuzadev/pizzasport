/* ═══════════════════════════════════════════════════════════
   dashboard.js — Analytics & Reports Module
   ═══════════════════════════════════════════════════════════ */
const Dashboard = (() => {
  let _period = 'today';
  // El pago se captura al crear la orden (POS.processPayment); `status` solo
  // trackea el avance en cocina (open→cooking→ready→paid=entregado). Todas
  // cuentan como venta para reportes — usar siempre el mismo filtro.
  const SALE_STATUSES = ['open', 'cooking', 'ready', 'paid'];

  const render = () => {
    const sym = DB.getSettings().currencySymbol;
    return `
    <div class="dashboard-view">
      <div class="page-header">
        <div>
          <div class="page-title gradient-text">Dashboard</div>
          <div class="page-subtitle">Análisis de ventas y rendimiento</div>
        </div>
        <div class="dashboard-header-actions">
          <div class="tabs">
            <button class="tab-btn active" id="tab-today" onclick="Dashboard.setPeriod('today')">Hoy</button>
            <button class="tab-btn" id="tab-week" onclick="Dashboard.setPeriod('week')">7 Días</button>
            <button class="tab-btn" id="tab-month" onclick="Dashboard.setPeriod('month')">30 Días</button>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="Dashboard.exportCSV()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar CSV
          </button>
        </div>
      </div>

      <div class="dashboard-content" id="dashboard-content">
        <!-- Stats Grid -->
        <div class="stats-grid" id="stats-grid"></div>
        <!-- Main Charts -->
        <div class="charts-grid">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">Ventas por hora</div>
            </div>
            <div class="chart-canvas-wrap" style="height:220px"><canvas id="chart-hourly"></canvas></div>
          </div>
          <div class="chart-card">
            <div class="chart-header"><div class="chart-title">Método de pago</div></div>
            <div class="chart-canvas-wrap" style="height:220px"><canvas id="chart-payment"></canvas></div>
          </div>
        </div>
        <!-- Trend + Top -->
        <div class="charts-grid">
          <div class="chart-card">
            <div class="chart-header"><div class="chart-title">Tendencia de ventas</div></div>
            <div class="chart-canvas-wrap" style="height:200px"><canvas id="chart-trend"></canvas></div>
          </div>
          <div class="chart-card">
            <div class="chart-header"><div class="chart-title">Top 5 Productos</div></div>
            <div class="top-products-list" id="top-products"></div>
          </div>
        </div>
        <!-- Type breakdown + recent orders -->
        <div class="charts-grid-3">
          <div class="chart-card">
            <div class="chart-header"><div class="chart-title">Tipo de orden</div></div>
            <div class="chart-canvas-wrap" style="height:180px"><canvas id="chart-types"></canvas></div>
          </div>
          <div class="chart-card col-span-2">
            <div class="card-header"><div class="card-title">Últimas órdenes</div></div>
            <div class="recent-orders" id="recent-orders"></div>
          </div>
        </div>
      </div>
    </div>
    `;
  };

  const getFilteredOrders = () => {
    const all = DB.getOrders().filter(o => SALE_STATUSES.includes(o.status));
    const now = new Date();
    if(_period === 'today') {
      return all.filter(o => new Date(o.createdAt).toDateString() === now.toDateString());
    } else if(_period === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 6);
      return all.filter(o => new Date(o.createdAt) >= d);
    } else {
      const d = new Date(now); d.setDate(d.getDate() - 29);
      return all.filter(o => new Date(o.createdAt) >= d);
    }
  };

  const initCharts = () => {
    const orders = getFilteredOrders();
    const sym = DB.getSettings().currencySymbol;
    const totalSales = orders.reduce((s,o) => s+o.total, 0);
    const avgTicket  = orders.length ? totalSales / orders.length : 0;

    // Stats cards
    const statsEl = document.getElementById('stats-grid');
    if(statsEl) {
      const prevOrders = DB.getOrders().filter(o => {
        if(!SALE_STATUSES.includes(o.status)) return false;
        const d = new Date(o.createdAt);
        const now = new Date();
        if(_period === 'today') { const prev = new Date(now); prev.setDate(prev.getDate()-1); return d.toDateString() === prev.toDateString(); }
        return false;
      });
      const prevSales = prevOrders.reduce((s,o) => s+o.total, 0);
      const salesChange = prevSales > 0 ? ((totalSales-prevSales)/prevSales*100).toFixed(1) : null;

      statsEl.innerHTML = [
        { icon:'💰', label:'Ventas totales', value:`${sym}${totalSales.toLocaleString('es',{minimumFractionDigits:2})}`, color:'red', change:salesChange, changeDir:'up' },
        { icon:'📋', label:'Total órdenes', value:orders.length, color:'green' },
        { icon:'🎯', label:'Ticket promedio', value:`${sym}${avgTicket.toFixed(2)}`, color:'orange' },
        { icon:'👥', label:'Clientes atendidos', value:new Set(orders.filter(o=>o.customerId).map(o=>o.customerId)).size, color:'blue' }
      ].map(s => `
        <div class="stat-card animate-fade">
          <div class="stat-icon ${s.color}">${s.icon}</div>
          <div class="stat-body">
            <div class="stat-number">${s.value}</div>
            <div class="stat-name">${s.label}</div>
            ${s.change !== null && s.change !== undefined ? `<div class="stat-change ${s.changeDir}">↑ ${s.change}% vs ayer</div>` : ''}
          </div>
        </div>
      `).join('');
    }

    // Hourly chart
    if(_period === 'today') {
      Charts.hourlyToday('chart-hourly', orders);
    } else {
      const labels = _period === 'week' ? Array.from({length:7},(_,i) => { const d=new Date(); d.setDate(d.getDate()-6+i); return d.toLocaleDateString('es',{weekday:'short'}); }) : [];
      const data = labels.map((_,i) => { const d=new Date(); d.setDate(d.getDate()-6+i); return orders.filter(o=>new Date(o.createdAt).toDateString()===d.toDateString()).reduce((s,o)=>s+o.total,0); });
      Charts.barChart('chart-hourly', labels, data, '#E8231A');
    }

    // Payment method doughnut
    const pmLabels = ['Efectivo','Tarjeta','Transferencia','Mixto'];
    const pmData   = ['cash','card','transfer','mixed'].map(m => orders.filter(o=>o.paymentMethod===m).reduce((s,o)=>s+o.total,0));
    Charts.doughnut('chart-payment', pmLabels, pmData);

    // Trend line (30 days)
    Charts.monthlyTrend('chart-trend', DB.getOrders().filter(o => SALE_STATUSES.includes(o.status)));

    // Order types doughnut
    const typeLabels2 = ['Mesa','Para llevar','Delivery'];
    const typeData    = ['mesa','llevar','delivery'].map(t => orders.filter(o=>o.type===t).length);
    Charts.doughnut('chart-types', typeLabels2, typeData);

    // Top products
    const topEl = document.getElementById('top-products');
    if(topEl) {
      const productMap = {};
      orders.forEach(o => o.items.forEach(item => {
        if(!productMap[item.name]) productMap[item.name] = { qty:0, total:0 };
        productMap[item.name].qty   += item.qty;
        productMap[item.name].total += item.subtotal;
      }));
      const sorted = Object.entries(productMap).sort((a,b) => b[1].total - a[1].total).slice(0,5);
      const maxTotal = sorted[0]?.[1]?.total || 1;
      topEl.innerHTML = sorted.length ? sorted.map(([name,d],i) => `
        <div class="top-product-item">
          <div class="top-product-rank ${['gold','silver','bronze'][i]||''}">${i+1}</div>
          <div class="top-product-name">${escapeHtml(name)}</div>
          <span class="top-product-qty">${d.qty} uds</span>
          <div class="top-product-bar-wrap">
            <div class="progress"><div class="progress-bar red" style="width:${(d.total/maxTotal*100).toFixed(0)}%"></div></div>
          </div>
          <div class="top-product-amount">${sym}${d.total.toFixed(0)}</div>
        </div>
      `).join('') : '<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-subtitle">Sin datos</div></div>';
    }

    // Recent orders
    const recentEl = document.getElementById('recent-orders');
    if(recentEl) {
      const recent = [...orders].sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).slice(0,8);
      const typeIcons = { mesa:'🍽️', llevar:'🛍️', delivery:'🛵' };
      recentEl.innerHTML = recent.length ? recent.map(o => `
        <div class="recent-order-item">
          <div class="recent-order-num">#${o.number}</div>
          <div style="font-size:1rem">${typeIcons[o.type]||'📋'}</div>
          <div class="recent-order-items">${o.items.map(i=>`${i.qty}x ${escapeHtml(i.name)}`).join(', ')}</div>
          <div style="font-size:0.72rem;color:var(--text-muted)">${new Date(o.createdAt).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</div>
          <div class="recent-order-total">${sym}${o.total.toFixed(2)}</div>
        </div>
      `).join('') : '<div class="empty-state"><div class="empty-subtitle">Sin órdenes en este período</div></div>';
    }
  };

  const setPeriod = (period) => {
    _period = period;
    ['today','week','month'].forEach(p => document.getElementById(`tab-${p}`)?.classList.toggle('active', p === period));
    initCharts();
  };

  const exportCSV = () => {
    const orders = getFilteredOrders();
    const sym = DB.getSettings().currencySymbol;
    const rows = [['Orden','Fecha','Tipo','Items','Subtotal','Descuento','Total','Pago']];
    orders.forEach(o => rows.push([
      o.number,
      new Date(o.createdAt).toLocaleDateString('es'),
      o.type, o.items.map(i=>`${i.qty}x ${i.name}`).join(' | '),
      o.subtotal?.toFixed(2), o.discount?.toFixed(2), o.total?.toFixed(2), o.paymentMethod
    ]));
    const csv = rows.map(r => r.map(v => `"${v||''}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`pizzasport_ventas_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    Notify.success('Exportado', 'Archivo CSV descargado');
  };

  const init = () => { setTimeout(initCharts, 50); };

  return { render, init, setPeriod, exportCSV };
})();
