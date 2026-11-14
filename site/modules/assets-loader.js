// Unified GLB & Havok 1.3.14 WASM Asset Loader + Static Collider Physics Sync (Babylon 9.36 Right-Handed).

import HavokPhysics from "@babylonjs/havok";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import "@babylonjs/core/Physics/joinedPhysicsEngineComponent";
import "@babylonjs/core/Physics/v2/physicsEngineComponent";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import {
  POND_CONFIG,
  SWING_CONFIG,
  getRegisteredColliders,
  getWorldTerrainY,
} from "./world-spatial.js";

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
  ph_coastal_shrub: "./assets/models/ph_coastal_shrub.glb",
  ph_lifebuoy: "./assets/models/ph_lifebuoy.glb",
  ph_picnic_table: "./assets/models/ph_picnic_table.glb",
};

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

export async function initHavokPhysics(scene) {
  const inlineWasm =
    typeof window !== "undefined" && window.__INLINE_HAVOK_WASM_GZIP_B64__
      ? window.__INLINE_HAVOK_WASM_GZIP_B64__
      : null;

  let havokInstance = null;
  if (inlineWasm) {
    const wasmBinary = await decodeGzipBase64ToUint8Array(inlineWasm);
    havokInstance = await HavokPhysics({ wasmBinary });
  } else {
    havokInstance = await HavokPhysics({
      locateFile: (file) => (file.endsWith(".wasm") ? "./assets/havok/HavokPhysics.wasm" : file),
    });
  }

  const plugin = new HavokPlugin(true, havokInstance);
  const physicsReady = scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
  if (!physicsReady || !scene.getPhysicsEngine()) {
    throw new Error("Havok physics engine failed to attach to Babylon scene.");
  }

  const aggregates = [];
  const syncColliders = () => {
    if (aggregates.length > 0) return aggregates.length;
    const colParent = new TransformNode("HavokStaticColliders", scene);
    const addStaticBox = (name, x, y, z, sx, sy, sz, ry = 0) => {
      const tn = new TransformNode(name, scene);
      tn.parent = colParent;
      tn.position.set(x, y, z);
      if (ry) tn.rotation.y = ry;
      const agg = new PhysicsAggregate(
        tn,
        PhysicsShapeType.BOX,
        { mass: 0, restitution: 0.05, friction: 0.8, extents: new Vector3(sx, sy, sz) },
        scene
      );
      aggregates.push(agg);
    };
    const addStaticCylinder = (name, x, y, z, radius, height) => {
      const tn = new TransformNode(name, scene);
      tn.parent = colParent;
      tn.position.set(x, y, z);
      const agg = new PhysicsAggregate(
        tn,
        PhysicsShapeType.CYLINDER,
        {
          mass: 0,
          restitution: 0.05,
          friction: 0.8,
          pointA: new Vector3(0, -height * 0.5, 0),
          pointB: new Vector3(0, height * 0.5, 0),
          radius,
        },
        scene
      );
      aggregates.push(agg);
    };

    // Static Walkable Structural Floor Slabs (1F/2F Villa, Courtyard, Harbor Quay, Breakwater, Pond & Swing Clearings)
    addStaticBox("Floor_Villa1F", -14.0, 2.52, -2.0, 22.8, 0.16, 17.6);
    addStaticBox("Floor_Villa2F", -13.6, 6.02, -2.9, 19.6, 0.2, 14.0);
    addStaticBox("Floor_Courtyard", -9.25, 2.12, 9.5, 22.0, 0.2, 5.8);
    addStaticBox("Floor_HarborQuay", 27.6, 1.2, -2.0, 36.8, 0.32, 48.0);
    addStaticBox("Floor_Breakwater", 62.0, 1.28, 10.0, 32.4, 0.2, 4.8);
    addStaticBox("Floor_SwingClearing", SWING_CONFIG.cx, SWING_CONFIG.groundY - 0.1, SWING_CONFIG.cz + 1.5, 9.2, 0.2, 12.2);
    addStaticCylinder("Floor_PondTerrace", POND_CONFIG.cx, 2.1, POND_CONFIG.cz + 1.0, 7.8, 0.22);
    addStaticCylinder("Floor_GazeboTerrace", -64.0, 7.98, 42.0, 5.8, 0.2);

    // Sync Registered Spatial Box / RotatedBox / Circle Colliders
    const { boxes, rotatedBoxes, circles } = getRegisteredColliders();
    for (let i = 0; i < boxes.length; i += 1) {
      const b = boxes[i];
      const yLo = Number.isFinite(b.yMin) ? b.yMin : getWorldTerrainY((b.xMin + b.xMax) * 0.5, (b.zMin + b.zMax) * 0.5);
      const yHi = Number.isFinite(b.yMax) ? b.yMax : yLo + 2.8;
      const sy = Math.max(0.4, Math.min(8.0, yHi - yLo));
      addStaticBox(
        `ColBox_${i}`,
        (b.xMin + b.xMax) * 0.5,
        yLo + sy * 0.5,
        (b.zMin + b.zMax) * 0.5,
        Math.max(0.15, b.xMax - b.xMin),
        sy,
        Math.max(0.15, b.zMax - b.zMin)
      );
    }
    for (let i = 0; i < rotatedBoxes.length; i += 1) {
      const b = rotatedBoxes[i];
      const yLo = Number.isFinite(b.yMin) ? b.yMin : getWorldTerrainY(b.cx, b.cz);
      const yHi = Number.isFinite(b.yMax) ? b.yMax : yLo + 2.8;
      const sy = Math.max(0.4, Math.min(8.0, yHi - yLo));
      addStaticBox(`ColRotBox_${i}`, b.cx, yLo + sy * 0.5, b.cz, b.halfW * 2, sy, b.halfD * 2, -Math.atan2(b.sinR, b.cosR));
    }
    for (let i = 0; i < circles.length; i += 1) {
      const c = circles[i];
      const yLo = Number.isFinite(c.yMin) ? c.yMin : getWorldTerrainY(c.cx, c.cz);
      const yHi = Number.isFinite(c.yMax) ? c.yMax : yLo + 2.6;
      const h = Math.max(0.4, Math.min(8.0, yHi - yLo));
      addStaticCylinder(`ColCyl_${i}`, c.cx, yLo + h * 0.5, c.cz, Math.max(0.12, c.radius), h);
    }
    return aggregates.length;
  };

  return {
    plugin,
    havokInstance,
    syncColliders,
    getBodyCount: () => aggregates.length,
  };
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
  let completed = 0;
  const BATCH_SIZE = 8;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async ([key, url]) => {
        containers[key] = await loadGLBContainer(scene, key, url);
        completed += 1;
        if (onProgress) onProgress(completed / entries.length, key);
      })
    );
  }
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
