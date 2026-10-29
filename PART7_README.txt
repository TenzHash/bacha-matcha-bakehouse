PART 7 - NEW LAYOUT (store + admin) - built on your bacha6 version

STORE: one screen at a time (steps at the bottom: Your box, Drinks & more).
  Your box: six big spots. Tap an empty spot and a popup lists the available cookies; pick as many as you like, it closes by
  itself at 6 (or press Done / Esc). Tap a filled cookie to take it out. The 3D carousel is gone.
  Drinks & more: one scrolling list with every item and a "View bag" button. On short screens (landscape phones) the page scrolls
  instead of squashing the six spots.
ADMIN: left menu (always visible from 768 px up; Menu button on phones). It opens on "Today": orders waiting (incl. GCash orders
  older than 24h), ready to hand over, in the oven, sales today, low stock, orders per bake day, today's cash drawer.

DATABASE: Part 7 changes nothing in the database. If you are already on Part 6 you do not need to run supabase_setup.sql again.
  If you are unsure which version your database is on, running it is SAFE: it was tested twice in a row and as an upgrade from the
  oldest version, with no errors, and it keeps your orders, prices, settings and PIN. (The earlier READMEs saying "safe to re-run" are right.)
  Supabase URL/key are the ones from your bacha6 zip.

TESTS: python3 tests/run_tests.py   (builds its own scratch database; see tests/README.txt)
CSS: unused leftovers from the old carousel were removed (app.css 555 -> ~500 lines); screens compared before/after were identical.

KNOWN LIMITS (unchanged): receipt photos are reachable by anyone who has their long random link; backups can be downloaded
  but there is no restore button; there is no offline mode / service worker in this package.
