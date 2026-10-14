/* ═══════════════════════════════════════════════════════════
   marketing.js — WhatsApp Marketing Campaigns Module
   ═══════════════════════════════════════════════════════════ */
const Marketing = (() => {
  const TEMPLATES = [
    { id:'promo', name:'Promo del día', icon:'🔥', message:'¡Hola {nombre}! 🍕\n\n*¡Oferta especial hoy en PizzaSport!* 🎉\n\n{mensaje}\n\n_Válido solo hoy. ¡Visítanos!_\n\n📍 PizzaSport - Siempre fresca, siempre deliciosa' },
    { id:'menu', name:'Menú actualizado', icon:'📋', message:'¡Hola {nombre}! 🍕\n\n*¡Tenemos novedades en PizzaSport!* 🆕\n\n{mensaje}\n\n_¡Ven a probar nuestras nuevas opciones!_ 😋\n\n📍 PizzaSport' },
    { id:'birthday', name:'Cumpleaños', icon:'🎂', message:'¡Feliz cumpleaños {nombre}! 🎂🎉\n\nEn *PizzaSport* queremos celebrar contigo.\n\n🎁 *¡Una pizza GRATIS en tu día especial!*\n\nPresentando este mensaje. ¡Te esperamos! 🍕❤️' },
    { id:'loyalty', name:'Puntos acumulados', icon:'⭐', message:'¡Hola {nombre}! ⭐\n\nTienes *{puntos} puntos* acumulados en PizzaSport.\n\n🍕 ¡Sigue sumando puntos en cada visita!\n\n📍 PizzaSport - Tu pizzería favorita' },
    { id:'custom', name:'Mensaje libre', icon:'✏️', message:'' }
  ];

  const render = () => `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div class="page-header">
        <div>
          <div class="page-title">📣 Marketing</div>
          <div class="page-subtitle">Envío de promociones y menú via WhatsApp</div>
        </div>
        <button class="btn btn-primary" onclick="Marketing.openComposer()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nueva campaña
        </button>
      </div>

      <div style="flex:1;overflow-y:auto;padding:16px 24px">
        <!-- Stats -->
        <div class="stats-row-3" style="margin-bottom:20px">
          ${renderStats()}
        </div>

        <!-- Templates Quick Action -->
        <div class="card mb-4">
          <div class="card-header"><div class="card-title">⚡ Acciones rápidas</div></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">
            ${TEMPLATES.map(t => `
              <button class="payment-method-btn" onclick="Marketing.openComposer('${t.id}')" style="text-align:center">
                <span style="font-size:1.5rem">${t.icon}</span>
                <span class="pm-label">${t.name}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Campaign History -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">📋 Historial de campañas</div>
          </div>
          <div id="campaigns-list">${renderCampaignList()}</div>
        </div>
      </div>
    </div>
  `;

  const renderStats = () => {
    const campaigns = DB.getCampaigns();
    const customers = DB.getCustomers();
    const sent = campaigns.filter(c => c.status === 'sent').length;
    const totalReach = campaigns.filter(c=>c.status==='sent').reduce((s,c) => s + (c.count||0), 0);
    return [
      { icon:'📤', label:'Campañas enviadas', value:sent, color:'green' },
      { icon:'👥', label:'Alcance total', value:totalReach, color:'blue' },
      { icon:'🛒', label:'Clientes activos', value:customers.length, color:'orange' }
    ].map(s => `
      <div class="stat-card">
        <div class="stat-icon ${s.color}">${s.icon}</div>
        <div class="stat-body">
          <div class="stat-number">${s.value}</div>
          <div class="stat-name">${s.label}</div>
        </div>
      </div>
    `).join('');
  };

  const renderCampaignList = () => {
    const campaigns = [...DB.getCampaigns()].sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
    if(!campaigns.length) return `<div class="empty-state"><div class="empty-icon">📣</div><div class="empty-title">Sin campañas</div><div class="empty-subtitle">Crea tu primera campaña de marketing</div></div>`;
    const segLabels = { all:'Todos', vip:'VIP', birthday:'Cumpleaños del mes', inactive:'Inactivos' };
    return `
      <table class="data-table">
        <thead><tr><th>Campaña</th><th>Segmento</th><th>Enviados</th><th>Fecha</th><th>Estado</th><th>Acción</th></tr></thead>
        <tbody>
          ${campaigns.map(c => `
            <tr>
              <td>
                <div style="font-weight:600">${escapeHtml(c.title)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${escapeHtml(c.message?.slice(0,60)||'')}...</div>
              </td>
              <td><span class="badge badge-blue">${segLabels[c.segment]||c.segment}</span></td>
              <td>${c.count||0}</td>
              <td style="font-size:0.8rem;color:var(--text-muted)">${c.createdAt?new Date(c.createdAt).toLocaleDateString('es'):''}</td>
              <td><span class="badge ${c.status==='sent'?'badge-green':'badge-orange'}">${c.status==='sent'?'Enviado':'Borrador'}</span></td>
              <td>
                ${c.status !== 'sent' ? `<button class="btn btn-success btn-sm" onclick="Marketing.sendCampaign('${c.id}')">Enviar</button>` : ''}
                <button class="btn btn-ghost btn-sm" onclick="Marketing.deleteCampaign('${c.id}')">🗑️</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  };

  const refresh = () => {
    const el = document.getElementById('campaigns-list');
    if(el) el.innerHTML = renderCampaignList();
  };

  const openComposer = (templateId=null) => {
    const customers = DB.getCustomers();
    const tpl = TEMPLATES.find(t => t.id === templateId) || TEMPLATES[4];

    PizzaPos.ui.showModal(`
      <div class="modal-header">
        <div class="modal-title">✏️ Crear Campaña WhatsApp</div>
        <button class="modal-close" onclick="PizzaPos.ui.closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group mb-4">
          <label class="form-label">Nombre de la campaña <span class="required">*</span></label>
          <input type="text" class="form-control" id="camp-title" placeholder="Ej: Promo del martes" value="${tpl.name !== 'Mensaje libre' ? tpl.name : ''}" />
        </div>

        <div class="form-group mb-4">
          <label class="form-label">Segmento de clientes</label>
          <select class="form-select" id="camp-segment" onchange="Marketing._updateCount(this.value)">
            <option value="all">Todos los clientes (${customers.length})</option>
            <option value="vip">Clientes VIP (gasto +Q1,000)</option>
            <option value="birthday">Cumpleaños del mes</option>
          </select>
          <div class="form-hint" id="camp-count-hint">Se enviará a ${customers.length} clientes</div>
        </div>

        <div class="form-group mb-4">
          <label class="form-label">Plantilla de mensaje</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
            ${TEMPLATES.map(t => `<button class="chip ${t.id===tpl.id?'active':''}" onclick="Marketing._applyTemplate('${t.id}')" id="tpl-${t.id}">${t.icon} ${t.name}</button>`).join('')}
          </div>
          <textarea class="form-control form-textarea" id="camp-message" rows="6" placeholder="Escribe tu mensaje..."
            style="font-family:monospace;font-size:0.85rem">${tpl.message}</textarea>
          <div class="form-hint">Variables: {nombre} = nombre del cliente, {puntos} = puntos acumulados, {mensaje} = texto libre</div>
        </div>

        <div class="form-group">
          <label class="form-label">Preview del mensaje</label>
          <div style="background:var(--ps-green-glow);border:1px solid var(--ps-green);border-radius:var(--radius);padding:14px;font-size:0.875rem;white-space:pre-wrap;line-height:1.6" id="camp-preview">
            ${(tpl.message||'').replace(/{nombre}/g,'María').replace(/{puntos}/g,'150').replace(/{mensaje}/g,'¡10% de descuento en pizzas grandes!')}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="PizzaPos.ui.closeModal()">Cancelar</button>
        <button class="btn btn-secondary" onclick="Marketing.saveDraft()">💾 Guardar borrador</button>
        <button class="btn btn-success" onclick="Marketing.sendNow()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Enviar ahora
        </button>
      </div>
    `, 'modal-lg');

    // Live preview
    setTimeout(() => {
      const msgInput = document.getElementById('camp-message');
      if(msgInput) msgInput.addEventListener('input', e => {
        const preview = document.getElementById('camp-preview');
        if(preview) preview.textContent = e.target.value.replace(/{nombre}/g,'María').replace(/{puntos}/g,'150').replace(/{mensaje}/g,'¡Oferta especial!');
      });
    }, 50);
  };

  const _applyTemplate = (id) => {
    const tpl = TEMPLATES.find(t => t.id === id);
    if(!tpl) return;
    document.querySelectorAll('[id^="tpl-"]').forEach(el => el.classList.remove('active'));
    document.getElementById(`tpl-${id}`)?.classList.add('active');
    const msgEl = document.getElementById('camp-message');
    if(msgEl) { msgEl.value = tpl.message; msgEl.dispatchEvent(new Event('input')); }
  };

  const _updateCount = (seg) => {
    const customers = DB.getCustomers();
    let count = customers.length;
    if(seg === 'vip') count = customers.filter(c => c.totalSpent >= DB.getSettings().vipThreshold).length;
    if(seg === 'birthday') {
      const now = new Date();
      count = customers.filter(c => { if(!c.birthdate) return false; const bd=new Date(c.birthdate); return bd.getMonth()===now.getMonth(); }).length;
    }
    const hint = document.getElementById('camp-count-hint');
    if(hint) hint.textContent = `Se enviará a ${count} clientes`;
  };

  const _getCampaignData = (status) => {
    const title   = document.getElementById('camp-title')?.value?.trim();
    const segment = document.getElementById('camp-segment')?.value;
    const message = document.getElementById('camp-message')?.value?.trim();
    if(!title || !message) { Notify.warning('Campos requeridos', 'Título y mensaje son obligatorios'); return null; }

    const customers = DB.getCustomers();
    let targets = customers;
    if(segment === 'vip') targets = customers.filter(c => c.totalSpent >= DB.getSettings().vipThreshold);
    if(segment === 'birthday') { const now=new Date(); targets = customers.filter(c => { if(!c.birthdate) return false; const bd=new Date(c.birthdate); return bd.getMonth()===now.getMonth(); }); }

    return { title, segment, message, count:targets.length, targets, status, createdAt:new Date().toISOString() };
  };

  const saveDraft = () => {
    const data = _getCampaignData('draft');
    if(!data) return;
    DB.saveCampaign(data);
    PizzaPos.ui.closeModal();
    refresh();
    Notify.success('Borrador guardado');
  };

  const sendNow = () => {
    const data = _getCampaignData('sent');
    if(!data) return;

    // Open WhatsApp links for each customer (batched)
    const { targets, message } = data;
    if(targets.length === 0) { Notify.warning('Sin destinatarios', 'No hay clientes en este segmento'); return; }

    // Save campaign
    DB.saveCampaign(data);
    PizzaPos.ui.closeModal();
    refresh();

    // Generate WhatsApp links and open first one
    const first = targets[0];
    const personalMsg = message.replace(/{nombre}/g, first.name).replace(/{puntos}/g, first.points||0);
    const phone = first.phone.replace(/\D/g,'');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(personalMsg)}`;

    Notify.success(`Campaña "${escapeHtml(data.title)}" enviada`, `${targets.length} destinatarios. Abriendo WhatsApp...`);

    setTimeout(() => {
      window.open(url, '_blank');
      if(targets.length > 1) {
        Notify.info('Nota', `Hay ${targets.length-1} mensajes más. Puedes continuar desde el historial.`);
      }
    }, 500);
  };

  const sendCampaign = (id) => {
    const camp = DB.getCampaigns().find(c => c.id === id);
    if(!camp) return;
    const customers = DB.getCustomers();
    const first = customers[0];
    if(!first) return;
    const msg = (camp.message||'').replace(/{nombre}/g,first.name).replace(/{puntos}/g,first.points||0);
    const phone = first.phone.replace(/\D/g,'');
    DB.saveCampaign({...camp, status:'sent', sentAt:new Date().toISOString()});
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    refresh();
    Notify.success('Campaña enviada');
  };

  const deleteCampaign = async (id) => {
    const ok = await Notify.confirm('Eliminar campaña', '¿Deseas eliminar esta campaña?', {confirmClass:'btn-danger', confirmText:'Eliminar'});
    if(ok) { const arr = DB.getCampaigns().filter(c => c.id !== id); DB.setRaw('campaigns', arr); refresh(); }
  };

  return { render, init:()=>{}, openComposer, _applyTemplate, _updateCount, saveDraft, sendNow, sendCampaign, deleteCampaign };
})();
