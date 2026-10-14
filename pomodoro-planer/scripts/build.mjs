// Baut aus den Quelldateien zwei Einzeldateien (keine Abhängigkeiten nötig):
//   download/pomodoro-planer.html  – Offline-Datei zum Herunterladen (Doppelklick öffnet sie)
//   dist/artifact.html             – Seitenfragment für die Veröffentlichung auf claude.ai
// Aufruf: node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const write = (p, s) => { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), s); };

const html = read('index.html');
const css = read('css/app.css');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const js = scripts.map((src) => `/* ${src} */\n${read(src)}`).join('\n');
if (/<\/script/i.test(js) || /<\/style/i.test(css)) throw new Error('Schliessendes Tag im Inline-Code gefunden');

const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'))
  .replace(/\s*<script src="[^"]+"><\/script>/g, '')
  .trim();
const fonts = [...html.matchAll(/<link rel="(?:preconnect|stylesheet)" href="https:\/\/fonts[^>]*>/g)].map((m) => m[0]).join('\n');
const icon = `data:image/svg+xml,${encodeURIComponent(read('icons/icon.svg').replace(/\s+/g, ' '))}`;

const standalone = `<!doctype html>
<html lang="de-CH">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Pomodoro-Planer</title>
<meta name="theme-color" content="#edf1f0">
<link rel="icon" type="image/svg+xml" href="${icon}">
${fonts}
<style>
${css}
</style>
</head>
<body>
${body}
<script>window.PP_BUILD = 'standalone';</script>
<script>
${js}
</script>
</body>
</html>
`;

const artifact = `<title>Pomodoro-Planer</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#edf1f0">
${fonts}
<style>
${css}
</style>
${body}
<script>window.PP_BUILD = 'artifact';</script>
<script>
${js}
</script>
`;

write('download/pomodoro-planer.html', standalone);
write('dist/artifact.html', artifact);
console.log(`download/pomodoro-planer.html  ${(standalone.length / 1024).toFixed(0)} KB`);
console.log(`dist/artifact.html             ${(artifact.length / 1024).toFixed(0)} KB`);
