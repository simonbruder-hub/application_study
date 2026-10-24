import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { buildWorkbook, exportFileName, exportXlsx } from './exportWorkbook';
import { SHEETS, SHEET_TABLES, STYLE } from './schema';
import { ID, fakeInfo, getCell, reload, rowWhere, sampleSnapshot, sheet } from './testing';

const TODAY = '2026-10-15';

async function exported(): Promise<ExcelJS.Workbook> {
  const buffer = await exportXlsx(sampleSnapshot(), { today: TODAY, info: fakeInfo });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

const headers = (ws: ExcelJS.Worksheet): string[] => {
  const out: string[] = [];
  ws.getRow(1).eachCell((cell) => out.push(String(cell.value)));
  return out;
};

const fillOf = (cell: ExcelJS.Cell): string | undefined =>
  (cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;

const validation = (ws: ExcelJS.Worksheet, address: string): ExcelJS.DataValidation | undefined =>
  (ws as unknown as { dataValidations: { model: Record<string, ExcelJS.DataValidation> } }).dataValidations.model[address];

describe('Excel-Export – Struktur und Formatierung', () => {
  it('liefert einen ArrayBuffer und einen sinnvollen Dateinamen', async () => {
    const buffer = await exportXlsx(sampleSnapshot(), { today: TODAY, info: fakeInfo });
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(1000);
    expect(exportFileName(TODAY)).toBe('Taktwerk_2026-10-15.xlsx');
  });

  it('liefert genau die Bytes der Datei, auch wenn ExcelJS einen Ausschnitt eines grösseren Puffers liefert', async () => {
    const real = new Uint8Array(await buildWorkbook(sampleSnapshot(), { today: TODAY, info: fakeInfo }).xlsx.writeBuffer());
    // Node-Buffer als Ausschnitt eines grösseren Speichers (wie aus dem Buffer-Pool); Buffer.slice() kopiert nicht
    const NodeBuffer = (globalThis as unknown as { Buffer: { from(b: ArrayBuffer, offset: number, length: number): Uint8Array } }).Buffer;
    const memory = new Uint8Array(real.byteLength + 64).fill(0xee);
    memory.set(real, 16);
    const view = NodeBuffer.from(memory.buffer, 16, real.byteLength);
    const xlsxProto = Object.getPrototypeOf(new ExcelJS.Workbook().xlsx) as { writeBuffer: () => Promise<unknown> };
    const spy = vi.spyOn(xlsxProto, 'writeBuffer').mockResolvedValueOnce(view);
    try {
      const buffer = await exportXlsx(sampleSnapshot(), { today: TODAY, info: fakeInfo });
      expect(buffer.byteLength).toBe(real.byteLength);
      expect(new Uint8Array(buffer)).toEqual(real);
      await new ExcelJS.Workbook().xlsx.load(buffer);
    } finally {
      spy.mockRestore();
    }
  });

  it('enthält exakt die 5 Blätter mit den Spalten in vorgegebener Reihenfolge', async () => {
    const wb = await exported();
    expect(wb.worksheets.map((ws) => ws.name)).toEqual([
      '1_Projekte', '2_Meilensteine', '3_Arbeitspakete', '4_Tasks', '5_Zeiteintraege',
    ]);
    expect(headers(sheet(wb, '1_Projekte'))).toEqual([
      'ID', 'Projekt_Code', 'Name', 'Modus', 'Status', 'Farbe_Hex', 'Soll_Stunden_Gesamt', 'Ist_Stunden_Summe', 'Loeschen',
    ]);
    expect(headers(sheet(wb, '2_Meilensteine'))).toEqual([
      'ID', 'Projekt_Code', 'MS_Code', 'Titel', 'Zieldatum', 'Status', 'Loeschen',
    ]);
    expect(headers(sheet(wb, '3_Arbeitspakete'))).toEqual([
      'ID', 'Projekt_Code', 'MS_Code', 'AP_Code', 'Titel', 'Startdatum', 'Deadline', 'Soll_Stunden', 'Ist_Stunden',
      'Task_Fortschritt_%', 'Plan_Status', 'Loeschen',
    ]);
    expect(headers(sheet(wb, '4_Tasks'))).toEqual([
      'ID', 'Projekt_Code', 'AP_Code', 'Task_Titel', 'Status', 'Prioritaet', 'Faellig_Am', 'Geschaetzte_Stunden',
      'Geschaetzte_Pomodoros', 'Ist_Stunden', 'Notizen', 'Loeschen',
    ]);
    expect(headers(sheet(wb, '5_Zeiteintraege'))).toEqual([
      'ID', 'Projekt_Code', 'AP_Code', 'Task_ID', 'Task_Titel_Referenz', 'Typ', 'Datum', 'Startzeit', 'Endzeit',
      'Dauer_Minuten', 'Kommentar', 'Loeschen',
    ]);
  });

  it('fixiert die erste Zeile und setzt in allen Blättern einen Auto-Filter', async () => {
    const wb = await exported();
    for (const ws of wb.worksheets) {
      expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
      const cols = headers(ws).length;
      const last = String.fromCharCode(64 + cols);
      expect(ws.autoFilter).toBe(`A1:${last}${Math.max(ws.rowCount, 1)}`);
    }
  });

  it('färbt editierbare Köpfe dunkelblau mit weisser Schrift, berechnete/System-Spalten grau', async () => {
    const wb = await exported();
    for (const table of SHEET_TABLES) {
      const def = SHEETS[table];
      const ws = sheet(wb, def.name);
      def.columns.forEach((c, i) => {
        const cell = ws.getRow(1).getCell(i + 1);
        if (c.kind === 'editable') {
          expect(fillOf(cell), `${def.name}/${c.header}`).toBe(STYLE.editableHeaderFill);
          expect(cell.font?.color?.argb).toBe('FFFFFFFF');
        } else {
          expect(fillOf(cell), `${def.name}/${c.header}`).toBe(STYLE.infoHeaderFill);
        }
      });
    }
    const wp = sheet(wb, '3_Arbeitspakete');
    const grey = ['ID', 'Ist_Stunden', 'Task_Fortschritt_%', 'Plan_Status'];
    for (const h of grey) expect(fillOf(getCell(wp, 1, h))).toBe(STYLE.infoHeaderFill);
    for (const h of ['Projekt_Code', 'AP_Code', 'Soll_Stunden', 'Loeschen']) {
      expect(fillOf(getCell(wp, 1, h))).toBe(STYLE.editableHeaderFill);
    }
  });

  it('setzt Dropdowns für Modus, Status, Prioritaet, Typ und Loeschen bis mindestens Zeile 1000', async () => {
    const wb = await exported();
    const expectList = (ws: ExcelJS.Worksheet, header: string, values: string) => {
      const letter = ws.getColumn(headers(ws).indexOf(header) + 1).letter;
      for (const row of [2, 500, 1000]) {
        const v = validation(ws, `${letter}${row}`);
        expect(v, `${ws.name}/${header}${row}`).toBeDefined();
        expect(v!.type).toBe('list');
        expect(v!.formulae).toEqual([`"${values}"`]);
      }
      expect(validation(ws, `${letter}1`)).toBeUndefined();
      expect(validation(ws, `${letter}1001`)).toBeUndefined();
    };
    expectList(sheet(wb, '1_Projekte'), 'Modus', 'work,study');
    expectList(sheet(wb, '1_Projekte'), 'Status', 'active,paused,archived');
    expectList(sheet(wb, '2_Meilensteine'), 'Status', 'open,achieved,delayed');
    expectList(sheet(wb, '4_Tasks'), 'Status', 'todo,in_progress,done');
    expectList(sheet(wb, '4_Tasks'), 'Prioritaet', 'low,medium,high');
    expectList(sheet(wb, '5_Zeiteintraege'), 'Typ', 'pomodoro,stopwatch,manual');
    for (const ws of wb.worksheets) expectList(ws, 'Loeschen', 'FALSE,TRUE');
    // Keine Dropdowns auf Freitext-Spalten
    const tasks = sheet(wb, '4_Tasks');
    expect(validation(tasks, `${tasks.getColumn(headers(tasks).indexOf('Task_Titel') + 1).letter}2`)).toBeUndefined();
  });

  it('reicht die Dropdowns bei vielen Zeilen bis 500 Zeilen unter die letzte Datenzeile', async () => {
    const s = sampleSnapshot();
    const base = s.tasks[0]!;
    s.tasks = Array.from({ length: 700 }, (_, i) => ({ ...base, id: `${base.id.slice(0, -4)}${String(i).padStart(4, '0')}` }));
    const wb = await reload(buildWorkbook(s, { today: TODAY, info: fakeInfo }));
    const ws = sheet(wb, '4_Tasks');
    const letter = ws.getColumn(headers(ws).indexOf('Status') + 1).letter;
    // 700 Datenzeilen → Zeilen 2 bis 700 + 500
    expect(validation(ws, `${letter}1200`)).toBeDefined();
    expect(validation(ws, `${letter}1201`)).toBeUndefined();
  });

  it('schreibt den Plan_Status mit der Begründung als Zellnotiz', async () => {
    const wb = await exported();
    const ws = sheet(wb, '3_Arbeitspakete');
    const row = rowWhere(ws, 'ID', ID.w1);
    expect(getCell(ws, row, 'Plan_Status').value).toBe('AT_RISK');
    expect(getCell(ws, row, 'Plan_Status').note).toBe('Testbegründung AP-1.1');
    expect(getCell(ws, row, 'Task_Fortschritt_%').value).toBe(0.5);
    expect(getCell(ws, row, 'Task_Fortschritt_%').numFmt).toBe('0%');
  });
});

describe('Excel-Export – Inhalte', () => {
  it('exportiert nur nicht gelöschte Zeilen, sortiert nach Projekt und Reihenfolge', async () => {
    const wb = await exported();
    const ids = (name: string) => {
      const ws = sheet(wb, name);
      const out: string[] = [];
      for (let r = 2; r <= ws.rowCount; r++) out.push(String(ws.getCell(r, 1).value));
      return out;
    };
    expect(ids('1_Projekte')).toEqual([ID.p1, ID.p2]);
    expect(ids('3_Arbeitspakete')).toEqual([ID.w1, ID.w2, ID.w3]);
    // Tasks eines Arbeitspakets zuerst, Tasks direkt am Projekt danach; gelöschter Task fehlt
    expect(ids('4_Tasks')).toEqual([ID.t1, ID.t2, ID.t3, ID.t4]);
    // Zeiteinträge chronologisch, auch der des gelöschten Projekts (Historie)
    expect(ids('5_Zeiteintraege')).toEqual([ID.l4, ID.l1, ID.l2, ID.l3]);
  });

  it('schreibt Datumswerte als Text, Stunden als Zahl und Loeschen = FALSE', async () => {
    const wb = await exported();
    const p = sheet(wb, '1_Projekte');
    const r = rowWhere(p, 'ID', ID.p1);
    expect(getCell(p, r, 'Projekt_Code').value).toBe('MATHE1');
    expect(getCell(p, r, 'Soll_Stunden_Gesamt').value).toBe(40);
    expect(getCell(p, r, 'Soll_Stunden_Gesamt').numFmt).toBe('0.0#');
    expect(getCell(p, r, 'Ist_Stunden_Summe').value).toBe(1.5);
    expect(getCell(p, r, 'Loeschen').value).toBe(false);

    const wp = sheet(wb, '3_Arbeitspakete');
    const w = rowWhere(wp, 'ID', ID.w1);
    expect(getCell(wp, w, 'MS_Code').value).toBe('MS-1');
    expect(getCell(wp, w, 'Startdatum').value).toBe('2026-10-01');
    expect(getCell(wp, w, 'Startdatum').numFmt).toBe('@');
    expect(getCell(wp, w, 'Deadline').value).toBe('2026-11-30');

    const t = sheet(wb, '4_Tasks');
    const t1 = rowWhere(t, 'ID', ID.t1);
    expect(getCell(t, t1, 'AP_Code').value).toBe('AP-1.1');
    expect(getCell(t, t1, 'Faellig_Am').value).toBe('2026-10-10');
    expect(getCell(t, t1, 'Ist_Stunden').value).toBe(0.42);
    expect(getCell(t, rowWhere(t, 'ID', ID.t3), 'AP_Code').value).toBeNull();
  });

  it('gibt Zeiteinträge in lokaler Zeit aus, Dauer in Minuten mit 1 Nachkommastelle', async () => {
    const wb = await exported();
    const ws = sheet(wb, '5_Zeiteintraege');
    const r2 = rowWhere(ws, 'ID', ID.l2);
    expect(getCell(ws, r2, 'Projekt_Code').value).toBe('PRO-WEB');
    expect(getCell(ws, r2, 'AP_Code').value).toBe('AP-1');
    expect(getCell(ws, r2, 'Task_ID').value).toBe(ID.t4);
    expect(getCell(ws, r2, 'Task_Titel_Referenz').value).toBe('Layout');
    expect(getCell(ws, r2, 'Typ').value).toBe('stopwatch');
    expect(getCell(ws, r2, 'Datum').value).toBe('2026-10-06');
    expect(getCell(ws, r2, 'Startzeit').value).toBe('22:30');
    expect(getCell(ws, r2, 'Endzeit').value).toBe('00:15');
    expect(getCell(ws, r2, 'Dauer_Minuten').value).toBe(100);

    const r3 = rowWhere(ws, 'ID', ID.l3);
    expect(getCell(ws, r3, 'Startzeit').value).toBe('14:00');
    expect(getCell(ws, r3, 'Dauer_Minuten').value).toBe(59.5);
    expect(getCell(ws, r3, 'Kommentar').value).toBe('Nachtrag');
    // Gelöschtes Projekt: Code bleibt sichtbar
    expect(getCell(ws, rowWhere(ws, 'ID', ID.l4), 'Projekt_Code').value).toBe('ALT');
  });

  it('nutzt standardmässig die Kennzahlen-Engine', async () => {
    const wb = await reload(buildWorkbook(sampleSnapshot(), { today: TODAY }));
    const ws = sheet(wb, '3_Arbeitspakete');
    const r = rowWhere(ws, 'ID', ID.w1);
    // AP-1.1: Soll 20 Std., 1 von 2 Tasks (2 + 3 Std. geschätzt) erledigt → 40 % Fortschritt
    expect(getCell(ws, r, 'Task_Fortschritt_%').value).toBeCloseTo(0.4);
    expect(getCell(ws, r, 'Ist_Stunden').value).toBeCloseTo(25 / 60, 2);
    expect(['ON_TRACK', 'AT_RISK', 'OVER_BUDGET', 'COMPLETED']).toContain(getCell(ws, r, 'Plan_Status').value);
    expect(typeof getCell(ws, r, 'Plan_Status').note).toBe('string');
  });
});
