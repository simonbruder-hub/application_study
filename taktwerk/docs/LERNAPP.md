# Lernapp (Spin-off): Plan

Eigenständige Lern-App neben der Pomodoro-App. Die Pomodoro-App bekommt einen Link dorthin
(Einstellungen und Pausenknopf im Stil Technik).

## Fächer

- [ ] Elektrotechnik (zuerst)
- [ ] Elektromagnetismus
- [ ] Physik
- [ ] Chemie
- [ ] Mathematik in Stufen

## Kern: Schaltungen aufbauen (Elektrotechnik)

- Baukasten auf einem Raster: Widerstand, Spule, Kondensator, Spannungs- und Stromquelle (Gleich, Sinus, Rechteck),
  Schalter, Lampe; später Diode, Transistor, Operationsverstärker.
- Berechnung mit Knotenpotenzialverfahren (MNA): Gleichstrom direkt, Wechselstrom komplex (Zeiger, Impedanz),
  Zeitverläufe (Ein- und Ausschalten von RC, RL, RLC) mit kleinem Zeitschritt.
- Anzeige: Oszilloskop mit u(t) und i(t) je Bauteil, Zeigerdiagramm, Werte U, I, P, Z, φ, τ, f0, Grenzfrequenz.
- Theorie zu jedem Thema mit Formeln, Aufgaben in Stufen mit Lösungsweg Schritt für Schritt.

## Technik

Wie die Pomodoro-App: Vite, Preact, TypeScript, PWA (offline), GitHub Pages. Formeln mit KaTeX.
Rechenkern ohne DOM und mit Tests (bekannte Lösungen aus dem Lehrbuch als Prüfwerte).

## Vor dem Bau mit dem Nutzer klären

- Wissensstand und aktueller Semesterstoff (Skript oder Formelsammlung vorhanden?)
- Gleichstrom, Wechselstrom, Zeitverläufe: welche Reihenfolge?
- Schaltzeichen nach IEC/DIN, Werte aus E-Reihen mit Toleranz?
- Freies Bauen, Aufgaben mit Stufen oder beides?
- Name und Adresse der Lernapp
