BACHA - PART 8G (fixes on top of your bacha_part8f)
===================================================
1. ANIMATIONS. Cause: since Part 2 a "reduce motion" rule switched off ALL animation for anyone whose phone/PC has
   "reduce motion / remove animations" turned on (Windows "Show animations", Android "Remove animations", battery saver...).
   Now only the endless loops (pulse, bounce) and smooth page scrolling are switched off for those people; the cookie pop,
   smoke puff and carousel slide always play (they only happen when you tap).
   Also fixed: adding a cookie used to rebuild the whole carousel, so it snapped. Now the cards are updated in place
   (carousel keeps its position), and only the newly added cookie pops (before, all filled spots popped again).
2. CONTROL HUB CARDS. The three panels on "Today" (Low stock, Orders by bake day, Cash drawer) lost their card style
   (a leftover ".panel" rule had been removed). Restored.
3. SIDE MENU. Cause: body had "overflow-x: hidden", which makes position:sticky stop working. Now html clips sideways overflow and
   body uses "clip". The side menu (and the header and POS ticket) stay in place while you scroll.
4. CATEGORIES. Menu edit -> Item categories now shows a grid of ~48 food/drink emojis to tap. You can still type your own.
5. MAP (no extra library, works from the same files).
   - Store control -> Payments, delivery & socials: a map under the delivery distance. It draws the dashed delivery circle
     (changes live as you type km / latitude / longitude). Tap the map to place the shop.
   - Orders tab: "Delivery map" button = shop + circle + a pin for every open delivery order (tick "Include finished orders"
     for more). Tap a pin: name, address, km from shop, status, "Open in Google Maps", "Show this order". Pins outside the
     circle glow red. Each delivery order card also has "Show on map".
   - Customers' exact shared location is now saved with the order (new columns delivery_lat / delivery_lng). Older orders and
     orders without it are placed from the coordinates inside their Google Maps link; short links (maps.app.goo.gl) cannot be
     read, so those are listed under the map with a link instead.
   - Map pictures come from OpenStreetMap, so they need internet. Without it you still get the circle, pins and grid.
     (If you open index.html straight from a folder, OpenStreetMap may refuse the pictures because no website address is sent.
     From your online site it works.) Tile address is MAP_TILE_URL at the top of js/16-map.js if you want another provider.

UPDATING SUPABASE: run supabase_setup.sql again (SQL Editor -> paste -> Run). It only adds 2 columns and records them in place_order.
Without it everything still works; the map then reads positions from the Google Maps links only.
NOT RE-RUN HERE: the Postgres test-suite (needs a scratch PostgreSQL). Checked in a real browser instead: store animations with
"reduce motion" on, sticky menu at desktop, Today cards, emoji picker, both maps, phone width (no sideways scroll).
