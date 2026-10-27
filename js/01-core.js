/* App state, admin session, alerts, database sync */
const SUPABASE_URL = "https://awclyrlqxcnjbxjlnqxr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3Y2x5cmxxeGNuamJ4amxucXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NzQzODIsImV4cCI6MjEwODE1MDM4Mn0.8iOG3BG2_8AApscVO9qmmMrIrtVPXxEGfuGxUM4wGYo";

let sbClient = null;
let isSupabaseConfigured = false;

if (SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes("YOUR_PROJECT")) {
  try {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    isSupabaseConfigured = true;
  } catch (err) {
    console.error("Supabase client init failed:", err);
  }
}

// Admin access = a temporary token from the server (12 h). Nothing in the page grants access on its own.
let adminToken = ''; try { adminToken = sessionStorage.getItem('bacha_admin_token') || ''; sessionStorage.removeItem('bacha_admin_auth'); } catch (e) {}
let isAdminAuthenticated = !!adminToken;
let lastUnmatched = [], serverDrinksToday = 0, lastEnteredPin = '';
let ordersDays = 30;   // how far back finished orders are loaded (0 = everything); open orders always load
const SB = () => isSupabaseConfigured && !!sbClient;
function friendlyErr(m) {
  m = String(m || '');
  let x;
  if ((x = m.match(/out_of_stock:(.+)/))) return `Sorry, "${x[1].trim()}" just ran out of stock. Please adjust your bag.`;
  if ((x = m.match(/cutoff_passed:(.+)/))) return `The bake date "${x[1].replace('Batch: ', '').trim()}" is no longer open for orders. Please rebuild that box with another date.`;
  if ((x = m.match(/delivery_min:(.+)/))) return `Delivery needs an order of ₱${x[1].trim()} or more. Add a few items or choose pick-up.`;
  const map = { store_closed: 'The bakery is not accepting orders right now.', bad_name: 'Please check the name.', bad_phone: 'Please enter a valid Philippine mobile number.', bad_notes: 'Please add your preferred time.',
    bad_address: 'Please check the delivery address and Google Maps link.', bad_receipt: 'Your receipt photo was not accepted. Please upload it again.', bad_payment: 'That payment choice is not available for this order.',
    bad_box: 'A box must have exactly 6 cookies.', bad_cart: 'Something is wrong with your bag. Please rebuild it.', bad_qty: 'One of the quantities is not allowed.', empty_cart: 'Your bag is empty.',
    too_many_boxes: 'You have more boxes than allowed per order.', too_many_drinks: 'You have more drinks than allowed per order.', daily_drink_limit: "We've reached today's drink limit.", no_product: 'One of the items is no longer on the menu.',
    duplicate_name: 'An item with this name already exists.', bad_image: 'That photo link is not allowed.', bad_price: 'Please enter a price above ₱0.', bad_capacity: 'Please enter a capacity of 1 or more.', bad_category: 'Unknown category.',
    too_many_requests: 'Too many tries. Please wait a minute and try again.', day_closed: 'That day is already closed. Re-open it first to change it.', need_reason: 'Please write a short reason.', bad_day: 'That date is not allowed.', bad_amount: 'Please enter a valid amount.', bad_kind: 'Unknown entry type.', no_entry: 'That entry no longer exists.', not_admin: 'Your admin session expired. Please sign in again.', change_pin_first: 'Please change the default PIN first.', bad_value: 'That value is not allowed.', bad_status: 'That status change is not allowed.' };
  for (const k in map) if (m.includes(k)) return map[k];
  return m || 'Something went wrong. Please try again.';
}
// Run an admin-only server action with the session token.
async function adm(fn, args) {
  if (!SB()) return { error: { message: 'Not connected.' } };
  const { data, error } = await sbClient.rpc(fn, Object.assign({ p_token: adminToken }, args || {}));
  if (error) {
    const m = String(error.message || '');
    if (m.includes('not_admin')) adminSessionEnded();
    return { error: { code: error.code, message: friendlyErr(m) } };
  }
  return { data };
}
function adminSessionEnded() {
  adminToken = ''; isAdminAuthenticated = false;
  try { seenPending = null; clearUnseen(); } catch (e) {}
  try { sessionStorage.removeItem('bacha_admin_token'); } catch (e) {}
  if (SB()) { orders = []; try { localStorage.removeItem('bacha_fit_orders'); } catch (e) {} }
  try { if (!document.getElementById('admin-view').classList.contains('hidden')) switchView('store'); } catch (e) {}
  const b = document.getElementById('nav-admin-btn'); if (b) b.classList.toggle('hidden', !isAdminAuthenticated);
}
const DEFAULT_DAYOFF = "Our bakers are taking a well-deserved resting break! Pre-orders will resume for the next weekly batch.";
// Store mode is shared through Supabase (store_settings.store_mode) so customers see what the admin sets.
// localStorage is only the fallback when Supabase isn't configured.
let storeMode = isSupabaseConfigured ? 'open' : (localStorage.getItem('bacha_store_mode') || 'open');
let dayoffMessage = localStorage.getItem('bacha_dayoff_msg') || DEFAULT_DAYOFF;

const INITIAL_PRODUCTS = [
  { id: 1, name: "BACHA CLASSIC", price: 60, desc: "og choco chip cookie with milk and semi sweet chocolate, topped with seasalt", stock: 30, max_stock: 30, promo_tag: "", is_active: true, category: "Cookies", image: "images/classic.png" },
  { id: 2, name: "FIRESIDE S'MORES", price: 70, desc: "bacha classic with graham cracker, marshmallow, and hershey's chocolate", stock: 30, max_stock: 30, promo_tag: "Popular", is_active: true, category: "Cookies", image: "images/fireside.png" },
  { id: 3, name: "MIDNIGHT MALLOW", price: 65, desc: "dark and semi sweet chocolate with toasted marshmallow", stock: 30, max_stock: 30, promo_tag: "", is_active: true, category: "Cookies", image: "images/midnight.png" },
  { id: 4, name: "OREO DREAM", price: 65, desc: "oreo cookie with cookies and cream filling", stock: 30, max_stock: 30, promo_tag: "", is_active: true, category: "Cookies", image: "images/oreo.png" },
  { id: 5, name: "DOUBLE MATCHA", price: 65, desc: "matcha cookie with white chocolate and matcha filling", stock: 30, max_stock: 30, promo_tag: "Bestseller", is_active: true, category: "Cookies", image: "images/doublematcha.png" },
  { id: 6, name: "BERRYCHA", price: 65, desc: "strawberry cookie with white chocolate, dried strawberry chunks, and matcha filling", stock: 30, max_stock: 30, promo_tag: "", is_active: true, category: "Cookies", image: "images/berrycha.png" },
  { id: 7, name: "ICED MATCHA LATTE", price: 120, desc: "12 oz • ceremonial-style matcha, fresh milk & ice", stock: 15, max_stock: 15, promo_tag: "", is_active: true, category: "Drinks", image: "images/matcha.png" },
  { id: 8, name: "STRAWBERRY MATCHA", price: 135, desc: "12 oz • matcha over strawberry puree & milk", stock: 15, max_stock: 15, promo_tag: "", is_active: true, category: "Drinks", image: "images/berry.png" },
  { id: 9, name: "DIRTY MATCHA", price: 140, desc: "12 oz • matcha latte with a shot of espresso", stock: 15, max_stock: 15, promo_tag: "", is_active: true, category: "Drinks", image: "images/matcha.png" },
  { id: 10, name: "COCONUT MATCHA", price: 135, desc: "12 oz • matcha with coconut milk", stock: 15, max_stock: 15, promo_tag: "", is_active: true, category: "Drinks", image: "images/matcha.png" },
  { id: 11, name: "MANGO MATCHA", price: 135, desc: "12 oz • matcha over fresh mango puree", stock: 15, max_stock: 15, promo_tag: "", is_active: true, category: "Drinks", image: "images/matcha.png" },
  { id: 12, name: "BACHA TREAT BUNDLE", price: 150, desc: "special pastry bundle: 2 cookies + 1 pastry of the day", stock: 10, max_stock: 10, promo_tag: "Bundle", is_active: true, category: "Pastries", image: "images/cheesecake.png" }
];

let products = JSON.parse(localStorage.getItem('bacha_menu_v3')) || INITIAL_PRODUCTS;
let orders = isSupabaseConfigured ? [] : (JSON.parse(localStorage.getItem('bacha_fit_orders')) || []);   // with the database on, only a signed-in admin ever loads orders
try { if (isSupabaseConfigured) localStorage.removeItem('bacha_fit_orders'); } catch (e) {}
let customBox = [];
let cart = [];
let selectedBatchDate = "";
let newProductImageFile = null;

// Preloader Sequence
function initPreloader() {
  const bar = document.getElementById('preloader-bar');
  const preloader = document.getElementById('bacha-preloader');
  const t0 = Date.now();
  setTimeout(() => { if (bar) bar.style.width = '70%'; }, 200);
  const hide = () => {
    if (!preloader || preloader.dataset.hiding) return;
    preloader.dataset.hiding = '1';
    if (bar) bar.style.width = '100%';
    setTimeout(() => {
      preloader.classList.add('opacity-0', 'pointer-events-none');
      setTimeout(() => preloader.remove(), 500);
    }, 150);
  };
  const done = () => setTimeout(hide, Math.max(0, 500 - (Date.now() - t0)));
  if (document.readyState === 'complete') done(); else window.addEventListener('load', done);
  setTimeout(hide, 4000); // never block the shop longer than 4s
}

// Store Mode Controller (Open / Batch Closed / Day Off)
function applyStoreMode() {
  const overlay = document.getElementById('shop-closed-overlay');
  const badge = document.getElementById('closed-screen-badge');
  const title = document.getElementById('closed-screen-title');
  const msg = document.getElementById('closed-screen-msg');
  const icon = document.getElementById('closed-screen-icon');
  const statusBadge = document.getElementById('store-status-badge');

  const btnOpen = document.getElementById('btn-mode-open');
  const btnClosed = document.getElementById('btn-mode-closed');
  const btnDayOff = document.getElementById('btn-mode-dayoff');
  const effective = (storeMode === 'open' && isSoldOut()) ? 'sold_out' : storeMode;

  if (btnOpen && btnClosed && btnDayOff) {
    btnOpen.setAttribute('aria-pressed', storeMode === 'open'); btnClosed.setAttribute('aria-pressed', storeMode === 'batch_closed'); btnDayOff.setAttribute('aria-pressed', storeMode === 'day_off');
    btnOpen.className = storeMode === 'open' ? 'py-2 px-1 rounded-xl font-cute font-bold text-[12px] sm:text-[13px] bg-bacha-matcha text-white shadow-sm' : 'py-2 px-1 rounded-xl font-cute font-bold text-[12px] sm:text-[13px] bg-white text-bacha-text hover:bg-bacha-pinkLight border border-bacha-gingham';
    btnClosed.className = storeMode === 'batch_closed' ? 'py-2 px-1 rounded-xl font-cute font-bold text-[12px] sm:text-[13px] bg-rose-600 text-white shadow-sm' : 'py-2 px-1 rounded-xl font-cute font-bold text-[12px] sm:text-[13px] bg-white text-bacha-text hover:bg-bacha-pinkLight border border-bacha-gingham';
    btnDayOff.className = storeMode === 'day_off' ? 'py-2 px-1 rounded-xl font-cute font-bold text-[12px] sm:text-[13px] bg-amber-700 text-white shadow-sm' : 'py-2 px-1 rounded-xl font-cute font-bold text-[12px] sm:text-[13px] bg-white text-bacha-text hover:bg-bacha-pinkLight border border-bacha-gingham';
  }

  if (effective === 'open') {
    if (overlay) overlay.classList.add('hidden');
    if (statusBadge) {
      statusBadge.innerText = "Online & Open";
      statusBadge.className = "px-2.5 py-0.5 rounded-full text-[12px] font-cute font-bold bg-emerald-100 text-emerald-800";
    }
  } else if (effective === 'batch_closed') {
    if (overlay) overlay.classList.remove('hidden');
    if (icon) icon.innerText = "🌙";
    if (badge) {
      badge.innerText = "Batch Filled • Pre-Orders Closed";
      badge.className = "inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 font-cute text-sm font-bold";
    }
    if (title) title.innerText = "Pre-Orders Closed for This Batch";
    if (msg) msg.innerText = "Our ovens are currently full preparing this week's pre-orders. See you next weekly drop!";
    if (statusBadge) {
      statusBadge.innerText = "Batch Closed";
      statusBadge.className = "px-2.5 py-0.5 rounded-full text-[12px] font-cute font-bold bg-rose-100 text-rose-800";
    }
  } else if (effective === 'sold_out') {
    if (overlay) overlay.classList.remove('hidden');
    if (icon) icon.innerText = "🍪";
    if (badge) {
      badge.innerText = "Sold Out • Auto-Closed";
      badge.className = "inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 font-cute text-sm font-bold";
    }
    if (title) title.innerText = "We're Sold Out!";
    if (msg) msg.innerText = "Everything has been snapped up. Follow us for the next bake drop!";
    if (statusBadge) {
      statusBadge.innerText = "Sold Out (Auto-Closed)";
      statusBadge.className = "px-2.5 py-0.5 rounded-full text-[12px] font-cute font-bold bg-rose-100 text-rose-800";
    }
  } else if (effective === 'day_off') {
    if (overlay) overlay.classList.remove('hidden');
    if (icon) icon.innerText = "🏖️";
    if (badge) {
      badge.innerText = "Baker's Day Off • Store Resting";
      badge.className = "inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-cute text-sm font-bold";
    }
    if (title) title.innerText = "Our Bakers Are Taking a Rest Day!";
    if (msg) msg.innerText = dayoffMessage || DEFAULT_DAYOFF;
    if (statusBadge) {
      statusBadge.innerText = "Baker's Day Off";
      statusBadge.className = "px-2.5 py-0.5 rounded-full text-[12px] font-cute font-bold bg-amber-100 text-amber-800";
    }
  }
  updateMobileBar();
  renderCutoffBanner();
}

async function setStoreMode(mode) {
  storeMode = mode;
  localStorage.setItem('bacha_store_mode', mode);
  applyStoreMode();
  let failed = null;
  if (isSupabaseConfigured && sbClient) {
    const { error } = await adm('admin_set_setting', { p_key: 'store_mode', p_value: mode });
    if (error) { failed = error.message; console.error('store_mode save failed:', error); }
  }
  const label = mode.toUpperCase().replace('_', ' ');
  await showBachaAlert(failed
    ? `Changed to ${label} on this device only. It could not be saved for customers:\n${failed}`
    : `Store status changed to: ${label}${isSupabaseConfigured ? '\nCustomers see this right away.' : ''}`,
    failed ? "Not Saved" : "Store Status Updated", failed ? "⚠️" : "🏪");
}

// Custom Themed Alerts
function showBachaAlert(message, title = "Bacha Bakehouse", emoji = "🌸") {
  return new Promise(resolve => {
    const modal = document.getElementById('bacha-alert-modal');
    document.getElementById('bacha-alert-title').innerText = title;
    document.getElementById('bacha-alert-message').innerText = message;
    document.getElementById('bacha-alert-emoji').innerText = emoji;

    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.add('opacity-100', 'pointer-events-auto');

    const btn = document.getElementById('bacha-alert-btn');
    btn.onclick = () => {
      modal.classList.add('opacity-0', 'pointer-events-none');
      modal.classList.remove('opacity-100', 'pointer-events-auto');
      resolve();
    };
  });
}

function showBachaConfirm(message, title = "Please Confirm", emoji = "🍵") {
  return new Promise(resolve => {
    const modal = document.getElementById('bacha-confirm-modal');
    document.getElementById('bacha-confirm-title').innerText = title;
    document.getElementById('bacha-confirm-message').innerText = message;
    document.getElementById('bacha-confirm-emoji').innerText = emoji;

    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.add('opacity-100', 'pointer-events-auto');

    const okBtn = document.getElementById('bacha-confirm-ok');
    const cancelBtn = document.getElementById('bacha-confirm-cancel');

    okBtn.onclick = () => {
      modal.classList.add('opacity-0', 'pointer-events-none');
      modal.classList.remove('opacity-100', 'pointer-events-auto');
      resolve(true);
    };

    cancelBtn.onclick = () => {
      modal.classList.add('opacity-0', 'pointer-events-none');
      modal.classList.remove('opacity-100', 'pointer-events-auto');
      resolve(false);
    };
  });
}

// Supabase Sync
async function initSupabaseData() {
  if (!isSupabaseConfigured || !sbClient) return;

  try {
    const { data: prodData, error: prodErr } = await sbClient
      .from('products')
      .select('*')
      .order('id', { ascending: true });

    if (!prodErr && prodData && prodData.length > 0) {
      products = prodData.map(p => ({
        ...p,
        promo_tag: p.promo_tag || "",
        is_active: p.is_active !== undefined ? p.is_active : true
      }));
      localStorage.setItem('bacha_menu_v3', JSON.stringify(products));
      renderBoxBuilder();
      renderAdmin();
      renderCustomizeTab();
    }

    if (adminToken) {
      const { data: ordData, error: ordErr } = await adm('admin_list_orders', { p_limit: 5000, p_days: ordersDays });
      if (!ordErr && Array.isArray(ordData)) { const before = orders; orders = ordData; renderAdmin(); renderPOS(); if (typeof checkNewOrders === 'function') checkNewOrders(before); }
    } else {
      try { const { data: dt } = await sbClient.rpc('drinks_sold_today'); if (typeof dt === 'number') { serverDrinksToday = dt; renderBoxBuilder(); } } catch (e) {}
    }

    subscribeRealtime();

  } catch (err) {
    console.error("Supabase error:", err);
  }
}


function updateSelectedBatchDate(val) { selectedBatchDate = val; }

function saveState() {
  localStorage.setItem('bacha_menu_v3', JSON.stringify(products));
  if (!isSupabaseConfigured) localStorage.setItem('bacha_fit_orders', JSON.stringify(orders));
  updateLiveMetrics();
}

function triggerSmokePuff(targetElement) {
  if (!targetElement) return;
  const smokeCount = 10;
  const sparkleCount = 6;
  const particleGradients = [
    'radial-gradient(circle, rgba(255, 255, 255, 1) 0%, rgba(255, 182, 193, 0.85) 55%, rgba(255, 138, 158, 0) 100%)',
    'radial-gradient(circle, rgba(255, 255, 255, 1) 0%, rgba(221, 232, 217, 0.9) 55%, rgba(126, 159, 118, 0) 100%)',
    'radial-gradient(circle, rgba(255, 255, 255, 1) 0%, rgba(255, 250, 240, 0.95) 60%, rgba(255, 255, 255, 0) 100%)'
  ];

  for (let i = 0; i < smokeCount; i++) {
    const puff = document.createElement('div');
    puff.className = 'smoke-particle';
    const size = Math.floor(Math.random() * 18) + 22;
    puff.style.width = `${size}px`;
    puff.style.height = `${size}px`;
    puff.style.background = particleGradients[i % particleGradients.length];
    puff.style.boxShadow = '0 0 10px rgba(255, 255, 255, 0.6)';
    puff.style.left = `calc(50% - ${size/2}px)`;
    puff.style.top = `calc(50% - ${size/2}px)`;

    const angle = (Math.PI * 2 * i) / smokeCount + (Math.random() * 0.3 - 0.15);
    const distance = Math.random() * 32 + 22;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance * 0.7 - 8;

    puff.style.setProperty('--tx', `${tx}px`);
    puff.style.setProperty('--ty', `${ty}px`);
    puff.style.animationDelay = `${Math.random() * 0.05}s`;

    targetElement.appendChild(puff);
    setTimeout(() => puff.remove(), 750);
  }
}

