// Master orchestrator for "予你花开 · 太阳雨中的童话星语花湾"
// 3rd-person free orbit/pan/zoom anime cel-shaded ("三渲二") miniature diorama with zero UI clutter.

import { THREE, PALETTE } from "./modules/toon-kit.js";
import { createDioramaControls } from "./modules/diorama-controls.js";
import { buildHarborBase } from "./modules/harbor-base.js";
import { buildFairytaleVilla } from "./modules/fairytale-villa.js";
import { buildHarborCraftAndProps } from "./modules/harbor-craft-and-props.js";
import { buildSunshowerAtmosphere } from "./modules/sunshower-atmosphere.js";
import { createHarborAudio } from "./audio.js";

function createSkyEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();

  const skyGeo = new THREE.SphereGeometry(40, 24, 16);
  const pos = skyGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cTop = new THREE.Color(0xd5eef3);
  const cMid = new THREE.Color(0xf6faef);
  const cBot = new THREE.Color(0x56b9b6);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i) / 40;
    if (y >= 0) {
      tmp.copy(cMid).lerp(cTop, Math.pow(y, 0.75));
    } else {
      tmp.copy(cMid).lerp(cBot, Math.min(1, -y * 1.4));
    }
    colors[i * 3 + 0] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  skyGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const skyMesh = new THREE.Mesh(
    skyGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })
  );
  envScene.add(skyMesh);

  // Warm sun patch for specular glints on wet concrete & clear glass
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(3.8, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff6d6 })
  );
  sunDisc.position.set(16, 24, 12);
  envScene.add(sunDisc);

  const envRT = pmrem.fromScene(envScene, 0.03);
  skyGeo.dispose();
  sunDisc.geometry.dispose();
  pmrem.dispose();
  return envRT.texture;
}

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

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xeaf5f4, 1);

  const scene = new THREE.Scene();
  scene.environment = createSkyEnvironment(renderer);
  scene.environmentIntensity = 0.58;
  scene.fog = new THREE.FogExp2(0xebf6f5, 0.0065);

  // Seamless 3D Sunshower Watercolor Sky Dome (keeps alpha=1 for pure additive golden sunbeams)
  const skyDomeGeo = new THREE.SphereGeometry(120, 32, 20);
  const skyPos = skyDomeGeo.attributes.position;
  const skyColors = new Float32Array(skyPos.count * 3);
  const cZenith = new THREE.Color(0xd2edf2);
  const cHorizon = new THREE.Color(0xf8f8ee);
  const cLower = new THREE.Color(0xe6f2f1);
  const cTmp = new THREE.Color();
  for (let i = 0; i < skyPos.count; i += 1) {
    const ny = skyPos.getY(i) / 120;
    if (ny >= 0) {
      cTmp.copy(cHorizon).lerp(cZenith, Math.pow(ny, 0.58));
    } else {
      cTmp.copy(cHorizon).lerp(cLower, Math.min(1, -ny * 2.5));
    }
    skyColors[i * 3 + 0] = cTmp.r;
    skyColors[i * 3 + 1] = cTmp.g;
    skyColors[i * 3 + 2] = cTmp.b;
  }
  skyDomeGeo.setAttribute("color", new THREE.BufferAttribute(skyColors, 3));
  const skyDome = new THREE.Mesh(
    skyDomeGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  skyDome.raycast = () => {};
  scene.add(skyDome);

  const isPortrait = window.innerWidth < window.innerHeight;
  const camera = new THREE.PerspectiveCamera(
    isPortrait ? 48 : 36,
    window.innerWidth / Math.max(1, window.innerHeight),
    0.25,
    240
  );

  const initialTarget = new THREE.Vector3(-0.35, 1.05, 0.35);
  const initialPosition = isPortrait
    ? new THREE.Vector3(30.5, 22.0, 32.0)
    : new THREE.Vector3(21.2, 15.2, 22.4);

  const controls = createDioramaControls(camera, canvas, {
    initialTarget,
    initialPosition,
    minRadius: 6.2,
    maxRadius: 56.0,
  });

  // High-key sunlit watercolor anime lighting rig
  const hemiLight = new THREE.HemisphereLight(0xf5fdff, 0x6ab4bc, 1.42);
  hemiLight.position.set(0, 28, 0);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff5db, 1.68);
  sunLight.position.set(17.5, 27.5, 13.5);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 4;
  sunLight.shadow.camera.far = 64;
  const shadowExtent = 16.8;
  sunLight.shadow.camera.left = -shadowExtent;
  sunLight.shadow.camera.right = shadowExtent;
  sunLight.shadow.camera.top = shadowExtent;
  sunLight.shadow.camera.bottom = -shadowExtent;
  sunLight.shadow.bias = -0.00045;
  sunLight.shadow.normalBias = 0.022;
  scene.add(sunLight);

  const coolFill = new THREE.DirectionalLight(0xbce9ef, 0.54);
  coolFill.position.set(-16, 11, -15);
  scene.add(coolFill);

  const cutawayBounce = new THREE.DirectionalLight(0xdaf5f4, 0.36);
  cutawayBounce.position.set(14, 4, 18);
  scene.add(cutawayBounce);

  // Assemble the 4 miniature world subsystems
  const worldRoot = new THREE.Group();
  worldRoot.name = "SunshowerFairytaleHarborWorld";
  scene.add(worldRoot);

  const harborBase = buildHarborBase();
  worldRoot.add(harborBase.group);

  const villa = buildFairytaleVilla();
  worldRoot.add(villa.group);

  const craftProps = buildHarborCraftAndProps(harborBase.anchors || {});
  worldRoot.add(craftProps.group);

  const allDripPoints = [
    ...((craftProps && craftProps.dripPoints) || []),
    ...((villa && villa.anchors && villa.anchors.dripPoints) || []),
  ];

  const atmosphere = buildSunshowerAtmosphere({
    puddles: (harborBase.anchors && harborBase.anchors.puddles) || [],
    dripPoints: allDripPoints,
    boatReflections: craftProps.boatReflections || [],
  });
  worldRoot.add(atmosphere.group);

  // Audio & Love Letter Modal
  const audio = createHarborAudio();
  const giftData = await loadGiftLetter();
  populateLetterModal(giftData);

  function openLetterModal() {
    if (!letterModal) return;
    letterModal.hidden = false;
  }

  function closeLetterModal() {
    if (!letterModal) return;
    letterModal.hidden = true;
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

  // Collect interactive targets & manage subtle hover rim-highlight
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();
  let hoveredRoot = null;
  const savedEmissives = new Map();

  function setHoveredRoot(nextRoot) {
    if (hoveredRoot === nextRoot) return;
    if (hoveredRoot) {
      hoveredRoot.traverse((child) => {
        if (child.isMesh && savedEmissives.has(child.uuid)) {
          const prev = savedEmissives.get(child.uuid);
          if (child.material && child.material.emissive) {
            child.material.emissive.copy(prev.color);
            child.material.emissiveIntensity = prev.intensity;
          }
        }
      });
      savedEmissives.clear();
    }
    hoveredRoot = nextRoot;
    canvas.classList.toggle("is-hover-interactive", Boolean(hoveredRoot));

    if (hoveredRoot) {
      const accent = new THREE.Color(
        (hoveredRoot.userData.interactive && hoveredRoot.userData.interactive.accentColor) ||
          PALETTE.brassGold
      );
      hoveredRoot.traverse((child) => {
        if (
          child.isMesh &&
          child.material &&
          child.material.emissive &&
          !child.material.transparent
        ) {
          // Clone shared cached material lazily on first hover so highlight stays isolated
          if (!child.userData.hoverClonedMat) {
            child.material = child.material.clone();
            child.userData.hoverClonedMat = true;
          }
          savedEmissives.set(child.uuid, {
            color: child.material.emissive.clone(),
            intensity: child.material.emissiveIntensity || 0,
          });
          child.material.emissive.lerp(accent, 0.42);
          child.material.emissiveIntensity = Math.max(
            0.28,
            (child.material.emissiveIntensity || 0) + 0.24
          );
        }
      });
    }
  }

  function pickInteractive(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointerNDC.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(worldRoot.children, true);
    for (let i = 0; i < hits.length; i += 1) {
      let cur = hits[i].object;
      while (cur) {
        if (cur.userData && cur.userData.interactive) {
          return { root: cur.userData.interactiveRoot || cur, hitPoint: hits[i].point };
        }
        cur = cur.parent;
      }
    }
    return null;
  }

  function triggerInteraction(id, hitObject = null) {
    switch (id) {
      case "villa-roof": {
        villa.toggleRoof();
        audio.playRoofChime(villa.isRoofOpen());
        return { id, roofOpen: villa.isRoofOpen() };
      }
      case "mailbox":
      case "love-letter": {
        openLetterModal();
        audio.playLetterUnfold();
        return { id, letterOpen: true };
      }
      case "lighthouse": {
        harborBase.flashLighthouse?.(true);
        atmosphere.triggerRainbow?.();
        audio.playLighthouseBell();
        return { id, lighthouseLit: true, rainbow: true };
      }
      case "boat": {
        const idx =
          hitObject && hitObject.userData && typeof hitObject.userData.boatIndex === "number"
            ? hitObject.userData.boatIndex
            : undefined;
        craftProps.rockBoat?.(idx);
        audio.playShipBell();
        return { id, rocked: true };
      }
      case "instruments":
      case "umbrella": {
        craftProps.chimeInstruments?.();
        audio.playDuetArpeggio();
        return { id, duetPlayed: true };
      }
      case "vending":
      case "radio": {
        craftProps.pulseVending?.();
        audio.playVendingClink();
        return { id, pulsed: true };
      }
      case "underwater-fish": {
        harborBase.burstFish?.();
        audio.playFishRipple();
        return { id, fishBurst: true };
      }
      default:
        return { id };
    }
  }

  canvas.addEventListener("pointermove", (e) => {
    if (e.buttons !== 0) {
      if (hoveredRoot) setHoveredRoot(null);
      return;
    }
    const picked = pickInteractive(e.clientX, e.clientY);
    setHoveredRoot(picked ? picked.root : null);
  });

  canvas.addEventListener("pointerup", (e) => {
    if (e.button !== 0 || controls.wasClickDrag()) return;
    if (letterModal && !letterModal.hidden) return;
    const picked = pickInteractive(e.clientX, e.clientY);
    if (picked && picked.root && picked.root.userData.interactive) {
      triggerInteraction(picked.root.userData.interactive.id, picked.root);
    }
  });

  canvas.addEventListener("dblclick", (e) => {
    const picked = pickInteractive(e.clientX, e.clientY);
    if (picked) {
      controls.focusOn(picked.hitPoint, 11.5);
    } else {
      controls.resetView();
    }
  });

  window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    camera.fov = w < h ? 48 : 36;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  });

  // Camera presets for multi-angle inspection & automated visual verification
  const CAMERA_PRESETS = {
    overview: { target: [-0.35, 1.05, 0.35], radius: 31.8, phi: 1.09, theta: 0.76 },
    mobileOverview: { target: [-0.2, 1.0, 0.5], radius: 44.5, phi: 1.08, theta: 0.76 },
    cutaway: { target: [3.2, -0.55, 7.2], radius: 15.6, phi: 1.32, theta: 0.56 },
    harborInteriors: { target: [2.8, 1.65, -2.2], radius: 14.2, phi: 1.16, theta: 0.34 },
    villaRooms: { target: [-7.4, 2.15, 3.8], radius: 11.4, phi: 0.72, theta: 1.18 },
    rainbowArch: { target: [2.2, 1.6, -1.2], radius: 27.5, phi: 1.18, theta: 0.62 },
    justLeftSteps: { target: [-1.8, 1.05, 6.2], radius: 9.2, phi: 1.14, theta: 0.88 },
  };

  function setCameraPreset(name) {
    const p = CAMERA_PRESETS[name];
    if (!p) return false;
    controls.setPoseImmediate(
      new THREE.Vector3(...p.target),
      p.radius,
      p.phi,
      p.theta
    );
    return true;
  }

  // Animation loop
  const clock = new THREE.Clock();
  let elapsed = 0;

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;

    controls.update();
    harborBase.update?.(elapsed, dt);
    villa.update?.(elapsed, dt);
    craftProps.update?.(elapsed, dt);
    atmosphere.update?.(elapsed, dt);

    const cloudFactor = atmosphere.getCloudFactor ? atmosphere.getCloudFactor() : 1.0;
    sunLight.intensity = 1.48 + 0.26 * cloudFactor;
    hemiLight.intensity = 1.34 + 0.12 * cloudFactor;

    renderer.render(scene, camera);
  }

  animate();

  // Expose deterministic inspection API for browser QA
  window.__fairytaleWorld = {
    ready: true,
    scene,
    camera,
    controls,
    harborBase,
    villa,
    craftProps,
    atmosphere,
    openLetterModal,
    closeLetterModal,
    triggerInteraction,
    setCameraPreset,
    getStats() {
      let meshes = 0;
      let triangles = 0;
      const interactiveIds = new Set();
      worldRoot.traverse((obj) => {
        if (obj.isMesh) {
          meshes += 1;
          const geom = obj.geometry;
          if (geom) {
            triangles += geom.index
              ? geom.index.count / 3
              : (geom.attributes.position?.count || 0) / 3;
          }
        }
        if (obj.userData && obj.userData.interactive) {
          interactiveIds.add(obj.userData.interactive.id);
        }
      });
      return {
        meshes,
        triangles: Math.round(triangles),
        interactiveIds: Array.from(interactiveIds).sort(),
        roofOpen: villa.isRoofOpen(),
        rainbowActive: atmosphere.isRainbowActive ? atmosphere.isRainbowActive() : false,
        letterVisible: Boolean(letterModal && !letterModal.hidden),
      };
    },
  };
}

init();
