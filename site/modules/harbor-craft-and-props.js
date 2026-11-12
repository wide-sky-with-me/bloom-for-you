// Boats, Pier Buildings & Street Props for "太阳雨中的童话星语花湾"
// Cel-shaded ("三渲二") moored fleet, Co-op Shed, Glass Waiting Pavilion & "Just-Left" traces.

import {
  THREE,
  PALETTE,
  mulberry32,
  toonMat,
  wetSurfaceMat,
  glassMat,
  emissiveMat,
  addEdgeInk,
  makeCanvasTex,
  makeCatenaryTube,
  updateCatenaryTube,
  tagInteractive,
  enableShadows,
} from "./toon-kit.js";

// ---------------------------------------------------------------------------
// 1. Procedural 2D Canvas Textures (Screens, Charts, Boards, Vending & Signs)
// ---------------------------------------------------------------------------

function createCraftTextures() {
  const radar = makeCanvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#082622";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#2cf5b8";
    ctx.lineWidth = 2;
    [22, 42, 58].forEach((r) => {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(6, h / 2);
    ctx.lineTo(w - 6, h / 2);
    ctx.moveTo(w / 2, 6);
    ctx.lineTo(w / 2, h - 6);
    ctx.stroke();
    const grad = ctx.createLinearGradient(w / 2, h / 2, w - 10, 18);
    grad.addColorStop(0, "rgba(68,255,196,0.55)");
    grad.addColorStop(1, "rgba(68,255,196,0.0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.arc(w / 2, h / 2, 58, -0.85, -0.15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#9effdf";
    [[44, 38], [82, 46], [76, 30], [52, 84]].forEach(([x, y]) => {
      ctx.fillRect(x, y, 5, 5);
    });
  });

  const fishFinder = makeCanvasTex(128, 96, (ctx, w, h) => {
    ctx.fillStyle = "#0b2440";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#17567a";
    ctx.fillRect(0, 14, w, h - 32);
    ctx.fillStyle = "#c96e38";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, 72);
    ctx.bezierCurveTo(38, 60, 76, 80, w, 64);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffe26a";
    [[28, 38], [38, 43], [52, 35], [84, 46], [96, 40]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.ellipse(x, y, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "#9cf6ff";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("14.8m", 8, 18);
  });

  const seaChart = makeCanvasTex(256, 192, (ctx, w, h) => {
    ctx.fillStyle = "#f7eed7";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#b8e6e2";
    ctx.beginPath();
    ctx.moveTo(92, 0);
    ctx.bezierCurveTo(72, 66, 118, 118, 256, 142);
    ctx.lineTo(256, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#4d7882";
    ctx.lineWidth = 2;
    for (let x = 32; x < w; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.strokeStyle = "#d95b43";
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(108, 92);
    ctx.quadraticCurveTo(168, 78, 236, 34);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#355362";
    ctx.beginPath();
    ctx.arc(46, 142, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#2b4353";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText("星语湾潮汐表", 122, 168);
  });

  const auctionBoard = makeCanvasTex(256, 160, (ctx, w, h) => {
    ctx.fillStyle = "#1f352e";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#b88456";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = "#f8f6eb";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("星语渔协 · 朝市牌价", 24, 38);
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 48, w - 40, 2);
    ctx.font = "17px sans-serif";
    ctx.fillStyle = "#ffdf85";
    ctx.fillText("真鲷   ¥48/斤   星鳗   ¥62", 24, 80);
    ctx.fillStyle = "#a8f0ea";
    ctx.fillText("竹荚鱼 ¥26/斤   甜虾   ¥55", 24, 110);
    ctx.fillStyle = "#f7b2bd";
    ctx.fillText("今日晴雨交替 · 出海顺风", 24, 138);
  });

  const timetable = makeCanvasTex(224, 160, (ctx, w, h) => {
    ctx.fillStyle = "#f4efe2";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#5aaeb8";
    ctx.fillRect(0, 0, w, 36);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 17px sans-serif";
    ctx.fillText("星语花湾 渡轮时刻表", 20, 24);
    ctx.fillStyle = "#36505c";
    ctx.font = "15px sans-serif";
    ["07:15  早班 · 晴风岛", "10:30  上午 · 灯塔湾", "14:10  午后 · 邮便船", "17:45  夕凪 · 归港便"].forEach(
      (row, idx) => ctx.fillText(row, 20, 62 + idx * 24)
    );
  });

  const vending = makeCanvasTex(192, 256, (ctx, w, h) => {
    ctx.fillStyle = "#fefcf5";
    ctx.fillRect(0, 0, w, h);
    const colors = ["#75d8c6", "#f7a8b8", "#f8d96d", "#89c9f4", "#c8b5ec", "#f39b6d"];
    for (let r = 0; r < 3; r += 1) {
      const y = 18 + r * 68;
      ctx.fillStyle = "#dce9ec";
      ctx.fillRect(12, y + 44, w - 24, 8);
      for (let c = 0; c < 5; c += 1) {
        ctx.fillStyle = colors[(r * 5 + c) % colors.length];
        ctx.fillRect(20 + c * 32, y + 8, 20, 34);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(22 + c * 32, y + 18, 16, 8);
      }
    }
    ctx.fillStyle = "#3688b2";
    ctx.fillRect(12, 222, w - 24, 22);
    ctx.fillStyle = "#fff8cf";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText("冷 / 温  DRINK  ¥120", 24, 238);
  });

  const warningSign = makeCanvasTex(256, 112, (ctx, w, h) => {
    ctx.fillStyle = "#f7f3e6";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f5c338";
    ctx.fillRect(0, 0, w, 18);
    ctx.fillRect(0, h - 18, w, 18);
    ctx.fillStyle = "#2a3136";
    for (let x = -16; x < w + 16; x += 28) {
      ctx.fillRect(x, 0, 12, 18);
      ctx.fillRect(x + 10, h - 18, 12, 18);
    }
    ctx.fillStyle = "#243b4a";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("星语花湾 · 注意落水", 16, 64);
  });

  const harborSign = makeCanvasTex(256, 96, (ctx, w, h) => {
    ctx.fillStyle = "#e9f4f2";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#4c9aa3";
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = "#264654";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("星语花湾 · 第三栈桥", 20, 56);
  });

  return { radar, fishFinder, seaChart, auctionBoard, timetable, vending, warningSign, harborSign };
}

// ---------------------------------------------------------------------------
// 2. Curved Lofted Boat Hull Geometry + 4 Moored Boats & Slipway Dinghy
// ---------------------------------------------------------------------------

function createCurvedHullGeometry(length = 2.9, beam = 1.18, depth = 0.62) {
  const stations = 16;
  const ringPts = 9;
  const positions = [];
  const indices = [];

  for (let i = 0; i <= stations; i += 1) {
    const u = i / stations; // 0 = stern (-X), 1 = sharp raked bow (+X)
    const xBase = (u - 0.48) * length;
    const widthProfile =
      u < 0.55
        ? 0.76 + 0.24 * Math.sin((u / 0.55) * (Math.PI * 0.5))
        : Math.pow(Math.max(0.03, Math.cos(((u - 0.55) / 0.45) * (Math.PI * 0.49))), 0.82);
    const halfB = (beam * 0.5) * widthProfile;
    const sheerY = depth * (0.56 + 0.28 * Math.pow(u, 2.2) + 0.08 * Math.pow(1 - u, 1.8));
    const keelY = -depth * (0.44 - 0.22 * Math.pow(u, 2.6));
    const bowRake = u > 0.72 ? (u - 0.72) * 0.36 * length : 0;

    for (let j = 0; j < ringPts; j += 1) {
      const s = (j / (ringPts - 1)) * 2 - 1; // -1 port .. +1 starboard
      const absS = Math.abs(s);
      const z = Math.sign(s) * Math.pow(absS, 0.78) * halfB;
      const y = THREE.MathUtils.lerp(keelY, sheerY, Math.pow(absS, 1.35));
      const x = xBase + bowRake * (0.25 + 0.75 * absS);
      positions.push(x, y, z);
    }
  }

  for (let i = 0; i < stations; i += 1) {
    for (let j = 0; j < ringPts - 1; j += 1) {
      const a = i * ringPts + j;
      const b = a + 1;
      const c = (i + 1) * ringPts + j;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  // Stern transom cap (i = 0)
  for (let j = 1; j < ringPts - 1; j += 1) {
    indices.push(0, j, j + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildMooredFleet(anchors, tex, rng) {
  const fleetGroup = new THREE.Group();
  fleetGroup.name = "MooredFleet";

  const clearCabinGlass = glassMat({ color: 0xe6fbff, opacity: 0.19, roughness: 0.05 });
  const radarMat = emissiveMat(0xffffff, 0.95);
  radarMat.map = tex.radar;
  const sonarMat = emissiveMat(0xffffff, 0.9);
  sonarMat.map = tex.fishFinder;
  const chartMat = toonMat(0xffffff, { map: tex.seaChart });

  const boatSpecs = [
    { x: 2.1, z: -0.35, yaw: 0, len: 3.12, beam: 1.22, hullCol: 0xfbf8f0, trimCol: 0x45ada8, roofCol: 0xe78b7e, fenderSide: -1, hasRadome: true, canopyCol: 0x7ec8e3 },
    { x: 6.0, z: -0.40, yaw: Math.PI, len: 2.92, beam: 1.16, hullCol: 0xdff5ef, trimCol: 0xf5c338, roofCol: 0xfbf5ea, fenderSide: 1, hasRadome: true, canopyCol: 0xf4a8b6 },
    { x: -0.1, z: 2.25, yaw: -Math.PI / 2, len: 2.74, beam: 1.12, hullCol: 0xd7eef7, trimCol: 0xe86a42, roofCol: 0xfbf5ea, fenderSide: -1, hasRadome: false, canopyCol: 0xf8de8c },
    { x: 3.9, z: 2.55, yaw: -0.38, len: 2.56, beam: 1.08, hullCol: 0xfbf2e3, trimCol: 0x62b6cb, roofCol: 0x9cd6cb, fenderSide: 1, hasRadome: false, canopyCol: 0xc5b8e8 },
  ];

  // Two timber mooring pilings in harbor basin for Boat 3
  const pilingCoords = [
    { x: 2.52, z: 2.98 },
    { x: 5.22, z: 2.02 },
  ];
  const pilingMat = toonMat(0x7c5a43);
  pilingCoords.forEach((pc) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.55, 8), pilingMat);
    post.position.set(pc.x, 0.12, pc.z);
    addEdgeInk(post, 28, PALETTE.inkOutline, 0.42);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 8), toonMat(PALETTE.brassGold));
    cap.position.set(pc.x, 1.42, pc.z);
    fleetGroup.add(post, cap);
  });

  const boats = [];
  const mooringRopes = [];
  const animatedClutter = [];
  const dripPoints = [];
  const boatReflections = [];

  boatSpecs.forEach((spec, idx) => {
    const boatRoot = new THREE.Group();
    boatRoot.position.set(spec.x, 0.02, spec.z);
    boatRoot.rotation.y = spec.yaw;
    boatRoot.userData.boatIndex = idx;

    // Curved outer hull + lower antifouling band + wooden deck + raised coaming
    const hullMesh = new THREE.Mesh(
      createCurvedHullGeometry(spec.len, spec.beam, 0.62),
      toonMat(spec.hullCol, { side: THREE.DoubleSide })
    );
    addEdgeInk(hullMesh, 32, PALETTE.inkOutline, 0.48);
    boatRoot.add(hullMesh);

    const bootStripe = new THREE.Mesh(
      createCurvedHullGeometry(spec.len * 0.985, spec.beam * 0.96, 0.34),
      toonMat(PALETTE.rustRed, { side: THREE.DoubleSide })
    );
    bootStripe.position.y = -0.11;
    boatRoot.add(bootStripe);

    const deckMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(spec.beam * 0.43, spec.beam * 0.43, spec.len * 0.84, 12),
      toonMat(0xc99b6e)
    );
    deckMesh.rotation.z = Math.PI / 2;
    deckMesh.scale.set(1, 1, 0.14);
    deckMesh.position.set(-0.04 * spec.len, 0.22, 0);
    boatRoot.add(deckMesh);

    // Gunwale rub-rail + bow & stern brass mooring cleats
    const rail = new THREE.Mesh(
      new THREE.TorusGeometry(spec.len * 0.44, 0.032, 6, 24),
      toonMat(spec.trimCol)
    );
    rail.rotation.x = Math.PI / 2;
    rail.scale.set(1.04, (spec.beam * 0.48) / (spec.len * 0.44), 1);
    rail.position.set(0.01, 0.38, 0);
    boatRoot.add(rail);

    // Crystal-Clear Wheelhouse Cabin
    const cabX = 0.08 * spec.len;
    const cabW = 0.96;
    const cabD = spec.beam * 0.68;
    const cabH = 0.86;
    const cabin = new THREE.Group();
    cabin.position.set(cabX, 0.26, 0);
    boatRoot.add(cabin);

    const lowerWall = new THREE.Mesh(new THREE.BoxGeometry(cabW, 0.34, cabD), toonMat(spec.hullCol));
    lowerWall.position.y = 0.17;
    addEdgeInk(lowerWall);
    cabin.add(lowerWall);

    // 4 slim corner mullions + ultra-clear glass enclosure
    const postGeo = new THREE.BoxGeometry(0.042, cabH, 0.042);
    const frameMat = toonMat(spec.trimCol);
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => {
      const p = new THREE.Mesh(postGeo, frameMat);
      p.position.set(sx * (cabW * 0.47), cabH * 0.5, sz * (cabD * 0.47));
      cabin.add(p);
    });
    const glassBox = new THREE.Mesh(new THREE.BoxGeometry(cabW * 0.94, 0.50, cabD * 0.94), clearCabinGlass);
    glassBox.position.y = 0.59;
    cabin.add(glassBox);

    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(cabW + 0.16, 0.07, cabD + 0.14), toonMat(spec.roofCol));
    cabRoof.position.y = cabH + 0.03;
    addEdgeInk(cabRoof);
    cabin.add(cabRoof);

    // --- Wheelhouse Interior Storytelling Props ---
    const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.38, cabD * 0.82), toonMat(0x5a6e78));
    consoleBox.position.set(cabW * 0.26, 0.24, 0);
    cabin.add(consoleBox);

    // 1) Spoked ship's wheel
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(cabW * 0.09, 0.48, -0.12);
    wheelGroup.rotation.z = -0.35;
    const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.014, 6, 14), toonMat(0x8b542f));
    wheelRim.rotation.y = Math.PI / 2;
    wheelGroup.add(wheelRim);
    for (let s = 0; s < 6; s += 1) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.26, 5), toonMat(PALETTE.brassGold));
      spoke.rotation.x = (s / 6) * Math.PI;
      wheelGroup.add(spoke);
    }
    cabin.add(wheelGroup);

    // 2) Glowing radar & fish-finder screens
    const radarScreen = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.16), radarMat);
    radarScreen.position.set(cabW * 0.22, 0.52, -0.14);
    radarScreen.rotation.z = 0.22;
    const sonarScreen = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.15), sonarMat);
    sonarScreen.position.set(cabW * 0.22, 0.51, 0.06);
    sonarScreen.rotation.z = 0.22;
    cabin.add(radarScreen, sonarScreen);

    // 3) Spread sea chart & tide table + 4) Thermos & ceramic mug
    const chartSheet = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.28), chartMat);
    chartSheet.rotation.x = -Math.PI / 2;
    chartSheet.position.set(cabW * 0.24, 0.436, 0.20);
    const thermos = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.14, 8), toonMat(0xd9534f));
    thermos.position.set(cabW * 0.28, 0.50, -0.27);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.055, 8), toonMat(0xfdfbf7));
    mug.position.set(cabW * 0.16, 0.46, -0.25);
    cabin.add(chartSheet, thermos, mug);

    // 5) Hanging yellow raincoat on aft cabin pillar + 6) Window omamori & framed photo
    const coatPivot = new THREE.Group();
    coatPivot.position.set(-cabW * 0.36, 0.72, cabD * 0.34);
    const coatBody = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.38, 7), toonMat(PALETTE.hazardYellow));
    coatBody.position.y = -0.19;
    const coatHood = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), toonMat(PALETTE.hazardYellow));
    coatHood.position.y = 0.02;
    coatPivot.add(coatBody, coatHood);
    cabin.add(coatPivot);

    const omamoriPivot = new THREE.Group();
    omamoriPivot.position.set(cabW * 0.41, 0.80, 0.14);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 4), toonMat(0xd94848));
    cord.position.y = -0.045;
    const charm = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.068, 0.044), toonMat(0xe85d75));
    charm.position.y = -0.10;
    omamoriPivot.add(cord, charm);
    const framedPhoto = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.085, 0.07), toonMat(0xf8de8c));
    framedPhoto.position.set(cabW * 0.35, 0.47, 0.31);
    framedPhoto.rotation.y = -0.35;
    cabin.add(omamoriPivot, framedPhoto);
    animatedClutter.push({ coatPivot, omamoriPivot, phase: idx * 1.3 });

    // Mast, Whip Antennas, Radome & Aft Sun-Canopy Frame
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 1.05, 6), toonMat(0xf4f7f8));
    mast.position.set(0.02, cabH + 0.56, 0);
    const crossArm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.56, 6), toonMat(0xf4f7f8));
    crossArm.rotation.x = Math.PI / 2;
    crossArm.position.set(0.02, cabH + 0.82, 0);
    const mastLamp = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), emissiveMat(0xffe9a6, 1.3));
    mastLamp.position.set(0.02, cabH + 1.10, 0);
    const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.01, 0.72, 5), toonMat(PALETTE.castIron));
    whip.position.set(-0.08, cabH + 0.42, -0.22);
    whip.rotation.z = 0.14;
    cabin.add(mast, crossArm, mastLamp, whip);

    if (spec.hasRadome) {
      const radome = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.19, 0.11, 12), toonMat(0xffffff));
      radome.position.set(0.18, cabH + 0.12, 0);
      addEdgeInk(radome);
      cabin.add(radome);
    }

    // Aft tubular canopy frame + rolled pastel awning strip
    const aftFrame = new THREE.Group();
    aftFrame.position.set(-0.28 * spec.len, 0.36, 0);
    [[-0.36, -0.38], [-0.36, 0.38], [0.28, -0.38], [0.28, 0.38]].forEach(([fx, fz]) => {
      const stanchion = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.68, 6), toonMat(0xdce4e6));
      stanchion.position.set(fx, 0.34, fz);
      aftFrame.add(stanchion);
    });
    const canopyTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.74, 0.03, 0.84),
      toonMat(spec.canopyCol, { transparent: true, opacity: 0.86 })
    );
    canopyTop.position.y = 0.69;
    aftFrame.add(canopyTop);
    boatRoot.add(aftFrame);

    // Lifebuoys (orange/white) & Black Tire Fenders along quay side
    [-1, 1].forEach((side) => {
      const buoy = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.036, 8, 14), toonMat(PALETTE.ropeOrange));
      buoy.position.set(cabX - 0.12, 0.56, side * (cabD * 0.49 + 0.03));
      cabin.add(buoy);
    });
    [-0.55, 0.05, 0.62].forEach((fx) => {
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.048, 8, 12), toonMat(PALETTE.hazardBlack));
      tire.position.set(fx, 0.22, spec.fenderSide * (spec.beam * 0.48 + 0.03));
      boatRoot.add(tire);
    });

    tagInteractive(boatRoot, "boat", `停泊渔船 #${idx + 1}`, { accentColor: spec.trimCol });
    boatRoot.userData.boatIndex = idx;
    fleetGroup.add(boatRoot);

    // Mooring ropes (bow & stern) tied to quay bollards or basin pilings
    const bowLocal = new THREE.Vector3(spec.len * 0.46, 0.39, spec.fenderSide * spec.beam * 0.22);
    const sternLocal = new THREE.Vector3(-spec.len * 0.44, 0.37, spec.fenderSide * spec.beam * 0.26);
    let bowDock;
    let sternDock;
    if (idx === 0) {
      bowDock = new THREE.Vector3(3.65, 1.24, -1.52);
      sternDock = new THREE.Vector3(0.62, 1.24, -1.52);
    } else if (idx === 1) {
      bowDock = new THREE.Vector3(4.48, 1.24, -1.52);
      sternDock = new THREE.Vector3(7.48, 1.24, -1.52);
    } else if (idx === 2) {
      bowDock = new THREE.Vector3(-1.04, 1.24, 3.68);
      sternDock = new THREE.Vector3(-1.04, 1.24, 0.88);
    } else {
      bowDock = new THREE.Vector3(pilingCoords[0].x, 1.28, pilingCoords[0].z);
      sternDock = new THREE.Vector3(pilingCoords[1].x, 1.28, pilingCoords[1].z);
    }

    boatRoot.updateMatrixWorld(true);
    const ropeMat = toonMat(0xd99b66);
    [
      { local: bowLocal, dock: bowDock, sag: 0.26 },
      { local: sternLocal, dock: sternDock, sag: 0.28 },
    ].forEach((rSpec) => {
      const worldCleat = rSpec.local.clone().applyMatrix4(boatRoot.matrixWorld);
      const ropeMesh = makeCatenaryTube(worldCleat, rSpec.dock, rSpec.sag, 0.018, ropeMat, 14);
      fleetGroup.add(ropeMesh);
      mooringRopes.push({ mesh: ropeMesh, boatRoot, local: rSpec.local, dock: rSpec.dock, sag: rSpec.sag });
    });

    dripPoints.push({ x: spec.x, y: 1.48, z: spec.z + 0.36, groundY: 0.03 });
    boatReflections.push({ x: spec.x, z: spec.z, heading: spec.yaw, length: spec.len, width: spec.beam, color: spec.hullCol });
    boats.push({ root: boatRoot, baseY: 0.02, baseYaw: spec.yaw, phase: idx * 1.65 + rng() * 0.5, impulse: 0 });
  });

  // Upturned Wooden Dinghy on Slipway (-2.25, 0.56, 10.15) + Oars
  const dinghyGroup = new THREE.Group();
  dinghyGroup.position.set(-2.25, 0.56, 10.15);
  dinghyGroup.rotation.set(0.06, 0.28, -0.18);
  const dinghyHull = new THREE.Mesh(
    createCurvedHullGeometry(1.92, 0.86, 0.42),
    toonMat(0xa86f48, { side: THREE.DoubleSide })
  );
  dinghyHull.rotation.x = Math.PI;
  addEdgeInk(dinghyHull, 30, PALETTE.inkOutline, 0.46);
  const keelStrip = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.05, 0.06), toonMat(0x6d442a));
  keelStrip.position.y = 0.20;
  const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.55, 6), toonMat(0xd4a977));
  oar.rotation.z = Math.PI / 2;
  oar.position.set(0, -0.12, 0.48);
  dinghyGroup.add(dinghyHull, keelStrip, oar);
  fleetGroup.add(dinghyGroup);

  return { fleetGroup, boats, mooringRopes, animatedClutter, dripPoints, boatReflections };
}

// ---------------------------------------------------------------------------
// 3. Shared Crate Helper + Harbor Co-op Shed & Glass Waiting Pavilion
// ---------------------------------------------------------------------------

function createFishCrate(colorHex, withCatch = false) {
  const crate = new THREE.Group();
  const mat = toonMat(colorHex);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.03, 0.34), mat);
  base.position.y = 0.015;
  const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.20, 0.03), mat);
  sideL.position.set(0, 0.11, -0.155);
  const sideR = sideL.clone();
  sideR.position.z = 0.155;
  const endA = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.20, 0.28), mat);
  endA.position.set(-0.225, 0.11, 0);
  const endB = endA.clone();
  endB.position.x = 0.225;
  addEdgeInk(sideL, 30, PALETTE.inkOutline, 0.36);
  addEdgeInk(sideR, 30, PALETTE.inkOutline, 0.36);
  crate.add(base, sideL, sideR, endA, endB);

  if (withCatch) {
    const iceBed = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.07, 0.28),
      glassMat({ color: 0xebffff, opacity: 0.72, roughness: 0.12 })
    );
    iceBed.position.y = 0.11;
    crate.add(iceBed);
    [-0.06, 0.07].forEach((fz, idx) => {
      const fish = new THREE.Mesh(
        new THREE.ConeGeometry(0.042, 0.22, 6),
        toonMat(idx === 0 ? 0x8ec5d6 : 0xe98b7e)
      );
      fish.rotation.z = Math.PI / 2;
      fish.rotation.y = idx === 0 ? 0.18 : -0.22;
      fish.position.set(idx === 0 ? -0.03 : 0.04, 0.155, fz);
      crate.add(fish);
    });
  }
  return crate;
}

function buildHarborBuildings(tex, rng) {
  const bldGroup = new THREE.Group();
  bldGroup.name = "HarborPierBuildings";
  const dripPoints = [];

  // =========================================================================
  // A. Harbor Co-op Shed: X in [-0.8, +4.4], Z in [-8.2, -3.4], Y = 1.15
  // =========================================================================
  const shed = new THREE.Group();
  shed.name = "HarborCoopShed";
  shed.position.set(1.80, 1.15, -5.80); // W = 5.2, D = 4.8
  bldGroup.add(shed);

  const shedWallMat = toonMat(0xe7efee);
  const shedTrimMat = toonMat(0x527d88);
  const shedRoofMat = toonMat(0x69959e);
  const clearWindowMat = glassMat({ color: 0xe6fafe, opacity: 0.22, roughness: 0.06 });

  const shedFloor = new THREE.Mesh(new THREE.BoxGeometry(5.16, 0.05, 4.76), wetSurfaceMat(0xc8d3d5, { roughness: 0.34 }));
  shedFloor.position.y = 0.025;
  shed.add(shedFloor);

  // Lower walls + Clerestory window bands (back Z=-2.34, west X=-2.54, east X=+2.54)
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(5.14, 1.66, 0.10), shedWallMat);
  backWall.position.set(0, 0.85, -2.33);
  addEdgeInk(backWall);
  const backClerestory = new THREE.Mesh(new THREE.BoxGeometry(4.92, 0.42, 0.04), clearWindowMat);
  backClerestory.position.set(0, 1.92, -2.33);
  shed.add(backWall, backClerestory);

  [-1, 1].forEach((side) => {
    const sWall = new THREE.Mesh(new THREE.BoxGeometry(0.10, 1.66, 4.74), shedWallMat);
    sWall.position.set(side * 2.53, 0.85, 0);
    addEdgeInk(sWall);
    const sGlass = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 4.46), clearWindowMat);
    sGlass.position.set(side * 2.53, 1.92, 0);
    const topHeader = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 4.76), shedTrimMat);
    topHeader.position.set(side * 2.53, 2.21, 0);
    shed.add(sWall, sGlass, topHeader);
    for (let m = -1.6; m <= 1.65; m += 0.8) {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.05), shedTrimMat);
      mullion.position.set(side * 2.53, 1.92, m);
      shed.add(mullion);
    }
  });

  // Front jamb piers + Half-rolled corrugated shutter door (wide open below Y=1.42)
  [-2.24, 2.24].forEach((px) => {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(0.56, 2.26, 0.14), shedWallMat);
    pier.position.set(px, 1.15, 2.31);
    addEdgeInk(pier);
    shed.add(pier);
  });

  const shutterHood = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.96, 12), toonMat(0x95a8ae));
  shutterHood.rotation.z = Math.PI / 2;
  shutterHood.position.set(0, 2.12, 2.31);
  shed.add(shutterHood);

  for (let s = 0; s < 7; s += 1) {
    const slat = new THREE.Mesh(
      new THREE.BoxGeometry(3.92, 0.085, 0.045),
      toonMat(s % 2 === 0 ? 0xcfdadd : 0xb8c8cd)
    );
    slat.position.set(0, 1.46 + s * 0.092, 2.31);
    shed.add(slat);
  }
  const shutterBottomBar = new THREE.Mesh(new THREE.BoxGeometry(3.94, 0.05, 0.07), toonMat(PALETTE.hazardYellow));
  shutterBottomBar.position.set(0, 1.41, 2.31);
  const pullChain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.05, 5), toonMat(PALETTE.castIron));
  pullChain.position.set(1.88, 1.18, 2.34);
  shed.add(shutterBottomBar, pullChain);

  // Gently pitched corrugated roof + eaves overhang + warm interior work lamp
  const shedRoof = new THREE.Mesh(new THREE.BoxGeometry(5.46, 0.10, 5.18), shedRoofMat);
  shedRoof.position.set(0, 2.36, 0.04);
  shedRoof.rotation.x = 0.045;
  addEdgeInk(shedRoof);
  shed.add(shedRoof);

  const shedLampShade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.14, 10), toonMat(0x466d75));
  shedLampShade.position.set(-0.15, 2.02, -0.2);
  const shedBulb = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), emissiveMat(0xffe6a3, 1.5));
  shedBulb.position.set(-0.15, 1.93, -0.2);
  shed.add(shedLampShade, shedBulb);

  // --- Co-op Shed Interior Props ---
  // 1) Stacked white & blue fish crates
  const crateSpecs = [
    { x: -1.85, y: 0.05, z: -1.45, col: 0xf7fbfc, catch: false },
    { x: -1.85, y: 0.26, z: -1.45, col: 0x4ca3cc, catch: false },
    { x: -1.85, y: 0.47, z: -1.45, col: 0xf7fbfc, catch: true },
    { x: -1.30, y: 0.05, z: -1.42, col: 0x4ca3cc, catch: false },
    { x: -1.30, y: 0.26, z: -1.42, col: 0xf7fbfc, catch: true },
    { x: -1.82, y: 0.05, z: -0.45, col: 0x4ca3cc, catch: true },
  ];
  crateSpecs.forEach((cs) => {
    const c = createFishCrate(cs.col, cs.catch);
    c.position.set(cs.x, cs.y, cs.z);
    c.rotation.y = (rng() - 0.5) * 0.16;
    shed.add(c);
  });

  // 2) Commercial white chest freezer
  const freezer = new THREE.Group();
  freezer.position.set(1.48, 0.05, -1.68);
  const fBody = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.72, 0.68), toonMat(0xf4f8f9));
  fBody.position.y = 0.36;
  addEdgeInk(fBody);
  [-0.32, 0.32].forEach((lx) => {
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.63, 0.05, 0.66), toonMat(0xffffff));
    lid.position.set(lx, 0.745, 0);
    addEdgeInk(lid);
    freezer.add(lid);
  });
  const fLed = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.02), emissiveMat(0x5effb1, 1.3));
  fLed.position.set(0.52, 0.58, 0.345);
  freezer.add(fBody, fLed);
  shed.add(freezer);

  // 3) Stainless table + retro spring dial scale
  const sortTable = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.68, 0.58), toonMat(0xb6c7cc));
  sortTable.position.set(0.18, 0.39, -0.55);
  addEdgeInk(sortTable);
  const scaleBody = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.18, 10), toonMat(0x56998a));
  scaleBody.position.set(0.18, 0.82, -0.55);
  const scaleDial = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.03, 12), toonMat(0xfdfbf2));
  scaleDial.rotation.x = Math.PI / 2;
  scaleDial.position.set(0.18, 0.85, -0.44);
  const scalePan = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.04, 12), toonMat(0xdce5e7));
  scalePan.position.set(0.18, 0.94, -0.55);
  shed.add(sortTable, scaleBody, scaleDial, scalePan);

  // 4) Wall-hung bright yellow rain boots on east wall
  [0.15, 0.36].forEach((bz) => {
    const bootShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.048, 0.28, 8), toonMat(PALETTE.hazardYellow));
    bootShaft.position.set(2.41, 1.24, bz);
    bootShaft.rotation.z = 0.10;
    const bootFoot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.18), toonMat(PALETTE.hazardYellow));
    bootFoot.position.set(2.39, 1.38, bz + 0.04);
    shed.add(bootShaft, bootFoot);
  });

  // 5) Auction price blackboard on back wall
  const boardMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.62, 0.96, 0.05),
    toonMat(0xffffff, { map: tex.auctionBoard })
  );
  boardMesh.position.set(-0.22, 1.24, -2.25);
  shed.add(boardMesh);

  // 6) Interior floor puddle & scattered glinting ice cubes
  const floorPuddle = new THREE.Mesh(
    new THREE.CircleGeometry(0.68, 18),
    wetSurfaceMat(0x7ac5ce, { roughness: 0.06, metalness: 0.22, transparent: true, opacity: 0.68 })
  );
  floorPuddle.rotation.x = -Math.PI / 2;
  floorPuddle.scale.set(1.3, 0.82, 1);
  floorPuddle.position.set(-0.72, 0.054, 0.28);
  shed.add(floorPuddle);

  const iceGeo = new THREE.BoxGeometry(0.048, 0.042, 0.048);
  const iceMat = glassMat({ color: 0xeaffff, opacity: 0.72, roughness: 0.06 });
  for (let ic = 0; ic < 11; ic += 1) {
    const cube = new THREE.Mesh(iceGeo, iceMat);
    cube.position.set(-1.35 + rng() * 0.95, 0.072, -0.35 + rng() * 0.85);
    cube.rotation.set(rng() * 0.5, rng() * 3.1, rng() * 0.5);
    shed.add(cube);
  }
  dripPoints.push({ x: 1.85, y: 3.42, z: -3.32, groundY: 1.162 });

  // =========================================================================
  // B. Glass Waiting Pavilion: X in [+5.0, +9.0], Z in [-7.3, -3.4], Y = 1.15
  // =========================================================================
  const pavilion = new THREE.Group();
  pavilion.name = "GlassWaitingPavilion";
  pavilion.position.set(7.00, 1.15, -5.35); // W = 4.0, D = 3.9
  bldGroup.add(pavilion);

  const pavFrameMat = toonMat(0x63ada7);
  const pavWoodMat = toonMat(0xc38e62);
  const pavClearGlass = glassMat({ color: 0xe6fbff, opacity: 0.17, roughness: 0.04 });

  const pavFloor = new THREE.Mesh(new THREE.BoxGeometry(3.96, 0.06, 3.86), toonMat(0xf4efe4));
  pavFloor.position.y = 0.03;
  addEdgeInk(pavFloor);
  pavilion.add(pavFloor);

  // 6 slim structural columns + cantilevered mint-and-cream roof
  [[-1.88, -1.82], [0, -1.82], [1.88, -1.82], [-1.88, 1.82], [-0.78, 1.82], [0.78, 1.82], [1.88, 1.82]].forEach(
    ([cx, cz]) => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.075, 2.04, 0.075), pavFrameMat);
      col.position.set(cx, 1.05, cz);
      pavilion.add(col);
    }
  );

  // Floor-to-ceiling clear glass walls (back, left, right, and flanking front panels)
  const backGlass = new THREE.Mesh(new THREE.BoxGeometry(3.72, 1.96, 0.03), pavClearGlass);
  backGlass.position.set(0, 1.04, -1.82);
  const westGlass = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.96, 3.60), pavClearGlass);
  westGlass.position.set(-1.88, 1.04, 0);
  const eastGlass = westGlass.clone();
  eastGlass.position.x = 1.88;
  const frontGlassL = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.96, 0.03), pavClearGlass);
  frontGlassL.position.set(-1.33, 1.04, 1.82);
  const frontGlassR = frontGlassL.clone();
  frontGlassR.position.x = 1.33;
  pavilion.add(backGlass, westGlass, eastGlass, frontGlassL, frontGlassR);

  const pavRoof = new THREE.Mesh(new THREE.BoxGeometry(4.32, 0.11, 4.22), toonMat(0xfbf5ea));
  pavRoof.position.set(0, 2.12, 0.02);
  addEdgeInk(pavRoof);
  const pavFascia = new THREE.Mesh(new THREE.BoxGeometry(4.38, 0.06, 4.28), pavFrameMat);
  pavFascia.position.set(0, 2.19, 0.02);
  const pavGlow = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.03, 0.24), emissiveMat(0xfff1c2, 1.15));
  pavGlow.position.set(0, 2.05, 0);
  pavilion.add(pavRoof, pavFascia, pavGlow);

  // --- Waiting Pavilion Interior Details ---
  // 1) Slatted wooden waiting bench
  const bench = new THREE.Group();
  bench.position.set(-0.22, 0.06, -0.55);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.055, 0.46), pavWoodMat);
  seat.position.y = 0.40;
  const backrest = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.36, 0.045), pavWoodMat);
  backrest.position.set(0, 0.64, -0.20);
  backrest.rotation.x = -0.12;
  addEdgeInk(seat);
  addEdgeInk(backrest);
  [-0.78, 0, 0.78].forEach((bx) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.40, 0.40), toonMat(PALETTE.castIron));
    leg.position.set(bx, 0.20, 0);
    bench.add(leg);
  });
  bench.add(seat, backrest);
  pavilion.add(bench);

  // 2) Faded ferry timetable board
  const ttBoard = new THREE.Mesh(
    new THREE.BoxGeometry(0.88, 0.64, 0.04),
    toonMat(0xffffff, { map: tex.timetable })
  );
  ttBoard.position.set(-1.05, 1.32, -1.76);
  pavilion.add(ttBoard);

  // 3) Retro tabletop radio (id: "radio") on side table
  const sideTable = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.56, 10), pavWoodMat);
  sideTable.position.set(1.18, 0.34, -0.62);
  pavilion.add(sideTable);

  const radioGroup = new THREE.Group();
  radioGroup.position.set(1.18, 0.62, -0.62);
  radioGroup.rotation.y = -0.35;
  const rBody = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.20, 0.15), toonMat(0x9cd6cb));
  rBody.position.y = 0.10;
  addEdgeInk(rBody);
  const rDialMat = emissiveMat(0xffe08a, 1.15);
  const rDial = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.055, 0.02), rDialMat);
  rDial.position.set(-0.03, 0.13, 0.072);
  const rKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 8), toonMat(PALETTE.brassGold));
  rKnob.rotation.x = Math.PI / 2;
  rKnob.position.set(0.10, 0.11, 0.078);
  const rAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.34, 5), toonMat(0xe8eff0));
  rAnt.position.set(0.11, 0.34, -0.03);
  rAnt.rotation.z = -0.28;
  radioGroup.add(rBody, rDial, rKnob, rAnt);
  tagInteractive(radioGroup, "radio", "候船亭老收音机", { accentColor: PALETTE.brassGold });
  pavilion.add(radioGroup);

  // 4) Corner kettle & mugs on small stand + 5) Potted pothos with trailing vines
  const kettleStand = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.42), toonMat(0xd9cdb8));
  kettleStand.position.set(-1.52, 0.32, -1.46);
  const kettleBody = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.20, 10), toonMat(PALETTE.pastelButter));
  kettleBody.position.set(-1.52, 0.68, -1.46);
  const kettleLid = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), toonMat(PALETTE.castIron));
  kettleLid.position.set(-1.52, 0.80, -1.46);
  pavilion.add(kettleStand, kettleBody, kettleLid);

  const potGroup = new THREE.Group();
  potGroup.position.set(1.52, 0.06, 1.38);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.13, 0.28, 10), toonMat(0xc97355));
  pot.position.y = 0.14;
  potGroup.add(pot);
  const leafMat = toonMat(0x5ab882);
  for (let lf = 0; lf < 12; lf += 1) {
    const ang = (lf / 12) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.075, 7, 5), leafMat);
    leaf.scale.set(1.2, 0.45, 0.95);
    leaf.position.set(Math.cos(ang) * (0.12 + (lf % 3) * 0.05), 0.28 - (lf % 4) * 0.055, Math.sin(ang) * 0.14);
    potGroup.add(leaf);
  }
  pavilion.add(potGroup);

  // 6) Crooked wall clock on back central post
  const clockGroup = new THREE.Group();
  clockGroup.position.set(0.0, 1.56, -1.76);
  clockGroup.rotation.z = -0.15; // endearingly crooked!
  const clockRim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 16), toonMat(0x3a5562));
  clockRim.rotation.x = Math.PI / 2;
  const clockFace = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.046, 16), toonMat(0xfdfcf7));
  clockFace.rotation.x = Math.PI / 2;
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.09, 0.01), toonMat(PALETTE.castIron));
  hourHand.position.set(0.025, 0.02, 0.028);
  hourHand.rotation.z = -0.75;
  const secHandPivot = new THREE.Group();
  secHandPivot.position.set(0, 0, 0.032);
  const secHand = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.12, 0.008), toonMat(0xe05347));
  secHand.position.y = 0.045;
  secHandPivot.add(secHand);
  clockGroup.add(clockRim, clockFace, hourHand, secHandPivot);
  pavilion.add(clockGroup);

  dripPoints.push({ x: 6.85, y: 3.24, z: -3.32, groundY: 1.162 });

  return { bldGroup, radioGroup, rDialMat, secHandPivot, dripPoints };
}

// ---------------------------------------------------------------------------
// 4. Pier Street Props & Foreground "Just-Left" Traces
// ---------------------------------------------------------------------------

function buildPierPropsAndTraces(tex, rng) {
  const propsGroup = new THREE.Group();
  propsGroup.name = "PierStreetPropsAndTraces";
  const dripPoints = [];

  // 1) 4 Ring-Shade Lamp Posts + Overhead Catenary Power Lines
  const lampCoords = [
    new THREE.Vector3(-1.55, 1.15, 4.70),
    new THREE.Vector3(-1.55, 1.15, -2.00),
    new THREE.Vector3(4.65, 1.15, -2.00),
    new THREE.Vector3(8.25, 1.15, -2.00),
  ];
  const ironMat = toonMat(PALETTE.castIron);
  const shadeMat = toonMat(0x3f6b74);
  const bulbMat = emissiveMat(0xffe79e, 1.45);
  const wireAttach = [];

  lampCoords.forEach((pos, idx) => {
    const lamp = new THREE.Group();
    lamp.position.copy(pos);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.24, 8), ironMat);
    base.position.y = 0.12;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.056, 2.55, 8), ironMat);
    pole.position.y = 1.42;
    const crossArm = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.035, 0.035), ironMat);
    crossArm.position.set(0, 2.48, 0);
    if (idx === 0) crossArm.rotation.y = Math.PI / 2;
    const neck = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.022, 6, 12, Math.PI), ironMat);
    neck.position.set(idx === 0 ? 0.20 : 0, 2.58, idx === 0 ? 0 : 0.20);
    if (idx !== 0) neck.rotation.y = Math.PI / 2;

    const headX = idx === 0 ? 0.40 : 0;
    const headZ = idx === 0 ? 0 : 0.40;
    const coneShade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.11, 14), shadeMat);
    coneShade.position.set(headX, 2.53, headZ);
    const ringRim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.018, 6, 16), shadeMat);
    ringRim.rotation.x = Math.PI / 2;
    ringRim.position.set(headX, 2.47, headZ);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 8), bulbMat);
    bulb.position.set(headX, 2.43, headZ);

    lamp.add(base, pole, crossArm, neck, coneShade, ringRim, bulb);
    propsGroup.add(lamp);
    wireAttach.push(new THREE.Vector3(pos.x, pos.y + 2.50, pos.z));
    dripPoints.push({ x: pos.x + headX, y: pos.y + 2.46, z: pos.z + headZ, groundY: 1.162 });
  });

  const wireMat = toonMat(0x273238);
  for (let i = 0; i < wireAttach.length - 1; i += 1) {
    [-0.12, 0.12].forEach((off) => {
      const p0 = wireAttach[i].clone().add(new THREE.Vector3(off * 0.5, 0, off * 0.5));
      const p1 = wireAttach[i + 1].clone().add(new THREE.Vector3(off * 0.5, 0, off * 0.5));
      propsGroup.add(makeCatenaryTube(p0, p1, 0.28, 0.009, wireMat, 16));
    });
  }
  propsGroup.add(
    makeCatenaryTube(wireAttach[1], new THREE.Vector3(0.45, 3.42, -3.45), 0.18, 0.009, wireMat, 12)
  );

  // 2) Stacked Wet White/Blue Fish Crates along Quay
  [
    { x: 0.92, z: -2.25, cols: [0x4ca3cc, 0xf7fbfc, 0x4ca3cc] },
    { x: -1.68, z: 1.55, cols: [0xf7fbfc, 0x4ca3cc] },
  ].forEach((st) => {
    st.cols.forEach((col, level) => {
      const c = createFishCrate(col, level === st.cols.length - 1);
      c.position.set(st.x, 1.15 + level * 0.21, st.z);
      c.rotation.y = (level - 0.5) * 0.14;
      propsGroup.add(c);
    });
  });

  // 3) Iron Drying Rack with Draping Net & Pastel Float Garland
  const rack = new THREE.Group();
  rack.position.set(9.55, 1.15, -5.15);
  rack.rotation.y = -0.24;
  [-0.85, 0.85].forEach((rz) => {
    [-0.22, 0.22].forEach((rx, sIdx) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.62, 6), ironMat);
      leg.position.set(rx, 0.78, rz);
      leg.rotation.z = sIdx === 0 ? -0.14 : 0.14;
      rack.add(leg);
    });
  });
  const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 1.92, 8), ironMat);
  topBar.rotation.x = Math.PI / 2;
  topBar.position.y = 1.54;
  const netSheet = new THREE.Mesh(
    new THREE.PlaneGeometry(1.62, 1.18, 8, 6),
    toonMat(0x4b8f94, { transparent: true, opacity: 0.52, side: THREE.DoubleSide })
  );
  netSheet.rotation.y = Math.PI / 2;
  netSheet.position.set(0.05, 0.96, 0);
  rack.add(topBar, netSheet);

  const floatPivot = new THREE.Group();
  floatPivot.position.y = 1.52;
  const pastelCols = [
    PALETTE.pastelPink,
    PALETTE.pastelButter,
    PALETTE.villaTrimMint,
    PALETTE.pastelSky,
    PALETTE.pastelLavender,
  ];
  for (let f = 0; f < 7; f += 1) {
    const t = f / 6;
    const zPos = THREE.MathUtils.lerp(-0.78, 0.78, t);
    const yDrop = -Math.sin(Math.PI * t) * 0.22 - 0.06;
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 8), toonMat(pastelCols[f % pastelCols.length]));
    fl.position.set(0.09, yDrop, zPos);
    floatPivot.add(fl);
  }
  rack.add(floatPivot);
  propsGroup.add(rack);

  // 4) Rusty Hand Winch (near slipway) & Quay Davit Crane
  const winch = new THREE.Group();
  winch.position.set(-1.74, 1.15, 8.92);
  const rustMat = toonMat(PALETTE.rustRed);
  const wStand = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.30), rustMat);
  wStand.position.y = 0.21;
  const wDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.26, 10), ironMat);
  wDrum.rotation.z = Math.PI / 2;
  wDrum.position.y = 0.36;
  const wCrank = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), ironMat);
  wCrank.position.set(0.20, 0.44, 0.05);
  winch.add(wStand, wDrum, wCrank);
  propsGroup.add(winch);
  propsGroup.add(
    makeCatenaryTube(
      new THREE.Vector3(-1.74, 1.50, 9.02),
      new THREE.Vector3(-2.15, 0.62, 9.85),
      0.08,
      0.012,
      toonMat(0xb58659),
      10
    )
  );

  const davit = new THREE.Group();
  davit.position.set(3.35, 1.15, -1.78);
  const dMast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 1.48, 8), rustMat);
  dMast.position.y = 0.74;
  const dBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.052, 0.92, 8), rustMat);
  dBoom.position.set(0, 1.56, 0.32);
  dBoom.rotation.x = 0.92;
  const dCable = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.62, 5), ironMat);
  dCable.position.set(0, 1.42, 0.66);
  const dHook = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.014, 6, 10, Math.PI * 1.4), ironMat);
  dHook.position.set(0, 1.08, 0.66);
  davit.add(dMast, dBoom, dCable, dHook);
  propsGroup.add(davit);

  // 5) Numbered Buoys & 6) Leaning Landing Net + Metal Bucket
  [
    { dx: 0, dz: 0, col: PALETTE.ropeOrange, r: 0.17 },
    { dx: 0.34, dz: 0.14, col: PALETTE.hazardYellow, r: 0.15 },
    { dx: 0.16, dz: -0.28, col: PALETTE.villaTrimMint, r: 0.14 },
  ].forEach((b) => {
    const buoyMesh = new THREE.Mesh(new THREE.SphereGeometry(b.r, 12, 10), toonMat(b.col));
    buoyMesh.scale.y = 1.25;
    buoyMesh.position.set(9.42 + b.dx, 1.15 + b.r * 1.1, -2.55 + b.dz);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 1.01, b.r * 1.01, 0.05, 12), toonMat(0xffffff));
    band.position.copy(buoyMesh.position);
    propsGroup.add(buoyMesh, band);
  });

  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.10, 0.24, 10), toonMat(0x9eb2b8));
  bucket.position.set(-1.42, 1.27, 3.16);
  const netPole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 1.38, 6), toonMat(0xc59763));
  netPole.position.set(-1.32, 1.76, 3.34);
  netPole.rotation.set(0.24, 0.12, -0.22);
  const netHoop = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.014, 6, 14), ironMat);
  netHoop.position.set(-1.17, 2.38, 3.50);
  netHoop.rotation.x = 1.1;
  propsGroup.add(bucket, netPole, netHoop);

  // 7) Glowing Vending Machine with Rusty Rain Hood (id: "vending")
  const vendingGroup = new THREE.Group();
  vendingGroup.position.set(4.68, 1.15, -4.05);
  const vCab = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.66, 0.62), toonMat(0xf4f9fa));
  vCab.position.y = 0.83;
  addEdgeInk(vCab);
  const vSideTrim = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.22, 0.64), toonMat(0x52a7c8));
  vSideTrim.position.y = 0.12;
  const vDisplayMat = emissiveMat(0xffffff, 1.05);
  vDisplayMat.map = tex.vending;
  const vDisplay = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 1.02), vDisplayMat);
  vDisplay.position.set(0, 1.02, 0.315);
  const vSlot = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.18, 0.04), ironMat);
  vSlot.position.set(0, 0.32, 0.31);
  const vHood = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.05, 0.84), rustMat);
  vHood.position.set(0, 1.74, 0.08);
  vHood.rotation.x = 0.16;
  addEdgeInk(vHood);
  vendingGroup.add(vCab, vSideTrim, vDisplay, vSlot, vHood);
  tagInteractive(vendingGroup, "vending", "海港自动贩卖机", { accentColor: PALETTE.pastelSky });
  propsGroup.add(vendingGroup);
  dripPoints.push({ x: 4.68, y: 2.82, z: -3.65, groundY: 1.162 });

  // 8) Harbor & Warning Signboards ("星语花湾 · 注意落水")
  const buildSignboard = (x, z, yaw, mapTex, w, h) => {
    const sg = new THREE.Group();
    sg.position.set(x, 1.15, z);
    sg.rotation.y = yaw;
    [-w * 0.38, w * 0.38].forEach((px) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.96, 6), ironMat);
      p.position.set(px, 0.48, 0);
      sg.add(p);
    });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), toonMat(0xffffff, { map: mapTex }));
    panel.position.y = 0.84;
    addEdgeInk(panel);
    sg.add(panel);
    propsGroup.add(sg);
  };
  buildSignboard(-1.32, -1.66, 0.62, tex.warningSign, 0.92, 0.40);
  buildSignboard(0.12, -3.12, 0.08, tex.harborSign, 0.96, 0.36);

  // 9) Wind-Tilted Windsock & Pastel Pennant String
  const sockMast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 2.45, 8), toonMat(0xf3f7f8));
  sockMast.position.set(10.35, 2.37, -1.85);
  propsGroup.add(sockMast);
  const windsockPivot = new THREE.Group();
  windsockPivot.position.set(10.35, 3.52, -1.85);
  for (let s = 0; s < 5; s += 1) {
    const r0 = 0.11 - s * 0.015;
    const r1 = 0.11 - (s + 1) * 0.015;
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(r1, r0, 0.15, 10, 1, true),
      toonMat(s % 2 === 0 ? PALETTE.ropeOrange : 0xffffff, { side: THREE.DoubleSide })
    );
    seg.rotation.z = -Math.PI / 2;
    seg.position.set(0.10 + s * 0.145, -s * 0.018, 0);
    windsockPivot.add(seg);
  }
  propsGroup.add(windsockPivot);

  const pennantFlags = [];
  const pStart = new THREE.Vector3(-1.55, 3.58, -2.00);
  const pEnd = new THREE.Vector3(4.65, 3.58, -2.00);
  propsGroup.add(makeCatenaryTube(pStart, pEnd, 0.34, 0.007, toonMat(0xe8efe9), 16));
  for (let pf = 1; pf <= 9; pf += 1) {
    const t = pf / 10;
    const fx = THREE.MathUtils.lerp(pStart.x, pEnd.x, t);
    const fy = pStart.y - Math.sin(Math.PI * t) * 0.34;
    const flag = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.18, 3),
      toonMat(pastelCols[pf % pastelCols.length])
    );
    flag.rotation.x = Math.PI;
    flag.position.set(fx, fy - 0.09, -2.00);
    propsGroup.add(flag);
    pennantFlags.push({ mesh: flag, phase: pf * 0.7 });
  }

  // 10) Foreground Steps "Just-Left" Traces:
  // A) Two Silver-Grey Hard Instrument Cases at (-2.35, 1.15, +5.65) (id: "instruments")
  const instrumentsGroup = new THREE.Group();
  instrumentsGroup.position.set(-2.35, 1.15, 5.65);
  const silverShellMat = wetSurfaceMat(0x98a6b3, { roughness: 0.24, metalness: 0.36 });
  const latchMat = toonMat(0x3a4854);

  // Upright contoured cello/guitar-size silver-grey hard case
  const caseA = new THREE.Group();
  caseA.rotation.set(-0.11, 0.26, 0.06);
  const lowerBout = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.21, 0.15, 14), silverShellMat);
  lowerBout.rotation.x = Math.PI / 2;
  lowerBout.position.y = 0.22;
  const upperBout = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.14, 14), silverShellMat);
  upperBout.rotation.x = Math.PI / 2;
  upperBout.position.y = 0.49;
  const neckCase = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.36, 0.12), silverShellMat);
  neckCase.position.y = 0.74;
  const tagCharm = new THREE.Mesh(new THREE.OctahedronGeometry(0.036, 0), toonMat(PALETTE.pastelPink));
  tagCharm.position.set(0.08, 0.62, 0.08);
  caseA.add(lowerBout, upperBout, neckCase, tagCharm);

  // Companion sleek rectangular violin/flute silver-grey hard case beside it
  const caseB = new THREE.Group();
  caseB.position.set(0.32, 0.08, 0.16);
  caseB.rotation.y = -0.38;
  const caseBBody = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.15, 0.23), silverShellMat);
  addEdgeInk(caseBBody, 28, PALETTE.inkOutline, 0.40);
  [-0.16, 0.16].forEach((lx) => {
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.02), latchMat);
    clasp.position.set(lx, 0.02, 0.12);
    caseB.add(clasp);
  });
  const handleB = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 6, 10, Math.PI), ironMat);
  handleB.position.set(0, 0.04, 0.12);
  handleB.rotation.x = Math.PI / 2;
  caseB.add(caseBBody, handleB);
  instrumentsGroup.add(caseA, caseB);
  tagInteractive(instrumentsGroup, "instruments", "台阶旁的银灰乐器箱", { accentColor: PALETTE.pastelLavender });
  propsGroup.add(instrumentsGroup);

  // B) Tilted Raindrop-Beaded Clear Umbrella at (-1.92, 1.15, +6.48) (id: "umbrella")
  const umbrellaGroup = new THREE.Group();
  umbrellaGroup.position.set(-1.92, 1.15, 6.48);

  const umbTilt = new THREE.Group();
  umbTilt.position.y = 0.34;
  umbTilt.rotation.set(0.74, 0.32, -0.22);

  const canopyGeo = new THREE.SphereGeometry(0.52, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.46);
  const canopyMesh = new THREE.Mesh(
    canopyGeo,
    glassMat({ color: 0xcff2fa, opacity: 0.34, roughness: 0.04 })
  );
  addEdgeInk(canopyMesh, 12, 0x3b5566, 0.55);
  umbTilt.add(canopyMesh);

  for (let r = 0; r < 8; r += 1) {
    const ribAng = (r / 8) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.54, 4), latchMat);
    rib.position.set(Math.cos(ribAng) * 0.24, 0.35, Math.sin(ribAng) * 0.24);
    rib.rotation.z = -Math.cos(ribAng) * 0.92;
    rib.rotation.x = Math.sin(ribAng) * 0.92;
    umbTilt.add(rib);
  }
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.72, 6), latchMat);
  shaft.position.y = 0.24;
  const jHook = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.011, 6, 10, Math.PI), latchMat);
  jHook.position.set(0.055, -0.12, 0);
  jHook.rotation.z = Math.PI;
  umbTilt.add(shaft, jHook);

  // Glistening 3D raindrop beads dotting the clear canopy dome
  const beadGeo = new THREE.SphereGeometry(0.016, 6, 5);
  const beadMat = emissiveMat(0xf4ffff, 0.95, { transparent: true, opacity: 0.88 });
  for (let bd = 0; bd < 16; bd += 1) {
    const theta = (bd * 2.399) % (Math.PI * 2);
    const phi = 0.28 + (bd / 16) * 0.95;
    const rad = 0.525;
    const bead = new THREE.Mesh(beadGeo, beadMat);
    bead.position.set(Math.sin(phi) * Math.cos(theta) * rad, Math.cos(phi) * rad, Math.sin(phi) * Math.sin(theta) * rad);
    umbTilt.add(bead);
  }
  umbrellaGroup.add(umbTilt);
  tagInteractive(umbrellaGroup, "umbrella", "缀满雨珠的透明雨伞", { accentColor: PALETTE.pastelSky });
  propsGroup.add(umbrellaGroup);

  dripPoints.push(
    { x: -1.92, y: 1.62, z: 6.48, groundY: 1.162 },
    { x: -2.35, y: 1.88, z: 5.65, groundY: 1.162 }
  );

  return {
    propsGroup,
    vendingGroup,
    vDisplayMat,
    instrumentsGroup,
    umbrellaGroup,
    windsockPivot,
    pennantFlags,
    floatPivot,
    dripPoints,
  };
}

// ---------------------------------------------------------------------------
// 5. Public Subsystem Entry: buildHarborCraftAndProps(anchors = {})
// ---------------------------------------------------------------------------

export function buildHarborCraftAndProps(anchors = {}) {
  const rng = mulberry32(20261128);
  const group = new THREE.Group();
  group.name = "HarborCraftAndProps";

  const tex = createCraftTextures();
  const fleet = buildMooredFleet(anchors, tex, rng);
  const bld = buildHarborBuildings(tex, rng);
  const props = buildPierPropsAndTraces(tex, rng);

  group.add(fleet.fleetGroup, bld.bldGroup, props.propsGroup);
  enableShadows(group);

  const dripPoints = [...fleet.dripPoints, ...bld.dripPoints, ...props.dripPoints];
  const boatReflections = fleet.boatReflections;

  let vendingPulse = 0;
  let instrumentPulse = 0;
  const tmpCleat = new THREE.Vector3();

  function rockBoat(index) {
    fleet.boats.forEach((b, i) => {
      if (index === undefined || i === index) {
        b.impulse = 1.0;
      } else {
        b.impulse = Math.max(b.impulse, 0.25);
      }
    });
  }

  function pulseVending() {
    vendingPulse = 1.0;
  }

  function chimeInstruments() {
    instrumentPulse = 1.0;
  }

  function update(elapsed = 0, dt = 0.016) {
    const safeDt = Math.min(Math.max(dt || 0.016, 0), 0.1);

    // 1. Moored Boats Gentle Swell + Interactive Rocking Impulse
    fleet.boats.forEach((b) => {
      b.impulse = Math.max(0, b.impulse - safeDt * 0.55);
      const kick = b.impulse * Math.sin(elapsed * 8.2 + b.phase);
      const bob = Math.sin(elapsed * 1.45 + b.phase) * 0.028 + kick * 0.035;
      const roll = Math.sin(elapsed * 1.18 + b.phase * 1.3) * 0.034 + kick * 0.14;
      const pitch = Math.cos(elapsed * 1.32 + b.phase * 0.8) * 0.022 + kick * 0.055;

      b.root.position.y = b.baseY + bob;
      b.root.rotation.set(roll, b.baseYaw + Math.sin(elapsed * 0.55 + b.phase) * 0.018, pitch);
      b.root.updateMatrixWorld(true);
    });

    // Update dynamic catenary mooring ropes
    fleet.mooringRopes.forEach((mr) => {
      tmpCleat.copy(mr.local).applyMatrix4(mr.boatRoot.matrixWorld);
      updateCatenaryTube(mr.mesh, tmpCleat, mr.dock, mr.sag);
    });

    // Wheelhouse hanging raincoat & window omamori gentle sway
    fleet.animatedClutter.forEach((ac) => {
      const sway = Math.sin(elapsed * 1.6 + ac.phase) * 0.08;
      ac.coatPivot.rotation.x = sway;
      ac.omamoriPivot.rotation.x = -sway * 1.5;
      ac.omamoriPivot.rotation.z = Math.cos(elapsed * 2.1 + ac.phase) * 0.09;
    });

    // 2. Crooked Pavilion Clock + Windsock, Pennants & Net Floats
    bld.secHandPivot.rotation.z = -(elapsed * (Math.PI / 30));
    props.windsockPivot.rotation.y = 0.35 + Math.sin(elapsed * 2.4) * 0.12;
    props.windsockPivot.rotation.z = Math.sin(elapsed * 3.8) * 0.06;
    props.floatPivot.rotation.x = Math.sin(elapsed * 1.5) * 0.06;
    props.pennantFlags.forEach((pf) => {
      pf.mesh.rotation.z = 0.18 + Math.sin(elapsed * 3.6 + pf.phase) * 0.14;
    });

    // 3. Interactive Pulses (Vending/Radio & Duet Instrument Cases/Umbrella)
    if (vendingPulse > 0) {
      vendingPulse = Math.max(0, vendingPulse - safeDt * 0.85);
      const glow = 1.05 + Math.sin(vendingPulse * Math.PI * 4) * 0.55 + vendingPulse * 0.65;
      props.vDisplayMat.emissiveIntensity = glow;
      bld.rDialMat.emissiveIntensity = 1.15 + vendingPulse * 0.9;
      bld.radioGroup.position.y = 0.62 + Math.abs(Math.sin(vendingPulse * Math.PI * 3)) * 0.025;
    }

    if (instrumentPulse > 0) {
      instrumentPulse = Math.max(0, instrumentPulse - safeDt * 0.72);
      const shimmer = Math.sin(instrumentPulse * Math.PI * 5) * instrumentPulse;
      props.instrumentsGroup.position.y = 1.15 + Math.abs(shimmer) * 0.035;
      props.instrumentsGroup.rotation.y = shimmer * 0.06;
      props.umbrellaGroup.rotation.y = shimmer * 0.09;
    }
  }

  update(0, 0.016);

  return {
    group,
    update,
    rockBoat,
    pulseVending,
    chimeInstruments,
    dripPoints,
    boatReflections,
  };
}
