// Physically-Based Botanical Flora, Multi-Branching 3D Trees, Fibonacci Sculpted Roses,
// Hydrangea Borders & GPU-Instanced 260m x 260m Coastal Meadow Flower-Sea Module.

import {
  THREE,
  mergeGeometries,
  clamp,
  lerp,
  smoothstep,
  mulberry32,
  makeCanvasTex,
  makeNormalTex,
  getBarkTextures,
  getWorldTerrainY,
  getTerrainNormal,
  getCreekCenterX,
  registerCircleCollider,
} from "./pbr-kit.js";

// ---------------------------------------------------------------------------
// Scenic Footpaths, Exclusion Zones & Organic Biome Drift Noise
// ---------------------------------------------------------------------------

const WEST_GAZEBO_TRAIL = [
  [-28.0, 1.0],
  [-38.0, 8.0],
  [-49.0, 20.0],
  [-57.0, 31.0],
  [-64.0, 42.0],
];

const NORTH_WINDMILL_TRAIL = [
  [-8.0, -13.5],
  [2.0, -28.0],
  [8.4, -44.0],
  [-12.0, -52.0],
  [-34.0, -60.0],
  [-52.0, -68.0],
];

function distToSegment2D(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lenSq = vx * vx + vz * vz;
  const t = lenSq > 1e-6 ? clamp((wx * vx + wz * vz) / lenSq, 0.0, 1.0) : 0.0;
  const dx = px - (ax + t * vx);
  const dz = pz - (az + t * vz);
  return Math.hypot(dx, dz);
}

function distToPolyline2D(px, pz, pts) {
  let minD = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const d = distToSegment2D(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < minD) minD = d;
  }
  return minD;
}

export function isMeadowFloraAllowed(x, z) {
  if (Math.abs(x) > 122.0 || Math.abs(z) > 122.0) return false;

  // 1. Elevation check: exclude ocean, harbor quay (Y=1.35), and low wet sandy beach
  const y = getWorldTerrainY(x, z);
  if (y < 1.65) return false;

  // 2. Exclude Central Villa, Veranda & Front Flagstone Courtyard
  if (x >= -29.5 && x <= 2.5 && z >= -13.5 && z <= 12.2) return false;

  // 3. Exclude East Harbor Quay & Ramp
  if (x >= 2.0 && x <= 48.0 && z >= -28.0 && z <= 24.0) return false;

  // 4. Exclude Sandy Cove Beach
  if (x >= -33.0 && x <= 9.0 && z >= 12.0 && z <= 52.0 && y < 2.15) return false;

  // 5. Exclude Creek Channel
  if (z >= -114.0 && z <= -23.0 && Math.abs(x - getCreekCenterX(z)) < 3.6) return false;

  // 6. Exclude Cliffside Gazebo Terrace & Hilltop Windmill Terrace
  if (Math.hypot(x + 64.0, z - 42.0) < 6.4) return false;
  if (Math.hypot(x + 52.0, z + 68.0) < 6.8) return false;

  // 7. Exclude Scenic Footpaths (width ~ 2.6m -> half-clearance < 1.85m)
  if (distToPolyline2D(x, z, WEST_GAZEBO_TRAIL) < 1.85) return false;
  if (distToPolyline2D(x, z, NORTH_WINDMILL_TRAIL) < 1.85) return false;

  return true;
}

function isTreeSpotAllowed(x, z, placedTrees, minSpacing = 4.2) {
  if (Math.abs(x) > 114.0 || Math.abs(z) > 114.0) return false;
  if (!isMeadowFloraAllowed(x, z)) return false;

  // Extra clearance from footpaths, terraces, villa walls, and steep cliff drops
  if (distToPolyline2D(x, z, WEST_GAZEBO_TRAIL) < 2.65) return false;
  if (distToPolyline2D(x, z, NORTH_WINDMILL_TRAIL) < 2.65) return false;
  if (Math.hypot(x + 64.0, z - 42.0) < 7.6) return false;
  if (Math.hypot(x + 52.0, z + 68.0) < 8.2) return false;
  if (x >= -30.6 && x <= 3.6 && z >= -14.6 && z <= 13.4) return false;
  if (z >= -114.0 && z <= -23.0 && Math.abs(x - getCreekCenterX(z)) < 4.5) return false;

  const nrm = getTerrainNormal(x, z, _tmpNormal);
  if (nrm.y < 0.78) return false;

  for (let i = 0; i < placedTrees.length; i += 1) {
    const t = placedTrees[i];
    if (Math.hypot(x - t.x, z - t.z) < minSpacing) return false;
  }
  return true;
}

const _tmpNormal = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);

// Smooth deterministic multi-octave botanical colony / drift field
function fbmMeadow(x, z, seedOffset = 0.0) {
  const s1 =
    Math.sin(x * 0.043 + seedOffset * 1.7) * Math.cos(z * 0.039 - seedOffset * 1.3) +
    0.65 * Math.sin((x * 0.72 - z * 0.68) * 0.068 + seedOffset * 2.9);
  const s2 =
    0.42 * Math.cos((x * 0.85 + z * 0.52) * 0.135 - seedOffset * 4.1) +
    0.24 * Math.sin(x * 0.24 - z * 0.21 + seedOffset * 5.7);
  return clamp(0.5 + 0.28 * (s1 + s2), 0.0, 1.0);
}

// ---------------------------------------------------------------------------
// Physically-Based Wind & Selective Petal-Tint Shader Modifiers
// ---------------------------------------------------------------------------

function attachCanopyWindShader(mat, uTimeRef, amp = 0.085, freq = 1.55, tag = "tree") {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTimeRef;
    shader.vertexShader =
      "uniform float uTime;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 wPos = modelMatrix * vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wPos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #endif
        float boughFlex = clamp((position.y - 0.8) * 0.32, 0.0, 1.35);
        float breeze = sin(uTime * ${freq.toFixed(2)} + wPos.x * 0.31 + wPos.z * 0.27)
                     + 0.45 * cos(uTime * ${(freq * 1.82).toFixed(2)} + wPos.y * 1.35 - wPos.x * 0.48);
        transformed.x += breeze * ${amp.toFixed(4)} * boughFlex;
        transformed.z += breeze * ${(amp * 0.76).toFixed(4)} * boughFlex;
        transformed.y += sin(uTime * ${(freq * 1.42).toFixed(2)} + wPos.z * 0.52) * ${(amp * 0.32).toFixed(4)} * boughFlex;`
      );
  };
  mat.customProgramCacheKey = () => `flora_canopy_${tag}_${amp.toFixed(4)}`;
  return mat;
}

function attachMeadowWindShader(mat, uTimeRef, opts = {}) {
  const swayAmp = opts.swayAmp !== undefined ? opts.swayAmp : 0.11;
  const maxH = opts.maxH !== undefined ? opts.maxH : 0.56;
  const usePetalMask = Boolean(opts.usePetalMask);
  const keyTag = opts.tag || "grass";

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTimeRef;
    let vs = "uniform float uTime;\n";
    if (usePetalMask) {
      vs += "attribute float aPetalMask;\n";
    }
    vs += shader.vertexShader;

    if (usePetalMask) {
      vs = vs.replace(
        "#include <color_vertex>",
        `vColor = vec4(1.0);
        #ifdef USE_COLOR
          vColor.rgb *= color;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, clamp(aPetalMask, 0.0, 1.0));
        #endif`
      );
    }

    vs = vs.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vec4 instOrigin = vec4(0.0, 0.0, 0.0, 1.0);
      #ifdef USE_INSTANCING
        instOrigin = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      #else
        instOrigin = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      #endif
      float hNorm = clamp(position.y / ${maxH.toFixed(3)}, 0.0, 1.25);
      float flex = hNorm * hNorm;
      float waveMain = sin(instOrigin.x * 0.105 + instOrigin.z * 0.075 + uTime * 1.92);
      float waveGust = 0.48 * sin(instOrigin.x * 0.32 - instOrigin.z * 0.26 + uTime * 3.15)
                     + 0.25 * cos((instOrigin.x + instOrigin.z) * 0.58 + uTime * 4.10);
      float windPush = (waveMain + waveGust) * ${swayAmp.toFixed(4)} * flex;
      transformed.x += windPush;
      transformed.z += windPush * 0.68;
      transformed.y -= abs(windPush) * 0.18 * flex;`
    );
    shader.vertexShader = vs;
  };
  mat.customProgramCacheKey = () => `meadow_wind_${keyTag}_${usePetalMask ? 1 : 0}`;
  return mat;
}

// ---------------------------------------------------------------------------
// High-Resolution (512x512) Botanical Alpha-Cutout Textures & Normal Maps
// ---------------------------------------------------------------------------

const _floraAssetCache = new Map();

function getCachedFloraAsset(key, builder) {
  if (!_floraAssetCache.has(key)) {
    _floraAssetCache.set(key, builder());
  }
  return _floraAssetCache.get(key);
}

function clampTexEdges(tex) {
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function drawSerratedLeaf2D(ctx, cx, cy, len, wid, angle, fillCol, veinCol, isHeight, hVal = 165) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  if (!isHeight) {
    ctx.fillStyle = "rgba(18, 30, 14, 0.24)";
    ctx.beginPath();
    ctx.ellipse(len * 0.22, 2.5, len * 0.26, wid * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const teeth = 9;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let i = 1; i <= teeth; i += 1) {
    const t = i / (teeth + 1);
    const env = Math.sin(Math.pow(t, 0.86) * Math.PI);
    const saw = i < teeth ? 1.12 : 1.0;
    ctx.lineTo(t * len, -wid * env * saw);
    if (i < teeth) {
      ctx.lineTo((t + 0.035) * len, -wid * env * 0.86);
    }
  }
  ctx.lineTo(len, 0);
  for (let i = teeth; i >= 1; i -= 1) {
    const t = i / (teeth + 1);
    const env = Math.sin(Math.pow(t, 0.86) * Math.PI);
    const saw = i < teeth ? 1.12 : 1.0;
    if (i < teeth) {
      ctx.lineTo((t + 0.035) * len, wid * env * 0.86);
    }
    ctx.lineTo(t * len, wid * env * saw);
  }
  ctx.closePath();

  if (isHeight) {
    const g = ctx.createLinearGradient(0, -wid, 0, wid);
    g.addColorStop(0.0, `rgb(${hVal - 22},${hVal - 22},${hVal - 22})`);
    g.addColorStop(0.5, `rgb(${hVal + 28},${hVal + 28},${hVal + 28})`);
    g.addColorStop(1.0, `rgb(${hVal - 22},${hVal - 22},${hVal - 22})`);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgb(236,236,236)";
    ctx.lineWidth = Math.max(1.2, wid * 0.14);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len * 0.94, 0);
    ctx.stroke();
  } else {
    ctx.fillStyle = fillCol;
    ctx.fill();
    ctx.fillStyle = "rgba(235, 252, 195, 0.12)";
    ctx.beginPath();
    ctx.ellipse(len * 0.46, -wid * 0.24, len * 0.36, wid * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = veinCol;
    ctx.lineWidth = Math.max(1.1, wid * 0.11);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len * 0.94, 0);
    ctx.stroke();

    ctx.lineWidth = Math.max(0.7, wid * 0.06);
    for (let v = 1; v <= 5; v += 1) {
      const vx = (v / 6.2) * len;
      const vw = wid * Math.sin((v / 6.2) * Math.PI) * 0.78;
      ctx.beginPath();
      ctx.moveTo(vx, 0);
      ctx.lineTo(vx + len * 0.09, -vw);
      ctx.moveTo(vx, 0);
      ctx.lineTo(vx + len * 0.09, vw);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawTwigSkeleton2D(ctx, subTwigs, barkDark, barkLight, isHeight) {
  ctx.lineCap = "round";
  ctx.strokeStyle = isHeight ? "rgb(198,198,198)" : barkDark;
  ctx.lineWidth = 7.5;
  ctx.beginPath();
  ctx.moveTo(256, 496);
  ctx.quadraticCurveTo(246, 300, 260, 62);
  ctx.stroke();

  if (!isHeight) {
    ctx.strokeStyle = barkLight;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(254, 492);
    ctx.quadraticCurveTo(244, 300, 258, 66);
    ctx.stroke();
  }

  for (let i = 0; i < subTwigs.length; i += 1) {
    const st = subTwigs[i];
    ctx.strokeStyle = isHeight ? "rgb(184,184,184)" : barkDark;
    ctx.lineWidth = st.w;
    ctx.beginPath();
    ctx.moveTo(st.x0, st.y0);
    ctx.quadraticCurveTo(st.cx, st.cy, st.x1, st.y1);
    ctx.stroke();
  }
}

function getLeafSprayAssets() {
  return getCachedFloraAsset("leafSpray", () => {
    const palette = ["#2d5a27", "#3e7533", "#558f41", "#6da64c"];
    const twigs = [
      { x0: 254, y0: 430, cx: 185, cy: 392, x1: 102, y1: 338, w: 4.4 },
      { x0: 253, y0: 396, cx: 325, cy: 360, x1: 412, y1: 304, w: 4.2 },
      { x0: 251, y0: 332, cx: 172, cy: 288, x1: 84, y1: 224, w: 3.8 },
      { x0: 252, y0: 292, cx: 334, cy: 250, x1: 424, y1: 188, w: 3.6 },
      { x0: 255, y0: 218, cx: 188, cy: 176, x1: 118, y1: 118, w: 3.1 },
      { x0: 257, y0: 178, cx: 318, cy: 140, x1: 388, y1: 88, w: 2.9 },
    ];
    const paint = (ctx, w, h, isHeight) => {
      const rng = mulberry32(9101);
      if (isHeight) {
        ctx.fillStyle = "#808080";
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
      drawTwigSkeleton2D(ctx, twigs, "#4f3927", "#75583f", isHeight);

      // 40 overlapping serrated elliptical/lanceolate leaves along twigs & crown
      for (let i = 0; i < 40; i += 1) {
        const tw = twigs[i % twigs.length];
        const u = 0.16 + ((i / 40) * 0.82 + rng() * 0.18) % 0.84;
        const bx = (1 - u) * (1 - u) * tw.x0 + 2 * (1 - u) * u * tw.cx + u * u * tw.x1;
        const by = (1 - u) * (1 - u) * tw.y0 + 2 * (1 - u) * u * tw.cy + u * u * tw.y1;
        const mixCenter = i >= 32 ? 1.0 : 0.0;
        const lx = mixCenter ? 256 + (rng() - 0.5) * 44 : bx + (rng() - 0.5) * 16;
        const ly = mixCenter ? 56 + (i - 32) * 34 : by + (rng() - 0.5) * 14;
        const baseAng = mixCenter
          ? -Math.PI * 0.5 + (rng() - 0.5) * 0.95
          : Math.atan2(tw.y1 - tw.y0, tw.x1 - tw.x0) + (i % 2 === 0 ? -0.58 : 0.58) + (rng() - 0.5) * 0.28;
        const len = 68 + rng() * 34;
        const wid = 21 + rng() * 10;
        const col = palette[Math.floor(rng() * palette.length)];
        drawSerratedLeaf2D(ctx, lx, ly, len, wid, baseAng, col, "rgba(182,218,128,0.62)", isHeight, 148 + Math.floor(rng() * 44));
      }
    };

    const map = clampTexEdges(makeCanvasTex(512, 512, (ctx, w, h) => paint(ctx, w, h, false)));
    const normalMap = clampTexEdges(makeNormalTex(512, 512, (ctx, w, h) => paint(ctx, w, h, true), { strength: 2.35 }));
    const depthMat = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map,
      alphaTest: 0.42,
    });
    return { map, normalMap, depthMat };
  });
}

function drawNotchedBlossom2D(ctx, cx, cy, radius, rot, toneIdx, isHeight) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  const tones = ["#f9d5e2", "#fff6f9", "#f6c6d8", "#fce8ef"];
  const baseHex = tones[toneIdx % tones.length];

  for (let p = 0; p < 5; p += 1) {
    ctx.save();
    ctx.rotate((p * Math.PI * 2) / 5);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-radius * 0.56, -radius * 0.32, -radius * 0.62, -radius * 0.88, -radius * 0.14, -radius);
    ctx.lineTo(0, -radius * 0.83);
    ctx.lineTo(radius * 0.14, -radius);
    ctx.bezierCurveTo(radius * 0.62, -radius * 0.88, radius * 0.56, -radius * 0.32, 0, 0);
    ctx.closePath();

    if (isHeight) {
      const hg = ctx.createRadialGradient(0, -radius * 0.45, radius * 0.06, 0, -radius * 0.45, radius * 0.62);
      hg.addColorStop(0.0, "rgb(154,154,154)");
      hg.addColorStop(1.0, "rgb(218,218,218)");
      ctx.fillStyle = hg;
      ctx.fill();
    } else {
      const pg = ctx.createRadialGradient(0, 0, radius * 0.05, 0, -radius * 0.45, radius * 0.92);
      pg.addColorStop(0.0, "#e388a8");
      pg.addColorStop(0.32, baseHex);
      pg.addColorStop(1.0, "#fff8fa");
      ctx.fillStyle = pg;
      ctx.fill();
      ctx.strokeStyle = "rgba(218, 122, 156, 0.28)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();
  }

  if (isHeight) {
    ctx.fillStyle = "rgb(242,242,242)";
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "rgba(227, 118, 156, 0.55)";
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.18, 0, Math.PI * 2);
    ctx.fill();
    for (let s = 0; s < 12; s += 1) {
      const sa = (s / 12) * Math.PI * 2;
      const sr = radius * (0.24 + (s % 2) * 0.09);
      ctx.strokeStyle = "rgba(255, 240, 224, 0.85)";
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(sa) * sr, Math.sin(sa) * sr);
      ctx.stroke();
      ctx.fillStyle = s % 2 === 0 ? "#f2be3d" : "#df9826";
      ctx.beginPath();
      ctx.arc(Math.cos(sa) * sr, Math.sin(sa) * sr, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function getBlossomSprayAssets() {
  return getCachedFloraAsset("blossomSpray", () => {
    const twigs = [
      { x0: 256, y0: 446, cx: 178, cy: 400, x1: 92, y1: 342, w: 4.6 },
      { x0: 255, y0: 408, cx: 332, cy: 368, x1: 422, y1: 308, w: 4.4 },
      { x0: 252, y0: 334, cx: 168, cy: 286, x1: 78, y1: 218, w: 3.9 },
      { x0: 253, y0: 292, cx: 338, cy: 248, x1: 430, y1: 184, w: 3.7 },
      { x0: 256, y0: 212, cx: 186, cy: 168, x1: 112, y1: 108, w: 3.1 },
      { x0: 258, y0: 174, cx: 322, cy: 132, x1: 394, y1: 82, w: 2.9 },
    ];
    const paint = (ctx, w, h, isHeight) => {
      const rng = mulberry32(9205);
      if (isHeight) {
        ctx.fillStyle = "#808080";
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
      drawTwigSkeleton2D(ctx, twigs, "#3f2624", "#66403c", isHeight);

      // 12 tender spring-green serrated cherry leaves tucked along twigs
      const leafCols = ["#4f7f36", "#649644", "#739b48"];
      for (let i = 0; i < 12; i += 1) {
        const tw = twigs[i % twigs.length];
        const u = 0.25 + (i / 12) * 0.58;
        const lx = (1 - u) * (1 - u) * tw.x0 + 2 * (1 - u) * u * tw.cx + u * u * tw.x1;
        const ly = (1 - u) * (1 - u) * tw.y0 + 2 * (1 - u) * u * tw.cy + u * u * tw.y1;
        const ang = Math.atan2(tw.y1 - tw.y0, tw.x1 - tw.x0) + (i % 2 === 0 ? -0.68 : 0.68);
        drawSerratedLeaf2D(ctx, lx, ly, 58 + rng() * 20, 18 + rng() * 6, ang, leafCols[i % 3], "rgba(202,232,148,0.65)", isHeight, 152);
      }

      // 34 detailed 5-petal notched cherry/almond blossoms + 8 rosy unopened buds
      for (let b = 0; b < 34; b += 1) {
        const tw = twigs[b % twigs.length];
        const u = 0.14 + ((b * 0.19 + rng() * 0.24) % 0.86);
        const topCrown = b >= 28;
        const bx = topCrown
          ? 256 + (rng() - 0.5) * 92
          : (1 - u) * (1 - u) * tw.x0 + 2 * (1 - u) * u * tw.cx + u * u * tw.x1 + (rng() - 0.5) * 32;
        const by = topCrown
          ? 64 + (b - 28) * 32 + (rng() - 0.5) * 18
          : (1 - u) * (1 - u) * tw.y0 + 2 * (1 - u) * u * tw.cy + u * u * tw.y1 + (rng() - 0.5) * 30;
        drawNotchedBlossom2D(ctx, bx, by, 26 + rng() * 13, rng() * Math.PI * 2, b, isHeight);
      }

      for (let k = 0; k < 8; k += 1) {
        const tw = twigs[k % twigs.length];
        const bx = tw.x1 + (rng() - 0.5) * 24;
        const by = tw.y1 + (rng() - 0.5) * 24;
        ctx.fillStyle = isHeight ? "rgb(212,212,212)" : "#e889a8";
        ctx.beginPath();
        ctx.ellipse(bx, by, 8.5, 5.5, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const map = clampTexEdges(makeCanvasTex(512, 512, (ctx, w, h) => paint(ctx, w, h, false)));
    const normalMap = clampTexEdges(makeNormalTex(512, 512, (ctx, w, h) => paint(ctx, w, h, true), { strength: 2.1 }));
    const depthMat = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map,
      alphaTest: 0.40,
    });
    return { map, normalMap, depthMat };
  });
}

function getOliveSprayAssets() {
  return getCachedFloraAsset("oliveSpray", () => {
    const palette = ["#5f7a58", "#6d8864", "#8ca383", "#a8b89f"];
    const twigs = [
      { x0: 255, y0: 444, cx: 184, cy: 394, x1: 104, y1: 332, w: 4.1 },
      { x0: 255, y0: 404, cx: 326, cy: 362, x1: 410, y1: 300, w: 3.9 },
      { x0: 253, y0: 326, cx: 174, cy: 278, x1: 92, y1: 212, w: 3.5 },
      { x0: 254, y0: 286, cx: 332, cy: 242, x1: 418, y1: 178, w: 3.4 },
      { x0: 256, y0: 204, cx: 192, cy: 162, x1: 124, y1: 104, w: 2.8 },
      { x0: 257, y0: 168, cx: 318, cy: 128, x1: 386, y1: 78, w: 2.7 },
    ];
    const paint = (ctx, w, h, isHeight) => {
      const rng = mulberry32(9311);
      if (isHeight) {
        ctx.fillStyle = "#808080";
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
      drawTwigSkeleton2D(ctx, twigs, "#696154", "#8e8577", isHeight);

      // 46 slender lance-shaped sage & silver-underside Mediterranean olive leaves
      for (let i = 0; i < 46; i += 1) {
        const tw = twigs[i % twigs.length];
        const u = 0.12 + ((i / 46) * 0.85 + rng() * 0.14) % 0.86;
        const top = i >= 38;
        const lx = top ? 256 + (rng() - 0.5) * 42 : (1 - u) * (1 - u) * tw.x0 + 2 * (1 - u) * u * tw.cx + u * u * tw.x1;
        const ly = top ? 56 + (i - 38) * 32 : (1 - u) * (1 - u) * tw.y0 + 2 * (1 - u) * u * tw.cy + u * u * tw.y1;
        const ang = top
          ? -Math.PI * 0.5 + (rng() - 0.5) * 0.9
          : Math.atan2(tw.y1 - tw.y0, tw.x1 - tw.x0) + (i % 2 === 0 ? -0.52 : 0.52) + (rng() - 0.5) * 0.2;
        const len = 66 + rng() * 28;
        const wid = 11.5 + rng() * 4.5;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(len * 0.48, -wid, len, 0);
        ctx.quadraticCurveTo(len * 0.48, wid, 0, 0);
        ctx.closePath();
        ctx.fillStyle = isHeight ? `rgb(${155 + (i % 4) * 14},${155 + (i % 4) * 14},${155 + (i % 4) * 14})` : palette[i % palette.length];
        ctx.fill();
        ctx.strokeStyle = isHeight ? "rgb(230,230,230)" : "rgba(225,232,216,0.62)";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(len * 0.92, 0);
        ctx.stroke();
        ctx.restore();
      }
    };
    const map = clampTexEdges(makeCanvasTex(512, 512, (ctx, w, h) => paint(ctx, w, h, false)));
    const normalMap = clampTexEdges(makeNormalTex(512, 512, (ctx, w, h) => paint(ctx, w, h, true), { strength: 2.1 }));
    const depthMat = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map,
      alphaTest: 0.40,
    });
    return { map, normalMap, depthMat };
  });
}

function getCypressSprayAssets() {
  return getCachedFloraAsset("cypressSpray", () => {
    const palette = ["#203d22", "#2b522a", "#386634", "#48783e"];
    const paint = (ctx, w, h, isHeight) => {
      const rng = mulberry32(9417);
      if (isHeight) {
        ctx.fillStyle = "#808080";
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
      ctx.strokeStyle = isHeight ? "rgb(190,190,190)" : "#4c3829";
      ctx.lineWidth = 6.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(256, 498);
      ctx.lineTo(256, 36);
      ctx.stroke();

      for (let i = 0; i < 54; i += 1) {
        const t = i / 54;
        const y = 475 - t * 425;
        const span = (1.0 - t * 0.72) * 165 + 24;
        const side = i % 2 === 0 ? -1 : 1;
        const ang = -Math.PI * 0.5 + side * (0.34 + rng() * 0.28);
        const len = span * (0.68 + rng() * 0.36);
        drawSerratedLeaf2D(
          ctx,
          256 + side * 3,
          y,
          len,
          14 + (1 - t) * 9,
          ang,
          palette[i % palette.length],
          "rgba(128,168,108,0.45)",
          isHeight,
          148 + (i % 5) * 14
        );
      }
    };
    const map = clampTexEdges(makeCanvasTex(512, 512, (ctx, w, h) => paint(ctx, w, h, false)));
    const normalMap = clampTexEdges(makeNormalTex(512, 512, (ctx, w, h) => paint(ctx, w, h, true), { strength: 2.3 }));
    const depthMat = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map,
      alphaTest: 0.42,
    });
    return { map, normalMap, depthMat };
  });
}

function getBirchBarkTextures() {
  return getCachedFloraAsset("birchBark", () => {
    const paint = (ctx, w, h, isHeight) => {
      const rng = mulberry32(9521);
      ctx.fillStyle = isHeight ? "#b8b8b8" : "#e8e3d9";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 240; i += 1) {
        const y = rng() * h;
        const x = rng() * w;
        const lw = 14 + rng() * 48;
        const lh = 1.5 + rng() * 3.8;
        ctx.fillStyle = isHeight ? "rgb(68,68,68)" : `rgba(48,44,40,${(0.35 + rng() * 0.45).toFixed(2)})`;
        ctx.fillRect(x, y, lw, lh);
      }
      ctx.fillStyle = isHeight ? "rgb(52,52,52)" : "rgba(58,52,45,0.72)";
      ctx.fillRect(0, h * 0.82, w, h * 0.18);
    };
    const map = makeCanvasTex(256, 512, (ctx, w, h) => paint(ctx, w, h, false), { repeatX: 2, repeatY: 5 });
    const normalMap = makeNormalTex(256, 512, (ctx, w, h) => paint(ctx, w, h, true), { strength: 2.8, repeatX: 2, repeatY: 5 });
    return { map, normalMap };
  });
}

function getPetalVelvetTextures() {
  return getCachedFloraAsset("petalVelvet", () => {
    const paint = (ctx, w, h, isHeight) => {
      const rng = mulberry32(9633);
      ctx.fillStyle = isHeight ? "#888888" : "#ffffff";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 96; i += 1) {
        const x = (i / 96) * w;
        ctx.strokeStyle = isHeight
          ? `rgb(${124 + Math.floor(rng() * 34)},${124 + Math.floor(rng() * 34)},${124 + Math.floor(rng() * 34)})`
          : `rgba(235,226,230,${(0.18 + rng() * 0.18).toFixed(2)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(w * 0.5 + (x - w * 0.5) * 0.18, h);
        ctx.quadraticCurveTo(x, h * 0.5, x, 0);
        ctx.stroke();
      }
    };
    const map = clampTexEdges(makeCanvasTex(256, 256, (ctx, w, h) => paint(ctx, w, h, false)));
    const normalMap = clampTexEdges(makeNormalTex(256, 256, (ctx, w, h) => paint(ctx, w, h, true), { strength: 1.45 }));
    return { map, normalMap };
  });
}

// ---------------------------------------------------------------------------
// Multi-Branching 3D Trees (88 Realistic Trees across 4 Species — Zero Balls)
// ---------------------------------------------------------------------------

function buildCurvedBranchTube(points, rBase, rTip, rings = 8, radSegs = 7, rootFlare = 0.0) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(rings, false);
  const pos = [];
  const nrm = [];
  const uvs = [];
  const idx = [];
  const vTemp = new THREE.Vector3();
  const nTemp = new THREE.Vector3();

  for (let i = 0; i <= rings; i += 1) {
    const t = i / rings;
    const pt = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const baseR = lerp(rBase, rTip, Math.pow(t, 0.82));

    for (let j = 0; j <= radSegs; j += 1) {
      const u = j / radSegs;
      const th = u * Math.PI * 2.0;
      const cosT = Math.cos(th);
      const sinT = Math.sin(th);
      const flare =
        rootFlare > 0.0 ? 1.0 + rootFlare * Math.pow(1.0 - t, 3.2) * (1.0 + 0.32 * Math.cos(th * 5.0)) : 1.0;
      const r = baseR * flare;

      nTemp.set(0, 0, 0).addScaledVector(N, cosT).addScaledVector(B, sinT).normalize();
      vTemp.copy(pt).addScaledVector(nTemp, r);
      pos.push(vTemp.x, vTemp.y, vTemp.z);
      nrm.push(nTemp.x, nTemp.y, nTemp.z);
      uvs.push(u, t);
    }
  }

  const stride = radSegs + 1;
  for (let i = 0; i < rings; i += 1) {
    for (let j = 0; j < radSegs; j += 1) {
      const a = i * stride + j;
      const b = a + stride;
      const c = b + 1;
      const d = a + 1;
      idx.push(a, b, d, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  return geo.toNonIndexed();
}

function createCamberedFrondCard(size, pos, dir, roll, shade, rng) {
  const card = new THREE.PlaneGeometry(size, size, 2, 2);
  const pAttr = card.attributes.position;
  for (let i = 0; i < pAttr.count; i += 1) {
    const x = pAttr.getX(i);
    const y = pAttr.getY(i) + size * 0.40;
    const nx = x / (size * 0.5);
    const ny = y / size;
    const camberZ = -0.15 * size * nx * nx - 0.16 * size * ny * ny;
    pAttr.setXYZ(i, x, y, camberZ);
  }
  card.computeVertexNormals();

  const nonIdx = card.toNonIndexed();
  card.dispose();

  const quat = new THREE.Quaternion().setFromUnitVectors(_upVec, dir.clone().normalize());
  const spin = new THREE.Quaternion().setFromAxisAngle(_upVec, roll + (rng() - 0.5) * 0.45);
  quat.multiply(spin);
  const mat4 = new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(1, 1, 1));
  nonIdx.applyMatrix4(mat4);

  const count = nonIdx.attributes.position.count;
  const cols = new Float32Array(count * 3);
  const cObj = new THREE.Color().setHSL(0.0, 0.0, clamp(shade, 0.72, 1.06));
  for (let i = 0; i < count; i += 1) {
    const localBright = lerp(0.84, 1.06, (i % 6) / 5.0) * cObj.r;
    cols[i * 3 + 0] = localBright;
    cols[i * 3 + 1] = localBright;
    cols[i * 3 + 2] = localBright * 0.96;
  }
  nonIdx.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return nonIdx;
}

function getTreeArchetype(species, variantIdx) {
  return getCachedFloraAsset(`treeArch_${species}_${variantIdx}`, () => {
    const rng = mulberry32(14000 + variantIdx * 317 + species.charCodeAt(0) * 97);
    const woodParts = [];
    const frondParts = [];
    const sprayAnchors = [];

    if (species === "cypress") {
      // Tall slender Mediterranean coastal spire: 8-ring trunk + 18 steep ascending limbs + 74 sprays
      const h = 11.4 + variantIdx * 0.9;
      const trunkPts = [
        new THREE.Vector3(0, -0.15, 0),
        new THREE.Vector3((rng() - 0.5) * 0.14, h * 0.34, (rng() - 0.5) * 0.14),
        new THREE.Vector3((rng() - 0.5) * 0.18, h * 0.68, (rng() - 0.5) * 0.18),
        new THREE.Vector3(0, h * 0.96, 0),
      ];
      woodParts.push(buildCurvedBranchTube(trunkPts, 0.24, 0.03, 8, 7, 0.36));

      for (let b = 0; b < 18; b += 1) {
        const t = b / 17;
        const by = 1.25 + t * (h * 0.80);
        const az = b * 2.39996 + rng() * 0.35;
        const env = Math.sin(Math.pow(t, 0.72) * Math.PI * 0.92) * 0.95 + 0.18;
        const reach = env * 0.78;
        const rise = 1.15 + (1.0 - t) * 0.65;
        const p0 = new THREE.Vector3(0, by, 0);
        const p1 = new THREE.Vector3(Math.cos(az) * reach * 0.65, by + rise * 0.5, Math.sin(az) * reach * 0.65);
        const p2 = new THREE.Vector3(Math.cos(az) * reach, by + rise, Math.sin(az) * reach);
        woodParts.push(buildCurvedBranchTube([p0, p1, p2], 0.065 * (1.1 - t * 0.5), 0.016, 4, 5, 0));
        sprayAnchors.push({ pos: p1, dir: p2.clone().sub(p0), size: 1.38 * (1.08 - t * 0.38), shade: 0.82 + t * 0.2 });
        sprayAnchors.push({ pos: p2, dir: new THREE.Vector3(Math.cos(az) * 0.34, 1.0, Math.sin(az) * 0.34), size: 1.32 * (1.05 - t * 0.42), shade: 0.88 + t * 0.18 });
      }
      sprayAnchors.push({ pos: new THREE.Vector3(0, h * 0.93, 0), dir: new THREE.Vector3(0.04, 1, 0), size: 1.25, shade: 1.04 });
    } else {
      // Cherry, Oak, Silver Birch & Olive: 8-ring curved trunk -> 5 primary limbs -> 12 secondary -> 14 twigs
      const cfg = {
        cherry: { h: 3.1, r0: 0.28, spread: 2.85, lift: 2.35, card: 1.68, flare: 0.44 },
        oak: { h: 3.6, r0: 0.36, spread: 3.25, lift: 3.05, card: 1.74, flare: 0.55 },
        birch: { h: 4.3, r0: 0.22, spread: 2.35, lift: 3.45, card: 1.52, flare: 0.32 },
        olive: { h: 2.2, r0: 0.33, spread: 2.65, lift: 1.95, card: 1.56, flare: 0.62 },
      }[species];

      const leanX = (rng() - 0.5) * (species === "olive" ? 0.68 : 0.38);
      const leanZ = (rng() - 0.5) * (species === "olive" ? 0.68 : 0.38);
      const topTrunk = new THREE.Vector3(leanX, cfg.h, leanZ);
      const trunkPts = [
        new THREE.Vector3(0, -0.18, 0),
        new THREE.Vector3(leanX * 0.35 + (rng() - 0.5) * 0.18, cfg.h * 0.36, leanZ * 0.35 + (rng() - 0.5) * 0.18),
        new THREE.Vector3(leanX * 0.78 - (rng() - 0.5) * 0.16, cfg.h * 0.72, leanZ * 0.78 + (rng() - 0.5) * 0.16),
        topTrunk,
      ];
      woodParts.push(buildCurvedBranchTube(trunkPts, cfg.r0, cfg.r0 * 0.54, 8, 8, cfg.flare));

      const nPrimary = 5;
      for (let p = 0; p < nPrimary; p += 1) {
        const az = (p / nPrimary) * Math.PI * 2.0 + (rng() - 0.5) * 0.42;
        const startY = cfg.h * (0.72 + (p % 2) * 0.14);
        const pStart = new THREE.Vector3(leanX * (startY / cfg.h), startY, leanZ * (startY / cfg.h));
        const reach = cfg.spread * (0.76 + rng() * 0.34);
        const rise = cfg.lift * (0.78 + rng() * 0.34);
        const pMid = new THREE.Vector3(
          pStart.x + Math.cos(az) * reach * 0.54,
          pStart.y + rise * 0.62,
          pStart.z + Math.sin(az) * reach * 0.54
        );
        const pEnd = new THREE.Vector3(
          pStart.x + Math.cos(az) * reach,
          pStart.y + rise,
          pStart.z + Math.sin(az) * reach
        );
        woodParts.push(buildCurvedBranchTube([pStart, pMid, pEnd], cfg.r0 * 0.44, cfg.r0 * 0.17, 5, 6, 0));
        sprayAnchors.push({ pos: pEnd, dir: pEnd.clone().sub(pMid), size: cfg.card, shade: 0.96 });

        // 2-3 secondary branches per primary limb (12-13 total) + fine outer twigs
        const nSec = p < 3 ? 3 : 2;
        for (let s = 0; s < nSec; s += 1) {
          const u = 0.46 + s * 0.25;
          const sBase = pStart.clone().lerp(pEnd, u);
          const sAz = az + (s - 0.8) * 0.72 + (rng() - 0.5) * 0.3;
          const sLen = reach * (0.44 + rng() * 0.22);
          const sRise = rise * (0.32 + rng() * 0.32) * (species === "birch" ? 0.68 : 1.0);
          const sMid = new THREE.Vector3(
            sBase.x + Math.cos(sAz) * sLen * 0.55,
            sBase.y + sRise * 0.65,
            sBase.z + Math.sin(sAz) * sLen * 0.55
          );
          const sTip = new THREE.Vector3(
            sBase.x + Math.cos(sAz) * sLen,
            sBase.y + sRise,
            sBase.z + Math.sin(sAz) * sLen
          );
          woodParts.push(buildCurvedBranchTube([sBase, sMid, sTip], cfg.r0 * 0.19, 0.022, 4, 5, 0));
          sprayAnchors.push({ pos: sMid, dir: sTip.clone().sub(sBase), size: cfg.card * 0.94, shade: 0.86 });
          sprayAnchors.push({ pos: sTip, dir: sTip.clone().sub(sMid), size: cfg.card * 1.02, shade: 1.02 });

          // Fine outer twig fork
          const twAz = sAz + (s % 2 === 0 ? 0.52 : -0.52);
          const twTip = new THREE.Vector3(
            sTip.x + Math.cos(twAz) * 0.62,
            sTip.y + (species === "birch" ? -0.12 : 0.34),
            sTip.z + Math.sin(twAz) * 0.62
          );
          woodParts.push(buildCurvedBranchTube([sTip, twTip], 0.024, 0.011, 2, 4, 0));
          sprayAnchors.push({ pos: twTip, dir: twTip.clone().sub(sTip), size: cfg.card * 0.92, shade: 1.04 });
        }
      }
    }

    // Crossed & arched 3D frond pairs (~68-82 curved botanical sprays per tree)
    for (let i = 0; i < sprayAnchors.length; i += 1) {
      const a = sprayAnchors[i];
      frondParts.push(createCamberedFrondCard(a.size, a.pos, a.dir, i * 1.1, a.shade, rng));
      const crossDir = a.dir.clone().add(new THREE.Vector3((rng() - 0.5) * 0.55, 0.28, (rng() - 0.5) * 0.55));
      frondParts.push(createCamberedFrondCard(a.size * 0.93, a.pos, crossDir, i * 1.1 + 1.57, a.shade * 0.94, rng));
    }

    const woodGeo = mergeGeometries(woodParts, false);
    const canopyGeo = mergeGeometries(frondParts, false);
    woodParts.forEach((g) => g.dispose());
    frondParts.forEach((g) => g.dispose());
    woodGeo.computeBoundingSphere();
    canopyGeo.computeBoundingSphere();
    return { woodGeo, canopyGeo };
  });
}

function placeTreeMeshPair(group, arch, barkMat, leafMat, depthMat, x, z, yaw, scale, leanX, leanZ, registerCol) {
  const y = getWorldTerrainY(x, z);
  const holder = new THREE.Group();
  holder.position.set(x, y - 0.06, z);
  holder.rotation.set(leanX, yaw, leanZ);
  holder.scale.setScalar(scale);

  const barkMesh = new THREE.Mesh(arch.woodGeo, barkMat);
  barkMesh.castShadow = true;
  barkMesh.receiveShadow = true;

  const canopyMesh = new THREE.Mesh(arch.canopyGeo, leafMat);
  canopyMesh.castShadow = true;
  canopyMesh.receiveShadow = true;
  canopyMesh.customDepthMaterial = depthMat;

  holder.add(barkMesh, canopyMesh);
  group.add(holder);

  if (registerCol) {
    registerCircleCollider(x, z, 0.36);
  }
}

function findValidTreeCoords(prefX, prefZ, placedTrees, rng, searchRadius = 11.0, minSpacing = 4.2) {
  if (isTreeSpotAllowed(prefX, prefZ, placedTrees, minSpacing)) {
    return { x: prefX, z: prefZ };
  }
  for (let a = 0; a < 42; a += 1) {
    const r = 1.2 + (a / 42) * searchRadius;
    const th = a * 2.39996 + rng() * 0.5;
    const cx = prefX + Math.cos(th) * r;
    const cz = prefZ + Math.sin(th) * r;
    if (isTreeSpotAllowed(cx, cz, placedTrees, minSpacing)) {
      return { x: cx, z: cz };
    }
  }
  return null;
}

function buildAllBotanicalTrees(group, uTimeRef) {
  const treeGroup = new THREE.Group();
  treeGroup.name = "BotanicalTrees88";
  const rng = mulberry32(20409);

  const barkOak = getBarkTextures(2, 6);
  const barkBirch = getBirchBarkTextures();
  const leafAssets = getLeafSprayAssets();
  const blossomAssets = getBlossomSprayAssets();
  const oliveAssets = getOliveSprayAssets();
  const cypressAssets = getCypressSprayAssets();

  const oakBarkMat = new THREE.MeshStandardMaterial({
    color: 0xa6917c,
    map: barkOak.map,
    normalMap: barkOak.normalMap,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughness: 0.88,
  });
  const cherryBarkMat = new THREE.MeshStandardMaterial({
    color: 0x7c5750,
    map: barkOak.map,
    normalMap: barkOak.normalMap,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughness: 0.80,
  });
  const oliveBarkMat = new THREE.MeshStandardMaterial({
    color: 0xb5aea0,
    map: barkOak.map,
    normalMap: barkOak.normalMap,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughness: 0.90,
  });
  const birchBarkMat = new THREE.MeshStandardMaterial({
    color: 0xf4f0e8,
    map: barkBirch.map,
    normalMap: barkBirch.normalMap,
    normalScale: new THREE.Vector2(0.82, 0.82),
    roughness: 0.76,
  });

  const makeFoliageMat = (assets, tintHex, alphaCut, amp, tag) =>
    attachCanopyWindShader(
      new THREE.MeshStandardMaterial({
        color: tintHex,
        map: assets.map,
        normalMap: assets.normalMap,
        normalScale: new THREE.Vector2(0.72, 0.72),
        alphaTest: alphaCut,
        side: THREE.DoubleSide,
        vertexColors: true,
        roughness: 0.58,
        metalness: 0.02,
      }),
      uTimeRef,
      amp,
      1.55,
      tag
    );

  const cherryLeafMat = makeFoliageMat(blossomAssets, 0xffffff, 0.40, 0.085, "cherry");
  const oakLeafMat = makeFoliageMat(leafAssets, 0xf6faec, 0.42, 0.078, "oak");
  const birchLeafMat = makeFoliageMat(leafAssets, 0xfaffea, 0.42, 0.098, "birch");
  const oliveLeafMat = makeFoliageMat(oliveAssets, 0xf7faf4, 0.40, 0.072, "olive");
  const cypressLeafMat = makeFoliageMat(cypressAssets, 0xf2f7ee, 0.42, 0.055, "cypress");

  const placedTrees = [];
  const spawnList = [];

  // 1. 26 Flowering Coastal Cherry/Almond Trees (Villa courtyard edge, Gazebo trail, Creek bridge, North hills)
  const cherryHints = [
    [-32.5, -4.5], [-32.0, 7.5], [-24.5, 14.5], [-19.5, -16.2], [-3.2, -16.5],
    [-35.0, 12.2], [-44.5, 12.8], [-44.2, 23.5], [-53.5, 25.0], [-60.5, 34.5],
    [2.8, -33.5], [14.2, -39.5], [4.2, -48.5], [15.5, -49.0], [-5.5, -56.0],
    [-22.0, -45.0], [-36.0, -34.0], [-48.0, -24.0], [-62.0, -12.0], [-74.0, 16.0],
    [-18.0, -68.0], [-40.0, -76.0], [18.0, -64.0], [-68.0, 54.0], [-82.0, -32.0], [-28.0, -28.0],
  ];
  cherryHints.forEach((p) => spawnList.push({ sp: "cherry", x: p[0], z: p[1] }));

  // 2. 26 Sunlit Coastal Oak (13) & Silver Birch (13) Trees (woodland hills & creek)
  const oakBirchHints = [
    [-42, -46], [-58, -40], [-76, -54], [-92, -36], [-88, -10], [-96, 18], [-86, 44],
    [-72, 66], [-48, 56], [22, -38], [26, -54], [20, -78], [4, -84],
    [-14, -88], [-34, -92], [-64, -84], [-84, -76], [16, -94], [-8, -36], [-24, -58],
    [-54, -18], [-68, 8], [-78, 28], [-42, 34], [28, -70], [-98, -58],
  ];
  oakBirchHints.forEach((p, idx) => spawnList.push({ sp: idx % 2 === 0 ? "oak" : "birch", x: p[0], z: p[1] }));

  // 3. 18 Mediterranean Olive Trees (Harbor promenade rim, Villa terrace perimeter & coastal bluffs)
  const oliveHints = [
    [-0.2, -22.0], [0.4, -16.5], [5.5, -31.2], [14.5, -31.8], [24.0, -31.5], [33.5, -31.2],
    [-0.5, 14.8], [-31.8, -11.5], [-33.5, 16.5], [-38.5, 24.5], [-46.0, 38.0], [-54.0, 48.0],
    [-72.0, 38.0], [-56.0, 62.0], [-82.0, 58.0], [-66.0, 26.0], [28.0, -44.0], [-40.0, -18.0],
  ];
  oliveHints.forEach((p) => spawnList.push({ sp: "olive", x: p[0], z: p[1] }));

  // 4. 18 Tall Slender Italian Coastal Cypresses (Villa approach, Windmill road & Sea-Stack Islet at (58, 56))
  const cypressHints = [
    [-31.2, -8.5], [-31.2, -1.8], [-12.5, -16.0], [-6.0, -16.0], [-2.0, -24.5],
    [5.2, -39.0], [-6.5, -49.0], [-18.5, -56.0], [-29.0, -63.0], [-41.5, -67.5],
    [-46.0, -76.5], [-59.5, -74.0], [-61.0, -61.5], [-26.0, -21.0], [-36.0, -52.0],
  ];
  cypressHints.forEach((p) => spawnList.push({ sp: "cypress", x: p[0], z: p[1] }));

  for (let i = 0; i < spawnList.length; i += 1) {
    const item = spawnList[i];
    let spot = findValidTreeCoords(item.x, item.z, placedTrees, rng, 15.0, 3.8);
    if (!spot) {
      for (let tries = 0; tries < 80; tries += 1) {
        const rx = -105 + rng() * 138;
        const rz = -105 + rng() * 175;
        if (isTreeSpotAllowed(rx, rz, placedTrees, 4.0)) {
          spot = { x: rx, z: rz };
          break;
        }
      }
    }
    if (!spot) continue;
    placedTrees.push(spot);

    const vIdx = i % 2;
    const arch = getTreeArchetype(item.sp, vIdx);
    const scale =
      item.sp === "cypress"
        ? 0.88 + rng() * 0.28
        : item.sp === "olive"
          ? 0.90 + rng() * 0.24
          : 0.92 + rng() * 0.30;
    const yaw = rng() * Math.PI * 2.0;
    const leanX = (rng() - 0.5) * 0.05;
    const leanZ = (rng() - 0.5) * 0.05;

    const matMap = {
      cherry: [cherryBarkMat, cherryLeafMat, blossomAssets.depthMat],
      oak: [oakBarkMat, oakLeafMat, leafAssets.depthMat],
      birch: [birchBarkMat, birchLeafMat, leafAssets.depthMat],
      olive: [oliveBarkMat, oliveLeafMat, oliveAssets.depthMat],
      cypress: [oakBarkMat, cypressLeafMat, cypressAssets.depthMat],
    }[item.sp];

    placeTreeMeshPair(treeGroup, arch, matMap[0], matMap[1], matMap[2], spot.x, spot.z, yaw, scale, leanX, leanZ, true);
  }

  // 3 wind-sculpted Italian Coastal Cypresses crowning the Limestone Sea-Stack Islet at (58, 56)
  const isletSpots = [
    { x: 57.4, z: 55.3, s: 0.84 },
    { x: 59.3, z: 56.8, s: 0.74 },
    { x: 56.4, z: 57.4, s: 0.68 },
  ];
  isletSpots.forEach((st, idx) => {
    const arch = getTreeArchetype("cypress", idx % 2);
    placeTreeMeshPair(
      treeGroup,
      arch,
      oakBarkMat,
      cypressLeafMat,
      cypressAssets.depthMat,
      st.x,
      st.z,
      idx * 2.1,
      st.s,
      0.04,
      -0.03,
      false
    );
  });

  group.add(treeGroup);
  return placedTrees.length + isletSpots.length;
}

// ---------------------------------------------------------------------------
// Sculpted Fibonacci Golden-Angle (137.508 deg) 16-Petal 3D Roses & Garlands
// ---------------------------------------------------------------------------

export function createSculptedRoseBloomGeo() {
  return getCachedFloraAsset("fibonacciRoseBloomGeo", () => {
    const GOLDEN_ANGLE = (137.508 * Math.PI) / 180.0;
    const uSteps = 3;
    const vSteps = 3;
    const petalGeos = [];

    for (let p = 0; p < 16; p += 1) {
      const th0 = p * GOLDEN_ANGLE;
      let baseR;
      let height;
      let openAng;
      let wrapArc;
      let cupBowl;
      let reflexAmp;

      if (p < 4) {
        // Inner 4 petals: tight upright furled spiral cone
        baseR = 0.006 + p * 0.0042;
        height = 0.066 + p * 0.003;
        openAng = 0.13 + p * 0.055;
        wrapArc = 1.96 - p * 0.11;
        cupBowl = 0.009;
        reflexAmp = 0.0;
      } else if (p < 10) {
        // Middle 6 petals: cupped concave bowls
        const k = (p - 4) / 5.0;
        baseR = 0.021 + k * 0.015;
        height = 0.075 + k * 0.006;
        openAng = 0.42 + k * 0.34;
        wrapArc = 1.34 - k * 0.18;
        cupBowl = 0.018;
        reflexAmp = 0.004 * k;
      } else {
        // Outer 6 petals: gracefully open & reflexed at top rim
        const k = (p - 10) / 5.0;
        baseR = 0.037 + k * 0.016;
        height = 0.081 + k * 0.006;
        openAng = 0.84 + k * 0.36;
        wrapArc = 1.06 - k * 0.12;
        cupBowl = 0.014;
        reflexAmp = 0.023 * (0.65 + 0.35 * k);
      }

      const pos = [];
      const uvs = [];
      const cols = [];
      const idx = [];

      for (let iv = 0; iv <= vSteps; iv += 1) {
        const v = iv / vSteps;
        const widthEnv = 0.24 + 0.76 * Math.sin(Math.pow(v, 0.68) * Math.PI * 0.91);
        const reflex = v > 0.60 ? reflexAmp * Math.pow((v - 0.60) / 0.40, 1.65) : 0.0;

        for (let iu = 0; iu <= uSteps; iu += 1) {
          const uNorm = iu / uSteps;
          const u = uNorm * 2.0 - 1.0;
          const tipCusp = 1.0 + 0.065 * v * (1.0 - Math.abs(u));
          const ang = th0 + u * wrapArc * 0.5 * widthEnv;
          const radial =
            baseR +
            Math.sin(openAng) * height * v -
            cupBowl * Math.sin(v * Math.PI) * (1.0 - 0.38 * u * u) +
            reflex * (1.0 - 0.25 * u * u);
          const py =
            Math.cos(openAng) * height * v * tipCusp +
            cupBowl * 0.32 * (1.0 - u * u) * v -
            reflex * 0.52;

          pos.push(Math.cos(ang) * radial, py - 0.012, Math.sin(ang) * radial);
          uvs.push(uNorm, v);

          const ao = lerp(0.68, 1.05, Math.pow(v, 0.72)) * lerp(0.92, 1.03, p / 15.0);
          cols.push(ao, ao * 0.98, ao * 0.99);
        }
      }

      const stride = uSteps + 1;
      for (let iv = 0; iv < vSteps; iv += 1) {
        for (let iu = 0; iu < uSteps; iu += 1) {
          const a = iv * stride + iu;
          const b = a + stride;
          const c = b + 1;
          const d = a + 1;
          idx.push(a, b, d, b, c, d);
        }
      }

      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      petalGeos.push(g.toNonIndexed());
      g.dispose();
    }

    const merged = mergeGeometries(petalGeos, false);
    petalGeos.forEach((g) => g.dispose());
    merged.computeBoundingSphere();
    return merged;
  });
}

function createRoseStemAndFoliageGeo(stemLen = 0.24) {
  return getCachedFloraAsset(`roseStemGeo_${stemLen.toFixed(2)}`, () => {
    const parts = [];

    // Curved stem + receptacle hip
    const stemPts = [
      new THREE.Vector3(0.0, -stemLen, 0.0),
      new THREE.Vector3(0.012, -stemLen * 0.52, -0.008),
      new THREE.Vector3(-0.005, -0.016, 0.004),
      new THREE.Vector3(0.0, 0.0, 0.0),
    ];
    parts.push(buildCurvedBranchTube(stemPts, 0.0055, 0.0095, 5, 5, 0.0));

    // 5 green calyx sepals arching beneath outer rose petals
    for (let s = 0; s < 5; s += 1) {
      const sa = (s * Math.PI * 2.0) / 5.0 + 0.25;
      const sep = new THREE.PlaneGeometry(0.018, 0.052, 1, 2);
      const pa = sep.attributes.position;
      for (let i = 0; i < pa.count; i += 1) {
        const y = pa.getY(i) + 0.026;
        const v = clamp(y / 0.052, 0, 1);
        pa.setXYZ(i, pa.getX(i) * (1.0 - v * 0.88), y * 0.25, v * 0.048 - v * v * 0.016);
      }
      sep.computeVertexNormals();
      const nonIdx = sep.toNonIndexed();
      sep.dispose();
      nonIdx.applyMatrix4(new THREE.Matrix4().makeRotationY(sa));
      parts.push(nonIdx);
    }

    // 3 compound serrated rose leaves (each with 3 cambered leaflets: 1 terminal + 2 paired lateral)
    for (let lf = 0; lf < 3; lf += 1) {
      const ly = -0.055 - lf * (stemLen * 0.26);
      const yaw = lf * 2.15 + 0.4;
      const leafSub = [
        { ox: 0.0, oz: 0.058, ry: 0.0, sc: 1.0 },
        { ox: -0.024, oz: 0.028, ry: -0.85, sc: 0.76 },
        { ox: 0.024, oz: 0.028, ry: 0.85, sc: 0.76 },
      ];
      for (let k = 0; k < leafSub.length; k += 1) {
        const ls = leafSub[k];
        const blade = new THREE.PlaneGeometry(0.032 * ls.sc, 0.048 * ls.sc, 2, 2);
        const ba = blade.attributes.position;
        for (let i = 0; i < ba.count; i += 1) {
          const bx = ba.getX(i);
          const by = ba.getY(i) + 0.024 * ls.sc;
          const nv = clamp(by / (0.048 * ls.sc), 0, 1);
          const serr = Math.sin(nv * Math.PI);
          ba.setXYZ(i, bx * serr * 1.15, -nv * nv * 0.010, by);
        }
        blade.computeVertexNormals();
        const bNon = blade.toNonIndexed();
        blade.dispose();
        const m = new THREE.Matrix4()
          .makeRotationY(yaw)
          .multiply(new THREE.Matrix4().makeTranslation(ls.ox, ly, ls.oz))
          .multiply(new THREE.Matrix4().makeRotationY(ls.ry));
        bNon.applyMatrix4(m);
        parts.push(bNon);
      }
    }

    const merged = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    const cnt = merged.attributes.position.count;
    const cols = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i += 1) {
      const py = merged.attributes.position.getY(i);
      const gTone = lerp(0.76, 1.05, clamp((py + stemLen) / (stemLen + 0.02), 0, 1));
      cols[i * 3 + 0] = 0.24 * gTone;
      cols[i * 3 + 1] = 0.46 * gTone;
      cols[i * 3 + 2] = 0.20 * gTone;
    }
    merged.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    merged.computeBoundingSphere();
    return merged;
  });
}

function getRoseMaterials() {
  return getCachedFloraAsset("roseMatSuite", () => {
    const velvet = getPetalVelvetTextures();
    const paletteHex = [0xb81d3a, 0xe25a7a, 0xf4bac8, 0xfaf0e8, 0xd83b5c];
    const petalMats = paletteHex.map(
      (hex) =>
        new THREE.MeshPhysicalMaterial({
          color: hex,
          map: velvet.map,
          normalMap: velvet.normalMap,
          normalScale: new THREE.Vector2(0.42, 0.42),
          vertexColors: true,
          roughness: 0.48,
          metalness: 0.0,
          sheen: 0.62,
          sheenRoughness: 0.52,
          sheenColor: new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.48),
          side: THREE.DoubleSide,
        })
    );
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.62,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    return { petalMats, stemMat };
  });
}

export function createRoseBouquet({ count = 9, scale = 1.0 } = {}) {
  const bouquet = new THREE.Group();
  bouquet.name = "SculptedRoseBouquet";
  const bloomGeo = createSculptedRoseBloomGeo();
  const stemGeo = createRoseStemAndFoliageGeo(0.28);
  const { petalMats, stemMat } = getRoseMaterials();
  const rng = mulberry32(31087 + count * 19);

  const n = Math.max(1, Math.floor(count));
  for (let i = 0; i < n; i += 1) {
    const ringT = i === 0 ? 0.0 : Math.sqrt(i / Math.max(1, n - 1));
    const az = i * 2.399963 + 0.35;
    const tilt = ringT * 0.44;
    const spreadR = ringT * 0.095;
    const h = 0.27 - ringT * 0.045 + (rng() - 0.5) * 0.014;

    const unit = new THREE.Group();
    unit.position.set(Math.cos(az) * spreadR, h, Math.sin(az) * spreadR);
    unit.rotation.order = "YXZ";
    unit.rotation.set(tilt, -az + Math.PI * 0.5, (rng() - 0.5) * 0.14);

    const bScale = 0.58 + (rng() - 0.5) * 0.08;
    const bloom = new THREE.Mesh(bloomGeo, petalMats[i % petalMats.length]);
    bloom.scale.setScalar(bScale);
    bloom.rotation.y = rng() * Math.PI * 2.0;
    bloom.castShadow = true;
    bloom.receiveShadow = true;

    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.scale.setScalar(0.88);
    stem.castShadow = true;

    unit.add(bloom, stem);
    bouquet.add(unit);
  }

  bouquet.scale.setScalar(scale);
  return bouquet;
}

export function buildSculptedRoseCluster(placements, group, uTimeRef) {
  const bloomGeo = createSculptedRoseBloomGeo();
  const stemGeo = createRoseStemAndFoliageGeo(0.22);
  const { petalMats, stemMat } = getRoseMaterials();
  const leafAssets = getLeafSprayAssets();

  const bushFoliageMat = attachCanopyWindShader(
    new THREE.MeshStandardMaterial({
      color: 0xdbe8cf,
      map: leafAssets.map,
      normalMap: leafAssets.normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      alphaTest: 0.42,
      side: THREE.DoubleSide,
      roughness: 0.54,
    }),
    uTimeRef,
    0.025,
    1.9,
    "rosebush"
  );

  const buckets = petalMats.map(() => []);
  const stemTransforms = [];
  const leafSprayTransforms = [];
  const dummy = new THREE.Object3D();
  const rng = mulberry32(44109);

  for (let i = 0; i < placements.length; i += 1) {
    const p = placements[i];
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(p.rx, p.ry, p.rz);
    dummy.scale.setScalar(p.scale);
    dummy.updateMatrix();
    buckets[p.colorIdx % buckets.length].push(dummy.matrix.clone());

    dummy.scale.setScalar(p.scale * 0.95);
    dummy.updateMatrix();
    stemTransforms.push(dummy.matrix.clone());

    if (p.withBushFoliage) {
      dummy.position.set(p.x + (rng() - 0.5) * 0.12, p.y - 0.14, p.z + (rng() - 0.5) * 0.12);
      dummy.rotation.set(0.45 + (rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.4);
      dummy.scale.setScalar(0.46 + rng() * 0.18);
      dummy.updateMatrix();
      leafSprayTransforms.push(dummy.matrix.clone());
    }
  }

  buckets.forEach((mats, idx) => {
    if (!mats.length) return;
    const inst = new THREE.InstancedMesh(bloomGeo, petalMats[idx], mats.length);
    for (let k = 0; k < mats.length; k += 1) inst.setMatrixAt(k, mats[k]);
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true;
    inst.receiveShadow = true;
    group.add(inst);
  });

  const stemInst = new THREE.InstancedMesh(stemGeo, stemMat, stemTransforms.length);
  for (let k = 0; k < stemTransforms.length; k += 1) stemInst.setMatrixAt(k, stemTransforms[k]);
  stemInst.instanceMatrix.needsUpdate = true;
  group.add(stemInst);

  if (leafSprayTransforms.length > 0) {
    const sprayPlane = new THREE.PlaneGeometry(1.0, 1.0, 2, 2);
    const pa = sprayPlane.attributes.position;
    for (let i = 0; i < pa.count; i += 1) {
      const x = pa.getX(i);
      const y = pa.getY(i) + 0.35;
      pa.setXYZ(i, x, y, -0.14 * (x * x + y * y));
    }
    sprayPlane.computeVertexNormals();
    const leafInst = new THREE.InstancedMesh(sprayPlane, bushFoliageMat, leafSprayTransforms.length);
    for (let k = 0; k < leafSprayTransforms.length; k += 1) leafInst.setMatrixAt(k, leafSprayTransforms[k]);
    leafInst.instanceMatrix.needsUpdate = true;
    leafInst.customDepthMaterial = leafAssets.depthMat;
    leafInst.castShadow = true;
    leafInst.receiveShadow = true;
    group.add(leafInst);
  }

  return placements.length;
}

function buildEstateRoseGardens(group, uTimeRef) {
  const roseGroup = new THREE.Group();
  roseGroup.name = "SculptedFibonacciRoses";
  const rng = mulberry32(51203);
  const roses = [];

  const pushRose = (x, y, z, rx, ry, rz, scale, colorIdx, withBushFoliage = true) => {
    roses.push({ x, y, z, rx, ry, rz, scale, colorIdx, withBushFoliage });
  };

  // 1. Villa front garden beds: X in [-24, -4], Z ~ +7.2, leaving stairs X in [-16.5, -11.5] open
  for (let side = 0; side < 2; side += 1) {
    const xMin = side === 0 ? -24.0 : -11.1;
    const xMax = side === 0 ? -16.9 : -4.0;
    for (let i = 0; i < 96; i += 1) {
      const rx = lerp(xMin, xMax, (i + rng() * 0.8) / 96.0);
      const rz = 7.2 + (rng() - 0.5) * 0.92;
      const mound = Math.sin(((rx - xMin) / (xMax - xMin)) * Math.PI) * 0.24;
      const ry = 2.20 + 0.34 + mound + rng() * 0.36;
      pushRose(
        rx,
        ry,
        rz,
        0.35 + (rng() - 0.5) * 0.55,
        rng() * Math.PI * 2,
        (rng() - 0.5) * 0.45,
        0.95 + rng() * 0.38,
        i + side * 2,
        i % 2 === 0
      );
    }
  }

  // Helper for Climbing Rose Arches
  const populateArchGarland = (cx, baseY, cz, spanAlongZ, count) => {
    const halfSpan = 1.52;
    const legTop = 2.05;
    const vaultH = 0.85;
    for (let i = 0; i < count; i += 1) {
      const u = i / (count - 1);
      let sOff;
      let hOff;
      if (u < 0.28) {
        sOff = -halfSpan;
        hOff = (u / 0.28) * legTop;
      } else if (u > 0.72) {
        sOff = halfSpan;
        hOff = ((1.0 - u) / 0.28) * legTop;
      } else {
        const ang = lerp(Math.PI, 0.0, (u - 0.28) / 0.44);
        sOff = Math.cos(ang) * halfSpan;
        hOff = legTop + Math.sin(ang) * vaultH;
      }
      const jitterA = (rng() - 0.5) * 0.36;
      const jitterB = (rng() - 0.5) * 0.42;
      const px = spanAlongZ ? cx + jitterB : cx + sOff + jitterA;
      const pz = spanAlongZ ? cz + sOff + jitterA : cz + jitterB;
      const py = baseY + 0.18 + hOff + (rng() - 0.5) * 0.16;
      pushRose(px, py, pz, 0.75 + (rng() - 0.5) * 0.7, rng() * Math.PI * 2, (rng() - 0.5) * 0.6, 0.92 + rng() * 0.36, i, i % 2 === 0);
    }
  };

  // 2. Front Rose Arch (-14.0, 2.20, +9.6) & West Trail Rose Arch (-31.0, 2.22, +1.0)
  populateArchGarland(-14.0, 2.20, 9.6, false, 96);
  populateArchGarland(-31.0, 2.22, 1.0, true, 88);

  // 3. Central Courtyard Fountain (-4.5, 2.20, +4.5)
  for (let i = 0; i < 68; i += 1) {
    const th = (i / 68) * Math.PI * 2.0 + (rng() - 0.5) * 0.08;
    const r = 2.12 + (rng() - 0.5) * 0.36;
    pushRose(
      -4.5 + Math.cos(th) * r,
      2.20 + 0.28 + rng() * 0.30,
      4.5 + Math.sin(th) * r,
      0.52,
      -th + Math.PI * 0.5,
      (rng() - 0.5) * 0.3,
      0.90 + rng() * 0.34,
      i,
      i % 2 === 0
    );
  }

  // 4. Rose Mailbox (-10.8, 2.20, +9.4)
  for (let i = 0; i < 34; i += 1) {
    const t = i / 33;
    const th = Math.PI * 0.35 + t * Math.PI * 1.65;
    const r = lerp(0.48, 0.22, t) + (rng() - 0.5) * 0.08;
    pushRose(
      -10.8 + Math.cos(th) * r,
      2.20 + 0.22 + t * 0.88,
      9.4 + Math.sin(th) * r,
      0.58,
      rng() * Math.PI * 2,
      0.0,
      0.86 + rng() * 0.28,
      i,
      i < 22
    );
  }

  // 5. Cliffside Gazebo (-64.0, 7.80, +42.0) — perimeter beds & upper frieze garland
  for (let i = 0; i < 96; i += 1) {
    const upper = i >= 58;
    const th = ((i % 58) / 58) * Math.PI * 2.0;
    // Leave NE footpath entry around th = -0.92 rad clear at ground level
    if (!upper && Math.abs(Math.atan2(Math.sin(th + 0.92), Math.cos(th + 0.92))) < 0.38) continue;
    const r = upper ? 4.08 + (rng() - 0.5) * 0.22 : 4.58 + (rng() - 0.5) * 0.38;
    const py = upper ? 7.80 + 2.75 + (rng() - 0.5) * 0.22 : 7.80 + 0.34 + rng() * 0.36;
    pushRose(
      -64.0 + Math.cos(th) * r,
      py,
      42.0 + Math.sin(th) * r,
      upper ? 0.95 : 0.45,
      rng() * Math.PI * 2,
      0.0,
      0.92 + rng() * 0.36,
      i,
      true
    );
  }

  const count = buildSculptedRoseCluster(roses, roseGroup, uTimeRef);
  group.add(roseGroup);
  return count;
}

// ---------------------------------------------------------------------------
// GPU-Instanced 45,000 3D Grass Blades & 24,000 Multi-Petal 3D Field Flowers
// ---------------------------------------------------------------------------

function makeClumpFromSingleGeo(singleGeo, stems) {
  const parts = [];
  const mat4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const posV = new THREE.Vector3();
  const sclV = new THREE.Vector3();
  for (let i = 0; i < stems.length; i += 1) {
    const s = stems[i];
    const g = singleGeo.index ? singleGeo.toNonIndexed() : singleGeo.clone();
    euler.set(s.tx || 0, s.ry || 0, s.tz || 0);
    quat.setFromEuler(euler);
    posV.set(s.dx, 0, s.dz);
    sclV.set(s.sc, s.sy || s.sc, s.sc);
    mat4.compose(posV, quat, sclV);
    g.applyMatrix4(mat4);
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false);
  merged.computeBoundingSphere();
  return merged;
}

function createMeadowGrassBladeGeo() {
  const single = new THREE.PlaneGeometry(0.092, 0.56, 1, 2);
  const pos = single.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const rootCol = new THREE.Color(0x28451d);
  const midCol = new THREE.Color(0x4c7e2f);
  const tipCol = new THREE.Color(0x95bd50);
  const tmpC = new THREE.Color();

  for (let i = 0; i < pos.count; i += 1) {
    const rawY = pos.getY(i) + 0.28;
    const t = clamp(rawY / 0.56, 0.0, 1.0);
    const taper = 1.0 - Math.pow(t, 1.35) * 0.95;
    const curveZ = 0.17 * t * t;
    pos.setXYZ(i, pos.getX(i) * taper, rawY, curveZ);

    if (t < 0.5) {
      tmpC.copy(rootCol).lerp(midCol, t * 2.0);
    } else {
      tmpC.copy(midCol).lerp(tipCol, (t - 0.5) * 2.0);
    }
    cols[i * 3 + 0] = tmpC.r;
    cols[i * 3 + 1] = tmpC.g;
    cols[i * 3 + 2] = tmpC.b;
  }
  single.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  single.computeVertexNormals();

  // Merge 4 curved blades into a rich natural meadow tuft (16,000 tufts = 64,000 blades)
  return makeClumpFromSingleGeo(single, [
    { dx: 0.0, dz: 0.0, sc: 1.06, sy: 1.08, ry: 0.2, tx: 0.06, tz: -0.04 },
    { dx: -0.14, dz: 0.11, sc: 0.96, sy: 0.94, ry: 1.85, tx: -0.08, tz: 0.09 },
    { dx: 0.15, dz: 0.09, sc: 0.92, sy: 0.90, ry: 3.55, tx: 0.09, tz: -0.08 },
    { dx: -0.02, dz: -0.15, sc: 0.98, sy: 1.00, ry: 5.05, tx: -0.07, tz: -0.06 },
  ]);
}

function makeBotanicalGeoBuilder() {
  const pos = [];
  const cols = [];
  const uvs = [];
  const masks = [];
  return {
    tri(ax, ay, az, bx, by, bz, cx, cy, cz, cA, cB, cC, mA, mB, mC) {
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      cols.push(cA[0], cA[1], cA[2], cB[0], cB[1], cB[2], cC[0], cC[1], cC[2]);
      uvs.push(0.5, 0.0, 0.0, 1.0, 1.0, 1.0);
      masks.push(mA, mB, mC);
    },
    finish() {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setAttribute("aPetalMask", new THREE.Float32BufferAttribute(masks, 1));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      return g;
    },
  };
}

function addDome4(b, cy, r, h, colBase, colTop, mask = 0.0) {
  for (let i = 0; i < 4; i += 1) {
    const a0 = (i * Math.PI) / 2.0;
    const a1 = ((i + 1) * Math.PI) / 2.0;
    b.tri(
      0, cy + h, 0,
      Math.cos(a0) * r, cy, Math.sin(a0) * r,
      Math.cos(a1) * r, cy, Math.sin(a1) * r,
      colTop, colBase, colBase,
      mask, mask, mask
    );
  }
}

function createCosmosFlowerGeo() {
  // 24 tris: stem (2) + 2 leaves (2) + golden pollen dome (4) + 8 cupped petals (16)
  const b = makeBotanicalGeoBuilder();
  const gDark = [0.21, 0.39, 0.16];
  const gMid = [0.32, 0.56, 0.23];
  const h = 0.46;
  b.tri(-0.008, 0, 0, 0.008, 0, 0, 0.012, h, 0.015, gDark, gDark, gMid, 0, 0, 0);
  b.tri(-0.008, 0, 0, 0.012, h, 0.015, -0.004, h, 0.015, gDark, gMid, gMid, 0, 0, 0);
  b.tri(0.0, 0.16, 0.005, 0.095, 0.25, 0.04, 0.018, 0.21, -0.01, gDark, gMid, gMid, 0, 0, 0);
  b.tri(0.004, 0.27, 0.009, -0.09, 0.35, -0.03, -0.015, 0.31, 0.02, gDark, gMid, gMid, 0, 0, 0);

  const cx = 0.004;
  const cz = 0.015;
  addDome4(b, h, 0.026, 0.020, [0.85, 0.56, 0.08], [0.98, 0.78, 0.18], 0.0);

  const pBase = [0.82, 0.80, 0.82];
  const pMid = [0.98, 0.98, 0.98];
  const pTip = [1.05, 1.05, 1.05];
  for (let p = 0; p < 8; p += 1) {
    const th = (p * Math.PI * 2.0) / 8.0;
    const wAng = 0.30;
    const rMid = 0.068;
    const rTip = 0.112;
    const yMid = h + 0.028;
    const yTip = h + 0.036 + (p % 2) * 0.006;
    const lx = cx + Math.cos(th - wAng) * rMid;
    const lz = cz + Math.sin(th - wAng) * rMid;
    const rx = cx + Math.cos(th + wAng) * rMid;
    const rz = cz + Math.sin(th + wAng) * rMid;
    const tx = cx + Math.cos(th) * rTip;
    const tz = cz + Math.sin(th) * rTip;
    b.tri(cx, h + 0.003, cz, lx, yMid, lz, tx, yTip, tz, pBase, pMid, pTip, 0.9, 1.0, 1.0);
    b.tri(cx, h + 0.003, cz, tx, yTip, tz, rx, yMid, rz, pBase, pTip, pMid, 0.9, 1.0, 1.0);
  }
  return makeClumpFromSingleGeo(b.finish(), [
    { dx: 0.0, dz: 0.0, sc: 1.08, sy: 1.06, ry: 0.1, tx: 0.04, tz: -0.03 },
    { dx: -0.21, dz: 0.16, sc: 0.95, sy: 0.90, ry: 2.25, tx: -0.09, tz: 0.10 },
    { dx: 0.20, dz: -0.15, sc: 0.92, sy: 0.86, ry: 4.35, tx: 0.10, tz: -0.09 },
  ]);
}

function createLavenderSpikeGeo() {
  // 24 tris: stem (2) + 2 silvery basal leaves (2) + 5 whorls x 4 florets (20)
  const b = makeBotanicalGeoBuilder();
  const sDark = [0.26, 0.38, 0.24];
  const sSage = [0.42, 0.56, 0.39];
  b.tri(-0.007, 0, 0, 0.007, 0, 0, 0.005, 0.54, 0, sDark, sDark, sSage, 0, 0, 0);
  b.tri(-0.007, 0, 0, 0.005, 0.54, 0, -0.005, 0.54, 0, sDark, sSage, sSage, 0, 0, 0);
  b.tri(0, 0.04, 0, 0.075, 0.20, 0.03, 0.014, 0.14, -0.012, sDark, sSage, sSage, 0, 0, 0);
  b.tri(0, 0.05, 0, -0.075, 0.21, -0.03, -0.014, 0.15, 0.012, sDark, sSage, sSage, 0, 0, 0);

  for (let w = 0; w < 5; w += 1) {
    const wy = 0.29 + w * 0.055;
    const rad = (0.038 - w * 0.0045);
    const shade = 0.84 + w * 0.05;
    const c0 = [shade * 0.78, shade * 0.76, shade * 0.82];
    const c1 = [shade * 1.06, shade * 1.06, shade * 1.08];
    for (let f = 0; f < 4; f += 1) {
      const ang = (f * Math.PI) / 2.0 + w * 0.55;
      const fx = Math.cos(ang) * rad;
      const fz = Math.sin(ang) * rad;
      const px = -Math.sin(ang) * 0.016;
      const pz = Math.cos(ang) * 0.016;
      b.tri(0, wy - 0.012, 0, fx + px, wy + 0.026, fz + pz, fx - px, wy + 0.026, fz - pz, c0, c1, c1, 0.85, 1.0, 1.0);
    }
  }
  return makeClumpFromSingleGeo(b.finish(), [
    { dx: 0.0, dz: 0.0, sc: 1.10, sy: 1.08, ry: 0.3, tx: 0.05, tz: 0.03 },
    { dx: -0.18, dz: 0.15, sc: 0.96, sy: 0.92, ry: 2.1, tx: -0.10, tz: 0.09 },
    { dx: 0.19, dz: -0.14, sc: 0.94, sy: 0.88, ry: 4.2, tx: 0.09, tz: -0.10 },
  ]);
}

function createDaisyFlowerGeo() {
  // 26 tris: stalk (1) + leaf (1) + amber button dome (4) + 10 cambered rays (20)
  const b = makeBotanicalGeoBuilder();
  const g0 = [0.22, 0.42, 0.17];
  const g1 = [0.34, 0.58, 0.24];
  const h = 0.40;
  b.tri(-0.009, 0, 0, 0.009, 0, 0, 0, h, 0, g0, g0, g1, 0, 0, 0);
  b.tri(0, 0.08, 0, 0.088, 0.20, 0.032, -0.016, 0.16, 0.018, g0, g1, g1, 0, 0, 0);
  addDome4(b, h, 0.028, 0.022, [0.84, 0.50, 0.06], [0.98, 0.72, 0.14], 0.0);

  const rBase = [0.88, 0.88, 0.86];
  const rOut = [1.04, 1.04, 1.04];
  for (let p = 0; p < 10; p += 1) {
    const th = (p * Math.PI * 2.0) / 10.0;
    const lx = Math.cos(th - 0.16) * 0.062;
    const lz = Math.sin(th - 0.16) * 0.062;
    const rx = Math.cos(th + 0.16) * 0.062;
    const rz = Math.sin(th + 0.16) * 0.062;
    const tx = Math.cos(th) * 0.104;
    const tz = Math.sin(th) * 0.104;
    b.tri(0, h + 0.004, 0, lx, h + 0.014, lz, tx, h + 0.004, tz, rBase, rOut, rOut, 0.95, 1.0, 1.0);
    b.tri(0, h + 0.004, 0, tx, h + 0.004, tz, rx, h + 0.014, rz, rBase, rOut, rOut, 0.95, 1.0, 1.0);
  }
  return makeClumpFromSingleGeo(b.finish(), [
    { dx: 0.0, dz: 0.0, sc: 1.08, sy: 1.05, ry: 0.4, tx: 0.04, tz: 0.04 },
    { dx: -0.20, dz: -0.15, sc: 0.95, sy: 0.90, ry: 2.5, tx: -0.09, tz: -0.08 },
    { dx: 0.19, dz: 0.16, sc: 0.92, sy: 0.86, ry: 4.6, tx: 0.08, tz: 0.09 },
  ]);
}

function createNemophilaFlowerGeo() {
  // 20 tris: stem (2) + 3 basal leaves (3) + 5-tri ivory star center (5) + 5 cupped blue petals (10)
  const b = makeBotanicalGeoBuilder();
  const g0 = [0.22, 0.43, 0.18];
  const g1 = [0.35, 0.60, 0.25];
  const h = 0.25;
  b.tri(-0.006, 0, 0, 0.006, 0, 0, 0.005, h, 0, g0, g0, g1, 0, 0, 0);
  b.tri(-0.006, 0, 0, 0.005, h, 0, -0.005, h, 0, g0, g1, g1, 0, 0, 0);
  for (let l = 0; l < 3; l += 1) {
    const la = (l * Math.PI * 2.0) / 3.0;
    b.tri(0, 0.05, 0, Math.cos(la) * 0.075, 0.13, Math.sin(la) * 0.075, Math.cos(la + 0.45) * 0.032, 0.11, Math.sin(la + 0.45) * 0.032, g0, g1, g1, 0, 0, 0);
  }
  const ivory = [0.99, 0.98, 0.92];
  for (let p = 0; p < 5; p += 1) {
    const a0 = (p * Math.PI * 2.0) / 5.0;
    const a1 = ((p + 1) * Math.PI * 2.0) / 5.0;
    b.tri(0, h + 0.012, 0, Math.cos(a0) * 0.018, h + 0.004, Math.sin(a0) * 0.018, Math.cos(a1) * 0.018, h + 0.004, Math.sin(a1) * 0.018, ivory, ivory, ivory, 0, 0, 0);

    const mid = a0 + Math.PI / 5.0;
    const lx = Math.cos(mid - 0.46) * 0.068;
    const lz = Math.sin(mid - 0.46) * 0.068;
    const rx = Math.cos(mid + 0.46) * 0.068;
    const rz = Math.sin(mid + 0.46) * 0.068;
    const tx = Math.cos(mid) * 0.088;
    const tz = Math.sin(mid) * 0.088;
    // Snowy-white throat (mask 0.18) blending to sky-blue cupped rim (mask 1.0)
    b.tri(0, h + 0.003, 0, lx, h + 0.034, lz, tx, h + 0.040, tz, ivory, [1, 1, 1], [1.04, 1.04, 1.05], 0.18, 1.0, 1.0);
    b.tri(0, h + 0.003, 0, tx, h + 0.040, tz, rx, h + 0.034, rz, ivory, [1.04, 1.04, 1.05], [1, 1, 1], 0.18, 1.0, 1.0);
  }
  return makeClumpFromSingleGeo(b.finish(), [
    { dx: 0.0, dz: 0.0, sc: 1.12, sy: 1.08, ry: 0.2, tx: 0.05, tz: -0.05 },
    { dx: -0.19, dz: 0.14, sc: 0.98, sy: 0.94, ry: 2.3, tx: -0.08, tz: 0.08 },
    { dx: 0.18, dz: -0.16, sc: 0.95, sy: 0.90, ry: 4.4, tx: 0.09, tz: -0.07 },
  ]);
}

function sampleOrganicMeadowSpot(rng, speciesIdx) {
  for (let tries = 0; tries < 60; tries += 1) {
    // Concentrate richly along scenic walk trails (West Headland Gazebo, Villa Gardens & Creek Bridge) + blanket whole 260m peninsula
    let x;
    let z;
    const zone = rng();
    if (zone < 0.30) {
      x = -78.0 + rng() * 54.0;
      z = -16.0 + rng() * 68.0;
    } else if (zone < 0.56) {
      x = -32.0 + rng() * 60.0;
      z = -62.0 + rng() * 50.0;
    } else if (zone < 0.82) {
      x = -114.0 + rng() * 92.0;
      z = -45.0 + rng() * 115.0;
    } else {
      x = -112.0 + rng() * 158.0;
      z = -112.0 + rng() * 192.0;
    }
    if (!isMeadowFloraAllowed(x, z)) continue;

    if (speciesIdx >= 0) {
      const drift = fbmMeadow(x, z, speciesIdx * 3.17 + 1.2);
      const accept = smoothstep(0.24, 0.72, drift);
      if (rng() > 0.22 + accept * 0.78) continue;
    }
    return { x, z };
  }
  return { x: -48.0 - rng() * 30.0, z: 18.0 + rng() * 20.0 };
}

function buildMeadowAndFlowerSea(group, uTimeRef) {
  const seaGroup = new THREE.Group();
  seaGroup.name = "MeadowGrassAndFlowerSea";
  const rng = mulberry32(68113);
  const dummy = new THREE.Object3D();
  const qSlope = new THREE.Quaternion();
  const qYaw = new THREE.Quaternion();
  const col = new THREE.Color();
  const velvet = getPetalVelvetTextures();

  // 1. 16,000 Tapered Curved 3-Segment 3D Meadow Grass Blades (lush full-width blades, fast diffuse wind shader)
  const GRASS_COUNT = 16000;
  const grassGeo = createMeadowGrassBladeGeo();
  const grassMat = attachMeadowWindShader(
    new THREE.MeshLambertMaterial({
      color: 0xffffff,
      vertexColors: true,
      side: THREE.DoubleSide,
    }),
    uTimeRef,
    { swayAmp: 0.135, maxH: 0.54, usePetalMask: false, tag: "grass16k" }
  );
  const grassInst = new THREE.InstancedMesh(grassGeo, grassMat, GRASS_COUNT);
  grassInst.castShadow = false;
  grassInst.receiveShadow = false;
  grassInst.frustumCulled = false;
  grassInst.raycast = () => {};

  for (let i = 0; i < GRASS_COUNT; i += 1) {
    const sp = sampleOrganicMeadowSpot(rng, -1);
    const y = getWorldTerrainY(sp.x, sp.z);
    getTerrainNormal(sp.x, sp.z, _tmpNormal);
    _tmpNormal.lerp(_upVec, 0.65).normalize();
    qSlope.setFromUnitVectors(_upVec, _tmpNormal);
    qYaw.setFromAxisAngle(_upVec, rng() * Math.PI * 2.0);
    dummy.position.set(sp.x, y - 0.02, sp.z);
    dummy.quaternion.copy(qSlope).multiply(qYaw);
    const lush = fbmMeadow(sp.x, sp.z, 0.7);
    const hScale = (0.85 + lush * 0.72) * (0.88 + rng() * 0.44);
    dummy.scale.set(1.16 + rng() * 0.52, hScale, 1.16 + rng() * 0.52);
    dummy.updateMatrix();
    grassInst.setMatrixAt(i, dummy.matrix);

    col.setHSL(0.24 + (lush - 0.5) * 0.05 + (rng() - 0.5) * 0.03, 0.42 + lush * 0.16, 0.86 + (rng() - 0.5) * 0.16);
    grassInst.setColorAt(i, col);
  }
  grassInst.instanceMatrix.needsUpdate = true;
  grassInst.instanceColor.needsUpdate = true;
  seaGroup.add(grassInst);

  // 2. 13,000 Sculpted Multi-Petal 3D Field Flowers across 4 Botanical Species
  const flowerSpecs = [
    {
      name: "Cosmos3500",
      count: 3500,
      geo: createCosmosFlowerGeo(),
      maxH: 0.50,
      sway: 0.125,
      scaleMin: 1.06,
      scaleSpan: 0.52,
      palette: [0xeb7fa3, 0xcf4a73, 0xf9eef2, 0xe06890],
    },
    {
      name: "LavenderSalvia3500",
      count: 3500,
      geo: createLavenderSpikeGeo(),
      maxH: 0.56,
      sway: 0.115,
      scaleMin: 1.10,
      scaleSpan: 0.50,
      palette: [0x7356b8, 0x8c72cc, 0x5d439e, 0x9b82d8],
    },
    {
      name: "DaisyCoreopsis3000",
      count: 3000,
      geo: createDaisyFlowerGeo(),
      maxH: 0.44,
      sway: 0.105,
      scaleMin: 1.08,
      scaleSpan: 0.48,
      palette: [0xffffff, 0xfcfaf2, 0xf2b728, 0xffffff, 0xf6c63c],
    },
    {
      name: "NemophilaPeriwinkle3000",
      count: 3000,
      geo: createNemophilaFlowerGeo(),
      maxH: 0.30,
      sway: 0.082,
      scaleMin: 1.12,
      scaleSpan: 0.48,
      palette: [0x4da6e8, 0x78c2f8, 0x6294ea, 0x93d0fa],
    },
  ];

  for (let s = 0; s < flowerSpecs.length; s += 1) {
    const spec = flowerSpecs[s];
    const fMat = attachMeadowWindShader(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        normalMap: velvet.normalMap,
        normalScale: new THREE.Vector2(0.28, 0.28),
        vertexColors: true,
        roughness: 0.54,
        metalness: 0.01,
        side: THREE.DoubleSide,
      }),
      uTimeRef,
      { swayAmp: spec.sway, maxH: spec.maxH, usePetalMask: true, tag: spec.name }
    );

    const inst = new THREE.InstancedMesh(spec.geo, fMat, spec.count);
    inst.name = spec.name;
    inst.castShadow = false;
    inst.receiveShadow = false;
    inst.frustumCulled = false;
    inst.raycast = () => {};

    for (let i = 0; i < spec.count; i += 1) {
      const sp = sampleOrganicMeadowSpot(rng, s);
      const y = getWorldTerrainY(sp.x, sp.z);
      getTerrainNormal(sp.x, sp.z, _tmpNormal);
      _tmpNormal.lerp(_upVec, 0.72).normalize();
      qSlope.setFromUnitVectors(_upVec, _tmpNormal);
      qYaw.setFromAxisAngle(_upVec, rng() * Math.PI * 2.0);

      dummy.position.set(sp.x, y - 0.015, sp.z);
      dummy.quaternion.copy(qSlope).multiply(qYaw);
      const sc = spec.scaleMin + rng() * spec.scaleSpan;
      dummy.scale.set(sc, sc * (0.9 + rng() * 0.25), sc);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);

      const patchTone = Math.floor((fbmMeadow(sp.x * 1.4, sp.z * 1.4, s * 5.1) * spec.palette.length + rng() * 0.85)) % spec.palette.length;
      col.setHex(spec.palette[patchTone]);
      col.offsetHSL((rng() - 0.5) * 0.02, (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.05);
      inst.setColorAt(i, col);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.instanceColor.needsUpdate = true;
    seaGroup.add(inst);
  }

  group.add(seaGroup);
}

// ---------------------------------------------------------------------------
// 120 Multi-Floret Hydrangea Shrubs & 340 Wind-Drifting 3D Petals
// ---------------------------------------------------------------------------

function createHydrangeaCorymbGeo() {
  const b = makeBotanicalGeoBuilder();
  const rng = mulberry32(77301);
  // Spherical corymb of 16 sculpted 4-sepal florets over a 0.16m dome
  for (let f = 0; f < 16; f += 1) {
    const t = (f + 0.5) / 16.0;
    const phi = Math.acos(1.0 - t * 0.78);
    const th = f * 2.399963;
    const rDome = 0.135;
    const cx = Math.sin(phi) * Math.cos(th) * rDome;
    const cy = Math.cos(phi) * rDome * 0.86;
    const cz = Math.sin(phi) * Math.sin(th) * rDome;
    const nDir = new THREE.Vector3(cx, cy + 0.04, cz).normalize();
    const uAxis = new THREE.Vector3(-nDir.z, 0, nDir.x);
    if (uAxis.lengthSq() < 1e-4) uAxis.set(1, 0, 0);
    uAxis.normalize();
    const vAxis = new THREE.Vector3().crossVectors(nDir, uAxis).normalize();

    const sR = 0.036 + (rng() - 0.5) * 0.006;
    const eye = [0.96, 0.96, 0.86];
    const sepTip = [1.04, 1.04, 1.05];
    for (let s = 0; s < 4; s += 1) {
      const a0 = (s * Math.PI) / 2.0 + 0.25;
      const pL = new THREE.Vector3(cx, cy, cz)
        .addScaledVector(uAxis, Math.cos(a0 - 0.52) * sR)
        .addScaledVector(vAxis, Math.sin(a0 - 0.52) * sR)
        .addScaledVector(nDir, 0.010);
      const pR = new THREE.Vector3(cx, cy, cz)
        .addScaledVector(uAxis, Math.cos(a0 + 0.52) * sR)
        .addScaledVector(vAxis, Math.sin(a0 + 0.52) * sR)
        .addScaledVector(nDir, 0.010);
      b.tri(cx, cy, cz, pL.x, pL.y, pL.z, pR.x, pR.y, pR.z, eye, sepTip, sepTip, 0.15, 1.0, 1.0);
    }
  }
  return b.finish();
}

function createHydrangeaLeafMoundGeo() {
  const parts = [];
  const rng = mulberry32(78109);
  for (let i = 0; i < 16; i += 1) {
    const az = i * 2.399963;
    const ring = Math.sqrt((i + 0.5) / 16.0);
    const pos = new THREE.Vector3(Math.cos(az) * ring * 0.28, 0.10 + (1.0 - ring) * 0.22, Math.sin(az) * ring * 0.28);
    const dir = new THREE.Vector3(Math.cos(az) * 0.78, 0.72, Math.sin(az) * 0.78);
    parts.push(createCamberedFrondCard(0.62, pos, dir, az, 0.78 + (1.0 - ring) * 0.22, rng));
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  merged.computeBoundingSphere();
  return merged;
}

function buildHydrangeaShrubs(group, uTimeRef) {
  const hydGroup = new THREE.Group();
  hydGroup.name = "HydrangeaShrubs120";
  const rng = mulberry32(80411);
  const spots = [];

  const sampleAlongTrail = (poly, targetCount) => {
    for (let i = 0; i < targetCount; i += 1) {
      const segIdx = Math.min(poly.length - 2, Math.floor((i / targetCount) * (poly.length - 1)));
      const segT = rng();
      const ax = poly[segIdx][0];
      const az = poly[segIdx][1];
      const bx = poly[segIdx + 1][0];
      const bz = poly[segIdx + 1][1];
      const tx = lerp(ax, bx, segT);
      const tz = lerp(az, bz, segT);
      const len = Math.hypot(bx - ax, bz - az) || 1.0;
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const side = i % 2 === 0 ? 1.0 : -1.0;
      const off = 2.18 + rng() * 0.55;
      const sx = tx + nx * side * off;
      const sz = tz + nz * side * off;
      if (isMeadowFloraAllowed(sx, sz)) spots.push({ x: sx, z: sz });
    }
  };

  sampleAlongTrail(WEST_GAZEBO_TRAIL, 48);
  sampleAlongTrail(NORTH_WINDMILL_TRAIL, 48);

  // Villa veranda/courtyard outer rim & Gazebo terrace rim up to exact 120 shrubs
  for (let i = 0; i < 22 && spots.length < 106; i += 1) {
    const sx = i < 11 ? -30.3 - rng() * 0.6 : -28.0 + (i - 11) * 2.1;
    const sz = i < 11 ? -11.5 + i * 2.1 : -14.3 - rng() * 0.5;
    if (isMeadowFloraAllowed(sx, sz)) spots.push({ x: sx, z: sz });
  }
  for (let i = 0; spots.length < 120 && i < 40; i += 1) {
    const th = (i / 20) * Math.PI * 2.0;
    const r = 6.75 + (rng() - 0.5) * 0.45;
    const sx = -64.0 + Math.cos(th) * r;
    const sz = 42.0 + Math.sin(th) * r;
    if (isMeadowFloraAllowed(sx, sz)) spots.push({ x: sx, z: sz });
  }

  const leafAssets = getLeafSprayAssets();
  const velvet = getPetalVelvetTextures();
  const moundGeo = createHydrangeaLeafMoundGeo();
  const corymbGeo = createHydrangeaCorymbGeo();

  const moundMat = attachCanopyWindShader(
    new THREE.MeshStandardMaterial({
      color: 0xcfe2c4,
      map: leafAssets.map,
      normalMap: leafAssets.normalMap,
      alphaTest: 0.42,
      vertexColors: true,
      roughness: 0.56,
      side: THREE.DoubleSide,
    }),
    uTimeRef,
    0.032,
    1.7,
    "hydMound"
  );

  const corymbMat = attachMeadowWindShader(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      normalMap: velvet.normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      vertexColors: true,
      roughness: 0.50,
      side: THREE.DoubleSide,
    }),
    uTimeRef,
    { swayAmp: 0.042, maxH: 0.65, usePetalMask: true, tag: "hydCorymb" }
  );

  const count = spots.length;
  const corymbsPerShrub = 7;
  const moundInst = new THREE.InstancedMesh(moundGeo, moundMat, count);
  moundInst.customDepthMaterial = leafAssets.depthMat;
  moundInst.castShadow = true;
  moundInst.receiveShadow = true;

  const corymbInst = new THREE.InstancedMesh(corymbGeo, corymbMat, count * corymbsPerShrub);
  corymbInst.castShadow = true;
  corymbInst.receiveShadow = true;

  const hydPalette = [0x6a96e2, 0xc680d4, 0xd6708c, 0xf6f4ec, 0x7e8ee6];
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let cIdx = 0;

  for (let i = 0; i < count; i += 1) {
    const sp = spots[i];
    const y = getWorldTerrainY(sp.x, sp.z);
    const sc = 0.88 + rng() * 0.34;
    dummy.position.set(sp.x, y - 0.04, sp.z);
    dummy.rotation.set(0, rng() * Math.PI * 2.0, 0);
    dummy.scale.setScalar(sc);
    dummy.updateMatrix();
    moundInst.setMatrixAt(i, dummy.matrix);

    const baseHex = hydPalette[i % hydPalette.length];
    for (let k = 0; k < corymbsPerShrub; k += 1) {
      const ka = k * 2.399963 + i * 0.5;
      const kr = k === 0 ? 0.0 : (0.18 + (k / corymbsPerShrub) * 0.22) * sc;
      const ky = y + (0.48 - (k / corymbsPerShrub) * 0.14) * sc;
      dummy.position.set(sp.x + Math.cos(ka) * kr, ky, sp.z + Math.sin(ka) * kr);
      dummy.rotation.set((rng() - 0.5) * 0.4, ka, (rng() - 0.5) * 0.4);
      dummy.scale.setScalar(sc * (0.85 + rng() * 0.28));
      dummy.updateMatrix();
      corymbInst.setMatrixAt(cIdx, dummy.matrix);

      col.setHex(baseHex).offsetHSL((rng() - 0.5) * 0.04, (rng() - 0.5) * 0.06, (rng() - 0.5) * 0.05);
      corymbInst.setColorAt(cIdx, col);
      cIdx += 1;
    }
  }
  moundInst.instanceMatrix.needsUpdate = true;
  corymbInst.instanceMatrix.needsUpdate = true;
  corymbInst.instanceColor.needsUpdate = true;
  hydGroup.add(moundInst, corymbInst);
  group.add(hydGroup);
}

function buildDriftingPetals(group) {
  const COUNT = 340;
  const geo = new THREE.PlaneGeometry(0.066, 0.084, 2, 2);
  const pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i += 1) {
    const x = pa.getX(i);
    const y = pa.getY(i);
    const v = (y + 0.042) / 0.084;
    const env = Math.sin(Math.pow(clamp(v, 0.02, 0.98), 0.75) * Math.PI);
    pa.setXYZ(i, x * (0.28 + 0.85 * env), y, 0.016 * (1.0 - v * v) - 0.012 * Math.abs(x * 12.0));
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.48,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const inst = new THREE.InstancedMesh(geo, mat, COUNT);
  inst.name = "DriftingPetals340";
  inst.frustumCulled = false;
  inst.castShadow = false;
  inst.receiveShadow = false;
  inst.raycast = () => {};

  const rng = mulberry32(90517);
  const palette = [0xfad4e0, 0xfff5f8, 0xeb7696, 0xc92a49, 0xf6c2d2];
  const col = new THREE.Color();
  const state = [];
  for (let i = 0; i < COUNT; i += 1) {
    const nearGarden = i < 160;
    let x = nearGarden ? -38.0 + rng() * 40.0 : -85.0 + rng() * 115.0;
    let z = nearGarden ? -22.0 + rng() * 40.0 : -75.0 + rng() * 128.0;
    if (x > -25.6 && x < -2.4 && z > -11.2 && z < 6.8) {
      z = z >= -2.2 ? 9.5 + rng() * 7.5 : -13.5 - rng() * 8.5;
    }
    const baseH = Math.max(1.5, getWorldTerrainY(x, z));
    state.push({
      x,
      y: baseH + 0.4 + rng() * 5.2,
      z,
      vx: 0.38 + rng() * 0.45,
      vy: -0.24 - rng() * 0.22,
      vz: 0.18 + (rng() - 0.5) * 0.35,
      phase: rng() * Math.PI * 2.0,
      spin: 1.4 + rng() * 2.2,
      burstT: 0.0,
    });
    col.setHex(palette[i % palette.length]);
    inst.setColorAt(i, col);
  }
  inst.instanceColor.needsUpdate = true;
  group.add(inst);

  const dummy = new THREE.Object3D();
  const updatePetals = (elapsed, dt) => {
    for (let i = 0; i < COUNT; i += 1) {
      const p = state[i];
      if (p.burstT > 0.0) {
        p.burstT = Math.max(0.0, p.burstT - dt);
        const swirl = elapsed * 3.8 + p.phase;
        p.x += (p.vx + Math.cos(swirl) * 1.15) * dt;
        p.z += (p.vz + Math.sin(swirl) * 1.15) * dt;
        p.y += p.vy * dt;
        p.vy -= 0.85 * dt;
      } else {
        p.x += (p.vx + 0.28 * Math.sin(elapsed * 0.9 + p.phase)) * dt;
        p.z += (p.vz + 0.24 * Math.cos(elapsed * 0.75 + p.phase)) * dt;
        p.y += (p.vy + 0.09 * Math.sin(elapsed * 1.8 + p.phase)) * dt;
      }

      const insideVillaShell =
        p.x > -25.6 && p.x < -2.4 && p.z > -11.2 && p.z < 6.8 && p.y < 9.2;
      const groundY = Math.max(1.2, getWorldTerrainY(p.x, p.z));
      if (insideVillaShell || p.y < groundY + 0.08 || p.x > 46.0 || Math.abs(p.z) > 95.0) {
        p.x = i < 160 ? -38.0 + ((i * 0.618) % 1) * 38.0 : -82.0 + ((i * 0.371) % 1) * 104.0;
        p.z = i < 160 ? -20.0 + ((i * 0.419) % 1) * 36.0 : -68.0 + ((i * 0.731) % 1) * 116.0;
        if (p.x > -25.6 && p.x < -2.4 && p.z > -11.2 && p.z < 6.8) {
          p.z = i % 2 === 0 ? 10.2 + (i % 7) * 0.9 : -14.2 - (i % 7) * 1.1;
        }
        p.y = Math.max(1.6, getWorldTerrainY(p.x, p.z)) + 3.6 + (i % 7) * 0.45;
        p.vy = -0.26 - (i % 5) * 0.05;
        p.burstT = 0.0;
      }

      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(
        elapsed * p.spin + p.phase,
        elapsed * p.spin * 0.72 + p.phase * 1.3,
        Math.sin(elapsed * 2.1 + p.phase) * 0.85
      );
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  };

  const triggerBurst = (origin) => {
    const ox = origin && typeof origin.x === "number" ? origin.x : -14.0;
    const oy = origin && typeof origin.y === "number" ? origin.y : 3.1;
    const oz = origin && typeof origin.z === "number" ? origin.z : 9.6;
    for (let i = 0; i < 110; i += 1) {
      const p = state[i];
      const ang = (i / 110) * Math.PI * 2.0 * 3.0;
      const rad = 0.25 + (i % 9) * 0.14;
      p.x = ox + Math.cos(ang) * rad;
      p.y = oy + (i % 7) * 0.16;
      p.z = oz + Math.sin(ang) * rad;
      p.vx = Math.cos(ang) * (0.65 + (i % 5) * 0.22);
      p.vz = Math.sin(ang) * (0.65 + (i % 5) * 0.22);
      p.vy = 1.35 + (i % 6) * 0.26;
      p.burstT = 3.2;
    }
  };

  updatePetals(0.0, 0.016);
  return { updatePetals, triggerBurst };
}

export function buildBotanicalFlora(opts = {}) {
  const group = new THREE.Group();
  group.name = "BotanicalFloraRoot";
  const uTimeRef = { value: 0.0 };

  buildAllBotanicalTrees(group, uTimeRef);
  buildEstateRoseGardens(group, uTimeRef);
  buildMeadowAndFlowerSea(group, uTimeRef);
  buildHydrangeaShrubs(group, uTimeRef);
  const petals = buildDriftingPetals(group);

  if (opts.parent) {
    opts.parent.add(group);
  }

  return {
    group,
    update(elapsed = 0.0, dt = 0.016) {
      const safeDt = typeof dt === "number" && dt > 0.0 ? Math.min(dt, 0.1) : 0.016;
      uTimeRef.value = elapsed;
      petals.updatePetals(elapsed, safeDt);
    },
    burstPetals(origin) {
      petals.triggerBurst(origin);
    },
  };
}
