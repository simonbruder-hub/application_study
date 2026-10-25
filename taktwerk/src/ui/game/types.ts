/**
 * Gemeinsame Typen der Pausenspiele. Jedes Spiel ist ein Engine-Objekt ohne DOM: Spielregeln (step),
 * Zeichnen (draw) und Anzeige (hud). Die Spielwelt ist immer W × H Einheiten gross; GameLayer skaliert sie.
 */

export interface Pt { x: number; y: number }

/** Eingabe pro Bild */
export interface Input {
  /** Tastenrichtung, je −1..1 */
  dx: number;
  dy: number;
  /** Feuer gehalten (Leertaste, Finger oder Maus gedrückt, Autofeuer) */
  fire: boolean;
  /** Feuer in diesem Bild neu gedrückt */
  press: boolean;
  /** Steuern: Finger oder Maus, solange gedrückt. Zielen: letzte Zeigerposition */
  target: Pt | null;
  /** Zielen: Klicks oder Antippen seit dem letzten Bild */
  taps: Pt[];
  /** Zielen: nachladen (R, rechte Maustaste) */
  reload: boolean;
}

export const NO_INPUT: Input = { dx: 0, dy: 0, fire: false, press: false, target: null, taps: [], reload: false };

export interface HudItem { label: string; value: string; tone?: 'a' | 'b' | 'c' | 'd' }

/** Ton zu einem Ereignis: Wellenform, Startfrequenz, Endfrequenz, Dauer, Lautstärke */
export type Tone = [OscillatorType, number, number, number, number];

export interface Engine<G> {
  W: number;
  H: number;
  create(rng?: () => number): G;
  /** Ein Zeitschritt in Sekunden; liefert Ereignisse für Töne */
  step(g: G, dt: number, input: Input): string[];
  draw(ctx: CanvasRenderingContext2D, g: G): void;
  hud(g: G): HudItem[];
  score(g: G): number;
  over(g: G): boolean;
  tones: Record<string, Tone>;
}

/** Kleiner, vorhersagbarer Zufallsgenerator (für Tests mit festem Startwert) */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hitTest = (ax: number, ay: number, ar: number, bx: number, by: number, br: number) => (ax - bx) ** 2 + (ay - by) ** 2 < (ar + br) ** 2;

/** Funken für Explosionen und Treffer */
export interface Spark { x: number; y: number; vx: number; vy: number; life: number; color: string }
export function burst(list: Spark[], rng: () => number, x: number, y: number, color: string, n: number, speed = 160): void {
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const v = 30 + rng() * speed;
    list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + rng() * 0.5, color });
  }
}
export function moveSparks(list: Spark[], dt: number): Spark[] {
  for (const s of list) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
  return list.filter((s) => s.life > 0);
}
export function drawSparks(ctx: CanvasRenderingContext2D, list: Spark[]): void {
  for (const s of list) {
    ctx.globalAlpha = Math.max(0, Math.min(1, s.life * 2));
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;
}

/** Schwebende Punktzahl (+50, −30) */
export interface Float { x: number; y: number; text: string; color: string; life: number }
export function moveFloats(list: Float[], dt: number): Float[] {
  for (const f of list) { f.y -= 34 * dt; f.life -= dt; }
  return list.filter((f) => f.life > 0);
}
export function drawFloats(ctx: CanvasRenderingContext2D, list: Float[], font: string): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = font;
  for (const f of list) {
    ctx.globalAlpha = Math.min(1, f.life * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.restore();
}

/** Grosse Ansage mitten im Bild (Boss, Stufe) */
export function drawBanner(ctx: CanvasRenderingContext2D, W: number, y: number, text: string, color: string, alpha: number, font: string): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, y - 24, W, 40);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillText(text, W / 2, y - 4);
  ctx.restore();
}

/** Ladebild, solange eine 3D-Ansicht nachgeladen wird */
export function drawLoading(ctx: CanvasRenderingContext2D, W: number, H: number, text = '3D-Welt wird geladen …'): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#16202a'); g.addColorStop(1, '#0b0f14');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e3ebeb';
  ctx.font = '700 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, H / 2);
  ctx.textAlign = 'left';
}

/**
 * 3D-Ansicht bei Bedarf nachladen (three.js nur, wenn das Spiel läuft). Bis sie bereit ist, liefert get() null;
 * schlägt WebGL fehl, bleibt failed gesetzt und das Spiel zeichnet seine 2D-Fassung.
 */
export function lazyView<V>(load: () => Promise<V>): { get(): V | null; failed: boolean } {
  let view: V | null = null;
  let started = false;
  const state = {
    failed: false,
    get(): V | null {
      if (view || state.failed) return view;
      if (!started) {
        started = true;
        load().then((v) => { view = v; }).catch((e) => { console.warn('3D nicht verfügbar, 2D-Ansicht', e); state.failed = true; });
      }
      return null;
    },
  };
  return state;
}
