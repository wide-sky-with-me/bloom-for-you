// Decision: .agents/notes/implemented/round-bouquets/2026-10-19-all-around-garden-composition.md
export function decodeSurface(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 12)
    throw new Error("Invalid surface header");
  const header = new DataView(buffer);
  if (header.getUint32(0, true) !== 0x314d4642)
    throw new Error("Invalid surface magic");
  const vertexCount = header.getUint32(4, true);
  const indexCount = header.getUint32(8, true);
  if (
    vertexCount < 3 ||
    vertexCount > 500000 ||
    indexCount < 3 ||
    indexCount > 3000000 ||
    indexCount % 3 !== 0
  )
    throw new Error("Invalid surface budget");
  const indexOffset = 12 + vertexCount * 9 * 4;
  if (buffer.byteLength !== indexOffset + indexCount * 4)
    throw new Error("Invalid surface length");
  const vertices = new Float32Array(buffer, 12, vertexCount * 9);
  const indices = new Uint32Array(buffer, indexOffset, indexCount);
  for (const value of vertices)
    if (!Number.isFinite(value)) throw new Error("Invalid surface coordinate");
  for (let i = 0; i < vertices.length; i += 9) {
    if (
      vertices[i + 3] < 0 ||
      vertices[i + 3] > 1 ||
      vertices[i + 4] < 0 ||
      vertices[i + 4] > 1 ||
      vertices[i + 5] < 0 ||
      vertices[i + 5] > 1
    )
      throw new Error("Invalid surface pigment");
    const normalLength = Math.hypot(
      vertices[i + 6],
      vertices[i + 7],
      vertices[i + 8],
    );
    if (normalLength < 0.95 || normalLength > 1.05)
      throw new Error("Invalid surface normal");
  }
  for (const index of indices)
    if (index >= vertexCount) throw new Error("Invalid surface index");
  return { vertices, indices };
}
