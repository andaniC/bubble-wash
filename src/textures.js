import * as THREE from 'three';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function texture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;

// One splat of mess. The style decides the colours and the texture inside it:
// soft blotches for mud, grains for sand, flicked drops for paint, a wet
// highlight for sticky things.
function splat(style) {
  const size = 256;
  const [c, g] = canvas(size);
  const mid = size / 2;
  const one = style.single ? pick(style.palette) : null;
  const blobs = 7 + Math.floor(Math.random() * 5);
  for (let i = 0; i < blobs; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * size * 0.18;
    const x = mid + Math.cos(a) * d;
    const y = mid + Math.sin(a) * d;
    const r = size * (0.13 + Math.random() * 0.13);
    const col = one || pick(style.palette);
    const grad = g.createRadialGradient(x, y, r * 0.5, x, y, r);
    grad.addColorStop(0, rgba(col, 1));
    grad.addColorStop(1, rgba(col, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  g.globalCompositeOperation = 'source-atop';
  if (style.texture === 'soft') {
    for (let i = 0; i < 26; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(70,46,26,0.22)' : 'rgba(160,122,80,0.2)';
      g.beginPath();
      g.arc(mid + (Math.random() - 0.5) * size * 0.6, mid + (Math.random() - 0.5) * size * 0.6, 6 + Math.random() * 14, 0, Math.PI * 2);
      g.fill();
    }
  } else if (style.texture === 'grains') {
    for (let i = 0; i < 260; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(150,118,72,0.55)' : 'rgba(255,246,222,0.6)';
      g.beginPath();
      g.arc(mid + (Math.random() - 0.5) * size * 0.7, mid + (Math.random() - 0.5) * size * 0.7, 1 + Math.random() * 2.2, 0, Math.PI * 2);
      g.fill();
    }
  } else if (style.texture === 'wet') {
    const hx = mid - size * 0.08;
    const hy = mid - size * 0.1;
    const shine = g.createRadialGradient(hx, hy, 0, hx, hy, size * 0.16);
    shine.addColorStop(0, 'rgba(255,255,255,0.45)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = shine;
    g.fillRect(0, 0, size, size);
  }

  g.globalCompositeOperation = 'source-over';
  const flecks = style.texture === 'drops' ? 12 : 6;
  for (let i = 0; i < flecks; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = size * (0.33 + Math.random() * 0.13);
    g.fillStyle = rgba(one || style.palette[0], 0.92);
    g.beginPath();
    g.arc(mid + Math.cos(a) * d, mid + Math.sin(a) * d, 3 + Math.random() * (style.texture === 'drops' ? 10 : 7), 0, Math.PI * 2);
    g.fill();
  }
  return texture(c);
}

const dirtCache = new Map();

export function dirtTextures(key, style, count = 5) {
  if (!dirtCache.has(key)) dirtCache.set(key, Array.from({ length: count }, () => splat(style)));
  return dirtCache.get(key);
}

export function gradientTexture(top, bottom) {
  const [c, g] = canvas(4, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  return texture(c);
}

export function tileTexture(fill, line) {
  const [c, g] = canvas(256);
  g.fillStyle = fill;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = line;
  g.fillRect(0, 0, 256, 6);
  g.fillRect(0, 0, 6, 256);
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function shadowTexture() {
  const [c, g] = canvas(128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(40,60,70,0.42)');
  grad.addColorStop(0.55, 'rgba(40,60,70,0.18)');
  grad.addColorStop(1, 'rgba(40,60,70,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return texture(c);
}
