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

export class GenshinToonPlugin extends MaterialPluginBase {
  constructor(material, sharedState, options = {}) {
    super(material, "GenshinToon", 200, { GENSHIN_TOON: false }, true, false);
    this._state = sharedState;
    this._boundVersion = -1;
    this._isCharacter = Boolean(options.isCharacter);
    this._strength = options.strength ?? (this._isCharacter ? 0.86 : 0.72);
    this._rimStrength = options.rimStrength ?? (this._isCharacter ? 0.25 : 0.16);
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
      this._isCharacter ? 1.0 : 0.0
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
    float toonChar = uToonParams.w;

    float toonNdl = dot(toonN, toonL);
    float toonShadow = numLights > 0.5 ? clamp(aggShadow, 0.0, 1.0) : 1.0;

    float bandEdge = mix(0.18, 0.07, toonChar);
    float diffuseBand = smoothstep(-0.08, bandEdge, toonNdl);
    float shadowBand = smoothstep(0.26, 0.72, toonShadow);
    float litBand = diffuseBand * mix(0.36, 1.0, shadowBand);

    vec3 dayShadowTint = mix(vec3(0.60, 0.74, 1.00), vec3(0.74, 0.79, 0.98), toonChar);
    vec3 nightShadowTint = vec3(0.38, 0.48, 0.80);
    vec3 shadowTint = mix(dayShadowTint, nightShadowTint, toonNight);

    vec3 dayLitTint = mix(vec3(1.07, 1.04, 0.96), vec3(1.05, 1.03, 0.99), toonChar);
    vec3 nightLitTint = vec3(0.84, 0.93, 1.10);
    vec3 litTint = mix(dayLitTint, nightLitTint, toonNight);

    vec3 celTint = mix(shadowTint, litTint, litBand);
    vec3 toonAlbedo = surfaceAlbedo * (vLightingIntensity.x * vLightingIntensity.w);
    float bandLum = mix(0.74, 1.12, litBand);
    vec3 celDiffuseTarget = toonAlbedo * celTint * (bandLum * 0.68);
    vec3 celAmbientTarget = toonAlbedo * shadowTint * mix(0.34, 0.42, toonChar);

    float flattenMix = toonStrength * mix(0.50, 0.76, toonChar);
    finalDiffuse = mix(finalDiffuse, celDiffuseTarget, flattenMix);
    finalAmbient = mix(finalAmbient, celAmbientTarget, flattenMix * 0.82);

#ifdef REFLECTION
    finalIrradiance = mix(finalIrradiance, finalIrradiance * celTint * 1.08, toonStrength * 0.55);
#endif

    float toonNdotV = max(dot(toonN, toonV), 0.0);
    float rimPow = mix(3.6, 2.8, toonChar);
    float rimMask = pow(1.0 - toonNdotV, rimPow) * smoothstep(-0.24, 0.46, toonNdl);
    vec3 rimColor = mix(vec3(1.00, 0.97, 0.84), vec3(0.54, 0.80, 1.00), toonNight);
    finalDiffuse += toonAlbedo * rimColor * (rimMask * toonRimScale * toonStrength);
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
  const isSoftFaceFeature = SOFT_FEATURE_RE.test(name);
  return {
    isCharacter,
    strength: isSoftFaceFeature ? 0.45 : isCharacter ? 0.86 : 0.72,
    rimStrength: isSoftFaceFeature ? 0.06 : isCharacter ? 0.25 : 0.16,
  };
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
