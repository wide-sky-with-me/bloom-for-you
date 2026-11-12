// Realistic Coastal Villa, Botanical Flower Peninsula & Harbor Free-Exploration World
// Supports seamless first-person walk-inside exploration (WASD + click-to-walk) & aerial panorama.

import { THREE, clearNavigationRegistry, isPositionWalkable } from "./modules/pbr-kit.js";
import { createExplorationControls } from "./modules/exploration-controls.js";
import {
  SUN_DIRECTION,
  createRealisticSkyEnvironment,
  buildRealisticOceanAndSky,
} from "./modules/realistic-ocean-sky.js";
import { buildHarborAndEstate } from "./modules/harbor-and-estate.js";
import { buildCoastalVilla } from "./modules/coastal-villa.js";
import { buildBotanicalFlora, createRoseBouquet } from "./modules/botanical-flora.js";
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
    dbg && /SwiftShader|llvmpipe|Software/i.test(String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || ""))
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
    isPortrait ? 62 : 54,
    window.innerWidth / Math.max(1, window.innerHeight),
    0.15,
    2200
  );

  // Physically-balanced coastal sunlight + warm limestone hemisphere bounce
  const hemiLight = new THREE.HemisphereLight(0xe2f1ff, 0xdccfb9, 0.96);
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

  const estate = buildHarborAndEstate();
  worldRoot.add(estate.group);

  const villa = buildCoastalVilla();
  worldRoot.add(villa.group);

  const flora = buildBotanicalFlora();
  worldRoot.add(flora.group);

  const controls = createExplorationControls(camera, canvas, {
    onModeChange(nextMode) {
      if (!exploreHint) return;
      exploreHint.textContent =
        nextMode === "aerial"
          ? "拖拽旋转 · 右键平移 · 滚轮拉近落地漫游"
          : "WASD / 点击地面自由进屋探索 · 拖拽环顾";
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
    if (e.key === "Escape" && letterModal && !letterModal.hidden) {
      closeLetterModal();
    }
  });

  // Presets supporting both human-eye walk-inside views and panoramic aerial views
  const CAMERA_PRESETS = {
    courtyardWalk: { type: "walk", x: -14.0, z: 13.8, yaw: 0.0, pitch: 0.04 },
    villaLivingWalk: { type: "walk", x: -22.5, z: 3.05, yaw: -0.96, pitch: -0.04 },
    villaMasterWalk: { type: "walk", x: -17.4, z: -4.4, yaw: 0.42, pitch: -0.06 },
    villaStudyWalk: { type: "walk", x: -11.3, z: -4.25, yaw: -0.48, pitch: -0.05 },
    gazeboFlowerWalk: { type: "walk", x: -51.5, z: 31.8, yaw: 2.26, pitch: 0.01 },
    harborPierWalk: { type: "walk", x: 34.0, z: 4.5, yaw: -1.32, pitch: -0.02 },
    creekBridgeWalk: { type: "walk", x: 1.5, z: -34.5, yaw: -0.45, pitch: 0.05 },
    aerialEstateOverview: { type: "aerial", target: [-4.0, 3.0, 2.0], radius: 132.0, phi: 1.06, theta: 0.62 },
    aerialVillaHarbor: { type: "aerial", target: [6.0, 2.5, 4.0], radius: 68.0, phi: 1.12, theta: 0.52 },
    mobileOverview: { type: "walk", x: -14.0, z: 15.2, yaw: 0.0, pitch: 0.05 },
  };

  function markActivePill(presetName) {
    if (!exploreBar) return;
    exploreBar.querySelectorAll(".explore-pill").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.preset === presetName);
    });
  }

  function setCameraPreset(name) {
    const p = CAMERA_PRESETS[name];
    if (!p) return false;
    if (p.type === "walk") {
      controls.teleportWalk(p.x, p.z, p.yaw, p.pitch);
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
      if (preset) setCameraPreset(preset);
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

  // Interactive 3D Raycasting & Click-to-Walk
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

  function triggerInteraction(id) {
    switch (id) {
      case "mailbox":
      case "love-letter":
        openLetterModal();
        audio.playLetterUnfold();
        return { id, letterOpen: true };
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

  canvas.addEventListener("pointermove", (e) => {
    if (e.buttons !== 0) return;
    const picked = pickScene(e.clientX, e.clientY);
    canvas.classList.toggle("is-hover-interactive", Boolean(picked.interactive));
  });

  canvas.addEventListener("pointerup", (e) => {
    audio.unlock();
    if (!controls.wasClickGesture()) return;
    const picked = pickScene(e.clientX, e.clientY);
    if (picked.interactive) {
      triggerInteraction(picked.interactive.id);
      return;
    }
    if (picked.hitPoint && isPositionWalkable(picked.hitPoint.x, picked.hitPoint.z, 0.28)) {
      controls.walkTo(picked.hitPoint.x, picked.hitPoint.z);
    }
  });

  window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    camera.fov = w < h ? 62 : 54;
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
    estate.update?.(elapsed, dt);
    villa.update?.(elapsed, dt);
    flora.update?.(elapsed, dt);
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
        walkPosition: [
          Number(wp.x.toFixed(2)),
          Number(wp.y.toFixed(2)),
          Number(wp.z.toFixed(2)),
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
