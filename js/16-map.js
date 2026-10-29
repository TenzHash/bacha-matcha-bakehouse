/* Part 8H: maps. Built on Leaflet (BSD-2 licence, https://leafletjs.com), a widely used, stable map library.
   - Layers button (top right): "Map" (OpenStreetMap) and "Satellite" (Esri World Imagery), each with its required credit.
   - Delivery area circle, shop + customer pins, and the route planner (Orders -> Delivery map).
   Leaflet is loaded from vendor/leaflet/ when that folder exists, otherwise from a pinned copy on unpkg / jsDelivr.
   Rules this file follows (keep them if you edit it):
   - OpenStreetMap tiles: credit "(c) OpenStreetMap contributors" always visible and linked; official tile.openstreetmap.org
     address (no a/b/c sub-domains); max zoom 19; the browser sends its normal Referer; no bulk download / pre-fetching.
     https://operations.osmfoundation.org/policies/tiles/
   - Esri World Imagery: credit text shown while Satellite is selected. https://www.esri.com/en-us/legal/terms/full-master-agreement
   - Route line: OSRM public demo server, max 1 request per second, only on demand, results cached.
     https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy
   - Google Maps: only opened through official Maps URLs (https://developers.google.com/maps/documentation/urls/get-started);
     Google tiles are never copied. */

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_SOURCES = [
  { css: 'vendor/leaflet/leaflet.css', js: 'vendor/leaflet/leaflet.js' },
  { css: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`, js: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js` },
  { css: `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`, js: `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.js` }
];
const MAP_FALLBACK = { lat: 14.5995, lng: 120.9842 };
const MAP_BASES = {
  osm: {
    name: 'Map', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    opts: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' }
  },
  sat: {
    name: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    opts: { maxZoom: 19, maxNativeZoom: 19, attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community' }
  }
};
const MAP_BASE_KEY = 'bacha-map-base';

/* ---------- load Leaflet on demand (only the admin screens need it) ---------- */
let leafletPromise = null;
function loadTag(tag, attrs) {
  return new Promise((resolve, reject) => {
    const el = document.createElement(tag);
    Object.assign(el, attrs);
    el.onload = () => resolve(el);
    el.onerror = () => { el.remove(); reject(new Error('load failed')); };
    (tag === 'link' ? document.head : document.body).appendChild(el);
  });
}
function ensureLeaflet() {
  if (typeof L !== 'undefined' && L.map) return Promise.resolve(true);
  if (leafletPromise) return leafletPromise;
  leafletPromise = (async () => {
    for (const s of LEAFLET_SOURCES) {
      try {
        await loadTag('link', { rel: 'stylesheet', href: s.css });
        await loadTag('script', { src: s.js, async: true });
        if (typeof L !== 'undefined' && L.map) return true;
      } catch (e) { /* try the next source */ }
    }
    return false;
  })().then(ok => { if (!ok) leafletPromise = null; return ok; });
  return leafletPromise;
}

/* ---------- BachaMap: small wrapper around Leaflet ---------- */
class BachaMap {
  constructor(host, opts = {}) {
    this.host = host; this.opts = opts;
    this.circle = null; this.pins = []; this.picked = null; this.route = null;
    this.markers = new Map(); this.pinByKey = new Map();
    this.map = null; this.circleLayer = null; this.routeLayers = []; this._routeCredit = false;
    this._note = ''; this._wantFit = false; this._view = null; this._dead = false; this._failed = false;
    host.classList.add('bmap');
    host.innerHTML = '<div class="bmap-leaf"></div><div class="bmap-note" role="status"></div>';
    this.leafEl = host.querySelector('.bmap-leaf'); this.noteEl = host.querySelector('.bmap-note');
    this.leafEl.setAttribute('role', 'group');
    this.leafEl.setAttribute('aria-label', opts.label || 'Map. Drag to move, use the plus and minus buttons to zoom.');
    this._showNote();
    ensureLeaflet().then(ok => {
      if (this._dead) return;
      if (!ok) { this._failed = true; this._showNote(); return; }
      this._init();
    });
  }
  _showNote() {
    const msg = this._failed ? 'The map could not load. Check your internet connection and open it again.' : (!this.map ? 'Loading map...' : this._note);
    this.noteEl.style.display = msg ? '' : 'none'; this.noteEl.textContent = msg || '';
  }
  note(msg) { this._note = msg || ''; this._showNote(); }
  _init() {
    let saved = null; try { saved = localStorage.getItem(MAP_BASE_KEY); } catch (e) { /* storage may be blocked */ }
    const base = {};
    for (const k of Object.keys(MAP_BASES)) base[MAP_BASES[k].name] = L.tileLayer(MAP_BASES[k].url, MAP_BASES[k].opts);
    const map = this.map = L.map(this.leafEl, { center: [MAP_FALLBACK.lat, MAP_FALLBACK.lng], zoom: 12, minZoom: 3, maxZoom: 19, scrollWheelZoom: false, worldCopyJump: true });
    (base[saved] || base[MAP_BASES.osm.name]).addTo(map);
    L.control.layers(base, null, { position: 'topright', collapsed: true }).addTo(map);
    map.on('baselayerchange', e => { try { localStorage.setItem(MAP_BASE_KEY, e.name); } catch (err) { /* ignore */ } });
    // the page (or modal) scrolls with the mouse wheel; the map only zooms with the wheel once it has focus
    map.on('focus', () => map.scrollWheelZoom.enable()); map.on('blur', () => map.scrollWheelZoom.disable());
    map.on('click', e => { if (this.opts.onPick) this.opts.onPick({ lat: e.latlng.lat, lng: e.latlng.lng }); });
    this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.invalidate()) : null;
    if (this._ro) this._ro.observe(this.host);
    this._showNote();
    this._drawCircle(); this._drawPins(); this._drawRoute();
    if (this._wantFit) this.fit(); else if (this._view) this.setView(this._view.lat, this._view.lng, this._view.z);
  }
  size() { return { w: this.host.clientWidth, h: this.host.clientHeight }; }
  invalidate() {
    if (!this.map) return;
    this.map.invalidateSize({ pan: false });
    const s = this.size(); if (this._wantFit && s.w && s.h) this.fit();
  }
  destroy() {
    this._dead = true; if (this._ro) this._ro.disconnect();
    if (this.map) { this.map.remove(); this.map = null; }
    this.markers.clear(); this.host.innerHTML = ''; this.host.classList.remove('bmap');
  }
  setView(lat, lng, z) {
    this._view = { lat, lng, z };
    if (!this.map) return;
    this.map.setView([Math.max(-84, Math.min(84, lat)), lng], z != null ? Math.max(3, Math.min(19, z)) : this.map.getZoom(), { animate: false });
  }
  setCircle(c) { this.circle = c && isFinite(c.lat) && isFinite(c.lng) && c.km > 0 ? c : null; this._drawCircle(); }
  setPins(pins, picked) { this.pins = pins || []; if (picked !== undefined) this.picked = picked; this._drawPins(); }
  setRoute(r) { this.route = r && r.line && r.line.length > 1 ? r : null; this._drawRoute(); }
  _drawCircle() {
    if (!this.map) return;
    if (this.circleLayer) { this.circleLayer.remove(); this.circleLayer = null; }
    if (this.circle) this.circleLayer = L.circle([this.circle.lat, this.circle.lng], { radius: this.circle.km * 1000, color: '#3F5A38', weight: 2.5, dashArray: '8 6', fillColor: '#4F6E48', fillOpacity: 0.16, interactive: false }).addTo(this.map);
  }
  _drawRoute() {
    if (!this.map) return;
    this.routeLayers.forEach(l => l.remove()); this.routeLayers = [];
    if (this._routeCredit) { this.map.attributionControl.removeAttribution('Route: <a href="https://project-osrm.org/" target="_blank" rel="noopener noreferrer">OSRM</a>'); this._routeCredit = false; }
    const r = this.route; if (!r) return;
    const ll = r.line;
    this.routeLayers.push(L.polyline(ll, { color: '#FFFFFF', weight: 9, opacity: 0.9, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(this.map));
    this.routeLayers.push(L.polyline(ll, { color: '#1D4ED8', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round', dashArray: r.road ? null : '2 10', interactive: false }).addTo(this.map));
    if (r.road) { this.map.attributionControl.addAttribution('Route: <a href="https://project-osrm.org/" target="_blank" rel="noopener noreferrer">OSRM</a>'); this._routeCredit = true; }
  }
  _drawPins() {
    if (!this.map) return;
    const keep = new Set(); this.pinByKey = new Map();
    this.pins.forEach((p, i) => {
      const key = p.id != null ? String(p.id) : 'i' + i; keep.add(key); this.pinByKey.set(key, p);
      const html = `<span class="bmap-emo">${p.emoji || '📍'}</span>` + (p.badge ? `<span class="bmap-badge">${p.badge}</span>` : '');
      let m = this.markers.get(key);
      if (!m) {
        const clickable = p.kind !== 'shop' && !!this.opts.onPin;
        m = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'bmap-pin', html, iconSize: [34, 34], iconAnchor: [17, 34] }), keyboard: clickable, title: p.label || '', riseOnHover: true }).addTo(this.map);
        m.on('click', () => { const q = this.pinByKey.get(key); if (q && this.opts.onPin) this.opts.onPin(q); });
        this.markers.set(key, m);
        const el0 = m.getElement(); if (el0) el0._h = html;
      } else m.setLatLng([p.lat, p.lng]);
      const el = m.getElement();
      if (el) {
        if (el._h !== html) { el.innerHTML = html; el._h = html; }
        el.classList.toggle('is-shop', p.kind === 'shop'); el.classList.toggle('is-out', !!p.out);
        el.classList.toggle('is-picked', p.id != null && p.id === this.picked);
        el.setAttribute('aria-label', p.label || 'Pin');
        if (p.kind === 'shop') el.removeAttribute('role'); else el.setAttribute('role', 'button');
      }
      m.setZIndexOffset(p.kind === 'shop' ? 500 : (p.id != null && p.id === this.picked ? 1000 : 0));
    });
    for (const [key, m] of this.markers) if (!keep.has(key)) { m.remove(); this.markers.delete(key); }
  }
  fit() {
    if (!this.map) { this._wantFit = true; return; }
    const s = this.size();
    if (!s.w || !s.h) { this._wantFit = true; return; }
    this._wantFit = false;
    const b = L.latLngBounds([]);
    if (this.circleLayer) b.extend(this.circleLayer.getBounds());
    this.pins.forEach(p => b.extend([p.lat, p.lng]));
    if (this.route) this.route.line.forEach(pt => b.extend(pt));
    if (!b.isValid()) { this.setView(MAP_FALLBACK.lat, MAP_FALLBACK.lng, 11); return; }
    this.map.invalidateSize({ pan: false });
    this.map.fitBounds(b, { padding: [36, 36], maxZoom: 17, animate: false });
  }
}

/* ---------- helpers ---------- */
function validLatLng(lat, lng) { return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0); }
// where a delivery order is: exact coordinates saved with the order, otherwise read from the customer's Google Maps link
function orderCoords(o) {
  const a = Number(o.delivery_lat), b = Number(o.delivery_lng);
  if (o.delivery_lat != null && o.delivery_lng != null && validLatLng(a, b)) return { lat: a, lng: b, exact: true };
  const u = String(o.maps_link || ''); let m;
  const pats = [/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/, /[?&](?:q|ll|query|destination|daddr)=(-?\d{1,3}\.\d+)(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i, /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/];
  for (const re of pats) { m = u.match(re); if (m && validLatLng(parseFloat(m[1]), parseFloat(m[2]))) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), exact: false }; }
  return null;
}
function shopPoint() { const d = siteOpts.delivery || {}; const a = Number(d.shopLat), b = Number(d.shopLng); return d.shopLat != null && d.shopLng != null && validLatLng(a, b) ? { lat: a, lng: b } : null; }

/* ---------- Store control: the delivery-area preview inside the delivery settings ---------- */
let dlMap = null;
function readDeliveryForm() {
  const g = id => document.getElementById(id);
  return { on: !!(g('dl-enabled') && g('dl-enabled').checked), km: parseFloat(g('dl-km') && g('dl-km').value), lat: parseFloat(g('dl-lat') && g('dl-lat').value), lng: parseFloat(g('dl-lng') && g('dl-lng').value) };
}
function initDeliveryPreview() {
  if (dlMap) { dlMap.destroy(); dlMap = null; }
  const host = document.getElementById('dl-map'); if (!host) return;
  dlMap = new BachaMap(host, {
    label: 'Delivery area map. Tap the map to place the shop. Drag to move, use the plus and minus buttons to zoom.',
    onPick: pt => { const la = document.getElementById('dl-lat'), ln = document.getElementById('dl-lng'); if (!la || !ln) return; la.value = pt.lat.toFixed(6); ln.value = pt.lng.toFixed(6); updateDeliveryPreview(false); }
  });
  updateDeliveryPreview(true);
}
function updateDeliveryPreview(refit) {
  if (!dlMap) return;
  const f = readDeliveryForm(), ok = validLatLng(f.lat, f.lng);
  dlMap.setPins(ok ? [{ id: 'shop', kind: 'shop', emoji: '🍪', lat: f.lat, lng: f.lng, label: 'Your shop' }] : []);
  dlMap.setCircle(ok && f.on && f.km > 0 ? { lat: f.lat, lng: f.lng, km: f.km } : null);
  dlMap.note(ok ? '' : 'Tap the map to place your shop, or use "Use my current location".');
  dlMap.invalidate();
  if (refit && ok) dlMap.fit();
}

/* ---------- Route planning: pure helpers (no map needed) ---------- */
const ROUTE_MAX = 25; // stops per route (keeps the free routing server happy)
const ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving/';
const GMAPS_MAX_WAYPOINTS = 9; // Google Maps URLs accept up to 9 waypoints between origin and destination

function pathKm(path) { let s = 0; for (let i = 1; i < path.length; i++) s += haversineKm(path[i - 1].lat, path[i - 1].lng, path[i].lat, path[i].lng); return s; }
// nearest-neighbour, then 2-opt. `start` (the shop) stays first; with no start the first stop stays first. `closed` = come back to the start.
function routeOptimize(stops, start, closed) {
  if (stops.length < 2) return stops.slice();
  const pts = (start ? [start] : []).concat(stops), n = pts.length;
  const d = (i, j) => haversineKm(pts[i].lat, pts[i].lng, pts[j].lat, pts[j].lng);
  const used = new Array(n).fill(false); let order = [0]; used[0] = true;
  for (let k = 1; k < n; k++) {
    const last = order[order.length - 1]; let best = -1, bd = Infinity;
    for (let j = 0; j < n; j++) if (!used[j] && d(last, j) < bd) { bd = d(last, j); best = j; }
    order.push(best); used[best] = true;
  }
  const len = o => { let s = 0; for (let i = 0; i < o.length - 1; i++) s += d(o[i], o[i + 1]); if (closed) s += d(o[o.length - 1], o[0]); return s; };
  let improved = true, guard = 0;
  while (improved && guard++ < 60) {
    improved = false;
    for (let i = 1; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
      const cand = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1));
      if (len(cand) < len(order) - 1e-9) { order = cand; improved = true; }
    }
  }
  return order.slice(start ? 1 : 0).map(i => pts[i]);
}
// Google Maps directions links. `path` = ordered points. fromMe = leave the origin out, so Google starts from the phone's own position.
// More than 9 in-between stops are split into several links (each part starts where the last one ended).
function googleDirectionsLinks(path, fromMe) {
  const f = p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`, links = [];
  let origin = fromMe ? null : path[0], rest = fromMe ? path.slice() : path.slice(1);
  while (rest.length) {
    const take = rest.slice(0, GMAPS_MAX_WAYPOINTS + 1); rest = rest.slice(take.length);
    const dest = take[take.length - 1], wps = take.slice(0, -1);
    let url = 'https://www.google.com/maps/dir/?api=1' + (origin ? '&origin=' + f(origin) : '') + '&destination=' + f(dest);
    if (wps.length) url += '&waypoints=' + wps.map(f).join('%7C');
    links.push({ url, stops: take.length });
    origin = dest;
  }
  return links;
}
async function fetchRoadRoute(path, signal) {
  const wait = (fetchRoadRoute.last || 0) + 1100 - Date.now(); // OSRM demo server: at most 1 request per second
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  if (signal.aborted) throw new Error('aborted');
  fetchRoadRoute.last = Date.now();
  const coords = path.map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const res = await fetch(`${ROUTE_URL}${coords}?overview=full&geometries=geojson&steps=false`, { signal });
  if (!res.ok) throw new Error('route http ' + res.status);
  const j = await res.json();
  if (j.code !== 'Ok' || !j.routes || !j.routes[0]) throw new Error('no route');
  const r = j.routes[0];
  return { line: r.geometry.coordinates.map(c => [c[1], c[0]]), km: r.distance / 1000, min: r.duration / 60, road: true };
}
function fmtDuration(min) { const m = Math.max(1, Math.round(min)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; }

/* ---------- Orders: the delivery map + route planner ---------- */
let deliveryMap = null, dmapPicked = null, dmapFocus = null, dmapPins = [], dmapPinMap = new Map();
let routeIds = [], routeFromShop = true, routeReturn = false, routeInfo = null, routeSeq = 0, routeTimer = null, routeCtl = null, routeFocus = null;
const routeCache = new Map();

function routeCancel() { clearTimeout(routeTimer); routeSeq++; if (routeCtl) { routeCtl.abort(); routeCtl = null; } }
function toggleDeliveryMap(open) {
  const m = document.getElementById('delivery-map-modal'); if (!m) return;
  m.classList.toggle('opacity-0', !open); m.classList.toggle('pointer-events-none', !open);
  m.classList.toggle('opacity-100', open); m.classList.toggle('pointer-events-auto', open);
  if (!open) { routeCancel(); if (deliveryMap) { deliveryMap.destroy(); deliveryMap = null; } }
}
function openDeliveryMap(orderId) {
  dmapFocus = orderId || null; dmapPicked = orderId || null;
  const inc = document.getElementById('dmap-finished'); if (inc) inc.checked = !!(orderId && !dmapOpenOrders().some(o => o.id === orderId));
  toggleDeliveryMap(true);
  setTimeout(() => { renderDeliveryMap(true); const c = document.querySelector('#delivery-map-modal .dmap-card'); if (c) c.scrollTop = 0; }, 80);
}
function dmapOrders() { return orders.filter(o => o.order_type !== 'pos' && o.fulfillment === 'delivery'); }
function dmapOpenOrders() { return dmapOrders().filter(o => ['pending', 'queued', 'ready'].includes(orderKind(o))); }
function applyDmapPins() {
  if (!deliveryMap) return;
  deliveryMap.setPins(dmapPins.map(p => p.kind === 'shop' ? p : { ...p, badge: routeIds.indexOf(p.id) + 1 }), dmapPicked);
}
function renderDeliveryMap(refit) {
  const host = document.getElementById('dmap-host'); if (!host) return;
  const incl = document.getElementById('dmap-finished').checked;
  const list = incl ? dmapOrders().filter(o => orderKind(o) !== 'cancelled') : dmapOpenOrders();
  const shop = shopPoint(), d = siteOpts.delivery || {}, limit = !!(d.limitEnabled && shop);
  const pins = [], missing = [];
  if (shop) pins.push({ id: 'shop', kind: 'shop', emoji: '🍪', lat: shop.lat, lng: shop.lng, label: 'Your shop' });
  list.forEach(o => {
    const c = orderCoords(o); if (!c) { missing.push(o); return; }
    const km = shop ? haversineKm(shop.lat, shop.lng, c.lat, c.lng) : null, out = limit && km > Number(d.maxKm);
    pins.push({ id: o.id, order: o, lat: c.lat, lng: c.lng, km, out, emoji: '📍', label: `Order ${o.id}, ${o.customer_name}${km != null ? ', ' + km.toFixed(1) + ' km from the shop' : ''}${out ? ', outside your delivery area' : ''}` });
  });
  dmapPins = pins; dmapPinMap = new Map(pins.filter(p => p.kind !== 'shop').map(p => [p.id, p]));
  routeIds = routeIds.filter(id => dmapPinMap.has(id));
  if (!deliveryMap) deliveryMap = new BachaMap(host, { label: 'Delivery map with your shop and customer pins. Drag to move, use the plus and minus buttons to zoom.', onPin: p => { if (p.kind === 'shop') return; dmapPicked = p.id; showDmapDetail(dmapPinMap.get(p.id) || p); applyDmapPins(); } });
  deliveryMap.setCircle(limit ? { lat: shop.lat, lng: shop.lng, km: Number(d.maxKm) } : null);
  applyDmapPins();
  deliveryMap.note(!shop ? 'Set your shop location in Store control to see your delivery area.' : '');
  if (refit) deliveryMap.fit();
  const customers = pins.filter(p => p.kind !== 'shop');
  document.getElementById('dmap-summary').textContent = `${customers.length} delivery order${customers.length === 1 ? '' : 's'} on the map` + (limit ? ` · delivery area ${d.maxKm} km around the shop` : (shop ? ' · no distance limit is set' : '')) + (customers.some(p => p.out) ? ` · ${customers.filter(p => p.out).length} outside the area` : '');
  document.getElementById('dmap-missing').innerHTML = missing.length ? `<p class="text-[13px] text-bacha-text/80"><b>${missing.length} order${missing.length === 1 ? '' : 's'} can't be placed</b> (their map link has no coordinates): ${missing.map(o => `<a href="${/^https?:\/\//i.test(o.maps_link || '') ? esc(o.maps_link) : '#'}" target="_blank" rel="noopener noreferrer" class="text-blue-700 underline font-bold">${esc(o.id)} ↗</a>`).join(', ')}</p>` : '';
  const cur = dmapPinMap.get(dmapPicked); if (cur && cur.order) showDmapDetail(cur); else document.getElementById('dmap-detail').innerHTML = customers.length ? '<p class="text-[13px] text-bacha-text/75">Tap a 📍 pin to see who ordered.</p>' : '<p class="text-[13px] text-bacha-text/75">No delivery orders to show right now.</p>';
  routeRefresh(refit);
}
function showDmapDetail(p) {
  const o = p.order, el = document.getElementById('dmap-detail'), inRoute = routeIds.includes(o.id);
  el.innerHTML = `<div class="rounded-xl border border-bacha-gingham bg-bacha-pinkLight/50 p-3 space-y-1">
    <p class="font-cute font-bold text-bacha-text">${esc(o.customer_name)} <span class="text-[13px] font-normal text-bacha-text/75">(${esc(o.contact_number)})</span> · <span class="text-bacha-matcha">${esc(o.id)}</span></p>
    <p class="text-[13px] text-bacha-text/80">📍 ${esc(o.delivery_address || '')}</p>
    <p class="text-[13px] font-bold ${p.out ? 'text-rose-700' : 'text-bacha-text/80'}">${p.km != null ? `${p.km.toFixed(1)} km from the shop${p.out ? ' · outside your delivery area' : ''}` : 'Set the shop location to see the distance'} · ${esc(statusLabel(o))}</p>
    <div class="flex flex-wrap gap-2 pt-1">
      <button type="button" data-id="${esc(o.id)}" onclick="dmapToggleStop(this.dataset.id)" class="rt-btn ${inRoute ? '' : 'is-primary'}">${inRoute ? '✕ Remove from route' : '🛵 Add to route'}</button>
      <a href="https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}" target="_blank" rel="noopener noreferrer" class="rt-btn">Open in Google Maps ↗</a>
      <button type="button" data-id="${esc(o.id)}" onclick="dmapShowOrder(this.dataset.id)" class="rt-btn">Show this order</button>
    </div></div>`;
}
function dmapShowOrder(id) {
  toggleDeliveryMap(false);
  switchAdminTab('orders');
  const s = document.getElementById('orders-search'); if (s) s.value = id;
  setOrdersSearch(id);
}

/* ---------- route planner: state + drawing ---------- */
function routeStops() { return routeIds.map(id => dmapPinMap.get(id)).filter(Boolean); }
function routePath() {
  const shop = shopPoint(), stops = routeStops(), startShop = !!(routeFromShop && shop), path = [];
  if (startShop) path.push({ lat: shop.lat, lng: shop.lng });
  stops.forEach(s => path.push({ lat: s.lat, lng: s.lng }));
  if (routeReturn && shop && stops.length) path.push({ lat: shop.lat, lng: shop.lng });
  return { path, startShop, stops };
}
function routeDraw(refit) {
  if (!deliveryMap) return;
  deliveryMap.setRoute(routeInfo ? { line: routeInfo.line, road: !!routeInfo.road } : null);
  if (refit) deliveryMap.fit();
}
function routeRefresh(refit) {
  routeCancel(); applyDmapPins();
  const seq = routeSeq, { path } = routePath(); routeInfo = null;
  if (path.length < 2) { routeDraw(false); renderRoutePanel(); return; }
  const key = path.map(p => p.lat.toFixed(5) + ',' + p.lng.toFixed(5)).join(';'), cached = routeCache.get(key);
  if (cached) { routeInfo = cached; routeDraw(refit); renderRoutePanel(); return; }
  const straight = { line: path.map(p => [p.lat, p.lng]), km: pathKm(path), road: false, pending: true };
  routeInfo = straight; routeDraw(refit); renderRoutePanel();
  routeTimer = setTimeout(async () => {
    const ctl = routeCtl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
    try {
      const r = await fetchRoadRoute(path, ctl.signal);
      if (seq !== routeSeq) return;
      routeCache.set(key, r); routeInfo = r;
    } catch (e) {
      if (seq !== routeSeq) return;
      routeInfo = { ...straight, pending: false, failed: true };
    } finally { clearTimeout(to); if (routeCtl === ctl) routeCtl = null; }
    routeDraw(refit); renderRoutePanel();
  }, 600);
}
function routeChanged(refit, focus) { routeFocus = focus || null; routeRefresh(refit); const c = dmapPinMap.get(dmapPicked); if (c && c.order) showDmapDetail(c); }
function dmapToggleStop(id) {
  const i = routeIds.indexOf(id);
  if (i >= 0) routeIds.splice(i, 1);
  else if (dmapPinMap.has(id)) { if (routeIds.length >= ROUTE_MAX) { toast(`A route can have up to ${ROUTE_MAX} stops`); return; } routeIds.push(id); }
  routeChanged(i < 0);
}
function routeBestOrder() {
  const shop = shopPoint(), startShop = !!(routeFromShop && shop);
  const best = routeOptimize(routeStops(), startShop ? shop : null, !!(routeReturn && shop));
  routeIds = best.map(s => s.id);
}
function renderRoutePanel() {
  const el = document.getElementById('dmap-route'); if (!el) return;
  if (!el._wired) { el._wired = true; el.addEventListener('click', routePanelClick); el.addEventListener('change', routePanelChange); }
  const ae = document.activeElement; let keep = null; // keep keyboard focus when the panel is redrawn (e.g. when the road route arrives)
  if (ae && ae !== document.body && el.contains(ae)) keep = ae.id ? '#' + ae.id : (ae.dataset.act ? `[data-act="${ae.dataset.act}"]` + (ae.dataset.id ? `[data-id="${CSS.escape(ae.dataset.id)}"]` : '') : null);
  const shop = shopPoint(), stops = routeStops(), { path, startShop } = routePath();
  const pool = [...dmapPinMap.values()].filter(p => !routeIds.includes(p.id));
  const links = stops.length ? googleDirectionsLinks(path, !startShop) : [];
  let sum = '';
  if (!stops.length) sum = 'Pick the orders to deliver (tap a 📍 pin or use the buttons below). The route appears on the map and can be opened in Google Maps.';
  else if (path.length < 2) sum = `${stops.length} stop. Google Maps will start from your phone's own location.`;
  else if (routeInfo && routeInfo.road) sum = `${stops.length} stop${stops.length === 1 ? '' : 's'} · about ${routeInfo.km.toFixed(1)} km by road · about ${fmtDuration(routeInfo.min)} driving`;
  else if (routeInfo && routeInfo.pending) sum = `${stops.length} stop${stops.length === 1 ? '' : 's'} · finding the road route… (dotted line = straight line for now)`;
  else if (routeInfo) sum = `${stops.length} stop${stops.length === 1 ? '' : 's'} · about ${routeInfo.km.toFixed(1)} km in a straight line. The road route could not be loaded (no internet?), but Google Maps will still work out the roads.`;
  const items = stops.map((s, i) => {
    const o = s.order;
    return `<li class="rt-item"><span class="rt-n" aria-hidden="true">${i + 1}</span>
      <div class="rt-who"><b>${esc(o.customer_name)}</b> <span class="rt-id">${esc(o.id)}</span><span class="rt-addr">${esc(o.delivery_address || '')}</span></div>
      <div class="rt-btns">
        <button type="button" class="rt-icon" data-act="up" data-id="${esc(o.id)}" aria-label="Move ${esc(o.customer_name)} earlier" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="rt-icon" data-act="down" data-id="${esc(o.id)}" aria-label="Move ${esc(o.customer_name)} later" ${i === stops.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="rt-icon" data-act="rm" data-id="${esc(o.id)}" aria-label="Remove ${esc(o.customer_name)} from the route">✕</button>
      </div></li>`;
  }).join('');
  el.innerHTML = `<div class="rt-head"><span class="font-cute font-bold text-bacha-berry">🛵 Delivery route</span></div>
    <div class="rt-opts">
      <label><input type="checkbox" id="rt-start" ${startShop ? 'checked' : ''} ${shop ? '' : 'disabled'} class="w-4 h-4 accent-[#4F6E48]" /> Start at the shop${shop ? '' : ' (set the shop location first)'}</label>
      <label><input type="checkbox" id="rt-return" ${routeReturn && shop ? 'checked' : ''} ${shop ? '' : 'disabled'} class="w-4 h-4 accent-[#4F6E48]" /> Come back to the shop</label>
    </div>
    <div class="rt-actions">
      <button type="button" class="rt-btn" data-act="all" ${pool.length ? '' : 'disabled'}>＋ Add all shown orders</button>
      <button type="button" class="rt-btn" data-act="best" ${stops.length > 1 ? '' : 'disabled'}>⚡ Best order</button>
      <button type="button" class="rt-btn" data-act="clear" ${stops.length ? '' : 'disabled'}>Clear</button>
    </div>
    ${stops.length ? `<ol class="rt-list" aria-label="Route stops in order">${items}</ol>` : ''}
    ${pool.length ? `<div class="rt-pool"><span class="rt-pool-t">Add a stop:</span> ${pool.map(p => `<button type="button" class="rt-chip" data-act="add" data-id="${esc(p.id)}">＋ ${esc(p.order.customer_name)}${p.out ? ' ⚠' : ''}</button>`).join('')}</div>` : ''}
    <p class="rt-sum" role="status" aria-live="polite">${sum}</p>
    ${links.length ? `<div class="rt-go">${links.map((l, i) => `<a class="rt-btn is-primary" data-act="open" data-id="${i}" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${links.length > 1 ? `Part ${i + 1} of ${links.length} · ` : ''}Open in Google Maps ↗</a>`).join('')}<button type="button" class="rt-btn" data-act="copy">🔗 Copy link${links.length > 1 ? 's' : ''}</button></div>
    <p class="rt-hint">${links.length > 1 ? 'Google Maps only takes 10 stops at a time, so the route is split into parts: finish one, then open the next. ' : ''}Google may choose slightly different roads than the blue line. Route line: ${routeInfo && routeInfo.road ? 'OpenStreetMap data, routing by OSRM.' : 'straight lines between stops.'}</p>` : ''}`;
  if (!routeFocus && keep) { const t = el.querySelector(keep); if (t && !t.disabled) t.focus(); }
  if (routeFocus) { const f = routeFocus; routeFocus = null; const t = el.querySelector(`[data-act="${f.act}"][data-id="${CSS.escape(f.id)}"]`) || el.querySelector(`[data-act="${f.fallback || f.act}"]:not([disabled])`); if (t) t.focus(); }
}
function routePanelClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const act = b.dataset.act, id = b.dataset.id, i = routeIds.indexOf(id);
  if (act === 'up' && i > 0) { [routeIds[i - 1], routeIds[i]] = [routeIds[i], routeIds[i - 1]]; routeChanged(false, { act: i - 1 === 0 ? 'down' : 'up', id }); }
  else if (act === 'down' && i >= 0 && i < routeIds.length - 1) { [routeIds[i + 1], routeIds[i]] = [routeIds[i], routeIds[i + 1]]; routeChanged(false, { act: i + 1 === routeIds.length - 1 ? 'up' : 'down', id }); }
  else if (act === 'rm' && i >= 0) { routeIds.splice(i, 1); routeChanged(false, { act: 'rm', id: routeIds[Math.min(i, routeIds.length - 1)] || '', fallback: 'add' }); }
  else if (act === 'add') { if (routeIds.length >= ROUTE_MAX) { toast(`A route can have up to ${ROUTE_MAX} stops`); return; } if (dmapPinMap.has(id) && i < 0) routeIds.push(id); routeChanged(true, { act: 'add', id, fallback: 'best' }); }
  else if (act === 'all') {
    [...dmapPinMap.keys()].forEach(k => { if (!routeIds.includes(k) && routeIds.length < ROUTE_MAX) routeIds.push(k); });
    routeBestOrder(); routeChanged(true, { act: 'best', id: '' });
  }
  else if (act === 'best') { routeBestOrder(); routeChanged(true, { act: 'best', id: '' }); }
  else if (act === 'clear') { routeIds = []; routeChanged(false, { act: 'all', id: '' }); }
  else if (act === 'copy') {
    const { path, startShop } = routePath(), text = googleDirectionsLinks(path, !startShop).map(l => l.url).join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(text).then(() => toast('Google Maps link copied')) : Promise.reject()).catch(() => showBachaAlert(text, 'Google Maps link', '🔗'));
  }
}
function routePanelChange(e) {
  const t = e.target;
  if (t.id === 'rt-start') { routeFromShop = t.checked; routeChanged(true, { act: 'best', id: '' }); const f = document.getElementById('rt-start'); if (f) f.focus(); }
  else if (t.id === 'rt-return') { routeReturn = t.checked; routeChanged(true, { act: 'best', id: '' }); const f = document.getElementById('rt-return'); if (f) f.focus(); }
}
