import { Pix, col, hash, fbm, noise } from './pix.js';

// Kinds of mess. `hard` is how long it takes to blast off. Some need the
// right tool: oil and grease barely move until they're soaped, gum needs the
// turbo nozzle, food comes off best with the sponge, dust and cobwebs blow
// away with the blower.
export const DIRT = {
  web: { name: 'Cobwebs', colors: ['#ececec', '#dadada', '#f6f6f6'], hard: 0.25, blow: 1 },
  poop: { name: 'Bird poop', colors: ['#f4f2ea', '#e1ded3', '#cfcbbf', '#ffffff'], hard: 1.1 },
  food: { name: 'Food', colors: ['#b8321f', '#c9481f', '#8a5a2b', '#e0b85a', '#9e2a18'], hard: 1, sponge: 3 },
  paint: { name: 'Graffiti', colors: ['#e83f6f'], hard: 2.4 },
  gum: { name: 'Gum', colors: ['#e58bb0', '#d4769d', '#a8a8a8'], hard: 4, turbo: true },
  bugs: { name: 'Bugs', colors: ['#2a2622', '#4a3b2a', '#6b7a2a', '#3a3328'], hard: 0.8 },
  dung: { name: 'Dung', colors: ['#5a4a22', '#4a3c1a', '#6b5a2a'], hard: 1.2 },
  oil: { name: 'Oil', colors: ['#1c1b20', '#25242a', '#2f2d35'], hard: 2, soap: true },
  grease: { name: 'Grease', colors: ['#4a3a22', '#5a4628', '#3c2f1c'], hard: 1.8, soap: true },
  mud: { name: 'Mud', colors: ['#6b4a2b', '#7a5533', '#5a3d22', '#87603a'], hard: 1 },
  barnacles: { name: 'Barnacles', colors: ['#b9b3a6', '#d6d0c2', '#8f897d', '#6f6a60'], hard: 3 },
  moss: { name: 'Moss', colors: ['#4f6b2a', '#5f7d33', '#3f5a22', '#71903e'], hard: 1.4 },
  algae: { name: 'Algae', colors: ['#3e7a3a', '#4d8c43', '#2f6630', '#5a9a4a'], hard: 1.1 },
  soot: { name: 'Soot', colors: ['#2a2a2a', '#353535', '#1f1f1f'], hard: 1.2 },
  grime: { name: 'Grime', colors: ['#56524a', '#4a463f', '#615c53'], hard: 0.9 },
  dust: { name: 'Dust', colors: ['#bba98a', '#ad9b7d', '#c6b597'], hard: 0.4, blow: 1 },
};

// Drawing order, top first: the first layer with mess on a pixel is what shows.
export const LAYER_ORDER = Object.keys(DIRT);

for (const d of Object.values(DIRT)) d.cols = d.colors.map(col);

export class Scene {
  constructor({ w = 320, h = 240, view = 'side' } = {}) {
    this.w = w;
    this.h = h;
    this.view = view; // 'side': dirty water runs down; 'top': looking down at the ground
    this.pix = new Pix(w, h);
    this.parts = [{ name: 'Background' }];
    this.layers = new Map();
    this.leafSpots = [];
    this.seed = Math.floor(Math.random() * 1000);
    this.claim = 0; // when set, mess may also land on background, which then joins this part
  }

  part(name) {
    this.parts.push({ name });
    return this.parts.length - 1;
  }

  // Draw into a part: subsequent pixels are tagged with its id.
  on(id) {
    this.pix.cur = id;
    return this.pix;
  }

  layer(type) {
    if (!this.layers.has(type)) {
      const n = this.w * this.h;
      this.layers.set(type, { type, def: DIRT[type], amount: new Uint8Array(n), color: new Uint32Array(n) });
    }
    return this.layers.get(type);
  }

  // Colour of a mess pixel: clumpy picks from the palette plus grain.
  tint(type, x, y) {
    const cols = DIRT[type].cols;
    const t = noise(x / 3.1, y / 3.1, this.seed + 3) * 0.75 + hash(x, y, this.seed) * 0.25;
    return cols[Math.min(cols.length - 1, Math.floor(t * cols.length))];
  }

  put(type, x, y, a, color) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (this.pix.part[i] === 0) {
      if (!this.claim) return;
      this.pix.part[i] = this.claim;
    }
    const L = this.layer(type);
    const v = Math.min(255, Math.round(a * 255));
    if (v <= L.amount[i]) return;
    L.amount[i] = v;
    L.color[i] = color ?? this.tint(type, x, y);
  }

  // Coat cleanable pixels: fn(x, y, part) returns how thick (0–1).
  coat(type, fn, parts) {
    const only = parts && new Set([].concat(parts));
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const p = this.pix.part[y * this.w + x];
        if (!p || (only && !only.has(p))) continue;
        const a = fn(x, y, p);
        if (a > 0) this.put(type, x, y, Math.min(1, a));
      }
    }
  }

  // Blotchy coat: patchy noise above a threshold.
  blotch(type, parts, { scale = 14, cover = 0.5, extra = () => 0 } = {}) {
    const s = this.seed + type.length * 13;
    this.coat(type, (x, y, p) => {
      const n = fbm(x / scale, y / scale, 4, s) + extra(x, y, p);
      return (n - (1 - cover) * 0.75) * 4;
    }, parts);
  }

  // An irregular splat. Bird poop on upright surfaces gets a drip.
  splat(type, cx, cy, r, { color, drip = false } = {}) {
    const s = hash(cx, cy, this.seed) * 100;
    for (let y = Math.floor(cy - r * 1.5); y <= cy + r * 1.5; y++) {
      for (let x = Math.floor(cx - r * 1.5); x <= cx + r * 1.5; x++) {
        const a = Math.atan2(y - cy, x - cx);
        const rr = r * (0.75 + 0.45 * noise(Math.cos(a) * 2 + s, Math.sin(a) * 2 + s, 9));
        if (Math.hypot(x - cx, y - cy) <= rr) this.put(type, x, y, 1, color);
      }
    }
    if (drip) {
      const len = r * (1.5 + hash(cx, cy, 4) * 3);
      for (let k = 0; k < len; k++) this.put(type, cx + (hash(cx, k, 2) > 0.8 ? 1 : 0), cy + r * 0.6 + k, 1, color);
    }
  }

  // A thick painted line (graffiti, tyre marks).
  stroke(type, pts, width, color) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let k = 0; k <= n; k++) {
        const x = x0 + ((x1 - x0) * k) / n;
        const y = y0 + ((y1 - y0) * k) / n;
        const r = width / 2;
        for (let yy = -r; yy <= r; yy++) {
          for (let xx = -r; xx <= r; xx++) {
            if (xx * xx + yy * yy <= r * r + 0.5) this.put(type, x + xx, y + yy, 0.9 + hash(x + xx, y + yy, 5) * 0.1, color);
          }
        }
      }
    }
  }

  // Little blobs scattered in a rectangle (gum, bugs, crumbs).
  dots(type, n, [x0, y0, w, h], size = 1.5) {
    for (let i = 0; i < n; i++) {
      const x = x0 + hash(i, 1, this.seed) * w;
      const y = y0 + hash(i, 2, this.seed) * h;
      this.splat(type, Math.round(x), Math.round(y), size * (0.6 + hash(i, 3, this.seed) * 0.8));
    }
  }

  // Thin wispy lines in a corner. Webs strung across empty space belong to
  // `part` (usually a 'Cobwebs' part) so they still count as something to clean.
  cobweb(cx, cy, r, dirX, dirY, part = 0) {
    this.claim = part;
    for (let k = 0; k < 7; k++) {
      const a = (k / 6) * (Math.PI / 2);
      const ex = cx + Math.cos(a) * r * dirX;
      const ey = cy + Math.sin(a) * r * dirY;
      this.stroke('web', [[cx, cy], [ex, ey]], 1);
    }
    for (let ring = 1; ring <= 4; ring++) {
      const rr = (ring / 4) * r;
      for (let k = 0; k < 6; k++) {
        const a0 = (k / 6) * (Math.PI / 2);
        const a1 = ((k + 1) / 6) * (Math.PI / 2);
        this.stroke('web', [
          [cx + Math.cos(a0) * rr * dirX, cy + Math.sin(a0) * rr * dirY],
          [cx + Math.cos(a1) * rr * dirX, cy + Math.sin(a1) * rr * dirY + 1],
        ], 1);
      }
    }
    this.claim = 0;
  }

  leaves(n, [x0, y0, w, h]) {
    for (let i = 0; i < n; i++) {
      this.leafSpots.push([x0 + hash(i, 7, this.seed) * w, y0 + hash(i, 8, this.seed) * h, Math.floor(hash(i, 9, this.seed) * 1000)]);
    }
  }
}
