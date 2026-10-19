// Decision: .agents/notes/implemented/botanical-growth/2026-10-19-bud-to-bloom.md
const RECORD_BYTES = 14;
const STRIDE = 7;

export function decodeGrowth(buffer, particleCount, vertexCount) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 12)
    throw new Error("Invalid growth header");
  if (
    !Number.isSafeInteger(particleCount) ||
    particleCount < 1 ||
    particleCount > 200000 ||
    !Number.isSafeInteger(vertexCount) ||
    vertexCount < 3 ||
    vertexCount > 500000 ||
    buffer.byteLength > 3000000
  )
    throw new Error("Invalid growth budget");
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x31474642)
    throw new Error("Invalid growth magic");
  if (
    view.getUint32(4, true) !== particleCount ||
    view.getUint32(8, true) !== vertexCount
  )
    throw new Error("Growth does not match point and surface counts");
  if (buffer.byteLength !== 12 + (particleCount + vertexCount) * RECORD_BYTES)
    throw new Error("Invalid growth length");
  const records = new Float32Array((particleCount + vertexCount) * STRIDE);
  for (let i = 0; i < particleCount + vertexCount; i++) {
    const offset = 12 + i * RECORD_BYTES;
    const target = i * STRIDE;
    for (let axis = 0; axis < 3; axis++) {
      records[target + axis] = view.getInt16(offset + axis * 2, true) / 4096;
      records[target + 3 + axis] =
        view.getInt16(offset + 6 + axis * 2, true) / 32767;
    }
    const length = Math.hypot(
      records[target + 3],
      records[target + 4],
      records[target + 5],
    );
    if (length < 0.95 || length > 1.05)
      throw new Error("Invalid closed-petal normal");
    records[target + 6] = view.getUint16(offset + 12, true) / 65535;
  }
  // Both views share one validated allocation; they retain their exact asset order.
  return {
    points: records.subarray(0, particleCount * STRIDE),
    vertices: records.subarray(particleCount * STRIDE),
  };
}
