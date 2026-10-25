/**
 * Figur aus Gelenken für die 3D-Spiele: Hüfte, Beine mit Knie, Rumpf, Schultern mit Ellbogen, Hals, Kopf.
 * Blickrichtung −Z. Laufzyklus, Sprung, Rutschen, Umsehen und Stromschlag (Röntgenbild mit Skelett).
 */
import { mat, mesh, THREE, vestTex } from './kit';

export interface FigureStyle {
  skin: string;
  top: string;
  pants: string;
  shoes: string;
  /** Warnweste mit Reflexstreifen */
  vest?: boolean;
  hat: 'helmet' | 'hood';
  hair?: string;
  /** Taschenlampe in der rechten Hand */
  lamp?: boolean;
}

export interface Figure {
  root: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  hat: THREE.Group;
  legs: [THREE.Group, THREE.Group];
  knees: [THREE.Group, THREE.Group];
  arms: [THREE.Group, THREE.Group];
  elbows: [THREE.Group, THREE.Group];
  hairSpikes: THREE.Group;
  bones: THREE.Group;
  lampTip: THREE.Object3D | null;
  meshes: THREE.Mesh[];
  originals: THREE.Material[];
  xray: THREE.Material;
}

const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 12);

export function buildFigure(st: FigureStyle): Figure {
  const skin = mat(st.skin, { roughness: 0.55 });
  const top = st.vest ? new THREE.MeshStandardMaterial({ map: vestTex(), roughness: 0.75 }) : mat(st.top, { roughness: 0.85 });
  const sleeve = mat(st.vest ? '#ff6b00' : st.top, { roughness: 0.85 });
  const pants = mat(st.pants, { roughness: 0.9 });
  const shoes = mat(st.shoes, { roughness: 0.6 });
  const meshes: THREE.Mesh[] = [];
  const add = (parent: THREE.Object3D, m: THREE.Mesh) => { parent.add(m); meshes.push(m); return m; };

  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);
  add(hips, mesh(capsule(0.15, 0.12), pants)).scale.set(1.15, 1, 0.8);

  const legs: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.1, -0.04, 0);
    hips.add(leg);
    add(leg, mesh(capsule(0.075, 0.32), pants)).position.y = -0.22;
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    leg.add(knee);
    add(knee, mesh(capsule(0.066, 0.3), pants)).position.y = -0.2;
    const boot = add(knee, mesh(new THREE.BoxGeometry(0.13, 0.1, 0.27), shoes));
    boot.position.set(0, -0.43, -0.05);
    legs.push(leg);
    knees.push(knee);
  }

  const spine = new THREE.Group();
  spine.position.y = 0.06;
  hips.add(spine);
  const torso = add(spine, mesh(capsule(0.18, 0.3), top));
  torso.position.y = 0.28;
  torso.scale.set(1.25, 1, 0.78);
  if (st.vest) {
    const belt = add(spine, mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.07, 20), mat('#4a3020', { roughness: 0.6 })));
    belt.position.y = 0.05; belt.scale.z = 0.8;
    const pouch = add(spine, mesh(new THREE.BoxGeometry(0.1, 0.12, 0.07), mat('#6b4a2a', { roughness: 0.7 })));
    pouch.position.set(0.15, 0, 0.16);
    const tool = add(spine, mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), mat('#c0392b', { roughness: 0.4 })));
    tool.position.set(0.2, 0.06, 0.16);
  } else {
    // Kapuzenpulli: Bauchtasche
    const pocket = add(spine, mesh(new THREE.BoxGeometry(0.24, 0.1, 0.04), mat(st.top, { roughness: 0.9 })));
    pocket.position.set(0, 0.16, -0.15);
  }

  const neck = new THREE.Group();
  neck.position.y = 0.56;
  spine.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.14;
  neck.add(head);
  add(head, mesh(new THREE.SphereGeometry(0.125, 24, 18), skin)).scale.set(0.95, 1.08, 1);
  const nose = add(head, mesh(new THREE.SphereGeometry(0.022, 10, 8), skin));
  nose.position.set(0, -0.01, -0.125);
  for (const side of [-1, 1]) {
    const eye = add(head, mesh(new THREE.SphereGeometry(0.014, 8, 6), mat('#1b1c1e', { roughness: 0.2 }), false));
    eye.position.set(side * 0.045, 0.02, -0.112);
    const ear = add(head, mesh(new THREE.SphereGeometry(0.03, 8, 6), skin));
    ear.position.set(side * 0.12, 0, 0);
  }
  const hat = new THREE.Group();
  head.add(hat);
  if (st.hat === 'helmet') {
    const shell = add(hat, mesh(new THREE.SphereGeometry(0.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#f5f5f2', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 })));
    shell.position.y = 0.03;
    const brim = add(hat, mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.015, 24), new THREE.MeshPhysicalMaterial({ color: '#ececea', roughness: 0.3, clearcoat: 1 })));
    brim.position.set(0, 0.035, -0.02);
    brim.scale.z = 1.12;
    const ridge = add(hat, mesh(new THREE.BoxGeometry(0.03, 0.03, 0.28), mat('#e2e2de', { roughness: 0.35 })));
    ridge.position.y = 0.17;
  } else {
    const hair = add(hat, mesh(new THREE.SphereGeometry(0.135, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(st.hair ?? '#2a1d14', { roughness: 0.9 })));
    hair.position.y = 0.0;
    const hood = add(hat, mesh(new THREE.TorusGeometry(0.15, 0.05, 10, 20, Math.PI * 1.3), mat(st.top, { roughness: 0.9 })));
    hood.rotation.set(0, Math.PI / 2, Math.PI * 0.85);
    hood.position.set(0, -0.02, 0.05);
  }
  // Haare zu Berge beim Stromschlag
  const hairSpikes = new THREE.Group();
  const hairMat = mat('#4a3020', { roughness: 0.9 });
  for (let i = 0; i < 9; i++) {
    const s = add(hairSpikes, mesh(new THREE.ConeGeometry(0.02, 0.16, 6), hairMat, false));
    const a = (i / 9) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.07, 0.15, Math.sin(a) * 0.07);
    s.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
  }
  hairSpikes.visible = false;
  head.add(hairSpikes);

  const arms: THREE.Group[] = [];
  const elbows: THREE.Group[] = [];
  let lampTip: THREE.Object3D | null = null;
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.27, 0.5, 0);
    spine.add(arm);
    add(arm, mesh(capsule(0.058, 0.22), sleeve)).position.y = -0.15;
    const elbow = new THREE.Group();
    elbow.position.y = -0.31;
    arm.add(elbow);
    add(elbow, mesh(capsule(0.05, 0.2), st.vest ? skin : sleeve)).position.y = -0.13;
    add(elbow, mesh(new THREE.SphereGeometry(0.055, 12, 10), skin)).position.y = -0.28;
    if (st.lamp && side === 1) {
      const lamp = add(elbow, mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.2, 14), new THREE.MeshStandardMaterial({ color: '#30343a', roughness: 0.35, metalness: 0.7 })));
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(0, -0.3, -0.07);
      const lens = add(elbow, mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshStandardMaterial({ color: '#fff8d6', emissive: '#fff4c2', emissiveIntensity: 3 }), false));
      lens.position.set(0, -0.3, -0.172);
      lens.rotation.y = Math.PI;
      lampTip = lens;
    }
    arms.push(arm);
    elbows.push(elbow);
  }

  // Skelett für das Röntgenbild
  const bones = new THREE.Group();
  const boneMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const bone = (len: number, x: number, y: number, z = 0, rx = 0) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, len, 6), boneMat);
    b.position.set(x, y, z); b.rotation.x = rx; bones.add(b);
  };
  bone(0.6, 0, 1.3);
  for (let k = 0; k < 4; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.13 - k * 0.01, 0.012, 6, 16, Math.PI), boneMat); r.position.set(0, 1.42 - k * 0.07, 0); r.rotation.x = Math.PI / 2; bones.add(r); }
  for (const s of [-1, 1]) { bone(0.85, s * 0.1, 0.5); bone(0.6, s * 0.27, 1.25); }
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), boneMat);
  skull.position.y = 1.78; bones.add(skull);
  bones.visible = false;
  root.add(bones);

  const xray = new THREE.MeshBasicMaterial({ color: '#7fd8ff', transparent: true, opacity: 0.28, depthWrite: false });
  return {
    root, hips, spine, neck, head, hat, legs: legs as [THREE.Group, THREE.Group], knees: knees as [THREE.Group, THREE.Group],
    arms: arms as [THREE.Group, THREE.Group], elbows: elbows as [THREE.Group, THREE.Group], hairSpikes, bones, lampTip,
    meshes, originals: meshes.map((m) => m.material as THREE.Material), xray,
  };
}

export type Pose = 'run' | 'walk' | 'idle' | 'jump' | 'slide';

/** Pose setzen; phase in Radiant (Schrittzyklus), amount 0..1 (Laufstärke) */
export function pose(f: Figure, p: Pose, phase: number, amount = 1): void {
  const s = Math.sin(phase), c = Math.cos(phase);
  f.root.rotation.x = 0;
  f.hips.position.y = 0.95;
  f.spine.rotation.set(0, 0, 0);
  if (p === 'run' || p === 'walk') {
    const a = (p === 'run' ? 0.85 : 0.45) * amount;
    f.legs[0].rotation.x = s * a;
    f.legs[1].rotation.x = -s * a;
    f.knees[0].rotation.x = -Math.max(0, -c) * (p === 'run' ? 1.5 : 0.7) * amount - 0.1;
    f.knees[1].rotation.x = -Math.max(0, c) * (p === 'run' ? 1.5 : 0.7) * amount - 0.1;
    f.arms[0].rotation.x = -s * a * 0.9;
    f.arms[1].rotation.x = s * a * 0.9;
    f.elbows[0].rotation.x = f.elbows[1].rotation.x = (p === 'run' ? 1.2 : 0.4) * amount;
    f.arms[0].rotation.z = -0.08; f.arms[1].rotation.z = 0.08;
    f.hips.position.y = 0.95 + Math.abs(s) * (p === 'run' ? 0.06 : 0.025) * amount;
    f.spine.rotation.x = -(p === 'run' ? 0.2 : 0.05) * amount;
    f.spine.rotation.y = s * 0.12 * amount;
  } else if (p === 'jump') {
    f.legs[0].rotation.x = 1.0; f.knees[0].rotation.x = -1.7;
    f.legs[1].rotation.x = 0.35; f.knees[1].rotation.x = -1.3;
    f.arms[0].rotation.x = 2.5; f.arms[1].rotation.x = 2.3;
    f.arms[0].rotation.z = -0.3; f.arms[1].rotation.z = 0.3;
    f.elbows[0].rotation.x = f.elbows[1].rotation.x = 0.3;
    f.spine.rotation.x = -0.1;
  } else if (p === 'slide') {
    f.root.rotation.x = 1.15;
    f.hips.position.y = 0.32;
    f.legs[0].rotation.x = f.legs[1].rotation.x = 0.2;
    f.knees[0].rotation.x = f.knees[1].rotation.x = -0.2;
    f.arms[0].rotation.x = f.arms[1].rotation.x = 2.8;
    f.elbows[0].rotation.x = f.elbows[1].rotation.x = 0.2;
  } else {
    const b = Math.sin(phase * 0.5) * 0.03;
    f.legs[0].rotation.x = f.legs[1].rotation.x = 0;
    f.knees[0].rotation.x = f.knees[1].rotation.x = -0.05;
    f.arms[0].rotation.x = 0.1 + b; f.arms[1].rotation.x = 0.1 - b;
    f.arms[0].rotation.z = -0.1; f.arms[1].rotation.z = 0.1;
    f.elbows[0].rotation.x = f.elbows[1].rotation.x = 0.2;
    f.hips.position.y = 0.95 + b * 0.3;
  }
}

/** Röntgenbild beim Stromschlag ein- oder ausschalten */
export function setXray(f: Figure, on: boolean): void {
  f.meshes.forEach((m, i) => { m.material = on ? f.xray : f.originals[i]!; });
  f.bones.visible = on;
}
