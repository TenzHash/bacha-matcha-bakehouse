\pset tuples_only on
reset role;
insert into storage.objects(bucket_id,name) values('gcash-receipts','abc/0123456789abcdef0123456789abcdef.jpg');
set role anon;
select place_order('{"name":"B","contact":"09171234567","notes":"n","fulfillment":"pickup","payment_method":"GCash","receipt_url":"https://x.supabase.co/storage/v1/object/public/gcash-receipts/abc/0123456789abcdef0123456789abcdef.jpg","boxes":[{"batchDate":"Batch: Friday, Oct 30","item_ids":[1,2,3,4,5,6]}]}');
\echo bad receipt:
select place_order('{"name":"B","contact":"09171234567","notes":"n","payment_method":"GCash","receipt_url":"https://x.supabase.co/storage/v1/object/public/gcash-receipts/nope.jpg","boxes":[{"batchDate":"Batch: Friday, Oct 30","item_ids":[1,2,3,4,5,6]}]}');
\echo wrong day (Saturday):
select place_order('{"name":"B","contact":"09171234567","notes":"n","payment_method":"COD","fulfillment":"delivery","delivery_address":"a","maps_link":"http://m","boxes":[{"batchDate":"Batch: Saturday, Oct 31","item_ids":[1,2,3,4,5,6]}]}');
\echo past:
select place_order('{"name":"B","contact":"09171234567","notes":"n","payment_method":"COD","fulfillment":"delivery","delivery_address":"a","maps_link":"http://m","boxes":[{"batchDate":"Batch: Friday, Oct 23","item_ids":[1,2,3,4,5,6]}]}');
\echo 5 items box:
select place_order('{"name":"B","contact":"09171234567","notes":"n","payment_method":"COD","fulfillment":"delivery","delivery_address":"a","maps_link":"http://m","boxes":[{"batchDate":"Batch: Friday, Oct 30","item_ids":[1,2,3,4,5]}]}');
\echo drink in box:
select place_order('{"name":"B","contact":"09171234567","notes":"n","payment_method":"COD","fulfillment":"delivery","delivery_address":"a","maps_link":"http://m","boxes":[{"batchDate":"Batch: Friday, Oct 30","item_ids":[1,2,3,4,5,7]}]}');
reset role;
select id,total_amount,boxes from orders where id like 'BOX%';
select id,stock from products order by id limit 3;
