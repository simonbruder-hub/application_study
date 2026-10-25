/**
 * 3D-Ansicht von «Kürbismann: Das richtige Haus»: nebliger Nachtwald unter dem Mond, Spukhäuser mit
 * leuchtenden Fenstern und ihren Merkmalen (Katze, Kürbis, Rabe, Grabstein), Taschenlampe als Scheinwerfer
 * mit Schatten, Fledermäuse, Nebelschwaden. Kamera über der Schulter; beim Umsehen tritt die Figur zur Seite.
 */
import { FIELD, goalIndex, type Haunt, type House, inLight, lampCone, lampRange, type Light, viewYaw } from '../pumpkin';
import { buildFigure, type Figure, pose } from './figure';
import { barkTex, present, canvasTexture, fit, grassTex, makeRenderer, mat, mesh, plankWallTex, rand, roofTex, skyDome, stoneTex, studioEnvironment, THREE, woodTex } from './kit';

const W = 360;
const H = 560;
const GLOW: Record<Light, string> = { gelb: '#ffc65c', grün: '#7cfc5a', violett: '#c77dff' };

/** Kürbisgesicht als Textur (leuchtend, Rest durchsichtig) */
const faceTex = () => canvasTexture('pumpkin-face', 128, (c, s) => {
  c.clearRect(0, 0, s, s);
  c.fillStyle = '#ffd36b';
  c.shadowColor = '#ff9a1f'; c.shadowBlur = 10;
  c.beginPath(); c.moveTo(30, 52); c.lineTo(50, 30); c.lineTo(58, 56); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(98, 52); c.lineTo(78, 30); c.lineTo(70, 56); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(58, 70); c.lineTo(64, 60); c.lineTo(70, 70); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(24, 78); c.quadraticCurveTo(64, 116, 104, 78); c.lineTo(96, 84); c.lineTo(90, 92); c.lineTo(82, 86); c.lineTo(74, 96); c.lineTo(64, 88); c.lineTo(54, 96); c.lineTo(46, 86); c.lineTo(38, 92); c.lineTo(32, 84); c.closePath(); c.fill();
});

const softTex = () => canvasTexture('soft-blob', 64, (c, s) => {
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, s, s);
});

function pumpkinModel(r: number, glow: number): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({ color: '#e8701a', roughness: 0.55, emissive: '#5a1d00', emissiveIntensity: glow * 0.5 }));
  body.scale.y = 0.82;
  // Rippen
  for (let i = 0; i < 6; i++) {
    const rib = new THREE.Mesh(new THREE.SphereGeometry(r * 1.002, 8, 12, 0, 0.18), mat('#c45a10', { roughness: 0.6 }));
    rib.rotation.y = (i / 6) * Math.PI * 2;
    rib.scale.y = 0.82;
    g.add(rib);
  }
  const stem = mesh(new THREE.CylinderGeometry(r * 0.08, r * 0.12, r * 0.4, 8), mat('#4f6b1e'));
  stem.position.y = r * 0.9;
  stem.rotation.z = 0.25;
  // Gesicht als Schale vor dem Kürbis (Richtung +Z)
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.015, 20, 14, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.85, 1.7),
    new THREE.MeshBasicMaterial({ map: faceTex(), transparent: true, depthWrite: false, toneMapped: false }),
  );
  face.scale.y = 0.82;
  face.name = 'face';
  g.add(body, stem, face);
  return g;
}

function catModel(): THREE.Group {
  const g = new THREE.Group();
  const black = mat('#0c0c10', { roughness: 0.7 });
  const body = mesh(new THREE.CapsuleGeometry(0.16, 0.34, 6, 10), black);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.2;
  const head = mesh(new THREE.SphereGeometry(0.15, 14, 10), black);
  head.position.set(0.32, 0.42, 0);
  for (const z of [-0.07, 0.07]) {
    const ear = mesh(new THREE.ConeGeometry(0.05, 0.12, 6), black);
    ear.position.set(0.32, 0.6, z);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: '#d8ff6a', toneMapped: false }));
    eye.position.set(0.45, 0.44, z * 0.8);
    g.add(ear, eye);
  }
  const tail = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.3, 0.2, 0), new THREE.Vector3(-0.45, 0.4, 0), new THREE.Vector3(-0.4, 0.62, 0), new THREE.Vector3(-0.3, 0.7, 0)]), 16, 0.03, 6), black);
  g.add(body, head, tail);
  return g;
}

function ravenModel(): THREE.Group {
  const g = new THREE.Group();
  const black = mat('#101016', { roughness: 0.4, metalness: 0.2 });
  const body = mesh(new THREE.SphereGeometry(0.17, 12, 10), black);
  body.scale.set(1.5, 1, 0.9);
  body.position.y = 0.2;
  const head = mesh(new THREE.SphereGeometry(0.1, 12, 10), black);
  head.position.set(0.22, 0.36, 0);
  const beak = mesh(new THREE.ConeGeometry(0.035, 0.14, 8), mat('#3b3b40', { roughness: 0.3 }));
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.36, 0.35, 0);
  const tail = mesh(new THREE.BoxGeometry(0.22, 0.03, 0.12), black);
  tail.position.set(-0.3, 0.16, 0);
  tail.rotation.z = 0.3;
  for (const z of [-0.04, 0.04]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), new THREE.MeshBasicMaterial({ color: '#ff3030', toneMapped: false }));
    eye.position.set(0.28, 0.39, z);
    g.add(eye);
  }
  g.add(body, head, beak, tail);
  return g;
}

function graveModel(): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: 0.95 });
  const slab = mesh(new THREE.BoxGeometry(0.6, 0.8, 0.16), stone);
  slab.position.y = 0.4;
  const top = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 16, 1, false, 0, Math.PI), stone);
  top.rotation.x = Math.PI / 2;
  top.rotation.z = Math.PI / 2;
  top.position.y = 0.8;
  const cross = mesh(new THREE.BoxGeometry(0.06, 0.3, 0.02), mat('#3a3a3a'));
  cross.position.set(0, 0.55, 0.09);
  const bar = mesh(new THREE.BoxGeometry(0.2, 0.06, 0.02), mat('#3a3a3a'));
  bar.position.set(0, 0.6, 0.09);
  g.add(slab, top, cross, bar);
  return g;
}

function houseModel(h: House): { group: THREE.Group; door: THREE.Group } {
  const g = new THREE.Group();
  const wallH = h.tall ? 4.6 : 3.3;
  const walls = mesh(new THREE.BoxGeometry(5, wallH, 5), new THREE.MeshStandardMaterial({ map: plankWallTex(h.wall), roughness: 0.95 }), true, true);
  walls.position.y = wallH / 2;
  const roof = mesh(new THREE.ConeGeometry(4.1, 2.8, 4, 1), new THREE.MeshStandardMaterial({ map: roofTex(h.roof), roughness: 0.9 }));
  roof.position.y = wallH + 1.4;
  roof.rotation.y = Math.PI / 4;
  const chimney = mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: 0.95 }));
  chimney.position.set(1.2, wallH + 1.6, -0.9);
  g.add(walls, roof, chimney);
  // Tür mit Rahmen und Stufe
  // Tür dreht im Scharnier (linke Kante)
  const door = new THREE.Group();
  door.position.set(-0.55, 1.0, 2.52);
  const leaf = mesh(new THREE.BoxGeometry(1.1, 2.0, 0.12), new THREE.MeshStandardMaterial({ map: woodTex('#3a2414'), roughness: 0.8 }));
  leaf.position.x = 0.55;
  door.add(leaf);
  const frame = mesh(new THREE.BoxGeometry(1.4, 2.25, 0.08), mat('#1c140f'));
  frame.position.set(0, 1.1, 2.48);
  const step = mesh(new THREE.BoxGeometry(1.8, 0.2, 0.7), new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: 0.95 }), true, true);
  step.position.set(0, 0.1, 2.85);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: '#c9a227', metalness: 1, roughness: 0.3 }));
  knob.position.set(0.93, 0, 0.08);
  door.add(knob);
  // dahinter Dunkelheit
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.0), new THREE.MeshBasicMaterial({ color: '#020203' }));
  dark.position.set(0, 1.0, 2.525);
  g.add(frame, dark, door, step);
  // Fenster leuchten in der Farbe des Hauses
  const glow = new THREE.MeshBasicMaterial({ color: GLOW[h.light], toneMapped: false });
  const bars = mat('#120c08');
  const win = (x: number, y: number, z: number, ry: number) => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.0), glow);
    w.position.set(x, y, z); w.rotation.y = ry;
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.04), bars);
    cross.position.set(x, y, z); cross.rotation.y = ry;
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.04), bars);
    cross2.position.set(x, y, z); cross2.rotation.y = ry;
    g.add(w, cross, cross2);
  };
  win(-1.6, 1.7, 2.52, 0); win(1.6, 1.7, 2.52, 0);
  win(2.52, 1.7, 0, Math.PI / 2); win(-2.52, 1.7, 0, -Math.PI / 2);
  if (h.tall) { win(0, 3.6, 2.52, 0); }
  const light = new THREE.PointLight(GLOW[h.light], 7, 9, 1.6);
  light.position.set(0, 1.6, 4.2);
  g.add(light);
  // Merkmal
  if (h.mark === 'katze') { const c = catModel(); c.position.set(-0.2, wallH + 2.45, 0.2); c.rotation.y = -Math.PI / 2; c.name = 'mark'; g.add(c); }
  else if (h.mark === 'kürbis') { const p = pumpkinModel(0.38, 1); p.position.set(1.3, 0.32, 3.1); p.name = 'mark'; const pl = new THREE.PointLight('#ff8a1f', 3, 4, 2); pl.position.set(1.3, 0.6, 3.6); g.add(p, pl); }
  else if (h.mark === 'rabe') { const r = ravenModel(); r.position.set(1.2, wallH + 2.5, -0.9); r.rotation.y = -Math.PI / 2; r.name = 'mark'; g.add(r); }
  else { const gr = graveModel(); gr.position.set(-1.7, 0, 3.3); gr.rotation.y = 0.2; gr.name = 'mark'; g.add(gr); }
  g.position.set(h.x, 0, h.z);
  g.rotation.y = h.face;
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
  return { group: g, door };
}

function deadTree(rnd: () => number, s: number): THREE.Group {
  const g = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ map: barkTex(), color: '#6a5a4c', roughness: 1 });
  const h = 4.5 * s;
  const trunk = mesh(new THREE.CylinderGeometry(0.16 * s, 0.32 * s, h, 9), bark);
  trunk.position.y = h / 2;
  trunk.rotation.z = (rnd() - 0.5) * 0.12;
  g.add(trunk);
  for (let i = 0; i < 5; i++) {
    const len = (1.2 + rnd() * 1.6) * s;
    const b = mesh(new THREE.CylinderGeometry(0.03 * s, 0.1 * s, len, 6), bark);
    const a = rnd() * Math.PI * 2;
    const y = h * (0.45 + rnd() * 0.5);
    b.position.set(Math.cos(a) * len * 0.4, y + len * 0.3, Math.sin(a) * len * 0.4);
    b.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    g.add(b);
  }
  return g;
}

function pine(s: number): THREE.Group {
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 1.4 * s, 8), new THREE.MeshStandardMaterial({ map: barkTex(), roughness: 1 }));
  trunk.position.y = 0.7 * s;
  g.add(trunk);
  const needles = mat('#12261a', { roughness: 0.95 });
  for (let k = 0; k < 3; k++) {
    const c = mesh(new THREE.ConeGeometry((1.6 - k * 0.4) * s, (2.2 - k * 0.3) * s, 9), needles);
    c.position.y = (1.6 + k * 1.1) * s;
    g.add(c);
  }
  return g;
}

/** Kürbismann: lange, dünne Gestalt im schwarzen Anzug mit Kürbiskopf */
function pumpkinMan(): { root: THREE.Group; fig: Figure; head: THREE.Group; light: THREE.PointLight } {
  const fig = buildFigure({ skin: '#cfc6b2', top: '#141018', pants: '#141018', shoes: '#08080a', hat: 'hood', hair: '#141018' });
  fig.head.visible = false;
  const head = pumpkinModel(0.26, 1.4);
  head.position.y = 0.2;
  head.rotation.y = Math.PI; // Gesicht nach vorn (Figur blickt nach −Z)
  fig.neck.add(head);
  fig.root.scale.set(1, 1.32, 1);
  for (const a of fig.arms) a.scale.y = 1.35;
  const light = new THREE.PointLight('#ff7a1a', 4, 6, 2);
  light.position.set(0, 2.6, -0.6);
  fig.root.add(light);
  return { root: fig.root, fig, head, light };
}

export class HauntView {
  readonly r = makeRenderer();
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(62, W / H, 0.1, 400);
  private world = new THREE.Group();
  private builtFor = -1;
  private builtLevel = -1;
  private doors: THREE.Group[] = [];
  private treeObjs: { o: THREE.Object3D; x: number; z: number; r: number }[] = [];
  private kid: Figure;
  private lamp: THREE.SpotLight;
  private man: ReturnType<typeof pumpkinMan>;
  private crow: THREE.Group;
  private bats: THREE.Group[] = [];
  private mist: THREE.Sprite[] = [];
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();

  constructor() {
    const s = this.scene;
    s.fog = new THREE.FogExp2('#121831', 0.036);
    this.r.toneMappingExposure = 1.25;
    s.environment = studioEnvironment(this.r);
    s.environmentIntensity = 0.15;
    s.add(skyDome('#05060f', '#1d1838', '#121831', 200));
    // Sterne und Mond
    const stars = new THREE.BufferGeometry();
    const sr = rand(5);
    const pts: number[] = [];
    for (let i = 0; i < 500; i++) {
      const a = sr() * Math.PI * 2, e = 0.15 + sr() * 1.3;
      pts.push(Math.cos(a) * Math.cos(e) * 180, Math.sin(e) * 180, Math.sin(a) * Math.cos(e) * 180);
    }
    stars.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    s.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: '#ffffff', size: 0.9, fog: false, sizeAttenuation: false })));
    const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff3c9', fog: false }));
    moon.position.set(-80, 90, -120);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: '#ffe9a8', transparent: true, opacity: 0.35, fog: false, depthWrite: false }));
    halo.scale.set(70, 70, 1);
    halo.position.copy(moon.position);
    s.add(moon, halo);
    s.add(new THREE.HemisphereLight('#5b5aa8', '#141420', 1.1));
    const moonLight = new THREE.DirectionalLight('#a9b6ff', 1.4);
    moonLight.position.set(-20, 30, -25);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(1024, 1024);
    const mc = moonLight.shadow.camera;
    mc.left = -32; mc.right = 32; mc.top = 32; mc.bottom = -32; mc.near = 1; mc.far = 90;
    s.add(moonLight);
    // Boden
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(FIELD * 2 + 30, FIELD * 2 + 30), new THREE.MeshStandardMaterial({ map: grassTex('#1a2418'), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    // Zaun rundherum
    const fence = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: woodTex('#3d2c20'), roughness: 1 });
    const post = new THREE.BoxGeometry(0.16, 1.4, 0.16);
    const rail = new THREE.BoxGeometry(2.6, 0.1, 0.06);
    for (let i = -FIELD; i < FIELD; i += 2.5) {
      for (const [x, z, ry] of [[i, -FIELD, 0], [i, FIELD, 0], [-FIELD, i, Math.PI / 2], [FIELD, i, Math.PI / 2]] as const) {
        const p = new THREE.Mesh(post, wood); p.position.set(x, 0.7, z); p.rotation.y = ry; p.rotation.z = Math.sin(i * 3.1 + x) * 0.08; fence.add(p);
        for (const y of [0.5, 1.0]) { const r = new THREE.Mesh(rail, wood); r.position.set(ry ? x : x + 1.25, y, ry ? z + 1.25 : z); r.rotation.y = ry; fence.add(r); }
      }
    }
    s.add(fence);
    s.add(this.world);

    // Spielfigur mit Taschenlampe
    this.kid = buildFigure({ skin: '#e6b998', top: '#5b3e8f', pants: '#2f4a7a', shoes: '#e8e8e8', hat: 'hood', hair: '#2a1d14', lamp: true });
    this.kid.root.traverse((o) => { o.castShadow = true; });
    s.add(this.kid.root);
    this.lamp = new THREE.SpotLight('#fff1c9', 60, 20, 0.45, 0.55, 1.4);
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(512, 512);
    this.lamp.shadow.bias = -0.002;
    s.add(this.lamp, this.lamp.target);

    this.man = pumpkinMan();
    this.man.root.traverse((o) => { o.castShadow = true; });
    s.add(this.man.root);

    this.crow = ravenModel();
    this.crow.scale.setScalar(1.6);
    s.add(this.crow);

    // Fledermäuse
    const batTex = canvasTexture('bat', 64, (c, sz) => {
      c.clearRect(0, 0, sz, sz); c.fillStyle = '#05050a';
      c.beginPath(); c.moveTo(32, 26); c.quadraticCurveTo(38, 18, 42, 28); c.quadraticCurveTo(50, 14, 62, 16); c.quadraticCurveTo(56, 24, 60, 34); c.quadraticCurveTo(52, 30, 50, 38);
      c.quadraticCurveTo(44, 34, 40, 40); c.quadraticCurveTo(36, 46, 32, 50); c.quadraticCurveTo(28, 46, 24, 40); c.quadraticCurveTo(20, 34, 14, 38); c.quadraticCurveTo(12, 30, 4, 34);
      c.quadraticCurveTo(8, 24, 2, 16); c.quadraticCurveTo(14, 14, 22, 28); c.quadraticCurveTo(26, 18, 32, 26); c.fill();
    });
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Group();
      const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: batTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      sp.rotation.x = -Math.PI / 2;
      b.add(sp);
      this.bats.push(b);
      s.add(b);
    }
    // Nebelschwaden am Boden
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: '#9aa3c8', transparent: true, opacity: 0.12, depthWrite: false }));
      m.scale.set(9, 3, 1);
      this.mist.push(m);
      s.add(m);
    }
  }

  /** Welt zum aktuellen Versuch und zur Stufe aufbauen */
  private build(g: Haunt): void {
    this.world.clear();
    this.doors = [];
    this.treeObjs = [];
    for (const h of g.houses) {
      const { group, door } = houseModel(h);
      this.doors.push(door);
      this.world.add(group);
    }
    const rnd = rand(g.seed + g.level * 97);
    for (const t of g.trees) {
      const m = t.kind === 'tot' ? deadTree(rnd, t.s) : pine(t.s);
      m.position.set(t.x, 0, t.z);
      m.rotation.y = rnd() * Math.PI * 2;
      m.traverse((o) => { o.castShadow = true; });
      this.world.add(m);
      this.treeObjs.push({ o: m, x: t.x, z: t.z, r: (t.kind === 'tanne' ? 1.6 : 1.1) * t.s });
    }
    for (const gr of g.graves) {
      const m = graveModel();
      m.position.set(gr.x, 0, gr.z);
      m.rotation.y = gr.r;
      m.traverse((o) => { o.castShadow = true; });
      this.world.add(m);
    }
    // Kleine Kürbisse und Steine am Wegrand als Deko
    for (let i = 0; i < 10; i++) {
      const x = (rnd() * 2 - 1) * (FIELD - 3), z = (rnd() * 2 - 1) * (FIELD - 3);
      if (g.houses.some((h) => Math.hypot(h.x - x, h.z - z) < 6)) continue;
      const p = pumpkinModel(0.22 + rnd() * 0.12, 0.6);
      p.position.set(x, 0.18, z);
      p.rotation.y = rnd() * Math.PI * 2;
      this.world.add(p);
    }
    this.mist.forEach((m) => { m.position.set((rnd() * 2 - 1) * FIELD, 0.8, (rnd() * 2 - 1) * FIELD); });
    this.builtFor = g.seed;
    this.builtLevel = g.level;
  }

  render(ctx: CanvasRenderingContext2D, g: Haunt): void {
    const k = ctx.getTransform().a || 1;
    fit(this.r, this.cam, W, H, k);
    if (this.builtFor !== g.seed || this.builtLevel !== g.level) this.build(g);
    const t = g.time;
    const p = g.p;

    // Figur: läuft, schaut sich um (Kopf und Oberkörper drehen mit)
    const f = this.kid;
    const moving = Math.abs(p.speed) > 0.2;
    pose(f, moving ? 'walk' : 'idle', moving ? p.walk : t * 2, Math.min(1, Math.abs(p.speed) / 3));
    f.root.position.set(p.x, 0, p.z);
    f.root.rotation.y = p.yaw + Math.PI;
    f.neck.rotation.y = -p.look * 0.7;
    f.spine.rotation.y += -p.look * 0.25;
    // Lampenarm nach vorn
    f.arms[1].rotation.x = 1.25;
    f.arms[1].rotation.y = -p.look * 0.4;
    f.elbows[1].rotation.x = 0.15;

    // Taschenlampe: Kegel in Blickrichtung, leicht nach unten
    const vy = viewYaw(g);
    const hand = new THREE.Vector3(p.x + Math.cos(p.yaw) * -0.25, 1.15, p.z - Math.sin(p.yaw) * -0.25);
    this.lamp.position.copy(hand);
    this.lamp.target.position.set(p.x + Math.sin(vy) * 8, 0.2, p.z + Math.cos(vy) * 8);
    this.lamp.angle = lampCone(g) + 0.06;
    this.lamp.distance = lampRange(g) + 6;
    this.lamp.intensity = 55 + Math.sin(t * 23) * 2;

    // Kamera über der Schulter: beim Umsehen tritt die Figur zur Seite und gibt die Sicht frei
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const rx = -fz, rz = fx;
    const side = p.look * 1.1;
    const want = new THREE.Vector3(p.x - fx * 4.8 + rx * side, 2.7, p.z - fz * 4.8 + rz * side);
    // Steht eine Hauswand zwischen Figur und Kamera, rückt die Kamera näher und tiefer
    const hit = this.wallHit(g, p.x, p.z, want.x, want.z);
    if (hit < 1) { want.x = p.x + (want.x - p.x) * hit; want.z = p.z + (want.z - p.z) * hit; want.y = 1.75 + 0.95 * hit; }
    const look = new THREE.Vector3(p.x + Math.sin(vy) * 9, 1.3, p.z + Math.cos(vy) * 9);
    if (this.camPos.lengthSq() === 0) { this.camPos.copy(want); this.camLook.copy(look); }
    this.camPos.lerp(want, 0.18);
    this.camLook.lerp(look, 0.22);
    this.cam.position.copy(this.camPos);
    // Schreck: Kamera wackelt
    if (g.scare > 0) this.cam.position.add(new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, 0));
    this.cam.lookAt(this.camLook);
    // Bäume zwischen Kamera und Figur ausblenden
    for (const t of this.treeObjs) t.o.visible = segDist(t.x, t.z, this.camPos.x, this.camPos.z, p.x, p.z) > t.r;

    // Kürbismann
    const m = g.monster;
    const man = this.man;
    // Nicht unsichtbar schalten, sondern wegstellen: ein ab- und zugeschaltetes Licht zwingt alle Shader neu
    if (!m.active && g.scare <= 0) {
      man.root.position.set(0, -40, 0);
      man.light.intensity = 0;
    } else {
      let mx = m.x, mz = m.z, scale = 1;
      if (g.scare > 0) {
        // springt auf die Kamera zu
        const q = Math.min(1, (1.6 - g.scare) / 0.5);
        mx = m.x + (this.camPos.x - m.x) * q * 0.7;
        mz = m.z + (this.camPos.z - m.z) * q * 0.7;
        scale = 1 + q * 0.4;
      }
      man.root.position.set(mx, 0, mz);
      man.root.scale.set(scale, 1.32 * scale, scale);
      man.root.rotation.y = Math.atan2(p.x - mx, p.z - mz) + Math.PI;
      const lit = inLight(g);
      pose(man.fig, lit ? 'idle' : 'walk', t * 3.2, 0.7);
      for (const a of man.fig.arms) a.rotation.x += lit ? -0.6 : 0.5;
      man.head.rotation.z = Math.sin(t * 2) * 0.15 + (lit ? Math.sin(t * 40) * 0.08 : 0);
      man.light.intensity = g.scare > 0 ? 14 : lit ? 1 + Math.random() * 2 : 4;
      man.light.color.set(g.scare > 0 ? '#ff2a1a' : '#ff7a1a');
    }

    // Krähe kreist über dem richtigen Haus (Upgrade)
    const goal = g.houses[goalIndex(g)];
    this.crow.visible = g.progress.up.crow > 0 && !!goal && Math.hypot(p.x - goal.x, p.z - goal.z) < 22;
    if (goal && this.crow.visible) {
      this.crow.position.set(goal.x + Math.cos(t * 0.9) * 3.5, 8.5 + Math.sin(t * 1.7) * 0.3, goal.z + Math.sin(t * 0.9) * 3.5);
      this.crow.rotation.y = -t * 0.9;
    }
    // Fledermäuse kreisen
    this.bats.forEach((b, i) => {
      const a = t * (0.5 + i * 0.07) + i * 1.3;
      b.position.set(p.x + Math.cos(a) * (9 + i * 2), 5 + i * 0.8 + Math.sin(t * 2 + i) * 0.6, p.z + Math.sin(a) * (9 + i * 2));
      b.rotation.y = -a;
      b.scale.set(1, 1, 0.6 + Math.abs(Math.sin(t * 14 + i)) * 0.4);
    });
    this.mist.forEach((s, i) => { s.position.x += Math.sin(t * 0.1 + i) * 0.004; (s.material as THREE.SpriteMaterial).opacity = 0.1 + Math.sin(t * 0.3 + i) * 0.03; });
    // Türen: davor stehen öffnet sie langsam; falsch probierte glühen rot
    g.houses.forEach((h, i) => {
      const d = this.doors[i];
      if (!d) return;
      const open = g.door?.house === i ? Math.min(1, g.door.t) : h.tried && g.scare > 0 ? 1 : 0;
      d.rotation.y = open * 1.3;
      ((d.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).emissive.set(h.tried ? '#5a0000' : '#000000');
    });

    present(ctx, this.r, this.scene, this.cam, W, H);
  }

  /** Anteil 0..1 der Strecke Figur → Kamera, bis eine Hauswand im Weg steht */
  private wallHit(g: Haunt, ax: number, az: number, bx: number, bz: number): number {
    for (let i = 1; i <= 16; i++) {
      const t = i / 16;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const h of g.houses) {
        const dx = x - h.x, dz = z - h.z, c = Math.cos(h.face), sn = Math.sin(h.face);
        if (Math.abs(dx * c - dz * sn) < 3 && Math.abs(dx * sn + dz * c) < 3) return Math.max(0.2, t - 0.1);
      }
    }
    return 1;
  }
}

/** Abstand des Punkts (px, pz) zur Strecke a → b */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax, vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}
