import sys; sys.path.insert(0,"/tmp/claude-0/work")
import asyncio, json, sys
from realh import *
from playwright.async_api import async_playwright
URL='file:///tmp/claude-0/work/site_p5/index.html'
RD=open('/tmp/claude-0/work/real_db.js').read()
PNG=bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082')
res=[]
def ok(n,c,x=''):
    res.append(c); print(('PASS' if c else 'FAIL'),n,x)
async def newpage(b,w=1280,h=800):
    ctx=await b.new_context(viewport={'width':w,'height':h},timezone_id='Asia/Manila')
    await ctx.expose_function('__py',py)
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('dialog',lambda d:asyncio.ensure_future(d.dismiss()))
    await pg.add_init_script(RD); await pg.goto(URL); await pg.wait_for_timeout(1200)
    return pg,errs
async def modal_ok(pg):
    # click through themed alert/confirm
    for _ in range(3):
        for sel in ['#bacha-confirm-modal:not(.pointer-events-none) #bacha-confirm-ok','#bacha-alert-modal:not(.pointer-events-none) #bacha-alert-btn']:
            try:
                el=pg.locator(sel)
                if await el.count() and await el.first.is_visible(): await el.first.click(); await pg.wait_for_timeout(200)
            except Exception as e: pass
async def main():
    reset_db()
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg,errs=await newpage(b)
        log=await pg.evaluate("window.__RPCLOG")
        ok('menu loaded from DB',await pg.evaluate("products.length")==12)
        ok('customer never fetched orders',('admin_list_orders' not in log) and await pg.evaluate("orders.length")==0)
        ok('no order cache',await pg.evaluate("localStorage.getItem('bacha_fit_orders')")is None)
        # checkout
        await pg.evaluate("""cart=[{boxId:'b1',kind:'box',name:'Custom Box of 6',batchDate:Object.keys(batchCutoffs)[0],items:[boxProducts()[0],boxProducts()[1],boxProducts()[1],boxProducts()[2],boxProducts()[3],boxProducts()[4]].map(p=>({id:p.id,name:p.name,price:1})),price:6}]; updateCartUI(); toggleCartDrawer(true)""")
        await pg.fill('#cust-name','Maria <img src=x onerror=window.__xss=1>'); await pg.fill('#cust-contact','0917 123 4567'); await pg.fill('#cust-note','Fri 2pm')
        await pg.set_input_files('#cust-receipt-file',{'name':'r.png','mimeType':'image/png','buffer':PNG})
        await pg.evaluate("(()=>{submitCustomerOrder();return 1})()")
        await pg.wait_for_timeout(2500)
        out,_=sh("select id,total_amount,status,receipt_url from orders",role=None); print(out)
        ok('order stored with SERVER total (cart price tampered to 6)', '|' in out and '|3' in out.replace('.00',''), out[:120])
        oid=out.split('|')[0]
        await modal_ok(pg)
        # tracking
        await pg.evaluate("(()=>{toggleTrackModal(true);return 1})()")
        await pg.fill('#track-id',oid); await pg.fill('#track-contact','09171234567')
        await pg.evaluate("(()=>{trackOrder();return 1})()"); await pg.wait_for_timeout(1200)
        t=await pg.inner_text('#track-result'); ok('track works',('received' in t) or ('Confirmed' in t),t[:80])
        await pg.fill('#track-contact','09990000000'); await pg.evaluate("(()=>{trackOrder();return 1})()"); await pg.wait_for_timeout(1200)
        t=await pg.inner_text('#track-result'); ok('track wrong phone denied',"couldn't find" in t,t[:60])
        # admin login
        await pg.evaluate("(()=>{toggleTrackModal(false);toggleAdminLoginModal(true);return 1})()")
        await pg.fill('#admin-password-input','0000'); await pg.evaluate("(()=>{handleAdminLogin();return 1})()"); await pg.wait_for_timeout(2200)
        e=await pg.inner_text('#admin-login-error'); ok('wrong pin message',('Incorrect' in e) and '4 tries' in e,e)
        await pg.fill('#admin-password-input','1234'); await pg.evaluate("(()=>{handleAdminLogin();return 1})()"); await pg.wait_for_timeout(1500)
        ok('forced PIN change shown',await pg.is_visible('#admin-force-panel'))
        await pg.fill('#force-pin-new','123456'); await pg.fill('#force-pin-confirm','123456'); await pg.evaluate("(()=>{handleForcedPinChange();return 1})()"); await pg.wait_for_timeout(1500)
        ok('weak pin refused','easy' in (await pg.inner_text('#force-pin-error')),await pg.inner_text('#force-pin-error'))
        await pg.fill('#force-pin-new','Bacha2026!'); await pg.fill('#force-pin-confirm','Bacha2026!'); await pg.evaluate("(()=>{handleForcedPinChange();return 1})()"); await pg.wait_for_timeout(2500)
        ok('admin view open',await pg.is_visible('#admin-view'))
        ok('orders loaded for admin',await pg.evaluate("orders.length")==1)
        ok('token in session only',bool(await pg.evaluate("sessionStorage.getItem('bacha_admin_token')")) and await pg.evaluate("localStorage.getItem('bacha_fit_orders')") is None)
        html=await pg.inner_html('#admin-view'); ok('XSS name escaped / no exec',(await pg.evaluate("window.__xss"))is None and '<img src=x' not in html)
        # confirm payment
        await pg.evaluate(f"(()=>{{verifyAndAcceptPayment('{oid}');return 1}})()"); await pg.wait_for_timeout(400); await modal_ok(pg); await pg.wait_for_timeout(1500); await modal_ok(pg)
        st,_=sh("select status from orders",role=None); ok('verified',st=='Payment Verified / Queued',st)
        await pg.evaluate(f"(()=>{{cancelOrder('{oid}');return 1}})()"); await pg.wait_for_timeout(400); await modal_ok(pg); await pg.wait_for_timeout(1500); await modal_ok(pg)
        st,_=sh("select status from orders",role=None); stock,_=sh("select stock from products where id=1",role=None)
        ok('cancel restocks',st=='Cancelled' and stock=='30',st+' '+stock)
        # POS
        await pg.evaluate("(()=>{posTicket=[{id:1,qty:2},{id:7,qty:1}];posPayment='GCash Counter';posCharge();return 1})()"); await pg.wait_for_timeout(1800); await modal_ok(pg)
        o,_=sh("select id,total_amount,status from orders where order_type='pos'",role=None); ok('POS recorded server-side',o.endswith('|240.00|Completed (POS)'),o)
        # inventory
        await pg.evaluate("(()=>{adjustInventory(2,-5);return 1})()"); await pg.wait_for_timeout(1000)
        s2,_=sh("select stock from products where id=2",role=None); ok('stock adjust',s2=='25',s2)
        # store mode
        await pg.evaluate("(()=>{setStoreMode('day_off');return 1})()"); await pg.wait_for_timeout(1000); await modal_ok(pg)
        sm,_=sh("select value from store_settings where key='store_mode'",role=None); ok('store mode saved',sm=='day_off',sm)
        await pg.evaluate("(()=>{setStoreMode('open');return 1})()"); await pg.wait_for_timeout(1000); await modal_ok(pg)
        # XSS in DB order
        sh("insert into orders(id,customer_name,contact_number,notes,boxes,items,status,order_type) values('X\\');window.__xss=2;//','<script>window.__xss=3</script>','09','<img src=x onerror=window.__xss=4>','[{\"name\":\"b\",\"items\":[\"<img src=x onerror=window.__xss=5>\"]}]','[{\"qty\":1,\"name\":\"<img src=x onerror=window.__xss=6>\",\"unit_price\":1}]','Payment Verification Required','online')",role=None)
        await pg.evaluate("(()=>{initSupabaseData();renderAdmin();return 1})()"); await pg.wait_for_timeout(1800)
        # click buttons of malicious order
        btns=pg.locator('#admin-view button[data-id]')
        n=await btns.count()
        if n:
            try: await btns.first.click(timeout=2000)
            except Exception as e: pass
        await pg.wait_for_timeout(600); await modal_ok(pg)
        ok('hostile DB rows do not run script',(await pg.evaluate("window.__xss"))is None,str(await pg.evaluate("window.__xss")))
        # logout and old token dead
        tok=await pg.evaluate("adminToken")
        await pg.evaluate("(()=>{adminLogout();return 1})()"); await pg.wait_for_timeout(1000)
        out,err=sh(f"select admin_list_orders({lit(tok)})"); ok('token dead after logout','not_admin' in err,err[:60])
        ok('orders wiped from page',await pg.evaluate("orders.length")==0)
        ok('no page errors',not errs,str(errs[:2]))
        await b.close()
    print('RESULT',sum(res),'/',len(res))
asyncio.run(main())
