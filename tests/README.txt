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
  test_part8a.py .................. server rules: categories, payment on/off, delivery km limit, social links, no single cookies
  test_part8a_ui.py ............... admin screens + customer checkout location check, closed-screen social links
  test_customer_and_admin.py ...... checkout with server-side prices, tracking, PIN lockout/forced change, orders, POS, hostile-data (XSS)
  test_admin_tools_and_demo.py .... products, stock, settings, PIN tab, session expiry, offline demo mode
  test_expiry_paging_alerts.py .... 24h COD auto-cancel, GCash overdue badge, load older orders, CSV history, sound alert
  test_cash_records_messages.py ... cash drawer maths, closed days, activity log, backup download, photo finder, customer messages
  test_accessibility*.py .......... axe-core scans of the admin screens at phone/tablet/desktop
  test_devices_store.py ........... 11 screen sizes 320..1920 incl. landscape phone: spots tappable, nothing sticks out, every drink listed
  test_dialogs_sideways.py ........ bag/checkout, track, sign-in, checkout never scroll sideways on phones
  test_devices_admin.py ........... 10 screen sizes, all 9 admin tabs: nothing sticks out sideways
  sqltest*.sql .................... extra database checks, run by hand with psql against the scratch database
  helpers_a.py / helpers_b.py ..... shared test code (do not run directly)
  test_coupon_ui.py ............... Part 9B: coupon box in the bag (apply / remove / refused codes / order with coupon). Needs only
                                    Python + playwright + chromium (uses a stand-in for Supabase, no database): python3 tests/test_coupon_ui.py
