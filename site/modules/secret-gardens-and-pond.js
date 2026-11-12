// Exquisite GLB-Powered Secret Gardens & Crystal-Clear Pond Subsystem:
// 1. Monet Waterfall, Sage-Green Wooden Footbridge & Crystal-Clear Water-Lily Pond
//    teeming with Skeletal-Animated Ryukin Goldfish, Koi & Giant Freshwater Shrimp.
// 2. Cascading Bougainvillea & Rose Secret Garden with a Crisp White Tubular
//    A-Frame Two-Person Swing suspended by Articulated Link Chains.
// 3. Monet's Giverny Multi-Tiered Flower-Drenched Flagstone Borders & Indoor Hero Roses.

import {
  THREE,
  mergeGeometries,
  clamp,
  lerp,
  smoothstep,
  mulberry32,
  makeCanvasTex,
  makeNormalTex,
  pbrStoneMat,
  pbrWoodMat,
  pbrFabricMat,
  pbrMetalMat,
  POND_CONFIG,
  SWING_CONFIG,
  getPondNormalizedRadius,
  getWorldTerrainY,
  registerWalkZone,
  registerCircleCollider,
  tagInteractive,
  enablePBRShadows,
} from "./pbr-kit.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const MODEL_MANIFEST = {
  freshwater_shrimp: "./assets/models/freshwater_shrimp.glb",
  ryukin_goldfish: "./assets/models/ryukin_goldfish.glb",
  pond_koi: "./assets/models/pond_koi.glb",
  waterlily: "./assets/models/waterlily.glb",
  rose_bush: "./assets/models/rose_bush.glb",
  margarita_bush: "./assets/models/margarita_bush.glb",
  wisteria_cascade: "./assets/models/wisteria_cascade.glb",
  ph_fern: "./assets/models/ph_fern.glb",
  ph_periwinkle: "./assets/models/ph_periwinkle.glb",
  hero_rose: "./assets/models/hero_rose.glb",
};

function tuneMaterialForPBR(mat, { isAquatic = false, isFoliage = false, tintable = false } = {}) {
  if (!mat) return mat;
  const m = mat.clone();
  if (m.map) {
    m.map.colorSpace = THREE.SRGBColorSpace;
    m.map.anisotropy = 4;
  }
  if (tintable) {
    m.color = new THREE.Color(0xffffff);
  }
  if (isFoliage) {
    const needsCutout = Boolean(m.transparent || m.alphaTest > 0 || m.map);
    if (needsCutout) {
      m.alphaTest = Math.max(m.alphaTest || 0, 0.36);
      m.transparent = false;
      m.depthWrite = true;
    }
    m.side = THREE.DoubleSide;
    m.roughness = clamp(m.roughness ?? 0.68, 0.52, 0.84);
    m.metalness = 0.0;
  } else if (isAquatic) {
    m.roughness = 0.22;
    m.metalness = 0.04;
    if (m.transparent) {
      m.alphaTest = 0.25;
      m.transparent = false;
      m.depthWrite = true;
    }
    m.side = THREE.DoubleSide;
  }
  return m;
}

// Extracts static mesh parts from a GLTF scene, baking world transforms and centering
// XZ to (0, 0) and Y according to alignY ("min" | "max" | "center").
function extractNormalizedParts(gltf, { alignY = "min", filterFn = null, isAquatic = false, isFoliage = true } = {}) {
  if (!gltf || !gltf.scene) return { parts: [], size: new THREE.Vector3(1, 1, 1) };
  gltf.scene.updateMatrixWorld(true);

  const rawParts = [];
  const combinedBox = new THREE.Box3();

  gltf.scene.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    if (filterFn && !filterFn(obj)) return;
    const geom = obj.geometry.clone();
    geom.applyMatrix4(obj.matrixWorld);
    geom.computeBoundingBox();
    combinedBox.union(geom.boundingBox);
    rawParts.push({
      name: obj.name || "",
      matName: obj.material?.name || "",
      geometry: geom,
      material: obj.material,
    });
  });

  if (!rawParts.length) return { parts: [], size: new THREE.Vector3(1, 1, 1) };

  const center = combinedBox.getCenter(new THREE.Vector3());
  const size = combinedBox.getSize(new THREE.Vector3());
  const yRef =
    alignY === "max"
      ? combinedBox.max.y
      : alignY === "center"
        ? center.y
        : combinedBox.min.y;

  const parts = rawParts.map((p) => {
    p.geometry.translate(-center.x, -yRef, -center.z);
    p.geometry.computeBoundingSphere();
    const isPetal = /flower|petal|material\.001/i.test(`${p.name} ${p.matName}`);
    return {
      name: p.name,
      isPetal,
      geometry: p.geometry,
      material: tuneMaterialForPBR(p.material, {
        isAquatic,
        isFoliage,
        tintable: isPetal || isAquatic,
      }),
    };
  });

  return { parts, size };
}

async function loadAllGardenModels() {
  const loader = new GLTFLoader();
  const entries = Object.entries(MODEL_MANIFEST);
  const results = {};
  await Promise.all(
    entries.map(
      ([key, url]) =>
        new Promise((resolve) => {
          loader.load(
            url,
            (gltf) => {
              results[key] = gltf;
              resolve();
            },
            undefined,
            () => {
              results[key] = null;
              resolve();
            }
          );
        })
    )
  );
  return results;
}

// ---------------------------------------------------------------------------
// Multi-Part GPU InstancedMesh Batcher (supports multi-material GLBs + petal tint)
// ---------------------------------------------------------------------------

function buildInstancedGLBBatch(extracted, placements, { castShadow = false, receiveShadow = true } = {}) {
  const group = new THREE.Group();
  if (!extracted.parts.length || !placements.length) return group;

  const dummy = new THREE.Object3D();
  const white = new THREE.Color(0xffffff);
  const cTmp = new THREE.Color();

  for (const part of extracted.parts) {
    const inst = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
    inst.castShadow = castShadow;
    inst.receiveShadow = receiveShadow;
    inst.raycast = () => {};

    for (let i = 0; i < placements.length; i += 1) {
      const p = placements[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
      const sx = p.sx ?? p.s ?? 1;
      const sy = p.sy ?? p.s ?? 1;
      const sz = p.sz ?? p.s ?? 1;
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);

      if (p.color !== undefined && (part.isPetal || p.tintAll)) {
        cTmp.set(p.color);
        inst.setColorAt(i, cTmp);
      } else if (p.foliageColor !== undefined && !part.isPetal) {
        cTmp.set(p.foliageColor);
        inst.setColorAt(i, cTmp);
      } else {
        inst.setColorAt(i, white);
      }
    }

    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    group.add(inst);
  }
  return group;
}

// ---------------------------------------------------------------------------
// Procedural Waterfall, Pebble Path & Mossy Boulder Helpers
// ---------------------------------------------------------------------------

function createWaterfallTextures() {
  const rng = mulberry32(7712);
  const map = makeCanvasTex(
    256,
    512,
    (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0.0, "rgba(182,232,226,0.72)");
      grad.addColorStop(0.22, "rgba(232,250,248,0.92)");
      grad.addColorStop(0.5, "rgba(250,255,255,0.96)");
      grad.addColorStop(0.78, "rgba(228,248,246,0.90)");
      grad.addColorStop(1.0, "rgba(178,228,222,0.70)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < 420; i += 1) {
        const x = rng() * w;
        const y = rng() * h;
        const len = 45 + rng() * 140;
        const alpha = 0.16 + rng() * 0.36;
        ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
        ctx.lineWidth = 1.0 + rng() * 3.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rng() - 0.5) * 4, y + len);
        ctx.stroke();
      }
    },
    { repeatX: 1, repeatY: 2 }
  );
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  return map;
}

function createPondRippleNormal() {
  const rng = mulberry32(8831);
  return makeNormalTex(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 180; i += 1) {
        const cx = rng() * w;
        const cy = rng() * h;
        const r = 8 + rng() * 28;
        const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
        g.addColorStop(0, "rgba(215,215,215,0.45)");
        g.addColorStop(0.55, "rgba(95,95,95,0.35)");
        g.addColorStop(1, "rgba(128,128,128,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { strength: 1.6, repeatX: 5, repeatY: 4 }
  );
}

function createPebblePathMat() {
  const rng = mulberry32(5521);
  const map = makeCanvasTex(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = "#e6dfd3";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1600; i += 1) {
        const x = rng() * w;
        const y = rng() * h;
        const rx = 2.2 + rng() * 4.2;
        const ry = 1.6 + rng() * 3.1;
        const base = 198 + Math.floor(rng() * 50);
        ctx.fillStyle = `rgb(${base},${base - 4},${base - 11})`;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { repeatX: 4, repeatY: 10 }
  );
  return new THREE.MeshStandardMaterial({
    color: 0xf0eae0,
    map,
    roughness: 0.86,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
}

function createSculptedRockGeo(rx, ry, rz, seed) {
  const rng = mulberry32(seed);
  const geo = new THREE.IcosahedronGeometry(1.0, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const strata =
      0.86 +
      0.14 * Math.sin(vy * 5.2 + seed * 0.7) +
      0.11 * Math.cos(vx * 3.7 - vz * 4.1 + seed) +
      (rng() - 0.5) * 0.04;
    const flatTop = vy > 0.35 ? lerp(vy, 0.42 + (vy - 0.35) * 0.35, 0.65) : vy;
    pos.setXYZ(i, vx * rx * strata, flatTop * ry, vz * rz * strata);
  }
  geo.computeVertexNormals();
  return geo;
}

// Builds a graceful weeping garden fan-palm / pond-bank palm matching Reference Image 1
function buildWatersideWeepingPalm(trunkMat, frondMat, height = 3.6, seed = 101) {
  const rng = mulberry32(seed);
  const palm = new THREE.Group();
  const leanX = 0.28 + (rng() - 0.5) * 0.18;
  const leanZ = 0.22 + (rng() - 0.5) * 0.16;

  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(leanX * 0.35, height * 0.38, leanZ * 0.35),
    new THREE.Vector3(leanX * 0.78, height * 0.74, leanZ * 0.78),
    new THREE.Vector3(leanX, height, leanZ),
  ]);
  const trunkGeo = new THREE.TubeGeometry(trunkCurve, 14, 0.095, 8, false);
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  palm.add(trunk);

  const crownGeos = [];
  const frondCount = 12;
  for (let i = 0; i < frondCount; i += 1) {
    const az = (i / frondCount) * Math.PI * 2 + rng() * 0.22;
    const len = 1.45 + rng() * 0.48;
    const arch = 0.35 + (i % 3) * 0.16;
    const rotMat = new THREE.Matrix4().makeRotationY(az);

    const spineCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, arch, len * 0.42),
      new THREE.Vector3(0, arch * 0.25, len * 0.78),
      new THREE.Vector3(0, -0.42, len),
    ]);
    const spineGeo = new THREE.TubeGeometry(spineCurve, 7, 0.014, 5, false).toNonIndexed();
    spineGeo.applyMatrix4(rotMat);
    crownGeos.push(spineGeo);

    for (let b = 2; b <= 10; b += 1) {
      const u = b / 11;
      const pt = spineCurve.getPointAt(u);
      const bladeW = Math.sin(u * Math.PI) * 0.46;
      for (const side of [-1, 1]) {
        const lg = new THREE.PlaneGeometry(0.058, bladeW).toNonIndexed();
        const m = new THREE.Matrix4().makeRotationFromEuler(
          new THREE.Euler(0.32 * u, 0, side * 1.12)
        );
        m.setPosition(side * bladeW * 0.42, pt.y - 0.05, pt.z);
        lg.applyMatrix4(m);
        lg.applyMatrix4(rotMat);
        crownGeos.push(lg);
      }
    }
  }
  const crownMesh = new THREE.Mesh(mergeGeometries(crownGeos, false), frondMat);
  crownMesh.position.set(leanX, height, leanZ);
  crownMesh.castShadow = true;
  crownMesh.receiveShadow = true;
  palm.add(crownMesh);
  return palm;
}

// ---------------------------------------------------------------------------
// 1. Monet Waterfall, Sage-Green Bridge & Crystal-Clear Fish/Shrimp Pond
// ---------------------------------------------------------------------------

function buildMonetPondZone(parent, models, extracted, animState) {
  const pondRoot = new THREE.Group();
  pondRoot.name = "MonetWaterfallFishShrimpPond";
  const { cx, cz, rx, rz, waterY, bedY } = POND_CONFIG;

  // Prevent walking directly into deep water while keeping the entire stone rim walkable!
  for (let a = 0; a < 16; a += 1) {
    const ang = (a / 16) * Math.PI * 2;
    const px = cx + Math.cos(ang) * (rx * 0.68);
    const pz = cz + Math.sin(ang) * (rz * 0.68);
    registerCircleCollider(px, pz, 1.35);
  }
  registerCircleCollider(cx, cz, 2.2);
  // Waterfall cliff collider on North bank
  registerCircleCollider(cx, cz - 4.3, 2.6);

  // Flat walkable mossy viewing terrace around the South, West & East pond banks
  registerWalkZone((x, z) => {
    const r = getPondNormalizedRadius(x, z);
    if (r >= 0.98 && r <= 1.45 && z >= cz - 2.2) {
      return 2.22;
    }
    return null;
  });

  const naturalRockNoise = makeNormalTex(
    128,
    128,
    (ctx, w, h) => {
      const rRock = mulberry32(6113);
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i += 1) {
        const v = 96 + Math.floor(rRock() * 64);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.beginPath();
        ctx.arc(rRock() * w, rRock() * h, 2 + rRock() * 7, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { strength: 1.5, repeatX: 2, repeatY: 2 }
  );
  const mossRockMat = new THREE.MeshStandardMaterial({
    color: 0x8b9486,
    normalMap: naturalRockNoise,
    roughness: 0.88,
    metalness: 0.02,
  });
  const warmBoulderMat = new THREE.MeshStandardMaterial({
    color: 0xb7b0a1,
    normalMap: naturalRockNoise,
    roughness: 0.84,
    metalness: 0.02,
  });
  const mossCapMat = new THREE.MeshStandardMaterial({
    color: 0x4f7c46,
    roughness: 0.9,
    metalness: 0.0,
  });
  const shelfStoneMat = new THREE.MeshStandardMaterial({
    color: 0xded9cb,
    normalMap: naturalRockNoise,
    roughness: 0.68,
    metalness: 0.02,
  });
  const sageBridgeMat = pbrWoodMat(0x7c9a82, { roughness: 0.62, repeatX: 2, repeatY: 3 });
  const bridgeDeckMat = pbrWoodMat(0x8fa892, { roughness: 0.68, repeatX: 3, repeatY: 2 });

  // Dedicated underwater sunlight bounce so fish & river shrimp are luminous and crisp
  const pondGlow = new THREE.PointLight(0xe8fff9, 2.2, 14.0, 1.4);
  pondGlow.position.set(cx, waterY + 1.15, cz + 0.6);
  pondRoot.add(pondGlow);

  // --- A. Stacked Mossy Limestone Waterfall Cliff (North side: cz - 4.2 = +12.6) ---
  const cliffGroup = new THREE.Group();
  cliffGroup.position.set(cx, 0, cz - 4.15);

  const cliffSpecs = [
    // Lower plunge boulders (Y = 1.6..3.1)
    [-2.5, 2.35, 0.35, 1.35, 0.88, 1.15, 101],
    [2.45, 2.35, 0.35, 1.35, 0.88, 1.15, 102],
    [-1.35, 2.45, 0.15, 0.95, 0.78, 0.95, 103],
    [1.35, 2.45, 0.15, 0.95, 0.78, 0.95, 104],
    [0.0, 2.55, 0.1, 1.25, 0.62, 0.88, 105], // Mid waterfall spill ledge
    // Mid-upper cliff tier (Y = 2.9..4.35)
    [-2.15, 3.45, -0.35, 1.25, 0.98, 1.08, 106],
    [2.15, 3.45, -0.35, 1.25, 0.98, 1.08, 107],
    [-1.1, 3.65, -0.45, 0.92, 0.86, 0.92, 108],
    [1.1, 3.65, -0.45, 0.92, 0.86, 0.92, 109],
    [0.0, 3.55, -0.52, 1.35, 0.76, 0.86, 110], // Upper spillway crest at Y ~ 4.18
    // Flanking wing boulders
    [-3.45, 2.65, 0.85, 1.15, 0.72, 1.05, 111],
    [3.45, 2.65, 0.85, 1.15, 0.72, 1.05, 112],
  ];

  for (const [bx, by, bz, brx, bry, brz, seed] of cliffSpecs) {
    const rock = new THREE.Mesh(
      createSculptedRockGeo(brx, bry, brz, seed),
      seed % 2 === 0 ? mossRockMat : warmBoulderMat
    );
    rock.position.set(bx, by, bz);
    rock.castShadow = true;
    rock.receiveShadow = true;
    cliffGroup.add(rock);

    if (Math.abs(bx) > 0.85) {
      const moss = new THREE.Mesh(
        createSculptedRockGeo(brx * 0.82, bry * 0.28, brz * 0.82, seed + 50),
        mossCapMat
      );
      moss.position.set(bx, by + bry * 0.42, bz);
      cliffGroup.add(moss);
    }
  }

  // --- B. Monet Sage-Green Arched Wooden Footbridge at Waterfall Crest (Reference Image 1) ---
  const bridge = new THREE.Group();
  bridge.position.set(0, 4.24, -0.58);
  const bridgeSpan = 3.9;
  const deckSegs = 13;
  for (let i = 0; i < deckSegs; i += 1) {
    const u = i / (deckSegs - 1) - 0.5;
    const px = u * bridgeSpan;
    const archY = Math.cos(u * Math.PI) * 0.22;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.045, 1.12), bridgeDeckMat);
    plank.position.set(px, archY, 0);
    plank.rotation.z = -Math.sin(u * Math.PI) * 0.16;
    plank.castShadow = true;
    plank.receiveShadow = true;
    bridge.add(plank);
  }
  for (const sz of [-0.52, 0.52]) {
    const archCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-bridgeSpan * 0.52, -0.04, sz),
      new THREE.Vector3(-bridgeSpan * 0.25, 0.15, sz),
      new THREE.Vector3(0, 0.22, sz),
      new THREE.Vector3(bridgeSpan * 0.25, 0.15, sz),
      new THREE.Vector3(bridgeSpan * 0.52, -0.04, sz),
    ]);
    const stringer = new THREE.Mesh(
      new THREE.TubeGeometry(archCurve, 16, 0.045, 6, false),
      sageBridgeMat
    );
    const topRailCurve = new THREE.CatmullRomCurve3(
      archCurve.points.map((p) => new THREE.Vector3(p.x, p.y + 0.78, p.z))
    );
    const midRailCurve = new THREE.CatmullRomCurve3(
      archCurve.points.map((p) => new THREE.Vector3(p.x, p.y + 0.42, p.z))
    );
    const topRail = new THREE.Mesh(
      new THREE.TubeGeometry(topRailCurve, 16, 0.032, 6, false),
      sageBridgeMat
    );
    const midRail = new THREE.Mesh(
      new THREE.TubeGeometry(midRailCurve, 16, 0.022, 6, false),
      sageBridgeMat
    );
    bridge.add(stringer, topRail, midRail);

    for (let p = 0; p <= 4; p += 1) {
      const u = p / 4;
      const pt = archCurve.getPointAt(u);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.84, 0.065), sageBridgeMat);
      post.position.set(pt.x, pt.y + 0.41, sz);
      post.castShadow = true;
      bridge.add(post);
    }
  }
  cliffGroup.add(bridge);

  // --- C. Silky Cascading Waterfall Ribbon & Animated Plunge Mist ---
  const waterfallMap = createWaterfallTextures();
  const waterfallMat = new THREE.MeshStandardMaterial({
    color: 0xf4ffff,
    map: waterfallMap,
    transparent: true,
    opacity: 0.88,
    roughness: 0.14,
    metalness: 0.02,
    emissive: new THREE.Color(0xcff5ef),
    emissiveIntensity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const buildWaterfallCurtain = (w, pts) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const segY = 20;
    const segX = 10;
    const geo = new THREE.PlaneGeometry(w, 1.0, segX, segY);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const gx = pos.getX(i);
      const v = 0.5 - pos.getY(i); // 0 at top -> 1 at bottom
      const pt = curve.getPointAt(clamp(v, 0, 1));
      const flare = 1.0 + v * 0.28;
      const flute = Math.sin((gx / w) * Math.PI * 5.0) * 0.045;
      pos.setXYZ(i, gx * flare, pt.y, pt.z + flute);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, waterfallMat);
    m.renderOrder = 5;
    return m;
  };

  // Upper cascade + wide silky lower cascade plunging into pond at Y = 2.05m
  cliffGroup.add(
    buildWaterfallCurtain(1.55, [
      new THREE.Vector3(0, 4.12, -0.35),
      new THREE.Vector3(0, 3.65, -0.02),
      new THREE.Vector3(0, 2.95, 0.24),
    ])
  );
  cliffGroup.add(
    buildWaterfallCurtain(1.88, [
      new THREE.Vector3(0, 3.02, 0.22),
      new THREE.Vector3(0, 2.58, 0.62),
      new THREE.Vector3(0, waterY - 0.02, 0.92),
    ])
  );

  // Plunge foam rings
  const foamRings = [];
  const foamMat = new THREE.MeshBasicMaterial({
    color: 0xf4ffff,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  for (let r = 0; r < 3; r += 1) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45 + r * 0.35, 0.62 + r * 0.38, 28), foamMat.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, waterY + 0.012, cz - 3.18);
    ring.renderOrder = 6;
    pondRoot.add(ring);
    foamRings.push({ mesh: ring, phase: r * 0.33 });
  }

  pondRoot.add(cliffGroup);
  animState.waterfallMap = waterfallMap;
  animState.foamRings = foamRings;

  // --- D. Natural Pond Shoreline Boulder Ring + Walkable Viewing Flagstones ---
  const rng = mulberry32(4409);
  for (let i = 0; i < 34; i += 1) {
    const ang = (i / 34) * Math.PI * 2;
    // Leave top waterfall center open
    if (Math.sin(ang) < -0.78 && Math.abs(Math.cos(ang)) < 0.52) continue;
    const rScale = 1.01 + (rng() - 0.5) * 0.06;
    const bx = cx + Math.cos(ang) * rx * rScale;
    const bz = cz + Math.sin(ang) * rz * rScale - 0.34 * Math.sin(Math.cos(ang) * rx * 0.46);
    const isViewingSouth = Math.sin(ang) > 0.38;
    const rockH = isViewingSouth ? 0.16 + rng() * 0.12 : 0.26 + rng() * 0.28;
    const rockW = isViewingSouth ? 0.68 + rng() * 0.32 : 0.52 + rng() * 0.38;
    const rock = new THREE.Mesh(
      createSculptedRockGeo(rockW, rockH, rockW * 0.84, 500 + i),
      isViewingSouth ? shelfStoneMat : i % 2 === 0 ? mossRockMat : warmBoulderMat
    );
    rock.position.set(bx, 2.12, bz);
    rock.rotation.y = rng() * Math.PI;
    rock.castShadow = true;
    rock.receiveShadow = true;
    pondRoot.add(rock);
  }

  // Broad flat Waterside Viewing Stones on South-West bank so visitor stands comfortably
  for (const [vx, vz, vr] of [
    [cx - 0.2, cz + rz + 0.55, 0.95],
    [cx - 1.9, cz + rz + 0.25, 0.85],
    [cx + 1.6, cz + rz + 0.32, 0.82],
    [cx - 3.6, cz + rz - 0.55, 0.78],
  ]) {
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(vr, vr * 1.06, 0.12, 9), shelfStoneMat);
    slab.scale.set(1.15, 1.0, 0.78);
    slab.position.set(vx, 2.19, vz);
    slab.receiveShadow = true;
    pondRoot.add(slab);
  }

  // --- E. Sunlit Underwater Pebbles, Shallow Shrimp Shelf Rocks & Swaying Waterweeds ---
  const pebbleColors = [0xe4ddcd, 0xc4dcd3, 0xd8c8b2, 0xaecac0, 0xeee8da];
  const pebbleGeo = new THREE.SphereGeometry(0.11, 8, 6);
  pebbleGeo.scale(1.25, 0.42, 0.95);
  const pebbleMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.02 });
  const pebbleInst = new THREE.InstancedMesh(pebbleGeo, pebbleMat, 110);
  const dummy = new THREE.Object3D();
  const cTmp = new THREE.Color();
  for (let i = 0; i < 110; i += 1) {
    const a = rng() * Math.PI * 2;
    const rad = Math.sqrt(rng()) * 0.86;
    const px = cx + Math.cos(a) * rx * rad;
    const pz = cz + Math.sin(a) * rz * rad;
    const py = getWorldTerrainY(px, pz) + 0.025;
    dummy.position.set(px, py, pz);
    dummy.rotation.set((rng() - 0.5) * 0.2, rng() * Math.PI, (rng() - 0.5) * 0.2);
    const s = 0.65 + rng() * 1.35;
    dummy.scale.set(s, s * 0.8, s);
    dummy.updateMatrix();
    pebbleInst.setMatrixAt(i, dummy.matrix);
    cTmp.setHex(pebbleColors[i % pebbleColors.length]);
    pebbleInst.setColorAt(i, cTmp);
  }
  pebbleInst.instanceMatrix.needsUpdate = true;
  if (pebbleInst.instanceColor) pebbleInst.instanceColor.needsUpdate = true;
  pebbleInst.raycast = () => {};
  pondRoot.add(pebbleInst);

  // Shallow Sunlit Flat Limestone Shelf Stones (Y = 1.62m..1.76m, ~30-42cm under crystal-clear water!)
  // Giant Freshwater River Shrimp perch & forage right on top of these sunlit stones!
  const shrimpShelves = [
    { x: cx - 1.35, y: 1.72, z: cz + 2.45, rx: 0.72, rz: 0.54 },
    { x: cx + 0.15, y: 1.74, z: cz + 2.65, rx: 0.68, rz: 0.52 },
    { x: cx + 1.55, y: 1.68, z: cz + 2.25, rx: 0.66, rz: 0.48 },
    { x: cx - 2.65, y: 1.66, z: cz + 1.55, rx: 0.64, rz: 0.50 },
    { x: cx - 0.55, y: 1.58, z: cz + 1.35, rx: 0.62, rz: 0.48 },
    { x: cx + 2.35, y: 1.64, z: cz + 0.95, rx: 0.60, rz: 0.46 },
  ];
  for (let i = 0; i < shrimpShelves.length; i += 1) {
    const sh = shrimpShelves[i];
    const h = sh.y - bedY + 0.18;
    const shelf = new THREE.Mesh(
      new THREE.CylinderGeometry(sh.rx, sh.rx * 1.14, h, 9),
      shelfStoneMat
    );
    shelf.scale.set(1.0, 1.0, sh.rz / sh.rx);
    shelf.position.set(sh.x, sh.y - h * 0.5, sh.z);
    shelf.receiveShadow = true;
    pondRoot.add(shelf);
  }

  // Lush Underwater Vallisneria Ribbon Plants
  const weedMat = new THREE.MeshStandardMaterial({
    color: 0x388e6c,
    roughness: 0.58,
    side: THREE.DoubleSide,
  });
  for (let w = 0; w < 22; w += 1) {
    const ang = (w / 22) * Math.PI * 2 + 0.2;
    const rad = 0.62 + (w % 3) * 0.1;
    const wx = cx + Math.cos(ang) * rx * rad;
    const wz = cz + Math.sin(ang) * rz * rad;
    const wy = getWorldTerrainY(wx, wz);
    const tuft = new THREE.Group();
    tuft.position.set(wx, wy, wz);
    for (let b = 0; b < 5; b += 1) {
      const bh = 0.34 + rng() * 0.28;
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.042, bh, 1, 4), weedMat);
      blade.position.y = bh * 0.5;
      blade.rotation.y = (b / 5) * Math.PI * 2;
      blade.rotation.z = (rng() - 0.5) * 0.28;
      tuft.add(blade);
    }
    pondRoot.add(tuft);
  }

  // --- F. Crystal-Clear Jade-Emerald Pond Water Surface (Y = +2.05m) ---
  const waterShape = new THREE.Shape();
  const waterPts = 64;
  for (let i = 0; i <= waterPts; i += 1) {
    const ang = (i / waterPts) * Math.PI * 2;
    const px = Math.cos(ang) * rx * 1.02;
    const pz = Math.sin(ang) * rz * 1.02 - 0.34 * Math.sin(px * 0.46);
    if (i === 0) waterShape.moveTo(px, pz);
    else waterShape.lineTo(px, pz);
  }
  const waterGeo = new THREE.ShapeGeometry(waterShape, 24);
  waterGeo.rotateX(Math.PI / 2); // Shape (x, y) -> 3D (x, 0, z) with +Y normal? Wait: rotateX(-PI/2) maps +Y to -Z; let's set DoubleSide or compute normals!
  // Wait: rotateX(Math.PI / 2) maps (x, y, 0) -> (x, 0, y) with normal (0, -1, 0). Flip vertex winding / recompute normals upward:
  const wPos = waterGeo.attributes.position;
  for (let i = 0; i < wPos.count; i += 1) {
    wPos.setY(i, 0);
  }
  if (waterGeo.index) {
    const idx = waterGeo.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const tmp = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = tmp;
    }
  }
  waterGeo.computeVertexNormals();

  const pondNormal = createPondRippleNormal();
  const pondWaterMat = new THREE.MeshPhysicalMaterial({
    color: 0x5bc6b4,
    roughness: 0.06,
    metalness: 0.02,
    normalMap: pondNormal,
    normalScale: new THREE.Vector2(0.24, 0.24),
    clearcoat: 0.95,
    clearcoatRoughness: 0.06,
    transparent: true,
    opacity: 0.27,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const pondWaterMesh = new THREE.Mesh(waterGeo, pondWaterMat);
  pondWaterMesh.position.set(cx, waterY, cz);
  pondWaterMesh.renderOrder = 4;
  pondRoot.add(pondWaterMesh);
  animState.pondNormal = pondNormal;

  // --- G. Floating Pink Water Lilies & Lily Pads (waterlily.glb) ---
  const lilyClusters = [];
  if (extracted.waterlily.parts.length) {
    // Frame perimeter & waterfall edges while keeping South-Center clear so fish & shrimp shine!
    const lilySpots = [
      [-3.4, -1.6, 0.95, 0.4],
      [-2.6, -2.2, 0.82, 1.9],
      [2.4, -2.1, 0.92, 0.8],
      [3.3, -1.2, 0.86, 2.5],
      [3.6, 0.2, 0.78, 1.1],
      [-3.8, -0.1, 0.88, 2.9],
      [-3.3, 1.1, 0.74, 0.6],
      [2.9, 1.4, 0.80, 2.1],
      [-0.9, -1.9, 0.72, 1.4],
      [1.1, -1.7, 0.76, 2.7],
      [-1.9, 0.4, 0.68, 0.2],
      [1.7, -0.3, 0.72, 1.7],
    ];
    for (let i = 0; i < lilySpots.length; i += 1) {
      const [ox, oz, sc, rot] = lilySpots[i];
      const lg = new THREE.Group();
      for (const part of extracted.waterlily.parts) {
        const m = new THREE.Mesh(part.geometry, part.material);
        m.castShadow = false;
        m.receiveShadow = true;
        lg.add(m);
      }
      lg.position.set(cx + ox, waterY + 0.008, cz + oz);
      lg.rotation.y = rot;
      lg.scale.setScalar(sc);
      pondRoot.add(lg);
      lilyClusters.push({ group: lg, baseY: waterY + 0.008, phase: i * 0.85 });
    }
  }
  animState.lilyClusters = lilyClusters;

  // --- H. Living Skeletal-Animated Ryukin Goldfish + Koi + Freshwater River Shrimp ---
  const swimmers = [];
  const shrimpActors = [];

  // 1) 8 Skeletal-Animated Ryukin Goldfish (ryukin_goldfish.glb)
  if (models.ryukin_goldfish?.scene) {
    const gltf = models.ryukin_goldfish;
    const ryukinTints = [0xffffff, 0xffd8c2, 0xffb899, 0xfff0d8, 0xffcbb8];
    for (let i = 0; i < 8; i += 1) {
      const clone = SkeletonUtils.clone(gltf.scene);
      const tintHex = ryukinTints[i % ryukinTints.length];
      clone.traverse((c) => {
        if (c.isMesh && c.material) {
          c.material = tuneMaterialForPBR(c.material, { isAquatic: true });
          c.material.color.setHex(tintHex);
          c.material.emissive = new THREE.Color(0x3a1206);
          c.material.emissiveIntensity = 0.14;
          c.raycast = () => {};
        }
      });

      let mixer = null;
      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(clone);
        const action = mixer.clipAction(gltf.animations[0]);
        action.timeScale = 1.15 + (i % 4) * 0.15;
        action.play();
        mixer.update(0.05 + i * 0.73);
      }
      clone.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(clone);
      const bCenter = box.getCenter(new THREE.Vector3());
      const bSize = box.getSize(new THREE.Vector3());
      const targetLen = 0.30 + (i % 3) * 0.045; // 30-39cm vibrant pond ryukin!
      const s = targetLen / Math.max(0.01, bSize.z);

      const wrapper = new THREE.Group();
      clone.scale.setScalar(s);
      clone.position.set(-bCenter.x * s, -bCenter.y * s, -bCenter.z * s);
      wrapper.add(clone);
      pondRoot.add(wrapper);

      swimmers.push({
        wrapper,
        mixer,
        orbitRx: 1.15 + (i % 5) * 0.56,
        orbitRz: 0.85 + ((i + 2) % 4) * 0.48,
        centerX: cx + ((i % 3) - 1) * 0.85,
        centerZ: cz + 0.35 + ((i % 2) * 0.65),
        swimY: 1.62 + (i % 4) * 0.075,
        speed: (0.28 + (i % 4) * 0.06) * (i % 2 === 0 ? 1 : -1),
        phase: i * 1.24,
        fig8: i % 3 === 0,
      });
    }
  }

  // 2) 12 Ornamental Koi / Goldfish (pond_koi.glb, head rotated from -X to +Z)
  if (extracted.pond_koi.parts.length) {
    const koiSize = extracted.pond_koi.size;
    const koiScaleBase = 0.34 / Math.max(0.005, koiSize.x);
    const koiColors = [0xff6b2b, 0xff9f40, 0xfff2e2, 0xf24938, 0xffbe55, 0xffdfd0];

    for (let i = 0; i < 12; i += 1) {
      const wrapper = new THREE.Group();
      const bodyPivot = new THREE.Group();
      const tint = koiColors[i % koiColors.length];
      for (const part of extracted.pond_koi.parts) {
        const mat = part.material.clone();
        mat.color.setHex(tint);
        mat.emissive = new THREE.Color(tint).multiplyScalar(0.12);
        const m = new THREE.Mesh(part.geometry, mat);
        // Raw head is along -X; rotateY(+PI/2) aligns -X -> +Z so lookAt swims head-first!
        m.rotation.y = Math.PI * 0.5;
        bodyPivot.add(m);
      }
      const sc = koiScaleBase * (0.88 + (i % 4) * 0.12);
      bodyPivot.scale.setScalar(sc);
      wrapper.add(bodyPivot);
      pondRoot.add(wrapper);

      swimmers.push({
        wrapper,
        bodyPivot,
        mixer: null,
        orbitRx: 1.35 + (i % 5) * 0.58,
        orbitRz: 0.95 + ((i + 1) % 4) * 0.46,
        centerX: cx + ((i % 4) - 1.5) * 0.72,
        centerZ: cz + 0.15 + ((i % 3) - 1) * 0.55,
        swimY: 1.52 + (i % 5) * 0.07,
        speed: (0.34 + (i % 3) * 0.07) * (i % 2 === 0 ? -1 : 1),
        phase: i * 0.92 + 0.4,
        fig8: i % 2 === 1,
      });
    }
  }

  // 3) 9 Skeletal-Animated Giant Freshwater River Shrimp (freshwater_shrimp.glb)
  if (models.freshwater_shrimp?.scene) {
    const gltf = models.freshwater_shrimp;
    for (let i = 0; i < 9; i += 1) {
      const clone = SkeletonUtils.clone(gltf.scene);
      clone.traverse((c) => {
        if (c.isMesh && c.material) {
          c.material = tuneMaterialForPBR(c.material, { isAquatic: true });
          // Warm amber-jade translucent river-shrimp carapace highlight
          c.material.color.setHex(i % 3 === 0 ? 0xf6d5b0 : i % 3 === 1 ? 0xddebe8 : 0xf2c29b);
          c.material.emissive = new THREE.Color(0x281c12);
          c.material.emissiveIntensity = 0.15;
          c.userData.noCastShadow = true;
          c.raycast = () => {};
        }
      });

      let mixer = null;
      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(clone);
        const action = mixer.clipAction(gltf.animations[0]);
        action.timeScale = 1.1 + (i % 5) * 0.14;
        action.play();
        mixer.update(0.05 + i * 0.67);
      }

      // Raw shrimp head & antennae point along -Z; rotate clone by PI so head points along +Z!
      clone.rotation.y = Math.PI;
      clone.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(clone);
      const bCenter = box.getCenter(new THREE.Vector3());
      const bSize = box.getSize(new THREE.Vector3());
      const targetLen = 0.27 + (i % 3) * 0.04; // 27-35cm Macrobrachium river prawn so antennae & pincers are unmistakable!
      const s = targetLen / Math.max(0.01, bSize.z);

      const wrapper = new THREE.Group();
      clone.scale.setScalar(s);
      clone.position.set(-bCenter.x * s, -box.min.y * s, -bCenter.z * s);
      wrapper.add(clone);
      pondRoot.add(wrapper);

      if (i < 6) {
        // 6 Shrimp perched clearly on shallow sunlit limestone shelf stones right by the South/West rim!
        const sh = shrimpShelves[i % shrimpShelves.length];
        const offAng = (i * 2.1) % (Math.PI * 2);
        const baseX = sh.x + Math.cos(offAng) * 0.12;
        const baseZ = sh.z + Math.sin(offAng) * 0.10;
        wrapper.position.set(baseX, sh.y + 0.005, baseZ);
        shrimpActors.push({
          wrapper,
          mixer,
          mode: "shelf",
          baseX,
          baseY: sh.y + 0.005,
          baseZ,
          roamR: 0.22,
          speed: 0.35 + (i % 3) * 0.1,
          phase: i * 1.37,
        });
      } else {
        // 3 Free-swimming / bottom-gliding river shrimp darting gracefully between pebbles
        const idx = i - 6;
        shrimpActors.push({
          wrapper,
          mixer,
          mode: "swim",
          centerX: cx + ((idx % 3) - 1) * 1.15,
          centerZ: cz + 0.8 + (idx % 2) * 0.85,
          roamRx: 0.95 + (idx % 3) * 0.35,
          roamRz: 0.65 + (idx % 2) * 0.35,
          baseY: 1.36 + (idx % 3) * 0.08,
          speed: 0.42 + (idx % 3) * 0.09,
          phase: idx * 1.15,
        });
      }
    }
  }

  animState.swimmers = swimmers;
  animState.shrimpActors = shrimpActors;

  // --- I. Reference Image 1 Pond-Bank Palms, Overhanging Pink Roses, Ferns & Periwinkle ---
  const palmTrunkMat = pbrWoodMat(0x7c6248, { roughness: 0.84 });
  const palmFrondMat = new THREE.MeshStandardMaterial({
    color: 0x3e7840,
    roughness: 0.58,
    side: THREE.DoubleSide,
  });
  for (const [px, pz, ph, rotY, seed] of [
    [cx + 3.9, cz - 2.6, 3.85, -1.15, 301],
    [cx + 4.7, cz - 0.9, 3.25, -1.45, 302],
    [cx - 4.8, cz - 2.9, 3.45, 1.12, 303],
  ]) {
    const palm = buildWatersideWeepingPalm(palmTrunkMat, palmFrondMat, ph, seed);
    palm.position.set(px, 2.18, pz);
    palm.rotation.y = rotY;
    pondRoot.add(palm);
  }

  // Interactive tag on the pond group so clicking ANY part of the pond/waterfall dives in & ripples!
  tagInteractive(pondRoot, "garden-pond", "莫奈睡莲鱼虾池");
  parent.add(pondRoot);
}

// ---------------------------------------------------------------------------
// 2. Cascading Bougainvillea & White Tubular A-Frame Two-Person Swing Garden
// ---------------------------------------------------------------------------

function buildTwoPersonSwingZone(parent, animState) {
  const swingGarden = new THREE.Group();
  swingGarden.name = "BougainvilleaTwoPersonSwingGarden";
  const { cx, cz, groundY } = SWING_CONFIG;

  // Pale Pebble Garden Pathway leading straight from South approach -> under Swing -> East to Villa Courtyard
  const pebbleMat = createPebblePathMat();
  const pathPts = [
    new THREE.Vector3(cx, groundY + 0.018, cz + 7.2),
    new THREE.Vector3(cx, groundY + 0.018, cz + 2.8),
    new THREE.Vector3(cx, groundY + 0.018, cz - 0.5),
    new THREE.Vector3(cx + 3.2, groundY + 0.018, cz - 2.8),
    new THREE.Vector3(-20.0, groundY + 0.022, 9.8),
  ];
  const pathCurve = new THREE.CatmullRomCurve3(pathPts);
  const pathSegs = 44;
  const pathHalfW = 1.28;
  const pPos = [];
  const pUvs = [];
  const pIdx = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= pathSegs; i += 1) {
    const u = i / pathSegs;
    const pt = pathCurve.getPointAt(u);
    const tan = pathCurve.getTangentAt(u).setY(0).normalize();
    const side = new THREE.Vector3().crossVectors(up, tan).normalize();
    const w = pathHalfW * (1.0 + 0.14 * Math.sin(u * Math.PI));
    const pL = pt.clone().addScaledVector(side, w);
    const pR = pt.clone().addScaledVector(side, -w);
    pPos.push(pL.x, pL.y, pL.z, pR.x, pR.y, pR.z);
    pUvs.push(0, u * 6, 1, u * 6);
    if (i < pathSegs) {
      const a = i * 2;
      pIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const pathGeo = new THREE.BufferGeometry();
  pathGeo.setAttribute("position", new THREE.Float32BufferAttribute(pPos, 3));
  pathGeo.setAttribute("uv", new THREE.Float32BufferAttribute(pUvs, 2));
  pathGeo.setIndex(pIdx);
  pathGeo.computeVertexNormals();
  const pathMesh = new THREE.Mesh(pathGeo, pebbleMat);
  pathMesh.receiveShadow = true;
  swingGarden.add(pathMesh);

  registerWalkZone((x, z) => {
    if (x >= cx - 4.5 && x <= cx + 4.5 && z >= cz - 4.0 && z <= cz + 8.0) return groundY + 0.02;
    return null;
  });

  // --- Exquisite Crisp White Powder-Coated Tubular A-Frame Two-Person Swing (Reference Image 2) ---
  const swingGroup = new THREE.Group();
  swingGroup.position.set(cx, groundY, cz);

  const whiteSteelMat = new THREE.MeshPhysicalMaterial({
    color: 0xfafbfd,
    roughness: 0.24,
    metalness: 0.18,
    clearcoat: 0.72,
    clearcoatRoughness: 0.18,
  });
  const chainMetalMat = pbrMetalMat(0xd6d2e2, { roughness: 0.24, metalness: 0.88 });
  const warmSlatsMat = pbrWoodMat(0xf5efe6, { roughness: 0.42 });
  const cushionBlush = pbrFabricMat(0xf7dce4, { roughness: 0.78 });
  const cushionIvory = pbrFabricMat(0xfcf8f2, { roughness: 0.76 });
  const pillowLilac = pbrFabricMat(0xd8b8ea, { roughness: 0.74 });
  const pillowCoral = pbrFabricMat(0xf5a8a2, { roughness: 0.74 });

  const addTubeSeg = (target, p1, p2, radius, mat) => {
    const dir = p2.clone().sub(p1);
    const len = dir.length();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 14), mat);
    cyl.position.copy(p1).addScaledVector(dir, 0.5);
    cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    cyl.castShadow = true;
    cyl.receiveShadow = true;
    target.add(cyl);
  };

  const halfSpan = 1.54;
  const topY = 2.42;
  const footSpreadZ = 0.94;

  // Left & Right White Tubular A-Frames + Crossbars + Foot Pads + Colliders
  for (const sx of [-1, 1]) {
    const xTop = sx * (halfSpan - 0.08);
    const xFoot = sx * (halfSpan + 0.14);
    const pTop = new THREE.Vector3(xTop, topY, 0);
    const pFront = new THREE.Vector3(xFoot, 0.02, footSpreadZ);
    const pBack = new THREE.Vector3(xFoot, 0.02, -footSpreadZ);

    addTubeSeg(swingGroup, pFront, pTop, 0.042, whiteSteelMat);
    addTubeSeg(swingGroup, pBack, pTop, 0.042, whiteSteelMat);

    // Horizontal A-brace at Y = 0.78m
    const tBrace = 0.32;
    const bFront = pFront.clone().lerp(pTop, tBrace);
    const bBack = pBack.clone().lerp(pTop, tBrace);
    addTubeSeg(swingGroup, bFront, bBack, 0.032, whiteSteelMat);

    // Top gusset brace to overhead beam
    addTubeSeg(
      swingGroup,
      pFront.clone().lerp(pTop, 0.82),
      new THREE.Vector3(sx * (halfSpan - 0.48), topY, 0),
      0.028,
      whiteSteelMat
    );
    addTubeSeg(
      swingGroup,
      pBack.clone().lerp(pTop, 0.82),
      new THREE.Vector3(sx * (halfSpan - 0.48), topY, 0),
      0.028,
      whiteSteelMat
    );

    for (const fz of [-footSpreadZ, footSpreadZ]) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.04, 14), whiteSteelMat);
      pad.position.set(xFoot, 0.02, fz);
      swingGroup.add(pad);
    }
    const apexCap = new THREE.Mesh(new THREE.SphereGeometry(0.056, 14, 10), whiteSteelMat);
    apexCap.position.copy(pTop);
    swingGroup.add(apexCap);

    registerCircleCollider(cx + xFoot, cz, 0.42);
  }
  // Center swing bench collider so player walks around or stands right in front without clipping through seat
  registerCircleCollider(cx, cz, 0.78);

  // Heavy Top Crossbeam with decorative end finials
  addTubeSeg(
    swingGroup,
    new THREE.Vector3(-halfSpan - 0.16, topY, 0),
    new THREE.Vector3(halfSpan + 0.16, topY, 0),
    0.048,
    whiteSteelMat
  );
  for (const sx of [-1, 1]) {
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 10), whiteSteelMat);
    finial.position.set(sx * (halfSpan + 0.18), topY, 0);
    swingGroup.add(finial);
  }

  // Swinging Assembly suspended from Y = topY - 0.04
  const swingPivot = new THREE.Group();
  swingPivot.position.set(0, topY - 0.04, 0);
  swingGroup.add(swingPivot);

  const seatLocalY = -1.78; // -> World Y = 2.38 - 1.78 = 0.60m above ground!
  const benchW = 1.56;
  const chainX = benchW * 0.5 + 0.06;

  // Articulated 3D Torus Link Chains merged into ONE single draw call!
  const baseLinkGeo = new THREE.TorusGeometry(0.021, 0.0055, 6, 10).toNonIndexed();
  const chainGeos = [];
  const addLinkChain = (pStart, pEnd) => {
    const dir = pEnd.clone().sub(pStart);
    const total = dir.length();
    const dirN = dir.clone().normalize();
    const count = Math.max(3, Math.floor(total / 0.034));
    const qBase = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirN);
    for (let i = 0; i <= count; i += 1) {
      const g = baseLinkGeo.clone();
      const q = qBase.clone();
      if (i % 2 === 1) {
        q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 0.5));
      }
      const m = new THREE.Matrix4().compose(
        pStart.clone().addScaledVector(dir, i / count),
        q,
        new THREE.Vector3(1, 1, 1)
      );
      g.applyMatrix4(m);
      chainGeos.push(g);
    }
  };

  for (const sx of [-1, 1]) {
    const topHook = new THREE.Vector3(sx * chainX, 0, 0);
    const splitNode = new THREE.Vector3(sx * chainX, -1.08, 0);
    const frontArm = new THREE.Vector3(sx * chainX, seatLocalY + 0.24, 0.25);
    const backArm = new THREE.Vector3(sx * chainX, seatLocalY + 0.44, -0.24);

    const ringGeo = new THREE.TorusGeometry(0.032, 0.008, 8, 14).toNonIndexed();
    ringGeo.translate(splitNode.x, splitNode.y, splitNode.z);
    chainGeos.push(ringGeo);

    addLinkChain(topHook, splitNode);
    addLinkChain(splitNode, frontArm);
    addLinkChain(splitNode, backArm);
  }
  const mergedChainMesh = new THREE.Mesh(mergeGeometries(chainGeos, false), chainMetalMat);
  swingPivot.add(mergedChainMesh);

  // Ergonomic Two-Person Slatted White Loveseat Bench + Tufted Cushions + Pillows
  const bench = new THREE.Group();
  bench.position.set(0, seatLocalY, 0);

  // Side seat rails & backrest stiles
  for (const sx of [-1, 1]) {
    const rx = sx * (benchW * 0.5 + 0.04);
    addTubeSeg(bench, new THREE.Vector3(rx, 0, -0.28), new THREE.Vector3(rx, 0, 0.28), 0.024, whiteSteelMat);
    addTubeSeg(bench, new THREE.Vector3(rx, 0, -0.25), new THREE.Vector3(rx, 0.64, -0.36), 0.024, whiteSteelMat);
    // Scrolled armrest
    addTubeSeg(bench, new THREE.Vector3(rx, 0, 0.25), new THREE.Vector3(rx, 0.24, 0.25), 0.022, whiteSteelMat);
    addTubeSeg(bench, new THREE.Vector3(rx, 0.24, 0.26), new THREE.Vector3(rx, 0.26, -0.27), 0.026, whiteSteelMat);
  }
  // Curved cameo top crest bar on backrest
  addTubeSeg(
    bench,
    new THREE.Vector3(-benchW * 0.5 - 0.04, 0.64, -0.36),
    new THREE.Vector3(benchW * 0.5 + 0.04, 0.64, -0.36),
    0.026,
    whiteSteelMat
  );

  // 8 Contoured Seat Slats
  for (let s = 0; s < 8; s += 1) {
    const zOff = -0.23 + s * 0.068;
    const dip = -Math.sin((s / 7) * Math.PI) * 0.018;
    const slat = new THREE.Mesh(new THREE.BoxGeometry(benchW, 0.022, 0.052), warmSlatsMat);
    slat.position.set(0, dip, zOff);
    slat.castShadow = true;
    slat.receiveShadow = true;
    bench.add(slat);
  }
  // 7 Contoured Backrest Slats
  for (let s = 0; s < 7; s += 1) {
    const t = s / 6;
    const yOff = 0.08 + t * 0.50;
    const zOff = -0.26 - t * 0.095;
    const slat = new THREE.Mesh(new THREE.BoxGeometry(benchW, 0.054, 0.02), warmSlatsMat);
    slat.position.set(0, yOff, zOff);
    slat.rotation.x = -0.18;
    slat.castShadow = true;
    bench.add(slat);
  }

  // Two-Person Plush Seat & Back Cushions + Pastel Throw Pillows
  for (const sx of [-1, 1]) {
    const seatCush = new THREE.Mesh(new THREE.BoxGeometry(0.73, 0.095, 0.50), cushionIvory);
    seatCush.position.set(sx * 0.38, 0.052, 0.01);
    seatCush.castShadow = true;
    const backCush = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.44, 0.095), cushionBlush);
    backCush.position.set(sx * 0.38, 0.31, -0.24);
    backCush.rotation.x = -0.18;
    backCush.castShadow = true;
    bench.add(seatCush, backCush);
  }
  const pLeft = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.28, 0.11), pillowLilac);
  pLeft.position.set(-0.56, 0.24, -0.12);
  pLeft.rotation.set(-0.15, 0.38, 0.12);
  const pRight = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.28, 0.11), pillowCoral);
  pRight.position.set(0.56, 0.24, -0.12);
  pRight.rotation.set(-0.15, -0.38, -0.12);
  bench.add(pLeft, pRight);

  swingPivot.add(bench);
  tagInteractive(swingGroup, "couple-swing", "繁花双人秋千");
  swingGarden.add(swingGroup);
  animState.swingPivot = swingPivot;

  // --- Supporting Trellis Arches Framing the Swing (Reference Image 2 Cascading Floral Canopy) ---
  const darkIronMat = pbrMetalMat(0x3a423d, { roughness: 0.48, metalness: 0.72 });
  for (const [archZ, spanW, archH] of [
    [cz + 2.55, 4.15, 3.85],
    [cz - 0.15, 4.45, 4.05],
    [cz - 2.65, 4.15, 3.85],
  ]) {
    const halfA = spanW * 0.5;
    const archCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(cx - halfA, groundY, archZ),
      new THREE.Vector3(cx - halfA * 0.96, groundY + archH * 0.58, archZ),
      new THREE.Vector3(cx - halfA * 0.52, groundY + archH * 0.92, archZ),
      new THREE.Vector3(cx, groundY + archH, archZ),
      new THREE.Vector3(cx + halfA * 0.52, groundY + archH * 0.92, archZ),
      new THREE.Vector3(cx + halfA * 0.96, groundY + archH * 0.58, archZ),
      new THREE.Vector3(cx + halfA, groundY, archZ),
    ]);
    const archTube = new THREE.Mesh(
      new THREE.TubeGeometry(archCurve, 24, 0.036, 8, false),
      darkIronMat
    );
    archTube.castShadow = true;
    swingGarden.add(archTube);
  }

  parent.add(swingGarden);
}

// ---------------------------------------------------------------------------
// 3. Master Botanical GLB Floral Composition Across Pond, Swing & Monet Paths
// ---------------------------------------------------------------------------

function buildAllGLBFlora(parent, extracted) {
  const floraRoot = new THREE.Group();
  floraRoot.name = "GLBReferenceGardensFlora";

  const rng = mulberry32(202611);
  const rosePlacements = [];
  const daisyPlacements = [];
  const wisteriaPlacements = [];
  const fernPlacements = [];
  const periwinklePlacements = [];

  const { cx: scx, cz: scz, groundY: sy } = SWING_CONFIG;
  const { cx: pcx, cz: pcz } = POND_CONFIG;

  // --- ZONE A: Reference Image 2 — Bougainvillea & Rose Two-Person Swing Secret Garden ---
  // 1) Foreground Low Snow-White Floral Drifts flanking both edges of the open pebble path!
  for (let i = 0; i < 32; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const zOff = 1.6 + (i / 32) * 5.2 + (rng() - 0.5) * 0.35;
    const xOff = side * (1.65 + rng() * 1.85); // Leave 3.3m wide clear path down center!
    rosePlacements.push({
      x: scx + xOff,
      y: sy - 0.06,
      z: scz + zOff,
      ry: rng() * Math.PI * 2,
      sx: 0.76 + rng() * 0.28,
      sy: 0.38 + rng() * 0.16,
      sz: 0.76 + rng() * 0.28,
      color: i % 4 === 0 ? 0xfff8ee : 0xffffff,
    });
    daisyPlacements.push({
      x: scx + side * (1.38 + rng() * 0.85),
      y: sy - 0.02,
      z: scz + zOff + (rng() - 0.5) * 0.35,
      ry: rng() * Math.PI * 2,
      s: 0.36 + rng() * 0.15,
    });
  }

  // 2) Midground Lavender-Lilac, Orchid-Violet & Blush-Pink Hedges wrapping BEHIND & BESIDE the White Swing!
  // Strictly keep front pebble-path sightline (z > scz - 0.4 && |x - scx| < 2.05) 100% open!
  const lilacPalette = [0xdc9ef0, 0xee9fd2, 0xc792ea, 0xf6b8d8, 0xe5a8f2];
  for (let i = 0; i < 40; i += 1) {
    // Arc from left flank (-PI*0.62) around the back (0) to right flank (+PI*0.62)
    const theta = ((i / 39) - 0.5) * Math.PI * 1.28;
    const ring = i % 2;
    const radX = 2.25 + ring * 0.78 + (rng() - 0.5) * 0.22;
    const radZ = 1.65 + ring * 0.72 + (rng() - 0.5) * 0.22;
    const px = scx + Math.sin(theta) * radX;
    const pz = scz - Math.cos(theta) * radZ;
    if (pz > scz - 0.35 && Math.abs(px - scx) < 2.1) continue;
    if (px > scx + 1.4 && pz < scz - 1.3 && pz > scz - 3.6) continue;

    rosePlacements.push({
      x: px,
      y: sy - 0.05,
      z: pz,
      ry: rng() * Math.PI * 2,
      sx: 0.85 + rng() * 0.28,
      sy: (pz > scz - 0.8 ? 0.54 : 0.78) + rng() * 0.28,
      sz: 0.85 + rng() * 0.28,
      color: lilacPalette[i % lilacPalette.length],
    });
  }

  // 3) Towering Cascading Bougainvillea Arches & Floral Walls Overhead (Coral-Red, Sunset-Amber, Magenta, Blush, Ivory!)
  const bougainvilleaPalette = [
    0xe8485c, // Fiery Coral-Red
    0xf59d42, // Sunset Amber-Gold
    0xdc3b76, // Bougainvillea Magenta
    0xf7785b, // Warm Tangerine-Coral
    0xf7b2bd, // Soft Rose-Blush
    0xfff5e8, // Sunlit Ivory
  ];
  for (const [archZ, spanW, archH] of [
    [scz + 2.55, 4.15, 3.85],
    [scz - 0.15, 4.45, 4.05],
    [scz - 2.65, 4.15, 3.85],
  ]) {
    const halfA = spanW * 0.5;
    const steps = 18;
    for (let s = 0; s <= steps; s += 1) {
      const u = s / steps;
      const theta = (u - 0.5) * Math.PI;
      const ax = scx + Math.sin(theta) * halfA;
      const ay = sy + Math.cos(theta) * archH;
      if (ay < sy + 0.65) continue;

      const col = bougainvilleaPalette[(s + Math.round(archZ)) % bougainvilleaPalette.length];
      rosePlacements.push({
        x: ax + (rng() - 0.5) * 0.22,
        y: ay - 0.28,
        z: archZ + (rng() - 0.5) * 0.32,
        rx: (rng() - 0.5) * 0.3,
        ry: rng() * Math.PI * 2,
        rz: -theta * 0.45,
        sx: 0.68 + rng() * 0.24,
        sy: 0.55 + rng() * 0.22,
        sz: 0.68 + rng() * 0.24,
        color: col,
      });

      // Hanging Bougainvillea / Wisteria cascades framing the arch crown without blocking the swing seat!
      const isFrontCenter = archZ > scz + 1.0 && Math.abs(ax - scx) < 1.15;
      if (ay > sy + (isFrontCenter ? 3.05 : 2.35)) {
        for (let c = 0; c < (isFrontCenter ? 1 : 2); c += 1) {
          wisteriaPlacements.push({
            x: ax + (rng() - 0.5) * 0.42,
            y: ay + 0.18 - rng() * 0.14,
            z: archZ + (rng() - 0.5) * 0.45,
            ry: rng() * Math.PI * 2,
            sx: 0.88 + rng() * 0.35,
            sy: (isFrontCenter ? 0.68 : 0.92) + rng() * 0.35,
            sz: 0.88 + rng() * 0.35,
            color: bougainvilleaPalette[(s + c * 2) % bougainvilleaPalette.length],
            tintAll: true,
          });
        }
      }
    }
  }

  // --- ZONE B: Reference Image 1 — Pond Waterfall Pink Rose Clusters, Ferns & Periwinkle ---
  const pondRosePalette = [0xf47da2, 0xf79cb8, 0xe85a86, 0xffbfd2];
  // Lush overhanging pink flowering shrubs on West & East waterfall rocks
  for (const [bx, by, bz, sc, colIdx] of [
    [pcx - 3.6, 2.18, pcz - 3.1, 1.05, 0],
    [pcx - 2.9, 2.75, pcz - 3.8, 0.96, 1],
    [pcx - 4.2, 2.15, pcz - 1.8, 0.92, 2],
    [pcx - 2.2, 3.25, pcz - 4.3, 0.84, 3],
    [pcx + 2.8, 2.65, pcz - 3.9, 0.88, 0],
    [pcx + 4.2, 2.15, pcz + 0.6, 0.86, 1],
    [pcx - 4.6, 2.15, pcz + 0.8, 0.82, 3],
  ]) {
    rosePlacements.push({
      x: bx,
      y: by,
      z: bz,
      ry: rng() * Math.PI * 2,
      s: sc,
      color: pondRosePalette[colIdx % pondRosePalette.length],
    });
  }

  // Photogrammetry Ferns (ph_fern.glb) & Periwinkle (ph_periwinkle.glb) hugging mossy pond boulders
  for (let i = 0; i < 24; i += 1) {
    const ang = (i / 24) * Math.PI * 2;
    if (Math.sin(ang) > 0.48 && Math.abs(Math.cos(ang)) < 0.65) continue; // Keep south viewing stones clear
    const fx = pcx + Math.cos(ang) * (POND_CONFIG.rx * 1.12 + (rng() - 0.5) * 0.4);
    const fz = pcz + Math.sin(ang) * (POND_CONFIG.rz * 1.12 + (rng() - 0.5) * 0.4);
    const fy = Math.max(2.16, getWorldTerrainY(fx, fz));
    fernPlacements.push({
      x: fx,
      y: fy - 0.02,
      z: fz,
      ry: rng() * Math.PI * 2,
      s: 0.62 + rng() * 0.28,
    });
    periwinklePlacements.push({
      x: fx + (rng() - 0.5) * 0.7,
      y: fy - 0.01,
      z: fz + (rng() - 0.5) * 0.7,
      ry: rng() * Math.PI * 2,
      s: 0.85 + rng() * 0.32,
    });
  }

  // --- ZONE C: Reference Image 3 — Monet's Giverny Multi-Tiered Flower-Drenched Stone Paths ---
  // Central Monet Flagstone Walk: x = -14.0, z = +11.2 .. +22.8, plus connecting walks to Pond & Swing!
  const monetGroup = new THREE.Group();
  const monetStoneMat = pbrStoneMat(0xded6c5, { roughness: 0.82, repeatX: 2, repeatY: 2 });
  const ironArchMat = pbrMetalMat(0x3d4a42, { roughness: 0.5, metalness: 0.7 });

  // Stepping flagstones from Courtyard (z = 11.8) south to z = 22.4, and east to Pond (-5.5, 18.5)
  const walkSegments = [
    ...Array.from({ length: 11 }, (_, k) => [-14.0 + Math.sin(k * 0.6) * 0.25, 12.4 + k * 0.98]),
    [-12.2, 14.8],
    [-10.4, 16.0],
    [-8.6, 17.2],
    [-6.8, 18.2],
    [-5.0, 19.2],
  ];
  for (let i = 0; i < walkSegments.length; i += 1) {
    const [sx, sz] = walkSegments[i];
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.72, 0.08, 8), monetStoneMat);
    slab.scale.set(1.18, 1.0, 0.82);
    slab.rotation.y = i * 0.45;
    slab.position.set(sx, 2.20, sz);
    slab.receiveShadow = true;
    monetGroup.add(slab);
  }

  // Two Monet Giverny Wisteria & Climbing-Rose Arches over the Central Walk (z = 15.2 & z = 19.6)
  for (const az of [15.2, 19.6]) {
    const archCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-15.75, 2.2, az),
      new THREE.Vector3(-15.65, 4.2, az),
      new THREE.Vector3(-14.0, 5.45, az),
      new THREE.Vector3(-12.35, 4.2, az),
      new THREE.Vector3(-12.25, 2.2, az),
    ]);
    const archMesh = new THREE.Mesh(
      new THREE.TubeGeometry(archCurve, 20, 0.032, 8, false),
      ironArchMat
    );
    archMesh.castShadow = true;
    monetGroup.add(archMesh);

    const archCols = [0xf7a8c4, 0xcda4f2, 0xfff3e2, 0xf2799b, 0xb8b4f8];
    for (let s = 1; s <= 13; s += 1) {
      const pt = archCurve.getPointAt(s / 14);
      rosePlacements.push({
        x: pt.x + (rng() - 0.5) * 0.22,
        y: pt.y - 0.42,
        z: pt.z + (rng() - 0.5) * 0.28,
        ry: rng() * Math.PI * 2,
        s: 0.66 + rng() * 0.22,
        color: archCols[s % archCols.length],
      });
      if (pt.y > 4.1) {
        wisteriaPlacements.push({
          x: pt.x + (rng() - 0.5) * 0.35,
          y: pt.y + 0.08,
          z: pt.z + (rng() - 0.5) * 0.38,
          ry: rng() * Math.PI * 2,
          s: 0.92 + rng() * 0.35,
          color: s % 2 === 0 ? 0xd2aff8 : 0xf9c6dc,
          tintAll: true,
        });
      }
    }
  }
  floraRoot.add(monetGroup);

  // Impressionist Multi-Tiered Giverny Borders along both sides of Central Walk, Courtyard & Villa Front!
  const givernyPalette = [
    0xf7a6c1, // Pastel Giverny Rose
    0xb7a6f6, // Impressionist Lavender-Blue
    0xffe694, // Buttercup Yellow
    0xf57e8e, // Warm Coral-Rose
    0xfff8ef, // Ivory Cream
    0xdba2ee, // Soft Mauve-Violet
    0x9ec4f8, // Delphinium Sky-Blue
  ];

  // Dense borders flanking x = -14.0 walk (z = 11.8 .. 22.8)
  for (let i = 0; i < 56; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const zPos = 11.8 + (i / 56) * 10.8 + (rng() - 0.5) * 0.35;
    const tier = i % 3; // 0 = low front drift, 1 = mid rose bush, 2 = tall back border
    const xPos = -14.0 + side * (1.55 + tier * 0.85 + rng() * 0.45);
    rosePlacements.push({
      x: xPos,
      y: 2.16,
      z: zPos,
      ry: rng() * Math.PI * 2,
      sx: 0.68 + tier * 0.16 + rng() * 0.18,
      sy: 0.48 + tier * 0.26 + rng() * 0.18,
      sz: 0.68 + tier * 0.16 + rng() * 0.18,
      color: givernyPalette[(i * 3 + tier) % givernyPalette.length],
    });
    if (tier === 0) {
      daisyPlacements.push({
        x: -14.0 + side * (1.28 + rng() * 0.45),
        y: 2.18,
        z: zPos + 0.22,
        ry: rng() * Math.PI * 2,
        s: 0.36 + rng() * 0.14,
      });
      periwinklePlacements.push({
        x: -14.0 + side * (1.18 + rng() * 0.35),
        y: 2.19,
        z: zPos - 0.18,
        ry: rng() * Math.PI * 2,
        s: 0.78 + rng() * 0.25,
      });
    }
  }

  // Connecting Floral Meadow Drifts uniting Swing Secret Garden, Monet Walk & Pond Terrace!
  const ribbonSpots = [
    [-24.2, 10.6], [-22.6, 11.4], [-21.0, 12.2], [-19.4, 12.6], [-23.4, 13.6], [-21.5, 14.2],
    [-23.8, 16.0], [-21.6, 16.8], [-19.5, 15.6], [-18.2, 17.8], [-22.8, 19.2], [-20.4, 20.5], [-18.0, 21.2],
    [-11.2, 13.4], [-9.6, 14.4], [-8.2, 15.2], [-10.8, 16.8], [-9.0, 18.2], [-7.4, 19.4],
    [-10.6, 20.2], [-8.8, 21.0], [-6.8, 21.4],
    // Villa south & east garden beds
    [-23.2, 5.4], [-21.4, 5.6], [-19.6, 5.5], [-8.2, 5.5], [-6.4, 5.6], [-2.2, 6.2], [0.8, 7.6], [2.4, 9.8],
  ];
  for (let i = 0; i < ribbonSpots.length; i += 1) {
    const [rx, rz] = ribbonSpots[i];
    rosePlacements.push({
      x: rx,
      y: 2.16,
      z: rz,
      ry: rng() * Math.PI * 2,
      s: 0.76 + rng() * 0.28,
      color: givernyPalette[i % givernyPalette.length],
    });
    if (i % 2 === 0) {
      daisyPlacements.push({
        x: rx + (rng() - 0.5) * 0.9,
        y: 2.18,
        z: rz + 0.55,
        ry: rng() * Math.PI * 2,
        s: 0.38 + rng() * 0.15,
      });
    }
  }

  floraRoot.add(
    buildInstancedGLBBatch(extracted.rose_bush, rosePlacements, { castShadow: false, receiveShadow: true })
  );
  floraRoot.add(
    buildInstancedGLBBatch(extracted.margarita_bush, daisyPlacements, { castShadow: false, receiveShadow: true })
  );
  floraRoot.add(
    buildInstancedGLBBatch(extracted.wisteria_cascade, wisteriaPlacements, { castShadow: false, receiveShadow: true })
  );
  floraRoot.add(
    buildInstancedGLBBatch(extracted.ph_fern, fernPlacements, { castShadow: false, receiveShadow: true })
  );
  floraRoot.add(
    buildInstancedGLBBatch(extracted.ph_periwinkle, periwinklePlacements, { castShadow: false, receiveShadow: true })
  );

  parent.add(floraRoot);
}

// Mounts ultra-high-detail velvet 3D Hero Roses (hero_rose.glb) into Villa indoor vases!
function upgradeIndoorVasesWithHeroRoses(villaGroup, heroRoseExtracted) {
  if (!villaGroup || !heroRoseExtracted.parts.length) return;

  const buildStem = (scale, rotX, rotY, rotZ) => {
    const g = new THREE.Group();
    for (const p of heroRoseExtracted.parts) {
      g.add(new THREE.Mesh(p.geometry, p.material));
    }
    g.scale.setScalar(scale);
    g.rotation.set(rotX, rotY, rotZ);
    return g;
  };

  villaGroup.traverse((obj) => {
    if (!obj.userData?.isHeroRoseVase) return;
    const stem = buildStem(0.29, 0.06, 0.4, -0.05);
    stem.position.y = 0.09;
    obj.add(stem);
  });
}

// ---------------------------------------------------------------------------
// Public Builder Entrypoint
// ---------------------------------------------------------------------------

export async function buildSecretGardensAndPond({ villaGroup = null } = {}) {
  const group = new THREE.Group();
  group.name = "SecretGardensAndCrystalPond";

  const models = await loadAllGardenModels();

  const extracted = {
    rose_bush: extractNormalizedParts(models.rose_bush, { alignY: "min", isFoliage: true }),
    margarita_bush: extractNormalizedParts(models.margarita_bush, { alignY: "min", isFoliage: true }),
    // Select Mesh Object_2 (> 5,000 verts) so each instance is the single centered 15k-vert floral cascade!
    wisteria_cascade: extractNormalizedParts(models.wisteria_cascade, {
      alignY: "max",
      isFoliage: true,
      filterFn: (m) => (m.geometry.attributes.position?.count || 0) > 4000,
    }),
    waterlily: extractNormalizedParts(models.waterlily, { alignY: "min", isFoliage: true }),
    ph_fern: extractNormalizedParts(models.ph_fern, { alignY: "min", isFoliage: true }),
    ph_periwinkle: extractNormalizedParts(models.ph_periwinkle, { alignY: "min", isFoliage: true }),
    hero_rose: extractNormalizedParts(models.hero_rose, { alignY: "min", isFoliage: true }),
    pond_koi: extractNormalizedParts(models.pond_koi, {
      alignY: "center",
      isAquatic: true,
      isFoliage: false,
    }),
  };

  const animState = {
    waterfallMap: null,
    pondNormal: null,
    foamRings: [],
    lilyClusters: [],
    swimmers: [],
    shrimpActors: [],
    swingPivot: null,
    swingBoost: 0,
    pondExcite: 0,
  };

  buildMonetPondZone(group, models, extracted, animState);
  buildTwoPersonSwingZone(group, animState);
  buildAllGLBFlora(group, extracted);
  upgradeIndoorVasesWithHeroRoses(villaGroup, extracted.hero_rose);

  enablePBRShadows(group, { cast: true, receive: true, minRadius: 0.14 });

  const lookTarget = new THREE.Vector3();

  function evalFishPos(s, t, outVec) {
    const a = t * s.speed + s.phase;
    const ox = Math.cos(a) * s.orbitRx;
    const oz = s.fig8 ? Math.sin(a * 2.0) * s.orbitRz * 0.72 : Math.sin(a) * s.orbitRz;
    const oy = Math.sin(t * 1.4 + s.phase) * 0.035;
    let x = s.centerX + ox;
    let z = s.centerZ + oz;
    // Softly clamp inside clear pond interior so fish never clip shoreline stones
    const rN = getPondNormalizedRadius(x, z);
    if (rN > 0.78) {
      const pull = 0.78 / rN;
      x = POND_CONFIG.cx + (x - POND_CONFIG.cx) * pull;
      z = POND_CONFIG.cz + (z - POND_CONFIG.cz) * pull;
    }
    return outVec.set(x, s.swimY + oy, z);
  }

  function update(elapsed, dt) {
    animState.swingBoost = Math.max(0, animState.swingBoost - dt * 0.28);
    animState.pondExcite = Math.max(0, animState.pondExcite - dt * 0.45);

    // 1. Waterfall & Pond Surface Ripples
    if (animState.waterfallMap) {
      animState.waterfallMap.offset.y -= dt * 0.92;
    }
    if (animState.pondNormal) {
      animState.pondNormal.offset.x += dt * 0.035;
      animState.pondNormal.offset.y -= dt * 0.055;
    }
    for (let i = 0; i < animState.foamRings.length; i += 1) {
      const f = animState.foamRings[i];
      const u = (elapsed * 0.55 + f.phase) % 1.0;
      const sc = 0.65 + u * (1.45 + animState.pondExcite * 0.8);
      f.mesh.scale.setScalar(sc);
      f.mesh.material.opacity = (1.0 - u) * 0.48;
    }

    // 2. Gentle Floating Water-Lily Bob
    for (let i = 0; i < animState.lilyClusters.length; i += 1) {
      const l = animState.lilyClusters[i];
      l.group.position.y = l.baseY + Math.sin(elapsed * 1.6 + l.phase) * 0.007;
    }

    // 3. Swimming Ryukin Goldfish & Koi
    const speedMult = 1.0 + animState.pondExcite * 1.35;
    const effectiveT = elapsed + animState.pondExcite * 0.4;
    for (let i = 0; i < animState.swimmers.length; i += 1) {
      const s = animState.swimmers[i];
      if (s.mixer) s.mixer.update(dt * speedMult);
      evalFishPos(s, effectiveT, s.wrapper.position);
      evalFishPos(s, effectiveT + 0.08, lookTarget);
      if (lookTarget.distanceToSquared(s.wrapper.position) > 1e-6) {
        s.wrapper.lookAt(lookTarget);
      }
      if (s.bodyPivot) {
        s.bodyPivot.rotation.y = Math.sin(elapsed * 6.8 * speedMult + s.phase) * 0.11;
      }
    }

    // 4. Foraging & Swimming Giant Freshwater River Shrimp
    for (let i = 0; i < animState.shrimpActors.length; i += 1) {
      const sh = animState.shrimpActors[i];
      if (sh.mixer) sh.mixer.update(dt * (1.0 + animState.pondExcite * 0.9));

      if (sh.mode === "shelf") {
        const a = elapsed * sh.speed + sh.phase;
        const nx = sh.baseX + Math.cos(a) * sh.roamR;
        const nz = sh.baseZ + Math.sin(a * 0.8) * sh.roamR * 0.72;
        const hop = Math.max(0, Math.sin(elapsed * 1.9 + sh.phase) - 0.72) * 0.14;
        sh.wrapper.position.set(nx, sh.baseY + hop, nz);
        lookTarget.set(
          sh.baseX + Math.cos(a + 0.12) * sh.roamR,
          sh.baseY + hop,
          sh.baseZ + Math.sin((a + 0.12) * 0.8) * sh.roamR * 0.72
        );
        sh.wrapper.lookAt(lookTarget);
      } else {
        const a = elapsed * sh.speed + sh.phase;
        const sx = sh.centerX + Math.cos(a) * sh.roamRx;
        const sz = sh.centerZ + Math.sin(a * 1.3) * sh.roamRz;
        const sy = sh.baseY + Math.sin(elapsed * 2.3 + sh.phase) * 0.055;
        sh.wrapper.position.set(sx, sy, sz);
        lookTarget.set(
          sh.centerX + Math.cos(a + 0.1) * sh.roamRx,
          sy,
          sh.centerZ + Math.sin((a + 0.1) * 1.3) * sh.roamRz
        );
        sh.wrapper.lookAt(lookTarget);
      }
    }

    // 5. Gentle Romantic Sway of the White A-Frame Two-Person Swing
    if (animState.swingPivot) {
      const amp = 0.068 + animState.swingBoost * 0.22;
      animState.swingPivot.rotation.x = Math.sin(elapsed * 1.48) * amp;
    }
  }

  // Advance once at boot so every fish & shrimp starts in a natural swimming pose!
  update(0.25, 0.05);

  return {
    group,
    update,
    boostSwing() {
      animState.swingBoost = 1.0;
    },
    ripplePond() {
      animState.pondExcite = 1.0;
    },
  };
}
