BACHA - PART 5 (STRUCTURE, EXPIRY, PAGING, ALERTS)
================================================
INSTALL (same order as Part 4):
 1. Supabase > SQL Editor > paste ALL of supabase_setup.sql > Run (safe to re-run; it also upgrades Part 4 databases).
 2. Upload the WHOLE folder (index.html + css/ js/ vendor/ build/ images/). index.html alone no longer works.

NEW
 - Code is split: css/app.css, css/tailwind.css (pre-built, small), js/01..11 (by area), vendor/ (libraries, work offline).
   To change text/prices/settings you still only use the admin screens. build/README.txt explains rebuilding the CSS if
   a developer adds new styling.
 - COD orders nobody confirms within 24 hours are cancelled automatically and the cookies go back to stock
   (note shown on the order). GCash orders are NEVER auto-cancelled: after 24 hours they get a red "Waiting 30h" badge.
 - Orders screen loads open orders + the last 30 days. "Load older orders" goes 90 days -> 1 year -> everything.
   Exporting CSV for an older date range loads that history automatically.
 - New-order alert: Orders tab > "Alerts off" button. Tap it once per visit to allow sound. Plays a chime, shows
   "(1 new)" in the tab title, and keeps the tablet screen awake while on. It only works while this page stays open.
   The tablet must be signed in to the admin and the screen/browser must not be closed.
 - Small fix: "choose 6 donuts" now says cookies.

NOTES
 - Open the site from a web host (https). Opening index.html straight from a folder works for looking around, but
   browsers may block some features.
 - Offline mode for POS/inventory, cash drawer, message buttons, end-of-day backup, photo cleanup and the receipt
   reader are NOT in this part yet (planned next).
