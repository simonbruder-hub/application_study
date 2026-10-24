/**
 * Space Rider: kleines Weltraum-Spiel für die Pausen im Stil Sci-Fi. Hier stehen Spielregeln und Zeichnen,
 * ohne DOM. Die Spielwelt ist immer 360 × 560 Einheiten gross; die Ansicht skaliert sie auf den Bildschirm.
 * Ab bestimmten Punkteständen greift ein Mutterschiff (Boss) an.
 */
import { burst as burstInto, drawBanner, drawFloats, type Engine, type Float, hitTest, type Input, moveFloats, type Spark } from './types';

export type { Input } from './types';
export const W = 360;
export const H = 560;

export type EnemyKind = 'drone' | 'saucer' | 'gunner';
export type PowerKind = 'double' | 'shield' | 'life';

export interface Enemy { kind: EnemyKind; x: number; y: number; baseX: number; vy: number; hp: number; t: number; cool: number }
export interface Shot { x: number; y: number; vx: number; vy: number; enemy: boolean }
export interface Power { kind: PowerKind; x: number; y: number }
export interface Star { x: number; y: number; z: number }
export interface Boss { x: number; y: number; hp: number; max: number; t: number; cool: number; shots: number }

export interface Game {
  player: { x: number; y: number; cool: number; inv: number; shield: boolean; double: number };
  enemies: Enemy[];
  shots: Shot[];
  powers: Power[];
  sparks: Spark[];
  stars: Star[];
  floats: Float[];
  boss: Boss | null;
  /** Punktestand, ab dem das nächste Mutterschiff kommt */
  nextBoss: number;
  bosses: number;
  banner: { text: string; color: string; t: number } | null;
  score: number;
  lives: number;
  level: number;
  time: number;
  spawn: number;
  over: boolean;
  rng: () => number;
}

export type GameEvent = 'shoot' | 'boom' | 'hit' | 'power' | 'level' | 'boss' | 'bossdown' | 'over';

export const ENEMY: Record<EnemyKind, { r: number; hp: number; points: number }> = {
  drone: { r: 12, hp: 1, points: 10 },
  saucer: { r: 14, hp: 2, points: 25 },
  gunner: { r: 16, hp: 4, points: 50 },
};
const PLAYER_R = 11;
const PLAYER_SPEED = 250;
const MAX_LIVES = 5;

export function newGame(rng: () => number = Math.random): Game {
  return {
    player: { x: W / 2, y: H - 70, cool: 0, inv: 1.2, shield: false, double: 0 },
    enemies: [], shots: [], powers: [], sparks: [],
    stars: Array.from({ length: 70 }, () => ({ x: rng() * W, y: rng() * H, z: 0.3 + rng() * 0.7 })),
    floats: [], boss: null, nextBoss: 600, bosses: 0, banner: null,
    score: 0, lives: 3, level: 1, time: 0, spawn: 1, over: false, rng,
  };
}

function spawnEnemy(g: Game): void {
  const r = g.rng();
  const kind: EnemyKind = g.level >= 3 && r < 0.18 ? 'gunner' : g.level >= 2 && r < 0.5 ? 'saucer' : 'drone';
  const x = 24 + g.rng() * (W - 48);
  const speed = kind === 'drone' ? 80 + g.rng() * 40 : kind === 'saucer' ? 60 : 50;
  g.enemies.push({ kind, x, y: -20, baseX: x, vy: speed + g.level * 7, hp: ENEMY[kind].hp, t: 0, cool: 1.2 });
}

const burst = (g: Game, x: number, y: number, color: string, n: number) => burstInto(g.sparks, g.rng, x, y, color, n);

/** Mutterschiff: fliegt ein, pendelt oben hin und her, schiesst Fächer und gezielte Salven */
function bossStep(g: Game, b: Boss, dt: number, events: GameEvent[]): void {
  const p = g.player;
  b.t += dt;
  if (b.y < 96) b.y += 50 * dt;
  else b.x = W / 2 + Math.sin(b.t * 0.7) * 110;
  b.cool -= dt;
  if (b.cool <= 0 && b.y >= 60) {
    const angry = b.hp < b.max / 2;
    b.shots += 1;
    if (b.shots % 3 === 0) {
      // gezielte Salve aus beiden Kanonen
      for (const ox of [-34, 34]) {
        const dx = p.x - (b.x + ox);
        const dy = p.y - (b.y + 18);
        const d = Math.hypot(dx, dy) || 1;
        g.shots.push({ x: b.x + ox, y: b.y + 18, vx: (dx / d) * 210, vy: (dy / d) * 210, enemy: true });
      }
    } else {
      // Fächer nach unten
      const n = angry ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 + ((i - (n - 1) / 2) * Math.PI) / (angry ? 10 : 8);
        g.shots.push({ x: b.x, y: b.y + 22, vx: Math.cos(a) * 165, vy: Math.sin(a) * 165, enemy: true });
      }
    }
    b.cool = (angry ? 0.75 : 1.1) - Math.min(0.3, g.bosses * 0.08);
  }
  // Treffer am Rumpf
  for (const s of g.shots) {
    if (s.enemy || s.y < -20 || Math.abs(s.x - b.x) > 54 || Math.abs(s.y - b.y) > 24) continue;
    burst(g, s.x, s.y, '#ffffff', 2);
    s.y = -999;
    b.hp -= 1;
  }
  if (Math.abs(p.x - b.x) < 60 && Math.abs(p.y - b.y) < 30) hurtPlayer(g, events);
  if (b.hp > 0) return;
  const points = 500 + g.bosses * 250;
  g.score += points;
  g.floats.push({ x: b.x, y: b.y, text: `+${points}`, color: '#ffd740', life: 1.6 });
  for (const [ox, c] of [[-40, '#ffab00'], [0, '#ff4081'], [40, '#00e5ff']] as const) burst(g, b.x + ox, b.y, c, 34);
  g.powers.push({ kind: 'double', x: b.x - 20, y: b.y }, { kind: g.lives < 5 ? 'life' : 'shield', x: b.x + 20, y: b.y });
  g.boss = null;
  g.bosses += 1;
  g.nextBoss = g.score + 1500;
  g.banner = { text: 'Mutterschiff zerstört', color: '#69f0ae', t: 2.2 };
  events.push('bossdown');
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
  g.floats = moveFloats(g.floats, dt);
  if (g.banner) { g.banner.t -= dt; if (g.banner.t <= 0) g.banner = null; }
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

  // Mutterschiff ab bestimmten Punkteständen
  if (!g.boss && g.score >= g.nextBoss) {
    const max = 40 + g.bosses * 25;
    g.boss = { x: W / 2, y: -70, hp: max, max, t: 0, cool: 2, shots: 0 };
    g.banner = { text: 'Warnung: Mutterschiff', color: '#ff4081', t: 2.6 };
    events.push('boss');
  }

  // Gegner erscheinen, schneller mit jeder Stufe; während des Bosskampfs nur vereinzelte Drohnen
  g.spawn -= dt;
  if (g.spawn <= 0) {
    if (g.boss) { g.enemies.push({ kind: 'drone', x: 24 + g.rng() * (W - 48), y: -20, baseX: 0, vy: 110, hp: 1, t: 0, cool: 9 }); g.spawn = 2.4; }
    else {
      spawnEnemy(g);
      g.spawn = Math.max(0.32, 1.15 - g.level * 0.09) * (0.7 + g.rng() * 0.6);
    }
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
  if (g.boss) bossStep(g, g.boss, dt, events);

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
        if (e.kind !== 'drone') g.floats.push({ x: e.x, y: e.y, text: `+${ENEMY[e.kind].points}`, color: '#ffffff', life: 0.9 });
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

function drawBoss(ctx: CanvasRenderingContext2D, b: Boss, time: number): void {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.shadowColor = '#ff4081';
  ctx.shadowBlur = 18;
  ctx.lineWidth = 2.5;
  ctx.fillStyle = '#1c0716';
  ctx.strokeStyle = '#ff4081';
  ctx.beginPath();
  ctx.moveTo(-58, 0); ctx.lineTo(-40, -16); ctx.lineTo(40, -16); ctx.lineTo(58, 0); ctx.lineTo(44, 14); ctx.lineTo(18, 22); ctx.lineTo(-18, 22); ctx.lineTo(-44, 14);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Kuppel und Kanonen
  ctx.fillStyle = 'rgba(255, 128, 171, 0.45)';
  ctx.beginPath(); ctx.ellipse(0, -16, 20, 14, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ff4081';
  for (const ox of [-34, 34]) ctx.fillRect(ox - 3, 12, 6, 10);
  // Lichterkette
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = Math.floor(time * 5 + i) % 3 === 0 ? '#ffffff' : '#ff80ab';
    ctx.beginPath(); ctx.arc(-36 + i * 12, 2, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // Lebensbalken oben
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fillRect(40, 14, W - 80, 7);
  ctx.fillStyle = b.hp < b.max / 2 ? '#ffab00' : '#ff4081';
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 8;
  ctx.fillRect(40, 14, (W - 80) * Math.max(0, b.hp / b.max), 7);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffd6e4';
  ctx.font = '700 9px Orbitron, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MUTTERSCHIFF', W / 2, 33);
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
  if (g.boss) drawBoss(ctx, g.boss, g.time);
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
  drawFloats(ctx, g.floats, '700 13px Orbitron, system-ui, sans-serif');
  if (g.banner) drawBanner(ctx, W, H * 0.42, g.banner.text.toUpperCase(), g.banner.color, Math.min(1, g.banner.t * 2), '800 17px Orbitron, system-ui, sans-serif');
}

export const spaceRider: Engine<Game> = {
  W, H,
  create: newGame,
  step: (g, dt, input) => step(g, dt, input),
  draw,
  hud: (g) => [
    { label: 'Punkte', value: String(g.score) },
    { label: 'Stufe', value: String(g.level) },
    { label: 'Leben', value: '♥'.repeat(Math.max(0, g.lives)) || '–', tone: 'b' },
    ...(g.player.double > 0 || g.player.shield ? [{ label: 'Extra', value: [g.player.double > 0 && '2×', g.player.shield && 'Schild'].filter(Boolean).join(' '), tone: 'c' as const }] : []),
  ],
  score: (g) => g.score,
  over: (g) => g.over,
  tones: {
    shoot: ['square', 900, 420, 0.05, 0.012],
    boom: ['sawtooth', 180, 40, 0.28, 0.05],
    hit: ['triangle', 240, 60, 0.4, 0.09],
    power: ['sine', 520, 1300, 0.22, 0.06],
    level: ['sine', 660, 1320, 0.4, 0.06],
    boss: ['sawtooth', 110, 220, 0.9, 0.06],
    bossdown: ['sawtooth', 300, 30, 1.2, 0.08],
    over: ['triangle', 330, 70, 0.9, 0.08],
  },
};
