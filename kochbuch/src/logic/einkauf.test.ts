import { testbuch } from '../test/fixture';
import { aufZettel, istVorrat, LEERER_ZETTEL, portionText, posten, postenText, vomZettel, waehle, zettelText } from './einkauf';

const buch = testbuch();
const zettel = aufZettel(aufZettel(aufZettel(LEERER_ZETTEL, 'kuerbissuppe_mit_ingwer', 1), 'zitronenpoulet_mit_ofenkartoffeln', 1), 'lachs_mit_gruenen_spargeln', 1);
const finde = (liste: ReturnType<typeof posten>, name: string) => liste.find(p => p.name === name)!;

describe('Einkaufszettel', () => {
  it('zählt gleiche Zutaten zusammen', () => {
    const liste = posten(buch, zettel);
    expect(finde(liste, 'Zwiebel').mengen).toEqual(['2']);
    expect(finde(liste, 'Zitrone').mengen).toEqual(['1½']);
    expect(finde(liste, 'Zwiebel').rezepte).toEqual(['Kürbissuppe mit Ingwer', 'Zitronenpoulet mit Ofenkartoffeln']);
    expect(finde(liste, 'Salz')).toMatchObject({ mengen: [], ohneMenge: true, kaufen: false });
    expect(finde(liste, 'Gemüsebouillon').mengen).toEqual(['5 dl']);
  });

  it('rechnet mit den Portionen', () => {
    const liste = posten(buch, aufZettel(zettel, 'kuerbissuppe_mit_ingwer', 2));
    expect(finde(liste, 'Gemüsebouillon').mengen).toEqual(['1 l']);
    expect(finde(liste, 'Zwiebel').mengen).toEqual(['3']);
    expect(portionText(buch.rezepte[0]!, 1.5, 2)).toBe('3 Personen');
    expect(portionText(buch.rezepte[5]!, 2, 2)).toBe('× 2');
  });

  it('wählt Grundvorrat ab, alles andere ist zum Kaufen angehakt', () => {
    const liste = posten(buch, zettel);
    expect(finde(liste, 'Pfeffer').kaufen).toBe(false);
    expect(finde(liste, 'Olivenöl')).toMatchObject({ mengen: ['2 EL'], kaufen: false });
    expect(finde(liste, 'Rosmarin')).toMatchObject({ mengen: [], kaufen: true });
    expect(istVorrat('Chili- oder Paprikapulver')).toBe(true);
    expect(istVorrat('Puderzucker')).toBe(false);
    expect(istVorrat('Lasagneplatten')).toBe(false);
  });

  it('zeigt Zutaten mit Menge zuerst und lässt jede Wahl ändern', () => {
    const liste = posten(buch, zettel);
    const erstOhne = liste.findIndex(p => !p.mengen.length);
    expect(liste.slice(erstOhne).every(p => !p.mengen.length)).toBe(true);
    const z2 = waehle(waehle(zettel, finde(liste, 'Rahm'), false), finde(liste, 'Salz'), true);
    expect(z2.wahl).toEqual({ rahm: false, salz: true });
    const l2 = posten(buch, z2);
    expect(finde(l2, 'Rahm').kaufen).toBe(false);
    expect(finde(l2, 'Salz').kaufen).toBe(true);
    // zurück zum Vorschlag: Wahl wird vergessen
    expect(waehle(z2, finde(l2, 'Rahm'), true).wahl).toEqual({ salz: true });
  });

  it('schreibt Text für die Liste und zum Teilen', () => {
    const liste = posten(buch, zettel);
    expect(postenText(finde(liste, 'Butternusskürbis'))).toBe('Butternusskürbis (1)');
    expect(postenText(finde(liste, 'Pfeffer'))).toBe('Pfeffer');
    const text = zettelText(buch, zettel, liste);
    expect(text).toContain('Für: Kürbissuppe mit Ingwer (2 Personen)');
    expect(text).toContain('- Kartoffeln (600 g)');
    expect(text).not.toContain('- Salz');
  });

  it('nimmt Rezepte vom Zettel', () => {
    expect(vomZettel(zettel, 'lachs_mit_gruenen_spargeln').rezepte.map(e => e.id)).toEqual(['kuerbissuppe_mit_ingwer', 'zitronenpoulet_mit_ofenkartoffeln']);
  });
});
