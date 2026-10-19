import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Every toy is built from simple shapes, faces +z (vehicles face +x and are
// turned toward the camera), and is scaled so its largest side is SIZE units
// with its feet on y = 0. Each builder takes a variant number for colours.
const SIZE = 2.5;
const Z = new THREE.Vector3(0, 0, 1);
const HALF_TURN = Math.PI / 2;

const std = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...extra });

const shade = (hex, l) => new THREE.Color(hex).offsetHSL(0, 0, l);
const variant = (list, v) => list[v % list.length];

function add(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function faceParts(obj) {
  obj.traverse((o) => {
    if (o.isMesh) o.userData.face = true;
  });
  return obj;
}

function eye(r) {
  const g = new THREE.Group();
  add(g, new THREE.SphereGeometry(r, 24, 16), std('#ffffff', { roughness: 0.3 }));
  add(g, new THREE.SphereGeometry(r * 0.58, 20, 14), std('#1f1d2b', { roughness: 0.25 }), 0, 0, r * 0.55);
  add(g, new THREE.SphereGeometry(r * 0.18, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }), r * 0.2, r * 0.22, r * 0.98);
  g.userData.eye = true;
  return faceParts(g);
}

function smile(r, tube = r * 0.2, color = '#3b2a2e') {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 24, Math.PI), std(color, { roughness: 0.4 }));
  m.rotation.z = Math.PI;
  const g = new THREE.Group();
  g.add(m);
  return faceParts(g);
}

// Put a face part on the surface of a sphere, facing outward along dir.
function stick(parent, obj, center, radius, dx, dy, dz) {
  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  obj.position.copy(center).addScaledVector(dir, radius);
  obj.quaternion.setFromUnitVectors(Z, dir);
  parent.add(obj);
  return obj;
}

// Face parts for vehicles, which face +x.
function frontEye(parent, r, x, y, z) {
  const e = eye(r);
  e.position.set(x, y, z);
  e.rotation.y = HALF_TURN;
  parent.add(e);
}

function frontSmile(parent, r, x, y) {
  const s = smile(r);
  s.position.set(x, y, 0);
  s.rotation.y = HALF_TURN;
  parent.add(s);
}

function wheels(parent, spots, radius, width, tireMat, hubMat) {
  for (const [x, z] of spots) {
    const w = add(parent, new THREE.CylinderGeometry(radius, radius, width, 32), tireMat, x, radius, z);
    w.rotation.x = HALF_TURN;
    const h = add(parent, new THREE.CylinderGeometry(radius * 0.48, radius * 0.48, width + 0.02, 24), hubMat, x, radius, z);
    h.rotation.x = HALF_TURN;
  }
}

function finish(name, inner, extra = {}) {
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = SIZE / Math.max(size.x, size.y, size.z);
  inner.scale.setScalar(s);
  inner.position.set(-center.x * s, -box.min.y * s, -center.z * s);

  const root = new THREE.Group();
  root.add(inner);

  const meshes = [];
  const eyes = [];
  const materials = new Set();
  inner.traverse((o) => {
    if (o.userData.eye) eyes.push(o);
    if (!o.isMesh) return;
    meshes.push(o);
    if (!o.userData.face) materials.add(o.material);
  });
  return { name, root, meshes, eyes, materials: [...materials], ...extra };
}

const tire = () => std('#2c2c35', { roughness: 0.85 });
const hub = () => std('#dde1e7', { roughness: 0.3, metalness: 0.2 });
const glass = () => std('#c4e9ff', { roughness: 0.12 });

const BALLS = [
  ['#ef5350', '#ffffff', '#3d8bea', '#ffd23f', '#ffffff', '#35b47c'],
  ['#ff7a59', '#fff3d6', '#ff9ec4', '#ffd23f', '#fff3d6', '#a98be8'],
  ['#3d8bea', '#ffffff', '#35b47c', '#7fd3ff', '#ffffff', '#2c6fd1'],
];

function ball(v) {
  const g = new THREE.Group();
  const c = new THREE.Vector3(0, 1, 0);
  variant(BALLS, v).forEach((col, i) => {
    add(g, new THREE.SphereGeometry(1, 48, 32, (i * Math.PI) / 3, Math.PI / 3), std(col, { roughness: 0.45 }), 0, 1, 0);
  });
  add(g, new THREE.SphereGeometry(1.006, 40, 8, 0, Math.PI * 2, 0, 0.3), std('#ffffff', { roughness: 0.45 }), 0, 1, 0);
  stick(g, eye(0.15), c, 0.97, -0.3, 0.25, 0.92);
  stick(g, eye(0.15), c, 0.97, 0.3, 0.25, 0.92);
  stick(g, smile(0.2), c, 1.0, 0, -0.18, 0.98);
  return finish('ball', g, { sound: 'boing', turn: 0.2 });
}

function car(v) {
  const g = new THREE.Group();
  const paint = std(variant(['#e8463c', '#3d8bea', '#ffc23c', '#35b47c'], v), { roughness: 0.4 });
  const win = glass();
  add(g, new RoundedBoxGeometry(2.6, 0.75, 1.35, 5, 0.28), paint, 0, 0.75, 0);
  add(g, new RoundedBoxGeometry(1.45, 0.78, 1.2, 5, 0.3), paint, -0.2, 1.38, 0);
  add(g, new RoundedBoxGeometry(1.15, 0.46, 1.24, 4, 0.12), win, -0.2, 1.42, 0);
  add(g, new RoundedBoxGeometry(1.5, 0.46, 0.96, 4, 0.12), win, -0.2, 1.42, 0);
  wheels(g, [[0.85, 0.66], [-0.85, 0.66], [0.85, -0.66], [-0.85, -0.66]], 0.42, 0.32, tire(), hub());
  for (const z of [0.42, -0.42]) {
    add(g, new THREE.SphereGeometry(0.13, 16, 12), std('#fff3b0', { roughness: 0.2 }), 1.27, 0.88, z);
    frontEye(g, 0.17, 0.58, 1.43, z * 0.62);
  }
  frontSmile(g, 0.24, 1.31, 0.66);
  return finish('car', g, { sound: 'honk', turn: -0.85 });
}

function duck(v) {
  const g = new THREE.Group();
  const col = variant(['#ffd23f', '#ff9ec4', '#7fd3ff'], v);
  const body = std(col, { roughness: 0.42 });
  const wing = std(shade(col, -0.06), { roughness: 0.42 });
  const b = add(g, new THREE.SphereGeometry(1, 48, 32), body, 0, 0.78, -0.1);
  b.scale.set(1.05, 0.78, 1.15);
  const tail = add(g, new THREE.ConeGeometry(0.34, 0.6, 24), body, 0, 1.05, -1.18);
  tail.rotation.x = -HALF_TURN + 0.6;
  const head = new THREE.Vector3(0, 1.75, 0.42);
  add(g, new THREE.SphereGeometry(0.62, 40, 28), body, head.x, head.y, head.z);
  const beak = add(g, new THREE.SphereGeometry(0.3, 32, 16), std('#ff8a2a', { roughness: 0.4 }), 0, 1.6, 1.0);
  beak.scale.set(1.25, 0.45, 1);
  for (const x of [-1, 1]) {
    const w = add(g, new THREE.SphereGeometry(0.5, 32, 20), wing, x * 0.98, 0.88, -0.15);
    w.scale.set(0.25, 0.55, 0.85);
    w.rotation.x = -0.2;
    stick(g, eye(0.14), head, 0.58, x * 0.4, 0.35, 0.85);
  }
  return finish('duck', g, { sound: 'squeak', turn: 0.35 });
}

function puppy(v) {
  const g = new THREE.Group();
  const [furC, darkC] = variant([['#e3a86a', '#a8693a'], ['#d9d4cc', '#6f6560']], v);
  const fur = std(furC, { roughness: 0.7 });
  const dark = std(darkC, { roughness: 0.7 });
  const cream = std('#f7e4c6', { roughness: 0.7 });
  const body = add(g, new THREE.SphereGeometry(1, 40, 28), fur, 0, 0.95, -0.15);
  body.scale.set(0.85, 0.7, 1.05);
  for (const [x, z] of [[0.45, 0.42], [-0.45, 0.42], [0.45, -0.72], [-0.45, -0.72]]) {
    add(g, new THREE.CylinderGeometry(0.2, 0.22, 0.6, 20), fur, x, 0.32, z);
    const paw = add(g, new THREE.SphereGeometry(0.24, 20, 14), cream, x, 0.1, z + 0.06);
    paw.scale.set(1, 0.6, 1.2);
  }
  const head = new THREE.Vector3(0, 1.85, 0.55);
  add(g, new THREE.SphereGeometry(0.72, 40, 28), fur, head.x, head.y, head.z);
  const snout = add(g, new THREE.SphereGeometry(0.36, 28, 20), cream, 0, 1.64, 1.12);
  snout.scale.set(1.15, 0.85, 1);
  const nose = add(g, new THREE.SphereGeometry(0.13, 20, 14), std('#2a2222', { roughness: 0.25 }), 0, 1.78, 1.45);
  nose.scale.set(1.3, 1, 1);
  nose.userData.face = true;
  const tongue = add(g, new THREE.SphereGeometry(0.12, 16, 12), std('#f0738c', { roughness: 0.4 }), 0, 1.45, 1.37);
  tongue.scale.set(1, 0.5, 0.7);
  tongue.userData.face = true;
  for (const x of [-1, 1]) {
    const ear = add(g, new THREE.SphereGeometry(0.42, 28, 20), dark, x * 0.72, 1.78, 0.45);
    ear.scale.set(0.35, 1, 0.65);
    ear.rotation.z = x * 0.35;
    stick(g, eye(0.15), head, 0.68, x * 0.36, 0.3, 0.88);
  }
  const tail = add(g, new THREE.CylinderGeometry(0.07, 0.12, 0.65, 14), dark, 0, 1.35, -1.15);
  tail.rotation.x = -0.7;
  return finish('puppy', g, { sound: 'voice', tapLine: 'Woof woof!', turn: 0.3 });
}

function piggy() {
  const g = new THREE.Group();
  const pink = std('#f7a9b9', { roughness: 0.55 });
  const deep = std('#ef8ba1', { roughness: 0.55 });
  const body = add(g, new THREE.SphereGeometry(1, 48, 32), pink, 0, 1.0, 0);
  body.scale.set(0.95, 0.85, 1.15);
  const snout = add(g, new THREE.CylinderGeometry(0.3, 0.32, 0.26, 32), deep, 0, 1.05, 1.2);
  snout.rotation.x = HALF_TURN;
  for (const x of [-1, 1]) {
    const n = add(g, new THREE.SphereGeometry(0.07, 12, 10), std('#b5576d'), x * 0.11, 1.05, 1.33);
    n.scale.set(0.8, 1.2, 0.4);
    n.userData.face = true;
    const ear = add(g, new THREE.ConeGeometry(0.24, 0.45, 24), deep, x * 0.5, 1.86, 0.3);
    ear.rotation.set(0.3, 0, -x * 0.4);
    add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.36, 20), pink, x * 0.45, 0.18, 0.55);
    add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.36, 20), pink, x * 0.45, 0.18, -0.55);
    const e = eye(0.14);
    e.position.set(x * 0.32, 1.45, 0.86);
    e.quaternion.setFromUnitVectors(Z, new THREE.Vector3(x * 0.3, 0.35, 0.89).normalize());
    g.add(e);
  }
  const tail = add(g, new THREE.TorusGeometry(0.12, 0.04, 8, 20, Math.PI * 1.6), deep, 0, 1.15, -1.17);
  tail.rotation.y = HALF_TURN;
  const s = smile(0.16);
  s.position.set(0, 0.76, 1.08);
  s.rotation.x = 0.25;
  g.add(s);
  return finish('piggy', g, { sound: 'voice', tapLine: 'Oink oink!', turn: 0.3 });
}

function dino(v) {
  const g = new THREE.Group();
  const [bodyC, bellyC, spikeC] = variant([['#5cc27a', '#cdeeb0', '#ffa048'], ['#a98be8', '#e6dcfb', '#ffd23f']], v);
  const skin = std(bodyC, { roughness: 0.5 });
  const belly = std(bellyC, { roughness: 0.55 });
  const spike = std(spikeC, { roughness: 0.45 });
  const body = add(g, new THREE.SphereGeometry(1, 48, 32), skin, 0, 1.0, -0.2);
  body.scale.set(0.85, 0.8, 1.15);
  const tummy = add(g, new THREE.SphereGeometry(1, 32, 24), belly, 0, 0.95, 0.55);
  tummy.scale.set(0.6, 0.6, 0.5);
  const neck = add(g, new THREE.CylinderGeometry(0.35, 0.45, 0.8, 24), skin, 0, 1.6, 0.45);
  neck.rotation.x = 0.5;
  const head = new THREE.Vector3(0, 2.05, 0.75);
  const h = add(g, new THREE.SphereGeometry(0.6, 40, 28), skin, head.x, head.y, head.z);
  h.scale.set(1, 0.9, 1.1);
  const tail = add(g, new THREE.ConeGeometry(0.42, 1.4, 28), skin, 0, 0.85, -1.62);
  tail.rotation.x = -HALF_TURN + 0.25;
  for (const [x, z] of [[0.45, 0.2], [-0.45, 0.2], [0.45, -0.65], [-0.45, -0.65]]) {
    add(g, new THREE.CylinderGeometry(0.25, 0.28, 0.6, 20), skin, x, 0.3, z);
  }
  for (const z of [0.15, -0.25, -0.65, -1.0]) {
    const y = 1.0 + 0.8 * Math.sqrt(Math.max(0, 1 - ((z + 0.2) / 1.15) ** 2));
    add(g, new THREE.ConeGeometry(0.15, 0.36, 16), spike, 0, y + 0.08, z);
  }
  for (const x of [-1, 1]) stick(g, eye(0.14), head, 0.55, x * 0.42, 0.38, 0.82);
  const s = smile(0.2);
  s.position.set(0, 1.85, 1.36);
  s.rotation.x = -0.3;
  g.add(s);
  return finish('dinosaur', g, { sound: 'voice', tapLine: 'Rawr!', turn: 0.4 });
}

function boat(v) {
  const g = new THREE.Group();
  const hullC = variant(['#ef5350', '#3d8bea', '#ffd23f'], v);
  const hull = std(hullC, { roughness: 0.4 });
  const white = std('#fbfbf7', { roughness: 0.4 });
  add(g, new RoundedBoxGeometry(2.3, 0.62, 1.15, 5, 0.26), hull, -0.15, 0.31, 0);
  add(g, new THREE.CylinderGeometry(0.575, 0.575, 0.62, 36), hull, 0.95, 0.31, 0);
  add(g, new RoundedBoxGeometry(2.36, 0.12, 1.21, 3, 0.05), white, -0.15, 0.62, 0);
  add(g, new THREE.CylinderGeometry(0.605, 0.605, 0.12, 36), white, 0.95, 0.62, 0);
  add(g, new RoundedBoxGeometry(1.0, 0.62, 0.86, 4, 0.14), white, -0.35, 0.98, 0);
  add(g, new RoundedBoxGeometry(1.12, 0.12, 0.98, 3, 0.05), hull, -0.35, 1.33, 0);
  add(g, new THREE.CylinderGeometry(0.16, 0.18, 0.5, 20), std(hullC === '#ffd23f' ? '#ef5350' : '#ffd23f'), -0.6, 1.6, 0);
  add(g, new THREE.CylinderGeometry(0.17, 0.17, 0.1, 20), std('#2c2c35'), -0.6, 1.83, 0);
  const win = glass();
  for (const z of [0.58, -0.58]) {
    for (const x of [-0.8, -0.2, 0.4]) {
      const p = add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.04, 20), win, x, 0.34, z);
      p.rotation.x = HALF_TURN;
    }
  }
  for (const z of [0.2, -0.2]) frontEye(g, 0.15, 0.17, 1.02, z);
  frontSmile(g, 0.22, 1.53, 0.36);
  return finish('boat', g, { sound: 'toot', turn: -0.85 });
}

function teddy(v) {
  const g = new THREE.Group();
  const furC = variant(['#c68b59', '#e8b86d'], v);
  const fur = std(furC, { roughness: 0.8 });
  const light = std(shade(furC, 0.18), { roughness: 0.8 });
  const body = add(g, new THREE.SphereGeometry(1, 40, 28), fur, 0, 0.95, 0);
  body.scale.set(0.85, 0.95, 0.75);
  const belly = add(g, new THREE.SphereGeometry(1, 32, 24), light, 0, 0.9, 0.32);
  belly.scale.set(0.55, 0.6, 0.45);
  const head = new THREE.Vector3(0, 2.1, 0.05);
  add(g, new THREE.SphereGeometry(0.7, 40, 28), fur, head.x, head.y, head.z);
  const muzzle = add(g, new THREE.SphereGeometry(0.3, 28, 20), light, 0, 1.95, 0.64);
  muzzle.scale.set(1.2, 0.85, 0.8);
  const nose = add(g, new THREE.SphereGeometry(0.1, 16, 12), std('#3a2a2e', { roughness: 0.3 }), 0, 2.03, 0.88);
  nose.scale.set(1.3, 1, 1);
  nose.userData.face = true;
  for (const x of [-1, 1]) {
    add(g, new THREE.SphereGeometry(0.25, 24, 16), fur, x * 0.5, 2.68, 0);
    const inner = add(g, new THREE.SphereGeometry(0.14, 20, 14), light, x * 0.5, 2.68, 0.14);
    inner.scale.z = 0.5;
    const arm = add(g, new THREE.CapsuleGeometry(0.2, 0.5, 8, 16), fur, x * 0.78, 1.2, 0.2);
    arm.rotation.set(-0.3, 0, x * 0.5);
    const leg = add(g, new THREE.SphereGeometry(0.32, 24, 16), fur, x * 0.45, 0.28, 0.35);
    leg.scale.set(1, 0.8, 1.3);
    stick(g, eye(0.13), head, 0.66, x * 0.33, 0.25, 0.9);
  }
  const s = smile(0.12);
  s.position.set(0, 1.86, 0.87);
  g.add(s);
  return finish('teddy', g, { sound: 'voice', tapLine: 'Big hug!', turn: 0.3 });
}

function kitty(v) {
  const g = new THREE.Group();
  const furC = variant(['#f5a04a', '#b9bcc6'], v);
  const fur = std(furC, { roughness: 0.75 });
  const light = std(shade(furC, 0.2), { roughness: 0.75 });
  const pink = std('#ff9ec4', { roughness: 0.5 });
  const body = add(g, new THREE.SphereGeometry(1, 40, 28), fur, 0, 0.9, 0);
  body.scale.set(0.8, 0.9, 0.85);
  const chest = add(g, new THREE.SphereGeometry(1, 32, 24), light, 0, 0.95, 0.45);
  chest.scale.set(0.5, 0.55, 0.4);
  const head = new THREE.Vector3(0, 1.95, 0.2);
  add(g, new THREE.SphereGeometry(0.7, 40, 28), fur, head.x, head.y, head.z);
  const muzzle = add(g, new THREE.SphereGeometry(0.26, 24, 16), light, 0, 1.8, 0.78);
  muzzle.scale.set(1.4, 0.8, 0.7);
  const nose = add(g, new THREE.SphereGeometry(0.08, 14, 10), pink, 0, 1.9, 0.94);
  nose.scale.set(1.3, 1, 1);
  nose.userData.face = true;
  const whisker = std('#5a4a4a', { roughness: 0.5 });
  for (const x of [-1, 1]) {
    const ear = add(g, new THREE.ConeGeometry(0.24, 0.45, 24), fur, x * 0.42, 2.55, 0.15);
    ear.rotation.z = -x * 0.35;
    const inner = add(g, new THREE.ConeGeometry(0.13, 0.26, 16), pink, x * 0.43, 2.5, 0.27);
    inner.rotation.z = -x * 0.35;
    inner.userData.face = true;
    for (const k of [-1, 0, 1]) {
      const w = add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.55, 6), whisker, x * 0.42, 1.8 + k * 0.06, 0.82);
      w.rotation.z = HALF_TURN + k * 0.15 * x;
      w.userData.face = true;
    }
    const paw = add(g, new THREE.SphereGeometry(0.2, 20, 14), light, x * 0.3, 0.12, 0.62);
    paw.scale.set(1, 0.7, 1.2);
    stick(g, eye(0.15), head, 0.66, x * 0.34, 0.2, 0.9);
  }
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.35, -0.72),
    new THREE.Vector3(0.35, 0.3, -1.05),
    new THREE.Vector3(0.6, 0.8, -1.0),
    new THREE.Vector3(0.5, 1.3, -0.8),
  ]);
  add(g, new THREE.TubeGeometry(curve, 32, 0.1, 10), fur);
  add(g, new THREE.SphereGeometry(0.1, 12, 10), fur, 0.5, 1.3, -0.8);
  const s = smile(0.09);
  s.position.set(0, 1.72, 0.95);
  g.add(s);
  return finish('kitty', g, { sound: 'voice', tapLine: 'Meow!', turn: 0.3 });
}

function truck(v) {
  const g = new THREE.Group();
  const paintC = variant(['#ffb627', '#3d8bea'], v);
  const paint = std(paintC, { roughness: 0.4 });
  const grey = std('#8a93a0', { roughness: 0.5 });
  const win = glass();
  add(g, new RoundedBoxGeometry(2.7, 0.3, 1.1, 3, 0.08), grey, 0, 0.55, 0);
  add(g, new RoundedBoxGeometry(0.95, 1.0, 1.25, 5, 0.22), paint, 0.85, 1.15, 0);
  add(g, new RoundedBoxGeometry(0.98, 0.42, 1.0, 4, 0.1), win, 0.9, 1.38, 0);
  add(g, new RoundedBoxGeometry(0.6, 0.42, 1.29, 4, 0.1), win, 0.85, 1.38, 0);
  add(g, new RoundedBoxGeometry(1.65, 0.75, 1.3, 4, 0.12), std(shade(paintC, -0.08), { roughness: 0.45 }), -0.5, 1.1, 0);
  add(g, new RoundedBoxGeometry(1.45, 0.1, 1.1, 2, 0.04), std('#5b6470', { roughness: 0.6 }), -0.5, 1.44, 0);
  wheels(g, [[0.85, 0.6], [-0.75, 0.6], [0.85, -0.6], [-0.75, -0.6]], 0.42, 0.34, tire(), hub());
  for (const z of [0.42, -0.42]) {
    add(g, new THREE.SphereGeometry(0.11, 16, 12), std('#fff3b0', { roughness: 0.2 }), 1.31, 0.98, z);
    frontEye(g, 0.16, 1.4, 1.4, z * 0.58);
  }
  frontSmile(g, 0.22, 1.34, 0.8);
  return finish('truck', g, { sound: 'honk', turn: -0.85 });
}

function tractor(v) {
  const g = new THREE.Group();
  const paint = std(variant(['#35b47c', '#e8463c'], v), { roughness: 0.45 });
  const yellow = std('#ffd23f', { roughness: 0.4 });
  const dark = std('#3a3f48', { roughness: 0.5 });
  const win = glass();
  add(g, new RoundedBoxGeometry(1.3, 0.7, 0.8, 4, 0.18), paint, 0.45, 1.0, 0);
  add(g, new RoundedBoxGeometry(0.95, 1.05, 1.0, 4, 0.16), paint, -0.5, 1.45, 0);
  add(g, new RoundedBoxGeometry(0.8, 0.55, 1.04, 3, 0.08), win, -0.48, 1.62, 0);
  add(g, new RoundedBoxGeometry(0.99, 0.55, 0.8, 3, 0.08), win, -0.5, 1.62, 0);
  add(g, new RoundedBoxGeometry(1.15, 0.12, 1.15, 3, 0.05), std('#f4f4f0', { roughness: 0.5 }), -0.5, 2.03, 0);
  add(g, new THREE.CylinderGeometry(0.07, 0.07, 0.6, 14), dark, 0.75, 1.6, 0.22);
  wheels(g, [[-0.55, 0.62], [-0.55, -0.62]], 0.72, 0.38, tire(), yellow);
  wheels(g, [[0.75, 0.5], [0.75, -0.5]], 0.4, 0.3, tire(), yellow);
  for (const z of [0.28, -0.28]) {
    add(g, new THREE.SphereGeometry(0.1, 14, 10), std('#fff3b0', { roughness: 0.2 }), 1.08, 1.18, z);
    frontEye(g, 0.15, 0.02, 1.62, z * 0.8);
  }
  frontSmile(g, 0.2, 1.1, 0.9);
  return finish('tractor', g, { sound: 'voice', tapLine: 'Vroom vroom!', turn: -0.85 });
}

function elephant(v) {
  const g = new THREE.Group();
  const skinC = variant(['#a9b8d0', '#f0a6c8'], v);
  const skin = std(skinC, { roughness: 0.65 });
  const inner = std('#ffc2d6', { roughness: 0.65 });
  const body = add(g, new THREE.SphereGeometry(1, 48, 32), skin, 0, 1.25, -0.2);
  body.scale.set(0.95, 0.85, 1.15);
  for (const [x, z] of [[0.5, 0.35], [-0.5, 0.35], [0.5, -0.75], [-0.5, -0.75]]) {
    add(g, new THREE.CylinderGeometry(0.3, 0.32, 0.75, 24), skin, x, 0.375, z);
  }
  const head = new THREE.Vector3(0, 1.95, 0.75);
  add(g, new THREE.SphereGeometry(0.72, 40, 28), skin, head.x, head.y, head.z);
  for (const x of [-1, 1]) {
    const ear = add(g, new THREE.SphereGeometry(0.62, 32, 24), skin, x * 0.82, 2.0, 0.45);
    ear.scale.set(1, 1.05, 0.2);
    ear.rotation.y = -x * 0.45;
    const lining = new THREE.Mesh(new THREE.SphereGeometry(0.62, 28, 20), inner);
    lining.scale.set(0.72, 0.72, 0.6);
    lining.position.z = 0.5;
    ear.add(lining);
    stick(g, eye(0.14), head, 0.68, x * 0.38, 0.3, 0.87);
  }
  const trunk = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.75, 1.3),
    new THREE.Vector3(0, 1.35, 1.55),
    new THREE.Vector3(0, 0.95, 1.62),
    new THREE.Vector3(0, 0.85, 1.85),
    new THREE.Vector3(0, 1.0, 2.0),
  ]);
  add(g, new THREE.TubeGeometry(trunk, 40, 0.17, 14), skin);
  add(g, new THREE.SphereGeometry(0.17, 16, 12), skin, 0, 1.0, 2.0);
  const tail = add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), skin, 0, 1.1, -1.38);
  tail.rotation.x = 0.5;
  return finish('elephant', g, { sound: 'voice', tapLine: 'Toot toot!', turn: 0.35 });
}

function frog() {
  const g = new THREE.Group();
  const skin = std('#6cc644', { roughness: 0.45 });
  const belly = std('#d9f2a8', { roughness: 0.5 });
  const body = add(g, new THREE.SphereGeometry(1, 48, 32), skin, 0, 0.72, 0);
  body.scale.set(1.1, 0.72, 1.0);
  const tummy = add(g, new THREE.SphereGeometry(1, 32, 24), belly, 0, 0.62, 0.55);
  tummy.scale.set(0.8, 0.5, 0.5);
  for (const x of [-1, 1]) {
    add(g, new THREE.SphereGeometry(0.32, 28, 20), skin, x * 0.46, 1.36, 0.3);
    const e = eye(0.24);
    e.position.set(x * 0.46, 1.42, 0.42);
    e.quaternion.setFromUnitVectors(Z, new THREE.Vector3(x * 0.2, 0.3, 1).normalize());
    g.add(e);
    const cheek = add(g, new THREE.SphereGeometry(0.12, 16, 12), std('#ffb3c7', { roughness: 0.5 }), x * 0.6, 0.95, 0.78);
    cheek.scale.set(1, 0.6, 0.4);
    cheek.userData.face = true;
    const leg = add(g, new THREE.SphereGeometry(0.45, 28, 20), skin, x * 0.95, 0.3, -0.15);
    leg.scale.set(0.6, 0.45, 1);
    const foot = add(g, new THREE.SphereGeometry(0.18, 16, 12), skin, x * 0.5, 0.08, 0.72);
    foot.scale.set(1.2, 0.5, 1.3);
  }
  const s = smile(0.42, 0.05);
  s.position.set(0, 0.9, 0.97);
  g.add(s);
  return finish('frog', g, { sound: 'voice', tapLine: 'Ribbit!', turn: 0.3 });
}

const BUILDERS = { ball, car, duck, puppy, piggy, dino, boat, teddy, kitty, truck, tractor, elephant, frog };

// How many colour variants each toy has, for picking random ones.
export const TOY_VARIANTS = {
  ball: 3, car: 4, duck: 3, puppy: 2, piggy: 1, dino: 2, boat: 3,
  teddy: 2, kitty: 2, truck: 2, tractor: 2, elephant: 2, frog: 1,
};

export function buildToy(kind, v = 0) {
  return BUILDERS[kind](v);
}
