-- Security and booking tests. Run with supabase/tests/run-local.sh, which
-- loads the stub, the migration and the demo seed first.
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

-- Assertion helpers --------------------------------------------------------
create function pg_temp.ok(p_cond boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL: %', p_label; end if;
  raise warning 'ok  %', p_label;
end $$;

create function pg_temp.fails(p_sql text, p_expect text, p_label text) returns void
language plpgsql as $$
declare v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if position(lower(p_expect) in lower(v_msg)) = 0 then
      raise exception 'FAIL: % (expected "%", got "%")', p_label, p_expect, v_msg;
    end if;
    raise warning 'ok  %', p_label;
    return;
  end;
  raise exception 'FAIL: % (expected an error containing "%")', p_label, p_expect;
end $$;

grant execute on function pg_temp.ok(boolean, text) to anon, authenticated, service_role;
grant execute on function pg_temp.fails(text, text, text) to anon, authenticated, service_role;

-- Staff accounts -----------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001', 'owner@example.com'),
  ('00000000-0000-0000-0000-00000000a002', 'leilani@example.com'),
  ('00000000-0000-0000-0000-00000000a003', 'stranger@example.com');
update public.profiles set role = 'admin' where email = 'owner@example.com';
update public.profiles set role = 'nurse' where email = 'leilani@example.com';
update public.nurses set profile_id = '00000000-0000-0000-0000-00000000a002' where full_name = 'Leilani Cruz';

select (select id from public.catalog_items where payroll_code = 'AF') as af,
       (select id from public.catalog_items where payroll_code = 'CF') as cf,
       (select id from public.catalog_items where name = 'Nursing service') as nursing,
       (select id from public.catalog_items where name = 'Urea foot cream') as cream,
       (select id from public.service_areas where name = 'Calgary NW') as nw,
       (select id from public.service_areas where name = 'Calgary SE') as se,
       (select id from public.service_areas where name = 'Airdrie') as airdrie,
       (select id from public.nurses where full_name = 'Leilani Cruz') as leilani,
       (select id from public.nurses where full_name = 'Marisol Reyes') as marisol,
       ((now() at time zone 'America/Edmonton')::date + 3)::text as d3,
       ((now() at time zone 'America/Edmonton')::date + 9)::text as d9,
       (now() at time zone 'America/Edmonton')::date::text as today
\gset

select pg_temp.ok((select count(*) from public.bookings) = 12, 'seed created 12 bookings');
select pg_temp.ok((select status from public.bookings where reference = 'AL-1003') = 'new', 'paid online booking moved to the queue');
select pg_temp.ok((select payment_status from public.bookings where reference = 'AL-1012') = 'refunded', 'refund recorded on cancelled booking');
select pg_temp.ok((select total_cents from public.bookings where reference = 'AL-1004') = 9500, 'Airdrie surcharge priced into AL-1004');

-- ===========================================================================
-- Visitors (anon)
-- ===========================================================================
begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select pg_temp.ok((select count(*) from public.settings) = 1, 'anon reads settings');
select pg_temp.ok((select count(*) from public.service_areas) = 8, 'anon reads active areas');
select pg_temp.ok((select count(*) from public.catalog_items) = 2, 'anon sees only the 2 services offered online');
select pg_temp.fails('select * from public.clients', 'permission denied', 'anon cannot read clients');
select pg_temp.fails('select * from public.bookings', 'permission denied', 'anon cannot read bookings');
select pg_temp.fails('select * from public.transactions', 'permission denied', 'anon cannot read transactions');
select pg_temp.fails('select * from public.nurses', 'permission denied', 'anon cannot read nurses');
select pg_temp.fails('select * from public.audit_log', 'permission denied', 'anon cannot read the audit log');

select pg_temp.ok(
  (public.quote_booking(jsonb_build_array(jsonb_build_object('id', :'af')), :'airdrie'::uuid) ->> 'total_cents')::int = 9500,
  'anon quote: AF in Airdrie = $95');
select pg_temp.ok(
  jsonb_array_length(public.quote_booking(jsonb_build_array(jsonb_build_object('id', :'af')), :'airdrie'::uuid) -> 'items') = 2,
  'anon quote includes the travel surcharge line');
select pg_temp.fails(format($q$select public.quote_booking('[{"id":"%s"}]'::jsonb, '%s'::uuid, false)$q$, :'nursing', :'nw'),
  'no longer available', 'anon cannot price a phone-only service, even asking for p_online = false');
select pg_temp.fails(format($q$select public.quote_booking('[{"id":"%s"},{"id":"%s"}]'::jsonb, '%s'::uuid)$q$, :'af', :'cf', :'nw'),
  'one service per visit', 'online visit takes exactly one service');
select pg_temp.fails(format($q$select public.quote_booking('[{"id":"%s"}]'::jsonb)$q$, :'af'),
  'choose your area', 'online quote needs an area');
select pg_temp.fails($q$select public.create_booking_request('{}'::jsonb)$q$, 'permission denied', 'anon cannot call create_booking_request directly');
select pg_temp.fails($q$select public.admin_create_booking('{}'::jsonb)$q$, 'permission denied', 'anon cannot call admin_create_booking');
select pg_temp.fails($q$select public.record_online_payment(gen_random_uuid(), 100, 'card', 'x')$q$, 'permission denied', 'anon cannot record payments');
rollback;

-- ===========================================================================
-- Online booking (Edge Function, secret key)
-- ===========================================================================
begin;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select jsonb_build_object(
  'booking_for', 'self',
  'contact', jsonb_build_object('first_name', ' Agnes ', 'last_name', 'Whitfield', 'phone', '(403) 555-0199', 'email', 'Agnes.Demo@Example.com'),
  'items', jsonb_build_array(jsonb_build_object('id', :'af', 'quantity', 1)),
  'area_id', :'nw',
  'visit', jsonb_build_object('location_type', 'home', 'address_line1', '12 Example Rd NW', 'city', 'Calgary', 'postal_code', 't3a1b2'),
  'preferred_date', :'d3', 'preferred_window', 'morning',
  'concerns', jsonb_build_array('thick_nails', 'diabetic'),
  'client_notes', 'Side door, please.',
  'insurance', 'alberta_blue_cross',
  'consent', true
)::text as req \gset

select public.create_booking_request(:'req'::jsonb) as res \gset
select (:'res'::jsonb ->> 'booking_id') as new_id, (:'res'::jsonb ->> 'reference') as new_ref \gset

select pg_temp.ok((select status from public.bookings where id = :'new_id') = 'awaiting_payment', 'online request starts as awaiting payment');
select pg_temp.ok((select total_cents from public.bookings where id = :'new_id') = 7500, 'online request priced from the catalog ($75)');
select pg_temp.ok((select visit_postal_code from public.bookings where id = :'new_id') = 'T3A 1B2', 'postal code normalized');
select pg_temp.ok((select contact_phone from public.bookings where id = :'new_id') = '403-555-0199', 'phone normalized');
select pg_temp.ok((select c.email from public.clients c join public.bookings b on b.client_id = c.id where b.id = :'new_id') = 'agnes.demo@example.com', 'email lower-cased');
select pg_temp.ok((select c.first_name from public.clients c join public.bookings b on b.client_id = c.id where b.id = :'new_id') = 'Agnes', 'name trimmed');

select (select count(*) from public.clients) as clients_before \gset
select public.create_booking_request(:'req'::jsonb) as res2 \gset
select pg_temp.ok((select count(*) from public.clients) = :clients_before, 'repeat booking reuses the matching client');

-- Booking for someone else.
select public.create_booking_request(jsonb_build_object(
  'booking_for', 'other',
  'contact', jsonb_build_object('first_name', 'Sam', 'last_name', 'Whitfield', 'phone', '403 555 0177', 'email', 'sam.demo@example.com'),
  'patient', jsonb_build_object('first_name', 'Agnes', 'last_name', 'Whitfield-Brown', 'phone', ''),
  'relationship', 'Son',
  'items', jsonb_build_array(jsonb_build_object('id', :'cf')),
  'area_id', :'se',
  'visit', jsonb_build_object('location_type', 'residence', 'residence_name', 'Seaside Manor', 'address_line1', '1 Example Ave SE', 'address_line2', 'Room 4', 'city', 'Calgary', 'postal_code', 'T2Z 1A1'),
  'preferred_date', :'d3', 'consent', true)) as res3 \gset
select pg_temp.ok((select contact_relationship from public.bookings where id = (:'res3'::jsonb ->> 'booking_id')::uuid) = 'Son', 'booking stores who booked it');
select pg_temp.ok((select c.contact_name from public.clients c join public.bookings b on b.client_id = c.id
                   where b.id = (:'res3'::jsonb ->> 'booking_id')::uuid) = 'Sam Whitfield', 'new client keeps the family contact');

select pg_temp.fails(format('select public.create_booking_request(%L::jsonb)', (:'req'::jsonb || '{"consent": false}')::text),
  'how we use your information', 'consent is required');
select pg_temp.fails(format('select public.create_booking_request(%L::jsonb)', (:'req'::jsonb || jsonb_build_object('preferred_date', :'today'))::text),
  'choose a date between', 'same-day request rejected (1 day lead time)');
select pg_temp.fails(format('select public.create_booking_request(%L::jsonb)',
  jsonb_set(:'req'::jsonb, '{visit,postal_code}', '"12345"')::text), 'valid postal code', 'bad postal code rejected');
select pg_temp.fails(format('select public.create_booking_request(%L::jsonb)',
  jsonb_set(:'req'::jsonb, '{contact,phone}', '"555"')::text), '10-digit phone', 'bad phone rejected');
select pg_temp.fails(format('select public.create_booking_request(%L::jsonb)',
  jsonb_set(:'req'::jsonb, '{concerns}', '["hacking"]')::text), 'concerns', 'unknown concern rejected');
select pg_temp.fails(format('select public.create_booking_request(%L::jsonb)',
  jsonb_set(:'req'::jsonb, '{items}', format('[{"id":"%s"}]', :'nursing')::jsonb)::text), 'no longer available', 'phone-only service cannot be booked online');

-- Payment moves it into the queue, once.
select public.record_online_payment(:'new_id'::uuid, 7500, 'card', 'cs_test_1', 'pi_test_1', 'ch_test_1') as pay1 \gset
select public.record_online_payment(:'new_id'::uuid, 7500, 'card', 'cs_test_1', 'pi_test_1', 'ch_test_1') as pay2 \gset
select pg_temp.ok((:'pay1'::jsonb ->> 'recorded')::boolean and not (:'pay2'::jsonb ->> 'recorded')::boolean, 'webhook retry does not double-record');
select pg_temp.ok((select count(*) from public.transactions where booking_id = :'new_id') = 1, 'one payment row');
select pg_temp.ok((select status || '/' || payment_status from public.bookings where id = :'new_id') = 'new/paid', 'paid request is in the dispatch queue');

-- Refund, idempotent.
select public.record_refund(:'new_id'::uuid, 2500, 'card', 're_test_1', 'pi_test_1', 'Partial refund', null) as r1 \gset
select public.record_refund(:'new_id'::uuid, 2500, 'card', 're_test_1', 'pi_test_1', 'Partial refund', null) as r2 \gset
select pg_temp.ok((select payment_status from public.bookings where id = :'new_id') = 'partially_refunded', 'partial refund status');
select pg_temp.ok((public.booking_refundable(:'new_id'::uuid) ->> 'refundable_cents')::int = 5000, 'refundable amount accounts for the refund');

-- Flood protection: this phone already has 2 requests; 2 more are allowed.
select public.create_booking_request(:'req'::jsonb) as f3 \gset
select public.create_booking_request(:'req'::jsonb) as f4 \gset
select pg_temp.fails(format('select public.create_booking_request(%L::jsonb)', :'req'), 'several requests', 'fifth request in 15 minutes is refused');
commit;

begin;
update public.settings set online_booking_enabled = false;
set local role service_role;
select pg_temp.fails(format('select public.create_booking_request(%L::jsonb)', :'req'), 'paused', 'online booking can be paused');
rollback;

-- ===========================================================================
-- Signed in, but no role yet
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a003","role":"authenticated","aal":"aal1"}', true);

select pg_temp.ok((select count(*) from public.bookings) = 0, 'no-role user sees no bookings');
select pg_temp.ok((select count(*) from public.clients) = 0, 'no-role user sees no clients');
select pg_temp.ok((select count(*) from public.transactions) = 0, 'no-role user sees no transactions');
select pg_temp.ok((select count(*) from public.catalog_items) = 2, 'no-role user sees only the public catalog');
select pg_temp.ok((select count(*) from public.profiles) = 1, 'no-role user sees only their own profile');
select pg_temp.ok(public.dispatch_board() = '[]'::jsonb, 'dispatch board empty for no-role user');
select pg_temp.ok(public.booking_detail((select id from public.bookings limit 1)) is null, 'booking detail hidden from no-role user');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000a003';
select pg_temp.ok((select role from public.profiles where id = '00000000-0000-0000-0000-00000000a003') = 'none', 'cannot promote yourself');
select pg_temp.fails(format($q$insert into public.transactions (booking_id, type, method, amount_cents) values (%L, 'payment', 'cash', 100)$q$, :'new_id'),
  'row-level security', 'no-role user cannot record payments');
select pg_temp.fails($q$select public.admin_create_booking('{}'::jsonb)$q$, 'only admins', 'no-role user cannot create bookings');
select pg_temp.fails($q$select public.create_booking_request('{}'::jsonb)$q$, 'permission denied', 'signed-in users cannot call the online booking function directly');
rollback;

-- ===========================================================================
-- Admin
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated","aal":"aal1"}', true);

select pg_temp.ok((select count(*) from public.bookings) >= 16, 'admin sees all bookings');
select pg_temp.ok((select count(*) from public.catalog_items) = 5, 'admin sees the full catalog');
select pg_temp.ok(
  (select count(*) from jsonb_array_elements(public.dispatch_board()) e where e ->> 'status' in ('completed', 'cancelled')) = 0,
  'dispatch board leaves out finished visits');
select pg_temp.ok(
  (select count(*) from jsonb_array_elements(public.dispatch_board()) e where e ->> 'reference' = 'AL-1009') = 1,
  'dispatch board includes unpaid requests');

select id as b1003 from public.bookings where reference = 'AL-1003' \gset
select id as b1005 from public.bookings where reference = 'AL-1005' \gset
select id as b1010 from public.bookings where reference = 'AL-1010' \gset

select (select count(*) from public.audit_log where action = 'view') as views_before \gset
select public.booking_detail(:'b1003') is not null as has_detail \gset
select pg_temp.ok(:'has_detail'::boolean, 'admin opens a booking');
select pg_temp.ok((select count(*) from public.audit_log where action = 'view') = :views_before + 2, 'opening a booking logs a view of the booking and the client');

-- Dispatch.
select pg_temp.fails(format($q$update public.bookings set status = 'assigned' where id = %L$q$, :'b1003'), 'assign a nurse first', 'cannot assign without a nurse');
select pg_temp.fails(format($q$update public.bookings set status = 'confirmed', nurse_id = %L where id = %L$q$, :'marisol', :'b1003'),
  'set the visit date and time', 'cannot confirm without a time');
update public.bookings set nurse_id = :'marisol', status = 'assigned',
  scheduled_start = ((:'d3')::date + time '10:00') at time zone 'America/Edmonton' where id = :'b1003';
update public.bookings set status = 'confirmed' where id = :'b1003';
select pg_temp.ok((select confirmed_at is not null and scheduled_end = scheduled_start + interval '45 minutes'
                   from public.bookings where id = :'b1003'), 'confirming stamps the time and sets the end from the duration');
select pg_temp.fails(format($q$update public.bookings set nurse_id = %L, status = 'assigned',
  scheduled_start = (%L::date + time '10:30') at time zone 'America/Edmonton' where id = %L$q$, :'marisol', :'d3', :'b1005'),
  'bookings_no_nurse_overlap', 'a nurse cannot be double-booked');
update public.bookings set nurse_id = :'marisol', status = 'assigned',
  scheduled_start = ((:'d3')::date + time '10:45') at time zone 'America/Edmonton' where id = :'b1005';
select pg_temp.ok((select status from public.bookings where id = :'b1005') = 'assigned', 'back-to-back visits are allowed');
select pg_temp.fails(format($q$update public.bookings set status = 'cancelled' where id = %L$q$, :'b1005'), 'reason for cancelling', 'cancelling needs a reason');
select pg_temp.fails(format($q$update public.bookings set total_cents = 1 where id = %L$q$, :'b1005'), 'permission denied', 'admins cannot edit prices on a booking directly');
select pg_temp.fails(format($q$update public.bookings set status = 'awaiting_payment' where id = %L$q$, :'b1005'), 'back to awaiting payment', 'cannot go back to awaiting payment');

-- Day load for assignment suggestions.
select pg_temp.ok(
  (select (e ->> 'visit_count')::int from jsonb_array_elements(public.nurse_day_load(:'d3'::date, :'se'::uuid)) e
   where e ->> 'full_name' = 'Marisol Reyes') = 2, 'nurse day load counts visits that day');
select pg_temp.ok(
  (public.nurse_day_load(:'d3'::date, :'se'::uuid) -> 0 ->> 'covers_area')::boolean, 'nurses covering the area are listed first');

-- Money.
insert into public.transactions (booking_id, type, method, amount_cents, note)
values (:'b1010', 'payment', 'etransfer', 9000, 'E-transfer received');
select pg_temp.ok((select payment_status || '/' || status from public.bookings where id = :'b1010') = 'paid/new', 'e-transfer recorded, booking paid, stays in queue');
select pg_temp.ok((select recorded_by from public.transactions where booking_id = :'b1010') = '00000000-0000-0000-0000-00000000a001',
  'transaction records who entered it');
select pg_temp.fails(format($q$insert into public.transactions (booking_id, type, method, amount_cents) values (%L, 'refund', 'card', -100)$q$, :'b1010'),
  'row-level security', 'card refunds must go through Stripe');
select pg_temp.fails(format($q$insert into public.transactions (booking_id, type, method, amount_cents) values (%L, 'payment', 'demo', 100)$q$, :'b1010'),
  'row-level security', 'admins cannot record demo payments');
select pg_temp.fails(format($q$insert into public.transactions (booking_id, type, method, amount_cents, stripe_refund_id) values (%L, 'refund', 'cash', -100, 'x')$q$, :'b1010'),
  'permission denied', 'admins cannot set Stripe ids');
select pg_temp.fails($q$update public.transactions set amount_cents = 1$q$, 'permission denied', 'admins cannot edit transactions');
select pg_temp.fails($q$delete from public.transactions$q$, 'permission denied', 'admins cannot delete transactions');

-- Phone booking with a product: offline items allowed, GST on the product.
select public.admin_create_booking(jsonb_build_object(
  'client', jsonb_build_object('first_name', 'Phone', 'last_name', 'Caller', 'phone', '4035550188'),
  'items', jsonb_build_array(jsonb_build_object('id', :'af'), jsonb_build_object('id', :'cream')),
  'area_id', :'airdrie',
  'visit', jsonb_build_object('address_line1', '9 Example Way', 'city', 'Airdrie'),
  'preferred_date', :'d9', 'preferred_window', 'any',
  'staff_notes', 'Called in.')) as phone \gset
select pg_temp.ok((select total_cents || '/' || tax_cents || '/' || status || '/' || source from public.bookings
                   where id = (:'phone'::jsonb ->> 'booking_id')::uuid) = '12440/140/new/phone',
  'phone booking: $75 + $28 cream + $20 surcharge + $1.40 GST = $124.40');

-- Nurses.
select public.save_nurse(jsonb_build_object('full_name', 'New Nurse', 'designation', 'LPN', 'phone', '403.555.0166',
  'area_ids', jsonb_build_array(:'nw', :'se'))) as new_nurse \gset
select pg_temp.ok((select count(*) from public.nurse_areas where nurse_id = :'new_nurse') = 2, 'new nurse saved with 2 areas');
select public.save_nurse(jsonb_build_object('id', :'new_nurse', 'full_name', 'New Nurse', 'area_ids', jsonb_build_array(:'se'))) as same_nurse \gset
select pg_temp.ok((select count(*) from public.nurse_areas where nurse_id = :'new_nurse') = 1, 'nurse areas replaced on save');

-- Reports.
select pg_temp.ok(jsonb_array_length(public.ledger(:'today'::date - 60, :'today'::date)) >= 10, 'ledger lists transactions');
select pg_temp.ok(
  (select count(*) from jsonb_array_elements(public.payroll_visits(:'today'::date - 60, :'today'::date)) e where e ->> 'payroll_code' = 'AF') = 2,
  'payroll export lists completed AF visits');
select pg_temp.ok(public.search_clients('holloway') -> 0 ->> 'last_name' = 'Holloway', 'client search by name');
select pg_temp.ok(public.search_clients('5550101') -> 0 ->> 'last_name' = 'Holloway', 'client search by phone digits');

-- Audit log stores field names, not values.
select pg_temp.ok(
  exists (select 1 from public.audit_log
          where table_name = 'bookings' and record_id = :'b1003' and action = 'update'
            and changed_fields @> array['nurse_id', 'status']
            and actor_id = '00000000-0000-0000-0000-00000000a001'),
  'audit log records which fields changed');
select pg_temp.ok(
  not exists (select 1 from public.audit_log where array_to_string(changed_fields, ',') ilike '%Side door%'),
  'audit log holds no field values');

-- Lockout guards.
select pg_temp.fails($q$update public.profiles set role = 'nurse' where email = 'owner@example.com'$q$, 'at least one active admin', 'last admin cannot demote themselves');
select pg_temp.fails($q$update public.settings set require_mfa = true$q$, 'two-step sign-in', 'cannot require MFA before using it');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated","aal":"aal2"}', true);
update public.settings set require_mfa = true;
select pg_temp.ok((select count(*) from public.bookings) > 0, 'admin signed in with MFA keeps access');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated","aal":"aal1"}', true);
select pg_temp.ok((select count(*) from public.bookings) = 0, 'once MFA is required, a password-only session sees nothing');
rollback;

-- ===========================================================================
-- Nurse
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated","aal":"aal1"}', true);

select pg_temp.ok((select count(*) from public.bookings) = 3, 'nurse sees only her 3 assigned visits');
select pg_temp.ok((select bool_and(nurse_id = :'leilani') from public.bookings), 'every visible booking is hers');
select pg_temp.ok((select count(*) from public.clients) = 2, 'nurse sees only her clients');
select pg_temp.ok((select count(*) from public.transactions) = 0, 'nurse sees no payments');
select pg_temp.ok((select count(*) from public.audit_log) = 0, 'nurse cannot read the audit log');
select pg_temp.ok((select count(*) from public.nurses) = 1, 'nurse sees only her own nurse record');
select pg_temp.ok(jsonb_array_length(public.my_visits()) = 2, 'my visits: upcoming + last 7 days');

select id as b1001 from public.bookings where reference = 'AL-1001' \gset
update public.bookings set staff_notes = 'tamper' where id = :'b1001';
select pg_temp.ok((select staff_notes from public.bookings where id = :'b1001') is null, 'nurse cannot edit bookings directly');
select public.nurse_update_visit(:'b1001', 'completed', 'All good.');
select pg_temp.ok((select status from public.bookings where id = :'b1001') = 'completed', 'nurse completes her own visit');
select pg_temp.fails(format($q$select public.nurse_update_visit(%L, 'completed')$q$, :'b1003'), 'isn''t assigned to you', 'nurse cannot close someone else''s visit');
rollback;

-- Transactions can't be changed, even with full database access.
select pg_temp.fails($q$update public.transactions set amount_cents = 1$q$, 'can''t be changed', 'transactions are append-only for everyone');
select pg_temp.fails($q$delete from public.audit_log$q$, 'can''t be changed', 'audit log is append-only for everyone');

\echo 'All database tests passed.'
