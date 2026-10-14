# Pomodoro-Planer

Pomodoro-Timer mit Aufgaben, Projekt-Tracking, Auswertung von Lern- und Arbeitszeit und Kalender zur Planung. Läuft im Browser auf Laptop und Android, lässt sich als App installieren und funktioniert offline.

## Funktionen

- **Fokus-Timer** – Fokus, kurze und lange Pause. Zeiten frei einstellbar, eigene Vorlagen (Klassisch 25/5/15, Kurz, Lang, Deep Work), während der Runde mit −5/+5 anpassbar. Pausen und nächster Fokus starten auf Wunsch automatisch. Signalton (pünktlich, auch im Hintergrund-Tab), Benachrichtigung, Bildschirm wach halten.
- **Aufgaben** – mit Projekt, geschätzten Pomodoros, Datum und Uhrzeit. Eine Aufgabe wird mit ▶ zur aktuellen Aufgabe des Timers, die Zeit wird ihr automatisch gutgeschrieben.
- **Projekte** – jedes Projekt gehört zu *Lernen*, *Arbeit* oder *Sonstiges*, mit Farbe, Zielzeit und Termin. Zeigt Gesamtzeit, Zeit dieser Woche, Fortschritt und die letzten 14 Tage.
- **Kalender** – Wochenplanung mit Drag & Drop (oder ‹ › auf dem Handy), Tageskapazität in Pomodoros, Monatsübersicht mit Kalenderwochen, Projektterminen und erfasster Zeit.
- **Auswertung** – Tag, Woche, Monat oder Jahr: Lern- und Arbeitszeit, Verlauf, Aufteilung nach Projekt, Vergleich mit der Vorperiode, Textzusammenfassung zum Kopieren, Protokoll, Zeit nachtragen, CSV-Export.
- **Minimieren** – auf dem Laptop (Chrome/Edge) als kleines schwebendes Fenster, das über anderen Programmen bleibt; sonst als kompakte Mini-Ansicht.
- **Darstellung** – Tag, Nacht oder automatisch, dazu der **Anime-Stil** mit Tomaten-Chan, Speedlines und Kirschblüten in den Pausen (bei Tag und Nacht).

## Tastenkürzel

| Taste | Aktion |
|---|---|
| Leertaste | Start / Pause / Weiter |
| F | Fokus beenden & speichern |
| S | Pause überspringen |
| M | Minimieren |
| N | Neue Aufgabe |
| T | Tag / Nacht wechseln |
| 1–6 | Ansicht wechseln |

## Verwenden

**Als App (Laptop und Android)** – Die Seite über GitHub Pages öffnen (siehe unten) und installieren:
- Laptop: in Chrome oder Edge rechts in der Adressleiste auf das Installieren-Symbol klicken.
- Android: in Chrome im Menü ⋮ «App installieren» bzw. «Zum Startbildschirm hinzufügen» wählen.

Auf Android in den Einstellungen **«Im Hintergrund weiterlaufen»** einschalten: Dann bleibt der Timer aktiv, wenn die App minimiert ist, klingelt pünktlich und lässt sich über die Benachrichtigung starten und pausieren.

**Als einzelne Datei** – [`download/pomodoro-planer.html`](download/pomodoro-planer.html) herunterladen (auf GitHub «Download raw file») und per Doppelklick öffnen. Läuft ohne Internet.

## Daten

Die Daten liegen im Browser des jeweiligen Geräts (bzw. im Claude-Konto, wenn die App auf claude.ai geöffnet wird – dann sind sie auf allen Geräten gleich). Um Daten zwischen Laptop und Handy zu übertragen: *Einstellungen → Backup exportieren* und auf dem anderen Gerät *Backup importieren* (zusammenführen oder ersetzen).

## GitHub Pages einrichten (einmalig)

1. Im Repository *Settings → Pages → Build and deployment → Source* auf **GitHub Actions** stellen.
2. Nach jedem Push auf `main` veröffentlicht der Workflow `.github/workflows/pages.yml` die App unter
   `https://simonbruder-hub.github.io/application_study/pomodoro-planer/`.

## Entwicklung

Reines HTML/CSS/JavaScript ohne Abhängigkeiten.

```
pomodoro-planer/
├── index.html            App-Gerüst und Icons
├── css/app.css           Gestaltung (Tag, Nacht, Anime)
├── js/                   util, store (Daten), timer, ui, charts, app
│   └── views/            fokus, aufgaben, projekte, kalender, auswertung, einstellungen
├── sw.js, manifest.webmanifest, icons/   installierbare App / offline
├── download/             gebaute Einzeldatei
└── scripts/              build.mjs (Einzeldatei), icons.mjs (PNG-Icons)
```

```bash
npm start          # lokaler Server auf http://localhost:8080
npm run build      # erzeugt download/pomodoro-planer.html neu
npm run icons      # rendert die PNG-Icons (braucht Playwright)
```

Nach Änderungen an `index.html`, `css/` oder `js/` `npm run build` ausführen, damit die Download-Datei aktuell bleibt.
