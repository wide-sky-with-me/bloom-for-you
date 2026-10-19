// Decision: .agents/notes/implemented/particle-depth/2026-10-19-normal-lit-bouquets.md
const STRIDE = 11;
const STRIDE_BYTES = STRIDE * Float32Array.BYTES_PER_ELEMENT;
const CAMERA_DISTANCE = 6.8;
const SUPPORT_DIRECTIONS = [];
for (const x of [-1, 0, 1])
  for (const y of [-1, 0, 1])
    for (const z of [-1, 0, 1])
      if (x || y || z) SUPPORT_DIRECTIONS.push([x, y, z]);

function ramp(low, high, value) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

function idlePosition(x, y, z, phase, time) {
  const wind = Math.sin(time * 0.65 + y * 0.85) * 0.032;
  const expansion =
    1 + Math.sin(time * 0.82 + y * 0.5) * 0.012 * Math.max(0, y + 1);
  x *= expansion;
  y *= expansion;
  x += wind * Math.max(0.2, y + 2);
  z += Math.cos(time * 0.55 + x * 1.3) * 0.035;
  x += Math.sin(time + phase) * 0.009;
  y += Math.cos(time * 0.7 + phase) * 0.009;
  const t = Math.max(0, Math.min(1, (phase - 6.13) / 0.15));
  const wander =
    t *
    t *
    (3 - 2 * t) *
    Math.pow(0.5 + 0.5 * Math.sin(time * 0.8 + phase * 30), 4);
  return [
    x + Math.sin(phase * 9 + time * 0.6) * 0.38 * wander,
    y + 0.52 * wander,
    z + Math.cos(phase * 7 + time) * 0.24 * wander,
  ];
}

const VERTEX = `
precision highp float;
attribute vec3 aPosition;
attribute vec3 aTarget;
attribute vec3 aColor;
attribute vec3 aTargetColor;
attribute vec2 aMeta;
attribute vec3 aNormal;
attribute vec3 aTargetNormal;
uniform float uMix;
uniform float uTime;
uniform float uBurst;
uniform float uAppear;
uniform vec2 uRotation;
uniform vec2 uPointer;
uniform float uAspect;
uniform float uDpr;
uniform float uFocal;
uniform float uCameraDistance;
uniform float uPointScale;
uniform vec2 uFrameCenter;
uniform mediump float uSurface;
uniform mediump float uGlow;
uniform mediump float uDust;
varying mediump vec3 vColor;
varying mediump float vAlpha;
vec3 rotate(vec3 p) {
  float cy = cos(uRotation.x), sy = sin(uRotation.x);
  float cx = cos(uRotation.y), sx = sin(uRotation.y);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  return vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
}
void main() {
  float phase = aMeta.y;
  vec3 p = mix(aPosition, aTarget, uMix);
  vec3 direction = normalize(vec3(sin(phase * 7.1), cos(phase * 4.3), sin(phase * 3.7)) + vec3(.001));
  float scatter = (uBurst + (1.0 - uAppear) * .85) * (1.0 - uSurface);
  p += direction * scatter * (0.7 + fract(phase * 3.1) * 1.8);
  p.y += scatter * sin(phase * 6.0 + uTime * .6) * .3;
  float wind = sin(uTime * .65 + p.y * .85) * .032;
  float breath = sin(uTime * .82 + p.y * .5) * .012;
  p.xy *= 1.0 + breath * max(0.0, p.y + 1.0);
  p.x += wind * max(.2, p.y + 2.0);
  p.z += cos(uTime * .55 + p.x * 1.3) * .035;
  p += vec3(sin(uTime + phase), cos(uTime * .7 + phase), 0.) * .009;
  float wander = smoothstep(6.13, 6.28, phase) * pow(.5 + .5 * sin(uTime * .8 + phase * 30.0), 4.0);
  p += vec3(sin(phase * 9.0 + uTime * .6) * .38, .52, cos(phase * 7.0 + uTime) * .24) * wander;
  if (uDust > .5) {
    p.y = mod(p.y + uTime * .095 + 4.0, 8.0) - 4.0;
    p.x += sin(uTime * .2 + phase) * .18;
  }
  p = rotate(p);
  float depth = max(.2, uCameraDistance - p.z);
  float perspective = uCameraDistance / depth;
  vec2 screen = (p.xy / depth - uFrameCenter * (1.0 - uDust)) * uFocal;
  vec2 delta = screen - uPointer;
  float proximity = exp(-dot(delta, delta) * 25.0) * (1.0 - uDust);
  screen += delta * proximity * .035;
  // Standard perspective clip coordinates: depth participates in the divide.
  const float near = .4, far = 24.0;
  float clipZ = (far + near) / (far - near) * depth - 2.0 * far * near / (far - near);
  gl_Position = vec4(screen.x * depth / uAspect, screen.y * depth, clipZ, depth);
  // World-sized grains keep the same surface coverage as the canvas or lens grows.
  float coreSize = aMeta.x * uPointScale * perspective;
  if (uDust > .5) coreSize = aMeta.x * uDpr * perspective * 2.2;
  coreSize = clamp(coreSize, 1.0, (uDust > .5 ? 2.5 : 3.8) * uDpr);
  gl_PointSize = coreSize * (1.0 + uGlow * 1.55);
  vec3 blendedNormal = mix(aNormal, aTargetNormal, uMix);
  if (dot(blendedNormal, blendedNormal) < .0001) {
    blendedNormal = dot(aNormal, aNormal) < .0001 ? vec3(0.0, 0.0, 1.0) : aNormal;
  }
  vec3 normal = normalize(rotate(blendedNormal));
  vec3 view = normalize(vec3(0.0, 0.0, uCameraDistance) - p);
  float front = step(0.0, dot(normal, view));
  normal *= front * 2.0 - 1.0;
  vec3 keyDirection = normalize(vec3(-.65, .85, 1.1));
  vec3 sideDirection = normalize(vec3(.95, .12, -.45));
  float key = max(0.0, dot(normal, keyDirection));
  float side = max(0.0, dot(normal, sideDirection));
  float rim = pow(1.0 - max(0.0, dot(normal, view)), 3.0);
  vec3 light = vec3(.26, .245, .27)
    + vec3(1.0, .86, .80) * key * .78
    + vec3(.62, .76, 1.0) * side * .32
    + vec3(.86, .65, .72) * rim * .18;
  vec3 pigment = mix(aColor, aTargetColor, uMix);
  vColor = max(pigment, vec3(0.0)) * pow(light * mix(.91, 1.0, front), vec3(1.0 / 2.2));
  vAlpha = uAppear * (.96 + .03 * sin(phase + uTime * 1.3));
  if (uDust > .5) {
    vColor = pigment * .72;
    vAlpha *= .10 + .15 * pow(.5 + .5 * sin(phase * 3. + uTime * .7), 3.);
  }
}
`;

const FRAGMENT = `
precision mediump float;
uniform mediump float uGlow;
uniform mediump float uDust;
uniform mediump float uDepthOnly;
uniform mediump float uSurface;
uniform mediump float uSurfaceAlpha;
uniform mediump float uPointAlpha;
varying mediump vec3 vColor;
varying mediump float vAlpha;
void main() {
  if (uSurface > .5) {
    if (uSurfaceAlpha < .005) discard;
    gl_FragColor = vec4(vColor, uSurfaceAlpha);
    return;
  }
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = dot(q, q);
  if (r > 1.0 || vAlpha < .008) discard;
  // Only the opaque grain core owns depth; halos never cut holes in petals.
  if (uDepthOnly > .5) {
    if (r > .72) discard;
    gl_FragColor = vec4(0.0);
    return;
  }
  float alpha;
  if (uGlow > .5) {
    alpha = exp(-r * 4.5) * vAlpha * .035;
  } else if (uDust > .5) {
    alpha = exp(-r * 3.0) * vAlpha;
  } else {
    alpha = (1.0 - smoothstep(.72, 1.0, r)) * vAlpha;
  }
  if (uDust < .5) alpha *= uPointAlpha;
  if (alpha < .004) discard;
  float grain = .975 + .025 * sin(q.x * 13.0 + q.y * 17.0);
  gl_FragColor = vec4(vColor * grain, alpha);
}
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(error);
  }
  return shader;
}

export class ParticleGarden {
  constructor(
    canvas,
    {
      reducedMotion = false,
      onLost = () => {},
      onMotionChange = () => {},
    } = {},
  ) {
    this.canvas = canvas;
    this.onMotionChange = onMotionChange;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL unavailable");
    this.gl = gl;
    this.program = gl.createProgram();
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);
    this.attributes = Object.fromEntries(
      [
        "aPosition",
        "aTarget",
        "aColor",
        "aTargetColor",
        "aMeta",
        "aNormal",
        "aTargetNormal",
      ].map((key) => [key, gl.getAttribLocation(this.program, key)]),
    );
    this.uniforms = Object.fromEntries(
      [
        "uMix",
        "uTime",
        "uBurst",
        "uAppear",
        "uRotation",
        "uPointer",
        "uAspect",
        "uDpr",
        "uGlow",
        "uDust",
        "uDepthOnly",
        "uFocal",
        "uCameraDistance",
        "uPointScale",
        "uFrameCenter",
        "uSurface",
        "uSurfaceAlpha",
        "uPointAlpha",
      ].map((key) => [key, gl.getUniformLocation(this.program, key)]),
    );
    this.currentBuffer = gl.createBuffer();
    this.targetBuffer = gl.createBuffer();
    this.dustBuffer = gl.createBuffer();
    this.surfaceVertexBuffer = gl.createBuffer();
    this.surfaceIndexBuffer = gl.createBuffer();
    this.uintIndices = !!gl.getExtension?.("OES_element_index_uint");
    this.surfaceCount = 0;
    this.surfaceSupportPoints = null;
    this.surfaceOpacity = 0;
    this.listeners = [];
    this.reducedMotion = reducedMotion;
    this.paused = reducedMotion;
    this.rotation = [0.43, -0.15];
    this.targetRotation = [...this.rotation];
    this.pointer = [20, 20];
    this.time = 0;
    this.elapsed = 0;
    this.mix = 1;
    this.transitionAt = 0;
    this.burstAt = -100;
    this.appearance = reducedMotion ? 1 : 0;
    this.raf = 0;
    this.lastFrame = 0;
    this.data = null;
    this.targetData = null;
    this.frameCenter = [0, 0];
    this.visible = !document.hidden;
    this.lost = false;
    this.createDust();
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      this.requestFrame();
    });
    this.resizeObserver.observe(canvas);
    this.listen(canvas, "webglcontextlost", (event) => {
      event.preventDefault();
      this.lost = true;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      onLost();
    });
    this.listen(document, "visibilitychange", () => {
      this.visible = !document.hidden;
      this.lastFrame = 0;
      if (this.visible) this.requestFrame();
      else {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
      }
    });
    this.resize();
    this.bindPointer();
  }

  createDust() {
    const gl = this.gl;
    const dust = new Float32Array(360 * STRIDE);
    // A stable field avoids a different background on every frame or resize.
    for (let i = 0; i < 360; i++) {
      const h = (n) => {
        const v = Math.sin(i * 127.1 + n * 311.7) * 43758.5453;
        return v - Math.floor(v);
      };
      dust.set(
        [
          (h(1) - 0.5) * 9,
          (h(2) - 0.5) * 8,
          (h(3) - 0.5) * 4,
          0.9,
          0.68 + h(4) * 0.15,
          0.68 + h(5) * 0.2,
          0.4 + h(6) * 0.65,
          h(7) * Math.PI * 2,
          0,
          0,
          1,
        ],
        i * STRIDE,
      );
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dustBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, dust, gl.STATIC_DRAW);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.8);
    const width = Math.max(1, Math.round(rect.width * this.dpr));
    const height = Math.max(1, Math.round(rect.height * this.dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
    this.aspect = width / height;
  }

  setBouquet(data, immediate = false, surface = null) {
    if (this.disposed || this.lost) return;
    if (!data.length || data.length % STRIDE)
      throw new Error("Invalid particle stride: expected 11 Float32 values");
    this.setSurface(surface);
    const previousFrame = this.projectionState;
    const direct =
      !this.data ||
      this.data.length !== data.length ||
      immediate ||
      this.reducedMotion ||
      this.paused;
    if (direct) {
      if (this.paused) this.appearance = 1;
      this.burstAt = -100;
      this.data = data;
      this.targetData = data;
      this.mix = 1;
    } else {
      // Freeze the visible intermediate shape before retargeting a rapid click.
      const frozen = new Float32Array(this.data.length);
      const m = this.mix;
      for (let i = 0; i < frozen.length; i++)
        frozen[i] = this.data[i] * (1 - m) + this.targetData[i] * m;
      this.data = frozen;
      this.targetData = data;
      this.mix = 0;
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.currentBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.data, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.targetBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.targetData, gl.STATIC_DRAW);
    this.count = data.length / STRIDE;
    this.projectionCache ||= new WeakMap();
    this.projectionIndices = [
      ...new Set([
        ...this.sampleProjection(this.data),
        ...this.sampleProjection(this.targetData),
      ]),
    ];
    this.framingAnchor = null;
    if (!direct && previousFrame) {
      const start = this.measureProjection(
        previousFrame.yaw,
        previousFrame.pitch,
      );
      this.framingAnchor = {
        scale: previousFrame.focal / start.focal,
        center: previousFrame.center.map(
          (value, axis) => value - start.center[axis],
        ),
      };
    }
    this.transitionAt = this.elapsed - (direct ? 1.6 : 0);
    this.requestFrame();
  }

  listen(target, name, callback) {
    target.addEventListener(name, callback);
    this.listeners.push(() => target.removeEventListener?.(name, callback));
  }

  setSurface(surface) {
    if (!surface) {
      this.surfaceCount = 0;
      this.surfaceOpacity = 0;
      this.surfaceSupportPoints = null;
      return;
    }
    const { vertices, indices } = surface;
    if (
      !(vertices instanceof Float32Array) ||
      !(indices instanceof Uint32Array) ||
      !vertices.length ||
      vertices.length % 9 ||
      !indices.length ||
      indices.length % 3
    )
      throw new Error("Invalid surface geometry");
    const vertexCount = vertices.length / 9;
    for (const index of indices)
      if (index >= vertexCount) throw new Error("Invalid surface index");
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.surfaceVertexBuffer);
    if (this.uintIndices) {
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.surfaceIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    } else {
      // WebGL1 without uint indices still draws the same triangles, without truncation.
      const expanded = new Float32Array(indices.length * 9);
      for (let i = 0; i < indices.length; i++)
        expanded.set(
          vertices.subarray(indices[i] * 9, indices[i] * 9 + 9),
          i * 9,
        );
      gl.bufferData(gl.ARRAY_BUFFER, expanded, gl.STATIC_DRAW);
    }
    this.surfaceSupportPoints = this.sampleSurfaceSupport(vertices, indices);
    this.surfaceCount = indices.length;
  }

  sampleSurfaceSupport(vertices, indices) {
    const support = SUPPORT_DIRECTIONS.map(() => [-Infinity, 0]);
    const motionSupport = SUPPORT_DIRECTIONS.map(() => [-Infinity, 0]);
    const seen = new Uint8Array(vertices.length / 9);
    for (const vertex of indices) {
      if (seen[vertex]) continue;
      seen[vertex] = 1;
      const i = vertex * 9;
      const p = idlePosition(
        vertices[i],
        vertices[i + 1],
        vertices[i + 2],
        0,
        0,
      );
      for (let j = 0; j < SUPPORT_DIRECTIONS.length; j++) {
        const d = SUPPORT_DIRECTIONS[j];
        const dot =
          vertices[i] * d[0] + vertices[i + 1] * d[1] + vertices[i + 2] * d[2];
        const movedDot = p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
        if (dot > support[j][0]) support[j] = [dot, i];
        if (movedDot > motionSupport[j][0]) motionSupport[j] = [movedDot, i];
      }
    }
    const samples = new Set([...support, ...motionSupport].map(([, i]) => i));
    return new Float32Array(
      [...samples].flatMap((i) => [
        vertices[i],
        vertices[i + 1],
        vertices[i + 2],
      ]),
    );
  }

  surfaceVisibility(burst) {
    if (!this.surfaceCount) return 0;
    if (burst === undefined) {
      const age = this.elapsed - this.burstAt;
      burst =
        age < 3.8
          ? Math.pow(Math.sin(Math.min(1, age / 3.8) * Math.PI), 2) * 1.25
          : 0;
    }
    return (
      ramp(0.6, 1, this.appearance) *
      ramp(0.86, 1, this.mix) *
      (1 - ramp(0.01, 0.18, this.reducedMotion ? 0 : burst))
    );
  }

  bindSurfaceAttributes() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.surfaceVertexBuffer);
    for (const [names, offset] of [
      [["aPosition", "aTarget"], 0],
      [["aColor", "aTargetColor"], 12],
      [["aNormal", "aTargetNormal"], 24],
    ])
      for (const name of names) {
        const index = this.attributes[name];
        gl.enableVertexAttribArray(index);
        gl.vertexAttribPointer(index, 3, gl.FLOAT, false, 36, offset);
      }
    gl.disableVertexAttribArray(this.attributes.aMeta);
    gl.vertexAttrib2f(this.attributes.aMeta, 0, 0);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.lost = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.resizeObserver.disconnect();
    for (const remove of this.listeners) remove();
    this.listeners = [];
    for (const buffer of [
      this.currentBuffer,
      this.targetBuffer,
      this.dustBuffer,
      this.surfaceVertexBuffer,
      this.surfaceIndexBuffer,
    ])
      this.gl.deleteBuffer(buffer);
    this.gl.deleteProgram(this.program);
    this.data = this.targetData = null;
    this.surfaceCount = 0;
    this.surfaceOpacity = 0;
    this.surfaceSupportPoints = null;
    this.projectionIndices = [];
    this.projectionState = this.framingAnchor = null;
  }

  bindAttributes(from, to) {
    const gl = this.gl;
    const bind = (name, size, offset) => {
      const index = this.attributes[name];
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(
        index,
        size,
        gl.FLOAT,
        false,
        STRIDE_BYTES,
        offset,
      );
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, from);
    bind("aPosition", 3, 0);
    bind("aColor", 3, 12);
    bind("aMeta", 2, 24);
    bind("aNormal", 3, 32);
    gl.bindBuffer(gl.ARRAY_BUFFER, to);
    bind("aTarget", 3, 0);
    bind("aTargetColor", 3, 12);
    bind("aTargetNormal", 3, 32);
  }

  sampleProjection(data) {
    const cached = this.projectionCache.get(data);
    if (cached) return cached;
    const count = data.length / STRIDE;
    const indices = new Set();
    const budget = Math.min(1024, count);
    for (let i = 0; i < budget; i++) {
      indices.add(
        Math.round((i * (count - 1)) / Math.max(1, budget - 1)) * STRIDE,
      );
    }
    // Directional support points retain true tips and edges, not empty AABB corners.
    const directions = SUPPORT_DIRECTIONS;
    const support = directions.map(() => [-Infinity, 0]);
    const motionSupport = directions.map(() => [-Infinity, 0]);
    for (let i = 0; i < data.length; i += STRIDE) {
      const p = idlePosition(data[i], data[i + 1], data[i + 2], data[i + 7], 0);
      for (let j = 0; j < directions.length; j++) {
        const d = directions[j];
        const dot = data[i] * d[0] + data[i + 1] * d[1] + data[i + 2] * d[2];
        const movedDot = p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
        if (dot > support[j][0]) support[j] = [dot, i];
        if (movedDot > motionSupport[j][0]) motionSupport[j] = [movedDot, i];
      }
    }
    for (const [, index] of [...support, ...motionSupport]) indices.add(index);
    const samples = [...indices];
    this.projectionCache.set(data, samples);
    return samples;
  }

  measureProjection(yaw, pitch) {
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw);
    const cx = Math.cos(pitch),
      sx = Math.sin(pitch);
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const i of this.projectionIndices) {
      const p = idlePosition(
        this.data[i] + (this.targetData[i] - this.data[i]) * this.mix,
        this.data[i + 1] +
          (this.targetData[i + 1] - this.data[i + 1]) * this.mix,
        this.data[i + 2] +
          (this.targetData[i + 2] - this.data[i + 2]) * this.mix,
        this.data[i + 7],
        this.time,
      );
      const x = p[0] * cy + p[2] * sy;
      const z = -p[0] * sy + p[2] * cy;
      const y = p[1] * cx - z * sx;
      const depth = Math.max(0.2, CAMERA_DISTANCE - (p[1] * sx + z * cx));
      minX = Math.min(minX, x / depth);
      maxX = Math.max(maxX, x / depth);
      minY = Math.min(minY, y / depth);
      maxY = Math.max(maxY, y / depth);
    }
    // Hidden targets do not reframe a morph; visible mesh extents ease into the same lens.
    const weight = ramp(0.005, 1, this.surfaceVisibility());
    if (weight > 0 && this.surfaceSupportPoints) {
      const pointBounds = [minX, maxX, minY, maxY];
      for (let i = 0; i < this.surfaceSupportPoints.length; i += 3) {
        const p = idlePosition(
          this.surfaceSupportPoints[i],
          this.surfaceSupportPoints[i + 1],
          this.surfaceSupportPoints[i + 2],
          0,
          this.time,
        );
        const x = p[0] * cy + p[2] * sy;
        const z = -p[0] * sy + p[2] * cy;
        const y = p[1] * cx - z * sx;
        const depth = Math.max(0.2, CAMERA_DISTANCE - (p[1] * sx + z * cx));
        minX = Math.min(minX, x / depth);
        maxX = Math.max(maxX, x / depth);
        minY = Math.min(minY, y / depth);
        maxY = Math.max(maxY, y / depth);
      }
      minX = pointBounds[0] + (minX - pointBounds[0]) * weight;
      maxX = pointBounds[1] + (maxX - pointBounds[1]) * weight;
      minY = pointBounds[2] + (minY - pointBounds[2]) * weight;
      maxY = pointBounds[3] + (maxY - pointBounds[3]) * weight;
    }
    return {
      center: [(minX + maxX) / 2, (minY + maxY) / 2],
      focal: Math.min(
        1.62 / Math.max(0.001, maxY - minY),
        (1.7 * this.aspect) / Math.max(0.001, maxX - minX),
      ),
    };
  }

  fitProjection(yaw, pitch) {
    const frame = this.measureProjection(yaw, pitch);
    if (this.framingAnchor) {
      const remaining = 1 - this.mix;
      // A positive scale ratio also handles a wide outgoing mesh without inverting the lens.
      frame.focal *= 1 + (this.framingAnchor.scale - 1) * remaining;
      frame.center = frame.center.map(
        (value, axis) => value + this.framingAnchor.center[axis] * remaining,
      );
    }
    this.frameCenter = frame.center;
    this.projectionState = { ...frame, yaw, pitch };
    return frame.focal;
  }

  requestFrame() {
    if (!this.raf && this.visible && !this.lost)
      this.raf = requestAnimationFrame((now) => this.frame(now));
  }

  frame(now) {
    this.raf = 0;
    if (!this.data || this.lost || !this.visible) return;
    // Motion is analytic, so low frame rates must not slow the flower's clock.
    const dt = this.lastFrame
      ? Math.max(0, (now - this.lastFrame) / 1000)
      : 0.016;
    this.lastFrame = now;
    if (!this.paused) {
      this.elapsed += dt;
      this.time += dt;
      this.appearance = Math.min(1, this.appearance + dt * 1.4);
    }
    const transition = Math.min(1, (this.elapsed - this.transitionAt) / 1.6);
    this.mix = transition * transition * (3 - 2 * transition);
    if (this.reducedMotion) this.mix = 1;
    const age = this.elapsed - this.burstAt;
    const burst =
      age < 3.8
        ? Math.pow(Math.sin(Math.min(1, age / 3.8) * Math.PI), 2) * 1.25
        : 0;
    const rotationEase = this.reducedMotion ? 1 : Math.min(1, dt * 7);
    this.rotation[0] +=
      (this.targetRotation[0] - this.rotation[0]) * rotationEase;
    this.rotation[1] +=
      (this.targetRotation[1] - this.rotation[1]) * rotationEase;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.colorMask(true, true, true, true);
    gl.depthMask(true);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    const f = (name, value) => gl.uniform1f(this.uniforms[name], value);
    f("uMix", this.mix);
    f("uTime", this.time);
    f("uBurst", this.reducedMotion ? 0 : burst);
    f("uAppear", this.appearance);
    f("uAspect", this.aspect);
    f("uDpr", this.dpr);
    f("uDust", 0);
    f("uSurface", 0);
    this.surfaceOpacity = this.surfaceVisibility(burst);
    f("uSurfaceAlpha", this.surfaceOpacity);
    f("uPointAlpha", 1 - this.surfaceOpacity * 0.68);
    // This clock is frozen by pause, reduced motion and hidden-page suspension.
    const yaw = this.rotation[0] + Math.sin(this.time * 0.12) * 0.16;
    const pitch = this.rotation[1] + Math.sin(this.time * 0.09) * 0.035;
    const focal = this.fitProjection(yaw, pitch);
    f("uFocal", focal);
    f(
      "uPointScale",
      (this.canvas.height * focal * 0.027 * (1 - this.surfaceOpacity * 0.38)) /
        (2 * CAMERA_DISTANCE),
    );
    f("uCameraDistance", CAMERA_DISTANCE);
    gl.uniform2f(this.uniforms.uRotation, yaw, pitch);
    gl.uniform2f(this.uniforms.uFrameCenter, ...this.frameCenter);
    gl.uniform2f(this.uniforms.uPointer, ...this.pointer);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );
    if (this.surfaceOpacity > 0.005) {
      this.bindSurfaceAttributes();
      f("uSurface", 1);
      f("uGlow", 0);
      const drawSurface = () => {
        if (this.uintIndices) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.surfaceIndexBuffer);
          gl.drawElements(gl.TRIANGLES, this.surfaceCount, gl.UNSIGNED_INT, 0);
        } else gl.drawArrays(gl.TRIANGLES, 0, this.surfaceCount);
      };
      // A fading surface must not become an invisible opaque particle occluder.
      if (this.surfaceOpacity > 0.95) {
        gl.disable(gl.BLEND);
        gl.colorMask(false, false, false, false);
        gl.depthMask(true);
        f("uDepthOnly", 1);
        drawSurface();
      }
      gl.enable(gl.BLEND);
      gl.colorMask(true, true, true, true);
      gl.depthMask(false);
      f("uDepthOnly", 0);
      drawSurface();
      f("uSurface", 0);
    }
    this.bindAttributes(this.currentBuffer, this.targetBuffer);
    gl.disable(gl.BLEND);
    gl.colorMask(false, false, false, false);
    gl.depthMask(true);
    f("uGlow", 0);
    f("uDepthOnly", 1);
    gl.drawArrays(gl.POINTS, 0, this.count);

    gl.colorMask(true, true, true, true);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    f("uDepthOnly", 0);
    gl.drawArrays(gl.POINTS, 0, this.count);

    // Halo and ambient grains share the flower depth buffer, never additive fog.
    f("uGlow", 1);
    gl.drawArrays(gl.POINTS, 0, this.count);
    this.bindAttributes(this.dustBuffer, this.dustBuffer);
    f("uGlow", 0);
    f("uDust", 1);
    f("uMix", 0);
    f("uBurst", 0);
    gl.drawArrays(gl.POINTS, 0, 360);
    gl.depthMask(true);
    this.canvas.dataset.rendered = "true";
    const rotating =
      Math.abs(this.rotation[0] - this.targetRotation[0]) +
        Math.abs(this.rotation[1] - this.targetRotation[1]) >
      0.001;
    if (!this.paused || rotating) this.requestFrame();
    else this.lastFrame = 0;
  }

  bloom() {
    if (this.reducedMotion) return;
    this.setPaused(false);
    this.burstAt = this.elapsed;
    this.requestFrame();
  }

  setPaused(value) {
    this.paused = value;
    this.lastFrame = 0;
    this.onMotionChange(value);
    this.requestFrame();
  }

  setReducedMotion(value) {
    this.reducedMotion = value;
    this.appearance = 1;
    this.setPaused(value);
  }

  bindPointer() {
    let origin = null;
    this.listen(this.canvas, "pointerdown", (event) => {
      if (!event.isPrimary) return;
      origin = {
        x: event.clientX,
        y: event.clientY,
        rotation: [...this.targetRotation],
        moved: false,
        id: event.pointerId,
      };
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.listen(this.canvas, "pointermove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer = [
        (((event.clientX - rect.left) / rect.width) * 2 - 1) * this.aspect,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      ];
      if (origin && origin.id === event.pointerId) {
        const dx = event.clientX - origin.x;
        const dy = event.clientY - origin.y;
        origin.moved ||= Math.hypot(dx, dy) > 8;
        this.targetRotation[0] = origin.rotation[0] + dx * 0.006;
        this.targetRotation[1] = Math.max(
          -0.65,
          Math.min(0.65, origin.rotation[1] + dy * 0.004),
        );
      }
      this.requestFrame();
    });
    const release = (event) => {
      if (
        origin &&
        origin.id === event.pointerId &&
        !origin.moved &&
        event.type === "pointerup"
      )
        this.bloom();
      origin = null;
    };
    this.listen(this.canvas, "pointerup", release);
    this.listen(this.canvas, "pointercancel", release);
    this.listen(this.canvas, "lostpointercapture", () => {
      origin = null;
    });
    this.listen(this.canvas, "pointerleave", () => {
      this.pointer = [20, 20];
      this.requestFrame();
    });
    this.listen(this.canvas, "keydown", (event) => {
      const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      if (event.key === " ") this.bloom();
      if (event.key === "ArrowLeft") this.targetRotation[0] -= 0.15;
      if (event.key === "ArrowRight") this.targetRotation[0] += 0.15;
      if (event.key === "ArrowUp")
        this.targetRotation[1] = Math.max(-0.65, this.targetRotation[1] - 0.1);
      if (event.key === "ArrowDown")
        this.targetRotation[1] = Math.min(0.65, this.targetRotation[1] + 0.1);
      this.requestFrame();
    });
  }
}
