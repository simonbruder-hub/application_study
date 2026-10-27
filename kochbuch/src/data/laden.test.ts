import { crc32, deflateRawSync } from 'node:zlib';
import { fixtureText } from '../test/fixture';
import { ladeDaten } from './laden';
import { DatenFehler } from './pruefen';

const puffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer;

/** Baut ein ZIP wie GitHub Actions: Grössen erst im Datendeskriptor nach den Daten */
function zip(dateien: { name: string; text: string; packen: boolean }[]): ArrayBuffer {
  const teile: Buffer[] = [];
  const verzeichnis: Buffer[] = [];
  let pos = 0;
  for (const d of dateien) {
    const name = Buffer.from(d.name);
    const roh = Buffer.from(d.text);
    const daten = d.packen ? deflateRawSync(roh) : roh;
    const methode = d.packen ? 8 : 0;
    const kopf = Buffer.alloc(30);
    kopf.writeUInt32LE(0x04034b50, 0);
    kopf.writeUInt16LE(20, 4);
    kopf.writeUInt16LE(0x0008, 6);
    kopf.writeUInt16LE(methode, 8);
    kopf.writeUInt16LE(name.length, 26);
    const nachspann = Buffer.alloc(16);
    nachspann.writeUInt32LE(0x08074b50, 0);
    nachspann.writeUInt32LE(crc32(roh), 4);
    nachspann.writeUInt32LE(daten.length, 8);
    nachspann.writeUInt32LE(roh.length, 12);
    teile.push(kopf, name, daten, nachspann);
    const eintrag = Buffer.alloc(46);
    eintrag.writeUInt32LE(0x02014b50, 0);
    eintrag.writeUInt16LE(20, 4);
    eintrag.writeUInt16LE(20, 6);
    eintrag.writeUInt16LE(0x0008, 8);
    eintrag.writeUInt16LE(methode, 10);
    eintrag.writeUInt32LE(crc32(roh), 16);
    eintrag.writeUInt32LE(daten.length, 20);
    eintrag.writeUInt32LE(roh.length, 24);
    eintrag.writeUInt16LE(name.length, 28);
    eintrag.writeUInt32LE(pos, 42);
    verzeichnis.push(eintrag, name);
    pos += 30 + name.length + daten.length + 16;
  }
  const vz = Buffer.concat(verzeichnis);
  const ende = Buffer.alloc(22);
  ende.writeUInt32LE(0x06054b50, 0);
  ende.writeUInt16LE(dateien.length, 8);
  ende.writeUInt16LE(dateien.length, 10);
  ende.writeUInt32LE(vz.length, 12);
  ende.writeUInt32LE(pos, 16);
  return puffer(Buffer.concat([...teile, vz, ende]));
}

describe('Rezepte laden', () => {
  it('liest rezepte.json im Format des Kochbuch-Skripts', async () => {
    const buch = await ladeDaten(puffer(Buffer.from(fixtureText())));
    expect(buch.titel).toBe('Testkochbuch');
    expect(buch.personen).toBe(2);
    expect(buch.rezepte.map(r => r.id)).toEqual([
      'kuerbissuppe_mit_ingwer', 'gurken_kaltschale', 'randensalat_mit_feta',
      'zitronenpoulet_mit_ofenkartoffeln', 'lachs_mit_gruenen_spargeln', 'apfelwaehe',
    ]);
    const suppe = buch.rezepte[0]!;
    expect(suppe.magen).toEqual({ stufe: 'gut', text: 'Mild gewürzt und gut verträglich, Ingwer nur sparsam.' });
    expect(suppe.saison.jahreszeiten).toEqual(['herbst', 'winter']);
    expect(suppe.geheimtipp).toContain('Kürbiskerne');
    expect(buch.rezepte[3]!.saison.ganzjaehrig).toBe(true);
  });

  it('liest das ZIP aus GitHub Actions, gepackt und ungepackt', async () => {
    for (const packen of [true, false]) {
      const buch = await ladeDaten(zip([{ name: 'rezepte.json', text: fixtureText(), packen }]));
      expect(buch.rezepte).toHaveLength(6);
    }
  });

  it('nimmt im ZIP rezepte.json, auch wenn noch andere Dateien drin sind', async () => {
    const buch = await ladeDaten(zip([
      { name: 'liesmich.json', text: '{"rezepte": []}', packen: true },
      { name: 'daten/rezepte.json', text: fixtureText(), packen: true },
    ]));
    expect(buch.rezepte).toHaveLength(6);
  });

  it('meldet verständliche Fehler', async () => {
    const fehler = async (text: string) => {
      try { await ladeDaten(puffer(Buffer.from(text))); } catch (e) { return e instanceof DatenFehler ? e.message : 'anderer Fehler'; }
      return 'kein Fehler';
    };
    expect(await fehler('kein json')).toMatch(/weder rezepte\.json/);
    expect(await fehler('{"titel": "x"}')).toMatch(/keine Rezeptdatei/);
    expect(await fehler('{"rezepte": []}')).toMatch(/keine Rezepte/);
    expect(await fehler('{"rezepte": [{"id": "a", "titel": "A"}]}')).toMatch(/Zutaten fehlen/);
    expect(await fehler('{"rezepte": [{"id": "a", "titel": "A", "zutaten": []}, {"id": "a", "titel": "B", "zutaten": []}]}')).toMatch(/mehrfach/);
    const kaputt = new Uint8Array(zip([{ name: 'rezepte.json', text: fixtureText(), packen: true }])).slice(0, 200);
    await expect(ladeDaten(kaputt.buffer)).rejects.toThrow(/ZIP/);
  });
});
