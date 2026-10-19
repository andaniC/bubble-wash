import { MODELS } from './models.js';
import { buildPart, partShape, blend, polygonize } from './sdf.js';

// Turns a model into mesh data. Runs in a worker (see worker.js) so building
// the next object never stutters the game.
export function buildModel(kind, variant) {
  const model = MODELS[kind](variant);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const part of model.parts) {
    for (const [shape] of part.pieces) {
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], shape.box[0][i]);
        max[i] = Math.max(max[i], shape.box[1][i]);
      }
    }
  }
  const maxDim = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const cell = maxDim / 85;

  const parts = model.parts.map((p) => ({
    ...buildPart(p, cell),
    material: p.material || {},
    clean: !!p.clean,
    glass: !!p.glass,
  }));

  // A coarse copy of the whole object, only used to find where the jet hits.
  const whole = blend(0, ...model.parts.map(partShape));
  const coarse = polygonize(whole, whole.box[0], whole.box[1], maxDim / 40);
  const hit = { positions: coarse.positions, indices: coarse.indices };

  // Real extent of the finished meshes.
  min.fill(Infinity);
  max.fill(-Infinity);
  for (const p of parts) {
    for (let i = 0; i < p.positions.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], p.positions[i + a]);
        max[a] = Math.max(max[a], p.positions[i + a]);
      }
    }
  }
  return { kind, variant, name: model.name, size: model.size, sound: model.sound, line: model.line, parts, hit, min, max };
}
