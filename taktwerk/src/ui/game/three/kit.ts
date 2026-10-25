/**
 * 3D-Baukasten der Pausenspiele (three.js, WebGL): Renderer mit filmischer Tonwertkurve, weichen Schatten und
 * Umgebungslicht für glänzende Materialien, dazu prozedurale Texturen (Beton, Erde, Holz, Rinde, Ziegel,
 * Warnstreifen …). Wird nur nachgeladen, wenn ein 3D-Spiel startet.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export { THREE };

/** Renderer in eine eigene, unsichtbare Fläche; das Bild wird in die Spielfläche kopiert */
export function makeRenderer(): THREE.WebGLRenderer {
  const canvas = document.createElement('canvas');
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1;
  // Ohne Grafikkarte (Software-Renderer): kleiner zeichnen und ohne Schatten, damit das Spiel flüssig bleibt
  if (software(r)) lowPower.add(r);
  r.shadowMap.enabled = !lowPower.has(r);
  r.shadowMap.type = THREE.PCFShadowMap;
  return r;
}

const lowPower = new WeakSet<THREE.WebGLRenderer>();

function software(r: THREE.WebGLRenderer): boolean {
  try {
    const gl = r.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    return /swiftshader|llvmpipe|software|softpipe/i.test(name);
  } catch { return false; }
}

/** Spiegelungen für Metall und Lack aus einer neutralen Studio-Umgebung */
export function studioEnvironment(r: THREE.WebGLRenderer): THREE.Texture {
  const pm = new THREE.PMREMGenerator(r);
  const tex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  return tex;
}

/** Grösse anpassen: Spielwelt W × H, Massstab k (inkl. Pixeldichte, höchstens 2) */
export function fit(r: THREE.WebGLRenderer, cam: THREE.PerspectiveCamera, W: number, H: number, k: number): void {
  const kk = lowPower.has(r) ? 0.5 : Math.min(2, Math.max(0.5, k));
  const w = Math.round(W * kk), h = Math.round(H * kk);
  if (r.domElement.width !== w || r.domElement.height !== h) {
    r.setSize(w, h, false);
    cam.aspect = W / H;
    cam.updateProjectionMatrix();
  }
}

const still = new WeakMap<THREE.WebGLRenderer, { c: HTMLCanvasElement; t: number }>();

/**
 * Szene zeichnen und in die 2D-Spielfläche kopieren. Ohne Grafikkarte nur alle 0,4 s neu zeichnen und
 * dazwischen das letzte Bild zeigen: Spiellogik, Anzeigen und Eingaben bleiben so flüssig.
 */
export function present(ctx: CanvasRenderingContext2D, r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, W: number, H: number): void {
  if (!lowPower.has(r)) {
    r.render(scene, cam);
    ctx.drawImage(r.domElement, 0, 0, W, H);
    return;
  }
  let s = still.get(r);
  if (!s) { s = { c: document.createElement('canvas'), t: -Infinity }; still.set(r, s); }
  if (performance.now() - s.t >= 400) {
    r.render(scene, cam);
    s.c.width = r.domElement.width;
    s.c.height = r.domElement.height;
    s.c.getContext('2d')?.drawImage(r.domElement, 0, 0);
    s.t = performance.now();
  }
  ctx.drawImage(s.c, 0, 0, W, H);
}

/** Ladebild, solange three.js noch nachgeladen wird */
export function drawLoading(ctx: CanvasRenderingContext2D, W: number, H: number, text = '3D-Welt wird geladen …'): void {
  ctx.fillStyle = '#0d1214';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e3ebeb';
  ctx.font = '700 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, H / 2);
  ctx.textAlign = 'left';
}

/* ---------- Prozedurale Texturen ---------- */

const texCache = new Map<string, THREE.CanvasTexture>();

/** Kleiner deterministischer Zufall für Texturen */
export function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(key: string, size: number, paint: (c: CanvasRenderingContext2D, s: number) => void, repeat: [number, number] = [1, 1], color = true): THREE.CanvasTexture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const el = document.createElement('canvas');
  el.width = el.height = size;
  const c = el.getContext('2d')!;
  paint(c, size);
  const t = new THREE.CanvasTexture(el);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/** Fleckiges Rauschen über eine Grundfarbe */
export function noise(c: CanvasRenderingContext2D, s: number, base: string, tones: string[], n: number, r0: number, r1: number, seed = 1): void {
  const rnd = rand(seed);
  c.fillStyle = base;
  c.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    c.globalAlpha = 0.08 + rnd() * 0.18;
    c.fillStyle = tones[i % tones.length]!;
    const x = rnd() * s, y = rnd() * s, r = r0 + rnd() * (r1 - r0);
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    // nahtlos: auch am gegenüberliegenden Rand
    if (x < r) { c.beginPath(); c.arc(x + s, y, r, 0, Math.PI * 2); c.fill(); }
    if (y < r) { c.beginPath(); c.arc(x, y + s, r, 0, Math.PI * 2); c.fill(); }
  }
  c.globalAlpha = 1;
}

export const concreteTex = () => canvasTexture('concrete', 256, (c, s) => {
  noise(c, s, '#a9a9a4', ['#8c8c86', '#c4c4bd', '#7d7d78', '#b8b2a6'], 900, 1, 6, 3);
  c.strokeStyle = 'rgba(60, 60, 55, 0.35)'; c.lineWidth = 2;
  c.strokeRect(1, 1, s - 2, s - 2);
  c.strokeStyle = 'rgba(60, 60, 55, 0.25)'; c.lineWidth = 1;
  const rnd = rand(9);
  for (let i = 0; i < 3; i++) { c.beginPath(); let x = rnd() * s, y = rnd() * s; c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; c.lineTo(x, y); } c.stroke(); }
});

export const dirtTex = () => canvasTexture('dirt', 256, (c, s) => {
  noise(c, s, '#8f6d47', ['#6e5233', '#a9845a', '#5c4429', '#b89565'], 1400, 1, 5, 5);
  const rnd = rand(11);
  c.fillStyle = 'rgba(70, 60, 50, 0.6)';
  for (let i = 0; i < 120; i++) { c.beginPath(); c.arc(rnd() * s, rnd() * s, 0.8 + rnd() * 1.6, 0, Math.PI * 2); c.fill(); }
}, [12, 12]);

export const stripeTex = () => canvasTexture('stripes', 128, (c, s) => {
  c.fillStyle = '#ffb000'; c.fillRect(0, 0, s, s);
  c.fillStyle = '#1b1c1e';
  for (let k = -2; k < 4; k++) { c.beginPath(); c.moveTo(k * s / 2, s); c.lineTo(k * s / 2 + s / 4, s); c.lineTo(k * s / 2 + s / 4 + s, 0); c.lineTo(k * s / 2 + s, 0); c.closePath(); c.fill(); }
});

export const barrierTex = () => canvasTexture('barrier', 128, (c, s) => {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, s, s);
  c.fillStyle = '#d62828';
  for (let k = -2; k < 4; k++) { c.beginPath(); c.moveTo(k * s / 2, s); c.lineTo(k * s / 2 + s / 4, s); c.lineTo(k * s / 2 + s / 4 + s / 2, 0); c.lineTo(k * s / 2 + s / 2, 0); c.closePath(); c.fill(); }
});

export const meshTex = () => canvasTexture('fence-mesh', 128, (c, s) => {
  c.clearRect(0, 0, s, s);
  c.strokeStyle = 'rgba(170, 180, 190, 1)'; c.lineWidth = 3;
  for (let k = 0; k <= 8; k++) { c.beginPath(); c.moveTo((k * s) / 8, 0); c.lineTo((k * s) / 8, s); c.stroke(); c.beginPath(); c.moveTo(0, (k * s) / 8); c.lineTo(s, (k * s) / 8); c.stroke(); }
  c.lineWidth = 6; c.strokeRect(0, 0, s, s);
});

export const vestTex = () => canvasTexture('vest', 128, (c, s) => {
  c.fillStyle = '#ff6b00'; c.fillRect(0, 0, s, s);
  noise(c, s, 'rgba(0,0,0,0)', ['#ff8a2a', '#e85d00'], 300, 1, 3, 4);
  c.fillStyle = '#ff6b00'; c.globalAlpha = 0.5; c.fillRect(0, 0, s, s); c.globalAlpha = 1;
  c.fillStyle = '#d8dde2';
  c.fillRect(0, s * 0.42, s, s * 0.1); c.fillRect(0, s * 0.68, s, s * 0.1);
  c.fillStyle = 'rgba(255, 255, 255, 0.5)'; c.fillRect(0, s * 0.43, s, s * 0.02); c.fillRect(0, s * 0.69, s, s * 0.02);
}, [1, 1]);

export const woodTex = (tint = '#6b4a2a') => canvasTexture(`wood-${tint}`, 256, (c, s) => {
  c.fillStyle = tint; c.fillRect(0, 0, s, s);
  const rnd = rand(17);
  for (let y = 0; y < s; y += 32) {
    c.fillStyle = 'rgba(0, 0, 0, 0.35)'; c.fillRect(0, y, s, 2);
    for (let i = 0; i < 14; i++) {
      c.strokeStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,230,200'}, ${0.06 + rnd() * 0.1})`;
      c.lineWidth = 1;
      c.beginPath(); const yy = y + 3 + rnd() * 27; c.moveTo(0, yy); c.bezierCurveTo(s * 0.3, yy + (rnd() - 0.5) * 6, s * 0.6, yy + (rnd() - 0.5) * 6, s, yy); c.stroke();
    }
    if (rnd() < 0.5) { c.fillStyle = 'rgba(30, 15, 5, 0.35)'; c.beginPath(); c.ellipse(rnd() * s, y + 16, 5, 3, 0, 0, Math.PI * 2); c.fill(); }
  }
});

export const barkTex = () => canvasTexture('bark', 256, (c, s) => {
  c.fillStyle = '#2e2620'; c.fillRect(0, 0, s, s);
  const rnd = rand(23);
  for (let i = 0; i < 70; i++) {
    c.strokeStyle = `rgba(${rnd() < 0.5 ? '15,10,8' : '90,78,66'}, ${0.3 + rnd() * 0.4})`;
    c.lineWidth = 1 + rnd() * 3;
    const x = rnd() * s;
    c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + (rnd() - 0.5) * 20, s * 0.3, x + (rnd() - 0.5) * 20, s * 0.7, x, s); c.stroke();
  }
}, [1, 2]);

export const grassTex = (base = '#1d2a1c') => canvasTexture(`grass-${base}`, 256, (c, s) => {
  noise(c, s, base, ['#2c3d29', '#141e13', '#3a4a31', '#252b1f'], 1600, 1, 4, 29);
  const rnd = rand(31);
  for (let i = 0; i < 900; i++) {
    c.strokeStyle = `rgba(${60 + rnd() * 40}, ${80 + rnd() * 50}, ${50 + rnd() * 20}, 0.35)`;
    const x = rnd() * s, y = rnd() * s;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rnd() - 0.5) * 3, y - 3 - rnd() * 5); c.stroke();
  }
}, [16, 16]);

export const plankWallTex = (tint: string) => canvasTexture(`planks-${tint}`, 256, (c, s) => {
  c.fillStyle = tint; c.fillRect(0, 0, s, s);
  noise(c, s, 'rgba(0,0,0,0)', ['#000000', '#ffffff'], 500, 1, 4, 37);
  c.fillStyle = tint; c.globalAlpha = 0.6; c.fillRect(0, 0, s, s); c.globalAlpha = 1;
  for (let x = 0; x < s; x += 32) { c.fillStyle = 'rgba(0, 0, 0, 0.45)'; c.fillRect(x, 0, 3, s); c.fillStyle = 'rgba(255, 255, 255, 0.06)'; c.fillRect(x + 3, 0, 2, s); }
  const rnd = rand(41);
  for (let i = 0; i < 18; i++) { c.fillStyle = 'rgba(20, 20, 20, 0.6)'; c.beginPath(); c.arc(Math.floor(rnd() * 8) * 32 + 16, rnd() * s, 1.6, 0, Math.PI * 2); c.fill(); }
});

export const roofTex = (tint: string) => canvasTexture(`roof-${tint}`, 256, (c, s) => {
  c.fillStyle = tint; c.fillRect(0, 0, s, s);
  const rnd = rand(43);
  for (let y = 0; y < s; y += 24) {
    const off = (y / 24) % 2 ? 16 : 0;
    for (let x = -32 + off; x < s; x += 32) {
      c.fillStyle = `rgba(0, 0, 0, ${0.15 + rnd() * 0.2})`;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 32, y); c.lineTo(x + 30, y + 22); c.quadraticCurveTo(x + 16, y + 26, x + 2, y + 22); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(0, 0, 0, 0.5)'; c.stroke();
    }
  }
});

export const stoneTex = () => canvasTexture('stone', 256, (c, s) => {
  noise(c, s, '#6f6e6a', ['#585753', '#8a8984', '#4a4946', '#7b7a70'], 1200, 1, 7, 47);
  c.fillStyle = 'rgba(80, 110, 60, 0.35)';
  const rnd = rand(53);
  for (let i = 0; i < 40; i++) { c.beginPath(); c.arc(rnd() * s, rnd() * s * 0.5, 3 + rnd() * 10, 0, Math.PI * 2); c.fill(); }
});

/** Schild mit Text oder Pfeilen */
export function signTex(key: string, paint: (c: CanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 128): THREE.CanvasTexture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const el = document.createElement('canvas');
  el.width = w; el.height = h;
  paint(el.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/** Himmelskugel mit Verlauf (dreht sich mit der Kamera korrekt mit) */
export function skyDome(top: string, mid: string, bottom: string, radius = 400): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) }, bottom: { value: new THREE.Color(bottom) } },
    vertexShader: 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main() { float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h * 2.2, 0.0, 1.0), 0.7)) : mix(mid, bottom, clamp(-h * 6.0, 0.0, 1.0)); gl_FragColor = vec4(c, 1.0); }',
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -10;
  return m;
}

/** Standardmaterial mit sinnvollen Vorgaben */
export const mat = (color: string | THREE.Color, opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts });

/** Mesh mit Schattenwurf */
export function mesh(geo: THREE.BufferGeometry, m: THREE.Material, cast = true, receive = false): THREE.Mesh {
  const x = new THREE.Mesh(geo, m);
  x.castShadow = cast;
  x.receiveShadow = receive;
  return x;
}
