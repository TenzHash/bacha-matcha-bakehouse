-- =====================================================================
-- BACHA - PART 9B: let customers USE their feedback coupon at checkout
-- Run this ONCE in the Supabase SQL editor, AFTER supabase_setup.sql and supabase_feedback.sql. Safe to run again.
--
-- It only ADDS things. place_order() and everything in supabase_setup.sql / supabase_feedback.sql stay exactly as they are.
--   * 2 new columns on orders (which coupon was used, and how many pesos it took off)
--   * check_coupon(code)        : tells the cart whether a code can be used (used by the "Apply" button)
--   * place_order_coupon(p)     : places the order with the normal place_order(), then takes the discount off and marks
--                                 the coupon used - all in ONE step, so an order that fails never burns a coupon
--   * a small trigger that gives the coupon back if that order is Rejected or Cancelled
--
-- NOTE: supabase_setup.sql ends by closing permissions on every function. If you ever re-run THAT file,
-- run supabase_feedback.sql and then this file again afterwards.
-- =====================================================================

do $$ begin
  if to_regclass('public.feedback_coupons') is null then
    raise exception 'Run supabase_feedback.sql first (it creates the coupon table), then run this file again.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. What was used, kept on the order (total_amount stays the amount the customer really pays)
-- ---------------------------------------------------------------------
alter table orders add column if not exists coupon_code text;
alter table orders add column if not exists coupon_discount numeric(10,2) not null default 0;

-- ---------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------
-- "bacha 6x7y8z", "bacha-6X7Y8Z" and "BACHA6X7Y8Z" all mean the same code
create or replace function _coupon_norm(t text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select nullif(upper(regexp_replace(coalesce(t, ''), '[^A-Za-z0-9]', '', 'g')), '');
$$;

-- pesos taken off: a % of the subtotal, or a fixed amount - never more than the subtotal
create or replace function _coupon_discount(p_kind text, p_value numeric, p_subtotal numeric) returns numeric
language sql immutable set search_path = public, pg_temp as $$
  select least(greatest(coalesce(p_subtotal, 0), 0),
               case when p_kind = 'percent' then round(coalesce(p_subtotal, 0) * p_value / 100, 2) else p_value end);
$$;

-- ---------------------------------------------------------------------
-- 3. Check a code (for the cart's "Apply" button). Wrong guesses are rate-limited, like track_order.
--    A bad code is RETURNED (not raised) so the failed try is really recorded.
-- ---------------------------------------------------------------------
create or replace function check_coupon(p_code text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n text := _coupon_norm(p_code); cp feedback_coupons%rowtype; recent int;
begin
  delete from rate_events where at < now() - interval '1 hour';
  select count(*) into recent from rate_events where kind = 'coupon_fail' and at > now() - interval '1 minute';
  if recent >= 20 then raise exception 'too_many_requests'; end if;
  select * into cp from feedback_coupons where replace(code, '-', '') = n;
  if not found then
    insert into rate_events (kind) values ('coupon_fail');
    perform pg_sleep(0.4);
    return jsonb_build_object('ok', false, 'reason', 'coupon_invalid');
  end if;
  if cp.used_at is not null then return jsonb_build_object('ok', false, 'reason', 'coupon_used'); end if;
  if cp.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'coupon_expired'); end if;
  return jsonb_build_object('ok', true, 'code', cp.code, 'kind', cp.kind, 'value', cp.value, 'note', cp.note, 'expires_at', cp.expires_at);
end $$;

-- ---------------------------------------------------------------------
-- 4. Place an order WITH a coupon.
--    Same input as place_order(p) plus  p->>'coupon'.  Without a coupon it simply is place_order(p).
--    If the coupon is not usable it returns {"coupon_error": "..."} and no order is made.
--    If place_order() itself refuses (stock, cut-off, ...) the error passes through and the coupon is NOT used.
-- ---------------------------------------------------------------------
create or replace function place_order_coupon(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n text := _coupon_norm(p->>'coupon'); cp feedback_coupons%rowtype; res jsonb; v_id text; v_sub numeric; v_disc numeric; recent int;
begin
  if n is null then return place_order(p - 'coupon'); end if;

  delete from rate_events where at < now() - interval '1 hour';
  select count(*) into recent from rate_events where kind = 'coupon_fail' and at > now() - interval '1 minute';
  if recent >= 20 then raise exception 'too_many_requests'; end if;

  -- lock the coupon row: two people (or two taps) can never spend the same coupon
  select * into cp from feedback_coupons where replace(code, '-', '') = n for update;
  if not found then
    insert into rate_events (kind) values ('coupon_fail');
    return jsonb_build_object('coupon_error', 'coupon_invalid');
  end if;
  if cp.used_at is not null then return jsonb_build_object('coupon_error', 'coupon_used'); end if;
  if cp.expires_at <= now() then return jsonb_build_object('coupon_error', 'coupon_expired'); end if;

  res := place_order(p - 'coupon');
  v_id := res->>'id';
  v_sub := (res->>'total')::numeric;
  v_disc := _coupon_discount(cp.kind, cp.value, v_sub);

  update orders set total_amount = v_sub - v_disc, coupon_code = cp.code, coupon_discount = v_disc where id = v_id;
  update feedback_coupons set used_at = now() where code = cp.code;
  perform _log('Coupon used at checkout', cp.code || ' on ' || v_id || ' (-' || v_disc || ')');

  return res || jsonb_build_object('subtotal', v_sub, 'discount', v_disc, 'total', v_sub - v_disc, 'coupon', cp.code);
end $$;

-- ---------------------------------------------------------------------
-- 5. Give the coupon back if its order is Rejected or Cancelled (the customer never got the cookies)
--    (An order you DELETE does not do this - use "Mark unused" in Admin -> Feedback if that ever happens.)
-- ---------------------------------------------------------------------
create or replace function _coupon_release() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.coupon_code is not null and new.status in ('Payment Rejected', 'Cancelled') and old.status is distinct from new.status then
    update feedback_coupons set used_at = null where code = new.coupon_code;
    perform _log('Coupon given back', new.coupon_code || ' (order ' || new.id || ' ' || new.status || ')');
  end if;
  return null;
end $$;

drop trigger if exists orders_coupon_release on orders;
create trigger orders_coupon_release after update of status on orders
  for each row execute function _coupon_release();

-- ---------------------------------------------------------------------
-- 5b. Order tracking / invoice: the customer's own invoice shows the coupon line.
--     This is the same track_order() as in supabase_setup.sql with ONE addition: it also returns coupon_code and coupon_discount.
--     (If you re-run supabase_setup.sql the plain version comes back; everything still works, the invoice just has no coupon line
--      until you run this file again.)
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
    'delivery_address', o.delivery_address, 'total_amount', o.total_amount, 'created_at', o.created_at, 'order_type', o.order_type,
    'coupon_code', o.coupon_code, 'coupon_discount', o.coupon_discount);
end $$;

-- ---------------------------------------------------------------------
-- 6. Permissions (closed by default, then only the two customer functions are opened)
-- ---------------------------------------------------------------------
revoke execute on function _coupon_norm(text), _coupon_discount(text, numeric, numeric), _coupon_release(),
  check_coupon(text), place_order_coupon(jsonb) from public, anon, authenticated;
grant execute on function check_coupon(text), place_order_coupon(jsonb) to anon, authenticated;
