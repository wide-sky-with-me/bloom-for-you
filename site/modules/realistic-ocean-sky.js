// Physically-Based Golden Hour & Moonlit Night Atmospheric Sky Scattering,
// HDRI Environment Map, Golden-Rimmed Horizon Cumulus Deck, Beer-Lambert Ocean Shader & Coastal Gulls.

import { THREE, clamp, lerp, mulberry32, getWorldTerrainY } from "./pbr-kit.js";

// Warm angled Golden Hour sunlight ("晴朗傍晚的 Golden Hour：暖金色斜阳")
export const SUN_DIRECTION = new THREE.Vector3(0.62, 0.28, 0.73).normalize();
export const MOON_DIRECTION = new THREE.Vector3(-0.46, 0.44, 0.77).normalize();

const SKY_VERTEX = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
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

  void main() {
    vec3 dir = normalize(vWorldDir);
    float y = clamp(dir.y, -0.15, 1.0);
    float up = max(y, 0.0);
    float dayMix = 1.0 - uNightMix;

    // 1. Golden Hour Sky Gradient vs Luminous Moonlit Twilight-Indigo Night Gradient
    vec3 dayZenith  = vec3(0.185, 0.375, 0.675);
    vec3 dayMid     = vec3(0.560, 0.665, 0.845);
    vec3 dayHorizon = vec3(0.965, 0.845, 0.715);

    vec3 nightZenith  = vec3(0.032, 0.062, 0.135);
    vec3 nightMid     = vec3(0.068, 0.122, 0.228);
    vec3 nightHorizon = vec3(0.118, 0.185, 0.305);

    vec3 zenithCol  = mix(dayZenith, nightZenith, uNightMix);
    vec3 midSkyCol  = mix(dayMid, nightMid, uNightMix);
    vec3 horizonCol = mix(dayHorizon, nightHorizon, uNightMix);

    vec3 sky = mix(horizonCol, midSkyCol, pow(up, 0.38));
    sky = mix(sky, zenithCol, pow(up, 0.88));

    // 2. Golden Hour Solar Mie Aureole, Apricot Horizon Glow & Sun Disc
    float mu = max(dot(dir, normalize(uSunDir)), 0.0);
    float horizonGlow = exp(-abs(dir.y - 0.025) * 8.2) * (0.34 + 0.66 * pow(mu, 1.9));
    sky += vec3(1.00, 0.72, 0.44) * horizonGlow * 0.34 * dayMix;
    sky += vec3(1.00, 0.80, 0.54) * pow(mu, 5.5) * 0.34 * dayMix;
    sky += vec3(1.00, 0.91, 0.74) * pow(mu, 84.0) * 0.64 * dayMix;
    sky += vec3(1.00, 0.97, 0.88) * smoothstep(0.99925, 0.99982, mu) * 2.15 * dayMix;

    // 3. Night Stars & Soft Silver Crescent Moon Aura
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

    // 4. Low-Altitude Golden-Rimmed Coastal Stratocumulus Banks above Mountain Crests
    if (dir.y > 0.008 && dir.y < 0.26) {
      float az = atan(dir.z, dir.x);
      vec2 bankUV = vec2(az * 2.8 + uTime * 0.0014, (dir.y - 0.01) * 11.5);
      float bankShape = fbmCloud(bankUV * vec2(1.15, 0.85)) * 0.72 + fbmCloud(bankUV * 2.7 + 4.1) * 0.28;
      float verticalEnv = smoothstep(0.008, 0.042, dir.y) * (1.0 - smoothstep(0.11, 0.24, dir.y));
      float bankMask = smoothstep(0.46, 0.74, bankShape) * verticalEnv * mix(0.82, 0.46, uNightMix);
      float rim = clamp((fbmCloud(bankUV + vec2(0.0, 0.16)) - bankShape) * -2.6 + 0.68, 0.0, 1.0);

      vec3 dayBankShadow = mix(vec3(0.68, 0.69, 0.80), vec3(0.84, 0.74, 0.76), pow(mu, 1.8));
      vec3 dayBankLit    = mix(vec3(0.99, 0.94, 0.88), vec3(1.00, 0.84, 0.62), 0.48 + 0.52 * pow(mu, 2.0));
      vec3 nightBankShadow = vec3(0.07, 0.11, 0.20);
      vec3 nightBankLit    = vec3(0.20, 0.29, 0.44);

      vec3 bankShadow = mix(dayBankShadow, nightBankShadow, uNightMix);
      vec3 bankLit    = mix(dayBankLit, nightBankLit, uNightMix);
      sky = mix(sky, mix(bankShadow, bankLit, rim), bankMask);
    }

    // 5. Overhead Drifting Cumulus Clouds with Golden-Apricot Rim & Cool Lavender Belly
    if (dir.y > 0.025) {
      vec2 cloudUV = dir.xz / (dir.y + 0.16) * 1.18 + vec2(uTime * 0.0042, uTime * 0.0020);
      float cBase = fbmCloud(cloudUV);
      float cDetail = fbmCloud(cloudUV * 2.6 - vec2(uTime * 0.0028, 0.0));
      float density = smoothstep(0.51, 0.79, cBase * 0.78 + cDetail * 0.28);
      float horizonFade = smoothstep(0.025, 0.20, dir.y);
      density *= horizonFade * mix(0.78, 0.36, uNightMix);

      vec2 lightDir2D = normalize(mix(uSunDir.xz, uMoonDir.xz, uNightMix));
      float lightSample = fbmCloud(cloudUV + lightDir2D * 0.06);
      float selfShadow = clamp((cBase - lightSample) * 2.8 + 0.62, 0.0, 1.0);

      vec3 dayCloudShadow = vec3(0.68, 0.71, 0.82);
      vec3 dayCloudLit    = mix(vec3(0.99, 0.95, 0.90), vec3(1.00, 0.86, 0.68), 0.35 + 0.60 * pow(mu, 2.2));
      vec3 nightCloudShadow = vec3(0.06, 0.10, 0.18);
      vec3 nightCloudLit    = vec3(0.18, 0.27, 0.42);

      vec3 cloudCol = mix(
        mix(dayCloudShadow, nightCloudShadow, uNightMix),
        mix(dayCloudLit, nightCloudLit, uNightMix),
        selfShadow
      );
      sky = mix(sky, cloudCol, density);
    }

    // Below-horizon sea bounce
    if (dir.y < 0.0) {
      vec3 seaBounceCol = mix(vec3(0.24, 0.44, 0.56), vec3(0.04, 0.09, 0.16), uNightMix);
      sky = mix(horizonCol, seaBounceCol, clamp(-dir.y * 5.0, 0.0, 1.0));
    }

    gl_FragColor = vec4(sky, 1.0);
  }
`;

const OCEAN_VERTEX = /* glsl */ `
  uniform float uTime;
  attribute float aWaterDepth;
  varying vec3 vWorldPos;
  varying float vDepth;
  varying float vWaveH;

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float depth = aWaterDepth;
    float deepFactor = smoothstep(0.15, 3.2, depth);
    float distCalm = 1.0 - smoothstep(140.0, 680.0, length(wp.xz));

    // Gentle multi-directional physical ocean swell
    float w1 = sin(dot(wp.xz, vec2(0.19, 0.14)) + uTime * 1.22) * 0.092;
    float w2 = sin(dot(wp.xz, vec2(-0.13, 0.22)) - uTime * 1.02 + 1.4) * 0.062;
    float w3 = cos(dot(wp.xz, vec2(0.31, -0.24)) + uTime * 1.70) * 0.030;
    float h = (w1 + w2 + w3) * deepFactor * distCalm;

    wp.y += h;
    vWorldPos = wp.xyz;
    vDepth = depth;
    vWaveH = h;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const OCEAN_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform float uNightMix;
  uniform float uDetailScale;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec3 vWorldPos;
  varying float vDepth;
  varying float vWaveH;

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
    if (detail > 0.35) {
      h += (vnoise(p * 1.15 + vec2(t * 0.50, -t * 0.36)) - 0.5) * 0.36;
    }
    if (detail > 0.75) {
      h += (vnoise(p * 2.85 - vec2(t * 0.76, t * 0.62)) - 0.5) * 0.18;
    }
    return h;
  }

  void main() {
    vec3 V = normalize(cameraPosition - vWorldPos);
    float dist = length(cameraPosition - vWorldPos);
    float dayMix = 1.0 - uNightMix;

    // Analytical multi-octave capillary + swell surface normal
    float eps = 0.16;
    float normalFade = (1.0 - smoothstep(95.0, 520.0, dist));
    float hC = waveHeightField(vWorldPos.xz, uTime, uDetailScale);
    float hX = waveHeightField(vWorldPos.xz + vec2(eps, 0.0), uTime, uDetailScale);
    float hZ = waveHeightField(vWorldPos.xz + vec2(0.0, eps), uTime, uDetailScale);
    vec3 N = normalize(vec3((hC - hX) * 0.34 * normalFade, 1.0, (hC - hZ) * 0.34 * normalFade));

    // Beer-Lambert coastal depth absorption: turquoise-emerald by day -> deep moonlit sapphire at night
    vec3 shallowTurquoise = mix(vec3(0.22, 0.70, 0.71), vec3(0.06, 0.22, 0.30), uNightMix);
    vec3 midEmerald       = mix(vec3(0.07, 0.43, 0.54), vec3(0.028, 0.125, 0.225), uNightMix);
    vec3 deepSapphire     = mix(vec3(0.032, 0.195, 0.350), vec3(0.015, 0.065, 0.145), uNightMix);

    float tMid  = 1.0 - exp(-max(vDepth, 0.0) * 0.58);
    float tDeep = 1.0 - exp(-max(vDepth - 1.4, 0.0) * 0.28);
    vec3 waterBody = mix(shallowTurquoise, midEmerald, tMid);
    waterBody = mix(waterBody, deepSapphire, tDeep);

    // Subsurface turquoise scatter in sunlit wave crests
    vec3 L = normalize(mix(uSunDir, uMoonDir, uNightMix));
    float sss = clamp(dot(L, -V + N * 0.65), 0.0, 1.0);
    waterBody += mix(vec3(0.07, 0.24, 0.22), vec3(0.02, 0.08, 0.12), uNightMix) * pow(sss, 3.0) * (0.4 + 0.6 * normalFade);

    // Schlick Fresnel sky reflection (Golden Hour apricot-lavender vs Moonlit silver-indigo)
    float NdotV = max(dot(N, V), 0.02);
    float fresnel = 0.025 + 0.975 * pow(1.0 - NdotV, 4.6);
    vec3 R = reflect(-V, N);
    vec3 dayReflHorizon = vec3(0.93, 0.83, 0.74);
    vec3 dayReflZenith  = vec3(0.28, 0.50, 0.78);
    vec3 nightReflHorizon = vec3(0.14, 0.22, 0.36);
    vec3 nightReflZenith  = vec3(0.04, 0.09, 0.19);
    vec3 reflSky = mix(
      mix(dayReflHorizon, nightReflHorizon, uNightMix),
      mix(dayReflZenith, nightReflZenith, uNightMix),
      clamp(R.y * 1.4, 0.0, 1.0)
    );
    vec3 col = mix(waterBody, reflSky, clamp(fresnel * 0.85, 0.0, 0.87));

    // Fine Golden Hour sun glitter path + gentle silver moon shimmer at night
    vec3 H = normalize(L + V);
    float NdotH = max(dot(N, H), 0.0);
    float specSharp = pow(NdotH, 320.0) * mix(3.4, 1.85, uNightMix);
    float specSoft  = pow(NdotH, 26.0) * mix(0.18, 0.09, uNightMix);
    vec3 specCol = mix(vec3(1.00, 0.88, 0.66), vec3(0.76, 0.86, 1.00), uNightMix);
    col += specCol * (specSharp + specSoft);

    // Organic aerated shoreline & reef surf foam (feathered multi-wave lace instead of flat hard band)
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

    // Smooth wet-sand alpha feather right up to Y=0 waterline (zero hard cutout edge)
    float alpha = clamp(smoothstep(0.0, 0.52, vDepth) * 0.92 + 0.05, 0.05, 0.97);
    if (dist > 145.0) alpha = 0.99;

    // Exponential atmospheric horizon haze matching scene.fog
    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

    gl_FragColor = vec4(col, alpha);
  }
`;

export function createRealisticSkyEnvironment(renderer, nightMix = 0.0) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(60, 32, 20),
    new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: SUN_DIRECTION.clone() },
        uMoonDir: { value: MOON_DIRECTION.clone() },
        uTime: { value: 0 },
        uNightMix: { value: nightMix },
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
    })
  );
  envScene.add(dome);

  // Warm coastal ground/sea bounce hemisphere inside PMREM for natural PBR underside fill
  const seaBounce = new THREE.Mesh(
    new THREE.PlaneGeometry(110, 110),
    new THREE.MeshBasicMaterial({
      color: nightMix > 0.5 ? 0x1e3048 : 0x709294,
      side: THREE.DoubleSide,
    })
  );
  seaBounce.rotation.x = -Math.PI / 2;
  seaBounce.position.y = -4.0;
  envScene.add(seaBounce);

  const envRT = pmrem.fromScene(envScene, 0.035);
  dome.geometry.dispose();
  dome.material.dispose();
  seaBounce.geometry.dispose();
  seaBounce.material.dispose();
  pmrem.dispose();
  return envRT.texture;
}

function createSeagullRig() {
  const root = new THREE.Group();
  const whiteFeather = new THREE.MeshStandardMaterial({ color: 0xf7f8fa, roughness: 0.65 });
  const slateWing = new THREE.MeshStandardMaterial({ color: 0x8a99a8, roughness: 0.68 });
  const darkTip = new THREE.MeshStandardMaterial({ color: 0x2c343d, roughness: 0.6 });
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xe3a83b, roughness: 0.45 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.34, 5, 10), whiteFeather);
  body.rotation.x = Math.PI / 2;
  body.scale.set(0.95, 1.0, 0.82);
  root.add(body);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.12, 6), beakMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.02, 0.28);
  root.add(beak);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 4), whiteFeather);
  tail.rotation.x = -Math.PI / 2;
  tail.scale.set(1.2, 1.0, 0.28);
  tail.position.set(0, 0.01, -0.26);
  root.add(tail);

  const makeWing = (sign) => {
    const innerPivot = new THREE.Group();
    innerPivot.position.set(sign * 0.06, 0.03, 0.03);
    const innerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.024, 0.18), slateWing);
    innerMesh.position.set(sign * 0.22, 0, -0.02);
    innerPivot.add(innerMesh);

    const outerPivot = new THREE.Group();
    outerPivot.position.set(sign * 0.44, 0, -0.02);
    const outerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.018, 0.13), darkTip);
    outerMesh.position.set(sign * 0.20, 0, -0.03);
    outerMesh.rotation.y = -sign * 0.18;
    outerPivot.add(outerMesh);

    innerPivot.add(outerPivot);
    root.add(innerPivot);
    return { innerPivot, outerPivot };
  };

  const leftWing = makeWing(-1);
  const rightWing = makeWing(1);
  root.traverse((c) => {
    if (c.isMesh) c.raycast = () => {};
  });
  return { root, leftWing, rightWing };
}

export function buildRealisticOceanAndSky(opts = {}) {
  const group = new THREE.Group();
  group.name = "RealisticOceanAndSky";

  const dayFogColor = new THREE.Color(opts.fogColor !== undefined ? opts.fogColor : 0xeadfce);
  const nightFogColor = new THREE.Color(opts.nightFogColor !== undefined ? opts.nightFogColor : 0x16243b);
  const currentFogColor = dayFogColor.clone();
  const fogDensity = opts.fogDensity !== undefined ? opts.fogDensity : 0.00062;

  // 1. Atmospheric Sky Dome (radius 1,450m)
  const skyUniforms = {
    uSunDir: { value: SUN_DIRECTION.clone() },
    uMoonDir: { value: MOON_DIRECTION.clone() },
    uTime: { value: 0 },
    uNightMix: { value: 0 },
  };
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(1450, 48, 28),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
    })
  );
  skyDome.raycast = () => {};
  group.add(skyDome);

  // 2. Physical Ocean Surface: high-detail coastal sheet (340m x 340m) + outer horizon sea ring
  const oceanUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: SUN_DIRECTION.clone() },
    uMoonDir: { value: MOON_DIRECTION.clone() },
    uNightMix: { value: 0 },
    uDetailScale: { value: 1.0 },
    uFogColor: { value: currentFogColor },
    uFogDensity: { value: fogDensity },
  };
  const oceanMat = new THREE.ShaderMaterial({
    uniforms: oceanUniforms,
    vertexShader: OCEAN_VERTEX,
    fragmentShader: OCEAN_FRAGMENT,
    transparent: true,
    depthWrite: true,
  });

  const nearOceanGeo = new THREE.PlaneGeometry(340, 340, 176, 176);
  nearOceanGeo.rotateX(-Math.PI / 2);
  const posAttr = nearOceanGeo.attributes.position;
  const depths = new Float32Array(posAttr.count);
  for (let i = 0; i < posAttr.count; i += 1) {
    const wx = posAttr.getX(i);
    const wz = posAttr.getZ(i);
    const inBreakwater =
      (wx >= 45.8 && wx <= 78.2 && wz >= 7.4 && wz <= 12.6) ||
      Math.hypot(wx - 78.0, wz - 10.0) < 5.0;
    const ty = inBreakwater ? 1.38 : getWorldTerrainY(wx, wz);
    depths[i] = Math.max(0.0, -ty);
  }
  nearOceanGeo.setAttribute("aWaterDepth", new THREE.BufferAttribute(depths, 1));
  const nearOcean = new THREE.Mesh(nearOceanGeo, oceanMat);
  nearOcean.position.y = 0.0;
  nearOcean.raycast = () => {};
  group.add(nearOcean);

  const farOceanGeo = new THREE.RingGeometry(168, 1420, 96, 6);
  farOceanGeo.rotateX(-Math.PI / 2);
  const farCount = farOceanGeo.attributes.position.count;
  const farDepths = new Float32Array(farCount).fill(12.0);
  farOceanGeo.setAttribute("aWaterDepth", new THREE.BufferAttribute(farDepths, 1));
  const farOcean = new THREE.Mesh(farOceanGeo, oceanMat);
  farOcean.position.y = -0.02;
  farOcean.raycast = () => {};
  group.add(farOcean);

  // 3. Subtle Sunshower Mist Rainbow Arc over the Bay
  const rainbowGeo = new THREE.RingGeometry(88, 108, 96, 8, 0.10 * Math.PI, 0.80 * Math.PI);
  const rainbowUniforms = {
    uOpacity: { value: 0.0 },
  };
  const rainbowMat = new THREE.ShaderMaterial({
    uniforms: rainbowUniforms,
    vertexShader: /* glsl */ `
      varying vec2 vRingUv;
      void main() {
        float r = length(position.xy);
        float ang = atan(position.y, position.x);
        vRingUv = vec2(
          clamp((ang - 0.314159) / 2.513274, 0.0, 1.0),
          clamp((r - 88.0) / 20.0, 0.0, 1.0)
        );
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying vec2 vRingUv;
      void main() {
        float t = vRingUv.y;
        vec3 cRed    = vec3(1.00, 0.38, 0.32);
        vec3 cYellow = vec3(1.00, 0.88, 0.42);
        vec3 cGreen  = vec3(0.42, 0.92, 0.58);
        vec3 cCyan   = vec3(0.38, 0.78, 1.00);
        vec3 cViolet = vec3(0.68, 0.48, 0.98);
        vec3 spec = mix(cViolet, cCyan, smoothstep(0.12, 0.34, t));
        spec = mix(spec, cGreen, smoothstep(0.34, 0.52, t));
        spec = mix(spec, cYellow, smoothstep(0.52, 0.70, t));
        spec = mix(spec, cRed, smoothstep(0.70, 0.88, t));

        float radialEnv = pow(sin(clamp(t, 0.0, 1.0) * 3.14159265), 2.4);
        float arcEnv = pow(sin(clamp(vRingUv.x, 0.0, 1.0) * 3.14159265), 1.8);
        float alpha = radialEnv * arcEnv * uOpacity;
        if (alpha < 0.001) discard;
        gl_FragColor = vec4(spec, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const rainbowArc = new THREE.Mesh(rainbowGeo, rainbowMat);
  rainbowArc.position.set(22, -6, -78);
  rainbowArc.rotation.y = -0.28;
  rainbowArc.raycast = () => {};
  group.add(rainbowArc);

  // 4. 10 Soaring Realistic Coastal Seagulls
  const rng = mulberry32(90210);
  const gullFlock = [];
  for (let i = 0; i < 10; i += 1) {
    const rig = createSeagullRig();
    const s = 0.95 + rng() * 0.35;
    rig.root.scale.setScalar(s);
    group.add(rig.root);
    gullFlock.push({
      rig,
      cx: 18 + (rng() - 0.35) * 95,
      cy: 14 + rng() * 18,
      cz: 8 + (rng() - 0.4) * 95,
      rx: 16 + rng() * 22,
      rz: 14 + rng() * 20,
      speed: 0.16 + rng() * 0.12,
      phase: rng() * Math.PI * 2,
      dir: i % 2 === 0 ? 1 : -1,
    });
  }

  let rainbowTimer = 0;
  let nightMix = 0;
  let activeGullCount = gullFlock.length;

  function triggerRainbow() {
    rainbowTimer = 9.0;
  }

  function setNightMix(mix) {
    nightMix = clamp(mix, 0, 1);
    skyUniforms.uNightMix.value = nightMix;
    oceanUniforms.uNightMix.value = nightMix;
    currentFogColor.copy(dayFogColor).lerp(nightFogColor, nightMix);
  }

  function setQualityTier(tier) {
    if (tier === "low") {
      oceanUniforms.uDetailScale.value = 0.25;
      activeGullCount = 4;
    } else if (tier === "medium") {
      oceanUniforms.uDetailScale.value = 0.6;
      activeGullCount = 7;
    } else {
      oceanUniforms.uDetailScale.value = 1.0;
      activeGullCount = 10;
    }
    for (let i = 0; i < gullFlock.length; i += 1) {
      gullFlock[i].rig.root.visible = i < activeGullCount && nightMix < 0.85;
    }
  }

  function update(elapsed, dt) {
    skyUniforms.uTime.value = elapsed;
    oceanUniforms.uTime.value = elapsed;

    if (rainbowTimer > 0 && nightMix < 0.5) {
      rainbowTimer = Math.max(0, rainbowTimer - dt);
      rainbowUniforms.uOpacity.value = lerp(rainbowUniforms.uOpacity.value, 0.22 * (1 - nightMix), 0.08);
    } else {
      rainbowUniforms.uOpacity.value = lerp(rainbowUniforms.uOpacity.value, 0.0, 0.06);
    }

    const gullsActive = nightMix < 0.85;
    for (let i = 0; i < gullFlock.length; i += 1) {
      const g = gullFlock[i];
      const vis = i < activeGullCount && gullsActive;
      g.rig.root.visible = vis;
      if (!vis) continue;

      const a = g.phase + elapsed * g.speed * g.dir;
      const nx = g.cx + Math.cos(a) * g.rx;
      const nz = g.cz + Math.sin(a) * g.rz;
      const ny = g.cy + Math.sin(elapsed * 0.7 + g.phase) * 1.4;
      const tx = -Math.sin(a) * g.rx * g.dir;
      const tz = Math.cos(a) * g.rz * g.dir;

      g.rig.root.position.set(nx, ny, nz);
      g.rig.root.rotation.y = Math.atan2(tx, tz);
      g.rig.root.rotation.z = -g.dir * 0.18;

      const glide = 0.5 + 0.5 * Math.sin(elapsed * 0.55 + g.phase);
      const flap = Math.sin(elapsed * 5.2 + g.phase * 2.0) * 0.42 * (1.0 - glide * 0.78);
      g.rig.leftWing.innerPivot.rotation.z = -flap - 0.1;
      g.rig.rightWing.innerPivot.rotation.z = flap + 0.1;
      g.rig.leftWing.outerPivot.rotation.z = -flap * 0.5 + 0.18;
      g.rig.rightWing.outerPivot.rotation.z = flap * 0.5 - 0.18;
    }
  }

  function reset() {
    rainbowTimer = 0;
    rainbowUniforms.uOpacity.value = 0;
    setNightMix(0);
    update(0, 0);
  }

  update(0, 0.016);

  return {
    group,
    update,
    reset,
    setNightMix,
    setQualityTier,
    triggerRainbow,
    getFogColor: () => currentFogColor,
    isRainbowActive: () => rainbowUniforms.uOpacity.value > 0.02,
  };
}
