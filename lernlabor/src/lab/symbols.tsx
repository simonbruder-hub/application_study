/**
 * Schaltzeichen nach IEC 60617 in lokalen Koordinaten: Anschluss a bei (0, 0), b bei (80, 0).
 * Umschalter: Mitte bei (0, 0), Kontakte bei (80, −40) und (80, 40). Masse: Anschluss bei (0, 0), Zeichen nach unten.
 */
import type { Part } from '../sim/circuit';
import { si } from '../sim/units';

/** Rastermass in SVG-Einheiten */
export const G = 40;

export function PartSymbol({ p, glow = 0 }: { p: Part; glow?: number }) {
  switch (p.kind) {
    case 'R':
      return (
        <>
          <path class="lead" d="M0 0 H22 M58 0 H80" />
          <rect class="body" x="22" y="-8" width="36" height="16" />
        </>
      );
    case 'L':
      return <path class="lead" d="M0 0 H20 a5 5 0 0 1 10 0 a5 5 0 0 1 10 0 a5 5 0 0 1 10 0 a5 5 0 0 1 10 0 H80" />;
    case 'C':
      return <path class="lead" d="M0 0 H36 M36 -15 V15 M44 -15 V15 M44 0 H80" />;
    case 'V': {
      const shape = p.shape ?? 'dc';
      return (
        <>
          <path class="lead" d={shape === 'dc' ? 'M0 0 H80' : 'M0 0 H24 M56 0 H80'} />
          <circle class="body" cx="40" cy="0" r="16" />
          {shape === 'sine' && <path class="glyph" d="M30 0 c3 -9 7 -9 10 0 s7 9 10 0" />}
          {shape === 'square' && <path class="glyph" d="M30 5 H35 V-5 H45 V5 H50" />}
          <path class="plus" d="M12 -15 h8 M16 -19 v8" />
        </>
      );
    }
    case 'I':
      return (
        <>
          <path class="lead" d="M0 0 H24 M56 0 H80" />
          <circle class="body" cx="40" cy="0" r="16" />
          <path class="lead" d="M40 -16 V16" />
          <path class="arrow" d="M54 -25 H28 M33 -29 L27 -25 L33 -21" />
        </>
      );
    case 'S': {
      const end = p.closed ? 'L57 -3' : 'L52 -22';
      return (
        <>
          <path class="lead" d="M0 0 H22 M58 0 H80" />
          <path class={`lever${p.closed ? ' is-on' : ''}`} d={`M22 0 ${end}`} />
          <circle class="contact" cx="22" cy="0" r="2.6" />
          <circle class="contact" cx="58" cy="0" r="2.6" />
        </>
      );
    }
    case 'S2': {
      const up = (p.pos ?? 0) === 0;
      return (
        <>
          <path class="lead" d="M0 0 H22 M60 -40 H80 M60 40 H80" />
          <path class="lever is-on" d={up ? 'M22 0 L58 -37' : 'M22 0 L58 37'} />
          <circle class="contact" cx="22" cy="0" r="2.6" />
          <circle class="contact" cx="60" cy="-40" r="2.6" />
          <circle class="contact" cx="60" cy="40" r="2.6" />
        </>
      );
    }
    case 'lamp':
      return (
        <>
          <path class="lead" d="M0 0 H26 M54 0 H80" />
          <circle class="glow" cx="40" cy="0" r="22" style={{ opacity: Math.min(1, glow) * 0.85 }} />
          <circle class="body lamp-body" cx="40" cy="0" r="14" style={{ fillOpacity: Math.min(1, glow) }} />
          <path class="lead" d="M30.1 -9.9 L49.9 9.9 M30.1 9.9 L49.9 -9.9" />
        </>
      );
    case 'VM': case 'AM':
      return (
        <>
          <path class="lead" d="M0 0 H26 M54 0 H80" />
          <circle class="body meter" cx="40" cy="0" r="14" />
          <text class="meter-letter" x="40" y="1">{p.kind === 'VM' ? 'V' : 'A'}</text>
        </>
      );
    case 'ground':
      return <path class="lead" d="M0 0 V12 M-14 12 H14 M-9 18 H9 M-4 24 H4" />;
    default:
      return null;
  }
}

/** Unsichtbare Trefferfläche zum Antippen */
export function HitArea({ p }: { p: Part }) {
  if (p.kind === 'ground') return <rect class="hit" x="-18" y="-4" width="36" height="34" />;
  if (p.kind === 'S2') return <path class="hit" d="M0 0 L80 -40 M0 0 L80 40 M40 -40 V40" />;
  return <path class="hit" d="M4 0 H76 M24 -14 H56 M24 14 H56" />;
}

/** Wertangabe für die Beschriftung */
export function valueLabel(p: Part): string {
  switch (p.kind) {
    case 'R': return si(p.value, 'Ω');
    case 'L': return si(p.value, 'H');
    case 'C': return si(p.value, 'F');
    case 'lamp': return `${si(p.value, 'Ω')} · ${si(p.power ?? 1, 'W')}`;
    case 'V': case 'I': {
      const unit = p.kind === 'V' ? 'V' : 'A';
      const shape = p.shape ?? 'dc';
      if (shape === 'dc') return si(p.value, unit);
      const off = p.offset ? ` + ${si(p.offset, unit)}` : '';
      return `${shape === 'sine' ? 'Û' : '±'} ${si(p.value, unit)}${off} · ${si(p.freq ?? 50, 'Hz')}`;
    }
    default: return '';
  }
}
