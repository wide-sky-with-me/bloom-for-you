"""Isolated natural-garden prototype CPU/lifecycle tests, without a browser or GPU."""
from __future__ import annotations
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
STUDY = ROOT / "studies" / "natural_garden" / "site"
ENGINE = ROOT / "site"
ENGINE_FILES = (
    "three-garden.js", "three-materials.js", "legacy-garden.js",
    "prepare-client.js", "prepare-data.js", "prepare-worker.js",
    "vendor/three-0.186.1/three.module.js", "vendor/three-0.186.1/three.core.js",
    "vendor/three-0.186.1/LICENSE", "vendor/three-0.186.1/metadata.json",
)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class NaturalGardenRendererTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "Node.js is needed for prototype renderer contracts")
    def test_standalone_copied_engine_and_lifecycle(self):
        # All copying is into an owned temporary directory, never site/dist or the
        # Lead's live study engine. No generated assets, npm install or GL needed.
        sources = {name: ENGINE / name for name in ENGINE_FILES}
        sources.update({"../study-garden.js": STUDY / "study-garden.js",
                        "../study-materials.js": STUDY / "study-materials.js"})
        before = {name: digest(path) for name, path in sources.items()}
        with tempfile.TemporaryDirectory(prefix="bloom-natural-renderer-") as directory:
            site = Path(directory) / "site"
            engine = site / "engine"
            for name, source in sources.items():
                target = engine / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
                self.assertEqual(digest(target), before[name], name)
            env = dict(os.environ, BLOOM_STUDY_SITE_URL=site.as_uri() + "/")
            result = subprocess.run(
                [shutil.which("node"), "--test", "tests/natural_garden_renderer.mjs"],
                cwd=ROOT, env=env, capture_output=True, text=True, timeout=60,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            print(result.stdout, end="")
            for name, source in sources.items():
                self.assertEqual(digest(source), before[name], f"source changed: {name}")
                self.assertEqual(digest(engine / name), before[name], f"copied engine/study changed: {name}")


if __name__ == "__main__":
    unittest.main()
