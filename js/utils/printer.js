/* ═══════════════════════════════════════════════════════════
   printer.js — Thermal Ticket Printer
   Vía nativa: puente JS del WebView Android (ESC/POS crudo a la
   impresora térmica USB). Si no está disponible (ej. navegador de
   escritorio), cae a window.print() sobre el ticket HTML/CSS.
   ═══════════════════════════════════════════════════════════ */
const Printer = (() => {
  const fmt = (n) => {
    const s = DB.getSettings();
    return `${s.currencySymbol}${Number(n).toLocaleString('es',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  };

  /* ── Puente nativo Android ──
     La app WebView debe exponer, vía addJavascriptInterface, un objeto
     global (nombre configurable en Ajustes > Ticket, por defecto
     "AndroidPrinter") con estos métodos:
       printBase64(base64String: String): String   → JSON síncrono
         {"success":true} o {"success":false,"error":"..."}
       isConnected(): Boolean                        → opcional, para el
         indicador de estado en Ajustes sin necesidad de imprimir.
     Ver UsbPrinterBridge.kt (proyecto android/) para la implementación
     de referencia. */
  const getBridge = () => {
    const name = DB.getSettings().printerBridgeName || 'AndroidPrinter';
    const bridge = window[name];
    return (bridge && typeof bridge.printBase64 === 'function') ? bridge : null;
  };

  const isThermalPrinterReady = () => {
    const bridge = getBridge();
    if(!bridge) return false;
    if(typeof bridge.isConnected === 'function') {
      try { return !!bridge.isConnected(); } catch(e) { return true; }
    }
    return true;
  };

  // Devuelve { success, error? }. Nunca lanza.
  const sendToNativePrinter = (bytes) => {
    const bridge = getBridge();
    if(!bridge) return { success:false, error:'Puente nativo no disponible' };
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    const base64 = btoa(binary);
    try {
      const raw = bridge.printBase64(base64);
      if(raw === undefined || raw === null) return { success:true }; // puentes antiguos sin retorno
      return JSON.parse(raw);
    } catch(e) {
      return { success:false, error:String(e.message||e) };
    }
  };

  /* ── ESC/POS command builder ── */
  const ESC = 0x1B, GS = 0x1D;
  const cmd = {
    init:        () => [ESC, 0x40],
    align:       (n) => [ESC, 0x61, n],       // 0 izq, 1 centro, 2 der
    bold:        (on) => [ESC, 0x45, on ? 1 : 0],
    doubleSize:  (on) => [GS, 0x21, on ? 0x11 : 0x00],
    feed:        (n) => [ESC, 0x64, n],
    cut:         () => [GS, 0x56, 1],          // corte parcial
    cashDrawer:  () => [ESC, 0x70, 0x00, 0x19, 0xFA],
    // n=0 → PC437 (tabla nativa de la inmensa mayoría de clones ESC/POS),
    // n=16 → WPC1252. Ver Ajustes > Ticket > "Tabla de caracteres".
    codepage:    (charset) => [ESC, 0x74, charset === 'CP1252' ? 16 : 0],
    // 0=Font A (grande, ~12x24px), 1=Font B (condensada, ~9x17px). El ancho
    // real en caracteres de cada fuente varía por modelo de impresora — por
    // eso Ajustes > Ticket también permite fijar "Caracteres por línea" a mano.
    font:        (small) => [ESC, 0x4D, small ? 1 : 0],
    // GS L nL nH — margen izquierdo en unidades de motion unit horizontal
    // (por defecto, sin GS P previo, coincide con el pitch nativo de puntos
    // de la mayoría de impresoras ESC/POS: ~1/8mm). Ver ticketOffsetXMM en
    // Ajustes > Ticket > "Desplazamiento horizontal": si el papel real es más
    // angosto que el cabezal (o no queda parejo con la guía), lo impreso
    // arranca fuera del papel por un lado y se "recorta" — este margen mueve
    // el punto de arranque para que caiga dentro del papel real.
    leftMargin:  (dots) => [GS, 0x4C, dots & 0xFF, (dots >> 8) & 0xFF]
  };

  // Quita emoji/símbolos fuera de Latin-1 (la mayoría de impresoras ESC/POS no los soportan)
  const stripEmoji = (str) => String(str).replace(/[\u{1F000}-\u{1FFFF}\u{2190}-\u{2BFF}\u{FE0F}]/gu, '').trim();

  // PC437 no tiene tildes en mayúsculas para vocales españolas: se degrada a la
  // letra sin tilde en vez de imprimir un glifo/bloque incorrecto ("negro").
  const PC437_MAP = {
    'á':0xA0,'é':0x82,'í':0xA1,'ó':0xA2,'ú':0xA3,'ñ':0xA4,'Ñ':0xA5,
    'ü':0x81,'Ü':0x9A,'¿':0xA8,'¡':0xAD,
    'Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U'
  };

  // Transliteración plana (quita tildes/ñ) para impresoras cuyo "codepage 0"
  // no es PC437 real (clones baratos que traen una tabla propia, típicamente
  // con caracteres CJK en esas posiciones — se ven como glifos chinos donde
  // debería ir una tilde). Sin depender de ninguna tabla, nunca sale corrupto.
  const ASCII_MAP = {
    'á':'a','é':'e','í':'i','ó':'o','ú':'u','ñ':'n','ü':'u',
    'Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U','Ñ':'N','Ü':'U',
    '¿':'?','¡':'!'
  };

  const textToBytes = (str, charset='PC437') => {
    const bytes = [];
    for(const ch of stripEmoji(str)) {
      if(charset === 'ASCII' && ASCII_MAP[ch] !== undefined) {
        bytes.push(ASCII_MAP[ch].charCodeAt(0));
        continue;
      }
      if(charset === 'PC437' && PC437_MAP[ch] !== undefined) {
        const v = PC437_MAP[ch];
        bytes.push(typeof v === 'string' ? v.charCodeAt(0) : v);
        continue;
      }
      // CP1252 coincide con Unicode para el rango Latin-1 (0x00-0xFF)
      const code = ch.charCodeAt(0);
      bytes.push(code < 256 ? code : 0x3F); // '?' para caracteres no soportados por el codepage
    }
    return bytes;
  };

  // Centrado por defecto (no alineado a la izquierda). Motivo: en clones
  // ESC/POS muy baratos, GS L (margen) y a veces ESC M (fuente chica) se
  // ignoran silenciosamente, pero ESC a (align) sí se respeta — se ve en que
  // el logo (que ya usaba align:1) cae bien sobre el papel mientras el texto
  // sin alinear (por defecto a la izquierda, columna 0 del cabezal) se
  // recorta cuando el papel real es más angosto que el cabezal y queda
  // centrado bajo él. Alinear todo al centro por defecto hace que cualquier
  // línea que quepa en el papel real caiga dentro de él, sin depender de
  // adivinar un margen exacto en mm.
  const pushLine = (bytes, str, opts={}, charset='PC437') => {
    bytes.push(...cmd.align(opts.align !== undefined ? opts.align : 1));
    if(opts.bold) bytes.push(...cmd.bold(true));
    if(opts.double) bytes.push(...cmd.doubleSize(true));
    bytes.push(...textToBytes(str, charset));
    bytes.push(0x0A);
    if(opts.double) bytes.push(...cmd.doubleSize(false));
    if(opts.bold) bytes.push(...cmd.bold(false));
  };

  /* ── Logo → bitmap ESC/POS (GS v 0) ──
     Convierte la imagen del logo a blanco/negro puro (sin escala de grises: en
     una térmica el gris se simula con trama de puntos, que es justo lo que se
     ve "borroso"). El resultado se cachea por ruta+tamaño para no reprocesar
     la imagen en cada impresión.

     El tamaño lo controla Ajustes > Ticket ("Tamaño del logo"), en mm, no el
     ancho del papel: una imagen cuadrada a ancho completo (p.ej. 576x576 en
     papel de 80mm) genera ~40KB de datos que muchas impresoras baratas no
     pueden recibir de un tirón — su buffer se desborda y el bulkTransfer
     falla a medio camino (síntoma: se imprime solo una parte del logo y
     luego revienta la conexión USB). MM_TO_PX asume ~203dpi (8 dots/mm),
     estándar en impresoras térmicas; LOGO_HARD_MAX_* son un tope de
     seguridad independiente de lo que el usuario configure. */
  const MM_TO_PX = 8;
  const LOGO_HARD_MAX_DIM = 320;   // ~40mm de lado, tope duro pase lo que pase en Ajustes
  const LOGO_HARD_MAX_BYTES = 14000;
  const _logoCache = {};
  const loadLogoRaster = (path, sizeMM) => new Promise((resolve) => {
    if(!path) return resolve(null);
    const boxDim = Math.max(1, Math.min(LOGO_HARD_MAX_DIM, Math.round((Number(sizeMM) || 24) * MM_TO_PX)));
    const cacheKey = `${path}|${boxDim}`;
    if(_logoCache[cacheKey]) return resolve(_logoCache[cacheKey]);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(boxDim / img.naturalWidth, boxDim / img.naturalHeight, 1);
        let w = Math.max(1, Math.round(img.naturalWidth * scale));
        let h = Math.max(1, Math.round(img.naturalHeight * scale));
        // Tope duro de bytes por si la imagen es muy alargada (poco cuadrada).
        if(Math.ceil(w / 8) * h > LOGO_HARD_MAX_BYTES) {
          const shrink = Math.sqrt(LOGO_HARD_MAX_BYTES / (Math.ceil(w / 8) * h));
          w = Math.max(1, Math.round(w * shrink));
          h = Math.max(1, Math.round(h * shrink));
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        const bytesPerRow = Math.ceil(w / 8);
        const packed = new Uint8Array(bytesPerRow * h);
        for(let y=0; y<h; y++) {
          for(let x=0; x<w; x++) {
            const i = (y * w + x) * 4;
            const alpha = data[i+3];
            const lum = 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
            if(alpha > 64 && lum < 160) {
              packed[y*bytesPerRow + (x>>3)] |= (0x80 >> (x & 7));
            }
          }
        }
        const result = { widthPx:w, heightPx:h, packed };
        _logoCache[cacheKey] = result;
        resolve(result);
      } catch(e) {
        console.warn('No se pudo procesar el logo del ticket:', e);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = path;
  });

  const logoToGSv0 = (raster) => {
    const bytesPerRow = Math.ceil(raster.widthPx / 8);
    return [
      GS, 0x76, 0x30, 0,
      bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF,
      raster.heightPx & 0xFF, (raster.heightPx >> 8) & 0xFF,
      ...raster.packed
    ];
  };

  // Dos columnas alineadas (nombre a la izquierda, precio a la derecha).
  // Asume que left+right ya caben en `width` — ver moneyRow() para el caso
  // en que no caben (rollos angostos, p.ej. 44/50mm).
  const twoCol = (left, right, width) => {
    left = String(left); right = String(right);
    const spaces = Math.max(1, width - left.length - right.length);
    return left + ' '.repeat(spaces) + right;
  };

  // Fila "etiqueta ... precio". Si no caben juntos en una sola línea, en vez
  // de truncar la etiqueta (perdiendo el nombre del producto — ilegible en
  // rollos angostos) la imprime en su propia línea y el precio alineado a la
  // derecha debajo. `opts.double` duplica el ancho físico del texto, así que
  // se descuenta la mitad del ancho para decidir si cabe (si no, el texto se
  // sale del papel en vez de solo verse feo).
  const moneyRow = (line, width, left, right, opts={}) => {
    left = String(left); right = String(right);
    const fitWidth = opts.double ? Math.max(1, Math.floor(width / 2)) : width;
    if(left.length + right.length + 1 <= fitWidth) {
      line(twoCol(left, right, fitWidth), opts);
    } else {
      line(left, opts);
      line(right.length < fitWidth ? ' '.repeat(fitWidth - right.length) + right : right, opts);
    }
  };

  // Ancho en caracteres, tabla de caracteres, avance antes de cortar y fuente
  // salen de Ajustes > Ticket. "Caracteres por línea" es un valor manual
  // porque el ancho real de fuente A/B varía por modelo de impresora — si el
  // texto sale más grande/chico de lo esperado y se recorta al cortar, es
  // este número el que hay que ajustar (no hay forma de detectarlo solo).
  //
  // "Ancho de papel" es el ancho del ROLLO puesto, no el del cabezal de la
  // impresora: una impresora de 80mm cargada con papel de 58mm (o menos)
  // sigue emitiendo a 80mm de ancho si no se le dice lo contrario, y todo lo
  // que cae fuera del papel real simplemente no se imprime ("se recorta").
  // Los valores por defecto por ancho son los típicos de fábrica para Font A;
  // si no calzan con el modelo real, "Caracteres por línea" los sobreescribe.
  const CHARS_BY_PAPER_MM = { 80:48, 58:32, 50:28, 44:24 };
  const resolvePrintLayout = (settings) => {
    const paperMM = Number(settings.printerPaperWidth) || 80;
    const manualWidth = parseInt(settings.printerCharsPerLine, 10);
    const defaultWidth = CHARS_BY_PAPER_MM[paperMM] || Math.max(16, Math.round(paperMM * 0.6));
    const width = manualWidth > 0 ? manualWidth : defaultWidth;
    // Unidad de motion unit horizontal por defecto ≈ 1/8mm en la mayoría de
    // clones ESC/POS (mismo supuesto que MM_TO_PX para el logo). Solo se
    // acepta desplazamiento hacia la derecha (GS L no soporta márgenes
    // negativos) — un offset negativo configurado solo afecta la vista
    // previa/impresión por navegador.
    const leftMarginDots = Math.max(0, Math.round((Number(settings.ticketOffsetXMM) || 0) * 8));
    return {
      paperMM, width, leftMarginDots,
      charset: ['CP1252','ASCII'].includes(settings.printerCharset) ? settings.printerCharset : 'PC437',
      feedLines: Math.max(0, Math.min(10, parseInt(settings.printerFeedLines, 10) || 4)),
      fontSmall: settings.printerFontSize === 'small'
    };
  };

  const buildEscPosTicket = async (order, settings) => {
    const { width, charset, feedLines, fontSmall, leftMarginDots } = resolvePrintLayout(settings);
    const dash = '-'.repeat(width);
    const now = new Date();
    const bytes = [];
    const line = (str, opts) => pushLine(bytes, str, opts, charset);

    bytes.push(...cmd.init(), ...cmd.codepage(charset), ...cmd.font(fontSmall));
    if(leftMarginDots > 0) bytes.push(...cmd.leftMargin(leftMarginDots));

    if(settings.ticketLogo) {
      const raster = await loadLogoRaster(settings.ticketLogo, settings.ticketLogoSizeMM);
      if(raster) {
        bytes.push(...cmd.align(1), ...logoToGSv0(raster), 0x0A, ...cmd.align(0));
      }
    }

    if(settings.ticketHeader) line(settings.ticketHeader, {align:1});
    line(settings.bizName || 'PizzaSport', {align:1, bold:true, double:true});
    if(settings.bizAddress) line(settings.bizAddress, {align:1});
    if(settings.bizPhone) line(`Tel: ${settings.bizPhone}`, {align:1});
    if(settings.bizRFC) line(`RFC: ${settings.bizRFC}`, {align:1});
    line(dash);

    line(`Orden #${order.number}`, {bold:true});
    line(`${now.toLocaleDateString('es')} ${now.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}`);
    const typeLabels = { mesa:'Mesa', llevar:'Para Llevar', delivery:'Delivery' };
    line(`Tipo: ${typeLabels[order.type]||order.type}${order.tableId?` | Mesa: ${order.tableId}`:''}`);
    const customer = order.customerId ? DB.getCustomer(order.customerId) : null;
    if(customer) line(`Cliente: ${customer.name}`);
    if(order.notes) line(`Nota: ${order.notes}`);
    line(dash);

    order.items.forEach(item => {
      const name = `${item.qty}x ${item.name}${item.size?` (${item.size})`:''}`;
      moneyRow(line, width, name, fmt(item.subtotal), {bold:true});
      if(item.mods && item.mods.length) line(`  + ${item.mods.map(m=>m.name).join(', ')}`);
      if(item.notes) line(`  Nota: ${item.notes}`);
      line(`  P.U: ${fmt(item.unitPrice)}`);
    });
    line(dash);

    moneyRow(line, width, 'Subtotal', fmt(order.subtotal));
    if(order.discount > 0) moneyRow(line, width, 'Descuento', `-${fmt(order.discount)}`);
    if(order.tax > 0) moneyRow(line, width, 'Impuesto', fmt(order.tax));
    moneyRow(line, width, 'TOTAL', fmt(order.total), {bold:true, double:true});

    const payLabels = { cash:'Efectivo', card:'Tarjeta', transfer:'Transferencia', mixed:'Mixto' };
    line(`Pago: ${payLabels[order.paymentMethod]||order.paymentMethod}`);
    if(order.cashGiven) moneyRow(line, width, 'Efectivo recibido', fmt(order.cashGiven));
    if(order.cashChange > 0) moneyRow(line, width, 'Cambio', fmt(order.cashChange));
    if(order.mixedBreakdown) {
      const mb = order.mixedBreakdown;
      if(mb.cash > 0) moneyRow(line, width, '  Efectivo', fmt(mb.cash));
      if(mb.card > 0) moneyRow(line, width, '  Tarjeta', fmt(mb.card));
      if(mb.transfer > 0) moneyRow(line, width, '  Transferencia', fmt(mb.transfer));
    }

    line(dash);
    line(String(order.number).padStart(8,'0'), {align:1});
    line('¡Gracias por su visita!', {align:1});
    if(settings.ticketFooter) line(settings.ticketFooter, {align:1});
    if(settings.ticketSlogan) line(settings.ticketSlogan, {align:1});

    bytes.push(...cmd.feed(feedLines));
    if(settings.printerOpenDrawer && order.paymentMethod === 'cash') bytes.push(...cmd.cashDrawer());
    if(settings.printerAutoCut !== false) bytes.push(...cmd.cut());

    return new Uint8Array(bytes);
  };

  const buildEscPosCashReport = (session, settings) => {
    const { width, charset, feedLines, fontSmall, leftMarginDots } = resolvePrintLayout(settings);
    const dash = '-'.repeat(width);
    const now = new Date();
    const bytes = [];
    const line = (str, opts) => pushLine(bytes, str, opts, charset);

    bytes.push(...cmd.init(), ...cmd.codepage(charset), ...cmd.font(fontSmall));
    if(leftMarginDots > 0) bytes.push(...cmd.leftMargin(leftMarginDots));
    line('REPORTE DE CAJA', {align:1, bold:true, double:true});
    line(`${now.toLocaleDateString('es')} ${now.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}`, {align:1});
    line(dash);
    moneyRow(line, width, 'Apertura', fmt(session.initialAmount));
    moneyRow(line, width, 'Ventas Efectivo', fmt(session.totalCash||0));
    moneyRow(line, width, 'Ventas Tarjeta', fmt(session.totalCard||0));
    moneyRow(line, width, 'Ventas Transf.', fmt(session.totalTransfer||0));
    moneyRow(line, width, 'TOTAL VENTAS', fmt(session.totalSales||0), {bold:true});
    moneyRow(line, width, '+ Ingresos extra', fmt(session.totalMovIn||0));
    moneyRow(line, width, '- Retiros caja', fmt(session.totalMovOut||0));
    moneyRow(line, width, 'EFECTIVO ESPERADO', fmt(session.expectedCash||0), {bold:true, double:true});
    line(dash);
    line(`Cajero: ${session.userName||'—'}`);

    bytes.push(...cmd.feed(feedLines));
    if(settings.printerAutoCut !== false) bytes.push(...cmd.cut());

    return new Uint8Array(bytes);
  };

  const buildTicketHTML = (order, settings) => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('es',{day:'2-digit',month:'2-digit',year:'numeric'});
    const timeStr = now.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
    const sym = settings.currencySymbol;

    const itemsHTML = order.items.map(item => `
      <div class="ticket-item">
        <div class="ticket-item-main">
          <span class="item-name">${item.qty}x ${escapeHtml(item.name)}${item.size?` (${escapeHtml(item.size)})`:''}</span>
          <span class="item-total">${fmt(item.subtotal)}</span>
        </div>
        ${item.mods && item.mods.length ? `<div class="ticket-item-detail">+ ${item.mods.map(m=>escapeHtml(m.name)).join(', ')}</div>` : ''}
        ${item.notes ? `<div class="ticket-item-detail">📝 ${escapeHtml(item.notes)}</div>` : ''}
        <div class="ticket-item-detail">P.U: ${fmt(item.unitPrice)}</div>
      </div>
    `).join('');

    const discount = order.discount || 0;
    const subtotal = order.subtotal;
    const tax = order.tax || 0;
    const total = order.total;

    const payLabels = { cash:'Efectivo', card:'Tarjeta', transfer:'Transferencia', mixed:'Mixto' };
    const payLabel = payLabels[order.paymentMethod] || order.paymentMethod;

    const customer = order.customerId ? DB.getCustomer(order.customerId) : null;
    const typeLabels = { mesa:'Mesa', llevar:'Para Llevar', delivery:'Delivery' };

    return `
    <div class="ticket">
      <div class="ticket-header">
        ${settings.ticketHeader ? `<div class="biz-addr" style="margin-bottom:6px;white-space:pre-line">${escapeHtml(settings.ticketHeader)}</div>` : ''}
        <div class="ticket-logo">
          ${settings.ticketLogo ? `<img src="${escapeHtml(settings.ticketLogo)}" style="display:block; margin:0 auto 8px auto; max-width:${settings.ticketLogoSizeMM || 24}mm;" alt="Logo" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span style="display:none"><span class="t-red">Pizza</span><span class="t-green">Sport</span></span>` : '<span class="t-red">Pizza</span><span class="t-green">Sport</span>'}
        </div>
        <div class="biz-name">${escapeHtml(settings.bizName)}</div>
        <div class="biz-addr">${escapeHtml(settings.bizAddress)}</div>
        <div class="biz-phone">Tel: ${escapeHtml(settings.bizPhone)}</div>
        ${settings.bizRFC ? `<div class="biz-phone">RFC: ${escapeHtml(settings.bizRFC)}</div>` : ''}
      </div>

      <hr class="ticket-divider" />

      <div class="ticket-meta">
        <div class="ticket-meta-row"><span><strong>Orden #${order.number}</strong></span><span>${dateStr} ${timeStr}</span></div>
        <div class="ticket-meta-row"><span>Tipo: ${typeLabels[order.type]||order.type}</span>${order.tableId?`<span>Mesa: ${escapeHtml(order.tableId)}</span>`:''}</div>
        ${customer ? `<div class="ticket-meta-row"><span>Cliente: ${escapeHtml(customer.name)}</span></div>` : ''}
        ${order.notes ? `<div class="ticket-meta-row"><span>📝 ${escapeHtml(order.notes)}</span></div>` : ''}
      </div>

      <hr class="ticket-divider" />

      <div class="ticket-items">${itemsHTML}</div>

      <hr class="ticket-divider" />

      <div class="ticket-totals">
        <div class="ticket-total-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
        ${discount > 0 ? `<div class="ticket-total-row discount"><span>Descuento</span><span>-${fmt(discount)}</span></div>` : ''}
        ${tax > 0 ? `<div class="ticket-total-row"><span>Impuesto</span><span>${fmt(tax)}</span></div>` : ''}
        <div class="ticket-total-row final"><span>TOTAL</span><span>${fmt(total)}</span></div>
      </div>

      <div class="ticket-payment">
        <span>Pago: ${payLabel}</span>
        ${order.cashGiven ? `<span>Efectivo: ${fmt(order.cashGiven)}</span>` : ''}
      </div>
      ${order.cashChange > 0 ? `<div class="ticket-payment"><span>Cambio: ${fmt(order.cashChange)}</span></div>` : ''}
      ${order.mixedBreakdown ? `
        ${order.mixedBreakdown.cash > 0 ? `<div class="ticket-payment"><span>Efectivo</span><span>${fmt(order.mixedBreakdown.cash)}</span></div>` : ''}
        ${order.mixedBreakdown.card > 0 ? `<div class="ticket-payment"><span>Tarjeta</span><span>${fmt(order.mixedBreakdown.card)}</span></div>` : ''}
        ${order.mixedBreakdown.transfer > 0 ? `<div class="ticket-payment"><span>Transferencia</span><span>${fmt(order.mixedBreakdown.transfer)}</span></div>` : ''}
      ` : ''}

      <hr class="ticket-divider" />
      <div class="ticket-barcode">${String(order.number).padStart(8,'0')}</div>

      <div class="ticket-footer">
        <div class="thank-you">¡Gracias por su visita!</div>
        <div>${escapeHtml(settings.ticketFooter||'')}</div>
        ${settings.ticketSlogan ? `<div style="margin-top:4px">${escapeHtml(settings.ticketSlogan)}</div>` : ''}
      </div>
    </div>`;
  };

  // Intenta la impresora térmica; si falla, avisa y cae al diálogo de impresión.
  const tryThermal = async (buildFn, ...args) => {
    if(!isThermalPrinterReady()) return false;
    try {
      const bytes = await buildFn(...args);
      const settings = args[args.length-1];
      const copies = Math.max(1, parseInt(settings.printCopies)||1);
      for(let i=0;i<copies;i++) {
        const result = sendToNativePrinter(bytes);
        if(!result.success) {
          console.warn('Impresión térmica falló:', result.error);
          Notify.error('No se pudo imprimir', result.error || 'Verifica la conexión de la impresora');
          return false;
        }
      }
      return true;
    } catch(e) {
      console.warn('Impresión térmica falló:', e);
      Notify.error('No se pudo imprimir', String(e.message||e));
      return false;
    }
  };

  // Aplica ancho/margen/desplazamiento configurados en Ajustes al ticket HTML
  // (impresión por navegador y vista previa comparten estas variables CSS).
  const applyTicketCSSVars = (settings) => {
    const root = document.documentElement.style;
    const widthMM = Number(settings.printerPaperWidth) || 80;
    root.setProperty('--ticket-paper-width', `${widthMM}mm`);
    root.setProperty('--ticket-margin', `${settings.ticketMarginMM !== undefined && settings.ticketMarginMM !== null && settings.ticketMarginMM !== '' ? Number(settings.ticketMarginMM) : 2}mm`);
    root.setProperty('--ticket-offset-x', `${Number(settings.ticketOffsetXMM) || 0}mm`);
  };

  const print = async (order) => {
    const settings = DB.getSettings();
    if(await tryThermal(buildEscPosTicket, order, settings)) return;

    const area = document.getElementById('print-area');
    if(!area) return;
    applyTicketCSSVars(settings);
    area.innerHTML = buildTicketHTML(order, settings);
    setTimeout(() => window.print(), 100);
  };

  const printCashReport = async (session) => {
    const settings = DB.getSettings();
    if(await tryThermal(buildEscPosCashReport, session, settings)) return;

    const area = document.getElementById('print-area');
    if(!area) return;
    applyTicketCSSVars(settings);
    const now = new Date();
    area.innerHTML = `
      <div class="ticket">
        <div class="ticket-header">
          <div class="ticket-logo">${settings.ticketLogo ? `<img src="${escapeHtml(settings.ticketLogo)}" style="display:block; margin:0 auto 8px auto; max-width:${settings.ticketLogoSizeMM || 24}mm;" alt="Logo" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span style="display:none"><span class="t-red">Pizza</span><span class="t-green">Sport</span></span>` : '<span class="t-red">Pizza</span><span class="t-green">Sport</span>'}</div>
          <div class="biz-name">REPORTE DE CAJA</div>
          <div class="biz-addr">${now.toLocaleDateString('es')} ${now.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</div>
        </div>
        <hr class="ticket-divider" />
        <div class="ticket-totals">
          <div class="ticket-total-row"><span>Apertura</span><span>${fmt(session.initialAmount)}</span></div>
          <div class="ticket-total-row"><span>Ventas Efectivo</span><span>${fmt(session.totalCash||0)}</span></div>
          <div class="ticket-total-row"><span>Ventas Tarjeta</span><span>${fmt(session.totalCard||0)}</span></div>
          <div class="ticket-total-row"><span>Ventas Transf.</span><span>${fmt(session.totalTransfer||0)}</span></div>
          <div class="ticket-total-row final" style="margin-bottom:8px"><span>TOTAL VENTAS</span><span>${fmt(session.totalSales||0)}</span></div>
          <div class="ticket-total-row"><span>+ Ingresos extra</span><span>${fmt(session.totalMovIn||0)}</span></div>
          <div class="ticket-total-row"><span>- Retiros caja</span><span>${fmt(session.totalMovOut||0)}</span></div>
          <div class="ticket-total-row final"><span>EFECTIVO ESPERADO</span><span>${fmt(session.expectedCash||0)}</span></div>
        </div>
        <hr class="ticket-divider" />
        <div class="ticket-footer"><div>Cajero: ${escapeHtml(session.userName||'—')}</div></div>
      </div>`;
    setTimeout(() => window.print(), 100);
  };

  return { print, printCashReport, buildTicketHTML, isThermalPrinterReady, buildEscPosTicket, sendToNativePrinter, applyTicketCSSVars };
})();
