/* Settings, limits, invoice, tracking */
// =========================================================================
// ROUND 1: SETTINGS, LIMITS, FULFILLMENT, INVOICE, TRACKING, CSV
// =========================================================================
const COD_STATUS = 'COD - Awaiting Confirmation';
let appConfig = Object.assign({ maxBoxes: 3, maxDrinks: 5, dailyDrinks: 0, lowStock: 5, igHandle: '', deliveryArea: '', freeDeliveryMin: 0 },
  (() => { try { return JSON.parse(localStorage.getItem('bacha_app_config') || '{}'); } catch (e) { return {}; } })());
let fulfillment = 'pickup', payMethod = 'GCash', trackedOrder = null;

function lowStockLimit() { return Number(appConfig.lowStock) || 5; }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function dayKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

function isSoldOut() {
  const act = products.filter(p => p.is_active !== false);
  if (!act.length) return false;
  if (displayMode === 'box') return boxProducts().reduce((a, p) => a + (p.stock || 0), 0) < 6;
  return act.reduce((a, p) => a + (p.stock || 0), 0) < 1;
}

// ---- Drink limits ----
function drinksSoldToday() {
  if (SB()) return Math.max(serverDrinksToday, adminToken ? localDrinksToday() : 0);
  return localDrinksToday();
}
function localDrinksToday() {
  const today = dayKey(new Date());
  return orders.filter(o => orderKind(o) !== 'cancelled' && (o.created_at ? dayKey(new Date(o.created_at)) === today : false))
    .reduce((n, o) => n + (o.items || []).filter(i => i.category === 'Drinks').reduce((m, i) => m + i.qty, 0), 0);
}
function drinksInCart() {
  return cart.filter(c => c.kind === 'single' && catOf(products.find(p => p.id === c.prodId) || {}) === 'Drinks').reduce((n, c) => n + c.qty, 0);
}
function drinkAllowance() {
  let a = Infinity;
  if (appConfig.maxDrinks > 0) a = Math.min(a, appConfig.maxDrinks - drinksInCart());
  if (appConfig.dailyDrinks > 0) a = Math.min(a, appConfig.dailyDrinks - drinksSoldToday() - drinksInCart());
  return a;
}
function drinkLimitMsg() {
  if (appConfig.dailyDrinks > 0 && appConfig.dailyDrinks - drinksSoldToday() - drinksInCart() <= 0) return "We've reached today's drink limit. Thank you for understanding! ♡";
  return `Our baker handles every drink by hand, so we can take up to ${appConfig.maxDrinks} drinks per order.`;
}

// ---- Settings load/save ----
function applyAppConfig() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('cfg-max-boxes', appConfig.maxBoxes); set('cfg-max-drinks', appConfig.maxDrinks);
  set('cfg-daily-drinks', appConfig.dailyDrinks); set('cfg-low-stock', appConfig.lowStock); set('cfg-ig', appConfig.igHandle);
  set('cfg-delivery-area', appConfig.deliveryArea || ''); set('cfg-free-min', appConfig.freeDeliveryMin || 0); renderDeliveryRules();
  const ig = document.getElementById('ig-float'), dock = document.getElementById('ig-dock');
  const handle = String(appConfig.igHandle || '').trim().replace(/\/+$/, '').split('/').pop().replace(/^@/, '');
  if (ig) {
    if (dock) dock.classList.toggle('hidden', !handle);
    if (handle) ig.href = `https://ig.me/m/${encodeURIComponent(handle)}`;
  }
  renderSingleMenu(); renderAdmin();
}


// ---- Checkout fulfillment ----
function setFulfillment(v) { fulfillment = v; if (v === 'pickup') payMethod = 'GCash'; updateCheckoutUI(); }
function setPayMethod(v) { payMethod = v; updateCheckoutUI(); }
function updateCheckoutUI() {
  const delivery = fulfillment === 'delivery', cod = delivery && payMethod === 'COD';
  const on = (id, active, color) => { const el = document.getElementById(id); if (el) el.setAttribute('aria-pressed', active); if (el) el.className = `py-2 rounded-xl font-cute font-bold text-[13px] border transition ${active ? color + ' text-white border-transparent' : 'bg-white text-bacha-text border-bacha-gingham'}`; };
  on('ful-pickup', !delivery, 'bg-bacha-matcha'); on('ful-delivery', delivery, 'bg-bacha-matcha');
  on('pay-gcash', !cod, 'bg-bacha-gcash'); on('pay-cod', cod, 'bg-amber-700');
  document.getElementById('pickup-info')?.classList.toggle('hidden', delivery);
  document.getElementById('delivery-fields')?.classList.toggle('hidden', !delivery);
  document.getElementById('cod-info')?.classList.toggle('hidden', !cod);
  document.getElementById('gcash-section')?.classList.toggle('hidden', cod);
  const btn = document.getElementById('submit-order-btn');
  if (btn && !btn.disabled) btn.innerText = cod ? 'Place COD Order' : 'Upload Receipt & Submit Order';
}

// ---- Invoice & order tracking ----
function toggleTrackModal(open) {
  const m = document.getElementById('track-modal');
  m.classList.toggle('opacity-0', !open); m.classList.toggle('pointer-events-none', !open);
  m.classList.toggle('opacity-100', open); m.classList.toggle('pointer-events-auto', open);
  if (open) {
    document.getElementById('track-result').innerHTML = '';
    try {
      const last = JSON.parse(localStorage.getItem('bacha_last_order') || 'null');
      const idEl = document.getElementById('track-id'), ctEl = document.getElementById('track-contact');
      if (last && !idEl.value && !ctEl.value) { idEl.value = last.id || ''; ctEl.value = last.contact || ''; }
    } catch (e) {}
  }
}
function toggleInvoiceModal(open) {
  const m = document.getElementById('invoice-modal');
  m.classList.toggle('opacity-0', !open); m.classList.toggle('pointer-events-none', !open);
  m.classList.toggle('opacity-100', open); m.classList.toggle('pointer-events-auto', open);
}
function printInvoice() {
  document.body.classList.add('printing-invoice');
  window.print();
  setTimeout(() => document.body.classList.remove('printing-invoice'), 500);
}
function isConfirmed(o) { return o && ['queued', 'ready', 'done'].includes(orderKind(o)); }

async function trackOrder() {
  const id = document.getElementById('track-id').value.trim().toUpperCase();
  const digits = v => String(v || '').replace(/\D/g, '');
  const contact = digits(document.getElementById('track-contact').value);
  const out = document.getElementById('track-result');
  if (!id || !contact) { out.innerHTML = `<p class="text-rose-700 font-bold">Please enter your Order ID and mobile number.</p>`; return; }
  let o = null;
  if (isSupabaseConfigured && sbClient) {
    const { data, error } = await sbClient.rpc('track_order', { p_id: id, p_contact: contact });
    if (error) { out.innerHTML = `<p class="text-rose-700 font-bold">${esc(friendlyErr(error.message))}</p>`; return; }
    o = data;
  } else o = orders.find(x => x.id === id);
  if (!o || !samePhone(o.contact_number, contact)) { out.innerHTML = `<p class="text-rose-700 font-bold">We couldn't find that order. Please check your Order ID and number.</p>`; return; }
  trackedOrder = o;
  const k = orderKind(o);
  const stage = k === 'ready' ? (o.fulfillment === 'delivery' ? '🍪 Your order is ready and on its way to being delivered!' : '🍪 Your order is ready for pick-up! We will message you to coordinate.')
    : k === 'done' ? (o.fulfillment === 'delivery' ? '✅ Delivered. Thank you for ordering from Bacha!' : '✅ Picked up. Thank you for ordering from Bacha!')
    : '✅ Confirmed by our baker! Your order is in the oven queue.';
  if (isConfirmed(o)) {
    out.innerHTML = `<div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2"><p class="font-bold text-emerald-800">${stage}</p><button onclick="showInvoiceObj(trackedOrder)" class="w-full py-2 rounded-xl bg-bacha-matcha text-white font-cute font-bold text-sm">🧾 View Invoice</button></div>`;
  } else if (k === 'cancelled') {
    out.innerHTML = `<div class="p-3 rounded-xl bg-rose-50 border border-rose-200 font-bold text-rose-700">This order was cancelled. Please message us if you have questions, we're happy to help.</div>`;
  } else {
    out.innerHTML = `<div class="p-3 rounded-xl bg-amber-50 border border-amber-200 font-bold text-amber-800">⏳ We received your order. Our baker is checking it now — your invoice appears here once it's confirmed.</div>`;
  }
}

function showInvoice(orderId) { showInvoiceObj(orders.find(x => x.id === orderId)); }
function showInvoiceObj(o) {
  if (!o) return;
  const date = (o.created_at ? new Date(o.created_at) : new Date()).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  const lines = [];
  (o.boxes || []).forEach((b, i) => lines.push(`<tr><td class="py-1 align-top"><b>Custom Box of 6 #${i + 1}</b><br><span class="text-[12px] text-gray-500">${esc((b.items || []).join(', '))}</span></td><td class="py-1 text-right align-top">₱${esc(b.price)}</td></tr>`));
  (o.items || []).forEach(i => lines.push(`<tr><td class="py-1">${esc(i.qty)}× ${esc(i.name)}</td><td class="py-1 text-right">₱${esc(i.qty * i.unit_price)}</td></tr>`));
  const payNote = o.order_type === 'pos' ? `Paid — ${esc(o.payment_method)}.` : o.payment_method === 'COD'
    ? `Cash on Delivery — please prepare the exact amount of ₱${esc(o.total_amount)}.`
    : 'Paid via GCash — verified by our baker.';
  document.getElementById('invoice-body').innerHTML = `
    <div class="text-center pb-2 border-b border-dashed border-gray-300">
      <p class="font-cute font-bold text-2xl text-bacha-matcha leading-none">BACHA</p>
      <p class="text-[12px] tracking-widest text-bacha-berry font-bold uppercase">Matcha &amp; Bakehouse</p>
      <p class="font-bold text-base mt-1">${o.order_type === 'pos' ? 'RECEIPT' : 'INVOICE'}</p>
      ${orderKind(o) === 'cancelled' ? '<p class="font-bold text-rose-700 text-sm">— VOID / CANCELLED —</p>' : ''}
    </div>
    <div class="text-[13px] py-2 space-y-0.5">
      <p><b>Order ID:</b> ${esc(o.id)}</p><p><b>Date:</b> ${esc(date)}</p>
      <p><b>Name:</b> ${esc(o.customer_name)}</p><p><b>Contact:</b> ${esc(o.contact_number)}</p>
      ${o.order_type === 'pos' ? '' : `<p><b>${o.fulfillment === 'delivery' ? 'Delivery' : 'Pick-up'}:</b> ${o.fulfillment === 'delivery' ? esc(o.delivery_address) : 'we will coordinate via chat'}</p>`}
      ${o.batch_date && o.order_type !== 'pos' ? `<p><b>Batch:</b> ${esc(o.batch_date)}</p>` : ''}
    </div>
    <table class="w-full text-[13px] border-t border-dashed border-gray-300 pt-1">${lines.join('')}</table>
    <div class="flex justify-between items-center border-t border-dashed border-gray-300 mt-1 pt-2 font-bold"><span>TOTAL</span><span class="text-xl text-bacha-matcha">₱${esc(o.total_amount)}</span></div>
    <p class="text-[12px] text-center text-gray-600 pt-2">${payNote}</p>
    <p class="text-[12px] text-center text-bacha-berry font-bold pt-1">Thank you for supporting Bacha! ♡</p>`;
  toggleInvoiceModal(true);
}

// ---- CSV export ----


/* Instagram button: a small tab sits on the left edge of the screen so it never covers content. Tap it to slide the message button out; tap again, tap elsewhere or press Esc to tuck it away. */
function setIgDock(collapsed) {
  const dock = document.getElementById('ig-dock'), btn = document.getElementById('ig-toggle'), link = document.getElementById('ig-float');
  if (!dock || !btn) return;
  dock.classList.toggle('is-collapsed', collapsed);
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  btn.setAttribute('aria-label', collapsed ? 'Show the Instagram message button' : 'Hide the Instagram message button');
  if (link) { link.tabIndex = collapsed ? -1 : 0; link.setAttribute('aria-hidden', collapsed ? 'true' : 'false'); }
}
function toggleIgDock() { setIgDock(!document.getElementById('ig-dock').classList.contains('is-collapsed')); }
document.addEventListener('DOMContentLoaded', () => {
  setIgDock(true);
  document.addEventListener('click', e => { const d = document.getElementById('ig-dock'); if (d && !d.classList.contains('is-collapsed') && !d.contains(e.target)) setIgDock(true); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const d = document.getElementById('ig-dock'); if (d && !d.classList.contains('is-collapsed')) { setIgDock(true); document.getElementById('ig-toggle').focus(); } } });
  const l = document.getElementById('ig-float'); if (l) l.addEventListener('click', () => setTimeout(() => setIgDock(true), 50));
});
