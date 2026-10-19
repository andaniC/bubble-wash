import { col, shade, mix, dither, hash, fbm, noise, bayer, ballShade } from './pix.js';

// Reusable pixel-art pieces for the job scenes.

export const c = (hex) => col(hex);

// Sky with dithered bands, like old console games.
export function sky(p, y0, y1, top = '#4f8fd8', bottom = '#cde6f6') {
  const a = col(top);
  const b = col(bottom);
  const steps = 7;
  for (let y = y0; y < y1; y++) {
    const f = ((y - y0) / Math.max(1, y1 - y0)) * steps;
    const k = Math.floor(f);
    const c0 = mix(a, b, k / steps);
    const c1 = mix(a, b, Math.min(steps, k + 1) / steps);
    for (let x = 0; x < p.w; x++) p.set(x, y, dither(c0, c1, f - k, x, y));
  }
}

export function clouds(p, n, yMax, seed = 1) {
  const white = col('#ffffff');
  const shadow = col('#dbe7f2');
  for (let i = 0; i < n; i++) {
    const cx = hash(i, 1, seed) * p.w;
    const cy = 12 + hash(i, 2, seed) * (yMax - 24);
    const size = 6 + hash(i, 3, seed) * 10;
    for (let k = 0; k < 5; k++) {
      const x = cx + (k - 2) * size * 0.8;
      const y = cy - Math.sin((k / 4) * Math.PI) * size * 0.6;
      p.ellipse(x, y + 2, size, size * 0.6, shadow);
      p.ellipse(x, y, size * 0.95, size * 0.55, white);
    }
  }
}

// Distant rounded tree tops along a line.
export function treeLine(p, yBase, color = '#5d8a4a', seed = 2, height = 22) {
  const base = col(color);
  const dark = shade(base, 0.8);
  for (let x = -10; x < p.w + 10; x += 9) {
    const r = height * (0.5 + hash(x, 1, seed) * 0.5);
    p.circle(x + hash(x, 2, seed) * 6, yBase - r * 0.6, r, (xx, yy) => ((yy + xx) % 7 === 0 ? dark : dither(dark, base, 0.6, xx, yy)));
  }
  p.rect(0, yBase - 2, p.w, p.h - yBase + 2, dark);
}

export function grass(p, x0, y0, w, h, seed = 3) {
  const g1 = col('#5f9a3c');
  const g2 = col('#6fae46');
  const g3 = col('#4f8532');
  p.rect(x0, y0, w, h, (x, y) => {
    const n = fbm(x / 9, y / 9, 3, seed);
    const blade = hash(x, y, seed) > 0.9 ? g3 : null;
    return blade || (n > 0.55 ? g2 : n < 0.42 ? g3 : g1);
  });
}

export function concrete(x, y, seed = 4, base = '#bdb8ae') {
  const b = col(base);
  const n = fbm(x / 12, y / 12, 3, seed) * 0.12 + hash(x, y, seed) * 0.06;
  return shade(b, 0.92 + n);
}

// Large square slabs with dark joints (top-down).
export function slabs(p, x0, y0, w, h, size, base = '#bdb8ae', seed = 5) {
  const joint = shade(col(base), 0.62);
  p.rect(x0, y0, w, h, (x, y) => {
    const lx = (x - x0) % size;
    const ly = (y - y0) % size;
    if (lx === 0 || ly === 0) return joint;
    const tone = 0.95 + hash(Math.floor((x - x0) / size), Math.floor((y - y0) / size), seed) * 0.1;
    return shade(concrete(x, y, seed, base), tone);
  });
}

export function planks(p, x0, y0, w, h, ph, base = '#a0703f', seed = 6, vertical = false) {
  const b = col(base);
  const gap = shade(b, 0.45);
  p.rect(x0, y0, w, h, (x, y) => {
    const a = vertical ? x - x0 : y - y0;
    const along = vertical ? y : x;
    const row = Math.floor(a / ph);
    if (a % ph === 0) return gap;
    const offset = hash(row, 1, seed) * 200;
    if ((along + offset) % 90 < 1) return gap;
    const grain = noise((vertical ? along / 18 : along / 18) + row * 9, (a % ph) / 2, seed) * 0.16;
    return shade(b, 0.88 + grain + hash(row, 2, seed) * 0.08);
  });
}

export function bricks(p, x0, y0, w, h, base = '#a5503a', mortar = '#d2c8b8', bw = 9, bh = 4, seed = 7) {
  const b = col(base);
  const m = col(mortar);
  p.rect(x0, y0, w, h, (x, y) => {
    const row = Math.floor((y - y0) / bh);
    const lx = (x - x0 + (row % 2) * Math.floor(bw / 2)) % bw;
    if ((y - y0) % bh === 0 || lx === 0) return m;
    const brick = Math.floor((x - x0 + (row % 2) * Math.floor(bw / 2)) / bw);
    return shade(b, 0.85 + hash(brick, row, seed) * 0.25 + hash(x, y, seed) * 0.06);
  });
}

export function siding(p, x0, y0, w, h, base = '#e2e6e9', board = 5) {
  const b = col(base);
  p.rect(x0, y0, w, h, (x, y) => {
    const k = (y - y0) % board;
    return shade(b, k === board - 1 ? 0.78 : k === 0 ? 1.06 : 1);
  });
}

// Glass with a sky reflection and a diagonal shine.
export function glass(x, y, x0, y0, w, h) {
  const t = (y - y0) / h;
  const base = mix(col('#9fc3dc'), col('#3d5a73'), t * 0.9);
  const d = (x - x0) - (y - y0) * 0.7;
  if (d > w * 0.25 && d < w * 0.25 + 3) return mix(base, col('#ffffff'), 0.55);
  if (d > w * 0.25 + 5 && d < w * 0.25 + 6) return mix(base, col('#ffffff'), 0.35);
  return base;
}

export function windowPane(p, x, y, w, h, frame = '#f4f4f0', glassPart, framePart) {
  if (framePart != null) p.cur = framePart;
  p.rect(x - 2, y - 2, w + 4, h + 4, col(frame));
  if (glassPart != null) p.cur = glassPart;
  p.rect(x, y, w, h, (xx, yy) => glass(xx, yy, x, y, w, h));
  if (framePart != null) p.cur = framePart;
  p.rect(x + Math.floor(w / 2), y, 1, h, col(frame));
}

export function wheel(p, cx, cy, r, rim = '#c8ccd2') {
  const tyre = col('#26262a');
  p.circle(cx, cy, r, (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    return d > r - 1.2 ? shade(tyre, 0.7) : shade(tyre, 1 + (hash(Math.round(Math.atan2(y - cy, x - cx) * 10), 0, 3) > 0.5 ? 0.15 : 0));
  });
  const rr = r * 0.6;
  p.circle(cx, cy, rr, ballShade(col(rim), cx, cy, rr, rr, 0.5));
  p.circle(cx, cy, rr * 0.35, shade(col(rim), 0.6));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    p.line(cx + Math.cos(a) * rr * 0.4, cy + Math.sin(a) * rr * 0.4, cx + Math.cos(a) * rr * 0.92, cy + Math.sin(a) * rr * 0.92, shade(col(rim), 0.7));
  }
}

// Darkens whatever is under an ellipse (a soft ground shadow).
export function groundShadow(p, cx, cy, rx, ry, k = 0.7) {
  for (let y = Math.ceil(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.ceil(cx - rx); x <= cx + rx; x++) {
      const t = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (t > 1) continue;
      const i = y * p.w + x;
      if (x < 0 || y < 0 || x >= p.w || y >= p.h) continue;
      if (t < 0.6 || bayer(x, y) > (t - 0.6) / 0.4) p.data[i] = shade(p.data[i], k);
    }
  }
}

// A 3×5 pixel font.
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111',
  2: '110001010100111', 3: '110001010001110', 4: '101101111001001', 5: '111100110001110',
  6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
  '!': '010010010000010', '.': '000000000000010', '-': '000000111000000', ' ': '000000000000000',
};

export function text(p, str, x, y, color, s = 1) {
  const cc = typeof color === 'string' ? col(color) : color;
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const g = FONT[ch] || FONT[' '];
    for (let row = 0; row < 5; row++) {
      for (let k = 0; k < 3; k++) if (g[row * 3 + k] === '1') p.rect(cx + k * s, y + row * s, s, s, cc);
    }
    cx += 4 * s;
  }
  return cx - x;
}

export const textWidth = (str, s = 1) => str.length * 4 * s - s;

// The yard backdrop used by many side-view jobs.
export function yard(p, groundY, { seed = 1, fence = true, top, bottom } = {}) {
  sky(p, 0, groundY, top, bottom);
  clouds(p, 4, groundY * 0.6, seed);
  treeLine(p, groundY - 18, '#6c9a54', seed + 1, 18);
  if (fence) {
    const wood = col('#b98a5a');
    for (let x = 0; x < p.w; x++) {
      for (let y = groundY - 30; y < groundY; y++) {
        const k = x % 8;
        p.set(x, y, k === 0 ? shade(wood, 0.6) : shade(wood, 0.9 + hash(Math.floor(x / 8), 1, seed) * 0.15));
      }
      if (x % 8 === 0) for (let y = groundY - 33; y < groundY - 30; y++) p.set(x + 4, y, wood);
    }
  }
  grass(p, 0, groundY, p.w, p.h - groundY, seed);
}

export function street(p, groundY, { seed = 1 } = {}) {
  sky(p, 0, groundY - 10);
  clouds(p, 4, groundY * 0.5, seed);
  // Houses across the street.
  for (let x = -20; x < p.w; x += 70) {
    const w = 50 + hash(x, 1, seed) * 15;
    const h = 40 + hash(x, 2, seed) * 20;
    const wall = col(['#e8d5b0', '#c9d7e0', '#e7c4b4', '#d9e2c8'][Math.floor(hash(x, 3, seed) * 4)]);
    const top = groundY - 10 - h;
    p.rect(x, top, w, h, (xx, yy) => shade(wall, 0.92 + (yy % 4 === 0 ? -0.05 : 0)));
    p.poly([[x - 4, top], [x + w / 2, top - 18], [x + w + 4, top]], shade(col('#8a4b3a'), 0.95));
    for (let wx = x + 8; wx < x + w - 10; wx += 16) p.rect(wx, top + 10, 8, 10, col('#5d7e96'));
  }
  // Pavement and road.
  p.rect(0, groundY - 10, p.w, 10, (x, y) => (x % 24 === 0 ? col('#9a968c') : concrete(x, y, seed, '#c9c4b8')));
  p.rect(0, groundY, p.w, p.h - groundY, (x, y) => {
    const n = hash(x, y, seed) * 0.08 + fbm(x / 20, y / 20, 2, seed) * 0.06;
    return shade(col('#55585e'), 0.95 + n);
  });
  p.rect(0, groundY, p.w, 2, col('#8f8b82'));
}
