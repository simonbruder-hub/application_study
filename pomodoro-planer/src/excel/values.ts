/**
 * Robuste Zellwerte für den Excel-Import (und Formatierer für den Export).
 *
 * Excel liefert je nach Eingabe, Ländereinstellung und Zellformat sehr unterschiedliche Werte:
 * echte Datumszellen (ExcelJS: Date-Objekt), Seriennummern, Text in mehreren Schreibweisen,
 * RichText, Hyperlinks oder Formelergebnisse. Die Parser hier führen alles auf die Werte des
 * Domänenmodells zurück und liefern bei Unsinn eine deutsche Fehlermeldung statt zu raten.
 *
 * Datum/Uhrzeit aus Date-Objekten: ExcelJS bildet die Wanduhrzeit einer Zelle auf die
 * UTC-Bestandteile des Date-Objekts ab (Seriennummer 0 = 1899-12-30T00:00Z). Deshalb werden
 * Date-Objekte hier über getUTC… gelesen – unabhängig von der Zeitzone der Laufzeitumgebung.
 *
 * Dieses Modul lädt ExcelJS nicht.
 */
import type {
  MilestoneStatus, ProjectStatus, TaskPriority, TaskStatus, TimeLogMode, Workspace,
} from '../data/types';
import { ENUM_VALUES, type EnumKind } from './schema';

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = (error: string): Parsed<never> => ({ ok: false, error });

/** Auf einfache Werte reduzierter Zellinhalt; leere Zellen und Fehlerwerte sind null. */
export type CellPrimitive = string | number | boolean | Date | null;

const DAY_MS = 86_400_000;
const DAY_SECONDS = 86_400;
/** Excel-Seriennummer 0 entspricht 1899-12-30 (gilt ab März 1900, wie bei ExcelJS) */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
/** 9999-12-31 – grösste Seriennummer, die Excel kennt */
const MAX_SERIAL = 2_958_465;

/* ---------- Zellinhalt ---------- */

/**
 * ExcelJS-Zellwert → einfacher Wert. Löst RichText, Hyperlinks und Formelergebnisse auf,
 * trimmt Text und behandelt leeren Text, Fehlerwerte (#NV, #BEZUG! …) und NaN als leer.
 */
export function cellPrimitive(v: unknown): CellPrimitive {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? null : t;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return cellPrimitive(o.richText.map((r: unknown) => String((r as { text?: unknown })?.text ?? '')).join(''));
    }
    if ('formula' in o || 'sharedFormula' in o) return cellPrimitive(o.result);
    if ('hyperlink' in o || 'text' in o) return cellPrimitive(o.text);
  }
  return null;
}

/** Zellinhalt als getrimmter Text; leer → null */
export function cellText(v: unknown): string | null {
  const p = cellPrimitive(v);
  if (p === null) return null;
  if (typeof p === 'string') return p;
  if (typeof p === 'boolean') return p ? 'TRUE' : 'FALSE';
  if (typeof p === 'number') return String(p);
  // Von Excel automatisch in ein Datum verwandelter Text: als JJJJ-MM-TT zurückgeben
  const time = utcSecondsOfDay(p);
  return time === 0 ? utcDateKey(p) : `${utcDateKey(p)} ${formatTime(time)}`;
}

/** Kurzdarstellung eines Zellwerts für Fehlermeldungen */
export function describeCell(v: unknown): string {
  const p = cellPrimitive(v);
  if (p instanceof Date) return cellText(p) ?? '';
  return p === null ? '' : String(p);
}

/* ---------- Datum ---------- */

const pad2 = (n: number) => String(n).padStart(2, '0');

function dateKey(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

function utcDateKey(d: Date): string {
  return dateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function utcSecondsOfDay(d: Date): number {
  const ms = ((d.getTime() % DAY_MS) + DAY_MS) % DAY_MS;
  return Math.round(ms / 1000) % DAY_SECONDS;
}

/** Prüft ein Kalenderdatum (z. B. kein 31. Februar) und liefert 'YYYY-MM-DD' oder null */
function validDate(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || y < 1900 || y > 9999) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return dateKey(y, m, d);
}

/** Excel-Seriennummer → 'YYYY-MM-DD' (Nachkommastellen = Uhrzeit werden ignoriert) */
export function serialToDateKey(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial >= MAX_SERIAL + 1) return null;
  return utcDateKey(new Date(EXCEL_EPOCH_MS + Math.floor(serial) * DAY_MS));
}

const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/;
const DOT_DATE = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{2}|\d{4})\.?$/;

/**
 * Datum → 'YYYY-MM-DD' oder null (leer). Akzeptiert Date-Objekte, Excel-Seriennummern,
 * 'YYYY-MM-DD', 'DD.MM.YYYY' und 'D.M.YY' (zweistellige Jahre: 00–69 → 20xx, 70–99 → 19xx).
 */
export function parseDate(v: unknown): Parsed<string | null> {
  const p = cellPrimitive(v);
  if (p === null) return ok(null);
  const invalid = () => fail(`Ungültiges Datum «${describeCell(p)}» (erwartet JJJJ-MM-TT oder TT.MM.JJJJ)`);
  if (p instanceof Date) {
    const key = validDate(p.getUTCFullYear(), p.getUTCMonth() + 1, p.getUTCDate());
    return key ? ok(key) : invalid();
  }
  if (typeof p === 'number') {
    const key = serialToDateKey(p);
    return key ? ok(key) : invalid();
  }
  if (typeof p !== 'string') return invalid();
  let m = ISO_DATE.exec(p);
  if (m) {
    const key = validDate(Number(m[1]), Number(m[2]), Number(m[3]));
    return key ? ok(key) : invalid();
  }
  m = DOT_DATE.exec(p);
  if (m) {
    let y = Number(m[3]);
    if (m[3]!.length === 2) y += y < 70 ? 2000 : 1900;
    const key = validDate(y, Number(m[2]), Number(m[1]));
    return key ? ok(key) : invalid();
  }
  return invalid();
}

/* ---------- Uhrzeit ---------- */

const CLOCK_TIME = /^(\d{1,2})(?:\s*[:.,h]\s*(\d{2}))?(?::(\d{2}))?\s*(?:uhr|h)?$/i;
const DATETIME_TEXT = /^\d{4}-\d{1,2}-\d{1,2}[T\s]+(.+)$/;

function clockSeconds(h: number, m: number, s: number): number | null {
  if (m > 59 || s > 59) return null;
  if (h === 24 && m === 0 && s === 0) return DAY_SECONDS;
  if (h > 23) return null;
  return h * 3600 + m * 60 + s;
}

/**
 * Uhrzeit → Sekunden seit Mitternacht (0 … 86 400) oder null (leer). Akzeptiert Date-Objekte
 * (ExcelJS-Basis 1899-12-30, auch vollständige Datum-Uhrzeit-Werte), Tagesbruchteile (0.5 = 12:00),
 * Datum-Uhrzeit-Seriennummern, 'HH:MM', 'HH:MM:SS', 'H.MM', '9 Uhr' sowie Zahlen wie 9.3 (= 9.30 Uhr).
 */
export function parseTime(v: unknown): Parsed<number | null> {
  const p = cellPrimitive(v);
  if (p === null) return ok(null);
  const invalid = () => fail(`Ungültige Uhrzeit «${describeCell(p)}» (erwartet HH:MM)`);
  if (p instanceof Date) return ok(utcSecondsOfDay(p));
  if (typeof p === 'number') {
    if (p < 0) return invalid();
    // Tagesbruchteil (Excel-Uhrzeit)
    if (p < 1) return ok(Math.round(p * DAY_SECONDS));
    // 9.3 / 9.30 als Zahl eingetippt = 9:30 Uhr
    if (p < 24) {
      const h = Math.floor(p);
      const mm = Math.round((p - h) * 100);
      const s = clockSeconds(h, mm, 0);
      return s === null ? invalid() : ok(s);
    }
    // Datum mit Uhrzeit als Seriennummer: nur der Nachkommaanteil zählt
    return ok(Math.round((p - Math.floor(p)) * DAY_SECONDS) % DAY_SECONDS);
  }
  if (typeof p !== 'string') return invalid();
  const text = DATETIME_TEXT.exec(p)?.[1]?.trim() ?? p;
  const m = CLOCK_TIME.exec(text);
  if (!m) return invalid();
  const s = clockSeconds(Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0));
  return s === null ? invalid() : ok(s);
}

/** Sekunden seit Mitternacht → 'HH:MM' (Sekunden werden abgeschnitten) */
export function formatTime(secondsOfDay: number): string {
  const total = Math.floor(secondsOfDay / 60);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/* ---------- Lokale Zeitpunkte ---------- */

/** Epoch-ms → lokales Kalenderdatum 'YYYY-MM-DD' */
export function localDateOf(ms: number): string {
  const d = new Date(ms);
  return dateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Epoch-ms → lokale Uhrzeit in Sekunden seit Mitternacht */
export function localSecondsOf(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

/**
 * Lokaler Zeitpunkt aus Datum und Uhrzeit (Epoch-ms). `addDays` verschiebt um ganze Kalendertage
 * (z. B. Endzeit nach Mitternacht) – sommerzeitsicher über den lokalen Date-Konstruktor.
 */
export function localTimestamp(date: string, secondsOfDay: number, addDays = 0): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const h = Math.floor(secondsOfDay / 3600);
  const min = Math.floor((secondsOfDay % 3600) / 60);
  const s = secondsOfDay % 60;
  return new Date(y, m - 1, d + addDays, h, min, s).getTime();
}

/* ---------- Zahlen ---------- */

/**
 * Zahl oder null (leer). Akzeptiert Zahlen und Text mit Dezimalkomma oder -punkt ('12,5', '12.5'),
 * Tausendertrennzeichen (1'234,5 · 1.234,5 · 1,234.5) und Leerzeichen.
 */
export function parseNumber(v: unknown): Parsed<number | null> {
  const p = cellPrimitive(v);
  if (p === null) return ok(null);
  if (typeof p === 'number') return ok(p);
  const invalid = () => fail(`Ungültige Zahl «${describeCell(p)}»`);
  if (typeof p !== 'string') return invalid();
  let t = p.replace(/[\s'’ ]/g, '');
  if (!/^[+-]?[\d.,]*\d[\d.,]*$/.test(t)) return invalid();
  const comma = t.lastIndexOf(',');
  const dot = t.lastIndexOf('.');
  const count = (ch: string) => t.split(ch).length - 1;
  if (comma >= 0 && dot >= 0) {
    // Das zuletzt stehende Zeichen ist das Dezimaltrennzeichen, das andere trennt Tausender
    const thousands = comma > dot ? '.' : ',';
    t = t.split(thousands).join('').replace(',', '.');
  } else if (comma >= 0) {
    t = count(',') > 1 ? t.split(',').join('') : t.replace(',', '.');
  } else if (dot >= 0 && count('.') > 1) {
    t = t.split('.').join('');
  }
  const n = Number(t);
  return Number.isFinite(n) ? ok(n) : invalid();
}

/* ---------- Löschen-Markierung ---------- */

const TRUE_WORDS = new Set(['true', 'wahr', 'ja', 'yes', '1', 'x']);
const FALSE_WORDS = new Set(['false', 'falsch', 'nein', 'no', '0', '-']);

/** Löschen-Markierung: TRUE/1/ja/x … → true; leer/FALSE/0/nein … → false */
export function parseBool(v: unknown): Parsed<boolean> {
  const p = cellPrimitive(v);
  if (p === null) return ok(false);
  if (typeof p === 'boolean') return ok(p);
  if (typeof p === 'number') {
    if (p === 1) return ok(true);
    if (p === 0) return ok(false);
  }
  if (typeof p === 'string') {
    const t = p.toLowerCase();
    if (TRUE_WORDS.has(t)) return ok(true);
    if (FALSE_WORDS.has(t)) return ok(false);
  }
  return fail(`Ungültiger Wert «${describeCell(p)}» für Loeschen (erlaubt: TRUE/FALSE, ja/nein, 1/0)`);
}

/* ---------- Aufzählungen inkl. deutscher Begriffe ---------- */

export interface EnumTypes {
  workspace: Workspace;
  projectStatus: ProjectStatus;
  milestoneStatus: MilestoneStatus;
  taskStatus: TaskStatus;
  priority: TaskPriority;
  timeLogMode: TimeLogMode;
}

/** Deutsche (und englische) Alternativbegriffe je kanonischem Wert */
const ENUM_ALIASES: { [K in EnumKind]: Record<EnumTypes[K], readonly string[]> } = {
  workspace: {
    work: ['arbeit', 'arbeiten', 'arbeitsmodus', 'beruf', 'job'],
    study: ['lernen', 'studium', 'lernmodus', 'lern', 'schule', 'uni'],
  },
  projectStatus: {
    active: ['aktiv'],
    paused: ['pausiert', 'pause'],
    archived: ['archiviert', 'archiv'],
  },
  milestoneStatus: {
    open: ['offen'],
    achieved: ['erreicht', 'erledigt', 'abgeschlossen'],
    delayed: ['verzögert', 'verspätet', 'überfällig'],
  },
  taskStatus: {
    todo: ['to do', 'offen', 'open', 'neu'],
    in_progress: ['in progress', 'in arbeit', 'laufend', 'in bearbeitung', 'begonnen', 'doing'],
    done: ['erledigt', 'fertig', 'abgeschlossen'],
  },
  priority: {
    low: ['niedrig', 'tief', 'gering'],
    medium: ['mittel', 'normal'],
    high: ['hoch', 'wichtig', 'dringend'],
  },
  timeLogMode: {
    pomodoro: ['tomate'],
    stopwatch: ['stoppuhr', 'stechuhr'],
    manual: ['manuell', 'nachtrag', 'nachgetragen'],
  },
};

const ENUM_LABELS: Record<EnumKind, string> = {
  workspace: 'Modus',
  projectStatus: 'Status',
  milestoneStatus: 'Status',
  taskStatus: 'Status',
  priority: 'Prioritaet',
  timeLogMode: 'Typ',
};

/** Vergleichsschlüssel: klein, Umlaute ausgeschrieben, Trenner als einfaches Leerzeichen */
function enumKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\s_\-.]+/g, ' ')
    .trim();
}

const ENUM_LOOKUP = new Map<EnumKind, Map<string, string>>();
for (const kind of Object.keys(ENUM_ALIASES) as EnumKind[]) {
  const map = new Map<string, string>();
  const aliases = ENUM_ALIASES[kind] as Record<string, readonly string[]>;
  for (const value of ENUM_VALUES[kind]) {
    map.set(enumKey(value), value);
    map.set(enumKey(value).replace(/ /g, ''), value);
    for (const alias of aliases[value] ?? []) map.set(enumKey(alias), value);
  }
  ENUM_LOOKUP.set(kind, map);
}

/** Aufzählungswert (kanonisch oder deutscher Begriff) → kanonischer Wert oder null (leer) */
export function parseEnum<K extends EnumKind>(v: unknown, kind: K): Parsed<EnumTypes[K] | null> {
  const text = cellText(v);
  if (text === null) return ok(null);
  const hit = ENUM_LOOKUP.get(kind)!.get(enumKey(text));
  if (hit) return ok(hit as EnumTypes[K]);
  return fail(`Ungültiger Wert «${text}» für ${ENUM_LABELS[kind]} (erlaubt: ${ENUM_VALUES[kind].join(', ')})`);
}

/* ---------- Codes, IDs, Farben ---------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[A-Za-z0-9._-]{1,32}$/;

export function isUuid(text: string): boolean {
  return UUID.test(text);
}

/** Lesbarer Code: 1–32 Zeichen A–Z, a–z, 0–9, '.', '_', '-' */
export function isValidCode(text: string): boolean {
  return CODE.test(text);
}

/** Vergleichsschlüssel für Codes (ohne Beachtung der Gross-/Kleinschreibung) */
export function codeKey(code: string): string {
  return code.trim().toLowerCase();
}

/** Gleicher Code ohne Beachtung der Gross-/Kleinschreibung */
export function sameCode(a: string | null | undefined, b: string | null | undefined): boolean {
  return typeof a === 'string' && typeof b === 'string' && a.trim() !== '' && codeKey(a) === codeKey(b);
}

/**
 * Lesbarer Code aus einem Namen, z. B. "Mathematik Übungen" → "MATHEMATIK-U" (höchstens 12 Zeichen
 * plus Zähler). `taken` enthält bereits vergebene Codes als codeKey; bei Kollision wird "-2", "-3" … angehängt.
 */
export function codeFromName(name: string, taken: ReadonlySet<string>): string {
  const base = name
    .toUpperCase()
    .replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 12)
    .replace(/-+$/, '') || 'PROJEKT';
  let code = base;
  for (let n = 2; taken.has(codeKey(code)); n++) code = `${base}-${n}`;
  return code;
}

/** Text-Vergleichsschlüssel für Titel-Referenzen (getrimmt, klein, Leerraum vereinheitlicht) */
export function titleKey(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Farbe '#RGB', '#RRGGBB' oder 'RRGGBB' → '#rrggbb'; leer → null */
export function parseColor(v: unknown): Parsed<string | null> {
  const text = cellText(v);
  if (text === null) return ok(null);
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (!m) return fail(`Ungültige Farbe «${text}» (erwartet #RRGGBB)`);
  const hex = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return ok(`#${hex.toLowerCase()}`);
}

/** Kaufmännisch auf `digits` Nachkommastellen runden (robust gegen 1.005-Darstellungsfehler) */
export function roundTo(x: number, digits: number): number {
  const f = 10 ** digits;
  const r = (Math.sign(x) * Math.round(Math.abs(x) * f + 1e-7)) / f;
  return r === 0 ? 0 : r;
}
