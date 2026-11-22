// Two-Story Coastal Villa Architecture, CC0 Photogrammetry Interiors & Interactive Props.

import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { instantiateGLB } from "./assets-loader.js";
import {
  clamp,
  hexToColor3,
  lerp,
  makePbrMat,
  registerBoxCollider,
  registerCircleCollider,
  registerUprightMeshCollider,
  registerWalkZone,
} from "./world-spatial.js";
import {
  _V_UP,
  applyGLBShadows,
  findDescendantByName,
  findMaterialsInNodes,
  placeNormalizedGLBBatch,
  tuneGLBMaterial,
} from "./glb-helpers.js";

export function buildCoastalVillaSection(scene, root, models, shadowGen, fx) {
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
  }, { priority: 1 }); // The paved courtyard continues underneath the villa platform and steps.

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
  // Each frame spans its whole leaf, including the inset glass. The collision
  // aperture tracks the same model and hinges as the visible animation.
  const syncDoorColliders = ["Villa_FrontDoor_L_Frame", "Villa_FrontDoor_R_Frame"]
    .map(name => findDescendantByName(villaNodes, name)).filter(Boolean).map(registerUprightMeshCollider);
  let appliedDoorAnim = 1; // authored open pose
  const closedDoorQuat = Quaternion.Identity();
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
    if (state.doorAnim !== state.doorTarget) {
      state.doorAnim = lerp(state.doorAnim, state.doorTarget, 1 - Math.exp(-dt * 6));
      if (Math.abs(state.doorAnim - state.doorTarget) < 0.0001) state.doorAnim = state.doorTarget;
    }
    if (state.doorAnim !== appliedDoorAnim) {
      if (frontDoorL) frontDoorL.rotationQuaternion = Quaternion.Slerp(closedDoorQuat, doorLOpenQuat, state.doorAnim);
      if (frontDoorR) frontDoorR.rotationQuaternion = Quaternion.Slerp(closedDoorQuat, doorROpenQuat, state.doorAnim);
      for (const sync of syncDoorColliders) sync();
      appliedDoorAnim = state.doorAnim;
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

