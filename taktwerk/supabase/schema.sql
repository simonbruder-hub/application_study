-- =============================================================================
-- Pomodoro-Planer v2 – Supabase-Schema (PostgreSQL 15+)
-- =============================================================================
--
-- WAS DIESES SKRIPT TUT
--   Legt alle Tabellen, Indizes, Trigger, Zugriffsrechte und Row-Level-Security-
--   Policies an, die die App für die Synchronisation zwischen Laptop und Handy
--   braucht, und meldet die Tabellen bei Supabase Realtime an.
--
--   Ausführen: Supabase-Dashboard → SQL Editor → New query → ganzen Inhalt
--   einfügen → Run. Das Skript ist IDEMPOTENT: Es darf beliebig oft ausgeführt
--   werden (create … if not exists, create or replace, drop … if exists).
--   Bestehende Daten bleiben dabei erhalten. Spätere Schemaänderungen werden als
--   zusätzliche, ebenfalls wiederholbare Abschnitte am Ende ergänzt.
--
-- TABELLEN
--   Entitäten (Spalten 1:1 wie in src/data/types.ts, snake_case):
--     projects, milestones, work_packages, tasks, time_logs, planned_blocks
--   Je Nutzer genau eine Zeile (Primärschlüssel user_id):
--     active_timer_state  (laufender Timer, live über Realtime gespiegelt)
--     user_settings       (Timer-Längen, Tagesziel, Health-Schwellwerte)
--
--   Typen: Zeitpunkte = timestamptz (in der App Epoch-ms, an der Grenze ISO-8601),
--   Kalendertage = date ('YYYY-MM-DD'), Stunden = numeric(10,2) (auf 2 Nachkomma-
--   stellen gerundet), Zähler/Minuten/Sekunden = integer, accumulated_ms = bigint.
--
-- SYNC-VERTRAG
--   Spalten jeder Entitätszeile:
--     id                UUID, auf dem Gerät erzeugt (offline anlegbar)
--     user_id           Besitzer; Default auth.uid(), danach unveränderlich
--     created_at        vom Client gesetzt, bei Updates vom Server festgehalten
--     updated_at        Hybrid Logical Clock des schreibenden Geräts
--     updated_by        Geräte-ID des Schreibers (Tie-Breaker)
--     is_deleted        Soft-Delete; physisches Löschen über die API ist gesperrt
--     server_updated_at vom Server bei JEDEM Schreiben vergeben (clock_timestamp())
--                       → einziger Pull-Cursor; vom Client gesendete Werte werden
--                       überschrieben
--   active_timer_state und user_settings haben user_id (statt id), updated_at,
--   updated_by und server_updated_at, aber weder created_at noch is_deleted.
--
--   PUSH (Outbox): Upsert über PostgREST, d. h.
--       INSERT … ON CONFLICT (id) DO UPDATE SET spalte = excluded.spalte, …
--     (supabase-js: .upsert(rows, { onConflict: 'id' }); bei den beiden
--      Einzeltabellen onConflict: 'user_id'). user_id darf fehlen.
--     Reihenfolge: projects → milestones → work_packages → tasks → time_logs
--     → planned_blocks (Eltern vor Kindern, sonst greifen die Fremdschlüssel).
--
--   LAST-WRITER-WINS: Ein Trigger verwirft jedes Update, dessen
--     (updated_at, updated_by) kleiner ist als das der gespeicherten Zeile –
--     still, ohne Fehler (die Zeile fehlt dann in der Antwort von
--     "return=representation"). updated_by wird bytweise verglichen
--     (Collation "C"), genau wie der String-Vergleich in JavaScript.
--     Gleichstand in beiden Feldern gilt als Wiederholung und wird übernommen.
--     Wer Daten direkt im SQL-Editor korrigiert, muss updated_at erhöhen:
--       updated_at = greatest(now(), updated_at + interval '1 millisecond')
--     Ohne Erhöhung speichert der Server die Änderung zwar, die Geräte übernehmen
--     sie aber nicht (sie übernehmen nur echt neuere Zeilen, auf ms genau). Nur
--     now() genügt nicht: Ging eine Geräteuhr vor, liegt updated_at (HLC) vor der
--     Serverzeit, und der Trigger verwirft die Änderung still.
--
--   PULL (Keyset-Paginierung je Tabelle):
--       select * from public.<tabelle>
--        where (server_updated_at, id) > (:cursor_ts, :cursor_id)
--        order by server_updated_at, id
--        limit 500;
--     Danach Cursor := (server_updated_at, id) der letzten Zeile; wiederholen,
--     bis weniger als "limit" Zeilen kommen. RLS beschränkt automatisch auf die
--     eigenen Zeilen; der Index (user_id, server_updated_at, id) trägt die Abfrage.
--     PostgREST kennt keinen Zeilenvergleich, deshalb als Filter (Zeitstempel in
--     Anführungszeichen, weil ISO-Werte ':' '.' '+' enthalten):
--       ?or=(server_updated_at.gt."<ts>",and(server_updated_at.eq."<ts>",id.gt.<id>))
--       &order=server_updated_at.asc,id.asc&limit=500
--     Für den Start: cursor_ts = '-infinity', cursor_id = '00000000-0000-0000-0000-000000000000'.
--     Bei active_timer_state/user_settings genügt "select * … " (höchstens 1 Zeile).
--
--     ÜBERLAPPUNG: server_updated_at wird beim Schreiben vergeben, sichtbar wird
--     die Zeile aber erst beim COMMIT. Eine langsamere Transaktion kann daher
--     nachträglich einen Zeitstempel KLEINER als den bereits gesehenen Cursor
--     sichtbar machen. Deshalb jeden Pull bei (cursor_ts − 30 Sekunden,
--     '00000000-…') beginnen; doppelt gezogene Zeilen sind harmlos, weil das
--     Übernehmen (applyRemote, LWW) idempotent ist.
--
--   SERVERZEIT: select public.server_now(); (RPC: supabase.rpc('server_now'))
--     liefert die Uhrzeit des Servers, z. B. um eine grob falsch gehende
--     Geräteuhr zu erkennen.
--
--   FEHLER, DIE DIE SYNC-ENGINE BEHANDELN MUSS (PostgREST-Code = SQLSTATE):
--     23505 projects_project_code_uidx, milestones_ms_code_uidx,
--           work_packages_ap_code_uidx
--           → derselbe Code ist (ohne Beachtung der Gross-/Kleinschreibung)
--             schon aktiv vergeben, z. B. offline auf zwei Geräten angelegt.
--     23503 Fremdschlüssel <tabelle>_<spalte>_fkey: Elternzeile fehlt (noch
--           nicht gepusht) oder gehört einem anderen Nutzer.
--     23514 CHECK-Constraint <tabelle>_<spalte>_check verletzt.
--     Unter RLS enthält das Fehlerdetail keine Schlüsselwerte (nur z. B. "Key is
--     not present in table …"). Deshalb folgen alle Namen dem Schema
--     <tabelle>_<spalte>_check | _fkey | _uidx: Die betroffene Spalte lässt sich
--     zuverlässig aus dem Namen in der Meldung ablesen.
--     42501 keine Berechtigung bzw. RLS verletzt (nicht angemeldet, fremde Zeile,
--           Versuch user_id oder id zu ändern).
--
-- SICHERHEIT
--   - RLS ist auf allen Tabellen aktiv: angemeldete Nutzer (Rolle authenticated)
--     sehen und schreiben ausschliesslich Zeilen mit user_id = auth.uid().
--   - Keine DELETE-Policy und kein DELETE-Recht: gelöscht wird nur per is_deleted.
--   - Die Rolle anon (nicht angemeldet, öffentlicher "anon key") hat KEINE Rechte.
--   - Zusammengesetzte Fremdschlüssel (user_id, project_id) → projects(user_id, id)
--     usw.: Niemand kann auf Zeilen eines anderen Nutzers verweisen.
--   - Trigger-Funktionen liegen im nicht veröffentlichten Schema app_private,
--     mit search_path = '' und voll qualifizierten Namen.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Schemas
-- -----------------------------------------------------------------------------

-- Interne Hilfsfunktionen; wird von PostgREST nicht veröffentlicht.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2. Tabellen
-- -----------------------------------------------------------------------------

-- Projekte (oberste Ebene, je Modus Lernen/Arbeit)
create table if not exists public.projects (
  id                uuid          not null default gen_random_uuid() primary key,
  user_id           uuid          not null default auth.uid() references auth.users (id) on delete cascade,
  project_code      text          not null,
  name              text          not null,
  mode              text          not null,
  status            text          not null default 'active',
  color             text          not null default '#3B82F6',
  planned_hours     numeric(10,2),
  start_date        date,
  end_date          date,
  notes             text          not null default '',
  sort_order        integer       not null default 0,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),
  updated_by        text          not null default '',
  is_deleted        boolean       not null default false,
  server_updated_at timestamptz   not null default clock_timestamp(),
  constraint projects_user_id_id_key      unique (user_id, id),
  constraint projects_project_code_check  check (project_code ~ '^[A-Za-z0-9._-]{1,32}$'),
  constraint projects_name_check          check (name ~ '\S'),
  constraint projects_mode_check          check (mode in ('study', 'work')),
  constraint projects_status_check        check (status in ('active', 'paused', 'archived')),
  constraint projects_color_check         check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint projects_planned_hours_check check (planned_hours >= 0),
  constraint projects_end_date_check      check (start_date is null or end_date is null or end_date >= start_date)
);

-- Meilensteine (gehören immer zu einem Projekt)
create table if not exists public.milestones (
  id                uuid          not null default gen_random_uuid() primary key,
  user_id           uuid          not null default auth.uid() references auth.users (id) on delete cascade,
  project_id        uuid          not null,
  ms_code           text          not null,
  title             text          not null,
  target_date       date,
  status            text          not null default 'open',
  notes             text          not null default '',
  sort_order        integer       not null default 0,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),
  updated_by        text          not null default '',
  is_deleted        boolean       not null default false,
  server_updated_at timestamptz   not null default clock_timestamp(),
  constraint milestones_user_id_id_key  unique (user_id, id),
  constraint milestones_project_id_fkey foreign key (user_id, project_id)
                                        references public.projects (user_id, id) on delete cascade,
  constraint milestones_ms_code_check   check (ms_code ~ '^[A-Za-z0-9._-]{1,32}$'),
  constraint milestones_title_check     check (title ~ '\S'),
  constraint milestones_status_check    check (status in ('open', 'achieved', 'delayed'))
);

-- Arbeitspakete (Projekt Pflicht, Meilenstein optional)
create table if not exists public.work_packages (
  id                uuid          not null default gen_random_uuid() primary key,
  user_id           uuid          not null default auth.uid() references auth.users (id) on delete cascade,
  project_id        uuid          not null,
  milestone_id      uuid,
  ap_code           text          not null,
  title             text          not null,
  planned_hours     numeric(10,2),
  start_date        date,
  end_date          date,
  notes             text          not null default '',
  sort_order        integer       not null default 0,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),
  updated_by        text          not null default '',
  is_deleted        boolean       not null default false,
  server_updated_at timestamptz   not null default clock_timestamp(),
  constraint work_packages_user_id_id_key      unique (user_id, id),
  constraint work_packages_project_id_fkey     foreign key (user_id, project_id)
                                               references public.projects (user_id, id) on delete cascade,
  constraint work_packages_milestone_id_fkey   foreign key (user_id, milestone_id)
                                               references public.milestones (user_id, id) on delete set null (milestone_id),
  constraint work_packages_ap_code_check       check (ap_code ~ '^[A-Za-z0-9._-]{1,32}$'),
  constraint work_packages_title_check         check (title ~ '\S'),
  constraint work_packages_planned_hours_check check (planned_hours >= 0),
  constraint work_packages_end_date_check      check (start_date is null or end_date is null or end_date >= start_date)
);

-- Aufgaben (Projekt Pflicht, Arbeitspaket optional)
create table if not exists public.tasks (
  id                  uuid          not null default gen_random_uuid() primary key,
  user_id             uuid          not null default auth.uid() references auth.users (id) on delete cascade,
  project_id          uuid          not null,
  work_package_id     uuid,
  title               text          not null,
  status              text          not null default 'todo',
  priority            text          not null default 'medium',
  due_date            date,
  estimated_hours     numeric(10,2),
  estimated_pomodoros integer,
  notes               text          not null default '',
  completed_at        timestamptz,
  sort_order          integer       not null default 0,
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now(),
  updated_by          text          not null default '',
  is_deleted          boolean       not null default false,
  server_updated_at   timestamptz   not null default clock_timestamp(),
  constraint tasks_user_id_id_key            unique (user_id, id),
  constraint tasks_project_id_fkey           foreign key (user_id, project_id)
                                             references public.projects (user_id, id) on delete cascade,
  constraint tasks_work_package_id_fkey      foreign key (user_id, work_package_id)
                                             references public.work_packages (user_id, id) on delete set null (work_package_id),
  constraint tasks_title_check               check (title ~ '\S'),
  constraint tasks_status_check              check (status in ('todo', 'in_progress', 'done')),
  constraint tasks_priority_check            check (priority in ('low', 'medium', 'high')),
  constraint tasks_estimated_hours_check     check (estimated_hours >= 0),
  constraint tasks_estimated_pomodoros_check check (estimated_pomodoros >= 0)
);

-- Zeiteinträge (Ist-Zeit; bleiben als Historie, auch wenn das Projekt gelöscht wird)
create table if not exists public.time_logs (
  id                 uuid          not null default gen_random_uuid() primary key,
  user_id            uuid          not null default auth.uid() references auth.users (id) on delete cascade,
  project_id         uuid,
  work_package_id    uuid,
  task_id            uuid,
  workspace          text          not null,
  mode               text          not null,
  start_time         timestamptz   not null,
  end_time           timestamptz   not null,
  duration_seconds   integer       not null default 0,
  counts_as_pomodoro boolean       not null default false,
  comment            text          not null default '',
  created_at         timestamptz   not null default now(),
  updated_at         timestamptz   not null default now(),
  updated_by         text          not null default '',
  is_deleted         boolean       not null default false,
  server_updated_at  timestamptz   not null default clock_timestamp(),
  constraint time_logs_project_id_fkey        foreign key (user_id, project_id)
                                              references public.projects (user_id, id) on delete set null (project_id),
  constraint time_logs_work_package_id_fkey   foreign key (user_id, work_package_id)
                                              references public.work_packages (user_id, id) on delete set null (work_package_id),
  constraint time_logs_task_id_fkey           foreign key (user_id, task_id)
                                              references public.tasks (user_id, id) on delete set null (task_id),
  constraint time_logs_workspace_check        check (workspace in ('study', 'work')),
  constraint time_logs_mode_check             check (mode in ('pomodoro', 'stopwatch', 'manual')),
  constraint time_logs_end_time_check         check (end_time >= start_time),
  constraint time_logs_duration_seconds_check check (duration_seconds >= 0)
);

-- Geplante Lern-/Arbeitsblöcke im Kalender (Soll-Seite)
create table if not exists public.planned_blocks (
  id                uuid          not null default gen_random_uuid() primary key,
  user_id           uuid          not null default auth.uid() references auth.users (id) on delete cascade,
  project_id        uuid,
  work_package_id   uuid,
  task_id           uuid,
  workspace         text          not null,
  title             text          not null,
  start_time        timestamptz   not null,
  end_time          timestamptz   not null,
  notes             text          not null default '',
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),
  updated_by        text          not null default '',
  is_deleted        boolean       not null default false,
  server_updated_at timestamptz   not null default clock_timestamp(),
  constraint planned_blocks_project_id_fkey      foreign key (user_id, project_id)
                                                 references public.projects (user_id, id) on delete set null (project_id),
  constraint planned_blocks_work_package_id_fkey foreign key (user_id, work_package_id)
                                                 references public.work_packages (user_id, id) on delete set null (work_package_id),
  constraint planned_blocks_task_id_fkey         foreign key (user_id, task_id)
                                                 references public.tasks (user_id, id) on delete set null (task_id),
  constraint planned_blocks_workspace_check      check (workspace in ('study', 'work')),
  constraint planned_blocks_title_check          check (title ~ '\S'),
  constraint planned_blocks_end_time_check       check (end_time >= start_time)
);

-- Laufender Timer: genau eine Zeile je Nutzer. Lokal ist id = 'local', auf dem
-- Server ist der Schlüssel user_id. Bewusst ohne Fremdschlüssel auf Projekte/Tasks,
-- damit ein Timer auch dann gespiegelt wird, wenn der Task noch nicht gepusht ist.
create table if not exists public.active_timer_state (
  user_id            uuid          not null default auth.uid() primary key references auth.users (id) on delete cascade,
  session_id         uuid,
  kind               text          not null default 'pomodoro',
  phase              text          not null default 'focus',
  status             text          not null default 'idle',
  workspace          text          not null default 'study',
  project_id         uuid,
  work_package_id    uuid,
  task_id            uuid,
  planned_seconds    integer,
  accumulated_ms     bigint        not null default 0,
  segment_started_at timestamptz,
  session_started_at timestamptz,
  cycle              integer       not null default 0,
  updated_at         timestamptz   not null default now(),
  updated_by         text          not null default '',
  server_updated_at  timestamptz   not null default clock_timestamp(),
  constraint active_timer_state_kind_check            check (kind in ('pomodoro', 'stopwatch')),
  constraint active_timer_state_phase_check           check (phase in ('focus', 'short_break', 'long_break')),
  constraint active_timer_state_status_check          check (status in ('idle', 'running', 'paused')),
  constraint active_timer_state_workspace_check       check (workspace in ('study', 'work')),
  constraint active_timer_state_planned_seconds_check check (planned_seconds >= 0),
  constraint active_timer_state_accumulated_ms_check  check (accumulated_ms >= 0),
  constraint active_timer_state_cycle_check           check (cycle >= 0)
);

-- Einstellungen: genau eine Zeile je Nutzer (Defaults wie DEFAULT_SETTINGS in types.ts)
create table if not exists public.user_settings (
  user_id                      uuid          not null default auth.uid() primary key references auth.users (id) on delete cascade,
  focus_minutes                integer       not null default 25,
  short_break_minutes          integer       not null default 5,
  long_break_minutes           integer       not null default 15,
  long_break_every             integer       not null default 4,
  auto_start_breaks            boolean       not null default true,
  auto_start_focus             boolean       not null default false,
  daily_goal_minutes           integer       not null default 240,
  health_red_daily_hours       numeric(10,2) not null default 6,
  health_yellow_daily_hours    numeric(10,2) not null default 3,
  milestone_red_daily_hours    numeric(10,2) not null default 6,
  milestone_yellow_daily_hours numeric(10,2) not null default 3.5,
  updated_at                   timestamptz   not null default now(),
  updated_by                   text          not null default '',
  server_updated_at            timestamptz   not null default clock_timestamp(),
  constraint user_settings_focus_minutes_check                check (focus_minutes > 0),
  constraint user_settings_short_break_minutes_check          check (short_break_minutes >= 0),
  constraint user_settings_long_break_minutes_check           check (long_break_minutes >= 0),
  constraint user_settings_long_break_every_check             check (long_break_every > 0),
  constraint user_settings_daily_goal_minutes_check           check (daily_goal_minutes >= 0),
  constraint user_settings_health_red_daily_hours_check       check (health_red_daily_hours >= 0),
  constraint user_settings_health_yellow_daily_hours_check    check (health_yellow_daily_hours >= 0),
  constraint user_settings_milestone_red_daily_hours_check    check (milestone_red_daily_hours >= 0),
  constraint user_settings_milestone_yellow_daily_hours_check check (milestone_yellow_daily_hours >= 0)
);

comment on table public.projects           is 'Projekte (Lern- oder Arbeitsmodus) mit Soll-Stunden und Zeitraum';
comment on table public.milestones         is 'Meilensteine eines Projekts';
comment on table public.work_packages      is 'Arbeitspakete eines Projekts, optional einem Meilenstein zugeordnet';
comment on table public.tasks              is 'Aufgaben eines Projekts, optional einem Arbeitspaket zugeordnet';
comment on table public.time_logs          is 'Erfasste Zeit (Pomodoro, Stechuhr, Nachtrag)';
comment on table public.planned_blocks     is 'Geplante Lern-/Arbeitsblöcke im Kalender';
comment on table public.active_timer_state is 'Laufender Timer, eine Zeile je Nutzer, live über Realtime gespiegelt';
comment on table public.user_settings      is 'Einstellungen, eine Zeile je Nutzer';


-- -----------------------------------------------------------------------------
-- 3. Indizes
-- -----------------------------------------------------------------------------

-- Eindeutige lesbare Codes: ohne Beachtung der Gross-/Kleinschreibung und nur unter
-- nicht gelöschten Zeilen (ein gelöschter Code darf neu vergeben werden).
create unique index if not exists projects_project_code_uidx
  on public.projects (user_id, lower(project_code)) where not is_deleted;
create unique index if not exists milestones_ms_code_uidx
  on public.milestones (user_id, project_id, lower(ms_code)) where not is_deleted;
create unique index if not exists work_packages_ap_code_uidx
  on public.work_packages (user_id, project_id, lower(ap_code)) where not is_deleted;

-- Fremdschlüsselspalten (Kaskaden beim Löschen, Abfragen nach Eltern)
create index if not exists milestones_project_idx          on public.milestones (user_id, project_id);
create index if not exists work_packages_project_idx       on public.work_packages (user_id, project_id);
create index if not exists work_packages_milestone_idx     on public.work_packages (user_id, milestone_id);
create index if not exists tasks_project_idx               on public.tasks (user_id, project_id);
create index if not exists tasks_work_package_idx          on public.tasks (user_id, work_package_id);
create index if not exists time_logs_project_idx           on public.time_logs (user_id, project_id);
create index if not exists time_logs_work_package_idx      on public.time_logs (user_id, work_package_id);
create index if not exists time_logs_task_idx              on public.time_logs (user_id, task_id);
create index if not exists planned_blocks_project_idx      on public.planned_blocks (user_id, project_id);
create index if not exists planned_blocks_work_package_idx on public.planned_blocks (user_id, work_package_id);
create index if not exists planned_blocks_task_idx         on public.planned_blocks (user_id, task_id);

-- Zeitraumabfragen (Kalender, Auswertung)
create index if not exists time_logs_start_idx      on public.time_logs (user_id, start_time);
create index if not exists planned_blocks_start_idx on public.planned_blocks (user_id, start_time);

-- Sync-Cursor (Keyset-Pull) auf allen Entitätstabellen. Die beiden Einzeltabellen
-- brauchen keinen: Ihr Primärschlüssel user_id liefert höchstens eine Zeile.
do $$
declare
  t text;
begin
  foreach t in array array['projects', 'milestones', 'work_packages', 'tasks', 'time_logs', 'planned_blocks'] loop
    execute format('create index if not exists %I on public.%I (user_id, server_updated_at, id)', t || '_sync_idx', t);
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- 4. Trigger: Besitzer, Sync-Cursor und Last-Writer-Wins
-- -----------------------------------------------------------------------------

-- Für die Entitätstabellen (mit id und created_at)
create or replace function app_private.entity_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is null then
      new.user_id := auth.uid();
    end if;
    new.server_updated_at := pg_catalog.clock_timestamp();
    return new;
  end if;

  -- UPDATE (auch der DO-UPDATE-Teil eines Upserts)
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id darf nicht geändert werden (Tabelle %)', tg_table_name
      using errcode = '42501';
  end if;
  if new.id is distinct from old.id then
    raise exception 'id darf nicht geändert werden (Tabelle %)', tg_table_name
      using errcode = '42501';
  end if;

  -- Last-Writer-Wins: veraltete Schreibvorgänge still verwerfen
  if (new.updated_at, new.updated_by collate pg_catalog."C")
       < (old.updated_at, old.updated_by collate pg_catalog."C") then
    return null;
  end if;

  new.created_at := old.created_at;
  new.server_updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

-- Für active_timer_state und user_settings (Schlüssel user_id, ohne created_at)
create or replace function app_private.singleton_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is null then
      new.user_id := auth.uid();
    end if;
    new.server_updated_at := pg_catalog.clock_timestamp();
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'user_id darf nicht geändert werden (Tabelle %)', tg_table_name
      using errcode = '42501';
  end if;

  if (new.updated_at, new.updated_by collate pg_catalog."C")
       < (old.updated_at, old.updated_by collate pg_catalog."C") then
    return null;
  end if;

  new.server_updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

revoke all on function app_private.entity_before_write() from public, anon, authenticated;
revoke all on function app_private.singleton_before_write() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['projects', 'milestones', 'work_packages', 'tasks', 'time_logs', 'planned_blocks'] loop
    execute format('drop trigger if exists before_write on public.%I', t);
    execute format(
      'create trigger before_write before insert or update on public.%I '
      'for each row execute function app_private.entity_before_write()', t);
  end loop;

  foreach t in array array['active_timer_state', 'user_settings'] loop
    execute format('drop trigger if exists before_write on public.%I', t);
    execute format(
      'create trigger before_write before insert or update on public.%I '
      'for each row execute function app_private.singleton_before_write()', t);
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- 5. Zugriffsrechte und Row-Level-Security
-- -----------------------------------------------------------------------------
-- Supabase vergibt in public standardmässig alle Rechte an anon und authenticated.
-- Hier wird das auf das Nötige zurückgesetzt:
--   anon           nichts
--   authenticated  lesen, anlegen, ändern – nur eigene Zeilen (RLS), kein DELETE
--   service_role   alles (nur serverseitig, umgeht RLS; Schlüssel nie in die App!)

do $$
declare
  t text;
begin
  foreach t in array array['projects', 'milestones', 'work_packages', 'tasks', 'time_logs',
                           'planned_blocks', 'active_timer_state', 'user_settings'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);

    execute format('drop policy if exists own_select on public.%I', t);
    execute format('drop policy if exists own_insert on public.%I', t);
    execute format('drop policy if exists own_update on public.%I', t);

    execute format(
      'create policy own_select on public.%I for select to authenticated '
      'using (user_id = (select auth.uid()))', t);
    execute format(
      'create policy own_insert on public.%I for insert to authenticated '
      'with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy own_update on public.%I for update to authenticated '
      'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    -- Bewusst keine DELETE-Policy: Löschen nur per Soft-Delete (is_deleted = true).
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- 6. RPC: Serverzeit
-- -----------------------------------------------------------------------------

create or replace function public.server_now()
returns timestamptz
language sql
volatile
set search_path = ''
as $$
  select pg_catalog.clock_timestamp();
$$;

comment on function public.server_now() is 'Aktuelle Serverzeit (clock_timestamp) für angemeldete Nutzer';

revoke all on function public.server_now() from public, anon, service_role;
grant execute on function public.server_now() to authenticated;


-- -----------------------------------------------------------------------------
-- 7. Realtime
-- -----------------------------------------------------------------------------
-- Alle Tabellen zur Publication supabase_realtime hinzufügen, sofern es sie gibt
-- und die Tabelle noch nicht enthalten ist. Realtime beachtet die SELECT-Policy:
-- Jedes Gerät erhält nur Änderungen an den eigenen Zeilen.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime nicht gefunden – Realtime-Anmeldung übersprungen';
    return;
  end if;

  foreach t in array array['projects', 'milestones', 'work_packages', 'tasks', 'time_logs',
                           'planned_blocks', 'active_timer_state', 'user_settings'] loop
    if not exists (
      select 1
        from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;


-- PostgREST (Supabase-API) das neue Schema sofort bekannt machen
notify pgrst, 'reload schema';
