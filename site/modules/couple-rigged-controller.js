// Rigged Stylized Couple Character Controller ("小贤贤" & "小冉子") — Babylon 9.36 Right-Handed
// Drives `couple_xian.glb` & `couple_ran.glb` with 17 NLA animation clips, smooth weight-0 NaN guard,
// Head/Lash morph targets (EyeBlink/Smile/Kiss/ShyBlush), selective rim outline, and nameplates.

import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Rendering/outlineRenderer";
import "@babylonjs/core/Animations/animatable";
import "@babylonjs/core/Morph/morphTargetManager";
import { instantiateGLB } from "./assets-loader.js";
import { clamp, lerp } from "./world-spatial.js";

export const COUPLE_DIMS = {
  xian: { hipY: 0.918, eyeY: 1.44, headCenterY: 1.45, topY: 1.58, label: "小贤贤", accent: "#ff7aa8" },
  ran: { hipY: 1.027, eyeY: 1.59, headCenterY: 1.60, topY: 1.72, label: "小冉子", accent: "#6aa8ff" },
};

const KNOWN_CLIPS = [
  "Carry_Hold",
  "Carry_Pose",
  "HoldHand_L",
  "HoldHand_R",
  "Pat_Give",
  "Pat_Recv",
  "Dance",
  "Heart",
  "Idle",
  "Walk",
  "Run",
  "Sit",
  "Lie",
  "Hug",
  "Kiss",
  "Hop",
  "Wave",
];

const LOOPED_CLIPS = new Set([
  "Idle",
  "Walk",
  "Run",
  "Sit",
  "Lie",
  "HoldHand_L",
  "HoldHand_R",
  "Dance",
  "Carry_Hold",
  "Carry_Pose",
  "Wave",
]);

function resolveClipKey(groupName) {
  for (let i = 0; i < KNOWN_CLIPS.length; i += 1) {
    const key = KNOWN_CLIPS[i];
    if (groupName === key || groupName.endsWith(`_${key}`) || groupName.endsWith(`/${key}`)) {
      return key;
    }
  }
  return null;
}

function createNameplateTag(scene, id, label, accentHex, parentNode) {
  const tex = new DynamicTexture(`CoupleTagTex_${id}`, { width: 256, height: 76 }, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, 256, 76);

  // Pill background with soft translucent frosted card + colored border
  ctx.fillStyle = "rgba(255, 249, 252, 0.94)";
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.roundRect(14, 10, 228, 56, 28);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#2b1924";
  ctx.font = "700 30px 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 128, 39);
  tex.update();

  const mat = new StandardMaterial(`CoupleTagMat_${id}`, scene);
  mat.diffuseTexture = tex;
  mat.opacityTexture = tex;
  mat.emissiveTexture = tex;
  mat.emissiveColor = new Color3(0.42, 0.42, 0.42);
  mat.diffuseColor = new Color3(1, 1, 1);
  mat.disableLighting = true;
  mat.backFaceCulling = false;

  const plane = CreatePlane(`CoupleTag_${id}`, { width: 0.72, height: 0.215 }, scene);
  plane.parent = parentNode;
  scene.getGlowLayerByName?.("EstateGlow")?.addExcludedMesh?.(plane);
  plane.material = mat;
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.isPickable = false;
  plane.renderingGroupId = 1;
  plane.position.set(0, 1.92, 0);
  return plane;
}

export function createRiggedCharacter(scene, opts = {}) {
  const id = opts.id === "ran" ? "ran" : "xian";
  const dims = COUPLE_DIMS[id];
  const name = opts.name || dims.label;
  const container = opts.container;
  const shadowGen = opts.shadowGen || null;

  const root = new TransformNode(`CoupleRoot_${id}`, scene);
  if (opts.parent) root.parent = opts.parent;
  root.metadata = { interactive: { id: `char-${id}`, label: name } };

  // glTF exports character facing +Z; rotating PI around Y inside `root` makes facing align with -Z (matches world yaw=0 -> -Z)
  const glbHolder = new TransformNode(`CoupleGLBHolder_${id}`, scene);
  glbHolder.parent = root;
  glbHolder.rotation.y = Math.PI;

  const inst = container ? instantiateGLB(container, `CoupleRig_${id}`, glbHolder) : null;

  const clipGroups = new Map();
  const clipWeights = new Map();
  const headMeshes = [];
  const allMeshes = [];
  const morphTargets = {
    EyeBlink: [],
    Smile: [],
    Kiss: [],
    ShyBlush: [],
  };

  let headBoneNode = null;

  if (inst) {
    for (const rn of inst.rootNodes) {
      const descendants = [rn, ...rn.getDescendants(false)];
      for (const node of descendants) {
        if (
          node.name &&
          (node.name === "Head" ||
            node.name === "J_Bip_C_Head" ||
            node.name.endsWith("_HeadBone") ||
            node.name.endsWith(".Head") ||
            node.name.endsWith("_J_Bip_C_Head"))
        ) {
          if (node instanceof TransformNode && !(node instanceof Mesh)) {
            headBoneNode = node;
          }
        }
        if (!(node instanceof Mesh) || node.getTotalVertices() === 0) continue;

        const mName = node.name || "";
        allMeshes.push(node);
        node.isPickable = true;
        node.alwaysSelectAsActiveMesh = true;
        node.metadata = { interactive: { id: `char-${id}`, label: name } };

        const matName = node.material?.name || "";
        const isDetailFaceOrTrim =
          /Face_Features|Features|EyeHighlight|EyeIris|EyeWhite|FaceBrow|FaceEyelash|FaceEyeline|FaceMouth|Eyes|Lash|Brows|Mouth|Lip|Gold|Ribbon|SakuraPin|RosePin|Accent|Vision/i.test(
            `${mName}_${matName}`
          );

        if (shadowGen && !/Features|EyeHighlight|FaceBrow|FaceEyelash|FaceEyeline|Eyes|Lash|Brows|Mouth|SakuraPin|RosePin/i.test(`${mName}_${matName}`)) {
          shadowGen.addShadowCaster(node, false);
        }
        node.receiveShadows = true;

        // Disable coarse stencil outline extrusion: VRM meshes have tight layered clothing & double-sided hair
        // where stencil extrusion causes inner skin/backface outlines to bleed through pants and hair.
        node.renderOutline = false;

        // Genshin-style luminous anime character fill & bright eyes
        if (node.material instanceof PBRMaterial) {
          if (/Face_00|Body_00|Face|Skin/i.test(matName) && !/Eyeline|Eyelash|Brow|Mouth/i.test(matName)) {
            node.material.emissiveColor = new Color3(0.11, 0.085, 0.075);
            node.material.roughness = Math.max(0.72, node.material.roughness || 0.76);
          } else if (/EyeIris|EyeHighlight|EyeWhite/i.test(matName)) {
            node.material.emissiveColor = new Color3(0.16, 0.16, 0.18);
          } else if (/Hair/i.test(matName)) {
            node.material.emissiveColor = new Color3(0.055, 0.048, 0.052);
          } else if (/Tops|Shoes|Bottoms|GenshinCoat/i.test(matName) && !/Vision/i.test(matName)) {
            node.material.emissiveColor = new Color3(0.035, 0.035, 0.042);
          }
        }

        if (
          /Head|Face_Skin|Face_Features|Eyes|Lash|Brows|Mouth|Hair|Ribbon|SakuraPin/i.test(mName) ||
          (id === "xian" && /Gold/i.test(mName))
        ) {
          headMeshes.push(node);
        }

        if (node.morphTargetManager) {
          const mgr = node.morphTargetManager;
          for (let ti = 0; ti < mgr.numTargets; ti += 1) {
            const mt = mgr.getTarget(ti);
            mt.influence = 0;
            if (mt.name && morphTargets[mt.name]) {
              morphTargets[mt.name].push(mt);
            }
          }
        }
      }
    }

    for (const grp of inst.animationGroups) {
      const key = resolveClipKey(grp.name);
      if (key) {
        clipGroups.set(key, grp);
        clipWeights.set(key, key === "Idle" ? 1 : 0);
        grp.stop();
        grp.setWeightForAllAnimatables(0);
      }
    }

    const idleGrp = clipGroups.get("Idle");
    if (idleGrp) {
      idleGrp.start(true, 1.0, idleGrp.from, idleGrp.to, false);
      idleGrp.setWeightForAllAnimatables(1.0);
    }
  }

  const tagMesh = createNameplateTag(scene, id, name, dims.accent, root);
  const tag = {
    get visible() {
      return tagMesh.isVisible;
    },
    set visible(v) {
      tagMesh.isVisible = Boolean(v);
    },
  };

  // Character state exposed to couple-mode-babylon.js
  const stateObj = {
    id,
    name,
    root,
    tag,
    hipY: dims.hipY,
    eyeY: dims.eyeY,
    pos: new Vector3(0, 0, 0),
    yaw: 0,
    rootQuat: null,
    speed: 0,
    state: "idle", // "idle" | "walk" | "run" | "sit" | "lie" | "carried"
    action: null,
    lookTarget: null,
    headVisible: true,
    _lastOneShotTag: "",
    _blinkCooldown: 2.2 + (id === "ran" ? 1.1 : 0.0),
    _blinkPhase: -1,
    _morphCur: { EyeBlink: 0, Smile: 0.15, Kiss: 0, ShyBlush: 0 },

    setVisibleHead(visible) {
      const next = Boolean(visible);
      if (stateObj.headVisible === next) return;
      stateObj.headVisible = next;
      for (let i = 0; i < headMeshes.length; i += 1) {
        headMeshes[i].isVisible = next;
      }
    },

    place(x, y, z, yaw, quat = null) {
      stateObj.pos.set(x, y, z);
      stateObj.yaw = yaw;
      stateObj.rootQuat = quat ? quat.clone() : null;
    },

    startAction(actionName, duration = 2.0, extra = {}) {
      stateObj.action = {
        name: actionName,
        elapsed: 0,
        duration,
        ...extra,
      };
      stateObj._lastOneShotTag = `${actionName}:${performance.now().toFixed(2)}`;
    },

    clearAction(onlyName = null) {
      if (!onlyName || stateObj.action?.name === onlyName) {
        stateObj.action = null;
      }
    },

    syncTransform() {
      root.position.copyFrom(stateObj.pos);
      if (stateObj.rootQuat) {
        root.rotationQuaternion = stateObj.rootQuat;
      } else {
        root.rotationQuaternion = null;
        root.rotation.set(0, stateObj.yaw, 0);
      }
      root.computeWorldMatrix(true);
    },

    getEyeWorld() {
      stateObj.syncTransform();
      const wm = root.getWorldMatrix();
      const eyeY = stateObj.state === "carried" ? dims.eyeY * 0.94 : dims.eyeY;
      return Vector3.TransformCoordinates(new Vector3(0, eyeY, -0.14), wm);
    },

    getHeadWorld() {
      stateObj.syncTransform();
      if (headBoneNode && stateObj.state !== "idle") {
        headBoneNode.computeWorldMatrix(true);
        const abs = headBoneNode.getAbsolutePosition();
        if (Number.isFinite(abs.x) && Number.isFinite(abs.y) && Number.isFinite(abs.z)) {
          return abs.add(new Vector3(0, 0.10, 0));
        }
      }
      return Vector3.TransformCoordinates(new Vector3(0, dims.headCenterY, 0), root.getWorldMatrix());
    },

    update(dt) {
      const safeDt = clamp(dt || 0.016, 0.001, 0.05);

      // 1. Advance timed actions
      if (stateObj.action) {
        stateObj.action.elapsed += safeDt;
        if (stateObj.action.elapsed >= stateObj.action.duration) {
          stateObj.action = null;
        }
      }

      // 2. Apply world placement to Babylon TransformNode
      stateObj.syncTransform();

      // Update nameplate gently above head in world space
      const headLocalTop =
        stateObj.state === "lie"
          ? new Vector3(0, dims.topY + 0.28, -0.22)
          : new Vector3(0, dims.topY + 0.28, 0);
      const tagWorld = Vector3.TransformCoordinates(headLocalTop, root.getWorldMatrix());
      const invRoot = Matrix.Invert(root.getWorldMatrix());
      const tagLocal = Vector3.TransformCoordinates(tagWorld, invRoot);
      tagMesh.position.copyFrom(tagLocal);

      // 3. Determine desired NLA animation weights
      const desired = {};
      const act = stateObj.action;
      let walkRatio = 1.0;

      if (act) {
        if (act.name === "hug") desired.Hug = 1;
        else if (act.name === "kiss") desired.Kiss = 1;
        else if (act.name === "pat") desired[act.role === "give" ? "Pat_Give" : "Pat_Recv"] = 1;
        else if (act.name === "dance") desired.Dance = 1;
        else if (act.name === "heart") desired.Heart = 1;
        else if (act.name === "hop") desired.Hop = 1;
        else if (act.name === "wave") desired.Wave = 1;
        else if (act.name === "carry") desired[id === "ran" ? "Carry_Hold" : "Carry_Pose"] = 1;
        else if (act.name === "holdhand") {
          const hhClip = (act.side ?? 1) > 0 ? "HoldHand_R" : "HoldHand_L";
          if (stateObj.speed > 2.3) {
            desired.Run = 0.56;
            desired[hhClip] = 0.44;
          } else if (stateObj.speed > 0.14) {
            desired.Walk = 0.56;
            desired[hhClip] = 0.44;
            walkRatio = clamp(stateObj.speed / 1.85, 0.72, 1.45);
          } else {
            desired[hhClip] = 1;
          }
        }
      } else if (stateObj.state === "sit") {
        desired.Sit = 1;
      } else if (stateObj.state === "lie") {
        desired.Lie = 1;
      } else if (stateObj.state === "carried") {
        desired.Carry_Pose = 1;
      } else if (stateObj.speed > 2.35) {
        desired.Run = 1;
        walkRatio = clamp(stateObj.speed / 3.4, 0.8, 1.35);
      } else if (stateObj.speed > 0.14) {
        desired.Walk = 1;
        walkRatio = clamp(stateObj.speed / 1.85, 0.65, 1.5);
      } else {
        desired.Idle = 1;
      }

      // 4. Blend weights & apply Babylon 9 zero-weight NaN guard
      const blendAlpha = clamp(safeDt * 9.5, 0, 1);
      const activeEntries = [];
      let activeSum = 0;

      for (const [key, grp] of clipGroups.entries()) {
        const targetW = desired[key] || 0;
        const prevW = clipWeights.get(key) || 0;
        const nextW = lerp(prevW, targetW, blendAlpha);
        clipWeights.set(key, nextW);

        if (nextW <= 0.005) {
          if (grp.isPlaying) {
            grp.setWeightForAllAnimatables(0);
            grp.stop();
          }
        } else {
          activeEntries.push([key, grp, nextW, targetW > 0 && prevW <= 0.005]);
          activeSum += nextW;
        }
      }

      if (activeSum <= 0.005) {
        const idleGrp = clipGroups.get("Idle");
        if (idleGrp) {
          clipWeights.set("Idle", 1);
          if (!idleGrp.isPlaying) {
            idleGrp.start(true, 1.0, idleGrp.from, idleGrp.to, false);
          }
          idleGrp.setWeightForAllAnimatables(1.0);
        }
      } else {
        for (let i = 0; i < activeEntries.length; i += 1) {
          const [key, grp, w, justActivated] = activeEntries[i];
          const normW = w / activeSum;
          const looped = LOOPED_CLIPS.has(key);
          const speedRatio = key === "Walk" || key === "Run" ? walkRatio : 1.0;
          if (!looped && justActivated) {
            grp.stop();
            grp.start(false, 1.0, grp.from, grp.to, false);
          } else if (!grp.isPlaying && looped) {
            grp.start(true, speedRatio, grp.from, grp.to, false);
          }
          grp.speedRatio = speedRatio;
          grp.setWeightForAllAnimatables(normW);
        }
      }

      // 5. Morph targets: automatic natural blinking + expressive emotions
      let blinkTarget = 0;
      if (act?.name === "kiss" || act?.name === "hug") {
        blinkTarget = 0.85;
      } else if (stateObj._blinkPhase >= 0) {
        stateObj._blinkPhase += safeDt / 0.17;
        if (stateObj._blinkPhase >= 1) {
          stateObj._blinkPhase = -1;
          stateObj._blinkCooldown = 2.4 + Math.random() * 2.8;
        } else {
          blinkTarget = Math.sin(stateObj._blinkPhase * Math.PI);
        }
      } else {
        stateObj._blinkCooldown -= safeDt;
        if (stateObj._blinkCooldown <= 0) stateObj._blinkPhase = 0;
      }

      const smileTarget =
        act && ["hug", "pat", "dance", "heart", "holdhand", "hop", "wave", "carry"].includes(act.name)
          ? 0.85
          : stateObj.state === "sit" || stateObj.state === "lie"
            ? 0.42
            : 0.16;
      const kissTarget = act?.name === "kiss" ? 0.92 : 0;
      const blushTarget =
        act && ["kiss", "hug", "pat", "heart", "carry"].includes(act.name) ? 0.9 : 0.12;

      const mRate = clamp(safeDt * 12, 0, 1);
      stateObj._morphCur.EyeBlink = lerp(stateObj._morphCur.EyeBlink, blinkTarget, mRate * 1.4);
      stateObj._morphCur.Smile = lerp(stateObj._morphCur.Smile, smileTarget, mRate);
      stateObj._morphCur.Kiss = lerp(stateObj._morphCur.Kiss, kissTarget, mRate);
      stateObj._morphCur.ShyBlush = lerp(stateObj._morphCur.ShyBlush, blushTarget, mRate);

      for (const mName of ["EyeBlink", "Smile", "Kiss", "ShyBlush"]) {
        const list = morphTargets[mName];
        const v = stateObj._morphCur[mName];
        for (let i = 0; i < list.length; i += 1) {
          list[i].influence = v;
        }
      }
    },
  };

  return stateObj;
}
