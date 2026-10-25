// Isolated prototype CPU/lifecycle tests. Real Three objects, fake GPU boundary.
// These do NOT claim the production v6 point-core or any real-GL visual acceptance.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const studyRoot = process.env.BLOOM_STUDY_SITE_URL
  ? new URL(process.env.BLOOM_STUDY_SITE_URL) : new URL('../studies/natural_garden/site/', import.meta.url);
// The Python wrapper supplies an independent, byte-identical copied engine.
// A direct Node run can inspect current engine source without copying/writing it.
const engineRoot = process.env.BLOOM_STUDY_SITE_URL ? new URL('engine/', studyRoot) : new URL('../site/', import.meta.url);
const file = (root, name) => readFile(new URL(name, root), 'utf8');
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const coreURL = url(await file(engineRoot, 'vendor/three-0.186.1/three.core.js'));
const threeURL = url((await file(engineRoot, 'vendor/three-0.186.1/three.module.js')).replaceAll("'./three.core.js'", JSON.stringify(coreURL)));
const THREE = await import(threeURL);
globalThis[Symbol.for('bloom.natural.garden.test')] = THREE;
const binding = "const THREE = globalThis[Symbol.for('bloom.natural.garden.test')];";
const engineImport = "import * as THREE from './vendor/three-0.186.1/three.module.js';";
const studyImport = "import * as THREE from './engine/vendor/three-0.186.1/three.module.js';";
const prepareURL = url(await file(engineRoot, 'prepare-data.js'));
const clientURL = url((await file(engineRoot, 'prepare-client.js')).replace(/\.\/prepare-data\.js\?v=\d+/g, prepareURL));
const materialURL = url((await file(engineRoot, 'three-materials.js')).replace(engineImport, binding));
const legacyURL = url((await file(engineRoot, 'legacy-garden.js'))
  .replace(/\.\/prepare-client\.js\?v=\d+/g, clientURL).replace(/\.\/prepare-data\.js\?v=\d+/g, prepareURL));
const gardenURL = url((await file(engineRoot, 'three-garden.js')).replace(engineImport, binding)
  .replace(/\.\/prepare-client\.js\?v=\d+/g, clientURL).replace(/\.\/prepare-data\.js\?v=\d+/g, prepareURL)
  .replace(/\.\/three-materials\.js\?v=\d+/g, materialURL).replace(/\.\/legacy-garden\.js\?v=\d+/g, legacyURL));
const studyMaterialSource = await file(studyRoot, 'study-materials.js');
const studyMaterialURL = url(studyMaterialSource.replace(studyImport, binding).replace('./engine/three-materials.js', materialURL));
const studySource = await file(studyRoot, 'study-garden.js');
const studyURL = url(studySource.replace('./engine/three-garden.js', gardenURL)
  .replace('./engine/three-materials.js', materialURL).replace('./study-materials.js', studyMaterialURL));
const {ThreeGarden} = await import(gardenURL);
const {StudyGarden} = await import(studyURL);
const {createBotanicalMaterial} = await import(studyMaterialURL);
const {createUniforms} = await import(materialURL);
const {prepareSync} = await import(prepareURL);

function events(extra = {}) {
  const map = new Map();
  return Object.assign(extra, {
    addEventListener(name, cb) { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(cb); },
    removeEventListener(name, cb) { map.get(name)?.delete(cb); },
    emit(name, event = {}) { for (const cb of map.get(name) ?? []) cb({type: name, ...event}); },
    listenerCount() { return [...map.values()].reduce((n, set) => n + set.size, 0); },
  });
}
function input(offset = 0) {
  const points = [[-.6 + offset, -.8, .1], [.7 + offset, 1.3, .2], [-.4 + offset, 1.1, -.1]];
  const particles = new Float32Array(points.flatMap(p => [...p, .96, .86, .67, 1, .7, 0, 0, 1]));
  const vertices = new Float32Array(points.flatMap(p => [...p, .96, .86, .67, 0, 0, 1]));
  const poses = new Float32Array(points.flatMap((p, i) => [p[0] * .3, p[1] * .8, p[2] - .1, 0, .6, .8, i * .2]));
  return {particles, surface: {vertices, indices: new Uint32Array([0, 1, 2])}, growth: {points: poses, vertices: poses.slice()}};
}
const prepare = value => prepareSync(value, {octBase: 4096, uintIndices: true});
function rig(options = {}) {
  const queue = new Map(), renders = [];
  let next = 0;
  const document = events({hidden: false}), window = events({devicePixelRatio: 1.5});
  const canvas = events({dataset: {}, width: 0, height: 0, setPointerCapture() {},
    getBoundingClientRect: () => ({width: 520, height: 600, left: 0, top: 0})});
  globalThis.document = document; globalThis.window = window;
  globalThis.ResizeObserver = class { observe() {} disconnect() { this.disconnected = true; } };
  globalThis.requestAnimationFrame = callback => { assert.equal(queue.size, 0, 'one RAF only'); queue.set(++next, callback); return next; };
  globalThis.cancelAnimationFrame = id => queue.delete(id);
  const renderer = {isWebGLRenderer: true, debug: {}, info: {render: {calls: 0}, memory: {geometries: 0}},
    getContext: () => ({}), setClearColor() {}, setPixelRatio(dpr) { this.dpr = dpr; },
    setSize(w, h, style) { assert.equal(style, false); canvas.width = Math.floor(w * this.dpr); canvas.height = Math.floor(h * this.dpr); },
    render(scene, camera) {
      scene.updateMatrixWorld(); camera.updateMatrixWorld();
      const drawn = [];
      scene.traverse(object => { if ((object.isMesh || object.isPoints) && object.visible) drawn.push(object); });
      drawn.sort((a, b) => a.renderOrder - b.renderOrder);
      this.info.render.calls = drawn.length; this.info.memory.geometries = new Set(drawn.map(o => o.geometry)).size;
      renders.push(drawn.map(o => ({object: o, name: o.name, type: o.type, order: o.renderOrder,
        colorWrite: o.material.colorWrite, depthWrite: o.material.depthWrite, depthTest: o.material.depthTest})));
    }, dispose() { this.disposed = true; }};
  const garden = new StudyGarden(canvas, {...options, rendererFactory: () => renderer});
  return {garden, canvas, document, window, renderer, queue, renders,
    step(now = 1000) { assert.equal(queue.size, 1); const [id, cb] = queue.entries().next().value; queue.delete(id); cb(now); },
    close() { garden.dispose(); assert.equal(queue.size, 0); }};
}
function state(garden) {
  return {elapsed: garden.elapsed, time: garden.time, bloomProgress: garden.bloomProgress,
    sourceGrowth: garden.sourceGrowth, mix: garden.mix, paused: garden.paused,
    reducedMotion: garden.reducedMotion, prepared: garden.preparedCurrent, rotation: [...garden.rotation]};
}
const lightState = garden => garden.scene.children.filter(o => o.isLight)
  .map(o => ({type: o.type, color: o.color.toArray(), ground: o.groundColor?.toArray(), intensity: o.intensity}));
function patched(material) {
  const shader = {vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {}};
  material.onBeforeCompile(shader);
  return shader;
}

test('study is an independent subclass with relative copied-engine imports and unchanged inherited protocols', () => {
  assert.equal(Object.getPrototypeOf(StudyGarden.prototype), ThreeGarden.prototype);
  for (const name of ['prepareBouquet', 'queuePrepared', 'cancelPreparation', 'setBouquet', 'bloom', 'setPaused', 'setReducedMotion'])
    assert.equal(StudyGarden.prototype[name], ThreeGarden.prototype[name], name);
  assert.match(studySource, /from '\.\/engine\/three-garden.js'/);
  assert.match(studySource, /from '\.\/engine\/three-materials.js'/);
  assert.match(studyMaterialSource, /from '\.\/engine\/vendor\/three-0.186.1\/three.module.js'/);
  assert.doesNotMatch(studySource, /\.\.\/.*site\//);
  assert.throws(() => new StudyGarden(null, {styleMode: 'unknown'}), /styleMode/);
  assert.throws(() => new StudyGarden(null, {pointLayers: {core: 1}}), /boolean/);
});

test('botanical defaults to actual opaque Mesh-only ownership, not an invisible point-core mask', () => {
  const r = rig({reducedMotion: true}), g = r.garden;
  g.commitPrepared(prepare(input()), true); r.step();
  assert.equal(g.styleMode, 'botanical'); assert.deepEqual(g.pointLayers, {core: false, grain: false});
  assert.ok(g.mesh instanceof THREE.Mesh); assert.ok(g.mesh.material instanceof THREE.MeshPhysicalMaterial);
  assert.equal(g.mesh.renderOrder, 0); assert.equal(g.mesh.material.transparent, false);
  assert.ok(g.mesh.material.depthWrite && g.mesh.material.depthTest);
  assert.equal(g.points.visible, false); assert.equal(g.depthPoints.visible, false);
  assert.deepEqual(r.renders.at(-1).map(o => o.type), ['Mesh']);
  assert.equal(r.canvas.dataset.engine, 'three-webgl2'); assert.equal(r.canvas.dataset.studyPrototype, 'true');
  assert.equal(r.canvas.dataset.depth, 'mesh-only-study');
  assert.equal(g.diagnostics.study.depthOwner, 'surface');
  assert.equal(g.diagnostics.study.oldPointCoreContract, 'not-claimed-prototype');
  assert.deepEqual(g.diagnostics.study.lastRender, {...g.lastRender, styleMode: 'botanical', core: false, grain: false});
  r.close();
});

test('v6 restores baseline physical material, exact lights and both point passes; each pass can be isolated', () => {
  const r = rig({styleMode: 'v6', reducedMotion: true}), g = r.garden;
  const baselineLights = lightState(g);
  g.commitPrepared(prepare(input()), true); r.step();
  assert.equal(g.mesh.material.name, 'petal-soft-physical');
  assert.deepEqual(r.renders.at(-1).map(o => o.order), [0, 1, 2]);
  assert.deepEqual(r.renders.at(-1).map(o => [o.colorWrite, o.depthWrite, o.depthTest]), [[true, true, true], [false, true, true], [true, false, true]]);
  g.setPointLayers({core: false}); r.step();
  assert.deepEqual(r.renders.at(-1).map(o => o.type), ['Mesh', 'Points']);
  assert.equal(r.renders.at(-1)[1].depthWrite, false);
  g.setPointLayers({core: true, grain: false}); r.step();
  assert.equal(r.renders.at(-1)[1].colorWrite, false);
  g.setLook('botanical'); r.step(); assert.notDeepEqual(lightState(g), baselineLights);
  assert.deepEqual(g.pointLayers, {core: false, grain: false});
  g.setStyleMode('v6'); r.step(); assert.deepEqual(lightState(g), baselineLights);
  assert.equal(g.mesh.material.roughness, .79); assert.equal(g.mesh.material.sheen, .28);
  assert.equal(g.mesh.material.specularIntensity, .22); assert.equal(g.renderer.toneMappingExposure, .96);
  assert.deepEqual(g.pointLayers, {core: true, grain: true});
  const before = g.pointLayers;
  assert.throws(() => g.setPointLayers({mist: true}), /core\/grain/); assert.deepEqual(g.pointLayers, before);
  assert.throws(() => g.setStyleMode('wrong'), /styleMode/); assert.equal(g.styleMode, 'v6');
  r.close();
});

test('botanical material uses GPU growth/normals with no positional stripes or pretend veins; dithering stays controlled', () => {
  const uniforms = createUniforms(), material = createBotanicalMaterial(uniforms), shader = patched(material);
  assert.ok(material.roughness >= .85); assert.ok(material.specularIntensity <= .12);
  assert.ok(material.sheen > 0 && material.sheen < .2); assert.equal(material.clearcoat, 0); assert.equal(material.transmission, 0);
  assert.equal(material.dithering, true); assert.equal(material.userData.study.ditheringMatchesV6, true);
  assert.equal(material.userData.study.veins, false); assert.equal(material.userData.study.pigmentPattern, 'vertex-pigment-only');
  assert.equal(shader.uniforms.uTime, uniforms.uTime); assert.equal(shader.uniforms.uTargetGrowth, uniforms.uTargetGrowth);
  assert.match(shader.vertexShader, /vColor = vec4\(bloomPigment\(\), aPosition.w\)/);
  assert.match(shader.vertexShader, /objectNormal = bloomIdleNormal\(studyRest, bloomNormal\(\)\)/);
  assert.match(shader.vertexShader, /vPosition = studyRest/);
  assert.match(shader.fragmentShader, /diffuseColor.a < .999/);
  assert.match(shader.fragmentShader, /#include <normal_fragment_begin>/);
  assert.doesNotMatch(shader.fragmentShader, /vBloomPosition|sin\s*\(/);
  // The standard physical shader declares conditionally disabled sampler2D
  // uniforms. Check our patch and actual bound maps, not those stock declarations.
  assert.doesNotMatch(studyMaterialSource, /texture2D|sampler2D/);
  for (const key of ['map', 'normalMap', 'bumpMap', 'roughnessMap', 'specularColorMap', 'sheenColorMap']) assert.equal(material[key], null, key);
  material.dispose();
});

test('style changes keep geometry/prepared/cache/clocks and release replaced materials exactly once', () => {
  const r = rig({reducedMotion: true}), g = r.garden;
  const prepared = prepare(input()); g.commitPrepared(prepared, true); r.step();
  const geometry = g.mesh.geometry, points = g.points.geometry;
  const packed = prepared.packed.slice(), meshPacked = prepared.mesh.packed.slice();
  const previous = state(g);
  g.snapshotVisible = g.sampleGrowthProjection = () => { throw new Error('look must not scan/prepare/freeze vertices'); };
  geometry.computeBoundingSphere = geometry.computeVertexNormals = () => { throw new Error('no geometry rebuild'); };
  for (const mode of ['v6', 'botanical', 'v6', 'botanical']) {
    const old = g.mesh.material; let disposals = 0; old.addEventListener('dispose', () => disposals++);
    assert.equal(g.setStyleMode(mode), g); assert.equal(disposals, 1);
    assert.deepEqual(state(g), previous); assert.equal(g.mesh.geometry, geometry); assert.equal(g.points.geometry, points);
    assert.equal(g.points.geometry, g.depthPoints.geometry);
    assert.deepEqual(prepared.packed, packed); assert.deepEqual(prepared.mesh.packed, meshPacked);
    r.step(); assert.deepEqual(state(g), previous);
  }
  r.close();
});

test('queued selection committed inside a base frame has no one-frame point leak and styles both morph meshes', async () => {
  const r = rig(), g = r.garden;
  const a = prepare(input()), b = prepare(input(.2)), c = prepare(input(.4)), d = prepare(input(.6));
  g.commitPrepared(a, true); r.step(1000); await g.queuePrepared(b); r.step(1100);
  const replaced = g.queuePrepared(c).then(() => null, e => e);
  const pending = g.queuePrepared(d);
  assert.equal((await replaced).name, 'AbortError');
  g.setStyleMode('v6'); assert.equal(g.mesh.material.name, 'petal-soft-physical'); assert.equal(g.outgoingMesh.material.name, 'petal-soft-physical');
  g.setStyleMode('botanical');
  assert.equal(g.mesh.material.name, 'natural-garden-matte-petal'); assert.equal(g.outgoingMesh.material.name, 'natural-garden-matte-petal');
  r.step(4000); assert.equal(await pending, true); assert.equal(g.preparedCurrent, d);
  assert.ok(r.renders.at(-1).every(o => o.type === 'Mesh'), 'pending flush must obey study mode on that render');
  assert.equal(g.depthPoints.visible, false); assert.equal(g.points.visible, false);
  assert.equal(g.mesh.userData.uniforms.uTargetGrowth.value, g.bloomProgress);
  r.close();
});

test('growth, pause, blur, hidden, reduced motion and mode toggles retain base lifecycle semantics', () => {
  const r = rig(), g = r.garden;
  g.commitPrepared(prepare(input()), true); r.step(1000); r.step(2400);
  assert.ok(g.bloomProgress > 0 && g.bloomProgress < 1);
  assert.equal(g.mesh.userData.uniforms.uTargetGrowth.value, g.bloomProgress);
  const clock = g.elapsed; g.setPaused(true); g.setStyleMode('v6'); r.step(9999);
  assert.equal(g.elapsed, clock); assert.equal(r.queue.size, 0);
  g.setStyleMode('botanical'); r.step(19999); assert.equal(g.elapsed, clock);
  g.setPaused(false); r.step(30000); assert.ok(g.elapsed - clock < .02);
  r.window.emit('blur'); const blur = g.elapsed; g.setStyleMode('v6'); r.step(90000); assert.equal(g.elapsed, blur);
  r.window.emit('focus'); r.step(100000); assert.ok(g.elapsed - blur < .02);
  r.document.hidden = true; r.document.emit('visibilitychange'); const hidden = g.elapsed;
  g.setStyleMode('botanical'); assert.equal(r.queue.size, 0);
  r.document.hidden = false; r.document.emit('visibilitychange'); r.step(200000); assert.ok(g.elapsed - hidden < .02);
  g.setReducedMotion(true); r.step(300000); assert.equal(g.bloomProgress, 1); assert.equal(g.mix, 1); assert.equal(r.queue.size, 0);
  g.bloom(); assert.equal(r.queue.size, 0); r.close();
});

test('preparation remains asynchronous, LRU bounded, cancel/dispose owned; no extra study listeners/resources leak', async () => {
  let lost = 0; const r = rig({reducedMotion: true, onLost: () => lost++}), g = r.garden;
  const promise = g.prepareBouquet('first', input()); assert.equal(g.data, undefined);
  const prepared = await promise;
  for (let i = 0; i < 5; i++) await g.prepareBouquet(String(i), input(i * .01));
  assert.equal(g.preparation.cache.size, 4);
  const aborted = g.prepareBouquet('abort', input()); g.cancelPreparation(); await assert.rejects(aborted, {name: 'AbortError'});
  await g.queuePrepared(prepared, true); r.step();
  const geometry = g.mesh.geometry, pointGeometry = g.points.geometry, material = g.mesh.material;
  let geometryCount = 0, pointsCount = 0, materialCount = 0;
  geometry.addEventListener('dispose', () => geometryCount++); pointGeometry.addEventListener('dispose', () => pointsCount++); material.addEventListener('dispose', () => materialCount++);
  r.canvas.emit('webglcontextlost', {preventDefault() {}}); assert.equal(lost, 1); assert.equal(r.queue.size, 0);
  const mode = g.styleMode; g.setStyleMode('v6'); assert.equal(g.styleMode, mode);
  await assert.rejects(g.prepareBouquet('lost', input()), {name: 'AbortError'});
  g.dispose(); g.dispose(); assert.equal(geometryCount, 1); assert.equal(pointsCount, 1); assert.equal(materialCount, 1);
  assert.equal(g.preparation.cache.size, 0); assert.equal(g._v6Lights.length, 0);
  assert.equal(r.canvas.listenerCount(), 0); assert.equal(r.document.listenerCount(), 0); assert.equal(r.window.listenerCount(), 0);
  assert.equal(r.renderer.disposed, true); assert.equal(r.canvas.__bloomGarden, undefined);
  g.setLook('v6'); g.setPointLayers({core: true}); assert.equal(r.queue.size, 0);
});

test('missing continuous surface is diagnosed rather than falsely claiming point cores own botanical depth', () => {
  const r = rig({reducedMotion: true}), g = r.garden, value = input();
  value.surface = null; value.growth = null;
  g.commitPrepared(prepare(value), true); r.step();
  assert.equal(r.renders.at(-1).length, 0); assert.equal(g.diagnostics.study.missingSurface, true);
  assert.equal(g.diagnostics.study.depthOwner, 'none'); assert.equal(r.canvas.dataset.depth, 'no-mesh-depth-study');
  g.setStyleMode('v6'); r.step(); assert.equal(r.renders.at(-1).length, 2);
  r.close();
});
