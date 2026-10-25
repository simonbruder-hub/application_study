/**
 * Kürbismann: Das richtige Haus (Stil Halloween). Nachts im nebligen Wald steht eine Handvoll Spukhäuser.
 * Nur eines ist das gesuchte: Der Hinweis nennt zwei Merkmale (Fensterlicht und ein Zeichen am Haus).
 * Man läuft selbst mit der Taschenlampe herum; beim Umsehen nach links oder rechts tritt die Figur zur Seite
 * und gibt mehr Sicht frei. Vor der Tür kurz stehen bleiben öffnet sie. Das richtige Haus bringt Münzen und
 * führt zur nächsten Stufe; im falschen wartet der Kürbismann und der Versuch ist vorbei. Jeder neue Versuch
 * ordnet den Wald neu an. Draussen streift der Kürbismann umher: Im Licht der Lampe erstarrt er und verschwindet.
 * Münzen und Upgrades (Laterne, Laufschuhe, Amulett, Krähe) bleiben über die Versuche hinweg erhalten.
 */
import { drawBanner, drawFloats, drawLoading, type Engine, type Float, type Input, lazyView, moveFloats } from './types';

const W = 360;
const H = 560;
export const FIELD = 28;

export type Light = 'gelb' | 'grün' | 'violett';
export type Mark = 'katze' | 'kürbis' | 'rabe' | 'grabstein';
export const LIGHTS: Light[] = ['gelb', 'grün', 'violett'];
export const MARKS: Mark[] = ['katze', 'kürbis', 'rabe', 'grabstein'];
const WALLS = ['#5b3a2e', '#3e4a5c', '#4a5a3a', '#5a5150', '#6b4a6a'];
const ROOFS = ['#2b1f2e', '#2e3138', '#3a2620', '#25303a'];

export interface House {
  x: number;
  z: number;
  /** Tür zeigt in diese Richtung (Radiant, 0 = +Z) */
  face: number;
  light: Light;
  mark: Mark;
  wall: string;
  roof: string;
  tall: boolean;
  /** Schon betreten (falsch) – nur für die Anzeige */
  tried: boolean;
}

export interface Tree { x: number; z: number; r: number; kind: 'tot' | 'tanne'; s: number }

export interface Upgrades { lamp: number; shoes: number; amulet: number; crow: number }
export interface Progress { coins: number; up: Upgrades }

export interface Haunt {
  seed: number;
  houses: House[];
  trees: Tree[];
  graves: { x: number; z: number; r: number }[];
  target: { light: Light; mark: Mark };
  p: { x: number; z: number; yaw: number; look: number; speed: number; walk: number };
  door: { house: number; t: number } | null;
  monster: { x: number; z: number; lit: number; active: boolean; wait: number; gone: number };
  /** Schreckmoment: Kürbismann springt aus der Tür */
  scare: number;
  found: number;
  level: number;
  score: number;
  amulet: number;
  progress: Progress;
  floats: Float[];
  banner: { text: string; t: number } | null;
  time: number;
  touch: { x: number; y: number } | null;
  over: boolean;
  rng: () => number;
}

/* ---------- Fortschritt über die Versuche ---------- */

const STORE = 'taktwerk.kuerbis.v2';
export const UPGRADES: { key: keyof Upgrades; max: number; cost: number; label: string }[] = [
  { key: 'lamp', max: 1, cost: 20, label: 'Laterne heller' },
  { key: 'shoes', max: 1, cost: 40, label: 'Laufschuhe' },
  { key: 'lamp', max: 2, cost: 70, label: 'Laterne weiter' },
  { key: 'amulet', max: 1, cost: 100, label: 'Amulett (schützt einmal)' },
  { key: 'shoes', max: 2, cost: 140, label: 'Sprintschuhe' },
  { key: 'crow', max: 1, cost: 190, label: 'Krähe zeigt das Haus' },
  { key: 'lamp', max: 3, cost: 250, label: 'Scheinwerfer' },
];

export function loadProgress(): Progress {
  const empty: Progress = { coins: 0, up: { lamp: 0, shoes: 0, amulet: 0, crow: 0 } };
  try {
    const raw = globalThis.localStorage?.getItem(STORE);
    if (!raw) return empty;
    const p = JSON.parse(raw) as Progress;
    return { coins: p.coins ?? 0, up: { ...empty.up, ...p.up } };
  } catch { return empty; }
}

function saveProgress(p: Progress): void {
  try { globalThis.localStorage?.setItem(STORE, JSON.stringify(p)); } catch { /* privater Modus */ }
}

/** Blickrichtung der Lampe: Drehrichtung schaut voraus */
export const viewYaw = (g: Haunt) => g.p.yaw - g.p.look * 0.55;

export const lampCone = (g: Haunt) => (24 + g.progress.up.lamp * 6) * (Math.PI / 180);
export const lampRange = (g: Haunt) => 11 + g.progress.up.lamp * 3;
const walkSpeed = (g: Haunt) => 3.4 * (1 + g.progress.up.shoes * 0.18);

/* ---------- Welt ---------- */

const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
/** Türpunkt vor dem Haus */
export const doorAt = (h: House) => ({ x: h.x + Math.sin(h.face) * 3.1, z: h.z + Math.cos(h.face) * 3.1 });

function buildWorld(g: Haunt): void {
  const rng = g.rng;
  const n = Math.min(7, 4 + g.level - 1);
  const houses: House[] = [];
  for (let tries = 0; houses.length < n && tries < 600; tries++) {
    const x = (rng() * 2 - 1) * (FIELD - 5), z = (rng() * 2 - 1) * (FIELD - 5);
    if (dist(x, z, 0, FIELD - 3) < 13) continue;
    if (houses.some((h) => dist(h.x, h.z, x, z) < 11)) continue;
    houses.push({
      x, z, face: Math.atan2(0 - x, FIELD - 3 - z) + (rng() - 0.5) * 1.6,
      light: 'gelb', mark: 'katze', wall: WALLS[Math.floor(rng() * WALLS.length)]!, roof: ROOFS[Math.floor(rng() * ROOFS.length)]!,
      tall: rng() < 0.4, tried: false,
    });
  }
  // Ziel: zwei Merkmale, die genau ein Haus hat
  const target = { light: LIGHTS[Math.floor(rng() * 3)]!, mark: MARKS[Math.floor(rng() * 4)]! };
  const goal = Math.floor(rng() * houses.length);
  houses.forEach((h, i) => {
    if (i === goal) { h.light = target.light; h.mark = target.mark; return; }
    // Täuschung: oft stimmt ein Merkmal, nie beide
    const sameLight = rng() < 0.5;
    h.light = sameLight ? target.light : LIGHTS.filter((l) => l !== target.light)[Math.floor(rng() * 2)]!;
    h.mark = sameLight ? MARKS.filter((m) => m !== target.mark)[Math.floor(rng() * 3)]! : MARKS[Math.floor(rng() * 4)]!;
  });
  g.houses = houses;
  g.target = target;
  // Bäume und Gräber, nicht auf Häusern, Türen und am Start
  const trees: Tree[] = [];
  for (let tries = 0; trees.length < 70 && tries < 2000; tries++) {
    const x = (rng() * 2 - 1) * FIELD, z = (rng() * 2 - 1) * FIELD;
    if (dist(x, z, 0, FIELD - 3) < 5) continue;
    if (houses.some((h) => dist(h.x, h.z, x, z) < 6.5)) continue;
    if (trees.some((t) => dist(t.x, t.z, x, z) < 2.6)) continue;
    const kind = rng() < 0.55 ? 'tot' : 'tanne';
    trees.push({ x, z, r: kind === 'tot' ? 0.45 : 0.7, kind, s: 0.8 + rng() * 0.6 });
  }
  g.trees = trees;
  g.graves = [];
  for (let tries = 0; g.graves.length < 16 && tries < 400; tries++) {
    const x = (rng() * 2 - 1) * (FIELD - 2), z = (rng() * 2 - 1) * (FIELD - 2);
    if (houses.some((h) => dist(h.x, h.z, x, z) < 5) || trees.some((t) => dist(t.x, t.z, x, z) < 1.5) || dist(x, z, 0, FIELD - 3) < 4) continue;
    g.graves.push({ x, z, r: (rng() - 0.5) * 0.6 });
  }
  g.p = { x: 0, z: FIELD - 3, yaw: Math.PI, look: 0, speed: 0, walk: 0 };
  g.door = null;
  g.monster = { x: 0, z: -FIELD + 2, lit: 0, active: false, wait: 12 - Math.min(6, g.level), gone: 0 };
}

export function createHaunt(rng: () => number = Math.random): Haunt {
  const g: Haunt = {
    seed: Math.floor(rng() * 1e9), houses: [], trees: [], graves: [], target: { light: 'gelb', mark: 'katze' },
    p: { x: 0, z: 0, yaw: 0, look: 0, speed: 0, walk: 0 }, door: null,
    monster: { x: 0, z: 0, lit: 0, active: false, wait: 10, gone: 0 },
    scare: 0, found: 0, level: 1, score: 0, amulet: 0, progress: loadProgress(),
    floats: [], banner: null, time: 0, touch: null, over: false, rng,
  };
  g.amulet = g.progress.up.amulet;
  buildWorld(g);
  g.banner = { text: hintText(g), t: 3 };
  return g;
}

export const LIGHT_LABEL: Record<Light, string> = { gelb: 'gelbes Licht', grün: 'grünes Licht', violett: 'violettes Licht' };
export const MARK_LABEL: Record<Mark, string> = { katze: 'Katze auf dem Dach', kürbis: 'Kürbis vor der Tür', rabe: 'Rabe auf dem Kamin', grabstein: 'Grabstein am Haus' };
export const hintText = (g: Haunt) => `Gesucht: ${LIGHT_LABEL[g.target.light]} · ${MARK_LABEL[g.target.mark]}`;

/** Richtiges Haus (Index) */
export const goalIndex = (g: Haunt) => g.houses.findIndex((h) => h.light === g.target.light && h.mark === g.target.mark);

/** Steht der Kürbismann im Lichtkegel? */
export function inLight(g: Haunt): boolean {
  const m = g.monster;
  if (!m.active) return false;
  const d = dist(g.p.x, g.p.z, m.x, m.z);
  if (d > lampRange(g)) return false;
  // Blick führt in Drehrichtung (rechts drehen: yaw sinkt, look steigt)
  const dir = viewYaw(g);
  const ang = Math.atan2(m.x - g.p.x, m.z - g.p.z);
  let diff = ang - dir;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff) < lampCone(g);
}

function enterHouse(g: Haunt, i: number, events: string[]): void {
  const h = g.houses[i]!;
  if (i === goalIndex(g)) {
    const coins = 10 + g.level * 5;
    g.progress.coins += coins;
    g.found += 1;
    g.score += 100 * g.level;
    g.floats.push({ x: W / 2, y: H * 0.45, text: `+${coins} Münzen`, color: '#ffd166', life: 1.6 });
    events.push('found');
    // Upgrade kaufen, sobald genug Münzen da sind
    const next = UPGRADES.find((u) => g.progress.up[u.key] < u.max);
    let msg = `Richtig! +${coins} Münzen`;
    if (next && g.progress.coins >= next.cost) {
      g.progress.coins -= next.cost;
      g.progress.up[next.key] = next.max;
      if (next.key === 'amulet') g.amulet = 1;
      msg = `Upgrade: ${next.label}`;
      events.push('upgrade');
    }
    saveProgress(g.progress);
    g.level += 1;
    buildWorld(g);
    g.banner = { text: `${msg} · ${hintText(g)}`, t: 4 };
    return;
  }
  h.tried = true;
  if (g.amulet > 0) {
    g.amulet = 0;
    g.progress.up.amulet = 0;
    saveProgress(g.progress);
    g.banner = { text: 'Das Amulett zerbricht und rettet dich!', t: 2.5 };
    g.p.x += Math.sin(h.face) * 2;
    g.p.z += Math.cos(h.face) * 2;
    events.push('amulet');
    return;
  }
  // Falsches Haus: der Kürbismann springt aus der Tür
  g.scare = 1.6;
  g.monster = { ...g.monster, x: doorAt(h).x, z: doorAt(h).z, active: true };
  events.push('scare');
}

/** Tastatur oder virtueller Joystick (Finger: vom Aufsetzpunkt aus ziehen) */
function controls(g: Haunt, input: Input): { fwd: number; turn: number } {
  let fwd = -input.dy, turn = input.dx;
  if (input.target) {
    if (!g.touch) g.touch = { ...input.target };
    const dx = input.target.x - g.touch.x, dy = input.target.y - g.touch.y;
    fwd = Math.abs(dy) > 10 ? Math.max(-1, Math.min(1, -dy / 60)) : 0;
    turn = Math.abs(dx) > 8 ? Math.max(-1, Math.min(1, dx / 60)) : 0;
  } else g.touch = null;
  return { fwd, turn };
}

function collide(g: Haunt): void {
  const p = g.p;
  const push = (cx: number, cz: number, r: number) => {
    const d = dist(p.x, p.z, cx, cz);
    if (d < r && d > 0.0001) { p.x = cx + ((p.x - cx) / d) * r; p.z = cz + ((p.z - cz) / d) * r; }
  };
  for (const h of g.houses) push(h.x, h.z, 3);
  for (const t of g.trees) push(t.x, t.z, t.r + 0.35);
  p.x = Math.max(-FIELD + 0.8, Math.min(FIELD - 0.8, p.x));
  p.z = Math.max(-FIELD + 0.8, Math.min(FIELD - 0.8, p.z));
}

export function stepHaunt(g: Haunt, dt: number, input: Input): string[] {
  const events: string[] = [];
  dt = Math.min(dt, 0.05);
  g.floats = moveFloats(g.floats, dt);
  if (g.banner) { g.banner.t -= dt; if (g.banner.t <= 0) g.banner = null; }
  if (g.over) return events;
  g.time += dt;
  if (g.scare > 0) {
    g.scare -= dt;
    if (g.scare <= 0) { g.over = true; events.push('over'); }
    return events;
  }

  // Bewegen und Umsehen: Drehen lenkt den Blick vor, die Figur tritt zur Seite
  const { fwd, turn } = controls(g, input);
  const p = g.p;
  p.yaw -= turn * 2.1 * dt;
  p.look += (turn - p.look) * Math.min(1, dt * 4);
  const target = fwd > 0 ? fwd * walkSpeed(g) : fwd * walkSpeed(g) * 0.5;
  p.speed += (target - p.speed) * Math.min(1, dt * 8);
  p.x += Math.sin(p.yaw) * p.speed * dt;
  p.z += Math.cos(p.yaw) * p.speed * dt;
  p.walk += Math.abs(p.speed) * dt * 3.2;
  collide(g);

  // Tür: kurz davor stehen öffnet sie
  const at = g.houses.findIndex((h) => { const d = doorAt(h); return dist(p.x, p.z, d.x, d.z) < 1.25; });
  if (at >= 0) {
    if (!g.door || g.door.house !== at) { g.door = { house: at, t: 0 }; events.push('door'); }
    g.door.t += dt;
    if (g.door.t >= 1) { g.door = null; enterHouse(g, at, events); if (g.over || g.scare > 0) return events; }
  } else g.door = null;

  // Kürbismann draussen
  const m = g.monster;
  if (!m.active) {
    m.wait -= dt;
    if (m.wait <= 0) {
      // erscheint hinter dem Spieler, in Nebeldistanz
      const a = p.yaw + Math.PI + (g.rng() - 0.5) * 1.6;
      m.x = Math.max(-FIELD + 1, Math.min(FIELD - 1, p.x + Math.sin(a) * 16));
      m.z = Math.max(-FIELD + 1, Math.min(FIELD - 1, p.z + Math.cos(a) * 16));
      m.active = true; m.lit = 0;
      g.banner = { text: 'Etwas knackt im Unterholz …', t: 2 };
      events.push('appear');
    }
  } else {
    if (inLight(g)) {
      m.lit += dt;
      if (m.lit > 1.1) {
        m.active = false; m.wait = 9 + g.rng() * 8; m.gone = 1;
        g.score += 25;
        g.floats.push({ x: W / 2, y: H * 0.35, text: '+25 gebannt', color: '#b8ff6b', life: 1.2 });
        events.push('banish');
      }
    } else {
      m.lit = Math.max(0, m.lit - dt * 0.5);
      const d = dist(m.x, m.z, p.x, p.z);
      const v = (1.5 + g.level * 0.15) * dt;
      m.x += ((p.x - m.x) / d) * v;
      m.z += ((p.z - m.z) / d) * v;
      if (d < 1.3) {
        if (g.amulet > 0) {
          g.amulet = 0; g.progress.up.amulet = 0; saveProgress(g.progress);
          m.active = false; m.wait = 10;
          g.banner = { text: 'Das Amulett zerbricht und rettet dich!', t: 2.5 };
          events.push('amulet');
        } else { g.scare = 1.2; events.push('scare'); }
      }
    }
  }
  m.gone = Math.max(0, m.gone - dt);
  return events;
}

/* ---------- Zeichnen ---------- */

/** Ohne WebGL: Karte von oben */
function drawMap(ctx: CanvasRenderingContext2D, g: Haunt): void {
  ctx.fillStyle = '#0b0f1e';
  ctx.fillRect(0, 0, W, H);
  const k = (W - 20) / (FIELD * 2);
  const X = (x: number) => W / 2 + x * k, Z = (z: number) => H / 2 + z * k;
  ctx.fillStyle = '#16301f';
  ctx.fillRect(X(-FIELD), Z(-FIELD), FIELD * 2 * k, FIELD * 2 * k);
  for (const t of g.trees) { ctx.fillStyle = t.kind === 'tanne' ? '#1f4a2c' : '#3a2e26'; ctx.beginPath(); ctx.arc(X(t.x), Z(t.z), t.r * k * 1.6, 0, Math.PI * 2); ctx.fill(); }
  const glow: Record<Light, string> = { gelb: '#ffd166', grün: '#7cfc00', violett: '#c77dff' };
  for (const h of g.houses) {
    ctx.fillStyle = h.wall; ctx.fillRect(X(h.x) - 2.5 * k, Z(h.z) - 2.5 * k, 5 * k, 5 * k);
    ctx.fillStyle = glow[h.light]; ctx.fillRect(X(h.x) - 0.8 * k, Z(h.z) - 0.8 * k, 1.6 * k, 1.6 * k);
    ctx.fillStyle = '#ffffff'; ctx.font = '700 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(h.mark, X(h.x), Z(h.z) + 3.6 * k);
  }
  ctx.save(); ctx.translate(X(g.p.x), Z(g.p.z)); ctx.rotate(-g.p.yaw);
  ctx.fillStyle = 'rgba(255, 240, 180, 0.25)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, lampRange(g) * k, Math.PI / 2 - lampCone(g), Math.PI / 2 + lampCone(g)); ctx.fill();
  ctx.fillStyle = '#c77dff'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (g.monster.active) { ctx.fillStyle = '#ff7518'; ctx.beginPath(); ctx.arc(X(g.monster.x), Z(g.monster.z), 6, 0, Math.PI * 2); ctx.fill(); }
  ctx.textAlign = 'left';
}

/** Anzeigen über der Szene: Hinweis, Türfortschritt, Schreck, Punkte */
export function hauntOverlays(ctx: CanvasRenderingContext2D, g: Haunt): void {
  // Hinweis oben
  ctx.fillStyle = 'rgba(10, 6, 20, 0.6)';
  ctx.fillRect(0, 0, W, 30);
  ctx.fillStyle = '#ffd166';
  ctx.font = '700 13px Fredoka, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(hintText(g), W / 2, 20);
  ctx.textAlign = 'left';
  if (g.door) {
    const t = Math.min(1, g.door.t);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(W / 2, H * 0.62, 26, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(W / 2, H * 0.62, 26, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = '700 12px Fredoka, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Tür öffnet …', W / 2, H * 0.62 + 46);
    ctx.textAlign = 'left';
  }
  if (g.scare > 0) {
    const a = Math.min(0.75, (1.6 - g.scare) * 1.5);
    ctx.fillStyle = `rgba(120, 0, 0, ${a})`;
    ctx.fillRect(0, 0, W, H);
  }
  drawFloats(ctx, g.floats, '700 16px Fredoka, system-ui, sans-serif');
  if (g.banner) drawBanner(ctx, W, H * 0.3, g.banner.text, '#ff9f43', Math.min(1, g.banner.t * 1.5), '700 15px Fredoka, system-ui, sans-serif');
}

const view3d = lazyView(async () => new (await import('./three/pumpkin3d')).HauntView());

export function drawHaunt(ctx: CanvasRenderingContext2D, g: Haunt): void {
  const v = view3d.get();
  if (v) v.render(ctx, g);
  else if (view3d.failed) drawMap(ctx, g);
  else { drawLoading(ctx, W, H, 'Der Wald wird geladen …'); return; }
  hauntOverlays(ctx, g);
}

export const pumpkin: Engine<Haunt> = {
  W, H,
  create: createHaunt,
  step: stepHaunt,
  draw: drawHaunt,
  hud: (g) => [
    { label: 'Punkte', value: String(g.score) },
    { label: 'Häuser', value: String(g.found), tone: 'a' },
    { label: 'Münzen', value: String(g.progress.coins), tone: 'c' },
    { label: 'Amulett', value: g.amulet > 0 ? 'ja' : '–', tone: 'b' },
  ],
  score: (g) => g.score,
  over: (g) => g.over,
  tones: {
    door: ['sine', 220, 180, 0.4, 0.04],
    found: ['triangle', 523, 1568, 0.6, 0.06],
    upgrade: ['sine', 660, 1980, 0.7, 0.06],
    appear: ['sawtooth', 90, 60, 0.8, 0.05],
    banish: ['triangle', 880, 1760, 0.3, 0.05],
    scare: ['sawtooth', 600, 60, 1.2, 0.09],
    amulet: ['square', 1200, 300, 0.5, 0.05],
    over: ['triangle', 392, 98, 1, 0.07],
  },
};
