import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env import *
import asyncio
from playwright.async_api import async_playwright
DEV=[('xs',320,568),('se',375,667),('and',360,640),('ip14',390,844),('land',844,390),('ipad',768,1024),('ipadl',1024,768),('lap',1366,768),('d1440',1440,900),('hd',1920,1080)]
TABS=['today','inventory','orders','pos','cash','customize','deadline','records','settings']
JS="""(()=>{const w=document.documentElement.clientWidth;const bad=[];document.querySelectorAll('#admin-view *').forEach(e=>{if(e.closest('.hidden')||e.closest('[class*=hidden]'))return;const r=e.getBoundingClientRect();if(r.width&&r.right>w+1&&getComputedStyle(e).position!=='fixed'&&!e.closest('.overflow-x-auto,.aesthetic-scroll,.admin-sidebar'))bad.push(e.tagName+'#'+e.id+'.'+String(e.className).slice(0,40))});return [document.documentElement.scrollWidth-w,bad.slice(0,3)]})()"""
R=[]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for n,w,h in DEV:
            pg=await b.new_page(viewport={'width':w,'height':h}); errs=[]
            pg.on('pageerror',lambda e:errs.append(str(e)))
            await pg.add_init_script("window.supabase={createClient(){throw new Error('offline')}}")
            await pg.goto(URL); await pg.wait_for_timeout(900)
            await pg.evaluate("(()=>{toggleAdminLoginModal(true);return 1})()"); await pg.fill('#admin-password-input','1234'); await pg.evaluate("(()=>{handleAdminLogin();return 1})()"); await pg.wait_for_timeout(800)
            out=[]
            for t in TABS:
                await pg.evaluate(f"switchAdminTab('{t}')"); await pg.wait_for_timeout(120)
                o,bad=await pg.evaluate(JS)
                if o>0 or bad: out.append((t,o,bad))
                if t in('inventory','orders','customize'): await pg.screenshot(path=shot(f'da_{n}_{t}.png'))
            good=(not out and not errs); R.append(good); print('PASS' if good else 'FAIL',f'admin {n} {w}x{h} no overflow/errors',out or errs or '')
            await pg.close()
        await b.close()
asyncio.run(main())
print('RESULT',sum(R),'/',len(R))
