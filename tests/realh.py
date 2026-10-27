import subprocess, json, os, re
from playwright.async_api import async_playwright
<<<<<<< HEAD
PSQL=[os.path.join(os.environ.get('PGBIN',''),'psql'),'-h',os.environ.get('PGHOST','/tmp/pgdata'),'-p',os.environ.get('PGPORT','5544'),'-U',os.environ.get('PGUSER','postgres'),'-d',os.environ.get('PGDB','bacha_test'),'-qAt']
=======
PSQL=['/usr/lib/postgresql/16/bin/psql','-h','/tmp/pgdata','-p','5544','-U','nobody','-d','t4','-qAt']
>>>>>>> 78a4d4c6a22f466a33e669601322f3c4a3e70fc5
def sh(sql, role='anon'):
    cmd=PSQL+(['-c',f'set role {role}'] if role else [])+['-c',sql]
    r=subprocess.run(cmd,capture_output=True,text=True)
    return r.stdout.strip(), r.stderr.strip()
def lit(v):
    if v is None: return 'null'
    if isinstance(v,bool): return 'true' if v else 'false'
    if isinstance(v,(dict,list)): v=json.dumps(v)
    return "'"+str(v).replace("'","''")+"'"
async def py(kind,payload):
    if kind=='rpc':
        d=json.loads(payload); fn=d['fn']; args=', '.join(f'{k} => {lit(v)}' for k,v in d['args'].items())
        sql=f"select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from {fn}({args}) t" if fn in ('admin_list_orders','admin_activity') else f"select to_jsonb({fn}({args}))"
        out,err=sh(sql)
        if err and 'ERROR' in err:
            m=re.search(r'ERROR:\s+(.*)',err).group(1); return json.dumps({'error':m})
        return json.dumps({'data':json.loads(out) if out else None})
    if kind=='select':
        out,err=sh(f"select coalesce(jsonb_agg(to_jsonb(t) order by 1),'[]') from {payload} t") if False else sh(f"select coalesce(jsonb_agg(to_jsonb(t)),'[]') from {payload} t")
        if 'ERROR' in err: return json.dumps({'error':err})
        return json.dumps({'data':json.loads(out)})
    if kind=='upload':
        out,err=sh(f"insert into storage.objects(bucket_id,name) values('gcash-receipts',{lit(payload)})")
        if 'ERROR' in err: return json.dumps({'error':err})
        return json.dumps({'ok':1})
def reset_db():
    sh("""truncate orders, admin_sessions, rate_events; delete from storage.objects; update admin_settings set fail_count=0, locked_until=null, pin_changed=false, pin_hash=extensions.crypt('1234', extensions.gen_salt('bf')); update products set stock=max_stock; delete from products where id>12; delete from store_settings; insert into store_settings values('display_mode','both');""",role=None)
