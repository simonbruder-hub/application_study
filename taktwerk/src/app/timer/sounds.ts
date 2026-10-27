/**
 * Signaltöne, rein synthetisch (WebAudio, keine Audiodateien): funktionieren offline und in der
 * Einzeldatei. Jeder Klang liefert seine Oszillatoren zurück, damit ein vorgeplanter Ton abbrechbar bleibt.
 */
export type SoundId = 'glocke' | 'marimba' | 'gong' | 'harfe' | 'digital' | 'vogel' | 'kristall';

export const SOUNDS: readonly { id: SoundId; label: string }[] = [
  { id: 'glocke', label: 'Glocke' },
  { id: 'marimba', label: 'Marimba' },
  { id: 'gong', label: 'Gong' },
  { id: 'harfe', label: 'Harfe' },
  { id: 'kristall', label: 'Kristall' },
  { id: 'vogel', label: 'Vogelruf' },
  { id: 'digital', label: 'Digital' },
];

interface Note { f: number; t: number; dur: number; type?: OscillatorType; gain?: number; partials?: readonly [number, number][]; sweep?: number }

const NOTES: Record<SoundId, readonly Note[]> = {
  glocke: [987.8, 784, 659.3].map((f, i) => ({ f, t: i * 0.24, dur: 1.3, partials: [[1, 0.32], [2.76, 0.07]] as const })),
  marimba: [523.3, 659.3, 784, 1046.5].map((f, i) => ({ f, t: i * 0.13, dur: 0.45, type: 'triangle' as const, partials: [[1, 0.4], [4, 0.05]] as const })),
  gong: [{ f: 98, t: 0, dur: 4.5, partials: [[1, 0.45], [1.48, 0.18], [2.03, 0.12], [2.97, 0.06]] }],
  harfe: [392, 493.9, 587.3, 784, 987.8].map((f, i) => ({ f, t: i * 0.09, dur: 1.6, type: 'triangle' as const, partials: [[1, 0.3], [2, 0.06]] as const })),
  kristall: [1568, 2093, 2637].map((f, i) => ({ f, t: i * 0.18, dur: 1.8, partials: [[1, 0.18], [3.01, 0.05]] as const })),
  vogel: [0, 0.22, 0.44, 0.9, 1.06].map((t, i) => ({ f: i % 2 ? 3200 : 2600, t, dur: 0.14, gain: 0.18, sweep: i % 2 ? -900 : 1100 })),
  digital: [0, 0.18, 0.36].map((t) => ({ f: 1760, t, dur: 0.1, type: 'square' as const, gain: 0.08 })),
};

export function playSound(ctx: BaseAudioContext, id: SoundId, at: number, volume: number): OscillatorNode[] {
  const nodes: OscillatorNode[] = [];
  for (const n of NOTES[id] ?? NOTES.glocke) {
    const t0 = at + n.t;
    for (const [mult, peakBase] of n.partials ?? [[1, n.gain ?? 0.3]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = n.type ?? 'sine';
      o.frequency.setValueAtTime(n.f * mult, t0);
      if (n.sweep) o.frequency.linearRampToValueAtTime(n.f * mult + n.sweep, t0 + n.dur);
      const peak = peakBase * volume + 0.0001;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + (id === 'gong' ? 0.04 : 0.01));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur * (mult > 1.5 ? 0.5 : 1));
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + n.dur + 0.1);
      nodes.push(o);
    }
  }
  return nodes;
}
