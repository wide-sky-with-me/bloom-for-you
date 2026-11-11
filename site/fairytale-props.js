import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, Number(v) || 0));

const sharedGltfLoader = new GLTFLoader();
const glbPromiseCache = new Map();

/**
 * Load a self-hosted Blender 4.0 .glb pack once and cache the parsed GLTF object.
 */
export function loadFairytaleGlb(url) {
  if (!glbPromiseCache.has(url)) {
    glbPromiseCache.set(
      url,
      new Promise((resolve, reject) => {
        sharedGltfLoader.load(url, resolve, undefined, reject);
      })
    );
  }
  return glbPromiseCache.get(url);
}

/**
 * Silky radial view-space glow shader so spheres render as feathered light blooms with ZERO hard disk edges!
 */
function createSoftGlowMaterial(colorHex, intensity = 0.68, falloff = 2.8) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uIntensity: { value: intensity },
      uFalloff: { value: falloff }
    },
    vertexShader: /* glsl */ `
      varying vec3 vViewN;
      void main() {
        vViewN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uFalloff;
      varying vec3 vViewN;
      void main() {
        float c = max(0.0, dot(normalize(vViewN), vec3(0.0, 0.0, 1.0)));
        float glow = pow(c, uFalloff) * uIntensity;
        if (glow < 0.005) discard;
        gl_FragColor = vec4(uColor, clamp(glow, 0.0, 1.0));
      }
    `
  });
}

function createGroundGlowDiscMaterial(colorHex, intensity = 0.34) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uIntensity: { value: intensity }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec2 vUv;
      void main() {
        float r = length((vUv - 0.5) * 2.0);
        if (r > 1.0) discard;
        float glow = pow(1.0 - r, 2.2) * uIntensity;
        gl_FragColor = vec4(uColor, glow);
      }
    `
  });
}

/**
 * Create the living, autonomous & interactive 3D Starlight Fairy Sprite ("星光提灯小精灵").
 * Freely wanders along the winding dirt path, grassy knolls, flowers, and hidden wonders,
 * while responding immediately to ground clicks or keyboard nudges!
 */
export function createFairyExplorer({
  scene,
  meadowHeight,
  wingTexture,
  waypoints = [],
  onArrivalWhisper = () => {}
}) {
  const root = new THREE.Group();
  const startWp = waypoints[0] || { x: -0.32, z: 2.85, whisper: '提着小灯笼，陪你在梵高星空草坡散步啦 ✨' };
  const pos = new THREE.Vector3(startWp.x, meadowHeight(startWp.x, startWp.z), startWp.z);
  root.position.copy(pos);
  scene.add(root);

  // Soft feathered warm ground glow pool beneath the sprite's feet (no hard inner cutout!)
  const footHalo = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 32),
    createGroundGlowDiscMaterial(0xfde047, 0.32)
  );
  footHalo.rotation.x = -Math.PI * 0.5;
  footHalo.position.y = 0.025;
  root.add(footHalo);

  // Body pivot for joyful walking hop, turn banking, and mid-air twirls
  const bodyPivot = new THREE.Group();
  bodyPivot.position.y = 0.06;
  root.add(bodyPivot);

  // 1.Tiny Boots / Legs
  const bootMat = new THREE.MeshBasicMaterial({ color: 0x312e81 });
  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.075, 6, 10), bootMat);
  leftLeg.position.set(-0.042, 0.06, 0);
  const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.075, 6, 10), bootMat);
  rightLeg.position.set(0.042, 0.06, 0);
  bodyPivot.add(leftLeg, rightLeg);

  // 2. Layered Petal-Bell Dress / Cloak (luminous periwinkle & starlight gradient look)
  const dressOuter = new THREE.Mesh(
    new THREE.ConeGeometry(0.145, 0.25, 20, 1, false),
    new THREE.MeshBasicMaterial({ color: 0x60a5fa })
  );
  dressOuter.position.y = 0.20;
  const dressInner = new THREE.Mesh(
    new THREE.ConeGeometry(0.152, 0.12, 18, 1, false),
    new THREE.MeshBasicMaterial({ color: 0xfef08a })
  );
  dressInner.position.y = 0.135;
  const leafCollar = new THREE.Mesh(
    new THREE.ConeGeometry(0.115, 0.085, 7, 1, false),
    new THREE.MeshBasicMaterial({ color: 0x34d399 })
  );
  leafCollar.position.y = 0.295;
  bodyPivot.add(dressInner, dressOuter, leafCollar);

  // 3. Glowing Porcelain-Starlight Head + Expressive Eyes & Rosy Cheeks
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.395;
  bodyPivot.add(headGroup);

  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.088, 22, 18),
    new THREE.MeshBasicMaterial({ color: 0xfffbeb })
  );
  headGroup.add(headMesh);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1e1b4b });
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 10), eyeMat);
  leftEye.position.set(-0.030, 0.008, 0.078);
  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 10), eyeMat);
  rightEye.position.set(0.030, 0.008, 0.078);

  const blushMat = new THREE.MeshBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 0.65 });
  const leftBlush = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), blushMat);
  leftBlush.scale.set(1.2, 0.7, 0.5);
  leftBlush.position.set(-0.048, -0.012, 0.072);
  const rightBlush = leftBlush.clone();
  rightBlush.position.x = 0.048;
  headGroup.add(leftEye, rightEye, leftBlush, rightBlush);

  // 4. Pointed Inverted-Bluebell Flower Hat + Curled Tip & Golden Star-Bell!
  const hatGroup = new THREE.Group();
  hatGroup.position.y = 0.052;
  hatGroup.rotation.x = -0.18;
  headGroup.add(hatGroup);

  const hatBrim = new THREE.Mesh(
    new THREE.ConeGeometry(0.138, 0.065, 8),
    new THREE.MeshBasicMaterial({ color: 0x3b82f6 })
  );
  hatBrim.position.y = 0.02;
  const hatCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.098, 0.21, 16),
    new THREE.MeshBasicMaterial({ color: 0x2563eb })
  );
  hatCone.position.y = 0.11;
  hatCone.rotation.z = -0.14;
  const hatTipBell = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.026, 1),
    new THREE.MeshBasicMaterial({ color: 0xfde047 })
  );
  hatTipBell.position.set(0.038, 0.215, -0.01);
  hatGroup.add(hatBrim, hatCone, hatTipBell);

  // 5. Four Fluttering Iridescent Gossamer Butterfly Wings (stained-glass translucency so veins shine!)
  const wingMat = new THREE.MeshBasicMaterial({
    map: wingTexture,
    transparent: true,
    opacity: 0.88,
    alphaTest: 0.06,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  function makeWing(w, h, mirrorX) {
    const pivot = new THREE.Group();
    const geo = new THREE.PlaneGeometry(w, h, 4, 4);
    geo.translate(w * 0.48, h * 0.12, 0);
    const mesh = new THREE.Mesh(geo, wingMat);
    if (mirrorX) {
      pivot.scale.x = -1;
    }
    pivot.add(mesh);
    return pivot;
  }

  const wingUpperR = makeWing(0.30, 0.25, false);
  wingUpperR.position.set(0.025, 0.29, -0.055);
  const wingUpperL = makeWing(0.30, 0.25, true);
  wingUpperL.position.set(-0.025, 0.29, -0.055);

  const wingLowerR = makeWing(0.20, 0.17, false);
  wingLowerR.position.set(0.022, 0.22, -0.058);
  wingLowerR.rotation.z = -0.32;
  const wingLowerL = makeWing(0.20, 0.17, true);
  wingLowerL.position.set(-0.022, 0.22, -0.058);
  wingLowerL.rotation.z = 0.32;

  bodyPivot.add(wingUpperR, wingUpperL, wingLowerR, wingLowerL);

  // 6. Curved Shepherd-Crook Staff & Swinging Golden Star-Lantern!
  const lanternPivot = new THREE.Group();
  lanternPivot.position.set(0.115, 0.265, 0.075);
  bodyPivot.add(lanternPivot);

  const staffMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.010, 0.013, 0.34, 8),
    new THREE.MeshBasicMaterial({ color: 0x92400e })
  );
  staffMesh.rotation.x = 0.42;
  staffMesh.position.set(0, 0.02, 0.05);
  lanternPivot.add(staffMesh);

  const lanternBell = new THREE.Group();
  lanternBell.position.set(0, 0.075, 0.145);
  lanternPivot.add(lanternBell);

  const lanternCap = new THREE.Mesh(
    new THREE.ConeGeometry(0.048, 0.036, 6),
    new THREE.MeshBasicMaterial({ color: 0xb45309 })
  );
  lanternCap.position.y = 0.035;
  const lanternCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.034, 0.028, 0.068, 6),
    new THREE.MeshBasicMaterial({ color: 0xfef9c3 })
  );
  const lanternAura = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 18, 14),
    createSoftGlowMaterial(0xfbbf24, 0.68, 2.6)
  );
  const spriteLanternLight = new THREE.PointLight(0xfbbf24, 1.35, 4.6, 1.45);
  lanternBell.add(lanternCap, lanternCore, lanternAura, spriteLanternLight);

  // Mutable animation rig bindings — seamlessly rebound when Blender 4.0 fairy_sprite.glb resolves!
  const rig = {
    bodyPivot,
    leftLeg,
    rightLeg,
    headGroup,
    hatGroup,
    lanternBell,
    hatBaseRotZ: 0,
    glbLoaded: false
  };

  loadFairytaleGlb('./assets/models/fairy_sprite.glb')
    .then((gltf) => {
      const spriteModel = gltf.scene;
      spriteModel.scale.setScalar(1.08);
      root.remove(bodyPivot);
      root.add(spriteModel);

      const glbBody = spriteModel.getObjectByName('BodyPivot') || spriteModel;
      const glbHead = spriteModel.getObjectByName('HeadNode') || glbBody;
      const glbHat = spriteModel.getObjectByName('HatNode') || glbHead;
      const glbLeftLeg = spriteModel.getObjectByName('LeftLegNode') || leftLeg;
      const glbRightLeg = spriteModel.getObjectByName('RightLegNode') || rightLeg;
      const glbLantern = spriteModel.getObjectByName('LanternSwingNode') || lanternBell;

      // Mount iridescent gossamer butterfly wings directly onto sculpted BodyPivot back!
      wingUpperR.position.set(0.028, 0.29, -0.055);
      wingUpperL.position.set(-0.028, 0.29, -0.055);
      wingLowerR.position.set(0.024, 0.22, -0.058);
      wingLowerL.position.set(-0.024, 0.22, -0.058);
      glbBody.add(wingUpperR, wingUpperL, wingLowerR, wingLowerL);

      // Mount feathered starlight aura + real-time warm PBR PointLight onto swinging brass lantern!
      lanternAura.position.set(0, -0.018, 0);
      spriteLanternLight.position.set(0, -0.018, 0);
      glbLantern.add(lanternAura, spriteLanternLight);

      rig.bodyPivot = glbBody;
      rig.headGroup = glbHead;
      rig.hatGroup = glbHat;
      rig.leftLeg = glbLeftLeg;
      rig.rightLeg = glbRightLeg;
      rig.lanternBell = glbLantern;
      rig.hatBaseRotZ = glbHat.rotation.z;
      rig.glbLoaded = true;
    })
    .catch((err) => {
      console.warn('[fairytale-props] Fallback procedural sprite active:', err);
    });

  // Invisible generous raycast sphere so clicking the sprite triggers her joy-spin Easter egg!
  const hitSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 12, 12),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitSphere.position.y = 0.28;
  hitSphere.userData.wonderId = 'wonder-sprite';
  root.add(hitSphere);

  // 7. Click-to-Walk Destination Starlight Ring on the ground
  const destRing = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.25, 36),
    new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  destRing.rotation.x = -Math.PI * 0.5;
  scene.add(destRing);

  // 8. Trailing Pixie-Dust Particle System (72 sparkling motes)
  const dustCount = 72;
  const dustPos = new Float32Array(dustCount * 3);
  const dustLife = new Float32Array(dustCount);
  const dustVel = Array.from({ length: dustCount }, () => new THREE.Vector3());
  let dustCursor = 0;

  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = pos.x;
    dustPos[i * 3 + 1] = pos.y + 0.3;
    dustPos[i * 3 + 2] = pos.z;
    dustLife[i] = 0;
  }

  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('aLife', new THREE.BufferAttribute(dustLife, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aLife;
      uniform float uPixelRatio;
      varying float vLife;
      void main() {
        vLife = aLife;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aLife, 0.0, 1.0) * 18.0 * uPixelRatio * (10.0 / max(1.8, -mv.z));
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vLife;
      void main() {
        if (vLife <= 0.01) discard;
        float d = length(gl_PointCoord - 0.5);
        float glow = exp(-d * d * 22.0) * clamp(vLife, 0.0, 1.0);
        if (glow < 0.02) discard;
        vec3 col = mix(vec3(0.48, 0.84, 1.0), vec3(1.0, 0.92, 0.52), vLife);
        gl_FragColor = vec4(col, glow);
      }
    `
  });
  scene.add(new THREE.Points(dustGeo, dustMat));

  function emitPixieMote(spread = 0.14, upBoost = 0.25) {
    const idx = dustCursor;
    dustCursor = (dustCursor + 1) % dustCount;
    dustPos[idx * 3] = pos.x + (Math.random() - 0.5) * spread;
    dustPos[idx * 3 + 1] = pos.y + 0.26 + Math.random() * 0.18;
    dustPos[idx * 3 + 2] = pos.z + (Math.random() - 0.5) * spread;
    dustLife[idx] = 1.0;
    dustVel[idx].set(
      (Math.random() - 0.5) * 0.28,
      0.16 + Math.random() * upBoost,
      (Math.random() - 0.5) * 0.28
    );
  }

  // Exploration State Machine
  let wpIndex = 1 % Math.max(1, waypoints.length);
  let targetPos = new THREE.Vector3(
    (waypoints[wpIndex] || startWp).x,
    0,
    (waypoints[wpIndex] || startWp).z
  );
  let hasPlayerTarget = false;
  let pauseTimer = 0.8;
  let joySpinTimer = 0;
  let stridePhase = 0;
  let heading = 0.25;
  let dustAccum = 0;
  const lanternWorldTmp = new THREE.Vector3();
  const headScreenProj = new THREE.Vector3();

  function walkTo(tx, tz, whisper = '') {
    const cx = clamp(tx, -8.5, 8.5);
    const cz = clamp(tz, -6.8, 5.2);
    targetPos.set(cx, meadowHeight(cx, cz), cz);
    hasPlayerTarget = true;
    pauseTimer = 0;
    destRing.position.set(cx, meadowHeight(cx, cz) + 0.04, cz);
    destRing.material.opacity = 0.82;
    if (whisper) {
      onArrivalWhisper(whisper);
    }
  }

  function nudge(dx, dz) {
    walkTo(pos.x + dx, pos.z + dz);
  }

  function triggerJoySpin(customWhisper = '') {
    joySpinTimer = 1.15;
    for (let i = 0; i < 18; i++) {
      emitPixieMote(0.32, 0.58);
    }
    if (customWhisper) {
      onArrivalWhisper(customWhisper);
    }
  }

  function update(dt, timeSec, pixelRatio = 1) {
    dustMat.uniforms.uPixelRatio.value = pixelRatio;

    // Fade destination ring smoothly
    if (hasPlayerTarget) {
      const pulse = 0.88 + 0.16 * Math.sin(timeSec * 6.0);
      destRing.scale.setScalar(pulse);
    } else if (destRing.material.opacity > 0.01) {
      destRing.material.opacity = Math.max(0, destRing.material.opacity - dt * 1.4);
    }

    // Autonomous or player-guided locomotion
    if (pauseTimer > 0) {
      pauseTimer -= dt;
      // Gentle curious hover & look-around while admiring flowers
      rig.bodyPivot.position.y = 0.08 + Math.sin(timeSec * 3.4) * 0.032;
      rig.headGroup.rotation.y = Math.sin(timeSec * 2.1) * 0.28;
    } else {
      const dx = targetPos.x - pos.x;
      const dz = targetPos.z - pos.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 0.16) {
        if (hasPlayerTarget) {
          hasPlayerTarget = false;
          pauseTimer = 2.6;
          triggerJoySpin();
        } else if (waypoints.length > 0) {
          const arrivedWp = waypoints[wpIndex];
          if (arrivedWp?.whisper) {
            onArrivalWhisper(arrivedWp.whisper);
          }
          pauseTimer = 2.4 + Math.random() * 1.4;
          wpIndex = (wpIndex + 1) % waypoints.length;
          const next = waypoints[wpIndex];
          targetPos.set(next.x, meadowHeight(next.x, next.z), next.z);
        }
      } else {
        const speed = hasPlayerTarget ? 1.55 : 0.92;
        const step = Math.min(dist, speed * dt);
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
        pos.y = meadowHeight(pos.x, pos.z);

        const desiredHeading = Math.atan2(dx, dz);
        let diff = desiredHeading - heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        heading += diff * Math.min(1, dt * 6.5);

        stridePhase += dt * (hasPlayerTarget ? 12.5 : 8.8);
        rig.bodyPivot.position.y = 0.065 + Math.abs(Math.sin(stridePhase)) * 0.055;
        rig.leftLeg.rotation.x = Math.sin(stridePhase) * 0.55;
        rig.rightLeg.rotation.x = -Math.sin(stridePhase) * 0.55;
        rig.headGroup.rotation.y *= 0.88;
      }
    }

    // Joyous 360° leap-spin when clicked or arriving!
    let extraSpin = 0;
    if (joySpinTimer > 0) {
      joySpinTimer = Math.max(0, joySpinTimer - dt);
      const p = 1.0 - joySpinTimer / 1.15;
      extraSpin = p * Math.PI * 2;
      rig.bodyPivot.position.y += Math.sin(p * Math.PI) * 0.28;
    }

    root.position.copy(pos);
    root.rotation.y = heading + extraSpin;

    // Gossamer butterfly wing flutter
    const flapSpeed = joySpinTimer > 0 || hasPlayerTarget ? 22.0 : 14.5;
    const flap = 0.38 + Math.sin(timeSec * flapSpeed) * 0.34;
    wingUpperR.rotation.y = -flap;
    wingUpperL.rotation.y = flap;
    wingLowerR.rotation.y = -flap * 0.82 - 0.1;
    wingLowerL.rotation.y = flap * 0.82 + 0.1;

    // Swinging star-lantern & hat tip bell
    rig.lanternBell.rotation.z = Math.sin(timeSec * 3.8 + stridePhase * 0.5) * 0.16;
    lanternAura.scale.setScalar(0.92 + 0.14 * Math.sin(timeSec * 5.2));
    rig.hatGroup.rotation.z = rig.hatBaseRotZ + Math.sin(stridePhase * 0.5) * 0.06;

    // Update trailing pixie dust
    dustAccum += dt;
    if (dustAccum > 0.045) {
      dustAccum = 0;
      emitPixieMote(0.10, 0.22);
    }
    for (let i = 0; i < dustCount; i++) {
      if (dustLife[i] > 0) {
        dustLife[i] = Math.max(0, dustLife[i] - dt * 0.68);
        dustPos[i * 3] += dustVel[i].x * dt;
        dustPos[i * 3 + 1] += dustVel[i].y * dt;
        dustPos[i * 3 + 2] += dustVel[i].z * dt;
      }
    }
    dustGeo.attributes.position.needsUpdate = true;
    dustGeo.attributes.aLife.needsUpdate = true;
  }

  function getLanternWorldPos(target = lanternWorldTmp) {
    root.updateMatrixWorld();
    return rig.lanternBell.getWorldPosition(target);
  }

  function getHeadScreenPos(camera, width, height) {
    headScreenProj.set(pos.x, pos.y + 0.72, pos.z);
    headScreenProj.project(camera);
    const visible = headScreenProj.z < 1.0 && Math.abs(headScreenProj.x) <= 1.05 && Math.abs(headScreenProj.y) <= 1.05;
    return {
      x: (headScreenProj.x * 0.5 + 0.5) * width,
      y: (-headScreenProj.y * 0.5 + 0.5) * height,
      visible
    };
  }

  return {
    root,
    hitSphere,
    isGlbLoaded: () => rig.glbLoaded,
    getPosition: () => pos,
    getHeading: () => heading,
    getLanternWorldPos,
    getHeadScreenPos,
    walkTo,
    nudge,
    triggerJoySpin,
    update
  };
}

/**
 * Build all sculpted 3D Fairy-Tale Landmarks, Stepping Stones, Boulders & Interactive Wonder Props!
 */
export function createFairytaleWorldProps({
  scene,
  meadowHeight,
  pathCurve,
  rng
}) {
  const raycastTargets = [];
  const wonderAnchors = new Map();
  const dummy = new THREE.Object3D();

  function registerWonder(id, worldPos, hitRadius = 0.95, yLift = 0.45) {
    const anchor = worldPos.clone();
    anchor.y += yLift;
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(hitRadius, 12, 12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.copy(anchor);
    hit.userData.wonderId = id;
    scene.add(hit);
    raycastTargets.push(hit);
    wonderAnchors.set(id, anchor);
    return anchor;
  }

  // ==========================================================================
  // 1. STEPPING STONES & MOSSY HILLSIDE BOULDERS ALONG THE WINDING PATH
  // ==========================================================================
  const stoneCount = 64;
  const stoneGeo = new THREE.DodecahedronGeometry(0.18, 1);
  const stoneMat = new THREE.MeshLambertMaterial({
    color: 0xd6cfc2,
    emissive: 0x3b352c,
    emissiveIntensity: 0.68
  });
  const stoneInstanced = new THREE.InstancedMesh(stoneGeo, stoneMat, stoneCount);
  const stoneTints = [
    new THREE.Color('#e7e0d3'),
    new THREE.Color('#cbd5e1'),
    new THREE.Color('#d6d3d1'),
    new THREE.Color('#b8c4bb')
  ];

  let sIdx = 0;
  // 46 flat river-cobble stepping & verge stones hugging the winding trail
  for (let i = 0; i < 46; i++) {
    const t = 0.04 + (i / 46) * 0.90;
    const pt = pathCurve.getPointAt(t);
    const tang = pathCurve.getTangentAt(t);
    const side = i % 3 === 0 ? (rng() - 0.5) * 0.28 : (i % 2 === 0 ? 1 : -1) * (0.38 + rng() * 0.20);
    const sx = pt.x - tang.z * side;
    const sz = pt.z + tang.x * side;
    const sy = meadowHeight(sx, sz);

    dummy.position.set(sx, sy + 0.012, sz);
    dummy.rotation.set((rng() - 0.5) * 0.18, rng() * Math.PI * 2, (rng() - 0.5) * 0.18);
    const isCenterSlab = Math.abs(side) < 0.22;
    dummy.scale.set(
      isCenterSlab ? 1.25 + rng() * 0.45 : 0.55 + rng() * 0.45,
      isCenterSlab ? 0.16 : 0.28 + rng() * 0.20,
      isCenterSlab ? 0.95 + rng() * 0.35 : 0.50 + rng() * 0.40
    );
    dummy.updateMatrix();
    stoneInstanced.setMatrixAt(sIdx, dummy.matrix);
    stoneInstanced.setColorAt(sIdx, stoneTints[sIdx % stoneTints.length]);
    sIdx++;
  }

  // 18 larger mossy boulders tucked into the earthen slope ("土坡") embankments!
  const boulderCoords = [
    [-2.95, 2.85], [-3.65, 1.35], [2.15, 2.35], [3.45, 1.55], [2.95, -0.95],
    [1.85, -2.85], [-2.55, -1.65], [-3.25, -3.85], [0.95, -4.45], [-0.85, -5.05],
    [3.85, 0.25], [-1.85, 4.35], [2.45, 3.45], [-4.15, -0.45], [3.25, -2.35],
    [-1.15, 0.65], [1.95, 0.85], [-2.35, -4.65]
  ];
  for (let i = 0; i < boulderCoords.length && sIdx < stoneCount; i++) {
    const [bx, bz] = boulderCoords[i];
    const by = meadowHeight(bx, bz);
    dummy.position.set(bx, by + 0.05, bz);
    dummy.rotation.set(rng() * 0.4, rng() * Math.PI * 2, rng() * 0.4);
    dummy.scale.set(1.3 + rng() * 0.9, 0.72 + rng() * 0.55, 1.1 + rng() * 0.8);
    dummy.updateMatrix();
    stoneInstanced.setMatrixAt(sIdx, dummy.matrix);
    stoneInstanced.setColorAt(sIdx, new THREE.Color('#8c9e95'));
    sIdx++;
  }
  stoneInstanced.instanceMatrix.needsUpdate = true;
  if (stoneInstanced.instanceColor) stoneInstanced.instanceColor.needsUpdate = true;
  scene.add(stoneInstanced);

  // Ambient scene hemisphere & moonlight for sculpted PBR fairytale props
  const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x1e293b, 1.35);
  const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.65);
  dirLight.position.set(6, 12, 5);
  scene.add(hemiLight, dirLight);

  const loadedPropPacks = new Set();

  // ==========================================================================
  // 2. WONDER #1: COZY HILLTOP STORYBOOK COTTAGE (山丘暖光童话小屋)
  // ==========================================================================
  const cottagePos = new THREE.Vector3(-1.85, meadowHeight(-1.85, -5.35), -5.35);
  const cottageGroup = new THREE.Group();
  cottageGroup.position.copy(cottagePos);
  cottageGroup.rotation.y = 0.34;
  scene.add(cottageGroup);

  const cottageFallback = new THREE.Group();
  const walls = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.68, 0.74, 18),
    new THREE.MeshLambertMaterial({ color: 0xe2d5c1 })
  );
  walls.position.y = 0.35;
  const roofLower = new THREE.Mesh(
    new THREE.ConeGeometry(0.88, 0.56, 20),
    new THREE.MeshLambertMaterial({ color: 0x3b4d6b })
  );
  roofLower.position.y = 0.94;
  const roofPeak = new THREE.Mesh(
    new THREE.ConeGeometry(0.52, 0.48, 18),
    new THREE.MeshLambertMaterial({ color: 0x47597a })
  );
  roofPeak.position.set(-0.04, 1.28, 0);
  roofPeak.rotation.z = 0.12;

  const chimney = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.11, 0.46, 10),
    new THREE.MeshLambertMaterial({ color: 0x785549 })
  );
  chimney.position.set(0.36, 1.26, -0.12);

  // Warm golden glowing fairytale windows & arched door!
  const warmWinMat = new THREE.MeshBasicMaterial({ color: 0xfde08a });
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.38, 0.08), new THREE.MeshLambertMaterial({ color: 0x7c2d12 }));
  doorMesh.position.set(0, 0.20, 0.64);
  const doorWin = new THREE.Mesh(new THREE.CircleGeometry(0.065, 14), warmWinMat);
  doorWin.position.set(0, 0.27, 0.685);

  const sideWinL = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.22), warmWinMat);
  sideWinL.position.set(-0.38, 0.40, 0.52);
  sideWinL.rotation.y = -0.58;
  const sideWinR = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.22), warmWinMat);
  sideWinR.position.set(0.38, 0.40, 0.52);
  sideWinR.rotation.y = 0.58;
  cottageFallback.add(walls, roofLower, roofPeak, chimney, doorMesh, doorWin, sideWinL, sideWinR);

  const cottageGlow = new THREE.Mesh(
    new THREE.SphereGeometry(1.32, 18, 14),
    createSoftGlowMaterial(0xfbbf24, 0.38, 2.8)
  );
  cottageGlow.position.y = 0.48;
  const cottageDoorLight = new THREE.PointLight(0xfde047, 1.45, 5.2, 1.45);
  cottageDoorLight.position.set(0, 0.52, 0.92);
  cottageGroup.add(cottageFallback, cottageGlow, cottageDoorLight);
  registerWonder('wonder-cottage', cottagePos, 1.25, 0.72);

  const chimneyEmitWorld = new THREE.Vector3(
    cottagePos.x + 0.32,
    cottagePos.y + 1.48,
    cottagePos.z - 0.10
  );

  loadFairytaleGlb('./assets/models/storybook_cottage.glb')
    .then((gltf) => {
      const cottageModel = gltf.scene;
      cottageModel.scale.setScalar(1.06);
      cottageGroup.remove(cottageFallback);
      cottageGroup.add(cottageModel);
      // Compute world position of the sculpted stone chimney rim (local [0.35, 1.56, -0.10] * 1.06)
      const localChimney = new THREE.Vector3(0.35 * 1.06, 1.56 * 1.06, -0.10 * 1.06);
      localChimney.applyAxisAngle(new THREE.Vector3(0, 1, 0), cottageGroup.rotation.y);
      chimneyEmitWorld.copy(cottagePos).add(localChimney);
      loadedPropPacks.add('storybook_cottage');
    })
    .catch((err) => {
      console.warn('[fairytale-props] Fallback cottage active:', err);
    });

  // Rising Chimney Heart/Starlight Smoke Puffs (soft radial glow spheres!)
  const smokePuffs = [];
  for (let i = 0; i < 9; i++) {
    const puffMat = createSoftGlowMaterial(i % 2 === 0 ? 0xfef08a : 0xfda4af, 0.0, 2.4);
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), puffMat);
    scene.add(puff);
    smokePuffs.push({ mesh: puff, mat: puffMat, age: i * 0.35, active: true, boost: 0 });
  }

  // ==========================================================================
  // 3. WONDER #2: GLOWING 7-MUSHROOM FAIRY RING (荧光唱歌蘑菇圈 on Right Knoll)
  // ==========================================================================
  const ringCenter = new THREE.Vector3(2.35, meadowHeight(2.35, -0.15), -0.15);
  const mushroomGroup = new THREE.Group();
  scene.add(mushroomGroup);

  const ringFloorGlow = new THREE.Mesh(
    new THREE.CircleGeometry(0.76, 32),
    createGroundGlowDiscMaterial(0xc084fc, 0.28)
  );
  ringFloorGlow.rotation.x = -Math.PI * 0.5;
  ringFloorGlow.position.set(ringCenter.x, ringCenter.y + 0.025, ringCenter.z);
  mushroomGroup.add(ringFloorGlow);

  const capColors = [0xf43f5e, 0x38bdf8, 0xa855f7, 0xfb7185, 0xfacc15, 0x60a5fa, 0xc084fc];
  const mushroomNodes = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.25;
    const r = 0.44 + (i % 2) * 0.08;
    const mx = ringCenter.x + Math.cos(a) * r;
    const mz = ringCenter.z + Math.sin(a) * r;
    const my = meadowHeight(mx, mz);

    const mNode = new THREE.Group();
    mNode.position.set(mx, my, mz);
    const scale = 1.18 + (i % 3) * 0.24;
    mNode.scale.setScalar(scale);

    const mFallback = new THREE.Group();
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.042, 0.22, 12),
      new THREE.MeshBasicMaterial({ color: 0xfef3c7 })
    );
    stalk.position.y = 0.11;

    const capCol = capColors[i % capColors.length];
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.128, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
      new THREE.MeshLambertMaterial({
        color: capCol,
        emissive: capCol,
        emissiveIntensity: 0.32
      })
    );
    cap.position.y = 0.19;

    // 5 creamy glowing polka-dots on each mushroom cap
    for (let d = 0; d < 5; d++) {
      const da = (d / 5) * Math.PI * 2 + i;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.020, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      dot.position.set(Math.cos(da) * 0.076, 0.265, Math.sin(da) * 0.076);
      mFallback.add(dot);
    }
    mFallback.add(stalk, cap);

    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 14, 10),
      createSoftGlowMaterial(capColors[i % capColors.length], 0.40, 2.6)
    );
    aura.position.y = 0.20;

    mNode.add(mFallback, aura);
    mushroomGroup.add(mNode);
    mushroomNodes.push({ group: mNode, fallback: mFallback, baseScale: scale, phase: i * 0.9 });
  }
  registerWonder('wonder-mushrooms', ringCenter, 0.96, 0.34);

  loadFairytaleGlb('./assets/models/mushroom_cluster.glb')
    .then((gltf) => {
      const archetypes = ['MushroomA', 'MushroomC', 'MushroomB', 'MushroomA', 'MushroomD', 'MushroomC', 'MushroomB']
        .map((name) => gltf.scene.getObjectByName(name))
        .filter(Boolean);
      if (archetypes.length > 0) {
        mushroomNodes.forEach((mn, idx) => {
          const clone = archetypes[idx % archetypes.length].clone(true);
          clone.position.set(0, 0, 0);
          clone.rotation.y = idx * 1.15;
          mn.group.remove(mn.fallback);
          mn.group.add(clone);
        });
      }
      loadedPropPacks.add('mushroom_cluster');
    })
    .catch((err) => {
      console.warn('[fairytale-props] Fallback mushrooms active:', err);
    });

  // ==========================================================================
  // 4. WONDER #3: WOODEN CROSSROADS SIGNPOST & GLOWING BLUEBIRD (童话指路木牌)
  // ==========================================================================
  const signPos = new THREE.Vector3(-0.62, meadowHeight(-0.62, 1.65), 1.65);
  const signGroup = new THREE.Group();
  signGroup.position.copy(signPos);
  scene.add(signGroup);

  const signFallback = new THREE.Group();
  const postMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.046, 0.72, 10),
    new THREE.MeshLambertMaterial({ color: 0x78350f })
  );
  postMesh.position.y = 0.34;
  postMesh.rotation.z = 0.05;

  const signPivot = new THREE.Group();
  signPivot.position.y = 0.58;
  const board1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.095, 0.028),
    new THREE.MeshLambertMaterial({ color: 0xb45309 })
  );
  board1.position.set(0.10, 0.04, 0);
  board1.rotation.y = 0.25;
  const board2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.09, 0.028),
    new THREE.MeshLambertMaterial({ color: 0x92400e })
  );
  board2.position.set(-0.10, -0.08, 0);
  board2.rotation.y = -0.42;

  // Tiny glowing cyan fairytale songbird perched atop the signpost!
  const bluebird = new THREE.Group();
  bluebird.position.set(0, 0.14, 0);
  const birdBody = new THREE.Mesh(
    new THREE.SphereGeometry(0.042, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
  );
  birdBody.scale.set(1.25, 0.95, 0.9);
  const birdBeak = new THREE.Mesh(
    new THREE.ConeGeometry(0.014, 0.035, 6),
    new THREE.MeshBasicMaterial({ color: 0xfacc15 })
  );
  birdBeak.rotation.z = -Math.PI * 0.5;
  birdBeak.position.set(0.055, 0.008, 0);
  bluebird.add(birdBody, birdBeak);

  signPivot.add(board1, board2, bluebird);
  signFallback.add(postMesh, signPivot);
  signGroup.add(signFallback);
  registerWonder('wonder-signpost', signPos, 0.82, 0.45);

  const signRig = {
    pivot: signPivot,
    bird: bluebird,
    birdBaseY: 0.14
  };

  // ==========================================================================
  // 5. WONDER #4: WROUGHT-IRON FAIRY STREETLAMPS & WISHING BELL (许愿风铃路灯)
  // ==========================================================================
  const lampSpecs = [
    { x: -2.45, z: 0.35, rotY: 0.45, isHero: true },
    { x: 1.05, z: 0.15, rotY: -2.35, isHero: false },
    { x: -0.95, z: -3.25, rotY: 0.65, isHero: false }
  ];
  const lampPositions = [];
  const lampBells = [];

  for (const sp of lampSpecs) {
    const ly = meadowHeight(sp.x, sp.z);
    const lGroup = new THREE.Group();
    lGroup.position.set(sp.x, ly, sp.z);
    lGroup.rotation.y = sp.rotY;
    scene.add(lGroup);

    const lampFallback = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.036, 1.08, 10),
      new THREE.MeshLambertMaterial({ color: 0x334155 })
    );
    pole.position.y = 0.54;

    const crook = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.018, 8, 18, Math.PI * 1.15),
      new THREE.MeshLambertMaterial({ color: 0x334155 })
    );
    crook.position.set(0.16, 1.06, 0);

    const lantern = new THREE.Group();
    lantern.position.set(0.32, 0.96, 0);
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058, 0.044, 0.13, 6),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 16, 14),
      createSoftGlowMaterial(0xfbbf24, 0.62, 2.7)
    );
    const ptLight = new THREE.PointLight(0xfbbf24, 0.92, 3.8, 1.55);
    lantern.add(glass, glow, ptLight);
    lampFallback.add(pole, crook, lantern);
    lGroup.add(lampFallback);

    const worldLamp = new THREE.Vector3(
      sp.x + Math.cos(sp.rotY) * 0.34,
      ly + 0.96,
      sp.z - Math.sin(sp.rotY) * 0.34
    );
    lampPositions.push(worldLamp);
    lampBells.push({ group: lGroup, fallback: lampFallback, lantern, glow, ptLight });

    if (sp.isHero) {
      registerWonder('wonder-bell-lamp', new THREE.Vector3(sp.x, ly, sp.z), 0.95, 0.65);
    }
  }

  // ==========================================================================
  // 6. WONDER #5: MOONLIT GIANT DANDELION PUFFS (月光蒲公英绒球簇 + 飘飞种子)
  // ==========================================================================
  const dandCenter = new THREE.Vector3(1.42, meadowHeight(1.42, -2.05), -2.05);
  const dandGroup = new THREE.Group();
  scene.add(dandGroup);

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const dx = dandCenter.x + Math.cos(a) * (i === 0 ? 0 : 0.28);
    const dz = dandCenter.z + Math.sin(a) * (i === 0 ? 0 : 0.28);
    const dy = meadowHeight(dx, dz);
    const h = 0.44 + (i % 3) * 0.11;

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.010, 0.014, h, 8),
      new THREE.MeshLambertMaterial({ color: 0x4d7c0f })
    );
    stem.position.set(dx, dy + h * 0.5, dz);

    const puffOuter = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.115 + (i === 0 ? 0.025 : 0), 2),
      new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        wireframe: true,
        transparent: true,
        opacity: 0.52
      })
    );
    puffOuter.position.set(dx, dy + h, dz);

    const puffInner = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 14, 12),
      createSoftGlowMaterial(0xfef9c3, 0.55, 2.5)
    );
    puffInner.position.copy(puffOuter.position);
    dandGroup.add(stem, puffOuter, puffInner);
  }
  registerWonder('wonder-dandelions', dandCenter, 0.88, 0.42);

  // 42 Floating Parachute Seed Wishes
  const seedCount = 42;
  const seedMeshes = [];
  const seedMat = new THREE.MeshBasicMaterial({
    color: 0xfef9c3,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  for (let i = 0; i < seedCount; i++) {
    const sm = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), seedMat);
    sm.position.set(
      dandCenter.x + (rng() - 0.5) * 0.9,
      dandCenter.y + 0.35 + rng() * 1.4,
      dandCenter.z + (rng() - 0.5) * 0.9
    );
    scene.add(sm);
    seedMeshes.push({
      mesh: sm,
      vx: (rng() - 0.35) * 0.25,
      vy: 0.08 + rng() * 0.18,
      vz: (rng() - 0.5) * 0.22,
      phase: rng() * Math.PI * 2
    });
  }

  // ==========================================================================
  // 7. WONDER #6: MIRROR-MOONLIGHT DEW POND & WATER-LILIES (星影睡莲露珠潭)
  // ==========================================================================
  const pondPos = new THREE.Vector3(-1.18, meadowHeight(-1.18, 3.45) + 0.028, 3.45);
  const pondGroup = new THREE.Group();
  pondGroup.position.copy(pondPos);
  scene.add(pondGroup);

  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uSplash: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSplash;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        if (r > 1.0) discard;
        float wave = sin(r * 22.0 - uTime * 3.8) * (0.10 + 0.34 * uSplash) * (1.0 - r);
        vec3 deep = vec3(0.07, 0.24, 0.52);
        vec3 refl = vec3(0.58, 0.88, 1.0);
        vec3 gold = vec3(1.0, 0.94, 0.62);
        vec3 col = mix(deep, refl, smoothstep(0.88, 0.08, r) * 0.62 + max(0.0, wave));
        col += gold * max(0.0, wave) * 1.45;
        float edge = 1.0 - smoothstep(0.84, 1.0, r);
        gl_FragColor = vec4(col, 0.88 * edge);
      }
    `
  });
  const waterDisc = new THREE.Mesh(new THREE.CircleGeometry(0.68, 36), waterMat);
  waterDisc.rotation.x = -Math.PI * 0.5;
  pondGroup.add(waterDisc);

  // 3 Floating Emerald Lily-Pads & Blooming Pink/Cream Water-Lilies
  const lotusSpots = [
    { x: 0.14, z: -0.08, r: 0.16, col: 0xf9a8d4 },
    { x: -0.20, z: 0.14, r: 0.13, col: 0xfef08a },
    { x: 0.06, z: 0.24, r: 0.11, col: 0xfda4af }
  ];
  for (const ls of lotusSpots) {
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(ls.r, 20, 0.25, Math.PI * 1.78),
      new THREE.MeshLambertMaterial({ color: 0x16a34a, emissive: 0x064e3b, emissiveIntensity: 0.5 })
    );
    pad.rotation.x = -Math.PI * 0.5;
    pad.position.set(ls.x, 0.012, ls.z);

    const lotus = new THREE.Group();
    lotus.position.set(ls.x, 0.032, ls.z);
    for (let k = 0; k < 6; k++) {
      const petal = new THREE.Mesh(
        new THREE.ConeGeometry(0.032, 0.075, 5),
        new THREE.MeshBasicMaterial({ color: ls.col })
      );
      const pa = (k / 6) * Math.PI * 2;
      petal.position.set(Math.cos(pa) * 0.026, 0.015, Math.sin(pa) * 0.026);
      petal.rotation.z = -Math.cos(pa) * 0.65;
      petal.rotation.x = Math.sin(pa) * 0.65;
      lotus.add(petal);
    }
    pondGroup.add(pad, lotus);
  }
  registerWonder('wonder-pond', pondPos, 0.90, 0.24);

  // ==========================================================================
  // 8. WONDER #7: MOSSY HOLLOW TREE STUMP & STARLIGHT HONEY JARS (树洞星光蜜罐)
  // ==========================================================================
  const stumpPos = new THREE.Vector3(2.68, meadowHeight(2.68, 2.78), 2.78);
  const stumpGroup = new THREE.Group();
  stumpGroup.position.copy(stumpPos);
  stumpGroup.rotation.y = -0.55;
  scene.add(stumpGroup);

  const stumpFallback = new THREE.Group();
  const bark = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.32, 0.34, 14),
    new THREE.MeshLambertMaterial({ color: 0x785549, emissive: 0x291d18, emissiveIntensity: 0.5 })
  );
  bark.position.y = 0.16;
  const jar1 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.062, 0.13, 12),
    new THREE.MeshBasicMaterial({ color: 0xfde047 })
  );
  jar1.position.set(-0.04, 0.38, 0.04);
  const jar2 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.050, 0.10, 12),
    new THREE.MeshBasicMaterial({ color: 0x7dd3fc })
  );
  jar2.position.set(0.08, 0.36, -0.03);
  stumpFallback.add(bark, jar1, jar2);

  const stumpGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 16, 12),
    createSoftGlowMaterial(0xfacc15, 0.52, 2.8)
  );
  stumpGlow.position.y = 0.38;
  stumpGroup.add(stumpFallback, stumpGlow);
  registerWonder('wonder-stump', stumpPos, 0.82, 0.35);

  let wishBottleArchetype = null;
  const wishBottleListeners = [];
  function onWishBottleReady(cb) {
    if (wishBottleArchetype) {
      cb(wishBottleArchetype.clone(true));
    } else {
      wishBottleListeners.push(cb);
    }
  }

  loadFairytaleGlb('./assets/models/fairytale_landmarks.glb')
    .then((gltf) => {
      // A. Sculpted Oak Signpost + Arrow Boards + Chubby Bluebird
      const signModel = gltf.scene.getObjectByName('SignpostProp');
      if (signModel) {
        const sClone = signModel.clone(true);
        sClone.position.set(0, 0, 0);
        sClone.scale.setScalar(1.06);
        signGroup.remove(signFallback);
        signGroup.add(sClone);
        const glbPivot = sClone.getObjectByName('SignPivotNode');
        const glbBird = sClone.getObjectByName('BluebirdNode');
        if (glbPivot) signRig.pivot = glbPivot;
        if (glbBird) {
          signRig.bird = glbBird;
          signRig.birdBaseY = glbBird.position.y;
        }
      }

      // B. 3 Scrolling Wrought-Iron Streetlamps + Swinging Brass Lantern Bells
      const lampModel = gltf.scene.getObjectByName('StreetlampProp');
      if (lampModel) {
        for (const lb of lampBells) {
          const lClone = lampModel.clone(true);
          lClone.position.set(0, 0, 0);
          lb.group.remove(lb.fallback);
          lb.group.add(lClone);
          const bellNode = lClone.getObjectByName('LampBellNode');
          if (bellNode) {
            lb.glow.position.set(0, -0.10, 0);
            lb.ptLight.position.set(0, -0.10, 0);
            bellNode.add(lb.glow, lb.ptLight);
            lb.lantern = bellNode;
          }
        }
      }

      // C. Gnarled Buttress-Root Hollow Stump + Linen-Topped Starlight Honey Jars
      const stumpModel = gltf.scene.getObjectByName('HollowStumpProp');
      if (stumpModel) {
        const stClone = stumpModel.clone(true);
        stClone.position.set(0, 0, 0);
        stClone.scale.setScalar(1.06);
        stumpGroup.remove(stumpFallback);
        stumpGroup.add(stClone);
      }

      // D. Faceted Crystal Apothecary Wish Bottle + Wax Seal + Love Scroll
      const bottleModel = gltf.scene.getObjectByName('WishBottleProp');
      if (bottleModel) {
        wishBottleArchetype = bottleModel;
        while (wishBottleListeners.length > 0) {
          const fn = wishBottleListeners.shift();
          fn(bottleModel.clone(true));
        }
      }

      loadedPropPacks.add('fairytale_landmarks');
    })
    .catch((err) => {
      console.warn('[fairytale-props] Fallback landmarks active:', err);
    });

  // Interactive Animation Timers for Wonders
  const activeAnims = {
    mushroomBounce: 0,
    signSpin: 0,
    bellChime: 0,
    cottageHearts: 0,
    dandelionGust: 0,
    pondSplash: 0,
    stumpSparkle: 0
  };

  function triggerWonderEffect(wonderId) {
    if (wonderId === 'wonder-mushrooms') activeAnims.mushroomBounce = 1.6;
    if (wonderId === 'wonder-signpost') activeAnims.signSpin = 1.4;
    if (wonderId === 'wonder-bell-lamp') activeAnims.bellChime = 1.8;
    if (wonderId === 'wonder-cottage') activeAnims.cottageHearts = 2.5;
    if (wonderId === 'wonder-dandelions') {
      activeAnims.dandelionGust = 2.8;
      for (const s of seedMeshes) {
        s.mesh.position.set(
          dandCenter.x + (Math.random() - 0.5) * 0.45,
          dandCenter.y + 0.45,
          dandCenter.z + (Math.random() - 0.5) * 0.45
        );
        s.vy = 0.32 + Math.random() * 0.45;
      }
    }
    if (wonderId === 'wonder-pond') activeAnims.pondSplash = 1.5;
    if (wonderId === 'wonder-stump') activeAnims.stumpSparkle = 1.5;
  }

  function update(dt, timeSec) {
    waterMat.uniforms.uTime.value = timeSec;

    // 1. Cottage chimney rising warm starlight smoke
    if (activeAnims.cottageHearts > 0) activeAnims.cottageHearts = Math.max(0, activeAnims.cottageHearts - dt);
    const smokeSpeed = activeAnims.cottageHearts > 0 ? 1.85 : 0.75;
    for (let i = 0; i < smokePuffs.length; i++) {
      const sp = smokePuffs[i];
      sp.age = (sp.age + dt * smokeSpeed) % 3.2;
      const p = sp.age / 3.2;
      sp.mesh.position.set(
        chimneyEmitWorld.x + Math.sin(timeSec * 1.6 + i) * 0.14 * p,
        chimneyEmitWorld.y + p * 1.45,
        chimneyEmitWorld.z + Math.cos(timeSec * 1.2 + i) * 0.10 * p
      );
      const scale = (0.7 + p * 1.7) * (activeAnims.cottageHearts > 0 ? 1.35 : 1.0);
      sp.mesh.scale.setScalar(scale);
      sp.mat.uniforms.uIntensity.value = Math.sin(p * Math.PI) * (activeAnims.cottageHearts > 0 ? 0.85 : 0.46);
    }

    // 2. Mushroom ring gentle breathing + musical bounce wave
    if (activeAnims.mushroomBounce > 0) activeAnims.mushroomBounce = Math.max(0, activeAnims.mushroomBounce - dt);
    for (let i = 0; i < mushroomNodes.length; i++) {
      const mn = mushroomNodes[i];
      const bounce = activeAnims.mushroomBounce > 0
        ? Math.abs(Math.sin(timeSec * 10.0 + mn.phase)) * 0.32 * (activeAnims.mushroomBounce / 1.6)
        : Math.sin(timeSec * 2.2 + mn.phase) * 0.04;
      mn.group.scale.set(
        mn.baseScale * (1.0 - bounce * 0.2),
        mn.baseScale * (1.0 + bounce),
        mn.baseScale * (1.0 - bounce * 0.2)
      );
    }

    // 3. Signpost & perched glowing bluebird
    if (activeAnims.signSpin > 0) {
      activeAnims.signSpin = Math.max(0, activeAnims.signSpin - dt);
      const t = 1.0 - activeAnims.signSpin / 1.4;
      signRig.pivot.rotation.y = Math.sin(t * Math.PI * 2) * Math.PI;
      signRig.bird.position.y = signRig.birdBaseY + Math.sin(t * Math.PI) * 0.26;
    } else {
      signRig.pivot.rotation.y = Math.sin(timeSec * 1.1) * 0.04;
      signRig.bird.position.y = signRig.birdBaseY + Math.abs(Math.sin(timeSec * 3.4)) * 0.025;
    }

    // 4. Streetlamp wishing-bell sway & glow
    if (activeAnims.bellChime > 0) activeAnims.bellChime = Math.max(0, activeAnims.bellChime - dt);
    for (let i = 0; i < lampBells.length; i++) {
      const lb = lampBells[i];
      const swing = activeAnims.bellChime > 0 ? 0.28 * (activeAnims.bellChime / 1.8) : 0.05;
      lb.lantern.rotation.z = Math.sin(timeSec * 4.5 + i) * swing;
      lb.glow.scale.setScalar(1.0 + 0.14 * Math.sin(timeSec * 3.6 + i) + (activeAnims.bellChime > 0 ? 0.35 : 0));
    }

    // 5. Floating dandelion parachute seeds
    if (activeAnims.dandelionGust > 0) activeAnims.dandelionGust = Math.max(0, activeAnims.dandelionGust - dt);
    for (const s of seedMeshes) {
      s.mesh.position.x += (s.vx + Math.sin(timeSec * 1.5 + s.phase) * 0.12) * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      if (s.mesh.position.y > dandCenter.y + 2.6) {
        s.mesh.position.set(
          dandCenter.x + (Math.random() - 0.5) * 0.65,
          dandCenter.y + 0.35,
          dandCenter.z + (Math.random() - 0.5) * 0.65
        );
        s.vy = 0.08 + Math.random() * 0.16;
      }
    }

    // 6. Dew pond splash
    if (activeAnims.pondSplash > 0) {
      activeAnims.pondSplash = Math.max(0, activeAnims.pondSplash - dt);
    }
    waterMat.uniforms.uSplash.value = activeAnims.pondSplash;

    // 7. Hollow stump starlight honey glow
    if (activeAnims.stumpSparkle > 0) {
      activeAnims.stumpSparkle = Math.max(0, activeAnims.stumpSparkle - dt);
    }
    stumpGlow.scale.setScalar(1.0 + 0.15 * Math.sin(timeSec * 3.2) + activeAnims.stumpSparkle * 0.45);
  }

  return {
    raycastTargets,
    wonderAnchors,
    lampPositions,
    onWishBottleReady,
    getLoadedPacks: () => [...loadedPropPacks],
    triggerWonderEffect,
    update
  };
}
