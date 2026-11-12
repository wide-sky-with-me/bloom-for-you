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
  registerCircleCollider,
  tagInteractive,
  enablePBRShadows,
} from "./pbr-kit.js";
import { createRoseBouquet } from "./botanical-flora.js";

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
  const cCliffLight = new THREE.Color(0x9c968a);
  const cCliffDark = new THREE.Color(0x847f75);
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

    if (y < -0.25) {
      const depthT = smoothstep(-0.25, -4.4, y);
      tmpA.copy(cShallowBed).lerp(cDeepBed, depthT);
    } else if (y < 1.55 && !inQuay) {
      const sandT = smoothstep(-0.25, 1.38, y);
      tmpA.copy(cWetSand).lerp(cDrySand, sandT);
      if (y > 1.15) {
        const grassEdge = smoothstep(1.15, 1.55, y);
        tmpB.copy(cGrassMid).lerp(cGrassSun, clamp(n1 * 0.5 + 0.5, 0, 1));
        tmpA.lerp(tmpB, grassEdge);
      }
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

    // Steep coastal cliffs & rocky limestone slopes (normal.y < 0.76)
    if (ny < 0.82 && y > -1.8) {
      const rockWeight = smoothstep(0.82, 0.58, ny);
      const strata = 0.5 + 0.5 * Math.sin(y * 2.3 + n2 * 2.2);
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

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.userData.noCastShadow = true;
  terrainMesh.name = "CoastalPeninsulaTerrain";
  parent.add(terrainMesh);

  // Distant Misty Coastal Mountain & Peninsula Amphitheater (radius 780m - 1120m)
  const buildMountainRing = (innerR, outerR, segs, maxH, baseHex, crestHex, seedOff) => {
    const geo = new THREE.BufferGeometry();
    const positions = [];
    const vColors = [];
    const uvs = [];
    const indices = [];
    const cBase = new THREE.Color(baseHex);
    const cCrest = new THREE.Color(crestHex);
    const cTmp = new THREE.Color();

    const radialSteps = 5;
    for (let r = 0; r <= radialSteps; r += 1) {
      const rt = r / radialSteps;
      const profile = Math.sin(rt * Math.PI);
      for (let s = 0; s <= segs; s += 1) {
        const u = s / segs;
        const ang = u * Math.PI * 2;
        const ridge =
          0.46 * Math.sin(ang * 5.0 + seedOff) +
          0.31 * Math.cos(ang * 11.0 - seedOff * 1.7) +
          0.16 * Math.sin(ang * 23.0 + 1.1) +
          0.09 * Math.cos(ang * 37.0 - 0.6);

        // Leave a lower dramatic open-bay horizon channel to East-Southeast (ang ~ 0.35 rad)
        const seaChannelDip = 1.0 - 0.68 * Math.exp(-Math.pow(Math.sin((ang - 0.32) * 0.5), 2) / 0.045);
        const radius = lerp(innerR, outerR, rt) + 26.0 * Math.sin(ang * 7.0 + rt * 2.0);
        const hPeak = Math.max(6.0, maxH * (0.52 + 0.48 * ridge) * seaChannelDip);
        const y = -8.0 + (hPeak + 8.0) * Math.pow(profile, 0.78);

        positions.push(Math.cos(ang) * radius, y, Math.sin(ang) * radius);
        uvs.push(u * 12, rt);
        const hFactor = clamp(y / Math.max(maxH, 1), 0, 1);
        cTmp.copy(cBase).lerp(cCrest, smoothstep(0.18, 0.88, hFactor));
        vColors.push(cTmp.r, cTmp.g, cTmp.b);
      }
    }

    const stride = segs + 1;
    for (let r = 0; r < radialSteps; r += 1) {
      for (let s = 0; s < segs; s += 1) {
        const a = r * stride + s;
        const b = a + 1;
        const c = (r + 1) * stride + s;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(vColors, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.noShadow = true;
    return mesh;
  };

  parent.add(buildMountainRing(780, 945, 160, 96, 0x5c7b83, 0x7b98a1, 0.7));
  parent.add(buildMountainRing(930, 1120, 160, 148, 0x79959e, 0x9ab2ba, 2.4));
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

  // Paved Villa Front Flagstone Courtyard: X in [-20, +4], Z in [+6.8, +12.2], Y = +2.22m
  const courtSlab = new THREE.Mesh(new THREE.BoxGeometry(24.0, 0.16, 5.4), flagstoneMat);
  courtSlab.position.set(-8.0, 2.14, 9.5);
  sec.add(courtSlab);

  // Connecting entrance walk south & fountain apron: X in [-16, -2], Z in [+2.0, +6.8]
  const fountainApron = new THREE.Mesh(new THREE.BoxGeometry(14.0, 0.15, 5.2), flagstoneMat);
  fountainApron.position.set(-9.0, 2.135, 4.4);
  sec.add(fountainApron);

  registerWalkZone((x, z) => {
    if (x >= -20.0 && x <= 4.0 && z >= 6.8 && z <= 12.2) return 2.22;
    if (x >= -16.0 && x <= -2.0 && z >= 1.8 && z <= 6.8) return 2.21;
    if (x >= 2.0 && x <= 10.0 && z >= -2.2 && z <= 8.2) {
      return lerp(2.22, 1.36, smoothstep(2.0, 9.8, x));
    }
    return null;
  });

  // Stepped/sloped limestone ramp from Courtyard (X=+2, Y=2.22) to Harbor Quay (X=+10, Y=1.36)
  const rampGeos = [];
  const rampSteps = 10;
  for (let i = 0; i < rampSteps; i += 1) {
    const t0 = i / rampSteps;
    const t1 = (i + 1) / rampSteps;
    const xm = lerp(2.0, 10.0, (t0 + t1) * 0.5);
    const ym = lerp(2.22, 1.36, smoothstep(0, 1, (t0 + t1) * 0.5));
    const g = new THREE.BoxGeometry(0.92, 0.28, 5.4);
    g.rotateZ(-0.105);
    g.translate(xm, ym - 0.12, 3.2);
    rampGeos.push(g);
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

  const trailsMesh = new THREE.Mesh(safeMerge(rampGeos), trailStoneMat);
  sec.add(trailsMesh);

  // 3-Tier Carved Limestone Courtyard Fountain at (-4.5, 2.20, +4.5)
  const fountain = new THREE.Group();
  fountain.position.set(-4.5, 2.2, 4.5);
  registerCircleCollider(-4.5, 4.5, 2.1);

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

  buildCourtyardProps(sec, { limestoneMat, cedarMat, brassMat, chromeMat });
}

function buildCourtyardProps(sec, { limestoneMat, cedarMat, brassMat, chromeMat }) {
  // Interactive Handcrafted Timber & Brushed-Brass Rose Mailbox at (-10.8, 2.20, +9.4)
  const mailbox = new THREE.Group();
  mailbox.position.set(-10.8, 2.2, 9.4);
  mailbox.rotation.y = 0.18;
  registerCircleCollider(-10.8, 9.4, 0.42);

  const copperMat = pbrMetalMat(0x5b7d72, { roughness: 0.42, metalness: 0.72 });
  const darkWood = pbrWoodMat(0x6e472b, { roughness: 0.44 });
  const roseReliefMat = pbrMetalMat(0xd69a8e, { roughness: 0.36, metalness: 0.68 });

  const mbBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.16, 10), limestoneMat);
  mbBase.position.y = 0.08;
  const mbPost = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.06, 0.11), cedarMat);
  mbPost.position.y = 0.62;
  const mbBrace = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.32, 0.07), cedarMat);
  mbBrace.position.set(0, 0.96, 0.11);
  mbBrace.rotation.x = -Math.PI / 4;

  const mbBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.48), darkWood);
  mbBody.position.set(0, 1.24, 0.04);
  const mbVault = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.48, 14), copperMat);
  mbVault.rotation.x = Math.PI / 2;
  mbVault.position.set(0, 1.37, 0.04);
  const mbSlot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.02), brassMat);
  mbSlot.position.set(0, 1.31, 0.29);
  const mbPlate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.065, 0.015), brassMat);
  mbPlate.position.set(0, 1.19, 0.29);
  const mbRose = new THREE.Mesh(new THREE.TorusKnotGeometry(0.032, 0.011, 28, 6), roseReliefMat);
  mbRose.position.set(0.175, 1.25, 0.06);
  mbRose.rotation.y = Math.PI / 2;
  mailbox.add(mbBase, mbPost, mbBrace, mbBody, mbVault, mbSlot, mbPlate, mbRose);
  tagInteractive(mailbox, "mailbox", "庭院玫瑰信箱");
  sec.add(mailbox);

  // Interactive Vintage Pastel-Mint Touring Bicycle at (-18.6, 2.20, +9.6)
  const bikeHolder = new THREE.Group();
  bikeHolder.position.set(-18.6, 2.2, 9.6);
  bikeHolder.rotation.y = 0.48;
  registerCircleCollider(-18.6, 9.6, 0.65);

  const bike = new THREE.Group();
  bike.rotation.z = 0.11; // Leaned naturally onto kickstand
  const mintPaint = new THREE.MeshPhysicalMaterial({
    color: 0x97cabd,
    roughness: 0.24,
    metalness: 0.18,
    clearcoat: 0.85,
    clearcoatRoughness: 0.14,
  });
  const creamTireMat = new THREE.MeshStandardMaterial({ color: 0xebe3d1, roughness: 0.84 });
  const saddleLeather = pbrWoodMat(0x7c4522, { roughness: 0.42 });
  const wickerMat = createWickerMat();

  const buildSpokedWheel = (wx) => {
    const wg = new THREE.Group();
    wg.position.set(wx, 0.34, 0);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.028, 12, 28), creamTireMat);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.012, 8, 28), chromeMat);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.07, 10), chromeMat);
    hub.rotation.x = Math.PI / 2;
    wg.add(tire, rim, hub);
    for (let s = 0; s < 12; s += 1) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.58, 4), chromeMat);
      spoke.rotation.z = (s / 12) * Math.PI;
      wg.add(spoke);
    }
    const fender = new THREE.Mesh(
      new THREE.TorusGeometry(0.355, 0.022, 8, 20, Math.PI * 0.92),
      mintPaint
    );
    fender.rotation.z = Math.PI * 0.04;
    wg.add(fender);
    return wg;
  };
  bike.add(buildSpokedWheel(-0.54), buildSpokedWheel(0.54));

  const addTube = (x1, y1, z1, x2, y2, z2, r, mat) => {
    const p1 = new THREE.Vector3(x1, y1, z1);
    const p2 = new THREE.Vector3(x2, y2, z2);
    const dir = p2.clone().sub(p1);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
    m.position.copy(p1).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    bike.add(m);
  };

  addTube(-0.1, 0.33, 0, -0.24, 0.78, 0, 0.016, mintPaint); // Seat tube
  addTube(0.41, 0.78, 0, 0.54, 0.34, 0, 0.014, mintPaint); // Fork + head
  addTube(-0.1, 0.33, 0, 0.44, 0.68, 0, 0.017, mintPaint); // Down tube
  addTube(-0.21, 0.68, 0, 0.43, 0.72, 0, 0.014, mintPaint); // Step-through top tube
  addTube(-0.54, 0.34, -0.04, -0.1, 0.33, -0.02, 0.01, mintPaint);
  addTube(-0.54, 0.34, 0.04, -0.1, 0.33, 0.02, 0.01, mintPaint);
  addTube(-0.54, 0.34, 0, -0.22, 0.72, 0, 0.01, mintPaint);
  addTube(-0.08, 0.32, 0.04, -0.12, 0.01, 0.14, 0.008, chromeMat); // Kickstand

  // Chainring, saddle, swept handlebars & wicker flower basket
  const chainring = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.012, 16), chromeMat);
  chainring.rotation.x = Math.PI / 2;
  chainring.position.set(-0.1, 0.33, 0.035);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.055, 0.16), saddleLeather);
  saddle.position.set(-0.26, 0.86, 0);
  addTube(-0.24, 0.78, 0, -0.26, 0.85, 0, 0.012, chromeMat);
  addTube(0.41, 0.78, 0, 0.38, 0.94, 0, 0.012, chromeMat);
  const hBar = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.48, 8), chromeMat);
  hBar.rotation.x = Math.PI / 2;
  hBar.position.set(0.36, 0.94, 0);
  for (const sz of [-0.21, 0.21]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 8), saddleLeather);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(0.31, 0.93, sz);
    bike.add(grip);
  }
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), brassMat);
  bell.position.set(0.36, 0.965, 0.11);

  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.22, 12), wickerMat);
  basket.scale.set(0.85, 1.0, 1.25);
  basket.position.set(0.53, 0.79, 0);
  const basketBouquet = createRoseBouquet({ count: 7, scale: 0.72 });
  basketBouquet.position.set(0.53, 0.74, 0);

  bike.add(chainring, saddle, hBar, bell, basket, basketBouquet);
  bikeHolder.add(bike);
  tagInteractive(bikeHolder, "bicycle", "庭院复古单车");
  sec.add(bikeHolder);
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
    emissiveIntensity: 1.9,
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

  // Interactive Acoustic Guitar Hardcase ("instruments") & Clear Rain-Umbrella ("umbrella")
  const gCase = new THREE.Group();
  gCase.position.set(27.25, 0.45, 23.35);
  gCase.rotation.y = 0.36;
  const caseLeather = pbrWoodMat(0x52311d, { roughness: 0.46 });
  const silverLatch = pbrMetalMat(0xd9e0e6, { roughness: 0.2, metalness: 0.9 });
  const lowerBout = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 18), caseLeather);
  lowerBout.position.set(-0.24, 0.07, 0);
  const upperBout = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.14, 16), caseLeather);
  upperBout.position.set(0.06, 0.07, 0);
  const neckCase = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.13), caseLeather);
  neckCase.position.set(0.38, 0.065, 0);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.014, 8, 12, Math.PI), caseLeather);
  handle.position.set(0.04, 0.08, 0.185);
  handle.rotation.y = Math.PI / 2;
  gCase.add(lowerBout, upperBout, neckCase, handle);
  for (const lx of [-0.32, -0.05, 0.26]) {
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.02), silverLatch);
    latch.position.set(lx, 0.08, 0.235);
    gCase.add(latch);
  }
  tagInteractive(gCase, "instruments", "栈桥边的琴盒");
  sec.add(gCase);

  const umbrella = new THREE.Group();
  umbrella.position.set(28.35, 0.45, 23.55);
  umbrella.rotation.set(0.32, -0.45, 0.18);
  const clearVinyl = pbrGlassMat({ color: 0xf0f8fc, opacity: 0.32 });
  const whiteTrim = pbrFabricMat(0xf5f5f2, { roughness: 0.7 });
  const mapleMat = pbrWoodMat(0xb87b44, { roughness: 0.35 });
  const uDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.52, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.46),
    clearVinyl
  );
  uDome.position.y = 0.18;
  const uTrim = new THREE.Mesh(new THREE.TorusGeometry(0.515, 0.012, 8, 24), whiteTrim);
  uTrim.rotation.x = Math.PI / 2;
  uTrim.position.y = 0.24;
  const uShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.82, 8), silverLatch);
  uShaft.position.y = 0.36;
  const uHook = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 8, 14, Math.PI), mapleMat);
  uHook.position.set(0.055, -0.05, 0);
  uHook.rotation.z = Math.PI;
  umbrella.add(uDome, uTrim, uShaft, uHook);
  for (let r = 0; r < 8; r += 1) {
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.53, 4), silverLatch);
    const a = (r / 8) * Math.PI * 2;
    rib.position.set(Math.cos(a) * 0.24, 0.46, Math.sin(a) * 0.24);
    rib.lookAt(0, 0.7, 0);
    rib.rotateX(Math.PI / 2);
    umbrella.add(rib);
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

  // Espresso Bar Counter, Lever Machine, Lifebuoys, Oak Tables & Warm Pendant Lamps
  registerBoxCollider(16.9, 21.6, -14.8, -13.5);
  const barFront = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.06, 0.85), cedarMat);
  barFront.position.set(-2.75, 0.55, -3.15);
  const barTop = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.08, 1.02), oakMat);
  barTop.position.set(-2.75, 1.11, -3.15);
  const espressoBody = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.44, 0.42), chromeMat);
  espressoBody.position.set(-3.4, 1.36, -3.18);
  const espressoTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 14), brassMat);
  espressoTrim.position.set(-3.4, 1.62, -3.18);
  const grinder = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.42, 12), castIronMat);
  grinder.position.set(-2.5, 1.35, -3.2);
  cafe.add(barFront, barTop, espressoBody, espressoTrim, grinder);

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

  // 1. 11.5m Classic White-and-Teak Cabin Cruiser Yacht at (+51.5, 0.0, -3.2)
  const yacht = new THREE.Group();
  yacht.position.set(51.5, 0.0, -3.2);
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
  sloop.position.set(51.2, 0.0, 5.4);
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
  const rng = mulberry32(6803);
  const riprapGeos = [];
  for (let i = 0; i < 52; i += 1) {
    const bx = 47.0 + rng() * 29.0;
    const side = i % 2 === 0 ? -1 : 1;
    const bz = 10.0 + side * (2.55 + rng() * 1.45);
    const r = 0.65 + rng() * 0.85;
    const g = new THREE.DodecahedronGeometry(r, 1);
    g.scale(1.15, 0.72 + rng() * 0.3, 0.95);
    g.rotateY(rng() * Math.PI * 2);
    g.rotateZ((rng() - 0.5) * 0.5);
    g.translate(bx, -0.35 + rng() * 0.65, bz);
    riprapGeos.push(g);
  }
  for (let i = 0; i < 32; i += 1) {
    const ang = (i / 32) * Math.PI * 2;
    if (Math.cos(ang) < -0.78) continue;
    const dist = 4.95 + rng() * 1.65;
    const r = 0.75 + rng() * 0.95;
    const g = new THREE.DodecahedronGeometry(r, 1);
    g.scale(1.1, 0.75, 1.0);
    g.rotateY(rng() * Math.PI);
    g.translate(78.0 + Math.cos(ang) * dist, -0.3 + rng() * 0.65, 10.0 + Math.sin(ang) * dist);
    riprapGeos.push(g);
  }
  sec.add(new THREE.Mesh(safeMerge(riprapGeos), boulderMat));

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
    rotor.add(bullseye, beam);
  }
  rotor.add(lensDrum, coreLamp);
  lh.add(rotor);

  tagInteractive(lh, "lighthouse", "海岸防波堤灯塔");
  sec.add(lh);
  parent.add(sec);

  return { rotor, beaconCoreMat, beamMat };
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
    if (i % 2 === 0) registerCircleCollider(gx + bx, gz + bz, 0.22);
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
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 14, 12),
    new THREE.MeshStandardMaterial({
      color: 0xfff6df,
      emissive: 0xffbf69,
      emissiveIntensity: 1.85,
      roughness: 0.25,
    })
  );
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
  const seatFrame = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.07, 1.86), cedarMat);
  seatFrame.position.set(0, seatY, 0);
  const backRest = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.56, 1.84), cedarMat);
  backRest.position.set(-0.29, seatY + 0.29, 0);
  backRest.rotation.z = 0.14;
  const seatCushion = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 1.72), linenMat);
  seatCushion.position.set(0.02, seatY + 0.08, 0);
  for (const sz of [-0.62, 0.62]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.055, 0.07), cedarMat);
    arm.position.set(0, seatY + 0.28, sz * 1.44);
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.36), blushPillow);
    pillow.position.set(-0.14, seatY + 0.28, sz);
    pillow.rotation.set(0.1, 0.18 * Math.sign(sz), 0.16);
    swingPivot.add(arm, pillow);
  }
  swingPivot.add(seatFrame, backRest, seatCushion);
  gazInteractive.add(swingPivot);

  tagInteractive(gazInteractive, "flower-gazebo", "海岬白石花亭秋千");
  sec.add(gazInteractive);
  parent.add(sec);

  return { swingPivot };
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

  // Mossy river boulders along both creek banks
  const rng = mulberry32(4913);
  const bankGeos = [];
  for (let i = 0; i < 88; i += 1) {
    const z = lerp(-108.0, -26.0, rng());
    if (Math.abs(z + 44.0) < 3.2) continue; // Keep bridge abutments clear
    const side = i % 2 === 0 ? -1 : 1;
    const x = getCreekCenterX(z) + side * (2.25 + rng() * 1.45);
    const r = 0.28 + rng() * 0.48;
    const g = new THREE.DodecahedronGeometry(r, 1);
    g.scale(1.2, 0.68, 0.95);
    g.rotateY(rng() * Math.PI * 2);
    g.translate(x, getWorldTerrainY(x, z) + r * 0.22, z);
    bankGeos.push(g);
  }
  sec.add(
    new THREE.Mesh(
      safeMerge(bankGeos),
      pbrStoneMat(0x7c8073, { repeatX: 2, repeatY: 2, roughness: 0.88 })
    )
  );

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

  const apron = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 5.1, 0.65, 24), towerStone);
  apron.position.y = -0.26;
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

  // 3 Picturesque Stone-and-Terracotta Coastal Cottages on Distant Northern Slopes
  const plasterMat = pbrPlasterMat(0xf1e9da, { repeatX: 3, repeatY: 2, roughness: 0.86 });
  const roofTex = getTerracottaRoofTextures(6, 4);
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xc97352,
    map: roofTex.map,
    normalMap: roofTex.normalMap,
    roughness: 0.78,
  });
  const warmWinMat = new THREE.MeshStandardMaterial({
    color: 0xfff1cf,
    emissive: 0xffb85c,
    emissiveIntensity: 1.65,
    roughness: 0.25,
  });

  const cottageSites = [
    [-82.0, -58.0, 0.38, 7.2, 5.4],
    [-18.0, -86.0, -0.22, 8.0, 5.6],
    [42.0, -74.0, -0.48, 7.0, 5.2],
  ];
  for (const [cx, cz, ry, cw, cd] of cottageSites) {
    const cy = getWorldTerrainY(cx, cz);
    const halfR = Math.max(cw, cd) * 0.55;
    registerBoxCollider(cx - halfR, cx + halfR, cz - halfR, cz + halfR);

    const cot = new THREE.Group();
    cot.position.set(cx, cy, cz);
    cot.rotation.y = ry;

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.3, 2.8, cd + 0.3), towerStone);
    plinth.position.y = -1.05;
    const body = new THREE.Mesh(new THREE.BoxGeometry(cw, 3.3, cd), plasterMat);
    body.position.y = 1.95;
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.6, 0.85), towerStone);
    chimney.position.set(cw * 0.32, 4.4, -cd * 0.22);
    cot.add(plinth, body, chimney);

    for (const side of [-1, 1]) {
      const slopeLen = Math.hypot(cd * 0.58, 1.65);
      const roofSlope = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.7, 0.16, slopeLen), roofMat);
      roofSlope.position.set(0, 4.32, side * cd * 0.27);
      roofSlope.rotation.x = side * Math.atan2(1.65, cd * 0.58);
      cot.add(roofSlope);
    }
    for (const wx of [-cw * 0.26, cw * 0.26]) {
      for (const wz of [-cd * 0.51, cd * 0.51]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.08, 0.08), warmWinMat);
        win.position.set(wx, 2.05, wz);
        cot.add(win);
      }
    }
    sec.add(cot);
  }

  // Outer-Bay Limestone Sea-Stack Islet Rock Formations at (+58, 0, +56)
  const rng = mulberry32(8319);
  const isletGeos = [];
  for (let i = 0; i < 34; i += 1) {
    const a = rng() * Math.PI * 2;
    const dist = i < 6 ? rng() * 3.2 : 3.0 + rng() * 7.4;
    const rx = 58.0 + Math.cos(a) * dist;
    const rz = 56.0 + Math.sin(a) * dist;
    const rad = i < 6 ? 1.8 + rng() * 1.9 : 0.75 + rng() * 1.45;
    const g = new THREE.DodecahedronGeometry(rad, 1);
    const tall = i < 6 ? 1.65 + rng() * 1.15 : 0.68 + rng() * 0.55;
    g.scale(1.0, tall, 0.92);
    g.rotateY(rng() * Math.PI * 2);
    g.translate(rx, getWorldTerrainY(rx, rz) + rad * tall * 0.34, rz);
    isletGeos.push(g);
  }
  sec.add(
    new THREE.Mesh(
      safeMerge(isletGeos),
      pbrStoneMat(0x9b9487, { repeatX: 3, repeatY: 3, roughness: 0.88 })
    )
  );

  parent.add(sec);
  return { sailsRotor };
}

// ---------------------------------------------------------------------------
// Public Module Orchestrator & Real-Time PBR Animation Controller
// ---------------------------------------------------------------------------

export function buildHarborAndEstate() {
  const group = new THREE.Group();
  group.name = "HarborAndEstate";

  const waterAnimList = [];
  buildCoastalTerrainAndHorizon(group);
  buildCourtyardAndTrails(group, waterAnimList);
  buildHarborQuayAndBoathouse(group);
  const boats = buildHarborFleet(group);
  const lighthouseAnim = buildBreakwaterAndLighthouse(group);
  const gazeboAnim = buildCliffsideGazebo(group);
  buildCreekAndArchedBridge(group, waterAnimList);
  const windmillAnim = buildWindmillCottagesAndIslet(group);

  enablePBRShadows(group);

  let wmBoost = 0.0;
  let swingAmpBoost = 0.0;
  let swingPhase = 0.0;
  let lhFlash = 0.0;
  let boatRockBoost = 0.0;

  return {
    group,
    update(elapsed, dt) {
      const step = clamp(dt || 0.016, 0.001, 0.1);

      // Decay interactive animation impulses smoothly
      wmBoost = Math.max(0, wmBoost * Math.exp(-step * 0.65));
      swingAmpBoost = Math.max(0, swingAmpBoost * Math.exp(-step * 0.48));
      lhFlash = Math.max(0, lhFlash * Math.exp(-step * 0.85));
      boatRockBoost = Math.max(0, boatRockBoost * Math.exp(-step * 0.72));

      // Windmill sails rotation
      windmillAnim.sailsRotor.rotation.x += step * (0.54 + wmBoost * 2.35);

      // Gazebo floral swing pendulum motion
      swingPhase += step * (1.72 + swingAmpBoost * 0.45);
      gazeboAnim.swingPivot.rotation.z = (0.055 + swingAmpBoost) * Math.sin(swingPhase);

      // Lighthouse Fresnel lens rotor & warm daytime beacon flash
      lighthouseAnim.rotor.rotation.y += step * (0.68 + lhFlash * 1.9);
      lighthouseAnim.beaconCoreMat.emissiveIntensity = 2.4 + lhFlash * 2.8;
      lighthouseAnim.beamMat.opacity = 0.04 + lhFlash * 0.07;

      // Harbor boats gentle wave pitch / roll / heave
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
