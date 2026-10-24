/** Ansicht «Auswertung»: Woche / Monat / Jahr – Verlauf nach Projekt, Aufteilung, Protokoll */
import { useState } from 'preact/hooks';
import type { TimeLog } from '../data/types';
import { go } from '../app/router';
import { projectsById, tasksById, today } from '../app/selectors';
import { entities, workspaceData } from '../app/store';
import { prefs } from '../app/prefs';
import { ProjectChip, Seg, WORKSPACE_LABEL } from '../ui/components/bits';
import { openLogDialog } from '../ui/components/LogDialog';
import { Icon } from '../ui/Icon';
import {
  addDays, addMonths, dateKey, fmtDay, fmtDur, fmtHM, fmtTime, isoWeek, MONTHS, MONTHS_SHORT, pct,
  startOfMonth, startOfWeek, startOfYear, WD,
} from '../ui/format';

type Range = 'woche' | 'monat' | 'jahr';
type Scope = 'modus' | 'alle';

interface Bucket { label: string; from: number; to: number }

/** Zeitraum mit Versatz (0 = aktuell); Tage werden lokal weitergezählt (Sommerzeit-sicher) */
function period(range: Range, offset: number, todayKey: string): { from: Date; to: Date; label: string; buckets: Bucket[] } {
  if (range === 'woche') {
    const from = addDays(startOfWeek(todayKey), offset * 7);
    const to = addDays(from, 7);
    const last = addDays(from, 6);
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(from, i);
      return { label: WD[i]!, from: d.getTime(), to: addDays(d, 1).getTime() };
    });
    return { from, to, buckets, label: `KW ${isoWeek(from)} · ${fmtDay(from)} – ${fmtDay(last)}` };
  }
  if (range === 'monat') {
    const from = addMonths(startOfMonth(todayKey), offset);
    const to = addMonths(from, 1);
    const buckets: Bucket[] = [];
    for (let d = from; d < to; d = addDays(d, 1)) buckets.push({ label: String(d.getDate()), from: d.getTime(), to: addDays(d, 1).getTime() });
    return { from, to, buckets, label: `${MONTHS[from.getMonth()]} ${from.getFullYear()}` };
  }
  const from = new Date(startOfYear(todayKey).getFullYear() + offset, 0, 1);
  const to = new Date(from.getFullYear() + 1, 0, 1);
  const buckets = Array.from({ length: 12 }, (_, i) => {
    const m = new Date(from.getFullYear(), i, 1);
    return { label: MONTHS_SHORT[i]!, from: m.getTime(), to: addMonths(m, 1).getTime() };
  });
  return { from, to, buckets, label: String(from.getFullYear()) };
}

const STEPS = [5, 10, 15, 30, 60, 120, 180, 240, 360, 480, 720, 1440, 2880, 6000, 12000, 30000].map((m) => m * 60);
const tickLabel = (sec: number) => (sec === 0 ? '0' : sec < 3600 ? `${sec / 60} min` : `${+(sec / 3600).toFixed(1)} h`);

function Chart({ buckets, logs }: { buckets: Bucket[]; logs: TimeLog[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const cols = buckets.map((b) => {
    const per = new Map<string, number>();
    for (const l of logs) if (l.start_time >= b.from && l.start_time < b.to) {
      const k = l.project_id ?? '';
      per.set(k, (per.get(k) ?? 0) + l.duration_seconds);
    }
    const total = [...per.values()].reduce((a, v) => a + v, 0);
    return { b, per, total };
  });
  const max = Math.max(0, ...cols.map((c) => c.total));
  const step = STEPS.find((s) => (max || 3600) / s <= 4) ?? STEPS[STEPS.length - 1]!;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1; v += step) ticks.push(v);
  const labelEvery = buckets.length > 14 ? 5 : 1;
  const color = (pid: string) => projectsById.value.get(pid)?.color ?? 'var(--pc-0)';
  const name = (pid: string) => projectsById.value.get(pid)?.name ?? 'Ohne Projekt';
  const h = hover !== null ? cols[hover] : undefined;
  return (
    <div class="chart" style={{ '--n': buckets.length, position: 'relative' }}>
      <div class="chart-plot">
        {ticks.map((v) => <div key={v} class={`cg-line${v === 0 ? ' is-base' : ''}`} style={{ bottom: `${((v / top) * 100).toFixed(2)}%` }}><span>{tickLabel(v)}</span></div>)}
        <div class="chart-cols">
          {cols.map((c, i) => (
            <div
              key={i} class="cc" tabIndex={0} aria-label={`${c.b.label}: ${fmtDur(c.total)}`}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
            >
              <div class="cc-bar" style={{ height: `${((c.total / top) * 100).toFixed(2)}%` }}>
                {[...c.per.entries()].filter(([, v]) => v > 0).map(([pid, v]) => <i key={pid} style={{ flexGrow: v, background: color(pid) }} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div class="chart-x">{buckets.map((b, i) => <span key={i}>{i % labelEvery === 0 ? b.label : ''}</span>)}</div>
      {h && h.total > 0 && (
        <div class="tip" role="tooltip" style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)' }}>
          <div class="tip-title">{h.b.label} · {fmtDur(h.total)}</div>
          {[...h.per.entries()].sort((a, b) => b[1] - a[1]).map(([pid, v]) => (
            <div key={pid} class="tip-row"><i style={{ background: color(pid) }} />{name(pid)} <b class="mono">{fmtHM(v)}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Auswertung() {
  const [range, setRange] = useState<Range>('woche');
  const [offset, setOffset] = useState(0);
  const [scope, setScope] = useState<Scope>('modus');
  const t = today.value;
  const p = period(range, offset, t);
  const source = scope === 'modus' ? workspaceData.value.time_logs : entities.value.time_logs;
  const inRange = (from: number, to: number) => source.filter((l) => l.start_time >= from && l.start_time < to);
  const logs = inRange(p.from.getTime(), p.to.getTime()).sort((a, b) => b.start_time - a.start_time);
  const prev = period(range, offset - 1, t);
  const prevTotal = inRange(prev.from.getTime(), prev.to.getTime()).reduce((a, l) => a + l.duration_seconds, 0);
  const total = logs.reduce((a, l) => a + l.duration_seconds, 0);
  const pomos = logs.filter((l) => l.counts_as_pomodoro).length;
  const activeDays = new Set(logs.map((l) => dateKey(l.start_time))).size;

  const byProject = new Map<string, number>();
  for (const l of logs) byProject.set(l.project_id ?? '', (byProject.get(l.project_id ?? '') ?? 0) + l.duration_seconds);
  const projects = [...byProject.entries()].sort((a, b) => b[1] - a[1]);
  const maxProject = projects[0]?.[1] ?? 0;

  const days = new Map<string, TimeLog[]>();
  for (const l of logs) {
    const k = dateKey(l.start_time);
    days.set(k, [...(days.get(k) ?? []), l]);
  }
  const diff = total - prevTotal;
  const MODE = { pomodoro: 'Pomodoro', stopwatch: 'Stechuhr', manual: 'Nachgetragen' } as const;

  return (
    <>
      <div class="view-head">
        <div>
          <p class="eyebrow">{scope === 'modus' ? WORKSPACE_LABEL[prefs.value.workspace] : 'Lernen + Arbeit'}</p>
          <h1>Auswertung</h1>
        </div>
        <div class="head-actions">
          <button type="button" class="btn btn-ghost" onClick={() => openLogDialog(null)}><Icon name="plus" />Zeit nachtragen</button>
        </div>
      </div>

      <div class="filters" style={{ marginBottom: '16px' }}>
        <Seg label="Zeitraum" value={range} onChange={(r) => { setRange(r); setOffset(0); }}
          options={[{ value: 'woche', label: 'Woche' }, { value: 'monat', label: 'Monat' }, { value: 'jahr', label: 'Jahr' }]} />
        <span class="pager">
          <button type="button" class="icon-btn" aria-label="Vorheriger Zeitraum" onClick={() => setOffset(offset - 1)}><Icon name="chevron-left" /></button>
          <button type="button" class="btn btn-ghost btn-sm" onClick={() => setOffset(0)} disabled={offset === 0}>Heute</button>
          <button type="button" class="icon-btn" aria-label="Nächster Zeitraum" onClick={() => setOffset(offset + 1)}><Icon name="chevron-right" /></button>
        </span>
        <b>{p.label}</b>
        <Seg label="Umfang" value={scope} onChange={setScope}
          options={[{ value: 'modus', label: 'Dieser Modus' }, { value: 'alle', label: 'Lernen + Arbeit' }]} />
      </div>

      <div class="tiles">
        <div class="tile tile-hero">
          <span class="tile-label">Erfasst</span>
          <span class="tile-value">{fmtDur(total)}</span>
          <span class={`tile-sub${diff > 0 ? ' is-up' : ''}`}>
            {prevTotal ? `${diff >= 0 ? '+' : '−'}${fmtDur(Math.abs(diff))} zur Vorperiode` : 'Vorperiode ohne Einträge'}
          </span>
        </div>
        <div class="tile"><span class="tile-label">Pomodoros</span><span class="tile-value">{pomos}</span></div>
        <div class="tile">
          <span class="tile-label">Ø pro aktivem Tag</span>
          <span class="tile-value">{fmtDur(activeDays ? total / activeDays : 0)}</span>
          <span class="tile-sub">{activeDays} {activeDays === 1 ? 'Tag' : 'Tage'} mit Einträgen</span>
        </div>
      </div>

      <div class="card" style={{ marginBottom: '20px' }}>
        <div class="card-head"><h2>Verlauf</h2></div>
        {total > 0 ? <Chart buckets={p.buckets} logs={logs} /> : <p class="empty-line">Keine Einträge in diesem Zeitraum.</p>}
      </div>

      <div class="two-col">
        <div class="card">
          <div class="card-head"><h2>Nach Projekt</h2></div>
          {projects.length ? (
            <ul class="pb-list">
              {projects.map(([pid, sec]) => {
                const pr = projectsById.value.get(pid);
                return (
                  <li key={pid} class="pb-row">
                    {pr ? <button type="button" class="pb-name link" onClick={() => go('projekte', pid)}>{pr.name}</button> : <span class="pb-name">Ohne Projekt</span>}
                    <span class="pb-bar"><i style={{ width: `${(sec / maxProject) * 100}%`, background: pr?.color ?? 'var(--pc-0)' }} /></span>
                    <span class="pb-val mono">{fmtHM(sec)}</span>
                    <span class="pb-pct mono muted">{pct(sec, total)} %</span>
                  </li>
                );
              })}
            </ul>
          ) : <p class="empty-line">Noch nichts erfasst.</p>}
        </div>

        <div class="card">
          <div class="card-head"><h2>Protokoll</h2></div>
          {days.size === 0 && <p class="empty-line">Keine Einträge.</p>}
          {[...days.entries()].slice(0, 31).map(([k, list]) => (
            <div key={k}>
              <h3 class="mini-title">{fmtDay(k)} · {fmtDur(list.reduce((a, l) => a + l.duration_seconds, 0))}</h3>
              <ul class="log-list">
                {list.map((l) => {
                  const task = l.task_id ? tasksById.value.get(l.task_id) : undefined;
                  return (
                    <li key={l.id}>
                      <button type="button" class="log-item" onClick={() => openLogDialog(l)} style={{ width: '100%' }}>
                        <span class="mono">{fmtTime(l.start_time)}–{fmtTime(l.end_time)}</span>
                        <span class="log-title">{task?.title ?? (l.comment || MODE[l.mode])}</span>
                        <ProjectChip project={l.project_id ? projectsById.value.get(l.project_id) : undefined} />
                        <span class="mono">{fmtHM(l.duration_seconds)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
