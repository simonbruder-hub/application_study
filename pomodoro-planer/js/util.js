/* Hilfsfunktionen: Datum, Formatierung, Escaping, IDs */
'use strict';

const U = (() => {
  const pad2 = (n) => String(n).padStart(2, '0');

  const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const WD_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const MONTHS_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];

  const toDate = (d) => (d instanceof Date ? new Date(d.getTime()) : typeof d === 'string' ? parseKey(d) : new Date(d));

  /** 'YYYY-MM-DD' in lokaler Zeit */
  const dateKey = (d = new Date()) => {
    const x = toDate(d);
    return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
  };
  const parseKey = (k) => {
    const [y, m, d] = String(k).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };
  const todayKey = () => dateKey(new Date());
  const addDays = (d, n) => { const x = toDate(d); x.setDate(x.getDate() + n); return x; };
  const addMonths = (d, n) => { const x = toDate(d); x.setDate(1); x.setMonth(x.getMonth() + n); return x; };
  const startOfDay = (d) => { const x = toDate(d); x.setHours(0, 0, 0, 0); return x; };
  /** Wochenstart Montag */
  const startOfWeek = (d) => { const x = startOfDay(d); x.setDate(x.getDate() - wdIndex(x)); return x; };
  const startOfMonth = (d) => { const x = toDate(d); return new Date(x.getFullYear(), x.getMonth(), 1); };
  const startOfYear = (d) => new Date(toDate(d).getFullYear(), 0, 1);
  const wdIndex = (d) => (toDate(d).getDay() + 6) % 7;
  const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
  const isoWeek = (d) => {
    const x = toDate(d);
    const t = new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 86400000 + 1) / 7);
  };
  const monthKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; };

  /** Dauer in Sekunden → "1 h 05 min" / "45 min" */
  const fmtDur = (sec) => {
    const m = Math.round((sec || 0) / 60);
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h === 0) return `${r} min`;
    return r ? `${h} h ${pad2(r)} min` : `${h} h`;
  };
  /** kompakt: "1:05" */
  const fmtHM = (sec) => {
    const m = Math.round((sec || 0) / 60);
    return `${Math.floor(m / 60)}:${pad2(m % 60)}`;
  };
  /** Countdown: "24:59" bzw. "1:29:59" */
  const fmtClock = (sec) => {
    const s = Math.max(0, Math.ceil(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return h ? `${h}:${pad2(m)}:${pad2(r)}` : `${pad2(m)}:${pad2(r)}`;
  };
  const fmtTime = (ms) => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  /** "14.10.2026" */
  const fmtDate = (d) => { const x = toDate(d); return `${pad2(x.getDate())}.${pad2(x.getMonth() + 1)}.${x.getFullYear()}`; };
  /** "Mi, 14.10." */
  const fmtDay = (d) => { const x = toDate(d); return `${WD[wdIndex(x)]}, ${pad2(x.getDate())}.${pad2(x.getMonth() + 1)}.`; };
  /** "Mittwoch, 14. Oktober 2026" */
  const fmtDayLong = (d) => { const x = toDate(d); return `${WD_LONG[wdIndex(x)]}, ${x.getDate()}. ${MONTHS[x.getMonth()]} ${x.getFullYear()}`; };
  /** "Heute" / "Morgen" / "Gestern" / "Mi, 14.10." */
  const relDay = (key) => {
    const diff = daysBetween(new Date(), parseKey(key));
    if (diff === 0) return 'Heute';
    if (diff === 1) return 'Morgen';
    if (diff === -1) return 'Gestern';
    return fmtDay(key);
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (f(x) || 0), 0);
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

  /** Deterministischer Zufall für Beispieldaten */
  const rng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /** Lokale Uhrzeit "HH:MM" am Tag key → ms */
  const atTime = (key, hhmm) => {
    const d = parseKey(key);
    const [h, m] = String(hhmm || '00:00').split(':').map(Number);
    d.setHours(h || 0, m || 0, 0, 0);
    return d.getTime();
  };

  const isAndroid = /Android/i.test(navigator.userAgent || '');
  const isTouch = matchMedia('(pointer: coarse)').matches;

  return {
    pad2, WD, WD_LONG, MONTHS, MONTHS_SHORT, dateKey, parseKey, todayKey, addDays, addMonths, startOfDay,
    startOfWeek, startOfMonth, startOfYear, wdIndex, daysBetween, isoWeek, monthKey, fmtDur, fmtHM, fmtClock,
    fmtTime, fmtDate, fmtDay, fmtDayLong, relDay, esc, uid, clamp, sum, debounce, clone, pct, rng, atTime,
    isAndroid, isTouch,
  };
})();
