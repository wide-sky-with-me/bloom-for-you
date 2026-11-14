// Couple Interaction & Roaming Controller ("小贤贤" & "小冉子") — Babylon 9.36 Right-Handed
// Preserves full feature parity: 1st/2nd/3rd person cameras, WASD/Shift/Space, click-to-walk,
// breadcrumb trail following, hand-holding, princess carry, 9 couple actions, and all 51 world interactables.

import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  clamp,
  lerp,
  getWorldTerrainY,
  getWalkSurfaceY,
  isPositionWalkable,
  resolveWalkPosition,
} from "./world-spatial.js";
import { createInteractionFX } from "./flora-and-fx.js";
import { createRiggedCharacter } from "./couple-rigged-controller.js";

const SPEED_WALK = 2.05;
const SPEED_RUN = 3.65;

export const ACTIONS = {
  holdhand: { label: "牵手", key: "F" },
  hug: { label: "拥抱", key: "1" },
  kiss: { label: "亲亲", key: "2" },
  pat: { label: "摸头", key: "3" },
  dance: { label: "跳舞", key: "4" },
  heart: { label: "比心", key: "5" },
  carry: { label: "公主抱", key: "6" },
  hop: { label: "开心跳", key: "Space" },
  wave: { label: "招手", key: "" },
};

const VIEW_LABELS = {
  first: "第一人称",
  second: "第二人称",
  third: "第三人称",
};

const UP_VEC = new Vector3(0, 1, 0);

function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function basisQuaternion(xAxis, yAxis, zAxis) {
  const m = Matrix.FromXYZAxesToRef(xAxis, yAxis, zAxis, new Matrix());
  return Quaternion.FromRotationMatrix(m);
}

function isInsideVilla1FShell(x, z) {
  return (x > -23.5 && x < -10.3 && z > -9.9 && z < 4.1) || (x >= -10.3 && x < -3.9 && z > -9.9 && z < -1.3);
}

function inStudySuite(x, z) {
  return x > -10.5 && x < -3.9 && z > -9.9 && z < -1.3;
}

function buildWalkWaypoints(sx, sz, dx, dz, sy = 2.6, dy = 2.6) {
  if (sy > 4.5 || dy > 4.5) return [[dx, dz]];
  const sIn = isInsideVilla1FShell(sx, sz);
  const dIn = isInsideVilla1FShell(dx, dz);
  const pts = [];
  if (!sIn && dIn) {
    if (sz > 6.8 || Math.abs(sx + 14.0) > 2.2) pts.push([-14.0, 9.2]);
    pts.push([-14.0, 5.2], [-14.0, 2.2]);
    if (inStudySuite(dx, dz)) pts.push([-11.6, -5.2], [-9.2, -5.2]);
  } else if (sIn && !dIn) {
    if (inStudySuite(sx, sz)) pts.push([-9.2, -5.2], [-11.6, -5.2]);
    pts.push([-14.0, 2.2], [-14.0, 9.2]);
  } else if (sIn && dIn && inStudySuite(sx, sz) !== inStudySuite(dx, dz)) {
    pts.push(inStudySuite(sx, sz) ? [-9.2, -5.2] : [-12.0, -5.2]);
    pts.push(inStudySuite(sx, sz) ? [-12.0, -5.2] : [-9.2, -5.2]);
  }
  pts.push([dx, dz]);
  return pts;
}

export function createCoupleMode({
  scene,
  camera,
  canvas,
  models,
  shadowGen = null,
  sources = [],
  ui = {},
  audio = null,
  onActiveChange = null,
}) {
  const group = new TransformNode("CoupleModeSystem", scene);
  const fx = createInteractionFX(group, {
    name: "CoupleRomanceFX",
    maxSparks: 160,
    maxPetals: 40,
    maxRings: 8,
    scene,
  });

  const xian = createRiggedCharacter(scene, {
    id: "xian",
    name: "小贤贤",
    container: models?.couple_xian,
    shadowGen,
    parent: group,
  });

  const ran = createRiggedCharacter(scene, {
    id: "ran",
    name: "小冉子",
    container: models?.couple_ran,
    shadowGen,
    parent: group,
  });

  // Initial sunlit placement in the courtyard walkway, facing outward & slightly toward each other
  const xianStartY = getWalkSurfaceY(-13.35, 14.8, 2.22);
  const ranStartY = getWalkSurfaceY(-14.65, 14.8, 2.22);
  xian.place(-13.35, xianStartY, 14.8, Math.PI - 0.14);
  ran.place(-14.65, ranStartY, 14.8, Math.PI + 0.14);
  xian.syncTransform();
  ran.syncTransform();

  const chars = { xian, ran };

  let active = false;
  let controlledId = "xian";
  let view = "third";
  let holdingHands = false;
  let carrying = false;
  let danceT = 0;
  let seatSession = null;

  let camYaw = 0;
  let camPitch = -0.14;
  let camDist = 3.6;
  let camInit = false;
  const camPos = new Vector3();
  const camLook = new Vector3();

  let walkWaypoints = [];
  const trail = [];
  const keys = new Set();
  const idleGoal = { x: -13.35, z: 14.8, timer: 4.0, baseY: xianStartY };

  let interactables = [];
  function collectInteractables() {
    const out = [];
    for (let i = 0; i < sources.length; i += 1) {
      const s = sources[i];
      if (s && Array.isArray(s.interactables)) {
        for (let j = 0; j < s.interactables.length; j += 1) {
          out.push(s.interactables[j]);
        }
      }
    }
    return out;
  }
  interactables = collectInteractables();

  function leader() {
    return chars[controlledId];
  }

  function partner() {
    return controlledId === "xian" ? ran : xian;
  }

  let toastTimer = null;
  function toast(msg, ms = 2400) {
    if (!ui.toast || !msg) return;
    ui.toast.textContent = msg;
    ui.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (ui.toast) ui.toast.hidden = true;
    }, ms);
  }

  const tmpPos = new Vector3();
  const tmpDir = new Vector3();
  const tmpUp = new Vector3();

  function applySeat(c, seat, type, attach) {
    let px = seat.x;
    let py = seat.y;
    let pz = seat.z;
    let yaw = seat.yaw || 0;
    let up = UP_VEC;

    if (attach) {
      attach.computeWorldMatrix(true);
      const wm = attach.getWorldMatrix();
      Vector3.TransformCoordinatesFromFloatsToRef(seat.x, seat.y, seat.z, wm, tmpPos);
      px = tmpPos.x;
      py = tmpPos.y;
      pz = tmpPos.z;

      const lx = -Math.sin(yaw);
      const lz = -Math.cos(yaw);
      Vector3.TransformNormalFromFloatsToRef(lx, 0, lz, wm, tmpDir);
      if (tmpDir.lengthSquared() > 1e-6) tmpDir.normalize();
      yaw = Math.atan2(-tmpDir.x, -tmpDir.z);

      Vector3.TransformNormalFromFloatsToRef(0, 1, 0, wm, tmpUp);
      if (tmpUp.lengthSquared() > 1e-6) {
        tmpUp.normalize();
        up = tmpUp.clone();
      }
    }

    c.speed = 0;
    c.clearAction();

    if (type === "lie") {
      c.state = "lie";
      c.yaw = yaw;
      const recline = seat.recline || 0;
      const fwdXZ = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
      const yAxis = fwdXZ.scale(Math.cos(recline)).add(UP_VEC.scale(Math.sin(recline))).normalize();
      const faceDir = UP_VEC.scale(Math.cos(recline)).subtract(fwdXZ.scale(Math.sin(recline))).normalize();
      const rootZ = faceDir.scale(-1);
      const rootX = Vector3.Cross(yAxis, rootZ).normalize();
      const orthY = Vector3.Cross(rootZ, rootX).normalize();
      const q = basisQuaternion(rootX, orthY, rootZ);
      const hipPos = new Vector3(px, py, pz)
        .subtract(orthY.scale(c.hipY))
        .add(faceDir.scale(0.08));
      c.place(hipPos.x, hipPos.y, hipPos.z, yaw, q);
    } else {
      c.state = "sit";
      c.yaw = yaw;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      let quat = null;
      if (attach && up !== UP_VEC) {
        const fwd = tmpDir.clone().normalize();
        const rootZ = fwd.scale(-1);
        const rootX = Vector3.Cross(up, rootZ).normalize();
        const orthY = Vector3.Cross(rootZ, rootX).normalize();
        quat = basisQuaternion(rootX, orthY, rootZ);
      }
      const seatOffset = up.scale(c.hipY - 0.06);
      c.place(px - fx * 0.02 - seatOffset.x, py - seatOffset.y, pz - fz * 0.02 - seatOffset.z, yaw, quat);
    }
  }

  function standUp(silent = false) {
    if (!seatSession) return false;
    const itemPos = seatSession.item?.position;
    for (const c of [xian, ran]) {
      const refY = seatSession.floorY ?? (itemPos ? itemPos.y : c.pos.y);
      let safeX = c.pos.x;
      let safeZ = c.pos.z;
      if (!isPositionWalkable(safeX, safeZ, 0.25, refY) && itemPos) {
        safeX = itemPos.x;
        safeZ = itemPos.z;
      }
      const gy = getWalkSurfaceY(safeX, safeZ, refY);
      c.state = "idle";
      c.place(safeX, gy, safeZ, c.yaw, null);
    }
    seatSession = null;
    if (!silent) toast("站起身来啦～");
    return true;
  }

  function midpoint() {
    return xian.pos.add(ran.pos).scale(0.5);
  }

  function faceEachOther() {
    const dx = ran.pos.x - xian.pos.x;
    const dz = ran.pos.z - xian.pos.z;
    if (Math.hypot(dx, dz) < 0.05) return;
    xian.yaw = Math.atan2(-dx, -dz);
    ran.yaw = Math.atan2(dx, dz);
  }

  function moveChar(c, dx, dz, dt, speed) {
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) {
      c.speed = lerp(c.speed, 0, clamp(dt * 10, 0, 1));
      return false;
    }
    const step = Math.min(len, speed * dt);
    const nx = c.pos.x + (dx / len) * step;
    const nz = c.pos.z + (dz / len) * step;
    const resolved = resolveWalkPosition(c.pos.x, c.pos.z, nx, nz, 0.34, c.pos.y);
    const moved = Math.hypot(resolved.x - c.pos.x, resolved.z - c.pos.z);

    if (moved > 0.0008) {
      const targetSurf = getWalkSurfaceY(resolved.x, resolved.z, c.pos.y);
      if (Math.abs(targetSurf - c.pos.y) < 1.25) {
        c.pos.x = resolved.x;
        c.pos.z = resolved.z;
        c.pos.y = lerp(c.pos.y, targetSurf, clamp(dt * 14.0, 0.25, 1.0));
      }
      const wantYaw = Math.atan2(-(resolved.x - c.pos.x || dx), -(resolved.z - c.pos.z || dz));
      if (Math.abs(dx) + Math.abs(dz) > 0.001) {
        const moveYaw = Math.atan2(-dx, -dz);
        c.yaw += angDiff(c.yaw, moveYaw) * clamp(dt * 12.0, 0, 1);
      } else {
        c.yaw += angDiff(c.yaw, wantYaw) * clamp(dt * 12.0, 0, 1);
      }
      c.speed = lerp(c.speed, moved / Math.max(dt, 0.001), clamp(dt * 10, 0, 1));
      c.state = c.speed > 2.35 ? "run" : "walk";
      return true;
    }

    c.speed = lerp(c.speed, 0, clamp(dt * 10, 0, 1));
    c.state = "idle";
    return false;
  }

  function setCarry(on) {
    carrying = Boolean(on);
    if (carrying) {
      standUp(true);
      holdingHands = false;
      walkWaypoints = [];
      xian.clearAction();
      ran.startAction("carry", 9999);
      xian.state = "carried";
      fx.heart(ran.pos.add(new Vector3(0, 1.4, 0)), { count: 24, scale: 0.036 });
      toast("小冉子把小贤贤公主抱起来啦 💞");
    } else {
      ran.clearAction("carry");
      xian.state = "idle";
      xian.rootQuat = null;
      const fxFwd = -Math.sin(ran.yaw);
      const fzFwd = -Math.cos(ran.yaw);
      const dropX = ran.pos.x + Math.cos(ran.yaw) * 0.55 + fxFwd * 0.1;
      const dropZ = ran.pos.z - Math.sin(ran.yaw) * 0.55 + fzFwd * 0.1;
      const safeX = isPositionWalkable(dropX, dropZ, 0.28, ran.pos.y) ? dropX : ran.pos.x;
      const safeZ = isPositionWalkable(dropX, dropZ, 0.28, ran.pos.y) ? dropZ : ran.pos.z;
      xian.place(safeX, getWalkSurfaceY(safeX, safeZ, ran.pos.y), safeZ, ran.yaw, null);
      toast("轻轻放下啦 ✨");
    }
    syncUI();
  }

  function bringPartnerClose(dist = 0.62) {
    const L = leader();
    const P = partner();
    if (Math.hypot(P.pos.x - L.pos.x, P.pos.z - L.pos.z) > 1.8) {
      const rx = Math.cos(L.yaw);
      const rz = -Math.sin(L.yaw);
      let tx = L.pos.x + rx * dist;
      let tz = L.pos.z + rz * dist;
      if (!isPositionWalkable(tx, tz, 0.25, L.pos.y)) {
        tx = L.pos.x - rx * dist;
        tz = L.pos.z - rz * dist;
      }
      if (!isPositionWalkable(tx, tz, 0.25, L.pos.y)) {
        tx = L.pos.x;
        tz = L.pos.z;
      }
      P.place(tx, getWalkSurfaceY(tx, tz, L.pos.y), tz, P.yaw, null);
    }
  }

  function doAction(name) {
    if (!active) enter();
    if (name === "holdhand") {
      if (carrying) setCarry(false);
      standUp(true);
      holdingHands = !holdingHands;
      if (holdingHands) {
        bringPartnerClose(0.58);
        const side = controlledId === "ran" ? 1 : -1;
        leader().startAction("holdhand", 0.6, { side });
        partner().startAction("holdhand", 0.6, { side: -side });
        fx.heart(midpoint().add(new Vector3(0, 1.35, 0)), { count: 22, scale: 0.032 });
        toast("十指相扣，一起散步吧 🤝");
      } else {
        xian.clearAction("holdhand");
        ran.clearAction("holdhand");
        toast("松开手啦");
      }
      syncUI();
      return;
    }

    if (name === "carry") {
      setCarry(!carrying);
      return;
    }

    if (carrying) setCarry(false);
    standUp(true);
    holdingHands = false;
    bringPartnerClose(0.68);
    faceEachOther();

    if (name === "hug") {
      const m = midpoint();
      const d = 0.42;
      const dx = Math.sin(xian.yaw) * d * 0.5;
      const dz = Math.cos(xian.yaw) * d * 0.5;
      xian.pos.x = m.x + dx;
      xian.pos.z = m.z + dz;
      ran.pos.x = m.x - dx;
      ran.pos.z = m.z - dz;
      xian.startAction("hug", 2.4);
      ran.startAction("hug", 2.4);
      fx.heart(m.add(new Vector3(0, 1.5, 0)), { count: 32, scale: 0.04 });
      toast("紧紧抱在一起 🤗");
    } else if (name === "kiss") {
      const m = midpoint();
      const d = 0.36;
      const dx = Math.sin(xian.yaw) * d * 0.5;
      const dz = Math.cos(xian.yaw) * d * 0.5;
      xian.pos.x = m.x + dx;
      xian.pos.z = m.z + dz;
      ran.pos.x = m.x - dx;
      ran.pos.z = m.z - dz;
      xian.startAction("kiss", 2.1);
      ran.startAction("kiss", 2.1);
      fx.heart(m.add(new Vector3(0, 1.52, 0)), { count: 44, scale: 0.045, colors: [0xff7da8, 0xffd1e0] });
      audio?.playPetalGlissando?.();
      toast("mua~ 💋");
    } else if (name === "pat") {
      ran.startAction("pat", 2.2, { role: "give" });
      xian.startAction("pat", 2.2, { role: "recv" });
      fx.heart(xian.pos.add(new Vector3(0, 1.5, 0)), { count: 26, scale: 0.036 });
      toast("小冉子温柔地摸摸小贤贤的头 🥰");
    } else if (name === "dance") {
      danceT = 3.6;
      xian.startAction("dance", 3.6);
      ran.startAction("dance", 3.6);
      fx.heart(midpoint().add(new Vector3(0, 1.65, 0)), { count: 36, scale: 0.04 });
      audio?.playDuetArpeggio?.();
      toast("在花海边跳支双人华尔兹 💃");
    } else if (name === "heart") {
      const m = midpoint();
      xian.startAction("heart", 2.3);
      ran.startAction("heart", 2.3);
      fx.heart(m.add(new Vector3(0, 1.78, 0)), { count: 52, scale: 0.048, colors: [0xff6b98, 0xffd07d] });
      toast("一起比一颗大大的心 ❤️");
    } else if (name === "hop") {
      leader().startAction("hop", 0.72);
    } else if (name === "wave") {
      leader().startAction("wave", 1.8);
    }
    syncUI();
  }

  function activateItem(item) {
    if (!item) return false;
    standUp(true);
    walkWaypoints = [];
    const res = item.activate?.({
      actor: controlledId,
      audio,
      playerPos: leader().pos.clone(),
    });

    if (item.pose?.seats?.length) {
      if (carrying) setCarry(false);
      holdingHands = false;
      const attach = item.pose.attachTo || item.pose.attach || null;
      const seats = item.pose.seats;
      seatSession = {
        item,
        type: item.pose.type || "sit",
        attach,
        seats: [seats[0], seats[1] || null],
        floorY: item.floorY ?? leader().pos.y,
      };
      applySeat(leader(), seatSession.seats[0], seatSession.type, attach);
      if (seatSession.seats[1]) {
        applySeat(partner(), seatSession.seats[1], seatSession.type, attach);
      }
      toast(typeof res === "string" ? `${res}（按 WASD 或 E 起身）` : `${item.label}（按 WASD 或 E 起身）`, 3200);
    } else if (typeof res === "string") {
      toast(res, 2600);
    }
    syncUI();
    return true;
  }

  // Nearest interactable prompt
  let nearest = null;
  function updateNearestPrompt() {
    if (!active) {
      nearest = null;
      if (ui.prompt) ui.prompt.hidden = true;
      return;
    }
    if (seatSession) {
      nearest = seatSession.item;
      if (ui.prompt) {
        ui.prompt.textContent = "按 E / WASD 起身离开";
        ui.prompt.hidden = false;
      }
      return;
    }
    const lp = leader().pos;
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < interactables.length; i += 1) {
      const it = interactables[i];
      if (!it?.position) continue;
      if (it.floorY !== undefined && Math.abs(lp.y - it.floorY) > 1.85) continue;
      const rad = it.radius ?? 2.2;
      const d = Math.hypot(lp.x - it.position.x, lp.z - it.position.z);
      if (d <= rad && d < bestDist) {
        bestDist = d;
        best = it;
      }
    }
    nearest = best;
    if (ui.prompt) {
      if (best) {
        ui.prompt.textContent = `按 E ${best.label}`;
        ui.prompt.hidden = false;
      } else {
        ui.prompt.hidden = true;
      }
    }
  }

  function updateLeader(dt) {
    const L = leader();
    if (L.action && (L.action.name === "hug" || L.action.name === "kiss" || L.action.name === "pat" || L.action.name === "heart")) {
      L.speed = 0;
      return;
    }
    if (danceT > 0) return;

    let fwd = 0;
    let right = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) fwd += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) fwd -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) right += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) right -= 1;

    if (fwd !== 0 || right !== 0) {
      if (seatSession) standUp(true);
      walkWaypoints = [];
      const refYaw = view === "first" ? L.yaw : camYaw;
      const fx = -Math.sin(refYaw);
      const fz = -Math.cos(refYaw);
      const rx = Math.cos(refYaw);
      const rz = -Math.sin(refYaw);
      const dx = fx * fwd + rx * right;
      const dz = fz * fwd + rz * right;
      const run = keys.has("ShiftLeft") || keys.has("ShiftRight");
      const speed = run ? SPEED_RUN : SPEED_WALK;
      const moved = moveChar(L, dx, dz, dt, speed);
      if (moved) {
        if (!trail.length || Math.hypot(L.pos.x - trail[trail.length - 1].x, L.pos.z - trail[trail.length - 1].z) > 0.28) {
          trail.push({ x: L.pos.x, z: L.pos.z });
          if (trail.length > 48) trail.shift();
        }
      }
      return;
    }

    if (walkWaypoints.length > 0) {
      if (seatSession) standUp(true);
      const [wx, wz] = walkWaypoints[0];
      const dx = wx - L.pos.x;
      const dz = wz - L.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.28) {
        walkWaypoints.shift();
        if (walkWaypoints.length === 0 && nearest && Math.hypot(nearest.position.x - L.pos.x, nearest.position.z - L.pos.z) <= (nearest.radius ?? 2.2) + 0.5) {
          activateItem(nearest);
        }
      } else {
        const moved = moveChar(L, dx, dz, dt, SPEED_WALK * 1.15);
        if (moved) {
          if (!trail.length || Math.hypot(L.pos.x - trail[trail.length - 1].x, L.pos.z - trail[trail.length - 1].z) > 0.28) {
            trail.push({ x: L.pos.x, z: L.pos.z });
            if (trail.length > 48) trail.shift();
          }
        } else {
          walkWaypoints = [];
        }
      }
      return;
    }

    L.speed = lerp(L.speed, 0, clamp(dt * 10, 0, 1));
    if (L.state === "walk" || L.state === "run") L.state = "idle";
  }

  function updatePartner(dt) {
    const L = leader();
    const P = partner();

    if (carrying) {
      if (ran.action?.name !== "carry") ran.startAction("carry", 9999);
      const fwd = new Vector3(-Math.sin(ran.yaw), 0, -Math.cos(ran.yaw));
      const rgt = new Vector3(Math.cos(ran.yaw), 0, -Math.sin(ran.yaw));
      const yAxis = rgt.scale(-0.94).add(UP_VEC.scale(0.34)).normalize(); // head toward ran's Left, tilted slightly up
      const faceDir = UP_VEC.scale(0.84).subtract(fwd.scale(0.54)).normalize();
      const rootZ = faceDir.scale(-1);
      const rootX = Vector3.Cross(yAxis, rootZ).normalize();
      const orthY = Vector3.Cross(rootZ, rootX).normalize();
      const q = basisQuaternion(rootX, orthY, rootZ);
      const cradleCenter = ran.pos.add(fwd.scale(0.28)).add(UP_VEC.scale(ran.hipY + 0.08));
      const xPos = cradleCenter.subtract(orthY.scale(xian.hipY - 0.04));
      xian.state = "carried";
      xian.speed = 0;
      xian.place(xPos.x, xPos.y, xPos.z, ran.yaw, q);
      return;
    }

    if (seatSession) {
      if (seatSession.attach) {
        applySeat(L, seatSession.seats[0], seatSession.type, seatSession.attach);
        if (seatSession.seats[1]) applySeat(P, seatSession.seats[1], seatSession.type, seatSession.attach);
      }
      return;
    }

    if (P.action && (P.action.name === "hug" || P.action.name === "kiss" || P.action.name === "pat" || P.action.name === "heart")) {
      P.speed = 0;
      return;
    }

    if (danceT > 0) {
      const ctr = midpoint();
      const ang = dt * 1.8;
      for (const c of [xian, ran]) {
        const ox = c.pos.x - ctr.x;
        const oz = c.pos.z - ctr.z;
        const nx = ctr.x + ox * Math.cos(ang) - oz * Math.sin(ang);
        const nz = ctr.z + ox * Math.sin(ang) + oz * Math.cos(ang);
        c.pos.x = nx;
        c.pos.z = nz;
        c.yaw = Math.atan2(-(ctr.x - nx), -(ctr.z - nz));
      }
      return;
    }

    const distToLeader = Math.hypot(P.pos.x - L.pos.x, P.pos.z - L.pos.z);
    if (distToLeader > 14 || Math.abs(P.pos.y - L.pos.y) > 3.2) {
      const nx = L.pos.x + Math.cos(L.yaw) * 0.6;
      const nz = L.pos.z - Math.sin(L.yaw) * 0.6;
      const safeX = isPositionWalkable(nx, nz, 0.24, L.pos.y) ? nx : L.pos.x;
      const safeZ = isPositionWalkable(nx, nz, 0.24, L.pos.y) ? nz : L.pos.z;
      P.place(safeX, getWalkSurfaceY(safeX, safeZ, L.pos.y), safeZ, L.yaw, null);
      trail.length = 0;
      return;
    }

    let target = null;
    if (holdingHands) {
      const side = controlledId === "ran" ? 1 : -1;
      const rx = Math.cos(L.yaw);
      const rz = -Math.sin(L.yaw);
      const tx = L.pos.x + rx * 0.54 * side;
      const tz = L.pos.z + rz * 0.54 * side;
      if (isPositionWalkable(tx, tz, 0.18, L.pos.y) && Math.abs(getWalkSurfaceY(tx, tz, L.pos.y) - L.pos.y) < 0.5) {
        target = { x: tx, z: tz };
      }
      const handSide = -side;
      if (L.speed > 0.15 || distToLeader < 0.85) {
        if (!L.action || L.action.name === "holdhand") L.startAction("holdhand", 0.35, { side });
        if (!P.action || P.action.name === "holdhand") P.startAction("holdhand", 0.35, { side: handSide });
      }
    }

    if (!target) {
      while (trail.length > 1 && Math.hypot(trail[0].x - P.pos.x, trail[0].z - P.pos.z) < 0.35) trail.shift();
      if (distToLeader > 1.1 && trail.length) target = trail[0];
    }

    if (target) {
      const dx = target.x - P.pos.x;
      const dz = target.z - P.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.06) {
        const sp = clamp(d * 3.2, 0, Math.max(1.75, L.speed * 1.25 + 0.4));
        moveChar(P, dx, dz, dt, sp);
        if (holdingHands && L.speed > 0.2) P.yaw += angDiff(P.yaw, L.yaw) * clamp(dt * 6, 0, 1);
      } else {
        P.speed = lerp(P.speed, 0, clamp(dt * 8, 0, 1));
        if (P.state === "walk" || P.state === "run") P.state = "idle";
        P.yaw += angDiff(P.yaw, L.yaw) * clamp(dt * 4, 0, 1);
      }
    } else {
      P.speed = lerp(P.speed, 0, clamp(dt * 8, 0, 1));
      if (P.state === "walk" || P.state === "run") P.state = "idle";
      const want = Math.atan2(-(L.pos.x - P.pos.x), -(L.pos.z - P.pos.z));
      P.yaw += angDiff(P.yaw, want) * clamp(dt * 2, 0, 1);
    }
  }

  function updateIdle(dt) {
    idleGoal.timer -= dt;
    if (idleGoal.timer <= 0) {
      idleGoal.timer = 4.5 + Math.random() * 4.5;
      const rx = -14.0 + (Math.random() - 0.5) * 4.2;
      const rz = 15.2 + (Math.random() - 0.5) * 3.6;
      if (isPositionWalkable(rx, rz, 0.3, idleGoal.baseY)) {
        idleGoal.x = rx;
        idleGoal.z = rz;
      }
    }
    const dx = idleGoal.x - xian.pos.x;
    const dz = idleGoal.z - xian.pos.z;
    if (Math.hypot(dx, dz) > 0.25) {
      moveChar(xian, dx, dz, dt, SPEED_WALK * 0.55);
    } else {
      xian.speed = lerp(xian.speed, 0, clamp(dt * 6, 0, 1));
      xian.state = "idle";
    }

    const followX = xian.pos.x + Math.cos(xian.yaw) * 0.68 - Math.sin(xian.yaw) * -0.45;
    const followZ = xian.pos.z - Math.sin(xian.yaw) * 0.68 - Math.cos(xian.yaw) * -0.45;
    const pdx = followX - ran.pos.x;
    const pdz = followZ - ran.pos.z;
    if (Math.hypot(pdx, pdz) > 0.25) {
      moveChar(ran, pdx, pdz, dt, SPEED_WALK * 0.58);
    } else {
      ran.speed = lerp(ran.speed, 0, clamp(dt * 6, 0, 1));
      ran.state = "idle";
      const gaze = Math.atan2(-(xian.pos.x - ran.pos.x), -(xian.pos.z - ran.pos.z));
      ran.yaw += angDiff(ran.yaw, gaze) * clamp(dt * 2.5, 0, 1);
    }
  }

  function updateCamera(dt) {
    if (!active) return;
    const L = leader();
    const P = partner();
    const tPos = new Vector3();
    const tLook = new Vector3();

    if (view === "first") {
      L.setVisibleHead(false);
      P.setVisibleHead(true);
      L.tag.visible = false;
      P.tag.visible = true;

      const eye = L.getEyeWorld();
      const useYaw = seatSession ? L.yaw + camYaw * 0.2 : camYaw;
      if (!seatSession) L.yaw = camYaw;
      const cp = Math.cos(camPitch);
      const dir = new Vector3(-Math.sin(useYaw) * cp, Math.sin(camPitch), -Math.cos(useYaw) * cp);
      tPos.copyFrom(eye);
      tLook.copyFrom(eye).addInPlace(dir.scale(4.0));
    } else if (view === "second") {
      L.setVisibleHead(true);
      P.setVisibleHead(false);
      L.tag.visible = true;
      P.tag.visible = false;

      const pEye = P.getEyeWorld();
      const lHead = L.getHeadWorld();
      const d = Math.hypot(lHead.x - pEye.x, lHead.z - pEye.z);
      if (d < 0.55) {
        const out = pEye.subtract(lHead);
        out.y = 0;
        if (out.lengthSquared() < 1e-4) out.set(Math.cos(L.yaw), 0, -Math.sin(L.yaw));
        else out.normalize();
        tPos.set(lHead.x + out.x * 1.15, pEye.y + 0.08, lHead.z + out.z * 1.15);
      } else {
        tPos.copyFrom(pEye);
      }
      tLook.copyFrom(lHead);
    } else {
      L.setVisibleHead(true);
      P.setVisibleHead(true);
      L.tag.visible = true;
      P.tag.visible = true;

      const focus = L.getHeadWorld();
      focus.y -= 0.14;
      const horiz = Math.cos(camPitch) * camDist;
      const vert = -Math.sin(camPitch) * camDist + 0.55;
      tPos.set(
        focus.x + Math.sin(camYaw) * horiz,
        focus.y + vert,
        focus.z + Math.cos(camYaw) * horiz
      );
      if (!isInsideVilla1FShell(tPos.x, tPos.z) && tPos.y < 5.5) {
        const gy = getWorldTerrainY(tPos.x, tPos.z);
        tPos.y = Math.max(tPos.y, gy + 0.45);
      }
      tLook.copyFrom(focus);
    }

    if (!camInit) {
      camPos.copyFrom(tPos);
      camLook.copyFrom(tLook);
      camInit = true;
    } else {
      const a = view === "first" ? clamp(dt * 24, 0, 1) : clamp(dt * 10, 0, 1);
      Vector3.LerpToRef(camPos, tPos, a, camPos);
      Vector3.LerpToRef(camLook, tLook, a, camLook);
    }

    camera.position.copyFrom(camPos);
    camera.setTarget(camLook);
  }

  // Pointer drag + wheel + keyboard handlers while couple mode is active
  let dragging = false;
  let lastPtr = { x: 0, y: 0 };

  canvas?.addEventListener("pointerdown", (e) => {
    if (!active) return;
    dragging = true;
    lastPtr = { x: e.clientX, y: e.clientY };
  });

  canvas?.addEventListener("pointermove", (e) => {
    if (!active || !dragging || (e.buttons & 1) === 0) return;
    const dx = e.clientX - lastPtr.x;
    const dy = e.clientY - lastPtr.y;
    lastPtr = { x: e.clientX, y: e.clientY };
    camYaw -= dx * 0.0052;
    camPitch = clamp(camPitch - dy * 0.0044, view === "first" ? -0.62 : -0.82, view === "first" ? 0.55 : 0.48);
  });

  window.addEventListener("pointerup", () => {
    dragging = false;
  });

  canvas?.addEventListener(
    "wheel",
    (e) => {
      if (!active || view !== "third") return;
      camDist = clamp(camDist * Math.exp(clamp(e.deltaY, -140, 140) * 0.0012), 1.6, 8.8);
    },
    { passive: true }
  );

  window.addEventListener("keydown", (e) => {
    if (!active) return;
    keys.add(e.code);
    if (e.repeat) return;

    if (e.code === "Tab") {
      e.preventDefault();
      setControlled(controlledId === "xian" ? "ran" : "xian");
    } else if (e.code === "KeyV") {
      const order = ["third", "first", "second"];
      setView(order[(order.indexOf(view) + 1) % order.length]);
    } else if (e.code === "KeyE") {
      if (seatSession) standUp();
      else if (nearest) activateItem(nearest);
    } else if (e.code === "KeyF") {
      doAction("holdhand");
    } else if (e.code === "Digit1") doAction("hug");
    else if (e.code === "Digit2") doAction("kiss");
    else if (e.code === "Digit3") doAction("pat");
    else if (e.code === "Digit4") doAction("dance");
    else if (e.code === "Digit5") doAction("heart");
    else if (e.code === "Digit6") doAction("carry");
    else if (e.code === "Space") {
      e.preventDefault();
      if (seatSession) standUp(true);
      else leader().startAction("hop", 0.72);
    }
  });

  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
  });

  function syncUI() {
    if (ui.panel) ui.panel.hidden = !active;
    ui.panel?.querySelectorAll("[data-couple-char]").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.coupleChar === controlledId)
    );
    ui.panel?.querySelectorAll("[data-couple-view]").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.coupleView === view)
    );
    ui.panel?.querySelectorAll("[data-couple-action='holdhand']").forEach((b) =>
      b.classList.toggle("is-active", holdingHands)
    );
    ui.panel?.querySelectorAll("[data-couple-action='carry']").forEach((b) =>
      b.classList.toggle("is-active", carrying)
    );
    if (ui.enterBtn) ui.enterBtn.classList.toggle("is-active", active);
  }

  function setControlled(id) {
    if (!chars[id]) return;
    partner().lookTarget = null;
    controlledId = id;
    trail.length = 0;
    camYaw = leader().yaw;
    camInit = false;
    toast(`现在操控：${leader().name}`);
    syncUI();
  }

  function setView(v) {
    if (!VIEW_LABELS[v]) return;
    view = v;
    camInit = false;
    partner().lookTarget = null;
    if (v === "first") camPitch = clamp(camPitch, -0.6, 0.5);
    toast(`视角：${VIEW_LABELS[v]}${v === "second" ? "（从TA的眼里看你）" : ""}`, 1600);
    syncUI();
  }

  function enter(id) {
    interactables = collectInteractables();
    if (id && chars[id]) controlledId = id;
    active = true;
    camYaw = leader().yaw;
    camPitch = -0.15;
    camInit = false;
    trail.length = 0;
    updateCamera(0);
    syncUI();
    onActiveChange?.(true);
    toast(`${leader().name} 出发啦～ WASD 走 · 拖拽转视角 · E 互动 · V 切视角 · Tab 换人`, 4200);
  }

  function exit() {
    active = false;
    walkWaypoints = [];
    keys.clear();
    xian.setVisibleHead(true);
    ran.setVisibleHead(true);
    xian.tag.visible = true;
    ran.tag.visible = true;
    if (ui.prompt) ui.prompt.hidden = true;
    syncUI();
    onActiveChange?.(false);
  }

  ui.panel?.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    e.stopPropagation();
    audio?.unlock?.();
    if (b.dataset.coupleChar) setControlled(b.dataset.coupleChar);
    else if (b.dataset.coupleView) setView(b.dataset.coupleView);
    else if (b.dataset.coupleAction) doAction(b.dataset.coupleAction);
    else if (b.dataset.coupleInteract !== undefined) {
      if (seatSession) standUp();
      else if (nearest) activateItem(nearest);
    } else if (b.dataset.coupleExit !== undefined) {
      exit();
    }
  });

  function handleClick(picked) {
    if (!active) return false;
    const pid = picked?.interactive?.id;
    if (pid === "char-xian" || pid === "char-ran") {
      const targetId = pid === "char-xian" ? "xian" : "ran";
      if (targetId !== controlledId) setControlled(targetId);
      else doAction("heart");
      return true;
    }

    if (picked?.hitPoint) {
      const p = picked.hitPoint;
      const L = leader();
      if (isPositionWalkable(p.x, p.z, 0.25, L.pos.y)) {
        if (seatSession) standUp(true);
        walkWaypoints = buildWalkWaypoints(L.pos.x, L.pos.z, p.x, p.z, L.pos.y, p.y);
        return true;
      }
      lookAtPoint(p);
      return true;
    }
    return false;
  }

  function lookAtPoint(pt) {
    if (!pt) return;
    const L = leader();
    const dx = pt.x - L.pos.x;
    const dz = pt.z - L.pos.z;
    camYaw = Math.atan2(-dx, -dz);
    L.yaw = camYaw;
    const eyeY = L.pos.y + 1.05;
    camPitch = clamp(Math.atan2(pt.y - eyeY, Math.hypot(dx, dz)), -0.65, 0.55);
  }

  function activateNearest() {
    if (seatSession) {
      standUp();
      return true;
    }
    interactables = collectInteractables();
    updateNearestPrompt();
    if (nearest) return activateItem(nearest);
    return false;
  }

  function activateById(id) {
    interactables = collectInteractables();
    const item = interactables.find((it) => it.id === id);
    if (!item) return false;
    return activateItem(item);
  }

  function teleport(x, z, yawVal = 0, floorY = null) {
    standUp(true);
    carrying = false;
    holdingHands = false;
    walkWaypoints = [];
    const gy = getWalkSurfaceY(x, z, floorY);
    leader().place(x, gy, z, yawVal, null);
    const rx = Math.cos(yawVal);
    const rz = -Math.sin(yawVal);
    const px = x + rx * 0.68;
    const pz = z + rz * 0.68;
    const safePX = isPositionWalkable(px, pz, 0.24, gy) ? px : x;
    const safePZ = isPositionWalkable(px, pz, 0.24, gy) ? pz : z;
    partner().place(safePX, getWalkSurfaceY(safePX, safePZ, gy), safePZ, yawVal, null);
    camYaw = yawVal;
    camInit = false;
    trail.length = 0;
    if (active) updateCamera(0);
  }

  let elapsedSec = 0;
  function update(dt) {
    const safeDt = clamp(dt || 0.016, 0.001, 0.05);
    elapsedSec += safeDt;
    if (danceT > 0) danceT = Math.max(0, danceT - safeDt);

    if (active) {
      if (carrying && controlledId === "xian") {
        const saved = controlledId;
        controlledId = "ran";
        updateLeader(safeDt);
        controlledId = saved;
      } else {
        updateLeader(safeDt);
      }
      updatePartner(safeDt);
      updateNearestPrompt();
    } else {
      updateIdle(safeDt);
    }

    xian.update(safeDt);
    ran.update(safeDt);
    fx.update(safeDt, elapsedSec);
    updateCamera(safeDt);
  }

  syncUI();

  return {
    group,
    xian,
    ran,
    fx,
    update,
    enter,
    exit,
    isActive: () => active,
    handleClick,
    setControlled,
    setView,
    doAction,
    lookAtPoint,
    activateNearest,
    activateById,
    standUp,
    refreshInteractables() {
      interactables = collectInteractables();
      return interactables;
    },
    getInteractables: () => interactables,
    teleport,
    setCamAngles(y, p) {
      camYaw = y;
      camPitch = clamp(p, -0.82, 0.55);
      camInit = false;
      if (active) updateCamera(0);
    },
    getState() {
      return {
        active,
        controlledId,
        view,
        holdingHands,
        carrying,
        seated: seatSession ? seatSession.item?.id : null,
        xianPos: [Number(xian.pos.x.toFixed(2)), Number(xian.pos.y.toFixed(2)), Number(xian.pos.z.toFixed(2))],
        ranPos: [Number(ran.pos.x.toFixed(2)), Number(ran.pos.y.toFixed(2)), Number(ran.pos.z.toFixed(2))],
        nearestId: nearest ? nearest.id : null,
        interactableCount: interactables.length,
      };
    },
  };
}
