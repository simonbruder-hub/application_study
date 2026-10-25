/**
 * Turm im Stil Baustelle: jeder geschaffte Pomodoro ist ein Stockwerk. Der Turm wächst durch die Wolken, auf
 * Flughöhe, ins Weltall zu den Satelliten, zum Mond, an Planeten und Meteoriten vorbei bis zum UFO. Nach
 * TOWER_CYCLE Stockwerken nimmt das UFO den Turm mit und der nächste Bau beginnt am Boden.
 */

export type StageKey = 'boden' | 'wolken' | 'flug' | 'orbit' | 'mond' | 'mars' | 'meteore' | 'jupiter' | 'saturn' | 'ufo';

export interface Stage { at: number; key: StageKey; name: string; to: string }

/** Abschnitte mit dem Stockwerk, ab dem sie beginnen; `to` steht in «Noch … bis …» */
export const STAGES: readonly Stage[] = [
  { at: 0, key: 'boden', name: 'Baustelle', to: 'zur Baustelle' },
  { at: 6, key: 'wolken', name: 'In den Wolken', to: 'zu den Wolken' },
  { at: 12, key: 'flug', name: 'Flughöhe', to: 'auf Flughöhe' },
  { at: 18, key: 'orbit', name: 'Weltall', to: 'ins Weltall' },
  { at: 24, key: 'mond', name: 'Mond', to: 'zum Mond' },
  { at: 30, key: 'mars', name: 'Mars', to: 'zum Mars' },
  { at: 36, key: 'meteore', name: 'Meteoritenschwarm', to: 'zu den Meteoriten' },
  { at: 42, key: 'jupiter', name: 'Jupiter', to: 'zum Jupiter' },
  { at: 48, key: 'saturn', name: 'Saturn', to: 'zum Saturn' },
  { at: 54, key: 'ufo', name: 'UFO', to: 'zum UFO' },
];

/** Stockwerke pro Turm; danach beginnt ein neuer Turm */
export const TOWER_CYCLE = 60;

export interface TowerState {
  /** fertige Stockwerke des aktuellen Turms */
  floors: number;
  /** wievielter Turm (1, 2, …) */
  round: number;
  stage: Stage;
  next: Stage | null;
  /** Stockwerke bis zum nächsten Abschnitt (bzw. bis das UFO den Turm holt) */
  left: number;
  /** gerade einen neuen Abschnitt erreicht (oberstes Stockwerk ist das erste darin) */
  reached: boolean;
  /** der letzte Turm wurde eben vom UFO geholt */
  restarted: boolean;
}

export const stageAt = (floor: number): Stage => {
  let s = STAGES[0]!;
  for (const st of STAGES) if (floor >= st.at) s = st;
  return s;
};

export function towerState(done: number): TowerState {
  const n = Math.max(0, Math.floor(done));
  const floors = n % TOWER_CYCLE;
  const stage = stageAt(floors);
  const next = STAGES.find((s) => s.at > floors) ?? null;
  return {
    floors,
    round: Math.floor(n / TOWER_CYCLE) + 1,
    stage,
    next,
    left: (next ? next.at : TOWER_CYCLE) - floors,
    reached: floors > 0 && stage.at === floors,
    restarted: floors === 0 && n > 0,
  };
}

/* ---------- Himmel: Farbe je Höhe ---------- */

const SKY: [number, string, string][] = [
  [0, '#8fd0ff', '#e3f5ff'],
  [6, '#5fb2f5', '#c4e6ff'],
  [12, '#2f6fc0', '#86bdee'],
  [18, '#0f1b46', '#2d5296'],
  [24, '#04050f', '#0c1233'],
];

function hex(c: string): [number, number, number] {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function mixHex(a: string, b: string, t: number): string {
  const q = Math.max(0, Math.min(1, t));
  const A = hex(a), B = hex(b);
  return `#${A.map((x, i) => Math.round(x + (B[i]! - x) * q).toString(16).padStart(2, '0')).join('')}`;
}

/** Himmelsfarbe oben und unten bei dieser Höhe (Stockwerke, auch Bruchteile) */
export function skyAt(alt: number): { top: string; bottom: string; stars: number } {
  let i = 0;
  while (i < SKY.length - 1 && alt >= SKY[i + 1]![0]) i++;
  const [a0, t0, b0] = SKY[i]!;
  const nx = SKY[i + 1];
  if (!nx) return { top: t0, bottom: b0, stars: 1 };
  const t = (alt - a0) / (nx[0] - a0);
  return { top: mixHex(t0, nx[1], t), bottom: mixHex(b0, nx[2], t), stars: Math.max(0, Math.min(1, (alt - 13) / 7)) };
}
