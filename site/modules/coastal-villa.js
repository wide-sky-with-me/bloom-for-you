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
import {
  createPillowedCushionGeo,
  buildButtonTuftedChesterfieldSofa,
  buildVictorHornGramophone,
  buildSmegRetroFridge,
  buildLaCornueChateauRangeAndHood,
  buildFarmhouseSinkAndBridgeFaucet,
  buildThonetBentwoodCounterStool,
  buildLouisXVIDiningSuite,
  buildFrenchFireplaceAndMantel,
  buildBureauPlatDeskAndEmeraliteLamp,
  buildAcousticParlorGuitarOnStand,
  buildFourPosterCanopyBed,
  buildPorcelainTableLamp,
} from "./vintage-craft-props.js";

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
  const potPts = [
    new THREE.Vector2(0.001, 0.018),
    new THREE.Vector2(0.095, 0.018),
    new THREE.Vector2(0.112, 0.055),
    new THREE.Vector2(0.148, 0.145),
    new THREE.Vector2(0.156, 0.225),
    new THREE.Vector2(0.166, 0.246),
    new THREE.Vector2(0.152, 0.260),
    new THREE.Vector2(0.136, 0.248),
  ];
  const pot = new THREE.Mesh(new THREE.LatheGeometry(potPts, 18), potMat);
  g.add(pot);
  const saucerPts = [
    new THREE.Vector2(0.001, 0.0),
    new THREE.Vector2(0.112, 0.0),
    new THREE.Vector2(0.138, 0.022),
    new THREE.Vector2(0.132, 0.028),
    new THREE.Vector2(0.105, 0.014),
  ];
  const saucer = new THREE.Mesh(new THREE.LatheGeometry(saucerPts, 18), mats.brass);
  g.add(saucer);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.140, 0.136, 0.02, 14), mats.soilDark);
  soil.position.y = potH - 0.016;
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

  // 3 S-Scrolled Wrought-Iron Tripod Legs + Brass Ball Feet & Finials
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + 0.35;
    const legCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * 0.28, 0.02, Math.sin(a) * 0.28),
      new THREE.Vector3(Math.cos(a) * 0.22, 0.34, Math.sin(a) * 0.22),
      new THREE.Vector3(Math.cos(a) * 0.16, 0.68, Math.sin(a) * 0.16),
      new THREE.Vector3(Math.cos(a) * 0.19, 0.94, Math.sin(a) * 0.19),
    ]);
    st.add(new THREE.Mesh(new THREE.TubeGeometry(legCurve, 16, 0.011, 8, false), mats.wroughtIron));
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), mats.brass);
    foot.position.set(Math.cos(a) * 0.28, 0.02, Math.sin(a) * 0.28);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), mats.brass);
    finial.position.set(Math.cos(a) * 0.19, 0.95, Math.sin(a) * 0.19);
    st.add(foot, finial);
  }

  const tiers = [
    [0, 0.22, 0.12, "rose", "hydrangeaPink", "isIndoorGLBPeriwinklePot"],
    [-0.14, 0.56, -0.04, "celadon", "hydrangeaLilac", "isIndoorGLBFernPot"],
    [0.14, 0.88, -0.06, "ivory", "orchid", "isIndoorGLBMargaritaPot"],
  ];
  for (const [tx, ty, tz, pStyle, fType, tag] of tiers) {
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.175, 0.018, 20), mats.brass);
    tray.position.set(tx, ty, tz);
    st.add(tray);
    const gallery = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.008, 8, 22), mats.brass);
    gallery.rotation.x = Math.PI * 0.5;
    gallery.position.set(tx, ty + 0.018, tz);
    st.add(gallery);
    addFloweringPlanter(st, mats, tx, ty + 0.010, tz, {
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

  // Turned French Porcelain Baluster Vase + Gilt Collar & Foot Ring
  const vasePts = [
    new THREE.Vector2(0.001, 0.0),
    new THREE.Vector2(0.058, 0.0),
    new THREE.Vector2(0.046, 0.025),
    new THREE.Vector2(0.088, 0.095),
    new THREE.Vector2(0.078, 0.155),
    new THREE.Vector2(0.052, 0.188),
    new THREE.Vector2(0.068, 0.212),
    new THREE.Vector2(0.058, 0.205),
  ];
  const vase = new THREE.Mesh(
    new THREE.LatheGeometry(vasePts, 20),
    roseVase ? mats.retroRosePorcelain : mats.celadonGlaze
  );
  g.add(vase);
  const goldRim = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.006, 6, 18), mats.brass);
  goldRim.rotation.x = Math.PI * 0.5;
  goldRim.position.y = 0.211;
  const footRim = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.005, 6, 18), mats.brass);
  footRim.rotation.x = Math.PI * 0.5;
  footRim.position.y = 0.006;
  g.add(goldRim, footRim);

  const bouquet = createRoseBouquet({ count: 7, scale: 0.9 });
  bouquet.position.y = 0.04;
  g.add(bouquet);
  g.userData.isHeroRoseVase = true;

  parent.add(g);
  return g;
}

// Carved Plaster Ceiling Medallion Rose & Brass Hook for Photogrammetry Crystal Chandelier (ph_chandelier.glb)
function addCeilingMedallion(parent, mats, x, ceilingY, z) {
  const med = new THREE.Group();
  med.position.set(x, ceilingY, z);
  const outerRing = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.026, 24), mats.creamMolding);
  outerRing.position.y = -0.013;
  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.016, 8, 22), mats.creamMolding);
  innerRing.rotation.x = Math.PI * 0.5;
  innerRing.position.y = -0.026;
  const brassEscutcheon = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.035, 16), mats.brass);
  brassEscutcheon.position.y = -0.022;
  med.add(outerRing, innerRing, brassEscutcheon);
  parent.add(med);
  return med;
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
  // Courtyard Slatted Teak & Iron Bistro Set (ph_bistro_set.glb + ph_tea_set.glb + ph_watering_can.glb)
  addRoseArrangement(group, mats, -7.24, 3.376, 3.66, 0.74, true);
  registerBoxCollider(-8.45, -6.35, 2.85, 4.75, 2.0, 5.0);
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
  addRoseArrangement(group, mats, -7.36, 6.888, -5.52, 0.70, false);
  registerBoxCollider(-8.35, -6.65, -6.4, -4.4, 5.4, 9.8);
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
  // Carved French Bolection Limestone & Marble Mantelpiece + Brass Andirons & Spark Screen
  const fireplace = buildFrenchFireplaceAndMantel(mats, emberState);
  fireplace.position.set(-18.4, 2.60, -2.74);
  group.add(fireplace);

  // Pair of Turned Gilt-Brass Candlesticks on Mantel Shelf (ph_ornate_mirror & ph_mantel_clock sit between them!)
  const stickPts = [
    new THREE.Vector2(0.001, 0.0),
    new THREE.Vector2(0.055, 0.0),
    new THREE.Vector2(0.042, 0.025),
    new THREE.Vector2(0.018, 0.065),
    new THREE.Vector2(0.028, 0.125),
    new THREE.Vector2(0.014, 0.185),
    new THREE.Vector2(0.036, 0.215),
    new THREE.Vector2(0.022, 0.225),
  ];
  const stickGeo = new THREE.LatheGeometry(stickPts, 16);
  for (const cx of [-19.34, -17.46]) {
    const cStick = new THREE.Mesh(stickGeo, mats.brass);
    cStick.position.set(cx, 4.158, -2.64);
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.11, 10), mats.ivoryLinen);
    candle.position.set(cx, 4.275, -2.64);
    const cBulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), mats.opalGlow);
    cBulb.scale.set(0.72, 1.45, 0.72);
    cBulb.position.set(cx, 4.35, -2.64);
    cBulb.userData.noShadow = true;
    group.add(cStick, candle, cBulb);
  }
  addTrailingVine(group, mats, -18.4, 4.15, -2.37, 1.85, 9, 1);
  registerBoxCollider(-19.72, -17.08, -3.05, -2.12, 2.0, 5.2);

  // French Aubusson Rose-Medallion Rug (4.4m x 3.2m)
  addBox(group, 4.4, 0.015, 3.2, mats.livingRug, -18.9, 2.608, 0.65);

  // Button-Tufted Dusty-Rose Velvet Chesterfield Sofa (Capitonné) facing Fireplace & Coffee Table
  const sofa = buildButtonTuftedChesterfieldSofa(mats);
  sofa.position.set(-18.8, 2.60, 2.18);
  sofa.rotation.y = Math.PI;
  group.add(sofa);
  registerBoxCollider(-20.32, -17.28, 1.64, 2.68, 2.0, 5.2);

  // Colliders for Photogrammetry Louis XV Armchairs (ph_green_chair & ph_armchair) + West Wall Console (ph_console)
  registerCircleCollider(-20.68, 0.44, 0.44, 2.0, 5.2);
  registerCircleCollider(-16.92, 0.46, 0.46, 2.0, 5.2);
  registerBoxCollider(-23.32, -22.58, -2.30, -0.80, 2.0, 5.2);

  // Coffee Table Centerpiece & Clothbound Art Book resting atop Photogrammetry ph_coffee_table.glb (top Y = 3.125m)
  const artBook = new THREE.Mesh(createPillowedCushionGeo(0.32, 0.038, 0.24, 0.012, 0.002), mats.deepRoseVelvet);
  artBook.position.set(-19.24, 3.144, 0.46);
  artBook.rotation.y = 0.16;
  group.add(artBook);
  addRoseArrangement(group, mats, -18.38, 3.125, 0.62, 0.92, true);
  registerBoxCollider(-19.60, -18.00, 0.08, 1.08, 2.0, 5.2);

  // Antique 1905 Victor Monarch Horn Gramophone with 10-Petal Scalloped Brass Horn (-16.55, 2.60, -2.15)
  const gramophone = buildVictorHornGramophone(mats);
  gramophone.position.set(-16.55, 2.60, -2.15);
  gramophone.rotation.y = 0.38;
  group.add(gramophone);
  registerCircleCollider(-16.55, -2.15, 0.34, 2.0, 5.2);

  // Salon Ceiling Medallion (for ph_chandelier.glb) + Scrolled Plant Stand + Spider Plants + Blooming Pots
  addCeilingMedallion(group, mats, -18.8, 5.98, 0.65);
  addVintagePlantStand(group, mats, -22.45, 2.60, 3.15, 0.65);
  registerCircleCollider(-22.45, 3.15, 0.36, 2.0, 5.2);
  addFloweringPlanter(group, mats, -16.4, 2.60, 3.35, { potStyle: "rose", flowerType: "hydrangeaPink", scale: 1.25, glbTag: "isIndoorGLBRosePot" });
  addFloweringPlanter(group, mats, -21.95, 2.60, 2.45, { potStyle: "rose", flowerType: "hydrangeaBlush", scale: 1.15, glbTag: "isIndoorGLBMargaritaPot" });
  addFloweringPlanter(group, mats, -17.15, 2.66, -2.35, { potStyle: "celadon", flowerType: "hydrangeaLilac", scale: 1.08, glbTag: "isIndoorGLBFernPot" });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -16.6, 5.82, 0.72, { drop: 0.78, scale: 1.08, rosePot: true });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -19.2, 5.82, -0.65, { drop: 0.72, scale: 1.02, rosePot: false });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -21.2, 5.86, 3.25, { drop: 0.70, scale: 1.05, rosePot: true });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -17.9, 5.86, 3.25, { drop: 0.66, scale: 1.0, rosePot: false });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -22.6, 5.86, -1.65, { drop: 0.74, scale: 1.02, rosePot: true });

  // --- 2. VINTAGE FRENCH DINING HALL (X = -12.65, Z = +1.15, overlooking SE Garden Courtyard) ---
  const diningSuite = buildLouisXVIDiningSuite(mats);
  diningSuite.position.set(-12.65, 2.60, 1.15);
  group.add(diningSuite);
  addRoseArrangement(group, mats, -13.06, 3.386, 1.15, 0.92, false);
  registerBoxCollider(-13.85, -11.45, 0.35, 1.95, 2.0, 5.2);
  addCeilingMedallion(group, mats, -12.65, 5.98, 1.15);
  addFloweringPlanter(group, mats, -11.15, 2.60, 3.35, { potStyle: "celadon", flowerType: "hydrangeaBlush", scale: 1.18, glbTag: "isIndoorGLBMargaritaPot" });

  // --- 3. RETRO FRENCH SAGE-GREEN & DUSTY-ROSE COUNTRY KITCHEN (X in [-19.4, -10.8], Z in [-9.6, -4.8]) ---
  // Smeg FAB28 Retro Rounded Mint-Sage Refrigerator (-18.75, 2.60, -9.18)
  const smegFridge = buildSmegRetroFridge(mats);
  smegFridge.position.set(-18.75, 2.60, -9.18);
  group.add(smegFridge);

  // Checkered Dusty-Rose Zellige Tile Backsplash across North Wall
  addBox(group, 6.6, 0.96, 0.03, mats.checkeredTile, -14.55, 3.98, -9.62);

  // Left Shaker Base Cabinetry Bank [-17.95, -14.24] + Right Shaker Bank [-12.96, -11.15] (leaving 1.28m bay for La Cornue!)
  addBox(group, 3.71, 0.88, 0.68, mats.boiserieSage, -16.095, 3.04, -9.28);
  addBox(group, 1.81, 0.88, 0.68, mats.boiserieSage, -12.055, 3.04, -9.28);
  // Calacatta Marble Countertops split neatly around Belfast Farmhouse Sink Basin [-16.58, -15.82]
  addBox(group, 1.40, 0.048, 0.74, mats.marble, -17.28, 3.504, -9.26);
  addBox(group, 1.58, 0.048, 0.74, mats.marble, -15.03, 3.504, -9.26);
  addBox(group, 1.85, 0.048, 0.74, mats.marble, -12.04, 3.504, -9.26);

  // Recessed Shaker Cabinet Doors, Top Drawers & Turned Brass Knobs along Base Cabinetry
  const addShakerDoor = (cx, cy, w, h, zFace) => {
    addBox(group, w, h, 0.022, mats.creamMolding, cx, cy, zFace);
    addBox(group, w - 0.09, h - 0.09, 0.026, mats.boiserieSageDeep, cx, cy, zFace + 0.003);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 8), mats.brass);
    knob.position.set(cx + (w > 0.45 ? 0.16 : 0), cy + (h < 0.25 ? 0 : 0.06), zFace + 0.022);
    group.add(knob);
  };
  for (const dx of [-17.62, -16.95, -15.45, -14.68, -12.52, -11.62]) {
    addShakerDoor(dx, 3.36, 0.58, 0.16, -8.93);
    addShakerDoor(dx, 2.94, 0.58, 0.56, -8.93);
  }

  // Glazed Belfast Farmhouse Apron Sink + Brass Bridge Gooseneck Faucet centered under North Window (-16.20, 3.505, -9.26)
  const belfastSink = buildFarmhouseSinkAndBridgeFaucet(mats);
  belfastSink.position.set(-16.20, 3.505, -9.26);
  group.add(belfastSink);
  addShakerDoor(-16.20, 2.86, 0.72, 0.42, -8.93);

  // La Cornue Château 120 Vaulted French Range Cooker + Bell Chimney Hood (-13.60, 2.60, -9.22)
  const laCornue = buildLaCornueChateauRangeAndHood(mats);
  laCornue.position.set(-13.60, 2.60, -9.22);
  group.add(laCornue);

  // Open French Plate-Rack Hutch displaying Turned Limoges Dusty-Rose Plates & Celadon Canisters (-11.95, 4.88, -9.44)
  addBox(group, 1.58, 1.12, 0.34, mats.boiserieSage, -11.95, 4.88, -9.45);
  addBox(group, 1.68, 0.07, 0.40, mats.creamMolding, -11.95, 5.46, -9.44);
  addBox(group, 1.52, 0.03, 0.32, mats.walnut, -11.95, 4.92, -9.43);
  addBox(group, 1.50, 0.016, 0.016, mats.brass, -11.95, 4.74, -9.29);
  const platePts = [
    new THREE.Vector2(0.001, 0.0),
    new THREE.Vector2(0.085, 0.002),
    new THREE.Vector2(0.125, 0.022),
    new THREE.Vector2(0.132, 0.024),
  ];
  const plateGeo = new THREE.LatheGeometry(platePts, 20);
  for (let p = 0; p < 5; p += 1) {
    const plate = new THREE.Mesh(plateGeo, p % 2 === 0 ? mats.retroRosePorcelain : mats.zelligeTile);
    plate.rotation.x = Math.PI * 0.46;
    plate.position.set(-12.51 + p * 0.28, 4.68, -9.38);
    group.add(plate);
  }
  for (let j = 0; j < 3; j += 1) {
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.052, 0.14, 14), j === 1 ? mats.retroRosePorcelain : mats.celadonGlaze);
    jar.position.set(-12.35 + j * 0.36, 5.01, -9.42);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 8), mats.brass);
    lid.scale.set(1, 0.45, 1);
    lid.position.set(-12.35 + j * 0.36, 5.09, -9.42);
    group.add(jar, lid);
  }
  addTrailingVine(group, mats, -11.95, 5.48, -9.24, 1.35, 7, 1);
  registerBoxCollider(-19.3, -11.0, -9.75, -8.82, 2.0, 5.2);

  // Turned-Column Shaker Kitchen Island (-15.0, 2.60, -6.35) + Butcher Block + Overhead Brass Pot Rack + 3 Thonet Bar Stools!
  addBox(group, 2.42, 0.86, 0.88, mats.boiserieSage, -15.0, 3.03, -6.35);
  for (const ix of [-15.82, -15.0, -14.18]) {
    addBox(group, 0.68, 0.62, 0.022, mats.creamMolding, ix, 3.03, -6.80);
    addBox(group, 0.58, 0.52, 0.026, mats.boiserieSageDeep, ix, 3.03, -6.805);
  }
  for (const [cx, cz] of [[-16.22, -6.78], [-13.78, -6.78], [-16.22, -5.92], [-13.78, -5.92]]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.86, 12), mats.creamMolding);
    col.position.set(cx, 3.03, cz);
    group.add(col);
  }
  const islandSlab = new THREE.Mesh(createPillowedCushionGeo(2.68, 0.058, 1.12, 0.035, 0), mats.marble);
  islandSlab.position.set(-15.0, 3.49, -6.35);
  group.add(islandSlab);
  const cuttingBoard = new THREE.Mesh(createPillowedCushionGeo(0.46, 0.032, 0.32, 0.022, 0), mats.walnut);
  cuttingBoard.position.set(-14.28, 3.534, -6.32);
  cuttingBoard.rotation.y = 0.08;
  group.add(cuttingBoard);
  addFloweringPlanter(group, mats, -15.92, 3.52, -6.35, { potStyle: "rose", flowerType: "orchid", scale: 0.78 });

  // Overhead Brass Pot & Spider-Plant Rack (Hammered ph_brass_pan.glb pans hang along front bar!)
  addBox(group, 2.24, 0.032, 0.56, mats.brass, -15.0, 5.18, -6.35);
  for (let b = -4; b <= 4; b += 1) {
    addBox(group, 0.014, 0.018, 0.52, mats.brass, -15.0 + b * 0.24, 5.18, -6.35);
  }
  for (const rx of [-15.92, -14.08]) {
    const rRod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.82, 8), mats.brass);
    rRod.position.set(rx, 5.59, -6.35);
    group.add(rRod);
  }
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -15.82, 5.16, -6.35, { drop: 0.48, scale: 0.88, rosePot: true });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -14.18, 5.16, -6.35, { drop: 0.48, scale: 0.88, rosePot: false });

  // 3 Sculpted French Thonet Bentwood & Velvet Counter Bar Stools facing the Kitchen Island
  const stoolMats = [mats.dustyRoseVelvet, mats.sageVelvet, mats.dustyRoseVelvet];
  [-15.76, -15.0, -14.24].forEach((sx, idx) => {
    const stool = buildThonetBentwoodCounterStool(mats, stoolMats[idx]);
    stool.position.set(sx, 2.60, -5.54);
    stool.rotation.y = Math.PI + (idx - 1) * 0.06;
    group.add(stool);
  });
  registerBoxCollider(-16.38, -13.62, -6.95, -5.32, 2.0, 5.2);
}

function buildConservatoryStudyAndLetter(group, mats, hangingPlantAnimList) {
  // Aubusson Sage-and-Rose Study Rug
  addBox(group, 4.2, 0.014, 3.4, mats.studyRug, -7.25, 2.608, -5.65);

  // Vintage Celadon-Sage Floor-to-Ceiling Library Bookcase at X = -10.02, Z in [-9.45, -6.45]
  // Open-front carcass (back panel + side gables + plinth) so the book spines are visible from the study
  addBox(group, 0.08, 2.86, 2.96, mats.boiserieSage, -10.22, 4.03, -7.95);
  addBox(group, 0.44, 2.86, 0.05, mats.boiserieSage, -10.04, 4.03, -9.405);
  addBox(group, 0.44, 2.86, 0.05, mats.boiserieSage, -10.04, 4.03, -6.495);
  addBox(group, 0.46, 0.08, 2.96, mats.boiserieSage, -10.03, 2.64, -7.95);
  addBox(group, 0.52, 0.09, 3.08, mats.creamMolding, -10.02, 5.48, -7.95);
  for (let s = 0; s < 6; s += 1) {
    addBox(group, 0.46, 0.04, 2.92, mats.walnut, -10.02, 2.66 + s * 0.48, -7.95);
  }
  addTrailingVine(group, mats, -9.82, 5.50, -7.95, 2.4, 8, 1);

  // 84 Varied Clothbound Vintage Books via InstancedMesh
  const rng = mulberry32(8842);
  const bookCount = 300;
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
      const depth = 0.17 + rng() * 0.05;
      dummy.position.set(-10.17 + depth * 0.5, shelfY + bh * 0.5, curZ + thick * 0.5);
      dummy.rotation.set(rng() < 0.06 ? 0.08 : 0, 0, 0);
      dummy.scale.set(depth / 0.22, bh, thick);
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

  // Harbor-View Louis XV Settee (ph_sofa.glb at -4.68, 2.60, -5.85) + Turned Walnut Pedestal Lamp Table (-4.72, 2.60, -4.22)
  const sideTbl = new THREE.Group();
  sideTbl.position.set(-4.72, 2.60, -4.22);
  const tblTop = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.27, 0.032, 22), mats.walnut);
  tblTop.position.y = 0.605;
  const tblStem = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.18, 0),
        new THREE.Vector2(0.16, 0.035),
        new THREE.Vector2(0.045, 0.12),
        new THREE.Vector2(0.036, 0.46),
        new THREE.Vector2(0.075, 0.58),
      ],
      16
    ),
    mats.walnut
  );
  sideTbl.add(tblTop, tblStem);
  group.add(sideTbl);
  registerBoxCollider(-5.35, -4.12, -6.85, -3.88, 2.0, 5.2);

  // French Beechwood Artist Studio Easel + Thumb-Hole Oil Palette + Brush Jar (-5.65, 2.60, -2.55) + Acoustic Guitar on Stand!
  const easel = new THREE.Group();
  easel.position.set(-5.65, 2.60, -2.55);
  easel.rotation.y = -2.45;
  addBox(easel, 0.042, 1.76, 0.042, mats.naturalOak, -0.24, 0.88, 0.08);
  addBox(easel, 0.042, 1.76, 0.042, mats.naturalOak, 0.24, 0.88, 0.08);
  addBox(easel, 0.038, 1.88, 0.045, mats.naturalOak, 0, 0.94, 0.06);
  const rearLeg = addBox(easel, 0.04, 1.68, 0.04, mats.naturalOak, 0, 0.80, -0.26);
  rearLeg.rotation.x = 0.34;
  // Adjustable ratcheted painting shelf + top clamp + framed Monet canvas
  addBox(easel, 0.84, 0.045, 0.16, mats.naturalOak, 0, 0.89, 0.14);
  addBox(easel, 0.16, 0.04, 0.09, mats.brass, 0, 1.55, 0.11);
  addBox(easel, 0.78, 0.62, 0.045, mats.brass, 0, 1.22, 0.11);
  addBox(easel, 0.70, 0.54, 0.052, mats.paintingStudy, 0, 1.22, 0.116);
  // Painter's oval palette + oil pigment dabs + ceramic brush cup on easel shelf
  const pal = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.008, 16), mats.walnut);
  pal.scale.set(1.25, 1, 0.85);
  pal.position.set(-0.22, 0.918, 0.16);
  easel.add(pal);
  const dabMats = [mats.petalPink, mats.sageVelvet, mats.petalBlue, mats.petalWhite, mats.brass];
  for (let d = 0; d < 5; d += 1) {
    const da = -0.6 + d * 0.52;
    const dab = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), dabMats[d]);
    dab.scale.set(1, 0.45, 1);
    dab.position.set(-0.22 + Math.cos(da) * 0.075, 0.924, 0.16 + Math.sin(da) * 0.055);
    easel.add(dab);
  }
  const brushCup = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.085, 12), mats.celadonGlaze);
  brushCup.position.set(0.28, 0.955, 0.15);
  easel.add(brushCup);
  for (let b = 0; b < 4; b += 1) {
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.002, 0.19, 6), mats.walnut);
    br.position.set(0.28 + (b - 1.5) * 0.008, 1.03, 0.15);
    br.rotation.z = (b - 1.5) * 0.11;
    easel.add(br);
  }
  group.add(easel);
  registerCircleCollider(-5.65, -2.55, 0.40, 2.0, 5.2);

  // Sculpted Figure-8 Acoustic Parlor Guitar on Folding Walnut Stand (-4.82, 2.60, -2.85)
  const parlorGuitar = buildAcousticParlorGuitarOnStand(mats);
  parlorGuitar.position.set(-4.82, 2.60, -2.85);
  parlorGuitar.rotation.y = -2.22;
  group.add(parlorGuitar);
  registerCircleCollider(-4.82, -2.85, 0.28, 2.0, 5.2);

  // Conservatory Botanical Abundance: Scrolled Plant Stand + Hanging Spider Plants + Blooming Pots + Ceiling Medallion
  addVintagePlantStand(group, mats, -9.25, 2.60, -2.25, 0.45);
  registerCircleCollider(-9.25, -2.25, 0.36, 2.0, 5.2);
  addFloweringPlanter(group, mats, -4.65, 2.60, -8.85, { potStyle: "celadon", flowerType: "hydrangeaPink", scale: 1.22, glbTag: "isIndoorGLBRosePot" });
  addFloweringPlanter(group, mats, -7.1, 2.60, -2.05, { potStyle: "rose", flowerType: "hydrangeaLilac", scale: 1.15, glbTag: "isIndoorGLBFernPot" });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -8.5, 5.84, -2.25, { drop: 0.66, scale: 1.02, rosePot: false });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -5.8, 5.84, -2.25, { drop: 0.70, scale: 1.0, rosePot: true });
  addHangingSpiderPlant(group, mats, hangingPlantAnimList, -5.2, 5.84, -7.85, { drop: 0.68, scale: 0.98, rosePot: false });
  addCeilingMedallion(group, mats, -7.25, 5.94, -5.4);

  // Hero Louis XVI Bureau Plat Writing Desk + Emeralite Banker's Lamp + Inkwell & Globe (-7.40, 2.60, -8.25)
  // (Paired with Photogrammetry ph_green_chair.glb desk chair at -7.40, 2.60, -7.34!)
  const bureauPlat = buildBureauPlatDeskAndEmeraliteLamp(mats);
  bureauPlat.position.set(-7.40, 2.60, -8.25);
  group.add(bureauPlat);

  addRoseArrangement(group, mats, -6.66, 3.386, -8.45, 0.85, true);

  // Vintage Lacquer & Gold-Nib Fountain Pen beside the Letter
  const penGroup = new THREE.Group();
  penGroup.position.set(-7.12, 3.396, -8.17);
  penGroup.rotation.y = 0.36;
  const penBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.005, 0.14, 10), mats.wroughtIron);
  penBarrel.rotation.z = Math.PI * 0.5;
  const penNib = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.024, 8), mats.brass);
  penNib.rotation.z = -Math.PI * 0.5;
  penNib.position.x = 0.082;
  const penBand = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.008, 10), mats.brass);
  penBand.rotation.z = Math.PI * 0.5;
  penGroup.add(penBarrel, penNib, penBand);
  group.add(penGroup);

  // Interactive Wax-Sealed Cotton-Paper Keepsake Letter (with paper thickness, fold crease, flap & wax seal)
  const letterGroup = new THREE.Group();
  letterGroup.position.set(-7.40, 3.390, -8.17);

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
  registerBoxCollider(-8.32, -6.48, -8.72, -7.02, 2.0, 5.2);
}

function buildSecondFloorMasterSuite(group, mats, hangingPlantAnimList) {
  const y2 = 6.12;

  // Romantic Vintage Dusty-Rose Aubusson Master Rug (4.2m x 3.6m)
  addBox(group, 4.2, 0.015, 3.6, mats.masterRug, -16.8, y2 + 0.008, -6.8);

  // Sculpted French Four-Poster Canopy Bed (Lit à Baldaquin) + Louis XVI Tufted Foot Bench (-16.8, 6.12, -7.45)
  const bed = buildFourPosterCanopyBed(mats, createPleatedCurtain);
  bed.position.set(-16.8, y2, -7.45);
  group.add(bed);
  registerBoxCollider(-17.95, -15.65, -8.68, -5.75, 5.4, 9.8);

  // Porcelain Ginger-Jar Bedside Lamps + Hero Rose Vase resting atop Photogrammetry ph_nightstand.glb (top Y = 6.820m)
  const leftLamp = buildPorcelainTableLamp(mats, false);
  leftLamp.position.set(-18.46, y2 + 0.700, -8.38);
  group.add(leftLamp);
  const rightLamp = buildPorcelainTableLamp(mats, true);
  rightLamp.position.set(-15.14, y2 + 0.700, -8.38);
  group.add(rightLamp);
  addRoseArrangement(group, mats, -15.32, y2 + 0.700, -8.22, 0.74, true);

  // Rococo Dressing Vanity against Solid 2F South Rose-Damask Wall (X = -16.65, Z = +3.55, ph_console.glb + ph_ornate_mirror.glb)
  // Plus Crystal Perfume Flacons on Brass Tray (top Y = 7.012m) & Tufted Velvet Ottoman Pouf
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.012, 18), mats.brass);
  tray.position.set(-16.92, y2 + 0.898, 3.54);
  group.add(tray);
  for (const [fx, fz, fh, fMat] of [
    [-16.96, 3.52, 0.11, mats.roseCrystal],
    [-16.87, 3.57, 0.085, mats.glass],
  ]) {
    const flacon = new THREE.Mesh(createPillowedCushionGeo(0.055, fh, 0.042, 0.012, 0), fMat);
    flacon.position.set(fx, y2 + 0.904 + fh * 0.5, fz);
    const stopper = new THREE.Mesh(new THREE.OctahedronGeometry(0.018, 0), mats.brass);
    stopper.position.set(fx, y2 + 0.912 + fh, fz);
    group.add(flacon, stopper);
  }
  addRoseArrangement(group, mats, -16.32, y2 + 0.892, 3.54, 0.70, true);

  // Button-Tufted Dusty-Rose Velvet Dressing Ottoman Pouf on Turned Walnut Legs (-16.65, 6.12, 2.86)
  const pouf = new THREE.Group();
  pouf.position.set(-16.65, y2, 2.86);
  const poufCush = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.001, 0.22),
        new THREE.Vector2(0.21, 0.22),
        new THREE.Vector2(0.24, 0.31),
        new THREE.Vector2(0.21, 0.42),
        new THREE.Vector2(0.08, 0.44),
        new THREE.Vector2(0.001, 0.43),
      ],
      20
    ),
    mats.dustyRoseVelvet
  );
  pouf.add(poufCush);
  const pBtn = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), mats.brass);
  pBtn.position.y = 0.435;
  pouf.add(pBtn);
  for (let l = 0; l < 4; l += 1) {
    const la = (l / 4) * Math.PI * 2 + Math.PI * 0.25;
    const pLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.014, 0.23, 10), mats.walnut);
    pLeg.position.set(Math.cos(la) * 0.16, 0.115, Math.sin(la) * 0.16);
    pouf.add(pLeg);
  }
  group.add(pouf);
  registerBoxCollider(-17.45, -15.85, 2.60, 3.92, 5.4, 9.8);

  // Sea-View Tea & Reading Nook by 2F West Window (ph_green_chair + ph_armchair + Tripod Walnut Tea Table at -22.05, 6.12, -0.25)
  const teaTbl = new THREE.Group();
  teaTbl.position.set(-22.05, y2, -0.25);
  const ttTop = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.31, 0.032, 24), mats.walnut);
  ttTop.position.y = 0.565;
  const ttRim = new THREE.Mesh(new THREE.TorusGeometry(0.318, 0.006, 6, 24), mats.brass);
  ttRim.rotation.x = Math.PI * 0.5;
  ttRim.position.y = 0.582;
  const ttCol = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.19, 0),
        new THREE.Vector2(0.17, 0.035),
        new THREE.Vector2(0.048, 0.12),
        new THREE.Vector2(0.038, 0.44),
        new THREE.Vector2(0.082, 0.55),
      ],
      18
    ),
    mats.walnut
  );
  teaTbl.add(ttTop, ttRim, ttCol);
  group.add(teaTbl);
  registerBoxCollider(-22.78, -21.45, -1.55, 1.05, 5.4, 9.8);

  // Louis XV Arched-Bonnet Celadon-Sage & Dusty-Rose French Armoire (-12.55, 6.12, -9.05) with Brass Cremone Bolts
  const armX = -12.55;
  const armZ = -9.05;
  for (const [fx, fz] of [[-0.72, -0.24], [0.72, -0.24], [-0.72, 0.24], [0.72, 0.24]]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), mats.walnut);
    foot.scale.set(1, 0.72, 1);
    foot.position.set(armX + fx, y2 + 0.04, armZ + fz);
    group.add(foot);
  }
  addBox(group, 1.64, 0.10, 0.62, mats.creamMolding, armX, y2 + 0.12, armZ);
  addBox(group, 1.56, 2.24, 0.56, mats.boiserieSage, armX, y2 + 1.28, armZ);
  addBox(group, 1.70, 0.11, 0.66, mats.creamMolding, armX, y2 + 2.44, armZ);
  // Arched bonnet pediment crest
  const bonnet = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.62, 20, 1, false, 0, Math.PI), mats.creamMolding);
  bonnet.rotation.set(0, Math.PI * 0.5, -Math.PI * 0.5);
  bonnet.scale.set(1, 1, 0.36);
  bonnet.position.set(armX, y2 + 2.48, armZ);
  group.add(bonnet);
  // Twin recessed boiserie doors + full-height brass cremone bolt rods & handles
  for (const dx of [-0.38, 0.38]) {
    addBox(group, 0.68, 2.02, 0.032, mats.creamMolding, armX + dx, y2 + 1.28, armZ + 0.285);
    addBox(group, 0.56, 1.32, 0.038, mats.boiserieRose, armX + dx, y2 + 1.54, armZ + 0.29);
    addBox(group, 0.56, 0.46, 0.038, mats.boiserieRoseDeep, armX + dx, y2 + 0.56, armZ + 0.29);
  }
  const cremone = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 2.04, 8), mats.brass);
  cremone.position.set(armX, y2 + 1.28, armZ + 0.312);
  const cHandle = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), mats.brass);
  cHandle.scale.set(0.8, 1.4, 0.8);
  cHandle.position.set(armX, y2 + 1.18, armZ + 0.328);
  group.add(cremone, cHandle);
  addTrailingVine(group, mats, armX, y2 + 2.49, armZ + 0.33, 1.35, 6, 1);
  registerBoxCollider(-13.45, -11.65, -9.42, -8.65, 5.4, 9.8);

  // 2F Ceiling Medallion (for ph_chandelier.glb) + Scrolled Flower Stands + Spider Plants + Blooming Planters
  addCeilingMedallion(group, mats, -16.8, 9.38, -2.8);
  addVintagePlantStand(group, mats, -12.05, y2, 3.15, -0.65);
  registerCircleCollider(-12.05, 3.15, 0.36, 5.4, 9.8);
  addVintagePlantStand(group, mats, -19.45, y2, -3.55, 0.35);
  registerCircleCollider(-19.45, -3.55, 0.36, 5.4, 9.8);
  addFloweringPlanter(group, mats, -14.35, y2, -7.65, { potStyle: "rose", flowerType: "hydrangeaPink", scale: 1.18, glbTag: "isIndoorGLBRosePot" });
  addFloweringPlanter(group, mats, -15.35, y2, 3.35, { potStyle: "rose", flowerType: "hydrangeaPink", scale: 1.15, glbTag: "isIndoorGLBRosePot" });
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
