// Harbor, Breakwater, Lighthouse, Windmill, Creek Bridge, Coastal Villa, 18 CC0 Interiors,
// Monet Lily Pond & Bougainvillea Swing Garden (Babylon.js 9.36 + Sculpted Blender GLBs).

import "@babylonjs/core/Meshes/thinInstanceMesh";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { instantiateGLB } from "./assets-loader.js";
import { createInteractionFX, easeOutBack } from "./flora-and-fx.js";
import {
  COTTAGE_SPECS,
  POND_CONFIG,
  SWING_CONFIG,
  clamp,
  getCreekCenterX,
  getGraniteSlabTexture,
  getGraniteSlabNormalTexture,
  getPondNormalizedRadius,
  getTeakDeckTexture,
  getTeakDeckNormalTexture,
  getWorldTerrainY,
  hexToColor3,
  lerp,
  makePbrMat,
  mulberry32,
  registerBoxCollider,
  registerCircleCollider,
  registerRotatedBoxCollider,
  registerWalkZone,
  smoothstep,
} from "./world-spatial.js";

const _V_UP = new Vector3(0, 1, 0);

function findDescendantByName(nodes, exactSuffix) {
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

function collectMeshes(nodes) {
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

function applyGLBShadows(nodes, shadowGen, { cast = true, receive = true } = {}) {
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

function findMaterialsInNodes(nodes, regex) {
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

function tuneGLBMaterial(mat, { isFoliage = false, isAquatic = false, tintHex = null } = {}) {
  if (!mat) return;
  const name = mat.name || "";
  if (mat instanceof PBRMaterial) {
    if (mat.albedoTexture) mat.albedoTexture.anisotropicFilteringLevel = 8;
    if (mat.bumpTexture) mat.bumpTexture.anisotropicFilteringLevel = 8;
    if (mat.metallicTexture) mat.metallicTexture.anisotropicFilteringLevel = 8;
    if (mat.metallicF0Factor !== undefined) mat.metallicF0Factor = 0.46;
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
function placeNormalizedGLBBatch(
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
        baseMesh.material = baseMesh.material.clone(`${name}_${gk}_${pIdx}_mat`);
        tuneGLBMaterial(baseMesh.material, { isFoliage, isAquatic, tintHex: tintVal });
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

function measureNormalizedContainer(scene, container, { rotateY = 0 } = {}) {
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

function createExtrudedHeartGeometry(name, scene, scaleXZ = 1, depth = 0.08) {
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

function createPondRippleNormalTexture(scene) {
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

function createWaterfallRibbonTexture(scene) {
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

function createFlowingWaterTexture(scene, repeatX = 2, repeatY = 20) {
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

function buildSculptedParasol(scene, parent, name, x, y, z, { radius = 1.54, height = 2.52, teakMat, canvasMat, brassMat }) {
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

// ---------------------------------------------------------------------------
// 1. Coastal Villa + 18 CC0 Interior Props + Villa Walk Zones & Colliders
// ---------------------------------------------------------------------------

function buildCoastalVillaSection(scene, root, models, shadowGen, fx) {
  const vGroup = new TransformNode("CoastalVillaGroup", scene);
  vGroup.parent = root;

  // 1F, 2F, Staircase & Exterior Stairway Walk Zones
  registerWalkZone((x, z, refY) => {
    if (x >= -22.42 && x <= -20.82 && z >= -9.3 && z <= -3.2) {
      const stairT = clamp((-3.2 - z) / 5.8, 0, 1);
      const stairY = lerp(2.6, 6.12, stairT);
      if (typeof refY !== "number" || Math.abs(refY - stairY) < 2.2) return stairY;
    }
    const candidates = [];
    if (x >= -25.25 && x <= -2.75 && z >= -10.65 && z <= 6.65) candidates.push(2.6);
    const in2FMaster = x >= -23.35 && x <= -11.15 && z >= -9.75 && z <= 4.05;
    const in2FJuliet = x >= -17.15 && x <= -10.85 && z > 4.0 && z <= 6.35;
    const in2FEastTerrace = x > -11.15 && x <= -4.05 && z >= -9.75 && z <= -1.45;
    if (in2FMaster || in2FJuliet || in2FEastTerrace) candidates.push(6.12);
    if (candidates.length > 0) return typeof refY === "number" ? candidates : 2.6;

    if (x >= -16.25 && x <= -11.75 && z > 6.65 && z <= 8.85) return lerp(2.6, 2.2, clamp((z - 6.65) / 2.2, 0, 1));
    if (x >= -27.45 && x < -25.25 && z >= -0.15 && z <= 2.35) return lerp(2.2, 2.6, clamp((x + 27.45) / 2.2, 0, 1));
    if (x > -2.75 && x <= -0.55 && z >= -0.25 && z <= 2.05) return lerp(2.6, 2.2, clamp((x + 2.75) / 2.2, 0, 1));
    return null;
  });

  // Authoritative Villa Structural & Furniture Colliders (Exact 1F / 2F Y-bounds)
  const boxCols = [
    [-16.45, -16.15, 6.55, 8.9, 2.0, 4.0],
    [-11.85, -11.55, 6.55, 8.9, 2.0, 4.0],
    [-8.45, -6.35, 2.85, 4.75, 2.0, 5.0],
    [-23.5, -15.2, 3.86, 4.14, 2.0, 5.2],
    [-12.8, -10.3, 3.86, 4.14, 2.0, 5.2],
    [-10.54, -10.26, -1.5, 0.2, 2.0, 5.2],
    [-10.54, -10.26, 2.2, 4.12, 2.0, 5.2],
    [-10.45, -3.95, -1.54, -1.26, 2.0, 5.2],
    [-4.14, -3.86, -9.9, -1.35, 2.0, 5.2],
    [-23.54, -23.26, -9.9, 0.1, 2.0, 5.2],
    [-23.54, -23.26, 2.1, 4.12, 2.0, 5.2],
    [-23.5, -3.9, -9.94, -9.66, 2.0, 5.2],
    [-20.05, -16.75, -3.24, -2.96, 2.0, 5.2],
    [-10.54, -10.26, -9.8, -6.2, 2.0, 5.2],
    [-10.54, -10.26, -4.2, -1.4, 2.0, 5.2],
    [-22.55, -20.75, -9.6, -5.2, 2.0, 3.4],
    [-23.5, -15.1, 3.86, 4.14, 5.4, 9.8],
    [-12.9, -11.1, 3.86, 4.14, 5.4, 9.8],
    [-11.34, -11.06, -9.9, -6.4, 5.4, 9.8],
    [-11.34, -11.06, -4.2, 4.12, 5.4, 9.8],
    [-23.54, -23.26, -9.9, 4.12, 5.4, 9.8],
    [-23.5, -11.1, -9.94, -9.66, 5.4, 9.8],
    [-8.35, -6.65, -6.4, -4.4, 5.4, 9.8],
    [-19.72, -17.08, -3.05, -2.12, 2.0, 5.2],
    [-20.32, -17.28, 1.64, 2.68, 2.0, 5.2],
    [-23.32, -22.58, -2.3, -0.8, 2.0, 5.2],
    [-19.6, -18.0, 0.08, 1.08, 2.0, 5.2],
    [-13.85, -11.45, 0.35, 1.95, 2.0, 5.2],
    [-19.3, -11.0, -9.75, -8.82, 2.0, 5.2],
    [-16.38, -13.62, -6.95, -5.32, 2.0, 5.2],
    [-10.3, -9.72, -9.5, -6.4, 2.0, 5.2],
    [-5.35, -4.12, -6.85, -3.88, 2.0, 5.2],
    [-8.32, -6.48, -8.72, -7.02, 2.0, 5.2],
    [-17.95, -15.65, -8.68, -5.75, 5.4, 9.8],
    [-18.75, -18.08, -8.65, -8.02, 5.4, 9.8],
    [-15.52, -14.85, -8.65, -8.02, 5.4, 9.8],
    [-17.45, -15.85, 2.6, 3.92, 5.4, 9.8],
    [-22.78, -21.45, -1.55, 1.05, 5.4, 9.8],
    [-13.45, -11.65, -9.42, -8.65, 5.4, 9.8],
    // 1F & 2F Balustrade rails
    [-25.18, -16.25, 6.38, 6.58, 2.0, 5.0],
    [-11.75, -2.85, 6.38, 6.58, 2.0, 5.0],
    [-25.18, -2.85, -10.58, -10.38, 2.0, 5.0],
    [-25.2, -25.0, -10.5, -0.15, 2.0, 5.0],
    [-25.2, -25.0, 2.35, 6.5, 2.0, 5.0],
    [-3.0, -2.8, -10.5, -0.25, 2.0, 5.0],
    [-3.0, -2.8, 2.05, 6.5, 2.0, 5.0],
    [-17.2, -10.8, 6.2, 6.4, 5.4, 9.8],
    [-17.2, -17.0, 4.05, 6.35, 5.4, 9.8],
    [-11.0, -10.8, 4.05, 6.35, 5.4, 9.8],
    [-11.2, -3.95, -1.52, -1.32, 5.4, 9.8],
    [-11.2, -3.95, -9.88, -9.68, 5.4, 9.8],
    [-4.12, -3.92, -9.8, -1.4, 5.4, 9.8],
    [-20.12, -19.92, -8.6, -3.15, 5.4, 9.8],
    [-23.25, -19.95, -3.3, -3.1, 5.4, 9.8],
  ];
  for (let i = 0; i < boxCols.length; i += 1) {
    registerBoxCollider(...boxCols[i]);
  }
  const cylCols = [
    [-20.68, 0.44, 0.44, 2.0, 5.2],
    [-16.92, 0.46, 0.46, 2.0, 5.2],
    [-5.65, -2.55, 0.4, 2.0, 5.2],
    [-4.82, -2.85, 0.28, 2.0, 5.2],
    [-9.25, -2.25, 0.36, 2.0, 5.2],
    [-16.55, -2.15, 0.34, 2.0, 5.2],
    [-22.45, 3.15, 0.36, 2.0, 5.2],
    [-12.05, 3.15, 0.36, 5.4, 9.8],
    [-19.45, -3.55, 0.36, 5.4, 9.8],
    [-9.6, 5.8, 0.16, 2.0, 5.0],
    [-5.2, 5.8, 0.16, 2.0, 5.0],
    [-9.6, 1.8, 0.16, 2.0, 5.0],
    [-5.2, 1.8, 0.16, 2.0, 5.0],
    [-9.8, -2.4, 0.16, 5.4, 9.8],
    [-5.2, -2.4, 0.16, 5.4, 9.8],
    [-9.8, -8.4, 0.16, 5.4, 9.8],
    [-5.2, -8.4, 0.16, 5.4, 9.8],
  ];
  for (let i = 0; i < cylCols.length; i += 1) {
    registerCircleCollider(...cylCols[i]);
  }
  for (const px of [-17.1, -15.05, -12.95, -10.9]) {
    registerCircleCollider(px, 6.28, 0.22, 2.0, 5.2);
  }

  // Instantiate Sculpted Blender Villa GLB at world origin (authored in exact world coords)
  const villaInst = instantiateGLB(models.coastal_villa, "VillaGLB", vGroup);
  const villaNodes = villaInst?.rootNodes || [];
  applyGLBShadows(villaNodes, shadowGen, { cast: true, receive: true });

  // Tune transparent / glass materials inside Villa GLB
  for (const gm of findMaterialsInNodes(villaNodes, /Villa_Glass|Villa_Sheer/i)) {
    tuneGLBMaterial(gm);
  }

  // Extract animated subnodes from CoastalVillaRoot
  const frontDoorL = findDescendantByName(villaNodes, "Villa_FrontDoor_L");
  const frontDoorR = findDescendantByName(villaNodes, "Villa_FrontDoor_R");
  const doorLOpenQuat = frontDoorL?.rotationQuaternion ? frontDoorL.rotationQuaternion.clone() : Quaternion.RotationYawPitchRoll(1.48, 0, 0);
  const doorROpenQuat = frontDoorR?.rotationQuaternion ? frontDoorR.rotationQuaternion.clone() : Quaternion.RotationYawPitchRoll(-1.48, 0, 0);
  const fridgeDoor = findDescendantByName(villaNodes, "Fridge_Door");
  const fridgeBaseQuat = fridgeDoor?.rotationQuaternion ? fridgeDoor.rotationQuaternion.clone() : Quaternion.Identity();
  const armoireDoorL = findDescendantByName(villaNodes, "Armoire_Door_L");
  const armoireDoorR = findDescendantByName(villaNodes, "Armoire_Door_R");
  const armoireBaseQuatL = armoireDoorL?.rotationQuaternion ? armoireDoorL.rotationQuaternion.clone() : Quaternion.Identity();
  const armoireBaseQuatR = armoireDoorR?.rotationQuaternion ? armoireDoorR.rotationQuaternion.clone() : Quaternion.Identity();
  const gramoDisc = findDescendantByName(villaNodes, "Gramophone_Disc");
  const gramoBaseQuat = gramoDisc?.rotationQuaternion ? gramoDisc.rotationQuaternion.clone() : Quaternion.Identity();
  const studyGlobe = findDescendantByName(villaNodes, "Study_Globe");
  const globeBaseQuat = studyGlobe?.rotationQuaternion ? studyGlobe.rotationQuaternion.clone() : Quaternion.Identity();
  // Rotate ONLY Coffee_LeverArm (child of Coffee_Lever), keeping Coffee_MachineBody steady
  const coffeeLeverArm = findDescendantByName(villaNodes, "Coffee_LeverArm") || findDescendantByName(villaNodes, "Coffee_Lever");
  const coffeeBaseQuat = coffeeLeverArm?.rotationQuaternion ? coffeeLeverArm.rotationQuaternion.clone() : Quaternion.Identity();

  const emberMats = findMaterialsInNodes(villaNodes, /Villa_WarmEmbers/i);
  const emeraliteMats = findMaterialsInNodes(villaNodes, /Villa_EmeraliteShade/i);

  // Interior Warm Point Lights (Hearth + Study + 2F Bedside)
  const hearthLight = new PointLight("VillaHearthLight", new Vector3(-18.4, 3.25, -2.5), scene);
  hearthLight.diffuse = hexToColor3(0xffa652);
  hearthLight.intensity = 4.5;
  hearthLight.range = 13.0;

  const studyLight = new PointLight("VillaStudyLight", new Vector3(-7.4, 4.35, -7.8), scene);
  studyLight.diffuse = hexToColor3(0xffe1ae);
  studyLight.intensity = 2.8;
  studyLight.range = 10.5;

  const masterLight = new PointLight("VillaMasterLight", new Vector3(-16.8, 7.65, -7.6), scene);
  masterLight.diffuse = hexToColor3(0xffd7a8);
  masterLight.intensity = 3.2;
  masterLight.range = 11.5;

  // Dynamic Interior Accents (Flames, Logs, Coals, Drapes, Tea Service, Bedside Lamps, Guitar)
  const flameMat = new StandardMaterial("VillaFlameMat", scene);
  flameMat.diffuseColor = hexToColor3(0xff9c42);
  flameMat.emissiveColor = hexToColor3(0xc45818);
  flameMat.alpha = 0.72;
  flameMat.disableLighting = true;

  const charredWoodMat = makePbrMat(scene, "HearthCharredWoodMat", 0x342116, { roughness: 0.90 });
  const coalGlowMat = makePbrMat(scene, "HearthCoalGlowMat", 0x3b180e, { roughness: 0.72 });
  coalGlowMat.emissiveColor = hexToColor3(0xb84214);
  coalGlowMat.emissiveIntensity = 0.55;
  for (const [lx, ly, lz, ry, rz] of [
    [-18.42, 2.75, -2.72, 0.28, 1.50],
    [-18.38, 2.77, -2.69, -0.34, 1.44],
    [-18.44, 2.81, -2.71, 0.08, 1.62],
  ]) {
    const log = MeshBuilder.CreateCylinder(`HearthLog_${lx}_${ly}`, { diameterTop: 0.075, diameterBottom: 0.095, height: 0.56, tessellation: 10 }, scene);
    log.parent = vGroup;
    log.position.set(lx, ly, lz);
    log.rotation.set(0, ry, rz);
    log.material = charredWoodMat;
    log.isPickable = false;
  }
  for (let ci = 0; ci < 6; ci += 1) {
    const coal = MeshBuilder.CreateSphere(`HearthCoal_${ci}`, { diameterX: 0.11, diameterY: 0.065, diameterZ: 0.09, segments: 6 }, scene);
    coal.parent = vGroup;
    coal.position.set(-18.60 + ci * 0.08, 2.735 + (ci % 2) * 0.014, -2.69 + ((ci * 37) % 5) * 0.012);
    coal.rotation.set(0.2 * ci, 0.7 * ci, 0);
    coal.material = coalGlowMat;
    coal.isPickable = false;
  }

  const estateGlow = scene.getGlowLayerByName?.("EstateGlow");
  const fireplaceFlames = [];
  for (let i = 0; i < 5; i += 1) {
    const fl = MeshBuilder.CreateCylinder(`HearthFlame_${i}`, { diameterTop: 0.025, diameterBottom: 0.095, height: 0.17, tessellation: 8 }, scene);
    fl.parent = vGroup;
    fl.position.set(-18.58 + i * 0.095, 2.86 + (i % 2) * 0.025, -2.71 + (i % 3) * 0.015);
    fl.material = flameMat;
    fl.isPickable = false;
    estateGlow?.addExcludedMesh?.(fl);
    fireplaceFlames.push(fl);
  }
  const candleFlames = [];
  for (const [cx, cy, cz] of [
    [-19.34, 4.37, -2.64],
    [-17.46, 4.37, -2.64],
    [-18.88, 3.26, 0.56],
  ]) {
    const cf = MeshBuilder.CreateSphere(`CandleFlame_${cx}`, { diameterX: 0.032, diameterY: 0.072, diameterZ: 0.032, segments: 6 }, scene);
    cf.parent = vGroup;
    cf.position.set(cx, cy, cz);
    cf.material = flameMat;
    cf.isPickable = false;
    estateGlow?.addExcludedMesh?.(cf);
    candleFlames.push(cf);
  }

  // Animated Salon & 2F Sea-View Drapes
  const drapeRoseMat = makePbrMat(scene, "VillaAnimatedDrape", 0xd48ca0, { roughness: 0.78, doubleSided: true });
  const buildCurtainPair = (name, x, y, z, width, height, rotY) => {
    const p = new TransformNode(name, scene);
    p.parent = vGroup;
    p.position.set(x, y, z);
    p.rotation.y = rotY;
    const panels = [];
    for (const s of [-1, 1]) {
      const m = MeshBuilder.CreateBox(`${name}_${s > 0 ? "R" : "L"}`, { width: width * 0.48, height, depth: 0.08 }, scene);
      m.parent = p;
      m.position.set(s * width * 0.42, height * 0.5, 0);
      m.material = drapeRoseMat;
      m.isPickable = false;
      panels.push({ mesh: m, side: s, span: width * 0.45 });
    }
    return panels;
  };
  const salonDrapes = buildCurtainPair("SalonDrapes", -19.6, 2.68, 3.84, 3.8, 2.45, 0);
  const nookDrapes = buildCurtainPair("NookDrapes", -23.22, 6.2, -0.3, 3.6, 2.42, Math.PI * 0.5);

  // Range Kettle Steam Flame & Burner Ring (-13.22, 3.55, -9.08)
  const kettleFlame = MeshBuilder.CreateCylinder("RangeKettleFlame", { diameter: 0.18, height: 0.04, tessellation: 14 }, scene);
  kettleFlame.parent = vGroup;
  kettleFlame.position.set(-13.22, 3.545, -9.08);
  kettleFlame.material = flameMat;
  kettleFlame.setEnabled(false);

  // 1F Salon Animated Teapot on Coffee Table (-18.80, 3.13, 0.58)
  const brassMat = makePbrMat(scene, "VillaDynamicBrass", 0xd4ad5e, { roughness: 0.24, metallic: 0.88 });
  const porcelainMat = makePbrMat(scene, "VillaPorcelain", 0xfefaf2, { roughness: 0.22 });
  const teaPotNode = new TransformNode("SalonTeapotPivot", scene);
  teaPotNode.parent = vGroup;
  teaPotNode.position.set(-18.74, 3.19, 0.62);
  const potBody = MeshBuilder.CreateSphere("SalonTeapotBody", { diameter: 0.16, segments: 10 }, scene);
  potBody.parent = teaPotNode;
  potBody.material = porcelainMat;
  const potSpout = MeshBuilder.CreateCylinder("SalonTeapotSpout", { diameterTop: 0.016, diameterBottom: 0.028, height: 0.11, tessellation: 8 }, scene);
  potSpout.parent = teaPotNode;
  potSpout.position.set(-0.08, 0.03, 0);
  potSpout.rotation.z = 0.8;
  potSpout.material = brassMat;

  // Conservatory Acoustic Guitar resting by Easel (-4.82, 2.60, -2.85)
  const guitarRoot = new TransformNode("StudyGuitar", scene);
  guitarRoot.parent = vGroup;
  guitarRoot.position.set(-4.82, 2.6, -2.85);
  guitarRoot.rotation.set(-0.22, -0.58, 0.08);
  const woodMat = makePbrMat(scene, "GuitarSpruce", 0x9b5a2f, { roughness: 0.36 });
  const neckMat = makePbrMat(scene, "GuitarWalnut", 0x4b2b18, { roughness: 0.42 });
  const lowerBout = MeshBuilder.CreateCylinder("G_Lower", { diameter: 0.36, height: 0.1, tessellation: 16 }, scene);
  lowerBout.parent = guitarRoot;
  lowerBout.rotation.x = Math.PI * 0.5;
  lowerBout.position.y = 0.22;
  lowerBout.material = woodMat;
  const upperBout = MeshBuilder.CreateCylinder("G_Upper", { diameter: 0.28, height: 0.1, tessellation: 16 }, scene);
  upperBout.parent = guitarRoot;
  upperBout.rotation.x = Math.PI * 0.5;
  upperBout.position.y = 0.46;
  upperBout.material = woodMat;
  const gNeck = MeshBuilder.CreateBox("G_Neck", { width: 0.06, height: 0.52, depth: 0.04 }, scene);
  gNeck.parent = guitarRoot;
  gNeck.position.set(0, 0.82, 0.02);
  gNeck.material = neckMat;
  const gStrings = MeshBuilder.CreateBox("G_Strings", { width: 0.045, height: 0.72, depth: 0.008 }, scene);
  gStrings.parent = guitarRoot;
  gStrings.position.set(0, 0.62, 0.056);
  gStrings.material = brassMat;

  // 2F Master Bedside Porcelain Ginger-Jar Lamps (-18.42 / -15.18, 6.82, -8.35)
  const bedShadeMat = new StandardMaterial("BedsideShadeMat", scene);
  bedShadeMat.diffuseColor = hexToColor3(0xfaf0df);
  bedShadeMat.emissiveColor = hexToColor3(0x8c6334);
  bedShadeMat.alpha = 0.94;
  const celadonMat = makePbrMat(scene, "BedsideCeladon", 0x92baa8, { roughness: 0.24 });
  for (const lx of [-18.42, -15.18]) {
    const jar = MeshBuilder.CreateSphere(`LampJar_${lx}`, { diameterX: 0.18, diameterY: 0.24, diameterZ: 0.18, segments: 12 }, scene);
    jar.parent = vGroup;
    jar.position.set(lx, 6.94, -8.35);
    jar.material = celadonMat;
    const shade = MeshBuilder.CreateCylinder(`LampShade_${lx}`, { diameterTop: 0.18, diameterBottom: 0.34, height: 0.24, tessellation: 14 }, scene);
    shade.parent = vGroup;
    shade.position.set(lx, 7.22, -8.35);
    shade.material = bedShadeMat;
    estateGlow?.addExcludedMesh?.(shade);
  }

  // Place ALL 18 CC0 Photogrammetry Props + Pergola Wisteria + Courtyard Planters inside Villa
  const addBatch = (modelKey, placements, opts = {}) =>
    placeNormalizedGLBBatch(scene, models[modelKey], vGroup, placements, {
      name: `Villa_${modelKey}`,
      shadowGen,
      ...opts,
    });

  addBatch(
    "ph_chandelier",
    [
      { x: -18.8, y: 5.96, z: 0.65, ry: 0.22, s: 1.02 },
      { x: -12.65, y: 5.96, z: 1.15, ry: 0.68, s: 0.92 },
      { x: -7.25, y: 5.92, z: -5.4, ry: -0.35, s: 0.88 },
      { x: -16.8, y: 9.36, z: -2.8, ry: 0.14, s: 1.04 },
    ],
    { alignY: "max", castShadow: false, receiveShadow: false }
  );
  addBatch("ph_coffee_table", [{ x: -18.8, y: 2.6, z: 0.58, ry: 0, s: 1.0 }]);
  addBatch("ph_green_chair", [
    { x: -20.68, y: 2.6, z: 0.44, ry: 1.18, s: 1.02 },
    { x: -7.4, y: 2.6, z: -7.34, ry: Math.PI + 0.16, s: 0.98 },
    { x: -22.15, y: 6.12, z: -1.02, ry: 1.16, s: 1.0 },
  ]);
  addBatch("ph_armchair", [
    { x: -16.92, y: 2.6, z: 0.46, ry: -1.16, s: 0.98, color: 0xf7e4e6, tintAll: true },
    { x: -22.15, y: 6.12, z: 0.52, ry: 1.96, s: 0.96, color: 0xf7e4e6, tintAll: true },
  ]);
  addBatch("ph_sofa", [
    { x: -4.68, y: 2.6, z: -5.85, ry: -Math.PI * 0.5, s: 1.15, color: 0xf8e5e7, tintAll: true },
    { x: -11.88, y: 6.12, z: 0.0, ry: -Math.PI * 0.5, s: 1.04, color: 0xf8e5e7, tintAll: true },
  ]);
  addBatch("ph_console", [
    { x: -22.94, y: 2.6, z: -1.55, ry: Math.PI * 0.5, s: 0.92 },
    { x: -16.65, y: 6.12, z: 3.55, ry: Math.PI, s: 0.94 },
  ]);
  addBatch(
    "ph_ornate_mirror",
    [
      { x: -18.4, y: 4.86, z: -2.94, ry: 0, s: 1.56 },
      { x: -16.65, y: 7.64, z: 3.845, ry: Math.PI, s: 1.42 },
    ],
    { alignY: "center", castShadow: false }
  );
  addBatch(
    "ph_picture_frame",
    [
      { x: -23.21, y: 4.28, z: -1.55, ry: Math.PI * 0.5, s: 1.26 },
      { x: -11.65, y: 4.22, z: 3.818, ry: Math.PI, s: 1.15 },
      { x: -11.385, y: 7.72, z: -2.95, ry: -Math.PI * 0.5, s: 1.24 },
      { x: -11.38, y: 7.72, z: 2.65, ry: -Math.PI * 0.5, s: 1.12 },
    ],
    { alignY: "center", castShadow: false }
  );
  addBatch("ph_nightstand", [
    { x: -18.42, y: 6.12, z: -8.35, ry: 0, s: 1.0 },
    { x: -15.18, y: 6.12, z: -8.35, ry: 0, s: 1.0 },
  ]);
  addBatch(
    "ph_mantel_clock",
    [
      { x: -18.4, y: 4.158, z: -2.63, ry: 0, s: 1.22 },
      { x: -9.94, y: 3.64, z: -7.8, ry: Math.PI * 0.5, s: 1.05 },
    ],
    { castShadow: false }
  );
  addBatch(
    "ph_alarm_clock",
    [
      { x: -18.24, y: 6.82, z: -8.24, ry: 0.28, s: 0.95 },
      { x: -6.48, y: 3.389, z: -8.24, ry: -0.45, s: 0.84 },
    ],
    { castShadow: false }
  );
  addBatch(
    "ph_oil_lamp",
    [
      { x: -22.92, y: 3.473, z: -1.96, ry: 0.4, s: 0.68 },
      { x: -4.72, y: 3.221, z: -4.22, ry: -0.6, s: 0.66 },
      { x: -7.62, y: 6.888, z: -5.32, ry: 0.2, s: 0.56 },
      { x: 20.65, y: 2.498, z: -14.1, ry: 0.3, s: 0.62 },
    ],
    { castShadow: false }
  );
  addBatch("ph_bistro_set", [
    { x: -7.4, y: 2.6, z: 3.8, ry: 0.38, s: 1.06 },
    { x: -7.5, y: 6.12, z: -5.4, ry: -0.32, s: 1.05 },
  ]);
  addBatch(
    "ph_tea_set",
    [
      { x: -18.92, y: 3.125, z: 0.56, ry: 0.08, s: 0.68 },
      { x: -15.12, y: 3.519, z: -6.36, ry: -0.12, s: 0.65 },
      { x: -7.46, y: 3.376, z: 3.88, ry: 0.38, s: 0.56 },
      { x: -22.05, y: 6.701, z: -0.25, ry: 1.55, s: 0.52 },
      { x: 20.4, y: 2.15, z: -9.5, ry: 0.4, s: 0.66 },
      { x: 16.05, y: 2.142, z: 6.28, ry: 0.8, s: 0.56 },
    ],
    { castShadow: false }
  );
  addBatch(
    "ph_croissant",
    [
      { x: -14.26, y: 3.55, z: -6.32, ry: 0.45, s: 1.18 },
      { x: -14.34, y: 3.55, z: -6.24, ry: -0.35, s: 1.1 },
      { x: -12.56, y: 3.388, z: 0.94, ry: 0.62, s: 1.12 },
      { x: -7.46, y: 6.888, z: -5.42, ry: -0.4, s: 1.15 },
      { x: 25.05, y: 2.15, z: -10.35, ry: 0.5, s: 1.2 },
    ],
    { castShadow: false }
  );
  addBatch(
    "ph_brass_pan",
    [
      { x: -13.96, y: 3.545, z: -8.95, ry: Math.PI + 0.18, s: 1.05 },
      { x: -15.32, y: 4.96, z: -6.07, rx: Math.PI * 0.5, s: 0.95 },
      { x: -15.0, y: 4.96, z: -6.07, rx: Math.PI * 0.5, s: 1.0 },
      { x: -14.68, y: 4.96, z: -6.07, rx: Math.PI * 0.5, s: 0.92 },
    ],
    { castShadow: false }
  );
  addBatch("ph_wicker_basket", [
    { x: -19.86, y: 2.6, z: -2.42, ry: 0.36, s: 1.22 },
    { x: -13.68, y: 6.12, z: -8.92, ry: 0.22, s: 1.15 },
    { x: -19.65, y: 2.22, z: 9.85, ry: -0.42, s: 1.15 },
  ]);
  addBatch("ph_watering_can", [
    { x: -8.92, y: 2.6, z: 5.22, ry: -0.65, s: 1.15 },
    { x: -5.05, y: 6.12, z: -2.28, ry: 0.78, s: 1.12 },
    { x: -24.2, y: 2.22, z: 16.8, ry: 1.15, s: 1.18 },
  ]);

  // Pergola Wisteria Cascades & Indoor/Terrace GLB Planters
  addBatch(
    "wisteria_cascade",
    [
      { x: -8.5, y: 5.56, z: 2.3, ry: 0.2, s: 0.48 },
      { x: -6.2, y: 5.56, z: 4.9, ry: 1.9, s: 0.48 },
      { x: -7.4, y: 5.56, z: 3.8, ry: 3.7, s: 0.48 },
      { x: -8.6, y: 8.95, z: -2.4, ry: 0.6, s: 0.48 },
      { x: -6.2, y: 8.95, z: -2.4, ry: 2.4, s: 0.48 },
      { x: -7.5, y: 8.95, z: -5.4, ry: 4.3, s: 0.48 },
    ],
    {
      alignY: "max",
      isFoliage: true,
      filterFn: (m) => m.getTotalVertices() > 4000,
      castShadow: false,
    }
  );
  addBatch(
    "rose_bush",
    [
      { x: -20.5, y: 2.24, z: 7.4, ry: 0.4, s: 0.46 },
      { x: -7.5, y: 2.24, z: 7.4, ry: 2.1, s: 0.46 },
      { x: -4.6, y: 6.26, z: -2.1, ry: 1.1, s: 0.34 },
      { x: -16.55, y: 2.66, z: -2.15, ry: 0.7, s: 0.28 },
    ],
    { isFoliage: true, castShadow: false }
  );
  addBatch(
    "margarita_bush",
    [
      { x: -4.6, y: 6.26, z: -8.9, ry: 0.5, s: 0.34 },
      { x: -22.45, y: 2.66, z: 3.15, ry: 2.2, s: 0.32 },
      { x: -12.05, y: 6.18, z: 3.15, ry: 3.8, s: 0.32 },
    ],
    { isFoliage: true, castShadow: false }
  );

  // Interactive Villa State
  const state = {
    doorsOpen: true,
    doorTarget: 1,
    doorAnim: 1,
    fireBoost: 0,
    candlesLit: true,
    gramophoneOn: false,
    gramoTimer: 0,
    salonDrapesOpen: true,
    salonDrapeAnim: 1,
    nookDrapesOpen: true,
    nookDrapeAnim: 1,
    fridgeOpen: false,
    fridgeAnim: 0,
    rangeActive: 0,
    espressoActive: 0,
    guitarActive: 0,
    globeSpinSpeed: 0,
    bedLampsOn: true,
    armoireOpen: false,
    armoireAnim: 0,
    teaPourActive: 0,
  };

  let nightMix = 0;

  function applyVillaInteractiveState(elapsed, dt) {
    state.doorAnim = lerp(state.doorAnim, state.doorTarget, 1 - Math.exp(-dt * 6));
    if (frontDoorL) {
      frontDoorL.rotationQuaternion = Quaternion.Slerp(Quaternion.Identity(), doorLOpenQuat, state.doorAnim);
    }
    if (frontDoorR) {
      frontDoorR.rotationQuaternion = Quaternion.Slerp(Quaternion.Identity(), doorROpenQuat, state.doorAnim);
    }

    state.fireBoost = Math.max(0, state.fireBoost - dt * 0.22);
    // Smooth warm organic firelight breathing without strobing the floor highlights
    const flicker = 0.95 + 0.038 * Math.sin(elapsed * 2.2) + 0.022 * Math.cos(elapsed * 3.5);
    const fMult = (1.0 + state.fireBoost * 1.4) * flicker;
    for (let i = 0; i < fireplaceFlames.length; i += 1) {
      const fl = fireplaceFlames[i];
      const fSin = Math.sin(elapsed * 4.5 + i * 1.9);
      fl.scaling.set(0.86 + 0.16 * fMult, 0.86 + 0.32 * fMult + 0.10 * fSin, 0.9);
      fl.rotation.z = 0.07 * fSin;
    }
    hearthLight.intensity = lerp(3.4, 6.8, nightMix) * fMult;

    for (let i = 0; i < candleFlames.length; i += 1) {
      const cf = candleFlames[i];
      cf.setEnabled(state.candlesLit);
      if (state.candlesLit) {
        const s = 0.9 + 0.18 * Math.sin(elapsed * 14 + i * 2.1);
        cf.scaling.set(1, s, 1);
      }
    }
    for (let i = 0; i < emberMats.length; i += 1) {
      const em = emberMats[i];
      if (em instanceof PBRMaterial) {
        em.emissiveIntensity = (state.candlesLit ? 0.65 : 0.25) * fMult;
      }
    }
    for (let i = 0; i < emeraliteMats.length; i += 1) {
      if (emeraliteMats[i] instanceof PBRMaterial) {
        emeraliteMats[i].emissiveIntensity = lerp(0.14, 0.42, nightMix);
      }
    }
    studyLight.intensity = lerp(2.2, 4.4, nightMix);
    masterLight.intensity = state.bedLampsOn ? lerp(2.4, 5.2, nightMix) : lerp(0.5, 1.2, nightMix);
    bedShadeMat.emissiveColor = hexToColor3(state.bedLampsOn ? 0x8c6334 : 0x3a2a1e);

    if (state.gramophoneOn) {
      state.gramoTimer = Math.max(0, state.gramoTimer - dt);
      if (state.gramoTimer <= 0) state.gramophoneOn = false;
      if (gramoDisc) {
        const qRot = Quaternion.RotationAxis(_V_UP, (elapsed * 3.4) % (Math.PI * 2));
        gramoDisc.rotationQuaternion = gramoBaseQuat.multiply(qRot);
      }
    }

    state.salonDrapeAnim = lerp(state.salonDrapeAnim, state.salonDrapesOpen ? 1 : 0, 1 - Math.exp(-dt * 6));
    for (const c of salonDrapes) {
      c.mesh.scaling.x = lerp(1.0, 0.34, state.salonDrapeAnim);
      c.mesh.position.x = c.side * lerp(c.span * 0.52, c.span * 0.92, state.salonDrapeAnim);
    }
    state.nookDrapeAnim = lerp(state.nookDrapeAnim, state.nookDrapesOpen ? 1 : 0, 1 - Math.exp(-dt * 6));
    for (const c of nookDrapes) {
      c.mesh.scaling.x = lerp(1.0, 0.34, state.nookDrapeAnim);
      c.mesh.position.x = c.side * lerp(c.span * 0.52, c.span * 0.92, state.nookDrapeAnim);
    }

    if (state.teaPourActive > 0) {
      state.teaPourActive = Math.max(0, state.teaPourActive - dt);
      const wave = Math.sin(clamp(state.teaPourActive / 2.4, 0, 1) * Math.PI);
      teaPotNode.rotation.z = 0.56 * wave;
      teaPotNode.position.y = 3.19 + 0.08 * wave;
    } else {
      teaPotNode.rotation.z = lerp(teaPotNode.rotation.z, 0, 1 - Math.exp(-dt * 8));
      teaPotNode.position.y = lerp(teaPotNode.position.y, 3.19, 1 - Math.exp(-dt * 8));
    }

    state.fridgeAnim = lerp(state.fridgeAnim, state.fridgeOpen ? 1 : 0, 1 - Math.exp(-dt * 7));
    if (fridgeDoor) {
      const qSwing = Quaternion.RotationAxis(_V_UP, -state.fridgeAnim * 1.32);
      fridgeDoor.rotationQuaternion = fridgeBaseQuat.multiply(qSwing);
    }

    if (state.rangeActive > 0) state.rangeActive = Math.max(0, state.rangeActive - dt);
    kettleFlame.setEnabled(state.rangeActive > 0);

    if (state.espressoActive > 0) state.espressoActive = Math.max(0, state.espressoActive - dt);
    if (coffeeLeverArm) {
      const targetPull = state.espressoActive > 0 ? -0.35 : 0;
      const curA = (coffeeLeverArm._pullAngle ?? 0) + (targetPull - (coffeeLeverArm._pullAngle ?? 0)) * (1 - Math.exp(-dt * 8));
      coffeeLeverArm._pullAngle = curA;
      coffeeLeverArm.rotationQuaternion = coffeeBaseQuat.multiply(Quaternion.RotationYawPitchRoll(0, curA, 0));
    }

    if (state.guitarActive > 0) {
      state.guitarActive = Math.max(0, state.guitarActive - dt);
      gStrings.position.x = Math.sin(elapsed * 48) * 0.004;
    } else {
      gStrings.position.x = 0;
    }

    if (studyGlobe && state.globeSpinSpeed > 0.01) {
      studyGlobe._yawAngle = ((studyGlobe._yawAngle ?? 0) + state.globeSpinSpeed * dt) % (Math.PI * 2);
      studyGlobe.rotationQuaternion = globeBaseQuat.multiply(Quaternion.RotationAxis(_V_UP, studyGlobe._yawAngle));
      state.globeSpinSpeed *= Math.exp(-dt * 0.85);
    }

    state.armoireAnim = lerp(state.armoireAnim, state.armoireOpen ? 1 : 0, 1 - Math.exp(-dt * 6));
    if (armoireDoorL) {
      armoireDoorL.rotationQuaternion = armoireBaseQuatL.multiply(Quaternion.RotationAxis(_V_UP, -1.35 * state.armoireAnim));
    }
    if (armoireDoorR) {
      armoireDoorR.rotationQuaternion = armoireBaseQuatR.multiply(Quaternion.RotationAxis(_V_UP, 1.35 * state.armoireAnim));
    }
  }

  const V = (x, y, z) => new Vector3(x, y, z);
  const interactables = [
    {
      id: "villa-front-doors",
      label: "推开或掩上别墅法式大门",
      position: V(-14.0, 2.6, 4.15),
      radius: 2.2,
      floorY: 2.6,
      activate(ctx = {}) {
        state.doorsOpen = !state.doorsOpen;
        state.doorTarget = state.doorsOpen ? 1 : 0;
        fx.burst(V(-14.0, 3.8, 4.0), { count: 18, colors: [0xfff0d6, 0xf8c8d8], speed: [0.3, 0.9], size: 0.06 });
        ctx.audio?.playLetterUnfold?.();
        return state.doorsOpen ? "法式双开大门敞开了，海风与花香迎面而来 🌿" : "轻轻掩上了法式大门 🏡";
      },
    },
    {
      id: "villa-salon-sofa",
      label: "坐在客厅丝绒沙发上依偎喝茶",
      position: V(-18.8, 2.6, 1.55),
      radius: 2.3,
      floorY: 2.6,
      pose: {
        type: "sit",
        seats: [
          { x: -19.22, y: 2.6 + 0.48, z: 1.88, yaw: 0 },
          { x: -18.38, y: 2.6 + 0.48, z: 1.88, yaw: 0 },
        ],
      },
      activate(ctx = {}) {
        state.teaPourActive = 2.6;
        fx.heart(V(-18.8, 3.9, 2.0), { count: 28, scale: 0.032, colors: [0xffb4c8, 0xfff0dc] });
        ctx.audio?.playVendingClink?.();
        return "靠在柔软的丝绒沙发里，给彼此斟上一杯热红茶 ☕";
      },
    },
    {
      id: "villa-fireplace",
      label: "添一块橡木柴，让壁炉炉火更旺",
      position: V(-18.4, 2.6, -2.2),
      radius: 2.2,
      floorY: 2.6,
      activate(ctx = {}) {
        state.fireBoost = 1.0;
        fx.burst(V(-18.4, 2.95, -2.68), { count: 32, colors: [0xff8c38, 0xffd27a, 0xff541e], speed: [0.4, 1.2], up: 0.9, size: 0.075 });
        ctx.audio?.playRoofChime?.(true);
        return "壁炉里的橡木劈啪作响，暖融融的橘光映在脸上 🔥";
      },
    },
    {
      id: "villa-mantel-candles",
      label: "点亮或吹熄壁炉与茶几蜡烛",
      position: V(-18.4, 3.4, -2.25),
      radius: 2.2,
      floorY: 2.6,
      activate(ctx = {}) {
        state.candlesLit = !state.candlesLit;
        fx.burst(V(-18.4, 4.3, -2.6), { count: 20, colors: [0xffe9a8, 0xffb36b], speed: [0.25, 0.7], size: 0.065 });
        ctx.audio?.playPetalGlissando?.();
        return state.candlesLit ? "跳跃的烛火亮了起来，客厅满是温柔光影 🕯️" : "轻轻吹熄了烛火 ✨";
      },
    },
    {
      id: "villa-gramophone",
      label: "播放 1905 年黑胶留声机旋律",
      position: V(-16.55, 2.6, -2.05),
      radius: 2.1,
      floorY: 2.6,
      activate(ctx = {}) {
        state.gramophoneOn = !state.gramophoneOn;
        state.gramoTimer = state.gramophoneOn ? 18 : 0;
        if (state.gramophoneOn) {
          fx.burst(V(-16.55, 3.8, -2.15), { count: 24, colors: [0xffd89c, 0xf7b9ca], speed: [0.3, 0.85], up: 0.7, size: 0.07 });
          ctx.audio?.playDuetArpeggio?.();
        } else {
          ctx.audio?.playVendingClink?.();
        }
        return state.gramophoneOn ? "金黄色的铜喇叭里流淌出旧日海岸华尔兹 🎵" : "轻轻抬起唱针，留声机缓缓停下 🎶";
      },
    },
    {
      id: "villa-salon-drapes",
      label: "拉开或合上客厅蔷薇纱帘",
      position: V(-19.6, 2.6, 3.45),
      radius: 2.3,
      floorY: 2.6,
      activate(ctx = {}) {
        state.salonDrapesOpen = !state.salonDrapesOpen;
        fx.petalBurst(V(-19.6, 4.1, 3.7), { count: 16, radius: 0.6, floorY: 2.62, life: 3.5 });
        ctx.audio?.playLetterUnfold?.();
        return state.salonDrapesOpen ? "拉开了客厅的蕾丝蔷薇窗帘，海湾阳光倾泻进来 ☀️" : "拉上柔和的蔷薇帘幕，营造静谧午后 🎀";
      },
    },
    {
      id: "villa-dining-table",
      label: "入座法式长桌享用马卡龙下午茶",
      position: V(-12.65, 2.6, 1.15),
      radius: 2.3,
      floorY: 2.6,
      pose: {
        type: "sit",
        seats: [
          { x: -13.17, y: 2.6 + 0.51, z: 0.47, yaw: Math.PI },
          { x: -12.13, y: 2.6 + 0.51, z: 1.83, yaw: 0 },
        ],
      },
      activate(ctx = {}) {
        fx.burst(V(-12.13, 3.65, 1.15), { count: 24, colors: [0xf7c5d0, 0xfff1c9, 0xa8cbb0], speed: [0.3, 0.85], size: 0.065 });
        ctx.audio?.playVendingClink?.();
        return "法式长桌上摆好了马卡龙甜点塔，今天想挑哪一颗 🧁";
      },
    },
    {
      id: "villa-fridge",
      label: "打开薄荷绿复古冰箱找冰甜品",
      position: V(-18.75, 2.6, -8.55),
      radius: 2.1,
      floorY: 2.6,
      activate(ctx = {}) {
        state.fridgeOpen = !state.fridgeOpen;
        fx.burst(V(-18.75, 3.35, -8.85), { count: 18, colors: [0xd9f6ff, 0xffffff, 0xffd2e0], speed: [0.3, 0.75], size: 0.06 });
        ctx.audio?.playVendingClink?.();
        return state.fridgeOpen ? "薄荷绿复古冰箱里冰着玫瑰汽水与覆盆子慕斯 🍨" : "轻声关上了复古冰箱门 ❄️";
      },
    },
    {
      id: "villa-range",
      label: "在 La Cornue 灶台煮一壶姜花红茶",
      position: V(-13.6, 2.6, -8.45),
      radius: 2.1,
      floorY: 2.6,
      activate(ctx = {}) {
        state.rangeActive = 6.5;
        fx.emit(4.5, 8, () => {
          fx.spark(-13.22, 3.8, -9.08, (Math.random() - 0.5) * 0.14, 0.52, (Math.random() - 0.5) * 0.14, {
            color: 0xfff5ea,
            life: 1.1,
            size: 0.08,
          });
        });
        ctx.audio?.playFishRipple?.();
        return "铜壶里的姜花红茶慢慢冒出暖香蒸汽 🫖";
      },
    },
    {
      id: "villa-espresso",
      label: "用拉杆意式咖啡机萃取双份拿铁",
      position: V(-11.78, 2.6, -8.48),
      radius: 2.1,
      floorY: 2.6,
      activate(ctx = {}) {
        state.espressoActive = 4.5;
        fx.emit(3.6, 10, () => {
          fx.spark(-11.78, 3.72, -9.12, (Math.random() - 0.5) * 0.12, 0.35, (Math.random() - 0.5) * 0.12, {
            color: 0xf4dec4,
            life: 0.9,
            size: 0.065,
          });
        });
        ctx.audio?.playVendingClink?.();
        return "拉开黄铜萃取手柄，浓郁焦糖油脂咖啡香漫开 ☕";
      },
    },
    {
      id: "villa-guitar",
      label: "在阳光花房里抱起木吉他弹唱",
      position: V(-5.3, 2.6, -2.85),
      radius: 2.2,
      floorY: 2.6,
      activate(ctx = {}) {
        state.guitarActive = 4.5;
        fx.burst(V(-4.82, 3.35, -2.85), { count: 24, colors: [0xffdf9e, 0xf6c2d2, 0xb8dcff], speed: [0.3, 0.9], up: 0.65, size: 0.07 });
        ctx.audio?.playDuetArpeggio?.();
        return "轻轻拨响琴弦，清亮的木吉他和弦在花房里回荡 🎸";
      },
    },
    {
      id: "villa-study-globe",
      label: "转动书桌上的复古黄铜地球仪",
      position: V(-6.85, 2.6, -7.55),
      radius: 2.1,
      floorY: 2.6,
      activate(ctx = {}) {
        state.globeSpinSpeed = 9.0;
        fx.burst(V(-8.04, 3.66, -8.09), { count: 18, colors: [0x9fd8ff, 0xffe29e], speed: [0.28, 0.8], size: 0.06 });
        ctx.audio?.playPetalGlissando?.();
        return "拨动黄铜地球仪，约定好下次还要一起看遍海湾与远山 🌍";
      },
    },
    {
      id: "villa-love-letter",
      label: "展读书桌上的火漆手写情书",
      position: V(-7.4, 2.6, -7.55),
      radius: 2.2,
      floorY: 2.6,
      activate(ctx = {}) {
        fx.heart(V(-7.4, 3.75, -8.17), { count: 26, scale: 0.03, colors: [0xf7b6c8, 0xfff2dc] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("bloom:open-letter"));
        } else {
          ctx.audio?.playLetterUnfold?.();
        }
        return "拆开玫瑰火漆信笺，重温写给小贤贤的字字句句 💌";
      },
    },
    {
      id: "villa-master-bed",
      label: "倚在二楼四柱帷幔床上小憩看海",
      position: V(-16.8, 6.12, -5.95),
      radius: 2.4,
      floorY: 6.12,
      pose: {
        type: "lie",
        seats: [
          { x: -17.24, y: 6.12 + 0.78, z: -7.02, yaw: 0 },
          { x: -16.36, y: 6.12 + 0.78, z: -7.02, yaw: 0 },
        ],
      },
      activate(ctx = {}) {
        fx.petalBurst(V(-16.8, 7.6, -7.45), { count: 24, radius: 0.9, floorY: 6.15, life: 4.5 });
        ctx.audio?.playPetalGlissando?.();
        return "薄纱帷幔轻轻垂落，海湾风声织进二楼的温柔美梦 🛏️";
      },
    },
    {
      id: "villa-bed-lamps",
      label: "点亮或熄灭床头青瓷玫瑰台灯",
      position: V(-15.14, 6.12, -7.8),
      radius: 2.2,
      floorY: 6.12,
      activate(ctx = {}) {
        state.bedLampsOn = !state.bedLampsOn;
        fx.burst(V(-15.14, 7.22, -8.38), { count: 16, colors: [0xffe7b8, 0xf9cbd8], speed: [0.22, 0.65], size: 0.06 });
        ctx.audio?.playRoofChime?.(state.bedLampsOn);
        return state.bedLampsOn ? "两盏青瓷台灯洒下暖橘柔光 ✨" : "熄灭床头夜灯，只留月光在窗口徘徊 🌙";
      },
    },
    {
      id: "villa-armoire",
      label: "打开二楼法式蔷薇衣橱欣赏礼裙",
      position: V(-12.55, 6.12, -8.2),
      radius: 2.2,
      floorY: 6.12,
      activate(ctx = {}) {
        state.armoireOpen = !state.armoireOpen;
        fx.burst(V(-12.55, 7.45, -8.72), { count: 22, colors: [0xf8d2dc, 0xe8d9ff, 0xfff4d6], speed: [0.3, 0.8], size: 0.065 });
        ctx.audio?.playLetterUnfold?.();
        return state.armoireOpen ? "衣橱门轻轻打开，满满挂着浅粉丝裙与蕾丝帽盒 👗" : "掩好蔷薇雕花衣橱 🎀";
      },
    },
    {
      id: "villa-nook-drapes",
      label: "拉开或合上二楼观海窗帷幔",
      position: V(-22.2, 6.12, -0.25),
      radius: 2.3,
      floorY: 6.12,
      activate(ctx = {}) {
        state.nookDrapesOpen = !state.nookDrapesOpen;
        fx.petalBurst(V(-23.0, 7.6, -0.3), { count: 16, radius: 0.6, floorY: 6.15, life: 3.5 });
        ctx.audio?.playLetterUnfold?.();
        return state.nookDrapesOpen ? "拉开西窗蕾丝窗帘，整片落日海湾映入眼帘 🌊" : "合上观海纱帘，在茶角静静读一页诗 📖";
      },
    },
  ];

  return {
    interactables,
    update: applyVillaInteractiveState,
    setNightMix(m) {
      nightMix = clamp(m, 0, 1);
    },
    setFireBoost(v) {
      state.fireBoost = v;
    },
    getFireBoost() {
      return state.fireBoost;
    },
    reset() {
      state.doorsOpen = true;
      state.doorTarget = 1;
      state.doorAnim = 1;
      state.fireBoost = 0;
      state.candlesLit = true;
      state.gramophoneOn = false;
      state.gramoTimer = 0;
      state.salonDrapesOpen = true;
      state.nookDrapesOpen = true;
      state.fridgeOpen = false;
      state.fridgeAnim = 0;
      state.rangeActive = 0;
      state.espressoActive = 0;
      state.guitarActive = 0;
      state.globeSpinSpeed = 0;
      state.bedLampsOn = true;
      state.armoireOpen = false;
      state.armoireAnim = 0;
      state.teaPourActive = 0;
      applyVillaInteractiveState(0, 0.016);
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Monet Waterfall Pond, Living Aquatic Swimmers & Bougainvillea Swing Garden
// ---------------------------------------------------------------------------

function buildGardensAndPondSection(scene, root, models, shadowGen, fx) {
  const gRoot = new TransformNode("GardensAndPondGroup", scene);
  gRoot.parent = root;
  const { cx: pcx, cz: pcz, rx, rz, waterY, bedY } = POND_CONFIG;
  const { cx: scx, cz: scz, groundY: sgy } = SWING_CONFIG;

  // Pond Walk Zone & Colliders
  for (let a = 0; a < 18; a += 1) {
    const ang = (a / 18) * Math.PI * 2;
    const px = pcx + Math.cos(ang) * (rx * 0.7);
    const pz = pcz + Math.sin(ang) * (rz * 0.7) - 0.34 * Math.sin(px * 0.46);
    registerCircleCollider(px, pz, 1.32);
  }
  registerCircleCollider(pcx, pcz - 0.18, 2.25);
  registerCircleCollider(pcx, pcz - 4.3, 2.65);
  registerCircleCollider(pcx - 2.9, pcz - 3.6, 1.2);
  registerCircleCollider(pcx + 2.9, pcz - 3.6, 1.2);

  registerWalkZone((x, z) => {
    const r = getPondNormalizedRadius(x, z);
    if (r >= 0.98 && r <= 1.45 && z >= pcz - 2.2) return 2.22;
    return null;
  });

  // Swing Clearing Walk Zone
  registerWalkZone((x, z) => {
    if (x >= scx - 4.5 && x <= scx + 4.5 && z >= scz - 4.0 && z <= scz + 8.0) return sgy + 0.02;
    return null;
  });

  // Instantiate Blender Monet Pond GLB at cliff anchor (-1.5, 0, 12.65)
  const pondCliffNode = new TransformNode("MonetPondCliffAnchor", scene);
  pondCliffNode.parent = gRoot;
  pondCliffNode.position.set(pcx, 0, pcz - 4.15);
  const pondInst = instantiateGLB(models.garden_monet_pond, "MonetPondGLB", pondCliffNode);
  applyGLBShadows(pondInst?.rootNodes, shadowGen, { cast: true, receive: true });

  // Waterfall Flowing Curtains
  const wfTex = createWaterfallRibbonTexture(scene);
  const wfMat = new StandardMaterial("WaterfallMat", scene);
  wfMat.diffuseTexture = wfTex;
  wfMat.opacityTexture = wfTex;
  wfMat.useAlphaFromDiffuseTexture = true;
  wfMat.diffuseColor = hexToColor3(0x88dce2);
  wfMat.emissiveColor = hexToColor3(0x1f5258);
  wfMat.emissiveTexture = wfTex;
  wfMat.alpha = 0.72;
  wfMat.backFaceCulling = false;
  wfMat.needDepthPrePass = false;

  const buildWaterfallCurtain = (name, width, topY, botY, topZ, botZ) => {
    const segY = 14;
    const segX = 8;
    const pos = [];
    const uvs = [];
    const idx = [];
    for (let iy = 0; iy <= segY; iy += 1) {
      const v = iy / segY;
      const y = lerp(topY, botY, v);
      const z = lerp(topZ, botZ, v) + Math.sin(v * Math.PI) * 0.14;
      const flare = 1 + v * 0.25;
      for (let ix = 0; ix <= segX; ix += 1) {
        const u = ix / segX;
        const x = (u - 0.5) * width * flare;
        const flute = Math.sin(u * Math.PI * 5) * 0.04;
        pos.push(x, y, z + flute);
        uvs.push(u, v);
      }
    }
    const stride = segX + 1;
    for (let iy = 0; iy < segY; iy += 1) {
      for (let ix = 0; ix < segX; ix += 1) {
        const a = iy * stride + ix;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const nrm = new Float32Array(pos.length);
    VertexData.ComputeNormals(pos, idx, nrm, { useRightHandedSystem: true });
    const vd = new VertexData();
    vd.positions = pos;
    vd.indices = idx;
    vd.normals = nrm;
    vd.uvs = uvs;
    const m = new Mesh(name, scene);
    m.parent = pondCliffNode;
    vd.applyToMesh(m);
    m.material = wfMat;
    m.isPickable = false;
    return m;
  };
  buildWaterfallCurtain("WaterfallUpper", 1.55, 4.12, 2.95, -0.35, 0.24);
  buildWaterfallCurtain("WaterfallLower", 2.05, 3.05, 2.04, 0.22, 0.92);

  // Jade-Emerald Pond Water Disc (Y = 2.05) + Normal Map
  const pondNorm = createPondRippleNormalTexture(scene);
  const pondWaterMat = new PBRMaterial("PondWaterMat", scene);
  pondWaterMat.albedoColor = hexToColor3(0x5bc6b4);
  pondWaterMat.roughness = 0.06;
  pondWaterMat.metallic = 0.02;
  pondWaterMat.bumpTexture = pondNorm;
  pondWaterMat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  pondWaterMat.alpha = 0.34;
  pondWaterMat.backFaceCulling = false;

  const waterPts = [];
  const waterN = 56;
  for (let i = 0; i < waterN; i += 1) {
    const a = (i / waterN) * Math.PI * 2;
    const wx = Math.cos(a) * rx * 1.02;
    const wz = Math.sin(a) * rz * 1.02 - 0.34 * Math.sin(wx * 0.46);
    waterPts.push(new Vector3(wx, 0, wz));
  }
  const pondWaterPos = [0, 0, 0];
  const pondWaterUv = [0.5, 0.5];
  const pondWaterIdx = [];
  for (let i = 0; i < waterN; i += 1) {
    const pt = waterPts[i];
    pondWaterPos.push(pt.x, 0, pt.z);
    pondWaterUv.push(0.5 + pt.x / (rx * 2.2), 0.5 + pt.z / (rz * 2.2));
    const iNext = (i + 1) % waterN;
    pondWaterIdx.push(0, 1 + i, 1 + iNext);
  }
  const pondVD = new VertexData();
  pondVD.positions = pondWaterPos;
  pondVD.indices = pondWaterIdx;
  pondVD.uvs = pondWaterUv;
  pondVD.normals = new Array(pondWaterPos.length / 3).fill([0, 1, 0]).flat();
  const pondWaterMesh = new Mesh("PondWaterSurface", scene);
  pondWaterMesh.parent = gRoot;
  pondWaterMesh.position.set(pcx, waterY, pcz);
  pondVD.applyToMesh(pondWaterMesh);
  pondWaterMesh.material = pondWaterMat;
  pondWaterMesh.isPickable = false;

  const pondGlow = new PointLight("PondGlowLight", new Vector3(pcx, waterY + 1.15, pcz + 0.6), scene);
  pondGlow.diffuse = hexToColor3(0xe8fff9);
  pondGlow.intensity = 2.0;
  pondGlow.range = 14.0;

  // Pond Ferns & Periwinkle Planters & Water Lilies (waterlily.glb)
  placeNormalizedGLBBatch(
    scene,
    models.waterlily,
    gRoot,
    [
      [-3.4, -1.6, 0.95, 0.4],
      [-2.6, -2.2, 0.82, 1.9],
      [2.4, -2.1, 0.92, 0.8],
      [3.3, -1.2, 0.86, 2.5],
      [3.6, 0.2, 0.78, 1.1],
      [-3.8, -0.1, 0.88, 2.9],
      [-3.3, 1.1, 0.74, 0.6],
      [2.9, 1.4, 0.8, 2.1],
      [-0.9, -1.9, 0.72, 1.4],
      [1.1, -1.7, 0.76, 2.7],
      [-1.9, 0.4, 0.68, 0.2],
      [1.7, -0.3, 0.72, 1.7],
    ].map(([ox, oz, s, ry]) => ({ x: pcx + ox, y: waterY + 0.008, z: pcz + oz, s, ry })),
    { name: "PondWaterlilies", alignY: "min", isFoliage: true, castShadow: false }
  );
  placeNormalizedGLBBatch(
    scene,
    models.ph_fern,
    gRoot,
    [
      [-3.8, -3.2, 0.56, 0.2],
      [3.9, -3.1, 0.58, 1.4],
      [5.2, -0.4, 0.56, 3.8],
      [-5.1, -1.6, 0.54, 2.5],
      [3.6, 3.3, 0.52, 0.9],
    ].map(([ox, oz, s, ry]) => ({
      x: pcx + ox,
      y: Math.max(2.12, getWorldTerrainY(pcx + ox, pcz + oz)),
      z: pcz + oz,
      s,
      ry,
    })),
    { name: "PondFerns", isFoliage: true, castShadow: false }
  );
  placeNormalizedGLBBatch(
    scene,
    models.ph_periwinkle,
    gRoot,
    [
      [-4.8, 1.9, 0.68, 0.6],
      [4.6, 2.2, 0.72, 1.8],
      [0.6, 4.4, 0.64, 3.1],
      [-2.1, 4.3, 0.66, 4.5],
    ].map(([ox, oz, s, ry]) => ({
      x: pcx + ox,
      y: Math.max(2.12, getWorldTerrainY(pcx + ox, pcz + oz)),
      z: pcz + oz,
      s,
      ry,
    })),
    { name: "PondPeriwinkle", isFoliage: true, castShadow: false }
  );

  // Skeletal Ryukin Goldfish, Koi & Freshwater Shrimp
  const swimmers = [];
  const shrimpActors = [];

  if (models.ryukin_goldfish) {
    const dims = measureNormalizedContainer(scene, models.ryukin_goldfish);
    const tints = [0xffffff, 0xffd8c2, 0xffb899, 0xfff0d8, 0xffcbb8];
    for (let i = 0; i < 8; i += 1) {
      const wrapper = new TransformNode(`RyukinWrap_${i}`, scene);
      wrapper.parent = gRoot;
      const inst = instantiateGLB(models.ryukin_goldfish, `Ryukin_${i}`, wrapper);
      const targetLen = 0.3 + (i % 3) * 0.045;
      const s = targetLen / Math.max(0.01, dims.size.z);
      const root0 = inst.rootNodes[0];
      if (root0) {
        root0.scaling.setAll(s);
        root0.position.set(-dims.center.x * s, -dims.center.y * s, -dims.center.z * s);
      }
      for (const m of collectMeshes(inst.rootNodes)) {
        m.isPickable = false;
        if (m.material) {
          m.material = m.material.clone(`RyukinMat_${i}`);
          tuneGLBMaterial(m.material, { isAquatic: true, tintHex: tints[i % tints.length] });
          if (m.material instanceof PBRMaterial) {
            m.material.emissiveColor = hexToColor3(0x3a1206);
            m.material.emissiveIntensity = 0.14;
          }
        }
      }
      const ag = inst.animationGroups?.[0] || null;
      if (ag) ag.start(true, 1.15 + (i % 4) * 0.15, ag.from, ag.to, false);
      swimmers.push({
        wrapper,
        ag,
        orbitRx: 1.15 + (i % 5) * 0.56,
        orbitRz: 0.85 + ((i + 2) % 4) * 0.48,
        centerX: pcx + ((i % 3) - 1) * 0.85,
        centerZ: pcz + 0.35 + (i % 2) * 0.65,
        swimY: 1.62 + (i % 4) * 0.075,
        speed: (0.28 + (i % 4) * 0.06) * (i % 2 === 0 ? 1 : -1),
        phase: i * 1.24,
        fig8: i % 3 === 0,
      });
    }
  }

  if (models.pond_koi) {
    const dims = measureNormalizedContainer(scene, models.pond_koi);
    const koiColors = [0xff6b2b, 0xff9f40, 0xfff2e2, 0xf24938, 0xffbe55, 0xffdfd0];
    const baseS = 0.34 / Math.max(0.005, dims.size.x);
    for (let i = 0; i < 12; i += 1) {
      const wrapper = new TransformNode(`KoiWrap_${i}`, scene);
      wrapper.parent = gRoot;
      const bodyPivot = new TransformNode(`KoiPivot_${i}`, scene);
      bodyPivot.parent = wrapper;
      const inst = instantiateGLB(models.pond_koi, `Koi_${i}`, bodyPivot);
      const sc = baseS * (0.88 + (i % 4) * 0.12);
      const r0 = inst.rootNodes[0];
      if (r0) {
        r0.scaling.setAll(sc);
        r0.rotation.y = Math.PI * 0.5;
        r0.position.set(0, -dims.center.y * sc, 0);
      }
      const colHex = koiColors[i % koiColors.length];
      for (const m of collectMeshes(inst.rootNodes)) {
        m.isPickable = false;
        if (m.material) {
          m.material = m.material.clone(`KoiMat_${i}`);
          tuneGLBMaterial(m.material, { isAquatic: true, tintHex: colHex });
          if (m.material instanceof PBRMaterial) {
            m.material.emissiveColor = hexToColor3(colHex).scale(0.18);
          }
        }
      }
      swimmers.push({
        wrapper,
        bodyPivot,
        orbitRx: 1.35 + (i % 5) * 0.58,
        orbitRz: 0.95 + ((i + 1) % 4) * 0.46,
        centerX: pcx + ((i % 4) - 1.5) * 0.72,
        centerZ: pcz + 0.15 + ((i % 3) - 1) * 0.55,
        swimY: 1.52 + (i % 5) * 0.07,
        speed: (0.34 + (i % 3) * 0.07) * (i % 2 === 0 ? -1 : 1),
        phase: i * 0.92 + 0.4,
        fig8: i % 2 === 1,
      });
    }
  }

  const shrimpShelves = [
    { x: pcx - 1.95, y: 1.88, z: pcz + 1.1 },
    { x: pcx + 2.05, y: 1.88, z: pcz + 1.0 },
    { x: pcx - 0.2, y: 2.02, z: pcz + 3.4 },
    { x: pcx - 2.45, y: 2.02, z: pcz + 2.9 },
    { x: pcx + 2.45, y: 2.02, z: pcz + 2.8 },
  ];
  if (models.freshwater_shrimp) {
    const dims = measureNormalizedContainer(scene, models.freshwater_shrimp, { rotateY: Math.PI });
    for (let i = 0; i < 9; i += 1) {
      const wrapper = new TransformNode(`ShrimpWrap_${i}`, scene);
      wrapper.parent = gRoot;
      const inst = instantiateGLB(models.freshwater_shrimp, `Shrimp_${i}`, wrapper);
      const targetLen = 0.27 + (i % 3) * 0.04;
      const s = targetLen / Math.max(0.01, dims.size.z);
      const r0 = inst.rootNodes[0];
      if (r0) {
        r0.scaling.setAll(s);
        r0.rotation.y = Math.PI;
        r0.position.set(-dims.center.x * s, -dims.min.y * s, -dims.center.z * s);
      }
      const hexC = i % 3 === 0 ? 0xf6d5b0 : i % 3 === 1 ? 0xddebe8 : 0xf2c29b;
      for (const m of collectMeshes(inst.rootNodes)) {
        m.isPickable = false;
        if (m.material) {
          m.material = m.material.clone(`ShrimpMat_${i}`);
          tuneGLBMaterial(m.material, { isAquatic: true, tintHex: hexC });
        }
      }
      const ag = inst.animationGroups?.[0] || null;
      if (ag) ag.start(true, 1.1 + (i % 5) * 0.14, ag.from, ag.to, false);
      if (i < 6) {
        const sh = shrimpShelves[i % shrimpShelves.length];
        const a = (i * 2.1) % (Math.PI * 2);
        const bx = sh.x + Math.cos(a) * 0.12;
        const bz = sh.z + Math.sin(a) * 0.1;
        wrapper.position.set(bx, sh.y + 0.005, bz);
        shrimpActors.push({ wrapper, mode: "shelf", baseX: bx, baseY: sh.y + 0.005, baseZ: bz, yaw: a + 1.2, phase: i * 1.4 });
      } else {
        const k = i - 6;
        shrimpActors.push({
          wrapper,
          mode: "swim",
          cx: pcx + (k - 1) * 1.25,
          cz: pcz + 1.4,
          rx: 0.9,
          rz: 0.65,
          baseY: 1.56 + k * 0.07,
          phase: i * 1.6,
          speed: 0.36 + k * 0.06,
        });
      }
    }
  }

  // Sculpted Blender Two-Person Swing & Bougainvillea Rose Arches (@ (-28.5, 2.20, 14.0))
  const swingNode = new TransformNode("SwingGardenAnchor", scene);
  swingNode.parent = gRoot;
  swingNode.position.set(scx, sgy, scz);
  const swingInst = instantiateGLB(models.garden_swing_arches, "SwingGLB", swingNode);
  applyGLBShadows(swingInst?.rootNodes, shadowGen, { cast: true, receive: true });
  const swingPivot = findDescendantByName(swingInst?.rootNodes, "Swing_Pivot");
  const swingBaseQuat = swingPivot?.rotationQuaternion ? swingPivot.rotationQuaternion.clone() : Quaternion.Identity();

  // Garden Animated State + Wishing Coin Pool + Feed Crumbs + Waterfall Rainbow + Fireflies
  const animState = {
    pondExcite: 0,
    waterfallBoost: 0,
    shrimpBoost: 0,
    fireflyBoost: 0,
    swingBoost: 0,
    swingPhase: 0,
    swimmers,
    shrimpActors,
  };

  const coinMat = makePbrMat(scene, "PondWishCoinMat", 0xffd564, { roughness: 0.22, metallic: 0.92, emissive: 0x3b2600 });
  const flyCoin = MeshBuilder.CreateCylinder("PondFlyCoin", { diameter: 0.11, height: 0.018, tessellation: 14 }, scene);
  flyCoin.parent = gRoot;
  flyCoin.material = coinMat;
  flyCoin.setEnabled(false);

  const settledCoins = [];
  const COINS = 24;
  for (let i = 0; i < COINS; i += 1) {
    const c = MeshBuilder.CreateCylinder(`PondBedCoin_${i}`, { diameter: 0.08, height: 0.015, tessellation: 10 }, scene);
    c.parent = gRoot;
    c.material = coinMat;
    c.setEnabled(false);
    settledCoins.push(c);
  }
  let coinCursor = 0;

  const foodCrumbMat = makePbrMat(scene, "PondCrumbMat", 0xf4cf84, { roughness: 0.72 });
  const activeCrumbs = [];
  const foodSwarmPool = [];
  for (let i = 0; i < 16; i += 1) {
    const m = MeshBuilder.CreateSphere(`PondCrumb_${i}`, { diameter: 0.06, segments: 6 }, scene);
    m.parent = gRoot;
    m.material = foodCrumbMat;
    m.setEnabled(false);
    foodSwarmPool.push(m);
  }

  // Waterfall Rainbow Arc
  const rbTex = new DynamicTexture("PondRainbowTex", { width: 128, height: 16 }, scene, true);
  const rbCtx = rbTex.getContext();
  const rbGrad = rbCtx.createLinearGradient(0, 0, 128, 0);
  rbGrad.addColorStop(0.0, "rgba(255,100,110,0.0)");
  rbGrad.addColorStop(0.15, "rgba(255,130,110,0.65)");
  rbGrad.addColorStop(0.32, "rgba(255,220,100,0.65)");
  rbGrad.addColorStop(0.5, "rgba(130,245,160,0.65)");
  rbGrad.addColorStop(0.7, "rgba(110,205,255,0.65)");
  rbGrad.addColorStop(0.88, "rgba(200,145,255,0.55)");
  rbGrad.addColorStop(1.0, "rgba(200,145,255,0.0)");
  rbCtx.fillStyle = rbGrad;
  rbCtx.fillRect(0, 0, 128, 16);
  rbTex.update();
  rbTex.hasAlpha = true;
  const rainbowMat = new StandardMaterial("PondRainbowMat", scene);
  rainbowMat.diffuseTexture = rbTex;
  rainbowMat.emissiveTexture = rbTex;
  rainbowMat.emissiveColor = hexToColor3(0xffffff);
  rainbowMat.disableLighting = true;
  rainbowMat.backFaceCulling = false;
  rainbowMat.alpha = 0;
  rainbowMat.alphaMode = Engine.ALPHA_ADD;
  const rainbow = MeshBuilder.CreateTorus("WaterfallRainbow", { diameter: 5.2, thickness: 0.36, tessellation: 32 }, scene);
  rainbow.parent = gRoot;
  rainbow.position.set(pcx, waterY + 0.15, pcz - 2.6);
  rainbow.scaling.z = 0.2;
  rainbow.material = rainbowMat;
  rainbow.setEnabled(false);
  rainbow.isPickable = false;

  // Watered Flower Sprouts
  const SPROUTS = 24;
  const sproutCols = [0xffb4c8, 0xffe49e, 0xd8c4ff, 0xffd2b8];
  const sproutPool = [];
  const sproutStemMat = makePbrMat(scene, "SproutStemMat", 0x4b8042, { roughness: 0.72 });
  for (let i = 0; i < SPROUTS; i += 1) {
    const spRoot = new TransformNode(`Sprout_${i}`, scene);
    spRoot.parent = gRoot;
    const stem = MeshBuilder.CreateCylinder(`SpStem_${i}`, { diameter: 0.024, height: 0.24, tessellation: 6 }, scene);
    stem.parent = spRoot;
    stem.position.y = 0.12;
    stem.material = sproutStemMat;
    const bloom = MeshBuilder.CreateSphere(`SpBloom_${i}`, { diameter: 0.14, segments: 8 }, scene);
    bloom.parent = spRoot;
    bloom.position.y = 0.26;
    bloom.material = makePbrMat(scene, `SpBloomMat_${i}`, sproutCols[i % sproutCols.length], { roughness: 0.56 });
    spRoot.setEnabled(false);
    sproutPool.push({ node: spRoot, active: false, age: 0, delay: 0, targetS: 1 });
  }
  let sproutCursor = 0;

  // Garden Fireflies (glow subtly at dusk/night or when called)
  const FIREFLY_COUNT = 44;
  const ffRng = mulberry32(74129);
  const fireflyMat = new StandardMaterial("GardenFireflyMat", scene);
  fireflyMat.emissiveColor = hexToColor3(0xeaff9c);
  fireflyMat.diffuseColor = hexToColor3(0xffffff);
  fireflyMat.disableLighting = true;
  fireflyMat.alphaMode = Engine.ALPHA_ADD;
  fireflyMat.alpha = 0;
  const fireflies = [];
  for (let i = 0; i < FIREFLY_COUNT; i += 1) {
    let bx;
    let bz;
    if (i < 18) {
      const a = (i / 18) * Math.PI * 2;
      bx = pcx + Math.cos(a) * rx * (0.85 + ffRng() * 0.45);
      bz = pcz + Math.sin(a) * rz * (0.85 + ffRng() * 0.45);
    } else if (i < 32) {
      bx = -14.0 + (ffRng() - 0.5) * 6.5;
      bz = 11.5 + ffRng() * 11.0;
    } else {
      bx = scx + (ffRng() - 0.5) * 6.5;
      bz = scz + (ffRng() - 0.5) * 6.0;
    }
    const by = Math.max(2.15, getWorldTerrainY(bx, bz)) + 0.45 + ffRng() * 1.45;
    const orb = MeshBuilder.CreateSphere(`Firefly_${i}`, { diameter: 0.08, segments: 6 }, scene);
    orb.parent = gRoot;
    orb.position.set(bx, by, bz);
    orb.material = fireflyMat;
    orb.isPickable = false;
    fireflies.push({ mesh: orb, bx, by, bz, phase: ffRng() * 6.28, speed: 0.45 + ffRng() * 0.45 });
  }

  const V = (x, y, z) => new Vector3(x, y, z);
  let nightMix = 0;
  const wishStand = V(pcx + 5.4 * 1.12, 2.22, pcz + 0.6);
  const sitX = pcx + 1.6;
  const sitZ = pcz + 4.42;
  const canX = -24.2;
  const canZ = 16.8;

  const interactables = [
    {
      id: "garden-swing-ride",
      label: "坐上花架秋千晃一晃",
      position: V(scx + 1.2, sgy + 0.02, scz + 1.1),
      radius: 2.3,
      floorY: sgy + 0.02,
      pose: {
        type: "sit",
        attachTo: swingPivot,
        seats: [
          { x: -0.38, y: -1.68, z: 0.03, yaw: Math.PI },
          { x: 0.38, y: -1.68, z: 0.03, yaw: Math.PI },
        ],
      },
      activate(ctx = {}) {
        animState.swingBoost = Math.min(0.45, animState.swingBoost + 0.36);
        fx.petalBurst(V(scx, sgy + 2.6, scz), { count: 48, radius: 1.5, up: 0.4, speed: [0.6, 1.5], floorY: sgy + 0.03, life: 5 });
        fx.heart(V(scx, sgy + 2.2, scz + 0.4), { count: 36, scale: 0.04 });
        ctx.audio?.playPetalGlissando?.();
        return "三角梅花串随之摇曳，花影落在两人的肩头 🌸";
      },
    },
    {
      id: "garden-koi-feed",
      label: "往池里撒一把鱼食",
      position: V(pcx - 1.2, 2.22, pcz + 4.4),
      radius: 2.1,
      floorY: 2.22,
      activate(ctx = {}) {
        const fxp = pcx - 0.6;
        const fzp = pcz + 1.6;
        animState.pondExcite = 1.0;
        for (let i = 0; i < 12; i += 1) {
          const m = foodSwarmPool[i % foodSwarmPool.length];
          m.setEnabled(true);
          activeCrumbs.push({
            mesh: m,
            age: 0,
            dur: 0.65 + (i % 4) * 0.14,
            sx: pcx - 1.0,
            sy: 3.45,
            sz: pcz + 4.2,
            ex: fxp + (Math.random() - 0.5) * 1.4,
            ez: fzp + (Math.random() - 0.5) * 1.1,
            phase: Math.random() * 6.28,
            rippled: false,
          });
        }
        for (let k = 0; k < 5; k += 1) {
          fx.ripple(V(fxp, waterY, fzp), { radius: 0.6 + k * 0.25, life: 1.8, delay: 0.5 + k * 0.45, opacity: 0.55 });
        }
        ctx.audio?.playFishRipple?.();
        return "锦鲤和金鱼争先恐后地游过来抢食 🐟";
      },
    },
    {
      id: "garden-pond-wish",
      label: "投一枚硬币许个愿",
      position: wishStand.clone(),
      radius: 2.0,
      floorY: 2.22,
      activate(ctx = {}) {
        const sx = wishStand.x - 0.3;
        const sy = wishStand.y + 1.3;
        const sz = wishStand.z;
        const ex = pcx + 2.2 + (Math.random() - 0.5) * 0.6;
        const ez = pcz + 0.3 + (Math.random() - 0.5) * 0.8;
        flyCoin.setEnabled(true);
        fx.addTask(
          1.1,
          (u) => {
            flyCoin.position.set(lerp(sx, ex, u), lerp(sy, waterY, u) + Math.sin(u * Math.PI) * 1.1, lerp(sz, ez, u));
            flyCoin.rotation.set(u * 18, 0, u * 7);
            if (Math.random() < 0.5) fx.spark(flyCoin.position.x, flyCoin.position.y, flyCoin.position.z, 0, 0.1, 0, { color: 0xffe08a, life: 0.6, size: 0.05 });
          },
          () => {
            flyCoin.setEnabled(false);
            const landing = V(ex, waterY, ez);
            fx.ripple(landing, { radius: 0.9, life: 1.6, opacity: 0.8 });
            fx.ripple(landing, { radius: 1.5, life: 2.2, delay: 0.25, opacity: 0.5 });
            fx.burst(landing, { count: 28, colors: [0xdff6ff, 0xffffff], speed: [0.8, 1.8], up: 1.4, gravity: 3.5, size: 0.06, life: 0.9 });
            const coin = settledCoins[coinCursor % COINS];
            coinCursor += 1;
            const bedTarget = Math.max(bedY + 0.06, getWorldTerrainY(ex, ez) + 0.015);
            coin.setEnabled(true);
            fx.addTask(2.0, (u) => {
              coin.position.set(ex + Math.sin(u * 9) * 0.04, lerp(waterY - 0.02, bedTarget, u), ez);
              coin.rotation.x = Math.sin(u * 14) * (1 - u) * 0.9;
            });
          }
        );
        ctx.audio?.playVendingClink?.();
        return "叮——硬币沉入池底，愿望已被锦鲤收下 ✨";
      },
    },
    {
      id: "garden-waterfall-splash",
      label: "在瀑布边撩水嬉戏",
      position: V(pcx + 5.4, 2.22, pcz - 1.4),
      radius: 2.6,
      floorY: 2.22,
      activate(ctx = {}) {
        const plunge = V(pcx, waterY + 0.05, pcz - 3.0);
        animState.waterfallBoost = 1.0;
        animState.pondExcite = Math.max(animState.pondExcite, 0.8);
        fx.emit(2.2, 80, () => {
          const a = Math.random() * Math.PI * 2;
          const sp = 1.2 + Math.random() * 2.2;
          fx.spark(plunge.x + Math.cos(a) * 0.5, plunge.y, plunge.z + Math.sin(a) * 0.4, Math.cos(a) * sp * 0.6, 1.6 + Math.random() * 2.2, Math.sin(a) * sp * 0.6 + 0.8, {
            color: Math.random() < 0.6 ? 0xe8fbff : 0xbfe9ff,
            life: 1.2,
            size: 0.07,
            gravity: 5.0,
            drag: 0.4,
          });
        });
        for (let k = 0; k < 4; k += 1) fx.ripple(plunge, { radius: 1.2 + k * 0.5, life: 2.0, delay: k * 0.35, opacity: 0.7 });
        rainbow.setEnabled(true);
        fx.addTask(
          7.0,
          (u) => {
            rainbowMat.alpha = 0.55 * smoothstep(0, 0.15, u) * (1 - smoothstep(0.7, 1.0, u));
            rainbow.scaling.setAll(0.85 + 0.15 * smoothstep(0, 0.3, u));
          },
          () => rainbow.setEnabled(false)
        );
        ctx.audio?.playFishRipple?.();
        return "水花四溅，瀑布前架起一道小彩虹 🌈";
      },
    },
    {
      id: "garden-pond-sit",
      label: "坐在池畔石上看鱼",
      position: V(sitX, 2.22, sitZ + 0.35),
      radius: 1.8,
      floorY: 2.22,
      pose: {
        type: "sit",
        seats: [
          { x: sitX - 0.32, y: 2.29, z: sitZ, yaw: 0 },
          { x: sitX + 0.32, y: 2.29, z: sitZ, yaw: 0 },
        ],
      },
      activate(ctx = {}) {
        animState.pondExcite = Math.max(animState.pondExcite, 0.7);
        for (let k = 0; k < 3; k += 1) fx.ripple(V(sitX, waterY, sitZ - 1.6), { radius: 0.8 + k * 0.4, life: 2.4, delay: k * 0.6, opacity: 0.45 });
        fx.heart(V(sitX, 3.2, sitZ - 0.4), { count: 38, scale: 0.035 });
        ctx.audio?.playFishRipple?.();
        return "肩并肩坐在池边，看睡莲下的金鱼游来游去 🪷";
      },
    },
    {
      id: "garden-shrimp-tease",
      label: "逗一逗河虾",
      position: V(pcx - 5.4 * 1.15, 2.22, pcz + 0.4),
      radius: 2.0,
      floorY: 2.22,
      activate(ctx = {}) {
        animState.shrimpBoost = 1.0;
        for (const sh of shrimpActors) {
          if (Math.random() < 0.7) {
            fx.ripple(V(sh.wrapper.position.x, waterY, sh.wrapper.position.z), { radius: 0.35, life: 1.2, opacity: 0.5, delay: Math.random() * 0.8 });
          }
        }
        fx.burst(V(pcx - 3.6, waterY + 0.05, pcz + 0.4), { count: 24, colors: [0xdff6ff, 0xffffff], speed: [0.5, 1.2], up: 1.2, gravity: 3.0, size: 0.05, life: 0.8 });
        ctx.audio?.playFishRipple?.();
        return "河虾们一蹦一跳地弹开了 🦐";
      },
    },
    {
      id: "garden-water-flowers",
      label: "提起水壶浇浇花",
      position: V(canX - 0.3, sgy + 0.02, canZ + 0.8),
      radius: 1.8,
      floorY: sgy + 0.02,
      activate(ctx = {}) {
        const spout = V(canX - 0.25, sgy + 0.62, canZ - 0.05);
        const tx = canX - 1.25;
        const tz = canZ - 0.35;
        fx.emit(2.6, 65, () => {
          fx.spark(spout.x, spout.y, spout.z, -1.05 + (Math.random() - 0.5) * 0.25, 0.9 + Math.random() * 0.3, -0.25 + (Math.random() - 0.5) * 0.25, {
            color: Math.random() < 0.5 ? 0xbfe6ff : 0xffffff,
            life: 0.75,
            size: 0.045,
            gravity: 6.0,
            drag: 0.1,
          });
        });
        fx.addTask(1.0, () => {}, () => {
          for (let k = 0; k < 6; k += 1) {
            const slot = sproutPool[sproutCursor++ % SPROUTS];
            const a = Math.random() * Math.PI * 2;
            const r = 0.15 + Math.random() * 0.75;
            const x = tx + Math.cos(a) * r;
            const z = tz + Math.sin(a) * r;
            slot.node.position.set(x, Math.max(sgy, getWorldTerrainY(x, z)), z);
            slot.node.rotation.y = Math.random() * 6.28;
            slot.node.setEnabled(true);
            slot.active = true;
            slot.age = -k * 0.22;
            slot.targetS = 0.8 + Math.random() * 0.6;
          }
          fx.burst(V(tx, sgy + 0.4, tz), { count: 36, colors: [0xc8ffb0, 0xfff6c8, 0xffffff], speed: [0.3, 1.0], gravity: 0.2, size: 0.06, life: 1.8 });
        });
        ctx.audio?.playDuetArpeggio?.();
        return "浇过水的花圃里，冒出了一簇簇新开的小花 🌼";
      },
    },
    {
      id: "garden-bougainvillea-shower",
      label: "摇落三角梅花雨",
      position: V(scx + 1.6, sgy + 0.02, scz + 3.0),
      radius: 1.6,
      floorY: sgy + 0.02,
      activate(ctx = {}) {
        fx.emit(3.0, 48, () => {
          fx.petal(scx + (Math.random() - 0.5) * 2.8, sgy + 2.8 + Math.random() * 0.4, scz + (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 0.8, -0.35 - Math.random() * 0.45, (Math.random() - 0.5) * 0.8, {
            color: Math.random() < 0.65 ? 0xf24b92 : 0xff80b4,
            life: 4.5,
            size: 1.25,
            floorY: sgy + 0.03,
          });
        });
        ctx.audio?.playPetalGlissando?.();
        return "花架抖落一场漫天三角梅花瓣雨 🌺";
      },
    },
    {
      id: "garden-firefly-call",
      label: "呼唤夏夜萤火虫漫天飞舞",
      position: V(pcx + 3.2, 2.22, pcz + 3.4),
      radius: 2.2,
      floorY: 2.22,
      activate(ctx = {}) {
        animState.fireflyBoost = 1.0;
        fx.burst(V(pcx, 3.0, pcz + 1.0), { count: 40, colors: [0xeaff9c, 0xfff5c0], speed: [0.3, 1.0], up: 0.6, size: 0.075, life: 2.5 });
        ctx.audio?.playPetalGlissando?.();
        return "池畔与花架间的夏夜萤火虫纷纷点亮微光 ✨";
      },
    },
  ];

  function update(elapsed, dt) {
    animState.pondExcite = Math.max(0, animState.pondExcite - dt * 0.25);
    animState.waterfallBoost = Math.max(0, animState.waterfallBoost - dt * 0.3);
    animState.shrimpBoost = Math.max(0, animState.shrimpBoost - dt * 0.35);
    animState.fireflyBoost = Math.max(0, animState.fireflyBoost - dt * 0.14);

    // Scroll Pond Ripple Normal + Waterfall Texture
    pondNorm.uOffset = (pondNorm.uOffset + dt * 0.03) % 1;
    pondNorm.vOffset = (pondNorm.vOffset + dt * 0.04) % 1;
    wfTex.vOffset = (wfTex.vOffset - dt * (0.95 + animState.waterfallBoost * 1.1)) % 1;

    // Gentle Swing Oscillation
    animState.swingBoost = Math.max(0, animState.swingBoost - dt * 0.14);
    animState.swingPhase += dt * 1.85;
    if (swingPivot) {
      const ang = (0.045 + animState.swingBoost) * Math.sin(animState.swingPhase);
      swingPivot.rotationQuaternion = swingBaseQuat.multiply(Quaternion.RotationYawPitchRoll(0, ang, 0));
    }

    // Koi, Goldfish & Shrimp Swimming Paths
    const fishMult = 1 + animState.pondExcite * 0.65;
    for (let i = 0; i < swimmers.length; i += 1) {
      const sw = swimmers[i];
      const t = elapsed * sw.speed * fishMult + sw.phase;
      const sx = sw.fig8 ? Math.sin(t * 2) * 0.55 : Math.sin(t);
      const sz = sw.fig8 ? Math.sin(t) : Math.cos(t);
      const nx = sw.centerX + Math.cos(t) * sw.orbitRx;
      const nz = sw.centerZ + (sw.fig8 ? Math.sin(t * 2) * sw.orbitRz * 0.65 : Math.sin(t) * sw.orbitRz);
      const ny = sw.swimY + Math.sin(elapsed * 1.4 + sw.phase) * 0.04;
      const tx = -Math.sin(t) * sw.orbitRx * sw.speed;
      const tz = (sw.fig8 ? Math.cos(t * 2) * 2 * sw.orbitRz * 0.65 : Math.cos(t) * sw.orbitRz) * sw.speed;
      sw.wrapper.position.set(nx, ny, nz);
      sw.wrapper.rotation.y = Math.atan2(tx, tz) + (sx * 0.02 + sz * 0.01);
    }
    const shMult = 1 + animState.shrimpBoost * 2.2;
    for (let i = 0; i < shrimpActors.length; i += 1) {
      const sh = shrimpActors[i];
      if (sh.mode === "shelf") {
        const hop = animState.shrimpBoost > 0.05 ? Math.abs(Math.sin(elapsed * 9 + sh.phase)) * 0.12 * animState.shrimpBoost : 0;
        sh.wrapper.position.set(sh.baseX + Math.sin(elapsed * 1.2 + sh.phase) * 0.03, sh.baseY + hop, sh.baseZ);
        sh.wrapper.rotation.y = sh.yaw + Math.sin(elapsed * 1.8 + sh.phase) * 0.14;
      } else {
        const t = elapsed * sh.speed * shMult + sh.phase;
        sh.wrapper.position.set(sh.cx + Math.cos(t) * sh.rx, sh.baseY + Math.sin(elapsed * 2.5 + sh.phase) * 0.04, sh.cz + Math.sin(t) * sh.rz);
        sh.wrapper.rotation.y = Math.atan2(-Math.sin(t) * sh.rx, Math.cos(t) * sh.rz);
      }
    }

    // Active Fish Food Crumbs
    for (let i = activeCrumbs.length - 1; i >= 0; i -= 1) {
      const c = activeCrumbs[i];
      c.age += dt;
      const u = clamp(c.age / c.dur, 0, 1);
      c.mesh.position.set(lerp(c.sx, c.ex, u), lerp(c.sy, waterY, u) + Math.sin(u * Math.PI) * 0.85, lerp(c.sz, c.ez, u));
      if (u >= 1) {
        if (!c.rippled) {
          c.rippled = true;
          fx.ripple(V(c.ex, waterY, c.ez), { radius: 0.45, life: 1.4, opacity: 0.5 });
        }
        if (c.age > c.dur + 2.2) {
          c.mesh.setEnabled(false);
          activeCrumbs.splice(i, 1);
        }
      }
    }

    // Watered Flower Sprouts Growth
    for (let i = 0; i < sproutPool.length; i += 1) {
      const sp = sproutPool[i];
      if (!sp.active) continue;
      sp.age += dt;
      if (sp.age > 0) {
        const s = easeOutBack(clamp(sp.age / 0.9, 0, 1)) * sp.targetS;
        sp.node.scaling.setAll(Math.max(0.01, s));
      } else {
        sp.node.scaling.setAll(0.01);
      }
    }

    // Fireflies Motion & Night Brightness
    const ffVis = Math.max(nightMix, animState.fireflyBoost);
    fireflyMat.alpha = clamp(ffVis * 0.9, 0, 1);
    for (let i = 0; i < fireflies.length; i += 1) {
      const f = fireflies[i];
      f.mesh.setEnabled(ffVis > 0.03);
      if (ffVis > 0.03) {
        const t = elapsed * f.speed + f.phase;
        f.mesh.position.set(f.bx + Math.sin(t * 1.1) * 0.35, f.by + Math.sin(t * 1.7) * 0.24, f.bz + Math.cos(t * 0.9) * 0.35);
      }
    }
  }

  return {
    interactables,
    update,
    setNightMix(m) {
      nightMix = clamp(m, 0, 1);
    },
    reset() {
      animState.pondExcite = 0;
      animState.waterfallBoost = 0;
      animState.shrimpBoost = 0;
      animState.fireflyBoost = 0;
      animState.swingBoost = 0;
      rainbow.setEnabled(false);
      flyCoin.setEnabled(false);
      settledCoins.forEach((c) => c.setEnabled(false));
      foodSwarmPool.forEach((c) => c.setEnabled(false));
      activeCrumbs.length = 0;
      sproutPool.forEach((s) => {
        s.active = false;
        s.node.setEnabled(false);
      });
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Harbor Quay, Piers, Boathouse Cafe, Boardwalk, Landmarks & Fleet
// ---------------------------------------------------------------------------

function buildEstateAndHarborSection(scene, root, models, shadowGen, fx, courtRefs) {
  const eRoot = new TransformNode("HarborAndEstateGroup", scene);
  eRoot.parent = root;

  const quayDeckMat = makePbrMat(scene, "HarborQuayGranite", 0xc8c1b5, {
    roughness: 0.62,
    bumpTexture: getGraniteSlabNormalTexture(scene, 18, 22),
    bumpLevel: 0.72,
    specularIntensity: 0.5,
  });
  quayDeckMat.albedoTexture = getGraniteSlabTexture(scene, 18, 22);
  const quayWallMat = makePbrMat(scene, "HarborWallStone", 0xb6afa2, {
    roughness: 0.76,
    bumpTexture: getGraniteSlabNormalTexture(scene, 16, 4),
    bumpLevel: 0.68,
  });
  quayWallMat.albedoTexture = getGraniteSlabTexture(scene, 16, 4);
  const copingMat = makePbrMat(scene, "HarborCoping", 0xd4cdc0, {
    roughness: 0.66,
    bumpTexture: getGraniteSlabNormalTexture(scene, 6, 6),
    bumpLevel: 0.32,
  });
  const teakMat = makePbrMat(scene, "HarborTeakMat", 0xb88656, {
    roughness: 0.42,
    bumpTexture: getTeakDeckNormalTexture(scene, 4, 8),
    bumpLevel: 0.68,
    specularIntensity: 0.48,
  });
  teakMat.albedoTexture = getTeakDeckTexture(scene, 4, 8);
  const cedarPlankMat = makePbrMat(scene, "BoardwalkCedar", 0xa8764a, {
    roughness: 0.48,
    bumpTexture: getTeakDeckNormalTexture(scene, 6, 4),
    bumpLevel: 0.64,
    specularIntensity: 0.45,
  });
  cedarPlankMat.albedoTexture = getTeakDeckTexture(scene, 6, 4);
  const pileMat = makePbrMat(scene, "HarborPileWood", 0x4b382a, { roughness: 0.86 });
  const castIronMat = makePbrMat(scene, "HarborCastIron", 0x23272a, { roughness: 0.42, metallic: 0.82 });
  const brassMat = makePbrMat(scene, "HarborBrass", 0xcba358, { roughness: 0.24, metallic: 0.88 });
  const creamCanvas = makePbrMat(scene, "HarborParasolCream", 0xe5d6be, { roughness: 0.86, doubleSided: true });
  const navyCanvas = makePbrMat(scene, "HarborSailCanvas", 0xf0eadb, { roughness: 0.86, doubleSided: true });
  const linenMat = makePbrMat(scene, "LoungerLinen", 0xf5efe3, { roughness: 0.8 });
  const stripeBlueMat = makePbrMat(scene, "LoungerBlue", 0x628aad, { roughness: 0.78 });
  const rubberMat = makePbrMat(scene, "DockFenderRubber", 0x1e2022, { roughness: 0.88 });
  const barrelMat = makePbrMat(scene, "HarborOakBarrel", 0x7c4f2e, { roughness: 0.62 });
  const ropeMat = makePbrMat(scene, "HarborRopeMat", 0xc9b38c, { roughness: 0.92 });
  const lampGlowMat = new StandardMaterial("HarborLampGlow", scene);
  lampGlowMat.diffuseColor = hexToColor3(0xfff3d6);
  lampGlowMat.emissiveColor = hexToColor3(0xffb95e);

  const addBox = (name, x, y, z, w, h, d, mat, parent = eRoot, ry = 0) => {
    const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    m.parent = parent;
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    m.material = mat;
    m.isPickable = false;
    m.receiveShadows = true;
    return m;
  };
  const addCyl = (name, x, y, z, dTop, dBot, h, mat, parent = eRoot, segs = 12) => {
    const m = MeshBuilder.CreateCylinder(name, { diameterTop: dTop, diameterBottom: dBot, height: h, tessellation: segs }, scene);
    m.parent = parent;
    m.position.set(x, y, z);
    m.material = mat;
    m.isPickable = false;
    m.receiveShadows = true;
    return m;
  };

  // Harbor Quay, Piers & Landing Stage Walk Zone
  registerWalkZone((x, z) => {
    if (x >= 25.5 && x <= 32.5 && z >= 22.0 && z <= 24.8) return 0.45;
    if (x >= 26.0 && x <= 32.0 && z >= 19.2 && z <= 22.0) return lerp(1.36, 0.45, clamp((z - 19.2) / 2.8, 0, 1));
    if (x >= 45.8 && x <= 57.0 && (Math.abs(z + 8.0) <= 0.92 || Math.abs(z - 2.0) <= 0.92)) return 1.15;
    if (x >= 8.0 && x <= 46.0 && z >= -26.0 && z <= 22.0) {
      let qy = 1.36;
      if (x < 10.0) qy = lerp(getWorldTerrainY(x, z), 1.36, smoothstep(8.0, 10.0, x));
      if (z < -24.0) qy = lerp(getWorldTerrainY(x, z), qy, smoothstep(-26.0, -24.0, z));
      return qy;
    }
    return null;
  });

  addBox("QuaySlabMain", 27.6, 1.2, -2.0, 36.8, 0.32, 45.0, quayDeckMat);
  addBox("QuaySlabSW", 17.6, 1.2, 20.6, 16.8, 0.32, 2.8, quayDeckMat);
  addBox("QuaySlabSE", 39.0, 1.2, 20.6, 14.0, 0.32, 2.8, quayDeckMat);
  addBox("PromenadeE", 44.2, 1.372, -2.0, 2.3, 0.032, 46.2, teakMat);
  addBox("PromenadeS1", 17.4, 1.372, 20.5, 15.2, 0.032, 2.1, teakMat);
  addBox("PromenadeS2", 39.1, 1.372, 20.5, 12.2, 0.032, 2.1, teakMat);

  // Seawalls & Rubber Fenders
  for (const [cx, cz, sx, sz] of [
    [45.7, -2.0, 0.65, 48.0],
    [18.0, 21.7, 16.0, 0.65],
    [39.0, 21.7, 14.0, 0.65],
    [38.0, -25.6, 16.0, 0.65],
  ]) {
    addBox(`Seawall_${cx}_${cz}`, cx, -1.56, cz, sx, 5.88, sz, quayWallMat);
    addBox(`SeawallCope_${cx}_${cz}`, cx, 1.33, cz, sx + 0.14, 0.18, sz + 0.14, copingMat);
  }
  for (let z = -22; z <= 18; z += 5.0) addCyl(`FenderE_${z}`, 46.08, 0.42, z, 0.32, 0.32, 1.65, rubberMat);
  for (const x of [15, 21, 35, 41]) addCyl(`FenderS_${x}`, x, 0.42, 22.08, 0.32, 0.32, 1.65, rubberMat);

  // Quay Bollards, Barrels, Planters, Steps & Stage
  for (const [bx, bz] of [
    [45.15, -23.0],
    [45.15, -14.5],
    [45.15, -5.0],
    [45.15, 4.8],
    [45.15, 15.2],
    [16.5, 21.15],
    [24.2, 21.15],
    [34.2, 21.15],
    [42.5, 21.15],
  ]) {
    registerCircleCollider(bx, bz, 0.34);
    addBox(`BolBase_${bx}`, bx, 1.39, bz, 0.46, 0.06, 0.46, castIronMat);
    addCyl(`BolStem_${bx}`, bx, 1.63, bz, 0.28, 0.34, 0.48, castIronMat);
  }
  for (const [bx, bz] of [
    [41.5, -22.2],
    [42.2, -21.5],
    [41.4, -21.1],
    [34.8, 17.5],
  ]) {
    registerCircleCollider(bx, bz, 0.44);
    addCyl(`Barrel_${bx}`, bx, 1.75, bz, 0.64, 0.6, 0.78, barrelMat);
  }
  for (const [px, pz, sx, sz] of [
    [11.4, -14.8, 1.5, 4.4],
    [11.4, 11.4, 1.5, 4.2],
    [22.0, -17.2, 7.6, 1.35],
  ]) {
    registerBoxCollider(px - sx * 0.5, px + sx * 0.5, pz - sz * 0.5, pz + sz * 0.5);
    addBox(`QuayPlanter_${px}`, px, 1.58, pz, sx, 0.44, sz, copingMat);
  }
  // Landing Steps & Low Stage
  addBox("LandingCheekL", 25.85, 0.22, 20.6, 0.35, 2.4, 3.0, quayWallMat);
  addBox("LandingCheekR", 32.15, 0.22, 20.6, 0.35, 2.4, 3.0, quayWallMat);
  for (let s = 0; s < 6; s += 1) {
    const sy = lerp(1.28, 0.45, s / 5);
    const sz = lerp(19.45, 21.85, s / 5);
    addBox(`LandingStep_${s}`, 29.0, sy - 0.45, sz, 5.96, 0.9, 0.54, copingMat);
  }
  addBox("StageDeck", 29.0, 0.34, 23.4, 7.0, 0.22, 2.8, teakMat);
  for (const px of [25.9, 29.0, 32.1]) {
    for (const pz of [22.3, 24.5]) addCyl(`StagePile_${px}_${pz}`, px, -1.9, pz, 0.28, 0.28, 5.2, pileMat, eRoot, 8);
  }

  // Harbor Lamps + Festoon Bulbs
  const lampCoords = [
    [44.2, -21.5],
    [44.2, -12.0],
    [44.2, -2.5],
    [44.2, 5.8],
    [44.2, 17.5],
    [23.2, 20.2],
  ];
  for (const [lx, lz] of lampCoords) {
    registerCircleCollider(lx, lz, 0.28);
    addCyl(`LampBase_${lx}`, lx, 1.685, lz, 0.32, 0.48, 0.65, castIronMat);
    addCyl(`LampPole_${lx}`, lx, 3.38, lz, 0.11, 0.19, 2.85, castIronMat);
    const bulb = MeshBuilder.CreateSphere(`LampBulb_${lx}`, { diameter: 0.18, segments: 8 }, scene);
    bulb.parent = eRoot;
    bulb.position.set(lx, 5.08, lz);
    bulb.material = lampGlowMat;
    bulb.isPickable = false;
    addCyl(`LampHat_${lx}`, lx, 5.4, lz, 0.04, 0.52, 0.22, castIronMat, eRoot, 6);
  }

  // 2 Timber Finger Piers
  for (const pz of [-8.0, 2.0]) {
    addBox(`PierDeck_${pz}`, 51.5, 1.06, pz, 11.2, 0.18, 1.8, teakMat);
    for (const sz of [-0.84, 0.84]) addBox(`PierRail_${pz}_${sz}`, 51.5, 1.19, pz + sz, 11.2, 0.1, 0.1, pileMat);
    for (const px of [47.2, 50.2, 53.4, 56.5]) {
      for (const sz of [-0.75, 0.75]) addCyl(`PierPile_${pz}_${px}_${sz}`, px, -1.55, pz + sz, 0.28, 0.28, 6.2, pileMat, eRoot, 8);
    }
  }

  // Harbor Bistro Tables, Chairs & Parasols
  const bistroSites = [
    [37.5, -13.2],
    [26.5, 4.8],
    [16.5, -20.2],
  ];
  for (const [tx, tz] of bistroSites) {
    registerCircleCollider(tx, tz, 0.95);
    addCyl(`BistroPed_${tx}`, tx, 1.72, tz, 0.16, 0.5, 0.74, castIronMat);
    addCyl(`BistroTop_${tx}`, tx, 2.12, tz, 1.36, 1.34, 0.042, copingMat);
    buildSculptedParasol(scene, eRoot, `BistroParasol_${tx}`, tx, 1.36, tz, {
      radius: 1.54,
      height: 2.52,
      teakMat,
      canvasMat: creamCanvas,
      brassMat,
    });
    for (const ca of [0.4, 2.5, 4.5]) {
      const cx = tx + Math.cos(ca) * 0.96;
      const cz = tz + Math.sin(ca) * 0.96;
      const cry = Math.atan2(-Math.cos(ca), -Math.sin(ca));
      addBox(`BistroChair_${tx}_${ca}`, cx, 1.81, cz, 0.42, 0.05, 0.42, teakMat, eRoot, cry);
    }
  }

  // Boathouse Espresso Pergola @ (22.0, 1.36, -11.0)
  const cafeX = 22.0;
  const cafeZ = -11.0;
  registerBoxCollider(16.4, 27.6, -15.75, -15.45);
  registerBoxCollider(16.9, 21.6, -14.8, -13.5);
  for (const px of [17.0, 22.0, 27.0]) {
    for (const pz of [-15.5, -6.5]) {
      addCyl(`CafeCol_${px}_${pz}`, px, 2.95, pz, 0.18, 0.22, 3.15, quayWallMat);
    }
  }
  addBox("CafeRidge", cafeX, 5.2, cafeZ, 10.6, 0.18, 0.18, teakMat);
  for (let rx = -4.5; rx <= 4.5; rx += 1.5) {
    addBox(`CafeRafter_${rx}`, cafeX + rx, 4.78, cafeZ, 0.12, 0.14, 9.6, teakMat);
  }
  addBox("CafeBackWall", cafeX, 2.6, -15.6, 11.2, 2.48, 0.28, quayWallMat);
  addBox("CafeCounter", 19.2, 1.88, -14.1, 4.4, 1.04, 1.1, teakMat);
  addBox("CafeCounterTop", 19.2, 2.44, -14.1, 4.6, 0.08, 1.24, copingMat);
  addBox("CafeTableTop", 20.4, 2.11, -9.5, 1.85, 0.07, 1.1, teakMat);
  addBox("CafeBenchN", 20.4, 1.81, -10.55, 1.75, 0.07, 0.4, teakMat);
  addBox("CafeBenchS", 20.4, 1.81, -8.45, 1.75, 0.07, 0.4, teakMat);

  // Curved Cedar Waterside Boardwalk + Over-Water Deck & Teak Loungers
  const deckY = 1.18;
  const curveCtrl = [
    new Vector3(-13.8, 2.34, 23.0),
    new Vector3(-12.4, 2.08, 28.6),
    new Vector3(-8.2, 1.62, 33.2),
    new Vector3(-3.2, 1.28, 35.4),
    new Vector3(1.2, deckY, 35.6),
  ];
  const sampleBoardwalk = (u) => {
    const n = curveCtrl.length - 1;
    const t = clamp(u, 0, 1) * n;
    const i = Math.min(n - 1, Math.floor(t));
    const f = t - i;
    const p0 = curveCtrl[Math.max(0, i - 1)];
    const p1 = curveCtrl[i];
    const p2 = curveCtrl[i + 1];
    const p3 = curveCtrl[Math.min(n, i + 2)];
    const x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * f + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * f * f + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * f * f * f);
    const y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * f + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * f * f + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * f * f * f);
    const z = 0.5 * (2 * p1.z + (-p0.z + p2.z) * f + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * f * f + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * f * f * f);
    return new Vector3(x, Math.max(y, getWorldTerrainY(x, z) + 0.18, deckY), z);
  };
  const bwSamples = Array.from({ length: 49 }, (_, i) => sampleBoardwalk(i / 48));
  const stepBaseY = bwSamples[Math.floor(0.54 * 48)].y;

  registerWalkZone((x, z) => {
    if (x >= -0.2 && x <= 5.9 && z >= 33.1 && z <= 38.3) return deckY;
    if (x >= -15.4 && x <= 1.8 && z >= 22.6 && z <= 36.8) {
      let bestD2 = 999;
      let bestY = deckY;
      for (let i = 0; i < bwSamples.length; i += 2) {
        const p = bwSamples[i];
        const d2 = (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z);
        if (d2 < bestD2) {
          bestD2 = d2;
          bestY = p.y;
        }
      }
      if (bestD2 <= 1.35 * 1.35) return bestY;
    }
    return null;
  });
  registerBoxCollider(-0.2, 5.95, 38.15, 38.55);
  registerBoxCollider(5.75, 6.05, 33.1, 38.45);
  registerBoxCollider(1.5, 5.95, 32.95, 33.25);

  for (let i = 0; i < bwSamples.length; i += 1) {
    const p = bwSamples[i];
    const nextP = bwSamples[Math.min(bwSamples.length - 1, i + 1)];
    const prevP = bwSamples[Math.max(0, i - 1)];
    const yaw = Math.atan2(nextP.x - prevP.x, nextP.z - prevP.z);
    addBox(`BWPlank_${i}`, p.x, p.y - 0.045, p.z, 2.48, 0.09, 0.34, cedarPlankMat, eRoot, yaw);
    if (i % 7 === 0) {
      const side = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      for (const sOff of [-1.14, 1.14]) {
        const px = p.x + side.x * sOff;
        const pz = p.z + side.z * sOff;
        addCyl(`BWPile_${i}_${sOff}`, px, p.y - 1.6, pz, 0.22, 0.24, 3.2, pileMat, eRoot, 8);
        if (!(sOff < 0 && i > 22 && i < 32)) {
          addCyl(`BWPost_${i}_${sOff}`, px, p.y + 0.44, pz, 0.13, 0.14, 0.92, cedarPlankMat, eRoot, 8);
        }
      }
    }
  }
  for (let bs = 0; bs < 4; bs += 1) {
    addBox(`BWStep_${bs}`, -9.15 - bs * 0.28, stepBaseY - 0.16 - bs * 0.2, 33.85 + bs * 0.36, 1.75, 0.11, 0.42, cedarPlankMat, eRoot, 0.58);
  }
  addBox("ViewDeckSlab", 2.9, deckY - 0.045, 35.7, 5.8, 0.09, 5.0, cedarPlankMat);
  for (const px of [0.3, 2.9, 5.5]) {
    for (const pz of [33.45, 35.7, 37.95]) addCyl(`DeckPile_${px}_${pz}`, px, deckY - 1.9, pz, 0.26, 0.28, 3.8, pileMat, eRoot, 8);
  }

  // Two Deck Loungers & Market Parasol
  const loungerSpots = [
    { lx: 2.2, lz: 36.25, lyaw: 0.14 },
    { lx: 3.95, lz: 36.15, lyaw: -0.12 },
  ];
  for (const { lx, lz, lyaw } of loungerSpots) {
    registerRotatedBoxCollider(lx, lz, lyaw, 0.38, 0.96, 0.5, 3.5);
    const lRoot = new TransformNode(`Lounger_${lx}`, scene);
    lRoot.parent = eRoot;
    lRoot.position.set(lx, deckY, lz);
    lRoot.rotation.y = lyaw;
    addBox("LFrame", 0, 0.26, 0, 0.72, 0.08, 1.88, cedarPlankMat, lRoot);
    addBox("LMatt", 0, 0.36, 0.12, 0.66, 0.09, 1.56, linenMat, lRoot);
    const backrest = addBox("LBack", 0, 0.56, -0.62, 0.66, 0.08, 0.62, stripeBlueMat, lRoot);
    backrest.rotation.x = 0.56;
  }
  registerBoxCollider(2.76, 3.4, 35.53, 36.17, 0.5, 3.5);
  addBox("DeckSideTbl", 3.08, deckY + 0.43, 35.85, 0.54, 0.04, 0.54, cedarPlankMat);
  const deckParasol = buildSculptedParasol(scene, eRoot, "DeckParasol", 3.08, deckY, 35.12, {
    radius: 1.48,
    height: 2.48,
    teakMat: cedarPlankMat,
    canvasMat: linenMat,
    brassMat,
  });

  // -------------------------------------------------------------------------
  // Sculpted Blender Landmarks & Fleet (8 GLBs)
  // -------------------------------------------------------------------------

  // 1. Breakwater Mole + Coastal Lighthouse (@ (78, 1.38, 10))
  registerWalkZone((x, z) => {
    if (x >= 45.8 && x <= 78.0 && z >= 7.6 && z <= 12.4) return 1.38;
    if (Math.hypot(x - 78.0, z - 10.0) <= 4.8) return 1.38;
    return null;
  });
  registerCircleCollider(78.0, 10.0, 2.5);
  addBox("BreakwaterCore", 62.0, -1.56, 10.0, 32.4, 5.88, 4.8, quayWallMat);
  addBox("BreakwaterTop", 62.0, 1.3, 10.0, 32.4, 0.16, 4.88, quayDeckMat);
  addCyl("BastionCore", 78.0, -1.56, 10.0, 9.6, 10.4, 5.88, quayWallMat, eRoot, 24);
  addCyl("BastionTop", 78.0, 1.3, 10.0, 9.72, 9.72, 0.18, quayDeckMat, eRoot, 24);

  const lhAnchor = new TransformNode("LighthouseAnchor", scene);
  lhAnchor.parent = eRoot;
  lhAnchor.position.set(78.0, 1.38, 10.0);
  const lhInst = instantiateGLB(models.coastal_lighthouse, "LighthouseGLB", lhAnchor);
  applyGLBShadows(lhInst?.rootNodes, shadowGen, { cast: true, receive: true });
  const lhRotor = findDescendantByName(lhInst?.rootNodes, "Lighthouse_Rotor");
  const lhBaseQuat = lhRotor?.rotationQuaternion ? lhRotor.rotationQuaternion.clone() : Quaternion.Identity();
  const beamMat = new StandardMaterial("LighthouseBeamMat", scene);
  beamMat.diffuseColor = hexToColor3(0xfff4cf);
  beamMat.emissiveColor = hexToColor3(0xffe19c);
  beamMat.disableLighting = true;
  beamMat.alpha = 0.06;
  beamMat.alphaMode = Engine.ALPHA_ADD;
  beamMat.backFaceCulling = false;
  if (lhRotor) {
    for (const s of [-1, 1]) {
      const cone = MeshBuilder.CreateCylinder(`LHBeam_${s}`, { diameterTop: 0.18, diameterBottom: 3.8, height: 42, tessellation: 14 }, scene);
      cone.parent = lhRotor;
      cone.position.set(s * 21.2, 0.15, 0);
      cone.rotation.z = s * Math.PI * 0.5;
      cone.material = beamMat;
      cone.isPickable = false;
    }
  }

  // 2. Hilltop Windmill (@ (-52, 14.2, -68), ry=0.52)
  registerCircleCollider(-52.0, -68.0, 3.6);
  const wmAnchor = new TransformNode("WindmillAnchor", scene);
  wmAnchor.parent = eRoot;
  wmAnchor.position.set(-52.0, 14.2, -68.0);
  wmAnchor.rotation.y = 0.52;
  const wmInst = instantiateGLB(models.hilltop_windmill, "WindmillGLB", wmAnchor);
  applyGLBShadows(wmInst?.rootNodes, shadowGen, { cast: true, receive: true });
  const wmRotor = findDescendantByName(wmInst?.rootNodes, "Windmill_Rotor");
  const wmBaseQuat = wmRotor?.rotationQuaternion ? wmRotor.rotationQuaternion.clone() : Quaternion.Identity();
  const wmAxisX = new Vector3(1, 0, 0);

  // 3. Creek Arched Bridge (@ (8.4, avgBankY, -44.0))
  const yWest = getWorldTerrainY(3.2, -44.0) + 0.04;
  const yEast = getWorldTerrainY(13.6, -44.0) + 0.04;
  const getBridgeDeckY = (x) => {
    const t = clamp((x - 3.2) / 10.4, 0, 1);
    return lerp(yWest, yEast, t) + 1.82 * Math.sin(t * Math.PI);
  };
  registerWalkZone((x, z) => (x >= 3.0 && x <= 13.8 && z >= -45.8 && z <= -42.2 ? getBridgeDeckY(x) : null));
  registerBoxCollider(3.35, 13.45, -45.95, -45.62);
  registerBoxCollider(3.35, 13.45, -42.38, -42.05);
  const bridgeAnchor = new TransformNode("CreekBridgeAnchor", scene);
  bridgeAnchor.parent = eRoot;
  bridgeAnchor.position.set(8.4, 0.5 * (yWest + yEast), -44.0);
  bridgeAnchor.rotation.z = Math.atan2(yEast - yWest, 10.4);
  const bridgeInst = instantiateGLB(models.creek_bridge, "CreekBridgeGLB", bridgeAnchor);
  applyGLBShadows(bridgeInst?.rootNodes, shadowGen, { cast: true, receive: true });

  // 4. Cliffside Marble Gazebo (@ (-64, 7.80, 42))
  registerWalkZone((x, z) => (Math.hypot(x + 64.0, z - 42.0) < 5.8 ? 8.08 : null));
  for (let c = 0; c < 8; c += 1) {
    const a = (c / 8) * Math.PI * 2 + Math.PI / 8;
    registerCircleCollider(-64.0 + Math.cos(a) * 3.92, 42.0 + Math.sin(a) * 3.92, 0.3);
  }
  const gazAnchor = new TransformNode("GazeboAnchor", scene);
  gazAnchor.parent = eRoot;
  gazAnchor.position.set(-64.0, 7.8, 42.0);
  const gazInst = instantiateGLB(models.cliffside_gazebo, "GazeboGLB", gazAnchor);
  applyGLBShadows(gazInst?.rootNodes, shadowGen, { cast: true, receive: true });
  const gazSwingPivot = findDescendantByName(gazInst?.rootNodes, "Gazebo_SwingPivot");
  const gazSwingBaseQuat = gazSwingPivot?.rotationQuaternion ? gazSwingPivot.rotationQuaternion.clone() : Quaternion.Identity();
  const gazAxisZ = new Vector3(0, 0, 1);
  const gazGlobeMats = findMaterialsInNodes(gazInst?.rootNodes, /Gaz_LanternGlow/i);

  // 5. Three Provençal Cottages
  for (let i = 0; i < COTTAGE_SPECS.length; i += 1) {
    const sp = COTTAGE_SPECS[i];
    registerRotatedBoxCollider(sp.x, sp.z, sp.ry, sp.cw * 0.52, sp.cd * 0.52);
    const cotAnchor = new TransformNode(`Cottage_${i}`, scene);
    cotAnchor.parent = eRoot;
    cotAnchor.position.set(sp.x, sp.y, sp.z);
    cotAnchor.rotation.y = sp.ry;
    cotAnchor.scaling.set(sp.cw / 8.2, sp.wallH / 3.4, sp.cd / 5.8);
    const cotInst = instantiateGLB(models.provencal_cottage, `CottageGLB_${i}`, cotAnchor);
    applyGLBShadows(cotInst?.rootNodes, shadowGen, { cast: true, receive: true });
  }

  // 6. Three Boats from `harbor_fleet.glb` (`Yacht_Cruiser`, `Coastal_Sloop`, `Harbor_Launch`)
  const boatConfigs = [
    { nodeName: "Yacht_Cruiser", x: 52.9, z: -3.6, ry: -0.03, phase: 0.4, rollAmp: 0.022, pitchAmp: 0.012 },
    { nodeName: "Coastal_Sloop", x: 52.2, z: 4.2, ry: 0.025, phase: 2.1, rollAmp: 0.032, pitchAmp: 0.015 },
    { nodeName: "Harbor_Launch", x: 36.5, z: 25.2, ry: -0.14, phase: 3.9, rollAmp: 0.036, pitchAmp: 0.018 },
  ];
  const boats = [];
  for (let i = 0; i < boatConfigs.length; i += 1) {
    const bc = boatConfigs[i];
    const bWrap = new TransformNode(`Boat_${bc.nodeName}`, scene);
    bWrap.parent = eRoot;
    bWrap.position.set(bc.x, 0, bc.z);
    bWrap.rotation.y = bc.ry;
    const inst = instantiateGLB(models.harbor_fleet, `Fleet_${i}`, bWrap);
    const targetBoat = findDescendantByName(inst?.rootNodes, bc.nodeName);
    for (const rootN of inst?.rootNodes || []) {
      for (const ch of rootN.getChildren(undefined, true)) {
        if (ch !== targetBoat && !ch.name.startsWith(`Fleet_${i}_${bc.nodeName}`)) {
          ch.setEnabled(false);
        }
      }
    }
    applyGLBShadows(targetBoat ? [targetBoat] : inst?.rootNodes, shadowGen, { cast: true, receive: true });
    boats.push({ ...bc, mesh: bWrap, targetNode: targetBoat || bWrap });
  }
  const yachtNode = boats[0].mesh;
  const sloopNode = boats[1].mesh;
  const launchNode = boats[2].mesh;

  // Hoistable Mainsail on Sloop
  const sloopSail = new Mesh("SloopHoistSail", scene);
  sloopSail.parent = sloopNode;
  sloopSail.position.set(0.88, 2.42, 0);
  const sVD = new VertexData();
  sVD.positions = [0, 0, 0, -4.15, 0.25, 0, -0.06, 10.6, 0];
  sVD.indices = [0, 1, 2];
  sVD.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
  sVD.applyToMesh(sloopSail);
  sloopSail.material = navyCanvas;
  sloopSail.setEnabled(false);

  // Interactive Courtyard Props (Mailbox Floating Envelope, Harbor String Lights, Sky Lanterns, Heart Balloons)
  const animators = [];
  let nightMix = 0;
  const hooks = {
    wmBoost: 0,
    swingAmpBoost: 0,
    swingPhase: 0,
    lhFlash: 0,
    boatRockBoost: 0,
    getNightMix: () => nightMix,
    boostWindmill() {
      hooks.wmBoost = 1.35;
    },
    swingGazebo() {
      hooks.swingAmpBoost = 0.34;
    },
    flashLighthouse() {
      hooks.lhFlash = 1.4;
    },
    rockBoats(v = 1.25) {
      hooks.boatRockBoost = v;
    },
  };

  // Festoon String Lights along East Promenade (X = 44.12, Z in [-21.5..17.5])
  const bulbPts = [];
  const hy = 1.36 + 3.82;
  const strPoleZ = [-21.5, -13.2, -4.8, 5.2, 17.5];
  const strIronMat = makePbrMat(scene, "FestoonPoleIronMat", 0x22272c, { roughness: 0.44, metallic: 0.82 });
  const strBrassMat = makePbrMat(scene, "FestoonBrassSocketMat", 0xd0a756, { roughness: 0.28, metallic: 0.88 });
  for (let pi = 0; pi < strPoleZ.length; pi += 1) {
    const pz = strPoleZ[pi];
    const poleH = hy - 1.38 + 0.08;
    const pole = MeshBuilder.CreateCylinder(`StrPole_${pi}`, { diameterTop: 0.065, diameterBottom: 0.095, height: poleH, tessellation: 10 }, scene);
    pole.parent = eRoot;
    pole.position.set(44.12, 1.38 + poleH * 0.5, pz);
    pole.material = strIronMat;
    pole.isPickable = false;
    const cap = MeshBuilder.CreateSphere(`StrPoleFinial_${pi}`, { diameter: 0.13, segments: 8 }, scene);
    cap.parent = eRoot;
    cap.position.set(44.12, hy + 0.12, pz);
    cap.material = strBrassMat;
    cap.isPickable = false;
  }
  const wireCurve = [];
  for (let s = 0; s < strPoleZ.length - 1; s += 1) {
    const z0 = strPoleZ[s];
    const z1 = strPoleZ[s + 1];
    const segSteps = 12;
    for (let k = 0; k <= (s === strPoleZ.length - 2 ? segSteps : segSteps - 1); k += 1) {
      const u = k / segSteps;
      const cz = lerp(z0, z1, u);
      const sag = Math.sin(u * Math.PI) * 0.34;
      wireCurve.push(new Vector3(44.12, hy + 0.04 - sag, cz));
    }
  }
  const strCable = MeshBuilder.CreateTube("FestoonCableWire", { path: wireCurve, radius: 0.016, tessellation: 6 }, scene);
  strCable.parent = eRoot;
  strCable.material = strIronMat;
  strCable.isPickable = false;
  for (let zi = -21.5; zi <= 17.5; zi += 1.25) {
    const spanU = ((zi + 21.5) % 9.75) / 9.75;
    bulbPts.push(new Vector3(44.12, hy + 0.04 - 0.34 * Math.sin(spanU * Math.PI) - 0.09, zi));
  }
  const bulbLights = { lit: false, chase: -1, meshes: [], mats: [] };
  for (let i = 0; i < bulbPts.length; i += 1) {
    const socket = MeshBuilder.CreateCylinder(`StrSocket_${i}`, { diameter: 0.045, height: 0.06, tessellation: 8 }, scene);
    socket.parent = eRoot;
    socket.position.set(bulbPts[i].x, bulbPts[i].y + 0.065, bulbPts[i].z);
    socket.material = strBrassMat;
    socket.isPickable = false;
    const bm = new StandardMaterial(`StrBulbMat_${i}`, scene);
    bm.diffuseColor = hexToColor3(0xfff4df);
    bm.emissiveColor = hexToColor3(0x5a401d);
    const bs = MeshBuilder.CreateSphere(`StrBulb_${i}`, { diameter: 0.13, segments: 8 }, scene);
    bs.parent = eRoot;
    bs.position.copyFrom(bulbPts[i]);
    bs.material = bm;
    bs.isPickable = false;
    bulbLights.meshes.push(bs);
    bulbLights.mats.push(bm);
  }
  animators.push((elapsed, dt) => {
    if (bulbLights.lit && bulbLights.chase < bulbPts.length) bulbLights.chase += dt * 22;
    const duskBase = smoothstep(0.25, 0.95, nightMix) * 0.65;
    for (let i = 0; i < bulbPts.length; i += 1) {
      const active = bulbLights.lit && bulbLights.chase >= i;
      const pulse = active ? 0.92 + 0.12 * Math.sin(elapsed * 3 + i * 1.7) : duskBase;
      const baseDay = 0.24;
      bulbLights.mats[i].emissiveColor = hexToColor3(0xffcf78).scale(Math.max(baseDay, pulse));
    }
  });

  // Sky Lanterns & Heart Balloons Pools
  const lanternMat = new StandardMaterial("SkyLanternMat", scene);
  lanternMat.diffuseColor = hexToColor3(0xffb86b);
  lanternMat.emissiveColor = hexToColor3(0xff8e36);
  const lanterns = Array.from({ length: 4 }, (_, i) => {
    const lm = MeshBuilder.CreateCylinder(`SkyLantern_${i}`, { diameterTop: 0.42, diameterBottom: 0.28, height: 0.56, tessellation: 10 }, scene);
    lm.parent = eRoot;
    lm.material = lanternMat;
    lm.setEnabled(false);
    lm.isPickable = false;
    return { mesh: lm, active: false, age: 0, sx: 2.6, sz: 34.6 };
  });
  let li = 0;
  animators.push((elapsed, dt) => {
    for (let i = 0; i < lanterns.length; i += 1) {
      const L = lanterns[i];
      if (!L.active) continue;
      L.age += dt;
      if (L.age > 14) {
        L.active = false;
        L.mesh.setEnabled(false);
        continue;
      }
      L.mesh.position.set(L.sx + Math.sin(elapsed * 0.7 + i) * 1.2, 1.5 + L.age * 1.65, L.sz + L.age * 0.45);
      L.mesh.rotation.y += dt * 0.6;
    }
  });

  const balloonColors = [0xff8aa8, 0xffb3c8, 0xf4c2ff];
  const balloons = Array.from({ length: 3 }, (_, i) => {
    const bm = makePbrMat(scene, `HeartBalloonMat_${i}`, balloonColors[i], { roughness: 0.32, emissive: 0x3b121c });
    const hMesh = createExtrudedHeartGeometry(`HeartBalloon_${i}`, scene, 0.28, 0.14);
    hMesh.parent = eRoot;
    hMesh.material = bm;
    hMesh.setEnabled(false);
    return { mesh: hMesh, active: false, age: 0 };
  });
  let bi = 0;
  animators.push((elapsed, dt) => {
    for (let i = 0; i < balloons.length; i += 1) {
      const B = balloons[i];
      if (!B.active) continue;
      B.age += dt;
      if (B.age > 11) {
        B.active = false;
        B.mesh.setEnabled(false);
        continue;
      }
      B.mesh.position.set(22.4 + Math.sin(elapsed * 1.1 + i) * 0.85, 2.4 + B.age * 1.85, 11.9 - B.age * 0.25);
      B.mesh.rotation.y += dt * 1.1;
    }
  });

  // Skipping Stone + Mailbox Envelope + Sail State
  const skipStone = MeshBuilder.CreateSphere("SkipStone", { diameterX: 0.1, diameterY: 0.04, diameterZ: 0.08, segments: 8 }, scene);
  skipStone.parent = eRoot;
  skipStone.material = copingMat;
  skipStone.setEnabled(false);

  const mailEnv = MeshBuilder.CreateBox("MailboxLoveLetter", { width: 0.24, height: 0.16, depth: 0.015 }, scene);
  mailEnv.parent = eRoot;
  mailEnv.material = linenMat;
  mailEnv.setEnabled(false);

  const sailState = { level: 0, target: 0, hold: 0 };
  animators.push((_elapsed, dt) => {
    if (sailState.hold > 0) sailState.hold = Math.max(0, sailState.hold - dt);
    else sailState.target = 0;
    sailState.level += (sailState.target - sailState.level) * Math.min(1, dt * 3.5);
    sloopSail.setEnabled(sailState.level > 0.03);
    sloopSail.scaling.y = Math.max(0.01, sailState.level);
  });

  // 19 Estate Interactables
  const V = (x, y, z) => new Vector3(x, y, z);
  const T = (x, z) => getWorldTerrainY(x, z);
  const interactables = [];

  if (courtRefs?.mailbox) {
    interactables.push({
      id: "estate-mailbox-letter",
      label: "拉起信箱小旗，取出情书",
      position: V(-10.8, 2.22, 10.4),
      radius: 1.8,
      floorY: 2.22,
      activate(ctx = {}) {
        mailEnv.setEnabled(true);
        fx.addTask(
          3.4,
          (u) => {
            if (courtRefs.flagPivot) courtRefs.flagPivot.rotation.z = 0.9 * Math.sin(u * Math.PI);
            mailEnv.position.set(-10.8, 3.25 + smoothstep(0, 0.35, u) * 0.55 + Math.sin(u * 6) * 0.05, 9.8);
            mailEnv.rotation.y = Math.sin(u * 4) * 0.25;
          },
          () => mailEnv.setEnabled(false)
        );
        fx.heart(V(-10.8, 3.9, 9.8), { count: 32, scale: 0.035 });
        ctx.audio?.playLetterUnfold?.();
        return "信箱小旗翘起——里面是一封手写给小贤贤的情书 💌";
      },
    });
  }

  if (courtRefs?.wheels) {
    const spin = { v: 0 };
    animators.push((_e, dt) => {
      if (spin.v > 0.02) {
        for (const w of courtRefs.wheels) w.rotation.z -= spin.v * dt;
        spin.v *= Math.exp(-dt * 1.15);
      }
    });
    interactables.push({
      id: "estate-bicycle-bell",
      label: "按响车铃，转转车轮",
      position: V(-18.6, 2.22, 10.65),
      radius: 1.8,
      floorY: 2.22,
      activate(ctx = {}) {
        spin.v = 14;
        fx.petalBurst(V(-18.5, 3.0, 9.6), { count: 28, radius: 0.35, up: 0.9, speed: [0.6, 1.5], floorY: 2.25, life: 4 });
        fx.burst(V(-18.4, 3.2, 9.6), { count: 20, colors: [0xfff0a8, 0xffffff], speed: [0.5, 1.2], size: 0.06, life: 1.0 });
        ctx.audio?.playBicycleBell?.();
        return "叮铃铃——花篮上的小花在阳光下轻轻晃 🚲";
      },
    });
  }

  // Courtyard Fountain @ (-4.8, 2.22, 9.5)
  interactables.push({
    id: "estate-fountain-wish",
    label: "向喷泉投币许愿",
    position: V(-4.8, 2.22, 12.15),
    radius: 2.0,
    floorY: 2.22,
    activate(ctx = {}) {
      fx.burst(V(-4.8, 2.85, 9.5), { count: 32, colors: [0xffe08a, 0xdff6ff, 0xffffff], speed: [0.7, 1.6], up: 1.5, gravity: 3.5, size: 0.065, life: 1.2 });
      fx.ripple(V(-4.8, 2.74, 9.5), { radius: 1.2, life: 1.8, opacity: 0.7 });
      ctx.audio?.playVendingClink?.();
      return "喷泉泉水接住心愿，亮起一圈细碎的金色水花 ✨";
    },
  });

  interactables.push({
    id: "estate-lighthouse-flash",
    label: "点亮灯塔，扫过海面",
    position: V(73.6, 1.38, 10.0),
    radius: 2.8,
    floorY: 1.38,
    activate(ctx = {}) {
      hooks.flashLighthouse();
      fx.burst(V(78, 13.3, 10), { count: 44, colors: [0xfff6d0, 0xffffff], speed: [1.0, 2.4], hemi: false, up: 0, gravity: 0.2, size: 0.14, life: 1.6 });
      ctx.audio?.playShipBell?.();
      return "灯塔的光束扫过夜色海湾，只为你照亮这一片海 💡";
    },
  });

  interactables.push({
    id: "estate-sloop-sail",
    label: "登上帆船，扬帆摇荡",
    position: V(49.5, 1.15, 3.0),
    radius: 2.8,
    floorY: 1.15,
    pose: {
      type: "sit",
      attachTo: sloopNode,
      seats: [
        { x: -2.2, y: 1.0, z: -0.66, yaw: Math.PI },
        { x: -2.9, y: 1.0, z: -0.66, yaw: Math.PI },
      ],
    },
    activate(ctx = {}) {
      hooks.rockBoats(1.25);
      sailState.target = 1;
      sailState.hold = 22;
      for (let k = 0; k < 4; k += 1) fx.ripple(V(52.2, 0.04, 4.2), { radius: 3.5 + k * 1.2, life: 2.6, delay: k * 0.4, opacity: 0.5 });
      ctx.audio?.playShipBell?.();
      return "白帆缓缓升起，小船随着海浪轻轻摇晃 ⛵";
    },
  });

  interactables.push({
    id: "estate-launch-ride",
    label: "坐上小艇摇一摇",
    position: V(32.0, 0.45, 24.2),
    radius: 2.8,
    floorY: 0.45,
    pose: {
      type: "sit",
      attachTo: launchNode,
      seats: [
        { x: -0.65, y: 0.6, z: -0.42, yaw: -Math.PI / 2 },
        { x: -0.65, y: 0.6, z: 0.42, yaw: -Math.PI / 2 },
      ],
    },
    activate(ctx = {}) {
      hooks.rockBoats(1.6);
      for (let k = 0; k < 4; k += 1) fx.ripple(V(36.5, 0.04, 25.2), { radius: 2.4 + k * 1.0, life: 2.2, delay: k * 0.35, opacity: 0.55 });
      fx.burst(V(39.5, 0.3, 25.2), { count: 36, colors: [0xe8fbff, 0xffffff], speed: [1.0, 2.2], up: 1.0, gravity: 4.0, size: 0.07, life: 1.0 });
      ctx.audio?.playShipBell?.();
      return "小艇左摇右晃，溅起一串晶莹的浪花 🚤";
    },
  });

  interactables.push({
    id: "estate-yacht-horn",
    label: "拉响游艇汽笛",
    position: V(47.2, 1.38, -3.6),
    radius: 2.8,
    floorY: 1.38,
    activate(ctx = {}) {
      hooks.rockBoats(1.0);
      fx.emit(2.0, 40, () => {
        fx.spark(51.1, 3.7, -3.6, (Math.random() - 0.5) * 0.4, 1.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4, {
          color: 0xf4f6f8,
          life: 1.8,
          size: 0.2,
          drag: 1.2,
        });
      });
      for (let k = 0; k < 3; k += 1) fx.ripple(V(52.9, 0.04, -3.6), { radius: 5 + k * 1.5, life: 2.6, delay: k * 0.45, opacity: 0.45 });
      ctx.audio?.playShipBell?.();
      return "呜——游艇汽笛声回荡在港湾 🛥️";
    },
  });

  {
    const wx = -52.0 + Math.cos(0.52) * 5.1;
    const wz = -68.0 - Math.sin(0.52) * 5.1;
    interactables.push({
      id: "estate-windmill-spin",
      label: "推一把，让风车转起来",
      position: V(wx, T(wx, wz), wz),
      radius: 3.0,
      activate(ctx = {}) {
        hooks.boostWindmill();
        const rPos = wmRotor ? wmRotor.getAbsolutePosition() : V(-52, 25.5, -68);
        fx.petalBurst(rPos, { count: 65, radius: 2.5, up: 0.4, speed: [1.0, 2.6], floorY: T(wx, wz) + 0.03, life: 7, colors: [0xffffff, 0xd8c4ff, 0xfff0a8, 0xffc4d8] });
        ctx.audio?.playRoofChime?.(true);
        return "风车呼呼地转起来，把花瓣吹向整片花海 🌬️";
      },
    });
  }

  interactables.push({
    id: "estate-gazebo-swing",
    label: "坐上海岬花亭秋千",
    position: V(-62.6, 8.08, 41.0),
    radius: 2.6,
    floorY: 8.08,
    pose: {
      type: "sit",
      attachTo: gazSwingPivot,
      seats: [
        { x: 0.04, y: -2.79, z: -0.42, yaw: -Math.PI / 2 },
        { x: 0.04, y: -2.79, z: 0.42, yaw: -Math.PI / 2 },
      ],
    },
    activate(ctx = {}) {
      hooks.swingGazebo();
      fx.petalBurst(V(-64, 11.28, 42), { count: 55, radius: 1.8, up: 0.3, floorY: 8.1, life: 6.5 });
      fx.heart(V(-64, 10.28, 42), { count: 44, scale: 0.05, yaw: 0.65 + Math.PI / 2 });
      ctx.audio?.playPetalGlissando?.();
      return "花亭秋千荡向大海，玫瑰花瓣随风飘洒 🌹";
    },
  });

  {
    const stepTop = stepBaseY - 0.36 + 0.055;
    const cxs = -9.43;
    const czs = 34.21;
    const ax = Math.cos(0.58);
    const az = -Math.sin(0.58);
    const yaw = Math.atan2(0.28, -0.36);
    interactables.push({
      id: "estate-boardwalk-steps-sit",
      label: "坐在栈道台阶上看海",
      position: V(-8.75, stepBaseY, 33.4),
      radius: 1.9,
      floorY: stepBaseY,
      pose: {
        type: "sit",
        seats: [
          { x: cxs - ax * 0.36, y: stepTop, z: czs - az * 0.36, yaw },
          { x: cxs + ax * 0.36, y: stepTop, z: czs + az * 0.36, yaw },
        ],
      },
      activate(ctx = {}) {
        for (let k = 0; k < 4; k += 1) fx.ripple(V(-9.43 - 2.5, 0.05, 34.21 + 3.2), { radius: 1.5 + k, life: 2.8, delay: k * 0.6, opacity: 0.4 });
        fx.heart(V(-9.43 - 0.8, stepTop + 1.4, 34.21 + 1.0), { count: 38, scale: 0.04 });
        ctx.audio?.playShipBell?.();
        return "并肩坐在栈道台阶上，听海浪一声声拍岸 🌊";
      },
    });
  }

  interactables.push({
    id: "estate-deck-lounger",
    label: "躺在躺椅上晒太阳",
    position: V(3.08, deckY, 34.45),
    radius: 2.0,
    floorY: deckY,
    pose: {
      type: "lie",
      seats: loungerSpots.map(({ lx, lz, lyaw }) => ({
        x: lx + Math.sin(lyaw) * -0.1,
        y: deckY + 0.44,
        z: lz + Math.cos(lyaw) * -0.1,
        yaw: lyaw,
        recline: 0.36,
      })),
    },
    activate(ctx = {}) {
      fx.addTask(
        1.6,
        (u) => {
          const r = u < 0.3 ? Math.max(0.15, 1 - u / 0.3) : Math.max(0.15, easeOutBack((u - 0.3) / 0.7));
          deckParasol.scaling.set(r, 1, r);
          deckParasol.rotation.y = u * Math.PI * 1.5;
        },
        () => deckParasol.scaling.setAll(1)
      );
      fx.burst(V(3.08, deckY + 2.6, 35.12), { count: 44, colors: [0xfff4b8, 0xffe08a, 0xffffff], speed: [0.8, 2.0], hemi: false, up: 0.2, gravity: 0.3, size: 0.1, life: 1.8 });
      ctx.audio?.playDuetArpeggio?.();
      return "撑开遮阳伞，躺在躺椅上晒一场温柔的日光浴 ☀️";
    },
  });

  {
    const bx = -19.0;
    let shoreZ = 40.0;
    for (let z = 26; z < 62; z += 0.25) {
      if (T(bx, z) < 0.06) {
        shoreZ = z;
        break;
      }
    }
    const standZ = shoreZ - 1.6;
    interactables.push({
      id: "estate-skip-stones",
      label: "在海边打水漂",
      position: V(bx, T(bx, standZ), standZ),
      radius: 2.4,
      activate(ctx = {}) {
        const hops = 6;
        const start = V(bx + 0.2, T(bx, standZ) + 1.0, standZ + 0.4);
        skipStone.setEnabled(true);
        let prevHop = -1;
        fx.addTask(
          2.2,
          (u) => {
            const prog = u * hops;
            const hi = Math.floor(prog);
            const f = prog - hi;
            skipStone.position.set(start.x + Math.sin((Math.random() - 0.5) * 0.02) + u * 2.5, lerp(start.y, 0.05, clamp(u * 2, 0, 1)) + Math.sin(f * Math.PI) * 0.48 * Math.pow(0.75, hi), start.z + u * 16.0);
            if (hi > prevHop && hi > 0 && hi < hops) {
              prevHop = hi;
              fx.ripple(V(skipStone.position.x, 0.04, skipStone.position.z), { radius: 0.55, life: 1.4, opacity: 0.6 });
            }
          },
          () => skipStone.setEnabled(false)
        );
        ctx.audio?.playFishRipple?.();
        return "水漂一跳两跳三跳……荡开一长串水圈 🪨";
      },
    });
  }

  interactables.push({
    id: "estate-sky-lantern",
    label: "一起放飞孔明灯",
    position: V(2.6, 1.18, 34.6),
    radius: 2.4,
    floorY: 1.18,
    activate(ctx = {}) {
      const L = lanterns[li++ % lanterns.length];
      L.active = true;
      L.age = 0;
      L.mesh.setEnabled(true);
      fx.burst(V(2.6, 2.2, 34.6), { count: 28, colors: [0xffd89c, 0xfff5c0], speed: [0.3, 0.9], up: 0.8, size: 0.075, life: 2.0 });
      ctx.audio?.playRoofChime?.(true);
      return "暖黄的孔明灯载着彼此的心愿缓缓升向夜空 🏮";
    },
  });

  interactables.push({
    id: "estate-heart-balloon",
    label: "放飞爱心气球",
    position: V(22.4, 1.36, 11.9),
    radius: 2.2,
    floorY: 1.36,
    activate(ctx = {}) {
      const B = balloons[bi++ % balloons.length];
      B.active = true;
      B.age = 0;
      B.mesh.setEnabled(true);
      fx.heart(V(22.4, 2.4, 11.9), { count: 30, scale: 0.036 });
      ctx.audio?.playPetalGlissando?.();
      return "粉粉的爱心气球飘向晴空，愿爱意永远轻盈 🎈";
    },
  });

  {
    const [tx, tz] = bistroSites[1];
    interactables.push({
      id: "estate-harbor-bistro-sit",
      label: "在港湾小圆桌边约会",
      position: V(tx, 1.36, tz + 1.75),
      radius: 2.0,
      floorY: 1.36,
      pose: {
        type: "sit",
        seats: [0.4, 2.5].map((ca) => ({
          x: tx + Math.cos(ca) * 0.96,
          y: 1.36 + 0.45,
          z: tz + Math.sin(ca) * 0.96,
          yaw: Math.atan2(Math.cos(ca), Math.sin(ca)),
        })),
      },
      activate(ctx = {}) {
        fx.petalBurst(V(tx + 0.12, 2.31, tz - 0.08), { count: 28, radius: 0.15, up: 1.4, speed: [0.3, 0.8], floorY: 1.38, life: 5 });
        fx.heart(V(tx, 3.06, tz), { count: 36, scale: 0.035 });
        ctx.audio?.playVendingClink?.();
        return "碰杯——海风、阳光和你，刚刚好 🥂";
      },
    });
  }

  interactables.push({
    id: "estate-cafe-espresso",
    label: "坐下来喝一杯咖啡",
    position: V(21.9, 1.38, -8.1),
    radius: 2.0,
    floorY: 1.38,
    pose: {
      type: "sit",
      seats: [
        { x: 20.4, y: 1.85, z: -8.45, yaw: 0 },
        { x: 20.4, y: 1.85, z: -10.55, yaw: Math.PI },
      ],
    },
    activate(ctx = {}) {
      fx.emit(4.5, 22, () => {
        fx.spark(20.4 + (Math.random() - 0.5) * 0.12, 2.2, -9.5 + (Math.random() - 0.5) * 0.06, 0, 0.34, 0, {
          color: 0xf2f2f2,
          life: 1.8,
          size: 0.06,
          drag: 0.2,
        });
      });
      ctx.audio?.playVendingClink?.();
      return "两杯拿铁冒着热气，拉花是一颗心 ☕";
    },
  });

  interactables.push({
    id: "estate-creek-bridge-petals",
    label: "在拱桥上撒下花瓣",
    position: V(8.4, getBridgeDeckY(8.4), -44.0),
    radius: 2.2,
    floorY: getBridgeDeckY(8.4),
    activate(ctx = {}) {
      const flowFn = (p, dt) => {
        p.z += 0.75 * dt;
        p.x += (getCreekCenterX(p.z) + p.wx - p.x) * Math.min(1, dt * 0.8);
        p.y = T(getCreekCenterX(p.z), p.z) + 0.37;
        if (p.z > -26) p.life = Math.min(p.life, 0.5);
      };
      fx.emit(2.6, 36, () => {
        const cx = getCreekCenterX(-44.0);
        fx.petal(cx + (Math.random() - 0.5) * 1.4, getBridgeDeckY(8.4) + 0.8, -44.0 + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.4, -0.3, 0.4, {
          color: Math.random() < 0.5 ? 0xf7b2c6 : 0xffffff,
          life: 14,
          size: 1.2,
          floorY: T(cx, -44.0) + 0.37,
          flowFn,
        });
      });
      ctx.audio?.playPetalGlissando?.();
      return "一把花瓣洒进山涧溪流，顺着水波一路飘向港湾 🌸";
    },
  });

  interactables.push({
    id: "estate-harbor-string-lights",
    label: "点亮港湾串灯",
    position: V(43.0, 1.36, 4.6),
    radius: 2.6,
    floorY: 1.36,
    activate(ctx = {}) {
      bulbLights.lit = !bulbLights.lit;
      bulbLights.chase = bulbLights.lit ? 0 : -1;
      if (bulbLights.lit) {
        fx.burst(V(44.1, hy - 0.3, 5.8), { count: 36, colors: [0xffd98a, 0xfff4d0], speed: [0.6, 1.4], hemi: false, up: 0, gravity: 0.5, size: 0.08, life: 1.4 });
      }
      ctx.audio?.playRoofChime?.(bulbLights.lit);
      return bulbLights.lit ? "一串暖黄的小灯沿着港湾依次亮起 ✨" : "串灯熄灭了，只剩月光与海浪 🌙";
    },
  });

  interactables.push({
    id: "estate-stargaze",
    label: "躺在灯塔下看流星",
    position: V(78.0, 1.38, 13.3),
    radius: 2.2,
    floorY: 1.38,
    pose: {
      type: "lie",
      seats: [
        { x: 77.45, y: 1.42, z: 13.5, yaw: Math.PI },
        { x: 78.55, y: 1.42, z: 13.5, yaw: Math.PI },
      ],
    },
    activate(ctx = {}) {
      for (let m = 0; m < 4; m += 1) {
        const sx = 40 + Math.random() * 60;
        const sy = 34 + Math.random() * 16;
        const sz = 55 + Math.random() * 30;
        const vx = -(18 + Math.random() * 10);
        const vy = -(6 + Math.random() * 4);
        fx.addTask(m * 0.7 + 0.01, () => {}, () => {
          fx.addTask(0.9, (u) => {
            for (let k = 0; k < 3; k += 1) {
              fx.spark(sx + vx * u - vx * 0.012 * k, sy + vy * u - vy * 0.012 * k, sz, 0, 0, 0, {
                color: k === 0 ? 0xffffff : 0xcfe4ff,
                life: 0.55,
                size: 0.85 - k * 0.2,
                drag: 0,
              });
            }
          });
        });
      }
      fx.burst(V(78, 3.0, 13.5), { count: 36, colors: [0xcfe4ff, 0xffffff, 0xfff1c0], speed: [0.3, 0.9], gravity: -0.05, size: 0.07, life: 3.5, flicker: 0.8 });
      ctx.audio?.playDuetArpeggio?.();
      return nightMix > 0.4 ? "一颗流星划过夜空——快许愿！🌠" : "躺在灯塔下看云，等夜里的流星雨 🌠";
    },
  });

  function update(elapsed, dt) {
    hooks.wmBoost = Math.max(0, hooks.wmBoost - dt * 0.18);
    hooks.swingAmpBoost = Math.max(0, hooks.swingAmpBoost - dt * 0.09);
    hooks.swingPhase += dt * 1.4;
    hooks.lhFlash = Math.max(0, hooks.lhFlash - dt * 0.35);
    hooks.boatRockBoost = Math.max(0, hooks.boatRockBoost - dt * 0.16);

    if (lhRotor) {
      const yaw = (elapsed * (0.65 + hooks.lhFlash * 2.2)) % (Math.PI * 2);
      lhRotor.rotationQuaternion = lhBaseQuat.multiply(Quaternion.RotationAxis(_V_UP, yaw));
      beamMat.alpha = lerp(0.035, 0.12, nightMix) + hooks.lhFlash * 0.14;
    }
    if (wmRotor) {
      const spin = (elapsed * (0.55 + hooks.wmBoost * 2.4)) % (Math.PI * 2);
      wmRotor.rotationQuaternion = wmBaseQuat.multiply(Quaternion.RotationAxis(wmAxisX, spin));
    }
    if (gazSwingPivot) {
      const ang = (0.04 + hooks.swingAmpBoost) * Math.sin(hooks.swingPhase);
      gazSwingPivot.rotationQuaternion = gazSwingBaseQuat.multiply(Quaternion.RotationAxis(gazAxisZ, ang));
    }
    const wakeMult = 1 + hooks.boatRockBoost;
    for (let i = 0; i < boats.length; i += 1) {
      const b = boats[i];
      const t = elapsed * 1.15 + b.phase;
      b.mesh.position.y = Math.sin(t * 0.92) * 0.045 * wakeMult;
      b.mesh.rotation.x = Math.sin(t * 1.18) * b.rollAmp * wakeMult;
      b.mesh.rotation.z = Math.cos(t * 0.84) * b.pitchAmp * wakeMult;
    }

    for (let i = 0; i < animators.length; i += 1) animators[i](elapsed, dt);
  }

  return {
    interactables,
    update,
    setNightMix(m) {
      nightMix = clamp(m, 0, 1);
      lampGlowMat.emissiveColor = hexToColor3(0xffb95e).scale(lerp(0.65, 2.2, nightMix));
      for (const gm of gazGlobeMats) {
        if (gm instanceof PBRMaterial) gm.emissiveIntensity = lerp(0.9, 2.8, nightMix);
      }
    },
    reset() {
      hooks.wmBoost = 0;
      hooks.swingAmpBoost = 0;
      hooks.lhFlash = 0;
      hooks.boatRockBoost = 0;
      bulbLights.lit = false;
      bulbLights.chase = -1;
      lanterns.forEach((L) => {
        L.active = false;
        L.mesh.setEnabled(false);
      });
      balloons.forEach((B) => {
        B.active = false;
        B.mesh.setEnabled(false);
      });
      sailState.level = 0;
      sailState.target = 0;
      sailState.hold = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Combined World Entrypoint
// ---------------------------------------------------------------------------

export function buildHarborVillaWorld(scene, { models, shadowGen = null, courtRefs = null } = {}) {
  const worldRoot = new TransformNode("HarborVillaWorld", scene);
  const fx = createInteractionFX(worldRoot, { name: "WorldInteractionFX", maxSparks: 640, maxPetals: 240, maxRings: 20, scene });

  const villa = buildCoastalVillaSection(scene, worldRoot, models, shadowGen, fx);
  const gardens = buildGardensAndPondSection(scene, worldRoot, models, shadowGen, fx);
  const estate = buildEstateAndHarborSection(scene, worldRoot, models, shadowGen, fx, courtRefs);

  const interactables = [...villa.interactables, ...gardens.interactables, ...estate.interactables];

  return {
    root: worldRoot,
    interactables,
    fx,
    setFireBoost: villa.setFireBoost,
    getFireBoost: villa.getFireBoost,
    setNightMix(mix) {
      villa.setNightMix(mix);
      gardens.setNightMix(mix);
      estate.setNightMix(mix);
    },
    update(dt, elapsed) {
      fx.update(dt, elapsed);
      villa.update(elapsed, dt);
      gardens.update(elapsed, dt);
      estate.update(elapsed, dt);
    },
    reset() {
      fx.clear();
      villa.reset();
      gardens.reset();
      estate.reset();
    },
  };
}
