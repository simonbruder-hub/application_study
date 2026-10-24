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

## Nächste Session (Wünsche vom 24.10.2026)

1. **Name und Domain:** «Taktwerk» ist schon vergeben (auch als Firma). Vor dem Kauf einer Domain einen neuen Namen
   wählen und prüfen (nic.ch für `.ch`, swissreg.ch für Marken). Danach umbenennen (Texte, Manifest, Startseite) und
   Pages so umbauen, dass die Startseite unter `/` und die App unter `/app/` liegt; Custom Domain in den Pages-Einstellungen,
   DNS beim Registrar (CNAME `www` → `simonbruder-hub.github.io`), Supabase Site-URL/Redirects und `desktop/loader/index.html`
   anpassen. Achtung: neue Adresse = neuer Browser-Speicher, Daten kommen über Sync zurück.
2. **Tags und Farbsystem** (Konzept steht im Chat): Feld `tags text[]` an `projects`, Tag-Farben in `user_settings`
   (`tag_colors jsonb`), Schema-Update in Supabase, Projekt-Dialog mit Tag-Auswahl, farbige Projektauswahl, Auswertung nach Tag.
3. **Neue Stile «Tiere»:**
   - **Meer:** Fische, Oktopus usw. (z. B. Fischschwärme im Fokus, Quallen in der Pause, Feier mit Luftblasen).
   - **Flora:** Blumen mit Bienen, Käfern, Schmetterlingen.
4. **Natur → «Forest»:** umbenennen; statt der Topfpflanze wächst ein Baum, und **jede Pause ein anderer Baum**
   (z. B. Tanne, Eiche, Birke, Kirschbaum; der Wald füllt sich über den Tag).
5. Optional: eigener Superhelden-Stil (eigene Figur, keine geschützte wie Spider-Man).
