# Taktwerk Desktop (Windows, Linux)

Kleine Desktop-Hülle mit [Tauri 2](https://tauri.app): zeigt die Einzeldatei der Web-App (`dist/single`) in einem
eigenen Fenster. Gedacht vor allem für Firefox-Nutzer, denn Firefox installiert auf dem PC keine Web-Apps.

Die Installer baut GitHub Actions (`.github/workflows/desktop.yml`), sobald ein Tag `desktop-v*` gepusht wird:

```bash
git tag desktop-v1.0.1 && git push origin desktop-v1.0.1
```

Oder ohne Tag: GitHub → Actions → «Desktop-App» → «Run workflow» und eine Version eintragen (z. B. `1.0.1`).

Das Release enthält feste Dateinamen, damit die Links auf der Startseite und in der App stabil bleiben:
`Taktwerk-Setup.exe`, `Taktwerk.msi`, `Taktwerk.AppImage`, `Taktwerk.deb`.

Lokal bauen (Rust und die [Tauri-Voraussetzungen](https://tauri.app/start/prerequisites/) nötig), im Ordner `taktwerk/`:

```bash
npm ci
npx vite build --mode single
npx tauri icon web/public/icon-512.png -o desktop/src-tauri/icons
npx tauri build
```

Hinweise:
- Die Desktop-App hat einen eigenen Speicher (getrennt vom Browser). Mit Sync erscheinen dieselben Daten.
- Ohne Code-Signing-Zertifikat zeigt Windows beim ersten Start eine SmartScreen-Warnung
  («Weitere Informationen» → «Trotzdem ausführen»).
