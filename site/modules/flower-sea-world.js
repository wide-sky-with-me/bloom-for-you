// Japanese Anime Seaside Flower-Sea & Sakura Hills ("三渲二花海半岛与镰仓海边电车山丘")
// Surrounds the [-12, +12]^2 central harbor & villa out to the grand 44m x 44m [-22, +22]^2 plinth.

import { THREE, mergeGeometries, PALETTE, mulberry32, toonMat, wetSurfaceMat, glassMat, emissiveMat, addEdgeInk, makeCanvasTex, tagInteractive, enableShadows } from "./toon-kit.js";

const PLINTH_TOP_Y = -3.15;
const clamp = THREE.MathUtils.clamp;

function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function getStreamCenterX(z) {
  return 2.35 + 0.36 * Math.sin((z + 17.0) * 0.68);
}

const BOARDWALK_CTRL_XZ = [
  [-11.2, 8.4],
  [-12.45, 8.65],
  [-13.85, 9.75],
  [-14.85, 11.15],
  [-15.55, 12.65],
  [-16.2, 14.5],
];

// Unified C1-continuous terrain elevation across Patches A, B, C, D.
// Strictly equals +1.16 along the [-12, +12]^2 harbor/villa core perimeter.
function getFlowerTerrainY(x, z) {
  const dxWest = Math.max(0, -12.0 - x);
  const dxEast = Math.max(0, x - 12.0);
  const dzNorth = Math.max(0, -12.0 - z);
  const dzSouth = Math.max(0, z - 12.0);

  let y = 1.16;

  // North Patch C: flat Enoden tram terrace near Z = -12.85 (Y = +1.18), rising to +7.8 northward
  if (dzNorth > 0) {
    const tramShelf = 0.02 * smoothstep(0.0, 0.55, dzNorth);
    const hillT = smoothstep(1.48, 9.15, dzNorth);
    const ridgeWave =
      0.58 * Math.sin(x * 0.22 + 0.65) +
      0.28 * Math.cos(z * 0.52) +
      0.22 * Math.sin((x - z) * 0.31);
    const terraceStep = 0.18 * Math.sin(hillT * Math.PI * 3.0);
    y += tramShelf + hillT * (5.92 + ridgeWave) + terraceStep * hillT;

    // Carve gentle concave mountain stream bed around X in [+1.5, +3.2], Z in [-21.0, -13.4]
    const streamGate = smoothstep(-13.35, -14.15, z) * smoothstep(-21.6, -20.2, z);
    const dStream = Math.abs(x - getStreamCenterX(z));
    if (dStream < 1.15 && streamGate > 0) {
      const gully = Math.cos((dStream / 1.15) * Math.PI * 0.5);
      y -= 0.36 * gully * gully * streamGate;
    }

    // Flatten hilltop plateau for White Wooden Windmill at (-15.8, 5.2, -16.8)
    const dWm = Math.hypot(x + 15.8, z + 16.8);
    const wmGate = (1 - smoothstep(1.55, 3.85, dWm)) * smoothstep(-13.55, -14.65, z);
    if (wmGate > 0) {
      y = THREE.MathUtils.lerp(y, 5.2, wmGate);
    }
  }

  // West Patch B: sunlit meadow rising from Y = +1.16 at X = -12 to +4.2 northward & +3.6 on promontory
  if (dxWest > 0) {
    const westT = smoothstep(0.0, 9.6, dxWest);
    const southOfTram = smoothstep(-12.0, -8.8, z);
    const meadowWave =
      2.36 +
      0.56 * Math.cos((z + 2.2) * 0.16) +
      0.22 * Math.sin(x * 0.42 + z * 0.21);
    y += westT * southOfTram * meadowWave;

    // Scenic headland swell behind Gazebo (-19.2, +14.5) reaching ~3.6m
    const promSwell =
      0.62 *
      Math.exp(-((x + 18.6) * (x + 18.6) / 18.0 + (z - 14.5) * (z - 14.5) / 26.0)) *
      smoothstep(-12.0, -13.6, x);
    y += promSwell;
  }

  // South-West Patch A (and South Patch B transition): coastal bluff rising from +1.16 to +2.35
  if (dzSouth > 0) {
    const southT = smoothstep(0.0, 8.6, dzSouth);
    const seaTaper = smoothstep(-0.55, -4.4, x);
    const bluffRoll = 0.14 * Math.sin(x * 0.44 + 0.5) * Math.cos(z * 0.34);
    y += southT * (0.28 + 0.88 * seaTaper + bluffRoll);
  }

  // Flatten circular terrace at (-16.2, 2.95, +14.5) for White Wrought-Iron Flower Gazebo
  const dGaz = Math.hypot(x + 16.2, z - 14.5);
  const gazGate = (1 - smoothstep(2.05, 4.15, dGaz)) * smoothstep(-12.0, -13.25, x);
  if (gazGate > 0) {
    y = THREE.MathUtils.lerp(y, 2.95, gazGate);
  }

  // East Patch D (and East corner of Patch C): Hydrangea Sea Cape rising gently from +1.16 to +2.35
  if (dxEast > 0) {
    const eastLin = clamp(dxEast / 9.6, 0, 1);
    const eastT = smoothstep(0.0, 9.6, dxEast);
    const capeSouthTaper = z > -12.0 ? 0.58 + 0.42 * smoothstep(-1.5, -5.8, z) : 1.0;
    const knoll =
      0.18 *
      Math.exp(-((x - 15.1) * (x - 15.1) + (z + 3.3) * (z + 3.3)) / 6.2) *
      smoothstep(12.0, 13.2, x);
    y += (0.36 * eastLin + 0.82 * eastT) * capeSouthTaper + knoll;
  }

  return y;
}

function getTerrainNormal(x, z, out = new THREE.Vector3()) {
  const e = 0.18;
  const hL = getFlowerTerrainY(x - e, z);
  const hR = getFlowerTerrainY(x + e, z);
  const hD = getFlowerTerrainY(x, z - e);
  const hU = getFlowerTerrainY(x, z + e);
  return out.set(hL - hR, 2 * e, hD - hU).normalize();
}

// Ribbon index selector (0..4) for both terrain floral undertone and 8,400+ GPU flower placement
function getFlowerRibbonKind(x, z) {
  if (z > 12.2 && x > -12.5) {
    const w = Math.sin(x * 0.46 + z * 0.32);
    return w > 0.25 ? 0 : w > -0.35 ? 1 : 4;
  }
  if (x > 11.8 && z > -12.2) {
    const w = Math.sin(x * 0.52 - z * 0.44);
    return w > 0.12 ? 0 : 4;
  }
  if (z < -12.0 && z > -14.1 && x > -20.8 && x < 11.4) {
    return Math.sin(x * 0.48) > -0.15 ? 3 : 1;
  }
  const wave = (x * 0.26 + z * 0.21 + 0.65 * Math.sin(z * 0.19 - x * 0.14)) % 5.0;
  const band = ((wave % 5.0) + 5.0) % 5.0;
  return Math.min(4, Math.floor(band));
}

function createWorldTextures() {
  const strataTex = makeCanvasTex(256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.0, "#5a8e49");
    g.addColorStop(0.08, "#6e4e37");
    g.addColorStop(0.24, "#977153");
    g.addColorStop(0.46, "#b4bab6");
    g.addColorStop(0.68, "#8c999c");
    g.addColorStop(0.86, "#69797f");
    g.addColorStop(1.0, "#4e5e65");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const rng = mulberry32(4401);
    for (let s = 0; s < 14; s += 1) {
      const sy = 24 + s * 16;
      ctx.strokeStyle = s % 2 === 0 ? "rgba(55,68,74,0.34)" : "rgba(236,240,234,0.22)";
      ctx.lineWidth = 2 + (s % 3);
      ctx.beginPath();
      for (let x = 0; x <= w; x += 16) {
        const yy = sy + Math.sin(x * 0.05 + s) * 3.5;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 220; i += 1) {
      ctx.fillStyle = rng() > 0.5 ? "rgba(255,255,255,0.14)" : "rgba(44,54,58,0.18)";
      ctx.beginPath();
      ctx.arc(rng() * w, 28 + rng() * (h - 32), 1.2 + rng() * 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { repeatX: 6, repeatY: 1 });

  const seawallTex = makeCanvasTex(256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.0, "#cad3d4");
    g.addColorStop(0.44, "#aebbc0");
    g.addColorStop(0.62, "#5c7678");
    g.addColorStop(0.78, "#456164");
    g.addColorStop(1.0, "#384e54");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(48,64,70,0.48)";
    ctx.lineWidth = 2;
    const rows = 8;
    for (let r = 0; r < rows; r += 1) {
      const y = (r * h) / rows;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      const off = (r % 2) * 20;
      for (let x = off; x < w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + h / rows);
        ctx.stroke();
      }
    }
  }, { repeatX: 4, repeatY: 1 });

  const streamTex = makeCanvasTex(128, 256, (ctx, w, h) => {
    ctx.fillStyle = "#5ccad0";
    ctx.fillRect(0, 0, w, h);
    const rng = mulberry32(7712);
    for (let i = 0; i < 42; i += 1) {
      ctx.strokeStyle = i % 3 === 0 ? "rgba(255,255,255,0.72)" : "rgba(182,248,252,0.45)";
      ctx.lineWidth = 2 + (i % 2) * 1.5;
      const x = 10 + rng() * (w - 20);
      const y = rng() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + (rng() - 0.5) * 14, y + 18, x, y + 36);
      ctx.stroke();
    }
  }, { repeatX: 1, repeatY: 4 });

  const stationSignTex = makeCanvasTex(256, 96, (ctx, w, h) => {
    ctx.fillStyle = "#fcf8ee";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#2d6a4f";
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = "#2d6a4f";
    ctx.fillRect(14, 62, w - 28, 16);
    ctx.fillStyle = "#243b42";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("星語花湾駅", w * 0.5, 44);
    ctx.fillStyle = "#fcf8ee";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("HOSHI-HANAWAN · KAMAKURA LINE", w * 0.5, 74);
  });

  return { strataTex, seawallTex, streamTex, stationSignTex };
}

function buildTerrainAndCutaways(parent, tex) {
  const step = 0.5;
  const cGrassLow = new THREE.Color(0x5eb654);
  const cGrassHigh = new THREE.Color(0x88d462);
  const cBallast = new THREE.Color(0xc2bbb0);
  const cStreamBed = new THREE.Color(0x499ea8);
  const ribbonTints = [
    new THREE.Color(0x74bcf0),
    new THREE.Color(0xe69eb4),
    new THREE.Color(0xe68c7c),
    new THREE.Color(0xebd05b),
    new THREE.Color(0xd2c8eb),
  ];
  const tmp = new THREE.Color();

  function makePatchGeo(x0, x1, z0, z1) {
    const nx = Math.round((x1 - x0) / step);
    const nz = Math.round((z1 - z0) / step);
    const positions = new Float32Array((nx + 1) * (nz + 1) * 3);
    const colors = new Float32Array((nx + 1) * (nz + 1) * 3);
    const indices = [];

    let p = 0;
    for (let iz = 0; iz <= nz; iz += 1) {
      const wz = z0 + iz * step;
      for (let ix = 0; ix <= nx; ix += 1) {
        const wx = x0 + ix * step;
        const wy = getFlowerTerrainY(wx, wz);
        positions[p * 3 + 0] = wx;
        positions[p * 3 + 1] = wy;
        positions[p * 3 + 2] = wz;

        const hNorm = clamp((wy - 1.15) / 5.5, 0, 1);
        tmp.copy(cGrassLow).lerp(cGrassHigh, hNorm * 0.85);
        const rKind = getFlowerRibbonKind(wx, wz);
        tmp.lerp(ribbonTints[rKind], 0.16);

        if (wz > -13.45 && wz < -12.25 && wx > -21.1 && wx < 11.45) {
          const bt = 1 - smoothstep(0.32, 0.62, Math.abs(wz + 12.85));
          tmp.lerp(cBallast, bt * 0.85);
        }
        if (wz < -13.4 && wz > -21.2) {
          const ds = Math.abs(wx - getStreamCenterX(wz));
          if (ds < 0.95) tmp.lerp(cStreamBed, (1 - ds / 0.95) * 0.78);
        }

        colors[p * 3 + 0] = tmp.r;
        colors[p * 3 + 1] = tmp.g;
        colors[p * 3 + 2] = tmp.b;
        p += 1;
      }
    }

    for (let iz = 0; iz < nz; iz += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        const a = iz * (nx + 1) + ix;
        const b = a + 1;
        const c = a + (nx + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  const terrainGeo = mergeGeometries([
    makePatchGeo(-12.0, -3.5, 12.0, 14.0),  // Patch A1
    makePatchGeo(-12.0, -1.0, 14.0, 22.0),  // Patch A2
    makePatchGeo(-22.0, -12.0, -12.0, 22.0), // Patch B
    makePatchGeo(-22.0, 22.0, -22.0, -12.0), // Patch C
    makePatchGeo(12.0, 22.0, -12.0, -1.5),   // Patch D
  ], false);

  const terrainMat = toonMat(0xffffff, { unique: true, bands: [152, 198, 234, 255] });
  terrainMat.vertexColors = true;
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.raycast = () => {};
  parent.add(terrainMesh);

  function makeVerticalRibbon(ptsXZ, yBottom, mat, uScale = 0.14) {
    const pos = [];
    const uvs = [];
    let dist = 0;
    for (let i = 0; i < ptsXZ.length - 1; i += 1) {
      const [x0, z0] = ptsXZ[i];
      const [x1, z1] = ptsXZ[i + 1];
      const y0 = getFlowerTerrainY(x0, z0);
      const y1 = getFlowerTerrainY(x1, z1);
      const segLen = Math.hypot(x1 - x0, z1 - z0);
      const u0 = dist * uScale;
      const u1 = (dist + segLen) * uScale;
      dist += segLen;

      const v0Top = 0.02;
      const v1Top = 0.02;
      const v0Bot = clamp((y0 - yBottom) / 10.5, 0.28, 0.99);
      const v1Bot = clamp((y1 - yBottom) / 10.5, 0.28, 0.99);

      pos.push(
        x0, yBottom, z0, x1, yBottom, z1, x1, y1, z1,
        x0, yBottom, z0, x1, y1, z1, x0, y0, z0
      );
      uvs.push(
        u0, 1 - v0Bot, u1, 1 - v1Bot, u1, 1 - v1Top,
        u0, 1 - v0Bot, u1, 1 - v1Top, u0, 1 - v0Top
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.raycast = () => {};
    return m;
  }

  function sampleLine(x0, z0, x1, z1) {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step));
    const pts = [];
    for (let i = 0; i <= n; i += 1) {
      pts.push([
        THREE.MathUtils.lerp(x0, x1, i / n),
        THREE.MathUtils.lerp(z0, z1, i / n),
      ]);
    }
    return pts;
  }

  const strataMat = toonMat(0xffffff, { map: tex.strataTex, side: THREE.DoubleSide, unique: true });
  const outerLines = [
    sampleLine(-22.0, 22.0, -1.0, 22.0),   // Front Z = +22 (Patch B + A)
    sampleLine(-22.0, -22.0, -22.0, 22.0), // West X = -22 (Patch C + B)
    sampleLine(22.0, -22.0, -22.0, -22.0), // Back Z = -22 (Patch C)
    sampleLine(22.0, -1.5, 22.0, -22.0),   // East X = +22 (Patch D + C)
  ];
  outerLines.forEach((pts) => parent.add(makeVerticalRibbon(pts, PLINTH_TOP_Y, strataMat, 0.09)));

  // Coastal stone seawalls along Patch A cove/bay edge and Patch D south cape edge
  const seawallMat = toonMat(0xffffff, { map: tex.seawallTex, side: THREE.DoubleSide, unique: true });
  const patchASeawallPts = [
    ...sampleLine(-3.5, 12.0, -3.5, 14.0),
    ...sampleLine(-3.5, 14.0, -1.0, 14.0).slice(1),
    ...sampleLine(-1.0, 14.0, -1.0, 22.0).slice(1),
  ];
  const patchDSeawallPts = sampleLine(12.0, -1.5, 22.0, -1.5);
  parent.add(
    makeVerticalRibbon(patchASeawallPts, PLINTH_TOP_Y, seawallMat, 0.18),
    makeVerticalRibbon(patchDSeawallPts, PLINTH_TOP_Y, seawallMat, 0.18)
  );

  // Granite coping blocks + tide-washed coastal boulders & barnacles along both seawalls
  const copingMat = toonMat(0xc9d4d6);
  const boulderMats = [toonMat(0x697c82), toonMat(0x52666c), toonMat(0x7e8f94)];
  const barnacleMat = toonMat(0xdce2da);
  const rng = mulberry32(8802);

  function decorateCoastline(pts, seaOffX, seaOffZ) {
    for (let i = 0; i < pts.length - 1; i += 2) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[Math.min(pts.length - 1, i + 2)];
      const mx = (x0 + x1) * 0.5;
      const mz = (z0 + z1) * 0.5;
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.1) continue;
      const my = getFlowerTerrainY(mx, mz) + 0.05;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(len + 0.04, 0.13, 0.36), copingMat);
      cap.position.set(mx, my, mz);
      cap.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      addEdgeInk(cap, 26);
      cap.raycast = () => {};
      parent.add(cap);

      // Tide-washed boulders & barnacles near Y = 0.0
      if (rng() > 0.22) {
        const r = 0.24 + rng() * 0.28;
        const rk = new THREE.Mesh(
          new THREE.DodecahedronGeometry(r, 0),
          boulderMats[i % boulderMats.length]
        );
        rk.scale.set(1.25, 0.72, 1.05);
        rk.position.set(
          mx + seaOffX * (0.26 + rng() * 0.25),
          -0.12 + rng() * 0.22,
          mz + seaOffZ * (0.26 + rng() * 0.25)
        );
        rk.rotation.set(rng() * 0.5, rng() * Math.PI * 2, rng() * 0.5);
        addEdgeInk(rk, 28);
        rk.raycast = () => {};
        parent.add(rk);

        for (let b = 0; b < 3; b += 1) {
          const bn = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.06, 6), barnacleMat);
          bn.position.set(
            rk.position.x + (rng() - 0.5) * 0.28,
            rk.position.y + r * 0.42,
            rk.position.z + (rng() - 0.5) * 0.28
          );
          bn.raycast = () => {};
          parent.add(bn);
        }
      }
    }
  }
  decorateCoastline(patchASeawallPts, 1.0, 0.15);
  decorateCoastline(patchDSeawallPts, 0.0, 1.0);
}

function buildPromontoryBoardwalkAndGazebo(parent) {
  const whiteIronMat = toonMat(0xfaf9f5);
  const creamStoneMat = toonMat(0xf2eadb);
  const plankWoodMat = toonMat(0xc48f62);
  const vineLeafMat = toonMat(0x4a9b53);
  const roseMats = [toonMat(0xf58ea8), toonMat(0xf27d72), toonMat(0xffbfd0), toonMat(0xfff1e6)];
  const rng = mulberry32(5519);

  // 1. Romantic White Rose-Covered Garden Arch bridging X = -12.0 at (-11.85, 1.16, +8.4)
  const archGroup = new THREE.Group();
  archGroup.position.set(-11.85, getFlowerTerrainY(-11.85, 8.4), 8.4);
  const postOffsets = [[-0.28, -0.78], [0.28, -0.78], [-0.28, 0.78], [0.28, 0.78]];
  postOffsets.forEach(([px, pz]) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.05, 0.08), whiteIronMat);
    p.position.set(px, 1.025, pz);
    addEdgeInk(p, 26);
    archGroup.add(p);
  });
  for (let side of [-0.78, 0.78]) {
    for (let h = 0.45; h <= 1.85; h += 0.45) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.04, 0.04), whiteIronMat);
      bar.position.set(0, h, side);
      archGroup.add(bar);
    }
  }
  [-0.28, 0, 0.28].forEach((ax) => {
    const hoop = new THREE.Mesh(
      new THREE.TorusGeometry(0.78, 0.036, 8, 20, Math.PI),
      whiteIronMat
    );
    hoop.rotation.y = Math.PI * 0.5;
    hoop.position.set(ax, 2.02, 0);
    archGroup.add(hoop);
  });
  for (let i = 0; i < 34; i += 1) {
    const ang = -0.35 + rng() * (Math.PI + 0.7);
    const ry = ang < 0 ? 0.45 + rng() * 1.5 : ang > Math.PI ? 0.45 + rng() * 1.5 : 2.02 + Math.sin(ang) * 0.78;
    const rz = ang < 0 ? -0.82 : ang > Math.PI ? 0.82 : -Math.cos(ang) * 0.82;
    const rx = (rng() - 0.5) * 0.62;
    const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 + rng() * 0.06, 0), vineLeafMat);
    lf.position.set(rx, ry, rz);
    archGroup.add(lf);
    const rs = new THREE.Mesh(new THREE.DodecahedronGeometry(0.075 + rng() * 0.035, 0), roseMats[i % roseMats.length]);
    rs.position.set(rx + (rng() - 0.5) * 0.08, ry + 0.06, rz + (rng() - 0.5) * 0.08);
    archGroup.add(rs);
  }
  archGroup.traverse((c) => { if (c.isMesh) c.raycast = () => {}; });
  parent.add(archGroup);

  // 2. Winding Cream-Stone & Timber Flower-Sea Boardwalk from (-11.2, +4.2) to (-16.2, +14.5)
  const curvePts = BOARDWALK_CTRL_XZ.map(
    ([bx, bz]) => new THREE.Vector3(bx, getFlowerTerrainY(bx, bz) + 0.075, bz)
  );
  const walkCurve = new THREE.CatmullRomCurve3(curvePts);
  const plankCount = 52;
  const boardwalkSamples = [];
  const lanternGlowMat = emissiveMat(0xffe6a3, 1.25);

  for (let i = 0; i <= plankCount; i += 1) {
    const t = i / plankCount;
    const pt = walkCurve.getPoint(t);
    const tan = walkCurve.getTangent(t);
    pt.y = getFlowerTerrainY(pt.x, pt.z) + 0.075;
    boardwalkSamples.push({ x: pt.x, z: pt.z });

    const yaw = Math.atan2(tan.x, tan.z);
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(1.26, 0.055, 0.23),
      i % 5 === 0 ? creamStoneMat : plankWoodMat
    );
    plank.position.copy(pt);
    plank.rotation.y = yaw;
    plank.raycast = () => {};
    parent.add(plank);

    if (i % 6 === 2 && i < plankCount - 2) {
      const nx = Math.cos(yaw) * 0.68;
      const nz = -Math.sin(yaw) * 0.68;
      for (let s of [-1, 1]) {
        const px = pt.x + nx * s;
        const pz = pt.z + nz * s;
        const py = getFlowerTerrainY(px, pz);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.62, 6), whiteIronMat);
        post.position.set(px, py + 0.24, pz);
        post.raycast = () => {};
        parent.add(post);
        if ((i + (s > 0 ? 1 : 0)) % 2 === 0) {
          const capLamp = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), lanternGlowMat);
          capLamp.position.set(px, py + 0.58, pz);
          capLamp.raycast = () => {};
          parent.add(capLamp);
        }
      }
    }
  }

  // 3. Centerpiece White Wrought-Iron Seaside Flower Gazebo & Two-Person Swing ("flower-gazebo")
  const gazeboGroup = new THREE.Group();
  gazeboGroup.position.set(-16.2, 2.95, 14.5);

  const terraceSub = new THREE.Mesh(new THREE.CylinderGeometry(2.38, 2.54, 0.84, 28), toonMat(0xdad2c2));
  terraceSub.position.y = -0.3;
  addEdgeInk(terraceSub, 28);
  const terraceTop = new THREE.Mesh(new THREE.CylinderGeometry(2.18, 2.26, 0.12, 28), creamStoneMat);
  terraceTop.position.y = 0.16;
  addEdgeInk(terraceTop, 28);
  gazeboGroup.add(terraceSub, terraceTop);

  // Entry stone steps facing North-East toward the boardwalk
  for (let s = 0; s < 2; s += 1) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.12, 0.36), creamStoneMat);
    st.position.set(0.45 + s * 0.12, 0.04 + (1 - s) * 0.08, -2.18 - s * 0.28);
    st.rotation.y = -0.22;
    addEdgeInk(st, 26);
    gazeboGroup.add(st);
  }

  const colR = 1.82;
  const colH = 2.46;
  for (let k = 0; k < 6; k += 1) {
    const a = (k * Math.PI) / 3 + 0.26;
    const cx = Math.cos(a) * colR;
    const cz = Math.sin(a) * colR;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.068, colH, 10), whiteIronMat);
    col.position.set(cx, 0.22 + colH * 0.5, cz);
    const baseCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.14, 10), whiteIronMat);
    baseCollar.position.set(cx, 0.29, cz);
    gazeboGroup.add(col, baseCollar);

    const aNext = ((k + 1) * Math.PI) / 3 + 0.26;
    const nx = Math.cos(aNext) * colR;
    const nz = Math.sin(aNext) * colR;
    const midX = (cx + nx) * 0.5;
    const midZ = (cz + nz) * 0.5;
    const spanLen = Math.hypot(nx - cx, nz - cz);
    const spanYaw = -Math.atan2(nz - cz, nx - cx);

    // Top filigree frieze beam & decorative scroll rings
    const beam = new THREE.Mesh(new THREE.BoxGeometry(spanLen, 0.08, 0.07), whiteIronMat);
    beam.position.set(midX, 0.22 + colH, midZ);
    beam.rotation.y = spanYaw;
    gazeboGroup.add(beam);

    for (let sc of [-0.52, 0, 0.52]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 6, 14), whiteIronMat);
      ring.position.set(
        midX + Math.cos(-spanYaw) * sc,
        0.22 + colH - 0.18,
        midZ + Math.sin(-spanYaw) * sc
      );
      ring.rotation.y = spanYaw;
      gazeboGroup.add(ring);
    }

    // Low wrought-iron balustrade on 4 bays (leave entrance & sea-view bays open)
    if (k !== 4 && k !== 1) {
      const railTop = new THREE.Mesh(new THREE.BoxGeometry(spanLen, 0.05, 0.05), whiteIronMat);
      railTop.position.set(midX, 0.88, midZ);
      railTop.rotation.y = spanYaw;
      gazeboGroup.add(railTop);
      for (let b = -3; b <= 3; b += 1) {
        const bal = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.64, 6), whiteIronMat);
        bal.position.set(
          midX + (nx - cx) * (b / 8),
          0.55,
          midZ + (nz - cz) * (b / 8)
        );
        gazeboGroup.add(bal);
      }
    }

    // Curved open dome rib converging to crown finial
    const ribCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(cx, 0.22 + colH, cz),
      new THREE.Vector3(cx * 0.66, 0.22 + colH + 0.78, cz * 0.66),
      new THREE.Vector3(0, 0.22 + colH + 1.24, 0),
    ]);
    const rib = new THREE.Mesh(new THREE.TubeGeometry(ribCurve, 12, 0.032, 6, false), whiteIronMat);
    gazeboGroup.add(rib);
  }

  const domeRing1 = new THREE.Mesh(new THREE.TorusGeometry(1.24, 0.026, 8, 28), whiteIronMat);
  domeRing1.rotation.x = Math.PI * 0.5;
  domeRing1.position.y = 0.22 + colH + 0.68;
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 8), whiteIronMat);
  finial.position.y = 0.22 + colH + 1.42;
  const pendantLamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), lanternGlowMat);
  pendantLamp.position.y = 0.22 + colH + 0.72;
  gazeboGroup.add(domeRing1, finial, pendantLamp);

  // Blooming pink & coral climbing roses entwining columns & dome crown
  for (let r = 0; r < 48; r += 1) {
    const colIdx = r % 3 === 0 ? 0 : r % 3 === 1 ? 2 : 5;
    const baseA = (colIdx * Math.PI) / 3 + 0.26;
    const hFrac = rng();
    let rx;
    let ry;
    let rz;
    if (hFrac < 0.58) {
      const wrapA = baseA + (hFrac * 7.5) * 0.12;
      rx = Math.cos(baseA) * colR + Math.cos(wrapA * 8) * 0.11;
      rz = Math.sin(baseA) * colR + Math.sin(wrapA * 8) * 0.11;
      ry = 0.45 + (hFrac / 0.58) * 2.22;
    } else {
      const ca = rng() * Math.PI * 2;
      const cr = 0.35 + rng() * 1.45;
      rx = Math.cos(ca) * cr;
      rz = Math.sin(ca) * cr;
      ry = 2.68 + (1 - (cr / 1.85) * (cr / 1.85)) * 1.15;
    }
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12 + rng() * 0.05, 0), vineLeafMat);
    leaf.position.set(rx, ry, rz);
    const bloom = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.075 + rng() * 0.035, 0),
      roseMats[r % roseMats.length]
    );
    bloom.position.set(rx + (rng() - 0.5) * 0.09, ry + 0.06, rz + (rng() - 0.5) * 0.09);
    gazeboGroup.add(leaf, bloom);
  }

  // Suspended White Wooden Two-Person Floral Swing Bench ("双人花藤秋千")
  const swingBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.85, 8), whiteIronMat);
  swingBeam.rotation.z = Math.PI * 0.5;
  swingBeam.position.set(0, 2.56, 0.18);
  gazeboGroup.add(swingBeam);

  const swingPivot = new THREE.Group();
  swingPivot.position.set(0, 2.56, 0.18);
  swingPivot.rotation.y = 0.32;

  const rodMat = toonMat(PALETTE.brassGold);
  for (let sx of [-0.54, 0.54]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.66, 6), rodMat);
    rod.position.set(sx, -0.83, 0);
    swingPivot.add(rod);
    for (let v = 0; v < 4; v += 1) {
      const vf = new THREE.Mesh(new THREE.DodecahedronGeometry(0.055, 0), roseMats[v % roseMats.length]);
      vf.position.set(sx + (v % 2 ? 0.03 : -0.03), -0.35 - v * 0.28, 0.02);
      swingPivot.add(vf);
    }
  }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.06, 0.46), whiteIronMat);
  seat.position.set(0, -1.66, 0);
  const backRest = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.46, 0.055), whiteIronMat);
  backRest.position.set(0, -1.42, -0.21);
  backRest.rotation.x = -0.14;
  const cush1 = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.36), toonMat(0xf7b2c4));
  cush1.position.set(-0.26, -1.6, 0.02);
  const cush2 = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.36), toonMat(0xfff0c8));
  cush2.position.set(0.26, -1.6, 0.02);
  for (let ax of [-0.55, 0.55]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.44), whiteIronMat);
    arm.position.set(ax, -1.46, 0);
    swingPivot.add(arm);
  }
  swingPivot.add(seat, backRest, cush1, cush2);
  gazeboGroup.add(swingPivot);

  tagInteractive(gazeboGroup, "flower-gazebo", "花海白色铁艺花亭", {
    accentColor: PALETTE.pastelPink,
  });
  parent.add(gazeboGroup);

  return { boardwalkSamples, swingPivot };
}

function buildWindmillAndStream(parent, tex) {
  const creamMat = toonMat(PALETTE.villaCream);
  const timberMat = toonMat(PALETTE.villaWood);
  const coralRoofMat = toonMat(PALETTE.villaRoofCoral);
  const stoneMat = toonMat(0xc8cfc8);
  const sailCanvasMat = toonMat(0xfdf7e7, { side: THREE.DoubleSide });
  const warmWinMat = emissiveMat(0xffe196, 1.25);

  // 1. White Wooden Flower-Hill Windmill ("windmill") at (-15.8, 5.2, -16.8)
  const windmillGroup = new THREE.Group();
  windmillGroup.position.set(-15.8, 5.2, -16.8);
  windmillGroup.rotation.y = 0.56;

  const basePlinth = new THREE.Mesh(new THREE.CylinderGeometry(1.74, 1.94, 1.25, 8), stoneMat);
  basePlinth.position.y = -0.22;
  addEdgeInk(basePlinth, 25);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.04, 1.56, 4.1, 8), creamMat);
  tower.position.y = 2.42;
  addEdgeInk(tower, 22);
  windmillGroup.add(basePlinth, tower);

  for (let k = 0; k < 8; k += 1) {
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.09, 4.12, 0.09), timberMat);
    rib.position.set(Math.cos(a) * 1.28, 2.42, Math.sin(a) * 1.28);
    rib.rotation.z = Math.cos(a) * 0.12;
    rib.rotation.x = -Math.sin(a) * 0.12;
    windmillGroup.add(rib);
  }

  // Wooden observation balcony halfway up the tower + flower boxes
  const balcDeck = new THREE.Mesh(new THREE.CylinderGeometry(1.92, 1.86, 0.12, 8), timberMat);
  balcDeck.position.y = 2.15;
  addEdgeInk(balcDeck, 25);
  const balcRail = new THREE.Mesh(new THREE.TorusGeometry(1.84, 0.038, 6, 8), creamMat);
  balcRail.rotation.x = Math.PI * 0.5;
  balcRail.rotation.z = Math.PI / 8;
  balcRail.position.y = 2.72;
  windmillGroup.add(balcDeck, balcRail);

  for (let k = 0; k < 8; k += 1) {
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.56, 6), timberMat);
    post.position.set(Math.cos(a) * 1.82, 2.44, Math.sin(a) * 1.82);
    windmillGroup.add(post);
    if (k % 2 === 0) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.08), warmWinMat);
      win.position.set(Math.cos(a - Math.PI / 8) * 1.18, 3.18, Math.sin(a - Math.PI / 8) * 1.18);
      win.rotation.y = -(a - Math.PI / 8) + Math.PI * 0.5;
      windmillGroup.add(win);
    }
  }

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.05, 0.12), timberMat);
  door.position.set(0, 0.92, 1.52);
  const capRoof = new THREE.Mesh(new THREE.ConeGeometry(1.24, 1.32, 8), coralRoofMat);
  capRoof.position.y = 5.08;
  addEdgeInk(capRoof, 24);
  const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.48, 8), toonMat(PALETTE.brassGold));
  finial.position.y = 5.92;
  windmillGroup.add(door, capRoof, finial);

  // 4 Large Lattice Canvas Sails rotating on front hub
  const hubShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.72, 10), timberMat);
  hubShaft.rotation.x = Math.PI * 0.5;
  hubShaft.position.set(0, 4.46, 1.18);
  windmillGroup.add(hubShaft);

  const sailsRotor = new THREE.Group();
  sailsRotor.position.set(0, 4.46, 1.54);
  const hubCap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.28, 10), toonMat(PALETTE.brassGold));
  hubCap.rotation.x = Math.PI * 0.5;
  hubCap.position.z = 0.08;
  sailsRotor.add(hubCap);

  for (let s = 0; s < 4; s += 1) {
    const arm = new THREE.Group();
    arm.rotation.z = (s * Math.PI) / 2 + 0.35;
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.35, 0.1), timberMat);
    spar.position.y = 1.68;
    arm.add(spar);

    const bladePitch = new THREE.Group();
    bladePitch.position.set(0.28, 1.95, 0.02);
    bladePitch.rotation.y = 0.22;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 2.55), sailCanvasMat);
    addEdgeInk(cloth, 28);
    bladePitch.add(cloth);
    for (let r = -2; r <= 2; r += 1) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.04), timberMat);
      rung.position.y = r * 0.54;
      bladePitch.add(rung);
    }
    arm.add(bladePitch);
    sailsRotor.add(arm);
  }
  windmillGroup.add(sailsRotor);
  tagInteractive(windmillGroup, "windmill", "花海风车塔", { accentColor: PALETTE.villaRoofCoral });
  parent.add(windmillGroup);

  // 2. Sparkling Mountain Flower Stream & Curved Red-Wood Footbridge
  const segs = 34;
  const sPos = [];
  const sUvs = [];
  for (let i = 0; i < segs; i += 1) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const z0 = THREE.MathUtils.lerp(-20.6, -13.55, t0);
    const z1 = THREE.MathUtils.lerp(-20.6, -13.55, t1);
    const x0 = getStreamCenterX(z0);
    const x1 = getStreamCenterX(z1);
    const w0 = 0.48 + 0.16 * t0;
    const w1 = 0.48 + 0.16 * t1;
    const y0 = getFlowerTerrainY(x0, z0) + 0.065;
    const y1 = getFlowerTerrainY(x1, z1) + 0.065;
    sPos.push(
      x0 - w0, y0, z0, x0 + w0, y0, z0, x1 + w1, y1, z1,
      x0 - w0, y0, z0, x1 + w1, y1, z1, x1 - w1, y1, z1
    );
    sUvs.push(0, t0 * 3, 1, t0 * 3, 1, t1 * 3, 0, t0 * 3, 1, t1 * 3, 0, t1 * 3);
  }
  const streamGeo = new THREE.BufferGeometry();
  streamGeo.setAttribute("position", new THREE.Float32BufferAttribute(sPos, 3));
  streamGeo.setAttribute("uv", new THREE.Float32BufferAttribute(sUvs, 2));
  streamGeo.computeVertexNormals();
  const streamMat = wetSurfaceMat(0xffffff, {
    map: tex.streamTex,
    roughness: 0.12,
    metalness: 0.08,
    transparent: true,
    opacity: 0.88,
  });
  const streamMesh = new THREE.Mesh(streamGeo, streamMat);
  streamMesh.raycast = () => {};
  parent.add(streamMesh);

  // Pebble banks & mossy spring boulders
  const rng = mulberry32(6614);
  const rockMats = [toonMat(0x7c8e91), toonMat(0x637874), toonMat(0x95a5a2)];
  for (let i = 0; i < 40; i += 1) {
    const bz = -20.7 + (i / 39) * 7.15;
    const side = i % 2 === 0 ? -1 : 1;
    const bx = getStreamCenterX(bz) + side * (0.56 + rng() * 0.28);
    const by = getFlowerTerrainY(bx, bz) + 0.03;
    const rad = i < 5 ? 0.34 + rng() * 0.2 : 0.12 + rng() * 0.13;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rad, 0), rockMats[i % 3]);
    rock.scale.set(1.25, 0.68, 1.05);
    rock.position.set(bx, by, bz);
    rock.rotation.y = rng() * Math.PI;
    rock.raycast = () => {};
    parent.add(rock);
  }

  // Curved Japanese Red-Lacquered Wooden Arch Footbridge ("朱漆木拱桥") at Z = -16.25
  const bridgeGroup = new THREE.Group();
  const bz = -16.25;
  const bx = getStreamCenterX(bz);
  const bankY = Math.max(getFlowerTerrainY(bx - 1.25, bz), getFlowerTerrainY(bx + 1.25, bz));
  bridgeGroup.position.set(bx, bankY, bz);

  const redLacquerMat = toonMat(0xc93b33);
  const brassMat = toonMat(PALETTE.brassGold);
  const span = 2.68;

  for (let sx of [-1.26, 1.26]) {
    const abut = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.65, 1.18), stoneMat);
    abut.position.set(sx, -0.22, 0);
    bridgeGroup.add(abut);
  }

  for (let p = 0; p <= 14; p += 1) {
    const u = p / 14 - 0.5;
    const px = u * span;
    const archY = Math.cos(u * Math.PI) * 0.42;
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.055, 1.04), p % 2 === 0 ? redLacquerMat : timberMat);
    slat.position.set(px, archY, 0);
    slat.rotation.z = -Math.sin(u * Math.PI) * 0.32;
    bridgeGroup.add(slat);

    if (p % 3 === 1 || p === 0 || p === 14) {
      for (let sz of [-0.48, 0.48]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.038, 0.58, 8), redLacquerMat);
        post.position.set(px, archY + 0.29, sz);
        const giboshi = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.1, 8), brassMat);
        giboshi.position.set(px, archY + 0.62, sz);
        bridgeGroup.add(post, giboshi);
      }
    }
  }

  for (let sz of [-0.48, 0.48]) {
    const railPts = [];
    const beamPts = [];
    for (let k = 0; k <= 12; k += 1) {
      const u = k / 12 - 0.5;
      const rx = u * span;
      const ry = Math.cos(u * Math.PI) * 0.42;
      beamPts.push(new THREE.Vector3(rx, ry - 0.04, sz));
      railPts.push(new THREE.Vector3(rx, ry + 0.52, sz));
    }
    const archBeam = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(beamPts), 16, 0.045, 6, false),
      redLacquerMat
    );
    const topRail = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 16, 0.032, 6, false),
      redLacquerMat
    );
    bridgeGroup.add(archBeam, topRail);
  }
  bridgeGroup.traverse((c) => { if (c.isMesh) c.raycast = () => {}; });
  parent.add(bridgeGroup);

  return { sailsRotor, streamTex: tex.streamTex };
}

function buildKamakuraTramSystem(parent, tex) {
  const trackZ = -12.85;
  const baseRailY = 1.18;
  const darkTimberMat = toonMat(0x5c4636);
  const railSteelMat = wetSurfaceMat(0x8e9ca2, { roughness: 0.25, metalness: 0.65 });
  const poleGreenMat = toonMat(0x3a5a4e);
  const wireMat = toonMat(0x2a3338);

  // Gravel ballast bed + 66 instanced wooden sleepers + twin steel rails
  const ballast = new THREE.Mesh(new THREE.BoxGeometry(32.2, 0.055, 1.48), toonMat(0xbdb6aa));
  ballast.position.set(-4.8, baseRailY + 0.015, trackZ);
  ballast.raycast = () => {};
  parent.add(ballast);

  const sleeperCount = 66;
  const sleeperInst = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.15, 0.05, 1.24),
    darkTimberMat,
    sleeperCount
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < sleeperCount; i += 1) {
    dummy.position.set(-20.6 + (i / (sleeperCount - 1)) * 31.6, baseRailY + 0.05, trackZ);
    dummy.updateMatrix();
    sleeperInst.setMatrixAt(i, dummy.matrix);
  }
  sleeperInst.raycast = () => {};
  parent.add(sleeperInst);

  for (let rz of [-0.41, 0.41]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(32.0, 0.055, 0.05), railSteelMat);
    rail.position.set(-4.8, baseRailY + 0.09, trackZ + rz);
    rail.raycast = () => {};
    parent.add(rail);
  }

  for (let bx of [-20.7, 11.1]) {
    const buf = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 1.12), toonMat(0xc85542));
    buf.position.set(bx, baseRailY + 0.25, trackZ);
    addEdgeInk(buf, 26);
    buf.raycast = () => {};
    parent.add(buf);
  }

  // Cute Kamakura Wooden Station Platform ("星語花湾駅") at X = -6.5, Z = -13.78
  const stGroup = new THREE.Group();
  stGroup.position.set(-6.5, baseRailY, -13.78);
  const plat = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.36, 0.86), toonMat(0xcac5b8));
  plat.position.y = 0.16;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.92), toonMat(0x6eb5a5));
  roof.position.set(0, 1.76, -0.05);
  roof.rotation.x = 0.14;
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.28, 0.32), toonMat(PALETTE.villaWood));
  bench.position.set(-0.45, 0.48, -0.16);
  const signBoard = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.44, 0.05),
    toonMat(0xffffff, { map: tex.stationSignTex, unique: true })
  );
  signBoard.position.set(0.72, 1.18, -0.22);
  for (let px of [-1.05, 1.05]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.45, 0.08), darkTimberMat);
    p.position.set(px, 1.04, -0.22);
    stGroup.add(p);
  }
  stGroup.add(plat, roof, bench, signBoard);
  stGroup.traverse((c) => { if (c.isMesh) c.raycast = () => {}; });
  parent.add(stGroup);

  // 8 Overhead catenary tram poles + continuous contact wire
  for (let i = 0; i < 8; i += 1) {
    const px = -19.5 + i * 4.28;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 2.95, 8), poleGreenMat);
    pole.position.set(px, baseRailY + 1.45, trackZ - 0.82);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.02, 6), poleGreenMat);
    arm.rotation.x = Math.PI * 0.5;
    arm.position.set(px, baseRailY + 2.72, trackZ - 0.34);
    pole.raycast = () => {};
    arm.raycast = () => {};
    parent.add(pole, arm);
  }
  const contactWire = new THREE.Mesh(new THREE.BoxGeometry(31.2, 0.018, 0.018), wireMat);
  contactWire.position.set(-4.6, baseRailY + 2.66, trackZ);
  contactWire.raycast = () => {};
  parent.add(contactWire);

  // Hero Single-Car Retro Forest-Green & Cream-Ivory Seaside Tram ("tram")
  const tramGroup = new THREE.Group();
  tramGroup.position.set(-4.5, baseRailY + 0.12, trackZ);

  const forestMat = toonMat(0x2d6a4f);
  const ivoryMat = toonMat(0xf8f1df);
  const goldBandMat = toonMat(0xeabf58);
  const roofGreyMat = toonMat(0xd4dbd9);
  const bogieMat = toonMat(0x2b3338);
  const clearWinMat = glassMat({ color: 0xe2f7f8, opacity: 0.28 });
  const headlightMat = emissiveMat(0xfff0b3, 1.45);
  const cabinGlowMat = emissiveMat(0xffe5a3, 0.85);

  // Bogies & wheels
  for (let bx of [-1.25, 1.25]) {
    const bogie = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.18, 0.96), bogieMat);
    bogie.position.set(bx, 0.14, 0);
    tramGroup.add(bogie);
    for (let wx of [-0.28, 0.28]) {
      for (let wz of [-0.41, 0.41]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 12), railSteelMat);
        wh.rotation.x = Math.PI * 0.5;
        wh.position.set(bx + wx, 0.14, wz);
        tramGroup.add(wh);
      }
    }
  }

  // Lower forest-green body + rounded noses + gold beltline
  const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(3.76, 0.78, 1.32), forestMat);
  lowerHull.position.y = 0.64;
  addEdgeInk(lowerHull, 26);
  const goldBelt = new THREE.Mesh(new THREE.BoxGeometry(3.82, 0.065, 1.34), goldBandMat);
  goldBelt.position.y = 1.04;
  const cabinFloor = new THREE.Mesh(new THREE.BoxGeometry(3.68, 0.05, 1.22), toonMat(0xb98556));
  cabinFloor.position.y = 1.02;
  tramGroup.add(lowerHull, goldBelt, cabinFloor);

  for (let ex of [-1.88, 1.88]) {
    const noseLow = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.78, 16), forestMat);
    noseLow.scale.set(0.45, 1, 1);
    noseLow.position.set(ex, 0.64, 0);
    const noseGold = new THREE.Mesh(new THREE.CylinderGeometry(0.67, 0.67, 0.065, 16), goldBandMat);
    noseGold.scale.set(0.46, 1, 1);
    noseGold.position.set(ex, 1.04, 0);
    const headLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.08, 12), headlightMat);
    headLamp.rotation.z = Math.PI * 0.5;
    headLamp.position.set(ex + Math.sign(ex) * 0.3, 0.78, 0);
    const destBox = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.44), cabinGlowMat);
    destBox.position.set(ex + Math.sign(ex) * 0.18, 1.82, 0);
    tramGroup.add(noseLow, noseGold, headLamp, destBox);
  }

  // Warm wooden & velvet longitudinal seats inside (NO people!)
  for (let sz of [-0.42, 0.42]) {
    const seatWood = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.18, 0.28), toonMat(0xa86f44));
    seatWood.position.set(0, 1.13, sz);
    const seatCush = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.06, 0.25), toonMat(0xd46a5e));
    seatCush.position.set(0, 1.24, sz);
    tramGroup.add(seatWood, seatCush);
  }

  // Cream-ivory window pillars + clear glass cabin enclosure + rounded roof & pantograph
  for (let px of [-1.78, -1.06, -0.35, 0.35, 1.06, 1.78]) {
    for (let pz of [-0.63, 0.63]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.82, 0.06), ivoryMat);
      pil.position.set(px, 1.46, pz);
      tramGroup.add(pil);
    }
  }
  const upperBand = new THREE.Mesh(new THREE.BoxGeometry(3.96, 0.14, 1.32), ivoryMat);
  upperBand.position.y = 1.88;
  const glassBox = new THREE.Mesh(new THREE.BoxGeometry(4.08, 0.74, 1.26), clearWinMat);
  glassBox.position.y = 1.46;
  const ceilLamp = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.04, 0.26), cabinGlowMat);
  ceilLamp.position.y = 1.84;
  const carRoof = new THREE.Mesh(new THREE.BoxGeometry(4.12, 0.16, 1.34), roofGreyMat);
  carRoof.position.y = 2.02;
  addEdgeInk(carRoof, 26);
  tramGroup.add(upperBand, glassBox, ceilLamp, carRoof);

  for (let vx of [-1.1, 0, 1.1]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.54), roofGreyMat);
    pod.position.set(vx, 2.14, 0);
    tramGroup.add(pod);
  }

  // Diamond-frame brass/steel roof pantograph kissing the overhead contact wire
  const panto = new THREE.Group();
  panto.position.set(0.65, 2.12, 0);
  const pRodMat = toonMat(0x525e63);
  [[-0.18, 0.14, 0.55], [0.18, 0.14, -0.55], [-0.18, 0.31, -0.55], [0.18, 0.31, 0.55]].forEach(([x, y, rz]) => {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 6), pRodMat);
    r.position.set(x, y, 0);
    r.rotation.z = rz;
    panto.add(r);
  });
  const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.022, 0.68), goldBandMat);
  shoe.position.y = 0.42;
  panto.add(shoe);
  tramGroup.add(panto);

  tagInteractive(tramGroup, "tram", "海边花海复古小电车", { accentColor: 0x3b7a57 });
  parent.add(tramGroup);

  return { tramGroup, headlightMat };
}

function buildHillsFloraAndEastCape(parent) {
  const trunkMat = toonMat(0x6b4c3b);
  const sakuraCols = [toonMat(0xffcadb), toonMat(0xf7a4be), toonMat(0xffe6ef)];
  const emeraldCols = [toonMat(0x4ea854), toonMat(0x68c45c), toonMat(0x3b8c4c)];
  const rng = mulberry32(9104);

  function spawnCloudTree(x, z, mats, scale = 1.0, isCypress = false) {
    const g = new THREE.Group();
    g.position.set(x, getFlowerTerrainY(x, z) - 0.05, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.95, 6), trunkMat);
    trunk.position.y = 0.45;
    g.add(trunk);
    if (isCypress) {
      const cone1 = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.55, 7), mats[2]);
      cone1.position.y = 1.28;
      const cone2 = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.15, 7), mats[0]);
      cone2.position.y = 1.85;
      g.add(cone1, cone2);
    } else {
      const puffs = [[0, 1.24, 0, 0.56], [-0.36, 1.04, 0.22, 0.42], [0.38, 1.06, -0.18, 0.44], [0.14, 1.12, 0.36, 0.39], [-0.18, 1.08, -0.34, 0.4]];
      puffs.forEach(([px, py, pz, r], idx) => {
        const pf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mats[idx % mats.length]);
        pf.scale.y = 0.82;
        pf.position.set(px, py, pz);
        g.add(pf);
      });
    }
    g.scale.setScalar(scale);
    g.traverse((c) => { if (c.isMesh) c.raycast = () => {}; });
    parent.add(g);
  }

  // 18 Blooming Pastel-Pink Sakura Trees ("染井吉野樱")
  const sakuraXZ = [
    [-19.2, -14.2], [-14.2, -14.0], [-10.8, -14.1], [-4.2, -14.0], [0.4, -14.2], [4.6, -14.1],
    [8.6, -13.9], [1.1, -16.8], [3.9, -15.8], [-12.5, -17.2], [-7.4, -16.2], [-1.2, -17.5],
    [5.4, -16.9], [10.4, -15.8], [14.6, -13.8], [-18.4, 2.5], [-14.2, 2.2], [-19.6, 10.8],
  ];
  sakuraXZ.forEach(([sx, sz], i) => spawnCloudTree(sx, sz, sakuraCols, 1.08 + (i % 3) * 0.16, false));

  // 24 Lush Emerald Anime Broadleaf & Coastal Cypress Trees
  const emeraldXZ = [
    [-20.6, -19.8], [-18.2, -20.4], [-13.6, -20.2], [-10.8, -20.5], [-6.8, -20.3], [-2.4, -20.4],
    [0.8, -20.1], [4.4, -20.3], [8.8, -20.2], [12.4, -20.1], [16.2, -19.8], [19.8, -19.6],
    [-20.4, -16.2], [-19.8, -7.5], [-20.5, -1.8], [-20.4, 6.2], [-20.2, 17.8], [-10.2, 20.4],
    [15.4, -17.8], [19.6, -16.4], [20.4, -10.4], [19.8, -6.8], [16.8, -9.6], [13.6, -10.4],
  ];
  emeraldXZ.forEach(([ex, ez], i) => spawnCloudTree(ex, ez, emeraldCols, 0.96 + (i % 4) * 0.15, i % 4 === 1));

  // 5 Miniature Tile-Roofed Hillside Cottages with Warm Glowing Windows
  const cottageSpecs = [
    { x: -9.4, z: -17.8, roof: 0xe27d6d, wall: 0xfbf3e4, yaw: 0.18 },
    { x: -3.4, z: -18.5, roof: 0x5d8aa0, wall: 0xf7f6ec, yaw: -0.14 },
    { x: 6.8, z: -18.0, roof: 0xe69274, wall: 0xfdf1e6, yaw: 0.24 },
    { x: 12.4, z: -16.6, roof: 0x67a69a, wall: 0xfaf5ea, yaw: -0.22 },
    { x: 17.4, z: -14.8, roof: 0xde7a6e, wall: 0xfbf4e6, yaw: -0.35 },
  ];
  const warmWinMat = emissiveMat(0xffe194, 1.3);
  cottageSpecs.forEach((cs) => {
    const cg = new THREE.Group();
    cg.position.set(cs.x, getFlowerTerrainY(cs.x, cs.z), cs.z);
    cg.rotation.y = cs.yaw;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.78, 1.15, 1.48), toonMat(0x9ca49e));
    plinth.position.y = -0.45;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.58, 1.05, 1.28), toonMat(cs.wall));
    body.position.y = 0.62;
    addEdgeInk(body, 25);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.24, 0.72, 4), toonMat(cs.roof));
    roof.rotation.y = Math.PI * 0.25;
    roof.scale.set(1.12, 1, 0.92);
    roof.position.y = 1.48;
    addEdgeInk(roof, 25);
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.22), toonMat(0xd8cfc4));
    chim.position.set(0.42, 1.56, -0.22);
    for (let wx of [-0.38, 0.38]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.06), warmWinMat);
      win.position.set(wx, 0.68, 0.63);
      cg.add(win);
    }
    cg.add(plinth, body, roof, chim);
    cg.traverse((c) => { if (c.isMesh) c.raycast = () => {}; });
    parent.add(cg);
  });

  // Patch D: White Coastal Timber Rail Fence + Vintage Mint Bicycle ("bicycle") + Outer Breakwater
  const whiteFenceMat = toonMat(0xfaf9f4);
  for (let i = 0; i <= 10; i += 1) {
    const fx = 12.6 + i * 0.86;
    const fz = -2.02;
    const fy = getFlowerTerrainY(fx, fz);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.76, 0.08), whiteFenceMat);
    post.position.set(fx, fy + 0.34, fz);
    post.raycast = () => {};
    parent.add(post);
    if (i < 10) {
      const nx = fx + 0.86;
      const ny = getFlowerTerrainY(nx, fz);
      for (let rh of [0.28, 0.56]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.045, 0.04), whiteFenceMat);
        rail.position.set((fx + nx) * 0.5, (fy + ny) * 0.5 + rh, fz);
        rail.rotation.z = Math.atan2(ny - fy, 0.86);
        rail.raycast = () => {};
        parent.add(rail);
      }
    }
  }

  // Vintage Mint-Pastel Bicycle with Wicker Flower Basket ("bicycle") at (+14.8, ~1.55, -3.2)
  const bikeGroup = new THREE.Group();
  bikeGroup.position.set(14.8, getFlowerTerrainY(14.8, -3.2), -3.2);
  bikeGroup.rotation.set(0.14, -0.48, 0);

  const mintFrameMat = toonMat(0x8cd8ca);
  const creamTireMat = toonMat(0xf7efe0);
  const leatherMat = toonMat(0xa46843);
  const chromeMat = wetSurfaceMat(0xdce4e6, { roughness: 0.2, metalness: 0.75 });

  const flagstone = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.84, 0.08, 16), toonMat(0xe5dfd2));
  flagstone.position.y = 0.01;
  bikeGroup.add(flagstone);

  for (let wx of [-0.46, 0.46]) {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.036, 8, 22), creamTireMat);
    tire.position.set(wx, 0.31, 0);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8), chromeMat);
    hub.rotation.x = Math.PI * 0.5;
    hub.position.set(wx, 0.31, 0);
    bikeGroup.add(tire, hub);
  }
  const frameCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.46, 0.31, 0),
    new THREE.Vector3(-0.08, 0.32, 0),
    new THREE.Vector3(0.34, 0.64, 0),
  ]);
  const downTube = new THREE.Mesh(new THREE.TubeGeometry(frameCurve, 12, 0.024, 6, false), mintFrameMat);
  const seatTube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.52, 6), mintFrameMat);
  seatTube.position.set(-0.14, 0.52, 0);
  seatTube.rotation.z = 0.24;
  const forkTube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.62, 6), mintFrameMat);
  forkTube.position.set(0.38, 0.58, 0);
  forkTube.rotation.z = 0.26;
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.16), leatherMat);
  saddle.position.set(-0.21, 0.78, 0);
  const handleBar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.46, 6), chromeMat);
  handleBar.rotation.x = Math.PI * 0.5;
  handleBar.position.set(0.29, 0.88, 0);
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.22, 10), toonMat(0xc7955d));
  basket.position.set(0.46, 0.74, 0);
  for (let bf = 0; bf < 5; bf += 1) {
    const fl = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.065, 0),
      toonMat(bf % 2 === 0 ? 0x7ec4f2 : 0xf7a4be)
    );
    fl.position.set(0.46 + (rng() - 0.5) * 0.14, 0.87, (rng() - 0.5) * 0.14);
    bikeGroup.add(fl);
  }
  bikeGroup.add(downTube, seatTube, forkTube, saddle, handleBar, basket);
  tagInteractive(bikeGroup, "bicycle", "花篱边的复古单车", { accentColor: PALETTE.villaTrimMint });
  parent.add(bikeGroup);

  // Extended Outer Harbor Breakwater & Mint-White Beacon in Sea Bay
  const bwConcMat = toonMat(0xcbd4d6);
  const bwDeckMat = toonMat(0xe1e8e9);
  const bwShoreLink = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.85, 6.9), bwConcMat);
  bwShoreLink.position.set(18.85, -0.875, 1.95);
  addEdgeInk(bwShoreLink, 25);
  const bwMainJetty = new THREE.Mesh(new THREE.BoxGeometry(4.9, 3.85, 1.1), bwConcMat);
  bwMainJetty.position.set(16.95, -0.875, 4.85);
  addEdgeInk(bwMainJetty, 25);
  const bwMainCap = new THREE.Mesh(new THREE.BoxGeometry(4.96, 0.08, 1.16), bwDeckMat);
  bwMainCap.position.set(16.95, 1.05, 4.85);
  const bwHead = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.78, 3.88, 16), bwConcMat);
  bwHead.position.set(14.8, -0.87, 4.85);
  addEdgeInk(bwHead, 26);

  // Cute Mint-and-White Striped Harbor Beacon at (+14.8, 1.05, +4.85)
  const beaconGroup = new THREE.Group();
  beaconGroup.position.set(14.8, 1.05, 4.85);
  for (let b = 0; b < 4; b += 1) {
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28 - b * 0.025, 0.305 - b * 0.025, 0.42, 12),
      toonMat(b % 2 === 0 ? 0xfafbf8 : 0x6ecbb8)
    );
    seg.position.y = 0.21 + b * 0.42;
    beaconGroup.add(seg);
  }
  const lanternGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.28, 10), emissiveMat(0xb6ffe8, 1.35));
  lanternGlass.position.y = 1.82;
  const beaconCap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.24, 10), toonMat(0x52b6a2));
  beaconCap.position.y = 2.08;
  beaconGroup.add(lanternGlass, beaconCap);
  [bwShoreLink, bwMainJetty, bwMainCap, bwHead, beaconGroup].forEach((o) => {
    o.traverse((c) => { if (c.isMesh) c.raycast = () => {}; });
    parent.add(o);
  });

  return { cottageSpecs };
}

function createSingleFlowerGeo() {
  function prepPart(geo, r, g, b, maskVal) {
    const g2 = geo.index ? geo.toNonIndexed() : geo;
    const count = g2.attributes.position.count;
    const cols = new Float32Array(count * 3);
    const masks = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      cols[i * 3 + 0] = r;
      cols[i * 3 + 1] = g;
      cols[i * 3 + 2] = b;
      masks[i] = maskVal;
    }
    g2.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    g2.setAttribute("aPetalMask", new THREE.BufferAttribute(masks, 1));
    return g2;
  }

  const parts = [];
  const stem = new THREE.CylinderGeometry(0.012, 0.016, 0.24, 3, 1, true);
  stem.translate(0, 0.12, 0);
  parts.push(prepPart(stem, 0.29, 0.64, 0.3, 0.0));

  const leaf = new THREE.PlaneGeometry(0.095, 0.042, 1, 1);
  leaf.rotateX(-0.55);
  leaf.rotateZ(-0.48);
  leaf.translate(0.04, 0.11, 0);
  parts.push(prepPart(leaf, 0.37, 0.73, 0.34, 0.0));

  for (let k = 0; k < 4; k += 1) {
    const petal = new THREE.PlaneGeometry(0.128, 0.168, 1, 1);
    petal.translate(0, 0.08, 0);
    petal.rotateX(1.18);
    petal.rotateY((k * Math.PI * 2) / 4 + 0.38);
    petal.translate(0, 0.244, 0);
    parts.push(prepPart(petal, 1.0, 1.0, 1.0, 1.0));
  }

  const stamen = new THREE.ConeGeometry(0.05, 0.04, 3);
  stamen.translate(0, 0.258, 0);
  parts.push(prepPart(stamen, 1.0, 0.84, 0.22, 0.0));

  return mergeGeometries(parts, false);
}

function createWindFlowerMaterial(windUniforms) {
  const mat = toonMat(0xffffff, {
    side: THREE.DoubleSide,
    unique: true,
    bands: [168, 212, 242, 255],
  });
  mat.vertexColors = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uTime;\nattribute float aPetalMask;"
      )
      .replace(
        "#include <color_vertex>",
        `#include <color_vertex>
#if defined( USE_COLOR ) && defined( USE_INSTANCING_COLOR )
  vColor.xyz = mix( color.xyz, instanceColor.xyz, aPetalMask );
#endif`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 iPos = instanceMatrix[3].xyz;
  float swayH = clamp( position.y / 0.26, 0.0, 1.0 );
  swayH *= swayH;
  float w1 = sin( uTime * 2.15 + iPos.x * 0.42 + iPos.z * 0.31 );
  float w2 = cos( uTime * 1.48 - iPos.x * 0.21 + iPos.z * 0.52 );
  float gust = 0.058 + 0.032 * sin( uTime * 0.75 + ( iPos.x - iPos.z ) * 0.15 );
  transformed.x += ( w1 * 0.7 + w2 * 0.3 ) * gust * swayH;
  transformed.z += ( w2 * 0.65 - w1 * 0.35 ) * gust * swayH;
  transformed.y -= abs( w1 ) * 0.012 * swayH;
#endif`
      );
  };
  mat.customProgramCacheKey = () => "flower-sea-wind-toon-v1";
  return mat;
}

function buildGpuFlowerSeaAndPetals(parent, boardwalkSamples, cottageSpecs, windUniforms) {
  const rng = mulberry32(20261112);
  const flowerGeo = createSingleFlowerGeo();
  const flowerMat = createWindFlowerMaterial(windUniforms);

  const RIBBON_TARGET = 2350; // 5 x 2,350 = 11,750 multi-petal 3D blooms!
  const buckets = [[], [], [], [], []];
  const palettes = [
    [0x56bcf7, 0x89d3ff, 0x45acee], // 0: Sky-Blue Nemophila
    [0xf896b6, 0xffbad0, 0xf27ea4], // 1: Sakura-Pink & Blush Cosmos
    [0xf56f64, 0xff927e, 0xeb5e52], // 2: Warm Coral-Rose
    [0xfad034, 0xffe25e, 0xf2bc22], // 3: Sunlit Golden Rapeseed
    [0xffffff, 0xbfa8f4, 0xd8ccf8], // 4: Crisp White Marguerite Daisies & Lavender
  ];

  function isValidFlowerSpot(x, z) {
    const inA1 = x >= -12.0 && x <= -3.72 && z >= 11.92 && z <= 14.0;
    const inA2 = x >= -12.0 && x <= -1.28 && z >= 14.0 && z <= 21.8;
    const inB = x >= -21.8 && x <= -11.78 && z >= -12.0 && z <= 21.8 && (x <= -12.04 || z >= 0.6);
    const inC = x >= -21.8 && x <= 21.8 && z >= -21.8 && z <= -12.06;
    const inD = x >= 12.08 && x <= 21.8 && z >= -12.0 && z <= -1.78;
    const inParterre =
      z >= -11.25 &&
      z <= -5.65 &&
      ((x >= -11.35 && x <= -7.35 && Math.hypot(x + 9.3, z + 8.4) > 1.38) ||
        (x >= -5.85 && x <= -3.05));
    if (!(inA1 || inA2 || inB || inC || inD || inParterre)) return false;

    if (z > -13.52 && z < -12.18 && x > -21.1 && x < 11.5) return false;
    if (x > -8.3 && x < -4.7 && z > -14.3 && z < -13.3) return false;
    if (Math.hypot(x + 16.2, z - 14.5) < 2.52) return false;
    if (Math.hypot(x + 15.8, z + 16.8) < 2.08) return false;
    if (Math.hypot(x - 14.8, z + 3.2) < 0.92) return false;
    if (z < -13.4 && z > -21.0 && Math.abs(x - getStreamCenterX(z)) < 0.98) return false;
    for (let i = 0; i < cottageSpecs.length; i += 1) {
      if (Math.hypot(x - cottageSpecs[i].x, z - cottageSpecs[i].z) < 1.55) return false;
    }
    for (let i = 0; i < boardwalkSamples.length; i += 2) {
      if (Math.hypot(x - boardwalkSamples[i].x, z - boardwalkSamples[i].z) < 0.8) return false;
    }
    return true;
  }

  let guard = 0;
  let filled = 0;
  while (filled < RIBBON_TARGET * 5 && guard < 260000) {
    guard += 1;
    const rx = -21.8 + rng() * 43.6;
    const rz = -21.8 + rng() * 43.6;
    if (!isValidFlowerSpot(rx, rz)) continue;
    let kind = getFlowerRibbonKind(rx, rz);
    if (buckets[kind].length >= RIBBON_TARGET) {
      kind = buckets.findIndex((b) => b.length < RIBBON_TARGET);
      if (kind < 0) break;
    }
    buckets[kind].push([rx, rz]);
    filled += 1;
  }

  const dummy = new THREE.Object3D();
  const upVec = new THREE.Vector3(0, 1, 0);
  const nrm = new THREE.Vector3();
  const col = new THREE.Color();

  buckets.forEach((pts, k) => {
    if (pts.length === 0) return;
    const inst = new THREE.InstancedMesh(flowerGeo, flowerMat, pts.length);
    const pal = palettes[k];
    for (let i = 0; i < pts.length; i += 1) {
      const [fx, fz] = pts[i];
      const isParterre = fx >= -11.4 && fx <= -3.0 && fz >= -11.3 && fz <= -5.6;
      const fy = (isParterre ? 1.30 : getFlowerTerrainY(fx, fz)) - 0.015;
      getTerrainNormal(fx, fz, nrm).lerp(upVec, 0.65).normalize();
      dummy.position.set(fx, fy, fz);
      dummy.quaternion.setFromUnitVectors(upVec, nrm);
      dummy.rotateY(rng() * Math.PI * 2);
      const sc = 0.85 + rng() * 0.56;
      dummy.scale.set(sc, sc * (0.88 + rng() * 0.34), sc);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);

      col.setHex(pal[i % pal.length]);
      col.offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.05);
      inst.setColorAt(i, col);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.userData.noCastShadow = true;
    inst.raycast = () => {};
    parent.add(inst);
  });

  // 90 Plump Cel-Shaded Hydrangea Bushes along tram, boardwalk, Villa border & East Cape
  const hydraSpots = [];
  for (let i = 0; i < 28; i += 1) {
    hydraSpots.push([-20.2 + i * 1.12, i % 2 === 0 ? -12.16 : -13.58]);
  }
  for (let i = 0; i < 22; i += 1) {
    const bs = boardwalkSamples[Math.min(boardwalkSamples.length - 1, i * 2 + 2)];
    hydraSpots.push([bs.x + (i % 2 === 0 ? 0.92 : -0.92), bs.z + (rng() - 0.5) * 0.35]);
  }
  for (let i = 0; i < 14; i += 1) {
    hydraSpots.push([-12.05 - rng() * 0.45, -3.5 + i * 1.12]);
  }
  for (let i = 0; i < 26; i += 1) {
    hydraSpots.push([12.6 + rng() * 8.6, -11.2 + rng() * 8.9]);
  }

  const leafBaseInst = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.32, 1),
    toonMat(0x3f914e),
    hydraSpots.length
  );
  const bloomPuffInst = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.17, 1),
    toonMat(0xffffff, { unique: true }),
    hydraSpots.length * 4
  );
  const hydraCols = [0x82c6f5, 0xbba8f0, 0xf6a6c1, 0x8be0d4];
  let bpIdx = 0;
  hydraSpots.forEach(([hx, hz], idx) => {
    const hy = getFlowerTerrainY(hx, hz);
    dummy.position.set(hx, hy + 0.16, hz);
    dummy.rotation.set(0, idx * 0.9, 0);
    dummy.scale.set(1.15, 0.72, 1.15);
    dummy.updateMatrix();
    leafBaseInst.setMatrixAt(idx, dummy.matrix);

    const baseCol = hydraCols[idx % hydraCols.length];
    for (let p = 0; p < 4; p += 1) {
      const a = (p * Math.PI) / 2 + idx * 0.5;
      dummy.position.set(hx + Math.cos(a) * 0.17, hy + 0.31 + (p % 2) * 0.06, hz + Math.sin(a) * 0.17);
      dummy.scale.setScalar(0.88 + (p % 3) * 0.14);
      dummy.updateMatrix();
      bloomPuffInst.setMatrixAt(bpIdx, dummy.matrix);
      col.setHex(baseCol).offsetHSL((p - 1.5) * 0.02, 0, (p % 2) * 0.04);
      bloomPuffInst.setColorAt(bpIdx, col);
      bpIdx += 1;
    }
  });
  leafBaseInst.raycast = () => {};
  bloomPuffInst.raycast = () => {};
  if (bloomPuffInst.instanceColor) bloomPuffInst.instanceColor.needsUpdate = true;
  parent.add(leafBaseInst, bloomPuffInst);

  // 320 Drifting 3D Sakura & Flower Petals
  const PETAL_COUNT = 320;
  const petalGeo = new THREE.PlaneGeometry(0.085, 0.115, 1, 1);
  const petalInst = new THREE.InstancedMesh(
    petalGeo,
    toonMat(0xffffff, { side: THREE.DoubleSide, unique: true }),
    PETAL_COUNT
  );
  const petalCols = [0xffc4d6, 0xf7a4be, 0xfff5f8, 0x9ad9ff];
  const petalStates = [];
  for (let i = 0; i < PETAL_COUNT; i += 1) {
    petalStates.push({
      x: -20.5 + rng() * 38.0,
      y: 1.5 + rng() * 7.5,
      z: -20.0 + rng() * 38.0,
      vx: 0.48 + rng() * 0.45,
      vy: -0.26 - rng() * 0.22,
      vz: 0.38 + rng() * 0.42,
      phase: rng() * Math.PI * 2,
      spin: 1.6 + rng() * 2.4,
    });
    col.setHex(petalCols[i % petalCols.length]);
    petalInst.setColorAt(i, col);
  }
  if (petalInst.instanceColor) petalInst.instanceColor.needsUpdate = true;
  petalInst.userData.noCastShadow = true;
  petalInst.raycast = () => {};
  parent.add(petalInst);

  return { petalInst, petalStates };
}

export function buildFlowerSeaWorld() {
  const group = new THREE.Group();
  group.name = "JapaneseFlowerSeaWorld";

  const windUniforms = { uTime: { value: 0 } };
  const tex = createWorldTextures();

  buildTerrainAndCutaways(group, tex);
  const { boardwalkSamples, swingPivot } = buildPromontoryBoardwalkAndGazebo(group);
  const { sailsRotor, streamTex } = buildWindmillAndStream(group, tex);
  const { tramGroup, headlightMat } = buildKamakuraTramSystem(group, tex);
  const { cottageSpecs } = buildHillsFloraAndEastCape(group);
  const { petalInst, petalStates } = buildGpuFlowerSeaAndPetals(
    group,
    boardwalkSamples,
    cottageSpecs,
    windUniforms
  );

  enableShadows(group, { cast: false, receive: true });
  group.traverse((c) => {
    if (!c.isMesh) return;
    if (c.userData.noCastShadow || c.isInstancedMesh) {
      c.castShadow = false;
      if (c.userData.noCastShadow) c.receiveShadow = false;
      return;
    }
    if (!c.geometry.boundingSphere) c.geometry.computeBoundingSphere();
    const r = c.geometry.boundingSphere ? c.geometry.boundingSphere.radius : 0;
    if (r >= 0.32 && r <= 9.0) {
      c.castShadow = true;
    }
  });

  let petalBurstTimer = 0;
  let windmillBoost = 0;
  let tramRingTimer = 0;
  let windmillAngle = 0;
  const pDummy = new THREE.Object3D();

  function burstPetals() {
    petalBurstTimer = 4.2;
    for (let i = 0; i < 110; i += 1) {
      const p = petalStates[i];
      const a = (i / 110) * Math.PI * 6;
      const r = 0.4 + (i % 9) * 0.24;
      const fromBike = i >= 80;
      p.x = (fromBike ? 14.8 : -16.2) + Math.cos(a) * r;
      p.z = (fromBike ? -3.2 : 14.5) + Math.sin(a) * r;
      p.y = (fromBike ? 2.1 : 3.4) + (i % 7) * 0.35;
    }
  }

  function boostWindmill() {
    windmillBoost = 3.4;
  }

  function ringTram() {
    tramRingTimer = 2.8;
  }

  function update(elapsed, dt) {
    windUniforms.uTime.value = elapsed;
    streamTex.offset.y = -(elapsed * 0.42) % 1;

    if (petalBurstTimer > 0) petalBurstTimer = Math.max(0, petalBurstTimer - dt);
    if (windmillBoost > 0) windmillBoost = Math.max(0, windmillBoost - dt * 0.85);
    if (tramRingTimer > 0) tramRingTimer = Math.max(0, tramRingTimer - dt);

    // Gentle floral swing motion inside the White Wrought-Iron Gazebo
    const swingAmp = 0.095 + (petalBurstTimer > 0 ? 0.065 : 0);
    swingPivot.rotation.x = Math.sin(elapsed * 1.52) * swingAmp;

    // Graceful Windmill canvas sails rotation
    windmillAngle += dt * (0.58 + windmillBoost * 0.95);
    sailsRotor.rotation.z = windmillAngle;

    // Kamakura Seaside Tram smooth glide along X in [-18.5, +9.2]
    const tramPhase = 1.28 + elapsed * 0.145;
    const s = 0.5 - 0.5 * Math.cos(tramPhase);
    tramGroup.position.x = THREE.MathUtils.lerp(-18.5, 9.2, s);
    tramGroup.position.y =
      1.3 + (tramRingTimer > 0 ? Math.abs(Math.sin(elapsed * 18.0)) * 0.022 : 0);
    headlightMat.emissiveIntensity =
      tramRingTimer > 0 ? 1.5 + Math.sin(elapsed * 20.0) * 0.7 : 1.45;

    // 320 Drifting 3D Sakura & Flower Petals
    const swirlMult = petalBurstTimer > 0 ? 2.35 : 1.0;
    for (let i = 0; i < petalStates.length; i += 1) {
      const p = petalStates[i];
      p.x += (p.vx + Math.sin(elapsed * 0.9 + p.phase) * 0.25) * dt * swirlMult;
      p.y += (p.vy + (petalBurstTimer > 2.2 && i < 110 ? 0.85 : 0)) * dt;
      p.z += (p.vz + Math.cos(elapsed * 0.8 + p.phase) * 0.22) * dt * swirlMult;

      if (p.y < 0.35 || p.x > 19.5 || p.z > 20.5) {
        p.x = -20.8 + ((i * 1.37) % 26.0);
        p.z = -19.8 + ((i * 2.19) % 34.0);
        p.y = 4.2 + (i % 9) * 0.55;
      }
      pDummy.position.set(p.x, p.y, p.z);
      pDummy.rotation.set(
        elapsed * p.spin + p.phase,
        elapsed * p.spin * 0.7,
        Math.sin(elapsed * 2.1 + p.phase) * 0.8
      );
      pDummy.scale.setScalar(petalBurstTimer > 0 && i < 110 ? 1.25 : 1.0);
      pDummy.updateMatrix();
      petalInst.setMatrixAt(i, pDummy.matrix);
    }
    petalInst.instanceMatrix.needsUpdate = true;
  }

  return { group, update, burstPetals, boostWindmill, ringTram };
}
