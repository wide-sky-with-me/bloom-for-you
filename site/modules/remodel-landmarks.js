// Retire only superseded drawable art. Do not disable its parent nodes: the classic
// lamp rotor still parents the night beams, and all gameplay/FX keep their transforms.
const RETIRED = /^(?:SwingGLB_|WindmillGLB_|LighthouseGLB_|MonetPondGLB_|PondWaterlilies_|PondWaterSurface$|Waterfall(?:Upper|Lower)$)/;

// The exported water has sculpted vertices, but no UVs. Project each surface onto
// its own local XZ / XY plane before reusing the live ripple and waterfall textures.
function projectWaterUV(mesh, axis) {
  const pos = mesh.getVerticesData("position");
  const { minimum: lo, maximum: hi } = mesh.getBoundingInfo().boundingBox;
  const uv = new Float32Array(pos.length / 3 * 2);
  for (let i = 0, j = 0; i < pos.length; i += 3) {
    uv[j++] = (pos[i] - lo.x) / (hi.x - lo.x);
    uv[j++] = axis === "y" ? (pos[i + 1] - lo.y) / (hi.y - lo.y) : (pos[i + 2] - lo.z) / (hi.z - lo.z);
  }
  mesh.setVerticesData("uv", uv);
}

export function prepareLandmarkReplacement(scene, nodes) {
  const pendulum = nodes.get("M02_Pendulum_X");
  const rotor = nodes.get("M04.Rotor");
  const wick = nodes.get("M03 22 · Single incandescent wick");
  const pond = nodes.get("M05 • Pond • original 56-point shoreline");
  const cascade = nodes.get("M05 • Spring • divided double-drop curtain");
  if (!pendulum || !rotor || !wick || !pond || !cascade || !nodes.has("MonetCliff")) {
    throw new Error("Missing remodel moving landmark, lantern optic, or pond bridge");
  }
  const wickMesh = wick.getTotalVertices?.() > 0 ? wick : wick.getChildMeshes()[0];
  wickMesh.computeWorldMatrix(true);
  const wickY = wickMesh.getBoundingInfo().boundingBox.centerWorld.y;
  const garden = scene.getTransformNodeByName("GardensAndPondGroup")?.metadata;
  const estate = scene.getTransformNodeByName("HarborAndEstateGroup")?.metadata;
  if (typeof garden?.bindRemodelMotion !== "function" || typeof estate?.bindRemodelMotion !== "function") {
    throw new Error("Build the playable gardens and harbor before installing their landmarks");
  }
  const superseded = scene.meshes.filter(m => m.getTotalVertices() && RETIRED.test(m.name));
  return () => {
    for (const mesh of superseded) {
      mesh.isVisible = false;
      mesh.isPickable = false;
    }
    projectWaterUV(pond, "z");
    projectWaterUV(cascade, "y");
    garden.bindRemodelMotion(pendulum, pond, cascade);
    estate.bindRemodelMotion(rotor, wickY);
  };
}
