// Coastal Peninsula 280m Multi-Biome Terrain, Mountain Creek Ribbon, Paved Courtyards & Trails,
// Photogrammetry Cliffs & Boulders, Distant Mountain Amphitheater, Archipelago Islands & Outer-Bay Fleet.

import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Material } from "@babylonjs/core/Materials/material";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import {
  clamp,
  lerp,
  smoothstep,
  fbm2,
  mulberry32,
  hexToColor3,
  getWorldTerrainY,
  getTerrainMeshY,
  getTerrainNormal,
  getCreekCenterX,
  getPondNormalizedRadius,
  registerWalkZone,
  registerBoxCollider,
  registerCircleCollider,
  WEST_GAZEBO_TRAIL,
  NORTH_WINDMILL_TRAIL,
  EAST_HARBOR_BRIDGE_TRAIL,
  COTTAGE_SPUR_TRAILS,
  makePbrMat,
  getGraniteSlabTexture,
  getMeadowGroundTexture,
} from "./world-spatial.js";
import { instantiateGLB } from "./assets-loader.js";

function samplePolyline(waypoints, spacing) {
  const segLens = [];
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const d = Math.hypot(waypoints[i + 1][0] - waypoints[i][0], waypoints[i + 1][1] - waypoints[i][1]);
    segLens.push(d);
    total += d;
  }
  const steps = Math.max(4, Math.floor(total / spacing));
  const out = [];
  for (let s = 0; s <= steps; s += 1) {
    let target = (s / steps) * total;
    for (let i = 0; i < segLens.length; i += 1) {
      if (target <= segLens[i] || i === segLens.length - 1) {
        const u = segLens[i] > 1e-4 ? clamp(target / segLens[i], 0, 1) : 0;
        const x = lerp(waypoints[i][0], waypoints[i + 1][0], u);
        const z = lerp(waypoints[i][1], waypoints[i + 1][1], u);
        const yaw = Math.atan2(waypoints[i + 1][0] - waypoints[i][0], waypoints[i + 1][1] - waypoints[i][1]);
        out.push({ x, z, yaw });
        break;
      }
      target -= segLens[i];
    }
  }
  return out;
}

function buildPeninsulaTerrain(scene, root, shadowGen) {
  const segs = 224;
  const size = 280;
  const count = (segs + 1) * (segs + 1);
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const colors = new Float32Array(count * 4);

  let vi = 0;
  for (let r = 0; r <= segs; r += 1) {
    const vz = r / segs;
    const z = (vz - 0.5) * size;
    for (let c = 0; c <= segs; c += 1) {
      const ux = c / segs;
      const x = (ux - 0.5) * size;
      const y = getTerrainMeshY(x, z);
      positions[vi * 3 + 0] = x;
      positions[vi * 3 + 1] = y;
      positions[vi * 3 + 2] = z;
      uvs[vi * 2 + 0] = ux;
      uvs[vi * 2 + 1] = vz;
      vi += 1;
    }
  }

  const indices = new Uint32Array(segs * segs * 6);
  let ii = 0;
  for (let r = 0; r < segs; r += 1) {
    for (let c = 0; c < segs; c += 1) {
      const a = r * (segs + 1) + c;
      const b = a + 1;
      const cc = (r + 1) * (segs + 1) + c;
      const d = cc + 1;
      indices[ii++] = a;
      indices[ii++] = cc;
      indices[ii++] = b;
      indices[ii++] = b;
      indices[ii++] = cc;
      indices[ii++] = d;
    }
  }

  const normals = new Float32Array(count * 3);
  VertexData.ComputeNormals(positions, indices, normals, { useRightHandedSystem: true });

  const cDeepBed = hexToColor3(0x687572);
  const cShallowBed = hexToColor3(0x98927c);
  const cWetSand = hexToColor3(0xb8a17c);
  const cDrySand = hexToColor3(0xdfd0b0);
  const cCliffLight = hexToColor3(0x5e5850);
  const cCliffDark = hexToColor3(0x413d38);
  const cGrassMid = hexToColor3(0x577c42);
  const cGrassSun = hexToColor3(0x698d4c);
  const cGrassDeep = hexToColor3(0x4b6e3a);
  const cCreekCobble = hexToColor3(0x74776c);
  const cQuayUnder = hexToColor3(0x9e988e);
  const cPondBed = hexToColor3(0xcbe2d9);

  for (let i = 0; i < count; i += 1) {
    const x = positions[i * 3 + 0];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const ny = normals[i * 3 + 1];
    const n1 = fbm2(x, z);
    const n2 = fbm2(x * 2.3 + 19.0, z * 2.3 - 11.0);
    const inQuay = x >= 8.0 && x <= 46.5 && z >= -26.2 && z <= 22.4;
    const onSouthBeach = z > 15.0 || (z > 9.0 && x < 9.5);

    let col;
    if (y < -0.25) {
      col = Color3.Lerp(cShallowBed, cDeepBed, smoothstep(-0.25, -4.4, y));
    } else if (y < 1.55 && !inQuay && onSouthBeach) {
      col = Color3.Lerp(cWetSand, cDrySand, smoothstep(-0.25, 1.38, y));
      if (y > 1.15) {
        const gm = Color3.Lerp(cGrassMid, cGrassSun, clamp(n1 * 0.5 + 0.5, 0, 1));
        col = Color3.Lerp(col, gm, smoothstep(1.15, 1.55, y));
      }
    } else if (y < 1.35 && !inQuay) {
      col = Color3.Lerp(cCliffDark, cGrassDeep, smoothstep(-0.25, 1.25, y));
    } else if (inQuay && y < 1.52) {
      col = cQuayUnder.clone();
    } else {
      const sunMix = clamp(0.5 + n1 * 0.65, 0, 1);
      const shadeMix = clamp(0.35 - n2 * 0.5 + smoothstep(6.0, 16.0, y) * 0.22, 0, 1);
      col = Color3.Lerp(Color3.Lerp(cGrassMid, cGrassSun, sunMix), cGrassDeep, shadeMix * 0.62);
    }

    if (z >= -112.0 && z <= -23.5) {
      const dCreek = Math.abs(x - getCreekCenterX(z));
      if (dCreek < 4.4) {
        col = Color3.Lerp(col, cCreekCobble, (1.0 - smoothstep(1.8, 4.4, dCreek)) * 0.85);
      }
    }
    if (ny < 0.7 && y > -1.8) {
      const rockW = smoothstep(0.7, 0.42, ny);
      const strata = 0.5 + 0.5 * Math.sin(y * 0.9 + n2 * 4.5);
      col = Color3.Lerp(col, Color3.Lerp(cCliffDark, cCliffLight, strata), rockW);
    }
    const rPond = getPondNormalizedRadius(x, z);
    if (rPond < 1.12) {
      const pt = 1.0 - smoothstep(0.76, 1.12, rPond);
      col = Color3.Lerp(col, Color3.Lerp(cPondBed, cDrySand, 0.35 + 0.2 * n2), pt * 0.92);
    }

    colors[i * 4 + 0] = col.r;
    colors[i * 4 + 1] = col.g;
    colors[i * 4 + 2] = col.b;
    colors[i * 4 + 3] = 1.0;
  }

  const terrain = new Mesh("CoastalPeninsulaTerrain", scene);
  terrain.parent = root;
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.uvs = uvs;
  vd.colors = colors;
  vd.indices = indices;
  vd.applyToMesh(terrain, false);
  terrain.overrideMaterialSideOrientation = Material.CounterClockWiseSideOrientation;

  terrain.material = makePbrMat("PeninsulaTerrainMat", scene, {
    color: 0xffffff,
    roughness: 0.88,
    metallic: 0.02,
    albedoTexture: getMeadowGroundTexture(scene, 48, 48),
    useVertexColors: true,
  });
  terrain.receiveShadows = true;
  if (shadowGen) shadowGen.addShadowCaster(terrain, false);

  // North Mountain Creek Water Ribbon (Z in [-110, -24.5])
  const cSteps = 68;
  const cPos = [];
  const cUvs = [];
  const cIdx = [];
  for (let i = 0; i <= cSteps; i += 1) {
    const z = lerp(-110, -24.5, i / cSteps);
    const cx = getCreekCenterX(z);
    const y = Math.max(0.25, getWorldTerrainY(cx, z) + 0.34);
    const hw = 2.05 + 0.35 * Math.sin(i * 0.5);
    cPos.push(cx - hw, y, z, cx + hw, y, z);
    cUvs.push(0, i * 0.35, 1, i * 0.35);
    if (i < cSteps) {
      const a = i * 2;
      cIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const cNorm = new Array(cPos.length).fill(0);
  VertexData.ComputeNormals(cPos, cIdx, cNorm, { useRightHandedSystem: true });
  const creekMesh = new Mesh("MountainCreekWater", scene);
  creekMesh.parent = root;
  const cvd = new VertexData();
  cvd.positions = cPos;
  cvd.normals = cNorm;
  cvd.uvs = cUvs;
  cvd.indices = cIdx;
  cvd.applyToMesh(creekMesh, false);
  const creekMat = makePbrMat("CreekWaterMat", scene, {
    color: 0x5fb4b8,
    roughness: 0.14,
    metallic: 0.06,
    alpha: 0.84,
    doubleSided: true,
  });
  creekMesh.material = creekMat;
  creekMesh.isPickable = false;
  return { terrain, creekMat };
}

function buildCourtyardAndTrails(scene, root) {
  const sec = new TransformNode("VillaCourtyardAndTrails", scene);
  sec.parent = root;

  const flagstoneMat = makePbrMat("FlagstoneMat", scene, {
    color: 0xdcd3c1,
    roughness: 0.78,
    albedoTexture: getGraniteSlabTexture(scene, 8, 4),
  });
  const limestoneMat = makePbrMat("CourtyardLimestoneMat", scene, { color: 0xe5dfd2, roughness: 0.74 });
  const ironMat = makePbrMat("CourtyardIronMat", scene, { color: 0x222629, roughness: 0.42, metallic: 0.82 });
  const brassMat = makePbrMat("CourtyardBrassMat", scene, { color: 0xcba358, roughness: 0.25, metallic: 0.88 });
  const bulbMat = makePbrMat("PathBollardGlowMat", scene, {
    color: 0xfff0cc,
    emissive: 0xffb85c,
    emissiveIntensity: 0.45,
    roughness: 0.25,
  });

  // Walk Zones for Courtyard + East Steps down to Harbor Quay
  registerWalkZone((x, z) => {
    if (x >= -20.0 && x <= 4.0 && z >= 6.8 && z <= 12.2) return 2.22;
    if (x >= -16.0 && x <= 2.0 && z >= 1.8 && z <= 7.0) return 2.21;
    if (x >= 2.0 && x <= 10.2 && z >= 1.8 && z <= 7.0) {
      return lerp(2.22, 1.38, smoothstep(2.0, 10.2, x));
    }
    return null;
  });

  const courtSlab = CreateBox("CourtyardFlagstoneSlab", { width: 21.5, height: 0.16, depth: 5.4 }, scene);
  courtSlab.position.set(-9.25, 2.14, 9.5);
  courtSlab.material = flagstoneMat;
  courtSlab.parent = sec;
  courtSlab.receiveShadows = true;

  const apron = CreateBox("CourtyardFountainApron", { width: 18.0, height: 0.15, depth: 5.2 }, scene);
  apron.position.set(-7.0, 2.135, 4.4);
  apron.material = flagstoneMat;
  apron.parent = sec;
  apron.receiveShadows = true;

  for (const [bx, bz, bw, bd] of [
    [-9.25, 12.26, 21.7, 0.18],
    [1.56, 9.5, 0.18, 5.56],
  ]) {
    const curb = CreateBox("CourtCurb", { width: bw, height: 0.2, depth: bd }, scene);
    curb.position.set(bx, 2.16, bz);
    curb.material = limestoneMat;
    curb.parent = sec;
  }

  for (let i = 0; i < 11; i += 1) {
    const u = (i + 0.5) / 11;
    const xm = lerp(2.0, 10.9, u);
    const stepY = i === 10 ? 1.4 : Math.max(lerp(2.22, 1.4, smoothstep(0, 1, u)), getWorldTerrainY(xm, 4.4) + 0.08);
    const st = CreateBox(`QuayStep_${i}`, { width: 0.92, height: 0.34, depth: 5.2 }, scene);
    st.position.set(xm, stepY - 0.16, 4.4);
    st.material = limestoneMat;
    st.parent = sec;
    st.receiveShadows = true;
  }

  // Flagstone Stepping Stones along all Scenic Trails (ThinInstanced!)
  const rng = mulberry32(3107);
  const stoneProto = CreateCylinder("TrailSteppingStoneProto", { diameterTop: 1.24, diameterBottom: 1.36, height: 0.1, tessellation: 7 }, scene);
  stoneProto.material = limestoneMat;
  stoneProto.parent = sec;
  stoneProto.receiveShadows = true;

  const monetWalkCoords = [
    ...Array.from({ length: 11 }, (_, k) => [-14.0 + Math.sin(k * 0.6) * 0.25, 12.4 + k * 0.98]),
    [-12.2, 14.8], [-10.4, 16.0], [-8.6, 17.2], [-6.8, 18.2], [-5.0, 19.2],
  ];
  const stoneWaylists = [
    WEST_GAZEBO_TRAIL,
    NORTH_WINDMILL_TRAIL,
    EAST_HARBOR_BRIDGE_TRAIL,
    ...COTTAGE_SPUR_TRAILS,
  ];
  const allStones = [];
  const tmpNrm = new Vector3();
  for (const wl of stoneWaylists) {
    for (const pt of samplePolyline(wl, 1.18)) {
      if (pt.x > 3.1 && pt.x < 13.7 && Math.abs(pt.z + 44.0) < 2.2) continue;
      const ty = getWorldTerrainY(pt.x, pt.z);
      getTerrainNormal(pt.x, pt.z, tmpNrm);
      const m = Matrix.Scaling(0.88 + rng() * 0.22, 1.0, 0.76 + rng() * 0.22)
        .multiply(Matrix.RotationY(pt.yaw + (rng() - 0.5) * 0.45))
        .multiply(Matrix.Translation(pt.x, ty + 0.02, pt.z));
      allStones.push(m);
    }
  }
  for (let i = 0; i < monetWalkCoords.length; i += 1) {
    const [sx, sz] = monetWalkCoords[i];
    allStones.push(
      Matrix.Scaling(0.8, 1.0, 0.6)
        .multiply(Matrix.RotationY(i * 0.45))
        .multiply(Matrix.Translation(sx, 2.2, sz))
    );
  }
  if (allStones.length > 0) {
    const buf = new Float32Array(allStones.length * 16);
    for (let i = 0; i < allStones.length; i += 1) allStones[i].copyToArray(buf, i * 16);
    stoneProto.thinInstanceSetBuffer("matrix", buf, 16, true);
  } else {
    stoneProto.setEnabled(false);
  }

  // Tiered Limestone Courtyard Fountain (-4.8, 2.22, 9.5)
  const ftnRoot = new TransformNode("CourtyardFountain", scene);
  ftnRoot.position.set(-4.8, 2.22, 9.5);
  ftnRoot.parent = sec;
  registerCircleCollider(-4.8, 9.5, 2.22, 1.5, 5.0);
  const fPool = CreateTorus("FountainBasinRim", { diameter: 3.9, thickness: 0.34, tessellation: 28 }, scene);
  fPool.position.y = 0.28;
  fPool.material = limestoneMat;
  fPool.parent = ftnRoot;
  const fWater = CreateCylinder("FountainWater", { diameter: 3.65, height: 0.08, tessellation: 24 }, scene);
  fWater.position.y = 0.42;
  fWater.material = makePbrMat("FtnWaterMat", scene, { color: 0x5ab8bc, roughness: 0.12, alpha: 0.8 });
  fWater.parent = ftnRoot;
  const fPed = CreateCylinder("FountainPedestal", { diameterTop: 0.44, diameterBottom: 0.62, height: 1.85, tessellation: 14 }, scene);
  fPed.position.y = 0.95;
  fPed.material = limestoneMat;
  fPed.parent = ftnRoot;
  const fBowl = CreateCylinder("FountainUpperBowl", { diameterTop: 1.55, diameterBottom: 0.36, height: 0.34, tessellation: 18 }, scene);
  fBowl.position.y = 1.82;
  fBowl.material = limestoneMat;
  fBowl.parent = ftnRoot;

  // Cast-Iron French Mailbox (-10.8, 2.22, 9.4)
  const mailbox = new TransformNode("CourtyardMailbox", scene);
  mailbox.position.set(-10.8, 2.22, 9.4);
  mailbox.rotation.y = 0.18;
  mailbox.parent = sec;
  registerCircleCollider(-10.8, 9.4, 0.42);
  const mbPost = CreateCylinder("MailboxPost", { diameter: 0.11, height: 1.15, tessellation: 10 }, scene);
  mbPost.position.y = 0.575;
  mbPost.material = ironMat;
  mbPost.parent = mailbox;
  const mbBody = CreateBox("MailboxBody", { width: 0.28, height: 0.26, depth: 0.44 }, scene);
  mbBody.position.y = 1.24;
  mbBody.material = makePbrMat("MailboxRedMat", scene, { color: 0xc2384c, roughness: 0.36, metallic: 0.45 });
  mbBody.parent = mailbox;
  const flagPivot = new TransformNode("MailboxFlagPivot", scene);
  flagPivot.position.set(0.155, 1.24, 0.1);
  flagPivot.parent = mailbox;
  const mbFlag = CreateBox("MailboxFlag", { width: 0.02, height: 0.22, depth: 0.08 }, scene);
  mbFlag.position.set(0, 0.09, 0);
  mbFlag.material = brassMat;
  mbFlag.parent = flagPivot;

  // Vintage Cream Bicycle (-18.6, 2.22, 9.6)
  const bike = new TransformNode("CourtyardBicycle", scene);
  bike.position.set(-18.6, 2.22, 9.6);
  bike.rotation.y = 0.48;
  bike.parent = sec;
  registerCircleCollider(-18.6, 9.6, 0.65);
  const creamPaint = makePbrMat("BikeCreamMat", scene, { color: 0xf4ece0, roughness: 0.34, metallic: 0.32 });
  const chromeMat = makePbrMat("BikeChromeMat", scene, { color: 0xd8dce0, roughness: 0.22, metallic: 0.88 });
  const saddleMat = makePbrMat("BikeSaddleMat", scene, { color: 0x7c4a2b, roughness: 0.56 });
  const basketMat = makePbrMat("BikeBasketMat", scene, { color: 0xb88b58, roughness: 0.84 });
  const tireMat = makePbrMat("BikeTireMat", scene, { color: 0x262422, roughness: 0.85 });
  const wheels = [];
  for (const wx of [-0.50, 0.50]) {
    const whNode = new TransformNode(`BikeWheelNode_${wx}`, scene);
    whNode.parent = bike;
    whNode.position.set(wx, 0.33, 0);
    const wh = CreateTorus(`BikeWheel_${wx}`, { diameter: 0.62, thickness: 0.052, tessellation: 24 }, scene);
    wh.rotation.x = Math.PI * 0.5;
    wh.material = tireMat;
    wh.parent = whNode;
    const rim = CreateTorus(`BikeRim_${wx}`, { diameter: 0.54, thickness: 0.022, tessellation: 24 }, scene);
    rim.rotation.x = Math.PI * 0.5;
    rim.material = chromeMat;
    rim.parent = whNode;
    const hub = CreateCylinder(`BikeHub_${wx}`, { diameter: 0.06, height: 0.08, tessellation: 10 }, scene);
    hub.rotation.x = Math.PI * 0.5;
    hub.material = chromeMat;
    hub.parent = whNode;
    for (let s = 0; s < 4; s += 1) {
      const spk = CreateCylinder(`BikeSpoke_${wx}_${s}`, { diameter: 0.012, height: 0.54, tessellation: 6 }, scene);
      spk.rotation.z = (s * Math.PI) / 4;
      spk.material = chromeMat;
      spk.parent = whNode;
    }
    wheels.push(whNode);
  }
  // Tubular diamond frame + fork + handlebars + leather saddle + front floral basket
  const bikeTubes = [
    [-0.14, 0.34, 0.50, -0.26, 0.72, 0.042, creamPaint],
    [-0.24, 0.68, 0.0, 0.28, 0.74, 0.040, creamPaint],
    [-0.14, 0.34, 0.0, 0.28, 0.72, 0.040, creamPaint],
    [-0.50, 0.33, 0.0, -0.24, 0.68, 0.028, creamPaint],
    [-0.50, 0.33, 0.0, -0.14, 0.34, 0.028, creamPaint],
    [0.50, 0.33, 0.0, 0.28, 0.76, 0.036, creamPaint],
    [0.28, 0.76, 0.0, 0.24, 0.94, 0.030, chromeMat],
    [-0.26, 0.72, 0.0, -0.28, 0.80, 0.030, chromeMat],
  ];
  bikeTubes.forEach(([x0, y0, _, x1, y1, diam, mat], ti) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const bar = CreateCylinder(`BikeBar_${ti}`, { diameter: diam, height: len, tessellation: 10 }, scene);
    bar.position.set(0.5 * (x0 + x1), 0.5 * (y0 + y1), 0);
    bar.rotation.z = Math.atan2(-(x1 - x0), y1 - y0);
    bar.material = mat;
    bar.parent = bike;
  });
  const handlebar = CreateCylinder("BikeHandlebar", { diameter: 0.026, height: 0.44, tessellation: 10 }, scene);
  handlebar.position.set(0.24, 0.94, 0);
  handlebar.rotation.x = Math.PI * 0.5;
  handlebar.material = chromeMat;
  handlebar.parent = bike;
  const saddle = CreateBox("BikeSaddle", { width: 0.22, height: 0.06, depth: 0.14 }, scene);
  saddle.position.set(-0.29, 0.81, 0);
  saddle.material = saddleMat;
  saddle.parent = bike;
  const basket = CreateCylinder("BikeBasket", { diameterTop: 0.28, diameterBottom: 0.20, height: 0.20, tessellation: 12 }, scene);
  basket.position.set(0.39, 0.78, 0);
  basket.material = basketMat;
  basket.parent = bike;
  const basketBloom = CreateSphere("BikeBasketBloom", { diameter: 0.18, segments: 8 }, scene);
  basketBloom.position.set(0.39, 0.90, 0);
  basketBloom.material = makePbrMat("BikeBloomMat", scene, { color: 0xf4a8c2, roughness: 0.65 });
  basketBloom.parent = bike;
  const bell = CreateSphere("BikeBell", { diameter: 0.065, segments: 8 }, scene);
  bell.position.set(0.24, 0.97, 0.11);
  bell.material = brassMat;
  bell.parent = bike;

  // Pathway Bollard Lamps along Trails & Garden Perimeter (ThinInstance posts + glow bulbs)
  const bollardCoords = [
    [-12.6, 13.0], [-15.4, 15.8], [-12.6, 19.2], [-15.4, 21.8],
    [-25.5, 11.8], [-25.5, 16.5], [-31.5, 11.8],
    [-33.0, 4.5], [-43.5, 14.0], [-53.0, 25.5], [-58.5, 36.5],
    [-4.0, -21.0], [1.6, -35.5], [-5.0, -48.5], [-23.0, -56.0], [-44.8, -62.8],
  ];
  const bPost = CreateCylinder("BollardPostProto", { diameterTop: 0.14, diameterBottom: 0.18, height: 0.65, tessellation: 8 }, scene);
  bPost.material = ironMat;
  bPost.parent = sec;
  const bBulb = CreateSphere("BollardBulbProto", { diameter: 0.12, segments: 8 }, scene);
  bBulb.material = bulbMat;
  bBulb.parent = sec;
  const pMats = new Float32Array(bollardCoords.length * 16);
  const lMats = new Float32Array(bollardCoords.length * 16);
  bollardCoords.forEach(([bx, bz], idx) => {
    const by = getWorldTerrainY(bx, bz);
    registerCircleCollider(bx, bz, 0.18, by - 0.5, by + 1.5);
    Matrix.Translation(bx, by + 0.32, bz).copyToArray(pMats, idx * 16);
    Matrix.Translation(bx, by + 0.68, bz).copyToArray(lMats, idx * 16);
  });
  bPost.thinInstanceSetBuffer("matrix", pMats, 16, true);
  bBulb.thinInstanceSetBuffer("matrix", lMats, 16, true);

  return { courtRefs: { mailbox, flagPivot, wheels, bell }, bulbMat };
}

function buildDistantHorizonAndArchipelago(scene, root, fleetContainer) {
  const hor = new TransformNode("DistantCoastalHorizon", scene);
  hor.parent = root;

  // 1) 3-Tier Ridged Multifractal Mountain Amphitheater
  const rng = mulberry32(61401);
  const mountainMat = makePbrMat("MountainAmphitheaterMat", scene, {
    color: 0xffffff,
    roughness: 0.94,
    metallic: 0.01,
    useVertexColors: true,
  });
  const hillMat = makePbrMat("ArchipelagoIslandMat", scene, {
    color: 0xffffff,
    roughness: 0.88,
    metallic: 0.02,
    useVertexColors: true,
  });
  const mtnPts = [];
  const mtnCols = [];
  const mtnIdx = [];
  const rings = [
    { r0: 540, r1: 720, hPeak: 118, col: [0.32, 0.41, 0.36], a0: -2.4, a1: 0.7 },
    { r0: 710, r1: 940, hPeak: 175, col: [0.34, 0.42, 0.49], a0: -2.55, a1: 0.85 },
    { r0: 930, r1: 1220, hPeak: 245, col: [0.44, 0.47, 0.58], a0: -2.7, a1: 1.05 },
  ];
  let vBase = 0;
  for (const ring of rings) {
    const azSteps = 84;
    const radSteps = 10;
    for (let r = 0; r <= radSteps; r += 1) {
      const u = r / radSteps;
      const rad = lerp(ring.r0, ring.r1, u);
      const env = Math.sin(u * Math.PI);
      for (let a = 0; a <= azSteps; a += 1) {
        const ang = lerp(ring.a0, ring.a1, a / azSteps);
        const x = Math.cos(ang) * rad;
        const z = Math.sin(ang) * rad;
        const ridge = 1.0 - Math.abs(Math.sin(ang * 7.2 + x * 0.006)) * 0.55;
        const y = Math.max(-4, -3 + env * ring.hPeak * (0.52 + 0.48 * ridge));
        mtnPts.push(x, y, z);
        const mist = smoothstep(20, ring.hPeak, y);
        mtnCols.push(
          lerp(ring.col[0] * 0.82, 0.62, mist * 0.35),
          lerp(ring.col[1] * 0.88, 0.64, mist * 0.35),
          lerp(ring.col[2], 0.74, mist * 0.4),
          1.0
        );
      }
    }
    for (let r = 0; r < radSteps; r += 1) {
      for (let a = 0; a < azSteps; a += 1) {
        const p0 = vBase + r * (azSteps + 1) + a;
        const p1 = p0 + 1;
        const p2 = p0 + azSteps + 1;
        const p3 = p2 + 1;
        mtnIdx.push(p0, p1, p2, p1, p3, p2);
      }
    }
    vBase += (radSteps + 1) * (azSteps + 1);
  }
  const mtnNorm = new Array(mtnPts.length).fill(0);
  VertexData.ComputeNormals(mtnPts, mtnIdx, mtnNorm, { useRightHandedSystem: true });
  const mtnMesh = new Mesh("MountainAmphitheater", scene);
  mtnMesh.parent = hor;
  const mvd = new VertexData();
  mvd.positions = mtnPts;
  mvd.normals = mtnNorm;
  mvd.colors = mtnCols;
  mvd.indices = mtnIdx;
  mvd.applyToMesh(mtnMesh, false);
  mtnMesh.overrideMaterialSideOrientation = Material.CounterClockWiseSideOrientation;
  mtnMesh.material = mountainMat;
  mtnMesh.isPickable = false;

  // 2) 6 Mid-Bay Archipelago Islands & Across-Bay Terraced Harbor Village
  const specs = [
    { cx: 248, cz: -74, rx: 64, rz: 48, h: 32, ang: 0.25 },
    { cx: 318, cz: 118, rx: 72, rz: 46, h: 38, ang: -0.35 },
    { cx: 138, cz: -168, rx: 48, rz: 36, h: 24, ang: 0.4 },
    { cx: -176, cz: -158, rx: 56, rz: 42, h: 36, ang: 0.15 },
    { cx: 162, cz: 228, rx: 46, rz: 34, h: 20, ang: -0.2 },
    { cx: -224, cz: 186, rx: 60, rz: 40, h: 28, ang: 0.3 },
  ];
  const iPos = [];
  const iCol = [];
  const iIdx = [];
  let iBase = 0;
  for (const sp of specs) {
    const segU = 28;
    const segV = 12;
    const ca = Math.cos(sp.ang);
    const sa = Math.sin(sp.ang);
    for (let r = 0; r <= segV; r += 1) {
      const rv = r / segV;
      for (let t = 0; t <= segU; t += 1) {
        const ang = (t / segU) * Math.PI * 2;
        const wobble = 1.0 + 0.18 * Math.sin(ang * 3 + sp.cx) + 0.1 * Math.cos(ang * 5);
        const lx = Math.cos(ang) * sp.rx * rv * wobble;
        const lz = Math.sin(ang) * sp.rz * rv * wobble;
        const wx = sp.cx + lx * ca - lz * sa;
        const wz = sp.cz + lx * sa + lz * ca;
        const profile = Math.pow(Math.max(0, 1 - rv * rv), 1.35);
        const wy = rv > 0.92 ? -3.5 : -1.2 + profile * sp.h * (0.82 + 0.2 * Math.sin(ang * 2));
        iPos.push(wx, wy, wz);
        const greenMix = smoothstep(0.6, 5.0, wy);
        iCol.push(lerp(0.55, 0.30, greenMix), lerp(0.51, 0.45, greenMix), lerp(0.42, 0.24, greenMix), 1.0);
      }
    }
    for (let r = 0; r < segV; r += 1) {
      for (let t = 0; t < segU; t += 1) {
        const p0 = iBase + r * (segU + 1) + t;
        const p1 = p0 + 1;
        const p2 = p0 + segU + 1;
        const p3 = p2 + 1;
        iIdx.push(p0, p1, p2, p1, p3, p2);
      }
    }
    iBase += (segV + 1) * (segU + 1);
  }
  const iNorm = new Array(iPos.length).fill(0);
  VertexData.ComputeNormals(iPos, iIdx, iNorm, { useRightHandedSystem: true });
  // Weld longitudinal UV seam (t = 0 vs segU) and pole ring (r = 0) so distant islands shade smoothly without creases.
  const strideU = 28 + 1;
  const ringVerts = (12 + 1) * strideU;
  for (let si = 0; si < specs.length; si += 1) {
    const base = si * ringVerts;
    let ax = 0;
    let ay = 0;
    let az = 0;
    for (let t = 0; t < strideU - 1; t += 1) {
      const k = (base + t) * 3;
      ax += iNorm[k];
      ay += iNorm[k + 1];
      az += iNorm[k + 2];
    }
    const al = Math.hypot(ax, ay, az) || 1;
    for (let t = 0; t < strideU; t += 1) {
      const k = (base + t) * 3;
      iNorm[k] = ax / al;
      iNorm[k + 1] = ay / al;
      iNorm[k + 2] = az / al;
    }
    for (let r = 1; r <= 12; r += 1) {
      const k0 = (base + r * strideU) * 3;
      const k1 = (base + r * strideU + 28) * 3;
      const nx = iNorm[k0] + iNorm[k1];
      const ny = iNorm[k0 + 1] + iNorm[k1 + 1];
      const nz = iNorm[k0 + 2] + iNorm[k1 + 2];
      const nl = Math.hypot(nx, ny, nz) || 1;
      iNorm[k0] = iNorm[k1] = nx / nl;
      iNorm[k0 + 1] = iNorm[k1 + 1] = ny / nl;
      iNorm[k0 + 2] = iNorm[k1 + 2] = nz / nl;
    }
  }
  const islMesh = new Mesh("ArchipelagoIslands", scene);
  islMesh.parent = hor;
  const ivd = new VertexData();
  ivd.positions = iPos;
  ivd.normals = iNorm;
  ivd.colors = iCol;
  ivd.indices = iIdx;
  ivd.applyToMesh(islMesh, false);
  islMesh.overrideMaterialSideOrientation = Material.CounterClockWiseSideOrientation;
  islMesh.material = hillMat;
  islMesh.isPickable = false;

  // Across-Bay Harbor Village Buildings & Campanile Bell Tower on Island 0 (248, -74)
  const vWallMat = makePbrMat("VillageWallMat", scene, { color: 0xf4ead8, roughness: 0.85 });
  const vRoofMat = makePbrMat("VillageRoofMat", scene, { color: 0xc26c50, roughness: 0.82 });
  const villageGlowMat = makePbrMat("VillageGlowMat", scene, {
    color: 0xffe8b0,
    emissive: 0xffb85c,
    emissiveIntensity: 0.78,
    roughness: 0.25,
  });
  for (let h = 0; h < 18; h += 1) {
    const bx = 216 + (rng() - 0.5) * 34;
    const bz = -68 + (rng() - 0.5) * 38;
    const by = 4.5 + rng() * 9.0;
    const w = 3.5 + rng() * 3.2;
    const bh = 3.2 + rng() * 3.0;
    const house = CreateBox(`VillageHouse_${h}`, { width: w, height: bh, depth: w * 0.85 }, scene);
    house.position.set(bx, by + bh * 0.5, bz);
    house.rotation.y = 0.25 + (rng() - 0.5) * 0.4;
    house.material = vWallMat;
    house.parent = hor;
    house.isPickable = false;
    const roof = CreateBox(`VillageRoof_${h}`, { width: w + 0.4, height: 0.9, depth: w * 0.9 }, scene);
    roof.position.set(bx, by + bh + 0.4, bz);
    roof.rotation.y = house.rotation.y;
    roof.material = vRoofMat;
    roof.parent = hor;
    roof.isPickable = false;
    const win = CreateBox(`VillageWin_${h}`, { width: w * 0.55, height: 0.65, depth: w * 0.88 }, scene);
    win.position.set(bx, by + bh * 0.55, bz);
    win.rotation.y = house.rotation.y;
    win.material = villageGlowMat;
    win.parent = hor;
    win.isPickable = false;
  }

  // Outer-Bay Cruising Fleet (instanced from harbor_fleet.glb Coastal_Sloop)
  const outerBoats = [];
  if (fleetContainer) {
    for (let b = 0; b < 4; b += 1) {
      const inst = instantiateGLB(fleetContainer, `OuterBoat_${b}`, hor);
      const sloop = inst?.rootNodes[0]?.getChildTransformNodes(false).find((n) => n.name.includes("Coastal_Sloop")) || inst?.rootNodes[0];
      if (inst) {
        for (const n of inst.rootNodes[0].getChildren()) {
          if (n !== sloop) n.setEnabled(false);
        }
        const bx = 135 + b * 42;
        const bz = -40 + b * 48;
        inst.rootNodes[0].position.set(bx, 0, bz);
        inst.rootNodes[0].rotation.y = 0.4 + b * 0.8;
        outerBoats.push({ node: inst.rootNodes[0], bx, bz, phase: b * 1.4, r: 16 + b * 5 });
      }
    }
  }

  return {
    villageGlowMat,
    update: (elapsed) => {
      for (const ob of outerBoats) {
        const a = elapsed * 0.045 + ob.phase;
        ob.node.position.set(ob.bx + Math.cos(a) * ob.r, Math.sin(elapsed * 1.4 + ob.phase) * 0.08, ob.bz + Math.sin(a) * ob.r);
        ob.node.rotation.y = -a + Math.PI * 0.5;
      }
    },
  };
}

function placeCoastalPhotogrammetry(scene, root, containers) {
  const sec = new TransformNode("CoastalPhotogrammetry", scene);
  sec.parent = root;
  const rng = mulberry32(9217);

  const placeSingle = (key, { x, y, z, ry = 0, sx = 1, sy = 1, sz = 1 }, name) => {
    const inst = instantiateGLB(containers[key], name, sec);
    if (!inst || !inst.rootNodes[0]) return null;
    const rn = inst.rootNodes[0];
    rn.position.set(x, y, z);
    rn.rotation.set(0, ry, 0);
    rn.scaling.set(sx, sy, sz);
    rn.getChildMeshes().forEach((m) => {
      m.receiveShadows = true;
      m.isPickable = false;
    });
    return rn;
  };

  placeSingle("ph_cliff_01", { x: 35.8, y: -0.45, z: -56.0, ry: Math.PI * 0.46, sx: 0.62, sy: 0.96, sz: 0.78 }, "Cliff_NE");
  placeSingle("ph_cliff_02", { x: 46.2, y: 0.40, z: -95.0, ry: Math.PI * 0.34, sx: 0.85, sy: 1.25, sz: 0.95 }, "Cliff_FarNE");
  placeSingle("ph_cliff_01", { x: -113.5, y: -0.35, z: -14.0, ry: -Math.PI * 0.50, sx: 0.66, sy: 1.02, sz: 0.76 }, "Cliff_West");
  placeSingle("ph_cliff_02", { x: -96.0, y: -0.35, z: 39.0, ry: -Math.PI * 0.78, sx: 0.68, sy: 0.86, sz: 0.72 }, "Cliff_SW");

  placeSingle("ph_coast_rocks", { x: -32.2, y: -0.35, z: 32.8, ry: 0.34, sx: 0.25, sy: 0.76, sz: 0.24 }, "CoastRock_W");
  registerCircleCollider(-32.2, 32.8, 1.8, -0.5, 3.0);
  placeSingle("ph_coast_rocks_b", { x: -44.0, y: -0.25, z: 42.5, ry: 0.85, sx: 0.42, sy: 0.82, sz: 0.36 }, "CoastRock_GazW");
  placeSingle("ph_coast_rocks_b", { x: 12.2, y: -0.55, z: 27.6, ry: -0.62, sx: 0.38, sy: 0.84, sz: 0.35 }, "CoastRock_E");
  registerCircleCollider(12.2, 27.6, 2.0, -0.5, 3.0);
  placeSingle("ph_coast_rocks_b", { x: 42.8, y: -0.45, z: -78.5, ry: 0.48, sx: 0.52, sy: 1.02, sz: 0.48 }, "CoastRock_NE2");
  placeSingle("ph_coast_rocks_b", { x: 63.2, y: -0.25, z: 59.5, ry: 0.45, sx: 0.56, sy: 0.96, sz: 0.52 }, "CoastRock_Islet");

  // ThinInstanced Coastal Moss Boulders along Creek, Breakwater, Sea-Stack Islet & Windmill
  const boulderSpots = [];
  for (let i = 0; i < 48; i += 1) {
    const z = lerp(-108.0, -26.0, rng());
    if (Math.abs(z + 44.0) < 5.0) continue;
    const x = getCreekCenterX(z) + (i % 2 === 0 ? -1 : 1) * (2.9 + rng() * 1.5);
    const s = 0.36 + rng() * 0.32;
    boulderSpots.push({ x, y: getWorldTerrainY(x, z) - 0.14, z, ry: rng() * Math.PI * 2, sx: s, sy: s * 0.72, sz: s });
  }
  for (let i = 0; i < 24; i += 1) {
    const bx = 46.8 + rng() * 29.0;
    const bz = 10.0 + (i % 2 === 0 ? -1 : 1) * (3.15 + rng() * 1.05);
    const s = 0.58 + rng() * 0.4;
    boulderSpots.push({ x: bx, y: -0.5 + rng() * 0.4, z: bz, ry: rng() * Math.PI * 2, sx: s * 1.1, sy: s * 0.72, sz: s * 0.95 });
  }
  for (let i = 0; i < 16; i += 1) {
    const a = rng() * Math.PI * 2;
    const dist = i < 4 ? 1.5 + rng() * 3.0 : 3.5 + rng() * 5.6;
    const rx = 58.0 + Math.cos(a) * dist;
    const rz = 56.0 + Math.sin(a) * dist;
    const s = 0.65 + rng() * 0.4;
    boulderSpots.push({ x: rx, y: getWorldTerrainY(rx, rz) - 0.24, z: rz, ry: rng() * Math.PI * 2, sx: s, sy: s * 0.78, sz: s });
  }
  for (const b of boulderSpots) {
    if (b.y + b.sy * 0.9 >= 0.05) {
      registerCircleCollider(b.x, b.z, b.sx * 0.54, b.y - 1.2, b.y + b.sy * 2.2);
    }
  }
  if (containers.ph_moss_boulder) {
    const inst = instantiateGLB(containers.ph_moss_boulder, "BoulderProto", sec);
    const bMesh = inst?.rootNodes[0]?.getChildMeshes()[0];
    if (bMesh) {
      bMesh.parent = sec;
      bMesh.makeGeometryUnique();
      bMesh.position.set(0, 0, 0);
      bMesh.rotation.set(0, 0, 0);
      bMesh.scaling.set(1, 1, 1);
      const matBuf = new Float32Array(boulderSpots.length * 16);
      boulderSpots.forEach((b, idx) => {
        const m = Matrix.Scaling(b.sx, b.sy, b.sz)
          .multiply(Matrix.RotationY(b.ry))
          .multiply(Matrix.Translation(b.x, b.y, b.z));
        m.copyToArray(matBuf, idx * 16);
      });
      bMesh.thinInstanceSetBuffer("matrix", matBuf, 16, true);
      bMesh.thinInstanceRefreshBoundingInfo(true);
      inst.rootNodes[0].dispose(false, false);
    }
  }

  // Harbor Picnic Table & Lifebuoys
  placeSingle("ph_picnic_table", { x: 26.8, y: 1.36, z: -14.2, ry: 0.14, sx: 1.0, sy: 1.0, sz: 1.0 }, "HarborPicnicTable");
  registerBoxCollider(25.65, 27.95, -15.7, -12.7);
  for (const [lx, lz] of [[45.4, -18.5], [45.4, 10.5]]) {
    placeSingle("ph_lifebuoy", { x: lx, y: 2.1, z: lz, ry: Math.PI * 0.5, sx: 0.95, sy: 0.95, sz: 0.95 }, `Lifebuoy_${lz}`);
  }
}

export function buildTerrainAndDistantHorizon(scene, containers, shadowGen) {
  const worldRoot = new TransformNode("TerrainAndHorizonRoot", scene);
  const { creekMat } = buildPeninsulaTerrain(scene, worldRoot, shadowGen);
  const { courtRefs, bulbMat } = buildCourtyardAndTrails(scene, worldRoot);
  const horizonCtrl = buildDistantHorizonAndArchipelago(scene, worldRoot, containers.harbor_fleet);
  placeCoastalPhotogrammetry(scene, worldRoot, containers);

  return {
    root: worldRoot,
    courtRefs,
    bulbMat,
    villageGlowMat: horizonCtrl.villageGlowMat,
    update: (elapsed, nightMix) => {
      horizonCtrl.update(elapsed);
      if (bulbMat) bulbMat.emissiveColor = hexToColor3(0xffb85c).scale(lerp(0.22, 0.95, nightMix));
      if (horizonCtrl.villageGlowMat) {
        horizonCtrl.villageGlowMat.emissiveColor = hexToColor3(0xffb85c).scale(lerp(0.35, 1.85, nightMix));
      }
      void creekMat;
    },
  };
}
