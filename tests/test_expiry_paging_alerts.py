import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env import *
exec(open(HERE/'test_admin_tools_and_demo.py').read().split("async def login")[0])
AUDIO="""window.__osc=0;window.AudioContext=function(){return {state:'running',currentTime:0,destination:{},resume(){return Promise.resolve()},createOscillator(){window.__osc++;return {type:'',frequency:{value:0},connect(){},start(){},stop(){}}},createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}}}"""
async def newpage2(b):
    ctx=await b.new_context(viewport={'width':1280,'height':800},timezone_id='Asia/Manila')
    await ctx.expose_function('__py',py)
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.add_init_script(AUDIO+';\n'+RD); await pg.goto(URL); await pg.wait_for_timeout(1200)
    return pg,errs
async def main():
    reset_db()
    sh("update admin_settings set pin_hash=extensions.crypt('Bacha2026!', extensions.gen_salt('bf')), pin_changed=true; delete from store_settings where key='store_mode'",role=None)
    sh("""insert into orders(id,customer_name,contact_number,notes,boxes,items,status,order_type,created_at,receipt_url,total_amount) values
 ('G-OLD','Gina','09171112222','n','[]','[]','Payment Verification Required','online',now()-interval '30 hours','https://x/r.png',100),
 ('G-NEW','Nina','09171112223','n','[]','[]','Payment Verification Required','online',now()-interval '1 hour','https://x/r.png',100),
 ('C-OLD','Cora','09171112224','n','[]','[{"id":1,"qty":3,"name":"BACHA CLASSIC","unit_price":60}]','COD - Awaiting Confirmation','online',now()-interval '26 hours',null,180),
 ('DONE-60','Dan','09171112225','n','[]','[]','Completed','online',now()-interval '60 days',null,50)""",role=None)
    sh("update products set stock=27 where id=1",role=None)
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg,errs=await newpage2(b)
        await pg.evaluate("(()=>{toggleAdminLoginModal(true);return 1})()")
        await pg.fill('#admin-password-input','Bacha2026!'); await pg.evaluate("(()=>{handleAdminLogin();return 1})()"); await pg.wait_for_timeout(2500)
        ids=await pg.evaluate("orders.map(o=>o.id).sort().join(',')")
        ok('default window hides 60-day-old finished order, shows open ones',ids=='C-OLD,G-NEW,G-OLD',ids)
        r,_=sh("select status||'|'||coalesce(status_note,'') from orders where id='C-OLD'",role=None); ok('COD >24h auto-cancelled',r.startswith('Cancelled|Auto-cancelled'),r)
        s1,_=sh("select stock from products where id=1",role=None); ok('auto-cancel restocked 3',s1=='30',s1)
        g,_=sh("select status from orders where id='G-OLD'",role=None); ok('GCash 30h NOT cancelled',g=='Payment Verification Required',g)
        html=await pg.inner_html('#admin-orders-list')
        ok('overdue badge on old GCash only',html.count('⏰ Waiting')==1 and 'Waiting 30h' in html or 'Waiting 31h' in html,str(html.count('⏰ Waiting')))
        ok('auto-cancel note shown','Auto-cancelled' in html)
        ok('history note shown','Load older orders' in await pg.inner_html('#orders-more'))
        await pg.evaluate("(()=>{loadOlderOrders();return 1})()"); await pg.wait_for_timeout(1500)
        ok('Load older brings 60-day order',await pg.evaluate("orders.some(o=>o.id==='DONE-60')"))
        # export covers old range
        await pg.evaluate("(()=>{ordersDays=30;return 1})()"); await pg.evaluate("(()=>{initSupabaseData();return 1})()"); await pg.wait_for_timeout(1200)
        await pg.evaluate("(()=>{document.getElementById('export-from').value='2020-01-01';document.getElementById('export-all').checked=true;exportOrdersCSV();return 1})()"); await pg.wait_for_timeout(2000)
        ok('export auto-loads older history',await pg.evaluate("orders.some(o=>o.id==='DONE-60')"))
        # alerts
        ok('alerts off by default',(await pg.inner_text('#alerts-btn'))=='🔕 Alerts off')
        await pg.evaluate("(()=>{toggleAlerts();return 1})()"); await pg.wait_for_timeout(500)
        ok('alerts on',(await pg.inner_text('#alerts-btn'))=='🔔 Alerts on')
        osc0=await pg.evaluate("window.__osc")
        sh("insert into orders(id,customer_name,contact_number,notes,boxes,items,status,order_type,total_amount) values('NEW-1','Zed','09170000001','n','[]','[]','Payment Verification Required','online',10)",role=None)
        await pg.evaluate("(()=>{initSupabaseData();return 1})()"); await pg.wait_for_timeout(1500)
        osc1=await pg.evaluate("window.__osc"); ok('chime plays for new order',osc1>osc0 and osc1-osc0==3,f'{osc0}->{osc1}')
        t=await pg.title(); ok('title shows count','(1 new)' in t,t)
        await pg.evaluate("(()=>{initSupabaseData();return 1})()"); await pg.wait_for_timeout(1200)
        ok('no repeat chime for same order',await pg.evaluate("window.__osc")==osc1)
        await pg.evaluate("(()=>{window.dispatchEvent(new Event('focus'));return 1})()"); ok('title clears on focus',(await pg.title())==await pg.evaluate("baseTitle"))
        ok('no page errors',not errs,str(errs[:2]))
        await b.close()
    print('RESULT',sum(res),'/',len(res))
asyncio.run(main())
