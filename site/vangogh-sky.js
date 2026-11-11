/**
 * p5.js Engine — Van Gogh "The Starry Night" Impasto Sky, Cypress & Mountain Horizon
 *
 * Inspired by:
 * - Vincent van Gogh's "The Starry Night" (Saint-Rémy, 1889)
 * - Petros Vrellis's Interactive Starry Night (vortex velocity field + tangential halo deflection)
 * - Tyler Hobbs's flow-field curved streamline packing (stratified jittered seeding + multi-step ribbons)
 */

export function createVanGoghSky(container, { onReady = () => {} } = {}) {
  const P5 = window.p5;
  if (!P5) {
    throw new Error('p5.js is not loaded');
  }

  let p5Instance = null;
  let finaleTarget = 0;
  let finaleProgress = 0;
  let constellationTarget = 0;
  let constellationProgress = 0;
  let pointerX = -1000;
  let pointerY = -1000;
  let pointerStrength = 0;
  let frameCounter = 0;
  let meteorCount = 0;
  let disposed = false;

  const meteors = [];

  // 11 Iconic Van Gogh Stars across the upper sky (normalized coordinates)
  const VG_STARS = [
    { nx: 0.16, ny: 0.15, r: 26, core: '#fffbeb', inner: '#fde047', outer: '#93c5fd', speed: 0.38 },
    { nx: 0.25, ny: 0.10, r: 20, core: '#f0f9ff', inner: '#bae6fd', outer: '#60a5fa', speed: -0.46 },
    { nx: 0.22, ny: 0.31, r: 24, core: '#fefce8', inner: '#facc15', outer: '#7dd3fc', speed: 0.42 },
    { nx: 0.34, ny: 0.13, r: 19, core: '#f0f9ff', inner: '#fde68a', outer: '#60a5fa', speed: 0.50 },
    { nx: 0.45, ny: 0.17, r: 29, core: '#fffbeb', inner: '#fbbf24', outer: '#93c5fd', speed: -0.35 },
    { nx: 0.55, ny: 0.09, r: 18, core: '#eef2ff', inner: '#c7d2fe', outer: '#60a5fa', speed: 0.44 },
    { nx: 0.65, ny: 0.20, r: 27, core: '#fffbeb', inner: '#fde047', outer: '#7dd3fc', speed: 0.40 },
    { nx: 0.72, ny: 0.10, r: 20, core: '#f0f9ff', inner: '#bae6fd', outer: '#60a5fa', speed: -0.48 },
    { nx: 0.42, ny: 0.38, r: 22, core: '#fefce8', inner: '#facc15', outer: '#60a5fa', speed: 0.33 },
    { nx: 0.68, ny: 0.38, r: 21, core: '#f0f9ff', inner: '#fde68a', outer: '#38bdf8', speed: -0.39 },
    { nx: 0.92, ny: 0.33, r: 23, core: '#fffbeb', inner: '#fde047', outer: '#93c5fd', speed: 0.45 }
  ];

  // Sculpted Cadmium-Gold Crescent Moon in upper right
  const MOON = { nx: 0.84, ny: 0.185, r: 56 };

  // Great swirling Saint-Rémy nebula vortices
  const VORTICES = [
    { nx: 0.37, ny: 0.265, radius: 0.23, strength: 1.65, dir: 1, pull: 0.12 },
    { nx: 0.58, ny: 0.315, radius: 0.19, strength: 1.48, dir: -1, pull: 0.10 },
    { nx: 0.21, ny: 0.210, radius: 0.14, strength: 0.95, dir: -1, pull: 0.08 },
    { nx: 0.73, ny: 0.295, radius: 0.15, strength: 0.88, dir: 1, pull: 0.08 }
  ];

  // Authentic 1889 Starry Night oil pigment palette (no harsh neon)
  const OIL_PALETTE = {
    abyss: [7, 18, 44],
    prussian: [12, 31, 68],
    ultramarine: [20, 48, 102],
    cobalt: [31, 74, 142],
    cerulean: [54, 114, 184],
    slateTeal: [32, 86, 112],
    zincBlue: [118, 174, 222],
    skyIce: [178, 214, 242],
    creamIvory: [244, 236, 208],
    warmGold: [250, 208, 76],
    cadmiumAmber: [242, 166, 44]
  };

  function resolveCoord(val, span, fallback) {
    if (typeof val !== 'number' || Number.isNaN(val)) return fallback;
    return val <= 1.05 ? val * span : val;
  }

  function triggerMeteor(customStart, customEnd) {
    if (!p5Instance) return;
    const w = p5Instance.width || window.innerWidth || 1280;
    const h = p5Instance.height || window.innerHeight || 720;

    const rawSx = customStart?.x ?? customStart?.startX;
    const rawSy = customStart?.y ?? customStart?.startY;
    const sx = resolveCoord(rawSx, w, w * (0.18 + Math.random() * 0.50));
    const sy = resolveCoord(rawSy, h, h * (0.06 + Math.random() * 0.15));

    const rawEx = customEnd?.x ?? customEnd?.endX;
    const rawEy = customEnd?.y ?? customEnd?.endY;
    const ex = resolveCoord(rawEx, w, sx + w * (0.20 + Math.random() * 0.16));
    const ey = resolveCoord(rawEy, h, Math.min(h * 0.46, sy + h * (0.22 + Math.random() * 0.12)));

    meteors.push({
      sx,
      sy,
      ex,
      ey,
      cx: (sx + ex) * 0.5 + (Math.random() - 0.5) * 48,
      cy: Math.min(sy, ey) - 36,
      t: 0,
      speed: 0.020 + Math.random() * 0.006
    });
    meteorCount++;
  }

  const sketch = p => {
    let baseLayer = null;
    let lastBuiltW = 0;
    let lastBuiltH = 0;
    let lastSkySec = 0;
    let streamlines = [];
    let twinkleStars = [];
    let heartNodes = [];
    let cypressTips = [];

    function mulberry32(seed) {
      let state = seed >>> 0;
      return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function mountainRidgeFar(nx, h) {
      const base = 0.485
        - 0.036 * Math.sin(nx * Math.PI * 2.4 - 0.35)
        - 0.022 * Math.cos(nx * Math.PI * 5.2 + 0.8)
        - 0.015 * Math.sin(nx * Math.PI * 8.5);
      return base * h;
    }

    function mountainRidgeNear(nx, h) {
      const base = 0.522
        + 0.024 * Math.cos(nx * Math.PI * 2.9 + 0.4)
        - 0.018 * Math.sin(nx * Math.PI * 6.1 - 0.5);
      return base * h;
    }

    function isInsideCelestialCore(x, y, w, h, scale = 1.0) {
      const mx = MOON.nx * w;
      const my = MOON.ny * h;
      const mr = MOON.r * (w < 640 ? 0.72 : 0.98) * scale;
      if (Math.hypot(x - mx, y - my) < mr * 0.88) return true;

      const starScale = (w < 640 ? 0.74 : 0.95) * scale;
      for (let i = 0; i < VG_STARS.length; i++) {
        const st = VG_STARS[i];
        if (Math.hypot(x - st.nx * w, y - st.ny * h) < st.r * starScale * 0.55) {
          return true;
        }
      }
      return false;
    }

    /**
     * Compute the Van Gogh fluid-vortex flow angle with tangential deflection
     * around the Crescent Moon and major stars (Petros Vrellis principle).
     */
    function flowAngleAt(x, y, timeSec = 0) {
      const w = Math.max(1, p.width);
      const h = Math.max(1, p.height);
      const nx = x / w;
      const ny = y / h;
      const aspect = w / h;

      // 1. Sweeping Saint-Rémy S-curve sky current
      const spineY = 0.275 + 0.075 * Math.sin(nx * Math.PI * 2.35 - 0.85);
      let vx = 1.08;
      let vy = 0.175 * Math.PI * 2.35 * 0.075 * Math.cos(nx * Math.PI * 2.35 - 0.85) * 2.4
             + Math.sin(nx * Math.PI * 3.1 + timeSec * 0.18) * 0.22
             - (ny - spineY) * 0.35;

      // 2. Domain-warped Perlin noise for organic brushstroke undulation
      const warp = p.noise(nx * 2.4, ny * 2.8, timeSec * 0.04);
      const n = p.noise(nx * 3.8 + warp * 0.65, ny * 4.4 - warp * 0.45, timeSec * 0.05);
      const nAngle = (n - 0.49) * Math.PI * 1.65;
      vx += Math.cos(nAngle) * 0.44;
      vy += Math.sin(nAngle) * 0.44;

      // 3. Swirling Great Nebula Vortices
      for (let i = 0; i < VORTICES.length; i++) {
        const v = VORTICES[i];
        const dx = nx - v.nx;
        const dy = (ny - v.ny) / Math.max(0.55, Math.min(1.45, aspect * 0.72));
        const distSq = dx * dx + dy * dy;
        const rSq = v.radius * v.radius;
        if (distSq < rSq * 2.6) {
          const factor = Math.exp(-distSq / (rSq * 0.62)) * v.strength;
          const dist = Math.sqrt(distSq) + 0.0001;
          const tx = (-dy / dist) * v.dir - (dx / dist) * v.pull;
          const ty = (dx / dist) * v.dir - (dy / dist) * v.pull;
          vx += tx * factor * 2.35;
          vy += ty * factor * 2.35;
        }
      }

      // 4. Tangential wrap & radial repulsion around Crescent Moon (prevents strokes crossing Moon!)
      const mdx = x - MOON.nx * w;
      const mdy = y - MOON.ny * h;
      const mDist = Math.hypot(mdx, mdy);
      const moonHaloR = MOON.r * (w < 640 ? 1.35 : 1.75);
      if (mDist < moonHaloR && mDist > 0.5) {
        const u = 1 - mDist / moonHaloR;
        const wrap = u * u * 3.6;
        // Tangential circulation + outward push near inner core
        const push = mDist < moonHaloR * 0.58 ? (1 - mDist / (moonHaloR * 0.58)) * 2.2 : 0;
        vx += (-mdy / mDist) * wrap + (mdx / mDist) * push;
        vy += (mdx / mDist) * wrap + (mdy / mDist) * push;
      }

      // 5. Gentle tangential wrap around each Major Star halo
      const starHaloScale = w < 640 ? 1.15 : 1.45;
      for (let i = 0; i < VG_STARS.length; i++) {
        const st = VG_STARS[i];
        const sdx = x - st.nx * w;
        const sdy = y - st.ny * h;
        const sDist = Math.hypot(sdx, sdy);
        const haloR = st.r * starHaloScale;
        if (sDist < haloR && sDist > 0.5) {
          const su = 1 - sDist / haloR;
          const dir = st.speed >= 0 ? 1 : -1;
          const sw = su * su * 2.1;
          vx += (-sdy / sDist) * dir * sw;
          vy += (sdx / sDist) * dir * sw;
        }
      }

      // 6. Interactive pointer swirl wake
      if (pointerStrength > 0.01) {
        const pdx = x - pointerX;
        const pdy = y - pointerY;
        const pDist = Math.hypot(pdx, pdy);
        if (pDist < 190 && pDist > 1) {
          const pf = (1 - pDist / 190) * pointerStrength * 2.6;
          vx += (-pdy / pDist) * pf;
          vy += (pdx / pDist) * pf;
        }
      }

      return Math.atan2(vy, vx);
    }

    function pickSkyPigment(nx, ny, rand) {
      // Distance to luminous S-nebula spine
      const spineY = 0.275 + 0.075 * Math.sin(nx * Math.PI * 2.35 - 0.85);
      const dSpine = Math.abs(ny - spineY);
      const spineBand = Math.exp(-(dSpine * dSpine) / 0.0085);

      // Proximity to the two main spiral eddies
      const dV1 = Math.hypot(nx - 0.37, (ny - 0.265) * 1.25);
      const dV2 = Math.hypot(nx - 0.58, (ny - 0.315) * 1.25);
      const vortexGlow = Math.max(
        Math.exp(-(dV1 * dV1) / 0.018),
        Math.exp(-(dV2 * dV2) / 0.015)
      );

      // Horizon atmospheric lightening above Saint-Rémy mountains
      const horizonGlow = Math.exp(-Math.pow((ny - 0.455) / 0.065, 2)) * 0.65;
      const lum = spineBand * 0.62 + vortexGlow * 0.48 + horizonGlow * 0.42 + (p.noise(nx * 4.8, ny * 5.2) - 0.35) * 0.45;
      const r = rand();

      if (lum > 0.86) {
        return r < 0.38 ? OIL_PALETTE.creamIvory : (r < 0.78 ? OIL_PALETTE.skyIce : OIL_PALETTE.zincBlue);
      }
      if (lum > 0.64) {
        return r < 0.22 ? OIL_PALETTE.skyIce : (r < 0.62 ? OIL_PALETTE.zincBlue : OIL_PALETTE.cerulean);
      }
      if (lum > 0.44) {
        return r < 0.45 ? OIL_PALETTE.cerulean : (r < 0.78 ? OIL_PALETTE.cobalt : OIL_PALETTE.slateTeal);
      }
      if (lum > 0.25) {
        return r < 0.52 ? OIL_PALETTE.cobalt : (r < 0.84 ? OIL_PALETTE.ultramarine : OIL_PALETTE.slateTeal);
      }
      return r < 0.55 ? OIL_PALETTE.prussian : (r < 0.85 ? OIL_PALETTE.ultramarine : OIL_PALETTE.abyss);
    }

    function drawImpastoRibbon(ctx, pts, rgb, width, alpha = 0.92) {
      if (pts.length < 2) return;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 1. Subtle Prussian-abyss groove under-shadow for oil relief
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1] + 1.0);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0], pts[i][1] + 1.0);
      }
      ctx.strokeStyle = `rgba(4, 11, 28, ${(alpha * 0.46).toFixed(3)})`;
      ctx.lineWidth = width + 1.3;
      ctx.stroke();

      // 2. Main thick oil-pigment stroke
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) * 0.5;
        const my = (pts[i][1] + pts[i + 1][1]) * 0.5;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last[0], last[1]);
      ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(3)})`;
      ctx.lineWidth = width;
      ctx.stroke();

      // 3. Fine upper bristle ridge highlight
      const hiR = Math.min(255, rgb[0] + 34);
      const hiG = Math.min(255, rgb[1] + 36);
      const hiB = Math.min(255, rgb[2] + 28);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1] - width * 0.24);
      const midIdx = Math.max(1, Math.floor(pts.length * 0.72));
      for (let i = 1; i <= midIdx; i++) {
        ctx.lineTo(pts[i][0], pts[i][1] - width * 0.24);
      }
      ctx.strokeStyle = `rgba(${hiR}, ${hiG}, ${hiB}, ${(alpha * 0.42).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.9, width * 0.30);
      ctx.stroke();
    }

    function paintStarCoronas(ctx, w, h, rand) {
      const compact = w < 640;
      for (let sIdx = 0; sIdx < VG_STARS.length; sIdx++) {
        const st = VG_STARS[sIdx];
        const cx = st.nx * w;
        const cy = st.ny * h;
        const maxR = st.r * (compact ? 0.85 : 1.18);

        // Soft warm atmospheric radiance behind impasto dabs
        const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, maxR * 2.1);
        glow.addColorStop(0.0, 'rgba(255, 250, 215, 0.55)');
        glow.addColorStop(0.28, 'rgba(253, 224, 71, 0.24)');
        glow.addColorStop(0.65, 'rgba(125, 211, 252, 0.08)');
        glow.addColorStop(1.0, 'rgba(15, 35, 80, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * 2.1, 0, Math.PI * 2);
        ctx.fill();

        const cCore = p.color(st.core);
        const cInner = p.color(st.inner);
        const cOuter = p.color(st.outer);

        // Organic hand-painted concentric impasto dabs (uneven spacing, zero crosshairs!)
        let ringIdx = 0;
        for (let r = 5.5; r <= maxR * 1.25; r += 4.8 + rand() * 1.4) {
          const t = Math.min(1, (r - 5.5) / Math.max(1, maxR * 1.2));
          const col = t < 0.48
            ? p.lerpColor(cCore, cInner, t / 0.48)
            : p.lerpColor(cInner, cOuter, (t - 0.48) / 0.52);

          const cr = Math.round(p.red(col));
          const cg = Math.round(p.green(col));
          const cb = Math.round(p.blue(col));

          const circumference = Math.PI * 2 * r;
          const dabs = Math.max(7, Math.floor(circumference / (10.5 + t * 4.5)));
          const ringOffset = ringIdx * 0.47 + rand() * Math.PI * 2;

          for (let d = 0; d < dabs; d++) {
            if (t > 0.72 && rand() < 0.22) continue;
            const baseA = ringOffset + (d / dabs) * Math.PI * 2 + (rand() - 0.5) * 0.14;
            const spanA = ((Math.PI * 2) / dabs) * (0.48 + rand() * 0.26);
            const rr = r + (rand() - 0.5) * 1.8;
            const sw = (2.8 - t * 0.9) * (0.85 + rand() * 0.32);
            const alpha = (0.88 - t * 0.48) * (0.85 + rand() * 0.15);

            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(2, rr), baseA, baseA + spanA);
            ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha.toFixed(3)})`;
            ctx.lineWidth = sw;
            ctx.lineCap = 'round';
            ctx.stroke();
          }
          ringIdx++;
        }

        // Warm sculpted impasto star center (slightly organic double dab)
        ctx.fillStyle = st.core;
        ctx.beginPath();
        ctx.arc(cx, cy, compact ? 3.4 : 4.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function paintCrescentMoon(ctx, w, h, rand) {
      const mx = MOON.nx * w;
      const my = MOON.ny * h;
      const mr = MOON.r * (w < 640 ? 0.74 : 1.04);

      // 1. Golden-amber atmospheric moonshine aura
      const aura = ctx.createRadialGradient(mx, my, mr * 0.15, mx, my, mr * 2.55);
      aura.addColorStop(0.0, 'rgba(254, 243, 170, 0.55)');
      aura.addColorStop(0.28, 'rgba(251, 191, 36, 0.30)');
      aura.addColorStop(0.62, 'rgba(147, 197, 253, 0.11)');
      aura.addColorStop(1.0, 'rgba(12, 31, 68, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(mx, my, mr * 2.55, 0, Math.PI * 2);
      ctx.fill();

      // 2. Concentric hand-painted impasto corona rings (warm gold -> pale lemon -> sky ice)
      for (let r = mr * 0.48; r <= mr * 1.72; r += 5.6 + rand() * 1.4) {
        const t = Math.min(1, (r - mr * 0.48) / (mr * 1.24));
        const dabs = Math.max(11, Math.floor((Math.PI * 2 * r) / 14.5));
        const offset = rand() * Math.PI * 2;
        for (let d = 0; d < dabs; d++) {
          if (t > 0.78 && rand() < 0.25) continue;
          const a0 = offset + (d / dabs) * Math.PI * 2 + (rand() - 0.5) * 0.10;
          const a1 = a0 + ((Math.PI * 2) / dabs) * (0.52 + rand() * 0.24);
          const rr = r + (rand() - 0.5) * 1.8;

          let rgb;
          if (t < 0.38) {
            rgb = rand() < 0.45 ? [254, 243, 199] : OIL_PALETTE.warmGold;
          } else if (t < 0.72) {
            rgb = rand() < 0.6 ? OIL_PALETTE.warmGold : [253, 230, 138];
          } else {
            rgb = rand() < 0.5 ? OIL_PALETTE.skyIce : [253, 230, 138];
          }

          ctx.beginPath();
          ctx.arc(mx, my, rr, a0, a1);
          ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${((0.88 - t * 0.52)).toFixed(3)})`;
          ctx.lineWidth = 3.2 - t * 0.9;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      }

      // 3. Subtle luminous cobalt-gold impasto inside the moon's shaded hollow (not a black hole!)
      const innerX = mx - mr * 0.14;
      const innerY = my - mr * 0.06;
      const innerGrad = ctx.createRadialGradient(innerX, innerY, 2, mx, my, mr * 0.42);
      innerGrad.addColorStop(0, 'rgba(36, 76, 138, 0.78)');
      innerGrad.addColorStop(1, 'rgba(68, 118, 172, 0.35)');
      ctx.fillStyle = innerGrad;
      ctx.beginPath();
      ctx.arc(mx, my, mr * 0.40, 0, Math.PI * 2);
      ctx.fill();

      // 4. Sculpted Cadmium-Orange & Chrome-Yellow C-Crescent (classic Starry Night orientation)
      const outerR = mr * 0.41;
      const cutR = mr * 0.315;
      const cutX = mx - mr * 0.145;
      const cutY = my - mr * 0.065;

      const moonCanvas = document.createElement('canvas');
      const mSize = Math.ceil(mr * 1.3);
      moonCanvas.width = mSize;
      moonCanvas.height = mSize;
      const mCtx = moonCanvas.getContext('2d');
      const c = mSize * 0.5;

      const cGrad = mCtx.createLinearGradient(c - outerR, c - outerR, c + outerR, c + outerR);
      cGrad.addColorStop(0.0, '#fef9c3');
      cGrad.addColorStop(0.45, '#fde047');
      cGrad.addColorStop(1.0, '#f59e0b');

      mCtx.fillStyle = cGrad;
      mCtx.beginPath();
      mCtx.arc(c, c, outerR, 0, Math.PI * 2);
      mCtx.fill();

      mCtx.globalCompositeOperation = 'destination-out';
      mCtx.beginPath();
      mCtx.arc(c + (cutX - mx), c + (cutY - my), cutR, 0, Math.PI * 2);
      mCtx.fill();

      ctx.save();
      ctx.shadowColor = 'rgba(250, 204, 21, 0.65)';
      ctx.shadowBlur = 18;
      ctx.drawImage(moonCanvas, mx - c, my - c);
      ctx.restore();
    }

    function paintSaintRemyMountains(ctx, w, h, rand) {
      // 1. Soft atmospheric horizon mist glow behind mountains
      const mistGrad = ctx.createLinearGradient(0, h * 0.40, 0, h * 0.58);
      mistGrad.addColorStop(0.0, 'rgba(125, 195, 245, 0)');
      mistGrad.addColorStop(0.48, 'rgba(125, 195, 245, 0.18)');
      mistGrad.addColorStop(0.80, 'rgba(26, 62, 122, 0.32)');
      mistGrad.addColorStop(1.0, 'rgba(6, 16, 40, 0)');
      ctx.fillStyle = mistGrad;
      ctx.fillRect(0, h * 0.40, w, h * 0.20);

      // 2. Far Saint-Rémy Cobalt-Indigo Mountain Range
      ctx.beginPath();
      ctx.moveTo(0, h * 0.68);
      const steps = 96;
      for (let i = 0; i <= steps; i++) {
        const nx = i / steps;
        ctx.lineTo(nx * w, mountainRidgeFar(nx, h));
      }
      ctx.lineTo(w, h * 0.68);
      ctx.closePath();
      const farGrad = ctx.createLinearGradient(0, h * 0.43, 0, h * 0.62);
      farGrad.addColorStop(0, '#1c4484');
      farGrad.addColorStop(0.55, '#10295a');
      farGrad.addColorStop(1, '#071430');
      ctx.fillStyle = farGrad;
      ctx.fill();

      // Painterly pale-cerulean contour strokes along the far mountain crest
      ctx.lineCap = 'round';
      for (let i = 0; i < steps - 1; i += 2) {
        const nx0 = i / steps;
        const nx1 = Math.min(1, (i + 2.4) / steps);
        const y0 = mountainRidgeFar(nx0, h) + (rand() - 0.5) * 2.0;
        const y1 = mountainRidgeFar(nx1, h) + (rand() - 0.5) * 2.0;
        ctx.beginPath();
        ctx.moveTo(nx0 * w, y0);
        ctx.lineTo(nx1 * w, y1);
        ctx.strokeStyle = rand() < 0.45 ? 'rgba(147, 197, 253, 0.52)' : 'rgba(56, 132, 208, 0.58)';
        ctx.lineWidth = 2.4 + rand() * 1.8;
        ctx.stroke();
      }

      // 3. Near Rolling Prussian-Emerald Foothills (bridges seamlessly into 3D meadow!)
      ctx.beginPath();
      ctx.moveTo(0, h * 0.75);
      for (let i = 0; i <= steps; i++) {
        const nx = i / steps;
        ctx.lineTo(nx * w, mountainRidgeNear(nx, h));
      }
      ctx.lineTo(w, h * 0.75);
      ctx.closePath();
      const nearGrad = ctx.createLinearGradient(0, h * 0.49, 0, h * 0.68);
      nearGrad.addColorStop(0, '#0d254c');
      nearGrad.addColorStop(0.45, '#081a38');
      nearGrad.addColorStop(1, '#040e22');
      ctx.fillStyle = nearGrad;
      ctx.fill();

      // Diagonal Van Gogh impasto contour strokes across the foothills
      for (let i = 0; i < 220; i++) {
        const nx = rand();
        const topY = mountainRidgeNear(nx, h);
        const sy = topY + 3 + rand() * (h * 0.085);
        const sx = nx * w;
        const slope = (mountainRidgeNear(Math.min(1, nx + 0.02), h) - topY) / (0.02 * w);
        const ang = Math.atan2(slope, 1) + (rand() - 0.5) * 0.35;
        const len = 14 + rand() * 22;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
        ctx.strokeStyle = rand() < 0.35
          ? 'rgba(34, 88, 128, 0.46)'
          : (rand() < 0.7 ? 'rgba(18, 52, 98, 0.55)' : 'rgba(16, 62, 68, 0.48)');
        ctx.lineWidth = 2.4 + rand() * 2.2;
        ctx.stroke();
      }
    }

    function paintFlameCypress(ctx, w, h, rand) {
      cypressTips = [];
      const compact = w < 640;
      const baseX = w * (compact ? 0.065 : 0.072);
      const baseY = h * 0.60;
      const topY = h * (compact ? 0.19 : 0.085);
      const maxHalfW = w * (compact ? 0.058 : 0.048);

      // Build layered upward-licking flame tongues (classic Van Gogh Cypress silhouette)
      const tongues = [
        { xOff: 0.0, hRatio: 1.0, wRatio: 0.52 },
        { xOff: -0.34, hRatio: 0.74, wRatio: 0.48 },
        { xOff: 0.32, hRatio: 0.68, wRatio: 0.45 },
        { xOff: -0.18, hRatio: 0.86, wRatio: 0.42 },
        { xOff: 0.16, hRatio: 0.82, wRatio: 0.40 },
        { xOff: -0.52, hRatio: 0.50, wRatio: 0.44 },
        { xOff: 0.48, hRatio: 0.46, wRatio: 0.42 }
      ];

      // Paint 190 upward S-curved impasto flame strokes from dark core to moonlit edge
      const cypressColors = [
        [5, 13, 18],     // Deep cypress charcoal
        [9, 25, 28],     // Dark emerald night
        [13, 38, 36],    // Viridian shadow
        [24, 24, 18],    // Warm burnt umber
        [14, 34, 62],    // Prussian night reflection
        [38, 72, 64],    // Moonlit olive-teal highlight (right flank)
        [112, 96, 52]    // Subtle warm bronze-ochre fleck
      ];

      for (let i = 0; i < 195; i++) {
        const tg = tongues[i % tongues.length];
        const u = Math.pow(rand(), 0.82); // 0 = base, 1 = flame tip
        const spanY = (baseY - topY) * tg.hRatio;
        const sy = baseY - u * spanY;
        const env = Math.pow(1 - u, 0.75) * maxHalfW * tg.wRatio;
        const swayS = Math.sin(u * Math.PI * 2.4 + tg.xOff * 3.0) * (6 + u * 8);
        const sideBias = (rand() - 0.5) * 2;
        const sx = baseX + tg.xOff * maxHalfW * (1 - u * 0.62) + sideBias * env + swayS;

        const len = (18 + rand() * 24) * (1 - u * 0.32);
        const ang = -Math.PI * 0.5 + Math.cos(u * Math.PI * 2.4 + tg.xOff * 2.0) * 0.24 + (rand() - 0.5) * 0.16;

        const mx = sx + Math.cos(ang + 0.12) * len * 0.52;
        const my = sy + Math.sin(ang + 0.12) * len * 0.52;
        const ex = sx + Math.cos(ang - 0.10) * len;
        const ey = sy + Math.sin(ang - 0.10) * len;

        // Right flank catches warm moonlight & cerulean reflection
        let rgb;
        if (sideBias > 0.38 && rand() < 0.42) {
          rgb = rand() < 0.28 ? cypressColors[6] : cypressColors[5];
        } else if (rand() < 0.24) {
          rgb = cypressColors[3];
        } else if (rand() < 0.52) {
          rgb = cypressColors[1];
        } else if (rand() < 0.78) {
          rgb = cypressColors[2];
        } else {
          rgb = cypressColors[0];
        }

        drawImpastoRibbon(ctx, [[sx, sy], [mx, my], [ex, ey]], rgb, (3.4 + rand() * 3.0) * (1 - u * 0.35), 0.94);

        if (u > 0.58 && cypressTips.length < 28 && rand() < 0.45) {
          cypressTips.push({
            x: sx,
            y: sy,
            len: len * 0.85,
            ang,
            phase: rand() * Math.PI * 2,
            rgb: sideBias > 0.15 ? cypressColors[5] : cypressColors[2]
          });
        }
      }
    }

    function buildBaseImpastoLayer() {
      const w = Math.max(1, p.width);
      const h = Math.max(1, p.height);
      lastBuiltW = w;
      lastBuiltH = h;

      if (baseLayer) baseLayer.remove();
      baseLayer = p.createGraphics(w, h);
      baseLayer.pixelDensity(1);

      const ctx = baseLayer.drawingContext;
      const rand = mulberry32(20261111);

      // 1. Deep nocturnal Prussian-ultramarine linen ground
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.66);
      skyGrad.addColorStop(0.0, '#040b1f');
      skyGrad.addColorStop(0.28, '#091b42');
      skyGrad.addColorStop(0.58, '#123069');
      skyGrad.addColorStop(0.84, '#194180');
      skyGrad.addColorStop(1.0, '#07142e');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // Subtle oil-linen weave micro-texture
      ctx.strokeStyle = 'rgba(180, 210, 255, 0.022)';
      ctx.lineWidth = 1;
      for (let y = 0; y < h * 0.64; y += 5) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // 2. Soft luminous nebula glow washes along Van Gogh's S-curve
      const washes = [
        { x: w * 0.37, y: h * 0.265, r: w * 0.25, c0: 'rgba(147, 197, 253, 0.26)', c1: 'rgba(20, 48, 102, 0)' },
        { x: w * 0.58, y: h * 0.315, r: w * 0.22, c0: 'rgba(186, 230, 253, 0.22)', c1: 'rgba(20, 48, 102, 0)' },
        { x: w * 0.23, y: h * 0.225, r: w * 0.16, c0: 'rgba(96, 165, 250, 0.18)', c1: 'rgba(12, 31, 68, 0)' }
      ];
      for (const ws of washes) {
        const rg = ctx.createRadialGradient(ws.x, ws.y, 4, ws.x, ws.y, ws.r);
        rg.addColorStop(0, ws.c0);
        rg.addColorStop(1, ws.c1);
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, w, h * 0.66);
      }

      // 3. Stratified Jittered-Grid Multi-Step Curved Streamline Packing (~4,800 oil ribbons)
      const cols = w < 640 ? 64 : 96;
      const rows = w < 640 ? 44 : 52;
      const skyMaxY = h * 0.56;
      const cellW = w / cols;
      const cellH = skyMaxY / rows;
      const stepLen = w < 640 ? 4.8 : 6.2;

      // Shuffle seed order deterministically so overlapping bristles weave naturally
      const seeds = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const sx = (c + (rand() * 0.92 + 0.04)) * cellW;
          const sy = (r + (rand() * 0.92 + 0.04)) * cellH;
          seeds.push([sx, sy]);
        }
      }
      for (let i = seeds.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = seeds[i];
        seeds[i] = seeds[j];
        seeds[j] = tmp;
      }

      for (let i = 0; i < seeds.length; i++) {
        let cx = seeds[i][0];
        let cy = seeds[i][1];
        if (isInsideCelestialCore(cx, cy, w, h, 0.72)) continue;

        const rgb = pickSkyPigment(cx / w, cy / h, rand);
        const steps = 4 + Math.floor(rand() * 4);
        const pts = [[cx, cy]];

        for (let s = 0; s < steps; s++) {
          const ang = flowAngleAt(cx, cy, 0);
          cx += Math.cos(ang) * stepLen;
          cy += Math.sin(ang) * stepLen;
          if (isInsideCelestialCore(cx, cy, w, h, 0.68)) break;
          pts.push([cx, cy]);
        }

        if (pts.length >= 2) {
          const sw = (w < 640 ? 2.4 : 3.0) + rand() * 2.8;
          drawImpastoRibbon(ctx, pts, rgb, sw, 0.88 + rand() * 0.10);
        }
      }

      // 4. Paint Concentric Impasto Star Coronas & Sculpted Golden Crescent Moon
      paintStarCoronas(ctx, w, h, rand);
      paintCrescentMoon(ctx, w, h, rand);

      // 5. Paint Undulating Saint-Rémy Indigo Mountains & Left Flame Cypress
      paintSaintRemyMountains(ctx, w, h, rand);
      paintFlameCypress(ctx, w, h, rand);
    }

    function initParticles() {
      const w = Math.max(1, p.width);
      const h = Math.max(1, p.height);
      const skyH = h * 0.49;
      const rand = mulberry32(20261112);

      // Live Flowing Impasto Ribbons weaving along the S-nebula vortex field
      const count = w < 640 ? 340 : 620;
      streamlines = [];
      for (let i = 0; i < count; i++) {
        const roll = rand();
        const color = roll < 0.14
          ? OIL_PALETTE.creamIvory
          : roll < 0.24
            ? OIL_PALETTE.warmGold
            : roll < 0.64
              ? OIL_PALETTE.skyIce
              : OIL_PALETTE.zincBlue;
        streamlines.push({
          x: rand() * w,
          y: rand() * skyH,
          step: w < 640 ? 4.2 : 5.4,
          weight: 1.7 + rand() * 2.1,
          speed: 0.36 + rand() * 0.68,
          phase: rand() * Math.PI * 2,
          color
        });
      }

      // 440 Twinkling "满天星" Celestial Starlight Motes concentrated along Milky-Way S-band
      twinkleStars = [];
      for (let i = 0; i < 440; i++) {
        const nx = rand();
        const spineY = 0.275 + 0.075 * Math.sin(nx * Math.PI * 2.35 - 0.85);
        const ny = rand() < 0.58
          ? Math.max(0.02, Math.min(0.50, spineY + (rand() + rand() - 1) * 0.18))
          : rand() * 0.49;
        twinkleStars.push({
          nx,
          ny,
          size: 1.3 + rand() * 2.4,
          speed: 1.2 + rand() * 2.6,
          phase: rand() * Math.PI * 2,
          warm: rand() < 0.36
        });
      }

      // 22 Star-Blossom Nodes for the Poetic Heart Constellation (no stiff polygon wireframe!)
      heartNodes = [];
      const steps = 22;
      for (let i = 0; i < steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const hx = 16 * Math.pow(Math.sin(t), 3);
        const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        heartNodes.push({
          hx,
          hy,
          phase: i * 0.55,
          major: i % 3 === 0
        });
      }
    }

    p.setup = () => {
      const w = container.clientWidth || window.innerWidth || 1280;
      const h = container.clientHeight || window.innerHeight || 720;
      const cnv = p.createCanvas(w, h);
      cnv.id('vangogh-canvas');
      p.pixelDensity(Math.min(window.devicePixelRatio || 1, 1.5));
      p.noiseSeed(20261111);
      buildBaseImpastoLayer();
      initParticles();
      onReady();
    };

    p.draw = () => {
      if (disposed) return;
      const w = p.width;
      const h = p.height;
      const skyH = h * 0.49;
      const timeSec = p.millis() * 0.001;
      const dt = Math.min(0.25, Math.max(0.004, timeSec - lastSkySec));
      lastSkySec = timeSec;
      const smooth = 1 - Math.exp(-dt * 2.8);
      const ctx = p.drawingContext;

      finaleProgress += (finaleTarget - finaleProgress) * smooth;
      constellationProgress += (constellationTarget - constellationProgress) * smooth;
      pointerStrength = Math.max(0, pointerStrength - dt * 1.4);

      // 1. Blit pre-painted Van Gogh oil-impasto canvas
      if (baseLayer) {
        p.image(baseLayer, 0, 0, w, h);
      }

      // 2. Live Multi-Step Curved Impasto Streamlines (deflecting cleanly around Moon & Cypress)
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const speedMult = 1 + finaleProgress * 0.75;
      const cypressGuardX = w * (w < 640 ? 0.12 : 0.115);

      for (let i = 0; i < streamlines.length; i++) {
        const s = streamlines[i];

        // Keep live sky strokes behind/away from Moon hollow and foreground Cypress body
        const inCypress = s.x < cypressGuardX && s.y > h * 0.16;
        if (!inCypress && !isInsideCelestialCore(s.x, s.y, w, h, 0.92)) {
          const a0 = flowAngleAt(s.x, s.y, timeSec * 0.32);
          const mx = s.x + Math.cos(a0) * s.step;
          const my = s.y + Math.sin(a0) * s.step;
          const a1 = flowAngleAt(mx, my, timeSec * 0.32);
          const ex = mx + Math.cos(a1) * s.step;
          const ey = my + Math.sin(a1) * s.step;

          const pulse = 0.5 + 0.5 * Math.sin(timeSec * 1.8 + s.phase);
          const alpha = (0.24 + 0.34 * pulse + 0.16 * finaleProgress);

          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.quadraticCurveTo(mx, my, ex, ey);
          ctx.strokeStyle = `rgba(${s.color[0]}, ${s.color[1]}, ${s.color[2]}, ${alpha.toFixed(3)})`;
          ctx.lineWidth = s.weight;
          ctx.stroke();

          s.x += Math.cos(a0) * s.speed * speedMult;
          s.y += Math.sin(a0) * s.speed * speedMult;
        } else {
          s.x = Math.random() * w;
          s.y = Math.random() * (skyH * 0.92);
        }

        const ridgeLimit = mountainRidgeFar(Math.max(0, Math.min(1, s.x / w)), h) - 8;
        if (s.x < -24) s.x = w + 18;
        if (s.x > w + 24) s.x = -18;
        if (s.y < -18 || s.y > ridgeLimit) {
          s.x = Math.random() * w;
          s.y = Math.random() * (skyH * 0.88);
        }
      }

      // 3. Organic Breathing Star Coronas (7 uneven tangential oil dabs — NO 4-way crosshairs!)
      const compact = w < 640;
      for (let i = 0; i < VG_STARS.length; i++) {
        const st = VG_STARS[i];
        const cx = st.nx * w;
        const cy = st.ny * h;
        const breathe = 0.88 + 0.16 * Math.sin(timeSec * 2.1 + i * 1.3) + finaleProgress * 0.18;
        const rRing = st.r * (compact ? 0.62 : 0.84) * breathe;

        const cInner = p.color(st.inner);
        const cr = Math.round(p.red(cInner));
        const cg = Math.round(p.green(cInner));
        const cb = Math.round(p.blue(cInner));

        const dabCount = 7;
        for (let k = 0; k < dabCount; k++) {
          const a = timeSec * st.speed + k * ((Math.PI * 2) / dabCount) + (k % 2) * 0.18;
          const rr = rRing * (k % 2 === 0 ? 1.0 : 0.72);
          const shimmer = 0.45 + 0.55 * Math.sin(timeSec * 2.8 + i + k * 1.7);
          ctx.beginPath();
          ctx.arc(cx, cy, rr, a, a + 0.34);
          ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${(0.48 * shimmer).toFixed(3)})`;
          ctx.lineWidth = 2.1;
          ctx.stroke();
        }

        // Soft glowing cream-gold star heart
        ctx.fillStyle = `rgba(255, 252, 230, ${(0.78 + 0.20 * Math.sin(timeSec * 3.0 + i)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, (compact ? 2.8 : 3.6) * breathe, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Gently Swaying Cypress Flame Tips on the Left
      for (let i = 0; i < cypressTips.length; i++) {
        const tip = cypressTips[i];
        const sway = Math.sin(timeSec * 1.35 + tip.phase) * 0.09;
        const ang = tip.ang + sway;
        const ex = tip.x + Math.cos(ang) * tip.len;
        const ey = tip.y + Math.sin(ang) * tip.len;
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = `rgba(${tip.rgb[0]}, ${tip.rgb[1]}, ${tip.rgb[2]}, 0.78)`;
        ctx.lineWidth = 2.6;
        ctx.stroke();
      }

      // 5. Twinkling "满天星" Celestial Motes
      for (let i = 0; i < twinkleStars.length; i++) {
        const ts = twinkleStars[i];
        const tw = 0.35 + 0.65 * Math.sin(timeSec * ts.speed + ts.phase);
        if (tw < 0.22) continue;
        const tx = ts.nx * w;
        const ty = ts.ny * h;
        if (tx < cypressGuardX && ty > h * 0.16) continue;

        ctx.fillStyle = ts.warm
          ? `rgba(254, 240, 150, ${(0.72 * tw).toFixed(3)})`
          : `rgba(224, 242, 254, ${(0.72 * tw).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(tx, ty, ts.size * (0.65 + 0.45 * tw), 0, Math.PI * 2);
        ctx.fill();
      }

      // 6. Starry Nebula Heart Constellation (painted impasto arcs + 4-ray star blossoms, no wireframe!)
      if (constellationProgress > 0.02) {
        const hcx = w * 0.545;
        const hcy = h * 0.190;
        const scale = Math.min(w, h) * 0.0054;

        // Warm golden-cerulean nebula aura behind the heart constellation
        const hGlow = ctx.createRadialGradient(hcx, hcy, 4, hcx, hcy, scale * 25);
        hGlow.addColorStop(0, `rgba(253, 224, 71, ${(0.20 * constellationProgress).toFixed(3)})`);
        hGlow.addColorStop(0.55, `rgba(125, 211, 252, ${(0.11 * constellationProgress).toFixed(3)})`);
        hGlow.addColorStop(1, 'rgba(15, 35, 80, 0)');
        ctx.fillStyle = hGlow;
        ctx.beginPath();
        ctx.arc(hcx, hcy, scale * 25, 0, Math.PI * 2);
        ctx.fill();

        for (let i = 0; i < heartNodes.length; i++) {
          const cur = heartNodes[i];
          const next = heartNodes[(i + 1) % heartNodes.length];
          const x1 = hcx + cur.hx * scale;
          const y1 = hcy + cur.hy * scale;
          const x2 = hcx + next.hx * scale;
          const y2 = hcy + next.hy * scale;

          // Double impasto oil brushstrokes curving gently between star nodes
          const mx = (x1 + x2) * 0.5 + (y2 - y1) * 0.18;
          const my = (y1 + y2) * 0.5 - (x2 - x1) * 0.18;
          const shimmer = 0.65 + 0.35 * Math.sin(timeSec * 2.6 + cur.phase);

          ctx.beginPath();
          ctx.moveTo(x1 + (mx - x1) * 0.12, y1 + (my - y1) * 0.12);
          ctx.quadraticCurveTo(mx, my, x1 + (x2 - x1) * 0.78, y1 + (y2 - y1) * 0.78);
          ctx.strokeStyle = i % 2 === 0
            ? `rgba(254, 240, 138, ${(0.76 * constellationProgress * shimmer).toFixed(3)})`
            : `rgba(186, 230, 253, ${(0.68 * constellationProgress * shimmer).toFixed(3)})`;
          ctx.lineWidth = 2.6;
          ctx.stroke();

          // Star-blossom node + Van Gogh concentric dab halo on major constellation stars
          const nodeR = (cur.major ? 3.6 : 2.2) * (0.88 + 0.22 * shimmer);
          if (cur.major) {
            for (let ring = 0; ring < 2; ring++) {
              const aStart = timeSec * (ring === 0 ? 0.8 : -0.6) + i * 1.4;
              ctx.beginPath();
              ctx.arc(x1, y1, nodeR * (2.1 + ring * 1.15), aStart, aStart + Math.PI * 0.92);
              ctx.strokeStyle = ring === 0
                ? `rgba(253, 224, 71, ${(0.68 * constellationProgress * shimmer).toFixed(3)})`
                : `rgba(186, 230, 253, ${(0.52 * constellationProgress * shimmer).toFixed(3)})`;
              ctx.lineWidth = 1.9 - ring * 0.3;
              ctx.stroke();
            }
          }

          ctx.fillStyle = cur.major
            ? `rgba(255, 253, 224, ${(0.98 * constellationProgress).toFixed(3)})`
            : `rgba(224, 242, 254, ${(0.86 * constellationProgress * shimmer).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x1, y1, nodeR, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 7. Oil-Painted Van Gogh Shooting Stars / Meteors
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.t += m.speed;
        const headT = Math.min(1, m.t);
        const omt = 1 - headT;
        const hx = omt * omt * m.sx + 2 * omt * headT * m.cx + headT * headT * m.ex;
        const hy = omt * omt * m.sy + 2 * omt * headT * m.cy + headT * headT * m.ey;

        for (let s = 1; s <= 18; s++) {
          const t0 = Math.max(0, m.t - s * 0.015);
          const t1 = Math.max(0, m.t - (s - 0.65) * 0.015);
          if (t0 > 1 || t1 <= t0) continue;
          const o0 = 1 - t0;
          const o1 = 1 - t1;
          const x0 = o0 * o0 * m.sx + 2 * o0 * t0 * m.cx + t0 * t0 * m.ex;
          const y0 = o0 * o0 * m.sy + 2 * o0 * t0 * m.cy + t0 * t0 * m.ey;
          const x1 = o1 * o1 * m.sx + 2 * o1 * t1 * m.cx + t1 * t1 * m.ex;
          const y1 = o1 * o1 * m.sy + 2 * o1 * t1 * m.cy + t1 * t1 * m.ey;
          const fade = 1 - s / 19;

          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.strokeStyle = s % 2 === 0
            ? `rgba(253, 224, 71, ${(0.88 * fade).toFixed(3)})`
            : `rgba(186, 230, 253, ${(0.82 * fade).toFixed(3)})`;
          ctx.lineWidth = 4.2 * fade;
          ctx.stroke();
        }

        if (m.t <= 1.0) {
          const mGlow = ctx.createRadialGradient(hx, hy, 1, hx, hy, 16);
          mGlow.addColorStop(0, 'rgba(255, 253, 220, 0.95)');
          mGlow.addColorStop(0.45, 'rgba(253, 224, 71, 0.52)');
          mGlow.addColorStop(1, 'rgba(253, 224, 71, 0)');
          ctx.fillStyle = mGlow;
          ctx.beginPath();
          ctx.arc(hx, hy, 16, 0, Math.PI * 2);
          ctx.fill();
        }

        if (m.t >= 1.32) {
          meteors.splice(i, 1);
        }
      }

      frameCounter++;
    };

    p.__rebuildSky = (w, h) => {
      if (Math.abs(w - lastBuiltW) < 2 && Math.abs(h - lastBuiltH) < 2) return;
      p.resizeCanvas(w, h);
      buildBaseImpastoLayer();
      initParticles();
    };
  };

  p5Instance = new P5(sketch, container);

  return {
    resize() {
      if (!p5Instance || disposed) return;
      const w = Math.max(1, container.clientWidth || window.innerWidth || 1280);
      const h = Math.max(1, container.clientHeight || window.innerHeight || 720);
      if (typeof p5Instance.__rebuildSky === 'function') {
        p5Instance.__rebuildSky(w, h);
      } else {
        p5Instance.resizeCanvas(w, h);
      }
    },
    handlePointerMove(x, y) {
      const w = container.clientWidth || window.innerWidth || 1280;
      const h = container.clientHeight || window.innerHeight || 720;
      pointerX = x <= 1.01 ? x * w : x;
      pointerY = y <= 1.01 ? y * h : y;
      pointerStrength = 1.0;
    },
    triggerMeteor,
    setConstellationActive(active) {
      constellationTarget = active ? 1 : 0;
    },
    setFinaleActive(active) {
      finaleTarget = active ? 1 : 0;
      if (active) {
        constellationTarget = 1;
        triggerMeteor();
      }
    },
    triggerFinaleBurst() {
      finaleTarget = 1;
      constellationTarget = 1;
      triggerMeteor({ startX: 0.22, startY: 0.11 });
      triggerMeteor({ startX: 0.56, startY: 0.08 });
    },
    getDiagnostics() {
      return {
        engine: 'p5.js',
        frameCounter,
        starCount: VG_STARS.length,
        meteorCount,
        constellationProgress,
        finaleProgress
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      p5Instance?.remove();
    }
  };
}
