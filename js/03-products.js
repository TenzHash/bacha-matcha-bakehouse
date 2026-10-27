/* Product editing and image upload */
// =========================================================================
// PRODUCT CUSTOMIZATION, IMAGE UPLOAD & MANAGEMENT
// =========================================================================
function previewNewProductImage(input) {
  if (input.files && input.files[0]) {
    newProductImageFile = input.files[0];
    const previewEl = document.getElementById('add-prod-img-preview');
    if (previewEl) {
      previewEl.src = URL.createObjectURL(newProductImageFile);
    }
  }
}

function renderCustomizeTab() {
  const container = document.getElementById('customization-cards-grid');
  if (!container) return;

  container.innerHTML = products.map(prod => `
    <div class="bg-white p-3 sm:p-3.5 rounded-2xl border border-bacha-gingham shadow-sm space-y-2.5 relative ${prod.is_active === false ? 'grayscale bg-gray-50' : ''}">
      
<<<<<<< HEAD
      <div class="cust-top">
        <div class="cust-name">
=======
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 flex-1 min-w-0">
>>>>>>> 78a4d4c6a22f466a33e669601322f3c4a3e70fc5
          <img src="${esc(prod.image)}" alt="${esc(prod.name)}" class="w-10 h-10 rounded-full object-cover border border-bacha-gingham shrink-0" onerror="this.src='images/classic.png';" />
          <div class="flex-1 min-w-0">
            <input type="text" id="edit-name-${prod.id}" aria-label="Flavor name" value="${esc(prod.name)}" class="w-full font-cute font-bold text-sm text-bacha-berry border border-transparent hover:border-bacha-gingham focus:border-bacha-strawberry rounded-lg px-1 py-0.5 focus:outline-none" />
            <span class="text-[12px] text-bacha-text/75 block">ID: #${prod.id} • ${prod.stock} in oven</span>
          </div>
        </div>

<<<<<<< HEAD
        <div class="cust-actions">
=======
        <div class="flex items-center gap-1 shrink-0">
>>>>>>> 78a4d4c6a22f466a33e669601322f3c4a3e70fc5
          <button onclick="toggleProductActiveStatus(${prod.id})" title="${prod.is_active === false ? 'Click to make Available' : 'Click to make Unavailable'}" class="px-2 py-1 rounded-lg font-cute text-[12px] font-bold ${prod.is_active === false ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'} transition">
            ${prod.is_active === false ? '🚫 Unavail' : '✓ Avail'}
          </button>
          <button onclick="deleteProduct(${prod.id})" title="Delete Flavor" aria-label="Delete ${esc(prod.name)}" class="qty-btn p-2.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 transition">
            <i aria-hidden="true" data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-left">
        <div>
          <label class="block text-[12px] font-bold text-bacha-text/75 mb-0.5">Price (₱)</label>
          <input type="number" id="edit-price-${prod.id}" value="${prod.price}" class="w-full px-2 py-1 rounded-xl border border-bacha-gingham text-sm font-cute font-bold text-bacha-matcha focus:outline-none focus:border-bacha-strawberry" />
        </div>

        <div>
          <label class="block text-[12px] font-bold text-bacha-text/75 mb-0.5">Oven Cap</label>
          <input type="number" id="edit-max-${prod.id}" value="${prod.max_stock || 30}" class="w-full px-2 py-1 rounded-xl border border-bacha-gingham text-sm font-cute font-bold text-bacha-text focus:outline-none focus:border-bacha-strawberry" />
        </div>

        <div class="col-span-2 sm:col-span-1">
          <label class="block text-[12px] font-bold text-bacha-text/75 mb-0.5">Promo Tag</label>
          <input type="text" id="edit-promo-${prod.id}" value="${prod.promo_tag || ''}" placeholder="e.g. 10% OFF" class="w-full px-2 py-1 rounded-xl border border-bacha-gingham text-sm font-cute font-bold text-bacha-berry focus:outline-none focus:border-bacha-strawberry" />
        </div>
      </div>

      <div>
        <label class="block text-[12px] font-bold text-bacha-text/75 mb-0.5">Description</label>
        <input type="text" id="edit-desc-${prod.id}" value="${esc(prod.desc || prod.description || '')}" class="w-full px-2 py-1 rounded-xl border border-bacha-gingham text-[13px] text-bacha-text/80 focus:outline-none focus:border-bacha-strawberry" />
      </div>

      <div class="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2 text-left">
        <div>
          <label class="block text-[12px] font-bold text-bacha-text/75 mb-0.5">Category</label>
          <select id="edit-cat-${prod.id}" class="w-full px-2 py-1 rounded-xl border border-bacha-gingham text-[13px] font-bold bg-white focus:outline-none">
            ${CATEGORIES.map(c => `<option value="${c}" ${catOf(prod) === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-[12px] font-bold text-bacha-text/75 mb-0.5">Change Photo</label>
          <input type="file" id="edit-img-${prod.id}" accept="image/*" class="w-full text-[12px] file:mr-1 file:py-0.5 file:px-1.5 file:rounded-lg file:border-0 file:text-[12px] file:font-bold file:bg-bacha-pinkLight file:text-bacha-berry" />
        </div>
      </div>

    </div>
  `).join('');
  lucide.createIcons();
  linkLabels();
}



function toggleAddProductModal(open) {
  const modal = document.getElementById('add-product-modal');
  if (open) {
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.add('opacity-100', 'pointer-events-auto');
    document.getElementById('add-prod-name').value = "";
    document.getElementById('add-prod-price').value = "";
    document.getElementById('add-prod-promo').value = "";
    document.getElementById('add-prod-desc').value = "";
    document.getElementById('add-prod-file').value = "";
    document.getElementById('add-prod-img-preview').src = "images/classic.png";
    newProductImageFile = null;
    document.getElementById('add-prod-name').focus();
  } else {
    modal.classList.add('opacity-0', 'pointer-events-none');
    modal.classList.remove('opacity-100', 'pointer-events-auto');
  }
}

function openAddProductModal() { toggleAddProductModal(true); }


async function saveAllProductCustomizations() {
  const saveErrors = [];
  for (const prod of products) {
    const nameEl = document.getElementById(`edit-name-${prod.id}`);
    const priceEl = document.getElementById(`edit-price-${prod.id}`);
    const maxEl = document.getElementById(`edit-max-${prod.id}`);
    const promoEl = document.getElementById(`edit-promo-${prod.id}`);
    const descEl = document.getElementById(`edit-desc-${prod.id}`);
    const catEl = document.getElementById(`edit-cat-${prod.id}`);
    const imgEl = document.getElementById(`edit-img-${prod.id}`);
    if (catEl) prod.category = catEl.value;
    if (imgEl && imgEl.files[0]) {
      const msg = checkImageFile(imgEl.files[0]);
      const u = msg ? null : await uploadImage(imgEl.files[0], 'product');
      if (u) prod.image = u; else saveErrors.push(`${prod.name}: photo not changed (${msg || 'upload failed'})`);
    }

    if (nameEl) { if (nameEl.value.trim()) prod.name = nameEl.value.trim(); else saveErrors.push(`${prod.name}: name can't be empty, kept the old one`); }
    if (priceEl) { const pv = parseFloat(priceEl.value); if (pv > 0) prod.price = pv; else saveErrors.push(`${prod.name}: price must be above ₱0, kept ₱${prod.price}`); }
    if (maxEl) { const mv = parseInt(maxEl.value, 10); if (mv > 0) prod.max_stock = mv; else saveErrors.push(`${prod.name}: capacity must be 1 or more, kept ${prod.max_stock || 30}`); }
    if (promoEl) prod.promo_tag = promoEl.value.trim();
    if (descEl) {
      prod.desc = descEl.value.trim();
      prod.description = prod.desc;
    }

    if (isSupabaseConfigured && sbClient) {
      const { error: upErr } = await adm('admin_save_product', { p: {
        id: prod.id,
        name: prod.name,
        price: prod.price,
        max_stock: prod.max_stock,
        promo_tag: prod.promo_tag,
        description: prod.desc,
        category: catOf(prod),
        image: prod.image
      } });
      if (upErr) saveErrors.push(`${prod.name}: ${upErr.message}`);
    }
  }

  saveState();
  renderBoxBuilder();
  renderAdmin();
  renderCustomizeTab();
  if (saveErrors.length) { await showBachaAlert("Some changes were not saved:\n\n• " + saveErrors.join("\n• "), "Saved With Problems", "⚠️"); if (isSupabaseConfigured && sbClient) { await initSupabaseData(); } }
  else await showBachaAlert("All product prices, descriptions, and promo badges have been updated live!", "Menu Customizations Saved", "✨");
}

