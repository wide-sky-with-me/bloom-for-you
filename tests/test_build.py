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


class RealisticCoastalEstateTests(unittest.TestCase):
    def test_build_produces_verified_release_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "dist"
            built = build.build(out)
            self.assertTrue((built / "index.html").is_file())
            self.assertTrue((built / ".nojekyll").is_file())
            self.assertTrue((built / "THIRD_PARTY_NOTICES.md").is_file())

            manifest = json.loads((built / "release.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["schema"], 6)
            self.assertEqual(manifest["style"], "realistic-coastal-villa-flower-estate-v3")
            self.assertEqual(manifest["worldSizeMeters"], 260)
            self.assertEqual(manifest["renderer"], "three-0.186.1")
            self.assertEqual(manifest["navigation"], "first-person-walk-inside-and-aerial-roam")
            for mod in (
                "modules/pbr-kit.js",
                "modules/exploration-controls.js",
                "modules/realistic-ocean-sky.js",
                "modules/harbor-and-estate.js",
                "modules/coastal-villa.js",
                "modules/botanical-flora.js",
            ):
                self.assertIn(mod, manifest["files"])

    def test_clean_exploration_markup_in_index_html(self) -> None:
        html = (SITE / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="diorama-canvas"', html)
        self.assertIn('id="explore-bar"', html)
        self.assertIn('id="letter-modal"', html)
        self.assertIn("hidden", html)
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
        self.assertGreaterEqual(checked, 9)

    def test_legacy_anime_and_scrub_files_removed(self) -> None:
        legacy_paths = (
            SITE / "diorama-stage.js",
            SITE / "scrub-world.js",
            SITE / "modules" / "toon-kit.js",
            SITE / "modules" / "fairytale-villa.js",
            SITE / "modules" / "flower-sea-world.js",
            SITE / "modules" / "sunshower-atmosphere.js",
            ROOT / "tools",
        )
        for p in legacy_paths:
            self.assertFalse(p.exists(), f"Obsolete file should be removed: {p}")

    def test_gift_letter_preserved_verbatim(self) -> None:
        gift = json.loads((SITE / "gift.json").read_text(encoding="utf-8"))
        self.assertEqual(gift["recipient"], "我最爱的老婆")
        self.assertEqual(gift["salutation"], "亲爱的老婆：")
        self.assertEqual(gift["signature"], "永远偏爱你的，老公")
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
        self.assertEqual(len(js_files), 8)
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
