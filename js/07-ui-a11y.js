/* Field errors, mobile bars, dialogs, accessibility */
// =========================================================================
// PART 1 ADDITIONS: inline field errors, order-success dialog, mobile bars, section nav
// =========================================================================
function clearFieldErrs() {
  document.querySelectorAll('#cart-panel .field-err, #add-product-modal .field-err').forEach(e => e.remove());
  document.querySelectorAll('#cart-panel .border-rose-500, #add-product-modal .border-rose-500').forEach(e => { e.classList.remove('border-rose-500', 'ring-2', 'ring-rose-200'); e.removeAttribute('aria-invalid'); e.removeAttribute('aria-describedby'); });
}
function fieldErr(el, msg) {
  clearFieldErrs();
  el.classList.add('border-rose-500', 'ring-2', 'ring-rose-200');
  const p = document.createElement('p');
  p.id = 'err-' + (el.id || 'field');
  el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', p.id);
  p.className = 'field-err text-[13px] font-bold text-rose-700 mt-1';
  p.setAttribute('role', 'alert');
  p.textContent = msg;
  el.insertAdjacentElement('afterend', p);
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  try { el.focus({ preventScroll: true }); } catch (e) {}
}
document.getElementById('cart-panel').addEventListener('input', clearFieldErrs);

let lastPlacedOrder = null;
function toggleOrderSuccess(open) {
  const m = document.getElementById('order-success-modal');
  m.classList.toggle('opacity-0', !open); m.classList.toggle('pointer-events-none', !open);
  m.classList.toggle('opacity-100', open); m.classList.toggle('pointer-events-auto', open);
}
function showOrderSuccess(id, isCOD) {
  lastPlacedOrder = id;
  document.getElementById('order-success-id').innerText = id;
  document.getElementById('order-success-sub').innerText = isCOD ? 'Your cash-on-delivery order was received.' : 'Your payment screenshot was received.';
  document.getElementById('order-copy-btn').innerText = '📋 Copy Order ID';
  toggleOrderSuccess(true);
}
async function copyOrderId() {
  const btn = document.getElementById('order-copy-btn');
  try { await navigator.clipboard.writeText(lastPlacedOrder); btn.innerText = '✓ Copied!'; }
  catch (e) {
    const r = document.createRange(); r.selectNodeContents(document.getElementById('order-success-id'));
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    btn.innerText = 'Press and hold the ID to copy';
  }
}
function trackJustPlaced() { toggleOrderSuccess(false); toggleTrackModal(true); }

<<<<<<< HEAD
let ordersFilter = 'all', ordersSearch = '', ordersLimit = 20, activeAdminTab = 'today';
=======
let ordersFilter = 'all', ordersSearch = '', ordersLimit = 20, activeAdminTab = 'inventory';
>>>>>>> 78a4d4c6a22f466a33e669601322f3c4a3e70fc5
function setOrdersFilter(f) { ordersFilter = f; ordersLimit = 20; renderAdmin(); }
function setOrdersSearch(v) { ordersSearch = String(v || '').trim().toLowerCase(); ordersLimit = 20; renderAdmin(); }
function showMoreOrders() { ordersLimit += 20; renderAdmin(); }

function syncAdminBtn() {
  const b = document.getElementById('nav-admin-btn');
  if (b) b.classList.toggle('hidden', !isAdminAuthenticated);
}

function updateMobileBar() {
  const bar = document.getElementById('mobile-bag-bar');
  if (!bar) return;
  const storeVisible = !document.getElementById('store-view').classList.contains('hidden');
  const open = storeMode === 'open' && !isSoldOut();
  const boxOn = displayMode !== 'singles';
  const cartCount = cart.reduce((n, c) => n + (c.kind === 'single' ? c.qty : 1), 0);
  const cartTotal = cart.reduce((t, c) => t + c.price, 0);
  const boxTotal = customBox.reduce((s, i) => s + i.price, 0);
  const show = storeVisible && open && ((boxOn && customBox.length > 0) || cartCount > 0);
  bar.classList.toggle('hidden', !show);
  bar.classList.toggle('flex', show);
  if (!show) return;
  const thumbs = document.getElementById('mbar-thumbs'), title = document.getElementById('mbar-title');
  const sub = document.getElementById('mbar-sub'), btn = document.getElementById('mbar-btn');
  if (boxOn && customBox.length > 0) {
    thumbs.innerHTML = customBox.map(i => `<img src="${esc(i.image)}" alt="" class="w-8 h-8 rounded-full object-cover border-2 border-white bg-bacha-pinkLight shadow-sm" onerror="this.src='images/classic.png';" />`).join('');
    title.innerText = `${customBox.length} / 6 picked`;
    sub.innerText = cartCount ? `Box ₱${boxTotal} • Bag ₱${cartTotal}` : `Box ₱${boxTotal}`;
    if (customBox.length === 6) { btn.innerText = '+ Pre-Order Box'; btn.dataset.act = 'add'; }
    else { btn.innerText = 'See my box'; btn.dataset.act = 'scroll'; }
  } else {
    thumbs.innerHTML = '';
    title.innerText = `${cartCount} item${cartCount === 1 ? '' : 's'} in bag`;
    sub.innerText = `₱${cartTotal}`;
    btn.innerText = 'View Bag'; btn.dataset.act = 'bag';
  }
}
function mobileBarAction() {
  const a = document.getElementById('mbar-btn').dataset.act;
  if (a === 'add') addCustomBoxToCart();
<<<<<<< HEAD
  else if (a === 'scroll') goShopPage('box');
=======
  else if (a === 'scroll') document.getElementById('box-builder-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
>>>>>>> 78a4d4c6a22f466a33e669601322f3c4a3e70fc5
  else toggleCartDrawer(true);
}

function updatePosBar() {
  const bar = document.getElementById('pos-mobile-bar');
  if (!bar) return;
  const adminVisible = !document.getElementById('admin-view').classList.contains('hidden');
  const show = adminVisible && activeAdminTab === 'pos' && posTicket.length > 0;
  bar.classList.toggle('hidden', !show);
  bar.classList.toggle('flex', show);
  if (!show) return;
  const n = posTicket.reduce((a, t) => a + t.qty, 0);
  document.getElementById('pos-bar-info').innerText = `${n} item${n === 1 ? '' : 's'} on ticket`;
  document.getElementById('pos-bar-total').innerText = `₱${posTotal()}`;
}
function posBarAction() { document.getElementById('pos-ticket-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

<<<<<<< HEAD
function jumpTo(which) { if (typeof goShopPage === 'function') goShopPage(which === 'box' ? 'box' : 'singles'); }
function updateSectionNav() { const nav = document.getElementById('section-nav'); if (nav) nav.classList.add('hidden'); } // replaced by the page steps
=======
function jumpTo(which) {
  document.getElementById(which === 'box' ? 'box-mode-wrap' : 'single-menu-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function updateSectionNav() {
  const nav = document.getElementById('section-nav');
  if (!nav) return;
  const storeVisible = !document.getElementById('store-view').classList.contains('hidden');
  const show = storeVisible && displayMode === 'both';
  nav.classList.toggle('hidden', !show);
  if (!show) return;
  const s = document.getElementById('single-menu-section');
  const inSingles = s && s.getBoundingClientRect().top < window.innerHeight * 0.5;
  const base = 'flex-1 sm:flex-none px-4 py-2 rounded-full font-cute font-bold text-[13px] sm:text-sm border transition ';
  const act = 'bg-bacha-matcha text-white border-bacha-matcha', idle = 'bg-white text-bacha-text border-bacha-gingham hover:bg-bacha-pinkLight';
  document.getElementById('secnav-box').className = base + (inSingles ? idle : act);
  document.getElementById('secnav-box').setAttribute('aria-pressed', !inSingles);
  document.getElementById('secnav-single').setAttribute('aria-pressed', !!inSingles);
  document.getElementById('secnav-single').className = base + (inSingles ? act : idle);
}
>>>>>>> 78a4d4c6a22f466a33e669601322f3c4a3e70fc5
window.addEventListener('scroll', updateSectionNav, { passive: true });

// =========================================================================
// PART 2 ADDITIONS: dialog behaviour, tab semantics, labels, carousel keys
// =========================================================================
const DIALOGS = {
  'add-product-modal':   { label: 'Add new menu item', close: () => toggleAddProductModal(false) },
  'cart-drawer':         { label: 'Pre-order bag', close: () => toggleCartDrawer(false) },
  'receipt-modal':       { label: 'GCash receipt', close: () => toggleReceiptModal(false) },
<<<<<<< HEAD
  'flavor-picker-modal': { label: 'Choose cookies for your box', close: () => toggleFlavorPicker(false) },
  'track-modal':         { label: 'Track your order', close: () => toggleTrackModal(false) },
  'map-modal':           { label: 'Delivery map', close: () => toggleMapModal(false) },
=======
  'track-modal':         { label: 'Track your order', close: () => toggleTrackModal(false) },
>>>>>>> 78a4d4c6a22f466a33e669601322f3c4a3e70fc5
  'invoice-modal':       { label: 'Invoice', close: () => toggleInvoiceModal(false) },
  'admin-login-modal':   { label: 'Staff sign in', close: () => toggleAdminLoginModal(false) },
  'order-success-modal': { label: 'Order submitted', close: () => toggleOrderSuccess(false) },
  'bacha-alert-modal':   { labelledby: 'bacha-alert-title', describedby: 'bacha-alert-message', role: 'alertdialog', close: () => document.getElementById('bacha-alert-btn').click() },
  'bacha-confirm-modal': { labelledby: 'bacha-confirm-title', describedby: 'bacha-confirm-message', role: 'alertdialog', close: () => document.getElementById('bacha-confirm-cancel').click() }
};
const PAGE_REGIONS = ['header', '#section-nav', '#store-view', '#admin-view', '#site-footer', '#mobile-bag-bar', '#pos-mobile-bar', 'aside', '#skip-link'];
let dialogStack = [];
const lastFocus = new Map();

function focusablesIn(el) {
  return [...el.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(n => n.offsetParent !== null || getComputedStyle(n).position === 'fixed');
}
function refreshInert() {
  const anyOpen = dialogStack.length > 0;
  PAGE_REGIONS.forEach(sel => document.querySelectorAll(sel).forEach(n => { if (!n.closest('[role=dialog],[role=alertdialog]')) n.toggleAttribute('inert', anyOpen); }));
  Object.keys(DIALOGS).forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const isTop = dialogStack[dialogStack.length - 1] === el;
    el.toggleAttribute('inert', !isTop);
    el.setAttribute('aria-hidden', isTop ? 'false' : 'true');
    if (!isTop && !dialogStack.includes(el)) el.setAttribute('aria-hidden', 'true');
  });
}
function syncDialog(el) {
  const open = !el.classList.contains('pointer-events-none');
  const was = el.dataset.open === '1';
  if (open === was) return;
  el.dataset.open = open ? '1' : '0';
  if (open) {
    lastFocus.set(el, document.activeElement);
    dialogStack.push(el);
    refreshInert();
    setTimeout(() => { const f = focusablesIn(el)[0]; if (f && !el.contains(document.activeElement)) f.focus({ preventScroll: true }); }, 60);
  } else {
    dialogStack = dialogStack.filter(x => x !== el);
    refreshInert();
    const f = lastFocus.get(el);
    if (f && f !== document.body && document.contains(f) && !f.closest('[inert]')) f.focus({ preventScroll: true });
  }
}
function setupDialogs() {
  Object.entries(DIALOGS).forEach(([id, d]) => {
    const el = document.getElementById(id); if (!el) return;
    el.setAttribute('role', d.role || 'dialog');
    el.setAttribute('aria-modal', 'true');
    if (d.labelledby) el.setAttribute('aria-labelledby', d.labelledby); else el.setAttribute('aria-label', d.label);
    if (d.describedby) el.setAttribute('aria-describedby', d.describedby);
    el.dataset.open = '0';
    new MutationObserver(() => syncDialog(el)).observe(el, { attributes: true, attributeFilter: ['class'] });
  });
  refreshInert();
  document.addEventListener('keydown', e => {
    const top = dialogStack[dialogStack.length - 1];
    if (!top) return;
    if (e.key === 'Escape') { e.preventDefault(); DIALOGS[top.id].close(); return; }
    if (e.key !== 'Tab') return;
    const f = focusablesIn(top);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1], active = document.activeElement;
    if (!top.contains(active)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  });
}

<<<<<<< HEAD
const TAB_KEYS = ['today', 'inventory', 'orders', 'pos', 'cash', 'customize', 'deadline', 'records', 'settings'];
=======
const TAB_KEYS = ['inventory', 'orders', 'pos', 'cash', 'customize', 'deadline', 'records', 'settings'];
>>>>>>> 78a4d4c6a22f466a33e669601322f3c4a3e70fc5
function syncTabAria(tab) {
  TAB_KEYS.forEach(k => {
    const b = document.getElementById('tab-' + k + '-btn'); if (!b) return;
    b.setAttribute('aria-selected', k === tab ? 'true' : 'false');
    b.tabIndex = k === tab ? 0 : -1;
  });
}
function setupTabs() {
  const list = document.querySelector('#admin-view [role=tablist]');
  if (!list) return;
  list.setAttribute('aria-label', 'Admin sections');
  TAB_KEYS.forEach(k => {
    const b = document.getElementById('tab-' + k + '-btn'), p = document.getElementById('admin-' + k + '-tab');
    if (b) { b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', 'admin-' + k + '-tab'); }
    if (p) { p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', 'tab-' + k + '-btn'); }
  });
  syncTabAria(activeAdminTab);
  list.addEventListener('keydown', e => {
    const i = TAB_KEYS.indexOf(activeAdminTab); let n = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % TAB_KEYS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + TAB_KEYS.length) % TAB_KEYS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = TAB_KEYS.length - 1;
    if (n === null) return;
    e.preventDefault(); switchAdminTab(TAB_KEYS[n]); document.getElementById('tab-' + TAB_KEYS[n] + '-btn').focus();
  });
}

let _fid = 0;
function linkLabels(root = document) {
  root.querySelectorAll('label:not([for])').forEach(l => {
    if (l.querySelector('input,select,textarea')) return;
    let t = l.nextElementSibling;
    if (!(t && t.matches('input,select,textarea'))) t = l.parentElement && l.parentElement.querySelector('input,select,textarea');
    if (!t) return;
    if (!t.id) t.id = 'f-' + (++_fid);
    l.setAttribute('for', t.id);
  });
  root.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(el => {
    if (el.labels && el.labels.length) return;
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return;
    const nm = el.getAttribute('placeholder') || el.title;
    if (nm) el.setAttribute('aria-label', nm);
  });
  const bd = document.getElementById('customer-preorder-date');
  if (bd && !bd.getAttribute('aria-label')) bd.setAttribute('aria-label', 'Bake date');
}

<<<<<<< HEAD

function setupA11y() {
  setupDialogs(); setupTabs(); linkLabels();
  ['box-slot-indicator', 'mbar-title', 'mbar-sub', 'pos-bar-info', 'single-limit-note', 'cart-total-price'].forEach(id => { const el = document.getElementById(id); if (el) el.setAttribute('aria-live', 'polite'); });
=======
function carouselKey(e) {
  if (e.key === 'ArrowLeft') { e.preventDefault(); prevCarouselSlide(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); nextCarouselSlide(); }
}

function setupA11y() {
  setupDialogs(); setupTabs(); linkLabels();
  ['box-slot-indicator', 'carousel-page-indicator', 'mbar-title', 'mbar-sub', 'pos-bar-info', 'single-limit-note', 'cart-total-price'].forEach(id => { const el = document.getElementById(id); if (el) el.setAttribute('aria-live', 'polite'); });
>>>>>>> 78a4d4c6a22f466a33e669601322f3c4a3e70fc5
  const st = document.getElementById('pin-change-status'); if (st) st.setAttribute('role', 'status');
  const le = document.getElementById('admin-login-error'); if (le) le.setAttribute('role', 'alert');
  const tr = document.getElementById('track-result'); if (tr) tr.setAttribute('aria-live', 'polite');
}


