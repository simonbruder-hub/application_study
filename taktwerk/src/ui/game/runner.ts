/**
 * Baustellen-Run (Stil Baustelle): Der Elektriker rennt durch die Baustelle, Kamera hinter ihm (Pseudo-3D).
 * Drei Spuren; Absperrgitter und Stromkabel überspringen, unter Stahlträgern durchrutschen, Betonblöcken
 * ausweichen, über Baugruben springen. An Abzweigungen rechtzeitig links oder rechts abbiegen, sonst geht es
 * in den Bauzaun. Blitze sammeln, Helm schützt einmal, Kaffee macht kurz unverwundbar und schnell.
 * Eine Strassenwalze rollt hinterher und kommt nach jedem Fehler näher.
 */
import { burst, drawBanner, drawFloats, drawLoading, drawSparks, type Engine, type Float, type Input, lazyView, moveFloats, moveSparks, type Spark } from './types';

const W = 360;
const H = 560;
const HORIZON = 188;
const F = 280;
const CAM_H = 2.6;
export const CAM_BACK = 3;
export const FAR = 72;
export const LANE_W = 1;
export const HALF = 1.5;
export const FENCE = 2.15;
const GRAVITY = 26;
const JUMP_V = 9.4;

export type ObKind = 'barrier' | 'beam' | 'trench' | 'block' | 'cable' | 'bolt' | 'helmet' | 'coffee' | 'magnet';
export interface Ob { kind: ObKind; z: number; lane: number; y: number; len: number; hit: boolean }

export interface Run {
  /** Position im aktuellen Abschnitt (m) */
  pz: number;
  segLen: number;
  /** Abzweigung am Ende: −1 links, 1 rechts, 0 beides (T) */
  turn: -1 | 0 | 1;
  obs: Ob[];
  nextZ: number;
  lane: number;
  x: number;
  y: number;
  vy: number;
  slide: number;
  speed: number;
  dist: number;
  bolts: number;
  score: number;
  lives: number;
  inv: number;
  helmet: boolean;
  coffee: number;
  magnet: number;
  zap: number;
  chase: number;
  turnAnim: number;
  turnDir: number;
  camX: number;
  time: number;
  keys: { dx: number; dy: number; press: boolean };
  touch: { x: number; y: number; used: boolean } | null;
  sparks: Spark[];
  floats: Float[];
  banner: { text: string; t: number } | null;
  over: boolean;
  rng: () => number;
}

export function createRun(rng: () => number = Math.random): Run {
  const g: Run = {
    pz: 0, segLen: 0, turn: 1, obs: [], nextZ: 26, lane: 0, x: 0, y: 0, vy: 0, slide: 0, speed: 9, dist: 0, bolts: 0, score: 0,
    lives: 3, inv: 0, helmet: false, coffee: 0, magnet: 0, zap: 0, chase: 0.4, turnAnim: 0, turnDir: 0, camX: 0, time: 0,
    keys: { dx: 0, dy: 0, press: false }, touch: null, sparks: [], floats: [], banner: null, over: false, rng,
  };
  newSegment(g);
  return g;
}

function newSegment(g: Run): void {
  g.pz = 0;
  g.obs = [];
  g.segLen = 110 + Math.floor(g.rng() * 90);
  const r = g.rng();
  g.turn = r < 0.4 ? -1 : r < 0.8 ? 1 : 0;
  g.nextZ = 24;
}

const pick = <T,>(g: Run, xs: readonly T[]): T => xs[Math.floor(g.rng() * xs.length)]!;

/** Ein Hindernismuster ab z; immer mindestens ein Weg frei */
function spawnPattern(g: Run, z: number): number {
  const lanes = [-1, 0, 1];
  const r = g.rng();
  const add = (kind: ObKind, lane: number, dz = 0, y = 0, len = 0.6) => g.obs.push({ kind, z: z + dz, lane, y, len, hit: false });
  const coins = (lane: number, n: number, y = 0, dz = 0) => { for (let i = 0; i < n; i++) add('bolt', lane, dz + i * 1.6, y, 0.4); };
  if (r < 0.2) {
    // Absperrgitter auf zwei Spuren, Blitze über dem dritten oder zum Drüberspringen
    const free = pick(g, lanes);
    for (const l of lanes) if (l !== free) add('barrier', l);
    coins(free, 4, 0, -2);
  } else if (r < 0.36) {
    // Stahlträger auf Kopfhöhe über allen Spuren: rutschen
    for (const l of lanes) add('beam', l, 0, 1.15, 0.5);
    coins(pick(g, lanes), 3, 0, 3);
  } else if (r < 0.48) {
    // Baugrube über die ganze Breite: springen, Blitze im Bogen
    add('trench', 0, 0, 0, 2.2);
    for (let i = 0; i < 4; i++) add('bolt', pick(g, [0]), -1 + i * 1.3, 1.1 + Math.sin((i / 3) * Math.PI) * 0.9, 0.4);
  } else if (r < 0.66) {
    // Betonblöcke: zwei Spuren dicht
    const free = pick(g, lanes);
    for (const l of lanes) if (l !== free) add('block', l, (l + 1) * 0.3, 0, 1);
    coins(free, 5, 0, -3);
  } else if (r < 0.8) {
    // Funkendes Stromkabel quer: springen
    const lane = pick(g, lanes);
    add('cable', lane);
    add('cable', lane === 1 ? 0 : lane + 1, 0.2);
    coins(lane === -1 ? 1 : -1, 4, 0, -1);
  } else if (r < 0.9) {
    // Blitzlinie im Zickzack
    let l = pick(g, lanes);
    for (let i = 0; i < 6; i++) { add('bolt', l, i * 1.6, 0, 0.4); if (i % 2) l = Math.max(-1, Math.min(1, l + (g.rng() < 0.5 ? -1 : 1))); }
  } else {
    const kind = pick(g, ['helmet', 'coffee', 'magnet'] as const);
    add(kind, pick(g, lanes), 0, 0.6, 0.5);
    add('barrier', pick(g, lanes), 8);
  }
  return z + 14 + g.rng() * 10 + g.speed * 0.6;
}

function hurt(g: Run, events: string[], text: string, zap = false): void {
  if (g.inv > 0 || g.coffee > 0) return;
  if (g.helmet) {
    g.helmet = false;
    g.inv = 1;
    g.floats.push({ x: W / 2, y: 300, text: 'Helm hält!', color: '#ffffff', life: 1 });
    events.push('helmet');
    return;
  }
  g.lives -= 1;
  g.inv = 1.6;
  g.chase = 1;
  g.speed = Math.max(8, g.speed * 0.8);
  if (zap) { g.zap = 1; events.push('zap'); }
  g.floats.push({ x: W / 2, y: 290, text, color: '#ff8787', life: 1.1 });
  burst(g.sparks, g.rng, W / 2, 380, zap ? '#fff2a8' : '#ff9f43', 20, 160);
  events.push('hit');
  if (g.lives <= 0) { g.over = true; events.push('over'); }
}

function doTurn(g: Run, dir: -1 | 1, events: string[]): void {
  const over = g.pz - g.segLen;
  newSegment(g);
  g.pz = Math.max(0, over);
  g.turnAnim = 1;
  g.turnDir = dir;
  g.score += 25;
  g.floats.push({ x: W / 2, y: 260, text: '+25 Kurve', color: '#ffd60a', life: 0.9 });
  events.push('turn');
}

/** Tasten: Flanke erkennen; Wischen am Handy */
function actions(g: Run, input: Input): { left: boolean; right: boolean; up: boolean; down: boolean } {
  const a = { left: false, right: false, up: false, down: false };
  if (input.dx < 0 && g.keys.dx >= 0) a.left = true;
  if (input.dx > 0 && g.keys.dx <= 0) a.right = true;
  if (input.dy < 0 && g.keys.dy >= 0) a.up = true;
  if (input.dy > 0 && g.keys.dy <= 0) a.down = true;
  // Leertaste springt (Finger-Drücken nicht: dort springt man durch Wischen nach oben)
  if (input.press && !input.target) a.up = true;
  g.keys = { dx: input.dx, dy: input.dy, press: input.press };
  if (input.target) {
    if (!g.touch) g.touch = { ...input.target, used: false };
    const dx = input.target.x - g.touch.x, dy = input.target.y - g.touch.y;
    if (!g.touch.used && Math.max(Math.abs(dx), Math.abs(dy)) > 26) {
      if (Math.abs(dx) > Math.abs(dy)) { if (dx < 0) a.left = true; else a.right = true; }
      else if (dy < 0) a.up = true; else a.down = true;
      g.touch = { ...input.target, used: true };
    } else if (g.touch.used && Math.max(Math.abs(dx), Math.abs(dy)) > 40) g.touch = { ...input.target, used: false };
  } else g.touch = null;
  return a;
}

export function stepRun(g: Run, dt: number, input: Input): string[] {
  const events: string[] = [];
  dt = Math.min(dt, 0.05);
  g.sparks = moveSparks(g.sparks, dt);
  g.floats = moveFloats(g.floats, dt);
  if (g.banner) { g.banner.t -= dt; if (g.banner.t <= 0) g.banner = null; }
  if (g.over) return events;
  g.time += dt;
  g.inv = Math.max(0, g.inv - dt);
  g.coffee = Math.max(0, g.coffee - dt);
  g.magnet = Math.max(0, g.magnet - dt);
  g.zap = Math.max(0, g.zap - dt * 1.4);
  g.chase = Math.max(0.15, g.chase - dt * 0.12);
  g.turnAnim = Math.max(0, g.turnAnim - dt * 2.6);

  const a = actions(g, input);
  const toTurn = g.segLen - g.pz;
  const inWindow = toTurn < 6 && toTurn > -1.4;
  if (a.left || a.right) {
    const dir: -1 | 1 = a.left ? -1 : 1;
    if (inWindow && (g.turn === 0 || g.turn === dir)) doTurn(g, dir, events);
    else { g.lane = Math.max(-1, Math.min(1, g.lane + dir)); events.push('lane'); }
  }
  const onGround = g.y <= 0.001;
  if (a.up && onGround) { g.vy = JUMP_V; g.slide = 0; events.push('jump'); }
  if (a.down) { if (onGround) { g.slide = 0.75; events.push('slide'); } else g.vy = Math.min(g.vy, -14); }

  // Laufen, Spur wechseln, Sprung
  const target = g.speed + (g.coffee > 0 ? 6 : 0);
  const base = 9 + Math.min(9, g.dist / 160);
  g.speed += (base - g.speed) * Math.min(1, dt * 0.6);
  g.pz += target * dt;
  g.dist += target * dt;
  g.score += target * dt * 0.5;
  g.x += (g.lane * LANE_W - g.x) * Math.min(1, dt * 14);
  g.camX += (g.x * 0.55 - g.camX) * Math.min(1, dt * 6);
  g.vy -= GRAVITY * dt;
  g.y = Math.max(0, g.y + g.vy * dt);
  if (g.y <= 0) g.vy = Math.max(0, g.vy);
  g.slide = Math.max(0, g.slide - dt);

  // Abzweigung verpasst: in den Bauzaun
  if (g.segLen - g.pz < -1.4) {
    hurt(g, events, 'Bauzaun!');
    if (g.over) return events;
    g.inv = Math.max(g.inv, 1.6);
    doTurn(g, g.turn === 0 ? 1 : g.turn, events);
  }

  // Neue Hindernisse vor dem Läufer, nicht in die Kreuzung
  while (g.nextZ < g.pz + FAR && g.nextZ < g.segLen - 16) g.nextZ = spawnPattern(g, g.nextZ);

  const height = g.slide > 0 ? 0.8 : 1.75;
  for (const o of g.obs) {
    if (o.hit) continue;
    const rel = o.z - g.pz;
    if (g.magnet > 0 && o.kind === 'bolt' && rel < 14 && rel > 0) {
      o.lane += (g.x / LANE_W - o.lane) * Math.min(1, dt * 6);
      o.y += (g.y + 0.9 - o.y) * Math.min(1, dt * 4);
    }
    if (rel > o.len * 0.5 || rel < -o.len * 0.5 - 0.3) continue;
    const sameLane = o.kind === 'trench' || Math.abs(o.lane * LANE_W - g.x) < 0.55;
    if (!sameLane) continue;
    switch (o.kind) {
      case 'bolt':
        if (Math.abs(o.y - (g.y + 0.6)) < 1) {
          o.hit = true; g.bolts += 1; g.score += 10; events.push('bolt');
          burst(g.sparks, g.rng, W / 2 + (g.x - g.camX) * F / CAM_BACK, 330, '#ffd60a', 6, 60);
        }
        break;
      case 'helmet': o.hit = true; g.helmet = true; g.banner = { text: 'Schutzhelm', t: 1.2 }; events.push('power'); break;
      case 'coffee': o.hit = true; g.coffee = 4; g.banner = { text: 'Kaffee: Turbo!', t: 1.2 }; events.push('power'); break;
      case 'magnet': o.hit = true; g.magnet = 8; g.banner = { text: 'Magnet', t: 1.2 }; events.push('power'); break;
      case 'barrier': if (g.y < 0.85) { o.hit = true; hurt(g, events, 'Absperrung!'); } break;
      case 'cable': if (g.y < 0.35) { o.hit = true; hurt(g, events, 'Bzzzt!', true); } break;
      case 'beam': if (g.slide <= 0 || g.y > 0.2) { if (height + g.y > 1.15) { o.hit = true; hurt(g, events, 'Träger!'); } } break;
      case 'block': o.hit = true; hurt(g, events, 'Betonblock!'); break;
      case 'trench': if (g.y < 0.15 && rel < 0.6 && rel > -0.6) { o.hit = true; hurt(g, events, 'Baugrube!'); if (!g.over) { g.vy = JUMP_V * 0.7; } } break;
    }
    if (g.over) return events;
  }
  g.obs = g.obs.filter((o) => o.z - g.pz > -6 && !(o.hit && (o.kind === 'bolt' || o.kind === 'helmet' || o.kind === 'coffee' || o.kind === 'magnet')));
  return events;
}

/* ---------- Zeichnen ---------- */

interface P { x: number; y: number; s: number }
/** Welt (x seitlich, y hoch, d Tiefe ab Kamera) → Bildschirm; s = Massstab px pro m */
const proj = (g: Run, x: number, y: number, d: number): P => {
  const s = F / Math.max(0.3, d);
  return { x: W / 2 + (x - g.camX) * s, y: HORIZON + (CAM_H - y) * s, s };
};

const cache: { k: number; bg: HTMLCanvasElement | null } = { k: 0, bg: null };

function sky(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON + 10);
  g.addColorStop(0, '#3a6ea5'); g.addColorStop(0.55, '#8fbfe0'); g.addColorStop(1, '#ffd8a8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, HORIZON + 10);
  const sun = ctx.createRadialGradient(270, HORIZON - 40, 4, 270, HORIZON - 40, 70);
  sun.addColorStop(0, 'rgba(255, 245, 200, 1)'); sun.addColorStop(0.25, 'rgba(255, 220, 150, 0.8)'); sun.addColorStop(1, 'rgba(255, 200, 120, 0)');
  ctx.fillStyle = sun; ctx.fillRect(180, HORIZON - 120, 180, 140);
  // Skyline mit Kränen
  ctx.fillStyle = '#7b8aa0';
  let x = 0;
  for (let i = 0; x < W; i++) {
    const v = Math.sin(i * 12.9898) * 43758.5; const r = v - Math.floor(v);
    const w = 18 + r * 26, h = 20 + ((i * 37) % 5) * 9;
    ctx.fillRect(x, HORIZON - h, w - 2, h + 10);
    x += w;
  }
  ctx.strokeStyle = '#5d6b80'; ctx.lineWidth = 1.4;
  for (const [cx, h, len] of [[60, 80, 70], [250, 64, -60]] as const) {
    ctx.beginPath(); ctx.moveTo(cx, HORIZON); ctx.lineTo(cx, HORIZON - h); ctx.moveTo(cx - len * 0.3, HORIZON - h); ctx.lineTo(cx + len, HORIZON - h);
    ctx.moveTo(cx, HORIZON - h - 10); ctx.lineTo(cx + len, HORIZON - h); ctx.moveTo(cx, HORIZON - h - 10); ctx.lineTo(cx - len * 0.3, HORIZON - h);
    ctx.moveTo(cx + len * 0.7, HORIZON - h); ctx.lineTo(cx + len * 0.7, HORIZON - h + 24); ctx.stroke();
    for (let k = 0; k < h; k += 6) { ctx.beginPath(); ctx.moveTo(cx - 2, HORIZON - k); ctx.lineTo(cx + 2, HORIZON - k - 6); ctx.stroke(); }
  }
  // Dunst über dem Horizont
  const haze = ctx.createLinearGradient(0, HORIZON - 30, 0, HORIZON + 10);
  haze.addColorStop(0, 'rgba(255, 220, 180, 0)'); haze.addColorStop(1, 'rgba(255, 220, 180, 0.6)');
  ctx.fillStyle = haze; ctx.fillRect(0, HORIZON - 30, W, 40);
}

function quad(ctx: CanvasRenderingContext2D, a: P, b: P, c: P, d: P, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
}

/** Boden: Baustellenpiste mit Betonplatten, Spurlinien, Absperrkante; davor Erde */
function drawGround(ctx: CanvasRenderingContext2D, g: Run, endD: number): void {
  const dirt = ctx.createLinearGradient(0, HORIZON, 0, H);
  dirt.addColorStop(0, '#c9a77a'); dirt.addColorStop(1, '#8a6a46');
  ctx.fillStyle = dirt;
  ctx.fillRect(0, HORIZON, W, H - HORIZON);
  const step = 1;
  const start = Math.min(FAR, endD);
  for (let d = start; d > 0.6; d -= step) {
    const d0 = d, d1 = Math.max(0.6, d - step);
    const zw = g.pz + d0 - CAM_BACK;
    const slab = Math.floor(zw / 2) % 2 === 0;
    const fade = Math.min(1, (FAR - d0) / 20);
    ctx.globalAlpha = 0.35 + fade * 0.65;
    quad(ctx, proj(g, -HALF, 0, d0), proj(g, HALF, 0, d0), proj(g, HALF, 0, d1), proj(g, -HALF, 0, d1), slab ? '#9ea3a8' : '#b3b7bb');
    // Kante: gelb-schwarz
    const stripe = Math.floor(zw / 0.8) % 2 === 0 ? '#ffb000' : '#1b1c1e';
    quad(ctx, proj(g, -HALF - 0.18, 0, d0), proj(g, -HALF, 0, d0), proj(g, -HALF, 0, d1), proj(g, -HALF - 0.18, 0, d1), stripe);
    quad(ctx, proj(g, HALF, 0, d0), proj(g, HALF + 0.18, 0, d0), proj(g, HALF + 0.18, 0, d1), proj(g, HALF, 0, d1), stripe);
    // Spurlinien gestrichelt
    if (Math.floor(zw / 1.5) % 2 === 0) {
      for (const lx of [-LANE_W / 2, LANE_W / 2]) quad(ctx, proj(g, lx - 0.03, 0, d0), proj(g, lx + 0.03, 0, d0), proj(g, lx + 0.03, 0, d1), proj(g, lx - 0.03, 0, d1), 'rgba(255, 214, 10, 0.85)');
    }
  }
  ctx.globalAlpha = 1;
}

interface Sprite { d: number; draw: () => void }

function fencePanel(ctx: CanvasRenderingContext2D, g: Run, side: number, d0: number, d1: number, zw: number): void {
  const x = side * FENCE;
  const a = proj(g, x, 0, d0), b = proj(g, x, 2, d0), c = proj(g, x, 2, d1), e = proj(g, x, 0, d1);
  const fade = Math.min(1, (FAR - d0) / 16);
  ctx.globalAlpha = 0.3 + fade * 0.7;
  ctx.fillStyle = 'rgba(210, 225, 235, 0.35)';
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(e.x, e.y); ctx.closePath(); ctx.fill();
  // Gitter
  ctx.strokeStyle = 'rgba(120, 130, 140, 0.55)'; ctx.lineWidth = Math.max(0.5, a.s * 0.02);
  for (let k = 1; k < 4; k++) { const t = k / 4; ctx.beginPath(); ctx.moveTo(a.x + (e.x - a.x) * t, a.y + (e.y - a.y) * t); ctx.lineTo(b.x + (c.x - b.x) * t, b.y + (c.y - b.y) * t); ctx.stroke(); }
  for (let k = 1; k < 5; k++) { const t = k / 5; ctx.beginPath(); ctx.moveTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); ctx.lineTo(e.x + (c.x - e.x) * t, e.y + (c.y - e.y) * t); ctx.stroke(); }
  // Banner jedes dritte Feld
  if (Math.floor(zw / 2.5) % 3 === 0) {
    const t0 = 0.45, t1 = 0.75;
    const p = (u: number, v: number) => ({ x: a.x + (e.x - a.x) * u + (b.x - a.x) * v, y: a.y + (e.y - a.y) * u + (b.y - a.y) * v });
    const q1 = p(0, t0), q2 = p(0, t1), q3 = p(1, t1), q4 = p(1, t0);
    ctx.fillStyle = '#1d5fbf';
    ctx.beginPath(); ctx.moveTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q3.x, q3.y); ctx.lineTo(q4.x, q4.y); ctx.closePath(); ctx.fill();
  }
  // Pfosten und Fuss
  ctx.fillStyle = '#6b7280';
  ctx.fillRect(a.x - a.s * 0.03, b.y, a.s * 0.06, a.y - b.y);
  ctx.fillStyle = '#d1d5db';
  ctx.fillRect(a.x - a.s * 0.18, a.y - a.s * 0.08, a.s * 0.36, a.s * 0.1);
  ctx.globalAlpha = 1;
}

function drawObstacle(ctx: CanvasRenderingContext2D, g: Run, o: Ob, d: number): void {
  const lx = o.lane * LANE_W;
  const t = g.time;
  switch (o.kind) {
    case 'barrier': {
      // Absperrgitter rot-weiss mit Füssen
      const p0 = proj(g, lx - 0.45, 0, d), p1 = proj(g, lx + 0.45, 0, d), top = proj(g, lx, 0.9, d);
      const h = p0.y - top.y, w = p1.x - p0.x;
      ctx.fillStyle = '#4b5563'; ctx.fillRect(p0.x, p0.y - h * 0.2, w * 0.06, h * 0.2); ctx.fillRect(p1.x - w * 0.06, p0.y - h * 0.2, w * 0.06, h * 0.2);
      ctx.fillRect(p0.x - w * 0.06, p0.y - h * 0.04, w * 0.2, h * 0.05); ctx.fillRect(p1.x - w * 0.14, p0.y - h * 0.04, w * 0.2, h * 0.05);
      const bh = h * 0.35;
      const by = top.y + h * 0.1;
      ctx.save();
      ctx.beginPath(); ctx.rect(p0.x, by, w, bh); ctx.clip();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(p0.x, by, w, bh);
      ctx.fillStyle = '#e63946';
      for (let k = -2; k < 8; k++) { ctx.beginPath(); ctx.moveTo(p0.x + k * w / 5, by + bh); ctx.lineTo(p0.x + k * w / 5 + w / 10, by + bh); ctx.lineTo(p0.x + k * w / 5 + w / 10 + bh, by); ctx.lineTo(p0.x + k * w / 5 + bh, by); ctx.fill(); }
      ctx.restore();
      ctx.strokeStyle = '#7b1e1e'; ctx.lineWidth = Math.max(1, p0.s * 0.02); ctx.strokeRect(p0.x, by, w, bh);
      // Warnleuchte
      ctx.fillStyle = Math.sin(t * 10 + o.z) > 0 ? '#ffd60a' : '#9a7b00';
      ctx.beginPath(); ctx.arc(p1.x - w * 0.1, by - p0.s * 0.06, p0.s * 0.06, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'beam': {
      // Stahlträger hängt an Seilen vom Kran (nur einmal je Muster zeichnen: mittlere Spur)
      if (o.lane !== 0) break;
      const a = proj(g, -HALF - 0.4, o.y + 0.45, d), b = proj(g, HALF + 0.4, o.y, d);
      const hh = a.y - proj(g, 0, o.y + 0.45 + 0.3, d).y;
      ctx.strokeStyle = '#3a3c40'; ctx.lineWidth = Math.max(1, a.s * 0.015);
      ctx.beginPath(); ctx.moveTo(a.x + (b.x - a.x) * 0.3, a.y - hh); ctx.lineTo(W / 2 + (0 - g.camX) * a.s, 0); ctx.lineTo(a.x + (b.x - a.x) * 0.7, a.y - hh); ctx.stroke();
      const gr = ctx.createLinearGradient(0, a.y - hh, 0, a.y + hh * 0.2);
      gr.addColorStop(0, '#e05a47'); gr.addColorStop(1, '#8e2a1f');
      ctx.fillStyle = gr;
      ctx.fillRect(a.x, a.y - hh, b.x - a.x, hh);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctx.fillRect(a.x, a.y - hh * 0.55, b.x - a.x, hh * 0.1);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'; ctx.fillRect(a.x, a.y - hh, b.x - a.x, hh * 0.12);
      break;
    }
    case 'trench': {
      if (o.lane !== 0) break;
      const z0 = d - o.len / 2, z1 = d + o.len / 2;
      const n0 = proj(g, -HALF, 0, Math.max(0.6, z0)), n1 = proj(g, HALF, 0, Math.max(0.6, z0)), f0 = proj(g, -HALF, 0, z1), f1 = proj(g, HALF, 0, z1);
      ctx.fillStyle = '#3b2a1a';
      ctx.beginPath(); ctx.moveTo(f0.x, f0.y); ctx.lineTo(f1.x, f1.y); ctx.lineTo(n1.x, n1.y); ctx.lineTo(n0.x, n0.y); ctx.closePath(); ctx.fill();
      const inner = proj(g, -HALF, -0.8, z1), inner1 = proj(g, HALF, -0.8, z1);
      ctx.fillStyle = '#5a4128';
      ctx.beginPath(); ctx.moveTo(f0.x, f0.y); ctx.lineTo(f1.x, f1.y); ctx.lineTo(inner1.x, Math.min(inner1.y, n1.y)); ctx.lineTo(inner.x, Math.min(inner.y, n0.y)); ctx.closePath(); ctx.fill();
      // Warnband an beiden Kanten
      ctx.strokeStyle = '#ffb000'; ctx.lineWidth = Math.max(1, n0.s * 0.04); ctx.setLineDash([n0.s * 0.2, n0.s * 0.2]);
      ctx.beginPath(); ctx.moveTo(n0.x, n0.y); ctx.lineTo(n1.x, n1.y); ctx.moveTo(f0.x, f0.y); ctx.lineTo(f1.x, f1.y); ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'block': {
      // Betonblock (Leitwand) mit Reflektoren
      const w = 0.42, h = 1.25, dep = 0.5;
      const fl = proj(g, lx - w, 0, d - dep / 2), fr = proj(g, lx + w, 0, d - dep / 2), tl = proj(g, lx - w, h, d - dep / 2), tr = proj(g, lx + w, h, d - dep / 2);
      const bl = proj(g, lx - w, h, d + dep / 2), br = proj(g, lx + w, h, d + dep / 2);
      ctx.fillStyle = '#c9c6bd';
      ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath(); ctx.fill();
      // Seitenfläche zur Kamera hin
      const side = lx - g.camX > 0 ? -1 : 1;
      const sx = side < 0 ? fl : fr, sxt = side < 0 ? tl : tr, sxb = proj(g, lx + side * w * -1 * -1 * (side < 0 ? -1 : 1), 0, d + dep / 2);
      void sxb;
      const backB = proj(g, side < 0 ? lx - w : lx + w, 0, d + dep / 2), backT = side < 0 ? bl : br;
      ctx.fillStyle = '#9d9a92';
      ctx.beginPath(); ctx.moveTo(sx.x, sx.y); ctx.lineTo(sxt.x, sxt.y); ctx.lineTo(backT.x, backT.y); ctx.lineTo(backB.x, backB.y); ctx.closePath(); ctx.fill();
      const fg = ctx.createLinearGradient(0, tl.y, 0, fl.y);
      fg.addColorStop(0, '#d9d6cd'); fg.addColorStop(1, '#a9a69d');
      ctx.fillStyle = fg;
      ctx.fillRect(fl.x, tl.y, fr.x - fl.x, fl.y - tl.y);
      ctx.fillStyle = '#e63946'; ctx.fillRect(fl.x, tl.y + (fl.y - tl.y) * 0.2, fr.x - fl.x, (fl.y - tl.y) * 0.12);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(fl.x, tl.y + (fl.y - tl.y) * 0.32, fr.x - fl.x, (fl.y - tl.y) * 0.08);
      ctx.fillStyle = '#ffd60a';
      ctx.beginPath(); ctx.arc((fl.x + fr.x) / 2, tl.y + (fl.y - tl.y) * 0.62, fl.s * 0.07, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'cable': {
      // Funkendes Kabel, das quer über die Spur liegt
      const p0 = proj(g, lx - 0.5, 0.06, d), p1 = proj(g, lx + 0.5, 0.06, d);
      ctx.strokeStyle = '#1b1c1e'; ctx.lineWidth = Math.max(2, p0.s * 0.07); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y);
      for (let k = 1; k <= 6; k++) { const u = k / 6; ctx.lineTo(p0.x + (p1.x - p0.x) * u, p0.y + Math.sin(u * 9 + o.z) * p0.s * 0.05); }
      ctx.stroke();
      ctx.strokeStyle = '#ff6b00'; ctx.lineWidth = Math.max(1, p0.s * 0.025); ctx.stroke();
      // Funken
      const fx = p0.x + (p1.x - p0.x) * (0.5 + Math.sin(t * 7 + o.z) * 0.3);
      ctx.strokeStyle = '#fff2a8'; ctx.lineWidth = Math.max(1, p0.s * 0.015); ctx.shadowColor = '#ffd60a'; ctx.shadowBlur = 10;
      for (let k = 0; k < 5; k++) {
        const ang = t * 20 + k * 1.3 + o.z;
        ctx.beginPath(); ctx.moveTo(fx, p0.y); ctx.lineTo(fx + Math.cos(ang) * p0.s * 0.18, p0.y - Math.abs(Math.sin(ang)) * p0.s * 0.22); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      break;
    }
    case 'bolt': {
      // Goldener Blitz, dreht sich
      const p = proj(g, o.lane * LANE_W, o.y + 0.5, d);
      const r = p.s * 0.22;
      const sx = Math.cos(t * 5 + o.z) ;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(Math.max(0.2, Math.abs(sx)), 1);
      ctx.shadowColor = '#ffd60a'; ctx.shadowBlur = Math.min(14, r);
      ctx.fillStyle = sx > 0 ? '#ffd60a' : '#e8b100';
      ctx.beginPath(); ctx.moveTo(r * 0.2, -r); ctx.lineTo(-r * 0.5, r * 0.15); ctx.lineTo(0, r * 0.15); ctx.lineTo(-r * 0.25, r); ctx.lineTo(r * 0.5, -r * 0.15); ctx.lineTo(0, -r * 0.15); ctx.closePath(); ctx.fill();
      ctx.restore();
      break;
    }
    case 'helmet': case 'coffee': case 'magnet': {
      const p = proj(g, o.lane * LANE_W, o.y + 0.4 + Math.sin(t * 4) * 0.1, d);
      const r = p.s * 0.28;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 12;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      if (o.kind === 'helmet') {
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, r * 0.2, r * 0.8, Math.PI, 0); ctx.fill();
        ctx.fillRect(-r, r * 0.15, r * 2, r * 0.22);
        ctx.fillStyle = '#d1d5db'; ctx.fillRect(-r * 0.1, -r * 0.55, r * 0.2, r * 0.7);
      } else if (o.kind === 'coffee') {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(-r * 0.5, -r * 0.5, r, r * 1.1);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = r * 0.15; ctx.beginPath(); ctx.arc(r * 0.6, 0, r * 0.28, -Math.PI / 2, Math.PI / 2); ctx.stroke();
        ctx.fillStyle = '#6b3e1e'; ctx.fillRect(-r * 0.42, -r * 0.42, r * 0.84, r * 0.2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; ctx.lineWidth = r * 0.08;
        ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.7); ctx.quadraticCurveTo(-r * 0.4, -r, -r * 0.2, -r * 1.2); ctx.moveTo(r * 0.15, -r * 0.7); ctx.quadraticCurveTo(-r * 0.05, -r, r * 0.15, -r * 1.2); ctx.stroke();
      } else {
        ctx.strokeStyle = '#e63946'; ctx.lineWidth = r * 0.4; ctx.beginPath(); ctx.arc(0, 0, r * 0.6, Math.PI, 0, false); ctx.stroke();
        ctx.fillStyle = '#e5e7eb'; ctx.fillRect(-r * 0.8, 0, r * 0.4, r * 0.35); ctx.fillRect(r * 0.4, 0, r * 0.4, r * 0.35);
      }
      ctx.restore();
      break;
    }
  }
}

/** Kreuzung am Abschnittsende: Seitenarme, Bauzaun geradeaus, Umleitungsschild */
function junctionSprites(ctx: CanvasRenderingContext2D, g: Run, list: Sprite[]): number {
  const toTurn = g.segLen - g.pz;
  const dJ = toTurn + CAM_BACK;
  if (dJ > FAR + 4) return FAR;
  const near = dJ - HALF, far = dJ + HALF;
  list.push({
    d: far + 0.1,
    draw: () => {
      // Querstrasse
      for (const side of [-1, 1]) {
        if (g.turn !== 0 && g.turn !== side) continue;
        const x0 = side * HALF, x1 = side * 40;
        const nn = Math.max(0.7, near);
        quad(ctx, proj(g, x0, 0, far), proj(g, x1, 0, far), proj(g, x1, 0, nn), proj(g, x0, 0, nn), '#a7abb0');
        for (let k = 0; k < 14; k++) {
          const xa = side * (HALF + k * 2.4), xb = side * (HALF + k * 2.4 + 1.2);
          quad(ctx, proj(g, xa, 0, (far + nn) / 2 + 0.03), proj(g, xb, 0, (far + nn) / 2 + 0.03), proj(g, xb, 0, (far + nn) / 2 - 0.03), proj(g, xa, 0, (far + nn) / 2 - 0.03), 'rgba(255, 214, 10, 0.85)');
        }
      }
    },
  });
  // Bauzaun geradeaus hinter der Kreuzung
  list.push({
    d: far + 0.4,
    draw: () => {
      const a = proj(g, -FENCE - 2, 0, far + 0.4), b = proj(g, FENCE + 2, 2.2, far + 0.4);
      ctx.fillStyle = 'rgba(220, 230, 238, 0.85)'; ctx.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
      ctx.strokeStyle = 'rgba(110, 120, 130, 0.7)'; ctx.lineWidth = Math.max(0.6, a.s * 0.02);
      for (let k = 0; k <= 12; k++) { const x = a.x + ((b.x - a.x) * k) / 12; ctx.beginPath(); ctx.moveTo(x, b.y); ctx.lineTo(x, a.y); ctx.stroke(); }
      for (let k = 0; k <= 4; k++) { const y = b.y + ((a.y - b.y) * k) / 4; ctx.beginPath(); ctx.moveTo(a.x, y); ctx.lineTo(b.x, y); ctx.stroke(); }
      // Umleitungsschild
      const s = proj(g, 0, 1.6, far + 0.3);
      const r = s.s * 0.55;
      ctx.fillStyle = '#ffb000'; ctx.strokeStyle = '#1b1c1e'; ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.fillRect(s.x - r * 1.2, s.y - r * 0.55, r * 2.4, r * 1.1); ctx.strokeRect(s.x - r * 1.2, s.y - r * 0.55, r * 2.4, r * 1.1);
      ctx.fillStyle = '#1b1c1e';
      const arrow = (dir: number, ox: number) => {
        ctx.beginPath(); ctx.moveTo(s.x + ox - dir * r * 0.6, s.y - r * 0.12); ctx.lineTo(s.x + ox + dir * r * 0.15, s.y - r * 0.12); ctx.lineTo(s.x + ox + dir * r * 0.15, s.y - r * 0.32);
        ctx.lineTo(s.x + ox + dir * r * 0.6, s.y); ctx.lineTo(s.x + ox + dir * r * 0.15, s.y + r * 0.32); ctx.lineTo(s.x + ox + dir * r * 0.15, s.y + r * 0.12); ctx.lineTo(s.x + ox - dir * r * 0.6, s.y + r * 0.12); ctx.fill();
      };
      if (g.turn === 0) { arrow(-1, -r * 0.5); arrow(1, r * 0.5); } else arrow(g.turn, 0);
    },
  });
  return near;
}

/** Elektriker von hinten: Helm, Warnweste mit Reflexstreifen, Werkzeuggurt */
function drawRunner(ctx: CanvasRenderingContext2D, g: Run): void {
  if (g.inv > 0 && g.coffee <= 0 && Math.floor(g.inv * 10) % 2 === 0) return;
  const p = proj(g, g.x, g.y, CAM_BACK);
  const ground = proj(g, g.x, 0, CAM_BACK);
  const s = p.s;
  const run = g.y > 0.01 ? 0 : Math.sin(g.time * (g.speed * 1.25));
  const slide = g.slide > 0 && g.y <= 0.01;
  const xray = g.zap > 0 && Math.floor(g.zap * 14) % 2 === 0;
  // Schatten
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath(); ctx.ellipse(ground.x, ground.y, s * 0.42 * (1 - Math.min(0.5, g.y * 0.2)), s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(p.x, p.y);
  if (slide) ctx.scale(1.15, 0.55);
  const vest = xray ? 'rgba(255, 255, 255, 0.25)' : '#ff6b00';
  const pants = xray ? 'rgba(255, 255, 255, 0.2)' : '#2f3a56';
  // Beine (Laufzyklus), im Sprung angezogen
  const legLen = s * 0.78;
  const tuck = g.y > 0.01 ? 0.45 : 0;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const ph = run * side;
    ctx.strokeStyle = pants; ctx.lineWidth = s * 0.17;
    ctx.beginPath(); ctx.moveTo(side * s * 0.12, -legLen); ctx.lineTo(side * s * 0.14, -legLen * (0.5 + tuck * 0.4) + ph * s * 0.08); ctx.lineTo(side * s * 0.13, -ph * s * 0.16 - tuck * legLen * 0.5); ctx.stroke();
    ctx.fillStyle = xray ? 'rgba(255, 255, 255, 0.3)' : '#3a2a1a';
    ctx.beginPath(); ctx.ellipse(side * s * 0.13, -ph * s * 0.16 - tuck * legLen * 0.5, s * 0.1, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Rumpf mit Weste
  const top = -legLen - s * 0.62;
  const torso = ctx.createLinearGradient(-s * 0.3, 0, s * 0.3, 0);
  torso.addColorStop(0, xray ? vest : '#e85d00'); torso.addColorStop(0.5, vest); torso.addColorStop(1, xray ? vest : '#e85d00');
  ctx.fillStyle = torso;
  ctx.beginPath(); ctx.moveTo(-s * 0.3, -legLen + s * 0.04); ctx.lineTo(-s * 0.34, top + s * 0.08); ctx.quadraticCurveTo(0, top - s * 0.04, s * 0.34, top + s * 0.08); ctx.lineTo(s * 0.3, -legLen + s * 0.04); ctx.closePath(); ctx.fill();
  if (!xray) {
    // Reflexstreifen als X auf dem Rücken und quer
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = s * 0.05;
    ctx.beginPath(); ctx.moveTo(-s * 0.28, top + s * 0.1); ctx.lineTo(s * 0.26, -legLen - s * 0.12); ctx.moveTo(s * 0.28, top + s * 0.1); ctx.lineTo(-s * 0.26, -legLen - s * 0.12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.31, -legLen - s * 0.1); ctx.lineTo(s * 0.31, -legLen - s * 0.1); ctx.stroke();
    // Werkzeuggurt
    ctx.fillStyle = '#4a3020'; ctx.fillRect(-s * 0.31, -legLen - s * 0.02, s * 0.62, s * 0.08);
    ctx.fillStyle = '#6b4a2a'; ctx.fillRect(s * 0.12, -legLen + s * 0.02, s * 0.14, s * 0.14);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(s * 0.16, -legLen - s * 0.04, s * 0.03, s * 0.12);
  }
  // Arme schwingen gegengleich
  for (const side of [-1, 1]) {
    const ph = -run * side;
    ctx.strokeStyle = vest; ctx.lineWidth = s * 0.13;
    const sx = side * s * 0.33, sy = top + s * 0.14;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + side * s * 0.08, sy + s * 0.26 + ph * s * 0.1); ctx.lineTo(sx + side * s * 0.04, sy + s * 0.46 + ph * s * 0.18); ctx.stroke();
    ctx.fillStyle = xray ? 'rgba(255, 255, 255, 0.3)' : '#f1c7a1';
    ctx.beginPath(); ctx.arc(sx + side * s * 0.04, sy + s * 0.48 + ph * s * 0.18, s * 0.06, 0, Math.PI * 2); ctx.fill();
  }
  // Skelett beim Stromschlag
  if (xray) {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, top + s * 0.1); ctx.lineTo(0, -legLen);
    for (let k = 0; k < 4; k++) { const y = top + s * (0.18 + k * 0.1); ctx.moveTo(-s * 0.2, y); ctx.quadraticCurveTo(0, y + s * 0.04, s * 0.2, y); }
    ctx.moveTo(-s * 0.13, -legLen); ctx.lineTo(-s * 0.13, 0); ctx.moveTo(s * 0.13, -legLen); ctx.lineTo(s * 0.13, 0);
    ctx.moveTo(-s * 0.33, top + s * 0.14); ctx.lineTo(-s * 0.3, top + s * 0.6); ctx.moveTo(s * 0.33, top + s * 0.14); ctx.lineTo(s * 0.3, top + s * 0.6);
    ctx.stroke();
  }
  // Kopf von hinten und Helm
  ctx.fillStyle = xray ? '#ffffff' : '#c58e5f';
  ctx.beginPath(); ctx.arc(0, top - s * 0.06, s * 0.16, 0, Math.PI * 2); ctx.fill();
  if (xray) { ctx.fillStyle = '#1b1c1e'; ctx.beginPath(); ctx.arc(-s * 0.06, top - s * 0.06, s * 0.035, 0, Math.PI * 2); ctx.arc(s * 0.06, top - s * 0.06, s * 0.035, 0, Math.PI * 2); ctx.fill(); }
  const helmetLift = g.zap > 0 ? Math.sin(g.zap * Math.PI) * s * 0.35 : 0;
  const hg = ctx.createLinearGradient(0, top - s * 0.32 - helmetLift, 0, top - s * 0.04 - helmetLift);
  hg.addColorStop(0, g.helmet ? '#fff7c2' : '#ffffff'); hg.addColorStop(1, g.helmet ? '#ffd60a' : '#d1d5db');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(0, top - s * 0.08 - helmetLift, s * 0.2, Math.PI, 0); ctx.fill();
  ctx.fillRect(-s * 0.24, top - s * 0.09 - helmetLift, s * 0.48, s * 0.05);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'; ctx.fillRect(-s * 0.03, top - s * 0.28 - helmetLift, s * 0.06, s * 0.2);
  if (g.zap > 0) {
    // Haare stehen zu Berge, Funken um den Kopf
    ctx.strokeStyle = '#4a3020'; ctx.lineWidth = s * 0.03;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * s * 0.05, top - s * 0.18); ctx.lineTo(k * s * 0.09, top - s * 0.36); ctx.stroke(); }
    ctx.strokeStyle = '#fff2a8'; ctx.lineWidth = s * 0.025; ctx.shadowColor = '#ffd60a'; ctx.shadowBlur = 10;
    for (let k = 0; k < 6; k++) { const a = g.time * 30 + k; ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * 0.3, top + Math.sin(a) * s * 0.3); ctx.lineTo(Math.cos(a) * s * 0.5, top + Math.sin(a) * s * 0.5); ctx.stroke(); }
    ctx.shadowBlur = 0;
  }
  ctx.restore();
  if (g.coffee > 0) {
    ctx.strokeStyle = `rgba(255, 214, 10, ${0.5 + Math.sin(g.time * 20) * 0.3})`; ctx.lineWidth = 2;
    for (let k = 0; k < 6; k++) { const x = p.x + (k - 2.5) * 16; ctx.beginPath(); ctx.moveTo(x, ground.y - s * 1.6 + k * 6); ctx.lineTo(x, ground.y - s * 0.4 + k * 8); ctx.stroke(); }
  }
}

/** Strassenwalze, die hinterherrollt (unten im Bild, je nach Abstand) */
function drawChaser(ctx: CanvasRenderingContext2D, g: Run): void {
  if (g.chase < 0.2) return;
  const rise = (g.chase - 0.2) / 0.8;
  const y = H + 40 - rise * 120;
  const cx = W / 2 + Math.sin(g.time * 3) * 4;
  ctx.save();
  ctx.translate(cx, y);
  // Walze vorne
  const drum = ctx.createLinearGradient(0, -40, 0, 40);
  drum.addColorStop(0, '#9ca3af'); drum.addColorStop(0.5, '#e5e7eb'); drum.addColorStop(1, '#6b7280');
  ctx.fillStyle = drum;
  ctx.fillRect(-120, -26, 240, 60);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)'; ctx.lineWidth = 2;
  for (let k = 0; k < 5; k++) { const yy = -26 + ((g.time * 90 + k * 12) % 60); ctx.beginPath(); ctx.moveTo(-120, yy); ctx.lineTo(120, yy); ctx.stroke(); }
  // Rahmen und Kabine
  ctx.fillStyle = '#ffb000'; ctx.fillRect(-130, -40, 22, 80); ctx.fillRect(108, -40, 22, 80);
  ctx.fillRect(-100, -70, 200, 26);
  ctx.fillStyle = '#1b1c1e';
  for (let k = 0; k < 10; k++) ctx.fillRect(-100 + k * 20, -70, 10, 8);
  ctx.fillStyle = '#ff2a2a'; ctx.shadowColor = '#ff2a2a'; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(-80, -76, 6, 0, Math.PI * 2); ctx.arc(80, -76, 6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** 2D-Fassung (ohne WebGL) */
export function drawRun2D(ctx: CanvasRenderingContext2D, g: Run): void {
  const k = ctx.getTransform().a || 1;
  if (cache.k !== k || !cache.bg) {
    const el = document.createElement('canvas');
    el.width = Math.round(W * k); el.height = Math.round((HORIZON + 10) * k);
    const c = el.getContext('2d')!; c.scale(k, k); sky(c);
    cache.k = k; cache.bg = el;
  }
  ctx.save();
  // Kurve: Bild schwenkt kurz in die neue Richtung
  if (g.turnAnim > 0) {
    const e = g.turnAnim * g.turnAnim;
    ctx.translate(W / 2, 420);
    ctx.rotate(-g.turnDir * 0.35 * e);
    ctx.translate(-W / 2 + g.turnDir * 160 * e, -420);
  }
  ctx.drawImage(cache.bg, -60, 0, W + 120, HORIZON + 10);
  const sprites: Sprite[] = [];
  const near = junctionSprites(ctx, g, sprites);
  drawGround(ctx, g, near + 0.01);
  // Bauzaun links und rechts, je 2.5 m ein Feld, bis zur Kreuzung
  const first = Math.ceil((g.pz - CAM_BACK + 0.8) / 2.5) * 2.5;
  for (let zw = first; zw < g.pz + FAR - CAM_BACK && zw < g.segLen - HALF; zw += 2.5) {
    const d0 = zw - g.pz + CAM_BACK;
    const d1 = Math.min(d0 + 2.5, g.segLen - HALF - g.pz + CAM_BACK);
    if (d1 <= 0.8) continue;
    for (const side of [-1, 1]) sprites.push({ d: d1, draw: () => fencePanel(ctx, g, side, Math.max(0.8, d0), d1, zw) });
  }
  for (const o of g.obs) {
    if (o.hit && o.kind !== 'barrier' && o.kind !== 'beam' && o.kind !== 'block') continue;
    const d = o.z - g.pz + CAM_BACK;
    if (d < 0.6 || d > FAR) continue;
    sprites.push({ d: d + (o.kind === 'trench' ? 2 : 0), draw: () => drawObstacle(ctx, g, o, d) });
  }
  sprites.sort((a, b) => b.d - a.d);
  for (const s of sprites) if (s.d >= CAM_BACK) s.draw();
  drawRunner(ctx, g);
  for (const s of sprites) if (s.d < CAM_BACK) s.draw();
  ctx.restore();
  drawChaser(ctx, g);
  overlays(ctx, g);
}

/** Anzeigen über der Szene: Funken, Punkte, Abzweigungs- und Spruchband */
function overlays(ctx: CanvasRenderingContext2D, g: Run): void {
  drawSparks(ctx, g.sparks);
  drawFloats(ctx, g.floats, '700 16px "Barlow Condensed", system-ui, sans-serif');
  // Abzweigung ankündigen
  const toTurn = g.segLen - g.pz;
  if (toTurn < 26 && toTurn > -1) {
    const txt = g.turn === 0 ? '← Abzweigung →' : g.turn < 0 ? '← Links abbiegen' : 'Rechts abbiegen →';
    drawBanner(ctx, W, 92, txt, '#ffb000', toTurn < 6 ? 0.6 + Math.sin(g.time * 18) * 0.4 : 0.9, '800 18px "Barlow Condensed", system-ui, sans-serif');
  }
  if (g.banner) drawBanner(ctx, W, H * 0.3, g.banner.text, '#ffd60a', Math.min(1, g.banner.t * 2), '800 22px "Barlow Condensed", system-ui, sans-serif');
}

const view3d = lazyView(async () => new (await import('./three/runner3d')).RunnerView());

/** 3D-Ansicht mit three.js; ohne WebGL die 2D-Fassung */
export function drawRun(ctx: CanvasRenderingContext2D, g: Run): void {
  const v = view3d.get();
  if (v) { v.render(ctx, g); overlays(ctx, g); return; }
  if (view3d.failed) { drawRun2D(ctx, g); return; }
  drawLoading(ctx, W, H);
}

export const runner: Engine<Run> = {
  W, H,
  create: createRun,
  step: stepRun,
  draw: drawRun,
  hud: (g) => [
    { label: 'Meter', value: String(Math.floor(g.dist)) },
    { label: 'Punkte', value: String(Math.floor(g.score)), tone: 'a' },
    { label: 'Blitze', value: String(g.bolts), tone: 'c' },
    { label: 'Leben', value: '♥'.repeat(Math.max(0, g.lives)) || '–', tone: 'b' },
  ],
  score: (g) => Math.floor(g.score),
  over: (g) => g.over,
  tones: {
    bolt: ['sine', 990, 1480, 0.08, 0.035],
    jump: ['triangle', 330, 660, 0.14, 0.04],
    slide: ['sawtooth', 200, 120, 0.15, 0.03],
    lane: ['sine', 520, 600, 0.05, 0.02],
    turn: ['triangle', 660, 990, 0.18, 0.05],
    power: ['sine', 523, 1568, 0.4, 0.05],
    helmet: ['square', 880, 440, 0.2, 0.04],
    zap: ['sawtooth', 1200, 90, 0.6, 0.07],
    hit: ['sawtooth', 220, 70, 0.45, 0.07],
    over: ['triangle', 392, 98, 1, 0.07],
  },
};
