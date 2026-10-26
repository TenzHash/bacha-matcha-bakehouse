import sys; sys.path.insert(0,"/tmp/claude-0/work")
exec(open('t6b.py').read().split("async def login")[0])
AXE=open('/tmp/claude-0/work/node_modules/axe-core/axe.min.js').read()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for name,w,h in [('t768',768,1024),('t1180',1180,820),('m375',375,740)]:
            ctx=await b.new_context(viewport={'width':w,'height':h},timezone_id='Asia/Manila'); await ctx.expose_function('__py',py)
            pg=await ctx.new_page(); await pg.add_init_script(RD); await pg.goto(URL); await pg.wait_for_timeout(1000)
            await pg.evaluate("(()=>{toggleAdminLoginModal(true);return 1})()"); await pg.fill('#admin-password-input','Bacha2026!'); await pg.evaluate("(()=>{handleAdminLogin();return 1})()"); await pg.wait_for_timeout(2000)
            for tab in ['orders','cash','records']:
                await pg.evaluate(f"(()=>{{switchAdminTab('{tab}');return 1}})()"); await pg.wait_for_timeout(1200)
                await pg.add_script_tag(content=AXE)
                r=await pg.evaluate("axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21aa','best-practice']}).then(r=>r.violations.map(v=>v.id+':'+v.nodes.length+' '+v.nodes[0].target))")
                ov=await pg.evaluate("document.documentElement.scrollWidth>innerWidth")
                print(name,tab,r,'OVERFLOW' if ov else 'ok'); await pg.screenshot(path=f'/tmp/claude-0/work/p6_{name}_{tab}.png')
            await ctx.close()
        await b.close()
asyncio.run(main())
