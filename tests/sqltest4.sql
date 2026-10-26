\pset tuples_only on
reset role;
truncate orders, cash_days, cash_entries, activity_log, admin_sessions; delete from storage.objects; update products set stock=max_stock; delete from store_settings;
update admin_settings set pin_hash=extensions.crypt('Bacha2026!',extensions.gen_salt('bf')), pin_changed=true, fail_count=0, locked_until=null;
set role anon;
select admin_login('Bacha2026!')->>'token' as tok \gset
\echo == cash: no token
select admin_cash_get('x');
select admin_cash_get(:'tok')->>'opening';
select admin_cash_set_opening(:'tok', current_date + 3, 100);
select admin_cash_set_opening(:'tok', (now() at time zone 'Asia/Manila')::date, 500)->>'opening';
select admin_pos_sale(:'tok','{"payment":"Cash Walk-in","items":[{"id":1,"qty":2}]}')->>'total_amount';
select admin_pos_sale(:'tok','{"payment":"GCash Counter","items":[{"id":1,"qty":1}]}')->>'total_amount';
select admin_cash_add(:'tok', null, 'out', 50, 'bought ice')->>'cash_out';
select admin_cash_add(:'tok', (now() at time zone 'Asia/Manila')::date, 'out', 50, '');
select admin_cash_add(:'tok', (now() at time zone 'Asia/Manila')::date, 'out', 50, 'bought ice')->>'cash_out';
select admin_cash_add(:'tok', (now() at time zone 'Asia/Manila')::date, 'in', 30, '')->>'cash_in';
select admin_cash_add(:'tok', (now() at time zone 'Asia/Manila')::date, 'refund', 60, 'customer returned cookie', 'POS-X')->>'refunds';
\echo expected = 500 + 120 + 30 - 50 - 60 = 540
select admin_cash_get(:'tok')->>'expected';
select admin_cash_close(:'tok', null, 535)->>'difference';
\echo after close: add must fail
select admin_cash_add(:'tok', (now() at time zone 'Asia/Manila')::date, 'in', 5, '');
select admin_cash_reopen(:'tok', (now() at time zone 'Asia/Manila')::date)->>'closed';
select count(*) from admin_activity(:'tok');
select action from admin_activity(:'tok',3);
\echo == direct table access denied
select count(*) from activity_log;
select count(*) from cash_entries;
\echo == purge receipts + unused files
reset role;
insert into orders(id,customer_name,notes,status,order_type,created_at,receipt_url) values ('OLD1','a','n','Completed','online',now()-interval '100 days','https://x/storage/v1/object/public/gcash-receipts/receipt/aaa.png'),('OPEN1','b','n','Payment Verification Required','online',now()-interval '100 days','https://x/storage/v1/object/public/gcash-receipts/receipt/bbb.png');
insert into storage.objects(bucket_id,name,created_at) values ('gcash-receipts','receipt/aaa.png',now()-interval '100 days'),('gcash-receipts','receipt/bbb.png',now()-interval '100 days'),('gcash-receipts','receipt/zzz.png',now()-interval '3 days'),('gcash-receipts','receipt/new.png',now());
set role anon;
select admin_unused_files(:'tok')->>'names';
select admin_purge_old_receipts(:'tok', 10);
select admin_purge_old_receipts(:'tok', 90);
select admin_unused_files(:'tok')->>'names';
\echo anon direct: delete used file (should delete 0), list sees only unused
delete from storage.objects where name='receipt/bbb.png';
select string_agg(name, ',' order by name) from storage.objects;
delete from storage.objects where name='receipt/zzz.png';
select string_agg(name, ',' order by name) from storage.objects;
select admin_backup_extras(:'tok') ? 'cash_entries';
