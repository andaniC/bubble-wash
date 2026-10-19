// A pixel canvas for drawing the job scenes. Every call writes exact pixels
// (no smoothing) and tags each pixel with the part it belongs to, so the game
// knows what is the car body, a window, a wheel, or just background.
//
// Colours are packed 0xAABBGGRR, the byte order ImageData uses.

export function rgba(r, g, b, a = 255) {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function col(hex) {
  const n = parseInt(hex.slice(1), 16);
  return rgba((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
export const red = (c) => c & 255;
export const green = (c) => (c >>> 8) & 255;
export const blue = (c) => (c >>> 16) & 255;

export function shade(c, k) {
  return rgba(clamp(red(c) * k), clamp(green(c) * k), clamp(blue(c) * k));
}

export function mix(a, b, t) {
  return rgba(
    clamp(red(a) + (red(b) - red(a)) * t),
    clamp(green(a) + (green(b) - green(a)) * t),
    clamp(blue(a) + (blue(b) - blue(a)) * t)
  );
}

export function hash(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

export function noise(x, y, s = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const a = hash(xi, yi, s);
  const b = hash(xi + 1, yi, s);
  const c = hash(xi, yi + 1, s);
  const d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, oct = 4, s = 0) {
  let amp = 0.5;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * noise(x * f, y * f, s + o * 7);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

// Picks between two colours with an ordered dither, for pixel-art gradients.
export function dither(a, b, t, x, y) {
  return t > bayer(x, y) ? b : a;
}

export class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint32Array(w * h);
    this.part = new Uint8Array(w * h);
    this.cur = 0;
  }

  // c: a colour, or a function (x, y, oldColour) => colour (null to skip).
  set(x, y, c) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    const v = typeof c === 'function' ? c(x, y, this.data[i]) : c;
    if (v == null) return;
    this.data[i] = v;
    this.part[i] = this.cur;
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y | 0) * this.w + (x | 0)];
  }

  partAt(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.part[(y | 0) * this.w + (x | 0)];
  }

  span(y, x0, x1, c) {
    for (let x = Math.round(x0); x <= Math.round(x1); x++) this.set(x, y, c);
  }

  rect(x, y, w, h, c) {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++) this.span(yy, x, x + w - 1, c);
  }

  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
      const t = (y - cy) / ry;
      const half = rx * Math.sqrt(Math.max(0, 1 - t * t));
      this.span(y, cx - half, cx + half, c);
    }
  }

  circle(cx, cy, r, c) {
    this.ellipse(cx, cy, r, r, c);
  }

  roundRect(x, y, w, h, r, c) {
    for (let yy = 0; yy < h; yy++) {
      let inset = 0;
      if (yy < r) inset = r - Math.sqrt(Math.max(0, r * r - (r - yy - 0.5) ** 2));
      else if (yy >= h - r) inset = r - Math.sqrt(Math.max(0, r * r - (yy - (h - r) + 0.5) ** 2));
      this.span(y + yy, x + Math.round(inset), x + w - 1 - Math.round(inset), c);
    }
  }

  // Filled polygon, points as [x, y] pairs.
  poly(pts, c) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
    for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) this.span(y, Math.ceil(xs[i]), Math.floor(xs[i + 1]), c);
    }
  }

  line(x0, y0, x1, y1, c, w = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      if (w <= 1) this.set(Math.round(x), Math.round(y), c);
      else this.circle(x, y, w / 2, c);
    }
  }

  // Recolours every pixel of the given part(s): fn(x, y, colour) => colour.
  each(parts, fn) {
    const set = new Set([].concat(parts));
    for (let i = 0; i < this.data.length; i++) {
      if (!set.has(this.part[i])) continue;
      const v = fn(i % this.w, (i / this.w) | 0, this.data[i]);
      if (v != null) this.data[i] = v;
    }
  }

  // Darkens the inner edge of a part (pixel-art outline), lightens the top.
  edges(parts, dark = 0.6, light = 1.18) {
    const set = new Set([].concat(parts));
    const out = [];
    const { w, h } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!set.has(this.part[i])) continue;
        const inside = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && set.has(this.part[yy * w + xx]);
        if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y + 1)) out.push([i, dark]);
        else if (!inside(x, y - 1)) out.push([i, light]);
      }
    }
    for (const [i, k] of out) this.data[i] = shade(this.data[i], k);
  }
}

// Shading for round things: light from the top left.
export function ballShade(base, cx, cy, rx, ry, strength = 0.45) {
  return (x, y) => {
    const nx = (x - cx) / rx;
    const ny = (y - cy) / ry;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const l = 0.62 + strength * (-0.45 * nx - 0.55 * ny + 0.7 * nz);
    return shade(base, l + (bayer(x, y) - 0.5) * 0.06);
  };
}
