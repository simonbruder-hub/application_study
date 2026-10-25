/**
 * Oszilloskop im Rollmodus: neueste Werte rechts, 10 Teilungen Zeit, 8 Teilungen senkrecht.
 * Spannungen und Ströme haben je einen eigenen Massstab (1-2-5-Schritte), der sich anpasst.
 */
import { useEffect, useRef } from 'preact/hooks';
import { niceStep } from '../sim/analysis';
import type { Part } from '../sim/circuit';
import { si } from '../sim/units';
import { engine, NS } from './engine';
import { circuit, pins, selected, type Trace } from './state';

export interface ScopeTrace extends Trace { label: string; color: string }

const U_COLOR = '#ffd23f';
const I_COLOR = '#3ad1ff';
const PIN_COLORS = ['#ff6fb5', '#8bea6b', '#ff9f43', '#b48cff'];

/** Spuren: angeheftete Grössen und u, i des ausgewählten Bauteils (sonst ein sinnvolles Bauteil) */
export function scopeTraces(): ScopeTrace[] {
  const parts = circuit.value.parts;
  const byId = new Map(parts.map((p) => [p.id, p]));
  const out: ScopeTrace[] = [];
  const label = (p: Part, q: 'u' | 'i') => `${q}(${p.name})`;
  pins.value.forEach((t, k) => {
    const p = byId.get(t.id);
    if (p) out.push({ ...t, label: label(p, t.q), color: PIN_COLORS[k % PIN_COLORS.length]! });
  });
  let focus = selected.value ? byId.get(selected.value) : undefined;
  if (!focus || focus.kind === 'wire' || focus.kind === 'ground') {
    focus = parts.find((p) => p.kind === 'C' || p.kind === 'L') ?? parts.find((p) => p.kind === 'R' || p.kind === 'lamp');
  }
  if (focus) {
    for (const q of ['u', 'i'] as const) {
      if (focus.kind === 'VM' && q === 'i') continue;
      if (focus.kind === 'AM' && q === 'u') continue;
      if (!out.some((t) => t.id === focus.id && t.q === q)) out.push({ id: focus.id, q, label: label(focus, q), color: q === 'u' ? U_COLOR : I_COLOR });
    }
  }
  return out;
}

const ratio = (x: number) => (x >= 100 ? Math.round(x).toLocaleString('de-CH') : String(Number(x.toPrecision(2))));

export function Scope() {
  const ref = useRef<HTMLCanvasElement>(null);
  const scale = useRef({ u: 1, i: 1e-3 });
  // Grösster Wert der letzten Sekunden: Der Massstab schrumpft nicht auf Restrauschen
  const seen = useRef({ u: 0, i: 0 });

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = ref.current;
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      const W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const g = cv.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#08120e';
      g.fillRect(0, 0, W, H);
      const padT = 22, padB = 20;
      const top = padT, h = H - padT - padB;
      const dx = W / 10, dy = h / 8, mid = top + h / 2;
      // Raster
      g.strokeStyle = 'rgba(120, 255, 170, 0.10)';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i <= 10; i++) { g.moveTo(Math.round(i * dx) + 0.5, top); g.lineTo(Math.round(i * dx) + 0.5, top + h); }
      for (let j = 0; j <= 8; j++) { g.moveTo(0, Math.round(top + j * dy) + 0.5); g.lineTo(W, Math.round(top + j * dy) + 0.5); }
      g.stroke();
      g.strokeStyle = 'rgba(120, 255, 170, 0.25)';
      g.beginPath();
      g.moveTo(0, Math.round(mid) + 0.5); g.lineTo(W, Math.round(mid) + 0.5);
      for (let i = 0; i <= 10; i++) for (let k = 1; k < 5; k++) { const x = i * dx + (k * dx) / 5; g.moveTo(x, mid - 3); g.lineTo(x, mid + 3); }
      g.stroke();

      const traces = scopeTraces();
      const sweep = engine.perDiv * 10;
      const t1 = engine.sim.t, t0 = t1 - sweep;
      // Massstab je Grösse: grösster Betrag soll in 3.5 Teilungen passen
      const maxOf = { u: 0, i: 0 };
      for (const tr of traces) {
        const b = engine.bufs.get(tr.id);
        if (!b) continue;
        const arr = b[tr.q];
        for (let k = 0; k < NS; k++) {
          const t = engine.times[k]!;
          if (t >= t0) { const v = Math.abs(arr[k]!); if (v > maxOf[tr.q]) maxOf[tr.q] = v; }
        }
      }
      for (const q of ['u', 'i'] as const) {
        seen.current[q] = Math.max(maxOf[q], seen.current[q] * 0.998);
        const need = niceStep(Math.max(maxOf[q], seen.current[q] * 0.05, q === 'u' ? 1e-3 : 1e-6) / 3.5);
        const cur = scale.current[q];
        if (need > cur || need < cur / 4) scale.current[q] = need;
      }
      // Spuren (ältester Wert zuerst)
      g.lineJoin = 'round';
      for (const tr of traces) {
        const b = engine.bufs.get(tr.id);
        if (!b) continue;
        const arr = b[tr.q];
        const per = scale.current[tr.q];
        g.strokeStyle = tr.color;
        g.lineWidth = 2;
        g.shadowColor = tr.color;
        g.shadowBlur = 6;
        g.beginPath();
        let pen = false;
        for (let n = 0; n < NS; n++) {
          const k = (engine.head + n) % NS;
          const t = engine.times[k]!, v = arr[k]!;
          if (!(t >= t0) || Number.isNaN(v)) { pen = false; continue; }
          const x = ((t - t0) / sweep) * W;
          const y = Math.max(top - 4, Math.min(top + h + 4, mid - (v / per) * dy));
          if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
        }
        g.stroke();
        g.shadowBlur = 0;
      }
      // Beschriftung
      g.font = '600 11px "Martian Mono", ui-monospace, monospace';
      g.textBaseline = 'middle';
      let x = 8;
      for (const tr of traces) {
        const txt = `${tr.label} ${si(scale.current[tr.q], tr.q === 'u' ? 'V' : 'A', 2)}/Div`;
        g.fillStyle = tr.color;
        g.fillText(txt, x, 11);
        x += g.measureText(txt).width + 16;
      }
      g.fillStyle = 'rgba(200, 255, 220, 0.75)';
      g.textAlign = 'right';
      const sp = engine.speed;
      const slow = sp < 0.999 ? `Zeitlupe 1:${ratio(1 / sp)}` : sp > 1.001 ? `Zeitraffer ${ratio(sp)}:1` : 'Echtzeit';
      g.fillText(`${si(engine.perDiv, 's', 2)}/Div · t = ${si(t1, 's', 3)} · ${slow}`, W - 8, H - 10);
      g.textAlign = 'left';
      if (engine.sim.error) {
        g.fillStyle = '#ff7b6b';
        g.fillText(engine.sim.error, 8, H - 10);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} class="scope" aria-label="Oszilloskop mit Spannungs- und Stromverlauf" role="img" />;
}
