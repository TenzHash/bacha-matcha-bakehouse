BACHA - PART 4 (SECURITY) - HOW TO INSTALL
==========================================
ORDER MATTERS. Do step 1 BEFORE you upload the new index.html, otherwise checkout and admin will show errors.

1. Supabase > SQL Editor > New query > paste ALL of supabase_setup.sql > Run.   (safe to re-run)
2. Upload index.html + images/ to your site (replace the old ones).
3. Open the site > Admin > sign in with PIN 1234. You will be forced to choose a new PIN (6+ characters).
   Do this right away. Until you do, nothing else in the admin works.

WHAT CHANGED
- The public key can no longer read or change orders. Orders are only visible to a signed-in admin.
- Admin sign-in is checked on the server: 5 wrong PINs locks sign-in for 15 minutes; the session lasts 12 hours.
- Totals, prices, stock and the cut-off time are calculated on the server. A customer cannot send their own price.
- Reject / cancel / void return stock on the server, and only valid status changes are allowed.
- Customers track an order with Order ID + phone number only.
- Receipt photos: JPG/PNG/WebP up to 5 MB, random file names, bucket listing turned off.
- All text from customers/menu is escaped on screen (no script injection). Tailwind is pinned to 3.4.17.

KNOWN LIMITS
- Receipt images are still reachable by anyone who has the long random link (a public Supabase bucket).
- Someone can still upload junk images (they cannot read orders). Check Storage now and then.
- Anyone can hammer the admin sign-in to lock it for 15 minutes (the price of brute-force protection).
- After a PIN change, other signed-in devices are signed out.
- Orders now refresh on the admin screen every 10 seconds (no live push of orders any more).
