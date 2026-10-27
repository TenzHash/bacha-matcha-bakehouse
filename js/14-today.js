/* "Today" page: what needs the owner's attention right now (opens first in the admin) */

function renderToday() {
  const host = document.getElementById('admin-today-tab');
  if (!host) return;
  const real = o => o.order_type !== 'pos';
  const waiting = orders.filter(o => real(o) && orderKind(o) === 'pending');
  const overdue = waiting.filter(isOverdue);
  const inOven = orders.filter(o => real(o) && orderKind(o) === 'queued');
  const ready = orders.filter(o => real(o) && orderKind(o) === 'ready');
  const todayKey = dayKey(new Date());
  const todays = orders.filter(o => o.created_at && dayKey(new Date(o.created_at)) === todayKey && orderKind(o) !== 'cancelled' && o.status !== 'Voided (POS)');
  const salesToday = todays.filter(o => orderKind(o) !== 'pending').reduce((a, o) => a + Number(o.total_amount || 0), 0);
  const lim = lowStockLimit();
  const low = products.filter(p => p.is_active !== false && p.stock <= lim).sort((a, b) => a.stock - b.stock);

  const card = (icon, n, label, sub, tone, go) => `<button onclick="${go}" class="today-card ${tone}"><span class="today-ico" aria-hidden="true"><i data-lucide="${icon}" class="w-[18px] h-[18px]"></i></span><span class="today-n font-cute">${n}</span><span class="today-l font-cute">${label}</span><span class="today-s">${sub}</span></button>`;
  const cards = [
    card('clipboard-check', waiting.length, 'Orders waiting', overdue.length ? `${overdue.length} waiting over 24 hours` : (waiting.length ? 'Check payment, then confirm' : 'All caught up'), waiting.length ? (overdue.length ? 'is-alert' : 'is-warn') : '', "goOrders('pending')"),
    card('hand-heart', ready.length, 'Ready to hand over', ready.length ? 'Waiting for pick-up or delivery' : 'Nothing waiting', ready.length ? 'is-warn' : '', "goOrders('ready')"),
    card('flame', inOven.length, 'In the oven', inOven.length ? 'Paid, being baked' : 'No paid orders in queue', '', "goOrders('queued')"),
    card('banknote', peso(salesToday), 'Sales today', `${todays.length} order${todays.length === 1 ? '' : 's'} placed today`, 'is-sales', "goOrders('all')")
  ].join('');

  // hero: greeting, one-line summary, quick actions
  const now = new Date(), hr = now.getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long' });
  const bits = [];
  if (waiting.length) bits.push(`<b>${waiting.length}</b> to confirm`);
  if (ready.length) bits.push(`<b>${ready.length}</b> to hand over`);
  if (inOven.length) bits.push(`<b>${inOven.length}</b> in the oven`);
  if (low.length) bits.push(`<b>${low.length}</b> low on stock`);
  const summary = bits.length ? bits.join(' <span aria-hidden="true">·</span> ') : 'You are all caught up. Nothing needs you right now.';
  const hero = `<section class="today-hero" aria-label="Summary">
      <div class="min-w-0"><p class="today-date">${esc(dateStr)}</p><h2 class="today-greet font-cute">${greet}</h2><p class="today-summary">${summary}</p></div>
      <div class="today-actions">
        <button onclick="switchAdminTab('pos')" class="today-btn is-ghost font-cute"><i aria-hidden="true" data-lucide="calculator" class="w-4 h-4"></i>New POS sale</button>
        <button onclick="goOrders('${waiting.length ? 'pending' : 'all'}')" class="today-btn font-cute"><i aria-hidden="true" data-lucide="clipboard-list" class="w-4 h-4"></i>${waiting.length ? 'Confirm orders' : 'View orders'}</button>
      </div>
    </section>`;

  const empty = (icon, txt) => `<div class="today-empty"><i aria-hidden="true" data-lucide="${icon}" class="w-5 h-5"></i><p>${txt}</p></div>`;

  const lowHTML = low.length
    ? `<ul class="today-list">${low.map(p => `<li><img src="${esc(p.image)}" alt="" class="inv-img" onerror="this.src='images/classic.png';" /><span class="font-cute font-bold min-w-0 flex-1">${esc(p.name)}</span><span class="today-pill ${p.stock <= 0 ? 'is-alert' : 'is-warn'}">${p.stock <= 0 ? 'Out' : p.stock + ' left'}</span></li>`).join('')}</ul>`
    : empty('package-check', 'Everything is stocked above your low-stock limit.');

  const batches = {};
  orders.filter(o => real(o) && ['queued', 'ready', 'pending'].includes(orderKind(o))).forEach(o => { const b = o.batch_date || 'Weekly batch'; (batches[b] = batches[b] || { n: 0, paid: 0 }).n++; if (orderKind(o) !== 'pending') batches[b].paid++; });
  const bKeys = Object.keys(batches).sort((a, b) => (batchCutoffs[a] ?? 9e15) - (batchCutoffs[b] ?? 9e15));
  const batchHTML = bKeys.length
    ? `<ul class="today-list">${bKeys.map(b => { const x = batches[b], pct = Math.round(x.paid / x.n * 100); return `<li class="is-batch"><div class="today-batch-top"><span class="font-cute font-bold min-w-0 flex-1">${esc(b)}</span><span class="today-s">${x.n} order${x.n === 1 ? '' : 's'}</span></div><div class="today-bar" role="img" aria-label="${x.paid} of ${x.n} paid"><span style="width:${pct}%"></span></div><div class="today-batch-sub"><span>${x.paid} paid</span><span>${x.n - x.paid} to confirm</span></div></li>`; }).join('')}</ul>`
    : empty('calendar-check', 'No open orders for any bake day yet.');

  const head = (id, title, go, label) => `<div class="today-head"><h3 id="${id}" class="font-cute">${title}</h3><button class="today-link" onclick="${go}">${label}<i aria-hidden="true" data-lucide="arrow-right" class="w-3.5 h-3.5"></i></button></div>`;
  host.innerHTML = `
    ${hero}
    <div class="today-grid">${cards}</div>
    <div class="today-cols">
      <section class="today-panel is-wide" aria-labelledby="today-bake-h">${head('today-bake-h', 'Orders by bake day', "switchAdminTab('deadline')", 'Store control')}${batchHTML}</section>
      <div class="today-side">
        <section class="today-panel" aria-labelledby="today-low-h">${head('today-low-h', 'Low stock', "switchAdminTab('inventory')", 'Inventory')}${lowHTML}</section>
        <section class="today-panel" aria-labelledby="today-cash-h">${head('today-cash-h', 'Cash drawer', "switchAdminTab('cash')", 'Cash')}<div id="today-cash">${empty('loader', 'Checking…')}</div></section>
      </div>
    </div>`;
  todayCash();
  if (window.lucide) lucide.createIcons();
}

function todayEmpty(icon, txt) { return `<div class="today-empty"><i aria-hidden="true" data-lucide="${icon}" class="w-5 h-5"></i><p>${txt}</p></div>`; }

async function todayCash() {
  const el = document.getElementById('today-cash');
  if (!el) return;
  if (!(isSupabaseConfigured && adminToken)) { el.innerHTML = todayEmpty('wifi-off', 'The cash drawer needs the online database.'); return; }
  const { data, error } = await adm('admin_cash_get', { p_day: dayKey(new Date()) });
  const now = document.getElementById('today-cash');
  if (!now) return;
  if (error || !data) { now.innerHTML = todayEmpty('triangle-alert', 'Could not load the drawer. Open the Cash page to try again.'); if (window.lucide) lucide.createIcons(); return; }
  if (data.closed) now.innerHTML = todayEmpty('lock', 'Today\'s drawer is closed and counted.');
  else if (!data.exists) now.innerHTML = todayEmpty('wallet', 'Not opened yet. Enter your opening cash to start tracking.');
  else now.innerHTML = `<p class="today-line"><span>Cash sales at the counter</span><b class="font-cute">${peso(data.cash_sales)}</b></p><p class="today-note">Drawer is open. Count it when you close for the day.</p>`;
  if (window.lucide) lucide.createIcons();
}

function goOrders(filter) { ordersFilter = filter; ordersLimit = 20; switchAdminTab('orders'); renderAdmin(); }

const _renderAdminBase = renderAdmin;
renderAdmin = function () { _renderAdminBase(); if (activeAdminTab === 'today') renderToday(); };
