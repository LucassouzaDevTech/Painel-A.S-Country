// ==============================================
// CONFIGURAÇÃO
// Configure as credenciais pela tela de Configurações do painel.
// Elas serão salvas no localStorage do seu navegador.
// ==============================================

// URL base do site (usada para montar as imagens locais)
const SITE_BASE_URL = 'https://seu-site.netlify.app';

// Credenciais fixas (opcional) — se preferir não usar a tela de Configurações,
// cole aqui. Caso contrário, deixe as strings vazias e configure pelo painel.
const SUPABASE_URL_FIXED  = '';
const SUPABASE_KEY_FIXED  = '';
const CLOUD_NAME_FIXED    = '';
const CLOUD_PRESET_FIXED  = '';

// ==============================================
// ESTADO
// ==============================================
let cfg = {};
let products = [];
let categories = [];
let currentImgUploadedUrl = '';
let currentEditingId = null;
let currentCatFilter = 'todos';
let searchQuery = '';
let hlCatFilter = 'todos';

// ==============================================
// CONFIG — localStorage
// ==============================================
function loadConfig() {
  try { cfg = JSON.parse(localStorage.getItem('asc_cfg') || '{}'); }
  catch(e) { cfg = {}; }

  if (!cfg.supabaseUrl && SUPABASE_URL_FIXED) cfg.supabaseUrl = SUPABASE_URL_FIXED;
  if (!cfg.supabaseKey && SUPABASE_KEY_FIXED) cfg.supabaseKey = SUPABASE_KEY_FIXED;
  if (!cfg.cloudName && CLOUD_NAME_FIXED) cfg.cloudName = CLOUD_NAME_FIXED;
  if (!cfg.cloudPreset && CLOUD_PRESET_FIXED) cfg.cloudPreset = CLOUD_PRESET_FIXED;
}

function saveConfig() {
  localStorage.setItem('asc_cfg', JSON.stringify(cfg));
}

// ==============================================
// INICIALIZAÇÃO
// ==============================================
async function initApp() {
  loadConfig();
  fillSettingsForm();
  updateStatusIcons();
  await loadAllData();
  renderDashboard();
  renderProductsGrid();
  renderCatList();
  renderCatFilterRow();
  fillCategorySelect();
}

async function loadAllData() {
  if (cfg.supabaseUrl && cfg.supabaseKey) {
    await loadFromSupabase();
  } else {
    loadFromLocal();
  }
}

// ==============================================
// SUPABASE
// ==============================================
async function sbFetch(path, options = {}) {
  const url = cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + path;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey': cfg.supabaseKey,
      'Authorization': 'Bearer ' + cfg.supabaseKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Supabase error: ' + err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

async function loadFromSupabase() {
  try {
    showLoading('Carregando dados...');
    const [cats, prods] = await Promise.all([
      sbFetch('categories?order=name.asc'),
      sbFetch('products?order=created_at.desc')
    ]);
    categories = cats;
    products = prods;
    saveToLocal();
  } catch(e) {
    console.error(e);
    toast('Erro ao conectar com o Supabase. Usando dados locais.', 'error');
    loadFromLocal();
  } finally {
    hideLoading();
  }
}

async function saveProductToSupabase(product) {
  if (!cfg.supabaseUrl) return;
  const existing = products.find(p => p.id === product.id);
  if (existing) {
    await sbFetch(`products?id=eq.${product.id}`, { method: 'PATCH', body: JSON.stringify(product) });
  } else {
    await sbFetch('products', { method: 'POST', body: JSON.stringify(product) });
  }
}

async function deleteProductFromSupabase(id) {
  if (!cfg.supabaseUrl) return;
  await sbFetch(`products?id=eq.${id}`, { method: 'DELETE' });
}

async function saveCatToSupabase(cat) {
  if (!cfg.supabaseUrl) return;
  const existing = categories.find(c => c.id === cat.id);
  if (existing) {
    await sbFetch(`categories?id=eq.${cat.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: cat.name, slug: cat.slug, icon: cat.icon })
    });
  } else {
    const res = await sbFetch('categories', { method: 'POST', body: JSON.stringify({ name: cat.name, slug: cat.slug, icon: cat.icon }) });
    return res[0];
  }
}

async function deleteCatFromSupabase(id) {
  if (!cfg.supabaseUrl) return;
  await sbFetch(`categories?id=eq.${id}`, { method: 'DELETE' });
}

// ==============================================
// LOCAL STORAGE (fallback sem banco)
// ==============================================
function loadFromLocal() {
  try {
    products = JSON.parse(localStorage.getItem('asc_products') || '[]');
    const savedCats = JSON.parse(localStorage.getItem('asc_categories') || '[]');
    categories = savedCats.length > 0 ? savedCats : getDefaultCategories();
  } catch(e) {
    products = [];
    categories = getDefaultCategories();
  }
}

function saveToLocal() {
  localStorage.setItem('asc_products', JSON.stringify(products));
  localStorage.setItem('asc_categories', JSON.stringify(categories));
}

function getDefaultCategories() {
  return [
    { id: '1', name: 'Chapéus', slug: 'chapeus', icon: 'fas fa-hat-cowboy' },
    { id: '2', name: 'Botas', slug: 'botas', icon: 'fas fa-shoe-prints' },
    { id: '3', name: 'Cintos', slug: 'cintos', icon: 'fas fa-gem' },
    { id: '4', name: 'Camisas', slug: 'camisas', icon: 'fas fa-tshirt' },
    { id: '5', name: 'Camisas Femininas', slug: 'camisas-femininas', icon: 'fas fa-user-tie' },
    { id: '6', name: 'Calças', slug: 'calcas', icon: 'fas fa-person' },
    { id: '7', name: 'Calças Femininas', slug: 'calcas-femininas', icon: 'fas fa-user' },
    { id: '8', name: 'Acessórios', slug: 'acessorios', icon: 'fas fa-ring' },
  ];
}

// ==============================================
// CLOUDINARY
// ==============================================
async function uploadToCloudinary(file) {
  if (!cfg.cloudName || !cfg.cloudPreset) {
    throw new Error('Cloudinary não configurado. Configure nas Configurações.');
  }
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', cfg.cloudPreset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, {
    method: 'POST',
    body: fd
  });
  if (!res.ok) throw new Error('Erro no upload para Cloudinary');
  const data = await res.json();
  return data.secure_url;
}

// ==============================================
// NAVEGAÇÃO
// ==============================================
function navigate(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelector(`[data-view="${view}"]`).classList.add('active');

  const titles = {
    dashboard: 'Dashboard',
    products: 'Produtos',
    categories: 'Categorias',
    highlights: 'Destaques',
    export: 'Exportar Site',
    settings: 'Configurações'
  };
  document.getElementById('topbarTitle').textContent = titles[view] || view;

  if (view === 'export') generateCodePreview();
  if (view === 'highlights') renderHighlightsGrid();
  closeSidebar();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

// ==============================================
// DESTAQUES
// ==============================================
function renderHighlightsGrid() {
  const grid = document.getElementById('highlightsGrid');
  const countEl = document.getElementById('featuredCount');
  if (!grid) return;

  const featuredTotal = products.filter(p => p.is_featured).length;
  if (countEl) countEl.textContent = `${featuredTotal}/6 em destaque`;

  const hlRow = document.getElementById('hlCatFilterRow');
  if (hlRow) {
    const chips = [{ name: 'Todos', slug: 'todos' }, ...categories];
    hlRow.innerHTML = chips.map(c =>
      `<button class="filter-chip${c.slug === hlCatFilter ? ' active' : ''}" onclick="hlSetCatFilter('${c.slug}')">${c.name}</button>`
    ).join('');
  }

  let filtered = products;
  if (hlCatFilter !== 'todos') filtered = filtered.filter(p => p.category === hlCatFilter);

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-star"></i><p>Nenhum produto nesta categoria</p></div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const imgSrc = (p.image_url && p.image_url.startsWith('http'))
      ? p.image_url
      : (p.image_path ? SITE_BASE_URL + '/' + p.image_path : '');
    const cat = categories.find(c => c.slug === p.category);
    const isFeat = !!p.is_featured;
    return `<div style="background:var(--bg3);border:2px solid ${isFeat ? 'var(--gold)' : 'var(--border)'};border-radius:var(--radius);overflow:hidden;position:relative;transition:.2s;">
      ${isFeat ? `<div style="position:absolute;top:.5rem;right:.5rem;background:var(--gold);color:#1a1410;font-size:.65rem;font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:1px;padding:.2rem .5rem;border-radius:20px;z-index:1;">★ DESTAQUE</div>` : ''}
      ${imgSrc
        ? `<img src="${imgSrc}" style="width:100%;height:130px;object-fit:cover;" onerror="this.style.display='none'" />`
        : `<div style="width:100%;height:130px;background:var(--bg2);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:1.5rem;"><i class="fas fa-image"></i></div>`
      }
      <div style="padding:.75rem;">
        <div style="font-size:.7rem;color:var(--gold);font-family:'Barlow Condensed',sans-serif;margin-bottom:.2rem;">${cat ? cat.name : p.category}</div>
        <div style="font-size:.9rem;font-family:'Barlow Condensed',sans-serif;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:.75rem;" title="${p.name}">${p.name}</div>
        <button class="btn btn-sm ${isFeat ? 'btn-danger' : 'btn-gold'}" style="width:100%;" onclick="toggleFeatured('${p.id}')">
          <i class="fas fa-${isFeat ? 'star-half-alt' : 'star'}"></i>
          ${isFeat ? 'Remover Destaque' : 'Marcar como Destaque'}
        </button>
      </div>
    </div>`;
  }).join('');
}

function hlSetCatFilter(slug) {
  hlCatFilter = slug;
  renderHighlightsGrid();
}

async function toggleFeatured(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;

  const newVal = !p.is_featured;
  const featuredNow = products.filter(x => x.is_featured).length;

  if (newVal && featuredNow >= 6) {
    toast('Limite de 6 destaques atingido! Remova um antes de adicionar.', 'error');
    return;
  }

  p.is_featured = newVal;

  try {
    if (cfg.supabaseUrl && cfg.supabaseKey) {
      await sbFetch(`products?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_featured: newVal })
      });
    }
    saveToLocal();
    renderHighlightsGrid();
    renderDashboard();
    toast(newVal ? '⭐ Produto adicionado aos destaques!' : 'Produto removido dos destaques.', 'success');
  } catch(e) {
    p.is_featured = !newVal;
    toast('Erro ao atualizar: ' + e.message, 'error');
  }
}

// ==============================================
// DASHBOARD
// ==============================================
function renderDashboard() {
  document.getElementById('statTotal').textContent = products.length;
  document.getElementById('statCategories').textContent = categories.length;
  document.getElementById('statWithImg').textContent = products.filter(p => p.image_url || p.image_path).length;
  if (document.getElementById('statFeatured')) {
    document.getElementById('statFeatured').textContent = products.filter(p => p.is_featured).length;
  }

  document.getElementById('setupBanner').style.display = (!cfg.supabaseUrl || !cfg.supabaseKey) ? 'block' : 'none';

  const recent = products.slice(0, 6);
  const el = document.getElementById('recentProducts');
  if (recent.length === 0) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem;">Nenhum produto ainda. <button class="btn btn-gold btn-sm" style="margin-left:.5rem" onclick="navigate(\'products\')">Adicionar</button></p>';
    return;
  }
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.75rem;">${
    recent.map(p => {
      const imgSrc = (p.image_url && p.image_url.startsWith('http')) ? p.image_url : (p.image_path ? SITE_BASE_URL + '/' + p.image_path : '');
      const cat = categories.find(c => c.slug === p.category);
      return `<div style="background:var(--bg4);border-radius:8px;overflow:hidden;">
        ${imgSrc
          ? `<img src="${imgSrc}" style="width:100%;height:100px;object-fit:cover;" onerror="this.style.display='none'" />`
          : `<div style="width:100%;height:100px;background:var(--bg2);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:1.5rem;"><i class="fas fa-image"></i></div>`
        }
        <div style="padding:.6rem;">
          <div style="font-size:.7rem;color:var(--gold);font-family:'Barlow Condensed',sans-serif;">${cat ? cat.name : p.category}</div>
          <div style="font-size:.85rem;font-family:'Barlow Condensed',sans-serif;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
        </div>
      </div>`;
    }).join('')
  }</div>`;
}

// ==============================================
// PRODUTOS
// ==============================================
function renderProductsGrid() {
  const grid = document.getElementById('productsGrid');
  let filtered = products;

  if (currentCatFilter !== 'todos') {
    filtered = filtered.filter(p => p.category === currentCatFilter);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-box-open"></i><p>Nenhum produto encontrado</p></div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const imgSrc = (p.image_url && p.image_url.startsWith('http'))
      ? p.image_url
      : (p.image_path ? SITE_BASE_URL + '/' + p.image_path : '');
    const cat = categories.find(c => c.slug === p.category);
    return `<div class="product-card">
      ${imgSrc
        ? `<img class="product-card-img" src="${imgSrc}" alt="${p.name}"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
           <div class="product-card-img-placeholder" style="display:none;">
             <div style="text-align:center;">
               <i class="fas fa-image" style="display:block;margin-bottom:.4rem;"></i>
               <span style="font-size:.65rem;word-break:break-all;padding:0 .5rem;opacity:.6;">${imgSrc}</span>
             </div>
           </div>`
        : `<div class="product-card-img-placeholder"><i class="fas fa-image"></i></div>`
      }
      <div class="product-card-body">
        <div class="product-card-cat">${cat ? cat.name : p.category}</div>
        <div class="product-card-name">${p.name}</div>
        <div class="product-card-desc">${p.description || 'Sem descrição'}</div>
        <div class="product-id-badge">ID: ${p.id}</div>
        <div class="product-card-actions">
          <button class="btn btn-outline btn-sm" onclick="openProductModal('${p.id}')"><i class="fas fa-edit"></i></button>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteProduct('${p.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderCatFilterRow() {
  const row = document.getElementById('catFilterRow');
  const chips = [{ name: 'Todos', slug: 'todos' }, ...categories];
  row.innerHTML = chips.map(c =>
    `<button class="filter-chip${c.slug === currentCatFilter ? ' active' : ''}" onclick="setCatFilter('${c.slug}')">${c.name}</button>`
  ).join('');
}

function setCatFilter(slug) {
  currentCatFilter = slug;
  renderCatFilterRow();
  renderProductsGrid();
}

function filterProducts(q) {
  searchQuery = q;
  renderProductsGrid();
}

function fillCategorySelect() {
  const sel = document.getElementById('productCategory');
  sel.innerHTML = '<option value="">Selecione...</option>' +
    categories.map(c => `<option value="${c.slug}">${c.name}</option>`).join('');
}

// ==============================================
// MODAL DE PRODUTO
// ==============================================
function openProductModal(id = null) {
  currentEditingId = id;
  currentImgUploadedUrl = '';
  document.getElementById('productModalTitle').textContent = id ? 'EDITAR PRODUTO' : 'NOVO PRODUTO';
  document.getElementById('productId').value = '';
  document.getElementById('productName').value = '';
  document.getElementById('productCategory').value = '';
  document.getElementById('productDesc').value = '';
  document.getElementById('productImageUrl').value = '';
  document.getElementById('productFeatured').checked = false;
  document.getElementById('featuredToggleTrack').style.background = 'var(--bg4)';
  document.getElementById('featuredToggleThumb').style.left = '3px';
  document.getElementById('imgPreview').style.display = 'none';
  document.getElementById('imgPreview').src = '';
  document.getElementById('imgPreviewUrl').style.display = 'none';
  document.getElementById('imgUploadStatus').textContent = '';
  document.getElementById('imgFileInput').value = '';
  switchImgTab('upload', document.querySelector('.img-tab'));

  if (id) {
    const p = products.find(x => x.id === id);
    if (p) {
      document.getElementById('productId').value = p.id;
      document.getElementById('productName').value = p.name;
      document.getElementById('productCategory').value = p.category;
      document.getElementById('productDesc').value = p.description || '';
      const isFeat = !!p.is_featured;
      document.getElementById('productFeatured').checked = isFeat;
      document.getElementById('featuredToggleTrack').style.background = isFeat ? 'var(--gold)' : 'var(--bg4)';
      document.getElementById('featuredToggleThumb').style.left = isFeat ? '23px' : '3px';
      if (p.image_url) {
        if (p.image_url.startsWith('http')) {
          currentImgUploadedUrl = p.image_url;
          document.getElementById('imgPreview').src = p.image_url;
          document.getElementById('imgPreview').style.display = 'block';
          document.getElementById('imgUploadStatus').textContent = '✅ Imagem Cloudinary';
        } else {
          switchImgTab('url', document.querySelectorAll('.img-tab')[1]);
          document.getElementById('productImageUrl').value = p.image_url;
          previewFromUrl(p.image_url);
        }
      } else if (p.image_path) {
        switchImgTab('url', document.querySelectorAll('.img-tab')[1]);
        document.getElementById('productImageUrl').value = p.image_path;
        previewFromUrl(p.image_path);
      }
    }
  }

  document.getElementById('productModal').classList.add('open');
}

function switchImgTab(tab, btn) {
  document.querySelectorAll('.img-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('imgTabUpload').style.display = tab === 'upload' ? 'block' : 'none';
  document.getElementById('imgTabUrl').style.display = tab === 'url' ? 'block' : 'none';
}

async function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('imgPreview').src = e.target.result;
    document.getElementById('imgPreview').style.display = 'block';
  };
  reader.readAsDataURL(file);

  if (!cfg.cloudName || !cfg.cloudPreset) {
    document.getElementById('imgUploadStatus').textContent = '⚠️ Cloudinary não configurado. Configure nas Configurações.';
    document.getElementById('imgUploadStatus').style.color = '#e67e22';
    return;
  }

  document.getElementById('imgUploadStatus').textContent = '⏳ Fazendo upload...';
  document.getElementById('imgUploadStatus').style.color = 'var(--text-muted)';
  try {
    const url = await uploadToCloudinary(file);
    currentImgUploadedUrl = url;
    document.getElementById('imgUploadStatus').textContent = '✅ Upload concluído!';
    document.getElementById('imgUploadStatus').style.color = 'var(--success)';
    document.getElementById('imgPreview').src = url;
  } catch(e) {
    document.getElementById('imgUploadStatus').textContent = '❌ Erro no upload: ' + e.message;
    document.getElementById('imgUploadStatus').style.color = 'var(--danger)';
  }
}

function previewFromUrl(url) {
  const img = document.getElementById('imgPreviewUrl');
  if (url) {
    img.src = url;
    img.style.display = 'block';
    img.onerror = () => img.style.display = 'none';
  } else {
    img.style.display = 'none';
  }
}

async function saveProduct() {
  const name = document.getElementById('productName').value.trim();
  const category = document.getElementById('productCategory').value;
  const desc = document.getElementById('productDesc').value.trim();
  const urlManual = document.getElementById('productImageUrl').value.trim();
  const isEdit = !!document.getElementById('productId').value;

  if (!name || !category) { toast('Preencha nome e categoria!', 'error'); return; }

  const id = isEdit ? document.getElementById('productId').value : 'p_' + Date.now();
  const imageUrl = currentImgUploadedUrl || (urlManual.startsWith('http') ? urlManual : '');
  const imagePath = (!currentImgUploadedUrl && urlManual && !urlManual.startsWith('http')) ? urlManual : '';
  const isFeatured = document.getElementById('productFeatured').checked;

  const product = { id, name, description: desc, category, image_url: imageUrl, image_path: imagePath, is_featured: isFeatured };

  showLoading('Salvando produto...');
  try {
    if (cfg.supabaseUrl && cfg.supabaseKey) await saveProductToSupabase(product);
    const idx = products.findIndex(p => p.id === id);
    if (idx >= 0) products[idx] = product;
    else products.unshift(product);
    saveToLocal();
    closeModal('productModal');
    renderProductsGrid();
    renderDashboard();
    toast('Produto salvo com sucesso!', 'success');
  } catch(e) {
    toast('Erro ao salvar: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

function confirmDeleteProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Excluir o produto "${p.name}"?`)) return;
  deleteProduct(id);
}

async function deleteProduct(id) {
  showLoading('Excluindo...');
  try {
    if (cfg.supabaseUrl && cfg.supabaseKey) await deleteProductFromSupabase(id);
    products = products.filter(p => p.id !== id);
    saveToLocal();
    renderProductsGrid();
    renderDashboard();
    toast('Produto excluído.', 'success');
  } catch(e) {
    toast('Erro: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

// ==============================================
// CATEGORIAS
// ==============================================
function renderCatList() {
  const list = document.getElementById('catList');
  if (categories.length === 0) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-tags"></i><p>Nenhuma categoria ainda</p></div>';
    return;
  }
  list.innerHTML = categories.map(c => {
    const count = products.filter(p => p.category === c.slug).length;
    return `<div class="cat-item">
      <div class="cat-item-info">
        <div class="cat-item-icon"><i class="${c.icon || 'fas fa-tag'}"></i></div>
        <div>
          <div class="cat-item-name">${c.name}</div>
          <div class="cat-item-slug">${c.slug}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:.75rem;">
        <span class="cat-item-count">${count} produto${count !== 1 ? 's' : ''}</span>
        <div class="cat-item-actions">
          <button class="btn btn-outline btn-sm" onclick="openCatModal('${c.id}')"><i class="fas fa-edit"></i></button>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteCat('${c.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openCatModal(id = null) {
  document.getElementById('catModalTitle').textContent = id ? 'EDITAR CATEGORIA' : 'NOVA CATEGORIA';
  document.getElementById('catId').value = id || '';
  document.getElementById('catName').value = '';
  document.getElementById('catSlug').value = '';
  document.getElementById('catIcon').value = 'fas fa-tag';

  if (id) {
    const c = categories.find(x => x.id === id);
    if (c) {
      document.getElementById('catName').value = c.name;
      document.getElementById('catSlug').value = c.slug;
      document.getElementById('catIcon').value = c.icon || 'fas fa-tag';
    }
  }
  document.getElementById('catModal').classList.add('open');
}

function autoSlug(name) {
  const slug = name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-');
  document.getElementById('catSlug').value = slug;
}

async function saveCat() {
  const name = document.getElementById('catName').value.trim();
  const slug = document.getElementById('catSlug').value.trim();
  const icon = document.getElementById('catIcon').value.trim() || 'fas fa-tag';
  const id = document.getElementById('catId').value;

  if (!name || !slug) { toast('Preencha nome e slug!', 'error'); return; }
  if (!id && categories.find(c => c.slug === slug)) { toast('Slug já existe!', 'error'); return; }

  const cat = { id: id || String(Date.now()), name, slug, icon };

  showLoading('Salvando categoria...');
  try {
    if (cfg.supabaseUrl && cfg.supabaseKey) {
      const result = await saveCatToSupabase(cat);
      if (result && result.id) cat.id = result.id;
    }
    const idx = categories.findIndex(c => c.id === cat.id);
    if (idx >= 0) categories[idx] = cat;
    else categories.push(cat);
    saveToLocal();
    closeModal('catModal');
    renderCatList();
    renderCatFilterRow();
    fillCategorySelect();
    toast('Categoria salva!', 'success');
  } catch(e) {
    toast('Erro: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

function confirmDeleteCat(id) {
  const c = categories.find(x => x.id === id);
  if (!c) return;
  const count = products.filter(p => p.category === c.slug).length;
  const msg = count > 0
    ? `A categoria "${c.name}" tem ${count} produto(s). Deseja excluir mesmo assim?`
    : `Excluir a categoria "${c.name}"?`;
  if (!confirm(msg)) return;
  deleteCat(id);
}

async function deleteCat(id) {
  showLoading('Excluindo...');
  try {
    if (cfg.supabaseUrl && cfg.supabaseKey) await deleteCatFromSupabase(id);
    categories = categories.filter(c => c.id !== id);
    saveToLocal();
    renderCatList();
    renderCatFilterRow();
    fillCategorySelect();
    toast('Categoria excluída.', 'success');
  } catch(e) {
    toast('Erro: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

// ==============================================
// EXPORTAR
// ==============================================
function generateProductHTML(p, idx) {
  const realId = p.id || (idx + 1);
  const imgSrc = p.image_url || p.image_path || 'uploads/placeholder.jpg';
  const cat = categories.find(c => c.slug === p.category);
  const catName = cat ? cat.name : p.category;
  return `
            <!-- ${catName.toUpperCase()}: ${p.name} -->
            <div class="catalog-item" data-id="${realId}" data-category="${p.category}">
              <div class="catalog-item-image">
                <img src="${imgSrc}" alt="${p.name}" />
              </div>
              <div class="catalog-item-content">
                <h3>${p.name}</h3>
                <p>${p.description || ''}</p>
                <button class="add-to-cart-btn" onclick="addToCartFromHTML(this)">
                  <i class="fas fa-shopping-cart"></i>
                  <span>Adicionar ao Carrinho</span>
                </button>
              </div>
            </div>`;
}

function generateCategoryButtons() {
  const allBtn = `            <button class="category-btn active" data-category="todos" onclick="renderProducts('todos')">
              <i class="fas fa-th"></i>
              <span>Todos</span>
            </button>`;
  const catBtns = categories.map(c =>
    `            <button class="category-btn" data-category="${c.slug}" onclick="renderProducts('${c.slug}')">
              <i class="${c.icon || 'fas fa-tag'}"></i>
              <span>${c.name}</span>
            </button>`
  ).join('\n');
  return allBtn + '\n' + catBtns;
}

function generateCodePreview() {
  if (products.length === 0) {
    document.getElementById('codePreview').textContent = '// Nenhum produto cadastrado ainda.';
    return;
  }
  const preview = products.slice(0, 3).map((p, i) => generateProductHTML(p, i)).join('');
  const more = products.length > 3 ? `\n            <!-- ... mais ${products.length - 3} produto(s) -->` : '';
  document.getElementById('codePreview').textContent = preview + more;
}

function exportSite() {
  const allProductsHtml = products.map((p, i) => generateProductHTML(p, i)).join('');
  const catButtons = generateCategoryButtons();

  const output = `<!-- ========================================================
     PRODUTOS GERADOS PELO PAINEL - AS COUNTRY
     Gerado em: ${new Date().toLocaleString('pt-BR')}
     Total: ${products.length} produto(s) em ${categories.length} categoria(s)
   ======================================================== -->

<!-- INSTRUÇÕES:
  1. Abra seu arquivo index.html no editor
  2. Localize o bloco de botões de categoria (category-filter)
  3. Substitua pelo bloco abaixo:
-->

<!-- BOTÕES DE CATEGORIA -->
          <div class="category-filter">
${catButtons}
          </div>

<!-- ========================================================
  4. Localize o div id="productCatalog"
  5. Substitua TODO o conteúdo interno pelo HTML abaixo:
   ======================================================== -->

          <div class="product-catalog" id="productCatalog">
${allProductsHtml}
          </div>`;

  const blob = new Blob([output], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'produtos-gerados.html';
  a.click();
  toast('Arquivo gerado! Siga as instruções no arquivo.', 'success');
  generateCodePreview();
}

// ==============================================
// CONFIGURAÇÕES
// ==============================================
function fillSettingsForm() {
  document.getElementById('cfgSupabaseUrl').value = cfg.supabaseUrl || '';
  document.getElementById('cfgSupabaseKey').value = cfg.supabaseKey || '';
  document.getElementById('cfgCloudName').value = cfg.cloudName || '';
  document.getElementById('cfgCloudPreset').value = cfg.cloudPreset || '';
}

function saveSettings() {
  cfg.supabaseUrl = document.getElementById('cfgSupabaseUrl').value.trim();
  cfg.supabaseKey = document.getElementById('cfgSupabaseKey').value.trim();
  cfg.cloudName = document.getElementById('cfgCloudName').value.trim();
  cfg.cloudPreset = document.getElementById('cfgCloudPreset').value.trim();
  saveConfig();
  updateStatusIcons();
  loadAllData().then(() => {
    renderDashboard();
    renderProductsGrid();
    renderCatList();
    renderCatFilterRow();
    fillCategorySelect();
  });
  toast('Configurações salvas!', 'success');
}

async function testConnections() {
  showLoading('Testando conexões...');
  let msg = [];

  if (cfg.supabaseUrl && cfg.supabaseKey) {
    try {
      await sbFetch('categories?limit=1');
      msg.push('✅ Supabase: conectado!');
    } catch(e) {
      msg.push('❌ Supabase: ' + e.message);
    }
  } else {
    msg.push('⚠️ Supabase: não configurado');
  }

  msg.push(cfg.cloudName && cfg.cloudPreset
    ? '✅ Cloudinary: configurado (teste fazendo upload de uma imagem)'
    : '⚠️ Cloudinary: não configurado'
  );

  hideLoading();
  alert(msg.join('\n'));
}

function updateStatusIcons() {
  const sb = document.getElementById('supabaseStatus');
  const cl = document.getElementById('cloudinaryStatus');
  if (sb) sb.className = (cfg.supabaseUrl && cfg.supabaseKey) ? 'ok' : '';
  if (cl) cl.className = (cfg.cloudName && cfg.cloudPreset) ? 'ok' : '';
}

// ==============================================
// MODAIS
// ==============================================
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// ==============================================
// LOADING
// ==============================================
function showLoading(text = 'Carregando...') {
  document.getElementById('loadingText').textContent = text;
  document.getElementById('loadingOverlay').classList.add('active');
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('active');
}

// ==============================================
// TOAST
// ==============================================
function toast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon"></span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'slideOut .3s ease forwards';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

// ==============================================
// DRAG & DROP
// ==============================================
const dz = document.getElementById('dropZone');
if (dz) {
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      document.getElementById('imgFileInput').files = e.dataTransfer.files;
      handleFileSelect(document.getElementById('imgFileInput'));
    }
  });
}

// ==============================================
// BOOT
// ==============================================
loadConfig();
document.addEventListener('DOMContentLoaded', () => { initApp(); });
