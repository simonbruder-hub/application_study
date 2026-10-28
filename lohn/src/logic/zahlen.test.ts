import { anzahl, franken, prozent, rappen, zahl } from './zahlen';

describe('Zahlen lesen', () => {
  it('versteht Tausendertrennzeichen, Komma und Leerzeichen', () => {
    expect(zahl("5'000")).toBe(5000);
    expect(zahl('5’000.50')).toBe(5000.5);
    expect(zahl('37,5')).toBe(37.5);
    expect(zahl(' 42 ')).toBe(42);
    expect(zahl('.5')).toBe(0.5);
    expect(zahl('0')).toBe(0);
  });

  it('gibt bei Leerem, Negativem und Text null zurück', () => {
    for (const t of ['', '  ', 'abc', '-5', '1.2.3', '5 Fr.', '1e3']) expect(zahl(t)).toBeNull();
  });
});

describe('Zahlen schreiben', () => {
  it('rundet kaufmännisch auf Rappen', () => {
    expect(rappen(2.675)).toBe(2.68);
    expect(rappen(1.005)).toBe(1.01);
    expect(rappen(3.2933)).toBe(3.29);
    expect(rappen(0)).toBe(0);
  });

  it('schreibt Franken, Anzahlen und Prozent wie in der Schweiz', () => {
    expect(franken(5000)).toBe('5’000.00');
    expect(franken(1234567.891)).toBe('1’234’567.89');
    expect(franken(35.357905)).toBe('35.36');
    expect(anzahl(2184)).toBe('2’184');
    expect(anzahl(1747.2)).toBe('1’747.2');
    expect(prozent(0.1064)).toBe('10.64 %');
    expect(prozent(1 / 12)).toBe('8.33 %');
  });
});
