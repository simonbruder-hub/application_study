# Taktwerk Desktop (Windows, Linux)

Desktop-App mit [Tauri 2](https://tauri.app). Die App ist fest eingebaut (`npm run build:desktop` → `dist/desktop`),
läuft also ohne Internet; Sync mit Supabase, sobald Netz da ist. Updates kommen über den Tauri-Updater.

## Was die Desktop-App zusätzlich kann

| Funktion | Wo im Code |
|---|---|
| **Widget:** eigenes Fenster ohne Rahmen, immer im Vordergrund. Taste M oder Knopf «Widget» öffnet es, das Hauptfenster wird ausgeblendet. Die Breite zieht man selbst (frei verkleinerbar), die Höhe passt sich dem Inhalt an. Unter 200 px Breite nur noch Uhr, Start/Pause und Fortschritt. Ort und Grösse bleiben gespeichert, auch nach dem Neustart (startet so, wie man sie verlassen hat). Esc oder ⤢ holt das Hauptfenster zurück. | `src-tauri/src/windows.rs`, `../src/ui/components/Widget.tsx` |
| **Ton und Benachrichtigung aus Rust:** Die App meldet das Phasenende, ein eigener Thread spielt den Ton (gleiche Klänge, einmal berechnet) und zeigt die Systembenachrichtigung, auch wenn das Fenster ausgeblendet oder verdeckt ist. Hauptfenster und Widget melden dasselbe Ende, es klingelt nur einmal. | `src-tauri/src/alarm.rs`, `../src/app/desktop.ts` |
| **Updates:** Beim Start und alle sechs Stunden fragt die App `latest.json` im neusten Release ab. Gibt es eine neue Version, erscheint «Update» in der Kopfzeile; installiert wird erst auf Klick, danach Neustart. | `src-tauri/src/update.rs`, `../src/ui/components/DesktopUpdate.tsx` |
| **Datenübernahme:** Bis 1.0.x lud die Desktop-App die Online-Version, ihre Daten liegen darum unter der Online-Adresse. Beim ersten Start liest ein unsichtbares Fenster diese Daten einmalig aus und die eingebaute App übernimmt, was ihr fehlt (auch Einstellungen und Anmeldung). | `src-tauri/src/handover.rs`, `src-tauri/src/handover.js` |
| Links (Lernlabor, Downloads) öffnen im normalen Browser, ein zweiter Start holt das laufende Fenster nach vorne. | `src-tauri/src/windows.rs`, `main.rs` |

## Installer bauen und veröffentlichen

Die Installer baut GitHub Actions (`.github/workflows/desktop.yml`):

- **Pull Request**, der die Desktop-App betrifft: nur bauen (Windows und Linux). Die Installer liegen beim Lauf unter
  «Artifacts» (`taktwerk-windows`) und lassen sich vor dem Mergen ausprobieren.
- **Release:** GitHub → Actions → «Desktop-App» → «Run workflow» und eine Version eintragen (z. B. `1.1.0`), oder per Tag:

```bash
git tag desktop-v1.1.0 && git push origin desktop-v1.1.0
```

Die Version wird beim Bauen in die App geschrieben (muss höher sein als die installierte, sonst gibt es kein Update).
Das Release enthält feste Dateinamen, damit die Links auf der Startseite und in der App stabil bleiben:
`Taktwerk-Setup.exe`, `Taktwerk.msi`, `Taktwerk.AppImage`, `Taktwerk.deb` und `latest.json` (für den Updater).

### Signierschlüssel für Updates (einmalig)

Der Updater installiert nur Dateien, die mit dem eigenen Schlüssel signiert sind. Der öffentliche Teil steht in
`src-tauri/tauri.conf.json` (`plugins.updater.pubkey`), der geheime Teil gehört in zwei GitHub-Secrets
(Repository → Settings → Secrets and variables → Actions → «New repository secret»):

- `TAURI_SIGNING_PRIVATE_KEY`: Inhalt der Schlüsseldatei
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: das Passwort dazu

Fehlen die Secrets, baut der Workflow trotzdem, aber ohne Update-Signatur (Warnung im Lauf, kein `latest.json`).
Den geheimen Schlüssel zusätzlich sicher aufbewahren (z. B. Passwort-Manager): Geht er verloren, finden installierte
Apps keine Updates mehr und müssen einmal von Hand neu installiert werden (mit neuem Schlüssel).

## Lokal bauen

Rust und die [Tauri-Voraussetzungen](https://tauri.app/start/prerequisites/) nötig, im Ordner `taktwerk/`:

```bash
npm ci
npm run build:desktop
npx tauri icon web/public/icon-512.png -o desktop/src-tauri/icons
npx tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

Ohne Desktop-App lässt sich das Verhalten im Browser prüfen: `tests/e2e/desktop.spec.ts` bildet die Desktop-App nach.

## Hinweise

- Die Desktop-App hat einen eigenen Speicher (getrennt vom Browser). Mit Sync erscheinen dieselben Daten.
- Ohne Code-Signing-Zertifikat zeigt Windows beim ersten Start eine SmartScreen-Warnung
  («Weitere Informationen» → «Trotzdem ausführen»). Möglichkeiten dagegen: [`../docs/PLATTFORMEN.md`](../docs/PLATTFORMEN.md).
- Die Adresse der Datenübernahme (`handover` in `tauri.conf.json`) zeigt auf die bisherige Online-Adresse und bleibt so,
  auch wenn die Website später umzieht.
