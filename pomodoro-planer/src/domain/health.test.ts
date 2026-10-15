import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateMilestoneHealth, calculateWorkPackageHealth, calendarDaysBetween, DEFAULT_THRESHOLDS, localDateKey,
  resolveThresholds, thresholdsFromSettings,
  type HealthOptions, type HealthTaskInput, type PlanStatus, type WorkPackageHealth, type WorkPackageHealthInput,
} from './health';
import { DEFAULT_SETTINGS } from '../data/types';

const TODAY = '2026-10-15';
const opts: HealthOptions = { today: TODAY };

/** Datum relativ zu TODAY */
const inDays = (n: number): string => {
  const d = new Date(Date.UTC(2026, 9, 15 + n));
  return d.toISOString().slice(0, 10);
};

/** `done` erledigte von `total` Tasks ohne Schätzung (Fortschritt nach Anzahl) */
const tasks = (done: number, total: number): HealthTaskInput[] =>
  Array.from({ length: total }, (_, i) => ({ status: i < done ? 'done' : 'todo' }));

const wp = (input: Partial<WorkPackageHealthInput>, o: HealthOptions = opts) =>
  calculateWorkPackageHealth({ plannedHours: 10, actualHours: 0, tasks: tasks(0, 2), deadline: null, ...input }, o);

afterEach(() => {
  vi.useRealTimers();
});

describe('Kalenderdaten', () => {
  it('zählt Kalendertage über die Sommerzeit-Umstellung hinweg', () => {
    expect(calendarDaysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(calendarDaysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(calendarDaysBetween('2026-10-15', '2026-10-14')).toBe(-1);
    expect(calendarDaysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('erkennt ungültige Daten', () => {
    expect(calendarDaysBetween('2026-02-31', '2026-03-01')).toBeNull();
    expect(calendarDaysBetween('15.10.2026', '2026-10-16')).toBeNull();
  });

  it('liefert das lokale Datum als YYYY-MM-DD', () => {
    expect(localDateKey(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
    expect(localDateKey(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });
});

describe('Arbeitspaket – Schritt A: Grundmetriken', () => {
  it('burnRatio = Ist / Soll, 0 ohne Soll', () => {
    expect(wp({ plannedHours: 10, actualHours: 4 }).burnRatio).toBe(0.4);
    expect(wp({ plannedHours: 0, actualHours: 4 }).burnRatio).toBe(0);
  });

  it('gewichteter Fortschritt, wenn alle Tasks eine Schätzung > 0 haben', () => {
    const h = wp({ tasks: [{ status: 'done', estimatedHours: 2 }, { status: 'todo', estimatedHours: 6 }] });
    expect(h.progressRatio).toBe(0.25);
  });

  it('Fortschritt nach Anzahl, sobald ein Task keine Schätzung hat', () => {
    const h = wp({
      tasks: [{ status: 'done', estimatedHours: 2 }, { status: 'todo', estimatedHours: 6 }, { status: 'todo' }],
    });
    expect(h.progressRatio).toBeCloseTo(1 / 3, 12);
  });

  it('Schätzung 0 oder null zählt als fehlend', () => {
    expect(wp({ tasks: [{ status: 'done', estimatedHours: 6 }, { status: 'todo', estimatedHours: 0 }] }).progressRatio).toBe(0.5);
    expect(wp({ tasks: [{ status: 'done', estimatedHours: 6 }, { status: 'todo', estimatedHours: null }] }).progressRatio).toBe(0.5);
  });

  it('in_progress zählt nicht als erledigt', () => {
    expect(wp({ tasks: [{ status: 'in_progress' }, { status: 'done' }] }).progressRatio).toBe(0.5);
  });

  it('ohne Tasks: progressRatio = min(1, burnRatio)', () => {
    expect(wp({ tasks: [], plannedHours: 10, actualHours: 4 }).progressRatio).toBe(0.4);
    expect(wp({ tasks: [], plannedHours: 10, actualHours: 15 }).progressRatio).toBe(1);
    expect(wp({ tasks: [], plannedHours: 0, actualHours: 3 }).progressRatio).toBe(0);
  });

  it('burnDelta, remainingHours und forecastHours', () => {
    const h = wp({ plannedHours: 10, actualHours: 5, tasks: tasks(1, 4) });
    expect(h.burnDelta).toBe(0.25);
    expect(h.remainingHours).toBe(7.5);
    expect(h.forecastHours).toBe(20);
  });

  it('forecastHours ist null ohne Fortschritt', () => {
    expect(wp({ actualHours: 2, tasks: tasks(0, 3) }).forecastHours).toBeNull();
  });

  it('ohne Deadline: daysLeft und requiredDailyHours null', () => {
    const h = wp({});
    expect(h.daysLeft).toBeNull();
    expect(h.requiredDailyHours).toBeNull();
  });

  it('ungültige Deadline gilt als keine Deadline', () => {
    expect(wp({ deadline: '2026-13-01' }).daysLeft).toBeNull();
  });

  it('daysLeft: Fälligkeitstag = 1, morgen = 1, in 3 Tagen = 3, überfällig negativ', () => {
    expect(wp({ deadline: TODAY }).daysLeft).toBe(1);
    expect(wp({ deadline: inDays(1) }).daysLeft).toBe(1);
    expect(wp({ deadline: inDays(3) }).daysLeft).toBe(3);
    expect(wp({ deadline: inDays(-1) }).daysLeft).toBe(-1);
  });

  it('requiredDailyHours = Rest / Tage, Infinity wenn überfällig', () => {
    expect(wp({ plannedHours: 10, tasks: tasks(1, 2), deadline: inDays(5) }).requiredDailyHours).toBe(1);
    expect(wp({ deadline: inDays(-2) }).requiredDailyHours).toBe(Infinity);
  });

  it('verwendet standardmässig das lokale heutige Datum', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 23, 30));
    expect(calculateWorkPackageHealth({ plannedHours: 1, actualHours: 0, tasks: [], deadline: '2026-10-18' }).daysLeft).toBe(3);
  });

  it('lehnt ein ungültiges today ab', () => {
    expect(() => wp({ deadline: TODAY }, { today: 'gestern' })).toThrow(RangeError);
  });

  it('negative oder ungültige Stunden werden als 0 behandelt', () => {
    const h = wp({ plannedHours: Number.NaN, actualHours: -3 });
    expect(h.burnRatio).toBe(0);
    expect(h.remainingHours).toBe(0);
  });
});

describe('Arbeitspaket – COMPLETED', () => {
  it('alle Tasks erledigt, Ist ≤ Soll', () => {
    const h = wp({ plannedHours: 10, actualHours: 8, tasks: tasks(3, 3) });
    expect(h.status).toBe('COMPLETED');
    expect(h.reason).toBe('Abgeschlossen im Zeitplan');
    expect(h.remainingHours).toBe(0);
  });

  it('Ist genau gleich Soll ist noch im Zeitplan', () => {
    expect(wp({ plannedHours: 10, actualHours: 10, tasks: tasks(2, 2) }).reason).toBe('Abgeschlossen im Zeitplan');
  });

  it('Ist > Soll: Überschreitung mit einer Nachkommastelle', () => {
    const h = wp({ plannedHours: 10, actualHours: 12.5, tasks: tasks(2, 2) });
    expect(h.status).toBe('COMPLETED');
    expect(h.reason).toBe('Abgeschlossen (+2,5 Std. über Budget)');
  });

  it('gewichteter Fortschritt mit Rundungsfehlern ergibt genau 1', () => {
    const h = wp({ tasks: [{ status: 'done', estimatedHours: 0.1 }, { status: 'done', estimatedHours: 0.2 }] });
    expect(h.progressRatio).toBe(1);
    expect(h.status).toBe('COMPLETED');
  });

  it('gewinnt gegen überschrittene Deadline und Budget', () => {
    const h = wp({ plannedHours: 5, actualHours: 9, tasks: tasks(2, 2), deadline: inDays(-10) });
    expect(h.status).toBe('COMPLETED');
    expect(h.reason).toBe('Abgeschlossen (+4,0 Std. über Budget)');
  });

  it('ohne Soll-Stunden gibt es keine Budgetüberschreitung', () => {
    expect(wp({ plannedHours: 0, actualHours: 3, tasks: tasks(1, 1) }).reason).toBe('Abgeschlossen im Zeitplan');
  });

  it('ohne Tasks nie COMPLETED, auch bei vollem Zeitverbrauch', () => {
    const h = wp({ plannedHours: 10, actualHours: 10, tasks: [] });
    expect(h.progressRatio).toBe(1);
    expect(h.status).toBe('ON_TRACK');
  });
});

describe('Arbeitspaket – OVER_BUDGET', () => {
  it('Regel 1: Ist > Soll', () => {
    const h = wp({ plannedHours: 10, actualHours: 10.5, tasks: tasks(1, 2) });
    expect(h.status).toBe('OVER_BUDGET');
    expect(h.reason).toBe('Zeitbudget überschritten (Ist > Soll)');
  });

  it('Regel 1: Ist = Soll löst nicht aus (auch mit Rundungsfehler 0.1 + 0.2)', () => {
    expect(wp({ plannedHours: 10, actualHours: 10, tasks: tasks(19, 20) }).status).not.toBe('OVER_BUDGET');
    expect(wp({ plannedHours: 0.3, actualHours: 0.1 + 0.2, tasks: tasks(19, 20) }).status).not.toBe('OVER_BUDGET');
  });

  it('Regel 1: ohne Soll-Stunden nie überschritten', () => {
    expect(wp({ plannedHours: 0, actualHours: 50, tasks: tasks(1, 2) }).status).toBe('ON_TRACK');
  });

  it('Regel 2: Deadline überschritten (daysLeft −1)', () => {
    const h = wp({ plannedHours: 10, actualHours: 1, tasks: tasks(1, 2), deadline: inDays(-1) });
    expect(h.status).toBe('OVER_BUDGET');
    expect(h.reason).toBe('Deadline überschritten');
    expect(h.daysLeft).toBe(-1);
  });

  it('Regel 2: Fälligkeitstag heute ist nicht überschritten', () => {
    const h = wp({ plannedHours: 10, actualHours: 1, tasks: tasks(1, 2), deadline: TODAY });
    expect(h.reason).not.toBe('Deadline überschritten');
  });

  it('Regel 3: starke Abweichung (burnDelta > 0.30)', () => {
    const h = wp({ plannedHours: 10, actualHours: 7, tasks: tasks(7, 20) });
    expect(h.burnDelta).toBeCloseTo(0.35, 12);
    expect(h.status).toBe('OVER_BUDGET');
    expect(h.reason).toBe('Starke Abweichung: 70% Zeit verbraucht, aber erst 35% erledigt');
  });

  it('Regel 3: burnDelta genau 0.30 (0.65 − 0.35 = 0.30000000000000004) löst nicht aus', () => {
    const h = wp({ plannedHours: 10, actualHours: 6.5, tasks: tasks(7, 20) });
    expect(h.burnDelta).toBeGreaterThan(0.3); // Gleitkomma
    expect(h.status).toBe('AT_RISK');
    expect(h.reason).toBe('Fortschritt hinkt dem Zeitverbrauch um 30% hinterher');
  });

  it('Regel 3: nur bei mehr als 1 Std. Ist-Zeit', () => {
    expect(wp({ plannedHours: 2, actualHours: 1, tasks: tasks(1, 10) }).reason)
      .toBe('Fortschritt hinkt dem Zeitverbrauch um 40% hinterher');
    expect(wp({ plannedHours: 2.4, actualHours: 1.2, tasks: tasks(1, 10) }).reason)
      .toBe('Starke Abweichung: 50% Zeit verbraucht, aber erst 10% erledigt');
  });

  it('Regel 4: kaum schaffbar (Tageslast > 6)', () => {
    const h = wp({ plannedHours: 20, actualHours: 0, tasks: tasks(0, 2), deadline: inDays(3) });
    expect(h.requiredDailyHours).toBeCloseTo(20 / 3, 12);
    expect(h.status).toBe('OVER_BUDGET');
    expect(h.reason).toBe('Kaum schaffbar: Noch 20,0 Std. Arbeit für 3 verbleibende Tage');
  });

  it('Regel 4: Einzahl bei 1 verbleibenden Tag', () => {
    const h = wp({ plannedHours: 7, actualHours: 0, tasks: tasks(0, 2), deadline: TODAY });
    expect(h.reason).toBe('Kaum schaffbar: Noch 7,0 Std. Arbeit für 1 verbleibenden Tag');
  });

  it('Regel 4: Tageslast genau 6 ist nicht rot, aber gelb', () => {
    const h = wp({ plannedHours: 18, actualHours: 0, tasks: tasks(0, 2), deadline: inDays(3) });
    expect(h.requiredDailyHours).toBe(6);
    expect(h.status).toBe('AT_RISK');
    expect(h.reason).toBe('Hohes Tagestempo bis zur Deadline nötig (6,0 Std./Tag)');
  });

  it('Regel 4: Schwelle aus thresholds', () => {
    const o = { today: TODAY, thresholds: { redDailyHours: 8 } };
    expect(wp({ plannedHours: 20, tasks: tasks(0, 2), deadline: inDays(3) }, o).status).toBe('AT_RISK');
    const strict = { today: TODAY, thresholds: { redDailyHours: 4 } };
    expect(wp({ plannedHours: 13, tasks: tasks(0, 2), deadline: inDays(3) }, strict).status).toBe('OVER_BUDGET');
  });

  it('Reihenfolge: Budget vor Deadline', () => {
    expect(wp({ plannedHours: 10, actualHours: 11, tasks: tasks(1, 2), deadline: inDays(-3) }).reason)
      .toBe('Zeitbudget überschritten (Ist > Soll)');
  });

  it('Reihenfolge: Deadline vor starker Abweichung', () => {
    expect(wp({ plannedHours: 10, actualHours: 9, tasks: tasks(1, 10), deadline: inDays(-1) }).reason)
      .toBe('Deadline überschritten');
  });

  it('Reihenfolge: starke Abweichung vor «kaum schaffbar»', () => {
    const h = wp({ plannedHours: 40, actualHours: 20, tasks: tasks(1, 10), deadline: inDays(2) });
    expect(h.requiredDailyHours).toBe(18);
    expect(h.reason).toBe('Starke Abweichung: 50% Zeit verbraucht, aber erst 10% erledigt');
  });
});

describe('Arbeitspaket – AT_RISK', () => {
  it('Regel 1: Fortschritt hinkt hinterher (burnDelta > 0.15)', () => {
    const h = wp({ plannedHours: 10, actualHours: 5, tasks: tasks(6, 20) });
    expect(h.status).toBe('AT_RISK');
    expect(h.reason).toBe('Fortschritt hinkt dem Zeitverbrauch um 20% hinterher');
  });

  it('Regel 1: burnDelta genau 0.15 (0.45 − 0.30) löst nicht aus', () => {
    const h = wp({ plannedHours: 10, actualHours: 4.5, tasks: tasks(6, 20) });
    expect(h.burnDelta).toBeGreaterThan(0.15); // Gleitkomma
    expect(h.status).toBe('ON_TRACK');
  });

  it('Regel 1: nur bei mehr als 0.5 Std. Ist-Zeit', () => {
    expect(wp({ plannedHours: 1, actualHours: 0.5, tasks: tasks(0, 2) }).status).toBe('ON_TRACK');
    expect(wp({ plannedHours: 1, actualHours: 0.6, tasks: tasks(1, 4) }).reason)
      .toBe('Fortschritt hinkt dem Zeitverbrauch um 35% hinterher');
  });

  it('Prozent werden kaufmännisch gerundet (28.5 → 29)', () => {
    expect(wp({ plannedHours: 10, actualHours: 5.85, tasks: tasks(6, 20) }).reason)
      .toBe('Fortschritt hinkt dem Zeitverbrauch um 29% hinterher');
  });

  it('Regel 2: über 85 % des Budgets verbraucht', () => {
    const h = wp({ plannedHours: 10, actualHours: 8.5, tasks: tasks(15, 20) });
    expect(h.burnRatio).toBe(0.85);
    expect(h.status).toBe('AT_RISK');
    expect(h.reason).toBe('Über 85% des Zeitbudgets verbraucht');
  });

  it('Regel 2: burnRatio knapp unter 0.85 durch Rundung (11.049999… / 13) zählt als 0.85', () => {
    const h = wp({ plannedHours: 13, actualHours: 0.85 * 13, tasks: tasks(3, 4) });
    expect(h.burnRatio).toBeLessThan(0.85);
    expect(h.reason).toBe('Über 85% des Zeitbudgets verbraucht');
  });

  it('Regel 2: burnRatio unter 0.85 oder Fortschritt genau 0.85 löst nicht aus', () => {
    expect(wp({ plannedHours: 10, actualHours: 8.4, tasks: tasks(15, 20) }).status).toBe('ON_TRACK');
    expect(wp({ plannedHours: 10, actualHours: 8.5, tasks: tasks(17, 20) }).status).toBe('ON_TRACK');
  });

  it('Regel 3: Tageslast > 3 bis zur Deadline', () => {
    const h = wp({ plannedHours: 14, actualHours: 0, tasks: tasks(0, 2), deadline: inDays(4) });
    expect(h.status).toBe('AT_RISK');
    expect(h.reason).toBe('Hohes Tagestempo bis zur Deadline nötig (3,5 Std./Tag)');
  });

  it('Regel 3: Tageslast genau 3 bei 4 Resttagen löst nicht aus', () => {
    const h = wp({ plannedHours: 12, actualHours: 0, tasks: tasks(0, 2), deadline: inDays(4) });
    expect(h.requiredDailyHours).toBe(3);
    expect(h.status).toBe('ON_TRACK');
  });

  it('Regel 3: letzte 3 Tage mit weniger als 75 % Fortschritt', () => {
    const h = wp({ plannedHours: 4, actualHours: 0, tasks: tasks(2, 4), deadline: inDays(3) });
    expect(h.daysLeft).toBe(3);
    expect(h.status).toBe('AT_RISK');
    expect(h.reason).toBe('Hohes Tagestempo bis zur Deadline nötig (0,7 Std./Tag)');
  });

  it('Regel 3: 4 Resttage oder Fortschritt genau 75 % lösen nicht aus', () => {
    expect(wp({ plannedHours: 4, tasks: tasks(2, 4), deadline: inDays(4) }).status).toBe('ON_TRACK');
    expect(wp({ plannedHours: 4, tasks: tasks(3, 4), deadline: inDays(3) }).status).toBe('ON_TRACK');
  });

  it('Regel 3: Fälligkeitstag heute (daysLeft 0 → 1) gilt als letzte Tage', () => {
    const h = wp({ plannedHours: 2, actualHours: 0, tasks: tasks(1, 2), deadline: TODAY });
    expect(h.daysLeft).toBe(1);
    expect(h.reason).toBe('Hohes Tagestempo bis zur Deadline nötig (1,0 Std./Tag)');
  });

  it('Regel 3: Schwelle aus thresholds', () => {
    const o = { today: TODAY, thresholds: { yellowDailyHours: 4 } };
    expect(wp({ plannedHours: 14, tasks: tasks(0, 2), deadline: inDays(4) }, o).status).toBe('ON_TRACK');
  });

  it('Reihenfolge: OVER_BUDGET schlägt AT_RISK', () => {
    // erfüllt auch «über 85 %» und «Tageslast > 3», aber Deadline ist überschritten
    expect(wp({ plannedHours: 10, actualHours: 9, tasks: tasks(15, 20), deadline: inDays(-1) }).status).toBe('OVER_BUDGET');
  });

  it('Reihenfolge innerhalb AT_RISK: Abweichung vor 85 % vor Tagestempo', () => {
    expect(wp({ plannedHours: 10, actualHours: 9, tasks: tasks(14, 20), deadline: inDays(1) }).reason)
      .toBe('Fortschritt hinkt dem Zeitverbrauch um 20% hinterher');
    expect(wp({ plannedHours: 10, actualHours: 9, tasks: tasks(16, 20), deadline: inDays(1) }).reason)
      .toBe('Über 85% des Zeitbudgets verbraucht');
  });
});

describe('Arbeitspaket – ON_TRACK', () => {
  it('liefert «Im Plan»', () => {
    const h = wp({ plannedHours: 10, actualHours: 3, tasks: tasks(1, 2), deadline: inDays(30) });
    expect(h.status).toBe('ON_TRACK');
    expect(h.reason).toBe('Im Plan');
  });

  it('leeres Arbeitspaket ohne Soll ist im Plan', () => {
    const h = wp({ plannedHours: 0, actualHours: 0, tasks: [] });
    expect(h).toMatchObject({ status: 'ON_TRACK', reason: 'Im Plan', progressRatio: 0, remainingHours: 0, forecastHours: null });
  });
});

describe('Schwellenwerte', () => {
  it('Standardwerte', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({ redDailyHours: 6, yellowDailyHours: 3, milestoneRedDailyHours: 6, milestoneYellowDailyHours: 3.5 });
  });

  it('übernimmt nur gültige Überschreibungen', () => {
    expect(resolveThresholds({ redDailyHours: 8, yellowDailyHours: Number.NaN, milestoneRedDailyHours: -1 }))
      .toEqual({ ...DEFAULT_THRESHOLDS, redDailyHours: 8 });
  });

  it('liest die Schwellwerte aus den Einstellungen', () => {
    expect(thresholdsFromSettings({ ...DEFAULT_SETTINGS, health_red_daily_hours: 7 }))
      .toEqual({ ...DEFAULT_THRESHOLDS, redDailyHours: 7 });
  });
});

/* ---------- Meilensteine ---------- */

const health = (status: PlanStatus, remainingHours = 0): WorkPackageHealth => ({
  status, reason: '', burnRatio: 0, progressRatio: 0, burnDelta: 0, remainingHours,
  daysLeft: null, requiredDailyHours: null, forecastHours: null,
});

const ms = (workPackages: WorkPackageHealth[], targetDate: string | null = null, o: HealthOptions = opts) =>
  calculateMilestoneHealth({ targetDate, workPackages }, o);

describe('Meilenstein', () => {
  it('completed, wenn alle Arbeitspakete abgeschlossen sind – auch nach dem Zieldatum', () => {
    const h = ms([health('COMPLETED'), health('COMPLETED')], inDays(-5));
    expect(h.status).toBe('completed');
    expect(h.reason).toBe('Alle Arbeitspakete abgeschlossen');
    expect(h.remainingHours).toBe(0);
  });

  it('ohne Arbeitspakete: im Plan mit Hinweis', () => {
    const h = ms([], inDays(10));
    expect(h.status).toBe('on_track');
    expect(h.reason).toBe('Keine Arbeitspakete zugeordnet');
  });

  it('ohne Arbeitspakete, aber überschrittenem Zieldatum: verspätet', () => {
    expect(ms([], inDays(-1))).toMatchObject({ status: 'delayed', reason: 'Zieldatum überschritten' });
  });

  it('ROT: Zieldatum überschritten', () => {
    const h = ms([health('COMPLETED'), health('ON_TRACK', 2)], inDays(-1));
    expect(h).toMatchObject({ status: 'delayed', reason: 'Zieldatum überschritten', daysLeft: -1, requiredDailyHours: Infinity });
  });

  it('ROT: Arbeitspakete OVER_BUDGET (Einzahl/Mehrzahl)', () => {
    expect(ms([health('OVER_BUDGET'), health('ON_TRACK')]).reason).toBe('1 Arbeitspaket kritisch');
    const h = ms([health('OVER_BUDGET'), health('OVER_BUDGET'), health('AT_RISK')]);
    expect(h.status).toBe('delayed');
    expect(h.reason).toBe('2 Arbeitspakete kritisch');
  });

  it('ROT: kumulierte Tageslast > 6', () => {
    const h = ms([health('ON_TRACK', 12), health('ON_TRACK', 8)], inDays(3));
    expect(h.remainingHours).toBe(20);
    expect(h.status).toBe('delayed');
    expect(h.reason).toBe('Kaum schaffbar: 6,7 Std./Tag bis zum Zieldatum nötig');
  });

  it('Tageslast genau 6 ist nicht rot, aber gelb', () => {
    const h = ms([health('ON_TRACK', 18)], inDays(3));
    expect(h.status).toBe('at_risk');
    expect(h.reason).toBe('Hohe Tageslast bis zum Zieldatum (6,0 Std./Tag)');
  });

  it('Resthours zählen nur offene Arbeitspakete', () => {
    const h = ms([health('COMPLETED', 50), health('ON_TRACK', 4)], inDays(4));
    expect(h.remainingHours).toBe(4);
    expect(h.requiredDailyHours).toBe(1);
    expect(h.status).toBe('on_track');
    expect(h.reason).toBe('Im Plan');
  });

  it('GELB: Arbeitspakete mit Frühwarnung (Einzahl/Mehrzahl)', () => {
    expect(ms([health('AT_RISK'), health('ON_TRACK')])).toMatchObject({ status: 'at_risk', reason: '1 Arbeitspaket mit Frühwarnung' });
    expect(ms([health('AT_RISK'), health('AT_RISK')]).reason).toBe('2 Arbeitspakete mit Frühwarnung');
  });

  it('GELB: Tageslast > 3.5, genau 3.5 ist grün', () => {
    expect(ms([health('ON_TRACK', 7.2)], inDays(2))).toMatchObject({
      status: 'at_risk', reason: 'Hohe Tageslast bis zum Zieldatum (3,6 Std./Tag)',
    });
    expect(ms([health('ON_TRACK', 7)], inDays(2)).status).toBe('on_track');
  });

  it('Zieldatum heute zählt als 1 verbleibender Tag', () => {
    const h = ms([health('ON_TRACK', 3)], TODAY);
    expect(h.daysLeft).toBe(1);
    expect(h.requiredDailyHours).toBe(3);
    expect(h.status).toBe('on_track');
  });

  it('ohne Zieldatum keine Tageslast-Regeln', () => {
    const h = ms([health('ON_TRACK', 500)]);
    expect(h).toMatchObject({ status: 'on_track', reason: 'Im Plan', daysLeft: null, requiredDailyHours: null });
  });

  it('Reihenfolge: Zieldatum vor kritischen Arbeitspaketen, kritisch vor Tageslast, Frühwarnung vor Tageslast', () => {
    expect(ms([health('OVER_BUDGET')], inDays(-2)).reason).toBe('Zieldatum überschritten');
    expect(ms([health('OVER_BUDGET', 30)], inDays(1)).reason).toBe('1 Arbeitspaket kritisch');
    expect(ms([health('AT_RISK', 5)], inDays(1)).reason).toBe('1 Arbeitspaket mit Frühwarnung');
  });

  it('ROT schlägt GELB', () => {
    // Frühwarnung eines Arbeitspakets (gelb) vs. kumulierte Tageslast 10 Std./Tag (rot)
    expect(ms([health('AT_RISK', 10)], inDays(1))).toMatchObject({
      status: 'delayed', reason: 'Kaum schaffbar: 10,0 Std./Tag bis zum Zieldatum nötig',
    });
    expect(ms([health('AT_RISK'), health('OVER_BUDGET')]).status).toBe('delayed');
  });

  it('Schwellen aus thresholds', () => {
    const o = { today: TODAY, thresholds: { milestoneRedDailyHours: 10, milestoneYellowDailyHours: 8 } };
    expect(ms([health('ON_TRACK', 20)], inDays(3), o).status).toBe('on_track');
  });

  it('arbeitet mit echten Arbeitspaket-Ergebnissen zusammen', () => {
    const a = calculateWorkPackageHealth({ plannedHours: 10, actualHours: 2, tasks: tasks(1, 4), deadline: inDays(10) }, opts);
    const b = calculateWorkPackageHealth({ plannedHours: 6, actualHours: 6, tasks: tasks(2, 2), deadline: inDays(-1) }, opts);
    const h = ms([a, b], inDays(5));
    expect(a.status).toBe('ON_TRACK');
    expect(b.status).toBe('COMPLETED');
    expect(h.remainingHours).toBe(7.5);
    expect(h.requiredDailyHours).toBe(1.5);
    expect(h.status).toBe('on_track');
  });
});
