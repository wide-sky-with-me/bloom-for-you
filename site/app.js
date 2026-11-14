// 《鸢尾湾·花与海之约》 — 海景花墅、莫奈花园与群岛海湾庄园
// Babylon.js 9.36.0 + Havok 1.3.14 Physics + Blender 4.0.2 Sculpted/Rigged GLBs + Golden Hour / Moonlit Night.

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Culling/ray";
import "@babylonjs/core/Collisions/pickingInfo";
import "@babylonjs/core/Loading/loadingScreen";

import {
  clamp,
  lerp,
  POND_CONFIG,
  SWING_CONFIG,
  clearNavigationRegistry,
  isPositionWalkable,
} from "./modules/world-spatial.js";
import { initHavokPhysics, loadAllGameModels } from "./modules/assets-loader.js";
import { buildOceanAndSky } from "./modules/ocean-sky-stage.js";
import { buildTerrainAndDistantHorizon } from "./modules/island-terrain-and-horizon.js";
import { buildFloraAndFX } from "./modules/flora-and-fx.js";
import { buildHarborVillaWorld } from "./modules/harbor-villa-world.js";
import { createExplorationControls, findNearestWalkableSpot } from "./modules/exploration-camera.js";
import { createCoupleMode } from "./modules/couple-mode-babylon.js";
import { resolveGiftConfig } from "./modules/gift-config.js";
import { createHarborAudio } from "./audio.js";

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

  setLoadingProgress(0.08, "正在唤醒 Babylon 9.36 WebGL2 与 Havok 物理引擎…");
  clearNavigationRegistry();

  const engine = new Engine(
    canvas,
    true,
    {
      preserveDrawingBuffer: false,
      stencil: true,
      powerPreference: "high-performance",
      antialias: true,
      disableWebGL2Support: false,
    },
    true
  );

  const gl = engine._gl;
  let gpuRendererName = "WebGL2";
  if (gl) {
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    gpuRendererName = String(
      (dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || "WebGL2"
    );
  }
  const isSoftware = /SwiftShader|llvmpipe|Software/i.test(gpuRendererName);
  engine.setHardwareScalingLevel(isSoftware ? 1 : 1 / Math.min(window.devicePixelRatio || 1, 2));

  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.86, 0.80, 0.75, 1.0);
  scene.blockMaterialDirtyMechanism = true;

  const isPortrait = window.innerWidth < window.innerHeight;
  const camera = new UniversalCamera("MainCamera", new Vector3(11.9, 38.5, 62.2), scene);
  camera.fov = ((isPortrait ? 62 : 52) * Math.PI) / 180;
  camera.minZ = 0.14;
  camera.maxZ = 2400;
  camera.inputs.clear();
  scene.activeCamera = camera;

  // Initialize Havok Physics V2
  let havokCtrl = null;
  let havokError = null;
  try {
    havokCtrl = await initHavokPhysics(scene);
  } catch (err) {
    havokError = err;
    console.warn("[app] Havok initialization fallback:", err);
  }

  setLoadingProgress(0.18, "正在加载 48 组精雕与动作绑定三维模型…");
  const containers = await loadAllGameModels(scene, (ratio, key) => {
    const r = clamp(Number(ratio) || 0, 0, 1);
    const frac = 0.18 + 0.50 * r;
    setLoadingProgress(frac, `正在解析三维模型 (${Math.round(r * 100)}% · ${key || ""})…`);
  });

  setLoadingProgress(0.72, "正在构建海岸大气散射、海浪与半圆形山湾…");
  const oceanSky = buildOceanAndSky(scene);
  const horizon = buildTerrainAndDistantHorizon(scene, containers, oceanSky.shadowGen);

  setLoadingProgress(0.84, "正在栽植莫奈花园玫瑰、鸢尾、绣球与风格化林木…");
  const flora = buildFloraAndFX(scene, containers, oceanSky.shadowGen);

  setLoadingProgress(0.92, "正在部署两层海景花墅、莫奈睡莲池、海港游艇与全景灯光…");
  const world = buildHarborVillaWorld(scene, {
    models: containers,
    shadowGen: oceanSky.shadowGen,
    courtRefs: horizon.courtRefs,
  });

  const havokBodies = havokCtrl ? havokCtrl.syncColliders() : 0;
  scene.blockMaterialDirtyMechanism = false;

  const allInteractables = [...flora.interactables, ...world.interactables];
  const interactableById = new Map(allInteractables.map((it) => [it.id, it]));

  const LEGACY_ID_MAP = {
    mailbox: "estate-mailbox-letter",
    "love-letter": "villa-love-letter",
    "couple-swing": "garden-swing-ride",
    "garden-pond": "garden-koi-feed",
    lighthouse: "estate-lighthouse-flash",
    boat: "estate-sloop-sail",
    instruments: "villa-guitar",
    umbrella: "estate-deck-lounger",
    "flower-gazebo": "estate-gazebo-swing",
    bicycle: "estate-bicycle-bell",
    windmill: "estate-windmill-spin",
    "beach-boardwalk": "estate-boardwalk-steps-sit",
  };

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

  const audio = createHarborAudio();
  const giftData = await resolveGiftConfig();
  populateLetterModal(giftData);

  // 小贤贤 & 小冉子 — rigged stylized couple
  const couple = createCoupleMode({
    scene,
    camera,
    canvas,
    models: containers,
    shadowGen: oceanSky.shadowGen,
    audio,
    sources: [flora, world],
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

  // 16 Scenic Camera Presets
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
        controls.teleportWalk(p.x, p.z, p.yaw, p.pitch, p.eyeHeight ?? 1.68, p.floorY ?? null);
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

  // Golden Hour <-> Moonlit Night State & Simulation Time
  let nightMix = 0.0;
  let targetNightMix = 0.0;
  let simTime = 0.0;
  let simPaused = false;

  function applyNightMix(mix) {
    nightMix = clamp(mix, 0, 1);
    oceanSky.setNightMix?.(nightMix);
    world.setNightMix?.(nightMix);
    horizon.update?.(simTime, nightMix);
    scene.clearColor.set(scene.fogColor.r, scene.fogColor.g, scene.fogColor.b, 1.0);
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
    if (immediate) applyNightMix(targetNightMix);
    return targetNightMix > 0.5 ? "night" : "day";
  }

  btnDayNight?.addEventListener("click", (e) => {
    e.stopPropagation();
    audio.unlock();
    setDayNight(targetNightMix > 0.5 ? "day" : "night");
  });

  // Simulation Time UI & Pause / Resume
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

  function resetWorld() {
    closeLetterModal({ restoreState: false });
    preLetterSnapshot = null;
    autoOpenedNearDesk = false;
    setSimPaused(false);
    setDayNight("day", { immediate: true });
    simTime = 0.0;
    horizon.update?.(0, 0);
    flora.reset?.();
    world.reset?.();
    setCameraPreset("aerialOverlook", { smooth: false });
  }

  btnReset?.addEventListener("click", (e) => {
    e.stopPropagation();
    audio.unlock();
    resetWorld();
  });

  // Quality Tiers & Default-Hidden Debug HUD
  let qualityMode = "auto";
  let activeQualityTier = "high";
  const tierLabelMap = { high: "高", medium: "中", low: "低" };

  function applyQualityTier(tier) {
    activeQualityTier = tier === "low" || tier === "medium" ? tier : "high";
    const maxDpr = activeQualityTier === "low" ? 1.0 : activeQualityTier === "medium" ? 1.35 : 2.0;
    engine.setHardwareScalingLevel(isSoftware ? 1 : 1 / Math.min(window.devicePixelRatio || 1, maxDpr));
    oceanSky.sunLight.shadowEnabled = activeQualityTier !== "low";
    oceanSky.setQualityDetail?.(activeQualityTier);
    flora.setQualityTier?.(activeQualityTier);
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
  function updateDebugHudUI() {
    if (!debugHud || debugHud.hidden) return;
    const fpsEl = document.getElementById("dbg-fps");
    const callsEl = document.getElementById("dbg-calls");
    const trisEl = document.getElementById("dbg-tris");
    const tierEl = document.getElementById("dbg-tier");
    if (fpsEl) {
      fpsEl.textContent = measuredFps >= 10 ? String(Math.round(measuredFps)) : measuredFps.toFixed(1);
    }
    if (callsEl) callsEl.textContent = String(engine._drawCalls?.current || scene.getActiveMeshes().length);
    if (trisEl) trisEl.textContent = Math.round((scene.getActiveIndices?.() || 0) / 3).toLocaleString();
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
    if (params.get("debug") === "1") toggleDebugHud(true);
  } catch {
    // Ignore invalid search params
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (letterModal && !letterModal.hidden) {
        closeLetterModal({ restoreState: true });
      } else if (couple.isActive()) {
        couple.exit();
      } else if (controls.getMode() !== "aerial") {
        controls.flyToAerial([-4.5, 2.8, 9.2], window.innerWidth < window.innerHeight ? 76.0 : 66.0, 1.0, 0.3);
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

  // Subtle auto-dimming of bottom capsule when idle
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

  // Picking (filtering out sky dome, water sheet, FX particles & instanced grass blades)
  function pickScene(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const pickInfo = scene.pick(
      x,
      y,
      (mesh) =>
        mesh.isVisible &&
        mesh.isEnabled() &&
        mesh.isPickable &&
        !(mesh.hasThinInstances && !mesh.metadata?.interactive) &&
        !/^(SkyDome|BeerLambertOcean|FX_|CoupleTag_)/i.test(mesh.name)
    );
    if (!pickInfo || !pickInfo.hit || !pickInfo.pickedMesh) {
      return { interactive: null, hitPoint: null };
    }
    let cur = pickInfo.pickedMesh;
    while (cur) {
      if (cur.metadata?.interactive) {
        return { interactive: cur.metadata.interactive, root: cur, hitPoint: pickInfo.pickedPoint };
      }
      cur = cur.parent;
    }
    return { interactive: null, hitPoint: pickInfo.pickedPoint };
  }

  let pondCloseupToggle = true;

  function triggerInteraction(id) {
    const resolvedId = LEGACY_ID_MAP[id] || id;
    if (resolvedId === "estate-mailbox-letter" || resolvedId === "villa-love-letter") {
      openLetterModal({ saveState: true });
    }
    const item = interactableById.get(resolvedId);
    if (item) {
      const msg = couple.isActive()
        ? couple.activateById(resolvedId)
        : item.activate?.({ actor: "xian", audio });
      if (resolvedId === "flora-rose-pick" || resolvedId === "garden-swing-ride") {
        flora.burstPetals?.();
      }
      return { id, resolvedId, activated: true, message: typeof msg === "string" ? msg : item.label };
    }
    return null;
  }

  function handleOverlookFocusClick(picked) {
    const id = picked.interactive?.id || null;
    const hit = picked.hitPoint;
    if (id === "char-xian" || id === "char-ran") {
      couple.enter(id === "char-xian" ? "xian" : "ran");
      return;
    }
    if (id === "love-letter" || id === "mailbox" || id === "villa-love-letter" || id === "estate-mailbox-letter") {
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

    if (id === "garden-pond" || id === "garden-koi-feed" || (hit && Math.hypot(hit.x - POND_CONFIG.cx, hit.z - POND_CONFIG.cz) < 6.8)) {
      pondCloseupToggle = true;
      setCameraPreset("pondFishShrimpCloseup", { smooth: true });
      markActivePill("pondWaterfallWalk");
      triggerInteraction("garden-koi-feed");
      return;
    }

    if (id === "couple-swing" || id === "garden-swing-ride" || (hit && Math.hypot(hit.x - SWING_CONFIG.cx, hit.z - SWING_CONFIG.cz) < 6.0)) {
      setCameraPreset("coupleSwingWalk", { smooth: true });
      triggerInteraction("garden-swing-ride");
      return;
    }

    if (id === "beach-boardwalk" || (hit && hit.x >= -16.0 && hit.x <= 6.2 && hit.z >= 25.0 && hit.z <= 35.0)) {
      setCameraPreset("beachBoardwalkWalk", { smooth: true });
      triggerInteraction("estate-boardwalk-steps-sit");
      return;
    }

    if (id === "love-letter" || id === "villa-love-letter") {
      openLetterModal({ saveState: true });
      audio.playLetterUnfold();
      return;
    }

    if (hit && hit.x >= -25.2 && hit.x <= -3.0 && hit.z >= -11.0 && hit.z <= 6.4) {
      if (hit.y > 5.4) setCameraPreset("villaMasterWalk", { smooth: true });
      else if (hit.z < -1.4 && hit.x >= -10.4) setCameraPreset("villaStudyWalk", { smooth: true });
      else setCameraPreset("villaLivingWalk", { smooth: true });
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
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        clickTimer = null;
        handleOverlookFocusClick(picked);
      }, 230);
      return;
    }

    if (picked.interactive) {
      if (picked.interactive.id === "garden-pond" || picked.interactive.id === "garden-koi-feed") {
        pondCloseupToggle = !pondCloseupToggle;
        setCameraPreset(pondCloseupToggle ? "pondFishShrimpCloseup" : "pondWaterfallWalk", { smooth: true });
        markActivePill("pondWaterfallWalk");
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
    camera.fov = ((w < h ? 62 : 52) * Math.PI) / 180;
    engine.resize();
  });

  function stepSimulation(simDt) {
    simTime += simDt;
    oceanSky.update?.(simTime, camera.position);
    horizon.update?.(simTime, nightMix);
    flora.update?.(simTime, simDt);
    world.update?.(simDt, simTime);
  }

  function checkLetterProximity() {
    if (controls.getMode() !== "walk") return;
    const wp = controls.getWalkPosition();
    if (Math.abs(wp.y - 2.6) > 1.4) return;
    const dist = Math.hypot(wp.x - -7.4, wp.z - -7.55);
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

  // Initial warmup frame before revealing canvas
  applyNightMix(0.0);
  stepSimulation(0.016);
  controls.update(0.016);
  couple.update(0.016);
  const tWarm0 = performance.now();
  scene.render();
  const warmMs = Math.max(1, performance.now() - tWarm0);
  if (isSoftware) measuredFps = 1000 / warmMs;

  setLoadingProgress(1.0, "庄园已就绪");
  hideLoadingOverlay();

  let renderFrozenForQA = startFrozenForQA;
  let lastFrameMs = performance.now();
  let hudTickAcc = 0;
  let autoQualityWarmupSec = 0;

  engine.runRenderLoop(() => {
    const now = performance.now();
    const rawDt = Math.max(0.001, (now - lastFrameMs) / 1000);
    lastFrameMs = now;
    if (renderFrozenForQA) return;

    const frameDt = Math.min(rawDt, 0.05);

    if (Math.abs(nightMix - targetNightMix) > 0.0008) {
      const nextMix =
        nightMix + Math.sign(targetNightMix - nightMix) * Math.min(Math.abs(targetNightMix - nightMix), frameDt * 1.05);
      applyNightMix(nextMix);
    }

    controls.update(frameDt);
    couple.update(frameDt);
    checkLetterProximity();

    if (!simPaused) {
      stepSimulation(frameDt);
    }

    scene.render();

    measuredFps = engine.getFps() || measuredFps;
    hudTickAcc += rawDt;
    if (hudTickAcc >= 0.4) {
      hudTickAcc = 0;
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
  });

  // Deterministic QA, Performance Inspection & Control API
  window.__fairytaleWorld = {
    ready: true,
    renderer: "babylon-9.36.0-havok-1.3.14",
    engine,
    scene,
    camera,
    controls,
    oceanSky,
    horizon,
    flora,
    world,
    couple,
    openLetterModal: () => openLetterModal({ saveState: true }),
    closeLetterModal: () => closeLetterModal({ restoreState: true }),
    triggerInteraction,
    listInteractables: () =>
      allInteractables.map((it) => ({
        id: it.id,
        label: it.label,
        x: Number(it.position.x.toFixed(2)),
        y: Number(it.position.y.toFixed(2)),
        z: Number(it.position.z.toFixed(2)),
        hasPose: Boolean(it.pose?.seats?.length),
      })),
    activateInteractable: (id) => triggerInteraction(id),
    enterCoupleMode: (id) => couple.enter(id),
    exitCoupleMode: () => couple.exit(),
    teleportCouple: (x, z, yaw = 0, floorY = null) => couple.teleport(x, z, yaw, floorY),
    setCoupleView: (v) => couple.setView(v),
    doCoupleAction: (name) => couple.doAction(name),
    setCameraPreset,
    setPreset: (name, opts) => setCameraPreset(name, opts),
    selectPreset: (name, opts = { smooth: false }) => setCameraPreset(name, opts),
    setDayNight,
    setNight: (on) => setDayNight(on ? "night" : "day", { immediate: true }),
    setSimPaused,
    togglePause: () => setSimPaused(!simPaused),
    resetWorld,
    setQuality,
    toggleDebugHud,
    getState() {
      const wp = controls.getWalkPosition();
      return {
        ready: true,
        renderer: "babylon-9.36.0-havok-1.3.14",
        mode: controls.getMode(),
        activePreset: activePresetName,
        simTime: Number(simTime.toFixed(4)),
        simPaused,
        nightMix: Number(nightMix.toFixed(3)),
        havokBodies,
        havokActive: Boolean(havokCtrl),
        havokError: havokError ? String(havokError) : null,
        interactableCount: allInteractables.length,
        walkPosition: [Number(wp.x.toFixed(2)), Number(wp.y.toFixed(2)), Number(wp.z.toFixed(2))],
        cameraPosition: [
          Number(camera.position.x.toFixed(2)),
          Number(camera.position.y.toFixed(2)),
          Number(camera.position.z.toFixed(2)),
        ],
        couple: couple.getState(),
        letterVisible: Boolean(letterModal && !letterModal.hidden),
      };
    },
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
      renderFrozenForQA = Boolean(next);
    },
    advanceAndRender(totalSeconds = 0.25, stepDt = 0.05) {
      const steps = Math.max(1, Math.round(totalSeconds / stepDt));
      for (let i = 0; i < steps; i += 1) {
        if (Math.abs(nightMix - targetNightMix) > 0.0008) {
          const nextMix =
            nightMix +
            Math.sign(targetNightMix - nightMix) * Math.min(Math.abs(targetNightMix - nightMix), stepDt * 1.05);
          applyNightMix(nextMix);
        }
        controls.update(stepDt);
        couple.update(stepDt);
        checkLetterProximity();
        if (!simPaused) stepSimulation(stepDt);
      }
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          const t0 = performance.now();
          scene.render();
          if (isSoftware) {
            measuredFps = 1000 / Math.max(1, performance.now() - t0);
            updateDebugHudUI();
          }
          requestAnimationFrame(() => resolve(true));
        });
      });
    },
    getPerformanceMetrics() {
      return {
        fps: Number(measuredFps.toFixed(1)),
        drawCalls: engine._drawCalls?.current || scene.getActiveMeshes().length,
        triangles: Math.round((scene.getActiveIndices?.() || 0) / 3),
        meshes: scene.meshes.length,
        materials: scene.materials.length,
        textures: scene.textures.length,
        qualityMode,
        activeQualityTier,
        gpuRendererName,
        isSoftware,
        havokBodies,
      };
    },
    getStats() {
      let meshes = 0;
      let instancedFloraCount = 0;
      for (let i = 0; i < scene.meshes.length; i += 1) {
        const m = scene.meshes[i];
        if (m instanceof Mesh && m.isVisible) {
          meshes += 1;
          if (m.hasThinInstances) instancedFloraCount += m.thinInstanceCount || 0;
        }
      }
      const wp = controls.getWalkPosition();
      return {
        mode: controls.getMode(),
        eyeHeight: Number(controls.getEyeHeight().toFixed(2)),
        walkPosition: [Number(wp.x.toFixed(2)), Number(wp.y.toFixed(2)), Number(wp.z.toFixed(2))],
        cameraPosition: [
          Number(camera.position.x.toFixed(2)),
          Number(camera.position.y.toFixed(2)),
          Number(camera.position.z.toFixed(2)),
        ],
        simTime: Number(simTime.toFixed(3)),
        simPaused,
        nightMix: Number(nightMix.toFixed(3)),
        activeQualityTier,
        drawCalls: engine._drawCalls?.current || scene.getActiveMeshes().length,
        renderedTriangles: Math.round((scene.getActiveIndices?.() || 0) / 3),
        meshes,
        instancedFloraCount,
        havokBodies,
        interactiveIds: allInteractables.map((it) => it.id).sort(),
        letterVisible: Boolean(letterModal && !letterModal.hidden),
      };
    },
  };
}

init();
