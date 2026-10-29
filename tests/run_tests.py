#!/usr/bin/env python3
"""One command to run everything:   python3 tests/run_tests.py
Needs: Python 3 + `pip install playwright` + `playwright install chromium`, Node (for axe-core), PostgreSQL 14+ (a scratch server).
It never touches Supabase or any real database: it builds a throw-away database called bacha_test.
Set PGBIN/PGHOST/PGPORT/PGUSER if your PostgreSQL is not the Linux default (see README.txt)."""
import os, sys, glob, shutil, subprocess, pathlib
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
def find_pgbin():
    if os.environ.get('PGBIN'): return os.environ['PGBIN']
    if shutil.which('psql'): return os.path.dirname(shutil.which('psql'))
    c = sorted(glob.glob('/usr/lib/postgresql/*/bin'))
    return c[-1] if c else ''
env = dict(os.environ)
env['PGBIN'] = find_pgbin()
env.setdefault('PGHOST', '/var/run/postgresql'); env.setdefault('PGPORT', '5432'); env.setdefault('PGUSER', 'postgres'); env.setdefault('PGDB', 'bacha_test')
def psql(db, *args, **kw):
    return subprocess.run([os.path.join(env['PGBIN'], 'psql'), '-h', env['PGHOST'], '-p', env['PGPORT'], '-U', env['PGUSER'], '-d', db, '-q', *args], env=env, capture_output=True, text=True, **kw)

# 1. axe-core (accessibility scanner) for the accessibility tests
if not (HERE / 'node_modules' / 'axe-core' / 'axe.min.js').exists() and not os.environ.get('AXE_PATH'):
    print('Installing axe-core ...'); subprocess.run(['npm', 'install', '--no-audit', '--no-fund', 'axe-core@4'], cwd=HERE, check=True)

# 2. throw-away database with stand-ins for the Supabase roles / storage schema, then the real setup script
r = psql('postgres', '-c', f"drop database if exists {env['PGDB']}", '-c', f"create database {env['PGDB']}")
if r.returncode: sys.exit('Could not reach PostgreSQL:\n' + r.stderr)
r = psql(env['PGDB'], '-v', 'ON_ERROR_STOP=1', '-c', """
create schema extensions; create schema auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create extension if not exists pgcrypto with schema extensions;
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id bigserial primary key, bucket_id text, name text, owner uuid, created_at timestamptz default now());
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
grant usage on schema storage to public; grant all on storage.objects to public; grant usage on sequence storage.objects_id_seq to public;
""")
if r.returncode: sys.exit('Stub setup failed:\n' + r.stderr)
r = psql(env['PGDB'], '-f', str(ROOT / 'supabase_setup.sql'))
if 'ERROR' in r.stderr: sys.exit('supabase_setup.sql failed:\n' + r.stderr)
print('Test database ready (supabase_setup.sql applied cleanly).')

# 3. the tests
tests = ['test_customer_and_admin', 'test_part8a', 'test_part8a_ui', 'test_admin_tools_and_demo', 'test_expiry_paging_alerts',
         'test_cash_records_messages', 'test_accessibility', 'test_accessibility_part6', 'test_devices_store', 'test_dialogs_sideways', 'test_devices_admin']
bad = 0
for t in tests:
    p = subprocess.run([sys.executable, '-I', str(HERE / f'{t}.py')], env=env, capture_output=True, text=True, timeout=600)
    out = p.stdout + p.stderr
    import re
    fails = [l for l in out.splitlines() if l.startswith('FAIL') or 'Traceback' in l or (re.search(r"\['[a-z-]+:\d", l))]
    res = [l for l in out.splitlines() if l.startswith('RESULT')]
    status = 'OK ' if p.returncode == 0 and not fails else 'BAD'
    if status == 'BAD': bad += 1
    print(f"{status} {t}: {res[0] if res else ''}")
    for l in fails[:6]: print('     ', l[:160])
sys.exit(1 if bad else 0)
