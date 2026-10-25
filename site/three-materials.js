import * as THREE from './vendor/three-0.186.1/three.module.js';

// The prepared sixteen-float layout is shared with the Worker and legacy renderer.
// Pigments on disk are sRGB. Decode on the GPU before interpolation/physical lighting;
// Three performs tone mapping and the one and only output transfer to sRGB.
export const BLOOM_GLSL = `
uniform float uTime, uMix, uSourceGrowth, uTargetGrowth, uOctBase;
uniform float uSurface, uDepthOnly, uFocal, uDpr, uPointScale, uPointAlpha;
uniform vec2 uRotation, uFrameCenter;
attribute vec4 aPosition, aColor, aNormal, aBud;
#ifdef BLOOM_POINTS
attribute vec4 aTarget, aTargetColor, aTargetNormal, aTargetBud;
#endif
vec3 bloomLinear(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(vec3(.04045), c));
}
vec3 bloomClosedNormal(float encoded) {
  vec2 f = vec2(mod(encoded, uOctBase), floor(encoded / uOctBase)) / (uOctBase - 1.0) * 2.0 - 1.0;
  vec3 n = vec3(f, 1.0 - abs(f.x) - abs(f.y));
  if (n.z < 0.0) n.xy = (1.0 - abs(n.yx)) * (step(vec2(0.0), n.xy) * 2.0 - 1.0);
  return normalize(n);
}
float bloomOpen(float progress, float delay) {
  return smoothstep(delay * .24, delay * .24 + .76, progress);
}
vec3 bloomPose() {
  float g = bloomOpen(uTargetGrowth, aBud.w);
#ifdef BLOOM_POINTS
  float s = bloomOpen(uSourceGrowth, aBud.w);
  float t = bloomOpen(uTargetGrowth, aTargetBud.w);
  return mix(mix(aBud.xyz, aPosition.xyz, s), mix(aTargetBud.xyz, aTarget.xyz, t), uMix);
#else
  return mix(aBud.xyz, aPosition.xyz, g);
#endif
}
vec3 bloomNormal() {
  vec3 n = mix(bloomClosedNormal(aNormal.w), aNormal.xyz, bloomOpen(uTargetGrowth, aBud.w));
#ifdef BLOOM_POINTS
  vec3 s = mix(bloomClosedNormal(aNormal.w), aNormal.xyz, bloomOpen(uSourceGrowth, aBud.w));
  vec3 t = mix(bloomClosedNormal(aTargetNormal.w), aTargetNormal.xyz, bloomOpen(uTargetGrowth, aTargetBud.w));
  n = mix(s, t, uMix);
#endif
  return dot(n, n) > .0001 ? normalize(n) : normalize(aNormal.xyz);
}
vec3 bloomPigment() {
#ifdef BLOOM_POINTS
  return mix(bloomLinear(aColor.rgb), bloomLinear(aTargetColor.rgb), uMix);
#else
  return bloomLinear(aColor.rgb);
#endif
}
float bloomPhase() {
#ifdef BLOOM_POINTS
  return aColor.w;
#else
  return 0.0;
#endif
}
vec3 bloomIdle(vec3 p, float phase) {
  float wind = sin(uTime * .65 + p.y * .85) * .032;
  float expansion = 1.0 + sin(uTime * .82 + p.y * .5) * .012 * max(0.0, p.y + 1.0);
  p.xy *= expansion;
  p.x += wind * max(.2, p.y + 2.0);
  p.z += cos(uTime * .55 + p.x * 1.3) * .035;
  p.xy += vec2(sin(uTime + phase), cos(uTime * .7 + phase)) * .009;
  float wander = smoothstep(6.13, 6.28, phase) * pow(.5 + .5 * sin(uTime * .8 + phase * 30.0), 4.0);
  return p + vec3(sin(phase * 9.0 + uTime * .6) * .38, .52, cos(phase * 7.0 + uTime) * .24) * wander;
}
// Exact inverse-transpose of the idle deformation Jacobian. No CPU normal rebuild,
// screen-space derivative faceting, or normals left behind in the open pose.
vec3 bloomIdleNormal(vec3 p, vec3 n) {
  float a = uTime * .82 + p.y * .5;
  float e = 1.0 + sin(a) * .012 * max(0.0, p.y + 1.0);
  float de = cos(a) * .006 * max(0.0, p.y + 1.0) + sin(a) * .012 * step(-1.0, p.y);
  float w = sin(uTime * .65 + p.y * .85) * .032;
  float dw = cos(uTime * .65 + p.y * .85) * .0272;
  float c = e + p.y * de;
  float b = p.x * de + dw * max(.2, p.y * e + 2.0) + w * step(.2, p.y * e + 2.0) * c;
  float x = p.x * e + w * max(.2, p.y * e + 2.0);
  float d = -sin(uTime * .55 + x * 1.3) * .0455;
  return normalize(vec3(n.x / e - d * n.z, (n.y - b * n.x / e) / c, n.z));
}
`;

export function createUniforms() {
  const values = {uTime: 0, uMix: 1, uSourceGrowth: 1, uTargetGrowth: 1,
    uOctBase: 4096, uSurface: 0, uDepthOnly: 0, uFocal: 2, uDpr: 1,
    uPointScale: 1, uPointAlpha: 1, uRotation: new THREE.Vector2(), uFrameCenter: new THREE.Vector2()};
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, {value}]));
}

export function createPetalMaterial(uniforms) {
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: .79, metalness: 0,
    sheen: .28, sheenColor: new THREE.Color('#f5ddd4'), sheenRoughness: .83,
    specularIntensity: .22, clearcoat: 0, transmission: 0,
    // Opaque depth-owning petals; alphaHash is used only during the bounded switch.
    transparent: false, depthTest: true, depthWrite: true, dithering: true,
  });
  material.name = 'petal-soft-physical';
  material.forceSinglePass = true;
  material.customProgramCacheKey = () => 'bloom-petal-physical-r186-v6';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = BLOOM_GLSL + '\nvarying vec3 vBloomPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader
      // r186 color_pars_vertex always declares vec4 vColor, even for RGB attributes.
      .replace('#include <color_vertex>', 'vColor = vec4(bloomPigment(), aPosition.w);')
      .replace('#include <beginnormal_vertex>', 'vec3 bloomRest = bloomPose();\nvec3 objectNormal = bloomIdleNormal(bloomRest, bloomNormal());')
      .replace('#include <begin_vertex>', 'vec3 transformed = bloomIdle(bloomRest, 0.0);\nvBloomPosition = bloomRest;\n#ifdef USE_ALPHAHASH\nvPosition = bloomRest;\n#endif');
    shader.fragmentShader = 'varying vec3 vBloomPosition;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Broad, low-contrast pigment variation, not glitter or plastic clearcoat.
        diffuseColor.rgb *= .96 + .04 * sin(vBloomPosition.y * 3.1 + vBloomPosition.x * 2.3);`)
      .replace('#include <alphahash_fragment>', 'if (diffuseColor.a < .999) {\n#include <alphahash_fragment>\n}')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        float leaf = smoothstep(.015, .12, vColor.g - max(vColor.r, vColor.b));
        float grazing = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
        float thinLight = max(0.0, dot(-normal, normalize(vec3(.4, .45, -.8))));
        reflectedLight.indirectDiffuse += diffuseColor.rgb * thinLight * (.045 + .12 * grazing) * (1.0 - leaf * .65);`);
    material.userData.shader = shader;
  };
  return material;
}

export function createPointMaterial(uniforms, depthOnly = false) {
  const material = new THREE.ShaderMaterial({
    name: depthOnly ? 'petal-grain-depth-core' : 'petal-fine-grain',
    uniforms: {...uniforms, uDepthOnly: {value: depthOnly ? 1 : 0}}, defines: {BLOOM_POINTS: 1},
    depthTest: true, depthWrite: depthOnly, colorWrite: !depthOnly,
    transparent: !depthOnly, toneMapped: true,
    vertexShader: BLOOM_GLSL + `
      varying vec3 vBloomColor;
      void main() {
        vec3 rest = bloomPose();
        vec3 p = bloomIdle(rest, bloomPhase());
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vec3 n = normalize(normalMatrix * bloomIdleNormal(rest, bloomNormal()));
        if (dot(n, normalize(-mv.xyz)) < 0.0) n = -n;
        float key = max(0.0, dot(n, normalize(vec3(-.65, .85, 1.1))));
        float fill = max(0.0, dot(n, normalize(vec3(.95, .12, -.45))));
        vBloomColor = bloomPigment() * (vec3(.29) + vec3(.70, .62, .59) * key + vec3(.11, .16, .18) * fill);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(mix(aPosition.w, aTarget.w, uMix) * uPointScale * 6.8 / max(.2, -mv.z), .8, 2.1 * uDpr);
      }`,
    fragmentShader: `
      varying vec3 vBloomColor;
      uniform float uDepthOnly, uPointAlpha;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float r = dot(q, q);
        if (r > 1.0) discard;
        if (uDepthOnly > .5) {
          if (r > .72) discard;
          gl_FragColor = vec4(0.0);
          return;
        }
        float alpha = (1.0 - smoothstep(.72, 1.0, r)) * uPointAlpha;
        if (alpha < .004) discard;
        gl_FragColor = vec4(vBloomColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return material;
}
