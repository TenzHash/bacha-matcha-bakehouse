/* Single menu, display modes, cashier POS */
// MULTI-CATEGORY, DISPLAY MODES, SINGLE MENU & POS
// =========================================================================
const CATEGORIES = ['Cookies', 'Drinks', 'Pastries'];
const CAT_ICON = { All: '✨', Cookies: '🍪', Drinks: '🍵', Pastries: '🥐' };
let displayMode = localStorage.getItem('bacha_display_mode') || 'both';
let singleFilter = 'All', posFilter = 'All', posTicket = [], posPayment = 'Cash Walk-in';

function catOf(p) { return p.category || 'Cookies'; }
function boxProducts() { return products.filter(p => p.is_active !== false && catOf(p) === 'Cookies'); }

function pillsHTML(active, fn) {
  return ['All', ...CATEGORIES].map(c => `<button onclick="${fn}('${c}')" aria-pressed="${c === active}" class="px-3 py-1 rounded-full font-cute font-bold text-[13px] border transition whitespace-nowrap ${c === active ? 'bg-bacha-matcha text-white border-bacha-matcha' : 'bg-white text-bacha-text border-bacha-gingham hover:bg-bacha-pinkLight'}">${CAT_ICON[c]} ${c}</button>`).join('');
}
function toggleBtnClass(on, color = 'bg-bacha-matcha') {
  return `py-2 px-2 rounded-xl font-cute font-bold text-[12px] sm:text-[13px] border transition ${on ? color + ' text-white border-transparent shadow-sm' : 'bg-white text-bacha-text border-bacha-gingham hover:bg-bacha-pinkLight'}`;
}

function applyDisplayMode() {
  const wrap = document.getElementById('box-mode-wrap');
  const singles = document.getElementById('single-menu-section');
  if (!wrap || !singles) return;
  const showBox = displayMode !== 'singles', showSingles = displayMode !== 'box';
  wrap.className = !showBox ? 'hidden' : 'scroll-mt-28 lg:h-[calc(100vh-' + (displayMode === 'both' ? '180' : '130') + 'px)] lg:min-h-[640px]';
  singles.classList.toggle('hidden', !showSingles);
  [['box', 'btn-disp-box'], ['singles', 'btn-disp-singles'], ['both', 'btn-disp-both']].forEach(([m, id]) => {
    const el = document.getElementById(id);
    if (el) { el.className = toggleBtnClass(displayMode === m); el.setAttribute('aria-pressed', displayMode === m); }
  });
  renderSingleMenu();
  updateSectionNav(); updateMobileBar();
}


async function loadDisplayMode() {
  if (!isSupabaseConfigured || !sbClient) return;
  const { data, error } = await sbClient.from('store_settings').select('key,value');
  if (error || !data) return;
  data.forEach(r => {
    if (r.key === 'display_mode' && r.value) { displayMode = r.value; localStorage.setItem('bacha_display_mode', displayMode); }
    if (r.key === 'store_mode' && ['open', 'batch_closed', 'day_off'].includes(r.value)) { storeMode = r.value; localStorage.setItem('bacha_store_mode', storeMode); }
    if (r.key === 'dayoff_message' && r.value) {
      dayoffMessage = r.value; localStorage.setItem('bacha_dayoff_msg', dayoffMessage);
      const di = document.getElementById('dayoff-message-input'); if (di) di.value = r.value;
    }
    if (r.key === 'deadline_settings') {
      try { deadlineCfg = normalizeDeadline(JSON.parse(r.value)); localStorage.setItem('bacha_deadline_settings', JSON.stringify(deadlineCfg)); } catch (e) {}
    }
    if (r.key === 'app_config') {
      try { appConfig = Object.assign(appConfig, JSON.parse(r.value)); localStorage.setItem('bacha_app_config', JSON.stringify(appConfig)); } catch (e) {}
    }
  });
  applyDeadlineUI();
  applyDisplayMode();
  applyAppConfig();
  applyStoreMode();
}

// ---- Customer single menu ----
function setSingleFilter(c) { singleFilter = c; renderSingleMenu(); }

function renderSingleMenu() {
  const grid = document.getElementById('single-menu-grid');
  if (!grid || displayMode === 'box') return;
  document.getElementById('single-filter-pills').innerHTML = pillsHTML(singleFilter, 'setSingleFilter');
  const note = [];
  if (appConfig.maxDrinks > 0) note.push(`Max ${appConfig.maxDrinks} drinks per order`);
  if (appConfig.dailyDrinks > 0) note.push(`${Math.max(0, appConfig.dailyDrinks - drinksSoldToday())} drinks left today`);
  document.getElementById('single-limit-note').innerText = note.join(' • ');
  const list = products.filter(p => p.is_active !== false && (singleFilter === 'All' || catOf(p) === singleFilter));
  grid.innerHTML = list.length ? list.map(p => {
    const left = p.stock - usedInCart(p.id), blocked = catOf(p) === 'Drinks' && drinkAllowance() <= 0, out = left <= 0 || blocked;
    return `
      <div class="relative bg-white rounded-2xl p-2.5 border-2 border-bacha-strawberry/25 shadow-sm flex flex-col gap-1.5 ${out ? 'grayscale' : ''}">
        ${p.promo_tag ? `<span class="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-bacha-berry text-white text-[12px] font-cute font-bold z-10">${esc(p.promo_tag)}</span>` : ''}
        <div class="w-full aspect-square rounded-xl overflow-hidden bg-bacha-pinkLight/70">
          <img src="${esc(p.image)}" alt="${esc(p.name)}" class="w-full h-full object-cover" onerror="this.src='images/classic.png';" />
        </div>
        <div class="flex items-start justify-between gap-1">
          <h3 class="font-cute font-bold text-[13px] sm:text-sm text-bacha-berry leading-tight">${esc(p.name)}</h3>
          <span class="font-cute font-bold text-sm text-bacha-matcha shrink-0">₱${p.price}</span>
        </div>
        <p class="text-[12px] text-bacha-text/75 line-clamp-2 leading-snug">${esc(p.desc || p.description || '')}</p>
        <div class="mt-auto flex items-center justify-between gap-1.5">
          <span class="text-[12px] font-bold ${out ? 'text-rose-700' : left <= lowStockLimit() ? 'text-amber-700' : 'text-bacha-matcha'}">${left <= 0 ? 'Sold Out' : blocked ? 'Limit reached' : left + ' left'}</span>
          <button onclick="addSingleToCart(${p.id})" ${out ? 'disabled' : ''} class="px-3 py-1 rounded-xl font-cute font-bold text-[13px] ${out ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : 'bg-bacha-matcha hover:bg-bacha-matchaDark text-white'} transition">+ Add</button>
        </div>
      </div>`;
  }).join('') : `<p class="col-span-full text-center py-8 text-sm text-bacha-text/75 font-cute">No items in this category yet.</p>`;
}

// ---- Cashier POS ----
function setPosFilter(c) { posFilter = c; renderPOS(); }
function posQtyOf(id) { const t = posTicket.find(x => x.id === id); return t ? t.qty : 0; }
function posTotal() { return posTicket.reduce((sum, t) => { const p = products.find(x => x.id === t.id); return sum + (p ? p.price * t.qty : 0); }, 0); }

function posAdd(id) {
  const p = products.find(x => x.id === id);
  if (!p || p.stock - posQtyOf(id) <= 0) return;
  const t = posTicket.find(x => x.id === id);
  if (t) t.qty++; else posTicket.push({ id, qty: 1 });
  renderPOS();
}
function posQty(id, d) {
  const t = posTicket.find(x => x.id === id), p = products.find(x => x.id === id);
  if (!t || !p) return;
  if (d > 0 && p.stock - t.qty <= 0) return;
  t.qty += d;
  if (t.qty <= 0) posTicket = posTicket.filter(x => x !== t);
  renderPOS();
}
function posClear() { posTicket = []; renderPOS(); }
function setPosPayment(m) { posPayment = m; renderPOS(); }

function updatePosTotals() {
  const total = posTotal();
  const tEl = document.getElementById('pos-total');
  if (!tEl) return;
  tEl.innerText = `₱${total}`;
  const cash = parseFloat(document.getElementById('pos-cash-input').value) || 0;
  document.getElementById('pos-change').innerText = `₱${Math.max(0, cash - total)}`;
}

function renderPOS() {
  const grid = document.getElementById('pos-grid');
  if (!grid || !isAdminAuthenticated) return;
  document.getElementById('pos-filter-pills').innerHTML = pillsHTML(posFilter, 'setPosFilter');
  const list = products.filter(p => p.is_active !== false && (posFilter === 'All' || catOf(p) === posFilter));
  grid.innerHTML = list.length ? list.map(p => {
    const left = p.stock - posQtyOf(p.id), out = left <= 0, q = posQtyOf(p.id);
    return `
      <button onclick="posAdd(${p.id})" ${out ? 'disabled' : ''} class="relative text-left bg-white rounded-xl p-2 border-2 ${q ? 'border-bacha-matcha' : 'border-bacha-gingham'} hover:border-bacha-strawberry active:scale-95 transition flex flex-col gap-1 ${out ? 'grayscale cursor-not-allowed' : ''}">
        ${q ? `<span class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-bacha-matcha text-white text-[12px] font-bold flex items-center justify-center shadow">${q}</span>` : ''}
        <img src="${esc(p.image)}" alt="${esc(p.name)}" class="w-full aspect-square object-contain rounded-lg bg-bacha-pinkLight/60" onerror="this.src='images/classic.png';" />
        <span class="font-cute font-bold text-[13px] text-bacha-text leading-tight">${esc(p.name)}</span>
        <div class="flex items-center justify-between">
          <span class="font-cute font-bold text-sm text-bacha-matcha">₱${p.price}</span>
          <span class="text-[12px] font-bold ${out ? 'text-rose-700' : left <= lowStockLimit() ? 'text-amber-700' : 'text-bacha-text/75'}">${out ? 'Out' : left + ' left'}</span>
        </div>
      </button>`;
  }).join('') : `<p class="col-span-full text-center py-8 text-sm text-bacha-text/75 font-cute">No items in this category.</p>`;

  document.getElementById('pos-ticket').innerHTML = posTicket.length ? posTicket.map(t => {
    const p = products.find(x => x.id === t.id); if (!p) return '';
    return `
      <div class="flex items-center gap-2 p-1.5 rounded-xl bg-bacha-pinkLight/50 border border-bacha-gingham">
        <div class="flex-1 min-w-0">
          <p class="font-cute font-bold text-[13px] truncate">${esc(p.name)}</p>
          <p class="text-[12px] text-bacha-text/75">₱${p.price} each</p>
        </div>
        <div class="flex items-center gap-1">
          <button onclick="posQty(${p.id}, -1)" aria-label="Decrease ${esc(p.name)}" class="qty-btn w-6 h-6 rounded border border-bacha-gingham bg-white font-bold text-sm">-</button>
          <span class="w-5 text-center text-sm font-bold">${t.qty}</span>
          <button onclick="posQty(${p.id}, 1)" aria-label="Increase ${esc(p.name)}" class="qty-btn w-6 h-6 rounded border border-bacha-gingham bg-white font-bold text-sm text-bacha-matcha">+</button>
        </div>
        <span class="font-cute font-bold text-sm text-bacha-matcha w-12 text-right">₱${p.price * t.qty}</span>
      </div>`;
  }).join('') : `<p class="text-center py-5 text-[13px] text-bacha-text/75 font-cute">Ticket is empty. Tap items to add.</p>`;

  document.getElementById('pos-pay-cash').className = toggleBtnClass(posPayment === 'Cash Walk-in', 'bg-emerald-700');
  document.getElementById('pos-pay-cash').setAttribute('aria-pressed', posPayment === 'Cash Walk-in');
  document.getElementById('pos-pay-gcash').setAttribute('aria-pressed', posPayment === 'GCash Counter');
  document.getElementById('pos-pay-gcash').className = toggleBtnClass(posPayment === 'GCash Counter', 'bg-bacha-gcash');
  document.getElementById('pos-cash-wrap').classList.toggle('hidden', posPayment !== 'Cash Walk-in');

  const todays = orders.filter(o => o.order_type === 'pos' && o.status === ST.POS && o.created_at && new Date(o.created_at).toDateString() === new Date().toDateString());
  document.getElementById('pos-today-summary').innerHTML = `Today: ${todays.length} sale${todays.length === 1 ? '' : 's'}<br>₱${todays.reduce((a, o) => a + Number(o.total_amount || 0), 0)}`;
  updatePosTotals();
  updatePosBar();
}

async function posCharge() {
  if (!posTicket.length) { await showBachaAlert("The ticket is empty. Tap an item to add it first.", "Empty Ticket", "🧾"); return; }
  for (const t of posTicket) {
    const p = products.find(x => x.id === t.id);
    if (!p || p.stock < t.qty) { await showBachaAlert(`Not enough stock for ${p ? p.name : 'an item'}.`, "Out of Stock", "🍪"); return; }
  }
  const total = posTotal();
  const cash = parseFloat(document.getElementById('pos-cash-input').value);
  if (posPayment === 'Cash Walk-in' && !isNaN(cash) && cash < total) {
    await showBachaAlert(`Cash received (₱${cash}) is less than the total (₱${total}).`, "Insufficient Cash", "💵");
    return;
  }
  const btn = document.getElementById('pos-charge-btn');
  btn.disabled = true; btn.innerText = 'Recording...';

  let order;
  if (SB()) {
    const { data, error } = await adm('admin_pos_sale', { p: { payment: posPayment, customer: document.getElementById('pos-customer').value.trim(), items: posTicket.map(t => ({ id: t.id, qty: t.qty })) } });
    if (error || !data) {
      await showBachaAlert(friendlyErr(error && error.message), "Sale Failed", "❌");
      btn.disabled = false; btn.innerText = 'Charge'; await initSupabaseData(); renderPOS(); return;
    }
    order = data;
  } else {
    const deductions = {};
    const items = posTicket.map(t => {
      const p = products.find(x => x.id === t.id);
      deductions[p.id] = t.qty;
      return { id: p.id, name: p.name, category: catOf(p), qty: t.qty, unit_price: p.price };
    });
    order = {
      customer_name: document.getElementById('pos-customer').value.trim() || 'Walk-in', contact_number: '—', gcash_ref: null, receipt_url: null,
      notes: 'In-store POS sale', batch_date: 'In-Store', boxes: [], items, order_type: 'pos', payment_method: posPayment, total_amount: total, status: 'Completed (POS)'
    };
    const rs = await reserveStock(deductions);
    if (!rs.ok) {
      await showBachaAlert(rs.reason === 'short' ? `Not enough stock for ${rs.name}.` : `Could not reserve stock: ${(rs.error && rs.error.message) || 'please try again'}`, "Sale Failed", "❌");
      btn.disabled = false; btn.innerText = 'Charge'; renderPOS(); return;
    }
    do { order.id = makeOrderId('POS'); } while (orders.some(o => o.id === order.id));
    orders.unshift({ ...order, created_at: new Date().toISOString() });
  }

  const change = posPayment === 'Cash Walk-in' && !isNaN(cash) ? Math.max(0, cash - total) : 0;
  if (isSupabaseConfigured && sbClient) await initSupabaseData();
  posTicket = [];
  document.getElementById('pos-customer').value = '';
  document.getElementById('pos-cash-input').value = '';
  btn.disabled = false; btn.innerText = 'Charge';
  saveState();
  renderAdmin(); renderBoxBuilder(); renderPOS();
  await showBachaAlert(`${order.id} • ${order.payment_method}\nTotal: ₱${Number(order.total_amount)}${change ? `\nChange: ₱${change}` : ''}\n\nInventory updated.`, "Sale Recorded", "🧾");
}


