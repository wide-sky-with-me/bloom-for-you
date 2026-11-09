import * as THREE from 'three';

const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, Number(v) || 0));

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function createRng(seed = 20261109) {
  let state = seed >>> 0;
  return function rand() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rolling hillside terrain height function.
 * Keeps the flower meadow in the lower ~54% of the viewport so the p5.js
 * Van Gogh Starry Night sky shines above the undulating horizon.
 */
export function meadowHeight(x, z) {
  const slope = -0.11 * (z - 1.8);
  const hill1 = Math.sin(x * 0.32 + 0.5) * Math.cos(z * 0.28 - 0.2) * 0.34;
  const hill2 = Math.cos(x * 0.65 - z * 0.45) * 0.12;
  return slope + hill1 + hill2 - 0.88;
}

/**
 * Helper to append a parametric surface patch with vertex colors into geometry arrays.
 */
function addParametricPatch(buffers, segU, segV, evalFn) {
  const { positions, normals, colors, indices } = buffers;
  const baseVertex = positions.length / 3;
  const eps = 0.025;

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

function finalizeGeometry(buffers) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
  geo.setIndex(buffers.indices);
  return geo;
}

// ============================================================================
// SPECIES 1: BLUE ENDLESS SUMMER HYDRANGEA FLORET (蓝色无尽夏绣球四瓣小花)
// ============================================================================
function createHydrangeaFloretGeometry() {
  const buffers = { positions: [], normals: [], colors: [], indices: [] };
  const angles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];

  for (let p = 0; p < 4; p++) {
    const a = angles[p] + (p % 2 === 0 ? 0.04 : -0.04);
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const yOff = (p % 2) * 0.007;

    addParametricPatch(buffers, 6, 6, (u, v) => {
      const widthEnv = Math.pow(Math.sin(u * Math.PI), 0.62) * (0.94 + 0.16 * Math.sin(u * Math.PI * 0.8));
      const tipRound = 1 - 0.12 * v * v * smoothstep(0.65, 1.0, u);
      const len = (0.014 + u * 0.165) * tipRound;
      const wid = v * 0.138 * widthEnv;
      const cup = yOff + 0.032 * Math.sin(u * Math.PI * 0.85) - 0.022 * v * v * u;

      const x = cosA * len - sinA * wid;
      const z = sinA * len + cosA * wid;
      const y = cup;

      // Subtle root-to-tip luminance factor stored in vertex color (multiplied by instanceColor)
      const shade = 0.68 + 0.36 * smoothstep(0.08, 0.85, u) - 0.08 * Math.abs(v);
      const pearl = Math.exp(-u * u * 55.0) * 0.35;
      return {
        x,
        y,
        z,
        r: shade + pearl,
        g: shade + pearl,
        b: Math.min(1.15, shade * 1.05 + pearl)
      };
    });
  }
  return finalizeGeometry(buffers);
}

// ============================================================================
// SPECIES 2: VAN GOGH STARRY SUNFLOWER (梵高星夜向日葵 — 斐波那契花盘 + 双层金瓣)
// ============================================================================
function createSunflowerGeometry() {
  const buffers = { positions: [], normals: [], colors: [], indices: [] };

  // 1. Convex Seed Disc Center with golden pollen rim
  addParametricPatch(buffers, 8, 16, (u, v) => {
    const theta = (v + 1) * Math.PI;
    const r = (0.008 + u * 0.125);
    const domeY = 0.042 * (1 - u * u * 0.68) + 0.004 * Math.sin(u * 22.0);
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;

    const rim = smoothstep(0.68, 1.0, u);
    const seedRing = 0.5 + 0.5 * Math.sin(u * 26.0 + theta * 5.0);
    const cR = 0.36 + 0.58 * rim + 0.08 * seedRing;
    const cG = 0.20 + 0.48 * rim + 0.05 * seedRing;
    const cB = 0.05 + 0.10 * rim;
    return { x, y: domeY, z, r: cR, g: cG, b: cB };
  });

  // 2. 26 Double-Layer Golden Ray Florets
  const totalRays = 26;
  for (let i = 0; i < totalRays; i++) {
    const layer = i % 2;
    const a = (i / totalRays) * Math.PI * 2 + layer * 0.04;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const yBase = layer * 0.010;

    addParametricPatch(buffers, 7, 5, (u, v) => {
      const profile = Math.sin(u * Math.PI) * (1 - 0.22 * Math.pow(u, 1.6));
      const len = 0.115 + u * 0.205;
      const wid = v * 0.042 * profile;
      const arch = yBase + 0.034 * Math.sin(u * Math.PI * 0.85) - 0.024 * Math.pow(u, 2.1) - 0.008 * v * v;

      const x = cosA * len - sinA * wid;
      const z = sinA * len + cosA * wid;

      // Rich saffron-amber base -> brilliant chrome yellow tip
      const cR = 0.98 + 0.04 * u;
      const cG = 0.64 + 0.30 * smoothstep(0.05, 0.82, u) - 0.04 * Math.abs(v);
      const cB = 0.08 + 0.18 * smoothstep(0.5, 1.0, u);
      return { x, y: arch, z, r: cR, g: cG, b: cB };
    });
  }

  const geo = finalizeGeometry(buffers);
  // Tilt sunflower face forward & upward toward the viewer and moon
  geo.rotateX(0.58);
  return geo;
}

// ============================================================================
// SPECIES 3: VAN GOGH ROYAL IRIS (梵高紫蓝鸢尾花 — 3 直立内瓣 + 3 垂落金须外瓣)
// ============================================================================
function createIrisGeometry() {
  const buffers = { positions: [], normals: [], colors: [], indices: [] };

  // 3 Upright Standards (直立内拱瓣)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);

    addParametricPatch(buffers, 7, 6, (u, v) => {
      const widthEnv = Math.sin(u * Math.PI) * (0.85 + 0.25 * u);
      const radial = 0.035 + Math.sin(u * Math.PI * 0.78) * 0.14 * (1 - 0.32 * u);
      const wid = v * 0.095 * widthEnv;
      const ruffle = Math.sin(u * 12.0 + v * 4.0) * 0.008 * u;
      const height = 0.04 + u * 0.26 - 0.025 * v * v;

      const x = cosA * radial - sinA * wid;
      const z = sinA * radial + cosA * wid;
      const y = height + ruffle;

      // Luminous periwinkle-violet standards
      const cR = 0.38 + 0.22 * u;
      const cG = 0.36 + 0.28 * u;
      const cB = 0.92 + 0.08 * u;
      return { x, y, z, r: cR, g: cG, b: cB };
    });
  }

  // 3 Drooping Falls with Golden-White Beard Nectar Guides (垂落外瓣 + 金色花须)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);

    addParametricPatch(buffers, 8, 6, (u, v) => {
      const widthEnv = Math.pow(Math.sin(u * Math.PI), 0.72) * (0.75 + 0.45 * u);
      const radial = 0.04 + u * 0.25;
      const wid = v * 0.115 * widthEnv;
      const droop = 0.05 + 0.065 * Math.sin(u * Math.PI * 0.6) - 0.165 * Math.pow(u, 1.85) - 0.018 * v * v;

      const x = cosA * radial - sinA * wid;
      const z = sinA * radial + cosA * wid;
      const y = droop;

      // Golden beard along center strip (u < 0.55, |v| < 0.32)
      const beardMask = Math.exp(-v * v * 14.0) * smoothstep(0.62, 0.12, u);
      const baseR = 0.26 + 0.18 * (1 - u);
      const baseG = 0.20 + 0.18 * (1 - u);
      const baseB = 0.85 + 0.12 * (1 - u);

      const cR = baseR * (1 - beardMask) + 0.98 * beardMask;
      const cG = baseG * (1 - beardMask) + 0.84 * beardMask;
      const cB = baseB * (1 - beardMask) + 0.25 * beardMask;
      return { x, y, z, r: cR, g: cG, b: cB };
    });
  }

  return finalizeGeometry(buffers);
}

// ============================================================================
// SPECIES 4: VELVET GARDEN ROSE (丝绒庭园玫瑰 — 24 片黄金螺旋分层卷边花瓣)
// ============================================================================
function createRoseGeometry() {
  const buffers = { positions: [], normals: [], colors: [], indices: [] };
  const petalCount = 24;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < petalCount; i++) {
    const t = i / (petalCount - 1); // 0 = inner bud core -> 1 = outer reflexed petals
    const theta = i * goldenAngle;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    addParametricPatch(buffers, 7, 6, (u, v) => {
      const openAngle = 0.18 + t * 0.92;
      const baseR = 0.018 + t * 0.11;
      const petalH = 0.15 + t * 0.09;
      const widthEnv = Math.pow(Math.sin(u * Math.PI), 0.65) * (0.065 + t * 0.105);

      // Cupped body + outward reflex curl at outer petal lip
      const curlBack = smoothstep(0.68, 1.0, u) * (0.025 + t * 0.055) * (1 - 0.35 * v * v);
      const rLocal = baseR + u * petalH * Math.sin(openAngle) + curlBack - 0.022 * (1 - v * v) * Math.sin(u * Math.PI);
      const yLocal = u * petalH * Math.cos(openAngle) - t * 0.045 - curlBack * 0.45;
      const wLocal = v * widthEnv;

      const x = cosT * rLocal - sinT * wLocal;
      const z = sinT * rLocal + cosT * wLocal;
      const y = yLocal + 0.06;

      // Inner core is deeper velvet, outer petals are luminous soft blush (modulated by instanceColor)
      const depthShade = 0.62 + 0.38 * t + 0.16 * u;
      return {
        x,
        y,
        z,
        r: Math.min(1.12, depthShade * 1.05),
        g: depthShade * (0.78 + 0.18 * t),
        b: depthShade * (0.82 + 0.16 * t)
      };
    });
  }

  const geo = finalizeGeometry(buffers);
  geo.rotateX(0.24);
  return geo;
}

// ============================================================================
// SPECIES 5: MOONLIT TULIP (夜光郁金香 — 6 片酒杯状抱合花瓣)
// ============================================================================
function createTulipGeometry() {
  const buffers = { positions: [], normals: [], colors: [], indices: [] };

  for (let i = 0; i < 6; i++) {
    const inner = i % 2 === 0;
    const a = (i / 6) * Math.PI * 2;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);

    addParametricPatch(buffers, 7, 5, (u, v) => {
      const widthEnv = Math.pow(Math.sin(u * Math.PI), 0.68) * (inner ? 0.082 : 0.092);
      // Classic cupped tulip goblet profile: swells outward in middle, cups inward near top
      const cupRadius = (inner ? 0.024 : 0.032) + Math.sin(u * Math.PI * 0.82) * 0.105 - 0.015 * v * v;
      const y = u * 0.25 - 0.012 * v * v;
      const w = v * widthEnv;

      const x = cosA * cupRadius - sinA * w;
      const z = sinA * cupRadius + cosA * w;

      const glow = 0.66 + 0.38 * u;
      return { x, y, z, r: glow, g: glow * 0.94, b: Math.min(1.1, glow * 1.04) };
    });
  }

  const geo = finalizeGeometry(buffers);
  geo.rotateX(0.16);
  return geo;
}

// ============================================================================
// SPECIES 6: GYPSOPHILA (满天星 — 双层五瓣星云小花)
// ============================================================================
function createGypsophilaGeometry() {
  const buffers = { positions: [], normals: [], colors: [], indices: [] };
  const layers = [
    { petals: 5, len: 0.046, wid: 0.024, y: 0.010, rot: 0 },
    { petals: 5, len: 0.034, wid: 0.018, y: 0.020, rot: 0.62 }
  ];

  for (const layer of layers) {
    for (let p = 0; p < layer.petals; p++) {
      const a = (p / layer.petals) * Math.PI * 2 + layer.rot;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);

      addParametricPatch(buffers, 3, 2, (u, v) => {
        const w = v * layer.wid * Math.sin(u * Math.PI);
        const l = 0.005 + u * layer.len;
        const x = cosA * l - sinA * w;
        const z = sinA * l + cosA * w;
        const y = layer.y * u;
        return { x, y, z, r: 1.0, g: 1.0, b: 1.05 };
      });
    }
  }
  const geo = finalizeGeometry(buffers);
  geo.rotateX(0.32);
  return geo;
}

// ============================================================================
// FOLIAGE: BROAD LEAVES & SWORD GRASS BLADES
// ============================================================================
function createFoliageGeometry() {
  const buffers = { positions: [], normals: [], colors: [], indices: [] };
  addParametricPatch(buffers, 6, 4, (u, v) => {
    const profile = Math.sin(u * Math.PI);
    const x = v * 0.14 * profile;
    const z = -u * 0.52;
    const y = 0.08 * Math.sin(u * Math.PI * 0.75) - u * u * 0.12 - Math.abs(v) * 0.03;
    const g = 0.22 + 0.18 * u;
    return { x, y, z, r: 0.06 + 0.05 * u, g, b: 0.24 + 0.14 * u };
  });
  return finalizeGeometry(buffers);
}

function createSwordBladeGeometry() {
  const buffers = { positions: [], normals: [], colors: [], indices: [] };
  addParametricPatch(buffers, 6, 2, (u, v) => {
    const taper = 1 - Math.pow(u, 1.35);
    const x = v * 0.032 * taper;
    const y = u * 0.82;
    const z = -u * u * 0.20;
    return {
      x,
      y,
      z,
      r: 0.05 + 0.08 * u,
      g: 0.18 + 0.26 * u,
      b: 0.22 + 0.28 * u
    };
  });
  return finalizeGeometry(buffers);
}

const BOTANICAL_SWAY_GLSL = /* glsl */ `
  uniform float uTime;
  uniform vec3 uPointerWorld;
  uniform float uPointerActive;
  uniform vec4 uRipples[5];
  uniform float uFinaleProgress;

  float computeRippleBoost(vec3 worldPos) {
    float boost = 0.0;
    for (int i = 0; i < 5; i++) {
      float r = uRipples[i].w;
      if (r > 0.0) {
        float dist = length(worldPos.xz - uRipples[i].xz);
        float ring = exp(-pow((dist - r) * 1.8, 2.0));
        float fade = clamp(1.0 - r / 11.0, 0.0, 1.0);
        boost += ring * fade;
      }
    }
    return clamp(boost, 0.0, 1.25);
  }

  vec3 applyMeadowWind(vec3 worldPos, float swayWeight) {
    float w1 = sin(uTime * 1.35 + worldPos.x * 0.72 + worldPos.z * 0.52);
    float w2 = cos(uTime * 1.95 - worldPos.x * 0.42 + worldPos.z * 0.82);
    vec3 offset = vec3(w1 * 0.075 + w2 * 0.032, abs(w1) * -0.018, w2 * 0.055) * swayWeight;

    if (uPointerActive > 0.01) {
      vec2 toPlant = worldPos.xz - uPointerWorld.xz;
      float dist = length(toPlant);
      float influence = exp(-dist * dist * 0.62) * uPointerActive * swayWeight;
      vec2 dir = dist > 0.001 ? normalize(toPlant) : vec2(0.0, 1.0);
      offset.xz += dir * influence * 0.42;
      offset.y -= influence * 0.12;
    }
    return offset;
  }
`;

function createPainterlyFlowerMaterial(sharedUniforms, { swayWeight = 0.85, rimStrength = 0.42, emissiveBoost = 0.14 } = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: sharedUniforms.uTime,
      uPointerWorld: sharedUniforms.uPointerWorld,
      uPointerActive: sharedUniforms.uPointerActive,
      uRipples: sharedUniforms.uRipples,
      uFinaleProgress: sharedUniforms.uFinaleProgress,
      uSwayWeight: { value: swayWeight },
      uRimStrength: { value: rimStrength },
      uEmissiveBoost: { value: emissiveBoost }
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      uniform float uSwayWeight;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      varying float vRipple;

      ${BOTANICAL_SWAY_GLSL}

      void main() {
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

        world.xyz += applyMeadowWind(world.xyz, uSwayWeight);
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
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      varying float vRipple;

      void main() {
        vec3 N = length(vNormal) > 0.0001 ? normalize(vNormal) : vec3(0.0, 1.0, 0.0);
        vec3 V = normalize(vViewDir);
        if (dot(N, V) < 0.0) N = -N;

        vec3 moonL = normalize(vec3(0.38, 0.86, 0.42));
        vec3 fillL = normalize(vec3(-0.55, 0.45, 0.65));

        float upBias = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
        // Sculptural nocturnal contrast: deep petal folds + luminous moonlit crests
        float petalDepth = clamp(vColor.r * 0.35 + vColor.g * 0.45 + vColor.b * 0.2, 0.25, 1.1);
        float diff = (max(0.0, dot(N, moonL)) * 0.64 + max(0.0, dot(N, fillL)) * 0.22 + 0.14 + 0.12 * upBias) * (0.72 + 0.35 * petalDepth);
        float sss = pow(clamp(dot(-V, moonL) * 0.5 + 0.5, 0.0, 1.0), 2.6) * 0.18;
        float fresnel = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.8);

        vec3 col = vColor * (diff + uEmissiveBoost) + vColor * sss;
        vec3 rimTint = mix(vec3(0.42, 0.82, 1.0), vec3(1.0, 0.88, 0.48), 0.35);
        col += rimTint * fresnel * (uRimStrength + 0.22 * uFinaleProgress + vRipple * 0.52);
        col += vec3(0.38, 0.85, 1.0) * vRipple * 0.38;

        // Subtle atmospheric distance harmony with Van Gogh cobalt night
        float distFade = smoothstep(6.0, 19.0, length(vWorldPos.xz));
        col = mix(col, vec3(0.02, 0.055, 0.16), distFade * 0.62);

        // Balanced painterly gamma for rich nocturnal saturation without washing out shadows
        col = pow(clamp(col, 0.0, 1.25), vec3(1.0 / 1.52));

        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
}

export function createMeadowScene(canvas, { eggs = [], onEggTrigger = () => {}, onRipple = () => {}, onStatus = () => {} } = {}) {
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x000000, 0); // Transparent so p5.js Van Gogh Starry Night shines above!

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 80);
  const cameraBase = new THREE.Vector3(0, 1.78, 6.75);
  const cameraLookBase = new THREE.Vector3(0, 0.72, -2.2);
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

  function spawnRipple(x = 0, y = meadowHeight(0, 1.6), z = 1.6) {
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

  const rng = createRng(20261109);
  const dummy = new THREE.Object3D();
  const upVec = new THREE.Vector3(0, 1, 0);
  const normalVec = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const spinQuat = new THREE.Quaternion();
  const colorTmp = new THREE.Color();

  // ============================================================================
  // 1. ROLLING HILLSIDE TERRAIN (Lower Half of Composition)
  // ============================================================================
  const terrainGeo = new THREE.PlaneGeometry(34, 18, 84, 54);
  terrainGeo.rotateX(-Math.PI * 0.5);
  terrainGeo.translate(0, 0, -1.8);
  const tPos = terrainGeo.attributes.position;
  for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i);
    const z = tPos.getZ(i);
    tPos.setY(i, meadowHeight(x, z));
  }
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: sharedUniforms.uTime,
      uPointerWorld: sharedUniforms.uPointerWorld,
      uPointerActive: sharedUniforms.uPointerActive,
      uRipples: sharedUniforms.uRipples,
      uFinaleProgress: sharedUniforms.uFinaleProgress
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      ${BOTANICAL_SWAY_GLSL}

      void main() {
        vec3 deepMeadow = vec3(0.022, 0.058, 0.135);
        vec3 mossStroke = vec3(0.042, 0.128, 0.215);
        float brush = sin(vWorldPos.x * 1.4 + cos(vWorldPos.z * 1.2 + uTime * 0.2)) * 0.5 + 0.5;
        vec3 col = mix(deepMeadow, mossStroke, brush * 0.72);

        float ripple = computeRippleBoost(vWorldPos);
        col += mix(vec3(0.22, 0.72, 1.0), vec3(0.98, 0.85, 0.35), 0.4) * ripple * 0.48;

        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  scene.add(terrainMesh);

  // ============================================================================
  // 2. MULTI-SPECIES BOTANICAL MEADOW PLACEMENT
  // ============================================================================
  const flowerMat = createPainterlyFlowerMaterial(sharedUniforms, { swayWeight: 0.88, rimStrength: 0.34, emissiveBoost: 0.04 });
  const leafMat = createPainterlyFlowerMaterial(sharedUniforms, { swayWeight: 0.62, rimStrength: 0.14, emissiveBoost: 0.01 });
  const gypMat = createPainterlyFlowerMaterial(sharedUniforms, { swayWeight: 1.05, rimStrength: 0.48, emissiveBoost: 0.28 });

  // --- A. BLUE ENDLESS SUMMER HYDRANGEA CLUSTERS (26 Lush Mounds, ~3,100 Florets) ---
  const hydrangeaMounds = [
    // Egg #1 anchor mound at [-3.7, z=2.3]
    { x: -3.7, z: 2.3, r: 0.72, florets: 130, palette: ['#38bdf8', '#7dd3fc', '#818cf8', '#c084fc'] },
    { x: -4.6, z: 1.5, r: 0.62, florets: 115, palette: ['#2563eb', '#38bdf8', '#60a5fa', '#818cf8'] },
    { x: -2.6, z: 2.8, r: 0.58, florets: 110, palette: ['#60a5fa', '#7dd3fc', '#a855f7', '#38bdf8'] }
  ];

  for (let i = 0; i < 23; i++) {
    const row = Math.floor(i / 6);
    const col = i % 6;
    const z = 3.5 - row * 2.1 + (rng() - 0.5) * 0.8;
    const x = ((col / 5) - 0.5) * (11.5 + row * 1.4) + (rng() - 0.5) * 1.1;
    const r = 0.50 + rng() * 0.24;
    hydrangeaMounds.push({
      x,
      z,
      r,
      florets: Math.round(105 + rng() * 25),
      palette: i % 2 === 0
        ? ['#38bdf8', '#60a5fa', '#7dd3fc', '#6366f1']
        : ['#6366f1', '#8b5cf6', '#38bdf8', '#a855f7']
    });
  }

  const totalHydrangeaFlorets = hydrangeaMounds.reduce((s, m) => s + m.florets, 0);
  const hydrangeaGeo = createHydrangeaFloretGeometry();
  const hydrangeaInstanced = new THREE.InstancedMesh(hydrangeaGeo, flowerMat, totalHydrangeaFlorets);

  let hIdx = 0;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (const mound of hydrangeaMounds) {
    const gy = meadowHeight(mound.x, mound.z);
    const cy = gy + mound.r * 0.70 + 0.12;
    const cols = mound.palette.map(hex => new THREE.Color(hex));

    for (let j = 0; j < mound.florets; j++) {
      const t = j / mound.florets;
      const inc = Math.acos(1 - t * 0.82);
      const az = j * goldenAngle + rng() * 0.1;
      const nx = Math.sin(inc) * Math.cos(az);
      const ny = Math.cos(inc);
      const nz = Math.sin(inc) * Math.sin(az);
      const rad = mound.r * (0.92 + 0.1 * Math.sin(j * 1.7));

      dummy.position.set(mound.x + nx * rad, cy + ny * rad * 0.85, mound.z + nz * rad);
      normalVec.set(nx, ny * 1.15, nz).normalize();
      quat.setFromUnitVectors(upVec, normalVec);
      spinQuat.setFromAxisAngle(upVec, rng() * Math.PI * 2);
      quat.multiply(spinQuat);
      dummy.quaternion.copy(quat);
      dummy.scale.setScalar((0.92 + rng() * 0.28) * (mound.r / 0.65));
      dummy.updateMatrix();
      hydrangeaInstanced.setMatrixAt(hIdx, dummy.matrix);

      colorTmp.copy(cols[j % cols.length]).lerp(cols[(j + 1) % cols.length], t);
      hydrangeaInstanced.setColorAt(hIdx, colorTmp);
      hIdx++;
    }
  }
  hydrangeaInstanced.instanceMatrix.needsUpdate = true;
  if (hydrangeaInstanced.instanceColor) hydrangeaInstanced.instanceColor.needsUpdate = true;
  scene.add(hydrangeaInstanced);

  // --- B. VAN GOGH STARRY SUNFLOWERS (32 Sculpted Golden Sunflowers) ---
  const sunflowerGeo = createSunflowerGeometry();
  const sunflowerCount = 32;
  const sunflowerInstanced = new THREE.InstancedMesh(sunflowerGeo, flowerMat, sunflowerCount);
  const stemPoints = [];

  const sunflowerCoords = [
    // Egg #2 Anchor Sunflower Cluster at [-1.45, z=1.1]
    { x: -1.45, z: 1.1, scale: 0.96, height: 0.98, yaw: 0.14 },
    { x: -1.85, z: 1.35, scale: 0.84, height: 0.84, yaw: 0.26 },
    { x: -1.05, z: 1.28, scale: 0.80, height: 0.78, yaw: -0.12 }
  ];
  for (let i = 3; i < sunflowerCount; i++) {
    const x = (rng() - 0.5) * 13.5;
    const z = 3.1 - rng() * 8.5;
    sunflowerCoords.push({
      x,
      z,
      scale: 0.65 + rng() * 0.28,
      height: 0.62 + rng() * 0.44,
      yaw: (rng() - 0.5) * 0.52
    });
  }

  const sunTints = [new THREE.Color('#ffffff'), new THREE.Color('#fef08a'), new THREE.Color('#fde047')];
  for (let i = 0; i < sunflowerCount; i++) {
    const sc = sunflowerCoords[i];
    const gy = meadowHeight(sc.x, sc.z);
    const topY = gy + sc.height;
    dummy.position.set(sc.x, topY, sc.z);
    dummy.rotation.set(0, sc.yaw, (rng() - 0.5) * 0.16);
    dummy.scale.setScalar(sc.scale);
    dummy.updateMatrix();
    sunflowerInstanced.setMatrixAt(i, dummy.matrix);
    sunflowerInstanced.setColorAt(i, sunTints[i % sunTints.length]);

    stemPoints.push(new THREE.Vector3(sc.x, gy, sc.z), new THREE.Vector3(sc.x, topY - 0.04, sc.z));
  }
  sunflowerInstanced.instanceMatrix.needsUpdate = true;
  if (sunflowerInstanced.instanceColor) sunflowerInstanced.instanceColor.needsUpdate = true;
  scene.add(sunflowerInstanced);

  // --- C. VAN GOGH ROYAL IRISES (56 Sculpted Irises) ---
  const irisGeo = createIrisGeometry();
  const irisCount = 56;
  const irisInstanced = new THREE.InstancedMesh(irisGeo, flowerMat, irisCount);
  const irisCoords = [
    // Egg #4 Anchor Iris & Tulip Drift at [3.35, z=2.05]
    { x: 3.35, z: 2.05, scale: 1.22, height: 0.88, tint: '#a855f7' },
    { x: 3.75, z: 1.82, scale: 1.12, height: 0.78, tint: '#818cf8' },
    { x: 2.95, z: 2.25, scale: 1.08, height: 0.74, tint: '#6366f1' }
  ];
  const irisTints = ['#818cf8', '#a855f7', '#60a5fa', '#c084fc'];
  for (let i = 3; i < irisCount; i++) {
    const x = (rng() - 0.5) * 14.0;
    const z = 3.6 - rng() * 9.0;
    irisCoords.push({
      x,
      z,
      scale: 0.85 + rng() * 0.36,
      height: 0.58 + rng() * 0.38,
      tint: irisTints[i % irisTints.length]
    });
  }

  for (let i = 0; i < irisCount; i++) {
    const ic = irisCoords[i];
    const gy = meadowHeight(ic.x, ic.z);
    const topY = gy + ic.height;
    dummy.position.set(ic.x, topY, ic.z);
    dummy.rotation.set((rng() - 0.5) * 0.14, rng() * Math.PI * 2, (rng() - 0.5) * 0.14);
    dummy.scale.setScalar(ic.scale);
    dummy.updateMatrix();
    irisInstanced.setMatrixAt(i, dummy.matrix);
    irisInstanced.setColorAt(i, new THREE.Color(ic.tint));

    stemPoints.push(new THREE.Vector3(ic.x, gy, ic.z), new THREE.Vector3(ic.x, topY, ic.z));
  }
  irisInstanced.instanceMatrix.needsUpdate = true;
  if (irisInstanced.instanceColor) irisInstanced.instanceColor.needsUpdate = true;
  scene.add(irisInstanced);

  // --- D. VELVET GARDEN ROSES (64 Multi-Layer Cupped Roses) ---
  const roseGeo = createRoseGeometry();
  const roseCount = 64;
  const roseInstanced = new THREE.InstancedMesh(roseGeo, flowerMat, roseCount);
  const rosePalettes = ['#fb7185', '#f43f5e', '#f472b6', '#fda4af', '#fcd34d', '#c084fc'];

  const roseCoords = [
    // Frame Egg #3 (Wish Bottle at [0.25, z=2.75]) with romantic velvet roses
    { x: -0.22, z: 2.82, scale: 1.18, height: 0.56, tint: '#fb7185' },
    { x: 0.72, z: 2.68, scale: 1.15, height: 0.54, tint: '#f472b6' },
    { x: 0.12, z: 2.32, scale: 1.10, height: 0.62, tint: '#fda4af' }
  ];
  for (let i = 3; i < roseCount; i++) {
    const x = (rng() - 0.5) * 13.5;
    const z = 3.8 - rng() * 8.8;
    roseCoords.push({
      x,
      z,
      scale: 0.82 + rng() * 0.38,
      height: 0.42 + rng() * 0.36,
      tint: rosePalettes[i % rosePalettes.length]
    });
  }

  for (let i = 0; i < roseCount; i++) {
    const rc = roseCoords[i];
    const gy = meadowHeight(rc.x, rc.z);
    const topY = gy + rc.height;
    dummy.position.set(rc.x, topY, rc.z);
    dummy.rotation.set((rng() - 0.5) * 0.22, rng() * Math.PI * 2, (rng() - 0.5) * 0.22);
    dummy.scale.setScalar(rc.scale);
    dummy.updateMatrix();
    roseInstanced.setMatrixAt(i, dummy.matrix);
    roseInstanced.setColorAt(i, new THREE.Color(rc.tint));

    stemPoints.push(new THREE.Vector3(rc.x, gy, rc.z), new THREE.Vector3(rc.x, topY, rc.z));
  }
  roseInstanced.instanceMatrix.needsUpdate = true;
  if (roseInstanced.instanceColor) roseInstanced.instanceColor.needsUpdate = true;
  scene.add(roseInstanced);

  // --- E. MOONLIT TULIPS (72 Graceful Cupped Tulips) ---
  const tulipGeo = createTulipGeometry();
  const tulipCount = 72;
  const tulipInstanced = new THREE.InstancedMesh(tulipGeo, flowerMat, tulipCount);
  const tulipPalettes = ['#f472b6', '#e879f9', '#38bdf8', '#fb923c', '#fde047', '#a855f7'];

  for (let i = 0; i < tulipCount; i++) {
    const x = i < 4 ? 3.15 + (i - 1.5) * 0.35 : (rng() - 0.5) * 14.0;
    const z = i < 4 ? 2.15 + (i % 2) * 0.25 : 3.9 - rng() * 9.2;
    const gy = meadowHeight(x, z);
    const h = 0.45 + rng() * 0.38;
    dummy.position.set(x, gy + h, z);
    dummy.rotation.set((rng() - 0.5) * 0.2, rng() * Math.PI * 2, (rng() - 0.5) * 0.2);
    dummy.scale.setScalar(0.85 + rng() * 0.35);
    dummy.updateMatrix();
    tulipInstanced.setMatrixAt(i, dummy.matrix);
    tulipInstanced.setColorAt(i, new THREE.Color(tulipPalettes[i % tulipPalettes.length]));

    stemPoints.push(new THREE.Vector3(x, gy, z), new THREE.Vector3(x, gy + h, z));
  }
  tulipInstanced.instanceMatrix.needsUpdate = true;
  if (tulipInstanced.instanceColor) tulipInstanced.instanceColor.needsUpdate = true;
  scene.add(tulipInstanced);

  // Flower Stems LineSegments
  const stemGeo = new THREE.BufferGeometry().setFromPoints(stemPoints);
  const stemMat = new THREE.LineBasicMaterial({ color: 0x154e4b, transparent: true, opacity: 0.78 });
  scene.add(new THREE.LineSegments(stemGeo, stemMat));

  // --- F. GYPSOPHILA (满天星) STAR-CLOUD SPRAYS WEAVING THROUGH ALL FLOWERS (5,200 Blossoms) ---
  const gypCount = 5200;
  const gypGeo = createGypsophilaGeometry();
  const gypInstanced = new THREE.InstancedMesh(gypGeo, gypMat, gypCount);
  const gypTints = [
    new THREE.Color('#ffffff'),
    new THREE.Color('#e0f2fe'),
    new THREE.Color('#bae6fd'),
    new THREE.Color('#fef9c3'),
    new THREE.Color('#ddd6fe')
  ];

  for (let i = 0; i < gypCount; i++) {
    let gx, gz, gy;
    if (i < 3200) {
      // Weave around the hydrangea mounds
      const m = hydrangeaMounds[i % hydrangeaMounds.length];
      const ang = rng() * Math.PI * 2;
      const dist = m.r * (0.82 + rng() * 0.85);
      gx = m.x + Math.cos(ang) * dist;
      gz = m.z + Math.sin(ang) * dist;
      gy = meadowHeight(gx, gz) + 0.16 + rng() * (m.r * 1.05 + 0.24);
    } else {
      // Scatter starry gypsophila drifts across the whole multi-flower meadow
      gx = (rng() - 0.5) * 14.5;
      gz = 4.0 - rng() * 9.5;
      gy = meadowHeight(gx, gz) + 0.14 + rng() * 0.52;
    }

    dummy.position.set(gx, gy, gz);
    dummy.rotation.set((rng() - 0.5) * 0.7, rng() * Math.PI * 2, (rng() - 0.5) * 0.7);
    dummy.scale.setScalar(0.36 + rng() * 0.38);
    dummy.updateMatrix();
    gypInstanced.setMatrixAt(i, dummy.matrix);
    gypInstanced.setColorAt(i, gypTints[i % gypTints.length]);
  }
  gypInstanced.instanceMatrix.needsUpdate = true;
  if (gypInstanced.instanceColor) gypInstanced.instanceColor.needsUpdate = true;
  scene.add(gypInstanced);

  // --- G. BROAD LEAVES & SWORD GRASS BLADES ---
  const broadLeafGeo = createFoliageGeometry();
  const totalBroadLeaves = 720;
  const broadLeafInstanced = new THREE.InstancedMesh(broadLeafGeo, leafMat, totalBroadLeaves);
  for (let i = 0; i < totalBroadLeaves; i++) {
    const m = hydrangeaMounds[i % hydrangeaMounds.length];
    const ang = rng() * Math.PI * 2;
    const dist = m.r * (0.65 + rng() * 0.65);
    const lx = m.x + Math.cos(ang) * dist;
    const lz = m.z + Math.sin(ang) * dist;
    const ly = meadowHeight(lx, lz) + 0.12 + (i % 3) * 0.08;
    dummy.position.set(lx, ly, lz);
    dummy.rotation.set(0.18 + rng() * 0.25, -ang + Math.PI * 0.5, (rng() - 0.5) * 0.2);
    dummy.scale.setScalar(0.8 + rng() * 0.45);
    dummy.updateMatrix();
    broadLeafInstanced.setMatrixAt(i, dummy.matrix);
  }
  broadLeafInstanced.instanceMatrix.needsUpdate = true;
  scene.add(broadLeafInstanced);

  const bladeGeo = createSwordBladeGeometry();
  const totalBlades = 2400;
  const bladeInstanced = new THREE.InstancedMesh(bladeGeo, leafMat, totalBlades);
  for (let i = 0; i < totalBlades; i++) {
    const bx = (rng() - 0.5) * 20;
    const bz = 4.4 - rng() * 12.5;
    const by = meadowHeight(bx, bz);
    dummy.position.set(bx, by, bz);
    dummy.rotation.set(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.22);
    dummy.scale.set(0.8 + rng() * 0.5, 0.55 + rng() * 0.75, 1);
    dummy.updateMatrix();
    bladeInstanced.setMatrixAt(i, dummy.matrix);
  }
  bladeInstanced.instanceMatrix.needsUpdate = true;
  scene.add(bladeInstanced);

  // ============================================================================
  // 3. FIVE INTERACTIVE EASTER EGG TARGETS + FIREFLIES IN THE MEADOW
  // ============================================================================
  const eggNodes = new Map();
  const raycastTargets = [];

  for (const egg of eggs) {
    const [ex, ey, ez] = egg.position;
    const worldY = egg.kind === 'meteor' ? ey : meadowHeight(ex, ez) + 0.52;
    const anchor = new THREE.Vector3(ex, worldY, ez);
    const eggGroup = new THREE.Group();
    eggGroup.position.copy(anchor);
    scene.add(eggGroup);

    // Subtle ground aura ring for meadow eggs
    const ringGeo = new THREE.RingGeometry(0.56, 0.66, 40);
    ringGeo.rotateX(-Math.PI * 0.5);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(egg.color || '#7dd3fc'),
      transparent: true,
      opacity: egg.kind === 'meteor' ? 0.0 : 0.35,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = -0.25;
    eggGroup.add(ringMesh);

    if (egg.kind === 'bottle') {
      // Egg #3: Crystal Star-Sand Wish Bottle nestled among Velvet Roses & Gypsophila
      const bottleGroup = new THREE.Group();
      bottleGroup.rotation.z = 0.36;
      bottleGroup.rotation.x = 0.14;

      const glassMat = new THREE.MeshBasicMaterial({
        color: 0xbae6fd,
        transparent: true,
        opacity: 0.62,
        blending: THREE.AdditiveBlending
      });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.52, 20), glassMat);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.18, 16), glassMat);
      neck.position.y = 0.32;
      const scroll = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.32, 14),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      bottleGroup.add(body, neck, scroll);
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

  // --- 180 Bioluminescent Fireflies Dancing Through the Multi-Species Flowers ---
  const fireflyCount = 180;
  const ffPos = new Float32Array(fireflyCount * 3);
  const ffSeed = new Float32Array(fireflyCount * 4);
  const ffColor = new Float32Array(fireflyCount * 3);

  for (let i = 0; i < fireflyCount; i++) {
    const fx = (rng() - 0.5) * 16;
    const fz = 4.0 - rng() * 10;
    const fy = meadowHeight(fx, fz) + 0.28 + rng() * 1.85;
    ffPos[i * 3] = fx;
    ffPos[i * 3 + 1] = fy;
    ffPos[i * 3 + 2] = fz;

    ffSeed[i * 4] = rng() * Math.PI * 2;
    ffSeed[i * 4 + 1] = 0.65 + rng() * 1.35;
    ffSeed[i * 4 + 2] = 0.22 + rng() * 0.28;
    ffSeed[i * 4 + 3] = rng();

    const col = new THREE.Color(i % 2 === 0 ? '#fde047' : '#67e8f9');
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
        p.x += sin(t * 1.1) * 0.48 + cos(t * 0.5) * 0.22;
        p.y += sin(t * 1.5) * 0.28 + uFinaleProgress * (0.9 + aSeed.w * 2.2);
        p.z += cos(t * 0.9) * 0.48;
        vPulse = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(t * 2.4), 2.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (15.0 + 11.0 * vPulse) * aSeed.z * uPixelRatio * (16.0 / max(2.5, -mv.z));
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vPulse;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float glow = exp(-d * d * 18.0) * vPulse;
        if (glow < 0.02) discard;
        gl_FragColor = vec4(vColor * 1.2, clamp(glow, 0.0, 1.0));
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
        parallaxOffset.x * 1.1 + dragYaw * 2.0,
        1.02 + parallaxOffset.y * 0.22 + dragPitch * 0.5,
        4.1
      );
      cameraTargetLook.set(
        parallaxOffset.x * 0.6 + dragYaw * 2.5,
        0.48 + dragPitch * 0.7,
        -1.0
      );
    } else {
      cameraTargetPos.set(
        cameraBase.x + parallaxOffset.x * 1.25 + dragYaw * 2.4,
        cameraBase.y + parallaxOffset.y * 0.30 + dragPitch * 0.65,
        cameraBase.z
      );
      cameraTargetLook.set(
        cameraLookBase.x + parallaxOffset.x * 0.75 + dragYaw * 3.1,
        cameraLookBase.y + parallaxOffset.y * 0.38 + dragPitch * 0.9,
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
        if (ripples[i].w > 11.0) ripples[i].w = -1;
      }
    }

    finaleProgress += (targetFinale - finaleProgress) * Math.min(1, dt * 1.8);
    sharedUniforms.uFinaleProgress.value = finaleProgress;

    const t = sharedUniforms.uTime.value;
    for (const node of eggNodes.values()) {
      if (node.egg.kind === 'meteor') continue;
      const pulse = 0.8 + 0.2 * Math.sin(t * 2.5 + node.egg.order);
      node.hintPulse = Math.max(0, node.hintPulse - dt * 1.4);
      node.ringMesh.scale.setScalar(pulse * (1 + node.hintPulse * 0.4));
      node.ringMesh.material.opacity = (node.unlocked ? 0.18 : 0.38) * pulse + node.hintPulse * 0.25;
    }

    updateCameraTargets(nowMs);
    cameraCurrentPos.lerp(cameraTargetPos, Math.min(1, dt * 4.5));
    cameraCurrentLook.lerp(cameraTargetLook, Math.min(1, dt * 4.5));
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

    spawnRipple(0, meadowHeight(0, 1.5), 1.5);
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
    const padX = width < 600 ? 78 : 118;
    const padTop = height < 600 ? 96 : 112;
    const padBottom = height < 600 ? 96 : 108;
    const result = [];
    const proj = new THREE.Vector3();

    for (const node of eggNodes.values()) {
      proj.copy(node.anchor).project(camera);
      const rawX = (proj.x * 0.5 + 0.5) * width;
      const rawY = (-proj.y * 0.5 + 0.5) * height;
      const visible = proj.z > -1 && proj.z < 1 && rawX >= -60 && rawX <= width + 60 && rawY >= -60 && rawY <= height + 60;
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
        spawnRipple(0, meadowHeight(0, 1.5), 1.5);
      }
    },
    triggerFinaleState() {
      targetFinale = 1;
      spawnRipple(0, meadowHeight(0, 1.5), 1.5);
    },
    getDiagnostics() {
      return {
        engine: 'three.js',
        ready: !disposed,
        renderCount,
        species: ['hydrangea', 'sunflower', 'iris', 'rose', 'tulip', 'gypsophila'],
        counts: {
          hydrangeaFlorets: totalHydrangeaFlorets,
          sunflowers: sunflowerCount,
          irises: irisCount,
          roses: roseCount,
          tulips: tulipCount,
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
      cancelAnimationFrame(rafId);
      renderer.dispose();
    }
  };
}

export default createMeadowScene;
