-- =====================================================================
-- BACHA - PART 9: customer feedback + feedback coupons
-- Run this ONCE in the Supabase SQL editor, AFTER supabase_setup.sql. It is safe to run again.
-- It only ADDS things (new tables, new functions, one new photo bucket). Nothing from supabase_setup.sql is changed.
--
-- NOTE: supabase_setup.sql ends by revoking permissions on every function. If you ever re-run THAT file,
-- run this one again afterwards so the feedback functions get their permissions back.
--
-- What customers can do : read the feedback caption, read approved feedback, send feedback (1-5 stars, text, up to 2 photos),
--                         check the status of their own feedback with their private claim code.
-- What only the admin (PIN session) can do : see all feedback, approve / reject / hide / delete it,
--                         give / cancel / mark-used coupons, change the feedback settings and caption.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tables (no direct access from the browser: everything goes through the functions below)
-- ---------------------------------------------------------------------
create table if not exists feedback_settings (
  id  integer primary key default 1 check (id = 1),
  cfg jsonb not null default '{}'::jsonb
);
insert into feedback_settings (id, cfg) values (1, '{}'::jsonb) on conflict (id) do nothing;

create table if not exists feedback (
  id          bigserial primary key,
  claim_code  text not null unique,
  name        text not null default '',
  contact     text not null default '',
  stars       int  not null check (stars between 1 and 5),
  message     text not null default '',
  photos      text[] not null default '{}',
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'private')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists feedback_status_idx on feedback (status, created_at desc);

create table if not exists feedback_coupons (
  code        text primary key,
  feedback_id bigint not null references feedback (id) on delete cascade,
  kind        text not null check (kind in ('percent', 'amount')),
  value       numeric not null check (value > 0),
  note        text not null default '',
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create unique index if not exists feedback_coupons_one_per_feedback on feedback_coupons (feedback_id);

alter table feedback_settings enable row level security;
alter table feedback          enable row level security;
alter table feedback_coupons  enable row level security;
revoke all on feedback_settings, feedback, feedback_coupons from anon, authenticated;
revoke all on sequence feedback_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Settings (defaults merged with what the admin saved)
-- ---------------------------------------------------------------------
create or replace function _fb_cfg() returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare d jsonb := '{
    "accepting": true,
    "caption": "Tell us how we did - we read every single one.",
    "min_stars_public": 1,
    "auto_approve": false,
    "allow_photos": true,
    "min_chars": 3,
    "coupon": {"enabled": false, "kind": "percent", "value": 10, "days": 30, "min_stars": 4, "needs_photo": false, "auto_issue": false, "note": ""}
  }'::jsonb;
  s jsonb;
begin
  select cfg into s from feedback_settings where id = 1;
  s := coalesce(s, '{}'::jsonb);
  if jsonb_typeof(s) <> 'object' then s := '{}'::jsonb; end if;
  return (d || (s - 'coupon')) || jsonb_build_object('coupon', (d->'coupon') || coalesce(case when jsonb_typeof(s->'coupon') = 'object' then s->'coupon' end, '{}'::jsonb));
end $$;

create or replace function _fb_valid_cfg(j jsonb) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare c jsonb := j->'coupon'; k text;
begin
  if jsonb_typeof(j) is distinct from 'object' then return false; end if;
  if jsonb_typeof(j->'accepting') is distinct from 'boolean' or jsonb_typeof(j->'auto_approve') is distinct from 'boolean' or jsonb_typeof(j->'allow_photos') is distinct from 'boolean' then return false; end if;
  if jsonb_typeof(j->'caption') is distinct from 'string' or length(j->>'caption') > 160 or (j->>'caption') ~ '[<>]' then return false; end if;
  if jsonb_typeof(j->'min_stars_public') is distinct from 'number' or (j->>'min_stars_public')::numeric not between 1 and 5 or (j->>'min_stars_public')::numeric <> trunc((j->>'min_stars_public')::numeric) then return false; end if;
  if jsonb_typeof(j->'min_chars') is distinct from 'number' or (j->>'min_chars')::numeric not between 0 and 200 or (j->>'min_chars')::numeric <> trunc((j->>'min_chars')::numeric) then return false; end if;
  if jsonb_typeof(c) is distinct from 'object' then return false; end if;
  if jsonb_typeof(c->'enabled') is distinct from 'boolean' or jsonb_typeof(c->'needs_photo') is distinct from 'boolean' or jsonb_typeof(c->'auto_issue') is distinct from 'boolean' then return false; end if;
  k := c->>'kind';
  if k is null or k not in ('percent', 'amount') then return false; end if;
  if jsonb_typeof(c->'value') is distinct from 'number' then return false; end if;
  if k = 'percent' and (c->>'value')::numeric not between 1 and 100 then return false; end if;
  if k = 'amount'  and (c->>'value')::numeric not between 1 and 10000 then return false; end if;
  if jsonb_typeof(c->'days') is distinct from 'number' or (c->>'days')::numeric not between 1 and 365 or (c->>'days')::numeric <> trunc((c->>'days')::numeric) then return false; end if;
  if jsonb_typeof(c->'min_stars') is distinct from 'number' or (c->>'min_stars')::numeric not between 1 and 5 or (c->>'min_stars')::numeric <> trunc((c->>'min_stars')::numeric) then return false; end if;
  if jsonb_typeof(c->'note') is distinct from 'string' or length(c->>'note') > 80 or (c->>'note') ~ '[<>]' then return false; end if;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------
create or replace function _fb_code(p_prefix text, n int) returns text
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; r text := ''; i int; b bytea := gen_random_bytes(n);
begin
  for i in 0 .. n - 1 loop r := r || substr(alpha, 1 + (get_byte(b, i) % length(alpha)), 1); end loop;
  return p_prefix || r;
end $$;

create or replace function _fb_photo_ok(p text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p ~ '^https://[a-z0-9.-]+/storage/v1/object/public/feedback-photos/[a-f0-9]{32}\.(jpg|png|webp)$';
$$;

-- gives the feedback a coupon (if coupons are on and it has none yet). Returns the coupon row as json, or null.
create or replace function _fb_issue_coupon(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare c jsonb := _fb_cfg()->'coupon'; r feedback_coupons%rowtype; code text; tries int := 0;
begin
  if not (c->>'enabled')::boolean then return null; end if;
  select * into r from feedback_coupons where feedback_id = p_id;
  if found then return to_jsonb(r); end if;
  loop
    code := _fb_code('BACHA-', 6);
    begin
      insert into feedback_coupons (code, feedback_id, kind, value, note, expires_at)
      values (code, p_id, c->>'kind', (c->>'value')::numeric, c->>'note', now() + make_interval(days => (c->>'days')::int))
      returning * into r;
      exit;
    exception when unique_violation then
      tries := tries + 1; if tries > 5 then raise exception 'try_again'; end if;
    end;
  end loop;
  return to_jsonb(r);
end $$;

-- ---------------------------------------------------------------------
-- 4. Customer-facing functions
-- ---------------------------------------------------------------------
create or replace function feedback_config() returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare c jsonb := _fb_cfg();
begin
  return jsonb_build_object(
    'accepting', c->'accepting', 'caption', c->'caption', 'allow_photos', c->'allow_photos', 'min_chars', c->'min_chars',
    'coupon', jsonb_build_object('enabled', c->'coupon'->'enabled', 'kind', c->'coupon'->'kind', 'value', c->'coupon'->'value',
                                 'days', c->'coupon'->'days', 'min_stars', c->'coupon'->'min_stars', 'needs_photo', c->'coupon'->'needs_photo', 'note', c->'coupon'->'note'));
end $$;

-- approved feedback only; first name only; no contact details
create or replace function feedback_wall(p_limit int default 40) returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce(jsonb_agg(x order by (x->>'at') desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'name', case when btrim(name) = '' then 'A Bacha fan' else left(split_part(btrim(name), ' ', 1), 20) end,
      'stars', stars, 'message', message, 'photos', to_jsonb(photos), 'at', created_at) as x
    from feedback where status = 'approved' order by created_at desc limit greatest(1, least(coalesce(p_limit, 40), 100))
  ) t;
$$;

create or replace function submit_feedback(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare c jsonb := _fb_cfg(); cp jsonb := _fb_cfg()->'coupon';
  v_name text := btrim(regexp_replace(coalesce(p->>'name', ''), '[[:cntrl:]]', ' ', 'g'));
  v_contact text := btrim(regexp_replace(coalesce(p->>'contact', ''), '[[:cntrl:]]', ' ', 'g'));
  v_msg text := btrim(regexp_replace(coalesce(p->>'message', ''), '[\x00-\x08\x0B\x0C\x0E-\x1F]', '', 'g'));
  v_stars int; v_photos text[] := '{}'; ph text; v_status text; v_id bigint; v_code text; v_coupon jsonb := null; recent int; tries int := 0;
begin
  if nullif(btrim(coalesce(p->>'hp', '')), '') is not null then                 -- hidden "honeypot" box that only robots fill in
    return jsonb_build_object('ok', true, 'claim_code', _fb_code('FB-', 10), 'status', 'pending');
  end if;
  if not (c->>'accepting')::boolean then raise exception 'feedback_closed'; end if;
  begin v_stars := (p->>'stars')::int; exception when others then raise exception 'bad_stars'; end;
  if v_stars is null or v_stars not between 1 and 5 then raise exception 'bad_stars'; end if;
  if length(v_msg) < (c->>'min_chars')::int then raise exception 'bad_message'; end if;
  if length(v_msg) > 600 then raise exception 'bad_message'; end if;
  if length(v_name) > 40 or length(v_contact) > 60 then raise exception 'bad_name'; end if;
  if p ? 'photos' and jsonb_typeof(p->'photos') = 'array' then
    if jsonb_array_length(p->'photos') > 2 then raise exception 'too_many_photos'; end if;
    for ph in select jsonb_array_elements_text(p->'photos') loop
      if not _fb_photo_ok(ph) then raise exception 'bad_photo'; end if;
      v_photos := v_photos || ph;
    end loop;
  end if;
  if array_length(v_photos, 1) > 0 and not (c->>'allow_photos')::boolean then raise exception 'photos_off'; end if;

  delete from rate_events where at < now() - interval '1 hour';
  select count(*) into recent from rate_events where kind = 'feedback' and at > now() - interval '1 hour';
  if recent >= 40 then raise exception 'too_many_requests'; end if;
  insert into rate_events (kind) values ('feedback');

  v_status := case when v_stars < (c->>'min_stars_public')::int then 'private'
                   when (c->>'auto_approve')::boolean then 'approved' else 'pending' end;
  loop
    v_code := _fb_code('FB-', 10);
    begin
      insert into feedback (claim_code, name, contact, stars, message, photos, status, reviewed_at)
      values (v_code, v_name, v_contact, v_stars, v_msg, v_photos, v_status, case when v_status = 'approved' then now() end)
      returning id into v_id;
      exit;
    exception when unique_violation then
      tries := tries + 1; if tries > 5 then raise exception 'try_again'; end if;
    end;
  end loop;

  -- automatic coupon: only when the admin switched it on AND the feedback is already approved AND it qualifies
  if v_status = 'approved' and (cp->>'enabled')::boolean and (cp->>'auto_issue')::boolean
     and v_stars >= (cp->>'min_stars')::int and (not (cp->>'needs_photo')::boolean or array_length(v_photos, 1) > 0) then
    v_coupon := _fb_issue_coupon(v_id);
  end if;
  return jsonb_build_object('ok', true, 'claim_code', v_code, 'status', v_status,
    'coupon', case when v_coupon is null then null else jsonb_build_object('code', v_coupon->>'code', 'kind', v_coupon->>'kind', 'value', v_coupon->'value', 'expires_at', v_coupon->>'expires_at') end);
end $$;

-- the customer's own feedback (needs the private claim code shown after sending)
create or replace function feedback_status(p_code text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare f feedback%rowtype; cp feedback_coupons%rowtype; recent int;
begin
  delete from rate_events where at < now() - interval '1 hour';
  select count(*) into recent from rate_events where kind = 'fb_lookup' and at > now() - interval '1 minute';
  if recent >= 30 then raise exception 'too_many_requests'; end if;
  insert into rate_events (kind) values ('fb_lookup');
  select * into f from feedback where claim_code = upper(btrim(coalesce(p_code, '')));
  if not found then return jsonb_build_object('found', false); end if;
  select * into cp from feedback_coupons where feedback_id = f.id;
  return jsonb_build_object('found', true, 'status', case when f.status = 'private' then 'pending' else f.status end, 'stars', f.stars, 'message', f.message,
    'coupon', case when cp.code is null then null else jsonb_build_object('code', cp.code, 'kind', cp.kind, 'value', cp.value, 'expires_at', cp.expires_at, 'used', cp.used_at is not null, 'note', cp.note) end);
end $$;

-- ---------------------------------------------------------------------
-- 5. Admin functions (PIN session token required)
-- ---------------------------------------------------------------------
create or replace function admin_feedback_get_settings(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin perform _admin_guard(p_token); return _fb_cfg(); end $$;

create or replace function admin_feedback_save_settings(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare j jsonb;
begin
  perform _admin_guard(p_token);
  j := _fb_cfg();
  j := (j - 'coupon') || (coalesce(p, '{}'::jsonb) - 'coupon') || jsonb_build_object('coupon', (j->'coupon') || coalesce(case when jsonb_typeof(p->'coupon') = 'object' then p->'coupon' end, '{}'::jsonb));
  if not _fb_valid_cfg(j) then raise exception 'bad_value'; end if;
  insert into feedback_settings (id, cfg) values (1, j) on conflict (id) do update set cfg = excluded.cfg;
  perform _log('Feedback settings changed', '');
  return j;
end $$;

create or replace function admin_feedback_list(p_token text, p_status text default null, p_limit int default 300) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare items jsonb; counts jsonb;
begin
  perform _admin_guard(p_token);
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'name', f.name, 'contact', f.contact, 'stars', f.stars, 'message', f.message, 'photos', to_jsonb(f.photos),
      'status', f.status, 'created_at', f.created_at, 'claim_code', f.claim_code,
      'coupon', case when c.code is null then null else jsonb_build_object('code', c.code, 'kind', c.kind, 'value', c.value, 'expires_at', c.expires_at, 'used_at', c.used_at, 'note', c.note) end
    ) order by f.created_at desc), '[]'::jsonb) into items
  from (select * from feedback where p_status is null or p_status = '' or status = p_status order by created_at desc limit greatest(1, least(coalesce(p_limit, 300), 1000))) f
  left join feedback_coupons c on c.feedback_id = f.id;
  select jsonb_build_object('all', count(*), 'pending', count(*) filter (where status = 'pending'), 'approved', count(*) filter (where status = 'approved'),
                            'rejected', count(*) filter (where status = 'rejected'), 'private', count(*) filter (where status = 'private'),
                            'avg', coalesce(round(avg(stars)::numeric, 2), 0)) into counts from feedback;
  return jsonb_build_object('items', items, 'counts', counts);
end $$;

create or replace function admin_feedback_review(p_token text, p_id bigint, p_action text, p_coupon boolean default false) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare f feedback%rowtype; cp jsonb := null; en boolean;
begin
  perform _admin_guard(p_token);
  if p_action not in ('approve', 'reject', 'private', 'pending') then raise exception 'bad_value'; end if;
  select * into f from feedback where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  update feedback set status = case p_action when 'approve' then 'approved' when 'reject' then 'rejected' when 'private' then 'private' else 'pending' end,
                      reviewed_at = now() where id = p_id returning * into f;
  if p_action = 'approve' and coalesce(p_coupon, false) then
    en := (_fb_cfg()->'coupon'->>'enabled')::boolean;
    if not en then raise exception 'coupons_off'; end if;
    cp := _fb_issue_coupon(p_id);
  end if;
  perform _log('Feedback ' || p_action, '#' || p_id || case when cp is not null then ' + coupon ' || (cp->>'code') else '' end);
  return jsonb_build_object('ok', true, 'status', f.status, 'coupon', cp);
end $$;

create or replace function admin_feedback_delete(p_token text, p_id bigint) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform _admin_guard(p_token);
  delete from feedback where id = p_id;
  if found then perform _log('Feedback deleted', '#' || p_id); return true; end if;
  return false;
end $$;

create or replace function admin_coupon_set_used(p_token text, p_code text, p_used boolean) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform _admin_guard(p_token);
  update feedback_coupons set used_at = case when coalesce(p_used, true) then now() else null end where code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'not_found'; end if;
  perform _log(case when coalesce(p_used, true) then 'Coupon marked used' else 'Coupon marked unused' end, upper(btrim(p_code)));
  return true;
end $$;

create or replace function admin_coupon_delete(p_token text, p_code text) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  perform _admin_guard(p_token);
  delete from feedback_coupons where code = upper(btrim(coalesce(p_code, '')));
  if found then perform _log('Coupon cancelled', upper(btrim(p_code))); return true; end if;
  return false;
end $$;

-- ---------------------------------------------------------------------
-- 6. Permissions (functions are closed by default, then opened one by one)
-- ---------------------------------------------------------------------
revoke execute on function
  _fb_cfg(), _fb_valid_cfg(jsonb), _fb_code(text, int), _fb_photo_ok(text), _fb_issue_coupon(bigint),
  feedback_config(), feedback_wall(int), submit_feedback(jsonb), feedback_status(text),
  admin_feedback_get_settings(text), admin_feedback_save_settings(text, jsonb), admin_feedback_list(text, text, int),
  admin_feedback_review(text, bigint, text, boolean), admin_feedback_delete(text, bigint),
  admin_coupon_set_used(text, text, boolean), admin_coupon_delete(text, text)
from public, anon, authenticated;
grant execute on function
  feedback_config(), feedback_wall(int), submit_feedback(jsonb), feedback_status(text),
  admin_feedback_get_settings(text), admin_feedback_save_settings(text, jsonb), admin_feedback_list(text, text, int),
  admin_feedback_review(text, bigint, text, boolean), admin_feedback_delete(text, bigint),
  admin_coupon_set_used(text, text, boolean), admin_coupon_delete(text, text)
to anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Photo bucket for feedback pictures (separate from the receipts bucket so the receipt clean-up tools never touch them)
-- Upload only: jpeg/png/webp up to 5 MB, random file names. Nobody can list the bucket.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-photos', 'feedback-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "bacha_feedback_upload" on storage.objects;
create policy "bacha_feedback_upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'feedback-photos' and name ~ '^[a-f0-9]{32}\.(jpg|png|webp)$');
