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

function eventTarget(extra = {}) {
  const listeners = new Map();
  return Object.assign(extra, {
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
    emit(name, event = {}) {
      for (const callback of listeners.get(name) || [])
        callback({ type: name, ...event });
    },
  });
}

function fakeGL() {
  const enabled = new Set();
  const uniforms = {};
  const pointers = new Map();
  const attributes = new Map();
  let nextBuffer = 0;
  let bound = null;
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
    bindBuffer(_target, buffer) {
      bound = buffer;
    },
    bufferData(_target, data) {
      this.uploads.push({ buffer: bound, data: new Float32Array(data) });
    },
    enableVertexAttribArray(index) {
      assert.ok(index >= 0 && index < 7);
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
        colorMask: [...colorMask],
        depthMask,
        depthFunction,
        blend,
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
  ])
    gl[name] = name;
  gl.COLOR_BUFFER_BIT = 1;
  gl.DEPTH_BUFFER_BIT = 2;
  return gl;
}

function rig(options = {}) {
  const gl = fakeGL();
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
  assert.match(r.gl.shaders[1].source, /r > \.64/);
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
          assert.ok(Math.abs((x * focal) / depth / aspect) < 0.9);
          assert.ok(Math.abs((y * focal) / depth) < 0.9);
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

function projectedEnvelope(data, yaw, pitch, focal, aspect, time = null) {
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
  for (let i = 0; i < data.length; i += 11) {
    let px = data[i],
      py = data[i + 1],
      pz = data[i + 2];
    if (time !== null) {
      const phase = data[i + 7];
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
    const screenX = (x * focal) / depth / aspect;
    const screenY = (y * focal) / depth;
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
    manifest.bouquets.map(async ({ id, file }) => {
      const bytes = await readFile(new URL(file, assets));
      return {
        id,
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
  for (const { id, data } of await bouquetData()) {
    r.garden.setBouquet(data);
    const indices = r.garden.projectionIndices;
    assert.ok(
      indices.length <= 1050,
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
    for (const aspect of [0.65, 1, 1.6]) {
      r.garden.aspect = aspect;
      for (const yaw of [-Math.PI, -1.57, 0.43, 1.57, Math.PI])
        for (const pitch of [-0.65, -0.15, 0.65]) {
          const bounds = projectedEnvelope(
            data,
            yaw,
            pitch,
            r.garden.fitProjection(yaw, pitch),
            aspect,
            0,
          );
          for (const value of Object.values(bounds))
            assert.ok(
              Math.abs(value) < 0.98,
              `${id}: side/back clipping ${value}, aspect=${aspect}, yaw=${yaw}, pitch=${pitch}`,
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
    /max\(pigment, vec3\(0\.0\)\) \* pow\(light \* mix\(\.82, 1\.0, front\), vec3\(1\.0 \/ 2\.2\)\)/,
  );
  assert.match(r.gl.shaders[1].source, /vAlpha \* \.035/);
});
