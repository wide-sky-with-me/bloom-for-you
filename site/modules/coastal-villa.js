// 1:1 Human-Scale Two-Story French Vintage Petite Garden Villa (法式复古双层花园小别墅)
// Vintage Sage-Green & Dusty-Rose Boiserie Interiors, Lush Potted Blooms & Hanging Spider Plants (吊兰),
// Walkable 1F Salon/Kitchen/Conservatory Study + Indoor Staircase + 2F Canopy Master Suite & Sea-View Flower Terraces.

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
  pbrFabricMat,
  pbrMetalMat,
  registerWalkZone,
  registerBoxCollider,
  registerCircleCollider,
  tagInteractive,
  enablePBRShadows,
  batchStaticMeshesByMaterial,
} from "./pbr-kit.js";
import { createRoseBouquet } from "./botanical-flora.js";

function createFineWoodMaterial(colorHex, { roughness = 0.38, repeatX = 2, repeatY = 2, seed = 4201 } = {}) {
  const rng = mulberry32(seed);
  const drawGrain = (ctx, w, h, isHeight) => {
    ctx.fillStyle = isHeight ? "#808080" : "#e8dfd2";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 180; i += 1) {
      const y = (i / 180) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) {
        const wave = Math.sin(x * 0.025 + i * 0.19) * 2.4 + (rng() - 0.5) * 1.4;
        ctx.lineTo(x, y + wave);
      }
      ctx.lineWidth = 0.9 + rng() * 1.6;
      ctx.strokeStyle = isHeight
        ? `rgba(${rng() > 0.5 ? 152 : 104},128,128,0.22)`
        : `rgba(112,86,62,${0.06 + rng() * 0.08})`;
      ctx.stroke();
    }
  };
  const map = makeCanvasTex(256, 256, (ctx, w, h) => drawGrain(ctx, w, h, false), { repeatX, repeatY });
  const normalMap = makeNormalTex(256, 256, (ctx, w, h) => drawGrain(ctx, w, h, true), {
    strength: 0.45,
    repeatX,
    repeatY,
  });
  return new THREE.MeshStandardMaterial({
    color: colorHex,
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.18, 0.18),
    roughness,
    metalness: 0.03,
  });
}

function createMarbleMaterial() {
  const rng = mulberry32(9104);
  const drawVeins = (ctx, w, h, isHeight) => {
    ctx.fillStyle = isHeight ? "#dcdcdc" : "#f8f5ef";
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
      ctx.lineWidth = 1.2 + rng() * 3.6;
      ctx.strokeStyle = isHeight
        ? "rgba(165,165,165,0.42)"
        : v % 3 === 0
          ? "rgba(196,154,142,0.24)"
          : "rgba(136,150,140,0.25)";
      ctx.stroke();
    }
  };
  const map = makeCanvasTex(512, 512, (ctx, w, h) => drawVeins(ctx, w, h, false), { repeatX: 2, repeatY: 1 });
  const normalMap = makeNormalTex(512, 512, (ctx, w, h) => drawVeins(ctx, w, h, true), {
    strength: 0.65,
    repeatX: 2,
    repeatY: 1,
  });
  return new THREE.MeshPhysicalMaterial({
    color: 0xfcf9f4,
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.2, 0.2),
    roughness: 0.15,
    metalness: 0.02,
    clearcoat: 0.55,
    clearcoatRoughness: 0.14,
  });
}

function createVintageWallpaperMat(bgHex, roseHex, leafHex, repeatX = 6, repeatY = 2, seed = 6102) {
  const rng = mulberry32(seed);
  const map = makeCanvasTex(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = bgHex;
      ctx.fillRect(0, 0, w, h);
      // Subtle linen vertical striation
      ctx.strokeStyle = "rgba(255,250,244,0.28)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 6) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      // Damask / French toile rose-and-vine diamond lattice
      const pts = [
        [64, 64], [192, 64], [128, 128], [0, 128], [256, 128], [64, 192], [192, 192], [128, 0], [128, 256],
      ];
      ctx.strokeStyle = leafHex;
      ctx.lineWidth = 1.6;
      for (const [cx, cy] of pts) {
        ctx.beginPath();
        ctx.arc(cx, cy, 26, 0.2, Math.PI * 1.8);
        ctx.stroke();
        // Leaves
        ctx.fillStyle = leafHex;
        for (const a of [-0.7, 0.8, 2.3, 3.8]) {
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(a) * 16, cy + Math.sin(a) * 16, 6, 2.8, a, 0, Math.PI * 2);
          ctx.fill();
        }
        // Vintage layered rose bloom
        ctx.fillStyle = roseHex;
        for (let p = 0; p < 5; p += 1) {
          const pa = (p / 5) * Math.PI * 2 + rng() * 0.2;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(pa) * 5.2, cy + Math.sin(pa) * 5.2, 5.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(255,244,236,0.65)";
        ctx.beginPath();
        ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { repeatX, repeatY }
  );
  return new THREE.MeshStandardMaterial({
    map,
    roughness: 0.88,
    metalness: 0.01,
  });
}

function createAubussonRugMat(bgHex, roseHex, sageHex, goldHex, seed) {
  const rng = mulberry32(seed);
  const map = makeCanvasTex(512, 384, (ctx, w, h) => {
    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, w, h);
    // Outer sage & antique gold borders
    ctx.strokeStyle = sageHex;
    ctx.lineWidth = 22;
    ctx.strokeRect(22, 22, w - 44, h - 44);
    ctx.strokeStyle = goldHex;
    ctx.lineWidth = 4;
    ctx.strokeRect(38, 38, w - 76, h - 76);
    ctx.strokeStyle = roseHex;
    ctx.lineWidth = 3;
    ctx.strokeRect(48, 48, w - 96, h - 96);

    // Central vintage floral medallion
    ctx.fillStyle = roseHex;
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.5, w * 0.22, h * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bgHex;
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.5, w * 0.16, h * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = sageHex;
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.5, w * 0.08, h * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    // Floral garlands in corners & center
    const clusters = [
      [w * 0.5, h * 0.5],
      [86, 82], [w - 86, 82], [86, h - 82], [w - 86, h - 82],
      [w * 0.26, h * 0.5], [w * 0.74, h * 0.5],
    ];
    for (const [cx, cy] of clusters) {
      for (let k = 0; k < 7; k += 1) {
        const a = (k / 7) * Math.PI * 2;
        ctx.fillStyle = k % 2 === 0 ? roseHex : goldHex;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * 14, cy + Math.sin(a) * 12, 5.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Soft vintage wool weave patina
    for (let i = 0; i < 3200; i += 1) {
      const shade = 220 + Math.floor(rng() * 30);
      ctx.fillStyle = `rgba(${shade},${shade - 6},${shade - 12},0.16)`;
      ctx.fillRect(rng() * w, rng() * h, 3, 1.5);
    }
  });
  return new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0.0 });
}

function createCheckeredZelligeMat() {
  const map = makeCanvasTex(
    256,
    256,
    (ctx, w, h) => {
      const n = 8;
      const s = w / n;
      for (let r = 0; r < n; r += 1) {
        for (let c = 0; c < n; c += 1) {
          ctx.fillStyle = (r + c) % 2 === 0 ? "#f7efe8" : "#d89fa6";
          ctx.fillRect(c * s + 1, r * s + 1, s - 2, s - 2);
          ctx.strokeStyle = "rgba(180,156,144,0.35)";
          ctx.strokeRect(c * s + 0.5, r * s + 0.5, s - 1, s - 1);
        }
      }
    },
    { repeatX: 4, repeatY: 2 }
  );
  return new THREE.MeshPhysicalMaterial({
    map,
    roughness: 0.16,
    clearcoat: 0.78,
    clearcoatRoughness: 0.12,
  });
}

function createSpiderLeafMaterial() {
  const map = makeCanvasTex(64, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0.0, "#3d6e42");
    g.addColorStop(0.24, "#538c54");
    g.addColorStop(0.40, "#f5f0d5");
    g.addColorStop(0.60, "#faf6df");
    g.addColorStop(0.76, "#538c54");
    g.addColorStop(1.0, "#3d6e42");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  return new THREE.MeshStandardMaterial({
    map,
    roughness: 0.52,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
}

function createVintagePaintingTex(variant = 0) {
  return makeCanvasTex(384, 256, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.58);
    sky.addColorStop(0, variant === 1 ? "#d8c3cb" : "#c6d9cf");
    sky.addColorStop(0.6, "#f2dec8");
    sky.addColorStop(1, "#fae8d2");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const sea = ctx.createLinearGradient(0, h * 0.52, 0, h);
    sea.addColorStop(0, "#497d8c");
    sea.addColorStop(0.55, "#6ea0a8");
    sea.addColorStop(1, "#e2d1ba");
    ctx.fillStyle = sea;
    ctx.fillRect(0, h * 0.52, w, h * 0.48);

    ctx.fillStyle = "#627a63";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.62);
    ctx.quadraticCurveTo(w * 0.32, h * 0.34, w * 0.68, h * 0.58);
    ctx.lineTo(0, h * 0.76);
    ctx.closePath();
    ctx.fill();

    const rng = mulberry32(2207 + variant * 719);
    const palette = ["#d88391", "#f3d4dc", "#b95c6e", "#f6efe4", "#7e9a82", "#cfa56a"];
    for (let i = 0; i < 420; i += 1) {
      ctx.fillStyle = palette[Math.floor(rng() * palette.length)];
      const fx = rng() * w * 0.82;
      const fy = h * 0.58 + rng() * h * 0.38;
      ctx.fillRect(fx, fy, 4 + rng() * 6, 2.5 + rng() * 4);
    }
  });
}

function createLoveLetterTex() {
  return makeCanvasTex(256, 192, (ctx, w, h) => {
    ctx.fillStyle = "#f9f1e4";
    ctx.fillRect(0, 0, w, h);
    const foldGrad = ctx.createLinearGradient(0, h * 0.46, 0, h * 0.54);
    foldGrad.addColorStop(0, "rgba(160,136,105,0.0)");
    foldGrad.addColorStop(0.48, "rgba(138,112,82,0.22)");
    foldGrad.addColorStop(0.52, "rgba(255,252,246,0.35)");
    foldGrad.addColorStop(1, "rgba(160,136,105,0.0)");
    ctx.fillStyle = foldGrad;
    ctx.fillRect(10, h * 0.45, w - 20, h * 0.1);

    ctx.strokeStyle = "rgba(186,142,146,0.52)";
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.strokeStyle = "rgba(86,62,48,0.62)";
    ctx.lineWidth = 1.6;
    for (let row = 0; row < 7; row += 1) {
      const y = 32 + row * 18;
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
  const parquet = getOakParquetTextures(10, 7);
  const roof = getTerracottaRoofTextures(11, 7);
  return {
    // Exterior Petite Villa Materials: Warm French Cream Stucco + Limestone Quoins + Vintage Sage Shutters
    extPlaster: pbrPlasterMat(0xf7efe3, { repeatX: 6, repeatY: 3, roughness: 0.84 }),
    extBlushTrim: pbrPlasterMat(0xefe0dc, { repeatX: 4, repeatY: 2, roughness: 0.82 }),
    limestone: pbrStoneMat(0xdfd6c6, { repeatX: 6, repeatY: 2, roughness: 0.8 }),
    hearthStone: pbrStoneMat(0xd9cfc0, { repeatX: 3, repeatY: 3, roughness: 0.82 }),
    copingStone: pbrStoneMat(0xeae2d4, { repeatX: 5, repeatY: 1, roughness: 0.74 }),
    shutterSage: createFineWoodMaterial(0x66826c, { roughness: 0.5, seed: 4311 }),

    // Vintage French Sage-Green & Dusty-Rose Boiserie & Wallpaper Palette
    boiserieSage: createFineWoodMaterial(0x69846e, { roughness: 0.44, seed: 4401 }),
    boiserieSageDeep: createFineWoodMaterial(0x526b57, { roughness: 0.46, seed: 4402 }),
    boiserieRose: createFineWoodMaterial(0xc48b93, { roughness: 0.44, seed: 4403 }),
    boiserieRoseDeep: createFineWoodMaterial(0xa86f78, { roughness: 0.46, seed: 4404 }),
    creamMolding: createFineWoodMaterial(0xf5ece0, { roughness: 0.48, seed: 4405 }),
    wallpaperSalon: createVintageWallpaperMat("#f4e2df", "rgba(198,128,138,0.62)", "rgba(116,142,118,0.48)", 7, 2, 6101),
    wallpaperMaster: createVintageWallpaperMat("#f7e5e3", "rgba(194,116,129,0.68)", "rgba(122,146,124,0.44)", 6, 2, 6108),
    wallpaperStudy: createVintageWallpaperMat("#e6ede4", "rgba(196,128,138,0.58)", "rgba(98,130,104,0.52)", 5, 2, 6115),
    ceilPlaster: new THREE.MeshStandardMaterial({
      color: 0xfcf6ef,
      emissive: new THREE.Color(0xfff0df),
      emissiveIntensity: 0.34,
      roughness: 0.88,
    }),

    // Fine Woods & Parquet
    parquetFloor: new THREE.MeshStandardMaterial({
      color: 0xc29062,
      map: parquet.map,
      normalMap: parquet.normalMap,
      normalScale: new THREE.Vector2(0.44, 0.44),
      roughness: 0.36,
      metalness: 0.04,
    }),
    cedarDeck: createFineWoodMaterial(0xa6744d, { roughness: 0.58, repeatX: 4, repeatY: 3, seed: 4501 }),
    cedarBeam: createFineWoodMaterial(0x7d5336, { roughness: 0.54, repeatX: 3, repeatY: 1, seed: 4502 }),
    walnut: createFineWoodMaterial(0x5a3a25, { roughness: 0.32, repeatX: 2, repeatY: 2, seed: 4503 }),
    naturalOak: createFineWoodMaterial(0xb4855a, { roughness: 0.4, repeatX: 2, repeatY: 2, seed: 4504 }),
    retroMintEnamel: new THREE.MeshPhysicalMaterial({
      color: 0x86a892,
      roughness: 0.18,
      metalness: 0.08,
      clearcoat: 0.85,
      clearcoatRoughness: 0.1,
    }),
    retroCreamEnamel: new THREE.MeshPhysicalMaterial({
      color: 0xf5ecde,
      roughness: 0.18,
      metalness: 0.06,
      clearcoat: 0.82,
      clearcoatRoughness: 0.12,
    }),
    retroRosePorcelain: new THREE.MeshPhysicalMaterial({
      color: 0xe3aeb6,
      roughness: 0.16,
      clearcoat: 0.82,
      clearcoatRoughness: 0.1,
    }),
    celadonGlaze: new THREE.MeshPhysicalMaterial({
      color: 0x9ab5a0,
      roughness: 0.18,
      clearcoat: 0.8,
      clearcoatRoughness: 0.12,
    }),
    terracottaRoof: new THREE.MeshStandardMaterial({
      color: 0xc66b4c,
      map: roof.map,
      normalMap: roof.normalMap,
      normalScale: new THREE.Vector2(0.92, 0.92),
      roughness: 0.72,
      metalness: 0.03,
      side: THREE.DoubleSide,
    }),
    terracottaPot: pbrPlasterMat(0xba6b4d, { repeatX: 2, repeatY: 2, roughness: 0.76 }),
    marble: createMarbleMaterial(),
    checkeredTile: createCheckeredZelligeMat(),
    zelligeTile: new THREE.MeshPhysicalMaterial({
      color: 0xf4efea,
      roughness: 0.16,
      clearcoat: 0.76,
      clearcoatRoughness: 0.12,
    }),

    // Metals & Crystal/Glass
    brass: pbrMetalMat(0xcfa658, { roughness: 0.24, metalness: 0.88 }),
    bronze: pbrMetalMat(0x42362f, { roughness: 0.4, metalness: 0.78 }),
    copper: pbrMetalMat(0xa35f43, { roughness: 0.32, metalness: 0.84 }),
    wroughtIron: pbrMetalMat(0x2c302d, { roughness: 0.52, metalness: 0.76 }),
    mirrorSilver: pbrMetalMat(0xe8edf0, { roughness: 0.08, metalness: 0.96 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xe7f3f6,
      emissive: new THREE.Color(0xffcf92),
      emissiveIntensity: 0.05,
      transparent: true,
      opacity: 0.22,
      roughness: 0.08,
      metalness: 0.08,
      envMapIntensity: 1.35,
      side: THREE.DoubleSide,
    }),
    roseCrystal: new THREE.MeshStandardMaterial({
      color: 0xf7cfd6,
      emissive: new THREE.Color(0xffcad4),
      emissiveIntensity: 0.42,
      transparent: true,
      opacity: 0.78,
      roughness: 0.1,
      metalness: 0.15,
    }),

    // Vintage Velvets, Linens & Sheer Lace/Voile
    dustyRoseVelvet: pbrFabricMat(0xc67e89, { roughness: 0.72 }),
    deepRoseVelvet: pbrFabricMat(0xa65d69, { roughness: 0.74 }),
    blushSilk: pbrFabricMat(0xeac7cc, { roughness: 0.68 }),
    sageVelvet: pbrFabricMat(0x6b8770, { roughness: 0.74 }),
    celadonLinen: pbrFabricMat(0xa6bca8, { roughness: 0.84 }),
    creamLinen: pbrFabricMat(0xf5ede2, { roughness: 0.86 }),
    ivoryLinen: pbrFabricMat(0xfaf5ed, { roughness: 0.84 }),
    cognacLeather: new THREE.MeshStandardMaterial({ color: 0x895134, roughness: 0.44, metalness: 0.04 }),
    macrameCord: pbrFabricMat(0xeadfce, { roughness: 0.92 }),
    sheerCurtain: new THREE.MeshStandardMaterial({
      color: 0xfdf6f2,
      transparent: true,
      opacity: 0.66,
      roughness: 0.86,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    roseDrape: pbrFabricMat(0xcf8e98, { roughness: 0.78, side: THREE.DoubleSide }),

    // Vintage Aubusson Rugs & Botanical Art
    livingRug: createAubussonRugMat("#f3e9df", "#c57c87", "#6f8973", "#c8a464", 5201),
    masterRug: createAubussonRugMat("#f6e7e6", "#be7380", "#7c9680", "#cca768", 5202),
    studyRug: createAubussonRugMat("#e9efe6", "#c4818b", "#5f7a64", "#c49f60", 5203),
    paintingLiving: new THREE.MeshStandardMaterial({ map: createVintagePaintingTex(0), roughness: 0.58 }),
    paintingMaster: new THREE.MeshStandardMaterial({ map: createVintagePaintingTex(1), roughness: 0.58 }),
    paintingStudy: new THREE.MeshStandardMaterial({ map: createVintagePaintingTex(2), roughness: 0.58 }),
    letterPaper: new THREE.MeshStandardMaterial({ map: createLoveLetterTex(), roughness: 0.84 }),
    waxSeal: new THREE.MeshStandardMaterial({ color: 0x921f28, roughness: 0.3, metalness: 0.08 }),

    // Botanicals
    spiderLeaf: createSpiderLeafMaterial(),
    foliageLush: new THREE.MeshStandardMaterial({ color: 0x4b7748, roughness: 0.64, side: THREE.DoubleSide }),
    foliageIvy: new THREE.MeshStandardMaterial({ color: 0x3f6b42, roughness: 0.62, side: THREE.DoubleSide }),
    soilDark: new THREE.MeshStandardMaterial({ color: 0x3d2b20, roughness: 0.94 }),
    petalPink: new THREE.MeshStandardMaterial({ color: 0xe695a4, roughness: 0.54, side: THREE.DoubleSide }),
    petalBlush: new THREE.MeshStandardMaterial({ color: 0xf5ced6, roughness: 0.52, side: THREE.DoubleSide }),
    petalLilac: new THREE.MeshStandardMaterial({ color: 0xc2a3d9, roughness: 0.54, side: THREE.DoubleSide }),
    petalBlue: new THREE.MeshStandardMaterial({ color: 0x9bbce0, roughness: 0.54, side: THREE.DoubleSide }),
    petalWhite: new THREE.MeshStandardMaterial({ color: 0xfdfaf4, roughness: 0.48, side: THREE.DoubleSide }),

    // Warm Vintage Luminaires
    warmShade: new THREE.MeshStandardMaterial({
      color: 0xfbe9e4,
      emissive: new THREE.Color(0xffcca0),
      emissiveIntensity: 0.72,
      roughness: 0.72,
      side: THREE.DoubleSide,
    }),
    opalGlow: new THREE.MeshStandardMaterial({
      color: 0xfff8ee,
      emissive: new THREE.Color(0xffd699),
      emissiveIntensity: 1.05,
      roughness: 0.22,
    }),
    emberGlow: new THREE.MeshStandardMaterial({
      color: 0x4a1608,
      emissive: new THREE.Color(0xff5e14),
      emissiveIntensity: 1.85,
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

// Shared lightweight geometries for lush indoor botanicals
let _spiderBladeGeo = null;
let _ivyLeafGeo = null;
let _floretGeo = null;

function getBotanicalGeos() {
  if (!_spiderBladeGeo) {
    // Arching curved Chlorophytum ribbon blade (0 -> 0.42m arc)
    const segs = 9;
    const g = new THREE.PlaneGeometry(0.032, 0.44, 2, segs);
    g.translate(0, 0.22, 0);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const u = clamp(pos.getY(i) / 0.44, 0, 1);
      const taper = Math.sin(Math.pow(u, 0.65) * Math.PI);
      const vx = pos.getX(i) * (0.25 + 0.95 * taper);
      // Graceful fountain arch: rises first, then cascades outward & downward!
      const archY = Math.sin(u * Math.PI * 0.78) * 0.16 - u * u * 0.22;
      const archZ = u * 0.28 + u * u * 0.12;
      const vFold = Math.abs(pos.getX(i)) * 0.18;
      pos.setXYZ(i, vx, archY + vFold, archZ);
    }
    g.computeVertexNormals();
    _spiderBladeGeo = g;

    const lg = new THREE.PlaneGeometry(0.065, 0.075, 2, 2);
    const lp = lg.attributes.position;
    for (let i = 0; i < lp.count; i += 1) {
      const ny = clamp((lp.getY(i) + 0.0375) / 0.075, 0, 1);
      lp.setX(i, lp.getX(i) * Math.sin(Math.pow(ny, 0.6) * Math.PI));
      lp.setZ(i, Math.sin(ny * Math.PI) * 0.012);
    }
    lg.computeVertexNormals();
    _ivyLeafGeo = lg;

    _floretGeo = new THREE.DodecahedronGeometry(0.036, 0);
    _floretGeo.scale(1.0, 0.72, 1.0);
  }
  return { spiderBladeGeo: _spiderBladeGeo, ivyLeafGeo: _ivyLeafGeo, floretGeo: _floretGeo };
}

// Sculpted Hanging Variegated Spider Plant (金边垂吊吊兰 Chlorophytum comosum + 匍匐茎小吊兰株与小白花)
function addHangingSpiderPlant(parent, mats, animList, x, ceilingY, z, { drop = 0.72, scale = 1.0, rosePot = false } = {}) {
  const { spiderBladeGeo, floretGeo } = getBotanicalGeos();
  const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.03, 10), mats.brass);
  hook.position.set(x, ceilingY - 0.015, z);
  parent.add(hook);

  const pivot = new THREE.Group();
  pivot.position.set(x, ceilingY - 0.02, z);
  parent.add(pivot);

  const potY = -drop;
  // 3 woven macrame / antique brass suspension cords
  for (let c = 0; c < 3; c += 1) {
    const a = (c / 3) * Math.PI * 2;
    const rx = Math.cos(a) * 0.115 * scale;
    const rz = Math.sin(a) * 0.115 * scale;
    const cordLen = Math.hypot(rx, drop, rz);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, cordLen, 6), mats.macrameCord);
    cord.position.set(rx * 0.5, -drop * 0.5, rz * 0.5);
    cord.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(-rx, drop, -rz).normalize()
    );
    pivot.add(cord);
  }

  const basket = new THREE.Group();
  basket.position.set(0, potY, 0);
  basket.scale.setScalar(scale);
  pivot.add(basket);

  const potMat = rosePot ? mats.retroRosePorcelain : mats.celadonGlaze;
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.088, 0.16, 14), potMat);
  basket.add(pot);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.012, 8, 18), mats.brass);
  rim.rotation.x = Math.PI * 0.5;
  rim.position.y = 0.078;
  basket.add(rim);
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.12, 8), mats.macrameCord);
  tassel.rotation.x = Math.PI;
  tassel.position.y = -0.13;
  basket.add(tassel);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.12, 0.02, 12), mats.soilDark);
  soil.position.y = 0.072;
  basket.add(soil);

  // 26 arching variegated green-and-cream ribbon blades in 3 lush tiers
  const rng = mulberry32(Math.round((x * 37 + z * 83) * 100));
  for (let i = 0; i < 26; i += 1) {
    const tier = i < 8 ? 0 : i < 18 ? 1 : 2;
    const blade = new THREE.Mesh(spiderBladeGeo, mats.spiderLeaf);
    blade.userData.noCastShadow = true;
    const az = (i / 26) * Math.PI * 2 + (rng() - 0.5) * 0.28;
    const rad = 0.02 + tier * 0.026;
    blade.position.set(Math.cos(az) * rad, 0.075, Math.sin(az) * rad);
    blade.rotation.y = az;
    blade.rotation.x = -0.36 + tier * 0.34 + (rng() - 0.5) * 0.12;
    const s = (0.72 + tier * 0.22) * (0.88 + rng() * 0.24);
    blade.scale.set(s, s, s);
    basket.add(blade);
  }

  // 4 cascading stolon runners (下垂匍匐花茎) with baby spiderettes (小吊兰株) & starry white flowers!
  for (let st = 0; st < 4; st += 1) {
    const sa = st * 1.57 + 0.35 + rng() * 0.35;
    const runnerLen = 0.34 + (st % 2) * 0.14;
    const outR = 0.19 + (st % 2) * 0.05;
    const endX = Math.cos(sa) * outR;
    const endZ = Math.sin(sa) * outR;
    const endY = -runnerLen;
    const stemVec = new THREE.Vector3(endX, endY - 0.05, endZ);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0035, 0.0025, stemVec.length(), 5),
      mats.foliageLush
    );
    stem.userData.noCastShadow = true;
    stem.position.set(endX * 0.5, (0.05 + endY) * 0.5, endZ * 0.5);
    stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), stemVec.clone().normalize());
    basket.add(stem);

    // Baby spiderette plantlet tuft at runner tip
    const baby = new THREE.Group();
    baby.position.set(endX, endY, endZ);
    for (let b = 0; b < 7; b += 1) {
      const bl = new THREE.Mesh(spiderBladeGeo, mats.spiderLeaf);
      bl.userData.noCastShadow = true;
      bl.rotation.y = (b / 7) * Math.PI * 2;
      bl.rotation.x = -0.15 + (b % 2) * 0.28;
      bl.scale.setScalar(0.36);
      baby.add(bl);
    }
    // Tiny starry white Chlorophytum blossom
    const star = new THREE.Mesh(floretGeo, mats.petalWhite);
    star.scale.setScalar(0.55);
    star.position.set(0, 0.03, 0);
    baby.add(star);
    basket.add(baby);
  }

  animList.push({ mesh: pivot, phase: x * 0.37 + z * 0.51 });
  return pivot;
}

// Cascading Shelf / Mantel Trailing Ivy Vine (垂挂常春藤绿植)
function addTrailingVine(parent, mats, x, y, z, width = 0.7, strands = 5, facingZ = 1) {
  const { ivyLeafGeo } = getBotanicalGeos();
  const rng = mulberry32(Math.round((x * 53 + y * 19 + z * 71) * 100));
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  for (let s = 0; s < strands; s += 1) {
    const sx = (s / Math.max(1, strands - 1) - 0.5) * width;
    const len = 0.28 + rng() * 0.36;
    const nodes = Math.floor(len / 0.055);
    for (let n = 0; n < nodes; n += 1) {
      const ny = -n * 0.055;
      const swayX = sx + Math.sin(n * 0.9 + s) * 0.024;
      const lf = new THREE.Mesh(ivyLeafGeo, mats.foliageIvy);
      lf.userData.noCastShadow = true;
      lf.position.set(swayX, ny, facingZ * (0.02 + n * 0.008));
      lf.rotation.set(0.35 * facingZ, (rng() - 0.5) * 0.9, (n % 2 === 0 ? 1 : -1) * 0.38);
      grp.add(lf);
    }
  }
  parent.add(grp);
  return grp;
}

// Lush Indoor Potted Flower Planter (supports Hydrangea / Orchid / Rose / GLB Bush & Fern tags!)
function addFloweringPlanter(
  parent,
  mats,
  x,
  y,
  z,
  {
    potStyle = "celadon",
    flowerType = "hydrangeaPink",
    scale = 1.0,
    glbTag = null,
  } = {}
) {
  const { ivyLeafGeo, floretGeo } = getBotanicalGeos();
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.scale.setScalar(scale);

  const potMat =
    potStyle === "rose"
      ? mats.retroRosePorcelain
      : potStyle === "ivory"
        ? mats.zelligeTile
        : potStyle === "terracotta"
          ? mats.terracottaPot
          : mats.celadonGlaze;

  const potH = 0.26;
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.108, potH, 14), potMat);
  pot.position.y = potH * 0.5;
  g.add(pot);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.156, 0.014, 8, 18), potMat);
  lip.rotation.x = Math.PI * 0.5;
  lip.position.y = potH - 0.01;
  g.add(lip);
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.12, 0.024, 14), mats.brass);
  saucer.position.y = 0.012;
  g.add(saucer);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.14, 0.02, 12), mats.soilDark);
  soil.position.y = potH - 0.015;
  g.add(soil);

  const rng = mulberry32(Math.round((x * 41 + z * 67 + y * 13) * 100));
  // Base lush leaf collar
  for (let l = 0; l < 12; l += 1) {
    const a = (l / 12) * Math.PI * 2 + rng() * 0.2;
    const lf = new THREE.Mesh(ivyLeafGeo, mats.foliageLush);
    lf.scale.setScalar(1.65);
    lf.position.set(Math.cos(a) * 0.12, potH + 0.04, Math.sin(a) * 0.12);
    lf.rotation.set(-0.55, a, 0.15);
    g.add(lf);
  }

  if (glbTag) {
    const anchor = new THREE.Group();
    anchor.position.y = potH - 0.01;
    anchor.userData[glbTag] = true;
    g.add(anchor);
  }

  if (flowerType.startsWith("hydrangea")) {
    const pMat =
      flowerType === "hydrangeaLilac"
        ? mats.petalLilac
        : flowerType === "hydrangeaBlue"
          ? mats.petalBlue
          : flowerType === "hydrangeaBlush"
            ? mats.petalBlush
            : mats.petalPink;
    const heads = [
      [0, potH + 0.20, 0, 1.0],
      [-0.085, potH + 0.15, 0.055, 0.85],
      [0.085, potH + 0.16, 0.045, 0.88],
      [0.01, potH + 0.15, -0.085, 0.84],
    ];
    for (const [hx, hy, hz, hs] of heads) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, hy - potH + 0.02, 5), mats.foliageLush);
      stem.position.set(hx * 0.6, (potH + hy) * 0.5, hz * 0.6);
      g.add(stem);
      for (let f = 0; f < 11; f += 1) {
        const phi = Math.acos(1 - (2 * (f + 0.5)) / 11) * 0.68;
        const th = f * 2.39996;
        const r = 0.068 * hs;
        const fl = new THREE.Mesh(floretGeo, f % 4 === 0 ? mats.petalWhite : pMat);
        fl.userData.noCastShadow = true;
        fl.position.set(
          hx + Math.sin(phi) * Math.cos(th) * r,
          hy + Math.cos(phi) * r * 0.78,
          hz + Math.sin(phi) * Math.sin(th) * r
        );
        fl.rotation.set(rng() * 2, rng() * 2, 0);
        g.add(fl);
      }
    }
  } else if (flowerType === "orchid") {
    for (const side of [-1, 1]) {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.42, 6), mats.foliageLush);
      stalk.position.set(side * 0.03, potH + 0.20, 0);
      stalk.rotation.z = -side * 0.18;
      g.add(stalk);
      for (let b = 0; b < 5; b += 1) {
        const fl = new THREE.Mesh(floretGeo, b % 2 === 0 ? mats.petalWhite : mats.petalBlush);
        fl.scale.set(1.25, 0.45, 1.15);
        fl.position.set(side * (0.04 + b * 0.018), potH + 0.22 + b * 0.048, 0.025 + (b % 2) * 0.018);
        g.add(fl);
      }
    }
  }

  parent.add(g);
  return g;
}

// 3-Tier Vintage Scrolled Wrought-Iron & Brass Flower Stand (复古铁艺三层繁花架)
function addVintagePlantStand(parent, mats, x, y, z, ry = 0) {
  const st = new THREE.Group();
  st.position.set(x, y, z);
  st.rotation.y = ry;

  for (const [lx, lz] of [[-0.26, -0.18], [0.26, -0.18], [-0.26, 0.18], [0.26, 0.18]]) {
    addBox(st, 0.024, 0.92, 0.024, mats.wroughtIron, lx, 0.46, lz);
  }
  const tiers = [
    [0, 0.22, 0.12, "rose", "hydrangeaPink", "isIndoorGLBPeriwinklePot"],
    [-0.14, 0.56, -0.04, "celadon", "hydrangeaLilac", "isIndoorGLBFernPot"],
    [0.14, 0.88, -0.06, "ivory", "orchid", "isIndoorGLBMargaritaPot"],
  ];
  for (const [tx, ty, tz, pStyle, fType, tag] of tiers) {
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.18, 0.022, 16), mats.brass);
    tray.position.set(tx, ty, tz);
    st.add(tray);
    addFloweringPlanter(st, mats, tx, ty + 0.012, tz, {
      potStyle: pStyle,
      flowerType: fType,
      scale: 0.78,
      glbTag: tag,
    });
  }
  parent.add(st);
  return st;
}

function addRoseArrangement(parent, mats, x, y, z, scale = 1.0, roseVase = false) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.scale.setScalar(scale);

  const vase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.068, 0.088, 0.21, 14),
    roseVase ? mats.retroRosePorcelain : mats.celadonGlaze
  );
  vase.position.y = 0.105;
  g.add(vase);
  const goldRim = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.007, 6, 16), mats.brass);
  goldRim.rotation.x = Math.PI * 0.5;
  goldRim.position.y = 0.208;
  g.add(goldRim);

  const bouquet = createRoseBouquet({ count: 7, scale: 0.9 });
  bouquet.position.y = 0.04;
  g.add(bouquet);
  g.userData.isHeroRoseVase = true;

  parent.add(g);
  return g;
}

// Multi-Arm Antique Brass & Rose-Crystal Candle Chandelier (法式复古黄铜粉晶枝形吊灯)
function addCrystalBrassChandelier(parent, mats, x, ceilingY, z, arms = 6, drop = 0.92) {
  const ch = new THREE.Group();
  ch.position.set(x, ceilingY, z);

  // Carved plaster ceiling medallion rose
  const med = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.035, 22), mats.creamMolding);
  med.position.y = -0.02;
  ch.add(med);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, drop, 8), mats.brass);
  chain.position.y = -drop * 0.5;
  ch.add(chain);

  const hubY = -drop;
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), mats.brass);
  hub.position.y = hubY;
  ch.add(hub);
  const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), mats.roseCrystal);
  finial.position.y = hubY - 0.15;
  ch.add(finial);

  for (let i = 0; i < arms; i += 1) {
    const a = (i / arms) * Math.PI * 2;
    const r = 0.38;
    const ax = Math.cos(a) * r;
    const az = Math.sin(a) * r;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, r, 6), mats.brass);
    arm.position.set(ax * 0.5, hubY - 0.02, az * 0.5);
    arm.rotation.z = Math.PI * 0.44;
    arm.rotation.y = -a;
    ch.add(arm);

    const bobeche = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.032, 0.025, 12), mats.roseCrystal);
    bobeche.position.set(ax, hubY + 0.03, az);
    ch.add(bobeche);
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.11, 8), mats.ivoryLinen);
    candle.position.set(ax, hubY + 0.095, az);
    ch.add(candle);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), mats.opalGlow);
    flame.scale.set(0.75, 1.35, 0.75);
    flame.position.set(ax, hubY + 0.165, az);
    flame.userData.noShadow = true;
    ch.add(flame);
    const dropGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.032, 0), mats.roseCrystal);
    dropGem.scale.set(0.7, 1.4, 0.7);
    dropGem.position.set(ax * 0.86, hubY - 0.055, az * 0.86);
    ch.add(dropGem);
  }
  parent.add(ch);
  return ch;
}

function createPleatedCurtain(mat, width, height) {
  const segsX = 16;
  const geom = new THREE.PlaneGeometry(width, height, segsX, 6);
  geom.translate(0, -height * 0.5, 0);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const dropFactor = clamp(-py / height, 0, 1);
    const pleat = Math.sin((px / width) * Math.PI * 8.0) * (0.03 + 0.02 * dropFactor);
    pos.setZ(i, pleat);
  }
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, mat);
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

// Builds Vintage Boiserie Wainscoting + Damask Wallpaper + Crown Cornice along an interior wall segment
function addInteriorVintageWallFace(
  parent,
  mats,
  axis,
  u0,
  u1,
  fixedCoord,
  normalSign,
  baseY,
  topY,
  { theme = "sage", skipBoiserie = false } = {}
) {
  const span = u1 - u0;
  if (span <= 0.15) return;
  const midU = (u0 + u1) * 0.5;
  const h = topY - baseY;
  const wainscotH = Math.min(1.18, h * 0.36);
  const upperH = h - wainscotH - 0.08;
  const boiserieMat = theme === "rose" ? mats.boiserieRose : mats.boiserieSage;
  const panelMat = theme === "rose" ? mats.boiserieRoseDeep : mats.boiserieSageDeep;
  const paperMat =
    theme === "rose"
      ? mats.wallpaperMaster
      : theme === "study"
        ? mats.wallpaperStudy
        : mats.wallpaperSalon;

  const off1 = fixedCoord + normalSign * 0.126;
  const off2 = fixedCoord + normalSign * 0.136;

  if (axis === "x") {
    if (!skipBoiserie) {
      addBox(parent, span, wainscotH, 0.018, boiserieMat, midU, baseY + wainscotH * 0.5, off1);
      addBox(parent, span, 0.055, 0.032, mats.creamMolding, midU, baseY + wainscotH + 0.01, off2);
      addBox(parent, span, 0.014, 0.036, mats.brass, midU, baseY + wainscotH + 0.032, off2);
      const bays = Math.max(1, Math.floor(span / 0.95));
      for (let b = 0; b < bays; b += 1) {
        const bx = u0 + ((b + 0.5) * span) / bays;
        const bw = Math.max(0.28, span / bays - 0.18);
        addBox(parent, bw, wainscotH - 0.26, 0.016, panelMat, bx, baseY + wainscotH * 0.5 + 0.02, off2);
      }
    }
    if (upperH > 0.12) {
      const uy = skipBoiserie ? baseY + (h - 0.08) * 0.5 : baseY + wainscotH + upperH * 0.5 + 0.02;
      const uh = skipBoiserie ? h - 0.08 : upperH;
      addBox(parent, span, uh, 0.012, paperMat, midU, uy, off1);
    }
    addBox(parent, span, 0.085, 0.038, mats.creamMolding, midU, topY - 0.045, off2);
  } else {
    if (!skipBoiserie) {
      addBox(parent, 0.018, wainscotH, span, boiserieMat, off1, baseY + wainscotH * 0.5, midU);
      addBox(parent, 0.032, 0.055, span, mats.creamMolding, off2, baseY + wainscotH + 0.01, midU);
      addBox(parent, 0.036, 0.014, span, mats.brass, off2, baseY + wainscotH + 0.032, midU);
      const bays = Math.max(1, Math.floor(span / 0.95));
      for (let b = 0; b < bays; b += 1) {
        const bz = u0 + ((b + 0.5) * span) / bays;
        const bw = Math.max(0.28, span / bays - 0.18);
        addBox(parent, 0.016, wainscotH - 0.26, bw, panelMat, off2, baseY + wainscotH * 0.5 + 0.02, bz);
      }
    }
    if (upperH > 0.12) {
      const uy = skipBoiserie ? baseY + (h - 0.08) * 0.5 : baseY + wainscotH + upperH * 0.5 + 0.02;
      const uh = skipBoiserie ? h - 0.08 : upperH;
      addBox(parent, 0.012, uh, span, paperMat, off1, uy, midU);
    }
    addBox(parent, 0.038, 0.085, span, mats.creamMolding, off2, topY - 0.045, midU);
  }
}

function makeDoorLeaf(mats, width, height, glazed, hingeSign, paintMat = null) {
  const frameMat = paintMat || mats.boiserieSage;
  const pivot = new THREE.Group();
  const cx = hingeSign * width * 0.5;
  if (glazed) {
    addBox(pivot, width, 0.56, 0.05, frameMat, cx, 0.28, 0);
    addBox(pivot, width, 0.12, 0.05, frameMat, cx, height - 0.06, 0);
    addBox(pivot, 0.11, height - 0.68, 0.05, frameMat, hingeSign * 0.055, 0.56 + (height - 0.68) * 0.5, 0);
    addBox(pivot, 0.11, height - 0.68, 0.05, frameMat, hingeSign * (width - 0.055), 0.56 + (height - 0.68) * 0.5, 0);
    const paneH = height - 0.68;
    const pane = new THREE.Mesh(new THREE.BoxGeometry(width - 0.2, paneH, 0.016), mats.glass);
    pane.userData.noShadow = true;
    pane.position.set(cx, 0.56 + paneH * 0.5, 0);
    pivot.add(pane);
    for (let r = 1; r <= 2; r += 1) {
      addBox(pivot, width - 0.18, 0.028, 0.054, frameMat, cx, 0.56 + (paneH * r) / 3, 0);
    }
  } else {
    addBox(pivot, width, height, 0.048, frameMat, cx, height * 0.5, 0);
    addBox(pivot, width - 0.22, height * 0.36, 0.062, mats.creamMolding, cx, height * 0.26, 0);
    addBox(pivot, width - 0.22, height * 0.42, 0.062, mats.creamMolding, cx, height * 0.71, 0);
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
  const uScale = 0.095;
  const vScale = 0.15;
  const uMid = baseW * 0.5 * uScale;
  const uTopHalf = topW * 0.5 * uScale;

  const positions = new Float32Array([...pBL, ...pBR, ...pTR, ...pBL, ...pTR, ...pTL]);
  const uvs = new Float32Array([
    0, 0, baseW * uScale, 0, uMid + uTopHalf, slopeH * vScale,
    0, 0, uMid + uTopHalf, slopeH * vScale, uMid - uTopHalf, slopeH * vScale,
  ]);
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  parent.add(new THREE.Mesh(geom, mat));
}

function addRoofTriangle(parent, mat, pA, pB, pApex) {
  const geom = new THREE.BufferGeometry();
  const baseW = Math.hypot(pB[0] - pA[0], pB[2] - pA[2]);
  const midB = [(pA[0] + pB[0]) * 0.5, (pA[1] + pB[1]) * 0.5, (pA[2] + pB[2]) * 0.5];
  const h = Math.hypot(pApex[0] - midB[0], pApex[1] - midB[1], pApex[2] - midB[2]);
  const positions = new Float32Array([...pA, ...pB, ...pApex]);
  const uvs = new Float32Array([0, 0, baseW * 0.1, 0, baseW * 0.05, h * 0.14]);
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  parent.add(new THREE.Mesh(geom, mat));
}

function addHipCapBeam(parent, mat, a, b, radius = 0.085) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 10), mat);
  cyl.position.copy(mid);
  cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  parent.add(cyl);
}

// Wrought-Iron & Carved Stone Balustrade Run (1F or 2F terraces/balconies)
function addWroughtBalustrade(parent, mats, axis, u0, u1, fixedPos, baseY, yColMin, yColMax) {
  const len = u1 - u0;
  if (len <= 0.12) return;
  const midU = (u0 + u1) * 0.5;
  const count = Math.max(2, Math.floor(len / 0.24));
  if (axis === "x") {
    addBox(parent, len, 0.055, 0.085, mats.copingStone, midU, baseY + 0.92, fixedPos);
    addBox(parent, len, 0.08, 0.11, mats.copingStone, midU, baseY + 0.06, fixedPos);
    for (let i = 0; i <= count; i += 1) {
      const bx = lerp(u0 + 0.05, u1 - 0.05, i / count);
      addBox(parent, 0.022, 0.80, 0.022, mats.wroughtIron, bx, baseY + 0.49, fixedPos);
      if (i % 3 === 1) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.008, 6, 12), mats.brass);
        ring.position.set(bx, baseY + 0.50, fixedPos);
        parent.add(ring);
      }
    }
    registerBoxCollider(u0, u1, fixedPos - 0.08, fixedPos + 0.08, yColMin, yColMax);
  } else {
    addBox(parent, 0.085, 0.055, len, mats.copingStone, fixedPos, baseY + 0.92, midU);
    addBox(parent, 0.11, 0.08, len, mats.copingStone, fixedPos, baseY + 0.06, midU);
    for (let i = 0; i <= count; i += 1) {
      const bz = lerp(u0 + 0.05, u1 - 0.05, i / count);
      addBox(parent, 0.022, 0.80, 0.022, mats.wroughtIron, fixedPos, baseY + 0.49, bz);
      if (i % 3 === 1) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.008, 6, 12), mats.brass);
        ring.rotation.y = Math.PI * 0.5;
        ring.position.set(fixedPos, baseY + 0.50, bz);
        parent.add(ring);
      }
    }
    registerBoxCollider(fixedPos - 0.08, fixedPos + 0.08, u0, u1, yColMin, yColMax);
  }
}

function addQuoinColumn(parent, mats, x, z, y0, y1) {
  const stones = Math.floor((y1 - y0) / 0.38);
  for (let i = 0; i < stones; i += 1) {
    const sy = y0 + (i + 0.5) * 0.38;
    const w = i % 2 === 0 ? 0.38 : 0.28;
    const d = i % 2 === 0 ? 0.28 : 0.38;
    addBox(parent, w, 0.34, d, mats.copingStone, x, sy, z);
  }
}

function buildPlinthTerracesAndWalkZones(group, mats) {
  // Raised Ashlar Limestone Plinth: X in [-25.2, -2.8] (22.4m), Z in [-10.6, +6.6] (17.2m)
  addBox(group, 22.4, 0.75, 17.2, mats.limestone, -14.0, 2.175, -2.0);
  addBox(group, 22.56, 0.07, 0.16, mats.copingStone, -14.0, 2.565, 6.56);
  addBox(group, 22.56, 0.07, 0.16, mats.copingStone, -14.0, 2.565, -10.56);
  addBox(group, 0.16, 0.07, 17.2, mats.copingStone, -25.16, 2.565, -2.0);
  addBox(group, 0.16, 0.07, 17.2, mats.copingStone, -2.84, 2.565, -2.0);

  // Exterior Wrap-Around Veranda & SE Sunlit Garden Courtyard Deck (top Y = +2.60m)
  addBox(group, 22.2, 0.05, 2.52, mats.cedarDeck, -14.0, 2.575, 5.26);
  addBox(group, 22.2, 0.05, 0.72, mats.cedarDeck, -14.0, 2.575, -10.16);
  addBox(group, 1.72, 0.05, 13.8, mats.cedarDeck, -24.26, 2.575, -2.9);
  // SE Sunlit French Garden Courtyard Pavers: X in [-10.4, -2.9], Z in [-1.4, +6.5]
  addBox(group, 7.45, 0.052, 7.85, mats.copingStone, -6.68, 2.574, 2.52);

  // 1F L-Shaped Interior Herringbone Parquet Floor (Y = +2.60m)
  addBox(group, 13.0, 0.054, 13.8, mats.parquetFloor, -16.9, 2.575, -2.9);
  addBox(group, 6.4, 0.054, 8.4, mats.parquetFloor, -7.2, 2.575, -5.6);

  // 3 Limestone Garden Stairways (South -14.0, West -25.2, East -2.8)
  for (let i = 0; i < 4; i += 1) {
    const topY = 2.60 - (i + 0.5) * 0.095;
    const h = topY - 1.95;
    const cz = 6.6 + (i + 0.5) * 0.55;
    addBox(group, 4.4, h, 0.57, mats.limestone, -14.0, 1.95 + h * 0.5, cz);
    addBox(group, 4.46, 0.035, 0.59, mats.copingStone, -14.0, topY, cz);
  }
  addBox(group, 0.18, 0.58, 2.24, mats.limestone, -16.3, 2.38, 7.72);
  addBox(group, 0.18, 0.58, 2.24, mats.limestone, -11.7, 2.38, 7.72);

  for (let i = 0; i < 4; i += 1) {
    const topY = 2.60 - (i + 0.5) * 0.095;
    const h = topY - 1.95;
    const cx = -25.2 - (i + 0.5) * 0.55;
    addBox(group, 0.57, h, 2.4, mats.limestone, cx, 1.95 + h * 0.5, 1.1);
    addBox(group, 0.59, 0.035, 2.46, mats.copingStone, cx, topY, 1.1);
  }
  for (let i = 0; i < 4; i += 1) {
    const topY = 2.60 - (i + 0.5) * 0.095;
    const h = topY - 1.95;
    const cx = -2.8 + (i + 0.5) * 0.55;
    addBox(group, 0.57, h, 2.2, mats.limestone, cx, 1.95 + h * 0.5, 0.9);
    addBox(group, 0.59, 0.035, 2.26, mats.copingStone, cx, topY, 0.9);
  }

  // Multi-Level Walk Zone Registry (1F at Y=2.60m + Indoor Staircase Ramp + 2F Master & Terraces at Y=6.12m)
  registerWalkZone((x, z, refY) => {
    // Indoor Walnut Staircase Lane: X in [-23.1, -20.1], Z in [-9.3, -3.2]
    if (x >= -23.1 && x <= -20.1 && z >= -9.3 && z <= -3.2) {
      const stairT = clamp((-3.2 - z) / 5.8, 0, 1);
      const stairY = lerp(2.60, 6.12, stairT);
      if (typeof refY !== "number" || Math.abs(refY - stairY) < 2.2) {
        return stairY;
      }
    }

    const candidates = [];
    // 1F Plinth, Courtyard & L-Shaped Interior
    if (x >= -25.25 && x <= -2.75 && z >= -10.65 && z <= 6.65) {
      candidates.push(2.60);
    }
    // 2F Master Suite + South Juliet Balcony + East Rooftop Flower Terrace (Y = 6.12m)
    const in2FMaster = x >= -23.35 && x <= -11.15 && z >= -9.75 && z <= 4.05;
    const in2FJuliet = x >= -17.15 && x <= -10.85 && z > 4.0 && z <= 6.35;
    const in2FEastTerrace = x > -11.15 && x <= -4.05 && z >= -9.75 && z <= -1.45;
    if (in2FMaster || in2FJuliet || in2FEastTerrace) {
      candidates.push(6.12);
    }
    if (candidates.length > 0) {
      return typeof refY === "number" ? candidates : 2.60;
    }

    // 3 Exterior Garden Stairways
    if (x >= -16.25 && x <= -11.75 && z > 6.65 && z <= 8.85) {
      return lerp(2.60, 2.20, clamp((z - 6.65) / 2.2, 0, 1));
    }
    if (x >= -27.45 && x < -25.25 && z >= -0.15 && z <= 2.35) {
      return lerp(2.20, 2.60, clamp((x + 27.45) / 2.2, 0, 1));
    }
    if (x > -2.75 && x <= -0.55 && z >= -0.25 && z <= 2.05) {
      return lerp(2.60, 2.20, clamp((x + 2.75) / 2.2, 0, 1));
    }
    return null;
  });

  // 1F Perimeter Wrought-Iron & Stone Balustrades
  addWroughtBalustrade(group, mats, "x", -25.1, -16.28, 6.48, 2.60, 2.0, 5.0);
  addWroughtBalustrade(group, mats, "x", -11.72, -2.9, 6.48, 2.60, 2.0, 5.0);
  addWroughtBalustrade(group, mats, "x", -25.1, -2.9, -10.48, 2.60, 2.0, 5.0);
  addWroughtBalustrade(group, mats, "z", -10.48, -0.18, -25.1, 2.60, 2.0, 5.0);
  addWroughtBalustrade(group, mats, "z", 2.38, 6.48, -25.1, 2.60, 2.0, 5.0);
  addWroughtBalustrade(group, mats, "z", -10.48, -0.28, -2.9, 2.60, 2.0, 5.0);
  addWroughtBalustrade(group, mats, "z", 2.08, 6.48, -2.9, 2.60, 2.0, 5.0);

  // SE Sunlit French Courtyard Rose-and-Wisteria Pergola & Afternoon Tea Lounge
  const pergPosts = [
    [-9.6, 5.8], [-5.2, 5.8], [-9.6, 1.8], [-5.2, 1.8],
  ];
  for (const [px, pz] of pergPosts) {
    addBox(group, 0.24, 0.30, 0.24, mats.copingStone, px, 2.75, pz);
    addBox(group, 0.14, 3.05, 0.14, mats.cedarBeam, px, 4.28, pz);
    registerCircleCollider(px, pz, 0.16, 2.0, 5.0);
  }
  addBox(group, 4.9, 0.12, 0.14, mats.cedarBeam, -7.4, 5.82, 5.8);
  addBox(group, 4.9, 0.12, 0.14, mats.cedarBeam, -7.4, 5.82, 1.8);
  for (let rx = -9.4; rx <= -5.4; rx += 0.58) {
    addBox(group, 0.07, 0.09, 4.5, mats.cedarDeck, rx, 5.92, 3.8);
  }
  for (const [wx, wz] of [[-8.6, 5.75], [-6.2, 5.75], [-7.4, 3.8]]) {
    const wAnchor = new THREE.Group();
    wAnchor.position.set(wx, 5.86, wz);
    wAnchor.userData.isIndoorGLBWisteria = true;
    group.add(wAnchor);
  }
  // Courtyard Bistro Table & Dusty-Rose Cushioned Chairs
  const cTop = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 20), mats.marble);
  cTop.position.set(-7.4, 3.34, 3.8);
  group.add(cTop);
  const cPed = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.20, 0.72, 12), mats.wroughtIron);
  cPed.position.set(-7.4, 2.96, 3.8);
  group.add(cPed);
  addRoseArrangement(group, mats, -7.4, 3.36, 3.8, 0.85, true);
  for (const [cx, ry] of [[-8.25, 1.35], [-6.55, -1.35]]) {
    const ch = new THREE.Group();
    ch.position.set(cx, 2.60, 3.8);
    ch.rotation.y = ry;
    addBox(ch, 0.56, 0.06, 0.54, mats.dustyRoseVelvet, 0, 0.46, 0);
    addBox(ch, 0.54, 0.48, 0.05, mats.wroughtIron, 0, 0.72, -0.25);
    for (const [lx, lz] of [[-0.22, -0.21], [0.22, -0.21], [-0.22, 0.21], [0.22, 0.21]]) {
      addBox(ch, 0.03, 0.44, 0.03, mats.wroughtIron, lx, 0.22, lz);
    }
    group.add(ch);
  }
  registerBoxCollider(-8.6, -6.2, 3.3, 4.3, 2.0, 5.0);
  addFloweringPlanter(group, mats, -9.4, 2.60, 5.3, { potStyle: "terracotta", flowerType: "hydrangeaPink", scale: 1.25, glbTag: "isIndoorGLBRosePot" });
  addFloweringPlanter(group, mats, -5.4, 2.60, 5.3, { potStyle: "celadon", flowerType: "hydrangeaBlue", scale: 1.25, glbTag: "isIndoorGLBMargaritaPot" });
}

function buildTwoStoryPetiteVillaShell(group, mats, curtainAnimList, hangingPlantAnimList) {
  const y1Base = 2.60;
  const y1Top = 6.00;
  const h1 = y1Top - y1Base;
  const mid1 = (y1Base + y1Top) * 0.5;

  const y2Base = 6.12;
  const y2Top = 9.40;
  const h2 = y2Top - y2Base;
  const mid2 = (y2Base + y2Top) * 0.5;

  // Helper: French Mullioned Window + Exterior Vintage Sage Louvered Shutters + Flower Window Box + Layered Vintage Rose/Sheer Drapes
  const addVillaWindow = (
    axis,
    u0,
    u1,
    fixedPos,
    interiorSign,
    floorBase,
    floorTop,
    { bays = 3, theme = "sage", shutters = true, flowerBox = true } = {}
  ) => {
    const span = u1 - u0;
    const midU = (u0 + u1) * 0.5;
    const sillY = floorBase + 0.76;
    const headY = floorTop - 0.52;
    const sillH = sillY - floorBase;
    const headH = floorTop - headY;
    const winH = headY - sillY;
    const winMidY = (sillY + headY) * 0.5;
    const extSign = -interiorSign;

    if (axis === "x") {
      addBox(group, span, sillH, 0.24, mats.extPlaster, midU, floorBase + sillH * 0.5, fixedPos);
      addBox(group, span, headH, 0.24, mats.extPlaster, midU, headY + headH * 0.5, fixedPos);
      addInteriorVintageWallFace(group, mats, "x", u0, u1, fixedPos, interiorSign, floorBase, sillY, { theme });
      addBox(group, span + 0.22, 0.08, 0.36, mats.copingStone, midU, sillY - 0.02, fixedPos);
      addBox(group, span + 0.24, 0.12, 0.32, mats.copingStone, midU, headY + 0.05, fixedPos);
      // Keystone
      addBox(group, 0.18, 0.18, 0.36, mats.copingStone, midU, headY + 0.08, fixedPos);

      const pane = new THREE.Mesh(new THREE.BoxGeometry(span - 0.08, winH - 0.08, 0.02), mats.glass);
      pane.userData.noShadow = true;
      pane.position.set(midU, winMidY, fixedPos);
      group.add(pane);
      for (let b = 0; b <= bays; b += 1) {
        const mx = lerp(u0 + 0.03, u1 - 0.03, b / bays);
        addBox(group, 0.048, winH, 0.08, mats.creamMolding, mx, winMidY, fixedPos);
      }
      addBox(group, span, 0.042, 0.075, mats.creamMolding, midU, sillY + winH * 0.62, fixedPos);

      // Exterior Vintage Sage-Green Louvered Shutters
      if (shutters) {
        const sw = Math.min(0.46, span * 0.22);
        for (const side of [-1, 1]) {
          const sx = side < 0 ? u0 - sw * 0.5 - 0.04 : u1 + sw * 0.5 + 0.04;
          addBox(group, sw, winH, 0.042, mats.shutterSage, sx, winMidY, fixedPos + extSign * 0.14);
        }
      }
      // Exterior Wrought-Iron Blooming Rose Window Box
      if (flowerBox) {
        const bxZ = fixedPos + extSign * 0.24;
        addBox(group, span * 0.84, 0.18, 0.22, mats.wroughtIron, midU, sillY - 0.12, bxZ);
        addBox(group, span * 0.80, 0.14, 0.18, mats.terracottaPot, midU, sillY - 0.11, bxZ);
        for (const off of [-span * 0.24, 0, span * 0.24]) {
          addFloweringPlanter(group, mats, midU + off, sillY - 0.16, bxZ, {
            potStyle: "terracotta",
            flowerType: off === 0 ? "hydrangeaBlush" : "hydrangeaPink",
            scale: 0.62,
          });
        }
        addTrailingVine(group, mats, midU, sillY - 0.16, bxZ, span * 0.7, 5, extSign);
      }

      // Interior Vintage Dusty-Rose Drapes + Sheer Ivory Lace Under-Curtains
      const cz = fixedPos + interiorSign * 0.19;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, span + 0.52, 10), mats.brass);
      rod.rotation.z = Math.PI * 0.5;
      rod.position.set(midU, headY + 0.14, cz);
      group.add(rod);
      const dropH = headY + 0.12 - floorBase;
      for (const side of [-1, 1]) {
        const sheer = createPleatedCurtain(mats.sheerCurtain, 0.62, dropH);
        sheer.position.set(midU + side * (span * 0.5 - 0.28), headY + 0.13, cz);
        group.add(sheer);
        curtainAnimList.push({ mesh: sheer, phase: midU * 0.3 + side });

        const roseC = createPleatedCurtain(mats.roseDrape, 0.44, dropH);
        roseC.position.set(midU + side * (span * 0.5 + 0.02), headY + 0.135, cz + interiorSign * 0.03);
        group.add(roseC);
      }
    } else {
      addBox(group, 0.24, sillH, span, mats.extPlaster, fixedPos, floorBase + sillH * 0.5, midU);
      addBox(group, 0.24, headH, span, mats.extPlaster, fixedPos, headY + headH * 0.5, midU);
      addInteriorVintageWallFace(group, mats, "z", u0, u1, fixedPos, interiorSign, floorBase, sillY, { theme });
      addBox(group, 0.36, 0.08, span + 0.22, mats.copingStone, fixedPos, sillY - 0.02, midU);
      addBox(group, 0.32, 0.12, span + 0.24, mats.copingStone, fixedPos, headY + 0.05, midU);

      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.02, winH - 0.08, span - 0.08), mats.glass);
      pane.userData.noShadow = true;
      pane.position.set(fixedPos, winMidY, midU);
      group.add(pane);
      for (let b = 0; b <= bays; b += 1) {
        const mz = lerp(u0 + 0.03, u1 - 0.03, b / bays);
        addBox(group, 0.08, winH, 0.048, mats.creamMolding, fixedPos, winMidY, mz);
      }
      addBox(group, 0.075, 0.042, span, mats.creamMolding, fixedPos, sillY + winH * 0.62, midU);

      if (shutters) {
        const sw = Math.min(0.46, span * 0.22);
        for (const side of [-1, 1]) {
          const sz = side < 0 ? u0 - sw * 0.5 - 0.04 : u1 + sw * 0.5 + 0.04;
          addBox(group, 0.042, winH, sw, mats.shutterSage, fixedPos + extSign * 0.14, winMidY, sz);
        }
      }
      if (flowerBox) {
        const bxX = fixedPos + extSign * 0.24;
        addBox(group, 0.22, 0.18, span * 0.84, mats.wroughtIron, bxX, sillY - 0.12, midU);
        addBox(group, 0.18, 0.14, span * 0.80, mats.terracottaPot, bxX, sillY - 0.11, midU);
        for (const off of [-span * 0.22, span * 0.22]) {
          addFloweringPlanter(group, mats, bxX, sillY - 0.16, midU + off, {
            potStyle: "terracotta",
            flowerType: "hydrangeaPink",
            scale: 0.62,
          });
        }
      }

      const cx = fixedPos + interiorSign * 0.19;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, span + 0.52, 10), mats.brass);
      rod.rotation.x = Math.PI * 0.5;
      rod.position.set(cx, headY + 0.14, midU);
      group.add(rod);
      const dropH = headY + 0.12 - floorBase;
      for (const side of [-1, 1]) {
        const sheer = createPleatedCurtain(mats.sheerCurtain, 0.62, dropH);
        sheer.rotation.y = Math.PI * 0.5;
        sheer.position.set(cx, headY + 0.13, midU + side * (span * 0.5 - 0.28));
        group.add(sheer);
        curtainAnimList.push({ mesh: sheer, phase: midU * 0.3 + side });

        const roseC = createPleatedCurtain(mats.roseDrape, 0.44, dropH);
        roseC.rotation.y = Math.PI * 0.5;
        roseC.position.set(cx + interiorSign * 0.03, headY + 0.135, midU + side * (span * 0.5 + 0.02));
        group.add(roseC);
      }
    }
  };

  // =========================================================================
  // 1F EXTERIOR SHELL (L-Shaped: West+Central [-23.4..-10.4] x [-9.8..+4.0], NE Study [-10.4..-4.0] x [-9.8..-1.4])
  // =========================================================================

  // 1F South Wall (Z = +4.0, X in [-23.4, -10.4]): Salon Window [-21.6, -17.6], Main French Doors [-15.2, -12.8]
  addBox(group, 1.8, h1, 0.24, mats.extPlaster, -22.5, mid1, 4.0);
  addInteriorVintageWallFace(group, mats, "x", -23.3, -21.6, 4.0, -1, y1Base, y1Top, { theme: "sage" });
  addVillaWindow("x", -21.6, -17.6, 4.0, -1, y1Base, y1Top, { bays: 3, theme: "sage" });
  addBox(group, 2.4, h1, 0.24, mats.extPlaster, -16.4, mid1, 4.0);
  addInteriorVintageWallFace(group, mats, "x", -17.6, -15.2, 4.0, -1, y1Base, y1Top, { theme: "sage" });
  addBox(group, 2.4, y1Top - 5.25, 0.24, mats.extPlaster, -14.0, (y1Top + 5.25) * 0.5, 4.0);
  addBox(group, 2.58, 0.12, 0.32, mats.copingStone, -14.0, 5.26, 4.0);
  addBox(group, 2.4, h1, 0.24, mats.extPlaster, -11.6, mid1, 4.0);
  addInteriorVintageWallFace(group, mats, "x", -12.8, -10.5, 4.0, -1, y1Base, y1Top, { theme: "sage" });
  registerBoxCollider(-23.5, -15.2, 3.86, 4.14, 2.0, 5.2);
  registerBoxCollider(-12.8, -10.3, 3.86, 4.14, 2.0, 5.2);

  // Swung-open 1F South Vintage Sage-Green French Double Doors
  const s1DoorL = makeDoorLeaf(mats, 1.16, 2.64, true, 1, mats.boiserieSage);
  s1DoorL.position.set(-15.16, y1Base, 3.92);
  s1DoorL.rotation.y = 1.48;
  group.add(s1DoorL);
  const s1DoorR = makeDoorLeaf(mats, 1.16, 2.64, true, -1, mats.boiserieSage);
  s1DoorR.position.set(-12.84, y1Base, 3.92);
  s1DoorR.rotation.y = -1.48;
  group.add(s1DoorR);

  // 1F East Courtyard Wall (X = -10.4, Z in [-1.4, +4.0]): French Doorway [+0.2, +2.2] onto SE Garden Courtyard
  addBox(group, 0.24, h1, 1.6, mats.extPlaster, -10.4, mid1, -0.6);
  addInteriorVintageWallFace(group, mats, "z", -1.4, 0.2, -10.4, -1, y1Base, y1Top, { theme: "sage" });
  addBox(group, 0.24, y1Top - 5.22, 2.0, mats.extPlaster, -10.4, (y1Top + 5.22) * 0.5, 1.2);
  addBox(group, 0.32, 0.11, 2.16, mats.copingStone, -10.4, 5.23, 1.2);
  addBox(group, 0.24, h1, 1.8, mats.extPlaster, -10.4, mid1, 3.1);
  addInteriorVintageWallFace(group, mats, "z", 2.2, 3.9, -10.4, -1, y1Base, y1Top, { theme: "sage" });
  registerBoxCollider(-10.54, -10.26, -1.5, 0.2, 2.0, 5.2);
  registerBoxCollider(-10.54, -10.26, 2.2, 4.12, 2.0, 5.2);
  const cDoorL = makeDoorLeaf(mats, 0.96, 2.60, true, -1, mats.boiserieSage);
  cDoorL.position.set(-10.48, y1Base, 0.24);
  cDoorL.rotation.y = 0.14;
  group.add(cDoorL);
  const cDoorR = makeDoorLeaf(mats, 0.96, 2.60, true, -1, mats.boiserieSage);
  cDoorR.position.set(-10.48, y1Base, 2.16);
  cDoorR.rotation.y = -0.14;
  group.add(cDoorR);

  // 1F NE Conservatory Study South Wall (Z = -1.4, X in [-10.4, -4.0]): Sunlit Bay Window [-9.0, -5.2]
  addBox(group, 1.4, h1, 0.24, mats.extPlaster, -9.7, mid1, -1.4);
  addInteriorVintageWallFace(group, mats, "x", -10.3, -9.0, -1.4, -1, y1Base, y1Top, { theme: "study" });
  addVillaWindow("x", -9.0, -5.2, -1.4, -1, y1Base, y1Top, { bays: 3, theme: "study" });
  addBox(group, 1.2, h1, 0.24, mats.extPlaster, -4.6, mid1, -1.4);
  addInteriorVintageWallFace(group, mats, "x", -5.2, -4.1, -1.4, -1, y1Base, y1Top, { theme: "study" });
  registerBoxCollider(-10.45, -3.95, -1.54, -1.26, 2.0, 5.2);

  // 1F NE Conservatory Study East Wall (X = -4.0, Z in [-9.8, -1.4]): Harbor-View Window [-7.8, -3.6]
  addBox(group, 0.24, h1, 2.0, mats.extPlaster, -4.0, mid1, -8.8);
  addInteriorVintageWallFace(group, mats, "z", -9.7, -7.8, -4.0, -1, y1Base, y1Top, { theme: "study" });
  addVillaWindow("z", -7.8, -3.6, -4.0, -1, y1Base, y1Top, { bays: 3, theme: "study" });
  addBox(group, 0.24, h1, 2.2, mats.extPlaster, -4.0, mid1, -2.5);
  addInteriorVintageWallFace(group, mats, "z", -3.6, -1.5, -4.0, -1, y1Base, y1Top, { theme: "study" });
  registerBoxCollider(-4.14, -3.86, -9.9, -1.35, 2.0, 5.2);

  // 1F West Exterior Wall (X = -23.4, Z in [-9.8, +4.0]): Stair Window [-8.2, -5.0], West French Doorway [+0.1, +2.1]
  addBox(group, 0.24, h1, 1.6, mats.extPlaster, -23.4, mid1, -9.0);
  addVillaWindow("z", -8.2, -5.0, -23.4, 1, y1Base, y1Top, { bays: 2, theme: "sage" });
  addBox(group, 0.24, h1, 5.1, mats.extPlaster, -23.4, mid1, -2.45);
  addInteriorVintageWallFace(group, mats, "z", -5.0, 0.1, -23.4, 1, y1Base, y1Top, { theme: "sage" });
  addBox(group, 0.24, y1Top - 5.25, 2.0, mats.extPlaster, -23.4, (y1Top + 5.25) * 0.5, 1.1);
  addBox(group, 0.32, 0.11, 2.16, mats.copingStone, -23.4, 5.26, 1.1);
  addBox(group, 0.24, h1, 1.9, mats.extPlaster, -23.4, mid1, 3.05);
  addInteriorVintageWallFace(group, mats, "z", 2.1, 3.9, -23.4, 1, y1Base, y1Top, { theme: "sage" });
  registerBoxCollider(-23.54, -23.26, -9.9, 0.1, 2.0, 5.2);
  registerBoxCollider(-23.54, -23.26, 2.1, 4.12, 2.0, 5.2);
  const wDoorL = makeDoorLeaf(mats, 0.96, 2.64, true, 1, mats.boiserieSage);
  wDoorL.position.set(-23.32, y1Base, 0.14);
  wDoorL.rotation.y = -0.12;
  group.add(wDoorL);
  const wDoorR = makeDoorLeaf(mats, 0.96, 2.64, true, 1, mats.boiserieSage);
  wDoorR.position.set(-23.32, y1Base, 2.06);
  wDoorR.rotation.y = 0.12;
  group.add(wDoorR);

  // 1F North Exterior Wall (Z = -9.8, X in [-23.4, -4.0]): Kitchen Window [-17.6, -14.8], Study Window [-9.2, -5.4]
  addBox(group, 5.8, h1, 0.24, mats.extPlaster, -20.5, mid1, -9.8);
  addInteriorVintageWallFace(group, mats, "x", -20.0, -17.6, -9.8, 1, y1Base, y1Top, { theme: "sage" });
  addVillaWindow("x", -17.6, -14.8, -9.8, 1, y1Base, y1Top, { bays: 2, theme: "sage", flowerBox: false });
  addBox(group, 5.6, h1, 0.24, mats.extPlaster, -12.0, mid1, -9.8);
  addInteriorVintageWallFace(group, mats, "x", -14.8, -10.5, -9.8, 1, y1Base, y1Top, { theme: "sage", skipBoiserie: true });
  addVillaWindow("x", -9.2, -5.4, -9.8, 1, y1Base, y1Top, { bays: 3, theme: "study", flowerBox: false });
  addBox(group, 1.4, h1, 0.24, mats.extPlaster, -4.7, mid1, -9.8);
  addInteriorVintageWallFace(group, mats, "x", -5.4, -4.1, -9.8, 1, y1Base, y1Top, { theme: "study" });
  registerBoxCollider(-23.5, -3.9, -9.94, -9.66, 2.0, 5.2);

  // 1F Interior Partitions:
  // (a) Salon Fireplace Backing Wall (Z = -3.1, X in [-20.0, -16.8], leaving open archways East & West to Stair/Kitchen!)
  addBox(group, 3.2, h1, 0.22, mats.extPlaster, -18.4, mid1, -3.1);
  addInteriorVintageWallFace(group, mats, "x", -20.0, -16.8, -3.1, 1, y1Base, y1Top, { theme: "sage" });
  addInteriorVintageWallFace(group, mats, "x", -20.0, -16.8, -3.1, -1, y1Base, y1Top, { theme: "sage" });
  registerBoxCollider(-20.05, -16.75, -3.24, -2.96, 2.0, 5.2);

  // (b) Conservatory Study Partition (X = -10.4, Z in [-9.7, -1.4]) with Wide Open Vintage Archway Z in [-6.2, -4.2]
  addBox(group, 0.22, h1, 3.5, mats.extPlaster, -10.4, mid1, -7.95);
  addInteriorVintageWallFace(group, mats, "z", -9.7, -6.2, -10.4, 1, y1Base, y1Top, { theme: "study" });
  addInteriorVintageWallFace(group, mats, "z", -9.7, -6.2, -10.4, -1, y1Base, y1Top, { theme: "sage" });
  addBox(group, 0.22, y1Top - 5.20, 2.0, mats.extPlaster, -10.4, (y1Top + 5.20) * 0.5, -5.2);
  addBox(group, 0.30, 0.10, 2.16, mats.creamMolding, -10.4, 5.20, -5.2);
  addBox(group, 0.22, h1, 2.8, mats.extPlaster, -10.4, mid1, -2.8);
  addInteriorVintageWallFace(group, mats, "z", -4.2, -1.5, -10.4, 1, y1Base, y1Top, { theme: "study" });
  addInteriorVintageWallFace(group, mats, "z", -4.2, -1.5, -10.4, -1, y1Base, y1Top, { theme: "sage" });
  registerBoxCollider(-10.54, -10.26, -9.8, -6.2, 2.0, 5.2);
  registerBoxCollider(-10.54, -10.26, -4.2, -1.4, 2.0, 5.2);

  // =========================================================================
  // SOUTH 3-ARCH CLASSICAL LIMESTONE PORTICO + 2F JULIET FLOWER BALCONY
  // =========================================================================
  const porticoCols = [-17.1, -15.05, -12.95, -10.9];
  for (const px of porticoCols) {
    addBox(group, 0.42, 0.42, 0.42, mats.copingStone, px, 2.81, 6.28);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.175, 2.55, 16), mats.limestone);
    shaft.position.set(px, 4.30, 6.28);
    group.add(shaft);
    addBox(group, 0.40, 0.16, 0.40, mats.copingStone, px, 5.65, 6.28);
    registerCircleCollider(px, 6.28, 0.22, 2.0, 5.2);
  }
  // Entablature & 3 Semicircular Arches
  addBox(group, 6.65, 0.38, 2.52, mats.copingStone, -14.0, 5.93, 5.14);
  for (const ax of [-16.08, -14.0, -11.92]) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.11, 8, 18, Math.PI), mats.copingStone);
    arch.position.set(ax, 5.02, 6.28);
    group.add(arch);
  }
  addCoachSconce(group, mats, -15.55, 4.42, 4.14, 0);
  addCoachSconce(group, mats, -12.45, 4.42, 4.14, 0);
  for (const wx of [-16.05, -11.95]) {
    const wPortico = new THREE.Group();
    wPortico.position.set(wx, 5.74, 6.32);
    wPortico.userData.isIndoorGLBWisteria = true;
    group.add(wPortico);
  }

  // 2F Juliet Balcony Deck & Wrought-Iron Flower Balustrade (Y = 6.12m)
  addBox(group, 6.4, 0.06, 2.38, mats.copingStone, -14.0, 6.09, 5.19);
  addWroughtBalustrade(group, mats, "x", -17.1, -10.9, 6.30, 6.12, 5.4, 9.8);
  addWroughtBalustrade(group, mats, "z", 4.08, 6.30, -17.1, 6.12, 5.4, 9.8);
  addWroughtBalustrade(group, mats, "z", 4.08, 6.30, -10.9, 6.12, 5.4, 9.8);
  addFloweringPlanter(group, mats, -16.6, 6.12, 5.9, { potStyle: "rose", flowerType: "hydrangeaPink", scale: 1.0, glbTag: "isIndoorGLBRosePot" });
  addFloweringPlanter(group, mats, -11.4, 6.12, 5.9, { potStyle: "celadon", flowerType: "hydrangeaLilac", scale: 1.0, glbTag: "isIndoorGLBMargaritaPot" });

  // =========================================================================
  // 1F CEILING / 2F STRUCTURAL SLAB (with Stairwell Cutout X in [-23.2, -20.0], Z in [-9.6, -3.2]!)
  // =========================================================================
  // Main 1F Ceiling East of Stairwell: X in [-20.0, -10.4], Z in [-9.8, +4.0]
  const ceil1FEast = addBox(group, 9.6, 0.09, 13.8, mats.ceilPlaster, -15.2, 6.02, -2.9);
  ceil1FEast.userData.noShadow = true;
  // 1F Ceiling South of Stairwell: X in [-23.4, -20.0], Z in [-3.2, +4.0]
  const ceil1FSouth = addBox(group, 3.4, 0.09, 7.2, mats.ceilPlaster, -21.7, 6.02, 0.4);
  ceil1FSouth.userData.noShadow = true;
  // 1F NE Conservatory Study Ceiling / 2F East Rooftop Terrace Slab: X in [-11.2, -3.9], Z in [-9.9, -1.3]
  addBox(group, 7.3, 0.14, 8.6, mats.copingStone, -7.55, 6.05, -5.6);
  const ceil1FStudy = addBox(group, 7.1, 0.04, 8.4, mats.ceilPlaster, -7.55, 5.96, -5.6);
  ceil1FStudy.userData.noShadow = true;
  // 2F Master Suite Herringbone Parquet Floor (cut neatly around stairwell!)
  addBox(group, 8.8, 0.04, 13.6, mats.parquetFloor, -15.6, 6.10, -2.9);
  addBox(group, 3.3, 0.04, 7.1, mats.parquetFloor, -21.65, 6.10, 0.35);

  // Exposed Vintage Walnut Ceiling Beams on 1F
  for (const bx of [-21.8, -19.2, -16.6, -14.0, -11.6]) {
    addBox(group, 0.15, 0.20, 6.8, mats.walnut, bx, 5.90, 0.45);
  }
  for (const bx of [-18.6, -16.0, -13.4, -8.8, -6.2]) {
    addBox(group, 0.14, 0.18, 7.8, mats.walnut, bx, 5.90, -5.6);
  }

  // =========================================================================
  // WALKABLE INDOOR VINTAGE WALNUT & BRASS STAIRCASE (X in [-23.1, -20.1], Z: -3.2 -> -9.0)
  // =========================================================================
  const steps = 16;
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 0.5) / steps;
    const sz = lerp(-3.35, -8.95, t);
    const sy = lerp(2.60, 6.12, (i + 1) / steps);
    addBox(group, 1.56, 0.055, 0.38, mats.walnut, -21.6, sy - 0.025, sz);
    addBox(group, 1.50, 0.21, 0.03, mats.creamMolding, -21.6, sy - 0.12, sz + 0.17);
    // Turned brass & walnutusters along inner stair edge (X = -20.82)
    addBox(group, 0.028, 0.88, 0.028, i % 2 === 0 ? mats.creamMolding : mats.brass, -20.84, sy + 0.42, sz);
  }
  // Top 2F Stair Landing Platform (Z in [-9.7, -8.9], X in [-23.2, -19.8])
  addBox(group, 3.4, 0.08, 0.9, mats.parquetFloor, -21.5, 6.08, -9.3);
  addHipCapBeam(group, mats.walnut, [-20.84, 3.55, -3.3], [-20.84, 7.04, -9.0], 0.036);
  // 2F Stairwell Safety Balustrade along X = -20.0 (Z in [-8.6, -3.2]) and Z = -3.2 (X in [-23.2, -20.0])
  addWroughtBalustrade(group, mats, "z", -8.55, -3.2, -20.02, 6.12, 5.4, 9.8);
  addWroughtBalustrade(group, mats, "x", -23.2, -20.02, -3.2, 6.12, 5.4, 9.8);
  // Prevent walking underneath the low half of the stair stringer on 1F
  registerBoxCollider(-23.2, -20.7, -9.6, -6.2, 2.0, 4.2);

  // =========================================================================
  // 2F ROMANTIC SEA-VIEW MASTER VILLA TOWER (X in [-23.4, -11.2], Z in [-9.8, +4.0], Y = 6.12..9.40m)
  // =========================================================================
  // 2F South Wall (Z = +4.0): Window [-21.4, -18.2], French Doors [-15.1, -12.9] to Juliet Balcony
  addBox(group, 2.0, h2, 0.24, mats.extPlaster, -22.4, mid2, 4.0);
  addInteriorVintageWallFace(group, mats, "x", -23.3, -21.4, 4.0, -1, y2Base, y2Top, { theme: "rose" });
  addVillaWindow("x", -21.4, -18.2, 4.0, -1, y2Base, y2Top, { bays: 3, theme: "rose" });
  addBox(group, 3.1, h2, 0.24, mats.extPlaster, -16.65, mid2, 4.0);
  addInteriorVintageWallFace(group, mats, "x", -18.2, -15.1, 4.0, -1, y2Base, y2Top, { theme: "rose" });
  addBox(group, 2.2, y2Top - 8.72, 0.24, mats.extPlaster, -14.0, (y2Top + 8.72) * 0.5, 4.0);
  addBox(group, 2.38, 0.11, 0.32, mats.copingStone, -14.0, 8.73, 4.0);
  addBox(group, 1.7, h2, 0.24, mats.extPlaster, -12.05, mid2, 4.0);
  addInteriorVintageWallFace(group, mats, "x", -12.9, -11.3, 4.0, -1, y2Base, y2Top, { theme: "rose" });
  registerBoxCollider(-23.5, -15.1, 3.86, 4.14, 5.4, 9.8);
  registerBoxCollider(-12.9, -11.1, 3.86, 4.14, 5.4, 9.8);

  const s2DoorL = makeDoorLeaf(mats, 1.06, 2.58, true, 1, mats.boiserieRose);
  s2DoorL.position.set(-15.06, y2Base, 3.92);
  s2DoorL.rotation.y = 1.45;
  group.add(s2DoorL);
  const s2DoorR = makeDoorLeaf(mats, 1.06, 2.58, true, -1, mats.boiserieRose);
  s2DoorR.position.set(-12.94, y2Base, 3.92);
  s2DoorR.rotation.y = -1.45;
  group.add(s2DoorR);

  // 2F East Wall (X = -11.2, Z in [-9.8, +4.0]): French Doors [-6.4, -4.2] onto 2F Rooftop Terrace + Window [-1.8, +1.8]
  addBox(group, 0.24, h2, 3.4, mats.extPlaster, -11.2, mid2, -8.1);
  addInteriorVintageWallFace(group, mats, "z", -9.7, -6.4, -11.2, -1, y2Base, y2Top, { theme: "rose" });
  addBox(group, 0.24, y2Top - 8.72, 2.2, mats.extPlaster, -11.2, (y2Top + 8.72) * 0.5, -5.3);
  addBox(group, 0.32, 0.11, 2.36, mats.copingStone, -11.2, 8.73, -5.3);
  addBox(group, 0.24, h2, 2.4, mats.extPlaster, -11.2, mid2, -3.0);
  addInteriorVintageWallFace(group, mats, "z", -4.2, -1.8, -11.2, -1, y2Base, y2Top, { theme: "rose" });
  addVillaWindow("z", -1.8, 1.8, -11.2, -1, y2Base, y2Top, { bays: 3, theme: "rose" });
  addBox(group, 0.24, h2, 2.2, mats.extPlaster, -11.2, mid2, 2.9);
  addInteriorVintageWallFace(group, mats, "z", 1.8, 3.9, -11.2, -1, y2Base, y2Top, { theme: "rose" });
  registerBoxCollider(-11.34, -11.06, -9.9, -6.4, 5.4, 9.8);
  registerBoxCollider(-11.34, -11.06, -4.2, 4.12, 5.4, 9.8);

  const e2DoorL = makeDoorLeaf(mats, 1.06, 2.58, true, -1, mats.boiserieRose);
  e2DoorL.position.set(-11.28, y2Base, -6.36);
  e2DoorL.rotation.y = 0.15;
  group.add(e2DoorL);
  const e2DoorR = makeDoorLeaf(mats, 1.06, 2.58, true, -1, mats.boiserieRose);
  e2DoorR.position.set(-11.28, y2Base, -4.24);
  e2DoorR.rotation.y = -0.15;
  group.add(e2DoorR);

  // 2F West Wall (X = -23.4, Z in [-9.8, +4.0]): Window [-2.2, +1.6]
  addBox(group, 0.24, h2, 7.6, mats.extPlaster, -23.4, mid2, -6.0);
  addInteriorVintageWallFace(group, mats, "z", -9.7, -2.2, -23.4, 1, y2Base, y2Top, { theme: "rose", skipBoiserie: true });
  addVillaWindow("z", -2.2, 1.6, -23.4, 1, y2Base, y2Top, { bays: 3, theme: "rose" });
  addBox(group, 0.24, h2, 2.4, mats.extPlaster, -23.4, mid2, 2.8);
  addInteriorVintageWallFace(group, mats, "z", 1.6, 3.9, -23.4, 1, y2Base, y2Top, { theme: "rose" });
  registerBoxCollider(-23.54, -23.26, -9.9, 4.12, 5.4, 9.8);

  // 2F North Wall (Z = -9.8, X in [-23.4, -11.2]): Window [-19.2, -15.6]
  addBox(group, 4.2, h2, 0.24, mats.extPlaster, -21.3, mid2, -9.8);
  addVillaWindow("x", -19.2, -15.6, -9.8, 1, y2Base, y2Top, { bays: 3, theme: "rose", flowerBox: false });
  addBox(group, 4.4, h2, 0.24, mats.extPlaster, -13.4, mid2, -9.8);
  addInteriorVintageWallFace(group, mats, "x", -15.6, -11.3, -9.8, 1, y2Base, y2Top, { theme: "rose" });
  registerBoxCollider(-23.5, -11.1, -9.94, -9.66, 5.4, 9.8);

  // 2F Beamed Ceiling (Y = 9.40m)
  const ceil2F = addBox(group, 12.4, 0.10, 14.0, mats.ceilPlaster, -17.3, 9.40, -2.9);
  ceil2F.userData.noShadow = true;
  for (const bx of [-21.6, -19.4, -17.2, -15.0, -12.8]) {
    addBox(group, 0.15, 0.20, 13.6, mats.walnut, bx, 9.26, -2.9);
  }

  // Limestone Corner Quoins (转角隅石) & Exterior-Only Belt Course Molding around Petite Villa Facades
  for (const [qx, qz, qTop] of [
    [-23.4, 4.0, 9.4], [-11.2, 4.0, 9.4], [-23.4, -9.8, 9.4], [-11.2, -9.8, 9.4],
    [-4.0, -1.4, 6.0], [-4.0, -9.8, 6.0], [-10.4, 4.0, 6.0],
  ]) {
    addQuoinColumn(group, mats, qx, qz, 2.62, qTop);
  }
  addBox(group, 12.6, 0.15, 0.18, mats.copingStone, -17.3, 6.06, 4.10);
  addBox(group, 12.6, 0.15, 0.18, mats.copingStone, -17.3, 6.06, -9.90);
  addBox(group, 0.18, 0.15, 14.18, mats.copingStone, -23.50, 6.06, -2.90);
  addBox(group, 0.18, 0.15, 5.56, mats.copingStone, -11.10, 6.06, 1.32);

  // =========================================================================
  // 2F EAST ROOFTOP SEA-VIEW FLOWER TERRACE (X in [-11.2, -4.0], Z in [-9.8, -1.4], Y = 6.12m)
  // =========================================================================
  addWroughtBalustrade(group, mats, "x", -11.1, -4.0, -1.42, 6.12, 5.4, 9.8);
  addWroughtBalustrade(group, mats, "x", -11.1, -4.0, -9.78, 6.12, 5.4, 9.8);
  addWroughtBalustrade(group, mats, "z", -9.78, -1.42, -4.02, 6.12, 5.4, 9.8);

  // Rooftop Cedar Rose-and-Wisteria Pergola
  for (const [px, pz] of [[-9.8, -2.4], [-5.2, -2.4], [-9.8, -8.4], [-5.2, -8.4]]) {
    addBox(group, 0.22, 0.26, 0.22, mats.copingStone, px, 6.25, pz);
    addBox(group, 0.13, 2.68, 0.13, mats.cedarBeam, px, 7.58, pz);
    registerCircleCollider(px, pz, 0.16, 5.4, 9.8);
  }
  addBox(group, 5.1, 0.11, 0.13, mats.cedarBeam, -7.5, 8.92, -2.4);
  addBox(group, 5.1, 0.11, 0.13, mats.cedarBeam, -7.5, 8.92, -8.4);
  for (let rx = -9.6; rx <= -5.4; rx += 0.6) {
    addBox(group, 0.065, 0.085, 6.4, mats.cedarDeck, rx, 9.01, -5.4);
  }
  for (const [wx, wz] of [[-8.6, -2.4], [-6.2, -2.4], [-7.5, -5.4]]) {
    const w2 = new THREE.Group();
    w2.position.set(wx, 8.95, wz);
    w2.userData.isIndoorGLBWisteria = true;
    group.add(w2);
  }
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -7.5, 8.92, -3.6, { drop: 0.62, scale: 0.95, rosePot: true });
  addFloweringPlanter(group, mats, -4.6, 6.12, -2.1, { potStyle: "rose", flowerType: "hydrangeaPink", scale: 1.15, glbTag: "isIndoorGLBRosePot" });
  addFloweringPlanter(group, mats, -4.6, 6.12, -8.9, { potStyle: "celadon", flowerType: "hydrangeaBlue", scale: 1.15, glbTag: "isIndoorGLBMargaritaPot" });

  // =========================================================================
  // STEEP CROSS-GABLE FRENCH TERRACOTTA ROOFS + FRONT OCULUS PEDIMENT + CHIMNEY
  // =========================================================================
  const eaveY = 9.42;
  const pSW = [-24.2, eaveY, 4.75];
  const pSE = [-10.4, eaveY, 4.75];
  const pNE = [-10.4, eaveY, -10.55];
  const pNW = [-24.2, eaveY, -10.55];
  const rS = [-17.3, 11.58, 0.2];
  const rN = [-17.3, 11.58, -6.0];

  addBox(group, 13.88, 0.14, 15.38, mats.copingStone, -17.3, 9.48, -2.9);
  addRoofSlope(group, mats.terracottaRoof, pNW, pSW, rS, rN);
  addRoofSlope(group, mats.terracottaRoof, pSE, pNE, rN, rS);
  addRoofSlope(group, mats.terracottaRoof, pSW, pSE, rS, rS);
  addRoofSlope(group, mats.terracottaRoof, pNE, pNW, rN, rN);
  addHipCapBeam(group, mats.terracottaPot, rS, rN, 0.105);
  addHipCapBeam(group, mats.terracottaPot, pSW, rS, 0.09);
  addHipCapBeam(group, mats.terracottaPot, pSE, rS, 0.09);
  addHipCapBeam(group, mats.terracottaPot, pNW, rN, 0.09);
  addHipCapBeam(group, mats.terracottaPot, pNE, rN, 0.09);

  // Picturesque South Front Dormer Gable Pediment centered at X = -14.0 with Vintage Round Oculus Window!
  const gBL = [-16.6, 9.42, 4.82];
  const gBR = [-11.4, 9.42, 4.82];
  const gApex = [-14.0, 11.18, 4.82];
  const gBackApex = [-14.0, 11.18, 1.2];
  addRoofTriangle(group, mats.extPlaster, gBL, gBR, gApex);
  addRoofSlope(group, mats.terracottaRoof, [-16.8, 9.38, 4.95], gApex, gBackApex, [-16.8, 9.38, 1.2]);
  addRoofSlope(group, mats.terracottaRoof, gApex, [-11.2, 9.38, 4.95], [-11.2, 9.38, 1.2], gBackApex);
  addHipCapBeam(group, mats.copingStone, [-16.8, 9.38, 4.95], gApex, 0.085);
  addHipCapBeam(group, mats.copingStone, [-11.2, 9.38, 4.95], gApex, 0.085);
  addHipCapBeam(group, mats.terracottaPot, gApex, gBackApex, 0.09);

  // Round Oculus Rose Window in Front Gable Pediment
  const oculusRim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.075, 10, 24), mats.copingStone);
  oculusRim.position.set(-14.0, 10.12, 4.85);
  group.add(oculusRim);
  const oculusGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 20), mats.glass);
  oculusGlass.rotation.x = Math.PI * 0.5;
  oculusGlass.position.set(-14.0, 10.12, 4.83);
  group.add(oculusGlass);
  addBox(group, 0.84, 0.04, 0.06, mats.brass, -14.0, 10.12, 4.86);
  addBox(group, 0.04, 0.84, 0.06, mats.brass, -14.0, 10.12, 4.86);

  // Carved Limestone Fireplace Chimney
  addBox(group, 1.12, 2.75, 0.88, mats.limestone, -18.4, 11.0, -3.1);
  addBox(group, 1.28, 0.14, 1.04, mats.copingStone, -18.4, 12.42, -3.1);
  for (const dx of [-0.26, 0.26]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.40, 12), mats.terracottaPot);
    pot.position.set(-18.4 + dx, 12.68, -3.1);
    group.add(pot);
  }
}

function buildVintageSalonDiningKitchen(group, mats, emberState, hangingPlantAnimList) {
  // --- 1. FRENCH VINTAGE SALON (West-South of 1F: X in [-23.0, -15.6], Z in [-2.8, +3.8]) ---
  // Carved Limestone & Gilt-Brass French Mantel Fireplace at X = -18.4, Z = -2.62
  addBox(group, 2.36, 1.48, 0.58, mats.hearthStone, -18.4, 3.34, -2.72);
  addBox(group, 2.62, 0.14, 0.72, mats.copingStone, -18.4, 4.12, -2.68);
  addBox(group, 2.58, 0.11, 0.92, mats.marble, -18.4, 2.655, -2.56);
  addBox(group, 1.18, 0.86, 0.04, mats.wroughtIron, -18.4, 3.14, -2.42);
  // Fluted pilaster jambs & brass trim
  for (const side of [-1, 1]) {
    addBox(group, 0.24, 1.32, 0.14, mats.copingStone, -18.4 + side * 0.94, 3.34, -2.40);
  }
  addBox(group, 1.28, 0.032, 0.03, mats.brass, -18.4, 3.58, -2.38);

  for (let i = 0; i < 4; i += 1) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.64, 8), mats.walnut);
    log.rotation.z = Math.PI * 0.5 + (i - 1.5) * 0.08;
    log.position.set(-18.4, 2.80 + (i > 1 ? 0.08 : 0), -2.32 + (i % 2) * 0.06);
    group.add(log);
  }
  const emberBed = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.08, 0.22), mats.emberGlow);
  emberBed.position.set(-18.4, 2.75, -2.30);
  group.add(emberBed);
  emberState.mesh = emberBed;

  // Ornate Gilt-Brass Arched Rococo Overmantel Mirror + Candlesticks + Trailing Mantel Ivy
  addBox(group, 1.38, 1.16, 0.06, mats.brass, -18.4, 4.78, -2.92);
  const mirArch = new THREE.Mesh(new THREE.CylinderGeometry(0.69, 0.69, 0.06, 20, 1, false, 0, Math.PI), mats.brass);
  mirArch.rotation.z = -Math.PI * 0.5;
  mirArch.rotation.y = Math.PI * 0.5;
  mirArch.position.set(-18.4, 5.36, -2.92);
  group.add(mirArch);
  addBox(group, 1.22, 1.04, 0.065, mats.mirrorSilver, -18.4, 4.78, -2.91);
  for (const cx of [-19.35, -17.45]) {
    const cStick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.055, 0.22, 10), mats.brass);
    cStick.position.set(cx, 4.30, -2.62);
    group.add(cStick);
    const cBulb = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), mats.opalGlow);
    cBulb.position.set(cx, 4.46, -2.62);
    group.add(cBulb);
  }
  addTrailingVine(group, mats, -18.4, 4.16, -2.34, 1.85, 9, 1);
  registerBoxCollider(-19.72, -17.08, -3.05, -2.12, 2.0, 5.2);

  // French Aubusson Rose-Medallion Rug (4.4m x 3.2m)
  addBox(group, 4.4, 0.015, 3.2, mats.livingRug, -18.9, 2.608, 0.65);

  // Tufted Vintage Dusty-Rose Velvet Rolled-Arm Chesterfield Sofa (X = -18.8, Z = +2.15)
  const sofa = new THREE.Group();
  sofa.position.set(-18.8, 2.60, 2.15);
  addBox(sofa, 2.86, 0.26, 0.94, mats.dustyRoseVelvet, 0, 0.26, 0);
  addBox(sofa, 2.86, 0.58, 0.24, mats.deepRoseVelvet, 0, 0.62, 0.35);
  // Rolled Cylindrical Velvet Arms & Tufted Back Buttons
  for (const side of [-1, 1]) {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.96, 14), mats.deepRoseVelvet);
    roll.rotation.x = Math.PI * 0.5;
    roll.position.set(side * 1.38, 0.56, 0);
    sofa.add(roll);
    addBox(sofa, 0.24, 0.34, 0.92, mats.dustyRoseVelvet, side * 1.34, 0.38, 0);
  }
  for (let c = -1; c <= 1; c += 1) {
    addBox(sofa, 0.82, 0.15, 0.72, mats.dustyRoseVelvet, c * 0.84, 0.44, -0.06);
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), mats.brass);
    btn.position.set(c * 0.68, 0.66, 0.22);
    sofa.add(btn);
  }
  for (const [lx, lz] of [[-1.28, -0.36], [1.28, -0.36], [-1.28, 0.36], [1.28, 0.36]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.024, 0.14, 10), mats.walnut);
    leg.position.set(lx, 0.07, lz);
    sofa.add(leg);
  }
  // Sage-Green & Blush Silk Throw Pillows
  addBox(sofa, 0.42, 0.36, 0.14, mats.sageVelvet, -1.02, 0.62, 0.12, 0.24);
  addBox(sofa, 0.40, 0.34, 0.14, mats.blushSilk, 0.0, 0.60, 0.15, -0.08);
  addBox(sofa, 0.42, 0.36, 0.14, mats.sageVelvet, 1.02, 0.62, 0.12, -0.24);
  group.add(sofa);
  registerBoxCollider(-20.32, -17.28, 1.64, 2.68, 2.0, 5.2);

  // Vintage Sage-Green Velvet Wingback Armchair (X = -21.55, Z = +0.45)
  const wingChair = new THREE.Group();
  wingChair.position.set(-21.55, 2.60, 0.45);
  wingChair.rotation.y = 1.15;
  addBox(wingChair, 0.84, 0.34, 0.80, mats.sageVelvet, 0, 0.28, 0);
  addBox(wingChair, 0.84, 0.78, 0.16, mats.sageVelvet, 0, 0.72, -0.32);
  addBox(wingChair, 0.12, 0.48, 0.34, mats.sageVelvet, -0.38, 0.84, -0.18);
  addBox(wingChair, 0.12, 0.48, 0.34, mats.sageVelvet, 0.38, 0.84, -0.18);
  addBox(wingChair, 0.16, 0.32, 0.76, mats.sageVelvet, -0.36, 0.48, 0);
  addBox(wingChair, 0.16, 0.32, 0.76, mats.sageVelvet, 0.36, 0.48, 0);
  addBox(wingChair, 0.42, 0.32, 0.13, mats.dustyRoseVelvet, 0, 0.54, -0.16);
  group.add(wingChair);
  registerCircleCollider(-21.55, 0.45, 0.48, 2.0, 5.2);

  // Turned-Leg French Walnut & Marble Coffee Table (-18.8, 2.60, +0.55)
  addBox(group, 1.38, 0.05, 0.78, mats.walnut, -18.8, 3.04, 0.55);
  addBox(group, 1.26, 0.025, 0.66, mats.marble, -18.8, 3.072, 0.55);
  for (const [lx, lz] of [[-0.58, -0.30], [0.58, -0.30], [-0.58, 0.30], [0.58, 0.30]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.024, 0.42, 10), mats.walnut);
    leg.position.set(-18.8 + lx, 2.81, 0.55 + lz);
    group.add(leg);
  }
  addBox(group, 0.32, 0.04, 0.24, mats.deepRoseVelvet, -19.16, 3.105, 0.52, 0.14);
  addRoseArrangement(group, mats, -18.52, 3.085, 0.56, 0.96, true);
  registerBoxCollider(-19.52, -18.08, 0.14, 0.96, 2.0, 5.2);

  // Antique Brass Horn Gramophone (复古黄铜大喇叭留声机) on Carved Walnut Pedestal (-16.55, 2.60, -2.15)
  const gramPed = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.72, 16), mats.walnut);
  gramPed.position.set(-16.55, 2.96, -2.15);
  group.add(gramPed);
  addBox(group, 0.36, 0.14, 0.36, mats.walnut, -16.55, 3.39, -2.15);
  const vinyl = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.012, 18), mats.wroughtIron);
  vinyl.position.set(-16.55, 3.47, -2.15);
  group.add(vinyl);
  const hornNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.24, 10), mats.brass);
  hornNeck.position.set(-16.55, 3.58, -2.24);
  hornNeck.rotation.x = 0.45;
  group.add(hornNeck);
  const hornBell = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.38, 18, 1, true), mats.brass);
  hornBell.position.set(-16.55, 3.76, -2.06);
  hornBell.rotation.x = -1.12;
  group.add(hornBell);
  registerCircleCollider(-16.55, -2.15, 0.34, 2.0, 5.2);

  // Salon Chandelier + Wrought-Iron Flower Stand + Hanging Spider Plants (吊兰) + Potted Hydrangeas
  addCrystalBrassChandelier(group, mats, -18.8, 5.98, 0.65, 6, 0.88);
  addVintagePlantStand(group, mats, -22.45, 2.60, 3.15, 0.65);
  registerCircleCollider(-22.45, 3.15, 0.36, 2.0, 5.2);
  addFloweringPlanter(group, mats, -16.4, 2.60, 3.35, { potStyle: "rose", flowerType: "hydrangeaPink", scale: 1.25, glbTag: "isIndoorGLBRosePot" });
  addFloweringPlanter(group, mats, -21.95, 2.60, 1.85, { potStyle: "rose", flowerType: "hydrangeaBlush", scale: 1.15, glbTag: "isIndoorGLBMargaritaPot" });
  addFloweringPlanter(group, mats, -19.8, 2.66, -2.35, { potStyle: "celadon", flowerType: "hydrangeaLilac", scale: 1.08, glbTag: "isIndoorGLBFernPot" });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -16.6, 5.82, 0.72, { drop: 0.78, scale: 1.08, rosePot: true });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -19.2, 5.82, -0.65, { drop: 0.72, scale: 1.02, rosePot: false });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -21.2, 5.86, 3.25, { drop: 0.70, scale: 1.05, rosePot: true });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -17.9, 5.86, 3.25, { drop: 0.66, scale: 1.0, rosePot: false });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -22.6, 5.86, -1.65, { drop: 0.74, scale: 1.02, rosePot: true });

  // --- 2. VINTAGE FRENCH DINING HALL (X = -12.65, Z = +1.15, overlooking SE Garden Courtyard) ---
  addBox(group, 2.25, 0.06, 1.06, mats.walnut, -12.65, 3.35, 1.15);
  for (const [lx, lz] of [[-0.98, -0.42], [0.98, -0.42], [-0.98, 0.42], [0.98, 0.42]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.028, 0.72, 10), mats.walnut);
    leg.position.set(-12.65 + lx, 2.96, 1.15 + lz);
    group.add(leg);
  }
  addBox(group, 1.85, 0.012, 0.36, mats.blushSilk, -12.65, 3.388, 1.15);
  addRoseArrangement(group, mats, -12.95, 3.39, 1.15, 0.92, false);
  const cakeStand = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.08, 0.11, 16), mats.retroRosePorcelain);
  cakeStand.position.set(-12.18, 3.44, 1.15);
  group.add(cakeStand);
  const tart = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.10, 0.045, 14), mats.waxSeal);
  tart.position.set(-12.18, 3.51, 1.15);
  group.add(tart);

  const addVintageDiningChair = (cx, cz, ry, matSeat) => {
    const ch = new THREE.Group();
    ch.position.set(cx, 2.60, cz);
    ch.rotation.y = ry;
    addBox(ch, 0.48, 0.06, 0.46, matSeat, 0, 0.46, 0);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.045, 16), matSeat);
    back.rotation.x = Math.PI * 0.5;
    back.position.set(0, 0.78, -0.21);
    ch.add(back);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.02, 8, 18), mats.walnut);
    frame.position.set(0, 0.78, -0.21);
    ch.add(frame);
    for (const [sx, sz] of [[-0.20, -0.19], [0.20, -0.19], [-0.20, 0.19], [0.20, 0.19]]) {
      addBox(ch, 0.038, 0.45, 0.038, mats.walnut, sx, 0.225, sz);
    }
    group.add(ch);
  };
  addVintageDiningChair(-13.15, 0.48, 0, mats.dustyRoseVelvet);
  addVintageDiningChair(-12.15, 0.48, 0, mats.sageVelvet);
  addVintageDiningChair(-13.15, 1.82, Math.PI, mats.sageVelvet);
  addVintageDiningChair(-12.15, 1.82, Math.PI, mats.dustyRoseVelvet);
  registerBoxCollider(-13.85, -11.45, 0.35, 1.95, 2.0, 5.2);
  addCrystalBrassChandelier(group, mats, -12.65, 5.98, 1.15, 5, 0.84);
  addFloweringPlanter(group, mats, -11.15, 2.60, 3.35, { potStyle: "celadon", flowerType: "hydrangeaBlush", scale: 1.18, glbTag: "isIndoorGLBMargaritaPot" });

  // --- 3. RETRO FRENCH SAGE-GREEN & DUSTY-ROSE COUNTRY KITCHEN (X in [-19.4, -10.8], Z in [-9.6, -4.8]) ---
  // Retro Rounded Mint-Sage Smeg-Style Refrigerator (-18.75, 2.60, -9.15)
  const fridge = new THREE.Group();
  fridge.position.set(-18.75, 2.60, -9.18);
  addBox(fridge, 0.92, 1.96, 0.72, mats.retroMintEnamel, 0, 0.98, 0);
  const fCap = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.72, 16, 1, false, 0, Math.PI), mats.retroMintEnamel);
  fCap.rotation.z = -Math.PI * 0.5;
  fCap.rotation.y = Math.PI * 0.5;
  fCap.position.set(0, 1.96, 0);
  fridge.add(fCap);
  addBox(fridge, 0.26, 0.03, 0.05, mats.brass, 0.24, 1.38, 0.38);
  addBox(fridge, 0.26, 0.03, 0.05, mats.brass, 0.24, 0.78, 0.38);
  group.add(fridge);

  // Vintage Sage-Green Beaded Base Cabinetry + Checkered Dusty-Rose Zellige Backsplash (Z = -9.28, X in [-17.9, -11.2])
  addBox(group, 6.6, 0.88, 0.68, mats.boiserieSage, -14.5, 3.04, -9.28);
  addBox(group, 6.68, 0.05, 0.74, mats.marble, -14.5, 3.505, -9.26);
  addBox(group, 6.5, 0.92, 0.03, mats.checkeredTile, -14.5, 3.98, -9.62);

  // Vintage Cream & Brass La Cornue French Range Cooker (-13.6, 2.60, -9.22) + Scalloped Plaster & Brass Hood
  addBox(group, 1.18, 0.90, 0.74, mats.retroCreamEnamel, -13.6, 3.05, -9.22);
  addBox(group, 1.12, 0.03, 0.62, mats.wroughtIron, -13.6, 3.52, -9.22);
  addBox(group, 0.46, 0.42, 0.04, mats.brass, -13.3, 3.04, -8.84);
  addBox(group, 0.46, 0.42, 0.04, mats.brass, -13.9, 3.04, -8.84);
  const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.13, 0.15, 14), mats.copper);
  kettle.position.set(-13.35, 3.60, -9.18);
  group.add(kettle);
  addBox(group, 1.28, 1.48, 0.62, mats.extBlushTrim, -13.6, 5.16, -9.32);
  addBox(group, 1.34, 0.08, 0.66, mats.brass, -13.6, 4.42, -9.32);

  // Open Vintage Sage Plate-Rack Hutch displaying Dusty-Rose Porcelain Plates + Trailing Ivy (-11.9, 4.85, -9.42)
  addBox(group, 1.56, 1.08, 0.36, mats.boiserieSage, -11.9, 4.88, -9.44);
  addBox(group, 1.64, 0.06, 0.40, mats.creamMolding, -11.9, 5.44, -9.44);
  for (let p = 0; p < 5; p += 1) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.018, 16), mats.retroRosePorcelain);
    plate.rotation.x = Math.PI * 0.44;
    plate.position.set(-12.46 + p * 0.28, 4.78, -9.38);
    group.add(plate);
  }
  addTrailingVine(group, mats, -11.9, 5.46, -9.22, 1.35, 7, 1);
  registerBoxCollider(-19.3, -11.0, -9.75, -8.82, 2.0, 5.2);

  // Turned-Leg Vintage Sage & Calacatta Marble Kitchen Island (-15.0, 2.60, -6.35) + Overhead Brass Plant Rack!
  addBox(group, 2.48, 0.86, 0.92, mats.boiserieSage, -15.0, 3.03, -6.35);
  addBox(group, 2.64, 0.055, 1.08, mats.marble, -15.0, 3.49, -6.35);
  addFloweringPlanter(group, mats, -15.85, 3.52, -6.35, { potStyle: "rose", flowerType: "orchid", scale: 0.78 });
  // Overhead Brass Hanging Pot & Spider-Plant Rack
  addBox(group, 2.20, 0.04, 0.56, mats.brass, -15.0, 5.18, -6.35);
  for (const rx of [-15.9, -14.1]) {
    const rRod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.82, 8), mats.brass);
    rRod.position.set(rx, 5.59, -6.35);
    group.add(rRod);
  }
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -15.75, 5.16, -6.35, { drop: 0.48, scale: 0.88, rosePot: true });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -14.25, 5.16, -6.35, { drop: 0.48, scale: 0.88, rosePot: false });
  for (const sx of [-15.7, -15.0, -14.3]) {
    const sSeat = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.07, 16), mats.dustyRoseVelvet);
    sSeat.position.set(sx, 3.24, -5.62);
    group.add(sSeat);
    const sPed = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.16, 0.62, 12), mats.walnut);
    sPed.position.set(sx, 2.91, -5.62);
    group.add(sPed);
  }
  registerBoxCollider(-16.36, -13.64, -6.92, -5.42, 2.0, 5.2);
}

function buildConservatoryStudyAndLetter(group, mats, hangingPlantAnimList) {
  // Aubusson Sage-and-Rose Study Rug
  addBox(group, 4.2, 0.014, 3.4, mats.studyRug, -7.25, 2.608, -5.65);

  // Vintage Celadon-Sage Floor-to-Ceiling Library Bookcase at X = -10.02, Z in [-9.45, -6.45]
  addBox(group, 0.44, 2.86, 2.96, mats.boiserieSage, -10.04, 4.03, -7.95);
  addBox(group, 0.52, 0.09, 3.08, mats.creamMolding, -10.02, 5.48, -7.95);
  for (let s = 0; s < 6; s += 1) {
    addBox(group, 0.46, 0.04, 2.92, mats.walnut, -10.02, 2.66 + s * 0.48, -7.95);
  }
  addTrailingVine(group, mats, -9.82, 5.50, -7.95, 2.4, 8, 1);

  // 84 Varied Clothbound Vintage Books via InstancedMesh
  const rng = mulberry32(8842);
  const bookCount = 84;
  const bookGeom = new THREE.BoxGeometry(0.22, 1.0, 1.0);
  const bookMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.04 });
  const booksInst = new THREE.InstancedMesh(bookGeom, bookMat, bookCount);
  const palette = [0x4c6b54, 0xa85f6b, 0x7b3b44, 0xb89255, 0xe6dcd0, 0x5c4738, 0x7a9480];
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let idx = 0;
  for (let s = 0; s < 5; s += 1) {
    const shelfY = 2.68 + s * 0.48;
    let curZ = -9.32;
    while (curZ < -6.62 && idx < bookCount) {
      if (s === 2 && curZ > -8.1 && curZ < -7.5) {
        curZ += 0.55;
        continue;
      }
      const thick = 0.028 + rng() * 0.026;
      const bh = 0.24 + rng() * 0.13;
      dummy.position.set(-9.96, shelfY + bh * 0.5, curZ + thick * 0.5);
      dummy.scale.set(1.0, bh, thick);
      dummy.updateMatrix();
      booksInst.setMatrixAt(idx, dummy.matrix);
      col.setHex(palette[Math.floor(rng() * palette.length)]);
      booksInst.setColorAt(idx, col);
      curZ += thick + 0.006;
      idx += 1;
    }
  }
  booksInst.count = idx;
  booksInst.instanceMatrix.needsUpdate = true;
  if (booksInst.instanceColor) booksInst.instanceColor.needsUpdate = true;
  group.add(booksInst);
  registerBoxCollider(-10.3, -9.72, -9.5, -6.4, 2.0, 5.2);

  // Tufted Dusty-Rose Velvet Conservatory Daybed against East Window (-4.85, 2.60, -5.65)
  addBox(group, 1.38, 0.26, 2.04, mats.walnut, -4.85, 2.75, -5.65);
  addBox(group, 0.16, 0.72, 2.04, mats.dustyRoseVelvet, -4.22, 3.00, -5.65);
  addBox(group, 1.32, 0.56, 0.14, mats.deepRoseVelvet, -4.86, 2.94, -6.62);
  addBox(group, 1.32, 0.56, 0.14, mats.deepRoseVelvet, -4.86, 2.94, -4.68);
  addBox(group, 1.26, 0.18, 1.88, mats.blushSilk, -4.88, 2.95, -5.65);
  addBox(group, 1.28, 0.08, 0.72, mats.sageVelvet, -4.88, 3.06, -5.12);
  registerBoxCollider(-5.58, -4.12, -6.72, -4.58, 2.0, 5.2);

  // Artist Studio Easel (-5.65, 2.60, -2.55) + Cedar Guitar
  const easel = new THREE.Group();
  easel.position.set(-5.65, 2.60, -2.55);
  easel.rotation.y = -2.45;
  addBox(easel, 0.04, 1.72, 0.04, mats.naturalOak, -0.22, 0.86, 0.08);
  addBox(easel, 0.04, 1.72, 0.04, mats.naturalOak, 0.22, 0.86, 0.08);
  addBox(easel, 0.04, 1.66, 0.04, mats.naturalOak, 0, 0.82, -0.24);
  addBox(easel, 0.76, 0.60, 0.045, mats.brass, 0, 1.22, 0.11);
  addBox(easel, 0.68, 0.52, 0.05, mats.paintingStudy, 0, 1.22, 0.115);
  group.add(easel);
  registerCircleCollider(-5.65, -2.55, 0.38, 2.0, 5.2);

  // Conservatory Botanical Abundance: Wrought-Iron Stand + Hanging Spider Plants + Blooming Pots
  addVintagePlantStand(group, mats, -9.25, 2.60, -2.25, 0.45);
  registerCircleCollider(-9.25, -2.25, 0.36, 2.0, 5.2);
  addFloweringPlanter(group, mats, -4.65, 2.60, -8.85, { potStyle: "celadon", flowerType: "hydrangeaPink", scale: 1.22, glbTag: "isIndoorGLBRosePot" });
  addFloweringPlanter(group, mats, -7.1, 2.60, -2.05, { potStyle: "rose", flowerType: "hydrangeaLilac", scale: 1.15, glbTag: "isIndoorGLBFernPot" });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -8.5, 5.84, -2.25, { drop: 0.66, scale: 1.02, rosePot: false });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -5.8, 5.84, -2.25, { drop: 0.70, scale: 1.0, rosePot: true });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -5.2, 5.84, -7.85, { drop: 0.68, scale: 0.98, rosePot: false });
  addCrystalBrassChandelier(group, mats, -7.25, 5.94, -5.4, 5, 0.78);

  // Hero Sunlit French Walnut Writing Desk (-7.40, 2.60, -8.25) with Interactive Wax-Sealed Letter!
  addBox(group, 1.72, 0.055, 0.84, mats.walnut, -7.40, 3.35, -8.25);
  addBox(group, 0.42, 0.68, 0.76, mats.walnut, -8.02, 2.98, -8.25);
  addBox(group, 0.42, 0.68, 0.76, mats.walnut, -6.78, 2.98, -8.25);
  for (const dx of [-8.02, -6.78]) {
    addBox(group, 0.14, 0.02, 0.03, mats.brass, dx, 3.16, -7.85);
    addBox(group, 0.14, 0.02, 0.03, mats.brass, dx, 2.94, -7.85);
  }
  addBox(group, 0.74, 0.01, 0.46, mats.sageVelvet, -7.40, 3.382, -8.21);

  // Tufted Dusty-Rose Study Chair
  const sChair = new THREE.Group();
  sChair.position.set(-7.40, 2.60, -7.36);
  sChair.rotation.y = Math.PI + 0.20;
  addBox(sChair, 0.52, 0.06, 0.48, mats.dustyRoseVelvet, 0, 0.46, 0);
  addBox(sChair, 0.50, 0.46, 0.06, mats.dustyRoseVelvet, 0, 0.70, -0.21);
  for (const [lx, lz] of [[-0.21, -0.19], [0.21, -0.19], [-0.21, 0.19], [0.21, 0.19]]) {
    addBox(sChair, 0.04, 0.44, 0.04, mats.walnut, lx, 0.22, lz);
  }
  group.add(sChair);

  // Classic Emerald Banker's Lamp + Thorny Hero Rose Vase + Fountain Pen
  const bBase = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.095, 0.03, 14), mats.brass);
  bBase.position.set(-7.96, 3.39, -8.43);
  group.add(bBase);
  addBox(group, 0.022, 0.30, 0.022, mats.brass, -7.96, 3.54, -8.43);
  const emeraldShade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.22, 12, 1, false, 0, Math.PI),
    new THREE.MeshPhysicalMaterial({
      color: 0x1f6b4a,
      emissive: new THREE.Color(0x2d8a5e),
      emissiveIntensity: 0.48,
      roughness: 0.18,
      clearcoat: 0.8,
    })
  );
  emeraldShade.rotation.z = Math.PI * 0.5;
  emeraldShade.position.set(-7.96, 3.68, -8.40);
  group.add(emeraldShade);

  addRoseArrangement(group, mats, -6.62, 3.38, -8.46, 0.85, true);

  const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.005, 0.17, 8), mats.brass);
  pen.rotation.z = Math.PI * 0.5;
  pen.rotation.y = 0.36;
  pen.position.set(-7.14, 3.395, -8.17);
  group.add(pen);

  // Interactive Wax-Sealed Cotton-Paper Keepsake Letter (with paper thickness, fold crease, flap & wax seal)
  const letterGroup = new THREE.Group();
  letterGroup.position.set(-7.40, 3.388, -8.17);

  const sheetHolder = new THREE.Group();
  sheetHolder.position.set(-0.025, 0.006, 0.014);
  sheetHolder.rotation.y = -0.14;
  const halfLeafA = addBox(sheetHolder, 0.27, 0.0055, 0.098, mats.letterPaper, 0, 0.004, -0.048);
  halfLeafA.rotation.x = 0.048;
  const halfLeafB = addBox(sheetHolder, 0.27, 0.0055, 0.098, mats.letterPaper, 0, 0.004, 0.048);
  halfLeafB.rotation.x = -0.048;
  addBox(sheetHolder, 0.271, 0.0025, 0.006, mats.ivoryLinen, 0, 0.0072, 0);
  letterGroup.add(sheetHolder);

  const envGroup = new THREE.Group();
  envGroup.position.set(0.014, 0.016, -0.006);
  envGroup.rotation.y = 0.11;
  addBox(envGroup, 0.264, 0.012, 0.186, mats.ivoryLinen, 0, 0, 0);

  const flapShape = new THREE.Shape();
  flapShape.moveTo(-0.13, -0.091);
  flapShape.lineTo(0.13, -0.091);
  flapShape.lineTo(0.0, 0.018);
  flapShape.closePath();
  const flapGeo = new THREE.ExtrudeGeometry(flapShape, {
    depth: 0.0035,
    bevelEnabled: true,
    bevelThickness: 0.0012,
    bevelSize: 0.0015,
    bevelSegments: 2,
  });
  flapGeo.rotateX(Math.PI * 0.5);
  const flapMesh = new THREE.Mesh(flapGeo, mats.creamLinen);
  flapMesh.position.set(0, 0.0095, 0);
  envGroup.add(flapMesh);

  const sealGroup = new THREE.Group();
  sealGroup.position.set(0.0, 0.011, 0.014);
  sealGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.0065, 20), mats.waxSeal));
  for (let b = 0; b < 8; b += 1) {
    const ba = (b / 8) * Math.PI * 2 + 0.2;
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 8, 6), mats.waxSeal);
    lobe.scale.set(1.2, 0.48, 1.0);
    lobe.position.set(Math.cos(ba) * 0.023, -0.0005, Math.sin(ba) * 0.023);
    sealGroup.add(lobe);
  }
  const sealRing = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0018, 8, 20), mats.brass);
  sealRing.rotation.x = Math.PI * 0.5;
  sealRing.position.y = 0.0052;
  const sealEmblem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.0022, 6), mats.brass);
  sealEmblem.position.y = 0.0054;
  sealGroup.add(sealRing, sealEmblem);
  envGroup.add(sealGroup);
  letterGroup.add(envGroup);

  const hitPad = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.14, 0.38),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false })
  );
  hitPad.position.set(0, 0.05, 0);
  hitPad.userData.noShadow = true;
  letterGroup.add(hitPad);

  tagInteractive(letterGroup, "love-letter", "书桌上的火漆纪念信笺");
  group.add(letterGroup);
  registerBoxCollider(-8.28, -6.52, -8.72, -7.18, 2.0, 5.2);
}

function buildSecondFloorMasterSuite(group, mats, hangingPlantAnimList) {
  const y2 = 6.12;

  // Romantic Vintage Dusty-Rose Aubusson Master Rug (4.2m x 3.6m)
  addBox(group, 4.2, 0.015, 3.6, mats.masterRug, -16.8, y2 + 0.008, -6.8);

  // Carved French Walnut & Brass Four-Poster Sheer-Canopy Bed (-16.8, 6.12, -7.45)
  const bed = new THREE.Group();
  bed.position.set(-16.8, y2, -7.45);
  addBox(bed, 2.18, 0.30, 2.28, mats.walnut, 0, 0.22, 0);
  // Scalloped Tufted Dusty-Rose Velvet Headboard
  addBox(bed, 2.14, 1.18, 0.14, mats.deepRoseVelvet, 0, 0.82, -1.08);
  const hbArch = new THREE.Mesh(new THREE.CylinderGeometry(1.07, 1.07, 0.14, 20, 1, false, 0, Math.PI), mats.deepRoseVelvet);
  hbArch.rotation.z = -Math.PI * 0.5;
  hbArch.rotation.y = Math.PI * 0.5;
  hbArch.position.set(0, 1.41, -1.08);
  bed.add(hbArch);

  // Mattress + Dusty-Rose Velvet Quilted Coverlet + Sage-Green Silk Throw & Bolster Pillows
  addBox(bed, 2.04, 0.24, 2.12, mats.ivoryLinen, 0, 0.48, 0.02);
  addBox(bed, 2.08, 0.14, 1.56, mats.dustyRoseVelvet, 0, 0.62, 0.30);
  addBox(bed, 2.10, 0.08, 0.44, mats.sageVelvet, 0, 0.68, 0.84);
  addBox(bed, 2.09, 0.07, 0.42, mats.blushSilk, 0, 0.67, -0.38);
  addBox(bed, 0.80, 0.22, 0.34, mats.ivoryLinen, -0.48, 0.72, -0.78, 0.05);
  addBox(bed, 0.80, 0.22, 0.34, mats.ivoryLinen, 0.48, 0.72, -0.78, -0.05);
  addBox(bed, 0.56, 0.20, 0.24, mats.sageVelvet, -0.44, 0.74, -0.52, 0.08);
  addBox(bed, 0.56, 0.20, 0.24, mats.dustyRoseVelvet, 0.44, 0.74, -0.52, -0.08);

  // 4 Turned Walnut & Brass Canopy Posts + Tester Frame + Flowing Sheer Canopy Curtains
  const postH = 2.48;
  for (const [px, pz] of [[-1.06, -1.08], [1.06, -1.08], [-1.06, 1.08], [1.06, 1.08]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.046, postH, 12), mats.walnut);
    p.position.set(px, postH * 0.5, pz);
    bed.add(p);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), mats.brass);
    finial.position.set(px, postH + 0.04, pz);
    bed.add(finial);
    const drape = createPleatedCurtain(mats.sheerCurtain, 0.48, postH - 0.18);
    drape.position.set(px * 0.88, postH - 0.04, pz);
    bed.add(drape);
  }
  addBox(bed, 2.18, 0.045, 0.045, mats.brass, 0, postH, -1.08);
  addBox(bed, 2.18, 0.045, 0.045, mats.brass, 0, postH, 1.08);
  addBox(bed, 0.045, 0.045, 2.18, mats.brass, -1.06, postH, 0);
  addBox(bed, 0.045, 0.045, 2.18, mats.brass, 1.06, postH, 0);
  // Sheer Canopy Roof Voile
  const testerVoile = new THREE.Mesh(new THREE.PlaneGeometry(2.08, 2.12), mats.sheerCurtain);
  testerVoile.rotation.x = Math.PI * 0.5;
  testerVoile.position.set(0, postH - 0.02, 0);
  bed.add(testerVoile);

  // Carved Tufted Bench at Foot of Bed
  addBox(bed, 1.58, 0.14, 0.46, mats.sageVelvet, 0, 0.42, 1.42);
  for (const [bx, bz] of [[-0.68, 1.26], [0.68, 1.26], [-0.68, 1.58], [0.68, 1.58]]) {
    addBox(bed, 0.045, 0.34, 0.045, mats.walnut, bx, 0.18, bz);
  }
  group.add(bed);
  registerBoxCollider(-17.95, -15.65, -8.68, -5.75, 5.4, 9.8);

  // Flanking Vintage Nightstands + Pleated Blush Brass Lamps
  for (const nx of [-18.42, -15.18]) {
    addBox(group, 0.56, 0.56, 0.46, mats.creamMolding, nx, y2 + 0.28, -8.35);
    addBox(group, 0.58, 0.03, 0.48, mats.marble, nx, y2 + 0.575, -8.35);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 12), mats.brass);
    base.position.set(nx, y2 + 0.70, -8.35);
    group.add(base);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.18, 0.20, 16, 1, true), mats.warmShade);
    shade.position.set(nx, y2 + 0.88, -8.35);
    group.add(shade);
  }
  addRoseArrangement(group, mats, -15.18, y2 + 0.59, -8.18, 0.76, true);

  // Arched Gilt-Brass Vintage Dressing Vanity + Dusty-Rose Pouf near West Sea Window (-22.65, 6.12, -0.3)
  addBox(group, 0.54, 0.12, 1.28, mats.creamMolding, -22.65, y2 + 0.74, -0.3);
  addBox(group, 0.56, 0.03, 1.32, mats.marble, -22.65, y2 + 0.815, -0.3);
  for (const [vx, vz] of [[-0.20, -0.56], [0.20, -0.56], [-0.20, 0.56], [0.20, 0.56]]) {
    addBox(group, 0.042, 0.70, 0.042, mats.creamMolding, -22.65 + vx, y2 + 0.35, -0.3 + vz);
  }
  const vFrame = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.05, 20), mats.brass);
  vFrame.rotation.z = Math.PI * 0.5;
  vFrame.position.set(-22.88, y2 + 1.22, -0.3);
  group.add(vFrame);
  const vMir = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.055, 20), mats.mirrorSilver);
  vMir.rotation.z = Math.PI * 0.5;
  vMir.position.set(-22.87, y2 + 1.22, -0.3);
  group.add(vMir);
  const pouf = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.42, 16), mats.dustyRoseVelvet);
  pouf.position.set(-22.05, y2 + 0.21, -0.3);
  group.add(pouf);
  registerBoxCollider(-23.1, -21.8, -1.0, 0.4, 5.4, 9.8);

  // Vintage Celadon-Sage Painted French Armoire (-12.55, 6.12, -8.95) + Trailing Ivy + Framed Floral Painting
  addBox(group, 1.56, 2.38, 0.58, mats.boiserieSage, -12.55, y2 + 1.19, -9.05);
  addBox(group, 1.66, 0.10, 0.64, mats.creamMolding, -12.55, y2 + 2.42, -9.05);
  addBox(group, 0.64, 1.92, 0.03, mats.boiserieRose, -12.92, y2 + 1.20, -8.75);
  addBox(group, 0.64, 1.92, 0.03, mats.boiserieRose, -12.18, y2 + 1.20, -8.75);
  addTrailingVine(group, mats, -12.55, y2 + 2.45, -8.72, 1.3, 6, 1);
  registerBoxCollider(-13.4, -11.7, -9.4, -8.65, 5.4, 9.8);

  addBox(group, 1.24, 0.92, 0.05, mats.brass, -13.2, y2 + 1.78, -2.9);
  addBox(group, 1.12, 0.80, 0.055, mats.paintingMaster, -13.2, y2 + 1.78, -2.9);
  // Note: Framed painting mounted on East wall (-11.35, Z = -2.9)
  group.children[group.children.length - 2].position.set(-11.35, y2 + 1.78, -2.9);
  group.children[group.children.length - 2].rotation.y = -Math.PI * 0.5;
  group.children[group.children.length - 1].position.set(-11.36, y2 + 1.78, -2.9);
  group.children[group.children.length - 1].rotation.y = -Math.PI * 0.5;

  // Sea-View Vintage Sage Velvet Reading Chaise near South Balcony Doors (-19.6, 6.12, +2.35)
  const chaise = new THREE.Group();
  chaise.position.set(-19.6, y2, 2.35);
  chaise.rotation.y = 2.45;
  addBox(chaise, 0.82, 0.30, 1.56, mats.sageVelvet, 0, 0.26, 0);
  addBox(chaise, 0.82, 0.56, 0.18, mats.sageVelvet, 0, 0.58, -0.68);
  addBox(chaise, 0.44, 0.30, 0.14, mats.dustyRoseVelvet, 0, 0.52, -0.48);
  group.add(chaise);
  registerBoxCollider(-20.4, -18.8, 1.55, 3.15, 5.4, 9.8);

  // 2F Chandelier + Wrought-Iron Flower Stands + Hanging Spider Plants (吊兰) + Blooming Planters
  addCrystalBrassChandelier(group, mats, -16.8, 9.38, -2.8, 6, 0.86);
  addVintagePlantStand(group, mats, -12.05, y2, 3.15, -0.65);
  registerCircleCollider(-12.05, 3.15, 0.36, 5.4, 9.8);
  addVintagePlantStand(group, mats, -19.45, y2, -3.55, 0.35);
  registerCircleCollider(-19.45, -3.55, 0.36, 5.4, 9.8);
  addFloweringPlanter(group, mats, -14.35, y2, -7.65, { potStyle: "rose", flowerType: "hydrangeaPink", scale: 1.18, glbTag: "isIndoorGLBRosePot" });
  addFloweringPlanter(group, mats, -15.7, y2, 3.35, { potStyle: "rose", flowerType: "hydrangeaPink", scale: 1.2, glbTag: "isIndoorGLBRosePot" });
  addFloweringPlanter(group, mats, -22.5, y2, 3.25, { potStyle: "celadon", flowerType: "hydrangeaLilac", scale: 1.15, glbTag: "isIndoorGLBFernPot" });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -15.0, 9.18, -4.35, { drop: 0.76, scale: 1.06, rosePot: true });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -19.4, 9.18, -5.25, { drop: 0.72, scale: 1.02, rosePot: false });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -19.8, 9.22, 3.15, { drop: 0.72, scale: 1.04, rosePot: true });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -12.2, 9.22, 0.2, { drop: 0.68, scale: 1.0, rosePot: false });
}

export function buildCoastalVilla() {
  const group = new THREE.Group();
  group.name = "coastal-villa";

  const mats = createVillaMaterials();
  const curtainAnimList = [];
  const hangingPlantAnimList = [];
  const emberState = { mesh: null };

  buildPlinthTerracesAndWalkZones(group, mats);
  buildTwoStoryPetiteVillaShell(group, mats, curtainAnimList, hangingPlantAnimList);
  buildVintageSalonDiningKitchen(group, mats, emberState, hangingPlantAnimList);
  buildConservatoryStudyAndLetter(group, mats, hangingPlantAnimList);
  buildSecondFloorMasterSuite(group, mats, hangingPlantAnimList);

  // Warm Vintage Interior Lighting (1F Grand Salon/Study + 2F Canopy Master Suite, zero shadow cost)
  const villa1FLight = new THREE.PointLight(0xffdfba, 4.8, 25.0, 1.35);
  villa1FLight.position.set(-14.2, 5.35, -2.2);
  villa1FLight.castShadow = false;
  group.add(villa1FLight);

  const villa2FLight = new THREE.PointLight(0xffd8cf, 3.8, 19.0, 1.35);
  villa2FLight.position.set(-16.8, 8.65, -3.2);
  villa2FLight.castShadow = false;
  group.add(villa2FLight);

  enablePBRShadows(group, { cast: true, receive: true, minRadius: 0.22 });
  for (let i = 0; i < hangingPlantAnimList.length; i += 1) {
    batchStaticMeshesByMaterial(hangingPlantAnimList[i].mesh, { spatialBucketSize: 0 });
  }
  const villaSkip = new Set([
    ...curtainAnimList.map((c) => c.mesh),
    ...hangingPlantAnimList.map((h) => h.mesh),
  ]);
  if (emberState.mesh) villaSkip.add(emberState.mesh);
  batchStaticMeshesByMaterial(group, { skipSet: villaSkip, spatialBucketSize: 48 });

  let nightMix = 0.0;

  function applyInteriorMotion(elapsed) {
    for (let i = 0; i < curtainAnimList.length; i += 1) {
      const item = curtainAnimList[i];
      const sway =
        Math.sin(elapsed * 1.15 + item.phase) * 0.026 +
        Math.sin(elapsed * 2.05 + item.phase * 1.7) * 0.009;
      item.mesh.rotation.x = sway;
      item.mesh.rotation.z = sway * 0.45;
    }
    for (let i = 0; i < hangingPlantAnimList.length; i += 1) {
      const hp = hangingPlantAnimList[i];
      hp.mesh.rotation.x = Math.sin(elapsed * 0.95 + hp.phase) * 0.024;
      hp.mesh.rotation.z = Math.cos(elapsed * 0.82 + hp.phase * 1.3) * 0.022;
    }
    const flicker =
      1.0 +
      0.16 * Math.sin(elapsed * 6.3) +
      0.10 * Math.sin(elapsed * 13.7 + 1.2) +
      0.06 * Math.cos(elapsed * 21.1);
    if (emberState.mesh) {
      mats.emberGlow.emissiveIntensity = lerp(1.8, 2.6, nightMix) * flicker;
    }
  }
  applyInteriorMotion(0.0);

  return {
    group,
    letterWorldPos: new THREE.Vector3(-7.40, 3.40, -8.17),
    update(elapsed) {
      applyInteriorMotion(elapsed);
    },
    setNightMix(mix) {
      nightMix = clamp(mix, 0, 1);
      villa1FLight.intensity = lerp(4.8, 9.2, nightMix);
      villa2FLight.intensity = lerp(3.6, 7.4, nightMix);
      mats.glass.emissiveIntensity = lerp(0.05, 0.82, nightMix);
      mats.glass.opacity = lerp(0.22, 0.44, nightMix);
      mats.warmShade.emissiveIntensity = lerp(0.72, 2.4, nightMix);
      mats.opalGlow.emissiveIntensity = lerp(1.05, 2.9, nightMix);
      mats.roseCrystal.emissiveIntensity = lerp(0.42, 1.45, nightMix);
      mats.ceilPlaster.emissiveIntensity = lerp(0.34, 0.52, nightMix);
    },
    reset() {
      applyInteriorMotion(0.0);
    },
    anchors: {
      entranceOutside: [-14.0, 2.20, 10.6],
      livingRoom: [-16.2, 2.60, 1.2],
      masterBedroom: [-14.6, 6.12, -2.4],
      studyRoom: [-8.3, 2.60, -5.8],
    },
  };
}
