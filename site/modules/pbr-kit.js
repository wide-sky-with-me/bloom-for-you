// Physically-Based Realistic Material, Procedural Normal/Roughness Texture,
// Unified 260m x 260m Coastal Peninsula Elevation, Walkable Surface & Collision Kit.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export { THREE, mergeGeometries };

export const clamp = THREE.MathUtils.clamp;
export const lerp = THREE.MathUtils.lerp;

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// High-Resolution Procedural Canvas & Tangent-Space Normal Map Generators
// ---------------------------------------------------------------------------

export function makeCanvasTex(width, height, drawFn, opts = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  drawFn(ctx, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.wrapS = opts.wrapS || THREE.RepeatWrapping;
  tex.wrapT = opts.wrapT || THREE.RepeatWrapping;
  if (opts.repeatX || opts.repeatY) {
    tex.repeat.set(opts.repeatX || 1, opts.repeatY || 1);
  }
  tex.anisotropy = opts.anisotropy || 8;
  tex.needsUpdate = true;
  return tex;
}

// Converts a grayscale height canvas into a true tangent-space RGB normal map.
export function makeNormalTex(width, height, drawHeightFn, opts = {}) {
  const hCanvas = document.createElement("canvas");
  hCanvas.width = width;
  hCanvas.height = height;
  const hCtx = hCanvas.getContext("2d");
  drawHeightFn(hCtx, width, height);
  const src = hCtx.getImageData(0, 0, width, height).data;

  const nCanvas = document.createElement("canvas");
  nCanvas.width = width;
  nCanvas.height = height;
  const nCtx = nCanvas.getContext("2d");
  const dstImg = nCtx.createImageData(width, height);
  const dst = dstImg.data;
  const strength = opts.strength !== undefined ? opts.strength : 2.6;

  const sampleH = (x, y) => {
    const wx = ((x % width) + width) % width;
    const wy = ((y % height) + height) % height;
    return src[(wy * width + wx) * 4] / 255.0;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const hL = sampleH(x - 1, y);
      const hR = sampleH(x + 1, y);
      const hU = sampleH(x, y - 1);
      const hD = sampleH(x, y + 1);
      let nx = (hL - hR) * strength;
      let ny = (hU - hD) * strength;
      let nz = 1.0;
      const invLen = 1.0 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;
      const idx = (y * width + x) * 4;
      dst[idx + 0] = Math.round((nx * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      dst[idx + 3] = 255;
    }
  }
  nCtx.putImageData(dstImg, 0, 0);

  const tex = new THREE.CanvasTexture(nCanvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (opts.repeatX || opts.repeatY) {
    tex.repeat.set(opts.repeatX || 1, opts.repeatY || 1);
  }
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// Shared cached procedural PBR texture sets so multiple modules reuse GPU memory cleanly
const _texCache = new Map();

function cachedPair(key, builder) {
  if (!_texCache.has(key)) {
    _texCache.set(key, builder());
  }
  return _texCache.get(key);
}

export function getPlasterTextures(repeatX = 4, repeatY = 4) {
  const base = cachedPair("plaster", () => {
    const rng = mulberry32(4101);
    const map = makeCanvasTex(256, 256, (ctx, w, h) => {
      ctx.fillStyle = "#f4efe6";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2400; i += 1) {
        const v = 232 + Math.floor(rng() * 20);
        ctx.fillStyle = `rgba(${v},${v - 3},${v - 9},0.26)`;
        ctx.fillRect(rng() * w, rng() * h, 2 + rng() * 5, 2 + rng() * 5);
      }
    });
    const normalMap = makeNormalTex(256, 256, (ctx, w, h) => {
      const r2 = mulberry32(4102);
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i += 1) {
        const g = Math.floor(108 + r2() * 40);
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.fillRect(r2() * w, r2() * h, 2 + r2() * 6, 2 + r2() * 6);
      }
    }, { strength: 1.35 });
    return { map, normalMap };
  });
  const map = base.map.clone();
  const normalMap = base.normalMap.clone();
  map.repeat.set(repeatX, repeatY);
  normalMap.repeat.set(repeatX, repeatY);
  map.needsUpdate = true;
  normalMap.needsUpdate = true;
  return { map, normalMap };
}

export function getStoneAshlarTextures(repeatX = 4, repeatY = 2) {
  const base = cachedPair("ashlar", () => {
    const drawBlocks = (ctx, w, h, isHeight) => {
      const rng = mulberry32(5201);
      ctx.fillStyle = isHeight ? "#363636" : "#aba395";
      ctx.fillRect(0, 0, w, h);
      const rows = 8;
      const rowH = h / rows;
      for (let r = 0; r < rows; r += 1) {
        const cols = 4 + (r % 2);
        const colW = w / cols;
        const off = (r % 2) * (colW * 0.45);
        for (let c = -1; c <= cols; c += 1) {
          const x = c * colW + off;
          const y = r * rowH;
          if (isHeight) {
            const hv = 185 + Math.floor(rng() * 55);
            ctx.fillStyle = `rgb(${hv},${hv},${hv})`;
            ctx.fillRect(x + 2.5, y + 2.5, colW - 5, rowH - 5);
          } else {
            const baseL = 186 + Math.floor(rng() * 34);
            ctx.fillStyle = `rgb(${baseL},${baseL - 5},${baseL - 14})`;
            ctx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);
            for (let s = 0; s < 18; s += 1) {
              const sp = 160 + Math.floor(rng() * 60);
              ctx.fillStyle = `rgba(${sp},${sp - 4},${sp - 10},0.22)`;
              ctx.fillRect(x + 3 + rng() * (colW - 8), y + 3 + rng() * (rowH - 8), 4, 3);
            }
          }
        }
      }
    };
    const map = makeCanvasTex(512, 512, (ctx, w, h) => drawBlocks(ctx, w, h, false));
    const normalMap = makeNormalTex(512, 512, (ctx, w, h) => drawBlocks(ctx, w, h, true), {
      strength: 3.1,
    });
    return { map, normalMap };
  });
  const map = base.map.clone();
  const normalMap = base.normalMap.clone();
  map.repeat.set(repeatX, repeatY);
  normalMap.repeat.set(repeatX, repeatY);
  map.needsUpdate = true;
  normalMap.needsUpdate = true;
  return { map, normalMap };
}

export function getOakParquetTextures(repeatX = 6, repeatY = 5) {
  const base = cachedPair("parquet", () => {
    const drawPlanks = (ctx, w, h, isHeight) => {
      const rng = mulberry32(6301);
      ctx.fillStyle = isHeight ? "#525252" : "#7c5838";
      ctx.fillRect(0, 0, w, h);
      const rows = 12;
      const rowH = h / rows;
      for (let r = 0; r < rows; r += 1) {
        const cols = 4;
        const colW = w / cols;
        const shift = (r % 3) * (colW * 0.34);
        for (let c = -1; c <= cols; c += 1) {
          const x = c * colW + shift;
          const y = r * rowH;
          if (isHeight) {
            const hv = 212 + Math.floor(rng() * 34);
            ctx.fillStyle = `rgb(${hv},${hv},${hv})`;
            ctx.fillRect(x + 1.5, y + 1.5, colW - 3, rowH - 3);
          } else {
            const rCol = 186 + Math.floor(rng() * 32);
            const gCol = 140 + Math.floor(rng() * 26);
            const bCol = 96 + Math.floor(rng() * 20);
            ctx.fillStyle = `rgb(${rCol},${gCol},${bCol})`;
            ctx.fillRect(x + 1.2, y + 1.2, colW - 2.4, rowH - 2.4);
            ctx.strokeStyle = "rgba(92,58,32,0.18)";
            ctx.lineWidth = 1;
            for (let g = 0; g < 6; g += 1) {
              const gy = y + 3 + rng() * (rowH - 6);
              ctx.beginPath();
              ctx.moveTo(x + 2, gy);
              ctx.lineTo(x + colW - 2, gy + (rng() - 0.5) * 3);
              ctx.stroke();
            }
          }
        }
      }
    };
    const map = makeCanvasTex(512, 512, (ctx, w, h) => drawPlanks(ctx, w, h, false));
    const normalMap = makeNormalTex(512, 512, (ctx, w, h) => drawPlanks(ctx, w, h, true), {
      strength: 2.0,
    });
    return { map, normalMap };
  });
  const map = base.map.clone();
  const normalMap = base.normalMap.clone();
  map.repeat.set(repeatX, repeatY);
  normalMap.repeat.set(repeatX, repeatY);
  map.needsUpdate = true;
  normalMap.needsUpdate = true;
  return { map, normalMap };
}

export function getTerracottaRoofTextures(repeatX = 10, repeatY = 6) {
  const base = cachedPair("terracotta", () => {
    const drawTiles = (ctx, w, h, isHeight) => {
      const rng = mulberry32(7401);
      const cols = 12;
      const rows = 8;
      const cw = w / cols;
      const rh = h / rows;
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const x = c * cw;
          const y = r * rh;
          const grad = ctx.createLinearGradient(x, y, x + cw, y);
          if (isHeight) {
            grad.addColorStop(0.0, "#454545");
            grad.addColorStop(0.5, "#f0f0f0");
            grad.addColorStop(1.0, "#454545");
          } else {
            const warm = Math.floor((rng() - 0.5) * 26);
            grad.addColorStop(0.0, `rgb(${152 + warm},${78 + warm},${54 + warm})`);
            grad.addColorStop(0.48, `rgb(${214 + warm},${118 + warm},${84 + warm})`);
            grad.addColorStop(1.0, `rgb(${144 + warm},${72 + warm},${49 + warm})`);
          }
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, cw + 0.5, rh - 1.5);
          ctx.fillStyle = isHeight ? "#262626" : "rgba(68,32,20,0.42)";
          ctx.fillRect(x, y + rh - 2.2, cw, 2.2);
        }
      }
    };
    const map = makeCanvasTex(512, 512, (ctx, w, h) => drawTiles(ctx, w, h, false));
    const normalMap = makeNormalTex(512, 512, (ctx, w, h) => drawTiles(ctx, w, h, true), {
      strength: 3.4,
    });
    return { map, normalMap };
  });
  const map = base.map.clone();
  const normalMap = base.normalMap.clone();
  map.repeat.set(repeatX, repeatY);
  normalMap.repeat.set(repeatX, repeatY);
  map.needsUpdate = true;
  normalMap.needsUpdate = true;
  return { map, normalMap };
}

export function getBarkTextures(repeatX = 2, repeatY = 5) {
  const base = cachedPair("bark", () => {
    const drawBark = (ctx, w, h, isHeight) => {
      const rng = mulberry32(8501);
      ctx.fillStyle = isHeight ? "#787878" : "#5a4637";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 420; i += 1) {
        const x = rng() * w;
        const y = rng() * h;
        const bw = 2 + rng() * 6;
        const bh = 18 + rng() * 64;
        if (isHeight) {
          const v = rng() > 0.35 ? 165 + Math.floor(rng() * 75) : 45 + Math.floor(rng() * 55);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
        } else {
          const l = 64 + Math.floor(rng() * 52);
          ctx.fillStyle = `rgba(${l + 18},${l + 5},${l - 8},0.55)`;
        }
        ctx.fillRect(x, y, bw, bh);
      }
    };
    const map = makeCanvasTex(256, 512, (ctx, w, h) => drawBark(ctx, w, h, false));
    const normalMap = makeNormalTex(256, 512, (ctx, w, h) => drawBark(ctx, w, h, true), {
      strength: 3.2,
    });
    return { map, normalMap };
  });
  const map = base.map.clone();
  const normalMap = base.normalMap.clone();
  map.repeat.set(repeatX, repeatY);
  normalMap.repeat.set(repeatX, repeatY);
  map.needsUpdate = true;
  normalMap.needsUpdate = true;
  return { map, normalMap };
}

export function pbrPlasterMat(colorHex = 0xf5efe4, opts = {}) {
  const { map, normalMap } = getPlasterTextures(opts.repeatX || 4, opts.repeatY || 3);
  return new THREE.MeshStandardMaterial({
    color: colorHex,
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: opts.roughness !== undefined ? opts.roughness : 0.86,
    metalness: 0.02,
    side: opts.side || THREE.FrontSide,
  });
}

export function pbrStoneMat(colorHex = 0xd8d0c2, opts = {}) {
  const { map, normalMap } = getStoneAshlarTextures(opts.repeatX || 4, opts.repeatY || 2);
  return new THREE.MeshStandardMaterial({
    color: colorHex,
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: opts.roughness !== undefined ? opts.roughness : 0.82,
    metalness: 0.04,
    side: opts.side || THREE.FrontSide,
  });
}

export function pbrWoodMat(colorHex = 0xb58356, opts = {}) {
  const { map, normalMap } = getOakParquetTextures(opts.repeatX || 3, opts.repeatY || 3);
  return new THREE.MeshStandardMaterial({
    color: colorHex,
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.42, 0.42),
    roughness: opts.roughness !== undefined ? opts.roughness : 0.48,
    metalness: 0.05,
    side: opts.side || THREE.FrontSide,
  });
}

export function pbrFabricMat(colorHex = 0xefe9de, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: colorHex,
    roughness: opts.roughness !== undefined ? opts.roughness : 0.88,
    metalness: 0.0,
    sheen: 0.68,
    sheenRoughness: 0.58,
    sheenColor: new THREE.Color(colorHex).lerp(new THREE.Color(0xffffff), 0.45),
    side: opts.side || THREE.FrontSide,
  });
}

export function pbrMetalMat(colorHex = 0xc5a059, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: opts.roughness !== undefined ? opts.roughness : 0.28,
    metalness: opts.metalness !== undefined ? opts.metalness : 0.84,
    side: opts.side || THREE.FrontSide,
  });
}

export function pbrGlassMat(opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: opts.color !== undefined ? opts.color : 0xdff0f5,
    transparent: true,
    opacity: opts.opacity !== undefined ? opts.opacity : 0.24,
    roughness: 0.06,
    metalness: 0.05,
    reflectivity: 0.92,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// ---------------------------------------------------------------------------
// Unified 260m x 260m Realistic Coastal Peninsula Elevation & Biome Queries
// ---------------------------------------------------------------------------

export function getCreekCenterX(z) {
  return 8.0 + 5.2 * Math.sin((z + 52.0) * 0.055);
}

// Shared Landmark Coordinates for Monet Pond & Bougainvillea Two-Person Swing Garden
export const POND_CONFIG = {
  cx: -1.5,
  cz: 16.8,
  rx: 5.4,
  rz: 4.1,
  waterY: 2.05,
  bedY: 1.18,
};

export const SWING_CONFIG = {
  cx: -28.5,
  cz: 14.0,
  groundY: 2.2,
};

export function getPondNormalizedRadius(x, z) {
  const dx = x - POND_CONFIG.cx;
  const dz = z - POND_CONFIG.cz + 0.34 * Math.sin((x - POND_CONFIG.cx) * 0.46);
  return Math.hypot(dx / POND_CONFIG.rx, dz / POND_CONFIG.rz);
}

// Deterministic C1-smooth realistic coastal topography across X, Z in [-140, +140].
// Y = 0.00m is Mean Sea Level.
export function getWorldTerrainY(x, z) {
  // Natural multi-harmonic coastal cape & cove undulation so the peninsula never looks square-cut.
  // Keep Harbor Quay zone (z in [-26.5, +23.0]) completely undisturbed on the East side.
  const quayCoastProtect = 1.0 - smoothstep(-29.5, -24.5, z) * (1.0 - smoothstep(22.5, 28.5, z));
  const eastCoastCurve =
    quayCoastProtect *
    (11.5 * Math.sin(z * 0.048 + 0.7) + 6.2 * Math.cos(z * 0.105 - 0.4) - 8.5 * smoothstep(-58.0, -108.0, z));
  const westCoastCurve = 12.0 * Math.sin(z * 0.044 - 0.5) + 6.5 * Math.cos(z * 0.096 + 1.1);
  const northCoastCurve =
    13.5 * Math.cos(x * 0.041 + 0.35) +
    6.8 * Math.sin(x * 0.089 - 0.8) -
    14.0 * smoothstep(18.0, 52.0, Math.abs(x - 6.0));
  const southCoastCurve = 9.5 * Math.sin(x * 0.052 + 0.9) + 4.8 * Math.cos(x * 0.11 - 0.3);

  // Base organic coastal landmass profile: high in North & West, shelving to East Harbor & South Sea
  const eastSeaMask = smoothstep(38.5 + eastCoastCurve, 57.5 + eastCoastCurve, x);
  const southSeaMask = smoothstep(35.0, 66.0, z) * smoothstep(-44.0, -18.0, x);
  const farWestCliff = smoothstep(-102.0 + westCoastCurve, -124.0 + westCoastCurve, x);
  const farSouthCliff = smoothstep(74.0 + southCoastCurve, 99.0 + southCoastCurve, z);
  const farNorthDrop = smoothstep(-106.0 + northCoastCurve, -129.0 + northCoastCurve, z);

  // Rolling wildflower & woodland hills
  const macroRoll =
    1.85 * Math.sin(x * 0.038 + 0.6) * Math.cos(z * 0.034 - 0.3) +
    0.92 * Math.sin((x - z) * 0.062) +
    0.42 * Math.cos((x + z * 1.3) * 0.11);

  // North Flowering Hills rising up to +18.5m
  const northRise = smoothstep(-14.0, -108.0, z) * (14.6 + 2.4 * Math.sin(x * 0.045 + 0.8));

  // West & South-West Grand Flower-Sea Headland rising to +9.2m
  const westHeadland =
    smoothstep(-34.0, -88.0, x) *
    (1.0 - 0.55 * smoothstep(58.0, 96.0, z)) *
    (5.8 + 1.5 * Math.cos(z * 0.052));

  let y = 2.2 + northRise + westHeadland + macroRoll * 0.55;

  // Flatten Central Villa, Monet Pond Terrace & Swing Secret Garden:
  // X in [-36.5, +6.0], Z in [-15.5, +23.2] -> Y = +2.20m
  const villaFlatX =
    smoothstep(-42.5, -36.0, x) * (1.0 - smoothstep(5.8, 9.8, x));
  const villaFlatZ =
    smoothstep(-21.5, -15.0, z) * (1.0 - smoothstep(23.0, 28.5, z));
  const villaWeight = villaFlatX * villaFlatZ;
  y = lerp(y, 2.2, villaWeight);

  // Flatten East Granite Harbor Quay Plateau: X in [+8, +46], Z in [-26, +22] -> Y = +1.35m
  const quayInX = smoothstep(2.0, 10.0, x) * (1.0 - smoothstep(45.2, 47.2, x));
  const quayInZ = smoothstep(-30.0, -24.0, z) * (1.0 - smoothstep(21.2, 23.2, z));
  const quayWeight = quayInX * quayInZ;
  y = lerp(y, 1.35, quayWeight);

  // Drop sharply outside Harbor Quay seawall into the boat basin (Y = -4.3m)
  const harborBasin =
    smoothstep(45.6, 47.6, x) * (1.0 - smoothstep(-32.0, -42.0, z)) +
    smoothstep(21.6, 24.5, z) * smoothstep(8.0, 14.0, x);
  const oceanDrop = clamp(
    Math.max(eastSeaMask, Math.max(southSeaMask, Math.max(farWestCliff, Math.max(farSouthCliff, farNorthDrop)))),
    0,
    1
  );
  const seaBlend = clamp(Math.max(oceanDrop, clamp(harborBasin, 0, 1)), 0, 1);
  y = lerp(y, -4.6 - 2.2 * smoothstep(55.0, 115.0, Math.hypot(x, z)), seaBlend);

  // Gentle Golden-Sand Cove Beach south of Garden Terrace: X in [-34, +8], Z in [+23.2, +56]
  const coveGate =
    smoothstep(-36.0, -25.0, x) *
    (1.0 - smoothstep(6.0, 13.0, x)) *
    smoothstep(22.5, 26.5, z) *
    (1.0 - smoothstep(54.0, 68.0, z));
  if (coveGate > 0.001) {
    const beachSlope = lerp(2.16, -2.6, smoothstep(23.5, 54.0, z));
    y = lerp(y, beachSlope, coveGate * 0.92);
  }

  // Carve Monet Crystal-Clear Water-Lily & Fish/Shrimp Garden Pond Basin at (-1.5, +16.8)
  const rPond = getPondNormalizedRadius(x, z);
  if (rPond < 1.14) {
    const pondCarve = 1.0 - smoothstep(0.66, 1.06, rPond);
    // Subtle natural shelf on South-West side for shallow sunlit river-shrimp rocks
    const shelfBias = smoothstep(-0.2, 0.85, (z - POND_CONFIG.cz) / POND_CONFIG.rz) * 0.16;
    const targetBedY = POND_CONFIG.bedY + shelfBias;
    y = lerp(y, targetBedY, pondCarve);
  }

  // Carve North Mountain Creek Bed: Z in [-112, -25] flowing into North Harbor Cove
  const creekGate = smoothstep(-23.0, -29.0, z) * (1.0 - smoothstep(-108.0, -118.0, z));
  if (creekGate > 0.001) {
    const dCreek = Math.abs(x - getCreekCenterX(z));
    if (dCreek < 4.6) {
      const profile = Math.cos((dCreek / 4.6) * Math.PI * 0.5);
      y -= 1.45 * profile * profile * creekGate;
    }
  }

  // Flatten Cliffside Marble Rose Belvedere Gazebo Plateau at (-64, +7.80, +42)
  const dGaz = Math.hypot(x + 64.0, z - 42.0);
  const gazGate = 1.0 - smoothstep(5.4, 11.5, dGaz);
  if (gazGate > 0.001) {
    y = lerp(y, 7.8, gazGate);
  }

  // Flatten Hilltop Stone Windmill Plateau at (-52, +14.20, -68)
  const dWm = Math.hypot(x + 52.0, z + 68.0);
  const wmGate = 1.0 - smoothstep(6.5, 14.0, dWm);
  if (wmGate > 0.001) {
    y = lerp(y, 14.2, wmGate);
  }

  // Flatten 3 Scenic Northern Hillside Cottage Garden Terraces so foundations sit level
  for (const [cx, cz, ty] of [
    [-78.0, -56.0, 14.6],
    [-18.0, -82.0, 14.4],
    [24.5, -68.0, 11.2],
  ]) {
    const dCot = Math.hypot(x - cx, z - cz);
    const cotGate = 1.0 - smoothstep(5.8, 12.2, dCot);
    if (cotGate > 0.001) {
      y = lerp(y, ty, cotGate);
    }
  }

  // Sculpted Outer-Bay Limestone Sea-Stack Islet at (+58, +56) rising to +5.6m
  const dIslet = Math.hypot(x - 58.0, z - 56.0);
  if (dIslet < 11.5) {
    const isletRise = 1.0 - smoothstep(4.2, 10.8, dIslet);
    y = Math.max(y, lerp(-4.5, 5.4, isletRise));
  }

  return y;
}

export function getTerrainNormal(x, z, target = new THREE.Vector3()) {
  const eps = 0.45;
  const hL = getWorldTerrainY(x - eps, z);
  const hR = getWorldTerrainY(x + eps, z);
  const hD = getWorldTerrainY(x, z - eps);
  const hU = getWorldTerrainY(x, z + eps);
  return target.set(hL - hR, 2.0 * eps, hD - hU).normalize();
}

// ---------------------------------------------------------------------------
// Walkable Surface Elevation & Smooth Sliding Collision Registry
// ---------------------------------------------------------------------------

const _walkZones = [];
const _boxColliders = [];
const _circleColliders = [];

export function clearNavigationRegistry() {
  _walkZones.length = 0;
  _boxColliders.length = 0;
  _circleColliders.length = 0;
}

// fn(x, z, refY) returns a number (floor Y) or an array of numbers if inside zone, or null to fall through.
export function registerWalkZone(fn) {
  _walkZones.push(fn);
}

export function registerBoxCollider(xMin, xMax, zMin, zMax, yMin = -Infinity, yMax = Infinity) {
  _boxColliders.push({ xMin, xMax, zMin, zMax, yMin, yMax });
}

export function registerCircleCollider(cx, cz, radius, yMin = -Infinity, yMax = Infinity) {
  _circleColliders.push({ cx, cz, radius, yMin, yMax });
}

export function getWalkSurfaceY(x, z, refY = null) {
  let best = null;
  let bestDiff = Infinity;
  for (let i = 0; i < _walkZones.length; i += 1) {
    const raw = _walkZones[i](x, z, refY);
    if (raw === null || raw === undefined) continue;
    if (Array.isArray(raw)) {
      for (let k = 0; k < raw.length; k += 1) {
        const val = raw[k];
        if (typeof val !== "number") continue;
        if (typeof refY === "number") {
          const diff = Math.abs(val - refY);
          if (diff < bestDiff) {
            bestDiff = diff;
            best = val;
          }
        } else if (best === null || val > best) {
          best = val;
        }
      }
    } else if (typeof raw === "number") {
      if (typeof refY === "number") {
        const diff = Math.abs(raw - refY);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = raw;
        }
      } else if (best === null || raw > best) {
        best = raw;
      }
    }
  }
  if (best !== null) return best;
  return getWorldTerrainY(x, z);
}

export function isPositionWalkable(x, z, radius = 0.38, refY = null) {
  if (Math.abs(x) > 116 || Math.abs(z) > 116) return false;
  const surfY = getWalkSurfaceY(x, z, refY);
  // Prevent walking off piers or deep into ocean below ankle-deep beach surf (Y < 0.18m)
  if (surfY < 0.18) return false;

  for (let i = 0; i < _boxColliders.length; i += 1) {
    const b = _boxColliders[i];
    if (surfY < b.yMin || surfY > b.yMax) continue;
    if (
      x > b.xMin - radius &&
      x < b.xMax + radius &&
      z > b.zMin - radius &&
      z < b.zMax + radius
    ) {
      return false;
    }
  }
  for (let i = 0; i < _circleColliders.length; i += 1) {
    const c = _circleColliders[i];
    if (surfY < c.yMin || surfY > c.yMax) continue;
    if (Math.hypot(x - c.cx, z - c.cz) < c.radius + radius) {
      return false;
    }
  }
  return true;
}

// Smooth wall-sliding movement resolver for first-person / click-to-walk exploration
export function resolveWalkPosition(prevX, prevZ, nextX, nextZ, radius = 0.38, prevY = null) {
  const prevSurf = typeof prevY === "number" ? prevY : getWalkSurfaceY(prevX, prevZ);
  const canStepTo = (tx, tz) => {
    if (!isPositionWalkable(tx, tz, radius, prevSurf)) return false;
    const nextSurf = getWalkSurfaceY(tx, tz, prevSurf);
    // Prevent climbing sheer seawalls or falling off 2nd-floor terraces (> 1.05m jump in a single micro-step)
    return Math.abs(nextSurf - prevSurf) <= 1.05;
  };

  if (canStepTo(nextX, nextZ)) return { x: nextX, z: nextZ };
  if (canStepTo(nextX, prevZ)) return { x: nextX, z: prevZ };
  if (canStepTo(prevX, nextZ)) return { x: prevX, z: nextZ };
  return { x: prevX, z: prevZ };
}

export function tagInteractive(root, id, label) {
  root.userData.interactive = { id, label };
  root.traverse((c) => {
    c.userData.interactive = { id, label };
    c.userData.interactiveRoot = root;
  });
  return root;
}

export function enablePBRShadows(root, { cast = true, receive = true, minRadius = 0.18 } = {}) {
  root.traverse((c) => {
    if (!c.isMesh) return;
    if (c.userData.noShadow) return;
    if (receive && !c.material?.transparent) c.receiveShadow = true;
    if (cast && !c.isInstancedMesh && !c.userData.noCastShadow) {
      if (!c.geometry.boundingSphere) c.geometry.computeBoundingSphere();
      const r = c.geometry.boundingSphere ? c.geometry.boundingSphere.radius : 0;
      if (r >= minRadius && r <= 32.0) c.castShadow = true;
    }
  });
}

// Merges static non-interactive single-material child meshes within `rootGroup` by
// (material, castShadow, receiveShadow, vertexColors, spatialSector) to minimize WebGL draw calls
// while preserving frustum culling, raycasting, and exact world transforms.
export function batchStaticMeshesByMaterial(
  rootGroup,
  { skipSet = null, spatialBucketSize = 64 } = {}
) {
  if (!rootGroup) return 0;
  rootGroup.updateMatrixWorld(true);
  const invRoot = rootGroup.matrixWorld.clone().invert();
  const relMat = new THREE.Matrix4();
  const posVec = new THREE.Vector3();

  const isSkipped = (obj) => {
    let cur = obj;
    while (cur && cur !== rootGroup) {
      if (skipSet && skipSet.has(cur)) return true;
      const ud = cur.userData;
      if (ud && (ud.dynamic || ud.isHeroRoseVase || ud.noBatch)) {
        return true;
      }
      cur = cur.parent;
    }
    return false;
  };

  const getInteractiveMeta = (obj) => {
    let cur = obj;
    while (cur) {
      if (cur.userData && cur.userData.interactive) {
        return cur.userData.interactive;
      }
      if (cur === rootGroup) break;
      cur = cur.parent;
    }
    return null;
  };

  const buckets = new Map();
  rootGroup.traverse((obj) => {
    if (!obj.isMesh || obj.isInstancedMesh || obj.isSkinnedMesh) return;
    if (obj.visible === false || obj.children.length > 0) return;
    if (!obj.geometry || !obj.material || Array.isArray(obj.material)) return;
    if (!obj.geometry.attributes?.position) return;
    if (isSkipped(obj)) return;

    posVec.setFromMatrixPosition(obj.matrixWorld);
    const sx = spatialBucketSize > 0 ? Math.floor(posVec.x / spatialBucketSize) : 0;
    const sz = spatialBucketSize > 0 ? Math.floor(posVec.z / spatialBucketSize) : 0;
    const hasCol = obj.geometry.attributes.color ? 1 : 0;
    const interactiveMeta = getInteractiveMeta(obj);
    const interKey = interactiveMeta ? interactiveMeta.id : "";
    const key = `${obj.material.uuid}|${obj.castShadow ? 1 : 0}|${obj.receiveShadow ? 1 : 0}|${hasCol}|${interKey}|${sx},${sz}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        material: obj.material,
        castShadow: Boolean(obj.castShadow),
        receiveShadow: Boolean(obj.receiveShadow),
        hasCol: Boolean(hasCol),
        interactiveMeta,
        meshes: [],
      };
      buckets.set(key, bucket);
    }
    bucket.meshes.push(obj);
  });

  let mergedRemovedCount = 0;
  for (const bucket of buckets.values()) {
    if (bucket.meshes.length < 2) continue;
    const geos = [];
    for (let i = 0; i < bucket.meshes.length; i += 1) {
      const m = bucket.meshes[i];
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      relMat.multiplyMatrices(invRoot, m.matrixWorld);
      g.applyMatrix4(relMat);
      if (!g.attributes.normal) {
        g.computeVertexNormals();
      }
      const vCount = g.attributes.position.count;
      if (!g.attributes.uv) {
        g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(vCount * 2), 2));
      } else if (g.attributes.uv.itemSize !== 2) {
        const srcUv = g.attributes.uv;
        const uv2 = new Float32Array(vCount * 2);
        for (let k = 0; k < vCount; k += 1) {
          uv2[k * 2] = srcUv.getX(k);
          uv2[k * 2 + 1] = srcUv.getY(k);
        }
        g.setAttribute("uv", new THREE.BufferAttribute(uv2, 2));
      }
      for (const attrName of Object.keys(g.attributes)) {
        if (
          attrName !== "position" &&
          attrName !== "normal" &&
          attrName !== "uv" &&
          !(bucket.hasCol && attrName === "color")
        ) {
          g.deleteAttribute(attrName);
        }
      }
      geos.push(g);
    }

    const mergedGeo = mergeGeometries(geos, false);
    for (let i = 0; i < geos.length; i += 1) geos[i].dispose();
    if (!mergedGeo) continue;

    mergedGeo.computeBoundingSphere();
    const mergedMesh = new THREE.Mesh(mergedGeo, bucket.material);
    mergedMesh.name = "BatchedStaticMesh";
    mergedMesh.castShadow = bucket.castShadow;
    mergedMesh.receiveShadow = bucket.receiveShadow;
    mergedMesh.frustumCulled = true;
    if (bucket.interactiveMeta) {
      mergedMesh.userData.interactive = bucket.interactiveMeta;
    }
    rootGroup.add(mergedMesh);

    for (let i = 0; i < bucket.meshes.length; i += 1) {
      const m = bucket.meshes[i];
      if (m.parent) m.parent.remove(m);
    }
    mergedRemovedCount += bucket.meshes.length - 1;
  }
  return mergedRemovedCount;
}
