// Interactive Anime Town NPCs (7 Villagers), Vertex-Colored Critters & Persistent Pastel Butterflies.

import "@babylonjs/core/Meshes/thinInstanceMesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { instantiateGLB } from "./assets-loader.js";
import { createNameplateTag } from "./couple-rigged-controller.js";
import {
  POND_CONFIG,
  clamp,
  getWalkSurfaceY,
  getWorldTerrainY,
  hexToColor3,
  lerp,
  makePbrMat,
  mulberry32,
  registerCircleCollider,
} from "./world-spatial.js";
import {
  cloneMaterialSharingTextures,
  collectMeshes,
  findDescendantByName,
  mergeStaticChildrenByMaterial,
} from "./glb-helpers.js";

export function buildTownNPCsAndWildlifeSection(scene, root, models, shadowGen, fx) {
  const lifeRoot = new TransformNode("TownNPCsAndWildlifeGroup", scene);
  lifeRoot.parent = root;

  const interactables = [];
  const updaters = [];
  const resetters = [];
  const rng = mulberry32(84217);
  let nightMix = 0;

  const V = (x, y, z) => new Vector3(x, y, z);
  const yawToTarget = (fxX, fzZ, tx, tz) => Math.atan2(fxX - tx, fzZ - tz);

  // Shared zero-alpha pick proxy material for small critters (invisible yet pickable by scene.pick)
  const invisiblePickMat = new StandardMaterial("CritterHitProxyMat", scene);
  invisiblePickMat.alpha = 0.0;
  invisiblePickMat.disableLighting = true;
  invisiblePickMat.backFaceCulling = true;

  // Shared scenic prop materials
  const propWoodMat = makePbrMat(scene, "TownPropWood", 0x8f623e, { roughness: 0.68 });
  const propCreamMat = makePbrMat(scene, "TownPropCream", 0xf7efe0, { roughness: 0.72 });
  const propBrassMat = makePbrMat(scene, "TownPropBrass", 0xd4ad5b, { roughness: 0.28, metallic: 0.84 });
  const propTealMat = makePbrMat(scene, "TownPropTeal", 0x5aa69e, { roughness: 0.56 });
  const propCrustMat = makePbrMat(scene, "TownPropCrust", 0xd69648, { roughness: 0.78 });
  const propFlowerPinkMat = makePbrMat(scene, "TownPropFlowerPink", 0xf488ac, { roughness: 0.74 });
  const propFlowerBlueMat = makePbrMat(scene, "TownPropFlowerBlue", 0x7cb6f5, { roughness: 0.74 });
  const propLeafMat = makePbrMat(scene, "TownPropLeaf", 0x4b9952, { roughness: 0.78 });

  // Painted watercolor canvas texture for Sophie's harbor easel
  const easelTex = new DynamicTexture("SophieEaselCanvasTex", { width: 256, height: 192 }, scene, true);
  const eCtx = easelTex.getContext();
  const skyGrad = eCtx.createLinearGradient(0, 0, 0, 118);
  skyGrad.addColorStop(0, "#7ab8eb");
  skyGrad.addColorStop(0.65, "#cbe7f8");
  skyGrad.addColorStop(1, "#ffe7d6");
  eCtx.fillStyle = skyGrad;
  eCtx.fillRect(0, 0, 256, 192);
  eCtx.fillStyle = "#529b8e";
  eCtx.beginPath();
  eCtx.moveTo(0, 126);
  eCtx.quadraticCurveTo(64, 92, 128, 120);
  eCtx.lineTo(256, 120);
  eCtx.lineTo(256, 192);
  eCtx.lineTo(0, 192);
  eCtx.fill();
  eCtx.fillStyle = "#2b8ec2";
  eCtx.fillRect(0, 120, 256, 72);
  eCtx.fillStyle = "#fff8ee";
  eCtx.fillRect(184, 72, 16, 48);
  eCtx.fillStyle = "#d95b5b";
  eCtx.fillRect(182, 66, 20, 8);
  eCtx.fillStyle = "#ffffff";
  eCtx.beginPath();
  eCtx.moveTo(118, 134);
  eCtx.lineTo(128, 102);
  eCtx.lineTo(138, 134);
  eCtx.closePath();
  eCtx.fill();
  easelTex.update();
  const easelPaintMat = new PBRMaterial("SophieEaselPaintMat", scene);
  easelPaintMat.albedoTexture = easelTex;
  easelPaintMat.roughness = 0.72;
  easelPaintMat.metallic = 0;

  function makeBox(name, parent, x, y, z, w, h, d, mat, rx = 0, ry = 0, rz = 0) {
    const b = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    b.parent = parent;
    b.position.set(x, y, z);
    b.rotation.set(rx, ry, rz);
    b.material = mat;
    b.isPickable = false;
    b.receiveShadows = true;
    shadowGen?.addShadowCaster(b, false);
    return b;
  }

  function makeCyl(name, parent, x, y, z, dTop, dBot, h, mat, rx = 0, ry = 0, rz = 0, segs = 10) {
    const c = MeshBuilder.CreateCylinder(
      name,
      { diameterTop: dTop, diameterBottom: dBot, height: h, tessellation: segs },
      scene
    );
    c.parent = parent;
    c.position.set(x, y, z);
    c.rotation.set(rx, ry, rz);
    c.material = mat;
    c.isPickable = false;
    c.receiveShadows = true;
    shadowGen?.addShadowCaster(c, false);
    return c;
  }

  function buildNPCProp(kind, px, py, pz, yaw, npcId) {
    const pRoot = new TransformNode(`NPCProp_${npcId}`, scene);
    pRoot.parent = lifeRoot;
    pRoot.position.set(px, py, pz);
    pRoot.rotation.y = yaw;

    if (kind === "easel") {
      // Positioned in front of Painter Sophie, angled to look at Creek Bridge
      makeCyl("EaselLegL", pRoot, -0.26, 0.72, 0.08, 0.036, 0.04, 1.52, propWoodMat, -0.18, 0, -0.15);
      makeCyl("EaselLegR", pRoot, 0.26, 0.72, 0.08, 0.036, 0.04, 1.52, propWoodMat, -0.18, 0, 0.15);
      makeCyl("EaselLegB", pRoot, 0, 0.68, -0.28, 0.034, 0.038, 1.46, propWoodMat, 0.28, 0, 0);
      makeBox("EaselShelf", pRoot, 0, 0.84, 0.12, 0.72, 0.045, 0.11, propWoodMat, -0.18, 0, 0);
      makeBox("EaselFrame", pRoot, 0, 1.24, 0.05, 0.74, 0.56, 0.04, propWoodMat, -0.18, 0, 0);
      const canvas = makeBox("EaselArt", pRoot, 0, 1.24, 0.074, 0.66, 0.48, 0.012, easelPaintMat, -0.18, 0, 0);
      canvas.rotation.y = Math.PI;
    } else if (kind === "lyre") {
      makeCyl("LyreBase", pRoot, 0, 0.04, 0, 0.36, 0.42, 0.08, propWoodMat);
      makeCyl("LyreStand", pRoot, 0, 0.48, 0, 0.05, 0.07, 0.86, propWoodMat);
      makeCyl("LyreFrameL", pRoot, -0.16, 1.08, 0, 0.035, 0.042, 0.52, propBrassMat, 0, 0, 0.24);
      makeCyl("LyreFrameR", pRoot, 0.16, 1.08, 0, 0.035, 0.042, 0.52, propBrassMat, 0, 0, -0.24);
      makeBox("LyreTopBar", pRoot, 0, 1.32, 0, 0.46, 0.045, 0.05, propBrassMat);
      for (let si = -2; si <= 2; si += 1) {
        makeCyl(`LyreStr_${si}`, pRoot, si * 0.045, 1.09, 0, 0.008, 0.008, 0.42, propCreamMat, 0, 0, 0, 6);
      }
    } else if (kind === "basket") {
      makeCyl("BakerBasket", pRoot, 0, 0.18, 0, 0.52, 0.40, 0.34, propWoodMat);
      for (let bi = -1; bi <= 1; bi += 1) {
        makeCyl(`Loaf_${bi}`, pRoot, bi * 0.11, 0.39, (bi % 2) * 0.04, 0.08, 0.09, 0.38, propCrustMat, 1.25, bi * 0.3, 0.18);
      }
    } else if (kind === "wateringCan") {
      makeCyl("WaterCanBody", pRoot, 0, 0.16, 0, 0.24, 0.28, 0.30, propTealMat);
      makeCyl("WaterCanSpout", pRoot, 0.19, 0.22, 0, 0.03, 0.05, 0.24, propBrassMat, 0, 0, -0.95);
      makeCyl("FlowerPot", pRoot, -0.36, 0.15, 0.10, 0.34, 0.26, 0.28, propWoodMat);
      for (let fi = 0; fi < 5; fi += 1) {
        const a = (fi / 5) * Math.PI * 2;
        const fl = MeshBuilder.CreateSphere(`PotFlower_${fi}`, { diameter: 0.12, segments: 6 }, scene);
        fl.parent = pRoot;
        fl.position.set(-0.36 + Math.cos(a) * 0.08, 0.34 + (fi % 2) * 0.03, 0.10 + Math.sin(a) * 0.08);
        fl.material = fi % 2 === 0 ? propFlowerPinkMat : propFlowerBlueMat;
        fl.isPickable = false;
      }
      makeCyl("PotBush", pRoot, -0.36, 0.29, 0.10, 0.28, 0.22, 0.10, propLeafMat);
    } else if (kind === "fishingRod") {
      makeCyl("FishBucket", pRoot, 0, 0.16, 0, 0.32, 0.26, 0.30, propWoodMat);
      makeCyl("FishBucketRim", pRoot, 0, 0.29, 0, 0.33, 0.33, 0.04, propBrassMat);
      const rodTipPivot = new TransformNode(`AnglerRodPivot_${npcId}`, scene);
      rodTipPivot.parent = lifeRoot;
      rodTipPivot.position.set(44.62, py + 1.02, -11.55);
      makeCyl("BambooRod", rodTipPivot, 1.05, 0.36, 0, 0.016, 0.032, 2.35, propWoodMat, 0, 0, -1.24, 8);
      makeCyl("FishingLine", rodTipPivot, 2.12, -0.32, 0, 0.006, 0.006, 1.95, propCreamMat, 0, 0, 0, 5);
      updaters.push((elapsed) => {
        rodTipPivot.rotation.z = Math.sin(elapsed * 1.4) * 0.035;
      });
    } else if (kind === "pastryStand") {
      // Placed neatly on East end of Boathouse Cafe Counter Top (21.1, 2.48, -13.9)
      pRoot.position.set(21.05, 2.48, -13.92);
      makeCyl("PastryStem", pRoot, 0, 0.14, 0, 0.04, 0.08, 0.26, propBrassMat);
      makeCyl("PastryTier1", pRoot, 0, 0.12, 0, 0.38, 0.38, 0.025, propCreamMat, 0, 0, 0, 14);
      makeCyl("PastryTier2", pRoot, 0, 0.26, 0, 0.26, 0.26, 0.025, propCreamMat, 0, 0, 0, 14);
      for (let pi = 0; pi < 6; pi += 1) {
        const pa = (pi / 6) * Math.PI * 2;
        const mac = MeshBuilder.CreateSphere(`Macaron_${pi}`, { diameter: 0.085, segments: 6 }, scene);
        mac.parent = pRoot;
        mac.position.set(Math.cos(pa) * 0.12, 0.16, Math.sin(pa) * 0.12);
        mac.scaling.set(1, 0.62, 1);
        mac.material = pi % 2 === 0 ? propFlowerPinkMat : propCrustMat;
        mac.isPickable = false;
      }
    }
  }

  function tuneNPCMaterialsAndOutfit(meshes, spec) {
    const tintCol = spec.outfitTint ? hexToColor3(spec.outfitTint) : null;
    const hairTint = spec.hairTint ? hexToColor3(spec.hairTint) : null;
    const clonedMats = new Map();

    for (let i = 0; i < meshes.length; i += 1) {
      const m = meshes[i];
      m.alwaysSelectAsActiveMesh = true;
      m.receiveShadows = true;
      const mName = m.name || "";
      const matName = m.material?.name || "";
      const combined = `${mName}_${matName}`;
      const isDetail =
        /Face_Features|Features|EyeHighlight|EyeIris|EyeWhite|FaceBrow|FaceEyelash|FaceEyeline|FaceMouth|Eyes|Lash|Brows|Mouth|Lip|Ribbon|SakuraPin|RosePin/i.test(
          combined
        );

      if (shadowGen && !/Features|EyeHighlight|FaceBrow|FaceEyelash|FaceEyeline|Eyes|Lash|Brows|Mouth/i.test(combined)) {
        shadowGen.addShadowCaster(m, false);
      }

      if (m.material instanceof PBRMaterial) {
        const isHair = /Hair|HAIR/i.test(matName);
        const isCloth = /Tops|Bottoms|Shoes|Coat|Accessory|Cuff|Apron/i.test(matName) && !/SKIN|Face|Body/i.test(matName);
        const applyTint = isHair ? hairTint : isCloth ? tintCol : null;

        if (applyTint) {
          let cloned = clonedMats.get(m.material);
          if (!cloned) {
            cloned = cloneMaterialSharingTextures(m.material, `${spec.id}_${matName}`);
            const baseAlb = cloned.albedoColor ? cloned.albedoColor.clone() : Color3.White();
            cloned.albedoColor = baseAlb.multiply(applyTint);
            clonedMats.set(m.material, cloned);
          }
          m.material = cloned;
        }

        if (/Face_00|Body_00|Face|SKIN/i.test(matName) && !/Eyeline|Eyelash|Brow|Mouth/i.test(matName)) {
          m.material.emissiveColor = new Color3(0.11, 0.085, 0.075);
          m.material.roughness = Math.max(0.72, m.material.roughness || 0.76);
        } else if (/EyeIris|EyeHighlight|EyeWhite/i.test(matName)) {
          m.material.emissiveColor = new Color3(0.16, 0.16, 0.18);
        } else if (isHair) {
          m.material.emissiveColor = new Color3(0.055, 0.048, 0.052);
        } else if (isCloth) {
          m.material.emissiveColor = new Color3(0.035, 0.035, 0.042);
        }
      }

      const cleanOutline = !isDetail && !/Hair|Ribbon|Sash|Crown/i.test(combined) && m.material?.backFaceCulling !== false;
      if (cleanOutline) {
        m.renderOutline = true;
        m.outlineWidth = 0.0018;
        m.outlineColor = new Color3(0.2, 0.11, 0.16);
      } else {
        m.renderOutline = false;
      }
    }
  }

  function spawnTownNPC(spec, idx) {
    const container = models?.[spec.model];
    if (!container) return;

    const surfY = spec.y !== undefined ? spec.y : getWalkSurfaceY(spec.x, spec.z);
    const rootNode = new TransformNode(`NPCRoot_${spec.id}`, scene);
    rootNode.parent = lifeRoot;
    rootNode.position.set(spec.x, surfY, spec.z);
    const baseYaw = yawToTarget(spec.x, spec.z, spec.lookX, spec.lookZ);
    rootNode.rotation.y = baseYaw;

    // Facing normalization mirrors CoupleGLBHolder: glTF +Z rotated PI to align yaw=0 -> -Z
    const glbHolder = new TransformNode(`NPCGLBHolder_${spec.id}`, scene);
    glbHolder.parent = rootNode;
    glbHolder.rotation.y = Math.PI;

    const inst = instantiateGLB(container, `NPC_${spec.id}`, glbHolder);
    if (!inst) return;

    const meshes = collectMeshes(inst.rootNodes);
    tuneNPCMaterialsAndOutfit(meshes, spec);

    const morphs = { EyeBlink: [], Smile: [] };
    for (let i = 0; i < meshes.length; i += 1) {
      const mgr = meshes[i].morphTargetManager;
      if (!mgr) continue;
      for (let ti = 0; ti < mgr.numTargets; ti += 1) {
        const mt = mgr.getTarget(ti);
        mt.influence = 0;
        if (mt.name && morphs[mt.name]) morphs[mt.name].push(mt);
      }
    }

    let idleGrp = null;
    let waveGrp = null;
    for (const grp of inst.animationGroups || []) {
      const gn = grp.name || "";
      if (gn === "Idle" || gn.endsWith("_Idle") || gn.endsWith("/Idle")) {
        idleGrp = grp;
      } else if (gn === "Wave" || gn.endsWith("_Wave") || gn.endsWith("/Wave")) {
        waveGrp = grp;
      }
    }
    if (idleGrp) {
      idleGrp.stop();
      idleGrp.start(true, 0.90 + (idx % 4) * 0.06, idleGrp.from, idleGrp.to, false);
      if (typeof idleGrp.goToFrame === "function" && idleGrp.to > idleGrp.from) {
        idleGrp.goToFrame(lerp(idleGrp.from, idleGrp.to, (idx * 0.27) % 1.0));
      }
      idleGrp.setWeightForAllAnimatables(1.0);
    }
    if (waveGrp) {
      waveGrp.stop();
      waveGrp.setWeightForAllAnimatables(0);
    }

    const nameplate = createNameplateTag(scene, spec.id, spec.tagLabel, spec.accent, rootNode, {
      texWidth: 320,
      width: 0.96,
      height: 0.228,
      fontPx: 27,
      y: spec.height + 0.32,
      renderingGroupId: 0,
    });

    registerCircleCollider(spec.x, spec.z, 0.44, surfY - 0.35, surfY + 1.9);

    if (spec.prop) {
      const propYaw = spec.propFrontOffset
        ? baseYaw + Math.PI
        : baseYaw + (spec.propYawOffset || 0);
      const px = spec.propFrontOffset
        ? spec.x - Math.sin(baseYaw) * spec.propFrontOffset
        : spec.x + (spec.propDx || 0);
      const pz = spec.propFrontOffset
        ? spec.z - Math.cos(baseYaw) * spec.propFrontOffset
        : spec.z + (spec.propDz || 0);
      const py = spec.propY !== undefined ? spec.propY : getWalkSurfaceY(px, pz);
      buildNPCProp(spec.prop, px, py, pz, propYaw, spec.id);
    }

    const state = {
      waveTimer: 0,
      waveWeight: 0,
      lineIdx: 0,
      blinkClock: 1.1 + idx * 0.67,
    };

    const item = {
      id: spec.id,
      label: spec.interactLabel,
      position: V(spec.x, surfY, spec.z),
      radius: 2.5,
      floorY: surfY,
      activate(ctx = {}) {
        state.waveTimer = 2.8;
        const msg = spec.lines[state.lineIdx % spec.lines.length];
        state.lineIdx += 1;
        fx.burst(V(spec.x, surfY + spec.height * 0.72, spec.z), {
          count: 22,
          colors: spec.fxColors || [0xffe8a8, 0xffffff],
          speed: [0.5, 1.3],
          up: 1.1,
          size: 0.06,
          life: 1.3,
        });
        ctx.audio?.[spec.audioCue || "playDuetArpeggio"]?.();
        return msg;
      },
    };
    interactables.push(item);

    rootNode.metadata = { interactive: item };
    for (let i = 0; i < meshes.length; i += 1) {
      meshes[i].isPickable = true;
      meshes[i].metadata = { interactive: item };
    }

    updaters.push((elapsed, dt) => {
      // Gentle turn toward nearby camera/actor while waving, returning smoothly to scenic gaze
      if (state.waveTimer > 0) {
        state.waveTimer = Math.max(0, state.waveTimer - dt);
      }
      const targetWave = state.waveTimer > 0 ? 1.0 : 0.0;
      state.waveWeight = lerp(state.waveWeight, targetWave, clamp(dt * 8.0, 0, 1));

      // Strict Babylon 9 zero-weight NaN guard across Idle & Wave NLA groups
      if (waveGrp && idleGrp) {
        if (state.waveWeight <= 0.005) {
          if (waveGrp.isPlaying) {
            waveGrp.setWeightForAllAnimatables(0);
            waveGrp.stop();
          }
          if (!idleGrp.isPlaying) {
            idleGrp.start(true, 1.0, idleGrp.from, idleGrp.to, false);
          }
          idleGrp.setWeightForAllAnimatables(1.0);
        } else {
          if (!waveGrp.isPlaying) {
            waveGrp.start(true, 1.0, waveGrp.from, waveGrp.to, false);
          }
          if (!idleGrp.isPlaying) {
            idleGrp.start(true, 1.0, idleGrp.from, idleGrp.to, false);
          }
          const wWave = clamp(state.waveWeight, 0.006, 1.0);
          const wIdle = 1.0 - wWave;
          if (wIdle <= 0.005) {
            idleGrp.setWeightForAllAnimatables(0);
            idleGrp.stop();
            waveGrp.setWeightForAllAnimatables(1.0);
          } else {
            idleGrp.setWeightForAllAnimatables(wIdle);
            waveGrp.setWeightForAllAnimatables(wWave);
          }
        }
      }

      // Natural blinking + expressive warm smile morphs
      state.blinkClock -= dt;
      if (state.blinkClock <= -0.14) {
        state.blinkClock = 3.0 + rng() * 2.2;
      }
      const blinkVal = state.blinkClock < 0 ? Math.sin((-state.blinkClock / 0.14) * Math.PI) : 0;
      const smileVal = lerp(0.18, 0.92, clamp(state.waveWeight, 0, 1));
      for (let i = 0; i < morphs.EyeBlink.length; i += 1) morphs.EyeBlink[i].influence = blinkVal;
      for (let i = 0; i < morphs.Smile.length; i += 1) morphs.Smile[i].influence = smileVal;

      // Subtle living micro-sway of yaw toward visitor camera
      const camPos = scene.activeCamera?.position;
      if (camPos) {
        const dist = Vector3.Distance(camPos, rootNode.position);
        nameplate.isVisible = dist < 34.0;
        const lookAtCam = state.waveTimer > 0 && dist < 24.0;
        const desiredYaw = lookAtCam
          ? yawToTarget(spec.x, spec.z, camPos.x, camPos.z)
          : baseYaw + Math.sin(elapsed * 0.45 + idx * 1.4) * 0.06;
        let diff = ((desiredYaw - rootNode.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (diff < -Math.PI) diff += Math.PI * 2;
        rootNode.rotation.y += diff * clamp(dt * 4.5, 0, 1);
      }
    });

    resetters.push(() => {
      state.waveTimer = 0;
      state.waveWeight = 0;
      state.lineIdx = 0;
      if (waveGrp?.isPlaying) {
        waveGrp.setWeightForAllAnimatables(0);
        waveGrp.stop();
      }
      if (idleGrp) {
        if (!idleGrp.isPlaying) idleGrp.start(true, 1.0, idleGrp.from, idleGrp.to, false);
        idleGrp.setWeightForAllAnimatables(1.0);
      }
    });
  }

  // 7 Town Anime NPCs placed across scenic harbor, bridge, lighthouse, windmill & floral trails
  const npcSpecs = [
    {
      id: "npc-barista-lucy",
      model: "npc_vita",
      height: 1.58,
      tagLabel: "露西 · 咖啡师",
      interactLabel: "和露西聊聊港湾特调 ☕",
      accent: "#f59e6e",
      x: 22.3,
      y: 1.36,
      z: -13.2,
      lookX: 20.4,
      lookZ: -9.5,
      outfitTint: 0xffe4ea,
      hairTint: 0xfff5ec,
      prop: "pastryStand",
      fxColors: [0xffd8b2, 0xfff5e4, 0xf7a2be],
      audioCue: "playVendingClink",
      lines: [
        "露西笑着招招手：海风刚吹散晨雾，要来一杯海盐焦糖拿铁吗？☕",
        "露西递上马卡龙礼盒：今天刚出炉的玫瑰覆盆子味，特别适合配窗外的海风呢～ 🌸",
        "露西：听说小贤贤和小冉子最喜欢来这儿听海鸥叫，随时欢迎你们歇歇脚呀 ✨",
      ],
    },
    {
      id: "npc-musician-leon",
      model: "npc_vivi",
      height: 1.65,
      tagLabel: "里昂 · 吟游琴师",
      interactLabel: "听里昂演奏海风小夜曲 🎶",
      accent: "#6aa8ff",
      x: 33.2,
      y: 1.4,
      z: 2.8,
      lookX: 29.0,
      lookZ: 4.5,
      outfitTint: 0xdceaff,
      hairTint: 0xffeef6,
      prop: "lyre",
      propDx: -0.72,
      propDz: 0.25,
      propY: 1.4,
      fxColors: [0x90c8ff, 0xfff3c8, 0xffffff],
      audioCue: "playDuetArpeggio",
      lines: [
        "里昂拨响竖琴琴弦：这首《花与海的约会》是我新谱的曲子，送给广场上最耀眼的你们 🎵",
        "里昂眨眨眼：每次潮汐涨落，广场罗盘旁的白鸽都会跟着节拍飞起来呢 🕊️",
        "里昂轻哼旋律：风会记得每一句轻声承诺，就像浪花永远奔向这片海湾 🌊",
      ],
    },
    {
      id: "npc-keeper-marco",
      model: "npc_shino",
      height: 1.63,
      tagLabel: "马尔科 · 守灯人",
      interactLabel: "向守灯人马尔科打听海况 💡",
      accent: "#5b8ef0",
      x: 74.6,
      y: 1.38,
      z: 8.6,
      lookX: 67.0,
      lookZ: 10.2,
      outfitTint: 0xf2f6ff,
      prop: null,
      fxColors: [0xfff2b0, 0x8cc6ff, 0xffffff],
      audioCue: "playShipBell",
      lines: [
        "马尔科扶正帽檐敬礼：今日能见度极佳，风速温和——最适合出海巡航和看流星！🔭",
        "马尔科指着灯塔：到了夜晚我会把聚光镜调到最亮，整片星海都会替你们守望 ✨",
        "马尔科：防波堤外侧那几只海鸥可聪明啦，每天准时等着渔船靠岸讨小鱼呢 🪶",
      ],
    },
    {
      id: "npc-angler-thomas",
      model: "npc_shino",
      height: 1.63,
      tagLabel: "托马斯 · 垂钓客",
      interactLabel: "问问托马斯今天钓获如何 🎣",
      accent: "#52b7c4",
      x: 44.3,
      y: 1.36,
      z: -11.8,
      lookX: 52.0,
      lookZ: -11.8,
      outfitTint: 0xccece4,
      hairTint: 0xf5ecd8,
      prop: "fishingRod",
      propDx: -0.68,
      propDz: -0.68,
      propY: 1.36,
      fxColors: [0xa6e7ff, 0xffffff, 0xffe094],
      audioCue: "playFishRipple",
      lines: [
        "托马斯嘘声一笑：刚才两条晶背海鲈差点咬钩！这片港湾的水质清得能看见鱼影 🐟",
        "托马斯指了指桶里：小船那边挂满红帆的游艇随时可以起航，海上的风正合适呢 ⛵",
        "托马斯：钓鱼讲究的是等风也等日落——跟守护喜欢的人一个道理嘛 😊",
      ],
    },
    {
      id: "npc-painter-sophie",
      model: "npc_vivi",
      height: 1.65,
      tagLabel: "索菲 · 写生画师",
      interactLabel: "欣赏索菲画架上的油画 🎨",
      accent: "#b984e8",
      x: 16.0,
      z: -40.2,
      lookX: 8.4,
      lookZ: -44.0,
      outfitTint: 0xf6e6ff,
      hairTint: 0xffeedd,
      prop: "easel",
      propFrontOffset: 0.96,
      fxColors: [0xf7b2c6, 0xffe9aa, 0xb8d8ff],
      audioCue: "playPetalGlissando",
      lines: [
        "索菲举起沾着颜料的画笔：看！溪桥樱花飘落的时候，整幅画的光影都变得像梦幻一样 🎨",
        "索菲眯眼端详：要是你们走到石桥中央停下来，我能把你们画进这幅明信片里哦～ 🖌️",
        "索菲：鸢尾湾最不缺的就是好颜色，松石绿的海水配蜜桃粉花瓣，百画不厌 ✨",
      ],
    },
    {
      id: "npc-baker-nicole",
      model: "npc_vita",
      height: 1.58,
      tagLabel: "妮可 · 风车烘焙师",
      interactLabel: "尝尝妮可刚烤好的可颂 🥐",
      accent: "#f0b35d",
      x: -47.4,
      z: -66.0,
      lookX: -41.0,
      lookZ: -56.0,
      outfitTint: 0xffeec9,
      hairTint: 0xffe5d4,
      prop: "basket",
      propDx: 0.68,
      propDz: 0.36,
      fxColors: [0xffd896, 0xfff5d4, 0xf5b2c2],
      audioCue: "playRoofChime",
      lines: [
        "妮可端起面包篮：山顶大风车今天磨了一整袋黄金小麦面粉，可颂外酥里软快来尝！🥐",
        "妮可：三花猫小麦芽天天守在烤炉旁边闻黄油香，比我闹钟还准时呢 🐱",
        "妮可挥手致意：从这里俯瞰整片鸢尾湾最美啦，带块热面包继续去漫步吧 🌾",
      ],
    },
    {
      id: "npc-florist-ella",
      model: "npc_vita",
      height: 1.58,
      tagLabel: "艾拉 · 花海花匠",
      interactLabel: "和艾拉一起打理绣球花 🌸",
      accent: "#63c995",
      x: -19.8,
      z: 16.5,
      lookX: -9.5,
      lookZ: 15.8,
      outfitTint: 0xdff7e7,
      hairTint: 0xffeff6,
      prop: "wateringCan",
      propDx: -0.62,
      propDz: -0.45,
      fxColors: [0xffb7d5, 0xa5e8c5, 0xffffff],
      audioCue: "playPetalGlissando",
      lines: [
        "艾拉轻拎洒水壶：莫奈睡莲池边的花束今天开得特别好，蝴蝶都赖着不肯走啦 🦋",
        "艾拉笑盈盈：听说给池边的花丛浇浇水，还会悄悄长出新的彩色绣球和樱花瓣呢 💐",
        "艾拉：秋千那头藏着整座岛最甜的花香，快和小贤贤一起去荡几下吧 🌺",
      ],
    },
  ];
  npcSpecs.forEach((spec, idx) => spawnTownNPC(spec, idx));
  mergeStaticChildrenByMaterial(lifeRoot, scene, {
    namePrefix: "TownNPCPropsBatch",
    castShadows: true,
    shadowGen,
    filterMesh: (m) => {
      let cur = m;
      while (cur) {
        if (cur.name?.startsWith("NPCProp_")) return true;
        cur = cur.parent;
      }
      return false;
    },
  });

  // -------------------------------------------------------------------------
  // Articulated Stylized Critters (`stylized_critters.glb`)
  // -------------------------------------------------------------------------
  function findChildPart(nodes, suffix) {
    return findDescendantByName(nodes, suffix);
  }

  function snapshotQuats(parts) {
    const map = new Map();
    for (const key of Object.keys(parts)) {
      const n = parts[key];
      if (!n) continue;
      map.set(key, n.rotationQuaternion ? n.rotationQuaternion.clone() : Quaternion.Identity());
    }
    return map;
  }

  function rotateJoint(part, restQuat, yaw = 0, pitch = 0, roll = 0) {
    if (!part || !restQuat) return;
    part.rotationQuaternion = restQuat.multiply(Quaternion.RotationYawPitchRoll(yaw, pitch, roll));
  }

  const critterTintMatCache = new Map();

  function spawnCritterInstance(id, templateName, { scale = 1.15, tintHex = null, x = 0, y = 0, z = 0, yaw = 0 } = {}) {
    const container = models?.stylized_critters;
    if (!container) return null;

    const wrap = new TransformNode(`CritterWrap_${id}`, scene);
    wrap.parent = lifeRoot;
    wrap.position.set(x, y, z);
    wrap.rotation.y = yaw;

    const holder = new TransformNode(`CritterHolder_${id}`, scene);
    holder.parent = wrap;
    holder.rotation.y = Math.PI;
    holder.scaling.setAll(scale);

    const inst = instantiateGLB(container, id, holder);
    if (!inst) {
      wrap.dispose();
      return null;
    }

    // Keep ONLY the requested critter species root; dispose the 7 sibling templates cleanly
    let keptRoot = null;
    for (const r of inst.rootNodes) {
      const targetNode = r.name?.endsWith(templateName) ? r : findDescendantByName([r], templateName);
      if (targetNode && !keptRoot) {
        keptRoot = targetNode;
        keptRoot.parent = holder;
        for (const ch of [...(r.getChildren?.() || [])]) {
          if (ch !== keptRoot) ch.dispose(false, false);
        }
        if (r !== keptRoot) r.dispose(false, false);
      } else {
        r.dispose(false, false);
      }
    }
    if (!keptRoot) {
      wrap.dispose();
      return null;
    }

    const meshes = collectMeshes([keptRoot]);
    let clonedTintMat = null;
    for (let i = 0; i < meshes.length; i += 1) {
      const m = meshes[i];
      m.alwaysSelectAsActiveMesh = true;
      m.receiveShadows = true;
      m.isPickable = false;
      shadowGen?.addShadowCaster(m, false);
      if (m.material instanceof PBRMaterial) {
        if (tintHex !== null) {
          const tKey = `${m.material.uniqueId}|${tintHex}`;
          clonedTintMat = critterTintMatCache.get(tKey);
          if (!clonedTintMat) {
            clonedTintMat = cloneMaterialSharingTextures(m.material, `CritterTintMat_${tintHex.toString(16)}`);
            clonedTintMat.albedoColor = hexToColor3(tintHex);
            critterTintMatCache.set(tKey, clonedTintMat);
          }
          m.material = clonedTintMat;
        }
        m.material.metallic = 0;
        m.material.roughness = clamp(m.material.roughness ?? 0.72, 0.56, 0.85);
        m.material.emissiveColor = new Color3(0.032, 0.028, 0.026);
      }
    }

    return { wrap, holder, keptRoot, meshes };
  }

  function makeCritterGroupInteractable(id, label, centerPos, radius, floorY, members, onActivate, audioCue = "playVendingClink") {
    const state = { excite: 0, msgIdx: 0 };
    const item = {
      id,
      label,
      position: centerPos.clone(),
      radius,
      floorY,
      activate(ctx = {}) {
        state.excite = 2.6;
        const msg = onActivate(state, ctx);
        ctx.audio?.[audioCue]?.();
        return msg;
      },
    };
    interactables.push(item);

    for (let mi = 0; mi < members.length; mi += 1) {
      const mem = members[mi];
      mem.wrap.metadata = { interactive: item };
      for (const mm of mem.meshes) {
        mm.isPickable = true;
        mm.metadata = { interactive: item };
      }
      // Subtle invisible pick sphere so clicking small/fast animals is effortless
      const hitProxy = MeshBuilder.CreateSphere(`CritterHit_${id}_${mi}`, { diameter: mem.hitDiam || 0.75, segments: 6 }, scene);
      hitProxy.parent = mem.wrap;
      hitProxy.position.y = (mem.hitDiam || 0.75) * 0.35;
      hitProxy.material = invisiblePickMat;
      hitProxy.isPickable = true;
      hitProxy.receiveShadows = false;
      hitProxy.metadata = { interactive: item };
    }
    return state;
  }

  // 1) Three Cozy Island Cats (Villa Step, Cafe Terrace, Windmill Cottage)
  [
    {
      id: "critter-villa-cat",
      label: "撸撸小奶油猫 🐱",
      x: -10.8,
      y: 2.24,
      z: 12.1,
      lookX: -8.0,
      lookZ: 15.0,
      tintHex: null,
      scale: 1.24,
      lines: [
        "奶油小猫眯起眼睛呼噜呼噜叫着蹭了蹭裤脚 🐾",
        "小奶油猫在别墅台阶前懒洋洋打了个滚，好像很喜欢你 💕",
      ],
    },
    {
      id: "critter-cafe-cat",
      label: "逗逗咖啡橘猫 🐱",
      x: 23.4,
      y: 1.36,
      z: -12.6,
      lookX: 20.0,
      lookZ: -9.5,
      tintHex: 0xffd19c,
      scale: 1.24,
      lines: [
        "橘猫小酥糖仰起头喵呜一声，尾巴卷成问号蹭过来 🐱",
        "咖啡香里的胖橘猫踩起了柔软的小奶糕，晒得暖洋洋～ ☕",
      ],
    },
    {
      id: "critter-windmill-cat",
      label: "摸摸三花猫小麦芽 🐱",
      x: -50.6,
      y: getWorldTerrainY(-50.6, -64.4),
      z: -64.4,
      lookX: -47.4,
      lookZ: -66.0,
      tintHex: 0xfff0df,
      scale: 1.22,
      lines: [
        "山顶面包房前的小麦芽竖起粉耳朵蹭手心，满身都是麦香味 🌾",
        "小麦芽摇摇蓬松尾巴跳了一小步，好像在等妮可分一块可颂 🥐",
      ],
    },
  ].forEach((c, ci) => {
    const inst = spawnCritterInstance(c.id, "Critter_Cat", {
      scale: c.scale,
      tintHex: c.tintHex,
      x: c.x,
      y: c.y,
      z: c.z,
      yaw: yawToTarget(c.x, c.z, c.lookX, c.lookZ),
    });
    if (!inst) return;
    inst.hitDiam = 0.72;
    const parts = {
      head: findChildPart([inst.keptRoot], "Cat_Head"),
      tail: findChildPart([inst.keptRoot], "Cat_Tail"),
    };
    const rest = snapshotQuats(parts);
    const st = makeCritterGroupInteractable(
      c.id,
      c.label,
      V(c.x, c.y, c.z),
      2.2,
      c.y,
      [inst],
      () => {
        fx.heart(V(c.x, c.y + 0.55, c.z), { count: 14, scale: 0.024 });
        const m = c.lines[st.msgIdx % c.lines.length];
        st.msgIdx += 1;
        return m;
      },
      "playPetalGlissando"
    );
    updaters.push((elapsed, dt) => {
      if (st.excite > 0) st.excite = Math.max(0, st.excite - dt);
      const exc = clamp(st.excite, 0, 1);
      const t = elapsed * (exc > 0 ? 4.2 : 1.7) + ci * 1.9;
      rotateJoint(parts.tail, rest.get("tail"), Math.sin(t * 1.5) * (0.28 + exc * 0.25), Math.sin(t) * 0.14, 0);
      rotateJoint(parts.head, rest.get("head"), Math.sin(t * 0.65) * 0.22, Math.sin(t * 1.1) * 0.08 - exc * 0.14, Math.sin(t * 0.8) * 0.12);
      inst.wrap.position.y = c.y + (exc > 0 ? Math.abs(Math.sin(t * 2.4)) * 0.09 * exc : 0);
    });
  });

  // 2) Two Patrolling Articulated Shiba Pups (Harbor Promenade + Villa Courtyard)
  [
    {
      id: "critter-harbor-shiba",
      label: "摸摸海港柴犬小波 🐕",
      cx: 26.8,
      cz: -3.2,
      rx: 1.9,
      rz: 2.5,
      baseY: 1.36,
      scale: 1.18,
      speed: 0.52,
      tintHex: null,
      lines: [
        "柴犬小波摇成螺旋桨的大尾巴跑过来：汪呜～海风吹得耳朵都要飞起来啦！🐕",
        "小波在海港石砖上欢快转了一圈，金铃铛叮叮当当地响 🔔",
      ],
    },
    {
      id: "critter-courtyard-shiba",
      label: "逗逗小院柴犬阿橘 🐕",
      cx: -6.8,
      cz: 13.8,
      rx: 1.35,
      rz: 1.35,
      baseY: 2.24,
      scale: 1.12,
      speed: 0.62,
      tintHex: 0xffe9d2,
      lines: [
        "阿橘开心地小碎步跑了两圈，鼻头湿漉漉地凑过来讨抱抱 💛",
        "小院柴犬阿橘叼着空气小球晃来晃去，开心到飞起！🐾",
      ],
    },
  ].forEach((d, di) => {
    const inst = spawnCritterInstance(d.id, "Critter_Shiba", { scale: d.scale, tintHex: d.tintHex, x: d.cx, y: d.baseY, z: d.cz });
    if (!inst) return;
    inst.hitDiam = 0.88;
    const parts = {
      head: findChildPart([inst.keptRoot], "Shiba_Head"),
      tail: findChildPart([inst.keptRoot], "Shiba_Tail"),
      fl: findChildPart([inst.keptRoot], "Shiba_LegFL"),
      fr: findChildPart([inst.keptRoot], "Shiba_LegFR"),
      bl: findChildPart([inst.keptRoot], "Shiba_LegBL"),
      br: findChildPart([inst.keptRoot], "Shiba_LegBR"),
    };
    const rest = snapshotQuats(parts);
    const curItemPos = V(d.cx, d.baseY, d.cz);
    let ang = di * 1.4;
    const st = makeCritterGroupInteractable(
      d.id,
      d.label,
      curItemPos,
      2.4,
      d.baseY,
      [inst],
      () => {
        fx.heart(V(curItemPos.x, d.baseY + 0.62, curItemPos.z), { count: 16, scale: 0.025 });
        const m = d.lines[st.msgIdx % d.lines.length];
        st.msgIdx += 1;
        return m;
      },
      "playBicycleBell"
    );
    const refInteractable = interactables[interactables.length - 1];
    updaters.push((elapsed, dt) => {
      if (st.excite > 0) st.excite = Math.max(0, st.excite - dt);
      const exc = clamp(st.excite, 0, 1);
      // Pause forward loop briefly to wiggle happily when petted
      const moveFactor = exc > 0.4 ? 0.25 : 1.0;
      ang += dt * d.speed * moveFactor;
      const px = d.cx + Math.cos(ang) * d.rx;
      const pz = d.cz + Math.sin(ang) * d.rz;
      const vx = -Math.sin(ang) * d.rx;
      const vz = Math.cos(ang) * d.rz;
      inst.wrap.position.set(px, d.baseY + (exc > 0 ? Math.abs(Math.sin(elapsed * 9)) * 0.08 * exc : 0), pz);
      inst.wrap.rotation.y = yawToTarget(px, pz, px + vx, pz + vz);
      refInteractable.position.set(px, d.baseY, pz);
      curItemPos.set(px, d.baseY, pz);

      const stridePhase = elapsed * (moveFactor > 0.5 ? 7.6 : 11.0);
      const legAmp = (moveFactor > 0.5 ? 0.44 : 0.24) + exc * 0.12;
      const sA = Math.sin(stridePhase) * legAmp;
      rotateJoint(parts.fl, rest.get("fl"), 0, sA, 0);
      rotateJoint(parts.br, rest.get("br"), 0, sA, 0);
      rotateJoint(parts.fr, rest.get("fr"), 0, -sA, 0);
      rotateJoint(parts.bl, rest.get("bl"), 0, -sA, 0);
      rotateJoint(parts.tail, rest.get("tail"), Math.sin(elapsed * (9 + exc * 7)) * 0.45, 0.08, 0);
      rotateJoint(parts.head, rest.get("head"), Math.sin(elapsed * 2.2) * 0.16, Math.sin(elapsed * 3.8) * 0.07 - exc * 0.14, 0);
    });
  });

  // 3) Meadow Hopping Bunnies (x3 near Monet Pond West & Swing Meadow)
  const bunnySpecs = [
    { x: -24.2, z: 14.5, lookX: -20.5, lookZ: 15.8, tint: null },
    { x: -26.8, z: 18.2, lookX: -22.5, lookZ: 16.5, tint: 0xffeadc },
    { x: -16.4, z: 22.0, lookX: -12.0, lookZ: 19.0, tint: 0xf7e6f4 },
  ];
  const bunnyMems = [];
  bunnySpecs.forEach((b, bi) => {
    const gy = getWalkSurfaceY(b.x, b.z);
    const inst = spawnCritterInstance(`bunny_${bi}`, "Critter_Bunny", {
      scale: 1.26,
      tintHex: b.tint,
      x: b.x,
      y: gy,
      z: b.z,
      yaw: yawToTarget(b.x, b.z, b.lookX, b.lookZ),
    });
    if (!inst) return;
    inst.hitDiam = 0.68;
    bunnyMems.push({ ...inst, bx: b.x, by: gy, bz: b.z, phase: bi * 1.7 });
  });
  if (bunnyMems.length > 0) {
    const bunnyParts = bunnyMems.map((m) => ({
      mem: m,
      parts: {
        head: findChildPart([m.keptRoot], "Bunny_Head"),
        earL: findChildPart([m.keptRoot], "Bunny_EarL"),
        earR: findChildPart([m.keptRoot], "Bunny_EarR"),
      },
      rest: null,
    }));
    bunnyParts.forEach((bp) => {
      bp.rest = snapshotQuats(bp.parts);
    });
    const stB = makeCritterGroupInteractable(
      "critter-meadow-bunnies",
      "揉揉花田小兔叽 🐰",
      V(-22.5, bunnyMems[0].by, 17.6),
      4.5,
      bunnyMems[0].by,
      bunnyMems,
      () => {
        for (const bp of bunnyParts) {
          fx.burst(V(bp.mem.bx, bp.mem.by + 0.35, bp.mem.bz), { count: 10, colors: [0xffcfe2, 0xffffff], size: 0.045, life: 1.1 });
        }
        return "三只长耳兔一起竖起粉嫩小耳朵蹦了好高，软绵绵像一团云朵 🐰✨";
      },
      "playPetalGlissando"
    );
    updaters.push((elapsed, dt) => {
      if (stB.excite > 0) stB.excite = Math.max(0, stB.excite - dt);
      const exc = clamp(stB.excite, 0, 1);
      for (const bp of bunnyParts) {
        const cyc = (elapsed * (0.95 + exc * 1.4) + bp.mem.phase) % 2.4;
        const hop = cyc < 0.55 ? Math.sin((cyc / 0.55) * Math.PI) * (0.14 + exc * 0.16) : 0;
        bp.mem.wrap.position.y = bp.mem.by + hop;
        rotateJoint(bp.parts.earL, bp.rest.get("earL"), 0, Math.sin(elapsed * 5.2 + bp.mem.phase) * 0.16, 0.08);
        rotateJoint(bp.parts.earR, bp.rest.get("earR"), 0, Math.cos(elapsed * 4.8 + bp.mem.phase) * 0.18, -0.08);
        rotateJoint(bp.parts.head, bp.rest.get("head"), Math.sin(elapsed * 1.3 + bp.mem.phase) * 0.22, hop * 0.55, 0);
      }
    });
  }

  // 4) Woodland Acorn Squirrels (x3 near Creek Bridge, Birch Grove, Windmill Slope)
  const squirrelSpecs = [
    { x: 13.8, z: -36.5, lookX: 8.4, lookZ: -44.0, tint: null },
    { x: -34.2, z: -16.8, lookX: -28.0, lookZ: -12.0, tint: 0xf7dfc6 },
    { x: -45.2, z: -61.8, lookX: -50.0, lookZ: -66.0, tint: 0xedd2bc },
  ];
  const squirrelMems = [];
  squirrelSpecs.forEach((s, si) => {
    const gy = getWorldTerrainY(s.x, s.z);
    const inst = spawnCritterInstance(`squirrel_${si}`, "Critter_Squirrel", {
      scale: 1.32,
      tintHex: s.tint,
      x: s.x,
      y: gy,
      z: s.z,
      yaw: yawToTarget(s.x, s.z, s.lookX, s.lookZ),
    });
    if (!inst) return;
    inst.hitDiam = 0.72;
    squirrelMems.push({ ...inst, sx: s.x, sy: gy, sz: s.z, phase: si * 1.5 });
  });
  if (squirrelMems.length > 0) {
    const sqParts = squirrelMems.map((m) => ({
      mem: m,
      parts: {
        head: findChildPart([m.keptRoot], "Squirrel_Head"),
        tail: findChildPart([m.keptRoot], "Squirrel_Tail"),
      },
      rest: null,
    }));
    sqParts.forEach((sp) => {
      sp.rest = snapshotQuats(sp.parts);
    });
    const stS = makeCritterGroupInteractable(
      "critter-woodland-squirrels",
      "给小松鼠分一颗橡果 🐿️",
      V(13.8, squirrelMems[0].sy, -36.5),
      4.5,
      squirrelMems[0].sy,
      squirrelMems,
      () => {
        for (const sp of sqParts) {
          fx.burst(V(sp.mem.sx, sp.mem.sy + 0.35, sp.mem.sz), { count: 12, colors: [0xffe094, 0xffffff], size: 0.045, life: 1.1 });
        }
        return "树梢下的小松鼠抱着松果一蹦一跳，毛茸茸的S形大尾巴晃来晃去 🐿️✨";
      },
      "playVendingClink"
    );
    updaters.push((elapsed, dt) => {
      if (stS.excite > 0) stS.excite = Math.max(0, stS.excite - dt);
      const exc = clamp(stS.excite, 0, 1);
      for (const sp of sqParts) {
        const nibble = Math.sin(elapsed * (6.2 + exc * 5.0) + sp.mem.phase) * 0.14;
        rotateJoint(sp.parts.head, sp.rest.get("head"), Math.sin(elapsed * 1.8 + sp.mem.phase) * 0.25, nibble, 0);
        rotateJoint(sp.parts.tail, sp.rest.get("tail"), Math.sin(elapsed * 3.1 + sp.mem.phase) * 0.22, Math.sin(elapsed * 5.0 + sp.mem.phase) * 0.18 + exc * 0.2, 0);
        sp.mem.wrap.position.y = sp.mem.sy + (exc > 0 ? Math.abs(Math.sin(elapsed * 8 + sp.mem.phase)) * 0.08 * exc : 0);
      }
    });
  }

  // 5) Breakwater & Harbor Perched Seagulls (x2) + 5 High Soaring Sky Seagulls
  const gullSpecs = [
    { x: 62.5, y: 1.38, z: 11.7, lookX: 54.0, lookZ: 18.0 },
    { x: 52.8, y: 1.38, z: 8.3, lookX: 46.0, lookZ: 4.0 },
  ];
  const gullMems = [];
  gullSpecs.forEach((g, gi) => {
    const inst = spawnCritterInstance(`gull_perch_${gi}`, "Critter_Seagull", {
      scale: 1.35,
      x: g.x,
      y: g.y,
      z: g.z,
      yaw: yawToTarget(g.x, g.z, g.lookX, g.lookZ),
    });
    if (!inst) return;
    inst.hitDiam = 0.78;
    gullMems.push({ ...inst, gx: g.x, gy: g.y, gz: g.z, phase: gi * 2.1 });
  });
  if (gullMems.length > 0) {
    const gullParts = gullMems.map((m) => ({
      mem: m,
      parts: {
        head: findChildPart([m.keptRoot], "Seagull_Head"),
        wingL: findChildPart([m.keptRoot], "Seagull_WingL"),
        wingR: findChildPart([m.keptRoot], "Seagull_WingR"),
      },
      rest: null,
    }));
    gullParts.forEach((gp) => {
      gp.rest = snapshotQuats(gp.parts);
    });
    const stG = makeCritterGroupInteractable(
      "critter-pier-gulls",
      "给海鸥抛一块小鱼干 🪶",
      V(58.0, 1.38, 10.0),
      6.0,
      1.38,
      gullMems,
      () => {
        for (const gp of gullParts) {
          fx.burst(V(gp.mem.gx, gp.mem.gy + 0.5, gp.mem.gz), { count: 14, colors: [0xffffff, 0xcbe8ff], size: 0.05, life: 1.2 });
        }
        return "白羽海鸥展翅跳起欢呼：咕嘎——防波堤上的海风最甜啦！🪶🌊";
      },
      "playShipBell"
    );
    updaters.push((elapsed, dt) => {
      if (stG.excite > 0) stG.excite = Math.max(0, stG.excite - dt);
      const exc = clamp(stG.excite, 0, 1);
      for (const gp of gullParts) {
        // Verified empirically: WingL yaw > 0 sweeps wingtip backward toward tail; roll < 0 tucks down against flanks
        const lift = exc > 0
          ? -0.10 + Math.sin(elapsed * 11.5 + gp.mem.phase) * 0.58 * exc
          : -0.40 + Math.max(0, Math.sin(elapsed * 2.4 + gp.mem.phase)) * 0.12;
        const sweep = lerp(1.12, -0.05, exc);
        const wSpan = lerp(0.76, 1.0, exc);
        if (gp.parts.wingL) gp.parts.wingL.scaling.x = wSpan;
        if (gp.parts.wingR) gp.parts.wingR.scaling.x = wSpan;
        rotateJoint(gp.parts.wingL, gp.rest.get("wingL"), sweep, 0, lift);
        rotateJoint(gp.parts.wingR, gp.rest.get("wingR"), -sweep, 0, -lift);
        rotateJoint(gp.parts.head, gp.rest.get("head"), Math.sin(elapsed * 1.4 + gp.mem.phase) * 0.35, -0.06 - exc * 0.14, 0);
        gp.mem.wrap.position.y = gp.mem.gy + exc * Math.abs(Math.sin(elapsed * 6.5)) * 0.28;
      }
    });
  }

  // High-soaring sky seagulls gliding above harbor, yachts & lighthouse
  const skyGulls = [];
  for (let si = 0; si < 5; si += 1) {
    const inst = spawnCritterInstance(`sky_gull_${si}`, "Critter_Seagull", { scale: 1.48 });
    if (!inst) continue;
    const parts = {
      wingL: findChildPart([inst.keptRoot], "Seagull_WingL"),
      wingR: findChildPart([inst.keptRoot], "Seagull_WingR"),
    };
    skyGulls.push({
      wrap: inst.wrap,
      parts,
      rest: snapshotQuats(parts),
      cx: 48 + (si % 3) * 14,
      cz: -8 + si * 9,
      rx: 14 + si * 3.5,
      rz: 12 + si * 2.5,
      cy: 10.5 + (si % 3) * 2.2,
      spd: 0.28 + si * 0.04,
      phase: si * 1.25,
    });
  }
  updaters.push((elapsed) => {
    for (const sg of skyGulls) {
      const a = elapsed * sg.spd + sg.phase;
      const px = sg.cx + Math.cos(a) * sg.rx;
      const pz = sg.cz + Math.sin(a) * sg.rz;
      const py = sg.cy + Math.sin(a * 2.0) * 1.1;
      const vx = -Math.sin(a) * sg.rx;
      const vz = Math.cos(a) * sg.rz;
      sg.wrap.position.set(px, py, pz);
      sg.wrap.rotation.y = yawToTarget(px, pz, px + vx, pz + vz);
      const flap = Math.sin(elapsed * 6.2 + sg.phase) * 0.48;
      rotateJoint(sg.parts.wingL, sg.rest.get("wingL"), 0, 0, flap);
      rotateJoint(sg.parts.wingR, sg.rest.get("wingR"), 0, 0, -flap);
    }
  });

  // 6) Compass Plaza Pearl Doves (x3 clustered pecking & startling up briefly on interact)
  const doveCoords = [
    [37.1, 2.5],
    [37.9, 3.1],
    [37.5, 1.8],
  ];
  const doveMems = [];
  doveCoords.forEach(([dx, dz], di) => {
    const inst = spawnCritterInstance(`dove_${di}`, "Critter_Dove", {
      scale: 1.38,
      x: dx,
      y: 1.4,
      z: dz,
      yaw: di * 2.1,
    });
    if (!inst) return;
    inst.hitDiam = 0.65;
    doveMems.push({ ...inst, dx, dy: 1.4, dz, phase: di * 1.6 });
  });
  if (doveMems.length > 0) {
    const dParts = doveMems.map((m) => ({
      mem: m,
      parts: {
        head: findChildPart([m.keptRoot], "Dove_Head"),
        wingL: findChildPart([m.keptRoot], "Dove_WingL"),
        wingR: findChildPart([m.keptRoot], "Dove_WingR"),
      },
      rest: null,
    }));
    dParts.forEach((dp) => {
      dp.rest = snapshotQuats(dp.parts);
    });
    const stD = makeCritterGroupInteractable(
      "critter-plaza-doves",
      "撒一把谷粒，惊起罗盘白鸽 🕊️",
      V(37.5, 1.4, 2.45),
      2.6,
      1.4,
      doveMems,
      () => {
        fx.burst(V(37.5, 2.0, 2.45), { count: 22, colors: [0xffffff, 0xfff0c8], size: 0.055, up: 1.5, life: 1.4 });
        return "呼啦一声！星盘广场上的白鸽盘旋一圈，又乖乖落回石砖上 🕊️✨";
      },
      "playPetalGlissando"
    );
    updaters.push((elapsed, dt) => {
      if (stD.excite > 0) stD.excite = Math.max(0, stD.excite - dt);
      const exc = clamp(stD.excite / 2.6, 0, 1);
      for (const dp of dParts) {
        const hoverArc = exc > 0 ? Math.sin(exc * Math.PI) * 1.45 : 0;
        const swirl = exc > 0 ? (1 - exc) * 2.2 : 0;
        const px = dp.mem.dx + Math.sin(swirl + dp.mem.phase) * exc * 1.1;
        const pz = dp.mem.dz + Math.cos(swirl + dp.mem.phase) * exc * 1.1;
        dp.mem.wrap.position.set(px, dp.mem.dy + hoverArc, pz);
        if (exc > 0.02) dp.mem.wrap.rotation.y += dt * 2.4;
        const peck = exc > 0 ? 0 : Math.max(0, Math.sin(elapsed * 4.4 + dp.mem.phase)) * 0.42;
        const flap = exc > 0
          ? -0.08 + Math.sin(elapsed * 18.0 + dp.mem.phase) * 0.65
          : -0.42 + Math.max(0, Math.sin(elapsed * 3.1 + dp.mem.phase)) * 0.08;
        const sweep = lerp(1.16, -0.05, Math.min(1, exc * 1.5));
        const wSpan = lerp(0.72, 1.0, Math.min(1, exc * 1.5));
        if (dp.parts.wingL) dp.parts.wingL.scaling.x = wSpan;
        if (dp.parts.wingR) dp.parts.wingR.scaling.x = wSpan;
        rotateJoint(dp.parts.head, dp.rest.get("head"), Math.sin(elapsed * 1.5 + dp.mem.phase) * 0.25, peck, 0);
        rotateJoint(dp.parts.wingL, dp.rest.get("wingL"), sweep, 0, flap);
        rotateJoint(dp.parts.wingR, dp.rest.get("wingR"), -sweep, 0, -flap);
      }
    });
  }

  // 7) Monet Pond Swimming Call Ducks (x2 gliding smoothly across lily pond with wake ripples)
  const duckWaterY = POND_CONFIG.waterY - 0.025;
  const duckMems = [];
  for (let di = 0; di < 2; di += 1) {
    const inst = spawnCritterInstance(`pond_duck_${di}`, "Critter_Duck", { scale: 1.38, tintHex: di === 1 ? 0xfff4d9 : null });
    if (!inst) continue;
    inst.hitDiam = 0.8;
    duckMems.push({ ...inst, phase: di * Math.PI, rx: 2.5 - di * 0.55, rz: 1.75 - di * 0.35, speed: 0.34 + di * 0.05 });
  }
  if (duckMems.length > 0) {
    const duckParts = duckMems.map((m) => ({
      mem: m,
      parts: {
        head: findChildPart([m.keptRoot], "Duck_Head"),
        tail: findChildPart([m.keptRoot], "Duck_Tail"),
      },
      rest: null,
      lastRipple: 0,
    }));
    duckParts.forEach((dp) => {
      dp.rest = snapshotQuats(dp.parts);
    });
    const duckPos = V(POND_CONFIG.cx, POND_CONFIG.waterY, POND_CONFIG.cz);
    const stDuck = makeCritterGroupInteractable(
      "critter-pond-ducks",
      "逗逗睡莲池游水鸭鸭 🦆",
      duckPos,
      4.5,
      POND_CONFIG.waterY,
      duckMems,
      () => {
        fx.ripple(V(duckPos.x, POND_CONFIG.waterY + 0.01, duckPos.z), { radius: 1.2, life: 1.5, opacity: 0.68 });
        fx.burst(V(duckPos.x, POND_CONFIG.waterY + 0.35, duckPos.z), { count: 16, colors: [0xdff6ff, 0xffffff], size: 0.055, up: 1.1, life: 1.1 });
        return "嘎嘎～两只小白鸭绕着粉荷叶转了半圈，尾羽拍出一串亮晶晶的水纹 🦆✨";
      },
      "playFishRipple"
    );
    const duckItem = interactables[interactables.length - 1];
    updaters.push((elapsed, dt) => {
      if (stDuck.excite > 0) stDuck.excite = Math.max(0, stDuck.excite - dt);
      const exc = clamp(stDuck.excite, 0, 1);
      duckParts.forEach((dp, idx) => {
        const a = elapsed * dp.mem.speed * (1 + exc * 0.65) + dp.mem.phase;
        const px = POND_CONFIG.cx + Math.cos(a) * dp.mem.rx;
        const pz = POND_CONFIG.cz + Math.sin(a) * dp.mem.rz;
        const vx = -Math.sin(a) * dp.mem.rx;
        const vz = Math.cos(a) * dp.mem.rz;
        dp.mem.wrap.position.set(px, duckWaterY + Math.sin(elapsed * 2.5 + idx) * 0.012, pz);
        dp.mem.wrap.rotation.y = yawToTarget(px, pz, px + vx, pz + vz);
        dp.mem.wrap.rotation.z = Math.sin(elapsed * 3.1 + idx) * 0.055;
        rotateJoint(dp.parts.head, dp.rest.get("head"), Math.sin(elapsed * 2.0 + idx) * 0.18, Math.sin(elapsed * 2.8 + idx) * 0.08, 0);
        rotateJoint(dp.parts.tail, dp.rest.get("tail"), Math.sin(elapsed * 6.5 + idx) * 0.14, 0, 0);
        if (idx === 0) duckItem.position.set(px, POND_CONFIG.waterY, pz);
        if (elapsed - dp.lastRipple > 1.8) {
          dp.lastRipple = elapsed;
          fx.ripple(V(px, POND_CONFIG.waterY + 0.01, pz), { radius: 0.62, life: 1.2, opacity: 0.34 });
        }
      });
    });
  }

  // 8) Sandy Beach Tide-Edge Coral Crabs (x2 scuttling sideways right above wet tide sand)
  function computeShoreZ(x, zStart = 24.0, zEnd = 46.0) {
    let best = 33.5;
    for (let z = zStart; z <= zEnd; z += 0.25) {
      if (getWorldTerrainY(x, z) > 0.14) best = z;
    }
    return best;
  }
  const SHORE_LUT_X0 = -16.0;
  const SHORE_LUT_STEP = 0.25;
  const SHORE_LUT_COUNT = 57; // covers x in [-16.0, -2.0]
  const shoreZLUT = new Float32Array(SHORE_LUT_COUNT);
  for (let i = 0; i < SHORE_LUT_COUNT; i += 1) {
    shoreZLUT[i] = computeShoreZ(SHORE_LUT_X0 + i * SHORE_LUT_STEP);
  }
  function findShoreZ(x) {
    const f = clamp((x - SHORE_LUT_X0) / SHORE_LUT_STEP, 0, SHORE_LUT_COUNT - 1.0001);
    const i0 = Math.floor(f);
    return lerp(shoreZLUT[i0], shoreZLUT[i0 + 1], f - i0);
  }
  const crabSpecs = [
    { cx: -12.0, amp: 1.75, speed: 0.72, phase: 0.2 },
    { cx: -5.8, amp: 1.6, speed: 0.64, phase: 2.4 },
  ];
  const crabMems = [];
  crabSpecs.forEach((cr, ci) => {
    const cz = findShoreZ(cr.cx);
    const cy = getWorldTerrainY(cr.cx, cz) + 0.012;
    const inst = spawnCritterInstance(`beach_crab_${ci}`, "Critter_Crab", { scale: 1.42, x: cr.cx, y: cy, z: cz, yaw: Math.PI * 0.12 });
    if (!inst) return;
    inst.hitDiam = 0.72;
    crabMems.push({ ...inst, ...cr, sy: cy, sz: cz });
  });
  if (crabMems.length > 0) {
    const crabParts = crabMems.map((m) => ({
      mem: m,
      parts: {
        clawL: findChildPart([m.keptRoot], "Crab_ClawL"),
        clawR: findChildPart([m.keptRoot], "Crab_ClawR"),
      },
      rest: null,
    }));
    crabParts.forEach((cp) => {
      cp.rest = snapshotQuats(cp.parts);
    });
    const stCrab = makeCritterGroupInteractable(
      "critter-beach-crabs",
      "看看沙滩横行的小螃蟹 🦀",
      V(-9.0, crabMems[0].sy, crabMems[0].sz),
      5.5,
      crabMems[0].sy,
      crabMems,
      () => {
        for (const cp of crabParts) {
          fx.burst(V(cp.mem.wrap.position.x, cp.mem.wrap.position.y + 0.25, cp.mem.wrap.position.z), {
            count: 14,
            colors: [0xff9d7a, 0xdff6ff],
            size: 0.045,
            life: 1.1,
          });
        }
        return "红彤彤的小螃蟹举起一对小钳子横着溜了两步，吐出一串小泡泡 🦀🫧";
      },
      "playFishRipple"
    );
    updaters.push((elapsed, dt) => {
      if (stCrab.excite > 0) stCrab.excite = Math.max(0, stCrab.excite - dt);
      const exc = clamp(stCrab.excite, 0, 1);
      for (const cp of crabParts) {
        const px = cp.mem.cx + Math.sin(elapsed * cp.mem.speed * (1 + exc * 0.8) + cp.mem.phase) * cp.mem.amp;
        const pz = findShoreZ(px) - 0.15;
        const py = getWorldTerrainY(px, pz) + 0.015;
        cp.mem.wrap.position.set(px, py, pz);
        const snap = Math.sin(elapsed * (5.5 + exc * 6.0) + cp.mem.phase) * 0.26;
        rotateJoint(cp.parts.clawL, cp.rest.get("clawL"), 0, snap, 0.08);
        rotateJoint(cp.parts.clawR, cp.rest.get("clawR"), 0, -snap, -0.08);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Persistent Always-On Pastel Butterflies (Monet Pond, Villa Garden, Gazebo Ridge)
  // -------------------------------------------------------------------------
  const bWingMatA = makePbrMat(scene, "WildButterflyPinkMat", 0xff9ec8, {
    roughness: 0.55,
    doubleSided: true,
    emissive: 0xb8527d,
    emissiveIntensity: 0.68,
  });
  const bWingMatB = makePbrMat(scene, "WildButterflyBlueMat", 0x9bd4ff, {
    roughness: 0.55,
    doubleSided: true,
    emissive: 0x4f92c8,
    emissiveIntensity: 0.68,
  });
  const bWingMatC = makePbrMat(scene, "WildButterflyGoldMat", 0xffe08a, {
    roughness: 0.55,
    doubleSided: true,
    emissive: 0xb88934,
    emissiveIntensity: 0.68,
  });
  const butterflyAnchors = [
    { cx: -1.5, cy: 2.85, cz: 16.8, r: 3.4 },
    { cx: -3.2, cy: 2.95, cz: 15.2, r: 2.8 },
    { cx: 0.6, cy: 2.9, cz: 18.4, r: 2.9 },
    { cx: -17.5, cy: 2.95, cz: 12.0, r: 2.6 },
    { cx: -19.2, cy: 3.05, cz: 15.8, r: 2.8 },
    { cx: -27.5, cy: 3.1, cz: 14.5, r: 2.6 },
    { cx: 14.8, cy: getWorldTerrainY(14.8, -40.5) + 0.85, cz: -40.5, r: 2.4 },
    { cx: -59.5, cy: getWorldTerrainY(-59.5, 40.0) + 0.95, cz: 40.0, r: 3.0 },
  ];
  // Batch all 14 butterflies (28 wings) into 3 GPU thin-instance meshes (1 per pastel tint)
  const wingMats = [bWingMatA, bWingMatB, bWingMatC];
  const butterflyGroups = wingMats.map((mat, gi) => {
    const wingMesh = MeshBuilder.CreateBox(`WildButterflyWings_${gi}`, { width: 0.08, height: 0.004, depth: 0.065 }, scene);
    wingMesh.parent = lifeRoot;
    wingMesh.material = mat;
    wingMesh.isPickable = false;
    wingMesh.alwaysSelectAsActiveMesh = true;
    return { mesh: wingMesh, entries: [], buffer: null };
  });
  for (let bi = 0; bi < 14; bi += 1) {
    const a = butterflyAnchors[bi % butterflyAnchors.length];
    butterflyGroups[bi % 3].entries.push({
      anchor: a,
      speed: 0.65 + (bi % 4) * 0.14,
      phase: bi * 1.13,
      flapHz: 9.5 + (bi % 3) * 1.4,
    });
  }
  for (const grp of butterflyGroups) {
    grp.buffer = new Float32Array(grp.entries.length * 2 * 16);
    grp.mesh.thinInstanceSetBuffer("matrix", grp.buffer, 16, false);
  }
  const _bfUnitScale = new Vector3(1, 1, 1);
  const _bfPos = new Vector3();
  const _bfQuat = new Quaternion();
  const _bfBodyMat = new Matrix();
  const _bfWingLocalMat = new Matrix();
  const _bfWingQuat = new Quaternion();
  const _bfWingOffset = new Vector3();
  const _bfFinalMat = new Matrix();
  updaters.push((elapsed) => {
    for (let gi = 0; gi < butterflyGroups.length; gi += 1) {
      const grp = butterflyGroups[gi];
      const buf = grp.buffer;
      let idx = 0;
      for (let ei = 0; ei < grp.entries.length; ei += 1) {
        const bf = grp.entries[ei];
        const t = elapsed * bf.speed + bf.phase;
        const px = bf.anchor.cx + Math.sin(t) * bf.anchor.r * 0.85 + Math.cos(t * 1.7) * 0.45;
        const pz = bf.anchor.cz + Math.cos(t * 0.9) * bf.anchor.r * 0.85;
        const py = bf.anchor.cy + Math.sin(t * 2.4) * 0.36;
        const vx = Math.cos(t) * bf.anchor.r * 0.85;
        const vz = -Math.sin(t * 0.9) * bf.anchor.r * 0.85;
        const yaw = yawToTarget(px, pz, px + vx, pz + vz);
        _bfPos.set(px, py, pz);
        Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, _bfQuat);
        Matrix.ComposeToRef(_bfUnitScale, _bfQuat, _bfPos, _bfBodyMat);
        const fl = Math.sin(elapsed * bf.flapHz + bf.phase) * 0.85;

        // Left wing
        _bfWingOffset.set(-0.04, 0, 0);
        Quaternion.RotationYawPitchRollToRef(0, 0, fl, _bfWingQuat);
        Matrix.ComposeToRef(_bfUnitScale, _bfWingQuat, _bfWingOffset, _bfWingLocalMat);
        _bfWingLocalMat.multiplyToRef(_bfBodyMat, _bfFinalMat);
        _bfFinalMat.copyToArray(buf, idx * 16);
        idx += 1;

        // Right wing
        _bfWingOffset.set(0.04, 0, 0);
        Quaternion.RotationYawPitchRollToRef(0, 0, -fl, _bfWingQuat);
        Matrix.ComposeToRef(_bfUnitScale, _bfWingQuat, _bfWingOffset, _bfWingLocalMat);
        _bfWingLocalMat.multiplyToRef(_bfBodyMat, _bfFinalMat);
        _bfFinalMat.copyToArray(buf, idx * 16);
        idx += 1;
      }
      grp.mesh.thinInstanceBufferUpdated("matrix");
    }
  });

  return {
    interactables,
    setNightMix(m) {
      nightMix = clamp(m, 0, 1);
      // Warm evening butterfly shimmer when dusk/night settles
      const bEm = lerp(0.28, 0.55, nightMix);
      bWingMatA.emissiveIntensity = bEm;
      bWingMatB.emissiveIntensity = bEm;
      bWingMatC.emissiveIntensity = bEm;
    },
    update(elapsed, dt) {
      for (let i = 0; i < updaters.length; i += 1) {
        updaters[i](elapsed, dt);
      }
    },
    reset() {
      for (let i = 0; i < resetters.length; i += 1) {
        resetters[i]();
      }
    },
  };
}

