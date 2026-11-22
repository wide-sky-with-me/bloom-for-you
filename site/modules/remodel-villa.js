// Original coastal_villa.glb (sha256 75e611687de25eff7889e53b430108d988385751468b705007e32586facee486).
// Half-open triangle ranges in its single-material primitives, NOT vertex ranges.
// Derived by applying Remodel01/villa/trim_original.py to the packed triangle
// centroids (Blender XYZ = glTF X,-Z,Y), and the M06 placement bounds to Walnut.
// A topology fingerprint prevents silently cutting a different room after a re-export.
const CUTS = [
  // South study window: 1,840 faces; all other window bays share these materials.
  ["Brass",          0x03461091, 15380, 15408],
  ["CreamMolding",   0x7a3381a8, 1364, 1584],
  ["Glass",          0xcc766725, 12, 24],
  ["Hydrangeas",     0x7bde28a5, 240, 480],
  ["Limestone",      0x18401f83, 792, 924],
  ["RoseDrapes",     0x47632bad, 88, 176],
  ["SheerCurtains",  0x9bf8df0b, 88, 176],
  ["Shutters",       0xcf97d51d, 704, 1408],
  ["TerracottaPots", 0xa22c59b6, 44, 88],
  ["VineFoliage",    0x6253334b, 240, 480],
  ["WroughtIron",    0x3a9d4e9c, 19800, 19844],
  // Ground pergola: 616 cedar + 176 stone bases; 612 tubular portico trim.
  ["Cedar",          0x2f19197c, 132, 748],
  ["Coping",         0x8456aa5a, 2112, 2288, 2992, 3604],
  // Board and four legs, paper and seal. Retain the desk lamp, globe and chair.
  ["Walnut",         0x83cad1ba, 5448, 5636],
  ["IvoryLinen",     0x88fe8969, 3608, 3652],
  ["VelvetRose",     0x5a5544da, 3748, 3792],
];

function classicMesh(scene, name) {
  const mesh = scene.getMeshByName("VillaGLB_Villa_" + name);
  if (!mesh) throw new Error("Missing classic villa mesh: " + name);
  return mesh;
}

function retainedIndices(mesh, fingerprint, ranges) {
  const indices = mesh.getIndices();
  let hash = 2166136261;
  for (let i = 0; i < indices.length; ++i) hash = Math.imul(hash ^ indices[i], 16777619);
  if ((hash >>> 0) !== fingerprint) throw new Error("Unexpected classic topology: " + mesh.name);
  const kept = indices.slice();
  let end = kept.length;
  // Remove back to front so the earlier triangle offsets remain valid.
  for (let i = ranges.length - 2; i >= 0; i -= 2) {
    const from = ranges[i] * 3, to = ranges[i + 1] * 3;
    kept.copyWithin(from, to, end);
    end -= to - from;
  }
  return kept.subarray(0, end);
}

/** Validate the assembled classic villa before the installer publishes the new art. */
export function prepareVillaReplacement(scene) {
  const roof = classicMesh(scene, "TerracottaRoof");
  const cuts = CUTS.map(([name, hash, ...ranges]) => {
    const mesh = classicMesh(scene, name);
    return [mesh, retainedIndices(mesh, hash, ranges)];
  });
  const doors = ["L", "R"].flatMap(side => ["Frame", "Glass", "Handle"].map(part =>
    classicMesh(scene, "FrontDoor_" + side + "_" + part)));

  const vine = scene.getMeshByName("Villa_wisteria_cascade_proto_Object_8");
  const matrices = vine?.thinInstanceGetWorldMatrices();
  // The three ground placements face the courtyard (+Z), three terrace vines face -Z.
  const terrace = matrices?.filter(matrix => matrix.getTranslation().z < 0);
  if (matrices?.length !== 6 || terrace.length !== 3) throw new Error("Unexpected classic wisteria placements");
  const vineBuffer = new Float32Array(16 * terrace.length);
  terrace.forEach((matrix, i) => matrix.copyToArray(vineBuffer, 16 * i));

  return () => {
    for (const [mesh, indices] of cuts) {
      // GLB clones share Geometry with the AssetContainer. Leave its original intact.
      mesh.makeGeometryUnique();
      mesh.setIndices(indices);
    }
    roof.setEnabled(false); // Slate replaces just the tiles; its chimney cutout and oculus are intentional.
    vine.thinInstanceSetBuffer("matrix", vineBuffer, 16, true);
    for (const mesh of doors) {
      mesh.isPickable = true;
      mesh.metadata = { ...mesh.metadata, interactive: { id: "villa-front-doors" } };
    }
  };
}
