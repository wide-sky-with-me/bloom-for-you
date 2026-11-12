// Smooth damped 3rd-person tabletop diorama camera controller (orbit, pan, zoom, focus)
// Supports mouse left-drag orbit, right/middle/shift-drag pan, wheel zoom, and 1/2-finger touch.

import { THREE } from "./toon-kit.js";

export function createDioramaControls(camera, domElement, opts = {}) {
  const target = (opts.initialTarget || new THREE.Vector3(-0.5, 1.15, 0.2)).clone();
  const desiredTarget = target.clone();

  const initialPos = opts.initialPosition || new THREE.Vector3(21.5, 15.8, 22.5);
  const offset = initialPos.clone().sub(target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  const desiredSpherical = spherical.clone();

  const limits = {
    minRadius: opts.minRadius || 5.8,
    maxRadius: opts.maxRadius || 92.0,
    minPhi: opts.minPhi || 0.20,
    maxPhi: opts.maxPhi || 1.47,
    panBound: opts.panBound || 21.0,
    damping: opts.damping || 0.11,
  };

  let dragMode = null; // "orbit" | "pan" | "pinch"
  let pointerDownPos = { x: 0, y: 0 };
  let lastPointer = { x: 0, y: 0 };
  let movedDistance = 0;
  const activeTouches = new Map();
  let lastPinchDist = 0;
  let lastPinchMid = { x: 0, y: 0 };

  function clampDesired() {
    desiredSpherical.radius = THREE.MathUtils.clamp(
      desiredSpherical.radius,
      limits.minRadius,
      limits.maxRadius
    );
    desiredSpherical.phi = THREE.MathUtils.clamp(
      desiredSpherical.phi,
      limits.minPhi,
      limits.maxPhi
    );
    desiredTarget.x = THREE.MathUtils.clamp(desiredTarget.x, -limits.panBound, limits.panBound);
    desiredTarget.z = THREE.MathUtils.clamp(desiredTarget.z, -limits.panBound, limits.panBound);
    desiredTarget.y = THREE.MathUtils.clamp(desiredTarget.y, -2.2, 6.8);
  }

  function panByPixels(dx, dy) {
    const rect = domElement.getBoundingClientRect();
    const h = Math.max(1, rect.height);
    const fovScale = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    const worldPerPixel = (desiredSpherical.radius * fovScale) / h;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();

    desiredTarget.addScaledVector(right, -dx * worldPerPixel);
    desiredTarget.addScaledVector(up, dy * worldPerPixel);
    clampDesired();
  }

  function onPointerDown(e) {
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    domElement.setPointerCapture?.(e.pointerId);

    if (activeTouches.size === 1) {
      pointerDownPos = { x: e.clientX, y: e.clientY };
      lastPointer = { x: e.clientX, y: e.clientY };
      movedDistance = 0;
      if (e.button === 2 || e.button === 1 || e.shiftKey) {
        dragMode = "pan";
      } else {
        dragMode = "orbit";
      }
    } else if (activeTouches.size === 2) {
      dragMode = "pinch";
      const pts = Array.from(activeTouches.values());
      lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      lastPinchMid = {
        x: (pts[0].x + pts[1].x) * 0.5,
        y: (pts[0].y + pts[1].y) * 0.5,
      };
    }
  }

  function onPointerMove(e) {
    if (!activeTouches.has(e.pointerId)) return;
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (dragMode === "pinch" && activeTouches.size >= 2) {
      const pts = Array.from(activeTouches.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = {
        x: (pts[0].x + pts[1].x) * 0.5,
        y: (pts[0].y + pts[1].y) * 0.5,
      };
      if (lastPinchDist > 8) {
        const scale = lastPinchDist / Math.max(8, dist);
        desiredSpherical.radius *= scale;
      }
      panByPixels(mid.x - lastPinchMid.x, mid.y - lastPinchMid.y);
      movedDistance += Math.hypot(mid.x - lastPinchMid.x, mid.y - lastPinchMid.y);
      lastPinchDist = dist;
      lastPinchMid = mid;
      clampDesired();
      return;
    }

    if (!dragMode) return;
    const dx = e.clientX - lastPointer.x;
    const dy = e.clientY - lastPointer.y;
    lastPointer = { x: e.clientX, y: e.clientY };
    movedDistance += Math.hypot(dx, dy);

    if (dragMode === "orbit") {
      const rect = domElement.getBoundingClientRect();
      const rotSpeed = (Math.PI * 1.85) / Math.max(320, rect.height);
      desiredSpherical.theta -= dx * rotSpeed;
      desiredSpherical.phi -= dy * rotSpeed * 0.85;
      clampDesired();
    } else if (dragMode === "pan") {
      panByPixels(dx, dy);
    }
  }

  function onPointerUp(e) {
    activeTouches.delete(e.pointerId);
    domElement.releasePointerCapture?.(e.pointerId);
    if (activeTouches.size === 0) {
      dragMode = null;
    } else if (activeTouches.size === 1) {
      const remaining = Array.from(activeTouches.values())[0];
      lastPointer = { x: remaining.x, y: remaining.y };
      dragMode = "orbit";
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const zoomFactor = Math.exp(e.deltaY * 0.0011);
    desiredSpherical.radius *= zoomFactor;
    clampDesired();
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  function onKeyDown(e) {
    if (e.key === "r" || e.key === "R") {
      resetView();
    }
  }

  domElement.addEventListener("pointerdown", onPointerDown);
  domElement.addEventListener("pointermove", onPointerMove);
  domElement.addEventListener("pointerup", onPointerUp);
  domElement.addEventListener("pointercancel", onPointerUp);
  domElement.addEventListener("wheel", onWheel, { passive: false });
  domElement.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown);

  function update() {
    clampDesired();
    // Shortest angular interpolation for theta
    let dTheta = desiredSpherical.theta - spherical.theta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2;
    while (dTheta < -Math.PI) dTheta += Math.PI * 2;

    spherical.theta += dTheta * limits.damping;
    spherical.phi += (desiredSpherical.phi - spherical.phi) * limits.damping;
    spherical.radius += (desiredSpherical.radius - spherical.radius) * limits.damping;
    target.lerp(desiredTarget, limits.damping);

    const posOffset = new THREE.Vector3().setFromSpherical(spherical);
    camera.position.copy(target).add(posOffset);
    camera.lookAt(target);
  }

  function focusOn(worldPoint, radius = 12.5, phi = null, theta = null) {
    desiredTarget.copy(worldPoint);
    if (radius !== null && radius !== undefined) desiredSpherical.radius = radius;
    if (phi !== null && phi !== undefined) desiredSpherical.phi = phi;
    if (theta !== null && theta !== undefined) desiredSpherical.theta = theta;
    clampDesired();
  }

  function setPoseImmediate(worldTarget, radius, phi, theta) {
    desiredTarget.copy(worldTarget);
    desiredSpherical.radius = radius;
    desiredSpherical.phi = phi;
    desiredSpherical.theta = theta;
    clampDesired();
    target.copy(desiredTarget);
    spherical.copy(desiredSpherical);
    const posOffset = new THREE.Vector3().setFromSpherical(spherical);
    camera.position.copy(target).add(posOffset);
    camera.lookAt(target);
  }

  function resetView() {
    desiredTarget.copy(opts.initialTarget || new THREE.Vector3(-0.5, 1.15, 0.2));
    const initOff = (opts.initialPosition || new THREE.Vector3(21.5, 15.8, 22.5))
      .clone()
      .sub(desiredTarget);
    desiredSpherical.setFromVector3(initOff);
    clampDesired();
  }

  update();

  return {
    update,
    focusOn,
    setPoseImmediate,
    resetView,
    wasClickDrag: () => movedDistance > 6,
    getPointerDownPos: () => ({ ...pointerDownPos }),
    getState: () => ({
      target: target.toArray(),
      radius: Number(spherical.radius.toFixed(2)),
      phi: Number(spherical.phi.toFixed(3)),
      theta: Number(spherical.theta.toFixed(3)),
    }),
    dispose() {
      domElement.removeEventListener("pointerdown", onPointerDown);
      domElement.removeEventListener("pointermove", onPointerMove);
      domElement.removeEventListener("pointerup", onPointerUp);
      domElement.removeEventListener("pointercancel", onPointerUp);
      domElement.removeEventListener("wheel", onWheel);
      domElement.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
    },
  };
}
