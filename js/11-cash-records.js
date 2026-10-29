/* Cash drawer, backup, photo cleanup, activity log (admin only, needs the online database) */

const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const NEEDS_DB = `<div class="md:col-span-2 bg-white rounded-2xl border border-bacha-gingham p-5 text-sm text-bacha-text/80 font-cute">This section needs the online database. It is not available in offline demo mode.</div>`;
let cashData = null;

function cashDay() {
  const el = document.getElementById('cash-day');
  if (!el.value) el.value = dayKey(new Date());
  el.max = dayKey(new Date());
  return el.value;
}

async function renderCashTab() {
  const host = document.getElementById('cash-body');
  if (!host) return;
  if (!(isSupabaseConfigured && adminToken)) { host.innerHTML = NEEDS_DB; return; }
  const { data, error } = await adm('admin_cash_get', { p_day: cashDay() });
  if (error) { host.innerHTML = `<p class="md:col-span-2 text-rose-700 font-bold">${esc(error.message)}</p>`; return; }
  cashData = data; drawCash();
}

function drawCash() {
  const d = cashData, host = document.getElementById('cash-body');
  const row = (label, val, cls = '') => `<div class="flex justify-between py-1.5 text-sm"><span class="text-bacha-text/80">${label}</span><span class="font-cute font-bold ${cls}">${val}</span></div>`;
  const kindLabel = { in: '➕ Cash in', out: '➖ Cash out', refund: '↩ Refund' };
  const diff = d.difference;
  const diffTxt = diff == null ? '' : Number(diff) === 0 ? '✓ Exactly right' : Number(diff) > 0 ? `${peso(diff)} over` : `${peso(Math.abs(diff))} short`;
  const lock = d.closed ? 'disabled' : '';
  host.innerHTML = `
    <section class="bg-white rounded-2xl border border-bacha-gingham p-4 space-y-3" aria-label="Drawer summary">
      <h2 class="font-cute font-bold text-lg text-bacha-berry">Drawer summary ${d.closed ? '<span class="ml-2 text-[12px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Closed</span>' : ''}</h2>
      <div class="flex items-end gap-2">
        <div class="flex-1"><label for="cash-opening" class="block text-[12px] font-bold text-bacha-text/75 mb-0.5">Opening cash (float)</label>
          <input id="cash-opening" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(d.opening)}" ${lock} class="w-full px-3 py-2 rounded-xl border border-bacha-gingham text-sm" /></div>
        <button onclick="saveCashOpening()" ${lock} class="px-4 py-2 rounded-xl bg-bacha-matcha text-white font-cute font-bold text-sm disabled:opacity-50">Save</button>
      </div>
      ${!d.exists && d.last_counted != null ? `<button onclick="document.getElementById('cash-opening').value='${esc(d.last_counted)}'" class="text-[12px] underline font-bold text-bacha-matchaDark">Use last closing count (${peso(d.last_counted)})</button>` : ''}
      <div class="divide-y divide-bacha-gingham/60">
        ${row('Cash sales at the counter', peso(d.cash_sales))}
        ${row('Cash in', peso(d.cash_in))}
        ${row('Cash out', '−' + peso(d.cash_out))}
        ${row('Refunds', '−' + peso(d.refunds))}
        ${row('Expected in drawer', peso(d.expected), 'text-bacha-matcha text-base')}
        ${row('GCash at the counter (not in drawer)', peso(d.gcash_counter_sales), 'text-bacha-text/80')}
      </div>
      <p class="text-[12px] text-bacha-text/80">COD money collected by a rider is not counted until you record it as "Cash in".</p>
      <div class="border-t border-bacha-gingham pt-3 space-y-2">
        <div class="flex items-end gap-2">
          <div class="flex-1"><label for="cash-counted" class="block text-[12px] font-bold text-bacha-text/75 mb-0.5">Cash counted at closing</label>
            <input id="cash-counted" type="number" inputmode="decimal" min="0" step="0.01" value="${d.counted == null ? '' : esc(d.counted)}" ${lock} class="w-full px-3 py-2 rounded-xl border border-bacha-gingham text-sm" /></div>
          ${d.closed ? `<button onclick="reopenCashDay()" class="px-4 py-2 rounded-xl bg-white border border-bacha-matcha text-bacha-matchaDark font-cute font-bold text-sm">Re-open</button>`
                     : `<button onclick="closeCashDay()" class="px-4 py-2 rounded-xl bg-bacha-berry text-white font-cute font-bold text-sm">Close day</button>`}
        </div>
        ${diffTxt ? `<p class="font-cute font-bold ${Number(diff) === 0 ? 'text-emerald-700' : 'text-rose-700'}" role="status">${diffTxt}</p>` : ''}
      </div>
    </section>
    <section class="bg-white rounded-2xl border border-bacha-gingham p-4 space-y-3" aria-label="Cash in, out and refunds">
      <h2 class="font-cute font-bold text-lg text-bacha-berry">Cash in / out / refunds</h2>
      <div class="grid grid-cols-2 gap-2">
        <div><label for="cash-kind" class="block text-[12px] font-bold text-bacha-text/75 mb-0.5">Type</label>
          <select id="cash-kind" ${lock} class="w-full px-3 py-2 rounded-xl border border-bacha-gingham bg-white text-sm"><option value="out">Cash out (bought something)</option><option value="in">Cash in (added / COD handed in)</option><option value="refund">Refund to customer</option></select></div>
        <div><label for="cash-amount" class="block text-[12px] font-bold text-bacha-text/75 mb-0.5">Amount</label>
          <input id="cash-amount" type="number" inputmode="decimal" min="0" step="0.01" ${lock} class="w-full px-3 py-2 rounded-xl border border-bacha-gingham text-sm" /></div>
      </div>
      <div><label for="cash-reason" class="block text-[12px] font-bold text-bacha-text/75 mb-0.5">Reason (needed for cash out and refunds)</label>
        <input id="cash-reason" type="text" maxlength="200" ${lock} class="w-full px-3 py-2 rounded-xl border border-bacha-gingham text-sm" /></div>
      <div><label for="cash-order" class="block text-[12px] font-bold text-bacha-text/75 mb-0.5">Order ID (optional, for refunds)</label>
        <input id="cash-order" type="text" maxlength="40" ${lock} class="w-full px-3 py-2 rounded-xl border border-bacha-gingham text-sm" /></div>
      <p id="cash-form-error" class="text-[12px] font-bold text-rose-700 hidden" role="alert"></p>
      <button onclick="addCashEntry()" ${lock} class="w-full py-2.5 rounded-xl bg-bacha-matcha text-white font-cute font-bold text-sm disabled:opacity-50">Add entry</button>
      <ul class="divide-y divide-bacha-gingham/60">
        ${(d.entries || []).length ? d.entries.map(e => `<li class="py-2 flex items-start justify-between gap-2 text-sm">
          <div><span class="font-bold">${kindLabel[e.kind] || esc(e.kind)}</span> <span class="font-cute font-bold ${e.kind === 'in' ? 'text-emerald-700' : 'text-rose-700'}">${peso(e.amount)}</span>
            <div class="text-[12px] text-bacha-text/75">${esc(e.reason)}${e.order_id ? ' • ' + esc(e.order_id) : ''} • ${esc(new Date(e.created_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }))}</div></div>
          ${d.closed ? '' : `<button onclick="deleteCashEntry(this.dataset.id)" data-id="${esc(e.id)}" aria-label="Remove this entry" class="px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-rose-100 text-rose-700 text-[12px] font-bold">Remove</button>`}</li>`).join('') : '<li class="py-3 text-sm text-bacha-text/80">No entries yet for this day.</li>'}
      </ul>
    </section>`;
}

async function cashCall(fn, args) {
  const { data, error } = await adm(fn, Object.assign({ p_day: cashDay() }, args));
  if (error) { await showBachaAlert(error.message, 'Cash Drawer', '⚠️'); await renderCashTab(); return null; }
  cashData = data; drawCash(); return data;
}
async function saveCashOpening() {
  const v = parseFloat(document.getElementById('cash-opening').value);
  if (isNaN(v) || v < 0) { await showBachaAlert('Please enter the opening cash (0 or more).', 'Cash Drawer', '💵'); return; }
  if (await cashCall('admin_cash_set_opening', { p_amount: v })) toast('Opening cash saved');
}
async function addCashEntry() {
  const err = document.getElementById('cash-form-error'); err.classList.add('hidden');
  const kind = document.getElementById('cash-kind').value, amount = parseFloat(document.getElementById('cash-amount').value);
  const reason = document.getElementById('cash-reason').value.trim(), oid = document.getElementById('cash-order').value.trim();
  const bad = m => { err.textContent = m; err.classList.remove('hidden'); };
  if (!(amount > 0)) return bad('Please enter an amount above ₱0.');
  if (kind !== 'in' && reason.length < 2) return bad('Please write a short reason.');
  if (await cashCall('admin_cash_add', { p_kind: kind, p_amount: amount, p_reason: reason, p_order_id: oid || null })) toast('Entry added');
}
async function deleteCashEntry(id) {
  if (!await showBachaConfirm('Remove this cash entry?', 'Remove Entry', '🗑️')) return;
  const { data, error } = await adm('admin_cash_delete', { p_id: Number(id) });
  if (error) { await showBachaAlert(error.message, 'Cash Drawer', '⚠️'); } else { cashData = data; }
  await renderCashTab();
}
async function closeCashDay() {
  const v = parseFloat(document.getElementById('cash-counted').value);
  if (isNaN(v) || v < 0) { await showBachaAlert('Please count the drawer and type the amount first.', 'Close Day', '💵'); return; }
  if (!await showBachaConfirm(`Close this day with ${peso(v)} counted?\nYou can re-open it later if you made a mistake.`, 'Close Day', '🔒')) return;
  const d = await cashCall('admin_cash_close', { p_counted: v });
  if (d && await showBachaConfirm('Day closed. Download today\'s backup file to this tablet now?', 'Save Backup', '💾')) await downloadBackup();
}
async function reopenCashDay() { await cashCall('admin_cash_reopen', {}); }

// ---------------- backup ----------------
async function downloadBackup() {
  if (!(isSupabaseConfigured && adminToken)) { await showBachaAlert('Backups need the online database.', 'Backup', '💾'); return; }
  const [o, x] = await Promise.all([adm('admin_list_orders', { p_limit: 10000, p_days: 0 }), adm('admin_backup_extras')]);
  if (o.error || x.error) { await showBachaAlert((o.error || x.error).message, 'Backup Failed', '⚠️'); return; }
  const stamp = dayKey(new Date());
  const pkg = { app: 'bacha', exported_at: new Date().toISOString(), note: 'Keep this file safe. It holds customer names and phone numbers.', products, orders: o.data, ...x.data };
  saveTextFile(`bacha-backup-${stamp}.json`, JSON.stringify(pkg, null, 1), 'application/json');
  setTimeout(() => saveTextFile(`bacha-all-orders-${stamp}.csv`, ordersToCSV(o.data), 'text/csv;charset=utf-8;'), 500);
  try { localStorage.setItem('bacha_last_backup', String(Date.now())); } catch (e) {}
  toast(`Backup saved (${o.data.length} orders)`);
  if (activeAdminTab === 'records') renderRecordsTab();
}
function lastBackupInfo() {
  let t = 0; try { t = Number(localStorage.getItem('bacha_last_backup')) || 0; } catch (e) {}
  if (!t) return { text: 'No backup has been saved from this tablet yet.', stale: true };
  const days = Math.floor((Date.now() - t) / 86400000);
  return { text: `Last backup: ${new Date(t).toLocaleString('en-PH')} (${days === 0 ? 'today' : days + ' day' + (days > 1 ? 's' : '') + ' ago'})`, stale: days >= 7 };
}

// ---------------- photo cleanup ----------------
let unusedFiles = null;
async function findUnusedPhotos() {
  const { data, error } = await adm('admin_unused_files');
  if (error) { await showBachaAlert(error.message, 'Photo Cleanup', '⚠️'); return; }
  unusedFiles = data.names || []; renderRecordsTab();
}
async function deleteUnusedPhotos() {
  if (!unusedFiles || !unusedFiles.length) return;
  if (!await showBachaConfirm(`Delete ${unusedFiles.length} unused photo(s)?\nOnly photos not used by any order or menu item (and older than 24 hours) can be deleted.`, 'Delete Unused Photos', '🧹')) return;
  const { error } = await sbClient.storage.from('gcash-receipts').remove(unusedFiles);
  if (error) { await showBachaAlert('Could not delete the photos: ' + error.message + '\nYou can also delete them by hand in Supabase > Storage.', 'Photo Cleanup', '⚠️'); return; }
  await adm('admin_log_event', { p_action: 'Unused photos deleted', p_detail: unusedFiles.length + ' files' });
  const n = unusedFiles.length; unusedFiles = null; toast(`${n} unused photo(s) deleted`); renderRecordsTab();
}
async function purgeOldReceipts() {
  const days = parseInt(document.getElementById('purge-days').value, 10);
  if (!(days >= 30)) { await showBachaAlert('Please choose 30 days or more.', 'Photo Cleanup', '⚠️'); return; }
  if (!await showBachaConfirm(`Remove the receipt photo from every FINISHED order older than ${days} days?\nOpen orders are never touched. The orders stay, only the receipt picture is removed. Make a backup first if you want to keep them.`, 'Remove Old Receipts', '🧹')) return;
  const { data, error } = await adm('admin_purge_old_receipts', { p_days: days });
  if (error) { await showBachaAlert(error.message, 'Photo Cleanup', '⚠️'); return; }
  await initSupabaseData(); unusedFiles = null;
  await showBachaAlert(`${data} order(s) updated. Now tap "Find unused photos" to delete the files themselves (files become deletable after 24 hours of being unused).`, 'Receipts Removed', '✓');
  renderRecordsTab();
}

// ---------------- records tab ----------------
async function renderRecordsTab() {
  const host = document.getElementById('records-body');
  if (!host) return;
  if (!(isSupabaseConfigured && adminToken)) { host.innerHTML = NEEDS_DB; return; }
  const [{ data: log }] = await Promise.all([adm('admin_activity', { p_limit: 200 })]);
  const b = lastBackupInfo();
  host.innerHTML = `
    <section class="bg-white rounded-2xl border border-bacha-gingham p-4 space-y-3" aria-label="Backup">
      <h2 class="font-cute font-bold text-lg text-bacha-berry">💾 Backup</h2>
      <p class="text-sm text-bacha-text/80">Saves every order, your menu, settings and cash records to this tablet as a file (plus an Excel-friendly CSV). It lands in the Downloads folder: copy it to your phone or Google Drive now and then.</p>
      <p class="text-[13px] font-bold ${b.stale ? 'text-rose-700' : 'text-emerald-700'}" role="status">${b.stale ? '⚠️ ' : '✓ '}${esc(b.text)}${b.stale ? ' Please save one.' : ''}</p>
      <button onclick="downloadBackup()" class="w-full py-2.5 rounded-xl bg-bacha-matcha text-white font-cute font-bold text-sm">Download backup now</button>
    </section>
    <section class="bg-white rounded-2xl border border-bacha-gingham p-4 space-y-3" aria-label="Photo cleanup">
      <h2 class="font-cute font-bold text-lg text-bacha-berry">🧹 Photo cleanup</h2>
      <p class="text-sm text-bacha-text/80">Failed or replaced uploads stay in storage. Find and delete the unused ones. Photos used by any order or menu item are never deleted.</p>
      ${unusedFiles === null ? `<button onclick="findUnusedPhotos()" class="w-full py-2.5 rounded-xl bg-white border border-bacha-matcha text-bacha-matchaDark font-cute font-bold text-sm">Find unused photos</button>`
        : unusedFiles.length ? `<p class="text-sm font-bold">${unusedFiles.length} unused photo(s) found.</p><button onclick="deleteUnusedPhotos()" class="w-full py-2.5 rounded-xl bg-rose-600 text-white font-cute font-bold text-sm">Delete ${unusedFiles.length} unused photo(s)</button>`
        : `<p class="text-sm font-bold text-emerald-700">Nothing to clean up. ✓</p><button onclick="findUnusedPhotos()" class="text-[12px] underline font-bold text-bacha-matchaDark">Check again</button>`}
      <div class="border-t border-bacha-gingham pt-3 space-y-2">
        <label for="purge-days" class="block text-[12px] font-bold text-bacha-text/75">Also remove receipt photos of finished orders older than (days)</label>
        <div class="flex gap-2"><input id="purge-days" type="number" min="30" value="90" class="w-24 px-3 py-2 rounded-xl border border-bacha-gingham text-sm" />
          <button onclick="purgeOldReceipts()" class="flex-1 py-2 rounded-xl bg-white border border-rose-300 text-rose-700 font-cute font-bold text-sm">Remove old receipts</button></div>
      </div>
    </section>
    <section class="md:col-span-2 bg-white rounded-2xl border border-bacha-gingham p-4 space-y-2" aria-label="Activity log">
      <div class="flex items-center justify-between"><h2 class="font-cute font-bold text-lg text-bacha-berry">📝 Activity log</h2>
        <button onclick="renderRecordsTab()" class="text-[12px] underline font-bold text-bacha-matchaDark">Refresh</button></div>
      <p class="text-[12px] text-bacha-text/80">Latest 200 actions: order changes, stock, menu, settings, cash, sign-ins.</p>
      <div tabindex="0" role="region" aria-label="Activity entries" class="max-h-96 overflow-y-auto"><ul class="divide-y divide-bacha-gingham/60">
        ${(log || []).length ? log.map(e => `<li class="py-1.5 text-sm flex flex-wrap gap-x-3"><span class="text-[12px] text-bacha-text/80 w-36 shrink-0">${esc(new Date(e.at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</span><span class="font-bold">${esc(e.action)}</span><span class="text-bacha-text/75">${esc(e.detail)}</span></li>`).join('') : '<li class="py-3 text-sm text-bacha-text/80">Nothing recorded yet.</li>'}
      </ul></div>
    </section>`;
}
