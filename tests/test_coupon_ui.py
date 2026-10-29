#!/usr/bin/env python3
"""Part 9B browser test: coupon box in the bag. Needs only Python + playwright + chromium (no database).
It replaces the Supabase library with a tiny in-page stand-in that behaves like check_coupon / place_order_coupon
(same answers as supabase_coupons.sql), so this checks the SCREEN logic only, not the SQL.
Run:  python3 tests/test_coupon_ui.py"""
import asyncio, os, pathlib, subprocess, sys, time, socket
from playwright.async_api import async_playwright
ROOT = pathlib.Path(os.environ.get('BACHA_SITE', pathlib.Path(__file__).resolve().parent.parent))
OUT = pathlib.Path(os.environ.get('BACHA_OUT', '/tmp/bacha_coupon_out')); OUT.mkdir(parents=True, exist_ok=True)
PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082')

FAKE = r"""
(function () {
  window.__RPC = []; window.__COUPONS = {
    'BACHA-TENOFF': { code: 'BACHA-TENOFF', kind: 'percent', value: 10, used: false, expired: false },
    'BACHA-FIFTY1': { code: 'BACHA-FIFTY1', kind: 'amount', value: 50, used: false, expired: false },
    'BACHA-OLDONE': { code: 'BACHA-OLDONE', kind: 'percent', value: 10, used: false, expired: true },
    'BACHA-USED11': { code: 'BACHA-USED11', kind: 'percent', value: 10, used: true, expired: false }
  };
  const norm = t => String(t || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const find = t => Object.values(window.__COUPONS).find(c => norm(c.code) === norm(t));
  const off = (k, v, s) => Math.min(s, k === 'percent' ? Math.round(s * v) / 100 : v);
  const subtotal = p => {
    let t = 0;
    (p.boxes || []).forEach(b => b.item_ids.forEach(id => { t += products.find(x => x.id == id).price; }));
    (p.items || []).forEach(i => { t += products.find(x => x.id == i.id).price * i.qty; });
    return t;
  };
  const placeOrder = p => ({ id: 'BOX-' + (1000 + window.__RPC.filter(r => r.fn.startsWith('place_order')).length), total: subtotal(p), status: 'Payment Verification Required' });
  const rpc = async (fn, args) => {
    window.__RPC.push({ fn, args: JSON.parse(JSON.stringify(args || {})) });
    if (fn === 'drinks_sold_today') return { data: 0, error: null };
    if (fn === 'check_coupon') {
      const c = find(args.p_code);
      if (!c) return { data: { ok: false, reason: 'coupon_invalid' }, error: null };
      if (c.used) return { data: { ok: false, reason: 'coupon_used' }, error: null };
      if (c.expired) return { data: { ok: false, reason: 'coupon_expired' }, error: null };
      return { data: { ok: true, code: c.code, kind: c.kind, value: c.value, note: '' }, error: null };
    }
    if (fn === 'place_order') return { data: placeOrder(args.p), error: null };
    if (fn === 'place_order_coupon') {
      const c = find(args.p.coupon);
      if (!c) return { data: { coupon_error: 'coupon_invalid' }, error: null };
      if (c.used) return { data: { coupon_error: 'coupon_used' }, error: null };
      if (c.expired) return { data: { coupon_error: 'coupon_expired' }, error: null };
      const r = placeOrder(args.p), d = off(c.kind, c.value, r.total); c.used = true;
      return { data: Object.assign({}, r, { subtotal: r.total, discount: d, total: r.total - d, coupon: c.code }), error: null };
    }
    return { data: null, error: null };
  };
  const q = { select() { return q; }, order() { return Promise.resolve({ data: null, error: null }); } };
  window.supabase = { createClient: () => ({
    rpc, from: () => q,
    channel: () => { const ch = { on() { return ch; }, subscribe() { return ch; } }; return ch; }, removeChannel() {},
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: n => ({ data: { publicUrl: 'https://x.supabase.co/storage/v1/object/public/gcash-receipts/' + n } }), remove: async () => ({}) }) }
  }) };
})();
"""
res = []
def ok(name, cond, extra=''):
    res.append(bool(cond)); print(('PASS' if cond else 'FAIL'), name, extra)

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

async def modal_ok(pg):
    for _ in range(3):
        for sel in ['#bacha-confirm-modal:not(.pointer-events-none) #bacha-confirm-ok', '#bacha-alert-modal:not(.pointer-events-none) #bacha-alert-btn']:
            el = pg.locator(sel)
            if await el.count() and await el.first.is_visible():
                await el.first.click(); await pg.wait_for_timeout(200)

async def alert_text(pg):
    el = pg.locator('#bacha-alert-modal:not(.pointer-events-none)')
    return (await el.first.inner_text()) if await el.count() else ''

async def main():
    port = free_port()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    URL = f'http://127.0.0.1:{port}/shop.html'
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            for (w, h, tag) in [(1280, 800, 'desktop'), (375, 740, 'phone')]:
                ctx = await b.new_context(viewport={'width': w, 'height': h}, timezone_id='Asia/Manila')
                await ctx.route('**/vendor/supabase.js', lambda r: r.fulfill(body=FAKE, content_type='application/javascript'))
                await ctx.route('**/fonts.googleapis.com/**', lambda r: r.abort()); await ctx.route('**/fonts.gstatic.com/**', lambda r: r.abort())
                pg = await ctx.new_page(); errs = []
                pg.on('pageerror', lambda e: errs.append(str(e)))
                await pg.goto(URL, wait_until='domcontentloaded'); await pg.wait_for_timeout(1500)
                print('---', tag)
                # a box of 6 (first 6 cookie flavours) + one drink
                await pg.evaluate("""() => { const cs = boxProducts(); const d = products.find(p => catOf(p) === 'Drinks');
                  cart = [{ boxId: 'b1', kind: 'box', name: 'Custom Box of 6', batchDate: Object.keys(batchCutoffs)[0], items: [cs[0], cs[1], cs[1], cs[2], cs[3], cs[4]].map(x => ({ id: x.id, name: x.name, price: x.price, image: x.image })),
                    price: [cs[0], cs[1], cs[1], cs[2], cs[3], cs[4]].reduce((s, x) => s + x.price, 0) }];
                  window.__box = cart[0].price; window.__drink = d; updateCartUI(); toggleCartDrawer(true); }""")
                box = await pg.evaluate("window.__box")
                total_txt = lambda: pg.inner_text('#cart-total-price')
                ok('coupon box is shown in the bag', await pg.locator('#coupon-box').is_visible())
                ok('no discount line before a coupon', not await pg.locator('#coupon-total-line').is_visible())
                ok('total starts as the full price', await total_txt() == f'₱{box}', await total_txt())

                # empty / wrong codes
                await pg.click('#coupon-apply-btn')
                ok('empty code asks for a code', 'Type your coupon' in await pg.inner_text('#coupon-msg'))
                await pg.fill('#cust-coupon', 'bacha-nope99'); await pg.click('#coupon-apply-btn'); await pg.wait_for_timeout(300)
                ok('unknown code is refused', "wasn't found" in await pg.inner_text('#coupon-msg'))
                await pg.fill('#cust-coupon', 'BACHA-USED11'); await pg.click('#coupon-apply-btn'); await pg.wait_for_timeout(300)
                ok('used code is refused', 'already been used' in await pg.inner_text('#coupon-msg'))
                await pg.fill('#cust-coupon', 'BACHA-OLDONE'); await pg.click('#coupon-apply-btn'); await pg.wait_for_timeout(300)
                ok('expired code is refused', 'expired' in await pg.inner_text('#coupon-msg'))
                ok('refused codes change nothing', await total_txt() == f'₱{box}')

                # a good percent code (typed lower-case with spaces: server normalises)
                await pg.fill('#cust-coupon', ' bacha tenoff '); await pg.press('#cust-coupon', 'Enter'); await pg.wait_for_timeout(300)
                want = round(box - box * 10 / 100, 2); want_s = f'₱{int(want) if want == int(want) else want}'
                ok('10% code lowers the total', await total_txt() == want_s, f'{await total_txt()} vs {want_s}')
                ok('discount line is shown', await pg.locator('#coupon-total-line').is_visible() and 'BACHA-TENOFF' in await pg.inner_text('#coupon-total-line'), await pg.inner_text('#coupon-total-line'))
                ok('input locked and button says Remove', await pg.get_attribute('#cust-coupon', 'readonly') is not None and (await pg.inner_text('#coupon-apply-btn')) == 'Remove')
                # cart changes -> discount follows
                await pg.evaluate("() => { addSingleToCart(window.__drink.id); }")
                sub2 = await pg.evaluate("cartSubtotal()"); want2 = round(sub2 - sub2 * 10 / 100, 2)
                ok('adding a drink re-does the discount', abs(float((await total_txt())[1:]) - want2) < 0.01, f'{await total_txt()} vs {want2}')
                # remove coupon
                await pg.click('#coupon-apply-btn')
                ok('Remove brings back the full total', await total_txt() == f'₱{sub2}' and not await pg.locator('#coupon-total-line').is_visible())
                ok('input is editable again', await pg.get_attribute('#cust-coupon', 'readonly') is None)

                # --- order WITH coupon (amount type) ---
                await pg.evaluate("() => { cart = cart.filter(c => c.kind === 'box'); updateCartUI(); }")
                await pg.fill('#cust-coupon', 'BACHA-FIFTY1'); await pg.click('#coupon-apply-btn'); await pg.wait_for_timeout(300)
                ok('amount coupon lowers the total by 50', await total_txt() == f'₱{box - 50}', await total_txt())
                await pg.fill('#cust-name', 'Maria Test'); await pg.fill('#cust-contact', '0917 123 4567'); await pg.fill('#cust-note', 'Fri 2pm')
                await pg.set_input_files('#cust-receipt-file', {'name': 'r.png', 'mimeType': 'image/png', 'buffer': PNG})
                await pg.screenshot(path=str(OUT / f'{tag}_bag_with_coupon.png'))
                await pg.evaluate("(() => { submitCustomerOrder(); return 1 })()"); await pg.wait_for_timeout(2500)
                log = await pg.evaluate('window.__RPC')
                po = [r for r in log if r['fn'] == 'place_order_coupon']
                ok('order sent through place_order_coupon with the code', len(po) == 1 and po[0]['args']['p']['coupon'] == 'BACHA-FIFTY1')
                ok('plain place_order not used for it', not [r for r in log if r['fn'] == 'place_order'])
                sub = await pg.inner_text('#order-success-sub')
                ok('success pop-up mentions the coupon and new total', 'BACHA-FIFTY1' in sub and f'₱{box - 50}' in sub, sub)
                ok('bag emptied and coupon cleared', await pg.evaluate('cart.length') == 0 and await pg.evaluate('appliedCoupon') is None and await pg.input_value('#cust-coupon') == '')
                await pg.screenshot(path=str(OUT / f'{tag}_success.png'))
                await pg.evaluate("toggleOrderSuccess(false)")

                # --- same coupon again is now used ---
                await pg.evaluate("""() => { const cs = boxProducts(); cart = [{ boxId: 'b2', kind: 'box', name: 'Custom Box of 6', batchDate: Object.keys(batchCutoffs)[0], items: cs.slice(0, 6).map(x => ({ id: x.id, name: x.name, price: x.price, image: x.image })), price: cs.slice(0, 6).reduce((s, x) => s + x.price, 0) }]; updateCartUI(); toggleCartDrawer(true); }""")
                await pg.fill('#cust-coupon', 'BACHA-FIFTY1'); await pg.click('#coupon-apply-btn'); await pg.wait_for_timeout(300)
                ok('spent coupon cannot be applied again', 'already been used' in await pg.inner_text('#coupon-msg'))

                # --- coupon gets spent elsewhere AFTER it was applied: order is refused, coupon dropped, bag kept ---
                await pg.fill('#cust-coupon', 'BACHA-TENOFF'); await pg.click('#coupon-apply-btn'); await pg.wait_for_timeout(300)
                await pg.evaluate("window.__COUPONS['BACHA-TENOFF'].used = true")
                await pg.fill('#cust-name', 'Maria Test'); await pg.fill('#cust-contact', '0917 123 4567'); await pg.fill('#cust-note', 'Fri 2pm')
                await pg.set_input_files('#cust-receipt-file', {'name': 'r.png', 'mimeType': 'image/png', 'buffer': PNG})
                await pg.evaluate("(() => { submitCustomerOrder(); return 1 })()"); await pg.wait_for_timeout(2500)
                txt = await alert_text(pg)
                ok('late-used coupon: customer is told, order not placed', 'already been used' in txt and 'not placed' in txt, txt.replace('\n', ' ')[:120])
                await modal_ok(pg)
                ok('coupon dropped but bag kept', await pg.evaluate('appliedCoupon') is None and await pg.evaluate('cart.length') == 1)
                ok('full price again in the total', await total_txt() == f'₱{await pg.evaluate("cartSubtotal()")}')

                # --- order WITHOUT coupon still uses the original place_order ---
                await pg.fill('#cust-name', 'Maria Test'); await pg.fill('#cust-contact', '0917 123 4567'); await pg.fill('#cust-note', 'Fri 2pm')
                await pg.set_input_files('#cust-receipt-file', {'name': 'r.png', 'mimeType': 'image/png', 'buffer': PNG})
                await pg.evaluate("(() => { submitCustomerOrder(); return 1 })()"); await pg.wait_for_timeout(2500)
                log = await pg.evaluate('window.__RPC')
                ok('no coupon -> original place_order, no coupon field', [r for r in log if r['fn'] == 'place_order'] and 'coupon' not in [r for r in log if r['fn'] == 'place_order'][-1]['args']['p'])
                ok('no coupon note on the success pop-up', 'Coupon' not in await pg.inner_text('#order-success-sub'))

                # layout
                over = await pg.evaluate("""() => { const p = document.getElementById('cart-panel'); return p.scrollWidth - p.clientWidth; }""")
                ok('bag panel does not scroll sideways', over <= 1, str(over))
                ok('no JavaScript errors', not errs, str(errs[:3]))
                await ctx.close()
            await b.close()
    finally:
        srv.terminate()
    print('RESULT', sum(res), '/', len(res), 'passed')
    sys.exit(0 if all(res) else 1)
asyncio.run(main())
