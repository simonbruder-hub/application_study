/**
 * Hummelflug (Stil Flora): Die Hummel fliegt über eine Wiese (sie zieht nach unten weg), sammelt Nektar aus
 * Blüten und sticht angreifende Wespen und Hornissen mit einem kurzen Vorstoss. Spinnennetze und Vögel meiden.
 */
import { burst, drawBanner, drawFloats, drawSparks, type Engine, type Float, hitTest, type Input, moveFloats, moveSparks, type Spark } from './types';

const W = 360;
const H = 560;

interface Flower { x: number; y: number; r: number; color: string; nectar: boolean; petals: number; spin: number }
interface Wasp { x: number; y: number; hp: number; big: boolean; t: number; vx: number; vy: number }
interface Web { x: number; y: number; r: number }
interface Bird { x: number; y: number; vx: number; warn: number }
interface Clover { x: number; y: number; s: number }

export interface Hummel {
  bee: { x: number; y: number; inv: number; sting: number; cool: number };
  flowers: Flower[];
  wasps: Wasp[];
  webs: Web[];
  birds: Bird[];
  clover: Clover[];
  sparks: Spark[];
  floats: Float[];
  banner: { text: string; t: number } | null;
  scroll: number;
  score: number;
  nectar: number;
  lives: number;
  level: number;
  time: number;
  next: { flower: number; wasp: number; web: number; bird: number };
  over: boolean;
  rng: () => number;
}

const COLORS = ['#e63946', '#ff8fab', '#c77dff', '#ffb703', '#ffffff', '#4cc9f0', '#ff6d00'];
const BEE_R = 11;
const STING_TIME = 0.32;

export function createHummel(rng: () => number = Math.random): Hummel {
  return {
    bee: { x: W / 2, y: H - 110, inv: 1.2, sting: 0, cool: 0 },
    flowers: Array.from({ length: 6 }, (_, i) => flower(rng, 40 + i * 80)),
    wasps: [], webs: [], birds: [],
    clover: Array.from({ length: 40 }, () => ({ x: rng() * W, y: rng() * H, s: 0.6 + rng() * 0.8 })),
    sparks: [], floats: [], banner: null,
    scroll: 0, score: 0, nectar: 0, lives: 3, level: 1, time: 0,
    next: { flower: 0.5, wasp: 2.5, web: 6, bird: 14 },
    over: false, rng,
  };
}

function flower(rng: () => number, y = -24): Flower {
  return { x: 24 + rng() * (W - 48), y, r: 10 + rng() * 5, color: COLORS[Math.floor(rng() * COLORS.length)]!, nectar: true, petals: 5 + Math.floor(rng() * 3), spin: rng() * Math.PI };
}

function hurt(g: Hummel, events: string[]): void {
  const b = g.bee;
  if (b.inv > 0 || g.over) return;
  g.lives -= 1;
  b.inv = 2;
  burst(g.sparks, g.rng, b.x, b.y, '#ffc300', 16);
  events.push('hit');
  if (g.lives <= 0) { g.over = true; events.push('over'); }
}

export function stepHummel(g: Hummel, dt: number, input: Input): string[] {
  const events: string[] = [];
  dt = Math.min(dt, 0.05);
  g.sparks = moveSparks(g.sparks, dt);
  g.floats = moveFloats(g.floats, dt);
  if (g.banner) { g.banner.t -= dt; if (g.banner.t <= 0) g.banner = null; }
  if (g.over) return events;
  g.time += dt;
  const speed = 70 + g.level * 9;
  g.scroll += speed * dt;
  const b = g.bee;

  // Fliegen: Tasten oder Finger; beim Stechen ein kurzer Vorstoss nach vorn
  if (input.target) {
    const dx = input.target.x - b.x;
    const dy = input.target.y - b.y;
    const d = Math.hypot(dx, dy);
    const max = 430 * dt;
    if (d > 0.5) { const k = Math.min(1, max / d); b.x += dx * k; b.y += dy * k; }
  } else {
    const len = Math.max(1, Math.hypot(input.dx, input.dy));
    b.x += (input.dx / len) * 230 * dt;
    b.y += (input.dy / len) * 230 * dt;
  }
  b.cool = Math.max(0, b.cool - dt);
  b.inv = Math.max(0, b.inv - dt);
  if (input.press && b.cool <= 0) { b.sting = STING_TIME; b.cool = 0.7; events.push('sting'); }
  if (b.sting > 0) { b.sting -= dt; b.y -= 260 * dt; }
  b.x = Math.min(W - 16, Math.max(16, b.x));
  b.y = Math.min(H - 24, Math.max(50, b.y));

  // Neues auf der Wiese
  const n = g.next;
  n.flower -= dt; n.wasp -= dt; n.web -= dt; n.bird -= dt;
  if (n.flower <= 0) { g.flowers.push(flower(g.rng)); n.flower = 0.45 + g.rng() * 0.4; }
  if (n.wasp <= 0) {
    const big = g.level >= 3 && g.rng() < 0.3;
    g.wasps.push({ x: 20 + g.rng() * (W - 40), y: -20, hp: big ? 2 : 1, big, t: 0, vx: 0, vy: 0 });
    n.wasp = Math.max(0.8, 2.6 - g.level * 0.22) * (0.7 + g.rng() * 0.6);
  }
  if (n.web <= 0 && g.level >= 2) { g.webs.push({ x: 30 + g.rng() * (W - 60), y: -30, r: 22 }); n.web = 5 + g.rng() * 4; }
  if (n.bird <= 0 && g.level >= 2) {
    const left = g.rng() < 0.5;
    g.birds.push({ x: left ? -40 : W + 40, y: 90 + g.rng() * (H - 260), vx: (left ? 1 : -1) * (190 + g.level * 12), warn: 1.1 });
    n.bird = 9 + g.rng() * 6;
  }

  // Bewegung: alles zieht mit der Wiese nach unten; Wespen jagen die Hummel
  for (const f of g.flowers) f.y += speed * dt;
  for (const w of g.webs) w.y += speed * dt;
  for (const c of g.clover) { c.y += speed * dt; if (c.y > H + 10) { c.y -= H + 20; c.x = g.rng() * W; } }
  for (const w of g.wasps) {
    w.t += dt;
    const sp = (w.big ? 62 : 78) + g.level * 6;
    const dx = b.x - w.x;
    const dy = b.y - w.y;
    const d = Math.hypot(dx, dy) || 1;
    w.vx += ((dx / d) * sp - w.vx) * Math.min(1, dt * 1.6);
    w.vy += ((dy / d) * sp + speed * 0.4 - w.vy) * Math.min(1, dt * 1.6);
    w.x += (w.vx + Math.sin(w.t * 7) * 40) * dt;
    w.y += w.vy * dt;
  }
  for (const bd of g.birds) {
    if (bd.warn > 0) { bd.warn -= dt; continue; }
    bd.x += bd.vx * dt;
    bd.y += Math.sin(g.time * 3 + bd.x * 0.02) * 30 * dt;
  }

  // Nektar sammeln
  for (const f of g.flowers) {
    if (!f.nectar || !hitTest(b.x, b.y, BEE_R, f.x, f.y, f.r * 0.7)) continue;
    f.nectar = false;
    g.score += 10;
    g.nectar += 1;
    burst(g.sparks, g.rng, f.x, f.y, '#ffd166', 8, 70);
    events.push('nectar');
    if (g.nectar % 10 === 0) {
      g.score += 50;
      g.floats.push({ x: b.x, y: b.y - 20, text: 'Honigtopf +50', color: '#ffd166', life: 1.4 });
      if (g.nectar % 20 === 0 && g.lives < 5) { g.lives += 1; g.floats.push({ x: b.x, y: b.y - 40, text: '+1 ♥', color: '#ff8fab', life: 1.4 }); }
      events.push('honey');
    }
  }
  // Wespen: mit dem Stachel besiegen, sonst stechen sie
  for (const w of g.wasps) {
    if (w.hp <= 0 || !hitTest(b.x, b.y - (b.sting > 0 ? 6 : 0), BEE_R + (b.sting > 0 ? 6 : 0), w.x, w.y, w.big ? 14 : 10)) continue;
    if (b.sting > 0) {
      w.hp -= 1;
      w.vy = -160;
      if (w.hp <= 0) {
        const pts = w.big ? 60 : 30;
        g.score += pts;
        g.floats.push({ x: w.x, y: w.y, text: `+${pts}`, color: '#ffffff', life: 0.9 });
        burst(g.sparks, g.rng, w.x, w.y, w.big ? '#ff8c00' : '#ffd60a', 18);
        events.push('kill');
      }
    } else {
      w.hp = 0;
      burst(g.sparks, g.rng, w.x, w.y, '#ffd60a', 10);
      hurt(g, events);
    }
  }
  for (const w of g.webs) if (hitTest(b.x, b.y, BEE_R, w.x, w.y, w.r * 0.8)) { w.y = H + 999; hurt(g, events); }
  for (const bd of g.birds) if (bd.warn <= 0 && hitTest(b.x, b.y, BEE_R, bd.x, bd.y, 18)) hurt(g, events);

  g.flowers = g.flowers.filter((f) => f.y < H + 30);
  g.webs = g.webs.filter((w) => w.y < H + 40);
  g.wasps = g.wasps.filter((w) => w.hp > 0 && w.y < H + 40 && w.y > -200);
  g.birds = g.birds.filter((bd) => bd.x > -80 && bd.x < W + 80);

  const level = 1 + Math.floor(g.score / 300);
  if (level > g.level) { g.level = level; g.banner = { text: `Stufe ${level}`, t: 1.6 }; events.push('level'); }
  return events;
}

/* ---------- Zeichnen ---------- */

function drawFlower(ctx: CanvasRenderingContext2D, f: Flower): void {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.spin);
  ctx.globalAlpha = f.nectar ? 1 : 0.45;
  ctx.fillStyle = f.color;
  for (let i = 0; i < f.petals; i++) {
    ctx.rotate((Math.PI * 2) / f.petals);
    ctx.beginPath(); ctx.ellipse(0, -f.r * 0.62, f.r * 0.36, f.r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = f.nectar ? '#ffd166' : '#8a5a2b';
  ctx.beginPath(); ctx.arc(0, 0, f.r * 0.34, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawWasp(ctx: CanvasRenderingContext2D, w: Wasp, time: number): void {
  const s = w.big ? 1.35 : 1;
  ctx.save();
  ctx.translate(w.x, w.y);
  ctx.scale(s, s);
  const flap = Math.sin(time * 60) * 0.5 + 0.5;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.beginPath(); ctx.ellipse(-6, -6, 6, 3 + flap * 2, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(6, -6, 6, 3 + flap * 2, 0.5, 0, Math.PI * 2); ctx.fill();
  const body = ctx.createLinearGradient(0, -8, 0, 12);
  for (let i = 0; i <= 5; i++) body.addColorStop(i / 5, i % 2 ? '#1b1b1b' : (w.big ? '#e07b00' : '#ffd60a'));
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(0, 2, 6, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath(); ctx.moveTo(-2, 11); ctx.lineTo(0, 16); ctx.lineTo(2, 11); ctx.fill();
  ctx.fillStyle = w.big ? '#7a3b00' : '#3a2a00';
  ctx.beginPath(); ctx.arc(0, -9, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff3b3b';
  ctx.fillRect(-3, -10, 2, 1.6); ctx.fillRect(1, -10, 2, 1.6);
  ctx.restore();
}

function drawWeb(ctx: CanvasRenderingContext2D, w: Web): void {
  ctx.save();
  ctx.translate(w.x, w.y);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 0.9;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * w.r, Math.sin(a) * w.r); ctx.stroke();
  }
  for (let k = 1; k <= 3; k++) {
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = (w.r * k) / 3.4;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();
  }
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBird(ctx: CanvasRenderingContext2D, bd: Bird, time: number): void {
  if (bd.warn > 0) {
    // Warnung am Rand
    const x = bd.vx > 0 ? 14 : W - 14;
    ctx.save();
    ctx.globalAlpha = Math.floor(bd.warn * 8) % 2 ? 1 : 0.35;
    ctx.fillStyle = '#ff3b3b';
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', x, bd.y + 8);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.beginPath(); ctx.ellipse(bd.x + 10, bd.y + 30, 18, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(bd.x, bd.y);
  ctx.scale(bd.vx > 0 ? 1 : -1, 1);
  const flap = Math.sin(time * 14);
  ctx.fillStyle = '#2b2d42';
  ctx.beginPath(); ctx.ellipse(0, 0, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(-14, -12 - flap * 10); ctx.lineTo(8, -3); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-26, -6); ctx.lineTo(-24, 6); ctx.fill();
  ctx.fillStyle = '#ffb703';
  ctx.beginPath(); ctx.moveTo(15, -2); ctx.lineTo(23, 0); ctx.lineTo(15, 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(10, -2, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBee(ctx: CanvasRenderingContext2D, g: Hummel): void {
  const b = g.bee;
  if (b.inv > 0 && Math.floor(b.inv * 12) % 2 === 0) return;
  ctx.save();
  ctx.translate(b.x, b.y);
  if (b.sting > 0) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    for (const ox of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(ox, 16); ctx.lineTo(ox, 34); ctx.stroke(); }
  }
  const flap = Math.sin(g.time * 70) * 0.5 + 0.5;
  ctx.fillStyle = 'rgba(230, 245, 255, 0.85)';
  ctx.strokeStyle = 'rgba(120, 140, 160, 0.6)';
  ctx.lineWidth = 0.8;
  for (const sx of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(sx * 10, -4, 9, 4 + flap * 3, sx * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // pelziger Körper mit Streifen
  ctx.fillStyle = '#ffc300';
  ctx.beginPath(); ctx.ellipse(0, 3, 10, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b2000';
  ctx.fillRect(-9.5, 3, 19, 3.6);
  ctx.fillRect(-8, 9.5, 16, 3.2);
  ctx.fillStyle = '#fff3d6';
  ctx.beginPath(); ctx.ellipse(0, 13, 6, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b2000';
  ctx.beginPath(); ctx.arc(0, -8, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(-2.4, -10, 1.6, 0, Math.PI * 2); ctx.arc(2.4, -10, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2b2000';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-2, -14); ctx.quadraticCurveTo(-5, -20, -8, -19); ctx.moveTo(2, -14); ctx.quadraticCurveTo(5, -20, 8, -19); ctx.stroke();
  if (b.sting > 0) {
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath(); ctx.moveTo(-3, -13); ctx.lineTo(0, -24); ctx.lineTo(3, -13); ctx.fill();
  }
  ctx.restore();
}

export function drawHummel(ctx: CanvasRenderingContext2D, g: Hummel): void {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#7cc576');
  bg.addColorStop(1, '#4f9d55');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // Mähstreifen ziehen mit
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  for (let i = -1; i < 8; i++) ctx.fillRect(0, ((i * 80 + g.scroll) % (H + 80)) - 40, W, 40);
  ctx.fillStyle = 'rgba(30, 90, 40, 0.35)';
  for (const c of g.clover) {
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(c.x + Math.cos(k * 2.1) * 3 * c.s, c.y + Math.sin(k * 2.1) * 3 * c.s, 2.6 * c.s, 0, Math.PI * 2); ctx.fill(); }
  }
  for (const w of g.webs) drawWeb(ctx, w);
  for (const f of g.flowers) drawFlower(ctx, f);
  drawSparks(ctx, g.sparks);
  for (const w of g.wasps) drawWasp(ctx, w, g.time);
  if (!g.over) drawBee(ctx, g);
  for (const bd of g.birds) drawBird(ctx, bd, g.time);
  drawFloats(ctx, g.floats, '700 13px Quicksand, system-ui, sans-serif');
  if (g.banner) drawBanner(ctx, W, H * 0.42, g.banner.text, '#fff3b0', Math.min(1, g.banner.t * 2), '800 20px Quicksand, system-ui, sans-serif');
}

export const hummel: Engine<Hummel> = {
  W, H,
  create: createHummel,
  step: stepHummel,
  draw: drawHummel,
  hud: (g) => [
    { label: 'Punkte', value: String(g.score) },
    { label: 'Nektar', value: String(g.nectar), tone: 'c' },
    { label: 'Leben', value: '♥'.repeat(Math.max(0, g.lives)) || '–', tone: 'b' },
  ],
  score: (g) => g.score,
  over: (g) => g.over,
  tones: {
    nectar: ['sine', 760, 1180, 0.09, 0.03],
    honey: ['sine', 520, 1560, 0.35, 0.06],
    sting: ['square', 320, 900, 0.08, 0.02],
    kill: ['sawtooth', 600, 120, 0.22, 0.05],
    hit: ['triangle', 260, 60, 0.4, 0.09],
    level: ['sine', 660, 1320, 0.4, 0.06],
    over: ['triangle', 330, 70, 0.9, 0.08],
  },
};
