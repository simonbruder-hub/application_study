/**
 * Speicher auf dem Gerät (IndexedDB, Datenbank «kochbuch»). Die Rezepte gehen nirgends hin:
 * Sie liegen nur in diesem Browser, bis man sie unter «Daten» entfernt.
 */
const DB_NAME = 'kochbuch';
const STORE = 'kv';

let offen: Promise<IDBDatabase> | null = null;

function oeffnen(): Promise<IDBDatabase> {
  return offen ??= new Promise((ok, fehler) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { offen = null; fehler(r.error); };
  });
}

async function tx<T>(modus: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  const db = await oeffnen();
  return new Promise((ok, fehler) => {
    const t = db.transaction(STORE, modus);
    const anfrage = fn(t.objectStore(STORE));
    t.oncomplete = () => ok((anfrage ? anfrage.result : undefined) as T);
    t.onerror = () => fehler(t.error);
    t.onabort = () => fehler(t.error);
  });
}

export const lies = <T>(key: string) => tx<T | undefined>('readonly', s => s.get(key));
export const schreibe = (key: string, wert: unknown) => tx<void>('readwrite', s => { s.put(wert, key); });
export const loesche = (key: string) => tx<void>('readwrite', s => { s.delete(key); });

/** Bittet den Browser, die Daten nicht bei Platzmangel zu löschen */
export function dauerhaft() {
  void navigator.storage?.persist?.().catch(() => false);
}
