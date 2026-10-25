import { mixHex, skyAt, STAGES, stageAt, TOWER_CYCLE, towerState } from './tower';

describe('Turm im Stil Baustelle', () => {
  it('beginnt in der Baugrube und zählt bis zum Wolken-Abschnitt', () => {
    const s = towerState(0);
    expect(s).toMatchObject({ floors: 0, round: 1, left: 6, reached: false, restarted: false });
    expect(s.stage.key).toBe('boden');
    expect(s.next?.key).toBe('wolken');
    expect(towerState(5).left).toBe(1);
  });

  it('erreicht die Abschnitte der Reihe nach: Wolken, Flugzeug, Weltall, Mond, Planeten und Meteoriten, UFO', () => {
    expect(STAGES.map((s) => s.key)).toEqual(['boden', 'wolken', 'flug', 'orbit', 'mond', 'mars', 'meteore', 'jupiter', 'saturn', 'ufo']);
    for (let i = 1; i < STAGES.length; i++) expect(STAGES[i]!.at).toBeGreaterThan(STAGES[i - 1]!.at);
    const moon = towerState(24);
    expect(moon.stage.key).toBe('mond');
    expect(moon.reached).toBe(true);
    expect(towerState(25).reached).toBe(false);
    expect(stageAt(53).key).toBe('saturn');
  });

  it('nach dem UFO beginnt ein neuer Turm am Boden', () => {
    const last = towerState(TOWER_CYCLE - 1);
    expect(last.stage.key).toBe('ufo');
    expect(last.next).toBeNull();
    expect(last.left).toBe(1);
    const again = towerState(TOWER_CYCLE);
    expect(again).toMatchObject({ floors: 0, round: 2, restarted: true });
    expect(again.stage.key).toBe('boden');
    expect(towerState(TOWER_CYCLE + 7)).toMatchObject({ floors: 7, round: 2, restarted: false });
  });

  it('Himmel wird mit der Höhe dunkel, Sterne erscheinen erst oben', () => {
    expect(skyAt(0)).toEqual({ top: '#8fd0ff', bottom: '#e3f5ff', stars: 0 });
    expect(skyAt(30)).toEqual({ top: '#04050f', bottom: '#0c1233', stars: 1 });
    expect(skyAt(10).stars).toBe(0);
    expect(skyAt(20).stars).toBe(1);
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});
