/* Site options (Part 8): item categories, payment on/off, delivery distance limit, social links */
const SOCIAL_PLATFORMS = [
  ['Instagram', '📸'], ['Facebook', '👍'], ['TikTok', '🎵'], ['Messenger', '💬'], ['X (Twitter)', '🐦'], ['YouTube', '▶️'], ['Website', '🌐'], ['Other', '🔗']
];
function socialIcon(name) { const f = SOCIAL_PLATFORMS.find(p => p[0].toLowerCase() === String(name).toLowerCase()); return f ? f[1] : '🔗'; }
let deliveryCheck = { lat: null, lng: null, km: null, tooFar: false };
let draftSocials = null;

// ---- saving ----
async function saveSiteOptions(next) {
  const prev = siteOpts;
  const clean = normSiteOpts(next);
  siteOpts = clean; applySiteCategories();
  try { localStorage.setItem('bacha_site_opts', JSON.stringify(siteOpts)); } catch (e) {}
  if (isSupabaseConfigured && sbClient) {
    const { error } = await adm('admin_set_setting', { p_key: 'site_options', p_value: JSON.stringify(siteOpts) });
    if (error) {
      siteOpts = prev; applySiteCategories();
      try { localStorage.setItem('bacha_site_opts', JSON.stringify(siteOpts)); } catch (e) {}
      applySiteUI();
      await dbFail(error, 'The shop options');
      return false;
    }
  }
  applySiteUI();
  return true;
}
const cloneOpts = () => JSON.parse(JSON.stringify(siteOpts));

// ---- refresh everything that depends on the options ----
function applySiteUI() {
  const sel = document.getElementById('add-prod-cat');
  if (sel) { const keep = sel.value; sel.innerHTML = catOptionsHTML(CATEGORIES.includes(keep) ? keep : 'Cookies'); }
  renderCategoryManager(); renderSiteCard(); renderClosedSocials();
  if (typeof updateCheckoutUI === 'function') { updateCheckoutUI(); renderDeliveryRules(); }
  if (typeof renderSingleMenu === 'function') { renderSingleMenu(); }
  if (typeof renderCustomizeTab === 'function' && document.getElementById('customization-cards-grid')?.children.length) { try { renderCustomizeTab(); } catch (e) {} }
}

// ---- admin: categories ----
const CAT_EMOJIS = ['🍞','🥐','🥖','🥨','🥯','🧁','🍰','🎂','🥧','🍩','🍪','🍫','🍬','🍮','🍯','🥞','🧇','🍕','🥪','🌮','🍔','🍟','🍝','🍜','🍱','🍣','🥗','🍓','🍒','🍋','🥭','🍍','🫐','🍉','🥤','🧋','☕','🍵','🍹','🥛','🍦','🍨','🍧','🧀','🥚','🥓','🎁','⭐'];
let catPickIcon = '';
function pickCatEmoji(btn) {
  catPickIcon = btn.dataset.e;
  const inp = document.getElementById('new-cat-icon'); if (inp) inp.value = catPickIcon;
  document.querySelectorAll('#cat-emoji-grid .emoji-pick').forEach(b => { const on = b === btn; b.classList.toggle('is-picked', on); b.setAttribute('aria-pressed', on); });
}
function typeCatEmoji(inp) {
  catPickIcon = inp.value.trim();
  document.querySelectorAll('#cat-emoji-grid .emoji-pick').forEach(b => { const on = b.dataset.e === catPickIcon; b.classList.toggle('is-picked', on); b.setAttribute('aria-pressed', on); });
}
function renderCategoryManager() {
  const box = document.getElementById('category-manager'); if (!box) return;
  const count = n => products.filter(p => catOf(p) === n).length;
  box.innerHTML = `
    <div><span class="text-[12px] font-bold text-bacha-text/75 uppercase">Item categories</span>
    <p class="text-[12px] text-bacha-text/75">Cookies (sold in boxes of 6) and Drinks are built in. Add your own, like Bread or Cakes.</p></div>
    <ul class="flex flex-wrap gap-1.5" aria-label="Item categories">${siteOpts.categories.map(c => {
      const n = count(c.name), locked = c.name === 'Cookies' || c.name === 'Drinks';
      return `<li class="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-white border border-bacha-gingham text-[13px] font-cute font-bold text-bacha-text">
        <span aria-hidden="true">${esc(c.icon || '🍽️')}</span> ${esc(c.name)} <span class="text-[12px] font-normal text-bacha-text/70">(${n})</span>
        ${locked ? '' : `<button type="button" data-name="${esc(c.name)}" onclick="deleteCategory(this.dataset.name)" aria-label="Remove category ${esc(c.name)}" class="w-6 h-6 rounded-full text-rose-700 hover:bg-rose-50 font-bold">×</button>`}</li>`;
    }).join('')}</ul>
    <div><span id="cat-emoji-label" class="block text-[12px] font-bold text-bacha-text/75 mb-1">Pick an emoji for the new category</span>
      <div id="cat-emoji-grid" role="group" aria-labelledby="cat-emoji-label" class="emoji-grid">${CAT_EMOJIS.map(e => `<button type="button" data-e="${e}" onclick="pickCatEmoji(this)" aria-pressed="${e === catPickIcon}" aria-label="Emoji ${e}" class="emoji-pick no-tap${e === catPickIcon ? ' is-picked' : ''}">${e}</button>`).join('')}</div></div>
    <div class="flex flex-wrap items-end gap-2">
      <div><label for="new-cat-icon" class="block text-[12px] font-bold text-bacha-text/75 mb-0.5">Emoji</label>
        <input id="new-cat-icon" maxlength="8" value="${esc(catPickIcon)}" oninput="typeCatEmoji(this)" placeholder="🍞" class="w-16 px-2 py-1.5 rounded-xl border border-bacha-gingham text-center text-sm" /></div>
      <div class="flex-1 min-w-[140px]"><label for="new-cat-name" class="block text-[12px] font-bold text-bacha-text/75 mb-0.5">New category name</label>
        <input id="new-cat-name" maxlength="24" placeholder="e.g. Bread" class="w-full px-3 py-1.5 rounded-xl border border-bacha-gingham text-sm" /></div>
      <button type="button" onclick="addCategory()" class="px-3.5 py-2 rounded-xl bg-bacha-matcha hover:bg-bacha-matchaDark text-white font-cute font-bold text-[13px]">+ Add category</button>
    </div>`;
}
async function addCategory() {
  const name = document.getElementById('new-cat-name').value.trim().replace(/\s+/g, ' ');
  const icon = document.getElementById('new-cat-icon').value.trim() || '🍽️';
  if (!name || /[<>"]/.test(name)) { await showBachaAlert('Type a category name (no < > or quote marks).', 'Category Name', '⚠️'); return; }
  if (siteOpts.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) { await showBachaAlert(`"${name}" already exists.`, 'Category Exists', '⚠️'); return; }
  if (siteOpts.categories.length >= 15) { await showBachaAlert('You can have up to 15 categories.', 'Too Many', '⚠️'); return; }
  const o = cloneOpts(); o.categories.push({ name, icon });
  catPickIcon = '';
  await saveSiteOptions(o);
}
async function deleteCategory(name) {
  const n = products.filter(p => catOf(p) === name).length;
  if (n) { await showBachaAlert(`${n} item${n > 1 ? 's are' : ' is'} still in "${name}". Move ${n > 1 ? 'them' : 'it'} to another category in the item cards below first.`, 'Category In Use', '⚠️'); return; }
  if (!(await showBachaConfirm(`Remove the category "${name}"?`, 'Remove Category', '🗑️'))) return;
  const o = cloneOpts(); o.categories = o.categories.filter(c => c.name !== name);
  await saveSiteOptions(o);
}

// ---- admin: payments, delivery, social links (Store control tab) ----
function renderSiteCard() {
  const box = document.getElementById('site-options-card'); if (!box) return;
  if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return; // don't wipe what is being typed
  if (!draftSocials) draftSocials = siteOpts.socials.map(l => ({ ...l }));
  const d = siteOpts.delivery, pay = siteOpts.payments;
  const tog = (id, on, label, fn) => `<button type="button" id="${id}" onclick="${fn}" aria-pressed="${on}" class="${toggleBtnClass(on)} flex-1">${on ? '✓ ' : ''}${label}: ${on ? 'On' : 'Off'}</button>`;
  box.innerHTML = `
    <div class="flex items-center gap-3 border-b border-bacha-gingham pb-3">
      <div class="w-10 h-10 rounded-full bg-bacha-pinkLight border border-bacha-gingham flex items-center justify-center text-xl" aria-hidden="true">⚙️</div>
      <div><h2 class="font-cute font-bold text-lg sm:text-xl text-bacha-berry leading-none">Payments, delivery &amp; socials</h2>
      <p class="text-[12px] sm:text-sm text-bacha-text/75 mt-0.5">What customers can choose at checkout, and the links they see.</p></div>
    </div>
    <div class="grid md:grid-cols-2 gap-5 items-start">
    <div class="space-y-4">
      <div class="p-3.5 rounded-2xl bg-bacha-matchaLight/50 border border-bacha-gingham space-y-2">
        <span class="text-[12px] font-bold text-bacha-text/75 uppercase">Payment options</span>
        <div class="flex gap-2">${tog('pay-opt-gcash', pay.gcash, '📱 GCash', "togglePayOption('gcash')")}${tog('pay-opt-cod', pay.cod, '💵 Cash (COD)', "togglePayOption('cod')")}</div>
        <p class="text-[12px] text-bacha-text/75">Turn one off and customers no longer see it. At least one stays on. With GCash off, pick-up customers pay cash when they collect.</p>
      </div>
      <div class="p-3.5 rounded-2xl bg-bacha-matchaLight/50 border border-bacha-gingham space-y-2">
        <span class="text-[12px] font-bold text-bacha-text/75 uppercase">Delivery distance</span>
        <label class="flex items-center gap-2 text-[13px] font-bold text-bacha-text cursor-pointer"><input type="checkbox" id="dl-enabled" ${d.limitEnabled ? 'checked' : ''} onchange="syncDeliveryForm()" class="w-5 h-5 accent-[#4F6E48]" /> Only deliver within a set distance</label>
        <div id="dl-fields" class="${d.limitEnabled ? '' : 'hidden'} space-y-2">
          <div><label for="dl-km" class="block text-[12px] font-bold text-bacha-text/75 mb-0.5">Delivery available up to (km)</label>
            <input id="dl-km" type="number" min="0.5" max="200" step="0.5" value="${esc(d.maxKm ?? 5)}" oninput="updateDeliveryPreview(false)" class="w-28 px-3 py-1.5 rounded-xl border border-bacha-gingham text-sm" /></div>
          <div class="grid grid-cols-2 gap-2">
            <div><label for="dl-lat" class="block text-[12px] font-bold text-bacha-text/75 mb-0.5">Shop latitude</label><input id="dl-lat" inputmode="decimal" value="${esc(d.shopLat ?? '')}" oninput="updateDeliveryPreview(false)" placeholder="14.5995" class="w-full px-3 py-1.5 rounded-xl border border-bacha-gingham text-sm" /></div>
            <div><label for="dl-lng" class="block text-[12px] font-bold text-bacha-text/75 mb-0.5">Shop longitude</label><input id="dl-lng" inputmode="decimal" value="${esc(d.shopLng ?? '')}" oninput="updateDeliveryPreview(false)" placeholder="120.9842" class="w-full px-3 py-1.5 rounded-xl border border-bacha-gingham text-sm" /></div>
          </div>
          <button type="button" onclick="useShopLocation()" class="px-3 py-1.5 rounded-xl border border-bacha-matcha text-bacha-matchaDark font-cute font-bold text-[13px] bg-white">📍 Use my current location as the shop</button>
          <div id="dl-map" class="bmap"></div>
          <p class="text-[12px] text-bacha-text/75">Tap the map to move the shop pin. The dashed circle is the area you deliver to.</p>
          <p class="text-[12px] text-bacha-text/75">Customers share their location at checkout. If they are farther than this in a straight line, only pick-up is offered.</p>
        </div>
        <button type="button" onclick="saveDeliveryOptions()" class="w-full py-2 rounded-xl bg-bacha-matcha hover:bg-bacha-matchaDark text-white font-cute font-bold text-[13px]">Save delivery settings</button>
      </div>
    </div>
    <div class="p-3.5 rounded-2xl bg-bacha-matchaLight/50 border border-bacha-gingham space-y-2">
      <span class="text-[12px] font-bold text-bacha-text/75 uppercase">Social media links</span>
      <p class="text-[12px] text-bacha-text/75">Shown on the closed-shop screen and the landing page.</p>
      <div class="space-y-2" id="social-rows">${draftSocials.map((l, i) => `
        <div class="flex flex-wrap items-center gap-1.5">
          <select aria-label="Platform ${i + 1}" onchange="draftSocials[${i}].platform=this.value" class="px-2 py-1.5 rounded-xl border border-bacha-gingham text-[13px] bg-white font-bold">${SOCIAL_PLATFORMS.map(p => `<option ${p[0] === l.platform ? 'selected' : ''}>${esc(p[0])}</option>`).join('')}</select>
          <input aria-label="Link ${i + 1}" value="${esc(l.url)}" oninput="draftSocials[${i}].url=this.value" placeholder="https://instagram.com/yourshop" class="flex-1 min-w-[160px] px-3 py-1.5 rounded-xl border border-bacha-gingham text-[13px]" />
          <button type="button" onclick="draftSocials.splice(${i},1);renderSiteCard()" aria-label="Remove link ${i + 1}" class="w-8 h-8 rounded-full text-rose-700 hover:bg-rose-50 font-bold">×</button>
        </div>`).join('') || '<p class="text-[13px] text-bacha-text/75 font-cute">No links yet. Add your first one.</p>'}</div>
      <div class="flex gap-2">
        <button type="button" onclick="draftSocials.push({platform:'Instagram',url:''});renderSiteCard()" class="px-3 py-1.5 rounded-xl border border-bacha-matcha text-bacha-matchaDark font-cute font-bold text-[13px] bg-white">+ Add link</button>
        <button type="button" onclick="saveSocials()" class="flex-1 py-1.5 rounded-xl bg-bacha-matcha hover:bg-bacha-matchaDark text-white font-cute font-bold text-[13px]">Save links</button>
      </div>
    </div></div>`;
  if (typeof initDeliveryPreview === 'function') initDeliveryPreview();
}
async function togglePayOption(which) {
  const o = cloneOpts(); o.payments[which] = !o.payments[which];
  if (!o.payments.gcash && !o.payments.cod) { await showBachaAlert('Keep at least one payment option on, or customers cannot check out.', 'One Must Stay On', '⚠️'); return; }
  await saveSiteOptions(o);
}
function syncDeliveryForm() { const on = document.getElementById('dl-enabled').checked; document.getElementById('dl-fields').classList.toggle('hidden', !on); if (typeof updateDeliveryPreview === 'function') setTimeout(() => updateDeliveryPreview(true), 30); }
function useShopLocation() {
  if (!navigator.geolocation) { showBachaAlert('This device cannot share its location. Type the latitude and longitude instead.', 'No Location', '📍'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    document.getElementById('dl-lat').value = pos.coords.latitude.toFixed(6); document.getElementById('dl-lng').value = pos.coords.longitude.toFixed(6); updateDeliveryPreview(true);
  }, () => showBachaAlert('Location was blocked. Allow location for this page, or type the latitude and longitude.', 'Location Blocked', '📍'), { enableHighAccuracy: true, timeout: 10000 });
}
async function saveDeliveryOptions() {
  const on = document.getElementById('dl-enabled').checked;
  const o = cloneOpts();
  if (on) {
    const km = parseFloat(document.getElementById('dl-km').value), lat = parseFloat(document.getElementById('dl-lat').value), lng = parseFloat(document.getElementById('dl-lng').value);
    if (!(km >= 0.5 && km <= 200)) { await showBachaAlert('Enter a delivery distance from 0.5 to 200 km.', 'Distance', '⚠️'); return; }
    if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) { await showBachaAlert('Enter the shop latitude and longitude, or tap "Use my current location".', 'Shop Location', '⚠️'); return; }
    o.delivery = { limitEnabled: true, maxKm: km, shopLat: lat, shopLng: lng };
  } else o.delivery = { limitEnabled: false };
  if (await saveSiteOptions(o)) await showBachaAlert(on ? `Delivery is limited to ${o.delivery.maxKm} km.` : 'Delivery has no distance limit.', 'Delivery Saved', '✓');
}
async function saveSocials() {
  const rows = (draftSocials || []).map(l => ({ platform: l.platform, url: String(l.url || '').trim() })).filter(l => l.url);
  const bad = rows.find(l => !/^https?:\/\/[^\s<>"]{3,250}$/i.test(l.url));
  if (bad) { await showBachaAlert(`"${bad.url}" is not a full link. It must start with https://`, 'Check The Link', '⚠️'); return; }
  const o = cloneOpts(); o.socials = rows;
  draftSocials = null;
  if (await saveSiteOptions(o)) await showBachaAlert('Social links saved.', 'Links Saved', '✓'); else draftSocials = null;
}

// ---- customer: social links on the closed screen ----
function socialChipsHTML() {
  return siteOpts.socials.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-bacha-strawberry/40 font-cute font-bold text-[13px] text-bacha-berry hover:bg-bacha-pinkLight"><span aria-hidden="true">${socialIcon(l.platform)}</span>${esc(l.platform)}</a>`).join('');
}
function renderClosedSocials() { const el = document.getElementById('closed-socials'); if (el) el.innerHTML = socialChipsHTML(); }

// ---- customer: delivery distance check ----
function haversineKm(a, b, c, d) {
  const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function deliveryLimitOn() { const d = siteOpts.delivery; return !!(d.limitEnabled && d.shopLat != null && d.shopLng != null); }
function checkDeliveryLocation() {
  const note = document.getElementById('delivery-km-note'), btn = document.getElementById('delivery-loc-btn');
  const show = (msg, kind) => { if (!note) return; note.textContent = msg; note.classList.remove('hidden', 'bg-emerald-50', 'text-emerald-800', 'border-emerald-200', 'bg-rose-50', 'text-rose-800', 'border-rose-200'); note.classList.add(...(kind === 'ok' ? ['bg-emerald-50', 'text-emerald-800', 'border-emerald-200'] : ['bg-rose-50', 'text-rose-800', 'border-rose-200'])); };
  if (!navigator.geolocation) { show('This phone cannot share its location, so delivery cannot be checked. Please choose pick-up.', 'bad'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Checking your location...'; }
  navigator.geolocation.getCurrentPosition(pos => {
    if (btn) { btn.disabled = false; btn.textContent = '📍 Check my location again'; }
    const d = siteOpts.delivery, lat = pos.coords.latitude, lng = pos.coords.longitude;
    const km = haversineKm(Number(d.shopLat), Number(d.shopLng), lat, lng);
    deliveryCheck = { lat, lng, km, tooFar: km > Number(d.maxKm) };
    const maps = document.getElementById('cust-maps');
    if (maps && !deliveryCheck.tooFar && !maps.value.trim()) maps.value = `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
    if (deliveryCheck.tooFar) { show(`You are about ${km.toFixed(1)} km away. We deliver up to ${d.maxKm} km.`, 'bad'); setFulfillment('pickup'); }
    else { show(`You are about ${km.toFixed(1)} km away. Delivery is available.`, 'ok'); updateCheckoutUI(); }
  }, () => {
    if (btn) { btn.disabled = false; btn.textContent = '📍 Use my location to check delivery'; }
    show('Location was blocked. Allow location for this page so we can check that we deliver to you, or choose pick-up.', 'bad');
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
}
