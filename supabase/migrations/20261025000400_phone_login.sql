-- Phone number login (codes sent by Message Central VerifyNow) and profile photos.

-- One row per code sent. Used to rate-limit sends and to check that a code is
-- verified for the same number it was sent to. Only the server reads it.
create table public.phone_verifications (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  verification_id text not null,
  ip text,
  attempts int not null default 0,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index phone_verifications_phone_idx on public.phone_verifications (phone, created_at);
create index phone_verifications_ip_idx on public.phone_verifications (ip, created_at);

alter table public.phone_verifications enable row level security;
-- No policies: only the service role touches this table.

-- Profile photos: riders upload to avatars/<their id>/..., readable by anyone with the link.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars: owner uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: owner replaces" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: owner deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Riders can now set their own photo, but only to their own uploaded file
-- or the photo their Google account came with.
grant update (photo_url) on public.profiles to authenticated;

create function public.check_photo_url() returns trigger
language plpgsql as $$
begin
  if new.photo_url is not null
     and new.photo_url !~ ('^https://[a-z0-9.-]+/storage/v1/object/public/avatars/' || new.id::text || '/[A-Za-z0-9._-]+$')
     and new.photo_url !~ '^https://lh3\.googleusercontent\.com/' then
    raise exception 'photo must be uploaded through Airbuddy';
  end if;
  return new;
end;
$$;

create trigger profiles_check_photo
  before insert or update of photo_url on public.profiles
  for each row execute function public.check_photo_url();

-- A photo is required before asking someone to share a ride or accepting a request.
create function public.require_photo() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select photo_url from public.profiles where id = auth.uid()) is null then
    raise exception 'add a profile photo first, so your ride buddy can recognise you';
  end if;
end;
$$;

create or replace function public.request_match(p_from_trip_id uuid, p_to_trip_id uuid)
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
  perform public.require_photo();

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

create or replace function public.respond_to_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_accept then perform public.require_photo(); end if;
  update public.match_requests
  set status = case when p_accept then 'accepted' else 'declined' end
  where id = p_request_id and to_user_id = auth.uid() and status = 'pending' and expires_at > now();
  if not found then raise exception 'request not found or expired'; end if;
end;
$$;
