// Immutable CPU preparation shared by the module Worker and cooperative fallback.
// Keep stride11/BFM1/BFG1 on disk; the private GPU layout remains eight vec4s.
const STRIDE = 11, GPU_STRIDE = 16;
const DIRECTIONS = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1])
  if (x || y || z) DIRECTIONS.push([x, y, z]);
const SPHERE = [...DIRECTIONS, ...Array.from({length: 96}, (_, i) => {
  const z = 1 - 2 * (i + .5) / 96, radius = Math.sqrt(1 - z * z);
  const angle = i * Math.PI * (3 - Math.sqrt(5));
  return [radius * Math.cos(angle), radius * Math.sin(angle), z];
})];
function idle(x, y, z, phase) {
  const wind = Math.sin(y * .85) * .032;
  const expansion = 1 + Math.sin(y * .5) * .012 * Math.max(0, y + 1);
  x *= expansion; y *= expansion;
  x += wind * Math.max(.2, y + 2);
  z += Math.cos(x * 1.3) * .035;
  x += Math.sin(phase) * .009; y += Math.cos(phase) * .009;
  const t = Math.max(0, Math.min(1, (phase - 6.13) / .15));
  const wander = t * t * (3 - 2 * t) * Math.pow(.5 + .5 * Math.sin(phase * 30), 4);
  return [x + Math.sin(phase * 9) * .38 * wander, y + .52 * wander, z + Math.cos(phase * 7) * .24 * wander];
}
function normal(x, y, z, base) {
  const length = Math.hypot(x, y, z);
  if (length > 1e-8) { x /= length; y /= length; z /= length; }
  else { x = y = 0; z = 1; }
  const sum = Math.abs(x) + Math.abs(y) + Math.abs(z);
  x /= sum; y /= sum;
  if (z < 0) [x, y] = [(1 - Math.abs(y)) * (x < 0 ? -1 : 1), (1 - Math.abs(x)) * (y < 0 ? -1 : 1)];
  return Math.round((x * .5 + .5) * (base - 1)) + base * Math.round((y * .5 + .5) * (base - 1));
}
function finite(data, start, count, message) {
  for (let j = start; j < start + count; j++) if (!Number.isFinite(data[j])) throw new Error(message);
}
function* decode(input) {
  if (!input.buffers) return input;
  const [points, mesh, buds] = input.buffers;
  if (input.stride !== STRIDE || !Number.isSafeInteger(input.count) || input.count < 1 || input.count > 200000 ||
      !(points instanceof ArrayBuffer) || points.byteLength !== input.count * STRIDE * 4)
    throw new Error('Invalid particle data length');
  const particles = new Float32Array(points);
  if (!(mesh instanceof ArrayBuffer) || mesh.byteLength < 12) throw new Error('Invalid surface header');
  const h = new DataView(mesh), vertexCount = h.getUint32(4, true), indexCount = h.getUint32(8, true);
  if (h.getUint32(0, true) !== 0x314d4642) throw new Error('Invalid surface magic');
  if (vertexCount < 3 || vertexCount > 500000 || indexCount < 3 || indexCount > 3000000 || indexCount % 3)
    throw new Error('Invalid surface budget');
  const indexOffset = 12 + vertexCount * 9 * 4;
  if (mesh.byteLength !== indexOffset + indexCount * 4) throw new Error('Invalid surface length');
  const surface = {vertices: new Float32Array(mesh, 12, vertexCount * 9), indices: new Uint32Array(mesh, indexOffset, indexCount)};
  if (!(buds instanceof ArrayBuffer) || buds.byteLength < 12 || buds.byteLength > 3000000) throw new Error('Invalid growth header or budget');
  const view = new DataView(buds);
  if (view.getUint32(0, true) !== 0x31474642) throw new Error('Invalid growth magic');
  if (view.getUint32(4, true) !== input.count || view.getUint32(8, true) !== vertexCount)
    throw new Error('Growth does not match point and surface counts');
  if (buds.byteLength !== 12 + (input.count + vertexCount) * 14) throw new Error('Invalid growth length');
  const records = new Float32Array((input.count + vertexCount) * 7);
  for (let i = 0; i < input.count + vertexCount; i++) {
    if (!(i % 2048)) yield;
    const offset = 12 + i * 14, target = i * 7;
    for (let axis = 0; axis < 3; axis++) {
      records[target + axis] = view.getInt16(offset + axis * 2, true) / 4096;
      records[target + 3 + axis] = view.getInt16(offset + 6 + axis * 2, true) / 32767;
    }
    const length = Math.hypot(records[target + 3], records[target + 4], records[target + 5]);
    if (length < .95 || length > 1.05) throw new Error('Invalid closed-petal normal');
    records[target + 6] = view.getUint16(offset + 12, true) / 65535;
  }
  return {particles, surface, growth: {points: records.subarray(0, input.count * 7), vertices: records.subarray(input.count * 7)}};
}
function* validate({particles, surface, growth}) {
  if (!(particles instanceof Float32Array) || !particles.length || particles.length % STRIDE) throw new Error('Invalid particle stride');
  for (let i = 0; i < particles.length; i += STRIDE) {
    if (!(i % (STRIDE * 2048))) yield;
    finite(particles, i, STRIDE, 'Invalid particle coordinate');
    const length = Math.hypot(particles[i + 8], particles[i + 9], particles[i + 10]);
    if (length < .95 || length > 1.05) throw new Error('Invalid particle surface normal');
  }
  if (surface) {
    const {vertices, indices} = surface;
    if (!(vertices instanceof Float32Array) || !(indices instanceof Uint32Array) || !vertices.length || vertices.length % 9 || !indices.length || indices.length % 3)
      throw new Error('Invalid surface geometry');
    for (let i = 0; i < vertices.length; i += 9) {
      if (!(i % (9 * 2048))) yield;
      finite(vertices, i, 9, 'Invalid surface coordinate');
      for (let j = 3; j < 6; j++) if (vertices[i + j] < 0 || vertices[i + j] > 1) throw new Error('Invalid surface pigment');
      const length = Math.hypot(vertices[i + 6], vertices[i + 7], vertices[i + 8]);
      if (length < .95 || length > 1.05) throw new Error('Invalid surface normal');
    }
    for (let i = 0; i < indices.length; i++) {
      if (!(i % 16384)) yield;
      if (indices[i] >= vertices.length / 9) throw new Error('Invalid surface index');
    }
  }
  if (growth) for (const [part, count] of [[growth.points, particles.length / STRIDE], ...(surface ? [[growth.vertices, surface.vertices.length / 9]] : [])]) {
    if (!(part instanceof Float32Array) || part.length !== count * 7) throw new Error('Invalid growth stride or count');
    for (let i = 0; i < part.length; i += 7) {
      if (!(i % (7 * 2048))) yield;
      finite(part, i, 7, 'Invalid growth value');
      if (part[i + 6] < 0 || part[i + 6] > 1 || Math.hypot(part[i + 3], part[i + 4], part[i + 5]) < 1e-8)
        throw new Error('Invalid growth normal or delay');
    }
  }
}
function* pack(data, growth, stride, base) {
  const result = new Float32Array(data.length / stride * GPU_STRIDE);
  for (let i = 0, j = 0, k = 0; i < data.length; i += stride, j += GPU_STRIDE, k += 7) {
    if (!(j % (GPU_STRIDE * 2048))) yield;
    const n = i + (stride === STRIDE ? 8 : 6);
    result.set([data[i], data[i + 1], data[i + 2], stride === STRIDE ? data[i + 6] : 1,
      data[i + 3], data[i + 4], data[i + 5], stride === STRIDE ? data[i + 7] : 0,
      data[n], data[n + 1], data[n + 2], growth ? normal(growth[k + 3], growth[k + 4], growth[k + 5], base) : normal(data[n], data[n + 1], data[n + 2], base),
      growth ? growth[k] : data[i], growth ? growth[k + 1] : data[i + 1], growth ? growth[k + 2] : data[i + 2], growth ? growth[k + 6] : 0], j);
  }
  return result;
}
function supports(directions) { return directions.map(() => [-Infinity, 0]); }
function update(support, directions, p, index) {
  for (let j = 0; j < directions.length; j++) {
    const d = directions[j], dot = p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
    if (dot > support[j][0]) { support[j][0] = dot; support[j][1] = index; }
  }
}
function* projection(data) {
  const support = supports(SPHERE), moved = supports(SPHERE);
  for (let i = 0; i < data.length; i += STRIDE) {
    if (!(i % (STRIDE * 512))) yield;
    update(support, SPHERE, data.subarray(i, i + 3), i);
    update(moved, SPHERE, idle(data[i], data[i + 1], data[i + 2], data[i + 7]), i);
  }
  const indices = new Set([...support, ...moved].map(([, i]) => i));
  const count = data.length / STRIDE, budget = Math.min(1076 - indices.size, count);
  for (let i = 0; i < budget; i++) indices.add(Math.round(i * (count - 1) / Math.max(1, budget - 1)) * STRIDE);
  return [...indices];
}
function* growthProjection(packed, indices = null) {
  const support = Array.from({length: 4}, () => supports(DIRECTIONS));
  const seen = new Uint8Array(packed.length / GPU_STRIDE), count = indices ? indices.length : seen.length;
  for (let cursor = 0; cursor < count; cursor++) {
    if (!(cursor % 512)) yield;
    const vertex = indices ? indices[cursor] : cursor;
    if (seen[vertex]) continue;
    seen[vertex] = 1;
    const i = vertex * GPU_STRIDE;
    const a = packed.subarray(i, i + 3), b = packed.subarray(i + 12, i + 15);
    const points = [a, b, idle(...a, packed[i + 7]), idle(...b, packed[i + 7])];
    for (let k = 0; k < 4; k++) update(support[k], DIRECTIONS, points[k], i);
  }
  return [...new Set(support.flat().map(([, i]) => i))];
}
function* surfaceSupport(vertices, indices) {
  const support = supports(DIRECTIONS), moved = supports(DIRECTIONS), seen = new Uint8Array(vertices.length / 9);
  for (let cursor = 0; cursor < indices.length; cursor++) {
    if (!(cursor % 2048)) yield;
    const vertex = indices[cursor];
    if (seen[vertex]) continue;
    seen[vertex] = 1;
    const i = vertex * 9;
    update(support, DIRECTIONS, vertices.subarray(i, i + 3), i);
    update(moved, DIRECTIONS, idle(vertices[i], vertices[i + 1], vertices[i + 2], 0), i);
  }
  return new Float32Array([...new Set([...support, ...moved].map(([, i]) => i))].flatMap(i => [vertices[i], vertices[i + 1], vertices[i + 2]]));
}
function* expand(packed, indices) {
  const result = new Float32Array(indices.length * GPU_STRIDE);
  for (let i = 0; i < indices.length; i++) {
    if (!(i % 2048)) yield;
    result.set(packed.subarray(indices[i] * GPU_STRIDE, (indices[i] + 1) * GPU_STRIDE), i * GPU_STRIDE);
  }
  return result;
}
export function* prepareSteps(input, {octBase = 4096, uintIndices = true} = {}) {
  const data = yield* decode(input);
  yield* validate(data);
  const {particles, surface, growth} = data;
  const packed = yield* pack(particles, growth?.points, STRIDE, octBase);
  const projectionIndices = yield* projection(particles);
  const pointGrowthIndices = growth ? yield* growthProjection(packed) : [];
  const wander = [];
  if (growth) for (let i = 0; i < packed.length; i += GPU_STRIDE) {
    if (!(i % (GPU_STRIDE * 2048))) yield;
    if (packed[i + 7] > 6.13) wander.push(i);
  }
  let mesh = null;
  if (surface) {
    const packed = yield* pack(surface.vertices, growth?.vertices, 9, octBase);
    mesh = {packed, indices: surface.indices, support: yield* surfaceSupport(surface.vertices, surface.indices),
      projectionIndices: growth ? yield* growthProjection(packed, surface.indices) : [],
      expanded: uintIndices ? null : yield* expand(packed, surface.indices)};
  }
  return {particles, growth, packed, mesh, projectionIndices,
    growthProjectionIndices: growth ? [...new Set([...projectionIndices.map(i => i / STRIDE * GPU_STRIDE), ...wander, ...pointGrowthIndices])] : null,
    octBase, uintIndices};
}
export function prepareSync(input, options) {
  const steps = prepareSteps(input, options);
  let result;
  do { result = steps.next(); } while (!result.done);
  return result.value;
}
export function transferBuffers(value, found = new Set()) {
  if (ArrayBuffer.isView(value)) found.add(value.buffer);
  else if (value instanceof ArrayBuffer) found.add(value);
  else if (value && typeof value === 'object') for (const child of Object.values(value)) transferBuffers(child, found);
  return [...found];
}
export function abortError() { const error = new Error('Preparation superseded'); error.name = 'AbortError'; return error; }
export async function prepareCooperatively(input, options, {signal, schedule = () => new Promise(resolve => setTimeout(resolve, 0)), onSlice} = {}) {
  const steps = prepareSteps(input, options);
  while (true) {
    if (signal?.aborted) throw abortError();
    await schedule();
    if (signal?.aborted) throw abortError();
    const at = performance.now();
    let result;
    do { result = steps.next(); } while (!result.done && performance.now() - at < 5);
    onSlice?.(performance.now() - at);
    if (result.done) return result.value;
  }
}
