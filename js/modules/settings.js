/* ═══════════════════════════════════════════════════════════
   settings.js — Configuration Module
   ═══════════════════════════════════════════════════════════ */
const Settings = (() => {
  let _tab = 'business';

  const render = () => `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div class="page-header">
        <div><div class="page-title">⚙️ Configuración</div><div class="page-subtitle">Ajustes del sistema POS</div></div>
      </div>
      <div style="padding:8px 24px;flex-shrink:0">
        <div class="tabs">
          <button class="tab-btn active" id="st-business" onclick="Settings.setTab('business')">🏪 Negocio</button>
          <button class="tab-btn" id="st-users" onclick="Settings.setTab('users')">👤 Usuarios</button>
          <button class="tab-btn" id="st-ticket" onclick="Settings.setTab('ticket')">🖨️ Ticket</button>
          <button class="tab-btn" id="st-kitchen" onclick="Settings.setTab('kitchen')">🍳 Cocina</button>
          <button class="tab-btn" id="st-system" onclick="Settings.setTab('system')">🔧 Sistema</button>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:16px 24px" id="settings-content">
        ${renderTab('business')}
      </div>
    </div>`;

  const renderTab = (tab) => {
    const s = DB.getSettings();
    if(tab === 'business') return `
      <div class="card" style="max-width:640px">
        <div class="card-header"><div class="card-title">🏪 Información del negocio</div></div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="form-row form-row-2">
            <div class="form-group"><label class="form-label">Nombre del negocio</label><input type="text" class="form-control" id="set-biz-name" value="${escapeHtml(s.bizName||'')}" /></div>
            <div class="form-group"><label class="form-label">RFC / NIT</label><input type="text" class="form-control" id="set-biz-rfc" value="${escapeHtml(s.bizRFC||'')}" /></div>
          </div>
          <div class="form-group"><label class="form-label">Dirección</label><input type="text" class="form-control" id="set-biz-addr" value="${escapeHtml(s.bizAddress||'')}" /></div>
          <div class="form-row form-row-2">
            <div class="form-group"><label class="form-label">Teléfono</label><input type="text" class="form-control" id="set-biz-phone" value="${escapeHtml(s.bizPhone||'')}" /></div>
            <div class="form-group"><label class="form-label">Correo</label><input type="email" class="form-control" id="set-biz-email" value="${escapeHtml(s.bizEmail||'')}" /></div>
          </div>
          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">Símbolo de moneda</label>
              <input type="text" class="form-control" id="set-currency" value="${s.currencySymbol||'Q'}" maxlength="5" placeholder="Q, $, L, ..." />
            </div>
            <div class="form-group">
              <label class="form-label">Nombre moneda</label>
              <input type="text" class="form-control" id="set-currency-name" value="${s.currency||'Q'}" placeholder="Quetzal, Peso, Lempira..." />
            </div>
          </div>
          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="toggle-wrap">
                <input type="checkbox" class="toggle-input" id="set-tax-en" ${s.taxEnabled?'checked':''} onchange="Settings.toggleTax(this.checked)">
                <div class="toggle-slider"></div>
                <span class="toggle-label">Habilitar impuesto (IVA/IVA)</span>
              </label>
            </div>
            <div class="form-group" id="tax-rate-wrap" style="${s.taxEnabled?'':'opacity:0.4'}">
              <label class="form-label">Tasa (%)</label>
              <input type="number" class="form-control" id="set-tax-rate" value="${s.taxRate||12}" min="0" max="100" step="0.01" ${s.taxEnabled?'':'disabled'} />
            </div>
          </div>
          <button class="btn btn-primary" onclick="Settings.saveBusiness()">💾 Guardar cambios</button>
        </div>
      </div>`;

    if(tab === 'users') return `
      <div style="max-width:700px">
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
          <button class="btn btn-primary" onclick="Settings.openUserForm()">+ Nuevo usuario</button>
        </div>
        <div id="users-list">${renderUsersList()}</div>
      </div>`;

    if(tab === 'ticket') {
      setTimeout(Settings.updateTicketPreview, 100);
      return `
      <div style="display:flex; gap:24px; flex-wrap:wrap;">
        <div class="card" style="flex:1; min-width:300px; max-width:640px">
          <div class="card-header"><div class="card-title">🖨️ Configuración del ticket</div></div>
          <div style="display:flex;flex-direction:column;gap:16px">
            <div class="form-row form-row-2">
              <div class="form-group">
                <label class="form-label">Ruta del Logo del ticket</label>
                <input type="text" class="form-control" id="set-ticket-logo" value="${escapeHtml(s.ticketLogo||'')}" placeholder="Ej: assets/pizzamono.png" oninput="Settings.updateTicketPreview()" />
              </div>
              <div class="form-group">
                <label class="form-label">Tamaño del logo (mm)</label>
                <input type="number" class="form-control" id="set-ticket-logo-size" value="${s.ticketLogoSizeMM ?? 24}" min="10" max="40" step="1" oninput="Settings.updateTicketPreview()" />
              </div>
            </div>
            <p style="font-size:0.78rem;color:var(--text-muted);margin-top:-8px">
              Tope de 40mm: logos más grandes envían demasiados datos de golpe y algunas impresoras baratas fallan a mitad de impresión.
            </p>
            <div class="form-group">
              <label class="form-label">Encabezado del ticket (opcional)</label>
              <textarea class="form-control form-textarea" id="set-ticket-header" rows="2" placeholder="Línea adicional encima del logo..." oninput="Settings.updateTicketPreview()">${escapeHtml(s.ticketHeader||'')}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Pie del ticket</label>
              <textarea class="form-control form-textarea" id="set-ticket-footer" rows="2" placeholder="Mensaje de agradecimiento, redes sociales..." oninput="Settings.updateTicketPreview()">${escapeHtml(s.ticketFooter||'¡Gracias por su visita!')}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Eslogan (final del ticket)</label>
              <input type="text" class="form-control" id="set-ticket-slogan" value="${escapeHtml(s.ticketSlogan||'')}" placeholder="Ej: Siempre fresca, siempre deliciosa" oninput="Settings.updateTicketPreview()" />
            </div>
            <div class="form-group">
              <label class="form-label">Copias de impresión</label>
              <select class="form-select" id="set-copies" onchange="Settings.updateTicketPreview()">
                <option value="1" ${s.printCopies==1?'selected':''}>1 copia</option>
                <option value="2" ${s.printCopies==2?'selected':''}>2 copias</option>
                <option value="3" ${s.printCopies==3?'selected':''}>3 copias</option>
              </select>
            </div>
            <button class="btn btn-primary" onclick="Settings.saveTicket()">💾 Guardar</button>
          </div>
        </div>
        <div class="card" style="flex:1; min-width:300px; max-width:400px; align-self:flex-start">
          <div class="card-header"><div class="card-title">🖨️ Impresora térmica (USB)</div></div>
          <div style="display:flex;flex-direction:column;gap:16px">
            <div id="printer-status" style="font-size:0.85rem; padding:8px 12px; border-radius:8px; ${Printer.isThermalPrinterReady() ? 'background:rgba(27,138,62,0.15); color:var(--success,#1B8A3E)' : 'background:rgba(232,35,26,0.1); color:var(--danger,#E8231A)'}">
              ${Printer.isThermalPrinterReady() ? '✅ Puente nativo detectado — impresión directa activa' : '⚠️ No se detectó el puente nativo. Se usará el diálogo de impresión del sistema.'}
            </div>
            <div class="form-group">
              <label class="form-label">Ancho de papel</label>
              <select class="form-select" id="set-printer-width" onchange="Settings.updateTicketPreview()">
                <option value="80" ${(s.printerPaperWidth||'80')=='80'?'selected':''}>80mm</option>
                <option value="58" ${s.printerPaperWidth=='58'?'selected':''}>58mm</option>
                <option value="50" ${s.printerPaperWidth=='50'?'selected':''}>50mm</option>
                <option value="44" ${s.printerPaperWidth=='44'?'selected':''}>44mm</option>
              </select>
              <p style="font-size:0.78rem;color:var(--text-muted);margin-top:6px">
                Elige el ancho del <b>rollo de papel que tienes puesto</b>, no el de la impresora. Si el papel es más angosto que el cabezal (p.ej. impresora de 80mm con papel de 58mm o menos), el ticket se imprime de más y el sobrante queda fuera del papel — se ve "recortado". Bajar este valor arregla eso.
              </p>
            </div>
            <div class="form-row form-row-2">
              <div class="form-group">
                <label class="form-label">Margen del ticket (mm)</label>
                <input type="number" class="form-control" id="set-ticket-margin" value="${s.ticketMarginMM ?? 2}" min="0" max="10" step="0.5" oninput="Settings.updateTicketPreview()" />
              </div>
              <div class="form-group">
                <label class="form-label">Desplazamiento horizontal (mm)</label>
                <input type="number" class="form-control" id="set-ticket-offset" value="${s.ticketOffsetXMM ?? 0}" min="-10" max="30" step="0.5" oninput="Settings.updateTicketPreview()" />
              </div>
            </div>
            <p style="font-size:0.78rem;color:var(--text-muted);margin-top:-8px">
              Si el ticket sale con texto cortado por un lado (falta info de ese lado y sobra papel en blanco del otro), es que el papel real no queda alineado con el cabezal de la impresora. Sube el "Desplazamiento horizontal" en pasos de 2-3mm e imprime una prueba hasta que el texto quede completo dentro del papel — este valor ahora sí mueve la impresión térmica real, no solo la vista previa. (Un valor negativo solo afecta la vista previa/impresión por navegador, no la térmica USB.)
            </p>
            <div class="form-row form-row-2">
              <div class="form-group">
                <label class="form-label">Tabla de caracteres</label>
                <select class="form-select" id="set-printer-charset">
                  <option value="PC437" ${(s.printerCharset||'PC437')=='PC437'?'selected':''}>PC437 (recomendado)</option>
                  <option value="CP1252" ${s.printerCharset=='CP1252'?'selected':''}>CP1252</option>
                  <option value="ASCII" ${s.printerCharset=='ASCII'?'selected':''}>Sin tildes (máx. compatibilidad)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Avance antes de cortar (líneas)</label>
                <input type="number" class="form-control" id="set-printer-feed" value="${s.printerFeedLines ?? 4}" min="0" max="10" step="1" />
              </div>
            </div>
            <p style="font-size:0.78rem;color:var(--text-muted);margin-top:-8px">
              Si las letras con tilde (á, é, ñ...) salen como cuadros negros o como caracteres raros (p.ej. chinos), ninguna tabla de tu impresora coincide con lo que asumimos — usa "Sin tildes": nunca sale corrupto, solo pierde el acento. Si el corte se lleva parte del texto, aumenta el avance antes de cortar.
            </p>
            <div class="form-row form-row-2">
              <div class="form-group">
                <label class="form-label">Tamaño de letra</label>
                <select class="form-select" id="set-printer-fontsize">
                  <option value="normal" ${(s.printerFontSize||'normal')=='normal'?'selected':''}>Normal</option>
                  <option value="small" ${s.printerFontSize=='small'?'selected':''}>Pequeña (condensada)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Caracteres por línea (0 = automático)</label>
                <input type="number" class="form-control" id="set-printer-chars" value="${s.printerCharsPerLine ?? 0}" min="0" max="64" step="1" />
              </div>
            </div>
            <p style="font-size:0.78rem;color:var(--text-muted);margin-top:-8px">
              Si el texto sale muy grande y se recorta al llegar al borde del papel, cambia a letra "Pequeña" y/o sube "Caracteres por línea" (prueba 42 u otro valor hasta que las líneas quepan completas en el ancho real de tu impresora).
            </p>
            <div class="form-group">
              <label class="toggle-wrap">
                <input type="checkbox" class="toggle-input" id="set-printer-cut" ${s.printerAutoCut!==false?'checked':''}>
                <div class="toggle-slider"></div>
                <span class="toggle-label">Cortar papel automáticamente</span>
              </label>
            </div>
            <div class="form-group">
              <label class="toggle-wrap">
                <input type="checkbox" class="toggle-input" id="set-printer-drawer" ${s.printerOpenDrawer?'checked':''}>
                <div class="toggle-slider"></div>
                <span class="toggle-label">Abrir cajón de dinero al cobrar en efectivo</span>
              </label>
            </div>
            <div class="form-group">
              <label class="form-label">Nombre del puente nativo</label>
              <input type="text" class="form-control" id="set-printer-bridge" value="${escapeHtml(s.printerBridgeName||'AndroidPrinter')}" placeholder="AndroidPrinter" />
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary" onclick="Settings.saveTicket()">💾 Guardar</button>
              <button class="btn btn-secondary" onclick="Settings.testPrint()">🖨️ Imprimir prueba</button>
            </div>
          </div>
        </div>
        <div style="flex:1; min-width:300px; max-width:400px;">
           <h3 style="margin-bottom:12px; font-size:14px; color:var(--text-muted)">Vista previa del ticket</h3>
           <div id="ticket-preview-container" style="background:#fff; padding:16px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.1); color:#000; overflow-y:auto; max-height:600px; display:flex; justify-content:center;">
              <!-- preview goes here -->
           </div>
        </div>
      </div>`;
    }

    if(tab === 'kitchen') return `
      <div class="card" style="max-width:480px">
        <div class="card-header"><div class="card-title">🍳 Temporizador de cocina</div></div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="form-group">
            <label class="form-label">Tiempo estimado de preparación (minutos)</label>
            <input type="number" class="form-control" id="set-kitchen-timer" value="${s.kitchenTimerMinutes||30}" min="1" max="120" step="1" />
            <p style="font-size:0.8rem;color:var(--text-muted);margin-top:6px">
              Al pasar un pedido a "En el horno" en Cocina, la cuenta regresiva parte de este tiempo. Al llegar a cero, la tarjeta entra en alarma (parpadeo + sonido).
            </p>
          </div>
          <button class="btn btn-primary" onclick="Settings.saveKitchen()">💾 Guardar</button>
        </div>
      </div>`;

    if(tab === 'system') return `
      <div style="display:flex;flex-direction:column;gap:16px;max-width:640px">
        <div class="card">
          <div class="card-header"><div class="card-title">🔧 Sistema</div></div>
          <div style="display:flex;flex-direction:column;gap:16px">
            <div class="form-group">
              <label class="toggle-wrap">
                <input type="checkbox" class="toggle-input" id="set-theme" ${DB.getSettings().theme==='light'?'checked':''}
                  onchange="Settings.toggleTheme(this.checked)">
                <div class="toggle-slider"></div>
                <span class="toggle-label">Modo Claro</span>
              </label>
            </div>
            <div class="form-group">
              <label class="toggle-wrap">
                <input type="checkbox" class="toggle-input" id="set-sound" ${DB.getSettings().soundEnabled!==false?'checked':''}
                  onchange="Settings.toggleSound(this.checked)">
                <div class="toggle-slider"></div>
                <span class="toggle-label">Sonidos del sistema</span>
              </label>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Datos</div></div>
          <div style="margin-bottom:20px;">
            <button class="btn btn-secondary" onclick="Settings.exportData()">Exportar todos los datos (Backup)</button>
          </div>
          <div class="setting-card">
            <h4 style="margin-bottom:8px">Borrar Historial de Ventas</h4>
            <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:16px">Elimina todas las órdenes, sesiones de caja y métricas. <b>¡No borra tu menú!</b></p>
            <button class="btn btn-warning" onclick="Settings.resetSales()">Borrar Ventas</button>
          </div>
          <div class="setting-card">
            <h4 style="margin-bottom:8px">Restablecer Todo de Fábrica</h4>
            <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:16px">Cuidado: Esto borrará absolutamente todo (ventas, menú, ajustes y clientes).</p>
            <button class="btn btn-danger" onclick="Settings.resetData()">Restablecer todo</button>
          </div>
          <p style="font-size:0.8rem;color:var(--text-muted);margin-top:12px">Versión 1.0.0 — PizzaSport POS © 2026</p>
        </div>
      </div>`;
    return '';
  };

  const renderUsersList = () => {
    const users = DB.getUsers();
    const roleLabels = { admin:'Administrador', cashier:'Cajero', cook:'Cocinero' };
    const roleColors = { admin:'role-admin', cashier:'role-cashier', cook:'role-cook' };
    return `
      <table class="data-table">
        <thead><tr><th>Usuario</th><th>Rol</th><th>PIN</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="avatar avatar-sm ${roleColors[u.role]||'av-blue'}">${escapeHtml(u.initials||u.name[0])}</div>
                  <div style="font-weight:600">${escapeHtml(u.name)}</div>
                </div>
              </td>
              <td><span class="badge ${u.role==='admin'?'badge-red':u.role==='cashier'?'badge-blue':'badge-orange'}">${roleLabels[u.role]||u.role}</span></td>
              <td>
                <span style="font-family:monospace;letter-spacing:0.1em;color:var(--text-muted)">
                  ${'•'.repeat(u.pin?.length||4)}
                </span>
              </td>
              <td><span class="badge ${u.active?'badge-green':'badge-gray'}">${u.active?'Activo':'Inactivo'}</span></td>
              <td>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-secondary btn-sm" onclick="Settings.openUserForm('${u.id}')">✏️ Editar</button>
                  ${u.id !== State.get('currentUser')?.id ? `<button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="Settings.deleteUser('${u.id}')">🗑️</button>` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  };

  const setTab = (tab) => {
    _tab = tab;
    ['business','users','ticket','kitchen','system'].forEach(t => document.getElementById(`st-${t}`)?.classList.toggle('active', t === tab));
    const el = document.getElementById('settings-content');
    if(el) el.innerHTML = renderTab(tab);
  };

  const saveBusiness = () => {
    const s = DB.getSettings();
    DB.saveSettings({
      ...s,
      bizName:    document.getElementById('set-biz-name')?.value?.trim() || s.bizName,
      bizRFC:     document.getElementById('set-biz-rfc')?.value?.trim() || '',
      bizAddress: document.getElementById('set-biz-addr')?.value?.trim() || '',
      bizPhone:   document.getElementById('set-biz-phone')?.value?.trim() || '',
      bizEmail:   document.getElementById('set-biz-email')?.value?.trim() || '',
      currencySymbol: document.getElementById('set-currency')?.value?.trim() || 'Q',
      currency:   document.getElementById('set-currency-name')?.value?.trim() || 'Q',
      taxEnabled: document.getElementById('set-tax-en')?.checked || false,
      taxRate:    parseFloat(document.getElementById('set-tax-rate')?.value)||0
    });
    Notify.success('Configuración guardada');
  };

  const saveTicket = () => {
    const s = DB.getSettings();
    DB.saveSettings({
      ...s,
      ticketLogo: document.getElementById('set-ticket-logo')?.value || '',
      ticketLogoSizeMM:   (() => { const v = parseFloat(document.getElementById('set-ticket-logo-size')?.value); return isNaN(v) ? 24 : v; })(),
      ticketHeader: document.getElementById('set-ticket-header')?.value || '',
      ticketFooter: document.getElementById('set-ticket-footer')?.value || '',
      ticketSlogan: document.getElementById('set-ticket-slogan')?.value || '',
      printCopies:  parseInt(document.getElementById('set-copies')?.value)||1,
      printerPaperWidth:  document.getElementById('set-printer-width')?.value || '80',
      ticketMarginMM:     parseFloat(document.getElementById('set-ticket-margin')?.value) || 0,
      ticketOffsetXMM:    parseFloat(document.getElementById('set-ticket-offset')?.value) || 0,
      printerCharset:     document.getElementById('set-printer-charset')?.value || 'PC437',
      printerFeedLines:   (() => { const v = parseInt(document.getElementById('set-printer-feed')?.value, 10); return isNaN(v) ? 4 : v; })(),
      printerFontSize:    document.getElementById('set-printer-fontsize')?.value || 'normal',
      printerCharsPerLine:(() => { const v = parseInt(document.getElementById('set-printer-chars')?.value, 10); return isNaN(v) ? 0 : v; })(),
      printerAutoCut:     document.getElementById('set-printer-cut')?.checked ?? true,
      printerOpenDrawer:  document.getElementById('set-printer-drawer')?.checked || false,
      printerBridgeName:  document.getElementById('set-printer-bridge')?.value?.trim() || 'AndroidPrinter'
    });
    Notify.success('Ticket configurado');
  };

  const testPrint = () => {
    const s = DB.getSettings();
    const demoOrder = {
      number: 0, type:'mesa', tableId:'1', customerId:null, notes:'',
      items: [
        { qty:1, name:'Pizza Clásica', size:'Mediana', unitPrice:230, subtotal:230, mods:[] },
        { qty:2, name:'Gaseosa 12 onz', unitPrice:22, subtotal:44, mods:[] }
      ],
      subtotal:274, discount:0, tax: s.taxEnabled ? 274*(s.taxRate/100) : 0,
      total: s.taxEnabled ? 274 + 274*(s.taxRate/100) : 274,
      paymentMethod:'cash', cashGiven:300, cashChange:26
    };
    Printer.print(demoOrder);
    Notify.info(Printer.isThermalPrinterReady() ? 'Enviando ticket de prueba a la impresora...' : 'Abriendo diálogo de impresión...');
  };

  const saveKitchen = () => {
    const s = DB.getSettings();
    const minutes = parseInt(document.getElementById('set-kitchen-timer')?.value);
    DB.saveSettings({
      ...s,
      kitchenTimerMinutes: (minutes > 0 ? minutes : 30)
    });
    Notify.success('Temporizador de cocina guardado');
  };

  const toggleTax = (enabled) => {
    const wrap = document.getElementById('tax-rate-wrap');
    const inp  = document.getElementById('set-tax-rate');
    if(wrap) wrap.style.opacity = enabled ? '1' : '0.4';
    if(inp)  inp.disabled = !enabled;
  };

  const toggleSound = (enabled) => {
    DB.saveSettings({...DB.getSettings(), soundEnabled:enabled});
    Notify.info(enabled ? 'Sonido activado' : 'Sonido desactivado');
  };

  const toggleTheme = (isLight) => {
    const theme = isLight ? 'light' : 'dark';
    DB.saveSettings({...DB.getSettings(), theme});
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('ps_theme', theme); } catch(e) {}
  };

  const openUserForm = (id=null) => {
    const u = id ? DB.getUser(id) : { active:true, role:'cashier' };
    PizzaPos.ui.showModal(`
      <div class="modal-header"><div class="modal-title">${id?'Editar':'Nuevo'} Usuario</div><button class="modal-close" onclick="PizzaPos.ui.closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="form-row form-row-2">
          <div class="form-group"><label class="form-label">Nombre</label><input type="text" class="form-control" id="uf-name" value="${escapeHtml(u.name||'')}" /></div>
          <div class="form-group">
            <label class="form-label">Rol</label>
            <select class="form-select" id="uf-role">
              <option value="admin" ${u.role==='admin'?'selected':''}>Administrador</option>
              <option value="cashier" ${u.role==='cashier'?'selected':''}>Cajero</option>
            </select>
          </div>
        </div>
        <div class="form-row form-row-2">
          <div class="form-group">
            <label class="form-label">PIN (4 dígitos)</label>
            <input type="password" class="form-control" id="uf-pin" maxlength="4" placeholder="${id?'Dejar en blanco para no cambiar':'****'}" value="" />
          </div>
          <div class="form-group">
            <label class="form-label">Iniciales (avatar)</label>
            <input type="text" class="form-control" id="uf-initials" maxlength="3" value="${escapeHtml(u.initials||'')}" placeholder="Ej: AD" />
          </div>
        </div>
        <div class="form-group">
          <label class="toggle-wrap">
            <input type="checkbox" class="toggle-input" id="uf-active" ${u.active?'checked':''}>
            <div class="toggle-slider"></div>
            <span class="toggle-label">Usuario activo</span>
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="PizzaPos.ui.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="Settings.saveUser('${id||''}')">Guardar</button>
      </div>
    `, 'modal-sm');
  };

  const saveUser = (id) => {
    const name     = document.getElementById('uf-name')?.value?.trim();
    const pin      = document.getElementById('uf-pin')?.value?.trim();
    const role     = document.getElementById('uf-role')?.value;
    const initials = document.getElementById('uf-initials')?.value?.trim();
    const active   = document.getElementById('uf-active')?.checked;
    if(!name) { Notify.warning('Datos incompletos', 'El nombre es obligatorio'); return; }
    // El PIN es obligatorio solo al crear un usuario nuevo; al editar, dejarlo en
    // blanco conserva el PIN actual (el cliente nunca recibe el PIN real del servidor).
    if(!id && (!pin || pin.length < 4)) { Notify.warning('Datos incompletos', 'El PIN de 4 dígitos es obligatorio para un usuario nuevo'); return; }
    if(pin && pin.length < 4) { Notify.warning('PIN inválido', 'El PIN debe tener 4 dígitos'); return; }
    const data = { id:id||undefined, name, role, initials:initials||name.slice(0,2).toUpperCase(), active };
    if(pin) data.pin = pin;
    id ? DB.updateUser(id, data) : DB.createUser(data);
    PizzaPos.ui.closeModal();
    const el = document.getElementById('users-list');
    if(el) el.innerHTML = renderUsersList();
    Notify.success(id?'Usuario actualizado':'Usuario creado', escapeHtml(name));
  };

  const deleteUser = async (id) => {
    const u = DB.getUser(id);
    const ok = await Notify.confirm('Eliminar usuario', `¿Eliminar a ${escapeHtml(u?.name)}?`, {confirmClass:'btn-danger', confirmText:'Eliminar'});
    if(ok) { DB.deleteUser(id); const el = document.getElementById('users-list'); if(el) el.innerHTML = renderUsersList(); Notify.success('Usuario eliminado'); }
  };

  const exportData = () => {
    const data = {
      settings: DB.getSettings(), products: DB.getProducts(),
      categories: DB.getCategories(), customers: DB.getCustomers(),
      orders: DB.getOrders(), tables: DB.getTables(),
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`pizzasport_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    Notify.success('Datos exportados', 'Archivo de respaldo descargado');
  };

  const resetSales = async () => {
    const ok = await Notify.confirm('⚠️ BORRAR VENTAS', 'Esto eliminará todas las órdenes, sesiones de caja y movimientos de efectivo. El menú y los usuarios se mantendrán.', {confirmClass:'btn-warning', confirmText:'Sí, borrar ventas', cancelText:'Cancelar', icon:'⚠️'});
    if(!ok) return;
    try {
      const res = await DB.apiFetch('/api/reset-sales', { method: 'POST' });
      if(!res.ok) { Notify.error('Error', 'No se pudo borrar (¿sesión expirada?)'); return; }
      localStorage.removeItem('ps_auth_token'); // Forzamos re-login para recargar todo desde la BD
      Notify.success('Ventas borradas', 'Recargando...');
      setTimeout(() => location.reload(), 1500);
    } catch(e) {
      Notify.error('Error', 'No se pudo conectar al servidor');
    }
  };

  const resetData = async () => {
    const ok = await Notify.confirm('⚠️ RESTABLECER TODO', 'Esto eliminará TODOS los datos del sistema incluyendo órdenes, menú, clientes y configuración. Esta acción NO se puede deshacer.', {confirmClass:'btn-danger', confirmText:'Sí, restablecer todo', cancelText:'Cancelar', icon:'⚠️'});
    if(!ok) return;
    try {
      const res = await DB.apiFetch('/api/reset', { method: 'POST' });
      if(!res.ok) { Notify.error('Error', 'No se pudo restablecer (¿sesión expirada?)'); return; }
      localStorage.clear(); // wipe total, incluyendo el token de sesión: fuerza login limpio
      Notify.success('Datos restablecidos', 'Recargando...');
      setTimeout(() => location.reload(), 1500);
    } catch(e) {
      Notify.error('Error', 'No se pudo conectar al servidor');
    }
  };

  const updateTicketPreview = () => {
    const container = document.getElementById('ticket-preview-container');
    if (!container) return;
    
    const currentSettings = DB.getSettings();
    const mockSettings = {
      ...currentSettings,
      ticketLogo: document.getElementById('set-ticket-logo')?.value || '',
      ticketLogoSizeMM: document.getElementById('set-ticket-logo-size')?.value ?? currentSettings.ticketLogoSizeMM,
      ticketHeader: document.getElementById('set-ticket-header')?.value || '',
      ticketFooter: document.getElementById('set-ticket-footer')?.value || '',
      ticketSlogan: document.getElementById('set-ticket-slogan')?.value || '',
      printerPaperWidth: document.getElementById('set-printer-width')?.value || currentSettings.printerPaperWidth,
      ticketMarginMM: document.getElementById('set-ticket-margin')?.value ?? currentSettings.ticketMarginMM,
      ticketOffsetXMM: document.getElementById('set-ticket-offset')?.value ?? currentSettings.ticketOffsetXMM
    };
    if (typeof Printer !== 'undefined' && Printer.applyTicketCSSVars) Printer.applyTicketCSSVars(mockSettings);

    const demoOrder = {
      number: 123,
      type: 'mesa',
      tableId: 'M1',
      items: [
        { qty: 1, name: 'Pizza Clásica', size: 'Mediana', subtotal: 230, unitPrice: 230 },
        { qty: 2, name: 'Gaseosa 12 onz', subtotal: 44, unitPrice: 22 }
      ],
      subtotal: 274,
      tax: currentSettings.taxEnabled ? 274 * (currentSettings.taxRate/100) : 0,
      discount: 0,
      total: currentSettings.taxEnabled ? 274 + (274 * (currentSettings.taxRate/100)) : 274,
      paymentMethod: 'cash',
      cashGiven: 300,
      cashChange: 26
    };

    if (typeof Printer !== 'undefined' && Printer.buildTicketHTML) {
      container.innerHTML = Printer.buildTicketHTML(demoOrder, mockSettings);
    } else {
      container.innerHTML = '<div style="padding:20px;text-align:center;">Cargando vista previa...</div>';
    }
  };

  return { render, init:()=>{}, setTab, saveBusiness, saveTicket, testPrint, saveKitchen, toggleTax, toggleSound, toggleTheme, openUserForm, saveUser, deleteUser, exportData, resetData, resetSales, updateTicketPreview };
})();
