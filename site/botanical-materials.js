// Decision: .agents/notes/proposed/floral-style/2026-10-25-natural-garden-release.md
import * as THREE from './vendor/three-0.186.1/three.module.js';
import { BLOOM_GLSL } from './three-materials.js?v=7';

// Natural-garden petals: original surface pigment, neutral soft illumination,
// shared GPU growth/normal deformation, no positional stripes or pretend veins.
export function createBotanicalMaterial(uniforms) {
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: .88, metalness: 0,
    sheen: .12, sheenColor: new THREE.Color('#fff9ee'), sheenRoughness: .94,
    specularIntensity: .10, clearcoat: 0, transmission: 0,
    transparent: false, depthTest: true, depthWrite: true, dithering: true,
  });
  material.name = 'natural-garden-matte-petal';
  material.forceSinglePass = true;
  material.customProgramCacheKey = () => 'natural-garden-matte-petal-r186-v7';
  material.userData.botanical = {style: 'natural-garden', veins: false,
    pigmentPattern: 'vertex-pigment-only', backlight: 'gentle-thin-sheet'};
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = BLOOM_GLSL + '\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader
      // Pinned r186 uses vec4 vColor even with an RGB vertex attribute.
      .replace('#include <color_vertex>', 'vColor = vec4(bloomPigment(), aPosition.w);')
      .replace('#include <beginnormal_vertex>', 'vec3 botanicalRest = bloomPose();\nvec3 objectNormal = bloomIdleNormal(botanicalRest, bloomNormal());')
      .replace('#include <begin_vertex>', 'vec3 transformed = bloomIdle(botanicalRest, 0.0);\n#ifdef USE_ALPHAHASH\nvPosition = botanicalRest;\n#endif');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <alphahash_fragment>', 'if (diffuseColor.a < .999) {\n#include <alphahash_fragment>\n}')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        float botanicalLeaf = smoothstep(.015, .12, vColor.g - max(vColor.r, vColor.b));
        float botanicalGrazing = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
        float botanicalBacklight = max(0.0, dot(-normal, normalize(vec3(.4, .45, -.8))));
        reflectedLight.indirectDiffuse += diffuseColor.rgb * botanicalBacklight
          * (.025 + .065 * botanicalGrazing) * (1.0 - botanicalLeaf * .65);`);
    material.userData.shader = shader;
  };
  return material;
}
