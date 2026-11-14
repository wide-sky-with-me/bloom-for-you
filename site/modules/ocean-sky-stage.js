// Physically-Based Golden Hour & Moonlit Night Atmospheric Sky Scattering,
// Dynamic Procedural Cubemap Environment, Glow Layer, Directional Shadow Rig,
// and Beer-Lambert Shoreline Foam Ocean Shader (Babylon 9.36 Right-Handed).

import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { RawCubeTexture } from "@babylonjs/core/Materials/Textures/rawCubeTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import "@babylonjs/core/Layers/effectLayerSceneComponent";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { ColorCurves } from "@babylonjs/core/Materials/colorCurves";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { Scene } from "@babylonjs/core/scene";
import { clamp, lerp, getTerrainMeshY, mulberry32 } from "./world-spatial.js";

export const SUN_DIRECTION = new Vector3(0.62, 0.28, 0.73).normalize();
export const MOON_DIRECTION = new Vector3(-0.46, 0.44, 0.77).normalize();

Effect.ShadersStore["irisSkyVertexShader"] = /* glsl */ `
  precision highp float;
  attribute vec3 position;
  uniform mat4 world;
  uniform mat4 viewProjection;
  varying vec3 vWorldDir;
  void main(void) {
    vec4 wp = world * vec4(position, 1.0);
    vWorldDir = normalize(wp.xyz);
    gl_Position = viewProjection * wp;
  }
`;

Effect.ShadersStore["irisSkyFragmentShader"] = /* glsl */ `
  precision highp float;
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform float uTime;
  uniform float uNightMix;
  varying vec3 vWorldDir;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbmCloud(vec2 p) {
    float v = 0.0;
    float a = 0.52;
    mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p = rot * p * 2.05 + vec2(13.7, 7.3);
      a *= 0.5;
    }
    return v;
  }

  void main(void) {
    vec3 dir = normalize(vWorldDir);
    float y = clamp(dir.y, -0.15, 1.0);
    float up = max(y, 0.0);
    float dayMix = 1.0 - uNightMix;

    vec3 dayZenith  = vec3(0.110, 0.435, 0.895);
    vec3 dayMid     = vec3(0.320, 0.720, 0.965);
    vec3 dayHorizon = vec3(0.785, 0.945, 0.995);

    vec3 nightZenith  = vec3(0.032, 0.068, 0.165);
    vec3 nightMid     = vec3(0.072, 0.145, 0.285);
    vec3 nightHorizon = vec3(0.135, 0.225, 0.385);

    vec3 zenithCol  = mix(dayZenith, nightZenith, uNightMix);
    vec3 midSkyCol  = mix(dayMid, nightMid, uNightMix);
    vec3 horizonCol = mix(dayHorizon, nightHorizon, uNightMix);

    vec3 sky = mix(horizonCol, midSkyCol, pow(up, 0.38));
    sky = mix(sky, zenithCol, pow(up, 0.88));

    float mu = max(dot(dir, normalize(uSunDir)), 0.0);
    float horizonGlow = exp(-abs(dir.y - 0.025) * 8.2) * (0.34 + 0.66 * pow(mu, 1.9));
    sky += vec3(1.00, 0.72, 0.44) * horizonGlow * 0.34 * dayMix;
    sky += vec3(1.00, 0.80, 0.54) * pow(mu, 5.5) * 0.34 * dayMix;
    sky += vec3(1.00, 0.91, 0.74) * pow(mu, 84.0) * 0.64 * dayMix;
    sky += vec3(1.00, 0.97, 0.88) * smoothstep(0.99925, 0.99982, mu) * 2.15 * dayMix;

    float moonMu = max(dot(dir, normalize(uMoonDir)), 0.0);
    if (uNightMix > 0.01 && dir.y > 0.06) {
      vec2 starUv = vec2(atan(dir.z, dir.x) * 38.0, dir.y * 92.0);
      vec2 starCell = floor(starUv);
      vec2 starFract = fract(starUv) - 0.5;
      float starSeed = hash21(starCell);
      if (starSeed > 0.965) {
        float distC = length(starFract);
        float twinkle = 0.68 + 0.32 * sin(uTime * 1.9 + starSeed * 62.0);
        float starBright = smoothstep(0.19, 0.02, distC) * twinkle * smoothstep(0.06, 0.24, dir.y);
        sky += vec3(0.84, 0.90, 1.00) * starBright * 0.78 * uNightMix;
      }
    }
    sky += vec3(0.45, 0.60, 0.84) * pow(moonMu, 9.0) * 0.22 * uNightMix;
    sky += vec3(0.82, 0.90, 1.00) * pow(moonMu, 160.0) * 0.48 * uNightMix;
    sky += vec3(0.94, 0.97, 1.00) * smoothstep(0.99945, 0.99986, moonMu) * 1.35 * uNightMix;

    if (dir.y > 0.008 && dir.y < 0.26) {
      float az = atan(dir.z, dir.x);
      vec2 bankUV = vec2(az * 2.8 + uTime * 0.0014, (dir.y - 0.01) * 11.5);
      float bankShape = fbmCloud(bankUV * vec2(1.15, 0.85)) * 0.72 + fbmCloud(bankUV * 2.7 + 4.1) * 0.28;
      float verticalEnv = smoothstep(0.008, 0.042, dir.y) * (1.0 - smoothstep(0.11, 0.24, dir.y));
      float bankMask = smoothstep(0.45, 0.66, bankShape) * verticalEnv * mix(0.88, 0.50, uNightMix);
      float rim = smoothstep(0.32, 0.76, (fbmCloud(bankUV + vec2(0.0, 0.16)) - bankShape) * -2.8 + 0.68);
      vec3 bankShadow = mix(mix(vec3(0.64, 0.78, 0.96), vec3(0.76, 0.82, 0.96), pow(mu, 1.6)), vec3(0.09, 0.14, 0.26), uNightMix);
      vec3 bankLit = mix(mix(vec3(1.00, 0.99, 0.97), vec3(1.00, 0.94, 0.82), 0.35 + 0.55 * pow(mu, 2.0)), vec3(0.24, 0.34, 0.52), uNightMix);
      sky = mix(sky, mix(bankShadow, bankLit, rim), bankMask);
    }

    if (dir.y > 0.025) {
      vec2 cloudUV = dir.xz / (dir.y + 0.16) * 1.18 + vec2(uTime * 0.0042, uTime * 0.0020);
      float cBase = fbmCloud(cloudUV);
      float cDetail = fbmCloud(cloudUV * 2.6 - vec2(uTime * 0.0028, 0.0));
      float density = smoothstep(0.50, 0.69, cBase * 0.78 + cDetail * 0.28) * smoothstep(0.025, 0.20, dir.y) * mix(0.86, 0.40, uNightMix);
      vec2 lightDir2D = normalize(mix(uSunDir.xz, uMoonDir.xz, uNightMix));
      float lightSample = fbmCloud(cloudUV + lightDir2D * 0.06);
      float selfShadow = smoothstep(0.28, 0.78, (cBase - lightSample) * 2.8 + 0.62);
      vec3 cShadow = mix(vec3(0.62, 0.77, 0.95), vec3(0.08, 0.13, 0.24), uNightMix);
      vec3 cLit = mix(mix(vec3(1.00, 0.99, 0.97), vec3(1.00, 0.94, 0.84), 0.30 + 0.55 * pow(mu, 2.2)), vec3(0.22, 0.32, 0.50), uNightMix);
      sky = mix(sky, mix(cShadow, cLit, selfShadow), density);
    }

    if (dir.y < 0.0) {
      vec3 seaBounce = mix(vec3(0.24, 0.44, 0.56), vec3(0.04, 0.09, 0.16), uNightMix);
      sky = mix(horizonCol, seaBounce, clamp(-dir.y * 5.0, 0.0, 1.0));
    }
    gl_FragColor = vec4(sky, 1.0);
  }
`;

Effect.ShadersStore["irisOceanVertexShader"] = /* glsl */ `
  precision highp float;
  attribute vec3 position;
  attribute float aWaterDepth;
  uniform mat4 world;
  uniform mat4 viewProjection;
  uniform float uTime;
  varying vec3 vWorldPos;
  varying float vDepth;

  void main(void) {
    vec4 wp = world * vec4(position, 1.0);
    float depth = aWaterDepth;
    float deepFactor = smoothstep(0.15, 3.2, depth);
    float distCalm = 1.0 - smoothstep(140.0, 680.0, length(wp.xz));
    float w1 = sin(dot(wp.xz, vec2(0.19, 0.14)) + uTime * 1.22) * 0.092;
    float w2 = sin(dot(wp.xz, vec2(-0.13, 0.22)) - uTime * 1.02 + 1.4) * 0.062;
    float w3 = cos(dot(wp.xz, vec2(0.31, -0.24)) + uTime * 1.70) * 0.030;
    wp.y += (w1 + w2 + w3) * deepFactor * distCalm;
    vWorldPos = wp.xyz;
    vDepth = depth;
    gl_Position = viewProjection * wp;
  }
`;

Effect.ShadersStore["irisOceanFragmentShader"] = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uCameraPos;
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform float uNightMix;
  uniform float uDetailScale;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec3 vWorldPos;
  varying float vDepth;

  float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float waveHeightField(vec2 p, float t, float detail) {
    float h = 0.0;
    h += sin(dot(p, vec2(0.72, 0.54)) + t * 1.60) * 0.28;
    h += sin(dot(p, vec2(-0.61, 0.83)) - t * 1.38) * 0.22;
    if (detail > 0.35) h += (vnoise(p * 1.15 + vec2(t * 0.50, -t * 0.36)) - 0.5) * 0.36;
    if (detail > 0.75) h += (vnoise(p * 2.85 - vec2(t * 0.76, t * 0.62)) - 0.5) * 0.18;
    return h;
  }

  void main(void) {
    if (vDepth < -0.18) discard;
    vec3 V = normalize(uCameraPos - vWorldPos);
    float dist = length(uCameraPos - vWorldPos);

    float eps = 0.16;
    float normalFade = (1.0 - smoothstep(95.0, 520.0, dist));
    float hC = waveHeightField(vWorldPos.xz, uTime, uDetailScale);
    float hX = waveHeightField(vWorldPos.xz + vec2(eps, 0.0), uTime, uDetailScale);
    float hZ = waveHeightField(vWorldPos.xz + vec2(0.0, eps), uTime, uDetailScale);
    vec3 N = normalize(vec3((hC - hX) * 0.34 * normalFade, 1.0, (hC - hZ) * 0.34 * normalFade));

    vec3 shallowTurquoise = mix(vec3(0.13, 0.82, 0.85), vec3(0.06, 0.26, 0.38), uNightMix);
    vec3 midEmerald       = mix(vec3(0.06, 0.56, 0.80), vec3(0.030, 0.155, 0.290), uNightMix);
    vec3 deepSapphire     = mix(vec3(0.038, 0.275, 0.610), vec3(0.018, 0.080, 0.190), uNightMix);

    float tMid  = 1.0 - exp(-max(vDepth, 0.0) * 0.58);
    float tDeep = 1.0 - exp(-max(vDepth - 1.4, 0.0) * 0.28);
    vec3 waterBody = mix(shallowTurquoise, midEmerald, tMid);
    waterBody = mix(waterBody, deepSapphire, tDeep);

    vec3 L = normalize(mix(uSunDir, uMoonDir, uNightMix));
    float sss = clamp(dot(L, -V + N * 0.65), 0.0, 1.0);
    waterBody += mix(vec3(0.07, 0.24, 0.22), vec3(0.02, 0.08, 0.12), uNightMix) * pow(sss, 3.0) * (0.4 + 0.6 * normalFade);

    float NdotV = max(dot(N, V), 0.02);
    float fresnel = 0.025 + 0.975 * pow(1.0 - NdotV, 4.6);
    vec3 R = reflect(-V, N);
    vec3 reflSky = mix(
      mix(vec3(0.78, 0.93, 0.99), vec3(0.15, 0.26, 0.44), uNightMix),
      mix(vec3(0.18, 0.55, 0.92), vec3(0.04, 0.10, 0.24), uNightMix),
      clamp(R.y * 1.4, 0.0, 1.0)
    );
    vec3 col = mix(waterBody, reflSky, clamp(fresnel * 0.78, 0.0, 0.82));

    vec3 H = normalize(L + V);
    float NdotH = max(dot(N, H), 0.0);
    float spec = pow(NdotH, 320.0) * mix(3.4, 1.85, uNightMix) + pow(NdotH, 26.0) * mix(0.18, 0.09, uNightMix);
    col += mix(vec3(1.00, 0.88, 0.66), vec3(0.76, 0.86, 1.00), uNightMix) * spec;

    if (vDepth < 1.65) {
      float waveA = sin(vDepth * 10.5 - uTime * 2.15 + vWorldPos.x * 0.16) * 0.5 + 0.5;
      float waveB = sin(vDepth * 21.0 - uTime * 3.10 - vWorldPos.z * 0.22) * 0.5 + 0.5;
      float laceA = vnoise(vWorldPos.xz * 2.1 + vec2(uTime * 0.22, -uTime * 0.16));
      float laceB = vnoise(vWorldPos.xz * 5.2 - vec2(uTime * 0.34, uTime * 0.28));
      float swashEnv = smoothstep(0.02, 0.24, vDepth) * (1.0 - smoothstep(0.35, 1.45, vDepth));
      float wavePattern = 0.28 * pow(waveA, 1.6) + 0.22 * pow(waveB, 2.2) + 0.50 * swashEnv;
      float laceNoise = laceA * 0.65 + laceB * 0.35;
      float foamMask = smoothstep(0.42, 0.78, wavePattern * (0.45 + 0.75 * laceNoise));
      float innerRim = (1.0 - smoothstep(0.0, 0.28, vDepth)) * smoothstep(0.32, 0.68, laceNoise) * 0.52;
      foamMask = clamp(foamMask + innerRim, 0.0, 1.0);
      vec3 foamCol = mix(vec3(0.97, 0.96, 0.93), vec3(0.54, 0.66, 0.80), uNightMix);
      col = mix(col, foamCol, foamMask * mix(0.84, 0.58, uNightMix));
    }

    float alpha = clamp(smoothstep(-0.08, 0.52, vDepth) * 0.92 + 0.04, 0.0, 0.97);
    if (dist > 145.0) alpha = 0.99;

    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));
    gl_FragColor = vec4(col, alpha);
  }
`;

function buildProceduralSkyCubeData(nightMix, size = 48) {
  const dayTop = [0.16, 0.50, 0.92];
  const dayHor = [0.80, 0.94, 0.99];
  const dayBot = [0.22, 0.52, 0.66];
  const nightTop = [0.05, 0.10, 0.22];
  const nightHor = [0.16, 0.25, 0.42];
  const nightBot = [0.04, 0.09, 0.16];

  const cTop = dayTop.map((v, i) => lerp(v, nightTop[i], nightMix));
  const cHor = dayHor.map((v, i) => lerp(v, nightHor[i], nightMix));
  const cBot = dayBot.map((v, i) => lerp(v, nightBot[i], nightMix));
  const keyDir = Vector3.Lerp(SUN_DIRECTION, MOON_DIRECTION, nightMix).normalize();
  const keyCol = [lerp(1.35, 0.65, nightMix), lerp(1.12, 0.82, nightMix), lerp(0.84, 1.05, nightMix)];

  const dirVec = (face, u, v) => {
    switch (face) {
      case 0: return [1, -v, -u];
      case 1: return [-1, -v, u];
      case 2: return [u, 1, v];
      case 3: return [u, -1, -v];
      case 4: return [u, -v, 1];
      default: return [-u, -v, -1];
    }
  };

  const faces = [];
  for (let f = 0; f < 6; f += 1) {
    const buf = new Uint8Array(size * size * 4);
    let idx = 0;
    for (let y = 0; y < size; y += 1) {
      const v = (y / (size - 1)) * 2 - 1;
      for (let x = 0; x < size; x += 1) {
        const u = (x / (size - 1)) * 2 - 1;
        const [dx, dy, dz] = dirVec(f, u, v);
        const len = Math.hypot(dx, dy, dz) || 1;
        const ndx = dx / len;
        const ndy = dy / len;
        const ndz = dz / len;
        let r;
        let g;
        let b;
        if (ndy >= 0) {
          const t = Math.pow(ndy, 0.62);
          r = lerp(cHor[0], cTop[0], t);
          g = lerp(cHor[1], cTop[1], t);
          b = lerp(cHor[2], cTop[2], t);
        } else {
          const t = clamp(-ndy * 1.45, 0, 1);
          r = lerp(cHor[0], cBot[0], t);
          g = lerp(cHor[1], cBot[1], t);
          b = lerp(cHor[2], cBot[2], t);
        }
        const keyDot = clamp(ndx * keyDir.x + ndy * keyDir.y + ndz * keyDir.z, 0, 1);
        const halo = Math.pow(keyDot, 6.0) * 0.28 + Math.pow(keyDot, 48.0) * 0.72;
        r = clamp(r + keyCol[0] * halo, 0, 1);
        g = clamp(g + keyCol[1] * halo, 0, 1);
        b = clamp(b + keyCol[2] * halo, 0, 1);
        buf[idx++] = Math.round(r * 255);
        buf[idx++] = Math.round(g * 255);
        buf[idx++] = Math.round(b * 255);
        buf[idx++] = 255;
      }
    }
    faces.push(buf);
  }
  return faces;
}

function buildOceanMesh(scene) {
  const N = 160;
  const span = 520;
  const remap = (u) => {
    const s = Math.sign(u);
    const a = Math.abs(u);
    return s * (a * 0.24 + Math.pow(a, 2.35) * 0.76) * span;
  };

  const count = (N + 1) * (N + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const depths = new Float32Array(count);

  let vi = 0;
  for (let row = 0; row <= N; row += 1) {
    const vz = (row / N) * 2 - 1;
    const z = remap(vz);
    for (let col = 0; col <= N; col += 1) {
      const ux = (col / N) * 2 - 1;
      const x = remap(ux);
      const bedY = getTerrainMeshY(x, z);
      const depth = bedY > 0.25 && Math.abs(x) < 135 && Math.abs(z) < 135 ? -bedY : Math.max(-2.0, -bedY);
      positions[vi * 3 + 0] = x;
      positions[vi * 3 + 1] = 0.0;
      positions[vi * 3 + 2] = z;
      normals[vi * 3 + 1] = 1.0;
      uvs[vi * 2 + 0] = col / N;
      uvs[vi * 2 + 1] = row / N;
      depths[vi] = depth;
      vi += 1;
    }
  }

  const indices = new Uint32Array(N * N * 6);
  let ii = 0;
  for (let row = 0; row < N; row += 1) {
    for (let col = 0; col < N; col += 1) {
      const a = row * (N + 1) + col;
      const b = a + 1;
      const c = (row + 1) * (N + 1) + col;
      const d = c + 1;
      // Right-handed +Y upward CCW winding: (a, c, b) & (b, c, d)
      indices[ii++] = a;
      indices[ii++] = c;
      indices[ii++] = b;
      indices[ii++] = b;
      indices[ii++] = c;
      indices[ii++] = d;
    }
  }

  const mesh = new Mesh("BeerLambertOcean", scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.uvs = uvs;
  vd.indices = indices;
  vd.applyToMesh(mesh, false);
  mesh.setVerticesBuffer(new VertexBuffer(scene.getEngine(), depths, "aWaterDepth", false, false, 1));
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  return mesh;
}

export function buildOceanAndSky(scene, { isSoftware = false, camera = scene.activeCamera } = {}) {
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = 1.06;

  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = new Color3(0.84, 0.80, 0.78);
  scene.fogDensity = 0.00145;
  scene.clearColor = new Color4(0.82, 0.76, 0.72, 1.0);

  // Offline procedural 48x48 Sky + Sun/Sea-Bounce IBL CubeMap for crisp PBR reflections
  const envTex = new RawCubeTexture(
    scene,
    buildProceduralSkyCubeData(0.0, 48),
    48,
    Constants.TEXTUREFORMAT_RGBA,
    Constants.TEXTURETYPE_UNSIGNED_BYTE,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE
  );
  scene.environmentTexture = envTex;
  scene.environmentIntensity = 0.92;

  // Sky Dome
  const skyDome = CreateSphere("SkyDome", { diameter: 2900, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
  skyDome.isPickable = false;
  skyDome.applyFog = false;
  skyDome.infiniteDistance = true;

  const skyMat = new ShaderMaterial(
    "SkyShaderMat",
    scene,
    { vertex: "irisSky", fragment: "irisSky" },
    {
      attributes: ["position"],
      uniforms: ["world", "viewProjection", "uSunDir", "uMoonDir", "uTime", "uNightMix"],
    }
  );
  skyMat.backFaceCulling = false;
  skyMat.disableDepthWrite = true;
  skyMat.setVector3("uSunDir", SUN_DIRECTION);
  skyMat.setVector3("uMoonDir", MOON_DIRECTION);
  skyMat.setFloat("uTime", 0);
  skyMat.setFloat("uNightMix", 0);
  skyDome.material = skyMat;

  // Beer-Lambert Animated Ocean
  const oceanMesh = buildOceanMesh(scene);
  const oceanMat = new ShaderMaterial(
    "OceanShaderMat",
    scene,
    { vertex: "irisOcean", fragment: "irisOcean" },
    {
      attributes: ["position", "aWaterDepth"],
      uniforms: [
        "world",
        "viewProjection",
        "uTime",
        "uCameraPos",
        "uSunDir",
        "uMoonDir",
        "uNightMix",
        "uDetailScale",
        "uFogColor",
        "uFogDensity",
      ],
      needAlphaBlending: true,
    }
  );
  oceanMat.backFaceCulling = false;
  oceanMat.alphaMode = Constants.ALPHA_COMBINE;
  oceanMat.setFloat("uTime", 0);
  oceanMat.setVector3("uCameraPos", new Vector3(0, 20, 40));
  oceanMat.setVector3("uSunDir", SUN_DIRECTION);
  oceanMat.setVector3("uMoonDir", MOON_DIRECTION);
  oceanMat.setFloat("uNightMix", 0);
  oceanMat.setFloat("uDetailScale", 1.0);
  oceanMat.setColor3("uFogColor", scene.fogColor);
  oceanMat.setFloat("uFogDensity", scene.fogDensity);
  oceanMesh.material = oceanMat;

  // Lights & Shadows (Teyvat vibrant daylight + crisp cel shadow fill)
  const hemiLight = new HemisphericLight("SkyHemiLight", new Vector3(0, 1, 0), scene);
  hemiLight.diffuse = new Color3(0.94, 0.98, 1.00);
  hemiLight.groundColor = new Color3(0.42, 0.56, 0.68);
  hemiLight.intensity = 0.88;

  const sunLight = new DirectionalLight("SunDirLight", SUN_DIRECTION.scale(-1), scene);
  sunLight.position = SUN_DIRECTION.scale(115);
  sunLight.diffuse = new Color3(1.0, 0.96, 0.88);
  sunLight.specular = new Color3(1.0, 0.97, 0.90);
  sunLight.intensity = 2.48;
  sunLight.shadowMinZ = 18;
  sunLight.shadowMaxZ = 280;
  sunLight.orthoLeft = -68;
  sunLight.orthoRight = 68;
  sunLight.orthoTop = 68;
  sunLight.orthoBottom = -68;

  const shadowGen = new CascadedShadowGenerator(2048, sunLight, false, camera);
  shadowGen.numCascades = 3;
  shadowGen.cascadeBlendPercentage = 0.08;
  shadowGen.stabilizeCascades = true;
  shadowGen.shadowMaxZ = 185;
  shadowGen.lambda = 0.78;
  shadowGen.depthClamp = true;
  shadowGen.autoCalcDepthBounds = false;
  shadowGen.usePercentageCloserFiltering = true;
  shadowGen.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadowGen.bias = 0.0022;
  shadowGen.normalBias = 0.022;

  const glowLayer = new GlowLayer("EstateGlow", scene, { mainTextureFixedSize: 256, blurKernelSize: 24 });
  glowLayer.intensity = 0.26;

  // Unity URP-grade Screen-Space Ambient Occlusion (GeometryBuffer) + HDR Post-Processing Stack
  let ssaoPipeline = null;
  try {
    if (SSAO2RenderingPipeline.IsSupported && camera) {
      ssaoPipeline = new SSAO2RenderingPipeline(
        "IrisBaySSAO",
        scene,
        { ssaoRatio: isSoftware ? 0.35 : 0.5, blurRatio: isSoftware ? 0.5 : 0.75 },
        [camera],
        true
      );
      ssaoPipeline.radius = 1.25;
      ssaoPipeline.totalStrength = 0.62;
      ssaoPipeline.expensiveBlur = !isSoftware;
      ssaoPipeline.samples = isSoftware ? 8 : 16;
      ssaoPipeline.maxZ = 135;
      ssaoPipeline.epsilon = 0.02;
      ssaoPipeline.minZAspect = 0.16;
    }
  } catch (err) {
    console.warn("[ocean-sky] SSAO2 disabled:", err);
    ssaoPipeline = null;
  }

  const colorCurves = new ColorCurves();
  colorCurves.globalSaturation = 18;
  colorCurves.highlightsHue = 42;
  colorCurves.highlightsDensity = 10;
  colorCurves.shadowsHue = 222;
  colorCurves.shadowsDensity = 12;

  let defaultPipeline = null;
  try {
    if (camera) {
      defaultPipeline = new DefaultRenderingPipeline("IrisBayPostPipeline", true, scene, [camera]);
      defaultPipeline.samples = isSoftware ? 1 : 4;
      defaultPipeline.fxaaEnabled = true;
      defaultPipeline.imageProcessingEnabled = true;
      defaultPipeline.imageProcessing.toneMappingEnabled = true;
      defaultPipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
      defaultPipeline.imageProcessing.exposure = 1.10;
      defaultPipeline.imageProcessing.contrast = 1.08;
      defaultPipeline.imageProcessing.colorCurvesEnabled = true;
      defaultPipeline.imageProcessing.colorCurves = colorCurves;
      defaultPipeline.imageProcessing.vignetteEnabled = true;
      defaultPipeline.imageProcessing.vignetteWeight = 0.42;
      defaultPipeline.imageProcessing.vignetteStretch = 0.16;
      defaultPipeline.bloomEnabled = true;
      defaultPipeline.bloomThreshold = 0.84;
      defaultPipeline.bloomWeight = 0.28;
      defaultPipeline.bloomKernel = 48;
      defaultPipeline.bloomScale = 0.5;
      defaultPipeline.sharpenEnabled = true;
      defaultPipeline.sharpen.edgeAmount = 0.16;
      defaultPipeline.sharpen.colorAmount = 1.0;
    }
  } catch (err) {
    console.warn("[ocean-sky] DefaultRenderingPipeline disabled:", err);
    defaultPipeline = null;
  }

  // Circling Coastal Gulls (sculpted streamlined gull silhouettes orbiting upper bay)
  const gullRng = mulberry32(4109);
  const gulls = [];
  for (let i = 0; i < 6; i += 1) {
    const g = new Mesh(`Gull_${i}`, scene);
    const vd = new VertexData();
    vd.positions = [
      -0.38, 0.08, -0.05,  -0.14, 0.02, 0.06,  0.0, 0.0, 0.14,
      0.0, 0.0, 0.14,      0.14, 0.02, 0.06,   0.38, 0.08, -0.05,
      -0.14, 0.02, 0.06,   0.0, 0.0, -0.22,    0.0, 0.0, 0.14,
      0.0, 0.0, 0.14,      0.0, 0.0, -0.22,    0.14, 0.02, 0.06,
    ];
    vd.indices = [0, 2, 1, 3, 5, 4, 6, 8, 7, 9, 11, 10];
    vd.normals = new Array(36).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0));
    vd.applyToMesh(g, false);
    g.scaling.setAll(1.1 + gullRng() * 0.4);
    gulls.push({
      mesh: g,
      cx: 18 + (gullRng() - 0.5) * 38,
      cz: 8 + (gullRng() - 0.5) * 34,
      r: 14 + gullRng() * 18,
      yBase: 14 + gullRng() * 8,
      speed: 0.16 + gullRng() * 0.08,
      phase: gullRng() * Math.PI * 2,
    });
  }

  let lastEnvKey = -1;
  const setNightMix = (nightMix) => {
    const n = clamp(nightMix, 0, 1);
    skyMat.setFloat("uNightMix", n);
    oceanMat.setFloat("uNightMix", n);

    const fogDay = new Color3(0.75, 0.90, 0.99);
    const fogNight = new Color3(0.08, 0.15, 0.28);
    const fc = Color3.Lerp(fogDay, fogNight, n);
    scene.fogColor.copyFrom(fc);
    oceanMat.setColor3("uFogColor", fc);
    scene.fogDensity = lerp(0.00095, 0.00148, n);
    oceanMat.setFloat("uFogDensity", scene.fogDensity);

    hemiLight.diffuse = Color3.Lerp(new Color3(0.94, 0.98, 1.00), new Color3(0.36, 0.50, 0.78), n);
    hemiLight.groundColor = Color3.Lerp(new Color3(0.42, 0.56, 0.68), new Color3(0.12, 0.18, 0.30), n);
    hemiLight.intensity = lerp(0.88, 0.52, n);

    const lightDir = Vector3.Lerp(SUN_DIRECTION, MOON_DIRECTION, n).normalize();
    sunLight.direction = lightDir.scale(-1);
    sunLight.position = lightDir.scale(115);
    sunLight.diffuse = Color3.Lerp(new Color3(1.0, 0.96, 0.88), new Color3(0.64, 0.80, 1.0), n);
    sunLight.intensity = lerp(2.48, 1.05, n);
    scene.imageProcessingConfiguration.exposure = lerp(1.10, 1.18, n);
    scene.environmentIntensity = lerp(0.96, 0.68, n);
    colorCurves.globalSaturation = lerp(18, 12, n);
    colorCurves.highlightsHue = lerp(42, 215, n);
    colorCurves.highlightsDensity = lerp(10, 16, n);
    glowLayer.intensity = lerp(0.28, 0.62, n);

    const envBucket = Math.round(n * 8);
    if (envBucket !== lastEnvKey) {
      lastEnvKey = envBucket;
      envTex.update(
        buildProceduralSkyCubeData(envBucket / 8, 48),
        Constants.TEXTUREFORMAT_RGBA,
        Constants.TEXTURETYPE_UNSIGNED_BYTE,
        false
      );
    }
  };

  const setQualityDetail = (tier) => {
    oceanMat.setFloat("uDetailScale", tier === "low" ? 0.3 : tier === "medium" ? 0.65 : 1.0);
    shadowGen.filteringQuality = tier === "high" ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
    if (defaultPipeline) {
      defaultPipeline.bloomEnabled = tier !== "low";
      defaultPipeline.sharpenEnabled = tier !== "low";
      defaultPipeline.samples = isSoftware || tier === "low" ? 1 : tier === "medium" ? 2 : 4;
    }
    if (ssaoPipeline) {
      ssaoPipeline.totalStrength = tier === "low" ? 0.0 : tier === "medium" ? 0.50 : 0.62;
    }
  };

  const update = (elapsed, camPos) => {
    skyMat.setFloat("uTime", elapsed);
    oceanMat.setFloat("uTime", elapsed);
    if (camPos) oceanMat.setVector3("uCameraPos", camPos);

    for (let i = 0; i < gulls.length; i += 1) {
      const b = gulls[i];
      const ang = elapsed * b.speed + b.phase;
      b.mesh.position.set(
        b.cx + Math.cos(ang) * b.r,
        b.yBase + Math.sin(elapsed * 2.2 + b.phase) * 0.55,
        b.cz + Math.sin(ang) * b.r
      );
      b.mesh.rotation.y = -ang;
      b.mesh.rotation.z = 0.14;
    }
  };

  return {
    sunLight,
    hemiLight,
    shadowGen,
    glowLayer,
    setNightMix,
    setQualityDetail,
    update,
  };
}
