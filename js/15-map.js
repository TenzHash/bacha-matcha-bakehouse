/* Real map pin: customers drop a pin on an OpenStreetMap map at checkout; staff see the same pin on the order.
   The pin is saved as a normal Google Maps link (https://www.google.com/maps?q=LAT,LNG) in the existing maps_link field,
   so the database, old orders and "Open in Google Maps" all keep working. Leaflet is bundled in vendor/leaflet/. */

const PIN_CENTER = [13.1391, 123.7438];                 // Legazpi City: where the map opens until a pin is set
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
let pinMap = null, pinMarker = null, orderMap = null, orderMarker = null, lastAutoAddr = '', pinSearchSeq = 0;

function mapsUrl(lat, lng) { return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`; }
function dirUrl(lat, lng) { return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`; }
function parseMapsLink(u) {
  const m = /[?&](?:q|query|ll|destination|center)=(-?\d{1,3}(?:\.\d+)?)(?:,|%2C)(-?\d{1,3}(?:\.\d+)?)/i.exec(u || '') || /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/.exec(u || '') || /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(u || '');
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  return (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) ? { lat, lng } : null;
}
function pinIcon() {
  return L.divIcon({
    className: 'pin-icon', iconSize: [36, 46], iconAnchor: [18, 44],
    html: '<svg viewBox="0 0 36 46" width="36" height="46" aria-hidden="true"><path d="M18 2C9.7 2 3 8.6 3 16.8 3 27.6 18 44 18 44s15-16.4 15-27.2C33 8.6 26.3 2 18 2z" fill="#C2365A" stroke="#fff" stroke-width="2.5"/><circle cx="18" cy="17" r="6" fill="#fff"/></svg>'
  });
}
function newMap(el, center, zoom) {
  const m = L.map(el, { center, zoom, zoomControl: true, attributionControl: true });
  L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTR }).addTo(m);
  if (window.ResizeObserver) new ResizeObserver(() => m.invalidateSize()).observe(el);
  return m;
}
function pinStatus(msg, bad) { const el = document.getElementById('pin-status'); if (el) { el.textContent = msg; el.classList.toggle('is-bad', !!bad); } }

/* ---------- customer: drop a pin ---------- */
function initPinMap() {
  const picker = document.getElementById('pin-picker'), fb = document.getElementById('pin-fallback');
  if (!picker) return;
  if (!window.L) { picker.classList.add('hidden'); fb && fb.classList.remove('hidden'); return; }   // library missing: old paste-a-link box
  if (pinMap) { pinMap.invalidateSize(); return; }
  pinMap = newMap(document.getElementById('pin-map'), PIN_CENTER, 14);
  pinMap.on('click', e => setPin(e.latlng, { reverse: true }));
  document.getElementById('pin-locate').addEventListener('click', locateMe);
  document.getElementById('pin-search-btn').addEventListener('click', pinSearch);
  document.getElementById('pin-search').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); pinSearch(); } });
  setTimeout(() => pinMap && pinMap.invalidateSize(), 350);
}
function setPin(ll, o) {
  o = o || {};
  const lat = Number(ll.lat), lng = Number(ll.lng);
  if (!isFinite(lat) || !isFinite(lng)) return;
  if (!pinMarker) {
    pinMarker = L.marker([lat, lng], { icon: pinIcon(), draggable: true, keyboard: true, title: 'Your delivery pin. Drag to adjust.' }).addTo(pinMap);
    pinMarker.on('dragend', () => setPin(pinMarker.getLatLng(), { reverse: true }));
  } else pinMarker.setLatLng([lat, lng]);
  if (o.fly) pinMap.setView([lat, lng], Math.max(pinMap.getZoom(), 17));
  const link = mapsUrl(lat, lng);
  document.getElementById('pin-link').value = link; document.getElementById('cust-maps').value = link;
  document.getElementById('pin-map').classList.remove('border-rose-500', 'ring-2', 'ring-rose-200');
  const err = document.getElementById('err-pin-map'); if (err) err.remove();
  pinStatus('Pin dropped. Drag it or tap the map to move it.');
  if (o.reverse) reverseFill(lat, lng);
}
async function reverseFill(lat, lng) {
  const box = document.getElementById('cust-address');
  if (!box || (box.value.trim() && box.value !== lastAutoAddr)) return;                  // never overwrite what the customer typed
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=en&lat=${lat}&lon=${lng}`);
    if (!r.ok) return;
    const d = await r.json();
    if (d && d.display_name && (!box.value.trim() || box.value === lastAutoAddr)) { lastAutoAddr = d.display_name.split(', ').slice(0, 5).join(', '); box.value = lastAutoAddr; }
  } catch (e) { /* offline: the customer can type the address */ }
}
function locateMe() {
  if (!navigator.geolocation) { pinStatus('Your browser cannot share its location. Tap the map instead.', true); return; }
  pinStatus('Finding you…');
  navigator.geolocation.getCurrentPosition(
    p => setPin({ lat: p.coords.latitude, lng: p.coords.longitude }, { fly: true, reverse: true }),
    () => pinStatus('Could not get your location. Allow location access, or tap the map instead.', true),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
}
async function pinSearch() {
  const q = document.getElementById('pin-search').value.trim(), list = document.getElementById('pin-results');
  if (q.length < 3) { pinStatus('Type at least 3 letters to search.', true); return; }
  const seq = ++pinSearchSeq; pinStatus('Searching…'); list.classList.add('hidden'); list.innerHTML = '';
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ph&accept-language=en&q=${encodeURIComponent(q)}`);
    const d = await r.json();
    if (seq !== pinSearchSeq) return;
    if (!Array.isArray(d) || !d.length) { pinStatus('No match. Try a nearby landmark, or tap the map.', true); return; }
    list.innerHTML = d.map((x, i) => `<li><button type="button" data-i="${i}">${esc(String(x.display_name || '').split(', ').slice(0, 4).join(', '))}</button></li>`).join('');
    list.classList.remove('hidden'); pinStatus('Choose a result, then drag the pin to fine-tune.');
    list.onclick = e => {
      const b = e.target.closest('button[data-i]'); if (!b) return;
      const x = d[Number(b.dataset.i)]; list.classList.add('hidden');
      setPin({ lat: parseFloat(x.lat), lng: parseFloat(x.lon) }, { fly: true, reverse: true });
    };
  } catch (e) { if (seq === pinSearchSeq) pinStatus('Search needs an internet connection. Tap the map instead.', true); }
}
function resetPin() {
  if (pinMarker && pinMap) { pinMap.removeLayer(pinMarker); pinMarker = null; }
  ['pin-link', 'cust-maps', 'pin-search'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const l = document.getElementById('pin-results'); if (l) { l.innerHTML = ''; l.classList.add('hidden'); }
  lastAutoAddr = '';
  if (pinMap) pinMap.setView(PIN_CENTER, 14);
  pinStatus('Tap the map to drop a pin on your exact spot. You can drag it to adjust.');
}
/* the map can only be measured once the delivery section is visible */
const _updateCheckoutUIBase = updateCheckoutUI;
updateCheckoutUI = function () { _updateCheckoutUIBase(); if (fulfillment === 'delivery') setTimeout(initPinMap, 30); };
const _toggleCartDrawerBase = toggleCartDrawer;
toggleCartDrawer = function (open) { _toggleCartDrawerBase(open); if (open && pinMap) setTimeout(() => pinMap.invalidateSize(), 350); };

/* ---------- admin: see the customer's pin ---------- */
function viewOrderMap(id) {
  const o = orders.find(x => x.id === id), pt = o && parseMapsLink(o.maps_link);
  if (!pt) return;
  if (!window.L) { window.open(o.maps_link, '_blank', 'noopener'); return; }
  document.getElementById('map-modal-title').textContent = `Delivery for ${o.customer_name || id}`;
  document.getElementById('map-modal-addr').textContent = o.delivery_address || '';
  document.getElementById('map-open-link').href = mapsUrl(pt.lat, pt.lng);
  document.getElementById('map-dir-link').href = dirUrl(pt.lat, pt.lng);
  toggleMapModal(true);
  const el = document.getElementById('order-map');
  if (!orderMap) orderMap = newMap(el, [pt.lat, pt.lng], 17);
  if (orderMarker) orderMap.removeLayer(orderMarker);
  orderMarker = L.marker([pt.lat, pt.lng], { icon: pinIcon(), interactive: false, keyboard: false }).addTo(orderMap);
  orderMap.setView([pt.lat, pt.lng], 17);
  setTimeout(() => { orderMap.invalidateSize(); orderMap.setView([pt.lat, pt.lng], 17); }, 320);
  if (window.lucide) lucide.createIcons();
}
function toggleMapModal(open) {
  const m = document.getElementById('map-modal');
  m.classList.toggle('opacity-0', !open); m.classList.toggle('pointer-events-none', !open);
  m.classList.toggle('opacity-100', open); m.classList.toggle('pointer-events-auto', open);
}


/* ---------- admin: map of all delivery orders (Orders tab) ---------- */
let dMap = null, dLayer = null, dMarkers = {}, dSig = '', geoBusy = false;
function geoCache() { try { return JSON.parse(localStorage.getItem('bacha_geo') || '{}'); } catch (e) { return {}; } }
function geoKey(o) { return String(o.delivery_address || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200); }
/* Orders with no pin (old pasted links) get an APPROXIMATE spot looked up from the written address, one at a time, and remembered on this device */
async function geocodeMissing(list) {
  if (geoBusy || !window.L) return;
  const cache = geoCache(), todo = [];
  list.forEach(o => { const k = geoKey(o); if (k && !(k in cache) && !todo.some(x => geoKey(x) === k)) todo.push(o); });
  if (!todo.length) return;
  geoBusy = true; let got = 0;
  for (const o of todo.slice(0, 12)) {
    const k = geoKey(o); let hit = null;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ph&accept-language=en&q=${encodeURIComponent(o.delivery_address)}`);
      const d = r.ok ? await r.json() : null;
      if (Array.isArray(d) && d[0]) hit = { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
      else if (r.ok) hit = false;                                   // looked up, no match: do not ask again
    } catch (e) { break; }                                           // offline: try again next time
    if (hit !== null) { const c = geoCache(); c[k] = hit; try { localStorage.setItem('bacha_geo', JSON.stringify(c)); } catch (e) {} if (hit) got++; }
    await new Promise(res => setTimeout(res, 1100));                 // OpenStreetMap asks for at most one search per second
  }
  geoBusy = false;
  if (got) renderDeliveryMap(true);
}
function dmapPoint(o) {
  const p = parseMapsLink(o.maps_link); if (p) return p;
  const g = geoCache()[geoKey(o)];
  return g ? { lat: g.lat, lng: g.lng, approx: true } : null;
}
const D_COLORS = { pending: '#B45309', queued: '#4F6E48', ready: '#C2365A', done: '#6B7280' };
const D_LABELS = { pending: 'To confirm', queued: 'In the oven', ready: 'Ready', done: 'Delivered' };
function dmapOrders() {
  const sel = document.getElementById('dmap-batch'), withDone = document.getElementById('dmap-done').checked;
  const all = orders.filter(o => o.order_type !== 'pos' && o.fulfillment === 'delivery' && orderKind(o) !== 'cancelled' && (withDone || orderKind(o) !== 'done'));
  const batches = [...new Set(all.map(o => o.batch_date || 'Weekly batch'))].sort((a, b) => (batchCutoffs[a] ?? 9e15) - (batchCutoffs[b] ?? 9e15));
  const keep = sel.value;
  sel.innerHTML = `<option value="">All bake days (${all.length})</option>` + batches.map(b => `<option value="${esc(b)}">${esc(b)} (${all.filter(o => (o.batch_date || 'Weekly batch') === b).length})</option>`).join('');
  sel.value = batches.includes(keep) ? keep : '';
  return sel.value ? all.filter(o => (o.batch_date || 'Weekly batch') === sel.value) : all;
}
function renderDeliveryMap(force) {
  const panel = document.getElementById('map-panel');
  if (!panel || !panel.open) { dSig = ''; return; }
  const list = dmapOrders(), note = document.getElementById('dmap-note'), ol = document.getElementById('dmap-list');
  document.getElementById('dmap-legend').innerHTML = Object.keys(D_COLORS).map(k => `<span><i style="background:${D_COLORS[k]}"></i>${D_LABELS[k]}</span>`).join('') + '<span><i class="is-approx"></i>Dashed = approximate, from the written address</span>';
  if (!window.L) { note.textContent = 'The map could not load. The list below still shows every delivery.'; }
  const sig = list.map(o => o.id + orderKind(o) + (o.maps_link || '') + (dmapPoint(o) ? 'g' : '')).join('|') + '#' + document.getElementById('dmap-batch').value;
  if (sig === dSig && force !== true) return;   // nothing changed: leave the map where the staff left it
  dSig = sig;
  const pts = list.map(o => ({ o, p: dmapPoint(o) }));
  const pinned = pts.filter(x => x.p), unpinned = pts.filter(x => !x.p);
  if (window.L) {
    if (!dMap) { dMap = newMap(document.getElementById('dmap'), PIN_CENTER, 13); dLayer = L.layerGroup().addTo(dMap); document.getElementById('dmap').addEventListener('click', e => { const b = e.target.closest('button[data-open]'); if (b) openOrderFromMap(b.dataset.open); }); }
    dLayer.clearLayers(); dMarkers = {};
    pinned.forEach((x, i) => {
      const k = orderKind(x.o), icon = L.divIcon({ className: 'dmap-pin', iconSize: [30, 30], iconAnchor: [15, 15], html: `<span class="${x.p.approx ? 'is-approx' : ''}" style="background:${D_COLORS[k] || '#6B7280'}">${i + 1}${x.p.approx ? '~' : ''}</span>` });
      const m = L.marker([x.p.lat, x.p.lng], { icon, title: `${i + 1}. ${x.o.customer_name || x.o.id}` }).addTo(dLayer);
      m.bindPopup(`<b>${i + 1}. ${esc(x.o.customer_name || '')}</b><br>${esc(x.o.delivery_address || '')}${x.p.approx ? '<br><i>Approximate spot from the address</i>' : ''}<br><span style="color:${D_COLORS[k]};font-weight:700">${D_LABELS[k] || ''}</span> · ₱${esc(String(x.o.total_amount))}${x.o.payment_method === 'COD' ? ' · COD' : ''}<br><a href="${dirUrl(x.p.lat, x.p.lng)}" target="_blank" rel="noopener">Directions ↗</a> · <button type="button" data-open="${esc(x.o.id)}" class="dmap-open">Open order</button>`);
      dMarkers[x.o.id] = m;
    });
    if (pinned.length) dMap.fitBounds(L.latLngBounds(pinned.map(x => [x.p.lat, x.p.lng])), { padding: [36, 36], maxZoom: 16 });
    else dMap.setView(PIN_CENTER, 13);
    setTimeout(() => dMap.invalidateSize(), 120);
  }
  const exact = pinned.filter(x => !x.p.approx).length, approx = pinned.length - exact;
  note.textContent = list.length ? `${exact} exact pin${exact === 1 ? '' : 's'}${approx ? `, ${approx} approximate (from the address)` : ''}${unpinned.length ? `, ${unpinned.length} with no location (listed below)` : ''}.${geoBusy ? ' Looking up addresses…' : ''}` : 'No delivery orders to show for this selection.';
  geocodeMissing(unpinned.map(x => x.o));
  ol.innerHTML = pinned.map((x, i) => rowHTML(x.o, i + 1, x.p)).join('') + unpinned.map(x => rowHTML(x.o, '–', null)).join('');
  ol.onclick = e => {
    const b = e.target.closest('button[data-focus]'); if (b) { const m = dMarkers[b.dataset.focus]; if (m && dMap) { dMap.setView(m.getLatLng(), 17); m.openPopup(); document.getElementById('dmap').scrollIntoView({ block: 'center', behavior: 'smooth' }); } return; }
    const o = e.target.closest('button[data-open]'); if (o) openOrderFromMap(o.dataset.open);
  };
}
function rowHTML(o, n, p) {
  const k = orderKind(o);
  return `<li><span class="dmap-n" style="background:${D_COLORS[k] || '#6B7280'}">${n}</span><div class="min-w-0 flex-1"><p class="font-cute font-bold truncate">${esc(o.customer_name || o.id)} <span class="text-[12px] font-normal text-bacha-text/75">${esc(o.id)} · ${D_LABELS[k] || ''}</span></p><p class="text-[13px] text-bacha-text/80 break-words">${esc(o.delivery_address || '')}</p><div class="dmap-actions">${p ? `${p.approx ? '<span class="text-[12px] font-bold text-amber-800">Approximate</span>' : ''}<button type="button" data-focus="${esc(o.id)}">Show on map</button><a href="${dirUrl(p.lat, p.lng)}" target="_blank" rel="noopener">Directions ↗</a>` : (/^https?:\/\//i.test(o.maps_link || '') ? `<a href="${esc(o.maps_link)}" target="_blank" rel="noopener">Open pasted link ↗</a>` : '<span class="text-[12px] text-rose-700 font-bold">No pin</span>')}<button type="button" data-open="${esc(o.id)}">Open order</button></div></div></li>`;
}
function openOrderFromMap(id) {
  ordersFilter = 'all'; ordersLimit = Math.max(ordersLimit, 20);
  const box = document.getElementById('orders-search'); if (box) box.value = id;
  setOrdersSearch(id);
  const l = document.getElementById('admin-orders-list'); if (l) l.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
document.addEventListener('DOMContentLoaded', () => { const p = document.getElementById('map-panel'); if (p) p.addEventListener('toggle', () => renderDeliveryMap(true)); });
const _renderAdminForMap = renderAdmin;
renderAdmin = function () { _renderAdminForMap(); if (activeAdminTab === 'orders') renderDeliveryMap(); };
