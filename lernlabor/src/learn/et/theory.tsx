/** Theorie Elektrotechnik: kompakt wie eine Formelsammlung, mit Verweisen in den Baukasten */
import type { ComponentChildren } from 'preact';
import { href } from '../../router';
import { Tex } from '../../ui/Tex';

export interface Section { title: string; body: ComponentChildren }
export interface TheoryChapter { title: string; intro: string; sections: Section[] }

const Try = ({ ex, children }: { ex: string; children: ComponentChildren }) => (
  <p class="try"><a href={href(`/et/bauen?bsp=${ex}`)}>Im Baukasten: {children}</a></p>
);

export const THEORY: Record<string, TheoryChapter> = {
  gleichstrom: {
    title: 'Gleichstrom',
    intro: 'Zeitlich konstante Grössen. Mit Ohm und Kirchhoff lässt sich jedes lineare Netz berechnen, das Knotenpotenzialverfahren macht daraus ein Schema.',
    sections: [
      {
        title: 'Grundgrössen und Zählpfeile',
        body: (
          <>
            <p>Spannung <Tex>{'U'}</Tex> in V, Strom <Tex>{'I'}</Tex> in A, Widerstand <Tex>{'R'}</Tex> in Ω, Leistung <Tex>{'P'}</Tex> in W.</p>
            <Tex block>{'U = R \\cdot I \\qquad P = U \\cdot I = I^2 R = \\frac{U^2}{R} \\qquad G = \\frac{1}{R}'}</Tex>
            <p>Verbraucher-Zählpfeilsystem: Spannungs- und Strompfeil zeigen in die gleiche Richtung, dann ist <Tex>{'P > 0'}</Tex> aufgenommene Leistung. Bei Quellen zeigt das Lernlabor die abgegebene Leistung (Erzeuger-Zählpfeilsystem).</p>
          </>
        ),
      },
      {
        title: 'Kirchhoffsche Regeln',
        body: (
          <>
            <p>Knotenregel: Die Summe der zufliessenden Ströme ist gleich der Summe der abfliessenden.</p>
            <Tex block>{'\\sum_k I_k = 0 \\quad \\text{(Knoten)} \\qquad \\sum_k U_k = 0 \\quad \\text{(Masche)}'}</Tex>
            <p>Maschenregel: Bei einem Umlauf ist die Summe aller Spannungen null (Pfeile in Umlaufrichtung positiv).</p>
          </>
        ),
      },
      {
        title: 'Reihe, Parallel, Teiler',
        body: (
          <>
            <Tex block>{'R_{Reihe} = R_1 + R_2 \\qquad \\frac{1}{R_{par}} = \\frac{1}{R_1} + \\frac{1}{R_2} \\;\\Rightarrow\\; R_{par} = \\frac{R_1 R_2}{R_1 + R_2}'}</Tex>
            <Tex block>{'\\frac{U_2}{U} = \\frac{R_2}{R_1 + R_2} \\qquad \\frac{I_2}{I} = \\frac{R_1}{R_1 + R_2}'}</Tex>
            <p>Ein belasteter Teiler liefert weniger Spannung: Die Last liegt parallel zu <Tex>{'R_2'}</Tex>.</p>
            <Try ex="teiler">Spannungsteiler mit Last</Try>
          </>
        ),
      },
      {
        title: 'Ersatzspannungsquelle',
        body: (
          <>
            <p>Jedes lineare Netz verhält sich an zwei Klemmen wie eine Quelle <Tex>{'U_0'}</Tex> mit Innenwiderstand <Tex>{'R_i'}</Tex> (Thévenin).</p>
            <Tex block>{'U_0 = U_{Leerlauf} \\qquad R_i = \\frac{U_0}{I_K} \\qquad I_L = \\frac{U_0}{R_i + R_L}'}</Tex>
            <p><Tex>{'R_i'}</Tex> findest du auch, indem du Spannungsquellen kurzschliesst, Stromquellen entfernst und den Widerstand an den Klemmen bestimmst. Maximale Leistung bei <Tex>{'R_L = R_i'}</Tex>: <Tex>{'P_{max} = U_0^2/(4R_i)'}</Tex>.</p>
          </>
        ),
      },
      {
        title: 'Knotenpotenzialverfahren',
        body: (
          <>
            <p>Ein Knoten wird Masse (<Tex>{'\\varphi = 0'}</Tex>). Für jeden anderen Knoten gilt die Knotenregel, die Ströme schreibt man mit den Potenzialen:</p>
            <Tex block>{'I_{ab} = \\frac{\\varphi_a - \\varphi_b}{R} \\qquad \\mathbf{G}\\,\\boldsymbol{\\varphi} = \\mathbf{I}_q'}</Tex>
            <p>Das gibt ein lineares Gleichungssystem mit der Leitwertmatrix <Tex>{'\\mathbf{G}'}</Tex>. Genau so rechnet das Lernlabor, erweitert um Spannungsquellen und Spulen (modifiziertes Verfahren, MNA).</p>
          </>
        ),
      },
    ],
  },
  wechselstrom: {
    title: 'Wechselstrom',
    intro: 'Sinusförmige Grössen gleicher Frequenz rechnet man mit Zeigern (komplexen Zahlen). Aus Differentialgleichungen werden algebraische Gleichungen.',
    sections: [
      {
        title: 'Sinusgrössen',
        body: (
          <>
            <Tex block>{'u(t) = \\hat{U} \\sin(\\omega t + \\varphi_u) \\qquad \\omega = 2\\pi f = \\frac{2\\pi}{T} \\qquad U = \\frac{\\hat{U}}{\\sqrt{2}}'}</Tex>
            <p><Tex>{'U'}</Tex> ist der Effektivwert: Er setzt in einem Widerstand die gleiche Leistung um wie eine Gleichspannung <Tex>{'U'}</Tex>. Netz: <Tex>{'U = 230\\,\\mathrm{V}'}</Tex>, <Tex>{'\\hat{U} \\approx 325\\,\\mathrm{V}'}</Tex>.</p>
          </>
        ),
      },
      {
        title: 'Zeiger und Impedanz',
        body: (
          <>
            <Tex block>{'\\underline{U} = U e^{j\\varphi_u} \\qquad \\underline{Z} = \\frac{\\underline{U}}{\\underline{I}} = R + jX = |\\underline{Z}|\\, e^{j\\varphi}'}</Tex>
            <Tex block>{'\\underline{Z}_R = R \\qquad \\underline{Z}_L = j\\omega L \\qquad \\underline{Z}_C = \\frac{1}{j\\omega C} = -\\frac{j}{\\omega C}'}</Tex>
            <p>An L eilt die Spannung dem Strom um 90° voraus, an C um 90° nach. <Tex>{'\\varphi = \\varphi_u - \\varphi_i'}</Tex>: positiv induktiv, negativ kapazitiv. Reihe und Parallel wie bei Gleichstrom, nur komplex.</p>
            <p class="small muted">Im Lernlabor ist der Sinus der Bezug: Ein Zeiger mit Winkel 0 gehört zu <Tex>{'\\hat{U}\\sin(\\omega t)'}</Tex>. Drehende Zeiger zeigen den Augenblickswert als Projektion auf die senkrechte Achse.</p>
            <Try ex="tiefpass">RC an Sinus mit Zeigerdiagramm</Try>
          </>
        ),
      },
      {
        title: 'Leistung',
        body: (
          <>
            <Tex block>{'\\underline{S} = \\underline{U}\\,\\underline{I}^* = P + jQ \\qquad P = UI\\cos\\varphi \\qquad Q = UI\\sin\\varphi \\qquad S = UI'}</Tex>
            <p>Wirkleistung <Tex>{'P'}</Tex> in W wird in R umgesetzt, Blindleistung <Tex>{'Q'}</Tex> in var pendelt zwischen Quelle und L bzw. C. Leistungsfaktor <Tex>{'\\cos\\varphi = P/S'}</Tex>.</p>
            <Try ex="rl-wechsel">RL am Netz</Try>
          </>
        ),
      },
      {
        title: 'Resonanz',
        body: (
          <>
            <Tex block>{'\\omega_0 = \\frac{1}{\\sqrt{LC}} \\qquad Z_0 = \\sqrt{\\frac{L}{C}} \\qquad Q_{Reihe} = \\frac{1}{R}\\sqrt{\\frac{L}{C}} = \\frac{U_C}{U}'}</Tex>
            <p>Im Reihenkreis heben sich bei <Tex>{'f_0'}</Tex> die Blindwiderstände auf: Der Strom ist maximal, an L und C liegt die <Tex>{'Q'}</Tex>-fache Spannung. Bandbreite <Tex>{'B = f_0 / Q'}</Tex>.</p>
            <Try ex="rlc-reihe">RLC-Reihenschwingkreis</Try>
          </>
        ),
      },
      {
        title: 'Tiefpass, Hochpass, Grenzfrequenz',
        body: (
          <>
            <Tex block>{'\\underline{H}_{TP} = \\frac{1}{1 + j f/f_g} \\qquad \\underline{H}_{HP} = \\frac{j f/f_g}{1 + j f/f_g} \\qquad f_g = \\frac{1}{2\\pi RC} = \\frac{R}{2\\pi L}'}</Tex>
            <p>Bei <Tex>{'f_g'}</Tex>: <Tex>{'|\\underline{H}| = 1/\\sqrt{2}'}</Tex> (−3 dB), Phase ±45°. Darüber bzw. darunter: 20 dB pro Dekade. Dezibel: <Tex>{'|\\underline{H}|_{dB} = 20 \\lg |\\underline{H}|'}</Tex>.</p>
          </>
        ),
      },
    ],
  },
  schaltvorgaenge: {
    title: 'Schaltvorgänge',
    intro: 'Beim Ein- und Ausschalten wechseln Strom und Spannung nicht sofort: Energiespeicher brauchen Zeit. Die Lösungen sind e-Funktionen mit der Zeitkonstante τ.',
    sections: [
      {
        title: 'Stetigkeit',
        body: (
          <>
            <p>Die Spannung am Kondensator und der Strom durch die Spule können nicht springen, weil die gespeicherte Energie nicht springen kann:</p>
            <Tex block>{'W_C = \\tfrac{1}{2} C u_C^2 \\qquad W_L = \\tfrac{1}{2} L i_L^2 \\qquad i_C = C\\frac{du_C}{dt} \\qquad u_L = L\\frac{di_L}{dt}'}</Tex>
            <p>Springen dürfen dagegen <Tex>{'i_C'}</Tex> und <Tex>{'u_L'}</Tex>. Beim Öffnen eines Spulenstromkreises entsteht deshalb eine hohe Spannung (Funke).</p>
          </>
        ),
      },
      {
        title: 'Schaltungen 1. Ordnung',
        body: (
          <>
            <Tex block>{'x(t) = x_\\infty + \\left(x(0^+) - x_\\infty\\right) e^{-t/\\tau} \\qquad \\tau_{RC} = R_i C \\qquad \\tau_{RL} = \\frac{L}{R_i}'}</Tex>
            <p>Vorgehen: Anfangswert aus der Stetigkeit, Endwert aus dem Gleichstromfall (C offen, L Draht), <Tex>{'R_i'}</Tex> ist der Ersatzwiderstand, den der Speicher sieht. Nach <Tex>{'\\tau'}</Tex> sind 63.2 % erreicht, nach <Tex>{'5\\tau'}</Tex> 99.3 %.</p>
            <Tex block>{'\\text{Laden: } u_C = U\\left(1 - e^{-t/\\tau}\\right),\\; i = \\frac{U}{R} e^{-t/\\tau} \\qquad \\text{Entladen: } u_C = U e^{-t/\\tau}'}</Tex>
            <Try ex="rc">RC laden und entladen</Try>
            <Try ex="rl">RL ein- und ausschalten</Try>
          </>
        ),
      },
      {
        title: 'RLC: Schaltungen 2. Ordnung',
        body: (
          <>
            <Tex block>{'\\frac{d^2 u_C}{dt^2} + 2\\delta \\frac{du_C}{dt} + \\omega_0^2 u_C = \\omega_0^2 U \\qquad \\delta = \\frac{R}{2L} \\qquad \\omega_0 = \\frac{1}{\\sqrt{LC}}'}</Tex>
            <ul>
              <li><Tex>{'\\delta < \\omega_0'}</Tex>: gedämpfte Schwingung mit <Tex>{'\\omega_d = \\sqrt{\\omega_0^2 - \\delta^2}'}</Tex>, Hüllkurve <Tex>{'e^{-\\delta t}'}</Tex></li>
              <li><Tex>{'\\delta = \\omega_0'}</Tex>: aperiodischer Grenzfall, schnellstes Einschwingen ohne Überschwingen, <Tex>{'R = 2\\sqrt{L/C}'}</Tex></li>
              <li><Tex>{'\\delta > \\omega_0'}</Tex>: Kriechfall, zwei abklingende e-Funktionen</li>
            </ul>
            <p>Das Lernlabor bestimmt δ, f₀ und den Fall für jede Schaltung 2. Ordnung aus den Nullstellen der Determinante der Knotenmatrix.</p>
            <Try ex="rlc-schalt">gedämpfte RLC-Schwingung</Try>
          </>
        ),
      },
      {
        title: 'Periodisches Schalten',
        body: (
          <>
            <p>An einer Rechteckspannung lädt und entlädt sich C immer wieder. Ist die Periode viel länger als <Tex>{'\\tau'}</Tex>, folgt <Tex>{'u_C'}</Tex> fast dem Rechteck; ist sie viel kürzer, entsteht ein kleines Dreieck um den Mittelwert. Das ist der Tiefpass im Zeitbereich.</p>
            <Try ex="rc-rechteck">RC an Rechteckspannung</Try>
          </>
        ),
      },
    ],
  },
};
