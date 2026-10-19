import { TOY_VARIANTS } from './toys.js';

// Scene colours for each level.
export const THEMES = {
  bath: { top: '#c3e8f6', bottom: '#fbf3e4', floor: '#f6ecdb', line: '#ebdcc4', mat: '#9ad6ea' },
  farm: { top: '#cdeec4', bottom: '#fbf3df', floor: '#efe3c8', line: '#e2d2b0', mat: '#d8c08c' },
  beach: { top: '#bce9f0', bottom: '#fdf0d8', floor: '#f5e3bf', line: '#ecd5a8', mat: '#7fd3d8' },
  studio: { top: '#e3dcf7', bottom: '#fbf5ee', floor: '#f3ece4', line: '#e6dbd0', mat: '#c9b8ef' },
  garage: { top: '#d3dde6', bottom: '#f3f1ec', floor: '#e6e6e2', line: '#d6d6d0', mat: '#9fb3c4' },
  jungle: { top: '#c6ebd2', bottom: '#f5f6e6', floor: '#e5ead2', line: '#d4dcbc', mat: '#8fcf9f' },
  picnic: { top: '#d7efc9', bottom: '#fff6ea', floor: '#f7e8e0', line: '#efd5ca', mat: '#f2a7a0' },
  rain: { top: '#c9d6e3', bottom: '#eef2f4', floor: '#e3e9ec', line: '#d3dce1', mat: '#a7c4dc' },
  desert: { top: '#fbe0c2', bottom: '#fdf4e6', floor: '#f4dfc0', line: '#e9cfa6', mat: '#f0b27a' },
  kitchen: { top: '#fde3d3', bottom: '#fff7ef', floor: '#f6ece2', line: '#eadccd', mat: '#f6c28b' },
};

// The kinds of mess. `words` is how the voice describes a messy toy.
export const DIRT = {
  mud: {
    palette: [[104, 72, 42], [122, 86, 50], [92, 63, 36], [136, 98, 58]],
    texture: 'soft', rough: 0.95, tint: [0.26, 0.34, 0.48],
    words: (n) => `A muddy ${n}`,
  },
  sand: {
    palette: [[196, 160, 104], [210, 178, 124], [184, 148, 96]],
    texture: 'grains', rough: 1, tint: [0.06, 0.1, 0.2],
    words: (n) => `A sandy ${n}`,
  },
  paint: {
    palette: [[239, 83, 80], [61, 139, 234], [255, 196, 40], [53, 180, 124], [171, 104, 224], [255, 138, 42]],
    texture: 'drops', single: true, rough: 0.35, tint: [0, 0, 0],
    words: (n) => `Paint all over the ${n}`,
  },
  jam: {
    palette: [[196, 32, 72], [176, 24, 60], [214, 52, 92]],
    texture: 'wet', rough: 0.25, tint: [0.04, 0.2, 0.14],
    words: (n) => `A sticky ${n}`,
  },
  slime: {
    palette: [[118, 206, 40], [96, 186, 30], [146, 222, 62]],
    texture: 'wet', rough: 0.25, tint: [0.18, 0.04, 0.24],
    words: (n) => `A slimy ${n}`,
  },
  chocolate: {
    palette: [[84, 50, 30], [96, 58, 34], [72, 42, 24]],
    texture: 'wet', rough: 0.35, tint: [0.3, 0.4, 0.5],
    words: (n) => `A chocolatey ${n}`,
  },
};

// Hand-made levels. The towel step starts at level 4 and stubborn
// spots (which need a little extra scrubbing) at level 6.
const LEVELS = [
  { theme: 'bath', dirt: 'mud', toys: [['ball', 0], ['duck', 0], ['boat', 0]] },
  { theme: 'farm', dirt: 'mud', toys: [['piggy', 0], ['puppy', 0], ['tractor', 0]] },
  { theme: 'beach', dirt: 'sand', toys: [['ball', 1], ['boat', 2], ['duck', 1]] },
  { theme: 'studio', dirt: 'paint', toys: [['teddy', 0], ['kitty', 0], ['car', 0]] },
  { theme: 'garage', dirt: 'mud', toys: [['car', 1], ['truck', 0], ['tractor', 1]] },
  { theme: 'jungle', dirt: 'mud', toys: [['elephant', 0], ['frog', 0], ['dino', 0]] },
  { theme: 'picnic', dirt: 'jam', toys: [['teddy', 1], ['puppy', 1], ['kitty', 1]] },
  { theme: 'rain', dirt: 'slime', toys: [['truck', 1], ['car', 2], ['kitty', 1]] },
  { theme: 'desert', dirt: 'sand', toys: [['dino', 1], ['elephant', 1], ['ball', 2]] },
  { theme: 'kitchen', dirt: 'chocolate', toys: [['piggy', 0], ['kitty', 0], ['duck', 2]] },
  { theme: 'studio', dirt: 'paint', toys: [['truck', 0], ['tractor', 0], ['car', 3]] },
  { theme: 'bath', dirt: 'mud', toys: [['elephant', 0], ['dino', 0], ['teddy', 0]] },
];

export const MADE_LEVELS = LEVELS.length;

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Level n (starting at 1). After the hand-made ones, levels are generated
// from the level number, so level 20 is always the same level 20.
export function levelAt(n) {
  if (n <= LEVELS.length) {
    return { n, ...LEVELS[n - 1], spots: 16 + n, stubborn: n >= 6 ? 0.25 : 0, towel: n >= 4 };
  }
  const rnd = seeded(n * 9973);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const kinds = Object.keys(TOY_VARIANTS);
  const toys = [];
  while (toys.length < 3) {
    const kind = pick(kinds);
    if (toys.some(([k]) => k === kind)) continue;
    toys.push([kind, Math.floor(rnd() * TOY_VARIANTS[kind])]);
  }
  return {
    n,
    theme: pick(Object.keys(THEMES)),
    dirt: pick(Object.keys(DIRT)),
    toys,
    spots: 28,
    stubborn: 0.3,
    towel: true,
  };
}
