import * as THREE from 'three';

const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, Number(v) || 0));

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function createRng(seed = 20261111) {
  let state = seed >>> 0;
  return function rand() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rolling Saint-Rémy hillside meadow heightfield.
 * Rises gently on the flanks and toward the distant foothills while cradling
 * a rich botanical hollow in the foreground.
 */
export function meadowHeight(x, z) {
  const slope = -0.095 * (z - 2.0);
  const swell = Math.sin(x * 0.28 + 0.45) * Math.cos(z * 0.25 - 0.15) * 0.30;
  const micro = Math.cos(x * 0.62 - z * 0.48) * 0.09;
  const flankLift = Math.pow(Math.abs(x) * 0.085, 1.8) * 0.22;
  return slope + swell + micro + flankLift - 0.92;
}

/**
 * Append a parametric surface patch into shared geometry arrays.
 * Attribute `color` stores RGB shade/albedo multipliers; `uv` stores (u, (v+1)/2).
 */
function addParametricPatch(buffers, segU, segV, evalFn) {
  const { positions, normals, colors, uvs, indices } = buffers;
  const baseVertex = positions.length / 3;
  const eps = 0.022;

  for (let iu = 0; iu <= segU; iu++) {
    const u = iu / segU;
    for (let iv = 0; iv <= segV; iv++) {
      const v = (iv / segV) * 2 - 1;
      const pt = evalFn(u, v);
      const pu0 = evalFn(Math.max(0, u - eps), v);
      const pu1 = evalFn(Math.min(1, u + eps), v);
      const pv0 = evalFn(u, Math.max(-1, v - eps));
      const pv1 = evalFn(u, Math.min(1, v + eps));

      const tx = pu1.x - pu0.x;
      const ty = pu1.y - pu0.y;
      const tz = pu1.z - pu0.z;
      const bx = pv1.x - pv0.x;
      const by = pv1.y - pv0.y;
      const bz = pv1.z - pv0.z;

      let nx = ty * bz - tz * by;
      let ny = tz * bx - tx * bz;
      let nz = tx * by - ty * bx;
      let len = Math.hypot(nx, ny, nz);
      if (len < 1e-6) {
        nx = 0;
        ny = 1;
        nz = 0;
        len = 1;
      }

      positions.push(pt.x, pt.y, pt.z);
      normals.push(nx / len, ny / len, nz / len);
      colors.push(pt.r, pt.g, pt.b);
      uvs.push(u, (v + 1) * 0.5);
    }
  }

  const row = segV + 1;
  for (let iu = 0; iu < segU; iu++) {
    for (let iv = 0; iv < segV; iv++) {
      const a = baseVertex + iu * row + iv;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
}

function makeBuffers() {
  return { positions: [], normals: [], colors: [], uvs: [], indices: [] };
}

function finalizeGeometry(buffers) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geo.setIndex(buffers.indices);
  return geo;
}

// ============================================================================
// SPECIES 1: BLUE ENDLESS SUMMER HYDRANGEA FLORET (精致四瓣微卷绣球小花 + 珍珠花蕊)
// ============================================================================
function createHydrangeaFloretGeometry() {
  const buffers = makeBuffers();
  const petalAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];

  for (let p = 0; p < 4; p++) {
    const a = petalAngles[p] + (p % 2 === 0 ? 0.06 : -0.06);
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const yLayer = (p % 2) * 0.004;

    addParametricPatch(buffers, 6, 6, (u, v) => {
      // Rounded spade/butterfly sepal silhouette with gentle marginal undulation
      const widthEnv = Math.pow(Math.sin(u * Math.PI), 0.58) * (0.92 + 0.14 * Math.sin(u * Math.PI * 2.2));
      const ruffle = Math.sin(v * Math.PI * 2.5) * 0.0035 * smoothstep(0.35, 0.95, u);
      const len = 0.008 + u * 0.086 * (1 - 0.10 * v * v * smoothstep(0.65, 1.0, u));
      const wid = v * 0.072 * widthEnv;
      const cup = yLayer + 0.018 * Math.sin(u * Math.PI * 0.82) - 0.012 * v * v * u + ruffle;

      const x = cosA * len - sinA * wid;
      const z = sinA * len + cosA * wid;

      // Deep velvety center throat -> luminous petal margin + tiny vein accent
      const vein = Math.exp(-v * v * 28.0) * 0.08 * (1 - u);
      const shade = 0.24 + 0.74 * smoothstep(0.08, 0.92, u) - 0.08 * Math.abs(v);
      return {
        x,
        y: cup,
        z,
        r: shade + vein * 0.5,
        g: shade + vein * 0.7,
        b: Math.min(1.15, shade * 1.08 + vein)
      };
    });
  }

  // Tiny luminous pearl stamen bud in the center of the 4 sepals
  addParametricPatch(buffers, 3, 6, (u, v) => {
    const theta = (v + 1) * Math.PI;
    const r = Math.sin(u * Math.PI) * 0.013;
    return {
      x: Math.cos(theta) * r,
      y: 0.008 + Math.cos(u * Math.PI) * -0.009 + 0.009,
      z: Math.sin(theta) * r,
      r: 1.15,
      g: 1.18,
      b: 1.28
    };
  });

  return finalizeGeometry(buffers);
}

// ============================================================================
// SPECIES 2: VAN GOGH STARRY SUNFLOWER (梵高向日葵 — 纹理花盘 + 34片错落扭转金瓣 + 绿色花萼)
// ============================================================================
function createSunflowerGeometry() {
  const buffers = makeBuffers();

  // 1. Rich Burnt-Umber & Golden-Pollen Convex Seed Disc
  addParametricPatch(buffers, 9, 18, (u, v) => {
    const theta = (v + 1) * Math.PI;
    const r = 0.006 + u * 0.118;
    const domeY = 0.044 * (1 - u * u * 0.72) + 0.003 * Math.sin(u * 28.0) * Math.cos(theta * 9.0);
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;

    const pollenRing = smoothstep(0.68, 0.96, u) * (1 - 0.35 * smoothstep(0.95, 1.0, u));
    const spiralTex = 0.5 + 0.5 * Math.sin(u * 30.0 + theta * 8.0);
    const cR = 0.045 + 0.48 * pollenRing + 0.04 * spiralTex;
    const cG = 0.018 + 0.26 * pollenRing + 0.02 * spiralTex;
    const cB = 0.004 + 0.02 * pollenRing;
    return { x, y: domeY, z, r: cR, g: cG, b: cB };
  });

  // 2. 34 Expressive Van Gogh Ray Florets (two organic rings with painterly twist)
  const totalRays = 34;
  for (let i = 0; i < totalRays; i++) {
    const layer = i % 2;
    const a = (i / totalRays) * Math.PI * 2 + layer * 0.035;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const twist = Math.sin(i * 2.3) * 0.14;
    const lenScale = 0.90 + 0.18 * Math.sin(i * 3.7 + 0.5);

    addParametricPatch(buffers, 8, 4, (u, v) => {
      const profile = Math.pow(Math.sin(u * Math.PI), 0.78) * (1 - 0.18 * u * u);
      const len = 0.106 + u * 0.195 * lenScale;
      const wid = v * (layer === 0 ? 0.036 : 0.031) * profile;
      const wave = Math.sin(u * 5.2 + i) * 0.009 * u;
      const y = layer * 0.009
        + 0.032 * Math.sin(u * Math.PI * 0.78)
        - 0.028 * Math.pow(u, 2.0)
        + wid * twist
        + wave
        - 0.006 * v * v;

      const x = cosA * len - sinA * wid;
      const z = sinA * len + cosA * wid;

      // Rich Van Gogh cadmium-amber base -> radiant chrome-gold -> warm sunlit tip
      const baseWarm = smoothstep(0.0, 0.48, u);
      const tipGlow = smoothstep(0.55, 1.0, u);
      const cR = 0.84 + 0.18 * baseWarm;
      const cG = 0.28 + 0.36 * baseWarm + 0.14 * tipGlow - 0.05 * Math.abs(v);
      const cB = 0.01 + 0.03 * baseWarm + 0.08 * tipGlow;
      return { x, y, z, r: cR, g: cG, b: cB };
    });
  }

  // 3. Green Star-Shaped Involucral Bracts (Calyx behind flower head)
  const bracts = 12;
  for (let i = 0; i < bracts; i++) {
    const a = (i / bracts) * Math.PI * 2;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    addParametricPatch(buffers, 4, 3, (u, v) => {
      const len = 0.03 + u * 0.125;
      const wid = v * 0.026 * (1 - u * 0.85);
      const y = -0.012 - 0.018 * Math.sin(u * Math.PI * 0.7);
      return {
        x: cosA * len - sinA * wid,
        y,
        z: sinA * len + cosA * wid,
        r: 0.06,
        g: 0.24 + 0.12 * u,
        b: 0.14 + 0.08 * u
      };
    });
  }

  const geo = finalizeGeometry(buffers);
  geo.rotateX(0.62);
  return geo;
}

// ============================================================================
// SPECIES 3: VAN GOGH SAINT-RÉMY IRIS (梵高紫蓝鸢尾 — 拱立旗瓣 + 垂落金须垂瓣)
// ============================================================================
function createIrisGeometry() {
  const buffers = makeBuffers();

  // 3 Domed Upright Standards (curving gracefully inward at the crown)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);

    addParametricPatch(buffers, 8, 6, (u, v) => {
      const widthEnv = Math.pow(Math.sin(u * Math.PI), 0.68) * (0.82 + 0.28 * u);
      const radial = 0.022 + Math.sin(u * Math.PI * 0.86) * 0.125 * (1 - 0.36 * u * u);
      const wid = v * 0.086 * widthEnv;
      const ruffle = Math.sin(u * 14.0 + v * 5.0) * 0.007 * smoothstep(0.25, 1.0, u);
      const height = 0.025 + u * 0.245 - 0.022 * v * v;

      return {
        x: cosA * radial - sinA * wid,
        y: height + ruffle,
        z: sinA * radial + cosA * wid,
        r: 0.42 + 0.30 * u,
        g: 0.46 + 0.32 * u,
        b: 0.94 + 0.10 * u
      };
    });
  }

  // 3 Cascading Falls with Luminous Chrome-Gold Beards
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);

    addParametricPatch(buffers, 9, 6, (u, v) => {
      const widthEnv = Math.pow(Math.sin(u * Math.PI), 0.65) * (0.68 + 0.52 * smoothstep(0.2, 0.85, u));
      const radial = 0.028 + u * 0.225;
      const wid = v * 0.104 * widthEnv;
      const ruffle = Math.sin(v * 6.0 + u * 10.0) * 0.006 * u;
      const droop = 0.038 + 0.058 * Math.sin(u * Math.PI * 0.58) - 0.165 * Math.pow(u, 1.85) - 0.016 * v * v + ruffle;

      // Golden-ivory nectar beard down the throat
      const beard = Math.exp(-v * v * 16.0) * smoothstep(0.58, 0.10, u);
      const bR = 0.24 + 0.20 * (1 - u);
      const bG = 0.22 + 0.22 * (1 - u);
      const bB = 0.82 + 0.16 * (1 - u);

      return {
        x: cosA * radial - sinA * wid,
        y: droop,
        z: sinA * radial + cosA * wid,
        r: bR * (1 - beard) + 1.08 * beard,
        g: bG * (1 - beard) + 0.90 * beard,
        b: bB * (1 - beard) + 0.28 * beard
      };
    });
  }

  return finalizeGeometry(buffers);
}

// ============================================================================
// SPECIES 4: VELVET ENGLISH GARDEN ROSE (丝绒杯状螺旋庭园玫瑰 — 28片深杯卷芯花瓣 + 花萼)
// ============================================================================
function createRoseGeometry() {
  const buffers = makeBuffers();
  const petalCount = 28;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < petalCount; i++) {
    const t = i / (petalCount - 1);
    const theta = i * goldenAngle;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    addParametricPatch(buffers, 7, 6, (u, v) => {
      // Tightly scrolled bud core (t < 0.3) opening into lush cupped outer guard petals
      const openAngle = 0.10 + Math.pow(t, 1.18) * 0.92;
      const baseR = 0.010 + Math.pow(t, 1.1) * 0.088;
      const petalH = 0.125 + t * 0.075;
      const widthEnv = Math.pow(Math.sin(u * Math.PI), 0.62) * (0.048 + t * 0.088);

      const curlBack = smoothstep(0.66, 1.0, u) * (0.014 + t * 0.046) * (1 - 0.30 * v * v);
      const cupHollow = 0.020 * (1 - v * v) * Math.sin(u * Math.PI);
      const rLocal = baseR + u * petalH * Math.sin(openAngle) + curlBack - cupHollow;
      const yLocal = u * petalH * Math.cos(openAngle) - t * 0.032 - curlBack * 0.42;
      const wLocal = v * widthEnv;

      // Rich deep-velvet inner core & petal base AO -> luminous moonlit outer petal edges
      const innerHeart = Math.pow(t, 0.95);
      const rimLift = smoothstep(0.18, 0.98, u);
      const shade = 0.14 + 0.48 * innerHeart + 0.38 * rimLift - 0.08 * (1 - Math.abs(v)) * (1 - u);
      return {
        x: cosT * rLocal - sinT * wLocal,
        y: yLocal + 0.035,
        z: sinT * rLocal + cosT * wLocal,
        r: Math.min(1.10, shade * 1.08),
        g: shade * (0.58 + 0.32 * innerHeart + 0.10 * rimLift),
        b: shade * (0.64 + 0.28 * innerHeart + 0.08 * rimLift)
      };
    });
  }

  // 5 Green Rose Calyx Sepals cupping the base
  for (let s = 0; s < 5; s++) {
    const a = (s / 5) * Math.PI * 2;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    addParametricPatch(buffers, 4, 3, (u, v) => {
      const len = 0.02 + u * 0.095;
      const wid = v * 0.022 * (1 - u * 0.85);
      const y = 0.02 - u * 0.035;
      return {
        x: cosA * len - sinA * wid,
        y,
        z: sinA * len + cosA * wid,
        r: 0.02,
        g: 0.09 + 0.06 * u,
        b: 0.06
      };
    });
  }

  const geo = finalizeGeometry(buffers);
  geo.rotateX(0.38);
  return geo;
}

// ============================================================================
// SPECIES 5: MOONLIT LILY-GOBLET TULIP (修长微展百合型郁金香 — 告别圆球感)
// ============================================================================
function createTulipGeometry() {
  const buffers = makeBuffers();

  for (let i = 0; i < 6; i++) {
    const inner = i % 2 === 0;
    const a = (i / 6) * Math.PI * 2;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);

    addParametricPatch(buffers, 8, 5, (u, v) => {
      // Slender waist, full mid-cup, gracefully pointed tip that flares slightly outward
      const pointedTip = Math.pow(Math.sin(u * Math.PI), 0.72) * (1 - 0.28 * smoothstep(0.72, 1.0, u));
      const widthEnv = pointedTip * (inner ? 0.056 : 0.064);
      const flare = smoothstep(0.74, 1.0, u) * 0.026;
      const cupRadius = (inner ? 0.015 : 0.021) + Math.sin(u * Math.PI * 0.76) * 0.066 + flare - 0.010 * v * v;
      const y = u * 0.255 - 0.008 * v * v;
      const w = v * widthEnv;

      // Deep velvety base -> glowing pearl tip
      const glow = 0.48 + 0.56 * smoothstep(0.08, 0.92, u);
      return {
        x: cosA * cupRadius - sinA * w,
        y,
        z: sinA * cupRadius + cosA * w,
        r: glow * 1.02,
        g: glow * 0.96,
        b: Math.min(1.12, glow * 1.04)
      };
    });
  }

  const geo = finalizeGeometry(buffers);
  geo.rotateX(0.18);
  return geo;
}

// ============================================================================
// SPECIES 6: GYPSOPHILA "满天星" DOUBLE STARLET BLOSSOM (星云重瓣小花)
// ============================================================================
function createGypsophilaGeometry() {
  const buffers = makeBuffers();
  const layers = [
    { petals: 5, len: 0.036, wid: 0.019, y: 0.008, rot: 0 },
    { petals: 5, len: 0.025, wid: 0.014, y: 0.016, rot: 0.62 }
  ];

  for (const layer of layers) {
    for (let p = 0; p < layer.petals; p++) {
      const a = (p / layer.petals) * Math.PI * 2 + layer.rot;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);

      addParametricPatch(buffers, 3, 2, (u, v) => {
        const w = v * layer.wid * Math.sin(u * Math.PI);
        const l = 0.004 + u * layer.len;
        return {
          x: cosA * l - sinA * w,
          y: layer.y * u + 0.004 * Math.sin(u * Math.PI),
          z: sinA * l + cosA * w,
          r: 0.85 + 0.22 * u,
          g: 0.88 + 0.20 * u,
          b: 0.95 + 0.18 * u
        };
      });
    }
  }
  const geo = finalizeGeometry(buffers);
  geo.rotateX(0.30);
  return geo;
}

// ============================================================================
// BOTANICAL STEMS, BROAD SERRATED LEAVES & LUSH MEADOW GRASS BLADES
// ============================================================================
function createCurvedStemGeometry() {
  const buffers = makeBuffers();
  // Unit height (0..1) 5-sided tapered organic stem so scaling Y matches exact flower height!
  addParametricPatch(buffers, 5, 5, (u, v) => {
    const theta = (v + 1) * Math.PI;
    const rad = (0.018 - 0.008 * u);
    const bendX = Math.sin(u * Math.PI * 0.65) * 0.018;
    return {
      x: Math.cos(theta) * rad + bendX,
      y: u,
      z: Math.sin(theta) * rad,
      r: 0.012 + 0.022 * u,
      g: 0.055 + 0.085 * u,
      b: 0.048 + 0.065 * u
    };
  });
  return finalizeGeometry(buffers);
}

function createHydrangeaLeafGeometry() {
  const buffers = makeBuffers();
  addParametricPatch(buffers, 6, 4, (u, v) => {
    const serration = 1 + 0.06 * Math.sin(u * Math.PI * 9.0) * smoothstep(0.15, 0.85, u);
    const profile = Math.pow(Math.sin(u * Math.PI), 0.72) * serration;
    const x = v * 0.115 * profile;
    const z = -u * 0.36;
    const y = 0.055 * Math.sin(u * Math.PI * 0.72) - u * u * 0.08 - Math.abs(v) * 0.022;
    const midrib = Math.exp(-v * v * 20.0) * 0.03;
    return {
      x,
      y,
      z,
      r: 0.010 + 0.020 * u + midrib * 0.4,
      g: 0.048 + 0.076 * u + midrib,
      b: 0.052 + 0.068 * u + midrib * 0.7
    };
  });
  return finalizeGeometry(buffers);
}

function createGrassBladeGeometry() {
  const buffers = makeBuffers();
  addParametricPatch(buffers, 5, 2, (u, v) => {
    const taper = 1 - Math.pow(u, 1.28);
    const x = v * 0.024 * taper;
    const y = u * 0.58;
    const z = -u * u * 0.18;
    // Deep nocturnal Prussian-emerald root AO -> moonlit viridian-teal tip in linear RGB!
    const ao = 0.16 + 0.84 * Math.pow(u, 1.08);
    return {
      x,
      y,
      z,
      r: (0.008 + 0.026 * u) * ao,
      g: (0.036 + 0.105 * u) * ao,
      b: (0.052 + 0.118 * u) * ao
    };
  });
  return finalizeGeometry(buffers);
}

function createIrisSwordLeafGeometry() {
  const buffers = makeBuffers();
  addParametricPatch(buffers, 6, 2, (u, v) => {
    const taper = Math.sin(Math.min(1, u * 0.88 + 0.12) * Math.PI * 0.92) * (1 - 0.55 * Math.pow(u, 2.2));
    const x = v * 0.034 * taper;
    const y = u * 0.74;
    const z = -Math.pow(u, 1.7) * 0.16;
    const ao = 0.22 + 0.78 * u;
    return {
      x,
      y,
      z,
      r: (0.014 + 0.026 * u) * ao,
      g: (0.062 + 0.098 * u) * ao,
      b: (0.078 + 0.112 * u) * ao
    };
  });
  return finalizeGeometry(buffers);
}

// ============================================================================
// PAINTERLY IMPASTO & WIND GLSL SHADERS (Maxime Heckel / Ghibli-Van Gogh Hybrid)
// ============================================================================
const WIND_AND_RIPPLE_VERTEX_GLSL = /* glsl */ `
  uniform float uTime;
  uniform vec3 uPointerWorld;
  uniform float uPointerActive;
  uniform vec4 uRipples[5];

  float computeRippleBoost(vec3 worldPos) {
    float boost = 0.0;
    for (int i = 0; i < 5; i++) {
      float r = uRipples[i].w;
      if (r > 0.0) {
        float dist = length(worldPos.xz - uRipples[i].xz);
        float ring = exp(-pow((dist - r) * 1.85, 2.0));
        float fade = clamp(1.0 - r / 11.5, 0.0, 1.0);
        boost += ring * fade;
      }
    }
    return clamp(boost, 0.0, 1.3);
  }

  vec3 applyMeadowWind(vec3 worldPos, float swayFactor) {
    float gust = sin(uTime * 1.18 + worldPos.x * 0.62 + worldPos.z * 0.48);
    float eddy = cos(uTime * 1.72 - worldPos.x * 0.38 + worldPos.z * 0.76);
    vec3 offset = vec3(
      gust * 0.068 + eddy * 0.028,
      -abs(gust) * 0.014,
      eddy * 0.048
    ) * swayFactor;

    if (uPointerActive > 0.01) {
      vec2 toPlant = worldPos.xz - uPointerWorld.xz;
      float dist = length(toPlant);
      float influence = exp(-dist * dist * 0.68) * uPointerActive * swayFactor;
      vec2 dir = dist > 0.001 ? normalize(toPlant) : vec2(0.0, 1.0);
      offset.xz += dir * influence * 0.38;
      offset.y -= influence * 0.10;
    }
    return offset;
  }
`;

function createPainterlyFlowerMaterial(
  sharedUniforms,
  {
    swayWeight = 0.85,
    rootAnchored = false,
    rimStrength = 0.36,
    emissiveBoost = 0.06,
    sssStrength = 0.22
  } = {}
) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: sharedUniforms.uTime,
      uPointerWorld: sharedUniforms.uPointerWorld,
      uPointerActive: sharedUniforms.uPointerActive,
      uRipples: sharedUniforms.uRipples,
      uFinaleProgress: sharedUniforms.uFinaleProgress,
      uSwayWeight: { value: swayWeight },
      uRootAnchored: { value: rootAnchored ? 1.0 : 0.0 },
      uRimStrength: { value: rimStrength },
      uEmissiveBoost: { value: emissiveBoost },
      uSssStrength: { value: sssStrength }
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      uniform float uSwayWeight;
      uniform float uRootAnchored;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      varying float vRipple;

      ${WIND_AND_RIPPLE_VERTEX_GLSL}

      void main() {
        vUv = uv;
        #ifdef USE_INSTANCING_COLOR
          vColor = color * instanceColor;
        #else
          vColor = color;
        #endif

        vec4 localPos = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          vec4 world = modelMatrix * instanceMatrix * localPos;
          vec3 nMat = mat3(modelMatrix) * mat3(instanceMatrix) * normal;
        #else
          vec4 world = modelMatrix * localPos;
          vec3 nMat = mat3(modelMatrix) * normal;
        #endif

        // Root-anchored meshes (grass, stems, sword leaves) stay planted at u=0 while tips sway
        float anchorWeight = mix(1.0, pow(clamp(uv.x, 0.0, 1.0), 1.65), uRootAnchored);
        world.xyz += applyMeadowWind(world.xyz, uSwayWeight * anchorWeight);

        vWorldPos = world.xyz;
        vNormal = length(nMat) > 0.0001 ? normalize(nMat) : vec3(0.0, 1.0, 0.0);
        vViewDir = normalize(cameraPosition - world.xyz);
        vRipple = computeRippleBoost(world.xyz);

        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uFinaleProgress;
      uniform float uRimStrength;
      uniform float uEmissiveBoost;
      uniform float uSssStrength;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      varying float vRipple;

      void main() {
        vec3 N = length(vNormal) > 0.0001 ? normalize(vNormal) : vec3(0.0, 1.0, 0.0);
        vec3 V = normalize(vViewDir);
        if (dot(N, V) < 0.0) N = -N;

        // Upper-right Van Gogh Crescent Moon key light + cool cobalt sky hemisphere fill
        vec3 moonDir = normalize(vec3(0.46, 0.81, 0.36));
        vec3 skyFillDir = normalize(vec3(-0.48, 0.55, 0.68));

        float nDotL = max(0.0, dot(N, moonDir));
        // Soft painterly 4-band ramp blended with smooth shading for oil-gouache richness
        float bandedL = floor(nDotL * 4.0 + 0.35) / 4.0;
        float keyLight = mix(nDotL, bandedL, 0.30);

        float skyHemi = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
        float fillLight = max(0.0, dot(N, skyFillDir)) * 0.24;

        // Subtle directional oil-brushstroke micro-texture along petal UVs
        float bristle = sin(vUv.x * 26.0 + vWorldPos.x * 3.0) * cos(vUv.y * 22.0 + vWorldPos.z * 3.0) * 0.045;

        // Subsurface translucency when backlit by moonlight
        float sss = pow(clamp(dot(-V, moonDir) * 0.5 + 0.5, 0.0, 1.0), 2.4) * uSssStrength;
        float fresnel = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.7);

        vec3 moonTint = vec3(1.02, 0.97, 0.84);
        vec3 skyAmbient = mix(vec3(0.024, 0.056, 0.135), vec3(0.088, 0.165, 0.310), skyHemi);

        vec3 lit = vColor * (moonTint * keyLight * 0.90 + skyAmbient + fillLight * 0.65 + uEmissiveBoost + bristle);
        lit += vColor * vec3(0.92, 0.95, 1.04) * sss;

        // Moonlit golden-cerulean Fresnel rim + bioluminescent ripple wave
        vec3 rimColor = mix(vec3(0.45, 0.80, 1.0), vec3(1.0, 0.88, 0.50), 0.38);
        lit += rimColor * fresnel * (uRimStrength + 0.22 * uFinaleProgress + vRipple * 0.55);
        lit += mix(vec3(0.35, 0.82, 1.0), vec3(1.0, 0.86, 0.42), 0.35) * vRipple * 0.38;

        // Seamless nocturnal atmospheric perspective into Saint-Rémy indigo foothills
        float horizonFade = smoothstep(5.2, 13.5, length(vWorldPos.xz - vec2(0.0, 1.2)));
        lit = mix(lit, vec3(0.012, 0.032, 0.088), horizonFade * 0.72);

        // ACES-inspired filmic curve + single clean sRGB encode (rich velvety darks, luminous petals)
        vec3 mapped = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
        vec3 srgb = pow(clamp(mapped, 0.0, 1.0), vec3(1.0 / 2.2));

        gl_FragColor = vec4(srgb, 1.0);
      }
    `
  });
}

export function createMeadowScene(
  canvas,
  { eggs = [], onEggTrigger = () => {}, onRipple = () => {}, onStatus = () => {} } = {}
) {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false
  });
  if (!gl) {
    const err = new Error('WebGL2 is required for the 3D flower meadow');
    onStatus('error', err.message);
    throw err;
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    context: gl,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 80);
  const cameraBase = new THREE.Vector3(0, 1.72, 6.65);
  const cameraLookBase = new THREE.Vector3(0, 0.68, -2.2);
  const cameraCurrentPos = cameraBase.clone();
  const cameraCurrentLook = cameraLookBase.clone();
  const cameraTargetPos = cameraBase.clone();
  const cameraTargetLook = cameraLookBase.clone();

  let macroMode = false;
  let focusedEgg = null;
  let focusUntil = 0;
  let finaleProgress = 0;
  let targetFinale = 0;
  let disposed = false;
  let renderCount = 0;

  const ripples = Array.from({ length: 5 }, () => new THREE.Vector4(0, 0, 0, -1));
  let rippleCursor = 0;

  function spawnRipple(x = 0, y = meadowHeight(0, 1.8), z = 1.8) {
    ripples[rippleCursor].set(x, y, z, 0.05);
    rippleCursor = (rippleCursor + 1) % ripples.length;
    onRipple({ x, y, z });
  }

  const sharedUniforms = {
    uTime: { value: 0 },
    uPointerWorld: { value: new THREE.Vector3(0, -10, 0) },
    uPointerActive: { value: 0 },
    uRipples: { value: ripples },
    uFinaleProgress: { value: 0 }
  };

  const rng = createRng(20261111);
  const dummy = new THREE.Object3D();
  const upVec = new THREE.Vector3(0, 1, 0);
  const normalVec = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const spinQuat = new THREE.Quaternion();
  const colorTmp = new THREE.Color();

  // ============================================================================
  // 1. UNDULATING HILLSIDE TERRAIN WITH FEATHERED HORIZON BLEND (Zero Hard Seam!)
  // ============================================================================
  const terrainGeo = new THREE.PlaneGeometry(34, 18, 96, 60);
  terrainGeo.rotateX(-Math.PI * 0.5);
  terrainGeo.translate(0, 0, -1.5);
  const tPos = terrainGeo.attributes.position;
  for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i);
    const z = tPos.getZ(i);
    tPos.setY(i, meadowHeight(x, z));
  }
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    uniforms: {
      uTime: sharedUniforms.uTime,
      uRipples: sharedUniforms.uRipples,
      uPointerWorld: sharedUniforms.uPointerWorld,
      uPointerActive: sharedUniforms.uPointerActive
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorldPos;
      ${WIND_AND_RIPPLE_VERTEX_GLSL}

      void main() {
        // Painterly nocturnal Prussian-emerald ground strokes
        float stroke1 = sin(vWorldPos.x * 1.65 + cos(vWorldPos.z * 1.35)) * 0.5 + 0.5;
        float stroke2 = sin(vWorldPos.x * 4.2 - vWorldPos.z * 3.1) * 0.5 + 0.5;

        vec3 deepSoil = vec3(0.018, 0.048, 0.105);
        vec3 viridianMoss = vec3(0.036, 0.115, 0.165);
        vec3 indigoHorizon = vec3(0.032, 0.072, 0.168);

        vec3 col = mix(deepSoil, viridianMoss, stroke1 * 0.65 + stroke2 * 0.25);
        float farMix = smoothstep(0.5, -6.2, vWorldPos.z);
        col = mix(col, indigoHorizon, farMix * 0.85);

        float ripple = computeRippleBoost(vWorldPos);
        col += mix(vec3(0.24, 0.72, 0.98), vec3(0.98, 0.84, 0.38), 0.38) * ripple * 0.36;

        // Soft alpha feather along far mountain edge so 3D ground melts into p5.js hills!
        float edgeAlpha = smoothstep(-9.2, -5.4, vWorldPos.z) * smoothstep(16.5, 11.5, abs(vWorldPos.x));
        gl_FragColor = vec4(col, edgeAlpha);
      }
    `
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  scene.add(terrainMesh);

  // ============================================================================
  // 2. SPATIAL PLANNER — ZERO FLOWER COLLISIONS & NATURAL BOTANICAL DRIFTS
  // ============================================================================
  const occupied = [];
  function canPlace(x, z, r, allowOverlap = false) {
    if (allowOverlap) return true;
    for (let i = 0; i < occupied.length; i++) {
      const o = occupied[i];
      const dx = x - o.x;
      const dz = z - o.z;
      const minD = r + o.r;
      if (dx * dx + dz * dz < minD * minD) return false;
    }
    return true;
  }

  function registerSpot(x, z, r) {
    occupied.push({ x, z, r });
  }

  // Reserve crystal wish-bottle romantic clearing at [0.18, 2.65] + dark-grass sightline behind it!
  registerSpot(0.18, 2.65, 0.48);
  registerSpot(0.18, 2.18, 0.36);
  registerSpot(0.18, 3.05, 0.34);

  const flowerMat = createPainterlyFlowerMaterial(sharedUniforms, {
    swayWeight: 0.82,
    rootAnchored: false,
    rimStrength: 0.34,
    emissiveBoost: 0.05,
    sssStrength: 0.24
  });
  const stemAndLeafMat = createPainterlyFlowerMaterial(sharedUniforms, {
    swayWeight: 0.82,
    rootAnchored: true,
    rimStrength: 0.16,
    emissiveBoost: 0.02,
    sssStrength: 0.12
  });
  const grassMat = createPainterlyFlowerMaterial(sharedUniforms, {
    swayWeight: 0.72,
    rootAnchored: true,
    rimStrength: 0.18,
    emissiveBoost: 0.02,
    sssStrength: 0.10
  });
  const gypMat = createPainterlyFlowerMaterial(sharedUniforms, {
    swayWeight: 0.92,
    rootAnchored: false,
    rimStrength: 0.48,
    emissiveBoost: 0.26,
    sssStrength: 0.30
  });

  const stemRecords = []; // { x, y, z, height, rotY, tiltX, tiltZ, thick }

  // --- A. BLUE ENDLESS SUMMER HYDRANGEA SHRUBS (22 Multi-Panicle Bushes, NOT Soccer Balls!) ---
  const hydrangeaPalettes = [
    ['#2563eb', '#60a5fa', '#3b82f6', '#818cf8'],
    ['#0284c7', '#38bdf8', '#60a5fa', '#a78bfa'],
    ['#4f46e5', '#818cf8', '#3b82f6', '#c084fc'],
    ['#2563eb', '#38bdf8', '#6366f1', '#9333ea']
  ];

  const hydrangeaShrubs = [
    // Egg #1 Hero Hydrangea Shrubs (framed clearly in left-foreground golden ratio!)
    { x: -2.18, z: 2.08, scale: 1.12, palette: hydrangeaPalettes[1] },
    { x: -3.05, z: 1.48, scale: 0.98, palette: hydrangeaPalettes[0] },
    { x: -1.48, z: 2.58, scale: 0.94, palette: hydrangeaPalettes[2] },
    // Balanced picturesque shrubs across midground & flanks
    { x: -3.95, z: 2.35, scale: 0.98, palette: hydrangeaPalettes[3] },
    { x: 2.95, z: 2.38, scale: 1.00, palette: hydrangeaPalettes[3] },
    { x: 4.25, z: 1.65, scale: 0.96, palette: hydrangeaPalettes[0] },
    { x: -0.85, z: 0.08, scale: 0.96, palette: hydrangeaPalettes[1] },
    { x: 1.45, z: 0.25, scale: 0.95, palette: hydrangeaPalettes[2] }
  ];

  for (const s of hydrangeaShrubs) {
    registerSpot(s.x, s.z, 0.56 * s.scale);
  }

  for (let attempt = 0; attempt < 180 && hydrangeaShrubs.length < 22; attempt++) {
    const x = (rng() - 0.5) * 14.5;
    const z = 3.5 - rng() * 8.4;
    const scale = 0.78 + rng() * 0.28;
    if (canPlace(x, z, 0.58 * scale)) {
      registerSpot(x, z, 0.54 * scale);
      hydrangeaShrubs.push({
        x,
        z,
        scale,
        palette: hydrangeaPalettes[hydrangeaShrubs.length % hydrangeaPalettes.length]
      });
    }
  }

  // Expand each shrub into 5 organic smaller panicle flower heads!
  const panicleHeads = [];
  const shrubLeafSpots = [];
  for (const shrub of hydrangeaShrubs) {
    const headCount = 5;
    for (let k = 0; k < headCount; k++) {
      const isCenter = k === 0;
      const ang = (k / (headCount - 1)) * Math.PI * 2 + rng() * 0.45;
      const dist = isCenter ? rng() * 0.06 : (0.22 + rng() * 0.11) * shrub.scale;
      const hx = shrub.x + Math.cos(ang) * dist;
      const hz = shrub.z + Math.sin(ang) * dist;
      const headR = (isCenter ? 0.255 : 0.195 + rng() * 0.045) * shrub.scale;
      const lift = (isCenter ? 0.42 : 0.27 + rng() * 0.12) * shrub.scale;
      const gy = meadowHeight(hx, hz);

      panicleHeads.push({
        x: hx,
        y: gy + lift,
        z: hz,
        r: headR,
        florets: Math.round(46 + headR * 95),
        palette: shrub.palette
      });

      stemRecords.push({
        x: hx,
        y: gy,
        z: hz,
        height: lift,
        rotY: ang,
        tiltX: (hz - shrub.z) * 0.25,
        tiltZ: -(hx - shrub.x) * 0.25,
        thick: 1.15
      });
    }

    // Lush collar of 20 broad serrated hydrangea leaves cradling each shrub
    for (let l = 0; l < 20; l++) {
      const la = (l / 20) * Math.PI * 2 + rng() * 0.22;
      const ld = (0.20 + rng() * 0.28) * shrub.scale;
      shrubLeafSpots.push({
        x: shrub.x + Math.cos(la) * ld,
        z: shrub.z + Math.sin(la) * ld,
        ang: la,
        scale: (0.78 + rng() * 0.42) * shrub.scale,
        lift: 0.08 + (l % 3) * 0.07
      });
    }
  }

  const totalHydrangeaFlorets = panicleHeads.reduce((sum, p) => sum + p.florets, 0);
  const hydrangeaGeo = createHydrangeaFloretGeometry();
  const hydrangeaInstanced = new THREE.InstancedMesh(hydrangeaGeo, flowerMat, totalHydrangeaFlorets);

  let hIdx = 0;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (const head of panicleHeads) {
    const cols = head.palette.map(hex => new THREE.Color(hex));
    for (let j = 0; j < head.florets; j++) {
      const t = j / head.florets;
      const inc = Math.acos(1 - t * 0.88);
      const az = j * goldenAngle + rng() * 0.16;
      const nx = Math.sin(inc) * Math.cos(az);
      const ny = Math.cos(inc);
      const nz = Math.sin(inc) * Math.sin(az);

      // Organic depth jitter gives foamy panicle clusters instead of rigid plastic balls!
      const jitterR = head.r * (0.78 + 0.28 * rng());
      dummy.position.set(
        head.x + nx * jitterR,
        head.y + ny * jitterR * 0.82,
        head.z + nz * jitterR
      );
      normalVec.set(nx + (rng() - 0.5) * 0.22, ny * 1.1 + 0.15, nz + (rng() - 0.5) * 0.22).normalize();
      quat.setFromUnitVectors(upVec, normalVec);
      spinQuat.setFromAxisAngle(upVec, rng() * Math.PI * 2);
      quat.multiply(spinQuat);
      dummy.quaternion.copy(quat);
      dummy.scale.setScalar(0.84 + rng() * 0.34);
      dummy.updateMatrix();
      hydrangeaInstanced.setMatrixAt(hIdx, dummy.matrix);

      colorTmp.copy(cols[j % cols.length]).lerp(cols[(j + 1) % cols.length], rng() * 0.65);
      hydrangeaInstanced.setColorAt(hIdx, colorTmp);
      hIdx++;
    }
  }
  hydrangeaInstanced.instanceMatrix.needsUpdate = true;
  if (hydrangeaInstanced.instanceColor) hydrangeaInstanced.instanceColor.needsUpdate = true;
  scene.add(hydrangeaInstanced);

  // --- B. VAN GOGH STARRY SUNFLOWERS (34 Tall Golden Blooms Facing the Moonlight) ---
  const sunflowerCoords = [
    // Egg #2 Hero Sunflower Drift at [-1.05, z=0.85]
    { x: -1.05, z: 0.85, scale: 1.06, height: 1.04, yaw: 0.18 },
    { x: -1.42, z: 1.08, scale: 0.92, height: 0.90, yaw: 0.26 },
    { x: -0.68, z: 1.02, scale: 0.88, height: 0.84, yaw: 0.08 },
    { x: -1.18, z: 0.50, scale: 0.96, height: 0.96, yaw: 0.14 }
  ];
  for (const s of sunflowerCoords) registerSpot(s.x, s.z, 0.22);

  // Plant sunflowers in scenic mid-to-far golden drifts (z <= 2.4 so they frame rather than block foreground!)
  const sunCenters = [
    [-4.8, -0.4], [-2.6, -1.6], [0.4, -1.2], [2.8, -0.5], [4.9, 0.2], [-3.5, -3.2], [1.8, -3.0], [4.2, -2.4]
  ];
  for (let i = 0; i < 220 && sunflowerCoords.length < 34; i++) {
    const c = sunCenters[i % sunCenters.length];
    const x = c[0] + (rng() - 0.5) * 2.4;
    const z = c[1] + (rng() - 0.5) * 2.2;
    if (canPlace(x, z, 0.24)) {
      registerSpot(x, z, 0.22);
      sunflowerCoords.push({
        x,
        z,
        scale: 0.72 + rng() * 0.30,
        height: 0.72 + rng() * 0.42,
        yaw: 0.16 + (rng() - 0.5) * 0.48
      });
    }
  }

  const sunflowerGeo = createSunflowerGeometry();
  const sunflowerInstanced = new THREE.InstancedMesh(sunflowerGeo, flowerMat, sunflowerCoords.length);
  const sunTints = [new THREE.Color('#ffffff'), new THREE.Color('#fef3c7'), new THREE.Color('#fde68a')];

  for (let i = 0; i < sunflowerCoords.length; i++) {
    const sc = sunflowerCoords[i];
    const gy = meadowHeight(sc.x, sc.z);
    const topY = gy + sc.height;
    dummy.position.set(sc.x, topY, sc.z);
    dummy.rotation.set(0, sc.yaw, (rng() - 0.5) * 0.12);
    dummy.scale.setScalar(sc.scale);
    dummy.updateMatrix();
    sunflowerInstanced.setMatrixAt(i, dummy.matrix);
    sunflowerInstanced.setColorAt(i, sunTints[i % sunTints.length]);

    stemRecords.push({
      x: sc.x,
      y: gy,
      z: sc.z,
      height: sc.height,
      rotY: sc.yaw,
      tiltX: 0,
      tiltZ: 0,
      thick: 1.45
    });

    // Broad sunflower stem leaves
    for (let sl = 0; sl < 2; sl++) {
      shrubLeafSpots.push({
        x: sc.x,
        z: sc.z,
        ang: sc.yaw + (sl === 0 ? 1.2 : -1.4),
        scale: 0.75 * sc.scale,
        lift: sc.height * (0.35 + sl * 0.24)
      });
    }
  }
  sunflowerInstanced.instanceMatrix.needsUpdate = true;
  if (sunflowerInstanced.instanceColor) sunflowerInstanced.instanceColor.needsUpdate = true;
  scene.add(sunflowerInstanced);

  // --- C. VAN GOGH SAINT-RÉMY IRISES (58 Royal Irises + Sword Leaf Fans) ---
  const irisTints = ['#6366f1', '#818cf8', '#7c3aed', '#4f46e5', '#a78bfa'];
  const irisCoords = [
    // Egg #4 Hero Iris & Tulip Drift at [2.08, z=1.95] (clearly framed on right!)
    { x: 2.08, z: 1.95, scale: 1.18, height: 0.82, tint: '#818cf8' },
    { x: 2.46, z: 1.72, scale: 1.08, height: 0.75, tint: '#7c3aed' },
    { x: 1.72, z: 2.12, scale: 1.06, height: 0.72, tint: '#6366f1' }
  ];
  for (const ic of irisCoords) registerSpot(ic.x, ic.z, 0.20);

  for (let i = 0; i < 320 && irisCoords.length < 58; i++) {
    const x = (rng() - 0.5) * 14.2;
    const z = 3.6 - rng() * 8.8;
    if (canPlace(x, z, 0.21)) {
      registerSpot(x, z, 0.19);
      irisCoords.push({
        x,
        z,
        scale: 0.82 + rng() * 0.34,
        height: 0.56 + rng() * 0.36,
        tint: irisTints[irisCoords.length % irisTints.length]
      });
    }
  }

  const irisGeo = createIrisGeometry();
  const irisInstanced = new THREE.InstancedMesh(irisGeo, flowerMat, irisCoords.length);
  const swordSpots = [];

  for (let i = 0; i < irisCoords.length; i++) {
    const ic = irisCoords[i];
    const gy = meadowHeight(ic.x, ic.z);
    const topY = gy + ic.height;
    dummy.position.set(ic.x, topY, ic.z);
    dummy.rotation.set((rng() - 0.5) * 0.12, rng() * Math.PI * 2, (rng() - 0.5) * 0.12);
    dummy.scale.setScalar(ic.scale);
    dummy.updateMatrix();
    irisInstanced.setMatrixAt(i, dummy.matrix);
    irisInstanced.setColorAt(i, new THREE.Color(ic.tint));

    stemRecords.push({
      x: ic.x,
      y: gy,
      z: ic.z,
      height: ic.height,
      rotY: rng() * Math.PI * 2,
      tiltX: 0,
      tiltZ: 0,
      thick: 1.0
    });

    // Fan of 4 architectural sword leaves around each iris!
    for (let f = 0; f < 4; f++) {
      swordSpots.push({
        x: ic.x + (rng() - 0.5) * 0.08,
        y: gy,
        z: ic.z + (rng() - 0.5) * 0.08,
        rotY: (f / 4) * Math.PI * 2 + rng() * 0.4,
        splay: 0.18 + rng() * 0.22,
        scale: (0.72 + rng() * 0.32) * ic.scale
      });
    }
  }
  irisInstanced.instanceMatrix.needsUpdate = true;
  if (irisInstanced.instanceColor) irisInstanced.instanceColor.needsUpdate = true;
  scene.add(irisInstanced);

  // --- D. VELVET ENGLISH GARDEN ROSES (68 Cupped Spiral Roses) ---
  const rosePalettes = ['#e11d48', '#fb7185', '#f43f5e', '#f472b6', '#fda4af', '#fbbf24'];
  const roseCoords = [
    // Frame Egg #3 Crystal Wish Bottle at [0.18, z=2.65] symmetrically so dark grass silhouettes the crystal glass!
    { x: -0.38, z: 2.68, scale: 1.15, height: 0.46, tint: '#e11d48' },
    { x: 0.72, z: 2.62, scale: 1.14, height: 0.46, tint: '#fb7185' },
    { x: -0.32, z: 2.16, scale: 1.08, height: 0.54, tint: '#fda4af' },
    { x: 0.66, z: 2.16, scale: 1.08, height: 0.54, tint: '#f43f5e' }
  ];
  for (const rc of roseCoords) registerSpot(rc.x, rc.z, 0.18);

  for (let i = 0; i < 360 && roseCoords.length < 68; i++) {
    const x = (rng() - 0.5) * 13.8;
    const z = 3.8 - rng() * 8.6;
    if (canPlace(x, z, 0.19)) {
      registerSpot(x, z, 0.17);
      roseCoords.push({
        x,
        z,
        scale: 0.84 + rng() * 0.34,
        height: 0.38 + rng() * 0.32,
        tint: rosePalettes[roseCoords.length % rosePalettes.length]
      });
    }
  }

  const roseGeo = createRoseGeometry();
  const roseInstanced = new THREE.InstancedMesh(roseGeo, flowerMat, roseCoords.length);
  for (let i = 0; i < roseCoords.length; i++) {
    const rc = roseCoords[i];
    const gy = meadowHeight(rc.x, rc.z);
    const topY = gy + rc.height;
    dummy.position.set(rc.x, topY, rc.z);
    dummy.rotation.set((rng() - 0.5) * 0.20, rng() * Math.PI * 2, (rng() - 0.5) * 0.20);
    dummy.scale.setScalar(rc.scale);
    dummy.updateMatrix();
    roseInstanced.setMatrixAt(i, dummy.matrix);
    roseInstanced.setColorAt(i, new THREE.Color(rc.tint));

    stemRecords.push({
      x: rc.x,
      y: gy,
      z: rc.z,
      height: rc.height,
      rotY: rng() * Math.PI * 2,
      tiltX: 0,
      tiltZ: 0,
      thick: 0.92
    });
  }
  roseInstanced.instanceMatrix.needsUpdate = true;
  if (roseInstanced.instanceColor) roseInstanced.instanceColor.needsUpdate = true;
  scene.add(roseInstanced);

  // --- E. MOONLIT LILY-GOBLET TULIPS (76 Slender Graceful Tulips) ---
  const tulipPalettes = ['#fde68a', '#fda4af', '#fbbf24', '#f472b6', '#c4b5fd', '#7dd3fc'];
  const tulipCoords = [];
  // Companion tulips near Egg #4 Iris & Tulip drift (non-overlapping!)
  const tulipSeeds = [
    [2.34, 2.22], [1.88, 1.68], [2.64, 2.04], [1.50, 1.88]
  ];
  for (const [tx, tz] of tulipSeeds) {
    if (canPlace(tx, tz, 0.15)) {
      registerSpot(tx, tz, 0.15);
      tulipCoords.push({
        x: tx,
        z: tz,
        scale: 1.02 + rng() * 0.18,
        height: 0.48 + rng() * 0.18,
        tint: tulipPalettes[tulipCoords.length % tulipPalettes.length]
      });
    }
  }

  for (let i = 0; i < 420 && tulipCoords.length < 76; i++) {
    const x = (rng() - 0.5) * 14.0;
    const z = 3.9 - rng() * 8.8;
    if (canPlace(x, z, 0.16)) {
      registerSpot(x, z, 0.15);
      tulipCoords.push({
        x,
        z,
        scale: 0.85 + rng() * 0.30,
        height: 0.40 + rng() * 0.30,
        tint: tulipPalettes[tulipCoords.length % tulipPalettes.length]
      });
    }
  }

  const tulipGeo = createTulipGeometry();
  const tulipInstanced = new THREE.InstancedMesh(tulipGeo, flowerMat, tulipCoords.length);
  for (let i = 0; i < tulipCoords.length; i++) {
    const tc = tulipCoords[i];
    const gy = meadowHeight(tc.x, tc.z);
    const topY = gy + tc.height;
    dummy.position.set(tc.x, topY, tc.z);
    dummy.rotation.set((rng() - 0.5) * 0.16, rng() * Math.PI * 2, (rng() - 0.5) * 0.16);
    dummy.scale.setScalar(tc.scale);
    dummy.updateMatrix();
    tulipInstanced.setMatrixAt(i, dummy.matrix);
    tulipInstanced.setColorAt(i, new THREE.Color(tc.tint));

    stemRecords.push({
      x: tc.x,
      y: gy,
      z: tc.z,
      height: tc.height,
      rotY: rng() * Math.PI * 2,
      tiltX: 0,
      tiltZ: 0,
      thick: 0.85
    });

    // Two clasping lance leaves at each tulip base
    for (let tl = 0; tl < 2; tl++) {
      swordSpots.push({
        x: tc.x,
        y: gy,
        z: tc.z,
        rotY: tl * Math.PI + rng() * 0.6,
        splay: 0.28 + rng() * 0.15,
        scale: 0.55 * tc.scale
      });
    }
  }
  tulipInstanced.instanceMatrix.needsUpdate = true;
  if (tulipInstanced.instanceColor) tulipInstanced.instanceColor.needsUpdate = true;
  scene.add(tulipInstanced);

  // --- BUILD ALL REAL 3D SWAYING BOTANICAL STEMS & LEAVES ---
  const stemGeo = createCurvedStemGeometry();
  const stemInstanced = new THREE.InstancedMesh(stemGeo, stemAndLeafMat, stemRecords.length);
  for (let i = 0; i < stemRecords.length; i++) {
    const sr = stemRecords[i];
    dummy.position.set(sr.x, sr.y, sr.z);
    dummy.rotation.set(sr.tiltX, sr.rotY, sr.tiltZ);
    dummy.scale.set(sr.thick, sr.height, sr.thick);
    dummy.updateMatrix();
    stemInstanced.setMatrixAt(i, dummy.matrix);
  }
  stemInstanced.instanceMatrix.needsUpdate = true;
  scene.add(stemInstanced);

  const leafGeo = createHydrangeaLeafGeometry();
  const leafInstanced = new THREE.InstancedMesh(leafGeo, stemAndLeafMat, shrubLeafSpots.length);
  for (let i = 0; i < shrubLeafSpots.length; i++) {
    const ls = shrubLeafSpots[i];
    const gy = meadowHeight(ls.x, ls.z);
    dummy.position.set(ls.x, gy + ls.lift, ls.z);
    dummy.rotation.set(0.16 + rng() * 0.26, -ls.ang + Math.PI * 0.5, (rng() - 0.5) * 0.18);
    dummy.scale.setScalar(ls.scale);
    dummy.updateMatrix();
    leafInstanced.setMatrixAt(i, dummy.matrix);
  }
  leafInstanced.instanceMatrix.needsUpdate = true;
  scene.add(leafInstanced);

  const swordGeo = createIrisSwordLeafGeometry();
  const swordInstanced = new THREE.InstancedMesh(swordGeo, stemAndLeafMat, swordSpots.length);
  for (let i = 0; i < swordSpots.length; i++) {
    const sw = swordSpots[i];
    dummy.position.set(sw.x, sw.y, sw.z);
    dummy.rotation.set(sw.splay, sw.rotY, 0);
    dummy.scale.setScalar(sw.scale);
    dummy.updateMatrix();
    swordInstanced.setMatrixAt(i, dummy.matrix);
  }
  swordInstanced.instanceMatrix.needsUpdate = true;
  scene.add(swordInstanced);

  // --- F. GYPSOPHILA "满天星" FOAMY STAR-CLOUD PANICLES (6,400 Blossoms + Fine Panicle Sprays) ---
  const gypCount = 6400;
  const gypGeo = createGypsophilaGeometry();
  const gypInstanced = new THREE.InstancedMesh(gypGeo, gypMat, gypCount);
  const gypTints = [
    new THREE.Color('#ffffff'),
    new THREE.Color('#e0f2fe'),
    new THREE.Color('#bae6fd'),
    new THREE.Color('#fef9c3'),
    new THREE.Color('#ede9fe')
  ];

  // Create 90 organic Baby's Breath cloud panicles hugging shrubs, roses & winding Milky-Way ribbons
  const gypClouds = [];
  for (const shrub of hydrangeaShrubs) {
    for (let c = 0; c < 2; c++) {
      const a = rng() * Math.PI * 2;
      const d = (0.48 + rng() * 0.25) * shrub.scale;
      gypClouds.push({
        x: shrub.x + Math.cos(a) * d,
        z: shrub.z + Math.sin(a) * d,
        r: 0.32 + rng() * 0.18,
        h: 0.24 + rng() * 0.18
      });
    }
  }
  // Frame the Rose & Wish-Bottle romantic clearing with foamy Gypsophila clouds
  gypClouds.push(
    { x: -0.45, z: 2.55, r: 0.36, h: 0.26 },
    { x: 0.85, z: 2.95, r: 0.38, h: 0.26 },
    { x: 0.28, z: 3.22, r: 0.32, h: 0.22 }
  );
  while (gypClouds.length < 92) {
    const u = gypClouds.length / 92;
    // Milky-way floral ribbon winding S-like across the meadow
    const ribbonX = (u - 0.5) * 13.5 + Math.sin(u * Math.PI * 3.0) * 1.4 + (rng() - 0.5) * 1.6;
    const ribbonZ = 3.5 - u * 8.2 + (rng() - 0.5) * 1.5;
    gypClouds.push({
      x: ribbonX,
      z: ribbonZ,
      r: 0.30 + rng() * 0.22,
      h: 0.20 + rng() * 0.18
    });
  }

  for (let i = 0; i < gypCount; i++) {
    const cloud = gypClouds[i % gypClouds.length];
    // Gaussian-like spherical cloud distribution so Baby's Breath forms airy puffs, not random confetti!
    const a = rng() * Math.PI * 2;
    const rad = cloud.r * Math.pow(rng(), 0.62);
    const gx = cloud.x + Math.cos(a) * rad;
    const gz = cloud.z + Math.sin(a) * rad;
    const dome = Math.sqrt(Math.max(0, 1 - (rad / (cloud.r + 0.01)) ** 2));
    const gy = meadowHeight(gx, gz) + 0.10 + dome * cloud.h + (rng() - 0.5) * 0.09;

    dummy.position.set(gx, gy, gz);
    dummy.rotation.set((rng() - 0.5) * 0.8, rng() * Math.PI * 2, (rng() - 0.5) * 0.8);
    dummy.scale.setScalar(0.42 + rng() * 0.42);
    dummy.updateMatrix();
    gypInstanced.setMatrixAt(i, dummy.matrix);
    gypInstanced.setColorAt(i, gypTints[i % gypTints.length]);
  }
  gypInstanced.instanceMatrix.needsUpdate = true;
  if (gypInstanced.instanceColor) gypInstanced.instanceColor.needsUpdate = true;
  scene.add(gypInstanced);

  // --- G. DENSE 14,000-BLADE PAINTERLY MEADOW GRASS CARPET (Zero Bare Plastic Ground!) ---
  const grassGeo = createGrassBladeGeometry();
  const totalBlades = 14000;
  const grassInstanced = new THREE.InstancedMesh(grassGeo, grassMat, totalBlades);
  const grassTints = [
    new THREE.Color('#7dd3fc'),
    new THREE.Color('#5eead4'),
    new THREE.Color('#93c5fd'),
    new THREE.Color('#fef08a')
  ];

  for (let i = 0; i < totalBlades; i++) {
    // Concentrate lush density in foreground & midground where camera sees between stems
    const x = (rng() - 0.5) * 20.5;
    const z = 4.6 - Math.pow(rng(), 0.82) * 11.2;
    const y = meadowHeight(x, z);
    const distBottle = Math.hypot(x - 0.18, z - 2.65);
    const bottleTrim = distBottle < 0.38 ? 0.34 : 1.0;
    dummy.position.set(x, y, z);
    dummy.rotation.set((rng() - 0.5) * 0.22, rng() * Math.PI * 2, (rng() - 0.5) * 0.24);
    const wScale = 0.85 + rng() * 0.55;
    const hScale = (0.46 + rng() * 0.66) * bottleTrim;
    dummy.scale.set(wScale, hScale, 1);
    dummy.updateMatrix();
    grassInstanced.setMatrixAt(i, dummy.matrix);

    colorTmp.setRGB(0.82, 0.92, 0.94).lerp(grassTints[i % grassTints.length], 0.14);
    grassInstanced.setColorAt(i, colorTmp);
  }
  grassInstanced.instanceMatrix.needsUpdate = true;
  if (grassInstanced.instanceColor) grassInstanced.instanceColor.needsUpdate = true;
  scene.add(grassInstanced);

  // ============================================================================
  // 3. FIVE INTERACTIVE EASTER EGG TARGETS + CRYSTAL STAR-SAND WISH BOTTLE
  // ============================================================================
  const eggNodes = new Map();
  const raycastTargets = [];

  for (const egg of eggs) {
    const [ex, ey, ez] = egg.position;
    const worldY = egg.kind === 'meteor' ? ey : meadowHeight(ex, ez) + 0.48;
    const anchor = new THREE.Vector3(ex, worldY, ez);
    const eggGroup = new THREE.Group();
    eggGroup.position.copy(anchor);
    scene.add(eggGroup);

    // Delicate glowing starlight aura ring on the meadow floor
    const ringGeo = new THREE.RingGeometry(0.46, 0.53, 48);
    ringGeo.rotateX(-Math.PI * 0.5);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(egg.color || '#7dd3fc'),
      transparent: true,
      opacity: egg.kind === 'meteor' ? 0.0 : 0.30,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = -0.26;
    eggGroup.add(ringMesh);

    if (egg.kind === 'bottle') {
      // Egg #3: Sculpted Fresnel-Glass Apothecary Wish Bottle with Cork, Ribbon & Glowing Love Scroll
      const bottleGroup = new THREE.Group();
      bottleGroup.position.y = 0.04;
      bottleGroup.rotation.z = 0.24;
      bottleGroup.rotation.x = 0.08;
      bottleGroup.scale.setScalar(1.26);

      const glassMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vN = normalize(mat3(modelMatrix) * normal);
            vV = normalize(cameraPosition - wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            float fresnel = pow(1.0 - clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 1.65);
            vec3 col = mix(vec3(0.22, 0.58, 0.92), vec3(0.88, 0.97, 1.0), fresnel);
            float alpha = 0.22 + 0.68 * fresnel;
            gl_FragColor = vec4(col, alpha);
          }
        `
      });

      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.44, 28, 1, true), glassMat);
      const bottomCap = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), glassMat);
      bottomCap.rotation.x = Math.PI * 0.5;
      bottomCap.position.y = -0.22;
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), glassMat);
      shoulder.position.y = 0.19;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.072, 0.16, 20, 1, true), glassMat);
      neck.position.y = 0.31;
      const lipRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.062, 0.012, 10, 24),
        new THREE.MeshBasicMaterial({ color: 0xe0f2fe })
      );
      lipRing.rotation.x = Math.PI * 0.5;
      lipRing.position.y = 0.38;

      const goldRibbon = new THREE.Mesh(
        new THREE.TorusGeometry(0.066, 0.010, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 })
      );
      goldRibbon.rotation.x = Math.PI * 0.5;
      goldRibbon.position.y = 0.28;

      const cork = new THREE.Mesh(
        new THREE.CylinderGeometry(0.046, 0.040, 0.085, 16),
        new THREE.MeshBasicMaterial({ color: 0xb45309 })
      );
      cork.position.y = 0.41;

      const scroll = new THREE.Mesh(
        new THREE.CylinderGeometry(0.044, 0.044, 0.27, 18),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      scroll.rotation.z = -0.10;
      const scrollRibbon = new THREE.Mesh(
        new THREE.TorusGeometry(0.047, 0.008, 8, 20),
        new THREE.MeshBasicMaterial({ color: 0xf43f5e })
      );
      scrollRibbon.rotation.x = Math.PI * 0.5;
      scrollRibbon.rotation.y = -0.10;

      const starSand = new THREE.Mesh(
        new THREE.SphereGeometry(0.125, 18, 12),
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.72,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      starSand.position.y = -0.14;
      starSand.scale.set(1, 0.52, 1);

      bottleGroup.add(starSand, scroll, scrollRibbon, body, bottomCap, shoulder, neck, lipRing, goldRibbon, cork);
      eggGroup.add(bottleGroup);
    }

    const hitSphere = new THREE.Mesh(
      new THREE.SphereGeometry(egg.kind === 'meteor' ? 1.45 : 1.15, 12, 12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitSphere.userData.eggId = egg.id;
    eggGroup.add(hitSphere);
    raycastTargets.push(hitSphere);

    eggNodes.set(egg.id, {
      egg,
      anchor,
      group: eggGroup,
      ringMesh,
      unlocked: false,
      hintPulse: 0
    });
  }

  // --- 220 Bioluminescent Fireflies & Rising Stardust Motes ---
  const fireflyCount = 220;
  const ffPos = new Float32Array(fireflyCount * 3);
  const ffSeed = new Float32Array(fireflyCount * 4);
  const ffColor = new Float32Array(fireflyCount * 3);

  for (let i = 0; i < fireflyCount; i++) {
    const fx = (rng() - 0.5) * 16.5;
    const fz = 4.2 - rng() * 10.5;
    const fy = meadowHeight(fx, fz) + 0.22 + rng() * 2.1;
    ffPos[i * 3] = fx;
    ffPos[i * 3 + 1] = fy;
    ffPos[i * 3 + 2] = fz;

    ffSeed[i * 4] = rng() * Math.PI * 2;
    ffSeed[i * 4 + 1] = 0.55 + rng() * 1.25;
    ffSeed[i * 4 + 2] = 0.20 + rng() * 0.30;
    ffSeed[i * 4 + 3] = rng();

    const hex = i % 3 === 0 ? '#fde047' : (i % 3 === 1 ? '#7dd3fc' : '#fef9c3');
    const col = new THREE.Color(hex);
    ffColor[i * 3] = col.r;
    ffColor[i * 3 + 1] = col.g;
    ffColor[i * 3 + 2] = col.b;
  }

  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  ffGeo.setAttribute('aSeed', new THREE.BufferAttribute(ffSeed, 4));
  ffGeo.setAttribute('color', new THREE.BufferAttribute(ffColor, 3));

  const ffMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uTime: sharedUniforms.uTime,
      uPixelRatio: { value: 1 },
      uFinaleProgress: sharedUniforms.uFinaleProgress
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uFinaleProgress;
      varying vec3 vColor;
      varying float vPulse;
      void main() {
        vColor = color;
        float t = uTime * aSeed.y + aSeed.x;
        vec3 p = position;
        p.x += sin(t * 1.05) * 0.46 + cos(t * 0.48) * 0.22;
        p.y += sin(t * 1.35) * 0.26 + uFinaleProgress * (0.95 + aSeed.w * 2.4);
        p.z += cos(t * 0.88) * 0.44;
        vPulse = 0.32 + 0.68 * pow(0.5 + 0.5 * sin(t * 2.2), 2.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (16.0 + 12.0 * vPulse) * aSeed.z * uPixelRatio * (16.0 / max(2.4, -mv.z));
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vPulse;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float core = exp(-d * d * 42.0);
        float halo = exp(-d * d * 12.0) * 0.55;
        float glow = (core + halo) * vPulse;
        if (glow < 0.015) discard;
        vec3 srgb = pow(clamp(vColor, 0.0, 1.0), vec3(1.0 / 2.2));
        gl_FragColor = vec4(mix(srgb, vec3(1.0, 0.99, 0.92), core * 0.6), clamp(glow, 0.0, 1.0));
      }
    `
  });
  scene.add(new THREE.Points(ffGeo, ffMat));

  // ============================================================================
  // 4. CAMERA, RAYCASTING & ANIMATION LOOP
  // ============================================================================
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();
  const parallaxOffset = new THREE.Vector2(0, 0);
  let dragYaw = 0;
  let dragPitch = 0;

  function resize() {
    if (disposed) return;
    const width = Math.max(1, canvas.clientWidth || window.innerWidth || 1280);
    const height = Math.max(1, canvas.clientHeight || window.innerHeight || 720);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Slightly wider vertical framing on narrow mobile screens so sky + meadow balance naturally
    camera.fov = width < 640 ? 50 : 44;
    camera.updateProjectionMatrix();
    ffMat.uniforms.uPixelRatio.value = dpr;
  }

  resize();

  function updateCameraTargets(nowMs) {
    if (focusedEgg && nowMs < focusUntil) {
      const node = eggNodes.get(focusedEgg);
      if (node) {
        const [ox, oy, oz] = node.egg.cameraOffset || [0, 1.4, 4.2];
        cameraTargetPos.set(ox, oy, oz);
        cameraTargetLook.copy(node.anchor);
        return;
      }
    } else {
      focusedEgg = null;
    }

    if (macroMode) {
      cameraTargetPos.set(
        parallaxOffset.x * 1.05 + dragYaw * 2.0,
        1.02 + parallaxOffset.y * 0.20 + dragPitch * 0.48,
        4.15
      );
      cameraTargetLook.set(
        parallaxOffset.x * 0.55 + dragYaw * 2.5,
        0.48 + dragPitch * 0.68,
        -1.0
      );
    } else {
      cameraTargetPos.set(
        cameraBase.x + parallaxOffset.x * 1.15 + dragYaw * 2.3,
        cameraBase.y + parallaxOffset.y * 0.26 + dragPitch * 0.60,
        cameraBase.z
      );
      cameraTargetLook.set(
        cameraLookBase.x + parallaxOffset.x * 0.70 + dragYaw * 3.0,
        cameraLookBase.y + parallaxOffset.y * 0.34 + dragPitch * 0.85,
        cameraLookBase.z
      );
    }
  }

  let lastFrameMs = performance.now();
  let rafId = 0;

  function renderFrame(nowMs = performance.now()) {
    if (disposed) return;
    const dt = Math.min(0.06, Math.max(0.001, (nowMs - lastFrameMs) / 1000));
    lastFrameMs = nowMs;

    sharedUniforms.uTime.value += dt;
    sharedUniforms.uPointerActive.value = Math.max(0, sharedUniforms.uPointerActive.value - dt * 0.85);

    for (let i = 0; i < ripples.length; i++) {
      if (ripples[i].w >= 0) {
        ripples[i].w += dt * 4.2;
        if (ripples[i].w > 11.5) ripples[i].w = -1;
      }
    }

    finaleProgress += (targetFinale - finaleProgress) * Math.min(1, dt * 1.8);
    sharedUniforms.uFinaleProgress.value = finaleProgress;

    const t = sharedUniforms.uTime.value;
    for (const node of eggNodes.values()) {
      if (node.egg.kind === 'meteor') continue;
      const pulse = 0.82 + 0.18 * Math.sin(t * 2.3 + node.egg.order);
      node.hintPulse = Math.max(0, node.hintPulse - dt * 1.4);
      node.ringMesh.scale.setScalar(pulse * (1 + node.hintPulse * 0.4));
      node.ringMesh.material.opacity = (node.unlocked ? 0.14 : 0.32) * pulse + node.hintPulse * 0.24;
    }

    updateCameraTargets(nowMs);
    cameraCurrentPos.lerp(cameraTargetPos, Math.min(1, dt * 4.2));
    cameraCurrentLook.lerp(cameraTargetLook, Math.min(1, dt * 4.2));
    camera.position.copy(cameraCurrentPos);
    camera.lookAt(cameraCurrentLook);

    renderer.render(scene, camera);
    renderCount++;
  }

  function loop(nowMs) {
    if (disposed) return;
    renderFrame(nowMs);
    rafId = requestAnimationFrame(loop);
  }

  renderFrame(performance.now());
  rafId = requestAnimationFrame(loop);

  let pointerDownX = 0;
  let pointerDownY = 0;
  let isDragging = false;
  let draggedDistance = 0;

  function toNormCoords(x, y) {
    const width = Math.max(1, canvas.clientWidth || window.innerWidth || 1280);
    const height = Math.max(1, canvas.clientHeight || window.innerHeight || 720);
    if (x > 1.01 || y > 1.01) {
      return { nx: x / width, ny: y / height, width, height };
    }
    return { nx: x, ny: y, width, height };
  }

  function handlePointerMove(x, y) {
    const { nx, ny, width, height } = toNormCoords(x, y);
    if (isDragging) {
      const dx = (x - pointerDownX) / width;
      const dy = (y - pointerDownY) / height;
      draggedDistance += Math.hypot(x - pointerDownX, y - pointerDownY);
      pointerDownX = x;
      pointerDownY = y;
      dragYaw = clamp(dragYaw - dx * 1.15, -1.1, 1.1);
      dragPitch = clamp(dragPitch - dy * 0.75, -0.45, 0.55);
    }
    parallaxOffset.set((nx - 0.5) * 2, (0.5 - ny) * 2);
    pointerNDC.set(nx * 2 - 1, -(ny * 2 - 1));
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObject(terrainMesh, false);
    if (hits.length > 0) {
      sharedUniforms.uPointerWorld.value.copy(hits[0].point);
      sharedUniforms.uPointerActive.value = 1.0;
    }
  }

  function handlePointerDown(clientX, clientY) {
    pointerDownX = clientX;
    pointerDownY = clientY;
    isDragging = true;
    draggedDistance = 0;
  }

  function handlePointerUp(clientX, clientY) {
    const wasDragged = draggedDistance > 10;
    isDragging = false;
    if (wasDragged) {
      return { dragged: true, hitEggId: null };
    }
    const { nx, ny } = toNormCoords(clientX, clientY);
    const tap = handleTapAt(nx, ny);
    return {
      dragged: false,
      hitEggId: tap.type === 'egg' ? tap.id : null,
      tap
    };
  }

  function handleTapAt(normX, normY) {
    pointerNDC.set(normX * 2 - 1, -(normY * 2 - 1));
    raycaster.setFromCamera(pointerNDC, camera);

    const eggHits = raycaster.intersectObjects(raycastTargets, false);
    if (eggHits.length > 0) {
      const eggId = eggHits[0].object.userData.eggId;
      if (eggId) {
        triggerEggById(eggId);
        return { type: 'egg', id: eggId };
      }
    }

    const terrainHits = raycaster.intersectObject(terrainMesh, false);
    if (terrainHits.length > 0) {
      const pt = terrainHits[0].point;
      sharedUniforms.uPointerWorld.value.copy(pt);
      sharedUniforms.uPointerActive.value = 1.0;
      spawnRipple(pt.x, pt.y, pt.z);
      return { type: 'ripple', point: pt };
    }

    spawnRipple(0, meadowHeight(0, 1.6), 1.6);
    return { type: 'meteor' };
  }

  function markEggUnlocked(eggId) {
    const node = eggNodes.get(eggId);
    if (!node) return false;
    node.unlocked = true;
    return true;
  }

  function focusEgg(eggId) {
    const node = eggNodes.get(eggId);
    if (!node) return false;
    focusedEgg = eggId;
    focusUntil = performance.now() + 4800;
    spawnRipple(node.anchor.x, meadowHeight(node.anchor.x, node.anchor.z), node.anchor.z);
    return true;
  }

  function triggerEggById(eggId) {
    const node = eggNodes.get(eggId);
    if (!node) return false;
    node.unlocked = true;
    focusedEgg = eggId;
    focusUntil = performance.now() + 4800;
    spawnRipple(node.anchor.x, meadowHeight(node.anchor.x, node.anchor.z), node.anchor.z);
    onEggTrigger(node.egg.id);
    return true;
  }

  function getEggScreenPositions() {
    const width = canvas.clientWidth || window.innerWidth || 1280;
    const height = canvas.clientHeight || window.innerHeight || 720;
    const padX = width < 600 ? 64 : 108;
    const padTop = height < 600 ? 88 : 96;
    const padBottom = height < 600 ? 84 : 98;
    const result = [];
    const proj = new THREE.Vector3();

    for (const node of eggNodes.values()) {
      proj.copy(node.anchor).project(camera);
      const rawX = (proj.x * 0.5 + 0.5) * width;
      const rawY = (-proj.y * 0.5 + 0.5) * height;
      const visible = proj.z > -1 && proj.z < 1 && rawX >= -80 && rawX <= width + 80 && rawY >= -80 && rawY <= height + 80;
      const x = clamp(rawX, padX, Math.max(padX, width - padX));
      const y = clamp(rawY, padTop, Math.max(padTop, height - padBottom));
      result.push({
        id: node.egg.id,
        badge: node.egg.badge,
        hintLabel: node.egg.hintLabel,
        kind: node.egg.kind,
        unlocked: node.unlocked,
        x,
        y,
        visible
      });
    }
    return result;
  }

  function pulseHintBeacons() {
    for (const node of eggNodes.values()) {
      if (!node.unlocked) {
        node.hintPulse = 1.6;
        spawnRipple(node.anchor.x, meadowHeight(node.anchor.x, node.anchor.z), node.anchor.z);
      }
    }
  }

  window.addEventListener('resize', resize);
  onStatus('ready', '梵高星月夜与繁花秘境已盛开');

  return {
    resize,
    handlePointerMove,
    handlePointerDown,
    handlePointerUp,
    handleTapAt,
    triggerEggById,
    markEggUnlocked,
    focusEgg,
    pulseHintBeacons,
    getEggScreenPositions,
    spawnRipple,
    addLookDrag(dxNorm, dyNorm) {
      dragYaw = clamp(dragYaw + dxNorm * 1.35, -1.1, 1.1);
      dragPitch = clamp(dragPitch + dyNorm * 0.85, -0.45, 0.55);
    },
    clearFocus() {
      focusedEgg = null;
      focusUntil = 0;
    },
    setMacroMode(enabled) {
      macroMode = Boolean(enabled);
      focusedEgg = null;
      return macroMode;
    },
    setFinaleActive(active) {
      targetFinale = active ? 1 : 0;
      if (active) {
        spawnRipple(0, meadowHeight(0, 1.6), 1.6);
      }
    },
    triggerFinaleState() {
      targetFinale = 1;
      spawnRipple(0, meadowHeight(0, 1.6), 1.6);
    },
    getDiagnostics() {
      return {
        engine: 'three.js',
        ready: !disposed,
        renderCount,
        species: ['hydrangea', 'sunflower', 'iris', 'rose', 'tulip', 'gypsophila'],
        counts: {
          hydrangeaFlorets: totalHydrangeaFlorets,
          sunflowers: sunflowerCoords.length,
          irises: irisCoords.length,
          roses: roseCoords.length,
          tulips: tulipCoords.length,
          gypsophila: gypCount
        },
        macroMode,
        finaleProgress,
        eggs: Array.from(eggNodes.values()).map(n => ({
          id: n.egg.id,
          kind: n.egg.kind,
          unlocked: n.unlocked
        }))
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafId);
      renderer.dispose();
    }
  };
}

export default createMeadowScene;
