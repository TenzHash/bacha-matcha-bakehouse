import sys; sys.path.insert(0,"/tmp/claude-0/work")
exec(open('t5b.py').read().split("async def main")[0])
async def login(pg):
    await pg.evaluate("(()=>{toggleAdminLoginModal(true);return 1})()")
    await pg.fill('#admin-password-input','Bacha2026!'); await pg.evaluate("(()=>{handleAdminLogin();return 1})()"); await pg.wait_for_timeout(1800)
async def main():
    reset_db()
    sh("update admin_settings set pin_hash=extensions.crypt('Bacha2026!', extensions.gen_salt('bf')), pin_changed=true",role=None)
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg,errs=await newpage(b)
        await login(pg); ok('login (no forced change once changed)',await pg.is_visible('#admin-view') and not await pg.is_visible('#admin-force-panel'))
        # new product via UI function
        await pg.evaluate("(()=>{toggleAddProductModal(true);return 1})()")
        await pg.fill('#add-prod-name','Test <b>Cookie</b>'); await pg.fill('#add-prod-price','55'); await pg.fill('#add-prod-max','8'); await pg.fill('#add-prod-desc','tasty')
        await pg.set_input_files('#add-prod-file',{'name':'p.png','mimeType':'image/png','buffer':PNG})
        await pg.evaluate("(()=>{submitNewProduct();return 1})()"); await pg.wait_for_timeout(2500); await modal_ok(pg)
        r,_=sh("select id,name,price,stock,image from products where id>12",role=None); ok('product created server-side',r.startswith('13|TEST <B>COOKIE</B>|55.00|8|https://'),r[:90])
        # edit price
        await pg.evaluate("(()=>{renderCustomizeTab();return 1})()")
        await pg.evaluate("(()=>{document.getElementById('edit-price-13').value='70';saveAllProductCustomizations();return 1})()"); await pg.wait_for_timeout(2500); await modal_ok(pg)
        r,_=sh("select price from products where id=13",role=None); ok('edit price saved',r=='70.00',r)
        await pg.evaluate("(()=>{saveAllProductChanges&&saveAllProductChanges();return 1})()") if False else None
        # toggle active, delete
        await pg.evaluate("(()=>{toggleProductActiveStatus(13);return 1})()"); await pg.wait_for_timeout(900)
        r,_=sh("select is_active from products where id=13",role=None); ok('toggle active',r=='f',r)
        await pg.evaluate("(()=>{deleteProduct(13);return 1})()"); await pg.wait_for_timeout(500); await modal_ok(pg); await pg.wait_for_timeout(1000); await modal_ok(pg)
        r,_=sh("select count(*) from products where id=13",role=None); ok('delete product',r=='0',r)
        # restock all / refill
        sh("update products set stock=1",role=None)
        await pg.evaluate("(()=>{restockAllOvens(5);return 1})()"); await pg.wait_for_timeout(1500)
        r,_=sh("select min(stock),max(stock) from products",role=None); ok('restock all',r=='6|6',r)
        await pg.evaluate("(()=>{resetDefaultInventory();return 1})()"); await pg.wait_for_timeout(500); await modal_ok(pg); await pg.wait_for_timeout(1200); await modal_ok(pg)
        r,_=sh("select count(*) from products where stock<>max_stock",role=None); ok('refill all',r=='0',r)
        # settings
        await pg.evaluate("(()=>{setDisplayMode('box');return 1})()"); await pg.wait_for_timeout(900); await modal_ok(pg)
        r,_=sh("select value from store_settings where key='display_mode'",role=None); ok('display mode',r=='box',r)
        await pg.evaluate("(()=>{saveAppConfig();return 1})()"); await pg.wait_for_timeout(900); await modal_ok(pg)
        r,_=sh("select value from store_settings where key='app_config'",role=None); ok('app config saved',r.startswith('{'),r[:60])
        await pg.evaluate("(()=>{saveDeadlineSettings&&saveDeadlineSettings();return 1})()") if False else None
        # PIN change from tab
        await pg.evaluate("(()=>{document.getElementById('current-pin-input').value='Bacha2026!';document.getElementById('new-pin-input').value='Newer#2026';document.getElementById('confirm-pin-input').value='Newer#2026';return 1})()")
        await pg.evaluate("(()=>{handlePinReset();return 1})()"); await pg.wait_for_timeout(1800); await modal_ok(pg)
        r,_=sh("select pin_hash=extensions.crypt('Newer#2026',pin_hash) from admin_settings",role=None); ok('PIN tab change',r=='t',r)
        # expiry: kill sessions server-side, then act
        sh("delete from admin_sessions",role=None)
        await pg.evaluate("(()=>{adjustInventory(1,1);return 1})()"); await pg.wait_for_timeout(1200); await modal_ok(pg)
        ok('expired session kicks admin out',not await pg.is_visible('#admin-view') and await pg.evaluate("adminToken")=='' )
        # closed store blocks order server-side even if page forced
        sh("update store_settings set value='day_off' where key='store_mode'",role=None) if False else sh("insert into store_settings values('store_mode','day_off') on conflict (key) do update set value='day_off'",role=None)
        r,e=sh("select place_order('{\"name\":\"A\",\"contact\":\"09171234567\",\"notes\":\"n\",\"payment_method\":\"COD\",\"fulfillment\":\"delivery\",\"delivery_address\":\"a\",\"maps_link\":\"http://m\",\"items\":[{\"id\":1,\"qty\":1}]}')")
        ok('closed store refuses direct call','store_closed' in e,e[:50])
        # direct table abuse with the page's own client
        r=await pg.evaluate("(async()=>{const c=window.supabase.createClient();const a=await c.from('orders').insert([{id:'Z'}]);return a.error&&a.error.message})()")
        ok('client direct insert refused','denied' in (r or ''),r)
        ok('no page errors',not errs,str(errs[:2]))
        await b.close()
    # offline / demo mode (no database)
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':1280,'height':800},timezone_id='Asia/Manila'); pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.add_init_script("window.supabase={createClient(){throw new Error('offline')}}"); await pg.goto(URL); await pg.wait_for_timeout(900)
        ok('demo mode: not configured',await pg.evaluate("isSupabaseConfigured")==False)
        await pg.evaluate("(()=>{toggleAdminLoginModal(true);return 1})()"); await pg.fill('#admin-password-input','1234'); await pg.evaluate("(()=>{handleAdminLogin();return 1})()"); await pg.wait_for_timeout(800)
        ok('demo mode admin opens',await pg.is_visible('#admin-view'))
        await pg.evaluate("(()=>{posTicket=[{id:1,qty:2}];posPayment='Cash Walk-in';posCharge();return 1})()"); await pg.wait_for_timeout(800); await modal_ok(pg)
        ok('demo mode POS works',await pg.evaluate("orders.length")==1 and await pg.evaluate("products.find(p=>p.id==1).stock")==28)
        ok('demo no errors',not errs,str(errs[:2])); await b.close()
    print('RESULT',sum(res),'/',len(res))
asyncio.run(main())
