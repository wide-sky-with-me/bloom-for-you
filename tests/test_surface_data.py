"""Run the dependency-free browser surface decoder contracts in Node."""
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(shutil.which('node'), 'Node.js is optional for renderer tests')
class SurfaceDataTests(unittest.TestCase):
    def test_compact_surface_decoder_contracts(self):
        result = subprocess.run(
            ['node', 'tests/surface_data.mjs'], cwd=ROOT,
            capture_output=True, text=True, timeout=15,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('9 surface data contracts passed', result.stdout)


if __name__ == '__main__':
    unittest.main()
