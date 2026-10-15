import { describe, expect, it } from 'vitest';
import {
  cellPrimitive, cellText, codeFromName, isValidCode, localTimestamp, parseBool, parseColor, parseDate, parseEnum,
  parseNumber, parseTime, roundTo,
} from './values';

const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T | string => (r.ok ? r.value : `Fehler: ${r.error}`);

describe('cellPrimitive / cellText', () => {
  it('löst RichText, Hyperlinks und Formelergebnisse auf und trimmt', () => {
    expect(cellText({ richText: [{ text: ' Übungs' }, { text: 'blatt ' }] })).toBe('Übungsblatt');
    expect(cellText({ text: 'Link', hyperlink: 'https://example.org' })).toBe('Link');
    expect(cellPrimitive({ formula: 'A1*2', result: 4 })).toBe(4);
    expect(cellPrimitive({ sharedFormula: 'A1', result: 'x' })).toBe('x');
    expect(cellPrimitive('   ')).toBeNull();
    expect(cellPrimitive({ error: '#N/A' })).toBeNull();
    expect(cellPrimitive(Number.NaN)).toBeNull();
    expect(cellText(true)).toBe('TRUE');
    expect(cellText(12.5)).toBe('12.5');
    expect(cellText(new Date(Date.UTC(2026, 9, 14)))).toBe('2026-10-14');
  });
});

describe('parseDate', () => {
  it.each([
    [new Date(Date.UTC(2026, 9, 14)), '2026-10-14'],
    [new Date(Date.UTC(2026, 9, 14, 23, 59)), '2026-10-14'],
    [46309, '2026-10-14'],
    [46309.75, '2026-10-14'],
    ['2026-10-14', '2026-10-14'],
    ['2026-1-5', '2026-01-05'],
    ['14.10.2026', '2026-10-14'],
    ['5.1.26', '2026-01-05'],
    ['1.1.99', '1999-01-01'],
    [{ formula: 'TODAY()', result: new Date(Date.UTC(2026, 9, 15)) }, '2026-10-15'],
    [null, null],
    ['', null],
  ])('%s → %s', (input, expected) => {
    expect(value(parseDate(input))).toBe(expected);
  });

  it.each(['2026-02-30', '31.04.2026', 'morgen', 0, true])('weist %s zurück', (input) => {
    const r = parseDate(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Ungültiges Datum «.*» \(erwartet JJJJ-MM-TT oder TT\.MM\.JJJJ\)$/);
  });
});

describe('parseTime', () => {
  it.each([
    [new Date(Date.UTC(1899, 11, 30, 9, 30)), 9 * 3600 + 1800],
    [new Date(Date.UTC(2026, 9, 14, 17, 45)), 17 * 3600 + 2700],
    [0.5, 12 * 3600],
    [0.375, 9 * 3600],
    [46309.75, 18 * 3600],
    ['09:30', 9 * 3600 + 1800],
    ['9:30', 9 * 3600 + 1800],
    ['9.30', 9 * 3600 + 1800],
    ['7:05:30', 7 * 3600 + 330],
    ['14 Uhr', 14 * 3600],
    ['2026-10-14 08:15', 8 * 3600 + 900],
    [9.3, 9 * 3600 + 1800],
    ['24:00', 24 * 3600],
    [null, null],
  ])('%s → %s Sekunden', (input, expected) => {
    expect(value(parseTime(input))).toBe(expected);
  });

  it.each(['25:00', '9:75', 'mittags', -0.5])('weist %s zurück', (input) => {
    expect(parseTime(input).ok).toBe(false);
  });
});

describe('parseNumber', () => {
  it.each([
    ['12,5', 12.5],
    ['12.5', 12.5],
    [12.5, 12.5],
    [' 3 ', 3],
    ["1'234,5", 1234.5],
    ['1.234,5', 1234.5],
    ['1,234.5', 1234.5],
    ['-2', -2],
    ['', null],
    [null, null],
  ])('%s → %s', (input, expected) => {
    expect(value(parseNumber(input))).toBe(expected);
  });

  it('weist Text ohne Zahl zurück', () => {
    expect(value(parseNumber('zwölf'))).toBe('Fehler: Ungültige Zahl «zwölf»');
  });
});

describe('parseBool (Loeschen)', () => {
  it.each([true, 'TRUE', 'true', 'Wahr', 'ja', 'JA', 'yes', '1', 1, 'x', 'X'])('%s → true', (input) => {
    expect(value(parseBool(input))).toBe(true);
  });
  it.each([false, 'FALSE', 'falsch', 'nein', '0', 0, '', null, undefined])('%s → false', (input) => {
    expect(value(parseBool(input))).toBe(false);
  });
  it('weist andere Werte zurück', () => {
    expect(value(parseBool('vielleicht'))).toBe(
      'Fehler: Ungültiger Wert «vielleicht» für Loeschen (erlaubt: TRUE/FALSE, ja/nein, 1/0)',
    );
  });
});

describe('parseEnum mit deutschen Begriffen', () => {
  it('Modus', () => {
    expect(value(parseEnum('lernen', 'workspace'))).toBe('study');
    expect(value(parseEnum('Studium', 'workspace'))).toBe('study');
    expect(value(parseEnum('Arbeit', 'workspace'))).toBe('work');
    expect(value(parseEnum('WORK', 'workspace'))).toBe('work');
  });

  it('Task-Status', () => {
    expect(value(parseEnum('offen', 'taskStatus'))).toBe('todo');
    expect(value(parseEnum('In Arbeit', 'taskStatus'))).toBe('in_progress');
    expect(value(parseEnum('laufend', 'taskStatus'))).toBe('in_progress');
    expect(value(parseEnum('in progress', 'taskStatus'))).toBe('in_progress');
    expect(value(parseEnum('IN_PROGRESS', 'taskStatus'))).toBe('in_progress');
    expect(value(parseEnum('erledigt', 'taskStatus'))).toBe('done');
  });

  it('Priorität, Typ, Meilenstein- und Projektstatus', () => {
    expect(value(parseEnum('niedrig', 'priority'))).toBe('low');
    expect(value(parseEnum('Mittel', 'priority'))).toBe('medium');
    expect(value(parseEnum('hoch', 'priority'))).toBe('high');
    expect(value(parseEnum('Stoppuhr', 'timeLogMode'))).toBe('stopwatch');
    expect(value(parseEnum('stechuhr', 'timeLogMode'))).toBe('stopwatch');
    expect(value(parseEnum('manuell', 'timeLogMode'))).toBe('manual');
    expect(value(parseEnum('Pomodoro', 'timeLogMode'))).toBe('pomodoro');
    expect(value(parseEnum('offen', 'milestoneStatus'))).toBe('open');
    expect(value(parseEnum('erreicht', 'milestoneStatus'))).toBe('achieved');
    expect(value(parseEnum('verzögert', 'milestoneStatus'))).toBe('delayed');
    expect(value(parseEnum('verzoegert', 'milestoneStatus'))).toBe('delayed');
    expect(value(parseEnum('aktiv', 'projectStatus'))).toBe('active');
    expect(value(parseEnum('pausiert', 'projectStatus'))).toBe('paused');
    expect(value(parseEnum('archiviert', 'projectStatus'))).toBe('archived');
  });

  it('leer → null, Unbekanntes → Fehler mit erlaubten Werten', () => {
    expect(value(parseEnum('', 'priority'))).toBeNull();
    expect(value(parseEnum('sofort', 'priority'))).toBe(
      'Fehler: Ungültiger Wert «sofort» für Prioritaet (erlaubt: low, medium, high)',
    );
  });
});

describe('Farben, Codes, Zeitpunkte', () => {
  it('normalisiert Farben', () => {
    expect(value(parseColor('#2A78D6'))).toBe('#2a78d6');
    expect(value(parseColor('abc'))).toBe('#aabbcc');
    expect(value(parseColor('blau'))).toBe('Fehler: Ungültige Farbe «blau» (erwartet #RRGGBB)');
  });

  it('prüft Codes und erzeugt Codes aus Namen', () => {
    expect(isValidCode('PRO-WEB')).toBe(true);
    expect(isValidCode('AP-1.1')).toBe(true);
    expect(isValidCode('mit Leerzeichen')).toBe(false);
    expect(isValidCode('X'.repeat(33))).toBe(false);
    expect(codeFromName('Grundlagen der Mathematik', new Set())).toBe('GRUNDLAGEN-D');
    expect(codeFromName('Straße & Brücken', new Set())).toBe('STRASSE-BRUE');
    expect(codeFromName('Web', new Set(['web', 'web-2']))).toBe('WEB-3');
    expect(codeFromName('***', new Set())).toBe('PROJEKT');
  });

  it('bildet lokale Zeitpunkte (auch über Mitternacht)', () => {
    expect(localTimestamp('2026-10-14', 9 * 3600 + 1800)).toBe(new Date(2026, 9, 14, 9, 30).getTime());
    expect(localTimestamp('2026-10-14', 30 * 60, 1)).toBe(new Date(2026, 9, 15, 0, 30).getTime());
    expect(localTimestamp('2026-12-31', 24 * 3600)).toBe(new Date(2027, 0, 1, 0, 0).getTime());
  });

  it('rundet kaufmännisch', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(59.5, 1)).toBe(59.5);
    expect(roundTo(-0.04, 1)).toBe(0);
  });
});
