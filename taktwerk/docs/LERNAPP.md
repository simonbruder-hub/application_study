# Lernapp (Spin-off): Plan und Stand

Eigenständige Lern-App neben der Pomodoro-App, Arbeitsname **Lernlabor**, Code in [`../../lernlabor/`](../../lernlabor/).
Adresse: `https://simonbruder-hub.github.io/application_study/lernlabor/app/`.
Taktwerk verlinkt sie in den Einstellungen (Karte «App») und im Stil Technik mit einem Knopf in den Pausen.

## Geklärt (Oktober 2026)

- Wissensstand: Ohm und Kirchhoff, Netzwerkanalyse, Wechselstrom komplex und Schaltvorgänge sind bekannt.
  Theorie deshalb kompakt wie eine Formelsammlung, Gewicht auf Ausprobieren und Aufgaben.
- Reihenfolge: Gleichstrom, dann Wechselstrom, dann Schaltvorgänge.
- Lernform: beides, freier Baukasten und Aufgaben in Stufen.
- Schaltzeichen nach IEC 60617 (Rechteck für R, Bögen für L). Werte frei eingebbar mit SI-Vorsatz, E12-Pfeile zum Durchschalten.
- Name und Adresse: Arbeitsname Lernlabor unter `/lernlabor/app/`, Umbenennung später zusammen mit Taktwerk.

## Fächer

- [x] Elektrotechnik (Baukasten, Theorie und Aufgaben in 3 Kapiteln und 3 Stufen)
- [ ] Elektromagnetismus (Stufen angelegt: Feld, Kondensator, Magnetfeld, Induktion, Maxwell)
- [ ] Physik (Stufen angelegt)
- [ ] Chemie (Stufen angelegt)
- [ ] Mathematik in Stufen (6 Stufen angelegt)

## Kern: Schaltungen aufbauen (Elektrotechnik)

Fertig:
- Baukasten auf einem Raster: Widerstand, Spule, Kondensator, Spannungs- und Stromquelle (Gleich, Sinus, Rechteck),
  Schalter, Umschalter, Lampe (leuchtet nach Leistung), Volt- und Amperemeter, Masse, Drähte (auch über Eck, T-Abzweig auf Drähten).
- Rechnung mit modifiziertem Knotenpotenzialverfahren (MNA): Gleichstrom, Wechselstrom komplex, Zeitverlauf mit BDF2.
  Zustand bleibt beim Ändern von Werten und beim Schalten erhalten, so sieht man Ein- und Ausschaltvorgänge live.
- Anzeigen: Oszilloskop (Rollmodus, Zeitlupe automatisch, u und i je Bauteil, bis 4 angeheftete Grössen),
  Zeigerdiagramm (auch drehend), Frequenzgang (Betrag und Phase), Werte (Augenblick, Effektiv, P, Q, S, Z, φ, Endwerte).
- Kennwerte für Schaltungen 1. und 2. Ordnung: τ, f_g, f₀, δ, f_d, Güte, Fall (aperiodisch, Grenzfall, Schwingfall).
- 9 Beispiele, Rückgängig, Link teilen, Speichern im Browser.
- Theorie zu Gleichstrom, Wechselstrom, Schaltvorgängen mit KaTeX und Sprüngen in den Baukasten.
- 16 Aufgaben-Generatoren in Stufe 1 bis 3 mit Lösungsweg Schritt für Schritt, Prüfen mit Toleranz, «Im Baukasten öffnen».
  Jede Lösung wird in den Tests gegen den Rechenkern geprüft.

## Technik

Wie Taktwerk: Vite, Preact, TypeScript, PWA (offline), GitHub Pages. Formeln mit KaTeX.
Rechenkern ohne DOM mit Tests (Lehrbuchwerte: Teiler, Knotenpotenzial, RC 63.2 % bei τ, RL, LC ohne Amplitudenverlust,
Tiefpass −3 dB bei f_g, RLC-Kennwerte). End-to-End-Tests mit Playwright (Bauen, Schalten, Aufgaben, Theorie).

## Nächste Schritte

1. Weitere Bauteile: Diode und LED (nichtlinear, Newton-Iteration), Transistor, Operationsverstärker, Transformator.
2. Mehr Aufgaben je Stufe (Brückenschaltung, Stern-Dreieck, Parallelschwingkreis, Hochpass, Blindleistungskompensation)
   und Aufgaben, die direkt im Baukasten gelöst werden (Schaltung bauen, bis ein Messwert stimmt).
3. Oszilloskop: Trigger, Cursor (wie in Taktwerk Technik), Spuren als CSV speichern.
4. Elektromagnetismus als nächstes Fach (Feldbilder, Induktion mit Animation), danach Mathematik in Stufen.
5. Fortschritt über Geräte synchronisieren (gleiche Konten wie Taktwerk), Lernzeit an Taktwerk melden.
