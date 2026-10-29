BACHA - PART 9 (on top of your bacha_part8h): NEW FRONT PAGE + FEEDBACK
=======================================================================
HOW TO INSTALL
  1. Supabase -> SQL editor -> paste and run  supabase_feedback.sql  ONCE (after supabase_setup.sql). Safe to re-run.
     (If you ever re-run supabase_setup.sql, run supabase_feedback.sql again afterwards.)
  2. Upload the whole folder to your site as before.

WHAT CHANGED
  index.html     = NEW front page: logo, "batter, matcha, and a little bit of cha", then Order / Feedback / Social media.
  shop.html      = your previous index.html, renamed. Identical except ONE added line at the bottom (the script tag for
                   js/17-feedback-admin.js). Every older js/css file is untouched.
  feedback.html  = NEW feedback page.
  Order          -> shop.html (the box builder, exactly as before).
  Feedback       -> feedback.html: caption (editable by admin), star rating 1-5, text box, up to 2 photos, optional name/contact,
                   "Add yours" button next to the wall of approved feedback (plus a floating one), and "Your feedback" (status + coupon,
                   kept on that device by a private code).
  Social media   -> pop-up listing the links saved in Admin -> Store control -> "Payments, delivery & socials" (same list as before,
                   nothing new to maintain).
  Small extras   -> the Bacha logo in the shop goes back to the front page; "Staff login" on the front page opens the PIN box.

ADMIN -> new "Feedback" tab
  - Settings: accept feedback on/off, caption, lowest star rating that may be shown publicly (lower ones stay private, only you see them),
    publish automatically or approve each one, allow photos, shortest message.
  - Coupons: on/off, % or peso amount, valid days, qualifying stars, photo required, give automatically, note.
  - Each feedback: Approve / Approve + coupon / Reject / Keep private / Unpublish / Delete; shows contact + photos.
  - Coupons: Copy code, Mark used / unused, Cancel. A badge shows how many are waiting.

IMPORTANT TO KNOW
  - Coupons are created and tracked, but NOT applied automatically at checkout (you asked not to change the existing shop).
    When a customer shows a code, check it in the Feedback tab and tap "Mark used". Auto-apply needs a change to the checkout
    and place_order - can be added later.
  - Feedback photos go to a new bucket (feedback-photos) so the receipt clean-up tools never touch them. Deleting feedback does not
    delete the picture files from storage (tiny, but you can clear them in the Supabase Storage screen).
  - Spam guards: hidden trap field, 40 submissions/hour limit, text always escaped, photos must be your own storage links.
  - If you rebuild css/tailwind.css, build/tailwind.config.js now also scans shop.html.
  - The old tests open index.html; to run them, point BACHA_SITE at a copy where shop.html is saved as index.html.
TESTED: SQL (rules, limits, coupons, permissions) on a scratch PostgreSQL; the new pages end-to-end in a real browser against that
database (63 checks incl. phone/landscape/320px widths); your existing test suite still passes (accessibility scans could not run offline).
NOT TESTED: real Supabase project, real phone photos from your devices, the Fredoka font (needs internet).
