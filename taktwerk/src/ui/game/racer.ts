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
const SEG = 380;
const LAP = 2400;
const KERB = 9;
const GRAVEL = 28;

interface Rival { z: number; lane: number; speed: number; color: string; passed: boolean; hit: boolean }
interface Pad { z: number; lane: number; kind: 'oil' | 'boost'; used: boolean }

export interface Race {
  /** x quer, vx Quertempo (weich gelenkt), v Tempo entlang der Strecke */
  car: { x: number; vx: number; v: number; spin: number; inv: number; boost: number; offTrack: boolean };
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
    car: { x: W / 2, vx: 0, v: 0, spin: 0, inv: 1, boost: 0, offTrack: false },
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
    const amp = Math.min(72, 36 + g.level * 8);
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

  // Lenken: Tasten oder Finger (das Auto fährt zur Fingerposition); das Quertempo folgt weich, nicht ruckartig
  const grip = c.spin > 0 ? 0.15 : Math.min(1, 0.6 + c.v / 600);
  const LAT = 175;
  const want = input.target ? Math.max(-LAT, Math.min(LAT, (input.target.x - c.x) * 4.5)) : input.dx * LAT;
  c.vx += (want - c.vx) * Math.min(1, dt * 6 * grip);
  c.x += c.vx * dt;
  if (c.x < 12 || c.x > W - 12) c.vx = 0;
  c.x = Math.min(W - 12, Math.max(12, c.x));

  // Kies: Abflug, dann zurück auf die Strecke
  if (Math.abs(c.x - centerAt(g, g.d)) > half + KERB + GRAVEL - 4) {
    crash(g, events);
    c.x = centerAt(g, g.d);
    c.vx = 0;
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

/** Vorhersagbare Streuung für Deko und Körnung */
const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

/** Formel-Auto von oben: Nase nach oben, Frontflügel, Seitenkästen, Cockpit mit Helm, Heckflügel */
function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, accent: string, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath(); ctx.roundRect(-9, -20, 24, 46, 6); ctx.fill();
  ctx.fillStyle = '#141414';
  for (const [wx, wy, ww, wh] of [[-13, -17, 5, 10], [8, -17, 5, 10], [-14.5, 6, 6.5, 12], [8, 6, 6.5, 12]] as const) {
    ctx.beginPath(); ctx.roundRect(wx, wy, ww, wh, 1.6); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  for (const [wx, wy, wh] of [[-12, -16, 8], [9, -16, 8], [-13.5, 7, 10], [9, 7, 10]] as const) ctx.fillRect(wx, wy, 1, wh);
  const body = ctx.createLinearGradient(-8, 0, 8, 0);
  body.addColorStop(0, color); body.addColorStop(0.5, '#ffffff'); body.addColorStop(0.56, color); body.addColorStop(1, color);
  ctx.fillStyle = body;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(0, -25); ctx.lineTo(2.6, -16); ctx.lineTo(3.4, -7); ctx.lineTo(8, -3); ctx.lineTo(8.4, 9); ctx.lineTo(5, 16);
  ctx.lineTo(-5, 16); ctx.lineTo(-8.4, 9); ctx.lineTo(-8, -3); ctx.lineTo(-3.4, -7); ctx.lineTo(-2.6, -16);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(2.6, -16); ctx.lineTo(3.4, -7); ctx.lineTo(8, -3); ctx.lineTo(8.4, 9); ctx.lineTo(5, 16); ctx.lineTo(-5, 16); ctx.lineTo(-8.4, 9); ctx.lineTo(-8, -3); ctx.lineTo(-3.4, -7); ctx.lineTo(-2.6, -16); ctx.closePath();
  ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
  // Frontflügel und Heckflügel
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.roundRect(-12.5, -26, 25, 3.6, 1.2); ctx.fill();
  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath(); ctx.roundRect(-11.5, 17, 23, 4.2, 1.2); ctx.fill();
  ctx.fillStyle = accent;
  ctx.fillRect(-11.5, 16, 2, 6); ctx.fillRect(9.5, 16, 2, 6);
  // Streifen, Cockpit, Halo, Helm
  ctx.fillRect(-0.9, -21, 1.8, 10);
  ctx.fillStyle = '#101010';
  ctx.beginPath(); ctx.ellipse(0, -2, 3.4, 5.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd60a';
  ctx.beginPath(); ctx.arc(0, -1.5, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, -2.5, 4.4, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(-1.2, 5, 2.4, 10);
  ctx.restore();
}

/** Baum von oben: Schatten, flache Kronenlappen in zwei Grüntönen */
function topTree(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath(); ctx.ellipse(x + r * 0.35, y + r * 0.35, r * 1.05, r * 0.95, 0, 0, Math.PI * 2); ctx.fill();
  const lobes = (cx: number, cy: number, rr: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + seed;
      const lr = rr * (0.42 + hash(seed, i) * 0.14);
      ctx.moveTo(cx + Math.cos(a) * rr * 0.55 + lr, cy + Math.sin(a) * rr * 0.55);
      ctx.arc(cx + Math.cos(a) * rr * 0.55, cy + Math.sin(a) * rr * 0.55, lr, 0, Math.PI * 2);
    }
    ctx.moveTo(cx + rr * 0.6, cy);
    ctx.arc(cx, cy, rr * 0.6, 0, Math.PI * 2);
    ctx.fill();
  };
  lobes(x, y, r, '#2b6128');
  lobes(x - r * 0.18, y - r * 0.2, r * 0.7, '#3f8436');
  ctx.fillStyle = '#5fa54b';
  for (let i = 0; i < 6; i++) { const a = hash(seed, i + 9) * Math.PI * 2; const d = hash(seed, i + 19) * r * 0.5; ctx.fillRect(x - r * 0.2 + Math.cos(a) * d, y - r * 0.2 + Math.sin(a) * d, 2, 2); }
}

export function drawRace(ctx: CanvasRenderingContext2D, g: Race): void {
  const half = halfWidth(g);
  const yAt = (z: number) => CAR_Y - (z - g.d);
  const zTop = g.d + CAR_Y + 30;
  const zBot = g.d + CAR_Y - H - 30;
  const rows: { y: number; cx: number }[] = [];
  for (let z = zTop; z >= zBot; z -= 4) rows.push({ y: yAt(z), cx: centerAt(g, z) });
  /** Fläche bis zum seitlichen Abstand w (beidseitig), glatt entlang der Mittellinie */
  const band = (w: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (const r of rows) ctx.lineTo(r.cx - w, r.y);
    for (let i = rows.length - 1; i >= 0; i--) ctx.lineTo(rows[i]!.cx + w, rows[i]!.y);
    ctx.closePath();
    ctx.fill();
  };
  /** Linie im seitlichen Abstand off zwischen z0 und z1 */
  const along = (z0: number, z1: number, off: (z: number) => number) => {
    ctx.beginPath();
    for (let z = z0; ; z = Math.min(z1, z + 4)) {
      ctx.lineTo(centerAt(g, z) + off(z), yAt(z));
      if (z >= z1) break;
    }
  };
  /** Feld zwischen den Abständen a und b von z0 bis z1 (für Randsteine) */
  const patch = (z0: number, z1: number, a: number, b: number) => {
    ctx.beginPath();
    for (let z = z0; ; z = Math.min(z1, z + 4)) { ctx.lineTo(centerAt(g, z) + a, yAt(z)); if (z >= z1) break; }
    for (let z = z1; ; z = Math.max(z0, z - 4)) { ctx.lineTo(centerAt(g, z) + b, yAt(z)); if (z <= z0) break; }
    ctx.closePath();
    ctx.fill();
  };

  // Wiese mit Mähstreifen und Körnung
  ctx.fillStyle = '#3d8b3a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  for (let k = Math.floor(zBot / 48); k * 48 < zTop; k++) if (k % 2 === 0) ctx.fillRect(0, yAt((k + 1) * 48), W, 48);
  ctx.fillStyle = 'rgba(20, 60, 20, 0.35)';
  for (let k = Math.floor(zBot / 20); k * 20 < zTop; k++) {
    for (let i = 0; i < 7; i++) ctx.fillRect(hash(k, i) * W, yAt(k * 20 + hash(k, i + 7) * 20), 2, 1.5);
  }

  // Deko neben der Strecke: Bäume und Streckenposten
  const outer = half + KERB + GRAVEL;
  for (let k = Math.floor(zBot / 110) - 1; k * 110 < zTop + 60; k++) {
    for (const j of [0, 1]) {
      const kind = hash(k, j * 10 + 2);
      if (kind > 0.85) continue;
      const side = j ? 1 : -1;
      const z = k * 110 + hash(k, j * 10 + 4) * 70;
      const x = centerAt(g, z) + side * (outer + 26 + hash(k, j * 10 + 3) * 70);
      const y = yAt(z);
      if (x < -40 || x > W + 40) continue;
      if (kind < 0.76) topTree(ctx, x, y, 13 + hash(k, j * 10 + 5) * 10, k * 2 + j);
      else {
        // Streckenposten mit Flagge
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctx.fillRect(x - 5, y - 3, 13, 12);
        ctx.fillStyle = '#f4a261'; ctx.fillRect(x - 7, y - 6, 12, 10);
        ctx.fillStyle = '#ffd60a'; ctx.fillRect(x + 5, y - 12, 7, 5);
        ctx.fillStyle = '#5a3d22'; ctx.fillRect(x + 4, y - 12, 1.2, 10);
      }
    }
  }

  // Kiesbett mit Körnung
  band(outer, '#d6c49c');
  for (let k = Math.floor(zBot / 10); k * 10 < zTop; k++) {
    const z = k * 10;
    const cx = centerAt(g, z);
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1;
      ctx.fillStyle = i < 2 ? 'rgba(120, 100, 70, 0.45)' : 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(cx + side * (half + KERB + 2 + hash(k, i) * (GRAVEL - 4)), yAt(z + hash(k, i + 5) * 10), 1.6, 1.6);
    }
  }
  // Reifenstapel als Begrenzung
  for (const side of [-1, 1]) {
    ctx.strokeStyle = '#1c1c1c';
    ctx.lineWidth = 7;
    along(zBot, zTop, () => side * (outer + 4));
    ctx.stroke();
  }
  for (let k = Math.floor(zBot / 8); k * 8 < zTop; k++) {
    const z = k * 8;
    const cx = centerAt(g, z);
    ctx.fillStyle = k % 4 === 0 ? '#e63946' : k % 4 === 2 ? '#f1f1f1' : '#2b2b2b';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + side * (outer + 4), yAt(z), 2.6, 0, Math.PI * 2); ctx.fill(); }
  }

  // Randsteine: weisser Grund, rote Felder als saubere Vierecke entlang der Kurve
  band(half + KERB, '#f4f4f4');
  ctx.fillStyle = '#e63946';
  for (let k = Math.floor(zBot / 22); k * 22 < zTop; k++) {
    if (k % 2 === 0) continue;
    for (const side of [-1, 1]) patch(k * 22, k * 22 + 22, side * half, side * (half + KERB));
  }
  // Asphalt mit Körnung und Gummispur
  band(half, '#3b3f46');
  for (let k = Math.floor(zBot / 12); k * 12 < zTop; k++) {
    const z = k * 12;
    const cx = centerAt(g, z);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.18)';
      ctx.fillRect(cx + (hash(k, i) - 0.5) * 2 * half * 0.95, yAt(z + hash(k, i + 5) * 12), 1.6, 1.6);
    }
  }
  ctx.strokeStyle = 'rgba(12, 12, 16, 0.16)';
  ctx.lineWidth = 18;
  ctx.lineJoin = 'round';
  along(zBot, zTop, (z) => Math.sin(z / 260) * half * 0.45);
  ctx.stroke();
  // weisse Randlinien und gestrichelte Mittellinie
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) { along(zBot, zTop, () => side * (half - 4)); ctx.stroke(); }
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  for (let k = Math.floor(zBot / 44); k * 44 < zTop; k++) { along(k * 44, k * 44 + 20, () => 0); ctx.stroke(); }

  // Start und Ziel: Schachbrett, Startplätze, Tribüne und Lichterbrücke
  for (let k = Math.max(0, Math.floor(zBot / LAP)); k * LAP < zTop + 200; k++) {
    const z = k * LAP;
    const cx = centerAt(g, z);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = (i + row) % 2 ? '#111111' : '#ffffff';
        ctx.fillRect(cx - half + (i * half * 2) / 12, yAt(z + (row + 1) * 6), (half * 2) / 12 + 0.5, 6.5);
      }
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    for (let i = 1; i <= 4; i++) {
      const zz = z - i * 46;
      const side = i % 2 ? -1 : 1;
      const bx = centerAt(g, zz) + side * half * 0.45;
      const by = yAt(zz);
      ctx.beginPath(); ctx.moveTo(bx - 10, by - 8); ctx.lineTo(bx - 10, by); ctx.lineTo(bx + 10, by); ctx.lineTo(bx + 10, by - 8); ctx.stroke();
    }
    // Tribüne rechts mit Publikum
    const tx = cx + outer + 16;
    const ty = yAt(z + 110);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctx.fillRect(tx + 4, ty + 4, 40, 200);
    ctx.fillStyle = '#8d96a3'; ctx.fillRect(tx, ty, 40, 200);
    for (let r = 0; r < 4; r++) {
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = ['#e63946', '#ffd60a', '#ffffff', '#1e88e5', '#2ec4b6', '#f4a261'][Math.floor(hash(k * 50 + r, i) * 6)]!;
        ctx.fillRect(tx + 4 + r * 9, ty + 4 + i * 8 + hash(r, i) * 2, 4, 4);
      }
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'; ctx.fillRect(tx + 37, ty, 3, 200);
    // Lichterbrücke über die Strecke
    const gy = yAt(z + 30);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctx.fillRect(cx - outer + 6, gy + 6, outer * 2, 9);
    ctx.fillStyle = '#22262e'; ctx.fillRect(cx - outer, gy, outer * 2, 9);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = g.time < 2.5 && i < Math.floor(g.time * 2) ? '#ff2d2d' : g.time >= 2.5 && k === 0 ? '#2ee66b' : '#4a4f59';
      ctx.beginPath(); ctx.arc(cx - 24 + i * 12, gy + 4.5, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Ölflecken und Boost-Felder
  for (const p of g.pads) {
    if (p.used && p.kind === 'boost') continue;
    const y = yAt(p.z);
    const x = centerAt(g, p.z) + p.lane * half;
    if (p.kind === 'oil') {
      ctx.fillStyle = 'rgba(10, 10, 20, 0.85)';
      ctx.beginPath(); ctx.ellipse(x, y, 16, 10, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 12, y + 6, 6, 4, 0.3, 0, Math.PI * 2); ctx.fill();
      const sheen = ctx.createLinearGradient(x - 10, y - 4, x + 8, y + 4);
      sheen.addColorStop(0, 'rgba(120, 90, 200, 0.4)'); sheen.addColorStop(0.5, 'rgba(60, 200, 180, 0.3)'); sheen.addColorStop(1, 'rgba(220, 180, 60, 0.3)');
      ctx.fillStyle = sheen;
      ctx.beginPath(); ctx.ellipse(x - 3, y - 2, 8, 3.5, 0.3, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(76, 201, 240, 0.18)';
      ctx.beginPath(); ctx.roundRect(x - 15, y - 14, 30, 30, 5); ctx.fill();
      ctx.fillStyle = '#4cc9f0';
      for (const oy of [6, -4]) {
        ctx.beginPath(); ctx.moveTo(x - 12, y + oy + 6); ctx.lineTo(x, y + oy - 6); ctx.lineTo(x + 12, y + oy + 6); ctx.lineTo(x + 7, y + oy + 6); ctx.lineTo(x, y + oy - 1); ctx.lineTo(x - 7, y + oy + 6); ctx.fill();
      }
    }
  }
  for (const r of g.rivals) {
    const y = yAt(r.z);
    if (y < -40 || y > H + 40) continue;
    const ang = Math.atan2(centerAt(g, r.z + 20) - centerAt(g, r.z), 20);
    drawCar(ctx, centerAt(g, r.z) + r.lane * half, y, r.color, r.color === '#e5e5e5' ? '#1b1b1b' : '#ffffff', ang);
  }
  drawSparks(ctx, g.sparks);
  const c = g.car;
  if (!(c.inv > 0 && c.spin <= 0 && Math.floor(c.inv * 10) % 2 === 0)) {
    // Fahrtrichtung aus Quer- und Längstempo, beim Dreher rotiert das Auto
    const angle = c.spin > 0 ? c.spin * 9 : Math.max(-0.4, Math.min(0.4, Math.atan2(c.vx, Math.max(80, c.v))));
    if (c.boost > 0) {
      ctx.fillStyle = 'rgba(76, 201, 240, 0.7)';
      ctx.beginPath(); ctx.moveTo(c.x - 6, CAR_Y + 20); ctx.lineTo(c.x, CAR_Y + 44 + Math.sin(g.time * 40) * 5); ctx.lineTo(c.x + 6, CAR_Y + 20); ctx.fill();
    }
    drawCar(ctx, c.x, CAR_Y, '#e10600', '#ffffff', angle);
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
