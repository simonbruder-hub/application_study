/** Datum und Formatierung (de-CH), Kalenderdaten als 'YYYY-MM-DD' in lokaler Zeit */

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
export const WD_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] as const;
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'] as const;
export const MONTHS_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'] as const;

type DateLike = Date | string | number;

export function parseKey(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y ?? 1970, (m || 1) - 1, d || 1);
}

export const toDate = (d: DateLike): Date =>
  d instanceof Date ? new Date(d.getTime()) : typeof d === 'string' ? parseKey(d) : new Date(d);

export function dateKey(d: DateLike = new Date()): string {
  const x = toDate(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}
export const todayKey = (): string => dateKey(new Date());

export function addDays(d: DateLike, n: number): Date {
  const x = toDate(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function addMonths(d: DateLike, n: number): Date {
  const x = toDate(d);
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  return x;
}
export function startOfDay(d: DateLike): Date {
  const x = toDate(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export const wdIndex = (d: DateLike): number => (toDate(d).getDay() + 6) % 7;
/** Wochenstart Montag */
export function startOfWeek(d: DateLike): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - wdIndex(x));
  return x;
}
export const startOfMonth = (d: DateLike): Date => { const x = toDate(d); return new Date(x.getFullYear(), x.getMonth(), 1); };
export const startOfYear = (d: DateLike): Date => new Date(toDate(d).getFullYear(), 0, 1);
export const daysBetween = (a: DateLike, b: DateLike): number =>
  Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);

export function isoWeek(d: DateLike): number {
  const x = toDate(d);
  const t = new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7);
}

/** Dauer in Sekunden → "1 h 05 min" / "45 min" */
export function fmtDur(sec: number): string {
  const m = Math.round((sec || 0) / 60);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r ? `${h} h ${pad2(r)} min` : `${h} h`;
}
/** kompakt: "1:05" */
export function fmtHM(sec: number): string {
  const m = Math.round((sec || 0) / 60);
  return `${Math.floor(m / 60)}:${pad2(m % 60)}`;
}
/** Stunden mit einer Nachkommastelle: "12,5 h" */
export const fmtHours = (h: number): string => `${(Math.round(h * 10) / 10).toLocaleString('de-CH')} h`;
/** Uhr: "24:59" bzw. "1:29:59"; aufgerundet (Countdown) oder abgerundet (Stechuhr) */
export function fmtClock(sec: number, round: 'up' | 'down' = 'up'): string {
  const s = Math.max(0, round === 'up' ? Math.ceil(sec) : Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${pad2(m)}:${pad2(r)}` : `${pad2(m)}:${pad2(r)}`;
}
export const fmtTime = (ms: number): string => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
/** "14.10.2026" */
export const fmtDate = (d: DateLike): string => { const x = toDate(d); return `${pad2(x.getDate())}.${pad2(x.getMonth() + 1)}.${x.getFullYear()}`; };
/** "Mi, 14.10." */
export const fmtDay = (d: DateLike): string => { const x = toDate(d); return `${WD[wdIndex(x)]}, ${pad2(x.getDate())}.${pad2(x.getMonth() + 1)}.`; };
/** "Mittwoch, 14. Oktober 2026" */
export const fmtDayLong = (d: DateLike): string => {
  const x = toDate(d);
  return `${WD_LONG[wdIndex(x)]}, ${x.getDate()}. ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
};
/** "Heute" / "Morgen" / "Gestern" / "Mi, 14.10." */
export function relDay(key: string): string {
  const diff = daysBetween(new Date(), parseKey(key));
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  return fmtDay(key);
}
/** "vor 3 min" / "um 14:05" / "am 12.10." */
export function fmtAgo(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  if (diff < 45_000) return 'gerade eben';
  if (diff < 3_600_000) return `vor ${Math.round(diff / 60_000)} min`;
  if (dateKey(ms) === dateKey(now)) return `um ${fmtTime(ms)}`;
  return `am ${fmtDay(ms)} ${fmtTime(ms)}`;
}

/** Lokale Uhrzeit "HH:MM" am Tag key → Epoch-ms */
export function atTime(key: string, hhmm: string): number {
  const d = parseKey(key);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const sum = <T>(arr: readonly T[], f: (x: T) => number): number => arr.reduce((a, x) => a + (f(x) || 0), 0);
export const pct = (a: number, b: number): number => (b > 0 ? Math.round((a / b) * 100) : 0);
export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export const isTouch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
