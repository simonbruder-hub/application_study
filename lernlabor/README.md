# Lernlabor

Eigenständige Lernapp neben Taktwerk. Zuerst Elektrotechnik: Schaltungen aus R, L, C, Quellen und Schaltern
aufbauen und Strom und Spannung im Oszilloskop sehen. Dazu Theorie und Aufgaben in drei Stufen.
Elektromagnetismus, Physik, Chemie und Mathematik sind als Fächer mit Stufen angelegt und folgen.

Adresse: `https://simonbruder-hub.github.io/apps/lernlabor/app/` (Arbeitsname, Umbenennung später zusammen mit Taktwerk).

## Bedienung Baukasten

| Aktion | So geht es |
|---|---|
| Bauteil setzen | Bauteil oben wählen, auf das Raster tippen. Vorher `R` dreht. |
| Draht | Werkzeug «Draht» und von Punkt zu Punkt ziehen, oder in «Auswahl» direkt von einem Anschluss ziehen. Über Eck geht automatisch. |
| Verschieben, Werte ändern | Bauteil antippen und ziehen; Werte rechts mit SI-Vorsatz (`4k7`, `100u`, `2,2 m`) oder E12-Pfeilen. |
| Schalten | Schalter oder Umschalter antippen. |
| Messen | Ausgewähltes Bauteil erscheint mit u(t) und i(t) im Oszilloskop, weitere Grössen anheften. |
| Anzeigen | Oszilloskop, Zeiger (bei Sinusquellen), Frequenzgang, Werte mit Kennwerten τ, f_g, f₀, δ, Güte. |
| Tasten | `Entf` löscht, `R` dreht, `D` Draht, `Esc` Auswahl, Leertaste hält an, `Strg+Z` / `Strg+Y`. |

Zählpfeile: Verbraucher-Zählpfeilsystem, bei Quellen Erzeuger-Zählpfeilsystem. Zeiger mit Sinus als Bezug.

## Technik

Vite, Preact, TypeScript, PWA (offline), KaTeX für Formeln. Der Rechenkern in `src/sim/` kommt ohne DOM aus:

- `netlist.ts`: Rasterpunkte zu Knoten (Drähte, Punkte auf Drähten, Masse)
- `mna.ts`: modifiziertes Knotenpotenzialverfahren für Gleichstrom, Wechselstrom (komplex) und Zeitverlauf
  (Rückwärts-Euler im ersten Schritt, danach BDF2; Matrix einmal zerlegt, pro Schritt nur Vorwärts- und Rückwärtseinsetzen)
- `analysis.ts`: Eigenwerte aus det(Y(s)) für τ, f₀, δ, Fall; Frequenzgang; automatische Zeitbasis
- `units.ts`: SI-Vorsätze lesen und schreiben, E12-Reihe

Aufgaben (`src/learn/et/tasks.ts`) sind Generatoren mit Zufallswerten aus der E12-Reihe. Die Tests prüfen jede Lösung
mit 25 Wertesätzen gegen den Rechenkern.

```bash
npm ci
npm run dev        # http://localhost:5174
npm test           # Rechenkern und Aufgaben
npm run typecheck
npm run build      # dist/app
npm run test:e2e   # Playwright gegen dist/app (vorher bauen)
npm run icons      # PNG-Icons aus web/public/icon.svg
```

Mit einem vorinstallierten Chromium anderer Version: `PW_CHROMIUM=/pfad/zu/chrome npm run test:e2e`.
