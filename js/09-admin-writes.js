/* Admin writes, payments, settings, CSV */
// ---- realtime: subscribe once (item 42) ----
function subscribeRealtime() {
  if (realtimeSub || !sbClient) return;
  realtimeSub = sbClient.channel('public:realtime-orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => initSupabaseData())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'store_settings' }, () => loadDisplayMode())
    .subscribe();
  // orders are never broadcast, so a signed-in admin checks for new ones every few seconds while looking at the hub
  setInterval(() => { try { if (adminToken && (alertsOn || (!document.hidden && !document.getElementById('admin-view').classList.contains('hidden')))) initSupabaseData(); } catch (e) {} }, 10000);
}

// ---- inline errors on receipt pickers ----
(function () {
  const bind = (id, scopeFn) => { const el = document.getElementById(id); if (!el) return;
    el.addEventListener('change', () => { const f = el.files[0]; if (!f) return; const msg = checkImageFile(f); if (msg) { el.value = ''; if (id === 'add-prod-file') newProductImageFile = null; fieldErr(el, msg); } }); };
  bind('cust-receipt-file'); bind('add-prod-file');
  document.getElementById('add-product-modal').addEventListener('input', clearFieldErrs);
})();


// ---- items 31–33: admin writes that check for errors ----
async function toggleProductActiveStatus(id) {
  const prod = products.find(p => p.id === id); if (!prod) return;
  const next = prod.is_active === false;
  if (isSupabaseConfigured && sbClient) {
    const { error } = await adm('admin_set_product_active', { p_id: id, p_active: next });
    if (error) { await dbFail(error, 'The availability change'); return; }
  }
  prod.is_active = next;
  saveState(); renderBoxBuilder(); renderCustomizeTab(); renderAdmin();
}

async function deleteProduct(id) {
  const prod = products.find(p => p.id === id); if (!prod) return;
  const confirmed = await showBachaConfirm(`Permanently delete flavor "${prod.name}" from your bakery menu?\nPast orders keep their record. Tip: use the on/off switch instead if it's only out for a while.`, "Delete Product", "🗑️");
  if (!confirmed) return;
  if (isSupabaseConfigured && sbClient) {
    const { error } = await adm('admin_delete_product', { p_id: id });
    if (error) { await dbFail(error, 'The delete'); return; }
  }
  products = products.filter(p => p.id !== id);
  saveState(); renderBoxBuilder(); renderCustomizeTab(); renderAdmin();
  await showBachaAlert(`Flavor "${prod.name}" removed from bakery menu.`, "Product Deleted", "✓");
}

async function adjustInventory(id, delta) {
  const prod = products.find(p => p.id === id); if (!prod) return;
  const r = await changeStock(id, delta, false);
  if (!r.ok) { await dbFail(r.error || { message: 'Stock was changing on another device.' }, 'The stock change'); return; }
  saveState(); renderAdmin(); renderBoxBuilder();
}

async function restockAllOvens(amount) {
  const failed = [];
  if (SB()) { const { error } = await adm('admin_restock_all', { p_amount: amount }); if (error) failed.push(error.message); else await initSupabaseData(); }
  else for (const p of products.filter(x => x.is_active !== false)) {
    const r = await changeStock(p.id, amount, false);
    if (!r.ok) failed.push(p.name);
  }
  saveState(); renderAdmin(); renderBoxBuilder();
  if (failed.length) await dbFail({ message: 'Could not restock: ' + failed.join(', ') }, 'The restock');
  else toast(`+${amount} added to every active flavor`);
}

async function resetDefaultInventory() {
  const confirmed = await showBachaConfirm(
    "Refill every flavor's stock to its own capacity (the \"Cap\" shown under each flavor)?\nNames, prices and photos are not changed.",
    "Refill Oven Stock", "🔄");
  if (!confirmed) return;
  const failed = [];
  if (SB()) { const { error } = await adm('admin_refill_all'); if (error) failed.push(error.message); else await initSupabaseData(); }
  else for (const p of products) { p.stock = Number(p.max_stock) || 30; }
  saveState(); renderAdmin(); renderBoxBuilder(); renderCustomizeTab();
  if (failed.length) await dbFail({ message: 'Could not refill: ' + failed.join(', ') }, 'The refill');
  else await showBachaAlert("Every flavor is back to its full capacity.", "Stock Refilled", "✓");
}

async function submitNewProduct() {
  clearFieldErrs();
  const nameEl = document.getElementById('add-prod-name'), priceEl = document.getElementById('add-prod-price'), maxEl = document.getElementById('add-prod-max');
  const descEl = document.getElementById('add-prod-desc'), fileEl = document.getElementById('add-prod-file');
  const name = nameEl.value.trim().toUpperCase();
  const price = parseFloat(priceEl.value), maxStock = parseInt(maxEl.value, 10);
  const promo = document.getElementById('add-prod-promo').value.trim(), desc = descEl.value.trim();
  const submitBtn = document.getElementById('add-prod-submit-btn');

  if (!name) { fieldErr(nameEl, "Please enter the item name."); return; }
  if (products.some(p => String(p.name).toUpperCase() === name)) { fieldErr(nameEl, "An item with this name already exists. Please use a different name."); return; }
  if (!(price > 0)) { fieldErr(priceEl, "Please enter a price above ₱0."); return; }
  if (!(maxStock > 0)) { fieldErr(maxEl, "Please enter how many you can prepare (1 or more)."); return; }
  if (!newProductImageFile) { fieldErr(fileEl, "Please choose a photo for this item."); return; }
  const imgMsg = checkImageFile(newProductImageFile); if (imgMsg) { fieldErr(fileEl, imgMsg); return; }
  if (!desc) { fieldErr(descEl, "Please add a short description."); return; }

  submitBtn.disabled = true; submitBtn.innerText = "Uploading & Saving...";
  const resetBtn = () => { submitBtn.disabled = false; submitBtn.innerText = "+ Add Item to Menu"; };
  const imageUrl = await uploadImage(newProductImageFile, 'product');
  if (!imageUrl) { resetBtn(); await showBachaAlert("The photo could not be uploaded, so the item was not added. Please try again.", "Upload Failed", "⚠️"); return; }

  let nextId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
  const newProduct = { id: nextId, name, price, stock: maxStock, max_stock: maxStock, promo_tag: promo, desc, description: desc, image: imageUrl, is_active: true, category: document.getElementById('add-prod-cat').value || 'Cookies' };
  if (isSupabaseConfigured && sbClient) {
    const { data: saved, error } = await adm('admin_save_product', { p: { name: newProduct.name, price: newProduct.price, max_stock: newProduct.max_stock, stock: newProduct.stock, promo_tag: newProduct.promo_tag, description: newProduct.desc, image: newProduct.image, is_active: true, category: newProduct.category } });
    if (error) { resetBtn(); await removeUpload(imageUrl); await dbFail(error, 'The new item'); return; }
    if (saved && saved.id) newProduct.id = saved.id;
  }
  products.push(newProduct);
  resetBtn(); saveState(); toggleAddProductModal(false);
  renderBoxBuilder(); renderCustomizeTab(); renderAdmin();
  await showBachaAlert(`New item "${newProduct.name}" added to the menu!`, "Product Added", "🎉");
}

// ---- payments: verify / reject / purge ----
async function verifyAndAcceptPayment(orderId) {
  const o = orders.find(x => x.id === orderId); if (!o) return;
  const confirmed = await showBachaConfirm(
    o.payment_method === 'COD' ? `Confirm order ${orderId}? The customer will pay cash on delivery.` : `Confirm that you have received and verified this GCash transaction for ${orderId} in your merchant app?`,
    "Verify GCash Payment", "✓");
  if (!confirmed) return;
  if (!await transition(orderId, ST.QUEUED, [ST.PENDING, COD_STATUS])) return;
  await refreshAll();
  await showBachaAlert(`Order ${orderId} is now verified and queued for oven baking!`, "Payment Confirmed", "✨");
}

async function rejectFakeOrder(orderId) {
  const o = orders.find(x => x.id === orderId); if (!o) return;
  const confirmed = await showBachaConfirm(`Reject order ${orderId}?\nThis will mark payment as rejected and return the reserved flavors to stock.`, "Reject Fake Payment", "⚠️");
  if (!confirmed) return;
  if (!await transition(orderId, ST.REJECTED, [ST.PENDING, COD_STATUS])) return;
  await restoreOrderStock(o);
  await refreshAll();
  await showBachaAlert(`Order ${orderId} rejected. Flavors have been returned to stock.`, "Order Cancelled", "🌸");
}

async function purgeCancelledOrder(orderId) {
  const confirmed = await showBachaConfirm(`Permanently delete transaction record ${orderId} from your database? This action cannot be undone.`, "Purge Transaction", "🗑️");
  if (!confirmed) return;
  if (isSupabaseConfigured && sbClient) {
    const { error } = await adm('admin_delete_order', { p_id: orderId });
    if (error) { await dbFail(error, 'The delete'); return; }
  }
  orders = orders.filter(o => o.id !== orderId);
  saveState(); renderAdmin();
  await showBachaAlert(`Transaction ${orderId} has been purged from records.`, "Record Deleted", "✓");
}

// ---- settings ----
async function saveAppConfig() {
  const n = (id, d) => { const v = parseInt(document.getElementById(id).value); return isNaN(v) || v < 0 ? d : v; };
  appConfig = {
    maxBoxes: n('cfg-max-boxes', 3), maxDrinks: n('cfg-max-drinks', 5), dailyDrinks: n('cfg-daily-drinks', 0),
    lowStock: Math.max(1, n('cfg-low-stock', 5)), igHandle: document.getElementById('cfg-ig').value.trim(),
    deliveryArea: document.getElementById('cfg-delivery-area').value.trim(), freeDeliveryMin: n('cfg-free-min', 0)
  };
  localStorage.setItem('bacha_app_config', JSON.stringify(appConfig));
  let failed = null;
  if (isSupabaseConfigured && sbClient) {
    const { error } = await adm('admin_set_setting', { p_key: 'app_config', p_value: JSON.stringify(appConfig) });
    if (error) { failed = error.message; console.error('app_config save failed:', error); }
  }
  applyAppConfig();
  await showBachaAlert(failed ? `Saved on this device only. It could not be saved for customers:\n${failed}` : "Order limits and settings saved.", failed ? "Not Saved" : "Settings Saved", failed ? "⚠️" : "✨");
}

async function setDisplayMode(mode) {
  displayMode = mode;
  localStorage.setItem('bacha_display_mode', mode);
  applyDisplayMode();
  let failed = null;
  if (isSupabaseConfigured && sbClient) {
    const { error } = await adm('admin_set_setting', { p_key: 'display_mode', p_value: mode });
    if (error) { failed = error.message; console.error('display_mode save failed:', error); }
  }
  const label = { box: 'Box of 6 Only', singles: 'Single / Ala-Carte & Drinks Only', both: 'Full Menu (Both)' }[mode];
  await showBachaAlert(failed ? `Changed on this device only. It could not be saved for customers:\n${failed}` : `Storefront now shows: ${label}`, failed ? "Not Saved" : "Display Mode Updated", failed ? "⚠️" : "🏪");
}

async function handlePinReset() {
  const currentPin = document.getElementById('current-pin-input').value.trim();
  const newPin = document.getElementById('new-pin-input').value.trim();
  const confirmPin = document.getElementById('confirm-pin-input').value.trim();
  const statusEl = document.getElementById('pin-change-status');
  statusEl.classList.remove('hidden', 'text-emerald-700', 'text-rose-700');
  const fail = msg => { statusEl.innerText = msg; statusEl.classList.add('text-rose-700'); };
  const ok = async msg => { statusEl.innerText = '✓ ' + msg; statusEl.classList.add('text-emerald-700'); ['current-pin-input', 'new-pin-input', 'confirm-pin-input'].forEach(i => { document.getElementById(i).value = ''; }); await showBachaAlert(msg, "Security Updated", "🔑"); };

  if (!currentPin || !newPin || newPin !== confirmPin || newPin.length < 6) { fail("Please check the PINs: the new PIN needs 6 or more characters and both entries must match."); return; }
  if (isSupabaseConfigured && sbClient) {
    const { data, error } = await adm('admin_change_pin', { current_pin: currentPin, new_pin: newPin });
    if (error) { fail(error.message || "Could not reach the database. Your PIN was not changed. Please try again."); return; }
    if (data && data.ok) await ok("Admin PIN updated successfully! Other devices were signed out.");
    else fail({ wrong_pin: "Current PIN is incorrect.", too_weak: "That PIN is too easy to guess. Please pick another.", too_short: "The new PIN needs 6 or more characters.", locked: "Too many wrong tries. Please wait 15 minutes." }[data && data.error] || "The PIN was not changed.");
  } else {
    if (currentPin !== (localStorage.getItem('bacha_admin_pin') || '1234')) { fail("Current PIN is incorrect."); return; }
    localStorage.setItem('bacha_admin_pin', newPin);
    await ok("PIN updated on this device. (The online database is not connected, so it applies here only.)");
  }
}

// ---- CSV export: sales only by default, safe for Excel ----
async function exportOrdersCSV() {
  const from = document.getElementById('export-from').value, to = document.getElementById('export-to').value;
  await ensureOrdersCover(from);   // pull older history if the date range reaches back past what is loaded
  const all = document.getElementById('export-all').checked;
  const rows = orders.filter(o => {
    const k = dayKey(o.created_at ? new Date(o.created_at) : new Date());
    if (!((!from || k >= from) && (!to || k <= to))) return false;
    return all || ['queued', 'ready', 'done'].includes(orderKind(o));
  });
  if (!rows.length) { showBachaAlert(all ? "No orders found for that date range." : "No confirmed sales found for that date range.\nTick \"Include pending & cancelled\" to export everything.", "Nothing to Export", "📄"); return; }
  saveTextFile(`bacha-${all ? 'orders' : 'sales'}-${dayKey(new Date())}.csv`, ordersToCSV(rows), 'text/csv;charset=utf-8;');
}
function saveTextFile(name, content, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function ordersToCSV(rows) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const text = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return q(s); };   // stop spreadsheet formulas
  const head = ['Order ID', 'Date', 'Type', 'Batch', 'Customer', 'Contact', 'Fulfillment', 'Payment', 'Items', 'Total (PHP)', 'Status'];
  const body = rows.map(o => {
    const items = [...(o.boxes || []).map(b => `Box of 6 [${(b.items || []).join(', ')}]`), ...(o.items || []).map(i => `${i.qty}x ${i.name}`)].join(' | ');
    return [text(o.id), text(o.created_at ? new Date(o.created_at).toLocaleString('en-PH') : ''), text(o.order_type === 'pos' ? 'POS' : 'Online'), text(o.batch_date), text(o.customer_name), text(o.contact_number),
      text(o.order_type === 'pos' ? 'In-store' : (o.fulfillment || 'pickup')), text(o.payment_method), text(items), q(Number(o.total_amount) || 0), text(o.status)].join(',');
  });
  return '﻿' + [head.map(q).join(','), ...body].join('\r\n');
}

