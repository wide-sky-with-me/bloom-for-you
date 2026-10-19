import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../site/particles.js", import.meta.url),
  "utf8",
);
const { ParticleGarden } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const surfaceSource = await readFile(
  new URL("../site/surface-data.js", import.meta.url),
  "utf8",
);
const { decodeSurface } = await import(
  `data:text/javascript;base64,${Buffer.from(surfaceSource).toString("base64")}`
);

function eventTarget(extra = {}) {
  const listeners = new Map();
  return Object.assign(extra, {
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
    removeEventListener(name, callback) {
      listeners.set(
        name,
        (listeners.get(name) || []).filter((item) => item !== callback),
      );
    },
    listenerCount() {
      return [...listeners.values()].reduce(
        (total, items) => total + items.length,
        0,
      );
    },
    emit(name, event = {}) {
      for (const callback of listeners.get(name) || [])
        callback({ type: name, ...event });
    },
  });
}

function fakeGL({ uintIndices = true } = {}) {
  const enabled = new Set();
  const uniforms = {};
  const pointers = new Map();
  const constantAttributes = new Map();
  const attributes = new Map();
  let nextBuffer = 0;
  let bound = null,
    elementBound = null;
  let colorMask = [true, true, true, true];
  let depthMask = true;
  let depthFunction;
  let blend;
  const gl = {
    attributes,
    draws: [],
    uploads: [],
    shaders: [],
    clears: [],
    deletedBuffers: [],
    deletedPrograms: [],
    getExtension(name) {
      assert.equal(name, "OES_element_index_uint");
      return uintIndices ? {} : null;
    },
    deleteBuffer(buffer) {
      this.deletedBuffers.push(buffer);
    },
    deleteProgram(program) {
      this.deletedPrograms.push(program);
    },
    get state() {
      return { colorMask: [...colorMask], depthMask, depthFunction };
    },
    createShader(type) {
      const shader = { type };
      this.shaders.push(shader);
      return shader;
    },
    shaderSource(shader, text) {
      shader.source = text;
    },
    compileShader() {},
    getShaderParameter() {
      return true;
    },
    deleteShader() {},
    createProgram() {
      return {};
    },
    attachShader() {},
    linkProgram() {},
    getProgramParameter() {
      return true;
    },
    useProgram() {},
    getAttribLocation(_program, name) {
      if (!attributes.has(name)) attributes.set(name, attributes.size);
      assert.ok(attributes.size <= 7, "WebGL1 budget is seven attributes");
      return attributes.get(name);
    },
    getUniformLocation(_program, name) {
      return name;
    },
    createBuffer() {
      return { id: ++nextBuffer };
    },
    bindBuffer(target, buffer) {
      if (target === this.ELEMENT_ARRAY_BUFFER) elementBound = buffer;
      else bound = buffer;
    },
    bufferData(target, data) {
      this.uploads.push({
        buffer: target === this.ELEMENT_ARRAY_BUFFER ? elementBound : bound,
        data: new data.constructor(data),
      });
    },
    disableVertexAttribArray(index) {
      pointers.delete(index);
    },
    vertexAttrib2f(index, x, y) {
      constantAttributes.set(index, [x, y]);
    },
    enableVertexAttribArray(index) {
      assert.ok(index >= 0 && index < 7);
      constantAttributes.delete(index);
    },
    vertexAttribPointer(index, size, type, normalized, stride, offset) {
      pointers.set(index, {
        buffer: bound,
        size,
        type,
        normalized,
        stride,
        offset,
      });
    },
    uniform1f(name, value) {
      assert.ok(Number.isFinite(value), name);
      uniforms[name] = value;
    },
    uniform2f(name, a, b) {
      uniforms[name] = [a, b];
    },
    enable(name) {
      enabled.add(name);
    },
    disable(name) {
      enabled.delete(name);
    },
    colorMask(...value) {
      colorMask = value;
    },
    depthMask(value) {
      depthMask = value;
    },
    depthFunc(value) {
      depthFunction = value;
    },
    blendFuncSeparate(...value) {
      blend = value;
    },
    clearColor() {},
    clearDepth(value) {
      this.depthClearValue = value;
    },
    viewport() {},
    clear(mask) {
      this.clears.push({ mask, depthMask, colorMask: [...colorMask] });
    },
    drawArrays(mode, first, count) {
      this.draws.push({
        mode,
        first,
        count,
        enabled: new Set(enabled),
        uniforms: structuredClone(uniforms),
        pointers: new Map(pointers),
        constantAttributes: new Map(constantAttributes),
        colorMask: [...colorMask],
        depthMask,
        depthFunction,
        blend,
      });
    },
    drawElements(mode, count, type, offset) {
      this.drawArrays(mode, offset, count);
      Object.assign(this.draws.at(-1), {
        indexed: true,
        indexType: type,
        elementBuffer: elementBound,
      });
    },
  };
  for (const name of [
    "VERTEX_SHADER",
    "FRAGMENT_SHADER",
    "COMPILE_STATUS",
    "LINK_STATUS",
    "ARRAY_BUFFER",
    "STATIC_DRAW",
    "FLOAT",
    "DEPTH_TEST",
    "BLEND",
    "LEQUAL",
    "SRC_ALPHA",
    "ONE_MINUS_SRC_ALPHA",
    "ONE",
    "POINTS",
    "TRIANGLES",
    "ELEMENT_ARRAY_BUFFER",
    "UNSIGNED_INT",
  ])
    gl[name] = name;
  gl.COLOR_BUFFER_BIT = 1;
  gl.DEPTH_BUFFER_BIT = 2;
  return gl;
}

function rig(options = {}) {
  const gl = fakeGL({ uintIndices: options.uintIndices ?? true });
  const queue = new Map();
  let nextFrame = 0;
  const document = eventTarget({ hidden: false });
  const rect = { left: 0, top: 0, width: 520, height: 600 };
  const canvas = eventTarget({
    width: 0,
    height: 0,
    dataset: {},
    getContext(name, contextOptions) {
      assert.equal(name, "webgl");
      this.contextOptions = contextOptions;
      return gl;
    },
    getBoundingClientRect() {
      return rect;
    },
    setPointerCapture() {},
  });
  globalThis.document = document;
  globalThis.window = { devicePixelRatio: 1.5 };
  globalThis.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  };
  globalThis.requestAnimationFrame = (callback) => {
    assert.equal(queue.size, 0, "only one RAF may be queued");
    queue.set(++nextFrame, callback);
    return nextFrame;
  };
  globalThis.cancelAnimationFrame = (id) => queue.delete(id);
  const garden = new ParticleGarden(canvas, options);
  return {
    garden,
    gl,
    queue,
    document,
    canvas,
    rect,
    step(now) {
      assert.equal(queue.size, 1, "expected a queued frame");
      const [id, callback] = queue.entries().next().value;
      queue.delete(id);
      callback(now);
    },
    settle(now = 1000) {
      for (let i = 0; queue.size && i < 300; i++) {
        this.step(now + i * 16);
      }
      assert.equal(queue.size, 0, "paused rotation should settle");
    },
  };
}

function particles(offset = 0, normal = [0, 0, 1]) {
  return new Float32Array([
    -0.7 + offset,
    -1.2,
    -0.8,
    0.8,
    0.3,
    0.5,
    1.1,
    0.7,
    ...normal,
    0.8 + offset,
    1.6,
    1.2,
    0.4,
    0.7,
    0.3,
    0.9,
    1.7,
    ...normal,
  ]);
}

function core(r) {
  return r.gl.draws.at(-3);
}

test("version2 binds seven attributes at 44-byte stride, including all dust normals", () => {
  const r = rig();
  r.garden.setBouquet(particles());
  r.step(1000);
  assert.equal(r.garden.count, 2);
  assert.equal(r.gl.attributes.size, 7);
  assert.equal(r.gl.uploads[0].data.length, 360 * 11);
  for (let i = 0; i < 360; i++) {
    assert.deepEqual(
      [...r.gl.uploads[0].data.slice(i * 11 + 8, i * 11 + 11)],
      [0, 0, 1],
    );
  }
  for (const draw of r.gl.draws) {
    assert.equal(draw.pointers.size, 7);
    for (const pointer of draw.pointers.values())
      assert.equal(pointer.stride, 44);
    assert.equal(draw.pointers.get(r.gl.attributes.get("aNormal")).offset, 32);
    assert.equal(
      draw.pointers.get(r.gl.attributes.get("aTargetNormal")).offset,
      32,
    );
  }
  const normalPointer = core(r).pointers.get(r.gl.attributes.get("aNormal"));
  const targetNormalPointer = core(r).pointers.get(
    r.gl.attributes.get("aTargetNormal"),
  );
  assert.equal(normalPointer.buffer, r.garden.currentBuffer);
  assert.equal(targetNormalPointer.buffer, r.garden.targetBuffer);
  assert.throws(() => r.garden.setBouquet(new Float32Array(16)), /stride/);
  assert.throws(() => r.garden.setBouquet(new Float32Array()), /stride/);
});

test("depth-only prepass owns depth, opaque cores and restrained halos share depth testing", () => {
  const r = rig({ reducedMotion: true });
  r.garden.setBouquet(particles());
  r.step(1000);
  const [depth, body, halo, dust] = r.gl.draws;
  assert.equal(r.gl.draws.length, 4);
  assert.deepEqual(depth.colorMask, [false, false, false, false]);
  assert.equal(depth.depthMask, true);
  assert.equal(depth.uniforms.uDepthOnly, 1);
  assert.equal(depth.enabled.has(r.gl.BLEND), false);
  for (const draw of [depth, body, halo, dust]) {
    assert.equal(draw.enabled.has(r.gl.DEPTH_TEST), true);
    assert.equal(draw.depthFunction, r.gl.LEQUAL);
  }
  for (const draw of [body, halo, dust]) {
    assert.deepEqual(draw.colorMask, [true, true, true, true]);
    assert.equal(draw.depthMask, false);
    assert.equal(draw.uniforms.uDepthOnly, 0);
    assert.deepEqual(draw.blend, [
      r.gl.SRC_ALPHA,
      r.gl.ONE_MINUS_SRC_ALPHA,
      r.gl.ONE,
      r.gl.ONE_MINUS_SRC_ALPHA,
    ]);
  }
  assert.equal(body.uniforms.uGlow, 0);
  assert.equal(halo.uniforms.uGlow, 1);
  assert.equal(dust.uniforms.uDust, 1);
  assert.equal(dust.count, 360);
  assert.equal(r.gl.clears[0].depthMask, true);
  assert.deepEqual(r.gl.clears[0].colorMask, [true, true, true, true]);
  assert.equal(r.gl.depthClearValue, 1);
  assert.equal(r.gl.state.depthMask, true);
  assert.deepEqual(r.gl.state.colorMask, [true, true, true, true]);
  assert.match(r.gl.shaders[1].source, /r > \.72/);
  assert.match(r.gl.shaders[1].source, /vAlpha \* \.035/);
  assert.match(r.gl.shaders[0].source, /uAppear \* \(\.96/);
});

test("perspective uses clip-w and normal lighting follows both rotating and morphing surfaces", () => {
  const r = rig();
  const vertex = r.gl.shaders[0].source;
  assert.match(vertex, /gl_Position = vec4\([^;]+clipZ, depth\)/);
  assert.match(vertex, /mix\(aNormal, aTargetNormal, uMix\)/);
  assert.match(vertex, /normalize\(rotate\(blendedNormal\)\)/);
  for (const feature of ["keyDirection", "sideDirection", "rim", "front"])
    assert.ok(vertex.includes(feature));
  assert.match(vertex, /dot\(blendedNormal, blendedNormal\) < \.0001/);
  const distance = 6.8;
  assert.ok(distance / (distance - 1.6) > distance / (distance + 1.6));
});

test("full depth envelope fits portrait, square and landscape even at side and back angles", () => {
  const r = rig({ reducedMotion: true });
  const data = [];
  for (const x of [-2.6, 2.6])
    for (const y of [-2.7, 3])
      for (const z of [-1.6, 1.6]) {
        data.push(x, y, z, 0.8, 0.3, 0.5, 1, 0.5, 0, 0, 1);
      }
  r.garden.setBouquet(new Float32Array(data));
  for (const aspect of [0.6, 0.85, 1, 1.6, 2]) {
    r.garden.aspect = aspect;
    for (const yaw of [-Math.PI, -1.57, -0.5, 0.43, 1.57, Math.PI])
      for (const pitch of [-0.65, -0.15, 0.65]) {
        const focal = r.garden.fitProjection(yaw, pitch);
        for (let i = 0; i < data.length; i += 11) {
          const x = data[i] * Math.cos(yaw) + data[i + 2] * Math.sin(yaw);
          const z = -data[i] * Math.sin(yaw) + data[i + 2] * Math.cos(yaw);
          const y = data[i + 1] * Math.cos(pitch) - z * Math.sin(pitch);
          const depth =
            6.8 - (data[i + 1] * Math.sin(pitch) + z * Math.cos(pitch));
          assert.ok(
            Math.abs(((x / depth - r.garden.frameCenter[0]) * focal) / aspect) <
              0.9,
          );
          assert.ok(
            Math.abs((y / depth - r.garden.frameCenter[1]) * focal) < 0.9,
          );
          assert.ok(depth > 0.4 && depth < 24);
        }
      }
  }
});

test("pause freezes every analytic clock, bloom and morph while direct paused selection is opaque", () => {
  const r = rig();
  r.garden.setBouquet(particles());
  r.step(1000);
  r.garden.setBouquet(particles(0.1));
  r.garden.bloom();
  r.step(1400);
  r.garden.setPaused(true);
  r.step(1800);
  const state = {
    time: r.garden.time,
    elapsed: r.garden.elapsed,
    mix: r.garden.mix,
    appearance: r.garden.appearance,
  };
  const frozen = structuredClone(core(r).uniforms);
  assert.equal(r.queue.size, 0);
  r.garden.requestFrame();
  r.step(100000);
  for (const [key, value] of Object.entries(state))
    assert.equal(r.garden[key], value, key);
  for (const key of ["uTime", "uMix", "uBurst", "uAppear", "uRotation"])
    assert.deepEqual(core(r).uniforms[key], frozen[key], key);
  const next = particles(0.2);
  r.garden.setBouquet(next);
  r.step(100100);
  assert.equal(r.garden.data, next);
  assert.equal(r.garden.targetData, next);
  assert.equal(r.garden.mix, 1);
  assert.equal(core(r).uniforms.uAppear, 1);
  assert.equal(r.queue.size, 0);
});

test("pause before first load forces appearance=1 and no idle RAF", () => {
  const r = rig();
  r.garden.setPaused(true);
  r.step(1000);
  r.garden.setBouquet(particles());
  r.step(2000);
  assert.equal(core(r).uniforms.uAppear, 1);
  assert.equal(r.garden.elapsed, 0);
  assert.equal(r.queue.size, 0);
});

test("rapid retarget freezes all eleven fields at the visible intermediate state", () => {
  const r = rig();
  const a = particles(0, [0, 0, 1]);
  const b = particles(0.2, [1, 0, 0]);
  const c = particles(-0.2, [0, 1, 0]);
  r.garden.setBouquet(a);
  r.step(1000);
  r.garden.setBouquet(b);
  r.step(1800);
  const mix = r.garden.mix;
  assert.ok(mix > 0 && mix < 1);
  r.garden.setBouquet(c);
  for (let i = 0; i < a.length; i++) {
    assert.ok(
      Math.abs(r.garden.data[i] - (a[i] * (1 - mix) + b[i] * mix)) < 1e-6,
      `field ${i}`,
    );
  }
  assert.equal(r.garden.targetData, c);
  assert.equal(r.garden.mix, 0);
  assert.equal(r.queue.size, 1);
  r.step(1900);
  assert.ok(r.garden.mix > 0 && r.garden.mix < 1);
});

test("opposite normals frozen by rapid retarget have a nonzero final shader fallback", () => {
  const r = rig();
  r.garden.setBouquet(particles(0, [0, 0, 1]));
  r.step(1000);
  r.garden.setBouquet(particles(0.1, [0, 0, -1]));
  r.step(1800);
  assert.ok(Math.abs(r.garden.mix - 0.5) < 1e-12);
  r.garden.setBouquet(particles(0.2, [1, 0, 0]));
  for (let i = 8; i < r.garden.data.length; i += 11) {
    const normal = [...r.garden.data.slice(i, i + 3)];
    assert.ok(normal.every((value) => Math.abs(value) < 1e-6));
  }
  r.step(1800);
  assert.equal(core(r).uniforms.uMix, 0);
  assert.match(
    r.gl.shaders[0].source,
    /if \(dot\(blendedNormal, blendedNormal\) < \.0001\) \{\s*blendedNormal = dot\(aNormal, aNormal\) < \.0001 \? vec3\(0\.0, 0\.0, 1\.0\) : aNormal;/,
  );
});

test("canvas click and keyboard bloom resume motion through onMotionChange", () => {
  const changes = [];
  const r = rig({ onMotionChange: (paused) => changes.push(paused) });
  r.garden.setPaused(true);
  r.garden.setBouquet(particles());
  r.step(1000);
  r.canvas.emit("pointerdown", {
    isPrimary: true,
    pointerId: 1,
    clientX: 100,
    clientY: 100,
  });
  r.canvas.emit("pointerup", { pointerId: 1 });
  assert.equal(r.garden.paused, false);
  assert.equal(changes.at(-1), false);
  r.garden.setPaused(true);
  let prevented = false;
  r.canvas.emit("keydown", {
    key: " ",
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(r.garden.paused, false);
  assert.equal(changes.at(-1), false);
});

test("drag can reveal the side without blooming and paused rotation settles", () => {
  const r = rig();
  r.garden.setPaused(true);
  r.garden.setBouquet(particles());
  r.step(1000);
  const initialRotation = core(r).uniforms.uRotation;
  r.canvas.emit("pointerdown", {
    isPrimary: true,
    pointerId: 2,
    clientX: 50,
    clientY: 100,
  });
  r.canvas.emit("pointermove", { pointerId: 2, clientX: 300, clientY: 120 });
  r.canvas.emit("pointerup", { pointerId: 2 });
  assert.ok(r.garden.targetRotation[0] > Math.PI / 2);
  assert.equal(r.garden.paused, true);
  r.settle(1100);
  assert.equal(r.garden.time, 0);
  assert.ok(
    Math.abs(r.garden.rotation[0] - r.garden.targetRotation[0]) < 0.001,
  );
  assert.notDeepEqual(core(r).uniforms.uRotation, initialRotation);
  assert.ok(core(r).uniforms.uRotation[0] > Math.PI / 2);
});

test("reduced-motion stays single-frame across selection, resize, hover and bloom", () => {
  const changes = [];
  const r = rig({
    reducedMotion: true,
    onMotionChange: (paused) => changes.push(paused),
  });
  r.garden.setBouquet(particles());
  r.step(1000);
  assert.equal(r.queue.size, 0);
  const frameCount = r.gl.draws.length;
  r.garden.bloom();
  assert.equal(r.queue.size, 0);
  assert.equal(r.gl.draws.length, frameCount);
  r.garden.setBouquet(particles(0.2));
  r.step(2000);
  assert.equal(r.garden.mix, 1);
  assert.equal(r.queue.size, 0);
  r.canvas.emit("pointermove", { clientX: 200, clientY: 200 });
  r.step(3000);
  assert.equal(r.queue.size, 0);
  assert.equal(r.garden.time, 0);
  assert.deepEqual(changes, []);
  r.garden.resizeObserver.callback();
  r.step(4000);
  assert.equal(r.queue.size, 0);
});

test("hidden documents stop RAF and exclude hidden time on resume", () => {
  const r = rig();
  r.garden.setBouquet(particles());
  r.step(1000);
  r.step(1100);
  const elapsed = r.garden.elapsed;
  r.document.hidden = true;
  r.document.emit("visibilitychange");
  assert.equal(r.queue.size, 0);
  r.garden.setBouquet(particles(0.2));
  assert.equal(r.queue.size, 0);
  r.document.hidden = false;
  r.document.emit("visibilitychange");
  r.step(100000);
  assert.ok(Math.abs(r.garden.elapsed - elapsed - 0.016) < 1e-9);
});

test("context loss cancels RAF and late interactions or data never restart rendering", () => {
  let losses = 0;
  let prevented = false;
  const r = rig({ onLost: () => losses++ });
  r.garden.setBouquet(particles());
  r.step(1000);
  r.canvas.emit("webglcontextlost", {
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(losses, 1);
  assert.equal(r.queue.size, 0);
  const draws = r.gl.draws.length;
  r.garden.setBouquet(particles(0.2));
  r.garden.bloom();
  r.garden.setPaused(false);
  r.document.emit("visibilitychange");
  r.garden.resizeObserver.callback();
  assert.equal(r.queue.size, 0);
  r.garden.frame(100000);
  assert.equal(r.gl.draws.length, draws);
});

function projectedEnvelope(
  data,
  yaw,
  pitch,
  focal,
  aspect,
  time = null,
  stride = 11,
  center = [0, 0],
) {
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw);
  const cx = Math.cos(pitch),
    sx = Math.sin(pitch);
  const envelope = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  };
  for (let i = 0; i < data.length; i += stride) {
    let px = data[i],
      py = data[i + 1],
      pz = data[i + 2];
    if (time !== null) {
      const phase = stride === 9 ? 0 : data[i + 7];
      const wind = Math.sin(time * 0.65 + py * 0.85) * 0.032;
      const breath = Math.sin(time * 0.82 + py * 0.5) * 0.012;
      const expansion = 1 + breath * Math.max(0, py + 1);
      px *= expansion;
      py *= expansion;
      px += wind * Math.max(0.2, py + 2);
      pz += Math.cos(time * 0.55 + px * 1.3) * 0.035;
      px += Math.sin(time + phase) * 0.009;
      py += Math.cos(time * 0.7 + phase) * 0.009;
      const t = Math.max(0, Math.min(1, (phase - 6.13) / (6.28 - 6.13)));
      const wander =
        t *
        t *
        (3 - 2 * t) *
        Math.pow(0.5 + 0.5 * Math.sin(time * 0.8 + phase * 30), 4);
      px += Math.sin(phase * 9 + time * 0.6) * 0.38 * wander;
      py += 0.52 * wander;
      pz += Math.cos(phase * 7 + time) * 0.24 * wander;
    }
    const x = px * cy + pz * sy;
    const z = -px * sy + pz * cy;
    const y = py * cx - z * sx;
    const depth = 6.8 - (py * sx + z * cx);
    const screenX = ((x / depth - center[0]) * focal) / aspect;
    const screenY = (y / depth - center[1]) * focal;
    envelope.minX = Math.min(envelope.minX, screenX);
    envelope.maxX = Math.max(envelope.maxX, screenX);
    envelope.minY = Math.min(envelope.minY, screenY);
    envelope.maxY = Math.max(envelope.maxY, screenY);
  }
  return envelope;
}

async function bouquetData() {
  const assets = new URL(
    process.env.BLOOM_TEST_ASSETS_URL ?? "../site/assets/",
    import.meta.url,
  );
  const manifest = JSON.parse(
    await readFile(new URL("manifest.json", assets), "utf8"),
  );
  assert.equal(manifest.version, 2);
  assert.equal(manifest.stride, 11);
  return Promise.all(
    manifest.bouquets.map(async ({ id, file, surface: surfaceFile }) => {
      assert.equal(surfaceFile, `${id}.mesh`);
      const [bytes, meshBytes] = await Promise.all([
        readFile(new URL(file, assets)),
        readFile(new URL(surfaceFile, assets)),
      ]);
      assert.equal(
        bytes.byteLength,
        120000 * 11 * 4,
        `${id}: full 120000-particle crown`,
      );
      return {
        id,
        surface: decodeSurface(
          meshBytes.buffer.slice(
            meshBytes.byteOffset,
            meshBytes.byteOffset + meshBytes.byteLength,
          ),
        ),
        data: new Float32Array(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        ),
      };
    }),
  );
}

test("actual flower contours fill 78-84% of the static viewport without losing real tips", async () => {
  const r = rig({ reducedMotion: true });
  for (const { id, data, surface } of await bouquetData()) {
    r.garden.setBouquet(data, true, surface);
    r.step(1000);
    for (const draw of r.gl.draws.slice(-6, -4)) {
      assert.equal(draw.mode, r.gl.TRIANGLES, `${id}: actual mesh is drawn`);
      assert.equal(draw.uniforms.uSurface, 1);
      assert.equal(draw.count, surface.indices.length);
    }
    const indices = r.garden.projectionIndices;
    assert.ok(
      indices.length <= 1076,
      `${id}: bounded projection sample budget`,
    );
    for (let axis = 0; axis < 3; axis++) {
      const all = { min: Infinity, max: -Infinity };
      for (let i = axis; i < data.length; i += 11) {
        all.min = Math.min(all.min, data[i]);
        all.max = Math.max(all.max, data[i]);
      }
      assert.equal(Math.min(...indices.map((i) => data[i + axis])), all.min);
      assert.equal(Math.max(...indices.map((i) => data[i + axis])), all.max);
    }
    r.garden.aspect = 1.6;
    const focal = r.garden.fitProjection(0.43, -0.15);
    const staticBounds = projectedEnvelope(data, 0.43, -0.15, focal, 1.6);
    const height = (staticBounds.maxY - staticBounds.minY) / 2;
    assert.ok(
      height >= 0.78 && height <= 0.84,
      `${id}: static height ${height}`,
    );
    const displayed = projectedEnvelope(data, 0.43, -0.15, focal, 1.6, 0);
    const displayHeight = (displayed.maxY - displayed.minY) / 2;
    assert.ok(
      displayHeight >= 0.78 && displayHeight <= 0.84,
      `${id}: shader-rest height ${displayHeight}`,
    );
    console.log(
      `FIT ${id}: static=${(height * 100).toFixed(2)}% rest=${(displayHeight * 100).toFixed(2)}% samples=${indices.length}`,
    );
    const rest = restPositions(data);
    const angles = [
      0.43,
      ...Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 6),
    ];
    for (const aspect of [0.65, 1, 1.6]) {
      r.garden.aspect = aspect;
      for (const yaw of angles)
        for (const pitch of [-0.65, -0.15, 0.65]) {
          const bounds = projectedEnvelope(
            rest,
            yaw,
            pitch,
            r.garden.fitProjection(yaw, pitch),
            aspect,
            null,
            3,
            r.garden.frameCenter,
          );
          for (const value of Object.values(bounds))
            assert.ok(
              Math.abs(value) < 0.98,
              `${id}: side/back clipping ${value}, aspect=${aspect}, yaw=${yaw}, pitch=${pitch}`,
            );
          const meshBounds = projectedEnvelope(
            surface.vertices,
            yaw,
            pitch,
            r.garden.projectionState.focal,
            aspect,
            0,
            9,
            r.garden.frameCenter,
          );
          for (const value of Object.values(meshBounds))
            assert.ok(
              Math.abs(value) < 0.98,
              `${id}: mesh clipping ${value}, aspect=${aspect}, yaw=${yaw}, pitch=${pitch}`,
            );
        }
    }
  }
});

test("tight fit follows the visible morph continuously including a rapid retarget", async () => {
  const bouquets = await bouquetData();
  const r = rig();
  r.garden.aspect = 1.6;
  r.garden.setBouquet(bouquets[0].data);
  const initial = r.garden.fitProjection(0.43, -0.15);
  r.garden.setBouquet(bouquets[1].data);
  let previous = r.garden.fitProjection(0.43, -0.15);
  assert.ok(
    Math.abs(previous - initial) / initial < 0.01,
    "retarget starts at the current visible scale",
  );
  for (let step = 0; step <= 100; step++) {
    r.garden.mix = step / 100;
    const focal = r.garden.fitProjection(0.43, -0.15);
    assert.ok(
      Math.abs(focal - previous) / previous < 0.03,
      "morph framing has no scale jump",
    );
    previous = focal;
  }
  r.garden.mix = 0.5;
  const frozenScale = r.garden.fitProjection(0.43, -0.15);
  r.garden.setBouquet(bouquets[2].data);
  const resumedScale = r.garden.fitProjection(0.43, -0.15);
  assert.ok(
    Math.abs(resumedScale - frozenScale) / frozenScale < 0.01,
    "rapid retarget preserves the intermediate scale",
  );
});

test("lighting converts linear illumination to display gamma without increasing halo strength", () => {
  const r = rig();
  assert.match(
    r.gl.shaders[0].source,
    /max\(pigment, vec3\(0\.0\)\) \* pow\(light \* mix\(\.91, 1\.0, front\), vec3\(1\.0 \/ 2\.2\)\)/,
  );
  assert.match(r.gl.shaders[1].source, /vAlpha \* \.035/);
});

test("fine surface grains scale with the projected canvas, not fixed screen-sized holes", () => {
  const r = rig({ reducedMotion: true });
  r.garden.setBouquet(particles());
  r.step(1000);
  const first = core(r).uniforms;
  assert.ok(first.uPointScale > 0);
  assert.equal(
    first.uPointScale,
    (r.canvas.height * first.uFocal * 0.027) / (2 * 6.8),
  );
  r.rect.width *= 2;
  r.rect.height *= 2;
  r.garden.resizeObserver.callback();
  r.step(2000);
  const enlarged = core(r).uniforms;
  assert.equal(enlarged.uFocal, first.uFocal);
  assert.equal(enlarged.uPointScale, first.uPointScale * 2);
  assert.equal(r.garden.time, 0);
  assert.equal(r.queue.size, 0);
  const vertex = r.gl.shaders[0].source;
  assert.match(vertex, /aMeta.x \* uPointScale \* perspective/);
  assert.match(
    vertex,
    /coreSize = clamp\(coreSize, 1\.0, \(uDust > \.5 \? 2\.5 : 3\.8\) \* uDpr\)/,
  );
  assert.match(r.gl.shaders[1].source, /smoothstep\(\.72, 1\.0, r\)/);
  assert.match(r.gl.shaders[1].source, /grain = \.975 \+ \.025/);
});

test("neutral ambient and two-sided pigment keep back-facing petals colored", () => {
  const r = rig();
  assert.match(
    r.gl.shaders[0].source,
    /vec3 light = vec3\(\.26, \.245, \.27\)/,
  );
  assert.match(r.gl.shaders[0].source, /normal \*= front \* 2\.0 - 1\.0/);
  assert.ok(Math.pow(0.245 * 0.91, 1 / 2.2) > 0.5);
});

function restPositions(data) {
  const positions = new Float32Array((data.length / 11) * 3);
  for (let i = 0, j = 0; i < data.length; i += 11, j += 3) {
    let x = data[i],
      y = data[i + 1],
      z = data[i + 2];
    const phase = data[i + 7];
    const wind = Math.sin(y * 0.85) * 0.032;
    const expansion = 1 + Math.sin(y * 0.5) * 0.012 * Math.max(0, y + 1);
    x *= expansion;
    y *= expansion;
    x += wind * Math.max(0.2, y + 2);
    z += Math.cos(x * 1.3) * 0.035;
    x += Math.sin(phase) * 0.009;
    y += Math.cos(phase) * 0.009;
    const t = Math.max(0, Math.min(1, (phase - 6.13) / 0.15));
    const wander =
      t * t * (3 - 2 * t) * Math.pow(0.5 + 0.5 * Math.sin(phase * 30), 4);
    positions[j] = x + Math.sin(phase * 9) * 0.38 * wander;
    positions[j + 1] = y + 0.52 * wander;
    positions[j + 2] = z + Math.cos(phase * 7) * 0.24 * wander;
  }
  return positions;
}

// A small depth raster measures petals that really remain in front of leaves.
// This is a structural fixture, not a replacement for the Lead's real-GL images.
function crownRaster(data, positions, yaw, pitch, focal, center) {
  const width = 512,
    height = 512;
  const depthBuffer = new Float32Array(width * height).fill(Infinity);
  const floral = new Uint8Array(width * height);
  const retention = new Float32Array(width * height);
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cx = Math.cos(pitch),
    sx = Math.sin(pitch);
  const keyLength = Math.hypot(-0.65, 0.85, 1.1),
    sideLength = Math.hypot(0.95, 0.12, -0.45);
  const scale = (height * focal * 0.027) / (2 * 6.8);
  for (let i = 0, j = 0; i < data.length; i += 11, j += 3) {
    const px = positions[j],
      py = positions[j + 1],
      pz = positions[j + 2];
    const x = px * cy + pz * sy,
      z0 = -px * sy + pz * cy;
    const y = py * cx - z0 * sx,
      z = py * sx + z0 * cx;
    const depth = 6.8 - z;
    if (depth <= 0.4) continue;
    const screenX = (((x / depth - center[0]) * focal + 1) * width) / 2;
    const screenY = ((1 - (y / depth - center[1]) * focal) * height) / 2;
    const diameter = Math.max(
      1,
      Math.min(3.8, (data[i + 6] * scale * 6.8) / depth),
    );
    const radius = (diameter * Math.sqrt(0.72)) / 2;
    const r = data[i + 3],
      g = data[i + 4],
      b = data[i + 5];
    const green = g > r * 1.1 && g > b * 1.1;
    let colored = py > -0.35 && !green && Math.max(r, g, b) > 0.25;
    let colorRetention = 0;
    if (colored) {
      let nx = data[i + 8] * cy + data[i + 10] * sy;
      const nz0 = -data[i + 8] * sy + data[i + 10] * cy;
      let ny = data[i + 9] * cx - nz0 * sx;
      let nz = data[i + 9] * sx + nz0 * cx;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;
      const viewLength = Math.hypot(x, y, depth);
      const dotView = (-nx * x - ny * y + nz * depth) / viewLength;
      const front = dotView >= 0;
      if (!front) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const key = Math.max(0, (-nx * 0.65 + ny * 0.85 + nz * 1.1) / keyLength);
      const side = Math.max(
        0,
        (nx * 0.95 + ny * 0.12 - nz * 0.45) / sideLength,
      );
      const rim = Math.pow(1 - Math.abs(dotView), 3);
      const factor = front ? 1 : 0.91;
      const colors = [
        r *
          Math.pow(
            (0.26 + key * 0.78 + 0.62 * side * 0.32 + 0.86 * rim * 0.18) *
              factor,
            1 / 2.2,
          ),
        g *
          Math.pow(
            (0.245 +
              0.86 * key * 0.78 +
              0.76 * side * 0.32 +
              0.65 * rim * 0.18) *
              factor,
            1 / 2.2,
          ),
        b *
          Math.pow(
            (0.27 + 0.8 * key * 0.78 + side * 0.32 + 0.72 * rim * 0.18) *
              factor,
            1 / 2.2,
          ),
      ];
      colored = Math.max(...colors) > 0.2;
      colorRetention = Math.max(...colors) / Math.max(r, g, b);
    }
    const minX = Math.max(0, Math.floor(screenX - radius));
    const maxX = Math.min(width - 1, Math.ceil(screenX + radius));
    const minY = Math.max(0, Math.floor(screenY - radius));
    const maxY = Math.min(height - 1, Math.ceil(screenY + radius));
    for (let yy = minY; yy <= maxY; yy++)
      for (let xx = minX; xx <= maxX; xx++) {
        if ((xx + 0.5 - screenX) ** 2 + (yy + 0.5 - screenY) ** 2 > radius ** 2)
          continue;
        const index = yy * width + xx;
        if (depth <= depthBuffer[index]) {
          depthBuffer[index] = depth;
          floral[index] = Number(colored);
          retention[index] = colorRetention;
        }
      }
  }
  let area = 0,
    minX = width,
    maxX = -1,
    minY = height,
    maxY = -1,
    retained = 0;
  const gridSide = 64,
    occupancy = new Uint8Array(gridSide * gridSide);
  for (let i = 0; i < floral.length; i++)
    if (floral[i]) {
      area++;
      retained += retention[i];
      const x = i % width,
        y = Math.floor(i / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      occupancy[Math.floor(y / 8) * gridSide + Math.floor(x / 8)] = 1;
    }
  let cells = 0,
    largest = 0;
  for (let i = 0; i < occupancy.length; i++)
    if (occupancy[i] === 1) {
      const queue = [i];
      occupancy[i] = 2;
      for (let at = 0; at < queue.length; at++) {
        const index = queue[at],
          x = index % gridSide,
          y = Math.floor(index / gridSide);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx,
              yy = y + dy;
            if (xx < 0 || xx >= gridSide || yy < 0 || yy >= gridSide) continue;
            const neighbor = yy * gridSide + xx;
            if (occupancy[neighbor] === 1) {
              occupancy[neighbor] = 2;
              queue.push(neighbor);
            }
          }
      }
      cells += queue.length;
      largest = Math.max(largest, queue.length);
    }
  return {
    area,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    continuity: largest / Math.max(1, cells),
    colorRetention: retained / Math.max(1, area),
  };
}

test("twelve directions retain a colored upper crown, not just the green back silhouette", async () => {
  const r = rig({ reducedMotion: true });
  r.garden.aspect = 1;
  for (const { id, data } of await bouquetData()) {
    r.garden.setBouquet(data);
    const positions = restPositions(data);
    const views = [];
    for (let direction = 0; direction < 12; direction++) {
      const yaw = (direction * Math.PI) / 6;
      const focal = r.garden.fitProjection(yaw, -0.15);
      views.push(
        crownRaster(data, positions, yaw, -0.15, focal, r.garden.frameCenter),
      );
    }
    const areas = views.map((view) => view.area),
      widths = views.map((view) => view.width);
    const areaRatio = Math.min(...areas) / Math.max(...areas);
    const widthRatio = Math.min(...widths) / Math.max(...widths);
    console.log(
      `CROWN ${id}: areaRatio=${areaRatio.toFixed(3)} widthRatio=${widthRatio.toFixed(3)} views=${JSON.stringify(views)}`,
    );
    assert.ok(
      areaRatio >= 0.65,
      `${id}: 360-degree visible colored area ratio ${areaRatio}`,
    );
    assert.ok(
      widthRatio >= 0.78,
      `${id}: 360-degree flower crown width ratio ${widthRatio}`,
    );
    for (const view of views) {
      assert.ok(
        view.continuity >= 0.65,
        `${id}: disconnected flower crown ${view.continuity}`,
      );
      assert.ok(
        view.colorRetention >= 0.5,
        `${id}: back-facing pigment became dark ${view.colorRetention}`,
      );
    }
  }
});

function triangleSurface(offset = 0) {
  return {
    vertices: new Float32Array([
      -0.4 + offset,
      0.1,
      0.05,
      0.9,
      0.5,
      0.6,
      0,
      0,
      1,
      0.4 + offset,
      0.1,
      0.05,
      0.9,
      0.5,
      0.6,
      0,
      0,
      1,
      offset,
      0.8,
      0.05,
      0.9,
      0.5,
      0.6,
      0,
      0,
      1,
    ]),
    indices: new Uint32Array([0, 1, 2]),
  };
}

function envelopeSurface(xScale = 1, xOffset = 0) {
  const positions = [
    [2.7, 0.3, 0.1],
    [-2.5, 0.3, 0.1],
    [0.1, 2.9, 0.1],
    [0.1, -1.9, 0.1],
    [0.1, 0.3, 2.2],
    [0.1, 0.3, -2],
  ];
  return {
    vertices: new Float32Array(
      positions.flatMap(([x, y, z]) => [
        x * xScale + xOffset,
        y,
        z,
        0.9,
        0.5,
        0.6,
        0,
        0.8,
        0.6,
      ]),
    ),
    indices: new Uint32Array([
      0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5,
    ]),
  };
}

test("mesh-only extrema fit static and idle contours in portrait and both index routes", () => {
  for (const uintIndices of [true, false]) {
    const r = rig({ reducedMotion: true, uintIndices });
    const data = particles(),
      surface = envelopeSurface();
    r.garden.setBouquet(data);
    r.step(1000);
    r.garden.aspect = 0.65;
    const oldFocal = r.garden.fitProjection(0, 0);
    const oldBounds = projectedEnvelope(
      surface.vertices,
      0,
      0,
      oldFocal,
      0.65,
      0,
      9,
      r.garden.frameCenter,
    );
    assert.ok(
      Object.values(oldBounds).some((value) => Math.abs(value) > 1),
      "fixture reproduces the former mesh-only clipping",
    );
    r.garden.setBouquet(data, true, surface);
    r.step(2000);
    const support = r.garden.surfaceSupportPoints;
    assert.ok(support.length > 0 && support.length <= 52 * 3);
    const sourcePositions = new Set(
      Array.from({ length: 6 }, (_, i) =>
        [...surface.vertices.slice(i * 9, i * 9 + 3)].join(","),
      ),
    );
    for (let i = 0; i < support.length; i += 3)
      assert.ok(
        sourcePositions.has([...support.slice(i, i + 3)].join(",")),
        "supports remain real raw vertices",
      );
    for (const time of [0, 1.7, 7.4]) {
      r.garden.time = time;
      for (const aspect of [0.65, 1, 1.6]) {
        r.garden.aspect = aspect;
        for (const yaw of [0, 0.43, Math.PI / 2, Math.PI, Math.PI * 1.5])
          for (const pitch of [-0.65, -0.15, 0.65]) {
            const focal = r.garden.fitProjection(yaw, pitch);
            assert.ok(Number.isFinite(focal) && focal > 0);
            for (const [positions, stride, clock] of [
              [data, 11, time],
              [surface.vertices, 9, null],
              [surface.vertices, 9, time],
            ]) {
              const bounds = projectedEnvelope(
                positions,
                yaw,
                pitch,
                focal,
                aspect,
                clock,
                stride,
                r.garden.frameCenter,
              );
              for (const value of Object.values(bounds))
                assert.ok(
                  Math.abs(value) < 0.98,
                  `mesh-only clipping ${value}, time=${time}, aspect=${aspect}, yaw=${yaw}, pitch=${pitch}`,
                );
            }
          }
      }
    }
    r.garden.dispose();
  }
});

test("hidden mesh retarget preserves lens and center across very different visible meshes", () => {
  for (const checkpoint of [0.45, 0.96]) {
    const r = rig();
    r.garden.appearance = 1;
    r.garden.aspect = 0.65;
    r.garden.setBouquet(particles(), true, envelopeSurface(2.6, -1.8));
    r.step(1000);
    const frame = () => {
      const focal = r.garden.fitProjection(0, 0);
      return { focal, center: [...r.garden.frameCenter] };
    };
    const sameFrame = (a, b) => {
      assert.ok(
        Math.abs(a.focal - b.focal) / a.focal < 1e-12,
        "hidden new mesh preserves the current lens",
      );
      for (let axis = 0; axis < 2; axis++)
        assert.ok(
          Math.abs(a.center[axis] - b.center[axis]) < 1e-12,
          "hidden new mesh preserves the current center",
        );
    };
    const advance = (stop) => {
      let previous = frame();
      const steps = Math.ceil(stop * 4000);
      for (let step = 0; step <= steps; step++) {
        r.garden.mix = (stop * step) / steps;
        const current = frame();
        assert.ok(
          Number.isFinite(current.focal) && current.focal > 0,
          "wide mesh transitions never invert the lens",
        );
        assert.ok(
          Math.abs(current.focal - previous.focal) / previous.focal < 0.03,
          "mesh visibility introduces no scale step",
        );
        for (let axis = 0; axis < 2; axis++)
          assert.ok(
            Math.abs(current.center[axis] - previous.center[axis]) < 0.02,
            "mesh visibility introduces no center step",
          );
        previous = current;
      }
      return previous;
    };
    const initial = frame();
    assert.equal(r.garden.surfaceOpacity, 1);
    r.garden.setBouquet(particles(0.3), false, envelopeSurface(7, 6));
    assert.equal(
      r.garden.surfaceOpacity,
      1,
      "previous rendered alpha remains stale for this regression fixture",
    );
    assert.equal(r.garden.surfaceVisibility(), 0);
    sameFrame(initial, frame());
    const frozen = advance(checkpoint),
      previousSupport = r.garden.surfaceSupportPoints;
    r.garden.setBouquet(particles(-0.3), false, envelopeSurface(0.6, -2.5));
    assert.notEqual(r.garden.surfaceSupportPoints, previousSupport);
    assert.equal(r.garden.surfaceVisibility(), 0);
    sameFrame(frozen, frame());
    advance(1);
    r.garden.dispose();
  }
});

test("mesh support ignores unreferenced vertices and clears on legacy selection and disposal", () => {
  const r = rig({ reducedMotion: true });
  const surface = triangleSurface();
  const vertices = new Float32Array([
    ...surface.vertices,
    50,
    50,
    50,
    0.9,
    0.5,
    0.6,
    0,
    0,
    1,
  ]);
  r.garden.setBouquet(particles(), true, {
    vertices,
    indices: surface.indices,
  });
  assert.equal(r.garden.surfaceSupportPoints.length, 9);
  assert.ok(
    [...r.garden.surfaceSupportPoints].every((value) => Math.abs(value) < 1),
  );
  r.garden.setBouquet(particles(), true);
  assert.equal(r.garden.surfaceSupportPoints, null);
  assert.equal(r.garden.surfaceCount, 0);
  assert.equal(r.garden.surfaceOpacity, 0);
  r.garden.setBouquet(particles(), true, envelopeSurface());
  assert.ok(r.garden.surfaceSupportPoints.length > 0);
  r.garden.dispose();
  assert.equal(r.garden.surfaceSupportPoints, null);
  assert.equal(r.garden.surfaceOpacity, 0);
});

test("surface triangles precede grain cores with continuous color, real depth and six mesh attributes", () => {
  const r = rig({ reducedMotion: true });
  const surface = triangleSurface();
  r.garden.setBouquet(particles(), false, surface);
  r.step(1000);
  assert.equal(r.gl.draws.length, 6);
  const [depth, color] = r.gl.draws;
  for (const draw of [depth, color]) {
    assert.equal(draw.mode, r.gl.TRIANGLES);
    assert.equal(draw.indexed, true);
    assert.equal(draw.indexType, r.gl.UNSIGNED_INT);
    assert.equal(draw.elementBuffer, r.garden.surfaceIndexBuffer);
    assert.equal(draw.count, 3);
    assert.equal(draw.uniforms.uSurface, 1);
    assert.equal(draw.uniforms.uSurfaceAlpha, 1);
    assert.equal(draw.pointers.size, 6);
    assert.deepEqual(
      draw.constantAttributes.get(r.gl.attributes.get("aMeta")),
      [0, 0],
    );
    for (const pointer of draw.pointers.values()) {
      assert.equal(pointer.buffer, r.garden.surfaceVertexBuffer);
      assert.equal(pointer.stride, 36);
    }
  }
  assert.equal(depth.depthMask, true);
  assert.deepEqual(depth.colorMask, [false, false, false, false]);
  assert.equal(color.depthMask, false);
  assert.deepEqual(color.colorMask, [true, true, true, true]);
  assert.ok(Math.abs(core(r).uniforms.uPointAlpha - 0.32) < 1e-12);
  assert.equal(core(r).uniforms.uSurface, 0);
  assert.equal(core(r).pointers.size, 7);
  assert.equal(core(r).pointers.get(r.gl.attributes.get("aMeta")).stride, 44);
  const fragment = r.gl.shaders[1].source;
  assert.ok(
    fragment.indexOf("if (uSurface > .5)") < fragment.indexOf("gl_PointCoord"),
  );
  assert.match(fragment, /vec4\(vColor, uSurfaceAlpha\)/);
});

test("fading surfaces blend color without writing depth until they are nearly opaque", () => {
  for (const uintIndices of [true, false]) {
    for (const [appearance, ownsDepth] of [
      [0.63, false],
      [0.8, false],
      [0.945, false],
      [0.947, true],
      [1, true],
    ]) {
      const r = rig({ uintIndices });
      r.garden.setBouquet(particles(), false, triangleSurface());
      r.garden.setPaused(true);
      r.garden.appearance = appearance;
      r.step(1000);
      const opacity = r.garden.surfaceOpacity;
      assert.ok(opacity > 0.005);
      assert.equal(opacity > 0.95, ownsDepth);
      const triangles = r.gl.draws.filter(
        (draw) => draw.mode === r.gl.TRIANGLES,
      );
      assert.equal(triangles.length, ownsDepth ? 2 : 1);
      const color = triangles.at(-1);
      assert.equal(color.depthMask, false);
      assert.equal(color.uniforms.uDepthOnly, 0);
      assert.equal(color.enabled.has(r.gl.BLEND), true);
      assert.deepEqual(color.colorMask, [true, true, true, true]);
      if (ownsDepth) assert.equal(triangles[0].depthMask, true);
      else assert.ok(triangles.every((draw) => !draw.depthMask));
      assert.ok(
        Math.abs(core(r).uniforms.uPointAlpha - (1 - opacity * 0.68)) < 1e-12,
      );
      assert.equal(r.gl.state.depthMask, true);
      assert.equal(r.queue.size, 0);
    }
  }
});

test("surface fallback expands uint indices above 65535 into exact triangle vertices", () => {
  const r = rig({ reducedMotion: true, uintIndices: false });
  const vertices = new Float32Array(70001 * 9);
  vertices.set([-0.3, 0.1, 0.05, 0.8, 0.5, 0.6, 0, 0, 1]);
  vertices.set([0.3, 0.9, 0.05, 0.8, 0.5, 0.6, 0, 0, 1], 70000 * 9);
  r.garden.setBouquet(particles(), false, {
    vertices,
    indices: new Uint32Array([70000, 0, 70000]),
  });
  r.step(1000);
  const upload = r.gl.uploads.find(
    (item) => item.buffer === r.garden.surfaceVertexBuffer,
  );
  assert.equal(upload.data.length, 27);
  assert.deepEqual(
    [...upload.data.slice(0, 9)],
    [...vertices.slice(70000 * 9, 70000 * 9 + 9)],
  );
  assert.deepEqual([...upload.data.slice(9, 18)], [...vertices.slice(0, 9)]);
  assert.equal(r.gl.draws[0].mode, r.gl.TRIANGLES);
  assert.equal(r.gl.draws[0].indexed, undefined);
  assert.equal(r.gl.draws[0].count, 3);
});

test("surface disappears during morph and burst, returns on rejoin, and paused selection is immediate", () => {
  const r = rig();
  r.garden.appearance = 1;
  r.garden.setBouquet(particles(), true, triangleSurface());
  r.step(1000);
  assert.equal(r.garden.surfaceOpacity, 1);
  r.garden.setBouquet(particles(0.1), false, triangleSurface(0.1));
  r.step(1100);
  assert.equal(r.garden.surfaceOpacity, 0);
  assert.equal(core(r).uniforms.uPointAlpha, 1);
  r.step(2800);
  assert.equal(r.garden.surfaceOpacity, 1);
  r.garden.bloom();
  r.step(3400);
  r.step(4000);
  assert.equal(r.garden.surfaceOpacity, 0);
  assert.equal(core(r).uniforms.uPointAlpha, 1);
  r.garden.setPaused(true);
  r.step(4100);
  const time = r.garden.time;
  r.garden.requestFrame();
  r.step(100000);
  assert.equal(r.garden.time, time);
  assert.equal(r.garden.surfaceOpacity, 0);
  r.garden.setBouquet(particles(0.2), false, triangleSurface(0.2));
  r.step(100100);
  assert.equal(r.garden.surfaceOpacity, 1);
  assert.equal(core(r).uniforms.uAppear, 1);
  assert.equal(r.queue.size, 0);
});

test("surface reveal follows appearance and reduced motion restores a complete single frame", () => {
  const r = rig();
  r.garden.setBouquet(particles(), false, triangleSurface());
  r.step(1000);
  assert.equal(r.garden.surfaceOpacity, 0);
  r.step(1800);
  assert.equal(r.garden.surfaceOpacity, 1);
  r.garden.bloom();
  r.step(2400);
  r.step(3000);
  assert.equal(r.garden.surfaceOpacity, 0);
  r.garden.setReducedMotion(true);
  r.step(3100);
  assert.equal(r.garden.surfaceOpacity, 1);
  assert.equal(r.queue.size, 0);
});

test("rapid surface retarget replaces target buffers and legacy selection clears the old mesh", () => {
  const r = rig();
  r.garden.appearance = 1;
  r.garden.setBouquet(particles(), true, triangleSurface());
  r.step(1000);
  r.garden.setBouquet(particles(0.1), false, triangleSurface(0.1));
  r.step(1200);
  const next = triangleSurface(-0.1);
  r.garden.setBouquet(particles(-0.1), false, next);
  const upload = r.gl.uploads.findLast(
    (item) => item.buffer === r.garden.surfaceVertexBuffer,
  );
  assert.deepEqual([...upload.data], [...next.vertices]);
  r.step(1400);
  assert.equal(r.garden.surfaceOpacity, 0);
  r.step(3200);
  assert.equal(r.garden.surfaceOpacity, 1);
  const before = r.gl.draws.length;
  r.garden.setBouquet(particles(0.2));
  r.step(3400);
  assert.equal(r.garden.surfaceCount, 0);
  assert.equal(r.garden.surfaceOpacity, 0);
  assert.ok(
    r.gl.draws.slice(before).every((draw) => draw.mode === r.gl.POINTS),
  );
  assert.throws(
    () =>
      r.garden.setBouquet(particles(), false, {
        vertices: next.vertices,
        indices: new Uint32Array([3, 0, 1]),
      }),
    /surface index/,
  );
});

test("surface resize and context loss keep single-frame lifecycle and stop later GPU uploads", () => {
  const r = rig({ reducedMotion: true });
  r.garden.setBouquet(particles(), false, triangleSurface());
  r.step(1000);
  r.rect.width = 390;
  r.garden.resizeObserver.callback();
  r.step(2000);
  assert.equal(r.garden.surfaceOpacity, 1);
  assert.equal(r.queue.size, 0);
  const uploads = r.gl.uploads.length,
    draws = r.gl.draws.length;
  r.canvas.emit("webglcontextlost", { preventDefault() {} });
  r.garden.setBouquet(particles(0.1), false, triangleSurface(0.1));
  r.garden.requestFrame();
  assert.equal(r.gl.uploads.length, uploads);
  assert.equal(r.gl.draws.length, draws);
  assert.equal(r.queue.size, 0);
});

test("dispose releases five GPU buffers, observers and listeners exactly once", () => {
  const r = rig();
  r.garden.setBouquet(particles(), false, triangleSurface());
  r.step(1000);
  const uploads = r.gl.uploads.length;
  assert.ok(r.canvas.listenerCount() > 0);
  r.garden.dispose();
  r.garden.dispose();
  assert.equal(r.gl.deletedBuffers.length, 5);
  assert.equal(new Set(r.gl.deletedBuffers).size, 5);
  assert.equal(r.gl.deletedPrograms.length, 1);
  assert.equal(r.garden.resizeObserver.disconnected, true);
  assert.equal(r.canvas.listenerCount(), 0);
  assert.equal(r.document.listenerCount(), 0);
  assert.equal(r.queue.size, 0);
  r.garden.setBouquet(particles(0.1), false, triangleSurface());
  r.garden.requestFrame();
  assert.equal(r.gl.uploads.length, uploads);
  assert.equal(r.queue.size, 0);
});
