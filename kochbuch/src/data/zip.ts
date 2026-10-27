/**
 * Kleiner ZIP-Leser für das Artefakt «rezepte-json» aus GitHub Actions (ein ZIP mit rezepte.json).
 * Liest das zentrale Verzeichnis am Dateiende, kann «gespeichert» (0) und «deflate» (8).
 * Entpackt wird mit DecompressionStream des Browsers, ohne Bibliothek.
 */
import { DatenFehler } from './pruefen';

const SIG_ENDE = 0x06054b50;
const SIG_VERZEICHNIS = 0x02014b50;
const SIG_DATEI = 0x04034b50;

export interface ZipEintrag {
  name: string;
  methode: number;
  daten: Uint8Array<ArrayBuffer>;
}

export const istZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;

export function leseZip(buf: ArrayBuffer): ZipEintrag[] {
  const v = new DataView(buf);
  const kaputt = () => new DatenFehler('Die ZIP-Datei ist unvollständig oder beschädigt.');
  let ende = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 22 - 0xffff); i--) {
    if (v.getUint32(i, true) === SIG_ENDE) { ende = i; break; }
  }
  if (ende < 0) throw kaputt();

  const anzahl = v.getUint16(ende + 10, true);
  let p = v.getUint32(ende + 16, true);
  const dec = new TextDecoder();
  const liste: ZipEintrag[] = [];
  try {
    for (let n = 0; n < anzahl; n++) {
      if (v.getUint32(p, true) !== SIG_VERZEICHNIS) throw kaputt();
      const methode = v.getUint16(p + 10, true);
      const laenge = v.getUint32(p + 20, true);
      const nameLaenge = v.getUint16(p + 28, true);
      const zusatz = v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
      const kopf = v.getUint32(p + 42, true);
      const name = dec.decode(new Uint8Array(buf, p + 46, nameLaenge));
      if (v.getUint32(kopf, true) !== SIG_DATEI) throw kaputt();
      // Die Grössen im lokalen Kopf können 0 sein (Datendeskriptor), darum die aus dem Verzeichnis
      const start = kopf + 30 + v.getUint16(kopf + 26, true) + v.getUint16(kopf + 28, true);
      liste.push({ name, methode, daten: new Uint8Array(buf, start, laenge) });
      p += 46 + nameLaenge + zusatz;
    }
  } catch (e) {
    throw e instanceof DatenFehler ? e : kaputt();
  }
  return liste;
}

export async function entpacke(e: ZipEintrag): Promise<Uint8Array> {
  if (e.methode === 0) return e.daten;
  if (e.methode !== 8) throw new DatenFehler(`Die ZIP-Datei ist mit einem unbekannten Verfahren gepackt (${e.methode}).`);
  try {
    const strom = new Blob([e.daten]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(strom).arrayBuffer());
  } catch {
    throw new DatenFehler('Die ZIP-Datei lässt sich nicht entpacken.');
  }
}
