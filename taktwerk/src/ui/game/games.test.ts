import { describe, expect, it } from 'vitest';
import { createForest, HOUSE, POINTS, stepForest } from './forest';
import { createHummel, makeWasp, stepHummel } from './hummel';
import { centerAt, createRace, halfWidth, stepRace } from './racer';
import { NO_INPUT, seeded } from './types';

describe('Hummelflug', () => {
  it('sammelt Nektar aus einer Blüte und gibt nach 10 Blüten einen Honigtopf', () => {
    const g = createHummel(seeded(3));
    g.flowers = [];
    g.next.flower = 999; g.next.wasp = 999;
    g.nectar = 9;
    g.flowers.push({ x: g.bee.x, y: g.bee.y, r: 12, color: '#fff', nectar: 1, petals: 5, spin: 0, kind: 'blume', sip: 0 });
    const events = stepHummel(g, 0.01, NO_INPUT);
    expect(events).toContain('nectar');
    expect(events).toContain('honey');
    expect(g.score).toBe(60);
  });

  it('besiegt eine Wespe nur mit dem Stachel, sonst kostet sie ein Leben', () => {
    const g = createHummel(seeded(4));
    g.flowers = []; g.next.flower = 999; g.next.wasp = 999; g.bee.inv = 0;
    g.wasps.push(makeWasp(g.rng, g.bee.x, g.bee.y - 14, 'jaeger'));
    expect(stepHummel(g, 0.01, { ...NO_INPUT, press: true })).toContain('kill');
    expect(g.score).toBe(30);
    expect(g.lives).toBe(3);
    g.bee.sting = 0; g.bee.inv = 0;
    g.wasps.push(makeWasp(g.rng, g.bee.x, g.bee.y, 'jaeger'));
    expect(stepHummel(g, 0.01, NO_INPUT)).toContain('hit');
    expect(g.lives).toBe(2);
  });

  it('verteilt die Wespen, statt sie an einem Ort zu stapeln', () => {
    const g = createHummel(seeded(11));
    g.flowers = []; g.next.flower = 999; g.next.wasp = 999; g.bee.inv = 999;
    for (let i = 0; i < 6; i++) g.wasps.push(makeWasp(g.rng, 180, 120, 'jaeger'));
    for (let i = 0; i < 80; i++) stepHummel(g, 0.05, NO_INPUT);
    expect(g.wasps.length).toBe(6);
    let min = Infinity;
    for (const a of g.wasps) for (const b of g.wasps) if (a !== b) min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y));
    expect(min).toBeGreaterThan(14);
  });

  it('Tautropfen fängt einen Stich ab, Gelée royale sticht von selbst', () => {
    const g = createHummel(seeded(12));
    g.flowers = []; g.next.flower = 999; g.next.wasp = 999; g.bee.inv = 0;
    g.bee.shield = true;
    g.wasps.push(makeWasp(g.rng, g.bee.x, g.bee.y, 'jaeger'));
    expect(stepHummel(g, 0.01, NO_INPUT)).toContain('shield');
    expect(g.lives).toBe(3);
    expect(g.bee.shield).toBe(false);
    g.wasps = []; g.bee.inv = 0; g.bee.royal = 5;
    g.wasps.push(makeWasp(g.rng, g.bee.x, g.bee.y, 'jaeger', true));
    expect(stepHummel(g, 0.01, NO_INPUT)).toContain('kill');
    expect(g.lives).toBe(3);
  });

  it('Sonnenblume gibt dreimal Nektar', () => {
    const g = createHummel(seeded(13));
    g.flowers = []; g.next.flower = 999; g.next.wasp = 999;
    const f = { x: g.bee.x, y: g.bee.y, r: 22, color: '#ffc300', nectar: 3, petals: 16, spin: 0, kind: 'sonne' as const, sip: 0 };
    g.flowers.push(f);
    for (let i = 0; i < 24; i++) stepHummel(g, 0.05, { ...NO_INPUT, target: { x: f.x, y: f.y } });
    expect(f.nectar).toBe(0);
    expect(g.nectar).toBe(3);
    expect(g.score).toBe(45);
  });

  it('Hornissennest erscheint ab 900 Punkten und fällt nach genug Stichen', () => {
    const g = createHummel(seeded(14));
    g.flowers = []; g.next.flower = 999; g.next.wasp = 999; g.next.power = 999; g.next.web = 999; g.next.bird = 999; g.next.fly = 999;
    g.score = 900;
    expect(stepHummel(g, 0.01, NO_INPUT)).toContain('boss');
    const nest = g.nest!;
    nest.y = 80;
    const events: string[] = [];
    for (let i = 0; i < 40 && g.nest; i++) {
      g.bee.x = nest.x; g.bee.y = nest.y + 22; g.bee.cool = 0; g.bee.inv = 99;
      events.push(...stepHummel(g, 0.01, { ...NO_INPUT, press: true }));
      g.bee.y = 400;
      for (let k = 0; k < 7; k++) stepHummel(g, 0.05, NO_INPUT);
    }
    expect(events).toContain('nesthit');
    expect(events).toContain('nestdown');
    expect(g.nest).toBeNull();
    expect(g.lives).toBe(4);
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

describe('Geschenkejagd', () => {
  it('fängt Geschenke im Sack, Kohle und verpasste Geschenke kosten Leben', async () => {
    const { createGifts, stepGifts } = await import('./gifts');
    const g = createGifts(seeded(11));
    g.spawn = 999; g.nextSleigh = 999;
    const base = { kind: 'gift' as const, vx: 0, vy: 0, size: 16, color: '#c8102e', ribbon: '#ffd166', spin: 0, rot: 0 };
    g.items.push({ ...base, x: g.elf.x, y: 560 - 64 - 52 });
    expect(stepGifts(g, 0.01, NO_INPUT)).toContain('catch');
    expect(g.score).toBe(10);
    g.items.push({ ...base, kind: 'coal', x: g.elf.x, y: 560 - 64 - 52 });
    expect(stepGifts(g, 0.01, NO_INPUT)).toContain('miss');
    expect(g.lives).toBe(2);
    g.elf.inv = 0;
    g.items.push({ ...base, x: 20, y: 560 - 10 });
    stepGifts(g, 0.01, NO_INPUT);
    expect(g.lives).toBe(1);
  });
});

describe('Kürbismann', () => {
  it('bannt den Kürbismann beim Antippen, zu langsam kostet ein Leben', async () => {
    const { createPumpkin, monsterBox, stepPumpkin } = await import('./pumpkin');
    const g = createPumpkin(seeded(12));
    g.monster.cool = 0;
    expect(stepPumpkin(g, 0.01, NO_INPUT)).toContain('appear');
    const b = monsterBox(g.monster);
    const events = stepPumpkin(g, 0.2, { ...NO_INPUT, taps: [{ x: b.x, y: (b.top + b.bottom) / 2 }] });
    expect(events).toContain('banish');
    expect(g.score).toBeGreaterThan(100);
    expect(g.banished).toBe(1);
    for (let i = 0; i < 400 && g.monster.state !== 'appear'; i++) stepPumpkin(g, 0.05, NO_INPUT);
    const lives = g.lives;
    let lunged = false;
    for (let i = 0; i < 100 && !lunged; i++) lunged = stepPumpkin(g, 0.05, NO_INPUT).includes('lunge');
    expect(lunged).toBe(true);
    expect(g.lives).toBe(lives - 1);
  });
});
