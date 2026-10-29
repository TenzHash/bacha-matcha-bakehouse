/* Part 9B: use a feedback coupon at checkout.
   Everything coupon-related for the customer lives here. The only other changes are small hooks in
   02-storefront.js (send the code with the order) and the coupon box in shop.html. */

let appliedCoupon = null;   // { code, kind, value } once the server has accepted it

// ---- money maths (preview only - the server works out the real discount) ----
function cartSubtotal() { return cart.reduce((t, c) => t + c.price, 0); }
function couponOff(sub) {
  if (!appliedCoupon) return 0;
  const raw = appliedCoupon.kind === 'percent' ? Math.round(sub * Number(appliedCoupon.value)) / 100 : Number(appliedCoupon.value);
  return Math.min(Math.max(sub, 0), Math.round(raw * 100) / 100);
}
const cpnPeso = n => '₱' + (Math.round(n * 100) / 100).toString();

// ---- messages ----
const COUPON_MSG = {
  coupon_invalid: "That coupon code wasn't found. Please check it and try again.",
  coupon_used: 'That coupon has already been used.',
  coupon_expired: 'That coupon has expired.'
};
(function () {   // add the three coupon messages to the shop's existing error wording
  const base = friendlyErr;
  friendlyErr = function (m) {
    m = String(m || '');
    for (const k in COUPON_MSG) if (m.includes(k)) return COUPON_MSG[k];
    return base(m);
  };
})();

// ---- the box in the bag ----
function couponEls() {
  return { box: document.getElementById('coupon-box'), input: document.getElementById('cust-coupon'), btn: document.getElementById('coupon-apply-btn'),
           msg: document.getElementById('coupon-msg'), line: document.getElementById('coupon-total-line'), total: document.getElementById('cart-total-price') };
}
function couponMsg(text, kind) {
  const { msg } = couponEls(); if (!msg) return;
  msg.textContent = text || ''; msg.className = 'cpn-msg' + (kind ? ' cpn-' + kind : '');
}
function renderCoupon() {
  const e = couponEls(); if (!e.box) return;
  e.box.classList.toggle('hidden', !SB());            // coupons need the online shop (Supabase)
  const sub = cartSubtotal(), off = couponOff(sub);
  if (appliedCoupon) {
    e.input.value = appliedCoupon.code; e.input.readOnly = true;
    e.btn.textContent = 'Remove'; e.btn.setAttribute('aria-label', 'Remove coupon');
    e.line.classList.remove('hidden');
    e.line.innerHTML = `<span>Subtotal ${esc(cpnPeso(sub))}</span><span>🎟️ ${esc(appliedCoupon.code)} −${esc(cpnPeso(off))}</span>`;
    e.total.innerText = cpnPeso(sub - off);
    couponMsg(appliedCoupon.kind === 'percent' ? `${Number(appliedCoupon.value)}% off applied.` : `${cpnPeso(Number(appliedCoupon.value))} off applied.`, 'ok');
  } else {
    e.input.readOnly = false; e.btn.textContent = 'Apply'; e.btn.removeAttribute('aria-label');
    e.line.classList.add('hidden'); e.line.innerHTML = '';
    e.total.innerText = cpnPeso(sub);
  }
}
function clearCoupon(msg) { appliedCoupon = null; const e = couponEls(); if (e.input) e.input.value = ''; renderCoupon(); couponMsg(msg || '', msg ? 'err' : ''); }

async function applyOrRemoveCoupon() {
  const e = couponEls();
  if (appliedCoupon) { clearCoupon(); return; }
  const code = e.input.value.trim();
  if (!code) { couponMsg('Type your coupon code first.', 'err'); e.input.focus(); return; }
  if (!SB()) { couponMsg('Coupons need the online shop.', 'err'); return; }
  e.btn.disabled = true; couponMsg('Checking...', '');
  try {
    const { data, error } = await sbClient.rpc('check_coupon', { p_code: code });
    if (error) { couponMsg(friendlyErr(error.message), 'err'); return; }
    if (!data || !data.ok) { couponMsg(friendlyErr(data && data.reason), 'err'); return; }
    appliedCoupon = { code: data.code, kind: data.kind, value: Number(data.value) };
    // one extra sentence on the "order received" pop-up
function couponSuccessNote(o) {
  const el = document.getElementById('order-success-sub'); if (!el) return;
  el.innerText += ` Coupon ${o.coupon_code} took off ${cpnPeso(Number(o.coupon_discount))}. Your total is ${cpnPeso(Number(o.total_amount))}.`;
}

renderCoupon();
  } catch (err) {
    couponMsg('Could not check the coupon. Please try again.', 'err');
  } finally { e.btn.disabled = false; }
}

// the cart total is redrawn by updateCartUI(): keep the coupon line in step with every cart change
(function () {
  const base = updateCartUI;
  updateCartUI = function () { const r = base.apply(this, arguments); try { renderCoupon(); } catch (e) {} return r; };
})();

// Enter in the coupon box = Apply (and never submits anything else)
document.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && ev.target && ev.target.id === 'cust-coupon') { ev.preventDefault(); applyOrRemoveCoupon(); }
});

// ---- hooks used by submitCustomerOrder() in 02-storefront.js ----
// the server said no to the coupon (used / expired / not found): drop it so the customer can fix the bag and retry
function couponOrderRefused(reasonOrMessage) {
  const text = friendlyErr(reasonOrMessage);
  clearCoupon(text);
  return text;
}
// after a successful order the coupon is spent
function couponOrderPlaced() { appliedCoupon = null; const e = couponEls(); if (e.input) e.input.value = ''; couponMsg('', ''); renderCoupon(); }

// one extra sentence on the "order received" pop-up
function couponSuccessNote(o) {
  const el = document.getElementById('order-success-sub'); if (!el) return;
  el.innerText += ` Coupon ${o.coupon_code} took off ${cpnPeso(Number(o.coupon_discount))}. Your total is ${cpnPeso(Number(o.total_amount))}.`;
}

renderCoupon();
