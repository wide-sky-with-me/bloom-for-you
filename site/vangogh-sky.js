/**
 * p5.js Engine — Van Gogh "The Starry Night" Impasto Sky & Starry Canopy
 * Combines a tactile multi-layered oil-impasto underpainting with 1,100+ live
 * flow-field brushstrokes swirling around Van Gogh's dual nebula eddies,
 * concentric star halos, crescent moon, painted meteors, and heart constellation.
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

  // Major Van Gogh stars (normalized coordinates in upper 58% of screen)
  const VG_STARS = [
    { nx: 0.12, ny: 0.16, r: 28, color: '#fef08a', ringColor: '#fde047', speed: 0.8 },
    { nx: 0.24, ny: 0.11, r: 22, color: '#e0f2fe', ringColor: '#7dd3fc', speed: -1.1 },
    { nx: 0.19, ny: 0.32, r: 25, color: '#fef9c3', ringColor: '#facc15', speed: 0.9 },
    { nx: 0.34, ny: 0.14, r: 20, color: '#bae6fd', ringColor: '#38bdf8', speed: 1.2 },
    { nx: 0.46, ny: 0.18, r: 30, color: '#fef08a', ringColor: '#f59e0b', speed: -0.85 },
    { nx: 0.54, ny: 0.10, r: 19, color: '#e0e7ff', ringColor: '#818cf8', speed: 1.0 },
    { nx: 0.65, ny: 0.21, r: 26, color: '#fef08a', ringColor: '#fde047', speed: 0.95 },
    { nx: 0.71, ny: 0.11, r: 21, color: '#bae6fd', ringColor: '#60a5fa', speed: -1.15 },
    { nx: 0.43, ny: 0.39, r: 23, color: '#fef9c3', ringColor: '#facc15', speed: 0.75 },
    { nx: 0.68, ny: 0.40, r: 22, color: '#e0f2fe', ringColor: '#38bdf8', speed: -0.9 },
    { nx: 0.91, ny: 0.35, r: 24, color: '#fef08a', ringColor: '#fde047', speed: 1.05 }
  ];

  // Crescent moon in upper right (classic Starry Night position)
  const MOON = { nx: 0.83, ny: 0.19, r: 58 };

  // Great swirling nebula vortices in the sky
  const VORTICES = [
    { nx: 0.36, ny: 0.27, radius: 0.24, strength: 1.45, dir: 1 },
    { nx: 0.58, ny: 0.33, radius: 0.21, radiusY: 0.16, strength: 1.35, dir: -1 },
    { nx: 0.22, ny: 0.22, radius: 0.15, strength: 0.95, dir: -1 },
    { nx: 0.76, ny: 0.29, radius: 0.16, strength: 0.9, dir: 1 }
  ];

  // Impasto oil palette inspired by Van Gogh's Starry Night
  const SKY_PALETTE = [
    [13, 33, 79],    // Deep Ultramarine
    [22, 54, 114],   // Royal Cobalt
    [37, 99, 235],   // Brilliant Cobalt Blue
    [56, 189, 248],  // Cerulean Sky
    [45, 212, 191],  // Starry Night Turquoise Accent
    [99, 102, 241],  // Indigo Violet
    [147, 197, 253], // Pale Ice Blue
    [224, 242, 254], // Luminous Starlight White-Blue
    [253, 224, 71]   // Chrome Yellow Highlight
  ];

  function triggerMeteor(customStart, customEnd) {
    if (!p5Instance) return;
    const w = p5Instance.width || window.innerWidth;
    const h = p5Instance.height || window.innerHeight;
    const sx = customStart?.x ?? w * (0.15 + Math.random() * 0.55);
    const sy = customStart?.y ?? h * (0.06 + Math.random() * 0.16);
    const ex = customEnd?.x ?? sx + w * (0.22 + Math.random() * 0.18);
    const ey = customEnd?.y ?? h * (0.44 + Math.random() * 0.14);

    meteors.push({
      sx,
      sy,
      ex,
      ey,
      cx: (sx + ex) * 0.5 + (Math.random() - 0.5) * 60,
      cy: Math.min(sy, ey) - 45,
      t: 0,
      speed: 0.022,
      sparks: []
    });
    meteorCount++;
  }

  const sketch = p => {
    let baseLayer = null;
    let streamlines = [];
    let twinkleStars = [];
    let heartNodes = [];

    /**
     * Compute the Van Gogh flow-field angle at canvas coordinate (x, y).
     */
    function flowAngleAt(x, y, timeSec = 0) {
      const w = Math.max(1, p.width);
      const h = Math.max(1, p.height);
      const nx = x / w;
      const ny = y / h;

      // Base rolling wave across the sky (S-shaped horizon current)
      let vx = 1.05;
      let vy = Math.sin(nx * Math.PI * 3.2 - 0.6 + timeSec * 0.25) * 0.42
             + Math.cos(ny * Math.PI * 4.0 + nx * 2.5) * 0.24;

      // Perlin noise turbulence
      const n = p.noise(nx * 3.4, ny * 4.2, timeSec * 0.06);
      const nAngle = (n - 0.48) * Math.PI * 2.2;
      vx += Math.cos(nAngle) * 0.55;
      vy += Math.sin(nAngle) * 0.55;

      // Dual Great Nebula Vortices
      for (const v of VORTICES) {
        const dx = nx - v.nx;
        const dy = (ny - v.ny) * (w / h) * 0.72;
        const distSq = dx * dx + dy * dy;
        const rSq = v.radius * v.radius;
        if (distSq < rSq * 2.2) {
          const factor = Math.exp(-distSq / (rSq * 0.55)) * v.strength;
          const dist = Math.sqrt(distSq) + 0.0001;
          // Tangential swirl + slight inward spiral
          const tx = (-dy / dist) * v.dir - (dx / dist) * 0.15;
          const ty = (dx / dist) * v.dir - (dy / dist) * 0.15;
          vx += tx * factor * 2.4;
          vy += ty * factor * 2.4;
        }
      }

      // Concentric halo swirls around Moon and Major Stars
      const mx = nx - MOON.nx;
      const my = (ny - MOON.ny) * (w / h);
      const mDist = Math.hypot(mx, my);
      if (mDist < 0.16 && mDist > 0.002) {
        const mFactor = Math.exp(- (mDist * mDist) / 0.009) * 2.2;
        vx += (-my / mDist) * mFactor;
        vy += (mx / mDist) * mFactor;
      }

      // Interactive pointer swirl wake
      if (pointerStrength > 0.01) {
        const pdx = x - pointerX;
        const pdy = y - pointerY;
        const pDist = Math.hypot(pdx, pdy);
        if (pDist < 180 && pDist > 1) {
          const pf = (1 - pDist / 180) * pointerStrength * 2.5;
          vx += (-pdy / pDist) * pf;
          vy += (pdx / pDist) * pf;
        }
      }

      return Math.atan2(vy, vx);
    }

    /**
     * Pre-render the rich oil-impasto underpainting onto `baseLayer`.
     */
    function buildBaseImpastoLayer() {
      const w = Math.max(1, p.width);
      const h = Math.max(1, p.height);
      if (baseLayer) baseLayer.remove();
      baseLayer = p.createGraphics(w, h);
      baseLayer.pixelDensity(1);

      const ctx = baseLayer.drawingContext;
      // 1. Deep night gradient canvas ground
      const grad = ctx.createLinearGradient(0, 0, 0, h * 0.72);
      grad.addColorStop(0.0, '#040b21');
      grad.addColorStop(0.32, '#0a1c47');
      grad.addColorStop(0.62, '#13316e');
      grad.addColorStop(0.88, '#1b4382');
      grad.addColorStop(1.0, '#091834');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // 2. Soft luminous nebula glow washes along the S-curve vortex
      const nebulaStops = [
        { x: w * 0.36, y: h * 0.27, r: w * 0.26, c0: 'rgba(56, 189, 248, 0.26)', c1: 'rgba(37, 99, 235, 0)' },
        { x: w * 0.58, y: h * 0.33, r: w * 0.24, c0: 'rgba(129, 140, 248, 0.24)', c1: 'rgba(30, 58, 138, 0)' },
        { x: w * MOON.nx, y: h * MOON.ny, r: w * 0.18, c0: 'rgba(253, 224, 71, 0.32)', c1: 'rgba(250, 204, 21, 0)' }
      ];
      for (const ns of nebulaStops) {
        const rg = ctx.createRadialGradient(ns.x, ns.y, 4, ns.x, ns.y, ns.r);
        rg.addColorStop(0, ns.c0);
        rg.addColorStop(1, ns.c1);
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, w, h);
      }

      // 3. 3,400 Layered Van Gogh Oil-Impasto Underpainting Strokes
      baseLayer.noFill();
      baseLayer.strokeCap(p.ROUND);
      const skyHeight = h * 0.68;

      for (let i = 0; i < 3400; i++) {
        const sx = (p.random() * 1.04 - 0.02) * w;
        const sy = Math.pow(p.random(), 0.92) * skyHeight;
        const ang = flowAngleAt(sx, sy, 0);
        const len = 14 + p.random() * 24;
        const sw = 2.4 + p.random() * 4.2;

        // Choose color based on proximity to vortex band & elevation
        const nx = sx / w;
        const ny = sy / h;
        const sBand = Math.exp(-Math.pow((ny - (0.29 + 0.08 * Math.sin(nx * 6.0 - 1.2))) * 5.2, 2));
        const nVal = p.noise(nx * 4.5, ny * 5.0);

        let rgb;
        if (sBand > 0.55 && p.random() < 0.48) {
          rgb = p.random() < 0.28 ? SKY_PALETTE[7] : (p.random() < 0.5 ? SKY_PALETTE[3] : SKY_PALETTE[4]);
        } else if (nVal > 0.62) {
          rgb = SKY_PALETTE[2];
        } else if (nVal > 0.45) {
          rgb = SKY_PALETTE[1];
        } else {
          rgb = SKY_PALETTE[0];
        }

        const x2 = sx + Math.cos(ang) * len * 0.5;
        const y2 = sy + Math.sin(ang) * len * 0.5;
        const x3 = sx + Math.cos(ang + 0.14) * len;
        const y3 = sy + Math.sin(ang + 0.14) * len;

        // Shadow base of impasto stroke
        baseLayer.strokeWeight(sw + 1.2);
        baseLayer.stroke(6, 15, 42, 130);
        baseLayer.line(sx, sy, x3, y3);

        // Main pigment body
        baseLayer.strokeWeight(sw);
        baseLayer.stroke(rgb[0], rgb[1], rgb[2], 195);
        baseLayer.beginShape();
        baseLayer.vertex(sx, sy);
        baseLayer.quadraticVertex(x2, y2, x3, y3);
        baseLayer.endShape();

        // Fine impasto ridge highlight
        baseLayer.strokeWeight(Math.max(1, sw * 0.35));
        baseLayer.stroke(
          Math.min(255, rgb[0] + 42),
          Math.min(255, rgb[1] + 45),
          Math.min(255, rgb[2] + 35),
          115
        );
        baseLayer.line(sx, sy - 0.8, x2, y2 - 0.8);
      }

      // 4. Paint Concentric Dashed Impasto Rings around each Major Van Gogh Star
      for (const st of VG_STARS) {
        const cx = st.nx * w;
        const cy = st.ny * h;
        const maxR = st.r * (w < 640 ? 0.78 : 1.08);
        const colCore = p.color(st.color);
        const colRing = p.color(st.ringColor);

        for (let r = 6; r <= maxR; r += 5.2) {
          const circumference = Math.PI * 2 * r;
          const dashes = Math.max(6, Math.floor(circumference / 13));
          for (let d = 0; d < dashes; d++) {
            const a0 = (d / dashes) * Math.PI * 2 + (r * 0.15);
            const a1 = a0 + (Math.PI * 2 / dashes) * 0.64;
            baseLayer.strokeWeight(2.6);
            const t = r / maxR;
            const c = p.lerpColor(colCore, colRing, t);
            c.setAlpha(210 * (1 - t * 0.55));
            baseLayer.stroke(c);
            baseLayer.arc(cx, cy, r * 2, r * 2, a0, a1);
          }
        }
      }

      // 5. Paint the Iconic Van Gogh Crescent Moon & Concentric Golden Halo Rings
      const mx = MOON.nx * w;
      const my = MOON.ny * h;
      const mr = MOON.r * (w < 640 ? 0.75 : 1.05);
      for (let r = mr * 0.45; r <= mr * 1.65; r += 6.2) {
        const dashes = Math.max(10, Math.floor((Math.PI * 2 * r) / 15));
        for (let d = 0; d < dashes; d++) {
          const a0 = (d / dashes) * Math.PI * 2 + r * 0.08;
          const a1 = a0 + (Math.PI * 2 / dashes) * 0.68;
          const ratio = (r - mr * 0.45) / (mr * 1.2);
          baseLayer.strokeWeight(3.2);
          baseLayer.stroke(253, 224, 71, 215 * (1 - ratio * 0.62));
          baseLayer.arc(mx, my, r * 2, r * 2, a0, a1);
        }
      }
      // Sculpted golden crescent body
      ctx.save();
      ctx.fillStyle = '#fef08a';
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.arc(mx, my, mr * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(mx - mr * 0.15, my - mr * 0.08, mr * 0.31, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Refill crescent inner shadow with deep cobalt impasto
      ctx.save();
      ctx.fillStyle = 'rgba(22, 54, 114, 0.72)';
      ctx.beginPath();
      ctx.arc(mx - mr * 0.15, my - mr * 0.08, mr * 0.29, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function initParticles() {
      const w = Math.max(1, p.width);
      const h = Math.max(1, p.height);
      const skyH = h * 0.64;

      // 850 Live Flowing Van Gogh Brushstrokes
      const count = w < 640 ? 480 : 850;
      streamlines = Array.from({ length: count }, () => {
        const isGolden = Math.random() < 0.16;
        const isLightCyan = !isGolden && Math.random() < 0.42;
        return {
          x: Math.random() * w,
          y: Math.random() * skyH,
          len: 12 + Math.random() * 20,
          weight: 2.0 + Math.random() * 2.8,
          speed: 0.55 + Math.random() * 1.15,
          phase: Math.random() * Math.PI * 2,
          color: isGolden
            ? [253, 224, 71]
            : isLightCyan
              ? [125, 211, 252]
              : [56, 189, 248]
        };
      });

      // 320 Twinkling "滿天星" Starry Sky Motes weaving through the swirls
      twinkleStars = Array.from({ length: 320 }, () => ({
        nx: Math.random(),
        ny: Math.pow(Math.random(), 1.1) * 0.58,
        size: 1.8 + Math.random() * 3.2,
        speed: 1.5 + Math.random() * 3.0,
        phase: Math.random() * Math.PI * 2,
        gold: Math.random() < 0.38
      }));

      // Heart Constellation Impasto Nodes (for Easter Egg #2 & Finale)
      heartNodes = [];
      const steps = 36;
      for (let i = 0; i < steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const hx = 16 * Math.pow(Math.sin(t), 3);
        const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        heartNodes.push({ hx, hy, phase: i * 0.4 });
      }
    }

    p.setup = () => {
      const w = container.clientWidth || window.innerWidth || 1280;
      const h = container.clientHeight || window.innerHeight || 720;
      const cnv = p.createCanvas(w, h);
      cnv.id('vangogh-canvas');
      p.pixelDensity(Math.min(window.devicePixelRatio || 1, 1.5));
      p.noiseSeed(20261109);
      buildBaseImpastoLayer();
      initParticles();
      onReady();
    };

    p.draw = () => {
      if (disposed) return;
      const w = p.width;
      const h = p.height;
      const skyH = h * 0.65;
      const timeSec = p.millis() * 0.001;

      finaleProgress += (finaleTarget - finaleProgress) * 0.05;
      constellationProgress += (constellationTarget - constellationProgress) * 0.06;
      pointerStrength = Math.max(0, pointerStrength - 0.03);

      // 1. Blit pre-painted Van Gogh oil underpainting
      if (baseLayer) {
        p.image(baseLayer, 0, 0, w, h);
      }

      // 2. Animate Live Flowing Impasto Brushstrokes along Curl Vortex Field
      p.noFill();
      p.strokeCap(p.ROUND);
      const speedMult = 1 + finaleProgress * 0.85;

      for (let i = 0; i < streamlines.length; i++) {
        const s = streamlines[i];
        const ang = flowAngleAt(s.x, s.y, timeSec * 0.45);
        const vx = Math.cos(ang);
        const vy = Math.sin(ang);

        const x2 = s.x + vx * s.len;
        const y2 = s.y + vy * s.len;

        const pulse = 0.55 + 0.45 * Math.sin(timeSec * 2.2 + s.phase);
        const alpha = (95 + 85 * pulse + 45 * finaleProgress);

        p.strokeWeight(s.weight);
        p.stroke(s.color[0], s.color[1], s.color[2], alpha);
        p.line(s.x, s.y, x2, y2);

        s.x += vx * s.speed * speedMult;
        s.y += vy * s.speed * speedMult;

        if (s.x < -30) s.x = w + 20;
        if (s.x > w + 30) s.x = -20;
        if (s.y < -20 || s.y > skyH) {
          s.x = Math.random() * w;
          s.y = Math.random() * (skyH * 0.92);
        }
      }

      // 3. Animate Rotating Concentric Impasto Halos around the 12 Major Van Gogh Stars
      for (let i = 0; i < VG_STARS.length; i++) {
        const st = VG_STARS[i];
        const cx = st.nx * w;
        const cy = st.ny * h;
        const pulse = 0.82 + 0.24 * Math.sin(timeSec * 2.6 + i * 1.1) + finaleProgress * 0.22;
        const rOuter = st.r * (w < 640 ? 0.72 : 0.96) * pulse;

        p.strokeWeight(2.5);
        const col = p.color(st.ringColor);
        col.setAlpha(185);
        p.stroke(col);

        for (let k = 0; k < 4; k++) {
          const a = timeSec * st.speed + (k * Math.PI * 0.5);
          p.arc(cx, cy, rOuter * 1.5, rOuter * 1.5, a, a + 0.52);
        }

        // Warm glowing star heart
        p.noStroke();
        p.fill(255, 252, 220, 220);
        p.circle(cx, cy, 6.5 * pulse);
      }

      // 4. Twinkling "满天星" Sky Star Motes
      p.noStroke();
      for (let i = 0; i < twinkleStars.length; i++) {
        const ts = twinkleStars[i];
        const tw = 0.4 + 0.6 * Math.sin(timeSec * ts.speed + ts.phase);
        if (tw < 0.25) continue;
        const tx = ts.nx * w;
        const ty = ts.ny * h;
        if (ts.gold) {
          p.fill(254, 240, 138, 195 * tw);
        } else {
          p.fill(224, 242, 254, 195 * tw);
        }
        p.circle(tx, ty, ts.size * (0.8 + 0.45 * tw));
      }

      // 5. Van Gogh Painted Heart Constellation (when Easter Egg #2 or Finale is unlocked)
      if (constellationProgress > 0.02) {
        const hcx = w * 0.48;
        const hcy = h * 0.22;
        const scale = Math.min(w, h) * 0.0058;
        p.noFill();
        p.strokeCap(p.ROUND);

        for (let i = 0; i < heartNodes.length; i++) {
          const cur = heartNodes[i];
          const next = heartNodes[(i + 1) % heartNodes.length];
          const x1 = hcx + cur.hx * scale;
          const y1 = hcy + cur.hy * scale;
          const x2 = hcx + next.hx * scale;
          const y2 = hcy + next.hy * scale;

          const shimmer = 0.65 + 0.35 * Math.sin(timeSec * 3.2 + cur.phase);
          p.strokeWeight(3.4);
          p.stroke(253, 224, 71, 210 * constellationProgress * shimmer);
          p.line(x1, y1, x2, y2);

          p.noStroke();
          p.fill(125, 211, 252, 220 * constellationProgress);
          p.circle(x1, y1, 4.8 * shimmer);
        }
      }

      // 6. Painted Van Gogh Shooting Stars / Meteors
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.t += m.speed;
        const headT = Math.min(1, m.t);
        const omt = 1 - headT;
        const hx = omt * omt * m.sx + 2 * omt * headT * m.cx + headT * headT * m.ex;
        const hy = omt * omt * m.sy + 2 * omt * headT * m.cy + headT * headT * m.ey;

        p.noFill();
        for (let s = 1; s <= 14; s++) {
          const tailT = Math.max(0, m.t - s * 0.018);
          if (tailT > 1) continue;
          const tomt = 1 - tailT;
          const tx = tomt * tomt * m.sx + 2 * tomt * tailT * m.cx + tailT * tailT * m.ex;
          const ty = tomt * tomt * m.sy + 2 * tomt * tailT * m.cy + tailT * tailT * m.ey;
          const fade = 1 - s / 15;
          p.strokeWeight(4.5 * fade);
          p.stroke(s % 2 === 0 ? 253 : 125, s % 2 === 0 ? 224 : 211, s % 2 === 0 ? 71 : 252, 230 * fade);
          p.point(tx, ty);
        }

        if (m.t <= 1.0) {
          p.noStroke();
          p.fill(254, 249, 195, 245);
          p.circle(hx, hy, 10);
        }
        if (m.t >= 1.35) {
          meteors.splice(i, 1);
        }
      }

      frameCounter++;
    };
  };

  p5Instance = new P5(sketch, container);

  return {
    resize() {
      if (!p5Instance || disposed) return;
      const w = container.clientWidth || window.innerWidth || 1280;
      const h = container.clientHeight || window.innerHeight || 720;
      p5Instance.resizeCanvas(w, h);
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
      triggerMeteor();
      triggerMeteor();
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
