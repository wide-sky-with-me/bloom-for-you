// Decision: .agents/notes/proposed/floral-style/2026-10-25-natural-garden-release.md
import { ThreeGarden } from './three-garden.js?v=7';
import { createPetalMaterial } from './three-materials.js?v=7';
import { createBotanicalMaterial } from './botanical-materials.js?v=7';

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

// Production modern renderer. Continuous petals own depth by default; the v6
// point layers remain available for programmatic diagnostics, not gallery UI.
export class BotanicalGarden extends ThreeGarden {
  constructor(canvas, options = {}) {
    const {styleMode = 'botanical', pointLayers, ...baseOptions} = options;
    validMode(styleMode);
    if (pointLayers !== undefined) layerPatch(pointLayers);
    super(canvas, baseOptions);
    this._v6Lights = this.scene.children.filter(object => object.isLight).map(light => ({
      light, color: light.color.clone(), groundColor: light.groundColor?.clone(), intensity: light.intensity,
    }));
    this._v6Exposure = this.renderer.toneMappingExposure;
    // Clear retired labels if an existing canvas is reused by an embedding app.
    for (const key of ['studyPrototype', 'studyMode', 'studyPointCore', 'studyPointGrain',
      'studyRenderedMode', 'studyRenderedCore', 'studyRenderedGrain']) delete canvas.dataset[key];
    this.setStyleMode(styleMode);
    if (pointLayers !== undefined) this.setPointLayers(pointLayers);
  }
  get styleMode() { return this._styleMode; }
  get pointLayers() { return {...this._pointLayers}; }
  get pointOnlyCompatibility() { return this.styleMode === 'botanical' && !!this.data && !this.preparedCurrent?.mesh; }
  get style() { return this.styleMode === 'v6' ? 'v6-debug' : this.pointOnlyCompatibility ? 'point-only-compatibility' : 'natural-garden'; }
  setStyleMode(mode) {
    validMode(mode);
    if (this.disposed || this.lost) return this;
    this._styleMode = mode;
    this._pointLayers = {core: mode === 'v6', grain: mode === 'v6'};
    this.applyLighting();
    this.applyMeshStyle(this.mesh);
    this.applyMeshStyle(this.outgoingMesh);
    this.applyPointLayers();
    this.requestFrame();
    return this;
  }
  setLook(mode) { return this.setStyleMode(mode); }
  setPointLayers(patch) {
    layerPatch(patch);
    if (this.disposed || this.lost) return this;
    this._pointLayers = {...this._pointLayers, ...patch};
    this.applyPointLayers(); this.requestFrame();
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
        const colors = [0xfff8ec, 0xf4f7f6, 0xfffaef], intensities = [2.0, .82, .62];
        light.color.set(colors[directional] ?? 0xffffff);
        light.intensity = intensities[directional++] ?? original.intensity;
      }
    }
    this.renderer.toneMappingExposure = this._v6Exposure;
  }
  applyMeshStyle(mesh) {
    if (!mesh) return;
    const mode = this.styleMode ?? 'botanical';
    if ((mesh.userData.botanicalStyle ?? 'v6') === mode) return;
    const old = mesh.material;
    const material = mode === 'botanical'
      ? createBotanicalMaterial(mesh.userData.uniforms) : createPetalMaterial(mesh.userData.uniforms);
    material.opacity = old.opacity; material.alphaHash = old.alphaHash;
    mesh.material = material; mesh.userData.botanicalStyle = mode;
    old.dispose();
  }
  applyPointLayers() {
    // Keep the historical point-only synchronous call usable without presenting
    // it as mesh rendering. Normal gallery/close-up inputs always include a mesh.
    const layers = this.pointOnlyCompatibility ? {core: true, grain: true}
      : this._pointLayers ?? {core: false, grain: false};
    if (this.depthPoints) this.depthPoints.visible = layers.core;
    if (this.points) this.points.visible = layers.grain;
    this.canvas.dataset.style = this.style;
    this.canvas.dataset.pointCore = String(layers.core);
    this.canvas.dataset.pointGrain = String(layers.grain);
  }
  createMesh(preparedMesh) {
    const mesh = super.createMesh(preparedMesh);
    if (mesh) { mesh.renderOrder = 0; this.applyMeshStyle(mesh); }
    return mesh;
  }
  commitPrepared(prepared, immediate = false) {
    super.commitPrepared(prepared, immediate);
    // Immediate selections (including the first 16k close-up) land fully open,
    // without changing the user's pause preference or the reusable engine clock.
    if (immediate) { this.growthCycle = null; this.updateGrowth(); }
    this.applyPointLayers();
  }
  frame(now) {
    const previousSerial = this.lastRender?.serial;
    super.frame(now);
    if (!this.lastRender || this.lastRender.serial === previousSerial) return;
    const core = !!this.depthPoints?.visible, grain = !!this.points?.visible;
    const surface = [this.mesh, this.outgoingMesh].some(mesh => mesh?.visible);
    this.lastStyleRender = {...this.lastRender, style: this.style, styleMode: this.styleMode, core, grain};
    this.canvas.dataset.renderedStyle = this.style;
    this.canvas.dataset.renderedPointCore = String(core);
    this.canvas.dataset.renderedPointGrain = String(grain);
    this.canvas.dataset.depth = surface ? (core ? 'mesh-and-point-core' : 'mesh') : (core ? 'point-core' : 'none');
  }
  get diagnostics() {
    const base = super.diagnostics;
    const core = !!this.depthPoints?.visible, grain = !!this.points?.visible;
    const surface = [this.mesh, this.outgoingMesh].some(mesh => mesh?.visible && mesh.material.depthWrite);
    return {...base, style: this.style,
      depth: {mesh: surface, points: core && base.depth.points, pointColor: grain && base.depth.pointColor},
      renderedPointCount: core || grain ? this.count ?? 0 : 0,
      naturalGarden: {styleMode: this.styleMode, pointLayers: this.pointLayers,
        enabledLayers: {surface, core, grain},
        depthOwner: surface ? (core ? 'mesh-and-point-core' : 'mesh') : (core ? 'point-core' : 'none'),
        pointOnlyCompatibility: this.pointOnlyCompatibility,
        veins: false, proceduralPigment: this.styleMode === 'v6' ? 'v6-position-modulation' : false,
        lastRender: this.lastStyleRender ?? null},
    };
  }
  dispose() {
    if (this.disposed) return;
    super.dispose(); this._v6Lights = []; this.lastStyleRender = null;
  }
}
