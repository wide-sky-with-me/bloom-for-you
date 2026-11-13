// 《鸢尾湾·花与海之约》 — 海景花墅、莫奈花园与群岛海湾庄园
// Realistic PBR Naturalism + Monet Garden Palette + Golden Hour / Moonlit Night + Offline-Ready Architecture.

import {
  THREE,
  clamp,
  lerp,
  POND_CONFIG,
  SWING_CONFIG,
  clearNavigationRegistry,
  isPositionWalkable,
} from "./modules/pbr-kit.js";
import {
  createExplorationControls,
  findNearestWalkableSpot,
} from "./modules/exploration-controls.js";
import {
  SUN_DIRECTION,
  MOON_DIRECTION,
  createRealisticSkyEnvironment,
  buildRealisticOceanAndSky,
} from "./modules/realistic-ocean-sky.js";
import { buildHarborAndEstate } from "./modules/harbor-and-estate.js";
import { buildCoastalVilla } from "./modules/coastal-villa.js";
import { buildBotanicalFlora } from "./modules/botanical-flora.js";
import { buildSecretGardensAndPond } from "./modules/secret-gardens-and-pond.js";
import { buildDistantHorizon } from "./modules/distant-horizon.js";
import { resolveGiftConfig } from "./modules/gift-config.js";
import { createHarborAudio } from "./audio.js";
import { preloadCoupleParts } from "./modules/couple-characters.js";
import { createCoupleMode } from "./modules/couple-mode.js";

function populateLetterModal(gift) {
  if (!gift) return;
  const recEl = document.getElementById("letter-recipient");
  const salEl = document.getElementById("letter-salutation");
  const bodyEl = document.getElementById("letter-body");
  const sigEl = document.getElementById("letter-signature");
  const dateEl = document.getElementById("letter-date");

  if (gift.title) {
    document.title = gift.subtitle ? `《${gift.title}》 · ${gift.subtitle}` : `《${gift.title}》`;
  }
  if (recEl && gift.recipient) recEl.textContent = `致${gift.recipient}`;
  if (salEl && gift.salutation) salEl.textContent = gift.salutation;
  if (sigEl && gift.signature) sigEl.textContent = gift.signature;
  if (dateEl) dateEl.textContent = gift.date || "";
  if (bodyEl && Array.isArray(gift.letter)) {
    bodyEl.innerHTML = "";
    gift.letter.forEach((para) => {
      const p = document.createElement("p");
      p.textContent = para;
      bodyEl.appendChild(p);
    });
  }
}

function setLoadingProgress(ratio, statusText) {
  const pct = Math.round(clamp(ratio, 0, 1) * 100);
  const fillEl = document.getElementById("loading-bar-fill");
  const pctEl = document.getElementById("loading-pct");
  const statusEl = document.getElementById("loading-status");
  if (fillEl) fillEl.style.width = `${pct}%`;
  if (pctEl) pctEl.textContent = `${pct}%`;
  if (statusEl && statusText) statusEl.textContent = statusText;
}

function hideLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (!overlay) return;
  overlay.classList.add("is-fading");
  setTimeout(() => {
    overlay.hidden = true;
  }, 420);
}

async function init() {
  const canvas = document.getElementById("diorama-canvas");
  const letterModal = document.getElementById("letter-modal");
  const letterClose = document.getElementById("letter-close");
  const exploreBar = document.getElementById("explore-bar");
  const exploreHint = document.getElementById("explore-hint");
  const btnLetter = document.getElementById("btn-letter");
  const btnPause = document.getElementById("btn-pause");
  const btnDayNight = document.getElementById("btn-daynight");
  const btnReset = document.getElementById("btn-reset");
  const debugHud = document.getElementById("debug-hud");

  setLoadingProgress(0.1, "正在初始化物理光照与海湾天空…");
  clearNavigationRegistry();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  const gl = renderer.getContext();
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const gpuRendererName = String(
    (dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || "WebGL2"
  );
  const isSoftware = /SwiftShader|llvmpipe|Software/i.test(gpuRendererName);

  renderer.setPixelRatio(isSoftware ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  if (isSoftware) {
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
  }

  const fogColorHex = 0xefd7be;
  const fogDensity = 0.00064;
  renderer.setClearColor(fogColorHex, 1);

  const scene = new THREE.Scene();
  scene.environment = createRealisticSkyEnvironment(renderer);
  scene.environmentIntensity = 0.72;
  scene.fog = new THREE.FogExp2(fogColorHex, fogDensity);

  const isPortrait = window.innerWidth < window.innerHeight;
  const camera = new THREE.PerspectiveCamera(
    isPortrait ? 62 : 52,
    window.innerWidth / Math.max(1, window.innerHeight),
    0.14,
    2200
  );

  // Warm Golden Hour angled sunlight + Mediterranean sage/limestone hemisphere fill
  const hemiLight = new THREE.HemisphereLight(0xfce6ce, 0x6d8167, 1.02);
  hemiLight.position.set(0, 80, 0);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xffdca8, 2.45);
  sunLight.position.copy(SUN_DIRECTION).multiplyScalar(140);
  sunLight.castShadow = true;
  const shadowMapDim = isSoftware ? 1024 : 2048;
  sunLight.shadow.mapSize.set(shadowMapDim, shadowMapDim);
  sunLight.shadow.camera.near = 25;
  sunLight.shadow.camera.far = 290;
  // Tightly focused on foreground & midground core estate (Section 七.5)
  const shadowExtent = 86;
  sunLight.shadow.camera.left = -shadowExtent;
  sunLight.shadow.camera.right = shadowExtent;
  sunLight.shadow.camera.top = shadowExtent;
  sunLight.shadow.camera.bottom = -shadowExtent;
  sunLight.shadow.bias = -0.00035;
  sunLight.shadow.normalBias = 0.03;
  scene.add(sunLight);

  // Build World Subsystems with concise loading progress updates
  const worldRoot = new THREE.Group();
  worldRoot.name = "IrisBayCoastalEstateWorld";
  scene.add(worldRoot);

  const oceanSky = buildRealisticOceanAndSky({ fogColor: fogColorHex, fogDensity });
  worldRoot.add(oceanSky.group);
  setLoadingProgress(0.22, "正在构建群岛海湾、对岸石屋小镇与环湾山脉…");

  const distantHorizon = buildDistantHorizon();
  worldRoot.add(distantHorizon.group);
  setLoadingProgress(0.36, "正在铺设蜿蜒半岛、花岗岩码头、金色沙滩与亲水木栈道…");

  const estate = buildHarborAndEstate();
  worldRoot.add(estate.group);
  setLoadingProgress(0.5, "正在建造可步入海景花墅与室内陈设…");

  const villa = buildCoastalVilla();
  worldRoot.add(villa.group);
  setLoadingProgress(0.64, "正在栽植莫奈花园玫瑰、鸢尾、绣球与坡地草甸…");

  const flora = buildBotanicalFlora();
  worldRoot.add(flora.group);

  const [secretGardens] = await Promise.all([
    buildSecretGardensAndPond({
      villaGroup: villa.group,
      onProgress(ratio) {
        setLoadingProgress(0.68 + ratio * 0.28, "正在唤醒叠石瀑布、海蚀岩礁、双人建模与繁花秋千…");
      },
    }),
    preloadCoupleParts(),
    estate.loadCoastalPhotogrammetry(),
  ]);
  worldRoot.add(secretGardens.group);

  // Build explicit raycast target whitelist (Section 七.8):
  // Only interactive proxies + walkable Peninsula/Villa/Boardwalk surfaces; never distant horizon, sky, ocean, or 29k flora instances.
  const raycastTargets = [];
  const raycastSet = new Set();
  const addRayTarget = (obj) => {
    if (obj && !raycastSet.has(obj)) {
      raycastSet.add(obj);
      raycastTargets.push(obj);
    }
  };
  worldRoot.traverse((obj) => {
    if (obj.userData && obj.userData.interactive) {
      addRayTarget(obj);
    }
  });
  addRayTarget(villa.group);
  for (const child of estate.group.children) {
    if (
      child.name === "CoastalTerrainAndHorizon" ||
      child.name === "CourtyardAndTrails" ||
      child.name === "HarborQuayAndBoathouse" ||
      child.name === "NorthCreekAndArchedBridge" ||
      child.name === "GoldenBeachAndBoardwalk" ||
      child.name === "CliffsideMarbleGazebo"
    ) {
      addRayTarget(child);
    }
  }

  let activePresetName = "aerialOverlook";
  function markActivePill(presetName) {
    activePresetName = presetName || "";
    if (!exploreBar) return;
    exploreBar.querySelectorAll(".explore-pill[data-preset]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.preset === activePresetName);
    });
  }

  const controls = createExplorationControls(camera, canvas, {
    isPortrait,
    onModeChange(nextMode) {
      if (exploreHint) {
        exploreHint.textContent =
          nextMode === "aerial"
            ? "点哪看哪 · 双击深入漫步 · 拖拽旋转 · 右键平移 · 滚轮缩放"
            : "WASD / 点击地面自由漫步 · 点哪看哪 · 按 Esc 返回全景";
      }
      if (nextMode === "aerial") {
        markActivePill("aerialOverlook");
      }
    },
  });

  // Centralized Gift Config & Tactile Letter Modal with Pre-Open Camera/Control Restoration
  const audio = createHarborAudio();
  const giftData = await resolveGiftConfig();
  populateLetterModal(giftData);

  // 小贤贤 & 小冉子 — controllable couple (first / second / third person)
  const couple = createCoupleMode({
    scene: worldRoot,
    camera,
    canvas,
    audio,
    sources: [villa, estate, secretGardens, flora],
    ui: {
      panel: document.getElementById("couple-panel"),
      prompt: document.getElementById("couple-prompt"),
      toast: document.getElementById("couple-toast"),
      enterBtn: document.getElementById("btn-couple"),
    },
    onActiveChange(on) {
      controls.setEnabled(!on);
      document.body.classList.toggle("is-couple-mode", on);
      if (exploreHint) {
        exploreHint.textContent = on
          ? "WASD 走 · Shift 跑 · 拖拽转视角 · E 互动 · F 牵手 · V 视角 · Tab 换人 · Esc 退出"
          : controls.getMode() === "aerial"
            ? "点哪看哪 · 双击深入漫步 · 拖拽旋转 · 右键平移 · 滚轮缩放"
            : "WASD / 点击地面自由漫步 · 点哪看哪 · 按 Esc 返回全景";
      }
      if (!on) markActivePill(controls.getMode() === "aerial" ? "aerialOverlook" : "");
    },
  });
  addRayTarget(couple.xian.root);
  addRayTarget(couple.ran.root);
  document.getElementById("btn-couple")?.addEventListener("click", (e) => {
    e.stopPropagation();
    audio.unlock();
    if (couple.isActive()) couple.exit();
    else {
      closeLetterModal({ restoreState: false });
      couple.enter();
    }
  });
  window.addEventListener("bloom:open-letter", () => {
    openLetterModal({ saveState: true });
    audio.playLetterUnfold();
  });

  let preLetterSnapshot = null;
  let preLetterPreset = "aerialOverlook";
  let autoOpenedNearDesk = false;

  function openLetterModal({ saveState = true } = {}) {
    if (!letterModal) return;
    if (letterModal.hidden && saveState) {
      preLetterSnapshot = controls.getStateSnapshot();
      preLetterPreset = activePresetName;
    }
    letterModal.hidden = false;
    btnLetter?.classList.add("is-active");
  }

  function closeLetterModal({ restoreState = true } = {}) {
    if (!letterModal || letterModal.hidden) return;
    letterModal.hidden = true;
    btnLetter?.classList.remove("is-active");
    if (restoreState && preLetterSnapshot) {
      controls.restoreStateSnapshot(preLetterSnapshot);
      markActivePill(preLetterPreset);
    }
    preLetterSnapshot = null;
  }

  btnLetter?.addEventListener("click", (e) => {
    e.stopPropagation();
    audio.unlock();
    if (letterModal && !letterModal.hidden) {
      closeLetterModal({ restoreState: true });
    } else {
      openLetterModal({ saveState: true });
      audio.playLetterUnfold();
    }
  });

  letterClose?.addEventListener("click", () => closeLetterModal({ restoreState: true }));
  letterModal?.addEventListener("click", (e) => {
    if (e.target === letterModal) closeLetterModal({ restoreState: true });
  });

  // Scenic Camera Presets
  const CAMERA_PRESETS = {
    aerialOverlook: {
      type: "aerial",
      target: [-4.5, 2.8, 9.2],
      radius: isPortrait ? 76.0 : 66.0,
      phi: 1.0,
      theta: 0.3,
    },
    pondWaterfallWalk: {
      type: "walk",
      x: -0.55,
      z: 20.55,
      yaw: 0.04,
      pitch: -0.46,
      eyeHeight: 0.88,
    },
    pondFishShrimpCloseup: {
      type: "walk",
      x: -0.55,
      z: 20.55,
      yaw: 0.04,
      pitch: -0.5,
      eyeHeight: 0.84,
    },
    coupleSwingWalk: {
      type: "walk",
      x: -28.5,
      z: 18.7,
      yaw: 0.0,
      pitch: -0.01,
      eyeHeight: 1.45,
    },
    beachBoardwalkWalk: {
      type: "walk",
      x: -11.8,
      z: 29.8,
      yaw: -2.08,
      pitch: -0.1,
      eyeHeight: 1.54,
    },
    monetPathWalk: {
      type: "walk",
      x: -14.0,
      z: 21.8,
      yaw: 0.0,
      pitch: 0.03,
      eyeHeight: 1.65,
    },
    courtyardWalk: { type: "walk", x: -14.0, z: 13.8, yaw: 0.0, pitch: 0.04 },
    villaLivingWalk: {
      type: "walk",
      x: -14.2,
      z: 2.65,
      yaw: 0.99,
      pitch: -0.04,
      eyeHeight: 1.62,
      floorY: 2.6,
    },
    villaMasterWalk: {
      type: "walk",
      x: -14.4,
      z: -1.6,
      yaw: 0.49,
      pitch: -0.05,
      eyeHeight: 1.6,
      floorY: 6.12,
    },
    villaStudyWalk: {
      type: "walk",
      x: -8.55,
      z: -6.45,
      yaw: -0.62,
      pitch: -0.11,
      eyeHeight: 1.54,
      floorY: 2.6,
    },
    gazeboFlowerWalk: { type: "walk", x: -51.5, z: 31.8, yaw: 2.26, pitch: 0.01 },
    harborPierWalk: { type: "walk", x: 34.0, z: 4.5, yaw: -1.32, pitch: -0.02 },
    creekBridgeWalk: { type: "walk", x: 1.5, z: -34.5, yaw: -0.45, pitch: 0.05 },
    cottagesHillsideWalk: { type: "walk", x: -13.2, z: -66.2, yaw: 0.32, pitch: -0.04, eyeHeight: 1.78 },
    aerialEstateOverview: {
      type: "aerial",
      target: [-6.0, 3.0, 4.0],
      radius: 122.0,
      phi: 1.04,
      theta: 0.56,
    },
    mobileOverview: {
      type: "aerial",
      target: [-13.5, 2.8, 11.2],
      radius: 68.0,
      phi: 0.98,
      theta: 0.22,
    },
  };

  function setCameraPreset(name, { smooth = false } = {}) {
    const p = CAMERA_PRESETS[name];
    if (!p) return false;
    if (p.type === "walk") {
      if (smooth) {
        controls.diveToWalk(p.x, p.z, p.yaw, p.pitch, {
          eyeHeight: p.eyeHeight ?? 1.68,
          floorY: p.floorY ?? null,
        });
      } else {
        controls.teleportWalk(
          p.x,
          p.z,
          p.yaw,
          p.pitch,
          p.eyeHeight ?? 1.68,
          p.floorY ?? null
        );
      }
    } else if (smooth) {
      controls.flyToAerial(p.target, p.radius, p.phi, p.theta);
    } else {
      controls.setAerialImmediate(p.target, p.radius, p.phi, p.theta);
    }
    markActivePill(name);
    return true;
  }

  exploreBar?.querySelectorAll(".explore-pill[data-preset]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      audio.unlock();
      const preset = btn.dataset.preset;
      if (couple.isActive()) couple.exit();
      if (preset) setCameraPreset(preset, { smooth: true });
    });
  });

  // Golden Hour <-> Moonlit Night State & Smooth Interpolation
  const _daySunCol = new THREE.Color(0xffdca8);
  const _nightMoonCol = new THREE.Color(0x9ec2ee);
  const _dayHemiSky = new THREE.Color(0xfce6ce);
  const _nightHemiSky = new THREE.Color(0x3a5682);
  const _dayHemiGround = new THREE.Color(0x6d8167);
  const _nightHemiGround = new THREE.Color(0x23313e);
  const _lightDir = new THREE.Vector3();

  let nightMix = 0.0;
  let targetNightMix = 0.0;

  function applyNightMix(mix) {
    nightMix = clamp(mix, 0, 1);
    _lightDir.copy(SUN_DIRECTION).lerp(MOON_DIRECTION, nightMix).normalize();
    sunLight.position.copy(_lightDir).multiplyScalar(140);
    sunLight.color.copy(_daySunCol).lerp(_nightMoonCol, nightMix);
    sunLight.intensity = lerp(2.45, 0.96, nightMix);

    hemiLight.color.copy(_dayHemiSky).lerp(_nightHemiSky, nightMix);
    hemiLight.groundColor.copy(_dayHemiGround).lerp(_nightHemiGround, nightMix);
    hemiLight.intensity = lerp(1.02, 0.64, nightMix);

    renderer.toneMappingExposure = lerp(1.04, 0.96, nightMix);
    scene.environmentIntensity = lerp(0.72, 0.28, nightMix);

    oceanSky.setNightMix?.(nightMix);
    distantHorizon.setNightMix?.(nightMix);
    estate.setNightMix?.(nightMix);
    villa.setNightMix?.(nightMix);
    secretGardens.setNightMix?.(nightMix);

    const fogCol = oceanSky.getFogColor ? oceanSky.getFogColor() : null;
    if (fogCol) {
      scene.fog.color.copy(fogCol);
      renderer.setClearColor(fogCol, 1);
    }
    if (isSoftware) {
      renderer.shadowMap.needsUpdate = true;
    }
  }

  function updateDayNightUI() {
    const isNight = targetNightMix > 0.5;
    if (btnDayNight) {
      btnDayNight.textContent = isNight ? "傍晚" : "夜景";
      btnDayNight.setAttribute("aria-pressed", isNight ? "true" : "false");
    }
  }

  function setDayNight(mode, { immediate = false } = {}) {
    targetNightMix = mode === "night" || mode === true ? 1.0 : 0.0;
    updateDayNightUI();
    if (immediate) {
      applyNightMix(targetNightMix);
    }
    return targetNightMix > 0.5 ? "night" : "day";
  }

  btnDayNight?.addEventListener("click", (e) => {
    e.stopPropagation();
    audio.unlock();
    setDayNight(targetNightMix > 0.5 ? "day" : "night");
  });

  // Unified Simulation Time & Pause / Resume (Camera & UI remain active when paused!)
  let simTime = 0.0;
  let simPaused = false;

  function updatePauseUI() {
    if (btnPause) {
      btnPause.textContent = simPaused ? "运行" : "暂停";
      btnPause.setAttribute("aria-pressed", simPaused ? "true" : "false");
    }
  }

  function setSimPaused(next) {
    simPaused = Boolean(next);
    updatePauseUI();
    return simPaused;
  }

  btnPause?.addEventListener("click", (e) => {
    e.stopPropagation();
    audio.unlock();
    setSimPaused(!simPaused);
  });

  // Deterministic World Reset (Section 六)
  function resetWorld() {
    closeLetterModal({ restoreState: false });
    preLetterSnapshot = null;
    autoOpenedNearDesk = false;
    setSimPaused(false);
    setDayNight("day", { immediate: true });
    simTime = 0.0;
    oceanSky.reset?.();
    distantHorizon.reset?.();
    estate.reset?.();
    villa.reset?.();
    flora.reset?.();
    secretGardens.reset?.();
    setCameraPreset("aerialOverlook", { smooth: false });
    if (isSoftware) {
      renderer.shadowMap.needsUpdate = true;
    }
  }

  btnReset?.addEventListener("click", (e) => {
    e.stopPropagation();
    audio.unlock();
    resetWorld();
  });

  // Quality Tiers & Default-Hidden Debug HUD (` or F3 or ?debug=1)
  let qualityMode = "auto";
  let activeQualityTier = "high";
  const tierLabelMap = { high: "高", medium: "中", low: "低" };

  function applyQualityTier(tier) {
    activeQualityTier = tier === "low" || tier === "medium" ? tier : "high";
    const maxDpr = activeQualityTier === "low" ? 1.0 : activeQualityTier === "medium" ? 1.35 : 2.0;
    renderer.setPixelRatio(isSoftware ? 1 : Math.min(window.devicePixelRatio || 1, maxDpr));
    renderer.setSize(window.innerWidth, window.innerHeight, false);

    sunLight.castShadow = activeQualityTier !== "low";
    oceanSky.setQualityTier?.(activeQualityTier);
    distantHorizon.setQualityTier?.(activeQualityTier);
    flora.setQualityTier?.(activeQualityTier);
    secretGardens.setQualityTier?.(activeQualityTier);

    if (isSoftware) {
      renderer.shadowMap.needsUpdate = true;
    }
    updateDebugHudUI();
  }

  function setQuality(mode) {
    if (mode === "auto") {
      qualityMode = "auto";
      applyQualityTier("high");
    } else if (mode === "high" || mode === "medium" || mode === "low") {
      qualityMode = mode;
      applyQualityTier(mode);
    }
    debugHud?.querySelectorAll(".debug-tier-btn").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.quality === qualityMode);
    });
    updateDebugHudUI();
    return { qualityMode, activeQualityTier };
  }

  let measuredFps = 60;
  let fpsFrameAcc = 0;
  let fpsTimeAcc = 0;

  function updateDebugHudUI() {
    if (!debugHud || debugHud.hidden) return;
    const fpsEl = document.getElementById("dbg-fps");
    const callsEl = document.getElementById("dbg-calls");
    const trisEl = document.getElementById("dbg-tris");
    const tierEl = document.getElementById("dbg-tier");
    if (fpsEl) {
      fpsEl.textContent = measuredFps >= 10 ? String(Math.round(measuredFps)) : measuredFps.toFixed(1);
    }
    if (callsEl) callsEl.textContent = String(renderer.info.render.calls);
    if (trisEl) trisEl.textContent = renderer.info.render.triangles.toLocaleString();
    if (tierEl) {
      const base = tierLabelMap[activeQualityTier] || "高";
      tierEl.textContent = qualityMode === "auto" ? `${base} (自动)` : base;
    }
  }

  function toggleDebugHud(forceState) {
    if (!debugHud) return false;
    debugHud.hidden = typeof forceState === "boolean" ? !forceState : !debugHud.hidden;
    updateDebugHudUI();
    return !debugHud.hidden;
  }

  debugHud?.querySelectorAll(".debug-tier-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.dataset.quality) setQuality(btn.dataset.quality);
    });
  });

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "1") {
      toggleDebugHud(true);
    }
  } catch {
    // Ignore URL parsing issues under non-standard environments
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (letterModal && !letterModal.hidden) {
        closeLetterModal({ restoreState: true });
      } else if (couple.isActive()) {
        couple.exit();
      } else if (controls.getMode() !== "aerial") {
        controls.flyToAerial(
          [-4.5, 2.8, 9.2],
          window.innerWidth < window.innerHeight ? 76.0 : 66.0,
          1.0,
          0.3
        );
        markActivePill("aerialOverlook");
      }
    } else if (e.key === "`" || e.key === "~" || e.key === "F3") {
      e.preventDefault();
      toggleDebugHud();
    } else if (e.code === "Space" && document.activeElement === document.body && !couple.isActive()) {
      e.preventDefault();
      setSimPaused(!simPaused);
    }
  });

  // Subtle auto-dimming of bottom capsule when pointer is idle
  let idleTimer = null;
  function bumpCapsuleActivity() {
    if (!exploreBar) return;
    exploreBar.classList.remove("is-idle");
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => exploreBar.classList.add("is-idle"), 4500);
  }
  window.addEventListener("pointermove", bumpCapsuleActivity, { passive: true });
  window.addEventListener("keydown", bumpCapsuleActivity, { passive: true });
  bumpCapsuleActivity();

  // Interactive 3D Raycasting restricted to explicit raycastTargets
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();

  function pickScene(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointerNDC.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(raycastTargets, true);
    let groundPoint = null;
    for (let i = 0; i < hits.length; i += 1) {
      const h = hits[i];
      if (!groundPoint && h.point) groundPoint = h.point;
      let cur = h.object;
      while (cur) {
        if (cur.userData && cur.userData.interactive) {
          return { interactive: cur.userData.interactive, root: cur, hitPoint: h.point };
        }
        cur = cur.parent;
      }
    }
    return { interactive: null, hitPoint: groundPoint };
  }

  let pondCloseupToggle = true;

  function triggerInteraction(id) {
    switch (id) {
      case "mailbox":
      case "love-letter":
        openLetterModal({ saveState: true });
        audio.playLetterUnfold();
        return { id, letterOpen: true };
      case "couple-swing":
        secretGardens.boostSwing?.();
        flora.burstPetals?.();
        audio.playPetalGlissando();
        return { id, swingBoosted: true };
      case "garden-pond":
        secretGardens.ripplePond?.();
        audio.playFishRipple?.();
        return { id, pondRippled: true };
      case "beach-boardwalk":
        audio.playShipBell();
        return { id, boardwalkVisited: true };
      case "lighthouse":
        estate.flashLighthouse?.();
        oceanSky.triggerRainbow?.();
        audio.playLighthouseBell();
        return { id, lighthouseLit: true };
      case "boat":
        estate.rockBoats?.();
        audio.playShipBell();
        return { id, rocked: true };
      case "instruments":
      case "umbrella":
        audio.playDuetArpeggio();
        return { id, duetPlayed: true };
      case "flower-gazebo":
      case "bicycle":
        estate.swingGazebo?.();
        flora.burstPetals?.();
        audio.playPetalGlissando();
        return { id, petalsBurst: true };
      case "windmill":
        estate.boostWindmill?.();
        flora.burstPetals?.();
        audio.playRoofChime(true);
        return { id, windmillBoosted: true };
      default:
        return null;
    }
  }

  // "除去场景锁定 · 点哪看哪": single click orbits-focuses exactly where you clicked;
  // interactive objects still play their interaction; double-click dives in to walk.
  function handleOverlookFocusClick(picked) {
    const id = picked.interactive?.id || null;
    const hit = picked.hitPoint;
    if (id === "char-xian" || id === "char-ran") {
      couple.enter(id === "char-xian" ? "xian" : "ran");
      return;
    }
    if (id === "love-letter" || id === "mailbox") {
      openLetterModal({ saveState: true });
      audio.playLetterUnfold();
      return;
    }
    if (id) triggerInteraction(id);
    if (hit) {
      controls.focusOn(hit);
      markActivePill("");
    }
  }

  function handleOverlookDiveClick(picked) {
    const id = picked.interactive?.id || null;
    const hit = picked.hitPoint;

    if (
      id === "garden-pond" ||
      (hit && Math.hypot(hit.x - POND_CONFIG.cx, hit.z - POND_CONFIG.cz) < 6.8)
    ) {
      pondCloseupToggle = true;
      setCameraPreset("pondFishShrimpCloseup", { smooth: true });
      markActivePill("pondWaterfallWalk");
      triggerInteraction("garden-pond");
      return;
    }

    if (
      id === "couple-swing" ||
      (hit && Math.hypot(hit.x - SWING_CONFIG.cx, hit.z - SWING_CONFIG.cz) < 6.0)
    ) {
      setCameraPreset("coupleSwingWalk", { smooth: true });
      triggerInteraction("couple-swing");
      return;
    }

    if (id === "beach-boardwalk" || (hit && hit.x >= -16.0 && hit.x <= 6.2 && hit.z >= 25.0 && hit.z <= 35.0)) {
      setCameraPreset("beachBoardwalkWalk", { smooth: true });
      triggerInteraction("beach-boardwalk");
      return;
    }

    if (id === "love-letter") {
      openLetterModal({ saveState: true });
      audio.playLetterUnfold();
      return;
    }

    if (hit && hit.x >= -25.2 && hit.x <= -3.0 && hit.z >= -11.0 && hit.z <= 6.4) {
      if (hit.y > 5.4) {
        setCameraPreset("villaMasterWalk", { smooth: true });
      } else if (hit.z < -1.4 && hit.x >= -10.4) {
        setCameraPreset("villaStudyWalk", { smooth: true });
      } else {
        setCameraPreset("villaLivingWalk", { smooth: true });
      }
      return;
    }

    if (id === "mailbox") {
      controls.diveToWalk(-12.2, 12.6, -0.32, -0.02);
      markActivePill("");
      triggerInteraction("mailbox");
      return;
    }
    if (id === "love-letter") {
      openLetterModal({ saveState: true });
      audio.playLetterUnfold();
      return;
    }
    if (id === "lighthouse") {
      controls.diveToWalk(39.0, -14.5, -1.05, 0.14);
      markActivePill("harborPierWalk");
      triggerInteraction("lighthouse");
      return;
    }
    if (id === "boat") {
      setCameraPreset("harborPierWalk", { smooth: true });
      triggerInteraction("boat");
      return;
    }
    if (id === "flower-gazebo") {
      setCameraPreset("gazeboFlowerWalk", { smooth: true });
      markActivePill("");
      triggerInteraction("flower-gazebo");
      return;
    }
    if (id === "windmill") {
      controls.diveToWalk(-44.0, -58.5, 0.65, 0.12);
      markActivePill("creekBridgeWalk");
      triggerInteraction("windmill");
      return;
    }

    if (hit) {
      const spot = findNearestWalkableSpot(hit.x, hit.z, 12.0);
      const camDirX = hit.x - camera.position.x;
      const camDirZ = hit.z - camera.position.z;
      const lookYaw = Math.atan2(-camDirX, -camDirZ);
      controls.diveToWalk(spot.x, spot.z, lookYaw, -0.02);
      markActivePill("");
      if (id) triggerInteraction(id);
    }
  }

  canvas.addEventListener("pointermove", (e) => {
    if (e.buttons !== 0) return;
    const picked = pickScene(e.clientX, e.clientY);
    const clickable =
      couple.isActive() || controls.getMode() === "aerial"
        ? Boolean(picked.interactive || picked.hitPoint)
        : Boolean(picked.interactive);
    canvas.classList.toggle("is-hover-interactive", clickable);
  });

  let clickTimer = null;
  canvas.addEventListener("click", (e) => {
    audio.unlock();
    if (!controls.wasClickGesture()) return;
    const picked = pickScene(e.clientX, e.clientY);

    if (couple.isActive()) {
      couple.handleClick(picked);
      return;
    }
    const pid = picked.interactive?.id;
    if (pid === "char-xian" || pid === "char-ran") {
      couple.enter(pid === "char-xian" ? "xian" : "ran");
      return;
    }

    if (controls.getMode() === "aerial") {
      // defer so a double-click can turn into a dive instead of a focus
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        clickTimer = null;
        handleOverlookFocusClick(picked);
      }, 230);
      return;
    }

    if (picked.interactive) {
      if (picked.interactive.id === "garden-pond") {
        pondCloseupToggle = !pondCloseupToggle;
        setCameraPreset(
          pondCloseupToggle ? "pondFishShrimpCloseup" : "pondWaterfallWalk",
          { smooth: true }
        );
        markActivePill("pondWaterfallWalk");
      } else if (picked.interactive.id === "couple-swing") {
        const wp = controls.getWalkPosition();
        if (Math.hypot(wp.x - SWING_CONFIG.cx, wp.z - SWING_CONFIG.cz) > 9.0) {
          setCameraPreset("coupleSwingWalk", { smooth: true });
        }
      } else if (picked.interactive.id === "beach-boardwalk") {
        setCameraPreset("beachBoardwalkWalk", { smooth: true });
      }
      triggerInteraction(picked.interactive.id);
      return;
    }

    if (picked.hitPoint && isPositionWalkable(picked.hitPoint.x, picked.hitPoint.z, 0.28, controls.getWalkPosition().y)) {
      controls.walkTo(picked.hitPoint.x, picked.hitPoint.z);
      markActivePill("");
    } else if (picked.hitPoint) {
      controls.lookAtPoint(picked.hitPoint);
    }
  });

  canvas.addEventListener("dblclick", (e) => {
    if (couple.isActive() || controls.getMode() !== "aerial") return;
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    const picked = pickScene(e.clientX, e.clientY);
    if (picked.hitPoint || picked.interactive) handleOverlookDiveClick(picked);
  });

  window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    camera.fov = w < h ? 62 : 52;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  });

  // Step Simulation Subsystems vs Camera/UI Frame Loop
  function stepSimulation(simDt) {
    simTime += simDt;
    oceanSky.update?.(simTime, simDt);
    distantHorizon.update?.(simTime, simDt);
    estate.update?.(simTime, simDt);
    villa.update?.(simTime, simDt);
    flora.update?.(simTime, simDt);
    secretGardens.update?.(simTime, simDt);
  }

  function checkLetterProximity() {
    if (controls.getMode() !== "walk" || !villa.letterWorldPos) return;
    const wp = controls.getWalkPosition();
    if (Math.abs(wp.y - 2.6) > 1.4) return;
    const dist = Math.hypot(wp.x - villa.letterWorldPos.x, wp.z - villa.letterWorldPos.z);
    if (dist < 1.55 && !autoOpenedNearDesk && letterModal && letterModal.hidden) {
      autoOpenedNearDesk = true;
      openLetterModal({ saveState: true });
      audio.playLetterUnfold();
    } else if (dist > 2.45) {
      autoOpenedNearDesk = false;
    }
  }

  let startFrozenForQA = false;
  try {
    startFrozenForQA = new URLSearchParams(window.location.search).get("qa") === "1";
  } catch {
    startFrozenForQA = false;
  }

  // Initial state & shader compilation warmup frame before hiding loading overlay
  const syncPx = new Uint8Array(4);
  applyNightMix(0.0);
  stepSimulation(0.016);
  controls.update(0.016);
  if (isSoftware) renderer.shadowMap.needsUpdate = true;
  const tWarm0 = performance.now();
  renderer.render(scene, camera);
  if (isSoftware && startFrozenForQA) {
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPx);
  }
  const warmMs = Math.max(1, performance.now() - tWarm0);
  if (isSoftware) {
    measuredFps = 1000 / warmMs;
  }
  setLoadingProgress(1.0, "庄园已就绪");
  hideLoadingOverlay();

  const clock = new THREE.Clock();
  let renderFrozenForQA = startFrozenForQA;
  let rafId = 0;
  let autoQualityWarmupSec = 0;

  function animate() {
    if (renderFrozenForQA) {
      rafId = 0;
      clock.getDelta();
      return;
    }
    rafId = requestAnimationFrame(animate);
    const rawDt = clock.getDelta();
    const frameDt = Math.min(rawDt, 0.05);

    // Smooth day/night transition runs even while simulation is paused
    if (Math.abs(nightMix - targetNightMix) > 0.0008) {
      const nextMix =
        nightMix + Math.sign(targetNightMix - nightMix) * Math.min(Math.abs(targetNightMix - nightMix), frameDt * 1.05);
      applyNightMix(nextMix);
    }

    // Camera orbit/walk & proximity checks stay responsive even when paused
    controls.update(frameDt);
    couple.update(frameDt);
    checkLetterProximity();

    // Advance dynamic world ONLY when simulation is running
    if (!simPaused) {
      stepSimulation(frameDt);
    }

    renderer.render(scene, camera);

    // Real-time empirical FPS & auto-quality monitor
    fpsFrameAcc += 1;
    fpsTimeAcc += Math.max(rawDt, 0.0001);
    if (fpsTimeAcc >= 0.4) {
      measuredFps = fpsFrameAcc / fpsTimeAcc;
      fpsFrameAcc = 0;
      fpsTimeAcc = 0;
      updateDebugHudUI();

      if (!isSoftware && qualityMode === "auto") {
        autoQualityWarmupSec += 0.4;
        if (autoQualityWarmupSec > 2.4 && measuredFps < 32) {
          if (activeQualityTier === "high") applyQualityTier("medium");
          else if (activeQualityTier === "medium") applyQualityTier("low");
          autoQualityWarmupSec = 0;
        }
      }
    }
  }

  if (!renderFrozenForQA) {
    animate();
  }

  // Deterministic QA, Performance Inspection & Control API
  window.__fairytaleWorld = {
    ready: true,
    scene,
    camera,
    renderer,
    controls,
    oceanSky,
    distantHorizon,
    estate,
    villa,
    flora,
    secretGardens,
    couple,
    openLetterModal: () => openLetterModal({ saveState: true }),
    closeLetterModal: () => closeLetterModal({ restoreState: true }),
    triggerInteraction,
    setCameraPreset,
    setDayNight,
    setSimPaused,
    togglePause: () => setSimPaused(!simPaused),
    resetWorld,
    setQuality,
    toggleDebugHud,
    getSimState() {
      return {
        simTime: Number(simTime.toFixed(4)),
        simPaused,
        nightMix: Number(nightMix.toFixed(3)),
        qualityMode,
        activeQualityTier,
        gpuRendererName,
        isSoftware,
      };
    },
    setPaused(next) {
      const wantFrozen = Boolean(next);
      if (wantFrozen === renderFrozenForQA) return;
      renderFrozenForQA = wantFrozen;
      if (renderFrozenForQA) {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
      } else if (!rafId) {
        clock.getDelta();
        animate();
      }
    },
    advanceAndRender(totalSeconds = 0.25, stepDt = 0.05) {
      const steps = Math.max(1, Math.round(totalSeconds / stepDt));
      for (let i = 0; i < steps; i += 1) {
        if (Math.abs(nightMix - targetNightMix) > 0.0008) {
          const nextMix =
            nightMix +
            Math.sign(targetNightMix - nightMix) *
              Math.min(Math.abs(targetNightMix - nightMix), stepDt * 1.05);
          applyNightMix(nextMix);
        }
        controls.update(stepDt);
        couple.update(stepDt);
        checkLetterProximity();
        if (!simPaused) {
          stepSimulation(stepDt);
        }
      }
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          const t0 = performance.now();
          renderer.render(scene, camera);
          if (isSoftware) {
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPx);
            const dtMs = Math.max(1, performance.now() - t0);
            measuredFps = 1000 / dtMs;
            updateDebugHudUI();
          }
          requestAnimationFrame(() => resolve(true));
        });
      });
    },
    getPerformanceMetrics() {
      return {
        fps: Number(measuredFps.toFixed(1)),
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        qualityMode,
        activeQualityTier,
        pixelRatio: renderer.getPixelRatio(),
        gpuRendererName,
        isSoftware,
      };
    },
    getStats() {
      let meshes = 0;
      let instancedCount = 0;
      let triangles = 0;
      const interactiveIds = new Set();
      worldRoot.traverse((obj) => {
        if (obj.isMesh && obj.visible) {
          meshes += 1;
          const instances = obj.isInstancedMesh ? obj.count : 1;
          if (obj.isInstancedMesh) instancedCount += obj.count;
          const geom = obj.geometry;
          if (geom) {
            const baseTri = geom.index
              ? geom.index.count / 3
              : (geom.attributes.position?.count || 0) / 3;
            triangles += baseTri * instances;
          }
        }
        if (obj.userData && obj.userData.interactive) {
          interactiveIds.add(obj.userData.interactive.id);
        }
      });
      const wp = controls.getWalkPosition();
      return {
        mode: controls.getMode(),
        eyeHeight: Number(controls.getEyeHeight().toFixed(2)),
        walkPosition: [
          Number(wp.x.toFixed(2)),
          Number(wp.y.toFixed(2)),
          Number(wp.z.toFixed(2)),
        ],
        cameraPosition: [
          Number(camera.position.x.toFixed(2)),
          Number(camera.position.y.toFixed(2)),
          Number(camera.position.z.toFixed(2)),
        ],
        simTime: Number(simTime.toFixed(3)),
        simPaused,
        nightMix: Number(nightMix.toFixed(3)),
        activeQualityTier,
        drawCalls: renderer.info.render.calls,
        renderedTriangles: renderer.info.render.triangles,
        raycastTargetCount: raycastTargets.length,
        meshes,
        instancedFloraCount: instancedCount,
        triangles: Math.round(triangles),
        interactiveIds: Array.from(interactiveIds).sort(),
        letterVisible: Boolean(letterModal && !letterModal.hidden),
      };
    },
  };
}

init();
