/**
 * Die Pausenspiele und zu welchem Stil sie gehören. Der Knopf unter dem Zifferblatt öffnet sie in den Pausen.
 */
import { signal } from '@preact/signals';
import type { ComponentType } from 'preact';
import type { Skin } from '../skins';
import { Memory } from './Memory';
import { Sudoku } from './Sudoku';
import { forest } from './forest';
import { gifts } from './gifts';
import { pumpkin } from './pumpkin';
import { hummel } from './hummel';
import { racer } from './racer';
import { spaceRider } from './spaceRider';
import { snake } from './snake';
import { runner } from './runner';
import type { Engine } from './types';

export type GameId = 'spacerider' | 'hummel' | 'rennen' | 'wald' | 'sudoku' | 'memory' | 'geschenke' | 'kuerbis' | 'schlange' | 'baulauf';

/** Brettspiele (Sudoku, Memory) zeichnen selbst im DOM */
export interface BoardProps { onScore: (points: number) => void; ended: boolean; skin: Skin }

export interface GameMeta {
  id: GameId;
  title: string;
  /** Text auf dem Knopf unter der Uhr */
  button: string;
  intro: string;
  /** Hilfe: Tasten (mit "/" davor: "oder") und Text */
  help: [string[], string][];
  legend?: string;
  overTitle: string;
  /** Actionspiel auf Canvas (engine) oder Brettspiel im DOM (board) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  engine?: Engine<any>;
  board?: ComponentType<BoardProps>;
  /** steer: Figur folgt Finger oder Maus; aim: Klick oder Tippen zielt */
  mode: 'steer' | 'aim';
  /** Autofeuer anbieten */
  autofire: boolean;
  /** Am Handy: Figur so weit über dem Finger */
  lift: number;
}

export const GAMES: Record<GameId, GameMeta> = {
  spacerider: {
    id: 'spacerider', title: 'Space Rider', button: 'Space Rider spielen', overTitle: 'Game Over',
    intro: 'Schiess die Angreifer ab, sammle Extras und besiege das Mutterschiff, solange die Pause dauert.',
    help: [
      [['↑', '↓', '←', '→', '/W', 'A', 'S', 'D'], 'steuern'],
      [['Leertaste'], 'schiesst (oder Autofeuer)'],
      [['P', '/Esc'], 'pausiert'],
    ],
    legend: 'Am Handy: Finger ziehen. Drohne 10 · Untertasse 25 · Kanonier 50 · Mutterschiff ab 600 Punkten',
    engine: spaceRider, mode: 'steer', autofire: true, lift: 56,
  },
  hummel: {
    id: 'hummel', title: 'Hummelflug', button: 'Hummelflug spielen', overTitle: 'Erschöpft',
    intro: 'Flieg über die Wiese, sammle Nektar und stich angreifende Wespen und Libellen. Sonnenblumen geben dreimal Nektar, Goldblüten Turbo, Tautropfen einen Schild, Gelée royale macht kurz unbesiegbar. Ab 900 Punkten wartet das Hornissennest. Meide Spinnennetze und Vögel.',
    help: [
      [['↑', '↓', '←', '→', '/W', 'A', 'S', 'D'], 'fliegen'],
      [['Leertaste'], 'sticht (kurzer Vorstoss)'],
      [['P', '/Esc'], 'pausiert'],
    ],
    legend: 'Am Handy: Finger ziehen, Antippen sticht. Blüte 10 · Sonnenblume 3 × 15 · Goldblüte 50 · Wespe 30 · Hornisse 60 · Libelle 80 · Nest 300 · Kette ab 8 Blüten ×2, ab 16 ×3',
    engine: hummel, mode: 'steer', autofire: false, lift: 50,
  },
  rennen: {
    id: 'rennen', title: 'Grand Prix', button: 'Grand Prix fahren', overTitle: 'Ausgeschieden',
    intro: 'Bleib auf der Strecke, überhole die Gegner und nimm die Boost-Felder mit. Wer neben die Strecke gerät, verliert Tempo, im Kies fliegt man ab.',
    help: [
      [['←', '→', '/A', 'D'], 'lenken'],
      [['↑', '/W'], 'Gas'],
      [['↓', '/S'], 'Bremse'],
      [['P', '/Esc'], 'pausiert'],
    ],
    legend: 'Am Handy: Finger links oder rechts halten. Überholen 25 · Boost 15 · Ölfleck meiden',
    engine: racer, mode: 'steer', autofire: false, lift: 0,
  },
  wald: {
    id: 'wald', title: 'Waldjagd', button: 'Waldjagd spielen', overTitle: 'Zeit um',
    intro: 'Triff mit der Zapfen-Schleuder Eichhörnchen, Wildschweine und Hirsche; sie flüchten mit Sternchen. Wanderer, Igel und Vogelhaus nicht treffen! 90 Sekunden pro Runde.',
    help: [
      [['Klick', '/Tippen'], 'wirft einen Zapfen'],
      [['R', '/Rechtsklick'], 'lädt nach (oder Korb antippen)'],
      [['↑', '↓', '←', '→'], 'zielen, Leertaste wirft'],
      [['P', '/Esc'], 'pausiert'],
    ],
    legend: 'Eichhörnchen 40 · Hirsch 30 · Wildschwein 20 · weiter hinten zählt doppelt · Wanderer −50 · Igel −30 · Vogelhaus −20',
    engine: forest, mode: 'aim', autofire: false, lift: 0,
  },
  sudoku: {
    id: 'sudoku', title: 'Sudoku', button: 'Sudoku lösen', overTitle: 'Gelöst',
    intro: '', help: [], board: Sudoku, mode: 'aim', autofire: false, lift: 0,
  },
  geschenke: {
    id: 'geschenke', title: 'Geschenkejagd', button: 'Geschenkejagd spielen', overTitle: 'Feierabend, Elf!',
    intro: 'Fang die Geschenke mit dem Sack des Elfen. Kohle meiden, kein Geschenk in den Schnee fallen lassen. Ab und zu fliegt der Schlitten vorbei.',
    help: [
      [['←', '→', '/A', 'D'], 'laufen'],
      [['P', '/Esc'], 'pausiert'],
    ],
    legend: 'Am Handy: Finger ziehen. Geschenk 10 · Zuckerstange 15 · Stern 50 · Glocke zieht an · grosser Sack · ab 5 in Folge ×2, ab 10 ×3',
    engine: gifts, mode: 'steer', autofire: false, lift: 0,
  },
  kuerbis: {
    id: 'kuerbis', title: 'Kürbismann', button: 'Kürbismann spielen', overTitle: 'Erwischt',
    intro: 'Nachts im Nebelwald stehen mehrere Spukhäuser, nur eines ist das richtige. Oben steht, welches Licht und welches Merkmal es hat. Stell dich vor seine Tür, bis sie aufgeht. Im falschen Haus wartet der Kürbismann und alles beginnt von vorn, jedes Mal neu angeordnet. Draussen schleicht er dir nach: Halte ihn mit der Taschenlampe im Licht, dann verschwindet er. Richtige Häuser bringen Münzen, Münzen bringen Upgrades.',
    help: [
      [['↑', '↓', '/W', '/S'], 'gehen'],
      [['←', '→', '/A', '/D'], 'drehen und umsehen'],
      [['Finger'], 'aufsetzen und ziehen wie ein Joystick'],
      [['P', '/Esc'], 'pausiert'],
    ],
    legend: 'Richtiges Haus 100 × Stufe plus Münzen · Kürbismann gebannt 25 · Upgrades: hellere Laterne, schnellere Schuhe, Amulett, Krähe zeigt den Weg',
    engine: pumpkin, mode: 'steer', autofire: false, lift: 0,
  },
  schlange: {
    id: 'schlange', title: 'Dschungelschlange', button: 'Dschungelschlange spielen', overTitle: 'Ausgeschlängelt',
    intro: 'Friss Mangos und Bananen und werde länger. Goldfrüchte und Käfer geben Extrapunkte. Mit jeder Stufe wirst du schneller und es liegen mehr Felsen herum. Ab Stufe 2 schleicht ein Tiger quer durchs Feld: Er beisst dir den Schwanz ab, den Kopf darf er nicht erwischen.',
    help: [
      [['↑', '↓', '←', '→', '/W', 'A', 'S', 'D'], 'Richtung wählen'],
      [['Wischen'], 'am Handy'],
      [['P', '/Esc'], 'pausiert'],
    ],
    legend: 'Mango 10 · Banane 15 · Käfer 30 · Goldfrucht 50 · schnell hintereinander ×2, ×3 · drei Leben',
    engine: snake, mode: 'steer', autofire: false, lift: 0,
  },
  baulauf: {
    id: 'baulauf', title: 'Baustellen-Run', button: 'Baustellen-Run starten', overTitle: 'Von der Walze erwischt',
    intro: 'Du bist der Elektriker und rennst durch die Baustelle. Spur wechseln, über Absperrungen, Kabel und Baugruben springen, unter Stahlträgern durchrutschen. An der Abzweigung rechtzeitig abbiegen, sonst geht es in den Bauzaun. Die Walze ist dir auf den Fersen.',
    help: [
      [['←', '→', '/A', 'D'], 'Spur wechseln, an der Abzweigung abbiegen'],
      [['↑', '/W', 'Leertaste'], 'springen'],
      [['↓', '/S'], 'rutschen'],
      [['Wischen'], 'am Handy in alle Richtungen'],
      [['P', '/Esc'], 'pausiert'],
    ],
    legend: 'Blitz 10 · Kurve 25 · Helm schützt einmal · Kaffee: kurz unverwundbar · Magnet zieht Blitze an · drei Leben',
    engine: runner, mode: 'steer', autofire: false, lift: 0,
  },
  memory: {
    id: 'memory', title: 'Memory', button: 'Memory spielen', overTitle: 'Geschafft',
    intro: '', help: [], board: Memory, mode: 'aim', autofire: false, lift: 0,
  },
};

export const GAME_OF_SKIN: Partial<Record<Skin, GameId>> = {
  scifi: 'spacerider', flora: 'hummel', rennen: 'rennen', natur: 'wald', amtlich: 'sudoku',
  klassisch: 'memory', anime: 'memory', technik: 'memory', barock: 'memory', flug: 'memory', meer: 'memory', elemente: 'memory', zug: 'memory',
  weihnacht: 'geschenke', halloween: 'kuerbis', dschungel: 'schlange', baustelle: 'baulauf',
};

/** Offenes Spiel (null: keins) */
export const gameOpen = signal<GameId | null>(null);
