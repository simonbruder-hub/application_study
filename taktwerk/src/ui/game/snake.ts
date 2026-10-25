/**
 * Dschungelschlange (Stil Dschungel): Snake auf dem Waldboden. Früchte lassen die Schlange wachsen, goldene
 * Früchte und krabbelnde Käfer geben Extrapunkte. Mit jeder Stufe wird sie schneller und es liegen mehr
 * Felsen herum. Ab Stufe 2 schleicht ab und zu ein Tiger quer durchs Feld: Kopf erwischt kostet ein Leben,
 * sonst beisst er nur ein Stück Schwanz ab. Steuern mit Pfeiltasten oder Wischen; die Bewegung wird zwischen
 * den Rasterschritten weich gezeichnet.
 */
import { burst, drawBanner, drawFloats, drawSparks, type Engine, type Float, type Input, moveFloats, moveSparks, type Spark } from './types';

const W = 360;
const H = 560;
export const CELL = 20;
export const COLS = W / CELL;
export const ROWS = H / CELL;

export interface Cell { x: number; y: number }
export type FruitKind = 'mango' | 'banana' | 'gold' | 'beetle';
interface Fruit extends Cell { kind: FruitKind; life: number; move: number; born: number }
interface Tiger { row: number; x: number; dir: 1 | -1; warn: number }

export interface SnakeGame {
  body: Cell[];
  prev: Cell[];
  dir: Cell;
  queue: Cell[];
  step: number;
  acc: number;
  grow: number;
  fruits: Fruit[];
  rocks: Cell[];
  tiger: Tiger | null;
  nextTiger: number;
  nextGold: number;
  lives: number;
  score: number;
  level: number;
  eaten: number;
  combo: number;
  comboT: number;
  inv: number;
  time: number;
  touch: { x: number; y: number } | null;
  sparks: Spark[];
  floats: Float[];
  banner: { text: string; t: number } | null;
  over: boolean;
  rng: () => number;
}

export const POINTS: Record<FruitKind, number> = { mango: 10, banana: 15, gold: 50, beetle: 30 };
const GROW: Record<FruitKind, number> = { mango: 1, banana: 2, gold: 3, beetle: 2 };

const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const inside = (c: Cell) => c.x >= 0 && c.y >= 0 && c.x < COLS && c.y < ROWS;
const speedOf = (level: number) => Math.max(0.07, 0.15 - (level - 1) * 0.011);

function startBody(): Cell[] {
  const x = Math.floor(COLS / 2), y = ROWS - 8;
  return [0, 1, 2, 3].map((k) => ({ x, y: y + k }));
}

export function createSnake(rng: () => number = Math.random): SnakeGame {
  const body = startBody();
  const g: SnakeGame = {
    body, prev: body.map((c) => ({ ...c })), dir: { x: 0, y: -1 }, queue: [], step: speedOf(1), acc: 0, grow: 0,
    fruits: [], rocks: [], tiger: null, nextTiger: 28, nextGold: 12,
    lives: 3, score: 0, level: 1, eaten: 0, combo: 0, comboT: 0, inv: 0, time: 0, touch: null,
    sparks: [], floats: [], banner: null, over: false, rng,
  };
  spawnFruit(g, 'mango');
  return g;
}

function occupied(g: SnakeGame, c: Cell): boolean {
  return g.body.some((b) => same(b, c)) || g.rocks.some((r) => same(r, c)) || g.fruits.some((f) => same(f, c))
    || (g.tiger !== null && g.tiger.row === c.y && Math.abs(Math.round(g.tiger.x) - c.x) <= 1);
}

function freeCell(g: SnakeGame, away = 0): Cell | null {
  const head = g.body[0]!;
  for (let i = 0; i < 300; i++) {
    const c = { x: Math.floor(g.rng() * COLS), y: Math.floor(g.rng() * ROWS) };
    if (occupied(g, c)) continue;
    if (away && Math.abs(c.x - head.x) + Math.abs(c.y - head.y) < away) continue;
    return c;
  }
  return null;
}

function spawnFruit(g: SnakeGame, kind: FruitKind): void {
  const c = freeCell(g, kind === 'gold' ? 5 : 2);
  if (!c) return;
  g.fruits.push({ ...c, kind, life: kind === 'gold' ? 7 : kind === 'beetle' ? 12 : Infinity, move: 0.5, born: g.time });
}

/** Richtung vormerken (höchstens zwei Schritte im Voraus, keine Umkehr) */
export function steer(g: SnakeGame, d: Cell): void {
  const last = g.queue.length ? g.queue[g.queue.length - 1]! : g.dir;
  if (same(d, last) || (d.x === -last.x && d.y === -last.y)) return;
  if (g.queue.length < 2) g.queue.push(d);
}

function readInput(g: SnakeGame, input: Input): void {
  if (input.dx || input.dy) {
    // Beide Achsen gedrückt: die Richtung quer zur aktuellen nehmen
    const horizontal = input.dx !== 0 && (input.dy === 0 || g.dir.y !== 0);
    steer(g, horizontal ? { x: Math.sign(input.dx), y: 0 } : { x: 0, y: Math.sign(input.dy) });
  }
  // Wischen: ab 22 Einheiten Weg zählt die Hauptrichtung, danach neuer Startpunkt
  if (input.target) {
    if (!g.touch) g.touch = { ...input.target };
    const dx = input.target.x - g.touch.x, dy = input.target.y - g.touch.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 22) {
      steer(g, Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) });
      g.touch = { ...input.target };
    }
  } else g.touch = null;
}

function lose(g: SnakeGame, events: string[], text: string): void {
  const head = g.body[0]!;
  burst(g.sparks, g.rng, head.x * CELL + CELL / 2, head.y * CELL + CELL / 2, '#ff6b6b', 18);
  g.floats.push({ x: head.x * CELL + CELL / 2, y: head.y * CELL, text, color: '#ff8787', life: 1.2 });
  g.lives -= 1;
  g.combo = 0;
  events.push('hit');
  if (g.lives <= 0) { g.over = true; events.push('over'); return; }
  // Neu ansetzen: halbe Länge, Mitte unten, nach oben; Felsen in der Startspalte räumen
  const len = Math.max(4, Math.floor(g.body.length / 2));
  const x = Math.floor(COLS / 2), y = ROWS - 8;
  g.body = Array.from({ length: len }, (_, k) => ({ x, y: Math.min(ROWS - 1, y + k) }));
  g.prev = g.body.map((c) => ({ ...c }));
  g.rocks = g.rocks.filter((r) => Math.abs(r.x - x) > 1 || r.y < y - 10);
  g.dir = { x: 0, y: -1 };
  g.queue = [];
  g.grow = 0;
  g.acc = 0;
  g.inv = 2;
}

function tick(g: SnakeGame, events: string[]): void {
  const next = g.queue.shift();
  if (next) g.dir = next;
  const head = g.body[0]!;
  const nh = { x: head.x + g.dir.x, y: head.y + g.dir.y };
  if (!inside(nh)) { lose(g, events, 'Dickicht!'); return; }
  if (g.inv <= 0) {
    if (g.rocks.some((r) => same(r, nh))) { lose(g, events, 'Fels!'); return; }
    // Der Schwanz rückt im selben Schritt weiter, ausser die Schlange wächst gerade
    const bodyHit = g.body.findIndex((b, i) => same(b, nh) && (i < g.body.length - 1 || g.grow > 0));
    if (bodyHit >= 0) { lose(g, events, 'Autsch!'); return; }
  }
  g.prev = g.body.map((c) => ({ ...c }));
  g.body.unshift(nh);
  if (g.grow > 0) g.grow -= 1;
  else g.body.pop();
  const fi = g.fruits.findIndex((f) => same(f, nh));
  if (fi >= 0) {
    const f = g.fruits[fi]!;
    g.fruits.splice(fi, 1);
    g.combo = g.comboT > 0 ? Math.min(g.combo + 1, 6) : 1;
    g.comboT = 3.2;
    const mult = g.combo >= 5 ? 3 : g.combo >= 3 ? 2 : 1;
    const pts = POINTS[f.kind] * mult;
    g.score += pts;
    g.grow += GROW[f.kind];
    const px = nh.x * CELL + CELL / 2, py = nh.y * CELL + CELL / 2;
    burst(g.sparks, g.rng, px, py, f.kind === 'gold' ? '#ffd60a' : f.kind === 'beetle' ? '#4cc9f0' : '#ffb703', f.kind === 'gold' ? 18 : 10, 110);
    g.floats.push({ x: px, y: py - 8, text: `+${pts}${mult > 1 ? ` ×${mult}` : ''}`, color: '#fff3b0', life: 0.9 });
    events.push(f.kind === 'gold' ? 'gold' : f.kind === 'beetle' ? 'beetle' : 'eat');
    if (f.kind === 'mango' || f.kind === 'banana') {
      g.eaten += 1;
      spawnFruit(g, g.rng() < 0.3 ? 'banana' : 'mango');
      const level = 1 + Math.floor(g.eaten / 6);
      if (level > g.level) {
        g.level = level;
        g.step = speedOf(level);
        for (let k = 0; k < 2; k++) {
          const c = freeCell(g, 5);
          // Nicht direkt in den Weg vor dem Kopf
          if (c && !(c.x === nh.x && Math.sign(c.y - nh.y) === g.dir.y) && !(c.y === nh.y && Math.sign(c.x - nh.x) === g.dir.x)) g.rocks.push(c);
        }
        g.banner = { text: `Stufe ${level}`, t: 1.4 };
        events.push('level');
      }
    }
  }
}

function stepTiger(g: SnakeGame, dt: number, events: string[]): void {
  if (g.level >= 2) g.nextTiger -= dt;
  if (!g.tiger && g.nextTiger <= 0) {
    const head = g.body[0]!;
    let row = 3 + Math.floor(g.rng() * (ROWS - 6));
    if (Math.abs(row - head.y) < 3) row = (row + 8) % (ROWS - 4) + 2;
    const dir: 1 | -1 = g.rng() < 0.5 ? 1 : -1;
    g.tiger = { row, x: dir > 0 ? -2 : COLS + 1, dir, warn: 1.4 };
    g.nextTiger = 22 + g.rng() * 14;
    g.banner = { text: 'Tiger!', t: 1.2 };
    events.push('tiger');
  }
  const t = g.tiger;
  if (!t) return;
  if (t.warn > 0) { t.warn -= dt; return; }
  t.x += t.dir * 4.2 * dt;
  if (t.x < -4 || t.x > COLS + 4) { g.tiger = null; return; }
  if (g.inv > 0) return;
  const cx = Math.round(t.x);
  const idx = g.body.findIndex((b) => b.y === t.row && Math.abs(b.x - cx) <= 1);
  if (idx === 0) lose(g, events, 'Vom Tiger erwischt!');
  else if (idx > 0) {
    const keep = Math.max(3, idx);
    const lost = g.body.length - keep;
    if (lost > 0) {
      const b = g.body[keep]!;
      burst(g.sparks, g.rng, b.x * CELL + CELL / 2, b.y * CELL + CELL / 2, '#f08c1e', 12);
      g.floats.push({ x: b.x * CELL + CELL / 2, y: b.y * CELL, text: 'Biss!', color: '#ffb366', life: 1 });
      g.body = g.body.slice(0, keep);
      g.prev = g.prev.slice(0, keep);
      events.push('bite');
    }
  }
}

export function stepSnake(g: SnakeGame, dt: number, input: Input): string[] {
  const events: string[] = [];
  dt = Math.min(dt, 0.05);
  g.sparks = moveSparks(g.sparks, dt);
  g.floats = moveFloats(g.floats, dt);
  if (g.banner) { g.banner.t -= dt; if (g.banner.t <= 0) g.banner = null; }
  if (g.over) return events;
  g.time += dt;
  g.inv = Math.max(0, g.inv - dt);
  g.comboT = Math.max(0, g.comboT - dt);
  if (g.comboT <= 0) g.combo = 0;
  readInput(g, input);

  // Goldfrucht ab und zu, Käfer krabbeln umher
  g.nextGold -= dt;
  if (g.nextGold <= 0) { spawnFruit(g, g.rng() < 0.5 ? 'gold' : 'beetle'); g.nextGold = 9 + g.rng() * 8; }
  for (const f of g.fruits) {
    f.life -= dt;
    if (f.kind !== 'beetle') continue;
    f.move -= dt;
    if (f.move <= 0) {
      f.move = 0.55;
      const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
      const d = dirs[Math.floor(g.rng() * 4)]!;
      const c = { x: f.x + d.x, y: f.y + d.y };
      if (inside(c) && !occupied(g, c)) { f.x = c.x; f.y = c.y; }
    }
  }
  g.fruits = g.fruits.filter((f) => f.life > 0);
  if (!g.fruits.some((f) => f.kind === 'mango' || f.kind === 'banana')) spawnFruit(g, 'mango');

  stepTiger(g, dt, events);
  if (g.over) return events;
  g.acc += dt;
  while (g.acc >= g.step && !g.over) {
    g.acc -= g.step;
    tick(g, events);
  }
  return events;
}

/* ---------- Zeichnen ---------- */

const cache: { k: number; bg: HTMLCanvasElement | null } = { k: 0, bg: null };
const hash = (i: number, s: number) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };

function leafShape(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, w: number, rot: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(len * 0.25, -w, len * 0.7, -w * 0.9, len, 0);
  ctx.bezierCurveTo(len * 0.7, w * 0.9, len * 0.25, w, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(len * 0.95, 0); ctx.stroke();
  ctx.restore();
}

function backdrop(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a6b2f'); g.addColorStop(1, '#1b4f24');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Rasterfelder leicht schattiert (Moos)
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if ((x + y) % 2 === 0) { ctx.fillStyle = 'rgba(255, 255, 255, 0.035)'; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); }
  }
  // Gefleckte Lichtpunkte durchs Blätterdach
  for (let i = 0; i < 14; i++) {
    const x = hash(i, 1) * W, y = hash(i, 2) * H, r = 24 + hash(i, 3) * 40;
    const l = ctx.createRadialGradient(x, y, 0, x, y, r);
    l.addColorStop(0, 'rgba(230, 255, 160, 0.12)'); l.addColorStop(1, 'rgba(230, 255, 160, 0)');
    ctx.fillStyle = l; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Laub am Boden
  const tones = ['rgba(120, 90, 40, 0.35)', 'rgba(60, 130, 50, 0.45)', 'rgba(150, 120, 50, 0.3)'];
  for (let i = 0; i < 46; i++) leafShape(ctx, hash(i, 4) * W, hash(i, 5) * H, 8 + hash(i, 6) * 8, 3 + hash(i, 7) * 2, hash(i, 8) * Math.PI * 2, tones[i % 3]!);
  // Rand: Blätterwand
  const edge = ['#123d1a', '#17502a', '#0f3316'];
  for (let i = 0; i < 40; i++) {
    const t = i / 40;
    const side = i % 4;
    const x = side === 0 ? t * W : side === 1 ? W : side === 2 ? (1 - t) * W : 0;
    const y = side === 0 ? 0 : side === 1 ? t * H : side === 2 ? H : (1 - t) * H;
    const inward = side === 0 ? Math.PI / 2 : side === 1 ? Math.PI : side === 2 ? -Math.PI / 2 : 0;
    leafShape(ctx, x, y, 14 + hash(i, 9) * 10, 5, inward + (hash(i, 10) - 0.5) * 1.2, edge[i % 3]!);
  }
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, 'rgba(0, 0, 0, 0)'); v.addColorStop(1, 'rgba(0, 20, 5, 0.45)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

function drawRock(ctx: CanvasRenderingContext2D, c: Cell): void {
  const x = c.x * CELL + CELL / 2, y = c.y * CELL + CELL / 2;
  const g = ctx.createRadialGradient(x - 4, y - 5, 1, x, y, 12);
  g.addColorStop(0, '#b8b8ad'); g.addColorStop(1, '#5b5e57');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; ctx.beginPath(); ctx.ellipse(x + 2, y + 6, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(x - 9, y + 4); ctx.lineTo(x - 7, y - 5); ctx.lineTo(x, y - 9); ctx.lineTo(x + 8, y - 4); ctx.lineTo(x + 9, y + 5); ctx.lineTo(x + 1, y + 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(110, 170, 70, 0.75)'; ctx.beginPath(); ctx.ellipse(x - 3, y - 6, 5, 2.4, -0.4, 0, Math.PI * 2); ctx.fill();
}

function drawFruit(ctx: CanvasRenderingContext2D, f: Fruit, t: number): void {
  const x = f.x * CELL + CELL / 2;
  const y = f.y * CELL + CELL / 2 + Math.sin(t * 4 + f.x) * 1.2;
  const fade = f.life < 2 && Math.floor(f.life * 6) % 2 === 0 ? 0.35 : 1;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctx.beginPath(); ctx.ellipse(x + 1, y + 8, 7, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  switch (f.kind) {
    case 'mango': {
      const g = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 10);
      g.addColorStop(0, '#ffd166'); g.addColorStop(0.55, '#f77f00'); g.addColorStop(1, '#c1121f');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 7.5, 8.5, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2d8a3e'; ctx.beginPath(); ctx.ellipse(x + 3, y - 8, 4, 1.8, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'; ctx.beginPath(); ctx.ellipse(x - 3, y - 3, 2, 1.2, -0.6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'banana': {
      ctx.strokeStyle = '#ffd60a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x + 4, y - 6, 10, Math.PI * 0.55, Math.PI * 1.15); ctx.stroke();
      ctx.strokeStyle = '#b58900'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + 4, y - 6, 12.5, Math.PI * 0.58, Math.PI * 1.1); ctx.stroke();
      ctx.fillStyle = '#5a3d1a'; ctx.fillRect(x - 4, y - 11, 3, 3);
      break;
    }
    case 'gold': {
      ctx.shadowColor = '#ffd60a'; ctx.shadowBlur = 14 + Math.sin(t * 8) * 5;
      const g = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 10);
      g.addColorStop(0, '#fffbe0'); g.addColorStop(0.5, '#ffd60a'); g.addColorStop(1, '#c99700');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 8.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fffbe0'; ctx.lineWidth = 1.4;
      const s = 5 + Math.sin(t * 6) * 2;
      ctx.beginPath(); ctx.moveTo(x + 8, y - 10 - s); ctx.lineTo(x + 8, y - 10 + s); ctx.moveTo(x + 8 - s, y - 10); ctx.lineTo(x + 8 + s, y - 10); ctx.stroke();
      break;
    }
    case 'beetle': {
      const legs = Math.sin(t * 24) * 1.5;
      ctx.strokeStyle = '#0b2a2f'; ctx.lineWidth = 1.2;
      for (const s of [-1, 1]) for (const k of [-4, 0, 4]) { ctx.beginPath(); ctx.moveTo(x, y + k); ctx.lineTo(x + s * 9, y + k + (k ? legs * s : -legs)); ctx.stroke(); }
      const g = ctx.createLinearGradient(x - 6, y - 8, x + 6, y + 8);
      g.addColorStop(0, '#4cc9f0'); g.addColorStop(0.5, '#2a9d8f'); g.addColorStop(1, '#7b2cbf');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y + 1, 6.5, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)'; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 9); ctx.stroke();
      ctx.fillStyle = '#0b2a2f'; ctx.beginPath(); ctx.arc(x, y - 7, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'; ctx.beginPath(); ctx.ellipse(x - 2.5, y - 2, 1.4, 3, 0.2, 0, Math.PI * 2); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawTiger(ctx: CanvasRenderingContext2D, tg: Tiger, t: number): void {
  const y = tg.row * CELL + CELL / 2;
  if (tg.warn > 0) {
    // Warnung: Pfotenabdrücke am Rand, aus dem der Tiger kommt
    const x = tg.dir > 0 ? 14 : W - 14;
    ctx.fillStyle = `rgba(255, 140, 30, ${0.5 + Math.sin(t * 16) * 0.4})`;
    for (const [dx, dy, r] of [[0, 0, 4.5], [-4, -6, 2], [0, -8, 2], [4, -6, 2]] as const) { ctx.beginPath(); ctx.arc(x + dx * tg.dir, y + dy + 4, r, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(255, 140, 30, 0.12)'; ctx.fillRect(0, y - CELL / 2, W, CELL);
    return;
  }
  const x = tg.x * CELL + CELL / 2;
  const walk = Math.sin(t * 14);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(tg.dir, 1);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; ctx.beginPath(); ctx.ellipse(0, 9, 30, 6, 0, 0, Math.PI * 2); ctx.fill();
  // Beine
  ctx.fillStyle = '#e07a10';
  for (const [lx, ph] of [[-16, 1], [-8, -1], [10, -1], [18, 1]] as const) { ctx.beginPath(); ctx.ellipse(lx + walk * 3 * ph, ph > 0 ? 9 : -9, 4, 5, 0, 0, Math.PI * 2); ctx.fill(); }
  // Schwanz
  ctx.strokeStyle = '#f08c1e'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-24, 0); ctx.quadraticCurveTo(-36, -8 + walk * 4, -42, 2); ctx.stroke();
  // Körper mit Streifen
  const body = ctx.createLinearGradient(0, -10, 0, 10);
  body.addColorStop(0, '#f6a23b'); body.addColorStop(0.5, '#f08c1e'); body.addColorStop(1, '#d0700c');
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(-2, 0, 25, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1b1208';
  for (const sx of [-18, -10, -2, 6, 14]) { ctx.beginPath(); ctx.moveTo(sx, -11); ctx.quadraticCurveTo(sx + 3, -4, sx - 1, 0); ctx.quadraticCurveTo(sx + 3, 4, sx, 11); ctx.lineTo(sx + 2.5, 11); ctx.quadraticCurveTo(sx + 5, 4, sx + 2, 0); ctx.quadraticCurveTo(sx + 5, -4, sx + 2.5, -11); ctx.fill(); }
  // Kopf
  ctx.fillStyle = '#f08c1e'; ctx.beginPath(); ctx.arc(26, 0, 10, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(22, -9, 3.5, 0, Math.PI * 2); ctx.arc(22, 9, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff6e6'; ctx.beginPath(); ctx.ellipse(31, 0, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d8f06a'; ctx.beginPath(); ctx.arc(27, -4, 1.8, 0, Math.PI * 2); ctx.arc(27, 4, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e5737c'; ctx.beginPath(); ctx.arc(35, 0, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Mittelpunkte der Glieder, weich zwischen zwei Rasterschritten */
function segments(g: SnakeGame): { x: number; y: number }[] {
  const f = Math.min(1, g.acc / g.step);
  return g.body.map((c, i) => {
    const p = g.prev[Math.min(i, g.prev.length - 1)] ?? c;
    return { x: (p.x + (c.x - p.x) * f) * CELL + CELL / 2, y: (p.y + (c.y - p.y) * f) * CELL + CELL / 2 };
  });
}

function drawSnake(ctx: CanvasRenderingContext2D, g: SnakeGame): void {
  if (g.inv > 0 && Math.floor(g.inv * 8) % 2 === 0) return;
  const pts = segments(g);
  const n = pts.length;
  const width = (i: number) => 13 - (i / Math.max(1, n - 1)) * 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Schatten, Umriss, Körper, Bauchlicht
  for (const [color, extra, dy] of [['rgba(0, 0, 0, 0.28)', 0, 4], ['#0f3d18', 3, 0], ['#2fbf4a', 0, 0]] as const) {
    ctx.strokeStyle = color;
    for (let i = n - 1; i > 0; i--) {
      ctx.lineWidth = width(i) + extra;
      ctx.beginPath(); ctx.moveTo(pts[i]!.x, pts[i]!.y + dy); ctx.lineTo(pts[i - 1]!.x, pts[i - 1]!.y + dy); ctx.stroke();
    }
  }
  // Rautenmuster auf dem Rücken
  for (let i = 1; i < n; i += 1) {
    const a = pts[i]!, b = pts[i - 1]!;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const s = width(i) * 0.32;
    ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
    ctx.fillStyle = i % 2 ? '#f4f9d0' : '#1d8a35';
    ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(0, -s * 0.7); ctx.lineTo(s, 0); ctx.lineTo(0, s * 0.7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // Kopf in Bewegungsrichtung
  const h = pts[0]!;
  const nb = pts[1] ?? { x: h.x - g.dir.x, y: h.y - g.dir.y };
  const ang = n > 1 && (h.x !== nb.x || h.y !== nb.y) ? Math.atan2(h.y - nb.y, h.x - nb.x) : Math.atan2(g.dir.y, g.dir.x);
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(ang);
  if (g.time % 1.3 < 0.28) {
    ctx.strokeStyle = '#e63946'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(17, 0); ctx.lineTo(21, -3); ctx.moveTo(17, 0); ctx.lineTo(21, 3); ctx.stroke();
  }
  ctx.fillStyle = '#0f3d18'; ctx.beginPath(); ctx.ellipse(2, 0, 11.5, 9.5, 0, 0, Math.PI * 2); ctx.fill();
  const hg = ctx.createRadialGradient(0, -3, 1, 2, 0, 11);
  hg.addColorStop(0, '#57e06e'); hg.addColorStop(1, '#22a83e');
  ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(2, 0, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#f4e04d'; ctx.beginPath(); ctx.arc(4, s * 4.5, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(4.6, s * 4.5, 0.8, 2.2, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#0f3d18'; ctx.beginPath(); ctx.arc(10, -1.8, 0.8, 0, Math.PI * 2); ctx.arc(10, 1.8, 0.8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawSnakeGame(ctx: CanvasRenderingContext2D, g: SnakeGame): void {
  const k = ctx.getTransform().a || 1;
  if (cache.k !== k || !cache.bg) {
    const el = document.createElement('canvas');
    el.width = Math.round(W * k); el.height = Math.round(H * k);
    const c = el.getContext('2d')!; c.scale(k, k); backdrop(c);
    cache.k = k; cache.bg = el;
  }
  ctx.drawImage(cache.bg, 0, 0, W, H);
  for (const r of g.rocks) drawRock(ctx, r);
  for (const f of g.fruits) drawFruit(ctx, f, g.time);
  drawSnake(ctx, g);
  if (g.tiger) drawTiger(ctx, g.tiger, g.time);
  drawSparks(ctx, g.sparks);
  drawFloats(ctx, g.floats, '700 14px "Lilita One", Nunito, system-ui, sans-serif');
  if (g.banner) drawBanner(ctx, W, H * 0.42, g.banner.text, g.banner.text === 'Tiger!' ? '#ffb366' : '#ffd60a', Math.min(1, g.banner.t * 2), '400 22px "Lilita One", Nunito, system-ui, sans-serif');
}

export const snake: Engine<SnakeGame> = {
  W, H,
  create: createSnake,
  step: stepSnake,
  draw: drawSnakeGame,
  hud: (g) => [
    { label: 'Punkte', value: String(g.score) },
    { label: 'Länge', value: String(g.body.length), tone: 'c' },
    { label: 'Stufe', value: String(g.level), tone: 'a' },
    { label: 'Leben', value: '♥'.repeat(Math.max(0, g.lives)) || '–', tone: 'b' },
  ],
  score: (g) => g.score,
  over: (g) => g.over,
  tones: {
    eat: ['sine', 660, 990, 0.1, 0.04],
    gold: ['triangle', 880, 1760, 0.35, 0.05],
    beetle: ['square', 520, 1040, 0.14, 0.03],
    level: ['sine', 523, 1568, 0.45, 0.05],
    tiger: ['sawtooth', 140, 90, 0.6, 0.06],
    bite: ['sawtooth', 300, 120, 0.25, 0.05],
    hit: ['sawtooth', 220, 70, 0.45, 0.07],
    over: ['triangle', 392, 98, 1, 0.07],
  },
};
