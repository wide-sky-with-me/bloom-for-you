"""Release and architecture contract tests for Van Gogh Starry Night & Flower Meadow."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import tempfile
import unittest

import build

ROOT = Path(__file__).resolve().parent.parent


class TestStarryMeadowBuild(unittest.TestCase):
    def test_build_creates_complete_self_hosted_distribution(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp) / "dist"
            result = build.build(out_dir)
            self.assertEqual(result, out_dir.resolve())
            self.assertTrue((out_dir / ".nojekyll").is_file())
            self.assertTrue((out_dir / "THIRD_PARTY_NOTICES.md").is_file())
            self.assertTrue((out_dir / "release.json").is_file())

            for rel in build.REQUIRED_SITE_FILES:
                self.assertTrue((out_dir / rel).is_file(), f"Missing built file: {rel}")

            release = json.loads((out_dir / "release.json").read_text(encoding="utf-8"))
            self.assertEqual(release["style"], "vangogh-starry-meadow-v1")
            self.assertEqual(release["renderers"]["sky"], "p5-1.9.4")
            self.assertEqual(release["renderers"]["meadow"], "three-0.186.1")
            self.assertEqual(
                release["species"],
                ["hydrangea", "sunflower", "iris", "rose", "tulip", "gypsophila"],
            )
            self.assertEqual(release["eggCount"], 5)

    def test_index_html_has_zero_external_runtime_requests(self) -> None:
        html = (ROOT / "site" / "index.html").read_text(encoding="utf-8")
        self.assertIn("./vendor/p5-1.9.4/p5.min.js", html)
        self.assertIn("./vendor/three-0.186.1/three.module.js", html)
        self.assertNotIn("https://", html)
        self.assertNotIn("http://", html)

    def test_confessions_and_gift_preserve_love_messages(self) -> None:
        gift = json.loads((ROOT / "site" / "gift.json").read_text(encoding="utf-8"))
        self.assertIn("老婆", gift["recipient"])
        self.assertTrue(len(gift["letter"]) >= 3)

        confessions = json.loads(
            (ROOT / "site" / "assets" / "confessions.json").read_text(encoding="utf-8")
        )
        egg_ids = [egg["id"] for egg in confessions["eggs"]]
        self.assertEqual(
            egg_ids,
            [
                "egg-hydrangea",
                "egg-sunflower",
                "egg-rose-bottle",
                "egg-iris-tulip",
                "egg-starry-sky",
            ],
        )
        self.assertEqual(confessions["finale"]["id"], "finale-starry-bloom")
        wonders = confessions.get("wonders", [])
        self.assertEqual(len(wonders), 8)

    def test_javascript_modules_pass_node_syntax_check(self) -> None:
        for js_name in (
            "app.js",
            "vangogh-sky.js",
            "flower-meadow.js",
            "botanical-assets.js",
            "fairytale-props.js",
            "audio.js",
        ):
            js_path = ROOT / "site" / js_name
            proc = subprocess.run(
                ["node", "--check", str(js_path)],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(
                proc.returncode,
                0,
                f"Syntax check failed for {js_name}: {proc.stderr}",
            )

    def test_sculpted_blender_glb_models_have_valid_binary_headers(self) -> None:
        expected_models = (
            "fairy_sprite.glb",
            "storybook_cottage.glb",
            "mushroom_cluster.glb",
            "fairytale_landmarks.glb",
            "botanical_blooms.glb",
        )
        models_dir = ROOT / "site" / "assets" / "models"
        for name in expected_models:
            path = models_dir / name
            self.assertTrue(path.is_file(), f"Missing .glb model pack: {name}")
            raw = path.read_bytes()
            self.assertGreater(len(raw), 1024)
            self.assertEqual(raw[:4], b"glTF")


if __name__ == "__main__":
    unittest.main()
