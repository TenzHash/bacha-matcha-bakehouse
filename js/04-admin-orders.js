/* Admin: orders list, login, navigation, inventory table */
// =========================================================================
// ADMIN ACTIONS & ORDER PURGE
// =========================================================================
function inspectReceipt(orderId) {
  const o = orders.find(x => x.id === orderId);
  if (!o || !o.receipt_url) return;
  const ru = /^(https:\/\/|blob:)/i.test(String(o.receipt_url)) ? o.receipt_url : '';
  if (!ru) return;
  document.getElementById('modal-receipt-img').src = ru;
  document.getElementById('modal-receipt-open').href = ru;
  document.getElementById('modal-receipt-ref').innerText = `${o.id} • ${o.customer_name} • ₱${o.total_amount}`;
  toggleReceiptModal(true);
}

function toggleReceiptModal(open) {
  const modal = document.getElementById('receipt-modal');
  if (open) {
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.add('opacity-100', 'pointer-events-auto');
  } else {
    modal.classList.add('opacity-0', 'pointer-events-none');
    modal.classList.remove('opacity-100', 'pointer-events-auto');
  }
}






function updateLiveMetrics() {
  const activeProducts = products.filter(p => p.is_active !== false);
  const totalStock = activeProducts.reduce((acc, p) => acc + (p.stock || 0), 0);
  const lowStockCount = activeProducts.filter(p => p.stock > 0 && p.stock <= lowStockLimit()).length;
  const boxCapacity = Math.floor(boxProducts().reduce((a, p) => a + (p.stock || 0), 0) / 6);

  document.getElementById('metric-total-stock').innerText = `${totalStock} pcs`;
  document.getElementById('metric-boxes-capacity').innerText = `~${boxCapacity} Boxes`;
  document.getElementById('metric-low-stock').innerText = lowStockCount;
}

function renderAdmin() {
  const pendingCount = orders.filter(o => o.status === 'Payment Verification Required' || o.status === COD_STATUS).length;
  document.getElementById('orders-badge-count').innerText = pendingCount;
  
  const ordersContainer = document.getElementById('admin-orders-list');
  const kindOf = orderKind;
  const counts = { all: orders.length, pending: 0, queued: 0, ready: 0, done: 0, cancelled: 0, pos: 0 };
  orders.forEach(o => { counts[kindOf(o)]++; if (o.order_type === 'pos') counts.pos++; });
  const labels = { all: 'All', pending: 'Pending', queued: 'In Oven', ready: 'Ready', done: 'Done', cancelled: 'Cancelled', pos: 'POS' };
  document.getElementById('orders-filter-pills').innerHTML = Object.keys(labels).map(k => `<button onclick="setOrdersFilter('${k}')" aria-pressed="${k === ordersFilter}" class="px-3 py-2 rounded-full font-cute font-bold text-[13px] border whitespace-nowrap transition ${k === ordersFilter ? 'bg-bacha-matcha text-white border-bacha-matcha' : 'bg-white text-bacha-text border-bacha-gingham hover:bg-bacha-pinkLight'}">${labels[k]} <span class="opacity-70">${counts[k]}</span></button>`).join('');
  const q = ordersSearch, qDigits = /^[\d\s+\-()]{3,}$/.test(q) ? q.replace(/\D/g, '') : '';  // only treat as a phone search when the query looks like a number
  const visible = orders.filter(o => {
    if (ordersFilter === 'pos' ? o.order_type !== 'pos' : (ordersFilter !== 'all' && kindOf(o) !== ordersFilter)) return false;
    if (!q) return true;
    return String(o.id).toLowerCase().includes(q) || String(o.customer_name || '').toLowerCase().includes(q) || (qDigits && (digitsOf(o.contact_number).includes(qDigits) || (normalizePH(o.contact_number) || '').includes(qDigits)));
  });
  const moreEl = document.getElementById('orders-more');
  const remaining = visible.length - ordersLimit;
  moreEl.innerHTML = remaining > 0 ? `<button onclick="showMoreOrders()" class="px-5 py-2.5 rounded-xl bg-white border border-bacha-matcha text-bacha-matchaDark hover:bg-bacha-matchaLight font-cute font-bold text-sm">Show ${Math.min(20, remaining)} more (${remaining} left)</button>` : '';
  if (isSupabaseConfigured && adminToken) {
    const span = ordersDays === 0 ? 'all history' : `the last ${ordersDays} days`;
    moreEl.innerHTML += `<p class="text-[12px] text-bacha-text/75 mt-2">Showing ${span} (open orders always show).${ordersDays === 0 ? '' : ' <button onclick="loadOlderOrders()" class="underline font-bold text-bacha-matchaDark">Load older orders</button>'}</p>`;
  }
  if (visible.length === 0) {
    ordersContainer.innerHTML = `<p class="text-center py-10 bg-white rounded-2xl border border-bacha-gingham text-sm text-bacha-text/75 font-cute">${orders.length ? 'No orders match this filter or search.' : 'No box pre-orders received yet.'}</p>`;
  } else {
    ordersContainer.innerHTML = visible.slice(0, ordersLimit).map(o => {
      const kind = orderKind(o);
      const isPendingVerification = kind === 'pending';
      const isVerified = kind !== 'pending' && kind !== 'cancelled';
      const isRejected = kind === 'cancelled';

      return `
        <div class="bg-white rounded-2xl p-3.5 sm:p-4 border border-bacha-gingham soft-shadow flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div class="space-y-1 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-cute font-bold text-sm text-bacha-matcha">${esc(o.id)}</span>
              <span class="text-[12px] bg-bacha-pinkLight text-bacha-berry font-bold px-2 py-0.5 rounded-full">${esc(o.order_type === 'pos' ? '🧾 POS • ' + (o.payment_method || '') : (o.batch_date || 'Weekly Batch'))}</span>
              <span class="text-[12px] font-bold px-2 py-0.5 rounded-full ${isPendingVerification ? 'bg-amber-100 text-amber-800' : kind === 'ready' ? 'bg-sky-100 text-sky-800' : isVerified ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                ${esc(statusLabel(o))}
              </span>
              ${isOverdue(o) ? `<span class="text-[12px] font-bold px-2 py-0.5 rounded-full bg-rose-600 text-white" title="Paid by GCash and still waiting for you to check it">⏰ Waiting ${Math.floor((Date.now() - new Date(o.created_at)) / 3600000)}h</span>` : ''}
            </div>
            ${o.status_note ? `<p class="text-[12px] font-bold text-rose-700">${esc(o.status_note)}</p>` : ''}

            <h2 class="font-cute font-bold text-base text-bacha-text">${esc(o.customer_name)} <span class="text-[13px] text-bacha-text/75 font-normal">(${esc(o.contact_number)})</span></h2>
            <p class="text-[13px] text-bacha-text/75 italic">"${esc(o.notes)}"</p>
            ${o.order_type !== 'pos' ? `<div class="text-[12px] font-bold text-bacha-text/75">${o.fulfillment === 'delivery' ? '🛵 Delivery' : '🛍️ Pick-up (coordinate via chat)'}${o.payment_method === 'COD' ? ` • <span class="text-amber-700">💵 COD – collect exact ₱${o.total_amount}</span>` : ' • 📱 GCash'}</div>` : ''}
            ${o.fulfillment === 'delivery' ? `<p class="text-[13px] text-bacha-text/80">📍 ${esc(o.delivery_address)}${/^https?:\/\//i.test(o.maps_link || '') ? ` <a href="${esc(o.maps_link)}" target="_blank" rel="noopener" class="text-blue-700 underline font-bold">Open Maps pin ↗</a>` : ''}</p>` : ''}

            ${o.receipt_url ? `<div class="pt-2 flex items-center gap-3">
              <button onclick="inspectReceipt(this.dataset.id)" data-id="${esc(o.id)}" class="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 font-cute text-sm font-bold flex items-center gap-1.5 transition">
                <i aria-hidden="true" data-lucide="image" class="w-3.5 h-3.5 text-blue-600"></i>
                <span>Inspect Receipt</span>
              </button>
            </div>` : ''}
            ${messageButtons(o)}

            <div class="pt-2 space-y-1">
              ${(o.boxes || []).map((b, idx) => `
                <div class="text-[13px] bg-bacha-pinkLight/50 p-2 rounded-lg border border-bacha-gingham">
                  <span class="font-bold text-bacha-berry">Box #${idx + 1}:</span>
                  <span class="text-bacha-text/80">${esc((b.items || []).join(' • '))}</span>
                </div>
              `).join('')}
              ${(o.items || []).length ? `<div class="text-[13px] bg-bacha-matchaLight/50 p-2 rounded-lg border border-bacha-gingham text-bacha-text/80">${o.items.map(i => `${i.qty}× ${esc(i.name)}`).join(' • ')}</div>` : ''}
            </div>
          </div>

          <div class="flex flex-wrap sm:flex-nowrap sm:flex-col items-center sm:items-end justify-between gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-bacha-gingham">
            <span class="font-cute font-bold text-xl text-bacha-matcha">₱${o.total_amount}</span>
            
            ${isPendingVerification ? `
              <button onclick="verifyAndAcceptPayment(this.dataset.id)" data-id="${esc(o.id)}" class="px-3 py-1 rounded-full font-cute font-bold text-[13px] bg-emerald-700 hover:bg-emerald-800 text-white transition shadow-sm">
                ${o.payment_method === 'COD' ? '✓ Confirm Order' : '✓ Confirm Payment'}
              </button>
              <button onclick="rejectFakeOrder(this.dataset.id)" data-id="${esc(o.id)}" class="px-3 py-1 rounded-full font-cute font-bold text-[13px] bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition">
                ✕ Reject / Fake
              </button>
            ` : isVerified ? `
              ${lifecycleButtons(o)}
            ` : `
              <div class="flex flex-col items-end gap-1.5">
                <span class="text-sm font-cute font-bold text-rose-700">
                  ${o.status === ST.VOID ? '↩ Sale Voided' : o.status === ST.CANCELLED ? '✕ Cancelled &amp; Restocked' : '✕ Rejected &amp; Cancelled'}
                </span>
                <button onclick="purgeCancelledOrder(this.dataset.id)" data-id="${esc(o.id)}" class="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-rose-100 text-rose-700 font-cute font-bold text-[12px] border border-gray-200 flex items-center gap-1 transition">
                  <i aria-hidden="true" data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                  <span>Delete Record</span>
                </button>
              </div>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  renderBakeList();
  const invContainer = document.getElementById('inventory-table-body');
  invContainer.innerHTML = products.map(p => `
    <tr class="hover:bg-bacha-pinkLight/30 transition ${p.is_active === false ? 'grayscale' : ''}">
      <td class="py-2.5 px-2 flex items-center gap-2.5">
        <img src="${esc(p.image)}" alt="${esc(p.name)}" class="w-7 h-7 rounded-full object-cover shrink-0 shadow-sm" onerror="this.src='images/classic.png';" />
        <div>
          <span class="font-cute font-bold text-sm text-bacha-text block leading-tight">${esc(p.name)}</span>
          <span class="text-[12px] text-bacha-text/75">${catOf(p)} • Cap: ${p.max_stock || 30}</span>
        </div>
      </td>
      <td class="py-2.5 px-2 font-cute font-bold text-bacha-matcha text-sm">₱${p.price}</td>
      <td class="py-2.5 px-2 text-center font-cute font-bold text-base ${p.stock <= 0 ? 'text-rose-700' : p.stock <= lowStockLimit() ? 'text-amber-700' : 'text-bacha-text'}">${p.stock}</td>
      <td class="py-2.5 px-2 text-center">
        <div class="inline-flex items-center gap-1">
          <button onclick="adjustInventory(${p.id}, -5)" aria-label="Adjust ${esc(p.name)} stock by -5" class="qty-btn w-6 h-6 rounded border border-bacha-gingham bg-white hover:bg-bacha-pinkLight font-bold text-sm">-5</button>
          <button onclick="adjustInventory(${p.id}, -1)" aria-label="Adjust ${esc(p.name)} stock by -1" class="qty-btn w-6 h-6 rounded border border-bacha-gingham bg-white hover:bg-bacha-pinkLight font-bold text-sm">-1</button>
          <button onclick="adjustInventory(${p.id}, 1)" aria-label="Adjust ${esc(p.name)} stock by 1" class="qty-btn w-6 h-6 rounded border border-bacha-gingham bg-white hover:bg-bacha-pinkLight font-bold text-sm text-bacha-matcha">+1</button>
          <button onclick="adjustInventory(${p.id}, 6)" aria-label="Adjust ${esc(p.name)} stock by 6" class="qty-btn w-7 h-6 rounded border border-bacha-gingham bg-white hover:bg-bacha-pinkLight font-bold text-[12px] text-bacha-matcha">+6</button>
          <button onclick="adjustInventory(${p.id}, 12)" aria-label="Adjust ${esc(p.name)} stock by 12" class="qty-btn w-7 h-6 rounded border border-bacha-gingham bg-white hover:bg-bacha-pinkLight font-bold text-[12px] text-bacha-berry">+12</button>
        </div>
      </td>
      <td class="py-2.5 px-2 text-right">
        <span class="px-2 py-0.5 rounded-full text-[12px] font-bold ${p.is_active === false ? 'bg-gray-100 text-gray-600' : p.stock > lowStockLimit() ? 'bg-emerald-100 text-emerald-700' : p.stock > 0 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}">
          ${p.is_active === false ? 'Unavailable' : p.stock > lowStockLimit() ? 'Available' : p.stock > 0 ? 'Low Stock' : 'Out of Oven'}
        </span>
      </td>
    </tr>
  `).join('');

  updateLiveMetrics();
  lucide.createIcons();
}



// Auth & Navigation
function openAdminAccess() {
  if (isAdminAuthenticated) switchView('admin');
  else toggleAdminLoginModal(true);
}

function toggleAdminLoginModal(open) {
  const modal = document.getElementById('admin-login-modal');
  const input = document.getElementById('admin-password-input');
  const errorMsg = document.getElementById('admin-login-error');
  if (open) {
    showForcePanel(false);
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.add('opacity-100', 'pointer-events-auto');
    input.value = "";
    errorMsg.classList.add('hidden');
    setTimeout(() => input.focus(), 150);
  } else {
    modal.classList.add('opacity-0', 'pointer-events-none');
    modal.classList.remove('opacity-100', 'pointer-events-auto');
    // closing the box during the forced PIN step ends that session
    if (!document.getElementById('admin-force-panel').classList.contains('hidden')) { const t = adminToken; adminSessionEnded(); if (t) sbClient.rpc('admin_logout', { p_token: t }); }
  }
}

function showForcePanel(on) {
  ['admin-login-fields', 'admin-login-btnrow'].forEach(i => document.getElementById(i).classList.toggle('hidden', on));
  document.getElementById('admin-force-panel').classList.toggle('hidden', !on);
  if (on) setTimeout(() => document.getElementById('force-pin-new').focus(), 100);
}
async function finishAdminLogin() {
  isAdminAuthenticated = true;
  showForcePanel(false);
  toggleAdminLoginModal(false);
  await initSupabaseData();
  switchView('admin');
}
async function handleAdminLogin() {
  const input = document.getElementById('admin-password-input');
  const errorMsg = document.getElementById('admin-login-error');
  const enteredPin = input.value.trim();
  errorMsg.classList.add('hidden');

  if (SB()) {
    const { data, error } = await sbClient.rpc('admin_login', { input_pin: enteredPin });
    if (error || !data) { errorMsg.textContent = "Could not reach the database. Please check your internet and try again."; errorMsg.classList.remove('hidden'); return; }
    if (!data.ok) {
      errorMsg.textContent = data.locked ? `Too many wrong tries. Sign-in is locked for ${Math.max(1, Math.ceil((data.retry_seconds || 900) / 60))} minute(s).` : `Incorrect passcode.${data.attempts_left != null ? ' ' + data.attempts_left + ' tries left.' : ''}`;
      errorMsg.classList.remove('hidden'); input.value = ''; return;
    }
    adminToken = data.token; lastEnteredPin = enteredPin;
    try { sessionStorage.setItem('bacha_admin_token', adminToken); } catch (e) {}
    input.value = '';
    if (data.must_change) { showForcePanel(true); return; }
    await finishAdminLogin();
    return;
  }
  if (enteredPin === (localStorage.getItem('bacha_admin_pin') || "1234")) { await finishAdminLogin(); }
  else { errorMsg.textContent = "Incorrect passcode. Try again."; errorMsg.classList.remove('hidden'); }
}

async function handleForcedPinChange() {
  const n = document.getElementById('force-pin-new').value.trim(), c = document.getElementById('force-pin-confirm').value.trim();
  const err = document.getElementById('force-pin-error');
  const bad = m => { err.textContent = m; err.classList.remove('hidden'); };
  err.classList.add('hidden');
  if (n.length < 6) return bad('Your new PIN needs at least 6 characters.');
  if (n !== c) return bad('The two PINs do not match.');
  const { data, error } = await adm('admin_change_pin', { current_pin: lastEnteredPin, new_pin: n });
  if (error) return bad(error.message);
  if (!data || !data.ok) return bad({ too_weak: 'That PIN is too easy to guess. Please pick another.', too_short: 'Your new PIN needs at least 6 characters.', wrong_pin: 'Something went wrong. Please sign in again.', locked: 'Locked for a few minutes. Try again later.' }[data && data.error] || 'The PIN was not changed.');
  lastEnteredPin = ''; document.getElementById('force-pin-new').value = ''; document.getElementById('force-pin-confirm').value = '';
  await finishAdminLogin();
  toast('PIN saved. Welcome!');
}

async function adminLogout() {
  const t = adminToken;
  if (SB() && t) { try { await sbClient.rpc('admin_logout', { p_token: t }); } catch (e) {} }
  adminSessionEnded();
  switchView('store');
}

function switchView(view) {
  const storeView = document.getElementById('store-view');
  const adminView = document.getElementById('admin-view');
  const storeBtn = document.getElementById('nav-store-btn');
  const adminBtn = document.getElementById('nav-admin-btn');
  const adminIndicator = document.getElementById('admin-live-indicator');
  const footer = document.getElementById('site-footer');
  const pill = 'px-2.5 sm:px-3.5 py-1.5 rounded-full font-cute font-semibold text-[13px] sm:text-sm transition';
  const on = pill + ' bg-bacha-matcha text-white shadow-sm';
  const off = pill + ' bg-white text-bacha-text border border-bacha-gingham hover:bg-bacha-pinkLight';

  if (view === 'store') {
    storeView.classList.remove('hidden');
    adminView.classList.add('hidden');
    if (footer) footer.classList.remove('hidden');
    if (adminIndicator) adminIndicator.classList.remove('is-on');
    storeBtn.className = on;
    adminBtn.className = off + ' flex items-center gap-1';
    renderBoxBuilder();
  } else {
    storeView.classList.add('hidden');
    adminView.classList.remove('hidden');
    if (footer) footer.classList.add('hidden');
    if (adminIndicator) adminIndicator.classList.add('is-on');
    adminBtn.className = on + ' flex items-center gap-1';
    storeBtn.className = off;
    renderAdmin();
    renderCustomizeTab();
  }
  adminBtn.classList.toggle('hidden', !isAdminAuthenticated);
  window.scrollTo(0, 0);
  const sk = document.getElementById('skip-link'); if (sk) sk.setAttribute('href', view === 'store' ? '#store-view' : '#admin-view');
  updateSectionNav(); updateMobileBar(); updatePosBar();
}

function switchAdminTab(tab) {
  const tabs = ['inventory', 'orders', 'pos', 'cash', 'customize', 'deadline', 'records', 'settings'];
  const base = "px-2 sm:px-3.5 py-2 rounded-xl font-cute font-semibold text-[13px] sm:text-sm transition-all duration-200 flex items-center justify-center gap-1 text-center leading-tight";
  const activeClass = base + " bg-bacha-matcha text-white shadow-sm";
  const inactiveClass = base + " text-bacha-text hover:bg-bacha-pinkLight";
  activeAdminTab = tab;
  syncTabAria(tab);

  tabs.forEach(t => {
    const viewEl = document.getElementById(`admin-${t}-tab`);
    const btnEl = document.getElementById(`tab-${t}-btn`);

    if (t === tab) {
      viewEl.classList.remove('hidden');
      btnEl.className = activeClass;
      if (t === 'customize') renderCustomizeTab();
      if (t === 'pos') renderPOS();
      if (t === 'cash' && typeof renderCashTab === 'function') renderCashTab();
      if (t === 'records' && typeof renderRecordsTab === 'function') renderRecordsTab();
    } else {
      viewEl.classList.add('hidden');
      btnEl.className = inactiveClass;
    }
  });
  updatePosBar();
}


