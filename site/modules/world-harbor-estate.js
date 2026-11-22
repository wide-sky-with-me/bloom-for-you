// Harbor Quay, Breakwater, Lighthouse, Windmill, Creek Bridge, Boardwalk, Cottages & Sailing Fleet.

import "@babylonjs/core/Meshes/thinInstanceMesh";
import { Engine } from "@babylonjs/core/Engines/engine";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { instantiateGLB } from "./assets-loader.js";
import { easeOutBack } from "./flora-and-fx.js";
import {
  COTTAGE_SPECS,
  clamp,
  getCreekCenterX,
  getGraniteSlabNormalTexture,
  getGraniteSlabTexture,
  getTeakDeckNormalTexture,
  getTeakDeckTexture,
  getWorldTerrainY,
  hexToColor3,
  lerp,
  makePbrMat,
  registerBoxCollider,
  registerCircleCollider,
  registerRotatedBoxCollider,
  registerWalkZone,
  smoothstep,
} from "./world-spatial.js";
import {
  _V_UP,
  applyGLBShadows,
  buildSculptedParasol,
  createExtrudedHeartGeometry,
  findDescendantByName,
  findMaterialsInNodes,
  mergeStaticChildrenByMaterial,
} from "./glb-helpers.js";

export function buildEstateAndHarborSection(scene, root, models, shadowGen, fx, courtRefs) {
  const eRoot = new TransformNode("HarborAndEstateGroup", scene);
  eRoot.parent = root;

  const quayDeckMat = makePbrMat(scene, "HarborQuayGranite", 0xf2e7d2, {
    roughness: 0.58,
    bumpTexture: getGraniteSlabNormalTexture(scene, 18, 22),
    bumpLevel: 0.48,
    specularIntensity: 0.42,
  });
  quayDeckMat.albedoTexture = getGraniteSlabTexture(scene, 18, 22);
  const quayWallMat = makePbrMat(scene, "HarborWallStone", 0xc8bfae, {
    roughness: 0.74,
    bumpTexture: getGraniteSlabNormalTexture(scene, 16, 4),
    bumpLevel: 0.68,
  });
  quayWallMat.albedoTexture = getGraniteSlabTexture(scene, 16, 4);
  const copingMat = makePbrMat(scene, "HarborCoping", 0xeee5d5, {
    roughness: 0.58,
    bumpTexture: getGraniteSlabNormalTexture(scene, 6, 6),
    bumpLevel: 0.32,
  });
  const compassBlueMat = makePbrMat(scene, "HarborCompassBlue", 0x265e9e, {
    roughness: 0.40,
    specularIntensity: 0.55,
  });
  const flowerRoseMat = makePbrMat(scene, "HarborPlazaRose", 0xf27ca2, { roughness: 0.68 });
  const foliageGreenMat = makePbrMat(scene, "HarborPlazaLeaf", 0x3b8f42, { roughness: 0.72 });
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

  // Fontaine Star-Compass Plaza Medallion @ (35.5, 1.36, 1.5) — strictly stacked in Y (zero overlap/Z-fighting)
  const plazaX = 35.5;
  const plazaZ = 1.5;
  addCyl("QuayCompassOuterBase", plazaX, 1.370, plazaZ, 11.6, 11.8, 0.012, copingMat, eRoot, 36);
  addCyl("QuayCompassBlueInlay", plazaX, 1.381, plazaZ, 9.4, 9.4, 0.010, compassBlueMat, eRoot, 36);
  addCyl("QuayCompassInnerCream", plazaX, 1.391, plazaZ, 6.8, 6.8, 0.010, copingMat, eRoot, 32);
  for (let ri = 0; ri < 8; ri += 1) {
    const ang = (ri / 8) * Math.PI * 2;
    const isMajor = ri % 2 === 0;
    const len = isMajor ? 8.6 : 6.4;
    const wid = isMajor ? 0.24 : 0.14;
    addBox(`QuayCompassRay_${ri}`, plazaX, 1.400, plazaZ, wid, 0.008, len, brassMat, eRoot, ang);
  }
  addCyl("QuayCompassCenterBlue", plazaX, 1.408, plazaZ, 2.6, 2.6, 0.008, compassBlueMat, eRoot, 24);
  addCyl("QuayCompassCenterBrass", plazaX, 1.415, plazaZ, 1.15, 1.25, 0.006, brassMat, eRoot, 16);
  for (let ui = 0; ui < 4; ui += 1) {
    const uAng = (ui / 4) * Math.PI * 2 + Math.PI * 0.25;
    const ux = plazaX + Math.cos(uAng) * 6.5;
    const uz = plazaZ + Math.sin(uAng) * 6.5;
    registerCircleCollider(ux, uz, 0.56);
    addBox(`QuayUrnBase_${ui}`, ux, 1.42, uz, 0.96, 0.10, 0.96, copingMat);
    addBox(`QuayUrnPed_${ui}`, ux, 1.68, uz, 0.78, 0.44, 0.78, quayWallMat);
    addBox(`QuayUrnCap_${ui}`, ux, 1.92, uz, 0.94, 0.08, 0.94, copingMat);
    addCyl(`QuayUrnBowl_${ui}`, ux, 2.12, uz, 0.96, 0.56, 0.36, quayWallMat);
    addCyl(`QuayUrnRim_${ui}`, ux, 2.31, uz, 1.02, 0.98, 0.05, brassMat, eRoot, 16);
    for (let li = 0; li < 6; li += 1) {
      const la = (li / 6) * Math.PI * 2 + ui * 0.5;
      const leafLobe = MeshBuilder.CreateSphere(`QuayUrnFoliage_${ui}_${li}`, { diameter: 0.48, segments: 8 }, scene);
      leafLobe.parent = eRoot;
      leafLobe.position.set(ux + Math.cos(la) * 0.24, 2.48 + (li % 2) * 0.06, uz + Math.sin(la) * 0.24);
      leafLobe.scaling.set(1.15, 0.72, 1.15);
      leafLobe.material = foliageGreenMat;
      leafLobe.isPickable = false;
    }
    const crownLeaf = MeshBuilder.CreateSphere(`QuayUrnFoliageTop_${ui}`, { diameter: 0.56, segments: 8 }, scene);
    crownLeaf.parent = eRoot;
    crownLeaf.position.set(ux, 2.58, uz);
    crownLeaf.scaling.set(1.05, 0.76, 1.05);
    crownLeaf.material = foliageGreenMat;
    crownLeaf.isPickable = false;
    // Layered stylized multi-petal blossom clusters nestled directly into the foliage dome
    const bouquetOffsets = [[0, 0, 2.78, 0]];
    for (let bi = 0; bi < 6; bi += 1) {
      const ba = (bi / 6) * Math.PI * 2 + ui * 0.4;
      bouquetOffsets.push([Math.cos(ba) * 0.22, Math.sin(ba) * 0.22, 2.64 + (bi % 2) * 0.05, bi + 1]);
    }
    for (const [dx, dz, fy, bi] of bouquetOffsets) {
      const fx = ux + dx;
      const fz = uz + dz;
      const petalMat = bi % 2 === 0 ? flowerRoseMat : creamCanvas;
      for (let pi = 0; pi < 5; pi += 1) {
        const pa = (pi / 5) * Math.PI * 2 + bi * 0.5;
        const pet = MeshBuilder.CreateSphere(`QuayUrnPetal_${ui}_${bi}_${pi}`, { diameter: 0.135, segments: 6 }, scene);
        pet.parent = eRoot;
        pet.position.set(fx + Math.cos(pa) * 0.068, fy, fz + Math.sin(pa) * 0.068);
        pet.scaling.set(1.1, 0.52, 0.88);
        pet.rotation.y = -pa;
        pet.rotation.z = 0.24;
        pet.material = petalMat;
        pet.isPickable = false;
      }
      const center = MeshBuilder.CreateSphere(`QuayUrnDisc_${ui}_${bi}`, { diameter: 0.085, segments: 6 }, scene);
      center.parent = eRoot;
      center.position.set(fx, fy + 0.025, fz);
      center.scaling.set(1.0, 0.65, 1.0);
      center.material = brassMat;
      center.isPickable = false;
    }
  }

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
  for (let si = 0; si < 6; si += 1) {
    const sx = cafeX - 3.75 + si * 1.5;
    addBox(`CafeAwning_${si}`, sx, 4.92, cafeZ, 1.48, 0.025, 9.1, si % 2 === 0 ? creamCanvas : stripeBlueMat);
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
  beamMat.fogEnabled = false;
  beamMat.disableDepthWrite = true;
  beamMat.alpha = 0.0;
  beamMat.alphaMode = Engine.ALPHA_ADD;
  beamMat.backFaceCulling = false;
  const lhBeams = [];
  if (lhRotor) {
    for (const s of [-1, 1]) {
      const cone = MeshBuilder.CreateCylinder(`LHBeam_${s}`, { diameterTop: 0.18, diameterBottom: 3.8, height: 42, tessellation: 14 }, scene);
      cone.parent = lhRotor;
      cone.position.set(s * 21.2, 0.15, 0);
      cone.rotation.z = s * Math.PI * 0.5;
      cone.material = beamMat;
      cone.isPickable = false;
      cone.isVisible = false;
      lhBeams.push(cone);
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
  let wmRotor = findDescendantByName(wmInst?.rootNodes, "Windmill_Rotor");
  let wmBaseQuat = wmRotor?.rotationQuaternion?.clone() ?? Quaternion.Identity();
  const wmAxisX = new Vector3(1, 0, 0);
  eRoot.metadata = {
    bindRemodelMotion(rotor, wickY) {
      wmRotor = rotor;
      wmBaseQuat = rotor.rotationQuaternion.clone();
      // The remodel wick is higher than the classic revolving lens. Keep its
      // night/flash control and rotate the cones around the surveyed lamp axis.
      for (const beam of lhBeams) {
        const offset = wickY - beam.computeWorldMatrix(true).getTranslation().y;
        beam.position.y += offset;
      }
    },
  };

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
    if (targetBoat) {
      targetBoat.parent = bWrap;
      for (const rootN of [...(inst?.rootNodes || [])]) {
        for (const ch of [...(rootN.getChildren?.() || [])]) {
          if (ch !== targetBoat) ch.dispose(false, false);
        }
        if (rootN !== targetBoat) rootN.dispose(false, false);
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
  const bulbLights = { lit: false, chase: -1, lastDusk: -1 };
  const bulbSharedMat = new StandardMaterial("FestoonBulbsSharedMat", scene);
  bulbSharedMat.disableLighting = true;
  bulbSharedMat.emissiveColor = new Color3(1, 1, 1);
  bulbSharedMat.diffuseColor = new Color3(1, 1, 1);
  const bulbThinProto = MeshBuilder.CreateSphere("FestoonBulbsThin", { diameter: 0.13, segments: 8 }, scene);
  bulbThinProto.parent = eRoot;
  bulbThinProto.material = bulbSharedMat;
  bulbThinProto.isPickable = false;
  bulbThinProto.alwaysSelectAsActiveMesh = true;
  const bulbMatBuf = new Float32Array(bulbPts.length * 16);
  const bulbColBuf = new Float32Array(bulbPts.length * 4);
  for (let i = 0; i < bulbPts.length; i += 1) {
    const socket = MeshBuilder.CreateCylinder(`StrSocket_${i}`, { diameter: 0.045, height: 0.06, tessellation: 8 }, scene);
    socket.parent = eRoot;
    socket.position.set(bulbPts[i].x, bulbPts[i].y + 0.065, bulbPts[i].z);
    socket.material = strBrassMat;
    socket.isPickable = false;
    Matrix.Translation(bulbPts[i].x, bulbPts[i].y, bulbPts[i].z).copyToArray(bulbMatBuf, i * 16);
    bulbColBuf[i * 4 + 0] = 0.56;
    bulbColBuf[i * 4 + 1] = 0.45;
    bulbColBuf[i * 4 + 2] = 0.28;
    bulbColBuf[i * 4 + 3] = 1.0;
  }
  bulbThinProto.thinInstanceSetBuffer("matrix", bulbMatBuf, 16, true);
  bulbThinProto.thinInstanceSetBuffer("color", bulbColBuf, 4, false);

  // Batch all purely static procedural quay, boardwalk, cafe, urn, seawall & festoon-hardware meshes by material
  const protectedDynamicAncestors = new Set([
    deckParasol,
    lhAnchor,
    wmAnchor,
    bridgeAnchor,
    gazAnchor,
    sloopSail,
    ...boats.map((b) => b.mesh),
  ]);
  const isUnderProtectedAncestor = (m) => {
    let cur = m;
    while (cur) {
      if (protectedDynamicAncestors.has(cur) || cur.name?.startsWith("Cottage_")) return true;
      cur = cur.parent;
    }
    return false;
  };
  mergeStaticChildrenByMaterial(eRoot, scene, {
    namePrefix: "HarborStaticBatch",
    castShadows: false,
    shadowGen,
    filterMesh: (m) => m !== bulbThinProto && !isUnderProtectedAncestor(m),
  });

  animators.push((elapsed, dt) => {
    if (bulbLights.lit && bulbLights.chase < bulbPts.length) bulbLights.chase += dt * 22;
    const duskBase = smoothstep(0.25, 0.95, nightMix) * 0.65;
    if (!bulbLights.lit && Math.abs(duskBase - bulbLights.lastDusk) < 0.003) return;
    bulbLights.lastDusk = bulbLights.lit ? -1 : duskBase;
    for (let i = 0; i < bulbPts.length; i += 1) {
      const active = bulbLights.lit && bulbLights.chase >= i;
      const lvl = Math.max(0.32, active ? 0.92 + 0.12 * Math.sin(elapsed * 3 + i * 1.7) : duskBase);
      bulbColBuf[i * 4 + 0] = Math.min(1.0, 1.0 * lvl + 0.18);
      bulbColBuf[i * 4 + 1] = Math.min(1.0, 0.82 * lvl + 0.14);
      bulbColBuf[i * 4 + 2] = Math.min(1.0, 0.48 * lvl + 0.09);
      bulbColBuf[i * 4 + 3] = 1.0;
    }
    bulbThinProto.thinInstanceBufferUpdated("color");
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
        (ctx.audio?.playTramBell ?? ctx.audio?.playBicycleBell)?.();
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
      const beamAlpha = Math.max(0, (nightMix - 0.06) / 0.94) * 0.12 + hooks.lhFlash * 0.14;
      beamMat.alpha = beamAlpha;
      const showBeam = beamAlpha > 0.008;
      for (const cone of lhBeams) cone.isVisible = showBeam;
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

