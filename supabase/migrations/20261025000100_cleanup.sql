-- Deletes trips (and with them requests and chats) 7 days after travel.
-- Trips tied to a safety report are kept, along with the reported chat.
create function public.purge_old_trips() returns int
language plpgsql security definer set search_path = '' as $$
declare
  deleted int;
begin
  delete from public.trips t
  where t.ride_time < now() - interval '7 days'
    and not exists (
      select 1
      from public.reports r
      left join public.match_requests m on r.trip_id in (m.from_trip_id, m.to_trip_id)
      where r.trip_id = t.id or t.id in (m.from_trip_id, m.to_trip_id)
    );
  get diagnostics deleted = row_count;

  delete from public.flight_cache where flight_date < current_date - 7;
  return deleted;
end;
$$;

revoke execute on function public.purge_old_trips() from public, anon, authenticated;
