/**
 * Geräte-Einstellungen (nur dieses Gerät, nicht synchronisiert): Darstellung, aktueller Modus,
 * Signale, Timer-Art im Arbeitsmodus, Vorlagen. Gespeichert in localStorage; fehlt der Speicher
 * (privates Fenster), gelten die Standardwerte.
 */
import { signal, effect } from '@preact/signals';
import type { TimerKind, Workspace } from '../data/types';
import { SKINS, type Skin } from '../ui/skins';

export interface TimerPreset {
  id: string;
  name: string;
  focus: number;
  short: number;
  long: number;
  longEvery: number;
}

export interface DevicePrefs {
  /** Lern- oder Arbeitsmodus (Header-Umschalter) */
  workspace: Workspace;
  /** Darstellung: automatisch / Tag / Nacht */
  mode: 'auto' | 'tag' | 'nacht';
  /** Stil */
  skin: Skin;
  /** Timer-Art je Modus (Lernmodus standardmässig Pomodoro) */
  timerKind: Record<Workspace, TimerKind>;
  sound: boolean;
  volume: number;
  notify: boolean;
  wakeLock: boolean;
  /** Stille Medienwiedergabe hält die App auf Android im Hintergrund aktiv */
  background: boolean;
  /** Beim ersten Timer-Start wurde nach Benachrichtigungen gefragt */
  notifyAsked: boolean;
  presets: TimerPreset[];
  /** Zuletzt gewähltes Projekt je Modus (Vorbelegung beim Anlegen) */
  lastProject: Partial<Record<Workspace, string>>;
  /** Mini-Ansicht in der App aktiv */
  mini: boolean;
}

export const DEFAULT_PRESETS: TimerPreset[] = [
  { id: 'klassisch', name: 'Klassisch', focus: 25, short: 5, long: 15, longEvery: 4 },
  { id: 'kurz', name: 'Kurz', focus: 15, short: 3, long: 10, longEvery: 4 },
  { id: 'lang', name: 'Lang', focus: 50, short: 10, long: 20, longEvery: 3 },
  { id: 'deep', name: 'Deep Work', focus: 90, short: 15, long: 30, longEvery: 2 },
];

/** Handy/Tablet: dort braucht der Timer den Hintergrund-Modus, sonst schläft er bei gesperrtem Bildschirm ein */
const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

const DEFAULTS: DevicePrefs = {
  workspace: 'study',
  mode: 'auto',
  skin: 'klassisch',
  timerKind: { study: 'pomodoro', work: 'pomodoro' },
  sound: true,
  volume: 0.7,
  notify: false,
  wakeLock: false,
  background: touch,
  notifyAsked: false,
  presets: DEFAULT_PRESETS,
  lastProject: {},
  mini: false,
};

const KEY = 'pomodoro-planer.v2.prefs';

function load(): DevicePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const saved = JSON.parse(raw) as Partial<DevicePrefs>;
    return {
      ...structuredClone(DEFAULTS),
      ...saved,
      timerKind: { ...DEFAULTS.timerKind, ...(saved.timerKind ?? {}) },
      presets: Array.isArray(saved.presets) && saved.presets.length ? saved.presets : structuredClone(DEFAULT_PRESETS),
      lastProject: { ...(saved.lastProject ?? {}) },
      skin: SKINS.some((k) => k.id === saved.skin) ? saved.skin! : DEFAULTS.skin,
      // Einstellungen von vor diesem Feld: auf dem Handy den Hintergrund-Modus einmalig einschalten
      ...(saved.notifyAsked === undefined && touch ? { background: true } : {}),
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const prefs = signal<DevicePrefs>(load());

effect(() => {
  const value = prefs.value;
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* Speicher blockiert */ }
});

export function setPrefs(patch: Partial<DevicePrefs>): void {
  prefs.value = { ...prefs.value, ...patch };
}

/** Andere Tabs/Fenster derselben App: Einstellungen übernehmen */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && e.newValue) prefs.value = load();
  });
}

/* ---------- Supabase-Verbindung (je Gerät) ---------- */

export interface BackendConfig {
  url: string;
  anonKey: string;
}

const BACKEND_KEY = 'pomodoro-planer.v2.backend';

/** Gespeicherte Verbindung oder Build-Variablen VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY */
export function loadBackendConfig(): BackendConfig | null {
  try {
    const raw = localStorage.getItem(BACKEND_KEY);
    if (raw) {
      const cfg = JSON.parse(raw) as BackendConfig;
      if (cfg.url && cfg.anonKey) return cfg;
    }
  } catch { /* ignorieren */ }
  const env = import.meta.env;
  const url = env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && anonKey ? { url, anonKey } : null;
}

export function saveBackendConfig(cfg: BackendConfig | null): void {
  try {
    if (cfg) localStorage.setItem(BACKEND_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(BACKEND_KEY);
  } catch { /* ignorieren */ }
}
