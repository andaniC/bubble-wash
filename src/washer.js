import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// The pressure washer held in the bottom right of the view, its water jet and
// the spray where the jet lands.

const std = (color, roughness = 0.45, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function buildGun() {
  const g = new THREE.Group();
  const blue = std('#2a6fe8', 0.35);
  const red = std('#d8323a', 0.4);
  const steel = std('#b9bec6', 0.3, 0.8);
  const skin = std('#d99a72', 0.65);
  const sleeve = std('#33465e', 0.85);

  const body = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.13, 0.34, 4, 0.04), blue);
  const stripe = new THREE.Mesh(new RoundedBoxGeometry(0.114, 0.035, 0.3, 2, 0.015), red);
  stripe.position.y = -0.045;
  g.add(body, stripe);
  for (let i = 0; i < 4; i++) {
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 14), std('#14223a', 0.6));
    hole.position.set(i % 2 ? 0.025 : -0.025, 0.062, -0.06 + Math.floor(i / 2) * 0.06);
    g.add(hole);
  }
  const lance = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.32, 14), steel);
  lance.rotation.x = Math.PI / 2;
  lance.position.z = 0.32;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.06, 16), red);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = 0.49;
  const grip = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.17, 0.08, 3, 0.025), red);
  grip.position.set(0, -0.12, -0.07);
  grip.rotation.x = 0.3;
  g.add(lance, nozzle, grip);

  // The hand wrapped round the grip, and a sleeve running off screen.
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.085, 0.11, 0.07, 3, 0.03), skin);
  palm.position.set(0.035, -0.13, -0.1);
  palm.rotation.x = 0.3;
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.07, 4, 10), skin);
    finger.rotation.z = Math.PI / 2;
    finger.position.set(-0.005, -0.075 - i * 0.033, -0.025 - i * 0.01);
    g.add(finger);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.017, 0.06, 4, 10), skin);
  thumb.position.set(-0.04, -0.06, -0.08);
  thumb.rotation.set(0.9, 0, 0.5);
  g.add(thumb);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.6, 16), sleeve);
  arm.position.set(0.07, -0.3, -0.33);
  arm.rotation.x = 0.85;
  g.add(arm);

  g.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  return g;
}

function streakTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`;
    g.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 3, 20 + Math.random() * 60);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const MIST_MAX = 420;
const UP = new THREE.Vector3(0, 1, 0);

export function createWasher(camera, scene) {
  const gun = buildGun();
  camera.add(gun);
  const rest = new THREE.Vector3(0.24, -0.25, -0.62);
  gun.position.copy(rest);
  const tip = new THREE.Object3D();
  tip.position.z = 0.52;
  gun.add(tip);

  const jetTex = streakTexture();
  const jetGeo = new THREE.CylinderGeometry(1, 0.3, 1, 18, 1, true);
  jetGeo.translate(0, 0.5, 0);
  const jetMat = new THREE.MeshBasicMaterial({ map: jetTex, color: '#f2faff', transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
  const jet = new THREE.Mesh(jetGeo, jetMat);
  jet.visible = false;
  jet.frustumCulled = false;
  scene.add(jet);

  const mist = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#f4fbff', roughness: 0.2, transparent: true, opacity: 0.5, depthWrite: false }),
    MIST_MAX
  );
  mist.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mist.count = 0;
  mist.frustumCulled = false;
  scene.add(mist);
  const drops = [];

  const aimTarget = new THREE.Vector3();
  const aimer = new THREE.Object3D();
  camera.add(aimer);
  const from = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  let kick = 0;

  // hit: { point, normal } where the jet lands, or null when not spraying.
  // idleAim: where to point when not spraying.
  function update(dt, hit, idleAim, time) {
    aimTarget.copy(hit ? hit.point : idleAim);
    aimer.position.copy(gun.position);
    aimer.lookAt(aimTarget);
    gun.quaternion.slerp(aimer.quaternion, 1 - Math.exp(-dt * (hit ? 22 : 6)));
    kick += ((hit ? 1 : 0) - kick) * Math.min(1, dt * 12);
    gun.position.copy(rest);
    gun.position.y += Math.sin(time * 1.7) * 0.004 * (1 - kick) + Math.sin(time * 61) * 0.0015 * kick;
    gun.position.z += 0.012 * kick;

    jet.visible = !!hit;
    if (hit) {
      tip.getWorldPosition(from);
      dir.copy(hit.point).sub(from);
      const len = dir.length();
      jet.position.copy(from);
      jet.quaternion.setFromUnitVectors(UP, dir.normalize());
      const w = 0.02 + len * 0.016;
      jet.scale.set(w, len, w);
      jetTex.repeat.set(1, Math.max(1, len / 1.5));
      jetTex.offset.y -= dt * 9;

      // Spray bouncing off where the jet lands.
      const n = Math.min(14, Math.round(dt * 260));
      for (let i = 0; i < n && drops.length < MIST_MAX; i++) {
        const v = hit.normal.clone().multiplyScalar(0.8 + Math.random() * 1.6);
        v.x += (Math.random() - 0.5) * 2.2;
        v.y += 0.4 + Math.random() * 1.2;
        v.z += (Math.random() - 0.5) * 2.2;
        drops.push({ p: hit.point.clone(), v, life: 0.3 + Math.random() * 0.25, r: (0.003 + Math.random() * 0.007) * Math.max(1, len / 2) });
      }
    }

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.life -= dt;
      d.v.y -= 7 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.life <= 0 || d.p.y < 0) {
        drops[i] = drops[drops.length - 1];
        drops.pop();
      }
    }
    q.identity();
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      s.setScalar(d.r * (0.6 + d.life));
      m4.compose(d.p, q, s);
      mist.setMatrixAt(i, m4);
    }
    mist.count = drops.length;
    mist.instanceMatrix.needsUpdate = true;
  }

  return { update };
}
