import * as THREE from 'three';

const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, Number(v) || 0));

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function makeCanvas(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx, size };
}

function toTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace; // Decoded explicitly in linear-light shader
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ============================================================================
// 1. HIGH-RESOLUTION PROCEDURAL BOTANICAL TEXTURES (512x512 Albedo + Venation + Alpha)
// ============================================================================
// Convention: UV.x = u (0 at petal base/claw -> 1 at outer tip), UV.y = (v+1)/2 (0 left -> 1 right)
// Wait: mapping X=v (horizontal width across canvas) and Y=1-u (base at bottom, tip at top) makes
// 2D canvas drawing super intuitive! So we map UV = ((v + 1) * 0.5, u) where V=0 is bottom (u=0)
// and V=1 is top (u=1) in Three.js CanvasTexture (flipY = true default: canvas Y=0 is V=1 top/tip,
// canvas Y=size is V=0 bottom/base!).

/**
 * Rose Petal Texture: Plump obcordate (softly heart-notched) velvet rose petal
 * with honey-cream basal claw, branching silk venation, and soft scalloped margin.
 */
function createRosePetalTexture() {
  const { canvas, ctx, size } = makeCanvas(512);
  const img = ctx.createImageData(size, size);
  const data = img.data;

  for (let py = 0; py < size; py++) {
    const u = 1.0 - py / (size - 1); // 0 = base (bottom), 1 = tip (top)
    for (let px = 0; px < size; px++) {
      const v = (px / (size - 1)) * 2.0 - 1.0; // -1..1 across width

      // Obcordate rose petal silhouette: narrow claw -> wide plush belly -> softly cleft heart tip
      const heartDip = 0.055 * Math.exp(-v * v * 18.0) * smoothstep(0.75, 1.0, u);
      const microScallop = 0.016 * Math.sin(Math.atan2(u - 0.45, v) * 14.0) * smoothstep(0.45, 0.98, u);
      const halfWidth = Math.min(
        0.96,
        0.18 + 0.80 * Math.pow(Math.sin(clamp(u + heartDip, 0, 1) * Math.PI * 0.90), 0.52) + microScallop
      );
      const topLimit = 0.96 - heartDip + 0.012 * Math.cos(v * 9.0);

      const normR = Math.hypot(v / Math.max(0.08, halfWidth), Math.max(0, u - 0.48) / Math.max(0.1, topLimit - 0.48));
      const edgeDist = u < 0.48 ? Math.abs(v) / halfWidth : normR;
      const alpha = (1.0 - smoothstep(0.90, 1.0, edgeDist)) * smoothstep(0.0, 0.03, u);

      const idx = (py * size + px) * 4;
      if (alpha <= 0.004) {
        data[idx + 3] = 0;
        continue;
      }

      // Radiating curved vascular veins
      const fanAngle = Math.atan2(v * 0.85, u + 0.08);
      const veinPrimary = Math.pow(0.5 + 0.5 * Math.cos(fanAngle * 26.0 + Math.sin(u * 9.0) * 0.6), 6.0);
      const veinFine = Math.pow(0.5 + 0.5 * Math.cos(fanAngle * 58.0 - u * 6.0), 4.0);
      const veinMask = (veinPrimary * 0.55 + veinFine * 0.25) * smoothstep(0.08, 0.35, u) * (1.0 - 0.35 * u);

      // Basal warm cream-honey claw -> deep velvet heart -> luminous rolled margin
      const claw = 1.0 - smoothstep(0.02, 0.24, u);
      const marginGlow = smoothstep(0.62, 0.96, edgeDist);
      const velvetShade = 0.76 + 0.20 * u + 0.14 * marginGlow - 0.09 * veinMask;

      const r = clamp(velvetShade * (1.0 - 0.03 * claw) + 0.08 * claw, 0, 1);
      const g = clamp(velvetShade * (0.90 + 0.08 * marginGlow) + 0.10 * claw - 0.04 * veinMask, 0, 1);
      const b = clamp(velvetShade * (0.91 + 0.09 * marginGlow) - 0.10 * claw - 0.03 * veinMask, 0, 1);

      data[idx] = Math.round(r * 255);
      data[idx + 1] = Math.round(g * 255);
      data[idx + 2] = Math.round(b * 255);
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas);
}

/**
 * Endless Summer Hydrangea Sepal Texture: Rhomboid-obovate petaloid sepal
 * with delicate marginal teeth on the upper half, sapphire-cream eye, and palmate veins.
 */
function createHydrangeaSepalTexture() {
  const { canvas, ctx, size } = makeCanvas(512);
  const img = ctx.createImageData(size, size);
  const data = img.data;

  for (let py = 0; py < size; py++) {
    const u = 1.0 - py / (size - 1);
    for (let px = 0; px < size; px++) {
      const v = (px / (size - 1)) * 2.0 - 1.0;

      // Diamond-obovate sepal with delicate crenate serrations along outer margin
      const teeth = 0.032 * Math.sin(u * 34.0) * smoothstep(0.42, 0.88, u) * (1.0 - smoothstep(0.90, 1.0, u));
      const baseProfile = Math.pow(Math.sin(clamp(u, 0, 1) * Math.PI * 0.95), 0.62);
      const halfW = 0.10 + 0.82 * baseProfile + teeth;
      const dist = Math.hypot(v / Math.max(0.08, halfW), (u - 0.50) / 0.48);
      const alpha = (1.0 - smoothstep(0.91, 1.0, u < 0.45 ? Math.abs(v) / halfW : dist)) * smoothstep(0.0, 0.04, u);

      const idx = (py * size + px) * 4;
      if (alpha <= 0.004) {
        data[idx + 3] = 0;
        continue;
      }

      const midrib = Math.exp(-v * v * 42.0) * (1.0 - 0.4 * u);
      const latVein = Math.pow(0.5 + 0.5 * Math.cos((u * 16.0 - Math.abs(v) * 11.0) * Math.PI), 7.0) * (1.0 - Math.abs(v) * 0.5);
      const throatEye = 1.0 - smoothstep(0.0, 0.28, u);
      const margin = smoothstep(0.58, 0.95, dist);

      const baseTone = 0.56 + 0.34 * smoothstep(0.08, 0.88, u) + 0.12 * margin;
      const veinTint = midrib * 0.16 + latVein * 0.11;

      // Rich cobalt-violet throat blushing outward to luminous periwinkle sepal tips
      const r = clamp(baseTone * (0.86 + 0.16 * margin) - 0.14 * throatEye + veinTint * 0.65, 0, 1);
      const g = clamp(baseTone * (0.90 + 0.08 * margin) - 0.06 * throatEye + veinTint * 0.82, 0, 1);
      const b = clamp(baseTone * 1.06 + 0.05 * throatEye + veinTint, 0, 1);

      data[idx] = Math.round(r * 255);
      data[idx + 1] = Math.round(g * 255);
      data[idx + 2] = Math.round(b * 255);
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas);
}

/**
 * Sunflower Ray Floret Texture: Tapered lance-elliptic golden petal with twin-notched apex,
 * rich cadmium-amber nectar base, and parallel embossed veins.
 */
function createSunflowerRayTexture() {
  const { canvas, ctx, size } = makeCanvas(512);
  const img = ctx.createImageData(size, size);
  const data = img.data;

  for (let py = 0; py < size; py++) {
    const u = 1.0 - py / (size - 1);
    for (let px = 0; px < size; px++) {
      const v = (px / (size - 1)) * 2.0 - 1.0;

      // Lance-ovate profile tapering to a characteristic notched tip
      const tipNotch = 0.03 * Math.cos(v * 14.0) * smoothstep(0.86, 1.0, u);
      const env = Math.pow(Math.sin(clamp(u, 0, 1) * Math.PI * 0.96), 0.68) * (1.0 - 0.24 * u * u);
      const halfW = Math.max(0.04, 0.08 + 0.78 * env + tipNotch);
      const edge = Math.abs(v) / halfW;
      const tipFade = 1.0 - smoothstep(0.95, 1.0, u);
      const alpha = (1.0 - smoothstep(0.88, 1.0, edge)) * smoothstep(0.0, 0.03, u) * tipFade;

      const idx = (py * size + px) * 4;
      if (alpha <= 0.004) {
        data[idx + 3] = 0;
        continue;
      }

      // Parallel longitudinal sunflower petal ribs/furrows
      const normV = v / halfW;
      const ribs = Math.pow(0.5 + 0.5 * Math.cos(normV * Math.PI * 7.0), 3.0) * 0.11;
      const centerCrease = Math.exp(-normV * normV * 10.0) * 0.07;

      const basalAmber = 1.0 - smoothstep(0.04, 0.38, u);
      const tipSun = smoothstep(0.50, 0.95, u);

      const r = clamp(0.96 + 0.04 * tipSun - ribs * 0.3, 0, 1);
      const g = clamp(0.54 * basalAmber + 0.84 * (1.0 - basalAmber) + 0.08 * tipSun - ribs * 0.65 - centerCrease, 0, 1);
      const b = clamp(0.04 * basalAmber + 0.14 * (1.0 - basalAmber) + 0.10 * tipSun - ribs * 0.2, 0, 1);

      data[idx] = Math.round(r * 255);
      data[idx + 1] = Math.round(g * 255);
      data[idx + 2] = Math.round(b * 255);
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas);
}

/**
 * Sunflower Seed Disc Texture: 650 individual Vogel Fibonacci spiral achenes & open golden pollen starlets!
 */
function createSunflowerDiscTexture() {
  const { canvas, ctx, size } = makeCanvas(512);
  const cx = size * 0.5;
  const cy = size * 0.5;
  const maxR = size * 0.48;

  const bg = ctx.createRadialGradient(cx, cy, 4, cx, cy, maxR);
  bg.addColorStop(0.0, '#1e0d06');
  bg.addColorStop(0.55, '#2d1408');
  bg.addColorStop(0.82, '#4a240b');
  bg.addColorStop(1.0, '#2a180a');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
  ctx.fill();

  const totalSeeds = 680;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < totalSeeds; i++) {
    const t = i / totalSeeds;
    const r = Math.sqrt(t) * (maxR * 0.95);
    const a = i * golden;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const seedR = 2.6 + t * 3.8;

    // Ring of open golden-pollen disc florets between t = 0.56 and t = 0.88!
    const inPollenZone = t > 0.54 && t < 0.89;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);

    // Individual 3D-shaded seed / tubular floret
    ctx.fillStyle = t < 0.25 ? '#261309' : (inPollenZone ? '#92400e' : '#3b1c0b');
    ctx.beginPath();
    ctx.ellipse(0, 0, seedR * 1.05, seedR * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();

    // Highlight rim on each seed
    ctx.fillStyle = inPollenZone ? '#f59e0b' : 'rgba(180, 115, 65, 0.42)';
    ctx.beginPath();
    ctx.ellipse(seedR * 0.22, -seedR * 0.14, seedR * 0.55, seedR * 0.40, 0, 0, Math.PI * 2);
    ctx.fill();

    if (inPollenZone && i % 2 === 0) {
      ctx.fillStyle = '#fde047';
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(pa) * seedR * 0.62, Math.sin(pa) * seedR * 0.62, 1.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  return toTexture(canvas);
}

/**
 * Bearded Iris Petal Texture: Ruffled wavy velvet silhouette with intricate royal-violet
 * nectar-guide venation over a glowing cream-gold signal patch.
 */
function createIrisPetalTexture() {
  const { canvas, ctx, size } = makeCanvas(512);
  const img = ctx.createImageData(size, size);
  const data = img.data;

  for (let py = 0; py < size; py++) {
    const u = 1.0 - py / (size - 1);
    for (let px = 0; px < size; px++) {
      const v = (px / (size - 1)) * 2.0 - 1.0;

      const ruffleEdge = 0.042 * Math.sin(u * 24.0 + Math.abs(v) * 6.0) * smoothstep(0.32, 0.95, u);
      const widthEnv = Math.pow(Math.sin(clamp(u, 0, 1) * Math.PI * 0.93), 0.56);
      const halfW = 0.14 + 0.80 * widthEnv + ruffleEdge;
      const dist = u < 0.46 ? Math.abs(v) / halfW : Math.hypot(v / halfW, (u - 0.46) / 0.51);
      const alpha = (1.0 - smoothstep(0.90, 1.0, dist)) * smoothstep(0.0, 0.03, u);

      const idx = (py * size + px) * 4;
      if (alpha <= 0.004) {
        data[idx + 3] = 0;
        continue;
      }

      // Luminous cream-gold signal patch along lower center throat + dark-violet branching veins
      const signalPatch = Math.exp(-v * v * 9.5) * (1.0 - smoothstep(0.12, 0.62, u));
      const beardCore = Math.exp(-v * v * 28.0) * (1.0 - smoothstep(0.08, 0.48, u));
      const angle = Math.atan2(v * 0.9, u + 0.05);
      const veins = Math.pow(0.5 + 0.5 * Math.cos(angle * 34.0 + Math.sin(u * 12.0) * 0.5), 5.0)
        * smoothstep(0.06, 0.25, u) * (1.0 - smoothstep(0.65, 0.95, u));

      let r = 0.78 + 0.18 * u - 0.24 * veins;
      let g = 0.79 + 0.16 * u - 0.28 * veins;
      let b = 0.98 + 0.02 * u - 0.06 * veins;

      // Blend warm ivory signal patch & golden-tangerine beard
      r = r * (1.0 - signalPatch * 0.75) + 1.0 * (signalPatch * 0.75);
      g = g * (1.0 - signalPatch * 0.75) + 0.95 * (signalPatch * 0.75);
      b = b * (1.0 - signalPatch * 0.75) + 0.72 * (signalPatch * 0.75);

      r = r * (1.0 - beardCore) + 1.0 * beardCore;
      g = g * (1.0 - beardCore) + 0.74 * beardCore;
      b = b * (1.0 - beardCore) + 0.14 * beardCore;

      data[idx] = Math.round(clamp(r, 0, 1) * 255);
      data[idx + 1] = Math.round(clamp(g, 0, 1) * 255);
      data[idx + 2] = Math.round(clamp(b, 0, 1) * 255);
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas);
}

/**
 * Darwin Goblet Tulip Tepal Texture: Rounded silky ovate tepal with fine parallel
 * striations, subtle flame feathering, and creamy-gold basal star.
 */
function createTulipPetalTexture() {
  const { canvas, ctx, size } = makeCanvas(512);
  const img = ctx.createImageData(size, size);
  const data = img.data;

  for (let py = 0; py < size; py++) {
    const u = 1.0 - py / (size - 1);
    for (let px = 0; px < size; px++) {
      const v = (px / (size - 1)) * 2.0 - 1.0;

      const profile = Math.pow(Math.sin(clamp(u, 0, 1) * Math.PI * 0.94), 0.54);
      const halfW = 0.16 + 0.78 * profile;
      const dist = u < 0.48 ? Math.abs(v) / halfW : Math.hypot(v / halfW, (u - 0.48) / 0.49);
      const alpha = (1.0 - smoothstep(0.91, 1.0, dist)) * smoothstep(0.0, 0.03, u);

      const idx = (py * size + px) * 4;
      if (alpha <= 0.004) {
        data[idx + 3] = 0;
        continue;
      }

      const normV = v / halfW;
      const silkStriations = Math.pow(0.5 + 0.5 * Math.cos(normV * Math.PI * 18.0), 3.0) * 0.065;
      const flame = Math.exp(-normV * normV * 5.5) * smoothstep(0.15, 0.78, u) * (1.0 - smoothstep(0.82, 0.98, u));
      const basalStar = 1.0 - smoothstep(0.04, 0.22, u + Math.abs(normV) * 0.08);
      const rimPearl = smoothstep(0.68, 0.96, dist);

      const shade = 0.78 + 0.18 * u + 0.10 * rimPearl - silkStriations;
      const r = clamp(shade + 0.08 * flame + 0.10 * basalStar, 0, 1);
      const g = clamp(shade * (0.86 + 0.12 * rimPearl) + 0.06 * basalStar - 0.05 * flame, 0, 1);
      const b = clamp(shade * (0.88 + 0.12 * rimPearl) - 0.18 * basalStar - 0.04 * flame, 0, 1);

      data[idx] = Math.round(r * 255);
      data[idx + 1] = Math.round(g * 255);
      data[idx + 2] = Math.round(b * 255);
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas);
}

/**
 * Gypsophila ("满天星") Semi-Double Cloud Blossom Texture (256x256)
 */
function createGypsophilaTexture() {
  const { canvas, ctx, size } = makeCanvas(256);
  const cx = size * 0.5;
  const cy = size * 0.5;

  ctx.clearRect(0, 0, size, size);
  // Two fluffy tiers of 6 heart-notched white-pearl petals
  for (let tier = 0; tier < 2; tier++) {
    const count = 6;
    const petalLen = tier === 0 ? size * 0.42 : size * 0.30;
    const petalWid = tier === 0 ? size * 0.17 : size * 0.13;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + tier * 0.52;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);

      const grad = ctx.createLinearGradient(0, 0, petalLen, 0);
      grad.addColorStop(0.0, tier === 0 ? '#d9f0e1' : '#fef9c3');
      grad.addColorStop(0.35, '#f8fafc');
      grad.addColorStop(1.0, '#ffffff');
      ctx.fillStyle = grad;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(petalLen * 0.55, -petalWid, petalLen * 0.95, -petalWid * 0.35);
      ctx.quadraticCurveTo(petalLen * 0.84, 0, petalLen * 0.95, petalWid * 0.35);
      ctx.quadraticCurveTo(petalLen * 0.55, petalWid, 0, 0);
      ctx.fill();
      ctx.restore();
    }
  }

  // Tiny pale-sage & gold stamen heart
  const cGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, size * 0.10);
  cGrad.addColorStop(0, '#fef08a');
  cGrad.addColorStop(0.6, '#bbf7d0');
  cGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = cGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.10, 0, Math.PI * 2);
  ctx.fill();

  return toTexture(canvas);
}

/**
 * Broad Serrated Botanical Leaf Texture (Hydrangea, Rose & Sunflower Foliage)
 */
function createBroadLeafTexture() {
  const { canvas, ctx, size } = makeCanvas(512);
  const img = ctx.createImageData(size, size);
  const data = img.data;

  for (let py = 0; py < size; py++) {
    const u = 1.0 - py / (size - 1);
    for (let px = 0; px < size; px++) {
      const v = (px / (size - 1)) * 2.0 - 1.0;

      // Pointed ovate-serrate leaf silhouette
      const serration = 0.042 * Math.sin(u * 42.0) * smoothstep(0.14, 0.88, u);
      const body = Math.pow(Math.sin(clamp(u, 0, 1) * Math.PI), 0.68) * (1.0 - 0.25 * smoothstep(0.6, 1.0, u));
      const halfW = Math.max(0.02, 0.82 * body + serration);
      const edge = Math.abs(v) / halfW;
      const alpha = (1.0 - smoothstep(0.89, 1.0, edge)) * smoothstep(0.0, 0.03, u) * (1.0 - smoothstep(0.97, 1.0, u));

      const idx = (py * size + px) * 4;
      if (alpha <= 0.004) {
        data[idx + 3] = 0;
        continue;
      }

      // Crisp pale-emerald midrib + pinnate herringbone lateral veins
      const midrib = Math.exp(-v * v * 90.0) * (1.0 - 0.5 * u);
      const pinnate = Math.pow(0.5 + 0.5 * Math.cos((u * 14.0 - Math.abs(v) * 6.5) * Math.PI), 8.0) * (1.0 - edge * 0.4);
      const veinLight = midrib * 0.26 + pinnate * 0.14;

      const shade = 0.56 + 0.30 * u - 0.12 * edge;
      const r = clamp(0.16 * shade + veinLight * 0.45, 0, 1);
      const g = clamp(0.52 * shade + veinLight * 0.72, 0, 1);
      const b = clamp(0.36 * shade + veinLight * 0.38, 0, 1);

      data[idx] = Math.round(r * 255);
      data[idx + 1] = Math.round(g * 255);
      data[idx + 2] = Math.round(b * 255);
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas);
}

/**
 * Iridescent Gossamer Fairy Wing Texture (for the Exploring Starlight Sprite!)
 */
function createFairyWingTexture() {
  const { canvas, ctx, size } = makeCanvas(512);
  ctx.clearRect(0, 0, size, size);

  // Wing silhouette rooted at left-bottom (0, size*0.72) flaring out to upper-right tip
  ctx.save();
  const grad = ctx.createRadialGradient(size * 0.12, size * 0.68, 10, size * 0.55, size * 0.42, size * 0.56);
  grad.addColorStop(0.0, 'rgba(253, 224, 71, 0.84)');
  grad.addColorStop(0.36, 'rgba(125, 211, 252, 0.68)');
  grad.addColorStop(0.72, 'rgba(244, 114, 182, 0.58)');
  grad.addColorStop(1.0, 'rgba(196, 181, 253, 0.22)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(size * 0.04, size * 0.72);
  ctx.bezierCurveTo(size * 0.12, size * 0.16, size * 0.68, size * 0.04, size * 0.94, size * 0.22);
  ctx.bezierCurveTo(size * 0.98, size * 0.48, size * 0.76, size * 0.84, size * 0.38, size * 0.88);
  ctx.quadraticCurveTo(size * 0.18, size * 0.88, size * 0.04, size * 0.72);
  ctx.closePath();
  ctx.fill();

  // Luminous golden-pearl wing margin & dragonfly/cicada gossamer venation
  ctx.strokeStyle = 'rgba(254, 243, 199, 0.92)';
  ctx.lineWidth = 5.5;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(254, 240, 138, 0.78)';
  ctx.lineWidth = 3.0;
  const veins = [
    [[0.04, 0.72], [0.42, 0.32], [0.90, 0.24]],
    [[0.04, 0.72], [0.46, 0.48], [0.84, 0.48]],
    [[0.04, 0.72], [0.40, 0.65], [0.68, 0.72]],
    [[0.36, 0.38], [0.58, 0.24], [0.74, 0.18]],
    [[0.44, 0.48], [0.58, 0.62], [0.52, 0.78]]
  ];
  for (const pts of veins) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * size, pts[0][1] * size);
    ctx.quadraticCurveTo(pts[1][0] * size, pts[1][1] * size, pts[2][0] * size, pts[2][1] * size);
    ctx.stroke();
  }
  ctx.restore();

  return toTexture(canvas);
}

export function createBotanicalTextures() {
  return {
    rosePetal: createRosePetalTexture(),
    hydrangeaSepal: createHydrangeaSepalTexture(),
    sunflowerRay: createSunflowerRayTexture(),
    sunflowerDisc: createSunflowerDiscTexture(),
    irisPetal: createIrisPetalTexture(),
    tulipPetal: createTulipPetalTexture(),
    gypsophila: createGypsophilaTexture(),
    broadLeaf: createBroadLeafTexture(),
    fairyWing: createFairyWingTexture()
  };
}

// ============================================================================
// 2. HIGH-DETAIL CURVED 3D BOTANICAL GEOMETRIES
// ============================================================================
function makeBuffers() {
  return { positions: [], normals: [], colors: [], uvs: [], indices: [] };
}

/**
 * Append a smooth bicubic/parametric surface patch.
 * Note: UVs are stored as ( (v+1)*0.5, u ) so texture horizontal = width v, vertical = base->tip u!
 */
function addPetalPatch(buffers, segU, segV, evalFn, customUvFn = null) {
  const { positions, normals, colors, uvs, indices } = buffers;
  const baseVertex = positions.length / 3;
  const eps = 0.02;

  for (let iu = 0; iu <= segU; iu++) {
    const u = iu / segU;
    for (let iv = 0; iv <= segV; iv++) {
      const v = (iv / segV) * 2 - 1;
      const pt = evalFn(u, v);
      const pu0 = evalFn(Math.max(0, u - eps), v);
      const pu1 = evalFn(Math.min(1, u + eps), v);
      const pv0 = evalFn(u, Math.max(-1, v - eps));
      const pv1 = evalFn(u, Math.min(1, v + eps));

      const tx = pu1.x - pu0.x;
      const ty = pu1.y - pu0.y;
      const tz = pu1.z - pu0.z;
      const bx = pv1.x - pv0.x;
      const by = pv1.y - pv0.y;
      const bz = pv1.z - pv0.z;

      let nx = ty * bz - tz * by;
      let ny = tz * bx - tx * bz;
      let nz = tx * by - ty * bx;
      let len = Math.hypot(nx, ny, nz);
      if (len < 1e-6) {
        nx = 0; ny = 1; nz = 0; len = 1;
      }

      positions.push(pt.x, pt.y, pt.z);
      normals.push(nx / len, ny / len, nz / len);
      colors.push(pt.r ?? 1, pt.g ?? 1, pt.b ?? 1);
      if (customUvFn) {
        const [tu, tv] = customUvFn(u, v);
        uvs.push(tu, tv);
      } else {
        uvs.push((v + 1) * 0.5, u);
      }
    }
  }

  const row = segV + 1;
  for (let iu = 0; iu < segU; iu++) {
    for (let iv = 0; iv < segV; iv++) {
      const a = baseVertex + iu * row + iv;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
}

function finalizeGeometry(buffers) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geo.setIndex(buffers.indices);
  return geo;
}

/**
 * 1. Lifelike 36-Petal Layered English / Hybrid-Tea Rose Bloom
 *    5 authentic botanical whorls with furled bud core, deep cupped mid-bowl, and reflexed outer guard lips!
 */
export function createRoseBloomGeometry() {
  const buffers = makeBuffers();
  const whorls = [
    { count: 5, openMin: 0.08, openMax: 0.17, rBase: 0.010, h: 0.125, w: 0.056, reflex: 0.010, yOff: 0.026, ao: 0.38 },
    { count: 6, openMin: 0.22, openMax: 0.34, rBase: 0.022, h: 0.142, w: 0.078, reflex: 0.020, yOff: 0.020, ao: 0.54 },
    { count: 7, openMin: 0.38, openMax: 0.52, rBase: 0.036, h: 0.156, w: 0.098, reflex: 0.034, yOff: 0.012, ao: 0.72 },
    { count: 8, openMin: 0.56, openMax: 0.72, rBase: 0.052, h: 0.166, w: 0.118, reflex: 0.048, yOff: 0.004, ao: 0.88 },
    { count: 10, openMin: 0.76, openMax: 0.96, rBase: 0.068, h: 0.172, w: 0.134, reflex: 0.062, yOff: -0.006, ao: 1.00 }
  ];

  let whorlSeed = 0;
  for (let wIdx = 0; wIdx < whorls.length; wIdx++) {
    const wh = whorls[wIdx];
    const phaseShift = wIdx * 0.68;
    for (let k = 0; k < wh.count; k++) {
      const frac = k / wh.count;
      const theta = frac * Math.PI * 2 + phaseShift + Math.sin(whorlSeed * 1.9) * 0.09;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const openAngle = wh.openMin + (wh.openMax - wh.openMin) * (0.5 + 0.5 * Math.sin(whorlSeed * 2.7));
      const asymRoll = Math.sin(whorlSeed * 3.1) * 0.012;
      whorlSeed++;

      addPetalPatch(buffers, 9, 8, (u, v) => {
        // Double-curved spherical cup + teardrop reflexed upper lip
        const bellyCup = 0.034 * (1.0 - v * v) * Math.sin(u * Math.PI * 0.88);
        const lipReflex = smoothstep(0.66, 1.0, u) * wh.reflex * (1.0 - 0.32 * v * v);
        const rLocal = wh.rBase + u * wh.h * Math.sin(openAngle) - bellyCup + lipReflex;
        const yLocal = wh.yOff + u * wh.h * Math.cos(openAngle) - lipReflex * 0.55 - 0.012 * v * v * u;
        const wLocal = v * wh.w * (0.35 + 0.65 * Math.pow(Math.sin(u * Math.PI * 0.88), 0.45)) + asymRoll * u;

        const shade = wh.ao * (0.58 + 0.42 * smoothstep(0.08, 0.92, u));
        return {
          x: cosT * rLocal - sinT * wLocal,
          y: yLocal + 0.03,
          z: sinT * rLocal + cosT * wLocal,
          r: shade,
          g: shade,
          b: shade
        };
      });
    }
  }

  const geo = finalizeGeometry(buffers);
  geo.rotateX(0.30);
  return geo;
}

/**
 * 2. Lifelike Endless Summer Hydrangea 4-Sepal Floret + Central Fertile Buds
 */
export function createHydrangeaFloretGeometry() {
  const buffers = makeBuffers();
  for (let p = 0; p < 4; p++) {
    const a = p * Math.PI * 0.5 + (p % 2 === 0 ? 0.08 : -0.08);
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const tierLift = (p % 2) * 0.005;

    addPetalPatch(buffers, 7, 7, (u, v) => {
      const len = 0.006 + u * 0.092;
      const wid = v * 0.080;
      const cup = tierLift + 0.020 * Math.sin(u * Math.PI * 0.80) - 0.014 * v * v * u;
      const shade = 0.62 + 0.38 * smoothstep(0.06, 0.88, u);
      return {
        x: cosA * len - sinA * wid,
        y: cup,
        z: sinA * len + cosA * wid,
        r: shade,
        g: shade,
        b: shade
      };
    });
  }
  return finalizeGeometry(buffers);
}

/**
 * 3A. Lifelike Sunflower Seed Disc Cushion (mapped with 680-seed Fibonacci texture!)
 */
export function createSunflowerDiscGeometry() {
  const buffers = makeBuffers();
  addPetalPatch(
    buffers,
    8,
    20,
    (u, v) => {
      const theta = (v + 1) * Math.PI;
      const r = u * 0.128;
      const y = 0.048 * Math.cos(u * Math.PI * 0.46) - 0.006 * smoothstep(0.75, 1.0, u);
      return {
        x: Math.cos(theta) * r,
        y,
        z: Math.sin(theta) * r,
        r: 1.0,
        g: 1.0,
        b: 1.0
      };
    },
    (u, v) => {
      const theta = (v + 1) * Math.PI;
      return [0.5 + Math.cos(theta) * u * 0.47, 0.5 + Math.sin(theta) * u * 0.47];
    }
  );
  const geo = finalizeGeometry(buffers);
  geo.rotateX(0.58);
  return geo;
}

/**
 * 3B. Lifelike Sunflower 40 Overlapping Veined Ray Petals (2 organic tiers with natural droop)
 */
export function createSunflowerRaysGeometry() {
  const buffers = makeBuffers();
  const total = 40;
  for (let i = 0; i < total; i++) {
    const tier = i % 2;
    const a = (i / total) * Math.PI * 2 + tier * 0.04;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const lenScale = 0.90 + 0.16 * Math.sin(i * 3.1 + 0.6);
    const twist = Math.sin(i * 2.3) * 0.08;

    addPetalPatch(buffers, 9, 5, (u, v) => {
      const len = 0.112 + u * 0.215 * lenScale;
      const wid = v * (tier === 0 ? 0.044 : 0.039);
      const arch = 0.036 * Math.sin(u * Math.PI * 0.74) - 0.042 * Math.pow(u, 2.1);
      const furrow = -0.007 * (1.0 - v * v) * Math.sin(u * Math.PI);
      const y = tier * 0.008 + arch + furrow + wid * twist;
      const shade = 0.72 + 0.28 * smoothstep(0.05, 0.65, u);
      return {
        x: cosA * len - sinA * wid,
        y,
        z: sinA * len + cosA * wid,
        r: shade,
        g: shade,
        b: shade
      };
    });
  }
  const geo = finalizeGeometry(buffers);
  geo.rotateX(0.58);
  return geo;
}

/**
 * 4. Lifelike Ruffled Bearded Iris (3 Domed Standards + 3 Veined Velvet Falls + 3 Style Crests)
 */
export function createIrisBloomGeometry() {
  const buffers = makeBuffers();

  // 3 Domed Standards curving inward to kiss at the crown
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    addPetalPatch(buffers, 9, 7, (u, v) => {
      const radial = 0.018 + Math.sin(u * Math.PI * 0.88) * 0.128 * (1.0 - 0.42 * u * u);
      const wid = v * 0.098;
      const ruffle = Math.sin(u * 13.0 + v * 4.5) * 0.009 * smoothstep(0.25, 1.0, u);
      const y = 0.025 + u * 0.255 - 0.024 * v * v + ruffle;
      const shade = 0.68 + 0.32 * u;
      return {
        x: cosA * radial - sinA * wid,
        y,
        z: sinA * radial + cosA * wid,
        r: shade,
        g: shade,
        b: shade
      };
    });
  }

  // 3 Cascading Ruffled Velvet Falls
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    addPetalPatch(buffers, 10, 7, (u, v) => {
      const radial = 0.024 + u * 0.235 - 0.03 * Math.pow(u, 2.6);
      const wid = v * 0.118;
      const ruffle = Math.sin(v * 5.5 + u * 11.0) * 0.009 * smoothstep(0.3, 1.0, u);
      const y = 0.038 + 0.064 * Math.sin(u * Math.PI * 0.56) - 0.185 * Math.pow(u, 1.85) - 0.018 * v * v + ruffle;
      const shade = 0.64 + 0.36 * smoothstep(0.1, 0.85, u);
      return {
        x: cosA * radial - sinA * wid,
        y,
        z: sinA * radial + cosA * wid,
        r: shade,
        g: shade,
        b: shade
      };
    });
  }

  return finalizeGeometry(buffers);
}

/**
 * 5. Lifelike Plump Darwin Goblet Tulip (6 Interlocking Cupped Tepals)
 */
export function createTulipBloomGeometry() {
  const buffers = makeBuffers();
  for (let i = 0; i < 6; i++) {
    const inner = i % 2 === 0;
    const a = (i / 6) * Math.PI * 2;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);

    addPetalPatch(buffers, 10, 7, (u, v) => {
      // Plump rounded egg-goblet belly curving gently inward near the rim
      const cupCurve = Math.sin(u * Math.PI * 0.84) * 0.088 + smoothstep(0.82, 1.0, u) * 0.012;
      const bellyCup = 0.018 * (1.0 - v * v) * Math.sin(u * Math.PI);
      const rLocal = (inner ? 0.012 : 0.019) + cupCurve - bellyCup * 0.35;
      const wLocal = v * (inner ? 0.072 : 0.080);
      const y = u * 0.265 - 0.012 * v * v;
      const shade = 0.58 + 0.42 * smoothstep(0.08, 0.90, u);
      return {
        x: cosA * rLocal - sinA * wLocal,
        y,
        z: sinA * rLocal + cosA * wLocal,
        r: shade,
        g: shade,
        b: shade
      };
    });
  }
  const geo = finalizeGeometry(buffers);
  geo.rotateX(0.16);
  return geo;
}

/**
 * 6. Lifelike Gypsophila ("满天星") Multi-Rosette Cloudlet Cluster
 *    3 miniature cupped blossom quads per instance -> ultra-lush foamy sprays!
 */
export function createGypsophilaClusterGeometry() {
  const buffers = makeBuffers();
  const offsets = [
    { x: 0.0, y: 0.018, z: 0.0, rx: 0.15, rz: 0.10, s: 0.056 },
    { x: 0.032, y: 0.0, z: 0.022, rx: -0.35, rz: 0.28, s: 0.046 },
    { x: -0.028, y: 0.006, z: -0.024, rx: 0.32, rz: -0.30, s: 0.048 }
  ];

  for (const o of offsets) {
    addPetalPatch(
      buffers,
      2,
      2,
      (u, v) => {
        const lx = v * o.s;
        const lz = (u * 2 - 1) * o.s;
        const cup = -0.18 * (lx * lx + lz * lz) / o.s;
        const cy = lx * Math.sin(o.rz) + lz * Math.sin(o.rx) + cup;
        return {
          x: o.x + lx,
          y: o.y + cy,
          z: o.z + lz,
          r: 0.96,
          g: 0.97,
          b: 1.0
        };
      },
      (u, v) => [(v + 1) * 0.5, u]
    );
  }
  return finalizeGeometry(buffers);
}

/**
 * Veined Serrated Broad Leaf Geometry (used on Hydrangea shrubs, Rose stems & Sunflowers)
 */
export function createBroadLeafGeometry() {
  const buffers = makeBuffers();
  addPetalPatch(buffers, 7, 5, (u, v) => {
    const x = v * 0.135;
    const z = -u * 0.36;
    const archY = 0.058 * Math.sin(u * Math.PI * 0.72) - u * u * 0.085 - Math.abs(v) * 0.018;
    const shade = 0.55 + 0.45 * u;
    return {
      x,
      y: archY,
      z,
      r: shade,
      g: shade,
      b: shade
    };
  });
  return finalizeGeometry(buffers);
}

/**
 * Tapered Organic Flower Stem, Iris/Tulip Sword Leaf & Soft Multi-Toned Meadow Grass Blade
 */
export function createCurvedStemGeometry() {
  const buffers = makeBuffers();
  addPetalPatch(buffers, 5, 5, (u, v) => {
    const theta = (v + 1) * Math.PI;
    const rad = 0.016 - 0.007 * u;
    const bendX = Math.sin(u * Math.PI * 0.65) * 0.016;
    return {
      x: Math.cos(theta) * rad + bendX,
      y: u,
      z: Math.sin(theta) * rad,
      r: 0.018 + 0.028 * u,
      g: 0.075 + 0.115 * u,
      b: 0.045 + 0.068 * u
    };
  });
  return finalizeGeometry(buffers);
}

export function createSwordLeafGeometry() {
  const buffers = makeBuffers();
  addPetalPatch(buffers, 6, 2, (u, v) => {
    const taper = Math.sin(Math.min(1, u * 0.88 + 0.12) * Math.PI * 0.92) * (1 - 0.55 * Math.pow(u, 2.2));
    const x = v * 0.036 * taper;
    const y = u * 0.72;
    const z = -Math.pow(u, 1.72) * 0.17;
    const ao = 0.26 + 0.74 * u;
    return {
      x,
      y,
      z,
      r: (0.022 + 0.036 * u) * ao,
      g: (0.088 + 0.135 * u) * ao,
      b: (0.072 + 0.095 * u) * ao
    };
  });
  return finalizeGeometry(buffers);
}

export function createGrassBladeGeometry() {
  const buffers = makeBuffers();
  addPetalPatch(buffers, 5, 2, (u, v) => {
    const taper = 1 - Math.pow(u, 1.24);
    const x = v * 0.022 * taper;
    const y = u * 0.52;
    const z = -u * u * 0.16;
    const ao = 0.18 + 0.82 * Math.pow(u, 1.02);
    return {
      x,
      y,
      z,
      r: (0.016 + 0.042 * u) * ao,
      g: (0.056 + 0.145 * u) * ao,
      b: (0.048 + 0.098 * u) * ao
    };
  });
  return finalizeGeometry(buffers);
}
