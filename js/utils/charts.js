/* ═══════════════════════════════════════════════════════════
   charts.js — Chart.js wrapper helpers
   ═══════════════════════════════════════════════════════════ */
const Charts = (() => {
  Chart.defaults.color = '#9090A8';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.07)';
  Chart.defaults.font.family = "'Outfit', sans-serif";

  const _instances = {};

  const destroy = id => { if(_instances[id]) { _instances[id].destroy(); delete _instances[id]; } };

  const PALETTE = {
    red:    { line:'#E8231A', fill:'rgba(232,35,26,0.12)' },
    green:  { line:'#1B8A3E', fill:'rgba(27,138,62,0.12)' },
    orange: { line:'#F5A623', fill:'rgba(245,166,35,0.12)' },
    blue:   { line:'#3B82F6', fill:'rgba(59,130,246,0.12)' },
    purple: { line:'#A855F7', fill:'rgba(168,85,247,0.12)' }
  };

  const COLORS_MULTI = ['#E8231A','#F5A623','#1B8A3E','#3B82F6','#A855F7','#EC4899','#14B8A6','#F59E0B'];

  /* ── Sales Line Chart ── */
  const salesLine = (canvasId, labels, datasets, opts={}) => {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if(!ctx) return;
    const c = new Chart(ctx, {
      type:'line',
      data: {
        labels,
        datasets: datasets.map((d,i) => {
          const pal = Object.values(PALETTE)[i%5];
          return {
            label: d.label, data: d.data,
            borderColor: d.color || pal.line,
            backgroundColor: d.fillColor || pal.fill,
            fill: d.fill !== false,
            tension:0.4, pointRadius:4, pointHoverRadius:7,
            pointBackgroundColor: d.color || pal.line,
            borderWidth:2.5
          };
        })
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        interaction:{ intersect:false, mode:'index' },
        plugins:{
          legend:{ display:datasets.length>1, labels:{ boxWidth:12, padding:16 } },
          tooltip:{
            backgroundColor:'#1A1A38', borderColor:'rgba(255,255,255,0.1)', borderWidth:1,
            padding:10, cornerRadius:8,
            callbacks:{
              label:ctx => {
                const s = DB.getSettings();
                return ` ${ctx.dataset.label}: ${s.currencySymbol}${Number(ctx.parsed.y).toLocaleString('es',{minimumFractionDigits:2})}`;
              }
            }
          }
        },
        scales:{
          x:{ grid:{display:false} },
          y:{ grid:{color:'rgba(255,255,255,0.05)'}, ticks:{callback:v => `${DB.getSettings().currencySymbol}${Number(v).toLocaleString('es')}`} }
        },
        ...opts
      }
    });
    _instances[canvasId] = c;
    return c;
  };

  /* ── Bar Chart ── */
  const barChart = (canvasId, labels, data, color='#E8231A', opts={}) => {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if(!ctx) return;
    const c = new Chart(ctx, {
      type:'bar',
      data: {
        labels,
        datasets:[{
          data, borderRadius:6, borderSkipped:false,
          backgroundColor: labels.map((_,i) => i === data.indexOf(Math.max(...data)) ? '#F5A623' : color+'99'),
          hoverBackgroundColor: color
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{
            backgroundColor:'#1A1A38', borderColor:'rgba(255,255,255,0.1)', borderWidth:1,
            padding:10, cornerRadius:8,
            callbacks:{ label:ctx => ` ${DB.getSettings().currencySymbol}${Number(ctx.parsed.y).toLocaleString('es',{minimumFractionDigits:2})}` }
          }
        },
        scales:{
          x:{ grid:{display:false} },
          y:{ grid:{color:'rgba(255,255,255,0.05)'}, ticks:{callback:v => `${DB.getSettings().currencySymbol}${Number(v).toLocaleString('es')}`} }
        },
        ...opts
      }
    });
    _instances[canvasId] = c;
    return c;
  };

  /* ── Doughnut Chart ── */
  const doughnut = (canvasId, labels, data, opts={}) => {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if(!ctx) return;
    const c = new Chart(ctx, {
      type:'doughnut',
      data: {
        labels,
        datasets:[{
          data,
          backgroundColor: COLORS_MULTI.slice(0,labels.length).map(c => c+'CC'),
          borderColor: COLORS_MULTI.slice(0,labels.length),
          borderWidth:1.5, hoverOffset:6
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        cutout:'68%',
        plugins:{
          legend:{ position:'bottom', labels:{ boxWidth:10, padding:12 } },
          tooltip:{
            backgroundColor:'#1A1A38', borderColor:'rgba(255,255,255,0.1)', borderWidth:1,
            padding:10, cornerRadius:8
          }
        },
        ...opts
      }
    });
    _instances[canvasId] = c;
    return c;
  };

  /* ── Hourly bars (helper for today) ── */
  const hourlyToday = (canvasId, orders) => {
    const hours = Array.from({length:13},(_,i) => `${i+9}:00`);
    const data = hours.map((_,i) => {
      const h = i + 9;
      return orders.filter(o => new Date(o.createdAt).getHours() === h)
                   .reduce((s,o) => s + o.total, 0);
    });
    barChart(canvasId, hours, data, '#E8231A');
  };

  /* ── 30-day trend line ── */
  const monthlyTrend = (canvasId, orders) => {
    const days = [];
    const data = [];
    for(let d = 29; d >= 0; d--) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      days.push(date.toLocaleDateString('es',{month:'short',day:'numeric'}));
      const ds = date.toDateString();
      data.push(orders.filter(o => new Date(o.createdAt).toDateString()===ds).reduce((s,o)=>s+o.total,0));
    }
    salesLine(canvasId, days, [{label:'Ventas', data}]);
  };

  return { salesLine, barChart, doughnut, hourlyToday, monthlyTrend, destroy };
})();
