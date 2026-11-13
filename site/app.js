// Realistic Coastal Villa, Monet Fish & Shrimp Pond, Bougainvillea Two-Person Swing
// & Botanical Flower Peninsula World — Default Panoramic Overlook + Click-to-Dive Exploration.

import {
  THREE,
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
  createRealisticSkyEnvironment,
  buildRealisticOceanAndSky,
} from "./modules/realistic-ocean-sky.js";
import { buildHarborAndEstate } from "./modules/harbor-and-estate.js";
import { buildCoastalVilla } from "./modules/coastal-villa.js";
import { buildBotanicalFlora } from "./modules/botanical-flora.js";
import { buildSecretGardensAndPond } from "./modules/secret-gardens-and-pond.js";
import { buildDistantHorizon } from "./modules/distant-horizon.js";
import { createHarborAudio } from "./audio.js";

async function loadGiftLetter() {
  try {
    const res = await fetch("./gift.json");
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function populateLetterModal(gift) {
  if (!gift) return;
  const recEl = document.getElementById("letter-recipient");
  const salEl = document.getElementById("letter-salutation");
  const bodyEl = document.getElementById("letter-body");
  const sigEl = document.getElementById("letter-signature");

  if (recEl && gift.recipient) recEl.textContent = `致${gift.recipient}`;
  if (salEl && gift.salutation) salEl.textContent = gift.salutation;
  if (sigEl && gift.signature) sigEl.textContent = gift.signature;
  if (bodyEl && Array.isArray(gift.letter)) {
    bodyEl.innerHTML = "";
    gift.letter.forEach((para) => {
      const p = document.createElement("p");
      p.textContent = para;
      bodyEl.appendChild(p);
    });
  }
}

async function init() {
  const canvas = document.getElementById("diorama-canvas");
  const letterModal = document.getElementById("letter-modal");
  const letterClose = document.getElementById("letter-close");
  const exploreBar = document.getElementById("explore-bar");
  const exploreHint = document.getElementById("explore-hint");

  clearNavigationRegistry();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  const gl = renderer.getContext();
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const isSoftware = Boolean(
    dbg &&
      /SwiftShader|llvmpipe|Software/i.test(
        String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "")
      )
  );
  renderer.setPixelRatio(isSoftware ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (isSoftware) {
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
  }
  renderer.setClearColor(0xdce9f2, 1);

  const fogColorHex = 0xdce9f2;
  const fogDensity = 0.00068;

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

  // Physically-balanced coastal sunlight + warm limestone hemisphere bounce
  const hemiLight = new THREE.HemisphereLight(0xe2f1ff, 0xdccfb9, 0.98);
  hemiLight.position.set(0, 80, 0);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff4df, 2.35);
  sunLight.position.copy(SUN_DIRECTION).multiplyScalar(140);
  sunLight.castShadow = true;
  const shadowMapDim = isSoftware ? 1024 : 2048;
  sunLight.shadow.mapSize.set(shadowMapDim, shadowMapDim);
  sunLight.shadow.camera.near = 25;
  sunLight.shadow.camera.far = 310;
  const shadowExtent = 95;
  sunLight.shadow.camera.left = -shadowExtent;
  sunLight.shadow.camera.right = shadowExtent;
  sunLight.shadow.camera.top = shadowExtent;
  sunLight.shadow.camera.bottom = -shadowExtent;
  sunLight.shadow.bias = -0.00035;
  sunLight.shadow.normalBias = 0.03;
  scene.add(sunLight);

  // Build Realistic Coastal World Subsystems
  const worldRoot = new THREE.Group();
  worldRoot.name = "RealisticCoastalEstateWorld";
  scene.add(worldRoot);

  const oceanSky = buildRealisticOceanAndSky({ fogColor: fogColorHex, fogDensity });
  worldRoot.add(oceanSky.group);

  const distantHorizon = buildDistantHorizon();
  worldRoot.add(distantHorizon.group);

  const estate = buildHarborAndEstate();
  worldRoot.add(estate.group);

  const villa = buildCoastalVilla();
  worldRoot.add(villa.group);

  const flora = buildBotanicalFlora();
  worldRoot.add(flora.group);

  const secretGardens = await buildSecretGardensAndPond({ villaGroup: villa.group });
  worldRoot.add(secretGardens.group);

  if (isSoftware) {
    renderer.shadowMap.needsUpdate = true;
  }

  function markActivePill(presetName) {
    if (!exploreBar) return;
    exploreBar.querySelectorAll(".explore-pill").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.preset === presetName);
    });
  }

  const controls = createExplorationControls(camera, canvas, {
    isPortrait,
    onModeChange(nextMode) {
      if (exploreHint) {
        exploreHint.textContent =
          nextMode === "aerial"
            ? "点击任意景致深入探索 · 拖拽旋转俯瞰"
            : "WASD / 点击地面自由漫步 · 按 Esc 返回俯瞰全景";
      }
      if (nextMode === "aerial") {
        markActivePill("aerialOverlook");
      }
    },
  });

  // Audio & Love Letter Modal
  const audio = createHarborAudio();
  const giftData = await loadGiftLetter();
  populateLetterModal(giftData);

  function openLetterModal() {
    if (letterModal) letterModal.hidden = false;
  }

  function closeLetterModal() {
    if (letterModal) letterModal.hidden = true;
  }

  letterClose?.addEventListener("click", closeLetterModal);
  letterModal?.addEventListener("click", (e) => {
    if (e.target === letterModal) closeLetterModal();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (letterModal && !letterModal.hidden) {
        closeLetterModal();
      } else if (controls.getMode() !== "aerial") {
        controls.flyToAerial([-4.5, 2.8, 9.2], window.innerWidth < window.innerHeight ? 76.0 : 66.0, 1.0, 0.3);
        markActivePill("aerialOverlook");
      }
    }
  });

  // Presets supporting default panoramic overlook, secret gardens, pond macro, and Villa interior
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
      x: -1.5,
      z: 22.1,
      yaw: 0.0,
      pitch: -0.20,
      eyeHeight: 1.46,
    },
    pondFishShrimpCloseup: {
      type: "walk",
      x: -0.55,
      z: 20.55,
      yaw: 0.04,
      pitch: -0.50,
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
    monetPathWalk: {
      type: "walk",
      x: -14.0,
      z: 21.8,
      yaw: 0.0,
      pitch: 0.03,
      eyeHeight: 1.65,
    },
    courtyardWalk: { type: "walk", x: -14.0, z: 13.8, yaw: 0.0, pitch: 0.04 },
    villaLivingWalk: { type: "walk", x: -22.5, z: 3.05, yaw: -0.96, pitch: -0.04 },
    villaMasterWalk: { type: "walk", x: -17.4, z: -4.4, yaw: 0.42, pitch: -0.06 },
    villaStudyWalk: { type: "walk", x: -11.3, z: -4.25, yaw: -0.48, pitch: -0.05 },
    gazeboFlowerWalk: { type: "walk", x: -51.5, z: 31.8, yaw: 2.26, pitch: 0.01 },
    harborPierWalk: { type: "walk", x: 34.0, z: 4.5, yaw: -1.32, pitch: -0.02 },
    creekBridgeWalk: { type: "walk", x: 1.5, z: -34.5, yaw: -0.45, pitch: 0.05 },
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
        controls.diveToWalk(p.x, p.z, p.yaw, p.pitch, { eyeHeight: p.eyeHeight ?? 1.68 });
      } else {
        controls.teleportWalk(p.x, p.z, p.yaw, p.pitch, p.eyeHeight ?? 1.68);
      }
    } else if (smooth) {
      controls.flyToAerial(p.target, p.radius, p.phi, p.theta);
    } else {
      controls.setAerialImmediate(p.target, p.radius, p.phi, p.theta);
    }
    markActivePill(name);
    return true;
  }

  exploreBar?.querySelectorAll(".explore-pill").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      audio.unlock();
      const preset = btn.dataset.preset;
      if (preset) setCameraPreset(preset, { smooth: true });
    });
  });

  // Subtle auto-dimming of the exploration capsule when pointer is idle
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

  // Interactive 3D Raycasting & Click-to-Dive / Click-to-Walk
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();

  function pickScene(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointerNDC.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(worldRoot.children, true);
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

  let pondCloseupToggle = false;

  function triggerInteraction(id) {
    switch (id) {
      case "mailbox":
      case "love-letter":
        openLetterModal();
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

  // Smart destination resolver when clicking in Default Overlook ("点击什么地方才深入")
  function handleOverlookDiveClick(picked) {
    const id = picked.interactive?.id || null;
    const hit = picked.hitPoint;

    // 1. Clicked on or right around the Monet Waterfall & Fish/Shrimp Pond
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

    // 2. Clicked on or right around the White A-Frame Two-Person Swing Secret Garden
    if (
      id === "couple-swing" ||
      (hit && Math.hypot(hit.x - SWING_CONFIG.cx, hit.z - SWING_CONFIG.cz) < 6.0)
    ) {
      setCameraPreset("coupleSwingWalk", { smooth: true });
      triggerInteraction("couple-swing");
      return;
    }

    // 3. Clicked on the Mediterranean Two-Bedroom Villa -> dive right inside that room!
    if (hit && hit.x >= -25.2 && hit.x <= -3.0 && hit.z >= -11.0 && hit.z <= 5.2) {
      if (hit.z < -3.0 && hit.x < -14.0) {
        setCameraPreset("villaMasterWalk", { smooth: true });
      } else if (hit.z < -3.0 && hit.x >= -14.0) {
        setCameraPreset("villaStudyWalk", { smooth: true });
      } else {
        setCameraPreset("villaLivingWalk", { smooth: true });
      }
      return;
    }

    // 4. Clicked on specific interactive landmarks
    if (id === "mailbox") {
      controls.diveToWalk(-12.2, 12.6, -0.32, -0.02);
      markActivePill("");
      triggerInteraction("mailbox");
      return;
    }
    if (id === "love-letter") {
      setCameraPreset("villaStudyWalk", { smooth: true });
      triggerInteraction("love-letter");
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
      markActivePill("");
      triggerInteraction("windmill");
      return;
    }

    // 5. Clicked anywhere else on the gardens, courtyard, paths, harbor quay, or hills!
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
      controls.getMode() === "aerial"
        ? Boolean(picked.interactive || picked.hitPoint)
        : Boolean(picked.interactive);
    canvas.classList.toggle("is-hover-interactive", clickable);
  });

  canvas.addEventListener("click", (e) => {
    audio.unlock();
    if (!controls.wasClickGesture()) return;
    const picked = pickScene(e.clientX, e.clientY);

    if (controls.getMode() === "aerial") {
      handleOverlookDiveClick(picked);
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
      }
      triggerInteraction(picked.interactive.id);
      return;
    }

    if (picked.hitPoint && isPositionWalkable(picked.hitPoint.x, picked.hitPoint.z, 0.28)) {
      controls.walkTo(picked.hitPoint.x, picked.hitPoint.z);
      markActivePill("");
    }
  });

  window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    camera.fov = w < h ? 62 : 52;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  });

  // Animation loop
  const clock = new THREE.Clock();
  let elapsed = 0;
  let paused = false;

  function stepWorld(dt) {
    elapsed += dt;
    controls.update(dt);
    oceanSky.update?.(elapsed, dt);
    distantHorizon.update?.(elapsed, dt);
    estate.update?.(elapsed, dt);
    villa.update?.(elapsed, dt);
    flora.update?.(elapsed, dt);
    secretGardens.update?.(elapsed, dt);
  }

  function animate() {
    requestAnimationFrame(animate);
    if (paused) {
      clock.getDelta();
      return;
    }
    const dt = Math.min(clock.getDelta(), 0.05);
    stepWorld(dt);
    renderer.render(scene, camera);
  }

  animate();

  // Deterministic QA & inspection API
  window.__fairytaleWorld = {
    ready: true,
    scene,
    camera,
    controls,
    oceanSky,
    estate,
    villa,
    flora,
    secretGardens,
    openLetterModal,
    closeLetterModal,
    triggerInteraction,
    setCameraPreset,
    setPaused(next) {
      paused = Boolean(next);
    },
    advanceAndRender(totalSeconds = 0.25, stepDt = 0.05) {
      const steps = Math.max(1, Math.round(totalSeconds / stepDt));
      for (let i = 0; i < steps; i += 1) {
        stepWorld(stepDt);
      }
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          renderer.render(scene, camera);
          requestAnimationFrame(() => resolve(true));
        });
      });
    },
    getStats() {
      let meshes = 0;
      let instancedCount = 0;
      let triangles = 0;
      const interactiveIds = new Set();
      worldRoot.traverse((obj) => {
        if (obj.isMesh) {
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
