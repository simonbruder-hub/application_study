/**
 * Grand Prix (Stil Rennen): Draufsicht auf eine kurvige Strecke, die nach unten wegzieht. Auf der Strecke bleiben,
 * Gegner überholen, Boost-Felder mitnehmen, Ölflecken meiden. Neben der Strecke wird man langsam, im Kies fliegt man ab.
 */
import { burst, drawBanner, drawFloats, drawSparks, type Engine, type Float, type Input, moveFloats, moveSparks, type Spark } from './types';

const W = 360;
const H = 560;
/** Bildschirmhöhe des eigenen Autos */
const CAR_Y = H - 120;
/** Abstand der Stützpunkte der Mittellinie */
const SEG = 220;
const LAP = 2400;
const KERB = 9;
const GRAVEL = 28;

interface Rival { z: number; lane: number; speed: number; color: string; passed: boolean; hit: boolean }
interface Pad { z: number; lane: number; kind: 'oil' | 'boost'; used: boolean }

export interface Race {
  car: { x: number; v: number; spin: number; inv: number; boost: number; offTrack: boolean };
  /** gefahrene Strecke (Welt-Einheiten) */
  d: number;
  pts: number[];
  rivals: Rival[];
  pads: Pad[];
  sparks: Spark[];
  floats: Float[];
  banner: { text: string; t: number } | null;
  score: number;
  bonus: number;
  lives: number;
  level: number;
  lap: number;
  time: number;
  next: { rival: number; pad: number };
  over: boolean;
  rng: () => number;
}

const RIVAL_COLORS = ['#1e88e5', '#ffd60a', '#2ec4b6', '#8338ec', '#ff7f11', '#e5e5e5'];

export function createRace(rng: () => number = Math.random): Race {
  const pts = [W / 2, W / 2, W / 2];
  return {
    car: { x: W / 2, v: 0, spin: 0, inv: 1, boost: 0, offTrack: false },
    d: 0, pts, rivals: [], pads: [], sparks: [], floats: [], banner: null,
    score: 0, bonus: 0, lives: 3, level: 1, lap: 1, time: 0,
    next: { rival: 2, pad: 3 },
    over: false, rng,
  };
}

/** Mittellinie bei Weg z (sanft zwischen Stützpunkten) */
export function centerAt(g: Race, z: number): number {
  const i = Math.max(0, z / SEG);
  const k = Math.floor(i);
  while (g.pts.length < k + 3) {
    // Stützpunkte streuen um die Mitte (kein Zufallsweg, der am Rand kleben bleibt); später mehr Kurven
    const amp = Math.min(88, 50 + g.level * 9);
    g.pts.push(W / 2 + (g.rng() - 0.5) * 2 * amp);
  }
  const t = i - k;
  const s = (1 - Math.cos(t * Math.PI)) / 2;
  return g.pts[k]! * (1 - s) + g.pts[k + 1]! * s;
}

/** Halbe Streckenbreite, wird mit den Stufen schmaler */
export const halfWidth = (g: Race) => Math.max(52, 76 - (g.level - 1) * 5);

function crash(g: Race, events: string[]): void {
  const c = g.car;
  if (c.inv > 0 || g.over) return;
  g.lives -= 1;
  c.spin = 1.1;
  c.inv = 2.2;
  c.v = 60;
  burst(g.sparks, g.rng, c.x, CAR_Y, '#ffb703', 22);
  events.push('crash');
  if (g.lives <= 0) { g.over = true; events.push('over'); }
}

export function stepRace(g: Race, dt: number, input: Input): string[] {
  const events: string[] = [];
  dt = Math.min(dt, 0.05);
  g.sparks = moveSparks(g.sparks, dt);
  g.floats = moveFloats(g.floats, dt);
  if (g.banner) { g.banner.t -= dt; if (g.banner.t <= 0) g.banner = null; }
  if (g.over) return events;
  g.time += dt;
  const c = g.car;
  c.inv = Math.max(0, c.inv - dt);
  c.boost = Math.max(0, c.boost - dt);

  // Tempo: von selbst auf Reisetempo, Gas schneller, Bremse langsamer
  const cruise = 250 + g.level * 12;
  let target = input.dy < 0 ? cruise + 130 : input.dy > 0 ? 120 : cruise;
  if (c.boost > 0) target += 140;
  const half = halfWidth(g);
  const off = Math.abs(c.x - centerAt(g, g.d));
  c.offTrack = off > half;
  if (c.offTrack) target = Math.min(target, 140);
  if (c.spin > 0) { c.spin -= dt; target = 60; }
  c.v += Math.sign(target - c.v) * Math.min(Math.abs(target - c.v), (target > c.v ? 200 : 320) * dt);
  g.d += c.v * dt;

  // Lenken: Tasten oder Finger (das Auto fährt zur Fingerposition)
  const grip = c.spin > 0 ? 0.2 : Math.min(1, 0.55 + c.v / 500);
  if (input.target) {
    const dx = input.target.x - c.x;
    c.x += Math.sign(dx) * Math.min(Math.abs(dx), 300 * grip * dt);
  } else {
    c.x += input.dx * 240 * grip * dt;
  }
  if (c.spin > 0) c.x += Math.sin(g.time * 22) * 40 * dt;
  c.x = Math.min(W - 12, Math.max(12, c.x));

  // Kies: Abflug, dann zurück auf die Strecke
  if (Math.abs(c.x - centerAt(g, g.d)) > half + KERB + GRAVEL - 4) {
    crash(g, events);
    c.x = centerAt(g, g.d);
  }
  if (c.offTrack && c.v > 80 && g.rng() < dt * 30) burst(g.sparks, g.rng, c.x, CAR_Y + 14, '#c2a878', 1, 60);

  // Gegner und Felder vor dem Auto
  const n = g.next;
  n.rival -= dt; n.pad -= dt;
  if (n.rival <= 0) {
    g.rivals.push({ z: g.d + H, lane: (g.rng() - 0.5) * 1.2, speed: 150 + g.rng() * 70 + g.level * 6, color: RIVAL_COLORS[Math.floor(g.rng() * RIVAL_COLORS.length)]!, passed: false, hit: false });
    n.rival = Math.max(1.1, 3 - g.level * 0.25) * (0.7 + g.rng() * 0.6);
  }
  if (n.pad <= 0) {
    g.pads.push({ z: g.d + H + 40, lane: (g.rng() - 0.5) * 1.3, kind: g.rng() < 0.45 ? 'oil' : 'boost', used: false });
    n.pad = 1.8 + g.rng() * 2.2;
  }
  for (const r of g.rivals) {
    r.z += r.speed * dt;
    // Gegner weichen leicht aus, damit sie auf der Strecke bleiben
    r.lane += Math.sin(g.time * 0.8 + r.speed) * 0.08 * dt;
    r.lane = Math.max(-0.7, Math.min(0.7, r.lane));
    const ry = CAR_Y - (r.z - g.d);
    const rx = centerAt(g, r.z) + r.lane * half;
    if (!r.hit && Math.abs(rx - c.x) < 20 && Math.abs(ry - CAR_Y) < 36) {
      r.hit = true;
      crash(g, events);
    }
    if (!r.passed && r.z < g.d - 40) {
      r.passed = true;
      if (!r.hit) {
        g.bonus += 25;
        g.floats.push({ x: c.x, y: CAR_Y - 30, text: 'Überholt +25', color: '#ffd60a', life: 1 });
        events.push('overtake');
      }
    }
  }
  for (const p of g.pads) {
    if (p.used) continue;
    const py = CAR_Y - (p.z - g.d);
    const px = centerAt(g, p.z) + p.lane * half;
    if (Math.abs(px - c.x) < 22 && Math.abs(py - CAR_Y) < 22) {
      p.used = true;
      if (p.kind === 'boost') {
        c.boost = 1.6;
        g.bonus += 15;
        g.floats.push({ x: c.x, y: CAR_Y - 30, text: 'Boost +15', color: '#4cc9f0', life: 0.9 });
        events.push('boost');
      } else if (c.inv <= 0) {
        c.spin = 0.8;
        events.push('oil');
      }
    }
  }
  g.rivals = g.rivals.filter((r) => r.z > g.d - CAR_Y - 80 && r.z < g.d + H * 2);
  g.pads = g.pads.filter((p) => p.z > g.d - CAR_Y - 60);

  const lap = 1 + Math.floor(g.d / LAP);
  if (lap > g.lap) {
    g.lap = lap;
    g.bonus += 100;
    g.banner = { text: `Runde ${lap} · +100`, t: 1.8 };
    events.push('lap');
  }
  g.score = Math.floor(g.d / 20) + g.bonus;
  const level = 1 + Math.floor(g.d / 4800);
  if (level > g.level) g.level = level;
  return events;
}

/* ---------- Zeichnen ---------- */

function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(-11, -20, 24, 44);
  ctx.fillStyle = '#111111';
  for (const [wx, wy] of [[-12, -13], [8, -13], [-13, 9], [9, 9]] as const) ctx.fillRect(wx, wy, 5, 10);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -24); ctx.lineTo(5, -14); ctx.lineTo(7, 8); ctx.lineTo(5, 18); ctx.lineTo(-5, 18); ctx.lineTo(-7, 8); ctx.lineTo(-5, -14);
  ctx.closePath(); ctx.fill();
  ctx.fillRect(-11, -24, 22, 4);
  ctx.fillRect(-10, 16, 20, 5);
  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath(); ctx.ellipse(0, -2, 3.2, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fillRect(-1, -20, 2, 10);
  ctx.restore();
}

export function drawRace(ctx: CanvasRenderingContext2D, g: Race): void {
  // Wiese mit Streifen, die mitziehen
  ctx.fillStyle = '#3f8f3a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  for (let y = -60 + (g.d % 60); y < H; y += 60) ctx.fillRect(0, y, W, 30);
  const half = halfWidth(g);
  const STEP = 6;
  const row = (y: number) => { const z = g.d + (CAR_Y - y); return { z, cx: centerAt(g, z) }; };
  // Kies, Randsteine und Asphalt: jede Ebene in einem eigenen Durchgang, damit keine Fugen entstehen
  const rows: { y: number; z: number; cx: number }[] = [];
  for (let y = -STEP; y < H + STEP; y += STEP) rows.push({ y, ...row(y) });
  const band = (w: number, color: (r: { z: number }) => string | null) => {
    for (const r of rows) {
      const c = color(r);
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(r.cx - w, r.y, w * 2, STEP + 1);
    }
  };
  band(half + KERB + GRAVEL, () => '#d8c9a3');
  band(half + KERB, (r) => (Math.floor(r.z / 22) % 2 ? '#e63946' : '#ffffff'));
  band(half, () => '#3a3d44');
  for (const r of rows) {
    if (Math.floor(r.z / 40) % 2 === 0) { ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'; ctx.fillRect(r.cx - 1.5, r.y, 3, STEP + 1); }
    // Start und Ziel: Schachbrett über die Strecke
    if (r.z > 50 && r.z % LAP < STEP) {
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i % 2 ? '#111111' : '#ffffff';
        ctx.fillRect(r.cx - half + (i * half * 2) / 12, r.y, (half * 2) / 12, STEP);
      }
    }
  }
  for (const p of g.pads) {
    if (p.used && p.kind === 'boost') continue;
    const y = CAR_Y - (p.z - g.d);
    const x = centerAt(g, p.z) + p.lane * half;
    if (p.kind === 'oil') {
      ctx.fillStyle = 'rgba(10, 10, 20, 0.85)';
      ctx.beginPath(); ctx.ellipse(x, y, 16, 10, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(120, 90, 200, 0.35)';
      ctx.beginPath(); ctx.ellipse(x - 4, y - 2, 6, 3, 0.3, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#4cc9f0';
      for (const oy of [6, -4]) {
        ctx.beginPath(); ctx.moveTo(x - 12, y + oy + 6); ctx.lineTo(x, y + oy - 6); ctx.lineTo(x + 12, y + oy + 6); ctx.lineTo(x + 7, y + oy + 6); ctx.lineTo(x, y + oy - 1); ctx.lineTo(x - 7, y + oy + 6); ctx.fill();
      }
    }
  }
  for (const r of g.rivals) {
    const y = CAR_Y - (r.z - g.d);
    if (y < -40 || y > H + 40) continue;
    drawCar(ctx, centerAt(g, r.z) + r.lane * half, y, r.color, 0);
  }
  drawSparks(ctx, g.sparks);
  const c = g.car;
  if (!(c.inv > 0 && c.spin <= 0 && Math.floor(c.inv * 10) % 2 === 0)) {
    // Fahrtrichtung folgt der Strecke, beim Dreher rotiert das Auto
    const ahead = centerAt(g, g.d + 30) - centerAt(g, g.d);
    const angle = c.spin > 0 ? c.spin * 9 : Math.atan2(ahead, 30) * 0.5;
    if (c.boost > 0) {
      ctx.fillStyle = 'rgba(76, 201, 240, 0.7)';
      ctx.beginPath(); ctx.moveTo(c.x - 6, CAR_Y + 20); ctx.lineTo(c.x, CAR_Y + 44 + Math.sin(g.time * 40) * 5); ctx.lineTo(c.x + 6, CAR_Y + 20); ctx.fill();
    }
    drawCar(ctx, c.x, CAR_Y, '#e10600', angle);
  }
  drawFloats(ctx, g.floats, '700 13px "Russo One", system-ui, sans-serif');
  if (g.banner) drawBanner(ctx, W, H * 0.36, g.banner.text, '#ffd60a', Math.min(1, g.banner.t * 2), '400 20px "Russo One", system-ui, sans-serif');
}

export const racer: Engine<Race> = {
  W, H,
  create: createRace,
  step: stepRace,
  draw: drawRace,
  hud: (g) => [
    { label: 'Punkte', value: String(g.score) },
    { label: 'km/h', value: String(Math.round(g.car.v * 0.8)), tone: 'c' },
    { label: 'Runde', value: String(g.lap) },
    { label: 'Leben', value: '♥'.repeat(Math.max(0, g.lives)) || '–', tone: 'b' },
  ],
  score: (g) => g.score,
  over: (g) => g.over,
  tones: {
    crash: ['sawtooth', 200, 40, 0.5, 0.09],
    overtake: ['square', 520, 880, 0.12, 0.03],
    boost: ['sawtooth', 300, 1200, 0.4, 0.04],
    oil: ['sine', 500, 150, 0.5, 0.05],
    lap: ['square', 660, 1320, 0.45, 0.05],
    over: ['triangle', 330, 70, 0.9, 0.08],
  },
};
