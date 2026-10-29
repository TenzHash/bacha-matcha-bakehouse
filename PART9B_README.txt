BACHA - PART 9B (on top of your bacha_part9): CUSTOMERS CAN NOW USE THEIR FEEDBACK COUPON
==========================================================================================
THE PROBLEM  Coupons were created (Admin -> Feedback) but the shop had nowhere to type one in.
THE FIX      A "Have a coupon?" box in the customer's bag. Nothing else in the shop was changed.

HOW TO INSTALL
  1. Supabase -> SQL editor -> paste and run  supabase_coupons.sql  ONCE (after supabase_setup.sql and supabase_feedback.sql). Safe to re-run.
  2. Upload the whole folder to your site as before.
  (If you ever re-run supabase_setup.sql, run supabase_feedback.sql and then supabase_coupons.sql again afterwards.)
  Until step 1 is done the box is there but "Apply" will say it could not check the coupon; ordering without a coupon still works.

WHAT THE CUSTOMER SEES
  Bag -> after "3. Preferred Time & Notes": "Have a coupon?" -> type the code (upper/lower case, with or without spaces) -> Apply.
  The footer then shows  Subtotal / coupon / new Total Amount  (the GCash instruction "send the exact total" now means the discounted total).
  "Remove" takes it off again. Add/remove items and the discount follows. After ordering, the pop-up says how much the coupon took off.
  Wrong / used / expired codes give a plain message. If a coupon gets used somewhere else between "Apply" and "Submit", the order is NOT placed,
  the coupon is dropped from the bag and the customer is told (their bag is kept).

WHAT HAPPENS ON THE SERVER (supabase_coupons.sql - all new, nothing existing is rewritten except track_order, see below)
  * place_order_coupon(p) runs your normal place_order() and then takes the discount off and marks the coupon used, in ONE step:
    if the order fails (stock, cut-off, ...) the coupon is not used. The coupon row is locked, so one code can never be spent twice.
  * The discount is worked out on the server from the real prices (the % or peso amount you set in Admin -> Feedback -> Coupons),
    never more than the subtotal. One coupon per order. Delivery minimum is checked on the price BEFORE the discount.
  * orders.total_amount is the amount the customer really pays, so Today / sales / cash totals stay correct.
    orders.coupon_code and orders.coupon_discount (new columns) record which coupon and how much.
  * If that order is later Rejected or Cancelled the coupon is given back automatically (Admin -> Feedback shows it unused again).
    If you DELETE an order, use "Mark unused" yourself.
  * Guessing codes is rate-limited (20 wrong tries per minute, shared).
  * track_order() is the same as before plus two extra fields, so the customer's invoice can show the coupon line.

WHAT THE ADMIN SEES
  Orders: a pink line "Coupon BACHA-XXXXXX took off PHP n" on the order card; the invoice has Subtotal / Coupon / Total.
  Feedback tab: the old "not applied at checkout" warning is replaced. In-store (POS) sales are unchanged: when someone shows a code at the
  counter, tap "Mark used" as before.

FILES CHANGED / ADDED
  NEW  supabase_coupons.sql, js/18-coupon.js, css/coupon.css, tests/test_coupon_ui.py, this file
  EDIT shop.html (coupon box, discount line, 1 css link, 1 script tag), js/02-storefront.js (sends the code with the order, ~10 lines),
       js/04-admin-orders.js (1 line), js/06-settings-invoice.js (invoice discount line), js/feedback-page.js and js/17-feedback-admin.js (wording only)
  Everything else is byte-for-byte the same as bacha_part9.

THINGS TO KNOW
  * Set a % coupon below 100. A coupon that makes the total 0 would still ask a GCash customer for a payment screenshot.
  * The coupon applies to the whole order (boxes and drinks). Tell me if you want it limited to boxes only.
  * Coupons only work with the online database (Supabase). The offline demo mode hides the box.

TESTED: syntax of every JS file; the bag in a real browser (Chromium, 375 px phone and 1280 px desktop): 54 checks (apply / remove /
  unknown, used, expired codes / discount follows cart changes / order sent through place_order_coupon / success note / coupon spent
  between Apply and Submit / ordering without a coupon still uses the original place_order / no sideways scrolling / no JS errors).
NOT TESTED: supabase_coupons.sql has NOT been run against a PostgreSQL or a real Supabase project (none was available where this was built).
  The browser test uses a stand-in that answers the way the SQL is written to. Please do this once after installing:
    1. Admin -> Feedback -> give a coupon to a feedback (or use an existing one), copy the code.
    2. On the shop, add a box, type the code, Apply, place the order, and check the Order card shows the coupon and the lower total.
    3. Admin -> Feedback -> that coupon should now say used. Reject that order -> the coupon should become unused again.
  If the SQL editor shows an error, send me the text and I will fix it.
