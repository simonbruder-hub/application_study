/**
 * Kürbismann (Stil Halloween), angelehnt an Slenderman: nachts durch den Wald gehen (von selbst), die Taschenlampe
 * folgt Maus, Finger oder Pfeiltasten. Taucht der lange Mann mit dem Kürbiskopf zwischen den Bäumen auf, muss man
 * ihn rechtzeitig antippen; je schneller, desto mehr Punkte. Zu langsam: Bildrauschen, ein Leben weg.
 * Bonbons am Wegrand geben Extrapunkte. Darstellung mit Perspektive: Tiefe d in Metern vor der Kamera.
 */
import { burst, drawBanner, drawFloats, drawSparks, type Engine, type Float, type Input, moveFloats, moveSparks, type Pt, type Spark } from './types';

const W = 360;
const H = 560;
const HOR = 236;
const F = 210;
const CAM = 1.7;

const sx = (X: number, d: number) => W / 2 + (X * F) / d;
const gy = (d: number) => HOR + (CAM * F) / d;

interface Tree { X: number; d: number; w: number; seed: number }
interface Candy { X: number; d: number; color: string; taken: boolean }
type MonsterState = 'hidden' | 'appear' | 'banished' | 'lunge';
interface Monster { X: number; d: number; state: MonsterState; t: number; window: number; cool: number }

export interface Pumpkin {
  trees: Tree[];
  candies: Candy[];
  monster: Monster;
  aim: Pt;
  sparks: Spark[];
  floats: Float[];
  banner: { text: string; t: number } | null;
  flash: number;
  walked: number;
  score: number;
  banished: number;
  lastReaction: number | null;
  bestReaction: number | null;
  lives: number;
  time: number;
  over: boolean;
  rng: () => number;
}

const CANDY = ['#ff7518', '#7cfc00', '#b14cff', '#ffd166', '#ff4d6d'];

function newTree(rng: () => number, d: number): Tree {
  let X = (rng() - 0.5) * 10;
  if (Math.abs(X) < 1) X = Math.sign(X || 1) * (1 + rng() * 1.5);
  return { X, d, w: 0.22 + rng() * 0.3, seed: Math.floor(rng() * 1000) };
}

export function createPumpkin(rng: () => number = Math.random): Pumpkin {
  return {
    trees: Array.from({ length: 22 }, (_, i) => newTree(rng, 1.2 + (i / 22) * 13)),
    candies: [],
    monster: { X: 0, d: 6, state: 'hidden', t: 0, window: 2.2, cool: 4 },
    aim: { x: W / 2, y: H * 0.48 },
    sparks: [], floats: [], banner: null, flash: 0,
    walked: 0, score: 0, banished: 0, lastReaction: null, bestReaction: null, lives: 3, time: 0, over: false, rng,
  };
}

/** Trefferfläche des Kürbismanns auf dem Bildschirm */
export function monsterBox(m: Monster): { x: number; top: number; bottom: number; half: number } {
  const sc = F / m.d;
  return { x: sx(m.X, m.d), top: gy(m.d) - 3.5 * sc, bottom: gy(m.d), half: Math.max(14, 0.55 * sc) };
}

function act(g: Pumpkin, p: Pt, events: string[]): void {
  g.aim = { ...p };
  const m = g.monster;
  if (m.state === 'appear') {
    const b = monsterBox(m);
    if (Math.abs(p.x - b.x) < b.half + 8 && p.y > b.top - 10 && p.y < b.bottom + 6) {
      const reaction = m.t;
      const bonus = Math.max(0, Math.round((m.window - reaction) * 120));
      const pts = 100 + bonus;
      g.score += pts;
      g.banished += 1;
      g.lastReaction = reaction;
      g.bestReaction = g.bestReaction === null ? reaction : Math.min(g.bestReaction, reaction);
      m.state = 'banished';
      m.t = 0;
      const head = b.top + (b.bottom - b.top) * 0.1;
      burst(g.sparks, g.rng, b.x, head, '#ff7518', 30, 200);
      burst(g.sparks, g.rng, b.x, head, '#ffd166', 18, 140);
      g.floats.push({ x: b.x, y: head - 20, text: `+${pts} · ${reaction.toFixed(2)} s`, color: '#ffd166', life: 1.4 });
      events.push('banish');
      return;
    }
  }
  for (const c of g.candies) {
    if (c.taken) continue;
    const r = Math.max(10, (0.28 * F) / c.d);
    if (Math.hypot(p.x - sx(c.X, c.d), p.y - (gy(c.d) - r * 0.6)) < r + 8) {
      c.taken = true;
      g.score += 15;
      burst(g.sparks, g.rng, p.x, p.y, c.color, 10, 90);
      g.floats.push({ x: p.x, y: p.y - 14, text: '+15', color: c.color, life: 0.9 });
      events.push('candy');
      return;
    }
  }
}

export function stepPumpkin(g: Pumpkin, dt: number, input: Input): string[] {
  const events: string[] = [];
  dt = Math.min(dt, 0.05);
  g.sparks = moveSparks(g.sparks, dt);
  g.floats = moveFloats(g.floats, dt);
  g.flash = Math.max(0, g.flash - dt);
  if (g.banner) { g.banner.t -= dt; if (g.banner.t <= 0) g.banner = null; }
  if (g.over) return events;
  g.time += dt;

  // Gehen: alles rückt näher, Bäume hinter der Kamera kommen hinten wieder
  const speed = 1.25 + Math.min(1, g.banished * 0.05);
  const step = speed * dt;
  g.walked += step;
  for (const t of g.trees) { t.d -= step; if (t.d < 0.6) Object.assign(t, newTree(g.rng, 12 + g.rng() * 3)); }
  for (const c of g.candies) c.d -= step;
  g.candies = g.candies.filter((c) => c.d > 0.8 && !c.taken);
  if (g.rng() < dt * 0.35) g.candies.push({ X: (g.rng() - 0.5) * 3, d: 9 + g.rng() * 3, color: CANDY[Math.floor(g.rng() * CANDY.length)]!, taken: false });
  g.score = Math.max(g.score, 0);

  // Taschenlampe
  if (input.target) g.aim = { ...input.target };
  g.aim.x = Math.min(W, Math.max(0, g.aim.x + input.dx * 320 * dt));
  g.aim.y = Math.min(H, Math.max(0, g.aim.y + input.dy * 320 * dt));
  for (const t of input.taps) act(g, t, events);
  if (input.press) act(g, g.aim, events);

  // Der Kürbismann: taucht auf, wartet, wird gebannt oder springt einen an
  const m = g.monster;
  m.t += dt;
  m.d -= step;
  if (m.state === 'hidden') {
    m.cool -= dt;
    if (m.cool <= 0) {
      // neben einem Baum in mittlerer Entfernung, halb verdeckt
      const near = g.trees.filter((t) => t.d > 4.5 && t.d < 8.5);
      const tree = near[Math.floor(g.rng() * near.length)];
      m.X = tree ? tree.X + (g.rng() < 0.5 ? -1 : 1) * (tree.w + 0.35) : (g.rng() - 0.5) * 4;
      m.d = tree ? tree.d + 0.3 : 6 + g.rng() * 2;
      m.state = 'appear';
      m.t = 0;
      m.window = Math.max(0.85, 2.2 - g.banished * 0.09);
      events.push('appear');
    }
  } else if (m.state === 'appear') {
    if (m.t > m.window || m.d < 1.6) {
      m.state = 'lunge';
      m.t = 0;
      g.flash = 0.9;
      g.lives -= 1;
      g.floats.push({ x: W / 2, y: H * 0.3, text: 'Zu langsam!', color: '#ff4d6d', life: 1.2 });
      events.push('lunge');
      if (g.lives <= 0) { g.over = true; events.push('over'); }
    }
  } else if (m.state === 'banished' && m.t > 0.7) { m.state = 'hidden'; m.cool = 2.5 + g.rng() * 3.5; }
  else if (m.state === 'lunge' && m.t > 0.7) { m.state = 'hidden'; m.cool = 3 + g.rng() * 3; }
  return events;
}

/* ---------- Zeichnen ---------- */

const cache: { k: number; bg: HTMLCanvasElement | null } = { k: 0, bg: null };

function backdrop(ctx: CanvasRenderingContext2D): void {
  const sky = ctx.createLinearGradient(0, 0, 0, HOR + 20);
  sky.addColorStop(0, '#07040d'); sky.addColorStop(0.7, '#1d1130'); sky.addColorStop(1, '#3a2347');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, HOR + 20);
  const halo = ctx.createRadialGradient(270, 70, 8, 270, 70, 110);
  halo.addColorStop(0, 'rgba(255, 230, 180, 0.45)'); halo.addColorStop(1, 'rgba(255, 230, 180, 0)');
  ctx.fillStyle = halo; ctx.fillRect(140, 0, 220, 200);
  ctx.fillStyle = '#f6e7c1'; ctx.beginPath(); ctx.arc(270, 70, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(160, 140, 110, 0.35)';
  for (const [x, y, r] of [[262, 62, 6], [280, 78, 5], [272, 84, 3]] as const) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  // ferne Baumreihe als Silhouette
  ctx.fillStyle = '#140b1d';
  ctx.beginPath(); ctx.moveTo(0, HOR + 10);
  for (let x = 0; x <= W; x += 6) ctx.lineTo(x, HOR - 18 - Math.abs(Math.sin(x * 0.11) * 22) - Math.abs(Math.sin(x * 0.037) * 30));
  ctx.lineTo(W, HOR + 10); ctx.fill();
  // Waldboden mit Weg zur Mitte
  const ground = ctx.createLinearGradient(0, HOR, 0, H);
  ground.addColorStop(0, '#1b1424'); ground.addColorStop(1, '#0a070d');
  ctx.fillStyle = ground; ctx.fillRect(0, HOR, W, H - HOR);
  const path = ctx.createLinearGradient(0, HOR, 0, H);
  path.addColorStop(0, 'rgba(90, 70, 70, 0.25)'); path.addColorStop(1, 'rgba(70, 55, 50, 0.55)');
  ctx.fillStyle = path;
  ctx.beginPath(); ctx.moveTo(W / 2 - 4, HOR); ctx.lineTo(W / 2 + 4, HOR); ctx.lineTo(W / 2 + 120, H); ctx.lineTo(W / 2 - 120, H); ctx.fill();
  ctx.fillStyle = 'rgba(40, 30, 40, 0.6)';
  for (let i = 0; i < 160; i++) { const v = Math.sin(i * 77.7) * 9999; const x = (v - Math.floor(v)) * W; const y = HOR + ((Math.sin(i * 3.3) + 1) / 2) ** 2 * (H - HOR); ctx.fillRect(x, y, 1 + (y - HOR) / 120, 1); }
}

/** Farbe nach Entfernung: nah dunkel, fern im violetten Nebel */
const fogMix = (d: number) => Math.min(1, Math.max(0, (d - 1.5) / 11));

function drawTree(ctx: CanvasRenderingContext2D, t: Tree): void {
  const sc = F / t.d;
  const x = sx(t.X, t.d);
  const base = gy(t.d);
  const w = t.w * sc;
  if (x + w < -40 || x - w > W + 40) return;
  const f = fogMix(t.d);
  const dark = `rgb(${Math.round(38 + f * 40)}, ${Math.round(30 + f * 32)}, ${Math.round(40 + f * 50)})`;
  const light = `rgb(${Math.round(92 + f * 20)}, ${Math.round(80 + f * 20)}, ${Math.round(96 + f * 30)})`;
  const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
  g.addColorStop(0, light); g.addColorStop(0.6, dark); g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(x - w * 0.9, base); ctx.lineTo(x - w * 0.55, base - 14 * sc); ctx.lineTo(x + w * 0.55, base - 14 * sc); ctx.lineTo(x + w * 0.95, base); ctx.fill();
  // Wurzeln und Rinde
  ctx.beginPath(); ctx.moveTo(x - w * 1.5, base); ctx.quadraticCurveTo(x - w * 0.8, base - 0.2 * sc, x - w * 0.8, base - 0.6 * sc); ctx.lineTo(x + w * 0.8, base - 0.6 * sc); ctx.quadraticCurveTo(x + w * 0.8, base - 0.2 * sc, x + w * 1.5, base); ctx.fill();
  if (sc > 30) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = Math.max(1, sc / 90);
    for (let i = 0; i < 4; i++) {
      const bx = x - w * 0.5 + (i / 3) * w;
      ctx.beginPath(); ctx.moveTo(bx, base); ctx.lineTo(bx + Math.sin(t.seed + i) * 3, base - 6 * sc); ctx.stroke();
    }
  }
  // kahle Äste
  ctx.strokeStyle = dark;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const s = Math.sin(t.seed * 3.1 + i * 7.7);
    const y0 = base - (2.6 + i * 1.5 + Math.abs(s)) * sc;
    const dir = i % 2 ? 1 : -1;
    const len = (0.9 + Math.abs(s) * 0.9) * sc;
    ctx.lineWidth = Math.max(1, w * 0.35);
    ctx.beginPath(); ctx.moveTo(x + dir * w * 0.4, y0); ctx.lineTo(x + dir * (w * 0.4 + len), y0 - len * 0.5); ctx.stroke();
    ctx.lineWidth = Math.max(0.6, w * 0.15);
    ctx.beginPath(); ctx.moveTo(x + dir * (w * 0.4 + len * 0.6), y0 - len * 0.3); ctx.lineTo(x + dir * (w * 0.4 + len * 0.8), y0 - len * 0.85); ctx.stroke();
  }
}

function drawCandy(ctx: CanvasRenderingContext2D, c: Candy): void {
  const r = Math.max(5, (0.22 * F) / c.d);
  const x = sx(c.X, c.d);
  const y = gy(c.d) - r * 0.6;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = c.color;
  ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(-r * 1.7, -r * 0.6); ctx.lineTo(-r * 1.7, r * 0.6); ctx.fill();
  ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(r * 1.7, -r * 0.6); ctx.lineTo(r * 1.7, r * 0.6); ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.2, r * 0.3, r * 0.15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Der lange Mann: schwarzer Anzug, endlose Arme, Kürbiskopf mit geschnitztem Gesicht */
function drawMonster(ctx: CanvasRenderingContext2D, m: Monster, time: number, glowOnly: boolean): void {
  if (m.state === 'hidden') return;
  const sc = F / m.d;
  const x = sx(m.X, m.d);
  const base = gy(m.d);
  let alpha = m.state === 'appear' ? Math.min(1, m.t / 0.35) : m.state === 'banished' ? Math.max(0, 1 - m.t / 0.5) : 1;
  let scale = 1;
  if (m.state === 'lunge') { scale = 1 + m.t * 3; alpha = Math.max(0, 1 - m.t / 0.7); }
  const sway = Math.sin(time * 1.3) * 0.04;
  ctx.save();
  ctx.translate(x, base);
  ctx.scale(scale, scale);
  ctx.rotate(sway);
  ctx.globalAlpha = alpha;
  const u = sc;
  const headY = -3.25 * u;
  const headR = 0.42 * u;
  if (!glowOnly) {
    // Beine
    ctx.fillStyle = '#0b0910';
    ctx.fillRect(-0.2 * u, -1.6 * u, 0.13 * u, 1.6 * u);
    ctx.fillRect(0.07 * u, -1.6 * u, 0.13 * u, 1.6 * u);
    // Anzug mit Revers, Hemd und Krawatte
    const suit = ctx.createLinearGradient(-0.4 * u, 0, 0.4 * u, 0);
    suit.addColorStop(0, '#2a2533'); suit.addColorStop(0.5, '#141119'); suit.addColorStop(1, '#0b0910');
    ctx.fillStyle = suit;
    ctx.beginPath(); ctx.moveTo(-0.34 * u, -1.5 * u); ctx.lineTo(-0.38 * u, -2.75 * u); ctx.quadraticCurveTo(0, -2.95 * u, 0.38 * u, -2.75 * u); ctx.lineTo(0.34 * u, -1.5 * u); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d9d4cc';
    ctx.beginPath(); ctx.moveTo(-0.1 * u, -2.85 * u); ctx.lineTo(0.1 * u, -2.85 * u); ctx.lineTo(0, -2.35 * u); ctx.fill();
    ctx.fillStyle = '#c2410c';
    ctx.beginPath(); ctx.moveTo(-0.035 * u, -2.8 * u); ctx.lineTo(0.035 * u, -2.8 * u); ctx.lineTo(0.05 * u, -2.3 * u); ctx.lineTo(0, -2.2 * u); ctx.lineTo(-0.05 * u, -2.3 * u); ctx.fill();
    // lange Arme bis unter die Knie, dürre Finger
    ctx.strokeStyle = '#141119';
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      const swing = Math.sin(time * 1.1 + s) * 0.08 * u;
      ctx.lineWidth = 0.11 * u;
      ctx.beginPath(); ctx.moveTo(s * 0.36 * u, -2.7 * u); ctx.quadraticCurveTo(s * 0.62 * u, -1.8 * u, s * 0.58 * u + swing, -0.9 * u); ctx.stroke();
      ctx.lineWidth = 0.025 * u;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(s * 0.58 * u + swing, -0.9 * u); ctx.lineTo(s * (0.52 + k * 0.05) * u + swing, -0.55 * u + k * 0.02 * u); ctx.stroke(); }
    }
    // Hals
    ctx.fillStyle = '#d9d4cc'; ctx.fillRect(-0.06 * u, -2.98 * u, 0.12 * u, 0.15 * u);
    // Kürbiskopf mit Rippen und Stiel
    const pk = ctx.createRadialGradient(-headR * 0.3, headY - headR * 0.4, headR * 0.1, 0, headY, headR * 1.2);
    pk.addColorStop(0, '#ff9a3c'); pk.addColorStop(0.7, '#d9600f'); pk.addColorStop(1, '#8a3a06');
    ctx.fillStyle = pk;
    ctx.beginPath(); ctx.ellipse(0, headY, headR * 1.15, headR, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(110, 40, 0, 0.6)'; ctx.lineWidth = Math.max(0.6, headR * 0.06);
    for (const rx of [0.4, 0.8]) { ctx.beginPath(); ctx.ellipse(0, headY, headR * 1.15 * rx, headR, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = '#3f5a1a'; ctx.beginPath(); ctx.moveTo(-headR * 0.08, headY - headR * 0.95); ctx.quadraticCurveTo(0, headY - headR * 1.45, headR * 0.25, headY - headR * 1.35); ctx.lineTo(headR * 0.1, headY - headR * 0.92); ctx.fill();
  }
  // geschnitztes Gesicht leuchtet (auch im Dunkeln)
  const flick = 0.75 + Math.sin(time * 23) * 0.12 + Math.sin(time * 7) * 0.1;
  ctx.shadowColor = '#ffb347';
  ctx.shadowBlur = headR * 1.4;
  ctx.fillStyle = `rgba(255, ${Math.round(190 + flick * 40)}, 90, ${flick})`;
  ctx.beginPath();
  ctx.moveTo(-headR * 0.7, headY - headR * 0.15); ctx.lineTo(-headR * 0.42, headY - headR * 0.55); ctx.lineTo(-headR * 0.18, headY - headR * 0.1); ctx.closePath();
  ctx.moveTo(headR * 0.7, headY - headR * 0.15); ctx.lineTo(headR * 0.42, headY - headR * 0.55); ctx.lineTo(headR * 0.18, headY - headR * 0.1); ctx.closePath();
  ctx.moveTo(-headR * 0.75, headY + headR * 0.2);
  const teeth = 6;
  for (let i = 0; i <= teeth; i++) { const tx = -headR * 0.75 + (i / teeth) * headR * 1.5; ctx.lineTo(tx, headY + headR * (i % 2 ? 0.32 : 0.48)); }
  ctx.quadraticCurveTo(0, headY + headR * 0.95, -headR * 0.75, headY + headR * 0.2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawPumpkin(ctx: CanvasRenderingContext2D, g: Pumpkin): void {
  const k = ctx.getTransform().a || 1;
  if (cache.k !== k || !cache.bg) {
    const el = document.createElement('canvas');
    el.width = Math.round(W * k); el.height = Math.round(H * k);
    const c = el.getContext('2d')!; c.scale(k, k); backdrop(c);
    cache.k = k; cache.bg = el;
  }
  ctx.drawImage(cache.bg, 0, 0, W, H);
  // nach Tiefe: weit weg zuerst
  type Item = { d: number; draw: () => void };
  const items: Item[] = g.trees.map((t) => ({ d: t.d, draw: () => drawTree(ctx, t) }));
  for (const c of g.candies) items.push({ d: c.d, draw: () => drawCandy(ctx, c) });
  if (g.monster.state !== 'hidden') items.push({ d: g.monster.d, draw: () => drawMonster(ctx, g.monster, g.time, false) });
  items.sort((a, b) => b.d - a.d);
  for (const it of items) it.draw();
  // Bodennebel
  const fog = ctx.createLinearGradient(0, HOR - 30, 0, HOR + 120);
  fog.addColorStop(0, 'rgba(120, 100, 150, 0)'); fog.addColorStop(0.4, 'rgba(120, 100, 150, 0.28)'); fog.addColorStop(1, 'rgba(120, 100, 150, 0)');
  ctx.fillStyle = fog; ctx.fillRect(0, HOR - 30, W, 150);
  // Dunkelheit mit Lichtkegel der Taschenlampe
  const { x, y } = g.aim;
  const dark = ctx.createRadialGradient(x, y, 30, x, y, 210);
  dark.addColorStop(0, 'rgba(0, 0, 0, 0)'); dark.addColorStop(0.5, 'rgba(4, 2, 8, 0.4)'); dark.addColorStop(1, 'rgba(4, 2, 8, 0.74)');
  ctx.fillStyle = dark; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const beam = ctx.createRadialGradient(x, y, 0, x, y, 90);
  beam.addColorStop(0, 'rgba(255, 240, 200, 0.12)'); beam.addColorStop(1, 'rgba(255, 240, 200, 0)');
  ctx.fillStyle = beam; ctx.fillRect(x - 90, y - 90, 180, 180);
  ctx.restore();
  // das Gesicht leuchtet auch ausserhalb des Lichtkegels
  if (g.monster.state !== 'hidden') drawMonster(ctx, g.monster, g.time, true);
  drawSparks(ctx, g.sparks);
  // Rauschen, solange er da ist, und beim Ansprung
  const m = g.monster;
  const noise = m.state === 'appear' ? Math.min(0.5, m.t / m.window * 0.5) : g.flash;
  if (noise > 0.02) {
    ctx.save();
    // Bildstörung wie bei einer alten Kamera: helle Zeilen und verrutschte Streifen
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = `rgba(${180 + ((i * 37) % 70)}, ${180 + ((i * 17) % 70)}, ${190 + ((i * 7) % 60)}, ${noise * 0.45})`;
      ctx.fillRect(g.rng() * W - 20, g.rng() * H, 10 + g.rng() * 60, 1);
    }
    const band = g.rng() * H;
    ctx.fillStyle = `rgba(255, 255, 255, ${noise * 0.12})`;
    ctx.fillRect(0, band, W, 4 + g.rng() * 10);
    if (g.flash > 0.5) { ctx.fillStyle = `rgba(255, 60, 30, ${(g.flash - 0.5) * 0.5})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }
  // Reaktionsbalken, solange er wartet
  if (m.state === 'appear') {
    const left = Math.max(0, 1 - m.t / m.window);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; ctx.fillRect(40, 16, W - 80, 6);
    ctx.fillStyle = left > 0.4 ? '#ff7518' : '#ff4d6d'; ctx.fillRect(40, 16, (W - 80) * left, 6);
  }
  // Zielkreuz der Lampe
  ctx.strokeStyle = 'rgba(255, 240, 200, 0.6)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
  drawFloats(ctx, g.floats, '700 14px Fredoka, system-ui, sans-serif');
  if (g.banner) drawBanner(ctx, W, H * 0.35, g.banner.text, '#ff7518', Math.min(1, g.banner.t * 2), '400 22px Creepster, Fredoka, system-ui, sans-serif');
}

export const pumpkin: Engine<Pumpkin> = {
  W, H,
  create: createPumpkin,
  step: stepPumpkin,
  draw: drawPumpkin,
  hud: (g) => [
    { label: 'Punkte', value: String(g.score) },
    { label: 'Gebannt', value: String(g.banished), tone: 'c' },
    { label: 'Reaktion', value: g.lastReaction === null ? '–' : `${g.lastReaction.toFixed(2)} s` },
    { label: 'Leben', value: '♥'.repeat(Math.max(0, g.lives)) || '–', tone: 'b' },
  ],
  score: (g) => g.score,
  over: (g) => g.over,
  tones: {
    appear: ['sawtooth', 70, 55, 0.9, 0.05],
    banish: ['square', 220, 1320, 0.3, 0.05],
    candy: ['sine', 990, 1480, 0.12, 0.04],
    lunge: ['sawtooth', 160, 40, 0.7, 0.1],
    over: ['triangle', 300, 60, 1.2, 0.08],
  },
};
