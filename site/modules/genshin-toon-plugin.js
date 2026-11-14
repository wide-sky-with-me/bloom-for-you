// Genshin Impact Teyvat Cel-Shading Material Plugin for Babylon.js 9.36 PBRMaterial.
// Injects luminous 2-band cel diffuse lighting, cool periwinkle shadow tint,
// and warm anime Fresnel rim highlights onto world & character PBR materials.

import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

const SKIP_MATERIAL_RE = /water|creekwater|pondwater|glass|windowglass|sheer|foam|wake|glaze|watermat/i;
const CHARACTER_MATERIAL_RE =
  /couple_|skin|body|face|hair|top|bottom|shoe|accessory|coat|cuff|vision|vrm|victoria|sakurada|mouth|brow|lash|eyeline|iris|highlight|eyewhite|cloth|ran_|xian_/i;
const SOFT_FEATURE_RE = /face_features|eye|lash|brow|eyeline|iris|highlight|mouth/i;
const HAIR_MATERIAL_RE = /hair/i;
const FACE_SKIN_RE = /face_00_skin|f00_000_00_face|head_skin|^face$/i;

// Shader mode IDs encoded cleanly into uToonParams.w:
// 0 = World, 1 = Character Cloth/Body, 2 = Character Hair, 3 = Face Skin, 4 = Eye/Face Features
export class GenshinToonPlugin extends MaterialPluginBase {
  constructor(material, sharedState, options = {}) {
    super(material, "GenshinToon", 200, { GENSHIN_TOON: false }, true, false);
    this._state = sharedState;
    this._boundVersion = -1;
    this._mode = options.mode ?? (options.isCharacter ? 1 : 0);
    this._isCharacter = this._mode > 0;
    this._strength = options.strength ?? (this._isCharacter ? 0.90 : 0.80);
    this._rimStrength = options.rimStrength ?? (this._isCharacter ? 0.28 : 0.18);
    this._isEnabled = true;
    this.registerForExtraEvents = true;
    this.doNotSerialize = true;
    this._enable(true);
    this.markAllDefinesAsDirty();
  }

  getClassName() {
    return "GenshinToonPlugin";
  }

  isCompatible(shaderLanguage) {
    return shaderLanguage === 0;
  }

  collectDefines(defines) {
    defines.GENSHIN_TOON = { type: "boolean", default: false };
  }

  prepareDefines(defines, _scene, _mesh) {
    defines.GENSHIN_TOON = this._isEnabled;
  }

  getUniforms() {
    return {
      ubo: [
        { name: "uToonParams", size: 4, type: "vec4" },
        { name: "uToonSunDir", size: 4, type: "vec4" },
      ],
    };
  }

  _bindToonUniforms(uniformBuffer) {
    const s = this._state;
    const d = s.sunDir;
    uniformBuffer.updateFloat4(
      "uToonParams",
      s.nightMix,
      this._strength,
      this._rimStrength,
      this._mode
    );
    uniformBuffer.updateFloat4("uToonSunDir", d.x, d.y, d.z, 0.0);
    this._boundVersion = s.version;
  }

  bindForSubMesh(uniformBuffer) {
    if (!this._isEnabled) return;
    this._bindToonUniforms(uniformBuffer);
  }

  hardBindForSubMesh(uniformBuffer) {
    if (!this._isEnabled || this._boundVersion === this._state.version) return;
    this._bindToonUniforms(uniformBuffer);
    uniformBuffer.update();
  }

  getCustomCode(shaderType) {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
#if defined(GENSHIN_TOON) && !defined(UNLIT)
  {
    vec3 toonN = normalize(normalW);
    vec3 toonV = normalize(viewDirectionW);
    vec3 toonL = normalize(uToonSunDir.xyz);
    float toonNight = clamp(uToonParams.x, 0.0, 1.0);
    float toonStrength = clamp(uToonParams.y, 0.0, 1.0);
    float toonRimScale = uToonParams.z;
    float toonMode = uToonParams.w;

    float isChar = step(0.5, toonMode);
    float isHair = step(1.5, toonMode) * (1.0 - step(2.5, toonMode));
    float isFaceSkin = step(2.5, toonMode) * (1.0 - step(3.5, toonMode));
    float isEyeFeat = step(3.5, toonMode);

    float toonNdl = dot(toonN, toonL);
    float toonShadow = numLights > 0.5 ? clamp(aggShadow, 0.0, 1.0) : 1.0;

    // 2-band HoyoToon ramp: sharp for cloth/world, ultra-soft SDF emulation for anime face skin
    float edgeLo = mix(mix(-0.10, -0.07, isChar), -0.34, isFaceSkin);
    float edgeHi = mix(mix(0.14, 0.05, isChar), 0.26, isFaceSkin);
    float diffuseBand = smoothstep(edgeLo, edgeHi, toonNdl);
    float shadowBand = smoothstep(0.24, 0.68, toonShadow);
    float shadowDepth = mix(mix(0.26, 0.42, isChar), 0.84, max(isFaceSkin, isEyeFeat));
    float litBand = mix(diffuseBand * mix(shadowDepth, 1.0, shadowBand), 0.94, isEyeFeat * 0.65);

    vec3 worldShadowBase = vec3(0.58, 0.71, 0.94);
    // Protect downward interior ceilings from turning cyan-blue under sky shadow tint
    float ceilingBounce = smoothstep(-0.12, -0.72, toonN.y);
    vec3 worldShadow = mix(worldShadowBase, vec3(0.92, 0.89, 0.84), ceilingBounce);
    vec3 clothShadow = vec3(0.67, 0.72, 0.96);
    vec3 faceShadow  = vec3(0.92, 0.78, 0.80);
    vec3 dayShadowTint = mix(mix(worldShadow, clothShadow, isChar), faceShadow, max(isFaceSkin, isEyeFeat));
    vec3 nightShadowTint = mix(vec3(0.32, 0.44, 0.78), vec3(0.54, 0.58, 0.82), max(isFaceSkin, isEyeFeat));
    vec3 shadowTint = mix(dayShadowTint, nightShadowTint, toonNight);

    vec3 dayLitTint = mix(vec3(1.08, 1.04, 0.94), vec3(1.04, 1.02, 0.99), isChar);
    vec3 nightLitTint = vec3(0.84, 0.94, 1.12);
    vec3 litTint = mix(dayLitTint, nightLitTint, toonNight);

    float worldBandLift = mix(litBand, max(litBand, ceilingBounce * 0.46), 1.0 - isChar);
    vec3 celTint = mix(shadowTint, litTint, worldBandLift);
    vec3 toonAlbedo = surfaceAlbedo * (vLightingIntensity.x * vLightingIntensity.w);
    float bandLum = mix(mix(0.62, 1.18, worldBandLift), mix(0.84, 1.08, litBand), max(isFaceSkin, isEyeFeat));
    vec3 celDiffuseTarget = toonAlbedo * celTint * (bandLum * 0.70);
    vec3 celAmbientTarget = toonAlbedo * shadowTint * mix(0.34, 0.44, max(isChar, isFaceSkin));

    float flattenMix = toonStrength * mix(0.78, mix(0.88, 0.72, isFaceSkin), isChar);
    finalDiffuse = mix(finalDiffuse, celDiffuseTarget, flattenMix);
    finalAmbient = mix(finalAmbient, celAmbientTarget, flattenMix * 0.88);

#ifdef REFLECTION
    finalIrradiance = mix(finalIrradiance, finalIrradiance * celTint * 0.92, toonStrength * 0.65);
#endif

    // Stepped anime silhouette rim light
    float toonNdotV = max(dot(toonN, toonV), 0.0);
    float fresnelRaw = 1.0 - toonNdotV;
    float steppedRim = smoothstep(0.58, 0.80, fresnelRaw) * smoothstep(-0.20, 0.42, toonNdl);
    float softRim = pow(fresnelRaw, 3.2) * smoothstep(-0.22, 0.46, toonNdl);
    float rimMask = mix(softRim, steppedRim, isChar * (1.0 - isFaceSkin));
    vec3 rimColor = mix(vec3(1.00, 0.97, 0.84), vec3(0.54, 0.82, 1.00), toonNight);
    finalDiffuse += toonAlbedo * rimColor * (rimMask * toonRimScale * toonStrength);

    // Signature Genshin hair "Angel Ring" anisotropic crown gleam
    if (isHair > 0.5) {
      float ringDelta = toonN.y - (0.14 + toonV.y * 0.24);
      float ringBand = exp(-ringDelta * ringDelta * 26.0);
      float hairRing = ringBand * smoothstep(0.18, 0.65, toonNdotV) * smoothstep(-0.22, 0.36, toonNdl);
      vec3 ringCol = mix(vec3(1.00, 0.96, 0.88), vec3(0.72, 0.86, 1.00), toonNight);
      finalDiffuse += (toonAlbedo * 0.55 + vec3(0.32)) * ringCol * (hairRing * 0.26);
    }
  }
#endif
`,
    };
  }
}

function classifyMaterial(mat) {
  if (!mat || !(mat instanceof PBRMaterial) || mat.unlit) return null;
  if (mat.pluginManager?.getPlugin("GenshinToon")) return null;
  const name = mat.name || "";
  if (SKIP_MATERIAL_RE.test(name)) return null;
  if ((mat.alpha ?? 1.0) < 0.92 && mat.transparencyMode !== PBRMaterial.MATERIAL_ALPHATEST) {
    return null;
  }
  const isCharacter = CHARACTER_MATERIAL_RE.test(name);
  if (!isCharacter) {
    return {
      isCharacter: false,
      mode: 0,
      strength: 0.80,
      rimStrength: 0.18,
    };
  }
  const isSoftFaceFeature = SOFT_FEATURE_RE.test(name);
  const isHair = HAIR_MATERIAL_RE.test(name);
  const isFaceSkin = !isSoftFaceFeature && (FACE_SKIN_RE.test(name) || (/face/i.test(name) && /skin/i.test(name)));
  let mode = 1;
  let strength = 0.90;
  let rimStrength = 0.30;
  if (isSoftFaceFeature) {
    mode = 4;
    strength = 0.45;
    rimStrength = 0.05;
  } else if (isHair) {
    mode = 2;
    strength = 0.90;
    rimStrength = 0.24;
  } else if (isFaceSkin) {
    mode = 3;
    strength = 0.84;
    rimStrength = 0.10;
  }
  return { isCharacter: true, mode, strength, rimStrength };
}

/**
 * Installs Genshin Impact cel-shading across all world & character PBR materials.
 * Returns a controller `{ setSunState(nightMix, sunDirVec) }`.
 */
export function installGenshinToonShading(scene, initialSunDir = new Vector3(0.58, 0.30, 0.72)) {
  const sharedState = {
    nightMix: 0.0,
    sunDir: initialSunDir.clone().normalize(),
    version: 1,
  };

  const tryAttach = (mat) => {
    const opts = classifyMaterial(mat);
    if (!opts) return null;
    return new GenshinToonPlugin(mat, sharedState, opts);
  };

  for (const mat of scene.materials) {
    tryAttach(mat);
  }

  const obs = scene.onNewMaterialAddedObservable.add((mat) => {
    queueMicrotask(() => {
      if (!mat.isDisposed?.()) {
        tryAttach(mat);
      }
    });
  });

  return {
    dispose() {
      scene.onNewMaterialAddedObservable.remove(obs);
    },
    setSunState(nightMix, sunDirVec) {
      const m = Math.max(0, Math.min(1, Number(nightMix) || 0));
      let changed = Math.abs(m - sharedState.nightMix) > 0.002;
      if (sunDirVec) {
        const nx = sunDirVec.x;
        const ny = sunDirVec.y;
        const nz = sunDirVec.z;
        const len = Math.hypot(nx, ny, nz) || 1;
        const dx = nx / len;
        const dy = ny / len;
        const dz = nz / len;
        if (
          Math.abs(dx - sharedState.sunDir.x) > 0.002 ||
          Math.abs(dy - sharedState.sunDir.y) > 0.002 ||
          Math.abs(dz - sharedState.sunDir.z) > 0.002
        ) {
          sharedState.sunDir.set(dx, dy, dz);
          changed = true;
        }
      }
      if (changed) {
        sharedState.nightMix = m;
        sharedState.version += 1;
      }
    },
  };
}
