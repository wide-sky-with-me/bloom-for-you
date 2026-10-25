import * as THREE from './engine/vendor/three-0.186.1/three.module.js';
import { BLOOM_GLSL } from './engine/three-materials.js';

// Independent natural-garden prototype. No UVs exist in BFM1: deliberately no
// fake veins, 3D-position pigment stripes, bump texture, or extra vertex arrays.
// The shared growth/normal GLSL retains the original GPU opening and wind clocks.
export function createBotanicalMaterial(uniforms) {
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: .88, metalness: 0,
    sheen: .12, sheenColor: new THREE.Color('#fff9ee'), sheenRoughness: .94,
    specularIntensity: .10, clearcoat: 0, transmission: 0,
    transparent: false, depthTest: true, depthWrite: true,
    // Keep v6's output dithering for the initial A/B. Disabling point overlays,
    // not assuming dithering is the cause, isolates the fine-grain hypothesis.
    dithering: true,
  });
  material.name = 'natural-garden-matte-petal';
  material.forceSinglePass = true;
  material.customProgramCacheKey = () => 'natural-garden-matte-petal-r186-study-1';
  material.userData.study = {prototype: true, veins: false, pigmentPattern: 'vertex-pigment-only',
    ditheringMatchesV6: true, transmissionApproximation: 'gentle-thin-sheet-backlight'};
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = BLOOM_GLSL + '\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader
      // Pinned r186 declares vec4 vColor even with a three-component color attribute.
      .replace('#include <color_vertex>', 'vColor = vec4(bloomPigment(), aPosition.w);')
      .replace('#include <beginnormal_vertex>', 'vec3 studyRest = bloomPose();\nvec3 objectNormal = bloomIdleNormal(studyRest, bloomNormal());')
      .replace('#include <begin_vertex>', 'vec3 transformed = bloomIdle(studyRest, 0.0);\n#ifdef USE_ALPHAHASH\nvPosition = studyRest;\n#endif');
    shader.fragmentShader = shader.fragmentShader
      // Mature opacity=1 already bypasses alphaHash in v6; keep that behavior.
      .replace('#include <alphahash_fragment>', 'if (diffuseColor.a < .999) {\n#include <alphahash_fragment>\n}')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        float studyLeaf = smoothstep(.015, .12, vColor.g - max(vColor.r, vColor.b));
        float studyGrazing = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
        float studyBacklight = max(0.0, dot(-normal, normalize(vec3(.4, .45, -.8))));
        reflectedLight.indirectDiffuse += diffuseColor.rgb * studyBacklight
          * (.025 + .065 * studyGrazing) * (1.0 - studyLeaf * .65);`);
    material.userData.shader = shader;
  };
  return material;
}
