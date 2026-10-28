# Stand & Übergabe

Für die Weiterarbeit in einem neuen Chat: Dieses Dokument, [`ARCHITEKTUR.md`](ARCHITEKTUR.md), [`../README.md`](../README.md)
und die Aufgabenliste [`../../docs/AUFGABEN.md`](../../docs/AUFGABEN.md) lesen.
Taktwerk (früher Pomodoro-Planer) liegt auf `main`. GitHub Pages veröffentlicht
die App unter `https://simonbruder-hub.github.io/apps/taktwerk/app/`.

## Fertig (Phase 0 + Phase 1)
- Datenmodell, lokale Datenbank (Dexie), Repository, Sync-Engine mit Supabase, Live-Timer über Geräte und Tabs,
  Health-Engine, Excel-Engine (Export/Import-Logik), SQL-Schema mit Tests, automatische Übernahme der v1-Daten.
- v2-Oberfläche (Vite + Preact): Kopfzeile mit Lernen/Arbeit und Sync-Anzeige; Fokus (Pomodoro + Stechuhr mit Korrektur);
  Aufgaben; Projekte (Übersicht + Detail, Meilensteine/APs nur lesend); Auswertung (Woche/Monat/Jahr, Verlauf,
  Aufteilung, Protokoll, Zeit nachtragen); Einstellungen (Timer, Darstellung, Signale, Supabase-Verbindung,
  Anmeldung per E-Mail-Code, Excel-Export, Zurücksetzen, Installation); Mini-Player (Bild-im-Bild / Mini-Ansicht /
  Handy-Leiste); Tastenkürzel; PWA und Einzeldatei.
- Tests: `npm test` (Vitest), `npm run db:test` (PostgreSQL 16), `npm run build:v2 && npm run test:e2e` (Playwright).
  CI läuft auf Pull Requests (`.github/workflows/ci.yml`).

## Offen (nächste Schritte)
1. **Phase 2:** Projekte – Meilensteine und Arbeitspakete bearbeiten, Soll/Ist mit Ampel (Health-Engine ist fertig).
2. **Phase 3:** Kalender (Tag/Woche/Monat, geplante Blöcke `planned_blocks` und erfasste Zeit).
3. **Phase 4:** Excel-Import mit Vorschau in der Oberfläche (Logik in `src/excel/` fertig).
4. Auswertung: CSV-Export und Textzusammenfassung wie in v1 (in v2 noch nicht übernommen).
5. E2E-Tests für Aufgaben, Projekte, Auswertung, Einstellungen und die v1-Übernahme ergänzen.

## Erledigt (Oktober 2026)

- Zeiger ziehen, Tags und Farbsystem (Supabase-Spalten `projects.tags`, `user_settings.tag_colors`; fehlende Spalten
  werden beim Sync übersprungen und in den Einstellungen gemeldet).
- 13 Stile mit Szenen je Phase, Fortschritts-Begleiter, Einblendungen und Feiern; Natur heisst jetzt Forest
  (ein Baum pro Pomodoro, jedes Mal eine andere Art). Neu: Meer, Flora, Sci-Fi, Elemente, Zug.
- Desktop-App (Tauri) bis 1.0.x: lädt die Online-Version (abgelöst durch 1.1, siehe unten).
- Zeiger ziehen auf die Sekunde genau (min. 5 s), Umschalt+Pfeil ±10 s; `planned_seconds` immer ganzzahlig.
- Flora blumiger (Blütenkranz, Kletterrosen, volle Wiese), Zug mit fahrendem Zug, Bahnhof (kurze Pause) und
  Zürich HB (lange Pause), Sci-Fi mit Raumgefecht und dem Pausenspiel Space Rider (`src/ui/game/`).

- Pausenspiele für alle Stile (`src/ui/game/`): Space Rider mit Boss, Hummelflug, Grand Prix, Waldjagd, Sudoku,
  Geschenkejagd, Kürbismann, Memory. Neue Stile Weihnachten und Halloween. Elemente-Spektakel und Elementwahl,
  Technik-Oszilloskop interaktiv, Zug mit SBB-Uhren, Zugwahl und Zug zum Anfassen, Zeiger behält seinen Massstab.
- Hummelflug erweitert (Wespen mit Flugmustern statt Klumpen, Sonnenblumen, Goldblüten, Libellen, Schild, Gelée royale,
  Nektarkette, Hornissennest), Waldjagd mit neuen Tannen und Blätterbüschen, Grand Prix mit neuer Strecke und weicher Lenkung.
- **Lernlabor** als eigene App (`../lernlabor/`, Plan und Stand in [`LERNAPP.md`](LERNAPP.md)): Schaltungsbaukasten mit
  Oszilloskop, Zeigern, Frequenzgang und Kennwerten, Theorie und Aufgaben in Stufen für Elektrotechnik. Taktwerk verlinkt
  es in den Einstellungen und im Stil Technik in den Pausen. Pages veröffentlicht es unter `/lernlabor/app/`.
- Forest: Der alte Baumstrunk hat Wurzeln, Rinde und Jahresringe; der neue Baum wächst daneben als Ganzes
  (Stamm und Krone im gleichen Verhältnis), nichts formt sich mehr um.
- Neue Stile **Dschungel** (Tiere, die sich verstecken und auftauchen) und **Baustelle** (Kräne, Lastwagen, Elektriker
  mit Stromschlag am Ende jeder Session), mit den Spielen Dschungelschlange (Snake) und Baustellen-Run (Temple Run, 3D).
- **Kürbismann neu** (3D): das richtige Spukhaus finden, jedes Mal neu angeordnet, Kürbismann mit der Taschenlampe
  bannen, Münzen und Upgrades bleiben gespeichert (`taktwerk.kuerbis.v2`).
- 3D-Grundlage in `src/ui/game/three/` (three.js, eigener Chunk, lädt erst beim Spielen): Renderer in eine eigene
  Fläche, Bild wird in die Spielfläche kopiert; ohne WebGL zeichnen die Spiele eine 2D-Ansicht. Ohne Grafikkarte
  (Software-Renderer) kleinere Auflösung, keine Schatten und nur alle 0,4 s ein neues Bild.
- Gemeinsame Startseite (`/index.html`) für Taktwerk und Lernlabor mit Vorschaubildern.
- **Ton am Laptop zuverlässig** (`src/app/timer/signals.ts`, `alarm.ts`, `controller.ts`): Jeder Klick oder Tastendruck
  in der App (auch im schwebenden Fenster) schaltet den Ton frei und plant ihn für die laufende Phase nach; solange er
  gesperrt ist, zeigt `SoundHint` «Ton aktivieren». Ein Wecker im Web Worker löst das Phasenende auch in gedrosselten
  Hintergrund-Tabs pünktlich aus. Benachrichtigung auch, wenn das Fenster hinter einem anderen Programm liegt. Desktop-App
  1.0.2: WebView2 darf Ton ohne Klick abspielen und wird im Hintergrund nicht gebremst (`additionalBrowserArgs`).
  Tests: `signals.test.ts`, `alarm.test.ts`, `tests/e2e/sound.spec.ts`.
- Anmeldung: Hinweis im Code-Schritt, falls die Mail nur einen Link enthält (Supabase-Vorlage umstellen).
- **Desktop-App 1.1 als Hauptapp am Laptop** (Details in [`../desktop/README.md`](../desktop/README.md)): App fest eingebaut
  (`npm run build:desktop`, läuft offline), Updates über den Tauri-Updater (Hinweis «Update» in der Kopfzeile, Signatur
  mit Schlüssel aus den GitHub-Secrets, `latest.json` im Release). Widget als eigenes Fenster ohne Rahmen, immer im
  Vordergrund, Höhe folgt dem Inhalt, frei verkleinerbar (unter 200 px nur Uhr und Start), merkt sich Ort und Breite,
  startet wieder so, wie man die App verlassen hat; das Hauptfenster ist solange ausgeblendet (`src/ui/components/Widget.tsx`,
  `desktop/src-tauri/src/windows.rs`). Ton und Benachrichtigung am Phasenende plant Rust (`alarm.rs`), auch bei
  ausgeblendetem Fenster. Daten der bisherigen Desktop-App übernimmt sie beim ersten Start (`handover.rs`, `handover.js`).
  Bild-im-Bild in Chrome öffnet in der Grösse des Inhalts und merkt sich die Breite. Die ältere Desktop-App zeigt
  einmal einen Hinweis auf die neue Version. Empfehlungen zu Code-Signing, Android und iPhone in
  [`PLATTFORMEN.md`](PLATTFORMEN.md). Tests: `src/app/desktop.test.ts`, `tests/e2e/desktop.spec.ts` (Projekt `desktop-app`).
  Am Laptop getestet und am 27.10.2026 als Release 1.1.0 veröffentlicht; die Secrets für die Update-Signatur sind eingetragen.
- Baustelle: Turm unter der Uhr wächst mit jedem Pomodoro des aktuellen Bereichs (Lernen oder Arbeit) bis ins
  Weltall, Abschnitte in `src/ui/components/tower.ts` (Wolken 6, Flughöhe 12, Weltall 18, Mond 24, Mars 30,
  Meteoriten 36, Jupiter 42, Saturn 48, UFO 54); nach 60 Stockwerken beginnt ein neuer Turm.
- **Kochbuch nach LaTeX** (Aufgabe 3, eigenes Repo `simonbruder-hub/Kochbuch_Altstetten`, Details im README dort):
  Overleaf-Projekt im Repo, ein Rezept pro Datei (`rezepte/<kapitel>/`), Vorlage mit Art, Ernährung, Geschichte und
  Geheimtipp. `skripte/rezepte_json.py` prüft die Rezepte und erzeugt `daten/rezepte.json` für die Kochbuch-App
  (Aufgabe 5); die CI baut PDF und JSON bei jedem PR.
- **Kochbuch-App** (Aufgabe 5, eigene App `../../kochbuch/`, Details in [`../../kochbuch/README.md`](../../kochbuch/README.md)):
  liest `rezepte.json` oder das ZIP «rezepte-json» aus der Kochbuch-CI; die Rezepte bleiben nur auf dem Gerät
  (IndexedDB), auf der Website steht keines. Filter nach Art, Ernährung, Jahreszeit und Magen-Ampel, Suche ohne
  Rücksicht auf Umlaute, Portionen umrechnen (`src/logic/mengen.ts`, alle Zahlen einer Zutatenzeile, passend gerundet).
  Einkaufszettel zählt gleiche Zutaten zusammen, wählt Grundvorrat ab und schreibt die Zutaten direkt in die Liste von
  «Kasse unterwegs» (gleiche Website, IndexedDB `kasse-unterwegs`, Schlüssel `listeNeu`, ohne Doppelte) oder teilt sie
  als Text. Startseite mit Abschnitt «Für den Alltag». Tests: Vitest und Playwright mit erfundenen Rezepten, die das
  echte Skript erzeugt hat; CI-Job `kochbuch`, Pages baut `/kochbuch/app/`.
- **Repo heisst `apps`** (bis 27.10.2026 `application_study`): alle Adressen unter `https://simonbruder-hub.github.io/apps/`.
  GitHub leitet die alte Website-Adresse nicht weiter. Die Daten im Browser bleiben (gleiche Origin
  `simonbruder-hub.github.io`), installierte Web-Apps einmal von der neuen Adresse neu installieren. In Supabase
  Site URL und Redirect URLs auf `/apps/` umstellen (`../supabase/README.md`, Abschnitt 4). Die Desktop-App 1.1.0 findet
  Updates weiter, weil GitHub Repo- und Release-Adressen umleitet; die neue Adresse steckt ab dem nächsten Release drin.

## Offen

1. **Name und Domain:** Das Repo heisst schon `apps`. «Taktwerk» ist vergeben (auch als Firma). Neuen Namen wählen, prüfen (nic.ch, swissreg.ch),
   dann umbenennen (Texte, Manifest, Startseite, Desktop), Pages auf `/` und `/app/` umbauen, Custom Domain und DNS,
   Supabase Site-URL/Redirects anpassen. Die Desktop-App ist davon unabhängig (eingebaut); nur die Adresse für Updates
   (`plugins.updater.endpoints` in `desktop/src-tauri/tauri.conf.json`) zeigt auf GitHub Releases. Neue Adresse = neuer
   Browser-Speicher, Daten kommen über Sync zurück.
2. Technik ausbauen: Cursor auch in Y-Richtung (Umschalter X/Y, Anzeige ΔU), Frequenz, Amplitude und Offset der
   Kurve einstellbar, Freeze-Taste zum Ablesen.
3. **Lernlabor ausbauen** (zieht in den Study Hub um, Repo `simonbruder-hub/study-hub`; nächste Schritte in `docs/LERNAPP.md`): Diode, Transistor, OP; mehr Aufgaben;
   Fächer Elektromagnetismus, Physik, Chemie, Mathematik in Stufen.
4. Optional: eigener Superhelden-Stil (eigene Figur).
5. Ziel danach: eigene Accounts für die Website mit beiden Apps, online und offline auf allen Geräten.
6. Bekannt: der E2E-Test «läuft nach dem Neuladen an der richtigen Stelle weiter» schlägt lokal im Profil «mobile» fehl
   (auch ohne die neuen Änderungen), in CI prüfen.
7. Dschungelschlange optional ebenfalls in 3D.
8. Updater beim nächsten Desktop-Release prüfen (z. B. 1.1.1): In der installierten 1.1.0 erscheint «Update» in der
   Kopfzeile, die Installation startet die App neu.
9. Android als App mit Tauri 2 (geplante Benachrichtigung zum Phasenende), iPhone: Web Push über Supabase
   (siehe [`PLATTFORMEN.md`](PLATTFORMEN.md)).
10. Kochbuch: Rezepte über die gemeinsamen Konten synchronisieren statt Import pro Gerät; Einkaufszettel auch an die
    neue Haushalt-App, sobald sie eine Einkaufsliste hat (dort Modul M6).
