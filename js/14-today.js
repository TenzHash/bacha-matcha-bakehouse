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

  const card = (n, label, sub, tone, go) => `<button onclick="${go}" class="today-card ${tone}"><span class="today-n font-cute">${n}</span><span class="today-l font-cute">${label}</span><span class="today-s">${sub}</span></button>`;
  const cards = [
    card(waiting.length, 'Orders waiting', overdue.length ? `${overdue.length} waiting over 24 hours` : (waiting.length ? 'Check payment, then confirm' : 'All caught up'), waiting.length ? (overdue.length ? 'is-alert' : 'is-warn') : '', "goOrders('pending')"),
    card(ready.length, 'Ready to hand over', ready.length ? 'Waiting for pick-up or delivery' : 'Nothing waiting', ready.length ? 'is-warn' : '', "goOrders('ready')"),
    card(inOven.length, 'In the oven', inOven.length ? 'Paid, being baked' : 'No paid orders in queue', '', "goOrders('queued')"),
    card(peso(salesToday), 'Sales today', `${todays.length} order${todays.length === 1 ? '' : 's'} placed today`, '', "goOrders('all')")
  ].join('');

  const lowHTML = low.length
    ? `<ul class="today-list">${low.map(p => `<li><img src="${esc(p.image)}" alt="" class="inv-img" onerror="this.src='images/classic.png';" /><span class="font-cute font-bold min-w-0 flex-1">${esc(p.name)}</span><span class="today-pill ${p.stock <= 0 ? 'is-alert' : 'is-warn'}">${p.stock <= 0 ? 'Out' : p.stock + ' left'}</span></li>`).join('')}</ul>`
    : '<p class="today-empty">Everything is stocked above your low-stock limit.</p>';

  const batches = {};
  orders.filter(o => real(o) && ['queued', 'ready', 'pending'].includes(orderKind(o))).forEach(o => { const b = o.batch_date || 'Weekly batch'; (batches[b] = batches[b] || { n: 0, paid: 0 }).n++; if (orderKind(o) !== 'pending') batches[b].paid++; });
  const bKeys = Object.keys(batches).sort((a, b) => (batchCutoffs[a] ?? 9e15) - (batchCutoffs[b] ?? 9e15));
  const batchHTML = bKeys.length
    ? `<ul class="today-list">${bKeys.map(b => `<li><span class="font-cute font-bold min-w-0 flex-1">${esc(b)}</span><span class="today-s">${batches[b].paid} paid · ${batches[b].n - batches[b].paid} to confirm</span></li>`).join('')}</ul>`
    : '<p class="today-empty">No open orders for any bake day yet.</p>';

  host.innerHTML = `
    <div class="today-grid">${cards}</div>
    <div class="today-cols">
      <section class="panel today-panel" aria-labelledby="today-low-h"><div class="today-head"><h3 id="today-low-h" class="font-cute">Low stock</h3><button class="today-link" onclick="switchAdminTab('inventory')">Open inventory</button></div>${lowHTML}</section>
      <section class="panel today-panel" aria-labelledby="today-bake-h"><div class="today-head"><h3 id="today-bake-h" class="font-cute">Orders by bake day</h3><button class="today-link" onclick="switchAdminTab('deadline')">Open store control</button></div>${batchHTML}</section>
      <section class="panel today-panel" aria-labelledby="today-cash-h"><div class="today-head"><h3 id="today-cash-h" class="font-cute">Cash drawer</h3><button class="today-link" onclick="switchAdminTab('cash')">Open cash</button></div><div id="today-cash"><p class="today-empty">Checking…</p></div></section>
    </div>`;
  todayCash();
}

async function todayCash() {
  const el = document.getElementById('today-cash');
  if (!el) return;
  if (!(isSupabaseConfigured && adminToken)) { el.innerHTML = '<p class="today-empty">The cash drawer needs the online database.</p>'; return; }
  const { data, error } = await adm('admin_cash_get', { p_day: dayKey(new Date()) });
  const now = document.getElementById('today-cash');
  if (!now) return;
  if (error || !data) { now.innerHTML = '<p class="today-empty">Could not load the drawer. Open the Cash page to try again.</p>'; return; }
  if (data.closed) now.innerHTML = '<p class="today-empty">Today\'s drawer is closed and counted.</p>';
  else if (!data.exists) now.innerHTML = '<p class="today-empty">Not opened yet. Enter your opening cash to start tracking.</p>';
  else now.innerHTML = `<p class="today-line"><span>Cash sales at the counter</span><b class="font-cute">${peso(data.cash_sales)}</b></p><p class="today-empty">Drawer is open. Count it when you close for the day.</p>`;
}

function goOrders(filter) { ordersFilter = filter; ordersLimit = 20; switchAdminTab('orders'); renderAdmin(); }

const _renderAdminBase = renderAdmin;
renderAdmin = function () { _renderAdminBase(); if (activeAdminTab === 'today') renderToday(); };
