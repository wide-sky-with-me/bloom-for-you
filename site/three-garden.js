import * as THREE from './vendor/three-0.186.1/three.module.js';
import { BouquetPreparation } from './prepare-client.js?v=7';
import { abortError, prepareSync } from './prepare-data.js?v=7';
import { createUniforms, createPetalMaterial, createPointMaterial } from './three-materials.js?v=7';
import { snapshotCPU } from './legacy-garden.js?v=7';

const STRIDE = 11, GPU_STRIDE = 16, CAMERA_DISTANCE = 6.8;
const ramp = (low, high, value) => { const t = Math.max(0, Math.min(1, (value - low) / (high - low))); return t * t * (3 - 2 * t); };
const localGrowth = (progress, delay) => ramp(delay * .24, delay * .24 + .76, progress);
function idlePosition(x, y, z, phase, time) {
  const wind = Math.sin(time * .65 + y * .85) * .032;
  const e = 1 + Math.sin(time * .82 + y * .5) * .012 * Math.max(0, y + 1);
  x *= e; y *= e; x += wind * Math.max(.2, y + 2);
  z += Math.cos(time * .55 + x * 1.3) * .035;
  x += Math.sin(time + phase) * .009; y += Math.cos(time * .7 + phase) * .009;
  const t = Math.max(0, Math.min(1, (phase - 6.13) / .15));
  const wander = t * t * (3 - 2 * t) * Math.pow(.5 + .5 * Math.sin(time * .8 + phase * 30), 4);
  return [x + Math.sin(phase * 9 + time * .6) * .38 * wander, y + .52 * wander, z + Math.cos(phase * 7 + time) * .24 * wander];
}

// No unpacking, recoloring, normal rebuild, or bounds scan on the main thread.
// Every attribute aliases the immutable, Worker-prepared array directly.
export function preparedGeometry(packed, target = packed, indices = null) {
  const geometry = new THREE.BufferGeometry();
  const source = new THREE.InterleavedBuffer(packed, GPU_STRIDE);
  const destination = target === packed ? source : new THREE.InterleavedBuffer(target, GPU_STRIDE);
  for (const [name, offset] of [['aPosition', 0], ['aColor', 4], ['aNormal', 8], ['aBud', 12]]) {
    geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(source, 4, offset));
    geometry.setAttribute(name === 'aPosition' ? 'aTarget' : name.replace('a', 'aTarget'), new THREE.InterleavedBufferAttribute(destination, 4, offset));
  }
  // Standard Three attributes make the geometry usable by real Mesh/Points tools.
  geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(source, 3, 0));
  geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(source, 3, 8));
  geometry.setAttribute('color', new THREE.InterleavedBufferAttribute(source, 3, 4));
  if (indices) geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
  return geometry;
}

export class ThreeGarden {
  constructor(canvas, {reducedMotion = false, onLost = () => {}, onMotionChange = () => {}, context,
    rendererFactory = parameters => new THREE.WebGLRenderer(parameters)} = {}) {
    this.canvas = canvas;
    this.listeners = [];
    this.onMotionChange = onMotionChange;
    this.renderer = rendererFactory({canvas, context, alpha: true, antialias: true,
      powerPreference: 'low-power', preserveDrawingBuffer: false});
    this.gl = this.renderer.getContext();
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .96;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
      this.shaderError = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n');
      this.canvas.dataset.shaderError = this.shaderError;
      this.fail(onLost);
    };
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, .1, 30);
    this.camera.position.z = CAMERA_DISTANCE;
    this.group = new THREE.Group();
    this.group.rotation.order = 'XYZ';
    this.scene.add(this.group);
    // Warm, broad key / cool botanical fill / quiet transmitted rim. No shadow,
    // environment, transmission buffer, bloom, or post-processing render targets.
    this.scene.add(new THREE.HemisphereLight(0xe9e5f4, 0x45323c, .72));
    this.scene.add(new THREE.AmbientLight(0xffffff, .36));
    const light = (color, intensity, xyz) => { const lamp = new THREE.DirectionalLight(color, intensity); lamp.position.set(...xyz); this.scene.add(lamp); };
    light(0xffe2cf, 2.35, [-.65, .85, 1.1]);
    light(0xc0dae0, .85, [.95, .12, -.45]);
    light(0xf5ced7, 1.1, [.4, .45, -.8]);
    this.uniforms = createUniforms();
    this.pointMaterial = createPointMaterial(this.uniforms);
    this.depthMaterial = createPointMaterial(this.uniforms, true);
    this.octBase = 4096;
    this.uintIndices = true; // WebGL2 guarantees uint element indices.
    this.reducedMotion = reducedMotion;
    this.paused = reducedMotion;
    this.focused = true;
    this.visible = !document.hidden;
    this.rotation = [.43, -.15];
    this.targetRotation = [...this.rotation];
    this.pointer = [20, 20];
    this.time = this.elapsed = 0;
    this.mix = this.appearance = this.bloomProgress = this.sourceGrowth = 1;
    this.transitionAt = 0;
    this.raf = this.lastFrame = 0;
    this.surfaceCount = 0;
    this.frameCenter = [0, 0];
    this.canvas.dataset.engine = 'three-webgl2';
    this.canvas.dataset.engineState = 'ready';
    this.canvas.dataset.threeRevision = THREE.REVISION;
    this.canvas.__bloomGarden = this;
    this.resizeObserver = new ResizeObserver(() => { this.resize(); this.requestFrame(); });
    this.resizeObserver.observe(canvas);
    this.listen(canvas, 'webglcontextlost', event => { event.preventDefault(); this.fail(onLost); });
    this.listen(document, 'visibilitychange', () => {
      this.visible = !document.hidden;
      this.stopFrame();
      this.flushPrepared();
      if (this.visible) this.requestFrame();
    });
    this.listen(window, 'blur', () => { this.focused = false; this.stopFrame(); this.flushPrepared(); });
    this.listen(window, 'focus', () => { this.focused = true; this.lastFrame = 0; this.requestFrame(); });
    this.resize();
    this.bindPointer();
  }
  listen(target, name, callback) {
    target.addEventListener(name, callback);
    this.listeners.push([target, name, callback]);
  }
  stopFrame() { cancelAnimationFrame(this.raf); this.raf = this.lastFrame = 0; }
  fail(onLost) {
    if (this.disposed || this.lost) return;
    this.lost = true;
    this.canvas.dataset.engineState = 'lost';
    this.canvas.dataset.rendered = 'false';
    this.cancelPreparation();
    this.preparation?.dispose();
    this.stopFrame();
    onLost();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.8);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    this.aspect = Math.max(1, Math.round(rect.width * this.dpr)) / Math.max(1, Math.round(rect.height * this.dpr));
    this.camera.aspect = this.aspect;
  }
  prepareBouquet(key, input) {
    if (this.disposed || this.lost) return Promise.reject(abortError());
    this.preparation ||= new BouquetPreparation({octBase: this.octBase, uintIndices: this.uintIndices});
    return this.preparation.prepare(key, input);
  }
  cancelPreparation() {
    this.preparation?.cancel();
    if (this.pendingPrepared) { this.pendingPrepared.reject(abortError()); this.pendingPrepared = null; }
  }
  queuePrepared(prepared, immediate = false, onWaiting = () => {}) {
    if (this.disposed || this.lost) return Promise.reject(abortError());
    if (prepared.octBase !== this.octBase || prepared.uintIndices !== this.uintIndices)
      return Promise.reject(new Error('Prepared GPU layout mismatch'));
    if (this.pendingPrepared) this.pendingPrepared.reject(abortError());
    return new Promise((resolve, reject) => {
      this.pendingPrepared = {prepared, immediate, resolve, reject};
      if (!this.flushPrepared()) onWaiting();
    });
  }
  flushPrepared() {
    const pending = this.pendingPrepared;
    if (!pending) return false;
    const staticSelection = this.paused || this.reducedMotion || !this.focused || !this.visible;
    if (this.mix < 1 && !staticSelection && !pending.immediate) return false;
    this.pendingPrepared = null;
    try { this.commitPrepared(pending.prepared, pending.immediate || staticSelection); pending.resolve(true); }
    catch (error) { pending.reject(error); }
    return true;
  }
  removeMesh(mesh) {
    if (!mesh) return;
    this.group.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose();
  }
  createMesh(mesh) {
    if (!mesh) return null;
    const uniforms = {...this.uniforms, uSurface: {value: 1}, uTargetGrowth: {value: 1}};
    const material = createPetalMaterial(uniforms);
    material.alphaHash = true;
    const object = new THREE.Mesh(preparedGeometry(mesh.packed, mesh.packed, mesh.indices), material);
    object.name = 'bouquet-petal-surface';
    object.frustumCulled = false;
    object.userData.uniforms = uniforms;
    this.group.add(object);
    return object;
  }
  commitPrepared(prepared, immediate = false) {
    if (this.disposed || this.lost) throw abortError();
    if (prepared.octBase !== this.octBase || prepared.uintIndices !== this.uintIndices) throw new Error('Prepared GPU layout mismatch');
    const source = this.preparedCurrent, first = !this.data;
    const direct = first || !source || immediate || this.paused || this.reducedMotion || this.data.length !== prepared.particles.length;
    const previousFrame = this.projectionState, sourceProgress = this.bloomProgress;
    this.removeMesh(this.outgoingMesh);
    if (direct) this.removeMesh(this.mesh);
    this.outgoingMesh = direct ? null : this.mesh;
    this.mesh = this.createMesh(prepared.mesh);
    if (this.points) { this.group.remove(this.points, this.depthPoints); this.points.geometry.dispose(); }
    const geometry = preparedGeometry(direct ? prepared.packed : source.packed, prepared.packed);
    this.points = new THREE.Points(geometry, this.pointMaterial);
    this.depthPoints = new THREE.Points(geometry, this.depthMaterial);
    this.points.name = 'bouquet-fine-points';
    this.depthPoints.name = 'bouquet-point-depth-core';
    this.points.frustumCulled = this.depthPoints.frustumCulled = false;
    this.points.renderOrder = 2;
    this.depthPoints.renderOrder = 1;
    this.group.add(this.points, this.depthPoints);
    this.preparedCurrent = prepared;
    this.data = direct ? prepared.particles : source.particles;
    this.targetData = prepared.particles;
    this.gpuData = direct ? prepared.packed : source.packed;
    this.gpuTargetData = prepared.packed;
    this.hasGrowth = !!prepared.growth;
    this.growth = prepared.growth;
    this.sourceGrowthAt = direct ? 1 : sourceProgress;
    this.mix = direct ? 1 : 0;
    this.appearance = 1;
    this.transitionAt = this.elapsed - (direct ? 1.6 : 0);
    this.growthCycle = this.hasGrowth && !this.paused && !this.reducedMotion && (first || !direct)
      ? {at: this.elapsed, from: 0, close: first ? 0 : 1.6, duration: first ? 4.8 : 4} : null;
    const mesh = prepared.mesh;
    this.surfacePacked = mesh?.packed ?? null;
    this.surfaceIndices = mesh?.indices ?? null;
    this.surfaceSupportPoints = mesh?.support ?? null;
    this.surfaceGrowthIndices = mesh?.projectionIndices ?? null;
    this.surfaceCount = mesh?.indices.length ?? 0;
    this.outgoingSurface = !direct && source.mesh ? {packed: source.mesh.packed, indices: source.mesh.indices,
      projectionIndices: source.mesh.projectionIndices, opaque: true} : null;
    this.count = prepared.particles.length / STRIDE;
    this.projectionIndices = [...new Set([...(direct ? [] : source.projectionIndices), ...prepared.projectionIndices])];
    this.growthProjectionIndices = prepared.growthProjectionIndices
      ? [...new Set([...(direct ? [] : source.growthProjectionIndices ?? []), ...prepared.growthProjectionIndices])] : null;
    this.framingAnchor = null;
    this.updateGrowth();
    if (!direct && previousFrame) {
      const start = this.measureProjection(previousFrame.yaw, previousFrame.pitch);
      this.framingAnchor = {scale: previousFrame.focal / start.focal,
        center: previousFrame.center.map((value, axis) => value - start.center[axis])};
    }
    this.lastFrame = 0;
    this.requestFrame();
  }
  // These CPU-only algorithms are invoked exclusively by the explicitly
  // synchronous API. Neither frame nor prepare/queue/commit reaches a full scan.
  sampleGrowthProjection(packed, indices = null) {
    return snapshotCPU.sampleGrowthProjection.call(this, packed, indices);
  }
  captureSurface() { return snapshotCPU.captureSurface.call(this); }
  snapshotVisible(withGrowth) {
    const particles = new Float32Array(this.data.length);
    for (let i = 0; i < particles.length; i++) particles[i] = this.data[i] * (1 - this.mix) + this.targetData[i] * this.mix;
    const packed = withGrowth
      ? snapshotCPU.freezePacked(this.gpuData, this.gpuTargetData, this.mix, this.sourceGrowth, this.bloomProgress, this.octBase)
      : snapshotCPU.packRecords(particles, null, STRIDE, this.octBase);
    // Keep the raw phase contract independently of the GPU-frozen flower pose.
    for (let i = 0, j = 7; i < packed.length; i += GPU_STRIDE, j += STRIDE) packed[i + 7] = particles[j];
    this.projectionCache ||= new WeakMap();
    const projectionIndices = snapshotCPU.sampleProjection.call(this, particles);
    const growthProjectionIndices = withGrowth ? new Set([
      ...projectionIndices.map(i => i / STRIDE * GPU_STRIDE), ...this.sampleGrowthProjection(packed)]) : null;
    if (growthProjectionIndices) for (let i = 0; i < packed.length; i += GPU_STRIDE) if (packed[i + 7] > 6.13) growthProjectionIndices.add(i);
    let mesh = this.captureSurface();
    if (mesh) {
      const vertices = new Float32Array(mesh.packed.length / GPU_STRIDE * 9);
      for (let i = 0, j = 0; i < mesh.packed.length; i += GPU_STRIDE, j += 9) {
        vertices.set(mesh.packed.subarray(i, i + 3), j);
        vertices.set(mesh.packed.subarray(i + 4, i + 7), j + 3);
        vertices.set(mesh.packed.subarray(i + 8, i + 11), j + 6);
      }
      mesh.support = snapshotCPU.sampleSurfaceSupport.call(this, vertices, mesh.indices);
    }
    return {particles, packed, mesh, projectionIndices,
      growthProjectionIndices: growthProjectionIndices ? [...growthProjectionIndices] : null,
      growth: this.growth, octBase: this.octBase, uintIndices: this.uintIndices};
  }
  // Explicit synchronous compatibility API: preserve the visible intermediate
  // point/normal/closed pose and composite mesh instead of jumping to canonical.
  // Production loading always takes the asynchronous Worker-prepared path.
  setBouquet(data, immediate = false, surface = null, growth = null) {
    if (this.disposed || this.lost) return;
    // Validate the entire target before cancelling or mutating the current image.
    const prepared = prepareSync({particles: data, surface, growth}, {octBase: this.octBase, uintIndices: true});
    this.cancelPreparation();
    const direct = !this.data || this.data.length !== data.length || immediate || this.reducedMotion || this.paused;
    if (!direct) {
      const snapshot = this.snapshotVisible(!!growth || this.hasGrowth);
      this.removeMesh(this.outgoingMesh); this.removeMesh(this.mesh);
      this.outgoingMesh = this.outgoingSurface = null;
      this.mesh = this.createMesh(snapshot.mesh);
      this.preparedCurrent = snapshot;
      this.bloomProgress = 1;
    }
    this.commitPrepared(prepared, immediate);
  }
  updateGrowth() {
    const cycle = this.growthCycle;
    this.bloomProgress = 1;
    if (this.hasGrowth && cycle && !this.reducedMotion) {
      const age = Math.max(0, this.elapsed - cycle.at);
      this.bloomProgress = age < cycle.close ? cycle.from * (1 - ramp(0, cycle.close, age)) : ramp(0, cycle.duration, age - cycle.close);
    }
    this.sourceGrowth = this.hasGrowth ? (this.sourceGrowthAt ?? 1) * (1 - ramp(0, .8, this.elapsed - this.transitionAt)) : 1;
    this.canvas.dataset.bloomProgress = String(this.bloomProgress);
  }
  surfaceVisibility() {
    if (!this.surfaceCount) return 0;
    if (this.hasGrowth) return this.appearance * (this.outgoingSurface ? this.mix : 1);
    return ramp(.6, 1, this.appearance) * ramp(.86, 1, this.mix);
  }
  // The historical camera fit: same support sets, closed/open envelope and
  // transition anchoring. CPU cost is bounded by prepared supports, not vertices.
  measureProjection(yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const extend = (position, phase) => {
      const p = idlePosition(...position, phase, this.time), x = p[0] * cy + p[2] * sy, z = -p[0] * sy + p[2] * cy;
      const y = p[1] * cx - z * sx, depth = Math.max(.2, CAMERA_DISTANCE - (p[1] * sx + z * cx));
      minX = Math.min(minX, x / depth); maxX = Math.max(maxX, x / depth);
      minY = Math.min(minY, y / depth); maxY = Math.max(maxY, y / depth);
    };
    const bounds = () => [minX, maxX, minY, maxY];
    const blend = (old, weight) => { minX = old[0] + (minX - old[0]) * weight; maxX = old[1] + (maxX - old[1]) * weight;
      minY = old[2] + (minY - old[2]) * weight; maxY = old[3] + (maxY - old[3]) * weight; };
    for (const i of this.projectionIndices) extend([0, 1, 2].map(axis => this.data[i + axis] + (this.targetData[i + axis] - this.data[i + axis]) * this.mix), this.data[i + 7]);
    const weight = ramp(.005, 1, this.surfaceVisibility());
    if (weight > 0 && this.surfaceSupportPoints) {
      const old = bounds();
      for (let i = 0; i < this.surfaceSupportPoints.length; i += 3) extend(this.surfaceSupportPoints.subarray(i, i + 3), 0);
      blend(old, weight);
    }
    if (this.hasGrowth && this.growthProjectionIndices) {
      const pose = (packed, i, progress) => { const g = localGrowth(progress, packed[i + 15]);
        return [0, 1, 2].map(axis => packed[i + 12 + axis] * (1 - g) + packed[i + axis] * g); };
      for (const i of this.growthProjectionIndices) {
        const a = pose(this.gpuData, i, this.sourceGrowth), b = pose(this.gpuTargetData, i, this.bloomProgress);
        extend(a.map((value, axis) => value * (1 - this.mix) + b[axis] * this.mix), this.gpuData[i + 7]);
      }
      for (const [packed, samples, progress, alpha] of [
        [this.surfacePacked, this.surfaceGrowthIndices, this.bloomProgress, this.surfaceVisibility()],
        [this.outgoingSurface?.packed, this.outgoingSurface?.projectionIndices, this.sourceGrowth, this.outgoingSurface ? this.appearance * (1 - this.mix) : 0]]) {
        if (!packed || !samples || alpha <= .005) continue;
        const old = bounds();
        for (const i of samples) extend(pose(packed, i, progress), 0);
        blend(old, ramp(.005, .18, alpha));
      }
    }
    return {center: [(minX + maxX) / 2, (minY + maxY) / 2],
      focal: Math.min(1.62 / Math.max(.001, maxY - minY), 1.7 * this.aspect / Math.max(.001, maxX - minX))};
  }
  fitProjection(yaw, pitch) {
    const frame = this.measureProjection(yaw, pitch);
    if (this.framingAnchor) {
      frame.focal *= 1 + (this.framingAnchor.scale - 1) * (1 - this.mix);
      frame.center = frame.center.map((value, axis) => value + this.framingAnchor.center[axis] * (1 - this.mix));
    }
    this.frameCenter = frame.center;
    this.projectionState = {...frame, yaw, pitch};
    return frame.focal;
  }
  requestFrame() {
    if (!this.raf && this.visible && !this.lost && !this.disposed) this.raf = requestAnimationFrame(now => this.frame(now));
  }
  frame(now) {
    this.raf = 0;
    if (!this.data || this.lost || this.disposed || !this.visible) return;
    const dt = this.lastFrame ? Math.max(0, (now - this.lastFrame) / 1000) : .016;
    this.lastFrame = now;
    if (!this.paused && this.focused) { this.elapsed += dt; this.time += dt; }
    this.mix = ramp(0, 1.6, this.elapsed - this.transitionAt);
    if (this.reducedMotion) this.mix = 1;
    this.updateGrowth();
    if (this.mix >= 1 && this.outgoingSurface) {
      this.removeMesh(this.outgoingMesh); this.outgoingMesh = this.outgoingSurface = null;
    }
    this.flushPrepared();
    const ease = this.reducedMotion ? 1 : Math.min(1, dt * 7);
    for (let axis = 0; axis < 2; axis++) this.rotation[axis] += (this.targetRotation[axis] - this.rotation[axis]) * ease;
    const yaw = this.rotation[0] + Math.sin(this.time * .12) * .16;
    const pitch = this.rotation[1] + Math.sin(this.time * .09) * .035;
    const focal = this.fitProjection(yaw, pitch);
    // R_x(pitch) * R_y(yaw), exactly as the old GPU rotate().
    this.group.rotation.set(pitch, yaw, 0, 'XYZ');
    this.camera.fov = 2 * Math.atan(1 / focal) * 180 / Math.PI;
    this.camera.updateProjectionMatrix();
    // Off-axis perspective recenters projected extents without translating the
    // flower/camera (which would change parallax and the .98 fit contract).
    this.camera.projectionMatrix.elements[8] = this.frameCenter[0] * focal / this.aspect;
    this.camera.projectionMatrix.elements[9] = this.frameCenter[1] * focal;
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    const u = this.uniforms;
    for (const [key, value] of Object.entries({uTime: this.time, uMix: this.mix, uSourceGrowth: this.sourceGrowth,
      uTargetGrowth: this.bloomProgress, uOctBase: this.octBase, uFocal: focal, uDpr: this.dpr,
      uPointScale: this.canvas.height * focal * .014 / (2 * CAMERA_DISTANCE)})) u[key].value = value;
    u.uRotation.value.set(yaw, pitch); u.uFrameCenter.value.set(...this.frameCenter);
    this.surfaceOpacity = this.surfaceVisibility();
    u.uPointAlpha.value = 1 - Math.max(this.surfaceOpacity, this.outgoingSurface ? 1 - this.mix : 0) * .42;
    for (const [mesh, alpha, progress] of [[this.mesh, this.surfaceOpacity, this.bloomProgress],
      [this.outgoingMesh, this.outgoingSurface ? 1 - this.mix : 0, this.sourceGrowth]]) {
      if (!mesh) continue;
      mesh.visible = alpha > .005;
      mesh.material.opacity = alpha;
      mesh.userData.uniforms.uTargetGrowth.value = progress;
    }
    this.renderer.render(this.scene, this.camera);
    if (this.lost) return;
    this.canvas.dataset.rendered = 'true';
    this.canvas.dataset.mixProgress = String(this.mix);
    this.renderSerial = (this.renderSerial ?? 0) + 1;
    this.lastRender = {serial: this.renderSerial, time: this.time, elapsed: this.elapsed,
      mix: this.mix, growth: this.bloomProgress, sourceGrowth: this.sourceGrowth};
    this.canvas.dataset.meshCount = String(Number(!!this.mesh?.visible) + Number(!!this.outgoingMesh?.visible));
    this.canvas.dataset.depth = 'mesh-and-points';
    const rotating = Math.abs(this.rotation[0] - this.targetRotation[0]) + Math.abs(this.rotation[1] - this.targetRotation[1]) > .001;
    if (this.focused && (!this.paused || rotating)) this.requestFrame(); else this.lastFrame = 0;
  }
  get diagnostics() {
    const meshes = [this.mesh, this.outgoingMesh].filter(mesh => mesh?.visible);
    return {engine: 'three-webgl2', threeVersion: '0.186.1', threeRevision: THREE.REVISION,
      scene: this.scene.isScene, camera: this.camera.type, renderer: 'WebGLRenderer',
      webglRenderer: this.renderer.isWebGLRenderer === true,
      rendered: this.canvas.dataset.rendered === 'true', lastRender: this.lastRender ?? null,
      pointCount: this.count ?? 0, meshCount: meshes.length,
      triangles: meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0),
      depth: {mesh: meshes.every(mesh => mesh.material.depthTest && mesh.material.depthWrite),
        points: this.depthMaterial.depthTest && this.depthMaterial.depthWrite && !this.depthMaterial.colorWrite,
        pointColor: this.pointMaterial.depthTest && !this.pointMaterial.depthWrite},
      material: this.mesh?.material.type ?? null, sheen: this.mesh?.material.sheen ?? 0,
      colorSpace: this.renderer.outputColorSpace, toneMapping: this.renderer.toneMapping,
      postProcessing: false, elapsed: this.elapsed, time: this.time, growth: this.bloomProgress,
      sourceGrowth: this.sourceGrowth, mix: this.mix, paused: this.paused, reducedMotion: this.reducedMotion,
      focused: this.focused, visible: this.visible, lost: !!this.lost, disposed: !!this.disposed,
      shaderError: this.shaderError ?? null, frame: this.projectionState ?? null,
      cacheSize: this.preparation?.cache.size ?? 0, pending: !!this.pendingPrepared,
      calls: this.renderer.info.render.calls, geometries: this.renderer.info.memory.geometries};
  }
  bloom() {
    if (this.reducedMotion || this.lost || this.disposed) return;
    this.setPaused(false);
    if (this.hasGrowth) this.growthCycle = {at: this.elapsed, from: this.bloomProgress, close: .8, duration: 4.2};
    this.updateGrowth(); this.requestFrame();
  }
  setPaused(value) { this.paused = value; this.flushPrepared(); this.lastFrame = 0; this.onMotionChange(value); this.requestFrame(); }
  setReducedMotion(value) {
    this.reducedMotion = value; this.appearance = 1;
    if (value) { this.growthCycle = null; this.mix = 1; this.transitionAt = this.elapsed - 1.6; }
    this.updateGrowth(); this.setPaused(value);
  }
  bindPointer() {
    let origin = null;
    this.listen(this.canvas, 'pointerdown', event => {
      if (!event.isPrimary) return;
      origin = {x: event.clientX, y: event.clientY, rotation: [...this.targetRotation], moved: false, id: event.pointerId};
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.listen(this.canvas, 'pointermove', event => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer = [((event.clientX - rect.left) / rect.width * 2 - 1) * this.aspect, 1 - (event.clientY - rect.top) / rect.height * 2];
      if (origin && origin.id === event.pointerId) {
        const dx = event.clientX - origin.x, dy = event.clientY - origin.y;
        origin.moved ||= Math.hypot(dx, dy) > 8;
        this.targetRotation[0] = origin.rotation[0] + dx * .006;
        this.targetRotation[1] = Math.max(-.65, Math.min(.65, origin.rotation[1] + dy * .004));
      }
      this.requestFrame();
    });
    const release = event => { if (origin && origin.id === event.pointerId && !origin.moved && event.type === 'pointerup') this.bloom(); origin = null; };
    this.listen(this.canvas, 'pointerup', release); this.listen(this.canvas, 'pointercancel', release);
    this.listen(this.canvas, 'lostpointercapture', () => { origin = null; });
    this.listen(this.canvas, 'pointerleave', () => { this.pointer = [20, 20]; this.requestFrame(); });
    this.listen(this.canvas, 'keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) return;
      event.preventDefault();
      if (event.key === ' ') this.bloom();
      if (event.key === 'ArrowLeft') this.targetRotation[0] -= .15;
      if (event.key === 'ArrowRight') this.targetRotation[0] += .15;
      if (event.key === 'ArrowUp') this.targetRotation[1] = Math.max(-.65, this.targetRotation[1] - .1);
      if (event.key === 'ArrowDown') this.targetRotation[1] = Math.min(.65, this.targetRotation[1] + .1);
      this.requestFrame();
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.stopFrame(); this.cancelPreparation(); this.preparation?.dispose();
    this.resizeObserver.disconnect();
    for (const [target, name, callback] of this.listeners) target.removeEventListener(name, callback);
    this.listeners = [];
    this.removeMesh(this.mesh); this.removeMesh(this.outgoingMesh);
    if (this.points) { this.group.remove(this.points, this.depthPoints); this.points.geometry.dispose(); }
    this.pointMaterial.dispose(); this.depthMaterial.dispose();
    this.renderer.dispose();
    this.scene.clear();
    this.mesh = this.outgoingMesh = this.points = this.depthPoints = null;
    this.data = this.targetData = this.gpuData = this.gpuTargetData = this.preparedCurrent = null;
    this.surfacePacked = this.surfaceIndices = this.surfaceSupportPoints = this.outgoingSurface = this.growth = null;
    this.canvas.dataset.engineState = 'disposed';
    if (this.canvas.__bloomGarden === this) delete this.canvas.__bloomGarden;
  }
}
