-- Minimal stand-ins for what a Supabase project provides, so migrations can be
-- tested on plain Postgres + PostGIS. Not used in production.
create schema if not exists extensions;
create schema if not exists auth;
create table auth.users (
  id uuid primary key,
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create publication supabase_realtime;

-- Supabase's API roles and their default grants.
do $$ begin
  create role anon nologin;
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;
grant usage on schema public, auth, extensions to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
