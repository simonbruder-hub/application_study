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

describe('Kürbismann: Das richtige Haus', () => {
  it('genau ein Haus passt zum Hinweis, der Start ist frei', async () => {
    const { createHaunt, goalIndex, FIELD } = await import('./pumpkin');
    for (let seed = 1; seed < 30; seed++) {
      const g = createHaunt(seeded(seed));
      const matches = g.houses.filter((h) => h.light === g.target.light && h.mark === g.target.mark);
      expect(matches.length).toBe(1);
      expect(goalIndex(g)).toBeGreaterThanOrEqual(0);
      expect(g.houses.length).toBeGreaterThanOrEqual(4);
      for (const h of g.houses) expect(Math.hypot(h.x, h.z - (FIELD - 3))).toBeGreaterThan(12);
    }
  });

  it('jeder Versuch ordnet den Wald neu an', async () => {
    const { createHaunt } = await import('./pumpkin');
    const a = createHaunt(seeded(5)), b = createHaunt(seeded(6));
    expect(a.houses.map((h) => Math.round(h.x))).not.toEqual(b.houses.map((h) => Math.round(h.x)));
  });

  it('richtiges Haus: Münzen und nächste Stufe; falsches Haus: Schreck und Ende', async () => {
    const { createHaunt, stepHaunt, doorAt, goalIndex } = await import('./pumpkin');
    const g = createHaunt(seeded(7));
    g.monster.wait = 999; g.amulet = 0;
    const goal = g.houses[goalIndex(g)]!;
    const d = doorAt(goal);
    const coins = g.progress.coins;
    g.p.x = d.x; g.p.z = d.z;
    const events: string[] = [];
    for (let i = 0; i < 30; i++) events.push(...stepHaunt(g, 0.05, NO_INPUT));
    expect(events).toContain('found');
    expect(g.level).toBe(2);
    expect(g.found).toBe(1);
    expect(g.progress.coins + (events.includes('upgrade') ? 20 : 0)).toBeGreaterThan(coins);
    // jetzt ein falsches Haus
    g.monster.wait = 999; g.amulet = 0;
    const wrong = g.houses.find((_, i) => i !== goalIndex(g))!;
    const w = doorAt(wrong);
    g.p.x = w.x; g.p.z = w.z;
    const ev2: string[] = [];
    for (let i = 0; i < 80 && !g.over; i++) ev2.push(...stepHaunt(g, 0.05, NO_INPUT));
    expect(ev2).toContain('scare');
    expect(g.over).toBe(true);
  });

  it('das Amulett rettet einmal', async () => {
    const { createHaunt, stepHaunt, doorAt, goalIndex } = await import('./pumpkin');
    const g = createHaunt(seeded(8));
    g.monster.wait = 999; g.amulet = 1;
    const wrong = g.houses.find((_, i) => i !== goalIndex(g))!;
    const w = doorAt(wrong);
    g.p.x = w.x; g.p.z = w.z;
    const events: string[] = [];
    for (let i = 0; i < 30; i++) events.push(...stepHaunt(g, 0.05, NO_INPUT));
    expect(events).toContain('amulet');
    expect(g.over).toBe(false);
    expect(g.amulet).toBe(0);
  });

  it('im Licht der Lampe verschwindet der Kürbismann, sonst holt er einen', async () => {
    const { createHaunt, stepHaunt } = await import('./pumpkin');
    const g = createHaunt(seeded(9));
    g.amulet = 0;
    g.p = { ...g.p, x: 0, z: 0, yaw: 0, look: 0 };
    g.monster = { x: 0, z: 6, lit: 0, active: true, wait: 0, gone: 0 };
    const events: string[] = [];
    for (let i = 0; i < 40; i++) events.push(...stepHaunt(g, 0.05, NO_INPUT));
    expect(events).toContain('banish');
    expect(g.monster.active).toBe(false);
    const h = createHaunt(seeded(10));
    h.amulet = 0;
    h.p = { ...h.p, x: 0, z: 0, yaw: 0, look: 0 };
    h.monster = { x: 0, z: -4, lit: 0, active: true, wait: 0, gone: 0 };
    for (let i = 0; i < 200 && !h.over; i++) stepHaunt(h, 0.05, NO_INPUT);
    expect(h.over).toBe(true);
  });

  it('läuft und dreht sich mit den Pfeiltasten', async () => {
    const { createHaunt, stepHaunt } = await import('./pumpkin');
    const g = createHaunt(seeded(11));
    g.monster.wait = 999;
    const z0 = g.p.z, yaw0 = g.p.yaw;
    for (let i = 0; i < 20; i++) stepHaunt(g, 0.05, { ...NO_INPUT, dy: -1 });
    expect(g.p.z).toBeLessThan(z0 - 1);
    for (let i = 0; i < 10; i++) stepHaunt(g, 0.05, { ...NO_INPUT, dx: 1 });
    expect(g.p.yaw).toBeLessThan(yaw0);
    expect(g.p.look).toBeGreaterThan(0.5);
  });
});

describe('Dschungelschlange', () => {
  it('frisst eine Frucht, wächst und zählt Punkte', async () => {
    const { createSnake, stepSnake, POINTS } = await import('./snake');
    const g = createSnake(seeded(21));
    g.nextGold = 999;
    const head = g.body[0]!;
    g.fruits = [{ x: head.x, y: head.y - 1, kind: 'mango', life: Infinity, move: 0, born: 0 }];
    const len = g.body.length;
    const events: string[] = [];
    for (let i = 0; i < 4; i++) events.push(...stepSnake(g, 0.05, NO_INPUT));
    expect(events).toContain('eat');
    expect(g.score).toBe(POINTS.mango);
    for (let i = 0; i < 6; i++) stepSnake(g, 0.05, NO_INPUT);
    expect(g.body.length).toBe(len + 1);
  });

  it('kann nicht umkehren und verliert an der Wand ein Leben', async () => {
    const { createSnake, stepSnake, steer } = await import('./snake');
    const g = createSnake(seeded(22));
    g.nextGold = 999; g.fruits = [];
    steer(g, { x: 0, y: 1 });
    expect(g.queue.length).toBe(0);
    steer(g, { x: 1, y: 0 });
    let hit = false;
    for (let i = 0; i < 200 && !hit; i++) hit = stepSnake(g, 0.05, NO_INPUT).includes('hit');
    expect(hit).toBe(true);
    expect(g.lives).toBe(2);
    expect(g.inv).toBeGreaterThan(0);
  });

  it('Tiger beisst ein Stück Schwanz ab', async () => {
    const { createSnake, stepSnake } = await import('./snake');
    const g = createSnake(seeded(23));
    g.nextGold = 999; g.fruits = []; g.level = 2;
    g.body = Array.from({ length: 8 }, (_, k) => ({ x: 9, y: 10 + k }));
    g.prev = g.body.map((c) => ({ ...c }));
    g.step = 99;
    g.tiger = { row: 15, x: 9, dir: 1, warn: 0 };
    expect(stepSnake(g, 0.01, NO_INPUT)).toContain('bite');
    // Glied 5 liegt in der Tigerzeile: alles ab dort ist weg
    expect(g.body.length).toBe(5);
    expect(g.lives).toBe(3);
  });
});

describe('Baustellen-Run', () => {
  it('läuft von selbst, sammelt Blitze und zählt Meter', async () => {
    const { createRun, stepRun } = await import('./runner');
    const g = createRun(seeded(31));
    g.obs = []; g.nextZ = 999;
    g.obs.push({ kind: 'bolt', z: 6, lane: 0, y: 0, len: 0.4, hit: false });
    const events: string[] = [];
    for (let i = 0; i < 40; i++) events.push(...stepRun(g, 0.05, NO_INPUT));
    expect(events).toContain('bolt');
    expect(g.bolts).toBe(1);
    expect(g.dist).toBeGreaterThan(15);
  });

  it('Absperrung kostet ein Leben, ausser man springt', async () => {
    const { createRun, stepRun } = await import('./runner');
    const g = createRun(seeded(32));
    g.obs = [{ kind: 'barrier', z: 3, lane: 0, y: 0, len: 0.6, hit: false }]; g.nextZ = 999;
    for (let i = 0; i < 20; i++) stepRun(g, 0.05, NO_INPUT);
    expect(g.lives).toBe(2);
    const h = createRun(seeded(33));
    h.obs = [{ kind: 'barrier', z: 4, lane: 0, y: 0, len: 0.6, hit: false }]; h.nextZ = 999;
    stepRun(h, 0.02, { ...NO_INPUT, dy: -1 });
    for (let i = 0; i < 20; i++) stepRun(h, 0.03, NO_INPUT);
    expect(h.lives).toBe(3);
  });

  it('rutscht unter dem Träger durch und wechselt die Spur', async () => {
    const { createRun, stepRun, LANE_W } = await import('./runner');
    const g = createRun(seeded(34));
    g.obs = [-1, 0, 1].map((lane) => ({ kind: 'beam' as const, z: 4, lane, y: 1.15, len: 0.5, hit: false })); g.nextZ = 999;
    stepRun(g, 0.02, { ...NO_INPUT, dy: 1 });
    for (let i = 0; i < 12; i++) stepRun(g, 0.03, NO_INPUT);
    expect(g.lives).toBe(3);
    stepRun(g, 0.02, { ...NO_INPUT, dx: 1 });
    for (let i = 0; i < 20; i++) stepRun(g, 0.03, NO_INPUT);
    expect(g.lane).toBe(1);
    expect(g.x).toBeCloseTo(LANE_W, 1);
  });

  it('biegt an der Abzweigung ab; verpasst kostet ein Leben', async () => {
    const { createRun, stepRun } = await import('./runner');
    const g = createRun(seeded(35));
    g.obs = []; g.nextZ = 999; g.turn = 1; g.pz = g.segLen - 3;
    const events = stepRun(g, 0.02, { ...NO_INPUT, dx: 1 });
    expect(events).toContain('turn');
    expect(g.pz).toBeLessThan(5);
    expect(g.lives).toBe(3);
    const h = createRun(seeded(36));
    h.obs = []; h.nextZ = 999; h.turn = -1; h.pz = h.segLen - 1;
    for (let i = 0; i < 20; i++) stepRun(h, 0.05, NO_INPUT);
    expect(h.lives).toBe(2);
  });
});
