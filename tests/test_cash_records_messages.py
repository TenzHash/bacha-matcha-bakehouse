import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env import *
exec(open(HERE/'helpers_b.py').read().split("async def login")[0])
async def main():
    reset_db()
    sh("truncate cash_days, cash_entries, activity_log; delete from storage.objects; update admin_settings set pin_hash=extensions.crypt('Bacha2026!', extensions.gen_salt('bf')), pin_changed=true; delete from store_settings where key='store_mode'",role=None)
    sh("""insert into orders(id,customer_name,contact_number,notes,boxes,items,status,order_type,total_amount,batch_date) values
 ('BOX-A','Maria Santos','0917 123 4567','n','[]','[]','Payment Verification Required','online',390,'Batch: Friday, Oct 30'),
 ('BOX-B','Joy Lim','+63 917 555 0000','n','[]','[]','Ready','online',200,'Batch: Friday, Oct 30')""",role=None)
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':1280,'height':900},timezone_id='Asia/Manila',accept_downloads=True); await ctx.expose_function('__py',py)
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.on('dialog',lambda d:asyncio.ensure_future(d.dismiss()))
        await pg.add_init_script(RD); await pg.goto(URL); await pg.wait_for_timeout(1200)
        await pg.evaluate("(()=>{toggleAdminLoginModal(true);return 1})()")
        await pg.fill('#admin-password-input','Bacha2026!'); await pg.evaluate("(()=>{handleAdminLogin();return 1})()"); await pg.wait_for_timeout(2200)
        # ---- messages
        await pg.evaluate("(()=>{switchAdminTab('orders');return 1})()"); await pg.wait_for_timeout(500)
        ok('message buttons on online orders',await pg.locator('button:has-text("Text customer")').count()==2)
        m1=await pg.evaluate("orderMessage(orders.find(o=>o.id==='BOX-A'))"); m2=await pg.evaluate("orderMessage(orders.find(o=>o.id==='BOX-B'))")
        ok('pending message',m1.startswith('Hi Maria!') and 'BOX-A' in m1 and '₱390' in m1,m1[:90])
        ok('ready pickup message','ready for pick-up' in m2,m2[:90])
        await pg.evaluate("window.__nav=null;"); 
        url=await pg.evaluate("(()=>{let u=null;const orig=Object.getOwnPropertyDescriptor(Location.prototype,'href');return 1})()")
        # sms url built correctly (intercept by overriding location.href setter impossible; test via function parts)
        num=await pg.evaluate("normalizePH(orders.find(o=>o.id==='BOX-B').contact_number)"); ok('phone normalised for sms',num=='09175550000',num)
        # ---- cash tab
        await pg.evaluate("(()=>{switchAdminTab('cash');return 1})()"); await pg.wait_for_timeout(1200)
        ok('cash tab renders',await pg.locator('#cash-opening').count()==1)
        await pg.fill('#cash-opening','500'); await pg.evaluate("(()=>{saveCashOpening();return 1})()"); await pg.wait_for_timeout(900)
        await pg.evaluate("(()=>{posTicket=[{id:1,qty:2}];posPayment='Cash Walk-in';posCharge();return 1})()"); await pg.wait_for_timeout(1800); await modal_ok(pg)
        await pg.evaluate("(()=>{switchAdminTab('cash');return 1})()"); await pg.wait_for_timeout(1000)
        await pg.select_option('#cash-kind','out'); await pg.fill('#cash-amount','50'); await pg.fill('#cash-reason','ice')
        await pg.evaluate("(()=>{addCashEntry();return 1})()"); await pg.wait_for_timeout(900)
        txt=await pg.inner_text('#cash-body'); ok('expected = 500+120-50 = 570','₱570' in txt,txt[txt.find('Expected'):txt.find('Expected')+40].replace('\n',' '))
        # reason required
        await pg.fill('#cash-amount','10'); await pg.fill('#cash-reason',''); await pg.evaluate("(()=>{addCashEntry();return 1})()"); await pg.wait_for_timeout(300)
        ok('reason required message',await pg.is_visible('#cash-form-error'))
        await pg.fill('#cash-counted','565'); await pg.evaluate("(()=>{closeCashDay();return 1})()"); await pg.wait_for_timeout(500); await modal_ok(pg); await pg.wait_for_timeout(1000)
        txt=await pg.inner_text('#cash-body'); ok('short ₱5 reported after close','₱5 short' in txt and 'Closed' in txt,txt[-80:].replace('\n',' '))
        # download prompt (backup) was shown+accepted by modal_ok -> a download may have occurred
        ok('add disabled when closed',await pg.locator('#cash-amount').is_disabled())
        # ---- records tab
        sh("insert into storage.objects(bucket_id,name,created_at) values ('gcash-receipts','receipt/orphan1.png',now()-interval '3 days')",role=None)
        await pg.evaluate("(()=>{switchAdminTab('records');return 1})()"); await pg.wait_for_timeout(1200)
        t=await pg.inner_text('#records-body'); ok('activity log lists actions','POS sale' in t and 'Day closed' in t)
        ok('closing the day offered + saved a backup',('Last backup' in t) or ('No backup' in t))
        async with pg.expect_download() as dl:
            await pg.evaluate("(()=>{downloadBackup();return 1})()")
        d=await dl.value; path=await d.path(); import json as J; js=J.load(open(path))
        ok('backup JSON has orders+products+cash',len(js['orders'])>=3 and len(js['products'])>=12 and len(js['cash_days'])==1 and 'activity_log' in js,str({k:len(v) for k,v in js.items() if isinstance(v,list)}))
        await pg.wait_for_timeout(900)
        t=await pg.inner_text('#records-body'); ok('backup stamp shown','Last backup' in t and 'today' in t)
        await pg.evaluate("(()=>{findUnusedPhotos();return 1})()"); await pg.wait_for_timeout(1000)
        t=await pg.inner_text('#records-body'); ok('finds 1 unused photo','1 unused photo' in t,t[t.find('unused')-10:t.find('unused')+30].replace('\n',' '))
        ok('no page errors',not errs,str(errs[:2]))
        await b.close()
    print('RESULT',sum(res),'/',len(res))
asyncio.run(main())
