// CPU/lifecycle contracts use real Three classes and materials, with only the
// GPU renderer boundary injected. Browser shader/occlusion evidence is separate.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// Load the browser ESM graph without a root package.json/Node build dependency.
// Data URLs also support Node versions that do not auto-detect .js ESM files.
const moduleURL = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const sourceFile = path => readFile(new URL(path, import.meta.url), 'utf8');
const coreURL = moduleURL(await sourceFile('../site/vendor/three-0.186.1/three.core.js'));
const threeURL = moduleURL((await sourceFile('../site/vendor/three-0.186.1/three.module.js')).replaceAll("'./three.core.js'", JSON.stringify(coreURL)));
const THREE = await import(threeURL);
globalThis[Symbol.for('bloom.three.contract')] = THREE;
const threeImport = "import * as THREE from './vendor/three-0.186.1/three.module.js';";
const threeBinding = "const THREE = globalThis[Symbol.for('bloom.three.contract')];";
const prepareURL = moduleURL(await sourceFile('../site/prepare-data.js'));
const clientURL = moduleURL((await sourceFile('../site/prepare-client.js')).replace(/\.\/prepare-data\.js\?v=\d+/g, prepareURL));
const materialURL = moduleURL((await sourceFile('../site/three-materials.js')).replace(threeImport, threeBinding));
const legacyURL = moduleURL((await sourceFile('../site/legacy-garden.js'))
  .replace(/\.\/prepare-client\.js\?v=\d+/g, clientURL).replace(/\.\/prepare-data\.js\?v=\d+/g, prepareURL));
const gardenURL = moduleURL((await sourceFile('../site/three-garden.js'))
  .replace(threeImport, threeBinding)
  .replace(/\.\/legacy-garden\.js\?v=\d+/g, legacyURL)
  .replace(/\.\/prepare-client\.js\?v=\d+/g, clientURL)
  .replace(/\.\/prepare-data\.js\?v=\d+/g, prepareURL)
  .replace(/\.\/three-materials\.js\?v=\d+/g, materialURL));
const botanicalMaterialURL = moduleURL((await sourceFile('../site/botanical-materials.js'))
  .replace(threeImport, threeBinding).replace(/\.\/three-materials\.js\?v=\d+/g, materialURL));
const botanicalURL = moduleURL((await sourceFile('../site/botanical-garden.js'))
  .replace(/\.\/three-garden\.js\?v=\d+/g, gardenURL)
  .replace(/\.\/three-materials\.js\?v=\d+/g, materialURL)
  .replace(/\.\/botanical-materials\.js\?v=\d+/g, botanicalMaterialURL));
const facadeURL = moduleURL((await sourceFile('../site/particles.js'))
  .replace(/\.\/botanical-garden\.js\?v=\d+/g, botanicalURL)
  .replace(/\.\/three-garden\.js\?v=\d+/g, gardenURL).replace(/\.\/legacy-garden\.js\?v=\d+/g, legacyURL));
const {ThreeGarden, preparedGeometry} = await import(gardenURL);
const {ParticleGarden, LegacyGarden} = await import(facadeURL);
const {createUniforms, createPetalMaterial, createPointMaterial, BLOOM_GLSL} = await import(materialURL);
const {prepareSync} = await import(prepareURL);

function eventTarget(extra = {}) {
  const listeners = new Map();
  return Object.assign(extra, {
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
    emit(name, extra = {}) { for (const cb of listeners.get(name) ?? []) cb({type: name, ...extra}); },
    listenerCount() { return [...listeners.values()].reduce((n, set) => n + set.size, 0); },
  });
}
function sample(offset = 0) {
  const positions = [[-.7 + offset, -1.2, -.8], [.8 + offset, 1.6, 1.2], [-.4 + offset, .9, -.2]];
  const particles = new Float32Array(positions.flatMap((p, i) => [...p, .8, .3 + i * .1, .5, 1.1, .7, 0, 0, 1]));
  const vertices = new Float32Array(positions.flatMap(p => [...p, .8, .3, .5, 0, 0, 1]));
  const growth = new Float32Array(positions.flatMap((p, i) => [p[0] * .3, p[1] * .6, p[2] * .2, 0, .6, .8, i * .2]));
  return {particles, surface: {vertices, indices: new Uint32Array([0, 1, 2])}, growth: {points: growth, vertices: growth.slice()}};
}
const prepare = input => prepareSync(input, {octBase: 4096, uintIndices: true});
function rig(options = {}) {
  const queue = new Map(), renders = [];
  let next = 0;
  const document = eventTarget({hidden: false});
  const window = eventTarget({devicePixelRatio: 2.5});
  const rect = {left: 0, top: 0, width: 520, height: 600};
  const context = {};
  const nativeAttributes = new Map();
  const nativeGL = new Proxy({
    getShaderPrecisionFormat: () => ({precision: 23}), getExtension: () => ({}),
    createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}),
    getShaderParameter: () => true, getProgramParameter: () => true,
    getAttribLocation(_program, name) { if (!nativeAttributes.has(name)) nativeAttributes.set(name, nativeAttributes.size); return nativeAttributes.get(name); },
    getUniformLocation: (_program, name) => name,
  }, {get(object, name) { if (name in object) return object[name]; return /^[A-Z_]+$/.test(name) ? name : () => {}; }});
  const canvas = eventTarget({dataset: {}, width: 0, height: 0,
    getBoundingClientRect: () => rect, setPointerCapture() {},
    getContext(name) { if (name === 'webgl2') return options.webgl2 === false ? null : context;
      assert.equal(name, 'webgl'); assert.equal(options.webgl2, false); return nativeGL; }});
  globalThis.window = window; globalThis.document = document;
  globalThis.ResizeObserver = class { constructor(callback) { this.callback = callback; } observe() {} disconnect() { this.disconnected = true; } };
  globalThis.requestAnimationFrame = callback => { assert.equal(queue.size, 0, 'one RAF only'); queue.set(++next, callback); return next; };
  globalThis.cancelAnimationFrame = id => queue.delete(id);
  const renderer = {debug: {}, info: {render: {calls: 0}, memory: {geometries: 0}},
    getContext: () => context, setClearColor(color, alpha) { this.clear = [color, alpha]; },
    setPixelRatio(value) { this.dpr = value; }, setSize(w, h, updateStyle) { assert.equal(updateStyle, false); canvas.width = Math.floor(w * this.dpr); canvas.height = Math.floor(h * this.dpr); },
    render(scene, camera) { scene.updateMatrixWorld(); camera.updateMatrixWorld();
      const objects = []; scene.traverse(o => { if ((o.isPoints || o.isMesh) && o.visible) objects.push(o); });
      this.info.render.calls = objects.length; this.info.memory.geometries = new Set(objects.map(o => o.geometry)).size;
      renders.push({scene, camera, objects}); }, dispose() { this.disposed = true; }};
  const Garden = options.facade ? ParticleGarden : ThreeGarden;
  const garden = new Garden(canvas, {...options, rendererFactory: parameters => { assert.equal(parameters.canvas, canvas); assert.equal(parameters.antialias, true); return renderer; }});
  return {garden, canvas, document, window, rect, renderer, queue, renders,
    step(now = 1000) { assert.equal(queue.size, 1, 'expected queued RAF'); const [id, cb] = queue.entries().next().value; queue.delete(id); cb(now); },
    settle(now = 1000) { for (let i = 0; queue.size && i < 400; i++) this.step(now + i * 16); assert.equal(queue.size, 0); },
    close() { garden.dispose(); assert.equal(queue.size, 0); }};
}

function expanded(source) {
  return source.replace(/#include <(\w+)>/g, (_, name) => {
    assert.ok(THREE.ShaderChunk[name], name);
    return expanded(THREE.ShaderChunk[name]);
  });
}

test('official npm ESM version, MIT, dependency graph and hashes are locked', async () => {
  assert.equal(THREE.REVISION, '186');
  const root = new URL('../site/vendor/three-0.186.1/', import.meta.url);
  const metadata = JSON.parse(await readFile(new URL('metadata.json', root), 'utf8'));
  assert.equal(metadata.version, '0.186.1'); assert.equal(metadata.license, 'MIT'); assert.equal(metadata.modified, false);
  for (const [name, info] of Object.entries(metadata.files)) {
    const bytes = await readFile(new URL(name, root));
    assert.equal(bytes.length, info.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), info.sha256);
  }
  const license = await readFile(new URL('LICENSE', root), 'utf8');
  assert.match(license, /MIT License/); assert.match(license, /2010-2026 three.js authors/);
  const entry = await readFile(new URL('three.module.js', root), 'utf8');
  assert.match(entry, /from '\.\/three.core.js'/); assert.doesNotMatch(entry, /from ['"]https?:/);
});

test('facade selects actual Three classes, transparent sRGB canvas, no effect pipeline', () => {
  const r = rig({facade: true}); const g = r.garden;
  assert.ok(g instanceof ThreeGarden); assert.ok(!(g instanceof LegacyGarden));
  assert.ok(g.scene instanceof THREE.Scene); assert.ok(g.camera instanceof THREE.PerspectiveCamera);
  assert.equal(r.canvas.dataset.engine, 'three-webgl2'); assert.equal(r.canvas.__bloomGarden, g);
  assert.equal(r.renderer.outputColorSpace, THREE.SRGBColorSpace); assert.equal(r.renderer.toneMapping, THREE.ACESFilmicToneMapping);
  assert.deepEqual(r.renderer.clear, [0, 0]); assert.equal(g.dpr, 1.8); assert.equal(g.diagnostics.postProcessing, false);
  r.close();
});

test('only absent WebGL2 selects the still-production WebGL1 compatibility renderer', () => {
  const r = rig({facade: true, webgl2: false, reducedMotion: true});
  assert.ok(r.garden instanceof LegacyGarden); assert.ok(!(r.garden instanceof ThreeGarden));
  assert.equal(r.canvas.dataset.engine, 'legacy-webgl1'); assert.equal(r.garden.diagnostics.engine, 'legacy-webgl1');
  r.close();
  const calls = [];
  assert.throws(() => new ParticleGarden({getContext(name) { calls.push(name); return {}; }}, {
    rendererFactory() { throw new Error('real Three setup failure'); },
  }), /real Three setup failure/);
  assert.deepEqual(calls, ['webgl2'], 'a Three failure must not silently claim a legacy success');
});

test('Worker-prepared attributes alias immutable arrays without all-record scans', () => {
  const p = prepare(sample()); const q = prepare(sample(.2));
  const old = p.packed.slice();
  const geom = preparedGeometry(p.packed, q.packed, p.mesh.indices);
  assert.ok(geom instanceof THREE.BufferGeometry);
  for (const [name, offset] of [['aPosition', 0], ['aColor', 4], ['aNormal', 8], ['aBud', 12]]) {
    assert.equal(geom.getAttribute(name).data.array, p.packed);
    assert.equal(geom.getAttribute(name).offset, offset); assert.equal(geom.getAttribute(name).data.stride, 16);
  }
  assert.equal(geom.getAttribute('aTarget').data.array, q.packed);
  assert.equal(geom.getAttribute('aTargetNormal').data.array, q.packed);
  assert.equal(geom.getAttribute('position').itemSize, 3); assert.equal(geom.index.array, p.mesh.indices);
  assert.ok(geom.boundingSphere); assert.deepEqual(p.packed, old);
  geom.dispose();
});

test('physical material patches actual r186 chunks: GPU positions/normals, linear pigment, thin backlight and sheen', () => {
  const uniforms = createUniforms(), m = createPetalMaterial(uniforms);
  assert.ok(m instanceof THREE.MeshPhysicalMaterial); assert.equal(m.side, THREE.DoubleSide);
  assert.ok(m.roughness > .7); assert.ok(m.sheen > 0); assert.equal(m.transmission, 0); assert.equal(m.clearcoat, 0);
  assert.ok(m.depthWrite && m.depthTest); assert.equal(m.transparent, false);
  const shader = {vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {}};
  m.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uTime, uniforms.uTime);
  assert.match(shader.vertexShader, /vec3 objectNormal = bloomIdleNormal\(bloomRest, bloomNormal\(\)\)/);
  assert.match(shader.vertexShader, /vec3 transformed = bloomIdle/);
  assert.match(THREE.ShaderChunk.color_pars_vertex, /varying vec4 vColor/);
  assert.match(shader.vertexShader, /vColor = vec4\(bloomPigment\(\), aPosition.w\)/);
  assert.match(shader.vertexShader, /vPosition = bloomRest/);
  assert.doesNotMatch(shader.vertexShader, /#include <begin_vertex>|#include <beginnormal_vertex>|#include <color_vertex>/);
  assert.match(shader.fragmentShader, /reflectedLight.indirectDiffuse \+=/);
  const fragment = expanded(shader.fragmentShader);
  assert.match(fragment, /gl_FrontFacing/); assert.match(fragment, /sheenSpecularDirect/); assert.match(fragment, /linearToOutputTexel/);
  assert.match(BLOOM_GLSL, /c \/ 12.92/); assert.match(BLOOM_GLSL, /n.x \/ e - d \* n.z/);
  m.dispose();
});

test('real Points share one geometry for no-color depth cores and blended visible grain; meshes own depth', () => {
  const r = rig({reducedMotion: true}); const g = r.garden;
  g.commitPrepared(prepare(sample()), true); r.step();
  assert.ok(g.points instanceof THREE.Points); assert.ok(g.depthPoints instanceof THREE.Points); assert.ok(g.mesh instanceof THREE.Mesh);
  assert.equal(g.points.geometry, g.depthPoints.geometry);
  assert.ok(g.depthMaterial.depthWrite && g.depthMaterial.depthTest && !g.depthMaterial.colorWrite);
  assert.ok(!g.pointMaterial.depthWrite && g.pointMaterial.depthTest && g.pointMaterial.colorWrite && g.pointMaterial.transparent);
  assert.ok(g.mesh.material.depthWrite && g.mesh.material.depthTest); assert.equal(g.mesh.material.transparent, false);
  assert.equal(g.mesh.material.type, 'MeshPhysicalMaterial'); assert.equal(g.pointMaterial.uniforms.uDepthOnly.value, 0);
  assert.equal(g.depthMaterial.uniforms.uDepthOnly.value, 1);
  assert.match(g.depthMaterial.fragmentShader, /r > \.72/);
  assert.equal(r.renders.length, 1); assert.equal(r.renders[0].objects.length, 3);
  assert.equal(r.canvas.dataset.mixProgress, '1'); assert.equal(r.canvas.dataset.rendered, 'true');
  assert.deepEqual(g.diagnostics.depth, {mesh: true, points: true, pointColor: true});
  assert.equal(g.diagnostics.meshCount, 1); r.close();
});

test('growth, morph and wind clocks freeze under pause/blur/hidden and resume without wall-time jumps', () => {
  const r = rig(); const g = r.garden;
  g.commitPrepared(prepare(sample()), true); r.step(1000); r.step(2200);
  assert.ok(g.bloomProgress > 0 && g.bloomProgress < 1);
  assert.equal(g.uniforms.uTargetGrowth.value, g.bloomProgress);
  assert.equal(g.mesh.userData.uniforms.uTargetGrowth.value, g.bloomProgress);
  const clock = g.elapsed, progress = g.bloomProgress;
  g.setPaused(true); r.step(9999); assert.equal(g.elapsed, clock); assert.equal(g.bloomProgress, progress); assert.equal(r.queue.size, 0);
  g.setPaused(false); r.step(20000); assert.ok(g.elapsed - clock < .02);
  r.window.emit('blur'); assert.equal(r.queue.size, 0); const blur = g.elapsed;
  r.window.emit('focus'); r.step(90000); assert.ok(g.elapsed - blur < .02);
  r.document.hidden = true; r.document.emit('visibilitychange'); assert.equal(r.queue.size, 0); const hidden = g.elapsed;
  r.document.hidden = false; r.document.emit('visibilitychange'); r.step(200000); assert.ok(g.elapsed - hidden < .02);
  g.setReducedMotion(true); r.step(300000); assert.equal(g.bloomProgress, 1); assert.equal(g.mix, 1); assert.equal(r.queue.size, 0);
  const still = g.elapsed; g.bloom(); assert.equal(g.elapsed, still); assert.equal(r.queue.size, 0);
  r.close();
});

test('prepared latest-only queue waits for morph and atomically commits static selections without CPU rescans', async () => {
  const r = rig(); const g = r.garden;
  const a = prepare(sample()), b = prepare(sample(.3)), c = prepare(sample(.6)), d = prepare(sample(.9));
  g.snapshotVisible = g.sampleGrowthProjection = () => { throw new Error('async path must never perform synchronous snapshots/support scans'); };
  g.commitPrepared(a, true); r.step(1000); await g.queuePrepared(b); r.step(1100);
  assert.equal(g.mix, 3 * (.016 / 1.6) ** 2 - 2 * (.016 / 1.6) ** 3);
  assert.equal(g.outgoingMesh.geometry.getAttribute('position').data.array, a.mesh.packed);
  let waiting = 0;
  const superseded = g.queuePrepared(c, false, () => waiting++).then(() => null, e => e);
  const final = g.queuePrepared(d, false, () => waiting++);
  assert.equal(waiting, 2); assert.equal((await superseded).name, 'AbortError');
  assert.equal(g.preparedCurrent, b); assert.ok(g.pendingPrepared);
  g.setPaused(true); assert.equal(await final, true); assert.equal(g.preparedCurrent, d); assert.equal(g.outgoingMesh, null);
  r.step(99999); assert.equal(r.canvas.dataset.mixProgress, '1'); assert.equal(g.mix, 1);
  assert.equal(g.points.geometry.getAttribute('aPosition').data.array, d.packed);
  assert.equal(g.points.geometry.getAttribute('aTarget').data.array, d.packed); r.close();
});

test('cancel, loss, disposal and compile failure reject pending work and free owned Three resources once', async () => {
  let lost = 0; const r = rig({onLost: () => lost++}); const g = r.garden;
  g.commitPrepared(prepare(sample()), true); r.step(); g.commitPrepared(prepare(sample(.3))); r.step(1100);
  const pending = g.queuePrepared(prepare(sample(.6))).then(() => null, e => e);
  r.canvas.emit('webglcontextlost', {preventDefault() {}});
  assert.equal((await pending).name, 'AbortError'); assert.equal(lost, 1); assert.equal(r.queue.size, 0);
  await assert.rejects(g.prepareBouquet('lost', sample()), {name: 'AbortError'});
  assert.throws(() => g.commitPrepared(prepare(sample())), {name: 'AbortError'});
  const owned = [g.mesh.geometry, g.outgoingMesh.geometry, g.points.geometry, g.mesh.material, g.outgoingMesh.material, g.pointMaterial, g.depthMaterial];
  const counts = owned.map(object => { let n = 0; object.addEventListener('dispose', () => n++); return () => n; });
  g.dispose(); g.dispose();
  assert.ok(counts.every(count => count() === 1)); assert.equal(r.canvas.listenerCount(), 0);
  assert.equal(r.window.listenerCount(), 0); assert.equal(r.document.listenerCount(), 0);
  assert.ok(r.renderer.disposed); assert.ok(g.resizeObserver.disconnected); assert.equal(r.canvas.__bloomGarden, undefined);
  assert.equal(g.preparedCurrent, null); assert.equal(g.points, null); assert.equal(r.queue.size, 0);
  const failed = rig({onLost: () => lost++});
  failed.renderer.debug.onShaderError({getProgramInfoLog: () => 'bad shader', getShaderInfoLog: () => ''}, {}, {}, {});
  assert.equal(failed.garden.lost, true); assert.match(failed.canvas.dataset.shaderError, /bad shader/); assert.equal(lost, 2); failed.close();
});

test('Worker preparation stays asynchronous, cooperative fallback is sliced, cache bounded and cancellation owned', async () => {
  const r = rig({reducedMotion: true}), g = r.garden;
  const input = sample();
  const promise = g.prepareBouquet('a', input);
  assert.equal(g.data, undefined, 'prepare must not synchronously commit');
  const a = await promise; assert.equal(await g.prepareBouquet('a', input), a);
  for (let i = 0; i < 6; i++) await g.prepareBouquet(String(i), sample(i * .01));
  assert.equal(g.preparation.cache.size, 4);
  const pending = g.prepareBouquet('cancelled', sample()); g.cancelPreparation();
  await assert.rejects(pending, {name: 'AbortError'});
  await g.queuePrepared(a, true); r.step(); assert.equal(g.count, 3);
  r.close(); assert.equal(g.preparation.cache.size, 0);
});

test('synchronous setBouquet signature validates first, stays distinct from async production path', () => {
  const r = rig({reducedMotion: true}), g = r.garden, input = sample();
  g.setBouquet(input.particles, true, input.surface, input.growth); r.step();
  const current = g.preparedCurrent;
  assert.throws(() => g.setBouquet(new Float32Array(4)), /stride/);
  assert.equal(g.preparedCurrent, current); assert.equal(g.count, 3);
  g.setBouquet(input.particles, false, null, null); r.step(); assert.equal(g.mesh, null);
  r.close();
});

test('explicit synchronous mid-growth retarget preserves GPU positions, normals, closed poses and composite mesh alpha', async () => {
  const {snapshotCPU} = await import(legacyURL);
  const r = rig(), g = r.garden;
  const a = sample(), b = sample(.8), c = sample(-.5);
  for (let i = 8; i < b.particles.length; i += 11) { b.particles[i] = .6; b.particles[i + 2] = .8; }
  for (let i = 6; i < b.surface.vertices.length; i += 9) { b.surface.vertices[i] = .6; b.surface.vertices[i + 2] = .8; }
  g.setBouquet(a.particles, true, a.surface, a.growth); r.step(1000); r.step(2500);
  g.setBouquet(b.particles, false, b.surface, b.growth); r.step(2600); r.step(3300);
  for (const input of [c, a, b]) {
    const frozen = snapshotCPU.freezePacked(g.gpuData, g.gpuTargetData, g.mix, g.sourceGrowth, g.bloomProgress, g.octBase);
    const mesh = g.captureSurface();
    const raw = new Float32Array(g.data.length);
    for (let i = 0; i < raw.length; i++) raw[i] = g.data[i] * (1 - g.mix) + g.targetData[i] * g.mix;
    for (let i = 0, j = 7; i < frozen.length; i += 16, j += 11) frozen[i + 7] = raw[j];
    g.setBouquet(input.particles, false, input.surface, input.growth);
    assert.equal(g.mix, 0); assert.equal(g.sourceGrowth, 1); assert.equal(g.bloomProgress, 0);
    assert.deepEqual(g.gpuData, frozen); assert.deepEqual(g.data, raw);
    assert.deepEqual(g.outgoingSurface.packed, mesh.packed); assert.deepEqual(g.outgoingSurface.indices, mesh.indices);
    assert.equal(g.outgoingMesh.geometry.getAttribute('aPosition').data.array, g.outgoingSurface.packed);
    assert.ok([...mesh.packed].some((value, i) => i % 16 === 3 && value > 0 && value < 1), 'composite keeps per-vertex visibility');
    assert.match(g.outgoingMesh.material.onBeforeCompile.toString(), /aPosition.w/);
    r.step(3400); r.step(3800);
  }
  r.close();
});

test('camera matrix matches historical off-axis fit and .98 bounds across growth phases and complete orbit', async t => {
  const root = process.env.BLOOM_TEST_ASSETS_URL;
  if (!root) return t.skip('hermetic full-asset fixture is supplied by test_three_renderer.py');
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const r = rig({reducedMotion: true}), g = r.garden;
  for (const bouquet of manifest.bouquets) {
    const array = async file => { const bytes = await readFile(new URL(file, root)); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); };
    const prepared = prepareSync({buffers: await Promise.all([array(bouquet.file), array(bouquet.surface), array(bouquet.growth)]), count: manifest.count, stride: manifest.stride}, {octBase: 4096, uintIndices: true});
    for (const aspect of [.52, 1.55]) {
      r.rect.width = 600 * aspect; g.resize();
      g.commitPrepared(prepared, true); r.step();
      g.reducedMotion = false;
      for (const progress of [0, .5, 1]) for (let orbit = 0; orbit < 12; orbit++) {
        g.bloomProgress = g.sourceGrowth = progress; g.time = 2.7;
        const yaw = orbit * Math.PI / 6, pitch = -.15;
        const expected = LegacyGarden.prototype.measureProjection.call(g, yaw, pitch);
        const measured = g.measureProjection(yaw, pitch);
        assert.ok(Math.abs(measured.focal - expected.focal) < 1e-12);
        assert.ok(measured.center.every((value, axis) => Math.abs(value - expected.center[axis]) < 1e-12));
        const focal = g.fitProjection(yaw, pitch);
        g.group.rotation.set(pitch, yaw, 0, 'XYZ'); g.group.updateMatrixWorld();
        g.camera.fov = 2 * Math.atan(1 / focal) * 180 / Math.PI; g.camera.updateProjectionMatrix();
        g.camera.projectionMatrix.elements[8] = measured.center[0] * focal / g.aspect;
        g.camera.projectionMatrix.elements[9] = measured.center[1] * focal;
        g.camera.updateMatrixWorld();
        // Full, not sampled, point scan verifies the prepared support fit. CPU
        // scan exists ONLY in this test, never in a commit or animation frame.
        for (const [kind, packed] of [['points', prepared.packed], ['mesh', prepared.mesh.packed]]) for (let i = 0; i < packed.length; i += 16) {
          const p = packed, delay = p[i + 15], t0 = Math.max(0, Math.min(1, (progress - delay * .24) / .76));
          const open = t0 * t0 * (3 - 2 * t0);
          let [x, y, z] = [0, 1, 2].map(axis => p[i + 12 + axis] * (1 - open) + p[i + axis] * open);
          const phase = p[i + 7], time = g.time, wind = Math.sin(time * .65 + y * .85) * .032;
          const e = 1 + Math.sin(time * .82 + y * .5) * .012 * Math.max(0, y + 1);
          x *= e; y *= e; x += wind * Math.max(.2, y + 2); z += Math.cos(time * .55 + x * 1.3) * .035;
          x += Math.sin(time + phase) * .009; y += Math.cos(time * .7 + phase) * .009;
          const w0 = Math.max(0, Math.min(1, (phase - 6.13) / .15));
          const w = w0 * w0 * (3 - 2 * w0) * Math.pow(.5 + .5 * Math.sin(time * .8 + phase * 30), 4);
          x += Math.sin(phase * 9 + time * .6) * .38 * w; y += .52 * w; z += Math.cos(phase * 7 + time) * .24 * w;
          const point = new THREE.Vector3(x, y, z).applyMatrix4(g.group.matrixWorld).project(g.camera);
          assert.ok(Math.abs(point.x) <= .98 && Math.abs(point.y) <= .98, `${bouquet.id} ${kind}: clipping ${point.x},${point.y}`);
        }
      }
      g.setReducedMotion(true); if (r.queue.size) r.step();
    }
  }
  r.close();
});
