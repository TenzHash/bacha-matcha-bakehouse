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
