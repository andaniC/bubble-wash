import { VARIANTS } from './models.js';
import { DIRT_STYLES } from './dirt.js';
import { seeded } from './noise.js';

// Three things to wash per level. Later levels are messier (`cover`) and
// the mess is thicker (`thick`, so it takes a few more passes).
const LEVELS = [
  { time: 'day', dirt: 'mud', items: [['beachball', 0], ['duck', 0], ['cow', 0]] },
  { time: 'morning', dirt: 'mud', items: [['football', 0], ['pig', 0], ['car', 0]] },
  { time: 'day', dirt: 'sand', items: [['teddy', 0], ['dog', 0], ['van', 0]] },
  { time: 'evening', dirt: 'moss', items: [['sheep', 0], ['tractor', 0], ['horse', 0]] },
  { time: 'day', dirt: 'grime', items: [['car', 1], ['duck', 1], ['cow', 1]] },
  { time: 'morning', dirt: 'clay', items: [['dog', 1], ['beachball', 1], ['van', 1]] },
  { time: 'evening', dirt: 'mud', items: [['horse', 1], ['pig', 0], ['tractor', 1]] },
  { time: 'day', dirt: 'moss', items: [['football', 0], ['sheep', 0], ['car', 2]] },
  { time: 'morning', dirt: 'sand', items: [['teddy', 1], ['cow', 0], ['van', 2]] },
  { time: 'evening', dirt: 'grime', items: [['tractor', 0], ['horse', 0], ['duck', 0]] },
  { time: 'day', dirt: 'clay', items: [['pig', 0], ['dog', 0], ['car', 3]] },
  { time: 'evening', dirt: 'mud', items: [['cow', 1], ['van', 0], ['horse', 1]] },
];

export const MADE_LEVELS = LEVELS.length;

export function levelAt(n) {
  const messy = { cover: Math.min(0.95, 0.7 + n * 0.02), thick: 1 + Math.min(n, 20) * 0.03 };
  if (n <= LEVELS.length) return { n, ...LEVELS[n - 1], ...messy };
  // After the hand-made levels, each level number always makes the same level.
  const rnd = seeded(n * 9973);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const kinds = Object.keys(VARIANTS);
  const items = [];
  while (items.length < 3) {
    const kind = pick(kinds);
    if (!items.some(([k]) => k === kind)) items.push([kind, Math.floor(rnd() * VARIANTS[kind])]);
  }
  return { n, time: pick(['day', 'morning', 'evening']), dirt: pick(Object.keys(DIRT_STYLES)), items, ...messy };
}
