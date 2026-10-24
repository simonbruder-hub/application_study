/**
 * Die Pausenspiele und zu welchem Stil sie gehören. Der Knopf unter dem Zifferblatt öffnet sie in den Pausen.
 */
import { signal } from '@preact/signals';
import type { Skin } from '../skins';
import { forest } from './forest';
import { hummel } from './hummel';
import { racer } from './racer';
import { spaceRider } from './spaceRider';
import type { Engine } from './types';

export type GameId = 'spacerider' | 'hummel' | 'rennen' | 'wald';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  engine: Engine<any>;
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
    intro: 'Flieg über die Wiese, sammle Nektar aus den Blüten und stich angreifende Wespen. Meide Spinnennetze und Vögel.',
    help: [
      [['↑', '↓', '←', '→', '/W', 'A', 'S', 'D'], 'fliegen'],
      [['Leertaste'], 'sticht (kurzer Vorstoss)'],
      [['P', '/Esc'], 'pausiert'],
    ],
    legend: 'Am Handy: Finger ziehen, Antippen sticht. Blüte 10 · Wespe 30 · Hornisse 60 · 10 Blüten = Honigtopf',
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
};

export const GAME_OF_SKIN: Partial<Record<Skin, GameId>> = { scifi: 'spacerider', flora: 'hummel', rennen: 'rennen', natur: 'wald' };

/** Offenes Spiel (null: keins) */
export const gameOpen = signal<GameId | null>(null);
