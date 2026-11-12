// Seamless First-Person Walk-Inside Exploration + Smart Doorway Waypoint Routing
// + Panoramic Aerial Orbit/Pan/Zoom Controller for Realistic Coastal Estate.

import {
  THREE,
  clamp,
  lerp,
  getWalkSurfaceY,
  isPositionWalkable,
  resolveWalkPosition,
} from "./pbr-kit.js";

const EYE_HEIGHT = 1.68;

function shortestAngleDelta(from, to) {
  let d = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function isInsideVillaShell(x, z) {
  return x > -24.1 && x < -3.9 && z > -10.1 && z < 4.1;
}

function inMasterSuite(x, z) {
  return isInsideVillaShell(x, z) && z < -3.0 && x < -14.0;
}

function inStudySuite(x, z) {
  return isInsideVillaShell(x, z) && z < -3.0 && x >= -14.0;
}

// Builds doorway-aware waypoints when walking into, out of, or between Villa rooms
function buildSmartWaypoints(startX, startZ, destX, destZ) {
  const pts = [];
  const startInside = isInsideVillaShell(startX, startZ);
  const destInside = isInsideVillaShell(destX, destZ);

  if (!startInside && destInside) {
    if (startZ > 6.8 || Math.abs(startX + 14.0) > 2.2) {
      pts.push([-14.0, 9.2]);
    }
    pts.push([-14.0, 5.2], [-14.0, 2.2]);
    if (inMasterSuite(destX, destZ)) {
      pts.push([-17.4, -1.6], [-17.4, -4.2]);
    } else if (inStudySuite(destX, destZ)) {
      pts.push([-10.6, -1.6], [-10.6, -4.2]);
    }
  } else if (startInside && !destInside) {
    if (inMasterSuite(startX, startZ)) {
      pts.push([-17.4, -4.2], [-17.4, -1.6]);
    } else if (inStudySuite(startX, startZ)) {
      pts.push([-10.6, -4.2], [-10.6, -1.6]);
    }
    pts.push([-14.0, 2.2], [-14.0, 9.2]);
  } else if (startInside && destInside) {
    if (inMasterSuite(startX, startZ) && !inMasterSuite(destX, destZ)) {
      pts.push([-17.4, -4.2], [-17.4, -1.6]);
    } else if (inStudySuite(startX, startZ) && !inStudySuite(destX, destZ)) {
      pts.push([-10.6, -4.2], [-10.6, -1.6]);
    }
    if (!inMasterSuite(startX, startZ) && inMasterSuite(destX, destZ)) {
      pts.push([-17.4, -1.6], [-17.4, -4.2]);
    } else if (!inStudySuite(startX, startZ) && inStudySuite(destX, destZ)) {
      pts.push([-10.6, -1.6], [-10.6, -4.2]);
    }
  }

  pts.push([destX, destZ]);
  return pts;
}

export function createExplorationControls(camera, domElement, opts = {}) {
  let mode = "walk"; // "walk" | "aerial"
  const onModeChange = opts.onModeChange || (() => {});

  // Walk state (camera yaw = 0 looks toward -Z, yaw = PI looks toward +Z)
  const walkPos = new THREE.Vector3(-14.0, getWalkSurfaceY(-14.0, 13.5), 13.5);
  let yaw = 0.0;
  let pitch = 0.04;
  let desiredYaw = yaw;
  let desiredPitch = pitch;
  let walkBobPhase = 0;
  let walkWaypoints = [];

  // Keyboard state
  const keys = new Set();

  // Aerial orbit state
  const aerialTarget = new THREE.Vector3(-6.0, 3.0, 2.0);
  const desiredAerialTarget = aerialTarget.clone();
  const aerialSpherical = new THREE.Spherical(118.0, 1.06, 0.62);
  const desiredAerialSpherical = aerialSpherical.clone();

  // Pointer drag tracking
  let dragType = null;
  let downPos = { x: 0, y: 0 };
  let lastPos = { x: 0, y: 0 };
  let movedPx = 0;
  const touches = new Map();
  let lastPinch = 0;

  const euler = new THREE.Euler(0, 0, 0, "YXZ");

  function setMode(nextMode) {
    if (mode === nextMode) return;
    mode = nextMode;
    walkWaypoints = [];
    onModeChange(mode);
  }

  function teleportWalk(x, z, lookYaw = 0, lookPitch = 0.0) {
    mode = "walk";
    walkWaypoints = [];
    walkPos.set(x, getWalkSurfaceY(x, z), z);
    yaw = lookYaw;
    desiredYaw = lookYaw;
    pitch = lookPitch;
    desiredPitch = lookPitch;
    euler.set(pitch, yaw, 0, "YXZ");
    camera.position.set(x, walkPos.y + EYE_HEIGHT, z);
    camera.quaternion.setFromEuler(euler);
    onModeChange(mode);
  }

  function setAerialImmediate(targetArr, radius, phi, theta) {
    mode = "aerial";
    walkWaypoints = [];
    aerialTarget.set(targetArr[0], targetArr[1], targetArr[2]);
    desiredAerialTarget.copy(aerialTarget);
    aerialSpherical.set(radius, clamp(phi, 0.18, 1.45), theta);
    desiredAerialSpherical.copy(aerialSpherical);
    const offset = new THREE.Vector3().setFromSpherical(aerialSpherical);
    camera.position.copy(aerialTarget).add(offset);
    camera.lookAt(aerialTarget);
    onModeChange(mode);
  }

  function walkTo(destX, destZ) {
    if (!isPositionWalkable(destX, destZ, 0.25)) return false;
    if (mode !== "walk") {
      setMode("walk");
    }
    walkWaypoints = buildSmartWaypoints(walkPos.x, walkPos.z, destX, destZ);
    const [fx, fz] = walkWaypoints[0];
    if (Math.hypot(fx - walkPos.x, fz - walkPos.z) > 0.35) {
      const targetYaw = Math.atan2(-(fx - walkPos.x), -(fz - walkPos.z));
      desiredYaw = yaw + shortestAngleDelta(yaw, targetYaw);
    }
    return true;
  }

  // Event Listeners
  window.addEventListener("keydown", (e) => {
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"].includes(e.code)) {
      keys.add(e.code);
      walkWaypoints = [];
      if (mode === "aerial" && e.code !== "ShiftLeft" && e.code !== "ShiftRight") {
        // Drop onto walkable ground near aerial target when pressing movement keys
        const gx = clamp(aerialTarget.x, -95, 75);
        const gz = clamp(aerialTarget.z, -95, 65);
        if (isPositionWalkable(gx, gz, 0.38)) {
          teleportWalk(gx, gz, aerialSpherical.theta, -0.05);
        } else {
          teleportWalk(-14.0, 11.5, 0.0, 0.02);
        }
      }
    }
  });

  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
  });

  domElement.addEventListener("contextmenu", (e) => e.preventDefault());

  domElement.addEventListener("pointerdown", (e) => {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    domElement.setPointerCapture?.(e.pointerId);
    if (touches.size === 1) {
      downPos = { x: e.clientX, y: e.clientY };
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

      if (mode === "walk") {
        const sens = 0.0034;
        desiredYaw -= dx * sens;
        desiredPitch = clamp(desiredPitch - dy * sens, -1.28, 1.18);
      } else if (dragType === "look") {
        desiredAerialSpherical.theta -= (dx / Math.max(320, domElement.clientWidth)) * Math.PI * 1.65;
        desiredAerialSpherical.phi = clamp(
          desiredAerialSpherical.phi - (dy / Math.max(320, domElement.clientHeight)) * Math.PI * 1.15,
          0.18,
          1.45
        );
      } else if (dragType === "pan") {
        const panScale = desiredAerialSpherical.radius * 0.0014;
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        fwd.y = 0;
        fwd.normalize();
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
        desiredAerialTarget.addScaledVector(right, -dx * panScale);
        desiredAerialTarget.addScaledVector(fwd, dy * panScale);
        desiredAerialTarget.x = clamp(desiredAerialTarget.x, -110, 110);
        desiredAerialTarget.z = clamp(desiredAerialTarget.z, -110, 110);
      }
    } else if (touches.size === 2) {
      const pts = Array.from(touches.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastPinch > 4 && mode === "aerial") {
        desiredAerialSpherical.radius = clamp(
          desiredAerialSpherical.radius * (lastPinch / Math.max(4, dist)),
          14.0,
          225.0
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
      if (mode === "aerial") {
        const factor = Math.exp(clamp(e.deltaY, -160, 160) * 0.0014);
        const nextR = desiredAerialSpherical.radius * factor;
        if (nextR < 13.5 && e.deltaY < 0) {
          const gx = clamp(desiredAerialTarget.x, -95, 75);
          const gz = clamp(desiredAerialTarget.z, -95, 65);
          if (isPositionWalkable(gx, gz, 0.38)) {
            teleportWalk(gx, gz, aerialSpherical.theta + Math.PI, -0.04);
            return;
          }
        }
        desiredAerialSpherical.radius = clamp(nextR, 14.0, 225.0);
      } else {
        // In walk mode: gentle step forward/back on wheel, or soar to aerial if scrolling far out outdoors
        const step = -clamp(e.deltaY, -120, 120) * 0.022;
        const nx = walkPos.x - Math.sin(yaw) * step;
        const nz = walkPos.z - Math.cos(yaw) * step;
        const res = resolveWalkPosition(walkPos.x, walkPos.z, nx, nz, 0.38);
        walkPos.x = res.x;
        walkPos.z = res.z;
      }
    },
    { passive: false }
  );

  function update(dt) {
    if (mode === "walk") {
      yaw = lerp(yaw, desiredYaw, 0.22);
      pitch = lerp(pitch, desiredPitch, 0.22);

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
        const resolved = resolveWalkPosition(walkPos.x, walkPos.z, nextX, nextZ, 0.38);
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
            0.35
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

      const targetGroundY = getWalkSurfaceY(walkPos.x, walkPos.z);
      walkPos.y = lerp(walkPos.y, targetGroundY, clamp(dt * 14.0, 0.1, 1.0));
      if (moved) {
        walkBobPhase += dt * 9.5;
      }
      const bob = moved ? Math.sin(walkBobPhase) * 0.022 : 0.0;

      euler.set(pitch, yaw, 0, "YXZ");
      camera.position.set(walkPos.x, walkPos.y + EYE_HEIGHT + bob, walkPos.z);
      camera.quaternion.setFromEuler(euler);
    } else {
      aerialTarget.lerp(desiredAerialTarget, 0.14);
      aerialSpherical.radius = lerp(aerialSpherical.radius, desiredAerialSpherical.radius, 0.14);
      aerialSpherical.phi = lerp(aerialSpherical.phi, desiredAerialSpherical.phi, 0.14);
      aerialSpherical.theta = lerp(aerialSpherical.theta, desiredAerialSpherical.theta, 0.14);
      const offset = new THREE.Vector3().setFromSpherical(aerialSpherical);
      camera.position.copy(aerialTarget).add(offset);
      camera.lookAt(aerialTarget);
    }
  }

  // Start on the sunlit flagstone walk facing the Villa's open French doors & flower pergola
  teleportWalk(-14.0, 13.8, 0.0, 0.04);

  return {
    update,
    teleportWalk,
    setAerialImmediate,
    walkTo,
    getMode: () => mode,
    getWalkPosition: () => walkPos.clone(),
    wasClickGesture: () => movedPx < 6,
  };
}
