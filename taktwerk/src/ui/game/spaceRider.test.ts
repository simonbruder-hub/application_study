import { describe, expect, it } from 'vitest';
import { type Game, H, type Input, newGame, seeded, step, W } from './spaceRider';

const idle: Input = { dx: 0, dy: 0, fire: false, target: null };
/** Spiel ohne zufällige Gegner: der Spawn-Zähler steht weit in der Zukunft */
const quiet = (): Game => { const g = newGame(seeded(1)); g.spawn = 999; g.player.inv = 0; return g; };

describe('Space Rider', () => {
  it('bewegt das Schiff mit den Tasten und bleibt im Spielfeld', () => {
    const g = quiet();
    const x0 = g.player.x;
    step(g, 0.05, { ...idle, dx: 1 });
    expect(g.player.x).toBeGreaterThan(x0);
    for (let i = 0; i < 200; i++) step(g, 0.05, { ...idle, dx: -1, dy: -1 });
    expect(g.player.x).toBeGreaterThanOrEqual(14);
    expect(g.player.y).toBeGreaterThanOrEqual(40);
  });

  it('folgt einem Ziel (Finger oder Maus)', () => {
    const g = quiet();
    for (let i = 0; i < 40; i++) step(g, 0.05, { ...idle, target: { x: 60, y: 200 } });
    expect(g.player.x).toBeCloseTo(60, 0);
    expect(g.player.y).toBeCloseTo(200, 0);
  });

  it('schiesst einen Gegner ab und zählt die Punkte', () => {
    const g = quiet();
    g.enemies.push({ kind: 'drone', x: g.player.x, y: g.player.y - 80, baseX: g.player.x, vy: 0, hp: 1, t: 0, cool: 9 });
    const events = [];
    for (let i = 0; i < 20 && g.score === 0; i++) events.push(...step(g, 0.02, { ...idle, fire: true }));
    expect(g.score).toBe(10);
    expect(events).toContain('shoot');
    expect(events).toContain('boom');
    expect(g.enemies).toHaveLength(0);
  });

  it('verliert ein Leben bei Zusammenstoss, der Schild fängt einen Treffer ab', () => {
    const g = quiet();
    g.player.shield = true;
    g.enemies.push({ kind: 'drone', x: g.player.x, y: g.player.y, baseX: g.player.x, vy: 0, hp: 1, t: 0, cool: 9 });
    expect(step(g, 0.01, idle)).toContain('hit');
    expect(g.lives).toBe(3);
    expect(g.player.shield).toBe(false);
    g.player.inv = 0;
    g.enemies.push({ kind: 'drone', x: g.player.x, y: g.player.y, baseX: g.player.x, vy: 0, hp: 1, t: 0, cool: 9 });
    step(g, 0.01, idle);
    expect(g.lives).toBe(2);
  });

  it('ist vorbei, wenn das letzte Leben weg ist', () => {
    const g = quiet();
    g.lives = 1;
    g.shots.push({ x: g.player.x, y: g.player.y, vx: 0, vy: 0, enemy: true });
    expect(step(g, 0.01, idle)).toContain('over');
    expect(g.over).toBe(true);
    const score = g.score;
    step(g, 0.05, { ...idle, fire: true });
    expect(g.score).toBe(score);
  });

  it('steigt mit den Punkten eine Stufe auf und sammelt Extras', () => {
    const g = quiet();
    g.score = 395;
    g.enemies.push({ kind: 'drone', x: g.player.x, y: g.player.y - 60, baseX: g.player.x, vy: 0, hp: 1, t: 0, cool: 9 });
    const events = [];
    for (let i = 0; i < 20 && g.level === 1; i++) events.push(...step(g, 0.02, { ...idle, fire: true }));
    expect(g.level).toBe(2);
    expect(events).toContain('level');
    g.powers.push({ kind: 'double', x: g.player.x, y: g.player.y }, { kind: 'life', x: g.player.x, y: g.player.y });
    expect(step(g, 0.01, idle)).toContain('power');
    expect(g.player.double).toBeGreaterThan(0);
    expect(g.lives).toBe(4);
  });

  it('lässt laufend Gegner erscheinen, die das Feld wieder verlassen', () => {
    const g = newGame(seeded(7));
    for (let i = 0; i < 100; i++) step(g, 0.05, idle);
    expect(g.enemies.length).toBeGreaterThan(0);
    expect(g.enemies.every((e) => e.x >= 0 && e.x <= W && e.y < H + 30)).toBe(true);
  });
});
