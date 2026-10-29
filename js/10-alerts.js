/* Overdue badge, "load older orders", and the new-order sound alert */

// A GCash order that has waited more than 24 h for the owner to check it (never auto-cancelled)
function isOverdue(o) {
  return o && o.order_type !== 'pos' && o.status === 'Payment Verification Required' && o.created_at && (Date.now() - new Date(o.created_at).getTime()) > 24 * 3600 * 1000;
}

// ---- order history window ----
async function loadOlderOrders() {
  ordersDays = ordersDays < 90 ? 90 : ordersDays < 365 ? 365 : 0;
  ordersLimit = 20;
  await initSupabaseData();
}
async function ensureOrdersCover(fromDate) {
  if (!(isSupabaseConfigured && adminToken) || ordersDays === 0 || !fromDate) return;
  const need = Math.ceil((Date.now() - new Date(fromDate + 'T00:00:00').getTime()) / 86400000) + 1;
  if (need > ordersDays) { ordersDays = need > 365 ? 0 : (need > 90 ? 365 : 90); await initSupabaseData(); }
}

// ---- new-order alerts ----
let alertsOn = false, audioCtx = null, seenPending = null, unseenCount = 0, wakeLock = null, baseTitle = document.title;
try { alertsOn = localStorage.getItem('bacha_alerts') === '1'; } catch (e) {}

function alertsButton() {
  const b = document.getElementById('alerts-btn'); if (!b) return;
  const live = alertsOn && audioCtx && audioCtx.state === 'running';
  b.textContent = live ? '🔔 Alerts on' : alertsOn ? '🔔 Tap to enable sound' : '🔕 Alerts off';
  b.setAttribute('aria-pressed', String(!!live));
  b.className = 'shrink-0 px-3 py-2 rounded-full font-cute font-bold text-[13px] border whitespace-nowrap ' + (live ? 'bg-bacha-matcha text-white border-bacha-matcha' : alertsOn ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-white text-bacha-text border-bacha-gingham');
}
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state !== 'running') return audioCtx.resume().then(alertsButton).catch(() => {});
  } catch (e) {}
  alertsButton();
}
function playChime() {
  try {
    if (!audioCtx || audioCtx.state !== 'running') return;
    [[880, 0], [1175, 0.18], [1568, 0.36]].forEach(([f, t]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(audioCtx.destination);
      const t0 = audioCtx.currentTime + t; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      o.start(t0); o.stop(t0 + 0.45);
    });
  } catch (e) {}
}
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { wakeLock = null; }
}
function toggleAlerts() {
  alertsOn = !alertsOn;
  try { localStorage.setItem('bacha_alerts', alertsOn ? '1' : '0'); } catch (e) {}
  if (alertsOn) { unlockAudio(); setTimeout(playChime, 150); keepAwake(true); toast('Alerts on. Keep this page open to hear new orders.'); }
  else { keepAwake(false); clearUnseen(); }
  alertsButton();
}
function clearUnseen() { unseenCount = 0; document.title = baseTitle; }
function pendingIds(list) { return new Set((list || []).filter(o => o.order_type !== 'pos' && (o.status === 'Payment Verification Required' || o.status === COD_STATUS)).map(o => o.id)); }
// called after every refresh of the order list
function checkNewOrders(before) {
  const now = pendingIds(orders);
  if (seenPending === null) { seenPending = now; return; }      // first load: nothing counts as new
  let fresh = 0; now.forEach(id => { if (!seenPending.has(id)) fresh++; });
  seenPending = now;
  if (!fresh || !alertsOn) return;
  unseenCount += fresh;
  document.title = `(${unseenCount} new) ${baseTitle}`;
  playChime(); toast(`${fresh} new order${fresh > 1 ? 's' : ''} received`);
}
// browsers only allow sound after a tap: the first tap anywhere unlocks it
document.addEventListener('pointerdown', () => { if (alertsOn) unlockAudio(); }, { passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { clearUnseen(); if (alertsOn) keepAwake(true); } });
window.addEventListener('focus', clearUnseen);
alertsButton();
if (alertsOn) keepAwake(true);
