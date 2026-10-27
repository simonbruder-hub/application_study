import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Windows unterscheidet nicht zwischen Gross- und Kleinschreibung: Liegen «sudoku.ts» und
 * «Sudoku.tsx» im selben Ordner, findet `import './Sudoku'` dort die falsche Datei und der
 * Desktop-Build bricht ab. Dieser Test findet solche Paare schon unter Linux.
 */
function* folders(dir: string): Generator<string> {
  yield dir;
  for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) yield* folders(join(dir, e.name));
}

it('keine Dateinamen, die sich nur in der Gross- und Kleinschreibung unterscheiden', () => {
  const src = fileURLToPath(new URL('..', import.meta.url));
  const clashes: string[] = [];
  for (const dir of folders(src)) {
    const seen = new Map<string, string>();
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      const name = e.name;
      const key = name.replace(/\.(test\.)?(tsx?|jsx?|mjs)$/, '$1').toLowerCase();
      const other = seen.get(key);
      if (other && other !== name) clashes.push(`${join(dir, other)} / ${name}`);
      seen.set(key, name);
    }
  }
  expect(clashes).toEqual([]);
});
