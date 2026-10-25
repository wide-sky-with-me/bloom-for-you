"""Production botanical facade contracts with a hermetic copied client graph."""
from __future__ import annotations
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
CLIENT_FILES = (
    "particles.js", "botanical-garden.js", "botanical-materials.js",
    "three-garden.js", "three-materials.js", "legacy-garden.js",
    "prepare-client.js", "prepare-data.js", "prepare-worker.js",
    "vendor/three-0.186.1/three.module.js", "vendor/three-0.186.1/three.core.js",
    "vendor/three-0.186.1/LICENSE", "vendor/three-0.186.1/metadata.json",
)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class BotanicalRendererContractTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "Node.js is needed for renderer contracts")
    def test_production_botanical_graph_and_lifecycle(self):
        # No dependency on live dist, ignored geometry, a CDN or npm install.
        # Count compatibility is exercised using deterministic 16k/120k CPU data;
        # this is not a claim about rendered pixels or fresh generated flower art.
        before = {name: digest(ROOT / "site" / name) for name in CLIENT_FILES}
        with tempfile.TemporaryDirectory(prefix="bloom-botanical-contract-") as directory:
            target = Path(directory)
            for name in CLIENT_FILES:
                destination = target / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / "site" / name, destination)
            env = dict(os.environ, BLOOM_BOTANICAL_SITE_URL=target.as_uri() + "/")
            result = subprocess.run(
                [shutil.which("node"), "--test", "tests/botanical_renderer.mjs"],
                cwd=ROOT, env=env, capture_output=True, text=True, timeout=60,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            print(result.stdout, end="")
            for name in CLIENT_FILES:
                self.assertEqual(digest(ROOT / "site" / name), before[name], f"source changed: {name}")
                self.assertEqual(digest(target / name), before[name], f"copied graph changed: {name}")


if __name__ == "__main__":
    unittest.main()
