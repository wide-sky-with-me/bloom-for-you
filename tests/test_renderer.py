"""Run renderer lifecycle contracts without a browser or a GPU."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import generator


class RendererContractTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "Node.js is needed for renderer contracts")
    def test_webgl_and_raf_contracts(self):
        # Generate hermetic binary fixtures: a clean checkout has no ignored assets.
        with tempfile.TemporaryDirectory(prefix="bloom-renderer-") as directory:
            assets = Path(directory)
            bouquets = [dict(item, growth=f"{item['id']}.growth") for item in generator.BOUQUETS]
            for bouquet in bouquets:
                geometry = generator._build_geometry(bouquet["id"])
                particles, poses = generator.generate_bouquet_with_growth(bouquet["id"])
                (assets / bouquet["file"]).write_bytes(generator.encode_particles(particles))
                (assets / bouquet["surface"]).write_bytes(generator.encode_mesh(geometry))
                (assets / bouquet["growth"]).write_bytes(generator.encode_growth(poses, geometry))
            (assets / "manifest.json").write_text(json.dumps({
                "version": 2, "count": generator.COUNT, "stride": generator.STRIDE,
                "bouquets": bouquets,
            }), encoding="utf-8")
            env = dict(os.environ, BLOOM_TEST_ASSETS_URL=assets.as_uri() + "/")
            # Exhaustive real-asset phase/orbit scans are CPU-heavy on hosted runners.
            # This is a liveness budget; every numerical assertion remains required.
            result = subprocess.run(
                [shutil.which("node"), "--test", "tests/renderer_contract.mjs"],
                cwd=ROOT, env=env, capture_output=True, text=True, timeout=120,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
