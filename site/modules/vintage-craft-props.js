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

// Diamond capitonné "puff" field: buttons sit on the integer lattice of (p, q), creases run along
// p = int and q = int (the diagonal folds joining neighbouring buttons), cushions puff in between.
function capitonnePuff(a, b) {
  const p = a - b * 0.5;
  const q = a + b * 0.5;
  const fp = p - Math.floor(p);
  const fq = q - Math.floor(q);
  const puff = Math.sin(Math.PI * fp) * Math.sin(Math.PI * fq);
  return Math.pow(Math.max(0, puff), 0.5);
}

// Tufted upholstery panel in local XY (facing +Z). Returns { geo, buttons: [Vector3...] }.
export function createTuftedPanelGeo(
  w,
  h,
  { cols = 8, rows = 3, depth = 0.034, margin = 0.07, segPerCell = 12, bow = 0, edgeTuck = 0.6 } = {}
) {
  const sx = (w - margin * 2) / Math.max(1, cols - 1);
  const sy = (h - margin * 2) / Math.max(1, rows - 1);
  // lattice b grows in steps of 1 per row; each row is half a diamond tall, so the diamond is 2*sy tall
  const segU = Math.max(8, Math.round((w / sx) * segPerCell));
  const segV = Math.max(6, Math.round((h / sy) * segPerCell * 0.75));
  const geo = new THREE.PlaneGeometry(w, h, segU, segV);
  const pos = geo.attributes.position;
  const x0 = -w * 0.5 + margin;
  const y0 = -h * 0.5 + margin;
  const field = (x, y) => {
    const a = (x - x0) / sx;
    const b = (y - y0) / sy;
    return capitonnePuff(a, b);
  };
  const edgeFall = (x, y) => {
    const ex = Math.min(x + w * 0.5, w * 0.5 - x) / (margin * 1.1);
    const ey = Math.min(y + h * 0.5, h * 0.5 - y) / (margin * 1.1);
    const e = clamp(Math.min(ex, ey), 0, 1);
    return 1 - edgeTuck * (1 - Math.sin(e * Math.PI * 0.5));
  };
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const nx = x / (w * 0.5);
    const bowZ = -bow * nx * nx;
    pos.setZ(i, bowZ + depth * (0.18 + 0.82 * field(x, y)) * edgeFall(x, y));
  }
  geo.computeVertexNormals();

  const buttons = [];
  for (let r = 0; r < rows; r += 1) {
    const odd = r % 2 === 1;
    const count = odd ? cols - 1 : cols;
    for (let c = 0; c < count; c += 1) {
      const x = x0 + (c + (odd ? 0.5 : 0)) * sx;
      const y = y0 + r * sy;
      const nx = x / (w * 0.5);
      buttons.push(new THREE.Vector3(x, y, -bow * nx * nx + depth * 0.18 * edgeFall(x, y) + 0.004));
    }
  }
  return { geo, buttons };
}

// Closed rounded-rectangle piping cord (welt) around a cushion edge in the XZ plane
export function createPipingLoopGeo(w, d, r, tube = 0.008, y = 0) {
  const hw = w * 0.5 - r;
  const hd = d * 0.5 - r;
  const pts = [];
  const corners = [
    [hw, hd, 0],
    [-hw, hd, Math.PI * 0.5],
    [-hw, -hd, Math.PI],
    [hw, -hd, Math.PI * 1.5],
  ];
  for (const [cx, cz, a0] of corners) {
    for (let k = 0; k <= 5; k += 1) {
      const a = a0 + (k / 5) * Math.PI * 0.5;
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
    }
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
  return new THREE.TubeGeometry(curve, 48, tube, 5, true);
}

// Radially pleated (sunburst) scroll-arm face disc
function createSunburstPleatDisc(radius, pleats = 14, depth = 0.012) {
  const geo = new THREE.CircleGeometry(radius, pleats * 4, 0, Math.PI * 2);
  // add rings for smooth displacement
  const ring = new THREE.RingGeometry(0.0001, radius, pleats * 4, 5);
  const pos = ring.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.hypot(x, y) / radius;
    const a = Math.atan2(y, x);
    const pleat = Math.abs(Math.sin(a * pleats * 0.5));
    pos.setZ(i, (1 - r * r) * 0.5 * depth + Math.sqrt(pleat) * depth * r * (1 - r) * 2.2);
  }
  ring.computeVertexNormals();
  geo.dispose();
  return ring;
}

let _velvetCache = null;
function getChesterfieldVelvets() {
  if (_velvetCache) return _velvetCache;
  const mk = (hex, sheenHex, rough) =>
    new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness: rough,
      metalness: 0,
      sheen: 1.0,
      sheenRoughness: 0.32,
      sheenColor: new THREE.Color(sheenHex),
      side: THREE.FrontSide,
    });
  _velvetCache = {
    body: mk(0xbd717d, 0xffd2da, 0.66),
    deep: mk(0x9e5361, 0xf3b9c4, 0.7),
    piping: mk(0x8a4552, 0xe7a8b4, 0.6),
    button: mk(0x7f3e4b, 0xe0a0ac, 0.55),
  };
  return _velvetCache;
}

export function buildButtonTuftedChesterfieldSofa(mats) {
  const sofa = new THREE.Group();
  const V = getChesterfieldVelvets();

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

  // Upholstered base plinth + walnut skirt rail + piping welts + brass nailhead row along the front
  addMesh(sofa, createPillowedCushionGeo(2.68, 0.19, 0.86, 0.06, 0.008), V.body, 0, 0.23, 0.02);
  addMesh(sofa, new THREE.BoxGeometry(2.56, 0.028, 0.82), mats.walnut, 0, 0.145, 0.02);
  addMesh(sofa, createPipingLoopGeo(2.66, 0.84, 0.06, 0.009), V.piping, 0, 0.322, 0.02);
  const nailGeo = new THREE.SphereGeometry(0.0085, 6, 4);
  for (let n = 0; n < 46; n += 1) {
    addMesh(sofa, nailGeo, mats.brass, -1.12 + (n / 45) * 2.24, 0.172, 0.452);
  }

  // 3 Plump piped velvet seat cushions (welted top & bottom)
  const seatCushGeo = createPillowedCushionGeo(0.76, 0.15, 0.68, 0.065, 0.03);
  const pipeTop = createPipingLoopGeo(0.745, 0.665, 0.06, 0.0085);
  for (const cx of [-0.765, 0, 0.765]) {
    addMesh(sofa, seatCushGeo, V.body, cx, 0.39, 0.09);
    addMesh(sofa, pipeTop, V.piping, cx, 0.452, 0.09);
    addMesh(sofa, pipeTop, V.piping, cx, 0.328, 0.09);
  }

  // Continuous back core + deep diamond-tufted capitonné face with covered buttons
  addMesh(sofa, createPillowedCushionGeo(2.36, 0.58, 0.24, 0.06, 0.01), V.deep, 0, 0.61, -0.32, -0.08, 0, 0);
  const back = createTuftedPanelGeo(2.26, 0.46, { cols: 10, rows: 4, depth: 0.04, margin: 0.06, segPerCell: 12, bow: 0.02 });
  const backGrp = new THREE.Group();
  backGrp.position.set(0, 0.645, -0.205);
  backGrp.rotation.x = -0.1;
  addMesh(backGrp, back.geo, V.body);
  const btnGeo = new THREE.SphereGeometry(0.0125, 8, 6);
  btnGeo.scale(1, 1, 0.62);
  for (const b of back.buttons) addMesh(backGrp, btnGeo, V.button, b.x, b.y, b.z);
  sofa.add(backGrp);

  // Rolled scroll crest along the top (tufting pleats roll over it) + piping welt
  const backRollCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.3, 0.85, -0.31),
    new THREE.Vector3(-0.65, 0.875, -0.315),
    new THREE.Vector3(0, 0.88, -0.315),
    new THREE.Vector3(0.65, 0.875, -0.315),
    new THREE.Vector3(1.3, 0.85, -0.31),
  ]);
  const rollGeo = new THREE.TubeGeometry(backRollCurve, 40, 0.1, 16, false);
  // vertical pleat folds radiating over the roll
  {
    const p = rollGeo.attributes.position;
    const n = rollGeo.attributes.normal;
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i);
      const fold = Math.pow(Math.abs(Math.sin((x / 0.226) * Math.PI)), 0.5) * 0.008;
      p.setXYZ(i, p.getX(i) + n.getX(i) * fold, p.getY(i) + n.getY(i) * fold, p.getZ(i) + n.getZ(i) * fold);
    }
    rollGeo.computeVertexNormals();
  }
  addMesh(sofa, rollGeo, V.deep);

  // Left & right rolled arms: tufted inner/outer faces + pleated sunburst scroll faces + nailhead rings
  const armIn = createTuftedPanelGeo(0.78, 0.38, { cols: 4, rows: 3, depth: 0.032, margin: 0.055, segPerCell: 12 });
  const studGeo = new THREE.SphereGeometry(0.009, 8, 6);
  const sunGeo = createSunburstPleatDisc(0.104, 14, 0.016);
  for (const s of [-1, 1]) {
    addMesh(sofa, createPillowedCushionGeo(0.22, 0.48, 0.84, 0.06, 0.012), V.deep, s * 1.24, 0.54, 0.02);
    for (const face of [-1, 1]) {
      // face = -1 inner side (toward seat), +1 outer side
      const g = new THREE.Group();
      g.position.set(s * (1.24 + face * 0.112), 0.535, 0.02);
      g.rotation.y = s * face * Math.PI * 0.5;
      addMesh(g, armIn.geo, V.body);
      for (const b of armIn.buttons) addMesh(g, btnGeo, V.button, b.x, b.y, b.z);
      sofa.add(g);
    }
    const armRoll = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 1.255, 0.80, -0.36),
      new THREE.Vector3(s * 1.285, 0.795, 0.04),
      new THREE.Vector3(s * 1.28, 0.775, 0.42),
    ]);
    addMesh(sofa, new THREE.TubeGeometry(armRoll, 18, 0.115, 16, false), V.body);

    // Front scroll face: sunburst-pleated velvet disc with central covered button + piping + nailheads
    addMesh(sofa, sunGeo, V.deep, s * 1.28, 0.775, 0.425);
    addMesh(sofa, btnGeo, V.button, s * 1.28, 0.775, 0.445);
    addMesh(sofa, new THREE.TorusGeometry(0.112, 0.008, 6, 28), V.piping, s * 1.28, 0.775, 0.422);
    for (let n = 0; n < 14; n += 1) {
      const a = (n / 14) * Math.PI * 2;
      addMesh(sofa, studGeo, mats.brass, s * 1.28 + Math.cos(a) * 0.128, 0.775 + Math.sin(a) * 0.128, 0.42);
    }
    // vertical front arm panel below the scroll, with its own welt
    addMesh(sofa, createPillowedCushionGeo(0.23, 0.36, 0.04, 0.02, 0.006), V.body, s * 1.255, 0.5, 0.435);
  }

  // 4 Plump pinched-corner velvet & silk throw pillows (slightly slouched, piped)
  const pilLarge = createPlumpPillowGeo(0.44, 0.40, 0.16);
  const pilSmall = createPlumpPillowGeo(0.36, 0.32, 0.14);
  const pillows = new THREE.Group();
  pillows.userData.dynamic = true;
  addMesh(pillows, pilLarge, mats.sageVelvet, -0.9, 0.64, -0.06, -0.2, 0.3, 0.08);
  addMesh(pillows, pilSmall, mats.blushSilk, -0.62, 0.6, 0.02, -0.24, 0.2, 0.05);
  addMesh(pillows, pilLarge, mats.sageVelvet, 0.9, 0.64, -0.06, -0.2, -0.3, -0.08);
  addMesh(pillows, pilSmall, mats.ivoryLinen, 0.62, 0.6, 0.02, -0.24, -0.18, -0.04);
  sofa.add(pillows);
  sofa.userData.pillows = pillows;

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

  // Green Felt Turntable Platter + 78rpm Shellac Record + Crimson Gold Label (spinning group)
  const yTop = y0 + 0.182;
  const turntable = new THREE.Group();
  turntable.position.set(0, 0, 0.01);
  turntable.userData.dynamic = true;
  addMesh(turntable, new THREE.CylinderGeometry(0.145, 0.15, 0.014, 24), mats.brass, 0, yTop + 0.007, 0);
  addMesh(turntable, new THREE.CylinderGeometry(0.14, 0.14, 0.006, 24), mats.foliageLush, 0, yTop + 0.016, 0);
  addMesh(turntable, new THREE.CylinderGeometry(0.135, 0.135, 0.005, 28), mats.wroughtIron, 0, yTop + 0.021, 0);
  // fine sheen groove rings so the spin reads
  for (const gr of [0.07, 0.092, 0.114]) {
    addMesh(turntable, new THREE.TorusGeometry(gr, 0.0012, 3, 40), mats.bronze, 0, yTop + 0.0238, 0, Math.PI * 0.5, 0, 0);
  }
  addMesh(turntable, new THREE.CylinderGeometry(0.046, 0.046, 0.006, 20), mats.waxSeal, 0, yTop + 0.022, 0);
  addMesh(turntable, new THREE.BoxGeometry(0.05, 0.0015, 0.008), mats.brass, 0.018, yTop + 0.0255, 0);
  addMesh(turntable, new THREE.BoxGeometry(0.008, 0.0015, 0.02), mats.ivoryLinen, -0.026, yTop + 0.0255, 0.012);
  addMesh(turntable, new THREE.CylinderGeometry(0.005, 0.005, 0.022, 8), mats.brass, 0, yTop + 0.028, 0);
  grp.add(turntable);

  // Rear Ornate Brass Tonearm Bracket + Gooseneck Tonearm + Mica Soundbox
  const bracketCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, y0 + 0.13, -0.17),
    new THREE.Vector3(0, y0 + 0.20, -0.23),
    new THREE.Vector3(0, y0 + 0.33, -0.20),
  ]);
  addMesh(grp, new THREE.TubeGeometry(bracketCurve, 14, 0.016, 10, false), mats.brass);

  // Tonearm swings about its rear pivot (rest = swung outward, play = needle on the record)
  const tonearm = new THREE.Group();
  tonearm.position.set(0, y0 + 0.30, -0.19);
  tonearm.userData.dynamic = true;
  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.06, -0.05, 0.09),
    new THREE.Vector3(0.055, yTop + 0.042 - (y0 + 0.30), 0.18),
  ]);
  addMesh(tonearm, new THREE.TubeGeometry(armCurve, 12, 0.009, 8, false), mats.mirrorSilver);
  addMesh(tonearm, new THREE.CylinderGeometry(0.026, 0.026, 0.012, 16), mats.mirrorSilver, 0.052, yTop + 0.038 - (y0 + 0.30), 0.195, 0, 0, Math.PI * 0.42);
  addMesh(tonearm, new THREE.SphereGeometry(0.014, 10, 8), mats.brass, 0, 0, 0);
  tonearm.rotation.y = 0.55;
  grp.add(tonearm);
  grp.userData.turntable = turntable;
  grp.userData.tonearm = tonearm;

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
  // Lower main door hangs on a right-hand hinge pivot so it can swing open (interactive)
  const lowerDoorPivot = new THREE.Group();
  lowerDoorPivot.position.set(0.42, 0, 0.27);
  lowerDoorPivot.userData.dynamic = true;
  const lowerDoor = createPillowedCushionGeo(0.84, 1.24, 0.08, 0.08, 0.024);
  addMesh(lowerDoorPivot, lowerDoor, mats.retroMintEnamel, -0.42, 0.69, 0.04);
  // inner door liner + door shelves with milk bottle & jam jar
  const linerMat = mats.retroCreamEnamel;
  addMesh(lowerDoorPivot, new THREE.BoxGeometry(0.74, 1.1, 0.012), linerMat, -0.42, 0.69, -0.004);
  for (const sy of [0.36, 0.72, 1.06]) {
    addMesh(lowerDoorPivot, new THREE.BoxGeometry(0.66, 0.012, 0.07), linerMat, -0.42, sy, -0.04);
    addMesh(lowerDoorPivot, new THREE.BoxGeometry(0.66, 0.05, 0.008), chrome, -0.42, sy + 0.03, -0.074);
  }
  addMesh(lowerDoorPivot, new THREE.CylinderGeometry(0.028, 0.03, 0.2, 10), mats.ivoryLinen, -0.6, 0.47, -0.04);
  addMesh(lowerDoorPivot, new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), mats.waxSeal, -0.6, 0.585, -0.04);
  addMesh(lowerDoorPivot, new THREE.CylinderGeometry(0.03, 0.03, 0.07, 10), mats.roseCrystal || mats.glass, -0.32, 0.77, -0.04);
  addMesh(lowerDoorPivot, new THREE.CylinderGeometry(0.031, 0.031, 0.015, 10), mats.brass, -0.32, 0.81, -0.04);
  fridge.add(lowerDoorPivot);
  fridge.userData.lowerDoor = lowerDoorPivot;

  // Fridge interior (hidden behind the closed door): glowing cream cavity, glass shelves & groceries
  const cavityMat = new THREE.MeshStandardMaterial({
    color: 0xfbf7ef,
    emissive: new THREE.Color(0xfff6e4),
    emissiveIntensity: 0.0,
    roughness: 0.5,
  });
  fridge.userData.cavityMat = cavityMat;
  const cav = new THREE.Group();
  cav.userData.dynamic = true;
  addMesh(cav, new THREE.BoxGeometry(0.76, 1.12, 0.008), cavityMat, 0, 0.69, 0.312);
  for (const sy of [0.42, 0.76, 1.06]) {
    addMesh(cav, new THREE.BoxGeometry(0.74, 0.008, 0.012), mats.glass, 0, sy, 0.318);
  }
  const produce = [
    [-0.24, 0.47, mats.waxSeal, 0.03],
    [-0.17, 0.46, mats.waxSeal, 0.026],
    [-0.1, 0.47, mats.petalPink, 0.028],
    [0.12, 0.81, mats.sageVelvet, 0.035],
    [0.22, 0.8, mats.brass, 0.03],
    [-0.2, 1.1, mats.petalBlush, 0.03],
  ];
  for (const [px, py, pm, pr] of produce) {
    const m = addMesh(cav, new THREE.SphereGeometry(pr, 8, 6), pm, px, py, 0.322);
    m.scale.set(1, 0.9, 0.35);
  }
  addMesh(cav, new THREE.BoxGeometry(0.16, 0.1, 0.012), mats.ivoryLinen, 0.18, 1.12, 0.322);
  addMesh(cav, new THREE.BoxGeometry(0.2, 0.06, 0.012), mats.retroRosePorcelain, -0.05, 0.79, 0.322);
  fridge.add(cav);

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
  for (const hy of [1.46]) {
    const hCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.33, hy, 0.34),
      new THREE.Vector3(-0.31, hy, 0.405),
      new THREE.Vector3(-0.12, hy, 0.40),
      new THREE.Vector3(-0.10, hy, 0.35),
    ]);
    addMesh(fridge, new THREE.TubeGeometry(hCurve, 12, 0.013, 8, false), chrome);
  }

  {
    const hCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.33 + 0.0, 1.14, 0.34),
      new THREE.Vector3(-0.31, 1.14, 0.405),
      new THREE.Vector3(-0.12, 1.14, 0.40),
      new THREE.Vector3(-0.10, 1.14, 0.35),
    ]);
    const hg = new THREE.TubeGeometry(hCurve, 12, 0.013, 8, false);
    hg.translate(-0.42, 0, -0.27);
    addMesh(lowerDoorPivot, hg, chrome);
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

  // Kettle burner flame ring (hidden until the kettle is put on to boil)
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x6fa8ff,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flameRing = addMesh(grp, new THREE.TorusGeometry(0.056, 0.012, 6, 20), flameMat, 0.38, 0.952, 0.14, Math.PI * 0.5, 0, 0);
  flameRing.userData.noShadow = true;
  flameRing.userData.dynamic = true;
  grp.userData.kettleFlame = flameRing;
  grp.userData.kettleSpoutLocal = new THREE.Vector3(0.56, 1.13, 0.14);
  grp.userData.kettleLidLocal = new THREE.Vector3(0.38, 1.16, 0.14);

  // Sculpted French "hotte" bell chimney hood: rounded-U cross-section that tapers in BOTH width and
  // depth along a concave bell curve (reads curved from the front AND the side), with flared lip.
  const hoodY0 = 1.78;
  const backZ = -0.40;
  const bellH = 0.98;
  const wBot = 1.40;
  const wTop = 0.62;
  const dBot = 0.78;
  const dTop = 0.40;
  const ringN = 22;
  const sideN = 4;
  const arcN = 6;
  const frontN = 8;
  const ringPts = (w, d, rr) => {
    const pts = [];
    const hw = w * 0.5;
    const fz = backZ + d;
    for (let i = 0; i <= sideN; i += 1) pts.push([-hw, backZ + ((fz - rr - backZ) * i) / sideN]);
    for (let i = 1; i <= arcN; i += 1) {
      const a = Math.PI + (i / arcN) * Math.PI * 0.5;
      pts.push([-hw + rr + Math.cos(a) * rr, fz - rr - Math.sin(a) * rr]);
    }
    for (let i = 1; i < frontN; i += 1) pts.push([-hw + rr + ((w - rr * 2) * i) / frontN, fz]);
    for (let i = 0; i <= arcN; i += 1) {
      const a = Math.PI * 1.5 + (i / arcN) * Math.PI * 0.5;
      pts.push([hw - rr + Math.cos(a) * rr, fz - rr - Math.sin(a) * rr]);
    }
    for (let i = 1; i <= sideN; i += 1) pts.push([hw, fz - rr - ((fz - rr - backZ) * i) / sideN]);
    return pts;
  };
  const hoodVerts = [];
  const hoodIdx = [];
  let perRing = 0;
  const ringData = [];
  for (let r = 0; r <= ringN; r += 1) {
    const t = r / ringN;
    // concave bell: wide skirt that sweeps up into a slender chimney neck
    const k = Math.pow(1 - t, 2.1);
    let w = wTop + (wBot - wTop) * k;
    let d = dTop + (dBot - dTop) * k;
    let y = hoodY0 + t * bellH;
    if (r === 0) {
      w += 0.05;
      d += 0.03;
    }
    const rr = Math.min(0.16, d * 0.32);
    const pts = ringPts(w, d, rr);
    perRing = pts.length;
    ringData.push({ y, pts });
    for (const [x, z] of pts) hoodVerts.push(x, y, z);
  }
  for (let r = 0; r < ringN; r += 1) {
    for (let i = 0; i < perRing - 1; i += 1) {
      const a0 = r * perRing + i;
      const a1 = a0 + 1;
      const b0 = a0 + perRing;
      const b1 = b0 + 1;
      hoodIdx.push(a0, a1, b0, a1, b1, b0);
    }
  }
  const hoodGeo = new THREE.BufferGeometry();
  hoodGeo.setAttribute("position", new THREE.Float32BufferAttribute(hoodVerts, 3));
  hoodGeo.setIndex(hoodIdx);
  hoodGeo.computeVertexNormals();
  const hoodMat = mats.extBlushTrim.clone();
  hoodMat.side = THREE.DoubleSide;
  addMesh(grp, hoodGeo, hoodMat);

  // Moldings that follow the bell outline: brass lip rail, cream bead above it, neck collar
  const ringTube = (ri, yOff, tubeR, mat, scaleOut = 1.0) => {
    const rd = ringData[ri];
    const pts = rd.pts.map(([x, z]) => new THREE.Vector3(x * scaleOut, rd.y + yOff, backZ + (z - backZ) * scaleOut));
    const c = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    return addMesh(grp, new THREE.TubeGeometry(c, perRing * 2, tubeR, 6, false), mat);
  };
  ringTube(0, -0.01, 0.032, mats.brass, 1.0);
  ringTube(1, 0.0, 0.016, mats.creamMolding, 1.01);
  ringTube(ringN, 0.0, 0.022, mats.creamMolding, 1.04);

  // Underside canopy (dark soot liner) + twin brass filter grilles
  addMesh(grp, new THREE.BoxGeometry(wBot - 0.06, 0.012, dBot - 0.06), mats.wroughtIron, 0, hoodY0 + 0.012, backZ + (dBot - 0.06) * 0.5 + 0.02);
  for (const gx of [-0.32, 0.32]) {
    addMesh(grp, new THREE.BoxGeometry(0.44, 0.006, 0.36), mats.brass, gx, hoodY0 + 0.004, backZ + 0.38);
  }

  // Walnut mantel ledge riding on the lip rail with a salt pig, oil cruet & copper canister
  const frontZAt = (yl) => {
    const t = clamp(yl / bellH, 0, 1);
    return backZ + dTop + (dBot - dTop) * Math.pow(1 - t, 2.1);
  };
  const ledgeY = hoodY0 + 0.05;
  const ledgeZ = frontZAt(0.05) + 0.06;
  addMesh(grp, createPillowedCushionGeo(1.46, 0.035, 0.13, 0.02, 0), mats.walnut, 0, ledgeY, ledgeZ);
  const itemY = ledgeY + 0.018;
  addMesh(grp, createTurnedLatheGeo([[0.001, 0], [0.04, 0.0], [0.045, 0.04], [0.032, 0.075], [0.02, 0.08]], 12), mats.retroRosePorcelain, -0.46, itemY, ledgeZ);
  addMesh(grp, createTurnedLatheGeo([[0.001, 0], [0.026, 0], [0.03, 0.06], [0.01, 0.12], [0.008, 0.15]], 10), mats.glass, -0.2, itemY, ledgeZ);
  addMesh(grp, new THREE.CylinderGeometry(0.035, 0.035, 0.09, 12), mats.copper, 0.26, itemY + 0.045, ledgeZ);
  addMesh(grp, new THREE.SphereGeometry(0.036, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), mats.copper, 0.26, itemY + 0.09, ledgeZ);
  addMesh(grp, new THREE.CylinderGeometry(0.03, 0.028, 0.07, 12), mats.celadonGlaze, 0.48, itemY + 0.035, ledgeZ);

  // Front oval cartouche plaque with rosette, laid onto the curved bell face
  const cy = 0.5;
  const slope = (frontZAt(cy - 0.02) - frontZAt(cy + 0.02)) / 0.04;
  const tilt = -Math.atan(slope);
  const cz = frontZAt(cy) + 0.008;
  const cart = addMesh(grp, new THREE.TorusGeometry(0.1, 0.012, 6, 24), mats.brass, 0, hoodY0 + cy, cz);
  cart.scale.set(1.3, 0.85, 1);
  cart.rotation.x = tilt;
  const rose = addMesh(grp, new THREE.SphereGeometry(0.035, 10, 8), mats.brass, 0, hoodY0 + cy, cz + 0.005);
  rose.scale.set(1, 1, 0.5);

  // Straight chimney stack up to the ceiling + mid band + stepped crown cornice
  const chimH = 3.40 - (hoodY0 + bellH);
  const chimY = hoodY0 + bellH + chimH * 0.5;
  addMesh(grp, new THREE.BoxGeometry(wTop - 0.02, chimH, dTop - 0.01), hoodMat, 0, chimY, backZ + (dTop - 0.01) * 0.5);
  addMesh(grp, new THREE.BoxGeometry(wTop + 0.04, 0.04, dTop + 0.03), mats.creamMolding, 0, hoodY0 + bellH + 0.25, backZ + (dTop + 0.03) * 0.5);
  addMesh(grp, new THREE.BoxGeometry(wTop + 0.1, 0.06, dTop + 0.06), mats.creamMolding, 0, 3.35, backZ + (dTop + 0.06) * 0.5);
  addMesh(grp, new THREE.BoxGeometry(wTop + 0.05, 0.035, dTop + 0.035), mats.creamMolding, 0, 3.30, backZ + (dTop + 0.035) * 0.5);

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

let _globeMat = null;
function getAntiqueGlobeMaterial() {
  if (_globeMat) return _globeMat;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#cfe0d2";
  g.fillRect(0, 0, 256, 128);
  // sepia ocean wash
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, "rgba(232,214,170,0.55)");
  grd.addColorStop(0.5, "rgba(170,200,184,0.35)");
  grd.addColorStop(1, "rgba(232,214,170,0.55)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 128);
  // stylised continents (parchment cream with sienna outlines)
  const blobs = [
    [40, 40, 26, 18], [52, 78, 12, 22], [122, 36, 30, 14], [132, 70, 16, 24], [176, 44, 38, 20],
    [206, 88, 16, 10], [96, 108, 40, 8],
  ];
  for (const [x, y, rx, ry] of blobs) {
    g.beginPath();
    for (let k = 0; k <= 24; k += 1) {
      const a = (k / 24) * Math.PI * 2;
      const wob = 1 + 0.22 * Math.sin(a * 3 + x) + 0.12 * Math.cos(a * 5 + y);
      const px = x + Math.cos(a) * rx * wob;
      const py = y + Math.sin(a) * ry * wob;
      if (k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fillStyle = "#efe0bf";
    g.fill();
    g.strokeStyle = "#9a6a43";
    g.lineWidth = 1.4;
    g.stroke();
  }
  g.strokeStyle = "rgba(120,90,60,0.35)";
  g.lineWidth = 0.8;
  for (let i = 1; i < 8; i += 1) {
    g.beginPath();
    g.moveTo((i * 256) / 8, 0);
    g.lineTo((i * 256) / 8, 128);
    g.stroke();
  }
  for (let j = 1; j < 4; j += 1) {
    g.beginPath();
    g.moveTo(0, (j * 128) / 4);
    g.lineTo(256, (j * 128) / 4);
    g.stroke();
  }
  // tiny heart marking "our harbour"
  g.fillStyle = "#b8455a";
  g.font = "14px serif";
  g.fillText("\u2665", 168, 60);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  _globeMat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  return _globeMat;
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
  // Spinning parchment globe (tilted axis), with a painted antique map so the rotation reads
  const globeTilt = new THREE.Group();
  globeTilt.position.set(gx, lampY + 0.175, gz);
  globeTilt.rotation.set(0, 0.4, -0.41);
  globeTilt.userData.dynamic = true;
  const globeSpin = new THREE.Group();
  globeSpin.userData.dynamic = true;
  addMesh(globeSpin, new THREE.SphereGeometry(0.084, 20, 14), getAntiqueGlobeMaterial());
  globeTilt.add(globeSpin);
  grp.add(globeTilt);
  grp.userData.globeSpin = globeSpin;
  grp.userData.lampShadeMat = emeraldOuter;
  grp.userData.lampBulbLocal = new THREE.Vector3(lampX, lampY + 0.31, lampZ + 0.05);
  grp.userData.globeLocal = new THREE.Vector3(gx, lampY + 0.175, gz);

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
  // 6 Metallic Strings (own group so they can shimmer when strummed)
  const strings = new THREE.Group();
  strings.userData.dynamic = true;
  for (let st = 0; st < 6; st += 1) {
    const sx = -0.02 + st * 0.008;
    addMesh(strings, new THREE.CylinderGeometry(0.0012, 0.0012, 0.76, 4), mats.mirrorSilver, sx, 0.32, 0.063);
  }
  guitar.add(strings);
  guitar.userData.dynamic = true;

  grp.add(guitar);
  grp.userData.guitar = guitar;
  grp.userData.strings = strings;
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
  // Deep diamond-tufted capitonné headboard face with covered velvet buttons
  const btnGeo = new THREE.SphereGeometry(0.013, 8, 6);
  {
    const V = getChesterfieldVelvets();
    const hb = createTuftedPanelGeo(1.86, 0.92, { cols: 8, rows: 5, depth: 0.036, margin: 0.07, segPerCell: 10 });
    const hbGrp = new THREE.Group();
    hbGrp.position.set(0, 1.0, -1.02);
    addMesh(hbGrp, hb.geo, V.deep);
    const cb = new THREE.SphereGeometry(0.012, 8, 6);
    cb.scale(1, 1, 0.6);
    for (const b of hb.buttons) addMesh(hbGrp, cb, V.button, b.x, b.y, b.z);
    bed.add(hbGrp);
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
  const pillowSets = [];
  for (const s of [-1, 1]) {
    // each side's stack lives in its own group so it can be plumped (squash & stretch)
    const side = new THREE.Group();
    side.position.set(s * 0.48, 0.70, -0.62);
    side.userData.dynamic = true;
    addMesh(side, euroPil, mats.ivoryLinen, s * 0.02, 0.12, -0.22, -0.22, -s * 0.05, 0);
    addMesh(side, sleepPil, mats.blushSilk, 0, 0.07, -0.04, -0.32, -s * 0.06, 0);
    addMesh(side, accentPil, s < 0 ? mats.sageVelvet : mats.deepRoseVelvet, -s * 0.1, 0.04, 0.14, -0.38, -s * 0.08, 0);
    bed.add(side);
    pillowSets.push(side);
  }
  const bolster = new THREE.CylinderGeometry(0.085, 0.085, 0.88, 16);
  bolster.rotateZ(Math.PI * 0.5);
  addMesh(bed, bolster, mats.sageVelvet, 0, 0.73, -0.32);
  for (const bx of [-0.45, 0.45]) {
    addMesh(bed, new THREE.SphereGeometry(0.032, 10, 8), mats.brass, bx, 0.73, -0.32);
  }
  bed.userData.pillowSets = pillowSets;

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

  const levers = [];
  m.userData.levers = levers;
  m.userData.spoutLocal = new THREE.Vector3(0.11, 0.19, 0.13);
  // Pressure Gauge Dial + Twin Groupheads + Lever Arms + Walnut Portafilter Handles
  addMesh(m, new THREE.CylinderGeometry(0.038, 0.038, 0.02, 16), porcelainMat, 0, 0.34, 0.155, Math.PI * 0.5, 0, 0);
  for (const gx of [-0.11, 0.11]) {
    addMesh(m, new THREE.CylinderGeometry(0.038, 0.034, 0.09, 14), chromeMat, gx, 0.25, 0.13);
    // Angled Piston Lever (pivoted at the grouphead so it can be pulled down)
    const lever = new THREE.Group();
    lever.position.set(gx, 0.29, 0.145);
    lever.userData.dynamic = true;
    addMesh(lever, new THREE.CylinderGeometry(0.007, 0.007, 0.22, 8), chromeMat, 0, 0.08, 0.045, 0.52, 0, 0);
    addMesh(lever, new THREE.CylinderGeometry(0.014, 0.012, 0.07, 10), walnutMat, 0, 0.17, 0.095, 0.52, 0, 0);
    m.add(lever);
    levers.push(lever);
    // Portafilter Handle
    addMesh(m, new THREE.CylinderGeometry(0.013, 0.010, 0.14, 10), walnutMat, gx, 0.22, 0.24, Math.PI * 0.5, 0, gx * 1.4);
  }
  // Stacked Espresso Cups on Side
  for (let c = 0; c < 3; c += 1) {
    addMesh(m, new THREE.CylinderGeometry(0.028, 0.020, 0.042, 12), porcelainMat, 0.22, 0.10 + c * 0.038, 0.06);
  }

  return m;
}

// ---------------------------------------------------------------------------
// 15. Small-Scale Lived-In Detail Props (portraits, books, slippers, fruit, tea, throws, candles…)
// ---------------------------------------------------------------------------
let _detailMatCache = null;
function getDetailMats() {
  if (_detailMatCache) return _detailMatCache;
  const std = (color, roughness = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  _detailMatCache = {
    lemon: std(0xe9c54a, 0.42),
    apple: std(0xb3333d, 0.32),
    peach: std(0xf1a07c, 0.6),
    grape: std(0x5d3a63, 0.3),
    leaf: std(0x5d8a4e, 0.55, { side: THREE.DoubleSide }),
    pages: std(0xf3ead6, 0.9),
    tea: new THREE.MeshPhysicalMaterial({ color: 0xa85b2a, roughness: 0.08, clearcoat: 1, transmission: 0, transparent: true, opacity: 0.92 }),
    coffee: std(0x3b2216, 0.15),
    water: new THREE.MeshBasicMaterial({ color: 0xbfe2ff, transparent: true, opacity: 0.55, depthWrite: false }),
    wax: std(0xfbf3e6, 0.7, { emissive: new THREE.Color(0xffd7a8), emissiveIntensity: 0.06 }),
    plush: new THREE.MeshPhysicalMaterial({ color: 0xf0c9cf, roughness: 0.95, sheen: 1, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xffffff) }),
    plushSage: new THREE.MeshPhysicalMaterial({ color: 0xb9cbb9, roughness: 0.95, sheen: 1, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xffffff) }),
    wicker: std(0xb08a5a, 0.85),
    pasta: std(0xe8c97a, 0.7),
    beans: std(0x4a2c1d, 0.5),
    sugar: std(0xfaf8f2, 0.8),
    jarGlass: new THREE.MeshPhysicalMaterial({ color: 0xeef6f4, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false }),
    napkin: std(0xf2dfe0, 0.85),
    crystal: new THREE.MeshPhysicalMaterial({ color: 0xf6fbff, roughness: 0.04, transparent: true, opacity: 0.4, depthWrite: false }),
    wine: std(0x7b1f2c, 0.1, { transparent: true, opacity: 0.88 }),
  };
  return _detailMatCache;
}
export { getDetailMats };

// Soft painterly canvases of the couple (stylised silhouettes; never photoreal)
const _portraitTexCache = new Map();
export function createCouplePortraitTexture(variant = 0) {
  if (_portraitTexCache.has(variant)) return _portraitTexCache.get(variant);
  const W = 256;
  const H = 320;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  let s = 1234 + variant * 977;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const palettes = [
    { sky: ["#f9d3b8", "#f2a7a9", "#b9a3c9"], sea: "#7fa7b5", ground: "#e9d2b5", sun: "#fff1cf" },
    { sky: ["#fbe6ea", "#f4c9d2", "#e5b6c4"], sea: "#9cbf9f", ground: "#8fae84", sun: "#ffffff" },
    { sky: ["#2e3b63", "#51548a", "#a07ca6"], sea: "#384d78", ground: "#43506e", sun: "#fff6d8" },
    { sky: ["#f6efe2", "#eadfcd", "#dccbb4"], sea: "#c9b9a2", ground: "#d6c4ab", sun: "#ffffff" },
  ];
  const P = palettes[variant % palettes.length];
  const grd = g.createLinearGradient(0, 0, 0, H * 0.62);
  grd.addColorStop(0, P.sky[2]);
  grd.addColorStop(0.55, P.sky[1]);
  grd.addColorStop(1, P.sky[0]);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // sun / moon glow
  const sunX = variant === 2 ? 190 : 128;
  const sunY = variant === 2 ? 70 : 170;
  const rg = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, 70);
  rg.addColorStop(0, P.sun);
  rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, W, H);
  if (variant === 2) {
    g.fillStyle = "#fff8e2";
    for (let i = 0; i < 40; i += 1) g.fillRect(rnd() * W, rnd() * H * 0.5, 1.5, 1.5);
  }
  // sea / garden band and foreground
  if (variant !== 3) {
    g.fillStyle = P.sea;
    g.fillRect(0, H * 0.6, W, H * 0.14);
    g.fillStyle = "rgba(255,255,255,0.25)";
    for (let i = 0; i < 26; i += 1) g.fillRect(rnd() * W, H * 0.6 + rnd() * H * 0.14, 10 + rnd() * 18, 1.5);
  }
  g.fillStyle = P.ground;
  g.beginPath();
  g.moveTo(0, H * 0.74);
  g.quadraticCurveTo(W * 0.5, H * 0.69, W, H * 0.75);
  g.lineTo(W, H);
  g.lineTo(0, H);
  g.fill();
  if (variant === 1) {
    // rose arch
    g.strokeStyle = "#6f8f62";
    g.lineWidth = 9;
    g.beginPath();
    g.arc(128, 200, 92, Math.PI, 0);
    g.stroke();
    for (let i = 0; i < 46; i += 1) {
      const a = Math.PI + rnd() * Math.PI;
      g.fillStyle = rnd() > 0.5 ? "#e58c9e" : "#f6c6d0";
      g.beginPath();
      g.arc(128 + Math.cos(a) * 92 + (rnd() - 0.5) * 10, 200 + Math.sin(a) * 92 + (rnd() - 0.5) * 10, 4 + rnd() * 4, 0, Math.PI * 2);
      g.fill();
    }
  }
  // the couple: girl (long hair, rose dress) and boy (sage shirt), holding hands
  const fig = (x, girl) => {
    const base = 248;
    g.fillStyle = girl ? "#c86f80" : "#55705c";
    if (girl) {
      g.beginPath();
      g.moveTo(x - 20, base);
      g.lineTo(x + 20, base);
      g.lineTo(x + 7, base - 58);
      g.lineTo(x - 7, base - 58);
      g.fill();
    } else {
      g.fillRect(x - 12, base - 62, 24, 36);
      g.fillStyle = "#3d4a58";
      g.fillRect(x - 11, base - 28, 9, 28);
      g.fillRect(x + 2, base - 28, 9, 28);
    }
    g.fillStyle = "#f2d2bd";
    g.beginPath();
    g.arc(x, base - 72, 11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = girl ? "#4a2e25" : "#2e2420";
    g.beginPath();
    if (girl) {
      g.arc(x, base - 75, 12, Math.PI, 0);
      g.fillRect(x - 12, base - 75, 6, 26);
      g.fillRect(x + 6, base - 75, 6, 26);
    } else {
      g.arc(x, base - 76, 11.5, Math.PI * 1.05, -0.05);
    }
    g.fill();
  };
  fig(108, true);
  fig(148, false);
  g.strokeStyle = "#f2d2bd";
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(116, 212);
  g.lineTo(138, 212);
  g.stroke();
  // little heart
  g.fillStyle = variant === 2 ? "#ffd2dc" : "#d9576d";
  g.font = "28px serif";
  g.fillText("\u2665", 116, 140);
  // painterly brush dabs + warm vignette
  for (let i = 0; i < 900; i += 1) {
    const x = rnd() * W;
    const y = rnd() * H;
    const d = g.getImageData(x | 0, y | 0, 1, 1).data;
    g.fillStyle = `rgba(${d[0]},${d[1]},${d[2]},0.5)`;
    g.fillRect(x - 3, y - 1, 6 + rnd() * 4, 2 + rnd() * 2);
  }
  const vg = g.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(80,50,30,0.35)");
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  _portraitTexCache.set(variant, tex);
  return tex;
}

const _portraitMatCache = new Map();
function getPortraitMat(variant) {
  if (!_portraitMatCache.has(variant)) {
    _portraitMatCache.set(variant, new THREE.MeshStandardMaterial({ map: createCouplePortraitTexture(variant), roughness: 0.62 }));
  }
  return _portraitMatCache.get(variant);
}

// Framed portrait. Origin = bottom centre, picture faces +Z. stand=true adds a back strut (tabletop frame).
export function buildFramedPortrait(mats, { w = 0.16, h = 0.2, variant = 0, frameMat = null, stand = true, border = 0.018, mat = true } = {}) {
  const grp = new THREE.Group();
  const fm = frameMat || mats.brass;
  const lean = stand ? -0.16 : 0;
  const inner = new THREE.Group();
  inner.rotation.x = lean;
  grp.add(inner);
  const cy = h * 0.5;
  const t = 0.014;
  addMesh(inner, new THREE.BoxGeometry(w, border, t), fm, 0, border * 0.5, 0);
  addMesh(inner, new THREE.BoxGeometry(w, border, t), fm, 0, h - border * 0.5, 0);
  addMesh(inner, new THREE.BoxGeometry(border, h, t), fm, -w * 0.5 + border * 0.5, cy, 0);
  addMesh(inner, new THREE.BoxGeometry(border, h, t), fm, w * 0.5 - border * 0.5, cy, 0);
  const iw = w - border * 2;
  const ih = h - border * 2;
  if (mat) addMesh(inner, new THREE.PlaneGeometry(iw, ih), mats.ivoryLinen, 0, cy, 0.0005);
  const pw = mat ? iw * 0.8 : iw;
  const ph = mat ? ih * 0.82 : ih;
  addMesh(inner, new THREE.PlaneGeometry(pw, ph), getPortraitMat(variant), 0, cy, 0.0015);
  addMesh(inner, new THREE.BoxGeometry(w * 0.96, h * 0.96, 0.004), mats.walnut, 0, cy, -0.006);
  if (stand) addMesh(grp, new THREE.BoxGeometry(0.02, h * 0.8, 0.006), mats.walnut, 0, h * 0.38, -h * 0.2, 0.42, 0, 0);
  return grp;
}

// Stack of clothbound books lying flat. Origin bottom centre.
const BOOK_COLORS = [0x4c6b54, 0xa85f6b, 0x7b3b44, 0xb89255, 0xe6dcd0, 0x5c4738, 0x7a9480, 0xc88d97];
const _bookMats = new Map();
function bookMat(hex) {
  if (!_bookMats.has(hex)) _bookMats.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.72 }));
  return _bookMats.get(hex);
}
export function buildBookStack(mats, count = 3, seed = 1) {
  const grp = new THREE.Group();
  const D = getDetailMats();
  let y = 0;
  let s = seed * 7919 + 13;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < count; i += 1) {
    const w = 0.15 + rnd() * 0.08;
    const d = 0.2 + rnd() * 0.08;
    const th = 0.022 + rnd() * 0.02;
    const ry = (rnd() - 0.5) * 0.4;
    const b = new THREE.Group();
    b.position.set((rnd() - 0.5) * 0.02, y, 0);
    b.rotation.y = ry;
    addMesh(b, new THREE.BoxGeometry(w, th, d), bookMat(BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)]), 0, th * 0.5, 0);
    addMesh(b, new THREE.BoxGeometry(w - 0.006, th * 0.78, d * 0.96), D.pages, 0.004, th * 0.5, 0);
    addMesh(b, new THREE.BoxGeometry(0.004, th * 0.2, d * 0.7), mats.brass, -w * 0.5 - 0.001, th * 0.5, 0);
    grp.add(b);
    y += th;
  }
  grp.userData.height = y;
  return grp;
}

// Pair of plush pom-pom slippers. Origin = floor between them, toes toward +Z.
export function buildPlushSlippers(mats, sage = false) {
  const D = getDetailMats();
  const fur = sage ? D.plushSage : D.plush;
  const grp = new THREE.Group();
  const soleGeo = createPillowedCushionGeo(0.095, 0.026, 0.25, 0.045, 0.004);
  const upperGeo = new THREE.SphereGeometry(0.06, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
  upperGeo.scale(0.82, 0.62, 1.08);
  const heelGeo = new THREE.TorusGeometry(0.038, 0.012, 6, 14, Math.PI);
  for (const [sx, ry] of [
    [-0.065, 0.12],
    [0.065, -0.06],
  ]) {
    const sl = new THREE.Group();
    sl.position.set(sx, 0, 0);
    sl.rotation.y = ry;
    addMesh(sl, soleGeo, mats.creamLinen, 0, 0.013, 0);
    addMesh(sl, upperGeo, fur, 0, 0.024, 0.055);
    addMesh(sl, heelGeo, fur, 0, 0.03, -0.075, -Math.PI * 0.5, 0, 0);
    addMesh(sl, new THREE.SphereGeometry(0.02, 8, 6), fur, 0, 0.06, 0.08);
    grp.add(sl);
  }
  return grp;
}

// Footed porcelain fruit bowl heaped with lemons, peaches, apples and grapes. Origin bottom centre.
export function buildFruitBowl(mats) {
  const D = getDetailMats();
  const grp = new THREE.Group();
  addMesh(
    grp,
    createTurnedLatheGeo(
      [
        [0.05, 0],
        [0.045, 0.012],
        [0.022, 0.03],
        [0.03, 0.045],
        [0.12, 0.08],
        [0.15, 0.115],
        [0.146, 0.12],
        [0.11, 0.085],
        [0.02, 0.055],
      ],
      24
    ),
    mats.retroRosePorcelain
  );
  addMesh(grp, new THREE.TorusGeometry(0.149, 0.004, 6, 28), mats.brass, 0, 0.118, 0, Math.PI * 0.5, 0, 0);
  const fruit = [
    [0, 0.12, 0, D.peach, 0.042],
    [0.055, 0.115, 0.03, D.lemon, 0.036],
    [-0.06, 0.11, 0.025, D.apple, 0.04],
    [0.02, 0.112, -0.06, D.apple, 0.039],
    [-0.035, 0.115, -0.05, D.lemon, 0.035],
    [0.07, 0.11, -0.035, D.peach, 0.038],
    [-0.01, 0.165, 0.005, D.lemon, 0.034],
  ];
  for (const [x, y, z, m, r] of fruit) {
    const f = addMesh(grp, new THREE.SphereGeometry(r, 12, 9), m, x, y, z);
    if (m === D.lemon) f.scale.set(1, 0.82, 1.25);
  }
  // grape cluster spilling over the rim
  for (let i = 0; i < 14; i += 1) {
    const a = i * 2.39;
    const rr = 0.012 + (i % 4) * 0.008;
    addMesh(grp, new THREE.SphereGeometry(0.0115, 7, 5), D.grape, -0.11 + Math.cos(a) * rr, 0.12 - (i % 5) * 0.012, 0.07 + Math.sin(a) * rr);
  }
  const lf = addMesh(grp, new THREE.PlaneGeometry(0.05, 0.026), D.leaf, -0.005, 0.2, 0.01, -0.6, 0.4, 0);
  lf.userData.noShadow = true;
  return grp;
}

// Rose porcelain teapot + two cups & saucers with fillable tea and a pour stream.
export function buildPorcelainTeaService(mats) {
  const D = getDetailMats();
  const grp = new THREE.Group();
  const teapot = new THREE.Group();
  teapot.userData.dynamic = true;
  const potBody = createTurnedLatheGeo(
    [
      [0.001, 0],
      [0.05, 0.0],
      [0.075, 0.03],
      [0.08, 0.07],
      [0.062, 0.11],
      [0.04, 0.122],
    ],
    20
  );
  addMesh(teapot, potBody, mats.retroRosePorcelain);
  addMesh(teapot, new THREE.SphereGeometry(0.042, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mats.retroRosePorcelain, 0, 0.118, 0);
  addMesh(teapot, new THREE.SphereGeometry(0.012, 8, 6), mats.brass, 0, 0.165, 0);
  addMesh(teapot, new THREE.TorusGeometry(0.0785, 0.003, 4, 24), mats.brass, 0, 0.07, 0, Math.PI * 0.5, 0, 0);
  const spout = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.065, 0.045, 0),
    new THREE.Vector3(0.11, 0.07, 0),
    new THREE.Vector3(0.135, 0.12, 0),
  ]);
  addMesh(teapot, new THREE.TubeGeometry(spout, 10, 0.011, 8, false), mats.retroRosePorcelain);
  addMesh(teapot, new THREE.TorusGeometry(0.038, 0.008, 6, 14, Math.PI * 1.2), mats.retroRosePorcelain, -0.085, 0.07, 0, 0, 0, Math.PI * 0.4);
  grp.add(teapot);
  const cups = [];
  const cupGeo = createTurnedLatheGeo(
    [
      [0.001, 0],
      [0.022, 0],
      [0.034, 0.025],
      [0.039, 0.05],
      [0.036, 0.05],
      [0.031, 0.027],
      [0.001, 0.006],
    ],
    18
  );
  for (const cx of [0.22, 0.34]) {
    const cup = new THREE.Group();
    cup.position.set(cx, 0, 0.04);
    addMesh(cup, new THREE.CylinderGeometry(0.058, 0.05, 0.008, 20), mats.retroRosePorcelain, 0, 0.004, 0);
    addMesh(cup, cupGeo, mats.zelligeTile, 0, 0.008, 0);
    addMesh(cup, new THREE.TorusGeometry(0.014, 0.004, 5, 10), mats.zelligeTile, 0.043, 0.035, 0, 0, 0, 0);
    const tea = addMesh(cup, new THREE.CircleGeometry(0.033, 18), D.tea, 0, 0.02, 0, -Math.PI * 0.5, 0, 0);
    tea.userData.dynamic = true;
    tea.userData.noShadow = true;
    tea.visible = false;
    cups.push({ group: cup, tea });
    grp.add(cup);
  }
  const stream = addMesh(grp, new THREE.CylinderGeometry(0.004, 0.0055, 1, 6), D.tea, 0, 0, 0);
  stream.visible = false;
  stream.userData.dynamic = true;
  stream.userData.noShadow = true;
  grp.userData.teapot = teapot;
  grp.userData.cups = cups;
  grp.userData.stream = stream;
  return grp;
}

// Hammered copper French watering can. Origin bottom centre, spout toward +X.
export function buildWateringCan(mats) {
  const grp = new THREE.Group();
  addMesh(grp, createTurnedLatheGeo([[0.001, 0], [0.08, 0], [0.088, 0.02], [0.085, 0.16], [0.07, 0.2], [0.03, 0.215]], 20), mats.copper);
  addMesh(grp, new THREE.TorusGeometry(0.086, 0.005, 5, 24), mats.brass, 0, 0.12, 0, Math.PI * 0.5, 0, 0);
  const sp = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.07, 0.04, 0),
    new THREE.Vector3(0.16, 0.13, 0),
    new THREE.Vector3(0.25, 0.25, 0),
  ]);
  addMesh(grp, new THREE.TubeGeometry(sp, 12, 0.012, 8, false), mats.copper);
  addMesh(grp, new THREE.CylinderGeometry(0.03, 0.014, 0.04, 12), mats.brass, 0.262, 0.262, 0, 0, 0, -0.9);
  const hc = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.08, 0.06, 0),
    new THREE.Vector3(-0.14, 0.17, 0),
    new THREE.Vector3(-0.07, 0.29, 0),
    new THREE.Vector3(0.02, 0.22, 0),
  ]);
  addMesh(grp, new THREE.TubeGeometry(hc, 14, 0.01, 6, false), mats.brass);
  grp.userData.roseLocal = new THREE.Vector3(0.28, 0.28, 0);
  return grp;
}

// Knitted throw draped over a horizontal bar/roll along X at the origin (radius r), with fringe.
let _knitTex = null;
function getKnitTexture() {
  if (_knitTex) return _knitTex;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 128, 256);
  const body0 = 18;
  const body1 = 238;
  g.fillStyle = "#efe4d6";
  g.fillRect(0, body0, 128, body1 - body0);
  // cable-knit ribs
  for (let x = 0; x < 128; x += 8) {
    g.fillStyle = "rgba(150,120,100,0.18)";
    g.fillRect(x, body0, 2, body1 - body0);
  }
  for (let y = body0; y < body1; y += 6) {
    for (let x = 0; x < 128; x += 8) {
      g.fillStyle = "rgba(255,255,255,0.22)";
      g.fillRect(x + 3, y + ((x / 8) % 2) * 3, 4, 2);
    }
  }
  // dusty-rose & sage bands
  for (const [y, col] of [
    [body0 + 14, "#c98591"],
    [body0 + 24, "#8ba58f"],
    [body1 - 30, "#8ba58f"],
    [body1 - 20, "#c98591"],
  ]) {
    g.fillStyle = col;
    g.fillRect(0, y, 128, 6);
  }
  // fringe strands at both ends
  g.fillStyle = "#e9dccb";
  for (let x = 1; x < 128; x += 4) {
    g.fillRect(x, 0, 2, body0);
    g.fillRect(x, body1, 2, 256 - body1);
  }
  _knitTex = new THREE.CanvasTexture(c);
  _knitTex.colorSpace = THREE.SRGBColorSpace;
  return _knitTex;
}
let _knitMat = null;
export function getKnitThrowMaterial() {
  if (!_knitMat) {
    _knitMat = new THREE.MeshPhysicalMaterial({
      map: getKnitTexture(),
      alphaTest: 0.5,
      roughness: 0.92,
      sheen: 0.8,
      sheenRoughness: 0.7,
      sheenColor: new THREE.Color(0xffffff),
      side: THREE.DoubleSide,
    });
  }
  return _knitMat;
}
export function buildDrapedThrow({ width = 0.62, r = 0.12, dropFront = 0.5, dropBack = 0.3, folds = 5, mat = null } = {}) {
  const arc = Math.PI * r;
  const L = dropBack + arc + dropFront;
  const geo = new THREE.PlaneGeometry(width, L, 24, 40);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const v = pos.getY(i) + L * 0.5; // 0 .. L from back hem to front hem
    let y;
    let z;
    const rr = r + 0.006;
    if (v < dropBack) {
      y = -(dropBack - v);
      z = -rr;
    } else if (v < dropBack + arc) {
      const a = ((v - dropBack) / arc) * Math.PI; // 0 back .. PI front
      y = Math.sin(a) * rr;
      z = -Math.cos(a) * rr;
    } else {
      y = -(v - dropBack - arc);
      z = rr;
    }
    // hanging folds grow toward the hems
    const hang = v < dropBack ? (dropBack - v) / dropBack : v > dropBack + arc ? (v - dropBack - arc) / dropFront : 0;
    const fold = Math.sin((x / width) * Math.PI * folds + 0.6) * 0.022 * hang;
    z += (z >= 0 ? 1 : -1) * Math.abs(fold) + fold * 0.4;
    pos.setXYZ(i, x * (1 + hang * 0.06), y, z);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat || getKnitThrowMaterial());
  m.userData.noShadow = false;
  return m;
}

// Trio of ivory pillar candles on a brass tray, flames returned for toggling. Origin bottom centre.
export function buildPillarCandleTrio(mats, flameMat) {
  const D = getDetailMats();
  const grp = new THREE.Group();
  addMesh(grp, new THREE.CylinderGeometry(0.14, 0.13, 0.012, 22), mats.brass, 0, 0.006, 0);
  const flames = [];
  for (const [x, z, h] of [
    [-0.06, 0.02, 0.16],
    [0.05, 0.04, 0.11],
    [0.0, -0.06, 0.2],
  ]) {
    addMesh(grp, new THREE.CylinderGeometry(0.036, 0.037, h, 14), D.wax, x, 0.012 + h * 0.5, z);
    addMesh(grp, new THREE.CylinderGeometry(0.0015, 0.0015, 0.014, 4), mats.wroughtIron, x, 0.012 + h + 0.007, z);
    const f = addMesh(grp, new THREE.SphereGeometry(0.011, 8, 6), flameMat, x, 0.012 + h + 0.024, z);
    f.scale.set(0.7, 1.6, 0.7);
    f.userData.noShadow = true;
    flames.push(f);
  }
  grp.userData.flames = flames;
  return grp;
}

// Stoneware utensil crock with wooden spoons, a whisk & a rolling pin; plus apothecary jar row.
export function buildUtensilCrock(mats) {
  const grp = new THREE.Group();
  addMesh(grp, createTurnedLatheGeo([[0.001, 0], [0.06, 0], [0.065, 0.02], [0.062, 0.15], [0.068, 0.16], [0.058, 0.16]], 16), mats.celadonGlaze);
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    const tilt = 0.18;
    const len = 0.28 + (i % 2) * 0.05;
    const handle = addMesh(grp, new THREE.CylinderGeometry(0.007, 0.006, len, 6), i === 2 ? mats.brass : mats.naturalOak, Math.cos(a) * 0.025, 0.1 + len * 0.5, Math.sin(a) * 0.025, Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
    if (i !== 2) {
      const head = addMesh(grp, new THREE.SphereGeometry(0.02, 8, 6), mats.naturalOak, Math.cos(a) * (0.025 + len * tilt), 0.1 + len, Math.sin(a) * (0.025 + len * tilt));
      head.scale.set(1, 1.4, 0.4);
    } else {
      const wh = addMesh(grp, new THREE.SphereGeometry(0.026, 6, 8), mats.mirrorSilver, Math.cos(a) * (0.025 + len * tilt), 0.1 + len + 0.02, Math.sin(a) * (0.025 + len * tilt));
      wh.scale.set(0.7, 1.5, 0.7);
      wh.material = wh.material;
    }
    handle.userData.noShadow = true;
  }
  return grp;
}
export function buildApothecaryJarRow(mats) {
  const D = getDetailMats();
  const grp = new THREE.Group();
  const fills = [D.pasta, D.beans, D.sugar, D.pasta];
  const heights = [0.2, 0.16, 0.13, 0.1];
  for (let i = 0; i < 4; i += 1) {
    const h = heights[i];
    const x = i * 0.11;
    addMesh(grp, new THREE.CylinderGeometry(0.042, 0.042, h * 0.72, 14), fills[i], x, h * 0.36 + 0.004, 0);
    const jar = addMesh(grp, new THREE.CylinderGeometry(0.047, 0.047, h, 16), D.jarGlass, x, h * 0.5, 0);
    jar.userData.noShadow = true;
    addMesh(grp, new THREE.CylinderGeometry(0.05, 0.05, 0.016, 16), mats.naturalOak, x, h + 0.008, 0);
    addMesh(grp, new THREE.SphereGeometry(0.012, 8, 6), mats.brass, x, h + 0.022, 0);
    addMesh(grp, new THREE.PlaneGeometry(0.05, 0.03), mats.ivoryLinen, x, h * 0.5, 0.048);
  }
  return grp;
}

// Wicker log basket and a brass fireside tool stand.
export function buildLogBasket(mats) {
  const D = getDetailMats();
  const grp = new THREE.Group();
  const basketGeo = new THREE.CylinderGeometry(0.26, 0.22, 0.3, 22, 4, true);
  const bp = basketGeo.attributes.position;
  for (let i = 0; i < bp.count; i += 1) {
    const a = Math.atan2(bp.getZ(i), bp.getX(i));
    const k = 1 + 0.03 * Math.sin(a * 22);
    bp.setX(i, bp.getX(i) * k);
    bp.setZ(i, bp.getZ(i) * k);
  }
  basketGeo.computeVertexNormals();
  basketGeo.scale(1.35, 1, 0.8);
  const bm = D.wicker.clone();
  bm.side = THREE.DoubleSide;
  addMesh(grp, basketGeo, bm, 0, 0.15, 0);
  addMesh(grp, new THREE.CylinderGeometry(0.22, 0.22, 0.02, 20), D.wicker, 0, 0.01, 0).scale.set(1.35, 1, 0.8);
  const rim = addMesh(grp, new THREE.TorusGeometry(0.26, 0.018, 6, 28), D.wicker, 0, 0.3, 0, Math.PI * 0.5, 0, 0);
  rim.scale.set(1.35, 0.8, 1);
  for (let i = 0; i < 7; i += 1) {
    const lx = -0.2 + (i % 4) * 0.13 + (i > 3 ? 0.06 : 0);
    const ly = 0.2 + (i > 3 ? 0.1 : 0);
    addMesh(grp, new THREE.CylinderGeometry(0.045, 0.05, 0.5, 9), mats.walnut, lx, ly, (i % 2) * 0.04 - 0.02, Math.PI * 0.5, 0.15 * (i % 3), 0);
  }
  return grp;
}
export function buildFireToolStand(mats) {
  const grp = new THREE.Group();
  addMesh(grp, new THREE.CylinderGeometry(0.1, 0.11, 0.02, 16), mats.brass, 0, 0.01, 0);
  addMesh(grp, new THREE.CylinderGeometry(0.008, 0.008, 0.72, 8), mats.brass, 0, 0.37, 0);
  addMesh(grp, new THREE.TorusGeometry(0.06, 0.006, 6, 16), mats.brass, 0, 0.66, 0, Math.PI * 0.5, 0, 0);
  addMesh(grp, new THREE.SphereGeometry(0.02, 8, 6), mats.brass, 0, 0.75, 0);
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    addMesh(grp, new THREE.CylinderGeometry(0.0055, 0.0055, 0.62, 6), mats.wroughtIron, Math.cos(a) * 0.055, 0.36, Math.sin(a) * 0.055);
    addMesh(grp, new THREE.SphereGeometry(0.013, 8, 6), mats.brass, Math.cos(a) * 0.055, 0.68, Math.sin(a) * 0.055);
  }
  addMesh(grp, new THREE.BoxGeometry(0.05, 0.08, 0.016), mats.wroughtIron, 0.055, 0.07, 0);
  return grp;
}

// Romantic place setting for one: charger, plate, folded napkin, cutlery, crystal wine glass.
export function buildPlaceSetting(mats) {
  const D = getDetailMats();
  const grp = new THREE.Group();
  addMesh(grp, new THREE.CylinderGeometry(0.15, 0.15, 0.006, 28), mats.brass, 0, 0.003, 0);
  addMesh(grp, createTurnedLatheGeo([[0.001, 0.006], [0.08, 0.006], [0.12, 0.016], [0.128, 0.02]], 24), mats.zelligeTile);
  addMesh(grp, new THREE.TorusGeometry(0.115, 0.0025, 4, 28), mats.retroRosePorcelain, 0, 0.0175, 0, Math.PI * 0.5, 0, 0);
  const nap = addMesh(grp, createPillowedCushionGeo(0.08, 0.02, 0.12, 0.02, 0.006), D.napkin, 0, 0.03, 0);
  nap.rotation.y = 0.5;
  addMesh(grp, new THREE.TorusGeometry(0.018, 0.004, 5, 12), mats.brass, 0, 0.032, 0, 0, 0.5, 0);
  addMesh(grp, new THREE.BoxGeometry(0.012, 0.004, 0.19), mats.mirrorSilver, -0.18, 0.002, 0);
  addMesh(grp, new THREE.BoxGeometry(0.014, 0.004, 0.2), mats.mirrorSilver, 0.18, 0.002, 0);
  const glass = new THREE.Group();
  glass.position.set(0.17, 0, -0.16);
  addMesh(glass, new THREE.CylinderGeometry(0.032, 0.034, 0.004, 14), D.crystal, 0, 0.002, 0);
  addMesh(glass, new THREE.CylinderGeometry(0.0035, 0.0035, 0.09, 6), D.crystal, 0, 0.05, 0);
  addMesh(glass, createTurnedLatheGeo([[0.001, 0.09], [0.03, 0.11], [0.036, 0.15], [0.03, 0.19]], 14), D.crystal);
  addMesh(glass, new THREE.CylinderGeometry(0.031, 0.022, 0.035, 14), D.wine, 0, 0.122, 0);
  glass.traverse((o) => {
    if (o.isMesh) o.userData.noShadow = true;
  });
  grp.add(glass);
  return grp;
}
