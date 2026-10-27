PART 7 - NEW LAYOUT (store + admin) - built on your bacha6 version

STORE: one screen at a time (steps at the bottom: Your box, Drinks & more).
  Your box: six big spots. Tap an empty spot and a popup lists the available cookies; pick as many as you like, it closes by
  itself at 6 (or press Done / Esc). Tap a filled cookie to take it out. The 3D carousel is gone.
  Drinks & more: one scrolling list with every item and a "View bag" button. On short screens (landscape phones) the page scrolls
  instead of squashing the six spots.
ADMIN: left menu and top bar stay in place while you scroll. On tablets (768-1023 px) the menu becomes a slim icon+label rail so the pages get the room; POS, Store control and Inventory were re-laid out for that width. Opens on "Today": greeting, orders waiting (incl. GCash orders
  older than 24h), ready to hand over, in the oven, sales today, low stock, orders per bake day, today's cash drawer.

DATABASE: Part 7 changes nothing in the database. If you are already on Part 6 you do not need to run supabase_setup.sql again.
  If you are unsure which version your database is on, running it is SAFE: it was tested twice in a row and as an upgrade from the
  oldest version, with no errors, and it keeps your orders, prices, settings and PIN. (The earlier READMEs saying "safe to re-run" are right.)
  Supabase URL/key are the ones from your bacha6 zip.

TESTS: python3 tests/run_tests.py   (builds its own scratch database; see tests/README.txt)
CSS: unused leftovers from the old carousel were removed (app.css 555 -> ~500 lines); screens compared before/after were identical.

KNOWN LIMITS (unchanged): receipt photos are reachable by anyone who has their long random link; backups can be downloaded
  but there is no restore button; there is no offline mode / service worker in this package.

MAP PIN (added after Part 7):
  Checkout > Delivery now shows a real map (OpenStreetMap via the bundled Leaflet library in vendor/leaflet/). The customer taps the map,
  drags the pin, searches a street/landmark, or taps "Use my current location". The address box fills itself if it was empty.
  The pin is saved in the existing maps_link field as https://www.google.com/maps?q=LAT,LNG, so there is NO database change and old orders keep working.
  Admin > Orders: delivery orders with a pin get a "View map" button (map popup + "Open in Google Maps" + "Get directions").
  Orders that have an old pasted link still show "Open in Google Maps".
  If the map library or internet is unavailable, checkout falls back to the old paste-a-link box.
  Map tiles and address search come from OpenStreetMap's free public servers (fine for a small shop; for heavy traffic use a tile provider with a key).
  The map opens on Legazpi City: change PIN_CENTER at the top of js/15-map.js to move it.

DELIVERY MAP (Admin > Orders): the "Delivery map" panel shows every open delivery order as a numbered, colour-coded pin
  (to confirm / in the oven / ready; tick "Include delivered" for finished ones), with a bake-day filter and a matching list underneath
  ("Show on map", "Directions", "Open order"). Orders with an old pasted link or no pin are listed too, marked as such.
  Orders placed BEFORE the map pin existed only have a pasted Google link (short links cannot be read). For those, the delivery map looks up an
  APPROXIMATE spot from the written address (dashed pin with a "~"), one lookup per second, and remembers it on that device.

INSTAGRAM BUTTON: a slim tab on the LEFT EDGE of the screen (so it never covers content). Tap it and the "Message us on Instagram" button slides out;
  tap the tab again, tap anywhere else, press Esc, or open the chat and it tucks away. Still set by the Instagram username in Store control.
