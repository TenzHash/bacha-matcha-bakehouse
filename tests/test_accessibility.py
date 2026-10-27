import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env import *
import asyncio
from playwright.async_api import async_playwright
AXE=axe_source()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for name,w,h in [('orders-768',768,1024),('orders-1180',1180,820),('orders-375',375,740)]:
            pg=await b.new_page(viewport={'width':w,'height':h})
            await pg.add_init_script("window.supabase={createClient(){throw new Error('offline')}};localStorage.setItem('bacha_alerts','1')")
            await pg.goto(URL); await pg.wait_for_timeout(800)
            await pg.evaluate("(()=>{toggleAdminLoginModal(true);return 1})()"); await pg.fill('#admin-password-input','1234'); await pg.evaluate("(()=>{handleAdminLogin();return 1})()"); await pg.wait_for_timeout(700)
            await pg.evaluate("(()=>{orders=[{id:'BOX-1',customer_name:'A',contact_number:'0917',notes:'n',boxes:[],items:[],status:'Payment Verification Required',order_type:'online',created_at:new Date(Date.now()-30*3600e3).toISOString(),total_amount:100,receipt_url:'https://x/r.png'},{id:'BOX-2',customer_name:'B',contact_number:'0917',notes:'n',boxes:[],items:[],status:'Cancelled',status_note:'Auto-cancelled: not confirmed within 24 hours',order_type:'online',created_at:new Date().toISOString(),total_amount:100}];switchAdminTab('orders');renderAdmin();return 1})()"); await pg.wait_for_timeout(400)
            await pg.add_script_tag(content=AXE)
            r=await pg.evaluate("axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21aa','best-practice']}).then(r=>r.violations.map(v=>v.id+':'+v.nodes.length+' '+v.nodes[0].target))")
            ov=await pg.evaluate("document.documentElement.scrollWidth>innerWidth")
            print(name,r,'overflow' if ov else 'ok'); await pg.screenshot(path=shot(f'{name}.png'))
        await b.close()
asyncio.run(main())
