import { type Eingaben, rechne, verdienst, zuschlag } from './lohn';
import { franken } from './zahlen';

/** Beispiel: 5200 Fr. im Monat, 13 Monatslöhne, 42 Stunden, 25 Ferientage, 9 Feiertage */
const BEISPIEL: Eingaben = {
  richtung: 'monat',
  monatslohn: 5200,
  stundenlohn: 0,
  dreizehnter: true,
  pensum: 100,
  wochenstunden: 42,
  ferientage: 25,
  feiertage: 9,
};

describe('Zuschläge für Ferien und Feiertage', () => {
  it('rechnet Tage / (260 - Tage) und rundet auf 0.01 %', () => {
    expect(zuschlag(20)).toBe(0.0833);
    expect(zuschlag(25)).toBe(0.1064);
    expect(zuschlag(30)).toBe(0.1304);
    expect(zuschlag(9)).toBe(0.0359);
    expect(zuschlag(0)).toBe(0);
  });
});

describe('Monatslohn in Stundenlohn', () => {
  it('rechnet mit 13. Monatslohn, Ferien- und Feiertagszuschlag', () => {
    const r = rechne(BEISPIEL);
    expect(r.jahresstunden).toBe(2184);
    expect(r.jahreslohn).toBe(67600);
    expect(r.satz).toEqual({ dreizehnter: 1 / 12, ferien: 0.1064, feiertage: 0.0359 });
    const s = r.stunde;
    expect(s.zwischen).toBeCloseTo(67600 / 2184, 10);
    expect(s.grund).toBeCloseTo((5200 * 12) / 2184, 10);
    expect(s.grund + s.dreizehnter).toBeCloseTo(s.zwischen, 10);
    expect(s.ferien).toBeCloseTo(s.zwischen * 0.1064, 10);
    expect(s.feiertage).toBeCloseTo(s.zwischen * 0.0359, 10);
    expect(s.brutto).toBeCloseTo(s.zwischen * 1.1423, 10);
    expect([s.grund, s.dreizehnter, s.zwischen, s.ferien, s.feiertage, s.brutto].map(franken))
      .toEqual(['28.57', '2.38', '30.95', '3.29', '1.11', '35.36']);
  });

  it('ohne 13. Monatslohn gibt es keinen Anteil dafür', () => {
    const r = rechne({ ...BEISPIEL, dreizehnter: false });
    expect(r.monatsloehne).toBe(12);
    expect(r.jahreslohn).toBe(62400);
    expect(r.stunde.dreizehnter).toBe(0);
    expect(r.stunde.grund).toBe(r.stunde.zwischen);
    expect(franken(r.stunde.brutto)).toBe('32.64');
  });

  it('ein Teilpensum mit passendem Lohn gibt denselben Stundenlohn', () => {
    const voll = rechne(BEISPIEL);
    const teil = rechne({ ...BEISPIEL, pensum: 80, monatslohn: 4160 });
    expect(teil.jahresstunden).toBeCloseTo(1747.2, 10);
    expect(teil.stunde.brutto).toBeCloseTo(voll.stunde.brutto, 10);
  });

  it('weniger Wochenstunden geben einen höheren Stundenlohn', () => {
    expect(rechne({ ...BEISPIEL, wochenstunden: 40 }).stunde.brutto).toBeGreaterThan(rechne(BEISPIEL).stunde.brutto);
  });
});

describe('Stundenlohn in Monatslohn', () => {
  const RUECKWAERTS: Eingaben = { ...BEISPIEL, richtung: 'stunde', monatslohn: 0, stundenlohn: 40 };

  it('rechnet den Monatslohn zum Stundenlohn mit allen Zuschlägen', () => {
    const r = rechne(RUECKWAERTS);
    expect(r.stunde.brutto).toBeCloseTo(40, 10);
    expect(r.stunde.zwischen).toBeCloseTo(40 / 1.1423, 10);
    expect(franken(r.monatslohn)).toBe('5’882.87');
    expect(r.jahreslohn).toBeCloseTo(r.monatslohn * 13, 8);
  });

  it('hin und zurück ergibt wieder denselben Lohn', () => {
    const hin = rechne(BEISPIEL);
    const zurueck = rechne({ ...RUECKWAERTS, stundenlohn: hin.stunde.brutto });
    // Der Stundenlohn wird auf Rappen gerundet eingegeben, das macht pro Monat höchstens ein paar Rappen aus
    expect(Math.abs(zurueck.monatslohn - 5200)).toBeLessThan(1);
    const genau = rechne({ ...RUECKWAERTS, stundenlohn: 38.5, wochenstunden: 40, ferientage: 20 });
    expect(rechne({ ...BEISPIEL, monatslohn: genau.monatslohn, wochenstunden: 40, ferientage: 20 }).stunde.brutto).toBeCloseTo(38.5, 10);
  });

  it('beim Teilpensum ist der Monatslohn kleiner', () => {
    expect(rechne({ ...RUECKWAERTS, pensum: 50 }).monatslohn).toBeCloseTo(rechne(RUECKWAERTS).monatslohn / 2, 8);
  });
});

describe('Verdienst aus Stunden', () => {
  it('rechnet Stunden mal Stundenlohn und teilt ihn so auf, dass alles aufgeht', () => {
    const v = verdienst(rechne(BEISPIEL), 60);
    expect(v.satz).toBe(35.36);
    expect(v.brutto).toBe(2121.6);
    expect(v.ferien).toBe(197.62);
    expect(v.feiertage).toBe(66.68);
    expect(v.dreizehnter).toBe(142.87);
    expect(v.grund).toBe(1714.43);
    expect(v.grund + v.dreizehnter + v.ferien + v.feiertage).toBeCloseTo(v.brutto, 8);
  });

  it('geht auch mit halben Stunden, ohne 13. Monatslohn und mit null Stunden', () => {
    const r = rechne({ ...BEISPIEL, dreizehnter: false });
    const v = verdienst(r, 37.5);
    expect(v.brutto).toBe(1224);
    expect(v.dreizehnter).toBe(0);
    expect(v.grund + v.ferien + v.feiertage).toBeCloseTo(v.brutto, 8);
    expect(verdienst(r, 0)).toMatchObject({ brutto: 0, grund: 0, dreizehnter: 0, ferien: 0, feiertage: 0 });
  });
});
