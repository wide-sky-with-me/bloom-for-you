import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
const url = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const dataURL = url(await readFile(new URL('../site/prepare-data.js', import.meta.url), 'utf8'));
const {prepareSync, prepareCooperatively, transferBuffers} = await import(dataURL);
const clientURL = url((await readFile(new URL('../site/prepare-client.js', import.meta.url), 'utf8')).replace(/\.\/prepare-data\.js\?v=\d+/, dataURL));
const {BouquetPreparation} = await import(clientURL);
const input = (offset = 0) => ({particles: new Float32Array([offset, 1, 0, .8, .4, .5, 1, 6.2, 0, 0, 1])});

test('sync and scheduled preparation are identical, immutable and transferable', async () => {
  const value = input(), before = new Float32Array(value.particles);
  let yields = 0;
  const prepared = await prepareCooperatively(value, {octBase: 32}, {schedule: async () => {yields++;}});
  assert.deepEqual(prepared, prepareSync(value, {octBase: 32}));
  assert.deepEqual(value.particles, before);
  assert.ok(yields > 0);
  const copy = structuredClone(prepared, {transfer: transferBuffers(prepared)});
  assert.equal(prepared.packed.byteLength, 0);
  assert.equal(copy.packed.length, 16);
});
test('fallback cancellation yields and never publishes partial data', async () => {
  const controller = new AbortController();
  await assert.rejects(prepareCooperatively(input(), {}, {signal: controller.signal,
    schedule: async () => controller.abort()}), {name: 'AbortError'});
  assert.throws(() => prepareSync({particles: new Float32Array(16)}), /stride/);
  const bad = input(); bad.particles[8] = NaN;
  assert.throws(() => prepareSync(bad), /coordinate/);
});
test('worker construction failure sticks to cooperative fallback and bounds LRU', async () => {
  let starts = 0;
  const client = new BouquetPreparation({}, {limit: 2, workerFactory() {starts++; throw new Error('module worker unsupported');}, schedule: async () => {}});
  const original = input();
  const a = await client.prepare('a', original);
  assert.equal(await client.prepare('a', original), a);
  await client.prepare('b', input(1)); await client.prepare('c', input(2));
  assert.equal(starts, 1); assert.deepEqual([...client.cache.keys()], ['b', 'c']);
  client.dispose(); assert.equal(client.cache.size, 0);
  await assert.rejects(client.prepare('d', input()), {name: 'AbortError'});
});
test('superseding a worker terminates it, settles its promise and preserves fallback input', async () => {
  const workers = [];
  const client = new BouquetPreparation({}, {workerFactory() {
    const worker = {terminate() {this.terminated = true;}, postMessage(message, transfer) {
      this.message = structuredClone(message, {transfer});
    }}; workers.push(worker); return worker;
  }, schedule: async () => {}});
  const source = input();
  const a = client.prepare('a', source);
  const aRejected = assert.rejects(a, {name: 'AbortError'});
  const b = client.prepare('b', input(1));
  await aRejected;
  assert.equal(workers[0].terminated, true);
  assert.equal(source.particles.byteLength, 44);
  workers[1].onerror({preventDefault() {}});
  const prepared = await b;
  assert.equal(prepared.particles[0], 1);
  assert.equal(workers[1].terminated, true);
  assert.equal(client.cache.has('a'), false);
  client.dispose();
});
test('worker validation failure is atomic and not redundantly retried on main thread', async () => {
  let worker;
  const client = new BouquetPreparation({}, {workerFactory() {return worker = {postMessage() {}, terminate() {this.terminated = true;}};}});
  const pending = client.prepare('bad', input());
  worker.onmessage({data: {error: 'Invalid growth magic'}});
  await assert.rejects(pending, /growth magic/);
  assert.equal(worker.terminated, true); assert.equal(client.cache.size, 0);
  assert.equal(client.workerFailed, undefined);
  client.dispose();
});

function binaryFixture() {
  const particles = input().particles.buffer;
  const mesh = new ArrayBuffer(12 + 3 * 9 * 4 + 3 * 4), h = new DataView(mesh);
  h.setUint32(0, 0x314d4642, true); h.setUint32(4, 3, true); h.setUint32(8, 3, true);
  const vertices = new Float32Array(mesh, 12, 27);
  for (let i = 0; i < 3; i++) vertices.set([i, 1, 0, .8, .4, .5, 0, 0, 1], i * 9);
  new Uint32Array(mesh, 12 + 108).set([0, 1, 2]);
  const buds = new ArrayBuffer(12 + 4 * 14), b = new DataView(buds);
  b.setUint32(0, 0x31474642, true); b.setUint32(4, 1, true); b.setUint32(8, 3, true);
  for (let i = 0; i < 4; i++) b.setInt16(12 + i * 14 + 10, 32767, true);
  return {buffers: [particles, mesh, buds], count: 1, stride: 11};
}
test('BFM1/BFG1 decode matches private layout and no-uint expansion; corruption is atomic', async () => {
  const value = binaryFixture(), prepared = prepareSync(value, {uintIndices: false});
  assert.equal(prepared.growth.points.length, 7);
  assert.equal(prepared.growth.vertices.length, 21);
  assert.equal(prepared.mesh.expanded.length, 3 * 16);
  for (let i = 0; i < 3; i++) assert.deepEqual(prepared.mesh.expanded.slice(i * 16, (i + 1) * 16), prepared.mesh.packed.slice(i * 16, (i + 1) * 16));
  assert.deepEqual(await prepareCooperatively(value, {uintIndices: false}, {schedule: async () => {}}), prepared);
  for (const mutate of [
    x => new DataView(x.buffers[1]).setUint32(0, 0, true),
    x => new DataView(x.buffers[1]).setUint32(12 + 108, 3, true),
    x => new DataView(x.buffers[2]).setUint32(0, 0, true),
    x => new DataView(x.buffers[2]).setUint32(8, 2, true),
    x => new DataView(x.buffers[2]).setInt16(22, 0, true),
    x => new Float32Array(x.buffers[0])[0] = NaN,
  ]) { const broken = binaryFixture(); mutate(broken); assert.throws(() => prepareSync(broken), /Invalid|match/); }
});
test('cache identity is tied to immutable input, not only a reused theme label', async () => {
  const client = new BouquetPreparation({}, {workerFactory() {throw new Error('offline');}, schedule: async () => {}});
  const a = await client.prepare('rose', input(0));
  const b = await client.prepare('rose', input(1));
  assert.notEqual(a, b); assert.equal(b.particles[0], 1);
  client.dispose();
});
