// Shared Three.js anime cel-shading ("三渲二") & high-precision procedural geometry toolkit
// for "太阳雨中的童话星语花湾 · Sunshower Fairytale Harbor Diorama".

import * as THREE from "../vendor/three-0.186.1/three.module.js";
import { mergeGeometries } from "../vendor/three-0.186.1/addons/utils/BufferGeometryUtils.js";

export { THREE, mergeGeometries };

export const PALETTE = {
  skyTop: 0xdff1f4,
  skyHorizon: 0xf7f8f0,
  seaGlass: 0x5bc2be,
  seaDeep: 0x267588,
  seaFoam: 0xf7fcfc,
  wetConcrete: 0xdce2e3,
  concreteSide: 0xb8c3c7,
  tidalDark: 0x62777d,
  hazardYellow: 0xf5c338,
  hazardBlack: 0x2a3136,
  ropeOrange: 0xe86a42,
  brassGold: 0xf6c96b,
  castIron: 0x2c353b,
  rustRed: 0x9e5947,
  inkOutline: 0x2b4353,
  villaCream: 0xfbf5ea,
  villaRoofCoral: 0xe78b7e,
  villaTrimMint: 0x9cd6cb,
  villaWood: 0xb5835a,
  pastelPink: 0xf4a8b6,
  pastelButter: 0xf8de8c,
  pastelLavender: 0xc5b8e8,
  pastelSky: 0x97d2ec,
};

export function mulberry32(seed = 20261112) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gradientCache = new Map();

export function createCelGradient(bands = [156, 204, 238, 255]) {
  const key = bands.join(",");
  if (gradientCache.has(key)) return gradientCache.get(key);

  const data = new Uint8Array(bands.length * 4);
  for (let i = 0; i < bands.length; i += 1) {
    const v = bands[i];
    data[i * 4 + 0] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, bands.length, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  gradientCache.set(key, tex);
  return tex;
}

const toonMatCache = new Map();
const lineMatCache = new Map();
const hullMatCache = new Map();

export function toonMat(color, opts = {}) {
  const canCache =
    !opts.map &&
    !opts.alphaMap &&
    !opts.bumpMap &&
    !opts.unique &&
    opts.opacity === undefined;

  const cacheKey = canCache
    ? `${new THREE.Color(color).getHexString()}_${opts.emissive || 0}_${opts.emissiveIntensity || 0}_${opts.side || THREE.FrontSide}_${opts.bands ? opts.bands.join("-") : "def"}`
    : null;

  if (cacheKey && toonMatCache.has(cacheKey)) {
    return toonMatCache.get(cacheKey);
  }

  const mat = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: createCelGradient(opts.bands || [158, 204, 238, 255]),
    map: opts.map || null,
    alphaMap: opts.alphaMap || null,
    transparent: Boolean(opts.transparent),
    opacity: opts.opacity !== undefined ? opts.opacity : 1.0,
    side: opts.side !== undefined ? opts.side : THREE.FrontSide,
    depthWrite: opts.depthWrite !== undefined ? opts.depthWrite : true,
  });

  if (opts.emissive !== undefined) {
    mat.emissive = new THREE.Color(opts.emissive);
    mat.emissiveIntensity = opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 0.45;
  }
  if (opts.polygonOffset) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = opts.polygonOffsetFactor || -1;
    mat.polygonOffsetUnits = opts.polygonOffsetUnits || -1;
  }

  if (cacheKey) toonMatCache.set(cacheKey, mat);
  return mat;
}

export function wetSurfaceMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    map: opts.map || null,
    roughness: opts.roughness !== undefined ? opts.roughness : 0.28,
    metalness: opts.metalness !== undefined ? opts.metalness : 0.06,
    transparent: Boolean(opts.transparent),
    opacity: opts.opacity !== undefined ? opts.opacity : 1.0,
    side: opts.side !== undefined ? opts.side : THREE.FrontSide,
    polygonOffset: Boolean(opts.polygonOffset),
    polygonOffsetFactor: opts.polygonOffsetFactor || -1,
    polygonOffsetUnits: opts.polygonOffsetUnits || -1,
  });
}

export function glassMat(opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(opts.color !== undefined ? opts.color : 0xdff6f8),
    transparent: true,
    opacity: opts.opacity !== undefined ? opts.opacity : 0.24,
    roughness: opts.roughness !== undefined ? opts.roughness : 0.07,
    metalness: 0.04,
    reflectivity: 0.85,
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
    depthWrite: Boolean(opts.depthWrite),
    side: opts.side !== undefined ? opts.side : THREE.DoubleSide,
  });
}

export function emissiveMat(color, intensity = 1.1, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    roughness: 0.35,
    metalness: 0.0,
    transparent: Boolean(opts.transparent),
    opacity: opts.opacity !== undefined ? opts.opacity : 1.0,
    side: opts.side !== undefined ? opts.side : THREE.FrontSide,
  });
}

export function addEdgeInk(mesh, thresholdAngle = 28, color = PALETTE.inkOutline, opacity = 0.48) {
  if (!mesh || !mesh.geometry) return null;
  const key = `${new THREE.Color(color).getHexString()}_${opacity.toFixed(2)}`;
  let lineMat = lineMatCache.get(key);
  if (!lineMat) {
    lineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(color),
      transparent: opacity < 1,
      opacity,
      depthWrite: false,
    });
    lineMatCache.set(key, lineMat);
  }
  const edges = new THREE.EdgesGeometry(mesh.geometry, thresholdAngle);
  const lines = new THREE.LineSegments(edges, lineMat);
  lines.raycast = () => {};
  mesh.add(lines);
  return lines;
}

export function addHullOutline(mesh, thickness = 0.016, color = PALETTE.inkOutline, opacity = 0.72) {
  if (!mesh || !mesh.geometry) return null;
  const key = `${new THREE.Color(color).getHexString()}_${opacity.toFixed(2)}`;
  let mat = hullMatCache.get(key);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      side: THREE.BackSide,
      transparent: opacity < 1,
      opacity,
      depthWrite: false,
    });
    hullMatCache.set(key, mat);
  }
  const outline = new THREE.Mesh(mesh.geometry, mat);
  outline.scale.setScalar(1 + thickness);
  outline.raycast = () => {};
  mesh.add(outline);
  return outline;
}

export function makeCanvasTex(width, height, drawFn, opts = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    drawFn(ctx, width, height);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (opts.repeatX || opts.repeatY) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeatX || 1, opts.repeatY || 1);
  }
  tex.needsUpdate = true;
  return tex;
}

export function makeCatenaryPoints(p0, p1, sag = 0.35, segments = 20) {
  const pts = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const x = THREE.MathUtils.lerp(p0.x, p1.x, t);
    const z = THREE.MathUtils.lerp(p0.z, p1.z, t);
    const y = THREE.MathUtils.lerp(p0.y, p1.y, t) - Math.sin(Math.PI * t) * sag;
    pts.push(new THREE.Vector3(x, y, z));
  }
  return pts;
}

export function makeCatenaryTube(p0, p1, sag = 0.35, radius = 0.022, material = null, segments = 20) {
  const curve = new THREE.CatmullRomCurve3(makeCatenaryPoints(p0, p1, sag, segments));
  const geo = new THREE.TubeGeometry(curve, segments, radius, 6, false);
  const mesh = new THREE.Mesh(geo, material || toonMat(PALETTE.castIron));
  mesh.castShadow = false;
  mesh.userData.ropeSpec = { radius, segments };
  return mesh;
}

export function updateCatenaryTube(mesh, p0, p1, sag = 0.35) {
  if (!mesh) return;
  const { radius = 0.028, segments = 18 } = mesh.userData.ropeSpec || {};
  const curve = new THREE.CatmullRomCurve3(makeCatenaryPoints(p0, p1, sag, segments));
  const nextGeo = new THREE.TubeGeometry(curve, segments, radius, 6, false);
  if (mesh.geometry) mesh.geometry.dispose();
  mesh.geometry = nextGeo;
}

export function tagInteractive(root, id, label, opts = {}) {
  if (!root) return root;
  const meta = {
    id,
    label: label || id,
    accentColor: opts.accentColor !== undefined ? opts.accentColor : PALETTE.brassGold,
    focusOffset: opts.focusOffset || null,
  };
  root.userData.interactive = meta;
  root.traverse((child) => {
    child.userData.interactiveRoot = root;
    child.userData.interactive = meta;
  });
  return root;
}

export function enableShadows(root, { cast = true, receive = true } = {}) {
  root.traverse((child) => {
    if (child.isMesh) {
      if (child.material && child.material.transparent && child.material.opacity < 0.65) {
        child.castShadow = false;
      } else {
        child.castShadow = cast;
      }
      child.receiveShadow = receive;
    }
  });
  return root;
}
