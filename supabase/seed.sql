-- ============================================================================
-- Demo data for the Aloha Footcare platform.
--
-- Everyone in here is fictional. Prices for the two foot care services match
-- the clinic's current rates; the travel surcharges and products are
-- placeholders to confirm with the clinic.
--
-- Load after the migration, in a demo or development project only:
--   supabase db reset            (runs this automatically), or
--   paste into the SQL Editor.
-- Never load into the live project once real client data is in it.
-- ============================================================================

do $$
declare
  v_today date := (now() at time zone 'America/Edmonton')::date;
  -- areas
  a_nw uuid; a_ne uuid; a_sw uuid; a_se uuid;
  a_airdrie uuid; a_cochrane uuid; a_chestermere uuid; a_okotoks uuid;
  -- catalog
  s_af uuid; s_cf uuid;
  -- nurses
  n_leilani uuid; n_marisol uuid; n_hannah uuid; n_priya uuid;
  -- clients
  c_margaret uuid; c_walter uuid; c_evelyn uuid; c_harold uuid; c_dorothy uuid;
  c_rosa uuid; c_kenneth uuid; c_joyce uuid; c_bernard uuid; c_lillian uuid;
  b uuid;
begin
  -- Areas -------------------------------------------------------------------
  insert into public.service_areas (name, surcharge_cents, sort_order) values
    ('Calgary NW', 0, 10), ('Calgary NE', 0, 20), ('Calgary SW', 0, 30), ('Calgary SE', 0, 40),
    ('Airdrie', 2000, 50), ('Cochrane', 2000, 60), ('Chestermere', 2000, 70), ('Okotoks', 2500, 80);
  select id into a_nw from public.service_areas where name = 'Calgary NW';
  select id into a_ne from public.service_areas where name = 'Calgary NE';
  select id into a_sw from public.service_areas where name = 'Calgary SW';
  select id into a_se from public.service_areas where name = 'Calgary SE';
  select id into a_airdrie from public.service_areas where name = 'Airdrie';
  select id into a_cochrane from public.service_areas where name = 'Cochrane';
  select id into a_chestermere from public.service_areas where name = 'Chestermere';
  select id into a_okotoks from public.service_areas where name = 'Okotoks';

  -- Catalog -----------------------------------------------------------------
  insert into public.catalog_items (kind, name, description, duration_min, price_cents, taxable, bookable_online, payroll_code, sort_order)
  values
    ('service', 'Advanced foot care',
     'Assessment, nail trimming and thinning, corns and calluses, and care for ingrown or fungal nails.',
     45, 7500, false, true, 'AF', 10),
    ('service', 'Advanced foot and hand care',
     'Everything in advanced foot care, plus nail care for the hands.',
     60, 9000, false, true, 'CF', 20);
  select id into s_af from public.catalog_items where payroll_code = 'AF';
  select id into s_cf from public.catalog_items where payroll_code = 'CF';

  insert into public.catalog_items (kind, name, description, duration_min, price_cents, taxable, bookable_online, sort_order)
  values
    ('service', 'Nursing service', 'Other nursing care, arranged by phone.', 30, 6000, false, false, 30),
    ('product', 'Urea foot cream', 'Placeholder product. Replace with the clinic''s own.', null, 2800, true, false, 40),
    ('product', 'Antifungal nail solution', 'Placeholder product. Replace with the clinic''s own.', null, 3200, true, false, 50);

  -- Nurses ------------------------------------------------------------------
  insert into public.nurses (full_name, designation, phone, email) values
    ('Leilani Cruz', 'LPN', '403-555-0141', 'leilani.demo@example.com') returning id into n_leilani;
  insert into public.nurses (full_name, designation, phone, email) values
    ('Marisol Reyes', 'LPN', '403-555-0142', 'marisol.demo@example.com') returning id into n_marisol;
  insert into public.nurses (full_name, designation, phone, email) values
    ('Hannah Okafor', 'LPN', '403-555-0143', 'hannah.demo@example.com') returning id into n_hannah;
  insert into public.nurses (full_name, designation, phone, email) values
    ('Priya Shah', 'RN', '403-555-0144', 'priya.demo@example.com') returning id into n_priya;

  insert into public.nurse_areas (nurse_id, area_id) values
    (n_leilani, a_nw), (n_leilani, a_ne), (n_leilani, a_airdrie),
    (n_marisol, a_sw), (n_marisol, a_se), (n_marisol, a_okotoks),
    (n_hannah, a_ne), (n_hannah, a_se), (n_hannah, a_chestermere),
    (n_priya, a_nw), (n_priya, a_sw), (n_priya, a_cochrane);

  -- Clients -----------------------------------------------------------------
  insert into public.clients (first_name, last_name, phone, email, address_line1, city, postal_code, area_id, care_notes, source)
  values ('Margaret', 'Holloway', '403-555-0101', 'm.holloway.demo@example.com', '45 Edgevalley Way NW', 'Calgary', 'T3A 4X9', a_nw,
          'Type 2 diabetes. Reduced sensation in both feet.', 'online')
  returning id into c_margaret;
  insert into public.clients (first_name, last_name, phone, address_line1, city, postal_code, area_id, source)
  values ('Walter', 'Szymanski', '403-555-0102', '2210 Bay View Dr SW', 'Calgary', 'T2V 3N7', a_sw, 'phone')
  returning id into c_walter;
  insert into public.clients (first_name, last_name, phone, address_line1, address_line2, city, postal_code, area_id, source)
  values ('Evelyn', 'Tran', '403-555-0103', '1840 Willow Park Rd SE', 'Suite 214', 'Calgary', 'T2J 3L5', a_se, 'online')
  returning id into c_evelyn;
  insert into public.clients (first_name, last_name, phone, email, address_line1, city, postal_code, area_id, source)
  values ('Harold', 'Biggs', '587-555-0104', 'hbiggs.demo@example.com', '118 Bayside Pl SW', 'Airdrie', 'T4B 2Y6', a_airdrie, 'online')
  returning id into c_harold;
  insert into public.clients (first_name, last_name, address_line1, city, postal_code, area_id,
                              contact_name, contact_phone, contact_email, contact_relationship, care_notes, source)
  values ('Dorothy', 'MacLeod', '73 Mckenzie Lake Cove SE', 'Calgary', 'T2Z 2L4', a_se,
          'Fiona MacLeod', '403-555-0115', 'fiona.demo@example.com', 'Daughter', 'Takes a blood thinner.', 'online')
  returning id into c_dorothy;
  insert into public.clients (first_name, last_name, phone, address_line1, city, postal_code, area_id, source)
  values ('Rosa', 'Delgado', '403-555-0106', '5 Taradale Close NE', 'Calgary', 'T3J 3Z1', a_ne, 'online')
  returning id into c_rosa;
  insert into public.clients (first_name, last_name, phone, email, address_line1, city, postal_code, area_id, source)
  values ('Kenneth', 'Oyelaran', '403-555-0107', 'k.oyelaran.demo@example.com', '22 Sunset Heights', 'Cochrane', 'T4C 0B3', a_cochrane, 'online')
  returning id into c_kenneth;
  insert into public.clients (first_name, last_name, phone, address_line1, city, postal_code, area_id, source)
  values ('Joyce', 'Lam', '403-555-0108', '310 Hawkstone Dr NW', 'Calgary', 'T3G 3P4', a_nw, 'online')
  returning id into c_joyce;
  insert into public.clients (first_name, last_name, phone, email, address_line1, city, postal_code, area_id, source)
  values ('Bernard', 'Kowalczyk', '403-555-0109', 'bkowalczyk.demo@example.com', '930 Canterbury Dr SW', 'Calgary', 'T2W 1J6', a_sw, 'online')
  returning id into c_bernard;
  insert into public.clients (first_name, last_name, phone, address_line1, city, postal_code, area_id, source)
  values ('Lillian', 'Ferreira', '403-555-0110', '48 Auburn Bay Ave SE', 'Calgary', 'T3M 0A8', a_se, 'phone')
  returning id into c_lillian;

  -- Bookings ----------------------------------------------------------------
  -- pg_temp helper: price with the real quote function, insert with the real
  -- insert function, then (optionally) take a demo payment.
  create or replace function pg_temp.demo_booking(
    p_client uuid, p_service uuid, p_area uuid, p_pref date, p_window text,
    p_concerns text[], p_notes text, p_paid boolean,
    p_source text default 'online', p_status text default 'awaiting_payment',
    p_contact jsonb default null
  ) returns uuid language plpgsql as $f$
  declare
    v_c public.clients;
    v_quote jsonb;
    v_b public.bookings;
  begin
    select * into v_c from public.clients where id = p_client;
    v_quote := public.quote_booking(jsonb_build_array(jsonb_build_object('id', p_service, 'quantity', 1)), p_area, true);
    v_b := app_private.insert_booking(
      jsonb_build_object(
        'area_id', p_area,
        'preferred_date', p_pref,
        'preferred_window', p_window,
        'concerns', to_jsonb(p_concerns),
        'client_notes', p_notes,
        'visit', jsonb_build_object(
          'location_type', case when v_c.address_line2 is not null then 'residence' else 'home' end,
          'residence_name', case when v_c.address_line2 is not null then 'Willow Park Residence' end,
          'address_line1', v_c.address_line1, 'address_line2', v_c.address_line2,
          'city', v_c.city, 'postal_code', v_c.postal_code),
        'booking_contact', coalesce(p_contact, jsonb_build_object(
          'name', v_c.first_name || ' ' || v_c.last_name, 'phone', v_c.phone, 'email', v_c.email))
      ),
      v_quote, p_client, p_source, p_status, null);
    if p_paid then
      perform public.record_online_payment(v_b.id, v_b.total_cents, 'demo', 'demo_cs_' || v_b.reference, 'demo_pi_' || v_b.reference);
    end if;
    return v_b.id;
  end $f$;

  -- AL-1001: confirmed for tomorrow morning.
  b := pg_temp.demo_booking(c_margaret, s_af, a_nw, v_today + 1, 'morning', array['diabetic', 'thick_nails'],
                            'Please call when you arrive, the buzzer is broken.', true);
  update public.bookings set nurse_id = n_leilani, status = 'assigned',
    scheduled_start = ((v_today + 1) + time '10:00') at time zone 'America/Edmonton' where id = b;
  update public.bookings set status = 'confirmed' where id = b;

  -- AL-1002: nurse picked, time not yet confirmed with the client.
  b := pg_temp.demo_booking(c_walter, s_cf, a_sw, v_today + 2, 'afternoon', array['corns_calluses'], null, true);
  update public.bookings set nurse_id = n_marisol, status = 'assigned',
    scheduled_start = ((v_today + 2) + time '13:00') at time zone 'America/Edmonton' where id = b;

  -- AL-1003 to AL-1005: paid, waiting for a nurse.
  b := pg_temp.demo_booking(c_evelyn, s_af, a_se, v_today + 2, 'morning', array['fungal_nails'], null, true);
  update public.bookings set created_at = now() - interval '5 hours' where id = b;
  b := pg_temp.demo_booking(c_harold, s_af, a_airdrie, v_today + 3, 'any', array['ingrown_nails'],
                            'Left big toe has been sore for a couple of weeks.', true);
  update public.bookings set created_at = now() - interval '2 hours' where id = b;
  b := pg_temp.demo_booking(c_dorothy, s_af, a_se, v_today + 1, 'afternoon', array['routine_care'],
                            'Mom is hard of hearing. Please call me rather than her.', true,
                            p_contact => jsonb_build_object('name', 'Fiona MacLeod', 'phone', '403-555-0115',
                                                            'email', 'fiona.demo@example.com', 'relationship', 'Daughter'));
  update public.bookings set created_at = now() - interval '40 minutes' where id = b;

  -- AL-1006: confirmed for tomorrow afternoon.
  b := pg_temp.demo_booking(c_rosa, s_cf, a_ne, v_today + 1, 'afternoon', array['cracked_heels'], null, true);
  update public.bookings set nurse_id = n_hannah, status = 'assigned',
    scheduled_start = ((v_today + 1) + time '14:00') at time zone 'America/Edmonton' where id = b;
  update public.bookings set status = 'confirmed' where id = b;

  -- AL-1007: assigned, needs confirming.
  b := pg_temp.demo_booking(c_kenneth, s_af, a_cochrane, v_today + 4, 'morning', array['thick_nails'], null, true);
  update public.bookings set nurse_id = n_priya, status = 'assigned',
    scheduled_start = ((v_today + 4) + time '09:30') at time zone 'America/Edmonton' where id = b;

  -- AL-1008: done last week.
  b := pg_temp.demo_booking(c_joyce, s_af, a_nw, v_today - 6, 'morning', array['routine_care'], null, true);
  update public.bookings set nurse_id = n_leilani, status = 'assigned',
    scheduled_start = ((v_today - 6) + time '11:00') at time zone 'America/Edmonton' where id = b;
  update public.bookings set status = 'confirmed' where id = b;
  update public.bookings set status = 'completed', visit_notes = 'Routine care. Next visit in 6 to 8 weeks.' where id = b;

  -- AL-1009: started online, didn't pay.
  b := pg_temp.demo_booking(c_bernard, s_af, a_sw, v_today + 3, 'any', array['corns_calluses'], null, false);
  update public.bookings set created_at = now() - interval '3 hours' where id = b;

  -- AL-1010: taken by phone, paying by e-transfer later.
  b := pg_temp.demo_booking(c_lillian, s_cf, a_se, v_today + 5, 'morning', array['thick_nails', 'cracked_heels'],
                            null, false, 'phone', 'new');
  update public.bookings set staff_notes = 'Paying by e-transfer before the visit.' where id = b;

  -- AL-1011: Margaret's previous visit.
  b := pg_temp.demo_booking(c_margaret, s_af, a_nw, v_today - 34, 'morning', array['diabetic'], null, true);
  update public.bookings set nurse_id = n_leilani, status = 'assigned',
    scheduled_start = ((v_today - 34) + time '10:00') at time zone 'America/Edmonton' where id = b;
  update public.bookings set status = 'confirmed' where id = b;
  update public.bookings set status = 'completed' where id = b;

  -- AL-1012: cancelled and refunded.
  b := pg_temp.demo_booking(c_walter, s_af, a_sw, v_today - 3, 'morning', array['routine_care'], null, true);
  perform public.record_refund(b, 7500, 'demo', 'demo_re_' || b::text, 'demo_pi_AL-1012', 'Client in hospital', null);
  update public.bookings set status = 'cancelled', cancel_reason = 'Client in hospital. Will rebook.' where id = b;
end $$;
