// Square 24m x 24m Cutaway Base, L-Shaped Concrete Harbor Quay, Masonry & Translucent Underwater
// Cross-Sections, Tetrapods, Red-White Lighthouse, and Wooded Fairytale Hillside.

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
  tagInteractive,
  enableShadows,
} from "./toon-kit.js";

function createWetConcreteTex() {
  return makeCanvasTex(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = "#dce3e4";
      ctx.fillRect(0, 0, w, h);

      const rand = mulberry32(101);
      for (let i = 0; i < 1600; i += 1) {
        const x = rand() * w;
        const y = rand() * h;
        const r = 0.7 + rand() * 2.1;
        ctx.fillStyle = rand() > 0.5 ? "rgba(255,255,255,0.28)" : "rgba(128,148,156,0.22)";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Damp sunshower blotches
      for (let i = 0; i < 24; i += 1) {
        const gx = rand() * w;
        const gy = rand() * h;
        const rad = 28 + rand() * 68;
        const grad = ctx.createRadialGradient(gx, gy, 2, gx, gy, rad);
        grad.addColorStop(0, "rgba(150,176,184,0.22)");
        grad.addColorStop(1, "rgba(150,176,184,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gx, gy, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // Concrete slab expansion grid
      ctx.strokeStyle = "rgba(104,124,132,0.34)";
      ctx.lineWidth = 2;
      const step = 128;
      for (let x = 0; x <= w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    },
    { repeatX: 4, repeatY: 4 }
  );
}

function createQuayMasonryTex() {
  return makeCanvasTex(
    1024,
    512,
    (ctx, w, h) => {
      // Base concrete cutaway stone
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0.0, "#cbd4d6");
      bg.addColorStop(0.52, "#b5c2c6");
      bg.addColorStop(0.66, "#738a90");
      bg.addColorStop(0.82, "#516970");
      bg.addColorStop(1.0, "#3f555c");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const rand = mulberry32(202);
      const rows = 9;
      const rowH = h / rows;
      for (let r = 0; r < rows; r += 1) {
        const y = r * rowH;
        const cols = 10 + (r % 2);
        const colW = w / cols;
        const offset = (r % 2) * (colW * 0.48);

        for (let c = -1; c <= cols; c += 1) {
          const x = c * colW + offset;
          const shade = (rand() - 0.5) * 18;
          ctx.fillStyle =
            shade > 0
              ? `rgba(242,248,249,${(shade / 110).toFixed(3)})`
              : `rgba(54,74,82,${(-shade / 95).toFixed(3)})`;
          ctx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);
        }

        ctx.strokeStyle = "rgba(56,74,82,0.46)";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();

        for (let c = -1; c <= cols; c += 1) {
          const x = c * colW + offset;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + rowH);
          ctx.stroke();
        }
      }

      // Multi-level tidal stain bands ("深浅不一的潮位线")
      const tideBands = [
        { y: h * 0.58, thick: 18, alpha: 0.28, color: "58,84,88" },
        { y: h * 0.65, thick: 26, alpha: 0.42, color: "40,68,72" },
        { y: h * 0.73, thick: 34, alpha: 0.48, color: "32,58,60" },
      ];
      tideBands.forEach((b) => {
        const tg = ctx.createLinearGradient(0, b.y - b.thick, 0, b.y + b.thick);
        tg.addColorStop(0, `rgba(${b.color},0)`);
        tg.addColorStop(0.5, `rgba(${b.color},${b.alpha})`);
        tg.addColorStop(1, `rgba(${b.color},0)`);
        ctx.fillStyle = tg;
        ctx.fillRect(0, b.y - b.thick, w, b.thick * 2);
      });

      // Vertical rust & damp drip streaks
      for (let i = 0; i < 18; i += 1) {
        const sx = rand() * w;
        const sy = h * (0.14 + rand() * 0.35);
        const len = 60 + rand() * 140;
        const rg = ctx.createLinearGradient(0, sy, 0, sy + len);
        rg.addColorStop(0, "rgba(138,82,62,0.34)");
        rg.addColorStop(1, "rgba(138,82,62,0)");
        ctx.fillStyle = rg;
        ctx.fillRect(sx, sy, 4 + rand() * 5, len);
      }
    },
    { repeatX: 2, repeatY: 1 }
  );
}

function createHazardCurbTex() {
  return makeCanvasTex(
    512,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = "#f3bf36";
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "#2b3238";
      const stripeW = 40;
      for (let x = -h; x < w + h; x += stripeW * 2) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + stripeW, 0);
        ctx.lineTo(x + stripeW - h * 0.85, h);
        ctx.lineTo(x - h * 0.85, h);
        ctx.closePath();
        ctx.fill();
      }

      // Chipped concrete wear & water stains
      const rand = mulberry32(303);
      for (let i = 0; i < 95; i += 1) {
        ctx.fillStyle = rand() > 0.4 ? "rgba(214,222,224,0.68)" : "rgba(78,92,98,0.38)";
        ctx.beginPath();
        ctx.ellipse(
          rand() * w,
          rand() * h,
          3 + rand() * 11,
          2 + rand() * 5,
          rand() * Math.PI,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    },
    { repeatX: 5, repeatY: 1 }
  );
}

function buildIronLadder(height = 2.9, rungs = 9) {
  const ladder = new THREE.Group();
  const rustMat = toonMat(0x7c4a3c);
  const darkIron = toonMat(0x3a3f44);

  [-0.21, 0.21].forEach((lx) => {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, height, 8), darkIron);
    rail.position.set(lx, -height * 0.5, 0);
    addEdgeInk(rail, 35, PALETTE.inkOutline, 0.4);
    ladder.add(rail);

    // Top curved grab handle above quay edge
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.02, 8, 14, Math.PI),
      rustMat
    );
    arch.position.set(lx, 0.02, -0.11);
    arch.rotation.y = Math.PI * 0.5;
    ladder.add(arch);
  });

  for (let i = 0; i < rungs; i += 1) {
    const ry = -0.22 - (i / Math.max(1, rungs - 1)) * (height - 0.36);
    const rung = new THREE.Mesh(
      new THREE.CylinderGeometry(0.017, 0.017, 0.42, 8),
      i % 2 === 0 ? rustMat : darkIron
    );
    rung.rotation.z = Math.PI * 0.5;
    rung.position.set(0, ry, 0);
    ladder.add(rung);
  }
  return ladder;
}

function buildMooringRing() {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.04), toonMat(0x414950));
  g.add(plate);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.024, 8, 16), toonMat(0x6e463a));
  ring.position.set(0, -0.09, 0.045);
  ring.rotation.x = 0.22;
  g.add(ring);
  return g;
}

function buildBollard() {
  const g = new THREE.Group();
  const ironMat = toonMat(PALETTE.castIron);
  const wornTopMat = toonMat(0x445058);

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), ironMat);
  base.position.y = 0.03;
  addEdgeInk(base, 25);
  g.add(base);

  // Corner bolts
  [
    [-0.15, -0.15],
    [0.15, -0.15],
    [-0.15, 0.15],
    [0.15, 0.15],
  ].forEach(([bx, bz]) => {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 6), wornTopMat);
    bolt.position.set(bx, 0.07, bz);
    g.add(bolt);
  });

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.15, 0.36, 14), ironMat);
  post.position.y = 0.24;
  addEdgeInk(post, 32);
  g.add(post);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.13, 0.09, 14), wornTopMat);
  cap.position.y = 0.45;
  addEdgeInk(cap, 30);
  g.add(cap);

  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.42, 10), ironMat);
  horn.rotation.z = Math.PI * 0.5;
  horn.position.y = 0.34;
  g.add(horn);

  return g;
}

function buildTetrapod(scale = 1.0, mat = null) {
  const pod = new THREE.Group();
  const podMat = mat || toonMat(0xd5dcde);
  const dirs = [
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0.9428, -0.3333, 0),
    new THREE.Vector3(-0.4714, -0.3333, 0.8165),
    new THREE.Vector3(-0.4714, -0.3333, -0.8165),
  ];

  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), podMat);
  pod.add(hub);

  const up = new THREE.Vector3(0, 1, 0);
  dirs.forEach((d) => {
    const dir = d.clone().normalize();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.245, 0.68, 10), podMat);
    leg.position.copy(dir).multiplyScalar(0.32);
    leg.quaternion.setFromUnitVectors(up, dir);
    addEdgeInk(leg, 30, PALETTE.inkOutline, 0.42);
    pod.add(leg);
  });

  pod.scale.setScalar(scale);
  return pod;
}

function buildSunkenAnchorAndChain() {
  const g = new THREE.Group();
  const rustIron = toonMat(0x5b4642);
  const darkIron = toonMat(0x3b3d42);

  // Admiralty anchor shank + crown + flukes
  const anchor = new THREE.Group();
  anchor.position.set(7.8, -2.68, 10.15);
  anchor.rotation.set(0.38, 0.55, -1.12);

  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.95, 8), rustIron);
  anchor.add(shank);

  const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.62, 8), darkIron);
  stock.rotation.z = Math.PI * 0.5;
  stock.position.y = 0.36;
  anchor.add(stock);

  const armArc = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.048, 8, 16, Math.PI),
    rustIron
  );
  armArc.position.y = -0.32;
  armArc.rotation.z = Math.PI;
  anchor.add(armArc);

  [-0.34, 0.34].forEach((fx, idx) => {
    const fluke = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 4), rustIron);
    fluke.position.set(fx, -0.26, 0);
    fluke.rotation.z = idx === 0 ? 0.35 : -0.35;
    anchor.add(fluke);
  });

  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.022, 8, 14), darkIron);
  shackle.position.y = 0.5;
  anchor.add(shackle);
  g.add(anchor);

  // 16 interlocking heavy seabed chain links snaking across gravel
  for (let i = 0; i < 16; i += 1) {
    const t = i / 15;
    const cx = 8.15 - t * 2.35 + Math.sin(t * 4.2) * 0.22;
    const cz = 10.05 - t * 1.45 + Math.cos(t * 3.5) * 0.18;
    const cy = -2.68 + t * 0.12;
    const link = new THREE.Mesh(
      new THREE.TorusGeometry(0.075, 0.024, 7, 12),
      i % 2 === 0 ? darkIron : rustIron
    );
    link.scale.set(1.35, 0.85, 1.0);
    link.position.set(cx, cy, cz);
    link.rotation.set(i % 2 === 0 ? 1.45 : 0.35, -0.6 + t * 0.8, 0.2);
    g.add(link);
  }

  return g;
}

function buildPearlClam() {
  const g = new THREE.Group();
  const shellMat = toonMat(0xf4b6c2);
  const innerMat = toonMat(0xfff5ee);

  const lower = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 14, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
    shellMat
  );
  lower.scale.set(1.25, 0.55, 1.05);
  addEdgeInk(lower, 32);
  g.add(lower);

  const upperPivot = new THREE.Group();
  upperPivot.position.set(0, 0.02, -0.18);
  upperPivot.rotation.x = -0.68;
  const upper = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
    shellMat
  );
  upper.scale.set(1.25, 0.55, 1.05);
  upper.position.set(0, 0, 0.18);
  addEdgeInk(upper, 32);
  upperPivot.add(upper);
  g.add(upperPivot);

  const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.04, 12), innerMat);
  bed.position.y = 0.01;
  g.add(bed);

  const pearl = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 14, 12),
    emissiveMat(0xfff7dc, 0.95)
  );
  pearl.position.set(0, 0.075, 0.02);
  g.add(pearl);

  return g;
}

function buildLittleFish(colorHex) {
  const g = new THREE.Group();
  const bodyMat = toonMat(colorHex);
  const finMat = toonMat(0xffffff);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), bodyMat);
  body.scale.set(1.85, 0.95, 0.55);
  g.add(body);

  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.14, 0, 0);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.13, 4), finMat);
  tail.rotation.z = -Math.PI * 0.5;
  tail.scale.set(1, 1, 0.35);
  tail.position.set(-0.05, 0, 0);
  tailPivot.add(tail);
  g.add(tailPivot);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), toonMat(0x1f2b33));
  eyeL.position.set(0.1, 0.02, 0.038);
  const eyeR = eyeL.clone();
  eyeR.position.z = -0.038;
  g.add(eyeL, eyeR);

  g.userData.tailPivot = tailPivot;
  return g;
}

function buildRedWhiteLighthouse() {
  const root = new THREE.Group();
  root.position.set(8.8, 1.05, 3.5);

  const redMat = toonMat(0xe1564a);
  const whiteMat = toonMat(0xfaf8f2);
  const brassMat = toonMat(PALETTE.brassGold);
  const darkIron = toonMat(PALETTE.castIron);

  // Octagonal stone plinth
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.76, 0.28, 12), toonMat(0xcbd3d5));
  plinth.position.y = 0.14;
  addEdgeInk(plinth, 28);
  root.add(plinth);

  // 5 alternating red & cream-white tapered bands
  const bandH = 0.56;
  for (let i = 0; i < 5; i += 1) {
    const rBot = 0.56 - i * 0.038;
    const rTop = 0.56 - (i + 1) * 0.038;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBot, bandH, 18),
      i % 2 === 0 ? whiteMat : redMat
    );
    band.position.y = 0.28 + i * bandH + bandH * 0.5;
    addEdgeInk(band, 35, PALETTE.inkOutline, 0.42);
    root.add(band);
  }

  // Cute arched sea-mint doorway + brass portholes
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.48, 0.12), toonMat(0x6bb8b0));
  doorFrame.position.set(0, 0.52, -0.53);
  addEdgeInk(doorFrame, 25);
  root.add(doorFrame);

  [1.25, 2.15].forEach((py, idx) => {
    const port = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 8, 14), brassMat);
    port.position.set(idx === 0 ? -0.46 : 0.42, py, idx === 0 ? 0.15 : 0.18);
    port.rotation.y = idx === 0 ? -1.25 : 1.2;
    root.add(port);
  });

  // Corbelled gallery deck + slender iron railing
  const galleryY = 3.12;
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.39, 0.14, 18), whiteMat);
  gallery.position.y = galleryY;
  addEdgeInk(gallery, 28);
  root.add(gallery);

  const topRail = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.016, 8, 24), darkIron);
  topRail.rotation.x = Math.PI * 0.5;
  topRail.position.y = galleryY + 0.26;
  root.add(topRail);

  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 6), darkIron);
    post.position.set(Math.cos(a) * 0.53, galleryY + 0.14, Math.sin(a) * 0.53);
    root.add(post);
  }

  // Clear glass lantern room + glowing Fresnel drum
  const lanternGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.33, 0.33, 0.48, 16),
    glassMat({ opacity: 0.26 })
  );
  lanternGlass.position.y = galleryY + 0.31;
  root.add(lanternGlass);

  const fresnelCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.28, 12),
    emissiveMat(0xffe494, 0.65)
  );
  fresnelCore.position.y = galleryY + 0.31;
  root.add(fresnelCore);

  // Rotating golden sunshower beam rotor
  const beamRotor = new THREE.Group();
  beamRotor.position.y = galleryY + 0.31;
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffd878,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beamCone = new THREE.Mesh(new THREE.ConeGeometry(0.95, 5.4, 18, 1, true), beamMat);
  beamCone.rotation.z = Math.PI * 0.5;
  beamCone.position.set(-2.75, -0.18, 0);
  const beamConeBack = beamCone.clone();
  beamConeBack.rotation.z = -Math.PI * 0.5;
  beamConeBack.position.set(2.75, -0.18, 0);
  beamRotor.add(beamCone, beamConeBack);
  root.add(beamRotor);

  // Red dome cupola + brass finial + heart weathervane
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
    redMat
  );
  dome.position.y = galleryY + 0.54;
  addEdgeInk(dome, 32);
  root.add(dome);

  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.26, 8), brassMat);
  spire.position.y = galleryY + 0.98;
  root.add(spire);

  tagInteractive(root, "lighthouse", "防波堤红白灯塔", { accentColor: 0xffd778 });
  root.userData.fresnelCore = fresnelCore;
  root.userData.beamRotor = beamRotor;
  root.userData.beamMat = beamMat;
  return root;
}

function buildMiniatureHillHouse(wallHex, roofHex, scale = 1.0) {
  const g = new THREE.Group();
  const wMat = toonMat(wallHex);
  const rMat = toonMat(roofHex);
  const winMat = emissiveMat(0xffe3a2, 0.85);

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.78, 0.92), wMat);
  body.position.y = 0.39;
  addEdgeInk(body, 25);
  g.add(body);

  // Pitched tile roof (extruded prism via 4-sided cone or rotated box Gables)
  const roofL = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.08, 0.64), rMat);
  roofL.position.set(0, 0.92, 0.24);
  roofL.rotation.x = 0.56;
  addEdgeInk(roofL, 25);
  const roofR = roofL.clone();
  roofR.position.z = -0.24;
  roofR.rotation.x = -0.56;
  g.add(roofL, roofR);

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.16), toonMat(0xc47b6c));
  chimney.position.set(0.32, 1.06, -0.18);
  addEdgeInk(chimney, 25);
  g.add(chimney);

  // Glowing miniature windows
  [-0.28, 0.28].forEach((wx) => {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.22), winMat);
    win.position.set(wx, 0.44, 0.465);
    g.add(win);
  });
  const sideWin = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.22), winMat);
  sideWin.rotation.y = Math.PI * 0.5;
  sideWin.position.set(0.58, 0.44, 0);
  g.add(sideWin);

  g.scale.setScalar(scale);
  return g;
}

function buildAnimeTree(foliageHex, scale = 1.0) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.11, 0.65, 7),
    toonMat(0x7c5c48)
  );
  trunk.position.y = 0.32;
  g.add(trunk);

  const leafMat = toonMat(foliageHex);
  const puffs = [
    [0, 0.82, 0, 0.46],
    [0.24, 0.72, 0.16, 0.34],
    [-0.25, 0.74, -0.12, 0.35],
    [0.05, 1.08, -0.04, 0.33],
  ];
  puffs.forEach(([px, py, pz, r]) => {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMat);
    s.position.set(px, py, pz);
    g.add(s);
  });
  g.scale.setScalar(scale);
  return g;
}

export function buildHarborBase() {
  const group = new THREE.Group();
  group.name = "HarborCutawayBaseGroup";

  const rand = mulberry32(20260520);
  const wetConcreteTex = createWetConcreteTex();
  const masonryTex = createQuayMasonryTex();
  const hazardTex = createHazardCurbTex();

  const pierDeckMat = wetSurfaceMat(0xe2e8e9, { map: wetConcreteTex, roughness: 0.25, metalness: 0.06 });
  const masonryMat = toonMat(0xffffff, { map: masonryTex, unique: true });
  const stoneTrimMat = toonMat(0xc4cfd2);
  const darkSubMat = toonMat(0x526970);

  // 1. Collectible 44m x 44m Grand Museum Plinth Base (Y in [-3.58, -3.15])
  const plinthMat = toonMat(0x37474f);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(44.24, 0.43, 44.24), plinthMat);
  plinth.position.set(0, -3.365, 0);
  addEdgeInk(plinth, 24, 0x1d2b33, 0.65);
  group.add(plinth);

  // Brass corner accent brackets on the 44m x 44m collector base
  const brassMat = toonMat(PALETTE.brassGold);
  [
    [-22.04, -22.04],
    [22.04, -22.04],
    [-22.04, 22.04],
    [22.04, 22.04],
  ].forEach(([cx, cz]) => {
    const corner = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.46, 0.56), brassMat);
    corner.position.set(cx * 0.992, -3.36, cz * 0.992);
    addEdgeInk(corner, 24);
    group.add(corner);
  });

  // Soft tabletop drop-shadow receiver beneath the 44m x 44m diorama
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(49.0, 49.0),
    new THREE.MeshBasicMaterial({
      color: 0x5c7c85,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    })
  );
  shadowPlane.rotation.x = -Math.PI * 0.5;
  shadowPlane.position.y = -3.6;
  group.add(shadowPlane);

  // 2. L-Shaped Concrete Pier Volume (Y in [-3.15, +1.15], total height = 4.30m)
  // West Arm Main Block (X in [-12.0, -3.5], Z in [-12.0, +12.0])
  const westMain = new THREE.Mesh(new THREE.BoxGeometry(8.5, 4.3, 24.0), masonryMat);
  westMain.position.set(-7.75, -1.0, 0.0);
  addEdgeInk(westMain, 25);
  group.add(westMain);

  const westMainTop = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.06, 24.0), pierDeckMat);
  westMainTop.position.set(-7.75, 1.13, 0.0);
  group.add(westMainTop);

  // West Arm Promenade North of Slipway (X in [-3.5, -1.0], Z in [-12.0, +8.7])
  const westProm = new THREE.Mesh(new THREE.BoxGeometry(2.5, 4.3, 20.7), masonryMat);
  westProm.position.set(-2.25, -1.0, -1.65);
  addEdgeInk(westProm, 25);
  group.add(westProm);

  const westPromTop = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.06, 20.7), pierDeckMat);
  westPromTop.position.set(-2.25, 1.13, -1.65);
  group.add(westPromTop);

  // Slipway ("斜坡式滑道 スロープ") at X in [-3.5, -1.0], Z in [+8.7, +12.0]
  // Sub-base under slipway
  const slipSub = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.8, 3.3), darkSubMat);
  slipSub.position.set(-2.25, -1.75, 10.35);
  addEdgeInk(slipSub, 25);
  group.add(slipSub);

  // Inclined concrete ramp from (Z=8.7, Y=1.15) to (Z=11.95, Y=-0.38)
  const rampLen = Math.hypot(3.25, 1.53);
  const rampAngle = Math.atan2(1.53, 3.25);
  const slipRamp = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.24, rampLen), stoneTrimMat);
  slipRamp.position.set(-2.25, 0.38, 10.32);
  slipRamp.rotation.x = rampAngle;
  addEdgeInk(slipRamp, 25);
  group.add(slipRamp);

  // Traction ribs on slipway
  for (let i = 0; i < 8; i += 1) {
    const t = (i + 0.5) / 8;
    const rz = 8.85 + t * 2.95;
    const ry = 1.09 - t * 1.39;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.035, 0.06), toonMat(0x9fb0b5));
    rib.position.set(-2.25, ry, rz);
    rib.rotation.x = rampAngle;
    group.add(rib);
  }

  // Harbor Stone Steps (Z in [5.2, 6.8]) & Low Boarding Platform (Z in [6.8, 8.4], Y = +0.38)
  for (let s = 0; s < 4; s += 1) {
    const stepY = 0.98 - s * 0.19;
    const stepZ = 5.4 + s * 0.36;
    const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.22, 0.38), stoneTrimMat);
    stepMesh.position.set(-0.62, stepY, stepZ);
    addEdgeInk(stepMesh, 25);
    group.add(stepMesh);
  }
  const lowPlatform = new THREE.Mesh(new THREE.BoxGeometry(0.92, 3.53, 1.65), masonryMat);
  lowPlatform.position.set(-0.6, -1.385, 7.62);
  addEdgeInk(lowPlatform, 25);
  group.add(lowPlatform);
  const lowPlatCap = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.08, 1.67), stoneTrimMat);
  lowPlatCap.position.set(-0.6, 0.38, 7.62);
  addEdgeInk(lowPlatCap, 25);
  group.add(lowPlatCap);

  // North Arm Main Block (X in [-1.0, +12.0], Z in [-12.0, -1.5])
  const northMain = new THREE.Mesh(new THREE.BoxGeometry(13.0, 4.3, 10.5), masonryMat);
  northMain.position.set(5.5, -1.0, -6.75);
  addEdgeInk(northMain, 25);
  group.add(northMain);

  const northMainTop = new THREE.Mesh(new THREE.BoxGeometry(13.0, 0.06, 10.5), pierDeckMat);
  northMainTop.position.set(5.5, 1.13, -6.75);
  group.add(northMainTop);

  // 3D Protruding Cutaway Masonry Relief Blocks along inner harbor walls
  const reliefBlockMats = [toonMat(0xc3ced1), toonMat(0xaebbc0), toonMat(0x6e858b)];
  for (let i = 0; i < 28; i += 1) {
    const by = -2.4 + rand() * 3.1;
    const bw = 0.5 + rand() * 0.55;
    const bh = 0.26 + rand() * 0.22;
    const matIdx = by < -0.2 ? 2 : rand() > 0.5 ? 0 : 1;
    const blk = new THREE.Mesh(new THREE.BoxGeometry(0.08, bh, bw), reliefBlockMats[matIdx]);
    blk.position.set(-0.98, by, -1.0 + rand() * 9.2);
    addEdgeInk(blk, 28, PALETTE.inkOutline, 0.36);
    group.add(blk);
  }

  // Yellow-Black Diagonal Safety Curbs ("刷着斜纹黄黑警示条的护轮坎")
  const hazardMat = toonMat(0xffffff, { map: hazardTex, unique: true });
  const curbNorth = new THREE.Mesh(new THREE.BoxGeometry(8.9, 0.16, 0.22), hazardMat);
  curbNorth.position.set(3.45, 1.23, -1.62);
  addEdgeInk(curbNorth, 25);
  group.add(curbNorth);

  const curbWest = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 6.5), hazardMat);
  curbWest.position.set(-1.12, 1.23, 1.75);
  curbWest.rotation.y = Math.PI * 0.5;
  curbWest.geometry = new THREE.BoxGeometry(6.5, 0.16, 0.22);
  addEdgeInk(curbWest, 25);
  group.add(curbWest);

  // Wet Rainwater Puddles on Pier ("湿润地面低洼处积成小水洼")
  const puddleSpecs = [
    { x: -2.55, y: 1.162, z: 3.65, radius: 0.95 },
    { x: -2.35, y: 1.162, z: -2.55, radius: 1.05 },
    { x: 2.15, y: 1.162, z: -2.48, radius: 1.15 },
    { x: 5.75, y: 1.162, z: -2.42, radius: 0.92 },
    { x: -2.75, y: 1.162, z: 7.55, radius: 0.78 },
    { x: 1.25, y: 1.162, z: -9.15, radius: 1.1 },
  ];
  const puddleMat = new THREE.MeshPhysicalMaterial({
    color: 0xcbe8ee,
    transparent: true,
    opacity: 0.58,
    roughness: 0.04,
    metalness: 0.16,
    clearcoat: 1.0,
    depthWrite: false,
  });
  puddleSpecs.forEach((p) => {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(p.radius, 24), puddleMat);
    disc.rotation.x = -Math.PI * 0.5;
    disc.scale.set(1.25, 0.82, 1.0);
    disc.position.set(p.x, p.y, p.z);
    group.add(disc);
  });

  // Cast-Iron Bollards ("一列黑色铸铁系船柱")
  const bollardCoords = [
    { x: 0.7, y: 1.15, z: -1.85 },
    { x: 2.7, y: 1.15, z: -1.85 },
    { x: 4.8, y: 1.15, z: -1.85 },
    { x: 6.9, y: 1.15, z: -1.85 },
    { x: -1.35, y: 1.15, z: 0.3 },
    { x: -1.35, y: 1.15, z: 2.3 },
    { x: -1.35, y: 1.15, z: 4.3 },
  ];
  const bollardAnchors = [];
  bollardCoords.forEach((bc) => {
    const b = buildBollard();
    b.position.set(bc.x, bc.y, bc.z);
    group.add(b);
    bollardAnchors.push({ x: bc.x, y: bc.y + 0.36, z: bc.z });
  });

  // Rusty Iron Ladders & Mooring Rings on Outer Cutaway Seawall & Inner Quay Wall
  const frontLadder = buildIronLadder(3.25, 10);
  frontLadder.position.set(-1.65, 1.32, 22.06);
  group.add(frontLadder);

  const harborLadder = buildIronLadder(2.65, 8);
  harborLadder.position.set(-0.95, 1.15, 4.72);
  harborLadder.rotation.y = Math.PI * 0.5;
  group.add(harborLadder);

  [
    [-3.2, 0.28, 22.05, 0],
    [-5.8, 0.22, 22.05, 0],
    [-0.97, 0.35, 1.15, Math.PI * 0.5],
    [-0.97, 0.35, 3.45, Math.PI * 0.5],
    [-0.97, 0.32, 16.5, Math.PI * 0.5],
    [1.65, 0.35, -1.47, 0],
    [4.15, 0.35, -1.47, 0],
  ].forEach(([rx, ry, rz, rotY]) => {
    const mr = buildMooringRing();
    mr.position.set(rx, ry, rz);
    mr.rotation.y = rotY;
    group.add(mr);
  });

  // 3D Barnacles & Oyster Shells ("底部附着藤壶、牡蛎壳") + Swaying Coastal Kelp ("海藻")
  const barnacleMat = toonMat(0xd7ded8);
  const oysterMat = toonMat(0x9aa9a6);
  const shellWallGroup = new THREE.Group();
  for (let i = 0; i < 96; i += 1) {
    const onFront = i < 38;
    const isOyster = i % 3 === 0;
    const m = new THREE.Mesh(
      isOyster
        ? new THREE.SphereGeometry(0.065, 7, 6)
        : new THREE.ConeGeometry(0.055, 0.065, 6, 1, true),
      isOyster ? oysterMat : barnacleMat
    );
    if (isOyster) m.scale.set(1.3, 0.7, 0.45);
    const sy = -1.85 + rand() * 1.95;
    if (onFront) {
      m.position.set(-11.4 + rand() * 10.1, sy, 22.05);
      m.rotation.x = Math.PI * 0.5;
    } else if (i < 72) {
      m.position.set(-0.95, sy, -1.2 + rand() * 22.4);
      m.rotation.z = -Math.PI * 0.5;
    } else {
      m.position.set(-0.6 + rand() * 21.8, sy, -1.46);
      m.rotation.x = Math.PI * 0.5;
    }
    shellWallGroup.add(m);
  }
  group.add(shellWallGroup);

  const kelpFronds = [];
  const kelpMat = toonMat(0x3f7b65, { side: THREE.DoubleSide });
  for (let i = 0; i < 28; i += 1) {
    const h = 0.48 + rand() * 0.55;
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.11, h, 1, 5), kelpMat);
    const posAttr = frond.geometry.attributes.position;
    for (let v = 0; v < posAttr.count; v += 1) {
      const yy = posAttr.getY(v);
      posAttr.setZ(v, Math.sin(yy * 7.0) * 0.035);
    }
    frond.geometry.computeVertexNormals();
    const pivot = new THREE.Group();
    frond.position.y = h * 0.5;
    pivot.add(frond);
    if (i < 10) {
      pivot.position.set(-10.5 + i * 0.92, -2.15 + rand() * 0.55, 22.06);
    } else if (i < 20) {
      pivot.position.set(-0.92, -1.95 + rand() * 0.65, -0.8 + (i - 10) * 2.15);
      pivot.rotation.y = Math.PI * 0.5;
    } else {
      pivot.position.set(0.6 + (i - 20) * 2.4, -1.95 + rand() * 0.65, -1.42);
    }
    group.add(pivot);
    kelpFronds.push({ pivot, phase: rand() * Math.PI * 2, speed: 1.4 + rand() * 0.8 });
  }

  // 3. Expanded 23m x 23.5m Underwater Sloping Pebble Seabed & Sea-Glass Cutaway (X in [-1..22], Z in [-1.5..22])
  const seabedGeo = new THREE.PlaneGeometry(23.0, 23.5, 42, 42);
  seabedGeo.rotateX(-Math.PI * 0.5);
  const sbPos = seabedGeo.attributes.position;
  const sbColors = new Float32Array(sbPos.count * 3);
  const cShallow = new THREE.Color(0x9ec4ba);
  const cDeep = new THREE.Color(0x4d7780);
  const cTmp = new THREE.Color();

  const getSeabedY = (wx, wz) => {
    const u = THREE.MathUtils.clamp((wx + 1.0) / 23.0, 0, 1);
    const v = THREE.MathUtils.clamp((wz + 1.5) / 23.5, 0, 1);
    const base = -2.18 - (u * 0.46 + v * 0.42);
    const ripple = Math.sin(wx * 0.65 + wz * 0.5) * 0.065;
    return base + ripple;
  };

  for (let i = 0; i < sbPos.count; i += 1) {
    const lx = sbPos.getX(i);
    const lz = sbPos.getZ(i);
    const wx = lx + 10.5;
    const wz = lz + 10.25;
    const wy = getSeabedY(wx, wz);
    sbPos.setY(i, wy);
    const t = THREE.MathUtils.clamp((-wy - 2.15) / 0.95, 0, 1);
    cTmp.copy(cShallow).lerp(cDeep, t);
    sbColors[i * 3 + 0] = cTmp.r;
    sbColors[i * 3 + 1] = cTmp.g;
    sbColors[i * 3 + 2] = cTmp.b;
  }
  seabedGeo.setAttribute("color", new THREE.BufferAttribute(sbColors, 3));
  seabedGeo.computeVertexNormals();
  const seabedMesh = new THREE.Mesh(
    seabedGeo,
    new THREE.MeshToonMaterial({
      vertexColors: true,
      gradientMap: masonryMat.gradientMap,
    })
  );
  seabedMesh.position.set(10.5, 0, 10.25);
  group.add(seabedMesh);

  // Slipway cove floor at X in [-3.5, -1.0], Z in [12.0, 14.0]
  const coveBed = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.95, 2.05), darkSubMat);
  coveBed.position.set(-2.25, -2.68, 13.0);
  group.add(coveBed);

  // Seabed cross-section earth skirts on outer Z=+22 and X=+22 between Y=-3.15 and seabed contour
  const buildSeabedSkirt = (alongX) => {
    const segs = 40;
    const geom = new THREE.BufferGeometry();
    const positions = [];
    for (let i = 0; i < segs; i += 1) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      if (alongX) {
        const x0 = -1.0 + t0 * 23.0;
        const x1 = -1.0 + t1 * 23.0;
        const y0 = getSeabedY(x0, 22.0);
        const y1 = getSeabedY(x1, 22.0);
        positions.push(
          x0, -3.15, 22.0, x1, -3.15, 22.0, x1, y1, 22.0,
          x0, -3.15, 22.0, x1, y1, 22.0, x0, y0, 22.0
        );
      } else {
        const z0 = -1.5 + t0 * 23.5;
        const z1 = -1.5 + t1 * 23.5;
        const y0 = getSeabedY(22.0, z0);
        const y1 = getSeabedY(22.0, z1);
        positions.push(
          22.0, -3.15, z1, 22.0, -3.15, z0, 22.0, y0, z0,
          22.0, -3.15, z1, 22.0, y0, z0, 22.0, y1, z1
        );
      }
    }
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    return new THREE.Mesh(geom, toonMat(0x586d73, { side: THREE.DoubleSide }));
  };
  group.add(buildSeabedSkirt(true), buildSeabedSkirt(false));

  // Scattered 3D Seabed Pebbles ("碎石海床") across the expanded 23m x 23.5m bay
  const pebbleMats = [toonMat(0x7c979a), toonMat(0x9ab0ad), toonMat(0x637d84)];
  for (let i = 0; i < 240; i += 1) {
    const px = -0.3 + rand() * 21.8;
    const pz = -0.8 + rand() * 22.3;
    const py = getSeabedY(px, pz) + 0.02;
    const r = 0.07 + rand() * 0.19;
    const peb = new THREE.Mesh(
      new THREE.DodecahedronGeometry(r, 0),
      pebbleMats[i % pebbleMats.length]
    );
    peb.scale.set(1.3, 0.52, 1.05);
    peb.position.set(px, py, pz);
    peb.rotation.y = rand() * Math.PI * 2;
    group.add(peb);
  }

  // Sunken Old Tires + Dual Anchor & Chains (both inner bay & outer cutaway!) + Glowing Pearl Clams
  const tireMat = toonMat(0x2a3236);
  [
    [4.65, 9.75, 0.42, 0.32],
    [9.35, 7.85, 0.35, -0.45],
    [7.4, 19.8, 0.48, 0.28],
    [18.8, 16.4, 0.42, -0.36],
  ].forEach(([tx, tz, tr, tilt]) => {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(tr, tr * 0.36, 10, 20), tireMat);
    tire.position.set(tx, getSeabedY(tx, tz) + 0.08, tz);
    tire.rotation.set(Math.PI * 0.5 + tilt, 0.4, 0.18);
    addEdgeInk(tire, 35, PALETTE.inkOutline, 0.4);
    group.add(tire);
  });

  group.add(buildSunkenAnchorAndChain());
  const outerAnchor = buildSunkenAnchorAndChain();
  outerAnchor.position.set(5.6, -0.26, 9.8);
  group.add(outerAnchor);

  const pearlClam = buildPearlClam();
  pearlClam.position.set(2.35, getSeabedY(2.35, 10.15) + 0.05, 10.15);
  pearlClam.rotation.y = 0.65;
  const outerClam = buildPearlClam();
  outerClam.scale.setScalar(1.25);
  outerClam.position.set(4.2, getSeabedY(4.2, 20.1) + 0.06, 20.1);
  outerClam.rotation.y = 0.48;
  group.add(pearlClam, outerClam);

  // Swaying Underwater Seagrass Tufts ("几丛海草") across the expanded bay
  const seagrassBlades = [];
  const grassCols = [0x2f8f7b, 0x3ea88b, 0x2a7a6e];
  const grassCenters = [
    [1.1, 8.9], [3.6, 10.8], [5.8, 8.4], [7.2, 10.9], [9.8, 9.8],
    [10.6, 6.9], [8.6, 6.2], [2.4, 6.4], [6.4, 4.8], [10.4, 3.4], [4.2, 11.2],
    [2.2, 19.6], [6.2, 20.4], [10.8, 20.2], [14.8, 19.8], [18.5, 20.4],
    [20.4, 15.2], [20.2, 10.8], [19.8, 5.8], [14.2, 8.6], [12.4, 15.6], [17.4, 10.2],
  ];
  grassCenters.forEach(([gx, gz], ci) => {
    const baseY = getSeabedY(gx, gz);
    const tuft = new THREE.Group();
    tuft.position.set(gx, baseY, gz);
    const bladeCount = 6 + (ci % 3);
    for (let b = 0; b < bladeCount; b += 1) {
      const bh = 0.6 + rand() * 0.72;
      const blade = new THREE.Mesh(
        new THREE.ConeGeometry(0.052, bh, 4),
        toonMat(grassCols[(ci + b) % grassCols.length])
      );
      blade.scale.set(1.0, 1.0, 0.35);
      const bp = new THREE.Group();
      const ang = (b / bladeCount) * Math.PI * 2;
      bp.position.set(Math.cos(ang) * 0.14, 0, Math.sin(ang) * 0.14);
      blade.position.y = bh * 0.48;
      bp.add(blade);
      tuft.add(bp);
      seagrassBlades.push({ pivot: bp, phase: rand() * Math.PI * 2, speed: 1.5 + rand() * 0.9 });
    }
    group.add(tuft);
  });

  // 46 Animated Underwater Little Fish ("水下小鱼") across the 23m x 23.5m bay
  const fishGroup = new THREE.Group();
  const fishColors = [0xff8b6a, 0xf7d060, 0x8be8f0, 0xf4a8c0, 0xdff6f8];
  const fishAgents = [];
  for (let i = 0; i < 46; i += 1) {
    const f = buildLittleFish(fishColors[i % fishColors.length]);
    if (i >= 22) f.scale.setScalar(1.18);
    const cx = 1.6 + rand() * 18.2;
    const cz = 1.6 + rand() * 18.4;
    const cy = -0.68 - rand() * 1.45;
    fishGroup.add(f);
    fishAgents.push({
      mesh: f,
      cx,
      cy,
      cz,
      rx: 0.75 + rand() * 1.85,
      rz: 0.75 + rand() * 1.85,
      speed: (0.52 + rand() * 0.55) * (i % 2 === 0 ? 1 : -1),
      phase: rand() * Math.PI * 2,
    });
  }
  const fishHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(21.5, 2.3, 21.5),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  fishHitbox.position.set(10.5, -1.35, 10.5);
  fishGroup.add(fishHitbox);
  tagInteractive(fishGroup, "underwater-fish", "水下鱼群", { accentColor: 0x7be8e2 });
  group.add(fishGroup);

  // Translucent Sea-Glass Water Cutaway Side Walls on outer Z=+22 and X=+22
  const seaGlassCutawayMat = new THREE.MeshPhysicalMaterial({
    color: 0x45bab5,
    transparent: true,
    opacity: 0.31,
    roughness: 0.06,
    metalness: 0.02,
    transmission: 0.0,
    clearcoat: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const buildWaterCutawayPane = (alongX) => {
    const segs = 40;
    const geom = new THREE.BufferGeometry();
    const positions = [];
    for (let i = 0; i < segs; i += 1) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      if (alongX) {
        const x0 = -1.0 + t0 * 23.0;
        const x1 = -1.0 + t1 * 23.0;
        const y0 = getSeabedY(x0, 22.0);
        const y1 = getSeabedY(x1, 22.0);
        positions.push(
          x0, y0, 22.0, x1, y1, 22.0, x1, 0.0, 22.0,
          x0, y0, 22.0, x1, 0.0, 22.0, x0, 0.0, 22.0
        );
      } else {
        const z0 = -1.5 + t0 * 23.5;
        const z1 = -1.5 + t1 * 23.5;
        const y0 = getSeabedY(22.0, z0);
        const y1 = getSeabedY(22.0, z1);
        positions.push(
          22.0, y1, z1, 22.0, y0, z0, 22.0, 0.0, z0,
          22.0, y1, z1, 22.0, 0.0, z0, 22.0, 0.0, z1
        );
      }
    }
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    const pane = new THREE.Mesh(geom, seaGlassCutawayMat);
    pane.raycast = () => {};
    addEdgeInk(pane, 25, 0x2d8d94, 0.55);
    return pane;
  };
  group.add(buildWaterCutawayPane(true), buildWaterCutawayPane(false));

  // Romantic Floral Sea-Stack Islet ("海中樱花花礁小岛") at (15.8, 0.0, 14.2)
  const isletGroup = new THREE.Group();
  isletGroup.position.set(15.8, 0, 14.2);
  const isletRock = new THREE.Mesh(
    new THREE.CylinderGeometry(1.38, 1.85, 4.1, 11),
    toonMat(0x839296)
  );
  isletRock.position.y = -0.82;
  addEdgeInk(isletRock, 26);
  isletGroup.add(isletRock);

  const isletTurf = new THREE.Mesh(
    new THREE.CylinderGeometry(1.32, 1.42, 0.28, 11),
    toonMat(0x72bb7b)
  );
  isletTurf.position.y = 1.28;
  addEdgeInk(isletTurf, 26);
  isletGroup.add(isletTurf);

  // Blooming Pink Sakura Tree on the Sea-Stack Islet
  const isletSakura = buildAnimeTree(0xf9aec6, 1.55);
  isletSakura.position.set(-0.18, 1.38, -0.12);
  isletGroup.add(isletSakura);

  // Traditional Japanese Stone Lantern ("石灯笼") glowing warmly on the islet
  const lanternBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.45, 6), stoneTrimMat);
  lanternBase.position.set(0.62, 1.62, 0.35);
  const lanternBox = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), emissiveMat(0xffe194, 1.25));
  lanternBox.position.set(0.62, 1.94, 0.35);
  const lanternCap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.18, 6), toonMat(0x6c7c82));
  lanternCap.position.set(0.62, 2.14, 0.35);
  addEdgeInk(lanternCap, 25);
  isletGroup.add(lanternBase, lanternBox, lanternCap);

  // Lush Hydrangea & Rose blooms crowning the sea-stack islet
  [
    [-0.75, 1.48, 0.55, 0x89c8f5],
    [0.15, 1.48, 0.85, 0xf79cb6],
    [0.82, 1.46, -0.45, 0xc7b4f0],
    [-0.55, 1.48, -0.78, 0xff9a8a],
    [0.35, 1.48, -0.82, 0xf8db68],
  ].forEach(([hx, hy, hz, hcol]) => {
    const hb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), toonMat(hcol));
    hb.position.set(hx, hy, hz);
    isletGroup.add(hb);
  });
  group.add(isletGroup);

  // 4. Short Breakwater ("短防波堤"), Tetrapods ("消波块") & Red-White Lighthouse ("红白灯塔")
  const bwArm = new THREE.Mesh(new THREE.BoxGeometry(1.55, 3.65, 5.5), masonryMat);
  bwArm.position.set(8.8, -0.775, 1.25);
  addEdgeInk(bwArm, 25);
  group.add(bwArm);

  const bwCap = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.08, 5.55), pierDeckMat);
  bwCap.position.set(8.8, 1.05, 1.25);
  addEdgeInk(bwCap, 25);
  group.add(bwCap);

  const bwRoundHead = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.12, 3.68, 18),
    masonryMat
  );
  bwRoundHead.position.set(8.8, -0.78, 3.55);
  addEdgeInk(bwRoundHead, 28);
  group.add(bwRoundHead);

  const lighthouse = buildRedWhiteLighthouse();
  group.add(lighthouse);

  // 20 Grey-White Tetrapods ("灰白消波块 テトラポッド") around Breakwater, Sea-Stack Islet & Outer (+22,+22) Corner
  const podSpots = [
    [9.95, 0.05, 1.85, 0.95], [10.65, -0.08, 2.45, 1.0], [9.85, 0.12, 3.15, 0.92],
    [10.85, -0.12, 3.75, 1.02], [9.75, 0.08, 4.55, 0.96], [10.55, -0.05, 4.95, 0.94],
    [9.35, -0.06, 5.15, 0.9], [11.25, -0.18, 2.95, 0.95], [11.15, -0.15, 4.45, 0.9],
    [17.45, -0.08, 13.85, 0.95], [17.35, -0.12, 15.05, 0.98], [16.55, -0.06, 15.85, 0.92],
    [19.85, -0.08, 19.95, 1.04], [20.75, -0.04, 20.35, 1.08], [20.15, -0.12, 21.05, 0.96],
    [21.05, 0.06, 19.55, 0.98], [19.45, -0.14, 20.85, 0.92], [20.95, -0.1, 21.15, 1.0],
  ];
  const podMats = [toonMat(0xdce2e3), toonMat(0xcbd4d6)];
  const foamRings = [];
  const foamMat = new THREE.MeshBasicMaterial({
    color: 0xf8ffff,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  podSpots.forEach(([px, py, pz, sc], idx) => {
    const pod = buildTetrapod(sc, podMats[idx % 2]);
    pod.position.set(px, py, pz);
    pod.rotation.set(rand() * 1.2, rand() * Math.PI * 2, rand() * 1.2);
    group.add(pod);

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.56, 18), foamMat.clone());
    ring.rotation.x = -Math.PI * 0.5;
    ring.position.set(px, 0.025, pz);
    ring.raycast = () => {};
    group.add(ring);
    foamRings.push({ mesh: ring, phase: idx * 0.7 });
  });

  // 5. Seaside Rose-Parterre Courtyard & Kamakura Tram-Crossing Plaza (keeps Z = -12.85 tram 100% unobstructed!)
  const hillGroup = new THREE.Group();
  const gardenTurfMat = toonMat(0x88cf7e);
  const gardenCurbMat = toonMat(0xe8e2d5);

  // Lush lawn & flower-bed parterres flanking the stepping-stone path to 星語花湾駅 (X = -6.5)
  [
    { x: -9.35, z: -8.45, w: 4.3, d: 5.9 },
    { x: -4.45, z: -8.45, w: 3.1, d: 5.9 },
  ].forEach((bed) => {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(bed.w + 0.18, 0.12, bed.d + 0.18), gardenCurbMat);
    curb.position.set(bed.x, 1.21, bed.z);
    addEdgeInk(curb, 26);
    const turf = new THREE.Mesh(new THREE.BoxGeometry(bed.w, 0.15, bed.d), gardenTurfMat);
    turf.position.set(bed.x, 1.23, bed.z);
    hillGroup.add(curb, turf);
  });

  // Stepping-stone footpath leading north from Villa courtyard (Z = -5.4) to Tram Station (X = -6.5, Z = -11.8)
  for (let s = 0; s < 11; s += 1) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.05, 10), gardenCurbMat);
    st.scale.set(1.25, 1, 0.82);
    st.position.set(-6.5 + Math.sin(s * 0.6) * 0.08, 1.18, -5.6 - s * 0.6);
    hillGroup.add(st);
  }

  // Romantic circular Cream-Stone Rose Fountain Parterre at (-9.3, 1.16, -8.4)
  const parterreRing = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.34, 0.28, 20), gardenCurbMat);
  parterreRing.position.set(-9.3, 1.32, -8.4);
  addEdgeInk(parterreRing, 26);
  const parterreSoil = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.31, 20), toonMat(0x6db96c));
  parterreSoil.position.set(-9.3, 1.33, -8.4);
  const birdbathPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.68, 12), gardenCurbMat);
  birdbathPedestal.position.set(-9.3, 1.66, -8.4);
  const birdbathBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.22, 0.16, 16), gardenCurbMat);
  birdbathBowl.position.set(-9.3, 2.02, -8.4);
  const birdbathWater = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.04, 16), toonMat(0x7fd8de));
  birdbathWater.position.set(-9.3, 2.09, -8.4);
  hillGroup.add(parterreRing, parterreSoil, birdbathPedestal, birdbathBowl, birdbathWater);

  // Classic Japanese Yellow-Black Tram Crossing Sign ("踏切警标") at (-5.85, 1.16, -11.65) + Garden Bench
  const xingGroup = new THREE.Group();
  xingGroup.position.set(-5.85, 1.16, -11.65);
  const xingPole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.95, 8), toonMat(0xf4c430));
  xingPole.position.y = 0.975;
  for (let b = 0; b < 4; b += 1) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.18, 8), toonMat(0x252b30));
    band.position.y = 0.32 + b * 0.38;
    xingGroup.add(band);
  }
  [-0.58, 0.58].forEach((rot) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.09, 0.03), toonMat(0xfafaf6));
    bar.position.set(0, 1.76, 0.04);
    bar.rotation.z = rot;
    xingGroup.add(bar);
  });
  [-0.16, 0.16].forEach((lx) => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 8), emissiveMat(0xff5e52, 1.35));
    lamp.position.set(lx, 1.42, 0.06);
    xingGroup.add(lamp);
  });
  xingGroup.add(xingPole);
  hillGroup.add(xingGroup);

  const gBench = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.1, 0.38), toonMat(0xc78f5c));
  gBench.position.set(-4.45, 1.54, -9.8);
  addEdgeInk(gBench, 26);
  hillGroup.add(gBench);

  // Two framing pastel Sakura/Emerald trees on the outer sides (leaving tram view crystal clear)
  [
    [-11.15, 1.28, -6.3, 0xf7acc4, 0.96],
    [-3.15, 1.28, -6.2, 0x6ec07a, 0.92],
  ].forEach(([tx, ty, tz, hex, sc]) => {
    const tr = buildAnimeTree(hex, sc);
    tr.position.set(tx, ty, tz);
    hillGroup.add(tr);
  });

  // Plump Pastel Hydrangea & Rose Clusters around the fountain parterre & path
  const hydraCols = [0x82c6f5, 0xc7b6ea, 0xf6a2bc, 0xfad65a];
  for (let i = 0; i < 18; i += 1) {
    const a = (i / 18) * Math.PI * 2;
    const bush = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.19 + (i % 3) * 0.04, 1),
      toonMat(hydraCols[i % 4])
    );
    if (i < 10) {
      bush.position.set(-9.3 + Math.cos(a * 1.8) * 0.82, 1.54, -8.4 + Math.sin(a * 1.8) * 0.82);
    } else {
      bush.position.set(-4.45 + ((i % 2) - 0.5) * 1.4, 1.38, -6.2 - (i - 10) * 0.62);
    }
    hillGroup.add(bush);
  }
  group.add(hillGroup);

  enableShadows(group);

  // Animation & Interaction State
  let fishBurstTimer = 0;
  let manualLighthouseTimer = 0;

  function burstFish() {
    fishBurstTimer = 2.6;
  }

  function flashLighthouse(forceOn = true) {
    manualLighthouseTimer = forceOn ? 8.5 : 0;
  }

  function isLighthouseLit() {
    return manualLighthouseTimer > 0 || (lighthouse.userData.beamMat?.opacity || 0) > 0.08;
  }

  function update(elapsed, dt) {
    if (fishBurstTimer > 0) fishBurstTimer = Math.max(0, fishBurstTimer - dt);
    if (manualLighthouseTimer > 0) manualLighthouseTimer = Math.max(0, manualLighthouseTimer - dt);

    // Sway coastal kelp & underwater seagrass
    kelpFronds.forEach((k) => {
      k.pivot.rotation.z = Math.sin(elapsed * k.speed + k.phase) * 0.16;
    });
    seagrassBlades.forEach((g) => {
      g.pivot.rotation.z = Math.sin(elapsed * g.speed + g.phase) * 0.18;
      g.pivot.rotation.x = Math.cos(elapsed * g.speed * 0.8 + g.phase) * 0.1;
    });

    // Swim underwater fish (speed up playfully when burstFish() is triggered!)
    const speedMult = fishBurstTimer > 0 ? 3.8 : 1.0;
    fishAgents.forEach((fa) => {
      fa.phase += dt * fa.speed * speedMult;
      const nx = fa.cx + Math.cos(fa.phase) * fa.rx;
      const nz = fa.cz + Math.sin(fa.phase) * fa.rz;
      const ny = fa.cy + Math.sin(fa.phase * 2.0) * 0.08;
      const dx = -Math.sin(fa.phase) * fa.rx * Math.sign(fa.speed);
      const dz = Math.cos(fa.phase) * fa.rz * Math.sign(fa.speed);
      fa.mesh.position.set(nx, ny, nz);
      fa.mesh.rotation.y = Math.atan2(-dz, dx);
      if (fa.mesh.userData.tailPivot) {
        fa.mesh.userData.tailPivot.rotation.y =
          Math.sin(elapsed * (fishBurstTimer > 0 ? 22 : 9.5) + fa.phase) * 0.42;
      }
    });

    // Surge cel-shaded seafoam rings around tetrapods
    foamRings.forEach((fr) => {
      const s = 0.88 + Math.sin(elapsed * 1.9 + fr.phase) * 0.18;
      fr.mesh.scale.setScalar(s);
      fr.mesh.material.opacity = 0.42 + Math.sin(elapsed * 1.9 + fr.phase) * 0.24;
    });

    // Lighthouse: rare daytime flash every ~38s for 4.5s OR manual click glow
    const cycle = elapsed % 38.0;
    const autoLit = cycle > 28.0 && cycle < 32.5;
    const targetBeam = manualLighthouseTimer > 0 || autoLit ? 0.085 : 0.0;
    const beamMat = lighthouse.userData.beamMat;
    if (beamMat) {
      beamMat.opacity += (targetBeam - beamMat.opacity) * Math.min(1, dt * 4.0);
    }
    if (lighthouse.userData.beamRotor) {
      lighthouse.userData.beamRotor.rotation.y = elapsed * 1.35;
    }
    if (lighthouse.userData.fresnelCore) {
      lighthouse.userData.fresnelCore.material.emissiveIntensity =
        beamMat && beamMat.opacity > 0.03 ? 1.85 : 0.55;
    }
  }

  return {
    group,
    update,
    burstFish,
    flashLighthouse,
    isLighthouseLit,
    anchors: {
      bollards: bollardAnchors,
      puddles: puddleSpecs,
      lighthouseTop: { x: 8.8, y: 4.45, z: 3.5 },
    },
  };
}
