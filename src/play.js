import { LAYER_ORDER } from './scene.js';
import { hash, fbm, noise, shade, mix, rgba, red, green, blue, col } from './pix.js';
import { sfx, setLoop } from './sound.js';

// One job being washed: holds how much mess is left on every pixel, how wet
// and foamy each pixel is, the leaves lying about, and draws it all.

export const VIEW_W = 320;
export const VIEW_H = 240;

export const TOOLS = {
  washer: { name: 'Washer', loop: 'water' },
  turbo: { name: 'Turbo', loop: 'turbo' },
  firehose: { name: 'Fire Hose', loop: 'fire' },
  cannon: { name: 'Hydro Cannon', loop: 'cannon' },
  soap: { name: 'Soap', loop: 'soap' },
  blower: { name: 'Blower', loop: 'blower' },
  sponge: { name: 'Sponge', loop: null },
};

// The water tools: spray radius, how hard they hit, which mess they cut
// (the cannon cuts like the turbo), how much they shake the screen and how
// hard they fling leaves about.
const NOZZLES = {
  washer: { r: 8, power: 1, grip: 'washer', mist: 3, chips: 1 },
  turbo: { r: 3.4, power: 3, grip: 'turbo', mist: 3, chips: 1 },
  firehose: { r: 15, power: 2, grip: 'washer', mist: 10, chips: 2.5, shake: 1.4, push: 420 },
  cannon: { r: 10, power: 4.5, grip: 'turbo', mist: 14, chips: 5, shake: 2.8, push: 900 },
};

const LEAF_COLORS = ['#c8642a', '#d9902e', '#b0461f', '#e0b23a', '#8a5a2a', '#9a8a2a'].map(col);
const LEAF_SHAPE = [];
for (let v = -2; v <= 2; v++) for (let u = -3; u <= 3; u++) if (Math.abs(v) <= 2 - Math.abs(u) / 2) LEAF_SHAPE.push([u, v]);
LEAF_SHAPE.push([4, 0]);

const FOAM = col('#f6fafc');
const FOAM_SHADE = col('#d9e6ee');
const CSS = (c) => `rgb(${red(c)},${green(c)},${blue(c)})`;

// How well each tool shifts each kind of mess (1 = normal).
function grip(type, tool, foamed) {
  let m = 1;
  if (type === 'oil' || type === 'grease') m = foamed ? 2.6 : 0.12;
  else if (type === 'gum') m = tool === 'turbo' ? 1 : 0.07;
  else if (type === 'paint') m = (tool === 'turbo' ? 1.3 : 0.45) * (foamed ? 1.8 : 1);
  else if (type === 'barnacles') m = tool === 'turbo' ? 1.6 : 0.45;
  else if (type === 'web') m = 3;
  else if (type === 'dust') m = 2;
  return foamed ? m * 1.25 : m;
}

export class Play {
  constructor(scene, canvas, { power = 1, wide = 0, hooks = {} } = {}) {
    this.s = scene;
    this.w = scene.w;
    this.h = scene.h;
    const n = this.w * this.h;
    this.n = n;
    this.base = scene.pix.data;
    this.part = scene.pix.part;
    this.layers = LAYER_ORDER.filter((k) => scene.layers.has(k)).map((k) => scene.layers.get(k));
    this.power = power;
    this.wide = wide;
    this.hooks = hooks;
    this.tool = 'washer';

    // Ragged edges: each pixel shows mess until its amount drops below a
    // noisy threshold, so dirt breaks up in clumps as it washes away.
    this.thr = new Uint8Array(n);
    this.foamThr = new Uint8Array(n);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        const e = Math.min(1, Math.max(0, fbm(x / 5, y / 5, 3, 77) * 1.5 - 0.25)) * 0.82 + hash(x, y, 78) * 0.18;
        this.thr[i] = 14 + e * 200;
        this.foamThr[i] = 30 + (noise(x / 2.2, y / 2.2, 79) * 0.6 + hash(x, y, 80) * 0.4) * 200;
      }
    }
    this.wet = new Uint8Array(n);
    this.foam = new Uint8Array(n);
    // Mess too thin to see doesn't count (and could never be found).
    for (const L of this.layers) for (let i = 0; i < n; i++) if (L.amount[i] <= this.thr[i]) L.amount[i] = 0;

    const P = scene.parts.length;
    this.partTotal = new Float64Array(P);
    this.partLeft = new Float64Array(P);
    this.partBox = Array.from({ length: P }, () => [Infinity, Infinity, -Infinity, -Infinity]);
    for (let i = 0; i < n; i++) {
      const p = this.part[i];
      if (!p) continue;
      const b = this.partBox[p];
      const x = i % this.w;
      const y = (i / this.w) | 0;
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
      for (const L of this.layers) this.partTotal[p] += L.amount[i];
    }
    this.partLeft.set(this.partTotal);

    // Side views: the ground is just under the lowest part of the object;
    // runoff and falling mud land there and form puddles.
    let lowest = 0;
    for (let i = 0; i < n; i++) if (this.part[i]) lowest = Math.max(lowest, (i / this.w) | 0);
    this.groundY = Math.min(this.h - 2, lowest + 1);
    this.puddle = new Float32Array(this.w);
    this.puddleDirt = new Float32Array(this.w);
    this.ripples = [];
    this.puddleTimer = 0;
    this.runoffCarry = 0;
    this.lastDirt = null;
    this.done = this.partTotal.map((t, p) => (p === 0 || t === 0 ? 1 : 0));
    this.dirtTotal = this.partTotal.reduce((a, b) => a + b, 0);

    this.leaves = scene.leafSpots.map(([x, y, k]) => ({
      x,
      y,
      vx: 0,
      vy: 0,
      rot: (k % 8) * 0.8,
      vr: 0,
      color: LEAF_COLORS[k % LEAF_COLORS.length],
    }));
    this.leafTotal = this.leaves.length;
    this.leafWeight = this.leafTotal ? (this.dirtTotal * 0.25) / this.leafTotal : 0;
    this.leavesDone = this.leafTotal === 0;

    this.sceneCanvas = document.createElement('canvas');
    this.sceneCanvas.width = this.w;
    this.sceneCanvas.height = this.h;
    this.sctx = this.sceneCanvas.getContext('2d');
    this.img = this.sctx.createImageData(this.w, this.h);
    this.out = new Uint32Array(this.img.data.buffer);
    this.compose(0, 0, this.w - 1, this.h - 1);
    this.flush();

    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.camX = 0;
    this.maxCam = Math.max(0, this.w - VIEW_W);
    this.pointer = { down: false, x: 0, y: 0, moved: 0 };
    this.particles = [];
    this.flashes = [];
    this.time = 0;
    this.dryTimer = 0;
    this.active = null; // box of pixels that are wet or foamy
    this.dirty = null; // box of pixels to redraw this frame
    this.finished = false;
    this.lastSound = 0;
    this.weak = null; // a kind of mess the current tool can barely shift
    this.chipRate = 1;
    this.shake = 0;
    this.kick = 0;
  }

  // ---------- bookkeeping ----------

  mark(box, x0, y0, x1, y1) {
    if (!this[box]) this[box] = [x0, y0, x1, y1];
    else {
      const b = this[box];
      if (x0 < b[0]) b[0] = x0;
      if (y0 < b[1]) b[1] = y0;
      if (x1 > b[2]) b[2] = x1;
      if (y1 > b[3]) b[3] = y1;
    }
  }

  progress() {
    let left = 0;
    for (let p = 1; p < this.partLeft.length; p++) left += this.done[p] ? 0 : this.partLeft[p];
    const total = this.dirtTotal + this.leafTotal * this.leafWeight;
    if (!total) return 1;
    return 1 - (left + this.leaves.length * this.leafWeight) / total;
  }

  partsList() {
    const list = [];
    for (let p = 1; p < this.s.parts.length; p++) {
      if (!this.partTotal[p]) continue;
      list.push({ name: this.s.parts[p].name, done: !!this.done[p], pct: 1 - this.partLeft[p] / this.partTotal[p] });
    }
    if (this.leafTotal) list.push({ name: 'Leaves', done: this.leavesDone, pct: 1 - this.leaves.length / this.leafTotal });
    return list;
  }

  // ---------- drawing the scene ----------

  // Which mess layer shows on pixel i (-1 for none).
  top(i) {
    if (i < 0 || i >= this.n) return -1;
    const { layers, thr } = this;
    for (let k = 0; k < layers.length; k++) if (layers[k].amount[i] > thr[i]) return k;
    return -1;
  }

  compose(x0, y0, x1, y1) {
    const { w, base, layers, wet, foam, foamThr, out } = this;
    for (let y = y0; y <= y1; y++) {
      let i = y * w + x0;
      for (let x = x0; x <= x1; x++, i++) {
        let c = base[i];
        const k = this.top(i);
        if (k >= 0) {
          c = layers[k].color[i];
          // Caked-on mess: a lit top-left rim and a dark bottom-right rim.
          const t = layers[k].def.thick;
          if (t) {
            if (this.top(i - w) < 0 || (x > 0 && this.top(i - 1) < 0)) c = shade(c, 1 + 0.3 * t);
            else if (this.top(i + w) < 0 || (x < w - 1 && this.top(i + 1) < 0)) c = shade(c, 1 - 0.38 * t);
          }
        } else if (y > 0) {
          // Clean surface just under a lump of mess sits in its shadow.
          const above = this.top(i - w);
          const t = above >= 0 ? layers[above].def.thick : x > 0 && this.top(i - w - 1) >= 0 ? layers[this.top(i - w - 1)].def.thick * 0.6 : 0;
          if (t) c = shade(c, 1 - 0.24 * t);
        }
        const wt = wet[i];
        if (wt) {
          const k = 1 - wt * 0.0011;
          c = rgba(red(c) * k, green(c) * k, Math.min(255, blue(c) * k + wt * 0.03));
        }
        const f = foam[i];
        if (f > foamThr[i]) c = f - foamThr[i] < 18 ? FOAM_SHADE : FOAM;
        out[i] = c;
      }
    }
    this.mark('pending', x0, y0, x1, y1);
  }

  flush() {
    const b = this.pending;
    if (!b) return;
    this.sctx.putImageData(this.img, 0, 0, b[0], b[1], b[2] - b[0] + 1, b[3] - b[1] + 1);
    this.pending = null;
  }

  // ---------- tools ----------

  // The washer and turbo nozzle: peel the top layer of mess off each pixel.
  spray(cx, cy, r, amount, tool) {
    const { w, h, part, layers, wet, foam } = this;
    let thickHit = 0;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(h - 1, Math.ceil(cy + r));
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 > r2) continue;
        const fall = 1 - d2 / r2;
        const i = y * w + x;
        // Things get wet; so does the ground in top-down jobs, but not the sky.
        if (part[i] || this.s.view === 'top') wet[i] = 255;
        const foamed = foam[i] > 40;
        if (foam[i]) foam[i] = Math.max(0, foam[i] - 1400 * amount * fall);
        const p = part[i];
        if (!p || this.done[p]) continue;
        for (let k = 0; k < layers.length; k++) {
          const L = layers[k];
          const a = L.amount[i];
          if (!a) continue;
          const g = grip(L.type, tool, foamed);
          if (g < 0.2) this.weak = L.type;
          const take = (fall * amount * 640 * g) / L.def.hard;
          const na = a - take <= this.thr[i] ? 0 : Math.floor(a - take); // looks clean = is clean
          L.amount[i] = na;
          this.partLeft[p] -= a - na;
          if (Math.random() < 0.012 * this.chipRate) this.chip(x, y, L.color[i]);
          if (L.def.thick >= 0.5) thickHit++;
          this.lastDirt = L.color[i];
          break;
        }
      }
    }
    this.mark('dirty', Math.max(0, x0 - 2), Math.max(0, y0 - 2), Math.min(w - 1, x1 + 2), Math.min(h - 1, y1 + 2));
    this.mark('active', x0, y0, x1, y1);
    this.nudgeLeaves(cx, cy, r + 5, 60);
    // Caked mess cracks off around the edge of the jet in clumps.
    if (thickHit) {
      const chance = Math.min(3, amount * 9 * this.chipRate);
      for (let k = Math.floor(chance) + (Math.random() < chance % 1 ? 1 : 0); k > 0; k--) this.breakChunk(cx, cy, r);
    }
  }

  breakChunk(cx, cy, r) {
    const { w, h, layers, thr } = this;
    const a = Math.random() * Math.PI * 2;
    const d = r * (0.7 + Math.random() * 0.6);
    const px = Math.round(cx + Math.cos(a) * d);
    const py = Math.round(cy + Math.sin(a) * d);
    if (px < 0 || py < 0 || px >= w || py >= h) return;
    const k = this.top(py * w + px);
    if (k < 0 || layers[k].def.thick < 0.5) return;
    const L = layers[k];
    const rr = 1.5 + Math.random() * 2.5;
    const bits = [];
    for (let y = Math.floor(py - rr); y <= py + rr; y++) {
      for (let x = Math.floor(px - rr); x <= px + rr; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h || (x - px) ** 2 + (y - py) ** 2 > rr * rr) continue;
        const i = y * w + x;
        const p = this.part[i];
        if (!p || this.done[p] || L.amount[i] <= thr[i]) continue;
        bits.push([x - px, y - py, shade(L.color[i], 0.9 + Math.random() * 0.2)]);
        this.partLeft[p] -= L.amount[i];
        L.amount[i] = 0;
      }
    }
    if (bits.length < 3) return;
    this.mark('dirty', Math.max(0, px - 6), Math.max(0, py - 6), Math.min(w - 1, px + 6), Math.min(h - 1, py + 6));
    const side = this.s.view === 'side';
    const out = Math.atan2(py - cy, px - cx);
    this.add({
      x: px,
      y: py,
      vx: Math.cos(out) * (side ? 25 : 90 + Math.random() * 60),
      vy: side ? -15 + Math.random() * 25 : Math.sin(out) * (90 + Math.random() * 60),
      g: side ? 420 : 0,
      drag: side ? 0 : 3.5,
      life: side ? 3 : 0.9,
      bits,
      lands: side,
      c: bits[0][2],
      size: 1,
    });
  }

  soap(cx, cy, dt) {
    const r = 13;
    const { w, h, foam } = this;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 > r * r) continue;
        const i = y * w + x;
        if (!this.part[i]) continue;
        foam[i] = Math.min(255, foam[i] + 1100 * dt * (1 - d2 / (r * r)) + 20);
      }
    }
    this.mark('dirty', x0, y0, x1, y1);
    this.mark('active', x0, y0, x1, y1);
  }

  scrub(cx, cy, dt, speed) {
    const k = Math.min(1, speed / 140);
    if (k < 0.05) return;
    const r = 10;
    const { w, h, part, layers, foam } = this;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 > r * r) continue;
        const fall = 1 - d2 / (r * r);
        const i = y * w + x;
        const p = part[i];
        if (!p || this.done[p]) continue;
        foam[i] = Math.min(255, foam[i] + 260 * dt * k);
        for (let j = 0; j < layers.length; j++) {
          const L = layers[j];
          const a = L.amount[i];
          if (!a) continue;
          const t = L.type;
          const m = t === 'food' ? 3.2 : t === 'grime' || t === 'grease' ? 2 : t === 'gum' || t === 'barnacles' ? 0.1 : 0.7;
          const take = (fall * k * dt * 520 * m) / L.def.hard;
          const na = a - take <= this.thr[i] ? 0 : Math.floor(a - take); // looks clean = is clean
          L.amount[i] = na;
          this.partLeft[p] -= a - na;
          break;
        }
      }
    }
    this.mark('dirty', x0, y0, x1, y1);
    this.mark('active', x0, y0, x1, y1);
    if (this.time - this.lastSound > 0.16) {
      sfx.squish();
      this.lastSound = this.time;
    }
  }

  blow(cx, cy, dt, fromX, fromY) {
    const len = Math.hypot(cx - fromX, cy - fromY) || 1;
    const ax = (cx - fromX) / len;
    const ay = (cy - fromY) / len;
    const R = 42;
    for (const leaf of this.leaves) {
      const dx = leaf.x - cx;
      const dy = leaf.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) continue;
      const f = (1 - d / R) * 1100 * dt;
      leaf.vx += (ax * 0.75 + (dx / d) * 0.6) * f;
      leaf.vy += (ay * 0.75 + (dy / d) * 0.6) * f;
      leaf.vr += (Math.random() - 0.5) * 30 * dt;
    }
    // Dust and cobwebs blow away too.
    const r = 15;
    const { w, h, part, layers } = this;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 > r * r) continue;
        const i = y * w + x;
        const p = part[i];
        if (!p || this.done[p]) continue;
        for (const L of layers) {
          const a = L.amount[i];
          if (!a) continue;
          if (!L.def.blow) break;
          const take = (1 - d2 / (r * r)) * dt * 700;
          const na = a - take <= this.thr[i] ? 0 : Math.floor(a - take); // looks clean = is clean
          L.amount[i] = na;
          this.partLeft[p] -= a - na;
          if (Math.random() < 0.02) this.puff(x, y, L.color[i]);
          break;
        }
      }
    }
    this.mark('dirty', x0, y0, x1, y1);
  }

  nudgeLeaves(cx, cy, R, strength) {
    for (const leaf of this.leaves) {
      const dx = leaf.x - cx;
      const dy = leaf.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) continue;
      leaf.vx += (dx / d) * strength * 0.1;
      leaf.vy += (dy / d) * strength * 0.1;
    }
  }

  // ---------- particles ----------

  add(p) {
    if (this.particles.length < 700) this.particles.push(p);
  }

  chip(x, y, c) {
    const a = Math.random() * Math.PI * 2;
    const v = 30 + Math.random() * 70;
    this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (this.s.view === 'side' ? 40 : 0), g: this.s.view === 'side' ? 260 : 0, life: 0.5, c, size: 1 + (Math.random() < 0.3 ? 1 : 0), fade: false });
  }

  puff(x, y, c) {
    this.add({ x, y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40 - 10, g: 0, life: 0.6, c, size: 2, fade: true });
  }

  mist(x, y, count = 3, speed = 1) {
    const side = this.s.view === 'side';
    for (let k = 0; k < count; k++) {
      const a = side ? -Math.PI / 2 + (Math.random() - 0.5) * 2.4 : Math.random() * Math.PI * 2;
      const v = (40 + Math.random() * 90) * speed;
      this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: side ? 300 : 0, life: 0.25 + Math.random() * 0.2, c: col(Math.random() < 0.5 ? '#ffffff' : '#bfe3f2'), size: 1 });
    }
  }

  // Something hit the ground under a side-view object.
  land(p) {
    const x = Math.round(p.x);
    if (p.bits) {
      // A clump of mud splats and breaks up.
      for (let k = 0; k < Math.min(8, p.bits.length); k++) {
        this.add({ x: p.x, y: this.groundY - 1, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60, g: 360, life: 0.4, c: p.bits[k][2], size: 1 });
      }
      this.puddleDirt[x] = Math.min(1, this.puddleDirt[x] + 0.25);
      this.puddle[x] += 0.05;
      if (Math.random() < 0.7) sfx.splat();
      return;
    }
    const water = p.runoff === false || p.dirty !== undefined ? 0.13 : 0.025;
    this.puddle[x] += water;
    if (p.dirty) this.puddleDirt[x] = Math.min(1, this.puddleDirt[x] + p.dirty * 0.05);
    if (Math.random() < 0.06) {
      this.ripples.push({ x, t: 0 });
      if (Math.random() < 0.25) sfx.plink();
    }
  }

  // ---------- frame ----------

  setTool(t) {
    this.tool = t;
  }

  update(dt) {
    this.time += dt;
    const ptr = this.pointer;
    const tx = ptr.x + this.camX;
    const ty = ptr.y;
    let loop = null;

    if (ptr.down && !this.finished) {
      // Spraying near the edge of the screen walks you along wide jobs.
      if (ptr.x < 40) this.camX -= (40 - ptr.x) * 4 * dt;
      if (ptr.x > VIEW_W - 40) this.camX += (ptr.x - (VIEW_W - 40)) * 4 * dt;
      this.camX = Math.max(0, Math.min(this.maxCam, this.camX));

      const t = this.tool;
      const nz = NOZZLES[t];
      if (nz) {
        const r = nz.r * (t === 'washer' ? 1 + this.wide * 0.3 : 1);
        this.chipRate = nz.chips;
        this.spray(tx, ty, r, nz.power * this.power * dt, nz.grip);
        this.mist(tx, ty, nz.mist + 2, nz.shake ? 1.6 : 1.2);
        if (nz.push) this.nudgeLeaves(tx, ty, r + 24, nz.push);
        if (this.s.view === 'side') {
          // Water streams down the surface from where the jet hits.
          this.runoffCarry += dt * (20 + nz.power * 14);
          for (; this.runoffCarry >= 1; this.runoffCarry--) {
            const x = tx + (Math.random() - 0.5) * r * 1.6;
            const water = col('#9cc4d8');
            this.add({ x, y: ty + r * 0.5, vx: 0, vy: 26 + Math.random() * 34, g: 0, life: 5, c: this.lastDirt ? mix(water, this.lastDirt, 0.55) : water, size: 1, runoff: true, dirty: this.lastDirt ? 0.5 : 0 });
          }
          this.lastDirt = null;
        }
        if (nz.shake) {
          this.shake = Math.max(this.shake, nz.shake);
          this.kick = Math.min(1, this.kick + dt * 6);
        }
        loop = TOOLS[t].loop;
      } else if (t === 'soap') {
        this.soap(tx, ty, dt);
        loop = 'soap';
        for (let k = 0; k < 2; k++) this.add({ x: tx + (Math.random() - 0.5) * 16, y: ty + (Math.random() - 0.5) * 16, vx: 0, vy: 0, g: 0, life: 0.3, c: FOAM, size: 2 });
      } else if (t === 'blower') {
        const origin = this.toolOrigin();
        this.blow(tx, ty, dt, origin[0] + this.camX, origin[1]);
        loop = 'blower';
      } else if (t === 'sponge') {
        this.scrub(tx, ty, dt, ptr.moved / dt);
      }
    }
    ptr.moved = 0;
    setLoop(loop);
    if (!ptr.down || !NOZZLES[this.tool]?.shake) {
      this.shake *= Math.exp(-dt * 12);
      this.kick *= Math.exp(-dt * 10);
    }

    // Leaves drift and slide to a stop; off the edge means gone.
    for (let k = this.leaves.length - 1; k >= 0; k--) {
      const leaf = this.leaves[k];
      leaf.x += leaf.vx * dt;
      leaf.y += leaf.vy * dt;
      leaf.rot += leaf.vr * dt;
      const damp = Math.exp(-dt * 2.4);
      leaf.vx *= damp;
      leaf.vy *= damp;
      leaf.vr *= damp;
      if (leaf.x < -8 || leaf.y < -8 || leaf.x > this.w + 8 || leaf.y > this.h + 8) {
        this.leaves.splice(k, 1);
        if (Math.random() < 0.6) sfx.leaf();
      }
    }
    if (!this.leavesDone && this.leaves.length === 0) {
      this.leavesDone = true;
      sfx.ding();
      this.hooks.part?.('Leaves');
    }

    const side = this.s.view === 'side';
    for (let k = this.particles.length - 1; k >= 0; k--) {
      const p = this.particles[k];
      p.life -= dt;
      p.vy += p.g * dt;
      if (p.drag) {
        const d = Math.exp(-dt * p.drag);
        p.vx *= d;
        p.vy *= d;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.runoff) {
        const i = (p.y | 0) * this.w + (p.x | 0);
        if (p.y < this.h && this.part[i]) {
          // Still running down the object: leave a wet trail, wander a little.
          this.wet[i] = Math.max(this.wet[i], 230);
          this.mark('dirty', p.x | 0, p.y | 0, p.x | 0, p.y | 0);
          this.mark('active', p.x | 0, p.y | 0, p.x | 0, p.y | 0);
          p.vx = (Math.random() - 0.5) * 12;
        } else {
          // Off the bottom edge: now it falls.
          p.runoff = false;
          p.g = 520;
          p.lands = true;
          p.vx = 0;
        }
      }
      if (side && (p.lands || p.g > 0) && p.y >= this.groundY && p.x >= 0 && p.x < this.w) {
        this.land(p);
        p.life = 0;
      }
      if (p.life <= 0) this.particles.splice(k, 1);
    }

    // Puddles spread out and slowly soak away.
    this.puddleTimer += dt;
    if (side && this.puddleTimer > 0.1) {
      this.puddleTimer = 0;
      const pu = this.puddle;
      const next = new Float32Array(pu.length);
      for (let x = 0; x < pu.length; x++) {
        const l = pu[x - 1] ?? pu[x];
        const r = pu[x + 1] ?? pu[x];
        next[x] = Math.max(0, (pu[x] * 0.6 + (l + r) * 0.2) * 0.997 - 0.0004);
      }
      this.puddle = next;
    }
    for (let k = this.ripples.length - 1; k >= 0; k--) {
      this.ripples[k].t += dt;
      if (this.ripples[k].t > 0.5) this.ripples.splice(k, 1);
    }

    // Wet spots dry and foam slowly pops.
    this.dryTimer += dt;
    if (this.dryTimer > 0.2 && this.active) {
      const steps = Math.floor(this.dryTimer / 0.2);
      this.dryTimer -= steps * 0.2;
      const [x0, y0, x1, y1] = this.active;
      let any = false;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * this.w + x;
          if (this.wet[i]) {
            this.wet[i] = Math.max(0, this.wet[i] - 7 * steps);
            any = true;
          }
          if (this.foam[i]) {
            this.foam[i] = Math.max(0, this.foam[i] - 3 * steps);
            any = true;
          }
        }
      }
      this.mark('dirty', x0, y0, x1, y1);
      if (!any) this.active = null;
    }

    this.checkParts();

    for (let k = this.flashes.length - 1; k >= 0; k--) {
      this.flashes[k].t += dt;
      if (this.flashes[k].t > 0.6) this.flashes.splice(k, 1);
    }

    if (this.dirty) {
      const [x0, y0, x1, y1] = this.dirty;
      this.compose(x0, y0, x1, y1);
      this.dirty = null;
    }
    this.flush();
  }

  // A part counts as clean at 98%; the last specks are wiped for you.
  checkParts() {
    // At 98% overall, whatever specks are left wash away too.
    const nearlyAll = this.progress() >= 0.98;
    for (let p = 1; p < this.partLeft.length; p++) {
      if (this.done[p] || (!nearlyAll && this.partLeft[p] > this.partTotal[p] * 0.02)) continue;
      this.done[p] = 1;
      this.partLeft[p] = 0;
      const [x0, y0, x1, y1] = this.partBox[p];
      const edge = [];
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * this.w + x;
          if (this.part[i] !== p) continue;
          for (const L of this.layers) L.amount[i] = 0;
          if (this.part[i - 1] !== p || this.part[i + 1] !== p || this.part[i - this.w] !== p || this.part[i + this.w] !== p) edge.push(i);
        }
      }
      this.compose(x0, y0, x1, y1);
      this.flashes.push({ edge, t: 0 });
      sfx.ding();
      this.hooks.part?.(this.s.parts[p].name);
    }
    if (!this.finished && this.leavesDone && this.done.every((d) => d)) {
      this.finished = true;
      setLoop(null);
      this.hooks.done?.();
    }
  }

  toolOrigin() {
    return [VIEW_W - 22, VIEW_H + 8];
  }

  render() {
    const ctx = this.ctx;
    const cam = Math.round(this.camX);
    // Big hoses rattle the whole view.
    const sx = this.shake > 0.2 ? Math.round((Math.random() - 0.5) * this.shake * 2) : 0;
    const sy = this.shake > 0.2 ? Math.round((Math.random() - 0.5) * this.shake * 2) : 0;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.drawImage(this.sceneCanvas, cam - 4, 0, VIEW_W + 8, VIEW_H, -4, 0, VIEW_W + 8, VIEW_H);

    const top = this.s.view === 'top';
    for (const leaf of this.leaves) {
      const ca = Math.cos(leaf.rot);
      const sa = Math.sin(leaf.rot);
      if (top) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (const [u, v] of LEAF_SHAPE) ctx.fillRect(Math.round(leaf.x - cam + u * ca - v * sa) + 1, Math.round(leaf.y + u * sa + v * ca) + 1, 1, 1);
      }
      ctx.fillStyle = CSS(leaf.color);
      for (const [u, v] of LEAF_SHAPE) ctx.fillRect(Math.round(leaf.x - cam + u * ca - v * sa), Math.round(leaf.y + u * sa + v * ca), 1, 1);
      ctx.fillStyle = CSS(shade(leaf.color, 0.7));
      ctx.fillRect(Math.round(leaf.x - cam), Math.round(leaf.y), 1, 1);
    }

    // Puddles under side-view objects, tinted by the mud washed into them.
    if (this.s.view === 'side') {
      const gy = this.groundY;
      for (let x = Math.max(0, cam); x < Math.min(this.w, cam + VIEW_W); x++) {
        const a = this.puddle[x];
        if (a < 0.03) continue;
        const depth = a > 1 ? 4 : a > 0.5 ? 3 : a > 0.2 ? 2 : 1;
        const tint = mix(col('#8fb3c8'), col('#6b4a2b'), Math.min(0.85, this.puddleDirt[x]));
        ctx.globalAlpha = Math.min(0.9, 0.4 + a);
        ctx.fillStyle = CSS(tint);
        ctx.fillRect(x - cam, gy - depth + 1, 1, depth);
        ctx.fillStyle = CSS(mix(tint, col('#e6f3fa'), 0.55));
        ctx.fillRect(x - cam, gy - depth + 1, 1, 1);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (const r of this.ripples) {
        const d = Math.round(1 + r.t * 10);
        ctx.fillRect(r.x - cam - d, this.groundY - 1, 1, 1);
        ctx.fillRect(r.x - cam + d, this.groundY - 1, 1, 1);
      }
    }

    // Wet surfaces catch the light.
    const wetLook = this.s.view === 'top';
    for (let k = 0; k < 60; k++) {
      const x = cam + Math.floor(Math.random() * VIEW_W);
      const y = Math.floor(Math.random() * VIEW_H);
      if (x >= this.w) continue;
      const i = y * this.w + x;
      if (this.wet[i] < 140 || (!wetLook && !this.part[i])) continue;
      ctx.globalAlpha = (this.wet[i] / 255) * 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - cam, y, 1, 1);
    }
    ctx.globalAlpha = 1;

    for (const p of this.particles) {
      if (p.bits) {
        ctx.globalAlpha = p.lands ? 1 : Math.max(0, Math.min(1, p.life / 0.4));
        for (const [dx, dy, c] of p.bits) {
          ctx.fillStyle = CSS(c);
          ctx.fillRect(Math.round(p.x + dx - cam), Math.round(p.y + dy), 1, 1);
        }
        continue;
      }
      ctx.globalAlpha = p.fade ? Math.max(0, p.life / 0.6) : 1;
      ctx.fillStyle = CSS(p.c);
      ctx.fillRect(Math.round(p.x - cam), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    for (const f of this.flashes) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 0.6);
      ctx.fillStyle = '#ffffff';
      for (const i of f.edge) ctx.fillRect((i % this.w) - cam, (i / this.w) | 0, 1, 1);
    }
    ctx.globalAlpha = 1;

    // Arrows hinting there's more of the job off screen.
    if (this.maxCam > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      const bob = Math.round(Math.sin(this.time * 4) * 2);
      if (cam > 2) for (let k = 0; k < 5; k++) ctx.fillRect(6 + Math.abs(k - 2) + bob, 116 + k, 2, 1);
      if (cam < this.maxCam - 2) for (let k = 0; k < 5; k++) ctx.fillRect(VIEW_W - 8 - Math.abs(k - 2) - bob, 116 + k, 2, 1);
    }

    this.drawTool();
    ctx.restore();
  }

  drawTool() {
    const ctx = this.ctx;
    const ptr = this.pointer;
    const [ax, ay] = this.toolOrigin();
    const tx = ptr.down ? ptr.x : VIEW_W - 90;
    const ty = ptr.down ? ptr.y : VIEW_H - 60;
    const t = this.tool;
    const line = (x0, y0, x1, y1, w, color) => {
      ctx.fillStyle = color;
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      for (let k = 0; k <= n; k++) {
        const x = x0 + ((x1 - x0) * k) / n;
        const y = y0 + ((y1 - y0) * k) / n;
        ctx.fillRect(Math.round(x - w / 2), Math.round(y - w / 2), w, w);
      }
    };
    if (t === 'sponge') {
      const bob = ptr.down ? Math.round(Math.sin(this.time * 30) * 1) : 0;
      ctx.fillStyle = '#f2c94c';
      ctx.fillRect(tx - 9 + bob, ty - 6, 18, 11);
      ctx.fillStyle = '#3f9a52';
      ctx.fillRect(tx - 9 + bob, ty + 3, 18, 3);
      ctx.fillStyle = '#d9ad35';
      for (const [x, y] of [[-5, -3], [2, -2], [5, -4], [-1, 0]]) ctx.fillRect(tx + x + bob, ty + y, 2, 2);
      return;
    }
    const dx = tx - ax;
    const dy = ty - ay;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const reach = t === 'blower' ? 64 : 78;
    const tipX = ax + ux * Math.min(reach, len - 6);
    const tipY = ay + uy * Math.min(reach, len - 6);

    const big = t === 'firehose' || t === 'cannon';
    if (ptr.down && (t === 'washer' || t === 'turbo' || t === 'soap' || big)) {
      // The jet: a jittery bright line from the nozzle to the spot.
      const n = Math.ceil(Math.hypot(tx - tipX, ty - tipY));
      const width = t === 'turbo' ? 1 : t === 'soap' ? 3 : t === 'firehose' ? 5 : t === 'cannon' ? 7 : 2;
      for (let k = 0; k < n; k += 1) {
        const f = k / n;
        const jitter = (Math.random() - 0.5) * (t === 'soap' ? 3 : big ? 4 : 1.2) * f;
        const x = tipX + (tx - tipX) * f - uy * jitter;
        const y = tipY + (ty - tipY) * f + ux * jitter;
        if (t !== 'soap' && Math.random() < 0.12) continue;
        ctx.fillStyle = t === 'soap' ? (k % 3 ? '#f6fafc' : '#d9e6ee') : k % 4 ? '#e9f7ff' : '#9fd7f0';
        const s = width + ((t === 'washer' || big) && f > 0.7 ? (big ? 3 : 1) : 0);
        ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      }
      if (big) {
        // A bright core down the middle and a burst where it lands.
        ctx.fillStyle = '#ffffff';
        for (let k = 0; k < n; k += 2) {
          const f = k / n;
          ctx.fillRect(Math.round(tipX + (tx - tipX) * f), Math.round(tipY + (ty - tipY) * f), 2, 2);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        const rr = (t === 'cannon' ? 12 : 16) + Math.random() * 4;
        for (let a = 0; a < Math.PI * 2; a += 0.35) ctx.fillRect(Math.round(tx + Math.cos(a) * rr), Math.round(ty + Math.sin(a) * rr * 0.7), 2, 2);
      }
    }

    if (big) {
      // Pulled back a little by the force of the water.
      const back = this.kick * 5 + (ptr.down ? Math.random() * 2 : 0);
      const bx = tipX - ux * back;
      const by = tipY - uy * back;
      if (t === 'firehose') {
        line(ax + 18, ay + 18, ax + ux * 10, ay + uy * 10, 9, '#a8221f');
        line(ax + ux * 10, ay + uy * 10, bx - ux * 10, by - uy * 10, 8, '#c8322e');
        line(ax + ux * 10, ay + uy * 10, bx - ux * 10, by - uy * 10, 2, '#e8605a');
        line(bx - ux * 14, by - uy * 14, bx, by, 9, '#d6a53a');
        line(bx - ux * 4, by - uy * 4, bx, by, 11, '#b8862a');
      } else {
        line(ax - ux * 6, ay - uy * 6, bx, by, 15, '#3a3f48');
        line(ax - ux * 4, ay - uy * 4, bx - ux * 2, by - uy * 2, 4, '#5a616d');
        for (const f of [0.25, 0.55, 0.85]) {
          const cx = ax + (bx - ax) * f;
          const cy = ay + (by - ay) * f;
          line(cx - ux * 2, cy - uy * 2, cx + ux * 2, cy + uy * 2, 17, '#e8742a');
        }
        line(bx - ux * 5, by - uy * 5, bx, by, 19, '#2a2d33');
      }
      ctx.fillStyle = '#d99a6c';
      ctx.fillRect(Math.round(ax - 6), Math.round(ay - 14), 12, 10);
      return;
    }

    if (t === 'blower') {
      line(ax - ux * 6, ay - uy * 6, ax + ux * 22, ay + uy * 22, 14, '#e8742a');
      line(ax + ux * 4, ay + uy * 4, ax + ux * 18, ay + uy * 18, 6, '#2a2a2e');
      line(ax + ux * 20, ay + uy * 20, tipX, tipY, 6, '#3a3b40');
      line(tipX - ux * 2, tipY - uy * 2, tipX, tipY, 7, '#55575d');
      if (ptr.down) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (let k = 0; k < 6; k++) {
          const f = (this.time * 3 + k / 6) % 1;
          const sx = tipX + (tx - tipX) * f + (Math.random() - 0.5) * 10 * f;
          const sy = tipY + (ty - tipY) * f + (Math.random() - 0.5) * 10 * f;
          ctx.fillRect(Math.round(sx), Math.round(sy), 3, 1);
        }
      }
      return;
    }
    // Pressure washer gun (or soap cannon): body, lance, coloured nozzle.
    line(ax + ux * 14, ay + uy * 14, tipX, tipY, 3, '#9aa2ab');
    line(ax + ux * 14, ay + uy * 14, tipX, tipY, 1, '#d5dbe1');
    line(tipX - ux * 4, tipY - uy * 4, tipX, tipY, 5, t === 'turbo' ? '#1d1d22' : t === 'soap' ? '#3fa0e0' : '#d8323a');
    line(ax - ux * 8, ay - uy * 8, ax + ux * 16, ay + uy * 16, 11, '#2a6fe8');
    line(ax - ux * 6, ay - uy * 6, ax + ux * 14, ay + uy * 14, 3, '#5d95f0');
    if (t === 'soap') line(ax + ux * 2 - uy * 8, ay + uy * 2 + ux * 8, ax + ux * 12 - uy * 8, ay + uy * 12 + ux * 8, 8, '#f4f4f0');
    ctx.fillStyle = '#d99a6c';
    ctx.fillRect(Math.round(ax - 5), Math.round(ay - 12), 10, 9);
  }
}
