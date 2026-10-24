/**
 * Zeichnungen der Waldjagd mit feineren Formen: Hintergrund mit Licht und Dunst, Tannen mit Ästen und Rinde,
 * Tiere mit Fell, Schattierung und Glanzlichtern. Alle Figuren in eigenen Koordinaten: Ursprung an den Füssen,
 * Blick nach rechts, Grösse wie die Trefferflächen in forest.ts.
 */

type Ctx = CanvasRenderingContext2D;

const W = 360;
const H = 560;

/** Vorhersagbare Streuung (gleiches Bild bei jedem Zeichnen) */
const rnd = (i: number, k = 0) => { const v = Math.sin((i + 1) * 12.9898 + (k + 1) * 78.233) * 43758.5453; return v - Math.floor(v); };

function lin(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
function rad(ctx: Ctx, x: number, y: number, r: number, stops: [number, string][], x0 = x, y0 = y): CanvasGradient {
  const g = ctx.createRadialGradient(x0, y0, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
const ellipse = (ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); };

/* ---------- Bäume ---------- */

/** Stamm mit Rinde (Längsrillen, Licht von links) */
export function trunk(ctx: Ctx, x: number, top: number, bottom: number, w: number, tone = 0): void {
  ctx.fillStyle = lin(ctx, x - w / 2, 0, x + w / 2, 0, [[0, tone ? '#8a7558' : '#7a5c3e'], [0.45, tone ? '#6b5a44' : '#5a4330'], [1, tone ? '#4c4033' : '#3b2b1f']]);
  ctx.fillRect(x - w / 2, top, w, bottom - top);
  ctx.strokeStyle = 'rgba(30, 18, 10, 0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < Math.max(2, w / 5); i++) {
    const bx = x - w / 2 + (i + 0.5) * (w / Math.max(2, w / 5));
    ctx.beginPath();
    ctx.moveTo(bx, top);
    for (let y = top; y < bottom; y += 14) ctx.lineTo(bx + (rnd(i, y) - 0.5) * 2.4, y + 14);
    ctx.stroke();
  }
}

/** Tanne aus gestuften, gezackten Astlagen; Lichtseite links, Schatten rechts */
function fir(ctx: Ctx, x: number, base: number, h: number, spread: number, dark: string, light: string, seed: number): void {
  const tiers = 6;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const top = base - h + f * h * 0.78;
    const half = spread * (0.25 + f * 0.75);
    const bottom = top + h * 0.26;
    ctx.fillStyle = lin(ctx, x - half, 0, x + half, 0, [[0, light], [0.5, dark], [1, dark]]);
    ctx.beginPath();
    ctx.moveTo(x, top);
    const n = 7;
    for (let k = 0; k <= n; k++) {
      const px = x + half - (k / n) * half * 2;
      const py = bottom + (k % 2 ? -5 : 2) + (rnd(seed + t, k) - 0.5) * 4;
      if (k === 0) ctx.lineTo(x + half, bottom);
      ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
}

/** Ferne Tannenreihe als Silhouette */
function firRow(ctx: Ctx, y: number, step: number, hMin: number, hVar: number, color: string, seed: number): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, y + 30);
  for (let x = -step; x < W + step; x += step) {
    const h = hMin + rnd(seed, x) * hVar;
    const w = step * 0.7;
    ctx.lineTo(x - w, y);
    for (let k = 0; k < 4; k++) {
      const yy = y - h * ((k + 1) / 4);
      ctx.lineTo(x - w * (1 - (k + 1) / 4.5), yy + h * 0.08);
      ctx.lineTo(x - w * (1 - (k + 1) / 4) * 0.6, yy);
    }
    ctx.lineTo(x, y - h - 4);
    for (let k = 3; k >= 0; k--) {
      const yy = y - h * ((k + 1) / 4);
      ctx.lineTo(x + w * (1 - (k + 1) / 4) * 0.6, yy);
      ctx.lineTo(x + w * (1 - (k + 1) / 4.5), yy + h * 0.08);
    }
    ctx.lineTo(x + w, y);
  }
  ctx.lineTo(W, y + 30);
  ctx.closePath();
  ctx.fill();
}

/* ---------- Hintergrund (einmal gezeichnet, dann aus dem Speicher) ---------- */

export function backdrop(ctx: Ctx): void {
  ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, '#a8d8e8'], [0.35, '#d7ecd9'], [0.6, '#eef2d6'], [1, '#c9d7a8']]);
  ctx.fillRect(0, 0, W, H);
  // Sonne und Dunst
  ctx.fillStyle = rad(ctx, 270, 90, 150, [[0, 'rgba(255, 250, 220, 0.95)'], [0.15, 'rgba(255, 240, 190, 0.6)'], [1, 'rgba(255, 240, 190, 0)']]);
  ctx.fillRect(0, 0, W, H);
  // Berge in zwei Schichten mit Luftperspektive
  ctx.fillStyle = '#b9d3cf';
  ctx.beginPath(); ctx.moveTo(0, 300); ctx.lineTo(60, 230); ctx.lineTo(110, 260); ctx.lineTo(170, 200); ctx.lineTo(230, 255); ctx.lineTo(300, 215); ctx.lineTo(360, 250); ctx.lineTo(360, 380); ctx.lineTo(0, 380); ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.beginPath(); ctx.moveTo(158, 212); ctx.lineTo(170, 200); ctx.lineTo(184, 214); ctx.lineTo(174, 210); ctx.lineTo(168, 216); ctx.fill();
  ctx.fillStyle = '#9cc3a6';
  ctx.beginPath(); ctx.moveTo(0, 330); ctx.quadraticCurveTo(90, 262, 180, 318); ctx.quadraticCurveTo(270, 270, 360, 312); ctx.lineTo(360, 400); ctx.lineTo(0, 400); ctx.fill();
  firRow(ctx, 352, 18, 22, 22, '#86b393', 1);
  firRow(ctx, 372, 22, 26, 26, '#6e9f7d', 2);
  // Boden in drei Ebenen mit Grasstruktur
  ctx.fillStyle = lin(ctx, 0, 378, 0, 420, [[0, '#9cbc72'], [1, '#8aab61']]); ctx.fillRect(0, 378, W, 42);
  ctx.fillStyle = lin(ctx, 0, 418, 0, 468, [[0, '#86a75b'], [1, '#749550']]); ctx.fillRect(0, 418, W, 50);
  ctx.fillStyle = lin(ctx, 0, 466, 0, H, [[0, '#678c45'], [1, '#4f7434']]); ctx.fillRect(0, 466, W, H - 466);
  // Pfad, der sich nach hinten verjüngt
  ctx.fillStyle = 'rgba(196, 170, 120, 0.55)';
  ctx.beginPath(); ctx.moveTo(150, 382); ctx.quadraticCurveTo(140, 430, 120, 470); ctx.quadraticCurveTo(90, 520, 70, 560); ctx.lineTo(190, 560); ctx.quadraticCurveTo(190, 500, 175, 465); ctx.quadraticCurveTo(165, 420, 162, 382); ctx.fill();
  // Grashalme
  ctx.strokeStyle = 'rgba(40, 80, 30, 0.45)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 220; i++) {
    const x = rnd(i) * W;
    const y = 380 + rnd(i, 1) * 180;
    const h = 3 + (y - 380) / 180 * 7;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd(i, 2) - 0.5) * 4, y - h); ctx.stroke();
  }
  // liegender Stamm, Pilze, Steine, Farne
  ctx.fillStyle = lin(ctx, 0, 430, 0, 448, [[0, '#7a5c3e'], [1, '#4a3626']]);
  ctx.beginPath(); ctx.roundRect(210, 428, 70, 16, 8); ctx.fill();
  ctx.fillStyle = '#c9a77a'; ellipse(ctx, 280, 436, 5, 8); ctx.fill();
  ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = 1; ellipse(ctx, 280, 436, 2.5, 4.5); ctx.stroke();
  for (const [x, y, s] of [[40, 488, 1], [56, 494, 0.7], [300, 478, 0.8]] as const) {
    ctx.fillStyle = '#f2e6d0'; ctx.fillRect(x - 2 * s, y - 8 * s, 4 * s, 8 * s);
    ctx.fillStyle = rad(ctx, x, y - 9 * s, 9 * s, [[0, '#ff6b4a'], [1, '#b8261a']], x - 3 * s, y - 12 * s);
    ctx.beginPath(); ctx.ellipse(x, y - 8 * s, 8 * s, 6 * s, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (const [dx, dy] of [[-3, -11], [2, -12], [4, -9], [-1, -9]] as const) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, 1 * s, 0, Math.PI * 2); ctx.fill(); }
  }
  for (const [x, y, r] of [[95, 472, 9], [108, 476, 6], [250, 500, 11]] as const) {
    ctx.fillStyle = rad(ctx, x, y, r, [[0, '#b7b5aa'], [1, '#77756c']], x - r / 3, y - r / 2);
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, Math.PI, 0); ctx.lineTo(x + r, y); ctx.fill();
  }
}

/** Krone einer Tanne (liegt hinter Tieren derselben Ebene) */
export function crown(ctx: Ctx, x: number, base: number, h: number, w: number, back: boolean): void {
  // Stamm innerhalb der Krone, von den Ästen verdeckt
  trunk(ctx, x, base - h * 0.9, base - h * 0.4, w * 0.6, back ? 1 : 0);
  fir(ctx, x, base - h * 0.42, h * 0.68, w * 2.9, back ? '#3f6e4a' : '#24583a', back ? '#6f9e72' : '#4a8a55', x);
}

/** Stamm mit Wurzelansatz (liegt vor Tieren derselben Ebene) */
export function tree(ctx: Ctx, x: number, base: number, h: number, w: number, back: boolean): void {
  // sichtbarer Stamm unter der Krone
  trunk(ctx, x, base - h * 0.4, base, w, back ? 1 : 0);
  ctx.fillStyle = 'rgba(20, 40, 20, 0.35)';
  ctx.beginPath(); ctx.ellipse(x, base - h * 0.4, w * 0.7, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = back ? '#5b4a39' : '#4a3626';
  ctx.beginPath(); ctx.moveTo(x - w * 0.9, base); ctx.quadraticCurveTo(x - w * 0.4, base - 8, x - w / 2, base - 16); ctx.lineTo(x + w / 2, base - 16); ctx.quadraticCurveTo(x + w * 0.4, base - 8, x + w * 0.9, base); ctx.fill();
}

/** Büsche, Farne und Lichtstrahlen vorne (über den Tieren) */
export function foreground(ctx: Ctx): void {
  // Lichtstrahlen durch die Bäume
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const x = 150 + i * 55;
    ctx.fillStyle = lin(ctx, x, 60, x - 120, 470, [[0, 'rgba(255, 245, 200, 0.18)'], [1, 'rgba(255, 245, 200, 0)']]);
    ctx.beginPath(); ctx.moveTo(x, 60); ctx.lineTo(x + 18 + i * 4, 60); ctx.lineTo(x - 90 + i * 6, 470); ctx.lineTo(x - 140, 470); ctx.fill();
  }
  ctx.restore();

  const bush = (x: number, y: number, r: number, seed: number) => {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      const cx = x + Math.cos(a) * r * 0.8;
      const cy = y + Math.sin(a) * r * 0.55;
      const rr = r * (0.42 + rnd(seed, i) * 0.2);
      ctx.fillStyle = rad(ctx, cx, cy, rr, [[0, '#5c9445'], [0.7, '#3f6b2f'], [1, '#2c5122']], cx - rr * 0.35, cy - rr * 0.45);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#2c5122';
    ctx.fillRect(x - r * 1.1, y - 2, r * 2.2, 40);
  };
  bush(30, 548, 32, 1); bush(118, 560, 28, 2); bush(212, 556, 34, 3); bush(335, 550, 30, 4);
  // Farnwedel
  const frond = (x: number, y: number, len: number, ang: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.strokeStyle = '#3b6e2c'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.25, len, -len * 0.1); ctx.stroke();
    ctx.fillStyle = '#4f8a3a';
    for (let k = 1; k < 10; k++) {
      const t = k / 10;
      const px = len * t;
      const py = -len * 0.25 * Math.sin(t * Math.PI) - len * 0.1 * t;
      const l = 9 * (1 - t) + 3;
      ellipse(ctx, px, py - l * 0.5, 2, l * 0.6, -0.5); ctx.fill();
      ellipse(ctx, px, py + l * 0.5, 2, l * 0.6, 0.5); ctx.fill();
    }
    ctx.restore();
  };
  frond(-4, 500, 60, -0.3); frond(362, 505, 60, Math.PI + 0.3);
}

/* ---------- Tiere und Figuren ---------- */

export function squirrel(ctx: Ctx): void {
  // buschiger Schwanz mit Fellstrichen
  ctx.fillStyle = lin(ctx, -26, -40, -4, 10, [[0, '#d9772f'], [1, '#9c4416']]);
  ctx.beginPath();
  ctx.moveTo(-4, 6); ctx.bezierCurveTo(-30, 4, -32, -24, -18, -36); ctx.bezierCurveTo(-8, -44, 4, -38, -2, -28); ctx.bezierCurveTo(-12, -22, -14, -4, -4, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(255, 210, 160, 0.55)'; ctx.lineWidth = 0.8;
  for (let i = 0; i < 9; i++) { const a = i / 9; ctx.beginPath(); ctx.moveTo(-8 - a * 14, 2 - a * 34); ctx.lineTo(-14 - a * 14, -2 - a * 30); ctx.stroke(); }
  // Körper und Bauch
  ctx.fillStyle = lin(ctx, -4, -16, 12, 12, [[0, '#d8712d'], [1, '#a24d1b']]);
  ellipse(ctx, 4, -1, 9, 12, 0.2); ctx.fill();
  ctx.fillStyle = '#f6dfbf'; ellipse(ctx, 8, 1, 4, 8, 0.2); ctx.fill();
  // Kopf mit Pinselohr, Auge mit Glanz, Nuss in den Pfoten
  ctx.fillStyle = lin(ctx, 2, -24, 16, -6, [[0, '#e07e35'], [1, '#b0561e']]);
  ellipse(ctx, 8, -15, 7.5, 6.8); ctx.fill();
  ctx.beginPath(); ctx.moveTo(4, -20); ctx.lineTo(4.5, -30); ctx.lineTo(9, -21); ctx.fill();
  ctx.strokeStyle = '#6b2f0c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(4.5, -30); ctx.lineTo(3.5, -33); ctx.stroke();
  ctx.fillStyle = '#f6dfbf'; ellipse(ctx, 13, -12, 3, 2.5); ctx.fill();
  ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.arc(11, -16, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(11.6, -16.6, 0.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3b2412'; ctx.beginPath(); ctx.arc(15.4, -12.6, 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = rad(ctx, 12, -4, 4, [[0, '#b8874a'], [1, '#6b4a24']], 11, -5.5);
  ellipse(ctx, 12, -4, 3.4, 4); ctx.fill();
  ctx.fillStyle = '#c8682a'; ellipse(ctx, 11, -2, 2.4, 1.6); ctx.fill();
}

export function boar(ctx: Ctx, t: number): void {
  const leg = Math.sin(t * 22) * 4;
  // Beine mit Hufen
  for (const [lx, ph] of [[-18, 1], [-8, -1], [8, -1], [18, 1]] as const) {
    ctx.fillStyle = '#3a271c';
    ctx.save(); ctx.translate(lx, -8); ctx.rotate(ph * leg * 0.05);
    ctx.fillRect(-2.5, 0, 5, 10); ctx.fillStyle = '#1b1210'; ctx.fillRect(-2.8, 9, 5.6, 3);
    ctx.restore();
  }
  // Körper mit Fellverlauf
  ctx.fillStyle = lin(ctx, 0, -32, 0, 0, [[0, '#5a4030'], [0.6, '#46301f'], [1, '#2e1f15']]);
  ctx.beginPath();
  ctx.moveTo(-30, -14); ctx.bezierCurveTo(-32, -30, -10, -36, 8, -32); ctx.bezierCurveTo(22, -30, 30, -24, 32, -16);
  ctx.bezierCurveTo(30, -6, 18, -3, 0, -3); ctx.bezierCurveTo(-18, -3, -28, -6, -30, -14); ctx.fill();
  // Borstenkamm
  ctx.strokeStyle = '#24170f'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 16; i++) { const x = -22 + i * 3; const y = -31 - Math.sin(i / 15 * Math.PI) * 3; ctx.beginPath(); ctx.moveTo(x, y + 3); ctx.lineTo(x + 1.5, y - 3); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(120, 90, 70, 0.5)'; ctx.lineWidth = 0.8;
  for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.moveTo(-24 + i * 4.5, -24 + (i % 3) * 5); ctx.lineTo(-21 + i * 4.5, -20 + (i % 3) * 5); ctx.stroke(); }
  // Kopf, Rüsselscheibe, Hauer, Ohr, Auge, Schwänzchen
  ctx.fillStyle = lin(ctx, 20, -26, 42, -6, [[0, '#4e3626'], [1, '#2e1f15']]);
  ctx.beginPath(); ctx.moveTo(22, -28); ctx.quadraticCurveTo(36, -24, 42, -14); ctx.lineTo(40, -6); ctx.quadraticCurveTo(30, -4, 22, -8); ctx.fill();
  ctx.fillStyle = '#8f6c5a'; ellipse(ctx, 42, -10, 3.4, 4.6); ctx.fill();
  ctx.fillStyle = '#3a271c'; ctx.beginPath(); ctx.arc(42.5, -11.5, 0.9, 0, Math.PI * 2); ctx.arc(42.5, -8.5, 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f4efe2'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(36, -7); ctx.quadraticCurveTo(39, -13, 35, -16); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#3a271c'; ctx.beginPath(); ctx.moveTo(24, -26); ctx.lineTo(26, -36); ctx.lineTo(30, -26); ctx.fill();
  ctx.fillStyle = '#120c08'; ctx.beginPath(); ctx.arc(31, -19, 1.7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; ctx.beginPath(); ctx.arc(31.5, -19.6, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2e1f15'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-30, -18); ctx.quadraticCurveTo(-36, -20, -34, -14); ctx.stroke();
}

export function deer(ctx: Ctx, t: number, walking: boolean): void {
  const leg = walking ? Math.sin(t * 9) * 5 : 0;
  const coat = (y0: number, y1: number) => lin(ctx, 0, y0, 0, y1, [[0, '#b0763f'], [1, '#7f4f26']]);
  // Beine mit Gelenk und Hufen
  for (const [lx, ph, back] of [[-18, 1, 1], [-11, -1, 1], [12, -1, 0], [19, 1, 0]] as const) {
    ctx.save(); ctx.translate(lx, -34); ctx.rotate(ph * leg * 0.04);
    ctx.fillStyle = back ? '#7f4f26' : '#8f5a2c';
    ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.lineTo(1.8, 18); ctx.lineTo(1.6, 33); ctx.lineTo(-1.2, 33); ctx.lineTo(-1.6, 18); ctx.fill();
    ctx.fillStyle = '#2b1d12'; ctx.fillRect(-1.6, 32, 3.6, 3);
    ctx.restore();
  }
  // Rumpf, heller Bauch, weisser Spiegel
  ctx.fillStyle = coat(-52, -28);
  ctx.beginPath(); ctx.moveTo(-26, -42); ctx.bezierCurveTo(-24, -54, 6, -54, 20, -50); ctx.bezierCurveTo(28, -46, 28, -34, 20, -31); ctx.bezierCurveTo(4, -28, -16, -28, -24, -32); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(245, 225, 195, 0.75)'; ellipse(ctx, -2, -31.5, 16, 3.2); ctx.fill();
  ctx.fillStyle = '#fbf3e6'; ellipse(ctx, -25, -43, 4, 6); ctx.fill();
  ctx.fillStyle = '#3b2412'; ellipse(ctx, -27, -46, 2, 3.4, 0.3); ctx.fill();
  // Hals und Kopf
  ctx.fillStyle = coat(-74, -40);
  ctx.beginPath(); ctx.moveTo(14, -50); ctx.quadraticCurveTo(20, -62, 25, -72); ctx.lineTo(34, -68); ctx.quadraticCurveTo(28, -56, 26, -44); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(24, -74); ctx.quadraticCurveTo(34, -78, 43, -70); ctx.quadraticCurveTo(44, -66, 40, -65); ctx.quadraticCurveTo(32, -64, 27, -66); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2b1d12'; ctx.beginPath(); ctx.arc(43, -68.5, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9a6233'; ctx.beginPath(); ctx.moveTo(25, -73); ctx.quadraticCurveTo(16, -80, 18, -76); ctx.quadraticCurveTo(20, -72, 26, -71); ctx.fill();
  ctx.fillStyle = '#120c08'; ctx.beginPath(); ctx.arc(33, -71.5, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'; ctx.beginPath(); ctx.arc(33.5, -72, 0.5, 0, Math.PI * 2); ctx.fill();
  // verzweigtes Geweih, zur Spitze schmaler
  ctx.strokeStyle = '#6b4a2b'; ctx.lineCap = 'round';
  const branch = (pts: [number, number][], w: number) => {
    for (let i = 1; i < pts.length; i++) {
      ctx.lineWidth = w * (1 - i / (pts.length + 1));
      ctx.beginPath(); ctx.moveTo(...pts[i - 1]!); ctx.lineTo(...pts[i]!); ctx.stroke();
    }
  };
  branch([[28, -75], [25, -86], [22, -96], [24, -104]], 3);
  branch([[25, -86], [16, -90]], 2);
  branch([[23, -95], [16, -101]], 1.8);
  branch([[31, -75], [34, -88], [38, -98]], 2.6);
  branch([[34, -88], [42, -91]], 1.8);
  ctx.lineCap = 'butt';
}

export function hiker(ctx: Ctx, t: number): void {
  const step = Math.sin(t * 7) * 6;
  // Beine mit Schuhen
  ctx.lineCap = 'round';
  for (const [s, c] of [[-1, '#2f3e46'], [1, '#3a4b54']] as const) {
    ctx.strokeStyle = c; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(s * step * 0.4, -14); ctx.lineTo(s * step * 0.7, -2); ctx.stroke();
    ctx.fillStyle = '#4a3020'; ctx.beginPath(); ctx.roundRect(s * step * 0.7 - 3, -3, 8, 4, 1.5); ctx.fill();
  }
  // Rucksack, Jacke mit Reissverschluss, Arm mit Stock
  ctx.fillStyle = lin(ctx, -18, -60, -8, -34, [[0, '#2a9d8f'], [1, '#1d6f66']]);
  ctx.beginPath(); ctx.roundRect(-18, -60, 11, 26, 3); ctx.fill();
  ctx.fillStyle = '#e9c46a'; ctx.fillRect(-18, -40, 11, 3);
  ctx.fillStyle = lin(ctx, -9, -60, 9, -30, [[0, '#ef5a4c'], [1, '#c1121f']]);
  ctx.beginPath(); ctx.roundRect(-9, -60, 18, 31, 4); ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(2, -59); ctx.lineTo(2, -30); ctx.stroke();
  ctx.strokeStyle = '#c1121f'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(6, -55); ctx.lineTo(12 + step * 0.3, -42); ctx.stroke();
  ctx.strokeStyle = '#7a5634'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(14 + step * 0.3, -46); ctx.lineTo(18 + step * 0.6, 0); ctx.stroke();
  // Kopf mit Hut und Gesicht
  ctx.fillStyle = rad(ctx, 0, -67, 8, [[0, '#f6d1a5'], [1, '#e0a878']], -2, -69);
  ctx.beginPath(); ctx.arc(1, -67, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.arc(4.5, -68, 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#264653'; ctx.beginPath(); ctx.ellipse(1, -73, 11, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(-5, -81, 12, 8, 3); ctx.fill();
  ctx.fillStyle = '#e63946'; ctx.fillRect(-5, -75.5, 12, 1.6);
  ctx.lineCap = 'butt';
}

export function hedgehog(ctx: Ctx, t: number): void {
  const wobble = Math.sin(t * 10) * 0.6;
  // Stacheln als viele feine Striche über einem dunklen Rücken
  ctx.fillStyle = '#4a3627';
  ctx.beginPath(); ctx.ellipse(-2, -6, 17, 11, 0, Math.PI, 0); ctx.fill();
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 46; i++) {
    const a = Math.PI + (i / 45) * Math.PI;
    const r0 = 6 + rnd(i) * 4;
    const r1 = 15 + rnd(i, 3) * 6;
    ctx.strokeStyle = i % 3 ? '#6b4f3a' : '#c9b08f';
    ctx.beginPath();
    ctx.moveTo(-2 + Math.cos(a) * r0, -5 + Math.sin(a) * r0 * 0.75);
    ctx.lineTo(-2 + Math.cos(a - 0.15) * r1, -5 + Math.sin(a - 0.15) * r1 * 0.8 + wobble);
    ctx.stroke();
  }
  // Gesicht mit Spitznase
  ctx.fillStyle = rad(ctx, 13, -5, 8, [[0, '#ecd2ae'], [1, '#c99e70']], 12, -7);
  ctx.beginPath(); ctx.moveTo(8, -12); ctx.quadraticCurveTo(18, -9, 23, -4); ctx.quadraticCurveTo(18, -1, 8, -1); ctx.fill();
  ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.arc(23, -4, 1.6, 0, Math.PI * 2); ctx.arc(15, -7, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5a4030'; ctx.fillRect(-10, -2, 3, 3); ctx.fillRect(6, -2, 3, 3);
}

export function acorn(ctx: Ctx, t: number): void {
  ctx.save();
  ctx.rotate(Math.sin(t * 3) * 0.2);
  ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 16;
  ctx.fillStyle = rad(ctx, 0, 4, 12, [[0, '#fff1b8'], [0.4, '#f0b733'], [1, '#b7791f']], -3, 0);
  ctx.beginPath(); ctx.ellipse(0, 4, 9, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#7a4f24';
  ctx.beginPath(); ctx.ellipse(0, -5, 11.5, 6.5, 0, Math.PI, 0); ctx.lineTo(11.5, -4); ctx.quadraticCurveTo(0, -1, -11.5, -4); ctx.fill();
  ctx.strokeStyle = 'rgba(255, 220, 160, 0.35)'; ctx.lineWidth = 0.7;
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 3, -10); ctx.lineTo(i * 3 + 2, -3); ctx.stroke(); }
  ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-1.2, -15, 2.4, 5);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'; ctx.beginPath(); ctx.ellipse(-3.5, 2, 1.8, 4, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function birdhouse(ctx: Ctx): void {
  ctx.fillStyle = lin(ctx, -12, 0, 12, 0, [[0, '#d39550'], [1, '#a5692c']]);
  ctx.fillRect(-12, -8, 24, 22);
  ctx.strokeStyle = 'rgba(90, 50, 20, 0.35)'; ctx.lineWidth = 0.8;
  for (let i = -8; i <= 8; i += 4) { ctx.beginPath(); ctx.moveTo(i, -8); ctx.lineTo(i, 14); ctx.stroke(); }
  ctx.fillStyle = '#9c2f2f';
  ctx.beginPath(); ctx.moveTo(-17, -6); ctx.lineTo(0, -21); ctx.lineTo(17, -6); ctx.lineTo(14, -4); ctx.lineTo(0, -16); ctx.lineTo(-14, -4); ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-17 + i * 4, -6 - i * 3.6); ctx.lineTo(17 - i * 4, -6 - i * 3.6); ctx.stroke(); }
  ctx.fillStyle = '#2a1a0e'; ctx.beginPath(); ctx.arc(0, 2, 4.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5a4330'; ctx.fillRect(-1.5, 9, 3, 2); ctx.fillRect(-5, 9, 10, 1.8);
  ctx.fillRect(-1.5, 14, 3, 9);
}
