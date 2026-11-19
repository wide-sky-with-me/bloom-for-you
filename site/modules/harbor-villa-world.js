// Coordinator assembling Villa, Monet Gardens/Pond, Harbor Estate Landmarks & Town NPCs/Wildlife.

import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { createInteractionFX } from "./flora-and-fx.js";
import { buildCoastalVillaSection } from "./world-villa.js";
import { buildGardensAndPondSection } from "./world-gardens-pond.js";
import { buildEstateAndHarborSection } from "./world-harbor-estate.js";
import { buildTownNPCsAndWildlifeSection } from "./world-town-life.js";

export function buildHarborVillaWorld(scene, { models, shadowGen = null, courtRefs = null } = {}) {
  const worldRoot = new TransformNode("HarborVillaWorld", scene);
  const fx = createInteractionFX(worldRoot, { name: "WorldInteractionFX", maxSparks: 640, maxPetals: 240, maxRings: 20, scene });

  const villa = buildCoastalVillaSection(scene, worldRoot, models, shadowGen, fx);
  const gardens = buildGardensAndPondSection(scene, worldRoot, models, shadowGen, fx);
  const estate = buildEstateAndHarborSection(scene, worldRoot, models, shadowGen, fx, courtRefs);
  const townLife = buildTownNPCsAndWildlifeSection(scene, worldRoot, models, shadowGen, fx);

  const interactables = [...villa.interactables, ...gardens.interactables, ...estate.interactables, ...townLife.interactables];

  return {
    root: worldRoot,
    interactables,
    fx,
    setFireBoost: villa.setFireBoost,
    getFireBoost: villa.getFireBoost,
    setNightMix(mix) {
      villa.setNightMix(mix);
      gardens.setNightMix(mix);
      estate.setNightMix(mix);
      townLife.setNightMix(mix);
    },
    update(dt, elapsed) {
      fx.update(dt, elapsed);
      villa.update(elapsed, dt);
      gardens.update(elapsed, dt);
      estate.update(elapsed, dt);
      townLife.update(elapsed, dt);
    },
    reset() {
      fx.clear();
      villa.reset();
      gardens.reset();
      estate.reset();
      townLife.reset();
    },
  };
}
