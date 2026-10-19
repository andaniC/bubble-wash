// Shapes as signed distance functions (negative inside), smoothly merged, then
// meshed with surface nets. The meshes come out dense and evenly spread, so
// dirt (stored per vertex) can be washed off any spot of any shape.
//
// Every shape carries an axis-aligned bounding box in `fn.box` so the mesher
// knows where to look.

const INF = 1e6;
const withBox = (fn, min, max) => Object.assign(fn, { box: [min, max] });

// Euler XYZ rotation (same convention as three.js), local → world, row-major.
function rotation([rx = 0, ry = 0, rz = 0]) {
  const a = Math.cos(rx);
  const b = Math.sin(rx);
  const c = Math.cos(ry);
  const d = Math.sin(ry);
  const e = Math.cos(rz);
  const f = Math.sin(rz);
  return [c * e, -c * f, d, a * f + b * e * d, a * e - b * f * d, -b * c, b * f - a * e * d, b * e + a * f * d, a * c];
}

// Returns a function mapping a world point into the shape's local frame.
function frame(c, rot) {
  const [cx, cy, cz] = c;
  const out = [0, 0, 0];
  if (!rot) {
    return (x, y, z) => {
      out[0] = x - cx;
      out[1] = y - cy;
      out[2] = z - cz;
      return out;
    };
  }
  const m = rotation(rot);
  return (x, y, z) => {
    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;
    out[0] = m[0] * dx + m[3] * dy + m[6] * dz;
    out[1] = m[1] * dx + m[4] * dy + m[7] * dz;
    out[2] = m[2] * dx + m[5] * dy + m[8] * dz;
    return out;
  };
}

function boxAround(c, r) {
  return [[c[0] - r, c[1] - r, c[2] - r], [c[0] + r, c[1] + r, c[2] + r]];
}

export function sphere(c, r) {
  const [cx, cy, cz] = c;
  return withBox((x, y, z) => {
    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
  }, ...boxAround(c, r));
}

export function ellipsoid(c, r, rot) {
  const [rx, ry, rz] = r;
  const to = frame(c, rot);
  const fn = (x, y, z) => {
    const p = to(x, y, z);
    const ax = p[0] / rx;
    const ay = p[1] / ry;
    const az = p[2] / rz;
    const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
    const bx = ax / rx;
    const by = ay / ry;
    const bz = az / rz;
    const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
  };
  if (rot) return withBox(fn, ...boxAround(c, Math.max(rx, ry, rz)));
  return withBox(fn, [c[0] - rx, c[1] - ry, c[2] - rz], [c[0] + rx, c[1] + ry, c[2] + rz]);
}

// A capsule from a (radius r1) to b (radius r2).
export function roundCone(a, b, r1, r2) {
  const [ax, ay, az] = a;
  const bax = b[0] - ax;
  const bay = b[1] - ay;
  const baz = b[2] - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const fn = (x, y, z) => {
    const pax = x - ax;
    const pay = y - ay;
    const paz = z - az;
    const py = pax * bax + pay * bay + paz * baz;
    const pz = py - l2;
    const qx = pax * l2 - bax * py;
    const qy = pay * l2 - bay * py;
    const qz = paz * l2 - baz * py;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = py * py * l2;
    const z2 = pz * pz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(pz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(py) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + py * rr) * il2 - r1;
  };
  const r = Math.max(r1, r2);
  return withBox(
    fn,
    [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r],
    [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r]
  );
}

export function roundBox(c, half, round, rot) {
  const [hx, hy, hz] = half;
  const to = frame(c, rot);
  const fn = (x, y, z) => {
    const p = to(x, y, z);
    const qx = Math.abs(p[0]) - hx + round;
    const qy = Math.abs(p[1]) - hy + round;
    const qz = Math.abs(p[2]) - hz + round;
    const mx = Math.max(qx, 0);
    const my = Math.max(qy, 0);
    const mz = Math.max(qz, 0);
    return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - round;
  };
  if (rot) return withBox(fn, ...boxAround(c, Math.sqrt(hx * hx + hy * hy + hz * hz)));
  return withBox(fn, [c[0] - hx, c[1] - hy, c[2] - hz], [c[0] + hx, c[1] + hy, c[2] + hz]);
}

// Cylinder of radius r and half-length h along an axis, edges rounded by e.
export function roundCylinder(c, r, h, e, axis = 'y') {
  const to = frame(c);
  const fn = (x, y, z) => {
    const p = to(x, y, z);
    let rad;
    let along;
    if (axis === 'x') {
      rad = Math.sqrt(p[1] * p[1] + p[2] * p[2]);
      along = p[0];
    } else if (axis === 'z') {
      rad = Math.sqrt(p[0] * p[0] + p[1] * p[1]);
      along = p[2];
    } else {
      rad = Math.sqrt(p[0] * p[0] + p[2] * p[2]);
      along = p[1];
    }
    const dx = rad - (r - e);
    const dy = Math.abs(along) - (h - e);
    const mx = Math.max(dx, 0);
    const my = Math.max(dy, 0);
    return Math.min(Math.max(dx, dy), 0) + Math.sqrt(mx * mx + my * my) - e;
  };
  const ext = [axis === 'x' ? h : r, axis === 'y' ? h : r, axis === 'z' ? h : r];
  return withBox(fn, [c[0] - ext[0], c[1] - ext[1], c[2] - ext[2]], [c[0] + ext[0], c[1] + ext[1], c[2] + ext[2]]);
}

export function torus(c, R, r, axis = 'y') {
  const to = frame(c);
  const fn = (x, y, z) => {
    const p = to(x, y, z);
    let rad;
    let along;
    if (axis === 'x') {
      rad = Math.sqrt(p[1] * p[1] + p[2] * p[2]);
      along = p[0];
    } else if (axis === 'z') {
      rad = Math.sqrt(p[0] * p[0] + p[1] * p[1]);
      along = p[2];
    } else {
      rad = Math.sqrt(p[0] * p[0] + p[2] * p[2]);
      along = p[1];
    }
    const q = rad - R;
    return Math.sqrt(q * q + along * along) - r;
  };
  return withBox(fn, ...boxAround(c, R + r));
}

// Everything on the side of the plane n·p = d that n points away from.
export function halfspace(n, d) {
  const len = Math.hypot(...n);
  const [nx, ny, nz] = n.map((v) => v / len);
  return withBox((x, y, z) => nx * x + ny * y + nz * z - d / len, [-INF, -INF, -INF], [INF, INF, INF]);
}

export const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a, b, k) => -smin(-a, -b, k);

function unionBox(fns, grow) {
  const min = [INF, INF, INF];
  const max = [-INF, -INF, -INF];
  for (const f of fns) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], f.box[0][i] - grow);
      max[i] = Math.max(max[i], f.box[1][i] + grow);
    }
  }
  return [min, max];
}

export function blend(k, ...fns) {
  const fn = k > 0
    ? (x, y, z) => {
        let d = fns[0](x, y, z);
        for (let i = 1; i < fns.length; i++) d = smin(d, fns[i](x, y, z), k);
        return d;
      }
    : (x, y, z) => {
        let d = fns[0](x, y, z);
        for (let i = 1; i < fns.length; i++) d = Math.min(d, fns[i](x, y, z));
        return d;
      };
  return withBox(fn, ...unionBox(fns, k * 0.25));
}

export function cut(a, b, k = 0) {
  const fn = k > 0 ? (x, y, z) => smax(a(x, y, z), -b(x, y, z), k) : (x, y, z) => Math.max(a(x, y, z), -b(x, y, z));
  return withBox(fn, a.box[0], a.box[1]);
}

export function clip(a, b, k = 0) {
  const fn = k > 0 ? (x, y, z) => smax(a(x, y, z), b(x, y, z), k) : (x, y, z) => Math.max(a(x, y, z), b(x, y, z));
  const min = a.box[0].map((v, i) => Math.max(v, b.box[0][i]));
  const max = a.box[1].map((v, i) => Math.min(v, b.box[1][i]));
  return withBox(fn, min, max);
}

export function offset(a, by) {
  return withBox((x, y, z) => a(x, y, z) - by, a.box[0].map((v) => v - by), a.box[1].map((v) => v + by));
}

const EDGES = [];
for (let c = 0; c < 8; c++) for (const bit of [1, 2, 4]) if (!(c & bit)) EDGES.push([c, c | bit]);

// Surface nets: one vertex per grid cell the surface passes through, quads
// across every grid edge where the sign changes.
export function polygonize(sdf, min, max, cell) {
  const pad = cell * 2;
  const ox = min[0] - pad;
  const oy = min[1] - pad;
  const oz = min[2] - pad;
  const nx = Math.ceil((max[0] - min[0] + 2 * pad) / cell) + 1;
  const ny = Math.ceil((max[1] - min[1] + 2 * pad) / cell) + 1;
  const nz = Math.ceil((max[2] - min[2] + 2 * pad) / cell) + 1;
  const field = new Float32Array(nx * ny * nz);

  // Sample a coarse grid first; far from the surface the coarse value is
  // close enough, so exact distances are only computed near the surface.
  const C = 4;
  const cnx = Math.ceil((nx - 1) / C) + 1;
  const cny = Math.ceil((ny - 1) / C) + 1;
  const cnz = Math.ceil((nz - 1) / C) + 1;
  const coarse = new Float32Array(cnx * cny * cnz);
  let q = 0;
  for (let k = 0; k < cnz; k++) {
    for (let j = 0; j < cny; j++) {
      for (let i = 0; i < cnx; i++) coarse[q++] = sdf(ox + i * C * cell, oy + j * C * cell, oz + k * C * cell);
    }
  }
  const far = (C * 0.5 * Math.sqrt(3) + 2) * cell;
  q = 0;
  for (let k = 0; k < nz; k++) {
    const z = oz + k * cell;
    const ck = Math.min(cnz - 1, Math.round(k / C));
    for (let j = 0; j < ny; j++) {
      const y = oy + j * cell;
      const cj = Math.min(cny - 1, Math.round(j / C));
      for (let i = 0; i < nx; i++) {
        const dc = coarse[Math.min(cnx - 1, Math.round(i / C)) + cnx * (cj + cny * ck)];
        field[q++] = Math.abs(dc) > far ? dc : sdf(ox + i * cell, y, z);
      }
    }
  }

  const F = (i, j, k) => field[i + nx * (j + ny * k)];
  const cx = nx - 1;
  const cy = ny - 1;
  const cz = nz - 1;
  const cellVert = new Int32Array(cx * cy * cz).fill(-1);
  const pos = [];
  const v = new Float32Array(8);
  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = F(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1));
          if (v[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [a, b] of EDGES) {
          if (v[a] < 0 === v[b] < 0) continue;
          const t = v[a] / (v[a] - v[b]);
          sx += (a & 1) + t * ((b & 1) - (a & 1));
          sy += ((a >> 1) & 1) + t * (((b >> 1) & 1) - ((a >> 1) & 1));
          sz += ((a >> 2) & 1) + t * (((b >> 2) & 1) - ((a >> 2) & 1));
          n++;
        }
        cellVert[i + cx * (j + cy * k)] = pos.length / 3;
        pos.push(ox + (i + sx / n) * cell, oy + (j + sy / n) * cell, oz + (k + sz / n) * cell);
      }
    }
  }

  const V = (i, j, k) => cellVert[i + cx * (j + cy * k)];
  const tris = [];
  const quad = (a, b, c, d, flip) => {
    if (flip) tris.push(a, c, b, a, d, c);
    else tris.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < cz; k++) {
    for (let j = 1; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        const a = F(i, j, k) < 0;
        if (a === F(i + 1, j, k) < 0) continue;
        quad(V(i, j - 1, k - 1), V(i, j, k - 1), V(i, j, k), V(i, j - 1, k), !a);
      }
    }
  }
  for (let k = 1; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 1; i < cx; i++) {
        const a = F(i, j, k) < 0;
        if (a === F(i, j + 1, k) < 0) continue;
        quad(V(i - 1, j, k - 1), V(i - 1, j, k), V(i, j, k), V(i, j, k - 1), !a);
      }
    }
  }
  for (let k = 0; k < cz; k++) {
    for (let j = 1; j < cy; j++) {
      for (let i = 1; i < cx; i++) {
        const a = F(i, j, k) < 0;
        if (a === F(i, j, k + 1) < 0) continue;
        quad(V(i - 1, j - 1, k), V(i, j - 1, k), V(i, j, k), V(i - 1, j, k), !a);
      }
    }
  }

  const positions = new Float32Array(pos);
  const normals = new Float32Array(pos.length);
  const h = cell * 0.5;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    const gx = sdf(x + h, y, z) - sdf(x - h, y, z);
    const gy = sdf(x, y + h, z) - sdf(x, y - h, z);
    const gz = sdf(x, y, z + h) - sdf(x, y, z - h);
    const len = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    normals[i] = gx / len;
    normals[i + 1] = gy / len;
    normals[i + 2] = gz / len;
  }
  return { positions, normals, indices: new Uint32Array(tris) };
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

// A part is a list of [shape, colour] pieces merged with smoothness k. The
// colour at a point is the colour of the nearest piece; a colour can be an
// sRGB triple or a function of the position.
export function partShape(part) {
  let sdf = blend(part.k ?? 0.04, ...part.pieces.map((p) => p[0]));
  for (const c of part.cuts || []) sdf = cut(sdf, c, part.cutK || 0);
  for (const c of part.clips || []) sdf = clip(sdf, c, part.clipK || 0);
  return sdf;
}

export function buildPart(part, cell) {
  const shapes = part.pieces.map((p) => p[0]);
  const sdf = partShape(part);
  const [min, max] = sdf.box;
  const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const mesh = polygonize(sdf, min, max, Math.min(cell, size / 26));

  const count = mesh.positions.length / 3;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const x = mesh.positions[i * 3];
    const y = mesh.positions[i * 3 + 1];
    const z = mesh.positions[i * 3 + 2];
    let best = 0;
    let bestD = Infinity;
    for (let s = 0; s < shapes.length; s++) {
      const d = shapes[s](x, y, z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    const col = part.pieces[best][1];
    const rgb = typeof col === 'function' ? col(x, y, z) : col;
    colors[i * 3] = toLinear(Math.min(1, Math.max(0, rgb[0])));
    colors[i * 3 + 1] = toLinear(Math.min(1, Math.max(0, rgb[1])));
    colors[i * 3 + 2] = toLinear(Math.min(1, Math.max(0, rgb[2])));
  }
  return { ...mesh, colors };
}
