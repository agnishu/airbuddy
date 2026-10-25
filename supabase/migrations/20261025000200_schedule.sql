-- Runs the cleanup nightly at 03:00 IST (21:30 UTC). Needs the pg_cron extension,
-- which Supabase provides (Database > Extensions).
create extension if not exists pg_cron;
select cron.schedule('purge-old-trips', '30 21 * * *', 'select public.purge_old_trips()');
