# Taktwerk

Pomodoro-Timer und Stechuhr für Lernen und Arbeit: Projekte, Aufgaben, Auswertung, 15 Stile und ein Pausenspiel zu jedem Stil. Läuft im Browser auf Laptop und Handy, lässt sich als App installieren, funktioniert offline und synchronisiert auf Wunsch zwischen deinen Geräten.

| | |
|---|---|
| Startseite | [simonbruder-hub.github.io/application_study/taktwerk/](https://simonbruder-hub.github.io/application_study/taktwerk/) |
| App | [simonbruder-hub.github.io/application_study/taktwerk/app/](https://simonbruder-hub.github.io/application_study/taktwerk/app/) |
| Einzeldatei (Notfall, offline) | [`download/taktwerk.html`](download/taktwerk.html) |

Die frühere Adresse `…/pomodoro-planer/v2/` leitet automatisch auf die App weiter.

## Funktionen

- **Lernen / Arbeit** – Umschalter oben in der Kopfzeile (Taste W). Projekte, Aufgaben, Zeiten und Auswertung gelten jeweils für den gewählten Modus.
- **Pomodoro und Stechuhr** – Pomodoro mit Fokus, kurzer und langer Pause (Längen und Vorlagen frei einstellbar, −5/+5 während der Runde). Die Stechuhr läuft offen bis zum Stopp; Beginn und Dauer lassen sich nachträglich korrigieren. Die Zeit wird immer aus Zeitstempeln berechnet – kein Wegdriften, auch nicht im Hintergrund oder nach dem Neuladen.
- **Mini-Player** – Taste M: auf dem Laptop (Chrome/Edge) ein schwebendes Fenster über allen Programmen, sonst die Mini-Ansicht. Auf dem Handy erscheint eine Leiste über der Navigation, sobald der Timer läuft.
- **Projekte und Aufgaben** – Aufgaben gehören zu einem Projekt, mit Status, Priorität, Fälligkeit und Schätzung in Pomodoros oder Stunden. ▶ bei einer Aufgabe startet den Timer dafür; die Zeit wird ihr gutgeschrieben.
- **Auswertung** – Woche, Monat, Jahr: Verlauf nach Projekt, Vergleich mit der Vorperiode, Protokoll, Zeit nachtragen, Zusammenfassung zum Kopieren, CSV- und Excel-Export.
- **Sync** – Mit einem kostenlosen Supabase-Projekt erscheinen Änderungen auf allen Geräten, auch der laufende Timer: auf dem Laptop starten, auf dem Handy pausieren. Offline wird alles lokal gespeichert und später übertragen. Anzeige oben rechts: grün = synchron, gelb = offline, rot = Fehler, grau = nur lokal.
- **Zeiger ziehen** – den Zeiger auf dem Zifferblatt mit Maus oder Finger verschieben: vorspringen oder verlängern (auch über eine volle Runde hinaus), auf die Sekunde genau bis hinunter auf 5 Sekunden; Pfeiltasten ±1 Minute, mit Umschalt ±10 Sekunden, Bild auf/ab ±5 Minuten.
- **Pausenspiele:** In jeder Pause öffnet der Knopf unter dem Zifferblatt das Spiel des Stils (Vollbild, Tasten gehen nur ans Spiel, endet die Pause, hält das Spiel an; Rekord je Spiel):
  - **Space Rider** (Sci-Fi): Weltraum-Shooter mit Extras und Mutterschiff als Boss.
  - **Hummelflug** (Flora): Nektar sammeln, Wespen stechen, Netze und Vögel meiden.
  - **Grand Prix** (Rennen): auf der Strecke bleiben, überholen, Boost-Felder, Ölflecken.
  - **Waldjagd** (Forest): nach Moorhuhn-Art mit Zapfen-Schleuder, Tiere teils hinter Bäumen; Wanderer, Igel, Vogelhaus nicht treffen.
  - **Sudoku** (Amtlich): vier Stufen, Tipps mit Begründung, gesperrte Felder für die gewählte Zahl, Notizen, Spielstand bleibt.
  - **Geschenkejagd** (Weihnachten): Elf fängt Geschenke, Kohle meiden. **Kürbismann** (Halloween): nachts im Wald rechtzeitig reagieren.
  - **Memory** (alle übrigen Stile): Motive passend zum Stil, 6, 8 oder 12 Paare.
- **Tags und Farben** – Projekte mit Tags (z. B. «Coding», «Lernen», «Admin») und freier Farbe; Tags in Projektkarten, Auswertung «Nach Tag», Verwaltung unter Einstellungen → Tags.
- **Signale** – sieben synthetische Töne (Glocke, Marimba, Gong, Harfe, Kristall, Vogelruf, Digital), je für Ende Fokus, kurze und lange Pause; Restzeit auf Wunsch ausblenden (nur Zifferblatt).
- **Darstellung** – Tag, Nacht oder automatisch, «Bewegung» (Aus, Dezent, Lebendig) und 15 Stile. Jeder Stil hat eigene Szenen für Fokus, kurze und lange Pause, ein Bild, das mit dem Fortschritt wächst, eine Einblendung beim Phasenwechsel und eine Feier nach jeder gespeicherten Session:
  - **Klassisch:** Glas-Karten, leuchtendes Zifferblatt, Atemkreis in der Pause, Tomate füllt sich; Konfetti.
  - **Anime:** Tomaten-Chan, Blitze, Herzen, Laternenfest, Power-Leiste; «やった!».
  - **Technik:** Oszilloskop: Kurve zieht beim Überfahren elastisch mit, Messcursor X1/X2 mit ΔX, Δt, 1/Δt, RUN/STOP-Taste, in der langen Pause XY-Modus mit Strahl und Nachleuchten; Kennwerte, LED-Pegel; Funkenregen.
  - **Barock:** römische Ziffern, Pendel im Sekundentakt, Sanduhr, Kerzen, Tafelmusik, Feuerwerk.
  - **Forest:** pro Pomodoro wächst ein Baum (jedes Mal eine andere Art), darunter der Wald des Tages; Wind und Sonnenuntergang in den Pausen.
  - **Amtlich:** Formular mit getipptem Status, Aktenstapel, Kaffeepause, Stempel «Pendent» und «Erledigt».
  - **Rennen:** Rennwagen als Zeiger, Randsteine, Startampel, Strecke bis zur Zielflagge.
  - **Flug:** Flugzeug als Zeiger, Wolken, Route ZRH → Ziel mit Flughöhe, Looping.
  - **Meer:** Fisch als Zeiger, Fischschwärme, Quallen, Oktopus, Tauchtiefe, Plankton in der Nacht.
  - **Flora:** Biene als Zeiger, Blütenkranz um die Uhr, Kletterrosen, volle Wiese (Tulpen, Margeriten, Sonnenblumen, Mohn, Rosen, Pusteblumen), Bienen, Marienkäfer und Käfer.
  - **Sci-Fi:** Raumschiff als Zeiger, Warp-Sprung, Raumgefecht im Hintergrund, Radar, Planet mit Ring, HUD, Reise zum Mars.
  - **Elemente:** Feuer im Fokus, Wasser in der kurzen, Luft in der langen Pause, Erde in Ruhe, oder ein Element fest gewählt (Kugeln unter der Uhr). Endet ein Element, folgt ein Spektakel: Flammenmeer mit Brandspuren, Schwall mit Tropfen, Böe, die alles wegstösst, Felssturz, der das Zifferblatt bricht.
  - **Zug:** SBB-Bahnhofsuhr als Zifferblatt (Kelle mit Halt bei 12), Lok auf dem Gleisring, blauer Himmel mit Wolken oder Sterne. Ein elektrischer Zug (Re 460, Giruno, FLIRT, Krokodil oder Glacier Express) fährt mit dem Fortschritt, durch Wald und über ein Viadukt; festhalten hält den Timer an, nach vorne schieben spult vor. Kurze Pause: Halt an einem Bahnhof, lange Pause: Zürich HB mit Halle, SBB-Uhr und Abfahrtstafel.
  - **Weihnachten:** Lichterkette, geschmückter Baum, Schneefall, Schlitten mit Rentieren, verschneite Hütte, Tannenkranz um die Uhr, Adventskranz als Fortschritt.
  - **Halloween:** Spukhügel, Mond, Fledermäuse, Nebel, Kürbisse, Geister, Spinnennetz hinter der Uhr, Hexenkessel als Fortschritt; die Spinne am Faden lässt sich ziehen und federt zurück.

### Tastenkürzel

| Taste | Aktion |
|---|---|
| Leertaste | Start / Pause / Weiter |
| F | Fertig & speichern (Stechuhr: Stopp & speichern) |
| S | Pause überspringen |
| M | Minimieren (schwebendes Fenster / Mini-Ansicht) |
| W | Lernen ↔ Arbeit |
| T | Tag ↔ Nacht |
| N | Neue Aufgabe |
| 1–5 | Ansicht wechseln |
| Esc | Mini-Ansicht schliessen |

## Installieren

1. Die Seite öffnen (Link oben).
2. **Laptop:** in Chrome oder Edge rechts in der Adressleiste auf das Installieren-Symbol klicken (oder *Einstellungen → App installieren*).
3. **Android:** in Chrome im Menü ⋮ **«App installieren»** wählen.

Auf dem Handy ist der **«Hintergrund-Modus»** automatisch eingeschaltet: Der Timer bleibt aktiv, wenn die App minimiert oder der Bildschirm gesperrt ist, klingelt pünktlich und lässt sich über die Benachrichtigung starten und pausieren. Beim ersten Start des Timers fragt die App einmal, ob sie Benachrichtigungen senden darf: **Zulassen** wählen, sonst meldet sie sich bei gesperrtem Handy nicht.

**Einzeldatei:** [`download/taktwerk.html`](download/taktwerk.html) herunterladen (auf GitHub «Download raw file») und per Doppelklick öffnen. Läuft ohne Internet; die Daten liegen dann im Browser für genau diese Datei.

## Sync einrichten (optional, einmalig)

Ohne Sync liegen die Daten nur auf dem jeweiligen Gerät. Für den Abgleich zwischen Laptop und Handy:

1. Kostenloses Projekt auf [supabase.com](https://supabase.com) anlegen und das SQL-Skript ausführen – Schritt für Schritt in [`supabase/README.md`](supabase/README.md). Nach App-Updates das Skript erneut ausführen (es ist idempotent); seit den Tags braucht es die Spalten `projects.tags` und `user_settings.tag_colors`.
2. In der App *Einstellungen → Sync & Konto* die Projekt-URL und den Anon-Key eintragen.
3. Mit deiner E-Mail-Adresse anmelden (Code aus der E-Mail eingeben). Auf jedem Gerät gleich vorgehen.

## GitHub Pages einrichten (einmalig)

1. Im Repository *Settings → Pages → Build and deployment → Source* auf **GitHub Actions** stellen.
2. Nach jedem Push auf `main` baut und veröffentlicht `.github/workflows/pages.yml` Startseite und App.
3. Optional unter *Settings → Secrets and variables → Actions → Variables* `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` setzen – dann ist die Sync-Verbindung in der veröffentlichten App schon vorbelegt.

## Entwicklung

Vite + Preact + TypeScript, lokale Datenbank Dexie (IndexedDB), Sync über Supabase. Aufbau und Entscheidungen: [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md).

```
taktwerk/
├── web/index.html         Einstiegsseite der App (Icons, Schriften)
├── site/                  Startseite (statisch) mit Vorschaubildern
├── src/
│   ├── main.tsx, App.tsx  Start, App-Rahmen
│   ├── app/               Zustand (Signals), Aktionen, Timer-Steuerung, Mini-Player, Tastatur
│   ├── views/             Fokus, Aufgaben, Projekte, Auswertung, Einstellungen
│   ├── ui/                Bausteine, Dialoge, Stile (skins.ts, styles/skins/*.css, SkinDecor.tsx)
│   ├── data/              Datenmodell, lokale Datenbank, Repository, Datenübernahme
│   ├── sync/              Sync-Engine, Live-Timer, Supabase-Anbindung
│   ├── domain/            Timer-Berechnung, Kennzahlen, Plan-Status (Health)
│   └── excel/             Excel-Export und -Import
├── supabase/              SQL-Schema, Einrichtung, Datenbank-Tests
└── tests/e2e/             Browser-Tests (Playwright)
```

```bash
npm install
npm run dev            # Entwicklungsserver: http://localhost:5173
npm run build          # PWA nach dist/app
npm run build:single   # Einzeldatei download/taktwerk.html
npm test               # Unit-Tests (Vitest)
npm run typecheck      # TypeScript
npm run db:test        # SQL-Schema gegen PostgreSQL 16 testen
npm run test:e2e       # Browser-Tests (vorher build)
```

GitHub Pages veröffentlicht bei jedem Push auf `main`: Startseite unter `/taktwerk/`, App unter `/taktwerk/app/`, Einzeldatei unter `/taktwerk/taktwerk.html`.
