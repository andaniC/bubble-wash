import { buildModel } from './build.js';

self.onmessage = ({ data }) => {
  const model = buildModel(data.kind, data.variant);
  const transfer = model.parts.flatMap((p) => [p.positions.buffer, p.normals.buffer, p.colors.buffer, p.indices.buffer]);
  transfer.push(model.hit.positions.buffer, model.hit.indices.buffer);
  self.postMessage({ id: data.id, model }, transfer);
};
