/**
 * Zeigerdiagramm (Bezug Sinus: u(t) = Û·sin(ωt + φ) ↔ Zeiger Û·e^{jφ}).
 * Drehend: Die Projektion auf die senkrechte Achse ist der Augenblickswert, passend zum Oszilloskop.
 */
import { useEffect, useState } from 'preact/hooks';
import { isTwoTerminal } from '../sim/circuit';
import { perSecond, si } from '../sim/units';
import { engine, version } from './engine';
import { selected } from './state';

interface Ph { label: string; re: number; im: number; q: 'u' | 'i'; color: string }

const COLORS = { src: '#e8590c', u: '#d4a106', i: '#0b8bc2', other: '#7c8b93' };

export function Phasor() {
  version.value;
  const [spin, setSpin] = useState(false);
  const [all, setAll] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!spin) return;
    let raf = 0;
    const loop = () => { setTick((t) => t + 1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [spin]);

  const ac = engine.ac, f = engine.acF;
  if (!ac || !f) {
    return <p class="panel-note">Das Zeigerdiagramm braucht Sinusquellen mit gleicher Frequenz. Stelle eine Quelle auf «Sinus» oder lade das Beispiel «RC-Tiefpass an Sinus».</p>;
  }
  if (!ac.ok) return <p class="panel-note is-bad">{ac.error}</p>;
  const elems = engine.net.elems;
  const list: Ph[] = [];
  elems.forEach((e, k) => {
    const p = e.part;
    if (p.kind === 'V' || p.kind === 'I') {
      list.push({ label: `U(${p.name})`, re: ac.uRe[k]!, im: ac.uIm[k]!, q: 'u', color: COLORS.src });
    }
  });
  const sel = elems.findIndex((e) => e.part.id === selected.value);
  elems.forEach((e, k) => {
    const p = e.part;
    if (!isTwoTerminal(p.kind) || p.kind === 'V' || p.kind === 'I') return;
    const isSel = k === sel;
    if (isSel || all) list.push({ label: `U(${p.name})`, re: ac.uRe[k]!, im: ac.uIm[k]!, q: 'u', color: isSel ? COLORS.u : COLORS.other });
    if (isSel && p.kind !== 'VM') list.push({ label: `I(${p.name})`, re: ac.iRe[k]!, im: ac.iIm[k]!, q: 'i', color: COLORS.i });
  });
  if (sel < 0 && !all) {
    // Ohne Auswahl: Strom der ersten Quelle (abgegeben)
    const k = elems.findIndex((e) => e.part.kind === 'V' || e.part.kind === 'I');
    if (k >= 0) list.push({ label: `I(${elems[k]!.part.name})`, re: -ac.iRe[k]!, im: -ac.iIm[k]!, q: 'i', color: COLORS.i });
  }
  const maxU = Math.max(1e-12, ...list.filter((x) => x.q === 'u').map((x) => Math.hypot(x.re, x.im)));
  const maxI = Math.max(1e-15, ...list.filter((x) => x.q === 'i').map((x) => Math.hypot(x.re, x.im)));
  const R = 120;
  const th = spin ? 2 * Math.PI * f * engine.sim.t : 0;
  const c = Math.cos(th), s = Math.sin(th);
  const pts = list.map((x) => {
    const r = (x.q === 'u' ? R / maxU : (R * 0.75) / maxI);
    const re = x.re * c - x.im * s, im = x.re * s + x.im * c;
    return { ...x, x: re * r, y: -im * r };
  });
  return (
    <div class="phasor">
      <svg viewBox="-170 -150 340 300" class="phasor-svg" role="img" aria-label="Zeigerdiagramm">
        <defs>
          {pts.map((p, k) => (
            <marker key={k} id={`ah${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill={p.color} />
            </marker>
          ))}
        </defs>
        <circle class="ph-ring" cx="0" cy="0" r={R} />
        <line class="ph-axis" x1="-160" y1="0" x2="160" y2="0" />
        <line class="ph-axis" x1="0" y1="-140" x2="0" y2="140" />
        <text class="ph-ax" x="158" y="16" text-anchor="end">Re</text>
        <text class="ph-ax" x="6" y="-130">Im</text>
        {pts.map((p, k) => (
          <g key={k}>
            {spin && <line class="ph-proj" x1={p.x} y1={p.y} x2="0" y2={p.y} stroke={p.color} />}
            <line x1="0" y1="0" x2={p.x} y2={p.y} stroke={p.color} stroke-width={p.q === 'i' ? 2.4 : 3} stroke-dasharray={p.q === 'i' ? '6 4' : undefined} marker-end={`url(#ah${k})`} />
            <text x={p.x * 1.08} y={p.y * 1.08 + 4} fill={p.color} class="ph-label" text-anchor={p.x < -4 ? 'end' : p.x > 4 ? 'start' : 'middle'}>{p.label}</text>
          </g>
        ))}
      </svg>
      <div class="phasor-side">
        <div class="toggles">
          <label><input type="checkbox" checked={spin} onChange={(e) => setSpin((e.target as HTMLInputElement).checked)} /> Zeiger drehen (ωt)</label>
          <label><input type="checkbox" checked={all} onChange={(e) => setAll((e.target as HTMLInputElement).checked)} /> alle Spannungen</label>
        </div>
        <table class="ph-table">
          <thead><tr><th /><th>Scheitelwert</th><th>Effektivwert</th><th>φ</th></tr></thead>
          <tbody>
            {list.map((x, k) => {
              const m = Math.hypot(x.re, x.im);
              const unit = x.q === 'u' ? 'V' : 'A';
              return (
                <tr key={k}>
                  <th style={{ color: x.color }}>{x.label}</th>
                  <td>{si(m, unit)}</td>
                  <td>{si(m / Math.SQRT2, unit)}</td>
                  <td>{((Math.atan2(x.im, x.re) * 180) / Math.PI).toFixed(1)}°</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p class="small muted">f = {si(f, 'Hz')} · ω = {perSecond(2 * Math.PI * f)} · Spannungen und Ströme mit eigenem Massstab, Ströme gestrichelt.</p>
      </div>
    </div>
  );
}
