import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

function createSoftShadowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.49);
  grad.addColorStop(0.0, "rgba(116, 94, 72, 0.34)");
  grad.addColorStop(0.45, "rgba(136, 112, 88, 0.18)");
  grad.addColorStop(0.78, "rgba(156, 132, 106, 0.05)");
  grad.addColorStop(1.0, "rgba(245, 237, 224, 0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export async function createDioramaStage(canvas, options = {}) {
  const reduceMotion = Boolean(options.reduceMotion);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Cycles GI+AO lightmaps are baked with Filmic view transform into sRGB JPEGs;
  // NoToneMapping preserves exact pastel clay brightness without double-darkening.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0xf5ede0, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.25, 140);

  // Soft studio lighting for non-baked dynamic accents (orbiting petals, water, glass, vinyl)
  const hemi = new THREE.HemisphereLight(0xfff8ee, 0xe5d2bc, 1.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.35);
  sun.position.set(16, 26, 18);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xf6e3ec, 0.55);
  rim.position.set(-14, 14, -12);
  scene.add(rim);

  // Soft radial studio contact shadows beneath floating diorama islands (`Pearl & Co.` look)
  const shadowTex = createSoftShadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
  });
  const shadowSpecs = [
    { pos: [-14.0, -1.12, 10.0], rx: 6.4, rz: 5.4 },
    { pos: [-4.5, -0.88, 3.5], rx: 5.4, rz: 4.8 },
    { pos: [4.5, -0.56, -5.5], rx: 7.4, rz: 6.6 },
    { pos: [18.5, 0.28, -14.5], rx: 3.1, rz: 2.5 },
  ];
  shadowSpecs.forEach((sp) => {
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(sp.rx * 2, sp.rz * 2), shadowMat);
    disc.rotation.x = -Math.PI * 0.5;
    disc.position.set(sp.pos[0], sp.pos[1], sp.pos[2]);
    disc.renderOrder = -1;
    scene.add(disc);
  });

  // Load Cycles-baked `bloom_scroll_world.glb`
  const loader = new GLTFLoader();
  const gltfUrl = options.modelUrl || "./assets/models/bloom_scroll_world.glb";
  const gltf = await loader.loadAsync(gltfUrl);
  const worldRoot = gltf.scene;
  scene.add(worldRoot);

  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 4);
  const roofNode = worldRoot.getObjectByName("VillaRoofNode");
  const upperNode = worldRoot.getObjectByName("VillaFrontUpperNode");
  const orbitNode = worldRoot.getObjectByName("BouquetOrbitNode");
  const gramophoneNode = worldRoot.getObjectByName("GramophoneDiscNode");
  const emberNode = worldRoot.getObjectByName("FireplaceEmberNode");

  const cutawayMaterials = [];
  const waterMeshes = [];
  const emberMeshes = [];
  const orbitChildren = [];
  let meshCount = 0;

  worldRoot.traverse((obj) => {
    if (!obj.isMesh) return;
    meshCount += 1;
    const nm = obj.name || "";
    const oldMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const matName = (oldMat && oldMat.name) || "";

    if (matName.endsWith("BakedMat") && oldMat && oldMat.map) {
      oldMat.map.colorSpace = THREE.SRGBColorSpace;
      oldMat.map.anisotropy = maxAniso;
      oldMat.map.needsUpdate = true;
      const unlit = new THREE.MeshBasicMaterial({
        name: matName,
        map: oldMat.map,
      });
      obj.material = unlit;
    } else if (/Water|Spout|Pool/i.test(nm) || /Water/i.test(matName)) {
      obj.material = new THREE.MeshStandardMaterial({
        color: 0x82ced9,
        roughness: 0.16,
        metalness: 0.06,
        transparent: true,
        opacity: 0.84,
      });
      obj.userData.baseY = obj.position.y;
      waterMeshes.push(obj);
    } else if (/Bulb|Lantern|LampGlow/i.test(nm)) {
      obj.material = new THREE.MeshBasicMaterial({
        color: 0xffe4a3,
      });
    } else if (/Ember/i.test(nm)) {
      const emMat = new THREE.MeshBasicMaterial({ color: 0xff8542 });
      obj.material = emMat;
      emberMeshes.push(emMat);
    } else if (/Glass/i.test(nm)) {
      obj.material = new THREE.MeshStandardMaterial({
        color: 0xdbeaf4,
        roughness: 0.14,
        metalness: 0.08,
        transparent: true,
        opacity: 0.36,
      });
    } else if (oldMat) {
      oldMat.roughness = Math.max(0.45, oldMat.roughness ?? 0.82);
    }
  });

  // Collect materials on cutaway nodes (`VillaRoofNode` + `VillaFrontUpperNode`) for smooth fade-lift
  [roofNode, upperNode].forEach((grp) => {
    if (!grp) return;
    grp.userData.baseY = grp.position.y;
    grp.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const cloned = child.material.clone();
      cloned.userData.baseOpacity = cloned.opacity ?? 1.0;
      cloned.userData.wasTransparent = Boolean(cloned.transparent);
      child.material = cloned;
      cutawayMaterials.push(cloned);
    });
  });

  if (orbitNode) {
    orbitNode.children.forEach((ch, idx) => {
      ch.userData.baseY = ch.position.y;
      ch.userData.phase = idx * 0.65;
      orbitChildren.push(ch);
    });
  }

  // Camera & Cutaway State
  const scrollCamPos = new THREE.Vector3(-11.0, 4.5, 19.0);
  const scrollCamLook = new THREE.Vector3(-15.5, 0.8, 10.0);
  let scrollFov = 36;
  let roofTarget = 0;
  let roofCurrent = 0;

  // Interactive `360° 自由看房` Orbit State (centered on the redesigned Villa!)
  const villaCenter = new THREE.Vector3(4.5, 1.45, -5.5);
  let exploreMode = false;
  let exploreTheta = 0.48;
  let explorePhi = 0.96;
  let exploreRadius = 10.2;
  let targetTheta = 0.48;
  let targetPhi = 0.96;
  let targetRadius = 10.2;
  let exploreRoofOpen = 1.0;
  let dragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  function applyCutaway(openVal) {
    const v = Math.min(1, Math.max(0, openVal));
    if (roofNode) {
      roofNode.position.y = roofNode.userData.baseY + v * 2.55;
      roofNode.visible = v < 0.96;
    }
    if (upperNode) {
      upperNode.position.y = upperNode.userData.baseY + v * 1.95;
      upperNode.visible = v < 0.96;
    }
    const alpha = Math.max(0, 1 - v * 1.12);
    for (let i = 0; i < cutawayMaterials.length; i++) {
      const m = cutawayMaterials[i];
      const op = m.userData.baseOpacity * alpha;
      m.transparent = v > 0.004 || m.userData.wasTransparent;
      m.opacity = op;
      m.depthWrite = op > 0.86 && !m.userData.wasTransparent;
    }
  }

  function resize() {
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 800;
    const dpr = Math.min(window.devicePixelRatio || 1, w <= 860 ? 1.75 : 2.0);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function setScrollPose(pose, snap = false) {
    scrollCamPos.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    scrollCamLook.set(pose.look[0], pose.look[1], pose.look[2]);
    scrollFov = pose.fov || 36;
    if (!exploreMode) {
      roofTarget = pose.roofOpen ?? 0;
      if (snap || reduceMotion) {
        roofCurrent = roofTarget;
        applyCutaway(roofCurrent);
      }
      camera.position.copy(scrollCamPos);
      camera.lookAt(scrollCamLook);
      if (Math.abs(camera.fov - scrollFov) > 0.02) {
        camera.fov = scrollFov;
        camera.updateProjectionMatrix();
      }
    }
  }

  function setExploreMode(enabled, openRoofByDefault = true) {
    exploreMode = Boolean(enabled);
    canvas.style.pointerEvents = exploreMode ? "auto" : "none";
    canvas.style.cursor = exploreMode ? "grab" : "default";
    if (exploreMode) {
      targetTheta = 0.46;
      targetPhi = 0.92;
      targetRadius = window.innerWidth <= 860 ? 12.2 : 9.6;
      exploreRoofOpen = openRoofByDefault ? 1.0 : 0.0;
      roofTarget = exploreRoofOpen;
    }
  }

  function toggleExploreRoof() {
    exploreRoofOpen = exploreRoofOpen > 0.5 ? 0.0 : 1.0;
    if (exploreMode) {
      roofTarget = exploreRoofOpen;
    }
    return exploreRoofOpen > 0.5;
  }

  function setRoofOpen(val, snap = false) {
    roofTarget = Math.min(1, Math.max(0, val));
    exploreRoofOpen = roofTarget;
    if (snap || reduceMotion) {
      roofCurrent = roofTarget;
      applyCutaway(roofCurrent);
    }
  }

  // Pointer orbit + wheel zoom handlers for `360° 自由看房`
  canvas.addEventListener("pointerdown", (ev) => {
    if (!exploreMode) return;
    dragging = true;
    lastPointerX = ev.clientX;
    lastPointerY = ev.clientY;
    canvas.style.cursor = "grabbing";
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch (_) {}
  });

  canvas.addEventListener("pointermove", (ev) => {
    if (!exploreMode || !dragging) return;
    const dx = ev.clientX - lastPointerX;
    const dy = ev.clientY - lastPointerY;
    lastPointerX = ev.clientX;
    lastPointerY = ev.clientY;
    targetTheta -= dx * 0.0068;
    targetPhi = Math.min(1.36, Math.max(0.32, targetPhi - dy * 0.0056));
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    if (exploreMode) canvas.style.cursor = "grab";
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.addEventListener(
    "wheel",
    (ev) => {
      if (!exploreMode) return;
      ev.preventDefault();
      targetRadius = Math.min(16.5, Math.max(4.8, targetRadius + ev.deltaY * 0.008));
    },
    { passive: false }
  );

  let rafId = 0;
  const clock = new THREE.Clock();

  function renderFrame() {
    const t = clock.getElapsedTime();

    // Smooth cutaway roof lift
    const roofDiff = roofTarget - roofCurrent;
    if (Math.abs(roofDiff) > 0.0008) {
      roofCurrent += roofDiff * (reduceMotion ? 1.0 : 0.14);
      applyCutaway(roofCurrent);
    } else if (roofCurrent !== roofTarget) {
      roofCurrent = roofTarget;
      applyCutaway(roofCurrent);
    }

    // Interactive orbit camera update
    if (exploreMode) {
      const k = reduceMotion ? 1.0 : 0.16;
      exploreTheta += (targetTheta - exploreTheta) * k;
      explorePhi += (targetPhi - explorePhi) * k;
      exploreRadius += (targetRadius - exploreRadius) * k;

      const sinPhi = Math.sin(explorePhi);
      camera.position.set(
        villaCenter.x + exploreRadius * sinPhi * Math.sin(exploreTheta),
        villaCenter.y + exploreRadius * Math.cos(explorePhi),
        villaCenter.z + exploreRadius * sinPhi * Math.cos(exploreTheta)
      );
      camera.lookAt(villaCenter);
      if (Math.abs(camera.fov - 36) > 0.05) {
        camera.fov = 36;
        camera.updateProjectionMatrix();
      }
    }

    // Subtle diorama life animations (respects prefers-reduced-motion)
    if (!reduceMotion) {
      if (orbitNode) {
        orbitNode.rotation.y = t * 0.24;
        for (let i = 0; i < orbitChildren.length; i++) {
          const ch = orbitChildren[i];
          ch.position.y = ch.userData.baseY + Math.sin(t * 1.45 + ch.userData.phase) * 0.06;
          ch.rotation.z += 0.004;
        }
      }
      if (gramophoneNode) {
        gramophoneNode.rotation.y = t * 1.8;
      }
      if (emberNode || emberMeshes.length) {
        const pulse = 0.82 + Math.sin(t * 4.2) * 0.18;
        for (let i = 0; i < emberMeshes.length; i++) {
          emberMeshes[i].color.setRGB(1.0 * pulse, 0.48 * pulse, 0.22 * pulse);
        }
      }
      for (let i = 0; i < waterMeshes.length; i++) {
        const wm = waterMeshes[i];
        wm.position.y = wm.userData.baseY + Math.sin(t * 2.1 + i) * 0.008;
      }
    }

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(renderFrame);
  }

  resize();
  applyCutaway(0);
  renderFrame();

  return {
    resize,
    setScrollPose,
    setExploreMode,
    toggleExploreRoof,
    setRoofOpen,
    renderNow: () => renderer.render(scene, camera),
    destroy: () => cancelAnimationFrame(rafId),
    getDiagnostics: () => ({
      loaded: true,
      meshCount,
      hasRoofNode: Boolean(roofNode),
      hasUpperNode: Boolean(upperNode),
      hasOrbitNode: Boolean(orbitNode),
      exploreMode,
      roofOpen: Number(roofCurrent.toFixed(4)),
      cameraPos: [
        Number(camera.position.x.toFixed(3)),
        Number(camera.position.y.toFixed(3)),
        Number(camera.position.z.toFixed(3)),
      ],
      cameraFov: Number(camera.fov.toFixed(2)),
    }),
  };
}
