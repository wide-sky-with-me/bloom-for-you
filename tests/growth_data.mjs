import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(
  new URL("../site/growth-data.js", import.meta.url),
  "utf8",
);
const { decodeGrowth } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
function sample() {
  const buffer = new ArrayBuffer(12 + 5 * 14);
  const view = new DataView(buffer);
  view.setUint32(0, 0x31474642, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, 3, true);
  for (let i = 0; i < 5; i++) {
    const offset = 12 + i * 14;
    view.setInt16(offset, -4096 + i * 1024, true);
    view.setInt16(offset + 2, 8192, true);
    view.setInt16(offset + 10, 32767, true);
    view.setUint16(offset + 12, i === 4 ? 65535 : 32768, true);
  }
  return buffer;
}
let checks = 0;
function check(name, run) {
  run();
  checks++;
  console.log("PASS:", name);
}
check("BFG1 signed positions, exact record order and normalized delays", () => {
  const result = decodeGrowth(sample(), 2, 3);
  assert.equal(result.points.length, 14);
  assert.equal(result.vertices.length, 21);
  assert.equal(result.points[0], -1);
  assert.equal(result.points[1], 2);
  assert.equal(result.vertices[0], -0.5);
  assert.equal(result.vertices[20], 1);
  assert.equal(result.points.buffer, result.vertices.buffer);
  assert.equal(result.points[5], 1);
});
check("Reject non-buffer payload", () =>
  assert.throws(() => decodeGrowth({}, 2, 3), /header/),
);
check("Reject short header", () =>
  assert.throws(() => decodeGrowth(new ArrayBuffer(11), 2, 3), /header/),
);
check("Reject wrong magic", () => {
  const b = sample();
  new DataView(b).setUint32(0, 0);
  assert.throws(() => decodeGrowth(b, 2, 3), /magic/);
});
check("Reject point mismatch", () =>
  assert.throws(() => decodeGrowth(sample(), 3, 3), /match/),
);
check("Reject surface mismatch", () =>
  assert.throws(() => decodeGrowth(sample(), 2, 4), /match/),
);
check("Reject truncated payload", () =>
  assert.throws(() => decodeGrowth(sample().slice(0, -1), 2, 3), /length/),
);
check("Reject trailing payload", () => {
  const b = new Uint8Array(sample().byteLength + 1);
  b.set(new Uint8Array(sample()));
  assert.throws(() => decodeGrowth(b.buffer, 2, 3), /length/);
});
check("Reject zero normals", () => {
  const b = sample();
  new DataView(b).setInt16(22, 0, true);
  assert.throws(() => decodeGrowth(b, 2, 3), /normal/);
});
check("Reject nonunit diagonal normals", () => {
  const b = sample();
  new DataView(b).setInt16(18, 32767, true);
  assert.throws(() => decodeGrowth(b, 2, 3), /normal/);
});
check("Reject invalid expected counts", () => {
  for (const count of [0, -1, 1.5, NaN, Infinity, 200001])
    assert.throws(() => decodeGrowth(sample(), count, 3), /budget/);
});
check("Reject invalid surface budget", () =>
  assert.throws(() => decodeGrowth(sample(), 2, 500001), /budget/),
);
check("Reject oversized growth payload", () =>
  assert.throws(() => decodeGrowth(new ArrayBuffer(3000001), 2, 3), /budget/),
);
console.log(`${checks} growth data contracts passed`);
