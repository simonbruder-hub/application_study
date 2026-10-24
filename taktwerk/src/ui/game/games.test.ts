import { describe, expect, it } from 'vitest';
import { createForest, HOUSE, POINTS, stepForest } from './forest';
import { createHummel, stepHummel } from './hummel';
import { centerAt, createRace, halfWidth, stepRace } from './racer';
import { NO_INPUT, seeded } from './types';

describe('Hummelflug', () => {
  it('sammelt Nektar aus einer Blüte und gibt nach 10 Blüten einen Honigtopf', () => {
    const g = createHummel(seeded(3));
    g.flowers = [];
    g.next.flower = 999; g.next.wasp = 999;
    g.nectar = 9;
    g.flowers.push({ x: g.bee.x, y: g.bee.y, r: 12, color: '#fff', nectar: true, petals: 5, spin: 0 });
    const events = stepHummel(g, 0.01, NO_INPUT);
    expect(events).toContain('nectar');
    expect(events).toContain('honey');
    expect(g.score).toBe(60);
  });

  it('besiegt eine Wespe nur mit dem Stachel, sonst kostet sie ein Leben', () => {
    const g = createHummel(seeded(4));
    g.flowers = []; g.next.flower = 999; g.next.wasp = 999; g.bee.inv = 0;
    g.wasps.push({ x: g.bee.x, y: g.bee.y - 14, hp: 1, big: false, t: 0, vx: 0, vy: 0 });
    expect(stepHummel(g, 0.01, { ...NO_INPUT, press: true })).toContain('kill');
    expect(g.score).toBe(30);
    expect(g.lives).toBe(3);
    g.bee.sting = 0; g.bee.inv = 0;
    g.wasps.push({ x: g.bee.x, y: g.bee.y, hp: 1, big: false, t: 0, vx: 0, vy: 0 });
    expect(stepHummel(g, 0.01, NO_INPUT)).toContain('hit');
    expect(g.lives).toBe(2);
  });
});

describe('Grand Prix', () => {
  it('fährt von selbst los und zählt Punkte für die Strecke', () => {
    const g = createRace(seeded(5));
    g.next.rival = 999; g.next.pad = 999;
    for (let i = 0; i < 100; i++) {
      // immer zur Mitte lenken: bleibt auf der Strecke
      stepRace(g, 0.05, { ...NO_INPUT, target: { x: centerAt(g, g.d + 20), y: 0 } });
    }
    expect(g.d).toBeGreaterThan(800);
    expect(g.score).toBeGreaterThan(40);
    expect(g.lives).toBe(3);
  });

  it('fliegt im Kies ab und verliert ein Leben', () => {
    const g = createRace(seeded(6));
    g.next.rival = 999; g.next.pad = 999; g.car.inv = 0;
    g.car.x = centerAt(g, 0) + halfWidth(g) + 60;
    expect(stepRace(g, 0.02, NO_INPUT)).toContain('crash');
    expect(g.lives).toBe(2);
  });
});

describe('Waldjagd', () => {
  it('trifft ein Tier mit einem Zapfen, ein Wanderer kostet Punkte', () => {
    const g = createForest(seeded(7));
    g.next = { squirrel: 999, runner: 999, walker: 999, nope: 999, acorn: 999 };
    g.critters.push({ kind: 'boar', x: 180, y: 505, z: 1, vx: 0, vy: 0, dir: 1, t: 0, stay: 0, state: 'show', peek: 1 });
    expect(stepForest(g, 0.01, { ...NO_INPUT, taps: [{ x: 180, y: 489 }] })).toContain('hit');
    expect(g.score).toBe(POINTS.boar);
    expect(g.ammo).toBe(7);
    g.critters.push({ kind: 'hiker', x: 100, y: 440, z: 0.75, vx: 0, vy: 0, dir: 1, t: 0, stay: 0, state: 'show', peek: 1 });
    expect(stepForest(g, 0.01, { ...NO_INPUT, taps: [{ x: 100, y: 415 }] })).toContain('ouch');
    expect(g.score).toBe(0);
    stepForest(g, 0.01, { ...NO_INPUT, taps: [{ x: HOUSE.x, y: HOUSE.y }] });
    expect(g.ammo).toBe(5);
  });

  it('braucht Nachschub nach 8 Zapfen und endet nach 90 Sekunden', () => {
    const g = createForest(seeded(8));
    g.next = { squirrel: 999, runner: 999, walker: 999, nope: 999, acorn: 999 };
    stepForest(g, 0.01, { ...NO_INPUT, taps: Array.from({ length: 9 }, () => ({ x: 20, y: 60 })) });
    expect(g.ammo).toBe(0);
    stepForest(g, 0.01, { ...NO_INPUT, reload: true });
    for (let i = 0; i < 20; i++) stepForest(g, 0.05, NO_INPUT);
    expect(g.ammo).toBe(8);
    for (let i = 0; i < 2000 && !g.over; i++) stepForest(g, 0.05, NO_INPUT);
    expect(g.over).toBe(true);
  });
});
