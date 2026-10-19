// Decision: .agents/notes/implemented/botanical-growth/2026-10-19-bud-to-bloom.md
// Decision: .agents/notes/implemented/particle-depth/2026-10-19-normal-lit-bouquets.md
const STRIDE = 11;
const GPU_STRIDE = 16;
const STRIDE_BYTES = GPU_STRIDE * Float32Array.BYTES_PER_ELEMENT;
const GROWTH_STRIDE = 7;

function unitNormal(x, y, z) {
  const length = Math.hypot(x, y, z);
  return length > 1e-8 ? [x / length, y / length, z / length] : [0, 0, 1];
}

function packNormal(x, y, z, base) {
  [x, y, z] = unitNormal(x, y, z);
  const sum = Math.abs(x) + Math.abs(y) + Math.abs(z);
  x /= sum;
  y /= sum;
  if (z < 0)
    [x, y] = [
      (1 - Math.abs(y)) * (x < 0 ? -1 : 1),
      (1 - Math.abs(x)) * (y < 0 ? -1 : 1),
    ];
  return (
    Math.round((x * 0.5 + 0.5) * (base - 1)) +
    base * Math.round((y * 0.5 + 0.5) * (base - 1))
  );
}

function unpackNormal(value, base) {
  let x = ((value % base) / (base - 1)) * 2 - 1;
  let y = (Math.floor(value / base) / (base - 1)) * 2 - 1;
  const z = 1 - Math.abs(x) - Math.abs(y);
  if (z < 0)
    [x, y] = [
      (1 - Math.abs(y)) * (x < 0 ? -1 : 1),
      (1 - Math.abs(x)) * (y < 0 ? -1 : 1),
    ];
  return unitNormal(x, y, z);
}

function validateGrowth(part, count) {
  if (!(part instanceof Float32Array) || part.length !== count * GROWTH_STRIDE)
    throw new Error(
      "Invalid growth stride or count: expected 7 Float32 values",
    );
  for (let i = 0; i < part.length; i += GROWTH_STRIDE) {
    for (let j = 0; j < GROWTH_STRIDE; j++)
      if (!Number.isFinite(part[i + j]))
        throw new Error("Invalid growth value");
    if (
      part[i + 6] < 0 ||
      part[i + 6] > 1 ||
      Math.hypot(part[i + 3], part[i + 4], part[i + 5]) < 1e-8
    )
      throw new Error("Invalid growth normal or delay");
  }
}

// Raw records remain immutable; only the private GPU layout consumes eight attributes.
function packRecords(data, growth, stride, base) {
  const packed = new Float32Array((data.length / stride) * GPU_STRIDE);
  for (
    let i = 0, j = 0, k = 0;
    i < data.length;
    i += stride, j += GPU_STRIDE, k += GROWTH_STRIDE
  ) {
    const n = stride === STRIDE ? i + 8 : i + 6;
    packed.set(
      [
        data[i],
        data[i + 1],
        data[i + 2],
        stride === STRIDE ? data[i + 6] : 1,
        data[i + 3],
        data[i + 4],
        data[i + 5],
        stride === STRIDE ? data[i + 7] : 0,
        data[n],
        data[n + 1],
        data[n + 2],
        growth
          ? packNormal(growth[k + 3], growth[k + 4], growth[k + 5], base)
          : packNormal(data[n], data[n + 1], data[n + 2], base),
        growth ? growth[k] : data[i],
        growth ? growth[k + 1] : data[i + 1],
        growth ? growth[k + 2] : data[i + 2],
        growth ? growth[k + 6] : 0,
      ],
      j,
    );
  }
  return packed;
}

function localGrowth(progress, delay) {
  return ramp(delay * 0.24, delay * 0.24 + 0.76, progress);
}

function poseNormal(packed, i, progress, base) {
  const closed = unpackNormal(packed[i + 11], base);
  const g = localGrowth(progress, packed[i + 15]);
  return closed.map(
    (value, axis) => value * (1 - g) + packed[i + 8 + axis] * g,
  );
}

function freezePacked(from, to, mix, sourceGrowth, targetGrowth, base) {
  const frozen = new Float32Array(from.length);
  for (let i = 0; i < from.length; i += GPU_STRIDE) {
    const a = localGrowth(sourceGrowth, from[i + 15]);
    const b = localGrowth(targetGrowth, to[i + 15]);
    for (let j = 0; j < GPU_STRIDE; j++)
      frozen[i + j] = from[i + j] * (1 - mix) + to[i + j] * mix;
    for (let axis = 0; axis < 3; axis++) {
      const p = from[i + 12 + axis] * (1 - a) + from[i + axis] * a;
      const q = to[i + 12 + axis] * (1 - b) + to[i + axis] * b;
      frozen[i + axis] = p * (1 - mix) + q * mix;
    }
    const an = poseNormal(from, i, sourceGrowth, base),
      bn = poseNormal(to, i, targetGrowth, base);
    const normal = an.map((value, axis) => value * (1 - mix) + bn[axis] * mix);
    frozen.set(
      Math.hypot(...normal) < 0.01
        ? unitNormal(...from.subarray(i + 8, i + 11))
        : unitNormal(...normal),
      i + 8,
    );
    const ac = unpackNormal(from[i + 11], base),
      bc = unpackNormal(to[i + 11], base);
    frozen[i + 11] = packNormal(
      ...ac.map((value, axis) => value * (1 - mix) + bc[axis] * mix),
      base,
    );
  }
  return frozen;
}
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
attribute vec4 aPosition;
attribute vec4 aColor;
attribute vec4 aNormal;
attribute vec4 aBud;
attribute vec4 aTarget;
attribute vec4 aTargetColor;
attribute vec4 aTargetNormal;
attribute vec4 aTargetBud;
uniform float uMix;
uniform float uTime;
uniform float uSourceGrowth;
uniform float uTargetGrowth;
uniform float uOctBase;
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
varying mediump vec3 vMaterialPosition;
vec3 rotate(vec3 p) {
  float cy = cos(uRotation.x), sy = sin(uRotation.x);
  float cx = cos(uRotation.y), sx = sin(uRotation.y);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  return vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
}
vec3 closedNormal(float encoded) {
  vec2 f = vec2(mod(encoded, uOctBase), floor(encoded / uOctBase)) / (uOctBase - 1.0) * 2.0 - 1.0;
  vec3 n = vec3(f, 1.0 - abs(f.x) - abs(f.y));
  if (n.z < 0.0) n.xy = (1.0 - abs(n.yx)) * (step(vec2(0.0), n.xy) * 2.0 - 1.0);
  return normalize(n);
}
float openPetal(float progress, float delay) {
  return smoothstep(delay * .24, delay * .24 + .76, progress);
}
void main() {
  float phase = uSurface > .5 ? 0.0 : aColor.w;
  float sourceOpen = openPetal(uSourceGrowth, aBud.w);
  float targetOpen = openPetal(uTargetGrowth, aTargetBud.w);
  vec3 p = mix(mix(aBud.xyz, aPosition.xyz, sourceOpen), mix(aTargetBud.xyz, aTarget.xyz, targetOpen), uMix);
  vMaterialPosition = p;
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
  float coreSize = aPosition.w * uPointScale * perspective * .72;
  if (uDust > .5) coreSize = aPosition.w * uDpr * perspective * 2.2;
  coreSize = clamp(coreSize, 1.0, (uDust > .5 ? 2.5 : 2.6) * uDpr);
  gl_PointSize = coreSize * (1.0 + uGlow * .65);
  vec3 sourceNormal = mix(closedNormal(aNormal.w), aNormal.xyz, sourceOpen);
  vec3 targetNormal = mix(closedNormal(aTargetNormal.w), aTargetNormal.xyz, targetOpen);
  vec3 blendedNormal = mix(sourceNormal, targetNormal, uMix);
  if (dot(blendedNormal, blendedNormal) < .0001) {
    blendedNormal = dot(aNormal.xyz, aNormal.xyz) < .0001 ? vec3(0.0, 0.0, 1.0) : aNormal.xyz;
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
  vec3 light = vec3(.18, .18, .18)
    + vec3(1.0, .98, .95) * key * .98
    + vec3(.94, .97, 1.0) * side * .16
    + vec3(1.0, .98, .96) * rim * .06;
  vec3 pigment = mix(aColor.rgb, aTargetColor.rgb, uMix);
  vColor = max(pigment, vec3(0.0)) * pow(light * mix(.91, 1.0, front), vec3(1.0 / 2.2));
  vAlpha = uSurface > .5 ? aPosition.w : uAppear * (.96 + .03 * sin(phase + uTime * 1.3));
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
varying mediump vec3 vMaterialPosition;
void main() {
  if (uSurface > .5) {
    float surfaceAlpha = uSurfaceAlpha * vAlpha;
    if (surfaceAlpha < .005) discard;
    float micrograin = .985 + .015 * sin(dot(vMaterialPosition, vec3(177.1, 243.7, 201.3)));
    gl_FragColor = vec4(vColor * micrograin, surfaceAlpha);
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
    alpha = exp(-r * 4.5) * vAlpha * .012;
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
    const precision =
      gl.getShaderPrecisionFormat?.(gl.VERTEX_SHADER, gl.HIGH_FLOAT)
        ?.precision ?? 23;
    this.octBase = precision >= 23 ? 4096 : 256;
    this.hasGrowth = false;
    this.bloomProgress = this.sourceGrowth = 1;
    this.growthCycle = null;
    this.gpuData = this.gpuTargetData = null;
    this.surfacePacked = this.surfaceIndices = this.outgoingSurface = null;
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
        "aBud",
        "aTargetBud",
        "aNormal",
        "aTargetNormal",
      ].map((key) => [key, gl.getAttribLocation(this.program, key)]),
    );
    this.uniforms = Object.fromEntries(
      [
        "uMix",
        "uTime",
        "uSourceGrowth",
        "uTargetGrowth",
        "uOctBase",
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
    this.outgoingVertexBuffer = gl.createBuffer();
    this.outgoingIndexBuffer = gl.createBuffer();
    this.uintIndices = !!gl.getExtension?.("OES_element_index_uint");
    this.surfaceCount = 0;
    this.surfaceSupportPoints = null;
    this.surfaceOpacity = 0;
    this.listeners = [];
    this.reducedMotion = reducedMotion;
    this.paused = reducedMotion;
    this.focused = true;
    this.rotation = [0.43, -0.15];
    this.targetRotation = [...this.rotation];
    this.pointer = [20, 20];
    this.time = 0;
    this.elapsed = 0;
    this.mix = 1;
    this.transitionAt = 0;
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
    if (window.addEventListener) {
      this.listen(window, "blur", () => {
        this.focused = false;
        this.lastFrame = 0;
        cancelAnimationFrame(this.raf);
        this.raf = 0;
      });
      this.listen(window, "focus", () => {
        this.focused = true;
        this.lastFrame = 0;
        this.requestFrame();
      });
    }
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
    gl.bufferData(
      gl.ARRAY_BUFFER,
      packRecords(dust, null, STRIDE, this.octBase),
      gl.STATIC_DRAW,
    );
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

  setBouquet(data, immediate = false, surface = null, growth = null) {
    if (this.disposed || this.lost) return;
    if (!(data instanceof Float32Array) || !data.length || data.length % STRIDE)
      throw new Error("Invalid particle stride: expected 11 Float32 values");
    this.validateSurface(surface);
    if (growth) {
      validateGrowth(growth.points, data.length / STRIDE);
      if (surface) validateGrowth(growth.vertices, surface.vertices.length / 9);
    }
    const first = !this.data;
    const previousFrame = this.projectionState;
    const direct =
      first ||
      this.data.length !== data.length ||
      immediate ||
      this.reducedMotion ||
      this.paused;
    const outgoing = growth && !direct ? this.captureSurface() : null;
    const visible =
      !direct && (growth || this.hasGrowth)
        ? freezePacked(
            this.gpuData,
            this.gpuTargetData,
            this.mix,
            this.sourceGrowth,
            this.bloomProgress,
            this.octBase,
          )
        : null;
    if (direct) {
      if (this.paused || growth) this.appearance = 1;
      this.data = this.targetData = data;
      this.mix = 1;
    } else {
      // Preserve the eleven-field CPU/frame contract independently of the visible GPU pose.
      const frozen = new Float32Array(this.data.length);
      for (let i = 0; i < frozen.length; i++)
        frozen[i] =
          this.data[i] * (1 - this.mix) + this.targetData[i] * this.mix;
      this.data = frozen;
      this.targetData = data;
      this.mix = 0;
    }
    this.hasGrowth = !!growth;
    this.growth = growth;
    this.gpuTargetData = packRecords(
      data,
      growth?.points,
      STRIDE,
      this.octBase,
    );
    this.gpuData =
      visible ||
      (direct
        ? this.gpuTargetData
        : packRecords(this.data, null, STRIDE, this.octBase));
    if (visible) {
      for (let i = 0, j = 7; i < visible.length; i += GPU_STRIDE, j += STRIDE)
        visible[i + 7] = this.data[j];
    }
    this.growthCycle =
      growth && !this.paused && !this.reducedMotion && (first || !direct)
        ? {
            at: this.elapsed,
            from: 0,
            close: first ? 0 : 1.6,
            duration: first ? 4.8 : 4.0,
          }
        : null;
    this.transitionAt = this.elapsed - (direct ? 1.6 : 0);
    this.updateGrowth();
    this.setSurface(surface, growth?.vertices);
    if (this.outgoingSurface && !outgoing) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.outgoingVertexBuffer);
      this.gl.bufferData(
        this.gl.ARRAY_BUFFER,
        new Float32Array(),
        this.gl.STATIC_DRAW,
      );
      this.gl.bindBuffer(
        this.gl.ELEMENT_ARRAY_BUFFER,
        this.outgoingIndexBuffer,
      );
      this.gl.bufferData(
        this.gl.ELEMENT_ARRAY_BUFFER,
        new Uint32Array(),
        this.gl.STATIC_DRAW,
      );
    }
    this.outgoingSurface = outgoing;
    if (outgoing)
      this.uploadSurface(
        outgoing.packed,
        outgoing.indices,
        this.outgoingVertexBuffer,
        this.outgoingIndexBuffer,
      );
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.currentBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.gpuData, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.targetBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.gpuTargetData, gl.STATIC_DRAW);
    this.count = data.length / STRIDE;
    this.projectionCache ||= new WeakMap();
    this.projectionIndices = [
      ...new Set([
        ...this.sampleProjection(this.data),
        ...this.sampleProjection(this.targetData),
      ]),
    ];
    // Wander can peak at a different phase than idle(time=0), including on fixed roots.
    // Exact support for this small moving subset avoids cached-pose false negatives.
    const wanderIndices = [];
    if (growth)
      for (let i = 0; i < this.gpuData.length; i += GPU_STRIDE)
        if (this.gpuData[i + 7] > 6.13 || this.gpuTargetData[i + 7] > 6.13)
          wanderIndices.push(i);
    this.growthProjectionIndices = growth
      ? [
          ...new Set([
            ...this.projectionIndices.map(
              (index) => (index / STRIDE) * GPU_STRIDE,
            ),
            ...wanderIndices,
            ...this.sampleGrowthProjection(this.gpuData),
            ...(this.gpuData === this.gpuTargetData
              ? []
              : this.sampleGrowthProjection(this.gpuTargetData)),
          ]),
        ]
      : null;
    this.surfaceGrowthIndices =
      growth && this.surfacePacked
        ? this.sampleGrowthProjection(this.surfacePacked, this.surfaceIndices)
        : null;
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
    this.updateGrowth();
    this.requestFrame();
  }

  listen(target, name, callback) {
    target.addEventListener(name, callback);
    this.listeners.push(() => target.removeEventListener?.(name, callback));
  }

  validateSurface(surface) {
    if (!surface) return;
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
    for (const index of indices)
      if (index >= vertices.length / 9)
        throw new Error("Invalid surface index");
  }

  uploadSurface(packed, indices, vertexBuffer, indexBuffer) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    if (this.uintIndices) {
      gl.bufferData(gl.ARRAY_BUFFER, packed, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    } else {
      const expanded = new Float32Array(indices.length * GPU_STRIDE);
      for (let i = 0; i < indices.length; i++)
        expanded.set(
          packed.subarray(
            indices[i] * GPU_STRIDE,
            (indices[i] + 1) * GPU_STRIDE,
          ),
          i * GPU_STRIDE,
        );
      gl.bufferData(gl.ARRAY_BUFFER, expanded, gl.STATIC_DRAW);
    }
  }

  setSurface(surface, growth = null) {
    if (!surface) {
      this.surfaceCount = 0;
      this.surfaceOpacity = 0;
      this.surfaceSupportPoints =
        this.surfacePacked =
        this.surfaceIndices =
          null;
      return;
    }
    this.validateSurface(surface);
    this.surfacePacked = packRecords(surface.vertices, growth, 9, this.octBase);
    this.surfaceIndices = surface.indices;
    this.uploadSurface(
      this.surfacePacked,
      surface.indices,
      this.surfaceVertexBuffer,
      this.surfaceIndexBuffer,
    );
    this.surfaceSupportPoints = this.sampleSurfaceSupport(
      surface.vertices,
      surface.indices,
    );
    this.surfaceCount = surface.indices.length;
  }

  updateGrowth() {
    const cycle = this.growthCycle;
    this.bloomProgress = 1;
    if (this.hasGrowth && cycle && !this.reducedMotion) {
      const age = Math.max(0, this.elapsed - cycle.at);
      this.bloomProgress =
        age < cycle.close
          ? cycle.from * (1 - ramp(0, cycle.close, age))
          : ramp(0, cycle.duration, age - cycle.close);
    }
    this.sourceGrowth = this.hasGrowth
      ? 1 - ramp(0, 0.8, this.elapsed - this.transitionAt)
      : 1;
    this.canvas.dataset.bloomProgress = String(this.bloomProgress);
  }

  captureSurface() {
    const parts = [];
    if (this.outgoingSurface && this.mix < 1)
      parts.push([
        this.outgoingSurface.packed,
        this.outgoingSurface.indices,
        this.sourceGrowth,
        1 - this.mix,
      ]);
    if (this.surfacePacked)
      parts.push([
        this.surfacePacked,
        this.surfaceIndices,
        this.bloomProgress,
        this.outgoingSurface ? this.mix : this.surfaceVisibility(),
      ]);
    const records = [],
      triangles = [];
    let offset = 0;
    for (const [packed, indices, progress, weight] of parts) {
      if (weight <= 0.005) continue;
      const frozen = freezePacked(
        packed,
        packed,
        0,
        progress,
        progress,
        this.octBase,
      );
      const used = new Set();
      const keep = [];
      for (let i = 0; i < indices.length; i += 3) {
        const triangle = [...indices.subarray(i, i + 3)];
        if (
          triangle.every(
            (index) => frozen[index * GPU_STRIDE + 3] * weight < 0.005,
          )
        )
          continue;
        keep.push(...triangle);
        for (const index of triangle) used.add(index);
      }
      const remap = new Map();
      const compact = new Float32Array(used.size * GPU_STRIDE);
      let cursor = 0;
      for (const index of used) {
        remap.set(index, cursor);
        compact.set(
          frozen.subarray(index * GPU_STRIDE, (index + 1) * GPU_STRIDE),
          cursor * GPU_STRIDE,
        );
        compact[cursor * GPU_STRIDE + 3] *= weight;
        cursor++;
      }
      records.push(compact);
      for (const index of keep) triangles.push(remap.get(index) + offset);
      offset += used.size;
    }
    if (!triangles.length) return null;
    const packed = new Float32Array(offset * GPU_STRIDE);
    let cursor = 0;
    for (const record of records) {
      packed.set(record, cursor);
      cursor += record.length;
    }
    const indices = new Uint32Array(triangles);
    return {
      packed,
      indices,
      projectionIndices: this.sampleGrowthProjection(packed, indices),
      opaque: [...new Set(triangles)].every(
        (index) => packed[index * GPU_STRIDE + 3] > 0.999,
      ),
    };
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

  surfaceVisibility() {
    if (!this.surfaceCount) return 0;
    if (this.hasGrowth)
      return this.appearance * (this.outgoingSurface ? this.mix : 1);
    return ramp(0.6, 1, this.appearance) * ramp(0.86, 1, this.mix);
  }

  bindSurfaceAttributes(buffer = this.surfaceVertexBuffer) {
    this.bindAttributes(buffer, buffer);
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
      this.outgoingVertexBuffer,
      this.outgoingIndexBuffer,
    ])
      this.gl.deleteBuffer(buffer);
    this.gl.deleteProgram(this.program);
    this.data = this.targetData = this.gpuData = this.gpuTargetData = null;
    this.surfacePacked =
      this.surfaceIndices =
      this.outgoingSurface =
      this.growth =
        null;
    this.growthCycle =
      this.growthProjectionIndices =
      this.surfaceGrowthIndices =
        null;
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
    for (const [buffer, names] of [
      [from, ["aPosition", "aColor", "aNormal", "aBud"]],
      [to, ["aTarget", "aTargetColor", "aTargetNormal", "aTargetBud"]],
    ]) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      names.forEach((name, index) => bind(name, 4, index * 16));
    }
  }

  sampleProjection(data) {
    const cached = this.projectionCache.get(data);
    if (cached) return cached;
    const count = data.length / STRIDE;
    const indices = new Set();
    // Spherical supports catch perspective tips between cube diagonals.
    // Reallocate the same 1076-record budget, without shrinking the target frame.
    const directions = [
      ...SUPPORT_DIRECTIONS,
      ...Array.from({ length: 96 }, (_, i) => {
        const z = 1 - (2 * (i + 0.5)) / 96;
        const radius = Math.sqrt(1 - z * z),
          angle = i * Math.PI * (3 - Math.sqrt(5));
        return [radius * Math.cos(angle), radius * Math.sin(angle), z];
      }),
    ];
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
    const budget = Math.min(1076 - indices.size, count);
    for (let i = 0; i < budget; i++)
      indices.add(
        Math.round((i * (count - 1)) / Math.max(1, budget - 1)) * STRIDE,
      );
    const samples = [...indices];
    this.projectionCache.set(data, samples);
    return samples;
  }

  sampleGrowthProjection(packed, indices = null) {
    const supports = Array.from({ length: 4 }, () =>
      SUPPORT_DIRECTIONS.map(() => [-Infinity, 0]),
    );
    const seen = new Uint8Array(packed.length / GPU_STRIDE);
    const count = indices ? indices.length : seen.length;
    for (let cursor = 0; cursor < count; cursor++) {
      const vertex = indices ? indices[cursor] : cursor;
      if (seen[vertex]) continue;
      seen[vertex] = 1;
      const i = vertex * GPU_STRIDE;
      const points = [
        [packed[i], packed[i + 1], packed[i + 2]],
        [packed[i + 12], packed[i + 13], packed[i + 14]],
      ];
      points.push(
        idlePosition(...points[0], packed[i + 7], 0),
        idlePosition(...points[1], packed[i + 7], 0),
      );
      for (let k = 0; k < points.length; k++)
        for (let j = 0; j < SUPPORT_DIRECTIONS.length; j++) {
          const d = SUPPORT_DIRECTIONS[j],
            p = points[k];
          const dot = p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
          if (dot > supports[k][j][0]) supports[k][j] = [dot, i];
        }
    }
    return [...new Set(supports.flat().map(([, i]) => i))];
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
    if (this.hasGrowth && this.growthProjectionIndices) {
      const extend = (position, phase) => {
        const p = idlePosition(...position, phase, this.time);
        const x = p[0] * cy + p[2] * sy,
          z = -p[0] * sy + p[2] * cy;
        const y = p[1] * cx - z * sx;
        const depth = Math.max(0.2, CAMERA_DISTANCE - (p[1] * sx + z * cx));
        minX = Math.min(minX, x / depth);
        maxX = Math.max(maxX, x / depth);
        minY = Math.min(minY, y / depth);
        maxY = Math.max(maxY, y / depth);
      };
      const pose = (packed, i, progress) => {
        const g = localGrowth(progress, packed[i + 15]);
        return [0, 1, 2].map(
          (axis) => packed[i + 12 + axis] * (1 - g) + packed[i + axis] * g,
        );
      };
      for (const i of this.growthProjectionIndices) {
        const a = pose(this.gpuData, i, this.sourceGrowth),
          b = pose(this.gpuTargetData, i, this.bloomProgress);
        extend(
          a.map((value, axis) => value * (1 - this.mix) + b[axis] * this.mix),
          this.gpuData[i + 7],
        );
      }
      for (const [packed, samples, progress, alpha] of [
        [
          this.surfacePacked,
          this.surfaceGrowthIndices,
          this.bloomProgress,
          this.surfaceVisibility(),
        ],
        [
          this.outgoingSurface?.packed,
          this.outgoingSurface?.projectionIndices,
          this.sourceGrowth,
          this.outgoingSurface ? this.appearance * (1 - this.mix) : 0,
        ],
      ]) {
        if (!packed || !samples || alpha <= 0.005) continue;
        const bounds = [minX, maxX, minY, maxY];
        for (const i of samples) extend(pose(packed, i, progress), 0);
        const weight = ramp(0.005, 0.18, alpha);
        minX = bounds[0] + (minX - bounds[0]) * weight;
        maxX = bounds[1] + (maxX - bounds[1]) * weight;
        minY = bounds[2] + (minY - bounds[2]) * weight;
        maxY = bounds[3] + (maxY - bounds[3]) * weight;
      }
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
    if (!this.paused && this.focused) {
      this.elapsed += dt;
      this.time += dt;
      this.appearance = Math.min(1, this.appearance + dt * 1.4);
    }
    const transition = Math.min(1, (this.elapsed - this.transitionAt) / 1.6);
    this.mix = transition * transition * (3 - 2 * transition);
    if (this.reducedMotion) this.mix = 1;
    this.updateGrowth();
    if (this.mix >= 1 && this.outgoingSurface) {
      this.outgoingSurface = null;
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.outgoingVertexBuffer);
      this.gl.bufferData(
        this.gl.ARRAY_BUFFER,
        new Float32Array(),
        this.gl.STATIC_DRAW,
      );
      this.gl.bindBuffer(
        this.gl.ELEMENT_ARRAY_BUFFER,
        this.outgoingIndexBuffer,
      );
      this.gl.bufferData(
        this.gl.ELEMENT_ARRAY_BUFFER,
        new Uint32Array(),
        this.gl.STATIC_DRAW,
      );
    }
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
    f("uSourceGrowth", this.sourceGrowth);
    f("uTargetGrowth", this.bloomProgress);
    f("uOctBase", this.octBase);
    f("uAppear", this.appearance);
    f("uAspect", this.aspect);
    f("uDpr", this.dpr);
    f("uDust", 0);
    f("uSurface", 0);
    this.surfaceOpacity = this.surfaceVisibility();
    const outgoingOpacity = this.outgoingSurface
      ? this.appearance * (1 - this.mix)
      : 0;
    const coverage = Math.max(this.surfaceOpacity, outgoingOpacity);
    f("uSurfaceAlpha", this.surfaceOpacity);
    f("uPointAlpha", 1 - coverage * 0.42);
    // This clock is frozen by pause, reduced motion and hidden-page suspension.
    const yaw = this.rotation[0] + Math.sin(this.time * 0.12) * 0.16;
    const pitch = this.rotation[1] + Math.sin(this.time * 0.09) * 0.035;
    const focal = this.fitProjection(yaw, pitch);
    f("uFocal", focal);
    f(
      "uPointScale",
      (this.canvas.height * focal * 0.027 * (1 - coverage * 0.22)) /
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
    const drawMesh = (
      vertexBuffer,
      indexBuffer,
      count,
      alpha,
      progress,
      opaque,
    ) => {
      if (alpha <= 0.005 || !count) return;
      this.bindSurfaceAttributes(vertexBuffer);
      f("uSurface", 1);
      f("uGlow", 0);
      f("uMix", 1);
      f("uSourceGrowth", progress);
      f("uTargetGrowth", progress);
      f("uSurfaceAlpha", alpha);
      const drawSurface = () => {
        if (this.uintIndices) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
          gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0);
        } else gl.drawArrays(gl.TRIANGLES, 0, count);
      };
      // Only fully opaque surface records own depth; crossfades retain their color.
      if (alpha > 0.95 && opaque) {
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
    };
    if (this.outgoingSurface)
      drawMesh(
        this.outgoingVertexBuffer,
        this.outgoingIndexBuffer,
        this.outgoingSurface.indices.length,
        outgoingOpacity,
        this.sourceGrowth,
        this.outgoingSurface.opaque,
      );
    drawMesh(
      this.surfaceVertexBuffer,
      this.surfaceIndexBuffer,
      this.surfaceCount,
      this.surfaceOpacity,
      this.bloomProgress,
      true,
    );
    f("uSurface", 0);
    f("uMix", this.mix);
    f("uSourceGrowth", this.sourceGrowth);
    f("uTargetGrowth", this.bloomProgress);
    f("uSurfaceAlpha", this.surfaceOpacity);
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
    f("uSourceGrowth", 1);
    f("uTargetGrowth", 1);
    gl.drawArrays(gl.POINTS, 0, 360);
    gl.depthMask(true);
    this.canvas.dataset.rendered = "true";
    const rotating =
      Math.abs(this.rotation[0] - this.targetRotation[0]) +
        Math.abs(this.rotation[1] - this.targetRotation[1]) >
      0.001;
    if ((!this.paused && this.focused) || rotating) this.requestFrame();
    else this.lastFrame = 0;
  }

  bloom() {
    if (this.reducedMotion) return;
    this.setPaused(false);
    if (this.hasGrowth)
      this.growthCycle = {
        at: this.elapsed,
        from: this.bloomProgress,
        close: 0.8,
        duration: 4.2,
      };
    this.updateGrowth();
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
    if (value) {
      this.growthCycle = null;
      this.mix = 1;
      this.transitionAt = this.elapsed - 1.6;
    }
    this.updateGrowth();
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
