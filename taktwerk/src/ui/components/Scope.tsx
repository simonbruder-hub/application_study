/**
 * Technik: Messkurve als Canvas statt fester Linie. Fährt man mit Maus oder Finger über das Signal, packt es
 * zu und zieht kurz mit, dann schwingt es federnd zurück. Dazu zwei Messcursor X1 und X2 wie am Oszilloskop:
 * oben an der Karte verschieben, unten steht der Abstand (1 Div = 40 px = 1 min, wie die Kanal-Anzeige).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { TimerPhase } from '../../data/types';
import { prefs } from '../../app/prefs';
import { app } from '../../app/services';

/** Lage der Cursor (Anteil der Kartenbreite), bleibt beim Neuzeichnen und Seitenwechsel erhalten */
const cursors = { x1: 0.28, x2: 0.62 };
const DIV = 40;

const fmtDt = (div: number) => {
  const sec = Math.round(div * 60);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

export function ScopeTrace({ phase, running }: { phase: TimerPhase; running: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ phase, running });
  live.current = { phase, running };

  useEffect(() => {
    const c = canvas.current!;
    const card = c.closest('.timer-card') as HTMLElement | null;
    const ctx = c.getContext('2d');
    if (!card || !ctx) return;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = performance.now();
    let shift = 0;
    let amp = live.current.running ? 1 : 0.1;
    let color = '#ffd23f';
    let cursorColor = '#35e0ff';
    let colorAt = 0;
    const pull = { x: 0, a: 0, v: 0, grab: 0, cool: 0 };
    let pointer: { x: number; y: number } | null = null;

    const size = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      w = r.width;
      h = r.height;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(c);
    const onMove = (e: PointerEvent) => { const r = c.getBoundingClientRect(); pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const onLeave = () => { pointer = null; };
    card.addEventListener('pointermove', onMove);
    card.addEventListener('pointerleave', onLeave);
    card.addEventListener('pointercancel', onLeave);

    /** Grundform ohne Ziehen: Sinus im Fokus, Rechteck in der kurzen Pause (Periode = ein Viertel der Breite) */
    const base = (x: number) => {
      const P = Math.max(80, w / 4);
      const u = (((x + shift) % P) + P) % P / P;
      if (live.current.phase === 'short_break') return u >= 0.1 && u < 0.6 ? -22 : 22;
      return -22 * Math.sin(u * 2 * Math.PI);
    };

    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const { phase: ph, running: run } = live.current;
      const still = prefs.value.motion === 'aus' || matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!still) shift += dt * (w / (run ? 4 : 14));
      amp += ((run ? 1 : 0.1) - amp) * Math.min(1, dt * 3);
      if (t - colorAt > 1000) {
        const cs = getComputedStyle(c);
        color = cs.getPropertyValue('--phase').trim() || color;
        cursorColor = cs.getPropertyValue('--sage').trim() || cursorColor;
        colorAt = t;
      }
      const mid = h * 0.42;
      const y0 = (x: number) => mid + base(x) * amp;

      // Packen: Zeiger nahe an der Kurve; dann kurz mitziehen, danach federnd zurück
      pull.cool = Math.max(0, pull.cool - dt);
      let target = 0;
      if (pointer && ph !== 'long_break') {
        const onTrace = Math.abs(pointer.y - (y0(pointer.x) + pull.a)) < 14;
        if (pull.grab <= 0 && pull.cool <= 0 && onTrace) { pull.grab = 0.75; pull.x = pointer.x; }
        if (pull.grab > 0) {
          pull.grab -= dt;
          target = Math.max(-80, Math.min(80, pointer.y - y0(pointer.x)));
          pull.x += (pointer.x - pull.x) * Math.min(1, dt * 14);
          if (pull.grab <= 0 || Math.abs(pointer.y - mid) > 130) { pull.grab = 0; pull.cool = 0.45; }
        }
      } else if (pull.grab > 0) { pull.grab = 0; pull.cool = 0.45; }
      const k = pull.grab > 0 ? 160 : 70;
      const damp = pull.grab > 0 ? 20 : 4.5;
      pull.v += ((target - pull.a) * k - pull.v * damp) * dt;
      pull.a += pull.v * dt;

      ctx.clearRect(0, 0, w, h);
      // Messcursor über die ganze Höhe
      ctx.save();
      ctx.strokeStyle = cursorColor;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 5]);
      ctx.globalAlpha = 0.75;
      for (const fx of [cursors.x1, cursors.x2]) { const x = Math.round(fx * w) + 0.5; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      ctx.restore();
      if (ph !== 'long_break') {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const dx = x - pull.x;
          const y = y0(x) + pull.a * Math.exp(-(dx * dx) / (2 * 46 * 46));
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color;
        ctx.lineJoin = 'round';
        ctx.globalAlpha = run ? 0.6 : 0.35;
        ctx.lineWidth = 7;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.globalAlpha *= 0.35;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = run ? 0.75 : 0.45;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
        // Kathodenstrahl: heller Punkt, wo die Kurve gepackt ist
        if (Math.abs(pull.a) > 3) {
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = color;
          ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(pull.x, y0(pull.x) + pull.a, 3, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      card.removeEventListener('pointermove', onMove);
      card.removeEventListener('pointerleave', onLeave);
      card.removeEventListener('pointercancel', onLeave);
    };
  }, []);

  return <canvas ref={canvas} class="scope-canvas" />;
}

/**
 * XY-Modus (lange Pause): Lissajous-Figur 3:2 wie auf einem echten Oszilloskop. Die Frequenzen sind leicht
 * verstimmt, dadurch wandert die Phase und die Figur dreht sich scheinbar. Der Strahl zeichnet die Kurve,
 * wo er langsam ist, leuchtet er heller; dahinter glimmt der Phosphor nach. Angehalten steht die Figur.
 */
export function ScopeXY() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let w = 0;
    let raf = 0;
    let last = performance.now();
    let delta = 0.6;
    let head = 0;
    let color = '#ffd23f';
    let colorAt = 0;
    const root = document.documentElement;
    const size = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      w = r.width;
      c.width = Math.round(w * dpr);
      c.height = Math.round(w * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(c);
    const N = 720;
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      raf = requestAnimationFrame(frame);
      if (root.dataset.phase !== 'long' || w === 0) { ctx.clearRect(0, 0, w, w); return; }
      const run = root.dataset.run === '1';
      const still = prefs.value.motion === 'aus' || matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (run && !still) { delta += dt * 0.42; head = (head + dt * 0.55) % 1; }
      if (t - colorAt > 1000) { color = getComputedStyle(c).getPropertyValue('--phase').trim() || color; colorAt = t; }
      const R = w * 0.43;
      const m = w / 2;
      const pt = (u: number) => {
        const a = u * Math.PI * 2;
        // feines Rauschen wie bei einem echten Strahl
        const n = run ? (Math.sin(a * 97 + t * 0.03) * 0.5) : 0;
        return { x: m + R * Math.sin(3 * a + delta) + n, y: m + R * Math.sin(2 * a) + n };
      };
      ctx.clearRect(0, 0, w, w);
      ctx.lineCap = 'round';
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      // Nachleuchten der ganzen Figur, Helligkeit nach Strahlgeschwindigkeit (langsam = heller)
      const pts = Array.from({ length: N + 1 }, (_, i) => pt(i / N));
      for (let i = 0; i < N; i += 4) {
        const p0 = pts[i]!;
        const p1 = pts[Math.min(N, i + 4)]!;
        const speed = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        const bright = Math.min(1, 9 / (speed + 2));
        // Abstand zum Strahl: frisch gezeichnete Stellen leuchten stärker
        const age = ((head - i / N) % 1 + 1) % 1;
        const glow = run ? Math.max(0, 1 - age * 2.2) : 0.35;
        ctx.globalAlpha = Math.min(1, 0.2 + bright * 0.4 + glow * 0.6);
        ctx.lineWidth = 1.8 + glow * 1.6;
        ctx.shadowBlur = 4 + glow * 10;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      }
      // Strahlpunkt
      if (run) {
        const p = pt(head);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={canvas} class="lissajous" />;
}

/** Griffe der Messcursor oben an der Karte, RUN/STOP-Taste und die Anzeige ΔX, Δt, 1/Δt */
export function ScopeCursors({ running }: { running: boolean }) {
  const [pos, setPos] = useState({ ...cursors });
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const move = (key: 'x1' | 'x2', f: number) => {
    cursors[key] = Math.min(0.98, Math.max(0.02, f));
    setPos({ ...cursors });
  };
  const div = (Math.abs(pos.x2 - pos.x1) * width) / DIV;
  const sec = div * 60;
  return (
    <div class="scope-cursors" ref={wrap}>
      {(['x1', 'x2'] as const).map((key) => (
        <button
          key={key} type="button" class={`scope-cursor scope-${key}`} style={{ left: `${pos[key] * 100}%` }}
          aria-label={`Messcursor ${key.toUpperCase()}: ziehen oder mit Pfeiltasten verschieben`}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
            const r = wrap.current!.getBoundingClientRect();
            move(key, (e.clientX - r.left) / r.width);
          }}
          onKeyDown={(e) => {
            const step = { ArrowLeft: -0.01, ArrowRight: 0.01 }[e.key];
            if (step === undefined) return;
            e.preventDefault();
            e.stopPropagation();
            move(key, pos[key] + step * (e.shiftKey ? 5 : 1));
          }}
        >
          {key.toUpperCase()}
        </button>
      ))}
      <button type="button" class={`scope-state${running ? ' is-run' : ''}`} onClick={() => void app().timer.toggle()} aria-label={running ? 'Timer anhalten' : 'Timer starten'}>
        {running ? 'Run' : 'Stop'}
      </button>
      <span class="scope-delta" aria-live="off">
        ΔX {div.toFixed(2)} Div · Δt {fmtDt(div)} · 1/Δt {sec > 0 ? ((1 / sec) * 1000).toFixed(1) : '–'} mHz
      </span>
    </div>
  );
}
