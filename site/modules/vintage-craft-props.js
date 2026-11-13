import * as THREE from "three";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function addMesh(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (rx || ry || rz) m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

// Creates a true pillowed cushion geometry with rounded corners and soft center loft
export function createPillowedCushionGeo(w, h, d, radius = 0.045, loft = 0.022) {
  const r = Math.min(radius, w * 0.35, d * 0.35);
  const hw = Math.max(0.01, w * 0.5 - r);
  const hd = Math.max(0.01, d * 0.5 - r);
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hd - r);
  shape.lineTo(hw, -hd - r);
  shape.absarc(hw, -hd, r, -Math.PI * 0.5, 0, false);
  shape.lineTo(hw + r, hd);
  shape.absarc(hw, hd, r, 0, Math.PI * 0.5, false);
  shape.lineTo(-hw, hd + r);
  shape.absarc(-hw, hd, r, Math.PI * 0.5, Math.PI, false);
  shape.lineTo(-hw - r, -hd);
  shape.absarc(-hw, -hd, r, Math.PI, Math.PI * 1.5, false);

  const bev = Math.min(h * 0.38, r * 0.85);
  const coreH = Math.max(0.008, h - bev * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: coreH,
    bevelEnabled: true,
    bevelThickness: bev,
    bevelSize: bev * 0.85,
    bevelSegments: 4,
    curveSegments: 8,
  });
  geo.rotateX(-Math.PI * 0.5);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const cx = (bb.min.x + bb.max.x) * 0.5;
  const cy = (bb.min.y + bb.max.y) * 0.5;
  const cz = (bb.min.z + bb.max.z) * 0.5;
  geo.translate(-cx, -cy, -cz);

  if (loft > 0) {
    const pos = geo.attributes.position;
    const sx = Math.max(0.02, w * 0.5);
    const sz = Math.max(0.02, d * 0.5);
    for (let i = 0; i < pos.count; i += 1) {
      const nx = clamp(pos.getX(i) / sx, -1, 1);
      const nz = clamp(pos.getZ(i) / sz, -1, 1);
      const dome = Math.cos(nx * Math.PI * 0.5) * Math.cos(nz * Math.PI * 0.5);
      const signY = pos.getY(i) >= 0 ? 1 : -0.35;
      pos.setY(i, pos.getY(i) + signY * loft * Math.max(0, dome));
    }
  }
  geo.computeVertexNormals();
  return geo;
}

// Plump pinched-corner throw / bed pillow
export function createPlumpPillowGeo(w = 0.44, h = 0.36, thick = 0.14) {
  const geo = new THREE.BoxGeometry(w, h, thick, 10, 8, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const ux = pos.getX(i) / (w * 0.5);
    const uy = pos.getY(i) / (h * 0.5);
    const uz = pos.getZ(i) / (thick * 0.5);
    const bulge = Math.cos(clamp(ux, -1, 1) * 1.25) * Math.cos(clamp(uy, -1, 1) * 1.25);
    const pinch = 1.0 - 0.14 * ux * ux * uy * uy;
    pos.setX(i, pos.getX(i) * pinch);
    pos.setY(i, pos.getY(i) * pinch);
    pos.setZ(i, uz * (thick * 0.22 + thick * 0.36 * Math.max(0.08, bulge)));
  }
  geo.computeVertexNormals();
  return geo;
}

// Turned Lathe profile helper from [radius, y] pairs
function createTurnedLatheGeo(profile, segs = 20) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y));
  const g = new THREE.LatheGeometry(pts, segs);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// 1. French Vintage Button-Tufted Chesterfield Velvet Sofa (Capitonné)
// ---------------------------------------------------------------------------
export function buildButtonTuftedChesterfieldSofa(mats) {
  const sofa = new THREE.Group();

  // 4 Turned French Walnut Bun Feet + Brass Caster Cups
  const bunGeo = createTurnedLatheGeo(
    [
      [0.018, 0.0],
      [0.032, 0.02],
      [0.026, 0.038],
      [0.056, 0.075],
      [0.062, 0.105],
      [0.044, 0.135],
      [0.048, 0.15],
    ],
    16
  );
  const cupGeo = new THREE.CylinderGeometry(0.034, 0.024, 0.025, 12);
  for (const [fx, fz] of [
    [-1.24, -0.34],
    [1.24, -0.34],
    [-1.24, 0.34],
    [1.24, 0.34],
  ]) {
    addMesh(sofa, bunGeo, mats.walnut, fx, 0, fz);
    addMesh(sofa, cupGeo, mats.brass, fx, 0.014, fz);
  }

  // Upholstered Base Plinth + Brass Nailhead Trim Rail
  const baseGeo = createPillowedCushionGeo(2.68, 0.19, 0.86, 0.06, 0.008);
  addMesh(sofa, baseGeo, mats.dustyRoseVelvet, 0, 0.23, 0.02);
  addMesh(sofa, new THREE.BoxGeometry(2.56, 0.028, 0.82), mats.walnut, 0, 0.145, 0.02);

  // 3 Plump Piped Velvet Seat Cushions
  const seatCushGeo = createPillowedCushionGeo(0.76, 0.15, 0.68, 0.065, 0.028);
  for (const cx of [-0.78, 0, 0.78]) {
    addMesh(sofa, seatCushGeo, mats.dustyRoseVelvet, cx, 0.39, 0.09);
  }

  // Continuous Rolled Chesterfield Backrest + Rolled Scroll Arms
  const backCoreGeo = createPillowedCushionGeo(2.52, 0.56, 0.24, 0.08, 0.032);
  addMesh(sofa, backCoreGeo, mats.deepRoseVelvet, 0, 0.60, -0.31, -0.08, 0, 0);

  // Top cylindrical rolled scroll crest
  const backRollCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.32, 0.82, -0.36),
    new THREE.Vector3(-0.65, 0.85, -0.38),
    new THREE.Vector3(0, 0.86, -0.39),
    new THREE.Vector3(0.65, 0.85, -0.38),
    new THREE.Vector3(1.32, 0.82, -0.36),
  ]);
  addMesh(sofa, new THREE.TubeGeometry(backRollCurve, 28, 0.115, 14, false), mats.deepRoseVelvet);

  // Left & Right Rolled Outward-Scrolling Arms + Brass Nailhead Studs
  const armBodyGeo = createPillowedCushionGeo(0.24, 0.48, 0.86, 0.07, 0.02);
  const studGeo = new THREE.SphereGeometry(0.009, 8, 6);
  for (const s of [-1, 1]) {
    addMesh(sofa, armBodyGeo, mats.dustyRoseVelvet, s * 1.24, 0.54, 0.02, 0, 0, -s * 0.08);
    const armRoll = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 1.28, 0.80, -0.36),
      new THREE.Vector3(s * 1.33, 0.79, 0.04),
      new THREE.Vector3(s * 1.32, 0.76, 0.42),
    ]);
    addMesh(sofa, new THREE.TubeGeometry(armRoll, 16, 0.11, 14, false), mats.dustyRoseVelvet);

    // Front Scroll Face Medallion + Brass Nailhead Ring
    const faceDisc = new THREE.CylinderGeometry(0.105, 0.105, 0.03, 18);
    faceDisc.rotateX(Math.PI * 0.5);
    addMesh(sofa, faceDisc, mats.deepRoseVelvet, s * 1.31, 0.75, 0.43);
    for (let n = 0; n < 12; n += 1) {
      const a = (n / 12) * Math.PI * 2;
      addMesh(
        sofa,
        studGeo,
        mats.brass,
        s * 1.31 + Math.cos(a) * 0.086,
        0.75 + Math.sin(a) * 0.086,
        0.446
      );
    }
  }

  // Diamond Capitonné Tufting Buttons across the Backrest
  const btnGeo = new THREE.SphereGeometry(0.013, 8, 6);
  for (let row = 0; row < 3; row += 1) {
    const by = 0.50 + row * 0.12;
    const bz = -0.19 - row * 0.012;
    const cols = row % 2 === 0 ? 9 : 8;
    const span = row % 2 === 0 ? 2.0 : 1.78;
    for (let c = 0; c < cols; c += 1) {
      const bx = -span * 0.5 + (c / (cols - 1)) * span;
      addMesh(sofa, btnGeo, c % 3 === 1 ? mats.brass : mats.deepRoseVelvet, bx, by, bz);
    }
  }

  // 4 Plump Pinched-Corner Velvet & Silk Throw Pillows
  const pilLarge = createPlumpPillowGeo(0.44, 0.40, 0.16);
  const pilSmall = createPlumpPillowGeo(0.36, 0.32, 0.14);
  addMesh(sofa, pilLarge, mats.sageVelvet, -0.98, 0.58, -0.02, -0.18, 0.34, 0.08);
  addMesh(sofa, pilSmall, mats.blushSilk, -0.76, 0.55, 0.06, -0.22, 0.22, 0.05);
  addMesh(sofa, pilLarge, mats.sageVelvet, 0.98, 0.58, -0.02, -0.18, -0.34, -0.08);
  addMesh(sofa, pilSmall, mats.ivoryLinen, 0.74, 0.55, 0.06, -0.22, -0.18, -0.04);

  return sofa;
}

// ---------------------------------------------------------------------------
// 2. Antique 1905 Victor Monarch Horn Gramophone on Carved Walnut Pedestal
// ---------------------------------------------------------------------------
export function buildVictorHornGramophone(mats) {
  const grp = new THREE.Group();

  // Carved Turned French Walnut Pedestal Stand (H = 0.78m)
  const pedProfile = [
    [0.28, 0.0],
    [0.28, 0.04],
    [0.23, 0.08],
    [0.19, 0.13],
    [0.095, 0.22],
    [0.078, 0.46],
    [0.115, 0.56],
    [0.085, 0.64],
    [0.22, 0.73],
    [0.25, 0.76],
    [0.25, 0.78],
  ];
  addMesh(grp, createTurnedLatheGeo(pedProfile, 24), mats.walnut, 0, 0, 0);
  addMesh(grp, new THREE.TorusGeometry(0.098, 0.012, 8, 20), mats.brass, 0, 0.56, 0, Math.PI * 0.5, 0, 0);

  // Molded Walnut Gramophone Motor Case (Y = 0.78 -> 0.95m)
  const y0 = 0.78;
  addMesh(grp, createPillowedCushionGeo(0.40, 0.035, 0.40, 0.025, 0), mats.walnut, 0, y0 + 0.017, 0);
  addMesh(grp, new THREE.BoxGeometry(0.34, 0.12, 0.34), mats.walnut, 0, y0 + 0.09, 0);
  addMesh(grp, createPillowedCushionGeo(0.39, 0.032, 0.39, 0.022, 0), mats.walnut, 0, y0 + 0.165, 0);

  // 4 Turned Corner Colonnettes + Front Brass Manufacturer Plaque
  const colGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.12, 10);
  for (const [cx, cz] of [
    [-0.17, -0.17],
    [0.17, -0.17],
    [-0.17, 0.17],
    [0.17, 0.17],
  ]) {
    addMesh(grp, colGeo, mats.brass, cx, y0 + 0.09, cz);
  }
  addMesh(grp, new THREE.BoxGeometry(0.11, 0.045, 0.008), mats.brass, 0, y0 + 0.09, 0.174);

  // S-Curved Winding Crank on Right Side
  const crankCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.17, y0 + 0.08, 0.02),
    new THREE.Vector3(0.25, y0 + 0.08, 0.02),
    new THREE.Vector3(0.26, y0 + 0.15, 0.08),
    new THREE.Vector3(0.32, y0 + 0.15, 0.08),
  ]);
  addMesh(grp, new THREE.TubeGeometry(crankCurve, 14, 0.007, 8, false), mats.brass);
  addMesh(grp, new THREE.CylinderGeometry(0.012, 0.010, 0.055, 10), mats.walnut, 0.33, y0 + 0.15, 0.08, 0, 0, Math.PI * 0.5);

  // Green Felt Turntable Platter + 78rpm Shellac Record + Crimson Gold Label
  const yTop = y0 + 0.182;
  addMesh(grp, new THREE.CylinderGeometry(0.145, 0.15, 0.014, 24), mats.brass, 0, yTop + 0.007, 0.01);
  addMesh(grp, new THREE.CylinderGeometry(0.14, 0.14, 0.006, 24), mats.foliageLush, 0, yTop + 0.016, 0.01);
  addMesh(grp, new THREE.CylinderGeometry(0.135, 0.135, 0.005, 28), mats.wroughtIron, 0, yTop + 0.021, 0.01);
  addMesh(grp, new THREE.CylinderGeometry(0.046, 0.046, 0.006, 20), mats.waxSeal, 0, yTop + 0.022, 0.01);
  addMesh(grp, new THREE.CylinderGeometry(0.005, 0.005, 0.022, 8), mats.brass, 0, yTop + 0.028, 0.01);

  // Rear Ornate Brass Tonearm Bracket + Gooseneck Tonearm + Mica Soundbox
  const bracketCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, y0 + 0.13, -0.17),
    new THREE.Vector3(0, y0 + 0.20, -0.23),
    new THREE.Vector3(0, y0 + 0.33, -0.20),
  ]);
  addMesh(grp, new THREE.TubeGeometry(bracketCurve, 14, 0.016, 10, false), mats.brass);

  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, y0 + 0.30, -0.19),
    new THREE.Vector3(0.06, y0 + 0.25, -0.10),
    new THREE.Vector3(0.055, yTop + 0.042, -0.01),
  ]);
  addMesh(grp, new THREE.TubeGeometry(armCurve, 12, 0.009, 8, false), mats.mirrorSilver);
  addMesh(grp, new THREE.CylinderGeometry(0.026, 0.026, 0.012, 16), mats.mirrorSilver, 0.052, yTop + 0.038, 0.005, 0, 0, Math.PI * 0.42);

  // Sculpted 10-Petal Scalloped Brass Morning-Glory Horn!
  const rings = 18;
  const segs = 40;
  const hornGeo = new THREE.BufferGeometry();
  const verts = [];
  const uvs = [];
  const indices = [];
  for (let r = 0; r <= rings; r += 1) {
    const t = r / rings;
    // Curved horn spine rising from rear elbow (-0.20) forward toward (+0.16)
    const cy = y0 + 0.33 + Math.sin(t * Math.PI * 0.58) * 0.36;
    const cz = -0.20 + Math.pow(t, 1.15) * 0.38;
    const baseR = 0.018 + Math.pow(t, 2.35) * 0.235;
    const pitch = -0.35 - t * 0.92;
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);

    for (let s = 0; s <= segs; s += 1) {
      const a = (s / segs) * Math.PI * 2;
      // 10 scalloped Morning-Glory petals blooming toward bell mouth!
      const petalWave = 1.0 + Math.pow(t, 1.6) * 0.075 * Math.cos(10 * a);
      const flareLip = r === rings ? 1.04 : 1.0;
      const rad = baseR * petalWave * flareLip;
      const lx = Math.cos(a) * rad;
      const ly = Math.sin(a) * rad;
      const wy = cy + ly * cosP;
      const wz = cz + ly * sinP + Math.pow(t, 3) * 0.018 * Math.cos(10 * a);
      verts.push(lx, wy, wz);
      uvs.push(s / segs, t);
    }
  }
  for (let r = 0; r < rings; r += 1) {
    for (let s = 0; s < segs; s += 1) {
      const i0 = r * (segs + 1) + s;
      const i1 = i0 + 1;
      const i2 = i0 + (segs + 1);
      const i3 = i2 + 1;
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  }
  hornGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  hornGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  hornGeo.setIndex(indices);
  hornGeo.computeVertexNormals();

  const hornMat = mats.brass.clone();
  hornMat.side = THREE.DoubleSide;
  addMesh(grp, hornGeo, hornMat);

  return grp;
}

// ---------------------------------------------------------------------------
// 3. Smeg FAB28 Retro Rounded Mint-Sage Refrigerator
// ---------------------------------------------------------------------------
export function buildSmegRetroFridge(mats) {
  const fridge = new THREE.Group();
  const chrome = mats.mirrorSilver;

  // Voluptuous 1950s Rounded Monolith Body (W=0.88, H=1.92, D=0.72)
  const bodyGeo = createPillowedCushionGeo(0.88, 1.88, 0.66, 0.11, 0.012);
  addMesh(fridge, bodyGeo, mats.retroMintEnamel, 0, 0.98, -0.02);

  // Upper Freezer Pillowed Door + Lower Main Fridge Pillowed Door
  const upperDoor = createPillowedCushionGeo(0.84, 0.50, 0.08, 0.08, 0.022);
  addMesh(fridge, upperDoor, mats.retroMintEnamel, 0, 1.59, 0.31);
  const lowerDoor = createPillowedCushionGeo(0.84, 1.24, 0.08, 0.08, 0.024);
  addMesh(fridge, lowerDoor, mats.retroMintEnamel, 0, 0.69, 0.31);

  // Subtle dark rubber gasket shadow seam between doors
  addMesh(fridge, new THREE.BoxGeometry(0.82, 0.014, 0.06), mats.wroughtIron, 0, 1.325, 0.30);

  // 4 Retro Chrome Feet + 3 Right-Hand Exposed Retro Hinges
  for (const [fx, fz] of [
    [-0.34, -0.24],
    [0.34, -0.24],
    [-0.34, 0.24],
    [0.34, 0.24],
  ]) {
    addMesh(fridge, new THREE.CylinderGeometry(0.035, 0.025, 0.05, 10), chrome, fx, 0.025, fz);
  }
  for (const hy of [1.76, 1.24, 0.22]) {
    addMesh(fridge, new THREE.BoxGeometry(0.055, 0.032, 0.05), chrome, 0.42, hy, 0.31);
  }

  // Iconic 1950s Chunky Chrome Lever Handles (Left side)
  for (const hy of [1.46, 1.14]) {
    const hCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.33, hy, 0.34),
      new THREE.Vector3(-0.31, hy, 0.405),
      new THREE.Vector3(-0.12, hy, 0.40),
      new THREE.Vector3(-0.10, hy, 0.35),
    ]);
    addMesh(fridge, new THREE.TubeGeometry(hCurve, 12, 0.013, 8, false), chrome);
  }

  // Raised 3D Chrome "S M E G" Badge Letters across Upper Door
  for (let i = 0; i < 4; i += 1) {
    addMesh(
      fridge,
      createPillowedCushionGeo(0.038, 0.042, 0.014, 0.008, 0.003),
      chrome,
      -0.09 + i * 0.06,
      1.68,
      0.365
    );
  }

  return fridge;
}

// ---------------------------------------------------------------------------
// 4. La Cornue Château 120 Vaulted French Range Cooker + Bell Chimney Hood
// ---------------------------------------------------------------------------
export function buildLaCornueChateauRangeAndHood(mats) {
  const grp = new THREE.Group();

  // Monumental Enameled Cream Range Body (W=1.22, H=0.90, D=0.72)
  addMesh(grp, new THREE.BoxGeometry(1.22, 0.86, 0.72), mats.retroCreamEnamel, 0, 0.46, 0);
  addMesh(grp, new THREE.BoxGeometry(1.24, 0.06, 0.74), mats.wroughtIron, 0, 0.03, 0);

  // Brushed Brass Architectural Framing Straps & Full-Width Towel Rail
  for (const bx of [-0.60, 0, 0.60]) {
    addMesh(grp, new THREE.BoxGeometry(0.026, 0.84, 0.02), mats.brass, bx, 0.46, 0.362);
  }
  addMesh(grp, new THREE.BoxGeometry(1.23, 0.032, 0.025), mats.brass, 0, 0.82, 0.365);
  addMesh(grp, new THREE.CylinderGeometry(0.011, 0.011, 1.16, 12), mats.brass, 0, 0.75, 0.43, 0, 0, Math.PI * 0.5);
  for (const sx of [-0.52, 0.52]) {
    addMesh(grp, new THREE.CylinderGeometry(0.009, 0.009, 0.07, 8), mats.brass, sx, 0.75, 0.39, Math.PI * 0.5, 0, 0);
  }

  // 7 Turned Brass Control Knobs along Control Escutcheon
  const knobGeo = createTurnedLatheGeo(
    [
      [0.012, 0],
      [0.012, 0.012],
      [0.022, 0.018],
      [0.020, 0.028],
      [0.006, 0.031],
    ],
    12
  );
  knobGeo.rotateX(Math.PI * 0.5);
  for (let k = -3; k <= 3; k += 1) {
    addMesh(grp, knobGeo, mats.brass, k * 0.145, 0.82, 0.375);
  }

  // Twin Vaulted French Oven Doors with Arched Brass Trim & Dark Glass Windows
  for (const ox of [-0.30, 0.30]) {
    addMesh(grp, createPillowedCushionGeo(0.50, 0.54, 0.03, 0.03, 0.005), mats.retroCreamEnamel, ox, 0.42, 0.365);
    addMesh(grp, new THREE.BoxGeometry(0.51, 0.55, 0.018), mats.brass, ox, 0.42, 0.36);
    addMesh(grp, new THREE.BoxGeometry(0.34, 0.26, 0.036), mats.wroughtIron, ox, 0.46, 0.368);
    addMesh(grp, new THREE.CylinderGeometry(0.009, 0.009, 0.36, 10), mats.brass, ox, 0.63, 0.40, 0, 0, Math.PI * 0.5);
    addMesh(grp, new THREE.CylinderGeometry(0.035, 0.035, 0.01, 14), mats.brass, ox, 0.25, 0.382, Math.PI * 0.5, 0, 0);
  }

  // Cast-Iron French Top + 4 Gas Star Burners + Simmering Plaque + Copper Whistling Kettle
  addMesh(grp, new THREE.BoxGeometry(1.24, 0.035, 0.74), mats.mirrorSilver, 0, 0.905, 0);
  addMesh(grp, new THREE.BoxGeometry(0.32, 0.022, 0.54), mats.wroughtIron, 0, 0.93, -0.02);
  for (const [gx, gz] of [
    [-0.38, -0.14],
    [-0.38, 0.14],
    [0.38, -0.14],
    [0.38, 0.14],
  ]) {
    addMesh(grp, new THREE.BoxGeometry(0.24, 0.022, 0.24), mats.wroughtIron, gx, 0.93, gz);
    addMesh(grp, new THREE.CylinderGeometry(0.048, 0.052, 0.026, 12), mats.brass, gx, 0.932, gz);
  }

  // Sculpted Copper Tea Kettle on Front-Right Burner
  const kettleBody = createTurnedLatheGeo(
    [
      [0.095, 0.0],
      [0.118, 0.035],
      [0.108, 0.105],
      [0.068, 0.145],
      [0.072, 0.155],
    ],
    18
  );
  addMesh(grp, kettleBody, mats.copper, 0.38, 0.94, 0.14);
  addMesh(grp, new THREE.SphereGeometry(0.066, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mats.copper, 0.38, 1.08, 0.14);
  addMesh(grp, new THREE.SphereGeometry(0.016, 10, 8), mats.walnut, 0.38, 1.155, 0.14);
  addMesh(grp, new THREE.TorusGeometry(0.085, 0.009, 8, 16, Math.PI), mats.brass, 0.38, 1.10, 0.14);
  const spoutCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.46, 0.99, 0.14),
    new THREE.Vector3(0.53, 1.06, 0.14),
    new THREE.Vector3(0.55, 1.11, 0.14),
  ]);
  addMesh(grp, new THREE.TubeGeometry(spoutCurve, 8, 0.014, 8, false), mats.copper);

  // Curved Bell-Profile French Chimney Hood (Y = 1.78 -> 3.32m)
  const hoodShape = new THREE.Shape();
  hoodShape.moveTo(-0.34, 0);
  hoodShape.lineTo(0.34, 0);
  hoodShape.bezierCurveTo(0.34, 0.45, 0.18, 0.95, 0.16, 1.50);
  hoodShape.lineTo(-0.34, 1.50);
  hoodShape.closePath();
  const hoodGeo = new THREE.ExtrudeGeometry(hoodShape, {
    depth: 1.28,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 3,
  });
  hoodGeo.translate(0, 0, -0.64);
  hoodGeo.rotateY(Math.PI * 0.5);
  addMesh(grp, hoodGeo, mats.extBlushTrim, 0, 1.82, -0.02);
  addMesh(grp, new THREE.BoxGeometry(1.36, 0.075, 0.72), mats.brass, 0, 1.80, -0.01);
  for (const sx of [-0.42, 0.42]) {
    addMesh(grp, new THREE.BoxGeometry(0.028, 1.48, 0.02), mats.brass, sx, 2.56, 0.22);
  }

  return grp;
}

// ---------------------------------------------------------------------------
// 5. Belfast Farmhouse Apron Sink + Brass Bridge Gooseneck Faucet
// ---------------------------------------------------------------------------
export function buildFarmhouseSinkAndBridgeFaucet(mats) {
  const grp = new THREE.Group();

  // Glazed White Fireclay Belfast Apron Front + Deep Basin Rim
  const apron = createPillowedCushionGeo(0.78, 0.26, 0.12, 0.03, 0.008);
  addMesh(grp, apron, mats.zelligeTile, 0, -0.11, 0.34);
  addMesh(grp, new THREE.BoxGeometry(0.78, 0.04, 0.56), mats.zelligeTile, 0, 0.015, 0.06);
  addMesh(grp, new THREE.BoxGeometry(0.66, 0.02, 0.44), mats.mirrorSilver, 0, -0.002, 0.06);
  addMesh(grp, new THREE.CylinderGeometry(0.042, 0.042, 0.012, 16), mats.brass, 0, 0.008, 0.04);

  // Vintage French Brass Bridge Faucet with Gooseneck Spout & Porcelain Cross Taps
  for (const tx of [-0.11, 0.11]) {
    addMesh(grp, new THREE.CylinderGeometry(0.016, 0.024, 0.13, 12), mats.brass, tx, 0.085, -0.20);
    addMesh(grp, new THREE.CylinderGeometry(0.007, 0.007, 0.09, 8), mats.retroCreamEnamel, tx, 0.155, -0.20, 0, 0, Math.PI * 0.5);
    addMesh(grp, new THREE.CylinderGeometry(0.007, 0.007, 0.09, 8), mats.retroCreamEnamel, tx, 0.155, -0.20, Math.PI * 0.5, 0, 0);
  }
  addMesh(grp, new THREE.CylinderGeometry(0.011, 0.011, 0.24, 10), mats.brass, 0, 0.12, -0.20, 0, 0, Math.PI * 0.5);

  const spoutCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.12, -0.20),
    new THREE.Vector3(0, 0.34, -0.20),
    new THREE.Vector3(0, 0.39, -0.06),
    new THREE.Vector3(0, 0.29, 0.04),
  ]);
  addMesh(grp, new THREE.TubeGeometry(spoutCurve, 18, 0.012, 10, false), mats.brass);
  addMesh(grp, new THREE.CylinderGeometry(0.018, 0.014, 0.025, 12), mats.brass, 0, 0.28, 0.042);

  return grp;
}

// ---------------------------------------------------------------------------
// 6. French Thonet Bentwood & Velvet Counter Bar Stool
// ---------------------------------------------------------------------------
export function buildThonetBentwoodCounterStool(mats, velvetMat = null) {
  const stool = new THREE.Group();
  const seatMat = velvetMat || mats.dustyRoseVelvet;

  // Cushioned Round Velvet Seat with Bentwood Rim (Y = 0.65m)
  const seatGeo = createTurnedLatheGeo(
    [
      [0.001, 0.61],
      [0.195, 0.61],
      [0.208, 0.635],
      [0.198, 0.675],
      [0.12, 0.688],
      [0.001, 0.692],
    ],
    22
  );
  addMesh(stool, seatGeo, seatMat);
  addMesh(stool, new THREE.TorusGeometry(0.202, 0.016, 10, 24), mats.walnut, 0, 0.615, 0, Math.PI * 0.5, 0, 0);

  // 4 Slender Splayed Tapered Walnut Legs + Brass Foot Sabots + Brass Footrest Ring
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    const topP = new THREE.Vector3(Math.cos(a) * 0.155, 0.61, Math.sin(a) * 0.155);
    const botP = new THREE.Vector3(Math.cos(a) * 0.215, 0.0, Math.sin(a) * 0.215);
    const dir = botP.clone().sub(topP);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.012, dir.length(), 10), mats.walnut);
    leg.position.copy(topP).addScaledVector(dir, 0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
    stool.add(leg);

    const sabot = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.012, 0.045, 8), mats.brass);
    sabot.position.set(botP.x, 0.022, botP.z);
    stool.add(sabot);
  }
  addMesh(stool, new THREE.TorusGeometry(0.188, 0.009, 8, 24), mats.brass, 0, 0.23, 0, Math.PI * 0.5, 0, 0);

  // Steam-Bent Walnut Horseshoe Backrest + Velvet Medallion Pad
  const backCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.18, 0.62, 0.02),
    new THREE.Vector3(-0.19, 0.84, -0.10),
    new THREE.Vector3(0, 0.90, -0.19),
    new THREE.Vector3(0.19, 0.84, -0.10),
    new THREE.Vector3(0.18, 0.62, 0.02),
  ]);
  addMesh(stool, new THREE.TubeGeometry(backCurve, 22, 0.015, 10, false), mats.walnut);
  const padGeo = createPillowedCushionGeo(0.24, 0.13, 0.045, 0.04, 0.01);
  addMesh(stool, padGeo, seatMat, 0, 0.83, -0.175, 0.14, 0, 0);

  return stool;
}

// ---------------------------------------------------------------------------
// 7. Oval Louis XVI Dining Table + 4 Medallion Chairs + 3-Tier Limoges Tea Stand
// ---------------------------------------------------------------------------
export function buildLouisXVIDiningSuite(mats) {
  const grp = new THREE.Group();

  // Beveled Oval French Walnut Tabletop (2.28m x 1.12m at Y = 0.76m)
  const ellShape = new THREE.Shape();
  ellShape.absellipse(0, 0, 1.12, 0.55, 0, Math.PI * 2, false, 0);
  const topGeo = new THREE.ExtrudeGeometry(ellShape, {
    depth: 0.032,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.016,
    bevelSegments: 3,
    curveSegments: 32,
  });
  topGeo.rotateX(-Math.PI * 0.5);
  addMesh(grp, topGeo, mats.walnut, 0, 0.735, 0);

  // Oval Recessed Apron Frieze with Brass Beading
  const apronGeo = new THREE.CylinderGeometry(0.50, 0.50, 0.075, 28, 1, true);
  apronGeo.scale(2.02, 1, 0.92);
  const apronMat = mats.walnut.clone();
  apronMat.side = THREE.DoubleSide;
  addMesh(grp, apronGeo, apronMat, 0, 0.695, 0);

  // Lace-Edged Blush Silk Table Runner
  addMesh(grp, createPillowedCushionGeo(1.76, 0.012, 0.36, 0.03, 0.002), mats.blushSilk, 0, 0.784, 0);

  // 4 Tapered Fluted Louis XVI Legs + Rosette Die-Blocks + Brass Sabots
  for (const [lx, lz] of [
    [-0.78, -0.34],
    [0.78, -0.34],
    [-0.78, 0.34],
    [0.78, 0.34],
  ]) {
    addMesh(grp, new THREE.BoxGeometry(0.068, 0.085, 0.068), mats.walnut, lx, 0.695, lz);
    addMesh(grp, new THREE.SphereGeometry(0.016, 8, 6), mats.brass, lx, 0.695, lz + Math.sign(lz) * 0.036);
    addMesh(grp, new THREE.CylinderGeometry(0.030, 0.018, 0.65, 12), mats.walnut, lx, 0.325, lz);
    addMesh(grp, new THREE.CylinderGeometry(0.020, 0.018, 0.06, 10), mats.brass, lx, 0.03, lz);
  }

  // 4 Louis XVI Medallion Chairs (Chaise en Médaille)
  const buildMedallionChair = (cx, cz, ry, cushionMat) => {
    const ch = new THREE.Group();
    ch.position.set(cx, 0, cz);
    ch.rotation.y = ry;

    // Seat apron + Piped Oval-Front Velvet Cushion
    addMesh(ch, createPillowedCushionGeo(0.47, 0.055, 0.45, 0.05, 0), mats.creamMolding, 0, 0.435, 0);
    addMesh(ch, createPillowedCushionGeo(0.45, 0.065, 0.43, 0.055, 0.016), cushionMat, 0, 0.475, 0);

    // 4 Tapered Fluted Legs with Corner Die-Blocks & Brass Feet
    for (const [sx, sz] of [
      [-0.195, -0.185],
      [0.195, -0.185],
      [-0.195, 0.185],
      [0.195, 0.185],
    ]) {
      addMesh(ch, new THREE.BoxGeometry(0.048, 0.058, 0.048), mats.creamMolding, sx, 0.435, sz);
      addMesh(ch, new THREE.CylinderGeometry(0.021, 0.013, 0.41, 10), mats.creamMolding, sx, 0.205, sz);
      addMesh(ch, new THREE.CylinderGeometry(0.014, 0.013, 0.038, 8), mats.brass, sx, 0.019, sz);
    }

    // Twin Back Stile Uprights + Oval Carved Medallion Backrest Frame + Ribbon Crest
    for (const sx of [-0.185, 0.185]) {
      addMesh(ch, new THREE.CylinderGeometry(0.016, 0.019, 0.38, 10), mats.creamMolding, sx, 0.64, -0.20, -0.08, 0, 0);
    }
    const medGroup = new THREE.Group();
    medGroup.position.set(0, 0.77, -0.215);
    medGroup.rotation.x = -0.09;
    const medFrame = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.022, 10, 24), mats.creamMolding);
    medFrame.scale.set(1.0, 1.26, 0.85);
    medGroup.add(medFrame);
    const medPad = new THREE.Mesh(new THREE.CylinderGeometry(0.162, 0.162, 0.036, 22), cushionMat);
    medPad.rotation.x = Math.PI * 0.5;
    medPad.scale.set(1.0, 1.0, 1.26);
    medGroup.add(medPad);
    addMesh(medGroup, new THREE.TorusGeometry(0.028, 0.008, 8, 14), mats.brass, 0, 0.235, 0.008);
    ch.add(medGroup);

    grp.add(ch);
  };

  buildMedallionChair(-0.52, -0.68, 0.04, mats.dustyRoseVelvet);
  buildMedallionChair(0.52, -0.68, -0.04, mats.sageVelvet);
  buildMedallionChair(-0.52, 0.68, Math.PI - 0.04, mats.sageVelvet);
  buildMedallionChair(0.52, 0.68, Math.PI + 0.04, mats.dustyRoseVelvet);

  // 3-Tier Limoges Porcelain & Brass Afternoon Tea Stand with French Macarons (at x = +0.52)
  const standX = 0.52;
  const standY = 0.79;
  addMesh(grp, new THREE.CylinderGeometry(0.006, 0.008, 0.36, 10), mats.brass, standX, standY + 0.18, 0.02);
  addMesh(grp, new THREE.TorusGeometry(0.028, 0.005, 8, 16), mats.brass, standX, standY + 0.385, 0.02);

  const macaronColors = [mats.dustyRoseVelvet, mats.sageVelvet, mats.ivoryLinen, mats.waxSeal];
  for (const [tierR, ty, count] of [
    [0.145, 0.04, 6],
    [0.112, 0.165, 5],
    [0.082, 0.285, 3],
  ]) {
    const plateGeo = createTurnedLatheGeo(
      [
        [0.008, 0],
        [tierR * 0.68, 0.002],
        [tierR, 0.016],
        [tierR * 1.02, 0.020],
      ],
      20
    );
    addMesh(grp, plateGeo, mats.retroRosePorcelain, standX, standY + ty, 0.02);
    addMesh(grp, new THREE.TorusGeometry(tierR * 1.01, 0.003, 6, 22), mats.brass, standX, standY + ty + 0.019, 0.02, Math.PI * 0.5, 0, 0);
    for (let m = 0; m < count; m += 1) {
      const ma = (m / count) * Math.PI * 2 + ty * 3.1;
      const mr = tierR * 0.56;
      addMesh(
        grp,
        new THREE.CylinderGeometry(0.021, 0.021, 0.018, 12),
        macaronColors[m % macaronColors.length],
        standX + Math.cos(ma) * mr,
        standY + ty + 0.016,
        0.02 + Math.sin(ma) * mr
      );
    }
  }

  return grp;
}

// ---------------------------------------------------------------------------
// 8. Carved French Bolection Limestone Fireplace + Brass Andirons & Spark Screen
// ---------------------------------------------------------------------------
export function buildFrenchFireplaceAndMantel(mats, emberState) {
  const fp = new THREE.Group();

  // Stepped Molded Hearth Slab
  addMesh(fp, createPillowedCushionGeo(2.38, 0.09, 0.88, 0.03, 0), mats.marble, 0, 0.045, 0.22);

  // Fluted Limestone Jamb Pilasters with Plinths & Capitals
  for (const sx of [-0.82, 0.82]) {
    addMesh(fp, new THREE.BoxGeometry(0.40, 0.18, 0.48), mats.copingStone, sx, 0.17, 0.04);
    addMesh(fp, new THREE.BoxGeometry(0.34, 0.96, 0.42), mats.limestone, sx, 0.74, 0.03);
    for (const fx of [-0.10, 0, 0.10]) {
      addMesh(fp, new THREE.CylinderGeometry(0.022, 0.022, 0.84, 8), mats.copingStone, sx + fx, 0.74, 0.245);
    }
    addMesh(fp, new THREE.BoxGeometry(0.40, 0.12, 0.48), mats.copingStone, sx, 1.28, 0.04);
  }

  // Carved Entablature Lintel + Floral Cartouche Medallion + Stepped Mantel Shelf (Top Y = 1.56m)
  addMesh(fp, new THREE.BoxGeometry(2.08, 0.28, 0.44), mats.limestone, 0, 1.28, 0.03);
  addMesh(fp, new THREE.TorusGeometry(0.11, 0.022, 8, 18), mats.copingStone, 0, 1.28, 0.255);
  addMesh(fp, new THREE.SphereGeometry(0.055, 10, 8), mats.brass, 0, 1.28, 0.26);
  addMesh(fp, createPillowedCushionGeo(2.36, 0.11, 0.56, 0.025, 0), mats.copingStone, 0, 1.465, 0.06);
  addMesh(fp, new THREE.BoxGeometry(2.44, 0.045, 0.60), mats.marble, 0, 1.535, 0.07);

  // Recessed Dark Soot Firebox + Cast-Iron Fleur-de-Lis Fireback
  addMesh(fp, new THREE.BoxGeometry(1.30, 1.06, 0.34), mats.wroughtIron, 0, 0.61, -0.06);
  addMesh(fp, new THREE.BoxGeometry(0.92, 0.78, 0.03), mats.bronze, 0, 0.54, -0.19);
  addMesh(fp, new THREE.BoxGeometry(1.28, 0.03, 0.04), mats.brass, 0, 1.13, 0.23);

  // Pair of Brass Ball-Top Chenet Andirons + Glowing Embers + 4 Split Bark Logs
  for (const ax of [-0.32, 0.32]) {
    addMesh(fp, new THREE.CylinderGeometry(0.016, 0.022, 0.28, 10), mats.brass, ax, 0.23, 0.12);
    addMesh(fp, new THREE.SphereGeometry(0.042, 12, 10), mats.brass, ax, 0.39, 0.12);
    addMesh(fp, new THREE.BoxGeometry(0.03, 0.03, 0.34), mats.wroughtIron, ax, 0.12, -0.02);
  }

  const embers = addMesh(fp, createPillowedCushionGeo(0.76, 0.06, 0.26, 0.04, 0.015), mats.emberGlow, 0, 0.11, -0.01);
  if (emberState) emberState.mesh = embers;

  for (const [lx, ly, lz, ry, rz] of [
    [-0.08, 0.19, -0.03, 0.08, 1.54],
    [0.09, 0.19, 0.05, -0.12, 1.58],
    [0.0, 0.27, 0.01, 0.24, 1.48],
    [-0.12, 0.25, -0.05, -0.35, 1.42],
  ]) {
    addMesh(fp, new THREE.CylinderGeometry(0.052, 0.062, 0.64, 10), mats.walnut, lx, ly, lz, 0, ry, rz);
  }

  // Delicate Arched Brass-Trimmed Spark Guard Screen
  const screenArch = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.54, 0.09, 0.28),
    new THREE.Vector3(-0.54, 0.62, 0.28),
    new THREE.Vector3(0, 0.76, 0.28),
    new THREE.Vector3(0.54, 0.62, 0.28),
    new THREE.Vector3(0.54, 0.09, 0.28),
  ]);
  addMesh(fp, new THREE.TubeGeometry(screenArch, 24, 0.012, 8, false), mats.brass);
  addMesh(fp, new THREE.BoxGeometry(1.08, 0.018, 0.018), mats.brass, 0, 0.098, 0.28);

  return fp;
}

// ---------------------------------------------------------------------------
// 9. Louis XVI Bureau Plat Writing Desk + Emeralite Banker's Lamp + Globe & Inkwell
// ---------------------------------------------------------------------------
export function buildBureauPlatDeskAndEmeraliteLamp(mats) {
  const grp = new THREE.Group();

  // Molded French Walnut Tabletop (1.76m x 0.86m, top Y = 0.785m) + Inset Gold-Tooled Sage Leather Skiver
  addMesh(grp, createPillowedCushionGeo(1.76, 0.048, 0.86, 0.032, 0), mats.walnut, 0, 0.761, 0);
  addMesh(grp, new THREE.BoxGeometry(1.52, 0.008, 0.64), mats.brass, 0, 0.783, 0.01);
  addMesh(grp, new THREE.BoxGeometry(1.48, 0.010, 0.60), mats.sageVelvet, 0, 0.784, 0.01);

  // Graceful Kneehole Apron with 3 Framed Drawers & Brass Swan-Neck Bail Pulls (Open Legroom!)
  addMesh(grp, new THREE.BoxGeometry(1.66, 0.14, 0.78), mats.walnut, 0, 0.67, 0);
  // Deeper flanking side drawer drops
  for (const sx of [-0.56, 0.56]) {
    addMesh(grp, new THREE.BoxGeometry(0.52, 0.24, 0.78), mats.walnut, sx, 0.62, 0);
    for (const dy of [0.68, 0.56]) {
      addMesh(grp, new THREE.BoxGeometry(0.44, 0.09, 0.016), mats.brass, sx, dy, 0.394);
      addMesh(grp, new THREE.BoxGeometry(0.42, 0.075, 0.020), mats.walnut, sx, dy, 0.396);
      const pull = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 6, 12, Math.PI), mats.brass);
      pull.rotation.z = Math.PI;
      pull.position.set(sx, dy + 0.005, 0.412);
      grp.add(pull);
    }
  }
  // Center kneehole drawer front + keyhole escutcheon
  addMesh(grp, new THREE.BoxGeometry(0.52, 0.10, 0.016), mats.brass, 0, 0.67, 0.394);
  addMesh(grp, new THREE.BoxGeometry(0.50, 0.085, 0.020), mats.walnut, 0, 0.67, 0.396);
  addMesh(grp, new THREE.CylinderGeometry(0.016, 0.016, 0.008, 12), mats.brass, 0, 0.67, 0.408, Math.PI * 0.5, 0, 0);

  // 4 Slender Tapered Fluted Walnut Legs + Brass Collars & Sabots
  for (const [lx, lz] of [
    [-0.78, -0.35],
    [0.78, -0.35],
    [-0.78, 0.35],
    [0.78, 0.35],
  ]) {
    addMesh(grp, new THREE.CylinderGeometry(0.036, 0.021, 0.74, 14), mats.walnut, lx, 0.37, lz);
    addMesh(grp, new THREE.TorusGeometry(0.036, 0.007, 8, 16), mats.brass, lx, 0.50, lz, Math.PI * 0.5, 0, 0);
    addMesh(grp, new THREE.CylinderGeometry(0.023, 0.020, 0.065, 12), mats.brass, lx, 0.032, lz);
  }

  // Authentic Emeralite Banker's Lamp at (-0.56, 0.788, -0.18)
  const lampX = -0.56;
  const lampZ = -0.18;
  const lampY = 0.786;
  const baseGeo = createTurnedLatheGeo(
    [
      [0.095, 0],
      [0.095, 0.014],
      [0.076, 0.026],
      [0.064, 0.038],
      [0.028, 0.052],
    ],
    18
  );
  addMesh(grp, baseGeo, mats.brass, lampX, lampY, lampZ);
  addMesh(grp, new THREE.CylinderGeometry(0.014, 0.018, 0.24, 12), mats.brass, lampX, lampY + 0.16, lampZ - 0.02, 0.14, 0, 0);
  for (const sx of [-0.115, 0.115]) {
    const armC = new THREE.CatmullRomCurve3([
      new THREE.Vector3(lampX, lampY + 0.26, lampZ - 0.035),
      new THREE.Vector3(lampX + sx, lampY + 0.30, lampZ - 0.02),
      new THREE.Vector3(lampX + sx, lampY + 0.34, lampZ + 0.03),
    ]);
    addMesh(grp, new THREE.TubeGeometry(armC, 10, 0.006, 8, false), mats.brass);
    addMesh(grp, new THREE.SphereGeometry(0.013, 8, 8), mats.brass, lampX + sx, lampY + 0.34, lampZ + 0.03);
  }
  const emeraldOuter = new THREE.MeshPhysicalMaterial({
    color: 0x166844,
    emissive: new THREE.Color(0x288c5e),
    emissiveIntensity: 0.55,
    roughness: 0.14,
    clearcoat: 0.9,
  });
  const shadeOuter = new THREE.CylinderGeometry(0.082, 0.082, 0.23, 18, 1, false, 0, Math.PI);
  shadeOuter.rotateZ(Math.PI * 0.5);
  addMesh(grp, shadeOuter, emeraldOuter, lampX, lampY + 0.34, lampZ + 0.03, 0.22, 0, 0);
  // Beaded Brass Pull-Chain
  addMesh(grp, new THREE.CylinderGeometry(0.0025, 0.0025, 0.12, 6), mats.brass, lampX + 0.035, lampY + 0.27, lampZ + 0.04);
  addMesh(grp, new THREE.SphereGeometry(0.009, 8, 8), mats.brass, lampX + 0.035, lampY + 0.205, lampZ + 0.04);

  // Crystal Glass Inkwell + Brass Cap + Antique Terrestrial Brass Globe on Right Rear
  addMesh(grp, createPillowedCushionGeo(0.065, 0.052, 0.065, 0.012, 0), mats.glass, 0.28, lampY + 0.026, -0.14);
  addMesh(grp, new THREE.CylinderGeometry(0.018, 0.022, 0.022, 12), mats.brass, 0.28, lampY + 0.06, -0.14);

  // Mini Brass & Parchment Terrestrial Globe at (-0.64, lampY, 0.16)
  const gx = -0.64;
  const gz = 0.16;
  addMesh(
    grp,
    createTurnedLatheGeo(
      [
        [0.058, 0],
        [0.055, 0.012],
        [0.018, 0.035],
        [0.014, 0.08],
      ],
      14
    ),
    mats.brass,
    gx,
    lampY,
    gz
  );
  addMesh(grp, new THREE.TorusGeometry(0.098, 0.006, 8, 22, Math.PI * 1.15), mats.brass, gx, lampY + 0.175, gz, 0, 0.4, -0.4);
  addMesh(grp, new THREE.SphereGeometry(0.084, 18, 14), mats.celadonGlaze, gx, lampY + 0.175, gz, 0.38, 0.5, 0);

  return grp;
}

// ---------------------------------------------------------------------------
// 10. Figure-8 Acoustic Parlor Guitar on Folding Walnut A-Frame Stand
// ---------------------------------------------------------------------------
export function buildAcousticParlorGuitarOnStand(mats) {
  const grp = new THREE.Group();

  // Walnut A-Frame Stand
  for (const sx of [-1, 1]) {
    addMesh(grp, new THREE.CylinderGeometry(0.012, 0.012, 0.46, 8), mats.walnut, sx * 0.13, 0.21, -0.02, 0.22, 0, -sx * 0.26);
    addMesh(grp, new THREE.CylinderGeometry(0.010, 0.010, 0.22, 8), mats.walnut, sx * 0.14, 0.07, 0.08, Math.PI * 0.5, 0, 0);
  }

  const guitar = new THREE.Group();
  guitar.position.set(0, 0.30, 0.02);
  guitar.rotation.x = -0.22;

  // True Figure-8 Waisted Guitar Body (Shape + ExtrudeGeometry)
  const gShape = new THREE.Shape();
  gShape.moveTo(0, -0.23);
  gShape.bezierCurveTo(0.21, -0.23, 0.22, -0.05, 0.115, 0.02);
  gShape.bezierCurveTo(0.075, 0.05, 0.175, 0.12, 0.155, 0.20);
  gShape.bezierCurveTo(0.135, 0.26, 0.06, 0.27, 0, 0.27);
  gShape.bezierCurveTo(-0.06, 0.27, -0.135, 0.26, -0.155, 0.20);
  gShape.bezierCurveTo(-0.175, 0.12, -0.075, 0.05, -0.115, 0.02);
  gShape.bezierCurveTo(-0.22, -0.05, -0.21, -0.23, 0, -0.23);

  const bodyGeo = new THREE.ExtrudeGeometry(gShape, {
    depth: 0.095,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 20,
  });
  bodyGeo.translate(0, 0, -0.048);
  addMesh(guitar, bodyGeo, mats.naturalOak);

  // Soundhole + Concentric Rosette + Rosewood Bridge
  addMesh(guitar, new THREE.CylinderGeometry(0.048, 0.048, 0.012, 20), mats.wroughtIron, 0, 0.09, 0.052, Math.PI * 0.5, 0, 0);
  addMesh(guitar, new THREE.TorusGeometry(0.056, 0.004, 6, 24), mats.brass, 0, 0.09, 0.056);
  addMesh(guitar, new THREE.BoxGeometry(0.14, 0.028, 0.014), mats.walnut, 0, -0.06, 0.056);
  addMesh(guitar, new THREE.BoxGeometry(0.09, 0.005, 0.018), mats.ivoryLinen, 0, -0.06, 0.060);

  // Mahogany Neck + Rosewood Fretboard + Brass Frets + Slotted Headstock & Tuning Pegs
  addMesh(guitar, new THREE.BoxGeometry(0.052, 0.44, 0.024), mats.walnut, 0, 0.46, 0.040);
  addMesh(guitar, new THREE.BoxGeometry(0.054, 0.46, 0.008), mats.wroughtIron, 0, 0.44, 0.055);
  for (let f = 0; f < 12; f += 1) {
    addMesh(guitar, new THREE.BoxGeometry(0.054, 0.0025, 0.01), mats.brass, 0, 0.24 + f * 0.034, 0.058);
  }
  addMesh(guitar, new THREE.BoxGeometry(0.074, 0.14, 0.018), mats.walnut, 0, 0.74, 0.034, -0.14, 0, 0);
  for (const sx of [-0.046, 0.046]) {
    for (const py of [0.70, 0.74, 0.78]) {
      addMesh(guitar, new THREE.CylinderGeometry(0.007, 0.007, 0.024, 8), mats.brass, sx, py, 0.034, 0, 0, Math.PI * 0.5);
    }
  }
  // 6 Metallic Strings
  for (let st = 0; st < 6; st += 1) {
    const sx = -0.02 + st * 0.008;
    addMesh(guitar, new THREE.CylinderGeometry(0.001, 0.001, 0.76, 4), mats.mirrorSilver, sx, 0.32, 0.063);
  }

  grp.add(guitar);
  return grp;
}

// ---------------------------------------------------------------------------
// 11. French Four-Poster Canopy Bed (Lit à Baldaquin) + Louis XVI Foot Bench
// ---------------------------------------------------------------------------
export function buildFourPosterCanopyBed(mats, createPleatedCurtainFn) {
  const bed = new THREE.Group();

  // Molded Walnut Bed Frame Rails + Turned Bun Feet
  addMesh(bed, createPillowedCushionGeo(2.18, 0.24, 2.28, 0.035, 0), mats.walnut, 0, 0.25, 0);

  // Arched Carved Walnut & Button-Tufted Dusty-Rose Velvet Headboard
  addMesh(bed, createPillowedCushionGeo(2.14, 1.16, 0.12, 0.04, 0.018), mats.deepRoseVelvet, 0, 0.86, -1.08);
  const archFrame = new THREE.Mesh(new THREE.CylinderGeometry(1.07, 1.07, 0.13, 24, 1, false, 0, Math.PI), mats.walnut);
  archFrame.rotation.set(0, Math.PI * 0.5, -Math.PI * 0.5);
  archFrame.position.set(0, 1.42, -1.08);
  bed.add(archFrame);
  const archPad = new THREE.Mesh(new THREE.CylinderGeometry(0.99, 0.99, 0.14, 24, 1, false, 0, Math.PI), mats.deepRoseVelvet);
  archPad.rotation.set(0, Math.PI * 0.5, -Math.PI * 0.5);
  archPad.position.set(0, 1.40, -1.075);
  bed.add(archPad);
  // Tufting buttons on headboard
  const btnGeo = new THREE.SphereGeometry(0.013, 8, 6);
  for (let r = 0; r < 3; r += 1) {
    for (let c = -3; c <= 3; c += 1) {
      addMesh(bed, btnGeo, mats.brass, c * 0.25 + (r % 2) * 0.12, 0.88 + r * 0.19, -1.005);
    }
  }

  // Plump Rounded Mattress + Overhanging Quilted Velvet Duvet + Folded Silk Turn-Down + Sage Bed-Runner
  addMesh(bed, createPillowedCushionGeo(2.04, 0.24, 2.12, 0.06, 0.018), mats.ivoryLinen, 0, 0.48, 0.02);
  addMesh(bed, createPillowedCushionGeo(2.12, 0.17, 1.56, 0.08, 0.032), mats.dustyRoseVelvet, 0, 0.61, 0.30);
  addMesh(bed, createPillowedCushionGeo(2.13, 0.075, 0.38, 0.05, 0.015), mats.blushSilk, 0, 0.68, -0.38);
  addMesh(bed, createPillowedCushionGeo(2.14, 0.08, 0.46, 0.05, 0.018), mats.sageVelvet, 0, 0.685, 0.82);

  // 6 Plump Pinched-Corner Pillows + Cylindrical Tasseled Bolster!
  const euroPil = createPlumpPillowGeo(0.68, 0.48, 0.18);
  const sleepPil = createPlumpPillowGeo(0.58, 0.38, 0.16);
  const accentPil = createPlumpPillowGeo(0.42, 0.34, 0.14);
  for (const s of [-1, 1]) {
    addMesh(bed, euroPil, mats.ivoryLinen, s * 0.50, 0.82, -0.84, -0.22, -s * 0.05, 0);
    addMesh(bed, sleepPil, mats.blushSilk, s * 0.48, 0.77, -0.66, -0.32, -s * 0.06, 0);
    addMesh(bed, accentPil, s < 0 ? mats.sageVelvet : mats.deepRoseVelvet, s * 0.38, 0.74, -0.48, -0.38, -s * 0.08, 0);
  }
  const bolster = new THREE.CylinderGeometry(0.085, 0.085, 0.88, 16);
  bolster.rotateZ(Math.PI * 0.5);
  addMesh(bed, bolster, mats.sageVelvet, 0, 0.73, -0.32);
  for (const bx of [-0.45, 0.45]) {
    addMesh(bed, new THREE.SphereGeometry(0.032, 10, 8), mats.brass, bx, 0.73, -0.32);
  }

  // 4 Turned, Urn-Collared & Reeded Walnut Canopy Columns (LatheGeometry, H = 2.50m)
  const postH = 2.50;
  const colProfile = [
    [0.054, 0.0],
    [0.054, 0.36],
    [0.068, 0.42],
    [0.044, 0.48],
    [0.066, 0.58],
    [0.042, 0.68],
    [0.040, 1.45],
    [0.052, 1.50],
    [0.036, 1.55],
    [0.032, 2.40],
    [0.052, 2.46],
    [0.044, 2.50],
  ];
  const postGeo = createTurnedLatheGeo(colProfile, 18);
  const finialGeo = createTurnedLatheGeo(
    [
      [0.035, 0],
      [0.018, 0.03],
      [0.046, 0.08],
      [0.012, 0.14],
      [0.002, 0.16],
    ],
    14
  );

  for (const [px, pz] of [
    [-1.06, -1.08],
    [1.06, -1.08],
    [-1.06, 1.08],
    [1.06, 1.08],
  ]) {
    addMesh(bed, postGeo, mats.walnut, px, 0, pz);
    addMesh(bed, finialGeo, mats.brass, px, postH, pz);
    addMesh(bed, new THREE.TorusGeometry(0.048, 0.009, 8, 16), mats.brass, px, 1.12, pz, Math.PI * 0.5, 0, 0);
    if (createPleatedCurtainFn) {
      const drape = createPleatedCurtainFn(mats.sheerCurtain, 0.54, postH - 0.20);
      drape.position.set(px * 0.89, postH - 0.04, pz * 0.94);
      bed.add(drape);
    }
  }

  // Molded Walnut & Brass Overhead Tester Cornice + Scalloped Dusty-Rose Valance (Ciel de Lit)
  addMesh(bed, new THREE.BoxGeometry(2.20, 0.065, 0.055), mats.walnut, 0, postH - 0.02, -1.08);
  addMesh(bed, new THREE.BoxGeometry(2.20, 0.065, 0.055), mats.walnut, 0, postH - 0.02, 1.08);
  addMesh(bed, new THREE.BoxGeometry(0.055, 0.065, 2.20), mats.walnut, -1.06, postH - 0.02, 0);
  addMesh(bed, new THREE.BoxGeometry(0.055, 0.065, 2.20), mats.walnut, 1.06, postH - 0.02, 0);

  // Scalloped fabric valance lobes along front/back & sides
  for (const vz of [-1.09, 1.09]) {
    addMesh(bed, new THREE.BoxGeometry(2.14, 0.14, 0.024), mats.dustyRoseVelvet, 0, postH - 0.11, vz);
    for (let s = -4; s <= 4; s += 1) {
      addMesh(bed, new THREE.CylinderGeometry(0.11, 0.11, 0.026, 14), mats.dustyRoseVelvet, s * 0.22, postH - 0.18, vz, Math.PI * 0.5, 0, 0);
    }
  }
  for (const vx of [-1.07, 1.07]) {
    addMesh(bed, new THREE.BoxGeometry(0.024, 0.14, 2.14), mats.dustyRoseVelvet, vx, postH - 0.11, 0);
  }
  const testerVoile = new THREE.Mesh(new THREE.PlaneGeometry(2.08, 2.12), mats.sheerCurtain);
  testerVoile.rotation.x = Math.PI * 0.5;
  testerVoile.position.set(0, postH - 0.03, 0);
  bed.add(testerVoile);

  // Louis XVI Tufted Sage-Velvet Bench at Foot of Bed (Z = +1.44)
  const benchZ = 1.44;
  addMesh(bed, createPillowedCushionGeo(1.58, 0.065, 0.46, 0.035, 0), mats.creamMolding, 0, 0.36, benchZ);
  addMesh(bed, createPillowedCushionGeo(1.56, 0.11, 0.45, 0.055, 0.024), mats.sageVelvet, 0, 0.435, benchZ);
  for (let b = -2; b <= 2; b += 1) {
    addMesh(bed, btnGeo, mats.brass, b * 0.28, 0.495, benchZ);
  }
  for (const [lx, lz] of [
    [-0.68, benchZ - 0.17],
    [0.68, benchZ - 0.17],
    [-0.68, benchZ + 0.17],
    [0.68, benchZ + 0.17],
  ]) {
    addMesh(bed, new THREE.CylinderGeometry(0.024, 0.015, 0.34, 12), mats.creamMolding, lx, 0.17, lz);
    addMesh(bed, new THREE.CylinderGeometry(0.017, 0.015, 0.04, 10), mats.brass, lx, 0.02, lz);
  }

  return bed;
}

// ---------------------------------------------------------------------------
// 12. Porcelain Ginger-Jar Bedside Lamp with Ribbed Pleated Empire Shade
// ---------------------------------------------------------------------------
export function buildPorcelainTableLamp(mats, roseGlaze = false) {
  const lamp = new THREE.Group();
  const jarMat = roseGlaze ? mats.retroRosePorcelain : mats.celadonGlaze;
  addMesh(
    lamp,
    createTurnedLatheGeo(
      [
        [0.072, 0],
        [0.068, 0.022],
        [0.052, 0.032],
      ],
      16
    ),
    mats.brass
  );
  addMesh(
    lamp,
    createTurnedLatheGeo(
      [
        [0.052, 0.03],
        [0.092, 0.10],
        [0.098, 0.18],
        [0.046, 0.24],
        [0.052, 0.26],
      ],
      20
    ),
    jarMat
  );
  addMesh(lamp, new THREE.CylinderGeometry(0.010, 0.010, 0.14, 8), mats.brass, 0, 0.32, 0);
  addMesh(lamp, new THREE.CylinderGeometry(0.105, 0.185, 0.21, 20, 1, true), mats.warmShade, 0, 0.35, 0);
  addMesh(lamp, new THREE.TorusGeometry(0.105, 0.004, 6, 20), mats.brass, 0, 0.455, 0, Math.PI * 0.5, 0, 0);
  addMesh(lamp, new THREE.TorusGeometry(0.185, 0.004, 6, 20), mats.brass, 0, 0.245, 0, Math.PI * 0.5, 0, 0);
  addMesh(lamp, new THREE.SphereGeometry(0.016, 10, 8), mats.brass, 0, 0.475, 0);
  return lamp;
}

// ---------------------------------------------------------------------------
// 13. Outdoor Slatted Teak Steamer Deck Lounger + Resort Market Parasol
// ---------------------------------------------------------------------------
export function buildTeakSteamerDeckLounger({ teakMat, linenMat, accentMat, brassMat }) {
  const lounger = new THREE.Group();

  // Curved S-Profile Side Rails + Brass Rear Wheels + 18 Individual Teak Slats
  for (const sx of [-0.33, 0.33]) {
    addMesh(lounger, new THREE.BoxGeometry(0.042, 0.065, 1.18), teakMat, sx, 0.28, 0.26);
    addMesh(lounger, new THREE.BoxGeometry(0.042, 0.062, 0.68), teakMat, sx, 0.50, -0.56, 0.56, 0, 0);
    // Front leg + Rear axle leg with spoked brass wheel
    addMesh(lounger, new THREE.BoxGeometry(0.045, 0.28, 0.05), teakMat, sx, 0.14, 0.72);
    addMesh(lounger, new THREE.BoxGeometry(0.045, 0.24, 0.05), teakMat, sx, 0.15, -0.54);
    addMesh(lounger, new THREE.TorusGeometry(0.068, 0.012, 8, 18), brassMat, sx + Math.sign(sx) * 0.032, 0.075, -0.54, 0, Math.PI * 0.5, 0);
    addMesh(lounger, new THREE.CylinderGeometry(0.02, 0.02, 0.02, 10), brassMat, sx + Math.sign(sx) * 0.032, 0.075, -0.54, 0, 0, Math.PI * 0.5);
    // Sculpted Armrests
    addMesh(lounger, createPillowedCushionGeo(0.065, 0.032, 0.58, 0.018, 0), teakMat, sx, 0.49, -0.05);
    addMesh(lounger, new THREE.BoxGeometry(0.038, 0.21, 0.042), teakMat, sx, 0.38, 0.20);
  }

  // Individual Slatted Teak Decking along Seat & Reclining Backrest
  for (let i = 0; i < 12; i += 1) {
    addMesh(lounger, new THREE.BoxGeometry(0.62, 0.018, 0.072), teakMat, 0, 0.305, -0.28 + i * 0.098);
  }
  for (let b = 0; b < 7; b += 1) {
    const t = b / 6;
    addMesh(
      lounger,
      new THREE.BoxGeometry(0.62, 0.018, 0.072),
      teakMat,
      0,
      0.34 + t * 0.33,
      -0.36 - t * 0.52,
      0.56,
      0,
      0
    );
  }

  // Piped Cream Sunbrella Cushions + Striped Coastal Head Bolster
  addMesh(lounger, createPillowedCushionGeo(0.62, 0.075, 1.14, 0.04, 0.016), linenMat, 0, 0.355, 0.28);
  addMesh(lounger, createPillowedCushionGeo(0.62, 0.075, 0.62, 0.04, 0.016), linenMat, 0, 0.535, -0.56, 0.56, 0, 0);
  const bolster = new THREE.CylinderGeometry(0.068, 0.068, 0.46, 16);
  bolster.rotateZ(Math.PI * 0.5);
  addMesh(lounger, bolster, accentMat, 0, 0.69, -0.71);

  return lounger;
}

export function buildResortMarketParasol({ teakMat, canvasMat, brassMat, radius = 1.52, height = 2.42 }) {
  const umb = new THREE.Group();
  addMesh(umb, new THREE.CylinderGeometry(0.028, 0.034, height, 12), teakMat, 0, height * 0.5, 0);
  addMesh(umb, new THREE.CylinderGeometry(0.042, 0.042, 0.09, 10), brassMat, 0, height * 0.52, 0);
  // Octagonal Canopy + Hanging Scalloped Valance Flaps + 8 Teak Ribs + Brass Finial
  addMesh(umb, new THREE.ConeGeometry(radius, 0.46, 8, 1, true), canvasMat, 0, height - 0.16, 0);
  addMesh(umb, new THREE.CylinderGeometry(radius * 0.995, radius * 1.0, 0.11, 8, 1, true), canvasMat, 0, height - 0.44, 0);
  const runnerY = height - 0.48;
  addMesh(umb, new THREE.CylinderGeometry(0.055, 0.055, 0.06, 10), teakMat, 0, runnerY, 0);
  for (let r = 0; r < 8; r += 1) {
    const a = (r / 8) * Math.PI * 2 + Math.PI / 8;
    const ribCurve = new THREE.LineCurve3(
      new THREE.Vector3(0, runnerY, 0),
      new THREE.Vector3(Math.cos(a) * radius * 0.72, height - 0.25, Math.sin(a) * radius * 0.72)
    );
    addMesh(umb, new THREE.TubeGeometry(ribCurve, 2, 0.009, 6, false), teakMat);
  }
  addMesh(umb, new THREE.SphereGeometry(0.048, 10, 8), brassMat, 0, height + 0.10, 0);
  return umb;
}

// ---------------------------------------------------------------------------
// 14. Victoria Arduino Eagle Italian Lever Espresso Machine
// ---------------------------------------------------------------------------
export function buildItalianLeverEspressoMachine({ chromeMat, brassMat, walnutMat, porcelainMat }) {
  const m = new THREE.Group();

  // Heavy Gadrooned Brass & Chrome Base + Vertical Boiler Column + Dome + Brass Eagle Finial
  addMesh(m, createPillowedCushionGeo(0.56, 0.08, 0.42, 0.035, 0), chromeMat, 0, 0.04, 0);
  addMesh(m, new THREE.BoxGeometry(0.46, 0.015, 0.18), brassMat, 0, 0.085, 0.10);
  addMesh(m, new THREE.CylinderGeometry(0.18, 0.19, 0.36, 22), brassMat, 0, 0.26, -0.04);
  addMesh(m, new THREE.CylinderGeometry(0.195, 0.195, 0.03, 22), chromeMat, 0, 0.44, -0.04);
  addMesh(m, new THREE.SphereGeometry(0.18, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), brassMat, 0, 0.45, -0.04);
  addMesh(m, new THREE.SphereGeometry(0.038, 10, 8), brassMat, 0, 0.65, -0.04);
  // Wings of eagle finial
  addMesh(m, new THREE.BoxGeometry(0.18, 0.045, 0.015), brassMat, 0, 0.67, -0.04, 0, 0, 0.08);

  // Pressure Gauge Dial + Twin Groupheads + Lever Arms + Walnut Portafilter Handles
  addMesh(m, new THREE.CylinderGeometry(0.038, 0.038, 0.02, 16), porcelainMat, 0, 0.34, 0.155, Math.PI * 0.5, 0, 0);
  for (const gx of [-0.11, 0.11]) {
    addMesh(m, new THREE.CylinderGeometry(0.038, 0.034, 0.09, 14), chromeMat, gx, 0.25, 0.13);
    // Angled Piston Lever
    addMesh(m, new THREE.CylinderGeometry(0.007, 0.007, 0.22, 8), chromeMat, gx, 0.37, 0.19, 0.52, 0, 0);
    addMesh(m, new THREE.CylinderGeometry(0.014, 0.012, 0.07, 10), walnutMat, gx, 0.46, 0.24, 0.52, 0, 0);
    // Portafilter Handle
    addMesh(m, new THREE.CylinderGeometry(0.013, 0.010, 0.14, 10), walnutMat, gx, 0.22, 0.24, Math.PI * 0.5, 0, gx * 1.4);
  }
  // Stacked Espresso Cups on Side
  for (let c = 0; c < 3; c += 1) {
    addMesh(m, new THREE.CylinderGeometry(0.028, 0.020, 0.042, 12), porcelainMat, 0.22, 0.10 + c * 0.038, 0.06);
  }

  return m;
}
