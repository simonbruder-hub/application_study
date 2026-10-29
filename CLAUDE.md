# apps: Hinweise für Claude

Diese Datei lädt in jedem Chat automatisch. Kurz halten, nur Orientierung.

**Repo:** Simons eigene Apps für Studium und Alltag, eine gemeinsame Website auf GitHub Pages
(https://simonbruder-hub.github.io/apps/, Startseite `index.html`). Jede App hat ihren eigenen Ordner mit eigenem
`package.json`; Befehle immer im Ordner der App.

| Ordner | App | Stand und Doku |
|---|---|---|
| `taktwerk/` | Pomodoro-Timer und Stechuhr, Sync über Supabase, Desktop-App (Tauri) | `taktwerk/docs/STATUS.md` |
| `kochbuch/` | Rezepte filtern, Portionen, Einkauf; die Rezepte kommen aus dem privaten Repo `Kochbuch_Altstetten` | `kochbuch/README.md` |
| `lernlabor/` | Elektrotechnik-Lernapp; vorerst stillgelegt, soll in den Study Hub (Repo `study-hub`) umziehen | `lernlabor/README.md` |

**Neuer Chat:** «Mach Aufgabe N aus docs/AUFGABEN.md.» Dort stehen Entscheide, Aufgaben und technische Hinweise.
`taktwerk/docs/STATUS.md` nur für Aufgaben zu Taktwerk lesen.

## Arbeitsweise

- Deutsch, kein scharfes S, keine Gedankenstriche. Kurz erklären: Simon studiert Elektrotechnik, kennt Python und
  LaTeX, wenig Webentwicklung.
- Erst gezielte Fragen zu Unklarem, dann ein kurzer Plan, dann umsetzen. Eigener Branch und PR, CI grün machen,
  mergen erst nach Simons OK (erst dann baut GitHub Pages neu).
- Tokens sparen: nur lesen, was die Aufgabe braucht; lokal nur die betroffenen Tests, die volle Prüfung macht die CI.
- Am Ende: in `docs/AUFGABEN.md` die erledigte Aufgabe auf eine Zeile mit PR kürzen, bei Taktwerk
  `taktwerk/docs/STATUS.md` nachführen; diese Datei, wenn sich Befehle oder Stolpersteine ändern.
- Private Inhalte (Rezepte, Daten aus Taktwerk) kommen nicht auf die öffentliche Website.

## Befehle (im Ordner der App)

```bash
npm ci
npm run typecheck && npm test
npm run build
PW_CHROMIUM=/opt/pw-browsers/chromium npm run test:e2e
npm run db:test        # nur taktwerk, braucht PostgreSQL 16
npm run build:single   # nur taktwerk
```

## Stolpersteine in der Cloud

- PR erstellen: `gh api repos/simonbruder-hub/apps/pulls -f title=... -f head=... -f base=main -F body=@datei`
  (`gh pr create` geht nicht). CI-Logs sind gesperrt; Fehler stehen in den Annotations:
  `gh api repos/simonbruder-hub/apps/check-runs/<id>/annotations`.
- Neuer Branch: zusätzlich `git config --add remote.origin.fetch +refs/heads/<branch>:refs/remotes/origin/<branch>`,
  sonst meldet der Stop-Hook ihn als nicht gepusht.
- `pkill` nur in einem eigenen Aufruf und mit Klammer im Muster: `pkill -f "vite previe[w]"`.
- Unicode-Escapes (Backslash, u, vier Hexziffern) nicht mit dem Write-Werkzeug schreiben, es macht echte Zeichen
  daraus; solche Stellen per Skript schreiben.
- Weitere Hinweise (Desktop-App, Kochbuch-Repo, 3D-Spiele, bekannte wacklige Tests): `docs/AUFGABEN.md`, Abschnitt
  «Technische Hinweise».
