import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env import *
exec(open(HERE/'helpers_a.py').read().split("async def main")[0])
def order(pay='GCash', ful='pickup', items='[{"id":%s,"qty":1}]', extra=''):
    return ("select place_order('{\"name\":\"A\",\"contact\":\"09171234567\",\"notes\":\"n\",\"payment_method\":\"%s\",\"fulfillment\":\"%s\",\"delivery_address\":\"a\",\"maps_link\":\"http://m\",\"items\":%s%s}')" % (pay, ful, items, extra))
def main():
    reset_db()
    sh("update admin_settings set pin_hash=extensions.crypt('Bacha2026!', extensions.gen_salt('bf')), pin_changed=true",role=None)
    sh("insert into store_settings values('store_mode','open') on conflict (key) do update set value='open'",role=None)
    sh("insert into storage.objects(bucket_id,name) values('gcash-receipts','a.png')",role=None)
    drink,_=sh("select id from products where category='Drinks' limit 1",role=None); drink=drink.strip()
    cookie,_=sh("select id from products where category='Cookies' limit 1",role=None); cookie=cookie.strip()
    tok,_=sh("select admin_login('Bacha2026!')->>'token'",role=None); tok=tok.strip()
    def setopt(o):
        return sh("select admin_set_setting('%s','site_options','%s')" % (tok, json.dumps(o,ensure_ascii=False)),role=None)
    D='[{"id":%s,"qty":1}]' % drink; C='[{"id":%s,"qty":1}]' % cookie
    RC=',\"receipt_url\":\"https://x.supabase.co/storage/v1/object/public/gcash-receipts/a.png\"'
    r,e=sh(order('GCash','pickup',C,RC)); ok('single cookie refused by server','no_single_cookie' in e,e[:60])
    r,e=sh(order('GCash','pickup',D,RC)); ok('drink order works','ERROR' not in e,e[:80])
    # categories
    cats=[{'name':'Cookies','icon':'🍪'},{'name':'Drinks','icon':'🍵'},{'name':'Bread','icon':'🍞'}]
    r,e=setopt({'categories':cats}); ok('admin can add a category','ERROR' not in e,e[:80])
    r,e=sh("select admin_save_product('%s','{\"name\":\"SOURDOUGH\",\"price\":90,\"max_stock\":5,\"stock\":5,\"description\":\"x\",\"image\":\"images/x.png\",\"is_active\":true,\"category\":\"Bread\"}')" % tok,role=None)
    ok('product in new category saved','ERROR' not in e,e[:80])
    r,e=sh("select admin_save_product('%s','{\"name\":\"NOPE\",\"price\":90,\"max_stock\":5,\"stock\":5,\"description\":\"x\",\"image\":\"images/x.png\",\"is_active\":true,\"category\":\"Ghost\"}')" % tok,role=None)
    ok('unknown category refused','bad_category' in e,e[:60])
    r,e=setopt({'categories':[{'name':'Cookies'},{'name':'Bread'}]}); ok('Drinks cannot be removed','bad_value' in e,e[:60])
    r,e=setopt({'categories':cats+[{'name':'bread'}]}); ok('duplicate category refused','bad_value' in e,e[:60])
    # payments
    r,e=setopt({'payments':{'gcash':False,'cod':False}}); ok('cannot switch every payment off','bad_value' in e,e[:60])
    setopt({'payments':{'gcash':False,'cod':True}})
    r,e=sh(order('GCash','pickup',D)); ok('GCash refused when off','payment_unavailable' in e,e[:60])
    r,e=sh(order('COD','pickup',D)); ok('cash on pick-up works when GCash off','ERROR' not in e,e[:80])
    setopt({'payments':{'gcash':True,'cod':False}})
    r,e=sh(order('COD','delivery',D)); ok('COD refused when off','payment_unavailable' in e,e[:60])
    setopt({'payments':{'gcash':True,'cod':True}})
    r,e=sh(order('COD','pickup',D)); ok('pickup COD refused while GCash on','bad_payment' in e,e[:60])
    # delivery limit
    r,e=setopt({'delivery':{'limitEnabled':True,'maxKm':5}}); ok('limit needs shop location','bad_value' in e,e[:60])
    setopt({'delivery':{'limitEnabled':True,'maxKm':5,'shopLat':14.5995,'shopLng':120.9842}})
    r,e=sh(order('COD','delivery',D)); ok('delivery without location refused','location_needed' in e,e[:60])
    r,e=sh(order('COD','delivery',D,',\"lat\":14.7,\"lng\":121.1')); ok('too far refused','too_far' in e,e[:60])
    r,e=sh(order('COD','delivery',D,',\"lat\":14.60,\"lng\":120.99')); ok('near delivery accepted','ERROR' not in e,e[:80])
    r,_=sh("select delivery_km from orders where fulfillment='delivery' order by created_at desc limit 1",role=None); ok('distance stored',r.strip() not in ('',),r)
    r,e=sh(order('GCash','pickup',D,',\"receipt_url\":\"https://x.supabase.co/storage/v1/object/public/gcash-receipts/a.png\"')); ok('pickup ignores the limit','ERROR' not in e,e[:60])
    # socials
    r,e=setopt({'socials':[{'platform':'Instagram','url':'javascript:alert(1)'}]}); ok('bad social url refused','bad_value' in e,e[:60])
    r,e=setopt({'socials':[{'platform':'Instagram','url':'https://instagram.com/bacha'}]}); ok('social link saved','ERROR' not in e,e[:60])
    r,e=sh("select admin_set_setting('bad','site_options','{}')",role=None); ok('needs admin token','ERROR' in e,e[:40])
    print('RESULT',sum(res),'/',len(res))
    sys.exit(0 if all(res) else 1)
main()
