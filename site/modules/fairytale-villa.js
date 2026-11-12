// Fairytale 2BR-1LR Harbor Villa ("童话两室一厅海湾小屋")
// Spatial footprint: X in [-11.1, -3.6], Z in [+0.1, +7.6], base pier Y = +1.15

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

function makeBox(w, h, d, mat, x = 0, y = 0, z = 0, ink = false) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (ink) addEdgeInk(m, 30, PALETTE.inkOutline, typeof ink === "number" ? ink : 0.42);
  return m;
}

function makeCyl(rt, rb, h, segs, mat, x = 0, y = 0, z = 0, ink = false) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segs), mat);
  m.position.set(x, y, z);
  if (ink) addEdgeInk(m, 34, PALETTE.inkOutline, typeof ink === "number" ? ink : 0.36);
  return m;
}

function createHeartExtrude(scale = 1, depth = 0.03) {
  const s = scale;
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.45 * s);
  shape.bezierCurveTo(-0.55 * s, -0.05 * s, -0.62 * s, 0.42 * s, -0.28 * s, 0.52 * s);
  shape.bezierCurveTo(-0.08 * s, 0.58 * s, 0, 0.40 * s, 0, 0.28 * s);
  shape.bezierCurveTo(0, 0.40 * s, 0.08 * s, 0.58 * s, 0.28 * s, 0.52 * s);
  shape.bezierCurveTo(0.62 * s, 0.42 * s, 0.55 * s, -0.05 * s, 0, -0.45 * s);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.012 * s,
    bevelThickness: 0.012 * s,
  });
  geo.center();
  return geo;
}

function buildWallPanel(axis, length, height, thickness, openings, mat) {
  const wall = new THREE.Group();
  const raw = [-length * 0.5, length * 0.5];
  for (const op of openings) raw.push(op.u0, op.u1);
  raw.sort((a, b) => a - b);
  const breaks = [raw[0]];
  for (let i = 1; i < raw.length; i += 1) {
    if (Math.abs(raw[i] - breaks[breaks.length - 1]) > 1e-4) breaks.push(raw[i]);
  }
  const pushSeg = (uMid, segW, vBot, segH) => {
    if (segW <= 0.004 || segH <= 0.004) return;
    const w = axis === "x" ? segW : thickness;
    const d = axis === "x" ? thickness : segW;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, segH, d), mat);
    mesh.position.set(axis === "x" ? uMid : 0, vBot + segH * 0.5, axis === "z" ? uMid : 0);
    wall.add(mesh);
  };
  for (let i = 0; i < breaks.length - 1; i += 1) {
    const ua = breaks[i];
    const ub = breaks[i + 1];
    const uc = (ua + ub) * 0.5;
    const sw = ub - ua;
    const op = openings.find((o) => o.u0 <= uc + 1e-4 && uc - 1e-4 <= o.u1);
    if (!op) {
      pushSeg(uc, sw, 0, height);
    } else {
      pushSeg(uc, sw, 0, op.v0);
      pushSeg(uc, sw, op.v1, height - op.v1);
    }
  }
  return wall;
}

function buildMullionedWindow(width, height, cols, rows, opts = {}) {
  const g = new THREE.Group();
  const frameT = 0.055;
  const depth = opts.depth || 0.16;
  const frameMat = toonMat(opts.frameColor || PALETTE.villaTrimMint);
  const woodMat = toonMat(PALETTE.villaWood);
  const paneMat = glassMat({ opacity: 0.23, color: 0xdff6f8 });

  g.add(makeBox(width + 0.08, frameT, depth + 0.04, frameMat, 0, height * 0.5 - frameT * 0.5, 0, 0.38));
  g.add(makeBox(width + 0.14, 0.065, depth + 0.10, woodMat, 0, -height * 0.5 + 0.02, 0.02, 0.42));
  g.add(makeBox(frameT, height, depth, frameMat, -width * 0.5 + frameT * 0.5, 0, 0, 0.35));
  g.add(makeBox(frameT, height, depth, frameMat, width * 0.5 - frameT * 0.5, 0, 0, 0.35));

  const glass = new THREE.Mesh(new THREE.PlaneGeometry(width - frameT * 1.4, height - frameT * 1.4), paneMat);
  g.add(glass);

  const mullionMat = toonMat(0xfdfaf2);
  for (let c = 1; c < cols; c += 1) {
    const x = -width * 0.5 + (width * c) / cols;
    g.add(makeBox(0.024, height - frameT, 0.036, mullionMat, x, 0, 0));
  }
  for (let r = 1; r < rows; r += 1) {
    const y = -height * 0.5 + (height * r) / rows;
    g.add(makeBox(width - frameT, 0.024, 0.036, mullionMat, 0, y, 0));
  }
  if (opts.shutters) {
    const sw = Math.min(0.28, width * 0.24);
    const shMat = toonMat(opts.shutterColor || PALETTE.villaTrimMint);
    const sL = makeBox(sw, height - 0.06, 0.035, shMat, -width * 0.5 - sw * 0.5 - 0.02, 0, depth * 0.45, 0.38);
    const sR = makeBox(sw, height - 0.06, 0.035, shMat, width * 0.5 + sw * 0.5 + 0.02, 0, depth * 0.45, 0.38);
    g.add(sL, sR);
  }
  if (opts.flowerBox) {
    const fb = new THREE.Group();
    fb.add(makeBox(width + 0.04, 0.16, 0.20, woodMat, 0, -height * 0.5 - 0.09, depth * 0.5 + 0.08, 0.42));
    const leafMat = toonMat(0x6eb489);
    const colors = [PALETTE.pastelPink, PALETTE.pastelButter, PALETTE.pastelLavender, PALETTE.villaRoofCoral];
    const count = Math.max(4, Math.floor(width * 5));
    for (let i = 0; i < count; i += 1) {
      const fx = -width * 0.44 + (width * 0.88 * i) / (count - 1);
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), leafMat);
      bush.position.set(fx, -height * 0.5 + 0.01, depth * 0.5 + 0.09);
      fb.add(bush);
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 6), toonMat(colors[i % colors.length]));
      bloom.position.set(fx + ((i % 2) - 0.5) * 0.04, -height * 0.5 + 0.075, depth * 0.5 + 0.12);
      fb.add(bloom);
    }
    g.add(fb);
  }
  return g;
}

function createVillaTextures() {
  const shingleTex = makeCanvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#e38274";
    ctx.fillRect(0, 0, w, h);
    const rows = 8;
    const cols = 8;
    const rh = h / rows;
    const cw = w / cols;
    const shades = ["#ea9285", "#e28173", "#eb9b8c", "#dc796b", "#f0a596"];
    for (let r = rows; r >= -1; r -= 1) {
      const y = r * rh;
      const off = (r % 2) * (cw * 0.5);
      for (let c = -1; c <= cols + 1; c += 1) {
        const cx = c * cw + off;
        ctx.fillStyle = shades[(Math.abs(r * 5 + c * 3)) % shades.length];
        ctx.beginPath();
        ctx.moveTo(cx - cw * 0.5, y - rh);
        ctx.lineTo(cx + cw * 0.5, y - rh);
        ctx.lineTo(cx + cw * 0.5, y);
        ctx.arc(cx, y, cw * 0.5, 0, Math.PI, false);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(104, 52, 48, 0.42)";
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
    }
  }, { repeatX: 5, repeatY: 3.5 });

  const cobbleTex = makeCanvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#adbcc0";
    ctx.fillRect(0, 0, w, h);
    const rng = mulberry32(8801);
    const tones = ["#cfd9dc", "#c3cfd3", "#d8dedb", "#b9c7cb", "#d6d5cc"];
    for (let y = 8; y < h; y += 22) {
      const shift = ((y / 22) % 2) * 14;
      for (let x = 6; x < w; x += 28) {
        const rx = x + shift + (rng() - 0.5) * 4;
        const ry = y + (rng() - 0.5) * 3;
        ctx.fillStyle = tones[Math.floor(rng() * tones.length)];
        ctx.beginPath();
        ctx.ellipse(rx % w, ry, 11, 8.5, (rng() - 0.5) * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(75, 95, 102, 0.32)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
  }, { repeatX: 5, repeatY: 5 });

  const oakFloorTex = makeCanvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#c79463";
    ctx.fillRect(0, 0, w, h);
    const tones = ["#cfa070", "#be8a58", "#d6aa7c", "#b78252"];
    const pw = 32;
    const ph = 16;
    for (let y = 0; y < h; y += ph) {
      for (let x = 0; x < w; x += pw) {
        const idx = ((x / pw) + (y / ph)) % tones.length;
        ctx.fillStyle = tones[idx];
        ctx.fillRect(x + 1, y + 1, pw - 2, ph - 2);
        ctx.strokeStyle = "rgba(92, 58, 30, 0.28)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1);
      }
    }
  }, { repeatX: 6, repeatY: 6 });

  const lighthouseTex = makeCanvasTex(192, 144, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h * 0.68);
    grad.addColorStop(0, "#97d2ec");
    grad.addColorStop(1, "#fbf2d8");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255, 195, 165, 0.65)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.72, 68, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.fillStyle = "#4eb6b2";
    ctx.fillRect(0, h * 0.66, w, h * 0.34);
    ctx.fillStyle = "#70a87f";
    ctx.beginPath();
    ctx.moveTo(w * 0.55, h * 0.68);
    ctx.quadraticCurveTo(w * 0.78, h * 0.52, w, h * 0.68);
    ctx.fill();
    ctx.fillStyle = "#fdf9f1";
    ctx.fillRect(w * 0.73, h * 0.28, 16, 44);
    ctx.fillStyle = "#e78b7e";
    ctx.fillRect(w * 0.73, h * 0.38, 16, 9);
    ctx.beginPath();
    ctx.moveTo(w * 0.70, h * 0.28);
    ctx.lineTo(w * 0.85, h * 0.28);
    ctx.lineTo(w * 0.775, h * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff199";
    ctx.beginPath();
    ctx.arc(w * 0.24, h * 0.24, 13, 0, Math.PI * 2);
    ctx.fill();
  });

  const coupleArtTex = makeCanvasTex(160, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#f9d6df");
    g.addColorStop(0.6, "#fdecc8");
    g.addColorStop(1, "#9cd6cb");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f4a8b6";
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.42, 28, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#3f5364";
    ctx.fillRect(w * 0.43, h * 0.50, 9, 28);
    ctx.fillStyle = "#e78b7e";
    ctx.beginPath();
    ctx.moveTo(w * 0.53, h * 0.50);
    ctx.lineTo(w * 0.63, h * 0.78);
    ctx.lineTo(w * 0.49, h * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#2b4353";
    ctx.beginPath();
    ctx.arc(w * 0.47, h * 0.45, 5.5, 0, Math.PI * 2);
    ctx.arc(w * 0.56, h * 0.46, 5.2, 0, Math.PI * 2);
    ctx.fill();
  });

  return { shingleTex, cobbleTex, oakFloorTex, lighthouseTex, coupleArtTex };
}

function buildGardenAndMailbox(group, tex, rng) {
  const garden = new THREE.Group();
  const plinthMat = wetSurfaceMat(0xd6dfe1, { map: tex.cobbleTex, roughness: 0.32 });
  const curbMat = toonMat(PALETTE.concreteSide);
  const soilMat = toonMat(0x6e5340);
  const leafMat = toonMat(0x63ae82);
  const darkLeafMat = toonMat(0x4b8f69);

  // Main cobblestone terrace plinth: X in [-11.06, -3.76], Z in [0.14, 7.56], Y = 1.15 -> 1.32
  const slab = makeBox(7.30, 0.17, 7.42, plinthMat, -7.41, 1.235, 3.85, 0.35);
  garden.add(slab);

  // Perimeter stone curbing & harbor welcome step (X up to -3.60)
  garden.add(makeBox(7.36, 0.19, 0.12, curbMat, -7.41, 1.245, 0.16, 0.38));
  garden.add(makeBox(7.36, 0.19, 0.12, curbMat, -7.41, 1.245, 7.54, 0.38));
  garden.add(makeBox(0.12, 0.19, 7.46, curbMat, -11.04, 1.245, 3.85, 0.38));
  garden.add(makeBox(0.22, 0.10, 1.36, curbMat, -3.68, 1.20, 3.80, 0.42));

  // Stepping flagstones from welcome step to front French doors
  for (let i = 0; i < 3; i += 1) {
    const stone = makeCyl(0.24, 0.26, 0.025, 8, toonMat(0xe8e4d8), -3.86 - i * 0.19, 1.332, 3.80 + (i % 2 - 0.5) * 0.08, 0.3);
    stone.scale.set(0.72, 1, 1.18);
    garden.add(stone);
  }

  // Fairytale flowerbeds framing front (+X), north (-Z) and south (+Z) terrace
  const beds = [
    { x: -4.02, z: 1.82, w: 0.42, d: 2.24 },
    { x: -4.02, z: 5.78, w: 0.42, d: 2.24 },
    { x: -7.50, z: 7.32, w: 5.80, d: 0.32 },
    { x: -7.50, z: 0.34, w: 5.80, d: 0.28 },
  ];
  const flowerColors = [
    PALETTE.pastelPink,
    PALETTE.pastelButter,
    PALETTE.pastelLavender,
    PALETTE.pastelSky,
    PALETTE.villaRoofCoral,
  ];
  for (const b of beds) {
    garden.add(makeBox(b.w + 0.06, 0.14, b.d + 0.06, toonMat(PALETTE.villaTrimMint), b.x, 1.39, b.z, 0.36));
    garden.add(makeBox(b.w - 0.02, 0.15, b.d - 0.02, soilMat, b.x, 1.395, b.z));
    const area = b.w * b.d;
    const count = Math.max(6, Math.floor(area * 11));
    for (let i = 0; i < count; i += 1) {
      const fx = b.x + (rng() - 0.5) * (b.w - 0.12);
      const fz = b.z + (rng() - 0.5) * (b.d - 0.12);
      const r = 0.08 + rng() * 0.055;
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), i % 2 === 0 ? leafMat : darkLeafMat);
      tuft.position.set(fx, 1.48 + r * 0.35, fz);
      garden.add(tuft);
      const petal = new THREE.Mesh(
        new THREE.SphereGeometry(0.042 + rng() * 0.02, 7, 6),
        toonMat(flowerColors[Math.floor(rng() * flowerColors.length)])
      );
      petal.position.set(fx + (rng() - 0.5) * 0.04, 1.52 + r * 0.75, fz + (rng() - 0.5) * 0.04);
      garden.add(petal);
    }
  }
  group.add(garden);

  // Interactive Rose Heart Mailbox at exact (-3.65, 1.15, 2.25)
  const mailbox = new THREE.Group();
  mailbox.position.set(-3.65, 1.15, 2.25);
  const postMat = toonMat(PALETTE.villaCream);
  const mintMat = toonMat(PALETTE.villaTrimMint);
  const coralMat = toonMat(PALETTE.villaRoofCoral);
  const brassMat = toonMat(PALETTE.brassGold);

  mailbox.add(makeCyl(0.13, 0.16, 0.16, 10, mintMat, 0, 0.08, 0, 0.4));
  mailbox.add(makeBox(0.095, 0.84, 0.095, postMat, 0, 0.54, 0, 0.42));
  mailbox.add(makeBox(0.24, 0.045, 0.16, mintMat, 0.02, 0.94, 0, 0.4));
  const corbel = makeBox(0.14, 0.035, 0.04, mintMat, 0.07, 0.86, 0, 0.35);
  corbel.rotation.z = 0.58;
  mailbox.add(corbel);

  // Arched mailbox body facing +X
  const boxBody = new THREE.Group();
  boxBody.position.set(0.02, 1.03, 0);
  boxBody.add(makeBox(0.36, 0.14, 0.22, coralMat, 0, 0, 0, 0.42));
  const archTop = makeCyl(0.11, 0.11, 0.36, 12, coralMat, 0, 0.07, 0, 0.36);
  archTop.rotation.z = Math.PI * 0.5;
  boxBody.add(archTop);
  boxBody.add(makeBox(0.02, 0.032, 0.14, brassMat, 0.185, 0.05, 0, 0.4));
  // Dry cream love postcard corner peeking from brass slot
  const cardPeek = makeBox(0.045, 0.008, 0.09, toonMat(0xfffaf0), 0.198, 0.048, 0.01, 0.35);
  cardPeek.rotation.z = -0.14;
  boxBody.add(cardPeek);

  // Embossed rose hearts on front (+X) and sides
  const heartGeo = createHeartExtrude(0.11, 0.018);
  const frontHeart = new THREE.Mesh(heartGeo, toonMat(PALETTE.pastelPink));
  frontHeart.rotation.y = Math.PI * 0.5;
  frontHeart.position.set(0.19, -0.01, 0);
  boxBody.add(frontHeart);

  // Pivoting heart-tipped mail flag
  const mailboxFlag = new THREE.Group();
  mailboxFlag.position.set(0.06, 0.03, 0.125);
  mailboxFlag.add(makeBox(0.022, 0.18, 0.012, brassMat, 0, 0.08, 0));
  const flagHeart = new THREE.Mesh(createHeartExtrude(0.085, 0.014), toonMat(0xe05268));
  flagHeart.position.set(0, 0.18, 0);
  mailboxFlag.add(flagHeart);
  boxBody.add(mailboxFlag);
  mailbox.add(boxBody);

  // Climbing rose vine spiraling up the post
  for (let i = 0; i < 9; i += 1) {
    const ang = i * 0.85;
    const vy = 0.18 + i * 0.082;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.036, 6, 5), leafMat);
    leaf.scale.set(1.3, 0.6, 0.9);
    leaf.position.set(Math.cos(ang) * 0.068, vy, Math.sin(ang) * 0.068);
    mailbox.add(leaf);
    if (i % 2 === 1) {
      const rose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 7, 6), toonMat(i % 4 === 1 ? 0xe85d75 : PALETTE.pastelPink));
      rose.position.set(Math.cos(ang + 0.3) * 0.082, vy + 0.02, Math.sin(ang + 0.3) * 0.082);
      mailbox.add(rose);
    }
  }
  tagInteractive(mailbox, "mailbox", "玫瑰爱心信箱", { accentColor: PALETTE.pastelPink });
  group.add(mailbox);
  return { mailbox, mailboxFlag };
}

function buildExteriorShell(group, tex) {
  const shell = new THREE.Group();
  const creamMat = toonMat(PALETTE.villaCream);
  const mintMat = toonMat(PALETTE.villaTrimMint);
  const woodMat = toonMat(PALETTE.villaWood);
  const coralMat = toonMat(PALETTE.villaRoofCoral);

  // Herringbone oak interior floor: X in [-10.66, -4.34], Z in [0.54, 7.06], Y = 1.32 -> 1.35
  const floorMat = toonMat(0xffffff, { map: tex.oakFloorTex });
  shell.add(makeBox(6.32, 0.034, 6.52, floorMat, -7.50, 1.335, 3.80));

  // Villa walls: X in [-10.7, -4.3] (w=6.4), Z in [+0.5, +7.1] (d=6.6), Y = 1.33 -> 3.65 (h=2.32)
  const wallH = 2.32;
  const wallT = 0.14;

  // East (+X = -4.37) harbor-facing wall: kitchenette window, French doors, bay window cutout
  const eastWall = buildWallPanel("z", 6.60, wallH, wallT, [
    { u0: -2.65, u1: -1.35, v0: 0.59, v1: 1.75 },
    { u0: -0.58, u1: 0.58, v0: 0.02, v1: 1.72 },
    { u0: 1.15, u1: 2.65, v0: 0.45, v1: 1.79 },
  ], creamMat);
  eastWall.position.set(-4.37, 1.33, 3.80);
  shell.add(eastWall);

  // West (-X = -10.63) back wall: study window & master bedroom window
  const westWall = buildWallPanel("z", 6.60, wallH, wallT, [
    { u0: -2.25, u1: -1.05, v0: 0.57, v1: 1.72 },
    { u0: 0.85, u1: 2.05, v0: 0.57, v1: 1.72 },
  ], creamMat);
  westWall.position.set(-10.63, 1.33, 3.80);
  shell.add(westWall);

  // South (+Z = 7.03) side wall: master bedroom window & living hearth window
  const southWall = buildWallPanel("x", 6.12, wallH, wallT, [
    { u0: -2.35, u1: -0.85, v0: 0.52, v1: 1.75 },
    { u0: 0.85, u1: 2.05, v0: 0.52, v1: 1.75 },
  ], creamMat);
  southWall.position.set(-7.50, 1.33, 7.03);
  shell.add(southWall);

  // North (-Z = 0.57) side wall: wide sunlit study window
  const northWall = buildWallPanel("x", 6.12, wallH, wallT, [
    { u0: -2.35, u1: -0.75, v0: 0.48, v1: 1.77 },
  ], creamMat);
  northWall.position.set(-7.50, 1.33, 0.57);
  shell.add(northWall);

  // Corner mint pilasters & top cornice trim
  for (const cx of [-10.63, -4.37]) {
    for (const cz of [0.57, 7.03]) {
      shell.add(makeBox(0.18, wallH + 0.02, 0.18, mintMat, cx, 1.33 + wallH * 0.5, cz, 0.42));
    }
  }
  shell.add(makeBox(6.48, 0.08, 0.16, mintMat, -7.50, 3.61, 0.54, 0.36));
  shell.add(makeBox(6.48, 0.08, 0.16, mintMat, -7.50, 3.61, 7.06, 0.36));
  shell.add(makeBox(0.16, 0.08, 6.64, mintMat, -4.34, 3.61, 3.80, 0.36));
  shell.add(makeBox(0.16, 0.08, 6.64, mintMat, -10.66, 3.61, 3.80, 0.36));

  // Mount mullioned windows with clear glassMat
  const winKitchen = buildMullionedWindow(1.30, 1.16, 3, 2, { shutters: true, flowerBox: true });
  winKitchen.rotation.y = Math.PI * 0.5;
  winKitchen.position.set(-4.36, 2.50, 1.80);
  shell.add(winKitchen);

  // Projecting Harbor Bay Window (Z in [4.95, 6.45], Y in [1.78, 3.12])
  const bay = new THREE.Group();
  bay.position.set(-4.30, 2.45, 5.70);
  bay.add(makeBox(0.32, 0.08, 1.56, woodMat, 0.14, -0.68, 0, 0.42));
  bay.add(makeBox(0.36, 0.10, 1.62, coralMat, 0.15, 0.70, 0, 0.42));
  const bayFront = buildMullionedWindow(0.98, 1.30, 3, 3, { flowerBox: true });
  bayFront.rotation.y = Math.PI * 0.5;
  bayFront.position.set(0.28, 0, 0);
  bay.add(bayFront);
  for (const sgn of [-1, 1]) {
    const sidePane = buildMullionedWindow(0.38, 1.30, 1, 3, { depth: 0.08 });
    sidePane.rotation.y = Math.PI * 0.5 - sgn * 0.68;
    sidePane.position.set(0.14, 0, sgn * 0.62);
    bay.add(sidePane);
  }
  shell.add(bay);

  // French Double Entry Doors + Pedimented Canopy + Glowing Brass Lanterns
  const entry = new THREE.Group();
  entry.position.set(-4.34, 1.35, 3.80);
  entry.add(makeBox(0.18, 1.74, 0.08, mintMat, 0, 0.87, -0.58, 0.4));
  entry.add(makeBox(0.18, 1.74, 0.08, mintMat, 0, 0.87, 0.58, 0.4));
  entry.add(makeBox(0.20, 0.09, 1.28, mintMat, 0, 1.72, 0, 0.4));
  for (const sgn of [-1, 1]) {
    const leaf = new THREE.Group();
    leaf.position.set(0.02, 0.84, sgn * 0.54);
    leaf.rotation.y = sgn * -0.18; // slightly welcomingly ajar
    leaf.add(makeBox(0.05, 1.66, 0.52, woodMat, 0, 0.0, -sgn * 0.26, 0.4));
    const dGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.92), glassMat({ opacity: 0.25 }));
    dGlass.rotation.y = Math.PI * 0.5;
    dGlass.position.set(0.028, 0.24, -sgn * 0.26);
    leaf.add(dGlass);
    leaf.add(makeCyl(0.016, 0.016, 0.09, 8, toonMat(PALETTE.brassGold), 0.045, -0.05, -sgn * 0.44));
    entry.add(leaf);
  }
  // Porch awning canopy & lanterns
  entry.add(makeBox(0.52, 0.07, 1.54, coralMat, 0.24, 1.84, 0, 0.42));
  for (const sgn of [-1, 1]) {
    const lantern = new THREE.Group();
    lantern.position.set(0.12, 1.44, sgn * 0.78);
    lantern.add(makeBox(0.10, 0.03, 0.04, toonMat(PALETTE.castIron), -0.03, 0.08, 0));
    lantern.add(makeCyl(0.065, 0.048, 0.14, 6, emissiveMat(0xffdf9a, 1.35), 0.02, 0, 0));
    lantern.add(makeCyl(0.01, 0.08, 0.06, 6, toonMat(PALETTE.castIron), 0.02, 0.09, 0));
    entry.add(lantern);
  }
  shell.add(entry);

  // Side & Back Mullioned Windows
  const winSouthMaster = buildMullionedWindow(1.50, 1.23, 3, 2, { shutters: true, flowerBox: true });
  winSouthMaster.position.set(-9.10, 2.46, 7.04);
  shell.add(winSouthMaster);

  const winSouthLiving = buildMullionedWindow(1.20, 1.23, 2, 2, { shutters: true, flowerBox: true });
  winSouthLiving.position.set(-6.05, 2.46, 7.04);
  shell.add(winSouthLiving);

  const winNorthStudy = buildMullionedWindow(1.60, 1.29, 4, 2, { shutters: true, flowerBox: true });
  winNorthStudy.rotation.y = Math.PI;
  winNorthStudy.position.set(-9.05, 2.45, 0.56);
  shell.add(winNorthStudy);

  for (const wz of [2.15, 5.25]) {
    const wBack = buildMullionedWindow(1.20, 1.15, 2, 2, { shutters: true });
    wBack.rotation.y = -Math.PI * 0.5;
    wBack.position.set(-10.64, 2.48, wz);
    shell.add(wBack);
  }
  group.add(shell);
}

function buildHingedRoof(group, tex) {
  // Hinged Roof Pivot at exact (-10.7, 3.65, 3.8)
  const roofPivot = new THREE.Group();
  roofPivot.position.set(-10.7, 3.65, 3.8);

  const roofCoralMat = toonMat(0xffffff, { map: tex.shingleTex });
  const creamMat = toonMat(PALETTE.villaCream);
  const mintMat = toonMat(PALETTE.villaTrimMint);
  const woodMat = toonMat(PALETTE.villaWood);
  const brickMat = toonMat(PALETTE.rustRed);
  const ironMat = toonMat(PALETTE.castIron);
  const brassMat = toonMat(PALETTE.brassGold);

  // Gable pediments at West (lx=0.07) and East (lx=6.33)
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-3.32, 0);
  gableShape.lineTo(3.32, 0);
  gableShape.lineTo(0, 1.82);
  gableShape.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.14, bevelEnabled: false });
  for (const lx of [0.0, 6.26]) {
    const gMesh = new THREE.Mesh(gableGeo, creamMat);
    gMesh.rotation.y = Math.PI * 0.5;
    gMesh.position.set(lx, 0, 0);
    roofPivot.add(gMesh);
  }
  // Front (+X) half-timber trim & round rose attic window
  roofPivot.add(makeBox(0.05, 1.76, 0.08, woodMat, 6.42, 0.90, 0, 0.36));
  const porthole = makeCyl(0.32, 0.32, 0.08, 18, mintMat, 6.41, 0.88, 0, 0.42);
  porthole.rotation.z = Math.PI * 0.5;
  roofPivot.add(porthole);
  const portGlass = makeCyl(0.25, 0.25, 0.09, 18, glassMat({ opacity: 0.28 }), 6.415, 0.88, 0);
  portGlass.rotation.z = Math.PI * 0.5;
  roofPivot.add(portGlass);

  // Two scalloped shingle slopes (ridge ly=1.84, eaves lz=+-3.66, ly=-0.10)
  const slopeAngle = Math.atan2(1.94, 3.66);
  const slopeLen = Math.hypot(3.66, 1.94);
  for (const sgn of [-1, 1]) {
    const slope = makeBox(7.14, 0.09, slopeLen, roofCoralMat, 3.20, 0.87, sgn * 1.83, 0.42);
    slope.rotation.x = sgn * slopeAngle;
    roofPivot.add(slope);
    // Scalloped mint eaves fascia board
    const fascia = makeBox(7.16, 0.11, 0.05, mintMat, 3.20, -0.10, sgn * 3.65, 0.4);
    roofPivot.add(fascia);
  }
  // Ridge cap beam & exposed interior oak rafters (visible when roof tilts open!)
  roofPivot.add(makeCyl(0.09, 0.09, 7.18, 10, toonMat(PALETTE.villaRoofCoral), 3.20, 1.88, 0, 0.4));
  roofPivot.children[roofPivot.children.length - 1].rotation.z = Math.PI * 0.5;
  for (let rx = 0.65; rx <= 5.85; rx += 1.04) {
    for (const sgn of [-1, 1]) {
      const rafter = makeBox(0.07, 0.08, 3.62, woodMat, rx, 0.86, sgn * 1.65);
      rafter.rotation.x = sgn * slopeAngle;
      roofPivot.add(rafter);
    }
  }

  // South-slope gabled Dormer window (lx=3.55, lz=1.65)
  const dormer = new THREE.Group();
  dormer.position.set(3.55, 0.96, 1.68);
  dormer.add(makeBox(0.96, 0.72, 0.88, creamMat, 0, 0.12, 0.15, 0.4));
  const dWin = buildMullionedWindow(0.68, 0.52, 2, 2, { depth: 0.08 });
  dWin.position.set(0, 0.12, 0.60);
  dormer.add(dWin);
  for (const sgn of [-1, 1]) {
    const dRoof = makeBox(0.66, 0.06, 1.06, toonMat(PALETTE.villaRoofCoral), sgn * 0.28, 0.58, 0.18, 0.4);
    dRoof.rotation.z = -sgn * 0.52;
    dormer.add(dRoof);
  }
  roofPivot.add(dormer);

  // Brick Chimney above living room hearth (lx=4.80, lz=2.15) + clay pots + smoke puffs
  const chimney = new THREE.Group();
  chimney.position.set(4.80, 1.38, 2.18);
  chimney.add(makeBox(0.54, 1.22, 0.54, brickMat, 0, 0, 0, 0.45));
  chimney.add(makeBox(0.64, 0.09, 0.64, creamMat, 0, 0.58, 0, 0.42));
  chimney.add(makeCyl(0.09, 0.11, 0.24, 10, toonMat(0xc97862), -0.11, 0.74, 0, 0.38));
  chimney.add(makeCyl(0.09, 0.11, 0.20, 10, toonMat(0xc97862), 0.12, 0.72, 0, 0.38));
  const smokePuffs = [];
  for (let i = 0; i < 3; i += 1) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.09 + i * 0.025, 8, 7),
      toonMat(0xfbf8f2, { transparent: true, opacity: 0.55, unique: true })
    );
    puff.position.set(-0.11, 0.96 + i * 0.22, 0);
    chimney.add(puff);
    smokePuffs.push(puff);
  }
  roofPivot.add(chimney);

  // Wrought-Iron & Brass Heart Weathervane atop front ridge (lx=5.95, ly=1.92, lz=0)
  const vaneBase = new THREE.Group();
  vaneBase.position.set(5.95, 1.92, 0);
  vaneBase.add(makeCyl(0.022, 0.032, 0.56, 8, ironMat, 0, 0.26, 0));
  vaneBase.add(makeBox(0.36, 0.018, 0.018, ironMat, 0, 0.36, 0));
  vaneBase.add(makeBox(0.018, 0.018, 0.36, ironMat, 0, 0.36, 0));
  const weathervaneRotor = new THREE.Group();
  weathervaneRotor.position.set(0, 0.50, 0);
  weathervaneRotor.add(makeBox(0.48, 0.022, 0.022, brassMat, 0, 0, 0));
  const vaneHeart = new THREE.Mesh(createHeartExtrude(0.14, 0.018), brassMat);
  vaneHeart.position.set(0.24, 0.01, 0);
  weathervaneRotor.add(vaneHeart);
  weathervaneRotor.add(makeBox(0.10, 0.09, 0.014, toonMat(PALETTE.pastelPink), -0.22, 0.01, 0, 0.35));
  vaneBase.add(weathervaneRotor);
  roofPivot.add(vaneBase);

  tagInteractive(roofPivot, "villa-roof", "童话小屋屋顶", { accentColor: PALETTE.villaRoofCoral });
  group.add(roofPivot);
  return { roofPivot, weathervaneRotor, smokePuffs };
}

function buildFramedArt(texMap, w, h, frameMat) {
  const g = new THREE.Group();
  g.add(makeBox(0.035, h + 0.08, w + 0.08, frameMat, 0, 0, 0, 0.4));
  const canvas = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    toonMat(0xffffff, { map: texMap })
  );
  canvas.rotation.y = Math.PI * 0.5;
  canvas.position.x = 0.02;
  g.add(canvas);
  return g;
}

function buildInteriorRooms(group, tex, rng) {
  const rooms = new THREE.Group();
  const y0 = 1.35;
  const creamMat = toonMat(PALETTE.villaCream);
  const mintMat = toonMat(PALETTE.villaTrimMint);
  const woodMat = toonMat(PALETTE.villaWood);
  const darkWoodMat = toonMat(0x845839);
  const coralMat = toonMat(PALETTE.villaRoofCoral);
  const pinkMat = toonMat(PALETTE.pastelPink);
  const butterMat = toonMat(PALETTE.pastelButter);
  const lavMat = toonMat(PALETTE.pastelLavender);
  const brassMat = toonMat(PALETTE.brassGold);
  const ironMat = toonMat(PALETTE.castIron);

  // Dollhouse cutaway partitions (Y = 1.35 -> 3.18, h = 1.83)
  const nsPart = buildWallPanel("z", 6.32, 1.83, 0.10, [
    { u0: -1.45, u1: -0.68, v0: 0, v1: 1.52 }, // doorway to 次卧 (Z in [2.35, 3.12])
    { u0: 0.85, u1: 1.62, v0: 0, v1: 1.52 },   // doorway to 主卧 (Z in [4.65, 5.42])
  ], creamMat);
  nsPart.position.set(-7.55, y0, 3.80);
  rooms.add(nsPart);
  rooms.add(makeBox(0.13, 0.045, 6.32, woodMat, -7.55, y0 + 1.84, 3.80, 0.36));

  const ewPart = makeBox(2.96, 1.83, 0.10, creamMat, -9.08, y0 + 0.915, 3.80);
  rooms.add(ewPart);
  rooms.add(makeBox(2.96, 0.045, 0.13, woodMat, -9.08, y0 + 1.84, 3.80, 0.36));

  // Warm interior PointLights (non-shadow for zero GPU shadow-map overhead)
  const hearthLight = new THREE.PointLight(0xffb46e, 1.35, 6.8, 1.8);
  hearthLight.position.set(-5.85, y0 + 1.05, 5.75);
  rooms.add(hearthLight);

  const studyLight = new THREE.PointLight(0xffe2a8, 1.15, 6.6, 1.8);
  studyLight.position.set(-8.95, y0 + 1.35, 3.60);
  rooms.add(studyLight);

  // ==================== 一厅 (Living, Dining & Kitchenette) ====================
  // Framed lighthouse sunshower painting between bedroom doorways
  const hallArt = buildFramedArt(tex.lighthouseTex, 0.72, 0.54, woodMat);
  hallArt.position.set(-7.48, y0 + 1.18, 3.88);
  rooms.add(hallArt);

  // Cozy Hearth Fireplace (South wall X=-5.90, Z=6.72)
  const hearth = new THREE.Group();
  hearth.position.set(-5.90, y0, 6.72);
  hearth.add(makeBox(1.16, 0.06, 0.56, toonMat(0xcfd4d6), 0, 0.03, -0.04, 0.35));
  hearth.add(makeBox(0.24, 1.05, 0.42, creamMat, -0.42, 0.525, 0, 0.4));
  hearth.add(makeBox(0.24, 1.05, 0.42, creamMat, 0.42, 0.525, 0, 0.4));
  hearth.add(makeBox(1.10, 0.24, 0.44, creamMat, 0, 0.96, 0, 0.4));
  hearth.add(makeBox(1.22, 0.07, 0.50, woodMat, 0, 1.11, -0.02, 0.42));
  hearth.add(makeBox(0.62, 0.78, 0.14, toonMat(PALETTE.rustRed), 0, 0.42, 0.14));
  hearth.add(makeCyl(0.045, 0.045, 0.42, 7, darkWoodMat, 0, 0.11, -0.02));
  hearth.children[hearth.children.length - 1].rotation.z = Math.PI * 0.5;
  const hearthFlame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.30, 7), emissiveMat(0xff8e3c, 1.65));
  hearthFlame.position.set(0, 0.24, -0.01);
  hearth.add(hearthFlame);
  rooms.add(hearth);

  // Woven living rug + Plush Tufted Sofa (X=-6.90, Z=5.55, facing +X)
  const livRug = makeCyl(1.12, 1.12, 0.016, 24, toonMat(0xf7e7cf), -5.95, y0 + 0.01, 5.55, 0.28);
  livRug.scale.set(0.88, 1, 1.08);
  rooms.add(livRug);

  const sofa = new THREE.Group();
  sofa.position.set(-6.92, y0, 5.55);
  sofa.add(makeBox(0.68, 0.28, 1.56, lavMat, 0, 0.20, 0, 0.38));
  sofa.add(makeBox(0.18, 0.62, 1.56, lavMat, -0.26, 0.48, 0, 0.38));
  sofa.add(makeBox(0.66, 0.44, 0.16, lavMat, 0.01, 0.36, -0.74, 0.38));
  sofa.add(makeBox(0.66, 0.44, 0.16, lavMat, 0.01, 0.36, 0.74, 0.38));
  for (const cz of [-0.42, 0, 0.42]) {
    sofa.add(makeBox(0.46, 0.11, 0.46, toonMat(0xd6cbf2), 0.06, 0.37, cz, 0.3));
    sofa.add(makeCyl(0.02, 0.02, 0.02, 6, pinkMat, -0.16, 0.55, cz));
  }
  sofa.add(makeBox(0.16, 0.24, 0.26, pinkMat, 0.02, 0.48, -0.52, 0.32));
  sofa.add(makeBox(0.16, 0.24, 0.26, butterMat, 0.02, 0.48, 0.52, 0.32));
  rooms.add(sofa);

  // Spinning Brass Gramophone on corner mahogany stand (X=-7.06, Z=6.58)
  const gramo = new THREE.Group();
  gramo.position.set(-7.06, y0, 6.58);
  gramo.add(makeCyl(0.24, 0.22, 0.62, 12, darkWoodMat, 0, 0.31, 0, 0.38));
  gramo.add(makeBox(0.34, 0.12, 0.34, woodMat, 0, 0.68, 0, 0.4));
  const gramophoneDisc = new THREE.Group();
  gramophoneDisc.position.set(0, 0.75, 0);
  gramophoneDisc.add(makeCyl(0.13, 0.13, 0.012, 16, ironMat, 0, 0, 0));
  gramophoneDisc.add(makeCyl(0.045, 0.045, 0.015, 12, coralMat, 0, 0.002, 0));
  gramo.add(gramophoneDisc);
  const gramophoneHorn = new THREE.Group();
  gramophoneHorn.position.set(-0.08, 0.78, -0.06);
  gramophoneHorn.add(makeCyl(0.02, 0.025, 0.18, 8, brassMat, 0, 0.08, 0));
  const hornBell = makeCyl(0.16, 0.025, 0.28, 12, brassMat, 0.10, 0.22, -0.06, 0.36);
  hornBell.rotation.z = -0.95;
  hornBell.rotation.y = 0.45;
  gramophoneHorn.add(hornBell);
  gramo.add(gramophoneHorn);
  rooms.add(gramo);

  // Round Oak Table + 2-Tier Strawberry Cake & Tea Set + Spindle Chairs (X=-5.42, Z=5.55)
  const dining = new THREE.Group();
  dining.position.set(-5.42, y0, 5.55);
  dining.add(makeCyl(0.26, 0.30, 0.05, 12, woodMat, 0, 0.025, 0, 0.36));
  dining.add(makeCyl(0.07, 0.09, 0.66, 10, woodMat, 0, 0.35, 0));
  dining.add(makeCyl(0.56, 0.56, 0.045, 20, woodMat, 0, 0.69, 0, 0.4));
  // 2-tier strawberry cream cake on pedestal stand
  dining.add(makeCyl(0.16, 0.08, 0.05, 12, creamMat, -0.06, 0.735, -0.04, 0.3));
  dining.add(makeCyl(0.14, 0.14, 0.10, 14, toonMat(0xfffaf2), -0.06, 0.81, -0.04, 0.32));
  dining.add(makeCyl(0.095, 0.095, 0.085, 12, pinkMat, -0.06, 0.90, -0.04, 0.32));
  for (let i = 0; i < 6; i += 1) {
    const a = (i * Math.PI * 2) / 6;
    const berry = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.038, 6), toonMat(0xd93b4e));
    berry.position.set(-0.06 + Math.cos(a) * 0.065, 0.96, -0.04 + Math.sin(a) * 0.065);
    dining.add(berry);
  }
  // Porcelain mint teapot & two teacups
  dining.add(makeCyl(0.065, 0.055, 0.11, 10, mintMat, 0.18, 0.77, 0.10, 0.35));
  dining.add(makeCyl(0.036, 0.028, 0.045, 10, creamMat, 0.16, 0.735, -0.16, 0.32));
  dining.add(makeCyl(0.036, 0.028, 0.045, 10, creamMat, -0.22, 0.735, 0.18, 0.32));
  for (const cz of [-0.66, 0.66]) {
    const ch = new THREE.Group();
    ch.position.set(0, 0, cz);
    ch.add(makeBox(0.36, 0.04, 0.36, woodMat, 0, 0.42, 0, 0.38));
    ch.add(makeBox(0.34, 0.42, 0.04, woodMat, 0, 0.64, cz > 0 ? 0.16 : -0.16, 0.38));
    for (const lx of [-0.14, 0.14]) {
      for (const lz of [-0.14, 0.14]) ch.add(makeCyl(0.02, 0.018, 0.42, 6, darkWoodMat, lx, 0.21, lz));
    }
    dining.add(ch);
  }
  rooms.add(dining);

  // Retro Mint Fridge + Ceramic Sink Counter + Hanging Copper Pans (North-East kitchenette)
  const fridge = new THREE.Group();
  fridge.position.set(-7.04, y0, 1.12);
  fridge.add(makeBox(0.62, 1.48, 0.60, mintMat, 0, 0.74, 0, 0.42));
  fridge.add(makeBox(0.58, 0.06, 0.56, mintMat, 0, 1.50, 0, 0.35));
  fridge.add(makeBox(0.02, 0.016, 0.58, creamMat, 0.315, 1.04, 0));
  fridge.add(makeBox(0.035, 0.20, 0.025, brassMat, 0.325, 1.22, 0.20));
  fridge.add(makeBox(0.035, 0.32, 0.025, brassMat, 0.325, 0.76, 0.20));
  rooms.add(fridge);

  const counter = new THREE.Group();
  counter.position.set(-5.68, y0, 1.02);
  counter.add(makeBox(1.68, 0.78, 0.58, mintMat, 0, 0.39, 0, 0.4));
  counter.add(makeBox(1.74, 0.05, 0.62, woodMat, 0, 0.805, 0, 0.42));
  // Inset porcelain sink + brass gooseneck faucet + stove & butter kettle
  counter.add(makeBox(0.54, 0.06, 0.40, creamMat, -0.38, 0.815, 0, 0.38));
  counter.add(makeBox(0.44, 0.03, 0.30, toonMat(0xd5eef2), -0.38, 0.835, 0));
  counter.add(makeCyl(0.016, 0.02, 0.22, 8, brassMat, -0.38, 0.94, -0.18));
  counter.add(makeCyl(0.11, 0.11, 0.016, 12, ironMat, 0.36, 0.835, -0.06));
  counter.add(makeCyl(0.08, 0.10, 0.13, 10, butterMat, 0.36, 0.90, -0.06, 0.36));
  rooms.add(counter);

  // Hanging copper pans rack on North wall (Z=0.72)
  const panRack = new THREE.Group();
  panRack.position.set(-5.68, y0 + 1.32, 0.72);
  panRack.add(makeBox(1.12, 0.028, 0.04, ironMat, 0, 0.14, 0));
  const copperMat = toonMat(0xd98258);
  for (let i = 0; i < 3; i += 1) {
    const px = -0.36 + i * 0.36;
    const r = 0.095 + (i % 2) * 0.025;
    panRack.add(makeBox(0.018, 0.16, 0.015, copperMat, px, 0.05, 0.02));
    const pan = makeCyl(r, r, 0.038, 14, copperMat, px, -0.08, 0.03, 0.38);
    pan.rotation.x = Math.PI * 0.5;
    panRack.add(pan);
  }
  rooms.add(panRack);

  // ==================== 主卧 (Cozy Master Bedroom: X in [-10.56,-7.60], Z in [3.85,6.96]) ====================
  rooms.add(makeBox(1.95, 0.016, 2.10, toonMat(0xf7dce2), -9.25, y0 + 0.008, 5.55, 0.28));

  const bed = new THREE.Group();
  bed.position.set(-9.42, y0, 5.55);
  bed.add(makeBox(0.12, 1.08, 1.58, woodMat, -0.98, 0.54, 0, 0.42));
  bed.add(makeBox(1.96, 0.28, 1.52, woodMat, 0, 0.18, 0, 0.4));
  bed.add(makeBox(1.86, 0.20, 1.44, creamMat, 0.02, 0.38, 0, 0.34));
  // Quilted patchwork comforter channels
  const quiltTones = [pinkMat, coralMat, butterMat, pinkMat];
  for (let q = 0; q < 4; q += 1) {
    bed.add(makeBox(0.32, 0.22, 1.48, quiltTones[q], -0.22 + q * 0.34, 0.40, 0, 0.32));
  }
  for (const pz of [-0.38, 0.38]) {
    bed.add(makeBox(0.30, 0.13, 0.54, creamMat, -0.72, 0.53, pz, 0.32));
  }
  const bedHeart = new THREE.Mesh(createHeartExtrude(0.18, 0.05), coralMat);
  bedHeart.rotation.y = Math.PI * 0.5;
  bedHeart.position.set(-0.52, 0.56, 0);
  bed.add(bedHeart);
  rooms.add(bed);

  // Twin Nightstands & Glowing Pleated Lamps
  for (const nz of [4.50, 6.60]) {
    const ns = new THREE.Group();
    ns.position.set(-10.18, y0, nz);
    ns.add(makeBox(0.42, 0.48, 0.42, woodMat, 0, 0.24, 0, 0.4));
    ns.add(makeCyl(0.055, 0.075, 0.14, 10, creamMat, 0, 0.55, 0));
    ns.add(makeCyl(0.08, 0.135, 0.16, 12, emissiveMat(0xffe19c, 1.25), 0, 0.69, 0));
    rooms.add(ns);
  }

  // Oak & Mint Wardrobe (X=-8.75, Z=4.14) + Vanity Table with Arch Mirror & Pouf (X=-8.28, Z=6.62)
  const wardrobe = new THREE.Group();
  wardrobe.position.set(-8.75, y0, 4.14);
  wardrobe.add(makeBox(1.04, 1.56, 0.48, woodMat, 0, 0.78, 0, 0.42));
  wardrobe.add(makeBox(0.46, 1.38, 0.03, mintMat, -0.24, 0.78, 0.245, 0.36));
  wardrobe.add(makeBox(0.46, 1.38, 0.03, mintMat, 0.24, 0.78, 0.245, 0.36));
  rooms.add(wardrobe);

  const vanity = new THREE.Group();
  vanity.position.set(-8.28, y0, 6.62);
  vanity.add(makeBox(0.82, 0.66, 0.40, woodMat, 0, 0.33, 0, 0.4));
  vanity.add(makeBox(0.48, 0.56, 0.04, woodMat, 0, 0.94, 0.16, 0.4));
  vanity.add(makeBox(0.40, 0.48, 0.05, glassMat({ opacity: 0.38, color: 0xe8f8fa }), 0, 0.94, 0.16));
  vanity.add(makeCyl(0.16, 0.15, 0.36, 12, pinkMat, 0, 0.18, -0.42, 0.36));
  rooms.add(vanity);

  const coupleFrame = buildFramedArt(tex.coupleArtTex, 0.76, 0.56, woodMat);
  coupleFrame.position.set(-10.52, y0 + 1.24, 5.55);
  rooms.add(coupleFrame);

  // ==================== 次卧 (Creative Study & Bedroom: X in [-10.56,-7.60], Z in [0.64,3.75]) ====================
  // 40-Book Oak Bookshelf along South study partition (X=-9.65, Z=3.53)
  const shelf = new THREE.Group();
  shelf.position.set(-9.65, y0, 3.53);
  shelf.add(makeBox(1.48, 1.58, 0.32, woodMat, 0, 0.79, 0, 0.42));
  const bookColors = [0xd96b62, 0x5c9ead, 0xe6b85c, 0x88b382, 0x9b84c4, PALETTE.pastelPink, PALETTE.villaTrimMint];
  for (let tier = 0; tier < 4; tier += 1) {
    const sy = 0.12 + tier * 0.36;
    shelf.add(makeBox(1.42, 0.035, 0.30, darkWoodMat, 0, sy, 0));
    let bx = -0.64;
    for (let b = 0; b < 11; b += 1) {
      const bw = 0.038 + rng() * 0.022;
      const bh = 0.21 + rng() * 0.08;
      if (bx + bw > 0.64) break;
      const book = makeBox(bw, bh, 0.21, toonMat(bookColors[(tier * 7 + b) % bookColors.length]), bx + bw * 0.5, sy + 0.02 + bh * 0.5, -0.02, 0.28);
      if (b === 9) book.rotation.z = 0.22;
      shelf.add(book);
      bx += bw + 0.008;
    }
  }
  rooms.add(shelf);

  // Cozy Window Daybed beneath North study window (X=-9.12, Z=1.02)
  const daybed = new THREE.Group();
  daybed.position.set(-9.12, y0, 1.02);
  daybed.add(makeBox(1.82, 0.30, 0.68, woodMat, 0, 0.15, 0, 0.4));
  daybed.add(makeBox(1.74, 0.15, 0.62, mintMat, 0, 0.36, 0, 0.34));
  daybed.add(makeBox(0.56, 0.17, 0.64, butterMat, 0.48, 0.37, 0, 0.32));
  daybed.add(makeCyl(0.09, 0.09, 0.54, 10, coralMat, -0.72, 0.48, 0, 0.32));
  rooms.add(daybed);

  // Wooden Artist's Easel with Harbor Painting (X=-10.02, Z=2.08)
  const easel = new THREE.Group();
  easel.position.set(-10.02, y0, 2.08);
  easel.rotation.y = 0.36;
  for (const sgn of [-1, 1]) {
    const leg = makeBox(0.04, 1.38, 0.04, woodMat, 0.05, 0.68, sgn * 0.24);
    leg.rotation.x = -sgn * 0.12;
    leg.rotation.z = 0.14;
    easel.add(leg);
  }
  const backLeg = makeBox(0.04, 1.34, 0.04, woodMat, -0.22, 0.65, 0);
  backLeg.rotation.z = -0.28;
  easel.add(backLeg);
  easel.add(makeBox(0.09, 0.04, 0.68, darkWoodMat, 0.10, 0.72, 0, 0.38));
  const easelArt = buildFramedArt(tex.lighthouseTex, 0.62, 0.48, creamMat);
  easelArt.position.set(0.10, 0.99, 0);
  easelArt.rotation.z = 0.14;
  easel.add(easelArt);
  rooms.add(easel);

  // Acoustic Guitar on Stand (X=-8.02, Z=3.40)
  const guitar = new THREE.Group();
  guitar.position.set(-8.02, y0, 3.40);
  guitar.rotation.y = -0.55;
  guitar.rotation.z = 0.16;
  guitar.add(makeBox(0.28, 0.04, 0.28, ironMat, 0, 0.04, 0));
  guitar.add(makeCyl(0.15, 0.16, 0.09, 14, toonMat(0xd49452), 0, 0.28, 0, 0.38));
  guitar.children[guitar.children.length - 1].rotation.z = Math.PI * 0.5;
  guitar.add(makeCyl(0.115, 0.12, 0.09, 14, toonMat(0xd49452), 0, 0.46, 0, 0.38));
  guitar.children[guitar.children.length - 1].rotation.z = Math.PI * 0.5;
  guitar.add(makeCyl(0.048, 0.048, 0.096, 12, darkWoodMat, 0, 0.40, 0));
  guitar.children[guitar.children.length - 1].rotation.z = Math.PI * 0.5;
  guitar.add(makeBox(0.035, 0.46, 0.048, darkWoodMat, 0, 0.74, 0, 0.36));
  rooms.add(guitar);

  // Oak Writing Desk + Chair + Emerald Banker's Lamp + Clickable Wax-Sealed Love Letter (id: "love-letter")
  const desk = new THREE.Group();
  desk.position.set(-8.52, y0, 1.98);
  desk.add(makeBox(0.76, 0.05, 1.12, woodMat, 0, 0.735, 0, 0.42));
  for (const dx of [-0.32, 0.32]) {
    for (const dz of [-0.48, 0.48]) desk.add(makeBox(0.055, 0.72, 0.055, darkWoodMat, dx, 0.36, dz, 0.36));
  }
  // Study chair beside desk
  desk.add(makeBox(0.38, 0.04, 0.38, woodMat, -0.58, 0.43, 0, 0.38));
  desk.add(makeBox(0.04, 0.44, 0.36, woodMat, -0.75, 0.65, 0, 0.38));
  for (const lx of [-0.72, -0.44]) {
    for (const lz of [-0.15, 0.15]) desk.add(makeCyl(0.02, 0.018, 0.42, 6, darkWoodMat, lx, 0.21, lz));
  }
  // Classic Emerald-Green Banker's Lamp & brass inkwell
  desk.add(makeCyl(0.08, 0.095, 0.03, 12, brassMat, -0.14, 0.775, -0.34));
  desk.add(makeCyl(0.014, 0.018, 0.24, 8, brassMat, -0.14, 0.89, -0.34));
  const bankerShade = makeCyl(0.075, 0.075, 0.20, 10, emissiveMat(0x2ea86f, 0.95), -0.09, 1.01, -0.34);
  bankerShade.rotation.x = Math.PI * 0.5;
  desk.add(bankerShade);
  desk.add(makeCyl(0.032, 0.038, 0.045, 8, brassMat, 0.16, 0.78, -0.30));
  rooms.add(desk);

  // Interactive Wax-Sealed Love Letter at world (-8.44, 2.115, 2.04)
  const letterGroup = new THREE.Group();
  letterGroup.position.set(-8.44, y0 + 0.765, 2.04);
  const letterGlow = makeCyl(0.24, 0.24, 0.006, 20, emissiveMat(0xffdf9e, 0.85, { transparent: true, opacity: 0.42 }), 0, 0.003, 0);
  letterGroup.add(letterGlow);
  const sheet = makeBox(0.34, 0.008, 0.26, toonMat(0xfff9ee), -0.02, 0.008, -0.02, 0.38);
  sheet.rotation.y = -0.12;
  letterGroup.add(sheet);
  const env = makeBox(0.32, 0.016, 0.23, toonMat(0xfffdf6), 0.01, 0.02, 0.01, 0.45);
  env.rotation.y = 0.18;
  letterGroup.add(env);
  const ribbon = makeBox(0.325, 0.019, 0.026, pinkMat, 0.01, 0.021, 0.01);
  ribbon.rotation.y = 0.18;
  letterGroup.add(ribbon);
  const waxSeal = makeCyl(0.042, 0.046, 0.016, 14, toonMat(0xd63c52), 0.01, 0.032, 0.01, 0.4);
  letterGroup.add(waxSeal);
  const sealHeart = new THREE.Mesh(createHeartExtrude(0.055, 0.008), brassMat);
  sealHeart.rotation.x = -Math.PI * 0.5;
  sealHeart.position.set(0.01, 0.043, 0.01);
  letterGroup.add(sealHeart);

  tagInteractive(letterGroup, "love-letter", "写给老婆的情书", { accentColor: PALETTE.pastelPink });
  rooms.add(letterGroup);

  group.add(rooms);
  return { hearthFlame, hearthLight, gramophoneDisc, gramophoneHorn, letterGlow };
}

export function buildFairytaleVilla() {
  const group = new THREE.Group();
  group.name = "fairytale-villa";

  const rng = mulberry32(20260520);
  const tex = createVillaTextures();

  const { mailboxFlag } = buildGardenAndMailbox(group, tex, rng);
  buildExteriorShell(group, tex);
  const { roofPivot, weathervaneRotor, smokePuffs } = buildHingedRoof(group, tex);
  const { hearthFlame, hearthLight, gramophoneDisc, gramophoneHorn, letterGlow } = buildInteriorRooms(group, tex, rng);

  enableShadows(group, { cast: true, receive: true });

  let roofOpen = false;
  const setRoofOpen = (open, immediate = false) => {
    roofOpen = Boolean(open);
    if (immediate) {
      roofPivot.rotation.z = roofOpen ? 1.18 : 0.0;
      roofPivot.position.y = roofOpen ? 4.05 : 3.65;
    }
    return roofOpen;
  };
  const toggleRoof = () => {
    roofOpen = !roofOpen;
    return roofOpen;
  };
  const isRoofOpen = () => roofOpen;

  const dripPoints = [];
  for (let i = 0; i < 5; i += 1) {
    const dx = -10.3 + i * 1.45;
    dripPoints.push(new THREE.Vector3(dx, 3.55, 0.16));
    dripPoints.push(new THREE.Vector3(dx, 3.55, 7.44));
  }
  dripPoints.push(
    new THREE.Vector3(-3.82, 3.18, 3.10),
    new THREE.Vector3(-3.82, 3.18, 3.80),
    new THREE.Vector3(-3.82, 3.18, 4.50),
    new THREE.Vector3(-3.98, 3.14, 5.70)
  );

  const anchors = {
    mailboxPos: new THREE.Vector3(-3.65, 2.18, 2.25),
    letterPos: new THREE.Vector3(-8.44, 2.13, 2.04),
    villaCenter: new THREE.Vector3(-7.50, 2.65, 3.80),
    dripPoints,
  };

  function update(elapsed = 0, dt = 0.016) {
    const step = Math.min(Math.max(dt || 0.016, 0.001), 0.1);
    const alpha = 1 - Math.exp(-step * 5.8);

    const targetRotZ = roofOpen ? 1.18 : 0.0;
    const targetPosY = roofOpen ? 4.05 : 3.65;
    roofPivot.rotation.z = THREE.MathUtils.lerp(roofPivot.rotation.z, targetRotZ, alpha);
    roofPivot.position.y = THREE.MathUtils.lerp(roofPivot.position.y, targetPosY, alpha);

    // Spinning brass gramophone platter & gentle horn resonance
    gramophoneDisc.rotation.y = elapsed * 1.9;
    gramophoneHorn.rotation.z = Math.sin(elapsed * 2.6) * 0.022;

    // Cozy hearth fireplace flicker
    const flicker = 0.92 + Math.sin(elapsed * 9.5) * 0.08 + Math.cos(elapsed * 15.3) * 0.05;
    hearthFlame.scale.set(1, flicker, 1);
    hearthLight.intensity = 1.28 * flicker;

    // Harbor breeze on rooftop heart weathervane & rose mailbox flag
    weathervaneRotor.rotation.y = Math.sin(elapsed * 0.85) * 0.36 + Math.cos(elapsed * 0.41) * 0.16;
    mailboxFlag.rotation.z = Math.sin(elapsed * 1.9) * 0.06;

    // Chimney soft smoke puffs rising gently
    for (let i = 0; i < smokePuffs.length; i += 1) {
      const phase = (elapsed * 0.42 + i * 0.33) % 1;
      const puff = smokePuffs[i];
      puff.position.y = 0.88 + phase * 0.68;
      puff.position.x = -0.11 + Math.sin(elapsed * 1.4 + i) * 0.05;
      puff.scale.setScalar(0.75 + phase * 0.65);
      puff.material.opacity = (1 - phase) * (roofOpen ? 0.18 : 0.55);
    }

    // Romantic shimmer pulse on the desk Love Letter
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.8);
    letterGlow.scale.setScalar(0.94 + pulse * 0.12);
    letterGlow.material.opacity = 0.28 + pulse * 0.24;
  }

  return {
    group,
    update,
    toggleRoof,
    setRoofOpen,
    isRoofOpen,
    anchors,
  };
}
