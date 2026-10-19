-- ============================================================================
-- Aloha Footcare platform: initial schema
--
-- Run once in a new Supabase project (Canada Central region), either with
-- `supabase db push` or by pasting this file into the SQL Editor.
--
-- What is in here:
--   1. Tables: settings, service areas, catalog (services/products), staff
--      profiles, nurses, clients, bookings, booking items, transactions, audit log
--   2. Security: Row Level Security on every table, explicit grants, helper
--      functions that work out who the signed-in person is
--   3. Booking logic: server-side pricing, online booking requests, payments,
--      refunds, dispatch reads, audit triggers
--
-- Health information lives in: clients (care_notes), bookings (concerns,
-- client_notes, visit_notes). Only admins, and nurses for their own assigned
-- visits, can read it. Every write is audited; record views are logged.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Exposure is opt-in. New tables and functions in `public` get no automatic
--    grants; everything below is granted explicitly.
-- ----------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

create extension if not exists btree_gist with schema extensions;

-- Internal helpers live here. This schema is not exposed through the API.
create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

-- One row of business settings.
create table public.settings (
  id boolean primary key default true constraint settings_singleton check (id),
  online_booking_enabled boolean not null default true,
  min_lead_days int not null default 1 check (min_lead_days between 0 and 30),
  max_days_ahead int not null default 60 check (max_days_ahead between 1 and 365),
  gst_rate_bps int not null default 500 check (gst_rate_bps between 0 and 2000),
  require_mfa boolean not null default false,
  booking_notice text check (char_length(booking_notice) <= 500),
  updated_at timestamptz not null default now()
);
insert into public.settings default values;

-- Areas the nurses cover. Used for pricing (travel surcharge) and dispatch.
create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 80),
  surcharge_cents int not null default 0 check (surcharge_cents between 0 and 100000),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Services, products and fees, with prices the clinic controls.
create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('service', 'product', 'fee')),
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 600),
  duration_min int check (duration_min is null or duration_min between 5 and 480),
  price_cents int not null check (price_cents between 0 and 10000000),
  taxable boolean not null default false,
  bookable_online boolean not null default false,
  active boolean not null default true,
  -- Payroll code for a payable nurse visit (e.g. AF, CF). Null = not payable.
  payroll_code text check (payroll_code is null or payroll_code ~ '^[A-Z0-9]{1,8}$'),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_online_services_only check (not bookable_online or kind <> 'fee')
);

-- One row per Supabase Auth user. New users start with role 'none' (no access)
-- until an admin gives them a role.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text check (char_length(full_name) <= 120),
  role text not null default 'none' check (role in ('none', 'admin', 'nurse')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nurses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id) on delete set null,
  full_name text not null check (char_length(full_name) between 1 and 120),
  designation text not null default 'LPN' check (designation in ('LPN', 'RN', 'HCA', 'Other')),
  phone text check (char_length(phone) <= 40),
  email text check (char_length(email) <= 254),
  active boolean not null default true,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nurse_areas (
  nurse_id uuid not null references public.nurses (id) on delete cascade,
  area_id uuid not null references public.service_areas (id) on delete cascade,
  primary key (nurse_id, area_id)
);
create index nurse_areas_area_idx on public.nurse_areas (area_id);

-- The person receiving care.
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  phone text check (char_length(phone) <= 40),
  email text check (char_length(email) <= 254),
  address_line1 text check (char_length(address_line1) <= 160),
  address_line2 text check (char_length(address_line2) <= 160),
  city text check (char_length(city) <= 80),
  postal_code text check (char_length(postal_code) <= 10),
  area_id uuid references public.service_areas (id) on delete set null,
  -- Default family/caregiver contact, if someone else books for the client.
  contact_name text check (char_length(contact_name) <= 160),
  contact_phone text check (char_length(contact_phone) <= 40),
  contact_email text check (char_length(contact_email) <= 254),
  contact_relationship text check (char_length(contact_relationship) <= 60),
  -- Health information relevant to care (e.g. diabetic, on blood thinners).
  care_notes text check (char_length(care_notes) <= 4000),
  staff_notes text check (char_length(staff_notes) <= 4000),
  source text not null default 'online' check (source in ('online', 'phone', 'admin', 'import')),
  -- Id in the system the client came from (e.g. Vagaro), for the migration.
  external_ref text check (char_length(external_ref) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_last_first_idx on public.clients (lower(last_name), lower(first_name));
create index clients_phone_idx on public.clients (phone);
create index clients_email_idx on public.clients (lower(email));
create unique index clients_external_ref_idx on public.clients (external_ref) where external_ref is not null;

create sequence public.booking_ref_seq start 1001;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('AL-' || nextval('public.booking_ref_seq')),
  client_id uuid not null references public.clients (id) on delete restrict,

  -- Workflow: awaiting_payment -> new (in the queue) -> assigned (nurse picked)
  --           -> confirmed (time agreed with client) -> completed
  --           cancelled / no_show can happen along the way.
  status text not null default 'awaiting_payment' check (status in (
    'awaiting_payment', 'new', 'assigned', 'confirmed', 'completed', 'cancelled', 'no_show')),
  payment_status text not null default 'unpaid' check (payment_status in (
    'unpaid', 'partially_paid', 'paid', 'partially_refunded', 'refunded', 'not_required')),
  source text not null default 'online' check (source in ('online', 'phone', 'admin', 'import')),

  -- Who to contact about this visit (may be a family member).
  contact_name text check (char_length(contact_name) <= 160),
  contact_phone text check (char_length(contact_phone) <= 40),
  contact_email text check (char_length(contact_email) <= 254),
  contact_relationship text check (char_length(contact_relationship) <= 60),

  -- Where.
  area_id uuid references public.service_areas (id) on delete set null,
  location_type text not null default 'home' check (location_type in ('home', 'residence', 'other')),
  residence_name text check (char_length(residence_name) <= 120),
  visit_address_line1 text not null check (char_length(visit_address_line1) between 1 and 160),
  visit_address_line2 text check (char_length(visit_address_line2) <= 160),
  visit_city text not null check (char_length(visit_city) between 1 and 80),
  visit_postal_code text check (char_length(visit_postal_code) <= 10),

  -- When the client would like it.
  preferred_date date not null,
  alternate_date date,
  preferred_window text not null default 'any' check (preferred_window in ('morning', 'afternoon', 'any')),

  -- What the client told us (health information).
  concerns text[] not null default '{}' check (concerns <@ array[
    'thick_nails', 'fungal_nails', 'ingrown_nails', 'corns_calluses',
    'cracked_heels', 'diabetic', 'routine_care', 'other']::text[]),
  client_notes text check (char_length(client_notes) <= 1000),
  insurance text not null default 'none' check (insurance in ('none', 'alberta_blue_cross', 'vac', 'other')),

  -- Dispatch.
  nurse_id uuid references public.nurses (id) on delete set null,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  duration_min int check (duration_min is null or duration_min between 5 and 480),
  staff_notes text check (char_length(staff_notes) <= 4000),
  visit_notes text check (char_length(visit_notes) <= 2000),

  -- Money, in cents (CAD). Set from the catalog by the server, never by the browser.
  subtotal_cents int not null default 0 check (subtotal_cents >= 0),
  tax_cents int not null default 0 check (tax_cents >= 0),
  total_cents int not null default 0 check (total_cents >= 0),
  stripe_checkout_session_id text unique,

  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bookings_alt_date_differs check (alternate_date is null or alternate_date <> preferred_date),
  -- A nurse can't be in two places at once.
  constraint bookings_no_nurse_overlap exclude using gist (
    nurse_id with =,
    tstzrange(scheduled_start, scheduled_end) with &&
  ) where (status in ('assigned', 'confirmed') and nurse_id is not null and scheduled_start is not null)
);
create index bookings_status_idx on public.bookings (status);
create index bookings_client_idx on public.bookings (client_id);
create index bookings_nurse_idx on public.bookings (nurse_id);
create index bookings_scheduled_idx on public.bookings (scheduled_start);
create index bookings_preferred_idx on public.bookings (preferred_date);
create index bookings_contact_phone_idx on public.bookings (contact_phone, created_at);

-- Line items, priced at the moment of booking.
create table public.booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  catalog_item_id uuid references public.catalog_items (id) on delete set null,
  kind text not null check (kind in ('service', 'product', 'fee')),
  name text not null check (char_length(name) between 1 and 160),
  payroll_code text,
  quantity int not null default 1 check (quantity between 1 and 99),
  unit_price_cents int not null check (unit_price_cents >= 0),
  taxable boolean not null default false,
  line_total_cents int generated always as (quantity * unit_price_cents) stored,
  created_at timestamptz not null default now()
);
create index booking_items_booking_idx on public.booking_items (booking_id);

-- Every payment, refund and adjustment. Append-only: corrections are new rows.
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings (id) on delete restrict,
  client_id uuid references public.clients (id) on delete restrict,
  type text not null check (type in ('payment', 'refund', 'adjustment')),
  method text not null check (method in (
    'card', 'cash', 'etransfer', 'cheque', 'insurance', 'demo', 'other')),
  amount_cents int not null check (amount_cents <> 0),
  currency text not null default 'CAD' check (currency = 'CAD'),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_refund_id text unique,
  external_ref text check (char_length(external_ref) <= 120),
  note text check (char_length(note) <= 500),
  occurred_at timestamptz not null default now(),
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint transactions_sign check (
    (type = 'payment' and amount_cents > 0) or
    (type = 'refund' and amount_cents < 0) or
    type = 'adjustment')
);
create index transactions_booking_idx on public.transactions (booking_id);
create index transactions_occurred_idx on public.transactions (occurred_at);
create index transactions_payment_intent_idx on public.transactions (stripe_payment_intent_id);
-- One payment row per Stripe checkout, however many times Stripe retries the webhook.
create unique index transactions_one_payment_per_checkout
  on public.transactions (stripe_checkout_session_id) where type = 'payment';

-- Who did what, when. Field names only, never values, so the log itself holds
-- no health information.
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_role text,
  action text not null check (action in ('insert', 'update', 'delete', 'view')),
  table_name text not null,
  record_id text,
  changed_fields text[]
);
create index audit_log_record_idx on public.audit_log (table_name, record_id);
create index audit_log_at_idx on public.audit_log (at);

-- ----------------------------------------------------------------------------
-- 2. Who is signed in
-- ----------------------------------------------------------------------------

-- 'admin', 'nurse' or 'none'. Inactive staff, and staff without a second
-- factor when MFA is required, get 'none'.
create or replace function app_private.staff_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select p.role
    from public.profiles p
    where p.id = (select auth.uid())
      and p.active
      and (
        not coalesce((select s.require_mfa from public.settings s where s.id), false)
        or coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
      )
  ), 'none');
$$;

create or replace function app_private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select app_private.staff_role() = 'admin'; $$;

create or replace function app_private.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$ select app_private.staff_role() in ('admin', 'nurse'); $$;

create or replace function app_private.current_nurse_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select n.id from public.nurses n
  where n.profile_id = (select auth.uid()) and n.active
    and app_private.staff_role() = 'nurse'
  limit 1;
$$;

-- New Auth users get a profile with no access.
create or replace function app_private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();

-- ----------------------------------------------------------------------------
-- 3. Small input helpers
-- ----------------------------------------------------------------------------

create or replace function app_private.clean_text(p text, p_max int)
returns text language sql immutable set search_path = ''
as $$ select left(nullif(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')), ''), p_max); $$;

-- Free text that keeps line breaks (notes).
create or replace function app_private.clean_note(p text, p_max int)
returns text language sql immutable set search_path = ''
as $$ select left(nullif(btrim(coalesce(p, '')), ''), p_max); $$;

-- 10-digit North American number as 587-416-0377, or null.
create or replace function app_private.normalize_phone(p text)
returns text language plpgsql immutable set search_path = ''
as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if length(d) = 11 and left(d, 1) = '1' then d := substr(d, 2); end if;
  if length(d) <> 10 then return null; end if;
  return substr(d, 1, 3) || '-' || substr(d, 4, 3) || '-' || substr(d, 7, 4);
end;
$$;

-- Canadian postal code as T2P 0L4, or null.
create or replace function app_private.normalize_postal(p text)
returns text language plpgsql immutable set search_path = ''
as $$
declare s text := upper(regexp_replace(coalesce(p, ''), '[\s-]', '', 'g'));
begin
  if s !~ '^[ABCEGHJ-NPRSTVXY][0-9][ABCEGHJ-NPRSTV-Z][0-9][ABCEGHJ-NPRSTV-Z][0-9]$' then
    return null;
  end if;
  return substr(s, 1, 3) || ' ' || substr(s, 4, 3);
end;
$$;

create or replace function app_private.try_date(p text)
returns date language plpgsql immutable set search_path = ''
as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return p::date;
exception when others then
  return null;
end;
$$;

create or replace function app_private.is_email(p text)
returns boolean language sql immutable set search_path = ''
as $$ select p ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(p) <= 254; $$;

-- ----------------------------------------------------------------------------
-- 4. Audit log
-- ----------------------------------------------------------------------------

create or replace function app_private.audit_row()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_changed text[];
  v_id text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;

  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_changed
    from jsonb_object_keys(v_new) as k
    where k <> 'updated_at' and (v_new -> k) is distinct from (v_old -> k);
    if v_changed is null then return null; end if;
  end if;

  v_row := coalesce(v_new, v_old);
  v_id := v_row ->> 'id';
  if v_id is null and tg_table_name = 'nurse_areas' then
    v_id := (v_row ->> 'nurse_id') || ':' || (v_row ->> 'area_id');
  end if;

  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, changed_fields)
  values (
    (select auth.uid()),
    coalesce((select auth.jwt()) ->> 'role', current_user),
    lower(tg_op), tg_table_name, v_id, v_changed
  );
  return null;
end;
$$;

-- Record that a staff member opened a record containing health information.
create or replace function app_private.log_access(p_table text, p_record_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not app_private.is_staff() or p_table not in ('clients', 'bookings') then
    return;
  end if;
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id)
  values ((select auth.uid()), app_private.staff_role(), 'view', p_table, p_record_id::text);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Table triggers
-- ----------------------------------------------------------------------------

create or replace function app_private.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end; $$;

create trigger settings_touch before update on public.settings
  for each row execute function app_private.touch_updated_at();
create trigger catalog_touch before update on public.catalog_items
  for each row execute function app_private.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function app_private.touch_updated_at();
create trigger nurses_touch before update on public.nurses
  for each row execute function app_private.touch_updated_at();
create trigger clients_touch before update on public.clients
  for each row execute function app_private.touch_updated_at();

-- Lockout guards: always keep one active admin, and don't let an admin
-- require two-step sign-in before they've signed in with it themselves.
create or replace function app_private.profiles_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active) then
    if not exists (
      select 1 from public.profiles p
      where p.id <> old.id and p.role = 'admin' and p.active
    ) then
      raise exception 'Keep at least one active admin.';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function app_private.profiles_guard();

create or replace function app_private.settings_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.require_mfa and not old.require_mfa
     and (select auth.uid()) is not null
     and coalesce((select auth.jwt()) ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Turn on two-step sign-in for your own account and sign in with it before requiring it for everyone.';
  end if;
  return new;
end;
$$;
create trigger settings_guard before update on public.settings
  for each row execute function app_private.settings_guard();

-- Booking rules: what each status needs, timestamps, end time.
create or replace function app_private.bookings_before_write()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.status is distinct from old.status then
      if new.status = 'awaiting_payment' then
        raise exception 'A booking can''t go back to awaiting payment.';
      end if;
      if new.status = 'confirmed' then new.confirmed_at := now(); end if;
      if new.status = 'completed' then new.completed_at := now(); end if;
      if new.status = 'cancelled' then new.cancelled_at := now(); end if;
    end if;
  end if;

  if new.status in ('assigned', 'confirmed', 'completed', 'no_show') and new.nurse_id is null then
    raise exception 'Assign a nurse first.';
  end if;
  if new.status in ('confirmed', 'completed', 'no_show') and new.scheduled_start is null then
    raise exception 'Set the visit date and time first.';
  end if;
  if new.status = 'cancelled' and coalesce(btrim(new.cancel_reason), '') = '' then
    raise exception 'Add a reason for cancelling.';
  end if;

  if new.scheduled_start is not null then
    new.scheduled_end := new.scheduled_start + make_interval(mins => coalesce(new.duration_min, 45));
  else
    new.scheduled_end := null;
  end if;
  return new;
end;
$$;
create trigger bookings_before_write before insert or update on public.bookings
  for each row execute function app_private.bookings_before_write();

-- Keep phone numbers and postal codes in one format, however they're typed.
create or replace function app_private.normalize_contact_fields()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_table_name = 'clients' then
    new.phone := coalesce(app_private.normalize_phone(new.phone), nullif(btrim(new.phone), ''));
    new.contact_phone := coalesce(app_private.normalize_phone(new.contact_phone), nullif(btrim(new.contact_phone), ''));
    new.postal_code := coalesce(app_private.normalize_postal(new.postal_code), nullif(btrim(new.postal_code), ''));
    new.email := lower(nullif(btrim(new.email), ''));
  elsif tg_table_name = 'bookings' then
    new.contact_phone := coalesce(app_private.normalize_phone(new.contact_phone), nullif(btrim(new.contact_phone), ''));
    new.visit_postal_code := coalesce(app_private.normalize_postal(new.visit_postal_code), nullif(btrim(new.visit_postal_code), ''));
  end if;
  return new;
end;
$$;
create trigger clients_normalize before insert or update on public.clients
  for each row execute function app_private.normalize_contact_fields();
create trigger bookings_normalize before insert or update on public.bookings
  for each row execute function app_private.normalize_contact_fields();

-- Transactions: fill in who and which client; never allow edits.
create or replace function app_private.transactions_before_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.booking_id is not null then
    select b.client_id into new.client_id from public.bookings b where b.id = new.booking_id;
    if new.client_id is null then raise exception 'Booking not found.'; end if;
  end if;
  new.recorded_by := coalesce((select auth.uid()), new.recorded_by);
  return new;
end;
$$;
create trigger transactions_before_insert before insert on public.transactions
  for each row execute function app_private.transactions_before_insert();

create or replace function app_private.prevent_change()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'Transactions can''t be changed or deleted. Record an adjustment instead.';
end;
$$;
create trigger transactions_immutable before update or delete on public.transactions
  for each row execute function app_private.prevent_change();
create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function app_private.prevent_change();

-- Keep each booking's payment status in step with its transactions. A paid
-- online request moves into the dispatch queue.
create or replace function app_private.sync_booking_payment()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_paid int;
  v_refunded int;
  v_net int;
  v_total int;
  v_status text;
begin
  if new.booking_id is null then return null; end if;

  select
    coalesce(sum(t.amount_cents) filter (where t.type = 'payment'), 0),
    coalesce(-sum(t.amount_cents) filter (where t.type = 'refund'), 0),
    coalesce(sum(t.amount_cents), 0)
  into v_paid, v_refunded, v_net
  from public.transactions t where t.booking_id = new.booking_id;

  select b.total_cents into v_total from public.bookings b where b.id = new.booking_id for update;

  v_status := case
    when v_paid = 0 and v_total = 0 then 'not_required'
    when v_paid = 0 then 'unpaid'
    when v_refunded >= v_paid then 'refunded'
    when v_refunded > 0 then 'partially_refunded'
    when v_net >= v_total then 'paid'
    else 'partially_paid'
  end;

  update public.bookings b
  set payment_status = v_status,
      status = case when b.status = 'awaiting_payment' and v_status = 'paid' then 'new' else b.status end
  where b.id = new.booking_id;
  return null;
end;
$$;
create trigger transactions_sync_payment after insert on public.transactions
  for each row execute function app_private.sync_booking_payment();

-- Audit every write to tables that hold client, money or configuration data.
create trigger audit_settings after insert or update or delete on public.settings
  for each row execute function app_private.audit_row();
create trigger audit_service_areas after insert or update or delete on public.service_areas
  for each row execute function app_private.audit_row();
create trigger audit_catalog after insert or update or delete on public.catalog_items
  for each row execute function app_private.audit_row();
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function app_private.audit_row();
create trigger audit_nurses after insert or update or delete on public.nurses
  for each row execute function app_private.audit_row();
create trigger audit_nurse_areas after insert or update or delete on public.nurse_areas
  for each row execute function app_private.audit_row();
create trigger audit_clients after insert or update or delete on public.clients
  for each row execute function app_private.audit_row();
create trigger audit_bookings after insert or update or delete on public.bookings
  for each row execute function app_private.audit_row();
create trigger audit_booking_items after insert or update or delete on public.booking_items
  for each row execute function app_private.audit_row();
create trigger audit_transactions after insert on public.transactions
  for each row execute function app_private.audit_row();

-- ----------------------------------------------------------------------------
-- 6. Pricing and booking creation
-- ----------------------------------------------------------------------------

-- Prices a visit from the catalog. Anyone can call it (the booking page shows
-- the total), but non-admins can only price items offered online, and must
-- pick exactly one service and an area.
--   p_items: [{ "id": "<catalog item id>", "quantity": 1 }, ...]
create or replace function public.quote_booking(
  p_items jsonb,
  p_area_id uuid default null,
  p_online boolean default true
)
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_item jsonb;
  v_cat public.catalog_items;
  v_area public.service_areas;
  v_qty int;
  v_lines jsonb := '[]'::jsonb;
  v_subtotal int := 0;
  v_taxable int := 0;
  v_tax int;
  v_gst int;
  v_services int := 0;
  v_duration int := 0;
begin
  if not app_private.is_admin() then
    p_online := true;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Choose a service.';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception 'Too many items in one booking.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_qty := coalesce((v_item ->> 'quantity')::int, 1);
    exception when others then
      raise exception 'Invalid quantity.';
    end;
    if v_qty < 1 or v_qty > 20 then
      raise exception 'Invalid quantity.';
    end if;

    select c.* into v_cat
    from public.catalog_items c
    where c.id::text = v_item ->> 'id'
      and c.active
      and (not p_online or c.bookable_online);
    if not found then
      raise exception 'That service is no longer available. Refresh the page and try again.';
    end if;

    if v_cat.kind = 'service' then
      v_services := v_services + v_qty;
      v_duration := v_duration + v_qty * coalesce(v_cat.duration_min, 45);
    end if;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'catalog_item_id', v_cat.id,
      'kind', v_cat.kind,
      'name', v_cat.name,
      'payroll_code', v_cat.payroll_code,
      'quantity', v_qty,
      'unit_price_cents', v_cat.price_cents,
      'taxable', v_cat.taxable
    ));
    v_subtotal := v_subtotal + v_qty * v_cat.price_cents;
    if v_cat.taxable then
      v_taxable := v_taxable + v_qty * v_cat.price_cents;
    end if;
  end loop;

  if p_online and v_services <> 1 then
    raise exception 'Choose one service per visit.';
  end if;

  if p_area_id is not null then
    select a.* into v_area from public.service_areas a where a.id = p_area_id and a.active;
    if not found then
      raise exception 'Choose an area from the list.';
    end if;
    if v_area.surcharge_cents > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'catalog_item_id', null,
        'kind', 'fee',
        'name', 'Travel surcharge (' || v_area.name || ')',
        'payroll_code', null,
        'quantity', 1,
        'unit_price_cents', v_area.surcharge_cents,
        'taxable', false
      ));
      v_subtotal := v_subtotal + v_area.surcharge_cents;
    end if;
  elsif p_online then
    raise exception 'Choose your area.';
  end if;

  select s.gst_rate_bps into v_gst from public.settings s where s.id;
  v_tax := round(v_taxable * coalesce(v_gst, 0) / 10000.0)::int;

  return jsonb_build_object(
    'items', v_lines,
    'subtotal_cents', v_subtotal,
    'tax_cents', v_tax,
    'total_cents', v_subtotal + v_tax,
    'duration_min', nullif(v_duration, 0)
  );
end;
$$;

-- Inserts a booking and its priced items. Internal: callers validate first.
create or replace function app_private.insert_booking(
  p jsonb,
  p_quote jsonb,
  p_client_id uuid,
  p_source text,
  p_status text,
  p_created_by uuid
)
returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare
  v_b public.bookings;
  v_item jsonb;
  v_visit jsonb := coalesce(p -> 'visit', '{}'::jsonb);
  v_contact jsonb := coalesce(p -> 'booking_contact', '{}'::jsonb);
  v_total int := (p_quote ->> 'total_cents')::int;
  v_payment text := case when v_total = 0 then 'not_required' else 'unpaid' end;
  v_status text := p_status;
begin
  if v_payment = 'not_required' and v_status = 'awaiting_payment' then
    v_status := 'new';
  end if;

  insert into public.bookings (
    client_id, status, payment_status, source,
    contact_name, contact_phone, contact_email, contact_relationship,
    area_id, location_type, residence_name,
    visit_address_line1, visit_address_line2, visit_city, visit_postal_code,
    preferred_date, alternate_date, preferred_window,
    concerns, client_notes, insurance,
    nurse_id, scheduled_start, duration_min, staff_notes,
    subtotal_cents, tax_cents, total_cents, created_by
  ) values (
    p_client_id, v_status, v_payment, p_source,
    v_contact ->> 'name', v_contact ->> 'phone', v_contact ->> 'email', v_contact ->> 'relationship',
    nullif(p ->> 'area_id', '')::uuid,
    coalesce(v_visit ->> 'location_type', 'home'),
    v_visit ->> 'residence_name',
    v_visit ->> 'address_line1', v_visit ->> 'address_line2',
    v_visit ->> 'city', v_visit ->> 'postal_code',
    app_private.try_date(p ->> 'preferred_date'),
    app_private.try_date(p ->> 'alternate_date'),
    coalesce(p ->> 'preferred_window', 'any'),
    coalesce(array(select jsonb_array_elements_text(
      case when jsonb_typeof(p -> 'concerns') = 'array' then p -> 'concerns' else '[]'::jsonb end
    )), '{}'),
    app_private.clean_note(p ->> 'client_notes', 1000),
    coalesce(p ->> 'insurance', 'none'),
    nullif(p ->> 'nurse_id', '')::uuid,
    nullif(p ->> 'scheduled_start', '')::timestamptz,
    coalesce(nullif(p ->> 'duration_min', '')::int, (p_quote ->> 'duration_min')::int),
    app_private.clean_note(p ->> 'staff_notes', 4000),
    (p_quote ->> 'subtotal_cents')::int,
    (p_quote ->> 'tax_cents')::int,
    v_total,
    p_created_by
  )
  returning * into v_b;

  for v_item in select value from jsonb_array_elements(p_quote -> 'items') loop
    insert into public.booking_items (
      booking_id, catalog_item_id, kind, name, payroll_code, quantity, unit_price_cents, taxable
    ) values (
      v_b.id,
      nullif(v_item ->> 'catalog_item_id', '')::uuid,
      v_item ->> 'kind',
      v_item ->> 'name',
      v_item ->> 'payroll_code',
      (v_item ->> 'quantity')::int,
      (v_item ->> 'unit_price_cents')::int,
      (v_item ->> 'taxable')::boolean
    );
  end loop;

  return v_b;
end;
$$;

-- Validates a visit's where/when/what fields and returns them cleaned up.
-- Shared by online and phone bookings.
create or replace function app_private.clean_visit_fields(p jsonb, p_check_window boolean)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.settings;
  v_today date := (now() at time zone 'America/Edmonton')::date;
  v_visit jsonb := coalesce(p -> 'visit', '{}'::jsonb);
  v_pref date := app_private.try_date(p ->> 'preferred_date');
  v_alt date := app_private.try_date(nullif(p ->> 'alternate_date', ''));
  v_window text := coalesce(nullif(p ->> 'preferred_window', ''), 'any');
  v_loc text := coalesce(nullif(v_visit ->> 'location_type', ''), 'home');
  v_line1 text := app_private.clean_text(v_visit ->> 'address_line1', 161);
  v_city text := app_private.clean_text(v_visit ->> 'city', 81);
  v_postal text := app_private.normalize_postal(v_visit ->> 'postal_code');
  v_concerns jsonb := coalesce(p -> 'concerns', '[]'::jsonb);
  v_insurance text := coalesce(nullif(p ->> 'insurance', ''), 'none');
begin
  select * into s from public.settings where id;

  if v_pref is null then raise exception 'Choose a date for the visit.'; end if;
  if p_check_window then
    if v_pref < v_today + s.min_lead_days or v_pref > v_today + s.max_days_ahead then
      raise exception 'Choose a date between % and %.',
        to_char(v_today + s.min_lead_days, 'FMMonth FMDD'),
        to_char(v_today + s.max_days_ahead, 'FMMonth FMDD');
    end if;
    if v_alt is not null and (v_alt < v_today + s.min_lead_days or v_alt > v_today + s.max_days_ahead) then
      raise exception 'Choose a backup date between % and %.',
        to_char(v_today + s.min_lead_days, 'FMMonth FMDD'),
        to_char(v_today + s.max_days_ahead, 'FMMonth FMDD');
    end if;
  end if;
  if v_alt = v_pref then v_alt := null; end if;
  if v_window not in ('morning', 'afternoon', 'any') then raise exception 'Choose a time of day.'; end if;
  if v_loc not in ('home', 'residence', 'other') then raise exception 'Choose where the visit happens.'; end if;

  if v_line1 is null then raise exception 'Enter the street address for the visit.'; end if;
  if char_length(v_line1) > 160 then raise exception 'The street address is too long.'; end if;
  if v_city is null then raise exception 'Enter the city or town.'; end if;
  if char_length(v_city) > 80 then raise exception 'The city name is too long.'; end if;
  if v_postal is null and nullif(btrim(coalesce(v_visit ->> 'postal_code', '')), '') is not null then
    raise exception 'Enter a valid postal code, like T2P 0L4.';
  end if;
  if p_check_window and v_postal is null then
    raise exception 'Enter the postal code for the visit, like T2P 0L4.';
  end if;

  if jsonb_typeof(v_concerns) <> 'array' or jsonb_array_length(v_concerns) > 8 then
    raise exception 'Invalid list of concerns.';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(v_concerns) c
    where c not in ('thick_nails', 'fungal_nails', 'ingrown_nails', 'corns_calluses',
                    'cracked_heels', 'diabetic', 'routine_care', 'other')
  ) then
    raise exception 'Invalid list of concerns.';
  end if;
  if char_length(coalesce(p ->> 'client_notes', '')) > 1000 then
    raise exception 'Keep the note to 1000 characters or fewer.';
  end if;
  if v_insurance not in ('none', 'alberta_blue_cross', 'vac', 'other') then
    raise exception 'Choose an insurance option.';
  end if;

  return jsonb_build_object(
    'preferred_date', v_pref,
    'alternate_date', v_alt,
    'preferred_window', v_window,
    'concerns', v_concerns,
    'client_notes', p ->> 'client_notes',
    'insurance', v_insurance,
    'visit', jsonb_build_object(
      'location_type', v_loc,
      'residence_name', app_private.clean_text(v_visit ->> 'residence_name', 120),
      'address_line1', v_line1,
      'address_line2', app_private.clean_text(v_visit ->> 'address_line2', 160),
      'city', v_city,
      'postal_code', v_postal
    )
  );
end;
$$;

-- Online booking request. Called only by the create-booking Edge Function
-- (secret key), never directly from a browser.
--
-- p = {
--   booking_for: 'self' | 'other',
--   contact: { first_name, last_name, phone, email },   -- the person booking
--   patient: { first_name, last_name, phone },           -- when booking_for = 'other'
--   relationship: 'Daughter',                            -- when booking_for = 'other'
--   items: [{ id, quantity }], area_id,
--   visit: { location_type, residence_name, address_line1, address_line2, city, postal_code },
--   preferred_date, alternate_date, preferred_window,
--   concerns: [...], client_notes, insurance, consent: true
-- }
create or replace function public.create_booking_request(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s public.settings;
  v_contact jsonb := coalesce(p -> 'contact', '{}'::jsonb);
  v_patient jsonb := coalesce(p -> 'patient', '{}'::jsonb);
  v_for text := coalesce(p ->> 'booking_for', 'self');
  c_first text := app_private.clean_text(v_contact ->> 'first_name', 81);
  c_last text := app_private.clean_text(v_contact ->> 'last_name', 81);
  c_phone text := app_private.normalize_phone(v_contact ->> 'phone');
  c_email text := lower(app_private.clean_text(v_contact ->> 'email', 255));
  v_first text;
  v_last text;
  v_phone text;
  v_email text;
  v_rel text := app_private.clean_text(p ->> 'relationship', 60);
  v_fields jsonb;
  v_area uuid;
  v_quote jsonb;
  v_client_id uuid;
  v_b public.bookings;
  v_recent int;
begin
  select * into s from public.settings where id;
  if not s.online_booking_enabled then
    raise exception 'Online booking is paused right now. Please call us to book.';
  end if;
  if coalesce((p ->> 'consent')::boolean, false) is not true then
    raise exception 'Please confirm you have read how we use your information.';
  end if;

  -- The person booking.
  if c_first is null or c_last is null then raise exception 'Enter your first and last name.'; end if;
  if char_length(c_first) > 80 or char_length(c_last) > 80 then raise exception 'Names must be 80 characters or fewer.'; end if;
  if c_phone is null then raise exception 'Enter a 10-digit phone number we can reach you at.'; end if;
  if c_email is null or not app_private.is_email(c_email) then raise exception 'Enter a valid email address.'; end if;

  -- The person receiving care.
  if v_for = 'self' then
    v_first := c_first; v_last := c_last; v_phone := c_phone; v_email := c_email;
  elsif v_for = 'other' then
    v_first := app_private.clean_text(v_patient ->> 'first_name', 81);
    v_last := app_private.clean_text(v_patient ->> 'last_name', 81);
    if v_first is null or v_last is null then raise exception 'Enter the first and last name of the person receiving care.'; end if;
    if char_length(v_first) > 80 or char_length(v_last) > 80 then raise exception 'Names must be 80 characters or fewer.'; end if;
    v_phone := app_private.normalize_phone(v_patient ->> 'phone');
    if v_phone is null and nullif(btrim(coalesce(v_patient ->> 'phone', '')), '') is not null then
      raise exception 'Enter a 10-digit phone number for the person receiving care, or leave it blank.';
    end if;
    v_email := null;
  else
    raise exception 'Tell us who the visit is for.';
  end if;

  v_fields := app_private.clean_visit_fields(p, true);
  v_area := case when (p ->> 'area_id') ~ '^[0-9a-fA-F-]{36}$' then (p ->> 'area_id')::uuid end;

  -- Flood protection. A real person rarely needs more than a few tries.
  select count(*) into v_recent from public.bookings b
  where b.contact_phone = c_phone and b.source = 'online' and b.created_at > now() - interval '15 minutes';
  if v_recent >= 4 then
    raise exception 'We already have several requests from this phone number. Please call us and we''ll sort it out.';
  end if;
  select count(*) into v_recent from public.bookings b
  where b.status = 'awaiting_payment' and b.created_at > now() - interval '1 hour';
  if v_recent >= 60 then
    raise exception 'Online booking is busy right now. Please call us to book.';
  end if;

  v_quote := public.quote_booking(p -> 'items', v_area, true);

  -- Reuse the client record on an exact match. Existing details are never
  -- overwritten by a public form.
  select c.id into v_client_id
  from public.clients c
  where lower(c.first_name) = lower(v_first)
    and lower(c.last_name) = lower(v_last)
    and (c.phone = coalesce(v_phone, c_phone) or c.contact_phone = c_phone)
  order by c.created_at
  limit 1;

  if v_client_id is null then
    insert into public.clients (
      first_name, last_name, phone, email,
      address_line1, address_line2, city, postal_code, area_id,
      contact_name, contact_phone, contact_email, contact_relationship, source
    ) values (
      v_first, v_last, v_phone, v_email,
      v_fields -> 'visit' ->> 'address_line1', v_fields -> 'visit' ->> 'address_line2',
      v_fields -> 'visit' ->> 'city', v_fields -> 'visit' ->> 'postal_code', v_area,
      case when v_for = 'other' then c_first || ' ' || c_last end,
      case when v_for = 'other' then c_phone end,
      case when v_for = 'other' then c_email end,
      case when v_for = 'other' then v_rel end,
      'online'
    )
    returning id into v_client_id;
  end if;

  v_b := app_private.insert_booking(
    v_fields || jsonb_build_object(
      'area_id', v_area,
      'booking_contact', jsonb_build_object(
        'name', c_first || ' ' || c_last,
        'phone', c_phone,
        'email', c_email,
        'relationship', case when v_for = 'other' then v_rel end
      )
    ),
    v_quote, v_client_id, 'online', 'awaiting_payment', null
  );

  return jsonb_build_object(
    'booking_id', v_b.id,
    'reference', v_b.reference,
    'status', v_b.status,
    'total_cents', v_b.total_cents,
    'contact_email', c_email
  );
end;
$$;

-- Phone or walk-in booking entered by an admin.
--
-- p = {
--   client_id   (existing client)  OR  client: { first_name, last_name, phone, email, care_notes },
--   items: [{ id, quantity }], area_id,
--   visit: {...}, preferred_date, alternate_date, preferred_window,
--   concerns, client_notes, insurance, staff_notes,
--   booking_contact: { name, phone, email, relationship },
--   nurse_id, scheduled_start, status: 'new' | 'assigned' | 'confirmed'
-- }
create or replace function public.admin_create_booking(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_client jsonb := coalesce(p -> 'client', '{}'::jsonb);
  v_client_id uuid := case when (p ->> 'client_id') ~ '^[0-9a-fA-F-]{36}$' then (p ->> 'client_id')::uuid end;
  v_area uuid := case when (p ->> 'area_id') ~ '^[0-9a-fA-F-]{36}$' then (p ->> 'area_id')::uuid end;
  v_status text := coalesce(nullif(p ->> 'status', ''), 'new');
  v_fields jsonb;
  v_quote jsonb;
  v_contact jsonb := coalesce(p -> 'booking_contact', '{}'::jsonb);
  v_first text;
  v_last text;
  v_b public.bookings;
begin
  if not app_private.is_admin() then
    raise exception 'Only admins can create bookings.' using errcode = '42501';
  end if;
  if v_status not in ('new', 'assigned', 'confirmed') then
    raise exception 'Invalid status for a new booking.';
  end if;

  v_fields := app_private.clean_visit_fields(p, false);
  v_quote := public.quote_booking(p -> 'items', v_area, false);

  if v_client_id is not null then
    perform 1 from public.clients c where c.id = v_client_id;
    if not found then raise exception 'Client not found.'; end if;
  else
    v_first := app_private.clean_text(v_client ->> 'first_name', 80);
    v_last := app_private.clean_text(v_client ->> 'last_name', 80);
    if v_first is null or v_last is null then
      raise exception 'Enter the client''s first and last name.';
    end if;
    if nullif(btrim(coalesce(v_client ->> 'email', '')), '') is not null
       and not app_private.is_email(lower(btrim(v_client ->> 'email'))) then
      raise exception 'Enter a valid email address for the client, or leave it blank.';
    end if;
    insert into public.clients (
      first_name, last_name, phone, email,
      address_line1, address_line2, city, postal_code, area_id, care_notes, source
    ) values (
      v_first, v_last,
      app_private.normalize_phone(v_client ->> 'phone'),
      lower(app_private.clean_text(v_client ->> 'email', 254)),
      v_fields -> 'visit' ->> 'address_line1', v_fields -> 'visit' ->> 'address_line2',
      v_fields -> 'visit' ->> 'city', v_fields -> 'visit' ->> 'postal_code', v_area,
      app_private.clean_note(v_client ->> 'care_notes', 4000),
      'phone'
    )
    returning id into v_client_id;
  end if;

  v_b := app_private.insert_booking(
    v_fields || jsonb_build_object(
      'area_id', v_area,
      'staff_notes', p ->> 'staff_notes',
      'nurse_id', p ->> 'nurse_id',
      'scheduled_start', p ->> 'scheduled_start',
      'booking_contact', jsonb_build_object(
        'name', app_private.clean_text(v_contact ->> 'name', 160),
        'phone', app_private.normalize_phone(v_contact ->> 'phone'),
        'email', lower(app_private.clean_text(v_contact ->> 'email', 254)),
        'relationship', app_private.clean_text(v_contact ->> 'relationship', 60)
      )
    ),
    v_quote, v_client_id, 'phone', v_status, (select auth.uid())
  );

  return jsonb_build_object('booking_id', v_b.id, 'reference', v_b.reference, 'client_id', v_client_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Payments (called by Edge Functions with the secret key)
-- ----------------------------------------------------------------------------

-- Records a completed online payment. Safe to call more than once for the same
-- checkout: the second call does nothing.
create or replace function public.record_online_payment(
  p_booking_id uuid,
  p_amount_cents int,
  p_method text,
  p_checkout_session_id text,
  p_payment_intent_id text default null,
  p_charge_id text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_inserted int;
begin
  if p_method not in ('card', 'demo') then raise exception 'Invalid payment method.'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Invalid amount.'; end if;
  perform 1 from public.bookings b where b.id = p_booking_id;
  if not found then raise exception 'Booking not found.'; end if;

  insert into public.transactions (
    booking_id, type, method, amount_cents,
    stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id, note
  ) values (
    p_booking_id, 'payment', p_method, p_amount_cents,
    p_checkout_session_id, p_payment_intent_id, p_charge_id,
    case when p_method = 'demo' then 'Demo mode: no card was charged' end
  )
  on conflict (stripe_checkout_session_id) where type = 'payment' do nothing;
  get diagnostics v_inserted = row_count;

  update public.bookings set stripe_checkout_session_id = p_checkout_session_id
  where id = p_booking_id and stripe_checkout_session_id is null;

  return jsonb_build_object('recorded', v_inserted > 0);
end;
$$;

-- Records a refund. p_amount_cents is positive; it's stored as a negative row.
-- Idempotent on the Stripe refund id.
create or replace function public.record_refund(
  p_booking_id uuid,
  p_amount_cents int,
  p_method text,
  p_refund_id text,
  p_payment_intent_id text default null,
  p_note text default null,
  p_actor uuid default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_inserted int;
begin
  if p_method not in ('card', 'demo') then raise exception 'Invalid refund method.'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Invalid amount.'; end if;
  if p_refund_id is null then raise exception 'Missing refund id.'; end if;

  insert into public.transactions (
    booking_id, type, method, amount_cents, stripe_refund_id, stripe_payment_intent_id, note, recorded_by
  ) values (
    p_booking_id, 'refund', p_method, -p_amount_cents, p_refund_id, p_payment_intent_id,
    app_private.clean_text(p_note, 500), p_actor
  )
  on conflict (stripe_refund_id) do nothing;
  get diagnostics v_inserted = row_count;
  return jsonb_build_object('recorded', v_inserted > 0);
end;
$$;

-- Card money still refundable on a booking, and the payment it came from.
-- Invoker: only admins (and the secret key) can see transactions.
create or replace function public.booking_refundable(p_booking_id uuid)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'refundable_cents', greatest(coalesce(sum(t.amount_cents) filter (where t.method in ('card', 'demo')), 0), 0),
    'payment_intent_id', (
      select t2.stripe_payment_intent_id from public.transactions t2
      where t2.booking_id = p_booking_id and t2.type = 'payment' and t2.method in ('card', 'demo')
      order by t2.occurred_at desc limit 1),
    'method', (
      select t3.method from public.transactions t3
      where t3.booking_id = p_booking_id and t3.type = 'payment' and t3.method in ('card', 'demo')
      order by t3.occurred_at desc limit 1)
  )
  from public.transactions t
  where t.booking_id = p_booking_id;
$$;

-- ----------------------------------------------------------------------------
-- 8. Staff reads and actions (respect Row Level Security)
-- ----------------------------------------------------------------------------

-- The caller's effective role, with the same MFA rule the policies use.
create or replace function public.my_role()
returns text language sql stable security invoker set search_path = ''
as $$ select app_private.staff_role(); $$;

-- Everything the dispatch board shows, in one call.
create or replace function public.dispatch_board()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_date, x.created_at), '[]'::jsonb)
  from (
    select
      b.id, b.reference, b.status, b.payment_status, b.source,
      b.preferred_date, b.alternate_date, b.preferred_window,
      b.scheduled_start, b.scheduled_end, b.created_at, b.total_cents,
      b.location_type, b.residence_name, b.visit_city, b.insurance,
      coalesce((b.scheduled_start at time zone 'America/Edmonton')::date, b.preferred_date) as sort_date,
      c.first_name || ' ' || c.last_name as client_name,
      a.id as area_id, a.name as area_name,
      n.id as nurse_id, n.full_name as nurse_name,
      (select coalesce(jsonb_agg(i.name order by i.created_at), '[]'::jsonb)
         from public.booking_items i where i.booking_id = b.id and i.kind <> 'fee') as services
    from public.bookings b
    join public.clients c on c.id = b.client_id
    left join public.service_areas a on a.id = b.area_id
    left join public.nurses n on n.id = b.nurse_id
    where b.status in ('new', 'assigned')
       or (b.status = 'confirmed'
           and b.scheduled_start >= (date_trunc('day', now() at time zone 'America/Edmonton') at time zone 'America/Edmonton'))
       or (b.status = 'awaiting_payment' and b.created_at > now() - interval '14 days')
  ) x;
$$;

-- One booking with everything on it. Logs that the record was opened.
create or replace function public.booking_detail(p_id uuid)
returns jsonb
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'booking', to_jsonb(b),
    'client', to_jsonb(c),
    'area', case when a.id is null then null else jsonb_build_object('id', a.id, 'name', a.name) end,
    'nurse', case when n.id is null then null else jsonb_build_object('id', n.id, 'full_name', n.full_name, 'phone', n.phone) end,
    'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at), '[]'::jsonb)
              from public.booking_items i where i.booking_id = b.id),
    'transactions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.occurred_at), '[]'::jsonb)
                     from public.transactions t where t.booking_id = b.id)
  ) into v
  from public.bookings b
  join public.clients c on c.id = b.client_id
  left join public.service_areas a on a.id = b.area_id
  left join public.nurses n on n.id = b.nurse_id
  where b.id = p_id;

  if v is not null then
    perform app_private.log_access('bookings', p_id);
    perform app_private.log_access('clients', (v -> 'client' ->> 'id')::uuid);
  end if;
  return v;
end;
$$;

-- Active nurses ranked for a visit: covers the area first, then lightest day.
create or replace function public.nurse_day_load(p_date date, p_area_id uuid default null)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.covers_area desc, x.visit_count, x.full_name), '[]'::jsonb)
  from (
    select
      n.id, n.full_name, n.designation,
      exists (select 1 from public.nurse_areas na where na.nurse_id = n.id and na.area_id = p_area_id) as covers_area,
      (select coalesce(jsonb_agg(a.name order by a.sort_order, a.name), '[]'::jsonb)
         from public.nurse_areas na join public.service_areas a on a.id = na.area_id
        where na.nurse_id = n.id) as areas,
      (select count(*) from public.bookings b
        where b.nurse_id = n.id and b.status in ('assigned', 'confirmed', 'completed')
          and (b.scheduled_start at time zone 'America/Edmonton')::date = p_date) as visit_count,
      (select coalesce(jsonb_agg(jsonb_build_object(
                'id', b.id, 'reference', b.reference, 'status', b.status,
                'scheduled_start', b.scheduled_start, 'scheduled_end', b.scheduled_end,
                'area_name', a.name)
              order by b.scheduled_start), '[]'::jsonb)
         from public.bookings b left join public.service_areas a on a.id = b.area_id
        where b.nurse_id = n.id and b.status in ('assigned', 'confirmed', 'completed')
          and (b.scheduled_start at time zone 'America/Edmonton')::date = p_date) as visits
    from public.nurses n
    where n.active
  ) x;
$$;

create or replace function public.search_clients(p_query text default '')
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with q as (select btrim(coalesce(p_query, '')) as t)
  select coalesce(jsonb_agg(to_jsonb(x) order by x.last_name, x.first_name), '[]'::jsonb)
  from (
    select c.id, c.first_name, c.last_name, c.phone, c.email, c.city, c.contact_name,
      (select count(*) from public.bookings b where b.client_id = c.id) as booking_count,
      (select max(coalesce((b.scheduled_start at time zone 'America/Edmonton')::date, b.preferred_date))
         from public.bookings b where b.client_id = c.id) as last_visit
    from public.clients c, q
    where q.t = ''
       or (c.first_name || ' ' || c.last_name) ilike '%' || q.t || '%'
       or c.email ilike '%' || q.t || '%'
       or regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || nullif(regexp_replace(q.t, '\D', '', 'g'), '') || '%'
       or c.contact_name ilike '%' || q.t || '%'
    order by c.last_name, c.first_name
    limit 100
  ) x;
$$;

create or replace function public.client_detail(p_id uuid)
returns jsonb
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'client', to_jsonb(c),
    'bookings', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', b.id, 'reference', b.reference, 'status', b.status, 'payment_status', b.payment_status,
          'preferred_date', b.preferred_date, 'scheduled_start', b.scheduled_start,
          'total_cents', b.total_cents, 'nurse_name', n.full_name,
          'services', (select coalesce(jsonb_agg(i.name order by i.created_at), '[]'::jsonb)
                         from public.booking_items i where i.booking_id = b.id and i.kind <> 'fee'))
        order by coalesce(b.scheduled_start, b.preferred_date::timestamptz) desc), '[]'::jsonb)
      from public.bookings b left join public.nurses n on n.id = b.nurse_id
      where b.client_id = c.id)
  ) into v
  from public.clients c where c.id = p_id;

  if v is not null then perform app_private.log_access('clients', p_id); end if;
  return v;
end;
$$;

-- Money in and out for a date range (dates in Calgary time).
create or replace function public.ledger(p_from date, p_to date)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at), '[]'::jsonb)
  from (
    select t.id, t.occurred_at, t.type, t.method, t.amount_cents, t.note, t.external_ref,
      t.stripe_payment_intent_id, t.stripe_refund_id,
      b.id as booking_id, b.reference,
      c.first_name || ' ' || c.last_name as client_name
    from public.transactions t
    left join public.bookings b on b.id = t.booking_id
    left join public.clients c on c.id = t.client_id
    where (t.occurred_at at time zone 'America/Edmonton')::date between p_from and p_to
  ) x;
$$;

-- Completed visits, one row per line item, for the payroll workbook.
create or replace function public.payroll_visits(p_from date, p_to date)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.visit_date, x.nurse_name, x.reference), '[]'::jsonb)
  from (
    select
      (b.scheduled_start at time zone 'America/Edmonton')::date as visit_date,
      b.reference, n.full_name as nurse_name,
      c.first_name || ' ' || c.last_name as client_name,
      a.name as area_name,
      i.name as item_name, i.kind, i.payroll_code, i.quantity, i.unit_price_cents, i.line_total_cents,
      b.payment_status
    from public.bookings b
    join public.booking_items i on i.booking_id = b.id
    join public.clients c on c.id = b.client_id
    left join public.nurses n on n.id = b.nurse_id
    left join public.service_areas a on a.id = b.area_id
    where b.status = 'completed'
      and (b.scheduled_start at time zone 'America/Edmonton')::date between p_from and p_to
  ) x;
$$;

-- A nurse's own visits: upcoming plus the last week.
create or replace function public.my_visits()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.scheduled_start), '[]'::jsonb)
  from (
    select b.id, b.reference, b.status, b.scheduled_start, b.scheduled_end,
      b.location_type, b.residence_name, b.visit_address_line1, b.visit_address_line2,
      b.visit_city, b.visit_postal_code, b.concerns, b.client_notes, b.visit_notes,
      b.contact_name, b.contact_phone, b.contact_relationship,
      c.first_name || ' ' || c.last_name as client_name, c.phone as client_phone, c.care_notes,
      (select coalesce(jsonb_agg(i.name order by i.created_at), '[]'::jsonb)
         from public.booking_items i where i.booking_id = b.id and i.kind <> 'fee') as services
    from public.bookings b
    join public.clients c on c.id = b.client_id
    where b.nurse_id = app_private.current_nurse_id()
      and b.status in ('assigned', 'confirmed', 'completed', 'no_show')
      and b.scheduled_start >= now() - interval '7 days'
  ) x;
$$;

-- A nurse marks their own visit done (or a no-show).
create or replace function public.nurse_update_visit(p_booking_id uuid, p_status text, p_visit_notes text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_nurse uuid := app_private.current_nurse_id();
begin
  if v_nurse is null then raise exception 'Only nurses can update visits.' using errcode = '42501'; end if;
  if p_status not in ('completed', 'no_show') then raise exception 'Invalid status.'; end if;

  update public.bookings
  set status = p_status, visit_notes = app_private.clean_note(p_visit_notes, 2000)
  where id = p_booking_id and nurse_id = v_nurse and status in ('assigned', 'confirmed');
  if not found then raise exception 'That visit isn''t assigned to you or is already closed.'; end if;
end;
$$;

-- Saves a nurse and the areas they cover in one go (admins only).
create or replace function public.save_nurse(p jsonb)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid := case when (p ->> 'id') ~ '^[0-9a-fA-F-]{36}$' then (p ->> 'id')::uuid end;
  v_areas uuid[];
begin
  if not app_private.is_admin() then raise exception 'Only admins can manage nurses.' using errcode = '42501'; end if;

  select coalesce(array_agg(value::uuid), '{}') into v_areas
  from jsonb_array_elements_text(coalesce(p -> 'area_ids', '[]'::jsonb));

  if v_id is null then
    insert into public.nurses (full_name, designation, phone, email, active, notes, profile_id)
    values (
      app_private.clean_text(p ->> 'full_name', 120),
      coalesce(nullif(p ->> 'designation', ''), 'LPN'),
      app_private.normalize_phone(p ->> 'phone'),
      lower(app_private.clean_text(p ->> 'email', 254)),
      coalesce((p ->> 'active')::boolean, true),
      app_private.clean_note(p ->> 'notes', 2000),
      nullif(p ->> 'profile_id', '')::uuid
    )
    returning id into v_id;
  else
    update public.nurses set
      full_name = app_private.clean_text(p ->> 'full_name', 120),
      designation = coalesce(nullif(p ->> 'designation', ''), 'LPN'),
      phone = app_private.normalize_phone(p ->> 'phone'),
      email = lower(app_private.clean_text(p ->> 'email', 254)),
      active = coalesce((p ->> 'active')::boolean, true),
      notes = app_private.clean_note(p ->> 'notes', 2000),
      profile_id = nullif(p ->> 'profile_id', '')::uuid
    where id = v_id;
    if not found then raise exception 'Nurse not found.'; end if;
  end if;

  delete from public.nurse_areas where nurse_id = v_id and area_id <> all (v_areas);
  insert into public.nurse_areas (nurse_id, area_id)
  select v_id, a from unnest(v_areas) a
  on conflict do nothing;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Row Level Security
-- ----------------------------------------------------------------------------

alter table public.settings enable row level security;
alter table public.service_areas enable row level security;
alter table public.catalog_items enable row level security;
alter table public.profiles enable row level security;
alter table public.nurses enable row level security;
alter table public.nurse_areas enable row level security;
alter table public.clients enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_items enable row level security;
alter table public.transactions enable row level security;
alter table public.audit_log enable row level security;

-- Settings: readable by everyone (no secrets in here), editable by admins.
create policy settings_read on public.settings for select to anon, authenticated using (true);
create policy settings_admin_update on public.settings for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));

-- Areas: active ones are public (the booking form lists them).
create policy areas_read on public.service_areas for select to anon, authenticated
  using (active or (select app_private.is_admin()));
create policy areas_admin_insert on public.service_areas for insert to authenticated
  with check ((select app_private.is_admin()));
create policy areas_admin_update on public.service_areas for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));

-- Catalog: items offered online are public; staff see everything.
create policy catalog_read on public.catalog_items for select to anon, authenticated
  using ((active and bookable_online) or (select app_private.is_staff()));
create policy catalog_admin_insert on public.catalog_items for insert to authenticated
  with check ((select app_private.is_admin()));
create policy catalog_admin_update on public.catalog_items for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));

-- Profiles: you can see your own; admins see and manage everyone's.
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select app_private.is_admin()));
create policy profiles_admin_update on public.profiles for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));

-- Nurses: admins manage; a nurse sees their own row.
create policy nurses_read on public.nurses for select to authenticated
  using ((select app_private.is_admin()) or id = (select app_private.current_nurse_id()));
create policy nurses_admin_insert on public.nurses for insert to authenticated
  with check ((select app_private.is_admin()));
create policy nurses_admin_update on public.nurses for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));

create policy nurse_areas_read on public.nurse_areas for select to authenticated
  using ((select app_private.is_admin()) or nurse_id = (select app_private.current_nurse_id()));
create policy nurse_areas_admin_insert on public.nurse_areas for insert to authenticated
  with check ((select app_private.is_admin()));
create policy nurse_areas_admin_delete on public.nurse_areas for delete to authenticated
  using ((select app_private.is_admin()));

-- Clients: admins; nurses only for clients on visits assigned to them.
create policy clients_read on public.clients for select to authenticated
  using (
    (select app_private.is_admin())
    or exists (
      select 1 from public.bookings b
      where b.client_id = clients.id
        and b.nurse_id = (select app_private.current_nurse_id())
        and b.status in ('assigned', 'confirmed', 'completed', 'no_show')
    )
  );
create policy clients_admin_insert on public.clients for insert to authenticated
  with check ((select app_private.is_admin()));
create policy clients_admin_update on public.clients for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));

-- Bookings: admins; nurses only their assigned visits. Created through
-- functions only, so prices always come from the catalog.
create policy bookings_read on public.bookings for select to authenticated
  using (
    (select app_private.is_admin())
    or (nurse_id = (select app_private.current_nurse_id())
        and status in ('assigned', 'confirmed', 'completed', 'no_show'))
  );
create policy bookings_admin_update on public.bookings for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));

create policy booking_items_read on public.booking_items for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_items.booking_id));

-- Transactions: admins read, and record non-Stripe money (cash, e-transfer,
-- insurance, card terminal). Card refunds go through Stripe instead.
create policy transactions_admin_read on public.transactions for select to authenticated
  using ((select app_private.is_admin()));
create policy transactions_admin_insert on public.transactions for insert to authenticated
  with check (
    (select app_private.is_admin())
    and method <> 'demo'
    and not (type = 'refund' and method = 'card')
  );

create policy audit_admin_read on public.audit_log for select to authenticated
  using ((select app_private.is_admin()));

-- ----------------------------------------------------------------------------
-- 10. Grants
-- ----------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema app_private from public, anon, authenticated;

-- Helpers that policies call.
grant execute on function app_private.staff_role() to anon, authenticated;
grant execute on function app_private.is_admin() to anon, authenticated;
grant execute on function app_private.is_staff() to anon, authenticated;
grant execute on function app_private.current_nurse_id() to anon, authenticated;
grant execute on function app_private.log_access(text, uuid) to authenticated;
-- Pure text helpers used by invoker functions.
grant execute on function app_private.clean_text(text, int) to authenticated;
grant execute on function app_private.clean_note(text, int) to authenticated;
grant execute on function app_private.normalize_phone(text) to authenticated;
grant execute on function app_private.normalize_postal(text) to authenticated;
grant execute on function app_private.try_date(text) to authenticated;
grant execute on function app_private.is_email(text) to authenticated;

-- Public booking page.
grant select on public.settings, public.service_areas, public.catalog_items to anon;
grant execute on function public.quote_booking(jsonb, uuid, boolean) to anon, authenticated;

-- Signed-in staff (Row Level Security decides which rows).
grant select on all tables in schema public to authenticated;
grant update (online_booking_enabled, min_lead_days, max_days_ahead, gst_rate_bps, require_mfa, booking_notice)
  on public.settings to authenticated;
grant insert, update on public.service_areas, public.catalog_items, public.nurses to authenticated;
grant insert, delete on public.nurse_areas to authenticated;
grant update (full_name, role, active) on public.profiles to authenticated;
grant insert, update on public.clients to authenticated;
grant update (
  status, nurse_id, scheduled_start, duration_min, staff_notes, visit_notes,
  preferred_date, alternate_date, preferred_window, area_id, location_type, residence_name,
  visit_address_line1, visit_address_line2, visit_city, visit_postal_code,
  contact_name, contact_phone, contact_email, contact_relationship,
  insurance, cancel_reason
) on public.bookings to authenticated;
grant insert (booking_id, type, method, amount_cents, note, occurred_at, external_ref)
  on public.transactions to authenticated;

grant execute on function public.my_role() to authenticated;
grant execute on function public.admin_create_booking(jsonb) to authenticated;
grant execute on function public.booking_refundable(uuid) to authenticated, service_role;
grant execute on function public.dispatch_board() to authenticated;
grant execute on function public.booking_detail(uuid) to authenticated;
grant execute on function public.nurse_day_load(date, uuid) to authenticated;
grant execute on function public.search_clients(text) to authenticated;
grant execute on function public.client_detail(uuid) to authenticated;
grant execute on function public.ledger(date, date) to authenticated;
grant execute on function public.payroll_visits(date, date) to authenticated;
grant execute on function public.my_visits() to authenticated;
grant execute on function public.nurse_update_visit(uuid, text, text) to authenticated;
grant execute on function public.save_nurse(jsonb) to authenticated;

-- Edge Functions (secret key).
grant select, insert, update on all tables in schema public to service_role;
grant usage on all sequences in schema public to service_role;
grant execute on function public.create_booking_request(jsonb) to service_role;
grant execute on function public.record_online_payment(uuid, int, text, text, text, text) to service_role;
grant execute on function public.record_refund(uuid, int, text, text, text, text, uuid) to service_role;
grant execute on function public.quote_booking(jsonb, uuid, boolean) to service_role;
grant execute on function app_private.staff_role() to service_role;
grant execute on function app_private.is_admin() to service_role;
grant execute on function app_private.is_staff() to service_role;
grant execute on function app_private.current_nurse_id() to service_role;
