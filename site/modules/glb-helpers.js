// Shared GLB instantiation, material tuning, GPU thin-instance batching & procedural water textures.

import "@babylonjs/core/Meshes/thinInstanceMesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { clamp, hexToColor3, mulberry32 } from "./world-spatial.js";

export const _V_UP = new Vector3(0, 1, 0);

const _SHARED_TEXTURE_SLOTS = [
  "albedoTexture",
  "bumpTexture",
  "metallicTexture",
  "ambientTexture",
  "emissiveTexture",
  "opacityTexture",
  "reflectivityTexture",
  "microSurfaceTexture",
  "lightmapTexture",
  "diffuseTexture",
  "specularTexture",
];

const _sceneBatchMatCache = new WeakMap();

/**
 * Clone a Babylon Material for per-group color/roughness tuning while sharing
 * underlying BaseTexture instances (avoids re-decoding & re-uploading GLB textures to VRAM).
 */
export function cloneMaterialSharingTextures(srcMat, name) {
  if (!srcMat) return null;
  const saved = [];
  for (let i = 0; i < _SHARED_TEXTURE_SLOTS.length; i += 1) {
    const slot = _SHARED_TEXTURE_SLOTS[i];
    if (srcMat[slot]) {
      saved.push([slot, srcMat[slot]]);
      srcMat[slot] = null;
    }
  }
  let cloned = null;
  try {
    cloned = srcMat.clone(name);
  } finally {
    for (let i = 0; i < saved.length; i += 1) {
      const [slot, tex] = saved[i];
      srcMat[slot] = tex;
      if (cloned) cloned[slot] = tex;
    }
  }
  return cloned;
}

/**
 * Merge static, non-pickable, non-skinned, non-instanced child meshes by shared material & vertex layout.
 */
export function mergeStaticChildrenByMaterial(
  parentNode,
  scene,
  { namePrefix = "StaticMerged", castShadows = false, shadowGen = null, filterMesh = null } = {}
) {
  if (!parentNode) return [];
  parentNode.computeWorldMatrix(true);
  const candidates = parentNode.getChildMeshes(false).filter((m) => {
    if (!(m instanceof Mesh) || m.getTotalVertices() <= 0) return false;
    if (m.hasThinInstances || m.isAnInstance || m.skeleton || m.morphTargetManager) return false;
    if (m.isPickable || m.metadata?.interactive || !m.isEnabled() || !m.isVisible || !m.material) return false;
    if (m.getChildren().length > 0) return false;
    return filterMesh ? filterMesh(m) : true;
  });

  const groups = new Map();
  for (let i = 0; i < candidates.length; i += 1) {
    const m = candidates[i];
    m.computeWorldMatrix(true);
    const key = [
      m.material.uniqueId,
      m.receiveShadows ? 1 : 0,
      m.isVerticesDataPresent("uv") ? 1 : 0,
      m.isVerticesDataPresent("color") ? 1 : 0,
      m.isVerticesDataPresent("normal") ? 1 : 0,
    ].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }

  const mergedOut = [];
  let idx = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const mat = list[0].material;
    const recvShadow = list[0].receiveShadows;
    if (shadowGen) {
      for (let i = 0; i < list.length; i += 1) {
        shadowGen.removeShadowCaster(list[i], false);
      }
    }
    const merged = Mesh.MergeMeshes(list, true, true, undefined, false, false);
    if (!merged) continue;
    idx += 1;
    merged.name = `${namePrefix}_${mat.name || idx}_${idx}`;
    merged.material = mat;
    merged.isPickable = false;
    merged.receiveShadows = recvShadow;
    merged.setParent(parentNode);
    if (castShadows && shadowGen) {
      shadowGen.addShadowCaster(merged, false);
    }
    mergedOut.push(merged);
  }
  return mergedOut;
}

export function findDescendantByName(nodes, exactSuffix) {
  if (!nodes) return null;
  const queue = [...nodes];
  while (queue.length > 0) {
    const n = queue.shift();
    if (!n) continue;
    if (n.name === exactSuffix || n.name.endsWith(`_${exactSuffix}`)) {
      return n;
    }
    const ch = n.getChildren?.(undefined, true);
    if (ch?.length) queue.push(...ch);
  }
  return null;
}

export function collectMeshes(nodes) {
  const out = [];
  const seen = new Set();
  const stack = [...(nodes || [])];
  while (stack.length > 0) {
    const n = stack.pop();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    if (n.getTotalVertices && n.getTotalVertices() > 0) {
      out.push(n);
    }
    const ch = n.getChildren?.(undefined, true);
    if (ch?.length) stack.push(...ch);
  }
  return out;
}

export function applyGLBShadows(nodes, shadowGen, { cast = true, receive = true } = {}) {
  const meshes = collectMeshes(nodes);
  for (let i = 0; i < meshes.length; i += 1) {
    const m = meshes[i];
    m.isPickable = false;
    m.receiveShadows = receive;
    if (cast && shadowGen) {
      const matName = m.material?.name || "";
      if (!/glass|sheer|water|flame|glow|beam/i.test(matName)) {
        shadowGen.addShadowCaster(m, false);
      }
    }
  }
  return meshes;
}

export function findMaterialsInNodes(nodes, regex) {
  const mats = [];
  const seen = new Set();
  const meshes = collectMeshes(nodes);
  for (let i = 0; i < meshes.length; i += 1) {
    const mat = meshes[i].material;
    if (!mat || seen.has(mat)) continue;
    seen.add(mat);
    if (regex.test(mat.name || "")) mats.push(mat);
  }
  return mats;
}

export function tuneGLBMaterial(mat, { isFoliage = false, isAquatic = false, tintHex = null } = {}) {
  if (!mat) return;
  const name = mat.name || "";
  if (mat instanceof PBRMaterial) {
    if (mat.albedoTexture) mat.albedoTexture.anisotropicFilteringLevel = 8;
    if (mat.bumpTexture) mat.bumpTexture.anisotropicFilteringLevel = 8;
    if (mat.metallicTexture) mat.metallicTexture.anisotropicFilteringLevel = 8;
    if (mat.metallicF0Factor !== undefined) mat.metallicF0Factor = 0.46;
    if (mat.subSurface) {
      mat.subSurface.isRefractionEnabled = false;
      mat.subSurface.isTranslucencyEnabled = false;
    }
    if (isFoliage) {
      mat.backFaceCulling = false;
      mat.metallic = 0;
      mat.roughness = clamp(mat.roughness ?? 0.68, 0.52, 0.86);
      if (mat.albedoTexture?.hasAlpha || mat.transparencyMode === PBRMaterial.PBRMATERIAL_ALPHABLEND) {
        mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
        mat.alphaCutOff = 0.34;
        mat.needDepthPrePass = true;
      }
    } else if (isAquatic) {
      mat.backFaceCulling = false;
      mat.metallic = 0.04;
      mat.roughness = 0.24;
      if (mat.subSurface) {
        mat.subSurface.isRefractionEnabled = false;
        mat.subSurface.isTranslucencyEnabled = false;
      }
    } else if (/oil_lamp.*flame/i.test(name)) {
      mat.albedoColor = hexToColor3(0xffc96b);
      mat.emissiveColor = hexToColor3(0xe07b24);
      mat.emissiveIntensity = 0.36;
      mat.roughness = 0.35;
    } else if (/oil_lamp/i.test(name) && !/glass/i.test(name)) {
      mat.emissiveColor = new Color3(0, 0, 0);
      mat.emissiveIntensity = 0;
    } else if (/chandelier.*glass/i.test(name)) {
      mat.albedoColor = hexToColor3(0xfff4ea);
      mat.emissiveColor = hexToColor3(0xffcfa0);
      mat.emissiveIntensity = 0.28;
      mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      mat.alpha = 0.82;
      mat.roughness = 0.08;
    } else if (/glass/i.test(name)) {
      mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      mat.alpha = 0.28;
      mat.roughness = 0.08;
      mat.needDepthPrePass = false;
    }
    if (tintHex !== null) {
      mat.albedoColor = hexToColor3(tintHex);
    }
  } else if (mat instanceof StandardMaterial) {
    if (isFoliage) mat.backFaceCulling = false;
    if (tintHex !== null) mat.diffuseColor = hexToColor3(tintHex);
  }
}

/**
 * Normalize a static GLB AssetContainer around XZ-center & aligned Y ("min" | "max" | "center")
 * and render placement batches via GPU ThinInstances while keeping source transforms exact.
 */
export function placeNormalizedGLBBatch(
  scene,
  container,
  parent,
  placements,
  {
    name = "GLBBatch",
    alignY = "min",
    isFoliage = false,
    isAquatic = false,
    filterFn = null,
    castShadow = true,
    receiveShadow = true,
    shadowGen = null,
  } = {}
) {
  if (!container || !placements?.length) return null;
  const inst = container.instantiateModelsToScene((s) => `${name}_proto_${s}`, false, {
    doNotInstantiate: true,
  });
  const roots = inst.rootNodes || [];
  for (let i = 0; i < roots.length; i += 1) {
    roots[i].computeWorldMatrix(true);
  }

  const allMeshes = collectMeshes(roots).filter((m) => (filterFn ? filterFn(m) : true));
  if (!allMeshes.length) {
    roots.forEach((r) => r.dispose());
    return null;
  }

  const minV = new Vector3(Infinity, Infinity, Infinity);
  const maxV = new Vector3(-Infinity, -Infinity, -Infinity);
  const partEntries = [];
  for (let i = 0; i < allMeshes.length; i += 1) {
    const m = allMeshes[i];
    m.computeWorldMatrix(true);
    const bi = m.getBoundingInfo();
    minV.minimizeInPlace(bi.boundingBox.minimumWorld);
    maxV.maximizeInPlace(bi.boundingBox.maximumWorld);
    partEntries.push({ mesh: m, worldMat: m.getWorldMatrix().clone() });
  }

  const center = minV.add(maxV).scale(0.5);
  const size = maxV.subtract(minV);
  const yRef = alignY === "max" ? maxV.y : alignY === "center" ? center.y : minV.y;
  const offsetMat = Matrix.Translation(-center.x, -yRef, -center.z);

  const batchNode = new TransformNode(`${name}_Batch`, scene);
  batchNode.parent = parent;

  // Group placements by tint override so uniform-color instances (e.g. blush armchair/sofa) share materials cleanly
  const tintGroups = new Map();
  for (let i = 0; i < placements.length; i += 1) {
    const p = placements[i];
    const tintKey = p.tintAll && p.color !== undefined ? String(p.color) : "base";
    if (!tintGroups.has(tintKey)) tintGroups.set(tintKey, []);
    tintGroups.get(tintKey).push(p);
  }

  let matCache = _sceneBatchMatCache.get(scene);
  if (!matCache) {
    matCache = new Map();
    _sceneBatchMatCache.set(scene, matCache);
  }

  const groupKeys = [...tintGroups.keys()];
  for (let gIdx = 0; gIdx < groupKeys.length; gIdx += 1) {
    const gk = groupKeys[gIdx];
    const list = tintGroups.get(gk);
    const tintVal = gk === "base" ? null : Number(gk);

    for (let pIdx = 0; pIdx < partEntries.length; pIdx += 1) {
      const { mesh: srcMesh, worldMat } = partEntries[pIdx];
      const baseMesh = gIdx === 0 ? srcMesh : srcMesh.clone(`${name}_${gIdx}_${pIdx}`, batchNode, true, false);
      if (!baseMesh) continue;

      baseMesh.parent = batchNode;
      baseMesh.makeGeometryUnique();
      baseMesh.position.setAll(0);
      baseMesh.rotationQuaternion = null;
      baseMesh.rotation.setAll(0);
      baseMesh.scaling.setAll(1);
      baseMesh.isPickable = false;
      baseMesh.receiveShadows = receiveShadow;

      if (baseMesh.material) {
        const srcMat = baseMesh.material;
        const modeTag = `${isFoliage ? 1 : 0}|${isAquatic ? 1 : 0}`;
        const cacheKey = `${srcMat.uniqueId}|${gk}|${modeTag}`;
        let sharedMat = matCache.get(cacheKey);
        if (!sharedMat) {
          if (gk === "base" && (!srcMat._batchModeTag || srcMat._batchModeTag === modeTag)) {
            if (!srcMat._batchModeTag) {
              tuneGLBMaterial(srcMat, { isFoliage, isAquatic, tintHex: null });
              srcMat._batchModeTag = modeTag;
            }
            sharedMat = srcMat;
          } else {
            sharedMat = cloneMaterialSharingTextures(srcMat, `${srcMat.name || name}_${gk}_shared`);
            tuneGLBMaterial(sharedMat, { isFoliage, isAquatic, tintHex: tintVal });
          }
          matCache.set(cacheKey, sharedMat);
        }
        baseMesh.material = sharedMat;
      }

      const partLocalMat = worldMat.multiply(offsetMat);
      const buf = new Float32Array(list.length * 16);
      for (let k = 0; k < list.length; k += 1) {
        const p = list[k];
        const q = Quaternion.RotationYawPitchRoll(p.ry || 0, p.rx || 0, p.rz || 0);
        const sx = p.sx ?? p.s ?? 1;
        const sy = p.sy ?? p.s ?? 1;
        const sz = p.sz ?? p.s ?? 1;
        const wMat = Matrix.Compose(new Vector3(sx, sy, sz), q, new Vector3(p.x, p.y, p.z));
        const finalMat = partLocalMat.multiply(wMat);
        finalMat.copyToArray(buf, k * 16);
      }
      baseMesh.thinInstanceSetBuffer("matrix", buf, 16, true);
      if (castShadow && shadowGen) {
        shadowGen.addShadowCaster(baseMesh, false);
      }
    }
  }

  // Dispose unused container roots or unpicked meshes
  const pickedSet = new Set(allMeshes);
  for (const m of collectMeshes(roots)) {
    if (!pickedSet.has(m)) m.dispose();
  }
  roots.forEach((r) => {
    if (!r.getTotalVertices || r.getTotalVertices() === 0) {
      // Only dispose transform-only roots whose kept children were reparented
      if (!r.getChildren().length) r.dispose();
    }
  });

  return { node: batchNode, size, center };
}

export function measureNormalizedContainer(scene, container, { rotateY = 0 } = {}) {
  const inst = container.instantiateModelsToScene((s) => `_m_${s}`, false, { doNotInstantiate: true });
  const roots = inst.rootNodes || [];
  const tmpRoot = new TransformNode("_measure", scene);
  roots.forEach((r) => {
    r.parent = tmpRoot;
  });
  tmpRoot.rotation.y = rotateY;
  tmpRoot.computeWorldMatrix(true);
  const minV = new Vector3(Infinity, Infinity, Infinity);
  const maxV = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const m of collectMeshes(roots)) {
    m.computeWorldMatrix(true);
    const bi = m.getBoundingInfo();
    minV.minimizeInPlace(bi.boundingBox.minimumWorld);
    maxV.maximizeInPlace(bi.boundingBox.maximumWorld);
  }
  const center = minV.add(maxV).scale(0.5);
  const size = maxV.subtract(minV);
  tmpRoot.dispose(false, false);
  return { min: minV, max: maxV, center, size };
}

export function createExtrudedHeartGeometry(name, scene, scaleXZ = 1, depth = 0.08) {
  const segs = 32;
  const frontPts = [];
  const backPts = [];
  const k = scaleXZ / 16;
  for (let i = 0; i < segs; i += 1) {
    const t = (i / segs) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3) * k;
    const y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * k;
    frontPts.push([x, y, depth * 0.5]);
    backPts.push([x, y, -depth * 0.5]);
  }
  const pos = [];
  const idx = [];
  // Front & back fan centers
  const fCenterIdx = 0;
  pos.push(0, 0, depth * 0.5);
  const bCenterIdx = 1;
  pos.push(0, 0, -depth * 0.5);
  for (let i = 0; i < segs; i += 1) {
    pos.push(...frontPts[i]);
  }
  for (let i = 0; i < segs; i += 1) {
    pos.push(...backPts[i]);
  }
  for (let i = 0; i < segs; i += 1) {
    const i1 = (i + 1) % segs;
    const f0 = 2 + i;
    const f1 = 2 + i1;
    const b0 = 2 + segs + i;
    const b1 = 2 + segs + i1;
    idx.push(fCenterIdx, f0, f1);
    idx.push(bCenterIdx, b1, b0);
    idx.push(f0, b0, b1, f0, b1, f1);
  }
  const nrm = new Float32Array(pos.length);
  VertexData.ComputeNormals(pos, idx, nrm);
  const vd = new VertexData();
  vd.positions = pos;
  vd.indices = idx;
  vd.normals = nrm;
  const m = new Mesh(name, scene);
  vd.applyToMesh(m);
  m.isPickable = false;
  return m;
}

export function createPondRippleNormalTexture(scene) {
  const tex = new DynamicTexture("PondRippleNorm", { width: 128, height: 128 }, scene, true);
  const ctx = tex.getContext();
  ctx.fillStyle = "rgb(128,128,255)";
  ctx.fillRect(0, 0, 128, 128);
  const rng = mulberry32(4177);
  for (let y = 0; y < 128; y += 2) {
    for (let x = 0; x < 128; x += 2) {
      const n = Math.sin(x * 0.19 + y * 0.14) * 14 + (rng() - 0.5) * 10;
      const r = clamp(Math.round(128 + n), 96, 160);
      const g = clamp(Math.round(128 - n * 0.8), 96, 160);
      ctx.fillStyle = `rgb(${r},${g},255)`;
      ctx.fillRect(x, y, 2, 2);
    }
  }
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.uScale = 3;
  tex.vScale = 3;
  return tex;
}

export function createWaterfallRibbonTexture(scene) {
  const tex = new DynamicTexture("WaterfallRibbon", { width: 128, height: 256 }, scene, true);
  const ctx = tex.getContext();
  const rng = mulberry32(9051);
  ctx.clearRect(0, 0, 128, 256);
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, "rgba(182, 234, 240, 0.56)");
  grad.addColorStop(0.55, "rgba(148, 220, 230, 0.44)");
  grad.addColorStop(0.88, "rgba(218, 248, 250, 0.68)");
  grad.addColorStop(1.0, "rgba(244, 252, 255, 0.84)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 90; i += 1) {
    const x = rng() * 128;
    const y = rng() * 220;
    const h = 24 + rng() * 90;
    const w = 1.0 + rng() * 2.4;
    ctx.fillStyle = `rgba(255, 255, 255, ${(0.18 + rng() * 0.32).toFixed(2)})`;
    ctx.fillRect(x, y, w, h);
  }
  tex.update();
  tex.hasAlpha = true;
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

export function createFlowingWaterTexture(scene, repeatX = 2, repeatY = 20) {
  const tex = new DynamicTexture("CreekFlowTex", { width: 128, height: 128 }, scene, true);
  const ctx = tex.getContext();
  ctx.fillStyle = "#5fc8bc";
  ctx.fillRect(0, 0, 128, 128);
  const rng = mulberry32(3197);
  for (let i = 0; i < 160; i += 1) {
    const x = rng() * 128;
    const y = rng() * 128;
    const h = 14 + rng() * 26;
    ctx.fillStyle = rng() > 0.35 ? "rgba(236, 255, 252, 0.34)" : "rgba(62, 165, 160, 0.32)";
    ctx.fillRect(x, y, 2.2, h);
  }
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.uScale = repeatX;
  tex.vScale = repeatY;
  return tex;
}

export function buildSculptedParasol(scene, parent, name, x, y, z, { radius = 1.54, height = 2.52, teakMat, canvasMat, brassMat }) {
  const root = new TransformNode(name, scene);
  root.parent = parent;
  root.position.set(x, y, z);

  const pole = MeshBuilder.CreateCylinder(`${name}_Pole`, { diameter: 0.056, height, tessellation: 10 }, scene);
  pole.parent = root;
  pole.position.y = height * 0.5;
  pole.material = teakMat;

  const finial = MeshBuilder.CreateCylinder(`${name}_Finial`, { diameterTop: 0, diameterBottom: 0.11, height: 0.14, tessellation: 10 }, scene);
  finial.parent = root;
  finial.position.y = height + 0.05;
  finial.material = brassMat;

  const canopy = MeshBuilder.CreateCylinder(
    `${name}_Canopy`,
    { diameterTop: 0.08, diameterBottom: radius * 2, height: radius * 0.32, tessellation: 10 },
    scene
  );
  canopy.parent = root;
  canopy.position.y = height - radius * 0.14;
  canopy.material = canvasMat;

  const valance = MeshBuilder.CreateCylinder(
    `${name}_Valance`,
    { diameterTop: radius * 2, diameterBottom: radius * 2.02, height: 0.16, tessellation: 10, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  valance.parent = root;
  valance.position.y = height - radius * 0.3 - 0.07;
  valance.material = canvasMat;

  root.getChildMeshes().forEach((m) => {
    m.isPickable = false;
  });
  return root;
}

