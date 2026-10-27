import { describe, expect, it } from 'vitest';
import { allowed, countSolutions, findHint, generate, LEVELS, scoreFor } from './sudokuLogic';
import { seeded } from './types';

describe('Sudoku', () => {
  it('erzeugt je Stufe ein Rätsel mit genau einer Lösung, die zu den Vorgaben passt', () => {
    for (const l of LEVELS) {
      const { puzzle, solution } = generate(l.id, seeded(l.clues));
      const clues = puzzle.filter(Boolean).length;
      expect(clues).toBeLessThanOrEqual(l.clues + 4);
      expect(countSolutions([...puzzle])).toBe(1);
      puzzle.forEach((v, i) => { if (v) expect(v).toBe(solution[i]); });
      // Lösung gültig: jede Zahl erlaubt, wenn man sie kurz entfernt
      solution.forEach((v, i) => { const b = [...solution]; b[i] = 0; expect(allowed(b, i, v)).toBe(true); });
    }
  });

  it('gibt Tipps: zuerst Fehler, dann sichere Felder mit Begründung', () => {
    const { puzzle, solution } = generate('anfaenger', seeded(3));
    const wrongAt = puzzle.indexOf(0);
    const board = [...puzzle];
    board[wrongAt] = (solution[wrongAt]! % 9) + 1;
    expect(findHint(board, solution)!.text).toMatch(/nicht die/);
    const h = findHint(puzzle, solution)!;
    expect(h.value).toBe(solution[h.index]);
    expect(puzzle[h.index]).toBe(0);
  });

  it('vergibt mehr Punkte für schwerere Stufen, weniger für Tipps und Fehler', () => {
    expect(scoreFor('experte', 600, 0, 0)).toBeGreaterThan(scoreFor('anfaenger', 600, 0, 0));
    expect(scoreFor('profi', 600, 2, 1)).toBe(scoreFor('profi', 600, 0, 0) - 60);
    expect(scoreFor('anfaenger', 99999, 20, 20)).toBe(10);
  });
});
