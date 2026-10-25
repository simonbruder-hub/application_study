/**
 * Zeichenfläche des Baukastens: Bauteile setzen, verschieben, Drähte ziehen, Schalter umlegen.
 * Die Ansicht passt sich der Schaltung an (beim Ziehen bleibt sie stehen).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { defaults, key, type Part, type Pt, rotate } from '../sim/circuit';
import { si } from '../sim/units';
import { CircuitSvg, type View, viewFor } from './CircuitSvg';
import { engine, live, version } from './engine';
import { G } from './symbols';
import { addPart, addWire, circuit, movePart, partById, placeRot, selected, toggleSwitch, tool } from './state';

type Drag =
  | { kind: 'wire'; from: Pt; to: Pt }
  | { kind: 'move'; id: string; start: Pt; dx: number; dy: number; moved: boolean };

const snap = (p: { x: number; y: number }): Pt => ({ x: Math.round(p.x), y: Math.round(p.y) });

function minBox(width: number): { w: number; h: number } {
  const w = width < 520 ? 9 : width < 900 ? 14 : 18;
  return { w, h: Math.round(w * (width < 520 ? 0.85 : 0.55)) };
}

/** Ansicht: Schaltung mit Rand, mindestens so gross wie minBox, zentriert */
function fit(c: typeof circuit.value, width: number): View {
  const b = viewFor(c);
  const m = minBox(width);
  if (b.w === 0) return { x: 0, y: 0, w: m.w, h: m.h };
  const w = Math.max(b.w, m.w), h = Math.max(b.h, m.h);
  return { x: Math.round((b.x - (w - b.w) / 2) * 2) / 2, y: Math.round((b.y - (h - b.h) / 2) * 2) / 2, w, h };
}

/** Bauteil zum Platzieren so, dass der Zeiger in seiner Mitte liegt */
function ghostAt(kind: Part['kind'], p: Pt): Part {
  const rot = placeRot.value;
  const off = kind === 'ground' ? { x: 0, y: 0 } : rotate({ x: 1, y: 0 }, rot);
  return { id: 'ghost', kind, name: '', at: { x: p.x - off.x, y: p.y - off.y }, rot, ...defaults(kind) } as Part;
}

export function Board() {
  const c = circuit.value;
  live.value;
  version.value;
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const frozen = useRef<View | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const view = drag && frozen.current ? frozen.current : fit(c, width);
  const net = engine.net;
  const t = tool.value;

  const toGrid = (e: PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM();
    const q = m ? pt.matrixTransform(m.inverse()) : pt;
    return { x: q.x / G, y: q.y / G };
  };
  /** Rasterpunkt mit Anschluss in der Nähe des Zeigers */
  const terminalNear = (g: { x: number; y: number }): Pt | null => {
    const s = snap(g);
    if (Math.hypot(g.x - s.x, g.y - s.y) > 0.3) return null;
    return net.nodeOf.has(key(s)) ? s : null;
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const g = toGrid(e);
    const s = snap(g);
    frozen.current = view;
    if (t === 'wire') {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setDrag({ kind: 'wire', from: s, to: s });
      return;
    }
    if (t !== 'select') return;
    const term = terminalNear(g);
    const hit = (e.target as Element).closest('[data-id]')?.getAttribute('data-id') ?? null;
    if (term && !(hit && partById(hit)?.kind === 'S2')) {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setDrag({ kind: 'wire', from: term, to: term });
      return;
    }
    if (hit) {
      // Schalter: Antippen schaltet nur, damit das Oszilloskop beim gewählten Bauteil bleibt; Ziehen wählt aus
      const k = partById(hit)?.kind;
      if (k !== 'S' && k !== 'S2') selected.value = hit;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setDrag({ kind: 'move', id: hit, start: s, dx: 0, dy: 0, moved: false });
      return;
    }
    selected.value = null;
  };

  const onMove = (e: PointerEvent) => {
    const g = toGrid(e);
    const s = snap(g);
    if (!drag) {
      setHover(t === 'select' || t === 'wire' ? (t === 'wire' ? s : terminalNear(g)) : s);
      return;
    }
    if (drag.kind === 'wire') {
      if (drag.to.x !== s.x || drag.to.y !== s.y) setDrag({ ...drag, to: s });
    } else {
      const dx = s.x - drag.start.x, dy = s.y - drag.start.y;
      if (dx !== drag.dx || dy !== drag.dy) {
        if (selected.value !== drag.id) selected.value = drag.id;
        setDrag({ ...drag, dx, dy, moved: drag.moved || dx !== 0 || dy !== 0 });
      }
    }
  };

  const onUp = (e: PointerEvent) => {
    const d = drag;
    setDrag(null);
    frozen.current = null;
    if (t !== 'select' && t !== 'wire' && !d) {
      const s = snap(toGrid(e));
      const g = ghostAt(t, s);
      const part = addPart(t, g.at, g.rot);
      selected.value = part.id;
      tool.value = 'select';
      return;
    }
    if (!d) return;
    if (d.kind === 'wire') {
      addWire(d.from, d.to);
    } else if (d.moved) {
      movePart(d.id, d.dx, d.dy);
    } else {
      const p = partById(d.id);
      if (p && (p.kind === 'S' || p.kind === 'S2')) {
        toggleSwitch(p.id);
        if (!selected.value) selected.value = p.id;
      }
    }
  };

  const wirePreview: [Pt, Pt][] | null = drag?.kind === 'wire' && key(drag.from) !== key(drag.to)
    ? (drag.from.x === drag.to.x || drag.from.y === drag.to.y
      ? [[drag.from, drag.to]]
      : [[drag.from, { x: drag.to.x, y: drag.from.y }], [{ x: drag.to.x, y: drag.from.y }, drag.to]])
    : null;
  const ghost = t !== 'select' && t !== 'wire' && hover ? ghostAt(t, hover) : null;

  const glow = (p: Part) => {
    if (p.kind !== 'lamp') return 0;
    const v = engine.now(p.id);
    if (!v) return 0;
    const st = engine.dc ? null : engine.stats(p.id, 'u');
    const u = st ? st.rms : v.u;
    return (u * u) / Math.max(p.value, 1e-6) / Math.max(p.power ?? 1, 1e-9);
  };
  const liveText = (p: Part) => {
    if (p.kind !== 'VM' && p.kind !== 'AM') return null;
    const q = p.kind === 'VM' ? 'u' : 'i';
    const unit = q === 'u' ? 'V' : 'A';
    if (engine.dc) {
      const v = engine.now(p.id);
      return v ? si(v[q], unit) : null;
    }
    const st = engine.stats(p.id, q);
    return st ? `${si(st.rms, unit)} eff` : null;
  };

  return (
    <div class={`board tool-${t}`} ref={wrapRef}>
      <CircuitSvg
        c={c}
        net={net}
        view={view}
        selected={selected.value}
        moving={drag?.kind === 'move' && drag.moved ? { id: drag.id, dx: drag.dx, dy: drag.dy } : null}
        ghost={ghost}
        wirePreview={wirePreview}
        hoverPt={!drag && (t === 'select' || t === 'wire') ? hover : null}
        glow={glow}
        live={liveText}
        svgRef={svgRef}
        title="Schaltung bearbeiten"
        handlers={{
          onPointerDown: onDown as never,
          onPointerMove: onMove as never,
          onPointerUp: onUp as never,
          onPointerLeave: () => { if (!drag) setHover(null); },
          onPointerCancel: () => { setDrag(null); frozen.current = null; },
        }}
      />
      {!c.parts.length && <p class="board-empty">Leeres Raster: Wähle ein Bauteil und tippe hier hin.</p>}
    </div>
  );
}
