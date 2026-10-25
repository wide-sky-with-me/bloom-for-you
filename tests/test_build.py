"""Static build contracts, without regenerating flower geometry in each test."""
from pathlib import Path
import hashlib
import json
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name) / 'project'
        self.source = self.root / 'site'
        self.source.mkdir(parents=True)
        self.gift = {'recipient': '老婆', 'salutation': '亲爱的：', 'signature': '老公', 'letter': ['春天见。']}
        (self.root / 'THIRD_PARTY_NOTICES.md').write_text('Fixture license notice', encoding='utf-8')
        self.write_gift()
        (self.source / 'index.html').write_text('<html lang="zh-CN"></html>', encoding='utf-8')
        self.vendor = self.source / 'vendor' / 'three-0.186.1'
        self.vendor.mkdir(parents=True)
        records = {}
        for name in ('three.module.js', 'three.core.js', 'LICENSE'):
            data = f'Fixture {name}'.encode()
            (self.vendor / name).write_bytes(data)
            records[name] = {'sha256': hashlib.sha256(data).hexdigest()}
        (self.vendor / 'metadata.json').write_text(json.dumps({'name': 'three', 'version': '0.186.1', 'files': records}))
        (self.source / 'assets').mkdir()
        (self.source / 'assets' / 'manifest.json').write_text(json.dumps({'version': 2, 'count': 120000, 'stride': 11}))
        for name in ('particles.js', 'botanical-garden.js', 'botanical-materials.js', 'three-garden.js', 'three-materials.js', 'legacy-garden.js', 'prepare-client.js', 'prepare-data.js', 'prepare-worker.js'):
            (self.source / name).write_text(f'// Fixture {name}')
        self.patch_root = patch.object(build, 'ROOT', self.root)
        self.patch_root.start()
        self.addCleanup(self.patch_root.stop)
        self.process = patch.object(build.subprocess, 'run')
        self.run = self.process.start()
        self.addCleanup(self.process.stop)
        self.thumbnail_patch = patch.object(build, 'generate_thumbnails')
        self.thumbnails = self.thumbnail_patch.start()
        self.addCleanup(self.thumbnail_patch.stop)

    def write_gift(self):
        (self.source / 'gift.json').write_text(json.dumps(self.gift), encoding='utf-8')

    def test_build_is_self_contained_and_preserves_unrelated_files(self):
        output = self.root / 'dist'
        output.mkdir()
        (output / 'keep.txt').write_text('operator file', encoding='utf-8')
        self.assertEqual(build.build(output), output)
        self.assertTrue((output / '.nojekyll').is_file())
        self.assertTrue((output / 'index.html').is_file())
        self.assertEqual((output / 'keep.txt').read_text(), 'operator file')
        self.assertEqual((output / 'THIRD_PARTY_NOTICES.md').read_text(), 'Fixture license notice')
        for name in ('three.module.js', 'three.core.js', 'LICENSE', 'metadata.json'):
            self.assertEqual((output / 'vendor' / 'three-0.186.1' / name).read_bytes(), (self.vendor / name).read_bytes())
        for name in ('particles.js', 'botanical-garden.js', 'botanical-materials.js', 'three-garden.js', 'three-materials.js', 'legacy-garden.js', 'prepare-client.js', 'prepare-data.js', 'prepare-worker.js'):
            self.assertEqual((output / name).read_bytes(), (self.source / name).read_bytes())
        self.run.assert_called_once_with([sys.executable, str(self.root / 'garden_generator.py'), '--output', str(self.source / 'assets')], check=True)
        release = json.loads((output / 'release.json').read_text())
        self.assertEqual(release['assetVersion'], 7)
        self.assertEqual(release['style'], 'natural-garden-v1')
        self.assertEqual(release['manifestSha256'], hashlib.sha256((self.source / 'assets' / 'manifest.json').read_bytes()).hexdigest())
        self.thumbnails.assert_called_once_with(output / 'assets')

    def test_tampered_three_bundle_stops_before_generation(self):
        (self.vendor / 'three.core.js').write_text('unexpected bytes')
        with self.assertRaisesRegex(ValueError, 'vendor integrity'):
            build.build(self.root / 'dist')
        self.run.assert_not_called()

    def test_source_and_ancestor_output_paths_are_rejected_before_generation(self):
        for output in [self.root, self.root.parent, self.source, self.source / 'nested']:
            with self.subTest(output=output), self.assertRaises(ValueError):
                build.build(output)
        self.run.assert_not_called()

    def test_gift_requires_nonempty_text(self):
        for field in ['recipient', 'salutation', 'signature']:
            with self.subTest(field=field):
                original = self.gift[field]
                self.gift[field] = ' '
                self.write_gift()
                with self.assertRaises(ValueError):
                    build.build(self.root / 'dist')
                self.gift[field] = original

    def test_letter_requires_a_nonempty_text_array(self):
        for value in [[], 'letter', [None], [17]]:
            with self.subTest(value=value):
                self.gift['letter'] = value
                self.write_gift()
                with self.assertRaises(ValueError):
                    build.build(self.root / 'dist')


if __name__ == '__main__':
    unittest.main()
