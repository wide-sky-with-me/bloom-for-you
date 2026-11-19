// Unified GLB Asset Loader for Babylon.js 9.36 Right-Handed Scene
// Supports both HTTP fetch (Web build) and inline gzip+base64 decoding (offline file:// HTML).

import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";

export const MODEL_MANIFEST = {
  // Sculpted Hero Blender GLBs
  couple_xian: "./assets/models/couple_xian.glb",
  couple_ran: "./assets/models/couple_ran.glb",
  coastal_villa: "./assets/models/coastal_villa.glb",
  garden_monet_pond: "./assets/models/garden_monet_pond.glb",
  garden_swing_arches: "./assets/models/garden_swing_arches.glb",
  coastal_lighthouse: "./assets/models/coastal_lighthouse.glb",
  hilltop_windmill: "./assets/models/hilltop_windmill.glb",
  creek_bridge: "./assets/models/creek_bridge.glb",
  cliffside_gazebo: "./assets/models/cliffside_gazebo.glb",
  provencal_cottage: "./assets/models/provencal_cottage.glb",
  harbor_fleet: "./assets/models/harbor_fleet.glb",
  stylized_trees: "./assets/models/stylized_trees.glb",
  stylized_critters: "./assets/models/stylized_critters.glb",
  npc_vita: "./assets/models/npc_vita.glb",
  npc_shino: "./assets/models/npc_shino.glb",
  npc_vivi: "./assets/models/npc_vivi.glb",
  // Curated Photogrammetry, Botanical & Aquatic GLBs
  freshwater_shrimp: "./assets/models/freshwater_shrimp.glb",
  ryukin_goldfish: "./assets/models/ryukin_goldfish.glb",
  pond_koi: "./assets/models/pond_koi.glb",
  waterlily: "./assets/models/waterlily.glb",
  rose_bush: "./assets/models/rose_bush.glb",
  margarita_bush: "./assets/models/margarita_bush.glb",
  wisteria_cascade: "./assets/models/wisteria_cascade.glb",
  ph_fern: "./assets/models/ph_fern.glb",
  ph_periwinkle: "./assets/models/ph_periwinkle.glb",
  hero_rose: "./assets/models/hero_rose.glb",
  ph_sofa: "./assets/models/ph_sofa.glb",
  ph_green_chair: "./assets/models/ph_green_chair.glb",
  ph_armchair: "./assets/models/ph_armchair.glb",
  ph_chandelier: "./assets/models/ph_chandelier.glb",
  ph_ornate_mirror: "./assets/models/ph_ornate_mirror.glb",
  ph_console: "./assets/models/ph_console.glb",
  ph_nightstand: "./assets/models/ph_nightstand.glb",
  ph_coffee_table: "./assets/models/ph_coffee_table.glb",
  ph_tea_set: "./assets/models/ph_tea_set.glb",
  ph_mantel_clock: "./assets/models/ph_mantel_clock.glb",
  ph_picture_frame: "./assets/models/ph_picture_frame.glb",
  ph_bistro_set: "./assets/models/ph_bistro_set.glb",
  ph_brass_pan: "./assets/models/ph_brass_pan.glb",
  ph_croissant: "./assets/models/ph_croissant.glb",
  ph_wicker_basket: "./assets/models/ph_wicker_basket.glb",
  ph_watering_can: "./assets/models/ph_watering_can.glb",
  ph_alarm_clock: "./assets/models/ph_alarm_clock.glb",
  ph_oil_lamp: "./assets/models/ph_oil_lamp.glb",
  ph_cliff_01: "./assets/models/ph_cliff_01.glb",
  ph_cliff_02: "./assets/models/ph_cliff_02.glb",
  ph_coast_rocks: "./assets/models/ph_coast_rocks.glb",
  ph_coast_rocks_b: "./assets/models/ph_coast_rocks_b.glb",
  ph_moss_boulder: "./assets/models/ph_moss_boulder.glb",
  ph_lifebuoy: "./assets/models/ph_lifebuoy.glb",
  ph_picnic_table: "./assets/models/ph_picnic_table.glb",
};

export const MODEL_COUNT = Object.keys(MODEL_MANIFEST).length;

export async function decodeGzipBase64ToUint8Array(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  if (typeof DecompressionStream !== "undefined") {
    const ds = new DecompressionStream("gzip");
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    const ab = await new Response(stream).arrayBuffer();
    return new Uint8Array(ab);
  }
  return bytes;
}

export async function loadGLBContainer(scene, key, url) {
  const inlineStore =
    typeof window !== "undefined" && window.__INLINE_GLB_GZIP_B64__
      ? window.__INLINE_GLB_GZIP_B64__
      : null;

  try {
    if (inlineStore && inlineStore[key]) {
      const bytes = await decodeGzipBase64ToUint8Array(inlineStore[key]);
      return await LoadAssetContainerAsync(bytes, scene, { pluginExtension: ".glb", name: `${key}.glb` });
    }
    if (!url) return null;
    return await LoadAssetContainerAsync(url, scene, { pluginExtension: ".glb" });
  } catch (err) {
    console.warn(`[assets-loader] Failed loading GLB ${key}:`, err);
    return null;
  }
}

export async function loadAllGameModels(scene, onProgress = null) {
  const entries = Object.entries(MODEL_MANIFEST);
  const containers = {};
  const failedKeys = [];
  let completed = 0;
  const BATCH_SIZE = 8;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async ([key, url]) => {
        const loaded = await loadGLBContainer(scene, key, url);
        containers[key] = loaded;
        if (!loaded) failedKeys.push(key);
        completed += 1;
        if (onProgress) onProgress(completed / entries.length, key);
      })
    );
  }
  containers.__failedKeys = failedKeys;
  return containers;
}

export function instantiateGLB(container, namePrefix, parent = null) {
  if (!container) return null;
  const inst = container.instantiateModelsToScene(
    (srcName) => `${namePrefix}_${srcName}`,
    false,
    { doNotInstantiate: true }
  );
  const rootNode = inst.rootNodes[0] || null;
  if (rootNode && parent) {
    rootNode.parent = parent;
  }
  return inst;
}
