import * as THREE from 'three';

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _off = new THREE.Vector3();

// Little spheres stuck to a toy's surface: soap foam, or water drops after a
// rinse. Positions are in the toy's local space so they turn with it.
export class Blobs {
  constructor(geometry, material, { max, tints, minR, maxR, stretch = 1, slide = 0 }) {
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (tints) for (let i = 0; i < max; i++) this.mesh.setColorAt(i, tints[i % tints.length]);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.userData.shared = true;
    Object.assign(this, { max, minR, maxR, stretch, slide });
    this.list = [];
  }

  spawn(pos, normal, count, spread = 0.18) {
    for (let i = 0; i < count && this.list.length < this.max; i++) {
      const r = this.minR + Math.random() * (this.maxR - this.minR);
      _off.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(spread * 2);
      _off.addScaledVector(normal, -_off.dot(normal));
      this.list.push({
        pos: pos.clone().add(_off).addScaledVector(normal, r * 0.5),
        normal: normal.clone(),
        r,
        s: 0,
        hp: 1,
        gone: false,
        seed: Math.random() * 6.28,
      });
    }
  }

  live() {
    let n = 0;
    for (const b of this.list) if (!b.gone) n++;
    return n;
  }

  clear() {
    for (const b of this.list) b.gone = true;
  }

  update(dt, time) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (b.gone) {
        b.s -= dt * 0.5;
        b.pos.y -= dt * this.slide;
        if (b.s <= 0.003) {
          list[i] = list[list.length - 1];
          list.pop();
        }
      } else {
        b.s += (b.r - b.s) * Math.min(1, dt * 14);
      }
    }
    _q.identity();
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const s = Math.max(0.0001, b.s * (1 + Math.sin(time * 3 + b.seed) * 0.05));
      _s.set(s, s * this.stretch, s);
      _m4.compose(b.pos, _q, _s);
      this.mesh.setMatrixAt(i, _m4);
    }
    this.mesh.count = list.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
