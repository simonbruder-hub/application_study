# Pomodoro-Planer

Pomodoro-Timer und Stechuhr mit Lern- und Arbeitsmodus, Projekten, Aufgaben und Auswertung. Läuft im Browser auf Laptop und Android, lässt sich als App installieren, funktioniert offline und synchronisiert auf Wunsch zwischen deinen Geräten.

Es gibt zwei Versionen:

| | Version 2 (neu) | Version 1 |
|---|---|---|
| Öffnen | [`…/pomodoro-planer/v2/`](https://simonbruder-hub.github.io/application_study/pomodoro-planer/v2/) | [`…/pomodoro-planer/`](https://simonbruder-hub.github.io/application_study/pomodoro-planer/) |
| Einzeldatei | [`download/pomodoro-planer-v2.html`](download/pomodoro-planer-v2.html) | [`download/pomodoro-planer.html`](download/pomodoro-planer.html) |
| Sync Laptop ↔ Handy | ja (optional, Supabase) | nein (Backup-Datei) |
| Kalender | folgt in Phase 3 | ja |

Beim ersten Start übernimmt Version 2 automatisch die Daten von Version 1 im selben Browser. Version 1 bleibt unverändert nutzbar.

## Version 2 – Funktionen

- **Lernen / Arbeit** – Umschalter oben in der Kopfzeile (Taste W). Projekte, Aufgaben, Zeiten und Auswertung gelten jeweils für den gewählten Modus.
- **Pomodoro und Stechuhr** – Pomodoro mit Fokus, kurzer und langer Pause (Längen und Vorlagen frei einstellbar, −5/+5 während der Runde). Die Stechuhr läuft offen bis zum Stopp; Beginn und Dauer lassen sich nachträglich korrigieren. Die Zeit wird immer aus Zeitstempeln berechnet – kein Wegdriften, auch nicht im Hintergrund oder nach dem Neuladen.
- **Mini-Player** – Taste M: auf dem Laptop (Chrome/Edge) ein schwebendes Fenster über allen Programmen, sonst die Mini-Ansicht. Auf dem Handy erscheint eine Leiste über der Navigation, sobald der Timer läuft.
- **Projekte und Aufgaben** – Aufgaben gehören zu einem Projekt, mit Status, Priorität, Fälligkeit und Schätzung in Pomodoros oder Stunden. ▶ bei einer Aufgabe startet den Timer dafür; die Zeit wird ihr gutgeschrieben.
- **Auswertung** – Woche, Monat, Jahr: Verlauf nach Projekt, Vergleich mit der Vorperiode, Protokoll, Zeit nachtragen, Zusammenfassung zum Kopieren, CSV- und Excel-Export.
- **Sync** – Mit einem kostenlosen Supabase-Projekt erscheinen Änderungen auf allen Geräten, auch der laufende Timer: auf dem Laptop starten, auf dem Handy pausieren. Offline wird alles lokal gespeichert und später übertragen. Anzeige oben rechts: grün = synchron, gelb = offline, rot = Fehler, grau = nur lokal.
- **Darstellung** – Tag, Nacht oder automatisch, dazu der **Anime-Stil** mit Tomaten-Chan.

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

Auf Android in den Einstellungen **«Hintergrund-Modus»** einschalten: Dann bleibt der Timer aktiv, wenn die App minimiert ist, klingelt pünktlich und lässt sich über die Benachrichtigung starten und pausieren.

**Einzeldatei:** [`download/pomodoro-planer-v2.html`](download/pomodoro-planer-v2.html) herunterladen (auf GitHub «Download raw file») und per Doppelklick öffnen. Läuft ohne Internet; die Daten liegen dann im Browser für genau diese Datei.

## Sync einrichten (optional, einmalig)

Ohne Sync liegen die Daten nur auf dem jeweiligen Gerät. Für den Abgleich zwischen Laptop und Handy:

1. Kostenloses Projekt auf [supabase.com](https://supabase.com) anlegen und das SQL-Skript ausführen – Schritt für Schritt in [`supabase/README.md`](supabase/README.md).
2. In der App *Einstellungen → Sync & Konto* die Projekt-URL und den Anon-Key eintragen.
3. Mit deiner E-Mail-Adresse anmelden (Code aus der E-Mail eingeben). Auf jedem Gerät gleich vorgehen.

## GitHub Pages einrichten (einmalig)

1. Im Repository *Settings → Pages → Build and deployment → Source* auf **GitHub Actions** stellen.
2. Nach jedem Push auf `main` baut und veröffentlicht `.github/workflows/pages.yml` beide Versionen.
3. Optional unter *Settings → Secrets and variables → Actions → Variables* `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` setzen – dann ist die Sync-Verbindung in der veröffentlichten App schon vorbelegt.

## Entwicklung

Version 2: Vite + Preact + TypeScript, lokale Datenbank Dexie (IndexedDB), Sync über Supabase. Aufbau und Entscheidungen: [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md).

```
pomodoro-planer/
├── v2/index.html          Einstiegsseite v2 (Icons, Schriften)
├── src/
│   ├── main.tsx, App.tsx  Start, App-Rahmen
│   ├── app/               Zustand (Signals), Aktionen, Timer-Steuerung, Mini-Player, Tastatur
│   ├── views/             Fokus, Aufgaben, Projekte, Auswertung, Einstellungen
│   ├── ui/                Bausteine, Dialoge, Stile (Tag/Nacht/Anime)
│   ├── data/              Datenmodell, lokale Datenbank, Repository, v1-Übernahme
│   ├── sync/              Sync-Engine, Live-Timer, Supabase-Anbindung
│   ├── domain/            Timer-Berechnung, Kennzahlen, Plan-Status (Health)
│   └── excel/             Excel-Export und -Import
├── supabase/              SQL-Schema, Einrichtung, Datenbank-Tests
├── tests/e2e/             Browser-Tests (Playwright)
└── index.html, css/, js/  Version 1 (ohne Build)
```

```bash
npm install
npm run dev            # Entwicklungsserver v2: http://localhost:5173
npm run build:v2       # PWA nach dist/v2
npm run build:single   # Einzeldatei download/pomodoro-planer-v2.html
npm test               # Unit-Tests (Vitest)
npm run typecheck      # TypeScript
npm run db:test        # SQL-Schema gegen PostgreSQL 16 testen
npm run test:e2e       # Browser-Tests (vorher build:v2)
npm run build          # Einzeldatei der Version 1
```
