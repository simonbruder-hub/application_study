// Kopiert die Einzeldatei nach download/taktwerk.html
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'download'), { recursive: true });
copyFileSync(join(root, 'dist/single/index.html'), join(root, 'download/taktwerk.html'));
console.log('download/taktwerk.html geschrieben');
