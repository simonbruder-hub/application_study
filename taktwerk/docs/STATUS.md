# Stand & Übergabe

Für die Weiterarbeit in einem neuen Chat: Dieses Dokument, [`ARCHITEKTUR.md`](ARCHITEKTUR.md) und [`../README.md`](../README.md) lesen.
Taktwerk (früher Pomodoro-Planer) liegt auf `main`. GitHub Pages veröffentlicht
die App unter `https://simonbruder-hub.github.io/application_study/taktwerk/app/`.

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
- Desktop-App (Tauri) lädt die Online-Version und aktualisiert sich selbst.
- Zeiger ziehen auf die Sekunde genau (min. 5 s), Umschalt+Pfeil ±10 s; `planned_seconds` immer ganzzahlig.
- Flora blumiger (Blütenkranz, Kletterrosen, volle Wiese), Zug mit fahrendem Zug, Bahnhof (kurze Pause) und
  Zürich HB (lange Pause), Sci-Fi mit Raumgefecht und dem Pausenspiel Space Rider (`src/ui/game/`).

- Pausenspiele für alle Stile (`src/ui/game/`): Space Rider mit Boss, Hummelflug, Grand Prix, Waldjagd, Sudoku,
  Geschenkejagd, Kürbismann, Memory. Neue Stile Weihnachten und Halloween. Elemente-Spektakel und Elementwahl,
  Technik-Oszilloskop interaktiv, Zug mit SBB-Uhren, Zugwahl und Zug zum Anfassen, Zeiger behält seinen Massstab.

## Offen

1. **Name und Domain:** «Taktwerk» ist schon vergeben (auch als Firma). Neuen Namen wählen, prüfen (nic.ch, swissreg.ch),
   dann umbenennen (Texte, Manifest, Startseite, Desktop), Pages auf `/` und `/app/` umbauen, Custom Domain und DNS,
   Supabase Site-URL/Redirects und `desktop/loader/index.html` anpassen. Neue Adresse = neuer Browser-Speicher, Daten kommen über Sync zurück.
2. Technik ausbauen: Cursor auch in Y-Richtung (Umschalter X/Y, Anzeige ΔU), Frequenz, Amplitude und Offset der
   Kurve einstellbar, Freeze-Taste zum Ablesen.
3. Pausenspiel Technik: Schaltungsbaukasten (Widerstand, Spule, Kondensator, Quellen), der korrekte Werte berechnet.
   Vor dem Bau mit dem Nutzer klären: Gleich- oder Wechselstrom, Zeitverläufe (RC, RL, RLC), Symbole nach IEC,
   Aufgabenstellungen, Lösungsweg mit Formeln, Anbindung an das Oszilloskop.
4. Optional: eigener Superhelden-Stil (eigene Figur).
5. Ziel danach: Website mit mehreren Apps (diese ist eine davon), eigene Accounts, online und offline auf allen Geräten.
