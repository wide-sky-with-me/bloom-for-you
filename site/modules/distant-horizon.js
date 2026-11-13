// Layered Realistic Distant Coastal Horizon Subsystem:
// 1. 3-Tier Tectonic Ridged Multifractal Mountain Amphitheater (600m - 1,310m), partitioned into 4 spatial sectors per tier for frustum culling
// 2. Soft Drifting Valley & Fjord Sea-Mist Ribbons (Golden Hour ivory -> Moonlit indigo-silver)
// 3. 6 Sculpted Mid-Bay Archipelago Islands (150m - 420m) merged by 3 spatial sectors with Pulsing Surf Foam & Multi-Lobed Pine/Cypress Groves
// 4. Across-the-Bay Terraced Mediterranean Harbor Village (stepped stone lanes, arched quay, dual-slope terracotta roofs & Campanile Bell Tower)
// 5. Outer-Bay Cruising Sailboat Fleet (hull, mast, standing rigging stays/shrouds, cambered sails, speed-scaled V-wakes) & Classic Coastal Ferry

import {
  THREE,
  mergeGeometries,
  clamp,
  lerp,
  smoothstep,
  mulberry32,
  makeNormalTex,
} from "./pbr-kit.js";

function safeMergeHorizon(geos) {
  const prepared = [];
  for (let i = 0; i < geos.length; i += 1) {
    if (!geos[i]) continue;
    const g = geos[i].index ? geos[i].toNonIndexed() : geos[i].clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      const count = g.attributes.position.count;
      g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    prepared.push(g);
  }
  if (!prepared.length) return new THREE.BufferGeometry();
  const merged = mergeGeometries(prepared, false);
  merged.computeBoundingSphere();
  return merged;
}

function hash2(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function vnoise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uz = fz * fz * (3.0 - 2.0 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

function ridgedFbm2(x, z, octaves = 5) {
  let sum = 0.0;
  let amp = 0.54;
  let freq = 1.0;
  let weight = 1.0;
  for (let i = 0; i < octaves; i += 1) {
    const n = vnoise2(x * freq + i * 17.3, z * freq - i * 11.9);
    let signal = 1.0 - Math.abs(n * 2.0 - 1.0);
    signal = signal * signal * weight;
    weight = clamp(signal * 1.85, 0.18, 1.0);
    sum += signal * amp;
    freq *= 2.12;
    amp *= 0.48;
  }
  return clamp(sum / 0.92, 0.0, 1.15);
}

function createMountainRockNormalMap() {
  return makeNormalTex(
    256,
    256,
    (ctx, w, h) => {
      const rng = mulberry32(61403);
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 420; i += 1) {
        const x = rng() * w;
        const y = rng() * h;
        const shade = 75 + Math.floor(rng() * 110);
        ctx.strokeStyle = `rgba(${shade},${shade},${shade},0.35)`;
        ctx.lineWidth = 1.2 + rng() * 3.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rng() - 0.35) * 28, y + 14 + rng() * 32);
        ctx.stroke();
      }
      for (let i = 0; i < 2400; i += 1) {
        const v = 90 + Math.floor(rng() * 80);
        ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
        ctx.fillRect(rng() * w, rng() * h, 2 + rng() * 5, 2 + rng() * 5);
      }
    },
    { strength: 2.6, repeatX: 28, repeatY: 8 }
  );
}

// ---------------------------------------------------------------------------
// 1. 3-Tier Painterly Alpine Amphitheater (600m - 1,330m)
//    - domain-warped ridged multifractal crests + downslope erosion gullies
//    - per-pixel slope/height shading (strata cliffs, meadows, forest, terraces, snow)
//    - per-tier aerial perspective + valley haze (day/night aware)
//    - 8 azimuthal sectors per tier for frustum culling
// ---------------------------------------------------------------------------

const MOUNTAIN_SECTORS = 8;

function fbm2(x, z, octaves = 4) {
  let sum = 0.0;
  let amp = 0.5;
  let freq = 1.0;
  let norm = 0.0;
  for (let i = 0; i < octaves; i += 1) {
    sum += vnoise2(x * freq + i * 31.7, z * freq - i * 17.1) * amp;
    norm += amp;
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

function createMountainRunnelNormalMap() {
  // Downslope runnels / scree streaks (v axis == downhill)
  return makeNormalTex(
    256,
    256,
    (ctx, w, h) => {
      const rng = mulberry32(90211);
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 520; i += 1) {
        const x = rng() * w;
        const y = rng() * h;
        const shade = 60 + Math.floor(rng() * 140);
        ctx.strokeStyle = `rgba(${shade},${shade},${shade},0.32)`;
        ctx.lineWidth = 1.0 + rng() * 3.0;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + (rng() - 0.5) * 10, y + 20, x + (rng() - 0.5) * 14, y + 30 + rng() * 50);
        ctx.stroke();
      }
      for (let i = 0; i < 1600; i += 1) {
        const v = 90 + Math.floor(rng() * 80);
        ctx.fillStyle = `rgba(${v},${v},${v},0.3)`;
        ctx.fillRect(rng() * w, rng() * h, 2 + rng() * 4, 2 + rng() * 4);
      }
    },
    { strength: 2.2, repeatX: 1, repeatY: 1 }
  );
}

// Shared GLSL helpers (value noise) for all horizon terrain shaders
const HORIZON_NOISE_GLSL = /* glsl */ `
  float hzHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float hzNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hzHash(i), hzHash(i + vec2(1.0, 0.0)), f.x),
      mix(hzHash(i + vec2(0.0, 1.0)), hzHash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
`;

// Aerial perspective: farther / lower => bluer & hazier. Injected just before tone mapping
// (linear space) so it composes correctly with scene fog.
function injectAerialHaze(material, shared, tierHaze, extra = {}) {
  const local = {
    uTierHaze: { value: tierHaze },
    uHazeBaseY: { value: extra.hazeBaseY !== undefined ? extra.hazeBaseY : 40.0 },
  };
  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);
    shader.uniforms.uNight = shared.uNight;
    shader.uniforms.uHazeDay = shared.uHazeDay;
    shader.uniforms.uHazeNight = shared.uHazeNight;
    shader.uniforms.uHazeLow = shared.uHazeLow;
    shader.uniforms.uTierHaze = local.uTierHaze;
    shader.uniforms.uHazeBaseY = local.uHazeBaseY;
    if (!shader.vertexShader.includes("varying vec3 vHzWPos;")) {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vHzWPos;")
        .replace(
          "#include <project_vertex>",
          `#include <project_vertex>
          {
            vec4 hzW = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
              hzW = instanceMatrix * hzW;
            #endif
            vHzWPos = (modelMatrix * hzW).xyz;
          }`
        );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vHzWPos;"
      );
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uNight;
        uniform vec3 uHazeDay;
        uniform vec3 uHazeNight;
        uniform vec3 uHazeLow;
        uniform float uTierHaze;
        uniform float uHazeBaseY;`
      )
      .replace(
        "#include <tonemapping_fragment>",
        `{
          float hzDist = length(vHzWPos - cameraPosition);
          float hzLow = 1.0 - smoothstep(-6.0, uHazeBaseY, vHzWPos.y);
          float hzAmt = uTierHaze + clamp((hzDist - 520.0) / 2600.0, 0.0, 0.32);
          vec3 hzCol = mix(uHazeDay, uHazeNight, uNight);
          vec3 lowCol = mix(uHazeLow, uHazeNight * 1.25, uNight);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, hzCol, clamp(hzAmt, 0.0, 0.88));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, lowCol, hzLow * mix(0.42, 0.30, uNight));
        }
        #include <tonemapping_fragment>`
      );
  };
  const prevKey = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : () => "";
  material.customProgramCacheKey = () => `hzHaze|${extra.key || ""}|${prevKey()}`;
  return local;
}

function makeMountainTierMaterial(shared, tier, runnelMap) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    normalMap: runnelMap,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughness: 0.94,
    metalness: 0.0,
  });
  const u = {
    uMaxH: { value: tier.maxH },
    uSnowLine: { value: tier.snowLineRatio },
    uMeadow: { value: new THREE.Color(tier.meadowHex) },
    uForest: { value: new THREE.Color(tier.forestHex) },
    uRockDark: { value: new THREE.Color(tier.rockDarkHex) },
    uRockLight: { value: new THREE.Color(tier.rockLightHex) },
    uSnow: { value: new THREE.Color(tier.snowHex) },
    uTerraceA: { value: new THREE.Color(0x8e9a55) },
    uTerraceB: { value: new THREE.Color(0xb3a466) },
    uTerraceAmt: { value: tier.terraceAmt },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vHzWPos;\nvarying vec3 vMtWNorm;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vHzWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vMtWNorm = normalize(mat3(modelMatrix) * objectNormal);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vHzWPos;
        varying vec3 vMtWNorm;
        uniform float uMaxH;
        uniform float uSnowLine;
        uniform vec3 uMeadow;
        uniform vec3 uForest;
        uniform vec3 uRockDark;
        uniform vec3 uRockLight;
        uniform vec3 uSnow;
        uniform vec3 uTerraceA;
        uniform vec3 uTerraceB;
        uniform float uTerraceAmt;
        ${HORIZON_NOISE_GLSL}`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          vec3 Nw = normalize(vMtWNorm);
          float slope = 1.0 - clamp(Nw.y, 0.0, 1.0);
          float h01 = clamp(vHzWPos.y / uMaxH, 0.0, 1.25);
          vec2 wp = vHzWPos.xz;
          float n1 = hzNoise(wp * 0.011);
          float n2 = hzNoise(wp * 0.047 + 7.3);
          float n3 = hzNoise(wp * 0.19 - 3.1);
          float mott = n1 * 0.5 + n2 * 0.32 + n3 * 0.18;

          // Vegetation: meadows with patchy forest that thins out with altitude
          float forestMask = smoothstep(0.46, 0.60, n1 * 0.55 + n2 * 0.45 + (0.42 - h01) * 0.75);
          forestMask *= 1.0 - smoothstep(0.30, 0.52, slope);
          vec3 veg = mix(uMeadow * (0.86 + 0.28 * n2), uForest * (0.78 + 0.36 * n3), forestMask);

          // Terraced fields / vineyards on gentle low slopes (contour-following stripes)
          float tz = smoothstep(0.58, 0.70, hzNoise(wp * 0.0042 + 11.7)) * uTerraceAmt;
          tz *= (1.0 - smoothstep(0.10, 0.24, slope)) * (1.0 - smoothstep(0.16, 0.34, h01)) * (1.0 - forestMask);
          float terr = smoothstep(0.35, 0.65, fract(vHzWPos.y * 0.42 + n2 * 0.35));
          veg = mix(veg, mix(uTerraceA, uTerraceB, terr * (0.6 + 0.4 * n3)), tz);

          // Rock: sedimentary strata bands tilted by low-freq noise, darker gully streaks
          float sy = vHzWPos.y + (n1 - 0.5) * 22.0 + (wp.x * 0.012);
          float strata = 0.5 + 0.5 * sin(sy * 0.55 + n2 * 2.2);
          float strata2 = 0.5 + 0.5 * sin(sy * 1.9 + n3 * 3.0);
          vec3 rock = mix(uRockDark, uRockLight, clamp(strata * 0.55 + strata2 * 0.22 + n3 * 0.28, 0.0, 1.0));
          rock *= 0.82 + 0.3 * smoothstep(0.2, 0.8, n2);
          float rockMask = smoothstep(0.26, 0.46, slope + (n2 - 0.5) * 0.22);
          rockMask = max(rockMask, smoothstep(0.62, 0.92, h01 + (n1 - 0.5) * 0.2) * 0.85);
          vec3 col = mix(veg, rock, rockMask);

          // Light limestone scree / sunlit bare crests just below the snow
          col = mix(col, uRockLight * 1.12, smoothstep(0.78, 1.0, h01) * (1.0 - rockMask * 0.4) * 0.35);

          // Snow & firn caps: settle on flatter high ground, streaking down couloirs
          float snowN = h01 + (n2 - 0.5) * 0.16 + (n3 - 0.5) * 0.06;
          float snowMask = smoothstep(uSnowLine, uSnowLine + 0.09, snowN);
          snowMask *= 1.0 - smoothstep(0.52, 0.78, slope - (snowN - uSnowLine) * 0.6);
          col = mix(col, uSnow * (0.92 + 0.1 * n3), clamp(snowMask, 0.0, 1.0));

          // Dark foot shoreline / wet base
          col = mix(col * vec3(0.72, 0.74, 0.70), col, smoothstep(-4.0, 6.0, vHzWPos.y));
          diffuseColor.rgb = col * (0.9 + 0.2 * mott);
        }`
      );
  };
  mat.customProgramCacheKey = () => "hzMountainTier";
  injectAerialHaze(mat, shared, tier.tierHaze, { key: "mt", hazeBaseY: tier.maxH * 0.42 });
  return mat;
}

function makeTierSurface(t) {
  const span = t.outerR - t.innerR;
  return (ang, rt) => {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const radialWarp =
      26.0 * (fbm2(ca * 4.0 + t.seed, sa * 4.0 - t.seed, 3) - 0.5) +
      12.0 * Math.sin(ang * 7.0 + t.seed * 1.7);
    const radius = t.innerR + span * rt + radialWarp;
    const x = ca * radius;
    const z = sa * radius;

    // Asymmetric cross-profile: steep estate-facing front, long back slope
    const crestT = t.crestT;
    const front = smoothstep(0.0, crestT, rt);
    const back = 1.0 - smoothstep(crestT, 1.0, rt) * 0.78;
    const cross = Math.pow(front, 1.35) * back;

    // Domain-warped ridged multifractal (world space, peaks + spurs)
    const s = t.featureScale;
    const wx = x / s;
    const wz = z / s;
    const qx = wx + 0.85 * (fbm2(wx * 0.6 + 3.1, wz * 0.6, 3) - 0.5);
    const qz = wz + 0.85 * (fbm2(wx * 0.6 - 4.7, wz * 0.6 + 1.3, 3) - 0.5);
    const ridge = ridgedFbm2(qx, qz, 6);
    // Large-scale massif envelope along the ring (distinct peaks & saddles)
    const massif = 0.42 + 0.78 * fbm2(ca * 2.2 + t.seed * 3.0, sa * 2.2 - t.seed, 3);

    const dAng = Math.atan2(Math.sin(ang - t.channelAz), Math.cos(ang - t.channelAz));
    const seaStraitDip = 1.0 - t.channelDipStrength * Math.exp(-(dAng * dAng) / 0.095);
    const dSouth = Math.atan2(Math.sin(ang - 1.48), Math.cos(ang - 1.48));
    const southPassDip = 1.0 - 0.42 * Math.exp(-(dSouth * dSouth) / 0.06);

    let h = t.maxH * (0.16 + 0.92 * ridge * massif) * seaStraitDip * southPassDip;

    // Downslope erosion gullies: noise stretched along the radial (fall-line) direction
    const arc = ang * radius;
    const g1 = vnoise2(arc / t.gullyW, rt * span / (t.gullyW * 4.5) + t.seed);
    const g2 = vnoise2(arc / (t.gullyW * 0.45) + 9.1, rt * span / (t.gullyW * 2.2) - t.seed);
    const v1 = Math.abs(g1 * 2.0 - 1.0);
    const v2 = Math.abs(g2 * 2.0 - 1.0);
    const gully = (1.0 - smoothstep(0.0, 0.32, v1)) * 0.75 + (1.0 - smoothstep(0.0, 0.26, v2)) * 0.35;
    const midSlope = smoothstep(0.08, 0.45, rt / crestT) * (1.0 - smoothstep(0.85, 1.15, rt / crestT));
    h *= 1.0 - t.gullyDepth * gully * midSlope;

    const y = -10.0 + (h + 10.0) * cross;
    return [x, y, z];
  };
}

function buildTierMesh(parent, t, mat) {
  const surf = makeTierSurface(t);
  const meshes = [];
  const segs = Math.round(t.ringSegs / MOUNTAIN_SECTORS);
  const rows = t.radialSteps;
  // Concentrate rows on the visible estate-facing front and the crest silhouette
  const rtOf = (r) => {
    const a = r / rows;
    return a < 0.72 ? (a / 0.72) * (t.crestT + 0.08) : t.crestT + 0.08 + ((a - 0.72) / 0.28) * (0.92 - t.crestT);
  };
  for (let sec = 0; sec < MOUNTAIN_SECTORS; sec += 1) {
    const positions = [];
    const uvs = [];
    const indices = [];
    for (let r = 0; r <= rows; r += 1) {
      const rt = rtOf(r);
      for (let s = 0; s <= segs; s += 1) {
        const u = (sec + s / segs) / MOUNTAIN_SECTORS;
        const ang = u * Math.PI * 2.0;
        const p = surf(ang, rt);
        positions.push(p[0], p[1], p[2]);
        const radius = Math.hypot(p[0], p[2]);
        uvs.push((ang * radius) / 70.0, p[1] / 55.0 + rt * 3.0);
      }
    }
    const stride = segs + 1;
    for (let r = 0; r < rows; r += 1) {
      for (let s = 0; s < segs; s += 1) {
        const a = r * stride + s;
        const b = a + 1;
        const c = (r + 1) * stride + s;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `MountainTier${t.id}_Sector${sec}`;
    mesh.frustumCulled = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.raycast = () => {};
    parent.add(mesh);
    meshes.push(mesh);
  }
  return surf;
}

const MOUNTAIN_TIERS = [
  {
    id: 1,
    innerR: 600,
    outerR: 820,
    crestT: 0.5,
    ringSegs: 560,
    radialSteps: 30,
    maxH: 92,
    seed: 1.7,
    featureScale: 105,
    gullyW: 30,
    gullyDepth: 0.34,
    meadowHex: 0x6f8a52,
    forestHex: 0x2f4a33,
    rockDarkHex: 0x6c6658,
    rockLightHex: 0xa49a86,
    snowHex: 0xf4f1ea,
    snowLineRatio: 1.4,
    terraceAmt: 1.0,
    tierHaze: 0.1,
    channelAz: 0.15,
    channelDipStrength: 0.82,
    trees: 3600,
    treeScale: 1.0,
  },
  {
    id: 2,
    innerR: 790,
    outerR: 1060,
    crestT: 0.46,
    ringSegs: 470,
    radialSteps: 26,
    maxH: 175,
    seed: 5.4,
    featureScale: 150,
    gullyW: 42,
    gullyDepth: 0.38,
    meadowHex: 0x66805a,
    forestHex: 0x30483c,
    rockDarkHex: 0x6a6762,
    rockLightHex: 0xaaa497,
    snowHex: 0xf2f1ee,
    snowLineRatio: 0.78,
    terraceAmt: 0.45,
    tierHaze: 0.24,
    channelAz: 0.17,
    channelDipStrength: 0.74,
    trees: 2200,
    treeScale: 1.45,
  },
  {
    id: 3,
    innerR: 1010,
    outerR: 1330,
    crestT: 0.44,
    ringSegs: 440,
    radialSteps: 22,
    maxH: 265,
    seed: 11.2,
    featureScale: 190,
    gullyW: 55,
    gullyDepth: 0.42,
    meadowHex: 0x6f8579,
    forestHex: 0x3d5552,
    rockDarkHex: 0x6f7178,
    rockLightHex: 0xb2b1b0,
    snowHex: 0xf7f8fa,
    snowLineRatio: 0.6,
    terraceAmt: 0.0,
    tierHaze: 0.4,
    channelAz: 0.16,
    channelDipStrength: 0.62,
    trees: 0,
    treeScale: 1.0,
  },
];

// Instanced conifer / broadleaf clusters on lower gentle slopes of the near tiers
function buildMountainForests(parent, shared, tiers) {
  const conifer = new THREE.ConeGeometry(0.34, 1.0, 5, 1, true);
  conifer.translate(0, 0.5, 0);
  const broad = new THREE.OctahedronGeometry(0.42, 0);
  broad.scale(1.0, 0.82, 1.0);
  broad.translate(0, 0.62, 0);

  const coniferMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const broadMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  injectAerialHaze(coniferMat, shared, 0.12, { key: "tree", hazeBaseY: 34.0 });
  injectAerialHaze(broadMat, shared, 0.12, { key: "tree", hazeBaseY: 34.0 });

  const coniferPal = [0x22382a, 0x2a4230, 0x1f3326, 0x304a35];
  const broadPal = [0x3e5a34, 0x4a6638, 0x56703f, 0x3a5233];
  const inst = [];
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const hazeTint = new THREE.Color(0x8fa3b4);

  for (const t of tiers) {
    if (!t.trees) continue;
    const rng = mulberry32(7717 + t.id * 131);
    const placements = [];
    for (let tries = 0; tries < t.trees * 6 && placements.length < t.trees; tries += 1) {
      const ang = rng() * Math.PI * 2.0;
      const rt = 0.04 + rng() * (t.crestT * 0.85);
      // Clustered groves: low-frequency noise mask on the ring
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const grove = fbm2(ca * 9.0 + t.seed + rt * 2.5, sa * 9.0 - rt * 2.0, 3);
      if (grove < 0.5 + rng() * 0.1) continue;
      const p = t.surf(ang, rt);
      const p2 = t.surf(ang, rt + 0.012);
      const p3 = t.surf(ang + 0.004, rt);
      const dRad = Math.hypot(p2[0] - p[0], p2[2] - p[2]) || 1;
      const dArc = Math.hypot(p3[0] - p[0], p3[2] - p[2]) || 1;
      const grade = Math.max(Math.abs(p2[1] - p[1]) / dRad, Math.abs(p3[1] - p[1]) / dArc);
      if (grade > 0.75) continue;
      const h01 = p[1] / t.maxH;
      if (p[1] < 2.5 || h01 > 0.55) continue;
      placements.push({ p, rnd: rng(), rnd2: rng(), h01 });
    }
    const conifers = placements.filter((q) => q.rnd < 0.68 || q.h01 > 0.32);
    const broads = placements.filter((q) => !(q.rnd < 0.68 || q.h01 > 0.32));
    const tint = t.id === 1 ? 0.0 : 0.18;
    const makeInst = (geo, mat, arr, pal, hMin, hMax) => {
      if (!arr.length) return;
      const im = new THREE.InstancedMesh(geo, mat, arr.length);
      for (let i = 0; i < arr.length; i += 1) {
        const q = arr[i];
        const hgt = (hMin + q.rnd2 * (hMax - hMin)) * t.treeScale * (1.0 - q.h01 * 0.45);
        dummy.position.set(q.p[0], q.p[1] - 1.6 * t.treeScale, q.p[2]);
        dummy.rotation.set(0, q.rnd2 * 6.28, 0);
        dummy.scale.set(hgt, hgt, hgt);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        col.setHex(pal[i % pal.length]).lerp(hazeTint, tint);
        im.setColorAt(i, col);
      }
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.frustumCulled = true;
      im.castShadow = false;
      im.receiveShadow = false;
      im.raycast = () => {};
      im.name = `MountainForest_T${t.id}`;
      parent.add(im);
      inst.push({ im, full: arr.length });
    };
    makeInst(conifer, coniferMat, conifers, coniferPal, 11, 19);
    makeInst(broad, broadMat, broads, broadPal, 9, 14);
  }
  return {
    setQualityRatio(ratio) {
      const r = clamp(ratio, 0.35, 1.0);
      for (const e of inst) e.im.count = Math.max(1, Math.round(e.full * r));
    },
  };
}

// Tiny far hamlets (white walls + terracotta roofs, warm windows at night)
function buildMountainHamlets(parent, shared, tier) {
  const rng = mulberry32(55123);
  const wallGeos = [];
  const glowGeos = [];
  const sites = [
    { ang: -0.62, rt: 0.12, n: 9 },
    { ang: -1.25, rt: 0.16, n: 7 },
    { ang: 2.05, rt: 0.1, n: 10 },
    { ang: 2.75, rt: 0.14, n: 8 },
    { ang: -2.35, rt: 0.11, n: 9 },
    { ang: 0.85, rt: 0.13, n: 6 },
  ];
  const cWall = [0xf1e8d8, 0xe9dcc4, 0xf4efe6, 0xe5d3b8];
  const cRoof = [0xb4583a, 0xc0684a, 0xa55035];
  const pushCol = (geo, hex) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    const c = new THREE.Color(hex);
    for (let i = 0; i < n; i += 1) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    wallGeos.push(g);
  };
  for (const site of sites) {
    for (let i = 0; i < site.n; i += 1) {
      const ang = site.ang + (rng() - 0.5) * 0.045;
      const rt = site.rt + (rng() - 0.5) * 0.06;
      const p = tier.surf(ang, Math.max(0.05, rt));
      if (p[1] < 1.5) continue;
      const w = 5 + rng() * 3;
      const d = 6 + rng() * 4;
      const h = 4 + rng() * 3.5;
      const yaw = -ang + (rng() - 0.5) * 0.5;
      const body = new THREE.BoxGeometry(w, h + 4, d);
      body.translate(0, (h + 4) * 0.5 - 4, 0);
      body.rotateY(yaw);
      body.translate(p[0], p[1], p[2]);
      pushCol(body, cWall[i % cWall.length]);
      const roof = new THREE.CylinderGeometry(0.01, w * 0.62, 2.6, 4, 1);
      roof.rotateY(Math.PI / 4);
      roof.scale(1.0, 1.0, d / w);
      roof.translate(0, h + 1.25, 0);
      roof.rotateY(yaw);
      roof.translate(p[0], p[1], p[2]);
      pushCol(roof, cRoof[i % cRoof.length]);
      if (rng() < 0.75) {
        const win = new THREE.PlaneGeometry(1.6, 1.4);
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        win.lookAt(new THREE.Vector3(-ca, 0, -sa));
        win.translate(p[0] - ca * (Math.max(w, d) * 0.55), p[1] + h * 0.5, p[2] - sa * (Math.max(w, d) * 0.55));
        glowGeos.push(win);
      }
    }
  }
  const wallMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  injectAerialHaze(wallMat, shared, 0.12, { key: "hamlet", hazeBaseY: 34.0 });
  const walls = new THREE.Mesh(safeMergeHorizon(wallGeos), wallMat);
  walls.name = "MountainHamlets";
  walls.raycast = () => {};
  parent.add(walls);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffb35a,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const glow = new THREE.Mesh(safeMergeHorizon(glowGeos), glowMat);
  glow.name = "MountainHamletWindows";
  glow.raycast = () => {};
  glow.visible = false;
  parent.add(glow);
  return {
    setNightMix(m) {
      glowMat.opacity = smoothstep(0.35, 0.9, m) * 0.95;
      glow.visible = glowMat.opacity > 0.01;
    },
  };
}

// Thin cascading waterfall threads following steep gullies on the estate-facing walls
function buildMountainWaterfalls(parent, tiers) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    { uTime: { value: 0 }, uNightMix: { value: 0 } },
  ]);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uNightMix;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      ${HORIZON_NOISE_GLSL}
      void main() {
        float across = abs(vUv.x * 2.0 - 1.0);
        float streak = hzNoise(vec2(vUv.x * 7.0, vUv.y * 9.0 + uTime * 1.6));
        float a = (1.0 - smoothstep(0.35, 1.0, across)) * (0.55 + 0.45 * streak);
        a *= smoothstep(0.0, 0.06, vUv.y) * (0.7 + 0.3 * smoothstep(0.8, 1.0, vUv.y));
        a *= mix(0.85, 0.45, uNightMix);
        if (a < 0.02) discard;
        vec3 c = mix(vec3(0.96, 0.98, 1.0), vec3(0.52, 0.62, 0.78), uNightMix);
        gl_FragColor = vec4(c, a);
        #include <fog_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  const geos = [];
  const picks = [
    { tier: 0, angs: [-0.9, -1.75, 2.35, 2.95, -2.7] },
    { tier: 1, angs: [-0.4, -1.45, 1.95, -2.15] },
  ];
  for (const pk of picks) {
    const t = tiers[pk.tier];
    for (const a0 of pk.angs) {
      // Choose the steepest nearby fall line
      let best = a0;
      let bestDrop = -1;
      for (let k = -6; k <= 6; k += 1) {
        const a = a0 + k * 0.006;
        const hi = t.surf(a, t.crestT * 0.75)[1];
        const lo = t.surf(a, t.crestT * 0.18)[1];
        if (hi - lo > bestDrop) {
          bestDrop = hi - lo;
          best = a;
        }
      }
      const steps = 14;
      const width = 5.5 * (pk.tier === 0 ? 1.0 : 1.5);
      const pos = [];
      const uv = [];
      const idx = [];
      const ca = Math.cos(best);
      const sa = Math.sin(best);
      for (let i = 0; i <= steps; i += 1) {
        const rt = lerp(t.crestT * 0.72, t.crestT * 0.06, i / steps);
        const p = t.surf(best + Math.sin(i * 0.9) * 0.0015, rt);
        const ox = p[0] - ca * 2.5;
        const oz = p[2] - sa * 2.5;
        const px = -sa * width * 0.5;
        const pz = ca * width * 0.5;
        pos.push(ox - px, p[1] + 1.2, oz - pz, ox + px, p[1] + 1.2, oz + pz);
        uv.push(0, i / steps, 1, i / steps);
      }
      for (let i = 0; i < steps; i += 1) {
        const q = i * 2;
        idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      geos.push(g);
    }
  }
  const m = new THREE.Mesh(safeMergeHorizon(geos), mat);
  m.name = "MountainWaterfalls";
  m.raycast = () => {};
  m.frustumCulled = true;
  parent.add(m);
  return uniforms;
}

function buildTectonicMountainAmphitheater(parent) {
  const shared = {
    uNight: { value: 0 },
    uHazeDay: { value: new THREE.Color(0xa9bccb) },
    uHazeNight: { value: new THREE.Color(0x1a2840) },
    uHazeLow: { value: new THREE.Color(0xe8ddd0) },
  };
  const runnelMap = createMountainRunnelNormalMap();
  const tiers = MOUNTAIN_TIERS.map((t) => ({ ...t }));
  const mats = [];
  for (const t of tiers) {
    const mat = makeMountainTierMaterial(shared, t, runnelMap);
    mats.push(mat);
    t.surf = buildTierMesh(parent, t, mat);
  }
  const forestCtrl = buildMountainForests(parent, shared, tiers);
  const hamletCtrl = buildMountainHamlets(parent, shared, tiers[0]);
  const fallUniforms = buildMountainWaterfalls(parent, tiers);
  return {
    setNightMix(m) {
      shared.uNight.value = m;
      fallUniforms.uNightMix.value = m;
      hamletCtrl.setNightMix(m);
      for (const mat of mats) mat.envMapIntensity = lerp(1.0, 0.6, m);
    },
    update(t) {
      fallUniforms.uTime.value = t;
    },
    setQualityRatio: forestCtrl.setQualityRatio,
  };
}

// ---------------------------------------------------------------------------
// 2. Drifting Valley & Fjord Sea-Mist Cloud Ribbons
// ---------------------------------------------------------------------------

function buildValleyMistRibbons(parent) {
  const mistUniforms = {
    uTime: { value: 0 },
    uNightMix: { value: 0 },
  };
  const mistMat = new THREE.ShaderMaterial({
    uniforms: mistUniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uNightMix;
      varying vec2 vUv;
      ${HORIZON_NOISE_GLSL}
      void main() {
        vec2 uv = vUv;
        float n1 = hzNoise(vec2(uv.x * 16.0 + uTime * 0.018, uv.y * 3.5));
        float n2 = hzNoise(vec2(uv.x * 34.0 - uTime * 0.012, uv.y * 7.0 + 3.1));
        float wisp = smoothstep(0.32, 0.78, n1 * 0.68 + n2 * 0.36);
        float vEnv = pow(sin(clamp(uv.y, 0.0, 1.0) * 3.14159265), 1.9);
        float hEnv = pow(sin(clamp(uv.x, 0.0, 1.0) * 3.14159265), 0.55);
        float alpha = wisp * vEnv * hEnv * mix(0.32, 0.20, uNightMix);
        if (alpha < 0.002) discard;
        vec3 mistCol = mix(vec3(0.98, 0.93, 0.88), vec3(0.24, 0.34, 0.50), uNightMix);
        gl_FragColor = vec4(mistCol, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const bands = [
    { r: 535, y: 18, h: 28, startAng: -1.35, spanAng: 1.15 },
    { r: 615, y: 26, h: 36, startAng: 0.52, spanAng: 1.45 },
    { r: 690, y: 34, h: 42, startAng: 2.25, spanAng: 1.65 },
    { r: 785, y: 46, h: 48, startAng: -2.65, spanAng: 1.40 },
  ];

  for (const b of bands) {
    const cyl = new THREE.CylinderGeometry(b.r, b.r * 1.03, b.h, 64, 1, true, b.startAng, b.spanAng);
    cyl.computeBoundingSphere();
    const m = new THREE.Mesh(cyl, mistMat);
    m.position.y = b.y;
    m.frustumCulled = true;
    m.raycast = () => {};
    parent.add(m);
  }

  // Low-lying valley veils between the tiers: separate the ranges into painterly layers
  const veilMat = new THREE.ShaderMaterial({
    uniforms: mistUniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uNightMix;
      varying vec2 vUv;
      ${HORIZON_NOISE_GLSL}
      void main() {
        float n1 = hzNoise(vec2(vUv.x * 60.0 + uTime * 0.01, vUv.y * 2.0));
        float n2 = hzNoise(vec2(vUv.x * 170.0 - uTime * 0.02, vUv.y * 4.5 + 1.7));
        float body = 1.0 - smoothstep(0.0, 1.0, vUv.y);
        body = pow(body, 1.3) * smoothstep(0.0, 0.08, vUv.y);
        float a = body * (0.55 + 0.45 * (n1 * 0.7 + n2 * 0.3)) * mix(0.5, 0.34, uNightMix);
        if (a < 0.003) discard;
        vec3 c = mix(vec3(0.95, 0.92, 0.88), vec3(0.20, 0.29, 0.44), uNightMix);
        gl_FragColor = vec4(c, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const v of [
    { r: 770, y: -6, h: 52 },
    { r: 985, y: -6, h: 85 },
  ]) {
    const geo = new THREE.CylinderGeometry(v.r, v.r, v.h, 96, 1, true);
    geo.translate(0, v.y + v.h * 0.5, 0);
    // CylinderGeometry uv.y: 1 at top, 0 at bottom (valley floor)
    const m = new THREE.Mesh(geo, veilMat);
    m.name = "ValleyVeil";
    m.frustumCulled = false;
    m.raycast = () => {};
    parent.add(m);
  }

  return mistUniforms;
}

// ---------------------------------------------------------------------------
// 3. Mid-Bay Sculpted Archipelago Islands (3 Spatial Sectors) & Across-Bay Village
// ---------------------------------------------------------------------------

const ARCHIPELAGO_SPECS = [
  // Sector 0 (East Bay): Islands 0 & 1
  {
    sector: 0,
    cx: 248.0,
    cz: -74.0,
    rx: 56.0,
    rz: 44.0,
    maxH: 31.0,
    rot: -0.32,
    seed: 101,
    hasVillage: true,
    treeCount: 68,
  },
  {
    sector: 0,
    cx: 318.0,
    cz: 118.0,
    rx: 48.0,
    rz: 36.0,
    maxH: 27.5,
    rot: 0.44,
    seed: 205,
    hasVillage: false,
    treeCount: 52,
  },
  // Sector 1 (North Channel): Islands 2 & 3
  {
    sector: 1,
    cx: 138.0,
    cz: -168.0,
    rx: 38.0,
    rz: 29.0,
    maxH: 21.0,
    rot: 0.28,
    seed: 309,
    hasVillage: false,
    treeCount: 42,
  },
  {
    sector: 1,
    cx: -176.0,
    cz: -158.0,
    rx: 44.0,
    rz: 33.0,
    maxH: 24.5,
    rot: -0.52,
    seed: 417,
    hasVillage: false,
    treeCount: 48,
  },
  // Sector 2 (South Bay): Islands 4 & 5
  {
    sector: 2,
    cx: 162.0,
    cz: 228.0,
    rx: 42.0,
    rz: 31.0,
    maxH: 22.0,
    rot: 0.62,
    seed: 523,
    hasVillage: false,
    treeCount: 38,
  },
  {
    sector: 2,
    cx: -224.0,
    cz: 186.0,
    rx: 52.0,
    rz: 38.0,
    maxH: 29.0,
    rot: -0.38,
    seed: 631,
    hasVillage: false,
    treeCount: 50,
  },
];

function evalIslandLocalHeight(spec, lx, lz) {
  const nx = lx / spec.rx;
  const nz = lz / spec.rz;
  const baseR = Math.hypot(nx, nz);
  const ang = Math.atan2(nz, nx);
  const coastWarp =
    0.16 * Math.sin(ang * 3.0 + spec.seed) +
    0.10 * Math.cos(ang * 5.0 - spec.seed * 0.6) +
    0.06 * Math.sin(ang * 8.0 + 1.4);
  const nr = baseR / (1.0 + coastWarp);
  if (nr >= 1.24) return -3.8;

  const landMask = 1.0 - smoothstep(0.18, 1.02, nr);
  const cliffShoulder = Math.pow(clamp(1.0 - smoothstep(0.0, 0.96, nr), 0.0, 1.0), 0.68);
  const ridge = ridgedFbm2(nx * 2.1 + spec.seed * 0.13, nz * 2.1 - spec.seed * 0.09, 4);
  return -3.2 + (spec.maxH * (0.45 + 0.55 * ridge) * cliffShoulder + 3.2 * landMask);
}

function islandLocalToWorld(spec, lx, lz) {
  const c = Math.cos(spec.rot);
  const s = Math.sin(spec.rot);
  return {
    wx: spec.cx + lx * c - lz * s,
    wz: spec.cz + lx * s + lz * c,
  };
}

function buildArchipelagoAndAcrossBayTown(parent, rockNormalMap) {
  const sectorIslandGeos = [[], [], []];
  const sectorFoamGeos = [[], [], []];
  const treePlacements = [];

  for (let idx = 0; idx < ARCHIPELAGO_SPECS.length; idx += 1) {
    const spec = ARCHIPELAGO_SPECS[idx];
    const secBucket = spec.sector;
    const segW = 44;
    const segD = 44;
    const spanX = spec.rx * 2.45;
    const spanZ = spec.rz * 2.45;
    const g = new THREE.PlaneGeometry(spanX, spanZ, segW, segD);
    g.rotateX(-Math.PI / 2);

    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const y = evalIslandLocalHeight(spec, lx, lz);
      const { wx, wz } = islandLocalToWorld(spec, lx, lz);
      pos.setXYZ(i, wx, y, wz);
    }
    g.computeVertexNormals();

    const norm = g.attributes.normal;
    const cols = new Float32Array(pos.count * 3);
    const cSand = new THREE.Color(0xdfd1b2);
    const cWet = new THREE.Color(0xa89b82);
    const cGrass = new THREE.Color(0x567a46);
    const cOlive = new THREE.Color(0x466640);
    const cCliffLight = new THREE.Color(0xa69e90);
    const cCliffDark = new THREE.Color(0x7f796e);
    const cTmp = new THREE.Color();
    const cRock = new THREE.Color();

    for (let i = 0; i < pos.count; i += 1) {
      const py = pos.getY(i);
      const ny = clamp(norm.getY(i), 0.0, 1.0);
      const m = vnoise2(pos.getX(i) * 0.06, pos.getZ(i) * 0.06);

      if (py < 0.2) {
        cTmp.copy(cWet);
      } else if (py < 1.65) {
        cTmp.copy(cSand).lerp(cGrass, smoothstep(0.85, 1.65, py));
      } else {
        cTmp.copy(cGrass).lerp(cOlive, clamp(m * 0.85, 0.0, 1.0));
      }

      if (ny < 0.84 && py > -0.6) {
        const rw = smoothstep(0.84, 0.52, ny);
        cRock.copy(cCliffDark).lerp(cCliffLight, 0.5 + 0.5 * Math.sin(py * 1.6 + m * 3.0));
        cTmp.lerp(cRock, rw * 0.9);
      }

      cols[i * 3 + 0] = cTmp.r;
      cols[i * 3 + 1] = cTmp.g;
      cols[i * 3 + 2] = cTmp.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    sectorIslandGeos[secBucket].push(g);

    // Craggy low-profile coastal limestone reef boulders around island capes
    const rng = mulberry32(spec.seed * 37);
    const cReefBase = new THREE.Color(0x5d584f);
    const cReefTop = new THREE.Color(0x837d72);
    const cReefTmp = new THREE.Color();
    for (let r = 0; r < 9; r += 1) {
      const a = (r / 9) * Math.PI * 2.0 + rng() * 0.45;
      const lx = Math.cos(a) * spec.rx * (0.95 + rng() * 0.14);
      const lz = Math.sin(a) * spec.rz * (0.95 + rng() * 0.14);
      const { wx, wz } = islandLocalToWorld(spec, lx, lz);
      const rad = 1.8 + rng() * 2.4;
      const squashY = 0.46 + rng() * 0.34;
      const rawRock = new THREE.DodecahedronGeometry(rad, 1);
      const rock = rawRock.index ? rawRock.toNonIndexed() : rawRock;
      const rp = rock.attributes.position;
      for (let v = 0; v < rp.count; v += 1) {
        const vx = rp.getX(v);
        const vy = rp.getY(v);
        const vz = rp.getZ(v);
        const crag = 0.76 + 0.42 * vnoise2(vx * 1.4 + r * 7.1, vz * 1.4 - vy * 1.1);
        const baseSpread = vy < 0 ? 1.22 : 0.92;
        rp.setXYZ(v, vx * crag * baseSpread, vy * squashY * crag, vz * crag * baseSpread);
      }
      rock.rotateY(rng() * Math.PI * 2.0);
      rock.translate(wx, rad * squashY * 0.22 - 0.35, wz);
      rock.computeVertexNormals();
      const rc = rp.count;
      const rCols = new Float32Array(rc * 3);
      for (let k = 0; k < rc; k += 1) {
        const hMix = clamp((rp.getY(k) + 0.5) / 2.2, 0.0, 1.0);
        cReefTmp.copy(cReefBase).lerp(cReefTop, hMix);
        rCols[k * 3 + 0] = cReefTmp.r;
        rCols[k * 3 + 1] = cReefTmp.g;
        rCols[k * 3 + 2] = cReefTmp.b;
      }
      rock.setAttribute("color", new THREE.BufferAttribute(rCols, 3));
      sectorIslandGeos[secBucket].push(rock);
    }

    // Shoreline white surf-foam skirt hugging exact waterline contour
    const foamSegs = 72;
    const foamPos = [];
    const foamUv = [];
    const foamIdx = [];
    for (let s = 0; s <= foamSegs; s += 1) {
      const u = s / foamSegs;
      const ang = u * Math.PI * 2.0;
      const coastWarp =
        0.16 * Math.sin(ang * 3.0 + spec.seed) +
        0.10 * Math.cos(ang * 5.0 - spec.seed * 0.6) +
        0.06 * Math.sin(ang * 8.0 + 1.4);
      const rIn = 0.91 * (1.0 + coastWarp);
      const rOut = 1.08 * (1.0 + coastWarp);
      const pIn = islandLocalToWorld(spec, Math.cos(ang) * spec.rx * rIn, Math.sin(ang) * spec.rz * rIn);
      const pOut = islandLocalToWorld(spec, Math.cos(ang) * spec.rx * rOut, Math.sin(ang) * spec.rz * rOut);
      foamPos.push(pIn.wx, 0.08, pIn.wz, pOut.wx, 0.06, pOut.wz);
      foamUv.push(u * 12.0, 0.0, u * 12.0, 1.0);
    }
    for (let s = 0; s < foamSegs; s += 1) {
      const a = s * 2;
      foamIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const fGeo = new THREE.BufferGeometry();
    fGeo.setAttribute("position", new THREE.Float32BufferAttribute(foamPos, 3));
    fGeo.setAttribute("uv", new THREE.Float32BufferAttribute(foamUv, 2));
    fGeo.setIndex(foamIdx);
    fGeo.computeVertexNormals();
    sectorFoamGeos[secBucket].push(fGeo);

    // Sample Mediterranean umbrella pines, cypress spires & blossom trees on island upper slopes
    let placed = 0;
    for (let tries = 0; tries < spec.treeCount * 8 && placed < spec.treeCount; tries += 1) {
      const lx = (rng() * 2.0 - 1.0) * spec.rx * 0.78;
      const lz = (rng() * 2.0 - 1.0) * spec.rz * 0.78;
      if (spec.hasVillage && lx < 8.0 && lz > -12.0 && Math.hypot(lx + 14.0, lz - 10.0) < 25.0) {
        continue;
      }
      const y = evalIslandLocalHeight(spec, lx, lz);
      if (y < 3.2) continue;
      const { wx, wz } = islandLocalToWorld(spec, lx, lz);
      treePlacements.push({
        x: wx,
        y,
        z: wz,
        scale: 0.9 + rng() * 0.65,
        isCypress: rng() < 0.38,
        isBlossom: rng() > 0.80,
        rot: rng() * Math.PI * 2.0,
      });
      placed += 1;
    }
  }

  const sharedIslandMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    normalMap: rockNormalMap,
    normalScale: new THREE.Vector2(0.65, 0.65),
    roughness: 0.88,
    metalness: 0.02,
  });

  const surfUniforms = { uTime: { value: 0 }, uNightMix: { value: 0 } };
  const sharedSurfMat = new THREE.ShaderMaterial({
    uniforms: surfUniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uNightMix;
      varying vec2 vUv;
      void main() {
        float wave1 = sin(vUv.y * 10.0 - uTime * 2.1 + sin(vUv.x * 3.14159) * 1.5) * 0.5 + 0.5;
        float env = pow(sin(clamp(vUv.y, 0.0, 1.0) * 3.14159265), 1.4);
        float alpha = env * (0.35 + 0.55 * wave1) * mix(0.72, 0.45, uNightMix);
        if (alpha < 0.02) discard;
        vec3 col = mix(vec3(0.97, 0.96, 0.94), vec3(0.55, 0.66, 0.80), uNightMix);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Merge per spatial sector (3 sectors) for both low Draw Calls AND effective frustum culling!
  for (let secIdx = 0; secIdx < 3; secIdx += 1) {
    if (sectorIslandGeos[secIdx].length) {
      const m = new THREE.Mesh(safeMergeHorizon(sectorIslandGeos[secIdx]), sharedIslandMat);
      m.name = `ArchipelagoSector_${secIdx}`;
      m.frustumCulled = true;
      m.castShadow = false;
      m.receiveShadow = false;
      m.raycast = () => {};
      parent.add(m);
    }
    if (sectorFoamGeos[secIdx].length) {
      const fm = new THREE.Mesh(safeMergeHorizon(sectorFoamGeos[secIdx]), sharedSurfMat);
      fm.name = `ArchipelagoSurfSector_${secIdx}`;
      fm.frustumCulled = true;
      fm.raycast = () => {};
      parent.add(fm);
    }
  }

  const forestCtrl = buildIslandForestInstances(parent, treePlacements);
  const villageGlowMat = buildAcrossBayHarborVillage(parent, ARCHIPELAGO_SPECS[0]);

  return { surfUniforms, forestCtrl, villageGlowMat };
}

function buildIslandForestInstances(parent, treePlacements) {
  if (!treePlacements.length) return { setQualityRatio: () => {} };

  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.28, 2.5, 6);
  trunkGeo.translate(0, 1.25, 0);

  const lobeSpecs = [
    [0.0, 3.45, 0.0, 1.65, 0.72, 1.55],
    [-1.05, 3.05, 0.55, 1.25, 0.66, 1.2],
    [1.1, 3.12, -0.45, 1.3, 0.64, 1.18],
    [0.25, 2.95, 1.05, 1.18, 0.62, 1.15],
    [-0.45, 3.02, -1.0, 1.22, 0.65, 1.18],
    [0.15, 3.88, -0.1, 1.15, 0.62, 1.12],
  ];
  const crownParts = [];
  const cShade = new THREE.Color(0x9aa896);
  const cSun = new THREE.Color(0xffffff);
  const cTmp = new THREE.Color();

  for (let l = 0; l < lobeSpecs.length; l += 1) {
    const [ox, oy, oz, sx, sy, sz] = lobeSpecs[l];
    const rawLobe = new THREE.IcosahedronGeometry(1.0, 1);
    const lobe = rawLobe.index ? rawLobe.toNonIndexed() : rawLobe;
    const lp = lobe.attributes.position;
    const cols = new Float32Array(lp.count * 3);
    for (let i = 0; i < lp.count; i += 1) {
      const vx = lp.getX(i);
      const vy = lp.getY(i);
      const vz = lp.getZ(i);
      const ruffle = 0.84 + 0.30 * vnoise2(vx * 2.2 + l * 3.7, vz * 2.2 - vy * 1.9);
      lp.setXYZ(i, ox + vx * sx * ruffle, oy + vy * sy * ruffle, oz + vz * sz * ruffle);
      const sunT = clamp((vy + 0.85) / 1.7, 0.0, 1.0);
      cTmp.copy(cShade).lerp(cSun, sunT);
      cols[i * 3 + 0] = cTmp.r;
      cols[i * 3 + 1] = cTmp.g;
      cols[i * 3 + 2] = cTmp.b;
    }
    lobe.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    lobe.computeVertexNormals();
    crownParts.push(lobe);
  }
  const pineCrownGeo = safeMergeHorizon(crownParts);

  // Soft sculpted Mediterranean columnar cypress (no harsh angular cone pyramids)
  const cypParts = [];
  const rawCypTrunk = new THREE.CylinderGeometry(0.11, 0.22, 1.4, 6);
  const cypTrunk = rawCypTrunk.index ? rawCypTrunk.toNonIndexed() : rawCypTrunk;
  cypTrunk.translate(0, 0.7, 0);
  {
    const cnt = cypTrunk.attributes.position.count;
    const cols = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i += 1) {
      cols[i * 3 + 0] = 0.42;
      cols[i * 3 + 1] = 0.36;
      cols[i * 3 + 2] = 0.28;
    }
    cypTrunk.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  }
  cypParts.push(cypTrunk);

  const cypLobes = [
    [0.0, 2.05, 0.0, 0.86, 1.12, 0.86],
    [0.08, 3.05, -0.05, 0.74, 1.18, 0.74],
    [-0.06, 4.05, 0.06, 0.58, 1.15, 0.58],
    [0.02, 5.05, 0.0, 0.40, 1.02, 0.40],
    [0.0, 5.85, 0.0, 0.22, 0.68, 0.22],
  ];
  for (let l = 0; l < cypLobes.length; l += 1) {
    const [ox, oy, oz, sx, sy, sz] = cypLobes[l];
    const rawLobe = new THREE.IcosahedronGeometry(1.0, 1);
    const lobe = rawLobe.index ? rawLobe.toNonIndexed() : rawLobe;
    const lp = lobe.attributes.position;
    const cols = new Float32Array(lp.count * 3);
    for (let i = 0; i < lp.count; i += 1) {
      const vx = lp.getX(i);
      const vy = lp.getY(i);
      const vz = lp.getZ(i);
      const ruffle = 0.86 + 0.24 * vnoise2(vx * 2.1 + l * 4.3, vz * 2.1 - vy * 1.8);
      lp.setXYZ(i, ox + vx * sx * ruffle, oy + vy * sy * ruffle, oz + vz * sz * ruffle);
      const sunT = clamp((oy + vy * sy - 1.2) / 5.4, 0.0, 1.0);
      cTmp.copy(cShade).lerp(cSun, 0.2 + 0.8 * sunT);
      cols[i * 3 + 0] = cTmp.r;
      cols[i * 3 + 1] = cTmp.g;
      cols[i * 3 + 2] = cTmp.b;
    }
    lobe.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    lobe.computeVertexNormals();
    cypParts.push(lobe);
  }
  const cypressGeo = safeMergeHorizon(cypParts);

  const pines = treePlacements.filter((t) => !t.isCypress);
  const cypresses = treePlacements.filter((t) => t.isCypress);

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let trunkInst = null;
  let crownInst = null;
  let cypInst = null;

  if (pines.length) {
    trunkInst = new THREE.InstancedMesh(
      trunkGeo,
      new THREE.MeshStandardMaterial({ color: 0x584030, roughness: 0.9 }),
      pines.length
    );
    crownInst = new THREE.InstancedMesh(
      pineCrownGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.84 }),
      pines.length
    );
    trunkInst.castShadow = false;
    crownInst.castShadow = false;
    trunkInst.raycast = () => {};
    crownInst.raycast = () => {};

    for (let i = 0; i < pines.length; i += 1) {
      const t = pines[i];
      dummy.position.set(t.x, t.y - 0.3, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.setScalar(t.scale * 0.88);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);
      crownInst.setMatrixAt(i, dummy.matrix);

      if (t.isBlossom) {
        col.setHex(0xe5bcc8);
      } else {
        col.setHex(i % 3 === 0 ? 0x3b5f3d : i % 3 === 1 ? 0x4b6e44 : 0x55754c);
      }
      crownInst.setColorAt(i, col);
    }
    trunkInst.instanceMatrix.needsUpdate = true;
    crownInst.instanceMatrix.needsUpdate = true;
    crownInst.instanceColor.needsUpdate = true;
    parent.add(trunkInst, crownInst);
  }

  if (cypresses.length) {
    cypInst = new THREE.InstancedMesh(
      cypressGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.86 }),
      cypresses.length
    );
    cypInst.castShadow = false;
    cypInst.raycast = () => {};
    for (let i = 0; i < cypresses.length; i += 1) {
      const t = cypresses[i];
      dummy.position.set(t.x, t.y - 0.3, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.setScalar(t.scale * 0.92);
      dummy.updateMatrix();
      cypInst.setMatrixAt(i, dummy.matrix);
      col.setHex(i % 3 === 0 ? 0x2f5337 : i % 3 === 1 ? 0x3b613f : 0x456b46);
      cypInst.setColorAt(i, col);
    }
    cypInst.instanceMatrix.needsUpdate = true;
    cypInst.instanceColor.needsUpdate = true;
    parent.add(cypInst);
  }

  return {
    setQualityRatio(ratio) {
      const r = clamp(ratio, 0.35, 1.0);
      if (trunkInst) trunkInst.count = Math.max(1, Math.round(pines.length * r));
      if (crownInst) crownInst.count = Math.max(1, Math.round(pines.length * r));
      if (cypInst) cypInst.count = Math.max(1, Math.round(cypresses.length * r));
    },
  };
}

function buildAcrossBayHarborVillage(parent, islandSpec) {
  const rng = mulberry32(88421);
  const wallGeos = [];
  const roofGeos = [];
  const stoneGeos = [];
  const shutterGeos = [];
  const glowGeos = [];

  const pushColoredGeo = (targetArr, geo, hex) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const count = g.attributes.position.count;
    const cols = new Float32Array(count * 3);
    const c = new THREE.Color(hex);
    for (let i = 0; i < count; i += 1) {
      cols[i * 3 + 0] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    targetArr.push(g);
  };

  // Seafront stone quay wall & arched boathouse arcade
  const quayCenter = islandLocalToWorld(islandSpec, -28.0, 15.0);
  const quayAng = Math.atan2(-quayCenter.wz, -quayCenter.wx);
  const quayBox = new THREE.BoxGeometry(8.5, 3.2, 38.0);
  quayBox.rotateY(-quayAng);
  quayBox.translate(quayCenter.wx, 0.35, quayCenter.wz);
  pushColoredGeo(stoneGeos, quayBox, 0xaba293);

  for (let a = -3; a <= 3; a += 1) {
    const arch = new THREE.BoxGeometry(0.6, 1.75, 2.4);
    arch.translate(-4.1, 0.85, a * 4.6);
    arch.rotateY(-quayAng);
    arch.translate(quayCenter.wx, 0.0, quayCenter.wz);
    pushColoredGeo(shutterGeos, arch, 0x3b3936);
  }

  // Stepped stone street lanes ("街巷台阶") climbing up from seafront quay to terraced cottages & Campanile
  for (const laneZ of [6.5, 15.0, 23.5]) {
    for (let s = 0; s < 14; s += 1) {
      const lx = -26.5 + s * 1.45;
      const lz = laneZ + Math.sin(s * 0.45) * 0.9;
      const gy = Math.max(1.4, evalIslandLocalHeight(islandSpec, lx, lz));
      const { wx, wz } = islandLocalToWorld(islandSpec, lx, lz);
      const stepSlab = new THREE.BoxGeometry(1.65, 0.95, 2.25);
      stepSlab.rotateY(-quayAng);
      stepSlab.translate(wx, gy - 0.35, wz);
      pushColoredGeo(stoneGeos, stepSlab, 0xbab1a1);
    }
  }

  // Harbourside warm pier lanterns along the distant village quay
  for (let l = -2; l <= 2; l += 1) {
    const { wx, wz } = islandLocalToWorld(islandSpec, -30.2, 15.0 + l * 7.2);
    const bulb = new THREE.SphereGeometry(0.28, 6, 6);
    bulb.translate(wx, 2.85, wz);
    glowGeos.push(bulb);
  }

  // 20 Tiered Mediterranean Pastel & Limestone Houses with Dual-Slope Terracotta Gable Roofs
  const wallPalette = [0xefe4d2, 0xead2b5, 0xe5beb2, 0xe6dfd0, 0xecd9ad, 0xdde3d8];
  for (let i = 0; i < 20; i += 1) {
    const tier = Math.floor(i / 7);
    const slot = (i % 7) - 3.0;
    const lx = -23.5 + tier * 6.4 + (rng() - 0.5) * 1.6;
    const lz = 14.2 + slot * 5.0 + (rng() - 0.5) * 1.2;
    const groundY = Math.max(1.8, evalIslandLocalHeight(islandSpec, lx, lz));
    const { wx, wz } = islandLocalToWorld(islandSpec, lx, lz);

    const w = 4.0 + rng() * 1.9;
    const d = 4.5 + rng() * 2.1;
    const h = 4.4 + rng() * 3.1;
    const houseYaw = -quayAng + (rng() - 0.5) * 0.20;

    const plinth = new THREE.BoxGeometry(w + 0.65, 4.2, d + 0.65);
    plinth.rotateY(houseYaw);
    plinth.translate(wx, groundY - 1.85, wz);
    pushColoredGeo(stoneGeos, plinth, 0x9b9386);

    const body = new THREE.BoxGeometry(w, h, d);
    body.rotateY(houseYaw);
    body.translate(wx, groundY + h * 0.5, wz);
    pushColoredGeo(wallGeos, body, wallPalette[i % wallPalette.length]);

    const ridgeRise = 1.18;
    const slopeLen = Math.hypot(d * 0.56, ridgeRise);
    const roofHex = i % 2 === 0 ? 0xc26544 : 0xb3583a;
    for (const side of [-1, 1]) {
      const slope = new THREE.BoxGeometry(w + 0.65, 0.22, slopeLen);
      slope.rotateX(side * Math.atan2(ridgeRise, d * 0.56));
      slope.translate(0, h + ridgeRise * 0.45, side * d * 0.26);
      slope.rotateY(houseYaw);
      slope.translate(wx, groundY, wz);
      pushColoredGeo(roofGeos, slope, roofHex);
    }

    for (const wyOff of [h * 0.36, h * 0.72]) {
      for (const wzOff of [-d * 0.24, d * 0.24]) {
        const frame = new THREE.BoxGeometry(0.18, 1.05, 0.92);
        frame.translate(-w * 0.505, 0, wzOff);
        frame.rotateY(houseYaw);
        frame.translate(wx, groundY + wyOff, wz);
        pushColoredGeo(shutterGeos, frame, i % 2 === 0 ? 0x4b6154 : 0x465869);

        if ((i + Math.round(wyOff)) % 2 === 0) {
          const pane = new THREE.BoxGeometry(0.22, 0.78, 0.52);
          pane.translate(-w * 0.51, 0, wzOff);
          pane.rotateY(houseYaw);
          pane.translate(wx, groundY + wyOff, wz);
          glowGeos.push(pane);
        }
      }
    }
  }

  // Slender Stone Campanile Bell Tower crowning the Village Ridge
  const bellLocal = { lx: -8.0, lz: 9.0 };
  const bellGroundY = Math.max(8.0, evalIslandLocalHeight(islandSpec, bellLocal.lx, bellLocal.lz));
  const bellWorld = islandLocalToWorld(islandSpec, bellLocal.lx, bellLocal.lz);
  const towerH = 14.8;

  const towerShaft = new THREE.BoxGeometry(3.3, towerH, 3.3);
  towerShaft.translate(bellWorld.wx, bellGroundY + towerH * 0.5 - 1.0, bellWorld.wz);
  pushColoredGeo(wallGeos, towerShaft, 0xede2ce);

  const belfry = new THREE.BoxGeometry(3.65, 2.7, 3.65);
  belfry.translate(bellWorld.wx, bellGroundY + towerH + 0.15, bellWorld.wz);
  pushColoredGeo(stoneGeos, belfry, 0xcac0ae);

  for (const rotB of [0, Math.PI * 0.5]) {
    const archSlot = new THREE.BoxGeometry(3.75, 1.65, 1.15);
    archSlot.rotateY(rotB);
    archSlot.translate(bellWorld.wx, bellGroundY + towerH + 0.1, bellWorld.wz);
    pushColoredGeo(shutterGeos, archSlot, 0x35322e);
  }
  const bellLantern = new THREE.SphereGeometry(0.45, 6, 6);
  bellLantern.translate(bellWorld.wx, bellGroundY + towerH + 0.15, bellWorld.wz);
  glowGeos.push(bellLantern);

  const spire = new THREE.ConeGeometry(2.4, 5.2, 8);
  spire.translate(bellWorld.wx, bellGroundY + towerH + 4.1, bellWorld.wz);
  pushColoredGeo(roofGeos, spire, 0xbf6140);

  const makeMergedMesh = (arr, mat) => {
    if (!arr.length) return;
    const m = new THREE.Mesh(safeMergeHorizon(arr), mat);
    m.frustumCulled = true;
    m.castShadow = false;
    m.receiveShadow = false;
    m.raycast = () => {};
    parent.add(m);
  };

  makeMergedMesh(wallGeos, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }));
  makeMergedMesh(roofGeos, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.76 }));
  makeMergedMesh(stoneGeos, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  makeMergedMesh(shutterGeos, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 }));

  const villageGlowMat = new THREE.MeshStandardMaterial({
    color: 0xffe8be,
    emissive: 0xffae47,
    emissiveIntensity: 0.72,
    roughness: 0.3,
  });
  makeMergedMesh(glowGeos, villageGlowMat);
  return villageGlowMat;
}

// ---------------------------------------------------------------------------
// 4. Outer-Bay Cruising Sailboat Fleet (with Standing Rigging) & Coastal Ferry
// ---------------------------------------------------------------------------

function addStayCable(parent, p1Arr, p2Arr, radius, mat) {
  const p1 = new THREE.Vector3(p1Arr[0], p1Arr[1], p1Arr[2]);
  const p2 = new THREE.Vector3(p2Arr[0], p2Arr[1], p2Arr[2]);
  const dir = p2.clone().sub(p1);
  const len = dir.length();
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 5), mat);
  wire.position.copy(p1).addScaledVector(dir, 0.5);
  wire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(wire);
}

function createDistantSailboatMesh({ hullHex = 0xf7f7f5, stripeHex = 0x234469, sailHex = 0xfffaf0, scale = 1.0 }) {
  const root = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({ color: hullHex, roughness: 0.32, metalness: 0.08 });
  const trimMat = new THREE.MeshStandardMaterial({ color: stripeHex, roughness: 0.42 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x9e6c43, roughness: 0.52 });
  const mastMat = new THREE.MeshStandardMaterial({ color: 0xe6eaee, roughness: 0.28, metalness: 0.75 });
  const riggingMat = new THREE.MeshStandardMaterial({ color: 0xd0d7de, roughness: 0.25, metalness: 0.88 });
  const sailMat = new THREE.MeshStandardMaterial({
    color: sailHex,
    roughness: 0.68,
    side: THREE.DoubleSide,
  });

  const hullGeo = new THREE.CylinderGeometry(1.15, 0.72, 8.8, 12);
  hullGeo.rotateX(Math.PI / 2);
  hullGeo.scale(1.0, 0.58, 1.0);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.y = 0.48;

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.22, 8.2), trimMat);
  stripe.position.y = 0.66;

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.62, 2.8), hullMat);
  cabin.position.set(0, 1.02, 0.2);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.12, 7.6), woodMat);
  deck.position.y = 0.82;

  const mastH = 11.4;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.10, mastH, 8), mastMat);
  mast.position.set(0, 0.85 + mastH * 0.5, 0.65);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.4, 6), mastMat);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 2.05, -1.55);
  const spreader = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.75, 6), mastMat);
  spreader.rotation.z = Math.PI / 2;
  spreader.position.set(0, 6.8, 0.65);

  const boatRig = new THREE.Group();
  boatRig.add(hull, stripe, deck, cabin, mast, boom, spreader);

  // Standing rigging stays & shrouds ("帆船包含船体、桅杆、索具与具有弧度的帆面")
  const mastTop = [0, 12.15, 0.65];
  addStayCable(boatRig, mastTop, [0, 0.92, 4.45], 0.016, riggingMat); // Forestay to bow
  addStayCable(boatRig, mastTop, [0, 0.92, -4.35], 0.016, riggingMat); // Backstay to stern
  addStayCable(boatRig, mastTop, [-0.88, 6.8, 0.65], 0.014, riggingMat); // Port upper shroud
  addStayCable(boatRig, [-0.88, 6.8, 0.65], [-0.96, 0.88, 0.55], 0.014, riggingMat); // Port lower shroud
  addStayCable(boatRig, mastTop, [0.88, 6.8, 0.65], 0.014, riggingMat); // Starboard upper shroud
  addStayCable(boatRig, [0.88, 6.8, 0.65], [0.96, 0.88, 0.55], 0.014, riggingMat); // Starboard lower shroud

  // Cambered mainsail & headsail jib (curved 3x4 grid surface with genuine aerodynamic belly!)
  const makeCurvedSailMesh = (zFootA, zFootB, yBot, yTop, camber) => {
    const uSegs = 5;
    const vSegs = 6;
    const positions = [];
    const indices = [];
    for (let iv = 0; iv <= vSegs; iv += 1) {
      const v = iv / vSegs; // 0 bottom -> 1 top masthead
      const y = lerp(yBot, yTop, v);
      const zSpan = 1.0 - v;
      for (let iu = 0; iu <= uSegs; iu += 1) {
        const u = iu / uSegs; // 0 luff -> 1 leech
        const z = lerp(zFootA, zFootA + (zFootB - zFootA) * zSpan, u);
        const belly = camber * Math.sin(u * Math.PI) * Math.sin((1.0 - v * 0.72) * Math.PI * 0.85);
        positions.push(belly, y, z);
      }
    }
    const stride = uSegs + 1;
    for (let iv = 0; iv < vSegs; iv += 1) {
      for (let iu = 0; iu < uSegs; iu += 1) {
        const a = iv * stride + iu;
        const b = a + 1;
        const c = (iv + 1) * stride + iu;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return new THREE.Mesh(g, sailMat);
  };

  const mainSail = makeCurvedSailMesh(0.55, -3.75, 2.12, 11.85, 0.56);
  const jibSail = makeCurvedSailMesh(0.75, 4.38, 1.48, 10.35, 0.46);
  boatRig.add(mainSail, jibSail);

  // V-shaped foamy stern wake ribbon trailing behind (-Z)
  const wakeGeo = new THREE.BufferGeometry();
  wakeGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0.0, 0.06, 3.2,
        -1.3, 0.05, -4.4,
        1.3, 0.05, -4.4,
        -3.4, 0.04, -18.5,
        3.4, 0.04, -18.5,
      ],
      3
    )
  );
  wakeGeo.setIndex([0, 1, 2, 1, 3, 4, 1, 4, 2]);
  wakeGeo.computeVertexNormals();
  const wakeMat = new THREE.MeshBasicMaterial({
    color: 0xf4fafe,
    transparent: true,
    opacity: 0.40,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const wake = new THREE.Mesh(wakeGeo, wakeMat);

  root.add(boatRig, wake);
  root.scale.setScalar(scale);
  root.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = false;
      c.receiveShadow = false;
      c.raycast = () => {};
    }
  });

  return { root, boatRig, wake, wakeMat };
}

function createCoastalSteamerMesh() {
  const root = new THREE.Group();
  const navyMat = new THREE.MeshStandardMaterial({ color: 0x1e3550, roughness: 0.38 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf7f8fa, roughness: 0.32 });
  const teakMat = new THREE.MeshStandardMaterial({ color: 0xa67449, roughness: 0.52 });
  const funnelRed = new THREE.MeshStandardMaterial({ color: 0xc94a38, roughness: 0.42 });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xfff3d4,
    emissive: 0xffb85c,
    emissiveIntensity: 0.95,
    roughness: 0.2,
  });

  const hull = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.0, 22.0, 14), navyMat);
  hull.rotation.x = Math.PI / 2;
  hull.scale.set(1.0, 0.62, 1.0);
  hull.position.y = 0.9;

  const deck1 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.8, 15.6), whiteMat);
  deck1.position.set(0, 2.35, -0.4);
  const winStrip = new THREE.Mesh(new THREE.BoxGeometry(4.52, 0.55, 13.8), glowMat);
  winStrip.position.set(0, 2.45, -0.4);

  const deck2 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.45, 10.4), whiteMat);
  deck2.position.set(0, 3.85, 0.4);
  const winStrip2 = new THREE.Mesh(new THREE.BoxGeometry(3.72, 0.42, 8.8), glowMat);
  winStrip2.position.set(0, 3.92, 0.4);

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(3.9, 1.1, 3.2), whiteMat);
  bridge.position.set(0, 5.0, 3.4);
  const bridgeGlow = new THREE.Mesh(new THREE.BoxGeometry(3.98, 0.38, 2.6), glowMat);
  bridgeGlow.position.set(0, 5.08, 3.5);
  const sunDeck = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.14, 10.8), teakMat);
  sunDeck.position.set(0, 4.62, 0.4);

  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.78, 2.8, 12), funnelRed);
  funnel.position.set(0, 5.8, -1.2);
  funnel.rotation.x = -0.14;

  const wakeGeo = new THREE.PlaneGeometry(7.2, 28.0);
  wakeGeo.rotateX(-Math.PI / 2);
  wakeGeo.translate(0, 0.06, -22.0);
  const wakeMat = new THREE.MeshBasicMaterial({
    color: 0xf2f9fd,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
  });
  const wake = new THREE.Mesh(wakeGeo, wakeMat);

  const boatRig = new THREE.Group();
  boatRig.add(hull, deck1, winStrip, deck2, winStrip2, bridge, bridgeGlow, sunDeck, funnel);
  root.add(boatRig, wake);
  root.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = false;
      c.receiveShadow = false;
      c.raycast = () => {};
    }
  });
  return { root, boatRig, wake, wakeMat, glowMat };
}

function buildOuterBayFleet(parent) {
  const vessels = [];

  const sailboatRoutes = [
    { cx: 182, cz: -12, rx: 42, rz: 58, speed: 0.048, phase: 0.2, dir: 1, scale: 1.05, sailHex: 0xfffaf0, stripeHex: 0x234469 },
    { cx: 265, cz: 46, rx: 48, rz: 62, speed: 0.036, phase: 1.9, dir: -1, scale: 1.18, sailHex: 0xfdf4e3, stripeHex: 0x8e3b2e },
    { cx: 98, cz: -102, rx: 28, rz: 32, speed: 0.052, phase: 0.8, dir: 1, scale: 0.92, sailHex: 0xffffff, stripeHex: 0x2c6478 },
    { cx: -128, cz: -96, rx: 32, rz: 28, speed: 0.044, phase: 2.6, dir: -1, scale: 0.96, sailHex: 0xfff8ec, stripeHex: 0x3b5c47 },
    { cx: 92, cz: 132, rx: 44, rz: 36, speed: 0.041, phase: 3.7, dir: 1, scale: 1.02, sailHex: 0xffffff, stripeHex: 0x234469 },
    { cx: -96, cz: 138, rx: 46, rz: 34, speed: 0.039, phase: 5.1, dir: -1, scale: 1.08, sailHex: 0xfcf3e4, stripeHex: 0x9c4a35 },
    { cx: 365, cz: -8, rx: 52, rz: 74, speed: 0.029, phase: 4.2, dir: 1, scale: 1.32, sailHex: 0xfffaf2, stripeHex: 0x2b4d70 },
  ];

  for (const r of sailboatRoutes) {
    const sb = createDistantSailboatMesh(r);
    parent.add(sb.root);
    const meanSpeed = 0.5 * (r.rx + r.rz) * r.speed;
    vessels.push({ ...r, ...sb, meanSpeed, heelBase: 0.11 * r.dir });
  }

  const steamer = createCoastalSteamerMesh();
  parent.add(steamer.root);
  vessels.push({
    cx: 385,
    cz: 18,
    rx: 38,
    rz: 125,
    speed: 0.021,
    meanSpeed: 0.5 * (38 + 125) * 0.021,
    phase: 1.35,
    dir: 1,
    heelBase: 0.0,
    ...steamer,
  });

  return { vessels, steamerGlowMat: steamer.glowMat };
}

// ---------------------------------------------------------------------------
// Public Entry Point
// ---------------------------------------------------------------------------

export function buildDistantHorizon() {
  const group = new THREE.Group();
  group.name = "DistantCoastalHorizon";

  const rockNormalMap = createMountainRockNormalMap();
  const mountainCtrl = buildTectonicMountainAmphitheater(group);
  const mistUniforms = buildValleyMistRibbons(group);
  const { surfUniforms, forestCtrl, villageGlowMat } = buildArchipelagoAndAcrossBayTown(
    group,
    rockNormalMap
  );
  const { vessels, steamerGlowMat } = buildOuterBayFleet(group);

  let nightMix = 0;

  function setNightMix(mix) {
    nightMix = clamp(mix, 0, 1);
    mistUniforms.uNightMix.value = nightMix;
    mountainCtrl.setNightMix(nightMix);
    surfUniforms.uNightMix.value = nightMix;
    if (villageGlowMat) {
      villageGlowMat.emissiveIntensity = lerp(0.72, 3.25, nightMix);
    }
    if (steamerGlowMat) {
      steamerGlowMat.emissiveIntensity = lerp(0.95, 3.4, nightMix);
    }
  }

  function setQualityTier(tier) {
    const ratio = tier === "low" ? 0.45 : tier === "medium" ? 0.75 : 1.0;
    forestCtrl.setQualityRatio(ratio);
    mountainCtrl.setQualityRatio(ratio);
  }

  function update(elapsed) {
    mistUniforms.uTime.value = elapsed;
    surfUniforms.uTime.value = elapsed;
    mountainCtrl.update(elapsed);

    for (let i = 0; i < vessels.length; i += 1) {
      const v = vessels[i];
      const a = v.phase + elapsed * v.speed * v.dir;
      const wx = v.cx + Math.cos(a) * v.rx;
      const wz = v.cz + Math.sin(a) * v.rz;
      const tx = -Math.sin(a) * v.rx * v.dir;
      const tz = Math.cos(a) * v.rz * v.dir;

      // Instantaneous orbital speed modulates V-wake length & opacity ("随速度变化的尾迹")
      const instSpeed = Math.hypot(tx * v.speed, tz * v.speed);
      const speedRatio = clamp(instSpeed / Math.max(0.2, v.meanSpeed), 0.65, 1.45);

      v.root.position.set(wx, Math.sin(elapsed * 1.15 + v.phase) * 0.08, wz);
      v.root.rotation.y = Math.atan2(tx, tz);
      v.boatRig.rotation.z = v.heelBase * speedRatio + Math.sin(elapsed * 0.9 + v.phase) * 0.035;
      v.boatRig.rotation.x = Math.cos(elapsed * 0.78 + v.phase) * 0.022;
      if (v.wake) {
        v.wake.scale.z = 0.72 + speedRatio * 0.36;
        v.wakeMat.opacity = clamp((0.22 + speedRatio * 0.18) * lerp(1.0, 0.58, nightMix), 0.12, 0.52);
      }
    }
  }

  function reset() {
    setNightMix(0);
    update(0);
  }

  update(0);

  return {
    group,
    update,
    reset,
    setNightMix,
    setQualityTier,
  };
}
