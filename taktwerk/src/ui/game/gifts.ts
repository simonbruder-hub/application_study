/**
 * Geschenkejagd (Stil Weihnachten): Geschenke fallen vom Nachthimmel, ein Elf fängt sie unten mit seinem Sack.
 * Kohle kostet ein Leben, ebenso ein Geschenk, das in den Schnee fällt. Sterne geben Extrapunkte, die Glocke
 * zieht Geschenke an, der grosse Sack fängt breiter. Ab und zu fliegt der Schlitten vorbei und wirft viele ab.
 */
import { burst, drawBanner, drawFloats, drawSparks, type Engine, type Float, type Input, moveFloats, moveSparks, type Spark } from './types';

const W = 360;
const H = 560;
const ELF_Y = H - 64;

export type ItemKind = 'gift' | 'cane' | 'star' | 'coal' | 'bell' | 'sack';
interface Item { kind: ItemKind; x: number; y: number; vy: number; vx: number; size: number; color: string; ribbon: string; spin: number; rot: number }
interface Flake { x: number; y: number; r: number; s: number }

export interface Gifts {
  elf: { x: number; vx: number; inv: number; magnet: number; wide: number; catchAnim: number };
  items: Item[];
  flakes: Flake[];
  sparks: Spark[];
  floats: Float[];
  sleigh: { x: number; drop: number } | null;
  banner: { text: string; t: number } | null;
  score: number;
  combo: number;
  caught: number;
  lives: number;
  level: number;
  time: number;
  spawn: number;
  nextSleigh: number;
  over: boolean;
  rng: () => number;
}

const COLORS = [['#c8102e', '#ffd166'], ['#1b6b3a', '#f1faee'], ['#4361ee', '#ffd166'], ['#7b2cbf', '#f1faee'], ['#ff8fab', '#c8102e'], ['#f4a261', '#1b6b3a']] as const;
export const POINTS: Record<ItemKind, number> = { gift: 10, cane: 15, star: 50, coal: 0, bell: 20, sack: 20 };

export function createGifts(rng: () => number = Math.random): Gifts {
  return {
    elf: { x: W / 2, vx: 0, inv: 0, magnet: 0, wide: 0, catchAnim: 0 },
    items: [], sparks: [], floats: [], sleigh: null, banner: null,
    flakes: Array.from({ length: 60 }, () => ({ x: rng() * W, y: rng() * H, r: 0.6 + rng() * 1.8, s: 14 + rng() * 30 })),
    score: 0, combo: 0, caught: 0, lives: 3, level: 1, time: 0, spawn: 0.6, nextSleigh: 14,
    over: false, rng,
  };
}

function spawn(g: Gifts, x = 24 + g.rng() * (W - 48), y = -24): void {
  const r = g.rng();
  const coal = Math.min(0.28, 0.08 + g.level * 0.03);
  const kind: ItemKind = r < coal ? 'coal' : r < coal + 0.06 ? 'star' : r < coal + 0.14 ? 'cane' : r < coal + 0.17 ? (g.rng() < 0.5 ? 'bell' : 'sack') : 'gift';
  const [color, ribbon] = COLORS[Math.floor(g.rng() * COLORS.length)]!;
  const speed = 95 + g.level * 14 + g.rng() * 40;
  g.items.push({ kind, x, y, vy: kind === 'star' ? speed * 1.3 : speed, vx: (g.rng() - 0.5) * 20, size: 15 + g.rng() * 8, color, ribbon, spin: (g.rng() - 0.5) * 2, rot: g.rng() * 0.6 - 0.3 });
}

/** Breite der Sacköffnung */
const sackHalf = (g: Gifts) => (g.elf.wide > 0 ? 44 : 28);

function lose(g: Gifts, events: string[], x: number, y: number, text: string): void {
  if (g.elf.inv > 0) return;
  g.lives -= 1;
  g.combo = 0;
  g.elf.inv = 1.2;
  g.floats.push({ x, y: y - 10, text, color: '#ff6b6b', life: 1.1 });
  events.push('miss');
  if (g.lives <= 0) { g.over = true; events.push('over'); }
}

export function stepGifts(g: Gifts, dt: number, input: Input): string[] {
  const events: string[] = [];
  dt = Math.min(dt, 0.05);
  g.sparks = moveSparks(g.sparks, dt);
  g.floats = moveFloats(g.floats, dt);
  for (const f of g.flakes) { f.y += f.s * dt; f.x += Math.sin((f.y + f.s * 10) * 0.02) * 8 * dt; if (f.y > H) { f.y = -4; f.x = g.rng() * W; } }
  if (g.banner) { g.banner.t -= dt; if (g.banner.t <= 0) g.banner = null; }
  if (g.over) return events;
  g.time += dt;
  const e = g.elf;
  e.inv = Math.max(0, e.inv - dt);
  e.magnet = Math.max(0, e.magnet - dt);
  e.wide = Math.max(0, e.wide - dt);
  e.catchAnim = Math.max(0, e.catchAnim - dt);

  // Laufen: Tasten mit etwas Schwung, oder zum Finger
  const before = e.x;
  if (input.target) {
    const dx = input.target.x - e.x;
    e.x += Math.sign(dx) * Math.min(Math.abs(dx), 520 * dt);
  } else {
    e.vx += (input.dx * 330 - e.vx) * Math.min(1, dt * 12);
    e.x += e.vx * dt;
  }
  e.x = Math.min(W - 26, Math.max(26, e.x));
  e.vx = input.target ? (e.x - before) / Math.max(dt, 0.001) : e.vx;

  // Nachschub, dichter mit den Stufen; der Schlitten wirft eine ganze Ladung
  g.spawn -= dt;
  if (g.spawn <= 0) { spawn(g); g.spawn = Math.max(0.35, 1.1 - g.level * 0.08) * (0.7 + g.rng() * 0.6); }
  g.nextSleigh -= dt;
  if (g.nextSleigh <= 0 && !g.sleigh) { g.sleigh = { x: -120, drop: 0.3 }; g.nextSleigh = 22 + g.rng() * 10; g.banner = { text: 'Ho ho ho!', t: 1.4 }; events.push('sleigh'); }
  if (g.sleigh) {
    g.sleigh.x += 150 * dt;
    g.sleigh.drop -= dt;
    if (g.sleigh.drop <= 0 && g.sleigh.x > 20 && g.sleigh.x < W - 20) { spawn(g, g.sleigh.x, 60); g.sleigh.drop = 0.28; }
    if (g.sleigh.x > W + 140) g.sleigh = null;
  }

  const half = sackHalf(g);
  for (const it of g.items) {
    // Glocke: Geschenke schweben zum Sack
    if (e.magnet > 0 && it.kind !== 'coal') it.vx += Math.sign(e.x - it.x) * 160 * dt;
    it.x += it.vx * dt;
    it.y += it.vy * dt;
    it.rot += it.spin * dt;
    const inSack = it.y > ELF_Y - 66 && it.y < ELF_Y - 40 && Math.abs(it.x - e.x) < half;
    if (inSack) {
      it.y = H + 999;
      if (it.kind === 'coal') { burst(g.sparks, g.rng, it.x, ELF_Y - 52, '#555555', 12); lose(g, events, it.x, ELF_Y - 62, 'Kohle!'); continue; }
      g.combo += 1;
      g.caught += 1;
      const mult = g.combo >= 10 ? 3 : g.combo >= 5 ? 2 : 1;
      const pts = POINTS[it.kind] * mult;
      g.score += pts;
      e.catchAnim = 0.25;
      burst(g.sparks, g.rng, it.x, ELF_Y - 56, it.kind === 'star' ? '#ffd166' : it.color, 10, 90);
      g.floats.push({ x: it.x, y: ELF_Y - 74, text: `+${pts}${mult > 1 ? ` ×${mult}` : ''}`, color: '#fff3b0', life: 0.9 });
      if (it.kind === 'bell') { e.magnet = 6; g.banner = { text: 'Glocke: Geschenke fliegen zu dir', t: 1.4 }; }
      if (it.kind === 'sack') { e.wide = 8; g.banner = { text: 'Grosser Sack', t: 1.2 }; }
      events.push(it.kind === 'star' ? 'star' : it.kind === 'bell' || it.kind === 'sack' ? 'power' : 'catch');
    } else if (it.y > H - 18 && it.y < H + 100) {
      it.y = H + 999;
      if (it.kind === 'gift') { burst(g.sparks, g.rng, it.x, H - 16, '#ffffff', 8, 60); lose(g, events, it.x, H - 30, 'In den Schnee!'); }
    }
  }
  g.items = g.items.filter((it) => it.y < H + 50);
  const level = 1 + Math.floor(g.caught / 15);
  if (level > g.level) { g.level = level; g.banner = { text: `Stufe ${level}`, t: 1.4 }; events.push('level'); }
  return events;
}

/* ---------- Zeichnen ---------- */

const cache: { k: number; bg: HTMLCanvasElement | null } = { k: 0, bg: null };

function backdrop(ctx: CanvasRenderingContext2D): void {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0a1630'); sky.addColorStop(0.6, '#1b2f55'); sky.addColorStop(1, '#2c4675');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    const v = Math.sin(i * 91.7) * 43758.5; const x = (v - Math.floor(v)) * W;
    const u = Math.sin(i * 17.3) * 12345.6; const y = (u - Math.floor(u)) * 300;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + ((i * 7) % 10) / 14})`;
    ctx.fillRect(x, y, i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1);
  }
  // Mond mit Lichthof
  const halo = ctx.createRadialGradient(290, 80, 10, 290, 80, 90);
  halo.addColorStop(0, 'rgba(255, 246, 216, 0.5)'); halo.addColorStop(1, 'rgba(255, 246, 216, 0)');
  ctx.fillStyle = halo; ctx.fillRect(180, 0, 180, 200);
  ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(290, 80, 24, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(200, 190, 160, 0.35)';
  for (const [x, y, r] of [[282, 74, 5], [298, 90, 4], [296, 72, 2.5]] as const) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  // Hügel, Tannen und Dorf mit warmen Fenstern
  ctx.fillStyle = '#c9d9ea';
  ctx.beginPath(); ctx.moveTo(0, 410); ctx.quadraticCurveTo(90, 360, 190, 400); ctx.quadraticCurveTo(280, 370, 360, 395); ctx.lineTo(360, H); ctx.lineTo(0, H); ctx.fill();
  const fir = (x: number, y: number, h: number, c: string) => {
    ctx.fillStyle = c;
    for (let k = 0; k < 3; k++) { const top = y - h + k * h * 0.28; const w = h * (0.22 + k * 0.12); ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + w, top + h * 0.42); ctx.lineTo(x - w, top + h * 0.42); ctx.fill(); }
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 3; k++) { const top = y - h + k * h * 0.28; const w = h * (0.22 + k * 0.12); ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + w * 0.5, top + h * 0.2); ctx.lineTo(x - w * 0.5, top + h * 0.2); ctx.fill(); }
  };
  for (const [x, y, h] of [[20, 400, 60], [52, 392, 44], [318, 392, 56], [346, 400, 40], [150, 398, 34]] as const) fir(x, y, h, '#1e4a3a');
  for (const [x, y, s] of [[96, 382, 1], [208, 392, 0.8], [250, 380, 1.1]] as const) {
    ctx.fillStyle = '#6b3e2a'; ctx.fillRect(x - 14 * s, y - 16 * s, 28 * s, 18 * s);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x - 18 * s, y - 15 * s); ctx.lineTo(x, y - 30 * s); ctx.lineTo(x + 18 * s, y - 15 * s); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ffb703'; ctx.shadowBlur = 8;
    ctx.fillRect(x - 9 * s, y - 11 * s, 6 * s, 6 * s); ctx.fillRect(x + 3 * s, y - 11 * s, 6 * s, 6 * s);
    ctx.shadowBlur = 0;
  }
  // Schneeboden
  const ground = ctx.createLinearGradient(0, H - 70, 0, H);
  ground.addColorStop(0, '#eef4fb'); ground.addColorStop(1, '#cfdcea');
  ctx.fillStyle = ground;
  ctx.beginPath(); ctx.moveTo(0, H - 46); ctx.quadraticCurveTo(120, H - 64, 220, H - 48); ctx.quadraticCurveTo(300, H - 38, 360, H - 52); ctx.lineTo(360, H); ctx.lineTo(0, H); ctx.fill();
}

function drawItem(ctx: CanvasRenderingContext2D, it: Item, t: number): void {
  ctx.save();
  ctx.translate(it.x, it.y);
  ctx.rotate(it.rot);
  const s = it.size;
  switch (it.kind) {
    case 'gift': {
      const g = ctx.createLinearGradient(-s, -s, s, s);
      g.addColorStop(0, it.color); g.addColorStop(1, shade(it.color));
      ctx.fillStyle = g;
      ctx.fillRect(-s * 0.8, -s * 0.6, s * 1.6, s * 1.3);
      ctx.fillStyle = it.color; ctx.fillRect(-s * 0.9, -s * 0.78, s * 1.8, s * 0.32);
      ctx.fillStyle = it.ribbon;
      ctx.fillRect(-s * 0.12, -s * 0.78, s * 0.24, s * 1.5);
      ctx.fillRect(-s * 0.8, -s * 0.1, s * 1.6, s * 0.2);
      // Schleife
      ctx.beginPath(); ctx.ellipse(-s * 0.28, -s * 0.9, s * 0.3, s * 0.18, -0.5, 0, Math.PI * 2); ctx.ellipse(s * 0.28, -s * 0.9, s * 0.3, s * 0.18, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'; ctx.fillRect(-s * 0.7, -s * 0.5, s * 0.25, s * 1);
      break;
    }
    case 'cane': {
      ctx.lineCap = 'round';
      ctx.lineWidth = 6; ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(0, -s * 0.4); ctx.arc(-s * 0.4, -s * 0.4, s * 0.4, 0, Math.PI, true); ctx.stroke();
      ctx.setLineDash([3, 4]); ctx.strokeStyle = '#c8102e';
      ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(0, -s * 0.4); ctx.arc(-s * 0.4, -s * 0.4, s * 0.4, 0, Math.PI, true); ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'star': {
      ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 14 + Math.sin(t * 10) * 4;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? s * 0.45 : s; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.fill();
      ctx.fillStyle = '#fff8d6'; ctx.beginPath(); ctx.arc(-s * 0.15, -s * 0.2, s * 0.18, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'coal': {
      const g = ctx.createRadialGradient(-s * 0.3, -s * 0.3, 1, 0, 0, s);
      g.addColorStop(0, '#5a5a5a'); g.addColorStop(1, '#151515');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-s * 0.8, -s * 0.2); ctx.lineTo(-s * 0.3, -s * 0.8); ctx.lineTo(s * 0.5, -s * 0.6); ctx.lineTo(s * 0.85, 0); ctx.lineTo(s * 0.4, s * 0.7); ctx.lineTo(-s * 0.5, s * 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255, 120, 60, 0.4)'; ctx.beginPath(); ctx.arc(s * 0.2, s * 0.1, s * 0.15, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'bell': {
      ctx.fillStyle = '#e9b949'; ctx.strokeStyle = '#a0761a'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-s * 0.7, s * 0.5); ctx.quadraticCurveTo(-s * 0.6, -s * 0.8, 0, -s * 0.8); ctx.quadraticCurveTo(s * 0.6, -s * 0.8, s * 0.7, s * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#a0761a'; ctx.beginPath(); ctx.arc(0, s * 0.6, s * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c8102e'; ctx.fillRect(-s * 0.3, -s * 1.05, s * 0.6, s * 0.28);
      break;
    }
    case 'sack': {
      ctx.fillStyle = '#9a6b3e';
      ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.6); ctx.quadraticCurveTo(-s, s * 0.9, 0, s * 0.9); ctx.quadraticCurveTo(s, s * 0.9, s * 0.4, -s * 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c8102e'; ctx.fillRect(-s * 0.45, -s * 0.7, s * 0.9, s * 0.2);
      ctx.fillStyle = '#ffd166'; ctx.font = `800 ${Math.round(s * 0.8)}px Fredoka, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('+', 0, s * 0.5);
      break;
    }
  }
  ctx.restore();
}

/** Farbe abdunkeln für Verläufe */
function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.62).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

function drawElf(ctx: CanvasRenderingContext2D, g: Gifts): void {
  const e = g.elf;
  if (e.inv > 0 && Math.floor(e.inv * 10) % 2 === 0) return;
  const run = Math.abs(e.vx) > 20 ? Math.sin(g.time * 18) : 0;
  const lean = Math.max(-0.18, Math.min(0.18, e.vx / 1600));
  ctx.save();
  ctx.translate(e.x, ELF_Y);
  ctx.rotate(lean);
  // Beine und Schnabelschuhe
  ctx.fillStyle = '#c8102e';
  ctx.fillRect(-9, 18, 6, 14 + run * 2); ctx.fillRect(3, 18, 6, 14 - run * 2);
  ctx.fillStyle = '#1b6b3a';
  ctx.beginPath(); ctx.ellipse(-8, 33 + run * 2, 7, 3, -0.2, 0, Math.PI * 2); ctx.ellipse(8, 33 - run * 2, 7, 3, 0.2, 0, Math.PI * 2); ctx.fill();
  // Körper mit Gürtel
  const coat = ctx.createLinearGradient(-14, 0, 14, 0);
  coat.addColorStop(0, '#2d8a4e'); coat.addColorStop(1, '#1b6b3a');
  ctx.fillStyle = coat;
  ctx.beginPath(); ctx.moveTo(-13, 20); ctx.lineTo(-10, -4); ctx.lineTo(10, -4); ctx.lineTo(13, 20); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a1a14'; ctx.fillRect(-12, 8, 24, 4);
  ctx.fillStyle = '#ffd166'; ctx.fillRect(-3, 7.5, 6, 5);
  // Arme halten den Sack über dem Kopf
  ctx.strokeStyle = '#2d8a4e'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-18, -20); ctx.lineTo(-20, -38); ctx.moveTo(9, 0); ctx.lineTo(18, -20); ctx.lineTo(20, -38); ctx.stroke();
  ctx.fillStyle = '#f6c9a3'; ctx.beginPath(); ctx.arc(-20, -39, 3, 0, Math.PI * 2); ctx.arc(20, -39, 3, 0, Math.PI * 2); ctx.fill();
  // Kopf mit spitzen Ohren und Mütze
  ctx.fillStyle = '#f6c9a3';
  ctx.beginPath(); ctx.moveTo(-9, -12); ctx.lineTo(-16, -18); ctx.lineTo(-8, -16); ctx.fill();
  ctx.beginPath(); ctx.moveTo(9, -12); ctx.lineTo(16, -18); ctx.lineTo(8, -16); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -12, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a1a14'; ctx.beginPath(); ctx.arc(-3, -13, 1.1, 0, Math.PI * 2); ctx.arc(3, -13, 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff8fab'; ctx.beginPath(); ctx.arc(-5, -10, 1.6, 0, Math.PI * 2); ctx.arc(5, -10, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Mütze mit Glöckchen (unter dem Sack)
  ctx.save();
  ctx.translate(e.x, ELF_Y);
  ctx.rotate(lean);
  ctx.fillStyle = '#c8102e';
  ctx.beginPath(); ctx.moveTo(-9, -16); ctx.quadraticCurveTo(0, -36, 14 + run * 2, -30); ctx.lineTo(9, -16); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-10, -18, 20, 4);
  ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(15 + run * 2, -30, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Sack (Fangzone) mit offener Öffnung
  const half = sackHalf(g);
  const pop = e.catchAnim > 0 ? 1 + e.catchAnim : 1;
  ctx.save();
  ctx.translate(e.x, ELF_Y - 48);
  ctx.scale(pop, 1 / pop);
  const sack = ctx.createLinearGradient(0, -14, 0, 16);
  sack.addColorStop(0, '#b07a45'); sack.addColorStop(1, '#7a5230');
  ctx.fillStyle = sack;
  ctx.beginPath(); ctx.moveTo(-half, -10); ctx.quadraticCurveTo(-half - 4, 14, 0, 16); ctx.quadraticCurveTo(half + 4, 14, half, -10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3e2a18'; ctx.beginPath(); ctx.ellipse(0, -10, half, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#c8102e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, -10, half, 6, 0, 0, Math.PI * 2); ctx.stroke();
  if (e.magnet > 0) { ctx.strokeStyle = `rgba(255, 209, 102, ${0.4 + Math.sin(g.time * 12) * 0.3})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -10, half + 14, Math.PI, 0); ctx.stroke(); }
  ctx.restore();
}

export function drawGifts(ctx: CanvasRenderingContext2D, g: Gifts): void {
  const k = ctx.getTransform().a || 1;
  if (cache.k !== k || !cache.bg) {
    const el = document.createElement('canvas');
    el.width = Math.round(W * k); el.height = Math.round(H * k);
    const c = el.getContext('2d')!; c.scale(k, k); backdrop(c);
    cache.k = k; cache.bg = el;
  }
  ctx.drawImage(cache.bg, 0, 0, W, H);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  for (const f of g.flakes) { ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill(); }
  if (g.sleigh) {
    ctx.save();
    ctx.translate(g.sleigh.x, 50 + Math.sin(g.time * 4) * 6);
    ctx.fillStyle = '#c8102e'; ctx.beginPath(); ctx.moveTo(-30, -6); ctx.lineTo(10, -6); ctx.quadraticCurveTo(18, -6, 18, 4); ctx.lineTo(-30, 4); ctx.fill();
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-34, 9); ctx.lineTo(20, 9); ctx.quadraticCurveTo(26, 9, 26, 4); ctx.stroke();
    ctx.fillStyle = '#9a6b3e'; ctx.beginPath(); ctx.arc(-20, -10, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c8102e'; ctx.beginPath(); ctx.arc(0, -12, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, -7, 5, 0, Math.PI); ctx.fill();
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = '#8a5a3b'; ctx.beginPath(); ctx.ellipse(46 + i * 26, 0, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(57 + i * 26, -6, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(56 + i * 26, -9); ctx.lineTo(54 + i * 26, -16); ctx.moveTo(58 + i * 26, -9); ctx.lineTo(61 + i * 26, -15); ctx.stroke();
    }
    ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(87, -6, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  for (const it of g.items) drawItem(ctx, it, g.time);
  drawSparks(ctx, g.sparks);
  if (!g.over) drawElf(ctx, g);
  drawFloats(ctx, g.floats, '700 14px Fredoka, system-ui, sans-serif');
  if (g.banner) drawBanner(ctx, W, H * 0.4, g.banner.text, '#ffd166', Math.min(1, g.banner.t * 2), '700 20px Fredoka, system-ui, sans-serif');
}

export const gifts: Engine<Gifts> = {
  W, H,
  create: createGifts,
  step: stepGifts,
  draw: drawGifts,
  hud: (g) => [
    { label: 'Punkte', value: String(g.score) },
    { label: 'Combo', value: g.combo >= 5 ? `${g.combo} ×${g.combo >= 10 ? 3 : 2}` : String(g.combo), tone: 'c' },
    { label: 'Leben', value: '♥'.repeat(Math.max(0, g.lives)) || '–', tone: 'b' },
  ],
  score: (g) => g.score,
  over: (g) => g.over,
  tones: {
    catch: ['sine', 880, 1320, 0.12, 0.04],
    star: ['triangle', 1046, 2093, 0.35, 0.05],
    power: ['sine', 523, 1568, 0.4, 0.05],
    miss: ['sawtooth', 220, 80, 0.4, 0.07],
    sleigh: ['triangle', 1318, 1760, 0.6, 0.04],
    level: ['sine', 660, 1320, 0.4, 0.05],
    over: ['triangle', 392, 98, 1, 0.07],
  },
};
