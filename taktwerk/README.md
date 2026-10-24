# Taktwerk

Pomodoro-Timer und Stechuhr für Lernen und Arbeit: Projekte, Aufgaben, Auswertung und sechs Stile. Läuft im Browser auf Laptop und Handy, lässt sich als App installieren, funktioniert offline und synchronisiert auf Wunsch zwischen deinen Geräten.

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
- **Darstellung** – Tag, Nacht oder automatisch und sechs Stile. Jeder Stil hat eigene Szenen für Fokus, kurze und lange Pause (auch der Seitenhintergrund wechselt) und feiert einen geschafften Pomodoro:
  - **Klassisch:** leuchtendes Zifferblatt, pulsierender Ring; Pause mit Atemkreis (4 s ein, 4 s aus), lange Pause mit Blasen; Konfetti.
  - **Anime:** Tomaten-Chan, Manga-Linien; Fokus mit Blitzen und Energie-Aura, kurze Pause mit Herzen und Blüten, lange Pause als Laternenfest mit Sternschnuppen; «やった!».
  - **Technik:** Datenblatt am Tag, Oszilloskop in der Nacht; laufende Messkurve (Sinus CH1, Rechteck mit Spektrum CH2, Lissajous im XY-Modus CH3), Kennwerte T, f und Tastgrad; «PASS».
  - **Barock:** Gold, römische Ziffern, Pendel im Sekundentakt und Kerzen; kurze Pause mit Tafelmusik, lange Pause mit Feuerwerk; «Bravissimo!».
  - **Natur:** Wald mit Sonne bzw. Mond und Wolken, eine Pflanze wächst mit dem Fokus; Wind und fallende Blätter in der Pause, Sonnenuntergang mit Vögeln in der langen Pause; die Pflanze blüht auf.
  - **Amtlich:** Formular mit Status im Kopf, Kaffeepause, Schild «Mittagspause» und Papierflieger; Stempel «Pendent» und «Erledigt».

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

1. Kostenloses Projekt auf [supabase.com](https://supabase.com) anlegen und das SQL-Skript ausführen – Schritt für Schritt in [`supabase/README.md`](supabase/README.md).
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
