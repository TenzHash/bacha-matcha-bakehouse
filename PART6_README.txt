BACHA - PART 6 (CASH DRAWER, MESSAGES, BACKUP, CLEANUP, ACTIVITY LOG)
====================================================================
INSTALL (same order as before):
 1. Supabase > SQL Editor > paste ALL of supabase_setup.sql > Run (safe to re-run; upgrades Part 4/5 databases).
 2. Upload the WHOLE folder (index.html, css/, js/, vendor/, build/, images/) over the old one.

NEW TABS (Admin hub)
 CASH     Pick a day. Set opening cash. Cash sales at the counter are added automatically from the POS.
          Add "cash out" (needs a reason), "cash in", or "refund" entries. Expected cash = opening + cash sales + in - out - refunds.
          At closing type the cash you counted: it shows OVER / SHORT / exactly right. A closed day is locked until you press Re-open.
          Closing offers to download a backup. GCash taken at the counter is shown but is not drawer cash.
          COD money collected by a rider is only counted if you add it as "Cash in".
 RECORDS  Backup: downloads a .json file (orders, menu, settings, cash, activity) and a .csv of all orders to the tablet's Downloads
          folder. A red reminder shows if the last backup is 7+ days old or none was ever saved. Copy the files to your phone/Drive.
          Photo cleanup: "Find unused photos" lists pictures no order or menu item uses (older than 24 h) and deletes them.
          "Remove old receipts" clears receipt pictures from FINISHED orders older than N days (30+). Open orders are never touched.
          Activity log: last 200 actions (order changes, stock, menu, settings, cash, sign-ins).
 ORDERS   Each online order has "Text customer" (opens SMS with the message already written) and "Copy message" (for Messenger/Viber).
          The message changes with the order status (received / confirmed / ready / done / cancelled).

NOTES AND LIMITS
 - There is no "restore from backup" button. The backup is a safety copy; restoring it would be done by a developer.
 - Photo deletion goes through Supabase's storage rules written in supabase_setup.sql (the app can only see/delete unused photos).
   I could only test this rule on a local copy, not on your live Supabase project. If "Delete unused photos" shows an error,
   delete the files by hand in Supabase > Storage > gcash-receipts and tell me.
 - Cash and Records need the online database (they say so in offline demo mode).
 - The backup file contains customer names and phone numbers. Keep it private.
 - Not in this part yet: offline POS/inventory and the receipt reference reader.
