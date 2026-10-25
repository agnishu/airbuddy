-- Matching and request-flow checks. Run with: npm run test:db
\set ON_ERROR_STOP on

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end;
$$;

-- Riders: Asha (female), Bela (female), Chetan (male), Dev (male), Esha (female, far away)
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"full_name": "Asha Rao", "avatar_url": "https://example.com/a.png"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"name": "Bela Shah"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"full_name": "Chetan Iyer"}'),
  ('00000000-0000-0000-0000-00000000000d', '{"full_name": "Dev Kumar"}'),
  ('00000000-0000-0000-0000-00000000000e', '{"full_name": "Esha Nair"}');

select pg_temp.check((select full_name from profiles where id = '00000000-0000-0000-0000-00000000000b') = 'Bela Shah',
  'profile created from Google name on sign-up');

update profiles set gender = 'female' where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000e');
update profiles set gender = 'male' where id in ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d');

-- All to BLR around 06:00 IST. Points near Indiranagar, Bengaluru (~0.009 deg lat = 1 km).
insert into trips (id, user_id, direction, flight_number, flight_date, airport_iata, terminal, flight_time, ride_time, address, area, location, same_gender_only) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'to_airport', '6E123', '2026-11-01', 'BLR', 'T1',
   '2026-11-01 08:30+05:30', '2026-11-01 06:00+05:30', 'a', 'Indiranagar', 'SRID=4326;POINT(77.6400 12.9780)', true),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'to_airport', 'AI501', '2026-11-01', 'BLR', 'T2',
   '2026-11-01 09:00+05:30', '2026-11-01 06:40+05:30', 'b', 'Indiranagar', 'SRID=4326;POINT(77.6400 12.9900)', false),
  ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', 'to_airport', '6E456', '2026-11-01', 'BLR', 'T1',
   '2026-11-01 08:00+05:30', '2026-11-01 05:45+05:30', 'c', 'Indiranagar', 'SRID=4326;POINT(77.6410 12.9785)', false),
  ('10000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', 'to_airport', '6E789', '2026-11-01', 'BLR', 'T1',
   '2026-11-01 10:30+05:30', '2026-11-01 07:30+05:30', 'd', 'Indiranagar', 'SRID=4326;POINT(77.6400 12.9781)', false),
  ('10000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000e', 'to_airport', 'UK811', '2026-11-01', 'BLR', 'T2',
   '2026-11-01 08:40+05:30', '2026-11-01 06:10+05:30', 'e', 'Whitefield', 'SRID=4326;POINT(77.7500 12.9700)', false);

-- As Chetan (male, filter off): Asha has same-gender on, Dev is 105 min later,
-- Esha is ~12 km away. Bela is 55 min later and ~1.3 km away.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check((select array_agg(first_name order by score) from find_matches('10000000-0000-0000-0000-00000000000c')) = array['Bela'],
  'Chetan matches only Bela (Asha wants women only, Dev too late, Esha too far)');

-- As Asha (female, filter on): Bela is female and in range; Chetan is excluded.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((select array_agg(first_name) from find_matches('10000000-0000-0000-0000-00000000000a')) = array['Bela'],
  'Asha (same-gender on) matches only Bela');
select pg_temp.check((select distance_band from find_matches('10000000-0000-0000-0000-00000000000a')) = '1 to 2 km',
  'distance shown as a band, not an address');
select pg_temp.check((select minutes_apart from find_matches('10000000-0000-0000-0000-00000000000a')) = 40,
  'minutes apart computed');

-- Someone else's trip can't be searched.
do $$ begin
  perform find_matches('10000000-0000-0000-0000-00000000000b');
  raise exception 'FAILED: searched another rider''s trip';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: cannot search another rider''s trip';
end $$;

-- Request flow: Asha requests Bela, Bela accepts, Asha proposes a plan, Bela accepts it.
select request_match('10000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000b') as req \gset
-- Requests to non-matches are refused.
do $$ begin
  perform request_match('10000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000c');
  raise exception 'FAILED: requested a non-match';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: cannot request a non-match';
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select respond_to_request(:'req', true);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select propose_plan(:'req', '{"pickup": "Indiranagar metro", "time": "06:15", "booker": "Asha", "split": "50/50"}') as plan \gset
-- Asha cannot accept her own plan.
do $$ declare p uuid; begin
  select id into p from messages where kind = 'plan' and plan_status = 'proposed';
  perform accept_plan(p);
  raise exception 'FAILED: accepted own plan';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: cannot accept your own plan';
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select accept_plan(:'plan');
select pg_temp.check((select status from match_requests where id = :'req') = 'confirmed', 'request confirmed after plan accepted');
select pg_temp.check((select count(*) from trips where status = 'matched') = 2, 'both trips matched');

-- Matched trips no longer show up for others.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check(not exists (select 1 from find_matches('10000000-0000-0000-0000-00000000000c')), 'matched trips hidden from search');

-- Cancelling puts both back into matching.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select cancel_match(:'req');
select pg_temp.check((select count(*) from trips where status = 'open') = 5, 'cancel reopens both trips');

-- Blocking hides riders from each other.
insert into blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check(not exists (select 1 from find_matches('10000000-0000-0000-0000-00000000000c')), 'blocked riders never match');


-- Chat details show the partner's first name and area, never their address.
reset request.jwt.claim.sub;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((select partner_first_name || '/' || partner_area from chat_details(:'req')) = 'Bela/Indiranagar',
  'chat shows partner first name and area');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.check(not exists (select 1 from chat_details(:'req')), 'outsiders see nothing of a chat');

-- Row-level security, as a signed-in rider.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.check((select count(*) from trips) = 1, 'riders read only their own trips (and so no other addresses)');
select pg_temp.check((select count(*) from profiles) = 1, 'riders read only their own profile');
select pg_temp.check((select count(*) from messages) = 0, 'outsiders read no messages');
do $$ begin
  update trips set status = 'matched' where user_id = auth.uid();
  raise exception 'FAILED: rider set own trip to matched';
exception when insufficient_privilege or check_violation then
  raise notice 'ok: riders can only cancel trips directly';
end $$;
update trips set status = 'cancelled' where user_id = auth.uid();
select pg_temp.check((select status from trips) = 'cancelled', 'riders can cancel their own trip');
do $$ begin
  update profiles set paused = false where id = auth.uid();
  raise exception 'FAILED: rider edited paused flag';
exception when insufficient_privilege then
  raise notice 'ok: riders cannot unpause themselves';
end $$;
reset role;

-- Two reports from different riders pause an account and hide it from matching.
insert into reports (reporter_id, reported_id, reason) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'no-show'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', 'rude');
select pg_temp.check((select paused from profiles where id = '00000000-0000-0000-0000-00000000000c'), 'two reports pause the account');
delete from blocks;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check(not exists (select 1 from find_matches('10000000-0000-0000-0000-00000000000b') where first_name = 'Chetan'),
  'paused riders hidden from matching');


-- Cleanup: old trips go, unless tied to a report.
insert into trips (id, user_id, direction, flight_number, flight_date, airport_iata, flight_time, ride_time, address, area, location) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000d', 'to_airport', 'OLD1', '2026-01-01', 'BLR',
   now() - interval '10 days', now() - interval '10 days', 'x', 'Old', 'SRID=4326;POINT(77.64 12.97)'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000e', 'to_airport', 'OLD2', '2026-01-01', 'BLR',
   now() - interval '10 days', now() - interval '10 days', 'x', 'Old', 'SRID=4326;POINT(77.64 12.97)');
insert into reports (reporter_id, reported_id, trip_id, reason)
  values ('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000d', '20000000-0000-0000-0000-000000000002', 'x');
select pg_temp.check(purge_old_trips() = 1, 'purge deletes one old trip');
select pg_temp.check(exists (select 1 from trips where id = '20000000-0000-0000-0000-000000000002'), 'reported trip kept');
select pg_temp.check(exists (select 1 from trips where id = '10000000-0000-0000-0000-00000000000a'), 'upcoming trips untouched');

\echo ALL TESTS PASSED
