// 小贤贤 (girl) & 小冉子 (boy) — hand-sculpted procedural couple characters.
// Joint-hierarchy rig + procedural locomotion / affection poses, painted anime-style
// faces with expression swaps (open / blink / happy / kiss), strand-ribbon hair,
// floral sundress & linen shirt outfits, articulated hands and shoes.

import { THREE, clamp, lerp, makeCanvasTex, loadBundledGLB } from "./pbr-kit.js";

const TAU = Math.PI * 2;
let _coupleParts = null;

export async function preloadCoupleParts() {
  if (_coupleParts) return _coupleParts;
  const gltf = await loadBundledGLB("couple_parts", "./assets/models/couple_parts.glb");
  if (!gltf || !gltf.scene) return null;
  const parts = {};
  gltf.scene.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const key = obj.name;
    const geo = obj.geometry.clone();
    if (key === "HeadSculpt" && geo.attributes.uv) {
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i += 1) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        const az = Math.atan2(vx, Math.max(0.05, vz));
        const el = Math.atan2(vy, Math.max(0.05, Math.hypot(vx, Math.max(0.05, vz))));
        if (vz > 0.08 && Math.abs(az) < 0.92 && Math.abs(el) < 0.82) {
          uv.setXY(i, clamp(0.5 + az / 1.9, 0.02, 0.98), clamp(0.5 + el / 1.7, 0.02, 0.98));
        } else {
          uv.setXY(i, 0.015, 0.015);
        }
      }
      uv.needsUpdate = true;
    }
    if (geo.attributes.color) geo.deleteAttribute("color");
    parts[key] = geo;
  });
  _coupleParts = parts;
  return _coupleParts;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

// Tapered (optionally flattened) tube along a curve. If `outward(p, out)` is given the
// tube is flattened along that direction (ribbon lying on a surface, e.g. hair on scalp).
function taperedTube(curve, opts = {}) {
  const {
    segs = 20,
    radial = 8,
    r0 = 0.02,
    r1 = 0.004,
    flatten = 1,
    outward = null,
    profile = null,
  } = opts;
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const O = new THREE.Vector3();
  const V = new THREE.Vector3();
  const NN = new THREE.Vector3();
  const frames = outward ? null : curve.computeFrenetFrames(segs, false);
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T);
    if (outward) {
      outward(P, O);
      N.copy(O).addScaledVector(T, -O.dot(T));
      if (N.lengthSq() < 1e-8) N.set(0, 0, 1);
      N.normalize();
      B.crossVectors(T, N).normalize();
    } else {
      N.copy(frames.normals[i]);
      B.copy(frames.binormals[i]);
    }
    const r = profile ? profile(t) : lerp(r0, r1, t);
    for (let j = 0; j <= radial; j += 1) {
      const a = (j / radial) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      V.copy(P).addScaledVector(N, c * r * flatten).addScaledVector(B, s * r);
      pos.push(V.x, V.y, V.z);
      NN.set(0, 0, 0).addScaledVector(N, c / Math.max(0.05, flatten)).addScaledVector(B, s).normalize();
      nor.push(NN.x, NN.y, NN.z);
      uv.push(j / radial, t);
    }
  }
  for (let i = 0; i < segs; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function lathe(profile, segs = 32) {
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)),
    segs
  );
  g.computeVertexNormals();
  return g;
}

// Limb segment hanging down from a joint (top at y=0, bottom at y=-len)
function limbGeo(rTop, rBot, len, bulge = 0.0, segs = 18) {
  const prof = [];
  const steps = 10;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const r = lerp(rTop, rBot, t) * (1 + bulge * Math.sin(t * Math.PI));
    prof.push([r, -t * len]);
  }
  prof.unshift([0.0005, rTop * 0.35]);
  prof.splice(1, 0, [rTop * 0.82, rTop * 0.25]);
  prof.push([rBot * 0.8, -len - rBot * 0.25], [0.0005, -len - rBot * 0.4]);
  // LatheGeometry wants increasing y? It accepts any order; flip so normals face outward.
  return lathe(prof.reverse(), segs);
}

function sph(a, e, r, out = new THREE.Vector3()) {
  return out.set(r * Math.cos(e) * Math.sin(a), r * Math.sin(e), r * Math.cos(e) * Math.cos(a));
}

function addMesh(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// Painted textures
// ---------------------------------------------------------------------------

const FACE_W = 1.9; // horizontal angular span of the face decal (radians)
const FACE_H = 1.7; // vertical angular span

function faceXY(a, e, w, h) {
  return [(a / FACE_W + 0.5) * w, (0.5 - e / FACE_H) * h];
}

function drawFace(ctx, w, h, look, expr) {
  ctx.clearRect(0, 0, w, h);
  const female = look.gender === "f";
  const k = w / 512;

  // Blush (soft radial + anime hatch)
  const blushStrength = expr === "kiss" ? 0.62 : expr === "happy" ? 0.46 : female ? 0.34 : 0.2;
  for (const s of [-1, 1]) {
    const [bx, by] = faceXY(s * 0.5, -0.3, w, h);
    const g = ctx.createRadialGradient(bx, by, 2, bx, by, 46 * k);
    g.addColorStop(0, `rgba(240,120,130,${blushStrength})`);
    g.addColorStop(1, "rgba(240,120,130,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(bx, by, 50 * k, 30 * k, 0, 0, TAU);
    ctx.fill();
    if (female || expr === "kiss") {
      ctx.strokeStyle = `rgba(220,90,105,${blushStrength * 0.9})`;
      ctx.lineWidth = 2.2 * k;
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo(bx + i * 11 * k - 4 * k, by + 6 * k);
        ctx.lineTo(bx + i * 11 * k + 4 * k, by - 6 * k);
        ctx.stroke();
      }
    }
  }

  // Eyebrows
  ctx.strokeStyle = look.browColor;
  ctx.lineCap = "round";
  for (const s of [-1, 1]) {
    const [x0, y0] = faceXY(s * 0.2, female ? 0.2 : 0.19, w, h);
    const [x1, y1] = faceXY(s * 0.5, female ? 0.18 : 0.2, w, h);
    ctx.lineWidth = (female ? 5 : 8) * k;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + 3 * k);
    ctx.quadraticCurveTo((x0 + x1) / 2, y0 - (female ? 9 : 6) * k, x1, y1 + 4 * k);
    ctx.stroke();
  }

  // Eyes
  const eyeW = (female ? 0.27 : 0.24) * (w / FACE_W);
  const eyeH = (female ? 0.24 : 0.18) * (h / FACE_H);
  for (const s of [-1, 1]) {
    const [ex, ey] = faceXY(s * 0.35, -0.04, w, h);
    if (expr === "open") {
      // sclera
      ctx.fillStyle = "#fffaf6";
      ctx.beginPath();
      ctx.ellipse(ex, ey, eyeW * 0.5, eyeH * 0.5, 0, 0, TAU);
      ctx.fill();
      // iris gradient
      const ir = eyeH * (female ? 0.46 : 0.44);
      const ig = ctx.createLinearGradient(ex, ey - ir, ex, ey + ir);
      ig.addColorStop(0, look.irisTop);
      ig.addColorStop(0.55, look.irisMid);
      ig.addColorStop(1, look.irisBottom);
      ctx.fillStyle = ig;
      ctx.beginPath();
      ctx.ellipse(ex, ey + eyeH * 0.03, ir * 0.82, ir, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(40,20,15,0.85)";
      ctx.lineWidth = 2.5 * k;
      ctx.stroke();
      // pupil
      ctx.fillStyle = "#1d100c";
      ctx.beginPath();
      ctx.ellipse(ex, ey + eyeH * 0.04, ir * 0.36, ir * 0.46, 0, 0, TAU);
      ctx.fill();
      // iris ring sparkles
      ctx.fillStyle = "rgba(255,230,190,0.55)";
      ctx.beginPath();
      ctx.ellipse(ex, ey + ir * 0.55, ir * 0.5, ir * 0.18, 0, 0, Math.PI);
      ctx.fill();
      // highlights
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(ex - s * ir * 0.3 - ir * 0.05, ey - ir * 0.32, ir * 0.27, ir * 0.22, -0.5, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + ir * 0.32, ey + ir * 0.35, ir * 0.11, 0, TAU);
      ctx.fill();
      // upper lash line
      ctx.strokeStyle = "#24140f";
      ctx.lineWidth = (female ? 7 : 6) * k;
      ctx.beginPath();
      ctx.moveTo(ex - eyeW * 0.52, ey + eyeH * 0.02);
      ctx.quadraticCurveTo(ex, ey - eyeH * 0.78, ex + eyeW * 0.54, ey - eyeH * 0.02);
      ctx.stroke();
      if (female) {
        // outer flick + individual lashes
        const ox = ex + s * eyeW * 0.5;
        ctx.lineWidth = 4 * k;
        ctx.beginPath();
        ctx.moveTo(ox, ey - eyeH * 0.05);
        ctx.lineTo(ox + s * 12 * k, ey - eyeH * 0.32);
        ctx.stroke();
        ctx.lineWidth = 2.6 * k;
        for (let i = 0; i < 3; i += 1) {
          const lx = ex + s * eyeW * (0.18 + i * 0.12);
          const ly = ey - eyeH * (0.42 - i * 0.1);
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx + s * 7 * k, ly - 9 * k);
          ctx.stroke();
        }
      }
      // double-lid crease
      ctx.strokeStyle = "rgba(150,90,80,0.45)";
      ctx.lineWidth = 2 * k;
      ctx.beginPath();
      ctx.moveTo(ex - eyeW * 0.4, ey - eyeH * 0.5);
      ctx.quadraticCurveTo(ex, ey - eyeH * 0.92, ex + eyeW * 0.42, ey - eyeH * 0.46);
      ctx.stroke();
      // lower lash
      ctx.strokeStyle = "rgba(60,30,25,0.55)";
      ctx.lineWidth = 2 * k;
      ctx.beginPath();
      ctx.moveTo(ex - eyeW * 0.25, ey + eyeH * 0.47);
      ctx.quadraticCurveTo(ex, ey + eyeH * 0.56, ex + eyeW * 0.32, ey + eyeH * 0.4);
      ctx.stroke();
    } else if (expr === "happy") {
      ctx.strokeStyle = "#24140f";
      ctx.lineWidth = 6 * k;
      ctx.beginPath();
      ctx.moveTo(ex - eyeW * 0.45, ey + eyeH * 0.12);
      ctx.quadraticCurveTo(ex, ey - eyeH * 0.55, ex + eyeW * 0.45, ey + eyeH * 0.12);
      ctx.stroke();
    } else {
      // closed (blink / kiss): downward curve with lashes
      ctx.strokeStyle = "#24140f";
      ctx.lineWidth = 6 * k;
      ctx.beginPath();
      ctx.moveTo(ex - eyeW * 0.48, ey - eyeH * 0.02);
      ctx.quadraticCurveTo(ex, ey + eyeH * 0.32, ex + eyeW * 0.48, ey - eyeH * 0.02);
      ctx.stroke();
      if (female) {
        ctx.lineWidth = 2.6 * k;
        for (let i = 0; i < 4; i += 1) {
          const t = 0.2 + i * 0.2;
          const lx = ex - eyeW * 0.48 + eyeW * 0.96 * t;
          const ly = ey + eyeH * 0.3 * Math.sin(t * Math.PI) - eyeH * 0.02;
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx + s * 3 * k, ly + 8 * k);
          ctx.stroke();
        }
      }
    }
  }

  // Nose shade (dainty soft anime nose bridge + highlight dot)
  const [nx, ny] = faceXY(0.02, -0.20, w, h);
  ctx.fillStyle = "rgba(218,136,122,0.52)";
  ctx.beginPath();
  ctx.ellipse(nx - 2 * k, ny + 2 * k, 5.5 * k, 3.2 * k, 0.15, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(182,102,90,0.68)";
  ctx.lineWidth = 2.4 * k;
  ctx.beginPath();
  ctx.moveTo(nx, ny - 8 * k);
  ctx.quadraticCurveTo(nx + 4.5 * k, ny + 1.5 * k, nx - 2 * k, ny + 4.5 * k);
  ctx.stroke();

  // Soft glossy anime blush highlight dots
  for (const s of [-1, 1]) {
    const [bx, by] = faceXY(s * 0.48, -0.29, w, h);
    ctx.fillStyle = `rgba(255,252,248,${female ? 0.55 : 0.25})`;
    ctx.beginPath();
    ctx.ellipse(bx - s * 10 * k, by - 5 * k, 6 * k, 3.5 * k, -0.25, 0, TAU);
    ctx.fill();
  }

  // Mouth
  const [mx, my] = faceXY(0, -0.43, w, h);
  if (expr === "kiss") {
    ctx.fillStyle = look.lipColor;
    ctx.beginPath();
    ctx.ellipse(mx, my, 9 * k, 7 * k, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(150,60,70,0.8)";
    ctx.lineWidth = 2 * k;
    ctx.stroke();
  } else {
    const wide = expr === "happy" ? 1.25 : 1.0;
    if (female || expr === "happy") {
      ctx.fillStyle = expr === "happy" ? "#b8505e" : look.lipColor;
      ctx.beginPath();
      ctx.moveTo(mx - 20 * k * wide, my - 2 * k);
      ctx.quadraticCurveTo(mx, my + (expr === "happy" ? 22 : 12) * k, mx + 20 * k * wide, my - 2 * k);
      ctx.quadraticCurveTo(mx, my + 3 * k, mx - 20 * k * wide, my - 2 * k);
      ctx.fill();
      if (expr === "happy") {
        ctx.fillStyle = "#f09aa5";
        ctx.beginPath();
        ctx.ellipse(mx, my + 10 * k, 9 * k, 4 * k, 0, 0, TAU);
        ctx.fill();
      }
    }
    ctx.strokeStyle = "rgba(120,50,50,0.85)";
    ctx.lineWidth = 3 * k;
    ctx.beginPath();
    ctx.moveTo(mx - 20 * k * wide, my - 3 * k);
    ctx.quadraticCurveTo(mx, my + 7 * k, mx + 20 * k * wide, my - 3 * k);
    ctx.stroke();
  }
}

function makeFaceTextures(look) {
  const out = {};
  for (const expr of ["open", "blink", "happy", "kiss"]) {
    out[expr] = makeCanvasTex(1024, 1024, (ctx, w, h) => drawFace(ctx, w, h, look, expr), {
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    });
  }
  return out;
}

function makeHairTexture(base, light) {
  return makeCanvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i += 1) {
      const x = Math.random() * w;
      const a = 0.08 + Math.random() * 0.22;
      ctx.strokeStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a})` : light.replace("A", String(a));
      ctx.lineWidth = 0.6 + Math.random() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 3, h * 0.3, x - 3, h * 0.6, x + 1, h);
      ctx.stroke();
    }
  });
}

function makeFloralDressTexture() {
  return makeCanvasTex(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = "#e9aab4";
      ctx.fillRect(0, 0, w, h);
      // fine weave
      for (let y = 0; y < h; y += 2) {
        ctx.fillStyle = `rgba(255,255,255,${0.03 + (y % 4) * 0.01})`;
        ctx.fillRect(0, y, w, 1);
      }
      const sprig = (x, y, s) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(s);
        ctx.fillStyle = "#86a88d";
        for (const r of [-0.9, 0.9]) {
          ctx.beginPath();
          ctx.ellipse(Math.cos(r) * 7, Math.sin(r) * 7, 5, 2.2, r, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = "#fff6ef";
        for (let p = 0; p < 5; p += 1) {
          const a = (p / 5) * TAU;
          ctx.beginPath();
          ctx.ellipse(Math.cos(a) * 3.6, Math.sin(a) * 3.6, 3.2, 2.2, a, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = "#e8c463";
        ctx.beginPath();
        ctx.arc(0, 0, 1.8, 0, TAU);
        ctx.fill();
        ctx.restore();
      };
      for (let i = 0; i < 4; i += 1) {
        for (let j = 0; j < 4; j += 1) {
          sprig(i * 64 + 18 + (j % 2) * 32, j * 64 + 20, i + j * 1.7);
        }
      }
    },
    { repeatX: 6, repeatY: 3 }
  );
}

function makeLinenTexture(base) {
  return makeCanvasTex(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < w; i += 2) {
        ctx.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.035})`;
        ctx.fillRect(i, 0, 1, h);
        ctx.fillRect(0, i, w, 1);
      }
    },
    { repeatX: 5, repeatY: 5 }
  );
}

function makeTagTexture(name, color) {
  return makeCanvasTex(
    256,
    80,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,250,246,0.88)";
      const r = 30;
      ctx.beginPath();
      ctx.moveTo(r, 8);
      ctx.arcTo(w - 8, 8, w - 8, h - 8, r);
      ctx.arcTo(w - 8, h - 8, 8, h - 8, r);
      ctx.arcTo(8, h - 8, 8, 8, r);
      ctx.arcTo(8, 8, w - 8, 8, r);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.font = "bold 36px 'Noto Serif SC', 'Songti SC', serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`♥ ${name}`, w / 2, h / 2 + 2);
    },
    { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping }
  );
}

let _heartTex = null;
function getHeartTexture() {
  if (_heartTex) return _heartTex;
  _heartTex = makeCanvasTex(
    128,
    128,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w * 0.42, h * 0.38, 4, w / 2, h / 2, w * 0.55);
      g.addColorStop(0, "#ffd6de");
      g.addColorStop(0.5, "#ff6f8d");
      g.addColorStop(1, "#e23f66");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(w / 2, h * 0.86);
      ctx.bezierCurveTo(w * 0.05, h * 0.55, w * 0.12, h * 0.12, w / 2, h * 0.3);
      ctx.bezierCurveTo(w * 0.88, h * 0.12, w * 0.95, h * 0.55, w / 2, h * 0.86);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.ellipse(w * 0.34, h * 0.36, 9, 5, -0.6, 0, TAU);
      ctx.fill();
    },
    { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping }
  );
  return _heartTex;
}

// ---------------------------------------------------------------------------
// Character definitions
// ---------------------------------------------------------------------------

export const COUPLE_DEFS = {
  xian: {
    id: "xian",
    name: "小贤贤",
    gender: "f",
    tagColor: "#c4506a",
    dims: {
      foot: 0.07,
      shin: 0.38,
      thigh: 0.39,
      spine: 0.2,
      chest: 0.19,
      neck: 0.07,
      headR: 0.125,
      shoulder: 0.148,
      hipW: 0.082,
      upper: 0.26,
      fore: 0.23,
      hand: 1.0,
    },
    look: {
      gender: "f",
      skin: 0xf7d9c8,
      hair: "#3b241d",
      hairLight: "rgba(160,100,80,A)",
      browColor: "#4a2d22",
      irisTop: "#3a1f16",
      irisMid: "#7a4a2c",
      irisBottom: "#c98f52",
      lipColor: "#e07c8a",
    },
  },
  ran: {
    id: "ran",
    name: "小冉子",
    gender: "m",
    tagColor: "#3f6a8a",
    dims: {
      foot: 0.075,
      shin: 0.43,
      thigh: 0.44,
      spine: 0.22,
      chest: 0.23,
      neck: 0.08,
      headR: 0.128,
      shoulder: 0.184,
      hipW: 0.095,
      upper: 0.3,
      fore: 0.26,
      hand: 1.12,
    },
    look: {
      gender: "m",
      skin: 0xf0cfb8,
      hair: "#1e1714",
      hairLight: "rgba(120,95,80,A)",
      browColor: "#21160f",
      irisTop: "#1c120d",
      irisMid: "#4a2e1f",
      irisBottom: "#86603d",
      lipColor: "#c98a84",
    },
  },
};

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function buildHand(mats, scale, side) {
  const hand = new THREE.Group();
  const palm = addMesh(hand, new THREE.SphereGeometry(1, 16, 12), mats.skin, 0, -0.045 * scale, 0);
  palm.scale.set(0.038 * scale, 0.05 * scale, 0.017 * scale);
  const fingerGeo = new THREE.CapsuleGeometry(0.0078 * scale, 0.04 * scale, 4, 8);
  for (let i = 0; i < 4; i += 1) {
    const f = addMesh(
      hand,
      fingerGeo,
      mats.skin,
      (-0.024 + i * 0.016) * scale,
      (-0.105 + Math.abs(i - 1.5) * 0.006) * scale,
      0.004 * scale,
      0.28,
      0,
      0
    );
    f.scale.y = 1 - Math.abs(i - 1.2) * 0.12;
  }
  const thumb = addMesh(hand, fingerGeo, mats.skin, side * 0.036 * scale, -0.055 * scale, 0.012 * scale, 0.4, 0, side * 0.7);
  thumb.scale.y = 0.82;
  hand.rotation.y = side * -0.1;
  return hand;
}

function buildShoe(mats, female, scale) {
  const g = new THREE.Group();
  const upper = addMesh(g, new THREE.SphereGeometry(1, 20, 14, 0, TAU, 0, Math.PI * 0.58), mats.shoe, 0, 0, 0.045 * scale);
  upper.scale.set(0.046 * scale, 0.07 * scale, 0.118 * scale);
  const sole = addMesh(g, new THREE.CylinderGeometry(1, 1, 1, 20), mats.sole, 0, -0.004, 0.045 * scale);
  sole.scale.set(0.048 * scale, 0.014, 0.12 * scale);
  if (female) {
    const strap = addMesh(g, new THREE.TorusGeometry(0.044, 0.005, 6, 20, Math.PI), mats.shoe, 0, 0.03, 0.02, 0, Math.PI / 2, 0);
    strap.rotation.set(0, Math.PI / 2, 0);
    const bow = addMesh(g, new THREE.SphereGeometry(0.012, 8, 6), mats.ribbon, 0, 0.045, 0.12);
    bow.scale.set(1.6, 0.8, 0.7);
    // ankle socks with lace frill
    addMesh(g, new THREE.CylinderGeometry(0.037, 0.035, 0.06, 16), mats.sock, 0, 0.05, 0.0);
    addMesh(g, new THREE.TorusGeometry(0.038, 0.006, 6, 18), mats.sock, 0, 0.08, 0, Math.PI / 2, 0, 0);
  } else {
    // penny-loafer saddle + heel
    const saddle = addMesh(g, new THREE.BoxGeometry(0.06, 0.012, 0.03), mats.sole, 0, 0.045, 0.085);
    saddle.rotation.x = -0.35;
    addMesh(g, new THREE.CylinderGeometry(0.036, 0.034, 0.05, 16), mats.trouser, 0, 0.06, 0);
  }
  return g;
}

function buildFemaleHair(head, R, mats) {
  const hair = new THREE.Group();
  head.add(hair);
  const cap = addMesh(hair, new THREE.SphereGeometry(R * 1.065, 40, 24, 0, TAU, 0, Math.PI * 0.56), mats.hair);
  cap.rotation.x = -0.62;
  const outward = (p, o) => o.copy(p).normalize();
  const strands = [];
  // Air bangs
  for (let i = -5; i <= 5; i += 1) {
    const a = i * 0.13;
    const sweep = 0.06;
    const curve = new THREE.CatmullRomCurve3([
      sph(a * 0.4, 1.05, R * 1.06),
      sph(a * 0.75 + sweep * 0.3, 0.72, R * 1.085),
      sph(a * 0.95 + sweep * 0.7, 0.42, R * 1.075),
      sph(a * 1.02 + sweep, 0.2 + Math.abs(i) * 0.012, R * 1.05),
    ]);
    strands.push(taperedTube(curve, { r0: 0.03, r1: 0.003, flatten: 0.32, outward, segs: 16, radial: 8 }));
  }
  // Side face-framing locks (to the chest)
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k += 1) {
      const off = k * 0.12;
      const curve = new THREE.CatmullRomCurve3([
        sph(s * (0.85 + off), 0.62, R * 1.06),
        sph(s * (1.0 + off), 0.2, R * 1.1),
        sph(s * (1.08 + off), -0.35, R * 1.12),
        new THREE.Vector3(s * (R * 0.98 + off * 0.1), -R * 1.6, R * 0.42),
        new THREE.Vector3(s * (R * 1.05 + off * 0.1), -R * 2.6, R * 0.55),
        new THREE.Vector3(s * (R * 0.96), -R * 3.3, R * 0.62),
      ]);
      strands.push(
        taperedTube(curve, {
          segs: 28,
          radial: 8,
          flatten: 0.42,
          outward: (p, o) => o.set(p.x, p.y > 0 ? p.y : 0, p.z).normalize(),
          profile: (t) => 0.026 * (1 - t * 0.75) + 0.005 * Math.sin(t * 9),
        })
      );
    }
  }
  // Long back hair locks (to mid-back) with soft waves
  const backCount = 26;
  for (let i = 0; i < backCount; i += 1) {
    const u = i / (backCount - 1);
    const a = lerp(-2.25, 2.25, u) + Math.PI;
    const sideness = Math.abs(Math.sin(a));
    const pts = [];
    pts.push(sph(a, 0.75, R * 1.05));
    pts.push(sph(a, 0.25, R * 1.11));
    pts.push(sph(a, -0.35, R * 1.14));
    const baseX = Math.sin(a) * R * (1.15 + sideness * 0.35);
    const baseZ = Math.cos(a) * R * 1.12 - 0.02;
    const len = 0.62 - sideness * 0.1;
    for (let k = 1; k <= 5; k += 1) {
      const t = k / 5;
      const wave = Math.sin(t * Math.PI * 2.6 + i * 1.3) * 0.016;
      pts.push(
        new THREE.Vector3(
          baseX * (1 + t * 0.35) + wave,
          -R * 0.8 - t * len,
          Math.min(-0.13 * (1 - sideness * 0.5), baseZ - t * 0.04) + (t > 0.8 ? 0.03 : 0)
        )
      );
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    strands.push(
      taperedTube(curve, {
        segs: 34,
        radial: 8,
        flatten: 0.38,
        outward: (p, o) => o.set(p.x, p.y > -R * 0.6 ? p.y : 0, p.z).normalize(),
        profile: (t) => (0.04 - t * 0.022) * (1 + 0.15 * Math.sin(t * 12 + i)),
      })
    );
  }
  for (const g of strands) addMesh(hair, g, mats.hair);

  // Flower hairpin + rose ribbon bow
  const pin = new THREE.Group();
  pin.position.copy(sph(1.0, 0.5, R * 1.1));
  pin.lookAt(pin.position.clone().multiplyScalar(2));
  for (let p = 0; p < 5; p += 1) {
    const a = (p / 5) * TAU;
    const pet = addMesh(pin, new THREE.SphereGeometry(0.014, 10, 8), mats.petal, Math.cos(a) * 0.014, Math.sin(a) * 0.014, 0);
    pet.scale.set(1, 0.75, 0.35);
    pet.rotation.z = a;
  }
  addMesh(pin, new THREE.SphereGeometry(0.007, 8, 6), mats.gold, 0, 0, 0.004);
  hair.add(pin);

  const bow = new THREE.Group();
  bow.position.copy(sph(Math.PI, 0.3, R * 1.12));
  bow.rotation.y = Math.PI;
  for (const s of [-1, 1]) {
    const loop = addMesh(bow, new THREE.TorusGeometry(0.03, 0.011, 8, 18), mats.ribbon, s * 0.034, 0, 0);
    loop.scale.set(1.2, 0.75, 0.6);
    const tail = addMesh(bow, new THREE.BoxGeometry(0.02, 0.09, 0.004), mats.ribbon, s * 0.018, -0.05, -0.004);
    tail.rotation.z = s * 0.25;
  }
  addMesh(bow, new THREE.SphereGeometry(0.014, 10, 8), mats.ribbon);
  hair.add(bow);
  return hair;
}

function buildMaleHair(head, R, mats) {
  const hair = new THREE.Group();
  head.add(hair);
  const cap = addMesh(hair, new THREE.SphereGeometry(R * 1.06, 40, 24, 0, TAU, 0, Math.PI * 0.52), mats.hair);
  cap.rotation.x = -0.5;
  const outward = (p, o) => o.copy(p).normalize();
  const strands = [];
  // Fibonacci tufts over the scalp region, flowing forward/down with a side part
  const N = 64;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i += 1) {
    const y = 1 - (i / (N - 1)) * 1.2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * golden;
    const p = new THREE.Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad);
    // keep inside tilted cap region (front hairline higher)
    const elev = Math.asin(clamp(p.y, -1, 1));
    const az = Math.atan2(p.x, p.z);
    const frontness = Math.cos(az);
    const minElev = 0.42 * frontness - 0.15 * (1 - frontness);
    if (elev < minElev) continue;
    const e0 = elev;
    const len = 0.32 + (i % 5) * 0.04;
    const dirA = frontness > 0.3 ? 0.35 : 0.08 * Math.sign(az);
    const dirE = frontness > 0.3 ? -len * 0.9 : -len;
    const curve = new THREE.CatmullRomCurve3([
      sph(az, e0, R * 1.05),
      sph(az + dirA * 0.4, e0 + dirE * 0.4, R * 1.12 + 0.006),
      sph(az + dirA * 0.8, e0 + dirE * 0.8, R * 1.13),
      sph(az + dirA, e0 + dirE, R * 1.1 + (frontness > 0.3 ? 0.012 : 0)),
    ]);
    strands.push(taperedTube(curve, { r0: 0.03, r1: 0.004, flatten: 0.42, outward, segs: 10, radial: 7 }));
  }
  // Swept fringe
  for (let i = 0; i < 7; i += 1) {
    const a = -0.5 + i * 0.13;
    const curve = new THREE.CatmullRomCurve3([
      sph(a - 0.1, 0.95, R * 1.08),
      sph(a + 0.08, 0.68, R * 1.13),
      sph(a + 0.28, 0.45, R * 1.11),
      sph(a + 0.42, 0.33, R * 1.06),
    ]);
    strands.push(taperedTube(curve, { r0: 0.032, r1: 0.004, flatten: 0.4, outward, segs: 12, radial: 7 }));
  }
  // Sideburns + nape
  for (const s of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([sph(s * 1.25, 0.25, R * 1.04), sph(s * 1.3, -0.05, R * 1.03), sph(s * 1.32, -0.2, R * 1.01)]);
    strands.push(taperedTube(c, { r0: 0.022, r1: 0.006, flatten: 0.3, outward, segs: 8, radial: 6 }));
  }
  for (let i = 0; i < 9; i += 1) {
    const a = Math.PI + (i - 4) * 0.2;
    const c = new THREE.CatmullRomCurve3([sph(a, 0.1, R * 1.06), sph(a, -0.25, R * 1.06), sph(a, -0.45, R * 1.0)]);
    strands.push(taperedTube(c, { r0: 0.03, r1: 0.006, flatten: 0.35, outward, segs: 8, radial: 6 }));
  }
  for (const g of strands) addMesh(hair, g, mats.hair);
  return hair;
}

function makeMaterials(def) {
  const L = def.look;
  const female = def.gender === "f";
  const hairTex = makeHairTexture(L.hair, L.hairLight);
  const skin = new THREE.MeshPhysicalMaterial({
    color: L.skin,
    emissive: new THREE.Color(0x462218),
    emissiveIntensity: 0.14,
    roughness: 0.56,
    sheen: 0.38,
    sheenColor: new THREE.Color(0xffc9b9),
    sheenRoughness: 0.55,
  });
  const hair = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: hairTex,
    roughness: 0.48,
    sheen: 0.7,
    sheenColor: new THREE.Color(female ? 0x9a6a55 : 0x6d5a50),
    sheenRoughness: 0.35,
    side: THREE.DoubleSide,
  });
  const mats = {
    skin,
    hair,
    gold: new THREE.MeshStandardMaterial({ color: 0xd9b25f, metalness: 0.9, roughness: 0.28 }),
    sole: new THREE.MeshStandardMaterial({ color: 0x5a3b2a, roughness: 0.6 }),
    ribbon: new THREE.MeshPhysicalMaterial({ color: 0xd9788a, roughness: 0.4, sheen: 0.8, sheenColor: new THREE.Color(0xffd1da) }),
    petal: new THREE.MeshStandardMaterial({ color: 0xfbd3dc, roughness: 0.5 }),
    sock: new THREE.MeshStandardMaterial({ color: 0xfffaf4, roughness: 0.85 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xfffbf6, roughness: 0.7, sheen: 0.4, sheenColor: new THREE.Color(0xffffff) }),
  };
  if (female) {
    mats.dress = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: makeFloralDressTexture(),
      roughness: 0.72,
      sheen: 0.5,
      sheenColor: new THREE.Color(0xffe1e6),
      side: THREE.DoubleSide,
    });
    mats.sash = new THREE.MeshPhysicalMaterial({ color: 0x8fae95, roughness: 0.45, sheen: 0.7, sheenColor: new THREE.Color(0xd8efe0) });
    mats.shoe = new THREE.MeshPhysicalMaterial({ color: 0xd98b98, roughness: 0.32, clearcoat: 0.6 });
    mats.lace = new THREE.MeshStandardMaterial({ color: 0xfff8f2, roughness: 0.8, side: THREE.DoubleSide });
  } else {
    mats.shirt = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: makeLinenTexture("#f7f4ee"),
      roughness: 0.8,
      sheen: 0.4,
      sheenColor: new THREE.Color(0xffffff),
    });
    mats.trouser = new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeLinenTexture("#3c4b61"), roughness: 0.78 });
    mats.belt = new THREE.MeshStandardMaterial({ color: 0x6a4029, roughness: 0.42 });
    mats.shoe = new THREE.MeshPhysicalMaterial({ color: 0x7a4a2c, roughness: 0.35, clearcoat: 0.7 });
    mats.button = new THREE.MeshStandardMaterial({ color: 0xeee6da, roughness: 0.3 });
    mats.watchFace = new THREE.MeshStandardMaterial({ color: 0xf5efe2, roughness: 0.2 });
  }
  return mats;
}

function buildCharacter(def) {
  const D = def.dims;
  const female = def.gender === "f";
  const mats = makeMaterials(def);
  const faceTex = makeFaceTextures(def.look);

  const root = new THREE.Group();
  root.name = `Couple_${def.id}`;
  const body = new THREE.Group();
  body.rotation.y = Math.PI; // model faces +Z inside; root yaw 0 faces -Z (camera convention)
  root.add(body);

  const hipY = D.foot + D.shin + D.thigh;
  const J = {};
  J.pelvis = new THREE.Group();
  J.pelvis.position.y = hipY;
  body.add(J.pelvis);
  J.spine = new THREE.Group();
  J.spine.position.y = 0.04;
  J.pelvis.add(J.spine);
  J.chest = new THREE.Group();
  J.chest.position.y = D.spine;
  J.spine.add(J.chest);
  J.neck = new THREE.Group();
  J.neck.position.y = D.chest;
  J.chest.add(J.neck);
  J.head = new THREE.Group();
  J.head.position.y = D.neck + D.headR * 0.92;
  J.neck.add(J.head);

  // --- Torso ---
  const depthScale = 0.74;
  if (female) {
    const bodice = addMesh(
      J.spine,
      lathe(
        [
          [0.0005, -0.07],
          [0.12, -0.07],
          [0.128, -0.02],
          [0.112, 0.06],
          [0.1, 0.12],
          [0.118, 0.19],
          [0.132, 0.25],
          [0.128, 0.3],
          [0.112, 0.33],
          [0.06, 0.36],
          [0.0005, 0.36],
        ],
        40
      ),
      mats.dress
    );
    bodice.scale.z = depthScale;
    // Peter-Pan collar
    for (const s of [-1, 1]) {
      const col = addMesh(J.chest, new THREE.CircleGeometry(0.05, 20, 0, Math.PI), mats.white, s * 0.035, 0.165, 0.07, -1.2, 0, s * 0.4);
      col.material = mats.lace;
    }
    // Necklace with heart pendant
    const neckl = addMesh(J.chest, new THREE.TorusGeometry(0.058, 0.0022, 6, 32), mats.gold, 0, 0.17, 0.01, Math.PI / 2 + 0.35, 0, 0);
    neckl.scale.z = 0.8;
    const pend = addMesh(J.chest, new THREE.SphereGeometry(0.008, 10, 8), mats.ribbon, 0, 0.11, 0.098);
    pend.scale.set(1.2, 1, 0.5);
    // Sage satin waist sash + back bow
    const sash = addMesh(J.spine, new THREE.TorusGeometry(0.104, 0.014, 8, 36), mats.sash, 0, 0.1, 0, Math.PI / 2, 0, 0);
    sash.scale.y = depthScale;
    const sbow = new THREE.Group();
    sbow.position.set(0, 0.1, -0.085);
    for (const s of [-1, 1]) {
      const l = addMesh(sbow, new THREE.TorusGeometry(0.032, 0.011, 8, 16), mats.sash, s * 0.035, 0.005, 0);
      l.scale.set(1.25, 0.7, 0.5);
      const t = addMesh(sbow, new THREE.BoxGeometry(0.026, 0.16, 0.004), mats.sash, s * 0.02, -0.08, -0.01);
      t.rotation.z = s * 0.18;
    }
    addMesh(sbow, new THREE.SphereGeometry(0.014, 8, 6), mats.sash);
    J.spine.add(sbow);
  } else {
    const shirt = addMesh(
      J.spine,
      lathe(
        [
          [0.0005, -0.06],
          [0.135, -0.06],
          [0.14, 0.0],
          [0.132, 0.08],
          [0.138, 0.16],
          [0.155, 0.26],
          [0.16, 0.34],
          [0.14, 0.4],
          [0.07, 0.44],
          [0.0005, 0.44],
        ],
        40
      ),
      mats.shirt
    );
    shirt.scale.z = depthScale;
    // Placket + buttons
    addMesh(J.spine, new THREE.BoxGeometry(0.026, 0.4, 0.004), mats.shirt, 0, 0.2, 0.108);
    for (let i = 0; i < 5; i += 1) {
      addMesh(J.spine, new THREE.CylinderGeometry(0.0055, 0.0055, 0.003, 10), mats.button, 0, 0.05 + i * 0.075, 0.112, Math.PI / 2, 0, 0);
    }
    // Spread collar
    for (const s of [-1, 1]) {
      const c = addMesh(J.chest, new THREE.BoxGeometry(0.07, 0.045, 0.006), mats.shirt, s * 0.04, 0.2, 0.065);
      c.rotation.set(-0.5, s * 0.5, s * 0.55);
    }
    // Chest pocket + pink rose boutonniere
    addMesh(J.spine, new THREE.BoxGeometry(0.06, 0.065, 0.004), mats.shirt, 0.07, 0.29, 0.112);
    const rose = addMesh(J.spine, new THREE.SphereGeometry(0.013, 10, 8), mats.ribbon, 0.075, 0.33, 0.118);
    rose.scale.set(1, 0.85, 0.85);
    // Belt + buckle + trouser seat
    const belt = addMesh(J.pelvis, new THREE.TorusGeometry(0.137, 0.014, 6, 36), mats.belt, 0, 0.0, 0, Math.PI / 2, 0, 0);
    belt.scale.y = depthScale;
    addMesh(J.pelvis, new THREE.BoxGeometry(0.036, 0.026, 0.008), mats.gold, 0, 0.0, 0.104);
    const seat = addMesh(
      J.pelvis,
      lathe(
        [
          [0.0005, -0.12],
          [0.12, -0.12],
          [0.142, -0.06],
          [0.138, 0.0],
          [0.0005, 0.0],
        ],
        32
      ),
      mats.trouser
    );
    seat.scale.z = 0.8;
  }

  // --- Neck & Head ---
  addMesh(J.neck, new THREE.CylinderGeometry(0.04, 0.046, D.neck + 0.06, 16), mats.skin, 0, D.neck * 0.5, 0);
  const R = D.headR;
  const hasSculptHead = Boolean(_coupleParts?.HeadSculpt);
  if (hasSculptHead) {
    const headMesh = addMesh(J.head, _coupleParts.HeadSculpt, mats.skin);
    headMesh.scale.setScalar(R);
  } else {
    const headGeo = new THREE.SphereGeometry(R, 48, 36);
    const p = headGeo.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      if (y < -R * 0.2) {
        const t = (-y - R * 0.2) / (R * 0.8);
        p.setX(i, x * (1 - 0.24 * t * t));
        p.setZ(i, z * (1 - 0.1 * t * t) + (z > 0 ? 0.004 * t : 0));
        p.setY(i, y - 0.012 * t * (z > 0 ? 1 : 0.2));
      }
    }
    headGeo.computeVertexNormals();
    addMesh(J.head, headGeo, mats.skin);
  }
  // Painted face decal (conformal to sculpted head surface when GLB loaded!)
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTex.open,
    transparent: true,
    depthWrite: false,
    roughness: 0.52,
    emissive: new THREE.Color(0x281410),
    emissiveIntensity: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const face = new THREE.Mesh(
    hasSculptHead
      ? _coupleParts.HeadSculpt
      : new THREE.SphereGeometry(R * 1.004, 48, 36, Math.PI / 2 - FACE_W / 2, FACE_W, Math.PI / 2 - FACE_H / 2, FACE_H),
    faceMat
  );
  if (hasSculptHead) face.scale.setScalar(R * 1.004);
  face.receiveShadow = false;
  face.renderOrder = 2;
  J.head.add(face);
  if (!hasSculptHead) {
    const nose = addMesh(J.head, new THREE.SphereGeometry(R * 0.055, 12, 10), mats.skin);
    nose.position.copy(sph(0, -0.2, R * 0.985));
    nose.scale.set(0.7, 0.9, 0.55);
  }
  for (const s of [-1, 1]) {
    const ear = addMesh(J.head, new THREE.SphereGeometry(R * 0.19, 12, 10), mats.skin);
    ear.position.set(s * R * 0.97, -R * 0.10, -R * 0.06);
    ear.scale.set(0.36, 0.95, 0.68);
    if (female) {
      addMesh(J.head, new THREE.SphereGeometry(0.0055, 8, 6), mats.gold, ear.position.x * 1.02, ear.position.y - R * 0.18, ear.position.z);
    }
  }
  let hairGroup = null;
  if (female && _coupleParts?.HairSculptF) {
    hairGroup = new THREE.Group();
    const hm = addMesh(hairGroup, _coupleParts.HairSculptF, mats.hair);
    hm.scale.setScalar(R);
    const pin = new THREE.Group();
    pin.position.set(-R * 0.84, R * 0.44, R * 0.70);
    pin.lookAt(pin.position.clone().multiplyScalar(2));
    for (let p = 0; p < 5; p += 1) {
      const a = (p / 5) * TAU;
      const pet = addMesh(pin, new THREE.SphereGeometry(0.014, 10, 8), mats.petal, Math.cos(a) * 0.014, Math.sin(a) * 0.014, 0);
      pet.scale.set(1, 0.75, 0.35);
      pet.rotation.z = a;
    }
    addMesh(pin, new THREE.SphereGeometry(0.007, 8, 6), mats.gold, 0, 0, 0.004);
    hairGroup.add(pin);
    const bow = new THREE.Group();
    bow.position.set(0, R * 0.32, -R * 1.15);
    bow.rotation.y = Math.PI;
    for (const s of [-1, 1]) {
      const loop = addMesh(bow, new THREE.TorusGeometry(0.032, 0.011, 8, 18), mats.ribbon, s * 0.034, 0, 0);
      loop.scale.set(1.2, 0.75, 0.6);
      const tail = addMesh(bow, new THREE.BoxGeometry(0.02, 0.095, 0.004), mats.ribbon, s * 0.018, -0.052, -0.004);
      tail.rotation.z = s * 0.25;
    }
    addMesh(bow, new THREE.SphereGeometry(0.014, 10, 8), mats.ribbon);
    hairGroup.add(bow);
    J.head.add(hairGroup);
  } else if (!female && _coupleParts?.HairSculptM) {
    hairGroup = new THREE.Group();
    const hm = addMesh(hairGroup, _coupleParts.HairSculptM, mats.hair);
    hm.scale.setScalar(R);
    J.head.add(hairGroup);
  } else {
    hairGroup = female ? buildFemaleHair(J.head, R, mats) : buildMaleHair(J.head, R, mats);
  }

  // --- Arms ---
  const armTubeGeo = _coupleParts?.ArmTubeUnit || null;
  for (const side of [1, -1]) {
    const key = side === 1 ? "L" : "R";
    const sh = new THREE.Group();
    sh.position.set(side * D.shoulder, D.chest - 0.062, 0);
    J.chest.add(sh);
    const el = new THREE.Group();
    el.position.y = -D.upper;
    sh.add(el);
    const wr = new THREE.Group();
    wr.position.y = -D.fore;
    el.add(wr);
    J[`sh${key}`] = sh;
    J[`el${key}`] = el;
    J[`wr${key}`] = wr;
    const addUpperArm = (radius) => {
      if (armTubeGeo) {
        const m = addMesh(sh, armTubeGeo, mats.skin);
        m.scale.set(radius, D.upper * 0.93, radius);
        m.position.y = -D.upper * 0.07;
      } else {
        addMesh(sh, limbGeo(radius, radius * 0.85, D.upper, 0.04), mats.skin);
      }
    };
    const addForeArm = (radius) => {
      if (armTubeGeo) {
        const m = addMesh(el, armTubeGeo, mats.skin);
        m.scale.set(radius, D.fore, radius);
      } else {
        addMesh(el, limbGeo(radius, radius * 0.74, D.fore, 0.05), mats.skin);
      }
    };
    if (female) {
      const sleeveKey = side === 1 ? "SleeveF_L" : "SleeveF_R";
      if (_coupleParts?.[sleeveKey]) {
        addMesh(sh, _coupleParts[sleeveKey], mats.dress);
        addMesh(sh, new THREE.TorusGeometry(0.051, 0.005, 6, 20), mats.lace, side * 0.004, -0.095, 0, Math.PI / 2, 0, 0);
      } else {
        addMesh(sh, new THREE.TorusGeometry(0.046, 0.007, 6, 20), mats.lace, side * 0.004, -0.098, 0, Math.PI / 2, 0, 0);
      }
      addUpperArm(0.034);
      addForeArm(0.029);
      if (side === 1) {
        // pearl bracelet
        addMesh(wr, new THREE.TorusGeometry(0.026, 0.0045, 6, 18), mats.white, 0, 0.02, 0, Math.PI / 2, 0, 0);
      }
    } else {
      const sleeveKey = side === 1 ? "SleeveM_L" : "SleeveM_R";
      if (_coupleParts?.[sleeveKey]) {
        addMesh(sh, _coupleParts[sleeveKey], mats.shirt);
        addUpperArm(0.040);
      } else {
        addMesh(sh, limbGeo(0.048, 0.042, D.upper, 0.05), mats.shirt);
        addMesh(el, new THREE.TorusGeometry(0.042, 0.011, 8, 20), mats.shirt, 0, 0.03, 0, Math.PI / 2, 0, 0);
      }
      addForeArm(0.034);
      if (side === 1) {
        addMesh(wr, new THREE.TorusGeometry(0.029, 0.006, 6, 18), mats.belt, 0, 0.022, 0, Math.PI / 2, 0, 0);
        addMesh(wr, new THREE.CylinderGeometry(0.014, 0.014, 0.006, 16), mats.gold, side * 0.029, 0.022, 0, 0, 0, Math.PI / 2);
        addMesh(wr, new THREE.CylinderGeometry(0.011, 0.011, 0.007, 16), mats.watchFace, side * 0.031, 0.022, 0, 0, 0, Math.PI / 2);
      }
    }
    const hand = buildHand(mats, D.hand, side);
    wr.add(hand);
  }

  // --- Legs ---
  for (const side of [1, -1]) {
    const key = side === 1 ? "L" : "R";
    const hip = new THREE.Group();
    hip.position.set(side * D.hipW, -0.02, 0);
    J.pelvis.add(hip);
    const kn = new THREE.Group();
    kn.position.y = -D.thigh;
    hip.add(kn);
    const an = new THREE.Group();
    an.position.y = -D.shin;
    kn.add(an);
    J[`hip${key}`] = hip;
    J[`kn${key}`] = kn;
    J[`an${key}`] = an;
    if (female) {
      addMesh(hip, limbGeo(0.062, 0.042, D.thigh, 0.02), mats.skin);
      addMesh(kn, limbGeo(0.043, 0.028, D.shin, 0.12), mats.skin);
    } else {
      addMesh(hip, limbGeo(0.075, 0.056, D.thigh, 0.03), mats.trouser);
      addMesh(kn, limbGeo(0.057, 0.046, D.shin, 0.02), mats.trouser);
    }
    const shoe = buildShoe(mats, female, female ? 1.0 : 1.12);
    shoe.position.y = -D.foot + 0.012;
    an.add(shoe);
  }

  // --- Skirt (attached to pelvis; deformed per frame for sit / sway) ---
  let skirt = null;
  if (female) {
    skirt = new THREE.Group();
    J.pelvis.add(skirt);
    const skirtLen = D.thigh + 0.04;
    const prof = [];
    const steps = 14;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const y = 0.135 - t * (0.135 + skirtLen);
      const r = 0.098 + Math.pow(t, 0.85) * 0.252;
      prof.push([r, y]);
    }
    const skirtGeo = lathe(prof.reverse(), 72);
    const p = skirtGeo.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const y = p.getY(i);
      const t = clamp((0.12 - y) / (0.12 + skirtLen), 0, 1);
      const a = Math.atan2(z, x);
      const pleat = 1 + Math.sin(a * 16) * 0.045 * t;
      p.setX(i, x * pleat);
      p.setZ(i, z * pleat * (0.74 + 0.12 * t));
    }
    skirtGeo.computeVertexNormals();
    skirtGeo.userData.base = Float32Array.from(p.array);
    const skirtMesh = addMesh(skirt, skirtGeo, mats.dress);
    // lace petticoat hem
    const hemY = 0.135 - (0.135 + skirtLen);
    const hem = addMesh(
      skirt,
      lathe(
        [
          [0.36, hemY - 0.035],
          [0.352, hemY + 0.01],
        ],
        72
      ),
      mats.lace
    );
    hem.scale.z = 0.86;
    skirt.userData = { mesh: skirtMesh, hem, hemY };
  }

  // --- Name tag ---
  const tag = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: makeTagTexture(def.name, def.tagColor), transparent: true, depthWrite: false, depthTest: true })
  );
  tag.scale.set(0.42, 0.13, 1);
  tag.position.y = hipY + D.spine + D.chest + D.neck + R * 2 + 0.25;
  tag.renderOrder = 5;
  root.add(tag);

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  face.castShadow = false;

  return { root, body, J, mats, faceMat, faceTex, hairGroup, skirt, tag, hipY, dims: D };
}

// ---------------------------------------------------------------------------
// Pose model
// ---------------------------------------------------------------------------

const JOINT_KEYS = [
  "pelvisY", "pelvisX", "pelvisZ", "pelvisYaw", "spineX", "spineZ", "chestX", "chestYaw", "neckX", "headX", "headY", "headZ",
  "shLx", "shLy", "shLz", "elLx", "elLy", "wrLx", "shRx", "shRy", "shRz", "elRx", "elRy", "wrRx",
  "hipLx", "hipLz", "knLx", "anLx", "hipRx", "hipRz", "knRx", "anRx",
];

function zeroPose() {
  const p = {};
  for (const k of JOINT_KEYS) p[k] = 0;
  p.shLz = 0.12;
  p.shRz = -0.12;
  p.elLx = -0.12;
  p.elRx = -0.12;
  return p;
}

export class CoupleCharacter {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    const built = buildCharacter(def);
    Object.assign(this, built);
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.walkPhase = Math.random() * TAU;
    this.time = Math.random() * 10;
    this.pose = zeroPose();
    this.target = zeroPose();
    this.blinkTimer = 2 + Math.random() * 3;
    this.blinkLeft = 0;
    this.expr = "open";
    this.exprOverride = null;
    this.state = "stand"; // stand | sit | lie | carried
    this.action = null; // { name, t, dur, data }
    this.lookTarget = null;
    this.rootQuat = null; // when set (lie/carried), overrides yaw
    this.skirtSway = 0;
    this.hairSway = 0;
    this.handTarget = null;
    this.reachT = 0;
    this.root.userData.coupleId = def.id;
  }

  setVisibleHead(v) {
    this.J.head.visible = v;
  }

  setExpression(e) {
    this.exprOverride = e;
  }

  startAction(name, dur = 2.4, data = {}) {
    this.action = { name, t: 0, dur, data };
  }

  clearAction() {
    this.action = null;
  }

  place(x, y, z, yaw) {
    this.pos.set(x, y, z);
    if (typeof yaw === "number") this.yaw = yaw;
  }

  _locomotion(T, dt) {
    const sp = this.speed;
    const run = clamp((sp - 2.2) / 2.0, 0, 1);
    const walk = clamp(sp / 1.2, 0, 1);
    const stride = lerp(1.25, 1.9, run);
    this.walkPhase += (sp * dt * TAU) / stride;
    const ph = this.walkPhase;
    const amp = lerp(0.42, 0.78, run) * walk;
    const breath = Math.sin(this.time * 1.7) * 0.012;
    T.hipLx = -Math.sin(ph) * amp;
    T.hipRx = Math.sin(ph) * amp;
    T.knLx = Math.max(0, Math.sin(ph + 1.4)) * amp * 1.5 + 0.04;
    T.knRx = Math.max(0, Math.sin(ph + 1.4 + Math.PI)) * amp * 1.5 + 0.04;
    T.anLx = -T.knLx * 0.35 + Math.sin(ph) * amp * 0.25;
    T.anRx = -T.knRx * 0.35 - Math.sin(ph) * amp * 0.25;
    T.pelvisY = -Math.abs(Math.cos(ph)) * 0.028 * walk + (1 - walk) * breath * 0.3;
    T.pelvisYaw = Math.sin(ph) * 0.09 * walk;
    T.chestYaw = -Math.sin(ph) * 0.13 * walk;
    T.spineX = 0.04 * walk + run * 0.12;
    T.chestX = breath;
    T.shLx = Math.sin(ph) * amp * 0.7;
    T.shRx = -Math.sin(ph) * amp * 0.7;
    T.elLx = -0.18 - Math.max(0, Math.sin(ph)) * amp * 0.5 - run * 0.9;
    T.elRx = -0.18 - Math.max(0, -Math.sin(ph)) * amp * 0.5 - run * 0.9;
    T.headX = -T.spineX * 0.6;
    if (this.def.gender === "f" && walk < 0.2) {
      // relaxed weight shift
      T.pelvisZ = Math.sin(this.time * 0.6) * 0.025;
      T.hipLz = -T.pelvisZ;
      T.hipRz = -T.pelvisZ;
    }
  }

  _applyAction(T, dt) {
    const a = this.action;
    const female = this.def.gender === "f";
    const s = this.state;
    if (s === "sit") {
      T.hipLx = -1.52;
      T.hipRx = -1.52;
      T.knLx = 1.5;
      T.knRx = 1.5;
      T.anLx = 0.05;
      T.anRx = 0.05;
      T.hipLz = female ? -0.04 : 0.1;
      T.hipRz = female ? 0.04 : -0.1;
      T.pelvisY = 0;
      T.spineX = -0.06;
      T.shLx = -0.35;
      T.shRx = -0.35;
      T.elLx = -0.9;
      T.elRx = -0.9;
      T.shLz = 0.05;
      T.shRz = -0.05;
    } else if (s === "lie") {
      T.hipLx = -0.06;
      T.hipRx = -0.08;
      T.knLx = 0.14;
      T.knRx = 0.2;
      T.shLz = 0.32;
      T.shRz = -0.32;
      T.elLx = -0.35;
      T.elRx = -0.35;
      T.headX = -0.2;
    } else if (s === "carried") {
      T.hipLx = -1.45;
      T.hipRx = -1.35;
      T.knLx = 1.35;
      T.knRx = 1.2;
      T.spineX = 0.18;
      // one arm around his neck, other resting on chest
      T.shRx = -2.2;
      T.shRz = 0.25;
      T.elRx = -1.1;
      T.shLx = -0.8;
      T.shLz = -0.2;
      T.elLx = -1.6;
      T.headX = -0.3;
      T.headY = -0.4;
    }

    if (this.reachT > 0) {
      this.reachT = Math.max(0, this.reachT - dt);
      const k = Math.sin(Math.min(1, this.reachT / 1.2) * Math.PI);
      T.shRx = lerp(T.shRx, -1.35, k);
      T.elRx = lerp(T.elRx, -0.25, k);
      T.spineX += 0.15 * k;
    }

    if (!a) return;
    a.t += dt;
    const u = clamp(a.t / a.dur, 0, 1);
    const env = Math.min(1, a.t / 0.35, (a.dur - a.t) / 0.35);
    const e = Math.max(0, env);
    const mix = (key, v) => {
      T[key] = lerp(T[key], v, e);
    };
    switch (a.name) {
      case "hug":
        mix("shLx", -1.25);
        mix("shRx", -1.25);
        mix("shLz", female ? 0.55 : 0.35);
        mix("shRz", female ? -0.55 : -0.35);
        mix("shLy", -0.6);
        mix("shRy", 0.6);
        mix("elLx", -1.25);
        mix("elRx", -1.25);
        mix("elLy", 0.6);
        mix("elRy", -0.6);
        if (female) {
          mix("headY", 0.55);
          mix("headZ", 0.15);
          mix("pelvisY", 0.03);
          mix("anLx", 0.4);
          mix("anRx", 0.4);
        } else {
          mix("headX", 0.32);
          mix("spineX", 0.08);
        }
        break;
      case "kiss": {
        mix("shLx", female ? -1.0 : -0.75);
        mix("shRx", female ? -1.0 : -0.75);
        mix("shLz", 0.25);
        mix("shRz", -0.25);
        mix("elLx", -1.1);
        mix("elRx", -1.1);
        if (female) {
          mix("pelvisY", 0.07);
          mix("anLx", 0.75);
          mix("anRx", 0.75);
          mix("knRx", 0.9);
          mix("hipRx", 0.55);
          mix("headX", -0.32);
          mix("headZ", -0.18);
        } else {
          mix("spineX", 0.14);
          mix("neckX", 0.2);
          mix("headX", 0.38);
          mix("headZ", 0.2);
        }
        break;
      }
      case "pat":
        if (a.data.giver) {
          mix("shRx", -2.5);
          mix("shRz", 0.3);
          mix("elRx", -0.7);
          mix("wrRx", Math.sin(a.t * 9) * 0.25);
        } else {
          mix("headX", 0.22);
          mix("headZ", 0.12);
          mix("shLx", -0.2);
          mix("shRx", -0.2);
          mix("elLx", -1.9);
          mix("elRx", -1.9);
          mix("shLz", -0.25);
          mix("shRz", 0.25);
        }
        break;
      case "heart":
        // two arms forming a heart over the head
        mix("shLx", -2.7);
        mix("shRx", -2.7);
        mix("shLz", 0.5);
        mix("shRz", -0.5);
        mix("elLx", -1.4);
        mix("elRx", -1.4);
        mix("elLy", 0.4);
        mix("elRy", -0.4);
        mix("pelvisZ", Math.sin(a.t * 4) * 0.05);
        break;
      case "wave":
        mix("shLx", -0.4);
        mix("shLz", 2.4);
        mix("elLx", -0.5);
        mix("elLy", Math.sin(a.t * 10) * 0.6);
        mix("headZ", 0.15);
        break;
      case "dance": {
        const w = a.t * 5.5;
        mix("shLx", -0.9);
        mix("shRx", -0.9);
        mix("shLz", 0.9);
        mix("shRz", -0.9);
        mix("elLx", -0.6);
        mix("elRx", -0.6);
        mix("pelvisY", Math.abs(Math.sin(w)) * 0.05);
        mix("hipLx", -Math.max(0, Math.sin(w)) * 0.45);
        mix("hipRx", -Math.max(0, -Math.sin(w)) * 0.45);
        mix("knLx", Math.max(0, Math.sin(w)) * 0.8);
        mix("knRx", Math.max(0, -Math.sin(w)) * 0.8);
        mix("headZ", Math.sin(w) * 0.12);
        break;
      }
      case "carry":
        mix("shLx", -1.1);
        mix("shRx", -1.1);
        mix("shLz", 0.2);
        mix("shRz", -0.2);
        mix("elLx", -1.05);
        mix("elRx", -1.05);
        mix("spineX", -0.1);
        mix("headX", 0.2);
        break;
      case "holdhand": {
        const side = a.data.side; // +1: partner on my left
        if (side > 0) {
          mix("shLz", 0.22);
          mix("shLx", -0.15);
          mix("elLx", -0.25);
        } else {
          mix("shRz", -0.22);
          mix("shRx", -0.15);
          mix("elRx", -0.25);
        }
        break;
      }
      case "clap":
        mix("shLx", -0.95);
        mix("shRx", -0.95);
        mix("shLy", -0.5);
        mix("shRy", 0.5);
        mix("elLx", -1.2 + Math.sin(a.t * 14) * 0.15);
        mix("elRx", -1.2 + Math.sin(a.t * 14) * 0.15);
        break;
      case "hop":
        mix("pelvisY", Math.max(0, Math.sin(u * Math.PI)) * 0.3);
        mix("knLx", 0.5);
        mix("knRx", 0.5);
        mix("shLz", 1.0);
        mix("shRz", -1.0);
        break;
      default:
        break;
    }
    if (a.t >= a.dur && !a.data.hold) this.action = null;
  }

  update(dt) {
    this.time += dt;
    const T = this.target;
    const Z = zeroPose();
    for (const k of JOINT_KEYS) T[k] = Z[k];
    if (this.state === "stand") this._locomotion(T, dt);
    this._applyAction(T, dt);

    // Head look-at (yaw only, limited)
    if (this.lookTarget && this.state !== "carried") {
      const dx = this.lookTarget.x - this.pos.x;
      const dz = this.lookTarget.z - this.pos.z;
      const want = Math.atan2(-dx, -dz);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      T.headY += clamp(d, -0.9, 0.9) * 0.7;
      const dy = this.lookTarget.y - (this.pos.y + this.hipY + 0.6);
      const dist = Math.max(0.3, Math.hypot(dx, dz));
      T.headX += clamp(-Math.atan2(dy, dist), -0.5, 0.5) * 0.6;
    }

    const k = clamp(dt * 11, 0, 1);
    const P = this.pose;
    for (const key of JOINT_KEYS) P[key] = lerp(P[key], T[key], k);

    const J = this.J;
    J.pelvis.position.y = this.hipY + P.pelvisY;
    J.pelvis.rotation.set(P.pelvisX, P.pelvisYaw, P.pelvisZ);
    J.spine.rotation.set(P.spineX, 0, P.spineZ);
    J.chest.rotation.set(P.chestX, P.chestYaw, 0);
    J.neck.rotation.set(P.neckX, 0, 0);
    J.head.rotation.set(P.headX, P.headY, P.headZ, "YXZ");
    J.shL.rotation.set(P.shLx, P.shLy, P.shLz);
    J.shR.rotation.set(P.shRx, P.shRy, P.shRz);
    J.elL.rotation.set(P.elLx, P.elLy, 0);
    J.elR.rotation.set(P.elRx, P.elRy, 0);
    J.wrL.rotation.set(P.wrLx, 0, 0);
    J.wrR.rotation.set(P.wrRx, 0, 0);
    J.hipL.rotation.set(P.hipLx, 0, P.hipLz);
    J.hipR.rotation.set(P.hipRx, 0, P.hipRz);
    J.knL.rotation.set(P.knLx, 0, 0);
    J.knR.rotation.set(P.knRx, 0, 0);
    J.anL.rotation.set(P.anLx, 0, 0);
    J.anR.rotation.set(P.anRx, 0, 0);

    // Secondary motion: hair & skirt sway
    this.hairSway = lerp(this.hairSway, this.speed * 0.05 + Math.sin(this.time * 1.3) * 0.015, clamp(dt * 3, 0, 1));
    this.hairGroup.rotation.x = this.def.gender === "f" ? -this.hairSway * 0.25 : 0;
    if (this.skirt) {
      const sitting = this.state === "sit" || this.state === "carried";
      const sk = this.skirt;
      const sway = Math.sin(this.time * 2.2) * 0.02 + Math.sin(this.walkPhase) * 0.03 * clamp(this.speed, 0, 1);
      const spinning = this.action && this.action.name === "dance" ? 1 : 0;
      this.skirtSway = lerp(this.skirtSway, spinning, clamp(dt * 3, 0, 1));
      if (sitting) {
        sk.scale.set(1.12, 0.62, 1.95);
        sk.position.set(0, 0.03, 0.17);
        sk.rotation.set(0.15, 0, 0);
      } else {
        const flare = 1 + this.skirtSway * 0.22;
        sk.scale.set(flare, 1 - this.skirtSway * 0.08, flare);
        sk.position.set(0, 0, 0);
        sk.rotation.set(-this.speed * 0.05, 0, sway);
      }
    }

    // Blink / expression
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkLeft = 0.12;
      this.blinkTimer = 2.4 + Math.random() * 3.6;
    }
    if (this.blinkLeft > 0) this.blinkLeft -= dt;
    let expr = this.exprOverride || "open";
    if (expr === "open" && this.blinkLeft > 0) expr = "blink";
    if (expr !== this.expr) {
      this.expr = expr;
      this.faceMat.map = this.faceTex[expr] || this.faceTex.open;
      this.faceMat.needsUpdate = true;
    }

    // Root transform
    this.root.position.copy(this.pos);
    if (this.rootQuat) {
      this.root.quaternion.copy(this.rootQuat);
    } else {
      this.root.quaternion.setFromAxisAngle(_UP, this.yaw);
    }
  }

  // World-space head/eye position
  getEyeWorld(out = new THREE.Vector3()) {
    this.J.head.updateWorldMatrix(true, false);
    return out.set(0, 0.01, this.dims.headR * 0.85).applyMatrix4(this.J.head.matrixWorld);
  }

  getHeadWorld(out = new THREE.Vector3()) {
    this.J.head.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.J.head.matrixWorld);
  }
}

const _UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// Floating heart particles
// ---------------------------------------------------------------------------

export function createHeartBurst(scene, count = 48) {
  const pool = [];
  const group = new THREE.Group();
  group.name = "CoupleHearts";
  scene.add(group);
  const tex = getHeartTexture();
  for (let i = 0; i < count; i += 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false;
    s.renderOrder = 6;
    group.add(s);
    pool.push({ s, life: 0, max: 1, vel: new THREE.Vector3(), phase: 0, size: 0.1 });
  }
  let cursor = 0;
  return {
    group,
    burst(pos, n = 10, spread = 0.25) {
      for (let i = 0; i < n; i += 1) {
        const p = pool[cursor];
        cursor = (cursor + 1) % pool.length;
        p.s.position.set(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random() * 0.1, pos.z + (Math.random() - 0.5) * spread);
        p.vel.set((Math.random() - 0.5) * 0.25, 0.45 + Math.random() * 0.45, (Math.random() - 0.5) * 0.25);
        p.max = 1.4 + Math.random() * 1.1;
        p.life = p.max;
        p.phase = Math.random() * TAU;
        p.size = 0.07 + Math.random() * 0.09;
        p.s.visible = true;
      }
    },
    update(dt) {
      for (const p of pool) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.s.visible = false;
          continue;
        }
        p.phase += dt * 3;
        p.s.position.addScaledVector(p.vel, dt);
        p.s.position.x += Math.sin(p.phase) * 0.004;
        const u = 1 - p.life / p.max;
        p.s.material.opacity = Math.min(1, u * 6) * Math.min(1, p.life * 1.5);
        const sc = p.size * (0.6 + Math.min(1, u * 4) * 0.4);
        p.s.scale.set(sc, sc, sc);
      }
    },
  };
}

export function createCouple() {
  const xian = new CoupleCharacter(COUPLE_DEFS.xian);
  const ran = new CoupleCharacter(COUPLE_DEFS.ran);
  const group = new THREE.Group();
  group.name = "XianXian_RanZi_Couple";
  group.add(xian.root, ran.root);
  return { group, xian, ran };
}
