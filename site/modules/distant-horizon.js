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
// 1. 3-Tier Tectonic Ridged Mountain Amphitheater (600m - 1,310m)
//    Partitioned into 4 azimuthal sectors per tier so frustum culling works!
// ---------------------------------------------------------------------------

function buildTectonicMountainAmphitheater(parent, rockNormalMap) {
  const SECTORS = 4;

  const buildTierSectors = ({
    innerR,
    outerR,
    segsPerSector,
    radialSteps,
    maxH,
    seed,
    foothillHex,
    forestHex,
    cliffHex,
    crestHex,
    snowLineRatio,
    channelAz,
    channelDipStrength,
  }) => {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      normalMap: rockNormalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.91,
      metalness: 0.02,
    });

    const cShore = new THREE.Color(0x9a9383);
    const cFoot = new THREE.Color(foothillHex);
    const cForest = new THREE.Color(forestHex);
    const cCliff = new THREE.Color(cliffHex);
    const cCrest = new THREE.Color(crestHex);
    const cAlpine = new THREE.Color(0xf2efe9);
    const cTmp = new THREE.Color();

    for (let secIdx = 0; secIdx < SECTORS; secIdx += 1) {
      const uStart = secIdx / SECTORS;
      const uSpan = 1.0 / SECTORS;

      const geo = new THREE.BufferGeometry();
      const positions = [];
      const uvs = [];
      const indices = [];

      for (let r = 0; r <= radialSteps; r += 1) {
        const rt = r / radialSteps;
        const crossProfile = Math.pow(Math.sin(rt * Math.PI), 0.72) * (1.08 - 0.22 * rt);

        for (let s = 0; s <= segsPerSector; s += 1) {
          const u = uStart + (s / segsPerSector) * uSpan;
          const ang = u * Math.PI * 2.0;

          const cx = Math.cos(ang) * 3.2 + seed;
          const cz = Math.sin(ang) * 3.2 - seed * 0.7;
          const ridgePrimary = ridgedFbm2(cx + rt * 1.35, cz - rt * 1.15, 5);
          const ridgeSpurs = ridgedFbm2(cx * 2.4 - rt * 2.6, cz * 2.4 + rt * 2.2, 4);

          // Open sea outlet corridor to East-Southeast (~0.16 rad)
          const dAng = Math.atan2(Math.sin(ang - channelAz), Math.cos(ang - channelAz));
          const seaStraitDip = 1.0 - channelDipStrength * Math.exp(-(dAng * dAng) / 0.095);
          const dSouth = Math.atan2(Math.sin(ang - 1.48), Math.cos(ang - 1.48));
          const southPassDip = 1.0 - 0.42 * Math.exp(-(dSouth * dSouth) / 0.06);

          const radialWarp =
            24.0 * (vnoise2(cx * 1.5, cz * 1.5) - 0.5) +
            14.0 * Math.sin(ang * 9.0 + rt * 3.1 + seed);
          const radius = lerp(innerR, outerR, rt) + radialWarp;

          const peakEnvelope =
            maxH * (0.24 + 0.62 * ridgePrimary + 0.26 * ridgeSpurs) * seaStraitDip * southPassDip;
          const y = -9.0 + (peakEnvelope + 9.0) * crossProfile;

          positions.push(Math.cos(ang) * radius, y, Math.sin(ang) * radius);
          uvs.push(u * 26.0, rt * 4.0);
        }
      }

      const stride = segsPerSector + 1;
      for (let r = 0; r < radialSteps; r += 1) {
        for (let s = 0; s < segsPerSector; s += 1) {
          const a = r * stride + s;
          const b = a + 1;
          const c = (r + 1) * stride + s;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }

      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const posAttr = geo.attributes.position;
      const normAttr = geo.attributes.normal;
      const vColors = new Float32Array(posAttr.count * 3);

      for (let i = 0; i < posAttr.count; i += 1) {
        const px = posAttr.getX(i);
        const py = posAttr.getY(i);
        const pz = posAttr.getZ(i);
        const ny = clamp(normAttr.getY(i), 0.0, 1.0);
        const hNorm = clamp(py / Math.max(1.0, maxH), 0.0, 1.0);
        const mottle = vnoise2(px * 0.025, pz * 0.025);

        if (py < 3.8) {
          cTmp.copy(cShore).lerp(cFoot, smoothstep(-1.0, 3.8, py));
        } else {
          cTmp.copy(cFoot).lerp(cForest, smoothstep(0.05, 0.42, hNorm + (mottle - 0.5) * 0.16));
          cTmp.lerp(cCrest, smoothstep(0.45, 0.86, hNorm));
        }

        const cliffWeight = smoothstep(0.84, 0.46, ny) * smoothstep(2.0, 16.0, py);
        cTmp.lerp(cCliff, cliffWeight * 0.82);

        if (snowLineRatio < 1.0 && hNorm > snowLineRatio) {
          const snowW = smoothstep(snowLineRatio, snowLineRatio + 0.18, hNorm) * smoothstep(0.35, 0.78, ny);
          cTmp.lerp(cAlpine, snowW * 0.68);
        }

        vColors[i * 3 + 0] = cTmp.r;
        vColors[i * 3 + 1] = cTmp.g;
        vColors[i * 3 + 2] = cTmp.b;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(vColors, 3));
      geo.computeBoundingSphere();

      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.raycast = () => {};
      parent.add(mesh);
    }
  };

  // Tier 1: Forefront Forested Foothills (600m - 805m)
  buildTierSectors({
    innerR: 600,
    outerR: 805,
    segsPerSector: 56,
    radialSteps: 12,
    maxH: 78,
    seed: 1.7,
    foothillHex: 0x526e52,
    forestHex: 0x415e49,
    cliffHex: 0x868176,
    crestHex: 0x67807a,
    snowLineRatio: 1.2,
    channelAz: 0.15,
    channelDipStrength: 0.82,
  });

  // Tier 2: Mid-Layer Craggy Escarpment Ridges (780m - 1,040m)
  buildTierSectors({
    innerR: 780,
    outerR: 1040,
    segsPerSector: 60,
    radialSteps: 13,
    maxH: 156,
    seed: 5.4,
    foothillHex: 0x587478,
    forestHex: 0x4d6973,
    cliffHex: 0x918d85,
    crestHex: 0x8097a1,
    snowLineRatio: 0.80,
    channelAz: 0.17,
    channelDipStrength: 0.74,
  });

  // Tier 3: Outer Snow-Kissed Alpine Crown (1,000m - 1,310m)
  buildTierSectors({
    innerR: 1000,
    outerR: 1310,
    segsPerSector: 54,
    radialSteps: 11,
    maxH: 242,
    seed: 11.2,
    foothillHex: 0x6f8b9a,
    forestHex: 0x698495,
    cliffHex: 0x9ca1a8,
    crestHex: 0x98adbb,
    snowLineRatio: 0.66,
    channelAz: 0.16,
    channelDipStrength: 0.62,
  });
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

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
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

      void main() {
        vec2 uv = vUv;
        float n1 = vnoise(vec2(uv.x * 16.0 + uTime * 0.018, uv.y * 3.5));
        float n2 = vnoise(vec2(uv.x * 34.0 - uTime * 0.012, uv.y * 7.0 + 3.1));
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
      const rock = new THREE.DodecahedronGeometry(rad, 1).toNonIndexed();
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
    const lobe = new THREE.IcosahedronGeometry(1.0, 1).toNonIndexed();
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

  const cypParts = [];
  for (let t = 0; t < 4; t += 1) {
    const tierR = 0.92 - t * 0.16;
    const tierH = 2.4 - t * 0.22;
    const cone = new THREE.ConeGeometry(tierR, tierH, 7).toNonIndexed();
    cone.translate(0, 1.9 + t * 1.18, 0);
    cypParts.push(cone);
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
      new THREE.MeshStandardMaterial({ color: 0x2d4c33, roughness: 0.86 }),
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
    }
    cypInst.instanceMatrix.needsUpdate = true;
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
  buildTectonicMountainAmphitheater(group, rockNormalMap);
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
    surfUniforms.uNightMix.value = nightMix;
    if (villageGlowMat) {
      villageGlowMat.emissiveIntensity = lerp(0.72, 3.25, nightMix);
    }
    if (steamerGlowMat) {
      steamerGlowMat.emissiveIntensity = lerp(0.95, 3.4, nightMix);
    }
  }

  function setQualityTier(tier) {
    if (tier === "low") forestCtrl.setQualityRatio(0.45);
    else if (tier === "medium") forestCtrl.setQualityRatio(0.75);
    else forestCtrl.setQualityRatio(1.0);
  }

  function update(elapsed) {
    mistUniforms.uTime.value = elapsed;
    surfUniforms.uTime.value = elapsed;

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
