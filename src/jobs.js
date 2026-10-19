import { Scene } from './scene.js';
import { col, shade, mix, hash, fbm, noise, ballShade } from './pix.js';
import {
  sky, clouds, treeLine, grass, concrete, slabs, planks, bricks, siding, glass, windowPane,
  wheel, groundShadow, text, textWidth, yard, street,
} from './art.js';

// Every job: a scene to draw, the parts that make it up, and the mess on it.

const C = (h) => col(h);
// Vertical shading for upright surfaces: lighter at the top.
const vshade = (base, y0, y1, top = 1.1, bottom = 0.82) => (x, y) =>
  shade(C(base), top + ((y - y0) / Math.max(1, y1 - y0)) * (bottom - top) + (hash(x, y, 2) - 0.5) * 0.04);
const lower = (y0, y1, k = 1) => (x, y) => Math.max(0, Math.min(1, (y - y0) / (y1 - y0))) * k;

// ---------- the football ----------

const PHI = (1 + Math.sqrt(5)) / 2;
const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((a) => a / l);
};
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const ICO = [
  [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0],
  [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1],
].map(norm);
const FACES = [];
for (let i = 0; i < 12; i++) {
  for (let j = i + 1; j < 12; j++) {
    for (let k = j + 1; k < 12; k++) {
      if (dot3(ICO[i], ICO[j]) > 0.4 && dot3(ICO[j], ICO[k]) > 0.4 && dot3(ICO[i], ICO[k]) > 0.4) {
        FACES.push(norm([0, 1, 2].map((a) => ICO[i][a] + ICO[j][a] + ICO[k][a])));
      }
    }
  }
}

function footballPaint(cx, cy, r) {
  const ca = Math.cos(0.5);
  const sa = Math.sin(0.5);
  return (x, y) => {
    const nx = (x - cx) / r;
    const ny = (y - cy) / r;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const d = [nx * ca + nz * sa, ny, -nx * sa + nz * ca];
    let best = -1;
    let second = -1;
    let pent = false;
    for (const n of ICO) {
      const s = dot3(d, n) / 2.3274;
      if (s > best) {
        second = best;
        best = s;
        pent = true;
      } else if (s > second) second = s;
    }
    for (const n of FACES) {
      const s = dot3(d, n) / 2.2673;
      if (s > best) {
        second = best;
        best = s;
        pent = false;
      } else if (s > second) second = s;
    }
    const base = best - second < 0.004 ? C('#4a4a4c') : pent ? C('#1a1a1d') : C('#f4f4f0');
    return ballShade(base, cx, cy, r, r, 0.5)(x, y);
  };
}

function football() {
  const s = new Scene();
  const p = s.on(0);
  yard(p, 170, { seed: 11, fence: false });
  // A goal in the background.
  const white = C('#f4f4f4');
  p.rect(20, 92, 3, 78, white);
  p.rect(20, 92, 110, 3, white);
  p.rect(127, 92, 3, 78, white);
  for (let x = 24; x < 127; x += 5) p.line(x, 96, x - 4, 168, C('#d8dde0'));
  groundShadow(p, 172, 214, 74, 10);
  const ball = s.part('Ball');
  s.on(ball).circle(172, 136, 76, footballPaint(172, 136, 76));
  s.blotch('mud', ball, { scale: 16, cover: 0.72, extra: (x, y) => ((y - 136) / 76) * 0.25 });
  s.blotch('moss', ball, { scale: 8, cover: 0.22 });
  return s;
}

// ---------- the welcome mat ----------

function footprint(s, type, x, y, angle) {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  for (let v = -9; v <= 9; v++) {
    for (let u = -5; u <= 5; u++) {
      const sole = (u / 4.5) ** 2 + ((v + 3) / 6.5) ** 2 <= 1;
      const heel = (u / 3.8) ** 2 + ((v - 6) / 3.2) ** 2 <= 1;
      if (!sole && !heel) continue;
      if ((v + 20) % 3 === 0 && sole && hash(u, v, 3) > 0.4) continue;
      s.put(type, x + u * ca - v * sa, y + u * sa + v * ca, 1);
    }
  }
}

function boot(s, part, cx, cy, color) {
  const p = s.on(part);
  p.roundRect(cx - 9, cy - 22, 18, 44, 8, ballShade(C(color), cx, cy, 9, 22, 0.35));
  p.ellipse(cx, cy - 8, 6, 9, C('#2a2a2a'));
  p.ellipse(cx, cy - 9, 4, 6, C('#151515'));
}

function doormat() {
  const s = new Scene({ view: 'top' });
  const p = s.on(0);
  planks(p, 0, 0, 320, 240, 12, '#8d5f37', 21);
  p.rect(0, 0, 320, 18, C('#e9e7e0'));
  p.rect(0, 16, 320, 4, C('#9a9a96'));
  const mat = s.part('Mat');
  s.on(mat);
  p.roundRect(56, 66, 208, 128, 6, (x, y) => {
    const border = x < 64 || x > 255 || y < 74 || y > 185;
    const fibre = noise(x / 1.4, y / 6, 4) * 0.25 + hash(x, y, 9) * 0.12;
    return shade(C(border ? '#6e4a28' : '#b88a50'), 0.82 + fibre);
  });
  text(p, 'WELCOME', 160 - textWidth('WELCOME', 3) / 2, 122, '#4a3018', 3);
  const left = s.part('Left boot');
  const right = s.part('Right boot');
  boot(s, left, 284, 116, '#f2c21b');
  boot(s, right, 300, 168, '#f2c21b');
  s.blotch('dust', mat, { scale: 10, cover: 0.85 });
  for (let i = 0; i < 6; i++) footprint(s, 'mud', 92 + i * 30, 150 - (i % 2) * 22, 1.45 + (hash(i, 1, 2) - 0.5) * 0.4);
  s.blotch('mud', [left, right], { scale: 6, cover: 0.85 });
  s.leaves(8, [10, 30, 300, 200]);
  return s;
}

// ---------- dinner plates ----------

function plate(s, part, cx, cy, r, { bowl = false } = {}) {
  const p = s.on(part);
  p.circle(cx, cy, r, (x, y) => {
    const d = Math.hypot(x - cx, y - cy) / r;
    const rim = d > 0.72;
    let k = rim ? 1.02 - (d - 0.72) * 0.3 : 0.94 + (0.72 - d) * 0.08;
    if (bowl) k = rim ? 1.04 : 0.8 + (1 - d) * 0.25;
    if (Math.abs(d - 0.72) < 0.02) k = 0.88;
    return shade(C('#f7f6f2'), k + (hash(x, y, 1) - 0.5) * 0.02);
  });
}

function plates() {
  const s = new Scene({ view: 'top' });
  const p = s.on(0);
  p.rect(0, 0, 320, 240, (x, y) => {
    const a = Math.floor(x / 14) % 2;
    const b = Math.floor(y / 14) % 2;
    const t = a + b === 2 ? C('#b8322c') : a + b === 1 ? C('#dd7d72') : C('#f6efe6');
    return shade(t, 0.95 + hash(x, y, 2) * 0.06);
  });
  for (const [x, y, r] of [[112, 122, 56], [236, 76, 38], [236, 176, 34], [52, 206, 20]]) groundShadow(p, x + 3, y + 4, r, r * 0.95, 0.75);
  const big = s.part('Big plate');
  const small = s.part('Small plate');
  const bowl = s.part('Bowl');
  const fork = s.part('Fork');
  const mug = s.part('Mug');
  plate(s, big, 112, 120, 56);
  plate(s, small, 236, 74, 38);
  plate(s, bowl, 236, 174, 34, { bowl: true });
  s.on(fork);
  const steel = (x, y) => shade(C('#c6cbd2'), 0.9 + ((x * 7) % 3) * 0.06);
  p.roundRect(22, 60, 6, 70, 3, steel);
  for (let k = 0; k < 4; k++) p.rect(18 + k * 4, 30, 2, 32, steel);
  p.rect(18, 56, 14, 6, steel);
  s.on(mug);
  p.circle(52, 202, 20, ballShade(C('#2f6fb3'), 52, 202, 20, 20, 0.4));
  p.circle(52, 202, 15, C('#3a2416'));
  p.roundRect(70, 196, 12, 10, 4, C('#2f6fb3'));
  const red = C('#b8321f');
  s.coat('food', (x, y) => (fbm(x / 9, y / 9, 3, 4) > 0.5 ? 1 : 0) * (Math.hypot(x - 104, y - 128) < 40 ? 1 : 0), big);
  s.stroke('food', [[80, 100], [100, 92], [120, 110], [140, 96], [150, 120]], 4, red);
  s.dots('food', 30, [70, 80, 90, 90], 1.4);
  s.stroke('food', [[214, 62], [236, 80], [256, 70]], 5, red);
  s.dots('food', 14, [210, 50, 50, 50], 1.6);
  s.coat('food', (x, y) => {
    const d = Math.hypot(x - 236, y - 174);
    return d > 18 && d < 26 && hash(x, y, 3) > 0.15 ? 1 : 0;
  }, bowl);
  s.blotch('food', bowl, { scale: 7, cover: 0.35 });
  s.coat('food', (x, y) => (y < 44 ? 1 : 0), fork);
  s.coat('grime', (x, y) => {
    const d = Math.hypot(x - 52, y - 202);
    return d > 13 && d < 17 ? 1 : 0;
  }, mug);
  s.blotch('grime', [mug], { scale: 6, cover: 0.3 });
  return s;
}

// ---------- garden gnome ----------

function gnome() {
  const s = new Scene();
  const p = s.on(0);
  yard(p, 182, { seed: 31 });
  groundShadow(p, 150, 204, 62, 9);
  groundShadow(p, 246, 200, 34, 7);
  const base = s.part('Stone base');
  const bootsP = s.part('Boots');
  const coat = s.part('Coat');
  const beard = s.part('Beard');
  const face = s.part('Face');
  const hat = s.part('Hat');
  const mush = s.part('Mushroom');
  s.on(base).ellipse(150, 200, 48, 11, ballShade(C('#9d9a91'), 150, 196, 48, 14, 0.3));
  s.on(bootsP);
  p.ellipse(132, 188, 15, 8, ballShade(C('#5a3a22'), 132, 186, 15, 8));
  p.ellipse(168, 188, 15, 8, ballShade(C('#5a3a22'), 168, 186, 15, 8));
  s.on(coat);
  p.poly([[118, 186], [182, 186], [174, 118], [126, 118]], vshade('#3d6fb5', 118, 186, 1.15, 0.85));
  p.rect(122, 152, 56, 7, C('#26201a'));
  p.rect(145, 151, 10, 9, C('#e2b23a'));
  p.ellipse(116, 140, 9, 20, ballShade(C('#3d6fb5'), 116, 138, 9, 20));
  p.ellipse(184, 140, 9, 20, ballShade(C('#3d6fb5'), 184, 138, 9, 20));
  p.circle(116, 160, 6, ballShade(C('#e7b58f'), 116, 160, 6, 6));
  p.circle(184, 160, 6, ballShade(C('#e7b58f'), 184, 160, 6, 6));
  s.on(beard).poly([[124, 98], [176, 98], [168, 128], [150, 152], [132, 128]], (x, y) => shade(C('#f0eee8'), 0.9 + noise(x / 3, y / 2, 2) * 0.15));
  s.on(face);
  p.ellipse(150, 96, 17, 13, ballShade(C('#ecbd96'), 150, 94, 17, 13, 0.35));
  p.circle(150, 101, 6, ballShade(C('#e59a86'), 150, 100, 6, 6));
  p.rect(141, 92, 3, 3, C('#2a1d18'));
  p.rect(156, 92, 3, 3, C('#2a1d18'));
  s.on(hat).poly([[124, 90], [176, 90], [168, 60], [156, 18], [150, 50]], vshade('#cf2e2e', 18, 90, 1.15, 0.85));
  s.on(mush);
  p.rect(236, 160, 20, 36, vshade('#efe9dc', 160, 196));
  p.ellipse(246, 160, 30, 20, (x, y) => (y > 160 ? null : ballShade(C('#d23a2e'), 246, 156, 30, 18)(x, y)));
  for (const [x, y, r] of [[234, 150, 4], [252, 146, 5], [262, 155, 3], [244, 156, 3]]) p.circle(x, y, r, C('#f6f2e8'));
  s.blotch('grime', [coat, beard, face, hat, mush, bootsP], { scale: 12, cover: 0.5 });
  s.blotch('moss', [base, bootsP, coat, mush], { scale: 8, cover: 0.55, extra: lower(130, 200, 0.4) });
  s.splat('poop', 158, 40, 4, { drip: true });
  s.splat('poop', 166, 72, 5, { drip: true });
  s.splat('poop', 250, 146, 5, { drip: true });
  const webs = s.part('Cobwebs');
  s.cobweb(184, 118, 34, 1, -1, webs);
  return s;
}

// ---------- family car ----------

function carBody(s, parts, opts) {
  const { body, windows, front, back, bumpers, lights } = parts;
  const { x0, x1, wheelY, wheelR, frontX, backX, color, roofY, beltY } = opts;
  const p = s.on(body);
  const top = vshade(color, roofY, wheelY + 4, 1.12, 0.78);
  p.poly(opts.outline, top);
  // Wheel arches.
  for (const wx of [frontX, backX]) p.circle(wx, wheelY, wheelR + 5, C('#1c1c1e'));
  // Body line highlight.
  p.rect(x0 + 6, beltY, x1 - x0 - 12, 1, shade(C(color), 1.3));
  s.on(windows);
  for (const w of opts.windowShapes) {
    const xs = w.map((q) => q[0]);
    const ys = w.map((q) => q[1]);
    const gx = Math.min(...xs);
    const gy = Math.min(...ys);
    p.poly(w, (x, y) => glass(x, y, gx, gy, Math.max(...xs) - gx, Math.max(...ys) - gy));
  }
  s.on(body);
  for (const dx of opts.doorLines || []) p.rect(dx, roofY + 6, 1, wheelY - roofY - 14, shade(C(color), 0.55));
  for (const hx of opts.handles || []) p.rect(hx, beltY + 6, 7, 2, shade(C(color), 0.6));
  s.on(bumpers);
  for (const [bx, bw] of opts.bumpers) p.roundRect(bx, wheelY - 10, bw, 12, 3, vshade('#3a3b3f', wheelY - 10, wheelY + 2));
  s.on(lights);
  for (const [lx, ly, lw, lh, lc] of opts.lamps) p.roundRect(lx, ly, lw, lh, 2, C(lc));
  s.on(front);
  wheel(p, frontX, wheelY, wheelR);
  s.on(back);
  wheel(p, backX, wheelY, wheelR);
}

function vehicleParts(s, extra = []) {
  const parts = {};
  for (const name of ['Body', 'Windows', 'Front wheel', 'Back wheel', 'Bumpers', 'Lights', ...extra]) parts[name] = s.part(name);
  return {
    body: parts.Body,
    windows: parts.Windows,
    front: parts['Front wheel'],
    back: parts['Back wheel'],
    bumpers: parts.Bumpers,
    lights: parts.Lights,
    ...parts,
  };
}

function familyCar() {
  const s = new Scene();
  const p = s.on(0);
  street(p, 186, { seed: 41 });
  groundShadow(p, 162, 210, 132, 8, 0.6);
  const parts = vehicleParts(s);
  carBody(s, parts, {
    x0: 34,
    x1: 290,
    wheelY: 190,
    wheelR: 22,
    frontX: 240,
    backX: 86,
    color: '#c8201f',
    roofY: 92,
    beltY: 134,
    outline: [[34, 190], [32, 160], [40, 140], [64, 132], [98, 96], [196, 92], [226, 128], [272, 136], [288, 150], [290, 190]],
    windowShapes: [
      [[70, 130], [100, 101], [150, 99], [150, 130]],
      [[156, 99], [192, 98], [218, 128], [156, 130]],
    ],
    doorLines: [153],
    handles: [136, 196],
    bumpers: [[28, 30], [264, 30]],
    lamps: [[278, 142, 10, 7, '#f5edc6'], [34, 142, 7, 10, '#c81d27']],
  });
  const { body, windows, front, back, bumpers, lights } = parts;
  const all = [body, windows, front, back, bumpers, lights];
  s.coat('mud', (x, y) => lower(120, 196, 1.3)(x, y) * (fbm(x / 10, y / 10, 3, 7) + 0.35) - 0.25, all);
  for (const wx of [86, 240]) {
    for (let k = 0; k < 18; k++) {
      const a = Math.PI + 0.3 + hash(k, wx, 1) * (Math.PI - 0.6);
      const d = 28 + hash(k, wx, 2) * 30;
      s.splat('mud', wx + Math.cos(a) * d, 190 + Math.sin(a) * d, 1.5 + hash(k, wx, 3) * 2.5);
    }
  }
  s.blotch('dust', [body, windows], { scale: 12, cover: 0.55, extra: (x, y) => (y < 130 ? 0.15 : -0.3) });
  for (const [x, y] of [[130, 95], [170, 94], [120, 112], [200, 112], [60, 138]]) s.splat('poop', x, y, 4 + hash(x, y, 1) * 2, { drip: true });
  s.dots('bugs', 40, [262, 130, 28, 40], 1);
  return s;
}

// ---------- patio ----------

function flagstones(p, x0, y0, w, h, cell, seed) {
  const pts = [];
  const nx = Math.ceil(w / cell) + 1;
  const ny = Math.ceil(h / cell) + 1;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pts.push([x0 + (i + 0.15 + hash(i, j, seed) * 0.7) * cell, y0 + (j + 0.15 + hash(j, i, seed + 1) * 0.7) * cell]);
  const joint = new Float32Array(p.w * p.h).fill(99);
  p.rect(x0, y0, w, h, (x, y) => {
    const ci = Math.floor((x - x0) / cell);
    const cj = Math.floor((y - y0) / cell);
    let b1 = Infinity;
    let b2 = Infinity;
    let id = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
        const q = pts[j * nx + i];
        const d = Math.hypot(x - q[0], y - q[1]);
        if (d < b1) {
          b2 = b1;
          b1 = d;
          id = j * nx + i;
        } else if (d < b2) b2 = d;
      }
    }
    joint[y * p.w + x] = b2 - b1;
    if (b2 - b1 < 2) return C('#6f6a5e');
    const tone = ['#c9bfae', '#bdb3a0', '#d3cab9', '#b5ab98'][Math.floor(hash(id, 3, seed) * 4)];
    return shade(C(tone), 0.94 + hash(x, y, seed) * 0.08 + (b2 - b1 < 4 ? -0.08 : 0));
  });
  return (x, y) => joint[y * p.w + x];
}

function patio() {
  const s = new Scene({ view: 'top' });
  const p = s.on(0);
  grass(p, 0, 0, 320, 240, 51);
  const stones = s.part('Stones');
  s.on(stones);
  const joint = flagstones(p, 16, 14, 288, 212, 36, 52);
  const pot = s.part('Plant pot');
  const bench = s.part('Bench');
  groundShadow(p, 254, 68, 26, 24, 0.7);
  s.on(pot);
  p.circle(250, 62, 24, ballShade(C('#c4673e'), 250, 62, 24, 24, 0.35));
  p.circle(250, 62, 18, C('#4a3322'));
  s.on(0);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    p.ellipse(250 + Math.cos(a) * 8, 62 + Math.sin(a) * 8, 7, 4, C(k % 2 ? '#4f8a35' : '#64a143'));
  }
  groundShadow(p, 92, 196, 56, 18, 0.7);
  s.on(bench);
  planks(p, 40, 178, 100, 30, 6, '#a7794a', 53);
  s.blotch('grime', stones, { scale: 18, cover: 0.65 });
  s.coat('moss', (x, y) => (joint(x, y) < 5 ? 0.6 + fbm(x / 5, y / 5, 2, 9) * 0.6 - joint(x, y) * 0.08 : 0), stones);
  s.blotch('moss', pot, { scale: 6, cover: 0.45 });
  s.blotch('grime', bench, { scale: 8, cover: 0.6 });
  for (const [x, y] of [[120, 60], [180, 140], [60, 110], [100, 190], [210, 200]]) s.splat('poop', x, y, 3 + hash(x, y, 1) * 2);
  s.leaves(46, [10, 10, 300, 220]);
  return s;
}

// ---------- wheelie bins ----------

function bin(s, part, lidPart, x, color) {
  const p = s.on(part);
  p.poly([[x, 72], [x + 84, 72], [x + 78, 202], [x + 6, 202]], vshade(color, 72, 202, 1.08, 0.8));
  for (let k = 0; k < 3; k++) p.rect(x + 16 + k * 22, 90, 3, 96, shade(C(color), 0.82));
  s.on(lidPart);
  p.roundRect(x - 4, 62, 92, 12, 4, vshade(color, 62, 74, 1.2, 0.95));
  p.rect(x + 30, 58, 24, 5, shade(C(color), 0.75));
  s.on(part);
  wheel(p, x + 12, 204, 9, '#7d8288');
}

function bins() {
  const s = new Scene();
  const p = s.on(0);
  sky(p, 0, 60);
  bricks(p, 0, 30, 320, 160, '#9d4f3a', '#cfc5b5', 10, 5, 61);
  p.rect(0, 190, 320, 50, (x, y) => (x % 32 === 0 ? C('#8e8a80') : concrete(x, y, 62, '#bfbab0')));
  groundShadow(p, 105, 212, 50, 6, 0.6);
  groundShadow(p, 220, 212, 50, 6, 0.6);
  const green = s.part('Green bin');
  const blueB = s.part('Blue bin');
  const lids = s.part('Lids');
  bin(s, green, lids, 60, '#2f7d3a');
  bin(s, blueB, lids, 176, '#2b5fa8');
  s.blotch('grime', [green, blueB, lids], { scale: 10, cover: 0.7 });
  const gunk = C('#7a6a2a');
  for (let k = 0; k < 9; k++) {
    const x = 66 + hash(k, 1, 6) * 190;
    s.stroke('food', [[x, 74], [x + 1, 74 + 10 + hash(k, 2, 6) * 40]], 3, gunk);
  }
  s.blotch('mud', [green, blueB], { scale: 8, cover: 0.6, extra: lower(150, 210, 0.5) });
  s.splat('poop', 100, 64, 4, { drip: true });
  s.splat('poop', 230, 66, 5, { drip: true });
  s.dots('bugs', 16, [60, 80, 200, 60], 1);
  return s;
}

// ---------- muddy footballer ----------

function footballer() {
  const s = new Scene();
  const p = s.on(0);
  sky(p, 0, 110, '#5b8fd0', '#cfe2f2');
  // Stands with a crowd.
  p.rect(0, 70, 320, 50, (x, y) => (y % 6 < 2 ? C('#59606b') : C(['#d84a3a', '#f2d34a', '#3c6fc4', '#f0efe9'][Math.floor(hash(Math.floor(x / 3), Math.floor(y / 6), 7) * 4)])));
  p.rect(0, 120, 320, 120, (x, y) => shade(C(Math.floor(x / 40) % 2 ? '#5e9a3a' : '#6aa844'), 0.95 + hash(x, y, 8) * 0.06));
  p.rect(0, 150, 320, 2, C('#f2f2ec'));
  groundShadow(p, 160, 226, 46, 6, 0.65);
  const skin = s.part('Face and arms');
  const hair = s.part('Hair');
  const shirt = s.part('Jersey');
  const shorts = s.part('Shorts');
  const socks = s.part('Socks');
  const bootsP = s.part('Boots');
  const legs = s.part('Knees');
  const SK = '#d99a6c';
  s.on(legs);
  p.rect(141, 158, 13, 20, vshade(SK, 158, 178));
  p.rect(166, 158, 13, 20, vshade(SK, 158, 178));
  s.on(socks);
  p.rect(140, 176, 15, 38, vshade('#c8202a', 176, 214));
  p.rect(165, 176, 15, 38, vshade('#c8202a', 176, 214));
  p.rect(140, 180, 15, 3, C('#f2f2ec'));
  p.rect(165, 180, 15, 3, C('#f2f2ec'));
  s.on(bootsP);
  p.roundRect(134, 212, 22, 12, 4, vshade('#1d1d22', 212, 224));
  p.roundRect(164, 212, 22, 12, 4, vshade('#1d1d22', 212, 224));
  s.on(shorts).poly([[136, 134], [184, 134], [186, 162], [162, 162], [160, 150], [158, 162], [134, 162]], vshade('#f2f2ec', 134, 162));
  s.on(skin);
  p.ellipse(122, 128, 7, 18, ballShade(C(SK), 122, 126, 7, 18));
  p.ellipse(198, 128, 7, 18, ballShade(C(SK), 198, 126, 7, 18));
  p.rect(154, 74, 12, 10, vshade(SK, 74, 84));
  s.on(shirt);
  p.poly([[132, 82], [188, 82], [204, 108], [194, 114], [186, 100], [186, 138], [134, 138], [134, 100], [126, 114], [116, 108]], vshade('#c8202a', 82, 138));
  text(p, '10', 152, 100, '#f2f2ec', 3);
  s.on(skin);
  p.ellipse(160, 58, 19, 21, ballShade(C(SK), 160, 56, 19, 21, 0.35));
  p.ellipse(141, 60, 4, 6, C('#c98a5c'));
  p.ellipse(179, 60, 4, 6, C('#c98a5c'));
  p.rect(151, 56, 4, 4, C('#2a1d18'));
  p.rect(165, 56, 4, 4, C('#2a1d18'));
  p.rect(153, 68, 14, 2, C('#a45a4a'));
  p.rect(152, 66, 2, 2, C('#a45a4a'));
  p.rect(166, 66, 2, 2, C('#a45a4a'));
  s.on(hair).poly([[140, 52], [142, 40], [152, 34], [168, 34], [178, 42], [180, 52], [172, 44], [160, 46], [148, 44]], (x, y) => shade(C('#3a2618'), 0.85 + noise(x / 2, y, 3) * 0.3));
  const everyone = [skin, hair, shirt, shorts, socks, bootsP, legs];
  s.coat('mud', (x, y) => (fbm(x / 9, y / 9, 3, 12) + lower(80, 224, 0.55)(x, y)) * 1.6 - 0.75, everyone);
  s.blotch('moss', [legs, shorts, socks], { scale: 6, cover: 0.35 });
  s.splat('mud', 150, 62, 4);
  s.splat('mud', 172, 52, 3);
  return s;
}

// ---------- driveway ----------

function driveway() {
  const s = new Scene({ view: 'top' });
  const p = s.on(0);
  grass(p, 0, 0, 320, 240, 81);
  p.rect(0, 226, 320, 14, (x, y) => shade(C('#55585e'), 0.95 + hash(x, y, 2) * 0.08));
  p.rect(0, 224, 320, 3, C('#a8a49a'));
  const drive = s.part('Driveway');
  const step = s.part('Garage step');
  const path = s.part('Path stones');
  const drain = s.part('Drain');
  s.on(step).rect(46, 0, 228, 16, (x, y) => (y > 13 ? C('#8e8a82') : concrete(x, y, 3, '#d4d0c6')));
  s.on(drive);
  slabs(p, 46, 16, 228, 208, 57, '#c2bdb2', 82);
  s.on(drain);
  p.rect(146, 200, 28, 14, C('#3a3b3e'));
  for (let x = 149; x < 172; x += 4) p.rect(x, 202, 2, 10, C('#1d1d1f'));
  s.on(path);
  for (let k = 0; k < 5; k++) p.ellipse(20 + (k % 2) * 4, 30 + k * 42, 13, 11, ballShade(C('#9c968a'), 20 + (k % 2) * 4, 30 + k * 42, 13, 11, 0.3));
  s.blotch('grime', [drive, step], { scale: 20, cover: 0.65 });
  s.coat('moss', (x, y) => {
    const lx = (x - 46) % 57;
    const ly = (y - 16) % 57;
    return lx < 2 || ly < 2 ? 0.5 + fbm(x / 6, y / 6, 2, 3) : 0;
  }, drive);
  s.blotch('moss', path, { scale: 6, cover: 0.6 });
  s.splat('oil', 128, 118, 22);
  s.splat('oil', 196, 84, 13);
  s.splat('oil', 110, 150, 8);
  const tyre = C('#3b3a38');
  s.stroke('grime', [[96, 224], [100, 170], [112, 120], [118, 40]], 9, tyre);
  s.stroke('grime', [[200, 224], [206, 170], [214, 120], [220, 40]], 9, tyre);
  s.dots('gum', 26, [56, 30, 210, 180], 1.6);
  s.blotch('grime', drain, { scale: 4, cover: 0.7 });
  s.leaves(70, [5, 5, 310, 220]);
  return s;
}

// ---------- wooden deck ----------

function deck() {
  const s = new Scene({ view: 'top' });
  const p = s.on(0);
  grass(p, 0, 0, 320, 240, 91);
  const boards = s.part('Deck');
  s.on(boards);
  planks(p, 10, 0, 300, 228, 13, '#a0703f', 92, true);
  const table = s.part('Table');
  const lchair = s.part('Left chair');
  const rchair = s.part('Right chair');
  const pot = s.part('Flower pot');
  for (const [x, y, rx] of [[160, 110, 38], [92, 110, 18], [228, 110, 18]]) groundShadow(p, x + 4, y + 5, rx, rx, 0.7);
  s.on(table).circle(160, 108, 36, ballShade(C('#e9e6dd'), 160, 108, 36, 36, 0.3));
  s.on(lchair).roundRect(76, 94, 30, 30, 6, ballShade(C('#3f7f8f'), 91, 109, 15, 15, 0.3));
  s.on(rchair).roundRect(214, 94, 30, 30, 6, ballShade(C('#3f7f8f'), 229, 109, 15, 15, 0.3));
  s.on(pot).circle(270, 196, 18, ballShade(C('#4b5563'), 270, 196, 18, 18, 0.4));
  s.on(0);
  for (let k = 0; k < 7; k++) p.circle(270 + Math.cos(k) * 8, 196 + Math.sin(k) * 8, 5, C(['#e05a6a', '#f2c94c', '#ffffff'][k % 3]));
  s.blotch('algae', boards, { scale: 16, cover: 0.42 });
  s.blotch('grime', boards, { scale: 9, cover: 0.45 });
  s.blotch('grime', [lchair, rchair, pot], { scale: 7, cover: 0.55 });
  s.splat('food', 152, 100, 9, { color: C('#7a2a3a') });
  s.splat('poop', 172, 120, 4);
  s.splat('poop', 230, 102, 3);
  s.blotch('dust', table, { scale: 8, cover: 0.5 });
  s.leaves(55, [12, 5, 296, 220]);
  return s;
}

// ---------- garden fence ----------

function fence() {
  const W = 480;
  const s = new Scene({ w: W });
  const p = s.on(0);
  sky(p, 0, 120);
  clouds(p, 6, 60, 101);
  treeLine(p, 80, '#5d8a4a', 102, 26);
  grass(p, 0, 200, W, 40, 103);
  const panels = [];
  for (let k = 0; k < 4; k++) panels.push(s.part(`Panel ${k + 1}`));
  const posts = s.part('Posts');
  for (let k = 0; k < 4; k++) {
    s.on(panels[k]);
    const x0 = 14 + k * 116;
    for (let b = 0; b < 102; b += 10) {
      const top = 66 + Math.round(Math.sin(((b + 5) / 102) * Math.PI) * -10);
      p.rect(x0 + b, top, 9, 202 - top, vshade(['#b5875a', '#ad7f52', '#bb8d60'][(b / 10) % 3], top, 202, 1.08, 0.84));
      p.rect(x0 + b + 9, top + 2, 1, 200 - top, C('#6e4a2c'));
    }
    p.rect(x0, 100, 104, 5, C('#8f6640'));
    p.rect(x0, 170, 104, 5, C('#8f6640'));
  }
  s.on(posts);
  for (let k = 0; k <= 4; k++) {
    const x = 4 + k * 116;
    p.rect(x, 50, 12, 156, vshade('#7a5434', 50, 206));
    p.rect(x - 2, 46, 16, 6, C('#5e4028'));
  }
  const all = [...panels, posts];
  s.coat('moss', (x, y) => (fbm(x / 10, y / 10, 3, 104) + lower(120, 205, 0.7)(x, y)) * 1.8 - 1.1, all);
  s.coat('algae', (x, y) => (noise(x / 3, y / 40, 105) > 0.62 ? 0.9 : 0), all);
  s.blotch('grime', all, { scale: 14, cover: 0.55 });
  for (let k = 0; k < 8; k++) s.splat('poop', 30 + k * 58, 64 + hash(k, 1, 106) * 20, 3 + hash(k, 2, 106) * 2, { drip: true });
  const webs = s.part('Cobwebs');
  s.cobweb(16, 52, 26, 1, 1, webs);
  s.cobweb(364, 52, 22, -1, 1, webs);
  return s;
}

// ---------- the cow ----------

function cow() {
  const s = new Scene();
  const p = s.on(0);
  sky(p, 0, 150, '#6aa0dc', '#d6eaf6');
  clouds(p, 3, 70, 111);
  p.rect(14, 96, 50, 54, vshade('#a33a2a', 96, 150));
  p.poly([[10, 98], [39, 74], [68, 98]], C('#7a2a20'));
  p.rect(32, 120, 14, 30, C('#f0e6d6'));
  treeLine(p, 150, '#6c9a54', 112, 14);
  grass(p, 0, 150, 320, 90, 113);
  for (let x = 0; x < 320; x += 30) p.rect(x, 128, 4, 34, C('#8a6a48'));
  p.rect(0, 134, 320, 3, C('#8a6a48'));
  p.rect(0, 148, 320, 3, C('#8a6a48'));
  groundShadow(p, 160, 212, 100, 9, 0.65);
  const body = s.part('Body');
  const head = s.part('Head');
  const legs = s.part('Legs');
  const udder = s.part('Udder');
  const tail = s.part('Tail');
  const hide = (x, y) => (fbm(x / 26, y / 26, 3, 114) > 0.53 ? C('#1c1b20') : C('#f4f1ea'));
  const shaded = (cx, cy, rx, ry) => (x, y) => ballShade(hide(x, y), cx, cy, rx, ry, 0.35)(x, y);
  s.on(legs);
  for (const [x, back] of [[92, 1], [112, 1], [196, 0], [214, 0]]) {
    p.roundRect(x, 140, 15, 64, 5, shaded(x + 7, 160, 9, 40));
    p.rect(x, 200, 15, 8, C('#2b2624'));
    if (back) p.ellipse(x + 8, 146, 13, 16, shaded(x + 8, 140, 13, 16));
  }
  s.on(body);
  p.roundRect(76, 82, 164, 82, 30, shaded(158, 112, 90, 50));
  s.on(udder);
  p.ellipse(132, 166, 18, 10, ballShade(C('#e9a7a0'), 132, 164, 18, 10));
  for (const x of [122, 130, 138, 144]) p.rect(x, 172, 3, 5, C('#d88f88'));
  s.on(tail);
  p.line(78, 96, 68, 170, C('#dcd6cc'), 3);
  p.ellipse(67, 176, 5, 9, C('#1c1b20'));
  s.on(head);
  p.poly([[228, 90], [248, 74], [262, 80], [282, 108], [276, 128], [244, 128], [230, 112]], shaded(254, 100, 30, 30));
  p.ellipse(276, 120, 15, 12, ballShade(C('#e7a59c'), 276, 118, 15, 12));
  p.rect(278, 118, 3, 3, C('#7a3a3a'));
  p.rect(284, 116, 3, 3, C('#7a3a3a'));
  p.ellipse(244, 80, 11, 5, shaded(244, 80, 11, 5));
  p.line(252, 76, 258, 64, C('#e8dcc4'), 3);
  p.rect(262, 92, 4, 4, C('#1a1414'));
  const all = [body, head, legs, udder, tail];
  s.coat('mud', (x, y) => (fbm(x / 11, y / 11, 3, 115) + lower(110, 210, 0.8)(x, y)) * 1.7 - 0.95, all);
  s.coat('dung', (x, y) => (x < 120 && y > 100 ? fbm(x / 6, y / 6, 2, 116) * 1.5 - 0.35 : 0), [body, legs, tail]);
  s.blotch('dust', [body, head], { scale: 10, cover: 0.4, extra: (x, y) => (y < 100 ? 0.2 : -0.2) });
  return s;
}

// ---------- muddy pig ----------

function pig() {
  const s = new Scene();
  const p = s.on(0);
  sky(p, 0, 150, '#6aa0dc', '#d6eaf6');
  clouds(p, 3, 70, 241);
  p.rect(10, 92, 56, 58, vshade('#a33a2a', 92, 150));
  p.poly([[6, 94], [38, 68], [70, 94]], C('#7a2a20'));
  p.rect(28, 118, 16, 32, C('#f0e6d6'));
  treeLine(p, 150, '#6c9a54', 242, 14);
  // A muddy pen: wet brown ground with darker puddles and bits of straw.
  p.rect(0, 150, 320, 90, (x, y) => {
    const n = fbm(x / 14, y / 7, 3, 243);
    if (n > 0.62) return shade(C('#4a3420'), 0.9 + hash(x, y, 1) * 0.1);
    if (hash(x, y, 244) > 0.985) return C('#d9b45a');
    return shade(C('#7a5533'), 0.85 + n * 0.3);
  });
  for (let x = 0; x < 320; x += 26) p.rect(x, 128, 4, 34, C('#8a6a48'));
  p.rect(0, 134, 320, 3, C('#8a6a48'));
  p.rect(0, 148, 320, 3, C('#8a6a48'));
  groundShadow(p, 166, 210, 108, 8, 0.65);

  const legs = s.part('Legs');
  const body = s.part('Body');
  const tail = s.part('Tail');
  const head = s.part('Head');
  const ears = s.part('Ears');
  const snout = s.part('Snout');
  const PINK = '#f2a5b4';
  s.on(legs);
  for (const x of [94, 118, 198, 222]) {
    p.roundRect(x, 160, 18, 48, 5, ballShade(C(PINK), x + 9, 176, 11, 30, 0.35));
    p.rect(x, 202, 18, 7, C('#4a3a36'));
    p.rect(x + 8, 203, 1, 6, C('#2a201e'));
  }
  s.on(body);
  p.ellipse(162, 136, 94, 52, ballShade(C(PINK), 150, 128, 100, 60, 0.4));
  s.on(tail);
  for (let k = 0; k < 40; k++) {
    const a = k * 0.32;
    const r = 2 + k * 0.17;
    p.circle(64 - Math.cos(a) * r, 112 - Math.sin(a) * r, 1.4, C('#e88fa0'));
  }
  s.on(head);
  p.ellipse(254, 122, 38, 33, ballShade(C(PINK), 248, 114, 38, 33, 0.4));
  p.rect(263, 107, 4, 4, C('#2a1d18'));
  p.rect(264, 107, 1, 1, C('#ffffff'));
  p.line(266, 146, 276, 146, C('#a65a6a'));
  p.line(264, 144, 266, 146, C('#a65a6a'));
  s.on(ears);
  p.poly([[234, 98], [252, 80], [266, 100], [252, 104]], ballShade(C('#e88fa0'), 250, 92, 16, 12, 0.3));
  p.poly([[226, 104], [236, 84], [246, 102]], ballShade(C('#df8496'), 236, 96, 10, 12, 0.3));
  s.on(snout);
  p.ellipse(287, 130, 11, 15, ballShade(C('#e8899c'), 284, 126, 11, 15, 0.35));
  p.ellipse(289, 124, 2, 3, C('#7a3a48'));
  p.ellipse(289, 136, 2, 3, C('#7a3a48'));

  const all = [legs, body, tail, head, ears, snout];
  // Pigs love mud: thick on the legs and belly, splattered up the sides.
  s.coat('mud', (x, y) => (fbm(x / 10, y / 10, 3, 245) + lower(100, 208, 1)(x, y)) * 1.9 - 1.05, all);
  for (let k = 0; k < 30; k++) s.splat('mud', 80 + hash(k, 1, 246) * 210, 90 + hash(k, 2, 246) * 70, 2 + hash(k, 3, 246) * 4);
  s.splat('mud', 280, 140, 5);
  s.splat('mud', 250, 104, 4);
  s.coat('dung', (x, y) => (x < 130 && y > 120 ? fbm(x / 6, y / 6, 2, 247) * 1.6 - 0.45 : 0), [body, legs, tail]);
  s.blotch('dust', [body, head, ears], { scale: 9, cover: 0.35, extra: (x, y) => (y < 110 ? 0.2 : -0.2) });
  return s;
}

// ---------- pickup truck ----------

function pickup() {
  const W = 400;
  const s = new Scene({ w: W });
  const p = s.on(0);
  sky(p, 0, 150, '#6fa2dc', '#e4ecf0');
  clouds(p, 4, 70, 121);
  for (let x = 0; x < W; x++) {
    const h = 150 - 18 - Math.sin(x / 50) * 10 - Math.sin(x / 23) * 4;
    for (let y = Math.floor(h); y < 160; y++) p.set(x, y, shade(C('#7d9a5a'), 0.9 + hash(x, y, 1) * 0.08));
  }
  p.rect(0, 160, W, 80, (x, y) => shade(C('#8a6a48'), 0.85 + fbm(x / 8, y / 8, 3, 122) * 0.3));
  groundShadow(p, 200, 216, 170, 9, 0.6);
  const parts = vehicleParts(s, ['Truck bed']);
  carBody(s, parts, {
    x0: 26,
    x1: 380,
    wheelY: 196,
    wheelR: 28,
    frontX: 318,
    backX: 96,
    color: '#2f4f8a',
    roofY: 86,
    beltY: 130,
    outline: [[26, 196], [24, 128], [204, 126], [212, 88], [282, 86], [304, 124], [364, 128], [380, 144], [382, 196]],
    windowShapes: [[[216, 124], [222, 94], [278, 92], [296, 124]]],
    doorLines: [258],
    handles: [242],
    bumpers: [[18, 30], [354, 30]],
    lamps: [[370, 138, 10, 9, '#f5edc6'], [24, 134, 6, 14, '#c81d27']],
  });
  s.on(parts['Truck bed']);
  p.rect(30, 120, 172, 8, vshade('#2f4f8a', 120, 128, 1.25, 1));
  p.rect(30, 128, 172, 2, C('#1d2f55'));
  const { body, windows, front, back, bumpers, lights } = parts;
  const all = [body, windows, front, back, bumpers, lights, parts['Truck bed']];
  s.coat('mud', (x, y) => (fbm(x / 12, y / 12, 3, 123) + lower(90, 200, 1.1)(x, y)) * 1.8 - 0.75, all);
  for (const wx of [96, 318]) {
    for (let k = 0; k < 26; k++) {
      const a = Math.PI + 0.2 + hash(k, wx, 1) * (Math.PI - 0.4);
      const d = 34 + hash(k, wx, 2) * 46;
      s.splat('mud', wx + Math.cos(a) * d, 196 + Math.sin(a) * d, 2 + hash(k, wx, 3) * 3);
    }
  }
  s.blotch('dust', [body, windows, parts['Truck bed']], { scale: 10, cover: 0.5 });
  return s;
}

// ---------- house front ----------

function house() {
  const W = 520;
  const s = new Scene({ w: W });
  const p = s.on(0);
  sky(p, 0, 206);
  clouds(p, 6, 50, 131);
  treeLine(p, 206, '#6c9a54', 136, 24);
  grass(p, 0, 206, W, 34, 132);
  const roof = s.part('Roof');
  const gutter = s.part('Gutter');
  const sid = s.part('Siding');
  const brick = s.part('Bricks');
  const wins = s.part('Windows');
  const door = s.part('Front door');
  const garage = s.part('Garage door');
  const steps = s.part('Steps');
  s.on(roof).poly([[8, 72], [512, 72], [470, 18], [50, 18]], (x, y) => {
    const row = Math.floor((y - 18) / 6);
    const lx = (x + (row % 2) * 6) % 12;
    const base = C('#545a63');
    if ((y - 18) % 6 === 5) return shade(base, 0.6);
    return shade(base, lx === 0 ? 0.75 : 0.92 + hash(Math.floor((x + (row % 2) * 6) / 12), row, 3) * 0.16);
  });
  s.on(gutter).rect(8, 72, 504, 5, vshade('#f2f2ee', 72, 77));
  s.on(sid);
  siding(p, 24, 77, 472, 58, '#c9d6df', 5);
  s.on(brick);
  bricks(p, 24, 135, 472, 71, '#a5503a', '#d2c8b8', 10, 5, 133);
  for (const x of [60, 200, 340]) windowPane(p, x, 88, 52, 36, '#fbfbf8', wins, wins);
  for (const x of [60, 200]) windowPane(p, x, 148, 52, 36, '#fbfbf8', wins, wins);
  s.on(door).rect(136, 142, 34, 62, vshade('#2f5d4c', 142, 204));
  p.circle(164, 175, 2, C('#e2b23a'));
  p.rect(141, 148, 24, 20, shade(C('#2f5d4c'), 0.85));
  s.on(garage).rect(300, 144, 180, 62, (x, y) => {
    const panel = (y - 144) % 15;
    return shade(C('#efefe9'), panel === 14 ? 0.78 : panel === 0 ? 1.05 : 0.97);
  });
  s.on(steps);
  p.rect(126, 204, 54, 4, C('#b3aea4'));
  p.rect(120, 208, 66, 6, concrete(0, 0, 1, '#bdb8ae'));
  s.on(0);
  for (const x of [30, 214, 262]) for (let k = 0; k < 5; k++) p.circle(x + k * 9, 202 - (k % 2) * 4, 9, C(k % 2 ? '#4f8a35' : '#5f9a3c'));
  p.rect(296, 206, 188, 34, (x, y) => concrete(x, y, 2, '#c4bfb4'));
  const walls = [sid, brick];
  s.coat('grime', (x, y) => {
    const below = (y > 124 && ((x > 58 && x < 114) || (x > 198 && x < 254) || (x > 338 && x < 394))) || y < 100;
    return below ? (noise(x / 2.5, y / 30, 134) > 0.5 ? 0.9 : 0) : 0;
  }, walls);
  s.blotch('grime', [...walls, door, gutter], { scale: 18, cover: 0.45 });
  s.blotch('moss', roof, { scale: 10, cover: 0.6 });
  s.blotch('moss', brick, { scale: 8, cover: 0.4, extra: lower(170, 206, 0.6) });
  s.blotch('dust', wins, { scale: 6, cover: 0.6 });
  for (let k = 0; k < 10; k++) s.splat('poop', 30 + hash(k, 1, 135) * 460, 24 + hash(k, 2, 135) * 44, 3 + hash(k, 3, 135) * 3, { drip: true });
  for (const x of [86, 226, 366]) s.splat('poop', x, 128, 3, { drip: true });
  const tags = [
    ['#e83f6f', [[318, 160], [330, 150], [342, 172], [356, 152], [368, 176]]],
    ['#3fb6e8', [[380, 158], [396, 152], [392, 176], [410, 170], [420, 150]]],
    ['#f2c21b', [[430, 154], [452, 154], [434, 178], [458, 178]]],
    ['#7ad13f', [[320, 186], [470, 184]]],
  ];
  for (const [color, pts] of tags) s.stroke('paint', pts, 4, C(color));
  const webs = s.part('Cobwebs');
  s.cobweb(25, 78, 22, 1, 1, webs);
  s.cobweb(495, 78, 20, -1, 1, webs);
  s.cobweb(171, 142, 14, -1, 1, webs);
  return s;
}

// ---------- playground slide ----------

function slide() {
  const s = new Scene();
  const p = s.on(0);
  yard(p, 190, { seed: 141, fence: false });
  p.rect(0, 196, 320, 44, (x, y) => shade(C('#e1c88f'), 0.9 + hash(x, y, 3) * 0.12));
  const tower = s.part('Tower');
  const roofP = s.part('Roof');
  const ladder = s.part('Ladder');
  const chute = s.part('Slide');
  s.on(tower);
  for (const x of [70, 150]) p.rect(x, 62, 10, 150, vshade('#9a6b3e', 62, 212));
  p.rect(64, 108, 104, 10, vshade('#b07c48', 108, 118));
  for (let x = 74; x < 150; x += 10) p.rect(x, 74, 3, 34, C('#c28a4c'));
  p.rect(68, 72, 92, 4, C('#9a6b3e'));
  s.on(roofP).poly([[56, 64], [174, 64], [115, 22]], vshade('#cf3a2e', 22, 64));
  s.on(ladder);
  p.line(40, 212, 66, 114, C('#9aa2ab'), 3);
  p.line(58, 212, 82, 114, C('#9aa2ab'), 3);
  for (let k = 1; k < 7; k++) {
    const t = k / 7;
    p.line(40 + 26 * t, 212 - 98 * t, 58 + 24 * t, 212 - 98 * t, C('#c3c9cf'), 2);
  }
  s.on(chute);
  for (let k = 0; k <= 60; k++) {
    const t = k / 60;
    const x = 166 + t * 130;
    const y = 112 + Math.sin(t * Math.PI * 0.5) * 82 + (t > 0.9 ? -((t - 0.9) * 60) : 0);
    p.rect(x, y - 2, 3, 16, (xx, yy) => shade(C('#f2c21b'), yy - y < 2 ? 0.75 : 1 - (yy - y) * 0.012));
    p.rect(x, y - 5, 3, 3, C('#e0672a'));
  }
  const all = [tower, roofP, ladder, chute];
  s.blotch('grime', all, { scale: 12, cover: 0.55 });
  for (const [color, pts] of [['#e83f6f', [[74, 140], [84, 150], [72, 160], [84, 170]]], ['#3fb6e8', [[152, 130], [158, 160], [154, 190]]], ['#7a3fe8', [[92, 110], [140, 116]]]]) s.stroke('paint', pts, 3, C(color));
  s.dots('gum', 18, [170, 110, 120, 80], 1.4);
  s.coat('mud', lower(180, 214, 1.3), [ladder, tower]);
  s.splat('poop', 110, 34, 4, { drip: true });
  s.splat('poop', 130, 48, 3, { drip: true });
  return s;
}

// ---------- park statue ----------

function statue() {
  const s = new Scene();
  const p = s.on(0);
  yard(p, 196, { seed: 151, fence: false });
  p.rect(0, 210, 320, 30, (x, y) => concrete(x, y, 152, '#cfc8b8'));
  const fig = s.part('Statue');
  const ped = s.part('Pedestal');
  const plaque = s.part('Plaque');
  s.on(ped);
  p.rect(104, 150, 112, 8, vshade('#b3ada2', 150, 158, 1.15, 1));
  p.rect(112, 158, 96, 46, vshade('#a39d92', 158, 204));
  p.rect(98, 204, 124, 10, vshade('#9a948a', 204, 214));
  s.on(plaque);
  p.rect(136, 168, 48, 20, vshade('#b8873a', 168, 188));
  text(p, 'HERO', 160 - textWidth('HERO', 2) / 2, 173, '#5a3a14', 2);
  const stone = '#8f9a92';
  s.on(fig);
  p.rect(146, 112, 11, 38, vshade(stone, 112, 150));
  p.rect(163, 112, 11, 38, vshade(stone, 112, 150));
  p.poly([[142, 70], [178, 70], [182, 116], [138, 116]], vshade(stone, 70, 116));
  p.line(176, 76, 200, 30, C('#87928a'), 8);
  p.circle(201, 27, 6, ballShade(C(stone), 201, 27, 6, 6));
  p.line(144, 76, 132, 112, C('#87928a'), 7);
  p.rect(154, 62, 12, 10, vshade(stone, 62, 72));
  p.circle(160, 52, 12, ballShade(C(stone), 160, 50, 12, 12, 0.4));
  s.coat('grime', (x, y) => (noise(x / 2, y / 25, 153) > 0.55 ? 0.9 : 0), [fig, ped]);
  s.blotch('moss', ped, { scale: 8, cover: 0.55, extra: lower(160, 214, 0.5) });
  s.blotch('moss', fig, { scale: 6, cover: 0.25 });
  for (const [x, y, r] of [[156, 42, 5], [166, 44, 4], [200, 20, 4], [186, 54, 4], [146, 72, 4], [176, 72, 5], [160, 90, 3], [150, 152, 4], [190, 152, 4], [124, 152, 3]]) s.splat('poop', x, y, r, { drip: true });
  s.blotch('grime', plaque, { scale: 4, cover: 0.65 });
  return s;
}

// ---------- food truck ----------

function foodTruck() {
  const W = 420;
  const s = new Scene({ w: W });
  const p = s.on(0);
  street(p, 196, { seed: 161 });
  groundShadow(p, 210, 214, 190, 8, 0.6);
  const parts = vehicleParts(s, ['Awning', 'Serving hatch', 'Sign']);
  const { body, windows, front, back, bumpers, lights } = parts;
  s.on(body);
  p.roundRect(20, 52, 316, 140, 8, vshade('#3fb0a8', 52, 192));
  p.poly([[330, 192], [330, 76], [370, 80], [398, 130], [400, 192]], vshade('#3fb0a8', 76, 192));
  p.rect(20, 160, 380, 4, C('#f2f2ec'));
  for (const wx of [92, 340]) p.circle(wx, 194, 29, C('#1c1c1e'));
  s.on(windows).poly([[340, 84], [366, 86], [388, 124], [340, 124]], (x, y) => glass(x, y, 340, 84, 48, 40));
  s.on(parts['Serving hatch']);
  p.rect(116, 82, 148, 52, C('#2a2a2e'));
  p.rect(116, 126, 148, 10, vshade('#c8ccd2', 126, 136));
  for (let x = 124; x < 260; x += 24) p.rect(x, 96, 14, 30, C('#3a3b40'));
  s.on(parts.Awning);
  p.poly([[108, 66], [272, 66], [282, 82], [98, 82]], (x) => (Math.floor((x - 98) / 12) % 2 ? C('#f2f2ec') : C('#d8322e')));
  s.on(parts.Sign);
  p.rect(140, 30, 100, 24, vshade('#d8322e', 30, 54));
  text(p, 'TACOS', 190 - textWidth('TACOS', 4) / 2, 32, '#f2c21b', 4);
  s.on(bumpers);
  p.roundRect(14, 182, 24, 12, 3, C('#3a3b3f'));
  p.roundRect(380, 182, 24, 12, 3, C('#3a3b3f'));
  s.on(lights);
  p.roundRect(390, 140, 10, 10, 2, C('#f5edc6'));
  s.on(front);
  wheel(p, 340, 194, 24);
  s.on(back);
  wheel(p, 92, 194, 24);
  const all = [body, windows, front, back, bumpers, lights, parts.Awning, parts['Serving hatch'], parts.Sign];
  s.coat('grease', (x, y) => {
    const near = x > 96 && x < 286 && y > 70 && y < 190;
    return near ? fbm(x / 8, y / 8, 3, 162) * 2 - 0.55 + lower(80, 190, 0.4)(x, y) : 0;
  }, all);
  for (let k = 0; k < 14; k++) s.splat('food', 120 + hash(k, 1, 163) * 140, 132 + hash(k, 2, 163) * 40, 2 + hash(k, 3, 163) * 3, { color: C(['#c9481f', '#e8b94a', '#6a9a3a'][k % 3]), drip: true });
  s.blotch('grime', all, { scale: 14, cover: 0.5, extra: lower(120, 200, 0.4) });
  for (const [x, y] of [[150, 68], [220, 70], [180, 34], [260, 72]]) s.splat('poop', x, y, 4, { drip: true });
  s.blotch('mud', [front, back, bumpers], { scale: 6, cover: 0.7 });
  return s;
}

// ---------- school bus ----------

function bus() {
  const W = 600;
  const s = new Scene({ w: W });
  const p = s.on(0);
  street(p, 198, { seed: 171 });
  groundShadow(p, 300, 218, 280, 9, 0.6);
  const parts = vehicleParts(s, ['Stop sign']);
  const { body, windows, front, back, bumpers, lights } = parts;
  const yellow = '#f2b51c';
  s.on(body);
  p.roundRect(24, 66, 470, 128, 10, vshade(yellow, 66, 194));
  p.roundRect(470, 120, 106, 74, 8, vshade(yellow, 120, 194));
  for (const y of [128, 150, 178]) p.rect(24, y, 552, 3, C('#1d1d1f'));
  text(p, 'SCHOOL BUS', 160, 72, '#1d1d1f', 2);
  for (const wx of [110, 470]) p.circle(wx, 196, 31, C('#1c1c1e'));
  s.on(windows);
  for (let k = 0; k < 8; k++) {
    const x = 44 + k * 48;
    p.rect(x, 86, 38, 34, (xx, yy) => glass(xx, yy, x, 86, 38, 34));
  }
  p.poly([[448, 86], [490, 86], [500, 120], [448, 120]], (x, y) => glass(x, y, 448, 86, 52, 34));
  s.on(parts['Stop sign']);
  p.poly([[420, 136], [428, 130], [438, 130], [446, 136], [446, 146], [438, 152], [428, 152], [420, 146]], C('#d32f2f'));
  text(p, 'STOP', 423, 139, '#ffffff', 1);
  s.on(bumpers);
  p.roundRect(16, 184, 30, 12, 3, C('#2a2b2e'));
  p.roundRect(560, 184, 26, 12, 3, C('#2a2b2e'));
  s.on(lights);
  p.circle(570, 140, 5, C('#f5edc6'));
  p.rect(30, 74, 8, 8, C('#e0442a'));
  p.rect(480, 74, 8, 8, C('#e0442a'));
  s.on(front);
  wheel(p, 470, 196, 26);
  s.on(back);
  wheel(p, 110, 196, 26);
  const all = [body, windows, front, back, bumpers, lights, parts['Stop sign']];
  s.coat('mud', (x, y) => (fbm(x / 12, y / 12, 3, 172) + lower(130, 200, 0.9)(x, y)) * 1.6 - 0.95, all);
  s.blotch('grime', all, { scale: 16, cover: 0.5 });
  for (const [color, pts] of [['#e83f6f', [[200, 156], [214, 136], [226, 160], [240, 138], [252, 162]]], ['#3f8ae8', [[262, 140], [290, 140], [270, 164], [298, 164]]], ['#2ed14f', [[196, 168], [310, 166]]]]) s.stroke('paint', pts, 4, C(color));
  for (let k = 0; k < 9; k++) s.splat('poop', 40 + hash(k, 1, 173) * 440, 70 + hash(k, 2, 173) * 8, 3 + hash(k, 3, 173) * 2, { drip: true });
  s.dots('bugs', 50, [540, 120, 40, 60], 1);
  return s;
}

// ---------- swimming pool ----------

function pool() {
  const s = new Scene({ view: 'top' });
  const p = s.on(0);
  const deckP = s.part('Deck');
  s.on(deckP);
  slabs(p, 0, 0, 320, 240, 30, '#d8cfbd', 181);
  const coping = s.part('Coping');
  const basin = s.part('Pool');
  const stepsP = s.part('Steps');
  const l1 = s.part('Lounger 1');
  const l2 = s.part('Lounger 2');
  s.on(coping).rect(40, 30, 220, 180, C('#f2efe8'));
  s.on(basin).rect(46, 36, 208, 168, (x, y) => {
    const tile = (x - 46) % 8 === 0 || (y - 36) % 8 === 0;
    const depth = (x - 46) / 208;
    const base = mix(C('#8fd3e8'), C('#4aa3c8'), depth);
    if (y > 116 && y < 122 && x > 54 && x < 246) return C('#1d3f6a');
    return shade(base, tile ? 0.85 : 0.98 + hash(x, y, 2) * 0.04);
  });
  s.on(stepsP);
  for (let k = 0; k < 3; k++) p.rect(46, 36 + k * 10, 46 - k * 12, 9, shade(C('#e9f4f7'), 1 - k * 0.06));
  for (const [part, y] of [[l1, 52], [l2, 132]]) {
    s.on(part);
    p.roundRect(276, y, 36, 64, 6, C('#f4f4f0'));
    p.roundRect(280, y + 4, 28, 56, 5, (x, yy) => (Math.floor((yy - y) / 6) % 2 ? C('#3f7fbf') : C('#e9eef4')));
  }
  s.blotch('algae', basin, { scale: 14, cover: 0.85, extra: (x) => ((x - 46) / 208) * 0.3 });
  s.blotch('algae', stepsP, { scale: 6, cover: 0.6 });
  s.blotch('grime', [coping, deckP], { scale: 16, cover: 0.45 });
  s.blotch('moss', coping, { scale: 5, cover: 0.3 });
  for (const [x, y] of [[290, 70], [296, 150], [300, 100], [20, 60], [24, 200]]) s.splat('poop', x, y, 3);
  s.leaves(55, [10, 10, 300, 220]);
  return s;
}

// ---------- fire truck ----------

function fireTruck() {
  const W = 520;
  const s = new Scene({ w: W });
  const p = s.on(0);
  sky(p, 0, 40);
  bricks(p, 0, 20, W, 180, '#8f3f2e', '#c9bfb0', 12, 6, 191);
  for (const x of [30, 280]) p.rect(x, 50, 210, 150, (xx, yy) => shade(C('#3b3f46'), (yy - 50) % 14 === 0 ? 0.7 : 1));
  p.rect(0, 200, W, 40, (x, y) => concrete(x, y, 192, '#b9b4aa'));
  groundShadow(p, 260, 216, 240, 8, 0.6);
  const parts = vehicleParts(s, ['Lockers', 'Ladder']);
  const { body, windows, front, back, bumpers, lights } = parts;
  const red = '#c8201f';
  s.on(body);
  p.roundRect(20, 100, 390, 92, 6, vshade(red, 100, 192));
  p.roundRect(400, 76, 104, 116, 10, vshade(red, 76, 192));
  p.rect(20, 172, 484, 4, C('#f2f2ec'));
  for (const wx of [92, 156, 456]) p.circle(wx, 196, 27, C('#1c1c1e'));
  s.on(windows);
  p.poly([[420, 84], [490, 84], [500, 124], [420, 124]], (x, y) => glass(x, y, 420, 84, 80, 40));
  s.on(parts.Lockers);
  for (let k = 0; k < 4; k++) {
    const x = 34 + k * 92;
    p.rect(x, 112, 84, 54, (xx, yy) => shade(C('#c9ced6'), (yy - 112) % 5 === 4 ? 0.8 : 0.98 + ((xx * 3) % 7) * 0.006));
  }
  s.on(parts.Ladder);
  p.rect(26, 88, 448, 3, C('#d0d4da'));
  p.rect(26, 97, 448, 3, C('#d0d4da'));
  for (let x = 30; x < 474; x += 12) p.rect(x, 88, 2, 12, C('#b2b7be'));
  s.on(lights);
  p.rect(420, 68, 20, 8, C('#e0302a'));
  p.rect(444, 68, 20, 8, C('#2a6fe0'));
  p.roundRect(494, 140, 10, 10, 2, C('#f5edc6'));
  s.on(bumpers);
  p.roundRect(496, 184, 20, 12, 3, C('#c9ced6'));
  s.on(front);
  wheel(p, 456, 196, 23);
  s.on(back);
  wheel(p, 92, 196, 23);
  wheel(p, 156, 196, 23);
  const all = [body, windows, front, back, bumpers, lights, parts.Lockers, parts.Ladder];
  s.coat('soot', (x, y) => fbm(x / 13, y / 13, 4, 193) * 2.1 - 0.55 + (y < 120 ? 0.3 : 0), all);
  s.coat('mud', lower(160, 206, 1.4), all);
  s.blotch('grime', all, { scale: 10, cover: 0.4 });
  return s;
}

// ---------- skate park ----------

function skatePark() {
  const W = 480;
  const s = new Scene({ w: W, view: 'top' });
  const p = s.on(0);
  const ground = s.part('Ground');
  s.on(ground);
  slabs(p, 0, 0, W, 240, 40, '#c9c6bf', 201);
  const ramp1 = s.part('Left ramp');
  const bowl = s.part('Bowl');
  const ramp2 = s.part('Right ramp');
  const rail = s.part('Rail');
  s.on(ramp1).rect(10, 20, 90, 200, (x, y) => shade(concrete(x, y, 202, '#bdbab2'), 0.75 + ((x - 10) / 90) * 0.35));
  p.rect(10, 20, 4, 200, C('#8f959c'));
  s.on(ramp2).rect(380, 20, 90, 200, (x, y) => shade(concrete(x, y, 203, '#bdbab2'), 1.1 - ((x - 380) / 90) * 0.35));
  p.rect(466, 20, 4, 200, C('#8f959c'));
  s.on(bowl).roundRect(150, 40, 180, 160, 60, (x, y) => {
    const d = Math.min(1, Math.hypot((x - 240) / 90, (y - 120) / 80));
    return shade(concrete(x, y, 204, '#b5b2aa'), 0.72 + d * 0.38);
  });
  groundShadow(p, 240, 214, 70, 3, 0.7);
  s.on(rail).rect(170, 208, 140, 4, vshade('#9aa2ab', 208, 212, 1.3, 0.8));
  const all = [ground, ramp1, bowl, ramp2, rail];
  s.blotch('grime', all, { scale: 18, cover: 0.55 });
  const tags = [
    ['#e83f6f', [[20, 60], [40, 40], [60, 70], [80, 50], [92, 80]]],
    ['#3fb6e8', [[30, 120], [90, 110], [40, 160], [90, 170]]],
    ['#f2c21b', [[180, 90], [210, 70], [240, 100], [270, 70], [300, 95]]],
    ['#7ad13f', [[200, 140], [280, 150]]],
    ['#a35ae8', [[390, 60], [420, 90], [450, 60]]],
    ['#ff8a1f', [[392, 140], [440, 130], [400, 180], [456, 176]]],
  ];
  for (const [color, pts] of tags) s.stroke('paint', pts, 5, C(color));
  s.dots('gum', 40, [110, 10, 260, 220], 1.6);
  for (let k = 0; k < 6; k++) s.splat('food', 120 + hash(k, 1, 205) * 240, 20 + hash(k, 2, 205) * 200, 4 + hash(k, 3, 205) * 4, { color: C('#7a4a1a') });
  s.leaves(40, [5, 5, W - 10, 230]);
  return s;
}

// ---------- pirate ship ----------

function pirateShip() {
  const W = 560;
  const s = new Scene({ w: W });
  const p = s.on(0);
  sky(p, 0, 170, '#5c95d6', '#d9ecf5');
  clouds(p, 6, 80, 211);
  p.rect(0, 170, W, 70, (x, y) => {
    const wave = Math.sin(x / 9 + y * 0.8) > 0.6;
    return shade(C('#2f6fa8'), (wave ? 1.15 : 0.95) + (y - 170) * -0.003);
  });
  const hull = s.part('Hull');
  const trim = s.part('Trim');
  const ports = s.part('Gun ports');
  const rail = s.part('Rail');
  const masts = s.part('Masts');
  const sails = s.part('Sails');
  s.on(masts);
  for (const x of [190, 360]) p.rect(x, 4, 8, 112, vshade('#6e4a2c', 4, 116));
  s.on(sails);
  for (const [x, y, w, h] of [[146, 14, 96, 44], [140, 62, 108, 44], [316, 14, 96, 44], [310, 62, 108, 44]]) {
    p.rect(x, y, w, h, (xx, yy) => shade(C('#efe6cf'), 0.9 + Math.sin(((xx - x) / w) * Math.PI) * 0.1 - (hash(xx, yy, 1) > 0.97 ? 0.05 : 0)));
  }
  // A skull and crossbones on the big sail.
  p.circle(194, 80, 9, C('#1d1d1f'));
  p.rect(188, 86, 12, 6, C('#1d1d1f'));
  p.line(178, 96, 210, 104, C('#1d1d1f'), 3);
  p.line(178, 104, 210, 96, C('#1d1d1f'), 3);
  p.rect(190, 78, 3, 3, C('#efe6cf'));
  p.rect(196, 78, 3, 3, C('#efe6cf'));
  s.on(rail);
  p.rect(36, 102, 496, 4, C('#5a3a22'));
  for (let x = 40; x < 530; x += 14) p.rect(x, 102, 3, 14, C('#6e4a2c'));
  s.on(hull);
  p.poly([[30, 116], [540, 112], [520, 150], [470, 196], [80, 204], [40, 160]], (x, y) => {
    const row = Math.floor((y - 112) / 7);
    if ((y - 112) % 7 === 0) return C('#3e2614');
    return shade(C('#7a4a26'), 0.82 + hash(Math.floor((x + row * 37) / 46), row, 4) * 0.2 + noise(x / 20, row, 5) * 0.08);
  });
  p.poly([[530, 112], [556, 96], [552, 106], [536, 124]], C('#7a4a26'));
  s.on(trim).rect(34, 116, 504, 4, C('#d6a53a'));
  s.on(ports);
  for (let x = 70; x < 500; x += 54) {
    p.rect(x, 132, 16, 14, C('#c8322e'));
    p.rect(x + 3, 135, 10, 8, C('#141414'));
  }
  s.coat('barnacles', (x, y) => (y > 160 ? fbm(x / 4, y / 4, 2, 212) * 2.2 - 0.6 : 0), hull);
  s.coat('algae', (x, y) => (fbm(x / 9, y / 9, 3, 213) + lower(130, 204, 0.9)(x, y)) * 1.6 - 0.95, hull);
  s.blotch('grime', [hull, trim, ports, rail, masts], { scale: 14, cover: 0.45 });
  s.blotch('grime', sails, { scale: 10, cover: 0.3 });
  for (let k = 0; k < 14; k++) s.splat('poop', 150 + hash(k, 1, 214) * 270, 16 + hash(k, 2, 214) * 90, 3 + hash(k, 3, 214) * 2, { drip: true });
  return s;
}

// ---------- dinosaur skeleton ----------

function dino() {
  const W = 480;
  const s = new Scene({ w: W });
  const p = s.on(0);
  p.rect(0, 0, W, 196, (x, y) => shade(C('#e6dcc8'), 0.94 + (y % 40 === 0 ? -0.06 : 0) + hash(x, y, 2) * 0.03));
  for (const x of [40, 380]) {
    p.rect(x, 40, 60, 44, C('#6e4a2c'));
    p.rect(x + 5, 45, 50, 34, C(x === 40 ? '#5d8fb0' : '#c97a4a'));
  }
  p.rect(0, 196, W, 44, (x, y) => (((Math.floor(x / 24) + Math.floor(y / 12)) % 2) ? C('#8f7a62') : C('#a08a70')));
  for (const x of [20, 460]) {
    p.rect(x, 170, 4, 28, C('#d6a53a'));
    p.circle(x + 2, 168, 4, C('#d6a53a'));
  }
  p.line(24, 176, 460, 176, C('#a8322e'), 2);
  const bone = (x, y) => shade(C('#ece2c8'), 0.9 + noise(x / 4, y / 4, 3) * 0.15);
  const skull = s.part('Skull');
  const spine = s.part('Spine');
  const ribs = s.part('Ribs');
  const legs = s.part('Legs');
  const tailP = s.part('Tail');
  const stand = s.part('Stand');
  s.on(stand);
  p.rect(150, 190, 220, 8, C('#4a4d52'));
  for (const x of [190, 300, 380]) p.rect(x, 110, 4, 80, C('#6a6e75'));
  s.on(legs);
  p.line(250, 120, 232, 160, bone, 10);
  p.line(232, 160, 246, 190, bone, 7);
  p.line(282, 118, 270, 160, bone, 10);
  p.line(270, 160, 290, 190, bone, 7);
  p.rect(236, 188, 22, 5, bone);
  p.rect(282, 188, 22, 5, bone);
  p.line(150, 112, 156, 130, bone, 3);
  s.on(spine);
  for (let k = 0; k <= 16; k++) {
    const t = k / 16;
    const x = 110 + t * 200;
    const y = 94 + Math.sin(t * Math.PI) * -14;
    p.circle(x, y, 5, bone);
    p.line(x, y, x - 2, y - 9, bone, 2);
  }
  s.on(ribs);
  for (let k = 0; k < 9; k++) {
    const x = 150 + k * 12;
    for (let t = 0; t <= 20; t++) p.set(x + Math.sin((t / 20) * Math.PI) * 6, 92 + t * (2.4 - Math.abs(k - 4) * 0.12), bone);
    for (let t = 0; t <= 20; t++) p.set(x + 1 + Math.sin((t / 20) * Math.PI) * 6, 92 + t * (2.4 - Math.abs(k - 4) * 0.12), bone);
  }
  s.on(tailP);
  for (let k = 0; k <= 20; k++) {
    const t = k / 20;
    p.circle(316 + t * 150, 98 + t * 26 - Math.sin(t * Math.PI) * 8, 5 - t * 3, bone);
  }
  s.on(skull);
  p.poly([[40, 70], [70, 54], [110, 60], [122, 84], [106, 98], [60, 98], [42, 88]], bone);
  p.poly([[46, 96], [104, 100], [96, 112], [56, 110]], bone);
  for (let x = 50; x < 104; x += 6) {
    p.poly([[x, 96], [x + 3, 96], [x + 1, 102]], C('#fbf6e8'));
    p.poly([[x + 2, 100], [x + 5, 100], [x + 3, 95]], C('#fbf6e8'));
  }
  p.circle(92, 72, 7, C('#3a3226'));
  p.ellipse(64, 74, 8, 6, C('#3a3226'));
  const bones = [skull, spine, ribs, legs, tailP];
  p.edges(bones, 0.62, 1.1);
  s.blotch('dust', bones, { scale: 9, cover: 0.9 });
  s.blotch('dust', stand, { scale: 6, cover: 0.6 });
  s.blotch('grime', bones, { scale: 12, cover: 0.3 });
  const webs = s.part('Cobwebs');
  s.cobweb(150, 92, 30, 1, 1, webs);
  s.cobweb(250, 120, 26, -1, 1, webs);
  s.cobweb(270, 160, 22, 1, 1, webs);
  s.cobweb(60, 98, 18, 1, 1, webs);
  s.cobweb(380, 110, 26, -1, 1, webs);
  return s;
}

// ---------- space rocket ----------

function rocket() {
  const s = new Scene();
  const p = s.on(0);
  sky(p, 0, 200, '#3a2f6b', '#f2a65a');
  for (let k = 0; k < 30; k++) p.set(hash(k, 1, 7) * 320, hash(k, 2, 7) * 80, C('#ffffff'));
  p.rect(0, 200, 320, 40, (x, y) => concrete(x, y, 221, '#9a9690'));
  const tower = s.part('Tower');
  const pad = s.part('Launch pad');
  const fins = s.part('Fins');
  const engines = s.part('Engines');
  const bodyP = s.part('Body');
  const nose = s.part('Nose cone');
  const win = s.part('Window');
  s.on(tower);
  for (const x of [36, 64]) p.rect(x, 30, 5, 172, C('#c8322e'));
  for (let y = 36; y < 200; y += 14) {
    p.line(36, y, 68, y + 14, C('#a8281f'));
    p.line(68, y, 36, y + 14, C('#a8281f'));
  }
  for (const y of [70, 130]) p.rect(68, y, 92, 4, C('#a8281f'));
  s.on(pad).rect(110, 200, 160, 12, vshade('#6a6e75', 200, 212));
  s.on(engines);
  for (const x of [172, 190, 208]) p.poly([[x - 5, 186], [x + 5, 186], [x + 8, 202], [x - 8, 202]], vshade('#4a4d52', 186, 202));
  s.on(bodyP).rect(166, 50, 48, 140, (x, y) => ballShade(C('#f2f2ee'), 190, 120, 24, 400, 0.6)(x, y));
  p.rect(166, 120, 48, 4, C('#c8322e'));
  text(p, 'SPLASH', 190 - textWidth('SPLASH', 1) / 2, 140, '#2a3a6a', 1);
  s.on(nose).poly([[166, 52], [214, 52], [196, 18], [190, 6], [184, 18]], (x, y) => ballShade(C('#c8322e'), 190, 40, 24, 60, 0.6)(x, y));
  s.on(fins);
  p.poly([[166, 150], [166, 192], [146, 200], [146, 176]], vshade('#c8322e', 150, 200));
  p.poly([[214, 150], [214, 192], [234, 200], [234, 176]], vshade('#c8322e', 150, 200));
  s.on(win);
  p.circle(190, 80, 9, C('#c9ced6'));
  p.circle(190, 80, 7, (x, y) => glass(x, y, 183, 73, 14, 14));
  const all = [bodyP, nose, fins, engines];
  s.coat('soot', (x, y) => fbm(x / 8, y / 8, 3, 222) * 1.6 + lower(110, 205, 1.2)(x, y) - 0.85, [...all, win, pad]);
  s.blotch('grime', [...all, tower], { scale: 12, cover: 0.45 });
  s.blotch('dust', [bodyP, nose, win], { scale: 8, cover: 0.4 });
  s.splat('poop', 190, 12, 3, { drip: true });
  s.splat('poop', 200, 30, 4, { drip: true });
  return s;
}

export const JOBS = [
  { id: 'football', name: 'Muddy Football', pay: 40, build: football },
  { id: 'doormat', name: 'Welcome Mat', pay: 50, build: doormat },
  { id: 'pig', name: 'Muddy Pig', pay: 55, build: pig },
  { id: 'plates', name: 'Dinner Plates', pay: 60, build: plates },
  { id: 'gnome', name: 'Garden Gnome', pay: 70, build: gnome },
  { id: 'car', name: 'Family Car', pay: 150, build: familyCar },
  { id: 'patio', name: 'Patio', pay: 120, build: patio },
  { id: 'bins', name: 'Wheelie Bins', pay: 90, build: bins },
  { id: 'footballer', name: 'Muddy Footballer', pay: 100, build: footballer },
  { id: 'driveway', name: 'Driveway', pay: 200, build: driveway },
  { id: 'deck', name: 'Wooden Deck', pay: 180, build: deck },
  { id: 'fence', name: 'Garden Fence', pay: 160, build: fence },
  { id: 'cow', name: 'Muddy Cow', pay: 150, build: cow },
  { id: 'pickup', name: 'Pickup Truck', pay: 220, build: pickup },
  { id: 'slide', name: 'Playground Slide', pay: 220, build: slide },
  { id: 'house', name: 'House Front', pay: 400, build: house },
  { id: 'statue', name: 'Park Statue', pay: 250, build: statue },
  { id: 'foodtruck', name: 'Food Truck', pay: 350, build: foodTruck },
  { id: 'bus', name: 'School Bus', pay: 500, build: bus },
  { id: 'pool', name: 'Swimming Pool', pay: 450, build: pool },
  { id: 'firetruck', name: 'Fire Truck', pay: 450, build: fireTruck },
  { id: 'skatepark', name: 'Skate Park', pay: 450, build: skatePark },
  { id: 'dino', name: 'Dinosaur Skeleton', pay: 500, build: dino },
  { id: 'ship', name: 'Pirate Ship', pay: 600, build: pirateShip },
  { id: 'rocket', name: 'Space Rocket', pay: 800, build: rocket },
];
