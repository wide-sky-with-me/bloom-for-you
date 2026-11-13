// Physically-Based Atmospheric Sky Scattering, HDRI Environment Map,
// Soft Sunlit Cumulus Cloud Deck, Realistic Fresnel/Beer-Lambert Ocean Shader & Coastal Gulls.

import { THREE, clamp, lerp, smoothstep, mulberry32, getWorldTerrainY } from "./pbr-kit.js";

export const SUN_DIRECTION = new THREE.Vector3(0.56, 0.46, 0.69).normalize();

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
  uniform float uTime;
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

    // Rayleigh + Mie coastal daylight sky gradient with warm golden-apricot horizon glow
    vec3 zenithCol  = vec3(0.180, 0.410, 0.695);
    vec3 midSkyCol  = vec3(0.435, 0.680, 0.885);
    vec3 horizonCol = vec3(0.865, 0.910, 0.945);

    vec3 sky = mix(horizonCol, midSkyCol, pow(up, 0.36));
    sky = mix(sky, zenithCol, pow(up, 0.88));

    // Solar Mie aureole, warm horizon band & crisp sun disc
    float mu = max(dot(dir, normalize(uSunDir)), 0.0);
    float horizonGlow = exp(-abs(dir.y - 0.02) * 9.5) * (0.28 + 0.72 * pow(mu, 2.2));
    sky += vec3(1.0, 0.86, 0.68) * horizonGlow * 0.22;
    sky += vec3(1.0, 0.91, 0.72) * pow(mu, 7.0) * 0.26;
    sky += vec3(1.0, 0.96, 0.86) * pow(mu, 96.0) * 0.58;
    sky += vec3(1.0, 0.99, 0.94) * smoothstep(0.99935, 0.99985, mu) * 2.2;

    // Distant sunlit coastal horizon cumulus banks sitting above mountain crests
    if (dir.y > 0.008 && dir.y < 0.26) {
      float az = atan(dir.z, dir.x);
      vec2 bankUV = vec2(az * 2.8 + uTime * 0.0014, (dir.y - 0.01) * 11.5);
      float bankShape = fbmCloud(bankUV * vec2(1.15, 0.85)) * 0.72 + fbmCloud(bankUV * 2.7 + 4.1) * 0.28;
      float verticalEnv = smoothstep(0.008, 0.042, dir.y) * (1.0 - smoothstep(0.11, 0.24, dir.y));
      float bankMask = smoothstep(0.46, 0.74, bankShape) * verticalEnv * 0.78;
      float rim = clamp((fbmCloud(bankUV + vec2(0.0, 0.16)) - bankShape) * -2.6 + 0.68, 0.0, 1.0);
      vec3 bankShadow = mix(vec3(0.73, 0.81, 0.89), vec3(0.82, 0.84, 0.90), pow(mu, 2.0));
      vec3 bankLit = mix(vec3(0.98, 0.98, 0.99), vec3(1.0, 0.93, 0.82), 0.35 + 0.55 * pow(mu, 2.4));
      sky = mix(sky, mix(bankShadow, bankLit, rim), bankMask);
    }

    // Soft sunlit overhead coastal cumulus clouds projected onto sky dome
    if (dir.y > 0.025) {
      vec2 cloudUV = dir.xz / (dir.y + 0.16) * 1.18 + vec2(uTime * 0.0045, uTime * 0.0022);
      float cBase = fbmCloud(cloudUV);
      float cDetail = fbmCloud(cloudUV * 2.6 - vec2(uTime * 0.003, 0.0));
      float density = smoothstep(0.50, 0.78, cBase * 0.78 + cDetail * 0.28);
      float horizonFade = smoothstep(0.025, 0.20, dir.y);
      density *= horizonFade * 0.86;

      // Lit cloud top vs cool shadow belly
      float lightSample = fbmCloud(cloudUV + normalize(uSunDir.xz) * 0.06);
      float selfShadow = clamp((cBase - lightSample) * 2.8 + 0.62, 0.0, 1.0);
      vec3 cloudShadowCol = vec3(0.70, 0.78, 0.86);
      vec3 cloudLitCol = mix(vec3(0.97, 0.98, 0.99), vec3(1.0, 0.96, 0.89), pow(mu, 3.0) * 0.55);
      vec3 cloudCol = mix(cloudShadowCol, cloudLitCol, selfShadow);
      sky = mix(sky, cloudCol, density);
    }

    // Below-horizon sea bounce
    if (dir.y < 0.0) {
      sky = mix(horizonCol, vec3(0.24, 0.44, 0.56), clamp(-dir.y * 5.0, 0.0, 1.0));
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
    float w1 = sin(dot(wp.xz, vec2(0.19, 0.14)) + uTime * 1.25) * 0.095;
    float w2 = sin(dot(wp.xz, vec2(-0.13, 0.22)) - uTime * 1.05 + 1.4) * 0.065;
    float w3 = cos(dot(wp.xz, vec2(0.31, -0.24)) + uTime * 1.75) * 0.032;
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

  float waveHeightField(vec2 p, float t) {
    float h = 0.0;
    h += sin(dot(p, vec2(0.72, 0.54)) + t * 1.65) * 0.28;
    h += sin(dot(p, vec2(-0.61, 0.83)) - t * 1.42) * 0.22;
    h += (vnoise(p * 1.15 + vec2(t * 0.52, -t * 0.38)) - 0.5) * 0.36;
    h += (vnoise(p * 2.85 - vec2(t * 0.78, t * 0.64)) - 0.5) * 0.18;
    return h;
  }

  void main() {
    vec3 V = normalize(cameraPosition - vWorldPos);
    float dist = length(cameraPosition - vWorldPos);

    // Analytical multi-octave capillary + swell surface normal
    float eps = 0.16;
    float normalFade = 1.0 - smoothstep(95.0, 520.0, dist);
    float hC = waveHeightField(vWorldPos.xz, uTime);
    float hX = waveHeightField(vWorldPos.xz + vec2(eps, 0.0), uTime);
    float hZ = waveHeightField(vWorldPos.xz + vec2(0.0, eps), uTime);
    vec3 N = normalize(vec3((hC - hX) * 0.34 * normalFade, 1.0, (hC - hZ) * 0.34 * normalFade));

    // Beer-Lambert coastal depth absorption: sandy turquoise shallows -> emerald -> deep sapphire
    vec3 shallowTurquoise = vec3(0.24, 0.71, 0.72);
    vec3 midEmerald       = vec3(0.08, 0.43, 0.53);
    vec3 deepSapphire     = vec3(0.035, 0.195, 0.345);

    float tMid  = 1.0 - exp(-max(vDepth, 0.0) * 0.58);
    float tDeep = 1.0 - exp(-max(vDepth - 1.4, 0.0) * 0.28);
    vec3 waterBody = mix(shallowTurquoise, midEmerald, tMid);
    waterBody = mix(waterBody, deepSapphire, tDeep);

    // Subsurface turquoise scatter in sunlit wave crests
    vec3 L = normalize(uSunDir);
    float sss = clamp(dot(L, -V + N * 0.65), 0.0, 1.0);
    waterBody += vec3(0.06, 0.24, 0.22) * pow(sss, 3.0) * (0.4 + 0.6 * normalFade);

    // Schlick Fresnel sky reflection
    float NdotV = max(dot(N, V), 0.02);
    float fresnel = 0.025 + 0.975 * pow(1.0 - NdotV, 4.6);
    vec3 R = reflect(-V, N);
    vec3 reflSky = mix(vec3(0.78, 0.87, 0.93), vec3(0.27, 0.53, 0.79), clamp(R.y * 1.4, 0.0, 1.0));
    vec3 col = mix(waterBody, reflSky, clamp(fresnel * 0.86, 0.0, 0.88));

    // Crisp sun specular glitter path + warm broad sun sheen
    vec3 H = normalize(L + V);
    float NdotH = max(dot(N, H), 0.0);
    float specSharp = pow(NdotH, 340.0) * 3.8;
    float specSoft  = pow(NdotH, 28.0) * 0.16;
    col += vec3(1.0, 0.95, 0.82) * (specSharp + specSoft);

    // Organic aerated shoreline & reef surf foam where vDepth is shallow
    if (vDepth < 1.35) {
      float shoreWave = sin(vDepth * 9.5 - uTime * 2.35) * 0.5 + 0.5;
      float lace = vnoise(vWorldPos.xz * 2.4 + vec2(uTime * 0.25, -uTime * 0.18));
      float foamBand = (1.0 - smoothstep(0.02, 1.15, vDepth)) * (0.48 + 0.52 * shoreWave);
      float foamMask = smoothstep(0.36, 0.68, foamBand * (0.55 + 0.65 * lace));
      col = mix(col, vec3(0.95, 0.98, 0.99), foamMask * 0.88);
    }

    // Translucent alpha right at the wet-sand / submerged-step waterline
    float alpha = clamp(smoothstep(0.0, 0.34, vDepth) * 0.68 + 0.32, 0.32, 0.97);
    if (dist > 145.0) alpha = 0.99;

    // Exponential atmospheric horizon haze matching scene.fog
    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

    gl_FragColor = vec4(col, alpha);
  }
`;

export function createRealisticSkyEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(60, 32, 20),
    new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: SUN_DIRECTION.clone() },
        uTime: { value: 0 },
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
    })
  );
  envScene.add(dome);

  // Warm ground/sea bounce hemisphere inside PMREM for natural interior & underside PBR fill
  const seaBounce = new THREE.Mesh(
    new THREE.PlaneGeometry(110, 110),
    new THREE.MeshBasicMaterial({ color: 0x5c8b92, side: THREE.DoubleSide })
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

  const fogColor = new THREE.Color(opts.fogColor !== undefined ? opts.fogColor : 0xdce9f2);
  const fogDensity = opts.fogDensity !== undefined ? opts.fogDensity : 0.00072;

  // 1. Atmospheric Sky Dome (radius 1,450m)
  const skyUniforms = {
    uSunDir: { value: SUN_DIRECTION.clone() },
    uTime: { value: 0 },
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

  // 2. Physical Ocean Surface: high-detail coastal sheet (320m x 320m) + outer horizon sea ring
  const oceanUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: SUN_DIRECTION.clone() },
    uFogColor: { value: fogColor },
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
    // Account for solid Granite Breakwater Mole X in [46, 82.8], Z in [7.2, 12.8]
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

  // Outer horizon sea skirt (inner 168m -> outer 1,420m) so ocean extends endlessly to horizon
  const farOceanGeo = new THREE.RingGeometry(168, 1420, 96, 6);
  farOceanGeo.rotateX(-Math.PI / 2);
  const farCount = farOceanGeo.attributes.position.count;
  const farDepths = new Float32Array(farCount).fill(12.0);
  farOceanGeo.setAttribute("aWaterDepth", new THREE.BufferAttribute(farDepths, 1));
  const farOcean = new THREE.Mesh(farOceanGeo, oceanMat);
  farOcean.position.y = -0.02;
  farOcean.raycast = () => {};
  group.add(farOcean);

  // 3. Subtle Realistic Sunshower Mist Rainbow Arc over the Bay (edge-feathered spectral shader, zero quad borders)
  const rainbowGeo = new THREE.RingGeometry(88, 108, 96, 8, 0.10 * Math.PI, 0.80 * Math.PI);
  const rainbowUniforms = {
    uOpacity: { value: 0.0 },
  };
  const rainbowMat = new THREE.ShaderMaterial({
    uniforms: rainbowUniforms,
    vertexShader: /* glsl */ `
      varying vec2 vRingUv;
      void main() {
        // RingGeometry radial r in [88, 108], angle theta in [0.10*PI, 0.90*PI]
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
        // Smooth spectral dispersion across radial coordinate vRingUv.y
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

        // Feather smoothly to 0.0 well inside all 4 boundaries
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

  function triggerRainbow() {
    rainbowTimer = 9.0;
  }

  function update(elapsed, dt) {
    skyUniforms.uTime.value = elapsed;
    oceanUniforms.uTime.value = elapsed;

    if (rainbowTimer > 0) {
      rainbowTimer = Math.max(0, rainbowTimer - dt);
      rainbowUniforms.uOpacity.value = lerp(rainbowUniforms.uOpacity.value, 0.22, 0.08);
    } else {
      rainbowUniforms.uOpacity.value = lerp(rainbowUniforms.uOpacity.value, 0.0, 0.05);
    }

    for (let i = 0; i < gullFlock.length; i += 1) {
      const g = gullFlock[i];
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

  update(0, 0.016);

  return {
    group,
    update,
    triggerRainbow,
    isRainbowActive: () => rainbowUniforms.uOpacity.value > 0.02,
  };
}
