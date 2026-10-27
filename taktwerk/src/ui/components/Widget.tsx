/**
 * Widget: Mini-Player in einem eigenen kleinen Fenster (Desktop-App) oder im Bild-im-Bild-Fenster
 * (Chrome). Der Inhalt hat eine feste Grundbreite und wird auf die Fensterbreite skaliert; so bleibt
 * jeder Stil stimmig, egal wie klein das Fenster gezogen wird. Unter COMPACT_BELOW Pixel Breite
 * zeigt es nur noch Uhr, Start/Pause und Fortschritt in einer Zeile. Im Bild-im-Bild-Fenster bestimmt
 * man auch die Höhe: Ist es flach gezogen, ebenfalls die kompakte Zeile.
 */
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { MiniPlayer } from './Mini';

/** Grundbreite des Inhalts (CSS-Pixel bei Massstab 1) */
export const WIDGET_BASE = 260;
const COMPACT_BASE = 180;
export const COMPACT_BELOW = 200;

/** height: nur angeben, wenn das Fenster seine Höhe nicht dem Inhalt anpasst (Bild-im-Bild) */
export function layoutFor(width: number, height?: number): { compact: boolean; scale: number } {
  const compact = width < COMPACT_BELOW || (height !== undefined && height < width * 0.5);
  return { compact, scale: Math.max(0.4, width / (compact ? COMPACT_BASE : WIDGET_BASE)) };
}

/**
 * win: Fenster, dessen Breite zählt (eigenes Fenster oder Bild-im-Bild).
 * onFit: meldet Breite und Höhe des Inhalts, damit sich das Fenster anpasst (Desktop-App).
 * startWidth: gemerkte Breite; bis zur ersten Meldung gilt sie statt der aktuellen Fensterbreite.
 */
export function WidgetView({ win, onExpand, onFit, startWidth }: {
  win: Window; onExpand: () => void; onFit?: (width: number, height: number) => void; startWidth?: number;
}) {
  const [width, setWidth] = useState(() => startWidth ?? win.innerWidth);
  const [height, setHeight] = useState(win.innerHeight);
  const fitted = useRef(startWidth === undefined);
  const ref = useRef<HTMLDivElement>(null);
  // passt sich das Fenster dem Inhalt an (onFit), zählt nur die Breite
  const layout = layoutFor(width, onFit ? undefined : height);

  useEffect(() => {
    const update = () => { if (fitted.current) { setWidth(win.innerWidth); setHeight(win.innerHeight); } };
    win.addEventListener('resize', update);
    update();
    return () => win.removeEventListener('resize', update);
  }, [win]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !onFit) return;
    let last = '';
    const report = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h <= 0 || `${width}x${h}` === last) return;
      last = `${width}x${h}`;
      onFit(width, h);
      fitted.current = true;
    };
    const ro = new ResizeObserver(report);
    ro.observe(el);
    report();
    return () => ro.disconnect();
  }, [onFit, width]);

  return (
    <div class="widget" ref={ref} data-tauri-drag-region="deep">
      <div class="widget-scale" style={{ width: `${layout.compact ? COMPACT_BASE : WIDGET_BASE}px`, zoom: layout.scale }}>
        <MiniPlayer onExpand={onExpand} compact={layout.compact} />
      </div>
    </div>
  );
}

/** Höhe des Inhalts bei gegebener Fensterbreite (Startgrösse des Bild-im-Bild-Fensters) */
export function measureWidget(width: number): number {
  const { compact, scale } = layoutFor(width);
  const host = document.createElement('div');
  host.className = 'widget';
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${compact ? COMPACT_BASE : WIDGET_BASE}px;visibility:hidden;pointer-events:none`;
  document.body.append(host);
  render(<MiniPlayer onExpand={() => undefined} compact={compact} />, host);
  const h = host.getBoundingClientRect().height;
  render(null, host);
  host.remove();
  return Math.ceil(h * scale);
}
