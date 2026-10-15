-- =============================================================================
-- Tests für supabase/schema.sql (ausgeführt von run.sh mit ON_ERROR_STOP=1).
-- Jede Prüfung meldet "ok …" als NOTICE; die erste fehlgeschlagene Prüfung wirft
-- eine Exception und bricht den Lauf mit Exit-Code != 0 ab.
--
-- Rollenwechsel wie in Supabase/PostgREST:
--   set role authenticated; set request.jwt.claim.sub = '<uuid>';
-- (als psql-Variablen :als_a, :als_b, :als_c, :als_anon, :als_admin)
-- =============================================================================

\set ON_ERROR_STOP 1
\o /dev/null

\set als_a     'set role authenticated; set request.jwt.claim.sub = ''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'';'
\set als_b     'set role authenticated; set request.jwt.claim.sub = ''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'';'
\set als_c     'set role authenticated; set request.jwt.claim.sub = ''cccccccc-cccc-4ccc-8ccc-cccccccccccc'';'
\set als_anon  'set role anon; set request.jwt.claim.sub = '''';'
\set als_admin 'reset role; reset request.jwt.claim.sub;'


-- -----------------------------------------------------------------------------
-- Hilfsfunktionen
-- -----------------------------------------------------------------------------

create schema test;
grant usage on schema test to public;

create function test.section(title text) returns void
language plpgsql as $$
begin
  raise notice '── %', title;
end $$;

create function test.pass(msg text) returns void
language plpgsql as $$
begin
  perform set_config('test.passed', (coalesce(nullif(current_setting('test.passed', true), ''), '0')::int + 1)::text, false);
  raise notice '   ok  %', msg;
end $$;

create function test.ok(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'FEHLGESCHLAGEN: %', msg;
  end if;
  perform test.pass(msg);
end $$;

create function test.eq(actual anycompatible, expected anycompatible, msg text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FEHLGESCHLAGEN: % – erwartet %, erhalten %',
      msg, coalesce(expected::text, 'NULL'), coalesce(actual::text, 'NULL');
  end if;
  perform test.pass(msg);
end $$;

-- Führt eine Anweisung aus und liefert die Anzahl betroffener Zeilen.
create function test.affected(stmt text) returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

-- Erwartet, dass die Anweisung mit dem angegebenen SQLSTATE scheitert.
-- Die Wirkung der Anweisung wird dabei vollständig zurückgerollt.
create function test.fails(stmt text, expected_state text, msg text) returns void
language plpgsql as $$
declare
  state text;
  detail text;
begin
  begin
    execute stmt;
  exception when others then
    get stacked diagnostics state = returned_sqlstate, detail = message_text;
    if state is distinct from expected_state then
      raise exception 'FEHLGESCHLAGEN: % – erwartet SQLSTATE %, erhalten % (%)', msg, expected_state, state, detail;
    end if;
    perform test.pass(format('%s  [%s: %s]', msg, state, detail));
    return;
  end;
  raise exception 'FEHLGESCHLAGEN: % – die Anweisung lief ohne Fehler durch', msg;
end $$;

-- Führt eine Anweisung aus, die scheitern muss, und liefert "SQLSTATE|Meldung|Detail"
-- (so, wie PostgREST code, message und details an die App weitergibt).
create function test.error_of(stmt text) returns text
language plpgsql as $$
declare
  state text;
  msg text;
  detail text;
begin
  begin
    execute stmt;
  exception when others then
    get stacked diagnostics state = returned_sqlstate, msg = message_text, detail = pg_exception_detail;
    return state || '|' || msg || '|' || coalesce(detail, '');
  end;
  raise exception 'FEHLGESCHLAGEN: Anweisung sollte scheitern: %', stmt;
end $$;

-- Testnutzer (in Supabase legt die Auth-API diese Zeilen an)
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');


-- -----------------------------------------------------------------------------
-- 1. Struktur, Rechte, Realtime (nach zweimaligem Laden von schema.sql)
-- -----------------------------------------------------------------------------
select test.section('1. Struktur, Rechte, Realtime');

do $$
declare
  t text;
  all_tables text[] := array['projects', 'milestones', 'work_packages', 'tasks', 'time_logs',
                             'planned_blocks', 'active_timer_state', 'user_settings'];
begin
  perform test.eq((select count(*) from pg_tables where schemaname = 'public' and tablename = any (all_tables)),
                  8::bigint, 'alle 8 Tabellen vorhanden');

  foreach t in array all_tables loop
    perform test.ok((select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass),
                    format('%s: RLS aktiv', t));
    perform test.eq((select count(*) from pg_policies where schemaname = 'public' and tablename = t),
                    3::bigint, format('%s: genau 3 Policies (auch nach 2. Durchlauf)', t));
    perform test.ok(not exists (select 1 from pg_policies
                                 where schemaname = 'public' and tablename = t and cmd in ('DELETE', 'ALL')),
                    format('%s: keine DELETE-Policy', t));
    perform test.ok((select bool_and(roles = '{authenticated}') from pg_policies
                      where schemaname = 'public' and tablename = t),
                    format('%s: Policies nur für authenticated', t));
    perform test.eq((select count(*) from pg_trigger
                      where tgrelid = format('public.%I', t)::regclass and not tgisinternal),
                    1::bigint, format('%s: genau ein Trigger', t));
    perform test.ok(not has_table_privilege('anon', format('public.%I', t),
                                            'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
                    format('%s: anon ohne jedes Recht', t));
    perform test.ok(has_table_privilege('authenticated', format('public.%I', t), 'SELECT')
                    and has_table_privilege('authenticated', format('public.%I', t), 'INSERT')
                    and has_table_privilege('authenticated', format('public.%I', t), 'UPDATE'),
                    format('%s: authenticated darf lesen, anlegen, ändern', t));
    perform test.ok(not has_table_privilege('authenticated', format('public.%I', t), 'DELETE, TRUNCATE'),
                    format('%s: authenticated darf nicht löschen/leeren', t));
    perform test.ok(exists (select 1 from pg_publication_tables
                             where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t),
                    format('%s: in Publication supabase_realtime', t));
  end loop;

  perform test.eq((select count(*) from pg_publication_tables where pubname = 'supabase_realtime'),
                  8::bigint, 'Publication enthält genau die 8 Tabellen (keine Duplikate)');

  foreach t in array array['projects', 'milestones', 'work_packages', 'tasks', 'time_logs', 'planned_blocks'] loop
    perform test.eq((select indexdef like '%(user_id, server_updated_at, id)' from pg_indexes
                      where schemaname = 'public' and indexname = t || '_sync_idx'),
                    true, format('%s: Sync-Index (user_id, server_updated_at, id)', t));
  end loop;

  perform test.eq((select proconfig from pg_proc where oid = 'app_private.entity_before_write()'::regprocedure),
                  array['search_path=""'], 'Trigger-Funktion mit search_path = ''''');
  perform test.eq((select proconfig from pg_proc where oid = 'app_private.singleton_before_write()'::regprocedure),
                  array['search_path=""'], 'Einzelzeilen-Trigger-Funktion mit search_path = ''''');
  perform test.ok(not has_schema_privilege('authenticated', 'app_private', 'USAGE')
                  and not has_schema_privilege('anon', 'app_private', 'USAGE'),
                  'Schema app_private ist für API-Rollen nicht zugänglich');
  perform test.ok(has_function_privilege('authenticated', 'public.server_now()', 'EXECUTE'),
                  'server_now(): authenticated darf ausführen');
  perform test.ok(not has_function_privilege('anon', 'public.server_now()', 'EXECUTE'),
                  'server_now(): anon darf nicht ausführen');

  -- Zeigt, dass die Testdatenbank linguistisch sortiert (ICU): Ohne COLLATE "C"
  -- im Trigger wäre der LWW-Test in Abschnitt 5 hier aussagekräftig.
  if (select datlocprovider from pg_database where datname = current_database()) = 'i' then
    perform test.ok('dev-B' > 'dev-a', 'Testdatenbank sortiert linguistisch (ICU): ''dev-B'' > ''dev-a''');
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. Besitzer (user_id) und Testdaten von Nutzer A
-- -----------------------------------------------------------------------------
select test.section('2. Besitzer und user_id-Default');

:als_a
insert into public.projects (id, project_code, name, mode, color, planned_hours, created_at, updated_at, updated_by)
values ('a1000000-0000-4000-8000-000000000001', 'MATHE1', 'Mathematik', 'study', '#FF8800', 40,
        '2026-01-01 09:00:00+00', '2026-01-01 10:00:00+00', 'dev-a');

select test.eq((select user_id from public.projects where id = 'a1000000-0000-4000-8000-000000000001'),
               'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'user_id-Default greift (auth.uid())');

-- PostgREST sendet bei Bulk-Upserts fehlende Spalten als NULL → Trigger setzt auth.uid()
insert into public.projects (id, user_id, project_code, name, mode, created_at, updated_at, updated_by)
values ('a1000000-0000-4000-8000-000000000002', null, 'LWW', 'Original', 'work',
        '2026-01-01 09:00:00+00', '2026-01-01 10:00:00+00', 'dev-m');
select test.eq((select user_id from public.projects where id = 'a1000000-0000-4000-8000-000000000002'),
               'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'explizites user_id = NULL wird zu auth.uid()');

insert into public.milestones (id, project_id, ms_code, title, target_date)
values ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'MS-1', 'Grundlagen', '2026-02-01');
insert into public.work_packages (id, project_id, milestone_id, ap_code, title, planned_hours, start_date, end_date)
values ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
        'a2000000-0000-4000-8000-000000000001', 'AP-1.1', 'Analysis', 12.5, '2026-01-05', '2026-01-31');
insert into public.tasks (id, project_id, work_package_id, title, status, priority, estimated_hours, estimated_pomodoros)
values ('a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
        'a3000000-0000-4000-8000-000000000001', 'Übungsblatt 1', 'in_progress', 'high', 2.25, 4);
insert into public.time_logs (id, project_id, work_package_id, task_id, workspace, mode, start_time, end_time,
                              duration_seconds, counts_as_pomodoro, comment)
values ('a5000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
        'a3000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'study', 'pomodoro',
        '2026-01-06 08:00:00+00', '2026-01-06 08:25:00+00', 1500, true, '');
insert into public.planned_blocks (id, project_id, work_package_id, task_id, workspace, title, start_time, end_time)
values ('a6000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
        'a3000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'study',
        'Lernblock Analysis', '2026-01-07 08:00:00+00', '2026-01-07 10:00:00+00');

do $$
declare
  t text;
begin
  foreach t in array array['projects', 'milestones', 'work_packages', 'tasks', 'time_logs', 'planned_blocks'] loop
    execute format('select test.ok((select bool_and(user_id = auth.uid()) and count(*) > 0 from public.%I), %L)',
                   t, t || ': Zeilen ohne user_id gehören dem angemeldeten Nutzer');
  end loop;
end
$$;

select test.eq((select planned_hours from public.work_packages where id = 'a3000000-0000-4000-8000-000000000001'),
               12.50::numeric, 'Stunden als numeric(10,2)');

select test.fails($$insert into public.projects (project_code, name, mode, user_id)
                    values ('FREMD', 'Fremd', 'study', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,
                  '42501', 'Insert mit fremder user_id scheitert');
select test.fails($$update public.projects set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', updated_at = '2030-01-01'
                     where id = 'a1000000-0000-4000-8000-000000000001'$$,
                  '42501', 'user_id lässt sich nicht ändern');
select test.fails($$update public.projects set id = gen_random_uuid(), updated_at = '2030-01-01'
                     where id = 'a1000000-0000-4000-8000-000000000002'$$,
                  '42501', 'id lässt sich nicht ändern');


-- -----------------------------------------------------------------------------
-- 3. Isolation zwischen Nutzern (RLS)
-- -----------------------------------------------------------------------------
select test.section('3. Isolation zwischen Nutzern (RLS)');

:als_b
do $$
declare
  t text;
begin
  foreach t in array array['projects', 'milestones', 'work_packages', 'tasks', 'time_logs',
                           'planned_blocks', 'active_timer_state', 'user_settings'] loop
    execute format('select test.eq((select count(*) from public.%I), 0::bigint, %L)',
                   t, t || ': B sieht keine Zeilen von A');
  end loop;
end
$$;

select test.eq(test.affected($$update public.projects set name = 'Gehackt', updated_at = '2030-01-01', updated_by = 'x'
                                where id = 'a1000000-0000-4000-8000-000000000001'$$),
               0::bigint, 'B: UPDATE auf A''s Projekt trifft 0 Zeilen');
select test.eq(test.affected($$update public.tasks set title = 'Gehackt', updated_at = '2030-01-01'$$),
               0::bigint, 'B: UPDATE ohne WHERE trifft keine fremden Zeilen');
select test.fails($$insert into public.projects (id, project_code, name, mode, updated_at, updated_by)
                    values ('a1000000-0000-4000-8000-000000000001', 'MATHE1', 'Gehackt', 'study', '2030-01-01', 'zzz')
                    on conflict (id) do update
                      set name = excluded.name, updated_at = excluded.updated_at, updated_by = excluded.updated_by$$,
                  '42501', 'B: Upsert (ON CONFLICT DO UPDATE) auf A''s id scheitert');
select test.fails($$insert into public.projects (id, project_code, name, mode, updated_at, updated_by)
                    values ('a1000000-0000-4000-8000-000000000001', 'MATHE1', 'Gehackt', 'study', '2000-01-01', 'zzz')
                    on conflict (id) do update
                      set name = excluded.name, updated_at = excluded.updated_at, updated_by = excluded.updated_by$$,
                  '42501', 'B: Upsert auf A''s id scheitert auch mit älterem updated_at');
select test.fails($$insert into public.projects (id, project_code, name, mode)
                    values ('a1000000-0000-4000-8000-000000000001', 'KOPIE', 'Kopie', 'study')$$,
                  '23505', 'B: Insert mit A''s id scheitert (Primärschlüssel)');
select test.fails($$insert into public.tasks (project_id, title, user_id)
                    values ('a1000000-0000-4000-8000-000000000001', 'Fremd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
                  '42501', 'B: Insert mit user_id von A scheitert');

:als_admin
select test.eq((select name || '|' || updated_by from public.projects where id = 'a1000000-0000-4000-8000-000000000001'),
               'Mathematik|dev-a', 'A''s Projekt ist nach allen Versuchen von B unverändert');
select test.eq((select title from public.tasks where id = 'a4000000-0000-4000-8000-000000000001'),
               'Übungsblatt 1'::text, 'A''s Task ist unverändert');


-- -----------------------------------------------------------------------------
-- 4. anon und physisches Löschen
-- -----------------------------------------------------------------------------
select test.section('4. anon, physisches Löschen, server_now()');

:als_anon
do $$
declare
  t text;
begin
  foreach t in array array['projects', 'milestones', 'work_packages', 'tasks', 'time_logs',
                           'planned_blocks', 'active_timer_state', 'user_settings'] loop
    perform test.fails(format('select * from public.%I', t), '42501', format('anon: %s nicht lesbar', t));
    perform test.fails(format('update public.%I set updated_by = %L', t, 'anon'), '42501',
                       format('anon: %s nicht änderbar', t));
    perform test.fails(format('delete from public.%I', t), '42501', format('anon: %s nicht löschbar', t));
  end loop;
end
$$;
select test.fails($$insert into public.projects (project_code, name, mode, user_id)
                    values ('ANON', 'Anon', 'study', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
                  '42501', 'anon: kein Insert, auch nicht mit gültiger user_id');
select test.fails($$select public.server_now()$$, '42501', 'anon: server_now() nicht aufrufbar');

:als_a
do $$
declare
  t text;
begin
  foreach t in array array['projects', 'milestones', 'work_packages', 'tasks', 'time_logs',
                           'planned_blocks', 'active_timer_state', 'user_settings'] loop
    perform test.fails(format('delete from public.%I', t), '42501',
                       format('authenticated: %s nicht physisch löschbar', t));
  end loop;
end
$$;
select test.fails($$truncate public.time_logs$$, '42501', 'authenticated: TRUNCATE verboten');
select test.ok(public.server_now() between now() - interval '1 minute' and clock_timestamp() + interval '1 minute',
               'server_now() liefert die Serverzeit');
select test.ok(public.server_now() < public.server_now(), 'server_now() ist clock_timestamp() (läuft innerhalb einer Abfrage weiter)');

:als_admin
select test.eq((select count(*) from public.time_logs), 1::bigint, 'nach allen Löschversuchen sind alle Zeilen noch da');


-- -----------------------------------------------------------------------------
-- 5. Last-Writer-Wins
-- -----------------------------------------------------------------------------
select test.section('5. Last-Writer-Wins (UPDATE und Upsert wie PostgREST)');

:als_a
-- Ausgangslage (aus Abschnitt 2): name 'Original', updated_at 2026-01-01 10:00:00, updated_by 'dev-m'

select test.eq(test.affected($$update public.projects set name = 'älter', updated_at = '2026-01-01 09:59:59.999+00', updated_by = 'dev-z'
                                where id = 'a1000000-0000-4000-8000-000000000002'$$),
               0::bigint, 'UPDATE mit älterem updated_at wird verworfen');
select test.eq(test.affected($$update public.projects set name = 'gleich-klein', updated_at = '2026-01-01 10:00:00+00', updated_by = 'dev-a'
                                where id = 'a1000000-0000-4000-8000-000000000002'$$),
               0::bigint, 'Gleichstand updated_at: kleineres updated_by wird verworfen');
select test.eq((select name from public.projects where id = 'a1000000-0000-4000-8000-000000000002'),
               'Original'::text, '… Zeile unverändert');
select test.eq(test.affected($$update public.projects set name = 'gleich-gross', updated_at = '2026-01-01 10:00:00+00', updated_by = 'dev-n'
                                where id = 'a1000000-0000-4000-8000-000000000002'$$),
               1::bigint, 'Gleichstand updated_at: grösseres updated_by gewinnt');
select test.eq(test.affected($$update public.projects set name = 'neuer', updated_at = '2026-01-01 10:00:00.001+00', updated_by = 'dev-a'
                                where id = 'a1000000-0000-4000-8000-000000000002'$$),
               1::bigint, 'neueres updated_at gewinnt (auch mit kleinerem updated_by, ms-genau)');
select test.eq(test.affected($$update public.projects set name = 'gross-B', updated_at = '2026-01-01 10:00:00.001+00', updated_by = 'dev-B'
                                where id = 'a1000000-0000-4000-8000-000000000002'$$),
               0::bigint, 'updated_by wird bytweise verglichen wie in JavaScript (''dev-B'' < ''dev-a'')');
select test.eq((select name from public.projects where id = 'a1000000-0000-4000-8000-000000000002'),
               'neuer'::text, '… Stand nach den UPDATEs korrekt');

-- Upsert genau so, wie PostgREST ihn erzeugt (alle gesendeten Spalten aus excluded)
select test.eq(test.affected($$
  insert into public.projects (id, project_code, name, mode, created_at, updated_at, updated_by)
  values ('a1000000-0000-4000-8000-000000000002', 'LWW', 'upsert-alt', 'work', '2020-01-01', '2026-01-01 09:00:00+00', 'dev-z')
  on conflict (id) do update set project_code = excluded.project_code, name = excluded.name, mode = excluded.mode,
    created_at = excluded.created_at, updated_at = excluded.updated_at, updated_by = excluded.updated_by$$),
  0::bigint, 'Upsert mit älterem Stand wird still verworfen');
select test.eq(test.affected($$
  insert into public.projects (id, project_code, name, mode, created_at, updated_at, updated_by)
  values ('a1000000-0000-4000-8000-000000000002', 'LWW', 'upsert-gleich-klein', 'work', '2020-01-01', '2026-01-01 10:00:00.001+00', 'dev-0')
  on conflict (id) do update set project_code = excluded.project_code, name = excluded.name, mode = excluded.mode,
    created_at = excluded.created_at, updated_at = excluded.updated_at, updated_by = excluded.updated_by$$),
  0::bigint, 'Upsert bei Gleichstand mit kleinerem updated_by wird verworfen');
select test.eq(test.affected($$
  insert into public.projects (id, project_code, name, mode, created_at, updated_at, updated_by)
  values ('a1000000-0000-4000-8000-000000000002', 'LWW', 'upsert-gleich-gross', 'work', '2020-01-01', '2026-01-01 10:00:00.001+00', 'dev-b')
  on conflict (id) do update set project_code = excluded.project_code, name = excluded.name, mode = excluded.mode,
    created_at = excluded.created_at, updated_at = excluded.updated_at, updated_by = excluded.updated_by$$),
  1::bigint, 'Upsert bei Gleichstand mit grösserem updated_by gewinnt');
select test.eq(test.affected($$
  insert into public.projects (id, project_code, name, mode, created_at, updated_at, updated_by)
  values ('a1000000-0000-4000-8000-000000000002', 'LWW', 'upsert-neu', 'work', '2020-01-01', '2026-01-01 11:00:00+00', 'dev-a')
  on conflict (id) do update set project_code = excluded.project_code, name = excluded.name, mode = excluded.mode,
    created_at = excluded.created_at, updated_at = excluded.updated_at, updated_by = excluded.updated_by$$),
  1::bigint, 'Upsert mit neuerem Stand wird übernommen');
select test.eq((select name || '|' || created_at::text from public.projects where id = 'a1000000-0000-4000-8000-000000000002'),
               'upsert-neu|2026-01-01 09:00:00+00', 'created_at bleibt beim Upsert erhalten');
select test.eq(test.affected($$
  insert into public.projects (id, project_code, name, mode, updated_at, updated_by)
  values ('a1000000-0000-4000-8000-000000000002', 'LWW', 'upsert-neu', 'work', '2026-01-01 11:00:00+00', 'dev-a')
  on conflict (id) do update set name = excluded.name, updated_at = excluded.updated_at, updated_by = excluded.updated_by$$),
  1::bigint, 'identische Wiederholung (gleiches updated_at und updated_by) wird übernommen');

-- Mehrzeiliger Upsert (wie ein Push-Batch): veraltete Zeile verworfen, neuere übernommen
select test.eq(test.affected($$
  insert into public.projects (id, project_code, name, mode, updated_at, updated_by)
  values ('a1000000-0000-4000-8000-000000000001', 'MATHE1', 'Mathematik II', 'study', '2026-01-02 10:00:00+00', 'dev-a'),
         ('a1000000-0000-4000-8000-000000000002', 'LWW', 'batch-alt', 'work', '2026-01-01 08:00:00+00', 'dev-a')
  on conflict (id) do update set name = excluded.name, updated_at = excluded.updated_at, updated_by = excluded.updated_by$$),
  1::bigint, 'Batch-Upsert: nur die neuere der beiden Zeilen wird geschrieben');
select test.eq((select string_agg(name, ', ' order by project_code) from public.projects
                 where id in ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002')),
               'upsert-neu, Mathematik II', '… Ergebnis des Batch-Upserts korrekt');


-- -----------------------------------------------------------------------------
-- 6. server_updated_at und Keyset-Pull
-- -----------------------------------------------------------------------------
select test.section('6. server_updated_at (Sync-Cursor) und Keyset-Pull');

:als_a
insert into public.projects (id, project_code, name, mode, server_updated_at)
values ('a1000000-0000-4000-8000-000000000011', 'SYNC1', 'Sync 1', 'study', '2000-01-01');
select test.ok((select server_updated_at > '2020-01-01' from public.projects where id = 'a1000000-0000-4000-8000-000000000011'),
               'vom Client gesendetes server_updated_at wird überschrieben');
insert into public.projects (id, project_code, name, mode) values ('a1000000-0000-4000-8000-000000000012', 'SYNC2', 'Sync 2', 'study');
insert into public.projects (id, project_code, name, mode) values ('a1000000-0000-4000-8000-000000000013', 'SYNC3', 'Sync 3', 'study');

create temp table sync_mark as
select id, server_updated_at from public.projects where project_code like 'SYNC%';
grant select on sync_mark to public;

select test.ok((select s1.server_updated_at < s2.server_updated_at and s2.server_updated_at < s3.server_updated_at
                  from sync_mark s1, sync_mark s2, sync_mark s3
                 where s1.id = 'a1000000-0000-4000-8000-000000000011'
                   and s2.id = 'a1000000-0000-4000-8000-000000000012'
                   and s3.id = 'a1000000-0000-4000-8000-000000000013'),
               'server_updated_at steigt mit jedem Schreiben');

update public.projects set name = 'Sync 1 (geändert)', updated_at = now() + interval '1 day', updated_by = 'dev-a'
 where id = 'a1000000-0000-4000-8000-000000000011';
select test.ok((select p.server_updated_at > (select max(server_updated_at) from sync_mark)
                  from public.projects p where p.id = 'a1000000-0000-4000-8000-000000000011'),
               'UPDATE setzt server_updated_at neu (grösser als alle bisherigen)');

update public.projects set name = 'veraltet', updated_at = '2000-01-01', updated_by = 'dev-a'
 where id = 'a1000000-0000-4000-8000-000000000012';
select test.eq((select p.server_updated_at = m.server_updated_at
                  from public.projects p join sync_mark m using (id)
                 where p.id = 'a1000000-0000-4000-8000-000000000012'),
               true, 'verworfenes (veraltetes) UPDATE ändert server_updated_at nicht');

-- Erster Pull ab Anfang, nur die SYNC-Zeilen betrachtet: Reihenfolge = Schreibreihenfolge
select test.eq((select string_agg(project_code, ',' order by server_updated_at, id)
                  from public.projects
                 where (server_updated_at, id) > ('-infinity'::timestamptz, '00000000-0000-0000-0000-000000000000'::uuid)
                   and project_code like 'SYNC%'),
               'SYNC2,SYNC3,SYNC1', 'Keyset-Pull ab Anfang liefert Schreibreihenfolge');

-- Folge-Pull ab Cursor = (server_updated_at, id) von SYNC2
select test.eq((select string_agg(p.project_code, ',' order by p.server_updated_at, p.id)
                  from public.projects p,
                       (select server_updated_at as ts, id as cid from sync_mark
                         where id = 'a1000000-0000-4000-8000-000000000012') c
                 where (p.server_updated_at, p.id) > (c.ts, c.cid)),
               'SYNC3,SYNC1', 'Keyset-Pull ab Cursor (ts, id) liefert nur Neueres in richtiger Reihenfolge');

-- Seitenweise mit limit 1 durchlaufen (wie die Sync-Engine mit kleinem Limit)
do $$
declare
  cur_ts timestamptz := '-infinity';
  cur_id uuid := '00000000-0000-0000-0000-000000000000';
  r record;
  seen text := '';
begin
  loop
    select id, server_updated_at, project_code into r
      from public.projects
     where (server_updated_at, id) > (cur_ts, cur_id) and project_code like 'SYNC%'
     order by server_updated_at, id
     limit 1;
    exit when not found;
    seen := seen || r.project_code || ',';
    cur_ts := r.server_updated_at;
    cur_id := r.id;
  end loop;
  perform test.eq(seen, 'SYNC2,SYNC3,SYNC1,', 'seitenweiser Pull (limit 1) liefert jede Zeile genau einmal');
end
$$;

:als_b
select test.eq((select count(*) from public.projects
                 where (server_updated_at, id) > ('-infinity'::timestamptz, '00000000-0000-0000-0000-000000000000'::uuid)),
               0::bigint, 'Pull von B enthält keine Zeilen von A');


-- -----------------------------------------------------------------------------
-- 7. Eindeutige Codes (partielle Unique-Indizes)
-- -----------------------------------------------------------------------------
select test.section('7. Eindeutige Codes (partielle Unique-Indizes)');

:als_a
select test.fails($$insert into public.projects (project_code, name, mode) values ('MATHE1', 'Duplikat', 'study')$$,
                  '23505', 'doppelter aktiver project_code scheitert');
select test.fails($$insert into public.projects (project_code, name, mode) values ('mathe1', 'Duplikat', 'study')$$,
                  '23505', 'doppelter project_code scheitert auch in anderer Gross-/Kleinschreibung');

:als_b
insert into public.projects (id, project_code, name, mode)
values ('b1000000-0000-4000-8000-000000000001', 'MATHE1', 'Mathe von B', 'study');
select test.ok(true, 'anderer Nutzer darf denselben project_code verwenden');

:als_a
insert into public.projects (id, project_code, name, mode, updated_at, updated_by)
values ('a1000000-0000-4000-8000-000000000003', 'ALT', 'Altes Projekt', 'work', '2026-01-01 10:00:00+00', 'dev-a');
update public.projects set is_deleted = true, updated_at = '2026-01-01 10:00:01+00'
 where id = 'a1000000-0000-4000-8000-000000000003';
insert into public.projects (id, project_code, name, mode)
values ('a1000000-0000-4000-8000-000000000004', 'alt', 'Neues Projekt mit altem Code', 'work');
select test.ok(true, 'nach Soft-Delete darf der Code (auch in anderer Schreibweise) neu vergeben werden');
select test.fails($$update public.projects set is_deleted = false, updated_at = '2026-01-01 10:00:02+00'
                     where id = 'a1000000-0000-4000-8000-000000000003'$$,
                  '23505', 'Wiederherstellen kollidiert mit inzwischen aktivem Code');

select test.fails($$insert into public.milestones (project_id, ms_code, title)
                    values ('a1000000-0000-4000-8000-000000000001', 'ms-1', 'Duplikat')$$,
                  '23505', 'ms_code je Projekt eindeutig (ohne Gross-/Kleinschreibung)');
insert into public.milestones (id, project_id, ms_code, title)
values ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'MS-1', 'Gleicher Code, anderes Projekt');
select test.ok(true, 'gleicher ms_code in anderem Projekt erlaubt');

select test.fails($$insert into public.work_packages (project_id, ap_code, title)
                    values ('a1000000-0000-4000-8000-000000000001', 'ap-1.1', 'Duplikat')$$,
                  '23505', 'ap_code je Projekt eindeutig (ohne Gross-/Kleinschreibung)');

-- Unter RLS nennt Postgres im Fehlerdetail keine Schlüsselwerte. Die Sync-Engine liest
-- die betroffene Spalte deshalb aus dem Index-/Constraint-Namen (automatische
-- Umbenennung doppelter Codes). Darin darf nur die eigene Code-Spalte vorkommen.
do $$
declare
  e text;
begin
  e := test.error_of($q$insert into public.projects (project_code, name, mode) values ('mathe1', 'X', 'study')$q$);
  perform test.ok(e like '23505|%"projects_project_code_uidx"%',
                  'Unique-Fehler bei Projekten nennt projects_project_code_uidx');
  e := test.error_of($q$insert into public.milestones (project_id, ms_code, title)
                        values ('a1000000-0000-4000-8000-000000000001', 'MS-1', 'X')$q$);
  perform test.ok(e like '23505|%"milestones_ms_code_uidx"%' and e not like '%project_code%',
                  'Unique-Fehler bei Meilensteinen nennt ms_code (und nicht project_code)');
  e := test.error_of($q$insert into public.work_packages (project_id, ap_code, title)
                        values ('a1000000-0000-4000-8000-000000000001', 'AP-1.1', 'X')$q$);
  perform test.ok(e like '23505|%"work_packages_ap_code_uidx"%' and e not like '%project_code%',
                  'Unique-Fehler bei Arbeitspaketen nennt ap_code (und nicht project_code)');
  perform test.ok(e not like '%aaaaaaaa%', 'Fehlerdetail verrät unter RLS keine Schlüsselwerte');
end
$$;
insert into public.work_packages (id, project_id, ap_code, title)
values ('a3000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'AP-1.1', 'Gleicher Code, anderes Projekt');
select test.ok(true, 'gleicher ap_code in anderem Projekt erlaubt');


-- -----------------------------------------------------------------------------
-- 8. Zusammengesetzte Fremdschlüssel
-- -----------------------------------------------------------------------------
select test.section('8. Zusammengesetzte Fremdschlüssel (keine Verweise auf fremde Zeilen)');

:als_b
select test.fails($$insert into public.milestones (project_id, ms_code, title)
                    values ('a1000000-0000-4000-8000-000000000001', 'MS-X', 'Fremd')$$,
                  '23503', 'B kann keinen Meilenstein auf A''s Projekt anlegen');
select test.fails($$insert into public.work_packages (project_id, milestone_id, ap_code, title)
                    values ('b1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'AP-X', 'Fremd')$$,
                  '23503', 'B kann kein Arbeitspaket an A''s Meilenstein hängen');
select test.fails($$insert into public.tasks (project_id, work_package_id, title)
                    values ('b1000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'Fremd')$$,
                  '23503', 'B kann keinen Task in A''s Arbeitspaket legen');
select test.fails($$insert into public.time_logs (task_id, workspace, mode, start_time, end_time)
                    values ('a4000000-0000-4000-8000-000000000001', 'study', 'manual', now(), now())$$,
                  '23503', 'B kann keine Zeit auf A''s Task buchen');
select test.fails($$insert into public.planned_blocks (project_id, workspace, title, start_time, end_time)
                    values ('a1000000-0000-4000-8000-000000000001', 'study', 'Fremd', now(), now())$$,
                  '23503', 'B kann keinen Block auf A''s Projekt planen');

:als_a
select test.fails($$insert into public.tasks (project_id, title)
                    values ('a1000000-0000-4000-8000-0000000000ff', 'Ohne Projekt')$$,
                  '23503', 'Task mit nicht vorhandenem Projekt scheitert (Kind vor Eltern)');
select test.ok(test.error_of($$insert into public.tasks (project_id, title)
                               values ('a1000000-0000-4000-8000-0000000000ff', 'Ohne Projekt')$$)
                 like '23503|%"tasks_project_id_fkey"%',
               'FK-Fehler nennt <tabelle>_<spalte>_fkey');
select test.ok(test.error_of($$insert into public.projects (project_code, name, mode, color) values ('C1', 'X', 'study', 'rot')$$)
                 like '23514|%"projects_color_check"%',
               'CHECK-Fehler nennt <tabelle>_<spalte>_check');


-- -----------------------------------------------------------------------------
-- 9. CHECK-Constraints
-- -----------------------------------------------------------------------------
select test.section('9. CHECK-Constraints');

:als_a
select test.fails($$insert into public.projects (project_code, name, mode) values ('C1', 'X', 'freizeit')$$,
                  '23514', 'projects.mode: ungültiger Modus');
select test.fails($$insert into public.projects (project_code, name, mode, status) values ('C1', 'X', 'study', 'done')$$,
                  '23514', 'projects.status: ungültiger Status');
select test.fails($$insert into public.projects (project_code, name, mode, color) values ('C1', 'X', 'study', 'red')$$,
                  '23514', 'projects.color: kein Hex-Wert');
select test.fails($$insert into public.projects (project_code, name, mode, color) values ('C1', 'X', 'study', '#12345')$$,
                  '23514', 'projects.color: zu kurz');
select test.fails($$insert into public.projects (project_code, name, mode, color) values ('C1', 'X', 'study', '#GG0000')$$,
                  '23514', 'projects.color: ungültige Ziffern');
select test.fails($$insert into public.projects (project_code, name, mode, planned_hours) values ('C1', 'X', 'study', -1)$$,
                  '23514', 'projects.planned_hours: negativ');
select test.fails($$insert into public.projects (project_code, name, mode, start_date, end_date)
                    values ('C1', 'X', 'study', '2026-02-01', '2026-01-31')$$,
                  '23514', 'projects: end_date vor start_date');
select test.fails($$insert into public.projects (project_code, name, mode) values ('MA THE', 'X', 'study')$$,
                  '23514', 'projects.project_code: Leerzeichen');
select test.fails($$insert into public.projects (project_code, name, mode) values ('', 'X', 'study')$$,
                  '23514', 'projects.project_code: leer');
select test.fails($$insert into public.projects (project_code, name, mode) values (repeat('A', 33), 'X', 'study')$$,
                  '23514', 'projects.project_code: länger als 32 Zeichen');
select test.fails($$insert into public.projects (project_code, name, mode) values ('ÄÖÜ', 'X', 'study')$$,
                  '23514', 'projects.project_code: Umlaute nicht erlaubt');
select test.fails($$insert into public.projects (project_code, name, mode) values ('C1', E' \t ', 'study')$$,
                  '23514', 'projects.name: nur Leerraum');
insert into public.projects (project_code, name, mode, color, planned_hours, start_date, end_date)
values (repeat('Z', 29) || '._-', 'Grenzfall', 'work', '#a1B2c3', 0, '2026-01-01', '2026-01-01');
select test.ok(true, 'gültige Grenzwerte werden angenommen (32 Zeichen, . _ -, #a1B2c3, 0 Std., gleicher Tag)');

select test.fails($$insert into public.milestones (project_id, ms_code, title, status)
                    values ('a1000000-0000-4000-8000-000000000001', 'MS-9', 'X', 'done')$$,
                  '23514', 'milestones.status: ungültig');
select test.fails($$insert into public.milestones (project_id, ms_code, title)
                    values ('a1000000-0000-4000-8000-000000000001', 'MS-9', '')$$,
                  '23514', 'milestones.title: leer');
select test.fails($$insert into public.work_packages (project_id, ap_code, title, planned_hours)
                    values ('a1000000-0000-4000-8000-000000000001', 'AP-9', 'X', -0.5)$$,
                  '23514', 'work_packages.planned_hours: negativ');
select test.fails($$insert into public.work_packages (project_id, ap_code, title, start_date, end_date)
                    values ('a1000000-0000-4000-8000-000000000001', 'AP-9', 'X', '2026-03-02', '2026-03-01')$$,
                  '23514', 'work_packages: end_date vor start_date');
select test.fails($$insert into public.work_packages (project_id, ap_code, title)
                    values ('a1000000-0000-4000-8000-000000000001', 'AP 9', 'X')$$,
                  '23514', 'work_packages.ap_code: Leerzeichen');
select test.fails($$insert into public.tasks (project_id, title, status) values ('a1000000-0000-4000-8000-000000000001', 'X', 'erledigt')$$,
                  '23514', 'tasks.status: ungültig');
select test.fails($$insert into public.tasks (project_id, title, priority) values ('a1000000-0000-4000-8000-000000000001', 'X', 'urgent')$$,
                  '23514', 'tasks.priority: ungültig');
select test.fails($$insert into public.tasks (project_id, title, estimated_hours) values ('a1000000-0000-4000-8000-000000000001', 'X', -1)$$,
                  '23514', 'tasks.estimated_hours: negativ');
select test.fails($$insert into public.tasks (project_id, title, estimated_pomodoros) values ('a1000000-0000-4000-8000-000000000001', 'X', -1)$$,
                  '23514', 'tasks.estimated_pomodoros: negativ');
select test.fails($$insert into public.time_logs (workspace, mode, start_time, end_time)
                    values ('study', 'manual', '2026-01-06 09:00:00+00', '2026-01-06 08:59:59+00')$$,
                  '23514', 'time_logs: end_time vor start_time');
select test.fails($$insert into public.time_logs (workspace, mode, start_time, end_time)
                    values ('study', 'laufen', now(), now())$$,
                  '23514', 'time_logs.mode: ungültig');
select test.fails($$insert into public.time_logs (workspace, mode, start_time, end_time)
                    values ('freizeit', 'manual', now(), now())$$,
                  '23514', 'time_logs.workspace: ungültig');
select test.fails($$insert into public.time_logs (workspace, mode, start_time, end_time, duration_seconds)
                    values ('work', 'stopwatch', now(), now(), -1)$$,
                  '23514', 'time_logs.duration_seconds: negativ');
select test.fails($$insert into public.planned_blocks (workspace, title, start_time, end_time)
                    values ('work', 'X', '2026-01-07 10:00:00+00', '2026-01-07 09:00:00+00')$$,
                  '23514', 'planned_blocks: end_time vor start_time');
select test.fails($$insert into public.planned_blocks (workspace, title, start_time, end_time)
                    values ('work', ' ', now(), now())$$,
                  '23514', 'planned_blocks.title: leer');
select test.fails($$insert into public.active_timer_state (kind) values ('eieruhr')$$,
                  '23514', 'active_timer_state.kind: ungültig');
select test.fails($$insert into public.active_timer_state (phase) values ('mittag')$$,
                  '23514', 'active_timer_state.phase: ungültig');
select test.fails($$insert into public.active_timer_state (status) values ('stopped')$$,
                  '23514', 'active_timer_state.status: ungültig');
select test.fails($$insert into public.active_timer_state (accumulated_ms) values (-1)$$,
                  '23514', 'active_timer_state.accumulated_ms: negativ');
select test.fails($$insert into public.user_settings (focus_minutes) values (0)$$,
                  '23514', 'user_settings.focus_minutes: 0');
select test.fails($$insert into public.user_settings (health_red_daily_hours) values (-1)$$,
                  '23514', 'user_settings.health_red_daily_hours: negativ');


-- -----------------------------------------------------------------------------
-- 10. active_timer_state
-- -----------------------------------------------------------------------------
select test.section('10. active_timer_state: Upsert, LWW, RLS');

:als_a
select test.eq(test.affected($$
  insert into public.active_timer_state (session_id, kind, phase, status, workspace, project_id, task_id,
                                         planned_seconds, accumulated_ms, segment_started_at, session_started_at,
                                         cycle, updated_at, updated_by)
  values ('a7000000-0000-4000-8000-000000000001', 'pomodoro', 'focus', 'running', 'study',
          'a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001',
          1500, 0, '2026-03-01 08:00:00+00', '2026-03-01 08:00:00+00', 0, '2026-03-01 08:00:00+00', 'laptop')
  on conflict (user_id) do update set session_id = excluded.session_id, kind = excluded.kind, phase = excluded.phase,
    status = excluded.status, accumulated_ms = excluded.accumulated_ms, segment_started_at = excluded.segment_started_at,
    updated_at = excluded.updated_at, updated_by = excluded.updated_by$$),
  1::bigint, 'Timer per Upsert angelegt (ohne user_id)');
select test.eq((select user_id from public.active_timer_state),
               'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'Timer gehört A (user_id-Default)');

create temp table timer_mark as select server_updated_at from public.active_timer_state;
grant select on timer_mark to public;

-- Handy pausiert später (neuerer Stand, user_id explizit NULL wie bei PostgREST-Bulk)
select test.eq(test.affected($$
  insert into public.active_timer_state (user_id, status, accumulated_ms, segment_started_at, updated_at, updated_by)
  values (null, 'paused', 300000, null, '2026-03-01 08:05:00+00', 'handy')
  on conflict (user_id) do update set status = excluded.status, accumulated_ms = excluded.accumulated_ms,
    segment_started_at = excluded.segment_started_at, updated_at = excluded.updated_at, updated_by = excluded.updated_by$$),
  1::bigint, 'neuerer Upsert (Pause vom Handy) wird übernommen');
select test.ok((select a.server_updated_at > m.server_updated_at from public.active_timer_state a, timer_mark m),
               'server_updated_at des Timers steigt');
select test.eq(test.affected($$
  insert into public.active_timer_state (status, accumulated_ms, segment_started_at, updated_at, updated_by)
  values ('running', 0, '2026-03-01 08:00:00+00', '2026-03-01 08:04:00+00', 'laptop')
  on conflict (user_id) do update set status = excluded.status, accumulated_ms = excluded.accumulated_ms,
    segment_started_at = excluded.segment_started_at, updated_at = excluded.updated_at, updated_by = excluded.updated_by$$),
  0::bigint, 'veralteter Upsert (Laptop) wird verworfen');
select test.eq(test.affected($$update public.active_timer_state set status = 'idle', updated_at = '2026-03-01 08:05:00+00', updated_by = 'alt'$$),
               0::bigint, 'Gleichstand mit kleinerem updated_by wird verworfen');
select test.eq((select status || '|' || accumulated_ms || '|' || updated_by from public.active_timer_state),
               'paused|300000|handy', 'Timer-Stand nach LWW korrekt');
select test.fails($$update public.active_timer_state set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', updated_at = '2030-01-01'$$,
                  '42501', 'user_id des Timers lässt sich nicht ändern');

:als_b
select test.eq((select count(*) from public.active_timer_state), 0::bigint, 'B sieht A''s Timer nicht');
select test.fails($$insert into public.active_timer_state (user_id, status, updated_at, updated_by)
                    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'idle', '2030-01-01', 'zzz')
                    on conflict (user_id) do update set status = excluded.status, updated_at = excluded.updated_at$$,
                  '42501', 'B kann A''s Timer nicht per Upsert überschreiben');
select test.eq(test.affected($$
  insert into public.active_timer_state (kind, status, updated_at, updated_by)
  values ('stopwatch', 'running', '2026-03-01 09:00:00+00', 'b-handy')
  on conflict (user_id) do update set kind = excluded.kind, status = excluded.status,
    updated_at = excluded.updated_at, updated_by = excluded.updated_by$$),
  1::bigint, 'B legt eigenen Timer an');
select test.eq(test.affected($$update public.active_timer_state set status = 'idle', updated_at = '2030-01-01'$$),
               1::bigint, 'B: UPDATE ohne WHERE trifft nur den eigenen Timer');

:als_admin
select test.eq((select status from public.active_timer_state where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
               'paused'::text, 'A''s Timer ist unverändert');


-- -----------------------------------------------------------------------------
-- 11. user_settings
-- -----------------------------------------------------------------------------
select test.section('11. user_settings: Defaults, Upsert, LWW, RLS');

:als_a
insert into public.user_settings (updated_at, updated_by) values ('2026-03-01 08:00:00+00', 'laptop');
select test.eq((select focus_minutes || '|' || short_break_minutes || '|' || long_break_minutes || '|' || long_break_every
                       || '|' || auto_start_breaks || '|' || auto_start_focus || '|' || daily_goal_minutes
                       || '|' || health_red_daily_hours || '|' || health_yellow_daily_hours
                       || '|' || milestone_red_daily_hours || '|' || milestone_yellow_daily_hours
                  from public.user_settings),
               '25|5|15|4|true|false|240|6.00|3.00|6.00|3.50', 'Defaults entsprechen DEFAULT_SETTINGS');
select test.eq(test.affected($$
  insert into public.user_settings (focus_minutes, milestone_yellow_daily_hours, updated_at, updated_by)
  values (50, 4.25, '2026-03-02 08:00:00+00', 'handy')
  on conflict (user_id) do update set focus_minutes = excluded.focus_minutes,
    milestone_yellow_daily_hours = excluded.milestone_yellow_daily_hours,
    updated_at = excluded.updated_at, updated_by = excluded.updated_by$$),
  1::bigint, 'neuerer Upsert der Einstellungen wird übernommen');
select test.eq(test.affected($$
  insert into public.user_settings (focus_minutes, updated_at, updated_by)
  values (10, '2026-03-01 09:00:00+00', 'laptop')
  on conflict (user_id) do update set focus_minutes = excluded.focus_minutes,
    updated_at = excluded.updated_at, updated_by = excluded.updated_by$$),
  0::bigint, 'veralteter Upsert der Einstellungen wird verworfen');
select test.eq((select focus_minutes || '|' || milestone_yellow_daily_hours from public.user_settings),
               '50|4.25', 'Einstellungen nach LWW korrekt');

:als_b
select test.eq((select count(*) from public.user_settings), 0::bigint, 'B sieht A''s Einstellungen nicht');
select test.eq(test.affected($$update public.user_settings set focus_minutes = 1, updated_at = '2030-01-01'$$),
               0::bigint, 'B kann A''s Einstellungen nicht ändern');
select test.fails($$insert into public.user_settings (user_id, focus_minutes)
                    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1)$$,
                  '42501', 'B kann keine Einstellungen für A anlegen');

:als_admin
select test.eq((select focus_minutes from public.user_settings where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
               50, 'A''s Einstellungen sind unverändert');


-- -----------------------------------------------------------------------------
-- 12. Physisches Löschen (nur serverseitig: Admin, Konto-Löschung)
-- -----------------------------------------------------------------------------
select test.section('12. ON DELETE-Verhalten (nur serverseitig möglich)');

:als_admin
delete from public.milestones where id = 'a2000000-0000-4000-8000-000000000001';
select test.eq((select coalesce(milestone_id::text, 'NULL') || '|' || user_id
                  from public.work_packages where id = 'a3000000-0000-4000-8000-000000000001'),
               'NULL|aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
               'Meilenstein gelöscht → Arbeitspaket bleibt, milestone_id = NULL, user_id bleibt (SET NULL mit Spaltenliste)');

delete from public.projects where id = 'a1000000-0000-4000-8000-000000000001';
select test.eq((select count(*) from public.work_packages where project_id = 'a1000000-0000-4000-8000-000000000001')
               + (select count(*) from public.tasks where project_id = 'a1000000-0000-4000-8000-000000000001')
               + (select count(*) from public.milestones where project_id = 'a1000000-0000-4000-8000-000000000001'),
               0::bigint, 'Projekt gelöscht → Meilensteine, Arbeitspakete, Tasks gelöscht (CASCADE)');
select test.eq((select coalesce(project_id::text, 'NULL') || '|' || coalesce(work_package_id::text, 'NULL') || '|'
                       || coalesce(task_id::text, 'NULL') || '|' || user_id
                  from public.time_logs where id = 'a5000000-0000-4000-8000-000000000001'),
               'NULL|NULL|NULL|aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
               'Zeiteintrag bleibt als Historie, Verweise = NULL');
select test.eq((select coalesce(project_id::text, 'NULL') || '|' || coalesce(task_id::text, 'NULL')
                  from public.planned_blocks where id = 'a6000000-0000-4000-8000-000000000001'),
               'NULL|NULL', 'geplanter Block bleibt, Verweise = NULL');

-- Konto-Löschung: Nutzer C mit Daten in allen Tabellen
:als_c
insert into public.projects (id, project_code, name, mode)
values ('c1000000-0000-4000-8000-000000000001', 'C', 'Projekt C', 'work');
insert into public.milestones (project_id, ms_code, title) values ('c1000000-0000-4000-8000-000000000001', 'M', 'M');
insert into public.work_packages (id, project_id, ap_code, title)
values ('c3000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'AP', 'AP');
insert into public.tasks (id, project_id, work_package_id, title)
values ('c4000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
        'c3000000-0000-4000-8000-000000000001', 'T');
insert into public.time_logs (project_id, task_id, workspace, mode, start_time, end_time)
values ('c1000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 'work', 'stopwatch', now(), now());
insert into public.planned_blocks (task_id, workspace, title, start_time, end_time)
values ('c4000000-0000-4000-8000-000000000001', 'work', 'B', now(), now());
insert into public.active_timer_state (status) values ('idle');
insert into public.user_settings (focus_minutes) values (30);

:als_admin
delete from auth.users where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['projects', 'milestones', 'work_packages', 'tasks', 'time_logs',
                           'planned_blocks', 'active_timer_state', 'user_settings'] loop
    execute format('select count(*) from public.%I where user_id = %L', t, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') into n;
    perform test.eq(n, 0::bigint, format('Konto gelöscht → %s von C entfernt', t));
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- 13. Korrekturen im SQL-Editor (Admin, README Abschnitt 7)
-- -----------------------------------------------------------------------------
select test.section('13. Korrekturen im SQL-Editor (Empfehlung aus README Abschnitt 7)');

:als_admin
-- Die Uhr eines Geräts ging 10 Minuten vor: Seine HLC-Zeitstempel (updated_at) liegen
-- dann vor der Serverzeit, und alle Geräte übernehmen diesen Vorsprung.
insert into public.projects (id, user_id, project_code, name, mode, updated_at, updated_by)
values ('a1000000-0000-4000-8000-000000000021', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ADMIN1', 'Vorher', 'study',
        clock_timestamp() + interval '10 minutes', 'dev-schnell');
create temp table admin_mark as
select updated_at from public.projects where id = 'a1000000-0000-4000-8000-000000000021';

-- Ohne neues updated_at speichert der Server die Änderung (Gleichstand), die Geräte
-- übernehmen sie aber nicht: applyRemote() übernimmt nur echt neuere Zeilen.
select test.eq(test.affected($$update public.projects set name = 'ohne updated_at'
                                where id = 'a1000000-0000-4000-8000-000000000021'$$),
               1::bigint, 'Admin-UPDATE ohne updated_at wird gespeichert …');
select test.ok((select p.updated_at = m.updated_at from public.projects p, admin_mark m
                 where p.id = 'a1000000-0000-4000-8000-000000000021'),
               '… gilt für die Geräte aber nicht als neuer (updated_at unverändert)');

-- updated_at = now() allein reicht nicht: Es liegt hinter dem Vorsprung der Geräteuhr
select test.eq(test.affected($$update public.projects set name = 'nur now()', updated_at = now()
                                where id = 'a1000000-0000-4000-8000-000000000021'$$),
               0::bigint, 'updated_at = now() wird still verworfen, wenn die Geräteuhr vorging');

-- Die dokumentierte Korrektur muss auch bei vorgehender Geräteuhr greifen
select test.eq(test.affected($$update public.projects set name = 'korrigiert',
                                       updated_at = greatest(now(), updated_at + interval '1 millisecond')
                                where id = 'a1000000-0000-4000-8000-000000000021'$$),
               1::bigint, 'empfohlene Korrektur wird übernommen, auch wenn die Geräteuhr vorging');
select test.ok((select date_trunc('milliseconds', p.updated_at) > date_trunc('milliseconds', m.updated_at)
                  from public.projects p, admin_mark m
                 where p.id = 'a1000000-0000-4000-8000-000000000021'),
               '… und ist in Millisekunden (wie in der App) neuer als der bisherige Stand');

-- Normalfall (Zeitstempel in der Vergangenheit): greatest() wählt die Serverzeit
insert into public.projects (id, user_id, project_code, name, mode, updated_at, updated_by)
values ('a1000000-0000-4000-8000-000000000022', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ADMIN2', 'Vorher', 'study',
        '2000-01-01 00:00:00+00', 'dev-a');
select test.eq(test.affected($$update public.projects set name = 'korrigiert',
                                       updated_at = greatest(now(), updated_at + interval '1 millisecond')
                                where id = 'a1000000-0000-4000-8000-000000000022'$$),
               1::bigint, 'empfohlene Korrektur greift auch im Normalfall');
select test.ok((select updated_at between now() - interval '1 hour' and now()
                  from public.projects where id = 'a1000000-0000-4000-8000-000000000022'),
               '… mit updated_at = Serverzeit');


-- -----------------------------------------------------------------------------
-- Zusammenfassung
-- -----------------------------------------------------------------------------
do $$
begin
  raise notice '══ Alle % Prüfungen bestanden.', current_setting('test.passed');
end
$$;
