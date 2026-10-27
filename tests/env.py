"""Shared settings for every test. Nothing here is machine-specific: override with environment variables.
  BACHA_SITE  folder with index.html (default: a temp copy of this app with the Supabase library stubbed out)
  PGBIN PGHOST PGPORT PGUSER PGDB   the scratch PostgreSQL used for the database tests (see README.txt)
  AXE_PATH    path to axe.min.js (default: tests/node_modules/axe-core/axe.min.js, installed by run_tests.py)
"""
import os, sys, shutil, tempfile, pathlib
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = pathlib.Path(os.environ.get('BACHA_OUT', tempfile.gettempdir())) / 'bacha_test_out'
OUT.mkdir(parents=True, exist_ok=True)

def _site():
    given = os.environ.get('BACHA_SITE')
    if given: return pathlib.Path(given)
    dst = OUT / 'site'
    if dst.exists(): shutil.rmtree(dst)
    shutil.copytree(ROOT, dst, ignore=shutil.ignore_patterns('tests', '.git'))
    (dst / 'vendor' / 'supabase.js').write_text('')   # tests inject their own database bridge
    return dst
SITE = _site()
URL = 'file://' + str(SITE / 'index.html')
RD_PATH = HERE / 'real_db.js'
AXE_PATH = pathlib.Path(os.environ.get('AXE_PATH', HERE / 'node_modules' / 'axe-core' / 'axe.min.js'))
def axe_source():
    if not AXE_PATH.exists():
        sys.exit('axe-core not found. Run: cd tests && npm install axe-core   (or set AXE_PATH)')
    return AXE_PATH.read_text()
def shot(name): return str(OUT / name)
