/**
 * Waldjagd (Stil Forest), angelehnt an Moorhuhn: Tiere tauchen im Wald auf, ein Klick oder Antippen wirft einen
 * Zapfen mit der Schleuder. Getroffene Tiere flüchten mit Sternchen. Wanderer, Igel und Vogelhaus nicht treffen.
 * 8 Zapfen im Korb, nachladen mit R, Rechtsklick oder Antippen des Korbs. Eine Runde dauert 90 Sekunden.
 */
import * as art from './forestArt';
import { drawBanner, drawFloats, type Engine, type Float, type Input, moveFloats, type Pt } from './types';

const W = 360;
const H = 560;
const ROUND = 90;
const AMMO = 8;
const BASKET = { x: W - 40, y: H - 40, r: 30 };

export type Kind = 'squirrel' | 'boar' | 'deer' | 'hiker' | 'hedgehog' | 'acorn';
/** Punkte je Art (negativ: nicht treffen) */
export const POINTS: Record<Kind, number> = { squirrel: 40, deer: 30, boar: 20, hiker: -50, hedgehog: -30, acorn: 100 };

interface Critter {
  kind: Kind;
  x: number;
  y: number;
  /** Tiefe: 0.5 hinten (klein, doppelte Punkte), 1 vorne */
  z: number;
  vx: number;
  vy: number;
  dir: 1 | -1;
  t: number;
  /** Eichhörnchen: Zeit sichtbar */
  stay: number;
  state: 'in' | 'show' | 'out' | 'flee';
  peek: number;
}
interface Cone { from: Pt; to: Pt; t: number }
interface Puff { x: number; y: number; t: number; hit: boolean }

export interface Forest {
  critters: Critter[];
  cones: Cone[];
  puffs: Puff[];
  floats: Float[];
  aim: Pt;
  ammo: number;
  reloading: number;
  houseHit: number;
  score: number;
  hits: number;
  time: number;
  next: { squirrel: number; runner: number; walker: number; nope: number; acorn: number };
  banner: { text: string; t: number } | null;
  over: boolean;
  rng: () => number;
}

/** Wo Eichhörnchen hinter Stämmen hervorschauen: Stamm-Mitte, Höhe, Tiefe */
const TRUNKS: { x: number; y: number; z: number; w: number }[] = [
  { x: 70, y: 398, z: 0.75, w: 26 },
  { x: 190, y: 374, z: 0.6, w: 18 }, { x: 290, y: 402, z: 0.8, w: 28 }, { x: 290, y: 440, z: 0.8, w: 28 },
  { x: 140, y: 376, z: 0.55, w: 16 }, { x: 240, y: 379, z: 0.55, w: 16 },
];
/** Vogelhaus am linken Baum unter der Krone (nicht treffen) */
export const HOUSE = { x: 70, y: 354, w: 30, h: 30 };
/** Bodenlinien: hinten, Mitte, vorne */
const LANES = [{ y: 395, z: 0.55 }, { y: 440, z: 0.75 }, { y: 505, z: 1 }];

export function createForest(rng: () => number = Math.random): Forest {
  return {
    critters: [], cones: [], puffs: [], floats: [],
    aim: { x: W / 2, y: H / 2 }, ammo: AMMO, reloading: 0, houseHit: 0,
    score: 0, hits: 0, time: ROUND,
    next: { squirrel: 0.8, runner: 2, walker: 3.5, nope: 6, acorn: 20 },
    banner: null, over: false, rng,
  };
}

function spawn(g: Forest, kind: Kind): void {
  const r = g.rng;
  if (kind === 'squirrel') {
    const tr = TRUNKS[Math.floor(r() * TRUNKS.length)]!;
    const dir = r() < 0.5 ? -1 : 1;
    g.critters.push({ kind, x: tr.x + dir * tr.w * 0.5, y: tr.y, z: tr.z, vx: 0, vy: 0, dir, t: 0, stay: 1.1 + r() * 1.1, state: 'in', peek: 0 });
    return;
  }
  if (kind === 'acorn') {
    g.critters.push({ kind, x: 40 + r() * (W - 80), y: -20, z: 1, vx: 0, vy: 55, dir: 1, t: 0, stay: 0, state: 'show', peek: 1 });
    return;
  }
  const lanes = kind === 'deer' ? LANES.slice(0, 2) : kind === 'hedgehog' ? LANES.slice(1) : kind === 'boar' ? LANES : LANES.slice(1);
  const lane = lanes[Math.floor(r() * lanes.length)]!;
  const dir: 1 | -1 = r() < 0.5 ? 1 : -1;
  const base = { boar: 150, deer: 60, hiker: 45, hedgehog: 28 }[kind as 'boar' | 'deer' | 'hiker' | 'hedgehog'];
  const speed = base * (0.8 + r() * 0.4) * (0.55 + lane.z * 0.45);
  g.critters.push({ kind, x: dir > 0 ? -50 : W + 50, y: lane.y, z: lane.z, vx: dir * speed, vy: 0, dir, t: r() * 3, stay: 0, state: 'show', peek: 1 });
}

/** Trefferfläche (Mitte und Halbachsen) je nach Art und Tiefe */
function box(c: Critter): { x: number; y: number; rx: number; ry: number } {
  const z = c.z;
  switch (c.kind) {
    case 'squirrel': return { x: c.x + c.dir * 10 * z * c.peek, y: c.y - 6 * z, rx: 14 * z, ry: 16 * z };
    case 'boar': return { x: c.x, y: c.y - 16 * z, rx: 30 * z, ry: 17 * z };
    case 'deer': return { x: c.x, y: c.y - 34 * z, rx: 26 * z, ry: 34 * z };
    case 'hiker': return { x: c.x, y: c.y - 34 * z, rx: 13 * z, ry: 34 * z };
    case 'hedgehog': return { x: c.x, y: c.y - 8 * z, rx: 16 * z, ry: 10 * z };
    case 'acorn': return { x: c.x, y: c.y, rx: 14, ry: 16 };
  }
}
const inside = (p: Pt, b: { x: number; y: number; rx: number; ry: number }) => ((p.x - b.x) / b.rx) ** 2 + ((p.y - b.y) / b.ry) ** 2 <= 1;

function throwAt(g: Forest, p: Pt, events: string[]): void {
  if (Math.hypot(p.x - BASKET.x, p.y - BASKET.y) < BASKET.r) { reload(g, events); return; }
  if (g.reloading > 0) return;
  if (g.ammo <= 0) { events.push('empty'); g.floats.push({ x: p.x, y: p.y, text: 'Nachladen!', color: '#ffd166', life: 0.8 }); return; }
  g.ammo -= 1;
  g.aim = { ...p };
  g.cones.push({ from: { x: W / 2, y: H + 10 }, to: { ...p }, t: 0 });
  events.push('throw');
  // vorne zuerst prüfen: was näher ist, verdeckt was dahinter steht
  const hit = [...g.critters].filter((c) => c.state !== 'flee' && c.peek > 0.3).sort((a, b) => b.z - a.z).find((c) => inside(p, box(c)));
  if (hit) {
    const far = hit.kind !== 'acorn' && hit.z < 0.6;
    const pts = POINTS[hit.kind] * (far && POINTS[hit.kind] > 0 ? 2 : 1);
    g.score = Math.max(0, g.score + pts);
    hit.state = 'flee';
    hit.t = 0;
    hit.vx = (hit.kind === 'squirrel' ? hit.dir : Math.sign(hit.vx) || 1) * 260;
    hit.vy = hit.kind === 'acorn' ? -200 : -40;
    g.floats.push({ x: p.x, y: p.y - 10, text: pts > 0 ? `+${pts}` : String(pts), color: pts > 0 ? '#ffd166' : '#ff6b6b', life: 1.1 });
    g.puffs.push({ x: p.x, y: p.y, t: 0, hit: true });
    if (pts > 0) g.hits += 1;
    events.push(pts > 0 ? 'hit' : 'ouch');
    return;
  }
  if (p.x > HOUSE.x - HOUSE.w / 2 && p.x < HOUSE.x + HOUSE.w / 2 && p.y > HOUSE.y - HOUSE.h / 2 && p.y < HOUSE.y + HOUSE.h / 2) {
    g.score = Math.max(0, g.score - 20);
    g.houseHit = 0.5;
    g.floats.push({ x: p.x, y: p.y - 10, text: '−20 Vogelhaus', color: '#ff6b6b', life: 1.1 });
    events.push('ouch');
    return;
  }
  g.puffs.push({ x: p.x, y: p.y, t: 0, hit: false });
}

function reload(g: Forest, events: string[]): void {
  if (g.reloading > 0 || g.ammo === AMMO) return;
  g.reloading = 0.7;
  events.push('reload');
}

export function stepForest(g: Forest, dt: number, input: Input): string[] {
  const events: string[] = [];
  dt = Math.min(dt, 0.05);
  g.floats = moveFloats(g.floats, dt);
  if (g.banner) { g.banner.t -= dt; if (g.banner.t <= 0) g.banner = null; }
  for (const cn of g.cones) cn.t += dt / 0.14;
  g.cones = g.cones.filter((cn) => cn.t < 1);
  for (const p of g.puffs) p.t += dt;
  g.puffs = g.puffs.filter((p) => p.t < 0.6);
  g.houseHit = Math.max(0, g.houseHit - dt);
  if (g.over) return events;

  g.time -= dt;
  if (g.time <= 0) { g.time = 0; g.over = true; events.push('over'); return events; }
  if (g.time <= 10 && g.time + dt > 10) { g.banner = { text: 'Noch 10 Sekunden', t: 1.4 }; events.push('warn'); }

  // Zielen mit Tasten oder Maus
  if (input.target) g.aim = { ...input.target };
  g.aim.x = Math.min(W, Math.max(0, g.aim.x + input.dx * 300 * dt));
  g.aim.y = Math.min(H, Math.max(0, g.aim.y + input.dy * 300 * dt));

  if (g.reloading > 0) {
    g.reloading -= dt;
    if (g.reloading <= 0) { g.reloading = 0; g.ammo = AMMO; events.push('loaded'); }
  }
  if (input.reload) reload(g, events);
  for (const t of input.taps) throwAt(g, t, events);
  if (input.press) throwAt(g, g.aim, events);

  // Nachschub, gegen Ende dichter
  const rush = 1 + (ROUND - g.time) / ROUND;
  const n = g.next;
  n.squirrel -= dt * rush; n.runner -= dt * rush; n.walker -= dt * rush; n.nope -= dt; n.acorn -= dt;
  if (n.squirrel <= 0) { spawn(g, 'squirrel'); n.squirrel = 1.3 + g.rng() * 1.4; }
  if (n.runner <= 0) { spawn(g, 'boar'); n.runner = 2.6 + g.rng() * 2.4; }
  if (n.walker <= 0) { spawn(g, 'deer'); n.walker = 3.4 + g.rng() * 2.8; }
  if (n.nope <= 0) { spawn(g, g.rng() < 0.55 ? 'hiker' : 'hedgehog'); n.nope = 5 + g.rng() * 5; }
  if (n.acorn <= 0) { spawn(g, 'acorn'); n.acorn = 18 + g.rng() * 14; }

  for (const c of g.critters) {
    c.t += dt;
    if (c.state === 'flee') {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.peek = Math.max(0, c.peek - dt * (c.kind === 'squirrel' ? 3 : 0.8));
      continue;
    }
    if (c.kind === 'squirrel') {
      if (c.state === 'in') { c.peek = Math.min(1, c.peek + dt * 4); if (c.peek >= 1) c.state = 'show'; }
      else if (c.state === 'show') { c.stay -= dt; if (c.stay <= 0) c.state = 'out'; }
      else { c.peek -= dt * 4; }
      continue;
    }
    if (c.kind === 'acorn') { c.y += c.vy * dt; c.x += Math.sin(c.t * 2) * 20 * dt; continue; }
    // Hirsche bleiben ab und zu stehen
    if (c.kind === 'deer' && Math.sin(c.t * 0.9) > 0.85) continue;
    c.x += c.vx * dt;
  }
  g.critters = g.critters.filter((c) => {
    if (c.kind === 'squirrel') return c.peek > 0 || c.state === 'in';
    if (c.state === 'flee') return c.peek > 0 && c.x > -80 && c.x < W + 80 && c.y > -80;
    return c.x > -80 && c.x < W + 80 && c.y < H + 30;
  });
  return events;
}

/* ---------- Zeichnen ---------- */

/* Bäume nach Tiefe: Krone hinter, Stamm vor den Tieren derselben Ebene, damit Tiere teils verdeckt werden */
const TREES = TRUNKS.filter((t, i) => TRUNKS.findIndex((u) => u.x === t.x) === i).map((t) => {
  const base = t.z < 0.6 ? 400 : t.z < 0.78 ? 445 : 470;
  const h = t.z < 0.6 ? 150 : 280;
  return { ...t, base, h, back: t.z < 0.6 };
});

/** Hintergrund und Vordergrund einmal pro Massstab zeichnen und wiederverwenden */
const cache: { k: number; bg: HTMLCanvasElement | null; fg: HTMLCanvasElement | null } = { k: 0, bg: null, fg: null };
function layer(k: number, paint: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const el = document.createElement('canvas');
  el.width = Math.round(W * k);
  el.height = Math.round(H * k);
  const c = el.getContext('2d')!;
  c.scale(k, k);
  paint(c);
  return el;
}

function critter(ctx: CanvasRenderingContext2D, c: Critter): void {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(c.z * c.dir, c.z);
  if (c.state === 'flee' && c.kind !== 'acorn') ctx.globalAlpha = Math.min(1, c.peek * 1.5);
  switch (c.kind) {
    case 'squirrel': ctx.translate(-14 + c.peek * 14, 0); art.squirrel(ctx); break;
    case 'boar': art.boar(ctx, c.t); break;
    case 'deer': art.deer(ctx, c.t, !(Math.sin(c.t * 0.9) > 0.85)); break;
    case 'hiker': art.hiker(ctx, c.t); break;
    case 'hedgehog': art.hedgehog(ctx, c.t); break;
    case 'acorn': art.acorn(ctx, c.t); break;
  }
  ctx.restore();
  // Sternchen über getroffenen Tieren
  if (c.state === 'flee' && c.kind !== 'acorn' && c.peek > 0) {
    const b = box(c);
    ctx.save();
    ctx.fillStyle = '#ffd166';
    for (let i = 0; i < 3; i++) {
      const a = c.t * 6 + (i * Math.PI * 2) / 3;
      star(ctx, b.x + Math.cos(a) * 14, b.y - b.ry - 4 + Math.sin(a) * 4, 4);
    }
    ctx.restore();
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.fill();
}

export function drawForest(ctx: CanvasRenderingContext2D, g: Forest): void {
  const k = ctx.getTransform().a || 1;
  if (cache.k !== k || !cache.bg || !cache.fg) {
    cache.k = k;
    cache.bg = layer(k, (c) => art.backdrop(c));
    cache.fg = layer(k, (c) => art.foreground(c));
  }
  ctx.drawImage(cache.bg, 0, 0, W, H);
  // Tiefe: Tiere, Kronen (etwas weiter hinten) und Stämme (etwas weiter vorn) gemeinsam sortiert
  type Item = { z: number; draw: () => void };
  const items: Item[] = g.critters.map((c) => ({ z: c.z, draw: () => critter(ctx, c) }));
  for (const t of TREES) {
    items.push({ z: t.z - 0.02, draw: () => art.crown(ctx, t.x, t.base, t.h, t.w, t.back) });
    items.push({ z: t.z + 0.01, draw: () => art.tree(ctx, t.x, t.base, t.h, t.w, t.back) });
  }
  items.push({
    z: 0.765, draw: () => {
      ctx.save();
      ctx.translate(HOUSE.x, HOUSE.y);
      if (g.houseHit > 0) ctx.rotate(Math.sin(g.houseHit * 40) * 0.12);
      art.birdhouse(ctx);
      ctx.restore();
    },
  });
  items.sort((a, b) => a.z - b.z);
  for (const it of items) it.draw();
  ctx.drawImage(cache.fg, 0, 0, W, H);
  for (const p of g.puffs) {
    ctx.save();
    ctx.globalAlpha = 1 - p.t / 0.6;
    ctx.fillStyle = p.hit ? '#fff3b0' : '#c9b48a';
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * p.t * 30, p.y + Math.sin(a) * p.t * 30, 3, 0, Math.PI * 2); ctx.fill(); }
    if (p.hit) { ctx.font = '800 14px Nunito, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.fillText('Bonk!', p.x, p.y - 22 - p.t * 20); }
    ctx.restore();
  }
  for (const cn of g.cones) {
    const x = cn.from.x + (cn.to.x - cn.from.x) * cn.t;
    const y = cn.from.y + (cn.to.y - cn.from.y) * cn.t - Math.sin(cn.t * Math.PI) * 40;
    ctx.save(); ctx.translate(x, y); ctx.rotate(cn.t * 12);
    ctx.fillStyle = '#7a4f24'; ctx.beginPath(); ctx.ellipse(0, 0, 5 - cn.t * 2, 7 - cn.t * 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // Korb mit Zapfen (antippen zum Nachladen)
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath(); ctx.arc(BASKET.x, BASKET.y, BASKET.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a5712e'; ctx.fillRect(BASKET.x - 18, BASKET.y - 6, 36, 20);
  ctx.strokeStyle = '#a5712e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(BASKET.x, BASKET.y - 6, 14, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.font = '800 11px Nunito, system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(g.reloading > 0 ? '…' : `${g.ammo}/${AMMO}`, BASKET.x, BASKET.y + 9);
  ctx.restore();
  // Zielkreuz
  ctx.save();
  ctx.strokeStyle = g.ammo > 0 && g.reloading <= 0 ? '#ffffff' : '#ff6b6b';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'; ctx.shadowBlur = 3;
  const { x, y } = g.aim;
  ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.moveTo(x - 18, y); ctx.lineTo(x - 6, y); ctx.moveTo(x + 6, y); ctx.lineTo(x + 18, y); ctx.moveTo(x, y - 18); ctx.lineTo(x, y - 6); ctx.moveTo(x, y + 6); ctx.lineTo(x, y + 18); ctx.stroke();
  ctx.restore();
  drawFloats(ctx, g.floats, '800 14px Nunito, system-ui, sans-serif');
  if (g.banner) drawBanner(ctx, W, H * 0.2, g.banner.text, '#fff3b0', Math.min(1, g.banner.t * 2), '800 20px Fraunces, Georgia, serif');
}

export const forest: Engine<Forest> = {
  W, H,
  create: createForest,
  step: stepForest,
  draw: drawForest,
  hud: (g) => [
    { label: 'Punkte', value: String(g.score) },
    { label: 'Zapfen', value: g.reloading > 0 ? 'lädt' : '●'.repeat(g.ammo) || 'leer', tone: 'c' },
    { label: 'Zeit', value: String(Math.ceil(g.time)), tone: g.time <= 10 ? 'b' : undefined },
  ],
  score: (g) => g.score,
  over: (g) => g.over,
  tones: {
    throw: ['triangle', 500, 260, 0.08, 0.03],
    hit: ['square', 880, 1320, 0.14, 0.04],
    ouch: ['sawtooth', 300, 90, 0.35, 0.06],
    empty: ['square', 140, 120, 0.06, 0.03],
    reload: ['triangle', 200, 400, 0.25, 0.04],
    loaded: ['sine', 700, 900, 0.1, 0.04],
    warn: ['square', 880, 880, 0.15, 0.03],
    over: ['triangle', 520, 130, 0.9, 0.07],
  },
};
