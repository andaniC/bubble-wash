import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildToy } from './toys.js';
import { Blobs } from './blobs.js';
import { THEMES, DIRT, MADE_LEVELS, levelAt } from './levels.js';
import { unlock, sfx, say, setWater, setMuted, isMuted } from './sound.js';
import { dirtTextures, gradientTexture, tileTexture, shadowTexture } from './textures.js';

// Every level has three messy toys. For each toy:
//   enter → scrub (the sponge wipes off the mess and leaves foam)
//         → rinse (the shower washes the foam away)
//         → dry   (from level 4: the towel soaks up the water drops)
//         → shine (it turns glossy and does a happy hop)
//         → play  (a moment to tap it) → exit
// After the third toy the clean toys line up (levelDone), then the next
// level fades in.

const CLEAN_REACH = 0.45; // how far from the finger mess still gets scrubbed
const RINSE_REACH = 0.55;
const DRY_REACH = 0.5;
const DROP_MAX = 180;
const UP = new THREE.Vector3(0, 1, 0);
const SAVE_KEY = 'bubble-wash-progress';

// ---------- renderer & scene ----------

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#ffffff', 11, 24);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

scene.add(new THREE.HemisphereLight('#ffffff', '#d9e6ea', 0.9));
const sun = new THREE.DirectionalLight('#fff4e6', 1.6);
sun.position.set(3, 7, 5);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
const LOOK = new THREE.Vector3(0, 1.2, 0);

const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.14;
scene.add(floor);

const washMat = new THREE.Mesh(
  new THREE.CylinderGeometry(2.15, 2.25, 0.14, 72),
  new THREE.MeshStandardMaterial({ roughness: 0.5 })
);
washMat.position.y = -0.07;
scene.add(washMat);

const shadowTex = shadowTexture();

function makeShadow() {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.visible = false;
  scene.add(m);
  return m;
}

const shadow = makeShadow();
const lineupShadows = [makeShadow(), makeShadow(), makeShadow()];

function applyTheme(key) {
  const th = THEMES[key];
  scene.background?.dispose();
  scene.background = gradientTexture(th.top, th.bottom);
  scene.fog.color.set(th.bottom);
  floor.material.map?.dispose();
  floor.material.map = tileTexture(th.floor, th.line);
  floor.material.map.repeat.set(22, 22);
  floor.material.needsUpdate = true;
  washMat.material.color.set(th.mat);
  document.documentElement.style.setProperty('--scene-bottom', th.bottom);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', th.top);
}

// ---------- tools ----------

const std = (color, roughness) => new THREE.MeshStandardMaterial({ color, roughness });

function makeSponge() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.34, 0.56, 4, 0.1), std('#ffd84d', 0.85)));
  const scour = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.13, 0.56, 3, 0.05), std('#45b06a', 0.9));
  scour.position.y = -0.21;
  g.add(scour);
  return g;
}

function makeShower() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#f4f7fa', roughness: 0.3, metalness: 0.1 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.18, 40), white));
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.03, 40), std('#5bb8e8', 0.4));
  face.position.y = -0.1;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.95, 20), white);
  handle.position.set(0, 0.42, -0.3);
  handle.rotation.x = -0.65;
  g.add(face, handle);
  return g;
}

function makeTowel() {
  const g = new THREE.Group();
  const pink = std('#ff9ec4', 0.95);
  for (const y of [0.09, -0.09]) {
    const layer = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.17, 0.62, 4, 0.08), pink);
    layer.position.y = y;
    g.add(layer);
  }
  for (const z of [0.2, -0.2]) {
    const stripe = new THREE.Mesh(new RoundedBoxGeometry(0.97, 0.36, 0.07, 2, 0.03), std('#ffffff', 0.95));
    stripe.position.z = z;
    g.add(stripe);
  }
  return g;
}

const sponge = makeSponge();
const shower = makeShower();
const towel = makeTowel();
const tools = [sponge, shower, towel];
for (const tool of tools) {
  tool.scale.setScalar(0.001);
  tool.userData.presence = 0;
  scene.add(tool);
}
const showerTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0));
const flatRest = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.9, -0.4, 0.2));
const restPos = new THREE.Vector3();

function toolFor(p) {
  if (p === 'title' || p === 'enter' || p === 'scrub') return sponge;
  if (p === 'rinse') return shower;
  if (p === 'dry') return towel;
  return null;
}

// ---------- water spray ----------

const drops = new THREE.InstancedMesh(
  new THREE.SphereGeometry(1, 8, 6),
  new THREE.MeshStandardMaterial({ color: '#7fd0ff', roughness: 0.1, transparent: true, opacity: 0.8 }),
  DROP_MAX
);
drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
drops.count = 0;
drops.frustumCulled = false;
scene.add(drops);
const dropList = [];

// ---------- toys ----------

const foamGeo = new THREE.SphereGeometry(1, 14, 10);
const foamMat = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  emissive: '#ffffff',
  emissiveIntensity: 0.28,
  roughness: 0.3,
  transparent: true,
  opacity: 0.95,
});
const foamTints = ['#ffffff', '#f2f8ff', '#fff6fa', '#f6fbff'].map((c) => new THREE.Color(c));
const wetMat = new THREE.MeshStandardMaterial({ color: '#8fd6ff', roughness: 0.05, transparent: true, opacity: 0.72 });

function spawnToy([kind, v], lvl) {
  const t = buildToy(kind, v);
  t.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(t.root);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  t.center = sphere.center;
  t.radius = sphere.radius;
  t.footprint = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  t.baseColors = t.materials.map((m) => m.color.clone());
  t.baseRough = t.materials.map((m) => m.roughness);
  t.color = `#${t.baseColors[0].getHexString()}`;
  t.spots = [];
  t.spotTotal = 0;
  t.tint = [0, 0, 0];
  if (lvl) addDirt(t, lvl);
  t.foam = new Blobs(foamGeo, foamMat, { max: 340, tints: foamTints, minR: 0.06, maxR: 0.16, slide: 1.6 });
  t.wet = new Blobs(foamGeo, wetMat, { max: 140, minR: 0.05, maxR: 0.09, stretch: 1.25 });
  t.root.add(t.foam.mesh, t.wet.mesh);
  t.root.rotation.y = t.turn;
  t.spin = 0;
  t.wiggle = 0;
  t.tapHop = 1;
  t.nextBlink = 1 + Math.random() * 2;
  t.blinkAt = -1;
  scene.add(t.root);
  return t;
}

function disposeToy(t) {
  scene.remove(t.root);
  t.root.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    else if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
}

// Mess is a set of decals projected onto the toy from random directions.
function addDirt(t, lvl) {
  const style = DIRT[lvl.dirt];
  const textures = dirtTextures(lvl.dirt, style);
  const helper = new THREE.Object3D();
  const rc = new THREE.Raycaster();
  const gap = t.radius * 0.26;
  const aim = new THREE.Vector3();
  for (let tries = 0; tries < 1000 && t.spots.length < lvl.spots; tries++) {
    const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 1.1 - 0.15, Math.random() * 2 - 1);
    if (dir.lengthSq() < 0.05) continue;
    dir.normalize();
    const origin = t.center.clone().addScaledVector(dir, t.radius * 2.5);
    aim.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(t.radius * 0.9).add(t.center);
    rc.set(origin, aim.sub(origin).normalize());
    const hit = rc.intersectObjects(t.meshes, false)[0];
    if (!hit || hit.object.userData.face || hit.point.y < 0.2) continue;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (n.y < -0.3) continue;
    if (t.spots.some((s) => s.pos.distanceTo(hit.point) < gap)) continue;

    const stubborn = Math.random() < lvl.stubborn;
    const size = t.radius * (0.3 + Math.random() * 0.2) * (stubborn ? 1.2 : 1);
    helper.position.copy(hit.point);
    helper.lookAt(hit.point.clone().add(n));
    helper.rotation.z = Math.random() * Math.PI * 2;
    const geo = new DecalGeometry(hit.object, hit.point, helper.rotation, new THREE.Vector3(size, size, size * 0.7));
    if (!geo.attributes.position || geo.attributes.position.count === 0) {
      geo.dispose();
      continue;
    }
    const material = new THREE.MeshStandardMaterial({
      map: textures[Math.floor(Math.random() * textures.length)],
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      roughness: style.rough,
    });
    if (stubborn) material.color.setScalar(0.72);
    const decal = new THREE.Mesh(geo, material);
    decal.renderOrder = 1;
    t.root.add(decal);
    const max = stubborn ? 1.8 : 1;
    t.spots.push({ pos: hit.point.clone(), normal: n, dirt: max, max, decal, size });
  }
  t.spotTotal = t.spots.reduce((sum, s) => sum + s.max, 0);
  t.tint = style.tint;
}

function dirtLeft(t) {
  if (!t.spotTotal) return 0;
  let sum = 0;
  for (const s of t.spots) sum += s.dirt;
  return sum / t.spotTotal;
}

const _tint = new THREE.Color();

function paintToy(t, dirt, gloss) {
  const [r, g, b] = t.tint;
  _tint.setRGB(1 - r * dirt, 1 - g * dirt, 1 - b * dirt);
  t.materials.forEach((m, i) => {
    m.color.copy(t.baseColors[i]).multiply(_tint);
    m.roughness = THREE.MathUtils.lerp(t.baseRough[i], 0.16, gloss);
  });
  for (const s of t.spots) {
    s.decal.visible = s.dirt > 0.01;
    s.decal.material.opacity = Math.pow(s.dirt / s.max, 0.7);
  }
}

function blink(t) {
  if (clockTime > t.nextBlink) {
    t.blinkAt = clockTime;
    t.nextBlink = clockTime + 2 + Math.random() * 3;
  }
  const shut = clockTime - t.blinkAt < 0.13;
  for (const e of t.eyes) e.scale.y = shut ? 0.12 : 1;
}

// ---------- input ----------

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const pointers = new Map();
let lastInput = 0;

function rayFrom(p) {
  ndc.set((p.x / window.innerWidth) * 2 - 1, -(p.y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray;
}

function toyCenterWorld(t, target = new THREE.Vector3()) {
  return t.root.localToWorld(target.copy(t.center));
}

// Where the finger meets the toy. Misses near the toy still count, so small
// fingers don't have to be precise.
function probe(ray) {
  const hit = raycaster.intersectObjects(toy.meshes, false)[0];
  if (hit) {
    return {
      point: hit.point.clone(),
      normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld),
      surface: true,
    };
  }
  const point = ray.closestPointToPoint(toyCenterWorld(toy), new THREE.Vector3());
  return { point, normal: ray.direction.clone().negate(), surface: false };
}

function onToy(ray) {
  return ray.intersectsSphere(new THREE.Sphere(toyCenterWorld(toy), toy.radius * 1.08));
}

const working = () => phase === 'scrub' || phase === 'rinse' || phase === 'dry';

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  unlock();
  canvas.setPointerCapture?.(e.pointerId);
  const p = { x: e.clientX, y: e.clientY, lastMove: -1, over: false };
  pointers.set(e.pointerId, p);
  lastInput = clockTime;
  if (!toy) return;
  p.over = onToy(rayFrom(p));
  if ((phase === 'shine' || phase === 'play') && p.over) tapToy();
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  if (Math.abs(dx) + Math.abs(dy) > 1.5) p.lastMove = clockTime;
  lastInput = clockTime;
  if (!toy) return;
  // A finger on the toy cleans it; a finger beside it spins the toy around.
  p.over = onToy(rayFrom(p));
  if (!p.over && working()) {
    toy.root.rotation.y += dx * 0.012;
    toy.spin = THREE.MathUtils.clamp(dx * 0.6, -8, 8);
  }
});

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(type, (e) => pointers.delete(e.pointerId));
}

function toolPointers() {
  return [...pointers.values()].filter((p) => p.over);
}

function tapToy() {
  if (toy.sound === 'voice') say(toy.tapLine);
  else sfx[toy.sound]();
  toy.tapHop = 0;
}

// ---------- tool movement ----------

const _target = new THREE.Vector3();
const _targetQ = new THREE.Quaternion();
const _tangent = new THREE.Vector3();

function moveTool(tool, pos, quat, dt) {
  tool.position.lerp(pos, 1 - Math.exp(-dt * 20));
  tool.quaternion.slerp(quat, 1 - Math.exp(-dt * 12));
}

function restTool(tool, dt) {
  _target.copy(restPos);
  _target.y += Math.sin(clockTime * 2) * 0.06;
  moveTool(tool, _target, tool === shower ? showerTilt : flatRest, dt * 0.5);
}

// Sponge and towel lie flat against the surface and rub back and forth.
function placeFlat(tool, info, moving, dt) {
  _target.copy(info.point).addScaledVector(info.normal, 0.3);
  if (moving) {
    _tangent.crossVectors(info.normal, UP);
    if (_tangent.lengthSq() < 0.01) _tangent.set(1, 0, 0);
    _tangent.normalize();
    _target.addScaledVector(_tangent, Math.sin(clockTime * 22) * 0.07);
  }
  _targetQ.setFromUnitVectors(UP, info.normal);
  moveTool(tool, _target, _targetQ, dt);
}

function placeShower(info, dt) {
  _target.copy(info.point);
  _target.y = Math.min(info.point.y + 1.1, 3.3);
  _target.z += 0.35;
  moveTool(shower, _target, showerTilt, dt);
}

const _nozzle = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _sv = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _dir = new THREE.Vector3();

function spray(at, dt) {
  const n = Math.min(6, Math.round(dt * 90 + Math.random()));
  for (let i = 0; i < n && dropList.length < DROP_MAX; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.24;
    _nozzle.set(Math.cos(a) * r, -0.12, Math.sin(a) * r);
    const from = shower.localToWorld(_nozzle.clone());
    const to = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4));
    const flight = 0.18 + Math.random() * 0.08;
    dropList.push({ pos: from, vel: to.sub(from).divideScalar(flight), life: flight });
  }
}

function updateDrops(dt) {
  for (let i = dropList.length - 1; i >= 0; i--) {
    const d = dropList[i];
    d.life -= dt;
    d.pos.addScaledVector(d.vel, dt);
    if (d.life <= 0) {
      dropList[i] = dropList[dropList.length - 1];
      dropList.pop();
    }
  }
  for (let i = 0; i < dropList.length; i++) {
    const d = dropList[i];
    _q.setFromUnitVectors(UP, _dir.copy(d.vel).normalize());
    _sv.set(0.035, 0.11, 0.035);
    _m4.compose(d.pos, _q, _sv);
    drops.setMatrixAt(i, _m4);
  }
  drops.count = dropList.length;
  drops.instanceMatrix.needsUpdate = true;
}

// Idle hint: after a few quiet seconds the tool floats over something that
// still needs cleaning and rubs there, to show what to do.
function hintTarget() {
  const items =
    phase === 'scrub' ? toy.spots.filter((s) => s.dirt > 0)
    : phase === 'rinse' ? toy.foam.list.filter((b) => !b.gone)
    : toy.wet.list.filter((b) => !b.gone);
  const w = new THREE.Vector3();
  const n = new THREE.Vector3();
  let best = null;
  let bestScore = 0.25;
  for (const it of items) {
    toy.root.localToWorld(w.copy(it.pos));
    n.copy(it.normal).applyQuaternion(toy.root.quaternion);
    const score = n.dot(_dir.copy(camera.position).sub(w).normalize());
    if (score > bestScore) {
      bestScore = score;
      best = { point: w.clone(), normal: n.clone(), surface: true };
    }
  }
  return best;
}

function hinting() {
  const quiet = clockTime - lastInput - 3.5;
  return pointers.size === 0 && quiet > 0 && quiet % 4.5 < 2.2;
}

// ---------- scrub, rinse, dry ----------

const _w = new THREE.Vector3();
const _n = new THREE.Vector3();
const _toCam = new THREE.Vector3();
let foamCarry = 0;
let lastRubSound = 0;
let lastPopSound = 0;

// Only things on the side of the toy facing the camera can be reached.
function reachable(item, ray, reach) {
  toy.root.localToWorld(_w.copy(item.pos));
  _n.copy(item.normal).applyQuaternion(toy.root.quaternion);
  if (_n.dot(_toCam.copy(camera.position).sub(_w)) <= 0) return false;
  return ray.distanceSqToPoint(_w) <= reach * reach;
}

// Runs fn(ray, info, moving) for each finger on the toy; the first finger
// moves the tool. With no finger down the tool rests or shows a hint.
function eachFinger(tool, fn, dt) {
  let primary = null;
  let primaryMoving = false;
  for (const p of toolPointers()) {
    const ray = rayFrom(p);
    const info = probe(ray);
    const moving = clockTime - p.lastMove < 0.15;
    if (!primary) {
      primary = info;
      primaryMoving = moving;
    }
    fn(ray, info, moving);
  }
  const target = primary || (hinting() && hintTarget());
  if (!target) restTool(tool, dt);
  else if (tool === shower) placeShower(target, dt);
  else placeFlat(tool, target, primary ? primaryMoving : true, dt);
  return primary;
}

function rubSound(moving, sound) {
  if (moving && clockTime - lastRubSound > 0.11) {
    sound();
    lastRubSound = clockTime;
  }
}

function scrub(dt) {
  eachFinger(sponge, (ray, info, moving) => {
    const amount = dt * (moving ? 1.8 : 0.7);
    for (const s of toy.spots) {
      if (s.dirt <= 0 || !reachable(s, ray, CLEAN_REACH + s.size * 0.3)) continue;
      s.dirt = Math.max(0, s.dirt - amount);
      if (s.dirt === 0) {
        toy.foam.spawn(s.pos, s.normal, 7, s.size * 0.4);
        sfx.pop();
      }
    }
    if (moving && info.surface) {
      foamCarry += dt * 24;
      const local = toy.root.worldToLocal(info.point.clone());
      const localN = info.normal.clone().applyQuaternion(toy.root.quaternion.clone().invert());
      while (foamCarry >= 1) {
        toy.foam.spawn(local, localN, 1);
        foamCarry -= 1;
      }
    }
    if (moving) toy.wiggle = 1;
    rubSound(moving, sfx.scrub);
  }, dt);
}

function rinse(dt) {
  const primary = eachFinger(shower, (ray) => {
    for (const b of toy.foam.list) {
      if (b.gone || !reachable(b, ray, RINSE_REACH)) continue;
      b.gone = true;
      if (clockTime - lastPopSound > 0.07) {
        sfx.pop();
        lastPopSound = clockTime;
      }
    }
  }, dt);
  setWater(!!primary);
  if (primary) spray(primary.point, dt);
}

function dry(dt) {
  eachFinger(towel, (ray, info, moving) => {
    for (const b of toy.wet.list) {
      if (b.gone || !reachable(b, ray, DRY_REACH)) continue;
      b.hp -= dt * (moving ? 5 : 1.5);
      if (b.hp <= 0) b.gone = true;
    }
    if (moving) toy.wiggle = 1;
    rubSound(moving, sfx.fluff);
  }, dt);
}

// Make sure there is something to rinse even if very little foam was made.
function topUpFoam() {
  for (let guard = 0; toy.foam.list.length < 40 && toy.spots.length && guard < 50; guard++) {
    const s = toy.spots[Math.floor(Math.random() * toy.spots.length)];
    toy.foam.spawn(s.pos, s.normal, 6, s.size * 0.4);
  }
}

function wetToy() {
  for (const s of toy.spots) toy.wet.spawn(s.pos, s.normal, 2, s.size * 0.5);
  for (let guard = 0; toy.wet.list.length < 30 && toy.spots.length && guard < 30; guard++) {
    const s = toy.spots[Math.floor(Math.random() * toy.spots.length)];
    toy.wet.spawn(s.pos, s.normal, 2, s.size * 0.6);
  }
}

// ---------- levels & progress ----------

function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (p && Number.isInteger(p.level) && p.level >= 1) {
      return { level: p.level, done: Array.isArray(p.done) ? p.done : [] };
    }
  } catch {
    // Storage can be blocked; the game still works, it just won't remember.
  }
  return { level: 1, done: [] };
}

function saveProgress() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch {
    // See loadProgress.
  }
}

const progress = loadProgress();
let levelNum = progress.level;
let level = levelAt(levelNum);
let toyInLevel = 0;
let doneColors = [];
let lineup = [];

let toy = null;
let phase = 'title';
let phaseTime = 0;
let clockTime = 0;
let rinseStart = 0;
let dryStart = 0;
let celebrateFrom = 0;

const hud = document.getElementById('hud');
const levelLabel = document.getElementById('level-label');
const slots = [...document.querySelectorAll('#slots i')];
const fade = document.getElementById('fade');

function updateHud() {
  levelLabel.textContent = `Level ${levelNum}`;
  slots.forEach((el, i) => {
    el.style.background = doneColors[i] || '';
    el.classList.toggle('filled', !!doneColors[i]);
  });
}

function sayIntro() {
  const lead = toyInLevel === 0 ? `Level ${levelNum}! ` : '';
  say(`${lead}Oh no! ${DIRT[level.dirt].words(toy.name)}! Let's scrub it!`);
}

function goToLevel(n) {
  for (const t of lineup) disposeToy(t);
  lineup = [];
  for (const s of lineupShadows) s.visible = false;
  if (toy) disposeToy(toy);
  levelNum = n;
  level = levelAt(n);
  toyInLevel = 0;
  doneColors = [];
  progress.level = n;
  saveProgress();
  applyTheme(level.theme);
  updateHud();
  toy = spawnToy(level.toys[0], level);
  toy.root.position.x = -7;
  setPhase('enter');
  fade.classList.remove('on');
}

function visibleWidth() {
  const dist = camera.position.distanceTo(LOOK);
  return 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
}

function startLineup() {
  const spacing = Math.min(2.4, visibleWidth() / 3.3);
  const scale = Math.min(0.68, (spacing / 2.5) * 0.92);
  lineup = level.toys.map((spec, i) => {
    const t = spawnToy(spec, null);
    t.lineX = (i - 1) * spacing;
    t.lineScale = scale;
    t.root.position.set(t.lineX, 0, 0.4);
    t.root.scale.setScalar(0.001);
    paintToy(t, 0, 1);
    return t;
  });
}

const easeOut = (k) => 1 - (1 - k) ** 3;
const easeIn = (k) => k * k * k;
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const easeOutBack = (k) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;

function updateLineup(dt) {
  lineup.forEach((t, i) => {
    const appear = THREE.MathUtils.clamp((phaseTime - i * 0.18) / 0.4, 0, 1);
    let y = 0;
    const hop = (phaseTime - (0.8 + i * 0.35)) / 0.45;
    if (hop > 0 && hop < 1) y = Math.sin(hop * Math.PI) * 0.7;
    const together = (phaseTime - 2.5) / 0.5;
    if (together > 0 && together < 1) y = Math.sin(together * Math.PI) * 0.9;
    y *= t.lineScale * 1.6;
    t.root.position.y = y;
    t.root.scale.setScalar(Math.max(0.001, easeOutBack(appear) * t.lineScale));
    t.root.rotation.y += dt * 0.6;
    blink(t);
    const sh = lineupShadows[i];
    const s = t.footprint * t.lineScale * 1.25 * appear * (1 - Math.min(0.5, y * 0.35));
    sh.visible = true;
    sh.scale.set(Math.max(0.001, s), Math.max(0.001, s), 1);
    sh.position.set(t.lineX, 0.005, 0.4);
  });
}

function setPhase(next) {
  phase = next;
  phaseTime = 0;
  switch (next) {
    case 'enter':
      sfx.whoosh();
      sayIntro();
      break;
    case 'rinse':
      topUpFoam();
      rinseStart = toy.foam.live();
      say('Wow, bubbles! Now rinse them off!');
      break;
    case 'dry':
      setWater(false);
      wetToy();
      dryStart = toy.wet.live();
      say('All wet! Dry it with the towel!');
      break;
    case 'shine':
      setWater(false);
      toy.foam.clear();
      toy.wet.clear();
      sfx.jingle();
      say(`Yay! The ${toy.name} is sparkly clean!`);
      celebrateFrom = toy.root.rotation.y;
      doneColors.push(toy.color);
      updateHud();
      break;
    case 'exit':
      sfx.whoosh();
      break;
    case 'levelDone':
      shadow.visible = false;
      startLineup();
      sfx.fanfare();
      say(`You did it! Level ${levelNum} is all clean!`);
      if (!progress.done.includes(levelNum)) progress.done.push(levelNum);
      progress.level = levelNum + 1;
      saveProgress();
      break;
  }
}

function hopY(k, hops, height) {
  return Math.abs(Math.sin(k * Math.PI * hops)) * height * (1 - k * 0.6);
}

function update(dt) {
  phaseTime += dt;

  if (phase === 'levelDone') {
    updateLineup(dt);
    if (phaseTime > 4.4) fade.classList.add('on');
    if (phaseTime > 5.0) goToLevel(levelNum + 1);
    return;
  }
  if (!toy) return;

  const root = toy.root;
  let y = 0;
  const gloss = phase === 'shine' ? Math.min(1, phaseTime / 0.8) : phase === 'play' || phase === 'exit' ? 1 : 0;

  switch (phase) {
    case 'title':
      root.rotation.y += dt * 0.35;
      restTool(sponge, dt);
      break;
    case 'enter': {
      const k = Math.min(1, phaseTime / 1.3);
      root.position.x = -7 * (1 - easeOut(k));
      y = hopY(k, 3, 0.9) * (1 - k);
      restTool(sponge, dt);
      if (k >= 1) setPhase('scrub');
      break;
    }
    case 'scrub':
      scrub(dt);
      if (dirtLeft(toy) <= 0.12) {
        for (const s of toy.spots) if (s.dirt > 0) s.fading = true;
        setPhase('rinse');
      }
      break;
    case 'rinse':
      rinse(dt);
      if (toy.foam.live() <= Math.max(2, Math.ceil(rinseStart * 0.06))) setPhase(level.towel ? 'dry' : 'shine');
      break;
    case 'dry':
      dry(dt);
      if (toy.wet.live() <= Math.max(1, Math.ceil(dryStart * 0.06))) setPhase('shine');
      break;
    case 'shine': {
      const k = Math.min(1, phaseTime / 1.4);
      const hop = k < 0.5 ? k / 0.5 : (k - 0.5) / 0.5;
      y = Math.sin(hop * Math.PI) * (k < 0.5 ? 1.0 : 0.6);
      root.rotation.y = celebrateFrom + Math.PI * 2 * easeInOut(Math.min(1, k / 0.5));
      if (phaseTime > 1.7) setPhase('play');
      break;
    }
    case 'play':
      if (phaseTime > 2.8) setPhase('exit');
      break;
    case 'exit': {
      const k = Math.min(1, phaseTime / 0.9);
      root.position.x = 7.5 * easeIn(k);
      y = hopY(k, 2, 0.8);
      if (k >= 1) {
        disposeToy(toy);
        toy = null;
        toyInLevel++;
        if (toyInLevel < level.toys.length) {
          toy = spawnToy(level.toys[toyInLevel], level);
          toy.root.position.x = -7;
          setPhase('enter');
        } else {
          setPhase('levelDone');
        }
        return;
      }
      break;
    }
  }

  // Fade out the last bits of mess once the scrub stage is done.
  for (const s of toy.spots) if (s.fading) s.dirt = Math.max(0, s.dirt - dt * 2.5);

  // Turntable: keeps turning, a bit slower while being cleaned, so every side
  // comes around even if a finger never lets go.
  if (working()) {
    root.rotation.y += dt * ((toolPointers().length ? 0.28 : 0.4) + toy.spin);
    toy.spin *= Math.exp(-dt * 2.5);
  }

  // Wiggles while being rubbed, little hop when tapped.
  toy.wiggle = Math.max(0, toy.wiggle - dt * 3);
  root.rotation.z = Math.sin(clockTime * 24) * 0.03 * toy.wiggle;
  toy.tapHop = Math.min(1, toy.tapHop + dt / 0.35);
  y += Math.sin(toy.tapHop * Math.PI) * 0.45;
  root.position.y = y;

  blink(toy);
  paintToy(toy, gloss > 0 ? 0 : dirtLeft(toy), gloss);
  toy.foam.update(dt, clockTime);
  toy.wet.update(dt, clockTime);

  // Shadow follows the toy and shrinks as it hops.
  const s = toy.footprint * 1.25 * (1 - Math.min(0.5, y * 0.35));
  shadow.visible = true;
  shadow.scale.set(s, s, 1);
  shadow.position.set(root.position.x, Math.abs(root.position.x) < 2.1 ? 0.005 : -0.135, 0);
  shadow.material.opacity = 1 - Math.min(0.6, y * 0.4);

  if (phase !== 'rinse') setWater(false);
}

function updateTools(dt) {
  const active = toolFor(phase);
  for (const tool of tools) {
    const on = tool === active ? 1 : 0;
    tool.userData.presence += (on - tool.userData.presence) * Math.min(1, dt * 8);
    tool.scale.setScalar(Math.max(0.001, tool.userData.presence));
    tool.visible = tool.userData.presence > 0.01;
  }
  updateDrops(dt);
}

// ---------- layout ----------

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const dist = 7.4 * Math.max(1, 1.1 / camera.aspect);
  camera.position.set(0, 1.2 + dist * 0.22, dist);
  camera.lookAt(LOOK);
  camera.updateProjectionMatrix();

  // The tools rest near the lower right corner of the screen.
  raycaster.setFromCamera(ndc.set(0.62, -0.5), camera);
  raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.4), restPos);
}

window.addEventListener('resize', resize);
resize();

// ---------- title screen ----------

const title = document.getElementById('title');

function renderLevelPicker() {
  const list = document.getElementById('levels');
  list.replaceChildren();
  const count = Math.max(MADE_LEVELS, progress.level);
  for (let n = 1; n <= count; n++) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = n;
    b.setAttribute('aria-label', `Level ${n}`);
    b.style.setProperty('--chip', THEMES[levelAt(n).theme].mat);
    if (progress.done.includes(n)) b.classList.add('done');
    if (n === progress.level) b.classList.add('current');
    b.addEventListener('click', () => start(n));
    list.append(b);
  }
  list.querySelector('.current')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function start(n) {
  unlock();
  const el = document.documentElement;
  const full = el.requestFullscreen || el.webkitRequestFullscreen;
  if (full) Promise.resolve(full.call(el)).catch(() => {});
  title.classList.add('gone');
  hud.classList.add('on');
  lastInput = clockTime;
  if (n === levelNum && phase === 'title') {
    setPhase('scrub');
    sayIntro();
  } else {
    goToLevel(n);
  }
}

document.getElementById('play').addEventListener('click', () => start(levelNum));

const muteBtn = document.getElementById('mute');
muteBtn.addEventListener('click', () => {
  unlock();
  setMuted(!isMuted());
  muteBtn.classList.toggle('off', isMuted());
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    setWater(false);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
});

// Keep the page from zooming, scrolling or selecting under little fingers.
for (const type of ['gesturestart', 'gesturechange', 'contextmenu', 'selectstart', 'dblclick']) {
  document.addEventListener(type, (e) => e.preventDefault());
}
document.addEventListener('touchmove', (e) => {
  if (!e.target.closest('#levels')) e.preventDefault();
}, { passive: false });

applyTheme(level.theme);
toy = spawnToy(level.toys[0], level);
sponge.position.copy(restPos);
shower.position.copy(restPos);
towel.position.copy(restPos);
updateHud();
renderLevelPicker();

const debug = new URLSearchParams(location.search).has('debug');
const speed = debug ? Number(new URLSearchParams(location.search).get('speed')) || 1 : 1;
function frame(dt) {
  clockTime += dt;
  update(dt);
  updateTools(dt);
  renderer.render(scene, camera);
}

const clock = new THREE.Clock();
const manual = debug && new URLSearchParams(location.search).has('manual');
if (!manual) renderer.setAnimationLoop(() => frame(Math.min(clock.getDelta(), 1 / 20) * speed));

// Test hooks for walking through levels quickly: open with ?debug.
if (debug) {
  window.__game = {
    get phase() { return phase; },
    get level() { return levelNum; },
    get toy() { return toy; },
    goToLevel,
    show(kind, v, n) {
      if (toy) disposeToy(toy);
      level = levelAt(n);
      applyTheme(level.theme);
      toy = spawnToy([kind, v], level);
      setPhase('scrub');
    },
    step(dt) {
      frame(dt);
    },
    // Screen positions of what still needs cleaning on the side facing us.
    targets() {
      if (!toy || !working()) return [];
      const items =
        phase === 'scrub' ? toy.spots.filter((s) => s.dirt > 0)
        : phase === 'rinse' ? toy.foam.list.filter((b) => !b.gone)
        : toy.wet.list.filter((b) => !b.gone);
      const w = new THREE.Vector3();
      const n = new THREE.Vector3();
      return items.flatMap((it) => {
        toy.root.localToWorld(w.copy(it.pos));
        n.copy(it.normal).applyQuaternion(toy.root.quaternion);
        const facing = n.dot(_dir.copy(camera.position).sub(w).normalize());
        if (facing < 0.35) return [];
        w.project(camera);
        return [{ x: ((w.x + 1) / 2) * window.innerWidth, y: ((1 - w.y) / 2) * window.innerHeight, facing }];
      });
    },
    toyScreen() {
      if (!toy) return null;
      const c = toyCenterWorld(toy).project(camera);
      return { x: ((c.x + 1) / 2) * window.innerWidth, y: ((1 - c.y) / 2) * window.innerHeight };
    },
    finishStage() {
      if (phase === 'scrub') for (const s of toy.spots) s.dirt = 0;
      else if (phase === 'rinse') toy.foam.clear();
      else if (phase === 'dry') toy.wet.clear();
    },
  };
}

// A dot that shows where the screen is being touched, for screen recordings.
if (debug && new URLSearchParams(location.search).has('touches')) {
  const dot = document.createElement('div');
  dot.style.cssText =
    'position:fixed;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(255,255,255,.55);box-shadow:0 0 0 2px rgba(32,64,90,.35);pointer-events:none;opacity:0;transition:opacity .12s;z-index:5';
  document.body.append(dot);
  const at = (e) => {
    dot.style.left = `${e.clientX}px`;
    dot.style.top = `${e.clientY}px`;
  };
  window.addEventListener('pointerdown', (e) => {
    at(e);
    dot.style.opacity = '1';
  });
  window.addEventListener('pointermove', at);
  window.addEventListener('pointerup', () => (dot.style.opacity = '0'));
}
