/** Zeichnet eine Schaltung (Baukasten und Aufgabenbilder) */
import type { JSX, Ref } from 'preact';
import { type Circuit, key, type Part, type Pt, rotate, terminals } from '../sim/circuit';
import type { Netlist } from '../sim/netlist';
import { G, HitArea, PartSymbol, valueLabel } from './symbols';

export interface View { x: number; y: number; w: number; h: number }

/** Umgebendes Rechteck aller Anschlüsse mit Rand */
export function bounds(c: Circuit, margin = 1): View {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of c.parts) {
    for (const t of terminals(p)) {
      x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x); y1 = Math.max(y1, t.y);
    }
    if (p.kind === 'ground') y1 = Math.max(y1, p.at.y + 1);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0 - margin, y: y0 - margin, w: x1 - x0 + 2 * margin, h: y1 - y0 + 2 * margin };
}

/** Ansicht mit Platz für die Beschriftungen (links Quellen, rechts Werte, oben Namen) */
export function viewFor(c: Circuit): View {
  const b = bounds(c, 1);
  if (b.w === 0) return b;
  return { x: b.x - 1.2, y: b.y - 1, w: b.w + 2.8, h: b.h + 1.4 };
}

/** Mitte eines Bauteils in Rasterkoordinaten */
export function center(p: Part): Pt {
  if (p.kind === 'wire') return { x: (p.at.x + p.to!.x) / 2, y: (p.at.y + p.to!.y) / 2 };
  if (p.kind === 'ground') return p.at;
  const r = rotate({ x: 1, y: 0 }, p.rot);
  return { x: p.at.x + r.x, y: p.at.y + r.y };
}

function Label({ p, extra }: { p: Part; extra?: string | null }) {
  if (p.kind === 'wire' || p.kind === 'ground') return null;
  const c = center(p);
  const vertical = p.rot % 2 === 1;
  const val = valueLabel(p);
  const lines = [p.name, val, extra].filter(Boolean) as string[];
  let x: number, y: number, anchor: 'start' | 'middle' | 'end';
  if (p.kind === 'S2') {
    // Unter bzw. neben dem Mittelanschluss, auf der Seite ohne Hebel
    if (vertical) { x = (p.at.x + 0.45) * G; y = p.at.y * G + 4; anchor = 'start'; }
    else { x = (p.at.x + (p.rot === 0 ? -0.2 : 0.2)) * G; y = (p.at.y + 0.75) * G; anchor = p.rot === 0 ? 'end' : 'start'; }
  } else if (vertical) {
    const left = p.kind === 'V' || p.kind === 'I';
    x = (c.x + (left ? -0.55 : 0.55)) * G; y = (c.y - (lines.length - 1) * 0.2) * G + 4; anchor = left ? 'end' : 'start';
  } else {
    x = c.x * G; y = (c.y - 0.62 - (lines.length - 1) * 0.4) * G; anchor = 'middle';
  }
  return (
    <text class="label" x={x} y={y} text-anchor={anchor}>
      {lines.map((l, i) => <tspan key={i} x={x} dy={i ? 16 : 0} class={i === 0 ? 'l-name' : i === 2 ? 'l-live' : 'l-val'}>{l}</tspan>)}
    </text>
  );
}

export interface CircuitSvgProps {
  c: Circuit;
  net: Netlist;
  view: View;
  selected?: string | null;
  moving?: { id: string; dx: number; dy: number } | null;
  ghost?: Part | null;
  wirePreview?: [Pt, Pt][] | null;
  hoverPt?: Pt | null;
  glow?: (p: Part) => number;
  live?: (p: Part) => string | null;
  svgRef?: Ref<SVGSVGElement>;
  class?: string;
  handlers?: JSX.SVGAttributes<SVGSVGElement>;
  title?: string;
}

function PartG({ p, sel, glow, extra, ghost }: { p: Part; sel: boolean; glow: number; extra?: string | null; ghost?: boolean }) {
  if (p.kind === 'wire') {
    return (
      <g class={`part wire${sel ? ' is-sel' : ''}${ghost ? ' is-ghost' : ''}`} data-id={ghost ? undefined : p.id}>
        <line class="hit" x1={p.at.x * G} y1={p.at.y * G} x2={p.to!.x * G} y2={p.to!.y * G} />
        <line class="lead" x1={p.at.x * G} y1={p.at.y * G} x2={p.to!.x * G} y2={p.to!.y * G} />
      </g>
    );
  }
  return (
    <g class={`part k-${p.kind}${sel ? ' is-sel' : ''}${ghost ? ' is-ghost' : ''}`} data-id={ghost ? undefined : p.id}>
      <g transform={`translate(${p.at.x * G} ${p.at.y * G}) rotate(${p.rot * 90})`}>
        <HitArea p={p} />
        <PartSymbol p={p} glow={glow} />
      </g>
      {!ghost && <Label p={p} extra={extra} />}
    </g>
  );
}

export function CircuitSvg(props: CircuitSvgProps) {
  const { c, net, view, selected, moving, ghost, wirePreview, hoverPt } = props;
  const shifted = (p: Part): Part => {
    if (!moving || moving.id !== p.id) return p;
    return { ...p, at: { x: p.at.x + moving.dx, y: p.at.y + moving.dy }, ...(p.to ? { to: { x: p.to.x + moving.dx, y: p.to.y + moving.dy } } : {}) };
  };
  const parts = c.parts.map(shifted);
  const wires = parts.filter((p) => p.kind === 'wire');
  const comps = parts.filter((p) => p.kind !== 'wire');
  const vb = `${view.x * G} ${view.y * G} ${view.w * G} ${view.h * G}`;
  const openSet = new Set(net.open.map(key));
  return (
    <svg ref={props.svgRef} class={`circuit ${props.class ?? ''}`} viewBox={vb} role="img" aria-label={props.title ?? 'Schaltung'} {...props.handlers}>
      <defs>
        <pattern id="grid-dots" width={G} height={G} patternUnits="userSpaceOnUse">
          <circle cx="0" cy="0" r="1.6" class="grid-dot" />
          <circle cx={G} cy="0" r="1.6" class="grid-dot" />
          <circle cx="0" cy={G} r="1.6" class="grid-dot" />
          <circle cx={G} cy={G} r="1.6" class="grid-dot" />
        </pattern>
      </defs>
      <rect class="grid" x={view.x * G} y={view.y * G} width={view.w * G} height={view.h * G} fill="url(#grid-dots)" />
      {wires.map((p) => <PartG key={p.id} p={p} sel={p.id === selected} glow={0} />)}
      {comps.map((p) => <PartG key={p.id} p={p} sel={p.id === selected} glow={props.glow?.(p) ?? 0} extra={props.live?.(p)} />)}
      {!moving && net.junctions.map((j) => <circle key={`j${key(j)}`} class="junction" cx={j.x * G} cy={j.y * G} r="4.5" />)}
      {!moving && net.open.filter((o) => openSet.has(key(o))).map((o) => <circle key={`o${key(o)}`} class="open-end" cx={o.x * G} cy={o.y * G} r="4" />)}
      {ghost && <PartG p={ghost} sel={false} glow={0} ghost />}
      {wirePreview?.map(([a, b], i) => <line key={i} class="wire-preview" x1={a.x * G} y1={a.y * G} x2={b.x * G} y2={b.y * G} />)}
      {hoverPt && <circle class="hover-pt" cx={hoverPt.x * G} cy={hoverPt.y * G} r="9" />}
    </svg>
  );
}
