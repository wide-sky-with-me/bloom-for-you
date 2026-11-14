// Rigged Stylized Couple Character Controller ("小贤贤" & "小冉子") — Babylon 9.36 Right-Handed
// Drives `couple_xian.glb` & `couple_ran.glb` with 19 NLA animation clips, Walk_HoldHand gait,
// 2nd-order secondary spring physics (HairJoint + J_Sec cloth/ribbons/cape/coat),
// eyeball tracking (`J_Adj_L/R_FaceEye`) + Spine/Neck/Head banking, and 17-morph facial expression director.

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
  "Walk_HoldHand_L",
  "Walk_HoldHand_R",
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
  "Walk_HoldHand_L",
  "Walk_HoldHand_R",
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

const MORPH_NAMES = [
  "EyeBlink",
  "BlinkL",
  "BlinkR",
  "EyeJoy",
  "EyeSoft",
  "EyeWide",
  "BrowHappy",
  "BrowShy",
  "BrowPlayful",
  "BrowUp",
  "Smile",
  "GrinOpen",
  "MouthA",
  "MouthO",
  "MouthPout",
  "Kiss",
  "ShyBlush",
];

export const MOOD_CYCLE = ["auto", "happy", "shy", "wink", "pout", "surprised"];

export const MOOD_LABELS = {
  auto: "自然随动",
  happy: "元气灿笑",
  shy: "害羞脸红",
  wink: "俏皮Wink",
  pout: "撒娇嘟嘴",
  surprised: "惊喜星星眼",
};

const ACTION_EXPRESSION_PRESETS = {
  kiss: { EyeSoft: 0.72, BrowShy: 0.68, Kiss: 0.94, ShyBlush: 0.95 },
  hug: { EyeJoy: 0.86, BrowHappy: 0.76, Smile: 0.84, ShyBlush: 0.85 },
  heart: { EyeJoy: 0.90, BrowHappy: 0.80, Smile: 0.88, GrinOpen: 0.24, ShyBlush: 0.78 },
  dance: { EyeJoy: 0.76, BrowHappy: 0.70, Smile: 0.86, GrinOpen: 0.30, ShyBlush: 0.65 },
  holdhand: { EyeSoft: 0.46, BrowHappy: 0.56, Smile: 0.78, ShyBlush: 0.62 },
  hop: { EyeJoy: 0.82, BrowUp: 0.74, Smile: 0.74, GrinOpen: 0.54, ShyBlush: 0.44 },
  wave: { BlinkR: 0.92, EyeJoy: 0.42, BrowPlayful: 0.86, Smile: 0.76, MouthO: 0.16, ShyBlush: 0.64 },
  wink: { BlinkR: 0.96, EyeJoy: 0.36, BrowPlayful: 0.92, Smile: 0.78, MouthO: 0.14, ShyBlush: 0.70 },
};

const MOOD_PRESETS = {
  happy: { EyeJoy: 0.88, BrowHappy: 0.80, Smile: 0.88, GrinOpen: 0.32, ShyBlush: 0.56 },
  shy: { EyeSoft: 0.68, BrowShy: 0.82, Smile: 0.46, MouthO: 0.18, ShyBlush: 0.96 },
  wink: { BlinkL: 0.95, EyeJoy: 0.34, BrowPlayful: 0.92, Smile: 0.80, ShyBlush: 0.72 },
  pout: { EyeWide: 0.25, BrowShy: 0.65, BrowPlayful: 0.42, MouthPout: 0.94, ShyBlush: 0.78 },
  surprised: { EyeWide: 0.88, BrowUp: 0.90, MouthO: 0.74, Smile: 0.25, ShyBlush: 0.48 },
};

function createSpring2D(stiffness = 62, damping = 8.4, bounds = {}) {
  const pMin = bounds.pMin ?? -0.45;
  const pMax = bounds.pMax ?? 0.45;
  const rMin = bounds.rMin ?? -0.45;
  const rMax = bounds.rMax ?? 0.45;
  return {
    p: 0,
    vp: 0,
    r: 0,
    vr: 0,
    step(targetP, targetR, dt) {
      const steps = dt > 0.022 ? 2 : 1;
      const h = clamp(dt / steps, 0.001, 0.024);
      for (let i = 0; i < steps; i += 1) {
        this.vp += ((targetP - this.p) * stiffness - this.vp * damping) * h;
        this.vr += ((targetR - this.r) * stiffness - this.vr * damping) * h;
        this.p = clamp(this.p + this.vp * h, pMin, pMax);
        this.r = clamp(this.r + this.vr * h, rMin, rMax);
      }
      if (!Number.isFinite(this.p)) this.p = 0;
      if (!Number.isFinite(this.r)) this.r = 0;
    },
  };
}

function classifySecBone(bName) {
  if (bName.startsWith("J_Sec_RanCape")) {
    return {
      group: "capeCoat",
      segFactor: bName.endsWith("1") ? 1.05 : 0.62,
      sideSign: bName.includes("L") ? -1 : 0,
      pMin: -0.36,
      pMax: 0.08,
    };
  }
  if (bName.startsWith("J_Sec_RanCoat")) {
    return {
      group: "capeCoat",
      segFactor: bName.endsWith("2") ? 1.25 : bName.endsWith("1") ? 0.9 : 0.52,
      sideSign: bName.includes("CoatL") ? -1 : 1,
      pMin: -0.42,
      pMax: 0.10,
    };
  }
  if (bName.startsWith("J_Sec_RanSash") || bName.startsWith("J_Sec_XianRib")) {
    return {
      group: "ribbon",
      segFactor: bName.endsWith("1") ? 1.25 : 0.72,
      sideSign: bName.includes("RibL") ? -1 : bName.includes("RibR") ? 1 : 0.4,
      pMin: -0.42,
      pMax: 0.24,
    };
  }
  if (bName.includes("SkirtFront")) {
    return {
      group: "skirtFront",
      segFactor: bName.endsWith("2") ? 1.15 : bName.endsWith("1") ? 0.85 : 0.45,
      sideSign: bName.includes("_L_") ? -1 : 1,
      pMin: -0.06,
      pMax: 0.34,
    };
  }
  if (bName.includes("SkirtBack")) {
    return {
      group: "skirtBack",
      segFactor: bName.endsWith("2") ? 1.2 : bName.endsWith("1") ? 0.88 : 0.48,
      sideSign: bName.includes("_L_") ? -1 : 1,
      pMin: -0.38,
      pMax: 0.06,
    };
  }
  if (bName.includes("SkirtSide")) {
    return {
      group: "skirtSide",
      segFactor: bName.endsWith("2") ? 1.15 : bName.endsWith("1") ? 0.85 : 0.48,
      sideSign: bName.includes("_L_") ? -1 : 1,
      pMin: -0.22,
      pMax: 0.28,
    };
  }
  if (bName.includes("Sleeve")) {
    return {
      group: "sleeve",
      segFactor: bName.includes("Tip") ? 1.0 : 0.55,
      sideSign: bName.includes("_L_") ? -1 : 1,
      pMin: -0.26,
      pMax: 0.26,
    };
  }
  return null;
}

function makeBoneRigEntry(node, invRootRest, extra = {}) {
  const restLocalQuat = node.rotationQuaternion
    ? node.rotationQuaternion.clone()
    : Quaternion.FromEulerAngles(node.rotation.x, node.rotation.y, node.rotation.z);
  if (!node.rotationQuaternion) {
    node.rotationQuaternion = restLocalQuat.clone();
  }
  node.computeWorldMatrix(true);
  const mInRoot = node.getWorldMatrix().multiply(invRootRest);
  const invM = Matrix.Invert(mInRoot);
  return {
    node,
    restLocalQuat,
    savedPreDeltaQ: restLocalQuat.clone(),
    dirtyThisRender: false,
    posInRoot: Vector3.TransformCoordinates(Vector3.Zero(), mInRoot),
    axisRight: Vector3.TransformNormal(new Vector3(1, 0, 0), invM).normalize(),
    axisUp: Vector3.TransformNormal(new Vector3(0, 1, 0), invM).normalize(),
    axisBack: Vector3.TransformNormal(new Vector3(0, 0, 1), invM).normalize(),
    ...extra,
  };
}

function resolveClipKey(groupName) {
  for (let i = 0; i < KNOWN_CLIPS.length; i += 1) {
    const key = KNOWN_CLIPS[i];
    if (groupName === key || groupName.endsWith(`_${key}`) || groupName.endsWith(`/${key}`)) {
      return key;
    }
  }
  return null;
}

export function createNameplateTag(
  scene,
  id,
  label,
  accentHex,
  parentNode,
  { texWidth = 256, width = 0.72, height = 0.215, fontPx = 30, y = 1.92, renderingGroupId = 1, borderWidth = 4.5 } = {}
) {
  const tex = new DynamicTexture(`CoupleTagTex_${id}`, { width: texWidth, height: 76 }, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, texWidth, 76);

  // Pill background with soft translucent frosted card + colored border
  ctx.fillStyle = "rgba(255, 249, 252, 0.94)";
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = borderWidth;
  ctx.beginPath();
  ctx.roundRect(14, 10, texWidth - 28, 56, 28);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#2b1924";
  ctx.font = `700 ${fontPx}px 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, texWidth * 0.5, 39);
  tex.update();

  const mat = new StandardMaterial(`CoupleTagMat_${id}`, scene);
  mat.diffuseTexture = tex;
  mat.opacityTexture = tex;
  mat.emissiveTexture = tex;
  mat.emissiveColor = new Color3(0.42, 0.42, 0.42);
  mat.diffuseColor = new Color3(1, 1, 1);
  mat.disableLighting = true;
  mat.backFaceCulling = false;

  const plane = CreatePlane(`CoupleTag_${id}`, { width, height }, scene);
  plane.parent = parentNode;
  scene.getGlowLayerByName?.("EstateGlow")?.addExcludedMesh?.(plane);
  plane.material = mat;
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.isPickable = false;
  plane.renderingGroupId = renderingGroupId;
  plane.position.set(0, y, 0);
  return plane;
}

function wrapAngle(a) {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function applyDeltaLocal(entry, pitch, roll, yaw, qTmp1, qTmp2, qOut) {
  if (!entry) return;
  const node = entry.node;
  if (!node.rotationQuaternion) {
    node.rotationQuaternion = entry.restLocalQuat.clone();
  }
  const base = node.rotationQuaternion;
  entry.savedPreDeltaQ.copyFrom(base);
  if (Math.abs(pitch) + Math.abs(roll) + Math.abs(yaw) < 1e-4) {
    entry.dirtyThisRender = false;
    return;
  }
  qTmp1.set(0, 0, 0, 1);
  if (Math.abs(pitch) > 1e-4) {
    Quaternion.RotationAxisToRef(entry.axisRight, pitch, qTmp2);
    qTmp1.multiplyToRef(qTmp2, qOut);
    qTmp1.copyFrom(qOut);
  }
  if (Math.abs(roll) > 1e-4) {
    Quaternion.RotationAxisToRef(entry.axisBack, roll, qTmp2);
    qTmp1.multiplyToRef(qTmp2, qOut);
    qTmp1.copyFrom(qOut);
  }
  if (Math.abs(yaw) > 1e-4) {
    Quaternion.RotationAxisToRef(entry.axisUp, yaw, qTmp2);
    qTmp1.multiplyToRef(qTmp2, qOut);
    qTmp1.copyFrom(qOut);
  }
  entry.savedPreDeltaQ.multiplyToRef(qTmp1, base);
  entry.dirtyThisRender = true;
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
  const blushEntries = [];
  const morphTargets = Object.fromEntries(MORPH_NAMES.map((k) => [k, []]));
  const prefixRe = new RegExp(`^CoupleRig_${id}_`);

  let headBoneNode = null;
  const rigBones = {
    spine: null,
    chest: null,
    neck: null,
    head: null,
    eyeL: null,
    eyeR: null,
    hair: [],
    sec: [],
    allEntries: [],
    totalBoneNodes: 0,
  };

  if (inst) {
    const rawTransformNodes = [];
    for (const rn of inst.rootNodes) {
      const descendants = [rn, ...rn.getDescendants(false)];
      for (const node of descendants) {
        const cleanName = (node.name || "").replace(prefixRe, "");
        if (node instanceof TransformNode && !(node instanceof Mesh)) {
          rawTransformNodes.push([node, cleanName]);
          if (
            cleanName === "Head" ||
            cleanName === "J_Bip_C_Head" ||
            cleanName.endsWith("_HeadBone") ||
            cleanName.endsWith(".Head")
          ) {
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
        const isBlush = /Face_Blush|FaceBlush/i.test(`${mName}_${matName}`);
        const isDetailFaceOrTrim =
          isBlush ||
          /Face_Features|Features|EyeHighlight|EyeIris|EyeWhite|FaceBrow|FaceEyelash|FaceEyeline|FaceMouth|Eyes|Lash|Brows|Mouth|Lip|Gold|Ribbon|SakuraPin|RosePin|Accent|Vision/i.test(
            `${mName}_${matName}`
          );

        if (
          shadowGen &&
          !/Face_Blush|FaceBlush|Features|EyeHighlight|FaceBrow|FaceEyelash|FaceEyeline|Eyes|Lash|Brows|Mouth|SakuraPin|RosePin/i.test(
            `${mName}_${matName}`
          )
        ) {
          shadowGen.addShadowCaster(node, false);
        }
        node.receiveShadows = !isBlush;

        // Selective crisp Genshin ink outline strictly on outer closed solid parts
        // (double-sided hair, blush cards, ribbons, and delicate facial features stay outline-free).
        const isOutlineClean =
          !isDetailFaceOrTrim &&
          !/Hair|Ribbon|Sash|Crown|CoatLining/i.test(`${mName}_${matName}`) &&
          node.material?.backFaceCulling !== false;
        if (isOutlineClean) {
          node.renderOutline = true;
          node.outlineWidth = 0.0018;
          node.outlineColor = new Color3(0.20, 0.11, 0.16);
        } else {
          node.renderOutline = false;
        }

        // Genshin-style luminous anime character fill, bright eyes & controllable rose blush overlay
        if (node.material instanceof PBRMaterial) {
          if (isBlush) {
            node.material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
            node.material.disableDepthWrite = true;
            node.material.needDepthPrePass = false;
            node.material.roughness = 0.96;
            node.material.metallic = 0.0;
            node.material.emissiveColor = new Color3(0.16, 0.035, 0.055);
            node.material.alpha = 0.22;
            blushEntries.push({ mesh: node, mat: node.material });
          } else if (/Face_00|Body_00|Face|Skin/i.test(matName) && !/Eyeline|Eyelash|Brow|Mouth/i.test(matName)) {
            node.material.emissiveColor = new Color3(0.11, 0.085, 0.075);
            node.material.roughness = Math.max(0.72, node.material.roughness || 0.76);
          } else if (/EyeIris|EyeHighlight|EyeWhite/i.test(matName)) {
            node.material.emissiveColor = new Color3(0.16, 0.16, 0.18);
          } else if (/Hair/i.test(matName)) {
            node.material.emissiveColor = new Color3(0.055, 0.048, 0.052);
          } else if (/Tops|Shoes|Bottoms|GenshinCoat|ShoulderCape/i.test(matName) && !/Vision/i.test(matName)) {
            node.material.emissiveColor = new Color3(0.035, 0.035, 0.042);
          }
        }

        if (
          /Head|Face_Skin|Face_Features|Face_Blush|Eyes|Lash|Brows|Mouth|Hair|Ribbon|SakuraPin/i.test(mName) ||
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

    // Calibrate rest-pose local-to-root axes BEFORE starting Idle animation
    root.position.set(0, 0, 0);
    root.rotationQuaternion = null;
    root.rotation.set(0, 0, 0);
    root.computeWorldMatrix(true);
    const invRootRest = Matrix.Invert(root.getWorldMatrix());

    let headRestPos = new Vector3(0, dims.headCenterY, 0);
    if (headBoneNode) {
      headBoneNode.computeWorldMatrix(true);
      headRestPos = Vector3.TransformCoordinates(Vector3.Zero(), headBoneNode.getWorldMatrix().multiply(invRootRest));
    }

    rigBones.totalBoneNodes = rawTransformNodes.length;
    for (let i = 0; i < rawTransformNodes.length; i += 1) {
      const [node, cleanName] = rawTransformNodes[i];
      if (cleanName === "J_Bip_C_Spine") {
        rigBones.spine = makeBoneRigEntry(node, invRootRest);
        rigBones.allEntries.push(rigBones.spine);
      } else if (cleanName === "J_Bip_C_UpperChest" || (cleanName === "J_Bip_C_Chest" && !rigBones.chest)) {
        rigBones.chest = makeBoneRigEntry(node, invRootRest);
        rigBones.allEntries.push(rigBones.chest);
      } else if (cleanName === "J_Bip_C_Neck") {
        rigBones.neck = makeBoneRigEntry(node, invRootRest);
        rigBones.allEntries.push(rigBones.neck);
      } else if (cleanName === "J_Bip_C_Head") {
        rigBones.head = makeBoneRigEntry(node, invRootRest);
        rigBones.allEntries.push(rigBones.head);
      } else if (cleanName === "J_Adj_L_FaceEye") {
        rigBones.eyeL = makeBoneRigEntry(node, invRootRest);
        rigBones.allEntries.push(rigBones.eyeL);
      } else if (cleanName === "J_Adj_R_FaceEye") {
        rigBones.eyeR = makeBoneRigEntry(node, invRootRest);
        rigBones.allEntries.push(rigBones.eyeR);
      } else if (cleanName.startsWith("HairJoint-") && !cleanName.endsWith("_end")) {
        let depth = 0;
        let cur = node.parent;
        while (cur) {
          const pn = (cur.name || "").replace(prefixRe, "");
          if (pn.startsWith("HairJoint-")) depth += 1;
          else break;
          cur = cur.parent;
        }
        const entry = makeBoneRigEntry(node, invRootRest, {
          depth,
          tipFactor: clamp(0.42 + depth * 0.28, 0.42, 1.32),
          phaseSeed: ((rigBones.hair.length * 1.618) % 1) * Math.PI * 2,
          group: "hairSideR",
        });
        if (entry.posInRoot.z < headRestPos.z - 0.025) {
          entry.group = "hairBangs";
        } else if (entry.posInRoot.z > headRestPos.z + 0.045) {
          entry.group = "hairBack";
        } else if (entry.posInRoot.x < -0.025) {
          entry.group = "hairSideL";
        } else {
          entry.group = "hairSideR";
        }
        rigBones.hair.push(entry);
        rigBones.allEntries.push(entry);
      } else if (cleanName.startsWith("J_Sec_") && !cleanName.endsWith("_end") && !cleanName.includes("Bust")) {
        const meta = classifySecBone(cleanName);
        if (meta) {
          const entry = makeBoneRigEntry(node, invRootRest, {
            ...meta,
            phaseSeed: ((rigBones.sec.length * 1.37) % 1) * Math.PI * 2,
          });
          rigBones.sec.push(entry);
          rigBones.allEntries.push(entry);
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

  const springs = {
    hairBack: createSpring2D(52, 7.6, { pMin: -0.26, pMax: 0.14, rMin: -0.24, rMax: 0.24 }),
    hairSideL: createSpring2D(60, 8.2, { pMin: -0.22, pMax: 0.14, rMin: -0.22, rMax: 0.18 }),
    hairSideR: createSpring2D(60, 8.2, { pMin: -0.22, pMax: 0.14, rMin: -0.18, rMax: 0.22 }),
    hairBangs: createSpring2D(74, 9.5, { pMin: -0.10, pMax: 0.08, rMin: -0.10, rMax: 0.10 }),
    capeCoat: createSpring2D(46, 7.4, { pMin: -0.36, pMax: 0.12, rMin: -0.26, rMax: 0.26 }),
    ribbon: createSpring2D(44, 6.8, { pMin: -0.38, pMax: 0.20, rMin: -0.34, rMax: 0.34 }),
    skirtFront: createSpring2D(66, 9.2, { pMin: -0.05, pMax: 0.28, rMin: -0.16, rMax: 0.16 }),
    skirtBack: createSpring2D(62, 8.6, { pMin: -0.28, pMax: 0.05, rMin: -0.18, rMax: 0.18 }),
    skirtSide: createSpring2D(64, 8.8, { pMin: -0.18, pMax: 0.20, rMin: -0.22, rMax: 0.22 }),
    sleeve: createSpring2D(68, 9.0, { pMin: -0.18, pMax: 0.18, rMin: -0.18, rMax: 0.18 }),
  };

  const proc = {
    timeSec: id === "ran" ? 1.3 : 0.0,
    prevPos: null,
    prevYaw: null,
    prevFwdSpeed: 0,
    turnRate: 0,
    walkPhase: 0,
    eyeYaw: 0,
    eyePitch: 0,
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
    neckYaw: 0,
    neckPitch: 0,
    spineRoll: 0,
    spinePitch: 0,
    mood: "auto",
    moodTimer: 0,
    winkTimer: 0,
    winkSide: "R",
    talkTimer: 0,
    idleExprTimer: 2.0 + (id === "ran" ? 1.4 : 0.0),
    idleSoftSmile: 0,
  };

  const scratch = {
    invRoot: new Matrix(),
    toTarget: new Vector3(),
    localDir: new Vector3(),
    qTmp1: new Quaternion(),
    qTmp2: new Quaternion(),
    qOut: new Quaternion(),
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
    turnRate: 0,
    state: "idle", // "idle" | "walk" | "run" | "sit" | "lie" | "carried"
    action: null,
    lookTarget: null,
    headVisible: true,
    _lastOneShotTag: "",
    _blinkCooldown: 2.2 + (id === "ran" ? 1.1 : 0.0),
    _blinkPhase: -1,
    _morphCur: Object.fromEntries(MORPH_NAMES.map((k) => [k, k === "Smile" ? 0.16 : 0])),

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

    setMood(mood = "auto", duration = 8.0) {
      proc.mood = MOOD_CYCLE.includes(mood) ? mood : "auto";
      proc.moodTimer = proc.mood === "auto" ? 0 : duration;
      return proc.mood;
    },

    cycleMood(duration = 8.0) {
      const idx = MOOD_CYCLE.indexOf(proc.mood);
      const next = MOOD_CYCLE[(idx + 1) % MOOD_CYCLE.length];
      return stateObj.setMood(next, duration);
    },

    getMood: () => proc.mood,

    triggerWink(side = "R", duration = 1.45) {
      proc.winkSide = side === "L" ? "L" : "R";
      proc.winkTimer = Math.max(proc.winkTimer, duration);
    },

    triggerTalk(duration = 1.5) {
      proc.talkTimer = Math.max(proc.talkTimer, duration);
    },

    getDiagnostics() {
      const activeHair = rigBones.hair.filter((e) => e.dirtyThisRender).length;
      const activeSec = rigBones.sec.filter((e) => e.dirtyThisRender).length;
      const morphSummary = {};
      for (const k of MORPH_NAMES) {
        if (morphTargets[k].length) morphSummary[k] = Number(stateObj._morphCur[k].toFixed(3));
      }
      return {
        id,
        totalBones: rigBones.totalBoneNodes,
        hairJoints: rigBones.hair.length,
        secBones: rigBones.sec.length,
        activeHairSprings: activeHair,
        activeSecSprings: activeSec,
        eyeBonesPresent: Boolean(rigBones.eyeL && rigBones.eyeR),
        mood: proc.mood,
        hairBackSpring: [Number(springs.hairBack.p.toFixed(4)), Number(springs.hairBack.r.toFixed(4))],
        capeSpring: [Number(springs.capeCoat.p.toFixed(4)), Number(springs.capeCoat.r.toFixed(4))],
        eyeGaze: [Number(proc.eyeYaw.toFixed(4)), Number(proc.eyePitch.toFixed(4))],
        morphCount: Object.keys(morphSummary).length,
        morphs: morphSummary,
      };
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
      proc.timeSec += safeDt;

      // 1. Advance timed actions & expression overrides
      if (stateObj.action) {
        stateObj.action.elapsed += safeDt;
        if (stateObj.action.elapsed >= stateObj.action.duration) {
          stateObj.action = null;
        }
      }
      if (proc.moodTimer > 0) {
        proc.moodTimer -= safeDt;
        if (proc.moodTimer <= 0) proc.mood = "auto";
      }
      if (proc.winkTimer > 0) proc.winkTimer = Math.max(0, proc.winkTimer - safeDt);
      if (proc.talkTimer > 0) proc.talkTimer = Math.max(0, proc.talkTimer - safeDt);

      // 2. Apply world placement & derive velocity/turn dynamics
      stateObj.syncTransform();
      let velX = 0;
      let velY = 0;
      let velZ = 0;
      let rawTurnRate = stateObj.turnRate || 0;
      if (proc.prevPos) {
        const dp = stateObj.pos.subtract(proc.prevPos);
        if (dp.lengthSquared() < 9.0) {
          velX = dp.x / safeDt;
          velY = dp.y / safeDt;
          velZ = dp.z / safeDt;
        }
        proc.prevPos.copyFrom(stateObj.pos);
      } else {
        proc.prevPos = stateObj.pos.clone();
      }
      if (proc.prevYaw !== null && !stateObj.turnRate) {
        rawTurnRate = wrapAngle(stateObj.yaw - proc.prevYaw) / safeDt;
      }
      proc.prevYaw = stateObj.yaw;
      proc.turnRate = lerp(proc.turnRate, clamp(rawTurnRate, -5.5, 5.5), clamp(safeDt * 12, 0, 1));

      // Project world velocity into character local space (-Z forward, +X right)
      const fwdX = -Math.sin(stateObj.yaw);
      const fwdZ = -Math.cos(stateObj.yaw);
      const rightX = Math.cos(stateObj.yaw);
      const rightZ = -Math.sin(stateObj.yaw);
      const instFwdSpeed = velX * fwdX + velZ * fwdZ;
      const fwdSpeed = Math.abs(instFwdSpeed) > 0.04 ? instFwdSpeed : stateObj.speed;
      const sideSpeed = velX * rightX + velZ * rightZ;
      const fwdAccel = clamp((fwdSpeed - proc.prevFwdSpeed) / safeDt, -14, 14);
      proc.prevFwdSpeed = fwdSpeed;

      // Update nameplate gently above head in world space
      const headLocalTop =
        stateObj.state === "lie"
          ? new Vector3(0, dims.topY + 0.28, -0.22)
          : new Vector3(0, dims.topY + 0.28, 0);
      const tagWorld = Vector3.TransformCoordinates(headLocalTop, root.getWorldMatrix());
      root.getWorldMatrix().invertToRef(scratch.invRoot);
      const tagLocal = Vector3.TransformCoordinates(tagWorld, scratch.invRoot);
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
        else if (act.name === "wave" || act.name === "wink") desired.Wave = 1;
        else if (act.name === "carry") desired[id === "ran" ? "Carry_Hold" : "Carry_Pose"] = 1;
        else if (act.name === "holdhand") {
          const isRight = (act.side ?? 1) > 0;
          const hhStand = isRight ? "HoldHand_R" : "HoldHand_L";
          const hhWalk = isRight ? "Walk_HoldHand_R" : "Walk_HoldHand_L";
          if (stateObj.speed > 2.35 && clipGroups.has("Run")) {
            desired.Run = 0.72;
            desired[hhWalk] = 0.28;
            walkRatio = clamp(stateObj.speed / 3.35, 0.78, 1.38);
          } else if (stateObj.speed > 0.14 && clipGroups.has(hhWalk)) {
            desired[hhWalk] = 1;
            walkRatio = clamp(stateObj.speed / 1.48, 0.70, 1.45);
          } else {
            desired[hhStand] = 1;
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
        walkRatio = clamp(stateObj.speed / 3.35, 0.78, 1.38);
      } else if (stateObj.speed > 0.14) {
        desired.Walk = 1;
        walkRatio = clamp(stateObj.speed / 1.48, 0.70, 1.45);
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
          const isWalkClip = key === "Walk" || key === "Walk_HoldHand_L" || key === "Walk_HoldHand_R";
          const speedRatio = isWalkClip || key === "Run" ? walkRatio : 1.0;
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

      // 5. Secondary Physics Springs (HairJoint + J_Sec cape/coat/skirt/ribbons/sleeves)
      const isLocomoting = stateObj.speed > 0.14;
      proc.walkPhase += safeDt * (isLocomoting ? (stateObj.speed > 2.35 ? 11.5 : 7.6 * walkRatio) : 2.1);
      const stepImpulse = isLocomoting ? Math.sin(proc.walkPhase * 2.0) * clamp(stateObj.speed / 2.2, 0.15, 1.0) : 0;
      const swayCycle = isLocomoting ? Math.sin(proc.walkPhase) : Math.sin(proc.timeSec * 1.45);
      // Gentle coastal sea breeze across harbor
      const windWorldX = Math.sin(proc.timeSec * 0.72) * 0.65 + 0.38;
      const windWorldZ = Math.cos(proc.timeSec * 0.58) * 0.55 - 0.30;
      const windFwd = windWorldX * fwdX + windWorldZ * fwdZ;
      const windSide = windWorldX * rightX + windWorldZ * rightZ;

      const hairPitchBase = clamp(
        -fwdSpeed * 0.042 - fwdAccel * 0.008 + velY * 0.035 - windFwd * 0.025 + stepImpulse * 0.026,
        -0.25,
        0.14
      );
      const hairRollBase = clamp(
        proc.turnRate * 0.055 - sideSpeed * 0.032 + windSide * 0.032 + swayCycle * (isLocomoting ? 0.028 : 0.012),
        -0.22,
        0.22
      );
      springs.hairBack.step(hairPitchBase, hairRollBase, safeDt);
      springs.hairSideL.step(hairPitchBase * 0.75 + Math.sin(proc.timeSec * 1.9) * 0.012, hairRollBase * 0.8 - 0.014, safeDt);
      springs.hairSideR.step(hairPitchBase * 0.75 + Math.cos(proc.timeSec * 1.9) * 0.012, hairRollBase * 0.8 + 0.014, safeDt);
      springs.hairBangs.step(clamp(hairPitchBase * 0.25 - velY * 0.015, -0.08, 0.06), hairRollBase * 0.25, safeDt);

      // Note cape/coat use negative-around-X = forward, positive-around-X = backward trailing?
      // Root +X right-hand rule: +pitch swings downward (-Y) toward -Z (FORWARD), -pitch swings (-Y) toward +Z (BACKWARD)!
      // Therefore hairPitchBase (<0 when running forward) correctly trails tails BACKWARD (+Z_root).
      springs.capeCoat.step(
        clamp(hairPitchBase * 1.15 - Math.abs(stepImpulse) * 0.03, -0.34, 0.10),
        clamp(hairRollBase * 1.15, -0.24, 0.24),
        safeDt
      );
      springs.ribbon.step(
        clamp(hairPitchBase * 1.35 + stepImpulse * 0.045, -0.36, 0.18),
        clamp(hairRollBase * 1.30 + Math.sin(proc.timeSec * 2.2) * 0.03, -0.30, 0.30),
        safeDt
      );
      springs.skirtFront.step(
        clamp(Math.abs(stepImpulse) * 0.08 + clamp(fwdSpeed * 0.025, 0, 0.10), -0.04, 0.24),
        hairRollBase * 0.45,
        safeDt
      );
      springs.skirtBack.step(clamp(hairPitchBase * 0.9 - Math.abs(stepImpulse) * 0.04, -0.26, 0.04), hairRollBase * 0.55, safeDt);
      springs.skirtSide.step(hairPitchBase * 0.5, hairRollBase * 0.85, safeDt);
      springs.sleeve.step(hairPitchBase * 0.55, hairRollBase * 0.65, safeDt);

      // 6. Eyeball Gaze, Additive Neck/Head Look & Turn Banking
      let targetEyeYaw = 0;
      let targetEyePitch = 0;
      let targetHeadYaw = 0;
      let targetHeadPitch = 0;
      let hasLookTarget = false;

      if (stateObj.lookTarget && stateObj.state !== "lie") {
        const eyeOrigin = Vector3.TransformCoordinates(new Vector3(0, dims.eyeY, 0), root.getWorldMatrix());
        scratch.toTarget.set(
          stateObj.lookTarget.x - eyeOrigin.x,
          stateObj.lookTarget.y - eyeOrigin.y,
          stateObj.lookTarget.z - eyeOrigin.z
        );
        Vector3.TransformNormalToRef(scratch.toTarget, scratch.invRoot, scratch.localDir);
        const fwdDot = -scratch.localDir.z;
        const horizLen = Math.hypot(scratch.localDir.x, fwdDot);
        if (fwdDot > 0.08 && horizLen > 0.12 && horizLen < 9.0) {
          hasLookTarget = true;
          // In root frame: -Z forward, -X left, +X right, +Y up.
          // +Y rotation aims -Z toward -X (Left); atan2(-x, -z) is positive when target is on Left (-X)!
          const rawYaw = clamp(Math.atan2(-scratch.localDir.x, fwdDot), -0.45, 0.45);
          const rawPitch = clamp(Math.atan2(scratch.localDir.y, horizLen), -0.26, 0.26);
          targetHeadYaw = rawYaw * 0.48;
          targetHeadPitch = rawPitch * 0.42;
          targetEyeYaw = clamp((rawYaw - targetHeadYaw) * 0.65, -0.14, 0.14);
          targetEyePitch = clamp((rawPitch - targetHeadPitch) * 0.58, -0.10, 0.10);
        }
      }

      if (!hasLookTarget) {
        // Turn lead anticipation when steering + gentle ambient curiosity saccades in idle
        const turnLeadYaw = clamp(proc.turnRate * 0.075, -0.20, 0.20);
        const idleSaccadeYaw = !isLocomoting ? Math.sin(proc.timeSec * 0.45 + (id === "ran" ? 1.5 : 0)) * 0.055 : 0;
        const idleSaccadePitch = !isLocomoting ? Math.sin(proc.timeSec * 0.72) * 0.025 : 0;
        targetHeadYaw = turnLeadYaw + idleSaccadeYaw * 0.65;
        targetHeadPitch = idleSaccadePitch * 0.6;
        targetEyeYaw = clamp(turnLeadYaw * 0.35 + idleSaccadeYaw, -0.11, 0.11);
        targetEyePitch = clamp(idleSaccadePitch, -0.07, 0.07);
      }

      const gazeRate = clamp(safeDt * 9.0, 0, 1);
      proc.eyeYaw = lerp(proc.eyeYaw, targetEyeYaw, gazeRate * 1.4);
      proc.eyePitch = lerp(proc.eyePitch, targetEyePitch, gazeRate * 1.4);
      proc.neckYaw = lerp(proc.neckYaw, targetHeadYaw * 0.38, gazeRate);
      proc.neckPitch = lerp(proc.neckPitch, targetHeadPitch * 0.35, gazeRate);
      proc.headYaw = lerp(proc.headYaw, targetHeadYaw * 0.62, gazeRate);
      proc.headPitch = lerp(proc.headPitch, targetHeadPitch * 0.65, gazeRate);
      proc.headRoll = lerp(proc.headRoll, clamp(proc.turnRate * 0.032, -0.09, 0.09), gazeRate);
      proc.spineRoll = lerp(proc.spineRoll, clamp(proc.turnRate * 0.048 * clamp(stateObj.speed / 2.2, 0.2, 1.0), -0.12, 0.12), gazeRate);
      proc.spinePitch = lerp(proc.spinePitch, clamp(fwdSpeed * 0.015, -0.04, 0.07), gazeRate);

      // 7. 17-Morph Facial Expression Director ("神态") + Animated Cheek Blush
      const targets = Object.fromEntries(MORPH_NAMES.map((k) => [k, 0]));
      targets.Smile = 0.18;
      targets.ShyBlush = 0.18;

      if (act) {
        if (act.name === "pat") {
          if (act.role === "give") {
            Object.assign(targets, { EyeJoy: 0.68, BrowHappy: 0.65, Smile: 0.80, ShyBlush: 0.45 });
          } else {
            Object.assign(targets, { EyeJoy: 0.88, BrowShy: 0.56, Smile: 0.84, ShyBlush: 0.94 });
          }
        } else if (act.name === "carry") {
          if (id === "ran") {
            Object.assign(targets, { EyeSoft: 0.35, BrowHappy: 0.58, Smile: 0.76, ShyBlush: 0.50 });
          } else {
            Object.assign(targets, { EyeJoy: 0.78, BrowShy: 0.72, Smile: 0.68, MouthO: 0.16, ShyBlush: 0.94 });
          }
        } else if (ACTION_EXPRESSION_PRESETS[act.name]) {
          Object.assign(targets, ACTION_EXPRESSION_PRESETS[act.name]);
        }
      } else if (proc.mood !== "auto" && MOOD_PRESETS[proc.mood]) {
        Object.assign(targets, MOOD_PRESETS[proc.mood]);
      } else if (stateObj.state === "carried") {
        Object.assign(targets, { EyeJoy: 0.78, BrowShy: 0.72, Smile: 0.68, MouthO: 0.16, ShyBlush: 0.94 });
      } else if (stateObj.state === "sit" || stateObj.state === "lie") {
        Object.assign(targets, { EyeSoft: 0.52, BrowHappy: 0.44, Smile: 0.54, ShyBlush: 0.34 });
      } else if (stateObj.speed > 2.35) {
        Object.assign(targets, { EyeWide: 0.28, BrowUp: 0.42, Smile: 0.44, MouthA: 0.22, ShyBlush: 0.32 });
      } else if (stateObj.speed > 0.14) {
        Object.assign(targets, { EyeSoft: 0.16, BrowHappy: 0.32, Smile: 0.42, ShyBlush: 0.22 });
      } else {
        // Idle gentle emotional breathing: occasional warm soft smile / shy glance when partner near
        proc.idleExprTimer -= safeDt;
        if (proc.idleExprTimer <= 0) {
          proc.idleExprTimer = 3.2 + Math.random() * 3.5;
          proc.idleSoftSmile = proc.idleSoftSmile > 0.5 ? 0 : 1;
        }
        const glanceWarmth = hasLookTarget ? 0.38 : proc.idleSoftSmile * 0.28;
        targets.EyeSoft = glanceWarmth * 0.85;
        targets.BrowHappy = 0.22 + glanceWarmth * 0.6;
        targets.Smile = 0.24 + glanceWarmth * 0.85;
        targets.ShyBlush = hasLookTarget ? 0.46 : 0.18 + glanceWarmth * 0.3;
      }

      // Temporary one-eye wink override (triggered explicitly or via wink/wave)
      if (proc.winkTimer > 0) {
        const wCurve = clamp(Math.sin(Math.min(1, proc.winkTimer / 0.25) * Math.PI * 0.5), 0, 1);
        targets[proc.winkSide === "L" ? "BlinkL" : "BlinkR"] = Math.max(targets[proc.winkSide === "L" ? "BlinkL" : "BlinkR"], 0.95 * wCurve);
        targets.BrowPlayful = Math.max(targets.BrowPlayful, 0.88 * wCurve);
        targets.Smile = Math.max(targets.Smile, 0.80 * wCurve);
        targets.ShyBlush = Math.max(targets.ShyBlush, 0.70 * wCurve);
      }

      // Subtle talking vowel mouth cadence during NPC/couple dialogue
      if (proc.talkTimer > 0) {
        const tWave = 0.5 + 0.5 * Math.sin(proc.timeSec * 15.0);
        const oWave = 0.5 + 0.5 * Math.sin(proc.timeSec * 9.5 + 1.1);
        targets.MouthA = Math.max(targets.MouthA, 0.48 * tWave);
        targets.MouthO = Math.max(targets.MouthO, 0.28 * oWave);
      }

      // Automatic natural blinking (suppressed proportionally during winks or squint smiles to avoid mesh clip)
      let blinkTarget = 0;
      if (act?.name === "kiss") {
        blinkTarget = 0.52;
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
      const eyeSuppress = clamp(Math.max(targets.BlinkL, targets.BlinkR, targets.EyeJoy * 0.85, targets.EyeSoft * 0.65), 0, 0.95);
      targets.EyeBlink = Math.max(targets.EyeBlink, blinkTarget * (1.0 - eyeSuppress));

      const mRate = clamp(safeDt * 13, 0, 1);
      for (let ki = 0; ki < MORPH_NAMES.length; ki += 1) {
        const mName = MORPH_NAMES[ki];
        const nextV = lerp(stateObj._morphCur[mName], clamp(targets[mName] || 0, 0, 1), mRate);
        stateObj._morphCur[mName] = nextV;
        const list = morphTargets[mName];
        for (let i = 0; i < list.length; i += 1) {
          list[i].influence = nextV;
        }
      }

      const blushAlpha = clamp(0.10 + stateObj._morphCur.ShyBlush * 0.82, 0.04, 0.92);
      for (let i = 0; i < blushEntries.length; i += 1) {
        blushEntries[i].mat.alpha = blushAlpha;
        blushEntries[i].mesh.isVisible = stateObj.headVisible && blushAlpha > 0.03;
      }
    },
  };

  // Before Babylon evaluates NLA animations: restore any procedural post-anim bone deltas
  const beforeAnimObs = scene.onBeforeAnimationsObservable.add(() => {
    for (let i = 0; i < rigBones.allEntries.length; i += 1) {
      const e = rigBones.allEntries[i];
      if (e.dirtyThisRender) {
        e.node.rotationQuaternion?.copyFrom(e.savedPreDeltaQ);
        e.dirtyThisRender = false;
      }
    }
  });

  // After NLA animations write pose keyframes and before skeleton.prepare(): layer springs, eyeballs & banking
  const afterAnimObs = scene.onAfterAnimationsObservable.add(() => {
    if (!inst || root.isDisposed()) return;
    const { qTmp1, qTmp2, qOut } = scratch;
    const dampCloth = stateObj.state === "lie" ? 0.25 : 1.0;

    for (let i = 0; i < rigBones.hair.length; i += 1) {
      const e = rigBones.hair[i];
      const sp = springs[e.group] || springs.hairBack;
      const micro = Math.sin(proc.timeSec * 2.1 + e.phaseSeed) * 0.010;
      const pitch = sp.p * e.tipFactor * 0.42;
      const roll = (sp.r + micro) * e.tipFactor * 0.42;
      applyDeltaLocal(e, pitch, roll, 0, qTmp1, qTmp2, qOut);
    }

    for (let i = 0; i < rigBones.sec.length; i += 1) {
      const e = rigBones.sec[i];
      const sp = springs[e.group];
      if (!sp) continue;
      const micro = Math.sin(proc.timeSec * 2.4 + e.phaseSeed) * 0.010;
      const p = clamp(sp.p * e.segFactor * 0.50 * dampCloth, e.pMin, e.pMax);
      const r = (sp.r + micro * e.sideSign) * e.segFactor * 0.50 * dampCloth;
      applyDeltaLocal(e, p, r, 0, qTmp1, qTmp2, qOut);
    }

    applyDeltaLocal(rigBones.eyeL, proc.eyePitch, 0, proc.eyeYaw, qTmp1, qTmp2, qOut);
    applyDeltaLocal(rigBones.eyeR, proc.eyePitch, 0, proc.eyeYaw, qTmp1, qTmp2, qOut);
    applyDeltaLocal(rigBones.neck, proc.neckPitch, 0, proc.neckYaw, qTmp1, qTmp2, qOut);
    applyDeltaLocal(rigBones.head, proc.headPitch, proc.headRoll, proc.headYaw, qTmp1, qTmp2, qOut);
    applyDeltaLocal(rigBones.spine, proc.spinePitch * 0.5, proc.spineRoll * 0.55, 0, qTmp1, qTmp2, qOut);
    applyDeltaLocal(rigBones.chest, proc.spinePitch * 0.5, proc.spineRoll * 0.45, 0, qTmp1, qTmp2, qOut);
  });

  stateObj.dispose = () => {
    scene.onBeforeAnimationsObservable.remove(beforeAnimObs);
    scene.onAfterAnimationsObservable.remove(afterAnimObs);
  };

  return stateObj;
}
