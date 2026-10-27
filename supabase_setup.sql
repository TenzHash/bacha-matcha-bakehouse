-- =====================================================================
-- BACHA MATCHA & BAKEHOUSE - COMPLETE DATABASE SETUP (fresh project)
-- Supabase Dashboard > SQL Editor > New query > paste all > Run
-- Safe to re-run. First login PIN: 1234 - the app FORCES you to change it before anything else works
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. PRODUCTS (cookies, drinks, pastries/bundles)
-- ---------------------------------------------------------------------
create table if not exists products (
  id          bigint primary key,
  name        text not null,
  price       numeric(10,2) not null default 0,
  stock       integer not null default 0 check (stock >= 0),
  max_stock   integer not null default 30,
  promo_tag   text default '',
  description text default '',
  image       text default 'images/classic.png',
  is_active   boolean not null default true,
  category    text not null default 'Cookies' check (category in ('Cookies','Drinks','Pastries')),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. ORDERS (online box pre-orders, online ala-carte, in-store POS)
-- ---------------------------------------------------------------------
create table if not exists orders (
  id             text primary key,                        -- BOX-1234 / ORD-1234 / POS-1234
  customer_name  text not null,
  contact_number text default '',
  gcash_ref      text,                                    -- no longer required (screenshot-only)
  receipt_url    text,                                    -- GCash screenshot (null for POS)
  notes          text default '',
  batch_date     text default '',
  boxes          jsonb not null default '[]'::jsonb,      -- [{name,batchDate,price,items:[flavor names]}]
  items          jsonb not null default '[]'::jsonb,      -- [{id,name,qty,unit_price}]
  order_type     text not null default 'online' check (order_type in ('online','pos')),
  payment_method text default 'GCash',                    -- GCash | COD | Cash Walk-in | GCash Counter
  fulfillment    text default 'pickup',                   -- pickup | delivery
  delivery_address text,
  maps_link      text,                                    -- customer's Google Maps pin
  total_amount   numeric(10,2) not null default 0,
  status         text not null default 'Payment Verification Required',
  created_at     timestamptz not null default now()
);
create index if not exists orders_created_idx on orders (created_at desc);
create index if not exists orders_type_idx on orders (order_type);

-- ---------------------------------------------------------------------
-- 3. STORE SETTINGS (storefront display mode: box | singles | both)
-- ---------------------------------------------------------------------
create table if not exists store_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
insert into store_settings (key, value) values ('display_mode', 'both')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 4. ADMIN PIN (stored hashed; no direct table access from the app)
-- ---------------------------------------------------------------------
create table if not exists admin_settings (
  id       integer primary key default 1 check (id = 1),
  pin_hash text not null
);
insert into admin_settings (id, pin_hash)
values (1, extensions.crypt('1234', extensions.gen_salt('bf')))
on conflict (id) do nothing;


-- =====================================================================
-- SECURITY LAYER (Part 4)
-- Customers can only: read the menu + public settings, place an order,
-- track their own order (order ID + phone), upload a receipt photo.
-- Everything else needs an admin session (PIN login -> temporary token).
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Admin lockout / sessions / rate limiting
-- ---------------------------------------------------------------------
alter table admin_settings add column if not exists fail_count   integer not null default 0;
alter table admin_settings add column if not exists locked_until timestamptz;
alter table admin_settings add column if not exists pin_changed  boolean;
-- Existing installs: if the PIN is already not 1234, treat it as changed.
update admin_settings set pin_changed = not (pin_hash = extensions.crypt('1234', pin_hash)) where pin_changed is null;
alter table admin_settings alter column pin_changed set default false;
alter table admin_settings alter column pin_changed set not null;

create table if not exists admin_sessions (
  token_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create table if not exists rate_events (
  id   bigserial primary key,
  kind text not null,
  at   timestamptz not null default now()
);
create index if not exists rate_events_idx on rate_events (kind, at);
alter table admin_sessions enable row level security;
alter table rate_events    enable row level security;

-- old, brute-forceable / unauthenticated entry points are removed
drop function if exists verify_admin_pin(text);
drop function if exists reset_admin_pin(text, text);
drop function if exists reject_and_refund_order(text);

-- ---------------------------------------------------------------------
-- B. Internal helpers (not callable from the browser)
-- ---------------------------------------------------------------------
create or replace function _admin_guard(p_token text, p_allow_default boolean default false) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_ok boolean; v_changed boolean;
begin
  if p_token is null or length(p_token) < 32 then raise exception 'not_admin' using errcode = '28000'; end if;
  select exists (select 1 from admin_sessions where token_hash = encode(digest(p_token, 'sha256'), 'hex') and expires_at > now()) into v_ok;
  if not v_ok then raise exception 'not_admin' using errcode = '28000'; end if;
  select pin_changed into v_changed from admin_settings where id = 1;
  if not v_changed and not p_allow_default then raise exception 'change_pin_first' using errcode = '28000'; end if;
end $$;

create or replace function _norm_phone(p text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case
    when d ~ '^09[0-9]{9}$'  then d
    when d ~ '^639[0-9]{9}$' then '0' || substr(d, 3)
    when d ~ '^9[0-9]{9}$'   then '0' || d
    else null end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) s;
$$;

create or replace function _safe_img(p text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p ~ '^images/[A-Za-z0-9_.-]{1,80}$'
      or p ~ '^https://[a-z0-9.-]+/storage/v1/object/public/gcash-receipts/[A-Za-z0-9_./-]{1,200}$';
$$;

create or replace function _new_order_id(p_prefix text) returns text
language plpgsql set search_path = public, extensions, pg_temp as $$
declare a constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; r text; i int; tries int := 0;
begin
  loop
    r := p_prefix || '-';
    for i in 1..5 loop r := r || substr(a, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1); end loop;
    exit when not exists (select 1 from orders where id = r);
    tries := tries + 1;
    if tries > 20 then raise exception 'id_failed'; end if;
  end loop;
  return r;
end $$;

-- put an order's items back into stock (by product id; older orders fall back to names)
create or replace function _restock_order(o orders) returns text[]
language plpgsql set search_path = public, pg_temp as $$
declare b jsonb; it jsonb; v text; nm text; missing text[] := '{}'; pid bigint; q int;
begin
  for b in select value from jsonb_array_elements(coalesce(o.boxes, '[]'::jsonb)) loop
    if jsonb_typeof(b->'item_ids') = 'array' and jsonb_array_length(b->'item_ids') = jsonb_array_length(coalesce(b->'items', '[]'::jsonb)) then
      for v in select jsonb_array_elements_text(b->'item_ids') loop
        update products set stock = stock + 1 where id = v::bigint;
        if not found then missing := missing || v; end if;
      end loop;
    else
      for nm in select jsonb_array_elements_text(coalesce(b->'items', '[]'::jsonb)) loop
        select id into pid from products where name = nm order by id limit 1;
        if pid is null then missing := missing || nm; else update products set stock = stock + 1 where id = pid; end if;
      end loop;
    end if;
  end loop;
  for it in select value from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) loop
    q := coalesce((it->>'qty')::int, 0);
    update products set stock = stock + q where id = (it->>'id')::bigint;
    if not found then
      select id into pid from products where name = it->>'name' order by id limit 1;
      if pid is null then missing := missing || coalesce(it->>'name', '?'); else update products set stock = stock + q where id = pid; end if;
    end if;
  end loop;
  return missing;
end $$;

-- is this bake date still open? (uses the cut-off saved in Store Control)
create or replace function _batch_open(p_label text) returns boolean
language plpgsql set search_path = public, pg_temp as $$
declare cfg jsonb; days int[]; before int := 1; t time := '20:00'; mon text; dd int; m int; y int; d date; ln timestamp; mons text[] := array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
begin
  begin select value::jsonb into cfg from store_settings where key = 'deadline_settings'; exception when others then cfg := null; end;
  days := array[5];
  if cfg is not null then
    if jsonb_typeof(cfg->'batchDays') = 'array' then
      days := array(select jsonb_array_elements_text(cfg->'batchDays')::int);
      before := coalesce((cfg->>'daysBefore')::int, 1);
    end if;
    begin t := coalesce((cfg->>'time')::time, t); exception when others then t := '20:00'; end;
  end if;
  mon := substring(coalesce(p_label, '') from '([A-Za-z]{3}) [0-9]{1,2}$');
  dd  := substring(coalesce(p_label, '') from '([0-9]{1,2})$')::int;
  m   := array_position(mons, mon);
  if m is null or dd is null then return false; end if;
  ln := now() at time zone 'Asia/Manila';
  y := extract(year from ln)::int;
  begin d := make_date(y, m, dd); exception when others then return false; end;
  if d < ln::date - 30 then begin d := make_date(y + 1, m, dd); exception when others then return false; end; end if;
  if not (extract(dow from d)::int = any(days)) then return false; end if;
  return ln < ((d - before) + t);
end $$;

-- ---------------------------------------------------------------------
-- C. Admin login / logout / PIN
-- ---------------------------------------------------------------------
create or replace function admin_login(input_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s admin_settings%rowtype; tok text; n int;
begin
  select * into s from admin_settings where id = 1 for update;      -- serialises attempts
  if s.locked_until is not null and s.locked_until > now() then
    return jsonb_build_object('ok', false, 'locked', true, 'retry_seconds', ceil(extract(epoch from (s.locked_until - now())))::int);
  end if;
  if input_pin is null or s.pin_hash <> crypt(input_pin, s.pin_hash) then
    perform pg_sleep(1);
    n := s.fail_count + 1;
    update admin_settings set fail_count = case when n >= 5 then 0 else n end,
                              locked_until = case when n >= 5 then now() + interval '15 minutes' else null end where id = 1;
    if n >= 5 then perform _log('Sign-in locked', '5 wrong PIN tries in a row'); end if;
    return jsonb_build_object('ok', false, 'locked', n >= 5, 'retry_seconds', case when n >= 5 then 900 else 0 end, 'attempts_left', greatest(0, 5 - n));
  end if;
  update admin_settings set fail_count = 0, locked_until = null where id = 1;
  delete from admin_sessions where expires_at < now();
  tok := encode(gen_random_bytes(32), 'hex');
  insert into admin_sessions (token_hash, expires_at) values (encode(digest(tok, 'sha256'), 'hex'), now() + interval '12 hours');
  perform _log('Signed in', '');
  return jsonb_build_object('ok', true, 'token', tok, 'must_change', not s.pin_changed);
end $$;

create or replace function admin_check(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare ok boolean; ch boolean;
begin
  select exists (select 1 from admin_sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and expires_at > now()) into ok;
  select pin_changed into ch from admin_settings where id = 1;
  return jsonb_build_object('ok', ok, 'must_change', ok and not ch);
end $$;

create or replace function admin_logout(p_token text) returns void
language sql security definer set search_path = public, extensions, pg_temp as $$
  delete from admin_sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function admin_change_pin(p_token text, current_pin text, new_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s admin_settings%rowtype;
begin
  perform _admin_guard(p_token, true);
  select * into s from admin_settings where id = 1 for update;
  if s.locked_until is not null and s.locked_until > now() then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  if current_pin is null or s.pin_hash <> crypt(current_pin, s.pin_hash) then
    perform pg_sleep(1);
    update admin_settings set fail_count = fail_count + 1,
      locked_until = case when fail_count + 1 >= 5 then now() + interval '15 minutes' else null end where id = 1;
    update admin_settings set fail_count = 0 where id = 1 and fail_count >= 5;
    return jsonb_build_object('ok', false, 'error', 'wrong_pin');
  end if;
  if length(coalesce(new_pin, '')) < 6 then return jsonb_build_object('ok', false, 'error', 'too_short'); end if;
  if new_pin in ('123456','1234567','12345678','000000','111111','222222','333333','444444','555555','666666','777777','888888','999999','654321','123123','121212','112233') or new_pin = current_pin then
    return jsonb_build_object('ok', false, 'error', 'too_weak');
  end if;
  update admin_settings set pin_hash = crypt(new_pin, gen_salt('bf')), pin_changed = true, fail_count = 0, locked_until = null where id = 1;
  delete from admin_sessions where token_hash <> encode(digest(p_token, 'sha256'), 'hex');   -- sign out other devices
  perform _log('Admin PIN changed', '');
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- D. Admin: orders
-- ---------------------------------------------------------------------
-- COD orders nobody confirmed within 24 hours are cancelled and their stock goes back on the shelf.
-- (GCash orders are never auto-cancelled: the customer already paid, the app just shows an "overdue" badge.)
-- Runs by itself whenever the admin screen refreshes or a customer orders - no scheduler needed.
create or replace function _expire_stale() returns int
language plpgsql set search_path = public, extensions, pg_temp as $$
declare o orders%rowtype; n int := 0;
begin
  for o in select * from orders where status = 'COD - Awaiting Confirmation' and order_type = 'online' and created_at < now() - interval '24 hours' for update skip locked loop
    update orders set status = 'Cancelled', status_note = 'Auto-cancelled: not confirmed within 24 hours' where id = o.id;
    perform _restock_order(o);
    n := n + 1;
  end loop;
  return n;
end $$;

drop function if exists admin_list_orders(text, int);
-- Open orders always load; finished ones only within the last p_days days (0 = everything).
create or replace function admin_list_orders(p_token text, p_limit int default 1500, p_days int default 30) returns setof orders
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform _admin_guard(p_token);
  perform _expire_stale();
  return query select * from orders
    where coalesce(p_days, 30) <= 0 or created_at > now() - make_interval(days => least(p_days, 3650))
       or status in ('Payment Verification Required', 'COD - Awaiting Confirmation', 'Payment Verified / Queued', 'Ready')
    order by created_at desc limit least(greatest(coalesce(p_limit, 1500), 1), 10000);
end $$;

create or replace function admin_set_order_status(p_token text, p_id text, p_to text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare o orders%rowtype; allowed text[]; missing text[] := '{}';
begin
  perform _admin_guard(p_token);
  allowed := case p_to
    when 'Payment Verified / Queued' then array['Payment Verification Required', 'COD - Awaiting Confirmation']
    when 'Payment Rejected'          then array['Payment Verification Required', 'COD - Awaiting Confirmation']
    when 'Ready'                     then array['Payment Verified / Queued']
    when 'Completed'                 then array['Ready']
    when 'Cancelled'                 then array['Payment Verified / Queued', 'Ready']
    when 'Voided (POS)'              then array['Completed (POS)']
    else null end;
  if allowed is null then raise exception 'bad_status'; end if;
  select * into o from orders where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'missing', true); end if;
  if not (o.status = any(allowed)) then return jsonb_build_object('ok', false, 'stale', true, 'status', o.status); end if;
  update orders set status = p_to where id = p_id;
  if p_to in ('Payment Rejected', 'Cancelled', 'Voided (POS)') then missing := _restock_order(o); end if;
  perform _log('Order → ' || p_to, p_id);
  return jsonb_build_object('ok', true, 'unmatched', to_jsonb(missing));
end $$;

create or replace function admin_delete_order(p_token text, p_id text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n int;
begin
  perform _admin_guard(p_token);
  delete from orders where id = p_id and status in ('Payment Rejected', 'Cancelled', 'Voided (POS)');
  get diagnostics n = row_count;
  if n > 0 then perform _log('Order record deleted', p_id); end if;
  return jsonb_build_object('ok', n > 0);
end $$;

-- ---------------------------------------------------------------------
-- E. Admin: products, stock, settings
-- ---------------------------------------------------------------------
create or replace function admin_adjust_stock(p_token text, p_id bigint, p_delta int) returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v int;
begin
  perform _admin_guard(p_token);
  update products set stock = greatest(0, stock + least(greatest(coalesce(p_delta, 0), -1000), 1000)) where id = p_id returning stock into v;
  if not found then raise exception 'no_product'; end if;
  perform _log('Stock adjusted', 'product #' || p_id || ' by ' || p_delta || ' (now ' || v || ')');
  return v;
end $$;

create or replace function admin_restock_all(p_token text, p_amount int) returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n int;
begin
  perform _admin_guard(p_token);
  if p_amount is null or p_amount < 1 or p_amount > 1000 then raise exception 'bad_amount'; end if;
  update products set stock = stock + p_amount where is_active;
  get diagnostics n = row_count;
  perform _log('Added stock to all flavors', '+' || p_amount || ' each');
  return n;
end $$;

create or replace function admin_refill_all(p_token text) returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n int;
begin
  perform _admin_guard(p_token);
  update products set stock = max_stock;
  get diagnostics n = row_count;
  perform _log('Refilled all stock to capacity', '');
  return n;
end $$;

create or replace function admin_save_product(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_id bigint := nullif(p->>'id', '')::bigint; v_name text := btrim(coalesce(p->>'name', '')); v_price numeric; v_max int; v_cat text := coalesce(p->>'category', 'Cookies');
        v_promo text := left(btrim(coalesce(p->>'promo_tag', '')), 30); v_desc text := left(btrim(coalesce(p->>'description', '')), 300); v_img text := p->>'image'; v_row products%rowtype; v_new boolean := false;
begin
  perform _admin_guard(p_token);
  if length(v_name) < 1 or length(v_name) > 80 then raise exception 'bad_name'; end if;
  begin v_price := (p->>'price')::numeric; exception when others then raise exception 'bad_price'; end;
  if v_price is null or v_price <= 0 or v_price > 100000 then raise exception 'bad_price'; end if;
  begin v_max := (p->>'max_stock')::int; exception when others then raise exception 'bad_capacity'; end;
  if v_max is null or v_max < 1 or v_max > 10000 then raise exception 'bad_capacity'; end if;
  if v_cat not in ('Cookies', 'Drinks', 'Pastries') then raise exception 'bad_category'; end if;
  if v_img is not null and not _safe_img(v_img) then raise exception 'bad_image'; end if;
  if exists (select 1 from products where upper(name) = upper(v_name) and id is distinct from v_id) then raise exception 'duplicate_name'; end if;
  if v_id is not null then select * into v_row from products where id = v_id for update; end if;
  if v_id is null or not found then
    v_new := true;
    if v_id is null then select coalesce(max(id), 0) + 1 into v_id from products; end if;
    insert into products (id, name, price, stock, max_stock, promo_tag, description, image, is_active, category)
    values (v_id, v_name, v_price, coalesce(nullif(p->>'stock', '')::int, v_max), v_max, v_promo, v_desc, coalesce(v_img, 'images/classic.png'), coalesce((p->>'is_active')::boolean, true), v_cat)
    returning * into v_row;
  else
    update products set name = v_name, price = v_price, max_stock = v_max, promo_tag = v_promo, description = v_desc, category = v_cat,
                        image = coalesce(v_img, image), is_active = coalesce((p->>'is_active')::boolean, is_active)
    where id = v_id returning * into v_row;
  end if;
  perform _log(case when v_new then 'Menu item added' else 'Menu item edited' end, v_row.name || ' (₱' || v_row.price || ')');
  return to_jsonb(v_row) || jsonb_build_object('created', v_new);
end $$;

create or replace function admin_set_product_active(p_token text, p_id bigint, p_active boolean) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform _admin_guard(p_token);
  update products set is_active = coalesce(p_active, true) where id = p_id;
  perform _log('Item ' || case when coalesce(p_active, true) then 'made available' else 'made unavailable' end, 'product #' || p_id);
  return true;
end $$;

create or replace function admin_delete_product(p_token text, p_id bigint) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform _admin_guard(p_token);
  delete from products where id = p_id;
  perform _log('Menu item deleted', 'product #' || p_id);
  return true;
end $$;

create or replace function admin_set_setting(p_token text, p_key text, p_value text) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare j jsonb;
begin
  perform _admin_guard(p_token);
  if p_key not in ('store_mode', 'display_mode', 'dayoff_message', 'app_config', 'deadline_settings') then raise exception 'bad_key'; end if;
  if p_key = 'store_mode'  and p_value not in ('open', 'batch_closed', 'day_off') then raise exception 'bad_value'; end if;
  if p_key = 'display_mode' and p_value not in ('box', 'singles', 'both') then raise exception 'bad_value'; end if;
  if p_key = 'dayoff_message' and length(coalesce(p_value, '')) > 300 then raise exception 'bad_value'; end if;
  if p_key in ('app_config', 'deadline_settings') then
    if length(coalesce(p_value, '')) > 4000 then raise exception 'bad_value'; end if;
    begin j := p_value::jsonb; exception when others then raise exception 'bad_value'; end;
    if jsonb_typeof(j) <> 'object' then raise exception 'bad_value'; end if;
  end if;
  insert into store_settings (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform _log('Setting changed', p_key || case when p_key in ('store_mode', 'display_mode') then ' = ' || p_value else '' end);
  return true;
end $$;

-- ---------------------------------------------------------------------
-- F. Counter (POS) sale: prices + stock handled on the server
-- ---------------------------------------------------------------------
create or replace function admin_pos_sale(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare it jsonb; v_id bigint; v_qty int; need jsonb := '{}'::jsonb; r record; pr products%rowtype; total numeric := 0; lines jsonb := '[]'::jsonb;
        v_pay text := coalesce(p->>'payment', 'Cash Walk-in'); v_name text := left(btrim(coalesce(p->>'customer', '')), 80); v_order orders%rowtype;
begin
  perform _admin_guard(p_token);
  if v_pay not in ('Cash Walk-in', 'GCash Counter') then raise exception 'bad_payment'; end if;
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 or jsonb_array_length(p->'items') > 60 then raise exception 'empty_ticket'; end if;
  for it in select value from jsonb_array_elements(p->'items') loop
    v_id := (it->>'id')::bigint; v_qty := (it->>'qty')::int;
    if v_qty is null or v_qty < 1 or v_qty > 100 then raise exception 'bad_qty'; end if;
    need := jsonb_set(need, array[v_id::text], to_jsonb(coalesce((need->>v_id::text)::int, 0) + v_qty));
  end loop;
  for r in select key::bigint as id, value::int as qty from jsonb_each_text(need) order by key::bigint loop
    select * into pr from products where id = r.id for update;
    if not found or not pr.is_active then raise exception 'no_product:%', r.id; end if;
    if pr.stock < r.qty then raise exception 'out_of_stock:%', pr.name; end if;
    update products set stock = stock - r.qty where id = r.id;
    total := total + pr.price * r.qty;
    lines := lines || jsonb_build_array(jsonb_build_object('id', pr.id, 'name', pr.name, 'category', pr.category, 'qty', r.qty, 'unit_price', pr.price));
  end loop;
  insert into orders (id, customer_name, contact_number, notes, batch_date, boxes, items, order_type, payment_method, total_amount, status)
  values (_new_order_id('POS'), coalesce(nullif(v_name, ''), 'Walk-in'), '—', 'In-store POS sale', 'In-Store', '[]'::jsonb, lines, 'pos', v_pay, total, 'Completed (POS)')
  returning * into v_order;
  perform _log('POS sale', v_order.id || ' ₱' || total || ' ' || v_pay);
  return to_jsonb(v_order);
end $$;

-- ---------------------------------------------------------------------
-- G. Customers: place an order (server computes the total + stock)
-- ---------------------------------------------------------------------
create or replace function place_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_mode text; v_cfg jsonb := '{}'::jsonb; v_name text; v_phone text; v_note text; v_ful text; v_pay text; v_addr text; v_maps text; v_receipt text;
  b jsonb; it jsonb; v text; v_id bigint; v_qty int; need jsonb := '{}'::jsonb; r record; pr products%rowtype;
  prices jsonb := '{}'::jsonb; boxes jsonb := '[]'::jsonb; items jsonb := '[]'::jsonb; total numeric := 0; box_total numeric; box_names jsonb; box_ids jsonb; n_boxes int := 0;
  n_drinks int := 0; drinks_today int; v_batch text; first_batch text; v_status text; v_oid text; v_prefix text; v_min numeric; c text;
begin
  perform _expire_stale();
  select value into v_mode from store_settings where key = 'store_mode';
  if coalesce(v_mode, 'open') <> 'open' then raise exception 'store_closed'; end if;
  begin select value::jsonb into v_cfg from store_settings where key = 'app_config'; exception when others then v_cfg := '{}'::jsonb; end;
  v_cfg := coalesce(v_cfg, '{}'::jsonb);

  v_name := left(btrim(coalesce(p->>'name', '')), 80);
  v_phone := _norm_phone(p->>'contact');
  v_note := left(btrim(coalesce(p->>'notes', '')), 300);
  v_ful := coalesce(p->>'fulfillment', 'pickup');
  v_pay := coalesce(p->>'payment_method', 'GCash');
  v_addr := left(btrim(coalesce(p->>'delivery_address', '')), 300);
  v_maps := left(btrim(coalesce(p->>'maps_link', '')), 500);
  v_receipt := p->>'receipt_url';
  if length(v_name) < 1 then raise exception 'bad_name'; end if;
  if v_phone is null then raise exception 'bad_phone'; end if;
  if length(v_note) < 1 then raise exception 'bad_notes'; end if;
  if v_ful not in ('pickup', 'delivery') then raise exception 'bad_fulfillment'; end if;
  if v_pay not in ('GCash', 'COD') or (v_pay = 'COD' and v_ful <> 'delivery') then raise exception 'bad_payment'; end if;
  if v_ful = 'delivery' and (length(v_addr) < 1 or v_maps !~ '^https?://') then raise exception 'bad_address'; end if;
  if v_pay = 'GCash' then
    if v_receipt is null or not _safe_img(v_receipt) or v_receipt like 'images/%' then raise exception 'bad_receipt'; end if;
    if to_regclass('storage.objects') is not null
       and not exists (select 1 from storage.objects where bucket_id = 'gcash-receipts' and name = substring(v_receipt from '/gcash-receipts/(.*)$')) then
      raise exception 'bad_receipt';
    end if;
  else v_receipt := null; end if;

  -- boxes of 6 cookies
  if jsonb_typeof(coalesce(p->'boxes', '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p->'items', '[]'::jsonb)) <> 'array' then raise exception 'bad_cart'; end if;
  for b in select value from jsonb_array_elements(coalesce(p->'boxes', '[]'::jsonb)) loop
    n_boxes := n_boxes + 1;
    if jsonb_typeof(b->'item_ids') <> 'array' or jsonb_array_length(b->'item_ids') <> 6 then raise exception 'bad_box'; end if;
    v_batch := left(coalesce(b->>'batchDate', ''), 60);
    if not _batch_open(v_batch) then raise exception 'cutoff_passed:%', v_batch; end if;
    if first_batch is null then first_batch := v_batch; end if;
    for v in select jsonb_array_elements_text(b->'item_ids') loop
      need := jsonb_set(need, array[v], to_jsonb(coalesce((need->>v)::int, 0) + 1));
    end loop;
  end loop;
  if n_boxes > 20 or jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) > 40 then raise exception 'bad_cart'; end if;
  if coalesce((v_cfg->>'maxBoxes')::int, 0) > 0 and n_boxes > (v_cfg->>'maxBoxes')::int then raise exception 'too_many_boxes'; end if;
  for it in select value from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    v_id := (it->>'id')::bigint; v_qty := (it->>'qty')::int;
    if v_qty is null or v_qty < 1 or v_qty > 50 then raise exception 'bad_qty'; end if;
    need := jsonb_set(need, array[v_id::text], to_jsonb(coalesce((need->>v_id::text)::int, 0) + v_qty));
  end loop;
  if n_boxes = 0 and jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then raise exception 'empty_cart'; end if;

  -- lock + check + deduct stock (in id order, so two customers never deadlock)
  for r in select key::bigint as id, value::int as qty from jsonb_each_text(need) order by key::bigint loop
    select * into pr from products where id = r.id for update;
    if not found or not pr.is_active then raise exception 'no_product:%', r.id; end if;
    if pr.stock < r.qty then raise exception 'out_of_stock:%', pr.name; end if;
    update products set stock = stock - r.qty where id = r.id;
    prices := jsonb_set(prices, array[r.id::text], jsonb_build_object('price', pr.price, 'name', pr.name, 'category', pr.category));
  end loop;

  -- build boxes + lines with SERVER prices
  for b in select value from jsonb_array_elements(coalesce(p->'boxes', '[]'::jsonb)) loop
    box_total := 0; box_names := '[]'::jsonb; box_ids := '[]'::jsonb;
    for v in select jsonb_array_elements_text(b->'item_ids') loop
      if prices->v->>'category' <> 'Cookies' then raise exception 'bad_box'; end if;
      box_total := box_total + (prices->v->>'price')::numeric;
      box_names := box_names || to_jsonb(prices->v->>'name');
      box_ids := box_ids || to_jsonb(v::bigint);
    end loop;
    total := total + box_total;
    boxes := boxes || jsonb_build_array(jsonb_build_object('name', 'Custom Box of 6', 'batchDate', left(b->>'batchDate', 60), 'price', box_total, 'items', box_names, 'item_ids', box_ids));
  end loop;
  for it in select value from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    v_id := (it->>'id')::bigint; v_qty := (it->>'qty')::int; c := prices->(v_id::text)->>'category';
    total := total + (prices->(v_id::text)->>'price')::numeric * v_qty;
    if c = 'Drinks' then n_drinks := n_drinks + v_qty; end if;
    items := items || jsonb_build_array(jsonb_build_object('id', v_id, 'name', prices->(v_id::text)->>'name', 'category', c, 'qty', v_qty, 'unit_price', (prices->(v_id::text)->>'price')::numeric));
  end loop;

  if coalesce((v_cfg->>'maxDrinks')::int, 0) > 0 and n_drinks > (v_cfg->>'maxDrinks')::int then raise exception 'too_many_drinks'; end if;
  if coalesce((v_cfg->>'dailyDrinks')::int, 0) > 0 and n_drinks > 0 then
    drinks_today := drinks_sold_today();
    if drinks_today + n_drinks > (v_cfg->>'dailyDrinks')::int then raise exception 'daily_drink_limit'; end if;
  end if;
  v_min := coalesce((v_cfg->>'freeDeliveryMin')::numeric, 0);
  if v_ful = 'delivery' and v_min > 0 and total < v_min then raise exception 'delivery_min:%', v_min; end if;

  v_status := case when v_pay = 'COD' then 'COD - Awaiting Confirmation' else 'Payment Verification Required' end;
  v_prefix := case when n_boxes > 0 then 'BOX' else 'ORD' end;
  v_oid := _new_order_id(v_prefix);
  insert into orders (id, customer_name, contact_number, receipt_url, notes, batch_date, boxes, items, order_type, payment_method, fulfillment, delivery_address, maps_link, total_amount, status)
  values (v_oid, v_name, v_phone, v_receipt, v_note, coalesce(first_batch, 'Counter Pick-up / Ala-Carte'), boxes, items, 'online', v_pay, v_ful,
          case when v_ful = 'delivery' then v_addr end, case when v_ful = 'delivery' then v_maps end, total, v_status);
  return jsonb_build_object('id', v_oid, 'total', total, 'status', v_status);
end $$;

-- drinks already ordered today (Philippine time), used for the daily drink limit
create or replace function drinks_sold_today() returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum((i->>'qty')::int), 0)::int
  from orders o, jsonb_array_elements(o.items) i
  where (o.created_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date
    and o.status not in ('Payment Rejected', 'Cancelled', 'Voided (POS)')
    and i->>'category' = 'Drinks';
$$;

-- ---------------------------------------------------------------------
-- H. Customers: track one order (needs the order ID AND the phone number)
-- ---------------------------------------------------------------------
create or replace function track_order(p_id text, p_contact text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare o orders%rowtype; recent int;
begin
  delete from rate_events where at < now() - interval '1 hour';
  select count(*) into recent from rate_events where kind = 'track_fail' and at > now() - interval '1 minute';
  if recent >= 60 then raise exception 'too_many_requests'; end if;
  select * into o from orders where id = upper(btrim(coalesce(p_id, ''))) and order_type = 'online';
  if not found or _norm_phone(o.contact_number) is distinct from _norm_phone(p_contact) or _norm_phone(p_contact) is null then
    insert into rate_events (kind) values ('track_fail');
    perform pg_sleep(0.4);
    return null;
  end if;
  return jsonb_build_object('id', o.id, 'status', o.status, 'status_note', o.status_note, 'customer_name', o.customer_name, 'contact_number', o.contact_number, 'notes', o.notes,
    'batch_date', o.batch_date, 'boxes', o.boxes, 'items', o.items, 'payment_method', o.payment_method, 'fulfillment', o.fulfillment,
    'delivery_address', o.delivery_address, 'total_amount', o.total_amount, 'created_at', o.created_at, 'order_type', o.order_type);
end $$;

-- ---------------------------------------------------------------------
-- J. Cash drawer, activity log, backup data, photo cleanup (Part 6)
-- ---------------------------------------------------------------------
create table if not exists activity_log (
  id     bigserial primary key,
  at     timestamptz not null default now(),
  action text not null,
  detail text not null default ''
);
create index if not exists activity_log_at on activity_log (at desc);
create table if not exists cash_days (
  day       date primary key,
  opening   numeric(10,2) not null default 0,
  counted   numeric(10,2),              -- cash counted at closing
  closed_at timestamptz
);
create table if not exists cash_entries (
  id         bigserial primary key,
  day        date not null,
  kind       text not null check (kind in ('in', 'out', 'refund')),
  amount     numeric(10,2) not null check (amount > 0),
  reason     text not null default '',
  order_id   text,
  created_at timestamptz not null default now()
);
create index if not exists cash_entries_day on cash_entries (day);
alter table activity_log  enable row level security;
alter table cash_days     enable row level security;
alter table cash_entries  enable row level security;

create or replace function _log(p_action text, p_detail text default '') returns void
language sql set search_path = public, pg_temp as $$
  insert into activity_log (action, detail) values (left(p_action, 120), left(coalesce(p_detail, ''), 300));
$$;
create or replace function _today() returns date
language sql stable set search_path = public, pg_temp as $$ select (now() at time zone 'Asia/Manila')::date; $$;

create or replace function _cash_summary(p_day date) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare d cash_days%rowtype; cs numeric; gs numeric; ci numeric; co numeric; rf numeric; ents jsonb; prev numeric; exp numeric;
begin
  select * into d from cash_days where day = p_day;
  select coalesce(sum(total_amount), 0) into cs from orders where order_type = 'pos' and status = 'Completed (POS)' and payment_method = 'Cash Walk-in' and (created_at at time zone 'Asia/Manila')::date = p_day;
  select coalesce(sum(total_amount), 0) into gs from orders where order_type = 'pos' and status = 'Completed (POS)' and payment_method = 'GCash Counter' and (created_at at time zone 'Asia/Manila')::date = p_day;
  select coalesce(sum(amount) filter (where kind = 'in'), 0), coalesce(sum(amount) filter (where kind = 'out'), 0), coalesce(sum(amount) filter (where kind = 'refund'), 0) into ci, co, rf from cash_entries where day = p_day;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb) into ents from cash_entries e where e.day = p_day;
  select counted into prev from cash_days where day < p_day and counted is not null order by day desc limit 1;
  exp := coalesce(d.opening, 0) + cs + ci - co - rf;
  return jsonb_build_object('day', p_day, 'exists', d.day is not null, 'opening', coalesce(d.opening, 0), 'counted', d.counted, 'closed', d.closed_at is not null, 'closed_at', d.closed_at,
    'cash_sales', cs, 'gcash_counter_sales', gs, 'cash_in', ci, 'cash_out', co, 'refunds', rf, 'expected', exp,
    'difference', case when d.counted is null then null else d.counted - exp end, 'last_counted', prev, 'entries', ents);
end $$;

create or replace function admin_cash_get(p_token text, p_day date default null) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform _admin_guard(p_token);
  return _cash_summary(coalesce(p_day, _today()));
end $$;

create or replace function _cash_open_check(p_day date) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  if p_day is null or p_day > _today() then raise exception 'bad_day'; end if;
  if exists (select 1 from cash_days where day = p_day and closed_at is not null) then raise exception 'day_closed'; end if;
end $$;

create or replace function admin_cash_set_opening(p_token text, p_day date, p_amount numeric) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform _admin_guard(p_token);
  p_day := coalesce(p_day, _today());
  perform _cash_open_check(p_day);
  if p_amount is null or p_amount < 0 or p_amount > 1000000 then raise exception 'bad_amount'; end if;
  insert into cash_days (day, opening) values (p_day, p_amount) on conflict (day) do update set opening = excluded.opening;
  perform _log('Opening cash set', p_day || ' ₱' || p_amount);
  return _cash_summary(p_day);
end $$;

create or replace function admin_cash_add(p_token text, p_day date, p_kind text, p_amount numeric, p_reason text, p_order_id text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_reason text := left(btrim(coalesce(p_reason, '')), 200);
begin
  perform _admin_guard(p_token);
  p_day := coalesce(p_day, _today());
  perform _cash_open_check(p_day);
  if p_kind not in ('in', 'out', 'refund') then raise exception 'bad_kind'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'bad_amount'; end if;
  if p_kind <> 'in' and length(v_reason) < 2 then raise exception 'need_reason'; end if;
  insert into cash_days (day) values (p_day) on conflict (day) do nothing;
  insert into cash_entries (day, kind, amount, reason, order_id) values (p_day, p_kind, p_amount, v_reason, nullif(left(btrim(coalesce(p_order_id, '')), 40), ''));
  perform _log('Cash ' || p_kind, '₱' || p_amount || ' - ' || v_reason);
  return _cash_summary(p_day);
end $$;

create or replace function admin_cash_delete(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare e cash_entries%rowtype;
begin
  perform _admin_guard(p_token);
  select * into e from cash_entries where id = p_id;
  if not found then raise exception 'no_entry'; end if;
  perform _cash_open_check(e.day);
  delete from cash_entries where id = p_id;
  perform _log('Cash entry removed', e.kind || ' ₱' || e.amount || ' - ' || e.reason);
  return _cash_summary(e.day);
end $$;

create or replace function admin_cash_close(p_token text, p_day date, p_counted numeric) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform _admin_guard(p_token);
  p_day := coalesce(p_day, _today());
  perform _cash_open_check(p_day);
  if p_counted is null or p_counted < 0 or p_counted > 10000000 then raise exception 'bad_amount'; end if;
  insert into cash_days (day) values (p_day) on conflict (day) do nothing;
  update cash_days set counted = p_counted, closed_at = now() where day = p_day;
  perform _log('Day closed', p_day || ' counted ₱' || p_counted);
  return _cash_summary(p_day);
end $$;

create or replace function admin_cash_reopen(p_token text, p_day date) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform _admin_guard(p_token);
  p_day := coalesce(p_day, _today());
  update cash_days set closed_at = null where day = p_day;
  perform _log('Day re-opened', p_day::text);
  return _cash_summary(p_day);
end $$;

create or replace function admin_activity(p_token text, p_limit int default 200) returns setof activity_log
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform _admin_guard(p_token);
  return query select * from activity_log order by at desc, id desc limit least(greatest(coalesce(p_limit, 200), 1), 2000);
end $$;

-- everything else a backup needs (orders come from admin_list_orders with p_days = 0)
create or replace function admin_backup_extras(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform _admin_guard(p_token);
  perform _log('Backup downloaded', '');
  return jsonb_build_object(
    'store_settings', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from store_settings t),
    'cash_days',      (select coalesce(jsonb_agg(to_jsonb(t) order by t.day), '[]'::jsonb) from cash_days t),
    'cash_entries',   (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from cash_entries t),
    'activity_log',   (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from (select * from activity_log order by id desc limit 5000) t));
end $$;

-- Receipt photos of finished orders can be removed after N days (privacy + storage space). Never touches open orders.
create or replace function admin_purge_old_receipts(p_token text, p_days int) returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n int;
begin
  perform _admin_guard(p_token);
  if p_days is null or p_days < 30 then raise exception 'bad_value'; end if;
  update orders set receipt_url = null
   where receipt_url is not null and created_at < now() - make_interval(days => p_days)
     and status in ('Completed', 'Cancelled', 'Payment Rejected', 'Voided (POS)');
  get diagnostics n = row_count;
  perform _log('Old receipt photos removed from orders', n || ' orders, older than ' || p_days || ' days');
  return n;
end $$;

-- A stored photo is "unused" when no order or menu item points to it and it is over 24 hours old.
-- The storage rules below let the app delete / see ONLY such unused files, nothing else.
create or replace function _is_orphan(p_name text) returns boolean
language sql stable security definer set search_path = public, storage, pg_temp as $$
  select coalesce((select o.created_at < now() - interval '24 hours' from storage.objects o where o.bucket_id = 'gcash-receipts' and o.name = p_name limit 1), false)
     and not exists (select 1 from orders where receipt_url is not null and right(receipt_url, length(p_name) + 1) = '/' || p_name)
     and not exists (select 1 from products where image is not null and right(image, length(p_name) + 1) = '/' || p_name);
$$;
create or replace function admin_unused_files(p_token text) returns jsonb
language plpgsql security definer set search_path = public, storage, extensions, pg_temp as $$
declare names jsonb;
begin
  perform _admin_guard(p_token);
  select coalesce(jsonb_agg(o.name), '[]'::jsonb) into names from (select name from storage.objects where bucket_id = 'gcash-receipts' and _is_orphan(name) order by created_at limit 500) o;
  return jsonb_build_object('names', names, 'count', jsonb_array_length(names));
end $$;
create or replace function admin_log_event(p_token text, p_action text, p_detail text default '') returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform _admin_guard(p_token);
  if p_action not in ('Unused photos deleted') then raise exception 'bad_value'; end if;
  perform _log(p_action, p_detail);
end $$;

-- ---------------------------------------------------------------------
-- I. Permissions: closed by default, then open only what customers need
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

alter table products       enable row level security;
alter table orders         enable row level security;
alter table store_settings enable row level security;
alter table admin_settings enable row level security;
do $$ declare t text; begin
  foreach t in array array['products', 'orders', 'store_settings'] loop
    execute format('drop policy if exists "%1$s_all" on %1$s', t);
    execute format('drop policy if exists "%1$s_read" on %1$s', t);
  end loop;
end $$;
create policy "products_read"       on products       for select to anon, authenticated using (true);
create policy "store_settings_read" on store_settings for select to anon, authenticated using (true);
grant select on products, store_settings to anon, authenticated;
-- orders, admin_settings, admin_sessions, rate_events: no policies and no grants = unreachable from the browser

grant execute on function
  admin_login(text), admin_check(text), admin_logout(text), admin_change_pin(text, text, text),
  admin_list_orders(text, int, int), admin_set_order_status(text, text, text), admin_delete_order(text, text),
  admin_adjust_stock(text, bigint, int), admin_restock_all(text, int), admin_refill_all(text),
  admin_save_product(text, jsonb), admin_set_product_active(text, bigint, boolean), admin_delete_product(text, bigint),
  admin_set_setting(text, text, text), admin_pos_sale(text, jsonb),
  place_order(jsonb), drinks_sold_today(), track_order(text, text),
  admin_cash_get(text, date), admin_cash_set_opening(text, date, numeric), admin_cash_add(text, date, text, numeric, text, text),
  admin_cash_delete(text, bigint), admin_cash_close(text, date, numeric), admin_cash_reopen(text, date),
  admin_activity(text, int), admin_backup_extras(text), admin_purge_old_receipts(text, int), admin_unused_files(text), admin_log_event(text, text, text),
  _is_orphan(text)
to anon, authenticated;

-- ---------------------------------------------------------------------
-- STORAGE (GCash screenshots + product photos)
-- Upload only: photos up to 5 MB, jpeg/png/webp. Nobody can list the bucket;
-- files are only reachable through their long random link.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gcash-receipts', 'gcash-receipts', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "bacha_files_read"   on storage.objects;
drop policy if exists "bacha_files_upload" on storage.objects;
create policy "bacha_files_upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'gcash-receipts' and name ~ '^[A-Za-z0-9_-]{1,40}/[a-f0-9]{32}\.(jpg|png|webp)$');
drop policy if exists "bacha_files_unused_read"   on storage.objects;
drop policy if exists "bacha_files_unused_delete" on storage.objects;
create policy "bacha_files_unused_read"   on storage.objects for select to anon, authenticated using (bucket_id = 'gcash-receipts' and public._is_orphan(name));
create policy "bacha_files_unused_delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'gcash-receipts' and public._is_orphan(name));

-- ---------------------------------------------------------------------
-- REALTIME (menu + store status only; orders are never broadcast)
-- ---------------------------------------------------------------------
do $$ begin
  begin execute 'alter publication supabase_realtime drop table orders'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table products'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table store_settings'; exception when others then null; end;
end $$;

-- ---------------------------------------------------------------------
-- 9. STARTER MENU
-- ---------------------------------------------------------------------
insert into products (id, name, price, stock, max_stock, promo_tag, description, image, is_active, category) values
 (1, 'BACHA CLASSIC',      60,  30, 30, '',           'og choco chip cookie with milk and semi sweet chocolate, topped with seasalt',            'images/classic.png',      true, 'Cookies'),
 (2, 'FIRESIDE S''MORES',  70,  30, 30, 'Popular',    'bacha classic with graham cracker, marshmallow, and hershey''s chocolate',               'images/fireside.png',     true, 'Cookies'),
 (3, 'MIDNIGHT MALLOW',    65,  30, 30, '',           'dark and semi sweet chocolate with toasted marshmallow',                                 'images/midnight.png',     true, 'Cookies'),
 (4, 'OREO DREAM',         65,  30, 30, '',           'oreo cookie with cookies and cream filling',                                             'images/oreo.png',         true, 'Cookies'),
 (5, 'DOUBLE MATCHA',      65,  30, 30, 'Bestseller', 'matcha cookie with white chocolate and matcha filling',                                  'images/doublematcha.png', true, 'Cookies'),
 (6, 'BERRYCHA',           65,  30, 30, '',           'strawberry cookie with white chocolate, dried strawberry chunks, and matcha filling',    'images/berrycha.png',     true, 'Cookies'),
 (7,  'ICED MATCHA LATTE',  120, 15, 15, '',       '12 oz • ceremonial-style matcha, fresh milk & ice',  'images/matcha.png',     true, 'Drinks'),
 (8,  'STRAWBERRY MATCHA',  135, 15, 15, '',       '12 oz • matcha over strawberry puree & milk',        'images/berry.png',      true, 'Drinks'),
 (9,  'DIRTY MATCHA',       140, 15, 15, '',       '12 oz • matcha latte with a shot of espresso',       'images/matcha.png',     true, 'Drinks'),
 (10, 'COCONUT MATCHA',     135, 15, 15, '',       '12 oz • matcha with coconut milk',                   'images/matcha.png',     true, 'Drinks'),
 (11, 'MANGO MATCHA',       135, 15, 15, '',       '12 oz • matcha over fresh mango puree',              'images/matcha.png',     true, 'Drinks'),
 (12, 'BACHA TREAT BUNDLE', 150, 10, 10, 'Bundle', 'special pastry bundle: 2 cookies + 1 pastry of the day', 'images/cheesecake.png', true, 'Pastries')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 10. UPGRADE (only matters if you ran an earlier version of this script)
-- ---------------------------------------------------------------------
alter table orders add column if not exists fulfillment text default 'pickup';
alter table orders add column if not exists delivery_address text;
alter table orders add column if not exists maps_link text;
alter table orders add column if not exists status_note text;   -- e.g. why an order was auto-cancelled
