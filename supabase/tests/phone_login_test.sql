-- Phone login support: photos and the verification table. Run with: npm run test:db
\set ON_ERROR_STOP on

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end;
$$;

-- Phone sign-ups arrive with no name or photo.
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"phone": "+919876543210"}'),
  ('00000000-0000-0000-0000-00000000000b', '{}');
select pg_temp.check((select photo_url is null from profiles where id = '00000000-0000-0000-0000-00000000000a'), 'phone sign-up starts without a photo');

insert into trips (id, user_id, direction, flight_number, flight_date, airport_iata, flight_time, ride_time, address, area, location) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'to_airport', '6E1', '2026-11-01', 'BLR',
   '2026-11-01 08:30+05:30', '2026-11-01 06:00+05:30', 'a', 'Indiranagar', 'SRID=4326;POINT(77.6400 12.9780)'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'to_airport', '6E2', '2026-11-01', 'BLR',
   '2026-11-01 08:40+05:30', '2026-11-01 06:10+05:30', 'b', 'Indiranagar', 'SRID=4326;POINT(77.6410 12.9790)');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

do $$ begin
  perform request_match('10000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000b');
  raise exception 'FAILED: requested without a photo';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: a photo is needed before sending a request';
end $$;

-- Photo URLs must point at the rider's own upload.
do $$ begin
  update profiles set photo_url = 'https://tracker.example/pixel.png' where id = auth.uid();
  raise exception 'FAILED: set an outside photo URL';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: outside photo URLs refused';
end $$;
do $$ begin
  update profiles set photo_url = 'https://abc.supabase.co/storage/v1/object/public/avatars/00000000-0000-0000-0000-00000000000b/x.jpg' where id = auth.uid();
  raise exception 'FAILED: used another rider''s photo';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: another rider''s upload refused';
end $$;
update profiles set photo_url = 'https://abc.supabase.co/storage/v1/object/public/avatars/00000000-0000-0000-0000-00000000000a/1730000000.jpg' where id = auth.uid();
select pg_temp.check((select photo_url like '%/avatars/00000000-0000-0000-0000-00000000000a/%' from profiles), 'own upload accepted');

select request_match('10000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000b') as req \gset
select pg_temp.check(:'req' is not null, 'with a photo, the request goes through');

-- Accepting also needs a photo.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  perform respond_to_request((select id from match_requests limit 1), true);
  raise exception 'FAILED: accepted without a photo';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: a photo is needed before accepting';
end $$;
select respond_to_request(:'req', false);
select pg_temp.check((select status from match_requests where id = :'req') = 'declined', 'declining needs no photo');

-- Storage: riders upload only into their own folder.
insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-00000000000b/me.jpg');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-00000000000a/fake.jpg');
  raise exception 'FAILED: uploaded into someone else''s folder';
exception when insufficient_privilege then
  raise notice 'ok: uploads only into your own folder';
end $$;

-- The verification table is server-only.
do $$ begin
  perform 1 from phone_verifications;
  if exists (select 1 from phone_verifications) then raise exception 'FAILED: read verifications'; end if;
  raise notice 'ok: riders cannot read phone verifications';
exception when insufficient_privilege then
  raise notice 'ok: riders cannot read phone verifications';
end $$;
reset role;
insert into phone_verifications (phone, verification_id) values ('9876543210', '123');
set role authenticated;
select pg_temp.check(not exists (select 1 from phone_verifications), 'verification rows hidden from riders');
reset role;

\echo ALL TESTS PASSED
