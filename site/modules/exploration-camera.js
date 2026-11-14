// Panoramic Overlook (Default) + Click-to-Dive Smooth Flight
// + First-Person Walk-Inside Exploration Controller (Babylon 9.36 Right-Handed).

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  clamp,
  lerp,
  getWorldTerrainY,
  getWalkSurfaceY,
  isPositionWalkable,
  resolveWalkPosition,
} from "./world-spatial.js";

const DEFAULT_EYE_HEIGHT = 1.68;
const UP_VEC = new Vector3(0, 1, 0);

function shortestAngleDelta(from, to) {
  let d = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function easeInOutCubic(u) {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

function sphericalOffset(radius, phi, theta, out = new Vector3()) {
  const sp = Math.sin(phi);
  out.set(radius * sp * Math.sin(theta), radius * Math.cos(phi), radius * sp * Math.cos(theta));
  return out;
}

function lookDirFromAngles(yaw, pitch, out = new Vector3()) {
  const cp = Math.cos(pitch);
  out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  return out;
}

function sampleCatmullRom(pts, u, out = new Vector3()) {
  const n = pts.length;
  if (n === 0) return out.set(0, 0, 0);
  if (n === 1) return out.copyFrom(pts[0]);
  const scaled = clamp(u, 0, 1) * (n - 1);
  const seg = Math.min(n - 2, Math.floor(scaled));
  const t = scaled - seg;
  const p0 = pts[Math.max(0, seg - 1)];
  const p1 = pts[seg];
  const p2 = pts[seg + 1];
  const p3 = pts[Math.min(n - 1, seg + 2)];
  const t2 = t * t;
  const t3 = t2 * t;
  const evalAxis = (a, b, c, d) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  out.set(evalAxis(p0.x, p1.x, p2.x, p3.x), evalAxis(p0.y, p1.y, p2.y, p3.y), evalAxis(p0.z, p1.z, p2.z, p3.z));
  return out;
}

function isInsideVilla1FShell(x, z) {
  return (x > -23.5 && x < -10.3 && z > -9.9 && z < 4.1) || (x >= -10.3 && x < -3.9 && z > -9.9 && z < -1.3);
}

function isInsideVilla2FShell(x, z) {
  return x > -23.5 && x < -11.1 && z > -9.9 && z < 4.1;
}

function isInsideVillaShell(x, z) {
  return isInsideVilla1FShell(x, z) || isInsideVilla2FShell(x, z);
}

function inStudySuite(x, z) {
  return x > -10.5 && x < -3.9 && z > -9.9 && z < -1.3;
}

function buildSmartWaypoints(startX, startZ, destX, destZ, startY = 2.6, destY = 2.6) {
  const pts = [];
  if (startY > 4.5 || destY > 4.5) {
    pts.push([destX, destZ]);
    return pts;
  }
  const startInside = isInsideVilla1FShell(startX, startZ);
  const destInside = isInsideVilla1FShell(destX, destZ);

  if (!startInside && destInside) {
    if (startZ > 6.8 || Math.abs(startX + 14.0) > 2.2) {
      pts.push([-14.0, 9.2]);
    }
    pts.push([-14.0, 5.2], [-14.0, 2.2]);
    if (inStudySuite(destX, destZ)) {
      pts.push([-11.6, -5.2], [-9.2, -5.2]);
    }
  } else if (startInside && !destInside) {
    if (inStudySuite(startX, startZ)) {
      pts.push([-9.2, -5.2], [-11.6, -5.2]);
    }
    pts.push([-14.0, 2.2], [-14.0, 9.2]);
  } else if (startInside && destInside) {
    if (inStudySuite(startX, startZ) && !inStudySuite(destX, destZ)) {
      pts.push([-9.2, -5.2], [-12.0, -5.2]);
    } else if (!inStudySuite(startX, startZ) && inStudySuite(destX, destZ)) {
      pts.push([-12.0, -5.2], [-9.2, -5.2]);
    }
  }

  pts.push([destX, destZ]);
  return pts;
}

export function findNearestWalkableSpot(targetX, targetZ, maxRadius = 11.0, refY = null) {
  if (isPositionWalkable(targetX, targetZ, 0.34, refY)) {
    return { x: targetX, z: targetZ };
  }
  for (let r = 0.65; r <= maxRadius; r += 0.65) {
    const steps = 16;
    for (let s = 0; s < steps; s += 1) {
      const ang = (s / steps) * Math.PI * 2;
      const cx = targetX + Math.cos(ang) * r;
      const cz = targetZ + Math.sin(ang) * r;
      if (isPositionWalkable(cx, cz, 0.34, refY)) {
        return { x: cx, z: cz };
      }
    }
  }
  return { x: -14.0, z: 16.5 };
}

export function createExplorationControls(camera, domElement, opts = {}) {
  let mode = "aerial";
  let enabled = true;
  const onModeChange = opts.onModeChange || (() => {});

  const walkPos = new Vector3(-14.0, getWalkSurfaceY(-14.0, 16.5), 16.5);
  let currentEyeHeight = DEFAULT_EYE_HEIGHT;
  let desiredEyeHeight = DEFAULT_EYE_HEIGHT;
  let yaw = 0.0;
  let pitch = 0.02;
  let desiredYaw = yaw;
  let desiredPitch = pitch;
  let walkBobPhase = 0;
  let walkWaypoints = [];
  let activeFlight = null;

  const keys = new Set();

  const defaultRadius = opts.isPortrait ? 76.0 : 66.0;
  const aerialTarget = new Vector3(-4.5, 2.8, 9.2);
  const desiredAerialTarget = aerialTarget.clone();
  const aerialSpherical = { radius: defaultRadius, phi: 1.0, theta: 0.3 };
  const desiredAerialSpherical = { ...aerialSpherical };

  let dragType = null;
  let lastPos = { x: 0, y: 0 };
  let movedPx = 0;
  const touches = new Map();
  let lastPinch = 0;

  const tmpVec = new Vector3();
  const tmpDir = new Vector3();
  const tmpTarget = new Vector3();

  function applyWalkCameraPose(bob = 0) {
    camera.position.set(walkPos.x, walkPos.y + currentEyeHeight + bob, walkPos.z);
    lookDirFromAngles(yaw, pitch, tmpDir);
    tmpTarget.copyFrom(camera.position).addInPlace(tmpDir);
    camera.setTarget(tmpTarget);
  }

  function applyAerialCameraPose() {
    sphericalOffset(aerialSpherical.radius, aerialSpherical.phi, aerialSpherical.theta, tmpVec);
    camera.position.copyFrom(aerialTarget).addInPlace(tmpVec);
    camera.setTarget(aerialTarget);
  }

  function currentLookDirection() {
    const tgt = camera.getTarget();
    const dir = tgt.subtract(camera.position);
    if (dir.lengthSquared() < 1e-6) return new Vector3(0, 0, -1);
    return dir.normalize();
  }

  function setMode(nextMode) {
    if (mode === nextMode) return;
    mode = nextMode;
    walkWaypoints = [];
    onModeChange(mode);
  }

  function teleportWalk(x, z, lookYaw = 0, lookPitch = 0.0, eyeHeight = DEFAULT_EYE_HEIGHT, floorY = null) {
    activeFlight = null;
    mode = "walk";
    walkWaypoints = [];
    const surfY = getWalkSurfaceY(x, z, floorY);
    walkPos.set(x, surfY, z);
    currentEyeHeight = eyeHeight;
    desiredEyeHeight = eyeHeight;
    yaw = lookYaw;
    desiredYaw = lookYaw;
    pitch = lookPitch;
    desiredPitch = lookPitch;
    applyWalkCameraPose(0);
    onModeChange(mode);
  }

  function buildSafeFlightCurve(startPos, endPos) {
    const start1F = isInsideVilla1FShell(startPos.x, startPos.z) && startPos.y < 5.8;
    const end1F = isInsideVilla1FShell(endPos.x, endPos.z) && endPos.y < 5.8;
    const start2F = isInsideVilla2FShell(startPos.x, startPos.z) && startPos.y >= 5.8 && startPos.y < 10.2;
    const end2F = isInsideVilla2FShell(endPos.x, endPos.z) && endPos.y >= 5.8 && endPos.y < 10.2;

    if (!start2F && end2F) {
      const pts = [startPos.clone()];
      if (start1F) {
        if (inStudySuite(startPos.x, startPos.z)) {
          pts.push(new Vector3(-12.2, 4.18, -5.2));
        }
        pts.push(new Vector3(-14.0, 4.18, 1.8), new Vector3(-14.0, 4.35, 8.8), new Vector3(-14.0, 7.82, 8.4));
      } else {
        pts.push(
          new Vector3(
            lerp(startPos.x, -14.0, 0.72),
            Math.max(8.2, lerp(startPos.y, 7.9, 0.68)),
            Math.max(9.8, lerp(startPos.z, 9.8, 0.72))
          )
        );
      }
      pts.push(new Vector3(-14.0, 7.74, 5.6), new Vector3(-14.0, 7.72, 2.2), endPos.clone());
      return { pts, arcLift: 0.0, indoorRoute: true };
    }

    if (start2F && !end2F) {
      const pts = [startPos.clone(), new Vector3(-14.0, 7.72, 2.2), new Vector3(-14.0, 7.78, 7.6)];
      if (end1F) {
        pts.push(new Vector3(-14.0, 4.35, 8.8), new Vector3(-14.0, 4.2, 5.6), new Vector3(-14.0, 4.18, 1.8));
        if (inStudySuite(endPos.x, endPos.z)) {
          pts.push(new Vector3(-11.8, 4.18, -5.2));
        }
      }
      pts.push(endPos.clone());
      return { pts, arcLift: end1F ? 0.0 : 1.1, indoorRoute: true };
    }

    if (!start1F && end1F) {
      const pts = [
        startPos.clone(),
        new Vector3(
          lerp(startPos.x, -14.0, 0.72),
          Math.max(5.4, lerp(startPos.y, 4.35, 0.68)),
          Math.max(11.6, lerp(startPos.z, 11.6, 0.72))
        ),
        new Vector3(-14.0, 4.22, 6.2),
        new Vector3(-14.0, 4.18, 1.8),
      ];
      if (inStudySuite(endPos.x, endPos.z)) {
        pts.push(new Vector3(-11.8, 4.18, -5.2));
      }
      pts.push(endPos.clone());
      return { pts, arcLift: 0.0, indoorRoute: true };
    }

    if (start1F && !end1F) {
      const pts = [startPos.clone()];
      if (inStudySuite(startPos.x, startPos.z)) {
        pts.push(new Vector3(-11.8, 4.18, -5.2));
      }
      pts.push(new Vector3(-14.0, 4.18, 1.8), new Vector3(-14.0, 4.35, 8.6), endPos.clone());
      return { pts, arcLift: 1.2, indoorRoute: true };
    }

    if (start1F && end1F && inStudySuite(startPos.x, startPos.z) !== inStudySuite(endPos.x, endPos.z)) {
      return {
        pts: [startPos.clone(), new Vector3(-11.8, 4.18, -5.2), new Vector3(-14.0, 4.18, -1.6), endPos.clone()],
        arcLift: 0.0,
        indoorRoute: true,
      };
    }

    const midX = 0.5 * (startPos.x + endPos.x);
    const midZ = 0.5 * (startPos.z + endPos.z);
    const crossesVillaRoof = midX > -25.5 && midX < -2.5 && midZ > -11.5 && midZ < 7.2;
    const dist = Vector3.Distance(startPos, endPos);
    const baseLift = clamp(dist * 0.12, 1.4, 9.0);
    return {
      pts: null,
      arcLift: crossesVillaRoof ? Math.max(baseLift, 11.8) : baseLift,
      indoorRoute: false,
    };
  }

  function diveToWalk(
    x,
    z,
    lookYaw = 0,
    lookPitch = 0.0,
    { duration = 0.92, eyeHeight = DEFAULT_EYE_HEIGHT, floorY = null } = {}
  ) {
    const startPos = camera.position.clone();
    const startDir = currentLookDirection();

    mode = "walk";
    walkWaypoints = [];
    const groundY = getWalkSurfaceY(x, z, floorY);
    walkPos.set(x, groundY, z);
    currentEyeHeight = eyeHeight;
    desiredEyeHeight = eyeHeight;
    yaw = lookYaw;
    desiredYaw = lookYaw;
    pitch = lookPitch;
    desiredPitch = lookPitch;

    const endPos = new Vector3(x, groundY + eyeHeight, z);
    const endDir = lookDirFromAngles(lookYaw, lookPitch, new Vector3()).normalize();
    const route = buildSafeFlightCurve(startPos, endPos);

    activeFlight = {
      elapsed: 0,
      duration: Math.max(0.18, route.indoorRoute ? Math.max(duration, 1.08) : duration),
      startPos,
      endPos,
      startDir,
      endDir,
      pts: route.pts,
      arcLift: route.arcLift,
    };
    onModeChange(mode);
  }

  function setAerialImmediate(targetArr, radius, phi, theta) {
    activeFlight = null;
    mode = "aerial";
    walkWaypoints = [];
    aerialTarget.set(targetArr[0], targetArr[1], targetArr[2]);
    desiredAerialTarget.copyFrom(aerialTarget);
    aerialSpherical.radius = radius;
    aerialSpherical.phi = clamp(phi, 0.18, 1.38);
    aerialSpherical.theta = theta;
    Object.assign(desiredAerialSpherical, aerialSpherical);
    applyAerialCameraPose();
    onModeChange(mode);
  }

  function flyToAerial(targetArr = [-4.5, 2.8, 9.2], radius = defaultRadius, phi = 1.0, theta = 0.3, duration = 0.88) {
    const startPos = camera.position.clone();
    const startDir = currentLookDirection();

    mode = "aerial";
    walkWaypoints = [];
    aerialTarget.set(targetArr[0], targetArr[1], targetArr[2]);
    desiredAerialTarget.copyFrom(aerialTarget);
    aerialSpherical.radius = radius;
    aerialSpherical.phi = clamp(phi, 0.18, 1.38);
    aerialSpherical.theta = theta;
    Object.assign(desiredAerialSpherical, aerialSpherical);

    const endPos = aerialTarget.add(sphericalOffset(aerialSpherical.radius, aerialSpherical.phi, aerialSpherical.theta, new Vector3()));
    const endDir = aerialTarget.subtract(endPos).normalize();
    const route = buildSafeFlightCurve(startPos, endPos);

    activeFlight = {
      elapsed: 0,
      duration: Math.max(0.18, route.indoorRoute ? Math.max(duration, 1.05) : duration),
      startPos,
      endPos,
      startDir,
      endDir,
      pts: route.pts,
      arcLift: route.arcLift,
    };
    onModeChange(mode);
  }

  function walkTo(destX, destZ, destY = null) {
    const refY = typeof destY === "number" ? destY : walkPos.y;
    if (!isPositionWalkable(destX, destZ, 0.25, refY)) return false;
    activeFlight = null;
    desiredEyeHeight = DEFAULT_EYE_HEIGHT;
    if (mode !== "walk") setMode("walk");
    walkWaypoints = buildSmartWaypoints(walkPos.x, walkPos.z, destX, destZ, walkPos.y, refY);
    const [fx, fz] = walkWaypoints[0];
    if (Math.hypot(fx - walkPos.x, fz - walkPos.z) > 0.35) {
      const targetYaw = Math.atan2(-(fx - walkPos.x), -(fz - walkPos.z));
      desiredYaw = yaw + shortestAngleDelta(yaw, targetYaw);
    }
    return true;
  }

  window.addEventListener("keydown", (e) => {
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"].includes(e.code)) {
      keys.add(e.code);
      if (mode === "walk" && enabled) {
        activeFlight = null;
        walkWaypoints = [];
        desiredEyeHeight = DEFAULT_EYE_HEIGHT;
      }
    }
  });

  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
  });

  domElement.addEventListener("contextmenu", (e) => e.preventDefault());

  domElement.addEventListener("pointerdown", (e) => {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      domElement.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore synthetic pointer events
    }
    if (touches.size === 1) {
      lastPos = { x: e.clientX, y: e.clientY };
      movedPx = 0;
      dragType = e.button === 2 || e.button === 1 || e.shiftKey ? "pan" : "look";
    } else if (touches.size === 2) {
      dragType = "pinch";
      const pts = Array.from(touches.values());
      lastPinch = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  });

  domElement.addEventListener("pointermove", (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (touches.size === 1 && dragType) {
      const dx = e.clientX - lastPos.x;
      const dy = e.clientY - lastPos.y;
      movedPx += Math.hypot(dx, dy);
      lastPos = { x: e.clientX, y: e.clientY };
      if (!enabled) return;
      if (movedPx > 5 && activeFlight) activeFlight = null;

      if (mode === "walk") {
        const sens = 0.0034;
        desiredYaw -= dx * sens;
        desiredPitch = clamp(desiredPitch - dy * sens, -1.28, 1.18);
      } else if (dragType === "look") {
        desiredAerialSpherical.theta -= (dx / Math.max(320, domElement.clientWidth)) * Math.PI * 1.65;
        desiredAerialSpherical.phi = clamp(
          desiredAerialSpherical.phi - (dy / Math.max(320, domElement.clientHeight)) * Math.PI * 1.15,
          0.08,
          1.53
        );
      } else if (dragType === "pan") {
        const panScale = desiredAerialSpherical.radius * 0.0014;
        const fwd = currentLookDirection();
        fwd.y = 0;
        if (fwd.lengthSquared() < 1e-6) fwd.set(0, 0, -1);
        else fwd.normalize();
        const right = Vector3.Cross(fwd, UP_VEC).normalize();
        desiredAerialTarget.addInPlace(right.scale(-dx * panScale));
        desiredAerialTarget.addInPlace(fwd.scale(dy * panScale));
        desiredAerialTarget.x = clamp(desiredAerialTarget.x, -180, 180);
        desiredAerialTarget.z = clamp(desiredAerialTarget.z, -180, 180);
      }
    } else if (touches.size === 2) {
      const pts = Array.from(touches.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastPinch > 4 && mode === "aerial") {
        desiredAerialSpherical.radius = clamp(
          desiredAerialSpherical.radius * (lastPinch / Math.max(4, dist)),
          4.0,
          260.0
        );
      }
      lastPinch = dist;
      movedPx += 12;
    }
  });

  function clearTouch(e) {
    touches.delete(e.pointerId);
    if (touches.size === 0) dragType = null;
  }
  domElement.addEventListener("pointerup", clearTouch);
  domElement.addEventListener("pointercancel", clearTouch);

  domElement.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (!enabled) return;
      if (mode === "aerial") {
        activeFlight = null;
        const factor = Math.exp(clamp(e.deltaY, -160, 160) * 0.0014);
        desiredAerialSpherical.radius = clamp(desiredAerialSpherical.radius * factor, 4.0, 260.0);
      } else {
        activeFlight = null;
        const step = -clamp(e.deltaY, -120, 120) * 0.022;
        const nx = walkPos.x - Math.sin(yaw) * step;
        const nz = walkPos.z - Math.cos(yaw) * step;
        const res = resolveWalkPosition(walkPos.x, walkPos.z, nx, nz, 0.38, walkPos.y);
        walkPos.x = res.x;
        walkPos.z = res.z;
      }
    },
    { passive: false }
  );

  function getStateSnapshot() {
    return {
      mode,
      walkPos: walkPos.clone(),
      currentEyeHeight,
      desiredEyeHeight,
      yaw,
      pitch,
      desiredYaw,
      desiredPitch,
      aerialTarget: aerialTarget.clone(),
      desiredAerialTarget: desiredAerialTarget.clone(),
      aerialSpherical: { ...aerialSpherical },
      desiredAerialSpherical: { ...desiredAerialSpherical },
    };
  }

  function restoreStateSnapshot(snap) {
    if (!snap) return;
    activeFlight = null;
    walkWaypoints = [];
    mode = snap.mode;
    walkPos.copyFrom(snap.walkPos);
    currentEyeHeight = snap.currentEyeHeight;
    desiredEyeHeight = snap.desiredEyeHeight;
    yaw = snap.yaw;
    pitch = snap.pitch;
    desiredYaw = snap.desiredYaw;
    desiredPitch = snap.desiredPitch;
    aerialTarget.copyFrom(snap.aerialTarget);
    desiredAerialTarget.copyFrom(snap.desiredAerialTarget);
    Object.assign(aerialSpherical, snap.aerialSpherical);
    Object.assign(desiredAerialSpherical, snap.desiredAerialSpherical);
    if (mode === "walk") applyWalkCameraPose(0);
    else applyAerialCameraPose();
    onModeChange(mode);
  }

  function focusOn(point, radius = null) {
    activeFlight = null;
    if (mode !== "aerial") setMode("aerial");
    desiredAerialTarget.set(point.x, point.y, point.z);
    const r = radius ?? clamp(desiredAerialSpherical.radius * 0.45, 9.0, 40.0);
    desiredAerialSpherical.radius = r;
    desiredAerialSpherical.phi = clamp(desiredAerialSpherical.phi, 0.55, 1.25);
  }

  function lookAtPoint(point) {
    if (mode !== "walk") return focusOn(point);
    const eyeY = walkPos.y + currentEyeHeight;
    const dx = point.x - walkPos.x;
    const dz = point.z - walkPos.z;
    const targetYaw = Math.atan2(-dx, -dz);
    desiredYaw = yaw + shortestAngleDelta(yaw, targetYaw);
    desiredPitch = clamp(Math.atan2(point.y - eyeY, Math.hypot(dx, dz)), -1.28, 1.18);
    walkWaypoints = [];
  }

  function update(dt) {
    if (!enabled) return;
    if (activeFlight) {
      activeFlight.elapsed += dt;
      const u = clamp(activeFlight.elapsed / activeFlight.duration, 0, 1);
      const e = easeInOutCubic(u);
      if (activeFlight.pts) {
        sampleCatmullRom(activeFlight.pts, e, camera.position);
      } else {
        Vector3.LerpToRef(activeFlight.startPos, activeFlight.endPos, e, camera.position);
      }
      camera.position.y += Math.sin(u * Math.PI) * activeFlight.arcLift;

      if (!isInsideVillaShell(camera.position.x, camera.position.z)) {
        const minGroundClearY = Math.max(0.65, getWorldTerrainY(camera.position.x, camera.position.z) + 0.78);
        if (camera.position.y < minGroundClearY) {
          camera.position.y = minGroundClearY;
        }
      }

      Vector3.LerpToRef(activeFlight.startDir, activeFlight.endDir, e, tmpDir);
      if (tmpDir.lengthSquared() < 1e-5) tmpDir.copyFrom(activeFlight.endDir);
      else tmpDir.normalize();
      tmpTarget.copyFrom(camera.position).addInPlace(tmpDir.scale(5));
      camera.setTarget(tmpTarget);

      if (u >= 1) activeFlight = null;
      return;
    }

    if (mode === "walk") {
      yaw = lerp(yaw, desiredYaw, 0.22);
      pitch = lerp(pitch, desiredPitch, 0.22);
      currentEyeHeight = lerp(currentEyeHeight, desiredEyeHeight, clamp(dt * 8.0, 0.08, 1.0));

      let moveFwd = 0;
      let moveRight = 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) moveFwd += 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) moveFwd -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) moveRight += 1;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) moveRight -= 1;

      const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 9.2 : 5.4;
      let moved = false;

      if (moveFwd !== 0 || moveRight !== 0) {
        const len = Math.hypot(moveFwd, moveRight);
        moveFwd /= len;
        moveRight /= len;
        const fwdX = -Math.sin(yaw);
        const fwdZ = -Math.cos(yaw);
        const rightX = Math.cos(yaw);
        const rightZ = -Math.sin(yaw);
        const stepDist = speed * dt;
        const nextX = walkPos.x + (fwdX * moveFwd + rightX * moveRight) * stepDist;
        const nextZ = walkPos.z + (fwdZ * moveFwd + rightZ * moveRight) * stepDist;
        const resolved = resolveWalkPosition(walkPos.x, walkPos.z, nextX, nextZ, 0.38, walkPos.y);
        moved = Math.hypot(resolved.x - walkPos.x, resolved.z - walkPos.z) > 0.001;
        walkPos.x = resolved.x;
        walkPos.z = resolved.z;
      } else if (walkWaypoints.length > 0) {
        const [wx, wz] = walkWaypoints[0];
        const dx = wx - walkPos.x;
        const dz = wz - walkPos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.32) {
          walkWaypoints.shift();
        } else {
          const step = Math.min(dist, 6.2 * dt);
          const resolved = resolveWalkPosition(
            walkPos.x,
            walkPos.z,
            walkPos.x + (dx / dist) * step,
            walkPos.z + (dz / dist) * step,
            0.35,
            walkPos.y
          );
          if (Math.hypot(resolved.x - walkPos.x, resolved.z - walkPos.z) < 0.0005) {
            walkWaypoints = [];
          } else {
            walkPos.x = resolved.x;
            walkPos.z = resolved.z;
            moved = true;
          }
        }
      }

      const targetGroundY = getWalkSurfaceY(walkPos.x, walkPos.z, walkPos.y);
      walkPos.y = lerp(walkPos.y, targetGroundY, clamp(dt * 14.0, 0.1, 1.0));
      if (moved) walkBobPhase += dt * 9.5;
      const bob = moved ? Math.sin(walkBobPhase) * 0.022 : 0.0;
      applyWalkCameraPose(bob);
    } else {
      Vector3.LerpToRef(aerialTarget, desiredAerialTarget, 0.14, aerialTarget);
      aerialSpherical.radius = lerp(aerialSpherical.radius, desiredAerialSpherical.radius, 0.14);
      aerialSpherical.phi = lerp(aerialSpherical.phi, desiredAerialSpherical.phi, 0.14);
      aerialSpherical.theta = lerp(aerialSpherical.theta, desiredAerialSpherical.theta, 0.14);
      applyAerialCameraPose();
      const minAerialY = Math.max(1.2, getWorldTerrainY(camera.position.x, camera.position.z) + 0.9);
      if (camera.position.y < minAerialY) {
        camera.position.y = minAerialY;
        camera.setTarget(aerialTarget);
      }
    }
  }

  setAerialImmediate([-4.5, 2.8, 9.2], defaultRadius, 1.0, 0.3);

  return {
    update,
    teleportWalk,
    diveToWalk,
    setAerialImmediate,
    flyToAerial,
    walkTo,
    getStateSnapshot,
    restoreStateSnapshot,
    getMode: () => mode,
    focusOn,
    lookAtPoint,
    setEnabled(v) {
      enabled = Boolean(v);
      keys.clear();
      if (!enabled) {
        activeFlight = null;
        walkWaypoints = [];
      }
    },
    isEnabled: () => enabled,
    getEyeHeight: () => currentEyeHeight,
    getWalkPosition: () => walkPos.clone(),
    wasClickGesture: () => movedPx < 6,
  };
}
