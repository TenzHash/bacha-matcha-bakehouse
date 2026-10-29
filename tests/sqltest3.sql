\pset tuples_only on
reset role;
truncate orders; delete from admin_sessions; update products set stock=max_stock;
update admin_settings set pin_hash=extensions.crypt('Bacha2026!',extensions.gen_salt('bf')), pin_changed=true, fail_count=0, locked_until=null;
set role anon;
select admin_login('Bacha2026!')->>'token' as tok \gset
select place_order('{"name":"A","contact":"09171234567","notes":"n","fulfillment":"delivery","delivery_address":"a","maps_link":"http://m","payment_method":"COD","items":[{"id":1,"qty":2}]}')->>'id' as cod \gset
reset role;
select stock from products where id=1;
insert into orders(id,customer_name,contact_number,notes,boxes,items,status,order_type,created_at,receipt_url) values
 ('OLDG','g','0917','n','[]','[]','Payment Verification Required','online',now()-interval '30 hours','x'),
 ('OLDDONE','d','0917','n','[]','[]','Completed','online',now()-interval '60 days',null),
 ('OLDQ','q','0917','n','[]','[]','Payment Verified / Queued','online',now()-interval '60 days',null);
update orders set created_at=now()-interval '25 hours' where id=:'cod';
set role anon;
\echo default window:
select string_agg(id||':'||status,', ') from admin_list_orders(:'tok');
\echo 90 days:
select count(*) from admin_list_orders(:'tok',1500,90);
\echo all:
select count(*) from admin_list_orders(:'tok',1500,0);
reset role;
select stock from products where id=1;
select status_note from orders where id=:'cod';
