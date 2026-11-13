// Couple Roaming Mode — control 小贤贤 / 小冉子 in first, second ("through TA's eyes") or
// third person; partner follows / holds hands; affectionate couple actions; press E to
// interact with any registered `interactables` (villa, estate, gardens, flora).

import {
  THREE,
  clamp,
  lerp,
  getWalkSurfaceY,
  isPositionWalkable,
  resolveWalkPosition,
} from "./pbr-kit.js";
import { createCouple, createHeartBurst } from "./couple-characters.js";

const VIEW_LABELS = { first: "第一人称", second: "第二人称", third: "第三人称" };
const TAU = Math.PI * 2;

function angDiff(a, b) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

export function createCoupleMode({ scene, camera, canvas, audio, sources = [], ui = {}, onActiveChange }) {
  const { group, xian, ran } = createCouple();
  scene.add(group);
  const hearts = createHeartBurst(scene, 64);
  const chars = { xian, ran };

  // Spawn in the courtyard in front of the villa portico, holding hands
  const spawn = () => {
    xian.place(-14.45, getWalkSurfaceY(-14.45, 13.4), 13.4, 0);
    ran.place(-13.75, getWalkSurfaceY(-13.75, 13.4), 13.4, 0);
    for (const c of [xian, ran]) {
      c.state = "stand";
      c.rootQuat = null;
      c.speed = 0;
      c.action = null;
      c.exprOverride = null;
    }
  };
  spawn();

  let active = false;
  let controlledId = "ran";
  let view = "third";
  let camYaw = 0;
  let camPitch = -0.12;
  let thirdDist = 3.0;
  let holdingHands = true;
  let carrying = false;
  let seatSession = null; // { item, attach, seats }
  let walkTarget = null; // { x, z, then }
  const trail = [];
  const keys = new Set();
  let toastTimer = null;
  let nearest = null;
  let idleActionTimer = 6;
  let pendingInteract = null;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const smoothCam = new THREE.Vector3();
  let camInit = false;

  const leader = () => chars[controlledId];
  const partner = () => (controlledId === "xian" ? ran : xian);

  function toast(text, ms = 2600) {
    if (!ui.toast || !text) return;
    ui.toast.textContent = text;
    ui.toast.hidden = false;
    ui.toast.classList.add("is-show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      ui.toast.classList.remove("is-show");
      setTimeout(() => (ui.toast.hidden = true), 300);
    }, ms);
  }

  function collectInteractables() {
    const out = [];
    for (const s of sources) {
      const list = s && s.interactables;
      if (Array.isArray(list)) for (const it of list) if (it && it.position) out.push(it);
    }
    return out;
  }
  let interactables = collectInteractables();

  function midpoint(out = new THREE.Vector3()) {
    return out.copy(xian.pos).add(ran.pos).multiplyScalar(0.5);
  }

  function burstBetween(n = 14) {
    const m = midpoint();
    m.y += Math.max(xian.hipY, ran.hipY) + 0.75;
    hearts.burst(m, n, 0.35);
  }

  // ------------------------------------------------------------------------
  // Seats / poses
  // ------------------------------------------------------------------------
  const _v = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _m = new THREE.Matrix4();

  function seatWorld(seat, attach) {
    _v.set(seat.x, seat.y, seat.z);
    let yaw = seat.yaw || 0;
    if (attach) {
      attach.updateWorldMatrix(true, false);
      _v.applyMatrix4(attach.matrixWorld);
      attach.getWorldQuaternion(_q);
      const e = new THREE.Euler().setFromQuaternion(_q, "YXZ");
      yaw += e.y;
    }
    return { p: _v.clone(), yaw };
  }

  function applySeat(c, seat, type, attach) {
    const { p, yaw } = seatWorld(seat, attach);
    if (type === "sit") {
      c.state = "sit";
      c.rootQuat = null;
      c.yaw = yaw;
      // seat surface → pelvis sits ~6cm above it
      c.pos.set(p.x, p.y - (c.hipY - 0.07), p.z);
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      c.pos.x -= fx * 0.02;
      c.pos.z -= fz * 0.02;
    } else if (type === "lie") {
      c.state = "lie";
      // head points along yaw direction, face up
      const yAxis = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const faceDir = new THREE.Vector3(0, 1, 0);
      const rootZ = faceDir.clone().negate();
      const rootX = new THREE.Vector3().crossVectors(yAxis, rootZ).normalize();
      _m.makeBasis(rootX, yAxis, rootZ);
      c.rootQuat = new THREE.Quaternion().setFromRotationMatrix(_m);
      c.pos.copy(p).addScaledVector(yAxis, -c.hipY).add(new THREE.Vector3(0, 0.1, 0));
    } else {
      c.state = "stand";
      c.rootQuat = null;
      c.yaw = yaw;
      c.pos.copy(p);
    }
  }

  function standUp() {
    if (!seatSession) return;
    const { seats } = seatSession;
    for (const c of [xian, ran]) {
      if (c.state === "sit" || c.state === "lie") {
        const yaw = c.yaw;
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        let nx = c.pos.x + fx * 0.55;
        let nz = c.pos.z + fz * 0.55;
        const refY = typeof seatSession.item.floorY === "number" ? seatSession.item.floorY : null;
        if (c.state === "lie" || !isPositionWalkable(nx, nz, 0.2, refY)) {
          const ip = seatSession.item.position;
          nx = ip.x + fx * 1.0;
          nz = ip.z + fz * 1.0;
          if (!isPositionWalkable(nx, nz, 0.2, refY)) {
            nx = ip.x;
            nz = ip.z + 1.2;
          }
        }
        c.state = "stand";
        c.rootQuat = null;
        c.pos.set(nx, getWalkSurfaceY(nx, nz, refY ?? c.pos.y + c.hipY), nz);
      }
    }
    void seats;
    seatSession = null;
  }

  // ------------------------------------------------------------------------
  // Interactions
  // ------------------------------------------------------------------------
  function activateItem(item) {
    const L = leader();
    const P = partner();
    if (carrying) setCarry(false);
    let text = null;
    try {
      text = item.activate ? item.activate({ actor: controlledId, audio, partner: P.id }) : null;
    } catch (err) {
      console.warn("interactable failed", item.id, err);
    }
    if (item.pose && Array.isArray(item.pose.seats) && item.pose.seats.length) {
      standUp();
      const seats = item.pose.seats;
      const attach = item.pose.attachTo || null;
      seatSession = { item, attach, seats, type: item.pose.type || "sit" };
      applySeat(L, seats[0], seatSession.type, attach);
      if (seats[1]) applySeat(P, seats[1], seatSession.type, attach);
      else P.lookTarget = L.pos;
      L.setExpression("happy");
      P.setExpression("happy");
      setTimeout(() => {
        L.setExpression(null);
        P.setExpression(null);
      }, 2200);
      burstBetween(8);
    } else {
      // face the object & reach toward it; partner claps / watches
      const dx = item.position.x - L.pos.x;
      const dz = item.position.z - L.pos.z;
      L.yaw = Math.atan2(-dx, -dz);
      L.reachT = 1.2;
      P.lookTarget = item.position;
      P.startAction(Math.random() < 0.5 ? "clap" : "wave", 1.6);
      setTimeout(() => (P.lookTarget = null), 2500);
    }
    toast(text || `${L.name}：${item.label}`);
  }

  function setCarry(on) {
    const L = ran;
    const F = xian;
    if (on) {
      standUp();
      carrying = true;
      F.state = "carried";
      L.startAction("carry", 9999, { hold: true });
      F.setExpression("happy");
      toast("小冉子一把公主抱起了小贤贤 💞");
      burstBetween(18);
    } else if (carrying) {
      carrying = false;
      F.state = "stand";
      F.rootQuat = null;
      F.setExpression(null);
      L.clearAction();
      const yaw = L.yaw;
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      F.pos.set(L.pos.x - rx * 0.62, L.pos.y, L.pos.z - rz * 0.62);
      F.yaw = yaw;
    }
  }

  function faceEachOther(dist) {
    const L = leader();
    const P = partner();
    const yaw = L.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    let px = L.pos.x + fx * dist;
    let pz = L.pos.z + fz * dist;
    if (!isPositionWalkable(px, pz, 0.15, L.pos.y)) {
      px = L.pos.x - fx * dist;
      pz = L.pos.z - fz * dist;
      L.yaw = yaw + Math.PI;
    }
    P.pos.set(px, getWalkSurfaceY(px, pz, L.pos.y), pz);
    P.yaw = L.yaw + Math.PI;
    P.speed = 0;
    L.speed = 0;
  }

  const ACTIONS = {
    holdhand() {
      holdingHands = !holdingHands;
      toast(holdingHands ? "十指相扣，一起走吧 🤝" : "松开小手，各自看看风景～");
      if (holdingHands) burstBetween(6);
    },
    hug() {
      standUp();
      setCarry(false);
      faceEachOther(0.3);
      xian.startAction("hug", 3.2);
      ran.startAction("hug", 3.2);
      xian.setExpression("happy");
      ran.setExpression("happy");
      setTimeout(() => {
        xian.setExpression(null);
        ran.setExpression(null);
      }, 3200);
      burstBetween(16);
      audio?.playPetalGlissando?.();
      toast("紧紧抱住彼此，心跳都同步了 🤗");
    },
    kiss() {
      standUp();
      setCarry(false);
      faceEachOther(0.3);
      xian.startAction("kiss", 3.0);
      ran.startAction("kiss", 3.0);
      xian.setExpression("kiss");
      ran.setExpression("kiss");
      setTimeout(() => {
        xian.setExpression("happy");
        ran.setExpression("happy");
      }, 3000);
      setTimeout(() => {
        xian.setExpression(null);
        ran.setExpression(null);
      }, 4200);
      setTimeout(() => burstBetween(26), 900);
      audio?.playDuetArpeggio?.();
      toast("踮起脚尖，轻轻一个吻 💋");
    },
    pat() {
      standUp();
      setCarry(false);
      faceEachOther(0.42);
      ran.startAction("pat", 2.6, { giver: true });
      xian.startAction("pat", 2.6, { giver: false });
      xian.setExpression("happy");
      setTimeout(() => xian.setExpression(null), 2600);
      burstBetween(8);
      toast("小冉子摸摸小贤贤的头：乖～ 🥰");
    },
    dance() {
      standUp();
      setCarry(false);
      faceEachOther(0.55);
      danceT = 4.5;
      xian.startAction("dance", 4.5);
      ran.startAction("dance", 4.5);
      xian.setExpression("happy");
      ran.setExpression("happy");
      setTimeout(() => {
        xian.setExpression(null);
        ran.setExpression(null);
      }, 4500);
      audio?.playDuetArpeggio?.();
      toast("牵手转圈，裙摆像花一样绽开 💃🕺");
    },
    heart() {
      standUp();
      xian.startAction("heart", 2.6);
      ran.startAction("heart", 2.6);
      xian.setExpression("happy");
      ran.setExpression("happy");
      setTimeout(() => {
        xian.setExpression(null);
        ran.setExpression(null);
      }, 2600);
      setTimeout(() => burstBetween(30), 600);
      toast("一起比个大大的心 ❤️");
    },
    carry() {
      setCarry(!carrying);
      if (!carrying) toast("轻轻把小贤贤放下 🌸");
    },
  };
  let danceT = 0;

  function doAction(name) {
    const fn = ACTIONS[name];
    if (fn) fn();
    syncUI();
  }

  // ------------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------------
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (!active) return;
    drag = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("pointerup", () => (drag = null));
  canvas.addEventListener("pointermove", (e) => {
    if (!active || !drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag = { x: e.clientX, y: e.clientY };
    camYaw -= dx * 0.0042;
    camPitch = clamp(camPitch - dy * 0.0036, -1.2, 1.0);
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!active) return;
      e.preventDefault();
      if (view === "third") {
        thirdDist = clamp(thirdDist * Math.exp(clamp(e.deltaY, -120, 120) * 0.0015), 0.9, 9);
      }
    },
    { passive: false }
  );

  const MOVE_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"];
  window.addEventListener("keydown", (e) => {
    if (!active) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (MOVE_KEYS.includes(e.code)) {
      keys.add(e.code);
      walkTarget = null;
      pendingInteract = null;
      return;
    }
    switch (e.code) {
      case "KeyE":
        if (seatSession) {
          standUp();
          toast("起身继续逛逛～");
        } else if (nearest) activateItem(nearest);
        break;
      case "KeyF":
        doAction("holdhand");
        break;
      case "Tab":
        e.preventDefault();
        setControlled(controlledId === "xian" ? "ran" : "xian");
        break;
      case "KeyV":
        setView(view === "first" ? "second" : view === "second" ? "third" : "first");
        break;
      case "Digit1":
        doAction("hug");
        break;
      case "Digit2":
        doAction("kiss");
        break;
      case "Digit3":
        doAction("pat");
        break;
      case "Digit4":
        doAction("dance");
        break;
      case "Digit5":
        doAction("heart");
        break;
      case "Digit6":
        doAction("carry");
        break;
      case "Space":
        e.preventDefault();
        if (!seatSession) leader().startAction("hop", 0.55);
        break;
      default:
        break;
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));

  // Click routing (called by app.js with its raycast pick)
  function handleClick(picked) {
    if (!active) return false;
    const hit = picked && picked.hitPoint;
    const cid = picked && picked.interactive && picked.interactive.id;
    if (cid === "char-xian" || cid === "char-ran") {
      setControlled(cid === "char-xian" ? "xian" : "ran");
      return true;
    }
    if (!hit) return true;
    // Interactable near click → walk there and activate
    let best = null;
    let bestD = Infinity;
    for (const it of interactables) {
      const d = Math.hypot(it.position.x - hit.x, it.position.z - hit.z);
      const dy = Math.abs(it.position.y - hit.y);
      if (d < Math.max(1.4, it.radius * 0.9) && dy < 2.2 && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    const L = leader();
    if (best) {
      pendingInteract = best;
      walkTarget = { x: best.position.x, z: best.position.z, stopDist: Math.min(1.1, best.radius * 0.7) };
      if (seatSession) standUp();
      return true;
    }
    if (isPositionWalkable(hit.x, hit.z, 0.22, L.pos.y) && Math.abs(getWalkSurfaceY(hit.x, hit.z, L.pos.y) - hit.y) < 0.8) {
      if (seatSession) standUp();
      walkTarget = { x: hit.x, z: hit.z, stopDist: 0.15 };
      pendingInteract = null;
      return true;
    }
    // Not walkable → just look at it (点哪看哪)
    lookAtPoint(hit);
    return true;
  }

  function lookAtPoint(p) {
    const eye = view === "first" ? leader().getEyeWorld() : camera.position;
    const dx = p.x - eye.x;
    const dz = p.z - eye.z;
    const dy = p.y - eye.y;
    camYaw = Math.atan2(-dx, -dz);
    camPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -1.1, 0.9);
    leader().lookTarget = p.clone();
    setTimeout(() => (leader().lookTarget = null), 2500);
  }

  // ------------------------------------------------------------------------
  // Movement
  // ------------------------------------------------------------------------
  function moveChar(c, dx, dz, dt, speed) {
    const len = Math.hypot(dx, dz);
    if (len < 1e-5) {
      c.speed = lerp(c.speed, 0, clamp(dt * 10, 0, 1));
      return false;
    }
    const ux = dx / len;
    const uz = dz / len;
    const step = Math.min(len, speed * dt);
    const res = resolveWalkPosition(c.pos.x, c.pos.z, c.pos.x + ux * step, c.pos.z + uz * step, 0.22, c.pos.y);
    const moved = Math.hypot(res.x - c.pos.x, res.z - c.pos.z);
    c.pos.x = res.x;
    c.pos.z = res.z;
    const gy = getWalkSurfaceY(c.pos.x, c.pos.z, c.pos.y);
    c.pos.y = lerp(c.pos.y, gy, clamp(dt * 14, 0, 1));
    const wantYaw = Math.atan2(-ux, -uz);
    c.yaw += angDiff(c.yaw, wantYaw) * clamp(dt * 10, 0, 1);
    c.speed = lerp(c.speed, moved / Math.max(dt, 1e-4), clamp(dt * 8, 0, 1));
    return moved > 1e-4;
  }

  function updateLeader(dt) {
    const L = leader();
    if (seatSession) {
      L.speed = 0;
      return;
    }
    let fwd = 0;
    let right = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) fwd += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) fwd -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) right += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) right -= 1;
    const running = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const speed = running ? 3.6 : 1.55;
    if (fwd || right) {
      const fx = -Math.sin(camYaw);
      const fz = -Math.cos(camYaw);
      const rx = Math.cos(camYaw);
      const rz = -Math.sin(camYaw);
      moveChar(L, fx * fwd + rx * right, fz * fwd + rz * right, dt, speed);
    } else if (walkTarget) {
      const dx = walkTarget.x - L.pos.x;
      const dz = walkTarget.z - L.pos.z;
      const d = Math.hypot(dx, dz);
      if (d <= (walkTarget.stopDist || 0.15)) {
        walkTarget = null;
        L.speed = 0;
        if (pendingInteract) {
          const it = pendingInteract;
          pendingInteract = null;
          activateItem(it);
        }
      } else {
        const moved = moveChar(L, dx, dz, dt, d > 6 ? 3.2 : 1.6);
        if (!moved) {
          walkTarget = null;
          if (pendingInteract && Math.hypot(pendingInteract.position.x - L.pos.x, pendingInteract.position.z - L.pos.z) < pendingInteract.radius + 0.6) {
            activateItem(pendingInteract);
          }
          pendingInteract = null;
        }
      }
    } else {
      L.speed = lerp(L.speed, 0, clamp(dt * 10, 0, 1));
    }
    // record breadcrumb trail for partner
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(last.x - L.pos.x, last.z - L.pos.z) > 0.25) {
      trail.push({ x: L.pos.x, y: L.pos.y, z: L.pos.z });
      if (trail.length > 120) trail.shift();
    }
  }

  function updatePartner(dt) {
    const L = leader();
    const P = partner();
    if (carrying) {
      // xian is carried by ran
      const M = ran;
      const F = xian;
      const yaw = M.yaw;
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const rgt = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const C = M.pos.clone().addScaledVector(fwd, 0.3).add(new THREE.Vector3(0, M.hipY + 0.2, 0));
      const yAxis = rgt.clone().negate();
      const face = new THREE.Vector3(0, 1, 0).multiplyScalar(0.85).addScaledVector(fwd, -0.5).normalize();
      face.addScaledVector(yAxis, -face.dot(yAxis)).normalize();
      const rootZ = face.clone().negate();
      const rootX = new THREE.Vector3().crossVectors(yAxis, rootZ).normalize();
      _m.makeBasis(rootX, yAxis, rootZ);
      F.rootQuat = new THREE.Quaternion().setFromRotationMatrix(_m);
      F.pos.copy(C).addScaledVector(yAxis, -F.hipY);
      F.speed = 0;
      if (controlledId === "xian") {
        // if she is "controlled" while carried, he walks — mirror leader input onto him
      }
      return;
    }
    if (seatSession) {
      if (seatSession.attach) {
        applySeat(L, seatSession.seats[0], seatSession.type, seatSession.attach);
        if (seatSession.seats[1]) applySeat(P, seatSession.seats[1], seatSession.type, seatSession.attach);
      }
      return;
    }
    if (P.action && (P.action.name === "hug" || P.action.name === "kiss" || P.action.name === "pat")) {
      P.speed = 0;
      return;
    }
    if (danceT > 0) {
      // orbit around the shared center while dancing
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
      // teleport near leader
      P.pos.set(L.pos.x + Math.cos(L.yaw) * 0.6, L.pos.y, L.pos.z - Math.sin(L.yaw) * 0.6);
      trail.length = 0;
      return;
    }
    let target = null;
    if (holdingHands) {
      // walk at leader's side (girl on boy's right... whichever side is free)
      const side = controlledId === "ran" ? 1 : -1;
      const rx = Math.cos(L.yaw);
      const rz = -Math.sin(L.yaw);
      const tx = L.pos.x + rx * 0.56 * side;
      const tz = L.pos.z + rz * 0.56 * side;
      if (isPositionWalkable(tx, tz, 0.18, L.pos.y) && Math.abs(getWalkSurfaceY(tx, tz, L.pos.y) - L.pos.y) < 0.5) {
        target = { x: tx, z: tz };
      }
      const handSide = -side; // partner sees leader on the opposite side
      if (L.speed > 0.2 || distToLeader < 0.8) {
        if (!L.action || L.action.name === "holdhand") L.startAction("holdhand", 0.3, { side });
        if (!P.action || P.action.name === "holdhand") P.startAction("holdhand", 0.3, { side: handSide });
      }
    }
    if (!target) {
      // follow breadcrumbs, staying ~1m behind
      while (trail.length > 1 && Math.hypot(trail[0].x - P.pos.x, trail[0].z - P.pos.z) < 0.35) trail.shift();
      const keep = Math.hypot(L.pos.x - P.pos.x, L.pos.z - P.pos.z);
      if (keep > 1.1 && trail.length) target = trail[0];
    }
    if (target) {
      const dx = target.x - P.pos.x;
      const dz = target.z - P.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.06) {
        const sp = clamp(d * 3.2, 0, Math.max(1.6, L.speed * 1.25 + 0.4));
        moveChar(P, dx, dz, dt, sp);
        if (holdingHands && L.speed > 0.2) P.yaw += angDiff(P.yaw, L.yaw) * clamp(dt * 6, 0, 1);
      } else {
        P.speed = lerp(P.speed, 0, clamp(dt * 8, 0, 1));
        P.yaw += angDiff(P.yaw, L.yaw) * clamp(dt * 4, 0, 1);
      }
    } else {
      P.speed = lerp(P.speed, 0, clamp(dt * 8, 0, 1));
      // turn to gaze at the leader lovingly
      const want = Math.atan2(-(L.pos.x - P.pos.x), -(L.pos.z - P.pos.z));
      P.yaw += angDiff(P.yaw, want) * clamp(dt * 2, 0, 1);
    }
  }

  // Idle couple autopilot while the user explores freely
  function updateIdle(dt) {
    if (seatSession) return;
    idleActionTimer -= dt;
    if (idleActionTimer <= 0) {
      idleActionTimer = 9 + Math.random() * 8;
      const pick = ["hug", "heart", "pat", "kiss", "dance"][Math.floor(Math.random() * 5)];
      ACTIONS[pick]();
      if (ui.toast) ui.toast.classList.remove("is-show");
    }
    for (const c of [xian, ran]) c.speed = lerp(c.speed, 0, clamp(dt * 8, 0, 1));
    if (danceT > 0) updatePartner(dt);
  }

  // ------------------------------------------------------------------------
  // Camera
  // ------------------------------------------------------------------------
  function updateCamera(dt) {
    const L = leader();
    const P = partner();
    if (view === "first") {
      L.setVisibleHead(false);
      P.setVisibleHead(true);
      L.getEyeWorld(camPos);
      camera.position.copy(camPos);
      camera.quaternion.setFromEuler(new THREE.Euler(camPitch, camYaw, 0, "YXZ"));
      L.tag.visible = false;
      P.tag.visible = true;
      // body follows view yaw when standing still
      if (!seatSession && !carrying && L.speed < 0.1) L.yaw += angDiff(L.yaw, camYaw) * clamp(dt * 4, 0, 1);
      camInit = false;
      return;
    }
    L.setVisibleHead(true);
    if (view === "second") {
      // through TA's eyes: partner looks at you
      P.setVisibleHead(false);
      P.lookTarget = L.getHeadWorld();
      P.getEyeWorld(camPos);
      L.getHeadWorld(camLook);
      camLook.y -= 0.25;
      const dist = camPos.distanceTo(camLook);
      if (dist < 0.9) {
        // too close (hug/kiss): pull back along partner's view a bit
        const dir = camPos.clone().sub(camLook).normalize();
        camPos.copy(camLook).addScaledVector(dir, 0.9);
      }
      if (!camInit) smoothCam.copy(camPos);
      smoothCam.lerp(camPos, clamp(dt * 6, 0, 1));
      camera.position.copy(smoothCam);
      camera.lookAt(camLook);
      L.tag.visible = true;
      P.tag.visible = false;
      camInit = true;
      // keep movement relative to what we see
      const d = camLook.clone().sub(camera.position);
      camYaw = Math.atan2(-d.x, -d.z);
      return;
    }
    P.setVisibleHead(true);
    L.tag.visible = true;
    P.tag.visible = true;
    // third person orbit with wall-aware distance
    L.getHeadWorld(camLook);
    camLook.y -= 0.08;
    const indoor = L.pos.y > 2.4 && L.pos.x < -3.6 && L.pos.x > -23.6 && L.pos.z < 4.2 && L.pos.z > -10;
    const maxD = indoor ? Math.min(thirdDist, 1.9) : thirdDist;
    const dirX = Math.sin(camYaw) * Math.cos(camPitch);
    const dirZ = Math.cos(camYaw) * Math.cos(camPitch);
    const dirY = -Math.sin(camPitch);
    let d = maxD;
    const floorRef = L.pos.y;
    for (; d > 0.5; d -= 0.15) {
      const cx = camLook.x + dirX * d;
      const cz = camLook.z + dirZ * d;
      if (!indoor) break;
      if (isPositionWalkable(cx, cz, 0.08, floorRef) && Math.abs(getWalkSurfaceY(cx, cz, floorRef) - floorRef) < 0.6) break;
    }
    camPos.set(camLook.x + dirX * d, camLook.y + dirY * d + 0.15, camLook.z + dirZ * d);
    if (indoor) camPos.y = Math.min(camPos.y, floorRef + 2.85);
    const gy = getWalkSurfaceY(camPos.x, camPos.z, floorRef) + 0.3;
    if (camPos.y < gy) camPos.y = gy;
    if (!camInit) smoothCam.copy(camPos);
    smoothCam.lerp(camPos, clamp(dt * 9, 0, 1));
    camera.position.copy(smoothCam);
    camera.lookAt(camLook);
    camInit = true;
  }

  // ------------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------------
  function syncUI() {
    if (ui.panel) ui.panel.hidden = !active;
    ui.panel?.querySelectorAll("[data-couple-char]").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.coupleChar === controlledId);
    });
    ui.panel?.querySelectorAll("[data-couple-view]").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.coupleView === view);
    });
    ui.panel?.querySelectorAll("[data-couple-action='holdhand']").forEach((b) => b.classList.toggle("is-active", holdingHands));
    ui.panel?.querySelectorAll("[data-couple-action='carry']").forEach((b) => b.classList.toggle("is-active", carrying));
    if (ui.enterBtn) ui.enterBtn.classList.toggle("is-active", active);
  }

  function setControlled(id) {
    if (!chars[id]) return;
    const prevPartner = partner();
    prevPartner.lookTarget = null;
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
    if (id) controlledId = id;
    active = true;
    camYaw = leader().yaw;
    camPitch = -0.15;
    camInit = false;
    trail.length = 0;
    syncUI();
    onActiveChange?.(true);
    toast(`${leader().name} 出发啦～ WASD 走 · 拖拽转视角 · E 互动 · V 切视角 · Tab 换人`, 4200);
  }

  function exit() {
    active = false;
    walkTarget = null;
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
    } else if (b.dataset.coupleExit !== undefined) exit();
  });

  // Raycast proxies so clicking a character in free view enters couple mode
  for (const c of [xian, ran]) {
    c.root.userData.interactive = { id: `char-${c.id}`, label: c.name };
    c.root.traverse((o) => {
      o.userData.interactive = { id: `char-${c.id}`, label: c.name };
    });
  }

  // ------------------------------------------------------------------------
  // Frame update
  // ------------------------------------------------------------------------
  function update(dt) {
    if (danceT > 0) danceT -= dt;
    if (active) {
      if (carrying && controlledId === "xian") {
        // when carried, controlling her drives him
        const saved = controlledId;
        controlledId = "ran";
        updateLeader(dt);
        controlledId = saved;
      } else {
        updateLeader(dt);
      }
      updatePartner(dt);
    } else {
      updateIdle(dt);
    }
    xian.update(dt);
    ran.update(dt);
    hearts.update(dt);

    // continuous little hearts while hugging/kissing
    const a = xian.action;
    if (a && (a.name === "hug" || a.name === "kiss") && Math.random() < dt * 4) burstBetween(1);

    if (active) {
      updateCamera(dt);
      // proximity prompt
      const L = leader();
      nearest = null;
      let bestD = Infinity;
      if (!seatSession) {
        for (const it of interactables) {
          const dx = it.position.x - L.pos.x;
          const dz = it.position.z - L.pos.z;
          const d = Math.hypot(dx, dz);
          if (typeof it.floorY === "number" && Math.abs(it.floorY - L.pos.y) > 1.6) continue;
          if (typeof it.floorY !== "number" && Math.abs(it.position.y - L.pos.y) > 3.0) continue;
          if (d < (it.radius || 1.5) && d < bestD) {
            bestD = d;
            nearest = it;
          }
        }
      }
      if (ui.prompt) {
        if (seatSession) {
          ui.prompt.hidden = false;
          ui.prompt.innerHTML = `<kbd>E</kbd> 起身`;
        } else if (nearest) {
          ui.prompt.hidden = false;
          ui.prompt.innerHTML = `<kbd>E</kbd> ${nearest.label}`;
        } else {
          ui.prompt.hidden = true;
        }
      }
    }
  }

  return {
    group,
    xian,
    ran,
    update,
    enter,
    exit,
    isActive: () => active,
    handleClick,
    setControlled,
    setView,
    doAction,
    lookAtPoint,
    activateNearest: () => nearest && activateItem(nearest),
    activateById(id) {
      interactables = collectInteractables();
      const it = interactables.find((i) => i.id === id);
      if (it) {
        const L = leader();
        const yaw = L.yaw;
        void yaw;
        activateItem(it);
        return true;
      }
      return false;
    },
    refreshInteractables() {
      interactables = collectInteractables();
      return interactables.length;
    },
    getInteractables: () => interactables.map((i) => ({ id: i.id, label: i.label, pos: i.position.toArray(), pose: i.pose?.type || null })),
    teleport(x, z, yaw = 0, floorY = null) {
      standUp();
      setCarry(false);
      const y = getWalkSurfaceY(x, z, floorY);
      leader().place(x, y, z, yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      partner().place(x + rx * 0.56, y, z + rz * 0.56, yaw);
      camYaw = yaw;
      camInit = false;
      trail.length = 0;
    },
    setCamAngles(yaw, pitch) {
      camYaw = yaw;
      camPitch = pitch;
    },
    getState: () => ({
      active,
      controlledId,
      view,
      holdingHands,
      carrying,
      seated: seatSession ? seatSession.item.id : null,
      nearest: nearest ? nearest.id : null,
      xian: xian.pos.toArray().map((v) => +v.toFixed(2)),
      ran: ran.pos.toArray().map((v) => +v.toFixed(2)),
    }),
    TAU,
  };
}
