/** Fächer und ihr Aufbau in Stufen. Elektrotechnik ist gebaut, die anderen sind geplant. */

export interface Chapter {
  id: string;
  title: string;
  summary: string;
  /** Beispiele im Baukasten zu diesem Kapitel */
  examples: string[];
}

export interface Stage { title: string; topics: string[] }

export interface Subject {
  id: string;
  title: string;
  blurb: string;
  ready: boolean;
  chapters?: Chapter[];
  stages: Stage[];
}

export const SUBJECTS: Subject[] = [
  {
    id: 'et',
    title: 'Elektrotechnik',
    blurb: 'Schaltungen aufbauen und messen: Gleichstrom, Wechselstrom komplex, Schaltvorgänge.',
    ready: true,
    chapters: [
      { id: 'gleichstrom', title: 'Gleichstrom', summary: 'Ohm, Kirchhoff, Teiler, Ersatzquelle, Knotenpotenzialverfahren', examples: ['teiler', 'lampen'] },
      { id: 'wechselstrom', title: 'Wechselstrom', summary: 'Zeiger, Impedanz, Leistung, Resonanz, Tiefpass und Grenzfrequenz', examples: ['tiefpass', 'rlc-reihe', 'rl-wechsel'] },
      { id: 'schaltvorgaenge', title: 'Schaltvorgänge', summary: 'Laden und Entladen von RC und RL, Zeitkonstante, gedämpfte RLC-Schwingung', examples: ['rc', 'rl', 'rlc-schalt', 'rc-rechteck'] },
    ],
    stages: [
      { title: 'Stufe 1: Grundlagen', topics: ['Ohmsches Gesetz', 'Reihe und Parallel', 'Blindwiderstände', 'Zeitkonstante'] },
      { title: 'Stufe 2: Anwendung', topics: ['Gemischte Schaltungen', 'belasteter Teiler', 'RC und RL an Sinus', 'Laden und Entladen'] },
      { title: 'Stufe 3: Vertiefung', topics: ['Knotenpotenzial', 'Ersatzquelle', 'Schwingkreis und Güte', 'RLC-Schaltvorgang'] },
    ],
  },
  {
    id: 'em',
    title: 'Elektromagnetismus',
    blurb: 'Felder verstehen: elektrisches Feld, Kondensator, Magnetfeld, Induktion.',
    ready: false,
    stages: [
      { title: 'Stufe 1: Elektrisches Feld', topics: ['Ladung und Coulomb', 'Feldstärke', 'Potenzial und Spannung'] },
      { title: 'Stufe 2: Kondensator', topics: ['Kapazität', 'Dielektrikum', 'Energie im Feld'] },
      { title: 'Stufe 3: Magnetfeld', topics: ['Durchflutungsgesetz', 'Flussdichte und Kraft', 'magnetischer Kreis'] },
      { title: 'Stufe 4: Induktion', topics: ['Faraday und Lenz', 'Selbstinduktion', 'Transformator'] },
      { title: 'Stufe 5: Maxwell', topics: ['Maxwell-Gleichungen', 'elektromagnetische Wellen'] },
    ],
  },
  {
    id: 'ph',
    title: 'Physik',
    blurb: 'Von der Kinematik bis zu Schwingungen, Wärme und Optik.',
    ready: false,
    stages: [
      { title: 'Stufe 1: Grössen und Bewegung', topics: ['SI-Einheiten', 'Kinematik', 'Vektoren'] },
      { title: 'Stufe 2: Dynamik', topics: ['Newton', 'Energie und Arbeit', 'Impuls'] },
      { title: 'Stufe 3: Schwingungen und Wellen', topics: ['harmonischer Oszillator', 'Dämpfung und Resonanz', 'Wellen'] },
      { title: 'Stufe 4: Thermodynamik', topics: ['Temperatur und Wärme', 'Hauptsätze', 'Wärmeleitung'] },
      { title: 'Stufe 5: Optik und moderne Physik', topics: ['geometrische Optik', 'Interferenz', 'Photonen'] },
    ],
  },
  {
    id: 'ch',
    title: 'Chemie',
    blurb: 'Atombau, Bindungen, Reaktionen bis zur Elektrochemie von Batterie und Akku.',
    ready: false,
    stages: [
      { title: 'Stufe 1: Atombau', topics: ['Atommodell', 'Periodensystem', 'Elektronenkonfiguration'] },
      { title: 'Stufe 2: Bindungen', topics: ['Ionen- und Atombindung', 'Metallbindung', 'Stoffeigenschaften'] },
      { title: 'Stufe 3: Reaktionen', topics: ['Stöchiometrie', 'Energie', 'Gleichgewicht'] },
      { title: 'Stufe 4: Säuren, Basen, Redox', topics: ['pH-Wert', 'Redoxreaktionen'] },
      { title: 'Stufe 5: Elektrochemie', topics: ['galvanische Zelle', 'Batterie und Akku', 'Korrosion'] },
    ],
  },
  {
    id: 'ma',
    title: 'Mathematik in Stufen',
    blurb: 'Das Werkzeug für alles andere, aufbauend in kleinen Schritten.',
    ready: false,
    stages: [
      { title: 'Stufe 1: Algebra', topics: ['Terme und Gleichungen', 'Funktionen', 'Gleichungssysteme'] },
      { title: 'Stufe 2: Funktionen', topics: ['Trigonometrie', 'Exponential- und Logarithmusfunktion'] },
      { title: 'Stufe 3: Komplexe Zahlen und Vektoren', topics: ['Zeigerdarstellung', 'Euler-Formel', 'Vektorrechnung'] },
      { title: 'Stufe 4: Analysis', topics: ['Ableitung', 'Integral', 'Reihen'] },
      { title: 'Stufe 5: Lineare Algebra', topics: ['Matrizen', 'Determinante', 'Eigenwerte'] },
      { title: 'Stufe 6: Differentialgleichungen', topics: ['DGL 1. und 2. Ordnung', 'Fourier', 'Laplace'] },
    ],
  },
];

export const subjectById = (id: string) => SUBJECTS.find((s) => s.id === id);
