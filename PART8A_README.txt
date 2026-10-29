BACHA - PART 8A (items 1-6)
===========================
1. Box of 6: back to the original layout - your box on the left, the 3D cookie carousel on the right.
2. Single cookies are no longer on the customer menu (they are only sold inside a box of 6).
   The cashier POS can still sell single cookies. The server also refuses single-cookie online orders.
3. Categories: Menu edit tab -> "Item categories". Add a name + emoji (e.g. Bread). Cookies and Drinks are built in.
   A category can only be removed when no item uses it.
4. Payments: Store control tab -> "Payments, delivery & socials". Turn GCash or Cash (COD) on/off (one must stay on).
   If GCash is off, pick-up customers pay cash when they collect; if COD is off, delivery needs GCash.
5. Delivery distance: same card. Tick "Only deliver within a set distance", set km, and the shop location
   (tap "Use my current location as the shop" while standing at the shop). At checkout the customer taps
   "Use my location"; the straight-line distance is checked on their phone AND on the server. Too far = pick-up only.
6. Social links: same card. Pick a platform, paste the full https:// link, Save links. They show on the closed-shop screen.

UPDATING SUPABASE: open the SQL Editor, paste the whole supabase_setup.sql and Run. Safe to run again on your existing database.
(Customers' phones must allow location for the delivery check. If the limit is off, nothing is asked.)
