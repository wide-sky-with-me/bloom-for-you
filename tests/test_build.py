from __future__ import annotations

import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

import build

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
SINGLE_HTML = ROOT / "鸢尾湾·花与海之约.html"


class IrisBayCoastalEstateTests(unittest.TestCase):
    def test_build_produces_verified_release_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "dist"
            built = build.build(out)
            self.assertTrue((built / "index.html").is_file())
            self.assertTrue((built / ".nojekyll").is_file())
            self.assertTrue((built / "THIRD_PARTY_NOTICES.md").is_file())
            self.assertTrue((built / "assets" / "havok" / "HavokPhysics.wasm").is_file())

            manifest = json.loads((built / "release.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["schema"], 10)
            self.assertEqual(manifest["title"], "鸢尾湾·花与海之约")
            self.assertEqual(manifest["style"], "iris-bay-monet-garden-coastal-estate-babylon9")
            self.assertEqual(manifest["worldSizeMeters"], 260)
            self.assertEqual(manifest["renderer"], "babylon-9.36.0-havok-1.3.14")
            self.assertEqual(manifest["navigation"], "default-aerial-overlook-click-to-dive-and-walk-inside")
            for mod in (
                "world-spatial.js",
                "assets-loader.js",
                "ocean-sky-stage.js",
                "island-terrain-and-horizon.js",
                "flora-and-fx.js",
                "harbor-villa-world.js",
                "couple-rigged-controller.js",
                "couple-mode-babylon.js",
                "exploration-camera.js",
                "gift-config.js",
            ):
                self.assertIn(mod, manifest["modules"])

            for asset_rel in (
                "assets/havok/HavokPhysics.wasm",
                "assets/models/couple_xian.glb",
                "assets/models/couple_ran.glb",
                "assets/models/coastal_villa.glb",
                "assets/models/garden_monet_pond.glb",
                "assets/models/garden_swing_arches.glb",
                "assets/models/coastal_lighthouse.glb",
                "assets/models/hilltop_windmill.glb",
                "assets/models/creek_bridge.glb",
                "assets/models/cliffside_gazebo.glb",
                "assets/models/provencal_cottage.glb",
                "assets/models/harbor_fleet.glb",
                "assets/models/stylized_trees.glb",
                "assets/models/freshwater_shrimp.glb",
                "assets/models/ryukin_goldfish.glb",
                "assets/models/pond_koi.glb",
                "assets/models/waterlily.glb",
                "assets/models/rose_bush.glb",
                "assets/models/wisteria_cascade.glb",
                "assets/models/hero_rose.glb",
                "assets/models/ph_sofa.glb",
                "assets/models/ph_green_chair.glb",
                "assets/models/ph_armchair.glb",
                "assets/models/ph_chandelier.glb",
                "assets/models/ph_coffee_table.glb",
                "assets/models/ph_tea_set.glb",
                "assets/models/ph_bistro_set.glb",
                "assets/models/ph_cliff_01.glb",
                "assets/models/ph_cliff_02.glb",
                "assets/models/ph_coast_rocks.glb",
                "assets/models/ph_coast_rocks_b.glb",
                "assets/models/ph_moss_boulder.glb",
                "assets/models/ph_coastal_shrub.glb",
                "assets/models/ph_lifebuoy.glb",
                "assets/models/ph_picnic_table.glb",
            ):
                self.assertIn(asset_rel, manifest["files"])

    def test_npm_project_config_and_lockfile_present(self) -> None:
        self.assertTrue((ROOT / "package.json").is_file())
        self.assertTrue((ROOT / "package-lock.json").is_file())
        self.assertTrue((ROOT / "vite.config.js").is_file())
        pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        deps = pkg.get("dependencies", {})
        self.assertEqual(deps.get("@babylonjs/core"), "9.36.0")
        self.assertEqual(deps.get("@babylonjs/havok"), "1.3.14")
        self.assertEqual(deps.get("@babylonjs/loaders"), "9.36.0")
        self.assertEqual(deps.get("@babylonjs/materials"), "9.36.0")
        self.assertIn("dev", pkg.get("scripts", {}))
        self.assertIn("build", pkg.get("scripts", {}))

    def test_clean_minimalist_capsule_and_hidden_debug_hud(self) -> None:
        html = (SITE / "index.html").read_text(encoding="utf-8")
        self.assertIn("鸢尾湾·花与海之约", html)
        self.assertIn('id="diorama-canvas"', html)
        self.assertIn('id="explore-bar"', html)
        self.assertIn('id="btn-letter"', html)
        self.assertIn('id="btn-pause"', html)
        self.assertIn('id="btn-daynight"', html)
        self.assertIn('id="btn-reset"', html)
        self.assertIn('id="letter-modal"', html)
        self.assertIn('id="debug-hud"', html)
        self.assertRegex(html, r'<aside[^>]*id="debug-hud"[^>]*hidden')
        self.assertNotIn("importmap", html)
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
        self.assertGreaterEqual(checked, 10)

    def test_standalone_single_file_html_is_self_contained(self) -> None:
        self.assertTrue(SINGLE_HTML.is_file(), f"Missing standalone deliverable: {SINGLE_HTML}")
        self.assertGreater(SINGLE_HTML.stat().st_size, 5_000_000)
        text = SINGLE_HTML.read_text(encoding="utf-8")
        self.assertIn("window.__INLINE_GIFT_CONFIG__", text)
        self.assertIn("window.__INLINE_HAVOK_WASM_GZIP_B64__", text)
        self.assertIn("window.__INLINE_GLB_GZIP_B64__", text)
        for model_key in (
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
            "ph_coastal_shrub",
            "ph_lifebuoy",
            "ph_picnic_table",
        ):
            self.assertIn(f'"{model_key}":', text)
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
        self.assertEqual(len(js_files), 12)
        for js_path in js_files:
            proc = subprocess.run(
                [node, "--check", str(js_path)],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(proc.returncode, 0, f"Syntax error in {js_path.name}: {proc.stderr}")


if __name__ == "__main__":
    unittest.main()
