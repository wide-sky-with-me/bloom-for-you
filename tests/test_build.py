"""Static build contracts, without regenerating flower geometry in each test."""
from pathlib import Path
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
        self.write_gift()
        (self.source / 'index.html').write_text('<html lang="zh-CN"></html>', encoding='utf-8')
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
        self.run.assert_called_once_with([sys.executable, str(self.root / 'generator.py'), '--output', str(self.source / 'assets')], check=True)
        self.thumbnails.assert_called_once_with(output / 'assets')

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
