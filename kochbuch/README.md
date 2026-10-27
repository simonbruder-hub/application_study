# Kochbuch

Die Rezepte aus dem Kochbuch-Repo auf Handy und Laptop: suchen, nach Art, Ernährung, Jahreszeit und Verträglichkeit
filtern, Portionen umrechnen und die Zutaten auf einen Einkaufszettel setzen. Von dort gehen sie direkt in die
Einkaufsliste von Kasse unterwegs oder als Text weiter.

Adresse: `https://simonbruder-hub.github.io/apps/kochbuch/app/`

## Die Rezepte bleiben privat

Die App ist öffentlich, die Rezepte nicht. Sie stehen weder im Code noch auf der Website. Jedes Gerät lädt die Datei
einmal selbst, danach liegen die Rezepte nur in diesem Browser (IndexedDB `kochbuch`) und die App läuft auch offline.

So kommst du zur Datei:

1. Im Kochbuch-Repo unter «Actions» den neusten Lauf von «CI» öffnen.
2. Bei «Artifacts» die Datei «rezepte-json» herunterladen (ein ZIP).
3. In der App beim ersten Start oder unter «Daten» das ZIP laden. Auspacken ist nicht nötig.

Oder lokal im Kochbuch-Repo `python skripte/rezepte_json.py` ausführen und `daten/rezepte.json` laden.
Nach Änderungen am Kochbuch einfach die neue Datei laden, sie ersetzt die alte.

## Bedienung

| Was | So geht es |
|---|---|
| Filtern | Art, Ernährung, Jahreszeit («jetzt» markiert die aktuelle) und Magen-Ampel. In einer Gruppe gilt «oder», zwischen den Gruppen «und». Die Zahl im Knopf zeigt, wie viele Rezepte dann übrig bleiben. |
| Suchen | Titel und Zutaten, Umlaute egal (`kase` findet «Käse»). |
| Portionen | Im Rezept mit − und +. Alle Zahlen der Zutaten werden umgerechnet und passend gerundet. Gebäck rechnet in Blechen oder Stück (× 1½). |
| Einkaufszettel | «Auf den Einkaufszettel» im Rezept. Gleiche Zutaten werden zusammengezählt (g und kg, ml, dl und l). Grundvorrat wie Salz, Öl, Mehl und Gewürze ist abgewählt. |
| An Kasse unterwegs senden | Schreibt die angehakten Zutaten in die Einkaufsliste von Kasse unterwegs. Was dort schon offen steht, kommt nicht doppelt dazu. |
| Teilen | Zettel als Text, z. B. für WhatsApp, sonst in die Zwischenablage. |

## Übergabe an Kasse unterwegs

Kasse unterwegs (Repo `haushaltskasse-app`, Adresse `/haushaltskasse-app/`) läuft auf derselben Website und teilt darum
den Speicher des Browsers mit dem Kochbuch. Das Kochbuch hängt neue Einträge an `listeNeu` in ihrer Datenbank
`kasse-unterwegs` an, im selben Format wie Einträge, die man dort selbst tippt (`{ pwaId, text, quelle: "Kochbuch" }`).
Damit das klappt:

- Gleiches Gerät und gleicher Browser. Auf dem Android-Handy also das Kochbuch in Chrome öffnen oder aus Chrome
  installieren, wie Kasse unterwegs. Auf dem iPhone haben Apps auf dem Home-Bildschirm je einen eigenen Speicher.
- Kasse unterwegs vorher ganz schliessen. Sie liest ihren Speicher nur beim Start und würde neue Einträge sonst beim
  nächsten Speichern überschreiben.
- Wurde Kasse unterwegs in diesem Browser nie geöffnet, meldet das Kochbuch das und legt nichts an.

Die neue Haushalt-App (`/haushaltskasse-app/neu/`) hat noch keine Einkaufsliste (Modul M6). Sobald es sie gibt, kann
sie den Zettel genauso übernehmen; `src/logic/kasse.ts` zeigt, wie.

## Technik

Vite, Preact, TypeScript, PWA (offline), sonst keine Bibliotheken. Das ZIP liest ein kleiner eigener Leser mit
`DecompressionStream` des Browsers.

- `src/data/`: Format (`types.ts`), Prüfung (`pruefen.ts`), JSON und ZIP lesen (`laden.ts`, `zip.ts`), Speicher (`speicher.ts`)
- `src/logic/`: Filter und Suche (`filter.ts`), Mengen umrechnen (`mengen.ts`), Einkaufszettel (`einkauf.ts`), Kasse unterwegs (`kasse.ts`)
- `src/views/`: Rezepte, Rezept, Einkauf, Daten
- Der Einkaufszettel liegt in `localStorage` (`kochbuch.zettel.v1`), die Rezepte in IndexedDB.

Die Tests arbeiten mit erfundenen Rezepten (`tests/fixtures/`). Die Datei ist mit dem echten Skript aus erfundenen
`.tex`-Dateien erzeugt, damit das Format stimmt.

```bash
npm ci
npm run dev        # http://localhost:5175
npm test           # Laden, Filter, Mengen, Einkauf, Kasse
npm run typecheck
npm run build      # dist/app
npm run test:e2e   # Playwright gegen dist/app (vorher bauen)
npm run icons      # PNG-Icons aus web/public/icon.svg
```

Mit einem vorinstallierten Chromium anderer Version: `PW_CHROMIUM=/pfad/zu/chrome npm run test:e2e`.
