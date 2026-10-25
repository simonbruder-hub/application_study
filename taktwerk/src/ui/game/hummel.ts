/**
 * Hummelflug (Stil Flora): Die Hummel fliegt über eine Wiese (sie zieht nach unten weg), sammelt Nektar und sticht
 * Wespen, Hornissen und Libellen mit einem kurzen Vorstoss. Spinnennetze und Vögel meiden.
 * Dazu Sonnenblumen (dreimal saugen), Goldblüten (Turbo), Tautropfen (Schild) und Gelée royale (Superstachel).
 * Eine Nektarkette ohne lange Pause verdoppelt und verdreifacht die Punkte. Ab 900 Punkten hängt ein Hornissennest.
 */
import { burst, drawBanner, drawFloats, drawSparks, type Engine, type Float, hitTest, type Input, moveFloats, moveSparks, type Spark } from './types';

const W = 360;
const H = 560;

type FlowerKind = 'blume' | 'sonne' | 'gold';
export interface Flower { x: number; y: number; r: number; color: string; nectar: number; petals: number; spin: number; kind: FlowerKind; sip: number }
/** jaeger: umkreist die Hummel und stösst zu; sturz: richtet sich oben aus und stürzt senkrecht; kreis: kreist, dann Angriff */
type WaspKind = 'jaeger' | 'sturz' | 'kreis';
export interface Wasp {
  x: number; y: number; vx: number; vy: number; hp: number; big: boolean; t: number;
  kind: WaspKind;
  /** eigene Phase, Tempo, Ausdauer und Drehsinn: so fliegt jede Wespe anders */
  phase: number; pace: number; life: number; turn: 1 | -1;
  state: 'an' | 'angriff' | 'weg';
  /** Ziel oder Kreismitte */
  cx: number; cy: number;
  rot: number;
}
interface Web { x: number; y: number; r: number }
interface Bird { x: number; y: number; vx: number; warn: number }
interface Clover { x: number; y: number; s: number }
/** Libelle: springt in schnellen Sätzen über die Wiese, zeigt vorher den nächsten Satz an */
interface Fly { x: number; y: number; tx: number; ty: number; wait: number; hops: number; dir: 1 | -1; t: number; rot: number }
interface Power { x: number; y: number; kind: 'tau' | 'gelee'; t: number }
interface Nest { x: number; y: number; hp: number; max: number; t: number; spawn: number; hit: number }

export interface Hummel {
  bee: { x: number; y: number; inv: number; sting: number; cool: number; shield: boolean; royal: number; turbo: number };
  flowers: Flower[];
  wasps: Wasp[];
  webs: Web[];
  birds: Bird[];
  flies: Fly[];
  powers: Power[];
  nest: Nest | null;
  clover: Clover[];
  sparks: Spark[];
  floats: Float[];
  banner: { text: string; t: number } | null;
  scroll: number;
  score: number;
  nectar: number;
  /** Blüten in Folge; verfällt nach CHAIN_T Sekunden ohne Nektar */
  chain: number;
  chainT: number;
  lives: number;
  level: number;
  time: number;
  nextBoss: number;
  next: { flower: number; wasp: number; web: number; bird: number; fly: number; power: number };
  over: boolean;
  rng: () => number;
}

const COLORS = ['#e63946', '#ff8fab', '#c77dff', '#ffb703', '#ffffff', '#4cc9f0', '#ff6d00'];
const BEE_R = 11;
const STING_TIME = 0.32;
const CHAIN_T = 2.6;
const NEST_Y = 80;

export const chainMult = (g: Hummel) => (g.chain >= 16 ? 3 : g.chain >= 8 ? 2 : 1);

export function createHummel(rng: () => number = Math.random): Hummel {
  return {
    bee: { x: W / 2, y: H - 110, inv: 1.2, sting: 0, cool: 0, shield: false, royal: 0, turbo: 0 },
    flowers: Array.from({ length: 6 }, (_, i) => flower(rng, 1, 40 + i * 80)),
    wasps: [], webs: [], birds: [], flies: [], powers: [], nest: null,
    clover: Array.from({ length: 40 }, () => ({ x: rng() * W, y: rng() * H, s: 0.6 + rng() * 0.8 })),
    sparks: [], floats: [], banner: null,
    scroll: 0, score: 0, nectar: 0, chain: 0, chainT: 0, lives: 3, level: 1, time: 0, nextBoss: 900,
    next: { flower: 0.5, wasp: 2.5, web: 6, bird: 14, fly: 16, power: 11 },
    over: false, rng,
  };
}

function flower(rng: () => number, level: number, y = -24): Flower {
  const roll = rng();
  const kind: FlowerKind = level >= 2 && roll < 0.05 ? 'gold' : roll < 0.17 ? 'sonne' : 'blume';
  const r = kind === 'sonne' ? 22 : kind === 'gold' ? 13 : 10 + rng() * 5;
  const m = r + 10;
  return {
    x: m + rng() * (W - m * 2), y: y - (kind === 'sonne' ? 10 : 0), r,
    color: kind === 'gold' ? '#ffd23f' : kind === 'sonne' ? '#ffc300' : COLORS[Math.floor(rng() * COLORS.length)]!,
    nectar: kind === 'sonne' ? 3 : 1, petals: kind === 'sonne' ? 16 : 5 + Math.floor(rng() * 3), spin: rng() * Math.PI, kind, sip: 0,
  };
}

export function makeWasp(rng: () => number, x: number, y: number, kind: WaspKind, big = false): Wasp {
  return {
    x, y, vx: 0, vy: 0, hp: big ? 2 : 1, big, t: 0, kind,
    phase: rng() * Math.PI * 2, pace: 0.8 + rng() * 0.45, life: 6 + rng() * 4, turn: rng() < 0.5 ? 1 : -1,
    state: 'an', cx: x, cy: kind === 'sturz' ? 60 + rng() * 70 : 110 + rng() * 140, rot: Math.PI,
  };
}

function hurt(g: Hummel, events: string[]): boolean {
  const b = g.bee;
  if (b.inv > 0 || b.royal > 0 || g.over) return false;
  if (b.shield) {
    b.shield = false;
    b.inv = 1;
    burst(g.sparks, g.rng, b.x, b.y, '#9be7ff', 18);
    events.push('shield');
    return true;
  }
  g.lives -= 1;
  g.chain = 0;
  b.inv = 2;
  burst(g.sparks, g.rng, b.x, b.y, '#ffc300', 16);
  events.push('hit');
  if (g.lives <= 0) { g.over = true; events.push('over'); }
  return true;
}

/** Wunschgeschwindigkeit Richtung Punkt, kurz davor langsamer */
function toward(x: number, y: number, tx: number, ty: number, sp: number): [number, number] {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, d / 30);
  return [(dx / d) * sp * k, (dy / d) * sp * k];
}

function stepWasp(g: Hummel, w: Wasp, dt: number, speed: number): void {
  const b = g.bee;
  w.t += dt;
  const sp = ((w.big ? 62 : 78) + g.level * 6) * w.pace;
  let want: [number, number] | null = null;
  if (w.state === 'weg') {
    want = [(w.x < W / 2 ? -1 : 1) * 190, -70];
  } else if (w.kind === 'jaeger') {
    if (w.t > w.life) w.state = 'weg';
    // kreist in wechselndem Abstand um die Hummel und stösst dabei immer wieder zu
    const ang = w.phase + w.t * 1.4 * w.turn;
    const rr = 62 * (0.5 + 0.5 * Math.cos(w.t * 1.15 + w.phase));
    want = toward(w.x, w.y, b.x + Math.cos(ang) * rr, b.y + Math.sin(ang) * rr, sp * 1.3);
  } else if (w.kind === 'sturz') {
    if (w.state === 'an') {
      want = toward(w.x, w.y, b.x, w.cy, sp * 1.7);
      if (w.t > 1.2 + w.phase * 0.08) { w.state = 'angriff'; w.vx = 0; w.vy = 320 + g.level * 12; }
    }
  } else if (w.state === 'an') {
    // Kreismitte sinkt mit der Wiese bis zur eigenen Höhe
    const cy = Math.min(w.cy, -30 + w.t * 90);
    const a = w.phase + w.t * 3 * w.turn;
    want = toward(w.x, w.y, w.cx + Math.cos(a) * 44, cy + Math.sin(a) * 44, sp * 2.4);
    if (w.t > 3.2 + w.phase * 0.15) {
      w.state = 'angriff';
      const dx = b.x - w.x;
      const dy = b.y - w.y;
      const d = Math.hypot(dx, dy) || 1;
      const v = 250 + g.level * 10;
      w.vx = (dx / d) * v;
      w.vy = (dy / d) * v;
    }
  }
  if (want) {
    const k = Math.min(1, dt * 3);
    w.vx += (want[0] - w.vx) * k;
    w.vy += (want[1] + (w.state === 'weg' ? 0 : speed * 0.25) - w.vy) * k;
  }
  w.x += w.vx * dt;
  w.y += w.vy * dt;
  // Kopf in Flugrichtung
  if (Math.hypot(w.vx, w.vy) > 20) {
    const d = Math.atan2(w.vx, -w.vy) - w.rot;
    w.rot += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, dt * 8);
  }
}

/** Wespen halten Abstand zueinander, statt sich an einem Ort zu stapeln */
function separate(wasps: Wasp[]): void {
  const MIN = 30;
  for (let i = 0; i < wasps.length; i++) {
    for (let j = i + 1; j < wasps.length; j++) {
      const a = wasps[i]!;
      const c = wasps[j]!;
      if (a.state === 'angriff' || c.state === 'angriff') continue;
      let dx = c.x - a.x;
      let dy = c.y - a.y;
      let d = Math.hypot(dx, dy);
      if (d >= MIN) continue;
      if (d < 0.01) { dx = Math.cos(i * 2.4 + j); dy = Math.sin(i * 2.4 + j); d = 1; }
      const push = (MIN - d) / 2;
      a.x -= (dx / d) * push; a.y -= (dy / d) * push;
      c.x += (dx / d) * push; c.y += (dy / d) * push;
    }
  }
}

function sip(g: Hummel, f: Flower, events: string[]): void {
  const b = g.bee;
  g.chain += 1;
  g.chainT = CHAIN_T;
  const m = chainMult(g);
  const pts = (f.kind === 'gold' ? 50 : f.kind === 'sonne' ? 15 : 10) * m;
  g.score += pts;
  g.nectar += 1;
  burst(g.sparks, g.rng, f.x, f.y, f.kind === 'gold' ? '#fff3b0' : '#ffd166', f.kind === 'gold' ? 18 : 8, 70);
  if (m > 1 && (g.chain === 8 || g.chain === 16)) g.floats.push({ x: b.x, y: b.y - 30, text: `Kette ×${m}`, color: '#ffb3c6', life: 1.2 });
  if (f.kind === 'gold') {
    b.turbo = 4;
    g.floats.push({ x: f.x, y: f.y - 14, text: `Turbo +${pts}`, color: '#fff3b0', life: 1.2 });
    events.push('gold');
  } else {
    if (f.kind === 'sonne') g.floats.push({ x: f.x, y: f.y - 18, text: `+${pts}`, color: '#ffd166', life: 0.7 });
    events.push('nectar');
  }
  if (g.nectar % 10 === 0) {
    g.score += 50;
    g.floats.push({ x: b.x, y: b.y - 20, text: 'Honigtopf +50', color: '#ffd166', life: 1.4 });
    if (g.nectar % 20 === 0 && g.lives < 5) { g.lives += 1; g.floats.push({ x: b.x, y: b.y - 40, text: '+1 ♥', color: '#ff8fab', life: 1.4 }); }
    events.push('honey');
  }
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
  const fast = b.turbo > 0 ? 1.45 : 1;
  if (input.target) {
    const dx = input.target.x - b.x;
    const dy = input.target.y - b.y;
    const d = Math.hypot(dx, dy);
    const max = 430 * fast * dt;
    if (d > 0.5) { const k = Math.min(1, max / d); b.x += dx * k; b.y += dy * k; }
  } else {
    const len = Math.max(1, Math.hypot(input.dx, input.dy));
    b.x += (input.dx / len) * 230 * fast * dt;
    b.y += (input.dy / len) * 230 * fast * dt;
  }
  b.cool = Math.max(0, b.cool - dt);
  b.inv = Math.max(0, b.inv - dt);
  b.royal = Math.max(0, b.royal - dt);
  b.turbo = Math.max(0, b.turbo - dt);
  if (input.press && b.cool <= 0) { b.sting = STING_TIME; b.cool = 0.7; events.push('sting'); }
  if (b.sting > 0) { b.sting -= dt; b.y -= 260 * dt; }
  b.x = Math.min(W - 16, Math.max(16, b.x));
  b.y = Math.min(H - 24, Math.max(50, b.y));
  if (b.turbo > 0 && g.rng() < dt * 40) g.sparks.push({ x: b.x + (g.rng() - 0.5) * 10, y: b.y + 14, vx: 0, vy: 120, life: 0.3, color: '#fff3b0' });
  g.chainT -= dt;
  if (g.chainT <= 0) g.chain = 0;

  // Neues auf der Wiese
  const n = g.next;
  n.flower -= dt; n.wasp -= dt; n.web -= dt; n.bird -= dt; n.fly -= dt; n.power -= dt;
  if (n.flower <= 0) { g.flowers.push(flower(g.rng, g.level)); n.flower = 0.45 + g.rng() * 0.4; }
  if (n.wasp <= 0 && !g.nest) {
    const roll = g.rng();
    const kind: WaspKind = roll < 0.45 ? 'jaeger' : roll < 0.75 || g.level < 2 ? 'sturz' : 'kreis';
    const big = g.level >= 3 && g.rng() < 0.3;
    g.wasps.push(makeWasp(g.rng, 30 + g.rng() * (W - 60), -20, kind, big));
    n.wasp = Math.max(0.8, 2.6 - g.level * 0.22) * (0.7 + g.rng() * 0.6);
  }
  if (n.web <= 0 && g.level >= 2) { g.webs.push({ x: 30 + g.rng() * (W - 60), y: -30, r: 22 }); n.web = 5 + g.rng() * 4; }
  if (n.bird <= 0 && g.level >= 2) {
    const left = g.rng() < 0.5;
    g.birds.push({ x: left ? -40 : W + 40, y: 90 + g.rng() * (H - 260), vx: (left ? 1 : -1) * (190 + g.level * 12), warn: 1.1 });
    n.bird = 9 + g.rng() * 6;
  }
  if (n.fly <= 0 && g.level >= 3 && !g.nest) {
    const dir: 1 | -1 = g.rng() < 0.5 ? 1 : -1;
    const y = 110 + g.rng() * (H - 300);
    g.flies.push({ x: dir > 0 ? -30 : W + 30, y, tx: dir > 0 ? 50 : W - 50, ty: y, wait: 0, hops: 5, dir, t: 0, rot: dir * Math.PI / 2 });
    n.fly = 11 + g.rng() * 5;
  }
  if (n.power <= 0 && g.level >= 2) {
    g.powers.push({ x: 30 + g.rng() * (W - 60), y: -20, kind: g.rng() < 0.55 ? 'tau' : 'gelee', t: 0 });
    n.power = 13 + g.rng() * 6;
  }
  if (!g.nest && g.score >= g.nextBoss) {
    const hp = 8 + g.level;
    g.nest = { x: W / 2, y: -70, hp, max: hp, t: 0, spawn: 2.4, hit: 0 };
    g.banner = { text: 'Hornissennest!', t: 2 };
    events.push('boss');
  }

  // Bewegung: Wiese zieht nach unten, Wespen jagen je auf ihre Art
  for (const f of g.flowers) f.y += speed * dt;
  for (const w of g.webs) w.y += speed * dt;
  for (const p of g.powers) { p.y += speed * dt; p.t += dt; }
  for (const c of g.clover) { c.y += speed * dt; if (c.y > H + 10) { c.y -= H + 20; c.x = g.rng() * W; } }
  for (const w of g.wasps) stepWasp(g, w, dt, speed);
  separate(g.wasps);
  for (const bd of g.birds) {
    if (bd.warn > 0) { bd.warn -= dt; continue; }
    bd.x += bd.vx * dt;
    bd.y += Math.sin(g.time * 3 + bd.x * 0.02) * 30 * dt;
  }
  for (const f of g.flies) {
    f.t += dt;
    if (f.wait > 0) { f.wait -= dt; continue; }
    const dx = f.tx - f.x;
    const dy = f.ty - f.y;
    const d = Math.hypot(dx, dy);
    f.rot = Math.atan2(dx, -dy);
    const step = 380 * dt;
    if (d > step) { f.x += (dx / d) * step; f.y += (dy / d) * step; continue; }
    f.x = f.tx; f.y = f.ty;
    // angekommen: kurz schweben und den nächsten Satz schon zeigen
    f.wait = 0.5;
    if (f.hops > 0) {
      f.hops -= 1;
      f.tx = f.x + f.dir * (60 + g.rng() * 40);
      f.ty = Math.min(H - 60, Math.max(70, (f.y + b.y) / 2 + (g.rng() - 0.5) * 80));
    } else {
      f.tx = f.dir > 0 ? W + 80 : -80;
      f.ty = f.y;
    }
  }
  const nest = g.nest;
  if (nest) {
    nest.t += dt;
    nest.y += (NEST_Y - nest.y) * Math.min(1, dt * 2);
    nest.x = W / 2 + Math.sin(nest.t * 0.7) * 110;
    nest.hit = Math.max(0, nest.hit - dt);
    nest.spawn -= dt;
    if (nest.spawn <= 0 && nest.y > NEST_Y - 10) {
      if (g.wasps.length < 6) {
        const h = makeWasp(g.rng, nest.x, nest.y + 34, 'jaeger', true);
        h.vy = 120;
        g.wasps.push(h);
      }
      nest.spawn = Math.max(1.3, 2.4 - g.level * 0.08);
    }
  }

  // Nektar: Blüten sofort, Sonnenblumen in drei Schlucken
  for (const f of g.flowers) {
    if (f.nectar <= 0) continue;
    if (!hitTest(b.x, b.y, BEE_R, f.x, f.y, f.r * 0.7)) { f.sip = 0; continue; }
    if (f.kind === 'sonne') {
      f.sip += dt;
      if (f.sip < 0.3) continue;
      f.sip = 0;
    }
    f.nectar -= 1;
    sip(g, f, events);
  }
  for (const p of g.powers) {
    if (!hitTest(b.x, b.y, BEE_R, p.x, p.y, 13)) continue;
    p.y = H + 999;
    if (p.kind === 'tau') {
      b.shield = true;
      g.floats.push({ x: b.x, y: b.y - 26, text: 'Tauschild', color: '#9be7ff', life: 1.2 });
    } else {
      b.royal = 6;
      g.floats.push({ x: b.x, y: b.y - 26, text: 'Gelée royale!', color: '#fff3b0', life: 1.4 });
    }
    events.push('power');
  }
  // Wespen: mit dem Stachel besiegen (Gelée royale sticht von selbst), sonst stechen sie
  const strike = b.sting > 0 || b.royal > 0;
  for (const w of g.wasps) {
    if (w.hp <= 0 || !hitTest(b.x, b.y - (b.sting > 0 ? 6 : 0), BEE_R + (strike ? 6 : 0), w.x, w.y, w.big ? 14 : 10)) continue;
    if (strike) {
      w.hp -= b.royal > 0 ? 2 : 1;
      if (w.hp > 0) { w.vy = -160; w.y -= 12; continue; }
      const pts = w.big ? 60 : 30;
      g.score += pts;
      g.floats.push({ x: w.x, y: w.y, text: `+${pts}`, color: '#ffffff', life: 0.9 });
      burst(g.sparks, g.rng, w.x, w.y, w.big ? '#ff8c00' : '#ffd60a', 18);
      events.push('kill');
    } else if (hurt(g, events)) {
      // nach dem Stich dreht die Wespe ab
      w.state = 'weg';
      w.vy = -120;
    }
  }
  for (const f of g.flies) {
    if (f.x < -900 || !hitTest(b.x, b.y - (b.sting > 0 ? 6 : 0), BEE_R + (strike ? 6 : 0), f.x, f.y, 12)) continue;
    if (strike) {
      g.score += 80;
      g.floats.push({ x: f.x, y: f.y, text: '+80', color: '#9be7ff', life: 0.9 });
      burst(g.sparks, g.rng, f.x, f.y, '#4cc9f0', 18);
      f.x = -999;
      events.push('kill');
    } else {
      hurt(g, events);
    }
  }
  if (nest && hitTest(b.x, b.y - 6, BEE_R + 4, nest.x, nest.y, 30)) {
    if (strike) {
      if (nest.hit <= 0) {
        nest.hp -= 1;
        nest.hit = 0.3;
        b.sting = 0;
        b.y += 26;
        g.score += 15;
        burst(g.sparks, g.rng, nest.x, nest.y + 20, '#d8cfc0', 12);
        events.push('nesthit');
      }
    } else {
      hurt(g, events);
      b.y += 30;
    }
    if (nest.hp <= 0) {
      g.score += 300;
      g.floats.push({ x: nest.x, y: nest.y + 40, text: '+300', color: '#fff3b0', life: 1.6 });
      g.banner = { text: 'Nest besiegt!', t: 2 };
      if (g.lives < 5) g.lives += 1;
      burst(g.sparks, g.rng, nest.x, nest.y, '#d8cfc0', 40, 220);
      // Goldregen: fünf Goldblüten
      for (let i = 0; i < 5; i++) g.flowers.push({ ...flower(g.rng, 2), kind: 'gold', color: '#ffd23f', r: 13, nectar: 1, x: Math.min(W - 24, Math.max(24, nest.x + (i - 2) * 44)), y: nest.y + 30 - i * 20 });
      for (const w of g.wasps) w.state = 'weg';
      g.nest = null;
      g.nextBoss = g.score + 1800;
      events.push('nestdown');
    }
  }
  for (const w of g.webs) if (hitTest(b.x, b.y, BEE_R, w.x, w.y, w.r * 0.8) && hurt(g, events)) w.y = H + 999;
  for (const bd of g.birds) if (bd.warn <= 0 && hitTest(b.x, b.y, BEE_R, bd.x, bd.y, 18)) hurt(g, events);

  g.flowers = g.flowers.filter((f) => f.y < H + 30);
  g.webs = g.webs.filter((w) => w.y < H + 40);
  g.powers = g.powers.filter((p) => p.y < H + 30);
  g.wasps = g.wasps.filter((w) => w.hp > 0 && w.y < H + 40 && w.y > -200 && w.x > -60 && w.x < W + 60);
  g.birds = g.birds.filter((bd) => bd.x > -80 && bd.x < W + 80);
  g.flies = g.flies.filter((f) => f.x > -90 && f.x < W + 90);

  const level = 1 + Math.floor(g.score / 300);
  if (level > g.level) { g.level = level; if (!g.banner) g.banner = { text: `Stufe ${level}`, t: 1.6 }; events.push('level'); }
  return events;
}

/* ---------- Zeichnen ---------- */

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, l: number, a: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = '#3f8a3f';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(l * 0.5, -l * 0.35, l, 0); ctx.quadraticCurveTo(l * 0.5, l * 0.35, 0, 0); ctx.fill();
  ctx.strokeStyle = 'rgba(200, 240, 180, 0.4)'; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(l * 0.85, 0); ctx.stroke();
  ctx.restore();
}

function drawFlower(ctx: CanvasRenderingContext2D, f: Flower, time: number): void {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.globalAlpha = f.nectar > 0 ? 1 : 0.45;
  leaf(ctx, f.r * 0.3, f.r * 0.2, f.r * 1.3, f.spin + 0.6);
  leaf(ctx, -f.r * 0.3, f.r * 0.1, f.r * 1.2, f.spin + 2.7);
  ctx.rotate(f.spin);
  if (f.kind === 'sonne') {
    for (const [layer, color, len] of [[0, '#e89a00', 1], [1, '#ffd000', 0.86]] as const) {
      ctx.fillStyle = color;
      for (let i = 0; i < f.petals; i++) {
        ctx.save();
        ctx.rotate(((i + layer * 0.5) / f.petals) * Math.PI * 2);
        ctx.beginPath(); ctx.ellipse(0, -f.r * 0.68 * len, f.r * 0.16, f.r * 0.4 * len, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    const c = ctx.createRadialGradient(-2, -2, 0, 0, 0, f.r * 0.45);
    c.addColorStop(0, '#7a4a1e'); c.addColorStop(1, '#3b2410');
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(0, 0, f.r * 0.45, 0, Math.PI * 2); ctx.fill();
    // Kerne in der Spirale (goldener Winkel)
    ctx.fillStyle = 'rgba(255, 210, 120, 0.55)';
    for (let i = 1; i < 34; i++) {
      const a = i * 2.39996;
      const rr = Math.sqrt(i / 34) * f.r * 0.4;
      ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 0.8, 0, Math.PI * 2); ctx.fill();
    }
    // Rest-Nektar als Honigtropfen, Saugen als Ring
    ctx.rotate(-f.spin);
    ctx.fillStyle = '#ffb703';
    for (let i = 0; i < f.nectar; i++) { ctx.beginPath(); ctx.arc(-5 + i * 5, -f.r - 6, 2.2, 0, Math.PI * 2); ctx.fill(); }
    if (f.sip > 0) {
      ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, f.r * 0.55, -Math.PI / 2, -Math.PI / 2 + (f.sip / 0.3) * Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (f.kind === 'gold' && f.nectar > 0) { ctx.shadowColor = '#ffe066'; ctx.shadowBlur = 14; }
  for (let i = 0; i < f.petals; i++) {
    ctx.rotate((Math.PI * 2) / f.petals);
    const pg = ctx.createLinearGradient(0, 0, 0, -f.r * 1.2);
    pg.addColorStop(0, f.kind === 'gold' ? '#fff3b0' : 'rgba(255, 255, 255, 0.55)');
    pg.addColorStop(0.35, f.color);
    pg.addColorStop(1, f.color);
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.ellipse(0, -f.r * 0.62, f.r * 0.36, f.r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = f.nectar > 0 ? (f.kind === 'gold' ? '#ffffff' : '#ffd166') : '#8a5a2b';
  ctx.beginPath(); ctx.arc(0, 0, f.r * 0.34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(140, 80, 20, 0.5)';
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * f.r * 0.18, Math.sin(a) * f.r * 0.18, 0.9, 0, Math.PI * 2); ctx.fill(); }
  if (f.kind === 'gold' && f.nectar > 0) {
    // funkelnder Stern neben der Goldblüte
    ctx.rotate(-f.spin + time * 2);
    const s = 4 + Math.sin(time * 6) * 1.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const rr = i % 2 ? s * 0.3 : s; ctx.lineTo(f.r * 1.1 + Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.fill();
  }
  ctx.restore();
}

function drawPower(ctx: CanvasRenderingContext2D, p: Power): void {
  ctx.save();
  ctx.translate(p.x, p.y + Math.sin(p.t * 3) * 2);
  const pulse = 1 + Math.sin(p.t * 5) * 0.06;
  ctx.scale(pulse, pulse);
  if (p.kind === 'tau') {
    const g = ctx.createRadialGradient(-3, -2, 1, 0, 2, 12);
    g.addColorStop(0, 'rgba(235, 250, 255, 0.95)');
    g.addColorStop(1, 'rgba(60, 150, 230, 0.85)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, -13); ctx.bezierCurveTo(4, -6, 9, -1, 9, 4); ctx.arc(0, 4, 9, 0, Math.PI); ctx.bezierCurveTo(-9, -1, -4, -6, 0, -13); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath(); ctx.ellipse(-3.5, 1, 1.8, 3.6, 0.4, 0, Math.PI * 2); ctx.fill();
  } else {
    // Wabe mit Gelée royale und Krönchen
    ctx.fillStyle = '#e09a1a';
    ctx.strokeStyle = '#8a5a00';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12 + 2); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath(); ctx.ellipse(0, 3, 6.5, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath(); ctx.arc(-2, 1.5, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.moveTo(-6, -11); ctx.lineTo(-6, -17); ctx.lineTo(-3, -13); ctx.lineTo(0, -18); ctx.lineTo(3, -13); ctx.lineTo(6, -17); ctx.lineTo(6, -11); ctx.fill();
  }
  ctx.restore();
}

function drawWasp(ctx: CanvasRenderingContext2D, w: Wasp, time: number): void {
  const s = w.big ? 1.35 : 1;
  ctx.save();
  // Sturzwespe zittert kurz vor dem Angriff
  const shake = w.kind === 'sturz' && w.state === 'an' && w.t > 0.85 + w.phase * 0.08 ? Math.sin(time * 90) * 1.6 : 0;
  ctx.translate(w.x + shake, w.y);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.beginPath(); ctx.ellipse(6, 14, 7 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(w.rot);
  ctx.scale(s, s);
  const flap = Math.sin(time * 60 + w.phase) * 0.5 + 0.5;
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

function drawFly(ctx: CanvasRenderingContext2D, f: Fly, time: number): void {
  if (f.wait > 0 && f.x > -60 && f.x < W + 60) {
    // nächster Satz als gestrichelte Linie
    ctx.save();
    ctx.strokeStyle = 'rgba(155, 231, 255, 0.55)';
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.rot);
  const flick = 0.45 + Math.abs(Math.sin(time * 50)) * 0.3;
  ctx.fillStyle = `rgba(220, 240, 255, ${flick})`;
  ctx.strokeStyle = 'rgba(120, 160, 190, 0.6)';
  ctx.lineWidth = 0.6;
  for (const [x, y, a] of [[-12, -8, -0.15], [12, -8, 0.15], [-11, -2, 0.2], [11, -2, -0.2]] as const) {
    ctx.beginPath(); ctx.ellipse(x, y, 12, 3.2, a, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // langer Hinterleib mit Ringen
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = i % 2 ? '#1d4e89' : '#2a7fff';
    ctx.fillRect(-1.6 + i * 0.12, -1 + i * 4, 3.2 - i * 0.24, 4);
  }
  ctx.fillStyle = '#1aa39a';
  ctx.beginPath(); ctx.ellipse(0, -6, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2ee6a6';
  ctx.beginPath(); ctx.arc(-3, -13, 3.2, 0, Math.PI * 2); ctx.arc(3, -13, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.beginPath(); ctx.arc(-3.8, -14, 0.9, 0, Math.PI * 2); ctx.arc(2.2, -14, 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawNest(ctx: CanvasRenderingContext2D, n: Nest): void {
  // Ast oben mit Blättern, Stiel zum Nest
  ctx.save();
  ctx.strokeStyle = '#5a3d22';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-10, 26); ctx.quadraticCurveTo(W / 2, 40, W + 10, 18); ctx.stroke();
  ctx.lineWidth = 4;
  const t = (n.x + 10) / (W + 20);
  const by = (1 - t) ** 2 * 26 + 2 * t * (1 - t) * 40 + t * t * 18;
  ctx.beginPath(); ctx.moveTo(n.x, by); ctx.lineTo(n.x, n.y - 34); ctx.stroke();
  for (let i = 0; i < 9; i++) leaf(ctx, 20 + i * 40, 28 + Math.sin(i * 1.7) * 6, 16, i % 2 ? 0.5 : 2.4);
  ctx.restore();

  ctx.save();
  const jolt = n.hit > 0 ? Math.sin(n.hit * 60) * 3 : 0;
  ctx.translate(n.x + jolt, n.y);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.beginPath(); ctx.ellipse(8, 10, 30, 36, 0, 0, Math.PI * 2); ctx.fill();
  const body = ctx.createLinearGradient(-30, 0, 30, 0);
  body.addColorStop(0, '#e6dccb'); body.addColorStop(0.5, '#c9bca5'); body.addColorStop(1, '#8f8270');
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(0, 0, 30, 38, 0, 0, Math.PI * 2); ctx.fill();
  // Papierschichten
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 8; i++) {
    const y = -32 + i * 9;
    const half = 30 * Math.sqrt(Math.max(0, 1 - (y / 38) ** 2));
    ctx.strokeStyle = i % 2 ? 'rgba(110, 90, 70, 0.45)' : 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath(); ctx.ellipse(0, y, half, 4, 0, 0.1, Math.PI - 0.1); ctx.stroke();
  }
  ctx.fillStyle = '#2a1d12';
  ctx.beginPath(); ctx.ellipse(0, 28, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  if (n.hit > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${n.hit * 2})`;
    ctx.beginPath(); ctx.ellipse(0, 0, 30, 38, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // Lebensbalken
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(W / 2 - 70, 4, 140, 7);
  ctx.fillStyle = '#ff8c00';
  ctx.fillRect(W / 2 - 69, 5, 138 * (n.hp / n.max), 5);
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
  if (b.inv > 0 && b.royal <= 0 && Math.floor(b.inv * 12) % 2 === 0) return;
  ctx.save();
  ctx.translate(b.x, b.y);
  if (b.sting > 0) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    for (const ox of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(ox, 16); ctx.lineTo(ox, 34); ctx.stroke(); }
  }
  if (b.royal > 0) { ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 16 + Math.sin(g.time * 12) * 4; }
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
  ctx.shadowBlur = 0;
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
  if (b.royal > 0) {
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.moveTo(-5, -14); ctx.lineTo(-5, -20); ctx.lineTo(-2.5, -17); ctx.lineTo(0, -21); ctx.lineTo(2.5, -17); ctx.lineTo(5, -20); ctx.lineTo(5, -14); ctx.fill();
  }
  if (b.shield) {
    ctx.strokeStyle = 'rgba(155, 231, 255, 0.9)';
    ctx.fillStyle = 'rgba(155, 231, 255, 0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath(); ctx.arc(0, 0, 17, -2.4 + g.time * 2, -1.6 + g.time * 2); ctx.stroke();
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
  for (const f of g.flowers) drawFlower(ctx, f, g.time);
  for (const p of g.powers) drawPower(ctx, p);
  drawSparks(ctx, g.sparks);
  if (g.nest) drawNest(ctx, g.nest);
  for (const w of g.wasps) drawWasp(ctx, w, g.time);
  for (const f of g.flies) drawFly(ctx, f, g.time);
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
    { label: 'Nektar', value: chainMult(g) > 1 ? `${g.nectar} ×${chainMult(g)}` : String(g.nectar), tone: 'c' },
    { label: 'Leben', value: ('♥'.repeat(Math.max(0, g.lives)) || '–') + (g.bee.shield ? ' ◌' : ''), tone: 'b' },
  ],
  score: (g) => g.score,
  over: (g) => g.over,
  tones: {
    nectar: ['sine', 760, 1180, 0.09, 0.03],
    gold: ['sine', 880, 1760, 0.3, 0.05],
    honey: ['sine', 520, 1560, 0.35, 0.06],
    power: ['sine', 600, 1200, 0.25, 0.05],
    shield: ['triangle', 900, 300, 0.25, 0.06],
    sting: ['square', 320, 900, 0.08, 0.02],
    kill: ['sawtooth', 600, 120, 0.22, 0.05],
    hit: ['triangle', 260, 60, 0.4, 0.09],
    boss: ['sawtooth', 110, 90, 0.8, 0.06],
    nesthit: ['square', 240, 120, 0.12, 0.05],
    nestdown: ['sawtooth', 400, 1400, 0.7, 0.06],
    level: ['sine', 660, 1320, 0.4, 0.06],
    over: ['triangle', 330, 70, 0.9, 0.08],
  },
};
