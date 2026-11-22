import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import "@babylonjs/loaders/glTF/2.0/glTFLoader.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_mesh_quantization.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_texture_transform.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_specular.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_emissive_strength.js";
import { prepareVillaReplacement } from "./remodel-villa.js";
import { prepareLandmarkReplacement } from "./remodel-landmarks.js";

// Survey control points in the playable coordinate system (Blender x,z,-y), metres.
const LANDMARKS = [
  ["M01.CoastalVillaEntry", -14, 2.6, 6.28], ["M02.DoubleSwing", -28.5, 2.2, 14],
  ["M03.Lighthouse", 78, 1.38, 10], ["M04.Windmill", -52, 14.2, -68],
  ["M05.MonetPond", -1.5, 2.05, 16.8], ["M06.StudyDesk", -7.4, 3.395, -8.25],
];
const SUPPORT = new Set(["MonetCliff", "Study vase | original desk socket", "Study | letter paper", "Study | wax seal"]);
const BAKED_ANIMALS = new Set(["M05 • Kohaku shoal", "M05 • Ryukin goldfish", "M05 • Freshwater shrimp"]);

function selectLandmarkRoots({ json }) {
  // Change the default glTF scene, NOT the shared node/accessor arrays: pivot children,
  // referenced textures and animations keep their original indices. In particular the
  // baked copy of the terrain, house, furniture, trees, boats and crowds never loads.
  const stage = json.scenes[json.scene ?? 0];
  stage.nodes = stage.nodes.filter(i => {
    const name = json.nodes[i].name;
    return !BAKED_ANIMALS.has(name) && (/^(?:Anchor\.)?M0[1-6]/.test(name) || SUPPORT.has(name));
  });
}

function pickId(name) {
  if (/^M06 |^Study \| (?:wax seal|letter paper)/.test(name)) return "villa-love-letter";
  if (name.startsWith("M02.Moving bench")) return "garden-swing-ride";
  if (name.startsWith("M03 ")) return "estate-lighthouse-flash";
  if (name.startsWith("M04.")) return "estate-windmill-spin";
  if (name.startsWith("M05 • Pond •")) return "garden-koi-feed";
  if (name.startsWith("M05 • Spring •")) return "garden-waterfall-splash";
  return null;
}

/** Swap art in the assembled playable world, before first render. Classic owns terrain,
 * navigation, both floors, doors, NPC and critter hit proxies, interactions and FX. */
export async function installRemodelWorld(scene, url) {
  const art = await LoadAssetContainerAsync(url, scene, {
    pluginExtension: ".glb",
    pluginOptions: { gltf: { onParsed: selectLandmarkRoots, animationStartMode: 0 } },
  });
  try {
    const root = art.meshes[0];
    if (root?.name !== "__root__") throw new Error("Missing island.glb coordinate root");
    root.name = "RemodelLandmarks";
    if (!scene.useRightHandedSystem) {
      // AUTO reflects X via rotation Y=π and scale Z=-1. Here the asset is a
      // world-space survey, not a local prop: east must stay at +78 in either scene.
      // Only the loader-owned root is reset; Babylon accounts for determinant in culling.
      root.rotationQuaternion.set(0, 0, 0, 1);
      root.scaling.setAll(1);
    }
    const nodes = new Map([...art.transformNodes, ...art.meshes].map(node => [node.name, node]));
    root.computeWorldMatrix(true);
    const drawables = art.meshes.filter(m => m.getTotalVertices() > 0);
    for (const [mark, x, y, z] of LANDMARKS) {
      const anchor = nodes.get("Anchor." + mark);
      const world = anchor?.computeWorldMatrix(true).getTranslation();
      if (!world || !world.equalsWithEpsilon(new Vector3(x, y, z), 0.005) ||
          !drawables.some(m => m.name.startsWith(mark.slice(0, 3)))) {
        throw new Error("Missing or misaligned island.glb landmark: " + mark);
      }
    }
    const retireVilla = prepareVillaReplacement(scene);
    const replaceLandmarks = prepareLandmarkReplacement(scene, nodes);
    const shadows = scene.getLightByName("SunDirLight")?.getShadowGenerator(scene.activeCamera);
    for (const mesh of drawables) {
      const id = pickId(mesh.name);
      // A decorative wall or transparent flower is not a click-to-walk surface.
      // Keep classic ground and the existing NPC/animal proxies eligible for picking.
      mesh.isPickable = Boolean(id);
      if (id) mesh.metadata = { ...mesh.metadata, interactive: { id } };
      mesh.receiveShadows = true;
    }
    art.addAllToScene();
    retireVilla();
    replaceLandmarks();
    // Large opaque silhouettes only; fine foliage/foil details are not useful CSM casters.
    for (const mesh of drawables) {
      if (/^M01\.(Walls|Arcade|Roof\.Hall)|^M02\.(Static|Moving)|^M03 02 |^M04\.(Lime mortar|Sail [1-4] • billowed)/.test(mesh.name) &&
          !mesh.material?.needAlphaBlendingForMesh(mesh)) shadows?.addShadowCaster(mesh, false);
    }
    return root;
  } catch (error) {
    art.dispose();
    throw error;
  }
}
