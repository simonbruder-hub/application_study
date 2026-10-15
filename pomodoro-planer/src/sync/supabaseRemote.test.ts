import { describe, expect, it, vi } from 'vitest';
import { AuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import type { ActiveTimerState, Project, Task, UserSettings } from '../data/types';
import { MemoryServer } from './memoryRemote';
import { RemoteError } from './remote';
import type { Timers } from './runtime';
import {
  SupabaseRemote, fromRemoteRow, keysetFilter, mapPostgrestError, settingsFromRemote, settingsToRemote,
  timerFromRemote, timerToRemote, toRemoteRow, type PostgrestErrorLike,
} from './supabaseRemote';
import { SyncEngine } from './syncEngine';
import { createTestDevice, projectInput, remoteProject } from './testing';

const T = Date.UTC(2026, 9, 15, 8, 0, 0, 123);
const ISO = '2026-10-15T08:00:00.123Z';

describe('toRemoteRow / fromRemoteRow', () => {
  const task: Task & { _dirty: 1 } = {
    id: 't1', user_id: 'u1', created_at: T, updated_at: T + 1, updated_by: 'dev', is_deleted: false, _dirty: 1,
    project_id: 'p1', work_package_id: null, title: 'Übung', status: 'done', priority: 'high', due_date: '2026-10-20',
    estimated_hours: 1.5, estimated_pomodoros: 3, notes: '', completed_at: T + 2, sort_order: 0,
  };

  it('entfernt lokale Felder und user_id und wandelt Zeitpunkte in ISO', () => {
    const row = toRemoteRow('tasks', task);
    expect(row).not.toHaveProperty('_dirty');
    expect(row).not.toHaveProperty('user_id');
    expect(row).toMatchObject({
      created_at: ISO, updated_at: '2026-10-15T08:00:00.124Z', completed_at: '2026-10-15T08:00:00.125Z',
      due_date: '2026-10-20', estimated_hours: 1.5,
    });
    expect(toRemoteRow('tasks', { ...task, completed_at: null }).completed_at).toBeNull();
  });

  it('liest Server-Zeilen inkl. Mikrosekunden, numeric-Strings und Realtime-Format', () => {
    const raw = {
      ...toRemoteRow('tasks', task),
      user_id: 'u1',
      server_updated_at: '2026-10-15T08:00:01.654321+00:00',
      created_at: '2026-10-15T08:00:00.123456+00:00',
      updated_at: '2026-10-15 08:00:00.124+00', // Realtime liefert Postgres-Textformat
      completed_at: null,
      estimated_hours: '1.50',
      estimated_pomodoros: '3',
      sort_order: '0',
    };
    const row = fromRemoteRow('tasks', raw);
    expect(row).not.toHaveProperty('server_updated_at');
    expect(row).not.toHaveProperty('user_id');
    expect(row).toMatchObject({
      created_at: T, updated_at: T + 1, completed_at: null, estimated_hours: 1.5, estimated_pomodoros: 3, sort_order: 0,
      title: 'Übung', due_date: '2026-10-20',
    });
  });

  it('ist für alle Entitäten verlustfrei hin und zurück', () => {
    const p: Project = remoteProject(T, { planned_hours: 12.5 });
    expect(fromRemoteRow('projects', toRemoteRow('projects', p))).toEqual(p);
    const log = {
      id: 'l1', created_at: T, updated_at: T, updated_by: 'd', is_deleted: false, project_id: null, work_package_id: null,
      task_id: null, workspace: 'work' as const, mode: 'manual' as const, start_time: T - 3_600_000, end_time: T,
      duration_seconds: 3600, counts_as_pomodoro: false, comment: 'Nachtrag',
    };
    const remote = toRemoteRow('time_logs', log);
    expect(remote.start_time).toBe('2026-10-15T07:00:00.123Z');
    expect(fromRemoteRow('time_logs', remote)).toEqual(log);
  });

  it('wandelt Einstellungen und Timer (id ↔ user_id)', () => {
    const settings = {
      id: 'local', focus_minutes: 25, short_break_minutes: 5, long_break_minutes: 15, long_break_every: 4,
      auto_start_breaks: true, auto_start_focus: false, daily_goal_minutes: 240, health_red_daily_hours: 6,
      health_yellow_daily_hours: 3, milestone_red_daily_hours: 6, milestone_yellow_daily_hours: 3.5, updated_at: T, updated_by: 'd',
    } satisfies UserSettings;
    const remoteSettings = settingsToRemote(settings);
    expect(remoteSettings).not.toHaveProperty('id');
    expect(remoteSettings.updated_at).toBe(ISO);
    expect(settingsFromRemote({ ...remoteSettings, user_id: 'u1', milestone_yellow_daily_hours: '3.5' }))
      .toEqual({ ...settings, id: 'u1' });

    const timer: ActiveTimerState = {
      id: 'local', session_id: 's1', kind: 'pomodoro', phase: 'focus', status: 'running', workspace: 'study',
      project_id: null, work_package_id: null, task_id: null, planned_seconds: 1500, accumulated_ms: 0,
      segment_started_at: T, session_started_at: T, cycle: 1, updated_at: T, updated_by: 'd',
    };
    const remoteTimer = timerToRemote(timer);
    expect(remoteTimer).toMatchObject({ segment_started_at: ISO, session_started_at: ISO });
    expect(timerFromRemote({ ...remoteTimer, user_id: 'u1', accumulated_ms: '0', server_updated_at: 'x' }))
      .toEqual({ ...timer, id: 'u1' });
  });
});

describe('mapPostgrestError', () => {
  const map = (error: PostgrestErrorLike, status = 409, table?: string) => mapPostgrestError(error, { status, table });

  it('erkennt Unique-Verletzungen inklusive Spalte', () => {
    expect(map({
      code: '23505', message: 'duplicate key value violates unique constraint "projects_user_code_uniq"',
      details: 'Key (user_id, lower(project_code::text))=(0a1b, mathe) already exists.',
    })).toMatchObject({ reason: 'unique_violation', column: 'project_code' });
    expect(map({ code: '23505', message: 'duplicate key value violates unique constraint "milestones_ms_code_uidx"' }))
      .toMatchObject({ column: 'ms_code' });
    // Unter RLS fehlen die Schlüsselwerte im Detail – der Constraint-Name genügt
    expect(map({ code: '23505', message: 'duplicate key value violates unique constraint "work_packages_ap_code_uidx"' }))
      .toMatchObject({ column: 'ap_code' });
    expect(map({ code: '23505', message: 'duplicate key value violates unique constraint "projects_pkey"', details: 'Key (id)=(x) already exists.' }))
      .toMatchObject({ column: 'id' });
    expect(map({ code: '23505', message: 'duplicate key value violates unique constraint "wp_code_idx"' }, 409, 'work_packages'))
      .toMatchObject({ column: 'ap_code' });
    expect(map({ code: '23505', message: 'duplicate key', details: 'Key (user_id, lower(title))=(x, y) already exists.' }))
      .toMatchObject({ column: 'title' });
  });

  it('erkennt Fremdschlüssel-, CHECK- und NOT-NULL-Verletzungen', () => {
    expect(map({
      code: '23503', message: 'insert or update on table "tasks" violates foreign key constraint "tasks_project_id_fkey"',
      details: 'Key (project_id)=(abc) is not present in table "projects".',
    })).toMatchObject({ reason: 'foreign_key', column: 'project_id' });
    expect(map({ code: '23503', message: 'violates foreign key constraint', details: 'Key (user_id, task_id)=(u, t) is not present.' }))
      .toMatchObject({ column: 'task_id' });
    expect(map({
      code: '23503', message: 'insert or update on table "time_logs" violates foreign key constraint "time_logs_task_id_fkey"',
      details: 'Key is not present in table "tasks".',
    }, 409, 'time_logs')).toMatchObject({ column: 'task_id' });
    expect(map({ code: '23514', message: 'new row for relation "projects" violates check constraint "projects_color_check"' }, 400, 'projects'))
      .toMatchObject({ reason: 'check', column: 'color' });
    expect(map({ code: '23502', message: 'null value in column "title" of relation "tasks" violates not-null constraint' }, 400))
      .toMatchObject({ reason: 'check', column: 'title' });
    expect(map({ code: '22P02', message: 'invalid input syntax for type uuid: "x"' }, 400)).toMatchObject({ reason: 'unknown' });
  });

  it('ordnet Anmelde-, Netzwerk- und Serverfehler als RemoteError ein', () => {
    const kind = (e: PostgrestErrorLike, status: number) => {
      const m = map(e, status);
      return m instanceof RemoteError ? m.kind : m.reason;
    };
    expect(kind({ code: '42501', message: 'permission denied for table projects' }, 401)).toBe('auth');
    // RLS-Verletzung einer einzelnen Zeile (z. B. id aus einem anderen Konto) ist kein Anmeldeproblem
    expect(kind({ code: '42501', message: 'new row violates row-level security policy (USING expression) for table "projects"' }, 403))
      .toBe('unknown');
    expect(kind({ code: '42501', message: 'id darf nicht geändert werden (Tabelle tasks)' }, 403)).toBe('unknown');
    expect(kind({ code: 'PGRST301', message: 'JWT expired' }, 401)).toBe('auth');
    expect(kind({ code: '', message: 'Invalid JWT' }, 401)).toBe('auth');
    expect(kind({ code: '', message: 'TypeError: fetch failed', details: 'Caused by: ECONNREFUSED' }, 0)).toBe('network');
    expect(kind({ message: 'TypeError: Failed to fetch' }, 500)).toBe('network');
    expect(kind({ code: 'PGRST204', message: "Could not find the 'x' column of 'projects'" }, 400)).toBe('server');
    expect(kind({ code: '57014', message: 'canceling statement due to statement timeout' }, 500)).toBe('server');
  });
});

describe('keysetFilter', () => {
  it('baut den Keyset-Filter mit Anführungszeichen; ohne id genügt >=', () => {
    const ts = '2026-10-15T08:00:00.123456+00:00';
    expect(keysetFilter({ ts, id: 'abc' }))
      .toBe(`server_updated_at.gt."${ts}",and(server_updated_at.eq."${ts}",id.gt.abc)`);
    expect(keysetFilter({ ts, id: '' })).toBe(`server_updated_at.gte."${ts}"`);
  });
});

/* ---------- SupabaseRemote gegen einen nachgebauten Client ---------- */

type Call = [string, ...unknown[]];
type Response = { data: unknown; error: PostgrestErrorLike | null; status: number };

class FakeQuery implements PromiseLike<Response> {
  readonly calls: Call[] = [];
  constructor(readonly table: string, private readonly respond: (q: FakeQuery) => Response) {}
  private add(...call: Call) { this.calls.push(call); return this; }
  select(cols: string) { return this.add('select', cols); }
  upsert(rows: unknown, opts: unknown) { return this.add('upsert', rows, opts); }
  or(filter: string) { return this.add('or', filter); }
  gte(col: string, v: unknown) { return this.add('gte', col, v); }
  eq(col: string, v: unknown) { return this.add('eq', col, v); }
  order(col: string, opts: unknown) { return this.add('order', col, opts); }
  limit(n: number) { return this.add('limit', n); }
  maybeSingle() { return this.add('maybeSingle'); }
  arg(name: string): unknown[] | undefined { return this.calls.find((c) => c[0] === name)?.slice(1); }
  then<A = Response, B = never>(ok?: ((v: Response) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.respond(this)).then(ok, fail);
  }
}

type Binding = { filter: { table: string; filter: string }; cb: (payload: Record<string, unknown>) => void };

class FakeChannel {
  readonly bindings: Binding[] = [];
  status?: (s: string) => void;
  constructor(readonly topic: string) {}
  on(_type: string, filter: Binding['filter'], cb: Binding['cb']) { this.bindings.push({ filter, cb }); return this; }
  subscribe(cb: (s: string) => void) { this.status = cb; return this; }
  emit(table: string, payload: Record<string, unknown>) {
    this.bindings.filter((b) => b.filter.table === table).forEach((b) => b.cb(payload));
  }
}

type FakeSession = { user: { id: string } } | null;
type AuthCallback = (event: string, session: FakeSession) => void;

function fakeClient(respond: (q: FakeQuery) => Response) {
  const queries: FakeQuery[] = [];
  const channels: FakeChannel[] = [];
  const removed: FakeChannel[] = [];
  const authListeners = new Set<AuthCallback>();
  /** Ergebnis von auth.getSession() – in Tests veränderbar */
  const auth: { session: FakeSession; error: unknown } = { session: { user: { id: 'u1' } }, error: null };
  const client = {
    from: (table: string) => { const q = new FakeQuery(table, respond); queries.push(q); return q; },
    channel: (topic: string) => { const c = new FakeChannel(topic); channels.push(c); return c; },
    removeChannel: async (c: FakeChannel) => { removed.push(c); return 'ok'; },
    rpc: vi.fn(async () => ({ data: '2026-10-15T08:00:00.123456+00:00', error: null, status: 200 })),
    auth: {
      getSession: async () => ({ data: { session: auth.session }, error: auth.error }),
      onAuthStateChange: (cb: AuthCallback) => {
        authListeners.add(cb);
        return { data: { subscription: { unsubscribe: () => { authListeners.delete(cb); } } } };
      },
    },
  };
  /** Auth-Ereignis wie supabase-js (TOKEN_REFRESHED, SIGNED_IN, SIGNED_OUT …) auslösen */
  const emitAuth = (event: string, session: FakeSession) => {
    auth.session = session;
    auth.error = null;
    authListeners.forEach((cb) => cb(event, session));
  };
  return { client: client as unknown as SupabaseClient, queries, channels, removed, auth, authListeners, emitAuth };
}

const ok = (data: unknown = []): Response => ({ data, error: null, status: 201 });

describe('SupabaseRemote', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => remoteProject(T, { project_code: `P${i}`, id: `id-${i}` }));

  it('pusht in Chunks per Upsert auf id und wertet fehlende Rückgaben als ok', async () => {
    const { client, queries } = fakeClient(() => ok([]));
    const remote = new SupabaseRemote(client, { chunkSize: 2 });
    const res = await remote.push('projects', rows(5));
    expect(queries.map((q) => (q.arg('upsert')![0] as unknown[]).length)).toEqual([2, 2, 1]);
    expect(queries[0]!.arg('upsert')![1]).toEqual({ onConflict: 'id' });
    expect(queries[0]!.arg('select')).toEqual(['id, updated_at, updated_by']);
    expect((queries[0]!.arg('upsert')![0] as Record<string, unknown>[])[0]!.updated_at).toBe(ISO);
    expect(res.ok.map((r) => r.id)).toEqual(['id-0', 'id-1', 'id-2', 'id-3', 'id-4']);
    expect(res.ok[0]).toEqual({ id: 'id-0', updated_at: T, updated_by: 'device-x' });
    expect(res.rejected).toEqual([]);
  });

  it('isoliert die schuldige Zeile per Einzelzeilen-Fallback', async () => {
    const dup: PostgrestErrorLike = { code: '23505', message: 'duplicate key value violates unique constraint "projects_project_code_key"' };
    const { client, queries } = fakeClient((q) => {
      const payload = q.arg('upsert')![0] as { id: string }[];
      return payload.some((r) => r.id === 'id-1') ? { data: null, error: dup, status: 409 } : ok(payload);
    });
    const res = await new SupabaseRemote(client).push('projects', rows(3));
    expect(queries).toHaveLength(4); // 1 Chunk + 3 Einzelzeilen
    expect(res.ok.map((r) => r.id)).toEqual(['id-0', 'id-2']);
    expect(res.rejected).toEqual([expect.objectContaining({ id: 'id-1', reason: 'unique_violation', column: 'project_code' })]);
  });

  it('bricht bei Netzwerk- und Anmeldefehlern ab statt Zeilen abzulehnen', async () => {
    const network = fakeClient(() => ({ data: null, error: { code: '', message: 'TypeError: fetch failed' }, status: 0 }));
    await expect(new SupabaseRemote(network.client).push('projects', rows(2))).rejects.toMatchObject({ kind: 'network' });
    const auth = fakeClient(() => ({ data: null, error: { code: 'PGRST301', message: 'JWT expired' }, status: 401 }));
    await expect(new SupabaseRemote(auth.client).pull('projects', null, 10)).rejects.toMatchObject({ kind: 'auth' });
  });

  it('zieht per Keyset sortiert nach (server_updated_at, id) und liefert den rohen Cursor', async () => {
    const server = [
      { ...toRemoteRow('projects', remoteProject(T, { id: 'a' })), user_id: 'u1', server_updated_at: '2026-10-15T08:00:01.000001+00:00' },
      { ...toRemoteRow('projects', remoteProject(T, { id: 'b' })), user_id: 'u1', server_updated_at: '2026-10-15T08:00:01.000002+00:00' },
    ];
    const { client, queries } = fakeClient(() => ok(server));
    const remote = new SupabaseRemote(client);

    const first = await remote.pull('projects', null, 500);
    expect(queries[0]!.arg('or')).toBeUndefined();
    expect(queries[0]!.calls.filter((c) => c[0] === 'order').map((c) => c[1])).toEqual(['server_updated_at', 'id']);
    expect(queries[0]!.arg('limit')).toEqual([500]);
    expect(first.rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(first.rows[0]!.updated_at).toBe(T);
    expect(first.last).toEqual({ ts: '2026-10-15T08:00:01.000002+00:00', id: 'b' });

    await remote.pull('projects', first.last, 500);
    expect(queries[1]!.arg('or')).toEqual([keysetFilter(first.last!)]);
    await remote.pull('projects', { ts: first.last!.ts, id: '' }, 500);
    expect(queries[2]!.arg('gte')).toEqual(['server_updated_at', first.last!.ts]);
  });

  it('abonniert Realtime je Tabelle gefiltert auf den Nutzer, mit eigenem Topic je Abo', async () => {
    const { client, channels, removed } = fakeClient(() => ok());
    const remote = new SupabaseRemote(client);
    const onChange = vi.fn();
    const onTimer = vi.fn();
    const onStatus = vi.fn();
    const off = remote.subscribe({ onChange, onTimer, onStatus });
    remote.subscribe({});
    await vi.waitFor(() => expect(channels).toHaveLength(2));
    const [ch] = channels;
    expect(channels[0]!.topic).not.toBe(channels[1]!.topic);
    expect(ch!.bindings.map((b) => b.filter.table)).toEqual([
      'projects', 'milestones', 'work_packages', 'tasks', 'time_logs', 'planned_blocks', 'user_settings', 'active_timer_state',
    ]);
    expect(ch!.bindings.every((b) => b.filter.filter === 'user_id=eq.u1')).toBe(true);

    ch!.status!('SUBSCRIBED');
    expect(onStatus).toHaveBeenLastCalledWith(true);
    ch!.emit('tasks', { eventType: 'UPDATE', new: { id: 't1', updated_by: 'dev-b' } });
    expect(onChange).toHaveBeenCalledWith('tasks', 'dev-b');
    ch!.emit('active_timer_state', {
      eventType: 'UPDATE', new: { user_id: 'u1', status: 'running', updated_at: '2026-10-15 08:00:00.123+00', accumulated_ms: 0 },
    });
    expect(onTimer).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1', status: 'running', updated_at: T }));

    off();
    expect(removed).toEqual([ch]);
    ch!.status!('CLOSED');
    expect(onStatus).toHaveBeenCalledTimes(1);
  });

  it('bleibt bei abgelaufenem Token ohne Netz angemeldet und meldet network statt signed_out', async () => {
    // supabase-js: Token abgelaufen, Erneuerung scheitert am Netz → session null + AuthRetryableFetchError,
    // die Sitzung bleibt aber gespeichert
    const fake = fakeClient(() => ok());
    fake.auth.session = null;
    fake.auth.error = new AuthRetryableFetchError('Failed to fetch', 0);
    const remote = new SupabaseRemote(fake.client);
    expect(await remote.isSignedIn()).toBe(true);
    await expect(remote.userId()).rejects.toMatchObject({ kind: 'network' });

    const scheduled: number[] = [];
    const timers: Timers = { setTimeout: (_fn, ms) => { scheduled.push(ms); return ms; }, clearTimeout: () => {} };
    const dev = await createTestDevice(new MemoryServer(), { name: 'supabase', clock: () => T });
    await dev.repo.create('projects', projectInput());
    const engine = new SyncEngine({ repo: dev.repo, remote, env: null, isOnline: () => true, timers });
    await engine.start();
    expect(engine.getStatus()).toMatchObject({ state: 'offline', pending: 1 });
    expect(scheduled).toContain(5_000); // Wiederholung geplant
    engine.stop();

    // Ohne gespeicherte Sitzung: wirklich abgemeldet
    fake.auth.error = null;
    expect(await remote.isSignedIn()).toBe(false);
    expect(await remote.userId()).toBeNull();
  });

  it('abonniert Realtime, sobald nach einem Offline-Start eine Sitzung entsteht', async () => {
    const fake = fakeClient(() => ok());
    fake.auth.session = null;
    fake.auth.error = new AuthRetryableFetchError('Failed to fetch', 0);
    const remote = new SupabaseRemote(fake.client);
    const onStatus = vi.fn();
    const onChange = vi.fn();
    const off = remote.subscribe({ onStatus, onChange });
    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledWith(false));
    expect(fake.channels).toHaveLength(0);

    // Wieder online: supabase-js erneuert das Token und meldet TOKEN_REFRESHED
    fake.emitAuth('TOKEN_REFRESHED', { user: { id: 'u1' } });
    expect(fake.channels).toHaveLength(1);
    const ch = fake.channels[0]!;
    expect(ch.bindings.every((b) => b.filter.filter === 'user_id=eq.u1')).toBe(true);
    ch.status!('SUBSCRIBED');
    expect(onStatus).toHaveBeenLastCalledWith(true);
    fake.emitAuth('TOKEN_REFRESHED', { user: { id: 'u1' } }); // gleiche Sitzung → kein zweiter Channel
    expect(fake.channels).toHaveLength(1);

    // Abmelden räumt den Channel ab; neue Anmeldung baut ihn für das neue Konto auf
    fake.emitAuth('SIGNED_OUT', null);
    expect(fake.removed).toEqual([ch]);
    expect(onStatus).toHaveBeenLastCalledWith(false);
    fake.emitAuth('SIGNED_IN', { user: { id: 'u2' } });
    expect(fake.channels).toHaveLength(2);
    expect(fake.channels[1]!.bindings[0]!.filter.filter).toBe('user_id=eq.u2');

    off();
    expect(fake.removed).toEqual([ch, fake.channels[1]]);
    expect(fake.authListeners.size).toBe(0);
  });

  it('liest Serverzeit, Timer und Einstellungen des angemeldeten Nutzers', async () => {
    const { client, queries } = fakeClient((q) => {
      if (q.table === 'active_timer_state' && q.arg('maybeSingle')) {
        return ok({ user_id: 'u1', status: 'paused', accumulated_ms: '60000', updated_at: ISO, segment_started_at: null });
      }
      return ok(null);
    });
    const remote = new SupabaseRemote(client);
    expect(await remote.serverNow()).toBe('2026-10-15T08:00:00.123456+00:00');
    expect(await remote.isSignedIn()).toBe(true);
    expect(await remote.getTimer()).toMatchObject({ id: 'u1', status: 'paused', accumulated_ms: 60_000, updated_at: T });
    expect(queries[0]!.arg('eq')).toEqual(['user_id', 'u1']);
    expect(await remote.getSettings()).toBeNull();

    await remote.putTimer({ id: 'local', status: 'running', updated_at: T } as ActiveTimerState);
    const upsert = queries[queries.length - 1]!.arg('upsert')!;
    expect(upsert[0]).toEqual({ status: 'running', updated_at: ISO, user_id: 'u1' });
    expect(upsert[1]).toEqual({ onConflict: 'user_id' });
  });
});
