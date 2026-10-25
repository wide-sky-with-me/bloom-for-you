import { ThreeGarden } from './engine/three-garden.js';
import { createPetalMaterial } from './engine/three-materials.js';
import { createBotanicalMaterial } from './study-materials.js';

const MODES = new Set(['botanical', 'v6']);
function validMode(mode) {
  if (!MODES.has(mode)) throw new TypeError('styleMode must be botanical or v6');
  return mode;
}
function layerPatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('pointLayers must be an object');
  for (const [key, enabled] of Object.entries(value)) {
    if (!['core', 'grain'].includes(key) || typeof enabled !== 'boolean') throw new TypeError('pointLayers accepts boolean core/grain only');
  }
  return value;
}

// An isolated artistic prototype, NOT a change to the v6 production renderer or
// its point-core acceptance contract. The copied engine stays byte-for-byte intact.
export class StudyGarden extends ThreeGarden {
  constructor(canvas, options = {}) {
    const {styleMode = 'botanical', pointLayers, ...baseOptions} = options;
    validMode(styleMode);
    if (pointLayers !== undefined) layerPatch(pointLayers);
    super(canvas, baseOptions);
    this._v6Lights = this.scene.children.filter(object => object.isLight).map(light => ({
      light, color: light.color.clone(), groundColor: light.groundColor?.clone(), intensity: light.intensity,
    }));
    this._v6Exposure = this.renderer.toneMappingExposure;
    this.canvas.dataset.studyPrototype = 'true';
    this.setStyleMode(styleMode);
    if (pointLayers !== undefined) this.setPointLayers(pointLayers);
  }
  get styleMode() { return this._styleMode; }
  get pointLayers() { return {...this._pointLayers}; }
  setStyleMode(mode) {
    validMode(mode);
    if (this.disposed || this.lost) return this;
    this._styleMode = mode;
    // A mode switch resets the two experimental layer switches to that mode's
    // documented preset. setPointLayers can then isolate either point pass.
    this._pointLayers = {core: mode === 'v6', grain: mode === 'v6'};
    this.applyLighting();
    this.applyMeshStyle(this.mesh);
    this.applyMeshStyle(this.outgoingMesh);
    this.applyPointLayers();
    this.canvas.dataset.studyMode = mode;
    this.requestFrame();
    return this;
  }
  setLook(mode) { return this.setStyleMode(mode); }
  setPointLayers(patch) {
    layerPatch(patch);
    if (this.disposed || this.lost) return this;
    this._pointLayers = {...this._pointLayers, ...patch};
    this.applyPointLayers();
    this.requestFrame();
    return this;
  }
  applyLighting() {
    let directional = 0;
    for (const original of this._v6Lights ?? []) {
      const light = original.light;
      if (this.styleMode === 'v6') {
        light.color.copy(original.color);
        if (original.groundColor) light.groundColor.copy(original.groundColor);
        light.intensity = original.intensity;
      } else if (light.isHemisphereLight) {
        light.color.set(0xf5f5f2); light.groundColor.set(0x5a5c55); light.intensity = .76;
      } else if (light.isAmbientLight) {
        light.color.set(0xffffff); light.intensity = .30;
      } else if (light.isDirectionalLight) {
        const colors = [0xfff8ec, 0xf4f7f6, 0xfffaef];
        const intensities = [2.0, .82, .62];
        light.color.set(colors[directional] ?? 0xffffff);
        light.intensity = intensities[directional++] ?? original.intensity;
      }
    }
    // Keep output transfer and tone-mapping exposure the same for both modes.
    this.renderer.toneMappingExposure = this._v6Exposure;
  }
  applyMeshStyle(mesh) {
    if (!mesh) return;
    const mode = this.styleMode ?? 'botanical';
    if ((mesh.userData.studyStyle ?? 'v6') === mode) return;
    const old = mesh.material;
    const material = mode === 'botanical'
      ? createBotanicalMaterial(mesh.userData.uniforms) : createPetalMaterial(mesh.userData.uniforms);
    material.opacity = old.opacity;
    material.alphaHash = old.alphaHash;
    mesh.material = material;
    mesh.userData.studyStyle = mode;
    // Only a constant number of materials changes; geometry and prepared arrays
    // are not cloned, recolored, rescanned, or re-uploaded by a look change.
    old.dispose();
  }
  applyPointLayers() {
    const layers = this._pointLayers ?? {core: false, grain: false};
    if (this.depthPoints) this.depthPoints.visible = layers.core;
    if (this.points) this.points.visible = layers.grain;
    this.canvas.dataset.studyPointCore = String(layers.core);
    this.canvas.dataset.studyPointGrain = String(layers.grain);
  }
  createMesh(preparedMesh) {
    const mesh = super.createMesh(preparedMesh);
    if (mesh) { mesh.renderOrder = 0; this.applyMeshStyle(mesh); }
    return mesh;
  }
  commitPrepared(prepared, immediate = false) {
    super.commitPrepared(prepared, immediate);
    // Also runs when the base frame flushes a pending selection. Newly created
    // Points must be hidden BEFORE that same frame renders, not one RAF later.
    this.applyPointLayers();
  }
  frame(now) {
    const previousSerial = this.lastRender?.serial;
    super.frame(now);
    if (!this.lastRender || this.lastRender.serial === previousSerial) return;
    const core = !!this.depthPoints?.visible, grain = !!this.points?.visible;
    this.lastStudyRender = {...this.lastRender, styleMode: this.styleMode, core, grain};
    this.canvas.dataset.studyRenderedMode = this.styleMode;
    this.canvas.dataset.studyRenderedCore = String(core);
    this.canvas.dataset.studyRenderedGrain = String(grain);
    const surface = [this.mesh, this.outgoingMesh].some(mesh => mesh?.visible);
    this.canvas.dataset.depth = !surface && !core ? 'no-mesh-depth-study'
      : core ? 'mesh-and-point-core' : grain ? 'mesh-with-grain-overlay' : 'mesh-only-study';
  }
  get diagnostics() {
    const base = super.diagnostics;
    const core = !!this.depthPoints?.visible, grain = !!this.points?.visible;
    const surface = [this.mesh, this.outgoingMesh].some(mesh => mesh?.visible && mesh.material.depthWrite);
    return {...base, study: {
      prototype: true, styleMode: this.styleMode, pointLayers: this.pointLayers,
      enabledLayers: {surface, core, grain},
      depthOwner: surface ? (core ? 'surface-and-point-core' : 'surface') : (core ? 'point-core' : 'none'),
      oldPointCoreContract: 'not-claimed-prototype',
      missingSurface: !this.mesh && !this.outgoingMesh,
      veins: false, proceduralPigment: this.styleMode === 'v6' ? 'v6-position-modulation' : false,
      ditheringMatchesV6: true,
      lastRender: this.lastStudyRender ?? null,
    }};
  }
  dispose() {
    if (this.disposed) return;
    super.dispose();
    this._v6Lights = [];
    this.lastStudyRender = null;
  }
}
