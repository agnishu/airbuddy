-- Booking a confirmed ride. Run with: npm run test:db
\set ON_ERROR_STOP on

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end;
$$;

create function pg_temp.expect_error(stmt text, what text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAILED: %', what;
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: %', what;
end;
$$;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"full_name": "Asha Rao"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"full_name": "Bela Shah"}'),
  ('00000000-0000-0000-0000-00000000000d', '{"full_name": "Dev Kumar"}');

insert into trips (id, user_id, direction, flight_number, flight_date, airport_iata, airport_name, airport_lat, airport_lng,
                   flight_time, ride_time, address, area, location) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'from_airport', '6E123', '2026-11-01', 'BLR',
   'Kempegowda', 13.1986, 77.7066, '2026-11-01 21:00+05:30', '2026-11-01 21:45+05:30', '12th Main, Indiranagar', 'Indiranagar',
   'SRID=4326;POINT(77.6400 12.9780)'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'from_airport', 'AI501', '2026-11-01', 'BLR',
   'Kempegowda', 13.1986, 77.7066, '2026-11-01 21:10+05:30', '2026-11-01 21:55+05:30', '80 Feet Rd, Domlur', 'Domlur',
   'SRID=4326;POINT(77.6400 12.9900)');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select request_match('10000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000b') as req \gset

select pg_temp.expect_error(format('select claim_booking(%L)', :'req'), 'cannot book before the ride is confirmed');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select respond_to_request(:'req', true);
select propose_plan(:'req', '{"pickup": "Arrivals pillar 5", "time": "2026-11-01T16:15:00Z", "booker": "proposer", "split": "50/50", "drops": "Bela: Domlur flyover"}') as plan \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select accept_plan(:'plan');

-- Asha taps "I'm booking it" first; Bela's later tap returns Asha as the booker.
select pg_temp.check(claim_booking(:'req') = '00000000-0000-0000-0000-00000000000a', 'first rider to tap becomes the booker');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check(claim_booking(:'req') = '00000000-0000-0000-0000-00000000000a', 'second tap does not take over the booking');
select pg_temp.expect_error(format('select save_booking(%L, %L, %L)', :'req', 'https://trip.uber.com/abc', 'x'),
  'only the booker can add booking details');

-- Booking details give each rider only their own address.
select pg_temp.check((select my_address from booking_details(:'req')) = '80 Feet Rd, Domlur', 'Bela sees her own address');
select pg_temp.check((select round(my_lat::numeric, 3) from booking_details(:'req')) = 12.990, 'own coordinates returned for the Uber link');
select pg_temp.check((select plan ->> 'drops' from booking_details(:'req')) = 'Bela: Domlur flyover', 'accepted plan included');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.check(not exists (select 1 from booking_details(:'req')), 'outsiders see no booking details');
select pg_temp.expect_error(format('select claim_booking(%L)', :'req'), 'outsiders cannot claim the booking');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect_error(format('select save_booking(%L, %L, %L)', :'req', 'javascript:alert(1)', ''), 'only https links accepted');
select pg_temp.expect_error(format('select save_booking(%L, %L, %L)', :'req', 'https://uber.com.evil.example/x', ''), 'only Uber or Ola links accepted');
select pg_temp.expect_error(format('select save_booking(%L, %L, %L)', :'req', 'https://evil.example/uber.com', ''), 'lookalike links refused');
select pg_temp.expect_error(format('select save_booking(%L, %L, %L)', :'req', '', '  '), 'empty booking refused');
select save_booking(:'req', 'https://ubr.to/abc123', 'Ravi, white Dzire, KA 01 AB 1234');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select driver_details from booking_details(:'req')) = 'Ravi, white Dzire, KA 01 AB 1234', 'partner sees driver details');
select pg_temp.check((select booking_link from booking_details(:'req')) = 'https://ubr.to/abc123', 'partner sees trip link');

-- Riders can't write booking fields directly.
set role authenticated;
do $$ begin
  update match_requests set booker_id = auth.uid();
  if found then raise exception 'FAILED: rider edited booking directly'; end if;
  raise notice 'ok: booking fields only change through functions';
exception when insufficient_privilege then
  raise notice 'ok: booking fields only change through functions';
end $$;
reset role;

-- Releasing lets the other rider book instead.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select release_booking(:'req');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check(claim_booking(:'req') = '00000000-0000-0000-0000-00000000000b', 'after release, the other rider can book');

-- Cancelling clears the booking.
select cancel_match(:'req');
select pg_temp.check((select booker_id is null and booking_link is null from match_requests where id = :'req'), 'cancel clears the booking');

\echo ALL TESTS PASSED
