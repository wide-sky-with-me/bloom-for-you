import { MorphTarget } from '@babylonjs/core/Morph/morphTarget.js';
import { MorphTargetManager } from '@babylonjs/core/Morph/morphTargetManager.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';

const roseLayers = [
  ['IB_RoseOuter', 0, .48],
  ['IB_RoseMiddle', .22, .76],
  ['IB_RoseInner', .52, 1],
];
const clamp01 = x => Math.max(0, Math.min(1, x));
function smoothstep(lo, hi, x) {
  const t = clamp01((x - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
}

// Babylon 9.36 rebuilds vertex attributes when a target enters or leaves exact zero.
// This nonzero JS value is exactly zero in the GPU's float32 weight uniform.
const gpuWeight = value => value === 0 ? Number.MIN_VALUE : value;

function target(mesh, name, positions, weight, normals) {
  const t = new MorphTarget(name, gpuWeight(weight), mesh.getScene());
  t.setPositions(positions);
  if (normals) t.setNormals(normals);
  return t;
}

function rose(mesh, positions, min, max) {
  const closed = new Float32Array(positions.length);
  for (let i = 0; i < closed.length; i += 3) {
    const x = positions[i] - 1.72, z = positions[i + 2] - 6.25;
    const r = Math.hypot(x, z), u = clamp01(r / .18), ratio = .31 - .17 * u;
    const c = Math.cos(.38 * u), s = Math.sin(.38 * u);
    // Blender +Z becomes RH +Y: a positive twist takes +X towards -Z.
    closed[i] = 1.72 + ratio * (c * x + s * z);
    closed[i + 1] = positions[i + 1] + .78 * r;
    closed[i + 2] = 6.25 + ratio * (c * z - s * x);
    min.minimizeInPlaceFromFloats(closed[i], closed[i + 1], closed[i + 2]);
    max.maximizeInPlaceFromFloats(closed[i], closed[i + 1], closed[i + 2]);
  }
  const normals = new Float32Array(closed.length);
  VertexData.ComputeNormals(closed, mesh.getIndices(), normals, {useRightHandedSystem: true});
  return target(mesh, 'Closed petals', closed, 1, normals);
}

function windPair(mesh, positions, grass, min, max) {
  const sine = new Float32Array(positions), cosine = new Float32Array(positions);
  const amplitude = grass ? .085 : .061;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const bend = amplitude * smoothstep(0, grass ? .60 : .92, y);
    // A single continuous field crosses material seams. Stems lag by .30 s.
    const phase = -.86 * x + 1.15 * z + .4 * Math.sin(.71 * x + .33 * z) - (grass ? 0 : .51);
    const a = bend * Math.sin(phase), b = bend * Math.cos(phase);
    sine[i] += a; sine[i + 2] += .34 * a;
    cosine[i] += b; cosine[i + 2] += .34 * b;
  }
  min.x -= amplitude; max.x += amplitude;
  min.z -= .34 * amplitude; max.z += .34 * amplitude;
  return [target(mesh, 'Wind sine', sine, 0), target(mesh, 'Wind cosine', cosine, 0)];
}

/** Install once after glTF load. CourtPlanting primitives have world-space vertices in RH metres. */
export function setupMotion(scene) {
  const animated = new WeakSet(), winds = [], petals = [];
  for (const mesh of scene.meshes) {
    const name = mesh.material?.name ?? '';
    const grass = name.startsWith('IB_WindGrass_');
    const layer = roseLayers.find(([prefix]) => name.startsWith(prefix));
    if (!grass && !layer && !name.startsWith('IB_WindStem_')) continue;
    if (mesh.morphTargetManager) throw Error('Motion targets already exist: ' + mesh.name);
    const positions = mesh.getVerticesData('position');
    const bounds = mesh.getBoundingInfo();
    const min = bounds.minimum.clone(), max = bounds.maximum.clone();
    const manager = new MorphTargetManager(scene);
    // One or two static attributes suffice. Both PBR and shadow depth bind these targets.
    manager.useTextureToStoreTargets = false;
    manager.optimizeInfluencers = false;
    if (layer) {
      const bud = rose(mesh, positions, min, max);
      manager.addTarget(bud);
      petals.push({bud, lo: layer[1], hi: layer[2]});
    } else {
      const pair = windPair(mesh, positions, grass, min, max);
      for (const t of pair) manager.addTarget(t);
      winds.push(pair);
    }
    mesh.morphTargetManager = manager;
    bounds.reConstruct(min, max, mesh.computeWorldMatrix(true));
    animated.add(mesh);
  }
  return {
    isAnimatedMesh: mesh => animated.has(mesh),
    update(seconds, bloom, wind) {
      // sin(phase + time) = sin(phase) cos(time) + cos(phase) sin(time).
      const a = gpuWeight(wind ? Math.cos(1.7 * seconds) : 0);
      const b = gpuWeight(wind ? Math.sin(1.7 * seconds) : 0);
      for (const [sine, cosine] of winds) { sine.influence = a; cosine.influence = b; }
      for (const {bud, lo, hi} of petals) bud.influence = gpuWeight(1 - smoothstep(lo, hi, bloom));
    },
  };
}
