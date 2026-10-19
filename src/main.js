import { JOBS } from './jobs.js';
import { LAYER_ORDER, DIRT } from './scene.js';
import { Play, VIEW_W, VIEW_H, TOOLS } from './play.js';
import { unlock, sfx, setLoop, setMuted, isMuted } from './sound.js';

// Screens: the job board, the shop, and a job in progress. Money comes from
// finishing jobs and buys new tools and upgrades.

const SAVE_KEY = 'splash-wash-2d';

const SHOP = [
  { id: 'sponge', name: 'Sponge', price: 50, about: 'Scrub food and grime off plates and tables.' },
  { id: 'blower', name: 'Leaf Blower', price: 90, about: 'Blast leaves off driveways and decks. Blows dust and cobwebs away too.' },
  { id: 'turbo', name: 'Turbo Nozzle', price: 120, about: 'A tight, hard jet for gum, graffiti and barnacles.' },
  { id: 'soap', name: 'Soap Cannon', price: 200, about: 'Foam up oil and grease so they wash right off.' },
  { id: 'power2', name: 'Pump Upgrade I', price: 250, about: 'Washer hits 50% harder.' },
  { id: 'wide', name: 'Wide Fan Tip', price: 300, about: 'Wider spray from the washer.' },
  { id: 'power3', name: 'Pump Upgrade II', price: 600, about: 'Washer hits twice as hard.', needs: 'power2' },
  { id: 'power4', name: 'Pump Upgrade III', price: 1400, about: 'The strongest pump money can buy.', needs: 'power3' },
];

// ---------- save ----------

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && typeof s.money === 'number') return { owned: [], done: {}, best: {}, ...s };
  } catch {
    // Storage can be blocked; play still works, it just won't remember.
  }
  return { money: 0, owned: [], done: {}, best: {} };
}

const save = load();

function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // See load().
  }
}

const owns = (id) => save.owned.includes(id);
const power = () => (owns('power4') ? 3.2 : owns('power3') ? 2.2 : owns('power2') ? 1.5 : 1);
const unlocked = (i) => i < 2 || save.done[JOBS[i - 1].id] || (i > 1 && save.done[JOBS[i - 2].id]);

// ---------- layout ----------

const stage = document.getElementById('stage');
const view = document.getElementById('view');

function layout() {
  const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  const scale = s >= 2 ? Math.floor(s) : s;
  stage.style.width = `${VIEW_W * scale}px`;
  stage.style.height = `${VIEW_H * scale}px`;
  stage.style.setProperty('--u', `${scale}px`);
}

window.addEventListener('resize', layout);
layout();

const $ = (id) => document.getElementById(id);
const show = (el, on) => el.classList.toggle('hidden', !on);

function money() {
  for (const el of document.querySelectorAll('.money')) el.textContent = `$${save.money}`;
}

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 1600);
}

// ---------- tool icons ----------

function icon(tool) {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const g = c.getContext('2d');
  const r = (x, y, w, h, color) => {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  };
  if (tool === 'washer' || tool === 'turbo' || tool === 'soap' || tool === 'pump') {
    r(2, 7, 7, 5, '#2a6fe8');
    r(3, 8, 5, 1, '#5d95f0');
    r(4, 12, 3, 3, '#d99a6c');
    r(9, 8, 5, 2, '#9aa2ab');
    r(13, 7, 2, 4, tool === 'turbo' ? '#1d1d22' : tool === 'soap' ? '#3fa0e0' : '#d8323a');
    if (tool === 'soap') {
      r(3, 3, 4, 4, '#f4f4f0');
      r(10, 2, 2, 2, '#ffffff');
      r(13, 3, 2, 2, '#d9e6ee');
    }
    if (tool === 'turbo' || tool === 'pump') {
      r(10, 2, 2, 2, '#f2c21b');
      r(12, 4, 2, 2, '#f2c21b');
    }
  } else if (tool === 'blower') {
    r(1, 6, 7, 7, '#e8742a');
    r(2, 7, 5, 2, '#f39a55');
    r(7, 8, 8, 3, '#3a3b40');
    r(3, 13, 3, 2, '#2a2a2e');
    r(11, 3, 3, 3, '#c8642a');
  } else if (tool === 'sponge') {
    r(2, 4, 12, 7, '#f2c94c');
    r(2, 11, 12, 2, '#3f9a52');
    r(4, 6, 2, 2, '#d9ad35');
    r(9, 5, 2, 2, '#d9ad35');
  } else if (tool === 'wide') {
    r(2, 7, 7, 5, '#2a6fe8');
    r(9, 8, 3, 2, '#9aa2ab');
    r(12, 4, 2, 10, '#d8323a');
    r(14, 2, 1, 4, '#9fd7f0');
    r(14, 12, 1, 4, '#9fd7f0');
  }
  return c;
}

// ---------- the job board ----------

const thumbs = new Map();

function thumbnail(job) {
  if (thumbs.has(job.id)) return thumbs.get(job.id);
  const s = job.build();
  const layers = LAYER_ORDER.filter((k) => s.layers.has(k)).map((k) => s.layers.get(k));
  const full = document.createElement('canvas');
  full.width = s.w;
  full.height = s.h;
  const g = full.getContext('2d');
  const img = g.createImageData(s.w, s.h);
  const out = new Uint32Array(img.data.buffer);
  for (let i = 0; i < out.length; i++) {
    let c = s.pix.data[i];
    for (const L of layers) {
      if (L.amount[i] > 90) {
        c = L.color[i];
        break;
      }
    }
    out[i] = c;
  }
  g.putImageData(img, 0, 0);
  const t = document.createElement('canvas');
  t.width = 96;
  t.height = 72;
  t.getContext('2d').drawImage(full, Math.max(0, (s.w - 320) / 2), 0, 320, 240, 0, 0, 96, 72);
  thumbs.set(job.id, t);
  return t;
}

function renderBoard() {
  money();
  const grid = $('grid');
  grid.replaceChildren();
  JOBS.forEach((job, i) => {
    const open = unlocked(i);
    const card = document.createElement('button');
    card.className = `card${open ? '' : ' locked'}${save.done[job.id] ? ' done' : ''}`;
    const frame = document.createElement('div');
    frame.className = 'thumb';
    const name = document.createElement('b');
    name.textContent = open ? job.name : 'Locked';
    const pay = document.createElement('span');
    pay.textContent = save.done[job.id] ? `Done · $${Math.round(job.pay * 0.4)}` : `$${job.pay}`;
    card.append(frame, name, pay);
    card.addEventListener('click', () => {
      unlock();
      if (!open) {
        sfx.nope();
        toast('Finish the jobs before this one');
        return;
      }
      sfx.click();
      startJob(i);
    });
    grid.append(card);
    // Thumbnails are drawn a few at a time so the board shows up at once.
    setTimeout(() => {
      const t = thumbnail(job);
      const copy = document.createElement('canvas');
      copy.width = t.width;
      copy.height = t.height;
      copy.getContext('2d').drawImage(t, 0, 0);
      frame.append(copy);
    }, 20 + i * 15);
  });
}

function renderShop() {
  money();
  const list = $('shop-list');
  list.replaceChildren();
  for (const item of SHOP) {
    const have = owns(item.id);
    const blocked = item.needs && !owns(item.needs);
    const row = document.createElement('div');
    row.className = 'item';
    const ic = icon(item.id.startsWith('power') ? 'pump' : item.id);
    ic.className = 'icon';
    const text = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = item.name;
    const about = document.createElement('span');
    about.textContent = item.about;
    text.append(title, about);
    const buy = document.createElement('button');
    buy.className = 'buy';
    buy.textContent = have ? 'Owned' : blocked ? 'Locked' : `$${item.price}`;
    buy.disabled = have || blocked;
    buy.addEventListener('click', () => {
      unlock();
      if (save.money < item.price) {
        sfx.nope();
        toast(`Need $${item.price - save.money} more`);
        return;
      }
      save.money -= item.price;
      save.owned.push(item.id);
      persist();
      sfx.cash();
      renderShop();
    });
    row.append(ic, text, buy);
    list.append(row);
  }
}

function screen(name) {
  show($('board'), name === 'board');
  show($('shop'), name === 'shop');
  show($('hud'), name === 'play');
  show($('tools'), name === 'play');
  show($('parts'), name === 'play');
  if (name !== 'play') show($('hint'), false);
  if (name === 'board') renderBoard();
  if (name === 'shop') renderShop();
}

$('open-shop').addEventListener('click', () => {
  unlock();
  sfx.click();
  screen('shop');
});
$('close-shop').addEventListener('click', () => {
  sfx.click();
  screen('board');
});

// ---------- playing a job ----------

let play = null;
let jobIndex = -1;
let jobTime = 0;
let lastWeak = -10;

function toolBelt() {
  const belt = $('tools');
  belt.replaceChildren();
  const tools = ['washer', 'turbo', 'soap', 'blower', 'sponge'].filter((t) => t === 'washer' || owns(t));
  for (const t of tools) {
    const b = document.createElement('button');
    b.className = `tool${play.tool === t ? ' on' : ''}`;
    b.setAttribute('aria-label', TOOLS[t].name);
    b.append(icon(t));
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      unlock();
      sfx.click();
      play.setTool(t);
      toolBelt();
    });
    belt.append(b);
  }
}

function renderParts() {
  const list = play.partsList();
  const doneCount = list.filter((p) => p.done).length;
  $('parts-head').textContent = `Parts ${doneCount}/${list.length}`;
  const body = $('parts-list');
  body.replaceChildren();
  for (const p of list) {
    const row = document.createElement('div');
    row.className = p.done ? 'ok' : '';
    row.textContent = `${p.done ? '✓' : `${Math.floor(p.pct * 100)}%`} ${p.name}`;
    body.append(row);
  }
}

function startJob(i) {
  jobIndex = i;
  const job = JOBS[i];
  play = new Play(job.build(), view, {
    power: power(),
    wide: owns('wide') ? 1 : 0,
    hooks: {
      part: (name) => {
        toast(`${name} ✓`);
        renderParts();
      },
      done: () => setTimeout(finishJob, 900),
    },
  });
  jobTime = 0;
  lastWeak = -10;
  $('job-name').textContent = job.name;
  screen('play');
  toolBelt();
  renderParts();
  show($('hint'), i === 0 && !save.done[job.id]);
}

function finishJob() {
  if (!play) return;
  const job = JOBS[jobIndex];
  const first = !save.done[job.id];
  const pay = first ? job.pay : Math.round(job.pay * 0.4);
  save.money += pay;
  save.done[job.id] = true;
  save.best[job.id] = Math.min(save.best[job.id] ?? Infinity, Math.round(jobTime));
  persist();
  sfx.fanfare();
  setTimeout(() => sfx.cash(), 700);
  const m = Math.floor(jobTime / 60);
  const s = String(Math.floor(jobTime % 60)).padStart(2, '0');
  $('result-name').textContent = job.name;
  $('result-pay').textContent = `+$${pay}`;
  $('result-time').textContent = `Time ${m}:${s}`;
  show($('result-next'), jobIndex + 1 < JOBS.length && unlocked(jobIndex + 1));
  show($('result'), true);
  money();
}

$('result-next').addEventListener('click', () => {
  sfx.click();
  show($('result'), false);
  startJob(jobIndex + 1);
});
$('result-board').addEventListener('click', () => {
  sfx.click();
  show($('result'), false);
  play = null;
  screen('board');
});
$('home').addEventListener('click', () => {
  sfx.click();
  setLoop(null);
  play = null;
  screen('board');
});
$('parts-head').addEventListener('click', () => {
  $('parts').classList.toggle('open');
  if (play) renderParts();
});

const muteBtn = $('mute');
muteBtn.addEventListener('click', () => {
  unlock();
  setMuted(!isMuted());
  muteBtn.classList.toggle('off', isMuted());
});

// ---------- input ----------

const pointers = new Map();

function toGame(e) {
  const r = view.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * VIEW_W, ((e.clientY - r.top) / r.height) * VIEW_H];
}

view.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  unlock();
  if (!play || play.finished) return;
  view.setPointerCapture?.(e.pointerId);
  const [x, y] = toGame(e);
  pointers.set(e.pointerId, { x, y });
  if (pointers.size === 1) Object.assign(play.pointer, { down: true, x, y, moved: 0 });
  else play.pointer.down = false;
  show($('hint'), false);
});

view.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p || !play) return;
  const [x, y] = toGame(e);
  const dx = x - p.x;
  p.x = x;
  p.y = y;
  if (pointers.size === 1) {
    play.pointer.moved += Math.hypot(x - play.pointer.x, y - play.pointer.y);
    play.pointer.x = x;
    play.pointer.y = y;
  } else {
    // Two fingers slide along wide jobs.
    play.camX = Math.max(0, Math.min(play.maxCam, play.camX - dx / pointers.size));
  }
});

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  view.addEventListener(type, (e) => {
    pointers.delete(e.pointerId);
    if (play && pointers.size === 0) play.pointer.down = false;
  });
}

for (const type of ['gesturestart', 'gesturechange', 'contextmenu', 'dblclick']) {
  document.addEventListener(type, (e) => e.preventDefault());
}
document.addEventListener('touchmove', (e) => {
  if (!e.target.closest('.scroll')) e.preventDefault();
}, { passive: false });

// ---------- loop ----------

let last = performance.now();
let hudTick = 0;

const manual = new URLSearchParams(location.search).has('manual');

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (play && !manual) step(dt);
  requestAnimationFrame(frame);
}

function step(dt) {
  if (!play.finished) jobTime += dt;
  play.update(dt);
  play.render();
  hudTick += dt;
  if (hudTick < 0.1) return;
  hudTick = 0;
  const p = play.progress();
  $('bar-fill').style.transform = `scaleX(${p})`;
  $('pct').textContent = `${Math.floor(p * 100)}%`;
  if ($('parts').classList.contains('open')) renderParts();
  // When the jet isn't shifting something, say which tool would.
  if (play.weak && play.time - lastWeak > 6) {
    lastWeak = play.time;
    const turbo = play.weak === 'gum' || play.weak === 'barnacles' || play.weak === 'paint';
    const need = turbo ? 'turbo' : 'soap';
    const name = DIRT[play.weak].name;
    if (owns(need)) toast(turbo ? `${name}: try the turbo nozzle` : `${name}: foam it with soap first`);
    else toast(`${name} is tough. Get the ${turbo ? 'Turbo Nozzle' : 'Soap Cannon'} in the shop`);
  }
  play.weak = null;
}

screen('board');
requestAnimationFrame(frame);

// Test hooks (open with ?debug).
if (new URLSearchParams(location.search).has('debug')) {
  window.__wash = {
    get play() { return play; },
    get save() { return save; },
    startJob,
    finishJob,
    step(dt) {
      if (play) step(dt);
    },
  };
}
