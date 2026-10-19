import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../site/surface-data.js", import.meta.url),
  "utf8",
);
const { decodeSurface } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
function triangle() {
  const buffer = new ArrayBuffer(12 + 3 * 9 * 4 + 3 * 4);
  const header = new DataView(buffer);
  header.setUint32(0, 0x314d4642, true);
  header.setUint32(4, 3, true);
  header.setUint32(8, 3, true);
  new Float32Array(buffer, 12, 27).set([
    0, 0, 0, 0.9, 0.7, 0.6, 0, 0, 1, 1, 0, 0, 0.9, 0.7, 0.6, 0, 0, 1, 0, 1, 0,
    0.9, 0.7, 0.6, 0, 0, 1,
  ]);
  new Uint32Array(buffer, 120, 3).set([0, 1, 2]);
  return buffer;
}
let passed = 0;
function check(name, action) {
  action();
  passed++;
  console.log(`PASS: ${name}`);
}
check("indexed surface preserves the shared buffer and vertex order", () => {
  const buffer = triangle(),
    surface = decodeSurface(buffer);
  assert.equal(surface.vertices.buffer, buffer);
  assert.equal(surface.indices.buffer, buffer);
  assert.equal(surface.vertices.length, 27);
  assert.deepEqual([...surface.indices], [0, 1, 2]);
});
check("short headers and non-buffers fail before allocation", () => {
  for (const input of [null, {}, new Uint8Array(12), new ArrayBuffer(11)])
    assert.throws(() => decodeSurface(input), /header/);
});
check("unrecognized format magic is rejected", () => {
  const buffer = triangle();
  new DataView(buffer).setUint32(0, 0);
  assert.throws(() => decodeSurface(buffer), /magic/);
});
check("oversized or empty vertex/index budgets are rejected", () => {
  for (const [offset, value] of [
    [4, 0],
    [4, 500001],
    [8, 0],
    [8, 3000003],
    [8, 4],
  ]) {
    const buffer = triangle();
    new DataView(buffer).setUint32(offset, value, true);
    assert.throws(() => decodeSurface(buffer), /budget/);
  }
});
check("truncated and trailing data are rejected", () => {
  const buffer = triangle();
  assert.throws(() => decodeSurface(buffer.slice(0, -4)), /length/);
  const padded = new Uint8Array(buffer.byteLength + 4);
  padded.set(new Uint8Array(buffer));
  assert.throws(() => decodeSurface(padded.buffer), /length/);
});
check("nonfinite vertex components are rejected", () => {
  for (const invalid of [NaN, Infinity, -Infinity]) {
    const buffer = triangle();
    new Float32Array(buffer, 12)[0] = invalid;
    assert.throws(() => decodeSurface(buffer), /coordinate/);
  }
});
check("out-of-range pigments are rejected", () => {
  for (const invalid of [-0.1, 1.1]) {
    const buffer = triangle();
    new Float32Array(buffer, 12)[3] = invalid;
    assert.throws(() => decodeSurface(buffer), /pigment/);
  }
});
check("zero or unnormalized normals are rejected", () => {
  for (const invalid of [0, 0.9, 1.1]) {
    const buffer = triangle();
    new Float32Array(buffer, 12)[8] = invalid;
    assert.throws(() => decodeSurface(buffer), /normal/);
  }
});
check("indices cannot reference vertices outside the surface", () => {
  const buffer = triangle();
  new Uint32Array(buffer, 120)[2] = 3;
  assert.throws(() => decodeSurface(buffer), /index/);
});
console.log(`${passed} surface data contracts passed`);
