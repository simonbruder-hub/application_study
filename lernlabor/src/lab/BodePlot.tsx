/** Frequenzgang (Bode-Diagramm): Betrag in dB und Phase der Spannung am ausgewählten Bauteil bezogen auf die Quelle */
import { useMemo } from 'preact/hooks';
import { bode } from '../sim/analysis';
import { isTwoTerminal } from '../sim/circuit';
import { si } from '../sim/units';
import { engine, version } from './engine';
import { selected } from './state';

const W = 900, H = 170, PADL = 52, PADR = 30;

function logTicks(fmin: number, fmax: number): number[] {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(fmin)); e <= Math.ceil(Math.log10(fmax)); e++) {
    const f = 10 ** e;
    if (f >= fmin * 0.999 && f <= fmax * 1.001) out.push(f);
  }
  return out;
}

export function BodePlot() {
  const v = version.value;
  const sel = selected.value;
  const data = useMemo(() => {
    const net = engine.net;
    const src = net.elems.find((e) => e.part.kind === 'V' || e.part.kind === 'I');
    if (!src) return null;
    let k = net.elems.findIndex((e) => e.part.id === sel && isTwoTerminal(e.part.kind) && e !== src);
    if (k < 0) k = net.elems.findIndex((e) => e.part.kind === 'C' || e.part.kind === 'L');
    if (k < 0) k = net.elems.findIndex((e) => e.part.kind === 'R' || e.part.kind === 'lamp');
    if (k < 0) return null;
    const m = engine.modes;
    const fc = m.fg ?? m.f0 ?? engine.acF ?? 1000;
    const fmin = Math.max(fc / 1000, 1e-3), fmax = fc * 1000;
    const b = bode(net, src.part.id, k, fmin, fmax, 181);
    return { b, fc, fmin, fmax, src: src.part, target: net.elems[k]!.part };
  }, [v, sel]);
  if (!data) return <p class="panel-note">Für den Frequenzgang braucht die Schaltung eine Quelle und ein Bauteil, an dem gemessen wird.</p>;
  if (!data.b.f.length) return <p class="panel-note is-bad">Die Schaltung ist so nicht lösbar.</p>;
  const { b, fmin, fmax } = data;
  const lx = (f: number) => PADL + ((Math.log10(f) - Math.log10(fmin)) / (Math.log10(fmax) - Math.log10(fmin))) * (W - PADL - PADR);
  const dbMax = Math.ceil(Math.max(...b.db) / 20) * 20;
  const dbMin = Math.max(Math.floor(Math.min(...b.db) / 20) * 20, dbMax - 120);
  const dbSpan = Math.max(dbMax - dbMin, 20);
  const yDb = (d: number) => 10 + ((dbMax - Math.max(d, dbMin)) / dbSpan) * (H - 20);
  const phMax = Math.ceil(Math.max(...b.phase) / 45) * 45;
  const phMin = Math.floor(Math.min(...b.phase) / 45) * 45;
  const phSpan = Math.max(phMax - phMin, 90);
  const yPh = (p: number) => 10 + ((phMax - p) / phSpan) * (H - 20);
  const path = (ys: number[], fy: (y: number) => number) => ys.map((y, k) => `${k ? 'L' : 'M'}${lx(b.f[k]!).toFixed(1)} ${fy(y).toFixed(1)}`).join(' ');
  const ticks = logTicks(fmin, fmax);
  const m = engine.modes;
  const marks: [number, string][] = [];
  if (m.fg) marks.push([m.fg, 'f_g']);
  if (m.f0 && !m.fg) marks.push([m.f0, 'f₀']);
  if (engine.acF) marks.push([engine.acF, 'f']);
  const unitIsZ = data.src.kind === 'I';
  const Grid = ({ ys, fy, fmt }: { ys: number[]; fy: (y: number) => number; fmt: (y: number) => string }) => (
    <>
      {ticks.map((f) => <line key={`v${f}`} class="bd-grid" x1={lx(f)} x2={lx(f)} y1="10" y2={H - 10} />)}
      {ys.map((y) => (
        <g key={`h${y}`}>
          <line class="bd-grid" x1={PADL} x2={W - PADR} y1={fy(y)} y2={fy(y)} />
          <text class="bd-tick" x={PADL - 6} y={fy(y) + 4} text-anchor="end">{fmt(y)}</text>
        </g>
      ))}
      {marks.map(([f, l]) => f >= fmin && f <= fmax && (
        <g key={l}>
          <line class="bd-mark" x1={lx(f)} x2={lx(f)} y1="10" y2={H - 10} />
          <text class="bd-marklabel" x={lx(f) + 4} y="20">{l}</text>
        </g>
      ))}
    </>
  );
  const dbTicks: number[] = [];
  for (let d = dbMax; d >= dbMax - dbSpan; d -= dbSpan > 60 ? 40 : 20) dbTicks.push(d);
  const phTicks: number[] = [];
  for (let p = phMax; p >= phMin; p -= phSpan > 180 ? 90 : 45) phTicks.push(p);
  return (
    <div class="bode">
      <p class="small">
        {unitIsZ ? `|U(${data.target.name}) / I(${data.src.name})|` : `H(f) = U(${data.target.name}) / U(${data.src.name})`}
        {m.fg ? ` · f_g = ${si(m.fg, 'Hz')}` : m.f0 ? ` · f₀ = ${si(m.f0, 'Hz')}` : ''}
        {' '}· Bauteil antippen, um woanders zu messen.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} class="bode-svg" role="img" aria-label="Amplitudengang">
        <Grid ys={dbTicks} fy={yDb} fmt={(d) => `${d} dB`} />
        <path class="bd-line" d={path(b.db, yDb)} />
      </svg>
      <svg viewBox={`0 0 ${W} ${H + 18}`} class="bode-svg" role="img" aria-label="Phasengang">
        <Grid ys={phTicks} fy={yPh} fmt={(p) => `${p}°`} />
        <path class="bd-line bd-phase" d={path(b.phase, yPh)} />
        {ticks.map((f) => <text key={f} class="bd-tick" x={lx(f)} y={H + 12} text-anchor="middle">{si(f, 'Hz', 2)}</text>)}
      </svg>
    </div>
  );
}
