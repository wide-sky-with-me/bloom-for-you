// Sunshower, Posterized Cel-Shaded Water, God-Rays, Caustics & Harbor Wildlife
// for "太阳雨中的童话星语花湾 · Sunshower Fairytale Harbor Diorama".

import { THREE, PALETTE, mulberry32, toonMat, emissiveMat, addEdgeInk } from "./toon-kit.js";

// ---------------------------------------------------------------------------
// 1. Custom GLSL: Posterized Cel-Shaded Harbor Water + Flat Sharded Reflections
// ---------------------------------------------------------------------------

const WATER_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec2 vSlope;

  float quayWallDamp(vec2 xz) {
    // North quay wall at Z = -1.5
    float dampNorth = smoothstep(-1.50, -0.82, xz.y);

    // West quay wall at X = -1.0 (steps back to X = -2.70 at slipway Z in [9.8, 12.0])
    float slipBlend = smoothstep(9.65, 9.95, xz.y);
    float westWallX = mix(-1.00, -2.70, slipBlend);
    float dampWest = smoothstep(westWallX, westWallX + 0.62, xz.x);

    // Inside the slipway pocket (X < -1.0), damp near side walls Z = 9.8 and Z = 12.0
    float inSlipway = 1.0 - smoothstep(-1.16, -0.92, xz.x);
    float slipSideDamp = smoothstep(9.80, 10.12, xz.y) * (1.0 - smoothstep(11.72, 12.00, xz.y));
    float dampPocket = mix(1.0, slipSideDamp, inSlipway);

    // Gentle softening near outer diorama cutaway (keeps lively silhouette without harsh tear)
    float cutawayEdge = (1.0 - smoothstep(11.2, 12.0, xz.x)) * (1.0 - smoothstep(11.2, 12.0, xz.y));
    float cutawaySoft = mix(0.55, 1.0, cutawayEdge);

    return dampNorth * dampWest * dampPocket * cutawaySoft;
  }

  vec3 sampleHarborWaves(vec2 p, float t) {
    float p1 = dot(p, vec2(-1.12, 1.04)) + t * 1.42;
    float p2 = dot(p, vec2(0.86, 1.38)) - t * 1.82 + 1.35;
    float p3 = dot(p, vec2(-1.92, -1.32)) + t * 2.30 + 2.60;

    vec2 entranceDelta = p - vec2(11.2, -1.8);
    float distEnt = length(entranceDelta) + 0.001;
    float p4 = distEnt * 1.55 - t * 1.58;

    float h = sin(p1) * 0.019
            + sin(p2) * 0.013
            + sin(p3) * 0.0065
            + sin(p4) * 0.0035;

    vec2 grad = cos(p1) * 0.019 * vec2(-1.12, 1.04)
              + cos(p2) * 0.013 * vec2(0.86, 1.38)
              + cos(p3) * 0.0065 * vec2(-1.92, -1.32)
              + cos(p4) * 0.0035 * (entranceDelta / distEnt) * 1.55;

    return vec3(h, grad.x, grad.y);
  }

  void main() {
    vec4 worldBase = modelMatrix * vec4(position, 1.0);
    float damp = quayWallDamp(worldBase.xz);
    vec3 wave = sampleHarborWaves(worldBase.xz, uTime);

    worldBase.y += wave.x * damp;
    vWorldPos = worldBase.xyz;
    vSlope = wave.yz * damp;

    gl_Position = projectionMatrix * viewMatrix * worldBase;
  }
`;

const WATER_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uCloudFactor;
  uniform float uRainbowStrength;

  varying vec3 vWorldPos;
  varying vec2 vSlope;

  float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float vNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + vec2(r);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  float celMask(float sdfDist, float shardMod) {
    float val = 0.5 - (sdfDist - shardMod) * 1.45;
    return smoothstep(0.48, 0.51, val);
  }

  void main() {
    vec2 p = vWorldPos.xz;

    // -----------------------------------------------------------------------
    // 1. Base Cel-Quantized Harbor Water Bands (3-4 crisp anime bands)
    // -----------------------------------------------------------------------
    vec3 colDeepTeal  = vec3(0.145, 0.431, 0.510); // #256E82
    vec3 colMidTeal   = vec3(0.235, 0.604, 0.678); // #3C9AAD
    vec3 colSeaGlass  = vec3(0.353, 0.773, 0.749); // #5AC5BF
    vec3 colAquaMint  = vec3(0.541, 0.890, 0.855); // #8AE3DA

    float quayShadowW = (p.y < 9.65) ? exp(-max(0.0, p.x + 1.0) * 0.82) : 0.0;
    float quayShadowN = exp(-max(0.0, p.y + 1.5) * 0.82);
    float quayShadow = clamp(max(quayShadowW, quayShadowN * 0.92), 0.0, 1.0);

    // Shallow uplift near slipway & tetrapod reefs
    float shallowSlip = (1.0 - smoothstep(-2.5, 0.4, p.x)) * smoothstep(9.2, 10.2, p.y);
    float shallowTetra1 = 1.0 - smoothstep(0.0, 1.4, sdRoundBox(p - vec2(10.6, 3.9), vec2(1.15, 2.55), 0.4));
    float shallowTetra2 = 1.0 - smoothstep(0.0, 1.3, sdRoundBox(p - vec2(10.75, 10.65), vec2(1.0, 1.1), 0.35));
    float shallowBoost = clamp(shallowSlip * 0.45 + (shallowTetra1 + shallowTetra2) * 0.28, 0.0, 0.52);

    float waveFacet = dot(vSlope, vec2(-5.2, -4.4))
                    + (vNoise(p * 0.62 + vec2(uTime * 0.14, -uTime * 0.11)) - 0.5) * 0.34
                    + sin(p.x * 0.85 - p.y * 0.72 + uTime * 0.95) * 0.09;

    float waterTone = 0.56 + waveFacet + shallowBoost - quayShadow * 0.42;
    waterTone *= mix(0.92, 1.04, clamp((uCloudFactor - 0.65) / 0.40, 0.0, 1.0));

    // Quantize into 4 crisp cel color bands
    vec3 baseCol = colDeepTeal;
    baseCol = mix(baseCol, colMidTeal,  smoothstep(0.29, 0.315, waterTone));
    baseCol = mix(baseCol, colSeaGlass, smoothstep(0.49, 0.515, waterTone));
    baseCol = mix(baseCol, colAquaMint, smoothstep(0.71, 0.735, waterTone));

    // Subtle cel-shaded turquoise caustic lace in sunny mid-shallows
    float laceA = sin(p.x * 2.9 + p.y * 2.1 - uTime * 1.55 + vSlope.x * 16.0);
    float laceB = sin(p.x * 2.1 - p.y * 3.2 + uTime * 1.32 + vSlope.y * 16.0);
    float crestRibbon = smoothstep(0.84, 0.87, (laceA + laceB) * 0.5) * (1.0 - quayShadow * 0.75);
    baseCol = mix(baseCol, vec3(0.675, 0.945, 0.914), crestRibbon * 0.42);

    // -----------------------------------------------------------------------
    // 2. Wave-Warped Coordinates (rw) for Posterized Sharded Reflections
    // -----------------------------------------------------------------------
    vec2 harmA = vec2(
      sin(p.y * 3.25 - uTime * 2.10 + p.x * 0.68),
      cos(p.x * 2.45 + p.y * 2.05 - uTime * 1.62)
    ) * 0.44;
    vec2 harmB = vec2(
      sin(p.y * 7.60 + p.x * 1.75 - uTime * 3.15),
      sin(p.y * 5.95 - p.x * 2.20 + uTime * 2.48)
    ) * 0.36;
    vec2 harmC = vec2(
      vNoise(p * 1.80 + vec2(-uTime * 0.38, uTime * 0.48)) - 0.5,
      vNoise(p * 1.80 + vec2(uTime * 0.44, -uTime * 0.35) + 19.7) - 0.5
    ) * 0.68;

    vec2 waveOffset = harmA + harmB + harmC;
    vec2 rw = p + waveOffset * vec2(0.42, 0.55);

    // Horizontal anime wave-slicing term so reflections pinch into clean shards & recombine
    float shardMod = sin(p.y * 9.4 + p.x * 1.85 - uTime * 3.35) * 0.088
                   + sin(p.y * 5.1 - p.x * 2.65 + uTime * 2.15) * 0.068;

    vec3 colHullShadow = vec3(0.137, 0.376, 0.467); // #236077
    vec3 colBoatWhite  = vec3(0.961, 0.980, 0.984); // #F5FAFB
    vec3 colLifebuoy   = vec3(0.933, 0.455, 0.322); // #EE7452
    vec3 colButter     = vec3(0.973, 0.871, 0.549); // #F8DE8C
    vec3 colMintTrim   = vec3(0.565, 0.875, 0.824); // #90DFD2
    vec3 colLhRed      = vec3(0.894, 0.392, 0.345); // #E46458
    vec3 colLhWhite    = vec3(0.969, 0.984, 0.984); // #F7FBFB
    vec3 colBrassGlint = vec3(0.980, 0.827, 0.459); // #FAD375

    float reflBoostAlpha = 0.0;

    // (a) Deep-blue hull & breakwater shadow blocks
    float dShadow0 = sdRoundBox(rw - vec2(2.10, 0.16), vec2(1.88, 0.86), 0.28);
    float dShadow1 = sdRoundBox(rw - vec2(6.00, 0.12), vec2(1.70, 0.82), 0.26);
    float dShadow2 = sdRoundBox(rw - vec2(0.14, 2.38), vec2(0.78, 1.44), 0.24);
    float dShadow3 = sdRoundBox(rw - vec2(3.90, 2.88), vec2(1.26, 0.72), 0.24);
    float dShadowBw = sdRoundBox(rw - vec2(8.62, 1.48), vec2(1.06, 3.08), 0.22);
    float dAllShadows = min(min(min(dShadow0, dShadow1), min(dShadow2, dShadow3)), dShadowBw);
    float mShadow = celMask(dAllShadows, shardMod * 0.85);
    baseCol = mix(baseCol, colHullShadow, mShadow * 0.88);
    reflBoostAlpha = max(reflBoostAlpha, mShadow * 0.45);

    // (b) 4 Moored Boats: crisp cream-white hull/cabin blocks + accent blocks
    float dBoat0White = min(
      sdRoundBox(rw - vec2(2.10, 0.74), vec2(1.62, 0.62), 0.22),
      sdRoundBox(rw - vec2(2.05, 1.32), vec2(0.78, 0.48), 0.18)
    );
    float dBoat1White = min(
      sdRoundBox(rw - vec2(6.00, 0.68), vec2(1.46, 0.58), 0.20),
      sdRoundBox(rw - vec2(6.00, 1.22), vec2(0.70, 0.44), 0.16)
    );
    float dBoat2White = sdRoundBox(rw - vec2(0.58, 2.66), vec2(0.56, 1.24), 0.20);
    float dBoat3White = sdRoundBox(rw - vec2(3.90, 3.44), vec2(1.06, 0.52), 0.18);
    float dBoatsWhite = min(min(dBoat0White, dBoat1White), min(dBoat2White, dBoat3White));

    float mBoatWhite = celMask(dBoatsWhite, shardMod);
    baseCol = mix(baseCol, colBoatWhite, mBoatWhite * 0.93);
    reflBoostAlpha = max(reflBoostAlpha, mBoatWhite);

    // Boat 2 warm butter trim & Boat 3 mint stripe
    float mButter = celMask(sdRoundBox(rw - vec2(0.74, 2.82), vec2(0.28, 0.84), 0.12), shardMod);
    baseCol = mix(baseCol, colButter, mButter * 0.90);
    reflBoostAlpha = max(reflBoostAlpha, mButter * 0.85);

    float mMint = celMask(sdRoundBox(rw - vec2(3.90, 3.24), vec2(0.88, 0.23), 0.10), shardMod);
    baseCol = mix(baseCol, colMintTrim, mMint * 0.90);
    reflBoostAlpha = max(reflBoostAlpha, mMint * 0.80);

    // Boat 0 & Boat 1 coral lifebuoy reflection shards
    float dCoral = min(
      sdRoundBox(rw - vec2(2.78, 0.80), vec2(0.29, 0.18), 0.09),
      sdRoundBox(rw - vec2(6.62, 0.74), vec2(0.27, 0.17), 0.09)
    );
    float mCoral = celMask(dCoral, shardMod * 0.75);
    baseCol = mix(baseCol, colLifebuoy, mCoral * 0.95);
    reflBoostAlpha = max(reflBoostAlpha, mCoral);

    // (c) Red-and-White Lighthouse at (8.8, 3.5) reflecting across Z in [3.8, 7.6]
    float lhT = clamp((rw.y - 3.80) / 3.80, 0.0, 1.0);
    float lhCenterX = mix(8.74, 7.92, lhT);
    float lhHalfW = mix(0.58, 0.27, lhT);
    float dLighthouse = max(abs(rw.x - lhCenterX) - lhHalfW, abs(rw.y - 5.70) - 1.90);
    float mLighthouse = celMask(dLighthouse, shardMod * 1.10);

    float lhStripe = smoothstep(-0.035, 0.035, sin((rw.y - 3.82) * 4.75));
    vec3 lhCol = mix(colLhRed, colLhWhite, lhStripe);
    float lhLanternTip = smoothstep(7.12, 7.20, rw.y);
    lhCol = mix(lhCol, colBrassGlint, lhLanternTip);

    baseCol = mix(baseCol, lhCol, mLighthouse * 0.94);
    reflBoostAlpha = max(reflBoostAlpha, mLighthouse);

    // (d) Pier Lamp Posts warm brass-gold glints + dancing sunshower sparkles
    float dLamp1 = sdRoundBox(rw - vec2(-0.34, 4.95), vec2(0.32, 0.56), 0.18);
    float dLamp2 = sdRoundBox(rw - vec2(-0.40, -0.82), vec2(0.26, 0.42), 0.15);
    float dLamp3 = sdRoundBox(rw - vec2(4.65, -0.68), vec2(0.32, 0.52), 0.18);
    float dLamp4 = sdRoundBox(rw - vec2(7.55, -0.72), vec2(0.28, 0.46), 0.16);
    float dLamps = min(min(dLamp1, dLamp2), min(dLamp3, dLamp4));
    float mLamp = celMask(dLamps, shardMod * 1.25);

    // Delicate horizontal anime sun-glint dashes dancing along sunlit wave crests
    float sp1 = sin(p.x * 6.4 + p.y * 14.5 - uTime * 3.4 + vSlope.x * 32.0);
    float sp2 = sin(p.x * 5.2 - p.y * 16.2 + uTime * 2.9 + vSlope.y * 32.0);
    float sp3 = vNoise(vec2(p.x * 2.6, p.y * 6.8) + vec2(-uTime * 0.55, uTime * 0.45));
    float sunCorridor = smoothstep(0.2, 3.8, p.x) * (1.0 - smoothstep(9.2, 11.8, p.x)) * smoothstep(-0.6, 2.2, p.y);
    float sparkleVal = (sp1 * 0.36 + sp2 * 0.36 + sp3 * 0.44) * sunCorridor * clamp(uCloudFactor, 0.75, 1.05);
    float mSparkle = smoothstep(0.895, 0.915, sparkleVal) * (1.0 - quayShadow * 0.85);

    float mGold = clamp(mLamp + mSparkle, 0.0, 1.0);
    vec3 glintCol = mix(colBrassGlint, vec3(1.0, 0.975, 0.86), mSparkle * 0.55);
    baseCol = mix(baseCol, glintCol, mGold * 0.95);
    reflBoostAlpha = max(reflBoostAlpha, mGold);

    // Subtle pastel rainbow sheen on far harbor water when rare rainbow is active
    if (uRainbowStrength > 0.01) {
      float rbBand = clamp((p.x - 1.2) / 8.5, 0.0, 1.0);
      vec3 rbTint = 0.5 + 0.5 * cos(6.28318 * (rbBand * 0.82 + vec3(0.0, 0.33, 0.67)));
      float rbMask = (1.0 - smoothstep(-1.2, 2.0, p.y))
                   * smoothstep(0.5, 3.0, p.x)
                   * (1.0 - smoothstep(8.5, 11.0, p.x));
      baseCol = mix(baseCol, mix(baseCol, rbTint * 0.95 + 0.15, 0.35), rbMask * uRainbowStrength * 0.45);
    }

    // -----------------------------------------------------------------------
    // 3. Crisp Posterized Shoreline, Breakwater & Tetrapod Cel-Foam (#F8FFFF)
    // -----------------------------------------------------------------------
    float dQuayNorth = abs(p.y - (-1.5));
    float dQuayWest = (p.y < 9.72)
      ? abs(p.x - (-1.0))
      : min(abs(p.x - (-2.66)), min(
          (p.x < -0.95) ? abs(p.y - 9.82) : 99.0,
          (p.x < -0.95) ? abs(p.y - 11.96) : 99.0
        ));

    float dBwRaw = sdRoundBox(p - vec2(8.80, 1.35), vec2(0.82, 2.90), 0.16);
    float dBwEdge = (dBwRaw > -0.08) ? abs(dBwRaw) : 99.0;

    // Scalloped foam rings around Tetrapod Zones (9.5..11.7, 1.4..6.4) & (9.8..11.7, 9.6..11.7)
    float scallop = (vNoise(p * 2.4 + vec2(uTime * 0.22, -uTime * 0.18)) - 0.5) * 0.32;
    float dTet1 = abs(sdRoundBox(p - vec2(10.60, 3.90), vec2(1.04, 2.44), 0.42) + scallop);
    float dTet2 = abs(sdRoundBox(p - vec2(10.75, 10.65), vec2(0.92, 1.02), 0.38) + scallop);

    float dShore = min(min(dQuayNorth, dQuayWest), min(dBwEdge, min(dTet1, dTet2)));
    float foamPulse = sin(uTime * 2.05 + p.x * 1.65 + p.y * 1.45) * 0.042
                    + (vNoise(p * 3.1 - uTime * 0.32) - 0.5) * 0.075;

    float dFoam = dShore + foamPulse;
    float innerFoam = 1.0 - smoothstep(0.135, 0.165, dFoam);
    float outerRingBreak = step(0.40, vNoise(p * 3.5 + vec2(uTime * 0.38, -uTime * 0.28)));
    float outerFoam = (1.0 - smoothstep(0.012, 0.032, abs(dFoam - 0.29))) * outerRingBreak;
    float foamMask = clamp(innerFoam + outerFoam * 0.85, 0.0, 1.0);

    vec3 colFoam = vec3(0.973, 1.000, 1.000); // #F8FFFF
    baseCol = mix(baseCol, colFoam, foamMask);

    // -----------------------------------------------------------------------
    // 4. Alpha Transparency (0.66 near foreground cutaway .. 0.84 in reflections)
    // -----------------------------------------------------------------------
    float fgCutaway = max(smoothstep(8.3, 10.4, p.y), smoothstep(9.3, 10.9, p.x));
    float alpha = mix(0.75, 0.66, fgCutaway);
    alpha = mix(alpha, 0.84, reflBoostAlpha);
    alpha = max(alpha, foamMask * 0.90);

    gl_FragColor = vec4(baseCol, alpha);
  }
`;

// ---------------------------------------------------------------------------
// 2. Custom GLSL: Slanted Golden Sunshower Rain Streaks
// ---------------------------------------------------------------------------

const RAIN_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aAnchor;
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aLength;
  attribute float aEnd;
  attribute float aTint;

  uniform float uFallDist;

  varying float vEnd;
  varying float vTint;
  varying float vClipVis;

  float roofAndGroundFloor(vec2 xz) {
    // Co-op Shed roof
    if (xz.x > -0.6 && xz.x < 4.2 && xz.y > -8.0 && xz.y < -3.6) return 3.85;
    // Waiting Pavilion roof
    if (xz.x > 5.2 && xz.x < 8.8 && xz.y > -7.1 && xz.y < -3.6) return 3.60;
    // Fairytale Villa roof footprint
    if (xz.x > -10.6 && xz.x < -3.4 && xz.y > 0.6 && xz.y < 8.4) return 5.10;
    // Open harbor bay + slipway pocket
    bool inMainBay = (xz.x > -0.95 && xz.y > -1.45);
    bool inSlipway = (xz.x > -2.70 && xz.y > 9.80);
    if (inMainBay || inSlipway) return 0.10;
    // Concrete pier level
    return 1.20;
  }

  void main() {
    float spanY = 13.4; // Y wraps in [0.1, 13.5]
    float travel = uFallDist * aSpeed + aPhase * spanY;
    float cy = 13.5 - mod(travel, spanY);

    // Compensate X/Z drift inside cycle so streaks stay inside [-12, +12]
    float fallFromTop = 13.5 - cy;
    vec3 dir = vec3(-0.14, -1.0, 0.09);
    float cx = mod(aAnchor.x + 12.0 + dir.x * fallFromTop, 24.0) - 12.0;
    float cz = mod(aAnchor.z + 12.0 + dir.z * fallFromTop, 24.0) - 12.0;

    vec3 headPos = vec3(cx, cy, cz);
    vec3 vertPos = headPos - dir * (aLength * (1.0 - aEnd));

    float floorY = roofAndGroundFloor(headPos.xz);
    vClipVis = smoothstep(floorY, floorY + 0.35, headPos.y) * (1.0 - smoothstep(12.6, 13.5, headPos.y));
    vEnd = aEnd;
    vTint = aTint;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(vertPos, 1.0);
  }
`;

const RAIN_FRAGMENT_SHADER = /* glsl */ `
  uniform float uOpacity;
  uniform float uCloudFactor;

  varying float vEnd;
  varying float vTint;
  varying float vClipVis;

  void main() {
    if (vClipVis < 0.02) discard;

    vec3 warmGold = vec3(1.000, 0.953, 0.812); // 0xfff3cf sunlit champagne-gold
    vec3 paleCyan = vec3(0.855, 0.969, 0.992); // sunlit sky-mist tint
    vec3 col = mix(warmGold, paleCyan, vTint * 0.42);

    // Tapered streak: soft tail (vEnd = 0) -> glistening sunlit tip (vEnd = 1)
    float streakProfile = mix(0.10, 1.0, pow(vEnd, 1.35));
    float sunBoost = mix(0.88, 1.06, clamp((uCloudFactor - 0.65) / 0.40, 0.0, 1.0));
    float alpha = uOpacity * streakProfile * vClipVis * sunBoost;

    gl_FragColor = vec4(col, alpha);
  }
`;

// ---------------------------------------------------------------------------
// 3. Custom GLSL: Soft Volumetric Sunshower Light Beams (God-Rays)
// ---------------------------------------------------------------------------

const BEAM_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const BEAM_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uCloudFactor;
  uniform float uBeamSeed;
  uniform float uBaseAlpha;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  void main() {
    // Smooth zero-border fade across width (vUv.x) and length (vUv.y)
    float edgeX = pow(sin(clamp(vUv.x, 0.0, 1.0) * 3.14159265), 2.25);
    float edgeY = smoothstep(0.0, 0.34, vUv.y) * (1.0 - smoothstep(0.24, 1.0, vUv.y));

    // Fade plane smoothly when viewed edge-on so crossed planes never show creases
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float facing = abs(dot(normalize(vWorldNormal), viewDir));
    float viewFade = smoothstep(0.06, 0.46, facing);

    // Gentle internal sunlit rain-veil striations
    float veil = 0.86
               + 0.14 * sin((vUv.x - 0.5) * 14.0 + uBeamSeed * 5.1 + uTime * 0.35)
               * sin(vUv.y * 6.0 - uTime * 0.55 + uBeamSeed);

    vec3 colTop = vec3(1.000, 0.960, 0.820);
    vec3 colBot = vec3(1.000, 0.910, 0.690);
    vec3 col = mix(colBot, colTop, vUv.y);

    float alpha = uBaseAlpha * edgeX * edgeY * viewFade * veil * uCloudFactor;
    gl_FragColor = vec4(col, alpha);
  }
`;

// ---------------------------------------------------------------------------
// 4. Custom GLSL: Animated Ceiling Water Caustics
// ---------------------------------------------------------------------------

const CAUSTIC_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const CAUSTIC_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uCloudFactor;

  varying vec2 vUv;
  varying vec3 vWorldPos;

  float causticWave(vec2 p, float t) {
    vec2 q = p;
    float s1 = 1.0 - abs(sin(q.x * 3.1 + sin(q.y * 2.4 + t * 1.25) + t * 0.95));
    float s2 = 1.0 - abs(sin(q.y * 3.4 - sin(q.x * 2.6 - t * 1.10) - t * 0.82));
    float s3 = 1.0 - abs(sin((q.x + q.y) * 2.35 + t * 1.40));
    float net = pow(clamp((s1 * s2 + s2 * s3) * 0.58, 0.0, 1.0), 2.6);
    return smoothstep(0.24, 0.72, net);
  }

  void main() {
    vec2 centered = (vUv - 0.5) * 2.0;
    float radialFade = 1.0 - smoothstep(0.42, 0.98, length(centered));
    float boxFade = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x))
                  * smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y));
    float mask = radialFade * boxFade;
    if (mask < 0.005) discard;

    vec2 wp = vWorldPos.xz * 1.45;
    float c1 = causticWave(wp, uTime);
    float c2 = causticWave(wp * 1.28 + vec2(2.4, -1.7), -uTime * 0.78 + 1.9);
    float lace = clamp(c1 * 0.72 + c2 * 0.48, 0.0, 1.0);

    // Slight anime cel lift on brightest caustic intersections
    float highlight = smoothstep(0.68, 0.78, lace);
    vec3 colAqua = vec3(0.46, 0.92, 0.90);
    vec3 colSun  = vec3(0.92, 0.99, 0.94);
    vec3 col = mix(colAqua, colSun, highlight);

    float intensity = (lace * 0.24 + highlight * 0.14) * mask * uCloudFactor;
    gl_FragColor = vec4(col * intensity, intensity);
  }
`;

// ---------------------------------------------------------------------------
// 5. Custom GLSL: Distant Drifting Sea Mist & Delicate Watercolor Rainbow
// ---------------------------------------------------------------------------

const MIST_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MIST_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;

  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    float envX = pow(sin(clamp(vUv.x, 0.0, 1.0) * 3.14159265), 1.65);
    float envY = smoothstep(0.0, 0.38, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));

    vec2 q = vec2(vUv.x * 3.2 - uTime * 0.07 + uSeed * 7.3, vUv.y * 2.1 + uSeed * 3.1);
    float fbm = noise2(q) * 0.62 + noise2(q * 2.1 + vec2(uTime * 0.05, 1.7)) * 0.38;
    float wisp = smoothstep(0.28, 0.82, fbm);

    vec3 mistCol = mix(vec3(0.84, 0.95, 0.97), vec3(0.97, 0.99, 1.00), vUv.y);
    float alpha = uOpacity * envX * envY * (0.45 + 0.55 * wisp);
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(mistCol, alpha);
  }
`;

const RAINBOW_VERTEX_SHADER = /* glsl */ `
  varying vec2 vLocalXY;
  varying vec3 vWorldPos;

  void main() {
    vLocalXY = position.xy;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const RAINBOW_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uInnerR;
  uniform float uOuterR;

  varying vec2 vLocalXY;
  varying vec3 vWorldPos;

  vec3 pastelRainbowSpectrum(float t) {
    // 7-band airy watercolor pastel spectrum: inner violet (t=0) -> outer rose-coral (t=1)
    vec3 c0 = vec3(0.80, 0.73, 0.96); // soft violet
    vec3 c1 = vec3(0.68, 0.78, 0.98); // pastel indigo-blue
    vec3 c2 = vec3(0.62, 0.90, 0.97); // airy sky-cyan
    vec3 c3 = vec3(0.67, 0.94, 0.79); // seafoam-mint green
    vec3 c4 = vec3(0.99, 0.95, 0.66); // sunlit lemon
    vec3 c5 = vec3(0.99, 0.82, 0.63); // soft apricot
    vec3 c6 = vec3(0.97, 0.70, 0.74); // delicate rose-coral

    float s = clamp(t, 0.0, 1.0) * 6.0;
    vec3 col = c0;
    col = mix(col, c1, smoothstep(0.0, 1.0, s));
    col = mix(col, c2, smoothstep(1.0, 2.0, s));
    col = mix(col, c3, smoothstep(2.0, 3.0, s));
    col = mix(col, c4, smoothstep(3.0, 4.0, s));
    col = mix(col, c5, smoothstep(4.0, 5.0, s));
    col = mix(col, c6, smoothstep(5.0, 6.0, s));
    return col * 1.06;
  }

  void main() {
    if (uStrength < 0.004) discard;

    float r = length(vLocalXY);
    float radialT = (r - uInnerR) / max(0.001, (uOuterR - uInnerR));
    if (radialT < 0.0 || radialT > 1.0) discard;

    float angle = atan(vLocalXY.y, vLocalXY.x); // [0, PI]

    // Softly feathered radial edges + airy watercolor ends
    float radialBell = smoothstep(0.0, 0.24, radialT) * (1.0 - smoothstep(0.76, 1.0, radialT));
    float endFeather = smoothstep(0.24, 0.92, angle) * (1.0 - smoothstep(2.22, 2.90, angle));
    float heightFade = smoothstep(1.05, 2.85, vWorldPos.y);

    float breath = 0.93 + 0.07 * sin(angle * 5.0 + uTime * 0.55);
    vec3 col = pastelRainbowSpectrum((radialT - 0.10) / 0.80);

    float alpha = 0.34 * uStrength * radialBell * endFeather * heightFade * breath;
    if (alpha < 0.003) discard;

    gl_FragColor = vec4(col, alpha);
  }
`;

// ---------------------------------------------------------------------------
// Geometry & Helper Builders
// ---------------------------------------------------------------------------

function normalizePoint(raw, fallbackY = 1.162, fallbackR = 0.45) {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    if (raw.length >= 3) {
      return { x: Number(raw[0]) || 0, y: Number(raw[1]) || fallbackY, z: Number(raw[2]) || 0, r: fallbackR };
    }
    if (raw.length === 2) {
      return { x: Number(raw[0]) || 0, y: fallbackY, z: Number(raw[1]) || 0, r: fallbackR };
    }
    return null;
  }
  const src = raw.pos || raw.position || raw;
  if (typeof src.x === "number" && typeof src.z === "number") {
    return {
      x: src.x,
      y: typeof src.y === "number" ? src.y : fallbackY,
      z: src.z,
      r: typeof raw.r === "number" ? raw.r : typeof raw.radius === "number" ? raw.radius : fallbackR,
      groundY: typeof raw.groundY === "number" ? raw.groundY : typeof raw.targetY === "number" ? raw.targetY : undefined,
    };
  }
  return null;
}

function isOpenHarborWater(x, z) {
  // Avoid spawning surface ripples right inside moored boat hulls or solid breakwater
  if (x < -0.85 || z < -1.35 || x > 11.75 || z > 11.75) return false;
  if (x > 7.85 && x < 9.75 && z < 4.35) return false; // Breakwater
  if (Math.abs(x - 2.1) < 1.95 && Math.abs(z - -0.35) < 0.85) return false; // Boat 0
  if (Math.abs(x - 6.0) < 1.75 && Math.abs(z - -0.40) < 0.80) return false; // Boat 1
  if (Math.abs(x - -0.1) < 0.80 && Math.abs(z - 2.25) < 1.45) return false; // Boat 2
  if (Math.abs(x - 3.9) < 1.30 && Math.abs(z - 2.55) < 0.70) return false; // Boat 3
  return true;
}

function createTeardropGeometry() {
  const geo = new THREE.SphereGeometry(0.026, 10, 8);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const t = THREE.MathUtils.clamp((y / 0.026 + 1.0) * 0.5, 0.0, 1.0); // 0 at bottom -> 1 at top
    const taper = 1.0 - 0.55 * Math.pow(t, 1.5);
    x *= taper * 0.92;
    z *= taper * 0.92;
    y *= t > 0.5 ? 1.75 : 1.25;
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function createCurvedMistRibbonGeometry(width, height, curveDepth = 0.55, segX = 24) {
  const geo = new THREE.PlaneGeometry(width, height, segX, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const nx = x / (width * 0.5); // [-1, 1]
    const zOffset = Math.sin(nx * Math.PI * 0.85) * curveDepth;
    pos.setZ(i, zOffset);
  }
  geo.computeVertexNormals();
  return geo;
}

function createSeagull({ perched = false, scale = 1.0 } = {}) {
  const root = new THREE.Group();
  root.scale.setScalar(scale);

  const whiteMat = toonMat(0xf9fcfd);
  const wingTipMat = toonMat(0x4b5e6d);
  const softGreyMat = toonMat(0xcfd9df);
  const beakMat = toonMat(0xf4a135);
  const eyeMat = toonMat(PALETTE.castIron);

  const bodyRig = new THREE.Group();
  if (perched) {
    // Perched gulls stand on slender legs so root Y = 0 sits cleanly on bollard/rail top
    bodyRig.position.y = 0.095;
    bodyRig.rotation.x = -0.14;
  }
  root.add(bodyRig);

  // Streamlined anime gull body
  const bodyGeo = new THREE.SphereGeometry(0.072, 12, 10);
  bodyGeo.scale(0.88, 0.84, 2.35);
  const bodyMesh = new THREE.Mesh(bodyGeo, whiteMat);
  addEdgeInk(bodyMesh, 38, PALETTE.inkOutline, 0.32);
  bodyRig.add(bodyMesh);

  // Tail fan
  const tailGeo = new THREE.BoxGeometry(0.105, 0.014, 0.115);
  const tailMesh = new THREE.Mesh(tailGeo, whiteMat);
  tailMesh.position.set(0, 0.014, -0.185);
  tailMesh.rotation.x = 0.12;
  addEdgeInk(tailMesh, 32, PALETTE.inkOutline, 0.34);
  bodyRig.add(tailMesh);

  // Articulated head + yellow-orange beak + bead eyes
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.052, 0.145);
  bodyRig.add(headPivot);

  const headGeo = new THREE.SphereGeometry(0.048, 10, 8);
  headGeo.scale(0.90, 0.96, 1.12);
  const headMesh = new THREE.Mesh(headGeo, whiteMat);
  headPivot.add(headMesh);

  const beakGeo = new THREE.ConeGeometry(0.015, 0.068, 7);
  beakGeo.rotateX(Math.PI * 0.5);
  const beakMesh = new THREE.Mesh(beakGeo, beakMat);
  beakMesh.position.set(0, -0.005, 0.072);
  headPivot.add(beakMesh);

  const eyeGeo = new THREE.SphereGeometry(0.0085, 6, 6);
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(0.034, 0.010, 0.026);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(-0.034, 0.010, 0.026);
  headPivot.add(leftEye, rightEye);

  let leftWingPivot = null;
  let rightWingPivot = null;
  let leftOuterPivot = null;
  let rightOuterPivot = null;

  if (!perched) {
    // Articulated hinged wings (inner wing + outer wingtip hinge with slate-grey tips)
    const buildWing = (dirSign) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(dirSign * 0.048, 0.028, 0.02);

      const innerGeo = new THREE.BoxGeometry(0.21, 0.014, 0.115);
      const innerMesh = new THREE.Mesh(innerGeo, whiteMat);
      innerMesh.position.set(dirSign * 0.105, 0.01, -0.005);
      innerMesh.rotation.z = dirSign * 0.08;
      innerMesh.rotation.y = -dirSign * 0.08;
      addEdgeInk(innerMesh, 30, PALETTE.inkOutline, 0.34);
      shoulder.add(innerMesh);

      const mantleGeo = new THREE.BoxGeometry(0.19, 0.008, 0.075);
      const mantleMesh = new THREE.Mesh(mantleGeo, softGreyMat);
      mantleMesh.position.set(dirSign * 0.10, 0.016, 0.005);
      mantleMesh.rotation.z = dirSign * 0.08;
      shoulder.add(mantleMesh);

      const outerPivot = new THREE.Group();
      outerPivot.position.set(dirSign * 0.205, 0.024, -0.012);
      shoulder.add(outerPivot);

      const midWingGeo = new THREE.BoxGeometry(0.115, 0.011, 0.088);
      const midWingMesh = new THREE.Mesh(midWingGeo, whiteMat);
      midWingMesh.position.set(dirSign * 0.055, -0.004, -0.015);
      midWingMesh.rotation.y = -dirSign * 0.22;
      outerPivot.add(midWingMesh);

      const tipGeo = new THREE.BoxGeometry(0.105, 0.009, 0.062);
      const tipMesh = new THREE.Mesh(tipGeo, wingTipMat);
      tipMesh.position.set(dirSign * 0.145, -0.010, -0.042);
      tipMesh.rotation.y = -dirSign * 0.36;
      addEdgeInk(tipMesh, 30, PALETTE.inkOutline, 0.36);
      outerPivot.add(tipMesh);

      bodyRig.add(shoulder);
      return { shoulder, outerPivot };
    };

    const lw = buildWing(1);
    const rw = buildWing(-1);
    leftWingPivot = lw.shoulder;
    leftOuterPivot = lw.outerPivot;
    rightWingPivot = rw.shoulder;
    rightOuterPivot = rw.outerPivot;
  } else {
    // Neatly folded wings + slender perched legs
    const buildFoldedWing = (dirSign) => {
      const wingPivot = new THREE.Group();
      wingPivot.position.set(dirSign * 0.052, 0.022, 0.04);

      const foldedMainGeo = new THREE.BoxGeometry(0.026, 0.068, 0.22);
      const foldedMain = new THREE.Mesh(foldedMainGeo, softGreyMat);
      foldedMain.position.set(dirSign * 0.008, -0.006, -0.095);
      foldedMain.rotation.x = -0.10;
      foldedMain.rotation.y = -dirSign * 0.08;
      addEdgeInk(foldedMain, 30, PALETTE.inkOutline, 0.34);
      wingPivot.add(foldedMain);

      const foldedTipGeo = new THREE.BoxGeometry(0.020, 0.036, 0.10);
      const foldedTip = new THREE.Mesh(foldedTipGeo, wingTipMat);
      foldedTip.position.set(-dirSign * 0.004, -0.008, -0.215);
      foldedTip.rotation.y = -dirSign * 0.14;
      wingPivot.add(foldedTip);

      bodyRig.add(wingPivot);
      return wingPivot;
    };

    leftWingPivot = buildFoldedWing(1);
    rightWingPivot = buildFoldedWing(-1);

    const legGeo = new THREE.CylinderGeometry(0.006, 0.005, 0.092, 6);
    const footGeo = new THREE.BoxGeometry(0.024, 0.006, 0.036);
    for (const dirSign of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, beakMat);
      leg.position.set(dirSign * 0.024, 0.046, 0.01);
      const foot = new THREE.Mesh(footGeo, beakMat);
      foot.position.set(dirSign * 0.024, 0.003, 0.022);
      root.add(leg, foot);
    }
  }

  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = false;
      child.raycast = () => {};
    }
  });

  return {
    root,
    bodyRig,
    headPivot,
    tailMesh,
    leftWingPivot,
    rightWingPivot,
    leftOuterPivot,
    rightOuterPivot,
  };
}

// ---------------------------------------------------------------------------
// Main Export: buildSunshowerAtmosphere(opts)
// ---------------------------------------------------------------------------

export function buildSunshowerAtmosphere(opts = {}) {
  const rng = mulberry32(20261112);
  const group = new THREE.Group();
  group.name = "SunshowerAtmosphere";

  let cloudFactor = 0.88;
  let rainbowStrength = 0.0;
  let manualRainbowTimer = 0.0;
  let autoRainbowActive = false;
  let rainFallDist = 0.0;
  let lastElapsed = 0.0;

  // =========================================================================
  // 1. Posterized Cel-Shaded Harbor Water (Main Bay + Slipway Water Pocket)
  // =========================================================================
  const waterUniforms = {
    uTime: { value: 0 },
    uCloudFactor: { value: cloudFactor },
    uRainbowStrength: { value: 0 },
  };

  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: WATER_VERTEX_SHADER,
    fragmentShader: WATER_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Main Harbor Bay: X in [-1.0, +12.0], Z in [-1.5, +12.0], Y = 0.0 (96 x 96 subdivisions)
  const bayGeo = new THREE.PlaneGeometry(13.0, 13.5, 96, 96);
  bayGeo.rotateX(-Math.PI / 2);
  bayGeo.translate(5.5, 0.0, 5.25);

  const bayWaterMesh = new THREE.Mesh(bayGeo, waterMat);
  bayWaterMesh.name = "HarborPosterizedWater";
  bayWaterMesh.renderOrder = 2;
  bayWaterMesh.raycast = () => {};
  group.add(bayWaterMesh);

  // Shallow Slipway Water Pocket: X in [-2.7, -1.0], Z in [+9.8, +12.0], Y = 0.0
  const slipGeo = new THREE.PlaneGeometry(1.7, 2.2, 16, 22);
  slipGeo.rotateX(-Math.PI / 2);
  slipGeo.translate(-1.85, 0.0, 10.9);

  const slipWaterMesh = new THREE.Mesh(slipGeo, waterMat);
  slipWaterMesh.name = "SlipwayWaterPocket";
  slipWaterMesh.renderOrder = 2;
  slipWaterMesh.raycast = () => {};
  group.add(slipWaterMesh);

  // =========================================================================
  // 2. Slanted Golden Sunshower Rain Streaks (450 streaks) + Ripples + Drips
  // =========================================================================
  const RAIN_COUNT = 450;
  const rainGeo = new THREE.BufferGeometry();
  const rainPositions = new Float32Array(RAIN_COUNT * 2 * 3);
  const rainAnchors = new Float32Array(RAIN_COUNT * 2 * 3);
  const rainPhases = new Float32Array(RAIN_COUNT * 2);
  const rainSpeeds = new Float32Array(RAIN_COUNT * 2);
  const rainLengths = new Float32Array(RAIN_COUNT * 2);
  const rainEnds = new Float32Array(RAIN_COUNT * 2);
  const rainTints = new Float32Array(RAIN_COUNT * 2);

  for (let i = 0; i < RAIN_COUNT; i += 1) {
    const ax = (rng() - 0.5) * 24.0;
    const ay = 0.1 + rng() * 13.4;
    const az = (rng() - 0.5) * 24.0;
    const phase = rng();
    const speed = 0.88 + rng() * 0.28;
    const len = 0.42 + rng() * 0.30;
    const tint = rng();

    for (let e = 0; e < 2; e += 1) {
      const idx = i * 2 + e;
      const i3 = idx * 3;
      // Populate bounding positions across diorama volume so frustum culling stays accurate
      rainPositions[i3 + 0] = ax;
      rainPositions[i3 + 1] = ay;
      rainPositions[i3 + 2] = az;

      rainAnchors[i3 + 0] = ax;
      rainAnchors[i3 + 1] = ay;
      rainAnchors[i3 + 2] = az;

      rainPhases[idx] = phase;
      rainSpeeds[idx] = speed;
      rainLengths[idx] = len;
      rainEnds[idx] = e; // 0 = upper tail, 1 = sunlit lower tip
      rainTints[idx] = tint;
    }
  }

  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
  rainGeo.setAttribute("aAnchor", new THREE.BufferAttribute(rainAnchors, 3));
  rainGeo.setAttribute("aPhase", new THREE.BufferAttribute(rainPhases, 1));
  rainGeo.setAttribute("aSpeed", new THREE.BufferAttribute(rainSpeeds, 1));
  rainGeo.setAttribute("aLength", new THREE.BufferAttribute(rainLengths, 1));
  rainGeo.setAttribute("aEnd", new THREE.BufferAttribute(rainEnds, 1));
  rainGeo.setAttribute("aTint", new THREE.BufferAttribute(rainTints, 1));
  rainGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6.8, 0), 20.0);

  const rainUniforms = {
    uFallDist: { value: 0.0 },
    uOpacity: { value: 0.42 },
    uCloudFactor: { value: cloudFactor },
  };

  const rainMat = new THREE.ShaderMaterial({
    uniforms: rainUniforms,
    vertexShader: RAIN_VERTEX_SHADER,
    fragmentShader: RAIN_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  });

  const rainStreaks = new THREE.LineSegments(rainGeo, rainMat);
  rainStreaks.name = "SunshowerRainStreaks";
  rainStreaks.renderOrder = 7;
  rainStreaks.raycast = () => {};
  group.add(rainStreaks);

  // --- Concentric Raindrop Ripples (40 pool: 28 harbor water + 12 pier puddles) ---
  const defaultPuddles = [
    { x: -2.45, y: 1.162, z: 3.35, r: 0.65 },
    { x: -2.65, y: 1.162, z: 6.75, r: 0.72 },
    { x: -4.85, y: 1.162, z: -0.95, r: 0.60 },
    { x: 1.65, y: 1.162, z: -2.55, r: 0.68 },
    { x: 6.15, y: 1.162, z: -2.45, r: 0.62 },
    { x: -3.25, y: 1.162, z: -4.75, r: 0.58 },
    { x: -7.40, y: 1.162, z: 1.85, r: 0.64 },
    { x: 9.75, y: 1.162, z: -3.15, r: 0.56 },
  ];

  const parsedPuddles = Array.isArray(opts.puddles)
    ? opts.puddles.map((p) => normalizePoint(p, 1.162, 0.55)).filter(Boolean)
    : [];
  const puddleSources = parsedPuddles.length > 0 ? parsedPuddles : defaultPuddles;

  const rippleRingGeo = new THREE.RingGeometry(0.82, 1.0, 24);
  rippleRingGeo.rotateX(-Math.PI / 2);

  const ripples = [];
  const WATER_RIPPLE_COUNT = 28;
  const PUDDLE_RIPPLE_COUNT = 12;
  const TOTAL_RIPPLES = WATER_RIPPLE_COUNT + PUDDLE_RIPPLE_COUNT;

  function placeRandomHarborRipple(rObj) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const rx = -0.6 + rng() * 12.1;
      const rz = -1.1 + rng() * 12.6;
      if (isOpenHarborWater(rx, rz)) {
        rObj.mesh.position.set(rx, 0.03, rz);
        return;
      }
    }
    rObj.mesh.position.set(3.2 + rng() * 4.5, 0.03, 4.5 + rng() * 5.0);
  }

  function placeRandomPuddleRipple(rObj) {
    const pud = puddleSources[Math.floor(rng() * puddleSources.length)];
    const angle = rng() * Math.PI * 2.0;
    const rad = rng() * Math.max(0.12, pud.r * 0.48);
    rObj.mesh.position.set(
      pud.x + Math.cos(angle) * rad,
      pud.y,
      pud.z + Math.sin(angle) * rad
    );
  }

  for (let i = 0; i < TOTAL_RIPPLES; i += 1) {
    const isPuddle = i >= WATER_RIPPLE_COUNT;
    const mat = new THREE.MeshBasicMaterial({
      color: isPuddle ? 0xf6fdff : PALETTE.seaFoam,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(rippleRingGeo, mat);
    mesh.renderOrder = 3;
    mesh.raycast = () => {};
    group.add(mesh);

    const rObj = {
      mesh,
      mat,
      isPuddle,
      age: rng() * 1.35,
      duration: 0.95 + rng() * 0.55,
      maxRadius: isPuddle ? 0.24 + rng() * 0.16 : 0.30 + rng() * 0.18,
      delay: rng() * 0.35,
    };

    if (isPuddle) {
      placeRandomPuddleRipple(rObj);
    } else {
      placeRandomHarborRipple(rObj);
    }
    ripples.push(rObj);
  }

  let splashCursor = 0;
  function triggerImpactRipple(x, y, z, maxR = 0.34) {
    const isWaterImpact = y < 0.5;
    const baseIdx = isWaterImpact
      ? splashCursor % WATER_RIPPLE_COUNT
      : WATER_RIPPLE_COUNT + (splashCursor % PUDDLE_RIPPLE_COUNT);
    splashCursor += 1;

    const rObj = ripples[baseIdx];
    rObj.mesh.position.set(x, y, z);
    rObj.age = 0.0;
    rObj.delay = 0.0;
    rObj.duration = 0.92;
    rObj.maxRadius = maxR;
  }

  // --- Occasional Falling Water Droplets (18 glistening 3D teardrop beads) ---
  const defaultDripPoints = [
    // Pier Lamp Hoods
    { x: -1.55, y: 3.52, z: 4.70, groundY: 1.162 },
    { x: -1.55, y: 3.52, z: -2.00, groundY: 1.162 },
    { x: 4.65, y: 3.52, z: -2.00, groundY: 1.162 },
    { x: 8.25, y: 3.52, z: -2.00, groundY: 1.162 },
    // Foreground Umbrella & Instrument Cases
    { x: -2.10, y: 2.28, z: 5.90, groundY: 1.162 },
    { x: -1.76, y: 2.22, z: 6.18, groundY: 1.162 },
    { x: -2.44, y: 2.22, z: 5.62, groundY: 1.162 },
    // Moored Boat Gunwales & Cabin Eaves (drop onto harbor water Y = 0.03)
    { x: 2.10, y: 1.62, z: 0.32, groundY: 0.03 },
    { x: 3.55, y: 0.74, z: 0.18, groundY: 0.03 },
    { x: 1.05, y: 0.70, z: 0.34, groundY: 0.03 },
    { x: 6.00, y: 1.56, z: 0.24, groundY: 0.03 },
    { x: 7.25, y: 0.70, z: 0.14, groundY: 0.03 },
    { x: 4.85, y: 0.68, z: 0.22, groundY: 0.03 },
    { x: 0.52, y: 0.66, z: 2.25, groundY: 0.03 },
    { x: 0.48, y: 0.66, z: 3.20, groundY: 0.03 },
    { x: 3.90, y: 0.64, z: 3.12, groundY: 0.03 },
    // Co-op Shed & Waiting Pavilion Front Eaves
    { x: 1.85, y: 3.42, z: -3.62, groundY: 1.162 },
    { x: 6.85, y: 3.24, z: -3.62, groundY: 1.162 },
  ];

  const parsedDrips = Array.isArray(opts.dripPoints)
    ? opts.dripPoints.map((d) => normalizePoint(d, 2.2, 0.05)).filter(Boolean)
    : [];
  const dripSources = parsedDrips.length > 0 ? [...parsedDrips, ...defaultDripPoints] : defaultDripPoints;

  const dropletGeo = createTeardropGeometry();
  const dropletMat = emissiveMat(0xfff6d2, 0.95, {
    transparent: true,
    opacity: 0.92,
  });

  const DROPLET_COUNT = 18;
  const droplets = [];

  function inferGroundY(x, z, explicitGroundY) {
    if (typeof explicitGroundY === "number") return explicitGroundY;
    const overMainBay = x > -0.96 && z > -1.46;
    const overSlipway = x > -2.70 && z > 9.80;
    return overMainBay || overSlipway ? 0.03 : 1.162;
  }

  function resetDroplet(dObj, initialStagger = false) {
    const src = dripSources[Math.floor(rng() * dripSources.length)];
    const jx = (rng() - 0.5) * 0.08;
    const jz = (rng() - 0.5) * 0.08;
    dObj.x = src.x + jx;
    dObj.startY = src.y;
    dObj.y = src.y;
    dObj.z = src.z + jz;
    dObj.groundY = inferGroundY(dObj.x, dObj.z, src.groundY);
    dObj.vy = 0.0;
    dObj.swellDuration = 0.35 + rng() * 0.35;
    dObj.waitTimer = initialStagger ? rng() * 3.4 : 0.45 + rng() * 2.2;
    dObj.state = "waiting";
    dObj.mesh.visible = false;
  }

  for (let i = 0; i < DROPLET_COUNT; i += 1) {
    const mesh = new THREE.Mesh(dropletGeo, dropletMat);
    mesh.renderOrder = 4;
    mesh.raycast = () => {};
    group.add(mesh);

    const dObj = {
      mesh,
      x: 0,
      y: 2,
      z: 0,
      startY: 2,
      groundY: 1.162,
      vy: 0,
      waitTimer: 0,
      swellDuration: 0.4,
      state: "waiting",
    };
    resetDroplet(dObj, true);
    droplets.push(dObj);
  }

  // =========================================================================
  // 3. Translucent Pale-Gold Sunshower Light Beams & Ceiling Water Caustics
  // =========================================================================
  const sunDownVec = new THREE.Vector3(-0.48, -0.78, -0.38).normalize();
  const upAxis = new THREE.Vector3(0, 1, 0);
  // Align local -Y along sunDownVec => local +Y points toward -sunDownVec (toward sun)
  const beamQuat = new THREE.Quaternion().setFromUnitVectors(upAxis, sunDownVec.clone().negate());

  const beamSpecs = [
    { target: [1.8, 3.6, -5.5], width: 1.95, length: 10.6, alpha: 0.068 },  // Co-op Shed clerestory
    { target: [2.2, 2.2, -0.3], width: 1.65, length: 10.2, alpha: 0.064 },  // Boat 0 wheelhouse
    { target: [5.9, 2.2, -0.3], width: 1.65, length: 10.2, alpha: 0.064 },  // Boat 1 wheelhouse
    { target: [-4.2, 3.2, 3.6], width: 1.85, length: 9.8, alpha: 0.062 },   // Fairytale Villa bay windows
    { target: [-2.1, 2.6, 5.9], width: 1.90, length: 10.4, alpha: 0.068 },  // Foreground instrument cases & umbrella
    { target: [8.6, 3.8, 3.2], width: 2.15, length: 10.8, alpha: 0.066 },   // Lighthouse & breakwater
  ];

  const beamMaterials = [];
  beamSpecs.forEach((spec, bIdx) => {
    const shaftGroup = new THREE.Group();
    const targetVec = new THREE.Vector3(spec.target[0], spec.target[1], spec.target[2]);
    // Shift shaft center slightly upward toward sun so target sits in lower-middle luminous zone
    shaftGroup.position.copy(targetVec).addScaledVector(sunDownVec, -spec.length * 0.22);
    shaftGroup.quaternion.copy(beamQuat);

    const planeGeo = new THREE.PlaneGeometry(spec.width, spec.length, 1, 8);
    const pAttr = planeGeo.attributes.position;
    for (let k = 0; k < pAttr.count; k += 1) {
      const py = pAttr.getY(k);
      const ny = py / spec.length + 0.5; // 0 at bottom -> 1 at top
      const spread = THREE.MathUtils.lerp(1.22, 0.72, ny);
      pAttr.setX(k, pAttr.getX(k) * spread);
    }
    planeGeo.computeVertexNormals();

    const bMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCloudFactor: { value: cloudFactor },
        uBeamSeed: { value: bIdx * 1.37 + 0.5 },
        uBaseAlpha: { value: spec.alpha },
      },
      vertexShader: BEAM_VERTEX_SHADER,
      fragmentShader: BEAM_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    beamMaterials.push(bMat);

    // 3 crossed double-sided planes at 0, 60, 120 deg -> soft volumetric shaft from any orbit angle
    for (let p = 0; p < 3; p += 1) {
      const planeMesh = new THREE.Mesh(planeGeo, bMat);
      planeMesh.rotation.y = (p * Math.PI) / 3.0;
      planeMesh.renderOrder = 8;
      planeMesh.raycast = () => {};
      shaftGroup.add(planeMesh);
    }
    group.add(shaftGroup);
  });

  // --- Animated Ceiling Water Caustics ---
  const causticUniforms = {
    uTime: { value: 0 },
    uCloudFactor: { value: cloudFactor },
  };

  const causticMat = new THREE.ShaderMaterial({
    uniforms: causticUniforms,
    vertexShader: CAUSTIC_VERTEX_SHADER,
    fragmentShader: CAUSTIC_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });

  const causticSpecs = [
    { name: "CoopShedCaustics", pos: [1.8, 3.68, -5.8], w: 4.4, d: 3.8 },
    { name: "WaitingPavilionCaustics", pos: [7.0, 3.445, -5.3], w: 3.4, d: 3.2 },
    { name: "Boat0CabinCaustics", pos: [2.0, 1.565, -0.35], w: 1.2, d: 0.9 },
    { name: "Boat1CabinCaustics", pos: [6.0, 1.505, -0.40], w: 1.2, d: 0.9 },
  ];

  causticSpecs.forEach((cs) => {
    const cGeo = new THREE.PlaneGeometry(cs.w, cs.d, 1, 1);
    cGeo.rotateX(Math.PI / 2);
    const cMesh = new THREE.Mesh(cGeo, causticMat);
    cMesh.name = cs.name;
    cMesh.position.set(cs.pos[0], cs.pos[1], cs.pos[2]);
    cMesh.renderOrder = 4;
    cMesh.raycast = () => {};
    group.add(cMesh);
  });

  // =========================================================================
  // 4. 3D Seagulls (4 Wheeling + 1 Low-Skimming + 2 Perched), Sea Mist & Rainbow
  // =========================================================================
  const wheelingSpecs = [
    { cx: 3.8, cy: 6.4, cz: 1.6, rx: 4.8, rz: 4.1, speed: 0.34, phase: 0.2, flapFreq: 5.4, dir: 1 },
    { cx: 5.2, cy: 7.3, cz: 3.4, rx: 5.6, rz: 4.6, speed: 0.28, phase: 2.1, flapFreq: 4.9, dir: -1 },
    { cx: 2.6, cy: 8.1, cz: -0.6, rx: 6.2, rz: 4.8, speed: 0.25, phase: 4.0, flapFreq: 5.1, dir: 1 },
    { cx: 6.1, cy: 6.0, cz: 4.2, rx: 4.4, rz: 3.9, speed: 0.37, phase: 5.3, flapFreq: 5.7, dir: -1 },
  ];

  const wheelingGulls = wheelingSpecs.map((spec) => {
    const rig = createSeagull({ perched: false, scale: 1.0 });
    group.add(rig.root);
    return { rig, spec };
  });

  // 1 Low-Skimming Gull swooping along a figure-8 arc down to Y = +0.55 over open water
  const skimmingGull = createSeagull({ perched: false, scale: 1.04 });
  group.add(skimmingGull.root);
  let skimRippleCooldown = 0.0;

  function evalSkimPos(t, outVec) {
    const u = t * 0.46;
    const x = 4.65 + Math.sin(u) * 2.75; // X in [1.90, 7.40] (clears Boat 2 & Breakwater)
    const z = 6.05 + Math.sin(2.0 * u) * 2.85; // Z in [3.20, 8.90] (open harbor bay)
    // Dips down to Y = +0.55 when swooping across foreground open water around u ~ 0.55
    const dipBell = Math.pow(0.5 + 0.5 * Math.cos(u - 0.58), 2.2);
    const y = 0.55 + (1.0 - dipBell) * 2.35;
    return outVec.set(x, y, z);
  }

  // 2 Perched 3D Seagulls
  const perchedSpecs = [
    { pos: [6.9, 1.54, -1.85], baseYaw: -0.65, phase: 0.0 },  // Bollard perch
    { pos: [-1.35, 1.54, 4.30], baseYaw: 1.25, phase: 4.7 },  // Pier rail perch
  ];

  const perchedGulls = perchedSpecs.map((spec) => {
    const rig = createSeagull({ perched: true, scale: 0.96 });
    rig.root.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
    rig.root.rotation.y = spec.baseYaw;
    group.add(rig.root);
    return { rig, spec };
  });

  // --- Distant Drifting Sea Mist (5 soft translucent ribbons) ---
  const mistSpecs = [
    { baseX: 4.0, y: 0.55, z: -9.2, w: 5.4, h: 0.72, speed: 0.24, opacity: 0.20, seed: 0.1 },
    { baseX: 7.4, y: 0.85, z: -10.1, w: 6.2, h: 0.88, speed: 0.19, opacity: 0.22, seed: 1.4 },
    { baseX: 9.8, y: 0.48, z: -9.6, w: 4.8, h: 0.68, speed: 0.27, opacity: 0.18, seed: 2.8 },
    { baseX: 5.6, y: 1.18, z: -11.1, w: 6.6, h: 0.96, speed: 0.16, opacity: 0.20, seed: 4.1 },
    { baseX: 8.6, y: 1.32, z: -11.5, w: 5.8, h: 0.84, speed: 0.21, opacity: 0.17, seed: 5.5 },
  ];

  const mistRibbons = mistSpecs.map((ms) => {
    const mGeo = createCurvedMistRibbonGeometry(ms.w, ms.h, 0.48, 22);
    const mMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: ms.seed },
        uOpacity: { value: ms.opacity },
      },
      vertexShader: MIST_VERTEX_SHADER,
      fragmentShader: MIST_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mMesh = new THREE.Mesh(mGeo, mMat);
    mMesh.position.set(ms.baseX, ms.y, ms.z);
    mMesh.rotation.y = -0.12;
    mMesh.renderOrder = 5;
    mMesh.raycast = () => {};
    group.add(mMesh);
    return { mesh: mMesh, mat: mMat, spec: ms };
  });

  // --- Rare Serendipitous Sunshower Rainbow ---
  const RAINBOW_INNER_R = 7.55;
  const RAINBOW_OUTER_R = 9.35;
  const rainbowGeo = new THREE.RingGeometry(
    RAINBOW_INNER_R,
    RAINBOW_OUTER_R,
    96,
    8,
    0.06 * Math.PI,
    0.88 * Math.PI
  );

  const rainbowUniforms = {
    uTime: { value: 0 },
    uStrength: { value: 0 },
    uInnerR: { value: RAINBOW_INNER_R },
    uOuterR: { value: RAINBOW_OUTER_R },
  };

  const rainbowMat = new THREE.ShaderMaterial({
    uniforms: rainbowUniforms,
    vertexShader: RAINBOW_VERTEX_SHADER,
    fragmentShader: RAINBOW_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const rainbowMesh = new THREE.Mesh(rainbowGeo, rainbowMat);
  rainbowMesh.name = "SunshowerRainbowArch";
  rainbowMesh.position.set(4.8, 0.8, -5.8);
  rainbowMesh.rotation.y = -0.22;
  rainbowMesh.renderOrder = 6;
  rainbowMesh.visible = false;
  rainbowMesh.raycast = () => {};
  group.add(rainbowMesh);

  // Reusable scratch vectors for zero-GC animation updates
  const tmpPos = new THREE.Vector3();
  const tmpNext = new THREE.Vector3();
  const tmpPrev = new THREE.Vector3();
  const tmpVel = new THREE.Vector3();
  const tmpAcc = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();

  function applyGullWingPose(rig, flapAngle, glideBlend) {
    // Mix active wingbeat with serene cambered gull-glide pose
    const shoulderZ = THREE.MathUtils.lerp(flapAngle, 0.14, glideBlend);
    const outerZ = THREE.MathUtils.lerp(-flapAngle * 0.55 - 0.12, -0.26, glideBlend);
    if (rig.leftWingPivot && rig.rightWingPivot) {
      rig.leftWingPivot.rotation.z = shoulderZ;
      rig.rightWingPivot.rotation.z = -shoulderZ;
    }
    if (rig.leftOuterPivot && rig.rightOuterPivot) {
      rig.leftOuterPivot.rotation.z = outerZ;
      rig.rightOuterPivot.rotation.z = -outerZ;
    }
  }

  // =========================================================================
  // Public API: triggerRainbow, getCloudFactor, isRainbowActive, update
  // =========================================================================

  function triggerRainbow() {
    manualRainbowTimer = 7.8;
    if (rainbowStrength < 0.06) {
      rainbowStrength = 0.06;
    }
    rainbowMesh.visible = true;
    rainbowUniforms.uStrength.value = rainbowStrength;
  }

  function getCloudFactor() {
    return cloudFactor;
  }

  function isRainbowActive() {
    return manualRainbowTimer > 0.0 || autoRainbowActive || rainbowStrength > 0.05;
  }

  function update(elapsed = 0, dt) {
    const rawDt = typeof dt === "number" ? dt : Math.max(0, elapsed - lastElapsed);
    const safeDt = Math.min(Math.max(rawDt, 0), 0.1);
    lastElapsed = elapsed;

    // 1. Drifting thin-cloud sunlight modulation (0.65 .. 1.05)
    const w1 = Math.sin(elapsed * 0.17 + 0.6) * 0.5 + 0.5;
    const w2 = Math.sin(elapsed * 0.073 + 2.1) * 0.5 + 0.5;
    const baseCloud = 0.65 + (w1 * 0.62 + w2 * 0.38) * 0.40;
    cloudFactor = Math.min(1.05, baseCloud + rainbowStrength * 0.07);

    // 2. Rare Serendipitous Rainbow Envelope (~7.5s once every 32s, plus manual trigger)
    if (manualRainbowTimer > 0.0) {
      manualRainbowTimer = Math.max(0.0, manualRainbowTimer - safeDt);
    }
    const cyclePos = (elapsed + 8.0) % 32.0; // First natural appearance around elapsed = 24s
    autoRainbowActive = cyclePos >= 0.0 && cyclePos < 7.5 && elapsed > 6.0;

    let targetRainbow = 0.0;
    if (manualRainbowTimer > 0.0) {
      targetRainbow = manualRainbowTimer < 1.8 ? manualRainbowTimer / 1.8 : 1.0;
    } else if (autoRainbowActive) {
      const fadeIn = THREE.MathUtils.smoothstep(cyclePos, 0.0, 1.8);
      const fadeOut = 1.0 - THREE.MathUtils.smoothstep(cyclePos, 5.6, 7.5);
      targetRainbow = fadeIn * fadeOut;
    }

    const rbRate = targetRainbow > rainbowStrength ? 1.35 : 0.95;
    rainbowStrength += (targetRainbow - rainbowStrength) * Math.min(1.0, safeDt * rbRate);
    if (rainbowStrength < 0.002 && targetRainbow === 0.0) {
      rainbowStrength = 0.0;
    }
    rainbowMesh.visible = rainbowStrength > 0.003;
    rainbowUniforms.uTime.value = elapsed;
    rainbowUniforms.uStrength.value = rainbowStrength;

    // 3. Harbor Water, God-Rays & Ceiling Caustics Uniforms
    waterUniforms.uTime.value = elapsed;
    waterUniforms.uCloudFactor.value = cloudFactor;
    waterUniforms.uRainbowStrength.value = rainbowStrength;

    causticUniforms.uTime.value = elapsed;
    causticUniforms.uCloudFactor.value = cloudFactor;

    for (let i = 0; i < beamMaterials.length; i += 1) {
      beamMaterials[i].uniforms.uTime.value = elapsed;
      beamMaterials[i].uniforms.uCloudFactor.value = cloudFactor;
    }

    // 4. Sunshower Rain Streaks (~9.5 m/s, softening opacity 0.42 -> 0.16 during rainbow)
    const rainSpeedScale = THREE.MathUtils.lerp(1.0, 0.78, rainbowStrength);
    rainFallDist += safeDt * 9.5 * rainSpeedScale;
    rainUniforms.uFallDist.value = rainFallDist;
    rainUniforms.uOpacity.value = THREE.MathUtils.lerp(0.42, 0.16, rainbowStrength);
    rainUniforms.uCloudFactor.value = cloudFactor;

    // 5. Concentric Raindrop Ripples (scale 0.04m -> maxRadius, fade 0.65 -> 0.0)
    const rainIntensity = THREE.MathUtils.lerp(1.0, 0.52, rainbowStrength);
    for (let i = 0; i < ripples.length; i += 1) {
      const rObj = ripples[i];
      if (rObj.delay > 0.0) {
        rObj.delay -= safeDt * rainIntensity;
        rObj.mesh.visible = false;
        continue;
      }

      rObj.age += safeDt;
      const prog = rObj.age / rObj.duration;
      if (prog >= 1.0) {
        rObj.age = 0.0;
        rObj.delay = (0.08 + rng() * 0.45) / Math.max(0.45, rainIntensity);
        rObj.duration = 0.90 + rng() * 0.55;
        rObj.maxRadius = rObj.isPuddle ? 0.22 + rng() * 0.16 : 0.28 + rng() * 0.20;
        if (rObj.isPuddle) {
          placeRandomPuddleRipple(rObj);
        } else {
          placeRandomHarborRipple(rObj);
        }
        rObj.mesh.visible = false;
      } else {
        rObj.mesh.visible = true;
        const radius = THREE.MathUtils.lerp(0.04, rObj.maxRadius, Math.pow(prog, 0.78));
        rObj.mesh.scale.setScalar(radius);
        rObj.mat.opacity = 0.65 * Math.pow(1.0 - prog, 1.35);
      }
    }

    // 6. Occasional Falling Water Droplets (gravity 9.8 m/s^2 + ripple splash on impact)
    for (let i = 0; i < droplets.length; i += 1) {
      const dObj = droplets[i];
      if (dObj.state === "waiting") {
        dObj.waitTimer -= safeDt * rainIntensity;
        if (dObj.waitTimer <= 0.0) {
          dObj.state = "swelling";
          dObj.waitTimer = 0.0;
          dObj.mesh.visible = true;
          dObj.mesh.position.set(dObj.x, dObj.startY, dObj.z);
          dObj.mesh.scale.setScalar(0.35);
        }
      } else if (dObj.state === "swelling") {
        dObj.waitTimer += safeDt;
        const sProg = Math.min(1.0, dObj.waitTimer / dObj.swellDuration);
        dObj.mesh.position.set(dObj.x, dObj.startY - sProg * 0.018, dObj.z);
        dObj.mesh.scale.setScalar(0.35 + sProg * 0.65);
        if (sProg >= 1.0) {
          dObj.state = "falling";
          dObj.y = dObj.startY - 0.018;
          dObj.vy = -0.25;
        }
      } else {
        dObj.vy -= 9.8 * safeDt;
        dObj.y += dObj.vy * safeDt;
        const stretch = Math.min(1.55, 1.0 + Math.abs(dObj.vy) * 0.075);
        dObj.mesh.scale.set(0.92, stretch, 0.92);
        dObj.mesh.position.set(dObj.x, dObj.y, dObj.z);

        if (dObj.y <= dObj.groundY) {
          triggerImpactRipple(dObj.x, dObj.groundY, dObj.z, dObj.groundY < 0.5 ? 0.36 : 0.24);
          resetDroplet(dObj, false);
        }
      }
    }

    // 7. 4 Wheeling Harbor Seagulls
    for (let i = 0; i < wheelingGulls.length; i += 1) {
      const { rig, spec } = wheelingGulls[i];
      const ang = elapsed * spec.speed * spec.dir + spec.phase;
      const eps = 0.04;
      const angNext = (elapsed + eps) * spec.speed * spec.dir + spec.phase;
      const angPrev = (elapsed - eps) * spec.speed * spec.dir + spec.phase;

      const calcOrbit = (a, out) => {
        const x = spec.cx + Math.cos(a) * spec.rx + Math.sin(a * 2.0) * 0.65;
        const z = spec.cz + Math.sin(a) * spec.rz + Math.cos(a * 2.0) * 0.55;
        const y = spec.cy + Math.sin(a * 1.5 + spec.phase) * 0.42;
        return out.set(x, y, z);
      };

      calcOrbit(ang, tmpPos);
      calcOrbit(angNext, tmpNext);
      calcOrbit(angPrev, tmpPrev);

      rig.root.position.copy(tmpPos);
      tmpVel.subVectors(tmpNext, tmpPrev);
      tmpTarget.copy(tmpPos).add(tmpVel);
      rig.root.lookAt(tmpTarget);

      // Smooth bank angle from lateral curvature
      tmpAcc.copy(tmpNext).add(tmpPrev).addScaledVector(tmpPos, -2.0);
      const bankSign = tmpVel.x * tmpAcc.z - tmpVel.z * tmpAcc.x;
      const bankAngle = THREE.MathUtils.clamp(bankSign * 9.5, -0.42, 0.42);
      rig.bodyRig.rotation.z = bankAngle;

      // Alternate gentle wingbeats with outstretched soaring glides
      const glideGate = THREE.MathUtils.smoothstep(Math.sin(elapsed * 0.68 + spec.phase * 1.7), -0.15, 0.45);
      const flap = Math.sin(elapsed * spec.flapFreq + spec.phase) * 0.52;
      applyGullWingPose(rig, flap, glideGate);
    }

    // 8. 1 Low-Skimming Seagull (swoops down to Y = +0.55 right over posterized water)
    const epsSkim = 0.035;
    evalSkimPos(elapsed, tmpPos);
    evalSkimPos(elapsed + epsSkim, tmpNext);
    evalSkimPos(elapsed - epsSkim, tmpPrev);

    skimmingGull.root.position.copy(tmpPos);
    tmpVel.subVectors(tmpNext, tmpPrev);
    tmpTarget.copy(tmpPos).add(tmpVel);
    skimmingGull.root.lookAt(tmpTarget);

    tmpAcc.copy(tmpNext).add(tmpPrev).addScaledVector(tmpPos, -2.0);
    const skimBank = THREE.MathUtils.clamp((tmpVel.x * tmpAcc.z - tmpVel.z * tmpAcc.x) * 8.0, -0.52, 0.52);
    skimmingGull.bodyRig.rotation.z = skimBank;

    // Glide gracefully when skimming low over water, flap gently while climbing
    const climbFactor = THREE.MathUtils.smoothstep(tmpNext.y - tmpPos.y, -0.005, 0.025);
    const lowSkimGlide = THREE.MathUtils.clamp(1.0 - climbFactor * 0.85, 0.15, 0.96);
    const skimFlap = Math.sin(elapsed * 6.4) * 0.56;
    applyGullWingPose(skimmingGull, skimFlap, lowSkimGlide);

    skimRippleCooldown = Math.max(0.0, skimRippleCooldown - safeDt);
    if (tmpPos.y < 0.64 && skimRippleCooldown <= 0.0 && isOpenHarborWater(tmpPos.x, tmpPos.z)) {
      triggerImpactRipple(tmpPos.x, 0.03, tmpPos.z, 0.44);
      skimRippleCooldown = 0.42;
    }

    // 9. 2 Perched 3D Seagulls (curious head turns + periodic folded-wing ruffle)
    for (let i = 0; i < perchedGulls.length; i += 1) {
      const { rig, spec } = perchedGulls[i];
      const lookWave = Math.sin(elapsed * 0.85 + spec.phase) + 0.45 * Math.sin(elapsed * 2.3 + spec.phase * 1.3);
      rig.headPivot.rotation.y = THREE.MathUtils.clamp(lookWave * 0.36, -0.52, 0.52);
      rig.headPivot.rotation.x = Math.sin(elapsed * 1.15 + spec.phase) * 0.08;

      const ruffleCycle = (elapsed + spec.phase * 2.1) % 10.5;
      if (ruffleCycle < 1.1) {
        const env = Math.sin((ruffleCycle / 1.1) * Math.PI);
        const flutter = Math.abs(Math.sin(ruffleCycle * 18.0)) * env;
        rig.leftWingPivot.rotation.z = flutter * 0.32;
        rig.rightWingPivot.rotation.z = -flutter * 0.32;
        rig.leftWingPivot.rotation.x = flutter * 0.14;
        rig.rightWingPivot.rotation.x = flutter * 0.14;
        rig.tailMesh.rotation.x = 0.12 + env * 0.16;
      } else {
        rig.leftWingPivot.rotation.set(0, 0, 0);
        rig.rightWingPivot.rotation.set(0, 0, 0);
        rig.tailMesh.rotation.x = 0.12 + Math.sin(elapsed * 1.4 + spec.phase) * 0.03;
      }
    }

    // 10. Distant Drifting Sea Mist Ribbons (X in [2.5, 11.5], Z in [-11.6, -8.8])
    for (let i = 0; i < mistRibbons.length; i += 1) {
      const { mesh, mat, spec } = mistRibbons[i];
      mat.uniforms.uTime.value = elapsed;
      const driftSpan = 9.0; // X spans [2.5, 11.5]
      const rawX = (spec.baseX - 2.5 + elapsed * spec.speed) % driftSpan;
      const xPos = 2.5 + rawX;
      const edgeFade = Math.sin((rawX / driftSpan) * Math.PI);
      mesh.position.x = xPos;
      mesh.position.y = spec.y + Math.sin(elapsed * 0.32 + spec.seed) * 0.06;
      mat.uniforms.uOpacity.value = spec.opacity * (0.35 + 0.65 * edgeFade);
    }
  }

  // Initialize uniforms & transforms cleanly for frame 0
  update(0, 0.016);

  return {
    group,
    update,
    triggerRainbow,
    getCloudFactor,
    isRainbowActive,
  };
}
