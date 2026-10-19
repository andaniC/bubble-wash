import * as THREE from 'three';
import { createWorld } from './world.js';
import { createWasher } from './washer.js';
import { makeWashable, loadModel, wash, cleanFraction, fadeDirt, disposeWashable } from './objects.js';
import { DIRT_STYLES } from './dirt.js';
import { MADE_LEVELS, levelAt } from './levels.js';
import { unlock, sfx, say, setWater, setMuted, isMuted } from './sound.js';

// Each level brings three dirty things into the yard, one at a time. Touch
// and hold to spray: the mess comes off wherever the jet hits. Swipe beside
// the object to walk around it. At 93% clean the rest melts away and the
// next one arrives.

const CLEAN_AT = 0.93;
const SAVE_KEY = 'splash-wash-progress';
const search = new URLSearchParams(location.search);
const debug = search.has('debug');

// ---------- scene ----------

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 700);
scene.add(camera);
const world = createWorld(scene, renderer);
const washer = createWasher(camera, scene);

// ---------- progress ----------

function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (p && Number.isInteger(p.level) && p.level >= 1) return { level: p.level, done: Array.isArray(p.done) ? p.done : [] };
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

// ---------- state ----------

let levelNum = progress.level;
let level = levelAt(levelNum);
let itemIndex = 0;
let obj = null;
let nextObj = null;
let prepToken = 0;
let phase = 'title';
let phaseTime = 0;
let clockTime = 0;
let started = false;
let shownTime = null;
let fadeLevel = 0;
let best = 0;
let bestAt = 0;

const rig = { angle: 0.55, dist: 4, height: 1.6, lookY: 0.8, spin: 0 };
const rigGoal = { dist: 4, height: 1.6, lookY: 0.8 };

function prepare(spec) {
  const token = ++prepToken;
  nextObj = null;
  makeWashable(spec, level, level.dirt).then((o) => {
    if (token === prepToken) nextObj = o;
    else disposeWashable(o);
  });
}

function aimRigAt(o, snap) {
  const portrait = Math.max(1, 1.15 / camera.aspect);
  rigGoal.dist = (o.size * 1.05 + 0.9) * portrait;
  // Stand a little above things and look down on them, so tops get washed too.
  rigGoal.height = o.height * 0.9 + o.size * 0.35 + 0.3;
  rigGoal.lookY = o.height * 0.4;
  if (snap) Object.assign(rig, rigGoal);
}

function swapIn() {
  if (obj) disposeWashable(obj);
  obj = nextObj;
  nextObj = null;
  scene.add(obj.holder);
  if (shownTime !== level.time) {
    world.setTime(level.time);
    shownTime = level.time;
  }
  world.aimSun(Math.max(3, obj.size * 0.9));
  rig.angle = 0.55;
  aimRigAt(obj, true);
  updateHud();
  // Warm up the rest of this level in the background.
  for (const spec of level.items.slice(itemIndex + 1)) loadModel(...spec);
}

function intro() {
  const lead = itemIndex === 0 ? `Level ${levelNum}! ` : '';
  say(`${lead}Oh no! A ${DIRT_STYLES[level.dirt].word} ${obj.name}! Let's wash it!`);
}

function setPhase(next) {
  phase = next;
  phaseTime = 0;
  if (next === 'in') intro();
  if (next === 'done') {
    setWater(false);
    sfx.jingle();
    say(`Wow! The ${obj.name} is sparkling clean!`);
    updateHud();
  }
  if (next === 'levelDone') {
    sfx.fanfare();
    say(`Level ${levelNum} done! Great washing!`);
    if (!progress.done.includes(levelNum)) progress.done.push(levelNum);
    progress.level = levelNum + 1;
    saveProgress();
    card.querySelector('b').textContent = `Level ${levelNum}`;
    card.classList.add('on');
  }
}

function nextItem() {
  itemIndex++;
  if (itemIndex < level.items.length) {
    prepare(level.items[itemIndex]);
    setPhase('out');
  } else {
    setPhase('levelDone');
  }
}

function goToLevel(n) {
  levelNum = n;
  level = levelAt(n);
  itemIndex = 0;
  progress.level = n;
  saveProgress();
  prepare(level.items[0]);
  setPhase('out');
}

// ---------- HUD ----------

const hud = document.getElementById('hud');
const levelLabel = document.getElementById('level-label');
const itemLabel = document.getElementById('item-label');
const meterFill = document.getElementById('meter-fill');
const percent = document.getElementById('percent');
const slots = [...document.querySelectorAll('#slots i')];
const fade = document.getElementById('fade');
const card = document.getElementById('card');
let shownPercent = -1;

function updateHud() {
  levelLabel.textContent = `Level ${levelNum}`;
  itemLabel.textContent = obj ? obj.name[0].toUpperCase() + obj.name.slice(1) : '';
  const finished = itemIndex + (phase === 'done' ? 1 : 0);
  slots.forEach((el, i) => el.classList.toggle('filled', i < finished));
}

function updateMeter() {
  const p = obj ? Math.floor(cleanFraction(obj) * 100) : 0;
  if (p === shownPercent) return;
  shownPercent = p;
  meterFill.style.transform = `scaleX(${p / 100})`;
  percent.textContent = `${p}%`;
}

// ---------- input ----------

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const pointers = new Map();

function hitTest(p) {
  if (!obj) return null;
  ndc.set((p.x / window.innerWidth) * 2 - 1, -(p.y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(obj.hitMesh, false)[0];
  if (!hit) return null;
  return { point: hit.point, normal: hit.face.normal.clone().transformDirection(obj.hitMesh.matrixWorld) };
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  unlock();
  canvas.setPointerCapture?.(e.pointerId);
  const p = { x: e.clientX, y: e.clientY, over: false };
  p.over = !!hitTest(p);
  pointers.set(e.pointerId, p);
  if (phase === 'done' && p.over) {
    if (obj.sound) sfx[obj.sound]();
    else if (obj.line) say(obj.line);
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x;
  p.x = e.clientX;
  p.y = e.clientY;
  p.over = !!hitTest(p);
  // A finger beside the object walks you around it.
  if (!p.over && phase !== 'title') {
    rig.angle -= dx * 0.006;
    rig.spin = THREE.MathUtils.clamp(-dx * 0.25, -3, 3);
  }
});

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(type, (e) => pointers.delete(e.pointerId));
}

// ---------- frame ----------

const look = new THREE.Vector3();

function spray(dt) {
  let primary = null;
  for (const p of pointers.values()) {
    if (!p.over) continue;
    const h = hitTest(p);
    if (!h) continue;
    primary ||= h;
    wash(obj, h.point, obj.size * 0.22, dt * 6);
  }
  return primary;
}

function update(dt) {
  phaseTime += dt;
  let jet = null;

  if (phase === 'title' && !obj && nextObj) {
    swapIn();
    if (started) setPhase('in');
  }

  if (phase === 'wash' && obj) {
    jet = spray(dt);
    // Done when nearly clean, or when mostly clean and the last bits are
    // somewhere hard to reach (nothing has come off for a few seconds).
    const clean = cleanFraction(obj);
    if (phaseTime < dt || clean > best + 0.003) {
      best = clean;
      bestAt = phaseTime;
    }
    if (clean >= CLEAN_AT || (clean >= 0.85 && phaseTime - bestAt > 5)) setPhase('done');
  } else if (phase === 'done') {
    fadeDirt(obj, Math.exp(-dt * 5));
    rig.angle += dt * 0.5;
    if (phaseTime > 2.8) nextItem();
  } else if (phase === 'out') {
    fadeLevel = Math.min(1, fadeLevel + dt / 0.35);
    if (fadeLevel === 1 && nextObj) {
      swapIn();
      setPhase('in');
    }
  } else if (phase === 'in') {
    fadeLevel = Math.max(0, fadeLevel - dt / 0.35);
    if (fadeLevel === 0) setPhase('wash');
  } else if (phase === 'levelDone') {
    rig.angle += dt * 0.3;
    if (phaseTime > 3.4) {
      card.classList.remove('on');
      goToLevel(levelNum + 1);
    }
  }
  setWater(!!jet);
  fade.style.opacity = fadeLevel;

  // Keep walking slowly around the object (slower while spraying), so every
  // side comes round even if a finger never lets go.
  if (phase !== 'done') rig.angle += dt * ((jet ? 0.1 : 0.35) + rig.spin);
  rig.spin *= Math.exp(-dt * 3);
  rig.dist += (rigGoal.dist - rig.dist) * Math.min(1, dt * 4);
  rig.height += (rigGoal.height - rig.height) * Math.min(1, dt * 4);
  rig.lookY += (rigGoal.lookY - rig.lookY) * Math.min(1, dt * 4);
  camera.position.set(Math.sin(rig.angle) * rig.dist, rig.height, Math.cos(rig.angle) * rig.dist);
  look.set(0, rig.lookY, 0);
  camera.lookAt(look);
  camera.updateMatrixWorld();

  washer.update(dt, jet, look, clockTime);
  updateMeter();
}

const skipRender = debug && search.has('norender');

function frame(dt) {
  clockTime += dt;
  update(dt);
  if (skipRender) scene.updateMatrixWorld();
  else renderer.render(scene, camera);
}

// ---------- layout ----------

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (obj) aimRigAt(obj, false);
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
  started = true;
  if (n !== levelNum) goToLevel(n);
  else if (obj) setPhase('in');
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

renderLevelPicker();
prepare(level.items[0]);

const speed = debug ? Number(search.get('speed')) || 1 : 1;
const clock = new THREE.Clock();
if (!(debug && search.has('manual'))) renderer.setAnimationLoop(() => frame(Math.min(clock.getDelta(), 1 / 20) * speed));

// ---------- test hooks (open with ?debug) ----------

if (debug) {
  window.__game = {
    get phase() { return phase; },
    get level() { return levelNum; },
    get ready() { return !!obj; },
    get clean() { return obj ? cleanFraction(obj) : 0; },
    get obj() { return obj; },
    step: frame,
    goToLevel,
    // Show one object right away, for checking how things look.
    async show(kind, v, n = 1) {
      level = levelAt(n);
      nextObj = await makeWashable([kind, v], level, level.dirt);
      swapIn();
      phase = 'wash';
    },
    // Screen spots that still need washing on the side facing the camera.
    targets() {
      if (!obj) return [];
      const out = [];
      const v = new THREE.Vector3();
      const n = new THREE.Vector3();
      const toCam = new THREE.Vector3();
      for (const p of obj.parts) {
        if (p.clean) continue;
        const pos = p.positions;
        const nor = p.mesh.geometry.attributes.normal.array;
        for (let i = 0; i < p.dirt.length; i += 41) {
          if (p.dirt[i] < 0.3) continue;
          v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
          p.mesh.localToWorld(v);
          n.set(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]).transformDirection(p.mesh.matrixWorld);
          if (n.dot(toCam.copy(camera.position).sub(v).normalize()) < 0.3) continue;
          // Skip spots hidden behind another part of the object.
          const dist = camera.position.distanceTo(v);
          raycaster.set(camera.position, toCam.copy(v).sub(camera.position).normalize());
          const first = raycaster.intersectObject(obj.hitMesh, false)[0];
          if (first && first.distance < dist - obj.size * 0.05) continue;
          v.project(camera);
          if (Math.abs(v.x) > 0.9 || Math.abs(v.y) > 0.9) continue;
          out.push({ x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight });
        }
      }
      return out;
    },
    toyScreen() {
      if (!obj) return null;
      const c = new THREE.Vector3(0, obj.height * 0.5, 0).project(camera);
      return { x: ((c.x + 1) / 2) * window.innerWidth, y: ((1 - c.y) / 2) * window.innerHeight };
    },
    finishStage() {
      if (obj) fadeDirt(obj, 0);
    },
  };
}

// Shows where the screen is being touched, for screen recordings.
if (debug && search.has('touches')) {
  const dot = document.createElement('div');
  dot.style.cssText =
    'position:fixed;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(255,255,255,.45);box-shadow:0 0 0 2px rgba(32,64,90,.35);pointer-events:none;opacity:0;z-index:5';
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
