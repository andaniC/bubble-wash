import * as THREE from 'three';
import { tileFbm, seeded } from './noise.js';

// The backyard: paved patio in front of a house, lawn, fence, trees, sky.
// Objects get washed at the origin.

function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

function noisePixels(g, w, h, period, octaves, seed, paint) {
  const img = g.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const n = tileFbm(x / w, y / h, period, octaves, seed);
      paint(img.data, i, n);
    }
  }
  g.putImageData(img, 0, 0);
}

function paverTexture() {
  const rnd = seeded(4);
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#8f8a82';
    g.fillRect(0, 0, w, h);
    const rows = 10;
    const bh = h / rows;
    const bw = bh * 2;
    for (let r = 0; r < rows; r++) {
      const shift = (r % 2) * bw * 0.5;
      for (let x = -bw; x < w + bw; x += bw) {
        const tone = 168 + rnd() * 40;
        g.fillStyle = `rgb(${tone + 8},${tone + 2},${tone - 8})`;
        g.fillRect(x + shift + 3, r * bh + 3, bw - 6, bh - 6);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(x + shift + 3, r * bh + 3, bw - 6, 4);
        g.fillStyle = 'rgba(0,0,0,0.08)';
        g.fillRect(x + shift + 3, r * bh + bh - 7, bw - 6, 4);
      }
    }
    noisePixels(g, w, h, 16, 4, 9, (px, i, n) => {
      const k = 0.88 + n * 0.24;
      px[i] *= k;
      px[i + 1] *= k;
      px[i + 2] *= k;
    });
  });
}

function grassTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#5f8f3a';
    g.fillRect(0, 0, w, h);
    noisePixels(g, w, h, 8, 5, 21, (px, i, n) => {
      px[i] = 70 + n * 60;
      px[i + 1] = 110 + n * 70;
      px[i + 2] = 40 + n * 30;
    });
    const rnd = seeded(8);
    for (let k = 0; k < 6000; k++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(40,80,25,0.35)' : 'rgba(150,190,90,0.3)';
      g.fillRect(rnd() * w, rnd() * h, 1.5, 4 + rnd() * 5);
    }
  });
}

function sidingTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#e4e7e9';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(0, y + 28, w, 4);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(0, y, w, 3);
    }
  });
}

function roofTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#4a4d52';
    g.fillRect(0, 0, w, h);
    const rnd = seeded(5);
    for (let y = 0; y < h; y += 32) {
      for (let x = (y / 32) % 2 ? -32 : 0; x < w; x += 64) {
        const t = 60 + rnd() * 25;
        g.fillStyle = `rgb(${t},${t + 3},${t + 8})`;
        g.fillRect(x + 2, y + 2, 60, 28);
      }
    }
  });
}

function plankTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    const rnd = seeded(6);
    for (let x = 0; x < w; x += 32) {
      const t = 120 + rnd() * 30;
      g.fillStyle = `rgb(${t + 30},${t},${t - 35})`;
      g.fillRect(x, 0, 30, h);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x + 30, 0, 2, h);
    }
    noisePixels(g, w, h, 4, 4, 13, (px, i, n) => {
      const k = 0.85 + n * 0.3;
      px[i] *= k;
      px[i + 1] *= k;
      px[i + 2] *= k;
    });
  });
}

function garageTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#f1f1ee';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 128) {
      g.fillStyle = 'rgba(0,0,0,0.14)';
      g.fillRect(0, y + 122, w, 6);
      for (let x = 0; x < w; x += 128) {
        g.fillStyle = 'rgba(0,0,0,0.06)';
        g.fillRect(x + 16, y + 18, 96, 88);
      }
    }
  });
}

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  const rnd = seeded(3);
  for (let i = 0; i < 14; i++) {
    const x = 50 + rnd() * 156;
    const y = 60 + (rnd() - 0.5) * 30;
    const r = 22 + rnd() * 26;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TIMES = {
  day: { top: '#4f8fd8', horizon: '#cfe4f4', sun: '#fff5e6', sunI: 2.8, hemi: 0.75, dir: [0.45, 0.8, 0.4] },
  morning: { top: '#6c9fdc', horizon: '#f3e2cf', sun: '#ffe2bd', sunI: 2.4, hemi: 0.7, dir: [-0.6, 0.55, 0.55] },
  evening: { top: '#4f6db0', horizon: '#f4c49a', sun: '#ffbf85', sunI: 2.2, hemi: 0.6, dir: [0.75, 0.38, -0.3] },
};

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, below: { value: new THREE.Color('#8a8f78') } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 below; varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(min(1.0, h * 1.6), 0.7)) : mix(horizon, below, min(1.0, -h * 4.0));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function createWorld(scene, renderer) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMaterial());
  scene.add(sky);
  scene.fog = new THREE.Fog('#cfe4f4', 40, 160);

  const hemi = new THREE.HemisphereLight('#dceeff', '#7d7a62', 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff5e6', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // Ground: lawn everywhere, paved patio around the washing spot.
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 0.95 })
  );
  grass.material.map.repeat.set(120, 120);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.01;
  grass.receiveShadow = true;
  scene.add(grass);
  const patio = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 22),
    new THREE.MeshStandardMaterial({ map: paverTexture(), roughness: 0.85 })
  );
  patio.material.map.repeat.set(5, 5);
  patio.rotation.x = -Math.PI / 2;
  patio.receiveShadow = true;
  scene.add(patio);

  // House behind the patio.
  const house = new THREE.Group();
  const siding = sidingTexture();
  siding.repeat.set(5, 2);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(18, 5.4, 9), new THREE.MeshStandardMaterial({ map: siding, roughness: 0.8 }));
  walls.position.set(0, 2.7, -16);
  const roofTex = roofTexture();
  roofTex.repeat.set(6, 2);
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.75 });
  for (const s of [1, -1]) {
    const slope = new THREE.Mesh(new THREE.BoxGeometry(19, 0.2, 5.6), roofMat);
    slope.position.set(0, 6.6, -16 + s * 2.35);
    slope.rotation.x = s * 0.55;
    house.add(slope);
  }
  const gable = new THREE.Shape([new THREE.Vector2(-4.6, 0), new THREE.Vector2(4.6, 0), new THREE.Vector2(0, 2.6)]);
  for (const x of [9, -9]) {
    const end = new THREE.Mesh(new THREE.ShapeGeometry(gable), new THREE.MeshStandardMaterial({ color: '#e4e7e9', roughness: 0.8, side: THREE.DoubleSide }));
    end.rotation.y = Math.PI / 2;
    end.position.set(x, 5.4, -16);
    house.add(end);
  }
  const frame = new THREE.MeshStandardMaterial({ color: '#fbfbf8', roughness: 0.5 });
  const pane = new THREE.MeshStandardMaterial({ color: '#2a3a4a', roughness: 0.06, metalness: 0.4 });
  for (const [x, y, w, h] of [[-6.5, 3.3, 1.6, 1.5], [-3.5, 3.3, 1.6, 1.5], [0, 3.6, 1.2, 1.1], [-6.5, 1.3, 1.6, 1.3]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.12), frame);
    f.position.set(x, y, -11.47);
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.14), pane);
    p.position.set(x, y, -11.45);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, 0.16), frame);
    bar.position.set(x, y, -11.42);
    house.add(f, p, bar);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.12), new THREE.MeshStandardMaterial({ color: '#2f5d7c', roughness: 0.5 }));
  door.position.set(-2.2, 1.1, -11.46);
  const garage = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.6, 0.12), new THREE.MeshStandardMaterial({ map: garageTexture(), roughness: 0.6 }));
  garage.position.set(4.6, 1.3, -11.46);
  const gutter = new THREE.Mesh(new THREE.BoxGeometry(19, 0.16, 0.18), frame);
  gutter.position.set(0, 5.35, -11.35);
  house.add(walls, door, garage, gutter);
  house.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(house);

  // Wooden fence around the other three sides.
  const planks = plankTexture();
  const fenceMat = new THREE.MeshStandardMaterial({ map: planks, roughness: 0.9 });
  for (const [x, z, len, rot] of [[-13, -1, 21, Math.PI / 2], [13, -1, 21, Math.PI / 2], [0, 10, 26, 0]]) {
    const tex = planks.clone();
    tex.repeat.set(len / 4, 1);
    tex.needsUpdate = true;
    const fence = new THREE.Mesh(new THREE.BoxGeometry(len, 1.8, 0.08), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    fence.position.set(x, 0.9, z);
    fence.rotation.y = rot;
    fence.castShadow = true;
    fence.receiveShadow = true;
    scene.add(fence);
  }
  fenceMat.dispose();

  // Trees and bushes.
  const rnd = seeded(11);
  const leafMats = ['#4f7d2f', '#5d8a36', '#466f2a'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  const bark = new THREE.MeshStandardMaterial({ color: '#5b4330', roughness: 0.95 });
  function blob(r, detail = 3) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const k = 1 + (Math.sin(v.x * 3.1 + v.y * 2.3) * 0.5 + Math.sin(v.z * 2.7 - v.y * 1.9) * 0.5) * 0.12;
      v.multiplyScalar(k);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }
  for (const [x, z, s] of [[-9.5, -7, 1.2], [10.5, -6.5, 1.0], [-10.5, 6, 1.1], [10, 7.5, 0.9], [-4, -10.4, 0.5], [3, -10.4, 0.5]]) {
    const tree = new THREE.Group();
    if (s > 0.6) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.26 * s, 3.2 * s, 10), bark);
      trunk.position.y = 1.6 * s;
      tree.add(trunk);
    }
    const lift = s > 0.6 ? 3.6 * s : 0.4;
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(blob((1.1 + rnd() * 0.7) * s), leafMats[i % 3]);
      leaf.position.set((rnd() - 0.5) * 1.8 * s, lift + (rnd() - 0.3) * 1.4 * s, (rnd() - 0.5) * 1.8 * s);
      tree.add(leaf);
    }
    tree.position.set(x, 0, z);
    tree.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    scene.add(tree);
  }

  const cloudTex = cloudTexture();
  for (let i = 0; i < 9; i++) {
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, fog: false, depthWrite: false, opacity: 0.85 }));
    const a = (i / 9) * Math.PI * 2 + rnd();
    cloud.position.set(Math.cos(a) * 180, 45 + rnd() * 35, Math.sin(a) * 180);
    cloud.scale.set(70 + rnd() * 40, 30 + rnd() * 15, 1);
    scene.add(cloud);
  }

  // Reflections for glossy paint and glass come from a blurred copy of the sky.
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null;

  function setTime(name) {
    const t = TIMES[name] || TIMES.day;
    sky.material.uniforms.top.value.set(t.top);
    sky.material.uniforms.horizon.value.set(t.horizon);
    scene.fog.color.set(t.horizon);
    hemi.intensity = t.hemi;
    sun.color.set(t.sun);
    sun.intensity = t.sunI;
    sun.userData.dir = new THREE.Vector3(...t.dir).normalize();
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(sky.geometry, sky.material));
    envTarget?.dispose();
    envTarget = pmrem.fromScene(envScene, 0.05);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.55;
  }

  // Keep the sun's shadow box tight around whatever is being washed.
  function aimSun(radius) {
    const d = sun.userData.dir;
    sun.position.copy(d).multiplyScalar(20);
    sun.target.position.set(0, 0, 0);
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -radius;
    cam.right = cam.top = radius;
    cam.near = 1;
    cam.far = 45;
    cam.updateProjectionMatrix();
  }

  setTime('day');
  aimSun(4);
  return { setTime, aimSun };
}
