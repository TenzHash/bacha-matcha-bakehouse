<<<<<<< HEAD
HOW TO RUN THE TESTS (for whoever maintains the code - not needed to run the shop)

  python3 tests/run_tests.py

Needs: Python 3 with `pip install playwright` then `playwright install chromium`; Node/npm (installs axe-core by itself);
a scratch PostgreSQL 14+ you can create a database in. It never touches Supabase or any real data: it creates a throw-away
database called bacha_test, adds stand-ins for Supabase's roles/storage, applies supabase_setup.sql (any error stops the run),
then runs the tests. The app is copied to a temp folder with the Supabase library stubbed, so the files in this folder are never changed.

If PostgreSQL is not the Linux default, set these first (examples):
  PGBIN=/usr/lib/postgresql/16/bin   PGHOST=/var/run/postgresql   PGPORT=5432   PGUSER=postgres
Optional: BACHA_OUT (where screenshots/temp files go), AXE_PATH (a copy of axe.min.js), BACHA_SITE (test a different folder).

What each file checks
  test_store_picker.py ............ cookie popup, 6-cookie limit, accessibility, no sideways scroll (375/768/1180/1440)
  test_customer_and_admin.py ...... checkout with server-side prices, tracking, PIN lockout/forced change, orders, POS, hostile-data (XSS)
  test_admin_tools_and_demo.py .... products, stock, settings, PIN tab, session expiry, offline demo mode
  test_expiry_paging_alerts.py .... 24h COD auto-cancel, GCash overdue badge, load older orders, CSV history, sound alert
  test_cash_records_messages.py ... cash drawer maths, closed days, activity log, backup download, photo finder, customer messages
  test_accessibility*.py .......... axe-core scans of the admin screens at phone/tablet/desktop
  test_devices_store.py ........... 11 screen sizes 320..1920 incl. landscape phone: spots tappable, nothing sticks out, every drink listed
  test_dialogs_sideways.py ........ bag/checkout, track, sign-in, cookie picker never scroll sideways on phones
  test_devices_admin.py ........... 10 screen sizes, all 9 admin tabs: nothing sticks out sideways
  sqltest*.sql .................... extra database checks, run by hand with psql against the scratch database
  helpers_a.py / helpers_b.py ..... shared test code (do not run directly)
=======
SAVED TESTS (for whoever maintains the code - not needed to run the shop)
These are the exact checks used while building Parts 4-5. They were run against a local PostgreSQL 16 loaded with
supabase_setup.sql (plus stand-in 'anon'/'authenticated' roles and a tiny storage schema) and headless Chromium (Playwright, Python).
  sqltest*.sql ......... database rules: locked tables, PIN lockout, server prices, stock races, cut-off, 24h expiry, paging
  test_customer_and_admin.py ... checkout, tracking, login + forced PIN change, orders, POS, hostile-data (XSS) checks
  test_admin_tools_and_demo.py . products, stock, settings, PIN tab, session expiry, offline demo mode
  test_expiry_paging_alerts.py . 24h COD cancel, GCash overdue badge, load-older, CSV history, sound alert
  test_accessibility.py ........ axe-core scan of the admin orders screen at phone/tablet/desktop widths
Paths inside the scripts point at the original build machine (/tmp/claude-0/work, port 5544); edit the few path/port constants at the top
of realh.py and each test before reusing them. Run the whole set after ANY code change.
Added in Part 6:
  sqltest4.sql ........................ cash drawer maths, closed-day lock, activity log, backup data, unused-photo rules
  test_cash_records_messages.py ....... Cash tab, Records tab, backup download, photo finder, customer message texts
  test_accessibility_part6.py ......... axe-core scan of Orders / Cash / Records tabs at 768, 1180 and 375 px
>>>>>>> 78a4d4c6a22f466a33e669601322f3c4a3e70fc5
