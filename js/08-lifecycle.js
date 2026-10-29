/* Cut-off, stock safety, order lifecycle, bake list, reports */
// =========================================================================
// PART 3 ADDITIONS: working cut-off, order lifecycle, bake list, safe stock, POS tools
// =========================================================================
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
let batchCutoffs = {}, batchSig = '', realtimeSub = null;

// ---- bake days & cut-off (all editable in Store Control) ----
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const OLD_BANNER = "🌸 Orders close every Thursday at 8PM for Friday's fresh oven bake!", OLD_DISPATCH = 'Friday Batch Pick-up & Delivery';
function normalizeDeadline(raw) {
  const c = Object.assign({ time: '20:00', count: 4, dispatch: '', banner: '' }, raw || {});
  if (!Array.isArray(c.batchDays)) { const bi = DAYS.indexOf(c.batchDay); c.batchDays = [bi >= 0 ? bi : 5]; }   // older saved format
  if (c.daysBefore == null) { const di = DAYS.indexOf(c.day); c.daysBefore = di >= 0 ? (c.batchDays[0] - di + 7) % 7 : 1; }
  c.batchDays = [...new Set(c.batchDays.map(Number).filter(n => n >= 0 && n <= 6))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (!c.batchDays.length) c.batchDays = [5];
  c.daysBefore = Math.min(6, Math.max(0, Number(c.daysBefore) || 0));
  c.count = Math.min(8, Math.max(1, Number(c.count) || 4));
  if (!/^\d{2}:\d{2}$/.test(c.time)) c.time = '20:00';
  if (c.banner === OLD_BANNER) c.banner = '';
  if (c.dispatch === OLD_DISPATCH) c.dispatch = '';
  delete c.day; delete c.batchDay;
  return c;
}
let deadlineCfg = normalizeDeadline((() => { try { return JSON.parse(localStorage.getItem('bacha_deadline_settings') || '{}'); } catch (e) { return {}; } })());
function dayList() {
  const n = deadlineCfg.batchDays.map(i => DAYS[i]);
  return n.length < 2 ? n[0] : n.slice(0, -1).join(', ') + ' & ' + n[n.length - 1];
}
function beforeText(n) { return n === 0 ? 'on the bake day' : n === 1 ? '1 day before' : `${n} days before`; }
function cutoffFor(batchDate) {
  const [h, m] = String(deadlineCfg.time || '20:00').split(':').map(Number);
  const c = new Date(batchDate); c.setHours(0, 0, 0, 0); c.setDate(c.getDate() - deadlineCfg.daysBefore); c.setHours(h || 0, m || 0, 0, 0);
  return c;
}
function openBatches(n = deadlineCfg.count) {
  const out = [], now = new Date(), start = new Date(now); start.setHours(0, 0, 0, 0);
  for (let i = 0; i < 120 && out.length < n; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (!deadlineCfg.batchDays.includes(d.getDay())) continue;
    const c = cutoffFor(d);
    if (now < c) out.push({ date: d, cutoff: c, label: `Batch: ${DAYS[d.getDay()]}, ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` });
  }
  return out;
}
function generateWeeklyBatchDates() {
  const list = openBatches();
  batchCutoffs = {}; list.forEach(b => { batchCutoffs[b.label] = b.cutoff.getTime(); });
  if (!(selectedBatchDate && batchCutoffs[selectedBatchDate])) selectedBatchDate = list[0] ? list[0].label : '';
  const sig = list.map(b => b.label).join('|') + '#' + selectedBatchDate;
  const sel = document.getElementById('customer-preorder-date');
  if (sel && sig !== batchSig) {
    sel.innerHTML = list.length
      ? list.map(b => `<option value="${esc(b.label)}" ${b.label === selectedBatchDate ? 'selected' : ''}>${esc(b.label)}</option>`).join('')
      : '<option value="">No bake dates open</option>';
  }
  batchSig = sig;
}
function renderCutoffBanner() {
  const el = document.getElementById('cutoff-banner'); if (!el) return;
  const first = openBatches(1)[0];
  el.classList.toggle('hidden', !(storeMode === 'open' && first));
  if (!first) return;
  const ms = Math.max(0, first.cutoff - Date.now());
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
  const left = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${Math.max(m, 1)}m`;
  const auto = `🌸 Next bake: ${first.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`;
  document.getElementById('cutoff-banner-text').textContent = deadlineCfg.banner || auto;
  document.getElementById('cutoff-banner-time').textContent = `Orders close ${first.cutoff.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${fmtTime12(deadlineCfg.time)} · ${left} left`;
}
function applyDeadlineUI() {
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
  document.querySelectorAll('input[name="bakeday"]').forEach(c => { c.checked = deadlineCfg.batchDays.includes(Number(c.value)); });
  set('deadline-before-input', deadlineCfg.daysBefore); set('deadline-time-input', deadlineCfg.time); set('deadline-count-input', deadlineCfg.count);
  set('deadline-dispatch-input', deadlineCfg.dispatch); set('deadline-banner-input', deadlineCfg.banner);
  const autoDispatch = `${dayList()} bake pick-up & delivery`;
  const di = document.getElementById('deadline-dispatch-input'); if (di) di.placeholder = `Automatic: ${autoDispatch}`;
  const bi = document.getElementById('deadline-banner-input'); if (bi) bi.placeholder = 'Automatic: shows the next bake date and cut-off';
  const disp = document.getElementById('current-deadline-display');
  if (disp) disp.textContent = `Bake days: ${dayList()} · orders close ${beforeText(deadlineCfg.daysBefore)} at ${fmtTime12(deadlineCfg.time)}`;
  const first = openBatches(1)[0], pill = document.getElementById('deadline-pill-text');
  if (pill) pill.textContent = first ? `Open until ${first.cutoff.toLocaleDateString('en-US', { weekday: 'short' })} ${fmtTime12(deadlineCfg.time)}` : 'Cut-off passed';
  const pi = document.getElementById('pickup-info');
  if (pi) pi.textContent = `🌸 ${deadlineCfg.dispatch || autoDispatch}. We'll message you via chat to coordinate the time and place.`;
  const bp = document.getElementById('batch-pill-text');
  if (bp) bp.textContent = deadlineCfg.batchDays.length === 1 ? '1 Batch Per Week Pre-Order' : `${deadlineCfg.batchDays.length} Bake Days Per Week`;
  const note = document.getElementById('cust-note');
  if (note) note.placeholder = `e.g. ${first ? DAYS[first.date.getDay()] : DAYS[deadlineCfg.batchDays[0]]} 2:00 PM`;
  generateWeeklyBatchDates(); renderCutoffBanner();
}
async function saveDeadlineSettings() {
  const val = id => document.getElementById(id).value;
  const days = [...document.querySelectorAll('input[name="bakeday"]:checked')].map(c => Number(c.value));
  if (!days.length) { await showBachaAlert("Please tick at least one bake day.", "Bake Days", "📅"); return; }
  const time = val('deadline-time-input');
  if (!/^\d{2}:\d{2}$/.test(time)) { await showBachaAlert("Please choose a valid cut-off time.", "Check Time", "⏰"); return; }
  deadlineCfg = normalizeDeadline({ batchDays: days, daysBefore: Number(val('deadline-before-input')), time, count: Number(val('deadline-count-input')), dispatch: val('deadline-dispatch-input').trim(), banner: val('deadline-banner-input').trim() });
  dayoffMessage = val('dayoff-message-input').trim() || DEFAULT_DAYOFF;
  localStorage.setItem('bacha_deadline_settings', JSON.stringify(deadlineCfg));
  localStorage.setItem('bacha_dayoff_msg', dayoffMessage);
  let failed = null;
  if (isSupabaseConfigured && sbClient) {
    const r1 = await adm('admin_set_setting', { p_key: 'deadline_settings', p_value: JSON.stringify(deadlineCfg) });
    const r2 = await adm('admin_set_setting', { p_key: 'dayoff_message', p_value: dayoffMessage });
    if (r1.error || r2.error) failed = (r1.error || r2.error).message;
  }
  applyStoreMode(); applyDeadlineUI();
  const first = openBatches(1)[0];
  const summary = `Bake days: ${dayList()}\nOrders close ${beforeText(deadlineCfg.daysBefore)} at ${fmtTime12(deadlineCfg.time)}\nNext bake date customers can order for: ${first ? first.label.replace('Batch: ', '') : 'none open'}`;
  await showBachaAlert(failed ? `Saved on this device only. It could not be saved for customers:\n${failed}\n\n${summary}` : `${summary}${isSupabaseConfigured ? '\n\nCustomers see this right away.' : ''}`, failed ? "Not Saved" : "Settings Saved", failed ? "⚠️" : "⏳");
}
const ST = { PENDING: 'Payment Verification Required', QUEUED: 'Payment Verified / Queued', READY: 'Ready', DONE: 'Completed', REJECTED: 'Payment Rejected', CANCELLED: 'Cancelled', POS: 'Completed (POS)', VOID: 'Voided (POS)' };

// ---- small helpers ----
function toast(msg) {
  let t = document.getElementById('bacha-toast');
  if (!t) {
    t = document.createElement('div'); t.id = 'bacha-toast';
    t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
    t.className = 'fixed left-1/2 -translate-x-1/2 bottom-24 lg:bottom-6 z-[80] max-w-[90vw] px-4 py-2 rounded-xl bg-bacha-matchaDark text-white font-cute font-bold text-sm shadow-lg transition-opacity duration-300 opacity-0 pointer-events-none';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.classList.remove('opacity-0'); t.classList.add('opacity-100');
  clearTimeout(t._h); t._h = setTimeout(() => { t.classList.add('opacity-0'); t.classList.remove('opacity-100'); }, 2600);
}
async function dbFail(error, what) {
  console.error(what, error);
  await showBachaAlert(`${what} could not be saved:\n${(error && error.message) || error}\n\nThe screen was refreshed to show what is really saved.`, "Not Saved", "⚠️");
  if (isSupabaseConfigured && sbClient) { await initSupabaseData(); renderAdmin(); renderBoxBuilder(); renderCustomizeTab(); }
}
async function refreshAll() {
  if (isSupabaseConfigured && sbClient) await initSupabaseData(); else saveState();
  renderAdmin(); renderBoxBuilder(); renderPOS();
}
function fmtTime12(t) {
  const [h, m] = String(t || '20:00').split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function digitsOf(v) { return String(v || '').replace(/\D/g, ''); }
function normalizePH(v) {
  let d = digitsOf(v);
  if (d.length === 12 && d.startsWith('63')) d = '0' + d.slice(2);
  else if (d.length === 10 && d[0] === '9') d = '0' + d;
  return /^09\d{9}$/.test(d) ? d : null;
}
function samePhone(a, b) {
  const x = normalizePH(a), y = normalizePH(b);
  return x && y ? x === y : digitsOf(a) === digitsOf(b);
}
function makeOrderId(prefix) {
  const A = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; let s = '';
  const r = new Uint32Array(5); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(r) : r.forEach((_, i) => r[i] = Math.random() * 4e9);
  for (let i = 0; i < 5; i++) s += A[r[i] % A.length];
  return `${prefix}-${s}`;
}

// ---- item 27: working cut-off & batch dates ----
setInterval(() => { generateWeeklyBatchDates(); renderCutoffBanner(); }, 60000);

// ---- item 30: safe stock handling (optimistic lock + rollback) ----
async function changeStock(id, delta, strict) {
  const prod = products.find(p => p.id == id);
  if (prod) id = prod.id;
  if (!(isSupabaseConfigured && sbClient)) {
    if (!prod) return { ok: false, reason: 'missing' };
    if (strict && prod.stock + delta < 0) return { ok: false, reason: 'short', left: prod.stock };
    prod.stock = Math.max(0, prod.stock + delta); return { ok: true };
  }
  const { data, error } = await adm('admin_adjust_stock', { p_id: id, p_delta: delta });
  if (error) return { ok: false, reason: 'error', error };
  if (prod && typeof data === 'number') prod.stock = data;
  return { ok: true };
}
async function releaseStock(done) { for (const [pid, cnt] of done) await changeStock(pid, cnt, false); }
async function reserveStock(map) {
  const done = [];
  for (const [pid, cnt] of Object.entries(map)) {
    const r = await changeStock(pid, -cnt, true);
    if (!r.ok) { await releaseStock(done); const p = products.find(x => x.id == pid); return { ...r, name: p ? p.name : 'an item' }; }
    done.push([pid, cnt]);
  }
  return { ok: true, done };
}
function orderStockMap(o) {
  const map = {}, missing = [];
  const add = (id, n) => { map[id] = (map[id] || 0) + n; };
  (o.boxes || []).forEach(b => {
    const names = b.items || [];
    if (Array.isArray(b.item_ids) && b.item_ids.length === names.length) b.item_ids.forEach(i => add(i, 1));
    else names.forEach(nm => { const p = products.find(x => x.name === nm); p ? add(p.id, 1) : missing.push(nm); });
  });
  (o.items || []).forEach(i => {
    const p = products.find(x => x.id == i.id) || products.find(x => x.name === i.name);
    p ? add(p.id, Number(i.qty) || 0) : missing.push(i.name);
  });
  return { map, missing };
}
async function restoreOrderStock(o) {
  if (SB()) {   // the server already put the items back
    if (lastUnmatched.length) await showBachaAlert(`Some items could not be returned to stock automatically (no longer on the menu): ${lastUnmatched.join(', ')}. Please check the Inventory tab.`, "Check Stock", "🍪");
    lastUnmatched = []; return;
  }
  const { map, missing } = orderStockMap(o);
  const failed = [];
  for (const [pid, n] of Object.entries(map)) { const r = await changeStock(pid, n, false); if (!r.ok) failed.push(pid); }
  if (missing.length || failed.length) {
    await showBachaAlert(`Some items could not be returned to stock automatically${missing.length ? ' (no longer on the menu): ' + missing.join(', ') : ''}. Please check the Inventory tab.`, "Check Stock", "🍪");
  }
}
async function removeUpload(url) {
  try {
    if (!(isSupabaseConfigured && sbClient) || !url) return;
    const name = String(url).split('/gcash-receipts/')[1]; if (!name) return;
    await sbClient.storage.from('gcash-receipts').remove([decodeURIComponent(name.split('?')[0])]);   // customers can't delete files; this only works if ever allowed
  } catch (e) {}
}
// ---- item 34: receipt checks + compression ----
function checkImageFile(file) {
  if (!file) return 'Please choose an image.';
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return 'Please use a JPG, PNG or WebP image (a screenshot is fine). HEIC photos are not supported.';
  if (file.size > 12 * 1024 * 1024) return 'That image is larger than 12 MB. Please choose a smaller one.';   // it is shrunk to under 5 MB before upload
  return '';
}
async function shrinkImage(file, max, keepPng) {
  try {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || !window.createImageBitmap) return file;
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (s === 1 && file.size < 500 * 1024) return file;
    const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    if (!keepPng) { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }
    x.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, keepPng ? 'image/png' : 'image/jpeg', 0.82));
    return blob && blob.size < file.size ? blob : file;
  } catch (e) { return file; }
}
async function uploadImage(file, prefix) {
  if (!file) return null;
  if (isSupabaseConfigured && sbClient) {
    const isProduct = prefix !== 'receipt';
    const out = await shrinkImage(file, isProduct ? 900 : 1600, isProduct);
    const ext = out.type === 'image/png' ? 'png' : out.type === 'image/webp' ? 'webp' : 'jpg';
    const rnd = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');   // 128-bit unguessable name
    const fileName = `${isProduct ? 'product' : 'receipt'}/${rnd}.${ext}`;
    const { error } = await sbClient.storage.from('gcash-receipts').upload(fileName, out, { contentType: out.type || undefined });
    if (error) { console.error("Upload error:", error); return null; }
    return sbClient.storage.from('gcash-receipts').getPublicUrl(fileName).data.publicUrl;
  }
  return URL.createObjectURL(file);
}

// ---- item 28: order lifecycle ----
function orderKind(o) {
  const s = o.status;
  if (s === ST.PENDING || s === COD_STATUS) return 'pending';
  if (s === ST.QUEUED) return 'queued';
  if (s === ST.READY) return 'ready';
  if (s === ST.REJECTED || s === ST.CANCELLED || s === ST.VOID) return 'cancelled';
  return 'done';
}
function statusLabel(o) {
  return { 'Payment Verified / Queued': 'Paid · In Oven', 'Completed': 'Completed', 'Voided (POS)': 'Voided' }[o.status] || o.status;
}
async function setOrderStatus(id, to, from) {
  const o = orders.find(x => x.id === id);
  if (isSupabaseConfigured && sbClient) {
    const { data, error } = await adm('admin_set_order_status', { p_id: id, p_to: to });
    if (error) return { ok: false, error };
    if (!data || !data.ok) return { ok: false, stale: true };
    lastUnmatched = data.unmatched || [];
    if (o) o.status = to; return { ok: true };
  }
  if (!o || !from.includes(o.status)) return { ok: false, stale: true };
  o.status = to; return { ok: true };
}
async function transition(id, to, from) {
  const r = await setOrderStatus(id, to, from);
  if (r.error) { await dbFail(r.error, 'The order update'); return false; }
  if (r.stale) { await showBachaAlert("This order was already updated, maybe on another device. The list has been refreshed.", "Already Updated", "ℹ️"); await refreshAll(); return false; }
  return true;
}
async function markReady(id) { if (await transition(id, ST.READY, [ST.QUEUED])) { await refreshAll(); toast(`${id} is ready`); } }
async function markDone(id) {
  const o = orders.find(x => x.id === id);
  if (await transition(id, ST.DONE, [ST.READY])) { await refreshAll(); toast(`${id} marked ${o && o.fulfillment === 'delivery' ? 'delivered' : 'picked up'}`); }
}
async function cancelOrder(id) {
  const o = orders.find(x => x.id === id); if (!o) return;
  if (!await showBachaConfirm(`Cancel order ${id}?\nThe flavors will be returned to stock. Use this when the customer cancels or the order can't be fulfilled.`, "Cancel Order", "⚠️")) return;
  if (!await transition(id, ST.CANCELLED, [ST.QUEUED, ST.READY])) return;
  await restoreOrderStock(o); await refreshAll(); toast(`${id} cancelled and restocked`);
}
async function voidPosSale(id) {
  const o = orders.find(x => x.id === id); if (!o) return;
  if (!await showBachaConfirm(`Void sale ${id} (₱${o.total_amount})?\nItems go back to stock and the sale no longer counts in sales totals. Give the customer their money back first.`, "Void Sale", "↩️")) return;
  if (!await transition(id, ST.VOID, [ST.POS])) return;
  await restoreOrderStock(o); await refreshAll(); toast(`${id} voided`);
}
function lifecycleButtons(o) {
  const id = esc(o.id), k = orderKind(o);
  const b = (fn, label, cls) => `<button onclick="${fn}(this.dataset.id)" data-id="${id}" class="px-3 py-1 rounded-full font-cute font-bold text-[13px] transition ${cls}">${label}</button>`;
  const light = 'bg-white border border-bacha-matcha text-bacha-matchaDark hover:bg-bacha-matchaLight';
  const main = 'bg-bacha-matcha hover:bg-bacha-matchaDark text-white shadow-sm';
  const warn = 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200';
  const tag = t => `<span class="text-sm font-cute font-bold text-emerald-700 flex items-center gap-1">${t}</span>`;
  if (o.order_type === 'pos') return b('showInvoice', '🧾 Receipt', light) + b('voidPosSale', '↩ Void sale', warn) + tag('✓ Sale Completed');
  if (k === 'queued') return b('markReady', '🍪 Mark Ready', main) + b('showInvoice', '🧾 Invoice', light) + b('cancelOrder', '✕ Cancel order', warn) + tag('Paid &amp; In Oven');
  if (k === 'ready') return b('markDone', o.fulfillment === 'delivery' ? '🛵 Mark Delivered' : '🛍️ Mark Picked Up', main) + b('showInvoice', '🧾 Invoice', light) + b('cancelOrder', '✕ Cancel order', warn) + tag('🍪 Ready');
  return b('showInvoice', '🧾 Invoice', light) + tag('✓ Completed');
}

// ---- item 29: bake list per batch ----
function renderBakeList() {
  const sel = document.getElementById('bake-batch'), host = document.getElementById('bake-list-body');
  if (!sel || !host) return;
  const incl = document.getElementById('bake-include-pending').checked;
  const rel = orders.filter(o => o.order_type !== 'pos' && (['queued', 'ready', 'done'].includes(orderKind(o)) || (incl && orderKind(o) === 'pending')));
  const bOf = o => o.batch_date || 'Weekly Batch';
  const batches = [...new Set(rel.map(bOf))].sort((a, b) => (batchCutoffs[a] ?? 9e15) - (batchCutoffs[b] ?? 9e15) || b.localeCompare(a));
  const prev = sel.value;
  sel.innerHTML = batches.map(b => `<option value="${esc(b)}">${esc(b)} · ${rel.filter(o => bOf(o) === b).length} order(s)</option>`).join('');
  sel.value = batches.includes(prev) ? prev : (batches[0] || '');
  if (!batches.length) { host.innerHTML = '<p class="text-[13px] text-bacha-text/75 font-cute py-2">No paid orders yet. Confirm payments and they show up here.</p>'; return; }
  const rows = rel.filter(o => bOf(o) === sel.value), cnt = {}; let boxes = 0, pcs = 0;
  rows.forEach(o => {
    (o.boxes || []).forEach(b => { boxes++; (b.items || []).forEach(n => { cnt[n] = (cnt[n] || 0) + 1; pcs++; }); });
    (o.items || []).forEach(i => { const q = Number(i.qty) || 0; cnt[i.name] = (cnt[i.name] || 0) + q; pcs += q; });
  });
  const list = Object.entries(cnt).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  host.innerHTML = `<div class="bake-list">${list.map(([n, q]) => `<div class="bake-row" data-name="${esc(n)}" data-qty="${q}"><span class="font-cute font-bold min-w-0">${esc(n)}</span><span class="bake-qty font-cute">${q}</span></div>`).join('')}</div>
    <p class="text-[13px] font-bold text-bacha-text/75 pt-2 border-t border-bacha-gingham mt-1">${rows.length} order(s) · ${boxes} box(es) of 6 · ${pcs} item(s) in total</p>`;
}
async function copyBakeList() {
  const sel = document.getElementById('bake-batch'); if (!sel.value) return;
  const lines = [...document.querySelectorAll('#bake-list-body .bake-row')].map(r => `${r.dataset.qty}× ${r.dataset.name}`);
  const text = `Bake list — ${sel.value}\n${lines.join('\n')}`;
  try { await navigator.clipboard.writeText(text); toast('Bake list copied'); } catch (e) { showBachaAlert(text, 'Bake list', '🧁'); }
}

// ---- item 34: POS end-of-day report ----
function showLastReceipt() {
  const last = orders.filter(o => o.order_type === 'pos' && o.status === ST.POS).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  if (!last) { showBachaAlert("No counter sales yet today.", "No Receipt", "🧾"); return; }
  showInvoiceObj(last);
}
function showDayReport() {
  const key = dayKey(new Date());
  const mine = orders.filter(o => o.order_type === 'pos' && o.created_at && dayKey(new Date(o.created_at)) === key);
  const sales = mine.filter(o => o.status === ST.POS), voids = mine.filter(o => o.status === ST.VOID);
  const sum = a => a.reduce((n, o) => n + Number(o.total_amount || 0), 0);
  const byPay = {}; sales.forEach(o => { byPay[o.payment_method] = (byPay[o.payment_method] || 0) + Number(o.total_amount || 0); });
  const items = {}; sales.forEach(o => (o.items || []).forEach(i => { items[i.name] = (items[i.name] || 0) + (Number(i.qty) || 0); }));
  const online = orders.filter(o => o.order_type !== 'pos' && o.created_at && dayKey(new Date(o.created_at)) === key && ['queued', 'ready', 'done'].includes(orderKind(o)));
  const row = (a, b, bold) => `<tr><td class="py-0.5 ${bold ? 'font-bold' : ''}">${a}</td><td class="py-0.5 text-right ${bold ? 'font-bold' : ''}">${b}</td></tr>`;
  document.getElementById('invoice-body').innerHTML = `
    <div class="text-center pb-2 border-b border-dashed border-gray-300">
      <p class="font-cute font-bold text-2xl text-bacha-matcha leading-none">BACHA</p>
      <p class="font-bold text-base mt-1">END-OF-DAY REPORT</p>
      <p class="text-[12px] text-gray-600">${esc(new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))}</p>
    </div>
    <p class="text-[12px] font-bold uppercase text-gray-600 pt-2">Counter sales (POS)</p>
    <table class="w-full text-[13px]">${row(`Sales (${sales.length})`, '₱' + sum(sales), true)}${Object.entries(byPay).map(([k, v]) => row('&nbsp;&nbsp;' + esc(k), '₱' + v)).join('')}${voids.length ? row(`Voided (${voids.length}) — not counted`, '₱' + sum(voids)) : ''}</table>
    <p class="text-[12px] font-bold uppercase text-gray-600 pt-2">Items sold at the counter</p>
    <table class="w-full text-[13px]">${Object.entries(items).sort((a, b) => b[1] - a[1]).map(([n, q]) => row(esc(n), q + '×')).join('') || row('None yet', '')}</table>
    <p class="text-[12px] font-bold uppercase text-gray-600 pt-2">Online orders placed today (paid)</p>
    <table class="w-full text-[13px]">${row(`Orders (${online.length})`, '₱' + sum(online), true)}</table>`;
  toggleInvoiceModal(true);
}

// ---- item 34: delivery rules ----
function deliveryRules() { return { area: String(appConfig.deliveryArea || '').trim(), min: Number(appConfig.freeDeliveryMin) || 0 }; }
function renderDeliveryRules() {
  const { area, min } = deliveryRules();
  const btn = document.getElementById('ful-delivery'); if (btn) btn.textContent = `🛵 Delivery (${min ? 'Free ₱' + min + '+' : 'Free'})`;
  const note = document.getElementById('delivery-area-note'), wrap = document.getElementById('area-ok-wrap');
  const text = [area ? `🛵 We deliver within: ${area}.` : '', min ? `Delivery is free for orders of ₱${min} or more.` : ''].filter(Boolean).join(' ');
  if (note) { note.textContent = text; note.classList.toggle('hidden', !text); }
  if (wrap) wrap.classList.toggle('hidden', !area);
}

