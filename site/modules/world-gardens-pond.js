// Monet Cascading Waterfall Waterlily Pond (Koi, Goldfish, Shrimp) & Bougainvillea Couple Swing Garden.

import "@babylonjs/core/Meshes/thinInstanceMesh";
import { Engine } from "@babylonjs/core/Engines/engine";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { instantiateGLB } from "./assets-loader.js";
import { easeOutBack } from "./flora-and-fx.js";
import {
  POND_CONFIG,
  SWING_CONFIG,
  clamp,
  getPondNormalizedRadius,
  getWorldTerrainY,
  hexToColor3,
  lerp,
  makePbrMat,
  mulberry32,
  registerCircleCollider,
  registerWalkZone,
  smoothstep,
} from "./world-spatial.js";
import {
  applyGLBShadows,
  cloneMaterialSharingTextures,
  collectMeshes,
  createPondRippleNormalTexture,
  createWaterfallRibbonTexture,
  findDescendantByName,
  measureNormalizedContainer,
  placeNormalizedGLBBatch,
  tuneGLBMaterial,
} from "./glb-helpers.js";

export function buildGardensAndPondSection(scene, root, models, shadowGen, fx) {
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

  // Skeletal Ryukin Goldfish, Koi & Freshwater Shrimp (shared textures & deduplicated tint materials)
  const swimmers = [];
  const shrimpActors = [];
  const aquaticMatCache = new Map();

  function getSharedAquaticMat(srcMat, tag, tintHex, extraTune = null) {
    if (!srcMat) return null;
    const isUntintedPart = /eye|pupil|cornea/i.test(srcMat.name || "");
    const effTint = isUntintedPart ? null : tintHex;
    const key = `${srcMat.uniqueId}|${tag}|${effTint ?? "orig"}`;
    let shared = aquaticMatCache.get(key);
    if (!shared) {
      if (effTint === null && !srcMat._aquaticTuned) {
        tuneGLBMaterial(srcMat, { isAquatic: true, tintHex: null });
        srcMat._aquaticTuned = true;
        shared = srcMat;
      } else {
        shared = cloneMaterialSharingTextures(srcMat, `${tag}_${(effTint ?? 0).toString(16)}`);
        tuneGLBMaterial(shared, { isAquatic: true, tintHex: effTint });
        if (extraTune) extraTune(shared);
      }
      aquaticMatCache.set(key, shared);
    }
    return shared;
  }

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
      const tintHex = tints[i % tints.length];
      for (const m of collectMeshes(inst.rootNodes)) {
        m.isPickable = false;
        if (m.material) {
          m.material = getSharedAquaticMat(m.material, "RyukinMat", tintHex, (mat) => {
            if (mat instanceof PBRMaterial) {
              mat.emissiveColor = hexToColor3(0x3a1206);
              mat.emissiveIntensity = 0.14;
            }
          });
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
          m.material = getSharedAquaticMat(m.material, "KoiMat", colHex, (mat) => {
            if (mat instanceof PBRMaterial) {
              mat.emissiveColor = hexToColor3(colHex).scale(0.18);
            }
          });
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
          m.material = getSharedAquaticMat(m.material, "ShrimpMat", hexC);
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
  let swingPivot = findDescendantByName(swingInst?.rootNodes, "Swing_Pivot");
  let swingBaseQuat = swingPivot?.rotationQuaternion?.clone() ?? Quaternion.Identity();
  gRoot.metadata = {
    bindRemodelMotion(pivot, pond, cascade) {
      swingPivot = pivot;
      swingBaseQuat = pivot.rotationQuaternion.clone();
      const pose = interactables.find(item => item.id === "garden-swing-ride").pose;
      pose.attachTo = pivot;
      for (const seat of pose.seats) {
        seat.y = -1.627;
        seat.z = 0.027;
      }
      pond.material.bumpTexture = pondNorm;
      cascade.material.albedoTexture = wfTex;
      cascade.material.useAlphaFromAlbedoTexture = true;
    },
  };

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

  // Watered Flower Sprouts (4 shared bloom materials instead of 24)
  const SPROUTS = 24;
  const sproutCols = [0xffb4c8, 0xffe49e, 0xd8c4ff, 0xffd2b8];
  const sproutBloomMats = sproutCols.map((hex, ci) =>
    makePbrMat(scene, `SpBloomMat_${ci}`, hex, { roughness: 0.56 })
  );
  const sproutPool = [];
  const sproutStemMat = makePbrMat(scene, "SproutStemMat", 0x4b8042, { roughness: 0.72 });
  for (let i = 0; i < SPROUTS; i += 1) {
    const spRoot = new TransformNode(`Sprout_${i}`, scene);
    spRoot.parent = gRoot;
    const stem = MeshBuilder.CreateCylinder(`SpStem_${i}`, { diameter: 0.024, height: 0.24, tessellation: 6 }, scene);
    stem.parent = spRoot;
    stem.position.y = 0.12;
    stem.material = sproutStemMat;
    stem.isPickable = false;
    const bloom = MeshBuilder.CreateSphere(`SpBloom_${i}`, { diameter: 0.14, segments: 8 }, scene);
    bloom.parent = spRoot;
    bloom.position.y = 0.26;
    bloom.material = sproutBloomMats[i % sproutBloomMats.length];
    bloom.isPickable = false;
    spRoot.setEnabled(false);
    sproutPool.push({ node: spRoot, active: false, age: 0, delay: 0, targetS: 1 });
  }
  let sproutCursor = 0;

  // Garden Fireflies (single GPU ThinInstance mesh instead of 44 separate meshes)
  const FIREFLY_COUNT = 44;
  const ffRng = mulberry32(74129);
  const fireflyMat = new StandardMaterial("GardenFireflyMat", scene);
  fireflyMat.emissiveColor = hexToColor3(0xeaff9c);
  fireflyMat.diffuseColor = hexToColor3(0xffffff);
  fireflyMat.disableLighting = true;
  fireflyMat.alphaMode = Engine.ALPHA_ADD;
  fireflyMat.alpha = 0;
  const fireflyOrbMesh = MeshBuilder.CreateSphere("GardenFirefliesThin", { diameter: 0.08, segments: 6 }, scene);
  fireflyOrbMesh.parent = gRoot;
  fireflyOrbMesh.material = fireflyMat;
  fireflyOrbMesh.isPickable = false;
  fireflyOrbMesh.alwaysSelectAsActiveMesh = true;
  fireflyOrbMesh.isVisible = false;
  const fireflyMatBuf = new Float32Array(FIREFLY_COUNT * 16);
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
    Matrix.Translation(bx, by, bz).copyToArray(fireflyMatBuf, i * 16);
    fireflies.push({ bx, by, bz, phase: ffRng() * 6.28, speed: 0.45 + ffRng() * 0.45 });
  }
  fireflyOrbMesh.thinInstanceSetBuffer("matrix", fireflyMatBuf, 16, false);

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

    // Fireflies Motion & Night Brightness (batched GPU ThinInstances)
    const ffVis = Math.max(nightMix, animState.fireflyBoost);
    fireflyMat.alpha = clamp(ffVis * 0.9, 0, 1);
    fireflyOrbMesh.isVisible = ffVis > 0.03;
    if (ffVis > 0.03) {
      for (let i = 0; i < fireflies.length; i += 1) {
        const f = fireflies[i];
        const t = elapsed * f.speed + f.phase;
        const base = i * 16;
        fireflyMatBuf[base + 12] = f.bx + Math.sin(t * 1.1) * 0.35;
        fireflyMatBuf[base + 13] = f.by + Math.sin(t * 1.7) * 0.24;
        fireflyMatBuf[base + 14] = f.bz + Math.cos(t * 0.9) * 0.35;
      }
      fireflyOrbMesh.thinInstanceBufferUpdated("matrix");
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

