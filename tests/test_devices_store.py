import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env import *
import asyncio
from playwright.async_api import async_playwright
# The page-level "hide sideways scroll" rule is switched off here so hidden overflow cannot be masked.
DEV=[('xs',320,568),('and',360,640),('se',375,667),('ip14',390,844),('promax',430,932),('land',844,390),('ipad',768,1024),('ipadl',1024,768),('lap',1366,768),('d1440',1440,900),('hd',1920,1080)]
JS="""(()=>{const w=document.documentElement.clientWidth;const bad=[];document.querySelectorAll('body *').forEach(e=>{const cs=getComputedStyle(e);if(cs.display==='none'||cs.visibility==='hidden'||cs.position==='fixed')return;if(e.closest('[inert],.hidden,.pointer-events-none,.admin-sidebar,.overflow-x-auto,.aesthetic-scroll,.no-scrollbar,.carousel-3d-container'))return;const r=e.getBoundingClientRect();if(r.width>0&&(r.right>w+1||r.left<-1))bad.push(e.tagName+'#'+e.id+' '+Math.round(r.left)+'..'+Math.round(r.right))});return bad.slice(0,4)})()"""
R=[]
def ok(n,c,d=''): R.append(c); print('PASS' if c else 'FAIL',n,d)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for n,w,h in DEV:
            pg=await b.new_page(viewport={'width':w,'height':h}); errs=[]
            pg.on('pageerror',lambda e:errs.append(str(e)))
            await pg.add_init_script("window.supabase={createClient(){throw new Error('offline')}}")
            await pg.goto(URL); await pg.wait_for_timeout(900)
            await pg.add_style_tag(content='html,body{overflow-x:visible !important}')
            bad=[]
            bad+=await pg.evaluate(JS)
            # the six spots must be usable (big enough to tap) on this screen
            ok(f'{n} 3D carousel shows',await pg.evaluate("!!document.querySelector('[class*=carousel-3d]')"))
            count=await pg.locator('#single-menu-grid > div').count()
            ok(f'{n} menu lists every non-cookie item',count==await pg.evaluate("products.filter(p=>p.is_active!==false&&catOf(p)!=='Cookies').length"),count)
            await pg.evaluate("cart=[{boxId:'b1',kind:'box',name:'Custom Box of 6',batchDate:'x',items:boxProducts().slice(0,6),price:390}];updateCartUI();toggleCartDrawer(true)"); await pg.wait_for_timeout(900); bad+=await pg.evaluate(JS)
            ok(f'{n} no element sticks out sideways (box, menu, bag)',not bad,bad)
            ok(f'{n} no page errors',not errs,errs)
            await pg.close()
        await b.close()
    print('RESULT',sum(R),'/',len(R))
asyncio.run(main())
