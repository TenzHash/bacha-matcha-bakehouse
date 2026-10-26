\set ON_ERROR_STOP 0
\pset tuples_only on
set role anon;
\echo == anon direct access
select count(*) from products;
select count(*) from orders;
insert into orders(id,customer_name) values('X','x');
update products set stock=999;
select count(*) from admin_settings;
select admin_login('0000');
select admin_login('1111');
\echo == default pin login -> must_change
select admin_login('1234') as r \gset
select (:'r'::jsonb->>'token') as tok \gset
select admin_check(:'tok');
\echo == gated until pin changed
select admin_list_orders(:'tok');
select admin_change_pin(:'tok','1234','123456');
select admin_change_pin(:'tok','1234','abc');
select admin_change_pin(:'tok','1234','Bacha2026!');
select count(*) from admin_list_orders(:'tok');
select admin_check('x');
\echo == place order: store open, receipt missing
select place_order('{"name":"A","contact":"0917 123 4567","notes":"n","fulfillment":"pickup","payment_method":"COD","items":[{"id":7,"qty":2}]}');
select place_order('{"name":"A","contact":"0917 123 4567","notes":"n","fulfillment":"delivery","delivery_address":"x","maps_link":"https://m","payment_method":"COD","items":[{"id":7,"qty":2}]}') as o \gset
select :'o'::jsonb;
\echo (expect total 240 and stock 13)
reset role;
select stock from products where id=7;
set role anon;
\echo == client-sent price ignored; box w/ drink rejected
select place_order('{"name":"A","contact":"09171234567","notes":"n","fulfillment":"delivery","delivery_address":"x","maps_link":"https://m","payment_method":"COD","items":[{"id":1,"qty":1,"price":0}]}');
select place_order('{"name":"A","contact":"09171234567","notes":"n","fulfillment":"delivery","delivery_address":"x","maps_link":"https://m","payment_method":"COD","items":[{"id":1,"qty":99999}]}');
\echo == track
select track_order((:'o'::jsonb)->>'id','09171234567')->>'status';
select track_order((:'o'::jsonb)->>'id','09999999999');
select track_order((:'o'::jsonb)->>'id','+63 917-123-4567')->>'total_amount';
\echo == status transitions
select admin_set_order_status(:'tok',(:'o'::jsonb)->>'id','Completed');
select admin_set_order_status(:'tok',(:'o'::jsonb)->>'id','Payment Rejected');
select admin_set_order_status(:'tok',(:'o'::jsonb)->>'id','Payment Rejected');
reset role;
select stock from products where id=7;
set role anon;
\echo == pos sale
select admin_pos_sale(:'tok','{"payment":"Cash Walk-in","items":[{"id":1,"qty":3},{"id":1,"qty":2}]}')->>'total_amount';
select admin_pos_sale(:'tok','{"payment":"Cash Walk-in","items":[{"id":1,"qty":999}]}');
select drinks_sold_today();
\echo == product save / xss image
select admin_save_product(:'tok','{"name":"Test","price":50,"max_stock":5,"image":"javascript:alert(1)"}');
select admin_save_product(:'tok','{"name":"Test","price":50,"max_stock":5}')->>'id';
select admin_set_setting(:'tok','store_mode','closed');
select admin_set_setting(:'tok','store_mode','day_off');
select place_order('{"name":"A","contact":"09171234567","notes":"n","items":[{"id":1,"qty":1}],"payment_method":"GCash"}');
select admin_set_setting(:'tok','store_mode','open');
\echo == logout
select admin_logout(:'tok');
select admin_list_orders(:'tok');
\echo == lockout
select admin_login('a'); select admin_login('b'); select admin_login('c'); select admin_login('d'); select admin_login('e');
select admin_login('Bacha2026!');
