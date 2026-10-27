import { testbuch } from '../test/fixture';
import { anzahlMit, filterAus, filterQuery, filtere, jahreszeitAm, LEER, suchform } from './filter';

const ids = (f: Parameters<typeof filtere>[1]) => filtere(testbuch().rezepte, f).map(r => r.id);

describe('Filter', () => {
  it('filtert nach Art, Ernährung, Jahreszeit und Magen', () => {
    expect(ids({ ...LEER, art: ['Suppe'] })).toEqual(['kuerbissuppe_mit_ingwer', 'gurken_kaltschale']);
    expect(ids({ ...LEER, ern: ['Fisch', 'Fleisch'] })).toEqual(['zitronenpoulet_mit_ofenkartoffeln', 'lachs_mit_gruenen_spargeln']);
    // ganzjährige Rezepte passen zu jeder Jahreszeit
    expect(ids({ ...LEER, jz: ['sommer'] })).toEqual(['gurken_kaltschale', 'zitronenpoulet_mit_ofenkartoffeln', 'apfelwaehe']);
    expect(ids({ ...LEER, magen: ['gut'], art: ['Hauptgericht'] })).toEqual(['lachs_mit_gruenen_spargeln']);
  });

  it('sucht in Titel und Zutaten, mit und ohne Umlaut', () => {
    expect(ids({ ...LEER, q: 'spargel' })).toEqual(['lachs_mit_gruenen_spargeln']);
    expect(ids({ ...LEER, q: 'kurbis' })).toEqual(['kuerbissuppe_mit_ingwer']);
    expect(ids({ ...LEER, q: 'ZWIEBEL Olivenöl' })).toEqual(['zitronenpoulet_mit_ofenkartoffeln']);
    expect(suchform('Grüne Äpfel')).toBe(suchform('gruene aepfel'));
  });

  it('zählt, was ein Knopf zeigen würde', () => {
    const r = testbuch().rezepte;
    expect(anzahlMit(r, { ...LEER, art: ['Suppe'] }, 'magen', 'gut')).toBe(2);
    expect(anzahlMit(r, { ...LEER, art: ['Suppe'] }, 'magen', 'meiden')).toBe(0);
  });

  it('steht in der Adresse und kommt unverändert zurück', () => {
    const f = { q: 'Kürbis', art: ['Suppe', 'Frühstück'], ern: ['vegetarisch'], jz: ['herbst' as const], magen: ['gut' as const] };
    expect(filterAus(new URLSearchParams(filterQuery(f)))).toEqual(f);
    expect(filterAus(new URLSearchParams('jz=unsinn&magen=gut'))).toEqual({ ...LEER, magen: ['gut'] });
  });

  it('kennt die Jahreszeit', () => {
    expect(jahreszeitAm(new Date(2026, 9, 27))).toBe('herbst');
    expect(jahreszeitAm(new Date(2026, 1, 1))).toBe('winter');
    expect(jahreszeitAm(new Date(2026, 2, 1))).toBe('fruehling');
    expect(jahreszeitAm(new Date(2026, 6, 1))).toBe('sommer');
  });
});
