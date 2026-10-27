import { mengeText, runde, skaliereText, zahlText, zahlWert } from './mengen';

describe('Mengen', () => {
  it('schreibt Zahlen als Bruch oder mit Komma', () => {
    expect(zahlText(1.5)).toBe('1½');
    expect(zahlText(0.25)).toBe('¼');
    expect(zahlText(3)).toBe('3');
    expect(zahlText(2.5, 'dl')).toBe('2,5');
    expect(zahlText(1.25, 'kg')).toBe('1,25');
  });

  it('liest Zahlen aus dem Buch', () => {
    expect(zahlWert('1/2')).toBe(0.5);
    expect(zahlWert('1 1/2')).toBe(1.5);
    expect(zahlWert('1,5')).toBe(1.5);
    expect(zahlWert('½')).toBe(0.5);
    expect(zahlWert('2½')).toBe(2.5);
  });

  it('rundet passend zur Einheit', () => {
    expect(runde(187.5, 'g')).toBe(190);
    expect(runde(62.5, 'g')).toBe(65);
    expect(runde(10.5, 'g')).toBe(11);
    expect(runde(1.3, 'EL')).toBe(1.25);
    expect(runde(0.1, null)).toBe(0.25);
  });

  it('fasst grosse Mengen zusammen', () => {
    expect(mengeText(1250, null, 'g')).toBe('1,25 kg');
    expect(mengeText(12, null, 'dl')).toBe('1,2 l');
    expect(mengeText(1, 2, 'TL')).toBe('1 bis 2 TL');
    expect(mengeText(1.5, null, null)).toBe('1½');
  });

  it('rechnet Zutatenzeilen um', () => {
    expect(skaliereText('400 g Kalb- oder Schweinsplätzli, in Streifen', 1.5)).toBe('600 g Kalb- oder Schweinsplätzli, in Streifen');
    expect(skaliereText('1 Hokkaido-Kürbis (ca. 500 g)', 1.5)).toBe('1½ Hokkaido-Kürbis (ca. 750 g)');
    expect(skaliereText('Saft von 1/2 bis 1 Limette', 2)).toBe('Saft von 1 bis 2 Limette');
    expect(skaliereText('1\u20132 TL Zimt', 0.5)).toBe('½\u20131 TL Zimt');
    expect(skaliereText('Je 1/4 TL Cayennepfeffer und Salz', 2)).toBe('Je ½ TL Cayennepfeffer und Salz');
    expect(skaliereText('2,5 dl Milch', 2)).toBe('5 dl Milch');
    expect(skaliereText('Salz, Pfeffer', 3)).toBe('Salz, Pfeffer');
    expect(skaliereText('1 Zwiebel', 1)).toBe('1 Zwiebel');
  });
});
