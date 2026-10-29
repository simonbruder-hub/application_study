# Aufgaben und Entscheidungen (Übergabe zwischen Chats)

Neuer Chat: «Mach Aufgabe N aus docs/AUFGABEN.md.» Ein Chat pro Aufgabe. Arbeitsweise, Befehle und Stolpersteine
in Kürze stehen in `CLAUDE.md` (lädt automatisch); `taktwerk/docs/STATUS.md` nur für Aufgaben zu Taktwerk.

## Arbeitsweise

- Deutsch, kein scharfes S, keine Gedankenstriche. Kurz und verständlich erklären (Elektrotechnik-Student,
  kennt Python und LaTeX, wenig Webentwicklung).
- Erst gezielte Fragen zu Unklarem, dann ein kurzer Plan, dann umsetzen.
- Eigener Branch und PR, CI grün machen. Mergen erst nach OK (erst dann baut GitHub Pages neu).
- Ein Chat pro Aufgabe. Sparsam mit Tokens: lokal nur die betroffenen Tests, die volle Prüfung macht die CI.
  Am Ende diese Datei nachführen (erledigte Aufgaben auf eine Zeile mit PR) und bei Taktwerk `taktwerk/docs/STATUS.md`.

## Geräte und Antworten (Oktober 2026)

- Laptop mit Windows, Browser Firefox und Chrome. Am Laptop vor allem die **Desktop-App** (Tauri).
- Handy: Android, daneben auch iPhone.
- Die Desktop-App soll lokal ohne Internet laufen, Sync, sobald Netz da ist.
- Anmeldung: Supabase schickt nur einen Link (Vorlage noch ohne `{{ .Token }}`), der Link endet auf einer
  Seite mit Fehler 404 (Site-URL). Eigenes Supabase-Projekt ist eingerichtet.
- Widget bis Desktop-App 1.0.3: normales Fenster mit Rahmen, oben und unten zu viel Platz, viel zu gross,
  lässt sich nur begrenzt verkleinern (Mindestgrösse 360 × 560), muss jedes Mal von Hand angepasst werden.
  Mit 1.1 gelöst (eigenes Widget-Fenster, siehe Aufgabe 2).
- Entscheide zu Aufgabe 2: Daten der alten Desktop-App automatisch übernehmen; Signierschlüssel hat Claude erzeugt
  (geheimer Teil nur als GitHub-Secret); Hauptfenster wird beim Widget ausgeblendet; Widget kompakt.
- Kochbuch: Das Overleaf-Projekt liegt seit Aufgabe 3 im Repo `Kochbuch_Altstetten`. Overleaf Premium über die
  Hochschule (GitHub-Sync geht).
- Entscheide zu Aufgabe 3: Kategorie als zwei Felder, `art` (Frühstück, Salat, Suppe, Hauptgericht, Beilage, Dessert,
  Gebäck, Getränk, Snack) und `ernaehrung` (vegetarisch, Fisch, Fleisch). Verträglichkeit ist die Magen-Ampel
  (`gut`, `anpassung`, `meiden`). Zutaten bleiben Freitext, das Skript zerlegt sie für den Einkauf.
- Kochbuch-App: nach Kategorien, aber auch nach Jahreszeit, Verträglichkeit usw. ausrichten. Zutaten an den
  Einkauf der Haushaltsapp schicken, wenn umsetzbar.
- Entscheide zu Aufgabe 5: Die Rezepte kommen nicht auf die öffentliche Website. Die App lädt `rezepte.json` oder das
  ZIP aus der Kochbuch-CI einmal pro Gerät. Die neue Haushalt-App hat noch keine Einkaufsliste (M6), darum gehen die
  Zutaten direkt in die Liste der alten «Kasse unterwegs» (gleiche Website, gleicher Speicher; vorher schliessen).
- Repo-Name: `apps` (bis 27.10.2026 `application_study`), damit der Name zum Inhalt passt. Website jetzt unter
  `https://simonbruder-hub.github.io/apps/`; die alte Adresse leitet GitHub nicht weiter.
- Entscheid zu Aufgabe 4 (28.10.2026): zuerst nur verlinken, eine Karte auf der Startseite. Die Finanzapp bleibt im
  eigenen Repo `haushaltskasse-app`. Dort laufen zwei Apps: die neue «Haushalt» (`/haushaltskasse-app/neu/`, Belege,
  Ausgleich, Budget) und die ältere «Kasse unterwegs» (`/haushaltskasse-app/`, Einkaufsliste, an die das Kochbuch sendet).
- Lohnrechner (28.10.2026): aus der Excel-Vorlage «Berechnung ML auf Std.» eine eigene kleine App mit Karte unter
  «Für den Alltag». Gewünscht: freie Werte, rückwärts rechnen, Verdienst aus Stunden. Der echte Lohn aus der Vorlage
  kommt nicht auf die Website, nicht ins Repo und nicht in die Tests.
- Study Hub (28.10.2026): vernetztes Formelbuch mit Simulationen und Lernhilfen als eigenes, öffentliches Projekt im
  Repo `simonbruder-hub/study-hub` (Briefing, Entscheide und Aufgaben dort). Das Lernlabor zieht dorthin um.
- Bachelorarbeit: eigenes Repo und eigene Chats. Später App und Website dazu, jetzt nichts veröffentlichen,
  aber darauf auslegen.

## Aufgaben

1. **Ton am Laptop zuverlässig** (erledigt, siehe STATUS.md). Offen: auf dem Laptop prüfen, Desktop-App neu
   installieren (Version 1.0.2).
2. **Desktop-App als Hauptapp am Laptop** (erledigt: Desktop-App 1.1.0, am Laptop getestet und veröffentlicht, siehe
   STATUS.md und `taktwerk/desktop/README.md`). Offen: Updater beim nächsten Release prüfen.
   Ursprünglicher Auftrag (frühere Aufgaben «Widget» und «richtige App»):
   - App fest in die Desktop-App einbauen statt die Online-Version zu laden: läuft offline, eine Datenquelle.
     Updates über den Tauri-Updater (Signierschlüssel als GitHub-Secret).
   - Widget als eigenes Tauri-Fenster: ohne Rahmen, immer im Vordergrund, Grösse passt sich dem Inhalt an,
     frei verkleinerbar, merkt sich Ort und Grösse, alle Stile, Steuerung und Ton, auch nach dem Neuladen.
   - Ton und Benachrichtigung nativ über Tauri (unabhängig vom Webfenster).
   - Browser: Bild-im-Bild in Chrome passend machen (`src/app/pip.tsx`, `src/ui/components/Mini.tsx`).
     Firefox kennt kein Bild-im-Bild, dort bleibt die Mini-Ansicht.
   - Installer und Code-Signing gegen die SmartScreen-Warnung prüfen. Android (TWA oder Capacitor) und
     iPhone (PWA über Safari, Grenzen im Hintergrund) vergleichen und eine Lösung empfehlen.
3. **Kochbuch nach LaTeX** (erledigt: PR `simonbruder-hub/Kochbuch_Altstetten#1`, Aufbau und JSON-Format im README
   dort). Offen: Overleaf mit dem Repo abgleichen (das bisherige Overleaf-Projekt nicht mehr nach GitHub pushen),
   Einteilung nach Art und Ernährung durchsehen.
   Ursprünglicher Auftrag (Repo `simonbruder-hub/Kochbuch_Altstetten`, privat):
   - Feste Rezeptvorlage (Umgebung `rezept` mit Kategorie, Jahreszeit, Verträglichkeit, Zutaten, Schritten,
     Geschichte, Geheimtipp), ein Gericht pro Datei, Overleaf über GitHub-Sync.
   - Lokale LaTeX- und PDF-Teile ins Repo übernehmen.
   - Python-Skript liest die Vorlage und erzeugt die Daten (JSON) für die App. Das Kochbuch bleibt die
     einzige Quelle.
4. **Website als App-Sammlung** (dieses Repo). Erster Schritt erledigt (PR `simonbruder-hub/apps#11`, siehe
   STATUS.md): Karte «Haushalt» auf der Startseite (Abschnitt «Für den Alltag», neben dem Kochbuch) und Link in der
   Kopfzeile, die App bleibt im eigenen Repo. Dazu der Lohnrechner als eigene App `lohn/` (PR
   `simonbruder-hub/apps#12`, siehe STATUS.md). Offen: einheitliches Design, gemeinsame Konten, Struktur für weitere
   Apps (auch die Bachelorarbeit); danach entscheiden, ob die Haushalt-App doch hierher kommt. Den Knopf
   «Kasse unterwegs» auf der Karte entfernen, sobald die neue App eine Einkaufsliste hat (dort M6).
   Ursprünglicher Auftrag: Haushaltsapp (Repo `simonbruder-hub/haushaltskasse-app`, nur Finanzen und Einkauf)
   einbinden. Vorschlag: ins Repo übernehmen oder aus dem eigenen Repo bauen. Einheitliches Design, später
   gemeinsame Konten, Struktur für weitere Apps (auch die Bachelorarbeit).
5. **Kochbuch-App** (erledigt: PR `simonbruder-hub/apps#8`, App `kochbuch/`, siehe STATUS.md und
   `kochbuch/README.md`). Offen: auf dem Handy
   prüfen (ZIP aus der Kochbuch-CI laden, an Kasse unterwegs senden), Grundvorrat-Liste in `src/logic/einkauf.ts`
   nach Bedarf anpassen.
   Ursprünglicher Auftrag: Liest die Daten aus Aufgabe 3, Filter nach Kategorie, Jahreszeit, Verträglichkeit,
   Zutaten in den Einkauf der Haushaltsapp. Achtung: Die Website ist öffentlich, das Kochbuch-Repo privat.
   Vor dem Veröffentlichen klären, was sichtbar sein darf.
   Daten: `python skripte/rezepte_json.py` im Kochbuch-Repo erzeugt `daten/rezepte.json` (nicht im Repo, die CI
   lädt sie als Artefakt hoch). Filter über `art`, `ernaehrung`, `saison.jahreszeiten` und `magen.stufe`, für den
   Einkauf `zutaten[].einkauf` (Menge, Einheit, Name).

6. **Study Hub** (eigenes Repo `simonbruder-hub/study-hub`, Startsatz dort). Hier betrifft es nur den Umzug des
   Lernlabors: Startseite, Links in Taktwerk und eine Weiterleitung auf die neue Adresse, sobald es dort läuft.

## Später

- Android-App mit Tauri 2 und iPhone mit Web Push über Supabase (Empfehlung in `taktwerk/docs/PLATTFORMEN.md`).
- Code-Signing gegen die SmartScreen-Warnung, sobald die App weitergegeben wird (SignPath Foundation, braucht eine
  Open-Source-Lizenz für das Repository).

- Kochbuch als Buch überarbeiten: mehr Charakter, eigene Geschichten, Geheimtipps, weniger KI-Ton.
  Veröffentlichung, sobald es passt. Die Vorlage hat dafür `\geschichte{}` und `\geheimtipp{}` (noch leer).
- Pausenspiele ans Laptop-Format anpassen, alte Spiele verbessern, neue dazu.
- Lernlabor: Der Ausbau geht im Study Hub weiter (Aufgabe 6). Name und Domain: `taktwerk/docs/STATUS.md`, Punkt «Offen».
- Kochbuch: Rezepte über gemeinsame Konten synchronisieren statt Import pro Gerät; Einkaufszettel an die neue
  Haushalt-App, sobald sie eine Einkaufsliste hat (M6).

## Technische Hinweise

- In `taktwerk/`, `lernlabor/`, `kochbuch/` und `lohn/`: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`;
  in `taktwerk/` dazu `npm run build:single`.
- Playwright in der Cloud: Chromium unter `/opt/pw-browsers/chromium`. Lokale Config mit
  `launchOptions.executablePath`, nicht committen. Der Testbrowser ohne Bildschirm erlaubt Ton immer,
  `tests/e2e/sound.spec.ts` bildet die Ton-Sperre darum nach.
- 3D-Spiele laufen ohne Grafikkarte sehr langsam. E2E-Tests mit 3D unter Last einzeln wiederholen.
- Der E2E-Test «läuft nach dem Neuladen an der richtigen Stelle weiter» (mobile) schlägt lokal fehl, in der CI
  läuft er durch.
- `pkill` immer in einem eigenen Bash-Aufruf.
- Desktop-App: `npm run build:desktop` baut die eingebaute App nach `dist/desktop`. Rust prüfen im Ordner
  `taktwerk/desktop/src-tauri` mit `cargo check` (Linux braucht `libwebkit2gtk-4.1-dev libasound2-dev`). Die echte App
  läuft in der Cloud unter `Xvfb` (Steuerung mit `xdotool`, Bilder mit `import`), sehr langsam ohne Grafikkarte.
  Windows baut der Workflow «Desktop-App» bei jedem PR, der die Desktop-App betrifft.
- Kochbuch-Repo: `python -m unittest discover -s skripte` und `python skripte/rezepte_json.py`. PDF lokal mit
  `latexmk -pdf main.tex`; in der Cloud vorher TeX Live per apt installieren (`texlive-latex-extra texlive-pictures
  texlive-fonts-recommended texlive-lang-german tex-gyre lmodern latexmk`). `gh pr create` geht in der Cloud nicht
  (GraphQL gesperrt), PRs über `gh api repos/<owner>/<repo>/pulls`.
