// Authoritative Coastal Topography, Exclusion Zones, Walk-Surface & Collision Registry,
// and Deterministic Babylon.js PBR Material / Procedural Texture Helpers (Right-Handed Y-Up).

import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fbm2(x, z) {
  return (
    0.52 * Math.sin(x * 0.071 + z * 0.053 + 0.4) +
    0.31 * Math.cos(x * 0.163 - z * 0.129 + 1.7) +
    0.17 * Math.sin(x * 0.37 + z * 0.41 - 0.9)
  );
}

export function hexToColor3(hex) {
  if (typeof hex === "string") return Color3.FromHexString(hex);
  return Color3.FromInts((hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff);
}

// ---------------------------------------------------------------------------
// Landmark & Path Constants
// ---------------------------------------------------------------------------

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

export const COTTAGE_SPECS = [
  { x: -78.0, y: 14.6, z: -56.0, ry: 0.42, cw: 8.2, cd: 5.8, wallH: 3.4, tint: 0xf7e4da, roof: 0xc26c52 },
  { x: -18.0, y: 14.4, z: -82.0, ry: -0.18, cw: 8.8, cd: 6.0, wallH: 3.55, tint: 0xf6eed8, roof: 0xb9684e },
  { x: 24.5, y: 11.2, z: -68.0, ry: -0.52, cw: 7.8, cd: 5.6, wallH: 3.3, tint: 0xf1e8ec, roof: 0xc6745a },
];

export const WEST_GAZEBO_TRAIL = [
  [-28.0, 1.0],
  [-38.0, 8.0],
  [-49.0, 20.0],
  [-57.0, 31.0],
  [-64.0, 42.0],
];

export const NORTH_WINDMILL_TRAIL = [
  [-8.0, -13.5],
  [1.2, -28.0],
  [2.9, -44.0],
  [-12.0, -52.0],
  [-34.0, -60.0],
  [-52.0, -68.0],
];

export const EAST_HARBOR_BRIDGE_TRAIL = [
  [14.2, -25.5],
  [15.0, -35.0],
  [13.9, -44.0],
  [8.4, -44.0],
  [2.8, -44.2],
];

export const COTTAGE_SPUR_TRAILS = [
  [[-48.2, -65.0], [-62.5, -60.5], [-73.5, -56.5]],
  [[-14.0, -53.0], [-16.2, -66.5], [-17.8, -76.5]],
  [[14.2, -45.5], [19.2, -55.5], [23.2, -63.0]],
];

export const EXCLUSION_ZONES = {
  villaCourtyard: { xMin: -29.5, xMax: 2.5, zMin: -13.5, zMax: 12.2 },
  harborQuay: { xMin: 2.0, xMax: 48.0, zMin: -28.0, zMax: 24.0 },
  monetPond: { xMin: -8.8, xMax: 5.6, zMin: 11.4, zMax: 22.8 },
  swingGarden: { xMin: -34.8, xMax: -22.2, zMin: 8.8, zMax: 22.4 },
  monetWalkX: { xMin: -16.4, xMax: -11.6, zMin: 11.2, zMax: 23.8 },
  gazebo: { cx: -64.0, cz: 42.0, r: 6.6 },
  windmill: { cx: -52.0, cz: -68.0, r: 7.0 },
  cottages: [
    { cx: -78.0, cz: -56.0, r: 8.8 },
    { cx: -18.0, cz: -82.0, r: 9.2 },
    { cx: 24.5, cz: -68.0, r: 8.4 },
  ],
};

// ---------------------------------------------------------------------------
// Unified 280m Coastal Peninsula Elevation & Biome Queries
// ---------------------------------------------------------------------------

export function getCreekCenterX(z) {
  return 8.0 + 5.2 * Math.sin((z + 52.0) * 0.055);
}

export function getPondNormalizedRadius(x, z) {
  const dx = x - POND_CONFIG.cx;
  const dz = z - POND_CONFIG.cz + 0.34 * Math.sin((x - POND_CONFIG.cx) * 0.46);
  return Math.hypot(dx / POND_CONFIG.rx, dz / POND_CONFIG.rz);
}

export function getWorldTerrainY(x, z) {
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

  const eastSeaMask = smoothstep(38.5 + eastCoastCurve, 57.5 + eastCoastCurve, x);
  const southSeaMask = smoothstep(35.0, 66.0, z) * smoothstep(-44.0, -18.0, x);
  const farWestCliff = smoothstep(-102.0 + westCoastCurve, -124.0 + westCoastCurve, x);
  const farSouthCliff = smoothstep(74.0 + southCoastCurve, 99.0 + southCoastCurve, z);
  const farNorthDrop = smoothstep(-106.0 + northCoastCurve, -129.0 + northCoastCurve, z);

  const macroRoll =
    1.85 * Math.sin(x * 0.038 + 0.6) * Math.cos(z * 0.034 - 0.3) +
    0.92 * Math.sin((x - z) * 0.062) +
    0.42 * Math.cos((x + z * 1.3) * 0.11);

  const northRise = smoothstep(-14.0, -108.0, z) * (14.6 + 2.4 * Math.sin(x * 0.045 + 0.8));
  const westHeadland =
    smoothstep(-34.0, -88.0, x) *
    (1.0 - 0.55 * smoothstep(58.0, 96.0, z)) *
    (5.8 + 1.5 * Math.cos(z * 0.052));

  let y = 2.2 + northRise + westHeadland + macroRoll * 0.55;

  const villaFlatX = smoothstep(-42.5, -36.0, x) * (1.0 - smoothstep(5.8, 9.8, x));
  const villaFlatZ = smoothstep(-21.5, -15.0, z) * (1.0 - smoothstep(23.0, 28.5, z));
  y = lerp(y, 2.2, villaFlatX * villaFlatZ);

  const quayInX = smoothstep(2.0, 10.0, x) * (1.0 - smoothstep(45.2, 47.2, x));
  const quayInZ = smoothstep(-30.0, -24.0, z) * (1.0 - smoothstep(21.2, 23.2, z));
  y = lerp(y, 1.35, quayInX * quayInZ);

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

  const coveGate =
    smoothstep(-36.0, -25.0, x) *
    (1.0 - smoothstep(6.0, 13.0, x)) *
    smoothstep(22.5, 26.5, z) *
    (1.0 - smoothstep(54.0, 68.0, z));
  if (coveGate > 0.001) {
    const beachSlope = lerp(2.16, -2.6, smoothstep(23.5, 54.0, z));
    y = lerp(y, beachSlope, coveGate * 0.92);
  }

  const rPond = getPondNormalizedRadius(x, z);
  if (rPond < 1.14) {
    const pondCarve = 1.0 - smoothstep(0.66, 1.06, rPond);
    const shelfBias = smoothstep(-0.2, 0.85, (z - POND_CONFIG.cz) / POND_CONFIG.rz) * 0.16;
    y = lerp(y, POND_CONFIG.bedY + shelfBias, pondCarve);
  }

  const creekGate = smoothstep(-23.0, -29.0, z) * (1.0 - smoothstep(-108.0, -118.0, z));
  if (creekGate > 0.001) {
    const dCreek = Math.abs(x - getCreekCenterX(z));
    if (dCreek < 4.6) {
      const profile = Math.cos((dCreek / 4.6) * Math.PI * 0.5);
      y -= 1.45 * profile * profile * creekGate;
    }
  }

  const gazGate = 1.0 - smoothstep(5.4, 11.5, Math.hypot(x + 64.0, z - 42.0));
  if (gazGate > 0.001) y = lerp(y, 7.8, gazGate);

  const wmGate = 1.0 - smoothstep(6.5, 14.0, Math.hypot(x + 52.0, z + 68.0));
  if (wmGate > 0.001) y = lerp(y, 14.2, wmGate);

  for (const c of COTTAGE_SPECS) {
    const cotGate = 1.0 - smoothstep(5.8, 12.2, Math.hypot(x - c.x, z - c.z));
    if (cotGate > 0.001) y = lerp(y, c.y, cotGate);
  }

  const dIslet = Math.hypot(x - 58.0, z - 56.0);
  if (dIslet < 11.5) {
    const isletRise = 1.0 - smoothstep(4.2, 10.8, dIslet);
    y = Math.max(y, lerp(-4.5, 5.4, isletRise));
  }

  return y;
}

export function getTerrainMeshY(x, z) {
  let y = getWorldTerrainY(x, z);
  if (x >= 9.6 && x <= 46.2 && z >= -25.8 && z <= 22.2) y = Math.min(y, 1.31);
  if (x >= 25.8 && x <= 32.2 && z >= 19.0 && z <= 25.2) y = Math.min(y, -1.25);
  return y;
}

export function getTerrainNormal(x, z, target = new Vector3()) {
  const eps = 0.45;
  const hL = getWorldTerrainY(x - eps, z);
  const hR = getWorldTerrainY(x + eps, z);
  const hD = getWorldTerrainY(x, z - eps);
  const hU = getWorldTerrainY(x, z + eps);
  return target.set(hL - hR, 2.0 * eps, hD - hU).normalize();
}

export function distToSegment2D(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lenSq = vx * vx + vz * vz;
  const t = lenSq > 1e-6 ? clamp((wx * vx + wz * vz) / lenSq, 0.0, 1.0) : 0.0;
  return Math.hypot(px - (ax + t * vx), pz - (az + t * vz));
}

export function distToPolyline2D(px, pz, pts) {
  let minD = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const d = distToSegment2D(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < minD) minD = d;
  }
  return minD;
}

export function isMeadowFloraAllowed(x, z, pad = 0.0) {
  if (Math.abs(x) > 122.0 || Math.abs(z) > 122.0) return false;
  const y = getWorldTerrainY(x, z);
  if (y < 1.65) return false;

  const { villaCourtyard: vc, harborQuay: hq, monetPond: mp, swingGarden: sg, monetWalkX: mw } = EXCLUSION_ZONES;
  if (x >= vc.xMin - 0.3 - pad && x <= vc.xMax + 0.3 + pad && z >= vc.zMin - 0.3 - pad && z <= vc.zMax + 0.3 + pad) return false;
  if (x >= hq.xMin - pad && x <= hq.xMax + pad && z >= hq.zMin - pad && z <= hq.zMax + pad) return false;
  if (x >= mp.xMin - pad && x <= mp.xMax + pad && z >= mp.zMin - pad && z <= mp.zMax + pad) return false;
  if (x >= sg.xMin - pad && x <= sg.xMax + pad && z >= sg.zMin - pad && z <= sg.zMax + pad) return false;
  if (x >= mw.xMin - 0.45 - pad && x <= mw.xMax + 0.45 + pad && z >= mw.zMin - 0.4 - pad && z <= mw.zMax + 0.4 + pad) return false;
  if (distToSegment2D(x, z, -12.8, 14.4, -4.6, 19.4) < 1.35 + pad) return false;
  if (x >= -35.0 - pad && x <= 9.0 + pad && z >= 22.0 - pad && z <= 60.0 + pad && y < 2.15) return false;
  if (z >= -114.0 && z <= -23.0 && Math.abs(x - getCreekCenterX(z)) < 3.6 + pad) return false;
  if (z >= -49.0 - pad && z <= -39.0 + pad && Math.abs(x - getCreekCenterX(z)) < 6.8 + pad) return false;

  if (Math.hypot(x + 64.0, z - 42.0) < 6.6 + pad) return false;
  if (Math.hypot(x + 52.0, z + 68.0) < 7.0 + pad) return false;
  for (const c of EXCLUSION_ZONES.cottages) {
    if (Math.hypot(x - c.cx, z - c.cz) < c.r + pad) return false;
  }

  const trailClear = 1.85 + pad * 0.7;
  if (distToPolyline2D(x, z, WEST_GAZEBO_TRAIL) < trailClear) return false;
  if (distToPolyline2D(x, z, NORTH_WINDMILL_TRAIL) < trailClear) return false;
  if (distToPolyline2D(x, z, EAST_HARBOR_BRIDGE_TRAIL) < trailClear) return false;
  for (let i = 0; i < COTTAGE_SPUR_TRAILS.length; i += 1) {
    if (distToPolyline2D(x, z, COTTAGE_SPUR_TRAILS[i]) < trailClear) return false;
  }
  return true;
}

export const canPlaceFlora = isMeadowFloraAllowed;

// ---------------------------------------------------------------------------
// Walkable Surface Elevation & Smooth Sliding Collision Registry
// ---------------------------------------------------------------------------

const _walkZones = [];
const _boxColliders = [];
const _rotatedBoxColliders = [];
const _circleColliders = [];

export function clearNavigationRegistry() {
  _walkZones.length = 0;
  _boxColliders.length = 0;
  _rotatedBoxColliders.length = 0;
  _circleColliders.length = 0;
}

export function registerWalkZone(fn) {
  _walkZones.push(fn);
}

export function registerBoxCollider(xMin, xMax, zMin, zMax, yMin = -Infinity, yMax = Infinity) {
  _boxColliders.push({ xMin, xMax, zMin, zMax, yMin, yMax });
}

export function registerRotatedBoxCollider(cx, cz, ry, halfW, halfD, yMin = -Infinity, yMax = Infinity) {
  _rotatedBoxColliders.push({
    cx,
    cz,
    cosR: Math.cos(ry),
    sinR: Math.sin(ry),
    halfW,
    halfD,
    yMin,
    yMax,
  });
}

export function registerCircleCollider(cx, cz, radius, yMin = -Infinity, yMax = Infinity) {
  _circleColliders.push({ cx, cz, radius, yMin, yMax });
}

export function getRegisteredColliders() {
  return {
    boxes: _boxColliders,
    rotatedBoxes: _rotatedBoxColliders,
    circles: _circleColliders,
  };
}

export function getWalkSurfaceY(x, z, refY = null) {
  let best = null;
  let bestDiff = Infinity;
  for (let i = 0; i < _walkZones.length; i += 1) {
    const raw = _walkZones[i](x, z, refY);
    if (raw === null || raw === undefined) continue;
    const list = Array.isArray(raw) ? raw : [raw];
    for (let k = 0; k < list.length; k += 1) {
      const val = list[k];
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
  }
  if (best !== null) return best;
  return getWorldTerrainY(x, z);
}

export function isPositionWalkable(x, z, radius = 0.38, refY = null) {
  if (Math.abs(x) > 116 || Math.abs(z) > 116) return false;
  const surfY = getWalkSurfaceY(x, z, refY);
  if (surfY < 0.18) return false;

  for (let i = 0; i < _boxColliders.length; i += 1) {
    const b = _boxColliders[i];
    if (surfY < b.yMin || surfY > b.yMax) continue;
    if (x > b.xMin - radius && x < b.xMax + radius && z > b.zMin - radius && z < b.zMax + radius) {
      return false;
    }
  }
  for (let i = 0; i < _rotatedBoxColliders.length; i += 1) {
    const b = _rotatedBoxColliders[i];
    if (surfY < b.yMin || surfY > b.yMax) continue;
    const dxw = x - b.cx;
    const dzw = z - b.cz;
    const lx = dxw * b.cosR - dzw * b.sinR;
    const lz = dxw * b.sinR + dzw * b.cosR;
    const cx = Math.max(0, Math.abs(lx) - b.halfW);
    const cz = Math.max(0, Math.abs(lz) - b.halfD);
    if (cx * cx + cz * cz < radius * radius) return false;
  }
  for (let i = 0; i < _circleColliders.length; i += 1) {
    const c = _circleColliders[i];
    if (surfY < c.yMin || surfY > c.yMax) continue;
    if (Math.hypot(x - c.cx, z - c.cz) < c.radius + radius) return false;
  }
  return true;
}

export function resolveWalkPosition(prevX, prevZ, nextX, nextZ, radius = 0.38, prevY = null) {
  const prevSurf = typeof prevY === "number" ? prevY : getWalkSurfaceY(prevX, prevZ);
  const canStepTo = (tx, tz) => {
    if (!isPositionWalkable(tx, tz, radius, prevSurf)) return false;
    const nextSurf = getWalkSurfaceY(tx, tz, prevSurf);
    return Math.abs(nextSurf - prevSurf) <= 1.05;
  };
  if (canStepTo(nextX, nextZ)) return { x: nextX, z: nextZ };
  if (canStepTo(nextX, prevZ)) return { x: nextX, z: prevZ };
  if (canStepTo(prevX, nextZ)) return { x: prevX, z: nextZ };
  return { x: prevX, z: prevZ };
}

// ---------------------------------------------------------------------------
// Babylon.js Procedural PBR Textures & Material Helpers
// ---------------------------------------------------------------------------

export function makeCanvasTexture(scene, size, drawFn, { repeatU = 1, repeatV = 1, hasAlpha = false, srgb = true } = {}) {
  const dt = new DynamicTexture("pbrDynTex", { width: size, height: size }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const ctx = dt.getContext();
  drawFn(ctx, size, size);
  dt.update(true);
  dt.wrapU = Texture.WRAP_ADDRESSMODE;
  dt.wrapV = Texture.WRAP_ADDRESSMODE;
  dt.uScale = repeatU;
  dt.vScale = repeatV;
  dt.hasAlpha = hasAlpha;
  if (!srgb) dt.gammaSpace = false;
  return dt;
}

const _texCache = new WeakMap();
function getCache(scene) {
  let c = _texCache.get(scene);
  if (!c) {
    c = new Map();
    _texCache.set(scene, c);
  }
  return c;
}

export function getGraniteSlabTexture(scene, repeatU = 12, repeatV = 12) {
  const cache = getCache(scene);
  const key = `granite:${repeatU}:${repeatV}`;
  if (cache.has(key)) return cache.get(key);
  const tex = makeCanvasTexture(
    scene,
    512,
    (ctx, w, h) => {
      const rng = mulberry32(9204);
      ctx.fillStyle = "#8a847a";
      ctx.fillRect(0, 0, w, h);
      const rows = 8;
      const rh = h / rows;
      for (let r = 0; r < rows; r += 1) {
        const cols = 6;
        const cw = w / cols;
        const off = (r % 2) * cw * 0.5;
        for (let c = -1; c <= cols; c += 1) {
          const x = c * cw + off;
          const y = r * rh;
          const b = 186 + Math.floor(rng() * 34);
          ctx.fillStyle = `rgb(${b},${b - 2},${b - 7})`;
          ctx.fillRect(x + 2, y + 2, cw - 4, rh - 4);
          for (let s = 0; s < 18; s += 1) {
            const sp = 148 + Math.floor(rng() * 78);
            ctx.fillStyle = `rgba(${sp},${sp - 2},${sp - 4},0.25)`;
            ctx.fillRect(x + 3 + rng() * (cw - 7), y + 3 + rng() * (rh - 7), 2.5, 2.5);
          }
        }
      }
    },
    { repeatU, repeatV }
  );
  cache.set(key, tex);
  return tex;
}

export function getTeakDeckTexture(scene, repeatU = 4, repeatV = 8) {
  const cache = getCache(scene);
  const key = `teak:${repeatU}:${repeatV}`;
  if (cache.has(key)) return cache.get(key);
  const tex = makeCanvasTexture(
    scene,
    512,
    (ctx, w, h) => {
      const rng = mulberry32(9305);
      ctx.fillStyle = "#2b241e";
      ctx.fillRect(0, 0, w, h);
      const strips = 14;
      const sw = w / strips;
      for (let s = 0; s < strips; s += 1) {
        const tone = Math.floor((rng() - 0.5) * 24);
        ctx.fillStyle = `rgb(${194 + tone},${144 + tone},${96 + tone})`;
        ctx.fillRect(s * sw + 1.5, 0, sw - 3.0, h);
      }
    },
    { repeatU, repeatV }
  );
  cache.set(key, tex);
  return tex;
}

export function getMeadowGroundTexture(scene, repeatU = 48, repeatV = 48) {
  const cache = getCache(scene);
  const key = `meadow:${repeatU}:${repeatV}`;
  if (cache.has(key)) return cache.get(key);
  const tex = makeCanvasTexture(
    scene,
    512,
    (ctx, w, h) => {
      const r0 = mulberry32(9100);
      ctx.fillStyle = "#edf0e8";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 6500; i += 1) {
        const x = r0() * w;
        const y = r0() * h;
        const shade = 212 + Math.floor(r0() * 42);
        ctx.strokeStyle = `rgba(${shade - 10},${shade + 4},${shade - 16},0.40)`;
        ctx.lineWidth = 1.0 + r0() * 1.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (r0() - 0.5) * 4.5, y - 3.0 - r0() * 5.2);
        ctx.stroke();
      }
      for (let i = 0; i < 800; i += 1) {
        const tone = r0();
        ctx.fillStyle = tone < 0.35 ? "rgba(250,236,242,0.22)" : tone < 0.68 ? "rgba(232,226,248,0.2)" : "rgba(252,248,225,0.22)";
        ctx.beginPath();
        ctx.arc(r0() * w, r0() * h, 1.4 + r0() * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { repeatU, repeatV }
  );
  cache.set(key, tex);
  return tex;
}

export function makePbrMat(nameOrScene, sceneOrName, optsOrColor = {}, maybeOpts = {}) {
  let name = nameOrScene;
  let scene = sceneOrName;
  let opts = optsOrColor;
  if (typeof nameOrScene !== "string" && typeof sceneOrName === "string") {
    scene = nameOrScene;
    name = sceneOrName;
    if (typeof optsOrColor === "number" || typeof optsOrColor === "string") {
      opts = { color: optsOrColor, ...(maybeOpts && typeof maybeOpts === "object" ? maybeOpts : {}) };
    } else {
      opts = optsOrColor && typeof optsOrColor === "object" ? optsOrColor : {};
    }
  }
  const {
    color = 0xffffff,
    emissive = 0x000000,
    emissiveIntensity = 1.0,
    roughness = 0.72,
    metallic = 0.04,
    alpha = 1.0,
    doubleSided = false,
    albedoTexture = null,
    useVertexColors = false,
  } = opts || {};
  const mat = new PBRMaterial(name, scene);
  mat.albedoColor = hexToColor3(color);
  if (emissive !== 0x000000) {
    mat.emissiveColor = hexToColor3(emissive).scale(emissiveIntensity);
  }
  mat.roughness = roughness;
  mat.metallic = metallic;
  mat.alpha = alpha;
  mat.backFaceCulling = !doubleSided;
  if (albedoTexture) mat.albedoTexture = albedoTexture;
  if (alpha < 0.999) {
    mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  }
  if (useVertexColors) {
    mat.albedoColor = Color3.White();
  }
  return mat;
}
