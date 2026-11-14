// Stylized Blender Trees, Photogrammetry Flora, Sculpted Rose/Wildflower Sea & Interaction FX (Babylon 9.36).

import "@babylonjs/core/Meshes/thinInstanceMesh";
import { Engine } from "@babylonjs/core/Engines/engine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { instantiateGLB } from "./assets-loader.js";
import {
  COTTAGE_SPUR_TRAILS,
  EAST_HARBOR_BRIDGE_TRAIL,
  NORTH_WINDMILL_TRAIL,
  WEST_GAZEBO_TRAIL,
  clamp,
  distToPolyline2D,
  fbm2,
  getTerrainNormal,
  getWorldTerrainY,
  hexToColor3,
  isMeadowFloraAllowed,
  lerp,
  makePbrMat,
  mulberry32,
  registerCircleCollider,
  smoothstep,
} from "./world-spatial.js";

const _UP = new Vector3(0, 1, 0);

export function easeOutBack(u) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
}

function hexToColor4(hex, alpha = 1) {
  const c = hexToColor3(hex);
  return new Color4(c.r, c.g, c.b, alpha);
}

function hslToColor3(h, s, l) {
  const hh = ((h % 1) + 1) % 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return new Color3(
    clamp(hue2rgb(hh + 1 / 3), 0, 1),
    clamp(hue2rgb(hh), 0, 1),
    clamp(hue2rgb(hh - 1 / 3), 0, 1)
  );
}

function slopeQuatFromNormal(nrm, blendUp = 0.68, yaw = 0) {
  const n = new Vector3(
    lerp(0, nrm.x, 1 - blendUp),
    lerp(1, nrm.y, 1 - blendUp),
    lerp(0, nrm.z, 1 - blendUp)
  ).normalize();
  const axis = Vector3.Cross(_UP, n);
  let qSlope = Quaternion.Identity();
  if (axis.lengthSquared() > 1e-6) {
    axis.normalize();
    qSlope = Quaternion.RotationAxis(axis, Math.acos(clamp(Vector3.Dot(_UP, n), -1, 1)));
  }
  const qYaw = Quaternion.RotationAxis(_UP, yaw);
  return qSlope.multiply(qYaw);
}

function composeMatArray(x, y, z, q, sx, sy, sz, outBuf, idx) {
  const m = Matrix.Compose(new Vector3(sx, sy, sz), q, new Vector3(x, y, z));
  m.copyToArray(outBuf, idx * 16);
  return m;
}

function buildVertexMesh(name, scene, parent, { positions, normals, uvs, colors, indices }) {
  const mesh = new Mesh(name, scene);
  if (parent) mesh.parent = parent;
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  if (normals && normals.length === positions.length) {
    vd.normals = normals;
  } else {
    const comp = new Float32Array(positions.length);
    VertexData.ComputeNormals(positions, indices, comp, { useRightHandedSystem: true });
    vd.normals = comp;
  }
  if (uvs) vd.uvs = uvs;
  if (colors) vd.colors = colors;
  vd.applyToMesh(mesh, false);
  mesh.isPickable = false;
  return mesh;
}

function appendTransformedPart(dst, srcGeo, dx, dy, dz, rx, ry, rz, sx, sy, sz, vertexCol = null) {
  const q = Quaternion.RotationYawPitchRoll(ry, rx, rz);
  const m = Matrix.Compose(new Vector3(sx, sy, sz), q, new Vector3(dx, dy, dz));
  const baseV = dst.positions.length / 3;
  const vCount = srcGeo.positions.length / 3;
  const tmpP = new Vector3();
  const tmpN = new Vector3();

  for (let i = 0; i < vCount; i += 1) {
    tmpP.set(srcGeo.positions[i * 3], srcGeo.positions[i * 3 + 1], srcGeo.positions[i * 3 + 2]);
    Vector3.TransformCoordinatesToRef(tmpP, m, tmpP);
    dst.positions.push(tmpP.x, tmpP.y, tmpP.z);

    if (srcGeo.normals) {
      tmpN.set(srcGeo.normals[i * 3], srcGeo.normals[i * 3 + 1], srcGeo.normals[i * 3 + 2]);
      Vector3.TransformNormalToRef(tmpN, m, tmpN);
      tmpN.normalize();
      dst.normals.push(tmpN.x, tmpN.y, tmpN.z);
    }
    const c = srcGeo.colors
      ? [srcGeo.colors[i * 4], srcGeo.colors[i * 4 + 1], srcGeo.colors[i * 4 + 2], srcGeo.colors[i * 4 + 3]]
      : vertexCol || [1, 1, 1, 1];
    dst.colors.push(c[0], c[1], c[2], c[3]);
  }
  for (let i = 0; i < srcGeo.indices.length; i += 1) {
    dst.indices.push(baseV + srcGeo.indices[i]);
  }
}

// ---------------------------------------------------------------------------
// 1. Interaction FX System (Additive Glow Sparks, Sculpted Petals, Ripples)
// ---------------------------------------------------------------------------

export function createInteractionFX(
  parent,
  { name = "InteractionFX", maxSparks = 420, maxPetals = 200, maxRings = 12, scene: optScene = null } = {}
) {
  const scene = optScene || parent?.getScene?.();
  const root = new TransformNode(name, scene);
  if (parent) root.parent = parent;
  const rng = mulberry32(77031 + maxSparks);
  const pick = (arr, i) => arr[i % arr.length];

  // --- Glow Sparks (Camera-Aligned Dynamic Billboard Quads, Zero gl_PointSize Clamp) ---
  const sparks = [];
  for (let i = 0; i < maxSparks; i += 1) {
    sparks.push({
      on: false,
      x: 0,
      y: -999,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      max: 1,
      size: 0.1,
      grav: 0,
      drag: 0,
      flick: 0,
      ph: 0,
      r: 1,
      g: 0.95,
      b: 0.78,
    });
  }

  const sparkPositions = new Float32Array(maxSparks * 4 * 3);
  const sparkUvs = new Float32Array(maxSparks * 4 * 2);
  const sparkColors = new Float32Array(maxSparks * 4 * 4);
  const sparkIndices = new Uint16Array(maxSparks * 6);
  for (let i = 0; i < maxSparks; i += 1) {
    const uvBase = i * 8;
    sparkUvs[uvBase + 0] = 0;
    sparkUvs[uvBase + 1] = 0;
    sparkUvs[uvBase + 2] = 1;
    sparkUvs[uvBase + 3] = 0;
    sparkUvs[uvBase + 4] = 1;
    sparkUvs[uvBase + 5] = 1;
    sparkUvs[uvBase + 6] = 0;
    sparkUvs[uvBase + 7] = 1;
    const vb = i * 4;
    const ib = i * 6;
    sparkIndices[ib + 0] = vb;
    sparkIndices[ib + 1] = vb + 1;
    sparkIndices[ib + 2] = vb + 2;
    sparkIndices[ib + 3] = vb;
    sparkIndices[ib + 4] = vb + 2;
    sparkIndices[ib + 5] = vb + 3;
    for (let k = 0; k < 4; k += 1) sparkPositions[(vb + k) * 3 + 1] = -999;
  }

  const sparkMesh = new Mesh(`${name}_Sparks`, scene);
  sparkMesh.parent = root;
  sparkMesh.setVerticesData("position", sparkPositions, true);
  sparkMesh.setVerticesData("uv", sparkUvs, false);
  sparkMesh.setVerticesData("color", sparkColors, true);
  sparkMesh.setIndices(sparkIndices);
  sparkMesh.alwaysSelectAsActiveMesh = true;
  sparkMesh.isPickable = false;
  sparkMesh.isVisible = false;

  const sparkTex = new DynamicTexture(`${name}_SparkTex`, 64, scene, false);
  const sCtx = sparkTex.getContext();
  const sGrd = sCtx.createRadialGradient(32, 32, 1, 32, 32, 31);
  sGrd.addColorStop(0.0, "rgba(255,255,255,1)");
  sGrd.addColorStop(0.28, "rgba(255,250,235,0.9)");
  sGrd.addColorStop(0.65, "rgba(255,220,195,0.34)");
  sGrd.addColorStop(1.0, "rgba(255,220,195,0)");
  sCtx.fillStyle = sGrd;
  sCtx.fillRect(0, 0, 64, 64);
  sparkTex.hasAlpha = true;
  sparkTex.update();

  const sparkMat = new StandardMaterial(`${name}_SparkMat`, scene);
  sparkMat.diffuseTexture = sparkTex;
  sparkMat.emissiveTexture = sparkTex;
  sparkMat.opacityTexture = sparkTex;
  sparkMat.emissiveColor = new Color3(0.95, 0.92, 0.94);
  sparkMat.disableLighting = true;
  sparkMat.useAlphaFromDiffuseTexture = true;
  sparkMat.backFaceCulling = false;
  sparkMat.alphaMode = Engine.ALPHA_COMBINE;
  sparkMat.disableDepthWrite = true;
  sparkMesh.material = sparkMat;
  scene.getGlowLayerByName?.("EstateGlow")?.addExcludedMesh?.(sparkMesh);

  let sparkCursor = 0;
  let sparkActive = 0;

  function spark(x, y, z, vx, vy, vz, o = {}) {
    let idx = -1;
    for (let k = 0; k < maxSparks; k += 1) {
      const c = (sparkCursor + k) % maxSparks;
      if (!sparks[c].on) {
        idx = c;
        break;
      }
    }
    if (idx < 0) idx = sparkCursor;
    sparkCursor = (idx + 1) % maxSparks;
    const s = sparks[idx];
    if (!s.on) sparkActive += 1;
    s.on = true;
    s.x = x;
    s.y = y;
    s.z = z;
    s.vx = vx;
    s.vy = vy;
    s.vz = vz;
    s.max = o.life ?? 1.4;
    s.life = s.max;
    s.size = o.size ?? 0.09;
    s.grav = o.gravity ?? 0.0;
    s.drag = o.drag ?? 0.6;
    s.flick = o.flicker ?? 0.0;
    s.ph = rng() * 6.283;
    const col = hexToColor3(o.color ?? 0xfff1c8);
    s.r = col.r;
    s.g = col.g;
    s.b = col.b;
    sparkMesh.isVisible = true;
    return s;
  }

  function burst(origin, o = {}) {
    const n = o.count ?? 40;
    const [smin, smax] = o.speed ?? [0.6, 1.8];
    const up = o.up ?? 0.6;
    const spread = o.spread ?? 0.12;
    const colors = o.colors ?? [0xfff1c8, 0xffc4d6, 0xffffff];
    for (let i = 0; i < n; i += 1) {
      const th = rng() * Math.PI * 2;
      const ph = Math.acos(1 - 2 * rng());
      let dx = Math.sin(ph) * Math.cos(th);
      let dy = Math.cos(ph);
      let dz = Math.sin(ph) * Math.sin(th);
      if (o.hemi !== false) dy = Math.abs(dy);
      dy += up;
      const len = Math.hypot(dx, dy, dz) || 1;
      const sp = smin + (smax - smin) * rng();
      spark(
        origin.x + (rng() - 0.5) * spread,
        origin.y + (rng() - 0.5) * spread,
        origin.z + (rng() - 0.5) * spread,
        (dx / len) * sp,
        (dy / len) * sp,
        (dz / len) * sp,
        {
          color: pick(colors, i),
          life: (o.life ?? 1.6) * (0.7 + rng() * 0.6),
          size: (o.size ?? 0.09) * (0.7 + rng() * 0.6),
          gravity: o.gravity ?? 0.9,
          drag: o.drag ?? 0.9,
          flicker: o.flicker ?? 0.0,
        }
      );
    }
  }

  function heart(origin, o = {}) {
    const n = o.count ?? 48;
    const scale = o.scale ?? 0.05;
    const yaw = o.yaw ?? 0;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    for (let i = 0; i < n; i += 1) {
      const t = (i / n) * Math.PI * 2;
      const hx = 16 * Math.pow(Math.sin(t), 3);
      const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      spark(
        origin.x + (rng() - 0.5) * 0.08,
        origin.y + (rng() - 0.5) * 0.06,
        origin.z + (rng() - 0.5) * 0.08,
        (hx * cy + (rng() - 0.5) * 4.0 * sy) * scale,
        hy * scale + (o.rise ?? 0.25),
        (-hx * sy + (rng() - 0.5) * 4.0 * cy) * scale,
        {
          color: pick(o.colors ?? [0xff5c8a, 0xff8fb1, 0xffd1dc], i),
          life: o.life ?? 1.5,
          size: o.size ?? 0.085,
          gravity: 0.0,
          drag: o.drag ?? 1.35,
          flicker: 0.25,
        }
      );
    }
  }

  // --- Sculpted Petals (ThinInstance Pool) ---
  const pPos = [];
  const pIdx = [];
  const pRows = 3;
  const pCols = 3;
  for (let iy = 0; iy < pRows; iy += 1) {
    const v = iy / (pRows - 1);
    const y = (v - 0.5) * 0.095;
    const env = Math.sin(Math.pow(clamp(v, 0.02, 0.98), 0.75) * Math.PI);
    for (let ix = 0; ix < pCols; ix += 1) {
      const u = ix / (pCols - 1) - 0.5;
      const x = u * 0.075 * (0.3 + 0.85 * env);
      const z = 0.016 * (1 - v * v) - 0.012 * Math.abs(x * 12);
      pPos.push(x, y, z);
    }
  }
  for (let iy = 0; iy < pRows - 1; iy += 1) {
    for (let ix = 0; ix < pCols - 1; ix += 1) {
      const a = iy * pCols + ix;
      const b = a + 1;
      const c = a + pCols;
      const d = c + 1;
      pIdx.push(a, c, b, b, c, d);
    }
  }
  const petalMesh = buildVertexMesh(`${name}_Petals`, scene, root, { positions: pPos, indices: pIdx });
  const petalMat = new StandardMaterial(`${name}_PetalMat`, scene);
  petalMat.diffuseColor = new Color3(1, 1, 1);
  petalMat.emissiveColor = new Color3(0.14, 0.06, 0.09);
  petalMat.specularColor = new Color3(0.08, 0.08, 0.08);
  petalMat.backFaceCulling = false;
  petalMat.twoSidedLighting = true;
  petalMesh.material = petalMat;
  petalMesh.alwaysSelectAsActiveMesh = true;
  petalMesh.isVisible = false;

  const pMatBuf = new Float32Array(maxPetals * 16);
  const pColBuf = new Float32Array(maxPetals * 4);
  const hiddenMat = Matrix.Compose(new Vector3(0.0001, 0.0001, 0.0001), Quaternion.Identity(), new Vector3(0, -999, 0));
  const petals = [];
  for (let i = 0; i < maxPetals; i += 1) {
    petals.push({
      on: false,
      x: 0,
      y: -999,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      max: 1,
      floorY: -50,
      wx: 0,
      wz: 0,
      ph: 0,
      spin: 1,
      sc: 1,
      landed: false,
      flowFn: null,
    });
    hiddenMat.copyToArray(pMatBuf, i * 16);
    pColBuf[i * 4 + 0] = 1;
    pColBuf[i * 4 + 1] = 1;
    pColBuf[i * 4 + 2] = 1;
    pColBuf[i * 4 + 3] = 1;
  }
  petalMesh.thinInstanceSetBuffer("matrix", pMatBuf, 16, false);
  petalMesh.thinInstanceSetBuffer("color", pColBuf, 4, false);

  let petalCursor = 0;
  let petalActive = 0;

  function petal(x, y, z, vx, vy, vz, o = {}) {
    let idx = -1;
    for (let k = 0; k < maxPetals; k += 1) {
      const c = (petalCursor + k) % maxPetals;
      if (!petals[c].on) {
        idx = c;
        break;
      }
    }
    if (idx < 0) idx = petalCursor;
    petalCursor = (idx + 1) % maxPetals;
    const p = petals[idx];
    if (!p.on) petalActive += 1;
    p.on = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.max = o.life ?? 5.0;
    p.life = p.max;
    p.floorY = o.floorY ?? -50;
    p.wx = o.driftX ?? 0;
    p.wz = o.driftZ ?? 0;
    p.flowFn = o.flowFn || null;
    p.ph = rng() * 6.283;
    p.spin = 1.2 + rng() * 2.4;
    p.sc = (o.scale ?? 1.0) * (0.8 + rng() * 0.5);
    p.landed = false;
    const c = hexToColor3(o.color ?? 0xf6a8c0);
    pColBuf[idx * 4 + 0] = c.r;
    pColBuf[idx * 4 + 1] = c.g;
    pColBuf[idx * 4 + 2] = c.b;
    pColBuf[idx * 4 + 3] = 1;
    petalMesh.thinInstanceBufferUpdated("color");
    petalMesh.isVisible = true;
    return p;
  }

  function petalBurst(origin, o = {}) {
    const n = o.count ?? 40;
    const colors = o.colors ?? [0xfad4e0, 0xfff5f8, 0xeb7696, 0xc92a49, 0xf6c2d2];
    const [smin, smax] = o.speed ?? [0.4, 1.4];
    const radius = o.radius ?? 0.2;
    for (let i = 0; i < n; i += 1) {
      const th = rng() * Math.PI * 2;
      const r = rng() * radius;
      const sp = smin + (smax - smin) * rng();
      petal(
        origin.x + Math.cos(th) * r,
        origin.y + (rng() - 0.3) * (o.height ?? 0.3),
        origin.z + Math.sin(th) * r,
        Math.cos(th) * sp,
        (o.up ?? 1.2) * (0.5 + rng()),
        Math.sin(th) * sp,
        {
          color: pick(colors, i),
          life: (o.life ?? 5.0) * (0.75 + rng() * 0.5),
          floorY: o.floorY,
          driftX: o.driftX,
          driftZ: o.driftZ,
          flowFn: o.flowFn,
          scale: o.scale,
        }
      );
    }
  }

  // --- Water Ripple Rings ---
  const ringPos = [];
  const ringIdx = [];
  const ringSegs = 40;
  for (let i = 0; i <= ringSegs; i += 1) {
    const a = (i / ringSegs) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    ringPos.push(ca * 0.86, 0, sa * 0.86, ca, 0, sa);
    if (i < ringSegs) {
      const b = i * 2;
      ringIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const rings = [];
  for (let i = 0; i < maxRings; i += 1) {
    const m = buildVertexMesh(`${name}_Ring_${i}`, scene, root, { positions: ringPos, indices: ringIdx });
    const mat = new StandardMaterial(`${name}_RingMat_${i}`, scene);
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mat.alpha = 0;
    m.material = mat;
    m.isVisible = false;
    scene.getGlowLayerByName?.("EstateGlow")?.addExcludedMesh?.(m);
    rings.push({ mesh: m, mat, on: false, t: 0, dur: 1, r0: 0.1, r1: 1, op: 0.6, delay: 0 });
  }
  let ringCursor = 0;

  function ripple(pos, o = {}) {
    const r = rings[ringCursor];
    ringCursor = (ringCursor + 1) % maxRings;
    r.on = true;
    r.t = 0;
    r.dur = o.life ?? 1.6;
    r.r0 = o.r0 ?? 0.08;
    r.r1 = o.radius ?? 1.1;
    r.op = o.opacity ?? 0.7;
    r.delay = o.delay ?? 0;
    r.mat.emissiveColor = hexToColor3(o.color ?? 0xffffff).scale(0.8);
    r.mesh.position.set(pos.x, pos.y + 0.015, pos.z);
    r.mesh.isVisible = false;
  }

  // --- Timed Tasks ---
  const tasks = [];
  function addTask(duration, fn, onDone) {
    const task = { t: 0, dur: Math.max(0.001, duration), fn, onDone, dead: false };
    tasks.push(task);
    return task;
  }

  function emit(duration, rate, spawnFn) {
    let acc = 0;
    let i = 0;
    return addTask(duration, (u, dt) => {
      acc += dt * rate;
      while (acc >= 1) {
        acc -= 1;
        spawnFn(i, u);
        i += 1;
      }
    });
  }

  const camRight = new Vector3(1, 0, 0);
  const camUp = new Vector3(0, 1, 0);

  function update(dt = 0.016, elapsed = 0) {
    const step = Math.min(dt || 0.016, 0.05);

    for (let i = tasks.length - 1; i >= 0; i -= 1) {
      const t = tasks[i];
      if (t.dead) {
        tasks.splice(i, 1);
        continue;
      }
      t.t += step;
      const u = Math.min(1, t.t / t.dur);
      t.fn(u, step, t.t);
      if (t.t >= t.dur) {
        tasks.splice(i, 1);
        t.onDone?.();
      }
    }

    if (sparkActive > 0) {
      const cam = scene?.activeCamera;
      if (cam) {
        cam.computeWorldMatrix();
        const wm = cam.getWorldMatrix();
        Vector3.TransformNormalFromFloatsToRef(1, 0, 0, wm, camRight).normalize();
        Vector3.TransformNormalFromFloatsToRef(0, 1, 0, wm, camUp).normalize();
      } else {
        camRight.set(1, 0, 0);
        camUp.set(0, 1, 0);
      }

      sparkActive = 0;
      for (let i = 0; i < maxSparks; i += 1) {
        const s = sparks[i];
        const vb = i * 4;
        if (!s.on) {
          for (let k = 0; k < 4; k += 1) {
            sparkPositions[(vb + k) * 3 + 1] = -999;
            sparkColors[(vb + k) * 4 + 3] = 0;
          }
          continue;
        }
        s.life -= step;
        if (s.life <= 0) {
          s.on = false;
          for (let k = 0; k < 4; k += 1) {
            sparkPositions[(vb + k) * 3 + 1] = -999;
            sparkColors[(vb + k) * 4 + 3] = 0;
          }
          continue;
        }
        sparkActive += 1;
        const damp = Math.exp(-s.drag * step);
        s.vx *= damp;
        s.vz *= damp;
        s.vy = s.vy * damp - s.grav * step;
        s.x += s.vx * step;
        s.y += s.vy * step;
        s.z += s.vz * step;

        const u = 1 - s.life / s.max;
        const env = Math.min(1, u * 6) * Math.min(1, (1 - u) * 3);
        const tw = s.flick > 0 ? 1 - s.flick * 0.5 * (1 + Math.sin(elapsed * 14 + s.ph)) : 1;
        const alpha = clamp(env * tw * 0.72, 0, 0.78);
        const half = Math.max(0.012, s.size * 0.62 * (0.7 + 0.45 * (1 - u)));
        const rx = camRight.x * half;
        const ry = camRight.y * half;
        const rz = camRight.z * half;
        const ux = camUp.x * half;
        const uy = camUp.y * half;
        const uz = camUp.z * half;

        sparkPositions[(vb + 0) * 3 + 0] = s.x - rx - ux;
        sparkPositions[(vb + 0) * 3 + 1] = s.y - ry - uy;
        sparkPositions[(vb + 0) * 3 + 2] = s.z - rz - uz;
        sparkPositions[(vb + 1) * 3 + 0] = s.x + rx - ux;
        sparkPositions[(vb + 1) * 3 + 1] = s.y + ry - uy;
        sparkPositions[(vb + 1) * 3 + 2] = s.z + rz - uz;
        sparkPositions[(vb + 2) * 3 + 0] = s.x + rx + ux;
        sparkPositions[(vb + 2) * 3 + 1] = s.y + ry + uy;
        sparkPositions[(vb + 2) * 3 + 2] = s.z + rz + uz;
        sparkPositions[(vb + 3) * 3 + 0] = s.x - rx + ux;
        sparkPositions[(vb + 3) * 3 + 1] = s.y - ry + uy;
        sparkPositions[(vb + 3) * 3 + 2] = s.z - rz + uz;

        for (let k = 0; k < 4; k += 1) {
          sparkColors[(vb + k) * 4 + 0] = s.r * alpha;
          sparkColors[(vb + k) * 4 + 1] = s.g * alpha;
          sparkColors[(vb + k) * 4 + 2] = s.b * alpha;
          sparkColors[(vb + k) * 4 + 3] = alpha;
        }
      }
      sparkMesh.updateVerticesData("position", sparkPositions, false, false);
      sparkMesh.updateVerticesData("color", sparkColors, false, false);
      sparkMesh.isVisible = sparkActive > 0;
    }

    if (petalActive > 0) {
      petalActive = 0;
      for (let i = 0; i < maxPetals; i += 1) {
        const p = petals[i];
        if (!p.on) continue;
        p.life -= step;
        if (p.life <= 0) {
          p.on = false;
          hiddenMat.copyToArray(pMatBuf, i * 16);
          continue;
        }
        petalActive += 1;
        if (!p.landed) {
          const damp = Math.exp(-1.6 * step);
          p.vx = p.vx * damp + Math.sin(elapsed * 1.7 + p.ph) * 0.6 * step;
          p.vz = p.vz * damp + Math.cos(elapsed * 1.3 + p.ph) * 0.6 * step;
          p.vy = Math.max(-0.55, p.vy * damp - 1.4 * step);
          p.x += p.vx * step;
          p.y += p.vy * step;
          p.z += p.vz * step;
          if (p.y <= p.floorY) {
            p.y = p.floorY;
            p.landed = true;
          }
        } else if (p.flowFn) {
          p.flowFn(p, step);
        } else {
          p.x += p.wx * step;
          p.z += p.wz * step;
        }
        const fade = Math.min(1, p.life / 0.8);
        const tumble = p.landed ? 0 : 1;
        const q = Quaternion.RotationYawPitchRoll(
          p.ph + elapsed * 0.3 * tumble,
          p.landed ? -Math.PI / 2 : Math.sin(elapsed * p.spin + p.ph) * 1.2,
          Math.cos(elapsed * p.spin * 0.8 + p.ph) * 0.9 * tumble
        );
        const sc = p.sc * fade;
        composeMatArray(p.x, p.y + (p.landed ? 0.01 : 0), p.z, q, sc, sc, sc, pMatBuf, i);
      }
      petalMesh.thinInstanceBufferUpdated("matrix");
      petalMesh.isVisible = petalActive > 0;
    }

    for (let i = 0; i < rings.length; i += 1) {
      const r = rings[i];
      if (!r.on) continue;
      if (r.delay > 0) {
        r.delay -= step;
        continue;
      }
      r.t += step;
      const u = r.t / r.dur;
      if (u >= 1) {
        r.on = false;
        r.mesh.isVisible = false;
        continue;
      }
      r.mesh.isVisible = true;
      const e = 1 - Math.pow(1 - u, 2.2);
      const rs = lerp(r.r0, r.r1, e);
      r.mesh.scaling.set(rs, 1, rs);
      r.mat.alpha = r.op * (1 - u) * Math.min(1, u * 8);
    }
  }

  function clear() {
    tasks.length = 0;
    for (let i = 0; i < maxSparks; i += 1) {
      sparks[i].on = false;
      const vb = i * 4;
      for (let k = 0; k < 4; k += 1) {
        sparkPositions[(vb + k) * 3 + 1] = -999;
        sparkColors[(vb + k) * 4 + 3] = 0;
      }
    }
    sparkMesh.updateVerticesData("position", sparkPositions, false, false);
    sparkMesh.updateVerticesData("color", sparkColors, false, false);
    sparkActive = 0;
    sparkMesh.isVisible = false;

    for (let i = 0; i < maxPetals; i += 1) {
      petals[i].on = false;
      hiddenMat.copyToArray(pMatBuf, i * 16);
    }
    petalMesh.thinInstanceBufferUpdated("matrix");
    petalActive = 0;
    petalMesh.isVisible = false;

    for (let i = 0; i < rings.length; i += 1) {
      rings[i].on = false;
      rings[i].mesh.isVisible = false;
    }
  }

  return { root, spark, burst, heart, petal, petalBurst, ripple, addTask, emit, update, clear, rng };
}

// ---------------------------------------------------------------------------
// 2. Stylized Blender Forest (Cherry, Oak, Birch, Olive, Cypress, Coastal Palm)
// ---------------------------------------------------------------------------

function isTreeSpotAllowed(x, z, placedTrees, minSpacing = 4.2) {
  if (Math.abs(x) > 114.0 || Math.abs(z) > 114.0) return false;
  if (!isMeadowFloraAllowed(x, z, 0.9)) return false;

  if (distToPolyline2D(x, z, WEST_GAZEBO_TRAIL) < 2.65) return false;
  if (distToPolyline2D(x, z, NORTH_WINDMILL_TRAIL) < 2.65) return false;
  if (distToPolyline2D(x, z, EAST_HARBOR_BRIDGE_TRAIL) < 2.65) return false;
  for (let i = 0; i < COTTAGE_SPUR_TRAILS.length; i += 1) {
    if (distToPolyline2D(x, z, COTTAGE_SPUR_TRAILS[i]) < 2.65) return false;
  }
  if (Math.hypot(x + 64.0, z - 42.0) < 7.8) return false;
  if (Math.hypot(x + 52.0, z + 68.0) < 9.0) return false;
  if (Math.hypot(x + 78.0, z + 56.0) < 10.4) return false;
  if (Math.hypot(x + 18.0, z + 82.0) < 10.8) return false;
  if (Math.hypot(x - 24.5, z + 68.0) < 9.8) return false;
  if (x >= -37.0 && x <= 7.5 && z >= -18.8 && z <= 25.2) return false;
  if (x >= 1.5 && x <= 49.5 && z >= -29.5 && z <= 25.0) return false;
  if (z >= -114.0 && z <= -23.0 && Math.abs(x - (16.5 + Math.sin((z + 55.0) * 0.055) * 4.0)) < 4.5) return false;

  const nrm = getTerrainNormal(x, z);
  if (nrm.y < 0.78) return false;

  for (let i = 0; i < placedTrees.length; i += 1) {
    if (Math.hypot(x - placedTrees[i].x, z - placedTrees[i].z) < minSpacing) return false;
  }
  return true;
}

function buildStylizedBlenderTrees(scene, floraRoot, treesContainer, shadowGen) {
  const treeGroup = new TransformNode("StylizedTreesGroup", scene);
  treeGroup.parent = floraRoot;
  if (!treesContainer) return { count: 0, treeRefs: [], shakeHandles: [] };

  const rng = mulberry32(20409);
  const placedTrees = [];
  const spawnList = [];

  const cherryHints = [
    [-32.5, -4.5], [-32.0, 7.5], [-24.5, 14.5], [-20.5, -20.5], [-4.5, -21.5],
    [-35.0, 12.2], [-44.5, 12.8], [-44.2, 23.5], [-53.5, 25.0], [-60.5, 34.5],
    [2.8, -33.5], [14.2, -39.5], [10.5, -51.5], [17.5, -49.0], [-5.5, -56.0],
    [-22.0, -45.0], [-36.0, -34.0], [-48.0, -24.0], [-62.0, -12.0], [-74.0, 16.0],
    [-18.0, -68.0], [-40.0, -76.0], [15.5, -60.5], [-68.0, 54.0], [-82.0, -32.0], [-28.0, -28.0],
  ];
  cherryHints.forEach(([x, z]) => spawnList.push({ sp: "Cherry", x, z }));

  const oakBirchHints = [
    [-42, -46], [-58, -40], [-76, -44], [-92, -36], [-88, -10], [-96, 18], [-86, 44],
    [-72, 66], [-48, 56], [22, -38], [26, -54], [20, -78], [4, -84],
    [-14, -93], [-34, -92], [-64, -84], [-84, -76], [16, -94], [-8, -36], [-24, -58],
    [-54, -18], [-68, 8], [-78, 28], [-42, 34], [34, -74], [-98, -58],
  ];
  oakBirchHints.forEach(([x, z], idx) => spawnList.push({ sp: idx % 2 === 0 ? "Oak" : "Birch", x, z }));

  const oliveHints = [
    [-0.2, -22.0], [-3.8, -21.0], [5.5, -31.2], [14.5, -31.8], [24.0, -31.5], [33.5, -31.2],
    [-1.2, 26.5], [-31.8, -11.5], [-33.5, 16.5], [-38.5, 24.5], [-46.0, 38.0], [-54.0, 48.0],
    [-72.0, 38.0], [-56.0, 62.0], [-82.0, 58.0], [-66.0, 26.0], [28.0, -44.0], [-40.0, -18.0],
  ];
  oliveHints.forEach(([x, z]) => spawnList.push({ sp: "Olive", x, z }));

  const cypressHints = [
    [-31.2, -8.5], [-31.2, -1.8], [-12.5, -20.5], [-7.5, -20.5], [-2.0, -24.5],
    [10.2, -37.0], [-6.5, -49.0], [-18.5, -56.0], [-29.0, -63.0], [-41.5, -67.5],
    [-46.0, -76.5], [-59.5, -74.0], [-61.0, -61.5], [-26.0, -21.0], [-36.0, -52.0],
  ];
  cypressHints.forEach(([x, z]) => spawnList.push({ sp: "Cypress", x, z }));

  // Wind-bent coastal palms framing sandy southern headland edges (well clear of boardwalk/loungers)
  const palmSpotsRaw = [
    [-37.5, 26.2], [-27.8, 29.8], [-18.5, 31.2], [5.8, 30.8], [16.5, 29.5],
    [-46.5, 42.5], [-54.5, 51.0], [34.2, 24.5],
  ];

  const buckets = new Map();
  const pushInstance = (sp, variant, x, z, yaw, sc, leanX, leanZ, regCol) => {
    const key = `${sp}_${variant}`;
    if (!buckets.has(key)) buckets.set(key, []);
    const y = getWorldTerrainY(x, z) - 0.08;
    const q = Quaternion.RotationYawPitchRoll(yaw, leanX, leanZ);
    const mat = Matrix.Compose(new Vector3(sc, sc, sc), q, new Vector3(x, y, z));
    buckets.get(key).push({ x, y, z, yaw, scale: sc, leanX, leanZ, sp: sp.toLowerCase(), variant, matrix: mat });
    if (regCol) registerCircleCollider(x, z, 0.36);
  };

  for (let i = 0; i < spawnList.length; i += 1) {
    const item = spawnList[i];
    let spot = isTreeSpotAllowed(item.x, item.z, placedTrees, 3.8) ? { x: item.x, z: item.z } : null;
    if (!spot) {
      for (let a = 0; a < 42; a += 1) {
        const r = 1.2 + (a / 42) * 14.0;
        const th = a * 2.39996 + rng() * 0.5;
        const cx = item.x + Math.cos(th) * r;
        const cz = item.z + Math.sin(th) * r;
        if (isTreeSpotAllowed(cx, cz, placedTrees, 3.8)) {
          spot = { x: cx, z: cz };
          break;
        }
      }
    }
    if (!spot) continue;
    placedTrees.push(spot);
    const variant = i % 2 === 0 ? "A" : "B";
    const sc = item.sp === "Cypress" ? 0.92 + rng() * 0.28 : item.sp === "Olive" ? 0.94 + rng() * 0.24 : 0.96 + rng() * 0.28;
    pushInstance(item.sp, variant, spot.x, spot.z, rng() * Math.PI * 2, sc, (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.05, true);
  }

  // Coastal palms along the beach perimeter outside walkways/structures
  palmSpotsRaw.forEach(([px, pz], idx) => {
    const ty = getWorldTerrainY(px, pz);
    if (ty > 0.7 && ty < 4.5 && placedTrees.every((t) => Math.hypot(t.x - px, t.z - pz) >= 3.6)) {
      placedTrees.push({ x: px, z: pz });
      pushInstance("Palm", idx % 2 === 0 ? "A" : "B", px, pz, rng() * Math.PI * 2, 0.88 + rng() * 0.22, 0.03, -0.02, true);
    }
  });

  // 3 Sea-Stack Islet Cypresses at (58, 56)
  [
    { x: 57.4, z: 55.3, s: 0.88 },
    { x: 59.3, z: 56.8, s: 0.78 },
    { x: 56.4, z: 57.4, s: 0.72 },
  ].forEach((st, idx) => {
    pushInstance("Cypress", idx % 2 === 0 ? "A" : "B", st.x, st.z, idx * 2.1, st.s, 0.04, -0.03, false);
  });

  // Instantiate stylized_trees.glb once and convert each variant's child meshes into ThinInstance buffers
  const protoInst = instantiateGLB(treesContainer, "TreePrototypes", treeGroup);
  const protoRoot = protoInst?.rootNodes?.[0];
  const allProtoNodes = protoRoot ? [protoRoot, ...protoRoot.getChildTransformNodes(false)] : [];
  const treeRefs = [];

  for (const [key, entries] of buckets.entries()) {
    if (!entries.length) continue;
    const nodeName = `Tree_${key}`;
    const variantNode = allProtoNodes.find((n) => n.name === `TreePrototypes_${nodeName}` || n.name.endsWith(`_${nodeName}`) || n.name === nodeName);
    if (!variantNode) continue;

    const childMeshes = variantNode.getChildMeshes(false);
    const matBuf = new Float32Array(entries.length * 16);
    entries.forEach((e, idx) => e.matrix.copyToArray(matBuf, idx * 16));

    const variantMeshes = [];
    for (const cm of childMeshes) {
      cm.parent = treeGroup;
      cm.makeGeometryUnique();
      cm.position.set(0, 0, 0);
      cm.rotationQuaternion = Quaternion.Identity();
      cm.scaling.set(1, 1, 1);
      cm.isPickable = false;
      cm.receiveShadows = true;
      if (cm.material) cm.material.twoSidedLighting = true;
      cm.thinInstanceSetBuffer("matrix", matBuf, 16, false);
      cm.thinInstanceRefreshBoundingInfo(true);
      if (shadowGen) shadowGen.addShadowCaster(cm, false);
      variantMeshes.push(cm);
    }

    entries.forEach((e, idx) => {
      treeRefs.push({ ...e, idx, meshes: variantMeshes, matBuf });
    });
  }

  // Dispose unused empty prototype parent node (meshes already reparented out)
  if (protoRoot) {
    for (const m of protoRoot.getChildMeshes(true)) {
      if (m.thinInstanceCount === 0) m.dispose();
    }
    protoRoot.dispose();
  }

  return { count: treeRefs.length, treeRefs };
}

// ---------------------------------------------------------------------------
// 3. Sculpted Roses (Court Beds, Arches, Fountain Halo, Mailbox, Gazebo)
// ---------------------------------------------------------------------------

function createSculptedRoseMeshes(scene, parent) {
  const bloomPos = [];
  const bloomIdx = [];
  const bloomCols = [];
  const stemPos = [];
  const stemIdx = [];
  const stemCols = [];

  const appendTri = (arrPos, arrCol, arrIdx, a, b, c, ca, cb, cc) => {
    const base = arrPos.length / 3;
    arrPos.push(...a, ...b, ...c);
    arrCol.push(...ca, 1, ...cb, 1, ...cc, 1);
    arrIdx.push(base, base + 1, base + 2);
  };

  // Fibonacci golden-angle 16-petal cupped blossom
  const golden = 2.3999632;
  const darkCol = [0.68, 0.56, 0.62];
  const tipCol = [1.0, 0.96, 0.98];
  for (let p = 0; p < 16; p += 1) {
    const u = p / 15;
    const ang = p * golden;
    const rad = lerp(0.011, 0.068, Math.pow(u, 0.85));
    const h = lerp(0.062, 0.022, u);
    const curl = lerp(0.18, 1.05, u);
    const pw = lerp(0.018, 0.044, u);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const tx = -sa;
    const tz = ca;

    const pBase = [ca * rad * 0.45, 0.012, sa * rad * 0.45];
    const pMidL = [ca * rad - tx * pw, h * 0.72, sa * rad - tz * pw];
    const pMidR = [ca * rad + tx * pw, h * 0.72, sa * rad + tz * pw];
    const pTip = [ca * (rad + 0.03 * curl), h + 0.026 * (1 - u * 0.5), sa * (rad + 0.03 * curl)];

    appendTri(bloomPos, bloomCols, bloomIdx, pBase, pMidL, pTip, darkCol, tipCol, tipCol);
    appendTri(bloomPos, bloomCols, bloomIdx, pBase, pTip, pMidR, darkCol, tipCol, tipCol);
  }

  // Stem + 4 serrated leaflets
  const sC1 = [0.16, 0.28, 0.12];
  const sC2 = [0.27, 0.46, 0.19];
  for (let k = 0; k < 4; k += 1) {
    const a = (k * Math.PI) / 2 + 0.3;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const tx = -sa * 0.035;
    const tz = ca * 0.035;
    appendTri(
      stemPos,
      stemCols,
      stemIdx,
      [0, -0.02, 0],
      [ca * 0.06 + tx, -0.05, sa * 0.06 + tz],
      [ca * 0.12, -0.07, sa * 0.12],
      sC1,
      sC2,
      sC2
    );
    appendTri(
      stemPos,
      stemCols,
      stemIdx,
      [0, -0.02, 0],
      [ca * 0.12, -0.07, sa * 0.12],
      [ca * 0.06 - tx, -0.05, sa * 0.06 - tz],
      sC1,
      sC2,
      sC2
    );
  }
  appendTri(stemPos, stemCols, stemIdx, [-0.01, -0.18, 0], [0.01, -0.18, 0], [0, 0.02, 0], sC1, sC1, sC2);
  appendTri(stemPos, stemCols, stemIdx, [0, -0.18, -0.01], [0, -0.18, 0.01], [0, 0.02, 0], sC1, sC1, sC2);

  const bloomMesh = buildVertexMesh("SculptedRoses_Blooms", scene, parent, {
    positions: bloomPos,
    indices: bloomIdx,
    colors: bloomCols,
  });
  const bMat = new StandardMaterial("RoseBloomMat", scene);
  bMat.diffuseColor = new Color3(1, 1, 1);
  bMat.emissiveColor = new Color3(0.08, 0.03, 0.05);
  bMat.specularColor = new Color3(0.12, 0.12, 0.12);
  bMat.backFaceCulling = false;
  bMat.twoSidedLighting = true;
  bloomMesh.material = bMat;
  bloomMesh.alwaysSelectAsActiveMesh = true;

  const stemMesh = buildVertexMesh("SculptedRoses_Stems", scene, parent, {
    positions: stemPos,
    indices: stemIdx,
    colors: stemCols,
  });
  const sMat = new StandardMaterial("RoseStemMat", scene);
  sMat.diffuseColor = new Color3(1, 1, 1);
  sMat.specularColor = new Color3(0.05, 0.06, 0.05);
  sMat.backFaceCulling = false;
  sMat.twoSidedLighting = true;
  stemMesh.material = sMat;
  stemMesh.alwaysSelectAsActiveMesh = true;

  return { bloomMesh, stemMesh };
}

function buildEstateRoseGardens(scene, floraRoot) {
  const roseRoot = new TransformNode("SculptedRoseGardens", scene);
  roseRoot.parent = floraRoot;
  const rng = mulberry32(51203);
  const placements = [];
  const pushRose = (x, y, z, rx, ry, rz, scale, colorIdx, withStem = true) => {
    placements.push({ x, y, z, rx, ry, rz, scale, colorIdx, withStem });
  };

  // Villa West court border, East court border, North veranda border
  for (let i = 0; i < 64; i += 1) {
    const rx = lerp(-25.0, -20.6, (i + rng() * 0.8) / 64.0);
    const rz = 7.3 + (rng() - 0.5) * 0.82;
    const ry = 2.50 + Math.sin((i / 63) * Math.PI) * 0.22 + rng() * 0.32;
    pushRose(rx, ry, rz, 0.35 + (rng() - 0.5) * 0.55, rng() * Math.PI * 2, (rng() - 0.5) * 0.45, 0.96 + rng() * 0.38, i, i % 2 === 0);
  }
  for (let i = 0; i < 48; i += 1) {
    const rz = lerp(6.2, 11.4, (i + rng() * 0.8) / 48.0);
    const rx = 2.4 + (rng() - 0.5) * 0.68;
    const ry = 2.50 + Math.sin((i / 47) * Math.PI) * 0.22 + rng() * 0.32;
    pushRose(rx, ry, rz, 0.35 + (rng() - 0.5) * 0.55, rng() * Math.PI * 2, (rng() - 0.5) * 0.45, 0.96 + rng() * 0.38, i + 1, i % 2 === 0);
  }
  for (let i = 0; i < 80; i += 1) {
    const rx = lerp(-24.2, -4.5, (i + rng() * 0.8) / 80.0);
    const rz = -11.35 + (rng() - 0.5) * 0.72;
    const ry = 2.52 + Math.sin((i / 79) * Math.PI) * 0.22 + rng() * 0.32;
    pushRose(rx, ry, rz, 0.35 + (rng() - 0.5) * 0.55, rng() * Math.PI * 2, (rng() - 0.5) * 0.45, 0.98 + rng() * 0.38, i + 2, i % 2 === 0);
  }

  // Front Rose Arch (-14, 2.20, 10.2, ry=0) & West Trail Rose Arch (-31, 2.22, 1.0, ry=0.78)
  const populateArch = (cx, baseY, cz, rotY, count) => {
    const halfSpan = 1.52;
    const legTop = 2.05;
    const vaultH = 0.85;
    const cosR = Math.cos(rotY);
    const sinR = Math.sin(rotY);
    for (let i = 0; i < count; i += 1) {
      const u = i / (count - 1);
      let sOff;
      let hOff;
      if (u < 0.28) {
        sOff = -halfSpan;
        hOff = (u / 0.28) * legTop;
      } else if (u > 0.72) {
        sOff = halfSpan;
        hOff = ((1 - u) / 0.28) * legTop;
      } else {
        const ang = lerp(Math.PI, 0, (u - 0.28) / 0.44);
        sOff = Math.cos(ang) * halfSpan;
        hOff = legTop + Math.sin(ang) * vaultH;
      }
      const edgeBlend = Math.min(1, Math.min(u, 1 - u) / 0.14);
      const lx = sOff + (rng() - 0.5) * (0.14 + 0.22 * edgeBlend);
      const lz = (rng() - 0.5) * (0.18 + 0.24 * edgeBlend);
      const px = cx + lx * cosR + lz * sinR;
      const pz = cz - lx * sinR + lz * cosR;
      const py = baseY + 0.18 + hOff + (rng() - 0.5) * 0.16;
      pushRose(px, py, pz, 0.75 + (rng() - 0.5) * 0.7, rng() * Math.PI * 2, (rng() - 0.5) * 0.6, 0.96 + rng() * 0.36, i, i % 2 === 0);
    }
  };
  populateArch(-14.0, 2.20, 10.2, 0.0, 96);
  populateArch(-31.0, 2.22, 1.0, 0.78, 88);

  // Courtyard Fountain Outer Halo (-4.8, 2.22, 9.5)
  for (let i = 0; i < 68; i += 1) {
    const th = (i / 68) * Math.PI * 2 + (rng() - 0.5) * 0.08;
    const r = 2.38 + (rng() - 0.5) * 0.22;
    pushRose(-4.8 + Math.cos(th) * r, 2.48 + rng() * 0.26, 9.5 + Math.sin(th) * r, 0.52, -th + Math.PI * 0.5, (rng() - 0.5) * 0.3, 0.90 + rng() * 0.32, i, i % 2 === 0);
  }

  // Rose Mailbox Spiral (-10.8, 2.20, 9.4)
  for (let i = 0; i < 34; i += 1) {
    const t = i / 33;
    const th = Math.PI * 0.35 + t * Math.PI * 1.65;
    const r = lerp(0.48, 0.22, t) + (rng() - 0.5) * 0.08;
    pushRose(-10.8 + Math.cos(th) * r, 2.42 + t * 0.88, 9.4 + Math.sin(th) * r, 0.58, rng() * Math.PI * 2, 0, 0.90 + rng() * 0.28, i, i < 22);
  }

  // Cliffside Gazebo (-64, 7.80, 42)
  const gazeboEntryAng = Math.atan2(-11.0, 7.0);
  for (let i = 0; i < 96; i += 1) {
    const upper = i >= 58;
    const th = ((i % 58) / 58) * Math.PI * 2;
    if (!upper && Math.abs(Math.atan2(Math.sin(th - gazeboEntryAng), Math.cos(th - gazeboEntryAng))) < 0.48) continue;
    const r = upper ? 4.08 + (rng() - 0.5) * 0.22 : 5.82 + (rng() - 0.5) * 0.28;
    const py = upper ? 7.80 + 2.75 + (rng() - 0.5) * 0.22 : 7.80 + 0.24 + rng() * 0.32;
    pushRose(-64.0 + Math.cos(th) * r, py, 42.0 + Math.sin(th) * r, upper ? 0.95 : 0.45, rng() * Math.PI * 2, 0, 0.96 + rng() * 0.36, i, true);
  }

  const { bloomMesh, stemMesh } = createSculptedRoseMeshes(scene, roseRoot);
  const rosePalette = [0xfad4e0, 0xf6a8c0, 0xeb7696, 0xc92a49, 0xfff3f6];
  const bloomMatBuf = new Float32Array(placements.length * 16);
  const bloomColBuf = new Float32Array(placements.length * 4);
  const stemSpots = placements.filter((p) => p.withStem);
  const stemMatBuf = new Float32Array(stemSpots.length * 16);
  const registry = [];

  placements.forEach((p, idx) => {
    const q = Quaternion.RotationYawPitchRoll(p.ry, p.rx, p.rz);
    const mat = composeMatArray(p.x, p.y, p.z, q, p.scale, p.scale, p.scale, bloomMatBuf, idx);
    const c = hexToColor3(rosePalette[p.colorIdx % rosePalette.length]);
    bloomColBuf[idx * 4 + 0] = c.r;
    bloomColBuf[idx * 4 + 1] = c.g;
    bloomColBuf[idx * 4 + 2] = c.b;
    bloomColBuf[idx * 4 + 3] = 1;
    registry.push({ ...p, k: idx, baseMatrix: mat, q, stemK: -1, stemBaseMatrix: null });
  });

  let stemIdx = 0;
  registry.forEach((r) => {
    if (!r.withStem) return;
    r.stemK = stemIdx;
    r.stemBaseMatrix = composeMatArray(r.x, r.y, r.z, r.q, r.scale, r.scale, r.scale, stemMatBuf, stemIdx);
    stemIdx += 1;
  });

  bloomMesh.thinInstanceSetBuffer("matrix", bloomMatBuf, 16, false);
  bloomMesh.thinInstanceSetBuffer("color", bloomColBuf, 4, false);
  stemMesh.thinInstanceSetBuffer("matrix", stemMatBuf, 16, false);

  return { count: placements.length, registry, bloomMesh, stemMesh, bloomMatBuf, stemMatBuf };
}

// ---------------------------------------------------------------------------
// 4. Sculpted Meadow Grass & Multi-Petal Wildflowers + Hydrangeas + Photogrammetry Ferns
// ---------------------------------------------------------------------------

function fbmMeadow(x, z, seed = 0) {
  return clamp(fbm2(x * 0.045 + seed, z * 0.045 - seed) * 0.5 + 0.5, 0, 1);
}

function sampleOrganicMeadowSpot(rng, speciesIdx) {
  for (let tries = 0; tries < 60; tries += 1) {
    const zone = rng();
    let x;
    let z;
    if (zone < 0.24) {
      x = -78.0 + rng() * 54.0;
      z = -16.0 + rng() * 68.0;
    } else if (zone < 0.48) {
      x = -92.0 + rng() * 134.0;
      z = -104.0 + rng() * 78.0;
    } else if (zone < 0.72) {
      x = -112.0 + rng() * 90.0;
      z = -45.0 + rng() * 112.0;
    } else {
      x = -108.0 + rng() * 154.0;
      z = -108.0 + rng() * 186.0;
    }
    if (x >= -27.2 && x <= -1.2 && z >= -11.8 && z <= 14.2) continue;
    if (!isMeadowFloraAllowed(x, z)) continue;
    if (speciesIdx >= 0) {
      const drift = fbmMeadow(x, z, speciesIdx * 3.17 + 1.2);
      if (rng() > 0.22 + smoothstep(0.24, 0.72, drift) * 0.78) continue;
    }
    return { x, z };
  }
  for (let tries = 0; tries < 60; tries += 1) {
    const fx = -52.0 - rng() * 44.0;
    const fz = -40.0 + rng() * 70.0;
    if (isMeadowFloraAllowed(fx, fz)) return { x: fx, z: fz };
  }
  return { x: -62.0, z: -20.0 };
}

function createGrassTuftGeo() {
  const dst = { positions: [], normals: [], colors: [], indices: [] };
  const blade = { positions: [], normals: [], colors: [], indices: [] };
  const rootC = [0.40, 0.56, 0.29];
  const midC = [0.56, 0.72, 0.39];
  const tipC = [0.74, 0.85, 0.48];
  const segsY = 3;
  for (let iy = 0; iy <= segsY; iy += 1) {
    const t = iy / segsY;
    const y = t * 0.38;
    const w = 0.036 * (1 - Math.pow(t, 1.35) * 0.94);
    const z = 0.12 * t * t;
    const col = t < 0.5 ? [lerp(rootC[0], midC[0], t * 2), lerp(rootC[1], midC[1], t * 2), lerp(rootC[2], midC[2], t * 2)] : [lerp(midC[0], tipC[0], (t - 0.5) * 2), lerp(midC[1], tipC[1], (t - 0.5) * 2), lerp(midC[2], tipC[2], (t - 0.5) * 2)];
    blade.positions.push(-w, y, z, w, y, z);
    blade.normals.push(0, 0.2, 0.98, 0, 0.2, 0.98);
    blade.colors.push(col[0], col[1], col[2], 1, col[0], col[1], col[2], 1);
    if (iy < segsY) {
      const b = iy * 2;
      blade.indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const tuftRng = mulberry32(4109);
  for (let k = 0; k < 4; k += 1) {
    appendTransformedPart(
      dst,
      blade,
      (tuftRng() - 0.5) * 0.12,
      0,
      (tuftRng() - 0.5) * 0.12,
      0.08 + tuftRng() * 0.12,
      k * 1.57 + tuftRng() * 0.5,
      (tuftRng() - 0.5) * 0.1,
      0.95 + tuftRng() * 0.25,
      0.88 + tuftRng() * 0.32,
      0.95 + tuftRng() * 0.25
    );
  }
  return dst;
}

function createStarBloomGeo(petalCount, len, wid, discRad, stemH, discColor) {
  const dst = { positions: [], normals: [], colors: [], indices: [] };
  // Crossed sunlit green stem
  const stem = {
    positions: [-0.010, 0, 0, 0.010, 0, 0, 0, stemH, 0],
    normals: [0, 0.25, 0.96, 0, 0.25, 0.96, 0, 0.25, 0.96],
    colors: [0.34, 0.58, 0.24, 1, 0.34, 0.58, 0.24, 1, 0.48, 0.72, 0.32, 1],
    indices: [0, 1, 2],
  };
  appendTransformedPart(dst, stem, 0, 0, 0, 0, 0, 0, 1, 1, 1);
  appendTransformedPart(dst, stem, 0, 0, 0, 0, Math.PI * 0.5, 0, 1, 1, 1);

  // Two arched basal leaves so close-up grazing angles read as lush botanical tufts
  const leaf = {
    positions: [-0.016, 0.01, 0, 0.016, 0.01, 0, 0.012, stemH * 0.42, 0.045, 0, stemH * 0.62, 0.088, -0.012, stemH * 0.42, 0.045],
    normals: [0, 0.8, 0.6, 0, 0.8, 0.6, 0, 0.85, 0.52, 0, 0.9, 0.42, 0, 0.85, 0.52],
    colors: [0.36, 0.60, 0.26, 1, 0.36, 0.60, 0.26, 1, 0.48, 0.74, 0.34, 1, 0.54, 0.78, 0.38, 1, 0.48, 0.74, 0.34, 1],
    indices: [0, 1, 2, 0, 2, 3, 0, 3, 4],
  };
  appendTransformedPart(dst, leaf, 0, 0, 0, 0.12, 0.5, 0, 1, 1, 1);
  appendTransformedPart(dst, leaf, 0, 0, 0, 0.12, 3.6, 0, 1, 1, 1);

  for (let i = 0; i < petalCount; i += 1) {
    const a = (i / petalCount) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const tx = -sa * wid;
    const tz = ca * wid;
    const base = dst.positions.length / 3;
    dst.positions.push(
      0, stemH + 0.004, 0,
      ca * len * 0.55 + tx, stemH + 0.022, sa * len * 0.55 + tz,
      ca * len, stemH + 0.014, sa * len,
      ca * len * 0.55 - tx, stemH + 0.022, sa * len * 0.55 - tz
    );
    dst.normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    dst.colors.push(0.95, 0.95, 0.95, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
    dst.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const cBase = dst.positions.length / 3;
  dst.positions.push(0, stemH + 0.026, 0);
  dst.normals.push(0, 1, 0);
  dst.colors.push(discColor[0], discColor[1], discColor[2], 1);
  for (let i = 0; i <= 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    dst.positions.push(Math.cos(a) * discRad, stemH + 0.016, Math.sin(a) * discRad);
    dst.normals.push(0, 1, 0);
    dst.colors.push(discColor[0], discColor[1], discColor[2], 1);
    if (i < 6) dst.indices.push(cBase, cBase + 1 + i, cBase + 2 + i);
  }
  return dst;
}

function buildMeadowAndFlowerSea(scene, floraRoot, containers) {
  const seaGroup = new TransformNode("MeadowAndFlowerSea", scene);
  seaGroup.parent = floraRoot;
  const rng = mulberry32(68113);
  const scalableMeshes = [];

  // 1. 14,000 Sculpted Multi-Blade Meadow Grass Tufts (PBR matched to PeninsulaTerrainMat sky IBL)
  const GRASS_COUNT = 14000;
  const grassGeo = createGrassTuftGeo();
  const grassMesh = buildVertexMesh("MeadowGrassTufts", scene, seaGroup, grassGeo);
  const grassMat = makePbrMat("MeadowGrassMat", scene, {
    color: 0xffffff,
    roughness: 0.78,
    metallic: 0.0,
    specularIntensity: 0.14,
    emissive: 0x1a3812,
    emissiveIntensity: 0.34,
    doubleSided: true,
    useVertexColors: true,
  });
  grassMat.twoSidedLighting = true;
  grassMesh.material = grassMat;
  grassMesh.alwaysSelectAsActiveMesh = true;

  const grassSpots = [];
  for (let i = 0; i < GRASS_COUNT; i += 1) {
    const sp = sampleOrganicMeadowSpot(rng, -1);
    grassSpots.push({ x: sp.x, z: sp.z, d2: (sp.x + 14) ** 2 + (sp.z - 10) ** 2 });
  }
  grassSpots.sort((a, b) => a.d2 - b.d2);

  const gMatBuf = new Float32Array(GRASS_COUNT * 16);
  const gColBuf = new Float32Array(GRASS_COUNT * 4);
  for (let i = 0; i < GRASS_COUNT; i += 1) {
    const sp = grassSpots[i];
    const y = getWorldTerrainY(sp.x, sp.z);
    const nrm = getTerrainNormal(sp.x, sp.z);
    const q = slopeQuatFromNormal(nrm, 0.65, rng() * Math.PI * 2);
    const lush = fbmMeadow(sp.x, sp.z, 0.7);
    const scX = 1.15 + rng() * 0.5;
    const scY = (0.85 + lush * 0.72) * (0.88 + rng() * 0.44);
    composeMatArray(sp.x, y - 0.02, sp.z, q, scX, scY, scX, gMatBuf, i);
    const c = hslToColor3(0.28 + (lush - 0.5) * 0.06 + (rng() - 0.5) * 0.03, 0.58 + lush * 0.18, 0.78 + (rng() - 0.5) * 0.12);
    gColBuf[i * 4 + 0] = c.r;
    gColBuf[i * 4 + 1] = c.g;
    gColBuf[i * 4 + 2] = c.b;
    gColBuf[i * 4 + 3] = 1;
  }
  grassMesh.thinInstanceSetBuffer("matrix", gMatBuf, 16, true);
  grassMesh.thinInstanceSetBuffer("color", gColBuf, 4, true);
  scalableMeshes.push({ mesh: grassMesh, maxCount: GRASS_COUNT, minFloor: 1200 });

  // 2. 11,200 Multi-Petal Wildflowers across 4 Teyvat Botanical Colonies (Windwheel / Silk / Glaze Lily / Sweet Flower)
  const flowerSpecs = [
    { name: "Cosmos3000", count: 3000, geo: createStarBloomGeo(8, 0.088, 0.034, 0.020, 0.20, [1.00, 0.88, 0.28]), scaleMin: 1.05, scaleSpan: 0.44, palette: [0xff7da8, 0xf2467c, 0xfff0f5, 0xff94b8] },
    { name: "Lavender3000", count: 3000, geo: createStarBloomGeo(6, 0.068, 0.026, 0.018, 0.23, [0.68, 0.52, 0.96]), scaleMin: 1.08, scaleSpan: 0.42, palette: [0x8262e8, 0xa288ff, 0x674bd1, 0xb59eff] },
    { name: "Daisy2600", count: 2600, geo: createStarBloomGeo(10, 0.075, 0.022, 0.022, 0.17, [1.00, 0.82, 0.22]), scaleMin: 1.08, scaleSpan: 0.42, palette: [0xffffff, 0xfffae6, 0xffcb3b, 0xffffff, 0xffd75e] },
    { name: "Nemophila2600", count: 2600, geo: createStarBloomGeo(5, 0.058, 0.028, 0.015, 0.14, [0.98, 0.98, 0.90]), scaleMin: 1.08, scaleSpan: 0.42, palette: [0x42b6ff, 0x76d4ff, 0x589eff, 0x9ce2ff] },
  ];

  for (let s = 0; s < flowerSpecs.length; s += 1) {
    const spec = flowerSpecs[s];
    const fMesh = buildVertexMesh(spec.name, scene, seaGroup, spec.geo);
    const fMat = new StandardMaterial(`${spec.name}_Mat`, scene);
    fMat.diffuseColor = new Color3(1, 1, 1);
    fMat.emissiveColor = new Color3(0.18, 0.17, 0.20);
    fMat.specularColor = new Color3(0.08, 0.08, 0.08);
    fMat.backFaceCulling = false;
    fMat.twoSidedLighting = true;
    fMesh.material = fMat;
    fMesh.alwaysSelectAsActiveMesh = true;

    const fSpots = [];
    for (let i = 0; i < spec.count; i += 1) {
      const sp = sampleOrganicMeadowSpot(rng, s);
      fSpots.push({ x: sp.x, z: sp.z, d2: (sp.x + 14) ** 2 + (sp.z - 10) ** 2 });
    }
    fSpots.sort((a, b) => a.d2 - b.d2);

    const matBuf = new Float32Array(spec.count * 16);
    const colBuf = new Float32Array(spec.count * 4);
    for (let i = 0; i < spec.count; i += 1) {
      const sp = fSpots[i];
      const y = getWorldTerrainY(sp.x, sp.z);
      const nrm = getTerrainNormal(sp.x, sp.z);
      const q = slopeQuatFromNormal(nrm, 0.72, rng() * Math.PI * 2);
      const sc = spec.scaleMin + rng() * spec.scaleSpan;
      composeMatArray(sp.x, y - 0.015, sp.z, q, sc, sc * (0.9 + rng() * 0.25), sc, matBuf, i);
      const patchTone = Math.floor(fbmMeadow(sp.x * 1.4, sp.z * 1.4, s * 5.1) * spec.palette.length + rng() * 0.85) % spec.palette.length;
      const c = hexToColor3(spec.palette[patchTone]);
      const vJit = 0.92 + rng() * 0.14;
      colBuf[i * 4 + 0] = clamp(c.r * vJit, 0, 1);
      colBuf[i * 4 + 1] = clamp(c.g * vJit, 0, 1);
      colBuf[i * 4 + 2] = clamp(c.b * vJit, 0, 1);
      colBuf[i * 4 + 3] = 1;
    }
    fMesh.thinInstanceSetBuffer("matrix", matBuf, 16, true);
    fMesh.thinInstanceSetBuffer("color", colBuf, 4, true);
    scalableMeshes.push({ mesh: fMesh, maxCount: spec.count, minFloor: 500 });
  }

  // 3. Curated Photogrammetry Understory Ferns (ph_fern) & Periwinkle Clumps (ph_periwinkle)
  const scatterUnderstoryGLB = (container, namePrefix, spotList, baseScale) => {
    if (!container || !spotList.length) return;
    const inst = instantiateGLB(container, namePrefix, seaGroup);
    const protoRoot = inst?.rootNodes?.[0];
    const meshes = protoRoot ? protoRoot.getChildMeshes(false) : [];
    const targetMesh = meshes[0];
    if (!targetMesh) {
      protoRoot?.dispose();
      return;
    }
    targetMesh.parent = seaGroup;
    targetMesh.makeGeometryUnique();
    targetMesh.position.set(0, 0, 0);
    targetMesh.rotationQuaternion = Quaternion.Identity();
    targetMesh.scaling.set(1, 1, 1);
    targetMesh.isPickable = false;
    if (targetMesh.material) targetMesh.material.twoSidedLighting = true;
    const mBuf = new Float32Array(spotList.length * 16);
    spotList.forEach((sp, idx) => {
      const y = getWorldTerrainY(sp.x, sp.z);
      const nrm = getTerrainNormal(sp.x, sp.z);
      const q = slopeQuatFromNormal(nrm, 0.72, rng() * Math.PI * 2);
      const s = baseScale * (0.85 + rng() * 0.45);
      composeMatArray(sp.x, y - 0.01, sp.z, q, s, s, s, mBuf, idx);
    });
    targetMesh.thinInstanceSetBuffer("matrix", mBuf, 16, true);
    targetMesh.thinInstanceRefreshBoundingInfo(true);
    targetMesh.alwaysSelectAsActiveMesh = true;
    protoRoot.dispose(false, false);
  };

  const fernSpots = [];
  for (let i = 0; i < 240; i += 1) {
    const sp = sampleOrganicMeadowSpot(rng, 0);
    if (getWorldTerrainY(sp.x, sp.z) > 1.8) fernSpots.push(sp);
  }
  const periwinkleSpots = [];
  for (let i = 0; i < 200; i += 1) {
    const sp = sampleOrganicMeadowSpot(rng, 2);
    if (getWorldTerrainY(sp.x, sp.z) > 1.6) periwinkleSpots.push(sp);
  }
  scatterUnderstoryGLB(containers.ph_fern, "FernSea", fernSpots, 1.15);
  scatterUnderstoryGLB(containers.ph_periwinkle, "PeriwinkleSea", periwinkleSpots, 1.85);

  return scalableMeshes;
}

function buildHydrangeaShrubs(scene, floraRoot) {
  const hydGroup = new TransformNode("HydrangeaShrubs120", scene);
  hydGroup.parent = floraRoot;
  const rng = mulberry32(80411);
  const spots = [];

  const sampleAlongTrail = (poly, targetCount) => {
    for (let i = 0; i < targetCount; i += 1) {
      const segIdx = Math.min(poly.length - 2, Math.floor((i / targetCount) * (poly.length - 1)));
      const segT = rng();
      const [ax, az] = poly[segIdx];
      const [bx, bz] = poly[segIdx + 1];
      const tx = lerp(ax, bx, segT);
      const tz = lerp(az, bz, segT);
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const side = i % 2 === 0 ? 1 : -1;
      const off = 2.18 + rng() * 0.55;
      const sx = tx + nx * side * off;
      const sz = tz + nz * side * off;
      if (isMeadowFloraAllowed(sx, sz)) spots.push({ x: sx, z: sz });
    }
  };
  sampleAlongTrail(WEST_GAZEBO_TRAIL, 48);
  sampleAlongTrail(NORTH_WINDMILL_TRAIL, 48);
  for (let i = 0; i < 22 && spots.length < 106; i += 1) {
    const sx = i < 11 ? -30.3 - rng() * 0.6 : -28.0 + (i - 11) * 2.1;
    const sz = i < 11 ? -11.5 + i * 2.1 : -14.3 - rng() * 0.5;
    if (isMeadowFloraAllowed(sx, sz)) spots.push({ x: sx, z: sz });
  }
  for (let i = 0; spots.length < 120 && i < 40; i += 1) {
    const th = (i / 20) * Math.PI * 2;
    const r = 6.75 + (rng() - 0.5) * 0.45;
    const sx = -64.0 + Math.cos(th) * r;
    const sz = 42.0 + Math.sin(th) * r;
    if (isMeadowFloraAllowed(sx, sz)) spots.push({ x: sx, z: sz });
  }

  function makeBumpSphereGeo(rx, ry, rz, latN, lonN, noiseAmp, seed, colBot, colTop) {
    const pos = [];
    const col = [];
    const idx = [];
    for (let r = 0; r <= latN; r += 1) {
      const v = r / latN;
      const phi = v * Math.PI;
      const sp = Math.sin(phi);
      const cp = Math.cos(phi);
      for (let t = 0; t <= lonN; t += 1) {
        const u = t / lonN;
        const th = u * Math.PI * 2;
        const w = 1 + noiseAmp * Math.sin(th * 3 + seed) * Math.sin(phi * 2 + seed * 0.7);
        const nx = sp * Math.cos(th);
        const ny = cp;
        const nz = sp * Math.sin(th);
        pos.push(nx * rx * w, ny * ry * w, nz * rz * w);
        const mixT = clamp(0.5 + ny * 0.5, 0, 1);
        col.push(
          lerp(colBot[0], colTop[0], mixT),
          lerp(colBot[1], colTop[1], mixT),
          lerp(colBot[2], colTop[2], mixT),
          1
        );
      }
    }
    for (let r = 0; r < latN; r += 1) {
      for (let t = 0; t < lonN; t += 1) {
        const a = r * (lonN + 1) + t;
        const b = a + 1;
        const c = a + lonN + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const nrm = new Float32Array(pos.length);
    VertexData.ComputeNormals(pos, idx, nrm, { useRightHandedSystem: true });
    return { positions: pos, normals: nrm, colors: col, indices: idx };
  }

  // Organic multi-lobe serrated leafy bush + radial leaves
  const moundData = { positions: [], normals: [], colors: [], indices: [] };
  const foliageLobes = [
    [0.0, 0.24, 0.0, 0.36, 0.24, 0.36, 0.14, 1.2],
    [0.24, 0.16, 0.06, 0.28, 0.20, 0.28, 0.16, 2.7],
    [-0.22, 0.18, -0.08, 0.29, 0.21, 0.27, 0.15, 4.1],
    [0.05, 0.15, -0.25, 0.27, 0.19, 0.29, 0.17, 5.5],
    [-0.08, 0.16, 0.24, 0.28, 0.20, 0.26, 0.15, 7.3],
  ];
  for (const [lx, ly, lz, sx, sy, sz, na, sd] of foliageLobes) {
    const lobe = makeBumpSphereGeo(sx, sy, sz, 5, 7, na, sd, [0.18, 0.34, 0.14], [0.36, 0.56, 0.24]);
    appendTransformedPart(moundData, lobe, lx, ly, lz, 0, 0, 0, 1, 1, 1);
  }
  const broadLeaf = {
    positions: [-0.07, 0, 0, 0.07, 0, 0, 0.11, 0.08, 0.16, 0, 0.11, 0.30, -0.11, 0.08, 0.16],
    normals: [0, 0.9, 0.4, 0, 0.9, 0.4, 0, 0.94, 0.34, 0, 0.98, 0.2, 0, 0.94, 0.34],
    colors: [0.22, 0.40, 0.17, 1, 0.22, 0.40, 0.17, 1, 0.34, 0.56, 0.24, 1, 0.42, 0.64, 0.28, 1, 0.34, 0.56, 0.24, 1],
    indices: [0, 1, 2, 0, 2, 3, 0, 3, 4],
  };
  for (let li = 0; li < 8; li += 1) {
    const la = (li / 8) * Math.PI * 2 + 0.25;
    appendTransformedPart(moundData, broadLeaf, Math.cos(la) * 0.26, 0.16 + (li % 2) * 0.08, Math.sin(la) * 0.26, 0.15, la, 0, 1.0, 1.0, 1.0);
  }
  const moundMesh = buildVertexMesh("HydrangeaMounds", scene, hydGroup, moundData);
  const mMat = new StandardMaterial("HydMoundMat", scene);
  mMat.diffuseColor = new Color3(1, 1, 1);
  mMat.specularColor = new Color3(0.06, 0.08, 0.05);
  mMat.backFaceCulling = false;
  mMat.twoSidedLighting = true;
  moundMesh.material = mMat;
  moundMesh.alwaysSelectAsActiveMesh = true;

  // Compound 7-floret hydrangea flower corymb with shaded inner shadows instead of naked spheres
  const corymbData = { positions: [], normals: [], colors: [], indices: [] };
  const floretOffsets = [
    [0.0, 0.045, 0.0, 0.056],
    [0.052, 0.015, 0.01, 0.050],
    [-0.050, 0.018, 0.018, 0.048],
    [0.020, 0.012, 0.052, 0.048],
    [-0.022, 0.016, -0.050, 0.050],
    [0.045, -0.010, -0.036, 0.046],
    [-0.044, -0.008, 0.042, 0.046],
  ];
  for (let fi = 0; fi < floretOffsets.length; fi += 1) {
    const [fx, fy, fz, fr] = floretOffsets[fi];
    const fl = makeBumpSphereGeo(fr, fr * 0.86, fr, 4, 6, 0.16, fi * 1.9, [0.76, 0.78, 0.86], [1.0, 1.0, 1.0]);
    appendTransformedPart(corymbData, fl, fx, fy, fz, 0, fi * 0.8, 0, 1, 1, 1);
  }
  const corymbMesh = buildVertexMesh("HydrangeaCorymbs", scene, hydGroup, corymbData);
  const cMat = new StandardMaterial("HydCorymbMat", scene);
  cMat.diffuseColor = new Color3(1, 1, 1);
  cMat.emissiveColor = new Color3(0.16, 0.14, 0.22);
  cMat.specularColor = new Color3(0.08, 0.08, 0.08);
  corymbMesh.material = cMat;
  corymbMesh.alwaysSelectAsActiveMesh = true;

  const count = spots.length;
  const corymbsPerShrub = 11;
  const mBuf = new Float32Array(count * 16);
  const cBuf = new Float32Array(count * corymbsPerShrub * 16);
  const colBuf = new Float32Array(count * corymbsPerShrub * 4);
  const hydPalette = [0x5eb2ff, 0xda84f4, 0xff7da8, 0xfff8fa, 0x78a8ff];

  let cIdx = 0;
  for (let i = 0; i < count; i += 1) {
    const sp = spots[i];
    const y = getWorldTerrainY(sp.x, sp.z);
    const sc = 0.86 + rng() * 0.32;
    const q = Quaternion.RotationYawPitchRoll(rng() * Math.PI * 2, 0, 0);
    composeMatArray(sp.x, y - 0.08 * sc, sp.z, q, sc, sc, sc, mBuf, i);
    const baseHex = hydPalette[i % hydPalette.length];
    const baseCol = hexToColor3(baseHex);
    for (let k = 0; k < corymbsPerShrub; k += 1) {
      const a = (k / (corymbsPerShrub - 1)) * Math.PI * 2 + i * 0.43 + (rng() - 0.5) * 0.35;
      const rad = k < 2 ? 0.05 * (k + 0.5) : (0.18 + (k % 3) * 0.075) * sc;
      const cy = k < 2 ? 0.42 * sc : (0.20 + (k % 3) * 0.075 + (rng() - 0.5) * 0.06) * sc;
      const cs = (0.76 + rng() * 0.36) * sc;
      const cQ = Quaternion.RotationYawPitchRoll(rng() * Math.PI * 2, (rng() - 0.5) * 0.35, (rng() - 0.5) * 0.35);
      composeMatArray(sp.x + Math.cos(a) * rad, y + cy, sp.z + Math.sin(a) * rad, cQ, cs, cs * 0.90, cs, cBuf, cIdx);
      const jit = 0.90 + rng() * 0.18;
      colBuf[cIdx * 4 + 0] = clamp(baseCol.r * jit, 0, 1);
      colBuf[cIdx * 4 + 1] = clamp(baseCol.g * jit, 0, 1);
      colBuf[cIdx * 4 + 2] = clamp(baseCol.b * jit, 0, 1);
      colBuf[cIdx * 4 + 3] = 1;
      cIdx += 1;
    }
  }

  moundMesh.thinInstanceSetBuffer("matrix", mBuf, 16, true);
  corymbMesh.thinInstanceSetBuffer("matrix", cBuf, 16, true);
  corymbMesh.thinInstanceSetBuffer("color", colBuf, 4, false);

  return { spots, corymbMesh, colBuf, corymbsPerShrub };
}

// ---------------------------------------------------------------------------
// 5. Ambient Drifting Petals + Interactive Butterflies + Evening Fireflies
// ---------------------------------------------------------------------------

function buildDriftingPetals(scene, floraRoot) {
  const COUNT = 340;
  const geoPos = [-0.032, -0.042, 0.006, 0.032, -0.042, 0.006, 0.026, 0.042, -0.004, -0.026, 0.042, -0.004];
  const geoIdx = [0, 1, 2, 0, 2, 3];
  const mesh = buildVertexMesh("DriftingPetals340", scene, floraRoot, { positions: geoPos, indices: geoIdx });
  const mat = new StandardMaterial("DriftPetalMat", scene);
  mat.diffuseColor = new Color3(1, 1, 1);
  mat.emissiveColor = new Color3(0.08, 0.04, 0.06);
  mat.specularColor = new Color3(0.06, 0.06, 0.06);
  mat.backFaceCulling = false;
  mat.twoSidedLighting = true;
  mesh.material = mat;
  mesh.alwaysSelectAsActiveMesh = true;

  const rng = mulberry32(90517);
  const palette = [0xfad4e0, 0xfff5f8, 0xeb7696, 0xc92a49, 0xf6c2d2];
  const state = [];
  const matBuf = new Float32Array(COUNT * 16);
  const colBuf = new Float32Array(COUNT * 4);

  for (let i = 0; i < COUNT; i += 1) {
    const nearGarden = i < 160;
    let x = nearGarden ? -38.0 + rng() * 40.0 : -85.0 + rng() * 115.0;
    let z = nearGarden ? -22.0 + rng() * 40.0 : -75.0 + rng() * 128.0;
    if (x > -25.6 && x < -2.4 && z > -11.2 && z < 6.8) {
      z = z >= -2.2 ? 9.5 + rng() * 7.5 : -13.5 - rng() * 8.5;
    }
    const baseH = Math.max(1.5, getWorldTerrainY(x, z));
    state.push({
      x,
      y: baseH + 0.4 + rng() * 5.2,
      z,
      vx: 0.38 + rng() * 0.45,
      vy: -0.24 - rng() * 0.22,
      vz: 0.18 + (rng() - 0.5) * 0.35,
      phase: rng() * Math.PI * 2,
      spin: 1.4 + rng() * 2.2,
      burstT: 0,
    });
    const c = hexToColor3(palette[i % palette.length]);
    colBuf[i * 4 + 0] = c.r;
    colBuf[i * 4 + 1] = c.g;
    colBuf[i * 4 + 2] = c.b;
    colBuf[i * 4 + 3] = 1;
    composeMatArray(state[i].x, state[i].y, state[i].z, Quaternion.Identity(), 1, 1, 1, matBuf, i);
  }
  mesh.thinInstanceSetBuffer("matrix", matBuf, 16, false);
  mesh.thinInstanceSetBuffer("color", colBuf, 4, true);

  const initState = state.map((s) => ({ ...s }));
  let activeCount = COUNT;

  return {
    updatePetals(elapsed, dt) {
      for (let i = 0; i < activeCount; i += 1) {
        const p = state[i];
        if (dt > 0) {
          if (p.burstT > 0) {
            p.burstT = Math.max(0, p.burstT - dt);
            const swirl = elapsed * 3.8 + p.phase;
            p.x += (p.vx + Math.cos(swirl) * 1.15) * dt;
            p.z += (p.vz + Math.sin(swirl) * 1.15) * dt;
            p.y += p.vy * dt;
            p.vy -= 0.85 * dt;
          } else {
            p.x += (p.vx + 0.28 * Math.sin(elapsed * 0.9 + p.phase)) * dt;
            p.z += (p.vz + 0.24 * Math.cos(elapsed * 0.75 + p.phase)) * dt;
            p.y += (p.vy + 0.09 * Math.sin(elapsed * 1.8 + p.phase)) * dt;
          }
          const insideVillaShell = p.x > -25.6 && p.x < -2.4 && p.z > -11.2 && p.z < 6.8 && p.y < 9.2;
          const onCourtSlab = p.x > -20.5 && p.x < 2.0 && p.z >= 6.8 && p.z <= 12.4;
          const groundY = onCourtSlab ? 2.24 : Math.max(1.2, getWorldTerrainY(p.x, p.z));
          if (insideVillaShell || p.y < groundY + 0.08 || p.x > 46 || Math.abs(p.z) > 95) {
            p.x = i < 160 ? -38.0 + ((i * 0.618) % 1) * 38.0 : -82.0 + ((i * 0.371) % 1) * 104.0;
            p.z = i < 160 ? -20.0 + ((i * 0.419) % 1) * 36.0 : -68.0 + ((i * 0.731) % 1) * 116.0;
            if (p.x > -25.6 && p.x < -2.4 && p.z > -11.2 && p.z < 6.8) {
              p.z = i % 2 === 0 ? 10.2 + (i % 7) * 0.9 : -14.2 - (i % 7) * 1.1;
            }
            p.y = Math.max(1.6, getWorldTerrainY(p.x, p.z)) + 3.6 + (i % 7) * 0.45;
            p.vy = -0.26 - (i % 5) * 0.05;
            p.burstT = 0;
          }
        }
        const q = Quaternion.RotationYawPitchRoll(
          elapsed * p.spin * 0.72 + p.phase * 1.3,
          elapsed * p.spin + p.phase,
          Math.sin(elapsed * 2.1 + p.phase) * 0.85
        );
        composeMatArray(p.x, p.y, p.z, q, 1, 1, 1, matBuf, i);
      }
      mesh.thinInstanceBufferUpdated("matrix");
    },
    setPetalRatio(ratio) {
      activeCount = Math.max(40, Math.round(COUNT * ratio));
      mesh.thinInstanceCount = activeCount;
    },
    resetPetals() {
      for (let i = 0; i < COUNT; i += 1) Object.assign(state[i], initState[i]);
    },
    triggerBurst(origin) {
      if (!origin) return;
      for (let i = 0; i < Math.min(84, activeCount); i += 1) {
        const p = state[(i * 3) % activeCount];
        const a = (i / 84) * Math.PI * 2;
        const r = 0.25 + (i % 5) * 0.22;
        p.x = origin.x + Math.cos(a) * r;
        p.y = (origin.y ?? 3.2) + ((i % 7) - 3) * 0.28;
        p.z = origin.z + Math.sin(a) * r;
        p.vx = Math.cos(a) * 1.55;
        p.vy = 0.85 + (i % 4) * 0.25;
        p.vz = Math.sin(a) * 1.55;
        p.burstT = 2.6;
      }
    },
  };
}

function buildButterflySwarm(scene, parent, count = 10) {
  const wingTex = new DynamicTexture("ButterflyWingTex", 64, scene, false);
  const ctx = wingTex.getContext();
  ctx.clearRect(0, 0, 64, 64);
  const grd = ctx.createRadialGradient(4, 32, 2, 4, 32, 62);
  grd.addColorStop(0, "#ffffff");
  grd.addColorStop(0.65, "#f2f2f2");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.moveTo(2, 32);
  ctx.bezierCurveTo(22, -2, 64, 4, 58, 28);
  ctx.bezierCurveTo(50, 34, 54, 40, 48, 52);
  ctx.bezierCurveTo(38, 64, 16, 56, 2, 34);
  ctx.fill();
  ctx.fillStyle = "rgba(60,40,60,0.55)";
  ctx.beginPath();
  ctx.arc(40, 20, 4, 0, Math.PI * 2);
  ctx.fill();
  wingTex.hasAlpha = true;
  wingTex.update();

  // Base wing quad anchored along X=0 edge in XZ plane
  const wMesh = buildVertexMesh("InteractionButterflies", scene, parent, {
    positions: [0, 0, -0.055, 0.11, 0, -0.055, 0.11, 0, 0.055, 0, 0, 0.055],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
  });
  const wMat = new StandardMaterial("ButterflyWingMat", scene);
  wMat.diffuseTexture = wingTex;
  wMat.useAlphaFromDiffuseTexture = true;
  wMat.emissiveColor = new Color3(0.22, 0.16, 0.22);
  wMat.backFaceCulling = false;
  wMesh.material = wMat;
  wMesh.alwaysSelectAsActiveMesh = true;
  wMesh.isVisible = false;

  const palette = [0xffb3d1, 0xfff1a6, 0xb9d8ff, 0xffffff, 0xd7b8ff, 0xffc58a];
  const matBuf = new Float32Array(count * 2 * 16);
  const colBuf = new Float32Array(count * 2 * 4);
  for (let i = 0; i < count * 2; i += 1) {
    const c = hexToColor3(palette[Math.floor(i / 2) % palette.length]);
    colBuf[i * 4 + 0] = c.r;
    colBuf[i * 4 + 1] = c.g;
    colBuf[i * 4 + 2] = c.b;
    colBuf[i * 4 + 3] = 1;
    hiddenMatMatrixCopy(matBuf, i);
  }
  wMesh.thinInstanceSetBuffer("matrix", matBuf, 16, false);
  wMesh.thinInstanceSetBuffer("color", colBuf, 4, true);

  function hiddenMatMatrixCopy(buf, idx) {
    Matrix.Translation(0, -999, 0).copyToArray(buf, idx * 16);
  }

  const bugs = Array.from({ length: count }, (_, i) => ({
    ph: i * 1.37,
    r: 0.6 + (i % 4) * 0.35,
    h: 0.5 + (i % 3) * 0.35,
    sp: 0.8 + (i % 5) * 0.18,
  }));
  const state = { t: 0, life: 0, cx: 0, cy: 0, cz: 0 };

  return {
    spawn(cx, cy, cz, life = 14) {
      state.cx = cx;
      state.cy = cy;
      state.cz = cz;
      state.life = life;
      state.t = 0;
      wMesh.isVisible = true;
    },
    update(elapsed, dt) {
      if (state.life <= 0) return;
      state.t += dt;
      state.life -= dt;
      const intro = Math.min(1, state.t / 1.5);
      const outro = Math.min(1, Math.max(0, state.life) / 2.0);
      for (let i = 0; i < count; i += 1) {
        const b = bugs[i];
        const a = state.t * b.sp + b.ph;
        const rr = b.r * (0.4 + 0.6 * intro) + (1 - outro) * 4.0;
        const x = state.cx + Math.cos(a) * rr + Math.sin(a * 2.3) * 0.25;
        const z = state.cz + Math.sin(a * 0.9) * rr;
        const y = state.cy + b.h + Math.sin(a * 3.1) * 0.22 + (1 - outro) * 3.0;
        const heading = Math.atan2(-Math.sin(a) * rr, Math.cos(a * 0.9) * rr * 0.9);
        const flap = Math.sin(elapsed * 26 + b.ph * 3) * 1.05;
        const s = Math.min(intro * 1.4, 1) * outro;
        for (let side = 0; side < 2; side += 1) {
          const q = Quaternion.RotationAxis(_UP, heading).multiply(Quaternion.RotationAxis(new Vector3(0, 0, 1), side === 0 ? flap : Math.PI - flap));
          composeMatArray(x, y, z, q, s, s, side === 0 ? s : -s, matBuf, i * 2 + side);
        }
      }
      wMesh.thinInstanceBufferUpdated("matrix");
      if (state.life <= 0) wMesh.isVisible = false;
    },
    clear() {
      state.life = 0;
      wMesh.isVisible = false;
    },
  };
}

// ---------------------------------------------------------------------------
// 6. 6 Flora E-Key Interactables
// ---------------------------------------------------------------------------

function buildFloraInteractables(scene, floraRoot, { treeInfo, roseInfo, hydInfo, petals, containers }) {
  const fx = createInteractionFX(floraRoot, { name: "FloraInteractionFX", maxSparks: 360, maxPetals: 220, maxRings: 4, scene });
  const butterflies = buildButterflySwarm(scene, floraRoot, 10);
  const interactables = [];
  const persistent = [];
  const terrainPt = (x, z, lift = 0) => new Vector3(x, getWorldTerrainY(x, z) + lift, z);

  // 1. Pick a Rose from Villa Front Bed
  const bedRoses = (roseInfo.registry || [])
    .filter((r) => r && r.z > 6.4 && r.z < 8.0 && r.x > -22.6 && r.x < -18.4)
    .sort((a, b) => Math.abs(a.x + 20.5) - Math.abs(b.x + 20.5));
  const pickState = { next: 0 };
  const pickedBouquets = [];

  const setRoseScale = (r, s) => {
    const sc = Math.max(0.0001, s) * r.scale;
    composeMatArray(r.x, r.y, r.z, r.q, sc, sc, sc, roseInfo.bloomMatBuf, r.k);
    roseInfo.bloomMesh.thinInstanceBufferUpdated("matrix");
    if (r.stemK >= 0) {
      composeMatArray(r.x, r.y, r.z, r.q, sc, sc, sc, roseInfo.stemMatBuf, r.stemK);
      roseInfo.stemMesh.thinInstanceBufferUpdated("matrix");
    }
  };

  interactables.push({
    id: "flora-rose-pick",
    label: "摘一朵玫瑰送给TA",
    position: new Vector3(-20.5, 2.22, 8.05),
    radius: 2.0,
    floorY: 2.22,
    activate(ctx = {}) {
      const r = bedRoses.length ? bedRoses[pickState.next % bedRoses.length] : null;
      pickState.next += 1;
      const ox = r ? r.x : -20.5;
      const oy = r ? r.y : 2.7;
      const oz = r ? r.z : 7.2;
      if (r) setRoseScale(r, 0);

      let bqRoot = null;
      if (containers.hero_rose) {
        const inst = instantiateGLB(containers.hero_rose, `PickedRose_${pickState.next}`, floraRoot);
        bqRoot = inst?.rootNodes?.[0] || null;
      }
      if (!bqRoot) {
        bqRoot = MeshBuilder.CreateSphere(`PickedRose_${pickState.next}`, { diameter: 0.22 }, scene);
        bqRoot.parent = floraRoot;
        bqRoot.material = makePbrMat("PickedRoseFallbackMat", scene, { color: 0xe6496f, roughness: 0.4 });
      }
      bqRoot.position.set(ox, oy - 0.15, oz);
      bqRoot.scaling.setAll(1.4);
      bqRoot.rotationQuaternion = null;
      bqRoot.getChildMeshes?.().forEach((m) => { m.isPickable = false; });
      pickedBouquets.push(bqRoot);

      fx.petalBurst(new Vector3(ox, oy, oz), { count: 26, up: 1.0, speed: [0.3, 0.9], floorY: 2.24, life: 4.5 });
      fx.burst(new Vector3(ox, oy, oz), { count: 26, colors: [0xffd6e4, 0xfff4c8], speed: [0.4, 1.1], gravity: 0.2, size: 0.07 });

      const tz = oz + 0.85;
      fx.addTask(
        6.0,
        (u, dt, t) => {
          const rise = Math.min(1, t / 1.4);
          const e = easeOutBack(rise);
          bqRoot.position.set(ox, oy - 0.15 + e * 1.15 + Math.sin(t * 2.2) * 0.04 * rise, lerp(oz, tz, e));
          bqRoot.rotation.set(0.25 * Math.sin(t * 1.7), t * 1.6, 0.18 * Math.cos(t * 1.3));
          const shrink = u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1;
          bqRoot.scaling.setAll(1.4 * Math.max(0.001, shrink));
          if (Math.random() < dt * 14) {
            fx.spark(bqRoot.position.x + (Math.random() - 0.5) * 0.3, bqRoot.position.y + 0.25, bqRoot.position.z + (Math.random() - 0.5) * 0.3, 0, 0.25, 0, {
              color: 0xffc8da,
              life: 1.1,
              size: 0.06,
            });
          }
        },
        () => {
          fx.heart(bqRoot.position.add(new Vector3(0, 0.3, 0)), { scale: 0.035, count: 44 });
          bqRoot.dispose();
          const idx = pickedBouquets.indexOf(bqRoot);
          if (idx >= 0) pickedBouquets.splice(idx, 1);
        }
      );

      if (r) {
        fx.addTask(16.0, (u) => {
          if (u > 0.88) setRoseScale(r, easeOutBack((u - 0.88) / 0.12));
        }, () => setRoseScale(r, 1));
      }
      ctx.audio?.playPetalGlissando?.();
      return ctx.actor === "ran" ? "小冉子摘下一朵带露的玫瑰，悄悄递给小贤贤 🌹" : "小贤贤摘下一朵玫瑰，花瓣轻轻飘落 🌹";
    },
  });

  // 2. Smell Climbing-Rose Arch
  interactables.push({
    id: "flora-rose-arch-smell",
    label: "闻一闻拱门玫瑰花香",
    position: new Vector3(-14.0, 2.22, 9.9),
    radius: 2.2,
    floorY: 2.22,
    activate(ctx = {}) {
      const cx = -14.0;
      const cz = 9.6;
      fx.emit(3.2, 60, (i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const a = i * 0.45;
        fx.spark(cx + side * (1.35 + Math.cos(a) * 0.2), 2.6 + Math.random() * 1.6, cz + Math.sin(a) * 0.3, -side * 0.35, 0.45, Math.cos(a) * 0.25, {
          color: i % 3 === 0 ? 0xfff0f6 : 0xff9ec0,
          life: 2.4,
          size: 0.075,
          drag: 0.3,
          flicker: 0.3,
        });
      });
      fx.petalBurst(new Vector3(cx, 5.2, cz), { count: 48, radius: 1.5, up: 0.2, speed: [0.1, 0.5], floorY: 2.24, life: 6.0 });
      petals.triggerBurst({ x: cx, y: 4.6, z: cz });
      ctx.audio?.playPetalGlissando?.();
      return "深吸一口气——是大马士革玫瑰的甜香 🌸";
    },
  });

  // 3. Recolor Hydrangeas Along West Gazebo Trail
  if (hydInfo.spots.length) {
    const target = { x: -43.5, z: 14.5 };
    let best = 0;
    let bestD = Infinity;
    hydInfo.spots.forEach((sp, i) => {
      const d = Math.hypot(sp.x - target.x, sp.z - target.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const hs = hydInfo.spots[best];
    const group3 = hydInfo.spots
      .map((sp, i) => ({ i, d: Math.hypot(sp.x - hs.x, sp.z - hs.z) }))
      .filter((o) => o.d < 4.2)
      .map((o) => o.i);
    const palette = [0x6a96e2, 0xd889c8, 0xf28aa8, 0xf6f4ec, 0x8f7fe8];
    let paletteIdx = 0;
    const dx = -49.0 + 38.0;
    const dz = 20.0 - 8.0;
    const dLen = Math.hypot(dx, dz) || 1;
    const tx = dx / dLen;
    const tz = dz / dLen;
    const along = (hs.x + 38.0) * tx + (hs.z - 8.0) * tz;
    const standX = lerp(hs.x, -38.0 + tx * along, 0.55);
    const standZ = lerp(hs.z, 8.0 + tz * along, 0.55);

    interactables.push({
      id: "flora-hydrangea-color",
      label: "轻抚绣球花，看它变色",
      position: terrainPt(standX, standZ),
      radius: 2.4,
      activate(ctx = {}) {
        paletteIdx = (paletteIdx + 1) % palette.length;
        const per = hydInfo.corymbsPerShrub;
        const to = hexToColor3(palette[paletteIdx]);
        const fromCols = [];
        for (const si of group3) {
          for (let k = 0; k < per; k += 1) {
            const idx = (si * per + k) * 4;
            fromCols.push(new Color3(hydInfo.colBuf[idx], hydInfo.colBuf[idx + 1], hydInfo.colBuf[idx + 2]));
          }
        }
        fx.addTask(1.6, (u) => {
          const s = smoothstep(0, 1, u);
          let n = 0;
          for (const si of group3) {
            for (let k = 0; k < per; k += 1) {
              const idx = (si * per + k) * 4;
              const fc = fromCols[n++];
              const jit = 0.92 + ((k * 37) % 7) * 0.02;
              hydInfo.colBuf[idx + 0] = clamp(lerp(fc.r, to.r * jit, s), 0, 1);
              hydInfo.colBuf[idx + 1] = clamp(lerp(fc.g, to.g * jit, s), 0, 1);
              hydInfo.colBuf[idx + 2] = clamp(lerp(fc.b, to.b * jit, s), 0, 1);
            }
          }
          hydInfo.corymbMesh.thinInstanceBufferUpdated("color");
        });
        const y = getWorldTerrainY(hs.x, hs.z);
        fx.burst(new Vector3(hs.x, y + 0.7, hs.z), { count: 50, colors: [palette[paletteIdx], 0xffffff], speed: [0.5, 1.4], gravity: 0.3, size: 0.08 });
        ctx.audio?.playDuetArpeggio?.();
        const names = ["湖水蓝", "丁香紫", "蔷薇粉", "月光白", "星夜紫"];
        return `绣球花悄悄变成了${names[paletteIdx]} 💠`;
      },
    });
  }

  // 4. Shake Flowering Cherry Tree
  const cherries = (treeInfo.treeRefs || []).filter((t) => t.sp === "cherry");
  if (cherries.length) {
    let ct = cherries[0];
    let bd = Infinity;
    for (const t of cherries) {
      const d = Math.hypot(t.x + 24.5, t.z - 14.5);
      if (d < bd) {
        bd = d;
        ct = t;
      }
    }
    const shake = { amp: 0 };
    persistent.push((elapsed, dt) => {
      if (shake.amp <= 0) return;
      shake.amp = Math.max(0, shake.amp - dt * 0.32);
      const a = shake.amp * Math.sin(elapsed * 17.0) * 0.05;
      const b = shake.amp * 0.6 * Math.cos(elapsed * 13.0) * 0.05;
      const q = Quaternion.RotationYawPitchRoll(ct.yaw, ct.leanX + a, ct.leanZ + b);
      composeMatArray(ct.x, ct.y, ct.z, q, ct.scale, ct.scale, ct.scale, ct.matBuf, ct.idx);
      for (const m of ct.meshes) m.thinInstanceBufferUpdated("matrix");
    });

    const dirX = -28.5 - ct.x;
    const dirZ = 17.0 - ct.z;
    const dl = Math.hypot(dirX, dirZ) || 1;
    interactables.push({
      id: "flora-cherry-shake",
      label: "摇一摇樱花树",
      position: terrainPt(ct.x + (dirX / dl) * 1.9, ct.z + (dirZ / dl) * 1.9),
      radius: 2.4,
      activate(ctx = {}) {
        shake.amp = 1.0;
        const sc = ct.scale || 1;
        fx.emit(3.5, 46, () => {
          const th = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * 2.6 * sc;
          const px = ct.x + Math.cos(th) * r;
          const pz = ct.z + Math.sin(th) * r;
          fx.petal(px, ct.y + (3.0 + Math.random() * 2.2) * sc, pz, (Math.random() - 0.5) * 0.4, -0.1, (Math.random() - 0.5) * 0.4, {
            color: Math.random() < 0.5 ? 0xffd9e6 : 0xfff6f9,
            life: 9.0,
            floorY: getWorldTerrainY(px, pz) + 0.03,
          });
        });
        ctx.audio?.playPetalGlissando?.();
        return "樱花雨簌簌落下，落了你们满肩 🌸";
      },
    });
  }

  // 5. Lie Down Together in the Coastal Flower Sea
  {
    const lx = -46.2;
    const lz = 24.0;
    const ly = getWorldTerrainY(lx, lz);
    interactables.push({
      id: "flora-meadow-lie",
      label: "在花海里并肩躺一躺",
      position: new Vector3(lx, ly, lz),
      radius: 2.6,
      pose: {
        type: "lie",
        seats: [
          { x: lx - 0.42, y: getWorldTerrainY(lx - 0.42, lz) + 0.04, z: lz, yaw: Math.PI },
          { x: lx + 0.42, y: getWorldTerrainY(lx + 0.42, lz) + 0.04, z: lz, yaw: Math.PI },
        ],
      },
      activate(ctx = {}) {
        butterflies.spawn(lx, ly + 0.2, lz, 16);
        fx.petalBurst(new Vector3(lx, ly + 0.4, lz), {
          count: 40,
          radius: 1.2,
          up: 1.6,
          speed: [0.3, 1.0],
          floorY: ly + 0.05,
          life: 6,
          colors: [0xffffff, 0xfff2a8, 0xb8d4ff, 0xf6c2d2],
        });
        ctx.audio?.playDuetArpeggio?.();
        return "蝴蝶在花海里围着你们翩翩起舞 🦋";
      },
    });
  }

  // 6. Weave a Wildflower Crown in the Meadow
  {
    const cx = -50.5;
    const cz = 27.5;
    const cy = getWorldTerrainY(cx, cz);
    const crown = new TransformNode("WovenFlowerCrown", scene);
    crown.parent = floraRoot;
    crown.setEnabled(false);

    const vine = MeshBuilder.CreateTorus("CrownVine", { diameter: 0.26, thickness: 0.024, tessellation: 24 }, scene);
    vine.parent = crown;
    vine.material = makePbrMat("CrownVineMat", scene, { color: 0x5f8a4a, roughness: 0.7 });
    vine.isPickable = false;

    const bloomCols = [0xffffff, 0xffb7cf, 0xfff0a0, 0xc9b5ff, 0xff8fae];
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2;
      const bMesh = MeshBuilder.CreateSphere(`CrownBloom_${i}`, { diameter: 0.052, segments: 6 }, scene);
      bMesh.parent = crown;
      bMesh.position.set(Math.cos(a) * 0.13, 0.012, Math.sin(a) * 0.13);
      bMesh.scaling.set(1, 0.6, 1);
      bMesh.isPickable = false;
      bMesh.material = makePbrMat(`CrownBloomMat_${i % bloomCols.length}`, scene, {
        color: bloomCols[i % bloomCols.length],
        emissive: 0x221016,
        roughness: 0.55,
      });
    }

    interactables.push({
      id: "flora-flower-crown",
      label: "编一顶野花花环",
      position: new Vector3(cx, cy, cz),
      radius: 2.4,
      activate(ctx = {}) {
        crown.setEnabled(true);
        crown.rotationQuaternion = null;
        fx.burst(new Vector3(cx, cy + 0.4, cz), { count: 36, colors: bloomCols, speed: [0.4, 1.2], gravity: 0.25, size: 0.07 });
        fx.addTask(
          7.0,
          (u, dt, t) => {
            const grow = easeOutBack(Math.min(1, t / 1.0));
            const fade = u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1;
            crown.scaling.setAll(Math.max(0.001, grow * fade * 2.2));
            crown.position.set(cx, cy + 0.3 + Math.min(1, t / 1.4) * 1.1 + Math.sin(t * 2.0) * 0.05, cz);
            crown.rotation.set(0.35 * Math.sin(t * 1.3), t * 1.2, 0.2 * Math.cos(t * 1.1));
            if (Math.random() < dt * 10) {
              fx.spark(crown.position.x + (Math.random() - 0.5) * 0.5, crown.position.y, crown.position.z + (Math.random() - 0.5) * 0.5, 0, 0.3, 0, {
                color: 0xfff6c8,
                life: 1.0,
                size: 0.06,
              });
            }
          },
          () => {
            crown.setEnabled(false);
            fx.heart(crown.position.clone(), { scale: 0.03, count: 40, colors: [0xffffff, 0xffc9dc] });
          }
        );
        ctx.audio?.playDuetArpeggio?.();
        return ctx.actor === "ran" ? "小冉子编好花环，戴在小贤贤头上 👑" : "小贤贤编了一顶雏菊花环 👑";
      },
    });
  }

  return {
    interactables,
    update(elapsed, dt) {
      fx.update(dt, elapsed);
      butterflies.update(elapsed, dt);
      for (let i = 0; i < persistent.length; i += 1) persistent[i](elapsed, dt);
    },
    reset() {
      fx.clear();
      butterflies.clear();
      for (const bq of pickedBouquets) bq.dispose();
      pickedBouquets.length = 0;
      for (const r of bedRoses) setRoseScale(r, 1);
    },
  };
}

// ---------------------------------------------------------------------------
// Public Entry Point
// ---------------------------------------------------------------------------

export function buildFloraAndFX(scene, containers, shadowGen) {
  const root = new TransformNode("BotanicalFloraRoot", scene);
  const treeInfo = buildStylizedBlenderTrees(scene, root, containers.stylized_trees, shadowGen);
  const roseInfo = buildEstateRoseGardens(scene, root);
  const scalableMeshes = buildMeadowAndFlowerSea(scene, root, containers);
  const hydInfo = buildHydrangeaShrubs(scene, root);
  const petals = buildDriftingPetals(scene, root);
  const floraInteract = buildFloraInteractables(scene, root, { treeInfo, roseInfo, hydInfo, petals, containers });

  return {
    root,
    treeCount: treeInfo.count,
    roseCount: roseInfo.count,
    interactables: floraInteract.interactables,
    update(elapsed = 0, dt = 0.016) {
      const safeDt = typeof dt === "number" && dt >= 0 ? Math.min(dt, 0.1) : 0.016;
      petals.updatePetals(elapsed, safeDt);
      floraInteract.update(elapsed, safeDt);
    },
    setQualityTier(tier) {
      const ratio = tier === "low" ? 0.34 : tier === "medium" ? 0.64 : 1.0;
      for (const item of scalableMeshes) {
        item.mesh.thinInstanceCount = Math.max(item.minFloor, Math.round(item.maxCount * ratio));
      }
      petals.setPetalRatio(tier === "low" ? 0.35 : tier === "medium" ? 0.7 : 1.0);
    },
    reset() {
      petals.resetPetals();
      floraInteract.reset();
    },
    burstPetals(origin) {
      petals.triggerBurst(origin);
    },
  };
}
