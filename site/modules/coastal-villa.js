// 1:1 Human-Scale Realistic Walk-In Two-Bedroom Coastal Villa (两室一厅海景花墅)
// Fixed solid terracotta barrel-tile roof, exposed cedar-beamed ceilings, 5 wide open
// walk-through doorways, clear mullioned sea/garden windows, and full PBR furnishings.

import {
  THREE,
  clamp,
  lerp,
  mulberry32,
  makeCanvasTex,
  makeNormalTex,
  getOakParquetTextures,
  getTerracottaRoofTextures,
  pbrPlasterMat,
  pbrStoneMat,
  pbrWoodMat,
  pbrFabricMat,
  pbrMetalMat,
  pbrGlassMat,
  registerWalkZone,
  registerBoxCollider,
  registerCircleCollider,
  tagInteractive,
  enablePBRShadows,
} from "./pbr-kit.js";
import { createRoseBouquet } from "./botanical-flora.js";

function createMarbleMaterial() {
  const rng = mulberry32(9104);
  const drawVeins = (ctx, w, h, isHeight) => {
    ctx.fillStyle = isHeight ? "#dcdcdc" : "#f6f4ef";
    ctx.fillRect(0, 0, w, h);
    for (let v = 0; v < 18; v += 1) {
      ctx.beginPath();
      let x = rng() * w;
      let y = rng() * h;
      ctx.moveTo(x, y);
      for (let s = 0; s < 8; s += 1) {
        x += (rng() - 0.32) * 75;
        y += (rng() - 0.38) * 65;
        ctx.lineTo(x, y);
      }
      ctx.lineWidth = 1.2 + rng() * 3.8;
      ctx.strokeStyle = isHeight
        ? "rgba(165,165,165,0.45)"
        : v % 4 === 0
          ? "rgba(188,162,118,0.26)"
          : "rgba(142,146,152,0.28)";
      ctx.stroke();
    }
  };
  const map = makeCanvasTex(512, 512, (ctx, w, h) => drawVeins(ctx, w, h, false), {
    repeatX: 2,
    repeatY: 1,
  });
  const normalMap = makeNormalTex(512, 512, (ctx, w, h) => drawVeins(ctx, w, h, true), {
    strength: 0.7,
    repeatX: 2,
    repeatY: 1,
  });
  return new THREE.MeshPhysicalMaterial({
    color: 0xfbfaf7,
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.22, 0.22),
    roughness: 0.14,
    metalness: 0.02,
    clearcoat: 0.55,
    clearcoatRoughness: 0.14,
  });
}

function createWovenRugMaterial(baseHex, accentHex, seed) {
  const rng = mulberry32(seed);
  const map = makeCanvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 5;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(24, 24, w - 48, h - 48);
    for (let i = 0; i < 2200; i += 1) {
      const shade = 212 + Math.floor(rng() * 34);
      ctx.fillStyle = `rgba(${shade},${shade - 6},${shade - 14},0.22)`;
      ctx.fillRect(rng() * w, rng() * h, 3, 1.5);
    }
  });
  return new THREE.MeshStandardMaterial({
    map,
    roughness: 0.92,
    metalness: 0.0,
  });
}

function createCoastalPaintingTex(withLighthouse = false) {
  return makeCanvasTex(384, 256, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.56);
    sky.addColorStop(0, "#bcd6e8");
    sky.addColorStop(0.6, "#f2dec4");
    sky.addColorStop(1, "#fae8cf");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const sea = ctx.createLinearGradient(0, h * 0.52, 0, h);
    sea.addColorStop(0, "#3b7c96");
    sea.addColorStop(0.55, "#5998ab");
    sea.addColorStop(1, "#dfd0b4");
    ctx.fillStyle = sea;
    ctx.fillRect(0, h * 0.52, w, h * 0.48);

    ctx.fillStyle = "#6c7f67";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.62);
    ctx.quadraticCurveTo(w * 0.28, h * 0.34, w * 0.62, h * 0.56);
    ctx.lineTo(0, h * 0.72);
    ctx.closePath();
    ctx.fill();

    if (withLighthouse) {
      ctx.fillStyle = "#f5efe5";
      ctx.fillRect(w * 0.27, h * 0.26, 13, 44);
      ctx.fillStyle = "#b85542";
      ctx.fillRect(w * 0.265, h * 0.23, 16, 7);
    }

    const rng = mulberry32(withLighthouse ? 3311 : 2207);
    const palette = ["#e89aa8", "#f3d5dc", "#d96b7e", "#f4efe4", "#cfa56a"];
    for (let i = 0; i < 360; i += 1) {
      ctx.fillStyle = palette[Math.floor(rng() * palette.length)];
      const fx = rng() * w * 0.72;
      const fy = h * 0.62 + rng() * h * 0.36;
      ctx.fillRect(fx, fy, 4 + rng() * 6, 2.5 + rng() * 3.5);
    }
  });
}

function createLoveLetterTex() {
  return makeCanvasTex(256, 192, (ctx, w, h) => {
    ctx.fillStyle = "#f8f1e3";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(182,155,118,0.45)";
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.strokeStyle = "rgba(86,62,44,0.62)";
    ctx.lineWidth = 1.6;
    for (let row = 0; row < 7; row += 1) {
      const y = 34 + row * 18;
      ctx.beginPath();
      ctx.moveTo(26, y);
      for (let x = 26; x < w - 34; x += 12) {
        ctx.quadraticCurveTo(x + 4, y - 3, x + 9, y + 1);
      }
      ctx.stroke();
    }
  });
}

function createVillaMaterials() {
  const parquet = getOakParquetTextures(11, 8);
  const roof = getTerracottaRoofTextures(14, 8);
  return {
    extPlaster: pbrPlasterMat(0xf4ede0, { repeatX: 7, repeatY: 3, roughness: 0.86 }),
    intPlaster: pbrPlasterMat(0xf8f3ea, { repeatX: 6, repeatY: 3, roughness: 0.88 }),
    ceilPlaster: new THREE.MeshStandardMaterial({
      color: 0xfbf7ef,
      emissive: new THREE.Color(0xfff0d8),
      emissiveIntensity: 0.16,
      roughness: 0.9,
    }),
    limestone: pbrStoneMat(0xd9d0c0, { repeatX: 7, repeatY: 2, roughness: 0.82 }),
    hearthStone: pbrStoneMat(0xcfc5b3, { repeatX: 3, repeatY: 3, roughness: 0.84 }),
    copingStone: pbrStoneMat(0xe3dbcd, { repeatX: 6, repeatY: 1, roughness: 0.76 }),
    parquetFloor: new THREE.MeshStandardMaterial({
      color: 0xc89a6c,
      map: parquet.map,
      normalMap: parquet.normalMap,
      normalScale: new THREE.Vector2(0.48, 0.48),
      roughness: 0.38,
      metalness: 0.04,
    }),
    cedarDeck: pbrWoodMat(0xa5744c, { repeatX: 8, repeatY: 5, roughness: 0.62 }),
    cedarBeam: pbrWoodMat(0x8c5d3b, { repeatX: 4, repeatY: 2, roughness: 0.58 }),
    walnut: pbrWoodMat(0x5b3c26, { repeatX: 3, repeatY: 2, roughness: 0.36 }),
    naturalOak: pbrWoodMat(0xb6885b, { repeatX: 3, repeatY: 3, roughness: 0.44 }),
    sageWood: pbrWoodMat(0x7c8f7c, { repeatX: 2, repeatY: 2, roughness: 0.52 }),
    terracottaRoof: new THREE.MeshStandardMaterial({
      color: 0xc96e4b,
      map: roof.map,
      normalMap: roof.normalMap,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughness: 0.74,
      metalness: 0.03,
      side: THREE.DoubleSide,
    }),
    terracottaPot: pbrPlasterMat(0xb86849, { repeatX: 2, repeatY: 2, roughness: 0.78 }),
    marble: createMarbleMaterial(),
    zelligeTile: new THREE.MeshPhysicalMaterial({
      color: 0xeef1ec,
      roughness: 0.16,
      clearcoat: 0.75,
      clearcoatRoughness: 0.12,
    }),
    brass: pbrMetalMat(0xc8a258, { roughness: 0.26, metalness: 0.86 }),
    bronze: pbrMetalMat(0x3d332c, { roughness: 0.4, metalness: 0.78 }),
    copper: pbrMetalMat(0x9f5d41, { roughness: 0.34, metalness: 0.84 }),
    stainless: pbrMetalMat(0xd6dadf, { roughness: 0.24, metalness: 0.9 }),
    castIron: pbrMetalMat(0x252527, { roughness: 0.62, metalness: 0.72 }),
    glass: pbrGlassMat({ color: 0xe3f2f7, opacity: 0.2 }),
    creamLinen: pbrFabricMat(0xf0e9dd, { roughness: 0.88 }),
    ivoryLinen: pbrFabricMat(0xf6f2ea, { roughness: 0.86 }),
    oatFabric: pbrFabricMat(0xe2d6c3, { roughness: 0.9 }),
    sageVelvet: pbrFabricMat(0x889c84, { roughness: 0.76 }),
    terracottaVelvet: pbrFabricMat(0xc16d52, { roughness: 0.78 }),
    blushLinen: pbrFabricMat(0xdfb8b4, { roughness: 0.84 }),
    cognacLeather: new THREE.MeshStandardMaterial({ color: 0x8b5332, roughness: 0.46, metalness: 0.04 }),
    sheerCurtain: new THREE.MeshPhysicalMaterial({
      color: 0xfbf7ef,
      transparent: true,
      opacity: 0.72,
      roughness: 0.88,
      transmission: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    livingRug: createWovenRugMaterial("#ede5d6", "#b8aa94", 5101),
    bedroomRug: createWovenRugMaterial("#e9e0d2", "#9ca495", 5102),
    studyRug: createWovenRugMaterial("#dfd4c2", "#8e634c", 5103),
    paintingLiving: new THREE.MeshStandardMaterial({ map: createCoastalPaintingTex(false), roughness: 0.62 }),
    paintingStudy: new THREE.MeshStandardMaterial({ map: createCoastalPaintingTex(true), roughness: 0.62 }),
    letterPaper: new THREE.MeshStandardMaterial({ map: createLoveLetterTex(), roughness: 0.84 }),
    waxSeal: new THREE.MeshStandardMaterial({ color: 0x8f1d24, roughness: 0.32, metalness: 0.08 }),
    foliageOlive: new THREE.MeshStandardMaterial({ color: 0x5c7352, roughness: 0.72 }),
    warmShade: new THREE.MeshStandardMaterial({
      color: 0xfaf0dc,
      emissive: new THREE.Color(0xffcf8b),
      emissiveIntensity: 0.65,
      roughness: 0.75,
      side: THREE.DoubleSide,
    }),
    opalGlow: new THREE.MeshStandardMaterial({
      color: 0xfff8eb,
      emissive: new THREE.Color(0xffd596),
      emissiveIntensity: 0.95,
      roughness: 0.25,
    }),
    emberGlow: new THREE.MeshStandardMaterial({
      color: 0x4a1608,
      emissive: new THREE.Color(0xff5e14),
      emissiveIntensity: 1.8,
      roughness: 0.85,
    }),
  };
}

function addBox(parent, w, h, d, mat, x, y, z, ry = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  if (ry) mesh.rotation.y = ry;
  parent.add(mesh);
  return mesh;
}

function addRoseArrangement(parent, mats, x, y, z, scale = 1.0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.scale.setScalar(scale);

  const vase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.068, 0.085, 0.21, 14),
    mats.zelligeTile
  );
  vase.position.y = 0.105;
  g.add(vase);

  const bouquet = createRoseBouquet({ count: 7, scale: 0.88 });
  bouquet.position.y = 0.04;
  g.add(bouquet);

  parent.add(g);
  return g;
}

function createPleatedCurtain(mats, width, height) {
  const segsX = 18;
  const geom = new THREE.PlaneGeometry(width, height, segsX, 6);
  geom.translate(0, -height * 0.5, 0);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const dropFactor = clamp(-py / height, 0, 1);
    const pleat = Math.sin((px / width) * Math.PI * 9.0) * (0.032 + 0.022 * dropFactor);
    pos.setZ(i, pleat);
  }
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, mats.sheerCurtain);
  mesh.userData.noShadow = true;
  return mesh;
}

function addCoachSconce(parent, mats, x, y, z, rotY = 0) {
  const s = new THREE.Group();
  s.position.set(x, y, z);
  s.rotation.y = rotY;
  addBox(s, 0.11, 0.22, 0.025, mats.brass, 0, 0, 0);
  addBox(s, 0.03, 0.03, 0.12, mats.brass, 0, 0.04, 0.06);
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.065, 0.24, 6), mats.glass);
  cage.userData.noShadow = true;
  cage.position.set(0, -0.02, 0.13);
  s.add(cage);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.07, 6), mats.brass);
  cap.position.set(0, 0.13, 0.13);
  s.add(cap);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), mats.opalGlow);
  bulb.userData.noShadow = true;
  bulb.position.set(0, -0.01, 0.13);
  s.add(bulb);
  parent.add(s);
}

function buildPlinthVerandaAndStairs(group, mats) {
  // Raised Ashlar Limestone Plinth: X in [-25.6, -2.4] (23.2m), Z in [-10.8, +6.6] (17.4m)
  addBox(group, 23.2, 0.75, 17.4, mats.limestone, -14.0, 2.175, -2.1);

  // Perimeter carved stone coping trim (avoids interior floor)
  addBox(group, 23.36, 0.07, 0.16, mats.copingStone, -14.0, 2.565, 6.56);
  addBox(group, 23.36, 0.07, 0.16, mats.copingStone, -14.0, 2.565, -10.76);
  addBox(group, 0.16, 0.07, 17.4, mats.copingStone, -25.56, 2.565, -2.1);
  addBox(group, 0.16, 0.07, 17.4, mats.copingStone, -2.44, 2.565, -2.1);

  // Non-overlapping Wrap-Around Cedar Veranda Deck (top Y = +2.60m)
  addBox(group, 23.0, 0.05, 2.52, mats.cedarDeck, -14.0, 2.575, 5.26);
  addBox(group, 23.0, 0.05, 0.72, mats.cedarDeck, -14.0, 2.575, -10.36);
  addBox(group, 1.52, 0.05, 14.0, mats.cedarDeck, -24.76, 2.575, -3.0);
  addBox(group, 1.52, 0.05, 14.0, mats.cedarDeck, -3.24, 2.575, -3.0);

  // Interior Herringbone Oak Parquet Floor: X in [-24.0, -4.0], Z in [-10.0, +4.0], top Y = +2.60m
  addBox(group, 20.0, 0.052, 14.0, mats.parquetFloor, -14.0, 2.574, -3.0);

  // 1. South Main Entrance Stairs: X in [-16.2, -11.8] (4.4m wide), Z in [+6.6, +8.8]
  for (let i = 0; i < 4; i += 1) {
    const topY = 2.60 - (i + 0.5) * 0.095;
    const h = topY - 1.95;
    const cz = 6.6 + (i + 0.5) * 0.55;
    addBox(group, 4.4, h, 0.57, mats.limestone, -14.0, 1.95 + h * 0.5, cz);
    addBox(group, 4.46, 0.035, 0.59, mats.copingStone, -14.0, topY, cz);
  }
  addBox(group, 0.18, 0.58, 2.24, mats.limestone, -16.3, 2.38, 7.72);
  addBox(group, 0.18, 0.58, 2.24, mats.limestone, -11.7, 2.38, 7.72);

  // 2. West Flower-Sea Terrace Stairs: X in [-27.8, -25.6], Z in [-0.1, +2.3] (2.4m wide)
  for (let i = 0; i < 4; i += 1) {
    const topY = 2.60 - (i + 0.5) * 0.095;
    const h = topY - 1.95;
    const cx = -25.6 - (i + 0.5) * 0.55;
    addBox(group, 0.57, h, 2.4, mats.limestone, cx, 1.95 + h * 0.5, 1.1);
    addBox(group, 0.59, 0.035, 2.46, mats.copingStone, cx, topY, 1.1);
  }
  addBox(group, 2.24, 0.54, 0.16, mats.limestone, -26.72, 2.36, -0.19);
  addBox(group, 2.24, 0.54, 0.16, mats.limestone, -26.72, 2.36, 2.39);

  // 3. East Harbor-View Terrace Stairs: X in [-2.4, -0.2], Z in [-0.2, +2.0] (2.2m wide)
  for (let i = 0; i < 4; i += 1) {
    const topY = 2.60 - (i + 0.5) * 0.095;
    const h = topY - 1.95;
    const cx = -2.4 + (i + 0.5) * 0.55;
    addBox(group, 0.57, h, 2.2, mats.limestone, cx, 1.95 + h * 0.5, 0.9);
    addBox(group, 0.59, 0.035, 2.26, mats.copingStone, cx, topY, 0.9);
  }
  addBox(group, 2.24, 0.54, 0.16, mats.limestone, -1.28, 2.36, -0.29);
  addBox(group, 2.24, 0.54, 0.16, mats.limestone, -1.28, 2.36, 2.09);

  // Register Unified Villa Floor & Smooth Stairway Walk Zones
  registerWalkZone((x, z) => {
    if (x >= -25.65 && x <= -2.35 && z >= -10.85 && z <= 6.65) return 2.60;
    if (x >= -16.25 && x <= -11.75 && z > 6.65 && z <= 8.85) {
      return lerp(2.60, 2.20, clamp((z - 6.65) / 2.2, 0, 1));
    }
    if (x >= -27.85 && x < -25.65 && z >= -0.15 && z <= 2.35) {
      return lerp(2.20, 2.60, clamp((x + 27.85) / 2.2, 0, 1));
    }
    if (x > -2.35 && x <= -0.15 && z >= -0.25 && z <= 2.05) {
      return lerp(2.60, 2.20, clamp((x + 2.35) / 2.2, 0, 1));
    }
    return null;
  });

  // Cedar Veranda Railings (with wide clean openings at all 3 stairways)
  const buildRailRunX = (x0, x1, zPos) => {
    const len = x1 - x0;
    const cx = (x0 + x1) * 0.5;
    addBox(group, len, 0.065, 0.09, mats.cedarBeam, cx, 3.52, zPos);
    addBox(group, len, 0.05, 0.07, mats.cedarBeam, cx, 2.74, zPos);
    const count = Math.max(2, Math.floor(len / 0.22));
    for (let i = 0; i <= count; i += 1) {
      const bx = lerp(x0 + 0.06, x1 - 0.06, i / count);
      addBox(group, 0.036, 0.74, 0.036, mats.cedarDeck, bx, 3.13, zPos);
    }
    registerBoxCollider(x0, x1, zPos - 0.07, zPos + 0.07);
  };

  const buildRailRunZ = (z0, z1, xPos) => {
    const len = z1 - z0;
    const cz = (z0 + z1) * 0.5;
    addBox(group, 0.09, 0.065, len, mats.cedarBeam, xPos, 3.52, cz);
    addBox(group, 0.07, 0.05, len, mats.cedarBeam, xPos, 2.74, cz);
    const count = Math.max(2, Math.floor(len / 0.22));
    for (let i = 0; i <= count; i += 1) {
      const bz = lerp(z0 + 0.06, z1 - 0.06, i / count);
      addBox(group, 0.036, 0.74, 0.036, mats.cedarDeck, xPos, 3.13, bz);
    }
    registerBoxCollider(xPos - 0.07, xPos + 0.07, z0, z1);
  };

  buildRailRunX(-25.5, -16.28, 6.5);
  buildRailRunX(-11.72, -2.5, 6.5);
  buildRailRunX(-25.5, -2.5, -10.7);
  buildRailRunZ(-10.7, -0.18, -25.5);
  buildRailRunZ(2.38, 6.5, -25.5);
  buildRailRunZ(-10.7, -0.28, -2.5);
  buildRailRunZ(2.08, 6.5, -2.5);

  // Structural Cedar Veranda Columns & Stone Bases supporting the Roof Overhang
  const postCoords = [
    [-25.46, 6.46], [-21.0, 6.46], [-16.32, 6.46], [-11.68, 6.46], [-7.0, 6.46], [-2.54, 6.46],
    [-25.46, 2.42], [-25.46, -0.22], [-25.46, -5.4], [-25.46, -10.66],
    [-2.54, 2.12], [-2.54, -0.32], [-2.54, -5.4], [-2.54, -10.66],
    [-19.5, -10.66], [-14.0, -10.66], [-8.5, -10.66],
  ];
  for (const [px, pz] of postCoords) {
    addBox(group, 0.26, 0.34, 0.26, mats.copingStone, px, 2.77, pz);
    addBox(group, 0.17, 3.62, 0.17, mats.cedarBeam, px, 4.41, pz);
  }

  // Outdoor Woven Rattan Lounge Chairs & Bistro Table on Front Sea-View Veranda
  const addRattanChair = (cx, cz, ry) => {
    const ch = new THREE.Group();
    ch.position.set(cx, 2.60, cz);
    ch.rotation.y = ry;
    addBox(ch, 0.78, 0.34, 0.74, mats.naturalOak, 0, 0.22, 0);
    addBox(ch, 0.78, 0.48, 0.12, mats.naturalOak, 0, 0.56, -0.31);
    addBox(ch, 0.11, 0.36, 0.72, mats.naturalOak, -0.34, 0.46, 0);
    addBox(ch, 0.11, 0.36, 0.72, mats.naturalOak, 0.34, 0.46, 0);
    addBox(ch, 0.64, 0.11, 0.60, mats.creamLinen, 0, 0.43, 0.03);
    addBox(ch, 0.62, 0.34, 0.10, mats.sageVelvet, 0, 0.62, -0.21);
    group.add(ch);
  };
  addRattanChair(-21.35, 5.72, 0.28);
  addRattanChair(-18.95, 5.72, -0.28);

  const bistroTop = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 20), mats.walnut);
  bistroTop.position.set(-20.15, 3.08, 5.76);
  group.add(bistroTop);
  const bistroPed = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.18, 0.46, 12), mats.naturalOak);
  bistroPed.position.set(-20.15, 2.83, 5.76);
  group.add(bistroPed);
  addRoseArrangement(group, mats, -20.15, 3.10, 5.76, 0.72);
  registerBoxCollider(-21.80, -18.50, 5.36, 6.12);

  // Flanking Terracotta Planters & Brass Coach Sconces at Front French Entrance
  for (const px of [-16.05, -11.95]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.44, 16), mats.terracottaPot);
    pot.position.set(px, 2.82, 4.32);
    group.add(pot);
    addRoseArrangement(group, mats, px, 2.96, 4.32, 1.35);
    registerCircleCollider(px, 4.32, 0.16);
  }
  addCoachSconce(group, mats, -15.65, 4.48, 4.13, 0);
  addCoachSconce(group, mats, -12.35, 4.48, 4.13, 0);
  addCoachSconce(group, mats, -24.13, 4.45, 2.48, -Math.PI * 0.5);
  addCoachSconce(group, mats, -3.87, 4.45, 2.18, Math.PI * 0.5);
}

function makeDoorLeaf(mats, width, height, glazed, hingeSign) {
  const pivot = new THREE.Group();
  const cx = hingeSign * width * 0.5;
  if (glazed) {
    addBox(pivot, width, 0.52, 0.05, mats.naturalOak, cx, 0.26, 0);
    addBox(pivot, width, 0.12, 0.05, mats.naturalOak, cx, height - 0.06, 0);
    addBox(pivot, 0.11, height - 0.64, 0.05, mats.naturalOak, hingeSign * 0.055, 0.52 + (height - 0.64) * 0.5, 0);
    addBox(pivot, 0.11, height - 0.64, 0.05, mats.naturalOak, hingeSign * (width - 0.055), 0.52 + (height - 0.64) * 0.5, 0);
    const paneH = height - 0.64;
    const pane = new THREE.Mesh(new THREE.BoxGeometry(width - 0.2, paneH, 0.016), mats.glass);
    pane.userData.noShadow = true;
    pane.position.set(cx, 0.52 + paneH * 0.5, 0);
    pivot.add(pane);
    for (let r = 1; r <= 2; r += 1) {
      addBox(pivot, width - 0.18, 0.028, 0.054, mats.naturalOak, cx, 0.52 + (paneH * r) / 3, 0);
    }
  } else {
    addBox(pivot, width, height, 0.048, mats.naturalOak, cx, height * 0.5, 0);
    addBox(pivot, width - 0.22, height * 0.36, 0.062, mats.walnut, cx, height * 0.26, 0);
    addBox(pivot, width - 0.22, height * 0.42, 0.062, mats.walnut, cx, height * 0.71, 0);
  }
  const handleX = hingeSign * (width - 0.09);
  addBox(pivot, 0.11, 0.024, 0.14, mats.brass, handleX, 1.02, 0);
  return pivot;
}

function addRoofSlope(parent, mat, pBL, pBR, pTR, pTL) {
  const geom = new THREE.BufferGeometry();
  const baseW = Math.hypot(pBR[0] - pBL[0], pBR[2] - pBL[2]);
  const topW = Math.hypot(pTR[0] - pTL[0], pTR[2] - pTL[2]);
  const midB = [(pBL[0] + pBR[0]) * 0.5, (pBL[1] + pBR[1]) * 0.5, (pBL[2] + pBR[2]) * 0.5];
  const midT = [(pTL[0] + pTR[0]) * 0.5, (pTL[1] + pTR[1]) * 0.5, (pTL[2] + pTR[2]) * 0.5];
  const slopeH = Math.hypot(midT[0] - midB[0], midT[1] - midB[1], midT[2] - midB[2]);
  const uScale = 0.085;
  const vScale = 0.14;
  const uMid = (baseW * 0.5) * uScale;
  const uTopHalf = (topW * 0.5) * uScale;

  const positions = new Float32Array([
    ...pBL, ...pBR, ...pTR,
    ...pBL, ...pTR, ...pTL,
  ]);
  const uvs = new Float32Array([
    0, 0, baseW * uScale, 0, uMid + uTopHalf, slopeH * vScale,
    0, 0, uMid + uTopHalf, slopeH * vScale, uMid - uTopHalf, slopeH * vScale,
  ]);
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, mat);
  parent.add(mesh);
}

function addHipCapBeam(parent, mat, a, b, radius = 0.09) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 10), mat);
  cyl.position.copy(mid);
  cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  parent.add(cyl);
}

function buildWallsWindowsDoorsAndRoof(group, mats, curtainAnimList) {
  const wallTop = 6.30;
  const wallBase = 2.60;
  const fullH = wallTop - wallBase;
  const fullMidY = (wallTop + wallBase) * 0.5;

  const addWindowAssembly = (axis, u0, u1, fixedPos, interiorSign, bays) => {
    const span = u1 - u0;
    const midU = (u0 + u1) * 0.5;
    const thick = 0.24;
    const sillH = 3.35 - wallBase;
    const headH = wallTop - 5.55;
    const winH = 5.55 - 3.35;
    const winMidY = (3.35 + 5.55) * 0.5;

    if (axis === "x") {
      addBox(group, span, sillH, thick, mats.extPlaster, midU, wallBase + sillH * 0.5, fixedPos);
      addBox(group, span, headH, thick, mats.extPlaster, midU, 5.55 + headH * 0.5, fixedPos);
      addBox(group, span + 0.18, 0.07, 0.34, mats.copingStone, midU, 3.33, fixedPos);
      addBox(group, span + 0.14, 0.09, 0.28, mats.naturalOak, midU, 5.57, fixedPos);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(span - 0.08, winH - 0.08, 0.02), mats.glass);
      pane.userData.noShadow = true;
      pane.position.set(midU, winMidY, fixedPos);
      group.add(pane);
      for (let b = 0; b <= bays; b += 1) {
        const mx = lerp(u0 + 0.03, u1 - 0.03, b / bays);
        addBox(group, 0.05, winH, 0.09, mats.bronze, mx, winMidY, fixedPos);
      }
      addBox(group, span, 0.045, 0.085, mats.bronze, midU, 4.92, fixedPos);

      const cz = fixedPos + interiorSign * 0.19;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, span + 0.44, 10), mats.brass);
      rod.rotation.z = Math.PI * 0.5;
      rod.position.set(midU, 5.74, cz);
      group.add(rod);
      for (const side of [-1, 1]) {
        const cMesh = createPleatedCurtain(mats, 0.68, 2.98);
        cMesh.position.set(midU + side * (span * 0.5 - 0.22), 5.73, cz);
        group.add(cMesh);
        curtainAnimList.push({ mesh: cMesh, axis: "x", phase: midU * 0.3 + side });
      }
    } else {
      addBox(group, thick, sillH, span, mats.extPlaster, fixedPos, wallBase + sillH * 0.5, midU);
      addBox(group, thick, headH, span, mats.extPlaster, fixedPos, 5.55 + headH * 0.5, midU);
      addBox(group, 0.34, 0.07, span + 0.18, mats.copingStone, fixedPos, 3.33, midU);
      addBox(group, 0.28, 0.09, span + 0.14, mats.naturalOak, fixedPos, 5.57, midU);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.02, winH - 0.08, span - 0.08), mats.glass);
      pane.userData.noShadow = true;
      pane.position.set(fixedPos, winMidY, midU);
      group.add(pane);
      for (let b = 0; b <= bays; b += 1) {
        const mz = lerp(u0 + 0.03, u1 - 0.03, b / bays);
        addBox(group, 0.09, winH, 0.05, mats.bronze, fixedPos, winMidY, mz);
      }
      addBox(group, 0.085, 0.045, span, mats.bronze, fixedPos, 4.92, midU);

      const cx = fixedPos + interiorSign * 0.19;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, span + 0.44, 10), mats.brass);
      rod.rotation.x = Math.PI * 0.5;
      rod.position.set(cx, 5.74, midU);
      group.add(rod);
      for (const side of [-1, 1]) {
        const cMesh = createPleatedCurtain(mats, 0.68, 2.98);
        cMesh.rotation.y = Math.PI * 0.5;
        cMesh.position.set(cx, 5.73, midU + side * (span * 0.5 - 0.22));
        group.add(cMesh);
        curtainAnimList.push({ mesh: cMesh, axis: "z", phase: midU * 0.3 + side });
      }
    }
  };

  // South Exterior Wall (Z = +4.0): French Doorway [-15.2, -12.8], Windows [-22.0, -17.0] & [-11.0, -6.0]
  addBox(group, 2.12, fullH, 0.24, mats.extPlaster, -23.06, fullMidY, 4.0);
  addWindowAssembly("x", -22.0, -17.0, 4.0, -1, 4);
  addBox(group, 1.80, fullH, 0.24, mats.extPlaster, -16.10, fullMidY, 4.0);
  addBox(group, 2.40, wallTop - 5.35, 0.24, mats.extPlaster, -14.0, (wallTop + 5.35) * 0.5, 4.0);
  addBox(group, 2.52, 0.09, 0.28, mats.naturalOak, -14.0, 5.36, 4.0);
  addBox(group, 1.80, fullH, 0.24, mats.extPlaster, -11.90, fullMidY, 4.0);
  addWindowAssembly("x", -11.0, -6.0, 4.0, -1, 4);
  addBox(group, 2.12, fullH, 0.24, mats.extPlaster, -4.94, fullMidY, 4.0);
  registerBoxCollider(-24.12, -15.20, 3.88, 4.12);
  registerBoxCollider(-12.80, -3.88, 3.88, 4.12);

  // Swung-open South Main Double French Doors (2.4m clear width x 2.75m tall)
  const sDoorL = makeDoorLeaf(mats, 1.16, 2.72, true, 1);
  sDoorL.position.set(-15.16, 2.60, 3.92);
  sDoorL.rotation.y = 1.48;
  group.add(sDoorL);
  const sDoorR = makeDoorLeaf(mats, 1.16, 2.72, true, -1);
  sDoorR.position.set(-12.84, 2.60, 3.92);
  sDoorR.rotation.y = -1.48;
  group.add(sDoorR);

  // West Exterior Wall (X = -24.0): Window [-8.4, -4.6], French Doorway [+0.1, +2.1]
  addBox(group, 0.24, fullH, 1.72, mats.extPlaster, -24.0, fullMidY, -9.26);
  addWindowAssembly("z", -8.4, -4.6, -24.0, 1, 3);
  addBox(group, 0.24, fullH, 4.70, mats.extPlaster, -24.0, fullMidY, -2.25);
  addBox(group, 0.24, wallTop - 5.35, 2.00, mats.extPlaster, -24.0, (wallTop + 5.35) * 0.5, 1.10);
  addBox(group, 0.28, 0.09, 2.12, mats.naturalOak, -24.0, 5.36, 1.10);
  addBox(group, 0.24, fullH, 2.02, mats.extPlaster, -24.0, fullMidY, 3.11);
  registerBoxCollider(-24.12, -23.88, -10.12, 0.10);
  registerBoxCollider(-24.12, -23.88, 2.10, 4.12);

  const wDoorL = makeDoorLeaf(mats, 0.96, 2.72, true, 1);
  wDoorL.position.set(-23.92, 2.60, 0.14);
  wDoorL.rotation.y = -0.09;
  group.add(wDoorL);
  const wDoorR = makeDoorLeaf(mats, 0.96, 2.72, true, 1);
  wDoorR.position.set(-23.92, 2.60, 2.06);
  wDoorR.rotation.y = 0.09;
  group.add(wDoorR);

  // East Exterior Wall (X = -4.0): Window [-8.4, -4.6], French Doorway [0.0, +1.8]
  addBox(group, 0.24, fullH, 1.72, mats.extPlaster, -4.0, fullMidY, -9.26);
  addWindowAssembly("z", -8.4, -4.6, -4.0, -1, 3);
  addBox(group, 0.24, fullH, 4.60, mats.extPlaster, -4.0, fullMidY, -2.30);
  addBox(group, 0.24, wallTop - 5.30, 1.80, mats.extPlaster, -4.0, (wallTop + 5.30) * 0.5, 0.90);
  addBox(group, 0.28, 0.09, 1.92, mats.naturalOak, -4.0, 5.31, 0.90);
  addBox(group, 0.24, fullH, 2.32, mats.extPlaster, -4.0, fullMidY, 2.96);
  registerBoxCollider(-4.12, -3.88, -10.12, 0.00);
  registerBoxCollider(-4.12, -3.88, 1.80, 4.12);

  const eDoorL = makeDoorLeaf(mats, 0.86, 2.68, true, -1);
  eDoorL.position.set(-4.08, 2.60, 0.04);
  eDoorL.rotation.y = 0.09;
  group.add(eDoorL);
  const eDoorR = makeDoorLeaf(mats, 0.86, 2.68, true, -1);
  eDoorR.position.set(-4.08, 2.60, 1.76);
  eDoorR.rotation.y = -0.09;
  group.add(eDoorR);

  // North Exterior Wall (Z = -10.0): Master Window [-20.8, -16.8], Study Window [-10.8, -6.8]
  addBox(group, 3.32, fullH, 0.24, mats.extPlaster, -22.46, fullMidY, -10.0);
  addWindowAssembly("x", -20.8, -16.8, -10.0, 1, 3);
  addBox(group, 6.00, fullH, 0.24, mats.extPlaster, -13.80, fullMidY, -10.0);
  addWindowAssembly("x", -10.8, -6.8, -10.0, 1, 3);
  addBox(group, 2.92, fullH, 0.24, mats.extPlaster, -5.34, fullMidY, -10.0);
  registerBoxCollider(-24.12, -3.88, -10.12, -9.88);

  // Interior Partition Wall (Z = -3.0): Master Door [-18.3, -16.5], Study Door [-11.5, -9.7]
  addBox(group, 5.58, 3.68, 0.20, mats.intPlaster, -21.09, 4.44, -3.0);
  addBox(group, 1.80, 6.28 - 5.15, 0.20, mats.intPlaster, -17.40, (6.28 + 5.15) * 0.5, -3.0);
  addBox(group, 1.92, 0.08, 0.24, mats.naturalOak, -17.40, 5.16, -3.0);
  addBox(group, 5.00, 3.68, 0.20, mats.intPlaster, -14.00, 4.44, -3.0);
  addBox(group, 1.80, 6.28 - 5.15, 0.20, mats.intPlaster, -10.60, (6.28 + 5.15) * 0.5, -3.0);
  addBox(group, 1.92, 0.08, 0.24, mats.naturalOak, -10.60, 5.16, -3.0);
  addBox(group, 5.58, 3.68, 0.20, mats.intPlaster, -6.91, 4.44, -3.0);
  registerBoxCollider(-23.90, -18.30, -3.10, -2.90);
  registerBoxCollider(-16.50, -11.50, -3.10, -2.90);
  registerBoxCollider(-9.70, -4.10, -3.10, -2.90);

  // Bedroom Suite Partition (X = -14.0, Z in [-9.88, -3.10])
  addBox(group, 0.20, 3.68, 6.78, mats.intPlaster, -14.0, 4.44, -6.49);
  registerBoxCollider(-14.10, -13.90, -9.90, -3.10);

  // Swung-open Paneled Oak Bedroom Suite Doors (85 deg northward into suites)
  for (const dCenter of [-17.40, -10.60]) {
    const dl = makeDoorLeaf(mats, 0.86, 2.52, false, 1);
    dl.position.set(dCenter - 0.86, 2.60, -3.08);
    dl.rotation.y = 1.48;
    group.add(dl);
    const dr = makeDoorLeaf(mats, 0.86, 2.52, false, -1);
    dr.position.set(dCenter + 0.86, 2.60, -3.08);
    dr.rotation.y = -1.48;
    group.add(dr);
  }

  // Interior Beamed Warm Plaster Ceiling (Y = +6.28m) + Veranda Cedar Soffit + Exposed Cedar Beams
  addBox(group, 20.2, 0.08, 14.2, mats.ceilPlaster, -14.0, 6.30, -3.0);
  addBox(group, 23.9, 0.05, 2.8, mats.cedarDeck, -14.0, 6.25, 5.45);
  addBox(group, 23.9, 0.05, 1.15, mats.cedarDeck, -14.0, 6.25, -10.58);
  addBox(group, 1.95, 0.05, 14.2, mats.cedarDeck, -24.98, 6.25, -3.0);
  addBox(group, 1.95, 0.05, 14.2, mats.cedarDeck, -3.02, 6.25, -3.0);

  for (const bx of [-22.4, -20.0, -17.6, -15.2, -12.8, -10.4, -8.0, -5.6]) {
    addBox(group, 0.16, 0.22, 6.84, mats.cedarBeam, bx, 6.17, 0.48);
  }
  for (const bx of [-22.2, -19.8, -17.4, -15.4, -12.4, -10.0, -7.6, -5.4]) {
    addBox(group, 0.16, 0.22, 6.74, mats.cedarBeam, bx, 6.17, -6.48);
  }

  // Copper Eave Fascia Trim (X in [-26.0, -2.0], Z in [-11.2, +6.9])
  addBox(group, 24.08, 0.14, 0.08, mats.copper, -14.0, 6.30, 6.90);
  addBox(group, 24.08, 0.14, 0.08, mats.copper, -14.0, 6.30, -11.20);
  addBox(group, 0.08, 0.14, 18.18, mats.copper, -26.0, 6.30, -2.15);
  addBox(group, 0.08, 0.14, 18.18, mats.copper, -2.0, 6.30, -2.15);

  // Fixed Aged Terracotta Hip Roof (Ridge at Y = +9.45m, X in [-17.0, -11.0], Z = -2.15)
  const pSW = [-26.0, 6.32, 6.90];
  const pSE = [-2.0, 6.32, 6.90];
  const pNE = [-2.0, 6.32, -11.20];
  const pNW = [-26.0, 6.32, -11.20];
  const rW = [-17.0, 9.45, -2.15];
  const rE = [-11.0, 9.45, -2.15];
  addRoofSlope(group, mats.terracottaRoof, pSW, pSE, rE, rW);
  addRoofSlope(group, mats.terracottaRoof, pNE, pNW, rW, rE);
  addRoofSlope(group, mats.terracottaRoof, pNW, pSW, rW, rW);
  addRoofSlope(group, mats.terracottaRoof, pSE, pNE, rE, rE);

  addHipCapBeam(group, mats.terracottaPot, rW, rE, 0.11);
  addHipCapBeam(group, mats.terracottaPot, pSW, rW, 0.095);
  addHipCapBeam(group, mats.terracottaPot, pSE, rE, 0.095);
  addHipCapBeam(group, mats.terracottaPot, pNW, rW, 0.095);
  addHipCapBeam(group, mats.terracottaPot, pNE, rE, 0.095);

  // Ashlar Limestone Fireplace Chimney rising above West Roof Slope
  addBox(group, 1.18, 4.15, 0.92, mats.limestone, -21.1, 8.38, -2.85);
  addBox(group, 1.34, 0.14, 1.08, mats.copingStone, -21.1, 10.48, -2.85);
  for (const dx of [-0.28, 0.28]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.42, 12), mats.terracottaPot);
    pot.position.set(-21.1 + dx, 10.74, -2.85);
    group.add(pot);
  }
}

function buildGrandLivingDiningKitchen(group, mats, emberState) {
  // --- 1. LIVING LOUNGE (West side of Grand Hall) ---
  // Ashlar Limestone Fireplace & Hearth against Z = -2.85, X in [-22.4, -19.8]
  addBox(group, 2.60, 3.68, 0.68, mats.hearthStone, -21.1, 4.44, -2.56);
  addBox(group, 2.84, 0.13, 1.04, mats.copingStone, -21.1, 2.665, -2.38);
  addBox(group, 1.26, 0.90, 0.04, mats.castIron, -21.1, 3.17, -2.21);
  addBox(group, 2.78, 0.14, 0.84, mats.copingStone, -21.1, 3.94, -2.50);

  for (let i = 0; i < 4; i += 1) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.68, 8), mats.walnut);
    log.rotation.z = Math.PI * 0.5 + (i - 1.5) * 0.08;
    log.rotation.y = (i % 2 === 0 ? 1 : -1) * 0.18;
    log.position.set(-21.1, 2.81 + (i > 1 ? 0.09 : 0), -2.09 + (i % 2) * 0.07);
    group.add(log);
  }
  const emberBed = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.09, 0.24), mats.emberGlow);
  emberBed.position.set(-21.1, 2.77, -2.06);
  group.add(emberBed);
  for (let fl = -1; fl <= 1; fl += 1) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24 - Math.abs(fl) * 0.04, 7), mats.emberGlow);
    flame.position.set(-21.1 + fl * 0.19, 2.94, -2.06);
    group.add(flame);
  }
  emberState.mesh = emberBed;

  // Open Brushed-Brass Fireplace Trim Frame (leaving firebox open so glowing logs & embers shine out)
  addBox(group, 1.34, 0.032, 0.024, mats.brass, -21.1, 3.57, -1.96);
  addBox(group, 1.34, 0.032, 0.024, mats.brass, -21.1, 2.73, -1.96);
  addBox(group, 0.032, 0.86, 0.024, mats.brass, -21.75, 3.15, -1.96);
  addBox(group, 0.032, 0.86, 0.024, mats.brass, -20.45, 3.15, -1.96);
  addBox(group, 1.58, 1.06, 0.05, mats.walnut, -21.1, 4.86, -2.20);
  addBox(group, 1.46, 0.94, 0.06, mats.paintingLiving, -21.1, 4.86, -2.19);
  registerBoxCollider(-22.42, -19.78, -2.92, -1.92);

  // Woven Cream Wool Rug (4.6m x 3.4m)
  addBox(group, 4.60, 0.014, 3.40, mats.livingRug, -20.2, 2.607, 0.45);

  // Plush Cream-Linen L-Shaped Sectional Sofa + Throw Pillows
  addBox(group, 4.35, 0.24, 0.96, mats.creamLinen, -19.72, 2.74, 1.94);
  addBox(group, 4.35, 0.56, 0.22, mats.creamLinen, -19.72, 3.14, 2.31);
  addBox(group, 0.22, 0.42, 0.96, mats.creamLinen, -21.79, 2.98, 1.94);
  addBox(group, 0.96, 0.24, 1.62, mats.creamLinen, -18.03, 2.74, 0.65);
  addBox(group, 0.22, 0.56, 2.56, mats.creamLinen, -17.66, 3.14, 1.14);

  for (let c = 0; c < 4; c += 1) {
    addBox(group, 0.96, 0.15, 0.72, mats.ivoryLinen, -21.18 + c * 0.98, 2.93, 1.84);
  }
  addBox(group, 0.72, 0.15, 1.54, mats.ivoryLinen, -18.12, 2.93, 0.65);

  const pillows = [
    [-21.42, 3.14, 2.04, 0.25, mats.sageVelvet],
    [-20.45, 3.14, 2.08, -0.15, mats.terracottaVelvet],
    [-19.15, 3.14, 2.08, 0.18, mats.blushLinen],
    [-17.92, 3.14, 1.98, -0.35, mats.sageVelvet],
    [-17.88, 3.14, 0.42, 0.22, mats.terracottaVelvet],
  ];
  for (const [px, py, pz, ry, pMat] of pillows) {
    addBox(group, 0.42, 0.36, 0.14, pMat, px, py, pz, ry);
  }
  registerBoxCollider(-21.90, -17.55, 1.45, 2.42);
  registerBoxCollider(-18.52, -17.55, -0.15, 1.45);

  // Cozy Boucle Accent Armchair
  const armChair = new THREE.Group();
  armChair.position.set(-22.75, 2.60, -1.20);
  armChair.rotation.y = 0.68;
  addBox(armChair, 0.84, 0.36, 0.80, mats.creamLinen, 0, 0.24, 0);
  addBox(armChair, 0.84, 0.46, 0.18, mats.creamLinen, 0, 0.58, -0.31);
  addBox(armChair, 0.16, 0.34, 0.78, mats.creamLinen, -0.34, 0.48, 0);
  addBox(armChair, 0.16, 0.34, 0.78, mats.creamLinen, 0.34, 0.48, 0);
  addBox(armChair, 0.40, 0.32, 0.12, mats.sageVelvet, 0, 0.52, -0.16);
  group.add(armChair);
  registerCircleCollider(-22.75, -1.20, 0.44);

  // Solid Walnut Coffee Table (-20.4, 2.60, +0.4) with Art Books, Ceramic Tray & Garden Roses
  addBox(group, 1.44, 0.055, 0.82, mats.walnut, -20.4, 3.01, 0.40);
  for (const [lx, lz] of [[-0.60, -0.31], [0.60, -0.31], [-0.60, 0.31], [0.60, 0.31]]) {
    addBox(group, 0.06, 0.39, 0.06, mats.walnut, -20.4 + lx, 2.80, 0.40 + lz);
  }
  addBox(group, 0.34, 0.04, 0.26, mats.terracottaVelvet, -20.78, 3.06, 0.36, 0.12);
  addBox(group, 0.30, 0.035, 0.23, mats.ivoryLinen, -20.78, 3.098, 0.36, -0.08);
  addBox(group, 0.44, 0.025, 0.32, mats.zelligeTile, -20.15, 3.05, 0.42);
  addRoseArrangement(group, mats, -20.15, 3.06, 0.42, 0.95);
  registerBoxCollider(-21.12, -19.68, -0.02, 0.82);

  // Brushed-Brass Arc Floor Lamp + Potted Indoor Olive Tree
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.22, 0.04, 16), mats.marble);
  lampBase.position.set(-17.30, 2.62, 2.52);
  group.add(lampBase);
  const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 2.05, 10), mats.brass);
  lampStem.position.set(-17.30, 3.64, 2.52);
  group.add(lampStem);
  addBox(group, 0.62, 0.025, 0.025, mats.brass, -17.56, 4.64, 2.28, 0.68);
  const arcShade = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.26, 18, 1, true), mats.warmShade);
  arcShade.position.set(-17.80, 4.48, 2.08);
  group.add(arcShade);

  const olivePot = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.22, 0.54, 16), mats.terracottaPot);
  olivePot.position.set(-23.22, 2.87, -2.22);
  group.add(olivePot);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.068, 1.25, 10), mats.walnut);
  trunk.position.set(-23.22, 3.64, -2.22);
  group.add(trunk);
  const oliveLeafGeo = new THREE.ConeGeometry(0.055, 0.28, 5);
  oliveLeafGeo.scale(1.0, 1.0, 0.26);
  oliveLeafGeo.translate(0, 0.14, 0);
  const oliveBranches = [
    [-0.18, 4.22, 0.14, 0.42, -0.35],
    [0.20, 4.28, -0.14, -0.38, 0.36],
    [0.06, 4.48, 0.16, 0.34, 0.24],
    [-0.14, 4.44, -0.16, -0.32, -0.30],
    [0.0, 4.62, 0.0, 0.12, -0.08],
  ];
  for (let bIdx = 0; bIdx < oliveBranches.length; bIdx += 1) {
    const [bx, by, bz, rx, rz] = oliveBranches[bIdx];
    const bLimb = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.026, 0.48, 7), mats.walnut);
    bLimb.position.set(-23.22 + bx * 0.55, by - 0.16, -2.22 + bz * 0.55);
    bLimb.rotation.set(rx, bIdx * 1.1, rz);
    group.add(bLimb);
    for (let lf = 0; lf < 9; lf += 1) {
      const la = (lf / 9) * Math.PI * 2 + bIdx * 0.7;
      const leafMesh = new THREE.Mesh(oliveLeafGeo, mats.foliageOlive);
      leafMesh.position.set(
        -23.22 + bx + Math.cos(la) * 0.14,
        by + (lf % 3) * 0.06,
        -2.22 + bz + Math.sin(la) * 0.14
      );
      leafMesh.rotation.set(0.65 + (lf % 2) * 0.22, la, 0.25);
      group.add(leafMesh);
    }
  }
  registerCircleCollider(-23.22, -2.22, 0.38);

  // --- 2. DINING HALL (Centered at -13.2, 2.60, -0.9, wide open foyer sightline) ---
  addBox(group, 2.60, 0.065, 1.15, mats.walnut, -13.20, 3.35, -0.90);
  for (const [lx, lz] of [[-1.16, -0.46], [1.16, -0.46], [-1.16, 0.46], [1.16, 0.46]]) {
    addBox(group, 0.075, 0.72, 0.075, mats.walnut, -13.20 + lx, 2.96, -0.90 + lz);
  }
  addBox(group, 2.10, 0.012, 0.38, mats.oatFabric, -13.20, 3.39, -0.90);
  addRoseArrangement(group, mats, -13.52, 3.39, -0.90, 0.92);

  // Porcelain Afternoon Tea Set & Berry Tart on Pedestal Stand
  const standPed = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.08, 0.11, 16), mats.zelligeTile);
  standPed.position.set(-12.52, 3.44, -0.90);
  group.add(standPed);
  const tart = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.04, 16), mats.naturalOak);
  tart.position.set(-12.52, 3.51, -0.90);
  group.add(tart);
  const berries = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.022, 16), mats.waxSeal);
  berries.position.set(-12.52, 3.535, -0.90);
  group.add(berries);
  const teapot = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), mats.zelligeTile);
  teapot.position.set(-13.86, 3.47, -0.88);
  group.add(teapot);

  const addDiningChair = (cx, cz, ry) => {
    const ch = new THREE.Group();
    ch.position.set(cx, 2.60, cz);
    ch.rotation.y = ry;
    addBox(ch, 0.48, 0.05, 0.46, mats.creamLinen, 0, 0.46, 0);
    addBox(ch, 0.46, 0.46, 0.045, mats.walnut, 0, 0.72, -0.21);
    for (const [sx, sz] of [[-0.20, -0.19], [0.20, -0.19], [-0.20, 0.19], [0.20, 0.19]]) {
      addBox(ch, 0.042, 0.45, 0.042, mats.walnut, sx, 0.225, sz);
    }
    group.add(ch);
  };
  addDiningChair(-13.78, -1.52, 0);
  addDiningChair(-12.62, -1.52, 0);
  addDiningChair(-13.78, -0.28, Math.PI);
  addDiningChair(-12.62, -0.28, Math.PI);
  addDiningChair(-14.58, -0.90, Math.PI * 0.5);
  addDiningChair(-11.82, -0.90, -Math.PI * 0.5);
  registerBoxCollider(-14.68, -11.72, -1.66, -0.14);

  // Woven Rattan & Brass Pendant Chandelier (Y = +4.95m)
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.32, 8), mats.brass);
  rod.position.set(-13.20, 5.62, -0.90);
  group.add(rod);
  const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, 0.24, 22, 1, true), mats.naturalOak);
  tier1.position.set(-13.20, 5.02, -0.90);
  group.add(tier1);
  const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.18, 20, 1, true), mats.warmShade);
  tier2.position.set(-13.20, 4.86, -0.90);
  group.add(tier2);

  // --- 3. OPEN COASTAL CHEF'S KITCHEN (East side of Grand Hall) ---
  // French-Door Stainless Refrigerator + L-Shaped Sage-Green Shaker Cabinetry
  addBox(group, 1.04, 2.15, 0.76, mats.stainless, -8.88, 3.675, -2.52);
  addBox(group, 0.025, 0.85, 0.04, mats.brass, -8.92, 3.85, -2.12);
  addBox(group, 0.025, 0.85, 0.04, mats.brass, -8.84, 3.85, -2.12);

  addBox(group, 4.24, 0.86, 0.68, mats.sageWood, -6.24, 3.03, -2.56);
  addBox(group, 4.28, 0.045, 0.72, mats.marble, -6.24, 3.48, -2.55);
  addBox(group, 4.24, 0.82, 0.03, mats.zelligeTile, -6.24, 3.91, -2.88);
  addBox(group, 0.66, 0.86, 1.80, mats.sageWood, -4.45, 3.03, -1.30);
  addBox(group, 0.70, 0.045, 1.84, mats.marble, -4.45, 3.48, -1.30);

  // Integrated Stainless Range, Copper Saucepans, Plaster Range Hood & Upper Shaker Cabinets
  addBox(group, 1.06, 0.87, 0.71, mats.stainless, -6.55, 3.035, -2.54);
  addBox(group, 0.96, 0.03, 0.58, mats.castIron, -6.55, 3.51, -2.54);
  const copperPot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.13, 14), mats.copper);
  copperPot.position.set(-6.32, 3.58, -2.48);
  group.add(copperPot);
  addBox(group, 1.16, 1.92, 0.62, mats.intPlaster, -6.55, 5.30, -2.59);
  addBox(group, 1.20, 0.06, 0.65, mats.brass, -6.55, 4.36, -2.59);
  addBox(group, 1.12, 1.02, 0.38, mats.sageWood, -7.78, 4.86, -2.71);
  addBox(group, 1.65, 1.02, 0.38, mats.sageWood, -5.08, 4.86, -2.71);
  addBox(group, 0.36, 0.34, 0.32, mats.stainless, -7.85, 3.67, -2.55);
  registerBoxCollider(-9.42, -4.12, -2.90, -2.14);
  registerBoxCollider(-4.80, -4.12, -2.22, -0.38);

  // Calacatta Marble Waterfall Kitchen Island (-7.4, 2.60, +0.60, 2.8m x 1.05m)
  addBox(group, 2.68, 0.88, 0.86, mats.sageWood, -7.40, 3.04, 0.54);
  addBox(group, 2.80, 0.055, 1.05, mats.marble, -7.40, 3.505, 0.60);
  addBox(group, 0.055, 0.92, 1.05, mats.marble, -8.77, 3.06, 0.60);
  addBox(group, 0.055, 0.92, 1.05, mats.marble, -6.03, 3.06, 0.60);

  // Farmhouse Sink, Brass Gooseneck Faucet, Charcuterie Board & Fruit Bowl
  addBox(group, 0.72, 0.06, 0.48, mats.zelligeTile, -7.40, 3.51, 0.46);
  const faucetStem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.34, 10), mats.brass);
  faucetStem.position.set(-7.40, 3.68, 0.18);
  group.add(faucetStem);
  addBox(group, 0.03, 0.03, 0.22, mats.brass, -7.40, 3.84, 0.28);
  addBox(group, 0.48, 0.025, 0.28, mats.walnut, -8.25, 3.545, 0.62, 0.14);
  const fruitBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.10, 0.09, 16), mats.zelligeTile);
  fruitBowl.position.set(-6.52, 3.575, 0.62);
  group.add(fruitBowl);
  for (const [fx, fz, col] of [[-0.05, 0, 0xe8c44a], [0.06, 0.03, 0xe6955e], [0, -0.05, 0xe8c44a]]) {
    const fr = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), pbrPlasterMat(col, { roughness: 0.45 }));
    fr.position.set(-6.52 + fx, 3.63, 0.62 + fz);
    group.add(fr);
  }

  // 3 Walnut & Cognac-Leather Counter Stools + 3 Glowing Brass & Opal Pendant Lights
  for (const sx of [-8.18, -7.40, -6.62]) {
    addBox(group, 0.38, 0.06, 0.36, mats.cognacLeather, sx, 3.24, 1.25);
    for (const [lx, lz] of [[-0.15, -0.14], [0.15, -0.14], [-0.15, 0.14], [0.15, 0.14]]) {
      addBox(group, 0.036, 0.62, 0.036, mats.walnut, sx + lx, 2.91, 1.25 + lz);
    }
    const pCord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.56, 8), mats.brass);
    pCord.position.set(sx, 5.50, 0.60);
    group.add(pCord);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 14), mats.opalGlow);
    globe.position.set(sx, 4.68, 0.60);
    group.add(globe);
  }
  registerBoxCollider(-8.82, -5.98, 0.06, 1.46);
}

function buildMasterSuite(group, mats) {
  // Plush Bedroom Rug
  addBox(group, 3.85, 0.014, 3.45, mats.bedroomRug, -20.20, 2.607, -7.95);

  // Upholstered Ivory-Linen King Bed (2.15m x 2.30m, headboard at North wall)
  addBox(group, 2.18, 0.28, 2.30, mats.ivoryLinen, -20.20, 2.76, -8.58);
  addBox(group, 2.24, 0.98, 0.16, mats.creamLinen, -20.20, 3.11, -9.74);
  addBox(group, 2.04, 0.24, 2.14, mats.ivoryLinen, -20.20, 3.01, -8.54);
  // Layered Sage & Blush Quilted Duvet + Knit Throw
  addBox(group, 2.08, 0.14, 1.56, mats.sageVelvet, -20.20, 3.16, -8.22);
  addBox(group, 2.09, 0.08, 0.42, mats.blushLinen, -20.20, 3.22, -8.88);
  addBox(group, 2.12, 0.07, 0.46, mats.oatFabric, -20.20, 3.22, -7.66);

  // 4 Plush Sleeping & Euro Pillows
  addBox(group, 0.82, 0.22, 0.34, mats.ivoryLinen, -20.68, 3.24, -9.38, 0.04);
  addBox(group, 0.82, 0.22, 0.34, mats.ivoryLinen, -19.72, 3.24, -9.38, -0.04);
  addBox(group, 0.56, 0.20, 0.24, mats.blushLinen, -20.62, 3.26, -9.12, 0.08);
  addBox(group, 0.56, 0.20, 0.24, mats.sageVelvet, -19.78, 3.26, -9.12, -0.08);

  // Upholstered Bench at Foot of Bed
  addBox(group, 1.62, 0.14, 0.46, mats.creamLinen, -20.20, 2.98, -7.14);
  for (const [bx, bz] of [[-0.70, -0.17], [0.70, -0.17], [-0.70, 0.17], [0.70, 0.17]]) {
    addBox(group, 0.05, 0.32, 0.05, mats.naturalOak, -20.20 + bx, 2.76, -7.14 + bz);
  }
  registerBoxCollider(-21.30, -19.10, -9.85, -6.90);

  // Two Solid Walnut Nightstands + Warm Glowing Pleated-Linen Brass Table Lamps
  for (const nx of [-21.74, -18.66]) {
    addBox(group, 0.58, 0.54, 0.48, mats.walnut, nx, 2.89, -9.48);
    addBox(group, 0.16, 0.02, 0.03, mats.brass, nx, 2.98, -9.23);
    addBox(group, 0.16, 0.02, 0.03, mats.brass, nx, 2.78, -9.23);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 14), mats.brass);
    base.position.set(nx, 3.27, -9.48);
    group.add(base);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, 0.20, 18, 1, true), mats.warmShade);
    shade.position.set(nx, 3.46, -9.48);
    group.add(shade);
  }
  registerBoxCollider(-22.06, -21.40, -9.78, -9.18);
  registerBoxCollider(-19.00, -18.34, -9.78, -9.18);

  // Full-Height 3-Door Paneled Oak Wardrobe against East Partition (X = -14.42, Z in [-8.8, -5.8])
  addBox(group, 0.62, 2.52, 3.00, mats.naturalOak, -14.42, 3.86, -7.30);
  addBox(group, 0.68, 0.08, 3.08, mats.walnut, -14.43, 5.15, -7.30);
  for (let d = 0; d < 3; d += 1) {
    const dz = -8.30 + d * 1.00;
    addBox(group, 0.03, 2.26, 0.88, mats.walnut, -14.73, 3.86, dz);
    addBox(group, 0.04, 0.42, 0.024, mats.brass, -14.76, 3.78, dz + (d === 2 ? -0.36 : 0.36));
  }
  registerBoxCollider(-14.75, -14.10, -8.82, -5.78);

  // Walnut Vanity Dressing Table + Arched Brass Mirror + Velvet Stool near West Window
  addBox(group, 0.52, 0.12, 1.24, mats.walnut, -23.58, 3.32, -4.64);
  for (const [vx, vz] of [[-0.20, -0.54], [0.20, -0.54], [-0.20, 0.54], [0.20, 0.54]]) {
    addBox(group, 0.045, 0.68, 0.045, mats.walnut, -23.58 + vx, 2.94, -4.64 + vz);
  }
  addBox(group, 0.04, 0.56, 0.44, mats.brass, -23.76, 3.68, -4.64);
  const mirPane = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.50, 0.38), mats.stainless);
  mirPane.position.set(-23.75, 3.68, -4.64);
  group.add(mirPane);
  const stoolTop = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.09, 16), mats.blushLinen);
  stoolTop.position.set(-23.12, 3.04, -4.64);
  group.add(stoolTop);
  const stoolBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.40, 14), mats.brass);
  stoolBase.position.set(-23.12, 2.80, -4.64);
  group.add(stoolBase);
  registerBoxCollider(-23.88, -22.92, -5.30, -3.98);
}

function buildStudyBookcaseAndDaybed(group, mats) {
  // Woven Study Rug
  addBox(group, 4.30, 0.014, 3.30, mats.studyRug, -8.90, 2.607, -7.15);

  // Cozy Upholstered Guest Daybed (1.55m x 2.10m) against East Harbor-View Wall (-4.90, 2.60, -6.60)
  addBox(group, 1.55, 0.26, 2.10, mats.walnut, -4.90, 2.75, -6.60);
  addBox(group, 0.14, 0.72, 2.10, mats.oatFabric, -4.20, 2.98, -6.60);
  addBox(group, 1.48, 0.62, 0.12, mats.oatFabric, -4.92, 2.94, -7.60);
  addBox(group, 1.48, 0.62, 0.12, mats.oatFabric, -4.92, 2.94, -5.60);
  addBox(group, 1.42, 0.20, 1.94, mats.creamLinen, -4.94, 2.96, -6.60);
  addBox(group, 1.44, 0.08, 0.78, mats.sageVelvet, -4.94, 3.08, -6.02);
  for (let p = 0; p < 3; p += 1) {
    addBox(
      group,
      0.16,
      0.34,
      0.48,
      p === 1 ? mats.terracottaVelvet : mats.ivoryLinen,
      -4.38,
      3.18,
      -7.18 + p * 0.58,
      0.12 * (p - 1)
    );
  }
  const sideTbl = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.20, 0.52, 16), mats.walnut);
  sideTbl.position.set(-4.62, 2.86, -8.02);
  group.add(sideTbl);
  registerBoxCollider(-5.70, -4.12, -8.28, -5.52);

  // Grand Floor-to-Ceiling Walnut Library Bookcase (3.4m wide x 2.9m tall) at X = -13.66
  addBox(group, 0.06, 2.90, 3.40, mats.walnut, -13.86, 4.05, -7.10);
  addBox(group, 0.48, 0.08, 3.48, mats.walnut, -13.65, 5.48, -7.10);
  for (let v = 0; v <= 4; v += 1) {
    addBox(group, 0.44, 2.88, 0.05, mats.walnut, -13.66, 4.04, -8.80 + v * 0.85);
  }
  for (let s = 0; s < 6; s += 1) {
    addBox(group, 0.44, 0.04, 3.40, mats.walnut, -13.66, 2.64 + s * 0.48, -7.10);
  }

  // 96 Varied-Height Clothbound Books via InstancedMesh + Brass Terrestrial Globe
  const rng = mulberry32(8842);
  const bookCount = 96;
  const bookGeom = new THREE.BoxGeometry(0.22, 1.0, 1.0);
  const bookMat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.04 });
  const booksInst = new THREE.InstancedMesh(bookGeom, bookMat, bookCount);
  const palette = [0x365243, 0x7b2d2b, 0x2c425c, 0xb88a4b, 0xd8cdb8, 0x5c4738, 0x8d5b45];
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let idx = 0;
  for (let s = 0; s < 5; s += 1) {
    const shelfY = 2.66 + s * 0.48;
    for (let bay = 0; bay < 4; bay += 1) {
      if (s === 2 && bay === 2) continue;
      let curZ = -8.72 + bay * 0.85;
      const maxZ = curZ + 0.74;
      while (curZ < maxZ && idx < bookCount) {
        const thick = 0.028 + rng() * 0.026;
        const bh = 0.24 + rng() * 0.13;
        dummy.position.set(-13.62, shelfY + bh * 0.5, curZ + thick * 0.5);
        dummy.rotation.set(0.0, 0.0, 0.0);
        dummy.scale.set(1.0, bh, thick);
        dummy.updateMatrix();
        booksInst.setMatrixAt(idx, dummy.matrix);
        col.setHex(palette[Math.floor(rng() * palette.length)]);
        booksInst.setColorAt(idx, col);
        curZ += thick + 0.005;
        idx += 1;
      }
    }
  }
  booksInst.count = idx;
  booksInst.instanceMatrix.needsUpdate = true;
  if (booksInst.instanceColor) booksInst.instanceColor.needsUpdate = true;
  group.add(booksInst);

  const globeStand = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.05, 12), mats.brass);
  globeStand.position.set(-13.60, 3.65, -6.68);
  group.add(globeStand);
  const globeOrb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 14), pbrPlasterMat(0x88a9b3, { roughness: 0.45 }));
  globeOrb.position.set(-13.60, 3.80, -6.68);
  group.add(globeOrb);
  registerBoxCollider(-13.90, -13.40, -8.82, -5.38);
}

function buildStudyStudioAndDesk(group, mats) {
  // Wooden Artist Studio Easel (-6.2, 2.60, -4.3) with Framed Flower-Sea & Lighthouse Canvas
  const easel = new THREE.Group();
  easel.position.set(-6.20, 2.60, -4.30);
  easel.rotation.y = -2.42;
  const legL = addBox(easel, 0.04, 1.78, 0.04, mats.naturalOak, -0.24, 0.88, 0.08);
  legL.rotation.x = -0.11;
  legL.rotation.z = -0.09;
  const legR = addBox(easel, 0.04, 1.78, 0.04, mats.naturalOak, 0.24, 0.88, 0.08);
  legR.rotation.x = -0.11;
  legR.rotation.z = 0.09;
  const legBack = addBox(easel, 0.04, 1.72, 0.04, mats.naturalOak, 0, 0.84, -0.26);
  legBack.rotation.x = 0.24;
  addBox(easel, 0.72, 0.045, 0.09, mats.naturalOak, 0, 0.88, 0.14);

  const canvasGrp = new THREE.Group();
  canvasGrp.position.set(0, 1.24, 0.11);
  canvasGrp.rotation.x = -0.11;
  addBox(canvasGrp, 0.82, 0.64, 0.04, mats.walnut, 0, 0, 0);
  addBox(canvasGrp, 0.74, 0.56, 0.046, mats.paintingStudy, 0, 0, 0.005);
  easel.add(canvasGrp);
  group.add(easel);
  registerCircleCollider(-6.20, -4.30, 0.40);

  // Acoustic Cedar-Top Guitar on Stand (-5.20, 2.60, -3.75)
  const gtr = new THREE.Group();
  gtr.position.set(-5.20, 2.60, -3.75);
  gtr.rotation.y = -2.15;
  addBox(gtr, 0.30, 0.03, 0.32, mats.castIron, 0, 0.02, 0);
  addBox(gtr, 0.025, 0.68, 0.025, mats.castIron, 0, 0.35, -0.08);
  const bodyGrp = new THREE.Group();
  bodyGrp.position.set(0, 0.44, 0.02);
  bodyGrp.rotation.x = -0.18;
  const lowerBout = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.095, 20), mats.cedarDeck);
  lowerBout.rotation.x = Math.PI * 0.5;
  lowerBout.position.set(0, -0.09, 0);
  bodyGrp.add(lowerBout);
  const upperBout = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.092, 18), mats.cedarDeck);
  upperBout.rotation.x = Math.PI * 0.5;
  upperBout.position.set(0, 0.10, 0);
  bodyGrp.add(upperBout);
  const soundHole = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.098, 16), mats.castIron);
  soundHole.rotation.x = Math.PI * 0.5;
  soundHole.position.set(0, 0.05, 0.002);
  bodyGrp.add(soundHole);
  addBox(bodyGrp, 0.048, 0.52, 0.028, mats.walnut, 0, 0.44, 0.02);
  addBox(bodyGrp, 0.072, 0.15, 0.024, mats.walnut, 0, 0.74, 0.02);
  gtr.add(bodyGrp);
  group.add(gtr);
  registerCircleCollider(-5.20, -3.75, 0.34);

  // Hero Sunlit Walnut Writing Desk (-8.80, 2.60, -8.40) facing North Creek/Hills Window
  addBox(group, 1.72, 0.055, 0.84, mats.walnut, -8.80, 3.35, -8.40);
  addBox(group, 0.42, 0.68, 0.76, mats.walnut, -9.42, 2.98, -8.40);
  addBox(group, 0.42, 0.68, 0.76, mats.walnut, -8.18, 2.98, -8.40);
  for (const dx of [-9.42, -8.18]) {
    addBox(group, 0.14, 0.02, 0.03, mats.brass, dx, 3.16, -8.00);
    addBox(group, 0.14, 0.02, 0.03, mats.brass, dx, 2.94, -8.00);
  }
  addBox(group, 0.74, 0.01, 0.46, mats.cognacLeather, -8.80, 3.382, -8.36);

  // Upholstered Study Chair
  const sChair = new THREE.Group();
  sChair.position.set(-8.80, 2.60, -7.52);
  sChair.rotation.y = Math.PI + 0.22;
  addBox(sChair, 0.52, 0.06, 0.48, mats.creamLinen, 0, 0.46, 0);
  addBox(sChair, 0.50, 0.44, 0.06, mats.creamLinen, 0, 0.70, -0.21);
  for (const [lx, lz] of [[-0.21, -0.19], [0.21, -0.19], [-0.21, 0.19], [0.21, 0.19]]) {
    addBox(sChair, 0.042, 0.44, 0.042, mats.walnut, lx, 0.22, lz);
  }
  group.add(sChair);

  // Brass Banker's Lamp, Porcelain Rose Vase & Fountain Pen
  const bBase = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.095, 0.03, 14), mats.brass);
  bBase.position.set(-9.36, 3.39, -8.58);
  group.add(bBase);
  addBox(group, 0.022, 0.30, 0.022, mats.brass, -9.36, 3.54, -8.58);
  const emeraldShade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.22, 12, 1, false, 0, Math.PI),
    new THREE.MeshPhysicalMaterial({
      color: 0x1f6b4a,
      emissive: new THREE.Color(0x2d8a5e),
      emissiveIntensity: 0.45,
      roughness: 0.18,
      clearcoat: 0.8,
    })
  );
  emeraldShade.rotation.z = Math.PI * 0.5;
  emeraldShade.position.set(-9.36, 3.68, -8.55);
  group.add(emeraldShade);

  addRoseArrangement(group, mats, -8.02, 3.38, -8.62, 0.82);

  const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.005, 0.17, 8), mats.bronze);
  pen.rotation.z = Math.PI * 0.5;
  pen.rotation.y = 0.36;
  pen.position.set(-8.54, 3.395, -8.32);
  group.add(pen);

  // Interactive Wax-Sealed Cotton-Paper Love Letter
  const letterGroup = new THREE.Group();
  letterGroup.position.set(-8.80, 3.388, -8.32);
  addBox(letterGroup, 0.28, 0.010, 0.20, mats.ivoryLinen, -0.02, 0.005, 0.01, -0.08);
  addBox(letterGroup, 0.26, 0.012, 0.185, mats.letterPaper, 0.01, 0.016, -0.005, 0.11);
  addBox(letterGroup, 0.262, 0.014, 0.016, mats.brass, 0.01, 0.018, -0.005, 0.11);

  const sealRim = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.010, 18), mats.waxSeal);
  sealRim.position.set(0.015, 0.026, 0.0);
  letterGroup.add(sealRim);
  const sealStamp = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.013, 16), mats.waxSeal);
  sealStamp.position.set(0.015, 0.028, 0.0);
  letterGroup.add(sealStamp);

  const hitPad = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.10, 0.34),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false })
  );
  hitPad.position.set(0, 0.04, 0);
  hitPad.userData.noShadow = true;
  letterGroup.add(hitPad);

  tagInteractive(letterGroup, "love-letter", "书桌上的火漆情书");
  group.add(letterGroup);
  registerBoxCollider(-9.68, -7.92, -8.84, -7.32);
}

export function buildCoastalVilla() {
  const group = new THREE.Group();
  group.name = "coastal-villa";

  const mats = createVillaMaterials();
  const curtainAnimList = [];
  const emberState = { mesh: null };

  buildPlinthVerandaAndStairs(group, mats);
  buildWallsWindowsDoorsAndRoof(group, mats, curtainAnimList);
  buildGrandLivingDiningKitchen(group, mats, emberState);
  buildMasterSuite(group, mats);
  buildStudyBookcaseAndDaybed(group, mats);
  buildStudyStudioAndDesk(group, mats);

  // Warm Realistic Interior & Veranda Lighting (single central warm interior light + emissive fixtures for 60 FPS)
  const villaInteriorLight = new THREE.PointLight(0xffe1b6, 5.2, 26.0, 1.35);
  villaInteriorLight.position.set(-14.0, 5.45, -2.4);
  villaInteriorLight.castShadow = false;
  group.add(villaInteriorLight);

  enablePBRShadows(group, { cast: true, receive: true, minRadius: 0.22 });

  return {
    group,
    update(elapsed) {
      for (let i = 0; i < curtainAnimList.length; i += 1) {
        const item = curtainAnimList[i];
        const sway = Math.sin(elapsed * 1.15 + item.phase) * 0.028 +
          Math.sin(elapsed * 2.1 + item.phase * 1.7) * 0.01;
        item.mesh.rotation.x = sway;
        item.mesh.rotation.z = sway * 0.45;
      }
      const flicker =
        1.0 +
        0.16 * Math.sin(elapsed * 6.3) +
        0.10 * Math.sin(elapsed * 13.7 + 1.2) +
        0.06 * Math.cos(elapsed * 21.1);
      if (emberState.mesh) {
        mats.emberGlow.emissiveIntensity = 1.85 * flicker;
      }
    },
    anchors: {
      entranceOutside: [-14.0, 2.20, 10.6],
      livingRoom: [-16.2, 2.60, 1.4],
      masterBedroom: [-17.6, 2.60, -5.2],
      studyRoom: [-9.8, 2.60, -5.4],
    },
  };
}
