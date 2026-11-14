// Expanded 260m Coastal Peninsula Terrain, Distant Mountain Amphitheater,
// Villa Courtyard, Granite Harbor Quay, Boats, Lighthouse, Cliffside Gazebo & Hilltop Windmill.

import {
  THREE,
  mergeGeometries,
  clamp,
  lerp,
  smoothstep,
  mulberry32,
  makeCanvasTex,
  makeNormalTex,
  getStoneAshlarTextures,
  getOakParquetTextures,
  getTerracottaRoofTextures,
  pbrPlasterMat,
  pbrStoneMat,
  pbrWoodMat,
  pbrFabricMat,
  pbrMetalMat,
  pbrGlassMat,
  getWorldTerrainY,
  getTerrainNormal,
  getCreekCenterX,
  getPondNormalizedRadius,
  registerWalkZone,
  registerBoxCollider,
  registerRotatedBoxCollider,
  registerCircleCollider,
  tagInteractive,
  enablePBRShadows,
  batchStaticMeshesByMaterial,
  loadBundledGLB,
} from "./pbr-kit.js";
import { createRoseBouquet, createInteractionFX, easeOutBack, seatFromLocal } from "./botanical-flora.js";
import {
  createPillowedCushionGeo,
  createPlumpPillowGeo,
  buildTeakSteamerDeckLounger,
  buildResortMarketParasol,
  buildItalianLeverEspressoMachine,
} from "./vintage-craft-props.js";

function safeMerge(geos) {
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
  return prepared.length ? mergeGeometries(prepared, false) : new THREE.BufferGeometry();
}

function fbm2(x, z) {
  return (
    0.52 * Math.sin(x * 0.071 + z * 0.053 + 0.4) +
    0.31 * Math.cos(x * 0.163 - z * 0.129 + 1.7) +
    0.17 * Math.sin(x * 0.37 + z * 0.41 - 0.9)
  );
}

// Stratified coastal reef / granite rock geometry: horizontal wave-cut bedding ledges,
// fracture crevices, and undercut basal notch (distinct from rounded garden river cobbles).
function createStratifiedCoastalRockGeo(radius = 1.0, seed = 101, detailW = 22, detailH = 16) {
  const g = new THREE.SphereGeometry(radius, detailW, detailH);
  const pos = g.attributes.position;
  const p1 = (seed * 0.73) % 6.283;
  const p2 = (seed * 1.37) % 6.283;
  const p3 = (seed * 2.11) % 6.283;
  for (let i = 0; i < pos.count; i += 1) {
    let vx = pos.getX(i);
    let vy = pos.getY(i);
    let vz = pos.getZ(i);
    const invR = 1.0 / Math.max(radius, 0.001);
    const nx = vx * invR;
    const ny = vy * invR;
    const nz = vz * invR;

    // Stepped sedimentary / granite coastal strata + fracture planes
    const strata = Math.tanh(Math.sin(ny * 8.5 + nx * 1.4 + p1) * 2.2) * 0.085;
    const crevice = Math.abs(Math.sin(nx * 3.1 - nz * 2.7 + p2)) * 0.11 - 0.055;
    const broad = Math.cos(nz * 2.3 + ny * 1.8 + p3) * 0.095;
    // Wave-eroded basal undercut on lower third
    const undercut = ny < -0.15 ? -0.11 * smoothstep(-0.15, -0.85, ny) : 0.0;
    const disp = 1.0 + strata + crevice + broad + undercut;

    vx *= disp;
    vz *= disp;
    // Slightly flatten top shelf like coastal reef ledges
    vy *= ny > 0.35 ? disp * 0.84 : disp * 0.95;
    pos.setXYZ(i, vx, vy, vz);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Custom Coastal PBR Micro-Detail, Granite Slab, Marine Teak & Ripple Textures
// ---------------------------------------------------------------------------

function createGroundMicroTextures() {
  const rng = mulberry32(9101);
  const albedoMap = makeCanvasTex(
    512,
    512,
    (ctx, w, h) => {
      const r0 = mulberry32(9100);
      ctx.fillStyle = "#eef1ea";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 8500; i += 1) {
        const x = r0() * w;
        const y = r0() * h;
        const shade = 210 + Math.floor(r0() * 44);
        ctx.strokeStyle = `rgba(${shade - 10},${shade + 4},${shade - 16},0.42)`;
        ctx.lineWidth = 1.0 + r0() * 1.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (r0() - 0.5) * 4.5, y - 3.0 - r0() * 5.5);
        ctx.stroke();
      }
      // Subtle clover & wildflower ground mottling
      for (let i = 0; i < 950; i += 1) {
        const x = r0() * w;
        const y = r0() * h;
        const tone = r0();
        ctx.fillStyle =
          tone < 0.35
            ? "rgba(250,236,242,0.22)"
            : tone < 0.68
              ? "rgba(232,226,248,0.20)"
              : "rgba(252,248,225,0.22)";
        ctx.beginPath();
        ctx.arc(x, y, 1.4 + r0() * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { repeatX: 54, repeatY: 54 }
  );
  const roughnessMap = makeCanvasTex(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = "#d8d8d8";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 6500; i += 1) {
        const v = 165 + Math.floor(rng() * 82);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 4, 1 + rng() * 4);
      }
    },
    { srgb: false, repeatX: 48, repeatY: 48 }
  );
  const normalMap = makeNormalTex(
    512,
    512,
    (ctx, w, h) => {
      const r2 = mulberry32(9102);
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 7200; i += 1) {
        const v = 90 + Math.floor(r2() * 78);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(r2() * w, r2() * h, 1.5 + r2() * 4.5, 1.5 + r2() * 4.5);
      }
    },
    { strength: 2.1, repeatX: 48, repeatY: 48 }
  );
  return { albedoMap, roughnessMap, normalMap };
}

function createGraniteSlabMat(colorHex = 0xc5bfb4, repeatX = 14, repeatY = 14) {
  const drawSlabs = (ctx, w, h, isHeight) => {
    const rng = mulberry32(9204);
    ctx.fillStyle = isHeight ? "#3a3a3a" : "#7e7970";
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
        if (isHeight) {
          const hv = 196 + Math.floor(rng() * 44);
          ctx.fillStyle = `rgb(${hv},${hv},${hv})`;
          ctx.fillRect(x + 2, y + 2, cw - 4, rh - 4);
        } else {
          const b = 186 + Math.floor(rng() * 34);
          ctx.fillStyle = `rgb(${b},${b - 2},${b - 7})`;
          ctx.fillRect(x + 1.8, y + 1.8, cw - 3.6, rh - 3.6);
          for (let s = 0; s < 22; s += 1) {
            const sp = 145 + Math.floor(rng() * 85);
            ctx.fillStyle = `rgba(${sp},${sp - 2},${sp - 4},0.28)`;
            ctx.fillRect(x + 3 + rng() * (cw - 7), y + 3 + rng() * (rh - 7), 2.5, 2.5);
          }
        }
      }
    }
  };
  const map = makeCanvasTex(512, 512, (ctx, w, h) => drawSlabs(ctx, w, h, false), {
    repeatX,
    repeatY,
  });
  const normalMap = makeNormalTex(512, 512, (ctx, w, h) => drawSlabs(ctx, w, h, true), {
    strength: 2.5,
    repeatX,
    repeatY,
  });
  return new THREE.MeshStandardMaterial({
    color: colorHex,
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughness: 0.78,
    metalness: 0.05,
  });
}

function createTeakDeckMat(colorHex = 0xc4925e, repeatX = 4, repeatY = 8) {
  const drawDeck = (ctx, w, h, isHeight) => {
    const rng = mulberry32(9305);
    ctx.fillStyle = isHeight ? "#262626" : "#2b241e";
    ctx.fillRect(0, 0, w, h);
    const strips = 14;
    const sw = w / strips;
    for (let s = 0; s < strips; s += 1) {
      const x = s * sw;
      if (isHeight) {
        const hv = 215 + Math.floor(rng() * 28);
        ctx.fillStyle = `rgb(${hv},${hv},${hv})`;
        ctx.fillRect(x + 1.6, 0, sw - 3.2, h);
      } else {
        const tone = Math.floor((rng() - 0.5) * 24);
        ctx.fillStyle = `rgb(${194 + tone},${144 + tone},${96 + tone})`;
        ctx.fillRect(x + 1.5, 0, sw - 3.0, h);
      }
    }
  };
  const map = makeCanvasTex(512, 512, (ctx, w, h) => drawDeck(ctx, w, h, false), {
    repeatX,
    repeatY,
  });
  const normalMap = makeNormalTex(512, 512, (ctx, w, h) => drawDeck(ctx, w, h, true), {
    strength: 2.2,
    repeatX,
    repeatY,
  });
  return new THREE.MeshStandardMaterial({
    color: colorHex,
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.44,
    metalness: 0.04,
  });
}

function createFlowingWaterMat(repeatX = 2, repeatY = 18) {
  const drawRipples = (ctx, w, h, isHeight) => {
    const rng = mulberry32(9409);
    ctx.fillStyle = isHeight ? "#787878" : "#438a8c";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 520; i += 1) {
      const x = rng() * w;
      const y = rng() * h;
      const rw = 10 + rng() * 34;
      const rh = 3 + rng() * 9;
      if (isHeight) {
        const v = 120 + Math.floor(rng() * 115);
        ctx.fillStyle = `rgba(${v},${v},${v},0.45)`;
      } else {
        const c = 185 + Math.floor(rng() * 68);
        ctx.fillStyle = `rgba(${c - 45},${c},${c + 5},0.22)`;
      }
      ctx.beginPath();
      ctx.ellipse(x, y, rw, rh, (rng() - 0.5) * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const map = makeCanvasTex(256, 256, (ctx, w, h) => drawRipples(ctx, w, h, false), {
    repeatX,
    repeatY,
  });
  const normalMap = makeNormalTex(256, 256, (ctx, w, h) => drawRipples(ctx, w, h, true), {
    strength: 2.4,
    repeatX,
    repeatY,
  });
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x62b4b8,
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.7, 0.7),
    transparent: true,
    opacity: 0.82,
    roughness: 0.12,
    metalness: 0.04,
    reflectivity: 0.92,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });
  return { mat, map, normalMap };
}

// ---------------------------------------------------------------------------
// 1. 280m x 280m Multi-Biome PBR Terrain & 950m Distant Mountain Amphitheater
// ---------------------------------------------------------------------------

function buildCoastalTerrainAndHorizon(parent) {
  const terrainGeo = new THREE.PlaneGeometry(280, 280, 224, 224);
  terrainGeo.rotateX(-Math.PI / 2);

  const pos = terrainGeo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let y = getWorldTerrainY(x, z);

    // Seat raw ground cleanly underneath paved Harbor Quay & Waterfront Landing Steps
    if (x >= 9.6 && x <= 46.2 && z >= -25.8 && z <= 22.2) {
      y = Math.min(y, 1.31);
    }
    if (x >= 25.8 && x <= 32.2 && z >= 19.0 && z <= 25.2) {
      y = Math.min(y, -1.25);
    }
    pos.setY(i, y);
  }
  terrainGeo.computeVertexNormals();

  const norm = terrainGeo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);

  const cDeepBed = new THREE.Color(0x687572);
  const cShallowBed = new THREE.Color(0x98927c);
  const cWetSand = new THREE.Color(0xb8a17c);
  const cDrySand = new THREE.Color(0xdfd0b0);
  const cCliffLight = new THREE.Color(0x5e5850);
  const cCliffDark = new THREE.Color(0x413d38);
  const cGrassMid = new THREE.Color(0x577c42);
  const cGrassSun = new THREE.Color(0x698d4c);
  const cGrassDeep = new THREE.Color(0x4b6e3a);
  const cCreekCobble = new THREE.Color(0x74776c);
  const cQuayUnder = new THREE.Color(0x9e988e);
  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();

  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = norm.getY(i);
    const n1 = fbm2(x, z);
    const n2 = fbm2(x * 2.3 + 19.0, z * 2.3 - 11.0);

    const inQuay = x >= 8.0 && x <= 46.5 && z >= -26.2 && z <= 22.4;
    const onSouthBeach = z > 15.0 || (z > 9.0 && x < 9.5);

    if (y < -0.25) {
      const depthT = smoothstep(-0.25, -4.4, y);
      tmpA.copy(cShallowBed).lerp(cDeepBed, depthT);
    } else if (y < 1.55 && !inQuay && onSouthBeach) {
      const sandT = smoothstep(-0.25, 1.38, y);
      tmpA.copy(cWetSand).lerp(cDrySand, sandT);
      if (y > 1.15) {
        const grassEdge = smoothstep(1.15, 1.55, y);
        tmpB.copy(cGrassMid).lerp(cGrassSun, clamp(n1 * 0.5 + 0.5, 0, 1));
        tmpA.lerp(tmpB, grassEdge);
      }
    } else if (y < 1.35 && !inQuay) {
      const shoreRockT = smoothstep(-0.25, 1.25, y);
      tmpA.copy(cCliffDark).lerp(cGrassDeep, shoreRockT);
    } else if (inQuay && y < 1.52) {
      tmpA.copy(cQuayUnder);
    } else {
      const sunMix = clamp(0.5 + n1 * 0.65, 0, 1);
      const shadeMix = clamp(0.35 - n2 * 0.5 + smoothstep(6.0, 16.0, y) * 0.22, 0, 1);
      tmpA.copy(cGrassMid).lerp(cGrassSun, sunMix).lerp(cGrassDeep, shadeMix * 0.62);
    }

    // River shingle & mossy cobbles along North Mountain Creek channel
    if (z >= -112.0 && z <= -23.5) {
      const dCreek = Math.abs(x - getCreekCenterX(z));
      if (dCreek < 4.4) {
        const creekBlend = 1.0 - smoothstep(1.8, 4.4, dCreek);
        tmpA.lerp(cCreekCobble, creekBlend * 0.85);
      }
    }

    // Steep coastal cliffs & rocky limestone slopes (normal.y < 0.70)
    if (ny < 0.70 && y > -1.8) {
      const rockWeight = smoothstep(0.70, 0.42, ny);
      const strata = 0.5 + 0.5 * Math.sin(y * 0.9 + n2 * 4.5);
      tmpB.copy(cCliffDark).lerp(cCliffLight, strata);
      tmpA.lerp(tmpB, rockWeight);
    }

    // Sunlit jade-limestone river-pebble pond bed so fish & river shrimp are crystal-clear
    const rPond = getPondNormalizedRadius(x, z);
    if (rPond < 1.12) {
      const pondTint = 1.0 - smoothstep(0.76, 1.12, rPond);
      tmpB.setHex(0xcbe2d9).lerp(cDrySand, 0.35 + 0.2 * n2);
      tmpA.lerp(tmpB, pondTint * 0.92);
    }

    colors[i * 3 + 0] = tmpA.r;
    colors[i * 3 + 1] = tmpA.g;
    colors[i * 3 + 2] = tmpA.b;
  }
  terrainGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const { albedoMap, roughnessMap, normalMap } = createGroundMicroTextures();
  const terrainMat = new THREE.MeshStandardMaterial({
    map: albedoMap,
    vertexColors: true,
    roughness: 0.88,
    roughnessMap,
    normalMap,
    normalScale: new THREE.Vector2(0.58, 0.58),
    metalness: 0.02,
  });
  terrainMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNormal;`
      )
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        vec4 tWp = modelMatrix * vec4(transformed, 1.0);
        vTerrainWorldPos = tWp.xyz;
        vTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNormal;
        float tHash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float tNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x),
            mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float slopeAmt = smoothstep(0.28, 0.56, 1.0 - clamp(vTerrainWorldNormal.y, 0.0, 1.0));
        float rockMask = slopeAmt * smoothstep(0.45, 1.45, vTerrainWorldPos.y);
        float macroNoise = tNoise(vTerrainWorldPos.xz * 0.14 + vec2(vTerrainWorldPos.y * 0.28));
        float rockFissure = tNoise(vec2(vTerrainWorldPos.x * 0.42 + vTerrainWorldPos.z * 0.36, vTerrainWorldPos.y * 0.95));
        float crevice = smoothstep(0.18, 0.84, macroNoise * 0.55 + rockFissure * 0.45);
        // Linear-space weathered granite & dark limestone matching photogrammetry cliff rocks
        vec3 cliffWarm = vec3(0.135, 0.122, 0.104);
        vec3 cliffDark = vec3(0.052, 0.048, 0.044);
        vec3 cliffColor = mix(cliffDark, cliffWarm, crevice);
        // Subtle moss cap atop cliff ledges
        float ledgeMoss = smoothstep(0.28, 0.52, vTerrainWorldNormal.y) * smoothstep(2.0, 6.0, vTerrainWorldPos.y) * smoothstep(0.42, 0.72, tNoise(vTerrainWorldPos.xz * 0.16));
        cliffColor = mix(cliffColor, vec3(0.07, 0.14, 0.045), ledgeMoss * 0.65);
        diffuseColor.rgb = mix(diffuseColor.rgb, cliffColor, rockMask * 0.86);

        // Meadow natural grass patch variation & clover dappling
        float grassMask = (1.0 - slopeAmt) * smoothstep(0.85, 1.65, vTerrainWorldPos.y);
        float meadowMacro = tNoise(vTerrainWorldPos.xz * 0.075);
        float meadowMicro = tNoise(vTerrainWorldPos.xz * 0.48);
        vec3 meadowTint = mix(vec3(0.84, 0.92, 0.80), vec3(1.10, 1.06, 0.84), meadowMacro);
        meadowTint *= 0.92 + 0.16 * meadowMicro;
        diffuseColor.rgb *= mix(vec3(1.0), meadowTint, grassMask * 0.65);

        // Tidal wet sand saturation near waterline
        float wetSand = (1.0 - slopeAmt) * smoothstep(-0.4, 0.12, vTerrainWorldPos.y) * (1.0 - smoothstep(0.22, 0.75, vTerrainWorldPos.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.64, 0.59, 0.54), wetSand * 0.85);`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        float wetMaskR = (1.0 - smoothstep(0.28, 0.56, 1.0 - clamp(vTerrainWorldNormal.y, 0.0, 1.0)))
          * smoothstep(-0.4, 0.12, vTerrainWorldPos.y)
          * (1.0 - smoothstep(0.20, 0.62, vTerrainWorldPos.y));
        roughnessFactor = mix(roughnessFactor, 0.22, wetMaskR * 0.88);`
      );
  };

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.userData.noCastShadow = true;
  terrainMesh.name = "CoastalPeninsulaTerrain";
  parent.add(terrainMesh);
}

function createWickerMat() {
  const map = makeCanvasTex(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = "#b98d58";
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 8) {
        for (let x = 0; x < w; x += 16) {
          const off = ((y / 8) % 2) * 8;
          ctx.fillStyle = "#cfa46e";
          ctx.fillRect(x + off, y + 1, 12, 6);
          ctx.fillStyle = "#8a6338";
          ctx.fillRect(x + off + 12, y + 1, 4, 6);
        }
      }
    },
    { repeatX: 3, repeatY: 2 }
  );
  return new THREE.MeshStandardMaterial({ color: 0xd4ac79, map, roughness: 0.84, metalness: 0.02 });
}

// ---------------------------------------------------------------------------
// 2. Villa Flagstone Courtyard, Scenic Trails, Fountain, Pergolas, Mailbox & Bike
// ---------------------------------------------------------------------------

function buildCourtyardAndTrails(parent, waterAnimList) {
  const sec = new THREE.Group();
  sec.name = "CourtyardAndTrails";

  const flagstoneMat = createGraniteSlabMat(0xdcd3c1, 8, 4);
  const trailStoneMat = pbrStoneMat(0xd7cebc, { repeatX: 2, repeatY: 2, roughness: 0.84 });
  const limestoneMat = pbrStoneMat(0xe5dfd2, { repeatX: 3, repeatY: 2, roughness: 0.76 });
  const cedarMat = pbrWoodMat(0x9b6842, { repeatX: 2, repeatY: 4, roughness: 0.56 });
  const brassMat = pbrMetalMat(0xcba358, { roughness: 0.26, metalness: 0.86 });
  const chromeMat = pbrMetalMat(0xe2e7eb, { roughness: 0.16, metalness: 0.92 });

  // Paved Villa Front Flagstone Courtyard: X in [-20, +1.5], Z in [+6.8, +12.2], Y = +2.22m
  const courtSlab = new THREE.Mesh(new THREE.BoxGeometry(21.5, 0.16, 5.4), flagstoneMat);
  courtSlab.position.set(-9.25, 2.14, 9.5);
  sec.add(courtSlab);
  const courtBorderMat = limestoneMat;
  for (const [bx, bz, bw, bd] of [
    [-9.25, 12.26, 21.7, 0.18],
    [1.56, 9.5, 0.18, 5.56],
  ]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.20, bd), courtBorderMat);
    curb.position.set(bx, 2.16, bz);
    sec.add(curb);
  }

  // Connecting entrance walk south & fountain apron + east landing bridging smoothly to Harbor Steps:
  // X in [-16, +2.0], Z in [+1.8, +6.8]
  const fountainApron = new THREE.Mesh(new THREE.BoxGeometry(18.0, 0.15, 5.2), flagstoneMat);
  fountainApron.position.set(-7.0, 2.135, 4.4);
  sec.add(fountainApron);

  registerWalkZone((x, z) => {
    if (x >= -20.0 && x <= 4.0 && z >= 6.8 && z <= 12.2) return 2.22;
    if (x >= -16.0 && x <= 2.0 && z >= 1.8 && z <= 7.0) return 2.21;
    if (x >= 2.0 && x <= 10.2 && z >= 1.8 && z <= 7.0) {
      return lerp(2.22, 1.38, smoothstep(2.0, 10.2, x));
    }
    return null;
  });

  // Grand stepped limestone stairway from East Courtyard Landing (X=+2, Y=2.22) cleanly down to Harbor Quay (X=+10.9, Y=1.38)
  const rampGeos = [];
  const rampSteps = 11;
  for (let i = 0; i < rampSteps; i += 1) {
    const t0 = i / rampSteps;
    const t1 = (i + 1) / rampSteps;
    const xm = lerp(2.0, 10.9, (t0 + t1) * 0.5);
    const stepY = i === rampSteps - 1
      ? 1.40
      : Math.max(lerp(2.22, 1.40, smoothstep(0, 1, (t0 + t1) * 0.5)), getWorldTerrainY(xm, 4.4) + 0.08);
    const g = new THREE.BoxGeometry(0.92, 0.34, 5.2);
    g.translate(xm, stepY - 0.16, 4.4);
    rampGeos.push(g);
  }
  for (const cz of [1.72, 7.08]) {
    const stringer = new THREE.BoxGeometry(9.1, 0.42, 0.24);
    stringer.rotateZ(-0.095);
    stringer.translate(6.45, 1.85, cz);
    rampGeos.push(stringer);
  }

  // Conformed natural limestone flagstone trails (West Gazebo + North Bridge & Windmill)
  const rng = mulberry32(3107);
  const addPolylineStones = (waypoints, spacing = 1.15, widthScale = 1.0) => {
    const pts3 = waypoints.map(([px, pz]) => new THREE.Vector3(px, 0, pz));
    const curve = new THREE.CatmullRomCurve3(pts3);
    const totalLen = curve.getLength();
    const count = Math.max(4, Math.floor(totalLen / spacing));
    const nrm = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion();

    for (let i = 0; i <= count; i += 1) {
      const u = i / count;
      const p = curve.getPointAt(u);
      const tan = curve.getTangentAt(u);
      // Skip stones directly over the arched bridge span
      if (p.x > 3.1 && p.x < 13.7 && Math.abs(p.z + 44.0) < 2.2) continue;

      const ty = getWorldTerrainY(p.x, p.z);
      getTerrainNormal(p.x, p.z, nrm);
      q.setFromUnitVectors(up, nrm);

      const sg = new THREE.CylinderGeometry(
        (0.58 + rng() * 0.18) * widthScale,
        (0.64 + rng() * 0.18) * widthScale,
        0.09,
        7
      );
      sg.scale(1.0, 1.0, 0.76 + rng() * 0.24);
      sg.rotateY(Math.atan2(tan.x, tan.z) + (rng() - 0.5) * 0.35);
      sg.applyQuaternion(q);
      sg.translate(p.x + (rng() - 0.5) * 0.16, ty + 0.03, p.z + (rng() - 0.5) * 0.16);
      rampGeos.push(sg);
    }
  };

  addPolylineStones([
    [-20.0, 9.2],
    [-25.0, 4.4],
    [-28.0, 1.0],
    [-31.0, 1.0],
    [-38.0, 8.0],
    [-49.0, 20.0],
    [-57.0, 31.0],
    [-60.2, 37.8],
  ]);
  addPolylineStones([
    [-8.0, -13.5],
    [1.2, -28.0],
    [2.9, -44.0],
  ]);
  addPolylineStones([
    [14.2, -25.5],
    [15.0, -35.0],
    [13.9, -44.0],
  ], 1.25, 0.9);
  addPolylineStones([
    [2.8, -44.2],
    [-12.0, -52.0],
    [-34.0, -60.0],
    [-48.2, -66.5],
  ]);
  // Scenic hillside garden spurs linking the 3 Provençal stone cottages to the main trail
  addPolylineStones([
    [-48.2, -65.0],
    [-62.5, -60.5],
    [-73.5, -56.5],
  ], 1.2, 0.88);
  addPolylineStones([
    [-14.0, -53.0],
    [-16.2, -66.5],
    [-17.8, -76.5],
  ], 1.2, 0.88);
  addPolylineStones([
    [14.2, -45.5],
    [19.2, -55.5],
    [23.2, -63.0],
  ], 1.2, 0.88);

  const trailsMesh = new THREE.Mesh(safeMerge(rampGeos), trailStoneMat);
  sec.add(trailsMesh);

  // 3-Tier Carved Limestone Courtyard Fountain on courtSlab at (-4.8, 2.22, +9.5)
  const fountain = new THREE.Group();
  fountain.position.set(-4.8, 2.22, 9.5);
  registerCircleCollider(-4.8, 9.5, 2.22, 1.5, 5.0);

  const ftnWall = new THREE.Mesh(new THREE.CylinderGeometry(1.98, 2.08, 0.54, 16, 1, true), limestoneMat);
  ftnWall.position.y = 0.27;
  const ftnCoping = new THREE.Mesh(new THREE.TorusGeometry(1.98, 0.13, 10, 24), limestoneMat);
  ftnCoping.rotation.x = Math.PI / 2;
  ftnCoping.position.y = 0.54;
  const ftnFloor = new THREE.Mesh(new THREE.CylinderGeometry(1.94, 1.94, 0.12, 16), limestoneMat);
  ftnFloor.position.y = 0.06;
  const ftnPed1 = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.48, 1.25, 12), limestoneMat);
  ftnPed1.position.y = 0.68;
  const ftnBowl2 = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 0.42, 0.32, 16), limestoneMat);
  ftnBowl2.position.y = 1.32;
  const ftnPed2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.82, 12), limestoneMat);
  ftnPed2.position.y = 1.76;
  const ftnBowl3 = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.22, 0.22, 14), limestoneMat);
  ftnBowl3.position.y = 2.18;
  const ftnFinial = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 10), brassMat);
  ftnFinial.position.y = 2.44;
  fountain.add(ftnWall, ftnCoping, ftnFloor, ftnPed1, ftnBowl2, ftnPed2, ftnBowl3, ftnFinial);

  const ftnWaterObj = createFlowingWaterMat(2, 2);
  const wDisc1 = new THREE.Mesh(new THREE.CircleGeometry(1.88, 24), ftnWaterObj.mat);
  wDisc1.rotation.x = -Math.PI / 2;
  wDisc1.position.y = 0.44;
  const wDisc2 = new THREE.Mesh(new THREE.CircleGeometry(0.96, 18), ftnWaterObj.mat);
  wDisc2.rotation.x = -Math.PI / 2;
  wDisc2.position.y = 1.45;
  const plumeMat = pbrGlassMat({ color: 0xeaf9fc, opacity: 0.42 });
  const plume = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.36, 1.15, 12, 1, true), plumeMat);
  plume.position.y = 1.98;
  fountain.add(wDisc1, wDisc2, plume);
  waterAnimList.push({ map: ftnWaterObj.map, normalMap: ftnWaterObj.normalMap, vx: 0.08, vy: 0.11 });
  sec.add(fountain);

  // Helper: Realistic Cedar & White-Stone Garden Pergola Arch with Climbing Roses
  const buildRosePergolaArch = (cx, baseY, cz, rotY) => {
    const arch = new THREE.Group();
    arch.position.set(cx, baseY, cz);
    arch.rotation.y = rotY;
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x3b6134, roughness: 0.82 });
    const roseBlush = pbrFabricMat(0xf2b8c4, { roughness: 0.74 });
    const roseIvory = pbrFabricMat(0xfaf3e8, { roughness: 0.74 });
    const halfSpan = 1.62;

    for (const sx of [-1, 1]) {
      for (const sz of [-0.42, 0.42]) {
        const lx = sx * halfSpan;
        const wx = cx + lx * Math.cos(rotY) + sz * Math.sin(rotY);
        const wz = cz - lx * Math.sin(rotY) + sz * Math.cos(rotY);
        registerCircleCollider(wx, wz, 0.22, baseY - 0.5, baseY + 3.0);
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 0.34), limestoneMat);
        plinth.position.set(sx * halfSpan, 0.12, sz);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.55, 0.16), cedarMat);
        post.position.set(sx * halfSpan, 1.82, sz);
        arch.add(plinth, post);
      }
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 1.38), cedarMat);
      plate.position.set(sx * halfSpan, 3.12, 0);
      arch.add(plate);

      const worldPx = cx + Math.cos(rotY) * (sx * halfSpan);
      const worldPz = cz - Math.sin(rotY) * (sx * halfSpan);
      registerCircleCollider(worldPx, worldPz, 0.28);
    }

    for (const sz of [-0.42, 0.42]) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(3.85, 0.18, 0.14), cedarMat);
      tie.position.set(0, 3.24, sz);
      const crown = new THREE.Mesh(
        new THREE.TorusGeometry(1.68, 0.08, 8, 20, Math.PI * 0.72),
        cedarMat
      );
      crown.rotation.z = Math.PI * 0.14;
      crown.scale.set(1.05, 0.42, 1.0);
      crown.position.set(0, 3.08, sz);
      arch.add(tie, crown);
    }
    for (let r = -4; r <= 4; r += 1) {
      const purlin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 1.62), cedarMat);
      purlin.position.set(r * 0.44, 3.38, 0);
      arch.add(purlin);
    }

    // Climbing woody vine stems (sculpted 16-petal roses & compound leaves are mounted by botanical-flora.js)
    for (const sx of [-1.62, 1.62]) {
      const stemCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx, 0.35, -0.22),
        new THREE.Vector3(sx * 0.98, 1.45, 0.18),
        new THREE.Vector3(sx * 0.88, 2.55, -0.14),
        new THREE.Vector3(sx * 0.42, 3.24, 0.08),
      ]);
      const vineStem = new THREE.Mesh(
        new THREE.TubeGeometry(stemCurve, 14, 0.022, 6, false),
        cedarMat
      );
      arch.add(vineStem);
    }
    return arch;
  };

  sec.add(buildRosePergolaArch(-14.0, 2.2, 10.2, 0.0));
  sec.add(buildRosePergolaArch(-31.0, 2.22, 1.0, 0.78));
  parent.add(sec);

  return buildCourtyardProps(sec, { limestoneMat, cedarMat, brassMat, chromeMat });
}

function buildCourtyardProps(sec, { limestoneMat, cedarMat, brassMat, chromeMat }) {
  // Interactive Handcrafted Timber, Verdigris-Copper & Brushed-Brass Rose Mailbox at (-10.8, 2.20, +9.4)
  const mailbox = new THREE.Group();
  mailbox.position.set(-10.8, 2.2, 9.4);
  mailbox.rotation.y = 0.18;
  registerCircleCollider(-10.8, 9.4, 0.42);

  const copperMat = pbrMetalMat(0x5b7d72, { roughness: 0.38, metalness: 0.76 });
  const darkWood = pbrWoodMat(0x6e472b, { roughness: 0.40 });
  const roseReliefMat = pbrMetalMat(0xd69a8e, { roughness: 0.32, metalness: 0.72 });
  const flagCrimsonMat = pbrMetalMat(0xb63b3e, { roughness: 0.34, metalness: 0.45 });
  const creamEnvMat = pbrFabricMat(0xf9f2e6, { roughness: 0.82 });

  // Stepped octagonal limestone plinth + chamfered cedar post + S-scroll wrought-iron bracket
  const mbBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.16, 8), limestoneMat);
  mbBase.position.y = 0.08;
  const mbCollar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.16), limestoneMat);
  mbCollar.position.y = 0.18;
  const mbPost = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.06, 0.11), cedarMat);
  mbPost.position.y = 0.64;
  const scrollCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.82, 0.06),
    new THREE.Vector3(0, 0.96, 0.16),
    new THREE.Vector3(0, 1.09, 0.14),
    new THREE.Vector3(0, 1.12, 0.24),
  ]);
  const mbScroll = new THREE.Mesh(new THREE.TubeGeometry(scrollCurve, 16, 0.012, 8, false), brassMat);

  // Molded walnut letterbox body + overhanging verdigris-copper barrel vault hood + brass mail flap
  const mbPlinth = new THREE.Mesh(createPillowedCushionGeo(0.38, 0.035, 0.54, 0.02, 0), darkWood);
  mbPlinth.position.set(0, 1.13, 0.05);
  const mbBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.48), darkWood);
  mbBody.position.set(0, 1.26, 0.05);
  const mbVault = new THREE.Mesh(new THREE.CylinderGeometry(0.178, 0.178, 0.52, 20, 1, false, -Math.PI * 0.52, Math.PI * 1.04), copperMat);
  mbVault.rotation.z = Math.PI * 0.5;
  mbVault.rotation.y = Math.PI * 0.5;
  mbVault.position.set(0, 1.37, 0.05);
  const mbSlotHood = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.052, 0.032), brassMat);
  mbSlotHood.position.set(0, 1.32, 0.30);
  mbSlotHood.rotation.x = 0.18;
  const mbPlate = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.068, 0.016), brassMat);
  mbPlate.position.set(0, 1.20, 0.296);
  // Peeking cream letter corner in slot + raised crimson postal flag + sculpted side rose relief
  const peekEnv = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.008, 0.09), creamEnvMat);
  peekEnv.position.set(-0.02, 1.305, 0.31);
  peekEnv.rotation.set(0.22, 0.14, 0.05);
  // Postal flag on its own hinge pivot (animated by the "raise flag" interaction)
  const flagPivot = new THREE.Group();
  flagPivot.position.set(0.182, 1.275, 0.16);
  flagPivot.userData.noBatch = true;
  const flagStem = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.21, 0.018), flagCrimsonMat);
  flagStem.position.set(0, 0.095, 0);
  const flagBanner = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.065, 0.095), flagCrimsonMat);
  flagBanner.position.set(0, 0.18, 0.038);
  flagPivot.add(flagStem, flagBanner);
  const mbRose = new THREE.Mesh(new THREE.TorusKnotGeometry(0.032, 0.010, 32, 8), roseReliefMat);
  mbRose.position.set(-0.176, 1.26, 0.05);
  mbRose.rotation.y = Math.PI / 2;

  mailbox.add(
    mbBase,
    mbCollar,
    mbPost,
    mbScroll,
    mbPlinth,
    mbBody,
    mbVault,
    mbSlotHood,
    mbPlate,
    peekEnv,
    flagPivot,
    mbRose
  );
  tagInteractive(mailbox, "mailbox", "庭院玫瑰信箱");
  sec.add(mailbox);

  // Interactive French Col-de-Cygne Vintage Pastel-Mint Touring Bicycle at (-18.6, 2.20, +9.6)
  const bikeHolder = new THREE.Group();
  bikeHolder.position.set(-18.6, 2.2, 9.6);
  bikeHolder.rotation.y = 0.48;
  registerCircleCollider(-18.6, 9.6, 0.65);

  const bike = new THREE.Group();
  bike.rotation.z = 0.10; // Leaned naturally onto kickstand
  const mintPaint = new THREE.MeshPhysicalMaterial({
    color: 0x8ec4b5,
    roughness: 0.20,
    metalness: 0.16,
    clearcoat: 0.88,
    clearcoatRoughness: 0.12,
  });
  const creamTireMat = new THREE.MeshStandardMaterial({ color: 0xefe7d6, roughness: 0.80 });
  const saddleLeather = pbrWoodMat(0x7c4522, { roughness: 0.38 });
  const lampLensMat = new THREE.MeshStandardMaterial({
    color: 0xfff8e6,
    emissive: new THREE.Color(0xffd996),
    emissiveIntensity: 0.65,
    roughness: 0.15,
  });
  const wickerMat = createWickerMat();

  const buildSpokedWheel = (wx, isRear = false) => {
    const wg = new THREE.Group();
    wg.position.set(wx, 0.34, 0);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.029, 14, 32), creamTireMat);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.294, 0.012, 10, 32), chromeMat);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.075, 12), chromeMat);
    hub.rotation.x = Math.PI / 2;
    wg.add(tire, rim, hub);
    for (let s = 0; s < 16; s += 1) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.58, 4), chromeMat);
      spoke.rotation.z = (s / 16) * Math.PI;
      spoke.rotation.x = (s % 2 === 0 ? 1 : -1) * 0.045;
      wg.add(spoke);
    }
    const fenderArc = isRear ? Math.PI * 1.05 : Math.PI * 0.88;
    const fender = new THREE.Mesh(new THREE.TorusGeometry(0.352, 0.023, 10, 24, fenderArc), mintPaint);
    fender.rotation.z = isRear ? -0.02 : Math.PI * 0.08;
    wg.add(fender);
    // Fender wire stays
    for (const sa of [0.35, 1.15]) {
      const stay = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.35, 4), chromeMat);
      stay.position.set(Math.cos(sa) * 0.17, Math.sin(sa) * 0.17, 0);
      stay.rotation.z = sa - Math.PI * 0.5;
      wg.add(stay);
    }
    return wg;
  };
  const rearWheel = buildSpokedWheel(-0.55, true);
  const frontWheel = buildSpokedWheel(0.55, false);
  rearWheel.userData.noBatch = true;
  frontWheel.userData.noBatch = true;
  bike.add(rearWheel, frontWheel);

  const addTube = (x1, y1, z1, x2, y2, z2, r, mat) => {
    const p1 = new THREE.Vector3(x1, y1, z1);
    const p2 = new THREE.Vector3(x2, y2, z2);
    const dir = p2.clone().sub(p1);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
    m.position.copy(p1).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    bike.add(m);
  };

  // Classic Col-de-Cygne Curved Step-Through Frame + Twin Fork Blades + Rear Pannier Rack
  addTube(-0.10, 0.33, 0, -0.24, 0.78, 0, 0.016, mintPaint); // Seat tube
  addTube(0.39, 0.80, 0, 0.44, 0.65, 0, 0.018, mintPaint); // Head tube
  for (const fz of [-0.036, 0.036]) {
    addTube(0.44, 0.65, fz, 0.55, 0.34, fz, 0.011, mintPaint); // Twin fork blades
    addTube(-0.55, 0.34, fz, -0.10, 0.33, fz * 0.65, 0.010, mintPaint); // Chainstays
    addTube(-0.55, 0.34, fz, -0.22, 0.73, fz * 0.5, 0.009, mintPaint); // Seatstays
  }
  const swanDown = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.42, 0.69, 0),
    new THREE.Vector3(0.20, 0.50, 0),
    new THREE.Vector3(-0.02, 0.35, 0),
    new THREE.Vector3(-0.10, 0.33, 0),
  ]);
  const swanTop = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.40, 0.76, 0),
    new THREE.Vector3(0.16, 0.58, 0),
    new THREE.Vector3(-0.06, 0.49, 0),
    new THREE.Vector3(-0.19, 0.58, 0),
  ]);
  bike.add(
    new THREE.Mesh(new THREE.TubeGeometry(swanDown, 20, 0.015, 10, false), mintPaint),
    new THREE.Mesh(new THREE.TubeGeometry(swanTop, 20, 0.014, 10, false), mintPaint)
  );
  addTube(-0.08, 0.32, 0.04, -0.13, 0.01, 0.15, 0.008, chromeMat); // Kickstand

  // Sculpted Chain-Guard, Crankset, Pedals, Rear Pannier Rack & Vintage Bullet Headlamp
  const chainGuard = new THREE.Mesh(createPillowedCushionGeo(0.46, 0.11, 0.028, 0.04, 0.004), mintPaint);
  chainGuard.position.set(-0.28, 0.36, 0.042);
  chainGuard.rotation.z = -0.05;
  const chainring = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.010, 20), chromeMat);
  chainring.rotation.x = Math.PI / 2;
  chainring.position.set(-0.10, 0.33, 0.036);
  // Crank arms + pedals
  addTube(-0.10, 0.33, 0.05, -0.04, 0.19, 0.055, 0.008, chromeMat);
  addTube(-0.10, 0.33, -0.05, -0.16, 0.47, -0.055, 0.008, chromeMat);
  const pedR = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.018, 0.055), saddleLeather);
  pedR.position.set(-0.04, 0.19, 0.085);
  const pedL = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.018, 0.055), saddleLeather);
  pedL.position.set(-0.16, 0.47, -0.085);

  // Brooks-Style Contoured Leather Saddle on Twin Coil Springs
  addTube(-0.24, 0.78, 0, -0.26, 0.85, 0, 0.012, chromeMat);
  const saddle = new THREE.Mesh(createPillowedCushionGeo(0.26, 0.048, 0.18, 0.055, 0.012), saddleLeather);
  saddle.position.set(-0.26, 0.875, 0);
  for (const sz of [-0.05, 0.05]) {
    const spr = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.042, 8), chromeMat);
    spr.position.set(-0.33, 0.84, sz);
    bike.add(spr);
  }

  // Rear Pannier Rack over Rear Fender
  const rackDeck = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.014, 0.14), chromeMat);
  rackDeck.position.set(-0.52, 0.72, 0);
  addTube(-0.55, 0.35, -0.05, -0.64, 0.72, -0.06, 0.005, chromeMat);
  addTube(-0.55, 0.35, 0.05, -0.64, 0.72, 0.06, 0.005, chromeMat);

  // Swept-Back North-Road Promenade Handlebars + Stitched Leather Grips + Brass Bell + Headlamp
  addTube(0.39, 0.80, 0, 0.36, 0.94, 0, 0.012, chromeMat);
  const barCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.22, 0.93, -0.24),
    new THREE.Vector3(0.34, 0.95, -0.15),
    new THREE.Vector3(0.37, 0.95, 0),
    new THREE.Vector3(0.34, 0.95, 0.15),
    new THREE.Vector3(0.22, 0.93, 0.24),
  ]);
  const hBar = new THREE.Mesh(new THREE.TubeGeometry(barCurve, 22, 0.010, 8, false), chromeMat);
  for (const sz of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.11, 10), saddleLeather);
    grip.position.set(0.25, 0.935, sz * 0.21);
    grip.rotation.set(sz * 0.55, 0, Math.PI * 0.45);
    bike.add(grip);
  }
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 10), brassMat);
  bell.scale.set(1, 0.72, 1);
  bell.position.set(0.34, 0.972, 0.12);
  bell.userData.noBatch = true;

  // Chrome Vintage Headlamp on Front Fork Crown
  const headlamp = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.022, 0.068, 14), chromeMat);
  headlamp.rotation.z = Math.PI * 0.5;
  headlamp.position.set(0.49, 0.69, 0);
  const lampLens = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.029, 0.008, 14), lampLensMat);
  lampLens.rotation.z = Math.PI * 0.5;
  lampLens.position.set(0.525, 0.69, 0);

  // Handwoven Rattan Front Flower Basket with Leather Straps & Fresh Rose Bouquet
  const basketPts = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(0.11, 0),
    new THREE.Vector2(0.15, 0.21),
    new THREE.Vector2(0.16, 0.225),
  ];
  const basket = new THREE.Mesh(new THREE.LatheGeometry(basketPts, 18), wickerMat);
  basket.scale.set(0.86, 1.0, 1.28);
  basket.position.set(0.53, 0.74, 0);
  const bRim = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.012, 8, 20), wickerMat);
  bRim.rotation.x = Math.PI * 0.5;
  bRim.scale.set(0.86, 1.28, 1.0);
  bRim.position.set(0.53, 0.96, 0);
  const basketBouquet = createRoseBouquet({ count: 8, scale: 0.76 });
  basketBouquet.position.set(0.53, 0.80, 0);

  bike.add(
    chainGuard,
    chainring,
    pedR,
    pedL,
    saddle,
    rackDeck,
    hBar,
    bell,
    headlamp,
    lampLens,
    basket,
    bRim,
    basketBouquet
  );
  bikeHolder.add(bike);
  tagInteractive(bikeHolder, "bicycle", "庭院复古单车");
  sec.add(bikeHolder);
  // Fender is a child of the wheel group: keep fenders static by moving them out of the spinning group
  for (const wg of [rearWheel, frontWheel]) {
    const fenderParts = wg.children.filter((c) => c.geometry && c.geometry.type === "TorusGeometry" && c.material === mintPaint);
    for (const f of fenderParts) {
      wg.remove(f);
      f.position.add(wg.position);
      bike.add(f);
    }
  }
  return { mailbox, flagPivot, bikeHolder, wheels: [rearWheel, frontWheel], bell };
}

// ---------------------------------------------------------------------------
// 3. East Granite Harbor Quay, Landing Steps, Boathouse Cafe & Finger Piers
// ---------------------------------------------------------------------------

function buildHarborQuayAndBoathouse(parent) {
  const sec = new THREE.Group();
  sec.name = "GraniteHarborQuay";

  const quayDeckMat = createGraniteSlabMat(0xc8c1b5, 18, 22);
  const quayWallMat = pbrStoneMat(0xb6afa2, { repeatX: 16, repeatY: 3, roughness: 0.82 });
  const copingMat = pbrStoneMat(0xd4cdc0, { repeatX: 12, repeatY: 1, roughness: 0.74 });
  const castIronMat = pbrMetalMat(0x23272a, { roughness: 0.44, metalness: 0.78 });
  const brassMat = pbrMetalMat(0xcba358, { roughness: 0.26, metalness: 0.86 });
  const rubberFenderMat = new THREE.MeshStandardMaterial({ color: 0x1e2022, roughness: 0.88, metalness: 0.06 });
  const ropeMat = pbrFabricMat(0xc9b38c, { roughness: 0.92 });
  const teakMat = createTeakDeckMat(0xb88656, 4, 8);
  const lanternGlowMat = new THREE.MeshStandardMaterial({
    color: 0xfff3d6,
    emissive: 0xffb95e,
    emissiveIntensity: 0.62,
    roughness: 0.2,
  });

  // Walk zones: Quay (Y=+1.36), Waterfront Landing Steps (1.36 -> 0.45), Low Stage (+0.45), 2 Finger Piers (+1.15)
  registerWalkZone((x, z) => {
    // Low timber landing stage south of stone steps
    if (x >= 25.5 && x <= 32.5 && z >= 22.0 && z <= 24.8) return 0.45;
    // Cut-in stone landing steps (Z in [19.2, 22.0], X in [26.0, 32.0])
    if (x >= 26.0 && x <= 32.0 && z >= 19.2 && z <= 22.0) {
      return lerp(1.36, 0.45, clamp((z - 19.2) / 2.8, 0, 1));
    }
    // 2 Timber Finger Piers at Z = -8 and Z = +2 (length 11m: X in [45.8, 57.0], width 1.8m)
    if (x >= 45.8 && x <= 57.0 && (Math.abs(z + 8.0) <= 0.92 || Math.abs(z - 2.0) <= 0.92)) {
      return 1.15;
    }
    // Main Granite Harbor Quay: X in [+8, +46], Z in [-26, +22]
    if (x >= 8.0 && x <= 46.0 && z >= -26.0 && z <= 22.0) {
      let qy = 1.36;
      if (x < 10.0) qy = lerp(getWorldTerrainY(x, z), 1.36, smoothstep(8.0, 10.0, x));
      if (z < -24.0) qy = lerp(getWorldTerrainY(x, z), qy, smoothstep(-26.0, -24.0, z));
      return qy;
    }
    return null;
  });

  // Paved Granite Quay Deck Slabs (split cleanly around Landing Steps X in [26, 32], Z in [19.2, 22.0])
  const addDeckSlab = (xMin, xMax, zMin, zMax) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(xMax - xMin, 0.32, zMax - zMin),
      quayDeckMat
    );
    m.position.set((xMin + xMax) * 0.5, 1.2, (zMin + zMax) * 0.5);
    sec.add(m);
  };
  addDeckSlab(9.2, 46.0, -25.8, 19.2);
  addDeckSlab(9.2, 26.0, 19.2, 22.0);
  addDeckSlab(32.0, 46.0, 19.2, 22.0);

  // Warm Teak Waterfront Promenade Apron framing East & South seawall + coastal stone planters
  const promenadeE = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.032, 46.2), teakMat);
  promenadeE.position.set(44.2, 1.372, -2.0);
  const promenadeS1 = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.032, 2.1), teakMat);
  promenadeS1.position.set(17.4, 1.372, 20.5);
  const promenadeS2 = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.032, 2.1), teakMat);
  promenadeS2.position.set(39.1, 1.372, 20.5);
  sec.add(promenadeE, promenadeS1, promenadeS2);

  // Raised limestone planter curbs framing the west quay entry & pergola garden + lush Mediterranean flower beds
  const planterLeafMatA = new THREE.MeshStandardMaterial({ color: 0x3b6336, roughness: 0.84 });
  const planterLeafMatB = new THREE.MeshStandardMaterial({ color: 0x527b47, roughness: 0.82 });
  const planterLavMat = new THREE.MeshStandardMaterial({ color: 0x8d72b8, roughness: 0.76 });
  const planterRng = mulberry32(1904);
  for (const [px, pz, sx, sz] of [
    [11.4, -14.8, 1.5, 4.4],
    [11.4, 11.4, 1.5, 4.2],
    [22.0, -17.2, 7.6, 1.35],
  ]) {
    registerBoxCollider(px - sx * 0.5, px + sx * 0.5, pz - sz * 0.5, pz + sz * 0.5);
    const box = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.44, sz), copingMat);
    box.position.set(px, 1.58, pz);
    const soil = new THREE.Mesh(
      new THREE.BoxGeometry(sx - 0.24, 0.08, sz - 0.24),
      new THREE.MeshStandardMaterial({ color: 0x3b2c20, roughness: 0.94 })
    );
    soil.position.set(px, 1.79, pz);
    sec.add(box, soil);

    const alongX = sx > sz;
    const span = (alongX ? sx : sz) - 0.65;
    const bushCnt = alongX ? 9 : 5;
    for (let bi = 0; bi < bushCnt; bi += 1) {
      const u = bushCnt > 1 ? bi / (bushCnt - 1) - 0.5 : 0;
      const bx = px + (alongX ? u * span : (planterRng() - 0.5) * (sx * 0.34));
      const bz = pz + (alongX ? (planterRng() - 0.5) * (sz * 0.32) : u * span);
      const r = 0.28 + planterRng() * 0.14;
      const mound = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r, 1),
        bi % 2 === 0 ? planterLeafMatA : planterLeafMatB
      );
      mound.scale.set(1.18, 0.76 + planterRng() * 0.25, 1.12);
      mound.position.set(bx, 1.84 + r * 0.38, bz);
      mound.rotation.y = planterRng() * Math.PI * 2;
      sec.add(mound);

      if (bi % 2 === 0) {
        const rosePatch = createRoseBouquet({ count: 6, scale: 0.78 });
        rosePatch.position.set(bx, 2.08, bz);
        sec.add(rosePatch);
      } else {
        for (let lv = 0; lv < 3; lv += 1) {
          const sp = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.34, 6), planterLavMat);
          sp.position.set(bx + (lv - 1) * 0.11, 2.12, bz + (planterRng() - 0.5) * 0.14);
          sp.rotation.z = (planterRng() - 0.5) * 0.28;
          sec.add(sp);
        }
      }
    }
  }

  // Nautical oak harbor barrels & dock crates along north-east wharf
  const barrelMat = pbrWoodMat(0x7c4f2e, { roughness: 0.62 });
  for (const [bx, bz] of [
    [41.5, -22.2],
    [42.2, -21.5],
    [41.4, -21.1],
    [34.8, 17.5],
  ]) {
    registerCircleCollider(bx, bz, 0.44);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.30, 0.78, 12), barrelMat);
    barrel.position.set(bx, 1.75, bz);
    for (const ry of [0.18, -0.18]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.322, 0.014, 6, 16), castIronMat);
      hoop.rotation.x = Math.PI * 0.5;
      hoop.position.set(bx, 1.75 + ry, bz);
      sec.add(hoop);
    }
    sec.add(barrel);
  }

  // Vertical Ashlar Granite Quay Seawalls (top Y = +1.38m down to Y = -4.5m -> height 5.88m, midY = -1.56m)
  const addSeawall = (cx, cz, sx, sz) => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(sx, 5.88, sz), quayWallMat);
    w.position.set(cx, -1.56, cz);
    const cope = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.14, 0.18, sz + 0.14), copingMat);
    cope.position.set(cx, 1.33, cz);
    sec.add(w, cope);
  };
  addSeawall(45.7, -2.0, 0.65, 48.0); // East seawall X = 46, Z in [-26, +22]
  addSeawall(18.0, 21.7, 16.0, 0.65); // South-west seawall Z = 22, X in [10, 26]
  addSeawall(39.0, 21.7, 14.0, 0.65); // South-east seawall Z = 22, X in [32, 46]
  addSeawall(38.0, -25.6, 16.0, 0.65); // North-east seawall return

  // Rubber Dock Fenders along East & South seawalls
  for (let z = -22; z <= 18; z += 5.0) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.65, 10), rubberFenderMat);
    f.position.set(46.08, 0.42, z);
    sec.add(f);
  }
  for (const x of [15, 21, 35, 41]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.65, 10), rubberFenderMat);
    f.position.set(x, 0.42, 22.08);
    sec.add(f);
  }

  buildQuayDetailsLandingAndCafe(sec, {
    quayWallMat,
    copingMat,
    castIronMat,
    brassMat,
    ropeMat,
    teakMat,
    lanternGlowMat,
  });
  parent.add(sec);
  return { lanternGlowMat };
}

function buildQuayDetailsLandingAndCafe(
  sec,
  { quayWallMat, copingMat, castIronMat, brassMat, ropeMat, teakMat, lanternGlowMat }
) {
  // Cast-iron mooring bollards + coiled hemp lines
  const bollardCoords = [
    [45.15, -23.0],
    [45.15, -14.5],
    [45.15, -5.0],
    [45.15, 4.8],
    [45.15, 15.2],
    [16.5, 21.15],
    [24.2, 21.15],
    [34.2, 21.15],
    [42.5, 21.15],
  ];
  for (let i = 0; i < bollardCoords.length; i += 1) {
    const [bx, bz] = bollardCoords[i];
    registerCircleCollider(bx, bz, 0.34);
    const bg = new THREE.Group();
    bg.position.set(bx, 1.36, bz);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.46), castIronMat);
    plate.position.y = 0.03;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.48, 12), castIronMat);
    stem.position.y = 0.27;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), castIronMat);
    cap.scale.set(1, 0.55, 1);
    cap.position.y = 0.51;
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.46, 8), castIronMat);
    horn.rotation.z = Math.PI / 2;
    horn.position.y = 0.39;
    bg.add(plate, stem, cap, horn);

    if (i % 2 === 0) {
      for (let c = 0; c < 3; c += 1) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.28 - c * 0.05, 0.028, 8, 18), ropeMat);
        coil.rotation.x = Math.PI / 2;
        coil.position.set(0.42, 0.03 + c * 0.035, 0.18);
        bg.add(coil);
      }
    }
    sec.add(bg);
  }

  // 6 Classic Black-and-Brass Harbor Lamp Posts
  const lampGlass = pbrGlassMat({ color: 0xfff4dc, opacity: 0.34 });
  const lampCoords = [
    [44.2, -21.5],
    [44.2, -12.0],
    [44.2, -2.5],
    [44.2, 5.8],
    [44.2, 17.5],
    [23.2, 20.2],
  ];
  for (const [lx, lz] of lampCoords) {
    registerCircleCollider(lx, lz, 0.28);
    const lp = new THREE.Group();
    lp.position.set(lx, 1.36, lz);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.65, 10), castIronMat);
    base.position.y = 0.325;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.095, 2.85, 10), castIronMat);
    pole.position.y = 2.02;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.08, 0.12, 10), brassMat);
    collar.position.y = 3.46;
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.15, 0.44, 6), lampGlass);
    cage.position.y = 3.74;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), lanternGlowMat);
    bulb.position.y = 3.72;
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.2, 6), castIronMat);
    hat.position.y = 4.04;
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), brassMat);
    finial.position.y = 4.16;
    lp.add(base, pole, collar, cage, bulb, hat, finial);
    sec.add(lp);
  }

  // Waterfront Stone Landing Steps (X in [26, 32], Z in [19.2, 22.0]) & Low Stage (Y = +0.45m)
  const pileMat = pbrWoodMat(0x4b382a, { roughness: 0.86 });
  for (const cx of [25.85, 32.15]) {
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.4, 3.0), quayWallMat);
    cheek.position.set(cx, 0.22, 20.6);
    sec.add(cheek);
  }
  const numSteps = 6;
  for (let s = 0; s < numSteps; s += 1) {
    const sy = lerp(1.28, 0.45, s / (numSteps - 1));
    const sz = lerp(19.45, 21.85, s / (numSteps - 1));
    const step = new THREE.Mesh(new THREE.BoxGeometry(5.96, 0.9, 0.54), copingMat);
    step.position.set(29.0, sy - 0.45, sz);
    sec.add(step);
  }
  const stageDeck = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.22, 2.8), teakMat);
  stageDeck.position.set(29.0, 0.34, 23.4);
  sec.add(stageDeck);
  for (const px of [25.9, 29.0, 32.1]) {
    for (const pz of [22.3, 24.5]) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 5.2, 10), pileMat);
      pile.position.set(px, -1.9, pz);
      sec.add(pile);
    }
  }

  // Interactive Contoured Figure-8 Archtop Guitar Hardcase ("instruments") & Clear Rain-Umbrella ("umbrella")
  const gCase = new THREE.Group();
  gCase.position.set(27.25, 0.45, 23.35);
  gCase.rotation.y = 0.36;
  const caseLeather = pbrWoodMat(0x52311d, { roughness: 0.42 });
  const silverLatch = pbrMetalMat(0xd9e0e6, { roughness: 0.18, metalness: 0.92 });
  const brassTrimMat = pbrMetalMat(0xcfa658, { roughness: 0.26, metalness: 0.88 });

  // True figure-8 contoured guitar hardcase silhouette + beveled archtop lid
  const caseShape = new THREE.Shape();
  caseShape.moveTo(-0.48, 0);
  caseShape.bezierCurveTo(-0.48, 0.25, -0.18, 0.26, -0.08, 0.13);
  caseShape.bezierCurveTo(-0.02, 0.08, 0.08, 0.19, 0.18, 0.17);
  caseShape.bezierCurveTo(0.24, 0.15, 0.26, 0.06, 0.28, 0.055);
  caseShape.lineTo(0.68, 0.052);
  caseShape.lineTo(0.74, 0.065);
  caseShape.lineTo(0.76, 0.0);
  caseShape.lineTo(0.74, -0.065);
  caseShape.lineTo(0.68, -0.052);
  caseShape.lineTo(0.28, -0.055);
  caseShape.bezierCurveTo(0.26, -0.06, 0.24, -0.15, 0.18, -0.17);
  caseShape.bezierCurveTo(0.08, -0.19, -0.02, -0.08, -0.08, -0.13);
  caseShape.bezierCurveTo(-0.18, -0.26, -0.48, -0.25, -0.48, 0);

  const caseGeo = new THREE.ExtrudeGeometry(caseShape, {
    depth: 0.105,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.016,
    bevelSegments: 3,
    curveSegments: 20,
  });
  caseGeo.rotateX(-Math.PI * 0.5);
  const caseBody = new THREE.Mesh(caseGeo, caseLeather);
  caseBody.position.y = 0.022;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.013, 8, 14, Math.PI), caseLeather);
  handle.position.set(0.02, 0.085, 0.165);
  handle.rotation.x = Math.PI * 0.35;
  gCase.add(caseBody, handle);
  for (const [lx, lz] of [
    [-0.32, 0.228],
    [-0.04, 0.152],
    [0.16, 0.172],
    [0.52, 0.066],
  ]) {
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.042, 0.018), silverLatch);
    latch.position.set(lx, 0.082, lz);
    const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), brassTrimMat);
    rivet.position.set(lx, 0.105, lz);
    gCase.add(latch, rivet);
  }
  tagInteractive(gCase, "instruments", "栈桥边的琴盒");
  registerCircleCollider(27.25, 23.35, 0.44, 0.0, 2.0);
  sec.add(gCase);

  const umbrella = new THREE.Group();
  umbrella.position.set(28.35, 0.45, 23.55);
  umbrella.rotation.set(0.32, -0.45, 0.18);
  registerCircleCollider(28.35, 23.55, 0.48, 0.0, 2.0);
  const clearVinyl = pbrGlassMat({ color: 0xf0f8fc, opacity: 0.34 });
  const whiteTrim = pbrFabricMat(0xf7f5ef, { roughness: 0.68 });
  const mapleMat = pbrWoodMat(0xb87b44, { roughness: 0.32 });
  const uDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.52, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.47),
    clearVinyl
  );
  uDome.position.y = 0.18;
  const uTrim = new THREE.Mesh(new THREE.TorusGeometry(0.515, 0.011, 8, 24), whiteTrim);
  uTrim.rotation.x = Math.PI / 2;
  uTrim.position.y = 0.235;
  const uFerrule = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.085, 10), silverLatch);
  uFerrule.position.y = 0.74;
  const uShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.80, 10), silverLatch);
  uShaft.position.y = 0.34;
  const hookCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.04, 0),
    new THREE.Vector3(0.005, -0.10, 0),
    new THREE.Vector3(0.055, -0.125, 0),
    new THREE.Vector3(0.105, -0.095, 0),
    new THREE.Vector3(0.108, -0.045, 0),
  ]);
  const uHook = new THREE.Mesh(new THREE.TubeGeometry(hookCurve, 16, 0.012, 8, false), mapleMat);
  umbrella.add(uDome, uTrim, uFerrule, uShaft, uHook);
  for (let r = 0; r < 8; r += 1) {
    const a = (r / 8) * Math.PI * 2;
    const ribCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.695, 0),
      new THREE.Vector3(Math.cos(a) * 0.34, 0.56, Math.sin(a) * 0.34),
      new THREE.Vector3(Math.cos(a) * 0.515, 0.235, Math.sin(a) * 0.515),
    ]);
    umbrella.add(new THREE.Mesh(new THREE.TubeGeometry(ribCurve, 10, 0.003, 6, false), whiteTrim));
  }
  tagInteractive(umbrella, "umbrella", "栈桥边的透明雨伞");
  sec.add(umbrella);

  // 2 Walkable Timber Finger Piers at Z = -8 and Z = +2 (X in [46, 57], width 1.8m, Y = +1.15m)
  for (const pz of [-8.0, 2.0]) {
    const pier = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.18, 1.8), teakMat);
    deck.position.set(51.5, 1.06, pz);
    pier.add(deck);
    for (const sz of [-0.84, 0.84]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.1, 0.1), pileMat);
      rail.position.set(51.5, 1.19, pz + sz);
      pier.add(rail);
    }
    for (const px of [47.2, 50.2, 53.4, 56.5]) {
      for (const sz of [-0.75, 0.75]) {
        const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 6.2, 10), pileMat);
        pile.position.set(px, -1.55, pz + sz);
        pier.add(pile);
      }
      const cleat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.07), castIronMat);
      cleat.position.set(px, 1.26, pz + (pz < 0 ? 0.82 : -0.82));
      pier.add(cleat);
    }
    sec.add(pier);
  }

  buildBoathouseEspressoPergola(sec, { quayWallMat, castIronMat, brassMat, teakMat, lanternGlowMat });

  // Mediterranean Harborside Promenade Bistro Parasols, Limestone Floral Urns & Teak Benches
  const creamCanvas = pbrFabricMat(0xe5d6be, { roughness: 0.9, side: THREE.DoubleSide });
  const terracottaPotMat = pbrPlasterMat(0xc46d4e, { roughness: 0.8 });
  const oliveLeafMat = new THREE.MeshStandardMaterial({ color: 0x526b46, roughness: 0.78 });
  const oliveLeafMatB = new THREE.MeshStandardMaterial({ color: 0x3f5837, roughness: 0.82 });

  for (const [tx, tz] of [
    [16.2, 6.2],
    [22.4, 9.8],
    [16.5, -20.2],
  ]) {
    registerCircleCollider(tx, tz, 0.95);
    const bistro = new THREE.Group();
    bistro.position.set(tx, 1.36, tz);

    // Fluted Cast-Iron Bistro Pedestal + Brass-Rimmed Limestone Tabletop + Ribbed Valanced Resort Parasol
    const ped = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.28, 0),
          new THREE.Vector2(0.25, 0.04),
          new THREE.Vector2(0.075, 0.14),
          new THREE.Vector2(0.052, 0.64),
          new THREE.Vector2(0.14, 0.74),
        ],
        16
      ),
      castIronMat
    );
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.67, 0.042, 24), copingMat);
    top.position.y = 0.76;
    const brassEdge = new THREE.Mesh(new THREE.TorusGeometry(0.678, 0.008, 8, 28), brassMat);
    brassEdge.rotation.x = Math.PI * 0.5;
    brassEdge.position.y = 0.762;
    const parasol = buildResortMarketParasol({
      teakMat,
      canvasMat: creamCanvas,
      brassMat,
      radius: 1.54,
      height: 2.52,
    });
    bistro.add(ped, top, brassEdge, parasol);

    // 3 Sculpted French Wrought-Iron & Slatted Teak Café Chairs
    for (const ca of [0.4, 2.5, 4.5]) {
      const ch = new THREE.Group();
      ch.position.set(Math.cos(ca) * 0.96, 0, Math.sin(ca) * 0.96);
      ch.rotation.y = Math.atan2(-Math.cos(ca), -Math.sin(ca));
      const seat = new THREE.Mesh(createPillowedCushionGeo(0.42, 0.045, 0.42, 0.05, 0.008), teakMat);
      seat.position.y = 0.45;
      ch.add(seat);
      for (const [lx, lz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.009, 0.45, 8), castIronMat);
        leg.position.set(lx, 0.225, lz);
        ch.add(leg);
      }
      const backHoops = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.18, 0.45, -0.18),
        new THREE.Vector3(-0.19, 0.76, -0.22),
        new THREE.Vector3(0, 0.85, -0.23),
        new THREE.Vector3(0.19, 0.76, -0.22),
        new THREE.Vector3(0.18, 0.45, -0.18),
      ]);
      ch.add(new THREE.Mesh(new THREE.TubeGeometry(backHoops, 16, 0.011, 8, false), castIronMat));
      bistro.add(ch);
    }
    const centerpiece = createRoseBouquet({ count: 3, scale: 0.48 });
    centerpiece.position.set(0.12, 0.78, -0.08);
    bistro.add(centerpiece);
    sec.add(bistro);
  }

  for (const [px, pz] of [
    [12.2, -8.5],
    [12.2, 12.8],
    [29.5, -21.5],
    [36.5, 16.5],
    [39.8, -16.8],
  ]) {
    registerCircleCollider(px, pz, 0.62);
    const urn = new THREE.Group();
    urn.position.set(px, 1.36, pz);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.24, 0.82), copingMat);
    plinth.position.y = 0.12;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.28, 0.58, 14), terracottaPotMat);
    pot.position.y = 0.52;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 8, 18), terracottaPotMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.81;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 0.92, 8), teakMat);
    trunk.position.y = 1.18;
    const crownGroup = new THREE.Group();
    crownGroup.position.y = 1.66;
    for (const [cx, cy, cz, cr, mat] of [
      [0, 0.14, 0, 0.44, oliveLeafMat],
      [-0.24, -0.02, 0.16, 0.34, oliveLeafMatB],
      [0.24, 0.04, -0.14, 0.35, oliveLeafMat],
      [0.06, -0.06, -0.22, 0.30, oliveLeafMatB],
      [-0.08, 0.30, 0.04, 0.28, oliveLeafMatB],
    ]) {
      const lobe = new THREE.Mesh(new THREE.IcosahedronGeometry(cr, 1), mat);
      lobe.scale.set(1.06, 0.86, 1.02);
      lobe.position.set(cx, cy, cz);
      crownGroup.add(lobe);
    }
    const blooms = createRoseBouquet({ count: 7, scale: 0.72 });
    blooms.position.y = 0.84;
    urn.add(plinth, pot, rim, trunk, crownGroup, blooms);
    sec.add(urn);
  }
}

function buildBoathouseEspressoPergola(
  sec,
  { quayWallMat, castIronMat, brassMat, teakMat, lanternGlowMat }
) {
  // Open-Air Timber & Stone Harbor Boathouse / Espresso Pergola: X in [+16, +28], Z in [-16, -6]
  const cafe = new THREE.Group();
  cafe.position.set(22.0, 1.36, -11.0);

  const cedarMat = pbrWoodMat(0x8e5d3b, { repeatX: 3, repeatY: 3, roughness: 0.52 });
  const oakMat = pbrWoodMat(0xa9794e, { repeatX: 4, repeatY: 4, roughness: 0.44 });
  const chromeMat = pbrMetalMat(0xe3e8ec, { roughness: 0.16, metalness: 0.92 });
  const windGlass = pbrGlassMat({ color: 0xe3f2f6, opacity: 0.28 });

  // Subtle inlaid oak floor deck (2cm proud so completely walkable)
  const floorInlay = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.04, 9.8), oakMat);
  floorInlay.position.y = 0.02;
  cafe.add(floorInlay);

  // 6 Stone & Cedar Pillars
  for (const lx of [-5.6, 0.0, 5.6]) {
    for (const lz of [-4.6, 4.6]) {
      registerCircleCollider(22.0 + lx, -11.0 + lz, 0.34);
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.95, 0.56), quayWallMat);
      plinth.position.set(lx, 0.475, lz);
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.45, 0.28), cedarMat);
      col.position.set(lx, 2.15, lz);
      cafe.add(plinth, col);
    }
    // Pitched Cedar King-Post Roof Truss
    const tieBeam = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 10.2), cedarMat);
    tieBeam.position.set(lx, 3.45, 0);
    const kingPost = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.25, 0.2), cedarMat);
    kingPost.position.set(lx, 4.12, 0);
    for (const side of [-1, 1]) {
      const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 5.65), cedarMat);
      rafter.position.set(lx, 4.12, side * 2.55);
      rafter.rotation.x = side * 0.255;
      cafe.add(rafter);
    }
    cafe.add(tieBeam, kingPost);
  }

  // Open roof purlins + ridge beam
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.22, 0.22), cedarMat);
  ridge.position.set(0, 4.78, 0);
  cafe.add(ridge);
  for (let p = -4; p <= 4; p += 1) {
    if (p === 0) continue;
    const purlin = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.1, 0.12), cedarMat);
    purlin.position.set(0, 4.76 - Math.abs(p) * 0.31, p * 1.18);
    cafe.add(purlin);
  }

  // North Glass Windbreak Screen + Framed Nautical Bay Chart
  registerBoxCollider(16.4, 27.6, -15.75, -15.45);
  const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.1, 0.12), castIronMat);
  screenFrame.position.set(0, 2.55, -4.6);
  const glassPane = new THREE.Mesh(new THREE.BoxGeometry(10.6, 1.55, 0.04), windGlass);
  glassPane.position.set(0, 1.74, -4.6);
  cafe.add(screenFrame, glassPane);

  const chartTex = makeCanvasTex(256, 160, (ctx, w, h) => {
    ctx.fillStyle = "#efe6cf";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#b7d3dc";
    ctx.beginPath();
    ctx.moveTo(110, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(75, h);
    ctx.quadraticCurveTo(135, h * 0.5, 110, 0);
    ctx.fill();
    ctx.strokeStyle = "#4d5c63";
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.beginPath();
    ctx.arc(195, 52, 22, 0, Math.PI * 2);
    ctx.stroke();
  });
  const chartBoard = new THREE.Mesh(
    new THREE.BoxGeometry(1.45, 0.92, 0.06),
    new THREE.MeshStandardMaterial({ map: chartTex, roughness: 0.72 })
  );
  chartBoard.position.set(3.2, 1.95, -4.52);
  cafe.add(chartBoard);

  // Paneled Cedar Espresso Bar Counter, Victoria Arduino Lever Espresso Machine, Brass Footrail & Burr Grinder
  registerBoxCollider(16.9, 21.6, -14.8, -13.5);
  const barFront = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.04, 0.84), cedarMat);
  barFront.position.set(-2.75, 0.54, -3.15);
  const barTop = new THREE.Mesh(createPillowedCushionGeo(4.74, 0.075, 1.04, 0.035, 0), oakMat);
  barTop.position.set(-2.75, 1.10, -3.15);
  // Wainscot panels + brass footrail along bar front
  for (let p = 0; p < 5; p += 1) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.74, 0.025), oakMat);
    panel.position.set(-4.47 + p * 0.86, 0.56, -2.72);
    cafe.add(panel);
  }
  const footRail = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 4.35, 10), brassMat);
  footRail.rotation.z = Math.PI * 0.5;
  footRail.position.set(-2.75, 0.16, -2.58);
  const porcelainCupMat = new THREE.MeshStandardMaterial({ color: 0xf7f2ea, roughness: 0.2 });
  const leverEspresso = buildItalianLeverEspressoMachine({
    chromeMat,
    brassMat,
    walnutMat: cedarMat,
    porcelainMat: porcelainCupMat,
  });
  leverEspresso.position.set(-3.45, 1.138, -3.16);
  const grinder = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.115, 0.28, 14), castIronMat);
  grinder.position.set(-2.52, 1.28, -3.20);
  const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.055, 0.18, 14), windGlass);
  hopper.position.set(-2.52, 1.50, -3.20);
  const hopperLid = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.02, 14), brassMat);
  hopperLid.position.set(-2.52, 1.60, -3.20);
  cafe.add(barFront, barTop, footRail, leverEspresso, grinder, hopper, hopperLid);

  // 2 Coastal Lifebuoys on pillars
  const buoyWhite = pbrFabricMat(0xf5f2eb, { roughness: 0.76 });
  const buoyRed = pbrFabricMat(0xc84335, { roughness: 0.76 });
  for (const lx of [-5.6, 5.6]) {
    const buoy = new THREE.Group();
    buoy.position.set(lx, 1.85, 4.92);
    buoy.add(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.085, 10, 20), buoyWhite));
    for (let b = 0; b < 4; b += 1) {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.32, 0.089, 10, 8, Math.PI * 0.22),
        buoyRed
      );
      band.rotation.z = b * (Math.PI * 0.5) - 0.34;
      buoy.add(band);
    }
    cafe.add(buoy);
  }

  // 2 Rustic Oak Cafe Tables & Benches (ample open walkway around them)
  for (const [tx, tz] of [
    [-1.6, 1.5],
    [3.1, 0.6],
  ]) {
    registerCircleCollider(22.0 + tx, -11.0 + tz, 0.85);
    const tTop = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.06, 16), oakMat);
    tTop.position.set(tx, 0.76, tz);
    const tPed = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.22, 0.74, 10), castIronMat);
    tPed.position.set(tx, 0.38, tz);
    cafe.add(tTop, tPed);
    for (const sa of [0, Math.PI]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.055, 0.34), oakMat);
      bench.position.set(tx + Math.sin(sa) * 1.05, 0.46, tz + Math.cos(sa) * 1.05);
      bench.rotation.y = sa;
      cafe.add(bench);
    }
  }

  // 4 Warm Edison & Brass Pendant Lights
  for (const [px, pz] of [
    [-2.8, -2.6],
    [2.8, -2.2],
    [-2.4, 2.0],
    [2.8, 2.0],
  ]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.05, 6), castIronMat);
    cord.position.set(px, 3.05, pz);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 14, 1, true), brassMat);
    shade.position.set(px, 2.52, pz);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), lanternGlowMat);
    bulb.position.set(px, 2.44, pz);
    cafe.add(cord, shade, bulb);
  }

  // Draped Mediterranean striped linen awning bays beneath the pergola rafters + bistro lights
  const stripeCanvas = document.createElement("canvas");
  stripeCanvas.width = 512;
  stripeCanvas.height = 128;
  const sCtx = stripeCanvas.getContext("2d");
  sCtx.fillStyle = "#f7efe0";
  sCtx.fillRect(0, 0, 512, 128);
  for (let sx = 0; sx < 512; sx += 64) {
    sCtx.fillStyle = "#c96f5d";
    sCtx.fillRect(sx, 0, 30, 128);
    sCtx.fillStyle = "#dfa391";
    sCtx.fillRect(sx + 30, 0, 3, 128);
  }
  sCtx.fillStyle = "rgba(85, 65, 48, 0.05)";
  for (let sy = 0; sy < 128; sy += 4) sCtx.fillRect(0, sy, 512, 1);
  const awningTex = new THREE.CanvasTexture(stripeCanvas);
  awningTex.wrapS = THREE.RepeatWrapping;
  awningTex.wrapT = THREE.RepeatWrapping;
  awningTex.repeat.set(3, 1);
  awningTex.colorSpace = THREE.SRGBColorSpace;
  const awningMat = new THREE.MeshStandardMaterial({
    map: awningTex,
    roughness: 0.9,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  for (const slopeDir of [-1, 1]) {
    const swGeo = new THREE.PlaneGeometry(11.4, 4.78, 48, 6);
    swGeo.rotateX(-Math.PI * 0.5);
    const pos = swGeo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const px = pos.getX(i);
      const bayPhase = ((px + 5.7) / 11.4) * 6.0 * Math.PI;
      pos.setY(i, pos.getY(i) - Math.abs(Math.sin(bayPhase)) * 0.11);
    }
    swGeo.computeVertexNormals();
    const swMesh = new THREE.Mesh(swGeo, awningMat);
    swMesh.rotation.x = slopeDir * 0.258;
    swMesh.position.set(0, 4.02, slopeDir * 2.38);
    cafe.add(swMesh);

    const valGeo = new THREE.PlaneGeometry(11.4, 0.28, 36, 1);
    const valPos = valGeo.attributes.position;
    for (let i = 0; i < valPos.count; i += 1) {
      if (valPos.getY(i) < 0) {
        const vx = valPos.getX(i);
        valPos.setY(i, valPos.getY(i) - Math.abs(Math.sin(((vx + 5.7) / 11.4) * 12 * Math.PI)) * 0.05);
      }
    }
    valGeo.computeVertexNormals();
    const valance = new THREE.Mesh(valGeo, awningMat);
    valance.position.set(0, 3.28, slopeDir * 4.74);
    cafe.add(valance);
  }

  for (let i = 0; i < 14; i += 1) {
    const u = i / 13;
    const bx = lerp(-5.5, 5.5, u);
    const droop = Math.sin(u * Math.PI * 5) * 0.08;
    for (const bz of [-4.72, 4.72]) {
      const eaveBulb = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6), lanternGlowMat);
      eaveBulb.position.set(bx, 3.16 - Math.abs(droop), bz);
      cafe.add(eaveBulb);
    }
  }

  sec.add(cafe);
}

// ---------------------------------------------------------------------------
// 4. Three Realistic PBR Coastal Boats (Yacht, Coastal Sloop & Clinker Launch)
// ---------------------------------------------------------------------------

function createFlaredHullGeo({ length, beam, depth, sheerBow, sheerStern, transomFactor = 0.68 }) {
  const stations = 22;
  const rings = 9; // port rail -> keel -> starboard rail
  const positions = [];
  const uvs = [];
  const indices = [];

  const halfBeamAt = (u) => {
    if (u > 0.5) {
      const t = (1.0 - u) / 0.5;
      return (beam * 0.5) * Math.pow(clamp(t, 0, 1), 0.72);
    }
    const t = (0.5 - u) / 0.5;
    return (beam * 0.5) * lerp(1.0, transomFactor, t * t);
  };

  for (let i = 0; i <= stations; i += 1) {
    const u = i / stations; // 0 = stern (-X), 1 = bow (+X)
    const x = (u - 0.5) * length;
    const hb = halfBeamAt(u);
    const sheerY = lerp(sheerStern, sheerBow, u * u * 0.65 + u * 0.35);
    const keelY = -depth * (1.0 - 0.58 * Math.pow(Math.max(0, u - 0.72) / 0.28, 1.6));

    for (let j = 0; j <= rings; j += 1) {
      const v = j / rings;
      const theta = (v - 0.5) * Math.PI; // -PI/2 port rail, 0 keel, +PI/2 stbd rail
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      const flare = 1.0 + 0.16 * u * Math.abs(sinT);
      const z = Math.sign(sinT) * Math.pow(Math.abs(sinT), 0.82) * hb * flare;
      const y = lerp(keelY, sheerY, 1.0 - Math.pow(cosT, 1.25));
      positions.push(x, y, z);
      uvs.push(u * 4, v * 2);
    }
  }

  const stride = rings + 1;
  for (let i = 0; i < stations; i += 1) {
    for (let j = 0; j < rings; j += 1) {
      const a = i * stride + j;
      const b = a + 1;
      const c = (i + 1) * stride + j;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  // Stern transom cap (i = 0)
  for (let j = 0; j < rings - 1; j += 1) {
    indices.push(0, j + 2, j + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createShapedDeckGeo({ length, beam, sheerBow, sheerStern, transomFactor = 0.68 }) {
  const stations = 20;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= stations; i += 1) {
    const u = i / stations;
    const x = (u - 0.5) * length * 0.985;
    const hb =
      u > 0.5
        ? (beam * 0.49) * Math.pow(clamp((1.0 - u) / 0.5, 0, 1), 0.72) * (1.0 + 0.14 * u)
        : (beam * 0.49) * lerp(1.0, transomFactor, Math.pow((0.5 - u) / 0.5, 2));
    const y = lerp(sheerStern, sheerBow, u * u * 0.65 + u * 0.35) - 0.03;
    positions.push(x, y, -hb, x, y + 0.03, 0, x, y, hb);
    uvs.push(u * 6, 0, u * 6, 0.5, u * 6, 1);
  }
  for (let i = 0; i < stations; i += 1) {
    const s = i * 3;
    indices.push(s, s + 3, s + 1, s + 1, s + 3, s + 4);
    indices.push(s + 1, s + 4, s + 2, s + 2, s + 4, s + 5);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildHarborFleet(parent) {
  const fleetGroup = new THREE.Group();
  fleetGroup.name = "HarborFleet";
  const boats = [];

  const hullWhite = new THREE.MeshPhysicalMaterial({
    color: 0xf7f5ef,
    roughness: 0.16,
    metalness: 0.04,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
    side: THREE.DoubleSide,
  });
  const hullNavy = new THREE.MeshStandardMaterial({
    color: 0x1a3454,
    roughness: 0.28,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  const clinkerHullMat = new THREE.MeshPhysicalMaterial({
    color: 0xebe6d8,
    roughness: 0.24,
    clearcoat: 0.72,
    side: THREE.DoubleSide,
  });
  const teakDeckMat = createTeakDeckMat(0xc38f5a, 5, 3);
  const mahoganyMat = pbrWoodMat(0x6e3419, { roughness: 0.22 });
  const stainlessMat = pbrMetalMat(0xe6ebef, { roughness: 0.14, metalness: 0.94 });
  const alumMastMat = pbrMetalMat(0xd4dade, { roughness: 0.28, metalness: 0.85 });
  const brassMat = pbrMetalMat(0xcba358, { roughness: 0.24, metalness: 0.88 });
  const creamLeather = pbrFabricMat(0xf2ece0, { roughness: 0.55 });
  const sailCanvas = pbrFabricMat(0xf0eadb, { roughness: 0.86, side: THREE.DoubleSide });
  const navyCanvas = pbrFabricMat(0x223b59, { roughness: 0.86, side: THREE.DoubleSide });
  const cabinGlass = pbrGlassMat({ color: 0xd8eef5, opacity: 0.26 });
  const wireMat = pbrMetalMat(0xbcc4ca, { roughness: 0.25, metalness: 0.9 });

  const addRigWire = (grp, p1, p2, r = 0.008, mat = wireMat) => {
    const v1 = new THREE.Vector3(...p1);
    const v2 = new THREE.Vector3(...p2);
    const d = v2.clone().sub(v1);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), mat);
    m.position.copy(v1).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    grp.add(m);
  };

  // 1. 11.5m Classic White-and-Teak Cabin Cruiser Yacht at (+52.9, 0.0, -3.6)
  const yacht = new THREE.Group();
  yacht.position.set(52.9, 0.0, -3.6);
  yacht.rotation.y = -0.03;

  const yHullCfg = { length: 11.5, beam: 3.45, depth: 0.95, sheerBow: 1.38, sheerStern: 0.96, transomFactor: 0.78 };
  const yHull = new THREE.Mesh(createFlaredHullGeo(yHullCfg), hullWhite);
  const yStripe = new THREE.Mesh(
    createFlaredHullGeo({ ...yHullCfg, length: 11.54, beam: 3.48, sheerBow: 0.22, sheerStern: 0.16, depth: 0.24 }),
    hullNavy
  );
  const yDeck = new THREE.Mesh(createShapedDeckGeo(yHullCfg), teakDeckMat);
  const ySwim = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.09, 2.55), teakDeckMat);
  ySwim.position.set(-6.05, 0.22, 0);
  yacht.add(yHull, yStripe, yDeck, ySwim);

  // Clear-glass wheelhouse cabin + mahogany helm console, stainless wheel, chartplotter & captain seats
  const coaming = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.44, 2.35), hullWhite);
  coaming.position.set(-0.1, 1.24, 0);
  const glassHouse = new THREE.Mesh(new THREE.BoxGeometry(3.85, 0.92, 2.18), cabinGlass);
  glassHouse.position.set(-0.25, 1.88, 0);
  const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.11, 2.32), hullWhite);
  cabinRoof.position.set(-0.32, 2.38, 0);
  yacht.add(coaming, glassHouse, cabinRoof);

  for (const fx of [-2.16, -0.35, 1.66]) {
    for (const fz of [-1.09, 1.09]) {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.94, 0.06), stainlessMat);
      mullion.position.set(fx, 1.88, fz);
      yacht.add(mullion);
    }
  }

  const helmConsole = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.78, 1.75), mahoganyMat);
  helmConsole.position.set(1.18, 1.48, 0);
  const plotter = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.24, 0.38),
    new THREE.MeshStandardMaterial({ color: 0x112b36, emissive: 0x2ec4d6, emissiveIntensity: 1.4, roughness: 0.2 })
  );
  plotter.position.set(0.84, 1.92, 0.34);
  plotter.rotation.z = 0.28;
  const shipWheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 8, 18), stainlessMat);
  shipWheel.rotation.y = Math.PI / 2;
  shipWheel.position.set(0.76, 1.78, 0.34);
  yacht.add(helmConsole, plotter, shipWheel);

  for (const sz of [-0.46, 0.46]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.56, 0.52), creamLeather);
    seat.position.set(0.22, 1.52, sz);
    yacht.add(seat);
  }
  const aftLounge = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.42, 2.25), creamLeather);
  aftLounge.position.set(-4.85, 1.18, 0);
  const aftTable = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.05, 1.15), mahoganyMat);
  aftTable.position.set(-3.85, 1.38, 0);
  yacht.add(aftLounge, aftTable);

  // Flybridge radar arch & stainless bow pulpit rail
  for (const sz of [-1.06, 1.06]) {
    const archLeg = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.95, 0.1), hullWhite);
    archLeg.position.set(-1.65, 2.8, sz);
    archLeg.rotation.z = 0.22;
    yacht.add(archLeg);
  }
  const archTop = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.1, 2.26), hullWhite);
  archTop.position.set(-1.76, 3.26, 0);
  const radome = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.18, 16), hullWhite);
  radome.position.set(-1.76, 3.42, 0);
  yacht.add(archTop, radome);
  addRigWire(yacht, [-1.76, 3.32, 0.85], [-2.1, 4.75, 0.85], 0.01, stainlessMat);

  // Bow pulpit stanchions & rails
  const railPtsPort = [[1.8, 1.62, -1.48], [3.6, 1.72, -1.12], [5.55, 1.84, -0.18]];
  const railPtsStbd = [[1.8, 1.62, 1.48], [3.6, 1.72, 1.12], [5.55, 1.84, 0.18]];
  for (const sidePts of [railPtsPort, railPtsStbd]) {
    for (let i = 0; i < sidePts.length; i += 1) {
      const [rx, ry, rz] = sidePts[i];
      addRigWire(yacht, [rx, ry - 0.52, rz], [rx, ry, rz], 0.014, stainlessMat);
      if (i > 0) addRigWire(yacht, sidePts[i - 1], sidePts[i], 0.014, stainlessMat);
    }
  }
  addRigWire(yacht, railPtsPort[2], railPtsStbd[2], 0.014, stainlessMat);

  tagInteractive(yacht, "boat", "港湾游艇与帆船");
  fleetGroup.add(yacht);
  boats.push({ mesh: yacht, baseY: 0.0, phase: 0.4, rollAmp: 0.022, pitchAmp: 0.012 });

  // 2. 9.8m Coastal Sloop Sailboat at (+51.2, 0.0, +5.4)
  const sloop = new THREE.Group();
  sloop.position.set(52.2, 0.0, 4.2);
  sloop.rotation.y = 0.025;

  const sHullCfg = { length: 9.8, beam: 2.78, depth: 0.92, sheerBow: 1.12, sheerStern: 0.84, transomFactor: 0.58 };
  sloop.add(
    new THREE.Mesh(createFlaredHullGeo(sHullCfg), hullWhite),
    new THREE.Mesh(
      createFlaredHullGeo({ ...sHullCfg, length: 9.84, beam: 2.81, sheerBow: 0.16, sheerStern: 0.12, depth: 0.2 }),
      hullNavy
    ),
    new THREE.Mesh(createShapedDeckGeo(sHullCfg), teakDeckMat)
  );

  // Low coachroof + teak cockpit benches + Destroyer steering wheel on pedestal
  const coachroof = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.34, 1.55), hullWhite);
  coachroof.position.set(0.45, 1.08, 0);
  sloop.add(coachroof);
  for (const sz of [-0.66, 0.66]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 0.42), teakDeckMat);
    bench.position.set(-2.55, 0.92, sz);
    const winch = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.16, 12), stainlessMat);
    winch.position.set(-1.95, 1.08, sz * 1.22);
    sloop.add(bench, winch);
  }
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.78, 12), stainlessMat);
  pedestal.position.set(-3.35, 1.24, 0);
  const destroyerWheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.016, 8, 24), stainlessMat);
  destroyerWheel.rotation.y = Math.PI / 2;
  destroyerWheel.position.set(-3.45, 1.52, 0);
  for (let s = 0; s < 6; s += 1) {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.82, 4), stainlessMat);
    sp.position.set(-3.45, 1.52, 0);
    sp.rotation.x = (s / 6) * Math.PI;
    sloop.add(sp);
  }
  sloop.add(pedestal, destroyerWheel);

  // 12.5m Anodized Aluminum Mast, Spreaders, Standing Rigging & Boom with Flaked Cream Mainsail Cover
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.095, 12.5, 12), alumMastMat);
  mast.position.set(0.95, 7.2, 0);
  const spreader = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 8), alumMastMat);
  spreader.rotation.x = Math.PI / 2;
  spreader.position.set(0.95, 7.6, 0);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 4.35, 10), alumMastMat);
  boom.rotation.z = Math.PI / 2;
  boom.position.set(-1.25, 2.25, 0);
  const sailPack = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 4.15, 10), sailCanvas);
  sailPack.rotation.z = Math.PI / 2;
  sailPack.scale.set(1.0, 1.0, 0.75);
  sailPack.position.set(-1.2, 2.42, 0);
  sloop.add(mast, spreader, boom, sailPack);

  addRigWire(sloop, [0.95, 13.35, 0], [4.75, 1.15, 0], 0.014, sailCanvas); // Roller-furled forestay
  addRigWire(sloop, [0.95, 13.4, 0], [-4.72, 0.92, 0], 0.008); // Backstay
  for (const sz of [-1.26, 1.26]) {
    addRigWire(sloop, [0.95, 1.02, sz], [0.95, 7.6, Math.sign(sz) * 1.08], 0.008);
    addRigWire(sloop, [0.95, 7.6, Math.sign(sz) * 1.08], [0.95, 13.2, 0], 0.008);
    addRigWire(sloop, [0.95, 1.02, sz * 0.94], [0.95, 7.55, 0], 0.007);
  }

  tagInteractive(sloop, "boat", "港湾游艇与帆船");
  fleetGroup.add(sloop);
  boats.push({ mesh: sloop, baseY: 0.0, phase: 2.1, rollAmp: 0.032, pitchAmp: 0.015 });

  // 3. 7.6m Traditional Clinker/Timber-Trimmed Harbor Launch at (+36.5, 0.0, +25.2)
  const launch = new THREE.Group();
  launch.position.set(36.5, 0.0, 25.2);
  launch.rotation.y = -0.14;

  const lHullCfg = { length: 7.6, beam: 2.28, depth: 0.68, sheerBow: 0.86, sheerStern: 0.66, transomFactor: 0.64 };
  launch.add(
    new THREE.Mesh(createFlaredHullGeo(lHullCfg), clinkerHullMat),
    new THREE.Mesh(
      createFlaredHullGeo({ ...lHullCfg, length: 7.64, beam: 2.32, sheerBow: 0.87, sheerStern: 0.67, depth: -0.52 }),
      mahoganyMat
    ),
    new THREE.Mesh(createShapedDeckGeo({ ...lHullCfg, sheerBow: 0.42, sheerStern: 0.38 }), teakDeckMat)
  );
  const foreDeck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 1.02, 2.1, 12), mahoganyMat);
  foreDeck.rotation.z = -Math.PI / 2;
  foreDeck.scale.set(1.0, 1.0, 0.12);
  foreDeck.position.set(2.65, 0.78, 0);
  launch.add(foreDeck);

  for (const tx of [-2.2, -0.65, 0.85]) {
    const thwart = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 1.88), mahoganyMat);
    thwart.position.set(tx, 0.56, 0);
    launch.add(thwart);
  }
  const brassHelm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.68, 10), brassMat);
  brassHelm.position.set(0.35, 0.76, 0);
  const brassCleat = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.06), brassMat);
  brassCleat.position.set(3.25, 0.88, 0);
  launch.add(brassHelm, brassCleat);

  // Canvas Bimini Canopy on stainless bows
  const bimini = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.05, 1.96), sailCanvas);
  bimini.position.set(-0.95, 1.86, 0);
  const biminiTrim = new THREE.Mesh(new THREE.BoxGeometry(2.89, 0.09, 2.0), navyCanvas);
  biminiTrim.position.set(-0.95, 1.83, 0);
  launch.add(bimini, biminiTrim);
  for (const bx of [-2.15, 0.25]) {
    for (const bz of [-0.92, 0.92]) {
      addRigWire(launch, [bx, 0.68, bz], [bx, 1.84, bz], 0.012, stainlessMat);
    }
  }

  tagInteractive(launch, "boat", "港湾游艇与帆船");
  fleetGroup.add(launch);
  boats.push({ mesh: launch, baseY: 0.0, phase: 3.9, rollAmp: 0.036, pitchAmp: 0.018 });

  parent.add(fleetGroup);
  return boats;
}

// ---------------------------------------------------------------------------
// 5. Walkable Granite Breakwater Mole, 13.5m Lighthouse & Cliffside Gazebo
// ---------------------------------------------------------------------------

function buildBreakwaterAndLighthouse(parent) {
  const sec = new THREE.Group();
  sec.name = "BreakwaterAndLighthouse";

  const moleDeckMat = createGraniteSlabMat(0xc4bdb0, 16, 3);
  const bastionWallMat = pbrStoneMat(0xafa89b, { repeatX: 12, repeatY: 3, roughness: 0.84 });
  const boulderMat = pbrStoneMat(0x8e897f, { repeatX: 2, repeatY: 2, roughness: 0.9 });
  const whiteMasonry = pbrPlasterMat(0xf2ede2, { repeatX: 4, repeatY: 4, roughness: 0.82 });
  const crimsonMasonry = pbrPlasterMat(0xa9382e, { repeatX: 4, repeatY: 2, roughness: 0.8 });
  const ironMat = pbrMetalMat(0x222629, { roughness: 0.4, metalness: 0.82 });
  const brassMat = pbrMetalMat(0xd4ad5e, { roughness: 0.2, metalness: 0.9 });
  const lanternGlass = pbrGlassMat({ color: 0xeef8fa, opacity: 0.28 });

  // Walkable Breakwater Mole (X in [46, 78], Z in [7.6, 12.4]) & Circular Bastion ((78, 10), r = 4.8m)
  registerWalkZone((x, z) => {
    if (x >= 45.8 && x <= 78.0 && z >= 7.6 && z <= 12.4) return 1.38;
    if (Math.hypot(x - 78.0, z - 10.0) <= 4.8) return 1.38;
    return null;
  });

  const moleCore = new THREE.Mesh(new THREE.BoxGeometry(32.4, 5.88, 4.8), bastionWallMat);
  moleCore.position.set(62.0, -1.56, 10.0);
  const moleTop = new THREE.Mesh(new THREE.BoxGeometry(32.4, 0.16, 4.88), moleDeckMat);
  moleTop.position.set(62.0, 1.3, 10.0);
  for (const kz of [7.72, 12.28]) {
    const kerb = new THREE.Mesh(new THREE.BoxGeometry(31.2, 0.22, 0.24), moleDeckMat);
    kerb.position.set(61.6, 1.47, kz);
    sec.add(kerb);
  }

  const bastionCore = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 5.2, 5.88, 28), bastionWallMat);
  bastionCore.position.set(78.0, -1.56, 10.0);
  const bastionTop = new THREE.Mesh(new THREE.CylinderGeometry(4.86, 4.86, 0.18, 28), moleDeckMat);
  bastionTop.position.set(78.0, 1.3, 10.0);
  sec.add(moleCore, moleTop, bastionCore, bastionTop);

  // Armored seaward coastal granite boulders along mole & circular bastion base
  // Cut-ashlar sloped limestone plinth skirting along breakwater & bastion base (clean toe, photo rocks armor perimeter)
  const toeGeos = [];
  for (let i = 0; i < 20; i += 1) {
    const bx = 46.8 + i * 1.48;
    for (const side of [-1, 1]) {
      const blk = new THREE.BoxGeometry(1.42, 1.35, 0.85);
      blk.translate(bx, -0.15, 10.0 + side * 2.55);
      toeGeos.push(blk);
    }
  }
  const bastionSkirt = new THREE.CylinderGeometry(5.15, 5.75, 1.55, 24);
  bastionSkirt.translate(78.0, -0.22, 10.0);
  toeGeos.push(bastionSkirt);
  sec.add(new THREE.Mesh(safeMerge(toeGeos), boulderMat));

  // 13.5m Realistic Stone / Crimson-White Coastal Lighthouse at (+78, +1.38, +10)
  registerCircleCollider(78.0, 10.0, 2.5);
  const lh = new THREE.Group();
  lh.position.set(78.0, 1.38, 10.0);

  const octBase = new THREE.Mesh(new THREE.CylinderGeometry(2.18, 2.48, 3.1, 8), bastionWallMat);
  octBase.position.y = 1.55;
  const baseCornice = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.22, 0.24, 8), moleDeckMat);
  baseCornice.position.y = 3.18;
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.05, 1.12), moleDeckMat);
  doorFrame.position.set(-2.22, 1.05, 0);
  const oakDoor = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 1.88, 0.86),
    pbrWoodMat(0x5c3a21, { roughness: 0.55 })
  );
  oakDoor.position.set(-2.24, 0.96, 0);

  // Tapered weathered white-and-crimson masonry tower bands
  const band1 = new THREE.Mesh(new THREE.CylinderGeometry(1.94, 2.12, 2.5, 24), whiteMasonry);
  band1.position.y = 4.55;
  const band2 = new THREE.Mesh(new THREE.CylinderGeometry(1.74, 1.94, 2.4, 24), crimsonMasonry);
  band2.position.y = 7.0;
  const band3 = new THREE.Mesh(new THREE.CylinderGeometry(1.56, 1.74, 2.2, 24), whiteMasonry);
  band3.position.y = 9.3;

  // Corbeled stone gallery balcony & wrought-iron railing
  const corbel = new THREE.Mesh(new THREE.CylinderGeometry(2.08, 1.56, 0.36, 24), moleDeckMat);
  corbel.position.y = 10.55;
  const galleryDeck = new THREE.Mesh(new THREE.CylinderGeometry(2.16, 2.12, 0.16, 24), moleDeckMat);
  galleryDeck.position.y = 10.8;
  const railTop = new THREE.Mesh(new THREE.TorusGeometry(2.06, 0.032, 8, 28), ironMat);
  railTop.rotation.x = Math.PI / 2;
  railTop.position.y = 11.72;
  lh.add(octBase, baseCornice, doorFrame, oakDoor, band1, band2, band3, corbel, galleryDeck, railTop);

  for (let p = 0; p < 16; p += 1) {
    const a = (p / 16) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.88, 6), ironMat);
    post.position.set(Math.cos(a) * 2.06, 11.28, Math.sin(a) * 2.06);
    lh.add(post);
  }
  for (const wy of [4.6, 7.1, 9.2]) {
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.34), ironMat);
    slit.position.set(-1.82 + (wy - 4.6) * 0.07, wy, 0);
    lh.add(slit);
  }

  // Clear-glass lantern room, cupola dome & rotating brass Fresnel lens + warm searchlight beam
  const lanternRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.28, 1.28, 1.65, 16, 1, true), lanternGlass);
  lanternRoom.position.y = 11.7;
  for (let m = 0; m < 8; m += 1) {
    const a = (m / 8) * Math.PI * 2;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 1.68, 6), ironMat);
    bar.position.set(Math.cos(a) * 1.28, 11.7, Math.sin(a) * 1.28);
    lh.add(bar);
  }
  const cupola = new THREE.Mesh(
    new THREE.SphereGeometry(1.34, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
    crimsonMasonry
  );
  cupola.position.y = 12.48;
  const finialRod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.75, 8), brassMat);
  finialRod.position.y = 13.38;
  lh.add(lanternRoom, cupola, finialRod);

  const rotor = new THREE.Group();
  rotor.position.y = 11.68;
  const beaconCoreMat = new THREE.MeshStandardMaterial({
    color: 0xfff8e2,
    emissive: 0xffc66d,
    emissiveIntensity: 2.6,
    roughness: 0.1,
  });
  const lensDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.68, 12), brassMat);
  const coreLamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), beaconCoreMat);
  const beamMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.045,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  // Restrained, continuously rotating nocturnal searchlight cone (fades out gently over 26m)
  const nightBeamMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  for (const dir of [-1, 1]) {
    const bullseye = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 14), beaconCoreMat);
    bullseye.rotation.z = Math.PI / 2;
    bullseye.position.x = dir * 0.46;
    // Short vertex-feathered daytime Fresnel lens shimmer (fades to 0.0 at base so zero cone border ever shows)
    const coneGeo = new THREE.ConeGeometry(0.95, 4.8, 18, 1, true);
    const cPos = coneGeo.attributes.position;
    const cCols = new Float32Array(cPos.count * 3);
    for (let ci = 0; ci < cPos.count; ci += 1) {
      const tipWeight = clamp((cPos.getY(ci) + 2.4) / 4.8, 0, 1);
      const fade = tipWeight * tipWeight;
      cCols[ci * 3 + 0] = 1.0 * fade;
      cCols[ci * 3 + 1] = 0.88 * fade;
      cCols[ci * 3 + 2] = 0.62 * fade;
    }
    coneGeo.setAttribute("color", new THREE.BufferAttribute(cCols, 3));
    coneGeo.translate(0, -2.4, 0);
    coneGeo.rotateZ(dir * (Math.PI / 2));
    const beam = new THREE.Mesh(coneGeo, beamMat);
    beam.position.x = dir * 0.55;
    beam.userData.noShadow = true;

    // Long 26m night beam cone with smooth cubic axial falloff (zero sharp edge)
    const nConeGeo = new THREE.ConeGeometry(3.6, 26.0, 24, 6, true);
    const nPos = nConeGeo.attributes.position;
    const nCols = new Float32Array(nPos.count * 3);
    for (let ci = 0; ci < nPos.count; ci += 1) {
      const tipWeight = clamp((nPos.getY(ci) + 13.0) / 26.0, 0, 1);
      const fade = tipWeight * tipWeight * (0.35 + 0.65 * tipWeight);
      nCols[ci * 3 + 0] = 1.0 * fade;
      nCols[ci * 3 + 1] = 0.89 * fade;
      nCols[ci * 3 + 2] = 0.66 * fade;
    }
    nConeGeo.setAttribute("color", new THREE.BufferAttribute(nCols, 3));
    nConeGeo.translate(0, -13.0, 0);
    nConeGeo.rotateZ(dir * (Math.PI / 2));
    const nightBeam = new THREE.Mesh(nConeGeo, nightBeamMat);
    nightBeam.position.x = dir * 0.58;
    nightBeam.rotation.z = -dir * 0.045; // Slight sea-skimming downward tilt
    nightBeam.userData.noShadow = true;

    rotor.add(bullseye, beam, nightBeam);
  }
  rotor.add(lensDrum, coreLamp);
  lh.add(rotor);

  tagInteractive(lh, "lighthouse", "海岸防波堤灯塔");
  sec.add(lh);
  parent.add(sec);

  return { rotor, beaconCoreMat, beamMat, nightBeamMat };
}

function buildCliffsideGazebo(parent) {
  // West Cliffside Classical White-Marble & Wrought-Iron Rose Belvedere Gazebo at (-64.0, +7.80, +42.0)
  const gx = -64.0;
  const gy = 7.8;
  const gz = 42.0;

  registerWalkZone((x, z) => {
    if (Math.hypot(x + 64.0, z - 42.0) < 5.8) return 8.08;
    return null;
  });

  const sec = new THREE.Group();
  sec.name = "CliffsideMarbleGazebo";
  sec.position.set(gx, gy, gz);

  const carraraMat = pbrStoneMat(0xf3efe6, { repeatX: 4, repeatY: 3, roughness: 0.56 });
  const travertineMat = createGraniteSlabMat(0xe8e0d0, 6, 6);
  const wroughtIron = pbrMetalMat(0x282d30, { roughness: 0.36, metalness: 0.84 });
  const brassMat = pbrMetalMat(0xcba358, { roughness: 0.24, metalness: 0.88 });
  const cedarMat = pbrWoodMat(0x9b6640, { roughness: 0.46 });
  const linenMat = pbrFabricMat(0xf5efe3, { roughness: 0.82 });
  const blushPillow = pbrFabricMat(0xeec4cc, { roughness: 0.8 });
  const vineLeafMat = new THREE.MeshStandardMaterial({ color: 0x3f6637, roughness: 0.82 });

  // Stepped circular Carrara / travertine terrace (foundation skirt down into cliffside + 2 steps up to +0.28m -> Y = 8.08m)
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(5.68, 6.05, 1.85, 36), carraraMat);
  skirt.position.y = -0.78;
  const step1 = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.66, 0.14, 36), carraraMat);
  step1.position.y = 0.07;
  const step2 = new THREE.Mesh(new THREE.CylinderGeometry(5.26, 5.32, 0.14, 36), travertineMat);
  step2.position.y = 0.21;
  const inlayRing = new THREE.Mesh(new THREE.RingGeometry(1.65, 1.92, 28), carraraMat);
  inlayRing.rotation.x = -Math.PI / 2;
  inlayRing.position.y = 0.285;
  sec.add(skirt, step1, step2, inlayRing);

  // Classical stone balustrade overlooking the ocean (open at trail approach angle -1.00 rad)
  const entryAng = Math.atan2(-11.0, 7.0);
  const balR = 5.02;
  const balSegs = 28;
  for (let i = 0; i < balSegs; i += 1) {
    const a = (i / balSegs) * Math.PI * 2 - Math.PI;
    const diff = Math.atan2(Math.sin(a - entryAng), Math.cos(a - entryAng));
    if (Math.abs(diff) < 0.48) continue;

    const bx = Math.cos(a) * balR;
    const bz = Math.sin(a) * balR;
    const baluster = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.09, 0.76, 10), carraraMat);
    baluster.position.set(bx, 0.66, bz);
    const capSeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 1.18), carraraMat);
    capSeg.position.set(bx, 1.07, bz);
    capSeg.rotation.y = -a;
    sec.add(baluster, capSeg);
    registerCircleCollider(gx + bx, gz + bz, 0.34);
  }

  // Interactive Gazebo Crown, 8 Fluted Marble Columns, Lantern & Two-Person Floral Swing
  const gazInteractive = new THREE.Group();
  const colR = 3.92;
  for (let c = 0; c < 8; c += 1) {
    const a = (c / 8) * Math.PI * 2 + Math.PI / 8;
    const cx = Math.cos(a) * colR;
    const cz = Math.sin(a) * colR;
    registerCircleCollider(gx + cx, gz + cz, 0.3);

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.24, 0.52), carraraMat);
    base.position.set(cx, 0.4, cz);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 3.05, 14), carraraMat);
    shaft.position.set(cx, 2.04, cz);
    const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.18, 0.24, 14), carraraMat);
    capital.position.set(cx, 3.68, cz);
    gazInteractive.add(base, shaft, capital);

    // Wrought-iron domed crown rib rising from each column to central cupola ring
    const ribCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(cx, 3.98, cz),
      new THREE.Vector3(cx * 0.72, 5.55, cz * 0.72),
      new THREE.Vector3(cx * 0.14, 5.98, cz * 0.14)
    );
    const rib = new THREE.Mesh(new THREE.TubeGeometry(ribCurve, 14, 0.032, 8, false), wroughtIron);
    gazInteractive.add(rib);
  }

  const entablature = new THREE.Mesh(new THREE.TorusGeometry(colR, 0.19, 10, 36), carraraMat);
  entablature.rotation.x = Math.PI / 2;
  entablature.position.y = 3.9;
  const crownRing = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.045, 8, 20), wroughtIron);
  crownRing.rotation.x = Math.PI / 2;
  crownRing.position.y = 5.98;
  const crownFinial = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 10), brassMat);
  crownFinial.position.y = 6.32;
  const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, colR * 1.92), wroughtIron);
  crossBeam.position.y = 3.88;
  crossBeam.rotation.y = 0.65;
  gazInteractive.add(entablature, crownRing, crownFinial, crossBeam);

  // Warm glowing pendant globe lantern
  const lanternRod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.15, 6), brassMat);
  lanternRod.position.y = 5.38;
  const globeMat = new THREE.MeshStandardMaterial({
    color: 0xfff6df,
    emissive: 0xffbf69,
    emissiveIntensity: 0.75,
    roughness: 0.25,
  });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), globeMat);
  globe.position.y = 4.68;
  gazInteractive.add(lanternRod, globe);

  // Animated Two-Person Cedar & Linen Floral Swing suspended from crossBeam
  const swingPivot = new THREE.Group();
  swingPivot.position.set(0, 3.86, 0);
  swingPivot.rotation.y = 0.65;

  const chainLen = 2.92;
  for (const sz of [-0.88, 0.88]) {
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, chainLen, 6), brassMat);
    chain.position.set(0, -chainLen * 0.5, sz);
    const garland = createRoseBouquet({ count: 5, scale: 0.62 });
    garland.position.set(0, -chainLen + 0.34, sz);
    swingPivot.add(chain, garland);
  }

  const seatY = -chainLen;
  const seatFrame = new THREE.Mesh(createPillowedCushionGeo(0.66, 0.06, 1.88, 0.03, 0), cedarMat);
  seatFrame.position.set(0, seatY, 0);
  // Slatted Cedar Backrest + Curved Armrests + Piped Linen Cushion & Plump Blush Pillows
  for (let s = -5; s <= 5; s += 1) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.54, 0.12), cedarMat);
    slat.position.set(-0.29, seatY + 0.30, s * 0.155);
    slat.rotation.z = 0.14;
    swingPivot.add(slat);
  }
  const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 1.88), cedarMat);
  topRail.position.set(-0.33, seatY + 0.57, 0);
  const seatCushion = new THREE.Mesh(createPillowedCushionGeo(0.58, 0.10, 1.74, 0.045, 0.02), linenMat);
  seatCushion.position.set(0.02, seatY + 0.08, 0);
  const pillGeo = createPlumpPillowGeo(0.38, 0.34, 0.15);
  for (const sz of [-0.62, 0.62]) {
    const arm = new THREE.Mesh(createPillowedCushionGeo(0.62, 0.048, 0.075, 0.02, 0), cedarMat);
    arm.position.set(0, seatY + 0.28, sz * 1.44);
    const armPost = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 8), cedarMat);
    armPost.position.set(0.24, seatY + 0.14, sz * 1.44);
    const pillow = new THREE.Mesh(pillGeo, blushPillow);
    pillow.position.set(-0.14, seatY + 0.28, sz);
    pillow.rotation.set(0.1, Math.PI * 0.5 + 0.18 * Math.sign(sz), 0.16);
    swingPivot.add(arm, armPost, pillow);
  }
  swingPivot.add(seatFrame, topRail, seatCushion);
  gazInteractive.add(swingPivot);

  tagInteractive(gazInteractive, "flower-gazebo", "海岬白石花亭秋千");
  sec.add(gazInteractive);
  parent.add(sec);

  return { swingPivot, globeMat };
}

// ---------------------------------------------------------------------------
// 6. North Babbling Creek, Arched Footbridge, Hilltop Windmill, Cottages & Islet
// ---------------------------------------------------------------------------

function buildCreekAndArchedBridge(parent, waterAnimList) {
  const sec = new THREE.Group();
  sec.name = "NorthCreekAndArchedBridge";

  // Sparkling Mountain Creek Water Ribbon (Z in [-110, -25]) following getCreekCenterX(z)
  const creekWater = createFlowingWaterMat(2, 22);
  const zSteps = 96;
  const xCols = 6;
  const halfW = 2.65;
  const cPos = [];
  const cUvs = [];
  const cIdx = [];

  for (let i = 0; i <= zSteps; i += 1) {
    const v = i / zSteps;
    const z = lerp(-110.0, -24.5, v);
    const cx = getCreekCenterX(z);
    // Water plane sits level across channel at center-bed elevation + 0.42m
    const centerBedY = getWorldTerrainY(cx, z) + 0.36;
    for (let j = 0; j <= xCols; j += 1) {
      const u = j / xCols;
      const x = cx + (u - 0.5) * 2.0 * halfW;
      cPos.push(x, centerBedY, z);
      cUvs.push(u, v);
    }
  }
  const stride = xCols + 1;
  for (let i = 0; i < zSteps; i += 1) {
    for (let j = 0; j < xCols; j += 1) {
      const a = i * stride + j;
      const b = a + 1;
      const c = (i + 1) * stride + j;
      const d = c + 1;
      cIdx.push(a, c, b, b, c, d);
    }
  }
  const creekGeo = new THREE.BufferGeometry();
  creekGeo.setAttribute("position", new THREE.Float32BufferAttribute(cPos, 3));
  creekGeo.setAttribute("uv", new THREE.Float32BufferAttribute(cUvs, 2));
  creekGeo.setIndex(cIdx);
  creekGeo.computeVertexNormals();

  const creekMesh = new THREE.Mesh(creekGeo, creekWater.mat);
  creekMesh.userData.noCastShadow = true;
  sec.add(creekMesh);
  waterAnimList.push({ map: creekWater.map, normalMap: creekWater.normalMap, vx: 0.02, vy: -0.28 });

  // Creek bank boulders & riparian shrubs are placed via photogrammetry instancing in buildCoastalPhotogrammetry()

  buildCedarArchedFootbridge(sec);
  parent.add(sec);
}

function buildCedarArchedFootbridge(sec) {
  // Walkable Cedar & Stone Arched Footbridge at (+8.4, -44.0): X in [+3.2, +13.6], Z in [-45.8, -42.2]
  const yWest = getWorldTerrainY(3.2, -44.0) + 0.04;
  const yEast = getWorldTerrainY(13.6, -44.0) + 0.04;
  const yCrown = getWorldTerrainY(8.4, -44.0) + 1.85;
  const archRise = yCrown - 0.5 * (yWest + yEast);

  const getDeckY = (x) => {
    const t = clamp((x - 3.2) / 10.4, 0, 1);
    return lerp(yWest, yEast, t) + archRise * Math.sin(t * Math.PI);
  };

  registerWalkZone((x, z) => {
    if (x >= 3.0 && x <= 13.8 && z >= -45.8 && z <= -42.2) return getDeckY(x);
    return null;
  });
  registerBoxCollider(3.35, 13.45, -45.95, -45.62);
  registerBoxCollider(3.35, 13.45, -42.38, -42.05);

  const stoneMat = pbrStoneMat(0xc8c0b1, { repeatX: 3, repeatY: 2, roughness: 0.82 });
  const cedarMat = pbrWoodMat(0x9a6740, { repeatX: 3, repeatY: 3, roughness: 0.5 });
  const brassMat = pbrMetalMat(0xcba358, { roughness: 0.28, metalness: 0.85 });

  // Stone abutments anchored into west & east creek banks
  for (const [ax, ay] of [
    [3.05, yWest],
    [13.75, yEast],
  ]) {
    const abut = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.4, 4.1), stoneMat);
    abut.position.set(ax, ay - 1.18, -44.0);
    sec.add(abut);
  }

  // Twin curved cedar arch ribs + handrails
  const ptsSamples = 18;
  for (const rz of [-45.72, -42.28]) {
    const beamPts = [];
    const railPts = [];
    for (let i = 0; i <= ptsSamples; i += 1) {
      const x = lerp(3.15, 13.65, i / ptsSamples);
      const y = getDeckY(x);
      beamPts.push(new THREE.Vector3(x, y - 0.16, rz));
      railPts.push(new THREE.Vector3(x, y + 1.02, rz));
    }
    const beamGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(beamPts), 24, 0.12, 8, false);
    const railGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 24, 0.055, 8, false);
    sec.add(new THREE.Mesh(beamGeo, cedarMat), new THREE.Mesh(railGeo, cedarMat));

    for (let p = 0; p <= 6; p += 1) {
      const px = lerp(3.3, 13.5, p / 6);
      const py = getDeckY(px);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.12, 0.11), cedarMat);
      post.position.set(px, py + 0.48, rz);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.14), brassMat);
      cap.position.set(px, py + 1.06, rz);
      sec.add(post, cap);
    }
  }

  // Arched cedar deck planks following exact bridge profile
  const plankGeos = [];
  const numPlanks = 28;
  for (let i = 0; i < numPlanks; i += 1) {
    const x0 = lerp(3.15, 13.65, i / numPlanks);
    const x1 = lerp(3.15, 13.65, (i + 1) / numPlanks);
    const xm = 0.5 * (x0 + x1);
    const ym = getDeckY(xm);
    const slope = Math.atan2(getDeckY(x1) - getDeckY(x0), x1 - x0);
    const pg = new THREE.BoxGeometry(0.35, 0.075, 3.56);
    pg.rotateZ(slope);
    pg.translate(xm, ym - 0.035, -44.0);
    plankGeos.push(pg);
  }
  sec.add(new THREE.Mesh(safeMerge(plankGeos), cedarMat));
}

function buildWindmillCottagesAndIslet(parent) {
  const sec = new THREE.Group();
  sec.name = "WindmillCottagesAndIslet";

  const towerStone = pbrStoneMat(0xd2c9b8, { repeatX: 6, repeatY: 5, roughness: 0.82 });
  const shingleWood = pbrWoodMat(0x5e4838, { repeatX: 5, repeatY: 4, roughness: 0.78 });
  const cedarMat = pbrWoodMat(0x94623d, { repeatX: 3, repeatY: 3, roughness: 0.54 });
  const sailCanvas = pbrFabricMat(0xf4efe2, { roughness: 0.86, side: THREE.DoubleSide });
  const ironMat = pbrMetalMat(0x282c30, { roughness: 0.42, metalness: 0.82 });

  // Hilltop Weathered-Stone & Timber Windmill at (-52.0, +14.20, -68.0)
  registerCircleCollider(-52.0, -68.0, 3.6);
  const wm = new THREE.Group();
  wm.position.set(-52.0, 14.2, -68.0);
  wm.rotation.y = 0.52; // Facing southeast coastal breeze

  const apron = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.7, 0.92, 24), towerStone);
  apron.position.y = -0.38;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.26, 3.28, 10.5, 24), towerStone);
  tower.position.y = 5.25;
  const doorArch = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.25, 1.32), cedarMat);
  doorArch.position.set(3.16, 1.12, 0);

  // Timber reefing gallery deck at height 4.6m
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(3.85, 3.85, 0.14, 12), cedarMat);
  gallery.position.y = 4.65;
  const galRail = new THREE.Mesh(new THREE.TorusGeometry(3.75, 0.045, 8, 24), cedarMat);
  galRail.rotation.x = Math.PI / 2;
  galRail.position.y = 5.58;
  wm.add(apron, tower, doorArch, gallery, galRail);
  for (let b = 0; b < 12; b += 1) {
    const a = (b / 12) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.94, 0.09), cedarMat);
    post.position.set(Math.cos(a) * 3.74, 5.12, Math.sin(a) * 3.74);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.25, 0.11), cedarMat);
    strut.position.set(Math.cos(a) * 3.28, 4.08, Math.sin(a) * 3.28);
    strut.lookAt(Math.cos(a) * 2.8, 3.3, Math.sin(a) * 2.8);
    wm.add(post, strut);
  }

  // Shingled conical cap + windshaft & 4 rotating cedar-lattice & cream-canvas sails (radius 6.4m)
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.48, 2.85, 20), shingleWood);
  cap.position.y = 11.88;
  const capFinial = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), ironMat);
  capFinial.position.y = 13.38;
  wm.add(cap, capFinial);

  const shaftTilt = new THREE.Group();
  shaftTilt.position.set(0, 11.15, 0);
  shaftTilt.rotation.z = 0.11;
  const windShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 3.4, 12), cedarMat);
  windShaft.rotation.z = Math.PI / 2;
  windShaft.position.x = 1.45;
  shaftTilt.add(windShaft);

  const sailsRotor = new THREE.Group();
  sailsRotor.position.x = 2.95;
  const pollEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.45, 12), ironMat);
  pollEnd.rotation.z = Math.PI / 2;
  sailsRotor.add(pollEnd);

  for (let s = 0; s < 4; s += 1) {
    const blade = new THREE.Group();
    blade.rotation.x = (s / 4) * Math.PI * 2;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 6.4, 0.14), cedarMat);
    stock.position.y = 3.2;
    const latticeFrame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 5.15, 1.18), cedarMat);
    latticeFrame.position.set(0.04, 3.72, 0.62);
    latticeFrame.rotation.y = 0.15;
    const canvasSheet = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 4.95), sailCanvas);
    canvasSheet.position.set(0.08, 3.72, 0.62);
    canvasSheet.rotation.y = Math.PI / 2 + 0.15;
    blade.add(stock, latticeFrame, canvasSheet);
    sailsRotor.add(blade);
  }
  shaftTilt.add(sailsRotor);
  wm.add(shaftTilt);

  tagInteractive(wm, "windmill", "花海山顶石砌风车");
  sec.add(wm);

  // 3 Detailed Provençal Stone-and-Terracotta Hillside Country Cottages on Level Terraces
  const plasterCream = pbrPlasterMat(0xf4ecdd, { repeatX: 3, repeatY: 2, roughness: 0.85 });
  const plasterOchre = pbrPlasterMat(0xefe0c6, { repeatX: 3, repeatY: 2, roughness: 0.85 });
  const shutterSage = pbrWoodMat(0x6b8471, { roughness: 0.62 });
  const shutterBlue = pbrWoodMat(0x5b768c, { roughness: 0.62 });
  const roofTex = getTerracottaRoofTextures(6, 4);
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xc56b49,
    map: roofTex.map,
    normalMap: roofTex.normalMap,
    roughness: 0.76,
  });
  const warmWinMat = new THREE.MeshStandardMaterial({
    color: 0xfff2d2,
    emissive: 0xffb658,
    emissiveIntensity: 0.55,
    roughness: 0.22,
  });
  const cypressMat = new THREE.MeshStandardMaterial({ color: 0x365536, roughness: 0.82 });
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x4c3828, roughness: 0.94 });
  const cabbageLeafMat = new THREE.MeshStandardMaterial({ color: 0x567a4c, roughness: 0.8 });
  const herbLeafMat = new THREE.MeshStandardMaterial({ color: 0x6b8b62, roughness: 0.82 });
  const tomatoFruitMat = new THREE.MeshStandardMaterial({ color: 0xd64b36, roughness: 0.45 });

  const cottageSites = [
    [-78.0, -56.0, 0.42, 8.2, 5.8, plasterCream, shutterSage],
    [-18.0, -82.0, -0.18, 8.8, 6.0, plasterOchre, shutterBlue],
    [24.5, -68.0, -0.52, 7.8, 5.6, plasterCream, shutterSage],
  ];
  for (const [cx, cz, ry, cw, cd, wallMat, shutMat] of cottageSites) {
    const cy = getWorldTerrainY(cx, cz);
    const pw = cw + 0.96;
    const pd = cd + 1.05;
    const cosR = Math.cos(ry);
    const sinR = Math.sin(ry);
    const cotToWorld = (lx, lz) => [cx + lx * cosR + lz * sinR, cz - lx * sinR + lz * cosR];
    registerRotatedBoxCollider(cx, cz, ry, pw * 0.5 + 0.08, pd * 0.5 + 0.05);
    const [wx, wz] = cotToWorld(-cw * 0.62, -cd * 0.08);
    registerRotatedBoxCollider(wx, wz, ry, cw * 0.23, cd * 0.38);
    const [kx, kz] = cotToWorld(cw * 0.62, -cd * 0.12);
    registerRotatedBoxCollider(kx, kz, ry, 1.18, 1.42);
    for (const px of [-1.45, 1.45]) {
      const [pox, poz] = cotToWorld(px, cd * 0.5 + 1.45);
      registerCircleCollider(pox, poz, 0.22);
    }
    const stairStartZ = cd * 0.5 + 1.65;
    for (const chkSide of [-0.98, 0.98]) {
      const [chx, chz] = cotToWorld(chkSide, stairStartZ + 1.25);
      registerRotatedBoxCollider(chx, chz, ry, 0.14, 1.58);
    }
    registerWalkZone((x, z) => {
      const dxw = x - cx;
      const dzw = z - cz;
      const lx = dxw * cosR - dzw * sinR;
      const lz = dxw * sinR + dzw * cosR;
      if (Math.abs(lx) <= 1.28 && lz >= pd * 0.5 - 0.05 && lz <= pd * 0.5 + 1.25) {
        return cy + 0.16;
      }
      if (Math.abs(lx) <= 0.86 && lz >= cd * 0.5 + 1.25 && lz <= stairStartZ + 2.85) {
        const u = clamp((lz - stairStartZ) / (5 * 0.52), 0, 1);
        return cy + lerp(0.02, -0.92, u) + 0.02;
      }
      return null;
    });

    const cot = new THREE.Group();
    cot.position.set(cx, cy, cz);
    cot.rotation.y = ry;

    // Tightly tailored rectilinear limestone plinth & front doorstep patio (replaces wide circular pad)
    const terrace = new THREE.Mesh(new THREE.BoxGeometry(pw, 2.38, pd), towerStone);
    terrace.position.y = -1.16;
    const terraceCoping = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.14, 0.14, pd + 0.14), towerStone);
    terraceCoping.position.y = 0.04;
    const gardenWall = new THREE.Group();
    const frontStoop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 1.35), towerStone);
    frontStoop.position.set(0, 0.08, pd * 0.5 + 0.52);
    gardenWall.add(frontStoop);
    for (const sx of [-1.45, 1.45]) {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.44, 1.25), towerStone);
      cheek.position.set(sx, 0.22, pd * 0.5 + 0.45);
      gardenWall.add(cheek);
    }

    // 4 Carved stone/terracotta drainage weep-spouts (排水口) protruding along downhill retaining wall
    for (const wx of [-0.38, -0.14, 0.14, 0.38]) {
      const spX = wx * pw;
      const spZ = pd * 0.5 + 0.08;
      const corbel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.26), towerStone);
      corbel.position.set(spX, -0.46, spZ);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.34, 10), roofMat);
      spout.rotation.x = Math.PI / 2 + 0.12;
      spout.position.set(spX, -0.38, spZ + 0.08);
      cot.add(corbel, spout);
    }

    // Grounded masonry base beneath east kitchen garden planter
    const kgPlinth = new THREE.Mesh(new THREE.BoxGeometry(2.25, 2.38, 2.75), towerStone);
    kgPlinth.position.set(cw * 0.62, -1.16, -cd * 0.12);
    cot.add(kgPlinth);

    // Stepped stone access stairs (上下步道) descending from front porch terrace down to meadow slope
    for (let st = 0; st < 6; st += 1) {
      const stFrac = st / 5;
      const stZ = stairStartZ + st * 0.52;
      const stY = lerp(0.02, -0.92, stFrac);
      const tread = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.26, 0.56), towerStone);
      tread.position.set(0, stY - 0.11, stZ);
      cot.add(tread);
    }
    for (const chkSide of [-0.98, 0.98]) {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 3.15), towerStone);
      cheek.position.set(chkSide, -0.34, stairStartZ + 1.25);
      cheek.rotation.x = 0.31;
      cot.add(cheek);
    }

    // Small timber-framed Provençal kitchen garden (小型菜圃) on sunny east terrace
    const kg = new THREE.Group();
    kg.position.set(cw * 0.62, 0.04, -cd * 0.12);
    const bedW = 1.95;
    const bedD = 2.45;
    for (const [bx, bz, sx, sz] of [
      [0, -bedD * 0.5, bedW + 0.14, 0.12],
      [0, bedD * 0.5, bedW + 0.14, 0.12],
      [-bedW * 0.5, 0, 0.12, bedD],
      [bedW * 0.5, 0, 0.12, bedD],
    ]) {
      const Curb = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.22, sz), cedarMat);
      Curb.position.set(bx, 0.11, bz);
      kg.add(Curb);
    }
    const soilBed = new THREE.Mesh(new THREE.BoxGeometry(bedW - 0.08, 0.16, bedD - 0.08), soilMat);
    soilBed.position.y = 0.08;
    kg.add(soilBed);
    // 3 tidy vegetable furrows: leafy cabbages, culinary herbs & staked tomato vines
    for (let row = 0; row < 3; row += 1) {
      const rx = -0.58 + row * 0.58;
      const furrow = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, bedD - 0.28), soilMat);
      furrow.position.set(rx, 0.18, 0);
      kg.add(furrow);
      for (let p = 0; p < 4; p += 1) {
        const pz = -0.82 + p * 0.55;
        if (row < 2) {
          const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.14 + (p % 2) * 0.02, 10, 8),
            row === 0 ? cabbageLeafMat : herbLeafMat
          );
          head.scale.set(1.15, 0.72, 1.15);
          head.position.set(rx, 0.26, pz);
          kg.add(head);
        } else {
          // Staked Provençal tomato vine
          const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.86, 6), cedarMat);
          stake.position.set(rx, 0.58, pz);
          const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.16, 9, 7), herbLeafMat);
          foliage.scale.set(0.95, 1.45, 0.95);
          foliage.position.set(rx, 0.52, pz);
          const fruit1 = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), tomatoFruitMat);
          fruit1.position.set(rx + 0.09, 0.46, pz + 0.06);
          const fruit2 = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 6), tomatoFruitMat);
          fruit2.position.set(rx - 0.08, 0.58, pz - 0.05);
          kg.add(stake, foliage, fruit1, fruit2);
        }
      }
    }
    cot.add(kg);

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.36, 1.4, cd + 0.36), towerStone);
    plinth.position.y = -0.35;
    const body = new THREE.Mesh(new THREE.BoxGeometry(cw, 3.55, cd), wallMat);
    body.position.y = 2.08;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.44, 2.75, cd * 0.72), wallMat);
    wing.position.set(-cw * 0.62, 1.68, -cd * 0.08);
    const wingRoof = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.5, 0.16, cd * 0.84), roofMat);
    wingRoof.position.set(-cw * 0.62, 3.22, -cd * 0.08);
    wingRoof.rotation.z = 0.24;

    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.86, 2.85, 0.86), towerStone);
    chimney.position.set(cw * 0.3, 4.65, -cd * 0.22);
    const chimPot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.45, 10), roofMat);
    chimPot.position.set(cw * 0.3, 6.22, -cd * 0.22);
    cot.add(terrace, terraceCoping, gardenWall, plinth, body, wing, wingRoof, chimney, chimPot);

    // Gable end triangles + overhanging terracotta barrel-tile roof slopes
    for (const side of [-1, 1]) {
      const slopeLen = Math.hypot(cd * 0.6, 1.75);
      const roofSlope = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.85, 0.18, slopeLen), roofMat);
      roofSlope.position.set(0, 4.55, side * cd * 0.28);
      roofSlope.rotation.x = side * Math.atan2(1.75, cd * 0.6);
      cot.add(roofSlope);
    }

    // Timber entry pergola porch & arched oak doorway on +Z facade
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.12, 2.18, 0.14), cedarMat);
    door.position.set(0, 1.18, cd * 0.51);
    const porchBeam = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 0.14), cedarMat);
    porchBeam.position.set(0, 2.68, cd * 0.5 + 1.45);
    cot.add(door, porchBeam);
    for (const px of [-1.45, 1.45]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.13, 2.62, 0.13), cedarMat);
      post.position.set(px, 1.35, cd * 0.5 + 1.45);
      const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.65), cedarMat);
      rafter.position.set(px, 2.78, cd * 0.5 + 0.78);
      cot.add(post, rafter);
    }
    const porchRoses = createRoseBouquet({ count: 6, scale: 0.75 });
    porchRoses.position.set(-1.35, 2.75, cd * 0.5 + 1.25);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), warmWinMat);
    lantern.position.set(0.82, 2.25, cd * 0.5 + 0.18);
    cot.add(porchRoses, lantern);

    // Shuttered mullioned windows + flower boxes
    for (const wx of [-cw * 0.28, cw * 0.28]) {
      for (const wzSign of [-1, 1]) {
        const wz = wzSign * (cd * 0.505);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.22, 0.1), cedarMat);
        frame.position.set(wx, 2.22, wz);
        const pane = new THREE.Mesh(new THREE.BoxGeometry(0.88, 1.04, 0.12), warmWinMat);
        pane.position.set(wx, 2.22, wz);
        const sillBox = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.2, 0.26), cedarMat);
        sillBox.position.set(wx, 1.54, wz + wzSign * 0.12);
        cot.add(frame, pane, sillBox);
        for (const sSide of [-1, 1]) {
          const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.16, 0.06), shutMat);
          shutter.position.set(wx + sSide * 0.68, 2.22, wz + wzSign * 0.04);
          cot.add(shutter);
        }
      }
    }

    // Paired organic fluted Italian Cypress trees framing each hillside cottage garden (zero geometric cone!)
    for (const [tx, tz, th] of [
      [cw * 0.88, cd * 0.35, 6.2],
      [-cw * 0.88, cd * 0.45, 5.1],
    ]) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, 1.35, 10), cedarMat);
      trunk.position.set(tx, 0.68, tz);
      const cGeo = new THREE.CylinderGeometry(0.06, 0.62, th, 16, 18);
      const cp = cGeo.attributes.position;
      for (let v = 0; v < cp.count; v += 1) {
        const vx = cp.getX(v);
        const vy = cp.getY(v);
        const vz = cp.getZ(v);
        const u = clamp((vy + th * 0.5) / th, 0, 1); // 0 bottom -> 1 apex
        const env = Math.sin(Math.pow(u, 0.58) * Math.PI * 0.96) * 1.18 + 0.06;
        const ang = Math.atan2(vz, vx);
        const whorls = 1.0 + 0.13 * Math.sin(u * 21.0 + ang * 2.0) + 0.09 * Math.cos(ang * 5.0 + u * 9.0);
        const rOut = 0.66 * env * whorls;
        const curR = Math.hypot(vx, vz);
        if (curR > 1e-4) {
          cp.setXYZ(v, (vx / curR) * rOut, vy, (vz / curR) * rOut);
        }
      }
      cGeo.computeVertexNormals();
      const spire = new THREE.Mesh(cGeo, cypressMat);
      spire.position.set(tx, 1.05 + th * 0.5, tz);
      cot.add(trunk, spire);
    }

    sec.add(cot);
  }

  // Outer-bay sea-stack crags & shrubs are placed via photogrammetry in buildCoastalPhotogrammetry()

  parent.add(sec);
  return { sailsRotor, warmWinMat };
}

// ---------------------------------------------------------------------------
// 7. Golden Curved Beach, Stratified Coastal Reefs & Walkable Cedar Boardwalk
// ---------------------------------------------------------------------------

function buildGoldenBeachAndBoardwalk(parent) {
  const sec = new THREE.Group();
  sec.name = "GoldenBeachAndBoardwalk";

  const limestoneMat = pbrStoneMat(0xded6c6, { repeatX: 6, repeatY: 2, roughness: 0.78 });
  const cedarPlankMat = createTeakDeckMat(0xb68352, 4, 8);
  const cedarBeamMat = pbrWoodMat(0x875835, { repeatX: 3, repeatY: 3, roughness: 0.62 });
  const pileTimberMat = pbrWoodMat(0x4f3928, { roughness: 0.86 });
  const ropeMat = pbrFabricMat(0xd5c19c, { roughness: 0.9 });
  const brassMat = pbrMetalMat(0xcba358, { roughness: 0.26, metalness: 0.86 });
  const linenMat = pbrFabricMat(0xf7f2e7, { roughness: 0.82, side: THREE.DoubleSide });
  const stripeBlueMat = pbrFabricMat(0x88a4bc, { roughness: 0.84 });

  // Low carved limestone garden terrace edge curb along Z = 22.9 (opening at X in [-15.6, -12.0] for boardwalk steps)
  for (const [x0, x1] of [
    [-25.5, -15.6],
    [-12.0, 5.8],
  ]) {
    const len = x1 - x0;
    const xm = 0.5 * (x0 + x1);
    const ym = getWorldTerrainY(xm, 22.9);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(len, 0.34, 0.42), limestoneMat);
    curb.position.set(xm, ym + 0.05, 22.9);
    sec.add(curb);
  }

  // Curved Walkable Cedar Waterside Boardwalk (亲水木栈道)
  // Curves gracefully from the garden terrace edge (-13.8, 23.0) across the golden sand beach
  // out to an over-water seaside viewing deck at [0.0..5.8, 33.2..38.2] (Y=1.18).
  const deckY = 1.18;
  const curvePts = [
    new THREE.Vector3(-13.8, 2.34, 23.0),
    new THREE.Vector3(-12.4, 2.08, 28.6),
    new THREE.Vector3(-8.2, 1.62, 33.2),
    new THREE.Vector3(-3.2, 1.28, 35.4),
    new THREE.Vector3(1.2, deckY, 35.6),
  ];
  const boardwalkCurve = new THREE.CatmullRomCurve3(curvePts);
  const evalBoardwalkY = (u) => {
    const p = boardwalkCurve.getPoint(u);
    return Math.max(p.y, getWorldTerrainY(p.x, p.z) + 0.18, deckY);
  };

  // Register smooth walk zone for curved boardwalk and over-water deck
  registerWalkZone((x, z) => {
    // Over-water seaside viewing deck (X in [-0.2, 5.9], Z in [33.1, 38.3])
    if (x >= -0.2 && x <= 5.9 && z >= 33.1 && z <= 38.3) {
      return deckY;
    }
    // Curved cedar boardwalk corridor (half-width 1.32m)
    if (x >= -15.4 && x <= 1.8 && z >= 22.6 && z <= 36.8) {
      let bestD2 = 999;
      let bestU = 0;
      const samples = 24;
      for (let i = 0; i <= samples; i += 1) {
        const u = i / samples;
        const p = boardwalkCurve.getPoint(u);
        const d2 = (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z);
        if (d2 < bestD2) {
          bestD2 = d2;
          bestU = u;
        }
      }
      if (bestD2 <= 1.35 * 1.35) return evalBoardwalkY(bestU);
    }
    return null;
  });

  // Safety rail colliders around over-water viewing deck outer edges (west side open to boardwalk)
  registerBoxCollider(-0.2, 5.95, 38.15, 38.55); // South sea edge
  registerBoxCollider(5.75, 6.05, 33.1, 38.45); // East sea edge
  registerBoxCollider(1.5, 5.95, 32.95, 33.25); // North edge east of walkway

  const boardwalkGroup = new THREE.Group();
  boardwalkGroup.name = "CedarWatersideBoardwalk";

  // 1) Threshold cedar ramp from garden terrace onto boardwalk head (-13.8, 22.3..23.1)
  for (let s = 0; s < 3; s += 1) {
    const stepPlank = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.1, 0.34), cedarPlankMat);
    stepPlank.position.set(-13.8, 2.22 + s * 0.04, 22.32 + s * 0.32);
    boardwalkGroup.add(stepPlank);
  }

  // 2) Curved boardwalk cross-planks, timber stringers, pilings & post-and-rope railings
  const plankCount = 54;
  const plankGeos = [];
  const beamGeos = [];
  const postPositions = [];
  const upVec = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i <= plankCount; i += 1) {
    const u = i / plankCount;
    const pt = boardwalkCurve.getPoint(u);
    const py = evalBoardwalkY(u);
    const tan = boardwalkCurve.getTangent(u).normalize();
    const side = new THREE.Vector3().crossVectors(upVec, tan).normalize();
    const yaw = Math.atan2(tan.x, tan.z);

    const pg = new THREE.BoxGeometry(2.48, 0.09, 0.32);
    pg.rotateY(yaw);
    pg.translate(pt.x, py - 0.045, pt.z);
    plankGeos.push(pg);

    if (i < plankCount) {
      for (const sOff of [-0.96, 0.96]) {
        const bg = new THREE.BoxGeometry(0.12, 0.16, 0.44);
        bg.rotateY(yaw);
        bg.translate(pt.x + side.x * sOff, py - 0.15, pt.z + side.z * sOff);
        beamGeos.push(bg);
      }
    }

    if (i % 7 === 0) {
      for (const sOff of [-1.14, 1.14]) {
        const px = pt.x + side.x * sOff;
        const pz = pt.z + side.z * sOff;
        const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 3.2, 10), pileTimberMat);
        pile.position.set(px, py - 1.62, pz);
        boardwalkGroup.add(pile);

        // Leave beach step-down gap on western/southern sand side around u in [0.48, 0.66]
        if (!(sOff < 0 && u > 0.46 && u < 0.66)) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.072, 0.92, 10), cedarBeamMat);
          post.position.set(px, py + 0.44, pz);
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.076, 0.076, 0.04, 10), brassMat);
          cap.position.set(px, py + 0.91, pz);
          boardwalkGroup.add(post, cap);
          postPositions.push({ side: Math.sign(sOff), vec: new THREE.Vector3(px, py + 0.74, pz) });
        }
      }
    }
  }
  boardwalkGroup.add(
    new THREE.Mesh(safeMerge(plankGeos), cedarPlankMat),
    new THREE.Mesh(safeMerge(beamGeos), cedarBeamMat)
  );

  // Side steps down onto the golden sand beach around (-8.6, 33.4)
  const stepBaseY = evalBoardwalkY(0.54);
  for (let bs = 0; bs < 4; bs += 1) {
    const bStep = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.11, 0.42), cedarPlankMat);
    bStep.position.set(-9.15 - bs * 0.28, stepBaseY - 0.16 - bs * 0.2, 33.85 + bs * 0.36);
    bStep.rotation.y = 0.58;
    boardwalkGroup.add(bStep);
  }

  // Marine hemp rope catenaries along seaward & landward posts
  for (const sSign of [-1, 1]) {
    const pts = postPositions.filter((p) => p.side === sSign).map((p) => p.vec);
    for (let i = 0; i < pts.length - 1; i += 1) {
      if (pts[i].distanceTo(pts[i + 1]) > 4.6) continue;
      const mid = pts[i].clone().lerp(pts[i + 1], 0.5);
      mid.y -= 0.09;
      const rCurve = new THREE.QuadraticBezierCurve3(pts[i], mid, pts[i + 1]);
      const ropeMesh = new THREE.Mesh(new THREE.TubeGeometry(rCurve, 10, 0.022, 6, false), ropeMat);
      boardwalkGroup.add(ropeMesh);
    }
  }

  // 3) Over-water Cedar Seaside Viewing Deck (X in [0.0, 5.8], Z in [33.2, 38.2], Y = 1.18)
  const deckGroup = new THREE.Group();
  const deckPlanks = [];
  for (let dz = 33.35; dz <= 38.05; dz += 0.34) {
    const dp = new THREE.BoxGeometry(5.8, 0.09, 0.3);
    dp.translate(2.9, deckY - 0.045, dz);
    deckPlanks.push(dp);
  }
  deckGroup.add(new THREE.Mesh(safeMerge(deckPlanks), cedarPlankMat));
  const rimFrame = new THREE.Mesh(new THREE.BoxGeometry(5.92, 0.18, 5.08), cedarBeamMat);
  rimFrame.position.set(2.9, deckY - 0.15, 35.7);
  deckGroup.add(rimFrame);

  for (const px of [0.3, 2.9, 5.5]) {
    for (const pz of [33.45, 35.7, 37.95]) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 3.8, 10), pileTimberMat);
      pile.position.set(px, deckY - 1.9, pz);
      deckGroup.add(pile);
    }
  }

  // Viewing deck perimeter posts & hemp ropes
  const deckRailPts = [
    [0.15, 38.05],
    [1.95, 38.05],
    [3.8, 38.05],
    [5.65, 38.05],
    [5.65, 35.7],
    [5.65, 33.35],
    [3.8, 33.35],
    [1.95, 33.35],
  ];
  for (let i = 0; i < deckRailPts.length; i += 1) {
    const [rx, rz] = deckRailPts[i];
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.075, 0.94, 10), cedarBeamMat);
    post.position.set(rx, deckY + 0.45, rz);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 10), brassMat);
    cap.position.set(rx, deckY + 0.93, rz);
    deckGroup.add(post, cap);
    if (i < deckRailPts.length - 1) {
      const [nx, nz] = deckRailPts[i + 1];
      const p0 = new THREE.Vector3(rx, deckY + 0.76, rz);
      const p1 = new THREE.Vector3(nx, deckY + 0.76, nz);
      const pm = p0.clone().lerp(p1, 0.5);
      pm.y -= 0.08;
      deckGroup.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0, pm, p1), 8, 0.022, 6, false),
          ropeMat
        )
      );
    }
  }

  // Two Slatted Teak Steamer Deck Loungers + Slatted Teak Resort Side Table + Ribbed Valanced Market Parasol
  const loungerSpots = [];
  const deckBrassMat = pbrMetalMat(0xcfa658, { roughness: 0.26, metalness: 0.88 });
  const drinkGlassMat = pbrGlassMat({ color: 0xe6f6fa, opacity: 0.42 });
  const citrusMat = new THREE.MeshStandardMaterial({ color: 0xf4a638, roughness: 0.45 });
  for (const [lx, lz, lyaw] of [
    [2.2, 36.25, 0.14],
    [3.95, 36.15, -0.12],
  ]) {
    const lounger = buildTeakSteamerDeckLounger({
      teakMat: cedarBeamMat,
      linenMat,
      accentMat: stripeBlueMat,
      brassMat: deckBrassMat,
    });
    lounger.position.set(lx, deckY, lz);
    lounger.rotation.y = lyaw;
    deckGroup.add(lounger);
    registerRotatedBoxCollider(lx, lz, lyaw, 0.38, 0.96, 0.5, 3.5);
    loungerSpots.push({ lx, lz, lyaw });
  }
  // Slatted Teak Resort Side Table + Two Iced Citrus Drinks + Ribbed Market Parasol
  const sideTbl = new THREE.Group();
  sideTbl.position.set(3.08, deckY, 35.85);
  registerBoxCollider(2.76, 3.40, 35.53, 36.17, 0.5, 3.5);
  for (let s = -2; s <= 2; s += 1) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.024, 0.088), cedarBeamMat);
    slat.position.set(0, 0.43, s * 0.105);
    sideTbl.add(slat);
  }
  for (const [fx, fz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.42, 0.038), cedarBeamMat);
    leg.position.set(fx, 0.21, fz);
    sideTbl.add(leg);
  }
  for (const [gx, gz] of [[-0.12, 0.08], [0.13, -0.06]]) {
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.028, 0.105, 12), drinkGlassMat);
    glass.position.set(gx, 0.495, gz);
    const slice = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.008, 10), citrusMat);
    slice.rotation.z = Math.PI * 0.38;
    slice.position.set(gx + 0.03, 0.545, gz);
    sideTbl.add(glass, slice);
  }
  const parasolCanvasMat = pbrFabricMat(0xe5d6be, { roughness: 0.9, side: THREE.DoubleSide });
  const deckParasol = buildResortMarketParasol({
    teakMat: cedarBeamMat,
    canvasMat: parasolCanvasMat,
    brassMat: deckBrassMat,
    radius: 1.52,
    height: 2.46,
  });
  deckParasol.position.set(3.08, deckY, 35.12);
  deckParasol.userData.noBatch = true;
  registerCircleCollider(3.08, 35.12, 0.14, 0.5, 3.5);
  deckGroup.add(sideTbl, deckParasol);

  boardwalkGroup.add(deckGroup);
  tagInteractive(boardwalkGroup, "beach-boardwalk", "金色沙滩亲水木栈道");
  sec.add(boardwalkGroup);

  // 4) Coastal cove reefs & basalt sea-shelves placed via photogrammetry in buildCoastalPhotogrammetry()

  parent.add(sec);
  return { deckParasol, loungerSpots, deckY, stepBaseY, boardwalkTopY: evalBoardwalkY(0.54) };
}

// ---------------------------------------------------------------------------
// 8. Instanced Pathway Stone-and-Brass Bollard Lamps (汀步灯) + Night Fill
// ---------------------------------------------------------------------------

function buildPathwayBollardLamps(parent) {
  const sec = new THREE.Group();
  sec.name = "PathwayBollardLamps";

  // 28 garden, pond, swing, boardwalk & trail bollard coordinates: [x, z, optionalFixedBaseY]
  const coords = [
    // Monet Garden Walk & Villa Forecourt
    [-11.8, 12.2, null],
    [-15.2, 13.8, null],
    [-9.2, 16.4, null],
    [-14.6, 19.6, null],
    [-10.2, 22.1, null],
    // Waterfall & Lily Pond Rim
    [-6.2, 13.4, null],
    [-6.6, 18.8, null],
    [5.4, 15.2, null],
    [4.8, 20.6, null],
    // Couple Swing Path & Pergola Clearing
    [-21.2, 13.0, null],
    [-25.0, 14.6, null],
    [-31.6, 14.6, null],
    [-28.5, 8.6, null],
    // Golden Beach Cedar Boardwalk & Viewing Deck
    [-15.1, 22.8, 2.34],
    [-11.2, 29.8, 2.02],
    [-5.8, 34.4, 1.48],
    [0.35, 33.45, 1.18],
    [5.10, 37.55, 1.18],
    // East Promenade Link toward Harbor Quay
    [8.2, 10.6, null],
    [11.4, 4.2, null],
    // West Headland Cliff Trail to Marble Rose Gazebo
    [-36.5, 18.5, null],
    [-46.0, 26.5, null],
    [-55.8, 34.5, null],
    [-60.2, 39.2, null],
    // North Meadow & Cedar Arched Footbridge Trail
    [-4.5, -26.0, null],
    [2.6, -42.4, null],
    [14.2, -45.6, null],
    [-28.0, -52.0, null],
  ];

  const stonePostMat = pbrStoneMat(0xd8d0c1, { repeatX: 1, repeatY: 1, roughness: 0.78 });
  const brassCapMat = pbrMetalMat(0xbfa065, { roughness: 0.3, metalness: 0.84 });
  const bollardGlowMat = new THREE.MeshStandardMaterial({
    color: 0xfff4dc,
    emissive: 0xffbe6b,
    emissiveIntensity: 0.38,
    roughness: 0.22,
  });

  const postGeo = new THREE.CylinderGeometry(0.085, 0.105, 0.52, 12);
  postGeo.translate(0, 0.26, 0);
  const capGeo = new THREE.ConeGeometry(0.135, 0.085, 12);
  capGeo.translate(0, 0.72, 0);
  const glowGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.16, 12);
  glowGeo.translate(0, 0.6, 0);

  // Soft warm night ground light pool disc beneath each bollard & harbor lamp (zero PointLight cost!)
  const haloTex = makeCanvasTex(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.5, 1, w * 0.5, h * 0.5, w * 0.5);
    g.addColorStop(0.0, "rgba(255, 214, 146, 0.78)");
    g.addColorStop(0.42, "rgba(255, 192, 112, 0.34)");
    g.addColorStop(1.0, "rgba(255, 176, 92, 0.0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  const bollardHaloMat = new THREE.MeshBasicMaterial({
    map: haloTex,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const haloGeo = new THREE.PlaneGeometry(2.35, 2.35);
  haloGeo.rotateX(-Math.PI * 0.5);
  haloGeo.translate(0, 0.04, 0);

  // Include 6 harbor promenade streetlamp ground pools as well
  const harborLampPoolCoords = [
    [44.2, -21.5, 1.38],
    [44.2, -12.0, 1.38],
    [44.2, -2.5, 1.38],
    [44.2, 5.8, 1.38],
    [44.2, 17.5, 1.38],
    [23.2, 20.2, 1.38],
  ];

  const count = coords.length;
  const totalHalos = count + harborLampPoolCoords.length;
  const posts = new THREE.InstancedMesh(postGeo, stonePostMat, count);
  const caps = new THREE.InstancedMesh(capGeo, brassCapMat, count);
  const glows = new THREE.InstancedMesh(glowGeo, bollardGlowMat, count);
  const halos = new THREE.InstancedMesh(haloGeo, bollardHaloMat, totalHalos);
  posts.userData.noCastShadow = true;
  caps.userData.noCastShadow = true;
  glows.userData.noShadow = true;
  halos.userData.noShadow = true;
  halos.visible = false;
  halos.raycast = () => {};

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i += 1) {
    const [bx, bz, fixedY] = coords[i];
    const by = fixedY !== null ? fixedY : getWorldTerrainY(bx, bz);
    registerCircleCollider(bx, bz, 0.16, by - 0.6, by + 1.8);
    dummy.position.set(bx, by, bz);
    dummy.rotation.set(0, i * 0.7, 0);
    dummy.scale.setScalar(1.0);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
    caps.setMatrixAt(i, dummy.matrix);
    glows.setMatrixAt(i, dummy.matrix);
    halos.setMatrixAt(i, dummy.matrix);
  }
  for (let j = 0; j < harborLampPoolCoords.length; j += 1) {
    const [hx, hz, hy] = harborLampPoolCoords[j];
    dummy.position.set(hx, hy, hz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(2.4);
    dummy.updateMatrix();
    halos.setMatrixAt(count + j, dummy.matrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  caps.instanceMatrix.needsUpdate = true;
  glows.instanceMatrix.needsUpdate = true;
  halos.instanceMatrix.needsUpdate = true;
  sec.add(posts, caps, glows, halos);

  // Just 2 restrained non-shadow night fill PointLights (courtyard & harbor promenade; hidden by day)
  const gardenNightLight = new THREE.PointLight(0xffca82, 0.0, 28.0, 1.7);
  gardenNightLight.position.set(-8.5, 4.2, 15.5);
  gardenNightLight.castShadow = false;
  gardenNightLight.visible = false;

  const harborNightLight = new THREE.PointLight(0xffc478, 0.0, 32.0, 1.7);
  harborNightLight.position.set(22.0, 4.0, 10.0);
  harborNightLight.castShadow = false;
  harborNightLight.visible = false;

  sec.add(gardenNightLight, harborNightLight);
  parent.add(sec);

  return { bollardGlowMat, bollardHaloMat, halos, gardenNightLight, harborNightLight };
}

// ---------------------------------------------------------------------------
// 9. Photogrammetry Coastal Cliffs, Reefs, Moss Boulders, Shrubs & Harbor Props
// ---------------------------------------------------------------------------

function normalizeCoastalGLTFMaterial(mat, { isFoliage = false, isCliff = false } = {}) {
  if (!mat) return mat;
  if (isFoliage) {
    mat.alphaTest = 0.42;
    mat.transparent = false;
    mat.depthWrite = true;
    mat.side = THREE.DoubleSide;
    mat.roughness = 0.78;
    mat.metalness = 0.0;
  } else if (isCliff) {
    mat.side = THREE.DoubleSide;
    mat.roughness = Math.max(mat.roughness ?? 0.86, 0.78);
    mat.metalness = 0.02;
  } else {
    mat.roughness = Math.max(mat.roughness ?? 0.65, 0.35);
  }
  mat.needsUpdate = true;
  return mat;
}

function extractVariantMeshes(root, opts = {}) {
  const parts = [];
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const geo = obj.geometry.clone();
    geo.applyMatrix4(obj.matrixWorld);
    if (geo.attributes.color) geo.deleteAttribute("color");
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const rawMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const mat = normalizeCoastalGLTFMaterial(rawMat.clone(), opts);
    parts.push({ geometry: geo, material: mat });
  });
  return parts;
}

function buildInstancedVariants(sec, parts, placements, { castShadow = true, receiveShadow = true } = {}) {
  if (!parts.length || !placements.length) return;
  const buckets = Array.from({ length: parts.length }, () => []);
  for (let i = 0; i < placements.length; i += 1) {
    const p = placements[i];
    const idx = ((p.variant ?? i) % parts.length + parts.length) % parts.length;
    buckets[idx].push(p);
  }
  const dummy = new THREE.Object3D();
  for (let v = 0; v < parts.length; v += 1) {
    const list = buckets[v];
    if (!list.length) continue;
    const { geometry, material } = parts[v];
    const inst = new THREE.InstancedMesh(geometry, material, list.length);
    for (let i = 0; i < list.length; i += 1) {
      const p = list[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
      dummy.scale.set(p.sx ?? p.s ?? 1, p.sy ?? p.s ?? 1, p.sz ?? p.s ?? 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.castShadow = castShadow;
    inst.receiveShadow = receiveShadow;
    sec.add(inst);
  }
}

async function buildCoastalPhotogrammetry(group) {
  if (group.getObjectByName("CoastalPhotogrammetry")) return;
  const [
    cliff01Gltf,
    cliff02Gltf,
    coastRocksGltf,
    coastRocksBGltf,
    mossBoulderGltf,
    shrubGltf,
    lifebuoyGltf,
    picnicTableGltf,
  ] = await Promise.all([
    loadBundledGLB("ph_cliff_01", "./assets/models/ph_cliff_01.glb"),
    loadBundledGLB("ph_cliff_02", "./assets/models/ph_cliff_02.glb"),
    loadBundledGLB("ph_coast_rocks", "./assets/models/ph_coast_rocks.glb"),
    loadBundledGLB("ph_coast_rocks_b", "./assets/models/ph_coast_rocks_b.glb"),
    loadBundledGLB("ph_moss_boulder", "./assets/models/ph_moss_boulder.glb"),
    loadBundledGLB("ph_coastal_shrub", "./assets/models/ph_coastal_shrub.glb"),
    loadBundledGLB("ph_lifebuoy", "./assets/models/ph_lifebuoy.glb"),
    loadBundledGLB("ph_picnic_table", "./assets/models/ph_picnic_table.glb"),
  ]);

  const sec = new THREE.Group();
  sec.name = "CoastalPhotogrammetry";
  const rng = mulberry32(9217);

  const placeClone = (gltf, { x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1, isCliff = false }) => {
    const obj = gltf.scene.clone(true);
    obj.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => normalizeCoastalGLTFMaterial(m, { isCliff }));
    });
    obj.position.set(x, y, z);
    obj.rotation.set(rx, ry, rz);
    obj.scale.set(sx, sy, sz);
    sec.add(obj);
    return obj;
  };

  // 1) Sculpted photogrammetry coastal limestone cliffs along NE headland & Far-West cape
  placeClone(cliff01Gltf, { x: 35.8, y: -0.45, z: -56.0, ry: Math.PI * 0.46, sx: 0.62, sy: 0.96, sz: 0.78, isCliff: true });
  placeClone(cliff02Gltf, { x: 46.2, y: 0.40, z: -95.0, ry: Math.PI * 0.34, sx: 0.85, sy: 1.25, sz: 0.95, isCliff: true });
  placeClone(cliff01Gltf, { x: -113.5, y: -0.35, z: -14.0, ry: -Math.PI * 0.50, sx: 0.66, sy: 1.02, sz: 0.76, isCliff: true });
  placeClone(cliff02Gltf, { x: -96.0, y: -0.35, z: 39.0, ry: -Math.PI * 0.78, sx: 0.68, sy: 0.86, sz: 0.72, isCliff: true });

  // 2) Stratified photogrammetry coastal rock shelves framing beach coves, NE point & East Islet
  placeClone(coastRocksGltf, { x: -32.2, y: -0.35, z: 32.8, ry: 0.34, sx: 0.25, sy: 0.76, sz: 0.24, isCliff: true });
  registerCircleCollider(-32.2, 32.8, 1.8, -0.5, 3.0);
  placeClone(coastRocksBGltf, { x: -44.0, y: -0.25, z: 42.5, ry: 0.85, sx: 0.42, sy: 0.82, sz: 0.36, isCliff: true });
  placeClone(coastRocksBGltf, { x: 12.2, y: -0.55, z: 27.6, ry: -0.62, sx: 0.38, sy: 0.84, sz: 0.35, isCliff: true });
  registerCircleCollider(12.2, 27.6, 2.0, -0.5, 3.0);
  placeClone(coastRocksBGltf, { x: 42.8, y: -0.45, z: -78.5, ry: 0.48, sx: 0.52, sy: 1.02, sz: 0.48, isCliff: true });
  placeClone(coastRocksBGltf, { x: 52.8, y: -0.35, z: -104.0, ry: 0.25, sx: 0.58, sy: 1.08, sz: 0.52, isCliff: true });
  placeClone(coastRocksBGltf, { x: 63.2, y: -0.25, z: 59.5, ry: 0.45, sx: 0.56, sy: 0.96, sz: 0.52, isCliff: true });

  // 3) GPU-instanced mossy boulders (6 variants) along creek, breakwater sea-toe, islet, windmill & coves
  const boulderParts = extractVariantMeshes(mossBoulderGltf.scene, { isCliff: false });
  const boulderPlacements = [];

  for (let i = 0; i < 62; i += 1) {
    const z = lerp(-108.0, -26.0, rng());
    if (Math.abs(z + 44.0) < 5.0) continue;
    const side = i % 2 === 0 ? -1 : 1;
    const x = getCreekCenterX(z) + side * (2.85 + rng() * 1.55);
    const s = 0.36 + rng() * 0.34;
    boulderPlacements.push({
      x,
      y: getWorldTerrainY(x, z) - 0.14,
      z,
      ry: rng() * Math.PI * 2,
      rx: (rng() - 0.5) * 0.14,
      sx: s * (0.9 + rng() * 0.3),
      sy: s * (0.68 + rng() * 0.28),
      sz: s * (0.9 + rng() * 0.3),
      variant: i,
    });
  }

  for (let i = 0; i < 34; i += 1) {
    const bx = 46.8 + rng() * 29.0;
    const side = i % 2 === 0 ? -1 : 1;
    const bz = 10.0 + side * (3.15 + rng() * 1.05);
    const s = 0.58 + rng() * 0.42;
    boulderPlacements.push({
      x: bx,
      y: -0.52 + rng() * 0.45,
      z: bz,
      ry: rng() * Math.PI * 2,
      rx: (rng() - 0.5) * 0.25,
      sx: s * 1.1,
      sy: s * 0.72,
      sz: s * 0.95,
      variant: i + 1,
    });
  }
  for (let i = 0; i < 20; i += 1) {
    const ang = (i / 20) * Math.PI * 2;
    if (Math.cos(ang) < -0.76) continue;
    const dist = 5.35 + rng() * 1.25;
    const s = 0.65 + rng() * 0.45;
    boulderPlacements.push({
      x: 78.0 + Math.cos(ang) * dist,
      y: -0.45 + rng() * 0.42,
      z: 10.0 + Math.sin(ang) * dist,
      ry: rng() * Math.PI * 2,
      sx: s,
      sy: s * 0.75,
      sz: s,
      variant: i + 2,
    });
  }

  for (let i = 0; i < 24; i += 1) {
    const a = rng() * Math.PI * 2;
    const dist = i < 6 ? 1.5 + rng() * 3.0 : 3.4 + rng() * 5.8;
    const rx = 58.0 + Math.cos(a) * dist;
    const rz = 56.0 + Math.sin(a) * dist;
    const s = i < 6 ? 0.85 + rng() * 0.5 : 0.52 + rng() * 0.45;
    boulderPlacements.push({
      x: rx,
      y: getWorldTerrainY(rx, rz) - 0.28,
      z: rz,
      ry: rng() * Math.PI * 2,
      sx: s,
      sy: s * (i < 6 ? 1.05 : 0.74),
      sz: s,
      variant: i + 3,
    });
  }

  const wmDoorX = -52.0 + Math.cos(0.52) * 3.5;
  const wmDoorZ = -68.0 - Math.sin(0.52) * 3.5;
  for (let i = 0; i < 14; i += 1) {
    const ang = (i / 14) * Math.PI * 2;
    const dist = 3.9 + rng() * 1.5;
    const rx = -52.0 + Math.cos(ang) * dist;
    const rz = -68.0 + Math.sin(ang) * dist;
    if (Math.hypot(rx - wmDoorX, rz - wmDoorZ) < 2.8) continue;
    const s = 0.42 + rng() * 0.34;
    boulderPlacements.push({
      x: rx,
      y: getWorldTerrainY(rx, rz) - 0.14,
      z: rz,
      ry: rng() * Math.PI * 2,
      sx: s,
      sy: s * 0.72,
      sz: s,
      variant: i,
    });
  }

  for (const [cx, cz, cnt] of [
    [-25.5, 34.2, 6],
    [13.5, 24.5, 6],
    [49.8, -26.5, 6],
  ]) {
    for (let i = 0; i < cnt; i += 1) {
      const rx = cx + (rng() - 0.5) * 4.6;
      const rz = cz + (rng() - 0.5) * 3.8;
      const s = 0.48 + rng() * 0.42;
      boulderPlacements.push({
        x: rx,
        y: Math.max(-0.45, getWorldTerrainY(rx, rz) - 0.18),
        z: rz,
        ry: rng() * Math.PI * 2,
        sx: s,
        sy: s * 0.72,
        sz: s,
        variant: i,
      });
    }
  }
  for (const b of boulderPlacements) {
    const br = Math.max(b.sx, b.sz) * 0.56;
    if (b.y + b.sy * 0.9 >= 0.05) {
      registerCircleCollider(b.x, b.z, br, b.y - 1.2, b.y + b.sy * 2.2);
    }
  }
  buildInstancedVariants(sec, boulderParts, boulderPlacements);

  // 4) GPU-instanced Mediterranean coastal shrubs (4 variants) for creek banks, cliffs, cottages & islet
  const shrubParts = extractVariantMeshes(shrubGltf.scene, { isFoliage: true });
  const shrubPlacements = [];

  for (let i = 0; i < 32; i += 1) {
    const z = lerp(-106.0, -27.0, rng());
    if (Math.abs(z + 44.0) < 5.2) continue;
    const side = i % 2 === 0 ? -1 : 1;
    const x = getCreekCenterX(z) + side * (3.2 + rng() * 2.2);
    const s = 0.50 + rng() * 0.28;
    shrubPlacements.push({
      x,
      y: getWorldTerrainY(x, z) - 0.08,
      z,
      ry: rng() * Math.PI * 2,
      sx: s,
      sy: s * (0.85 + rng() * 0.22),
      sz: s,
      variant: i,
    });
  }

  for (let i = 0; i < 24; i += 1) {
    const z = lerp(-82.0, -30.5, rng());
    const x = lerp(33.5, 38.2, rng());
    const s = 0.78 + rng() * 0.52;
    shrubPlacements.push({
      x,
      y: getWorldTerrainY(x, z) - 0.10,
      z,
      ry: rng() * Math.PI * 2,
      sx: s,
      sy: s,
      sz: s,
      variant: i + 1,
    });
  }

  for (const [hx, hz, rad, hry, cw, cd] of [
    [-52.0, -68.0, 5.4, 0.52, 0, 0],
    [-78.0, -56.0, 8.8, 0.42, 8.2, 5.8],
    [-18.0, -82.0, 9.2, -0.18, 8.8, 6.0],
    [24.5, -68.0, 8.2, -0.52, 7.8, 5.6],
  ]) {
    const cosH = Math.cos(hry);
    const sinH = Math.sin(hry);
    for (let i = 0; i < 6; i += 1) {
      const a = rng() * Math.PI * 2;
      const d = rad + rng() * 1.4;
      const rx = hx + Math.cos(a) * d;
      const rz = hz + Math.sin(a) * d;
      if (cw === 0) {
        if (Math.hypot(rx - wmDoorX, rz - wmDoorZ) < 2.8) continue;
      } else {
        const dxw = rx - hx;
        const dzw = rz - hz;
        const lx = dxw * cosH - dzw * sinH;
        const lz = dxw * sinH + dzw * cosH;
        if (Math.abs(lx) < cw * 0.92 && lz > -cd * 0.6 && lz < cd * 0.6 + 6.5) continue;
        if (lx < -cw * 0.3 && Math.abs(lz + cd * 0.08) < cd * 0.55) continue;
        if (lx > cw * 0.3 && Math.abs(lz + cd * 0.12) < 2.2) continue;
      }
      const s = 0.72 + rng() * 0.42;
      shrubPlacements.push({
        x: rx,
        y: getWorldTerrainY(rx, rz) - 0.08,
        z: rz,
        ry: rng() * Math.PI * 2,
        sx: s,
        sy: s,
        sz: s,
        variant: i,
      });
    }
  }

  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + rng() * 0.4;
    const d = 1.0 + rng() * 3.6;
    const rx = 58.0 + Math.cos(a) * d;
    const rz = 56.0 + Math.sin(a) * d;
    const s = 0.72 + rng() * 0.36;
    shrubPlacements.push({
      x: rx,
      y: getWorldTerrainY(rx, rz) - 0.10,
      z: rz,
      ry: rng() * Math.PI * 2,
      sx: s,
      sy: s,
      sz: s,
      variant: i + 2,
    });
  }
  for (const sh of shrubPlacements) {
    registerCircleCollider(sh.x, sh.z, sh.sx * 0.45, sh.y - 0.8, sh.y + sh.sy * 1.8);
  }
  buildInstancedVariants(sec, shrubParts, shrubPlacements);

  // 5) Waterfront teak picnic tables on the NE harbor overlook
  for (const [tx, tz, ry] of [
    [29.0, -18.5, 0.18],
    [37.5, -15.5, -0.22],
  ]) {
    placeClone(picnicTableGltf, { x: tx, y: 1.35, z: tz, ry, sx: 1, sy: 1, sz: 1 });
    registerBoxCollider(tx - 1.15, tx + 1.15, tz - 1.5, tz + 1.5);
  }

  // 6) Maritime lifebuoys mounted on teak quay & breakwater stanchion posts
  const postMat = pbrWoodMat(0x523926, { roughness: 0.74 });
  const hookMat = pbrMetalMat(0xcba358, { roughness: 0.28, metalness: 0.84 });
  for (const [lx, lz, ry, floorY] of [
    [44.65, -18.5, -Math.PI * 0.5, 1.38],
    [44.65, 0.4, -Math.PI * 0.5, 1.38],
    [44.65, 12.2, -Math.PI * 0.5, 1.38],
    [20.4, 20.75, Math.PI, 1.38],
    [54.0, 7.85, Math.PI, 1.40],
    [68.5, 12.15, 0.0, 1.40],
  ]) {
    const backX = -Math.sin(ry) * 0.12;
    const backZ = -Math.cos(ry) * 0.12;
    registerCircleCollider(lx + backX, lz + backZ, 0.22, floorY - 0.5, floorY + 2.0);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.24, 0.11), postMat);
    post.position.set(lx + backX, floorY + 0.62, lz + backZ);
    post.castShadow = true;
    post.receiveShadow = true;
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), hookMat);
    peg.rotation.x = Math.PI * 0.5;
    peg.rotation.z = -ry;
    peg.position.set(lx + backX * 0.4, floorY + 0.92, lz + backZ * 0.4);
    sec.add(post, peg);
    placeClone(lifebuoyGltf, { x: lx, y: floorY + 0.64, z: lz, ry, sx: 0.92, sy: 0.92, sz: 0.92 });
  }

  group.add(sec);
  return sec;
}

// ---------------------------------------------------------------------------
// Public Module Orchestrator & Real-Time PBR Animation Controller
// ---------------------------------------------------------------------------

export function buildHarborAndEstate() {
  const group = new THREE.Group();
  group.name = "HarborAndEstate";

  const waterAnimList = [];
  buildCoastalTerrainAndHorizon(group);
  const courtRefs = buildCourtyardAndTrails(group, waterAnimList);
  const harborLights = buildHarborQuayAndBoathouse(group);
  const boats = buildHarborFleet(group);
  const lighthouseAnim = buildBreakwaterAndLighthouse(group);
  const gazeboAnim = buildCliffsideGazebo(group);
  buildCreekAndArchedBridge(group, waterAnimList);
  const windmillAnim = buildWindmillCottagesAndIslet(group);
  const beachRefs = buildGoldenBeachAndBoardwalk(group);
  const bollardAnim = buildPathwayBollardLamps(group);

  enablePBRShadows(group);
  const estateSkip = new Set([
    ...boats.map((b) => b.mesh),
    lighthouseAnim.rotor,
    windmillAnim.sailsRotor,
    gazeboAnim.swingPivot,
  ]);
  for (let i = 0; i < group.children.length; i += 1) {
    const child = group.children[i];
    if (child.isGroup) {
      batchStaticMeshesByMaterial(child, { skipSet: estateSkip, spatialBucketSize: 64 });
    }
  }

  const INIT_ROTOR_Y = 0.42;
  const INIT_SAILS_X = 0.18;
  lighthouseAnim.rotor.rotation.y = INIT_ROTOR_Y;
  windmillAnim.sailsRotor.rotation.x = INIT_SAILS_X;

  let wmBoost = 0.0;
  let swingAmpBoost = 0.0;
  let swingPhase = 0.0;
  let lhFlash = 0.0;
  let boatRockBoost = 0.0;
  let nightMix = 0.0;

  function applyPosesAtZero() {
    windmillAnim.sailsRotor.rotation.x = INIT_SAILS_X;
    gazeboAnim.swingPivot.rotation.z = 0.0;
    lighthouseAnim.rotor.rotation.y = INIT_ROTOR_Y;
    for (let i = 0; i < boats.length; i += 1) {
      const b = boats[i];
      const t = b.phase;
      b.mesh.position.y = b.baseY + Math.sin(t * 0.92) * 0.045;
      b.mesh.rotation.x = Math.sin(t * 1.18) * b.rollAmp;
      b.mesh.rotation.z = Math.cos(t * 0.84) * b.pitchAmp;
    }
    for (let i = 0; i < waterAnimList.length; i += 1) {
      const w = waterAnimList[i];
      w.map.offset.set(0, 0);
      w.normalMap.offset.set(0, 0);
    }
  }
  applyPosesAtZero();

  const estateInteract = buildEstateInteractables(group, {
    boats,
    lighthouseAnim,
    gazeboAnim,
    windmillAnim,
    harborLights,
    courtRefs,
    beachRefs,
    hooks: {
      boostWindmill: () => {
        wmBoost = 1.35;
      },
      swingGazebo: () => {
        swingAmpBoost = 0.34;
      },
      flashLighthouse: () => {
        lhFlash = 1.4;
      },
      rockBoats: (amt = 1.25) => {
        boatRockBoost = Math.max(boatRockBoost, amt);
      },
      getNightMix: () => nightMix,
    },
  });

  return {
    group,
    interactables: estateInteract.interactables,
    async loadCoastalPhotogrammetry() {
      return buildCoastalPhotogrammetry(group);
    },
    update(elapsed, dt) {
      const step = clamp(dt || 0.016, 0.001, 0.1);
      estateInteract.update(elapsed, step);

      // Decay interactive animation impulses smoothly
      wmBoost = Math.max(0, wmBoost * Math.exp(-step * 0.65));
      swingAmpBoost = Math.max(0, swingAmpBoost * Math.exp(-step * 0.48));
      lhFlash = Math.max(0, lhFlash * Math.exp(-step * 0.85));
      boatRockBoost = Math.max(0, boatRockBoost * Math.exp(-step * 0.72));

      // Windmill sails rotation around windshaft hub axis
      windmillAnim.sailsRotor.rotation.x += step * (0.54 + wmBoost * 2.35);

      // Gazebo floral swing pendulum motion
      swingPhase += step * (1.72 + swingAmpBoost * 0.45);
      gazeboAnim.swingPivot.rotation.z = (0.055 + swingAmpBoost) * Math.sin(swingPhase);

      // Lighthouse Fresnel lens rotor & day/night searchlight beam
      lighthouseAnim.rotor.rotation.y += step * (0.68 + lhFlash * 1.9);
      lighthouseAnim.beaconCoreMat.emissiveIntensity = lerp(2.2, 4.6, nightMix) + lhFlash * 2.4;
      lighthouseAnim.beamMat.opacity = lerp(0.035, 0.09, nightMix) + lhFlash * 0.06;
      lighthouseAnim.nightBeamMat.opacity = nightMix * (0.135 + lhFlash * 0.05);

      // Harbor boats gentle wave pitch / roll / heave driven by unified simTime
      const wakeMult = 1.0 + boatRockBoost * 2.8;
      for (let i = 0; i < boats.length; i += 1) {
        const b = boats[i];
        const t = elapsed * 1.15 + b.phase;
        b.mesh.position.y = b.baseY + Math.sin(t * 0.92) * 0.045 * wakeMult;
        b.mesh.rotation.x = Math.sin(t * 1.18) * b.rollAmp * wakeMult;
        b.mesh.rotation.z = Math.cos(t * 0.84) * b.pitchAmp * wakeMult;
      }

      // Creek & courtyard fountain ripple UV scroll
      for (let i = 0; i < waterAnimList.length; i += 1) {
        const w = waterAnimList[i];
        w.map.offset.x = (w.map.offset.x + step * w.vx) % 1;
        w.map.offset.y = (w.map.offset.y + step * w.vy) % 1;
        w.normalMap.offset.x = (w.normalMap.offset.x - step * w.vx * 0.8) % 1;
        w.normalMap.offset.y = (w.normalMap.offset.y + step * w.vy * 1.25) % 1;
      }
    },
    setNightMix(mix) {
      nightMix = clamp(mix, 0, 1);
      harborLights.lanternGlowMat.emissiveIntensity = lerp(0.62, 3.15, nightMix);
      gazeboAnim.globeMat.emissiveIntensity = lerp(0.75, 2.85, nightMix);
      windmillAnim.warmWinMat.emissiveIntensity = lerp(0.55, 2.75, nightMix);
      bollardAnim.bollardGlowMat.emissiveIntensity = lerp(0.38, 3.25, nightMix);
      bollardAnim.bollardHaloMat.opacity = nightMix * 0.62;
      bollardAnim.halos.visible = nightMix > 0.04;
      bollardAnim.gardenNightLight.intensity = lerp(0.0, 1.35, nightMix);
      bollardAnim.harborNightLight.intensity = lerp(0.0, 1.45, nightMix);
      bollardAnim.gardenNightLight.visible = nightMix > 0.01;
      bollardAnim.harborNightLight.visible = nightMix > 0.01;
      lighthouseAnim.beaconCoreMat.emissiveIntensity = lerp(2.2, 4.6, nightMix);
      lighthouseAnim.beamMat.opacity = lerp(0.035, 0.09, nightMix);
      lighthouseAnim.nightBeamMat.opacity = nightMix * 0.135;
    },
    reset() {
      wmBoost = 0.0;
      swingAmpBoost = 0.0;
      swingPhase = 0.0;
      lhFlash = 0.0;
      boatRockBoost = 0.0;
      applyPosesAtZero();
      estateInteract.reset();
    },
    boostWindmill() {
      wmBoost = 1.35;
    },
    swingGazebo() {
      swingAmpBoost = 0.34;
    },
    flashLighthouse() {
      lhFlash = 1.4;
    },
    rockBoats() {
      boatRockBoost = 1.25;
    },
  };
}

// ---------------------------------------------------------------------------
// E-key Interactables for the Estate, Harbor, Beach, Lighthouse, Gazebo & Windmill.
// Every effect is self-contained, animated in update(), and invisible (0 draw calls) at rest.
// ---------------------------------------------------------------------------

function createHeartShape(size = 1) {
  const s = new THREE.Shape();
  const k = size / 16;
  for (let i = 0; i <= 48; i += 1) {
    const t = (i / 48) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3) * k;
    const y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * k;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  return s;
}

function buildEstateInteractables(group, { boats, lighthouseAnim, gazeboAnim, windmillAnim, harborLights, courtRefs, beachRefs, hooks }) {
  const fx = createInteractionFX(group, { name: "EstateInteractionFX", maxSparks: 560, maxPetals: 220, maxRings: 16 });
  const interactables = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const T = (x, z) => getWorldTerrainY(x, z);
  const noRay = (o) => o.traverse((c) => { c.raycast = () => {}; });
  const animators = [];
  const tmpV = new THREE.Vector3();
  const yawFacing = (dx, dz) => Math.atan2(-dx, -dz); // character yaw that faces direction (dx, dz)

  const yacht = boats[0] ? boats[0].mesh : null;
  const sloop = boats[1] ? boats[1].mesh : null;
  const launch = boats[2] ? boats[2].mesh : null;

  // --- 1. Mailbox: flag wiggle + a love letter floats out ------------------------
  if (courtRefs && courtRefs.mailbox) {
    const { mailbox, flagPivot } = courtRefs;
    const envGroup = new THREE.Group();
    const envBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.16, 0.012),
      new THREE.MeshStandardMaterial({ color: 0xfff1f4, roughness: 0.7, emissive: 0x2a1418 })
    );
    const flapGeo = new THREE.BufferGeometry();
    flapGeo.setAttribute("position", new THREE.Float32BufferAttribute([-0.12, 0.08, 0.007, 0.12, 0.08, 0.007, 0, -0.01, 0.007], 3));
    flapGeo.computeVertexNormals();
    const envFlap = new THREE.Mesh(flapGeo, new THREE.MeshStandardMaterial({ color: 0xf6c9d6, roughness: 0.7, side: THREE.DoubleSide }));
    const seal = new THREE.Mesh(
      new THREE.ShapeGeometry(createHeartShape(0.03)),
      new THREE.MeshStandardMaterial({ color: 0xd2283f, roughness: 0.4, side: THREE.DoubleSide })
    );
    seal.position.set(0, -0.005, 0.009);
    envGroup.add(envBody, envFlap, seal);
    envGroup.visible = false;
    noRay(envGroup);
    mailbox.add(envGroup);
    const mbFront = new THREE.Vector3(Math.sin(0.18), 0, Math.cos(0.18));
    interactables.push({
      id: "estate-mailbox-letter",
      label: "拉起信箱小旗，取出情书",
      position: V(-10.8 + mbFront.x * 1.0, 2.22, 9.4 + mbFront.z * 1.0),
      radius: 1.8,
      floorY: 2.22,
      activate(ctx = {}) {
        envGroup.visible = true;
        fx.addTask(
          6.5,
          (u, dt, t) => {
            flagPivot.rotation.x = -Math.sin(Math.min(1, t / 0.9) * Math.PI) * 1.45 + Math.sin(t * 9) * Math.exp(-t * 2) * 0.25;
            const rise = easeOutBack(Math.min(1, t / 1.2));
            envGroup.position.set(0, 1.32 + rise * 0.5 + Math.sin(t * 2.4) * 0.03, 0.34 + rise * 0.25);
            envGroup.rotation.set(-0.15, Math.sin(t * 1.4) * 0.5, Math.sin(t * 1.9) * 0.08);
            const fade = u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1;
            envGroup.scale.setScalar(Math.max(0.001, Math.min(1, t / 0.4)) * fade * 1.4);
            if (Math.random() < dt * 12) {
              envGroup.getWorldPosition(tmpV);
              fx.spark(tmpV.x + (Math.random() - 0.5) * 0.3, tmpV.y, tmpV.z + (Math.random() - 0.5) * 0.3, 0, 0.3, 0, { color: 0xffc8d8, life: 1.1, size: 0.06 });
            }
          },
          () => {
            envGroup.visible = false;
            flagPivot.rotation.x = 0;
          }
        );
        fx.heart(V(-10.8 + mbFront.x * 0.5, 3.9, 9.4 + mbFront.z * 0.5), { count: 44, scale: 0.035, yaw: 0.18 });
        ctx.audio?.playLetterUnfold?.();
        return "小红旗一摇，一封粉色情书从信箱里飞了出来 💌";
      },
    });
  }

  // --- 2. Bicycle: ring the bell & spin the wheels --------------------------------
  if (courtRefs && courtRefs.wheels) {
    const { wheels, bell, bikeHolder } = courtRefs;
    const spin = { v: 0 };
    animators.push((elapsed, dt) => {
      if (spin.v <= 0.001) return;
      spin.v *= Math.exp(-dt * 0.55);
      for (const w of wheels) w.rotation.z -= spin.v * dt;
    });
    const side = new THREE.Vector3(Math.sin(0.48), 0, Math.cos(0.48));
    interactables.push({
      id: "estate-bicycle-bell",
      label: "按响车铃，转转车轮",
      position: V(-18.6 + side.x * 1.05, 2.22, 9.6 + side.z * 1.05),
      radius: 1.8,
      floorY: 2.22,
      activate(ctx = {}) {
        spin.v = 14;
        fx.addTask(1.2, (u, dt, t) => {
          const w = Math.sin(t * 60) * Math.exp(-t * 4);
          bell.scale.set(1 + w * 0.35, 0.72 * (1 + w * 0.35), 1 + w * 0.35);
        }, () => bell.scale.set(1, 0.72, 1));
        bell.getWorldPosition(tmpV);
        for (let k = 0; k < 3; k += 1) {
          fx.addTask(0.18 * k + 0.01, () => {}, () => {
            fx.burst(tmpV, { count: 14, colors: [0xfff1a8, 0xffffff], speed: [0.4, 0.9], up: 1.5, gravity: -0.1, size: 0.06, life: 1.2 });
          });
        }
        ctx.audio?.playTramBell?.();
        return "叮铃铃——车轮呼呼地转了起来 🚲";
      },
    });
    void bikeHolder;
  }

  // --- 3. Courtyard fountain wish -----------------------------------------------
  {
    const fcx = -4.8;
    const fcz = 9.5;
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.034, 0.034, 0.007, 16),
      new THREE.MeshStandardMaterial({ color: 0xf2c75c, metalness: 0.95, roughness: 0.22, emissive: 0x3a2804 })
    );
    coin.visible = false;
    noRay(coin);
    group.add(coin);
    interactables.push({
      id: "estate-fountain-wish",
      label: "向喷泉投币许愿",
      position: V(fcx, 2.22, fcz + 2.65),
      radius: 2.0,
      floorY: 2.22,
      activate(ctx = {}) {
        const sx = fcx;
        const sy = 3.5;
        const sz = fcz + 2.55;
        const ex = fcx + (Math.random() - 0.5) * 1.6;
        const ez = fcz + 0.9 + Math.random() * 0.5;
        coin.visible = true;
        fx.addTask(
          0.9,
          (u) => {
            coin.position.set(lerp(sx, ex, u), lerp(sy, 2.66, u) + Math.sin(u * Math.PI) * 0.8, lerp(sz, ez, u));
            coin.rotation.set(u * 16, 0, u * 6);
          },
          () => {
            coin.visible = false;
            const p = V(ex, 2.66, ez);
            fx.ripple(p, { radius: 0.6, life: 1.4, opacity: 0.8 });
            fx.ripple(p, { radius: 1.0, life: 1.8, delay: 0.2, opacity: 0.5 });
            fx.burst(p, { count: 30, colors: [0xffe08a, 0xffffff], speed: [0.6, 1.4], up: 1.2, gravity: 0.6, size: 0.07, life: 1.6, flicker: 0.4 });
            // jet surge: fountain crown shoots a glittering water column
            fx.emit(2.6, 110, () => {
              const a = Math.random() * Math.PI * 2;
              const r = Math.random() * 0.25;
              fx.spark(fcx, 2.22 + 2.62, fcz, Math.cos(a) * (0.5 + r * 3), 3.2 + Math.random() * 1.6, Math.sin(a) * (0.5 + r * 3), {
                color: Math.random() < 0.7 ? 0xe6fbff : 0xfff1b8,
                life: 1.4,
                size: 0.07,
                gravity: 4.2,
                drag: 0.2,
              });
            });
          }
        );
        ctx.audio?.playVendingClink?.();
        return "硬币落入喷泉，水柱欢快地高高跃起 ⛲";
      },
    });
  }

  // --- 4. Lighthouse flash ---------------------------------------------------------
  interactables.push({
    id: "estate-lighthouse-flash",
    label: "点亮灯塔，扫过海面",
    position: V(73.6, 1.38, 10.0),
    radius: 2.8,
    floorY: 1.38,
    activate(ctx = {}) {
      hooks.flashLighthouse();
      lighthouseAnim.rotor.getWorldPosition(tmpV);
      const top = tmpV.clone();
      for (let k = 0; k < 3; k += 1) {
        fx.addTask(0.35 * k + 0.01, () => {}, () => {
          fx.burst(top, { count: 50, colors: [0xfff4c2, 0xffe08a, 0xffffff], speed: [1.5, 3.5], up: 0.0, hemi: false, gravity: 0.3, size: 0.22, life: 2.0 });
          fx.ripple(V(78, 1.4, 10), { radius: 4.2, life: 1.5, opacity: 0.6, color: 0xfff1c0 });
        });
      }
      ctx.audio?.playLighthouseBell?.();
      return "灯塔光束扫过海面，为远航的船只照亮归途 🗼";
    },
  });

  // --- 5. Sloop: board, hoist the mainsail, rock -----------------------------------
  if (sloop) {
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 10.2, 0, -4.3, 0, 0], 3));
    sailGeo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0], 2));
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({ color: 0xfbf7ee, roughness: 0.82, side: THREE.DoubleSide }));
    sail.position.set(0.88, 2.42, 0);
    sail.scale.set(1, 0.02, 1);
    sail.visible = false;
    noRay(sail);
    sloop.add(sail);
    const sailState = { up: 0, target: 0, hold: 0 };
    animators.push((elapsed, dt) => {
      if (sailState.hold > 0) {
        sailState.hold -= dt;
        if (sailState.hold <= 0) sailState.target = 0;
      }
      sailState.up += (sailState.target - sailState.up) * Math.min(1, dt * 1.2);
      sail.visible = sailState.up > 0.03;
      sail.scale.set(1 + Math.sin(elapsed * 1.3) * 0.03 * sailState.up, Math.max(0.02, sailState.up), 1);
      sail.rotation.y = Math.sin(elapsed * 0.6) * 0.08 * sailState.up;
    });
    interactables.push({
      id: "estate-sloop-sail",
      label: "登上帆船，扬帆摇荡",
      position: V(49.5, 1.15, 3.0),
      radius: 2.8,
      floorY: 1.15,
      pose: {
        type: "sit",
        attachTo: sloop,
        seats: [
          { x: -2.2, y: 1.0, z: -0.66, yaw: Math.PI },
          { x: -2.9, y: 1.0, z: -0.66, yaw: Math.PI },
        ],
      },
      activate(ctx = {}) {
        hooks.rockBoats(1.25);
        sailState.target = 1;
        sailState.hold = 22;
        sloop.getWorldPosition(tmpV);
        for (let k = 0; k < 4; k += 1) fx.ripple(V(tmpV.x, 0.04, tmpV.z), { radius: 3.5 + k * 1.2, life: 2.6, delay: k * 0.4, opacity: 0.5 });
        ctx.audio?.playShipBell?.();
        return "白帆缓缓升起，小船随着海浪轻轻摇晃 ⛵";
      },
    });
  }

  // --- 6. Launch dinghy ride ------------------------------------------------------
  if (launch) {
    interactables.push({
      id: "estate-launch-ride",
      label: "坐上小艇摇一摇",
      position: V(32.0, 0.45, 24.2),
      radius: 2.8,
      floorY: 0.45,
      pose: {
        type: "sit",
        attachTo: launch,
        seats: [
          { x: -0.65, y: 0.6, z: -0.42, yaw: -Math.PI / 2 },
          { x: -0.65, y: 0.6, z: 0.42, yaw: -Math.PI / 2 },
        ],
      },
      activate(ctx = {}) {
        hooks.rockBoats(1.6);
        launch.getWorldPosition(tmpV);
        for (let k = 0; k < 4; k += 1) fx.ripple(V(tmpV.x, 0.04, tmpV.z), { radius: 2.4 + k * 1.0, life: 2.2, delay: k * 0.35, opacity: 0.55 });
        fx.burst(V(tmpV.x + 3.0, 0.3, tmpV.z), { count: 40, colors: [0xe8fbff, 0xffffff], speed: [1.0, 2.2], up: 1.0, gravity: 4.0, size: 0.07, life: 1.0 });
        ctx.audio?.playShipBell?.();
        return "小艇左摇右晃，溅起一串晶莹的浪花 🚤";
      },
    });
  }

  // --- 7. Yacht horn ------------------------------------------------------------------
  if (yacht) {
    interactables.push({
      id: "estate-yacht-horn",
      label: "拉响游艇汽笛",
      position: V(47.2, 1.38, -3.6),
      radius: 2.8,
      floorY: 1.38,
      activate(ctx = {}) {
        hooks.rockBoats(1.0);
        const stack = V(-1.76, 3.7, 0);
        yacht.localToWorld(stack);
        fx.emit(2.0, 45, () => {
          fx.spark(stack.x + (Math.random() - 0.5) * 0.2, stack.y, stack.z + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.4, 1.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4, {
            color: 0xf4f6f8,
            life: 1.8,
            size: 0.2,
            drag: 1.2,
          });
        });
        yacht.getWorldPosition(tmpV);
        for (let k = 0; k < 3; k += 1) fx.ripple(V(tmpV.x, 0.04, tmpV.z), { radius: 5 + k * 1.5, life: 2.6, delay: k * 0.45, opacity: 0.45 });
        ctx.audio?.playShipBell?.();
        return "呜——游艇汽笛声回荡在港湾 🛥️";
      },
    });
  }

  // --- 8. Windmill boost ------------------------------------------------------------
  {
    const dx = Math.cos(0.52);
    const dz = -Math.sin(0.52);
    const wx = -52.0 + dx * 5.1;
    const wz = -68.0 + dz * 5.1;
    interactables.push({
      id: "estate-windmill-spin",
      label: "推一把，让风车转起来",
      position: V(wx, T(wx, wz), wz),
      radius: 3.0,
      activate(ctx = {}) {
        hooks.boostWindmill();
        windmillAnim.sailsRotor.getWorldPosition(tmpV);
        fx.petalBurst(tmpV, { count: 70, radius: 2.5, up: 0.4, speed: [1.0, 2.6], floorY: T(wx, wz) + 0.03, life: 7, colors: [0xffffff, 0xd8c4ff, 0xfff0a8, 0xffc4d8] });
        fx.burst(tmpV, { count: 40, colors: [0xfff6d8, 0xffffff], speed: [1.5, 3.0], hemi: false, up: 0, gravity: 0.4, size: 0.12, life: 1.6 });
        ctx.audio?.playRoofChime?.(true);
        return "风车呼呼地转起来，把花瓣吹向整片花海 🌬️";
      },
    });
  }

  // --- 9. Gazebo floral swing ---------------------------------------------------------
  interactables.push({
    id: "estate-gazebo-swing",
    label: "坐上海岬花亭秋千",
    position: V(-64.0 + 1.4, 8.08, 42.0 - 1.0),
    radius: 2.6,
    floorY: 8.08,
    pose: {
      type: "sit",
      attachTo: gazeboAnim.swingPivot,
      seats: [
        { x: 0.04, y: -2.79, z: -0.42, yaw: -Math.PI / 2 },
        { x: 0.04, y: -2.79, z: 0.42, yaw: -Math.PI / 2 },
      ],
    },
    activate(ctx = {}) {
      hooks.swingGazebo();
      fx.addTask(3.0, (u) => {
        gazeboAnim.globeMat.emissiveIntensity = Math.max(gazeboAnim.globeMat.emissiveIntensity, 3.4 * (1 - u));
      });
      fx.petalBurst(V(-64, 8.08 + 3.2, 42), { count: 60, radius: 1.8, up: 0.3, floorY: 8.1, life: 6.5 });
      fx.heart(V(-64, 8.08 + 2.2, 42), { count: 48, scale: 0.05, yaw: 0.65 + Math.PI / 2 });
      ctx.audio?.playPetalGlissando?.();
      return "花亭秋千荡向大海，玫瑰花瓣随风飘洒 🌹";
    },
  });

  // --- 10. Sit on the boardwalk steps facing the sea --------------------------------
  if (beachRefs) {
    const sb = beachRefs.stepBaseY;
    const stepTop = sb - 0.36 + 0.055;
    const cxs = -9.15 - 0.28;
    const czs = 33.85 + 0.36;
    const along = new THREE.Vector2(Math.cos(0.58), -Math.sin(0.58));
    const face = new THREE.Vector2(-0.28, 0.36).normalize();
    const yaw = yawFacing(face.x, face.y);
    interactables.push({
      id: "estate-boardwalk-steps-sit",
      label: "坐在栈道台阶上看海",
      position: V(-8.75, beachRefs.boardwalkTopY, 33.4),
      radius: 1.9,
      floorY: beachRefs.boardwalkTopY,
      pose: {
        type: "sit",
        seats: [
          { x: cxs - along.x * 0.36, y: stepTop, z: czs - along.y * 0.36, yaw },
          { x: cxs + along.x * 0.36, y: stepTop, z: czs + along.y * 0.36, yaw },
        ],
      },
      activate(ctx = {}) {
        const sea = V(cxs + face.x * 6, 0.05, czs + face.y * 6);
        for (let k = 0; k < 4; k += 1) fx.ripple(sea, { radius: 1.5 + k * 1.0, life: 2.8, delay: k * 0.6, opacity: 0.4 });
        fx.heart(V(cxs + face.x * 1.5, stepTop + 1.4, czs + face.y * 1.5), { count: 44, scale: 0.04, yaw: Math.atan2(face.x, face.y) });
        ctx.audio?.playShipBell?.();
        return "并肩坐在栈道台阶上，听海浪一声声拍岸 🌊";
      },
    });

    // --- 11. Lie on the teak deck loungers + pop the parasol open ---------------------
    const loungerSeats = beachRefs.loungerSpots.map(({ lx, lz, lyaw }) => ({
      x: lx + Math.sin(lyaw) * -0.10,
      y: beachRefs.deckY + 0.44,
      z: lz + Math.cos(lyaw) * -0.10,
      yaw: lyaw,
      recline: 0.36,
    }));
    const parasol = beachRefs.deckParasol;
    interactables.push({
      id: "estate-deck-lounger",
      label: "躺在躺椅上晒太阳",
      position: V(3.08, beachRefs.deckY, 34.45),
      radius: 2.0,
      floorY: beachRefs.deckY,
      pose: { type: "lie", seats: loungerSeats },
      activate(ctx = {}) {
        fx.addTask(1.6, (u) => {
          const close = u < 0.3 ? 1 - u / 0.3 : 0;
          const open = u >= 0.3 ? easeOutBack((u - 0.3) / 0.7) : 0;
          const r = Math.max(0.15, close * 1 + open);
          parasol.scale.set(r, 1, r);
          parasol.rotation.y = u * Math.PI * 1.5;
        }, () => parasol.scale.set(1, 1, 1));
        fx.burst(V(3.08, beachRefs.deckY + 2.6, 35.12), { count: 50, colors: [0xfff4b8, 0xffe08a, 0xffffff], speed: [0.8, 2.0], hemi: false, up: 0.2, gravity: 0.3, size: 0.1, life: 1.8 });
        ctx.audio?.playDuetArpeggio?.();
        return "撑开遮阳伞，躺在躺椅上晒一场温柔的日光浴 ☀️";
      },
    });
  }

  // --- 12. Skip stones on the golden beach -------------------------------------------
  {
    const bx = -19.0;
    let shoreZ = 40.0;
    for (let z = 26; z < 62; z += 0.25) {
      if (T(bx, z) < 0.06) {
        shoreZ = z;
        break;
      }
    }
    const standZ = shoreZ - 1.6;
    const stone = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 10, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.6 })
    );
    stone.scale.set(1, 0.38, 0.8);
    stone.visible = false;
    noRay(stone);
    group.add(stone);
    interactables.push({
      id: "estate-skip-stones",
      label: "在海边打水漂",
      position: V(bx, T(bx, standZ), standZ),
      radius: 2.4,
      activate(ctx = {}) {
        const hops = 6;
        const start = V(bx + 0.2, T(bx, standZ) + 1.0, standZ + 0.4);
        const heading = (Math.random() - 0.5) * 0.5;
        const dirX = Math.sin(heading);
        const dirZ = Math.cos(heading);
        const pts = [start];
        let d = 2.4;
        let acc = 0;
        for (let h = 0; h < hops; h += 1) {
          acc += d;
          pts.push(V(start.x + dirX * acc, 0.02, standZ + 0.4 + dirZ * acc));
          d *= 0.72;
        }
        const segDur = 0.32;
        stone.visible = true;
        fx.addTask(
          segDur * hops,
          (u) => {
            const f = u * hops;
            const i = Math.min(hops - 1, Math.floor(f));
            const lu = f - i;
            const a = pts[i];
            const b = pts[i + 1];
            const hgt = (i === 0 ? 0.4 : 0.5 * Math.pow(0.6, i)) * Math.sin(lu * Math.PI);
            stone.position.set(lerp(a.x, b.x, lu), lerp(a.y, b.y, lu) + hgt, lerp(a.z, b.z, lu));
            stone.rotation.y += 0.5;
            if (!stone.userData.hit) stone.userData.hit = new Set();
            if (lu > 0.92 && !stone.userData.hit.has(i)) {
              stone.userData.hit.add(i);
              fx.ripple(b, { radius: 0.9, life: 1.6, opacity: 0.75 });
              fx.burst(b, { count: 10, colors: [0xffffff, 0xd8f4ff], speed: [0.5, 1.1], up: 1.5, gravity: 4, size: 0.05, life: 0.6 });
            }
          },
          () => {
            stone.visible = false;
            stone.userData.hit = null;
          }
        );
        ctx.audio?.playFishRipple?.();
        return "石子在海面上跳了六下——水漂打得真漂亮 🪨";
      },
    });
  }

  // --- 13. Release a sky lantern from the over-water deck ------------------------------
  {
    const lanternGeo = new THREE.LatheGeometry(
      [new THREE.Vector2(0.13, 0), new THREE.Vector2(0.2, 0.12), new THREE.Vector2(0.23, 0.32), new THREE.Vector2(0.2, 0.5), new THREE.Vector2(0.001, 0.56)],
      14
    );
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xffd7a0,
      emissive: new THREE.Color(0xff8a2a),
      emissiveIntensity: 1.6,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const lanterns = [];
    for (let i = 0; i < 5; i += 1) {
      const m = new THREE.Mesh(lanternGeo, lanternMat);
      m.visible = false;
      noRay(m);
      group.add(m);
      lanterns.push({ mesh: m, t: 0, on: false });
    }
    let li = 0;
    animators.push((elapsed, dt) => {
      lanternMat.emissiveIntensity = 1.5 + Math.sin(elapsed * 13) * 0.15 + Math.sin(elapsed * 7.3) * 0.1;
      for (const L of lanterns) {
        if (!L.on) continue;
        L.t += dt;
        const t = L.t;
        L.mesh.position.set(L.x + Math.sin(t * 0.4 + L.ph) * 0.6 + t * 0.12, L.y + Math.min(t, 1.5) * 0.4 + Math.max(0, t - 1.5) * 0.85, L.z + t * 0.35);
        L.mesh.rotation.y = t * 0.3;
        L.mesh.rotation.z = Math.sin(t * 0.9 + L.ph) * 0.08;
        if (Math.random() < dt * 6) fx.spark(L.mesh.position.x, L.mesh.position.y + 0.05, L.mesh.position.z, 0, -0.2, 0, { color: 0xffb060, life: 0.8, size: 0.08 });
        if (t > 40) {
          L.on = false;
          L.mesh.visible = false;
        }
      }
    });
    interactables.push({
      id: "estate-sky-lantern",
      label: "一起放飞孔明灯",
      position: V(2.6, 1.18, 34.6),
      radius: 2.4,
      floorY: 1.18,
      activate(ctx = {}) {
        const L = lanterns[li % lanterns.length];
        li += 1;
        Object.assign(L, { on: true, t: 0, x: 2.6 + (Math.random() - 0.5) * 0.6, y: 1.18 + 1.2, z: 35.2, ph: Math.random() * 6 });
        L.mesh.visible = true;
        L.mesh.position.set(L.x, L.y, L.z);
        fx.burst(V(L.x, L.y + 0.3, L.z), { count: 30, colors: [0xffc070, 0xfff0c0], speed: [0.4, 1.0], gravity: -0.2, size: 0.07, life: 1.6 });
        ctx.audio?.playDuetArpeggio?.();
        const n = ctx.actor === "ran" ? "小冉子" : "小贤贤";
        return `${n}写下心愿，孔明灯缓缓飞向星空 🏮`;
      },
    });
  }

  // --- 14. Heart balloon on the harbor promenade -----------------------------------------
  {
    const heartGeo = new THREE.ExtrudeGeometry(createHeartShape(0.3), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 3, curveSegments: 10 });
    heartGeo.center();
    heartGeo.rotateZ(Math.PI);
    const heartMat = new THREE.MeshPhysicalMaterial({ color: 0xe8264f, roughness: 0.25, clearcoat: 1.0, clearcoatRoughness: 0.1, emissive: 0x3a0610 });
    const stringGeo = new THREE.BufferGeometry().setFromPoints([V(0, -0.32, 0), V(0.04, -0.8, 0), V(-0.02, -1.3, 0)]);
    const stringMat = new THREE.LineBasicMaterial({ color: 0xf6f0f0 });
    const balloons = [];
    for (let i = 0; i < 4; i += 1) {
      const b = new THREE.Group();
      b.add(new THREE.Mesh(heartGeo, heartMat), new THREE.Line(stringGeo, stringMat));
      b.visible = false;
      noRay(b);
      group.add(b);
      balloons.push({ g: b, on: false, t: 0 });
    }
    let bi = 0;
    animators.push((elapsed, dt) => {
      for (const B of balloons) {
        if (!B.on) continue;
        B.t += dt;
        const t = B.t;
        B.g.position.set(B.x + Math.sin(t * 0.7 + B.ph) * 0.5 - t * 0.15, B.y + t * 0.9 + Math.sin(t * 1.6) * 0.05, B.z + Math.cos(t * 0.5 + B.ph) * 0.4 + t * 0.2);
        B.g.rotation.set(Math.sin(t * 1.1) * 0.12, Math.sin(t * 0.6 + B.ph) * 0.9, Math.sin(t * 1.4) * 0.1);
        const s = Math.min(1, t / 0.4);
        B.g.scale.setScalar(s);
        if (t > 35) {
          B.on = false;
          B.g.visible = false;
        }
      }
    });
    interactables.push({
      id: "estate-heart-balloon",
      label: "放飞爱心气球",
      position: V(22.4, 1.36, 11.9),
      radius: 2.2,
      floorY: 1.36,
      activate(ctx = {}) {
        const B = balloons[bi % balloons.length];
        bi += 1;
        Object.assign(B, { on: true, t: 0, x: 22.4, y: 1.36 + 2.2, z: 11.6, ph: Math.random() * 6 });
        B.g.visible = true;
        B.g.position.set(B.x, B.y, B.z);
        fx.heart(V(B.x, B.y, B.z), { count: 40, scale: 0.04 });
        ctx.audio?.playPetalGlissando?.();
        return "红色爱心气球乘着海风飞上天空 🎈";
      },
    });
  }

  // --- 15. Harbor bistro date (sit at the parasol table) ----------------------------------
  {
    const tx = 16.2;
    const tz = 6.2;
    const seats = [0.4, 2.5].map((ca) => ({
      x: tx + Math.cos(ca) * 0.96,
      y: 1.36 + 0.48,
      z: tz + Math.sin(ca) * 0.96,
      yaw: Math.atan2(Math.cos(ca), Math.sin(ca)),
    }));
    interactables.push({
      id: "estate-harbor-bistro-sit",
      label: "在港湾小圆桌边约会",
      position: V(tx, 1.36, tz + 1.75),
      radius: 2.0,
      floorY: 1.36,
      pose: { type: "sit", seats },
      activate(ctx = {}) {
        const c = V(tx + 0.12, 1.36 + 0.95, tz - 0.08);
        fx.petalBurst(c, { count: 30, radius: 0.15, up: 1.4, speed: [0.3, 0.8], floorY: 1.38, life: 5 });
        fx.heart(V(tx, 1.36 + 1.7, tz), { count: 40, scale: 0.035 });
        fx.burst(c, { count: 16, colors: [0xfff4c8, 0xffffff], speed: [0.3, 0.7], gravity: 0.1, size: 0.06, life: 1.2 });
        ctx.audio?.playVendingClink?.();
        return "碰杯——海风、阳光和你，刚刚好 🥂";
      },
    });
  }

  // --- 16. Boathouse espresso bar (sit on the oak benches) --------------------------------
  {
    const tx = 20.4;
    const tz = -9.5;
    interactables.push({
      id: "estate-cafe-espresso",
      label: "坐下来喝一杯咖啡",
      position: V(21.9, 1.38, -8.1),
      radius: 2.0,
      floorY: 1.38,
      pose: {
        type: "sit",
        seats: [
          { x: tx, y: 1.85, z: tz + 1.05, yaw: 0 },
          { x: tx, y: 1.85, z: tz - 1.05, yaw: Math.PI },
        ],
      },
      activate(ctx = {}) {
        fx.emit(5.0, 26, (i) => {
          const off = i % 2 === 0 ? -0.08 : 0.1;
          fx.spark(tx + off + (Math.random() - 0.5) * 0.04, 2.2, tz + (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.06, 0.32 + Math.random() * 0.12, (Math.random() - 0.5) * 0.06, {
            color: 0xf2f2f2,
            life: 2.0,
            size: 0.06,
            drag: 0.2,
          });
        });
        ctx.audio?.playVendingClink?.();
        return "两杯拿铁冒着热气，拉花是一颗心 ☕";
      },
    });
  }

  // --- 17. Scatter petals from the creek footbridge -> they float downstream --------------
  {
    const bx = 8.4;
    const bz = -44.0;
    const deckY = T(bx, bz) + 1.85;
    const creekY = (z) => T(getCreekCenterX(z), z) + 0.36 + 0.012;
    const flowFn = (p, dt) => {
      p.z += 0.75 * dt;
      p.x += (getCreekCenterX(p.z) + p.wx - p.x) * Math.min(1, dt * 0.8);
      p.y = creekY(p.z);
      if (p.z > -26) p.life = Math.min(p.life, 0.5);
    };
    interactables.push({
      id: "estate-creek-bridge-petals",
      label: "在拱桥上撒下花瓣",
      position: V(bx, deckY, bz),
      radius: 2.2,
      floorY: deckY,
      activate(ctx = {}) {
        const cx = getCreekCenterX(bz);
        for (let i = 0; i < 60; i += 1) {
          const sx = lerp(bx, cx, 0.6) + (Math.random() - 0.5) * 1.2;
          const sz = bz + (Math.random() - 0.5) * 1.6;
          const p = fx.petal(sx, deckY + 1.2 + Math.random() * 0.4, sz, (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6, {
            color: [0xfad4e0, 0xfff5f8, 0xeb7696, 0xf6c2d2][i % 4],
            life: 18 + Math.random() * 6,
            floorY: creekY(sz),
            flowFn,
            scale: 1.3,
          });
          p.wx = (Math.random() - 0.5) * 2.4;
        }
        ctx.audio?.playPetalGlissando?.();
        return "花瓣落在溪面上，顺着流水慢慢漂远 🌸";
      },
    });
  }

  // --- 18. Festoon string lights along the harbor promenade --------------------------------
  {
    const postZ = [-21.5, -12.0, -2.5, 5.8, 17.5];
    const hy = 1.36 + 3.32;
    const per = 12;
    const bulbPts = [];
    const wirePts = [];
    for (let s = 0; s < postZ.length - 1; s += 1) {
      for (let k = 0; k <= per; k += 1) {
        const u = k / per;
        const z = lerp(postZ[s], postZ[s + 1], u);
        const y = hy - Math.sin(u * Math.PI) * 0.75;
        const x = 44.2 - 0.08;
        wirePts.push(V(x, y, z));
        if (k > 0 && k < per) bulbPts.push(V(x, y - 0.07, z));
      }
    }
    const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(wirePts), new THREE.LineBasicMaterial({ color: 0x2b2622 }));
    noRay(wire);
    group.add(wire);
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbPts.length);
    bulbs.name = "HarborFestoonBulbs";
    const off = new THREE.Color(0x6e6556);
    const on = new THREE.Color(0xffd98a);
    const dm = new THREE.Object3D();
    bulbPts.forEach((p, i) => {
      dm.position.copy(p);
      dm.updateMatrix();
      bulbs.setMatrixAt(i, dm.matrix);
      bulbs.setColorAt(i, off);
    });
    bulbs.instanceColor.needsUpdate = true;
    noRay(bulbs);
    group.add(bulbs);
    const lights = { lit: false, level: new Float32Array(bulbPts.length), chase: -1 };
    const c = new THREE.Color();
    animators.push((elapsed, dt) => {
      let changed = false;
      for (let i = 0; i < bulbPts.length; i += 1) {
        const target = lights.lit && lights.chase >= i ? 1 : 0;
        const lv = lights.level[i];
        if (Math.abs(target - lv) > 0.002) {
          lights.level[i] = lv + (target - lv) * Math.min(1, dt * 6);
          changed = true;
        }
      }
      if (lights.lit && lights.chase < bulbPts.length) {
        lights.chase += dt * 22;
        changed = true;
      }
      if (lights.lit) {
        // gentle twinkle
        for (let i = 0; i < bulbPts.length; i += 1) {
          c.copy(off).lerp(on, lights.level[i] * (0.9 + 0.1 * Math.sin(elapsed * 3 + i * 1.7)));
          bulbs.setColorAt(i, c);
        }
        bulbs.instanceColor.needsUpdate = true;
      } else if (changed) {
        for (let i = 0; i < bulbPts.length; i += 1) {
          c.copy(off).lerp(on, lights.level[i]);
          bulbs.setColorAt(i, c);
        }
        bulbs.instanceColor.needsUpdate = true;
      }
    });
    interactables.push({
      id: "estate-harbor-string-lights",
      label: "点亮港湾串灯",
      position: V(43.0, 1.36, 4.6),
      radius: 2.6,
      floorY: 1.36,
      activate(ctx = {}) {
        lights.lit = !lights.lit;
        lights.chase = lights.lit ? 0 : -1;
        if (lights.lit) {
          harborLights.lanternGlowMat.emissiveIntensity = Math.max(harborLights.lanternGlowMat.emissiveIntensity, 2.6);
          fx.burst(V(44.1, hy - 0.3, 5.8), { count: 40, colors: [0xffd98a, 0xfff4d0], speed: [0.6, 1.4], hemi: false, up: 0, gravity: 0.5, size: 0.08, life: 1.4 });
        }
        ctx.audio?.playRoofChime?.(lights.lit);
        return lights.lit ? "一串暖黄的小灯沿着港湾依次亮起 ✨" : "串灯熄灭了，只剩月光与海浪 🌙";
      },
    });
  }

  // --- 19. Lie on the lighthouse bastion & watch shooting stars ---------------------------
  interactables.push({
    id: "estate-stargaze",
    label: "躺在灯塔下看流星",
    position: V(78.0, 1.38, 13.3),
    radius: 2.2,
    floorY: 1.38,
    pose: {
      type: "lie",
      seats: [
        { x: 77.45, y: 1.42, z: 13.5, yaw: Math.PI },
        { x: 78.55, y: 1.42, z: 13.5, yaw: Math.PI },
      ],
    },
    activate(ctx = {}) {
      const night = hooks.getNightMix();
      for (let m = 0; m < 4; m += 1) {
        const sx = 40 + Math.random() * 60;
        const sy = 34 + Math.random() * 16;
        const sz = 55 + Math.random() * 30;
        const vx = -(18 + Math.random() * 10);
        const vy = -(6 + Math.random() * 4);
        const streak = () =>
          fx.addTask(0.9, (u) => {
            const x = sx + vx * u;
            const y = sy + vy * u;
            for (let k = 0; k < 3; k += 1) {
              fx.spark(x - vx * 0.012 * k, y - vy * 0.012 * k, sz, 0, 0, 0, { color: k === 0 ? 0xffffff : 0xcfe4ff, life: 0.55, size: 0.9 - k * 0.2, drag: 0 });
            }
          });
        fx.addTask(m * 0.7 + 0.01, () => {}, streak); // stagger meteors
      }
      fx.burst(V(78, 3.0, 13.5), { count: 40, colors: [0xcfe4ff, 0xffffff, 0xfff1c0], speed: [0.3, 0.9], gravity: -0.05, size: 0.07, life: 3.5, flicker: 0.8 });
      ctx.audio?.playDuetArpeggio?.();
      return night > 0.4 ? "一颗流星划过夜空——快许愿！🌠" : "躺在灯塔下看云，等夜里的流星雨 🌠";
    },
  });

  return {
    interactables,
    update(elapsed, dt) {
      fx.update(dt, elapsed);
      for (let i = 0; i < animators.length; i += 1) animators[i](elapsed, dt);
    },
    reset() {
      fx.clear();
    },
  };
}
