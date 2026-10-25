// Production botanical CPU/lifecycle contracts: real Three classes/materials,
// only the GPU boundary is injected. Real GL/image acceptance belongs to the Lead.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const site = process.env.BLOOM_BOTANICAL_SITE_URL ? new URL(process.env.BLOOM_BOTANICAL_SITE_URL) : new URL('../site/', import.meta.url);
const file = name => readFile(new URL(name, site), 'utf8');
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const coreURL = url(await file('vendor/three-0.186.1/three.core.js'));
const threeURL = url((await file('vendor/three-0.186.1/three.module.js')).replaceAll("'./three.core.js'", JSON.stringify(coreURL)));
const THREE = await import(threeURL);
globalThis[Symbol.for('bloom.botanical.test')] = THREE;
const binding = "const THREE = globalThis[Symbol.for('bloom.botanical.test')];";
const threeImport = "import * as THREE from './vendor/three-0.186.1/three.module.js';";
const prepareURL = url(await file('prepare-data.js'));
const clientURL = url((await file('prepare-client.js')).replace(/\.\/prepare-data\.js\?v=\d+/g, prepareURL));
const materialURL = url((await file('three-materials.js')).replace(threeImport, binding));
const legacyURL = url((await file('legacy-garden.js')).replace(/\.\/prepare-client\.js\?v=\d+/g, clientURL).replace(/\.\/prepare-data\.js\?v=\d+/g, prepareURL));
const gardenURL = url((await file('three-garden.js')).replace(threeImport, binding)
  .replace(/\.\/prepare-client\.js\?v=\d+/g, clientURL).replace(/\.\/prepare-data\.js\?v=\d+/g, prepareURL)
  .replace(/\.\/three-materials\.js\?v=\d+/g, materialURL).replace(/\.\/legacy-garden\.js\?v=\d+/g, legacyURL));
const botanicalMaterialSource = await file('botanical-materials.js');
const botanicalMaterialURL = url(botanicalMaterialSource.replace(threeImport, binding).replace(/\.\/three-materials\.js\?v=\d+/g, materialURL));
const botanicalSource = await file('botanical-garden.js');
const botanicalURL = url(botanicalSource.replace(/\.\/three-garden\.js\?v=\d+/g, gardenURL)
  .replace(/\.\/three-materials\.js\?v=\d+/g, materialURL).replace(/\.\/botanical-materials\.js\?v=\d+/g, botanicalMaterialURL));
const facadeURL = url((await file('particles.js')).replace(/\.\/botanical-garden\.js\?v=\d+/g, botanicalURL)
  .replace(/\.\/three-garden\.js\?v=\d+/g, gardenURL).replace(/\.\/legacy-garden\.js\?v=\d+/g, legacyURL));
const {BotanicalGarden} = await import(botanicalURL);
const {ThreeGarden} = await import(gardenURL);
const {ParticleGarden, LegacyGarden} = await import(facadeURL);
const {snapshotCPU} = await import(legacyURL);
const {createBotanicalMaterial} = await import(botanicalMaterialURL);
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
function input(count = 3, offset = 0) {
  const positions = [[-.6 + offset, -.8, .1], [.7 + offset, 1.3, .2], [-.4 + offset, 1.1, -.1]];
  const particles = new Float32Array(count * 11), points = new Float32Array(count * 7);
  for (let i = 0; i < count; i++) {
    const p = positions[i % 3];
    particles.set([...p, .96, .86, .67, 1, .7, 0, 0, 1], i * 11);
    points.set([p[0] * .3, p[1] * .8, p[2] - .1, 0, .6, .8, (i % 3) * .2], i * 7);
  }
  return {particles, surface: {vertices: new Float32Array(positions.flatMap(p => [...p, .96, .86, .67, 0, 0, 1])), indices: new Uint32Array([0, 1, 2])},
    growth: {points, vertices: points.slice(0, 21)}};
}
const prepare = value => prepareSync(value, {octBase: 4096, uintIndices: true});
function rig(options = {}) {
  const queue = new Map(), renders = [], contextRequests = [];
  let next = 0;
  const document = events({hidden: false}), window = events({devicePixelRatio: 2.5});
  const attributes = new Map();
  const nativeGL = new Proxy({getShaderPrecisionFormat: () => ({precision: 23}), getExtension: () => ({}),
    createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}), getShaderParameter: () => true, getProgramParameter: () => true,
    getAttribLocation(_p, name) { if (!attributes.has(name)) attributes.set(name, attributes.size); return attributes.get(name); },
    getUniformLocation: (_p, name) => name,
  }, {get(object, key) { return key in object ? object[key] : /^[A-Z_]+$/.test(key) ? key : () => {}; }});
  const canvas = events({dataset: {studyPrototype: 'true', studyMode: 'botanical', studyRenderedMode: 'botanical'}, width: 0, height: 0, setPointerCapture() {},
    getBoundingClientRect: () => ({width: 520, height: 600, left: 0, top: 0}),
    getContext(name, parameters) { contextRequests.push({name, parameters}); return name === 'webgl2' ? (options.webgl2 === false ? null : {}) : nativeGL; }});
  globalThis.document = document; globalThis.window = window;
  globalThis.ResizeObserver = class { observe() {} disconnect() { this.disconnected = true; } };
  globalThis.requestAnimationFrame = cb => { assert.equal(queue.size, 0, 'one RAF only'); queue.set(++next, cb); return next; };
  globalThis.cancelAnimationFrame = id => queue.delete(id);
  const renderer = {isWebGLRenderer: true, debug: {}, info: {render: {calls: 0}, memory: {geometries: 0}},
    getContext: () => ({}), setClearColor() {}, setPixelRatio(dpr) { this.dpr = dpr; },
    setSize(w, h, style) { assert.equal(style, false); canvas.width = Math.floor(w * this.dpr); canvas.height = Math.floor(h * this.dpr); },
    render(scene, camera) {
      scene.updateMatrixWorld(); camera.updateMatrixWorld();
      const objects = []; scene.traverse(o => { if ((o.isMesh || o.isPoints) && o.visible) objects.push(o); });
      objects.sort((a, b) => a.renderOrder - b.renderOrder);
      this.info.render.calls = objects.length; this.info.memory.geometries = new Set(objects.map(o => o.geometry)).size;
      renders.push(objects.map(o => ({object: o, type: o.type, order: o.renderOrder, material: o.material,
        colorWrite: o.material.colorWrite, depthWrite: o.material.depthWrite, depthTest: o.material.depthTest})));
    }, dispose() { this.disposed = true; }};
  const Garden = options.direct ? BotanicalGarden : ParticleGarden;
  const garden = new Garden(canvas, {...options, rendererFactory: parameters => { assert.equal(parameters.preserveDrawingBuffer, false); return renderer; }});
  return {garden, canvas, document, window, renderer, queue, renders, contextRequests,
    step(now = 1000) { assert.equal(queue.size, 1); const [id, cb] = queue.entries().next().value; queue.delete(id); cb(now); },
    close() { garden.dispose(); assert.equal(queue.size, 0); }};
}
const lights = g => g.scene.children.filter(o => o.isLight).map(o => ({type: o.type, color: o.color.toArray(), ground: o.groundColor?.toArray(), intensity: o.intensity}));
function state(g) { return {elapsed: g.elapsed, time: g.time, mix: g.mix, growth: g.bloomProgress, paused: g.paused, prepared: g.preparedCurrent}; }

test('production facade defaults to actual BotanicalGarden / Three / Mesh-only depth with clean diagnostics', () => {
  const r = rig({reducedMotion: true}), g = r.garden;
  assert.ok(g instanceof BotanicalGarden); assert.ok(g instanceof ThreeGarden); assert.ok(!(g instanceof LegacyGarden));
  g.commitPrepared(prepare(input()), true); r.step();
  assert.equal(r.canvas.dataset.style, 'natural-garden'); assert.equal(r.canvas.dataset.renderedStyle, 'natural-garden');
  assert.equal(r.canvas.dataset.engine, 'three-webgl2'); assert.equal(r.canvas.dataset.depth, 'mesh');
  assert.ok(g.scene instanceof THREE.Scene); assert.ok(g.camera instanceof THREE.PerspectiveCamera); assert.ok(g.mesh.material instanceof THREE.MeshPhysicalMaterial);
  assert.deepEqual(r.renders.at(-1).map(o => o.type), ['Mesh']); assert.equal(g.mesh.material.depthWrite, true);
  assert.equal(g.depthPoints.visible, false); assert.equal(g.points.visible, false);
  assert.deepEqual(g.diagnostics.depth, {mesh: true, points: false, pointColor: false}); assert.equal(g.diagnostics.renderedPointCount, 0);
  assert.equal(g.diagnostics.naturalGarden.depthOwner, 'mesh');
  assert.doesNotMatch(JSON.stringify(g.diagnostics), /prototype|not-claimed|study/i);
  assert.ok(!Object.keys(r.canvas.dataset).some(key => key.startsWith('study')));
  assert.equal(g.renderer.outputColorSpace, THREE.SRGBColorSpace); assert.equal(g.renderer.toneMapping, THREE.ACESFilmicToneMapping); assert.equal(g.dpr, 1.8);
  assert.equal(r.contextRequests[0].parameters.preserveDrawingBuffer, false); r.close();
});

test('WebGL1 remains explicit legacy and a Three failure never silently changes engine', () => {
  const r = rig({webgl2: false, reducedMotion: true});
  assert.ok(r.garden instanceof LegacyGarden); assert.equal(r.canvas.dataset.style, 'legacy-webgl1'); assert.equal(r.canvas.dataset.engine, 'legacy-webgl1');
  assert.ok(!Object.keys(r.canvas.dataset).some(key => key.startsWith('study'))); r.close();
  const calls = [];
  assert.throws(() => new ParticleGarden({getContext(name) { calls.push(name); return {}; }}, {rendererFactory() { throw new Error('Three failed'); }}), /Three failed/);
  assert.deepEqual(calls, ['webgl2']);
});

test('all local renderer and Worker module queries consistently use v7; no dependency on frozen study', async () => {
  for (const name of ['particles.js', 'botanical-garden.js', 'botanical-materials.js', 'three-garden.js', 'three-materials.js', 'legacy-garden.js', 'prepare-client.js', 'prepare-data.js', 'prepare-worker.js']) {
    const source = await file(name);
    for (const match of source.matchAll(/\.\/[\w./-]+\.js\?v=(\d+)/g)) assert.equal(match[1], '7', `${name}: ${match[0]}`);
    assert.doesNotMatch(source, /from ['"][^'"]*(?:studies|engine)\//, name);
  }
  assert.equal(BotanicalGarden.prototype.prepareBouquet, ThreeGarden.prototype.prepareBouquet);
  assert.equal(BotanicalGarden.prototype.queuePrepared, ThreeGarden.prototype.queuePrepared);
  assert.equal(BotanicalGarden.prototype.setBouquet, ThreeGarden.prototype.setBouquet);
});

test('immediate queue lands fully open without changing paused preference, including first 16k and 120k count changes', async () => {
  const r = rig(), g = r.garden;
  const closeup = prepare(input(16000)), bouquet = prepare(input(120000));
  for (const [prepared, count] of [[closeup, 16000], [bouquet, 120000], [closeup, 16000]]) {
    const paused = g.paused;
    await g.queuePrepared(prepared, true);
    assert.equal(g.paused, paused); assert.equal(g.count, count); assert.equal(g.bloomProgress, 1); assert.equal(g.growthCycle, null);
    r.step(); assert.equal(g.mesh.userData.uniforms.uTargetGrowth.value, 1); assert.equal(g.points.visible, false);
    assert.equal(g.outgoingMesh, null); assert.equal(g.diagnostics.pointCount, count); assert.equal(g.diagnostics.renderedPointCount, 0);
  }
  g.setPaused(true); if (r.queue.size) r.step();
  await g.queuePrepared(bouquet, true); assert.equal(g.paused, true); r.step(); assert.equal(g.bloomProgress, 1);
  r.close();
});

test('non-immediate growth and replay retain GPU normals/clock with no point overlays', () => {
  const r = rig(), g = r.garden;
  g.commitPrepared(prepare(input()), false); r.step(1000); r.step(2200);
  assert.ok(g.bloomProgress > 0 && g.bloomProgress < 1); assert.equal(g.mesh.userData.uniforms.uTargetGrowth.value, g.bloomProgress);
  g.commitPrepared(prepare(input()), true); r.step(2300); assert.equal(g.bloomProgress, 1);
  g.bloom(); r.step(2400); r.step(2800); assert.ok(g.bloomProgress < 1); assert.equal(g.paused, false);
  assert.ok(r.renders.at(-1).every(o => o.type === 'Mesh')); r.close();
});

test('accepted matte shader retains GPU opening, Jacobian normals, linear colors, double-sided light without fake texture', () => {
  const uniforms = createUniforms(), m = createBotanicalMaterial(uniforms);
  const shader = {vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {}};
  m.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uTime, uniforms.uTime); assert.equal(shader.uniforms.uTargetGrowth, uniforms.uTargetGrowth);
  assert.match(shader.vertexShader, /objectNormal = bloomIdleNormal\(botanicalRest, bloomNormal\(\)\)/);
  assert.match(shader.vertexShader, /vColor = vec4\(bloomPigment\(\), aPosition.w\)/); assert.match(shader.vertexShader, /vPosition = botanicalRest/);
  assert.match(shader.fragmentShader, /diffuseColor.a < .999/); assert.doesNotMatch(shader.fragmentShader, /vBloomPosition|sin\s*\(/);
  assert.equal(m.roughness, .88); assert.equal(m.specularIntensity, .10); assert.equal(m.sheen, .12); assert.equal(m.side, THREE.DoubleSide);
  assert.equal(m.clearcoat, 0); assert.equal(m.transmission, 0); assert.equal(m.dithering, true);
  for (const key of ['map', 'normalMap', 'bumpMap', 'roughnessMap', 'specularColorMap']) assert.equal(m[key], null);
  assert.equal(m.userData.botanical.style, 'natural-garden'); assert.equal(m.userData.botanical.veins, false); assert.equal(m.userData.study, undefined); m.dispose();
});

test('programmatic v6 A/B restores exact lights and isolates point layers without geometry scans or clock resets', () => {
  const r = rig({styleMode: 'v6', reducedMotion: true}), g = r.garden;
  const baseline = lights(g), prepared = prepare(input()); g.commitPrepared(prepared, true); r.step();
  assert.deepEqual(r.renders.at(-1).map(o => o.order), [0, 1, 2]);
  assert.deepEqual(r.renders.at(-1).map(o => [o.colorWrite, o.depthWrite]), [[true, true], [false, true], [true, false]]);
  g.setPointLayers({core: false, grain: false}); r.step(); assert.deepEqual(r.renders.at(-1).map(o => o.type), ['Mesh']);
  g.setPointLayers({grain: true}); r.step(); assert.equal(r.renders.at(-1)[1].depthWrite, false);
  g.setPointLayers({core: true, grain: false}); r.step(); assert.equal(r.renders.at(-1)[1].colorWrite, false);
  const geometry = g.mesh.geometry, points = g.points.geometry, previous = state(g);
  g.snapshotVisible = g.sampleGrowthProjection = () => { throw new Error('look must not scan'); };
  geometry.computeBoundingSphere = geometry.computeVertexNormals = () => { throw new Error('no geometry rebuild'); };
  g.setLook('botanical'); assert.deepEqual(state(g), previous); r.step(); assert.notDeepEqual(lights(g), baseline);
  g.setStyleMode('v6'); r.step(); assert.deepEqual(lights(g), baseline); assert.equal(g.mesh.geometry, geometry); assert.equal(g.points.geometry, points);
  assert.deepEqual(g.pointLayers, {core: true, grain: true}); assert.equal(g.diagnostics.style, 'v6-debug');
  assert.throws(() => g.setStyleMode('unknown'), /styleMode/); assert.throws(() => g.setPointLayers({mist: true}), /core\/grain/); r.close();
});

test('canonical latest-only queue stays bounded and obeys Mesh-only style in the same frame it flushes', async () => {
  const r = rig(), g = r.garden;
  const a = prepare(input()), b = prepare(input(3, .2)), c = prepare(input(3, .4)), d = prepare(input(3, .6));
  g.snapshotVisible = g.sampleGrowthProjection = () => { throw new Error('async path must not scan/freeze'); };
  g.commitPrepared(a, true); r.step(1000); await g.queuePrepared(b); r.step(1100);
  const old = g.queuePrepared(c).then(() => null, e => e); const pending = g.queuePrepared(d);
  assert.equal((await old).name, 'AbortError'); assert.equal(g.preparedCurrent, b);
  assert.ok(g.group.children.filter(o => o.isMesh).length <= 2);
  r.step(4000); assert.equal(await pending, true); assert.equal(g.preparedCurrent, d);
  assert.ok(g.group.children.filter(o => o.isMesh).length <= 2); assert.ok(r.renders.at(-1).every(o => o.type === 'Mesh'));
  g.setPaused(true); await g.queuePrepared(a); assert.equal(g.paused, true); assert.equal(g.outgoingMesh, null); r.step(); r.close();
});

test('synchronous mid-morph API keeps exact visible position/normal/closed data and composite surface', () => {
  const r = rig(), g = r.garden, a = input(), b = input(3, .8), c = input(3, -.4);
  g.setBouquet(a.particles, true, a.surface, a.growth); r.step(1000);
  g.setBouquet(b.particles, false, b.surface, b.growth); r.step(1100); r.step(1700);
  const frozen = snapshotCPU.freezePacked(g.gpuData, g.gpuTargetData, g.mix, g.sourceGrowth, g.bloomProgress, g.octBase);
  const surface = g.captureSurface();
  g.setBouquet(c.particles, false, c.surface, c.growth);
  assert.deepEqual(g.gpuData, frozen); assert.deepEqual(g.outgoingSurface.packed, surface.packed); assert.deepEqual(g.outgoingSurface.indices, surface.indices);
  assert.equal(g.sourceGrowth, 1); assert.equal(g.mix, 0); assert.equal(g.outgoingMesh.material.name, 'natural-garden-matte-petal'); r.close();
});

test('pause/blur/hidden/reduced clocks, asynchronous LRU and disposal remain owned by the inherited lifecycle', async () => {
  let lost = 0; const r = rig({onLost: () => lost++}), g = r.garden;
  const prepared = await g.prepareBouquet('first', input());
  for (let i = 0; i < 6; i++) await g.prepareBouquet(String(i), input(3, i * .01));
  assert.equal(g.preparation.cache.size, 4);
  await g.queuePrepared(prepared, true); r.step(1000); const clock = g.elapsed;
  g.setPaused(true); r.step(9999); assert.equal(g.elapsed, clock);
  g.setPaused(false); r.step(20000); assert.ok(g.elapsed - clock < .02);
  r.window.emit('blur'); const blur = g.elapsed; g.setLook('v6'); r.step(90000); assert.equal(g.elapsed, blur);
  r.window.emit('focus'); r.step(100000); assert.ok(g.elapsed - blur < .02);
  r.document.hidden = true; r.document.emit('visibilitychange'); const hidden = g.elapsed;
  g.setLook('botanical'); assert.equal(r.queue.size, 0);
  r.document.hidden = false; r.document.emit('visibilitychange'); r.step(200000); assert.ok(g.elapsed - hidden < .02);
  g.setReducedMotion(true); r.step(300000); assert.equal(g.bloomProgress, 1); assert.equal(r.queue.size, 0);
  const aborted = g.prepareBouquet('abort', input()); g.cancelPreparation(); await assert.rejects(aborted, {name: 'AbortError'});
  const mesh = g.mesh, geometry = g.points.geometry; let mat = 0, geo = 0;
  mesh.material.addEventListener('dispose', () => mat++); geometry.addEventListener('dispose', () => geo++);
  r.canvas.emit('webglcontextlost', {preventDefault() {}}); assert.equal(lost, 1); assert.equal(r.queue.size, 0);
  await assert.rejects(g.prepareBouquet('lost', input()), {name: 'AbortError'});
  g.dispose(); g.dispose(); assert.equal(mat, 1); assert.equal(geo, 1); assert.equal(g.preparation.cache.size, 0);
  assert.equal(r.canvas.listenerCount(), 0); assert.equal(r.window.listenerCount(), 0); assert.equal(r.document.listenerCount(), 0);
  assert.ok(r.renderer.disposed); assert.equal(r.canvas.__bloomGarden, undefined);
});

test('point-only synchronous compatibility is explicit, never masquerades as natural-garden mesh depth', () => {
  const r = rig({reducedMotion: true}), g = r.garden, value = input();
  g.setBouquet(value.particles, true); r.step();
  assert.equal(r.canvas.dataset.style, 'point-only-compatibility'); assert.equal(g.diagnostics.depth.mesh, false);
  assert.equal(g.diagnostics.naturalGarden.pointOnlyCompatibility, true); assert.equal(r.renders.at(-1).length, 2);
  g.setBouquet(value.particles, true, value.surface, value.growth); r.step();
  assert.equal(r.canvas.dataset.style, 'natural-garden'); assert.equal(r.renders.at(-1).length, 1); r.close();
});
