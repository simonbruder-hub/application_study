-- =============================================================================
-- Minimale Supabase-Nachbildung für den lokalen Schematest (nur für run.sh).
-- Stellt bereit, was schema.sql von Supabase erwartet:
--   - Rollen anon, authenticated, service_role (service_role umgeht RLS)
--   - Schema auth mit auth.users(id) und auth.uid() (liest die JWT-Claims wie
--     PostgREST: request.jwt.claim.sub oder request.jwt.claims ->> 'sub')
--   - leere Publication supabase_realtime
--   - Supabase-typische Standardrechte in public (alles für anon/authenticated),
--     damit der Test prüft, dass schema.sql diese Rechte wirklich zurücknimmt
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;
