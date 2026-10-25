-- Airbuddy initial schema: profiles, trips, matching, requests, chat, safety.
-- Exact trip locations never leave the database: other riders only see
-- what find_matches() returns (distance band, time gap, first name, photo).

create extension if not exists postgis with schema extensions;

-- Profiles ------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  photo_url text,
  gender text check (gender in ('female', 'male', 'other', 'undisclosed')),
  -- Set after two reports from different riders; hides the rider from matching.
  paused boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: owner reads" on public.profiles
  for select using (id = auth.uid());
create policy "profiles: owner inserts" on public.profiles
  for insert with check (id = auth.uid());
create policy "profiles: owner updates" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Riders may edit only their name and gender; paused is set by reports.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, gender) on public.profiles to authenticated;

-- Create a profile from the Google account on first sign-in.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, photo_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Flight lookups are cached so each flight costs one API call per refresh.
create table public.flight_cache (
  flight_number text not null,
  flight_date date not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (flight_number, flight_date)
);

alter table public.flight_cache enable row level security;
-- No policies: only the server (service role) reads and writes the cache.

-- Trips ---------------------------------------------------------------------

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  direction text not null check (direction in ('to_airport', 'from_airport')),
  flight_number text not null,
  flight_date date not null,
  airport_iata text not null,
  airport_name text,
  terminal text,
  is_international boolean not null default false,
  -- Departure time for trips to the airport, arrival time for trips from it.
  flight_time timestamptz not null,
  -- When the shared cab is needed: leave-by time, or kerbside time after landing.
  ride_time timestamptz not null,
  address text not null,
  area text not null,
  location extensions.geography (point, 4326) not null,
  seats int not null default 1 check (seats between 1 and 3),
  bags int not null default 1 check (bags between 0 and 4),
  same_gender_only boolean not null default false,
  status text not null default 'open' check (status in ('open', 'matched', 'cancelled')),
  created_at timestamptz not null default now()
);

create index trips_location_idx on public.trips using gist (location);
create index trips_open_idx on public.trips (airport_iata, direction, ride_time) where status = 'open';

alter table public.trips enable row level security;

create policy "trips: owner reads" on public.trips
  for select using (user_id = auth.uid());
create policy "trips: owner inserts" on public.trips
  for insert with check (user_id = auth.uid());
-- Riders can only cancel their own trips directly; matching changes go through functions.
create policy "trips: owner cancels" on public.trips
  for update using (user_id = auth.uid()) with check (user_id = auth.uid() and status = 'cancelled');
revoke update on public.trips from anon, authenticated;
grant update (status) on public.trips to authenticated;
create policy "trips: owner deletes" on public.trips
  for delete using (user_id = auth.uid());

-- Safety --------------------------------------------------------------------

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

alter table public.blocks enable row level security;

create policy "blocks: owner manages" on public.blocks
  for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  trip_id uuid references public.trips (id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

create policy "reports: reporter inserts" on public.reports
  for insert with check (reporter_id = auth.uid());
create policy "reports: reporter reads" on public.reports
  for select using (reporter_id = auth.uid());

-- Matching ------------------------------------------------------------------

-- Seats and bags two riders can share in one standard cab.
create function public.fits_in_cab(a public.trips, b public.trips) returns boolean
language sql immutable as $$
  select a.seats + b.seats <= 3 and a.bags + b.bags <= 4
$$;

-- Open trips that can share a cab with p_trip_id, best first.
-- Only callable by the trip's owner; never returns exact addresses.
create function public.find_matches(p_trip_id uuid)
returns table (
  trip_id uuid,
  first_name text,
  photo_url text,
  area text,
  distance_band text,
  minutes_apart int,
  terminal text,
  same_terminal boolean,
  ride_time timestamptz,
  score numeric
)
language plpgsql stable security definer set search_path = '' as $$
declare
  me public.trips;
  my_gender text;
begin
  select * into me from public.trips t where t.id = p_trip_id and t.user_id = auth.uid();
  if not found then
    raise exception 'trip not found';
  end if;

  select p.gender into my_gender from public.profiles p where p.id = me.user_id;

  return query
  select
    o.id,
    split_part(p.full_name, ' ', 1),
    p.photo_url,
    o.area,
    case
      when extensions.st_distance(me.location, o.location) < 1000 then 'under 1 km'
      else '1 to 2 km'
    end,
    round(extract(epoch from (o.ride_time - me.ride_time)) / 60)::int,
    o.terminal,
    coalesce(o.terminal = me.terminal, false),
    o.ride_time,
    round((
      extensions.st_distance(me.location, o.location) / 1000
      + abs(extract(epoch from (o.ride_time - me.ride_time))) / 60 / 20
      - case when o.terminal = me.terminal then 0.5 else 0 end
    )::numeric, 2) as score
  from public.trips o
  join public.profiles p on p.id = o.user_id
  where o.status = 'open'
    and not p.paused
    and o.id <> me.id
    and o.user_id <> me.user_id
    and o.direction = me.direction
    and o.airport_iata = me.airport_iata
    and o.ride_time between me.ride_time - interval '1 hour' and me.ride_time + interval '1 hour'
    and extensions.st_dwithin(me.location, o.location, 2000)
    and public.fits_in_cab(me, o)
    -- Same-gender: applies when either rider has it on, and both must have disclosed the same gender.
    and (
      not (me.same_gender_only or o.same_gender_only)
      or (my_gender is not null and my_gender = p.gender and my_gender <> 'undisclosed')
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = me.user_id and b.blocked_id = o.user_id)
         or (b.blocker_id = o.user_id and b.blocked_id = me.user_id)
    )
  order by score, o.ride_time;
end;
$$;

-- Requests and chat ---------------------------------------------------------

create table public.match_requests (
  id uuid primary key default gen_random_uuid(),
  from_trip_id uuid not null references public.trips (id) on delete cascade,
  to_trip_id uuid not null references public.trips (id) on delete cascade,
  from_user_id uuid not null references public.profiles (id) on delete cascade,
  to_user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired', 'confirmed', 'cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (from_trip_id, to_trip_id)
);

alter table public.match_requests enable row level security;

create policy "requests: participants read" on public.match_requests
  for select using (auth.uid() in (from_user_id, to_user_id));

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.match_requests (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'plan')),
  body text not null default '',
  -- For kind = 'plan': pickup point, pickup time, who books, fare split.
  plan jsonb,
  plan_status text check (plan_status in ('proposed', 'accepted', 'superseded')),
  created_at timestamptz not null default now()
);

create index messages_request_idx on public.messages (request_id, created_at);

alter table public.messages enable row level security;

create function public.is_chat_participant(p_request_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.match_requests r
    where r.id = p_request_id
      and auth.uid() in (r.from_user_id, r.to_user_id)
      and r.status in ('accepted', 'confirmed')
  )
$$;

create policy "messages: participants read" on public.messages
  for select using (public.is_chat_participant(request_id));
create policy "messages: participants send text" on public.messages
  for insert with check (
    sender_id = auth.uid() and kind = 'text' and public.is_chat_participant(request_id)
  );

-- Send a request to share a ride with a matching trip.
create function public.request_match(p_from_trip_id uuid, p_to_trip_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me public.trips;
  other public.trips;
  open_count int;
  new_id uuid;
begin
  select * into me from public.trips where id = p_from_trip_id and user_id = auth.uid() and status = 'open';
  if not found then raise exception 'trip not found'; end if;
  if (select paused from public.profiles where id = me.user_id) then
    raise exception 'your account is paused while we review a report';
  end if;

  if not exists (select 1 from public.find_matches(p_from_trip_id) m where m.trip_id = p_to_trip_id) then
    raise exception 'not a match';
  end if;
  select * into other from public.trips where id = p_to_trip_id;

  select count(*) into open_count from public.match_requests
  where from_trip_id = me.id and status = 'pending' and expires_at > now();
  if open_count >= 3 then raise exception 'at most 3 open requests per trip'; end if;

  insert into public.match_requests (from_trip_id, to_trip_id, from_user_id, to_user_id, expires_at)
  values (
    me.id, other.id, me.user_id, other.user_id,
    least(now() + interval '2 hours', least(me.ride_time, other.ride_time) - interval '1 hour')
  )
  returning id into new_id;
  return new_id;
end;
$$;

-- Accept or decline a request addressed to you.
create function public.respond_to_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.match_requests
  set status = case when p_accept then 'accepted' else 'declined' end
  where id = p_request_id and to_user_id = auth.uid() and status = 'pending' and expires_at > now();
  if not found then raise exception 'request not found or expired'; end if;
end;
$$;

-- Propose a ride plan in chat. Replaces any earlier unaccepted plan.
create function public.propose_plan(p_request_id uuid, p_plan jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  if not exists (
    select 1 from public.match_requests
    where id = p_request_id and auth.uid() in (from_user_id, to_user_id) and status = 'accepted'
  ) then
    raise exception 'chat not open';
  end if;

  update public.messages set plan_status = 'superseded'
  where request_id = p_request_id and kind = 'plan' and plan_status = 'proposed';

  insert into public.messages (request_id, sender_id, kind, plan, plan_status)
  values (p_request_id, auth.uid(), 'plan', p_plan, 'proposed')
  returning id into new_id;
  return new_id;
end;
$$;

-- Accept the other rider's plan: confirms the match and takes both trips out of matching.
create function public.accept_plan(p_message_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  msg public.messages;
  req public.match_requests;
begin
  select * into msg from public.messages
  where id = p_message_id and kind = 'plan' and plan_status = 'proposed';
  if not found then raise exception 'plan not found'; end if;

  select * into req from public.match_requests
  where id = msg.request_id and status = 'accepted' and auth.uid() in (from_user_id, to_user_id);
  if not found then raise exception 'chat not open'; end if;
  if msg.sender_id = auth.uid() then raise exception 'the other rider must accept'; end if;

  update public.messages set plan_status = 'accepted' where id = msg.id;
  update public.match_requests set status = 'confirmed' where id = req.id;
  update public.trips set status = 'matched' where id in (req.from_trip_id, req.to_trip_id);
  -- Other pending requests involving either trip are no longer needed.
  update public.match_requests set status = 'cancelled'
  where id <> req.id and status in ('pending', 'accepted')
    and (from_trip_id in (req.from_trip_id, req.to_trip_id) or to_trip_id in (req.from_trip_id, req.to_trip_id));
end;
$$;

-- Cancel a request or a confirmed ride; both trips go back into matching.
create function public.cancel_match(p_request_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  req public.match_requests;
begin
  update public.match_requests set status = 'cancelled'
  where id = p_request_id and auth.uid() in (from_user_id, to_user_id)
    and status in ('pending', 'accepted', 'confirmed')
  returning * into req;
  if not found then raise exception 'request not found'; end if;

  update public.trips set status = 'open'
  where id in (req.from_trip_id, req.to_trip_id) and status = 'matched';
end;
$$;

-- Chat is delivered live through Supabase Realtime.
alter publication supabase_realtime add table public.messages, public.match_requests;

-- Chat header: the other rider's public details and both trips' basics.
create function public.chat_details(p_request_id uuid)
returns table (
  status text,
  partner_id uuid,
  partner_first_name text,
  partner_photo_url text,
  partner_area text,
  my_trip_id uuid,
  direction text,
  airport_iata text,
  my_ride_time timestamptz,
  partner_ride_time timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    r.status,
    p.id,
    split_part(p.full_name, ' ', 1),
    p.photo_url,
    theirs.area,
    mine.id,
    mine.direction,
    mine.airport_iata,
    mine.ride_time,
    theirs.ride_time
  from public.match_requests r
  join public.trips mine on mine.id = case when r.from_user_id = auth.uid() then r.from_trip_id else r.to_trip_id end
  join public.trips theirs on theirs.id = case when r.from_user_id = auth.uid() then r.to_trip_id else r.from_trip_id end
  join public.profiles p on p.id = theirs.user_id
  where r.id = p_request_id and auth.uid() in (r.from_user_id, r.to_user_id)
$$;

-- Two reports from different riders pause an account until it is reviewed.
create function public.pause_after_reports() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(distinct reporter_id) from public.reports where reported_id = new.reported_id) >= 2 then
    update public.profiles set paused = true where id = new.reported_id;
  end if;
  return new;
end;
$$;

create trigger on_report_created
  after insert on public.reports
  for each row execute function public.pause_after_reports();
