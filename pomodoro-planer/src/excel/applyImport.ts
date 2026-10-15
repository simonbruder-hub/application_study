/**
 * Excel-Re-Import, Stufe 3: den bestätigten Plan schreiben.
 *
 * Alle ops gehen in einer einzigen Transaktion an Repository.applyBatch: Das Repository vergibt
 * frische updated_at-Zeitstempel (Hybrid Logical Clock), markiert die Zeilen als _dirty und führt
 * die Soft-Delete-Kaskaden aus – die Sync-Engine verteilt die Änderungen danach auf alle Geräte.
 *
 * Dieses Modul lädt ExcelJS nicht.
 */
import type { BatchResult, Repository } from '../data/repository';
import type { PlannerSnapshot } from '../domain/metrics';
import type { ImportPlan } from './importTypes';

export interface ApplyOptions {
  /**
   * Trotz Fehlern schreiben. Fehlerhafte Zeilen sind ohnehin nicht im Plan enthalten; ohne diese
   * Option wird ein Plan mit Fehlern abgelehnt, damit nichts versehentlich halb übernommen wird.
   */
  allowErrors?: boolean;
}

/** Ein Plan mit Fehlern wurde ohne { allowErrors: true } übergeben. */
export class ImportBlockedError extends Error {
  constructor(readonly errorCount: number) {
    super(
      errorCount === 1
        ? 'Der Import enthält 1 Fehler und wurde nicht geschrieben.'
        : `Der Import enthält ${errorCount} Fehler und wurde nicht geschrieben.`,
    );
    this.name = 'ImportBlockedError';
  }
}

/** Schreibt den Plan in einer Transaktion. Ohne ops wird nichts geschrieben. */
export async function applyImport(
  plan: Pick<ImportPlan, 'ops' | 'hasErrors' | 'issues'>,
  repo: Pick<Repository, 'applyBatch'>,
  opts: ApplyOptions = {},
): Promise<BatchResult> {
  if (plan.hasErrors && !opts.allowErrors) {
    throw new ImportBlockedError(plan.issues.filter((i) => i.severity === 'error').length);
  }
  if (!plan.ops.length) return { created: 0, updated: 0, deleted: 0, unchanged: 0, ids: [] };
  return repo.applyBatch(plan.ops);
}

/**
 * Datenbestand für Export und Import-Planung – inkl. gelöschter Zeilen (ID-Suche beim Import,
 * Codes gelöschter Projekte an Zeiteinträgen beim Export).
 */
export async function loadSnapshot(repo: Pick<Repository, 'list'>): Promise<PlannerSnapshot> {
  const all = { includeDeleted: true };
  const [projects, milestones, work_packages, tasks, time_logs] = await Promise.all([
    repo.list('projects', all),
    repo.list('milestones', all),
    repo.list('work_packages', all),
    repo.list('tasks', all),
    repo.list('time_logs', all),
  ]);
  return { projects, milestones, work_packages, tasks, time_logs };
}
