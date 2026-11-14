-- Booking the shared cab after a ride is confirmed: one rider claims the
-- booking, opens Uber with the trip filled in, then shares the trip link and
-- driver details with the other rider.

alter table public.trips
  add column airport_lat double precision,
  add column airport_lng double precision;

alter table public.match_requests
  add column booker_id uuid references public.profiles (id) on delete set null,
  add column booking_link text,
  add column driver_details text,
  add column booked_at timestamptz;

-- The first rider to call this becomes the booker, so the cab is never booked twice.
create function public.claim_booking(p_request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  booker uuid;
begin
  update public.match_requests set booker_id = auth.uid()
  where id = p_request_id and status = 'confirmed' and booker_id is null
    and auth.uid() in (from_user_id, to_user_id);

  select booker_id into booker from public.match_requests
  where id = p_request_id and auth.uid() in (from_user_id, to_user_id);
  if booker is null then raise exception 'ride not confirmed'; end if;
  return booker;
end;
$$;

-- The booker hands the booking back, for example when no cab was available.
create function public.release_booking(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.match_requests
  set booker_id = null, booking_link = null, driver_details = null, booked_at = null
  where id = p_request_id and booker_id = auth.uid() and status = 'confirmed';
  if not found then raise exception 'you are not booking this ride'; end if;
end;
$$;

-- The booker shares Uber's trip link and the driver's name, car and plate.
create function public.save_booking(p_request_id uuid, p_link text, p_driver text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  link text := nullif(btrim(p_link), '');
  driver text := nullif(btrim(p_driver), '');
begin
  -- Only Uber and Ola trip links, so a booking can't be used to send riders elsewhere.
  if link is not null and (link !~* '^https://([a-z0-9-]+\.)*(uber\.com|ubr\.to|olacabs\.com)(/\S*)?$' or length(link) > 500) then
    raise exception 'paste the trip link from the Uber or Ola app';
  end if;
  if link is null and driver is null then
    raise exception 'add the trip link or the driver details';
  end if;

  update public.match_requests
  set booking_link = link, driver_details = left(driver, 300), booked_at = now()
  where id = p_request_id and booker_id = auth.uid() and status = 'confirmed';
  if not found then raise exception 'you are not booking this ride'; end if;
end;
$$;

-- What a rider needs to book: their own address and coordinates (never the
-- partner's), the airport, and the plan both riders accepted.
create function public.booking_details(p_request_id uuid)
returns table (
  booker_id uuid,
  booking_link text,
  driver_details text,
  booked_at timestamptz,
  direction text,
  my_address text,
  my_lat double precision,
  my_lng double precision,
  airport_iata text,
  airport_name text,
  airport_lat double precision,
  airport_lng double precision,
  plan jsonb
)
language sql stable security definer set search_path = '' as $$
  select
    r.booker_id,
    r.booking_link,
    r.driver_details,
    r.booked_at,
    mine.direction,
    mine.address,
    extensions.st_y(mine.location::extensions.geometry),
    extensions.st_x(mine.location::extensions.geometry),
    mine.airport_iata,
    mine.airport_name,
    mine.airport_lat,
    mine.airport_lng,
    (select m.plan from public.messages m
     where m.request_id = r.id and m.kind = 'plan' and m.plan_status = 'accepted'
     order by m.created_at desc limit 1)
  from public.match_requests r
  join public.trips mine on mine.id = case when r.from_user_id = auth.uid() then r.from_trip_id else r.to_trip_id end
  where r.id = p_request_id and auth.uid() in (r.from_user_id, r.to_user_id)
$$;

-- Cancelling a ride also clears its booking.
create or replace function public.cancel_match(p_request_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  req public.match_requests;
begin
  update public.match_requests
  set status = 'cancelled', booker_id = null, booking_link = null, driver_details = null, booked_at = null
  where id = p_request_id and auth.uid() in (from_user_id, to_user_id)
    and status in ('pending', 'accepted', 'confirmed')
  returning * into req;
  if not found then raise exception 'request not found'; end if;

  update public.trips set status = 'open'
  where id in (req.from_trip_id, req.to_trip_id) and status = 'matched';
end;
$$;
