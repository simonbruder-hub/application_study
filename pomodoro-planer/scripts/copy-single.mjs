// Kopiert die Einzeldatei der v2-App nach download/pomodoro-planer-v2.html
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'download'), { recursive: true });
copyFileSync(join(root, 'dist/single/index.html'), join(root, 'download/pomodoro-planer-v2.html'));
console.log('download/pomodoro-planer-v2.html geschrieben');
