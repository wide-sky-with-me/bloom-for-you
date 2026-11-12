import * as THREE from 'three';
import {
  createBotanicalTextures,
  createRoseBloomGeometry,
  createHydrangeaFloretGeometry,
  createSunflowerDiscGeometry,
  createSunflowerRaysGeometry,
  createIrisBloomGeometry,
  createTulipBloomGeometry,
  createGypsophilaClusterGeometry,
  createBroadLeafGeometry,
  createCurvedStemGeometry,
  createSwordLeafGeometry,
  createGrassBladeGeometry
} from './botanical-assets.js';
import {
  createFairyExplorer,
  createFairytaleWorldProps,
  loadFairytaleGlb
} from './fairytale-props.js';

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

// ============================================================================
// 1. WINDING FAIRYTALE PATH, HILLTOP VILLA TERRACE & ROLLING KNOLL TOPOGRAPHY
// ============================================================================
export const VILLA_CENTER = { x: -1.25, z: -5.85, rotY: 0.16 };
const VILLA_COS = Math.cos(VILLA_CENTER.rotY);
const VILLA_SIN = Math.sin(VILLA_CENTER.rotY);

export function worldToVillaLocal(x, z) {
  const dx = x - VILLA_CENTER.x;
  const dz = z - VILLA_CENTER.z;
  return {
    lx: dx * VILLA_COS - dz * VILLA_SIN,
    lz: dx * VILLA_SIN + dz * VILLA_COS
  };
}

export function villaLocalToWorld(lx, ly, lz) {
  return [
    VILLA_CENTER.x + lx * VILLA_COS + lz * VILLA_SIN,
    VILLA_TERRACE_Y + ly,
    VILLA_CENTER.z - lx * VILLA_SIN + lz * VILLA_COS
  ];
}

export function isInsideVillaFootprint(x, z, margin = 0) {
  const { lx, lz } = worldToVillaLocal(x, z);
  const inMain = Math.abs(lx) <= 2.42 + margin && lz >= -1.68 - margin && lz <= 1.88 + margin;
  const inSteps = lx >= -0.48 - margin && lx <= 0.82 + margin && lz >= 1.72 - margin && lz <= 2.52 + margin;
  return inMain || inSteps;
}

const RAW_PATH_WAYPOINTS = [
  [0.52, 5.85],
  [-0.78, 3.65],
  [0.24, 1.75],
  [1.32, -0.45],
  [-0.18, -2.05],
  [-0.71, -3.52]
];

const PATH_CURVE_2D = new THREE.CatmullRomCurve3(
  RAW_PATH_WAYPOINTS.map(([x, z]) => new THREE.Vector3(x, 0, z))
);

// Sample 15 polyline nodes for ultra-fast exact path distance in both JS and GLSL!
const PATH_POLY = Array.from({ length: 15 }, (_, i) => {
  const p = PATH_CURVE_2D.getPointAt(i / 14);
  return [p.x, p.z];
});

export function distToPath(x, z) {
  let minD2 = 1e9;
  for (let i = 0; i < PATH_POLY.length - 1; i++) {
    const [ax, az] = PATH_POLY[i];
    const [bx, bz] = PATH_POLY[i + 1];
    const vx = bx - ax;
    const vz = bz - az;
    const wx = x - ax;
    const wz = z - az;
    const len2 = vx * vx + vz * vz + 1e-8;
    const t = clamp((wx * vx + wz * vz) / len2, 0, 1);
    const dx = wx - vx * t;
    const dz = wz - vz * t;
    const d2 = dx * dx + dz * dz;
    if (d2 < minD2) minD2 = d2;
  }
  return Math.sqrt(minD2);
}

function rawMeadowHeight(x, z) {
  // Gentle valley rise from foreground (+5.5) toward distant Saint-Rémy hills (-8.5)
  const valleyRise = -0.108 * (z - 2.3) - 1.02;

  // Distinct sculpted fairytale grassy knolls & terraced earthen mounds ("土坡")
  const leftHydrangeaKnoll = 0.48 * Math.exp(-(((x + 2.65) ** 2) / 3.9 + ((z - 1.65) ** 2) / 4.4));
  const rightTerracedSlope = 0.64 * Math.exp(-(((x - 2.65) ** 2) / 4.6 + ((z - 0.45) ** 2) / 5.4))
    + 0.22 * smoothstep(1.25, 1.95, x) * Math.exp(-((z - 1.35) ** 2) / 8.5);
  const sunflowerSlopeBank = 0.38 * Math.exp(-(((x + 1.45) ** 2) / 3.4 + ((z + 1.95) ** 2) / 3.2));
  const cottageHilltop = 0.72 * Math.exp(-(((x + 1.25) ** 2) / 11.5 + ((z + 5.65) ** 2) / 9.2));
  const dandelionMound = 0.34 * Math.exp(-(((x - 1.55) ** 2) / 3.6 + ((z + 2.15) ** 2) / 4.0));
  const softRoll = Math.sin(x * 0.45 + 0.3) * Math.cos(z * 0.38 - 0.2) * 0.08;

  // Worn earthen footpath depression + subtle raised grassy verge banks along both sides!
  const dPath = distToPath(x, z);
  const pathHollow = -0.072 * Math.exp(-(dPath * dPath) / 0.18);
  const pathShoulder = 0.036 * Math.exp(-(((dPath - 0.68) ** 2) / 0.09));

  // Shallow basin for the Starlight Dew Pond & Frog Prince at [-1.48, 0.85]
  const dPond = Math.hypot(x + 1.48, z - 0.85);
  const pondBasin = -0.068 * Math.exp(-(dPond * dPond) / 0.42);

  return (
    valleyRise
    + leftHydrangeaKnoll
    + rightTerracedSlope
    + sunflowerSlopeBank
    + cottageHilltop
    + dandelionMound
    + softRoll
    + pathHollow
    + pathShoulder
    + pondBasin
  );
}

export const VILLA_TERRACE_Y = rawMeadowHeight(VILLA_CENTER.x, VILLA_CENTER.z);

/**
 * Fairytale Grassland, Rolling Knolls & Level Hilltop Villa Garden Terrace ("起伏草坡与山丘庭院平台")
 */
export function meadowHeight(x, z) {
  const baseH = rawMeadowHeight(x, z);
  const { lx, lz } = worldToVillaLocal(x, z);
  const wx = 1.0 - smoothstep(2.45, 3.45, Math.abs(lx));
  const wzBack = smoothstep(-2.65, -1.75, lz);
  const wzFront = 1.0 - smoothstep(2.40, 3.35, lz);
  const wTerrace = wx * wzBack * wzFront;
  return baseH * (1.0 - wTerrace) + VILLA_TERRACE_Y * wTerrace;
}

// ============================================================================
// 2. SHARED WIND, DYNAMIC FAIRY LANTERN & BOTANICAL SUBSURFACE SHADERS
// ============================================================================
const SHARED_WORLD_GLSL = /* glsl */ `
  uniform float uTime;
  uniform vec3 uPointerWorld;
  uniform float uPointerActive;
  uniform vec3 uFairyLightPos;
  uniform vec3 uLampPos[3];
  uniform vec4 uRipples[5];

  float computeRippleBoost(vec3 worldPos) {
    float boost = 0.0;
    for (int i = 0; i < 5; i++) {
      float r = uRipples[i].w;
      if (r > 0.0) {
        float dist = length(worldPos.xz - uRipples[i].xz);
        float ring = exp(-pow((dist - r) * 1.85, 2.0));
        float fade = clamp(1.0 - r / 12.0, 0.0, 1.0);
        boost += ring * fade;
      }
    }
    return clamp(boost, 0.0, 1.35);
  }

  vec3 computeWarmFairytaleLights(vec3 worldPos, vec3 N, out float backScatter) {
    backScatter = 0.0;
    vec3 accum = vec3(0.0);

    // 1. Exploring Fairy Sprite's warm golden star-lantern!
    vec3 toFairy = uFairyLightPos - worldPos;
    float dFairy = length(toFairy);
    vec3 lDirF = dFairy > 0.001 ? toFairy / dFairy : vec3(0.0, 1.0, 0.0);
    float attenF = 1.0 / (1.0 + dFairy * dFairy * 0.62) * smoothstep(4.6, 0.4, dFairy);
    float wrapF = clamp((dot(N, lDirF) + 0.55) / 1.55, 0.0, 1.0);
    accum += vec3(1.05, 0.80, 0.36) * attenF * wrapF * 1.28;
    backScatter += attenF * 0.85;

    // 2. Three wrought-iron path streetlamps casting cozy golden pools along the lane
    for (int i = 0; i < 3; i++) {
      vec3 toLamp = uLampPos[i] - worldPos;
      float dL = length(toLamp);
      vec3 lDir = dL > 0.001 ? toLamp / dL : vec3(0.0, 1.0, 0.0);
      float atten = 1.0 / (1.0 + dL * dL * 0.72) * smoothstep(4.2, 0.5, dL);
      float wrap = clamp((dot(N, lDir) + 0.50) / 1.50, 0.0, 1.0);
      accum += vec3(1.0, 0.76, 0.34) * atten * wrap * 0.82;
      backScatter += atten * 0.45;
    }
    return accum;
  }

  vec3 applyMeadowWind(vec3 worldPos, float swayFactor) {
    float gust = sin(uTime * 1.15 + worldPos.x * 0.58 + worldPos.z * 0.46);
    float eddy = cos(uTime * 1.68 - worldPos.x * 0.35 + worldPos.z * 0.72);
    vec3 offset = vec3(
      gust * 0.058 + eddy * 0.024,
      -abs(gust) * 0.012,
      eddy * 0.042
    ) * swayFactor;

    // Gentle grass/flower parting around user's pointer
    if (uPointerActive > 0.01) {
      vec2 toPlant = worldPos.xz - uPointerWorld.xz;
      float dist = length(toPlant);
      float influence = exp(-dist * dist * 0.75) * uPointerActive * swayFactor;
      vec2 dir = dist > 0.001 ? normalize(toPlant) : vec2(0.0, 1.0);
      offset.xz += dir * influence * 0.34;
      offset.y -= influence * 0.08;
    }

    // Gentle grass parting as the little Fairy Sprite strolls through!
    vec2 fromFairy = worldPos.xz - uFairyLightPos.xz;
    float fDist = length(fromFairy);
    if (fDist < 0.85) {
      float fPush = exp(-fDist * fDist * 5.0) * swayFactor;
      vec2 fDir = fDist > 0.001 ? normalize(fromFairy) : vec2(0.0, 1.0);
      offset.xz += fDir * fPush * 0.16;
    }

    return offset;
  }
`;

/**
 * Physically-Inspired Lifelike Botanical Material:
 * - High-res 512x512 Albedo + Venation + Scalloped Alpha Cutout (`uMap`)
 * - Smooth Wrap-Lambertian Shading (no harsh cel bands!)
 * - Backlit Subsurface Scattering (SSS translucency) + Velvet Petal Sheen
 * - Real-time Warm Fairy-Lantern & Streetlamp Illumination
 */
function createBotanicalMaterial(
  sharedUniforms,
  {
    map = null,
    alphaCutoff = 0.36,
    swayWeight = 0.75,
    rootAnchored = false,
    sssStrength = 0.34,
    sheenStrength = 0.28,
    emissiveBoost = 0.03
  } = {}
) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: sharedUniforms.uTime,
      uPointerWorld: sharedUniforms.uPointerWorld,
      uPointerActive: sharedUniforms.uPointerActive,
      uFairyLightPos: sharedUniforms.uFairyLightPos,
      uLampPos: sharedUniforms.uLampPos,
      uRipples: sharedUniforms.uRipples,
      uFinaleProgress: sharedUniforms.uFinaleProgress,
      uMap: { value: map },
      uUseMap: { value: map ? 1.0 : 0.0 },
      uAlphaCutoff: { value: alphaCutoff },
      uSwayWeight: { value: swayWeight },
      uRootAnchored: { value: rootAnchored ? 1.0 : 0.0 },
      uSssStrength: { value: sssStrength },
      uSheenStrength: { value: sheenStrength },
      uEmissiveBoost: { value: emissiveBoost }
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

      ${SHARED_WORLD_GLSL}

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

        // uv.y is 0 at petal/leaf/blade root and 1 at tip!
        float anchorWeight = mix(1.0, pow(clamp(uv.y, 0.0, 1.0), 1.65), uRootAnchored);
        world.xyz += applyMeadowWind(world.xyz, uSwayWeight * anchorWeight);

        vWorldPos = world.xyz;
        vNormal = length(nMat) > 0.0001 ? normalize(nMat) : vec3(0.0, 1.0, 0.0);
        vViewDir = normalize(cameraPosition - world.xyz);
        vRipple = computeRippleBoost(world.xyz);

        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uUseMap;
      uniform float uAlphaCutoff;
      uniform float uFinaleProgress;
      uniform float uSssStrength;
      uniform float uSheenStrength;
      uniform float uEmissiveBoost;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      varying float vRipple;

      ${SHARED_WORLD_GLSL}

      void main() {
        vec3 baseAlbedo = vColor;
        if (uUseMap > 0.5) {
          vec4 texel = texture2D(uMap, vUv);
          if (texel.a < uAlphaCutoff) discard;
          // Decode canvas texture from sRGB to linear light and modulate by vertex/instance color
          vec3 texLinear = pow(clamp(texel.rgb, 0.0, 1.0), vec3(2.2));
          baseAlbedo *= texLinear;
        }

        vec3 N = length(vNormal) > 0.0001 ? normalize(vNormal) : vec3(0.0, 1.0, 0.0);
        float camDist = length(vViewDir);
        vec3 V = normalize(vViewDir);
        if (dot(N, V) < 0.0) N = -N;

        // Soft Moonlit Key Light + Dreamy Fairytale Sky Hemisphere + Warm Ground Bounce
        vec3 moonDir = normalize(vec3(0.44, 0.80, 0.40));
        vec3 backRimDir = normalize(vec3(-0.35, 0.52, -0.78));

        // Wrap-Lambertian prevents harsh dark polygon creases on delicate flower petals!
        float wrapDiff = clamp((dot(N, moonDir) + 0.46) / 1.46, 0.0, 1.0);
        float skyHemi = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);

        // Soft specular micro-glint on dewy petals & waxy leaves
        vec3 H = normalize(moonDir + V);
        float dewSpec = pow(max(0.0, dot(N, H)), 28.0) * 0.14;

        // Backlit Subsurface Scattering (thin outer petal margins glow translucent!)
        float petalThinness = 0.35 + 0.65 * clamp(vUv.y, 0.0, 1.0);
        float moonSss = pow(clamp(dot(-V, moonDir) * 0.5 + 0.5, 0.0, 1.0), 2.1) * uSssStrength * petalThinness;
        float rimBack = max(0.0, dot(N, backRimDir)) * 0.22;

        // Velvet grazing sheen (Charlie-inspired soft rim on rose/iris/tulip cups)
        float fresnel = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.8);

        // Dynamic warm illumination from Exploring Fairy Sprite Lantern & Path Streetlamps!
        float warmScatter = 0.0;
        vec3 warmLanternLight = computeWarmFairytaleLights(vWorldPos, N, warmScatter);

        vec3 skyAmbient = mix(vec3(0.038, 0.072, 0.145), vec3(0.145, 0.235, 0.395), skyHemi);
        vec3 moonLight = vec3(1.02, 0.98, 0.88) * wrapDiff * 0.92;

        vec3 lit = baseAlbedo * (moonLight + skyAmbient + rimBack + warmLanternLight + uEmissiveBoost);
        lit += baseAlbedo * (vec3(0.95, 0.96, 1.05) * moonSss + vec3(1.05, 0.82, 0.42) * warmScatter * uSssStrength);
        lit += vec3(0.92, 0.96, 1.0) * dewSpec;

        // Soft fairytale velvet sheen + interactive ripple wave (albedo-weighted so grass stays crisp!)
        vec3 sheenCol = mix(baseAlbedo + vec3(0.14), vec3(0.82, 0.92, 1.0), 0.40);
        lit += sheenCol * fresnel * (uSheenStrength + 0.16 * uFinaleProgress + vRipple * 0.24);
        lit += (vec3(0.18) + baseAlbedo * 0.82) * mix(vec3(0.38, 0.82, 1.0), vec3(1.0, 0.88, 0.44), 0.45) * vRipple * 0.26;

        // Camera-aware fairytale atmospheric mist (stays vivid when diving close to hilltop blooms!)
        float distMist = smoothstep(7.4, 16.2, camDist);
        lit = mix(lit, vec3(0.018, 0.042, 0.105), distMist * 0.65);

        // Clean ACES filmic tone mapping + single sRGB encode
        vec3 mapped = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
        vec3 srgb = pow(clamp(mapped, 0.0, 1.0), vec3(1.0 / 2.2));

        gl_FragColor = vec4(srgb, 1.0);
      }
    `
  });
}

// ============================================================================
// 3. MAIN FAIRYTALE MEADOW SCENE FACTORY
// ============================================================================
export function createMeadowScene(
  canvas,
  {
    eggs = [],
    wonders = [],
    onEggTrigger = () => {},
    onWonderTrigger = () => {},
    onSpriteWhisper = () => {},
    onSkyTap = () => {},
    onRipple = () => {},
    onStatus = () => {}
  } = {}
) {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false
  });
  if (!gl) {
    const err = new Error('WebGL2 is required for the 3D fairytale flower meadow');
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

  // Build procedural Van Gogh Starry-Night PMREM environment so Blender 4.0 PBR .glb models
  // (brass lanterns, glossy fairy eyes, slate shingles, wax seals & toadstool caps) gleam warmly!
  const pmremGen = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x0d2149);
  const envMoonDome = new THREE.Mesh(
    new THREE.SphereGeometry(8, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x3b82f6, side: THREE.BackSide })
  );
  const envMoonOrb = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xfef08a })
  );
  envMoonOrb.position.set(4.2, 5.5, 3.2);
  const envWarmBounce = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  envWarmBounce.position.set(-2.5, -3.2, 2.5);
  envScene.add(envMoonDome, envMoonOrb, envWarmBounce);
  const envRenderTarget = pmremGen.fromScene(envScene, 0.04);
  scene.environment = envRenderTarget.texture;
  scene.environmentIntensity = 1.35;
  pmremGen.dispose();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.08, 90);
  // Elevated panoramic fairytale viewpoint overlooking rolling knolls, winding dirt path & hilltop cottage!
  const cameraBase = new THREE.Vector3(0.0, 2.28, 7.35);
  const cameraLookBase = new THREE.Vector3(0.0, 0.42, -1.85);
  const cameraCurrentPos = cameraBase.clone();
  const cameraCurrentLook = cameraLookBase.clone();
  const cameraTargetPos = cameraBase.clone();
  const cameraTargetLook = cameraLookBase.clone();

  let macroMode = false;
  let followSpriteMode = false;
  let scrollCameraMode = true;
  const scrollCamPos = cameraBase.clone();
  const scrollCamLook = cameraLookBase.clone();
  let focusedTarget = null;
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
    uFairyLightPos: { value: new THREE.Vector3(-0.3, 0.6, 2.8) },
    uLampPos: {
      value: [
        new THREE.Vector3(-2.45, 1.2, 0.35),
        new THREE.Vector3(1.05, 1.2, 0.15),
        new THREE.Vector3(-0.95, 1.2, -3.25)
      ]
    },
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

  // Build 512x512 procedural botanical petal, seed-disc, leaf & fairy-wing textures
  const textures = createBotanicalTextures();

  // ==========================================================================
  // A. SCULPTED GRASSLAND, EARTHEN SLOPES ("土坡") & WINDING DIRT PATH ("小路")
  // ==========================================================================
  const terrainGeo = new THREE.PlaneGeometry(36, 22, 136, 92);
  terrainGeo.rotateX(-Math.PI * 0.5);
  terrainGeo.translate(0, 0, -2.2);
  const tPos = terrainGeo.attributes.position;
  for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i);
    const z = tPos.getZ(i);
    tPos.setY(i, meadowHeight(x, z));
  }
  terrainGeo.computeVertexNormals();

  const pathUniformArray = PATH_POLY.map(([x, z]) => new THREE.Vector2(x, z));

  const terrainMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    uniforms: {
      uTime: sharedUniforms.uTime,
      uPointerWorld: sharedUniforms.uPointerWorld,
      uPointerActive: sharedUniforms.uPointerActive,
      uFairyLightPos: sharedUniforms.uFairyLightPos,
      uLampPos: sharedUniforms.uLampPos,
      uRipples: sharedUniforms.uRipples,
      uPathPts: { value: pathUniformArray }
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
      uniform vec2 uPathPts[15];
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      ${SHARED_WORLD_GLSL}

      float glslDistToPath(vec2 p) {
        float minD2 = 1e9;
        for (int i = 0; i < 14; i++) {
          vec2 a = uPathPts[i];
          vec2 b = uPathPts[i + 1];
          vec2 v = b - a;
          vec2 w = p - a;
          float t = clamp(dot(w, v) / (dot(v, v) + 1e-6), 0.0, 1.0);
          vec2 d = w - v * t;
          minD2 = min(minD2, dot(d, d));
        }
        return sqrt(minD2);
      }

      void main() {
        vec3 N = normalize(vNormal);
        float dPath = glslDistToPath(vWorldPos.xz);

        // Organic painterly soil, clover turf & pebble grain
        float macroNoise = sin(vWorldPos.x * 1.4 + cos(vWorldPos.z * 1.2)) * 0.5 + 0.5;
        float fineGrain = sin(vWorldPos.x * 9.5 + vWorldPos.z * 8.2) * cos(vWorldPos.x * 7.1 - vWorldPos.z * 10.4);
        float pebble = smoothstep(0.65, 0.92, sin(vWorldPos.x * 19.0) * cos(vWorldPos.z * 17.0));

        // 1. Lush Moonlit Emerald-Moss Fairytale Grassland ("草原")
        vec3 deepTurf = vec3(0.016, 0.058, 0.052);
        vec3 cloverMeadow = vec3(0.036, 0.115, 0.088);
        vec3 grassAlbedo = mix(deepTurf, cloverMeadow, macroNoise * 0.72 + fineGrain * 0.15);

        // 2. Warm Terracotta-Ochre Earthen Slope Embankments ("土坡") on steeper knoll flanks!
        float slopeSteepness = clamp((1.0 - N.y) * 12.5, 0.0, 1.0);
        float slopePatch = smoothstep(0.16, 0.58, slopeSteepness + fineGrain * 0.15);
        vec3 earthenSlope = mix(vec3(0.155, 0.092, 0.048), vec3(0.235, 0.148, 0.078), macroNoise * 0.75 + pebble * 0.25);
        vec3 groundAlbedo = mix(grassAlbedo, earthenSlope, slopePatch * 0.90);

        // 3. Winding Country Dirt & Sandstone Footpath ("蜿蜒小路")!
        float pathCore = 1.0 - smoothstep(0.32, 0.58, dPath + fineGrain * 0.045);
        float pathVerge = (1.0 - smoothstep(0.48, 0.88, dPath)) * (1.0 - pathCore);
        vec3 dirtCenter = mix(vec3(0.195, 0.138, 0.082), vec3(0.265, 0.195, 0.118), 0.5 + 0.35 * fineGrain + 0.25 * pebble);
        vec3 vergeSoil = vec3(0.115, 0.082, 0.045);
        groundAlbedo = mix(groundAlbedo, vergeSoil, pathVerge * 0.75);
        groundAlbedo = mix(groundAlbedo, dirtCenter, pathCore);

        // Moonlit + Sky Hemisphere + Real-time Warm Fairy-Lantern & Streetlamp Illumination!
        vec3 moonDir = normalize(vec3(0.44, 0.80, 0.40));
        float nDotL = clamp((dot(N, moonDir) + 0.35) / 1.35, 0.0, 1.0);
        float warmScatter = 0.0;
        vec3 warmLights = computeWarmFairytaleLights(vWorldPos, N, warmScatter);

        vec3 lit = groundAlbedo * (vec3(0.95, 0.96, 0.90) * nDotL * 0.88 + vec3(0.08, 0.15, 0.28) + warmLights * 1.35);

        float ripple = computeRippleBoost(vWorldPos);
        lit += mix(vec3(0.32, 0.78, 1.0), vec3(1.0, 0.86, 0.42), 0.45) * ripple * 0.32;

        // Camera-aware indigo horizon blend into p5.js Saint-Rémy foothills (stays vivid on hilltop fly-ins!)
        float camNear = smoothstep(2.2, 6.2, length(vWorldPos - cameraPosition));
        float farMix = smoothstep(-3.2, -9.2, vWorldPos.z) * (0.28 + 0.72 * camNear);
        lit = mix(lit, vec3(0.014, 0.036, 0.095), farMix * 0.78);

        vec3 mapped = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
        vec3 srgb = pow(clamp(mapped, 0.0, 1.0), vec3(1.0 / 2.2));

        float edgeAlpha = smoothstep(-11.2, -7.6, vWorldPos.z) * smoothstep(17.2, 12.2, abs(vWorldPos.x));
        gl_FragColor = vec4(srgb, edgeAlpha);
      }
    `
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  scene.add(terrainMesh);

  // ==========================================================================
  // B. FAIRYTALE PROPS, 2BR+1LR VILLA, MUSHROOM RING, POND & EXPLORING SPRITE!
  // ==========================================================================
  const worldProps = createFairytaleWorldProps({
    scene,
    meadowHeight,
    pathCurve: PATH_CURVE_2D,
    rng,
    villaSpec: {
      x: VILLA_CENTER.x,
      y: VILLA_TERRACE_Y,
      z: VILLA_CENTER.z,
      rotY: VILLA_CENTER.rotY
    }
  });

  // Sync warm streetlamp world positions into shared shader uniforms!
  for (let i = 0; i < 3 && i < worldProps.lampPositions.length; i++) {
    sharedUniforms.uLampPos.value[i].copy(worldProps.lampPositions[i]);
  }

  // Curated scenic fairytale waypoints so the Sprite freely explores path, knolls, flowers & secrets!
  const spriteWaypoints = [
    { x: -0.06, z: 2.24, whisper: '提着小灯笼，陪你在梵高星空小路散步啦 ✨' },
    { x: 0.55, z: 2.05, whisper: '快看小路边！丝绒玫瑰丛里藏着发光的星砂许愿瓶～' },
    { x: -0.45, z: 1.55, whisper: '木路牌上的小青鸟说：往哪边走都是被偏爱的春天 ♪' },
    { x: -1.85, z: 2.15, whisper: '左前方的草坡开满了蓝色无尽夏与满天星呢！' },
    { x: -1.12, z: 1.18, whisper: '星影露珠潭里的小青蛙王子正在看今晚的月亮与睡莲 ✦' },
    { x: 0.95, z: 0.45, whisper: '顺着蜿蜒土坡往上走，晚风里全是花香～' },
    { x: 2.05, z: -0.15, whisper: '哇！小土坡上的七彩荧光蘑菇圈在偷偷唱歌！' },
    { x: 1.15, z: -1.85, whisper: '轻轻吹一口月光蒲公英，把心愿寄给漫天繁星 ✧' },
    { x: -0.52, z: -2.65, whisper: '穿过这座爬满蔷薇与星灯的花拱门，前面就是童话小家啦～' },
    { x: -0.70, z: -3.42, whisper: '推开院门掀开屋顶，看看我们两室一厅的童话小家吧 🏡' },
    { x: -2.15, z: 0.25, whisper: '点击草坡或小路任意地方，我都会提灯跑过去找你哦～' }
  ];

  const fairySprite = createFairyExplorer({
    scene,
    meadowHeight,
    wingTexture: textures.fairyWing,
    waypoints: spriteWaypoints,
    onArrivalWhisper: onSpriteWhisper
  });

  // ==========================================================================
  // C. SPATIAL PLANNER — KEEP PATH & FAIRYTALE LANDMARKS OPEN AND NATURAL!
  // ==========================================================================
  const occupied = [];
  function registerSpot(x, z, r) {
    occupied.push({ x, z, r });
  }

  // Reserve clearings around fairytale props so flowers frame rather than bury them!
  registerSpot(0.82, 2.12, 0.42);   // Egg #3 Crystal Wish Bottle alcove beside path
  registerSpot(2.35, -0.15, 0.78);  // 7-Mushroom Fairy Ring clearing
  registerSpot(-0.62, 1.65, 0.36);  // Wooden Signpost
  registerSpot(-1.48, 0.85, 0.92);  // Dew Pond & Frog Prince clearing
  registerSpot(-1.25, 1.68, 0.45);  // Keep sightline to Dew Pond open!
  registerSpot(2.68, 2.78, 0.46);   // Hollow Tree Stump
  registerSpot(1.42, -2.05, 0.52);  // Giant Dandelions
  if (worldProps.archPos) {
    registerSpot(worldProps.archPos.x - 0.72, worldProps.archPos.z, 0.32);
    registerSpot(worldProps.archPos.x + 0.72, worldProps.archPos.z, 0.32);
  }

  function canPlacePlant(x, z, r, minPathDist = 0.56) {
    if (isInsideVillaFootprint(x, z, 0.18 + r * 0.5)) return false;
    if (distToPath(x, z) < minPathDist) return false;
    for (let i = 0; i < occupied.length; i++) {
      const o = occupied[i];
      const dx = x - o.x;
      const dz = z - o.z;
      const minD = r + o.r;
      if (dx * dx + dz * dz < minD * minD) return false;
    }
    return true;
  }

  // Dedicated realistic textured botanical materials per flower organ!
  const roseMat = createBotanicalMaterial(sharedUniforms, {
    map: textures.rosePetal,
    alphaCutoff: 0.36,
    swayWeight: 0.72,
    sssStrength: 0.38,
    sheenStrength: 0.34
  });
  const hydrangeaMat = createBotanicalMaterial(sharedUniforms, {
    map: textures.hydrangeaSepal,
    alphaCutoff: 0.36,
    swayWeight: 0.72,
    sssStrength: 0.36,
    sheenStrength: 0.28
  });
  const sunDiscMat = createBotanicalMaterial(sharedUniforms, {
    map: textures.sunflowerDisc,
    alphaCutoff: 0.05,
    swayWeight: 0.80,
    sssStrength: 0.10,
    sheenStrength: 0.14
  });
  const sunRayMat = createBotanicalMaterial(sharedUniforms, {
    map: textures.sunflowerRay,
    alphaCutoff: 0.36,
    swayWeight: 0.80,
    sssStrength: 0.42,
    sheenStrength: 0.24
  });
  const irisMat = createBotanicalMaterial(sharedUniforms, {
    map: textures.irisPetal,
    alphaCutoff: 0.36,
    swayWeight: 0.78,
    sssStrength: 0.38,
    sheenStrength: 0.32
  });
  const tulipMat = createBotanicalMaterial(sharedUniforms, {
    map: textures.tulipPetal,
    alphaCutoff: 0.36,
    swayWeight: 0.76,
    sssStrength: 0.40,
    sheenStrength: 0.30
  });
  const gypMat = createBotanicalMaterial(sharedUniforms, {
    map: textures.gypsophila,
    alphaCutoff: 0.28,
    swayWeight: 0.88,
    sssStrength: 0.45,
    sheenStrength: 0.32,
    emissiveBoost: 0.14
  });
  const broadLeafMat = createBotanicalMaterial(sharedUniforms, {
    map: textures.broadLeaf,
    alphaCutoff: 0.38,
    swayWeight: 0.74,
    rootAnchored: true,
    sssStrength: 0.22,
    sheenStrength: 0.20
  });
  const stemAndSwordMat = createBotanicalMaterial(sharedUniforms, {
    map: null,
    swayWeight: 0.76,
    rootAnchored: true,
    sssStrength: 0.14,
    sheenStrength: 0.14
  });
  const roseCalyxMat = createBotanicalMaterial(sharedUniforms, {
    map: null,
    swayWeight: 0.72,
    rootAnchored: false,
    sssStrength: 0.18,
    sheenStrength: 0.16
  });
  const sunCalyxMat = createBotanicalMaterial(sharedUniforms, {
    map: null,
    swayWeight: 0.80,
    rootAnchored: false,
    sssStrength: 0.18,
    sheenStrength: 0.16
  });
  const grassMat = createBotanicalMaterial(sharedUniforms, {
    map: null,
    swayWeight: 0.68,
    rootAnchored: true,
    sssStrength: 0.18,
    sheenStrength: 0.16
  });

  const stemRecords = [];
  const leafSpots = [];
  const swordSpots = [];

  // ==========================================================================
  // D. SIX LIFELIKE BOTANICAL SPECIES IN NATURALISTIC FAIRYTALE CLUSTERS!
  // ==========================================================================

  // --- 1. ENDLESS SUMMER HYDRANGEAS (18 Lush Multi-Panicle Shrubs on Knolls & Path Bends) ---
  const hydrangeaPalettes = [
    ['#3b82f6', '#60a5fa', '#93c5fd', '#818cf8'],
    ['#2563eb', '#38bdf8', '#7dd3fc', '#a78bfa'],
    ['#4f46e5', '#818cf8', '#60a5fa', '#c4b5fd'],
    ['#0284c7', '#38bdf8', '#93c5fd', '#c084fc']
  ];
  const hydrangeaShrubs = [
    // Egg #1 Hero Hydrangea Knoll (Left foreground grassy mound)
    { x: -2.25, z: 2.35, scale: 1.08, palette: hydrangeaPalettes[1] },
    { x: -3.05, z: 1.75, scale: 0.96, palette: hydrangeaPalettes[0] },
    { x: -1.68, z: 2.85, scale: 0.90, palette: hydrangeaPalettes[2] },
    // Scenic shrubs flanking Villa garden fence, slopes & distant bends
    { x: -3.88, z: -4.26, scale: 0.94, palette: hydrangeaPalettes[1] },
    { x: 1.73, z: -5.26, scale: 0.92, palette: hydrangeaPalettes[3] },
    { x: 3.45, z: 2.15, scale: 0.96, palette: hydrangeaPalettes[0] },
    { x: -3.65, z: -0.65, scale: 0.94, palette: hydrangeaPalettes[2] },
    { x: 2.85, z: -3.15, scale: 0.92, palette: hydrangeaPalettes[1] }
  ];
  for (const s of hydrangeaShrubs) registerSpot(s.x, s.z, 0.52 * s.scale);

  const shrubAnchors = [[-3.8, 0.8], [3.6, -1.4], [-1.8, -2.2], [0.6, -3.8], [3.9, 0.8], [-4.2, -2.6]];
  for (let i = 0; i < 120 && hydrangeaShrubs.length < 16; i++) {
    const c = shrubAnchors[i % shrubAnchors.length];
    const x = c[0] + (rng() - 0.5) * 2.2;
    const z = c[1] + (rng() - 0.5) * 2.0;
    const scale = 0.78 + rng() * 0.26;
    if (canPlacePlant(x, z, 0.54 * scale, 0.88)) {
      registerSpot(x, z, 0.50 * scale);
      hydrangeaShrubs.push({
        x,
        z,
        scale,
        palette: hydrangeaPalettes[hydrangeaShrubs.length % hydrangeaPalettes.length]
      });
    }
  }

  const panicleHeads = [];
  for (const shrub of hydrangeaShrubs) {
    for (let k = 0; k < 5; k++) {
      const isCenter = k === 0;
      const ang = (k / 4) * Math.PI * 2 + rng() * 0.45;
      const dist = isCenter ? rng() * 0.05 : (0.21 + rng() * 0.10) * shrub.scale;
      const hx = shrub.x + Math.cos(ang) * dist;
      const hz = shrub.z + Math.sin(ang) * dist;
      const headR = (isCenter ? 0.24 : 0.18 + rng() * 0.04) * shrub.scale;
      const lift = (isCenter ? 0.40 : 0.26 + rng() * 0.11) * shrub.scale;
      const gy = meadowHeight(hx, hz);

      panicleHeads.push({
        x: hx,
        y: gy + lift,
        z: hz,
        r: headR,
        florets: Math.round(42 + headR * 90),
        palette: shrub.palette,
        isYoungBud: k === 4
      });

      stemRecords.push({
        x: hx,
        y: gy,
        z: hz,
        height: lift,
        rotY: ang,
        tiltX: (hz - shrub.z) * 0.22,
        tiltZ: -(hx - shrub.x) * 0.22,
        thick: 1.1
      });
    }

    for (let l = 0; l < 18; l++) {
      const la = (l / 18) * Math.PI * 2 + rng() * 0.24;
      const ld = (0.18 + rng() * 0.26) * shrub.scale;
      leafSpots.push({
        x: shrub.x + Math.cos(la) * ld,
        z: shrub.z + Math.sin(la) * ld,
        ang: la,
        scale: (0.78 + rng() * 0.36) * shrub.scale,
        lift: 0.07 + (l % 3) * 0.06
      });
    }
  }

  const totalHydrangeaFlorets = panicleHeads.reduce((sum, p) => sum + p.florets, 0);
  const hydrangeaGeo = createHydrangeaFloretGeometry();
  const hydrangeaInstanced = new THREE.InstancedMesh(hydrangeaGeo, hydrangeaMat, totalHydrangeaFlorets);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const budTint = new THREE.Color('#bef264');

  let hIdx = 0;
  for (const head of panicleHeads) {
    const cols = head.palette.map((hex) => new THREE.Color(hex));
    for (let j = 0; j < head.florets; j++) {
      const t = j / head.florets;
      const inc = Math.acos(1 - t * 0.88);
      const az = j * goldenAngle + rng() * 0.16;
      const nx = Math.sin(inc) * Math.cos(az);
      const ny = Math.cos(inc);
      const nz = Math.sin(inc) * Math.sin(az);
      const jitterR = head.r * (0.80 + 0.24 * rng());

      dummy.position.set(head.x + nx * jitterR, head.y + ny * jitterR * 0.84, head.z + nz * jitterR);
      normalVec.set(nx + (rng() - 0.5) * 0.18, ny * 1.12 + 0.14, nz + (rng() - 0.5) * 0.18).normalize();
      quat.setFromUnitVectors(upVec, normalVec);
      spinQuat.setFromAxisAngle(upVec, rng() * Math.PI * 2);
      quat.multiply(spinQuat);
      dummy.quaternion.copy(quat);
      dummy.scale.setScalar((head.isYoungBud ? 0.68 : 0.84) + rng() * 0.28);
      dummy.updateMatrix();
      hydrangeaInstanced.setMatrixAt(hIdx, dummy.matrix);

      colorTmp.copy(cols[j % cols.length]).lerp(cols[(j + 1) % cols.length], rng() * 0.6);
      if (head.isYoungBud) colorTmp.lerp(budTint, 0.35);
      // Natural panicle dome depth shading so individual 4-sepal florets pop in 3D!
      colorTmp.multiplyScalar(0.66 + 0.36 * clamp(ny * 0.5 + 0.5, 0, 1));
      hydrangeaInstanced.setColorAt(hIdx, colorTmp);
      hIdx++;
    }
  }
  hydrangeaInstanced.instanceMatrix.needsUpdate = true;
  if (hydrangeaInstanced.instanceColor) hydrangeaInstanced.instanceColor.needsUpdate = true;
  scene.add(hydrangeaInstanced);

  // --- 2. LIFELIKE VAN GOGH SUNFLOWERS (30 Tall Fibonacci-Seed Blooms on Hilltop & Far Ridges) ---
  const sunflowerCoords = [
    // Egg #2 Hero Sunflower Hillside Drift overlooking the winding path!
    { x: -1.35, z: -1.85, scale: 1.02, height: 1.02, yaw: 0.22 },
    { x: -1.78, z: -1.55, scale: 0.92, height: 0.92, yaw: 0.30 },
    { x: -0.95, z: -2.15, scale: 0.88, height: 0.86, yaw: 0.12 },
    { x: -1.62, z: -2.35, scale: 0.95, height: 0.98, yaw: 0.18 }
  ];
  for (const s of sunflowerCoords) registerSpot(s.x, s.z, 0.24);

  const sunZones = [
    [-2.9, -4.1], [-0.6, -4.8], [0.6, -3.9], [2.6, -3.6], [3.8, -1.8], [-3.8, -2.5]
  ];
  for (let i = 0; i < 180 && sunflowerCoords.length < 30; i++) {
    const c = sunZones[i % sunZones.length];
    const x = c[0] + (rng() - 0.5) * 2.2;
    const z = c[1] + (rng() - 0.5) * 1.9;
    if (canPlacePlant(x, z, 0.25, 0.78)) {
      registerSpot(x, z, 0.23);
      sunflowerCoords.push({
        x,
        z,
        scale: 0.72 + rng() * 0.28,
        height: 0.76 + rng() * 0.38,
        yaw: 0.14 + (rng() - 0.5) * 0.45
      });
    }
  }

  const sunDiscGeo = createSunflowerDiscGeometry();
  const sunRaysGeo = createSunflowerRaysGeometry();
  const sunDiscInstanced = new THREE.InstancedMesh(sunDiscGeo, sunDiscMat, sunflowerCoords.length);
  const sunRaysInstanced = new THREE.InstancedMesh(sunRaysGeo, sunRayMat, sunflowerCoords.length);
  const sunCalyxInstanced = new THREE.InstancedMesh(new THREE.BufferGeometry(), sunCalyxMat, sunflowerCoords.length);
  sunCalyxInstanced.visible = false;
  const sunRayTints = [new THREE.Color('#ffffff'), new THREE.Color('#fef3c7'), new THREE.Color('#fde68a')];
  const calyxEmerald = new THREE.Color('#2d6a4f');

  for (let i = 0; i < sunflowerCoords.length; i++) {
    const sc = sunflowerCoords[i];
    const gy = meadowHeight(sc.x, sc.z);
    dummy.position.set(sc.x, gy + sc.height, sc.z);
    dummy.rotation.set(0, sc.yaw, (rng() - 0.5) * 0.10);
    dummy.scale.setScalar(sc.scale);
    dummy.updateMatrix();
    sunDiscInstanced.setMatrixAt(i, dummy.matrix);
    sunRaysInstanced.setMatrixAt(i, dummy.matrix);
    sunRaysInstanced.setColorAt(i, sunRayTints[i % sunRayTints.length]);
    sunCalyxInstanced.setMatrixAt(i, dummy.matrix);
    sunCalyxInstanced.setColorAt(i, calyxEmerald);

    stemRecords.push({
      x: sc.x,
      y: gy,
      z: sc.z,
      height: sc.height,
      rotY: sc.yaw,
      tiltX: 0,
      tiltZ: 0,
      thick: 1.4
    });

    for (let sl = 0; sl < 2; sl++) {
      leafSpots.push({
        x: sc.x,
        z: sc.z,
        ang: sc.yaw + (sl === 0 ? 1.15 : -1.35),
        scale: 0.78 * sc.scale,
        lift: sc.height * (0.34 + sl * 0.24)
      });
    }
  }
  sunDiscInstanced.instanceMatrix.needsUpdate = true;
  sunRaysInstanced.instanceMatrix.needsUpdate = true;
  sunCalyxInstanced.instanceMatrix.needsUpdate = true;
  if (sunRaysInstanced.instanceColor) sunRaysInstanced.instanceColor.needsUpdate = true;
  if (sunCalyxInstanced.instanceColor) sunCalyxInstanced.instanceColor.needsUpdate = true;
  scene.add(sunDiscInstanced, sunRaysInstanced, sunCalyxInstanced);

  // --- 3. LIFELIKE RUFFLED BEARDED IRISES (46 Veined Blooms on Terraced Slope & Pond Edge) ---
  const irisTints = ['#818cf8', '#6366f1', '#a78bfa', '#60a5fa', '#c084fc'];
  const irisCoords = [
    // Egg #4 Hero Iris & Tulip Terraced Earthen Slope ("右侧土坡花境")
    { x: 2.12, z: 1.38, scale: 1.14, height: 0.76, tint: '#818cf8' },
    { x: 2.52, z: 1.12, scale: 1.06, height: 0.70, tint: '#a78bfa' },
    { x: 1.82, z: 1.62, scale: 1.02, height: 0.68, tint: '#6366f1' },
    // Dew pond border irises framing left bank without blocking Frog Prince!
    { x: -2.06, z: 3.48, scale: 1.04, height: 0.70, tint: '#60a5fa' },
    { x: -1.92, z: 4.16, scale: 0.96, height: 0.64, tint: '#a78bfa' }
  ];
  for (const ic of irisCoords) registerSpot(ic.x, ic.z, 0.20);

  const irisZones = [[2.8, 0.8], [1.9, 2.4], [-2.9, 0.9], [3.3, -1.2], [-1.9, -0.8], [0.9, -1.4]];
  for (let i = 0; i < 240 && irisCoords.length < 46; i++) {
    const c = irisZones[i % irisZones.length];
    const x = c[0] + (rng() - 0.5) * 2.2;
    const z = c[1] + (rng() - 0.5) * 2.0;
    if (canPlacePlant(x, z, 0.21, 0.66)) {
      registerSpot(x, z, 0.19);
      irisCoords.push({
        x,
        z,
        scale: 0.80 + rng() * 0.30,
        height: 0.54 + rng() * 0.30,
        tint: irisTints[irisCoords.length % irisTints.length]
      });
    }
  }

  const irisGeo = createIrisBloomGeometry();
  const irisInstanced = new THREE.InstancedMesh(irisGeo, irisMat, irisCoords.length);
  for (let i = 0; i < irisCoords.length; i++) {
    const ic = irisCoords[i];
    const gy = meadowHeight(ic.x, ic.z);
    dummy.position.set(ic.x, gy + ic.height, ic.z);
    dummy.rotation.set((rng() - 0.5) * 0.10, rng() * Math.PI * 2, (rng() - 0.5) * 0.10);
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
      thick: 0.96
    });

    for (let f = 0; f < 4; f++) {
      swordSpots.push({
        x: ic.x + (rng() - 0.5) * 0.06,
        y: gy,
        z: ic.z + (rng() - 0.5) * 0.06,
        rotY: (f / 4) * Math.PI * 2 + rng() * 0.4,
        splay: 0.18 + rng() * 0.20,
        scale: (0.68 + rng() * 0.28) * ic.scale
      });
    }
  }
  irisInstanced.instanceMatrix.needsUpdate = true;
  if (irisInstanced.instanceColor) irisInstanced.instanceColor.needsUpdate = true;
  scene.add(irisInstanced);

  // --- 4. LIFELIKE 36-PETAL LAYERED GARDEN ROSES (56 Plush Roses Framing Path & Wish Bottle) ---
  const rosePalettes = ['#e11d48', '#fb7185', '#f43f5e', '#f472b6', '#fda4af', '#fde68a'];
  const roseCoords = [
    // Egg #3 Hero Rose Alcove cradling Crystal Star-Sand Bottle at [0.82, 2.12] beside the path!
    { x: 0.38, z: 2.22, scale: 1.06, height: 0.44, tint: '#e11d48' },
    { x: 1.28, z: 2.08, scale: 1.08, height: 0.46, tint: '#fb7185' },
    { x: 0.62, z: 1.66, scale: 1.02, height: 0.52, tint: '#fda4af' },
    { x: 1.16, z: 1.68, scale: 1.00, height: 0.50, tint: '#f43f5e' },
    // Villa front picket-fence border roses flanking the limestone porch steps
    { x: -1.67, z: -3.58, scale: 0.95, height: 0.46, tint: '#fb7185' },
    { x: 0.17, z: -3.87, scale: 0.95, height: 0.46, tint: '#fda4af' }
  ];
  for (const rc of roseCoords) registerSpot(rc.x, rc.z, 0.18);

  // Plant romantic rose drifts hugging both edges of the winding path & knoll bases
  for (let i = 0; i < 320 && roseCoords.length < 56; i++) {
    const t = 0.08 + rng() * 0.84;
    const pt = PATH_CURVE_2D.getPointAt(t);
    const side = rng() < 0.5 ? -1 : 1;
    const offset = 0.72 + rng() * 1.65;
    const x = pt.x + side * offset + (rng() - 0.5) * 0.8;
    const z = pt.z + (rng() - 0.5) * 1.1;
    if (canPlacePlant(x, z, 0.19, 0.64)) {
      registerSpot(x, z, 0.18);
      roseCoords.push({
        x,
        z,
        scale: 0.78 + rng() * 0.28,
        height: 0.36 + rng() * 0.26,
        tint: rosePalettes[roseCoords.length % rosePalettes.length]
      });
    }
  }

  const roseGeo = createRoseBloomGeometry();
  const roseInstanced = new THREE.InstancedMesh(roseGeo, roseMat, roseCoords.length);
  const roseCalyxInstanced = new THREE.InstancedMesh(new THREE.BufferGeometry(), roseCalyxMat, roseCoords.length);
  roseCalyxInstanced.visible = false;
  for (let i = 0; i < roseCoords.length; i++) {
    const rc = roseCoords[i];
    const gy = meadowHeight(rc.x, rc.z);
    dummy.position.set(rc.x, gy + rc.height, rc.z);
    dummy.rotation.set((rng() - 0.5) * 0.18, rng() * Math.PI * 2, (rng() - 0.5) * 0.18);
    dummy.scale.setScalar(rc.scale);
    dummy.updateMatrix();
    roseInstanced.setMatrixAt(i, dummy.matrix);
    roseInstanced.setColorAt(i, new THREE.Color(rc.tint));
    roseCalyxInstanced.setMatrixAt(i, dummy.matrix);
    roseCalyxInstanced.setColorAt(i, calyxEmerald);

    stemRecords.push({
      x: rc.x,
      y: gy,
      z: rc.z,
      height: rc.height,
      rotY: rng() * Math.PI * 2,
      tiltX: 0,
      tiltZ: 0,
      thick: 0.88
    });

    // Pinnate rose foliage leaves on stems
    for (let rl = 0; rl < 2; rl++) {
      leafSpots.push({
        x: rc.x,
        z: rc.z,
        ang: rl * Math.PI + rng() * 0.8,
        scale: 0.52 * rc.scale,
        lift: rc.height * (0.42 + rl * 0.24)
      });
    }
  }
  roseInstanced.instanceMatrix.needsUpdate = true;
  roseCalyxInstanced.instanceMatrix.needsUpdate = true;
  if (roseInstanced.instanceColor) roseInstanced.instanceColor.needsUpdate = true;
  if (roseCalyxInstanced.instanceColor) roseCalyxInstanced.instanceColor.needsUpdate = true;
  scene.add(roseInstanced, roseCalyxInstanced);

  // --- 5. LIFELIKE DARWIN GOBLET TULIPS (64 Silky Cupped Tulips on Slopes & Path Verges) ---
  const tulipPalettes = ['#fda4af', '#fde68a', '#f472b6', '#fbbf24', '#c4b5fd', '#fb7185'];
  const tulipCoords = [];
  const heroTulipSeeds = [
    [2.38, 1.65], [1.92, 1.12], [2.72, 1.42], [1.62, 1.32], [-0.42, 3.85], [0.85, 3.45]
  ];
  for (const [tx, tz] of heroTulipSeeds) {
    if (canPlacePlant(tx, tz, 0.15, 0.62)) {
      registerSpot(tx, tz, 0.15);
      tulipCoords.push({
        x: tx,
        z: tz,
        scale: 0.92 + rng() * 0.18,
        height: 0.42 + rng() * 0.16,
        tint: tulipPalettes[tulipCoords.length % tulipPalettes.length]
      });
    }
  }

  for (let i = 0; i < 360 && tulipCoords.length < 64; i++) {
    const x = (rng() - 0.5) * 11.5;
    const z = 4.2 - rng() * 9.4;
    if (canPlacePlant(x, z, 0.16, 0.64)) {
      registerSpot(x, z, 0.15);
      tulipCoords.push({
        x,
        z,
        scale: 0.78 + rng() * 0.26,
        height: 0.36 + rng() * 0.24,
        tint: tulipPalettes[tulipCoords.length % tulipPalettes.length]
      });
    }
  }

  const tulipGeo = createTulipBloomGeometry();
  const tulipInstanced = new THREE.InstancedMesh(tulipGeo, tulipMat, tulipCoords.length);
  for (let i = 0; i < tulipCoords.length; i++) {
    const tc = tulipCoords[i];
    const gy = meadowHeight(tc.x, tc.z);
    dummy.position.set(tc.x, gy + tc.height, tc.z);
    dummy.rotation.set((rng() - 0.5) * 0.14, rng() * Math.PI * 2, (rng() - 0.5) * 0.14);
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
      thick: 0.80
    });

    for (let tl = 0; tl < 2; tl++) {
      swordSpots.push({
        x: tc.x,
        y: gy,
        z: tc.z,
        rotY: tl * Math.PI + rng() * 0.6,
        splay: 0.26 + rng() * 0.14,
        scale: 0.50 * tc.scale
      });
    }
  }
  tulipInstanced.instanceMatrix.needsUpdate = true;
  if (tulipInstanced.instanceColor) tulipInstanced.instanceColor.needsUpdate = true;
  scene.add(tulipInstanced);

  // --- BUILD ALL SWAYING 3D STEMS, VEINED BROAD LEAVES & SWORD LEAVES ---
  const stemGeo = createCurvedStemGeometry();
  const stemInstanced = new THREE.InstancedMesh(stemGeo, stemAndSwordMat, stemRecords.length);
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

  const leafGeo = createBroadLeafGeometry();
  const leafInstanced = new THREE.InstancedMesh(leafGeo, broadLeafMat, leafSpots.length);
  for (let i = 0; i < leafSpots.length; i++) {
    const ls = leafSpots[i];
    const gy = meadowHeight(ls.x, ls.z);
    dummy.position.set(ls.x, gy + ls.lift, ls.z);
    dummy.rotation.set(0.16 + rng() * 0.24, -ls.ang + Math.PI * 0.5, (rng() - 0.5) * 0.16);
    dummy.scale.setScalar(ls.scale);
    dummy.updateMatrix();
    leafInstanced.setMatrixAt(i, dummy.matrix);
  }
  leafInstanced.instanceMatrix.needsUpdate = true;
  scene.add(leafInstanced);

  const swordGeo = createSwordLeafGeometry();
  const swordInstanced = new THREE.InstancedMesh(swordGeo, stemAndSwordMat, swordSpots.length);
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

  // --- 6. GYPSOPHILA ("满天星") LACY STAR-CLOUD BORDERS ALONG PATH & SHRUBS ---
  const gypCount = 3400;
  const gypGeo = createGypsophilaClusterGeometry();
  const gypInstanced = new THREE.InstancedMesh(gypGeo, gypMat, gypCount);
  const gypTints = [
    new THREE.Color('#ffffff'),
    new THREE.Color('#e0f2fe'),
    new THREE.Color('#fef9c3'),
    new THREE.Color('#ede9fe')
  ];

  const gypClouds = [];
  // Fluffy baby's-breath cushions hugging the winding dirt path verges!
  for (let i = 0; i < 44; i++) {
    const t = 0.05 + (i / 44) * 0.88;
    const pt = PATH_CURVE_2D.getPointAt(t);
    const side = i % 2 === 0 ? -1 : 1;
    const gx = pt.x + side * (0.68 + rng() * 0.55);
    const gz = pt.z + (rng() - 0.5) * 0.45;
    if (distToPath(gx, gz) > 0.56 && Math.hypot(gx + 1.48, gz - 0.85) > 0.92 && !isInsideVillaFootprint(gx, gz, 0.22)) {
      gypClouds.push({ x: gx, z: gz, r: 0.26 + rng() * 0.16, h: 0.18 + rng() * 0.14 });
    }
  }
  for (const shrub of hydrangeaShrubs) {
    const a = rng() * Math.PI * 2;
    const d = (0.46 + rng() * 0.20) * shrub.scale;
    const gx = shrub.x + Math.cos(a) * d;
    const gz = shrub.z + Math.sin(a) * d;
    if (distToPath(gx, gz) > 0.56 && Math.hypot(gx + 1.48, gz - 0.85) > 0.92 && !isInsideVillaFootprint(gx, gz, 0.22)) {
      gypClouds.push({ x: gx, z: gz, r: 0.30 + rng() * 0.15, h: 0.22 + rng() * 0.14 });
    }
  }

  for (let i = 0; i < gypCount; i++) {
    const cloud = gypClouds[i % gypClouds.length];
    const a = rng() * Math.PI * 2;
    const rad = cloud.r * Math.pow(rng(), 0.62);
    let gx = cloud.x + Math.cos(a) * rad;
    let gz = cloud.z + Math.sin(a) * rad;
    // Keep Dew Pond water mirror crystal-clear of baby's-breath florets!
    const dPondGyp = Math.hypot(gx + 1.48, gz - 0.85);
    if (dPondGyp < 0.82) {
      const pushAng = Math.atan2(gz - 0.85, gx + 1.48);
      gx = -1.48 + Math.cos(pushAng) * 0.86;
      gz = 0.85 + Math.sin(pushAng) * 0.86;
    }
    if (isInsideVillaFootprint(gx, gz, 0.08)) {
      const [wx, , wz] = villaLocalToWorld(-2.75, 0, 1.35);
      gx = wx;
      gz = wz;
    }
    const dome = Math.sqrt(Math.max(0, 1 - (rad / (cloud.r + 0.01)) ** 2));
    const gy = meadowHeight(gx, gz) + 0.09 + dome * cloud.h + (rng() - 0.5) * 0.07;

    dummy.position.set(gx, gy, gz);
    dummy.rotation.set((rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.5);
    dummy.scale.setScalar(0.58 + rng() * 0.46);
    dummy.updateMatrix();
    gypInstanced.setMatrixAt(i, dummy.matrix);
    gypInstanced.setColorAt(i, gypTints[i % gypTints.length]);
  }
  gypInstanced.instanceMatrix.needsUpdate = true;
  if (gypInstanced.instanceColor) gypInstanced.instanceColor.needsUpdate = true;
  scene.add(gypInstanced);

  // --- 7. 18,000 SOFT MULTI-TONED FAIRYTALE GRASSLAND BLADES (Sparing Winding Path & Pond!) ---
  const grassGeo = createGrassBladeGeometry();
  const maxBlades = 18000;
  const grassInstanced = new THREE.InstancedMesh(grassGeo, grassMat, maxBlades);
  const grassTints = [
    new THREE.Color('#6ee7b7'),
    new THREE.Color('#86efac'),
    new THREE.Color('#5eead4'),
    new THREE.Color('#bef264')
  ];

  let gPlaced = 0;
  for (let attempt = 0; attempt < maxBlades * 2 && gPlaced < maxBlades; attempt++) {
    const x = (rng() - 0.5) * 21.0;
    const z = 5.2 - Math.pow(rng(), 0.85) * 12.2;
    const dP = distToPath(x, z);
    if (dP < 0.46) continue; // Keep winding country dirt lane clean & crisp!
    if (Math.hypot(x + 1.48, z - 0.85) < 0.78) continue; // Keep mirror dew pond & Frog Prince clear!
    if (Math.hypot(x - 2.35, z + 0.15) < 0.62) continue; // Keep 7-mushroom fairy ring visible!
    if (isInsideVillaFootprint(x, z, 0.08)) continue; // Keep 2BR+1LR Villa floor & steps spotless!

    const y = meadowHeight(x, z);
    const vergeShorten = smoothstep(0.46, 0.86, dP);
    const slopeExpose = Math.hypot(x - 2.35, z - 1.35) < 0.85 ? 0.52 : 1.0; // Let warm earthen slope peek through!
    const bottleTrim = Math.hypot(x - 0.82, z - 2.12) < 0.38 ? 0.30 : 1.0;

    dummy.position.set(x, y, z);
    dummy.rotation.set((rng() - 0.5) * 0.22, rng() * Math.PI * 2, (rng() - 0.5) * 0.22);
    const wScale = 0.82 + rng() * 0.52;
    const hScale = (0.34 + rng() * 0.58) * (0.35 + 0.65 * vergeShorten) * bottleTrim * slopeExpose;
    dummy.scale.set(wScale, hScale, 1);
    dummy.updateMatrix();
    grassInstanced.setMatrixAt(gPlaced, dummy.matrix);

    colorTmp.setRGB(0.84, 0.94, 0.86).lerp(grassTints[gPlaced % grassTints.length], 0.20);
    grassInstanced.setColorAt(gPlaced, colorTmp);
    gPlaced++;
  }
  grassInstanced.count = gPlaced;
  grassInstanced.instanceMatrix.needsUpdate = true;
  if (grassInstanced.instanceColor) grassInstanced.instanceColor.needsUpdate = true;
  scene.add(grassInstanced);

  // ==========================================================================
  // E. 5 CORE LOVE-CONFESSION LANDMARKS + CRYSTAL STAR-SAND WISH BOTTLE
  // ==========================================================================
  const eggNodes = new Map();
  const raycastTargets = [...worldProps.raycastTargets, fairySprite.hitSphere];

  for (const egg of eggs) {
    const [ex, ey, ez] = egg.position;
    const worldY = egg.kind === 'meteor' ? ey : meadowHeight(ex, ez) + 0.42;
    const anchor = new THREE.Vector3(ex, worldY, ez);
    const eggGroup = new THREE.Group();
    eggGroup.position.copy(anchor);
    scene.add(eggGroup);

    const ringGeo = new THREE.RingGeometry(0.42, 0.49, 48);
    ringGeo.rotateX(-Math.PI * 0.5);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(egg.color || '#7dd3fc'),
      transparent: true,
      opacity: egg.kind === 'meteor' ? 0.0 : 0.28,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = -0.34;
    eggGroup.add(ringMesh);

    if (egg.kind === 'bottle') {
      // Sculpted Fresnel-Glass Apothecary Wish Bottle beside the central bend of the dirt path!
      const bottleGroup = new THREE.Group();
      bottleGroup.position.y = -0.06;
      bottleGroup.rotation.z = 0.22;
      bottleGroup.rotation.x = 0.08;
      bottleGroup.scale.setScalar(1.22);

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
            vec3 col = mix(vec3(0.24, 0.62, 0.95), vec3(0.92, 0.98, 1.0), fresnel);
            gl_FragColor = vec4(col, 0.24 + 0.68 * fresnel);
          }
        `
      });

      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.44, 28, 1, true), glassMat);
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

      const bottleFallback = new THREE.Group();
      bottleFallback.add(starSand, scroll, scrollRibbon, body, shoulder, neck, lipRing, goldRibbon, cork);
      bottleGroup.add(bottleFallback);
      eggGroup.add(bottleGroup);

      worldProps.onWishBottleReady((sculptedBottle) => {
        sculptedBottle.position.set(0, 0, 0);
        const glassMesh = sculptedBottle.getObjectByName('BottleGlassMesh');
        if (glassMesh) {
          glassMesh.material = glassMat;
        }
        bottleGroup.remove(bottleFallback);
        bottleGroup.add(sculptedBottle);
      });
    }

    const hitSphere = new THREE.Mesh(
      new THREE.SphereGeometry(egg.kind === 'meteor' ? 1.45 : 1.05, 12, 12),
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
      unlocked: false
    });
  }

  // Upgrade GPU-instanced flower species with Blender 4.0 Subdivision-Sculpted .glb Bloom Meshes!
  let botanicalGlbLoaded = false;

  function prepareSculptedBloomGeometry(
    meshNode,
    { tiltX = 0, innerRadiusMax = 0.14, aoFloor = 0.50, uniformShade = false } = {}
  ) {
    if (!meshNode || !meshNode.geometry) return null;
    const geo = meshNode.geometry.clone();
    meshNode.updateMatrix();
    if (meshNode.matrix && !meshNode.matrix.equals(new THREE.Matrix4())) {
      geo.applyMatrix4(meshNode.matrix);
    }
    const posAttr = geo.attributes.position;
    const uvAttr = geo.attributes.uv;
    if (!posAttr || !uvAttr) return null;

    const cosT = Math.cos(-tiltX);
    const sinT = Math.sin(-tiltX);
    const count = posAttr.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      let shade = 0.96;
      if (!uniformShade) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        // Un-rotate baked bloom tilt so radial AO centers cleanly on the true inner bud heart!
        const uz = y * sinT + z * cosT;
        const r = Math.hypot(x, uz);
        const u = clamp(uvAttr.getY(i), 0, 1);
        const radialAo = aoFloor + (1.0 - aoFloor) * smoothstep(0.008, innerRadiusMax, r);
        shade = radialAo * (0.62 + 0.38 * u);
      }
      colors[i * 3] = shade;
      colors[i * 3 + 1] = shade;
      colors[i * 3 + 2] = shade;
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeBoundingSphere();
    return geo;
  }

  loadFairytaleGlb('./assets/models/botanical_blooms.glb')
    .then((gltf) => {
      const sculptedRose = prepareSculptedBloomGeometry(gltf.scene.getObjectByName('RoseBloom'), {
        tiltX: 0.28,
        innerRadiusMax: 0.15,
        aoFloor: 0.40
      });
      if (sculptedRose) {
        roseInstanced.geometry.dispose();
        roseInstanced.geometry = sculptedRose;
      }
      const sculptedRoseCalyx = prepareSculptedBloomGeometry(gltf.scene.getObjectByName('RoseCalyx'), {
        tiltX: 0.28,
        innerRadiusMax: 0.12,
        aoFloor: 0.65
      });
      if (sculptedRoseCalyx) {
        roseCalyxInstanced.geometry.dispose();
        roseCalyxInstanced.geometry = sculptedRoseCalyx;
        roseCalyxInstanced.visible = true;
      }
      const sculptedSunRays = prepareSculptedBloomGeometry(gltf.scene.getObjectByName('SunflowerRays'), {
        tiltX: 0.58,
        innerRadiusMax: 0.28,
        aoFloor: 0.74
      });
      if (sculptedSunRays) {
        sunRaysInstanced.geometry.dispose();
        sunRaysInstanced.geometry = sculptedSunRays;
      }
      const sculptedSunCalyx = prepareSculptedBloomGeometry(gltf.scene.getObjectByName('SunflowerCalyx'), {
        tiltX: 0.58,
        innerRadiusMax: 0.18,
        aoFloor: 0.62
      });
      if (sculptedSunCalyx) {
        sunCalyxInstanced.geometry.dispose();
        sunCalyxInstanced.geometry = sculptedSunCalyx;
        sunCalyxInstanced.visible = true;
      }
      const sculptedTulip = prepareSculptedBloomGeometry(gltf.scene.getObjectByName('TulipBloom'), {
        tiltX: 0.16,
        innerRadiusMax: 0.10,
        aoFloor: 0.60
      });
      if (sculptedTulip) {
        tulipInstanced.geometry.dispose();
        tulipInstanced.geometry = sculptedTulip;
      }
      const sculptedIris = prepareSculptedBloomGeometry(gltf.scene.getObjectByName('IrisBloom'), {
        innerRadiusMax: 0.16,
        aoFloor: 0.56
      });
      if (sculptedIris) {
        irisInstanced.geometry.dispose();
        irisInstanced.geometry = sculptedIris;
      }
      const sculptedHydrangea = prepareSculptedBloomGeometry(gltf.scene.getObjectByName('HydrangeaFloret'), {
        innerRadiusMax: 0.08,
        aoFloor: 0.68
      });
      if (sculptedHydrangea) {
        hydrangeaInstanced.geometry.dispose();
        hydrangeaInstanced.geometry = sculptedHydrangea;
      }
      const sculptedGyp = prepareSculptedBloomGeometry(gltf.scene.getObjectByName('GypsophilaCluster'), {
        uniformShade: true
      });
      if (sculptedGyp) {
        gypInstanced.geometry.dispose();
        gypInstanced.geometry = sculptedGyp;
      }
      botanicalGlbLoaded = true;
    })
    .catch((err) => {
      console.warn('[flower-meadow] Fallback procedural blooms active:', err);
    });

  // --- 260 Dreamy Fairytale Fireflies ---
  const fireflyCount = 260;
  const ffPos = new Float32Array(fireflyCount * 3);
  const ffSeed = new Float32Array(fireflyCount * 4);
  const ffColor = new Float32Array(fireflyCount * 3);

  for (let i = 0; i < fireflyCount; i++) {
    const fx = (rng() - 0.5) * 16.5;
    const fz = 4.6 - rng() * 11.8;
    const fy = isInsideVillaFootprint(fx, fz, 0.35)
      ? VILLA_TERRACE_Y + 2.65 + rng() * 1.1
      : meadowHeight(fx, fz) + 0.18 + rng() * 2.0;
    ffPos[i * 3] = fx;
    ffPos[i * 3 + 1] = fy;
    ffPos[i * 3 + 2] = fz;

    ffSeed[i * 4] = rng() * Math.PI * 2;
    ffSeed[i * 4 + 1] = 0.55 + rng() * 1.15;
    ffSeed[i * 4 + 2] = 0.18 + rng() * 0.28;
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
        p.x += sin(t * 1.05) * 0.44 + cos(t * 0.48) * 0.20;
        p.y += sin(t * 1.32) * 0.24 + uFinaleProgress * (0.85 + aSeed.w * 2.2);
        p.z += cos(t * 0.88) * 0.42;
        vPulse = 0.30 + 0.70 * pow(0.5 + 0.5 * sin(t * 2.1), 2.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (15.0 + 11.0 * vPulse) * aSeed.z * uPixelRatio * (15.0 / max(2.2, -mv.z));
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vPulse;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float core = exp(-d * d * 42.0);
        float halo = exp(-d * d * 12.0) * 0.52;
        float glow = (core + halo) * vPulse;
        if (glow < 0.015) discard;
        vec3 srgb = pow(clamp(vColor, 0.0, 1.0), vec3(1.0 / 2.2));
        gl_FragColor = vec4(mix(srgb, vec3(1.0, 0.99, 0.92), core * 0.6), clamp(glow, 0.0, 1.0));
      }
    `
  });
  scene.add(new THREE.Points(ffGeo, ffMat));

  // ==========================================================================
  // F. CAMERA MODES (PANORAMA / FOLLOW SPRITE / FOCUS) & POINTER INTERACTION
  // ==========================================================================
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();
  const parallaxOffset = new THREE.Vector2(0, 0);
  const zoomDirTmp = new THREE.Vector3();
  let dragYaw = 0;
  let dragPitch = 0;
  let exploreZoom = 0;

  function applyExploreZoom() {
    if (Math.abs(exploreZoom) < 0.001) return;
    zoomDirTmp.copy(cameraTargetPos).sub(cameraTargetLook);
    const len = zoomDirTmp.length();
    if (len < 0.25) return;
    zoomDirTmp.divideScalar(len);
    const nextLen = clamp(len + exploreZoom, 1.35, 13.5);
    cameraTargetPos.copy(cameraTargetLook).addScaledVector(zoomDirTmp, nextLen);
  }

  function resize() {
    if (disposed) return;
    const width = Math.max(1, canvas.clientWidth || window.innerWidth || 1280);
    const height = Math.max(1, canvas.clientHeight || window.innerHeight || 720);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < 640 ? 54 : 45;
    camera.updateProjectionMatrix();
    ffMat.uniforms.uPixelRatio.value = dpr;
  }

  resize();

  function updateCameraTargets(nowMs) {
    if (focusedTarget && nowMs < focusUntil) {
      cameraTargetPos.copy(focusedTarget.camPos);
      cameraTargetLook.copy(focusedTarget.lookAt);
      if (!scrollCameraMode) {
        cameraTargetPos.x += dragYaw * 1.45;
        cameraTargetPos.y += dragPitch * 0.65;
        applyExploreZoom();
      }
      return;
    }
    focusedTarget = null;

    if (followSpriteMode) {
      // Cozy third-person fairytale follow camera gliding softly behind the exploring sprite!
      const sp = fairySprite.getPosition();
      cameraTargetPos.set(
        sp.x * 0.82 + parallaxOffset.x * 0.65 + dragYaw * 1.6,
        sp.y + 1.52 + dragPitch * 0.45,
        sp.z + 3.35
      );
      cameraTargetLook.set(
        sp.x,
        sp.y + 0.36 + dragPitch * 0.45,
        sp.z - 1.25
      );
      applyExploreZoom();
      return;
    }

    if (scrollCameraMode) {
      cameraTargetPos.set(
        scrollCamPos.x + parallaxOffset.x * 0.24,
        scrollCamPos.y + parallaxOffset.y * 0.10,
        scrollCamPos.z
      );
      cameraTargetLook.set(
        scrollCamLook.x + parallaxOffset.x * 0.14,
        scrollCamLook.y + parallaxOffset.y * 0.08,
        scrollCamLook.z
      );
      return;
    }

    if (macroMode) {
      cameraTargetPos.set(
        parallaxOffset.x * 1.05 + dragYaw * 2.0,
        1.25 + parallaxOffset.y * 0.22 + dragPitch * 0.48,
        4.45
      );
      cameraTargetLook.set(
        parallaxOffset.x * 0.55 + dragYaw * 2.5,
        0.42 + dragPitch * 0.65,
        -1.2
      );
    } else {
      cameraTargetPos.set(
        cameraBase.x + parallaxOffset.x * 1.10 + dragYaw * 2.2,
        cameraBase.y + parallaxOffset.y * 0.24 + dragPitch * 0.55,
        cameraBase.z
      );
      cameraTargetLook.set(
        cameraLookBase.x + parallaxOffset.x * 0.68 + dragYaw * 2.8,
        cameraLookBase.y + parallaxOffset.y * 0.32 + dragPitch * 0.80,
        cameraLookBase.z
      );
    }
    applyExploreZoom();
  }

  let lastFrameMs = performance.now();
  let rafId = 0;

  function renderFrame(nowMs = performance.now()) {
    if (disposed) return;
    const dt = Math.min(0.06, Math.max(0.001, (nowMs - lastFrameMs) / 1000));
    lastFrameMs = nowMs;

    sharedUniforms.uTime.value += dt;
    const timeSec = sharedUniforms.uTime.value;
    sharedUniforms.uPointerActive.value = Math.max(0, sharedUniforms.uPointerActive.value - dt * 0.85);

    for (let i = 0; i < ripples.length; i++) {
      if (ripples[i].w >= 0) {
        ripples[i].w += dt * 4.4;
        if (ripples[i].w > 12.0) ripples[i].w = -1;
      }
    }

    finaleProgress += (targetFinale - finaleProgress) * Math.min(1, dt * 1.8);
    sharedUniforms.uFinaleProgress.value = finaleProgress;

    // Update the free-roaming Exploring Fairy Sprite & sync her warm lantern light!
    fairySprite.update(dt, timeSec, renderer.getPixelRatio());
    fairySprite.getLanternWorldPos(sharedUniforms.uFairyLightPos.value);

    // Update interactive 3D fairytale props (chimney hearts, mushroom bounce, dandelions, pond ripples)
    worldProps.update(dt, timeSec);

    eggNodes.forEach((node, id) => {
      const pulse = 0.5 + 0.5 * Math.sin(timeSec * 2.8 + id.length);
      node.ringMesh.scale.setScalar(0.92 + pulse * 0.16);
      if (node.egg.kind !== 'meteor') {
        node.ringMesh.material.opacity = node.unlocked ? 0.14 : 0.24 + pulse * 0.18;
      }
    });

    updateCameraTargets(nowMs);
    const lerpSpeed = scrollCameraMode && !(focusedTarget && nowMs < focusUntil) && !followSpriteMode ? 9.5 : 3.4;
    const camLerp = 1 - Math.exp(-dt * lerpSpeed);
    cameraCurrentPos.lerp(cameraTargetPos, camLerp);
    cameraCurrentLook.lerp(cameraTargetLook, camLerp);
    camera.position.copy(cameraCurrentPos);
    camera.lookAt(cameraCurrentLook);

    renderer.render(scene, camera);
    renderCount += 1;
    rafId = window.requestAnimationFrame(renderFrame);
  }

  // Pointer grass-parting, drag-orbit & click-to-explore / click-on-secret!
  let isPointerDown = false;
  let downX = 0;
  let downY = 0;
  let movedDist = 0;

  function updatePointerNDC(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    pointerNDC.x = ((clientX - rect.left) / w) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / h) * 2 + 1;
  }

  function onPointerMove(ev) {
    updatePointerNDC(ev.clientX, ev.clientY);
    parallaxOffset.set(pointerNDC.x * 0.36, pointerNDC.y * 0.22);

    if (isPointerDown) {
      const dx = ev.clientX - downX;
      const dy = ev.clientY - downY;
      movedDist += Math.hypot(dx, dy);
      if (!scrollCameraMode || followSpriteMode) {
        dragYaw = clamp(dragYaw - dx * 0.0022, -1.15, 1.15);
        dragPitch = clamp(dragPitch - dy * 0.0018, -0.45, 0.52);
      }
      downX = ev.clientX;
      downY = ev.clientY;
    }

    raycaster.setFromCamera(pointerNDC, camera);
    const groundHits = raycaster.intersectObject(terrainMesh, false);
    if (groundHits.length > 0) {
      sharedUniforms.uPointerWorld.value.copy(groundHits[0].point);
      sharedUniforms.uPointerActive.value = 1.0;
    }
  }

  function onPointerDown(ev) {
    isPointerDown = true;
    downX = ev.clientX;
    downY = ev.clientY;
    movedDist = 0;
    updatePointerNDC(ev.clientX, ev.clientY);
  }

  function onPointerUp(ev) {
    if (!isPointerDown) return;
    isPointerDown = false;
    if (movedDist > 10) return;

    updatePointerNDC(ev.clientX, ev.clientY);
    raycaster.setFromCamera(pointerNDC, camera);

    // 1. Check 5 Core Confession Eggs AND 8 Interactive Fairytale Wonders / Sprite!
    const hits = raycaster.intersectObjects(raycastTargets, false);
    if (hits.length > 0) {
      const ud = hits[0].object.userData;
      if (ud.eggId) {
        focusEgg(ud.eggId);
        onEggTrigger(ud.eggId);
        return;
      }
      if (ud.wonderId) {
        triggerWonder(ud.wonderId);
        return;
      }
    }

    // 2. Clicking anywhere on the grassland or winding path sends the Exploring Sprite there!
    const groundHits = raycaster.intersectObject(terrainMesh, false);
    if (groundHits.length > 0) {
      const pt = groundHits[0].point;
      spawnRipple(pt.x, pt.y, pt.z);
      fairySprite.walkTo(pt.x, pt.z);
    } else {
      const rect = canvas.getBoundingClientRect();
      const nx = (ev.clientX - rect.left) / Math.max(1, rect.width);
      const ny = (ev.clientY - rect.top) / Math.max(1, rect.height);
      onSkyTap({ nx, ny });
    }
  }

  function onWheel(ev) {
    if (scrollCameraMode) return;
    ev.preventDefault();
    const step = Math.sign(ev.deltaY) * 0.42;
    exploreZoom = clamp(exploreZoom + step, -4.2, 2.6);
  }

  canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('resize', resize);

  function focusEgg(eggId) {
    const node = eggNodes.get(eggId);
    if (!node) return;
    const [ox, oy, oz] = node.egg.cameraOffset || [0, 1.5, 4.4];
    focusedTarget = {
      camPos: new THREE.Vector3(ox, oy, oz),
      lookAt: node.anchor.clone()
    };
    focusUntil = performance.now() + 9500;
    spawnRipple(node.anchor.x, meadowHeight(node.anchor.x, node.anchor.z), node.anchor.z);
    if (node.egg.kind !== 'meteor') {
      fairySprite.walkTo(node.anchor.x - 0.35, node.anchor.z + 0.38);
    }
  }

  function triggerWonder(wonderId) {
    if (wonderId === 'wonder-sprite') {
      fairySprite.triggerJoySpin();
      const sp = fairySprite.getPosition();
      spawnRipple(sp.x, sp.y, sp.z);
      onWonderTrigger('wonder-sprite');
      return;
    }

    worldProps.triggerWonderEffect(wonderId);
    const anchor = worldProps.wonderAnchors.get(wonderId);
    if (anchor) {
      if (wonderId === 'wonder-cottage') {
        const [sx, , sz] = villaLocalToWorld(0.16, 0, 2.48);
        spawnRipple(sx, meadowHeight(sx, sz), sz);
        fairySprite.walkTo(sx, sz);
        const roofOpen = worldProps.getVillaRoofOpen() > 0.45;
        const camArr = roofOpen
          ? villaLocalToWorld(0.18, 3.65, 4.15)
          : villaLocalToWorld(0.22, 1.85, 4.75);
        const lookArr = roofOpen
          ? villaLocalToWorld(-0.04, 0.52, -0.05)
          : villaLocalToWorld(-0.02, 0.92, 0.12);
        focusedTarget = {
          camPos: new THREE.Vector3(...camArr),
          lookAt: new THREE.Vector3(...lookArr)
        };
        focusUntil = performance.now() + 10500;
      } else {
        spawnRipple(anchor.x, meadowHeight(anchor.x, anchor.z), anchor.z);
        fairySprite.walkTo(anchor.x + 0.32, anchor.z + 0.42);
        focusedTarget = {
          camPos: new THREE.Vector3(
            clamp(anchor.x * 0.72, -3.4, 3.4),
            Math.max(1.25, anchor.y + 1.15),
            Math.min(7.2, anchor.z + 3.4)
          ),
          lookAt: anchor.clone()
        };
        focusUntil = performance.now() + 9500;
      }
    }
    onWonderTrigger(wonderId);
  }

  function markEggUnlocked(eggId) {
    const node = eggNodes.get(eggId);
    if (node) {
      node.unlocked = true;
      node.ringMesh.material.color.set('#fde047');
    }
  }

  function triggerFinaleState() {
    targetFinale = 1.0;
    fairySprite.triggerJoySpin('漫天星河与整片童话草坡都为你亮起来啦 ✨');
    spawnRipple(0, meadowHeight(0, 1.8), 1.8);
    spawnRipple(-2.1, meadowHeight(-2.1, 2.0), 2.0);
    spawnRipple(2.1, meadowHeight(2.1, 1.2), 1.2);
  }

  const projVec = new THREE.Vector3();
  function projectWorldMap(mapEntries) {
    const width = canvas.clientWidth || window.innerWidth || 1280;
    const height = canvas.clientHeight || window.innerHeight || 720;
    const result = {};
    mapEntries.forEach((worldVec, id) => {
      projVec.copy(worldVec);
      projVec.project(camera);
      const visible = projVec.z < 1.0 && Math.abs(projVec.x) <= 1.02 && Math.abs(projVec.y) <= 1.02;
      result[id] = {
        x: (projVec.x * 0.5 + 0.5) * width,
        y: (-projVec.y * 0.5 + 0.5) * height,
        visible
      };
    });
    return result;
  }

  function getEggScreenPositions() {
    const m = new Map();
    eggNodes.forEach((node, id) => m.set(id, node.anchor));
    return projectWorldMap(m);
  }

  function getWonderScreenPositions() {
    const m = new Map(worldProps.wonderAnchors);
    const sp = fairySprite.getPosition();
    // Offset wonder star badge delicately beside her hat tip so her porcelain face & eyes stay unobstructed!
    m.set('wonder-sprite', new THREE.Vector3(sp.x + 0.22, sp.y + 0.68, sp.z));
    return projectWorldMap(m);
  }

  function getSpriteScreenPosition() {
    const width = canvas.clientWidth || window.innerWidth || 1280;
    const height = canvas.clientHeight || window.innerHeight || 720;
    return fairySprite.getHeadScreenPos(camera, width, height);
  }

  onStatus('ready', 'Three.js fairytale flower meadow initialized');
  rafId = window.requestAnimationFrame(renderFrame);

  return {
    resize,
    focusEgg,
    focusCamera(camArr, lookArr, durationMs = 12000, snap = false) {
      focusedTarget = {
        camPos: new THREE.Vector3(...camArr),
        lookAt: new THREE.Vector3(...lookArr)
      };
      if (snap) {
        cameraCurrentPos.copy(focusedTarget.camPos);
        cameraCurrentLook.copy(focusedTarget.lookAt);
      }
      focusUntil = performance.now() + durationMs;
    },
    clearFocus() {
      focusedTarget = null;
      focusUntil = 0;
    },
    setScrollCameraMode(enabled) {
      scrollCameraMode = Boolean(enabled);
      if (scrollCameraMode) {
        followSpriteMode = false;
        macroMode = false;
        dragYaw = 0;
        dragPitch = 0;
        exploreZoom = 0;
      }
      return scrollCameraMode;
    },
    isScrollCameraMode: () => scrollCameraMode,
    setScrollCameraPose(camArr, lookArr, snap = false) {
      scrollCamPos.set(camArr[0], camArr[1], camArr[2]);
      scrollCamLook.set(lookArr[0], lookArr[1], lookArr[2]);
      if (snap) {
        focusedTarget = null;
        focusUntil = 0;
        cameraTargetPos.copy(scrollCamPos);
        cameraTargetLook.copy(scrollCamLook);
        cameraCurrentPos.copy(scrollCamPos);
        cameraCurrentLook.copy(scrollCamLook);
        camera.position.copy(scrollCamPos);
        camera.lookAt(scrollCamLook);
      }
    },
    setVillaRoofOpen: (openVal, snap = false) => worldProps.setVillaRoofOpen(openVal, snap),
    getVillaRoofOpen: () => worldProps.getVillaRoofOpen(),
    toggleVillaRoof: () => worldProps.toggleVillaRoof(),
    triggerWonder,
    markEggUnlocked,
    triggerFinaleState,
    spawnRipple,
    toggleMacroMode() {
      macroMode = !macroMode;
      if (macroMode) {
        followSpriteMode = false;
        scrollCameraMode = false;
      }
      return macroMode;
    },
    toggleFollowSprite(forceState) {
      followSpriteMode = typeof forceState === 'boolean' ? forceState : !followSpriteMode;
      if (followSpriteMode) {
        macroMode = false;
        scrollCameraMode = false;
        focusedTarget = null;
      }
      return followSpriteMode;
    },
    isFollowingSprite: () => followSpriteMode,
    nudgeSprite: (dx, dz) => fairySprite.nudge(dx, dz),
    walkSpriteTo: (x, z, msg, holdSec = 3.2) => fairySprite.walkTo(x, z, msg, holdSec),
    getEggScreenPositions,
    getWonderScreenPositions,
    getSpriteScreenPosition,
    getCameraState: () => ({
      position: cameraCurrentPos.toArray().map((v) => Number(v.toFixed(3))),
      lookAt: cameraCurrentLook.toArray().map((v) => Number(v.toFixed(3)))
    }),
    getDiagnostics() {
      const loadedModelPacks = [
        ...(fairySprite.isGlbLoaded() ? ['fairy_sprite'] : []),
        ...worldProps.getLoadedPacks(),
        ...(botanicalGlbLoaded ? ['botanical_blooms'] : [])
      ];
      return {
        engine: 'three.js',
        ready: renderCount > 0 && !disposed,
        modelsLoaded: loadedModelPacks.length === 5,
        loadedModelPacks,
        renderCount,
        species: ['hydrangea', 'sunflower', 'iris', 'rose', 'tulip', 'gypsophila'],
        counts: {
          hydrangeaFlorets: totalHydrangeaFlorets,
          sunflowers: sunflowerCoords.length,
          irises: irisCoords.length,
          roses: roseCoords.length,
          tulips: tulipCoords.length,
          gypsophila: gypCount,
          grassBlades: gPlaced
        },
        followSpriteMode,
        scrollCameraMode,
        macroMode,
        villaRoofOpen: Number(worldProps.getVillaRoofOpen().toFixed(3)),
        finaleProgress,
        spritePosition: {
          x: Number(fairySprite.getPosition().x.toFixed(2)),
          z: Number(fairySprite.getPosition().z.toFixed(2))
        },
        eggs: [...eggNodes.values()].map((n) => ({
          id: n.egg.id,
          kind: n.egg.kind,
          unlocked: n.unlocked
        })),
        wonders: [...worldProps.wonderAnchors.keys(), 'wonder-sprite']
      };
    },
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', resize);
      envRenderTarget.dispose();
      renderer.dispose();
    }
  };
}
