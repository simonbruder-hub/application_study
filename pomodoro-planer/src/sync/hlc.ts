/**
 * Hybrid Logical Clock (vereinfachte Variante): liefert streng monoton steigende
 * Zeitstempel in Epoch-ms, die nie kleiner sind als jede bereits gesehene Änderung –
 * auch wenn die Uhr eines Geräts nachgeht. Damit gewinnt bei Last-Writer-Wins
 * immer die kausal spätere Änderung.
 */
export class HybridClock {
  private last: number;

  constructor(initial = 0, private readonly wall: () => number = Date.now) {
    this.last = Number.isFinite(initial) ? initial : 0;
  }

  /** Neuer Zeitstempel für eine lokale Änderung */
  now(): number {
    const t = Math.max(this.wall(), this.last + 1);
    this.last = t;
    return t;
  }

  /** Zeitstempel einer entfernten Änderung berücksichtigen */
  observe(ts: number | null | undefined): void {
    if (typeof ts === 'number' && Number.isFinite(ts) && ts > this.last) this.last = ts;
  }

  get value(): number {
    return this.last;
  }
}

/** Last-Writer-Wins: true, wenn a neuer ist als b (Tie-Breaker: Geräte-ID). */
export function isNewer(
  a: { updated_at: number; updated_by: string },
  b: { updated_at: number; updated_by: string },
): boolean {
  if (a.updated_at !== b.updated_at) return a.updated_at > b.updated_at;
  return (a.updated_by || '') > (b.updated_by || '');
}
