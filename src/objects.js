import * as THREE from 'three';
import { dirtMaterial } from './dirt.js';
import { fbm3 } from './noise.js';

// Washable objects: built in a worker, given a coat of mess, washed by the jet.

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
const waiting = new Map();
const built = new Map();
let nextId = 1;

worker.onmessage = ({ data }) => {
  waiting.get(data.id)(data.model);
  waiting.delete(data.id);
};

export function loadModel(kind, variant) {
  const key = `${kind}:${variant}`;
  if (!built.has(key)) {
    built.set(
      key,
      new Promise((resolve) => {
        const id = nextId++;
        waiting.set(id, resolve);
        worker.postMessage({ id, kind, variant });
      })
    );
  }
  return built.get(key);
}

const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });

export async function makeWashable([kind, variant], level, dirtKey) {
  const model = await loadModel(kind, variant);
  const dims = model.max.map((v, i) => v - model.min[i]);
  const scale = model.size / Math.max(...dims);

  // holder sits in the yard; inner maps model units to metres and puts the
  // object's feet on the ground, centred.
  const holder = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(scale);
  inner.position.set(-(model.min[0] + dims[0] / 2) * scale, -model.min[1] * scale, -(model.min[2] + dims[2] / 2) * scale);
  holder.add(inner);

  const parts = [];
  for (const p of model.parts) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(p.normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(p.colors, 3));
    g.setIndex(new THREE.BufferAttribute(p.indices, 1));
    const dirt = new Float32Array(p.positions.length / 3);
    const attr = new THREE.BufferAttribute(dirt, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('dirt', attr);
    const material = p.clean
      ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, ...p.material })
      : dirtMaterial(p.material, dirtKey);
    if (p.glass) {
      material.polygonOffset = true;
      material.polygonOffsetFactor = -1;
      material.polygonOffsetUnits = -1;
    }
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    inner.add(mesh);
    parts.push({ mesh, positions: p.positions, dirt, attr, clean: p.clean });
  }

  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.BufferAttribute(model.hit.positions, 3));
  hg.setIndex(new THREE.BufferAttribute(model.hit.indices, 1));
  const hitMesh = new THREE.Mesh(hg, hitMaterial);
  inner.add(hitMesh);

  const obj = {
    kind,
    name: model.name,
    sound: model.sound,
    line: model.line,
    size: model.size,
    height: dims[1] * scale,
    holder,
    inner,
    scale,
    parts,
    hitMesh,
    total: 0,
    left: 0,
  };
  soil(obj, model, level);
  return obj;
}

// A coat of mess: thicker low down and in blotches, a bit thinner in places
// so the shape still reads.
function soil(obj, model, level) {
  const h = model.max[1] - model.min[1];
  const seed = Math.random() * 100;
  let total = 0;
  for (const p of obj.parts) {
    if (p.clean) continue;
    const pos = p.positions;
    for (let i = 0; i < p.dirt.length; i++) {
      const x = pos[i * 3];
      const y = pos[i * 3 + 1];
      const z = pos[i * 3 + 2];
      const n = fbm3(x * 1.3 + seed, y * 1.3, z * 1.3, 3);
      const low = 1 - (y - model.min[1]) / h;
      const d = Math.min(1, Math.max(0.1, level.cover + (n - 0.5) * 1.1 + low * 0.3)) * level.thick;
      p.dirt[i] = d;
      total += d;
    }
    p.attr.needsUpdate = true;
  }
  obj.total = total;
  obj.left = total;
}

const _local = new THREE.Vector3();

// Washes everything within `radius` metres of a point; returns how much came off.
export function wash(obj, point, radius, amount) {
  obj.inner.worldToLocal(_local.copy(point));
  const r = radius / obj.scale;
  const r2 = r * r;
  const { x: lx, y: ly, z: lz } = _local;
  let removed = 0;
  for (const p of obj.parts) {
    if (p.clean) continue;
    const pos = p.positions;
    const dirt = p.dirt;
    let touched = false;
    for (let i = 0, n = dirt.length; i < n; i++) {
      const d0 = dirt[i];
      if (d0 <= 0) continue;
      const dx = pos[i * 3] - lx;
      if (dx > r || dx < -r) continue;
      const dy = pos[i * 3 + 1] - ly;
      if (dy > r || dy < -r) continue;
      const dz = pos[i * 3 + 2] - lz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      const take = Math.min(d0, amount * (1 - d2 / r2));
      dirt[i] = d0 - take;
      removed += take;
      touched = true;
    }
    if (touched) p.attr.needsUpdate = true;
  }
  obj.left = Math.max(0, obj.left - removed);
  return removed;
}

export function cleanFraction(obj) {
  return obj.total > 0 ? 1 - obj.left / obj.total : 1;
}

// Melts away whatever mess is left (used once it's nearly clean).
export function fadeDirt(obj, keep) {
  let left = 0;
  for (const p of obj.parts) {
    if (p.clean) continue;
    for (let i = 0; i < p.dirt.length; i++) {
      p.dirt[i] *= keep;
      left += p.dirt[i];
    }
    p.attr.needsUpdate = true;
  }
  obj.left = left;
}

export function disposeWashable(obj) {
  obj.holder.removeFromParent();
  obj.inner.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    if (o.material !== hitMaterial) o.material.dispose();
  });
}
