-- Prototype only: two staff accounts for the one-click sign-in buttons.
-- Loaded after supabase/seed.sql. Fictional people, example.com addresses.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000a001', 'office@example.com', '{"full_name": "Office Manager"}'),
  ('00000000-0000-0000-0000-00000000a002', 'leilani@example.com', '{"full_name": "Leilani Cruz"}');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000a001';
update public.profiles set role = 'nurse' where id = '00000000-0000-0000-0000-00000000a002';
update public.nurses set profile_id = '00000000-0000-0000-0000-00000000a002' where full_name = 'Leilani Cruz';
