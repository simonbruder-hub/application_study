/**
 * Übergabe an «Kasse unterwegs» (Haushaltsapp, Repo haushaltskasse-app). Sie läuft auf derselben Website
 * (simonbruder-hub.github.io) und teilt darum den Speicher des Browsers mit dem Kochbuch.
 *
 * Kasse unterwegs hält neue Listeneinträge in IndexedDB «kasse-unterwegs», Store «kv», Schlüssel «listeNeu»
 * als { pwaId, text, quelle }. Sie liest den Speicher nur beim Start: Läuft sie im Hintergrund weiter,
 * überschreibt sie beim nächsten Speichern, was hier dazukommt. Darum vor dem Senden ganz schliessen.
 */
export const KASSE_DB = 'kasse-unterwegs';

export function kasseListeUrl(): string {
  return location.hostname.endsWith('github.io')
    ? `${location.origin}/haushaltskasse-app/?tab=liste`
    : 'https://simonbruder-hub.github.io/haushaltskasse-app/?tab=liste';
}

export interface KasseEintrag { pwaId: string; text: string; quelle?: string }
interface StandZeile { id: string; text: string; erledigt?: boolean }

export interface KasseZustand {
  stand?: { liste?: StandZeile[] } | null;
  listeNeu?: KasseEintrag[] | null;
  listeStatus?: Record<string, boolean> | null;
}

export interface KasseArtikel {
  /** zum Vergleich mit der Liste, z. B. «Champignons» */
  name: string;
  /** so erscheint er auf der Liste, z. B. «Champignons (400 g)» */
  text: string;
}

export interface KasseErgebnis { neu: number; schon: string[] }

/** Wie Kasse unterwegs Texte vergleicht (kern.js, schluessel) */
const kasseSchluessel = (s: string) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Plant, was neu auf die Liste kommt. Steht der Name schon offen auf der Liste, kommt er nicht doppelt
 * dazu (wie «aufListe» in Kasse unterwegs).
 */
export function planeKasse(artikel: KasseArtikel[], z: KasseZustand, neueId: () => string): { neu: KasseEintrag[]; schon: string[] } {
  const status = z.listeStatus ?? {};
  const offen: string[] = [];
  for (const x of z.stand?.liste ?? []) {
    const erledigt = x.id in status ? status[x.id] : !!x.erledigt;
    if (!erledigt) offen.push(kasseSchluessel(x.text));
  }
  for (const x of Array.isArray(z.listeNeu) ? z.listeNeu : []) if (!status[x.pwaId]) offen.push(kasseSchluessel(x.text));

  const neu: KasseEintrag[] = [];
  const schon: string[] = [];
  for (const a of artikel) {
    const k = kasseSchluessel(a.name);
    if (offen.some(t => t.includes(k))) { schon.push(a.name); continue; }
    neu.push({ pwaId: neueId(), text: a.text, quelle: 'Kochbuch' });
    offen.push(kasseSchluessel(a.text));
  }
  return { neu, schon };
}

/** Kasse unterwegs wurde in diesem Browser noch nie geöffnet */
export class KasseFehlt extends Error {}

function oeffneKasse(): Promise<IDBDatabase> {
  return new Promise((ok, fehler) => {
    const r = indexedDB.open(KASSE_DB);
    let gibtEsNicht = false;
    // Ohne Version geöffnet: Upgrade heisst, die Datenbank fehlt. Abbrechen, damit keine leere entsteht.
    r.onupgradeneeded = ev => {
      if (ev.oldVersion === 0) { gibtEsNicht = true; r.transaction?.abort(); }
    };
    r.onsuccess = () => {
      const db = r.result;
      if (db.objectStoreNames.contains('kv')) ok(db);
      else { db.close(); fehler(new KasseFehlt()); }
    };
    r.onerror = () => fehler(gibtEsNicht ? new KasseFehlt() : r.error);
  });
}

/** Schreibt die Artikel in einem Schritt (Lesen und Schreiben in derselben Transaktion) auf die Liste */
export async function anKasseSenden(artikel: KasseArtikel[]): Promise<KasseErgebnis> {
  const db = await oeffneKasse();
  try {
    return await new Promise<KasseErgebnis>((ok, fehler) => {
      const t = db.transaction('kv', 'readwrite');
      const s = t.objectStore('kv');
      const stand = s.get('stand');
      const liste = s.get('listeNeu');
      const status = s.get('listeStatus');
      let ergebnis: KasseErgebnis = { neu: 0, schon: [] };
      status.onsuccess = () => {
        const bisher = Array.isArray(liste.result) ? (liste.result as KasseEintrag[]) : [];
        const plan = planeKasse(artikel, { stand: stand.result, listeNeu: bisher, listeStatus: status.result }, () => crypto.randomUUID());
        ergebnis = { neu: plan.neu.length, schon: plan.schon };
        if (plan.neu.length) s.put([...bisher, ...plan.neu], 'listeNeu');
      };
      t.oncomplete = () => ok(ergebnis);
      t.onerror = () => fehler(t.error);
      t.onabort = () => fehler(t.error);
    });
  } finally {
    db.close();
  }
}
