/**
 * Sudoku-Logik ohne DOM: Rätsel erzeugen (eindeutige Lösung), Kandidaten, Konflikte und Tipps.
 * Felder als Array mit 81 Zahlen, 0 = leer; Index = Zeile * 9 + Spalte.
 */

export type Level = 'anfaenger' | 'amateur' | 'profi' | 'experte';

export const LEVELS: { id: Level; label: string; clues: number; points: number }[] = [
  { id: 'anfaenger', label: 'Anfänger', clues: 44, points: 100 },
  { id: 'amateur', label: 'Amateur', clues: 35, points: 200 },
  { id: 'profi', label: 'Profi', clues: 29, points: 400 },
  { id: 'experte', label: 'Experte', clues: 24, points: 800 },
];

export const row = (i: number) => Math.floor(i / 9);
export const col = (i: number) => i % 9;
export const box = (i: number) => Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3);

/** Alle Felder, die i sehen (gleiche Zeile, Spalte oder Block), ohne i selbst */
export const PEERS: number[][] = Array.from({ length: 81 }, (_, i) => {
  const out: number[] = [];
  for (let j = 0; j < 81; j++) if (j !== i && (row(j) === row(i) || col(j) === col(i) || box(j) === box(i))) out.push(j);
  return out;
});
/** Die 27 Einheiten: 9 Zeilen, 9 Spalten, 9 Blöcke */
export const UNITS: { kind: 'Zeile' | 'Spalte' | 'Block'; cells: number[] }[] = [
  ...Array.from({ length: 9 }, (_, r) => ({ kind: 'Zeile' as const, cells: Array.from({ length: 9 }, (_, c) => r * 9 + c) })),
  ...Array.from({ length: 9 }, (_, c) => ({ kind: 'Spalte' as const, cells: Array.from({ length: 9 }, (_, r) => r * 9 + c) })),
  ...Array.from({ length: 9 }, (_, b) => ({ kind: 'Block' as const, cells: Array.from({ length: 9 }, (_, k) => (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3)) })),
];

/** Bitmaske der möglichen Zahlen (Bit n = Zahl n) */
export function candMask(board: readonly number[], i: number): number {
  if (board[i]) return 0;
  let used = 0;
  for (const j of PEERS[i]!) used |= 1 << board[j]!;
  return ~used & 0b1111111110;
}
export const maskToList = (m: number) => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => m & (1 << n));
const bits = (m: number) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };

/** Darf n in Feld i stehen (ohne auf das Feld selbst zu schauen)? */
export const allowed = (board: readonly number[], i: number, n: number) => PEERS[i]!.every((j) => board[j] !== n);

/** Zählt Lösungen bis limit (Rückverfolgung mit dem engsten Feld zuerst) */
export function countSolutions(board: number[], limit = 2): number {
  let best = -1;
  let bestMask = 0;
  let bestCount = 10;
  for (let i = 0; i < 81; i++) {
    if (board[i]) continue;
    const m = candMask(board, i);
    const c = bits(m);
    if (c === 0) return 0;
    if (c < bestCount) { best = i; bestMask = m; bestCount = c; if (c === 1) break; }
  }
  if (best < 0) return 1;
  let total = 0;
  for (const n of maskToList(bestMask)) {
    board[best] = n;
    total += countSolutions(board, limit - total);
    board[best] = 0;
    if (total >= limit) break;
  }
  return total;
}

function fill(board: number[], rng: () => number): boolean {
  const i = board.indexOf(0);
  if (i < 0) return true;
  const options = maskToList(candMask(board, i)).sort(() => rng() - 0.5);
  for (const n of options) {
    board[i] = n;
    if (fill(board, rng)) return true;
  }
  board[i] = 0;
  return false;
}

/** Neues Rätsel: volle Lösung erzeugen, dann Felder entfernen, solange die Lösung eindeutig bleibt */
export function generate(level: Level, rng: () => number = Math.random): { puzzle: number[]; solution: number[] } {
  const solution = Array<number>(81).fill(0);
  fill(solution, rng);
  const target = LEVELS.find((l) => l.id === level)!.clues;
  const puzzle = [...solution];
  const order = Array.from({ length: 81 }, (_, i) => i).sort(() => rng() - 0.5);
  let clues = 81;
  for (const i of order) {
    if (clues <= target) break;
    // symmetrisch entfernen (wie in gedruckten Rätseln), wenn möglich
    const j = 80 - i;
    const pair = j !== i && puzzle[j] ? [i, j] : [i];
    if (!puzzle[i]) continue;
    const saved = pair.map((k) => puzzle[k]!);
    for (const k of pair) puzzle[k] = 0;
    if (countSolutions([...puzzle]) === 1) clues -= pair.length;
    else pair.forEach((k, n) => { puzzle[k] = saved[n]!; });
  }
  // zweiter Durchgang: einzelne Felder, falls die Stufe noch weniger Vorgaben verlangt
  for (const i of order) {
    if (clues <= target) break;
    if (!puzzle[i]) continue;
    const v = puzzle[i]!;
    puzzle[i] = 0;
    if (countSolutions([...puzzle]) === 1) clues -= 1;
    else puzzle[i] = v;
  }
  return { puzzle, solution };
}

export interface Hint { index: number; value: number; text: string; unit?: number[] }

/**
 * Nächster Schritt als Tipp: zuerst ein Fehler, dann ein Feld mit nur einer Möglichkeit, dann eine Zahl,
 * die in einer Einheit nur noch einen Platz hat; sonst einfach ein sicheres Feld aus der Lösung.
 */
export function findHint(board: readonly number[], solution: readonly number[]): Hint | null {
  for (let i = 0; i < 81; i++) {
    if (board[i] && board[i] !== solution[i]) return { index: i, value: solution[i]!, text: `Hier gehört nicht die ${board[i]} hin, sondern die ${solution[i]}.` };
  }
  for (let i = 0; i < 81; i++) {
    if (board[i]) continue;
    const list = maskToList(candMask(board, i));
    if (list.length === 1) {
      return { index: i, value: list[0]!, text: `In diesem Feld ist nur die ${list[0]} möglich: alle anderen Zahlen stehen schon in Zeile, Spalte oder Block.`, unit: PEERS[i] };
    }
  }
  for (const u of UNITS) {
    for (let n = 1; n <= 9; n++) {
      if (u.cells.some((i) => board[i] === n)) continue;
      const spots = u.cells.filter((i) => !board[i] && allowed(board, i, n));
      if (spots.length === 1) {
        const article = u.kind === 'Block' ? 'diesem Block' : `dieser ${u.kind}`;
        return { index: spots[0]!, value: n, text: `Die ${n} passt in ${article} nur an diese Stelle.`, unit: u.cells };
      }
    }
  }
  const empty = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (!empty.length) return null;
  const i = empty[Math.floor(empty.length / 2)]!;
  return { index: i, value: solution[i]!, text: `Hier ist die ${solution[i]} sicher.` };
}

/** Punkte beim Lösen: Stufe, Zeitbonus, Abzug für Tipps und Fehler */
export function scoreFor(level: Level, seconds: number, hints: number, mistakes: number): number {
  const base = LEVELS.find((l) => l.id === level)!.points;
  const timeBonus = Math.max(0, 300 - Math.floor(seconds / 60) * 10);
  return Math.max(10, base + timeBonus - hints * 25 - mistakes * 10);
}
