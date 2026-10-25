"""Pure preparation/worker lifecycle contracts, independent of generated assets."""
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


class PreparationTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'), 'Node.js is needed for preparation contracts')
    def test_prepare_contracts(self):
        result = subprocess.run([shutil.which('node'), '--test', 'tests/prepare_data.mjs'],
                                cwd=ROOT, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
