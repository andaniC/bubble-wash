import { sphere, ellipsoid, roundCone, roundBox, roundCylinder, halfspace, clip, cut, offset } from './sdf.js';
import { fbm3, noise3, seeded } from './noise.js';

// Every washable object, modelled in metres, facing +z, standing on y = 0.
// A model is a list of parts (one mesh and material each); a part is a list
// of [shape, colour] pieces. `size` is how big it is in the yard.

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const near = (x, y, z, c, r) => (x - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2 < r * r;
const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const plane = (n, p) => halfspace(norm(n), dot(norm(n), p));

// Slight blotchy variation so colours don't look flat.
const grain = (c, amount = 0.06, freq = 5, seed = 3) => (x, y, z) => {
  const n = (noise3(x * freq, y * freq, z * freq, seed) - 0.5) * 2 * amount;
  return c.map((v) => v * (1 + n));
};

const GROUND = halfspace([0, -1, 0], 0);
const SIDES = [1, -1];
const HIDE = { roughness: 0.85 };
const PLASTIC = { roughness: 0.35 };
const PAINT = { roughness: 0.24, metalness: 0.35 };
const GLASS = { roughness: 0.05, metalness: 0.25 };
const RUBBER = { roughness: 0.9 };
const CHROME = { roughness: 0.28, metalness: 0.85 };
const LAMP = { roughness: 0.1 };

function eyes(spots, r, color = hex('#130e0c')) {
  return { pieces: spots.map((c) => [sphere(c, r), color]), k: 0, clean: true, material: { roughness: 0.08 } };
}

// ---------- balls ----------

function beachball(v) {
  const sets = [
    ['#e8473f', '#ffffff', '#2f7fe0', '#ffcd2e', '#ffffff', '#2fae6a'],
    ['#ff7a59', '#fff2d6', '#ff9ec4', '#ffd23f', '#fff2d6', '#9f86e8'],
  ];
  const cols = sets[v % sets.length].map(hex);
  const color = (x, y, z) => {
    if (Math.abs((y - 0.45) / 0.45) > 0.94) return [1, 1, 1];
    const a = Math.atan2(x, z);
    return cols[Math.floor(((a + Math.PI) / (2 * Math.PI)) * 6) % 6];
  };
  return {
    name: 'beach ball',
    size: 0.9,
    sound: 'boing',
    parts: [{ pieces: [[sphere([0, 0.45, 0], 0.45), color]], material: PLASTIC }],
  };
}

// The classic black-and-white football: a truncated icosahedron projected
// onto the sphere (pentagons at the icosahedron's corners, hexagons at its faces).
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO = [
  [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
  [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
  [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1],
].map(norm);
const ICO_FACES = [];
for (let i = 0; i < 12; i++) {
  for (let j = i + 1; j < 12; j++) {
    for (let k = j + 1; k < 12; k++) {
      if (dot(ICO[i], ICO[j]) > 0.4 && dot(ICO[j], ICO[k]) > 0.4 && dot(ICO[i], ICO[k]) > 0.4) {
        ICO_FACES.push(norm([0, 1, 2].map((a) => ICO[i][a] + ICO[j][a] + ICO[k][a])));
      }
    }
  }
}

function football() {
  const c = [0, 0.35, 0];
  const color = (x, y, z) => {
    const d = norm([x - c[0], y - c[1], z - c[2]]);
    let best = -1;
    let second = -1;
    let pent = false;
    for (const n of ICO) {
      const s = dot(d, n) / 2.3274;
      if (s > best) {
        second = best;
        best = s;
        pent = true;
      } else if (s > second) second = s;
    }
    for (const n of ICO_FACES) {
      const s = dot(d, n) / 2.2673;
      if (s > best) {
        second = best;
        best = s;
        pent = false;
      } else if (s > second) second = s;
    }
    if (best - second < 0.0035) return hex('#3a3a3c');
    return pent ? hex('#141416') : hex('#f5f5f2');
  };
  return {
    name: 'football',
    size: 0.7,
    sound: 'boing',
    parts: [{ pieces: [[sphere(c, 0.35), color]], material: { roughness: 0.45 } }],
  };
}

// ---------- animals ----------

function duck(v) {
  const body = hex(['#ffd23a', '#ff9ec4'][v % 2]);
  const orange = hex('#ff8a1f');
  const pieces = [
    [ellipsoid([0, 0.42, -0.05], [0.5, 0.4, 0.62]), body],
    [ellipsoid([0, 0.46, 0.28], [0.42, 0.36, 0.38]), body],
    [ellipsoid([0, 0.64, -0.5], [0.25, 0.22, 0.24], [-0.6, 0, 0]), body],
    [sphere([0, 0.98, 0.24], 0.31), body],
  ];
  for (const s of SIDES) pieces.push([ellipsoid([0.43 * s, 0.5, -0.1], [0.1, 0.22, 0.34], [0.2, 0, 0.25 * s]), body]);
  return {
    name: 'rubber duck',
    size: 1.0,
    sound: 'squeak',
    parts: [
      { pieces, k: 0.14, clips: [GROUND], material: PLASTIC },
      {
        pieces: [
          [ellipsoid([0, 0.93, 0.56], [0.16, 0.055, 0.15]), orange],
          [ellipsoid([0, 0.875, 0.53], [0.12, 0.04, 0.11]), orange],
        ],
        k: 0.03,
        material: PLASTIC,
      },
      {
        pieces: SIDES.flatMap((s) => [
          [ellipsoid([0.13 * s, 1.06, 0.45], [0.075, 0.085, 0.05], [0, 0.45 * s, 0]), [1, 1, 1]],
          [sphere([0.145 * s, 1.06, 0.49], 0.042), hex('#141210')],
        ]),
        k: 0,
        clean: true,
        material: { roughness: 0.1 },
      },
    ],
  };
}

function teddy(v) {
  const fur = grain(hex(['#9a6a43', '#e0b06a'][v % 2]), 0.08, 9);
  const light = hex(['#d9b48b', '#f3dcb0'][v % 2]);
  const pieces = [
    [ellipsoid([0, 0.5, 0], [0.33, 0.38, 0.29]), fur],
    [ellipsoid([0, 0.48, 0.17], [0.22, 0.26, 0.13]), light],
    [sphere([0, 1.02, 0.02], 0.29), fur],
    [ellipsoid([0, 0.95, 0.24], [0.14, 0.1, 0.1]), light],
    [ellipsoid([0, 1.0, 0.335], [0.05, 0.035, 0.03]), hex('#2a1d18')],
  ];
  for (const s of SIDES) {
    pieces.push(
      [sphere([0.21 * s, 1.25, -0.02], 0.1), fur],
      [ellipsoid([0.21 * s, 1.25, 0.05], [0.06, 0.06, 0.03]), light],
      [roundCone([0.28 * s, 0.72, 0.04], [0.4 * s, 0.42, 0.18], 0.1, 0.09), fur],
      [roundCone([0.17 * s, 0.22, 0.05], [0.2 * s, 0.12, 0.34], 0.13, 0.12), fur],
      [ellipsoid([0.2 * s, 0.13, 0.44], [0.08, 0.08, 0.03]), light]
    );
  }
  return {
    name: 'teddy bear',
    size: 1.1,
    line: 'Big hug!',
    parts: [
      { pieces, k: 0.05, clips: [GROUND], material: { roughness: 0.95 } },
      eyes(SIDES.map((s) => [0.1 * s, 1.08, 0.26]), 0.03),
    ],
  };
}

function pig() {
  const skin = grain(hex('#f2a7b0'), 0.05, 6);
  const deep = hex('#e48a98');
  const hoof = hex('#5a3f3a');
  const snout = (x, y, z) => (SIDES.some((s) => near(x, y, z, [0.045 * s, 0.55, 0.91], 0.028)) ? hex('#8e4a57') : deep);
  const pieces = [
    [ellipsoid([0, 0.56, -0.05], [0.36, 0.34, 0.6]), skin],
    [ellipsoid([0, 0.6, 0.5], [0.29, 0.28, 0.26]), skin],
    [roundCylinder([0, 0.55, 0.82], 0.13, 0.09, 0.04, 'z'), snout],
    [roundCone([0, 0.62, -0.62], [0.06, 0.7, -0.7], 0.035, 0.03), skin],
    [roundCone([0.06, 0.7, -0.7], [0, 0.77, -0.68], 0.03, 0.025), skin],
  ];
  for (const s of SIDES) {
    pieces.push([ellipsoid([0.17 * s, 0.84, 0.5], [0.11, 0.028, 0.13], [0.7, 0, 0.45 * s]), deep]);
    for (const z of [0.33, -0.4]) {
      pieces.push(
        [roundCone([0.19 * s, 0.42, z], [0.19 * s, 0.06, z + 0.02], 0.09, 0.07), skin],
        [roundCone([0.19 * s, 0.07, z + 0.02], [0.19 * s, 0, z + 0.02], 0.07, 0.068), hoof]
      );
    }
  }
  return {
    name: 'pig',
    size: 1.3,
    line: 'Oink oink!',
    parts: [
      { pieces, k: 0.06, clips: [GROUND], material: { roughness: 0.6 } },
      eyes(SIDES.map((s) => [0.13 * s, 0.7, 0.71]), 0.028),
    ],
  };
}

function dog(v) {
  const black = v % 2 === 1;
  const fur = grain(hex(black ? '#2a2422' : '#d8a45e'), 0.06, 5);
  const light = black ? fur : grain(hex('#efcd96'), 0.05, 5);
  const pieces = [
    [ellipsoid([0, 0.6, -0.08], [0.22, 0.24, 0.45]), fur],
    [ellipsoid([0, 0.63, 0.25], [0.23, 0.27, 0.24]), (x, y, z) => (y < 0.6 && z > 0.3 ? light(x, y, z) : fur(x, y, z))],
    [roundCone([0, 0.72, 0.34], [0, 0.92, 0.5], 0.15, 0.11), fur],
    [ellipsoid([0, 0.99, 0.56], [0.14, 0.14, 0.16]), fur],
    [ellipsoid([0, 0.93, 0.72], [0.08, 0.075, 0.13]), light],
    [sphere([0, 0.965, 0.84], 0.035), hex('#1a1414')],
    [roundCone([0, 0.72, -0.5], [0, 0.88, -0.82], 0.045, 0.022), fur],
  ];
  for (const s of SIDES) {
    pieces.push(
      [ellipsoid([0.145 * s, 0.94, 0.52], [0.035, 0.12, 0.08], [0, 0, 0.25 * s]), fur],
      [roundCone([0.12 * s, 0.58, 0.3], [0.12 * s, 0.05, 0.33], 0.065, 0.045), fur],
      [ellipsoid([0.12 * s, 0.035, 0.36], [0.05, 0.035, 0.07]), light],
      [roundCone([0.13 * s, 0.62, -0.38], [0.14 * s, 0.32, -0.48], 0.09, 0.05), fur],
      [roundCone([0.14 * s, 0.32, -0.48], [0.13 * s, 0.05, -0.42], 0.05, 0.042), fur],
      [ellipsoid([0.13 * s, 0.035, -0.39], [0.05, 0.035, 0.07]), fur]
    );
  }
  return {
    name: 'dog',
    size: 1.15,
    line: 'Woof woof!',
    parts: [
      { pieces, k: 0.05, clips: [GROUND], material: { roughness: 0.9 } },
      eyes(SIDES.map((s) => [0.075 * s, 1.03, 0.675]), 0.022),
    ],
  };
}

function sheep() {
  const wool = grain(hex('#eee7da'), 0.05, 9);
  const face = hex('#2c2624');
  const rnd = seeded(7);
  const pieces = [[ellipsoid([0, 0.78, 0], [0.36, 0.34, 0.55]), wool]];
  for (let i = 0; i < 46; i++) {
    const d = norm([rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]);
    if (d[1] < -0.55) continue;
    const p = [d[0] * 0.36, 0.78 + d[1] * 0.34, d[2] * 0.55];
    pieces.push([sphere(p, 0.1 + rnd() * 0.05), wool]);
  }
  pieces.push(
    [ellipsoid([0, 0.86, 0.62], [0.11, 0.13, 0.17], [0.5, 0, 0]), face],
    [sphere([0, 0.99, 0.55], 0.11), wool],
    [sphere([0, 0.74, -0.6], 0.09), wool]
  );
  for (const s of SIDES) {
    pieces.push([ellipsoid([0.13 * s, 0.92, 0.57], [0.09, 0.025, 0.045], [0, 0, -0.3 * s]), face]);
    for (const z of [0.32, -0.32]) pieces.push([roundCone([0.17 * s, 0.52, z], [0.17 * s, 0, z + 0.01], 0.05, 0.04), face]);
  }
  return {
    name: 'sheep',
    size: 1.35,
    line: 'Baa!',
    parts: [
      { pieces, k: 0.04, clips: [GROUND], material: { roughness: 0.95 } },
      eyes(SIDES.map((s) => [0.078 * s, 0.92, 0.7]), 0.022, hex('#b38a3e')),
    ],
  };
}

function cow(v) {
  const jersey = v % 2 === 1;
  const white = hex('#f2efe9');
  const black = hex('#18171b');
  const pink = hex('#e4a39b');
  const hoof = hex('#2b2624');
  const horn = hex('#e6d9bf');
  const brown = grain(hex('#93603a'), 0.06, 4);
  const tan = hex('#c9a072');
  const hide = jersey
    ? (x, y, z) => mix(tan, brown(x, y, z), smoothstep(0.75, 1.15, y))
    : (x, y, z) => (fbm3(x * 1.4 + 11.3, y * 1.4 + 4.1, z * 1.4 + 2.7, 3) > 0.52 ? black : white);
  const nose = jersey ? hex('#2e2522') : pink;
  const muzzle = (x, y, z) => (SIDES.some((s) => near(x, y, z, [0.06 * s, 1.02, 1.5], 0.035)) ? hex('#3a2626') : nose);
  const pieces = [
    [ellipsoid([0, 1.0, 0], [0.42, 0.4, 0.82]), hide],
    [ellipsoid([0, 1.08, 0.48], [0.38, 0.39, 0.36]), hide],
    [ellipsoid([0, 1.1, -0.55], [0.41, 0.37, 0.36]), hide],
    [ellipsoid([0, 0.87, 0.05], [0.39, 0.33, 0.6]), hide],
    [roundCone([0, 1.1, 0.7], [0, 1.22, 0.98], 0.3, 0.2), hide],
    [ellipsoid([0, 1.2, 1.12], [0.19, 0.21, 0.28], [0.55, 0, 0]), hide],
    [ellipsoid([0, 1.0, 1.36], [0.165, 0.14, 0.15]), muzzle],
    [ellipsoid([0, 0.66, -0.28], [0.16, 0.12, 0.17]), pink],
    [roundCone([0, 1.2, -0.88], [0, 0.6, -0.97], 0.045, 0.025), hide],
    [ellipsoid([0, 0.5, -0.97], [0.06, 0.11, 0.06]), jersey ? hex('#2e2522') : black],
  ];
  for (const s of SIDES) {
    pieces.push(
      [ellipsoid([0.25 * s, 1.31, 1.03], [0.14, 0.045, 0.08], [0, 0.2 * s, -0.4 * s]), hide],
      [roundCone([0.11 * s, 1.37, 1.02], [0.22 * s, 1.46, 1.0], 0.035, 0.014), horn],
      [roundCone([0.22 * s, 0.98, 0.52], [0.21 * s, 0.5, 0.57], 0.14, 0.085), hide],
      [roundCone([0.21 * s, 0.5, 0.57], [0.2 * s, 0.12, 0.6], 0.085, 0.07), hide],
      [roundCone([0.2 * s, 0.13, 0.6], [0.2 * s, 0, 0.61], 0.075, 0.072), hoof],
      [roundCone([0.22 * s, 1.02, -0.58], [0.23 * s, 0.56, -0.73], 0.18, 0.09), hide],
      [roundCone([0.23 * s, 0.56, -0.73], [0.21 * s, 0.12, -0.64], 0.088, 0.07), hide],
      [roundCone([0.21 * s, 0.13, -0.64], [0.21 * s, 0, -0.63], 0.075, 0.072), hoof],
      [roundCone([0.06 * s, 0.6, -0.22], [0.06 * s, 0.52, -0.22], 0.022, 0.018), pink],
      [roundCone([0.06 * s, 0.6, -0.34], [0.06 * s, 0.52, -0.34], 0.022, 0.018), pink]
    );
  }
  return {
    name: 'cow',
    size: 2.5,
    line: 'Moo!',
    parts: [
      { pieces, k: 0.07, clips: [GROUND], material: HIDE },
      eyes(SIDES.map((s) => [0.155 * s, 1.27, 1.22]), 0.042),
    ],
  };
}

function horse(v) {
  const grey = v % 2 === 1;
  const coat = grain(hex(grey ? '#c9c4bd' : '#8a4a26'), 0.05, 3);
  const mane = hex(grey ? '#ebe7e0' : '#2a1a12');
  const hoof = hex('#2a2522');
  const face = (x, y, z) => (!grey && Math.abs(x) < 0.04 && z > 1.12 ? hex('#f3efe8') : coat(x, y, z));
  const pieces = [
    [ellipsoid([0, 1.38, 0], [0.32, 0.36, 0.78]), coat],
    [ellipsoid([0, 1.38, 0.5], [0.31, 0.38, 0.32]), coat],
    [ellipsoid([0, 1.42, -0.55], [0.33, 0.38, 0.36]), coat],
    [roundCone([0, 1.55, 0.62], [0, 2.08, 0.98], 0.25, 0.14), coat],
    [roundCone([0, 2.12, 1.02], [0, 1.82, 1.38], 0.14, 0.095), face],
    [ellipsoid([0, 2.22, 1.06], [0.05, 0.08, 0.04]), mane],
    [roundCone([0, 1.6, -0.86], [0, 0.9, -1.05], 0.08, 0.06), mane],
    [roundCone([0, 0.9, -1.05], [0, 0.55, -1.0], 0.06, 0.03), mane],
  ];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    pieces.push([ellipsoid([0, 1.84 + 0.43 * t, 0.56 + 0.36 * t], [0.05, 0.1, 0.07], [-0.6, 0, 0]), mane]);
  }
  for (const s of SIDES) {
    pieces.push(
      [roundCone([0.07 * s, 2.22, 0.98], [0.08 * s, 2.36, 0.96], 0.035, 0.01), coat],
      [roundCone([0.17 * s, 1.2, 0.55], [0.16 * s, 0.62, 0.58], 0.12, 0.065), coat],
      [roundCone([0.16 * s, 0.62, 0.58], [0.16 * s, 0.12, 0.57], 0.06, 0.055), coat],
      [roundCone([0.16 * s, 0.12, 0.57], [0.16 * s, 0, 0.58], 0.065, 0.07), hoof],
      [roundCone([0.18 * s, 1.25, -0.6], [0.18 * s, 0.68, -0.78], 0.15, 0.07), coat],
      [roundCone([0.18 * s, 0.68, -0.78], [0.17 * s, 0.12, -0.66], 0.065, 0.055), coat],
      [roundCone([0.17 * s, 0.12, -0.66], [0.17 * s, 0, -0.65], 0.065, 0.07), hoof]
    );
  }
  return {
    name: 'horse',
    size: 2.6,
    line: 'Neigh!',
    parts: [
      { pieces, k: 0.07, clips: [GROUND], material: { roughness: 0.6 } },
      eyes(SIDES.map((s) => [0.11 * s, 2.05, 1.12]), 0.03),
    ],
  };
}

// ---------- vehicles ----------

const TRIM = hex('#232427');
const TIRE = hex('#1c1c1f');

// Tyres plus a hub disc that sits just proud of each tyre's outer face.
function wheelParts(spots, radius, width, rimColor) {
  const rimHalf = width * 0.3;
  return [
    {
      pieces: spots.map(([x, y, z]) => [roundCylinder([x, y, z], radius, width / 2, radius * 0.17, 'x'), TIRE]),
      k: 0,
      material: RUBBER,
    },
    {
      pieces: spots.map(([x, y, z]) => {
        const out = Math.sign(x);
        const color = (px, py, pz) => {
          const a = Math.atan2(py - y, pz - z);
          return Math.cos(a * 5) > 0.35 ? rimColor : mix(rimColor, [0.1, 0.1, 0.1], 0.6);
        };
        return [roundCylinder([x + out * (width / 2 - rimHalf + 0.012), y, z], radius * 0.6, rimHalf, 0.015, 'x'), color];
      }),
      k: 0,
      material: CHROME,
    },
  ];
}

function car(v) {
  const paintC = hex(['#c8201f', '#1f5fbf', '#f2f2ef', '#f2b51c'][v % 4]);
  const cabin = clip(
    clip(roundBox([0, 1.1, -0.28], [0.76, 0.34, 1.12], 0.2), plane([0, 0.62, 0.78], [0, 1.4, 0.62]), 0.12),
    plane([0, 0.7, -0.6], [0, 1.36, -1.25]),
    0.1
  );
  const paint = (x, y, z) => {
    if (y < 0.44) return TRIM;
    if (z > 1.86 && y < 0.72 && Math.abs(x) < 0.52) return Math.floor(y * 40) % 2 ? hex('#151618') : TRIM;
    return paintC;
  };
  const wheels = [];
  for (const s of SIDES) for (const z of [1.28, -1.28]) wheels.push([0.78 * s, 0.36, z]);
  const glass = cut(
    clip(clip(offset(cabin, 0.022), halfspace([0, -1, 0], -0.97)), halfspace([0, 1, 0], 1.36)),
    roundBox([0, 1.16, -0.3], [0.95, 0.25, 0.045], 0.01)
  );
  const body = [
    [roundBox([0, 0.64, 0], [0.87, 0.3, 1.98], 0.16), paint],
    [cabin, paintC],
  ];
  for (const s of SIDES) body.push([roundBox([0.86 * s, 1.0, 0.6], [0.06, 0.05, 0.1], 0.03), paintC]);
  return {
    name: 'car',
    size: 4.1,
    sound: 'honk',
    parts: [
      {
        pieces: body,
        k: 0.08,
        cuts: wheels.map(([x, y, z]) => roundCylinder([x * 1.1, y, z], 0.45, 0.32, 0.03, 'x')),
        cutK: 0.04,
        clips: [GROUND],
        material: PAINT,
      },
      { pieces: [[glass, hex('#1b2530')]], k: 0, material: GLASS, glass: true },
      {
        pieces: SIDES.flatMap((s) => [
          [ellipsoid([0.6 * s, 0.78, 1.95], [0.2, 0.075, 0.07]), hex('#f3f1e6')],
          [ellipsoid([0.64 * s, 0.82, -1.97], [0.16, 0.07, 0.05]), hex('#c81d27')],
        ]),
        k: 0,
        material: LAMP,
      },
      ...wheelParts(wheels, 0.36, 0.25, hex('#c9ccd1')),
    ],
  };
}

function van(v) {
  const paintC = hex(['#2b2f36', '#eeeeea', '#2c5ea8'][v % 3]);
  const shell = clip(roundBox([0, 1.2, -0.2], [0.98, 0.82, 2.3], 0.14), plane([0, 0.5, 0.87], [0, 1.45, 2.02]), 0.15);
  const paint = (x, y, z) => {
    if (y < 0.42) return TRIM;
    if (z > 2.36 && y > 0.55 && y < 0.95 && Math.abs(x) < 0.62) return Math.floor(y * 30) % 2 ? hex('#121315') : TRIM;
    return paintC;
  };
  const wheels = [];
  for (const s of SIDES) for (const z of [1.62, -1.55]) wheels.push([0.86 * s, 0.4, z]);
  const glass = clip(
    clip(clip(offset(shell, 0.022), halfspace([0, -1, 0], -1.3)), halfspace([0, 1, 0], 1.86)),
    halfspace([0, 0, -1], -0.95)
  );
  return {
    name: 'van',
    size: 5.0,
    sound: 'honk',
    parts: [
      {
        pieces: [
          [shell, paint],
          [roundBox([0, 0.82, 1.9], [0.96, 0.46, 0.6], 0.18), paint],
        ],
        k: 0.1,
        cuts: wheels.map(([x, y, z]) => roundCylinder([x * 1.1, y, z], 0.5, 0.3, 0.03, 'x')),
        cutK: 0.04,
        clips: [GROUND],
        material: PAINT,
      },
      { pieces: [[glass, hex('#1b2530')]], k: 0, material: GLASS, glass: true },
      {
        pieces: SIDES.flatMap((s) => [
          [ellipsoid([0.7 * s, 0.86, 2.47], [0.14, 0.1, 0.05]), hex('#f3f1e6')],
          [ellipsoid([0.9 * s, 1.0, -2.49], [0.06, 0.18, 0.04]), hex('#c81d27')],
        ]),
        k: 0,
        material: LAMP,
      },
      ...wheelParts(wheels, 0.4, 0.28, hex('#b9bdc3')),
    ],
  };
}

function tractor(v) {
  const paintC = hex(['#c8261f', '#2f8f3a'][v % 2]);
  const yellow = hex('#f2c21b');
  const dark = hex('#2a2b2e');
  const hood = (x, y, z) => (z > 1.55 && y < 1.3 && Math.abs(x) < 0.28 ? (Math.floor(y * 30) % 2 ? dark : TRIM) : paintC);
  const body = [
    [roundBox([0, 1.12, 0.85], [0.36, 0.33, 0.78], 0.1), hood],
    [roundBox([0, 0.78, 0.75], [0.28, 0.22, 0.72], 0.06), dark],
    [roundBox([0, 1.05, -0.45], [0.52, 0.34, 0.55], 0.1), paintC],
    [roundBox([0, 1.5, -0.55], [0.22, 0.06, 0.2], 0.05), dark],
  ];
  for (const s of SIDES) body.push([roundBox([0.74 * s, 1.5, -0.5], [0.24, 0.05, 0.72], 0.04), paintC]);
  const frame = [
    [roundBox([0, 2.36, -0.5], [0.62, 0.05, 0.62], 0.03), hex('#efefea')],
    [roundCone([0.2, 1.4, 1.25], [0.2, 2.0, 1.25], 0.05, 0.045), dark],
  ];
  for (const s of SIDES) for (const z of [-0.05, -0.95]) frame.push([roundCone([0.5 * s, 1.35, z], [0.5 * s, 2.34, z], 0.04, 0.035), dark]);
  const rear = SIDES.map((s) => [0.78 * s, 0.74, -0.5]);
  const front = SIDES.map((s) => [0.5 * s, 0.42, 1.25]);
  return {
    name: 'tractor',
    size: 3.6,
    line: 'Vroom vroom!',
    parts: [
      { pieces: body, k: 0.04, material: { roughness: 0.35, metalness: 0.2 } },
      { pieces: frame, k: 0.02, material: { roughness: 0.4, metalness: 0.3 } },
      {
        pieces: SIDES.map((s) => [ellipsoid([0.2 * s, 1.28, 1.62], [0.07, 0.07, 0.04]), hex('#f3f1e6')]),
        k: 0,
        material: LAMP,
      },
      ...wheelParts(rear, 0.74, 0.4, yellow),
      ...wheelParts(front, 0.42, 0.24, yellow),
    ],
  };
}

export const MODELS = { beachball, football, duck, teddy, pig, dog, sheep, cow, horse, car, van, tractor };

export const VARIANTS = {
  beachball: 2, football: 1, duck: 2, teddy: 2, pig: 1, dog: 2,
  sheep: 1, cow: 2, horse: 2, car: 4, van: 3, tractor: 2,
};
