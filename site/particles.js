const VERTEX = `
precision highp float;
attribute vec3 aPosition;
attribute vec3 aTarget;
attribute vec3 aColor;
attribute vec3 aTargetColor;
attribute vec2 aMeta;
uniform float uMix;
uniform float uTime;
uniform float uBurst;
uniform float uAppear;
uniform vec2 uRotation;
uniform vec2 uPointer;
uniform float uAspect;
uniform float uDpr;
uniform mediump float uGlow;
uniform mediump float uDust;
varying mediump vec3 vColor;
varying mediump float vAlpha;
void main() {
  float phase = aMeta.y;
  vec3 p = mix(aPosition, aTarget, uMix);
  vec3 direction = normalize(vec3(sin(phase * 7.1), cos(phase * 4.3), sin(phase * 3.7)) + vec3(.001));
  float scatter = uBurst + (1.0 - uAppear) * .85;
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
  float cy = cos(uRotation.x), sy = sin(uRotation.x);
  float cx = cos(uRotation.y), sx = sin(uRotation.y);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
  float perspective = 8.0 / (8.0 - p.z);
  vec2 screen = p.xy * .31 * perspective;
  vec2 delta = screen - uPointer;
  float proximity = exp(-dot(delta, delta) * 25.0) * (1.0 - uDust);
  screen += delta * proximity * .06;
  gl_Position = vec4(screen.x / uAspect, screen.y, -p.z * .08, 1.0);
  float size = aMeta.x * (1.0 + uGlow * 2.7);
  gl_PointSize = clamp(size * uDpr * perspective * 1.9, 1.0, 18.0 * uDpr);
  vColor = mix(aColor, aTargetColor, uMix);
  vColor = pow(vColor, vec3(.85)) * (.95 + .15 * perspective);
  vAlpha = uAppear * (.91 + .08 * sin(phase + uTime * 1.3));
  if (uDust > .5) vAlpha *= .20 + .35 * pow(.5 + .5 * sin(phase * 3. + uTime * .7), 3.);
}
`;

const FRAGMENT = `
precision mediump float;
uniform mediump float uGlow;
uniform mediump float uDust;
varying mediump vec3 vColor;
varying mediump float vAlpha;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = dot(q, q);
  if (r > 1.0) discard;
  float alpha = exp(-r * (2.2 + uGlow * 1.5)) * vAlpha;
  alpha *= 1.0 - uGlow * .955;
  if (alpha < .008) discard;
  gl_FragColor = vec4(vColor, alpha);
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
      ["aPosition", "aTarget", "aColor", "aTargetColor", "aMeta"].map((key) => [
        key,
        gl.getAttribLocation(this.program, key),
      ]),
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
      ].map((key) => [key, gl.getUniformLocation(this.program, key)]),
    );
    this.currentBuffer = gl.createBuffer();
    this.targetBuffer = gl.createBuffer();
    this.dustBuffer = gl.createBuffer();
    this.reducedMotion = reducedMotion;
    this.paused = reducedMotion;
    this.rotation = [0.06, -0.035];
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
    this.visible = !document.hidden;
    this.lost = false;
    this.createDust();
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      this.requestFrame();
    });
    this.resizeObserver.observe(canvas);
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.lost = true;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      onLost();
    });
    document.addEventListener("visibilitychange", () => {
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
    const dust = new Float32Array(360 * 8);
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
        ],
        i * 8,
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

  setBouquet(data, immediate = false) {
    const direct = !this.data || immediate || this.reducedMotion || this.paused;
    if (direct) {
      if (this.paused) this.appearance = 1;
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
    this.count = data.length / 8;
    this.transitionAt = this.elapsed - (direct ? 1.6 : 0);
    this.requestFrame();
  }

  bindAttributes(from, to) {
    const gl = this.gl;
    const bind = (name, size, offset) => {
      const index = this.attributes[name];
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(index, size, gl.FLOAT, false, 32, offset);
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, from);
    bind("aPosition", 3, 0);
    bind("aColor", 3, 12);
    bind("aMeta", 2, 24);
    gl.bindBuffer(gl.ARRAY_BUFFER, to);
    bind("aTarget", 3, 0);
    bind("aTargetColor", 3, 12);
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
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    const f = (name, value) => gl.uniform1f(this.uniforms[name], value);
    f("uMix", this.mix);
    f("uTime", this.time);
    f("uBurst", this.reducedMotion ? 0 : burst);
    f("uAppear", this.appearance);
    f("uAspect", this.aspect);
    f("uDpr", this.dpr);
    f("uDust", 0);
    const drift = Math.sin(this.time * 0.25) * 0.055;
    gl.uniform2f(
      this.uniforms.uRotation,
      this.rotation[0] + drift,
      this.rotation[1],
    );
    gl.uniform2f(this.uniforms.uPointer, ...this.pointer);
    this.bindAttributes(this.currentBuffer, this.targetBuffer);
    gl.disable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    f("uGlow", 1);
    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    f("uGlow", 0);
    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.disable(gl.DEPTH_TEST);
    this.bindAttributes(this.dustBuffer, this.dustBuffer);
    f("uDust", 1);
    f("uMix", 0);
    f("uBurst", 0);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, 360);
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
    this.canvas.addEventListener("pointerdown", (event) => {
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
    this.canvas.addEventListener("pointermove", (event) => {
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
    this.canvas.addEventListener("pointerup", release);
    this.canvas.addEventListener("pointercancel", release);
    this.canvas.addEventListener("lostpointercapture", () => {
      origin = null;
    });
    this.canvas.addEventListener("pointerleave", () => {
      this.pointer = [20, 20];
      this.requestFrame();
    });
    this.canvas.addEventListener("keydown", (event) => {
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
