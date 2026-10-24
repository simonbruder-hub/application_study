/**
 * Space Rider: kleines Weltraum-Spiel für die Pausen im Stil Sci-Fi. Hier stehen Spielregeln und Zeichnen,
 * ohne DOM. Die Spielwelt ist immer 360 × 560 Einheiten gross; die Ansicht skaliert sie auf den Bildschirm.
 */

export const W = 360;
export const H = 560;

export type EnemyKind = 'drone' | 'saucer' | 'gunner';
export type PowerKind = 'double' | 'shield' | 'life';

export interface Enemy { kind: EnemyKind; x: number; y: number; baseX: number; vy: number; hp: number; t: number; cool: number }
export interface Shot { x: number; y: number; vx: number; vy: number; enemy: boolean }
export interface Power { kind: PowerKind; x: number; y: number }
export interface Spark { x: number; y: number; vx: number; vy: number; life: number; color: string }
export interface Star { x: number; y: number; z: number }

export interface Game {
  player: { x: number; y: number; cool: number; inv: number; shield: boolean; double: number };
  enemies: Enemy[];
  shots: Shot[];
  powers: Power[];
  sparks: Spark[];
  stars: Star[];
  score: number;
  lives: number;
  level: number;
  time: number;
  spawn: number;
  over: boolean;
  rng: () => number;
}

/** Eingabe pro Bild: Richtung (−1..1) oder ein Ziel (Finger, Maus), dazu Feuer */
export interface Input { dx: number; dy: number; fire: boolean; target: { x: number; y: number } | null }

export type GameEvent = 'shoot' | 'boom' | 'hit' | 'power' | 'level' | 'over';

export const ENEMY: Record<EnemyKind, { r: number; hp: number; points: number }> = {
  drone: { r: 12, hp: 1, points: 10 },
  saucer: { r: 14, hp: 2, points: 25 },
  gunner: { r: 16, hp: 4, points: 50 },
};
const PLAYER_R = 11;
const PLAYER_SPEED = 250;
const MAX_LIVES = 5;

/** Kleiner, vorhersagbarer Zufallsgenerator (für Tests mit festem Startwert) */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newGame(rng: () => number = Math.random): Game {
  return {
    player: { x: W / 2, y: H - 70, cool: 0, inv: 1.2, shield: false, double: 0 },
    enemies: [], shots: [], powers: [], sparks: [],
    stars: Array.from({ length: 70 }, () => ({ x: rng() * W, y: rng() * H, z: 0.3 + rng() * 0.7 })),
    score: 0, lives: 3, level: 1, time: 0, spawn: 1, over: false, rng,
  };
}

const hitTest = (ax: number, ay: number, ar: number, bx: number, by: number, br: number) => (ax - bx) ** 2 + (ay - by) ** 2 < (ar + br) ** 2;

function spawnEnemy(g: Game): void {
  const r = g.rng();
  const kind: EnemyKind = g.level >= 3 && r < 0.18 ? 'gunner' : g.level >= 2 && r < 0.5 ? 'saucer' : 'drone';
  const x = 24 + g.rng() * (W - 48);
  const speed = kind === 'drone' ? 80 + g.rng() * 40 : kind === 'saucer' ? 60 : 50;
  g.enemies.push({ kind, x, y: -20, baseX: x, vy: speed + g.level * 7, hp: ENEMY[kind].hp, t: 0, cool: 1.2 });
}

function burst(g: Game, x: number, y: number, color: string, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = g.rng() * Math.PI * 2;
    const v = 40 + g.rng() * 160;
    g.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + g.rng() * 0.5, color });
  }
}

function hurtPlayer(g: Game, events: GameEvent[]): void {
  const p = g.player;
  if (p.inv > 0 || g.over) return;
  burst(g, p.x, p.y, '#00e5ff', 18);
  if (p.shield) { p.shield = false; p.inv = 1; events.push('hit'); return; }
  g.lives -= 1;
  p.inv = 2;
  p.double = 0;
  events.push('hit');
  if (g.lives <= 0) { g.over = true; events.push('over'); }
}

/** Ein Zeitschritt (dt in Sekunden, höchstens 0.05). Liefert, was passiert ist (für Töne und Anzeige). */
export function step(g: Game, dt: number, input: Input): GameEvent[] {
  const events: GameEvent[] = [];
  dt = Math.min(dt, 0.05);
  for (const s of g.stars) { s.y += (20 + s.z * 70) * dt; if (s.y > H) { s.y -= H; s.x = g.rng() * W; } }
  for (const s of g.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
  g.sparks = g.sparks.filter((s) => s.life > 0);
  if (g.over) return events;
  g.time += dt;
  const p = g.player;

  // Bewegung: Tasten oder Ziel
  if (input.target) {
    const dx = input.target.x - p.x;
    const dy = input.target.y - p.y;
    const d = Math.hypot(dx, dy);
    const max = 460 * dt;
    if (d > 0.5) { const k = Math.min(1, max / d); p.x += dx * k; p.y += dy * k; }
  } else {
    const len = Math.hypot(input.dx, input.dy) || 1;
    p.x += (input.dx / Math.max(1, len)) * PLAYER_SPEED * dt;
    p.y += (input.dy / Math.max(1, len)) * PLAYER_SPEED * dt;
  }
  p.x = Math.min(W - 14, Math.max(14, p.x));
  p.y = Math.min(H - 20, Math.max(40, p.y));
  p.inv = Math.max(0, p.inv - dt);
  p.double = Math.max(0, p.double - dt);

  // Schiessen
  p.cool -= dt;
  if (input.fire && p.cool <= 0) {
    p.cool = 0.17;
    if (p.double > 0) {
      g.shots.push({ x: p.x - 8, y: p.y - 12, vx: -20, vy: -540, enemy: false }, { x: p.x + 8, y: p.y - 12, vx: 20, vy: -540, enemy: false });
    } else {
      g.shots.push({ x: p.x, y: p.y - 14, vx: 0, vy: -540, enemy: false });
    }
    events.push('shoot');
  }

  // Gegner erscheinen, schneller mit jeder Stufe
  g.spawn -= dt;
  if (g.spawn <= 0) {
    spawnEnemy(g);
    g.spawn = Math.max(0.32, 1.15 - g.level * 0.09) * (0.7 + g.rng() * 0.6);
  }

  for (const e of g.enemies) {
    e.t += dt;
    if (e.kind === 'saucer') { e.y += e.vy * dt; e.x = e.baseX + Math.sin(e.t * 2.4) * 54; }
    else if (e.kind === 'gunner') {
      // fliegt ein, bleibt eine Weile oben und schiesst gezielt, dann zieht er ab
      if (e.y < 120 || e.t > 9) e.y += e.vy * dt;
      e.x = e.baseX + Math.sin(e.t * 0.9) * 70;
      e.cool -= dt;
      if (e.cool <= 0 && e.y > 0 && e.y < H - 160) {
        e.cool = Math.max(0.8, 1.7 - g.level * 0.08);
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        g.shots.push({ x: e.x, y: e.y + 12, vx: (dx / d) * 190, vy: (dy / d) * 190, enemy: true });
      }
    } else e.y += e.vy * dt;
    e.x = Math.min(W - 12, Math.max(12, e.x));
  }

  for (const s of g.shots) { s.x += s.vx * dt; s.y += s.vy * dt; }
  for (const pw of g.powers) pw.y += 80 * dt;

  // Treffer: Schüsse gegen Gegner
  for (const s of g.shots) {
    if (s.enemy || s.y < -20) continue;
    for (const e of g.enemies) {
      if (e.hp <= 0 || !hitTest(s.x, s.y, 3, e.x, e.y, ENEMY[e.kind].r)) continue;
      burst(g, s.x, s.y, '#ffffff', 3);
      s.y = -999;
      e.hp -= 1;
      if (e.hp <= 0) {
        g.score += ENEMY[e.kind].points;
        burst(g, e.x, e.y, e.kind === 'drone' ? '#ff4081' : e.kind === 'saucer' ? '#d500f9' : '#ffab00', 22);
        events.push('boom');
        if (g.rng() < (e.kind === 'drone' ? 0.06 : 0.16)) {
          const r = g.rng();
          const kind: PowerKind = r < 0.5 ? 'double' : r < 0.85 || g.lives >= MAX_LIVES ? 'shield' : 'life';
          g.powers.push({ kind, x: e.x, y: e.y });
        }
      }
      break;
    }
  }

  // Treffer gegen den Spieler: feindliche Schüsse und Zusammenstösse
  for (const s of g.shots) {
    if (s.enemy && hitTest(s.x, s.y, 4, p.x, p.y, PLAYER_R)) { s.y = H + 999; hurtPlayer(g, events); }
  }
  for (const e of g.enemies) {
    if (e.hp > 0 && hitTest(e.x, e.y, ENEMY[e.kind].r, p.x, p.y, PLAYER_R)) {
      e.hp = 0;
      burst(g, e.x, e.y, '#ff4081', 16);
      hurtPlayer(g, events);
    }
  }
  // Extras einsammeln
  for (const pw of g.powers) {
    if (!hitTest(pw.x, pw.y, 12, p.x, p.y, PLAYER_R + 4)) continue;
    pw.y = H + 999;
    if (pw.kind === 'double') p.double = 10;
    else if (pw.kind === 'shield') p.shield = true;
    else g.lives = Math.min(MAX_LIVES, g.lives + 1);
    events.push('power');
  }

  g.enemies = g.enemies.filter((e) => e.hp > 0 && e.y < H + 30);
  g.shots = g.shots.filter((s) => s.y > -30 && s.y < H + 30 && s.x > -30 && s.x < W + 30);
  g.powers = g.powers.filter((pw) => pw.y < H + 20);

  const level = 1 + Math.floor(g.score / 400);
  if (level > g.level) { g.level = level; events.push('level'); }
  return events;
}

/* ---------- Zeichnen ---------- */

const POWER_STYLE: Record<PowerKind, [string, string]> = { double: ['#00e5ff', '2×'], shield: ['#69f0ae', 'S'], life: ['#ff4081', '+'] };

function ship(ctx: CanvasRenderingContext2D, g: Game): void {
  const p = g.player;
  if (p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  // Triebwerk flackert
  const flame = 8 + Math.sin(g.time * 40) * 3;
  ctx.fillStyle = '#ffab00';
  ctx.beginPath(); ctx.moveTo(-5, 10); ctx.lineTo(0, 10 + flame); ctx.lineTo(5, 10); ctx.fill();
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#e6fdff';
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -16); ctx.lineTo(6, -4); ctx.lineTo(15, 8); ctx.lineTo(6, 6); ctx.lineTo(4, 11); ctx.lineTo(-4, 11); ctx.lineTo(-6, 6); ctx.lineTo(-15, 8); ctx.lineTo(-6, -4);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#00b8d4';
  ctx.beginPath(); ctx.ellipse(0, -3, 2.6, 5, 0, 0, Math.PI * 2); ctx.fill();
  if (p.shield) {
    ctx.strokeStyle = 'rgba(105, 240, 174, 0.85)';
    ctx.shadowColor = '#69f0ae';
    ctx.beginPath(); ctx.arc(0, 0, 21 + Math.sin(g.time * 6) * 1.5, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function enemy(ctx: CanvasRenderingContext2D, e: Enemy, time: number): void {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.lineWidth = 2;
  if (e.kind === 'drone') {
    ctx.shadowColor = '#ff4081'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#3a0a1f'; ctx.strokeStyle = '#ff4081';
    ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(12, -8); ctx.lineTo(0, -3); ctx.lineTo(-12, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff80ab'; ctx.beginPath(); ctx.arc(0, 1, 2.5, 0, Math.PI * 2); ctx.fill();
  } else if (e.kind === 'saucer') {
    ctx.shadowColor = '#d500f9'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#2a0838'; ctx.strokeStyle = '#ea80fc';
    ctx.beginPath(); ctx.ellipse(0, 2, 15, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(234, 128, 252, 0.5)';
    ctx.beginPath(); ctx.ellipse(0, -2, 7, 6, 0, Math.PI, 0); ctx.fill();
    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = Math.floor(time * 6 + i) % 2 ? '#ffffff' : '#ea80fc';
      ctx.beginPath(); ctx.arc(i * 8, 3, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    ctx.shadowColor = '#ffab00'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#2e1c00'; ctx.strokeStyle = '#ffab00';
    ctx.beginPath(); ctx.moveTo(-16, -8); ctx.lineTo(16, -8); ctx.lineTo(10, 8); ctx.lineTo(4, 14); ctx.lineTo(-4, 14); ctx.lineTo(-10, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd740';
    ctx.fillRect(-2, 6, 4, 9);
    // Lebensbalken
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'; ctx.fillRect(-14, -15, 28, 3);
    ctx.fillStyle = '#ffab00'; ctx.fillRect(-14, -15, 28 * (e.hp / ENEMY.gunner.hp), 3);
  }
  ctx.restore();
}

export function draw(ctx: CanvasRenderingContext2D, g: Game): void {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#05060f');
  bg.addColorStop(1, '#0b1030');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  for (const s of g.stars) {
    ctx.fillStyle = `rgba(200, 230, 255, ${0.25 + s.z * 0.6})`;
    ctx.fillRect(s.x, s.y, s.z * 2, s.z * 2 + (s.z > 0.8 ? 2 : 0));
  }
  for (const pw of g.powers) {
    const [c, label] = POWER_STYLE[pw.kind];
    ctx.save();
    ctx.shadowColor = c; ctx.shadowBlur = 12;
    ctx.strokeStyle = c; ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(5, 6, 15, 0.8)';
    ctx.beginPath(); ctx.arc(pw.x, pw.y, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c; ctx.font = '700 10px Orbitron, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, pw.x, pw.y + 0.5);
    ctx.restore();
  }
  for (const e of g.enemies) enemy(ctx, e, g.time);
  ctx.save();
  for (const s of g.shots) {
    ctx.shadowBlur = 8;
    if (s.enemy) {
      ctx.shadowColor = '#ff4081'; ctx.fillStyle = '#ff80ab';
      ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.shadowColor = '#00e5ff'; ctx.fillStyle = '#e6fdff';
      ctx.fillRect(s.x - 1.5, s.y - 8, 3, 14);
    }
  }
  ctx.restore();
  for (const s of g.sparks) {
    ctx.globalAlpha = Math.max(0, Math.min(1, s.life * 2));
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;
  if (!g.over) ship(ctx, g);
}
