import { ausSpeicher, feld, lesen, START } from './formular';

describe('Formular prüfen', () => {
  it('liest die Startwerte als gültige Eingaben', () => {
    const { eingaben, fehler } = lesen(START);
    expect(fehler).toEqual({});
    expect(eingaben).toEqual({
      richtung: 'monat', monatslohn: 5000, stundenlohn: 0, dreizehnter: true,
      pensum: 100, wochenstunden: 42, ferientage: 25, feiertage: 9,
    });
  });

  it('meldet ungültige Felder und rechnet dann nicht', () => {
    const { eingaben, fehler } = lesen({ ...START, monatslohn: '', pensum: '120', ferientage: 'viele' });
    expect(eingaben).toBeNull();
    expect(fehler).toEqual({ monatslohn: 'Betrag über 0 eingeben', pensum: '1 bis 100 %', ferientage: '0 bis 100 Tage' });
  });

  it('zählt nur den Lohn der gewählten Richtung', () => {
    const { eingaben, fehler } = lesen({ ...START, richtung: 'stunde', monatslohn: 'egal', stundenlohn: "1'000" });
    expect(fehler).toEqual({});
    expect(eingaben).toMatchObject({ richtung: 'stunde', stundenlohn: 1000, monatslohn: 0 });
  });

  it('prüft die Stunden für den Verdienst einzeln', () => {
    expect(feld('stunden', '37,5')).toEqual({ wert: 37.5 });
    expect(feld('stunden', '0')).toEqual({ wert: 0 });
    expect(feld('stunden', '800')).toEqual({ fehler: '0 bis 744 Stunden' });
    expect(feld('wochenstunden', '0')).toEqual({ fehler: '1 bis 80 Stunden' });
  });
});

describe('Gespeichertes Formular', () => {
  it('übernimmt gültige Werte und ergänzt fehlende', () => {
    expect(ausSpeicher({ richtung: 'stunde', stundenlohn: '41.5', dreizehnter: false })).toEqual({
      ...START, richtung: 'stunde', stundenlohn: '41.5', dreizehnter: false,
    });
  });

  it('ignoriert Kaputtes', () => {
    expect(ausSpeicher(null)).toEqual(START);
    expect(ausSpeicher('text')).toEqual(START);
    expect(ausSpeicher({ richtung: 'jahr', pensum: 80, monatslohn: 'x'.repeat(50) })).toEqual(START);
  });
});
