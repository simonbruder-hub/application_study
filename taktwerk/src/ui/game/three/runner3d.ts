/**
 * 3D-Ansicht des Baustellen-Runs. Der Läufer steht im Ursprung und schaut nach −Z; die Welt wird jedes Bild
 * relativ zu ihm aufgebaut (Laufband): Betonplatten, Warnkanten, Spurlinien und Bauzaun als Instanzen,
 * Hindernisse aus einem Vorrat, Kreuzung am Abschnittsende, Walze dahinter, Kräne und Stadt am Horizont.
 */
import { CAM_BACK, FAR, FENCE, HALF, LANE_W, type Ob, type Run } from '../runner';
import { buildFigure, type Figure, pose, setXray } from './figure';
import {
  barrierTex, present, concreteTex, dirtTex, fit, makeRenderer, mat, mesh, meshTex, rand, signTex, skyDome, stripeTex, studioEnvironment, THREE,
} from './kit';

const W = 360;
const H = 560;
const SLAB = 2;

function lattice(h: number, w: number, m: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const leg = new THREE.BoxGeometry(0.08, h, 0.08);
  for (const [x, z] of [[-w / 2, -w / 2], [w / 2, -w / 2], [-w / 2, w / 2], [w / 2, w / 2]] as const) { const l = new THREE.Mesh(leg, m); l.position.set(x, h / 2, z); g.add(l); }
  // Zickzack-Streben auf allen vier Seiten
  const n = Math.floor(h / w);
  const diag = new THREE.BoxGeometry(0.05, Math.hypot(w, w), 0.05);
  for (let i = 0; i < n; i++) {
    for (const [x, z, ry] of [[0, w / 2, 0], [0, -w / 2, 0], [w / 2, 0, Math.PI / 2], [-w / 2, 0, Math.PI / 2]] as const) {
      const d = new THREE.Mesh(diag, m);
      d.position.set(x, i * w + w / 2, z);
      d.rotation.set(0, ry, (i % 2 ? 1 : -1) * (Math.PI / 4));
      g.add(d);
    }
  }
  return g;
}

function towerCrane(seed: number): THREE.Group {
  const rnd = rand(seed);
  const yellow = mat('#f2a900', { roughness: 0.5, metalness: 0.3 });
  const g = new THREE.Group();
  const h = 22 + rnd() * 10;
  g.add(lattice(h, 1.4, yellow));
  const jib = new THREE.Mesh(new THREE.BoxGeometry(26, 0.9, 0.9), yellow);
  jib.position.set(8, h + 0.5, 0);
  g.add(jib);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 1.4), mat('#8a8f98', { roughness: 0.8 }));
  counter.position.set(-5, h, 0);
  g.add(counter);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.4), yellow);
  cab.position.set(1, h - 0.6, 0);
  g.add(cab);
  const apex = new THREE.Mesh(new THREE.ConeGeometry(0.6, 4, 4), yellow);
  apex.position.y = h + 2.5;
  g.add(apex);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 10, 4), mat('#333'));
  cable.position.set(14, h - 4.5, 0);
  g.add(cable);
  const load = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 0.4), mat('#c0392b', { roughness: 0.5, metalness: 0.4 }));
  load.position.set(14, h - 9.6, 0);
  g.add(load);
  g.rotation.y = rnd() * Math.PI * 2;
  return g;
}

/** Vorrat an Modellen je Hindernisart */
class Pool {
  private free: THREE.Object3D[] = [];
  constructor(private make: () => THREE.Object3D, private parent: THREE.Object3D) {}
  take(): THREE.Object3D {
    const o = this.free.pop() ?? this.make();
    if (!o.parent) this.parent.add(o);
    o.visible = true;
    return o;
  }
  give(o: THREE.Object3D): void { o.visible = false; this.free.push(o); }
}

export class RunnerView {
  readonly r = makeRenderer();
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(60, W / H, 0.1, 600);
  private rig = new THREE.Group();
  private sun: THREE.DirectionalLight;
  private slabs: THREE.InstancedMesh;
  private curbs: THREE.InstancedMesh;
  private dashes: THREE.InstancedMesh;
  private panels: THREE.InstancedMesh;
  private posts: THREE.InstancedMesh;
  private banners: THREE.InstancedMesh;
  private props: THREE.InstancedMesh;
  private cranes: THREE.Group[] = [];
  private dirt: THREE.Texture;
  private junction = new THREE.Group();
  private crossFloor: THREE.Mesh;
  /** Zaun an der Querstrasse: [Seite, nah/fern] */
  private crossFences: { side: number; mesh: THREE.Mesh }[] = [];
  private sideClose: THREE.Mesh;
  private endWall: THREE.Group;
  private sign: THREE.Mesh;
  private signMats: Record<string, THREE.Material>;
  private arrival = new THREE.Group();
  private fig: Figure;
  private roller: THREE.Group;
  private drum: THREE.Mesh;
  private pools: Record<string, Pool>;
  private live = new Map<Ob, THREE.Object3D>();
  private tmp = new THREE.Object3D();
  private color = new THREE.Color();

  constructor() {
    const s = this.scene;
    s.fog = new THREE.Fog('#f0d6b4', 28, 92);
    s.environment = studioEnvironment(this.r);
    s.environmentIntensity = 0.35;
    s.add(skyDome('#3d74b0', '#ffd9ae', '#c9a77a', 420));
    s.add(new THREE.HemisphereLight('#cfe3ff', '#8a6a46', 0.9));
    this.sun = new THREE.DirectionalLight('#fff0d4', 2.6);
    this.sun.position.set(6, 14, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -9; sc.right = 9; sc.top = 14; sc.bottom = -16; sc.near = 1; sc.far = 50;
    this.sun.shadow.bias = -0.0006;
    this.sun.target.position.set(0, 0, -6);
    s.add(this.sun, this.sun.target);

    // Erde rundherum (Textur wandert mit)
    this.dirt = dirtTex().clone();
    this.dirt.needsUpdate = true;
    this.dirt.repeat.set(70, 70);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: this.dirt, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    ground.receiveShadow = true;
    s.add(ground);

    // Betonplatten, Warnkanten, Spurlinien
    const conc = new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.85 });
    this.slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(HALF * 2, 0.08, SLAB - 0.04), conc, 48);
    this.slabs.receiveShadow = true;
    this.curbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.14, 0.78), mat('#ffffff', { roughness: 0.6 }), 2 * 120);
    this.curbs.receiveShadow = true; this.curbs.castShadow = true;
    this.dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.012, 0.75), new THREE.MeshStandardMaterial({ color: '#ffd60a', emissive: '#7a5a00', roughness: 0.5 }), 2 * 60);
    s.add(this.slabs, this.curbs, this.dashes);

    // Bauzaun: Gitterfelder, Pfosten mit Betonfuss, blaue Banner
    const fence = new THREE.MeshStandardMaterial({ map: meshTex(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6 });
    this.panels = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.45, 2), fence, 2 * 34);
    this.panels.castShadow = true;
    this.posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 2.1, 0.07), mat('#8b939c', { roughness: 0.4, metalness: 0.7 }), 2 * 34);
    this.posts.castShadow = true;
    const bannerTex = signTex('banner', (c, w, h) => {
      c.fillStyle = '#1d5fbf'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffffff'; c.font = '900 52px "Barlow Condensed", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('BAUSTELLE', w / 2, h / 2 + 2);
      c.fillStyle = '#ffb000'; c.fillRect(0, 0, w, 8); c.fillRect(0, h - 8, w, 8);
    }, 512, 128);
    this.banners = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.3, 0.55), new THREE.MeshStandardMaterial({ map: bannerTex, side: THREE.DoubleSide, roughness: 0.7 }), 2 * 12);
    s.add(this.panels, this.posts, this.banners);

    // Container und Paletten hinter dem Zaun
    this.props = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat('#ffffff', { roughness: 0.7, metalness: 0.2 }), 40);
    this.props.castShadow = true; this.props.receiveShadow = true;
    s.add(this.props);
    for (let i = 0; i < 4; i++) { const c = towerCrane(100 + i); this.cranes.push(c); s.add(c); }

    // Skyline am Horizont (bleibt stehen)
    const sky = new THREE.Group();
    const rnd = rand(77);
    const bm = new THREE.MeshStandardMaterial({ color: '#4d5a72', roughness: 0.9, fog: false, emissive: '#1d2433' });
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2 + rnd() * 0.05;
      const h = 12 + rnd() * 40, w = 8 + rnd() * 14;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), bm);
      b.position.set(Math.sin(a) * 230, h / 2 - 2, -Math.cos(a) * 230);
      b.rotation.y = -a;
      sky.add(b);
    }
    s.add(sky);

    // Kreuzung am Abschnittsende
    this.crossFloor = mesh(new THREE.BoxGeometry(84, 0.08, HALF * 2), conc, false, true);
    this.junction.add(this.crossFloor);
    const sideFence = new THREE.MeshStandardMaterial({ map: (() => { const t = meshTex().clone(); t.repeat.set(16, 1); t.needsUpdate = true; return t; })(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6 });
    for (const side of [-1, 1]) {
      for (const z of [-1, 1]) {
        const f = mesh(new THREE.PlaneGeometry(40, 2), sideFence);
        f.position.set(side * (FENCE + 20), 1, z * (HALF + 0.65));
        this.crossFences.push({ side, mesh: f });
        this.junction.add(f);
      }
    }
    // Seite ohne Abzweigung schliessen
    this.sideClose = mesh(new THREE.PlaneGeometry(HALF * 2 + 1.4, 2), sideFence);
    this.sideClose.rotation.y = Math.PI / 2;
    this.sideClose.position.y = 1;
    this.junction.add(this.sideClose);
    this.endWall = new THREE.Group();
    const wall = mesh(new THREE.PlaneGeometry(8, 2.2), new THREE.MeshStandardMaterial({ map: (() => { const t = meshTex().clone(); t.repeat.set(3, 1); t.needsUpdate = true; return t; })(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6 }));
    wall.position.y = 1.1;
    this.endWall.add(wall);
    const arrow = (dirs: number[]) => signTex(`arrow-${dirs.join('')}`, (c, w, h) => {
      c.fillStyle = '#ffb000'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#1b1c1e'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10);
      c.fillStyle = '#1b1c1e';
      for (const d of dirs) {
        const cx = dirs.length > 1 ? w / 2 + d * w * 0.22 : w / 2;
        c.beginPath(); c.moveTo(cx - d * 60, h / 2 - 14); c.lineTo(cx + d * 10, h / 2 - 14); c.lineTo(cx + d * 10, h / 2 - 34); c.lineTo(cx + d * 56, h / 2);
        c.lineTo(cx + d * 10, h / 2 + 34); c.lineTo(cx + d * 10, h / 2 + 14); c.lineTo(cx - d * 60, h / 2 + 14); c.closePath(); c.fill();
      }
    });
    this.signMats = {
      '-1': new THREE.MeshStandardMaterial({ map: arrow([-1]), roughness: 0.5 }),
      '1': new THREE.MeshStandardMaterial({ map: arrow([1]), roughness: 0.5 }),
      '0': new THREE.MeshStandardMaterial({ map: arrow([-1, 1]), roughness: 0.5 }),
    };
    this.sign = mesh(new THREE.BoxGeometry(2, 1, 0.08), this.signMats['1']!);
    this.sign.position.set(0, 1.5, 0.05);
    this.endWall.add(this.sign);
    for (const x of [-0.7, 0.7]) { const p = mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), mat('#6b7280', { metalness: 0.6, roughness: 0.4 })); p.position.set(x, 0.55, 0.1); this.endWall.add(p); }
    this.junction.add(this.endWall);
    s.add(this.junction);
    // Ankunftsarm hinter dem Läufer (sichtbar während des Schwenks in der Kurve)
    const arrFloor = mesh(new THREE.BoxGeometry(40, 0.08, HALF * 2), conc, false, true);
    arrFloor.position.x = 20 + HALF;
    this.arrival.add(arrFloor);
    for (const z of [-1, 1]) { const f = mesh(new THREE.PlaneGeometry(40, 2), sideFence); f.position.set(20 + HALF, 1, z * (HALF + 0.65)); this.arrival.add(f); }
    s.add(this.arrival);

    // Elektriker
    this.fig = buildFigure({ skin: '#e0ae86', top: '#ff6b00', pants: '#2f3a56', shoes: '#3a2a1a', vest: true, hat: 'helmet' });
    s.add(this.fig.root);

    // Walze
    this.roller = new THREE.Group();
    const yellow = mat('#ffb000', { roughness: 0.45, metalness: 0.2 });
    const body = mesh(new THREE.BoxGeometry(2.6, 1.1, 2.4), yellow);
    body.position.set(0, 1.1, 0.8);
    const cabin = mesh(new THREE.BoxGeometry(1.6, 1.2, 1.4), new THREE.MeshPhysicalMaterial({ color: '#9fd3ff', roughness: 0.05, transmission: 0.2, metalness: 0.1 }));
    cabin.position.set(0, 2.25, 1.1);
    const roof = mesh(new THREE.BoxGeometry(1.8, 0.1, 1.6), yellow);
    roof.position.set(0, 2.9, 1.1);
    this.drum = mesh(new THREE.CylinderGeometry(0.75, 0.75, 2.8, 28), new THREE.MeshStandardMaterial({ color: '#c9ced4', roughness: 0.25, metalness: 0.9 }));
    this.drum.rotation.z = Math.PI / 2;
    this.drum.position.set(0, 0.75, -0.6);
    const frame = mesh(new THREE.BoxGeometry(3, 0.25, 0.4), yellow);
    frame.position.set(0, 1.5, -0.6);
    this.roller.add(body, cabin, roof, this.drum, frame);
    for (const x of [-0.7, 0.7]) {
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff2a2a', emissiveIntensity: 3 }));
      beacon.position.set(x, 3.05, 1.1);
      this.roller.add(beacon);
    }
    s.add(this.roller);

    this.pools = {
      barrier: new Pool(() => this.makeBarrier(), s),
      beam: new Pool(() => this.makeBeam(), s),
      trench: new Pool(() => this.makeTrench(), s),
      block: new Pool(() => this.makeBlock(), s),
      cable: new Pool(() => this.makeCable(), s),
      bolt: new Pool(() => this.makeBolt(), s),
      helmet: new Pool(() => this.makePower('helmet'), s),
      coffee: new Pool(() => this.makePower('coffee'), s),
      magnet: new Pool(() => this.makePower('magnet'), s),
    };

    this.rig.add(this.cam);
    s.add(this.rig);
  }

  /* ---------- Modelle ---------- */

  private makeBarrier(): THREE.Object3D {
    const g = new THREE.Group();
    const panel = mesh(new THREE.BoxGeometry(0.92, 0.3, 0.035), new THREE.MeshStandardMaterial({ map: barrierTex(), roughness: 0.5 }));
    panel.position.y = 0.66;
    const bar = mesh(new THREE.BoxGeometry(0.92, 0.06, 0.03), mat('#e5e7eb', { roughness: 0.4, metalness: 0.5 }));
    bar.position.y = 0.36;
    g.add(panel, bar);
    for (const x of [-0.42, 0.42]) {
      const post = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 8), mat('#c0c4c8', { roughness: 0.35, metalness: 0.8 }));
      post.position.set(x, 0.43, 0);
      const foot = mesh(new THREE.BoxGeometry(0.16, 0.08, 0.5), mat('#3a3c40', { roughness: 0.8 }));
      foot.position.set(x, 0.04, 0);
      g.add(post, foot);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshStandardMaterial({ color: '#ffd60a', emissive: '#ffb000', emissiveIntensity: 2 }));
    lamp.position.set(0.38, 0.88, 0);
    lamp.name = 'lamp';
    g.add(lamp);
    return g;
  }

  private makeBeam(): THREE.Object3D {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: '#b33a2b', roughness: 0.45, metalness: 0.55 });
    const len = HALF * 2 + 1.2;
    const top = mesh(new THREE.BoxGeometry(len, 0.05, 0.32), steel); top.position.y = 0.42;
    const bot = mesh(new THREE.BoxGeometry(len, 0.05, 0.32), steel); bot.position.y = 0;
    const web = mesh(new THREE.BoxGeometry(len, 0.42, 0.05), steel); web.position.y = 0.21;
    g.add(top, bot, web);
    for (const x of [-1.2, 1.2]) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 9, 5), mat('#2b2d31', { roughness: 0.6 }));
      rope.position.set(x * 0.5, 4.9, 0);
      rope.rotation.z = -x * 0.08;
      g.add(rope);
    }
    return g;
  }

  private makeTrench(): THREE.Object3D {
    const g = new THREE.Group();
    const pit = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 1.4, 2.2), new THREE.MeshStandardMaterial({ color: '#3b2a1a', roughness: 1, side: THREE.BackSide }));
    pit.position.y = -0.69;
    pit.receiveShadow = true;
    g.add(pit);
    const tapeMat = new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.6 });
    for (const z of [-1.15, 1.15]) {
      const tape = mesh(new THREE.BoxGeometry(HALF * 2 + 0.3, 0.06, 0.06), tapeMat);
      tape.position.set(0, 0.55, z);
      g.add(tape);
      for (const x of [-HALF - 0.1, HALF + 0.1]) {
        const cone = mesh(new THREE.ConeGeometry(0.13, 0.55, 14), mat('#ff6b00', { roughness: 0.5 }));
        cone.position.set(x, 0.28, z);
        g.add(cone);
      }
    }
    return g;
  }

  private makeBlock(): THREE.Object3D {
    const shape = new THREE.Shape();
    shape.moveTo(-0.3, 0); shape.lineTo(0.3, 0); shape.lineTo(0.27, 0.12); shape.lineTo(0.12, 0.3); shape.lineTo(0.09, 0.85); shape.lineTo(-0.09, 0.85); shape.lineTo(-0.12, 0.3); shape.lineTo(-0.27, 0.12); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });
    geo.translate(0, 0, -0.45);
    const g = new THREE.Group();
    const b = mesh(geo, new THREE.MeshStandardMaterial({ map: concreteTex(), color: '#e5e0d4', roughness: 0.9 }), true, true);
    b.rotation.y = Math.PI / 2;
    g.add(b);
    const band = mesh(new THREE.BoxGeometry(0.9, 0.08, 0.2), new THREE.MeshStandardMaterial({ map: barrierTex(), roughness: 0.4 }));
    band.position.set(0, 0.6, 0);
    g.add(band);
    return g;
  }

  private makeCable(): THREE.Object3D {
    const g = new THREE.Group();
    const pts = Array.from({ length: 9 }, (_, i) => new THREE.Vector3(-0.55 + i * 0.1375, 0.05, Math.sin(i * 1.3) * 0.12));
    const tube = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.035, 10), new THREE.MeshStandardMaterial({ color: '#ff6b00', roughness: 0.45 }));
    g.add(tube);
    const sparks = new THREE.Group();
    sparks.name = 'sparks';
    const sm = new THREE.MeshBasicMaterial({ color: '#fff2a8', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 8; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.16, 0.015), sm); sparks.add(sp); }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    sparks.add(glow);
    g.add(sparks);
    return g;
  }

  private makeBolt(): THREE.Object3D {
    const s = new THREE.Shape();
    s.moveTo(0.05, 0.25); s.lineTo(-0.12, -0.02); s.lineTo(0, -0.02); s.lineTo(-0.06, -0.25); s.lineTo(0.13, 0.04); s.lineTo(0.01, 0.04); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
    geo.center();
    const m = mesh(geo, new THREE.MeshStandardMaterial({ color: '#ffcc33', emissive: '#7a5200', emissiveIntensity: 0.6, metalness: 1, roughness: 0.22 }));
    const g = new THREE.Group();
    g.add(m);
    return g;
  }

  private makePower(kind: 'helmet' | 'coffee' | 'magnet'): THREE.Object3D {
    const g = new THREE.Group();
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), new THREE.MeshBasicMaterial({ color: '#fff7c2', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(halo);
    if (kind === 'helmet') {
      const shell = mesh(new THREE.SphereGeometry(0.17, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#ffd60a', roughness: 0.25, clearcoat: 1 }));
      const brim = mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.02, 20), new THREE.MeshPhysicalMaterial({ color: '#ffd60a', roughness: 0.3, clearcoat: 1 }));
      g.add(shell, brim);
    } else if (kind === 'coffee') {
      const cup = mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.22, 20), mat('#ffffff', { roughness: 0.3 }));
      const lid = mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.03, 20), mat('#3a2a1a', { roughness: 0.5 }));
      lid.position.y = 0.12;
      const handle = mesh(new THREE.TorusGeometry(0.06, 0.015, 8, 16), mat('#ffffff', { roughness: 0.3 }));
      handle.position.set(0.12, 0, 0);
      g.add(cup, lid, handle);
    } else {
      const m = mesh(new THREE.TorusGeometry(0.14, 0.05, 12, 24, Math.PI), new THREE.MeshStandardMaterial({ color: '#d62828', roughness: 0.35, metalness: 0.4 }));
      m.rotation.z = Math.PI;
      g.add(m);
      for (const x of [-0.14, 0.14]) { const tip = mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), mat('#e5e7eb', { metalness: 0.9, roughness: 0.2 })); tip.position.set(x, -0.03, 0); g.add(tip); }
    }
    return g;
  }

  /* ---------- Bild ---------- */

  render(ctx: CanvasRenderingContext2D, g: Run): void {
    const k = ctx.getTransform().a || 1;
    fit(this.r, this.cam, W, H, k);
    const toTurn = g.segLen - g.pz;
    const endD = Math.min(FAR, toTurn + HALF);
    const t = g.time;

    // Boden wandert: Erdtextur und Platten
    this.dirt.offset.y = (g.pz / 400) * 70;
    const base = Math.floor((g.pz - 8) / SLAB) * SLAB;
    // Hilfsobjekt zurücksetzen (Drehung und Grösse vom letzten Bild)
    this.tmp.rotation.set(0, 0, 0);
    this.tmp.scale.setScalar(1);
    let n = 0;
    const trench = g.obs.filter((o) => o.kind === 'trench' && !o.hit).map((o) => [o.z - o.len / 2, o.z + o.len / 2] as const);
    for (let i = 0; i < this.slabs.count; i++) {
      const zw = base + i * SLAB;
      const d = zw - g.pz + SLAB / 2;
      const hidden = d > endD + 0.1 || trench.some(([a, b]) => zw + SLAB > a && zw < b);
      this.tmp.position.set(0, -0.04, -d);
      this.tmp.scale.setScalar(hidden ? 0 : 1);
      this.tmp.updateMatrix();
      this.slabs.setMatrixAt(n, this.tmp.matrix);
      this.slabs.setColorAt(n, this.color.set(Math.floor(zw / SLAB) % 2 === 0 ? '#d7d7d2' : '#f2f2ec'));
      n++;
    }
    this.slabs.instanceMatrix.needsUpdate = true;
    if (this.slabs.instanceColor) this.slabs.instanceColor.needsUpdate = true;

    let ci = 0;
    const cbase = Math.floor((g.pz - 8) / 0.8) * 0.8;
    for (let i = 0; i < this.curbs.count / 2; i++) {
      const zw = cbase + i * 0.8;
      const d = zw - g.pz + 0.4;
      const hidden = d > endD;
      for (const side of [-1, 1]) {
        this.tmp.position.set(side * (HALF + 0.1), 0.0, -d);
        this.tmp.scale.setScalar(hidden ? 0 : 1);
        this.tmp.updateMatrix();
        this.curbs.setMatrixAt(ci, this.tmp.matrix);
        this.curbs.setColorAt(ci, this.color.set(Math.round(zw / 0.8) % 2 === 0 ? '#ffb000' : '#1b1c1e'));
        ci++;
      }
    }
    this.curbs.instanceMatrix.needsUpdate = true;
    if (this.curbs.instanceColor) this.curbs.instanceColor.needsUpdate = true;

    let di = 0;
    const dbase = Math.floor((g.pz - 6) / 1.5) * 1.5;
    for (let i = 0; i < this.dashes.count / 2; i++) {
      const zw = dbase + i * 1.5;
      const d = zw - g.pz;
      const hidden = d > endD - 1 || Math.round(zw / 1.5) % 2 !== 0;
      for (const lx of [-LANE_W / 2, LANE_W / 2]) {
        this.tmp.position.set(lx, 0.006, -d);
        this.tmp.scale.setScalar(hidden ? 0 : 1);
        this.tmp.updateMatrix();
        this.dashes.setMatrixAt(di++, this.tmp.matrix);
      }
    }
    this.dashes.instanceMatrix.needsUpdate = true;

    // Bauzaun bis zur Kreuzung
    let pi = 0, bi = 0, pr = 0;
    const fbase = Math.floor((g.pz - 6) / 2.5) * 2.5;
    for (let i = 0; i < this.panels.count / 2; i++) {
      const zw = fbase + i * 2.5;
      const d = zw - g.pz + 1.25;
      const hidden = d + 1.25 > toTurn - HALF - 0.1 || d > FAR;
      for (const side of [-1, 1]) {
        this.tmp.position.set(side * FENCE, 1.05, -d);
        this.tmp.rotation.set(0, Math.PI / 2, 0);
        this.tmp.scale.setScalar(hidden ? 0 : 1);
        this.tmp.updateMatrix();
        this.panels.setMatrixAt(pi, this.tmp.matrix);
        this.tmp.position.set(side * FENCE, 1.05, -d + 1.25);
        this.tmp.rotation.set(0, 0, 0);
        this.tmp.updateMatrix();
        this.posts.setMatrixAt(pi, this.tmp.matrix);
        pi++;
        if (Math.round(zw / 2.5) % 3 === 0 && bi < this.banners.count) {
          this.tmp.position.set(side * (FENCE - 0.03), 1.25, -d);
          this.tmp.rotation.set(0, Math.PI / 2, 0);
          this.tmp.updateMatrix();
          this.banners.setMatrixAt(bi++, this.tmp.matrix);
        }
        // Container und Palettenstapel hinter dem Zaun, fest an ihrer Stelle
        const r = rand(Math.round(zw / 2.5) * 7 + (side > 0 ? 3 : 0))();
        if (r < 0.22 && pr < this.props.count) {
          const big = r < 0.11;
          this.tmp.position.set(side * (FENCE + (big ? 2.4 : 1.3)), big ? 1.3 : 0.4, -d);
          this.tmp.rotation.set(0, big ? 0 : r * 20, 0);
          this.tmp.scale.set(big ? 2.4 : 1.1, big ? 2.6 : 0.8, big ? 6 : 1.1);
          if (hidden) this.tmp.scale.setScalar(0);
          this.tmp.updateMatrix();
          this.props.setMatrixAt(pr, this.tmp.matrix);
          this.props.setColorAt(pr, this.color.set(big ? ['#c0392b', '#1d5fbf', '#2f7d4a', '#e09e00'][Math.floor(r * 40) % 4]! : '#b08353'));
          pr++;
        }
      }
    }
    for (; pi < this.panels.count; pi++) { this.tmp.scale.setScalar(0); this.tmp.updateMatrix(); this.panels.setMatrixAt(pi, this.tmp.matrix); this.posts.setMatrixAt(pi, this.tmp.matrix); }
    for (; bi < this.banners.count; bi++) { this.tmp.scale.setScalar(0); this.tmp.updateMatrix(); this.banners.setMatrixAt(bi, this.tmp.matrix); }
    for (; pr < this.props.count; pr++) { this.tmp.scale.setScalar(0); this.tmp.updateMatrix(); this.props.setMatrixAt(pr, this.tmp.matrix); }
    this.tmp.scale.setScalar(1);
    this.panels.instanceMatrix.needsUpdate = this.posts.instanceMatrix.needsUpdate = this.banners.instanceMatrix.needsUpdate = this.props.instanceMatrix.needsUpdate = true;
    if (this.props.instanceColor) this.props.instanceColor.needsUpdate = true;

    // Kräne neben der Strecke, alle 55 m
    const kb = Math.floor(g.pz / 55) * 55;
    this.cranes.forEach((c, i) => {
      const zw = kb + i * 55 + 20;
      const side = i % 2 ? 1 : -1;
      c.position.set(side * (18 + (i % 3) * 6), 0, -(zw - g.pz));
      c.visible = zw - g.pz < 160;
    });

    // Kreuzung
    this.junction.visible = toTurn < FAR + 4;
    this.junction.position.z = -toTurn;
    this.crossFloor.position.x = g.turn === 0 ? 0 : g.turn * 42;
    for (const f of this.crossFences) f.mesh.visible = g.turn === 0 || g.turn === f.side;
    this.sideClose.visible = g.turn !== 0;
    this.sideClose.position.x = -g.turn * FENCE;
    this.endWall.position.set(0, 0, -(HALF + 0.5));
    this.sign.material = this.signMats[String(g.turn)]!;
    // Ankunftsarm hinter dem Läufer
    this.arrival.visible = g.turnDir !== 0 && g.pz < 30;
    this.arrival.position.z = g.pz;
    this.arrival.scale.x = g.turnDir >= 0 ? 1 : -1;

    // Hindernisse aus dem Vorrat
    const seen = new Set<Ob>();
    for (const o of g.obs) {
      const d = o.z - g.pz;
      if (d < -6 || d > FAR) continue;
      if (o.hit && (o.kind === 'bolt' || o.kind === 'helmet' || o.kind === 'coffee' || o.kind === 'magnet')) continue;
      if ((o.kind === 'beam' || o.kind === 'trench') && o.lane !== 0) continue;
      seen.add(o);
      let obj = this.live.get(o);
      if (!obj) { obj = this.pools[o.kind]!.take(); this.live.set(o, obj); }
      const x = o.kind === 'beam' || o.kind === 'trench' ? 0 : o.lane * LANE_W;
      obj.position.set(x, 0, -d);
      obj.rotation.set(0, 0, 0);
      switch (o.kind) {
        case 'beam': obj.position.y = o.y + Math.sin(t * 1.4 + o.z) * 0.03; obj.rotation.y = Math.sin(t * 0.9 + o.z) * 0.03; break;
        case 'bolt': obj.position.y = o.y + 0.45 + Math.sin(t * 4 + o.z) * 0.05; obj.rotation.y = t * 3 + o.z; break;
        case 'helmet': case 'coffee': case 'magnet': obj.position.y = o.y + 0.25 + Math.sin(t * 3) * 0.08; obj.rotation.y = t * 1.6; break;
        case 'barrier': {
          if (o.hit) { obj.rotation.x = -1.3; obj.position.z -= 0.4; }
          const lamp = obj.getObjectByName('lamp') as THREE.Mesh | undefined;
          if (lamp) (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * 9 + o.z) > 0 ? 2.5 : 0.2;
          break;
        }
        case 'cable': {
          const sp = obj.getObjectByName('sparks')!;
          sp.position.set(Math.sin(t * 5 + o.z) * 0.3, 0.08, 0);
          sp.children.forEach((c, i) => {
            if (i === sp.children.length - 1) { c.scale.setScalar(0.7 + Math.random() * 0.6); return; }
            const a = t * 25 + i * 1.7;
            c.position.set(Math.cos(a) * 0.1, 0.1 + Math.abs(Math.sin(a)) * 0.08, Math.sin(a * 1.3) * 0.1);
            c.rotation.set(Math.sin(a) * 1.2, 0, Math.cos(a) * 1.2);
          });
          break;
        }
        default: break;
      }
    }
    for (const [o, obj] of this.live) {
      if (!seen.has(o)) { this.pools[o.kind]!.give(obj); this.live.delete(o); }
    }

    // Läufer
    const f = this.fig;
    const onGround = g.y <= 0.01;
    if (g.slide > 0 && onGround) pose(f, 'slide', 0);
    else if (!onGround) pose(f, 'jump', 0);
    else pose(f, 'run', t * (g.speed + (g.coffee > 0 ? 6 : 0)) * 1.15);
    f.root.position.set(g.x, g.y, 0);
    f.root.rotation.z = (g.lane * LANE_W - g.x) * -0.25;
    const zapOn = g.zap > 0 && Math.floor(g.zap * 14) % 2 === 0;
    setXray(f, zapOn);
    f.hairSpikes.visible = g.zap > 0;
    f.hat.position.y = g.zap > 0 ? Math.sin(g.zap * Math.PI) * 0.35 : 0;
    f.hat.rotation.z = g.zap > 0 ? g.zap * 4 : 0;
    f.root.visible = !(g.inv > 0 && g.coffee <= 0 && Math.floor(g.inv * 10) % 2 === 0);

    // Walze kommt näher, wenn man gestolpert ist
    this.roller.position.set(g.x * 0.3, 0, 1.7 + (1 - g.chase) * 5);
    this.drum.rotation.x = -t * 4;
    this.roller.visible = g.chase > 0.2;

    // Kamera hinter dem Läufer; nach einer Kurve schwenkt sie aus der alten Richtung herein
    const e = g.turnAnim * g.turnAnim * (3 - 2 * g.turnAnim);
    this.rig.rotation.y = g.turnDir * (Math.PI / 2) * e;
    f.root.rotation.y = g.turnDir * (Math.PI / 2) * e * 0.8;
    this.cam.position.set(g.camX, 2.75, CAM_BACK + 1.25);
    this.cam.lookAt(g.camX * 0.7, 0.95, -6);
    present(ctx, this.r, this.scene, this.cam, W, H);
  }
}
