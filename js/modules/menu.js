/* ═══════════════════════════════════════════════════════════
   menu.js — Menu Management Module
   ═══════════════════════════════════════════════════════════ */
const MenuAdmin = (() => {
  let _activeCat = 'all';

  const render = () => {
    const cats = DB.getCategories();
    return `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div class="page-header">
        <div><div class="page-title">📦 Gestión de Menú</div><div class="page-subtitle">Productos y categorías</div></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" onclick="MenuAdmin.openCatForm()">+ Categoría</button>
          <button class="btn btn-primary" onclick="MenuAdmin.openProductForm()">+ Producto</button>
        </div>
      </div>
      <div style="padding:8px 24px;flex-shrink:0">
        <div class="tabs">
          <button class="tab-btn active" id="mcat-all" onclick="MenuAdmin.filterCat('all')">Todos</button>
          ${cats.map(c => `<button class="tab-btn" id="mcat-${c.id}" onclick="MenuAdmin.filterCat('${c.id}')">${c.icon} ${escapeHtml(c.name)}</button>`).join('')}
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:0 24px 24px" id="menu-products-list">
        ${renderProductList()}
      </div>
    </div>`;
  };

  const renderProductList = () => {
    const cats = DB.getCategories();
    let products = DB.getProducts();
    if(_activeCat !== 'all') products = products.filter(p => p.categoryId === _activeCat);
    if(!products.length) return `<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 22h20L12 2z"/></svg></div><div class="empty-title">Sin productos</div></div>`;
    const sym = DB.getSettings().currencySymbol;
    return `
    <table class="data-table">
      <thead><tr><th>Producto</th><th>Categoría</th><th>Precio base</th><th>Tamaños</th><th>Disponible</th><th>Acciones</th></tr></thead>
      <tbody>
        ${products.map(p => {
          const cat = cats.find(c => c.id === p.categoryId);
          return `<tr>
            <td><div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:1.5rem" class="prod-svg-icon">${p.emoji||'<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 22h20L12 2z"/></svg>'}</span>
              <div><div style="font-weight:600">${escapeHtml(p.name)}</div><div style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(p.description||'')}</div></div>
            </div></td>
            <td>${cat?`${cat.icon} ${escapeHtml(cat.name)}`:'—'}</td>
            <td style="font-weight:700;color:var(--ps-orange)">${sym}${p.basePrice}</td>
            <td style="font-size:0.8rem;color:var(--text-muted)">${p.sizes?.length ? p.sizes.map(s=>escapeHtml(s.name)).join(', ') : '—'}</td>
            <td>
              <label class="toggle-wrap">
                <input type="checkbox" class="toggle-input" ${p.available?'checked':''} onchange="MenuAdmin.toggleAvailable('${p.id}',this.checked)">
                <div class="toggle-slider"></div>
              </label>
            </td>
            <td><div style="display:flex;gap:6px">
              <button class="btn btn-secondary btn-sm" onclick="MenuAdmin.openProductForm('${p.id}')">✏️ Editar</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="MenuAdmin.deleteProduct('${p.id}')">🗑️</button>
            </div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  };

  const refresh = () => {
    const el = document.getElementById('menu-products-list');
    if(el) el.innerHTML = renderProductList();
  };

  const filterCat = (catId) => {
    _activeCat = catId;
    document.querySelectorAll('[id^="mcat-"]').forEach(b => b.classList.toggle('active', b.id === `mcat-${catId}`));
    refresh();
  };

  const openProductForm = (id=null) => {
    const cats = DB.getCategories();
    const p = id ? DB.getProduct(id) : { available:true, sizes:[], extras:[], basePrice:0, inventoryId:'' };
    const sym = DB.getSettings().currencySymbol;
    const inventoryItems = DB.getInventory();

    PizzaPos.ui.showModal(`
      <div class="modal-header">
        <div class="modal-title">${id?'Editar':'Nuevo'} Producto</div>
        <button class="modal-close" onclick="PizzaPos.ui.closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-row form-row-2">
          <div class="form-group">
            <label class="form-label">Nombre <span class="required">*</span></label>
            <input type="text" class="form-control" id="pf-name" value="${escapeHtml(p.name||'')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Imagen del producto</label>
            <div style="display:flex;gap:10px;align-items:flex-start">
              <img id="pf-image-preview" src="${escapeHtml(p.image||'')}" alt=""
                style="width:56px;height:56px;object-fit:cover;border-radius:8px;background:var(--bg-3);flex-shrink:0;display:${p.image?'block':'none'}"
                onerror="this.style.display='none'" />
              <div style="flex:1;display:flex;flex-direction:column;gap:6px">
                <input type="file" accept="image/*" class="form-control" id="pf-image-file" onchange="MenuAdmin.onImageFileSelected(event)" />
                <input type="text" class="form-control" id="pf-image" value="${escapeHtml(p.image||'')}" placeholder="o pega una ruta/URL: assets/pizza.png"
                  oninput="MenuAdmin.updateImagePreview()" style="font-size:0.75rem" />
              </div>
            </div>
          </div>
        </div>
        <div class="form-row form-row-2">
          <div class="form-group">
            <label class="form-label">Categoría <span class="required">*</span></label>
            <select class="form-select" id="pf-cat">
              ${cats.map(c => `<option value="${c.id}" ${p.categoryId===c.id?'selected':''}>${c.icon} ${escapeHtml(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Precio base (${sym}) <span class="required">*</span></label>
            <input type="number" class="form-control" id="pf-price" value="${p.basePrice||0}" min="0" step="0.01" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Descripción</label>
          <input type="text" class="form-control" id="pf-desc" value="${escapeHtml(p.description||'')}" placeholder="Ingredientes principales..." />
        </div>
        <div class="form-group">
          <label class="form-label">Tamaños (nombre:precio, separados por coma)</label>
          <input type="text" class="form-control" id="pf-sizes" value="${escapeHtml((p.sizes||[]).map(s=>`${s.name}:${s.price}`).join(', '))}"
            placeholder="Personal:85, Mediana:145, Grande:185, Familiar:235" />
        </div>
        <div class="form-group">
          <label class="form-label">Extras (nombre:precio, separados por coma)</label>
          <input type="text" class="form-control" id="pf-extras" value="${escapeHtml((p.extras||[]).map(e=>`${e.name}:${e.price}`).join(', '))}"
            placeholder="Doble queso:20, Orilla rellena:25" />
        </div>
        <div class="form-group">
          <label class="form-label">Enlace a Inventario (Opcional - Ideal para Bebidas)</label>
          <select class="form-select" id="pf-inventory-id">
            <option value="">-- Sin enlace --</option>
            ${inventoryItems.map(i => `<option value="${i.id}" ${p.inventoryId===i.id?'selected':''}>${escapeHtml(i.name)} (${escapeHtml(i.unit)})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="toggle-wrap">
            <input type="checkbox" class="toggle-input" id="pf-avail" ${p.available!==false?'checked':''}>
            <div class="toggle-slider"></div>
            <span class="toggle-label">Disponible para venta</span>
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="PizzaPos.ui.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="MenuAdmin.saveProduct('${id||''}')">Guardar</button>
      </div>
    `, 'modal-lg');
  };

  // Redimensiona y comprime a JPEG antes de guardar como data: URI —
  // DB.js sincroniza todo el store cada 5s, así que fotos sin comprimir
  // inflarían ese payload en cada tablet conectada.
  const compressImageFile = (file, maxDim=640, quality=0.82) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if(width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
      reader.readAsDataURL(file);
    });
  };

  const onImageFileSelected = async (event) => {
    const file = event.target.files?.[0];
    if(!file) return;
    if(!file.type.startsWith('image/')) { Notify.warning('Archivo inválido', 'Selecciona una imagen'); return; }
    try {
      const dataUrl = await compressImageFile(file);
      const input = document.getElementById('pf-image');
      if(input) input.value = dataUrl;
      updateImagePreview();
    } catch(e) {
      Notify.error('No se pudo procesar la imagen', String(e.message||e));
    }
  };

  const updateImagePreview = () => {
    const src = document.getElementById('pf-image')?.value || '';
    const preview = document.getElementById('pf-image-preview');
    if(!preview) return;
    preview.style.display = src ? 'block' : 'none';
    if(src) preview.src = src;
  };

  const saveProduct = (id) => {
    const name     = document.getElementById('pf-name')?.value?.trim();
    const price    = parseFloat(document.getElementById('pf-price')?.value)||0;
    const catId    = document.getElementById('pf-cat')?.value;
    if(!name || !catId) { Notify.warning('Campos requeridos','Nombre y categoría son obligatorios'); return; }

    const parsePairs = (str) => (str||'').split(',').map(s => s.trim()).filter(Boolean).map(s => {
      const [name,...rest] = s.split(':'); return { name:name.trim(), price:parseFloat(rest.join(':'))||0 };
    });

    const product = {
      id: id || undefined,
      name, image: document.getElementById('pf-image')?.value?.trim() || '',
      categoryId:catId, basePrice:price,
      description:   document.getElementById('pf-desc')?.value?.trim() || '',
      sizes:  parsePairs(document.getElementById('pf-sizes')?.value),
      extras: parsePairs(document.getElementById('pf-extras')?.value),
      inventoryId: document.getElementById('pf-inventory-id')?.value || '',
      available: document.getElementById('pf-avail')?.checked !== false
    };

    DB.saveProduct(product);
    PizzaPos.ui.closeModal();
    refresh();
    Notify.success(id ? 'Producto actualizado' : 'Producto creado', escapeHtml(name));
  };

  const toggleAvailable = (id, val) => {
    const p = DB.getProduct(id);
    if(p) DB.saveProduct({...p, available:val});
    Notify.info(val ? 'Disponible' : 'No disponible', escapeHtml(DB.getProduct(id)?.name || ''));
  };

  const deleteProduct = async (id) => {
    const p = DB.getProduct(id);
    const ok = await Notify.confirm('Eliminar producto', `¿Eliminar "${escapeHtml(p?.name)}"?`, {confirmClass:'btn-danger', confirmText:'Eliminar'});
    if(ok) { DB.deleteProduct(id); refresh(); Notify.success('Producto eliminado'); }
  };

  const openCatForm = (id=null) => {
    const c = id ? DB.getCategories().find(x=>x.id===id) : {};
    PizzaPos.ui.showModal(`
      <div class="modal-header"><div class="modal-title">${id?'Editar':'Nueva'} Categoría</div><button class="modal-close" onclick="PizzaPos.ui.closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="form-row form-row-2">
          <div class="form-group"><label class="form-label">Nombre</label><input type="text" class="form-control" id="caf-name" value="${escapeHtml(c.name||'')}" /></div>
          <div class="form-group"><label class="form-label">Icon (SVG/Text)</label><input type="text" class="form-control" id="caf-icon" value="${(c.icon || c.icon === '') ? c.icon : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 22h20L12 2z"/></svg>'}" /></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="PizzaPos.ui.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="MenuAdmin.saveCat('${id||''}')">Guardar</button>
      </div>
    `, 'modal-sm');
  };

  const saveCat = (id) => {
    const name = document.getElementById('caf-name')?.value?.trim();
    if(!name) return;
    DB.saveCategory({ id:id||undefined, name, icon:document.getElementById('caf-icon')?.value||'', order:99 });
    PizzaPos.ui.closeModal();
    // Re-render full module to refresh tabs
    PizzaPos.router.go('menu');
    Notify.success('Categoría guardada', escapeHtml(name));
  };

  return { render, init:()=>{}, filterCat, openProductForm, onImageFileSelected, updateImagePreview, saveProduct, toggleAvailable, deleteProduct, openCatForm, saveCat };
})();
