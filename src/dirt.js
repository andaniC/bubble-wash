import * as THREE from 'three';
import { tileFbm } from './noise.js';

// The mess is a layer drawn on top of each object's own colours. How much is
// left at each vertex lives in a `dirt` attribute (0 = clean, 1+ = caked on);
// a noise threshold turns that into ragged, crusty edges as it washes away.

export const DIRT_STYLES = {
  mud: { dark: [58, 39, 23], light: [126, 92, 56], word: 'muddy' },
  sand: { dark: [112, 94, 68], light: [184, 160, 120], word: 'sandy', grains: true },
  moss: { dark: [46, 60, 26], light: [116, 132, 62], word: 'mossy' },
  grime: { dark: [36, 35, 33], light: [96, 92, 86], word: 'grimy' },
  clay: { dark: [104, 52, 30], light: [178, 108, 70], word: 'muddy' },
};

const SIZE = 256;
const textures = new Map();

function canvasTexture(draw, srgb) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  const img = g.createImageData(SIZE, SIZE);
  draw(img.data);
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stylesFor(key) {
  if (textures.has(key)) return textures.get(key);
  const style = DIRT_STYLES[key];
  const seed = key.length * 13;
  const color = canvasTexture((px) => {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const u = x / SIZE;
        const v = y / SIZE;
        let t = tileFbm(u, v, 5, 5, seed) * 1.6 - 0.3;
        t += (tileFbm(u, v, 32, 2, seed + 7) - 0.5) * 0.5;
        if (style.grains) t += (Math.random() - 0.5) * 0.35;
        t = Math.min(1, Math.max(0, t));
        const i = (y * SIZE + x) * 4;
        for (let c = 0; c < 3; c++) px[i + c] = style.dark[c] + (style.light[c] - style.dark[c]) * t;
        px[i + 3] = 255;
      }
    }
  }, true);
  const edge = canvasTexture((px) => {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const n = tileFbm(x / SIZE, y / SIZE, 6, 5, seed + 3);
        const v = Math.min(1, Math.max(0, (n - 0.5) * 2.2 + 0.5)) * 0.8 + 0.1;
        const i = (y * SIZE + x) * 4;
        px[i] = px[i + 1] = px[i + 2] = v * 255;
        px[i + 3] = 255;
      }
    }
  }, false);
  const pair = { color, edge };
  textures.set(key, pair);
  return pair;
}

const HEAD = /* glsl */ `
uniform sampler2D mudMap;
uniform sampler2D edgeMap;
uniform float mudScale;
varying float vDirt;
varying vec3 vObjPos;
varying vec3 vObjNormal;
vec3 triWeights(vec3 n) { vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }
vec4 triSample(sampler2D t, vec3 p, vec3 w) {
  return texture2D(t, p.yz) * w.x + texture2D(t, p.zx) * w.y + texture2D(t, p.xy) * w.z;
}
`;

const MIX = /* glsl */ `
#include <color_fragment>
vec3 dirtW = triWeights(normalize(vObjNormal));
vec3 dirtP = vObjPos * mudScale;
float dirtEdge = triSample(edgeMap, dirtP * 1.9, dirtW).r;
float dirtMask = smoothstep(dirtEdge - 0.05, dirtEdge + 0.05, vDirt * 1.1 - 0.05);
float dirtRim = dirtMask * (1.0 - dirtMask) * 4.0;
vec3 mudColor = triSample(mudMap, dirtP, dirtW).rgb * (1.0 - 0.4 * dirtRim);
diffuseColor.rgb = mix(diffuseColor.rgb, mudColor, dirtMask);
`;

export function dirtMaterial(params, styleKey) {
  const maps = stylesFor(styleKey);
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: params.roughness ?? 0.6,
    metalness: params.metalness ?? 0,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.mudMap = { value: maps.color };
    shader.uniforms.edgeMap = { value: maps.edge };
    shader.uniforms.mudScale = { value: 1.6 };
    shader.vertexShader =
      'attribute float dirt;\nvarying float vDirt;\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvDirt = dirt;\nvObjPos = position;\nvObjNormal = normal;'
      );
    shader.fragmentShader = (HEAD + shader.fragmentShader)
      .replace('#include <color_fragment>', MIX)
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.95, dirtMask);'
      )
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, dirtMask);'
      );
  };
  m.customProgramCacheKey = () => 'dirt-layer';
  return m;
}
