import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env import *
import asyncio
from playwright.async_api import async_playwright
# No popup/drawer (bag + checkout, track order, staff sign-in, cookie picker, success, invoice) may scroll sideways on any phone/tablet.
OPEN={'cart-drawer':"cart=[{boxId:'b1',kind:'box',name:'Custom Box of 6',batchDate:'x',items:boxProducts().slice(0,6),price:390}];updateCartUI();toggleCartDrawer(true)",
 'track-modal':"toggleTrackModal(true)",'admin-login-modal':"toggleAdminLoginModal(true)",
 'order-success-modal':"toggleOrderSuccess(true)",'invoice-modal':"toggleInvoiceModal(true)"}
JS="""(id)=>{const root=document.getElementById(id);const bad=[];[root,...root.querySelectorAll('*')].forEach(e=>{const cs=getComputedStyle(e);if(/(auto|scroll)/.test(cs.overflowX)&&e.scrollWidth>e.clientWidth+0.5&&e.clientWidth>0)bad.push(e.tagName+'#'+e.id+' '+e.scrollWidth+'/'+e.clientWidth)});return bad}"""
R=[]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for w,h in [(320,640),(360,740),(390,844),(430,932),(768,1024)]:
            pg=await b.new_page(viewport={'width':w,'height':h})
            await pg.add_init_script("window.supabase={createClient(){throw new Error('offline')}}")
            await pg.goto(URL); await pg.wait_for_timeout(1000)
            for id,js in OPEN.items():
                await pg.evaluate(js); await pg.wait_for_timeout(700)
                bad=await pg.evaluate(JS,id); R.append(not bad)
                print('PASS' if not bad else 'FAIL',f'{w}px {id} does not scroll sideways',bad or '')
                await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
            await pg.close()
        await b.close()
    print('RESULT',sum(R),'/',len(R))
asyncio.run(main())
