from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile
import unittest

import build

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
SINGLE_HTML = ROOT / "鸢尾湾·花与海之约.html"

EXPECTED_MODULES = (
    "world-spatial.js",
    "assets-loader.js",
    "ocean-sky-stage.js",
    "island-terrain-and-horizon.js",
    "flora-and-fx.js",
    "glb-helpers.js",
    "world-villa.js",
    "world-gardens-pond.js",
    "world-harbor-estate.js",
    "world-town-life.js",
    "harbor-villa-world.js",
    "couple-rigged-controller.js",
    "couple-mode-babylon.js",
    "genshin-toon-plugin.js",
    "exploration-camera.js",
    "gift-config.js",
    "remodel-world.js",
    "remodel-villa.js",
    "remodel-landmarks.js",
)

EXPECTED_MODELS = (
    "couple_xian",
    "couple_ran",
    "coastal_villa",
    "garden_monet_pond",
    "garden_swing_arches",
    "coastal_lighthouse",
    "hilltop_windmill",
    "creek_bridge",
    "cliffside_gazebo",
    "provencal_cottage",
    "harbor_fleet",
    "stylized_trees",
    "stylized_critters",
    "npc_vita",
    "npc_shino",
    "npc_vivi",
    "freshwater_shrimp",
    "ryukin_goldfish",
    "pond_koi",
    "waterlily",
    "rose_bush",
    "margarita_bush",
    "wisteria_cascade",
    "ph_fern",
    "ph_periwinkle",
    "hero_rose",
    "ph_sofa",
    "ph_green_chair",
    "ph_armchair",
    "ph_chandelier",
    "ph_ornate_mirror",
    "ph_console",
    "ph_nightstand",
    "ph_coffee_table",
    "ph_tea_set",
    "ph_mantel_clock",
    "ph_picture_frame",
    "ph_bistro_set",
    "ph_brass_pan",
    "ph_croissant",
    "ph_wicker_basket",
    "ph_watering_can",
    "ph_alarm_clock",
    "ph_oil_lamp",
    "ph_cliff_01",
    "ph_cliff_02",
    "ph_coast_rocks",
    "ph_coast_rocks_b",
    "ph_moss_boulder",
    "ph_lifebuoy",
    "ph_picnic_table",
)


class IrisBayCoastalEstateTests(unittest.TestCase):
    def test_build_produces_verified_release_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "dist"
            built = build.build(out)
            self.assertTrue((built / "index.html").is_file())
            self.assertTrue((built / ".nojekyll").is_file())
            self.assertTrue((built / "THIRD_PARTY_NOTICES.md").is_file())

            # Ensure dead Havok WASM and unused shrub asset are completely absent from output
            self.assertEqual(list(built.rglob("*.wasm")), [])
            self.assertFalse((built / "assets" / "models" / "ph_coastal_shrub.glb").exists())

            manifest = json.loads((built / "release.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["schema"], 10)
            self.assertEqual(manifest["title"], "鸢尾湾·花与海之约")
            self.assertEqual(manifest["style"], "iris-bay-monet-garden-coastal-estate-babylon9")
            self.assertEqual(manifest["worldSizeMeters"], 260)
            self.assertEqual(manifest["renderer"], "babylon-9.36.0")
            self.assertEqual(manifest["navigation"], "default-aerial-overlook-click-to-dive-and-walk-inside")
            for mod in EXPECTED_MODULES:
                self.assertIn(mod, manifest["modules"])

            for model_key in EXPECTED_MODELS:
                self.assertIn(f"assets/models/{model_key}.glb", manifest["files"])

    def test_build_py_detects_stale_vite_dist(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            fake_src = tmp_path / "site"
            fake_src.mkdir()
            src_file = fake_src / "app.js"
            src_file.write_text("// v1", encoding="utf-8")

            fake_dist = tmp_path / "dist-vite"
            fake_dist.mkdir()
            idx = fake_dist / "index.html"
            idx.write_text("<html></html>", encoding="utf-8")

            # Make source newer than dist-vite/index.html
            old_t = idx.stat().st_mtime - 60
            os.utime(idx, (old_t, old_t))
            self.assertTrue(build._is_vite_dist_stale(fake_dist, fake_src))

            # Make dist-vite/index.html newer than everything in site & config
            future_t = max(build._latest_source_mtime(fake_src), idx.stat().st_mtime) + 60
            os.utime(idx, (future_t, future_t))
            self.assertFalse(build._is_vite_dist_stale(fake_dist, fake_src))

    def test_npm_project_config_and_lockfile_present(self) -> None:
        self.assertTrue((ROOT / "package.json").is_file())
        self.assertTrue((ROOT / "package-lock.json").is_file())
        self.assertTrue((ROOT / "vite.config.js").is_file())
        pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        deps = pkg.get("dependencies", {})
        self.assertEqual(deps.get("@babylonjs/core"), "9.36.0")
        self.assertEqual(deps.get("@babylonjs/loaders"), "9.36.0")
        self.assertEqual(deps.get("@babylonjs/materials"), "9.36.0")
        self.assertNotIn("@babylonjs/havok", deps)
        self.assertIn("dev", pkg.get("scripts", {}))
        self.assertIn("build", pkg.get("scripts", {}))

    def test_clean_minimalist_capsule_and_hidden_debug_hud(self) -> None:
        html = (SITE / "index.html").read_text(encoding="utf-8")
        self.assertIn("鸢尾湾·花与海之约", html)
        self.assertIn('id="diorama-canvas"', html)
        self.assertIn('id="explore-bar"', html)
        self.assertIn('id="btn-letter"', html)
        self.assertIn('id="btn-mute"', html)
        self.assertIn('id="btn-pause"', html)
        self.assertIn('id="btn-daynight"', html)
        self.assertIn('id="btn-reset"', html)
        self.assertIn('id="letter-modal"', html)
        self.assertIn('id="debug-hud"', html)
        self.assertRegex(html, r'<aside[^>]*id="debug-hud"[^>]*hidden')
        self.assertNotIn("importmap", html)
        self.assertNotIn("user-scalable=no", html)
        for forbidden_hud in ("sw-topbar", "sw-nav", "sw-route", "sw-scrollbar", "sw-copylayer"):
            self.assertNotIn(forbidden_hud, html)

    def test_zero_external_runtime_urls_in_first_party_site(self) -> None:
        url_re = re.compile(r"https?://", re.IGNORECASE)
        checked = 0
        for path in sorted(SITE.rglob("*")):
            if not path.is_file():
                continue
            rel = path.relative_to(SITE).as_posix()
            if rel.startswith("vendor/") or rel.endswith("FONT-LICENSE.txt"):
                continue
            if path.suffix.lower() in {".html", ".css", ".js", ".json", ".svg"}:
                text = path.read_text(encoding="utf-8")
                if path.suffix.lower() == ".svg":
                    text = text.replace('xmlns="http://www.w3.org/2000/svg"', "")
                self.assertIsNone(
                    url_re.search(text),
                    f"External runtime URL forbidden in first-party file {rel}",
                )
                checked += 1
        self.assertGreaterEqual(checked, 16)

    def test_standalone_single_file_html_is_self_contained(self) -> None:
        self.assertTrue(SINGLE_HTML.is_file(), f"Missing standalone deliverable: {SINGLE_HTML}")
        self.assertGreater(SINGLE_HTML.stat().st_size, 5_000_000)
        text = SINGLE_HTML.read_text(encoding="utf-8")
        self.assertIn("window.__INLINE_GIFT_CONFIG__", text)
        self.assertIn("window.__INLINE_GLB_GZIP_B64__", text)
        self.assertNotIn("window.__INLINE_HAVOK_WASM_GZIP_B64__", text)
        for model_key in EXPECTED_MODELS:
            self.assertIn(f'"{model_key}":', text)
        self.assertNotIn('"ph_coastal_shrub":', text)
        self.assertIn("data:font/woff2;base64,", text)
        self.assertIsNone(re.search(r'<script\b[^>]*\bsrc=', text, re.IGNORECASE))
        self.assertIsNone(re.search(r'<link\b[^>]*rel=["\']stylesheet["\']', text, re.IGNORECASE))
        self.assertIsNone(re.search(r'<script\s+type=["\']module["\']', text, re.IGNORECASE))

    def test_gift_letter_preserved_verbatim_and_centralized(self) -> None:
        gift = json.loads((SITE / "gift.json").read_text(encoding="utf-8"))
        self.assertEqual(gift["title"], "鸢尾湾·花与海之约")
        self.assertEqual(gift["recipient"], "我最爱的老婆")
        self.assertEqual(gift["salutation"], "亲爱的老婆：")
        self.assertEqual(gift["signature"], "永远偏爱你的，老公")
        self.assertTrue(gift.get("date"))
        self.assertEqual(len(gift["letter"]), 4)
        self.assertIn("想送你一束花，又贪心地想让它永远盛开。", gift["letter"][0])

    def test_all_javascript_modules_pass_node_syntax_check(self) -> None:
        node = shutil.which("node")
        if not node:
            self.skipTest("node not installed")
        js_files = [
            SITE / "app.js",
            SITE / "audio.js",
            *sorted((SITE / "modules").glob("*.js")),
        ]
        self.assertEqual(len(js_files), 2 + len(EXPECTED_MODULES))
        for js_path in js_files:
            proc = subprocess.run(
                [node, "--check", str(js_path)],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(proc.returncode, 0, f"Syntax error in {js_path.name}: {proc.stderr}")

    def _run_node_with_real_module(self, script_body: str) -> subprocess.CompletedProcess[str]:
        node = shutil.which("node")
        if not node:
            self.skipTest("node not installed")
        # Resolve Vite extensionless @babylonjs/* imports cleanly via bundled esbuild without mocking any first-party code
        wrapper = f"""
import {{ build }} from "esbuild";
const entry = {json.dumps(script_body)};
const res = await build({{
  stdin: {{ contents: entry, resolveDir: process.cwd(), loader: "js" }},
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
}});
const code = res.outputFiles[0].text;
const dataUrl = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
await import(dataUrl);
"""
        return subprocess.run(
            [node, "--input-type=module", "-e", wrapper],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            check=False,
        )

    def test_genshin_toon_classifier_excludes_furniture_and_aquatic_props(self) -> None:
        script = r"""
import assert from "node:assert/strict";
import { classifyMaterialName } from "./site/modules/genshin-toon-plugin.js";

// Furniture & aquatic materials that previously triggered false positives ("chair" -> "hair", "bottom", "body")
for (const worldMat of [
  "Armchair_01",
  "GreenChair_01",
  "outdoor_table_chair_set_01_chair",
  "outdoor_table_chair_set_01_table",
  "wooden_picnic_table_bottom",
  "M_RyukinBody2",
  "VillaStuccoWall",
]) {
  const res = classifyMaterialName(worldMat);
  assert.equal(res.isCharacter, false, `${worldMat} must not be classified as character`);
  assert.equal(res.mode, 0, `${worldMat} must use world mode 0`);
}

// Character materials must keep exact cel modes (1=cloth, 2=hair, 3=face skin, 4=eye/features)
assert.equal(classifyMaterialName("F00_000_HairBack_00_HAIR").mode, 2);
assert.equal(classifyMaterialName("couple_xian_hair").mode, 2);
assert.equal(classifyMaterialName("npc_vita_Face_Skin").mode, 3);
assert.equal(classifyMaterialName("npc_vita_Face_Features").mode, 4);
assert.equal(classifyMaterialName("M00_000_00_EyeIris_00_EYE").mode, 4);
assert.equal(classifyMaterialName("M00_000_00_EyeHighlight_00_EYE").mode, 4);
assert.equal(classifyMaterialName("F00_002_01_Tops_01_CLOTH").mode, 1);
assert.equal(classifyMaterialName("WaterMat"), null);
assert.equal(classifyMaterialName("CustomProp", 2).mode, 2);
console.log("TOON_CLASSIFIER_OK");
"""
        proc = self._run_node_with_real_module(script)
        self.assertEqual(proc.returncode, 0, f"Toon classifier check failed:\n{proc.stderr}")
        self.assertIn("TOON_CLASSIFIER_OK", proc.stdout)

    def test_porch_floor_supersedes_paving_in_both_registration_orders(self) -> None:
        proc = self._run_node_with_real_module(r"""
import assert from "node:assert/strict";
import { clearNavigationRegistry, registerWalkZone, getWalkSurfaceY } from "./site/modules/world-spatial.js";
const courtyard = () => registerWalkZone(() => 2.235);
const villa = () => registerWalkZone((x, z) => z < 7 ? [2.60, 6.12] : null, { priority: 1 });
for (const order of [[courtyard, villa], [villa, courtyard]]) {
  clearNavigationRegistry();
  for (const register of order) register();
  assert.equal(getWalkSurfaceY(-13.93, 5.10, 2.235), 2.60);
  assert.equal(getWalkSurfaceY(-13.93, 5.10, 6.12), 6.12);
  assert.equal(getWalkSurfaceY(-13.93, 9.20, 2.60), 2.235);
}
""")
        self.assertEqual(proc.returncode, 0, proc.stderr[-1500:])

    def test_world_spatial_villa_waypoints_and_bounds(self) -> None:
        script = r"""
import assert from "node:assert/strict";
import {
  isInsideVilla1FShell,
  isInsideVilla2FShell,
  inVillaStudySuite,
  buildVillaWalkWaypoints,
} from "./site/modules/world-spatial.js";

assert.equal(isInsideVilla1FShell(-14.0, 0.0), true);
assert.equal(isInsideVilla1FShell(-14.0, 12.0), false);
assert.equal(isInsideVilla2FShell(-14.0, 0.0), true);
assert.equal(inVillaStudySuite(-7.4, -5.5), true);

// Entering study from outdoor courtyard must route through doorway (-14, 5.2) -> (-14, 2.2) -> study door
const pts = buildVillaWalkWaypoints(-14.0, 14.0, -7.4, -5.5, 2.2, 2.6);
assert.ok(pts.length >= 4, `Expected doorway waypoints, got ${JSON.stringify(pts)}`);
assert.deepEqual(pts[pts.length - 1], [-7.4, -5.5]);
console.log("WORLD_SPATIAL_OK");
"""
        proc = self._run_node_with_real_module(script)
        self.assertEqual(proc.returncode, 0, f"World spatial check failed:\n{proc.stderr}")
        self.assertIn("WORLD_SPATIAL_OK", proc.stdout)

    def test_glb_assets_compact_without_orphaned_bufferviews(self) -> None:
        models_dir = SITE / "assets" / "models"
        checked = 0
        for model_key in EXPECTED_MODELS:
            glb_path = models_dir / f"{model_key}.glb"
            self.assertTrue(glb_path.is_file(), f"Missing GLB: {glb_path}")
            data = glb_path.read_bytes()
            magic, version, _ = struct.unpack_from("<4sII", data, 0)
            self.assertEqual(magic, b"glTF")
            self.assertEqual(version, 2)
            json_len, _ = struct.unpack_from("<II", data, 12)
            gltf = json.loads(data[20 : 20 + json_len].decode("utf-8"))
            bvs = gltf.get("bufferViews", [])
            used_bvs: set[int] = set()
            for acc in gltf.get("accessors", []):
                if isinstance(acc.get("bufferView"), int):
                    used_bvs.add(acc["bufferView"])
                sp = acc.get("sparse")
                if isinstance(sp, dict):
                    used_bvs.add(sp["indices"]["bufferView"])
                    used_bvs.add(sp["values"]["bufferView"])
            for img in gltf.get("images", []):
                if isinstance(img.get("bufferView"), int):
                    used_bvs.add(img["bufferView"])
            self.assertEqual(
                len(used_bvs),
                len(bvs),
                f"{glb_path.name} still contains {len(bvs) - len(used_bvs)} unreferenced bufferViews",
            )
            if model_key in ("couple_xian", "couple_ran"):
                total_ch = sum(len(a.get("channels", [])) for a in gltf.get("animations", []))
                self.assertLess(total_ch, 2000, f"{glb_path.name} has unpruned constant animation channels ({total_ch})")
            checked += 1
        self.assertEqual(checked, len(EXPECTED_MODELS))

    def test_clone_material_sharing_textures_preserves_texture_identity(self) -> None:
        script = r"""
import assert from "node:assert/strict";
import { cloneMaterialSharingTextures } from "./site/modules/glb-helpers.js";

let texCloneCount = 0;
const fakeAlbedoTex = { id: "tex_albedo", clone() { texCloneCount += 1; return { id: "dup" }; } };
const fakeBumpTex = { id: "tex_bump", clone() { texCloneCount += 1; return { id: "dup2" }; } };
const fakeSrcMat = {
  albedoTexture: fakeAlbedoTex,
  bumpTexture: fakeBumpTex,
  roughness: 0.5,
  clone(name) {
    if (this.albedoTexture) this.albedoTexture.clone();
    if (this.bumpTexture) this.bumpTexture.clone();
    return { name, albedoTexture: null, bumpTexture: null, roughness: this.roughness };
  },
};

const cloned = cloneMaterialSharingTextures(fakeSrcMat, "SharedClone");
assert.equal(texCloneCount, 0, "Textures must not be re-cloned during material clone");
assert.equal(fakeSrcMat.albedoTexture, fakeAlbedoTex);
assert.equal(cloned.albedoTexture, fakeAlbedoTex);
assert.equal(cloned.bumpTexture, fakeBumpTex);
console.log("CLONE_MAT_SHARED_TEX_OK");
"""
        proc = self._run_node_with_real_module(script)
        self.assertEqual(proc.returncode, 0, f"Material texture sharing check failed:\n{proc.stderr}")
        self.assertIn("CLONE_MAT_SHARED_TEX_OK", proc.stdout)


if __name__ == "__main__":
    unittest.main()
