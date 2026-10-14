const Inventory = (() => {
  let _activeTab = 'stock'; // 'stock', 'beverages', 'recipes'
  let _selectedProductId = null;
  let _selectedSizeName = '';

  const render = () => {
    return `
      <div class="inventory-view">
        <!-- HEADER -->
        <div class="inventory-header">
          <div class="inventory-title-area">
            <div class="inventory-title">Inventario y Recetas</div>
            <div class="inventory-subtitle">Control de insumos, bebidas y deducción automática</div>
          </div>
          ${State.get('currentUser')?.role !== 'admin' ? `
            <div style="background:rgba(255, 165, 0, 0.1); color:var(--ps-orange); padding:8px 12px; border-radius:var(--radius); font-size:0.85rem; display:flex; align-items:center; gap:8px;">
              <span>🔒</span> Modo de Solo Lectura (Solo el Administrador puede editar)
            </div>
          ` : ''}
          <div class="inventory-tabs">
            <button class="inventory-tab-btn ${_activeTab==='stock'?'active':''}" onclick="Inventory.setTab('stock')">
              Insumos
            </button>
            <button class="inventory-tab-btn ${_activeTab==='beverages'?'active':''}" onclick="Inventory.setTab('beverages')">
              Bebidas
            </button>
            <button class="inventory-tab-btn ${_activeTab==='recipes'?'active':''}" onclick="Inventory.setTab('recipes')">
              Recetas
            </button>
          </div>
        </div>

        <!-- CONTENT -->
        <div class="inventory-content">
          ${_activeTab === 'stock' ? renderStockTab('raw') : _activeTab === 'beverages' ? renderStockTab('beverage') : renderRecipesTab()}
        </div>
      </div>
    `;
  };

  /* ── STOCK & BEVERAGES TAB ── */
  const renderStockTab = (type) => {
    const isBeverage = type === 'beverage';
    const items = isBeverage ? DB.getBeverageInventory() : DB.getRawInventory();
    const title = isBeverage ? 'Inventario de Bebidas' : 'Materia Prima';
    const newBtnText = isBeverage ? 'Nueva Bebida' : 'Nuevo Insumo';
    
    const isAdmin = State.get('currentUser')?.role === 'admin';
    
    return `
      <div class="stock-panel">
        <div class="stock-panel-header">
          <div class="stock-panel-title">${title}</div>
          ${isAdmin ? `
            <button class="btn btn-primary btn-sm" onclick="Inventory.openStockModal(null, '${type}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              ${newBtnText}
            </button>
          ` : ''}
        </div>
        <div class="stock-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Unidad</th>
                <th>Costo/Unid.</th>
                <th>Stock Actual</th>
                <th>Stock Mínimo</th>
                ${isAdmin ? '<th style="text-align:right">Acciones</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${items.length ? items.map(i => {
                const isLow = i.currentStock <= i.minStock;
                return `
                <tr>
                  <td style="font-weight:600">${escapeHtml(i.name)}</td>
                  <td style="color:var(--text-muted)">${escapeHtml(i.unit)}</td>
                  <td style="color:var(--text-muted)">C$ ${(i.cost || 0).toFixed(2)}</td>
                  <td class="${isLow ? 'stock-val-low' : 'stock-val-ok'}">${i.currentStock} ${isLow ? '⚠️' : ''}</td>
                  <td style="color:var(--text-muted)">${i.minStock}</td>
                  ${isAdmin ? `
                    <td style="text-align:right; display:flex; gap:6px; justify-content:flex-end">
                      <button class="btn btn-ghost btn-sm" onclick="Inventory.openStockModal('${i.id}', '${type}')">✏️ Editar</button>
                      <button class="btn btn-danger btn-sm" onclick="Inventory.deleteStock('${i.id}')">🗑️</button>
                    </td>
                  ` : ''}
                </tr>
              `}).join('') : `<tr><td colspan="${isAdmin?6:5}" class="empty-state" style="padding:40px; text-align:center; color:var(--text-muted)">No hay elementos registrados.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  /* ── RECIPES TAB ── */
  const renderRecipesTab = () => {
    const products = DB.getProducts();
    const inventory = DB.getRawInventory(); // Recetas solo usan Insumos, no Bebidas (usualmente)
    
    // Build Sidebar Product List
    let productListHtml = '';
    const recipeProducts = products.filter(p => p.categoryId === 'c1' || p.categoryId === 'c2');
    recipeProducts.forEach(p => {
      const isActive = p.id === _selectedProductId;
      productListHtml += `<button class="recipe-product-btn ${isActive?'active':''}" onclick="Inventory.selectProduct('${p.id}')">${escapeHtml(p.name)}</button>`;
    });

    let selectedProd = products.find(p => p.id === _selectedProductId);
    let sizePillsHtml = '';
    let recipe = null;

    if (selectedProd) {
      if (selectedProd.sizes && selectedProd.sizes.length > 0) {
        selectedProd.sizes.forEach(s => {
          const isActive = s.name === _selectedSizeName;
          sizePillsHtml += `<button class="size-pill ${isActive?'active':''}" onclick="Inventory.selectSize('${s.name}')">${escapeHtml(s.name)}</button>`;
        });
      }

      if (_selectedProductId && (selectedProd.sizes.length === 0 || _selectedSizeName)) {
        recipe = DB.getRecipe(_selectedProductId, _selectedSizeName);
      }
    }

    // Cálculo de costo de la receta (precio de materia prima × cantidad)
    let ingredientCosts = [];
    let recipeCost = 0;
    let salePrice = 0;
    if (recipe) {
      ingredientCosts = recipe.ingredients.map(ing => {
        const inv = inventory.find(i => i.id === ing.inventoryId);
        const unitCost = inv?.cost || 0;
        return { ...ing, name: inv?.name || 'Insumo Eliminado', unit: inv?.unit || '', unitCost, lineCost: unitCost * ing.qty };
      });
      recipeCost = ingredientCosts.reduce((a, c) => a + c.lineCost, 0);
    }
    if (selectedProd) {
      salePrice = _selectedSizeName && selectedProd.sizes?.length
        ? (selectedProd.sizes.find(s => s.name === _selectedSizeName)?.price ?? selectedProd.basePrice)
        : (selectedProd.basePrice || 0);
    }
    const margin = salePrice - recipeCost;
    const marginPct = salePrice > 0 ? Math.round((margin / salePrice) * 100) : 0;

    let invOptions = '<option value="">-- Insumo --</option>';
    inventory.forEach(i => invOptions += `<option value="${i.id}">${escapeHtml(i.name)} (${escapeHtml(i.unit)})${i.cost ? ` — C$${Number(i.cost).toFixed(2)}/${escapeHtml(i.unit)}` : ''}</option>`);

    return `
      <div class="recipes-grid">
        
        <!-- Left: Product List -->
        <div class="recipes-sidebar">
          <div class="recipes-sidebar-title">Productos</div>
          <div class="recipes-products-list">
            ${productListHtml}
          </div>
        </div>

        <!-- Right: Recipe Details -->
        <div class="recipes-main">
          ${!_selectedProductId ? `
            <div class="empty-state">
              <div class="empty-icon">🍕</div>
              <div class="empty-title">Selecciona un Producto</div>
              <div class="empty-subtitle">Elige un producto a la izquierda para configurar su receta.</div>
            </div>
          ` : `
            <div class="recipe-panel">
              <div class="recipe-panel-header">
                <div class="recipe-panel-title">
                  Receta: ${escapeHtml(selectedProd.name)}
                </div>
              </div>
              
              ${selectedProd.sizes && selectedProd.sizes.length > 0 ? `
                <div class="recipe-size-pills">
                  ${sizePillsHtml}
                </div>
              ` : ''}

              ${(selectedProd.sizes.length === 0 || _selectedSizeName) ? `
                <!-- Add ingredient -->
                ${State.get('currentUser')?.role === 'admin' ? `
                <div class="recipe-add-row">
                  <div class="form-group">
                    <label class="form-label">Insumo</label>
                    <select class="form-select" id="add-ing-id">${invOptions}</select>
                  </div>
                  <div class="form-group qty-group">
                    <label class="form-label">Cantidad</label>
                    <input type="number" class="form-control" id="add-ing-qty" placeholder="Ej: 1.5" step="0.01">
                  </div>
                  <button class="btn btn-primary recipe-add-btn" onclick="Inventory.addIngredientToRecipe()">Agregar</button>
                </div>
                ` : ''}

                <!-- Ingredients list -->
                <div class="table-container" style="flex:1; overflow-y:auto">
                  ${!recipe || !recipe.ingredients.length ? '<div class="recipe-empty">No hay insumos asignados a esta receta.</div>' : `
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th>Insumo</th>
                          <th>Cantidad</th>
                          <th>Costo Unid.</th>
                          <th>Subtotal</th>
                          ${State.get('currentUser')?.role === 'admin' ? '<th style="text-align:right">Acción</th>' : ''}
                        </tr>
                      </thead>
                      <tbody>
                        ${ingredientCosts.map((ing, idx) => {
                          return `
                            <tr>
                              <td style="font-weight:600">${escapeHtml(ing.name)}</td>
                              <td>${ing.qty} ${escapeHtml(ing.unit)}</td>
                              <td style="color:var(--text-muted)">C$ ${ing.unitCost.toFixed(2)}</td>
                              <td style="font-weight:700">C$ ${ing.lineCost.toFixed(2)}</td>
                              ${State.get('currentUser')?.role === 'admin' ? `
                              <td style="text-align:right">
                                <button class="btn btn-danger btn-sm" onclick="Inventory.removeIngredientFromRecipe(${idx})">🗑️</button>
                              </td>
                              ` : ''}
                            </tr>
                          `;
                        }).join('')}
                      </tbody>
                    </table>
                    <div class="recipe-cost-summary">
                      <div class="cost-row"><span>Costo de producción</span><strong>C$ ${recipeCost.toFixed(2)}</strong></div>
                      <div class="cost-row"><span>Precio de venta</span><strong>C$ ${salePrice.toFixed(2)}</strong></div>
                      <div class="cost-row ${margin < 0 ? 'negative' : 'positive'}"><span>Margen</span><strong>C$ ${margin.toFixed(2)} (${marginPct}%)</strong></div>
                    </div>
                  `}
                </div>
              ` : `
                <div class="recipe-empty">Selecciona un tamaño arriba para configurar la receta.</div>
              `}
            </div>
          `}
        </div>
      </div>
    `;
  };

  /* ── LOGIC & HANDLERS ── */
  const init = () => {};

  const setTab = (t) => {
    _activeTab = t;
    refresh();
  };

  const selectProduct = (id) => {
    _selectedProductId = id;
    const prod = DB.getProducts().find(p => p.id === id);
    if(prod && prod.sizes && prod.sizes.length > 0) {
      _selectedSizeName = prod.sizes[0].name; // Auto-select first size
    } else {
      _selectedSizeName = '';
    }
    refresh();
  };

  const selectSize = (size) => {
    _selectedSizeName = size;
    refresh();
  };

  const refresh = () => {
    const container = document.getElementById('view-container');
    if(container) container.innerHTML = render();
  };

  /* Stock Modal */
  const openStockModal = (id = null, type = 'raw') => {
    const item = id ? DB.getInventoryItem(id) : null;
    const title = item ? 'Editar' : 'Nuevo';
    const labelTitle = type === 'beverage' ? 'Nombre de la Bebida' : 'Nombre del Insumo';
    
    const html = `
      <div class="modal-header">
        <h3 class="modal-title">${title} ${type === 'beverage' ? 'Bebida' : 'Insumo'}</h3>
        <button class="modal-close" onclick="PizzaPos.ui.closeModal()">✕</button>
      </div>
      <div class="modal-body form-row">
        <div class="form-group">
          <label class="form-label">${labelTitle}</label>
          <input type="text" id="inv-name" class="form-control" value="${escapeHtml(item?.name || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Unidad de Medida (Ej: ${type === 'beverage' ? 'Unidades' : 'Lbs, Oz'})</label>
          <input type="text" id="inv-unit" class="form-control" value="${escapeHtml(item?.unit || (type === 'beverage' ? 'Unidades' : ''))}">
        </div>
        <div class="form-group">
          <label class="form-label">Costo por Unidad (C$)</label>
          <input type="number" id="inv-cost" class="form-control" step="0.01" min="0" value="${item?.cost ?? ''}">
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label">Stock Actual</label>
            <input type="number" id="inv-stock" class="form-control" step="0.01" value="${item?.currentStock ?? ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Alerta Mínima</label>
            <input type="number" id="inv-min" class="form-control" step="0.01" value="${item?.minStock ?? ''}">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="PizzaPos.ui.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="Inventory.saveStock('${id || ''}', '${type}')">Guardar</button>
      </div>
    `;
    PizzaPos.ui.showModal(html, 'modal-md');
  };

  const saveStock = (id, type) => {
    const name = document.getElementById('inv-name').value.trim();
    const unit = document.getElementById('inv-unit').value.trim();
    const currentStock = parseFloat(document.getElementById('inv-stock').value) || 0;
    const minStock = parseFloat(document.getElementById('inv-min').value) || 0;
    const cost = parseFloat(document.getElementById('inv-cost').value) || 0;

    if(!name || !unit) return Notify.error('Error', 'Completa los campos obligatorios');

    const item = {
      id: id || DB.nextId('inv'),
      name, unit, currentStock, minStock, cost, type
    };
    DB.saveInventoryItem(item);
    PizzaPos.ui.closeModal();
    refresh();
    PizzaPos.checkLowStock();
    Notify.success('Guardado correctamente');
  };

  const deleteStock = (id) => {
    if(confirm('¿Eliminar este elemento del inventario?')) {
      DB.deleteInventoryItem(id);
      refresh();
      PizzaPos.checkLowStock();
      Notify.success('Eliminado');
    }
  };

  /* Recipe Actions */
  const addIngredientToRecipe = () => {
    const invId = document.getElementById('add-ing-id').value;
    const qty = parseFloat(document.getElementById('add-ing-qty').value);

    if(!invId || !qty || qty <= 0) return Notify.error('Error', 'Selecciona un insumo y una cantidad válida');

    let recipe = DB.getRecipe(_selectedProductId, _selectedSizeName);
    if(!recipe) {
      recipe = { productId: _selectedProductId, sizeName: _selectedSizeName, ingredients: [] };
    }

    // if already exists, add qty
    const existing = recipe.ingredients.find(i => i.inventoryId === invId);
    if(existing) {
      existing.qty += qty;
    } else {
      recipe.ingredients.push({ inventoryId: invId, qty });
    }

    DB.saveRecipe(recipe);
    refresh();
    Notify.success('Insumo agregado a la receta');
  };

  const removeIngredientFromRecipe = (idx) => {
    const recipe = DB.getRecipe(_selectedProductId, _selectedSizeName);
    if(recipe) {
      recipe.ingredients.splice(idx, 1);
      DB.saveRecipe(recipe);
      refresh();
    }
  };

  return {
    render, init, setTab,
    selectProduct, selectSize,
    openStockModal, saveStock, deleteStock,
    addIngredientToRecipe, removeIngredientFromRecipe
  };
})();
