"""Executable contracts for the standard-library bouquet asset generator."""

from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import random
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import xml.etree.ElementTree as ET

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import generator

IDS = ("rose", "tulip", "hydrangea", "wildflower")
SVG_NS = {"svg": "http://www.w3.org/2000/svg"}


class ParticleContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.particles = {key: generator.generate_bouquet(key) for key in IDS}
        cls.binaries = {key: generator.encode_particles(value)
                        for key, value in cls.particles.items()}

    def test_exact_equal_lengths_and_little_endian_layout(self) -> None:
        self.assertEqual(generator.COUNT, 52_000)
        self.assertEqual(generator.STRIDE, 8)
        for key in IDS:
            with self.subTest(bouquet=key):
                self.assertEqual(len(self.particles[key]), 52_000)
                self.assertEqual(len(self.binaries[key]), 52_000 * 8 * 4)
                decoded = struct.unpack_from("<8f", self.binaries[key])
                for actual, expected in zip(decoded, self.particles[key][0]):
                    self.assertAlmostEqual(actual, expected, places=5)
        known = [(1.0, -2.0, 0.25, 1.0, 0.5, 0.0, 1.5, math.pi)]
        self.assertEqual(generator.encode_particles(known)[:4], b"\x00\x00\x80\x3f")

    def test_every_float_is_finite_and_within_contract(self) -> None:
        bounds = ((-2.5, 2.5), (-2.7, 3.0), (-1.4, 1.4),
                  (0.0, 1.0), (0.0, 1.0), (0.0, 1.0),
                  (0.6 - 1e-6, 1.8 + 1e-6), (0.0, math.tau + 1e-6))
        for key in IDS:
            with self.subTest(bouquet=key):
                extrema = [[math.inf, -math.inf] for _ in range(8)]
                for record in struct.iter_unpack("<8f", self.binaries[key]):
                    for i, value in enumerate(record):
                        self.assertTrue(math.isfinite(value))
                        extrema[i][0] = min(extrema[i][0], value)
                        extrema[i][1] = max(extrema[i][1], value)
                for (minimum, maximum), (low, high) in zip(extrema, bounds):
                    self.assertGreaterEqual(minimum, low)
                    self.assertLessEqual(maximum, high)

    def test_full_size_generation_is_deterministic(self) -> None:
        for key in IDS:
            with self.subTest(bouquet=key):
                again = generator.encode_particles(generator.generate_bouquet(key))
                self.assertEqual(hashlib.sha256(again).digest(),
                                 hashlib.sha256(self.binaries[key]).digest())

    def test_bouquets_are_distinct_and_do_not_touch_global_random(self) -> None:
        self.assertEqual(len({hashlib.sha256(data).digest()
                              for data in self.binaries.values()}), 4)
        before = random.getstate()
        generator.generate_bouquet("rose", 113)
        self.assertEqual(random.getstate(), before)

    def test_shuffled_prefix_preserves_heads_stems_and_depth(self) -> None:
        for key, particles in self.particles.items():
            with self.subTest(bouquet=key):
                sample = particles[:2_000]
                self.assertGreater(sum(p[1] > 0.5 for p in sample), 900)
                self.assertGreater(sum(p[1] < -1.15 for p in sample), 100)
                self.assertGreater(max(p[2] for p in sample) - min(p[2] for p in sample), 0.8)
                self.assertLess(min(p[0] for p in sample), -1.3)
                self.assertGreater(max(p[0] for p in sample), 1.3)
                left_heads = sum(p[0] < -0.5 and p[1] > 0.5 for p in sample)
                right_heads = sum(p[0] > 0.5 and p[1] > 0.5 for p in sample)
                self.assertGreater(left_heads, 150)
                self.assertGreater(right_heads, 150)
                # A contiguous shape ordering would leave the prefix without a bow.
                self.assertTrue(any(-1.8 < p[1] < -1.1 and p[2] > 0.4 for p in sample))

    def test_geometry_is_petal_surfaces_not_random_volume(self) -> None:
        model = generator.Geometry()
        generator._rose(model, (0.0, 0.0, 0.0), 1.0, (0.9, 0.6, 0.7))
        self.assertEqual(len(model.sections["flowers"]), 46)
        petal = model.sections["flowers"][20]
        root, rim = petal.point(0.0, 0.5), petal.point(1.0, 0.5)
        self.assertGreater(math.hypot(*rim[:2]), math.hypot(*root[:2]) * 2)
        model = generator.Geometry()
        generator._tulip(model, (0.0, 0.0, 0.0), 1.0, (1.0, 0.8, 0.7))
        self.assertEqual(len(model.sections["flowers"]), 12)
        bottom = model.sections["flowers"][0].point(0.0, 0.5)
        lip = model.sections["flowers"][0].point(1.0, 0.5)
        self.assertGreater(lip[1] - bottom[1], 1.0)
        model = generator.Geometry()
        generator._floret(model, (0.0, 0.0, 0.0), (0.0, 0.0, 1.0),
                           1.0, (0.6, 0.6, 0.9))
        self.assertEqual(len(model.sections["flowers"]), 5)
        tips = [s.point(1.0, 0.5) for s in model.sections["flowers"][:4]]
        self.assertGreater(tips[0][0], 0.9)
        self.assertGreater(tips[1][1], 0.9)
        self.assertLess(tips[2][0], -0.9)
        self.assertLess(tips[3][1], -0.9)

    def test_small_budgets_and_bad_inputs(self) -> None:
        for key in IDS:
            for count in (1, 7, 113):
                with self.subTest(bouquet=key, count=count):
                    self.assertEqual(len(generator.generate_bouquet(key, count)), count)
        with self.assertRaises(ValueError):
            generator.generate_bouquet("unknown")
        for count in (0, -1):
            with self.assertRaises(ValueError):
                generator.generate_bouquet("rose", count)

    def test_svg_is_same_particle_projection_in_depth_order(self) -> None:
        for key in IDS:
            with self.subTest(bouquet=key):
                source = self.particles[key]
                svg = generator.render_svg(source, "<花束 & 投影>", '花瓣 "与你"')
                root = ET.fromstring(svg)
                circles = root.findall("svg:g/svg:circle", SVG_NS)
                self.assertEqual(len(circles), 26_000)
                self.assertEqual(root.find("svg:title", SVG_NS).text, "<花束 & 投影>")
                expected = sorted(source[::2], key=lambda p: p[2])
                for i in (0, 57, 5_000, 25_999):
                    circle, p = circles[i], expected[i]
                    self.assertAlmostEqual(float(circle.attrib["cx"]), p[0], delta=0.000051)
                    self.assertAlmostEqual(float(circle.attrib["cy"]), -p[1], delta=0.000051)
                    self.assertAlmostEqual(float(circle.attrib["r"]), p[6] * 0.012,
                                           delta=0.000051)
                    self.assertRegex(circle.attrib["fill"], r"^#[0-9a-f]{6}$")
                self.assertNotIn("<image", svg)
                self.assertNotIn("<script", svg)
                self.assertNotIn("href=", svg)

    def test_vector_underpainting_uses_the_actual_surface_projection(self) -> None:
        geometry = generator.Geometry()
        geometry.add("flowers", 1.0, lambda u, v: (u, v, u * 0.1),
                     (0.8, 0.5, 0.4), shade=False)
        particles = self.particles["rose"][:8]
        root = ET.fromstring(generator.render_svg(particles, "surface", "projection", geometry))
        paths = root.findall("svg:g/svg:path", SVG_NS)
        self.assertEqual(len(paths), 1)
        self.assertTrue(paths[0].attrib["d"].startswith("M0.0000,-0.0000L0.0833,-0.0000"))
        self.assertIn("L1.0000,-1.0000", paths[0].attrib["d"])
        self.assertEqual(paths[0].attrib["fill"], "url(#s1)")
        gradient = root.find("svg:g/svg:defs/svg:linearGradient", SVG_NS)
        self.assertEqual(gradient.attrib["x1"], "0.0000")
        self.assertEqual(gradient.attrib["x2"], "1.0000")
        self.assertEqual(gradient.find("svg:stop", SVG_NS).attrib["stop-color"], "#cc8066")
        self.assertEqual(len(root.findall("svg:g/svg:circle", SVG_NS)), 2)

    def test_manifest_and_asset_paths(self) -> None:
        # Geometry is already tested at full size above; reuse it for the writer test.
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "nested" / "assets"
            with mock.patch.object(generator, "generate_bouquet",
                                   side_effect=lambda key: self.particles[key]):
                result = generator.generate_assets(output)
            manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(result, manifest)
            self.assertEqual(set(manifest), {"version", "count", "stride", "bouquets"})
            self.assertEqual((manifest["version"], manifest["count"], manifest["stride"]),
                             (1, 52_000, 8))
            self.assertEqual(tuple(item["id"] for item in manifest["bouquets"]), IDS)
            self.assertEqual(len(list(output.iterdir())), 9)
            for item in manifest["bouquets"]:
                self.assertEqual(set(item), {"id", "file", "title", "subtitle",
                                             "description", "color"})
                filename = item["file"]
                self.assertEqual(filename, f'{item["id"]}.bin')
                self.assertEqual(Path(filename).name, filename)
                self.assertEqual((output / filename).read_bytes(), self.binaries[item["id"]])
                svg_path = output / f'{item["id"]}.svg'
                self.assertTrue(svg_path.is_file())
                svg = ET.parse(svg_path).getroot()
                self.assertGreater(len(svg.findall("svg:g/svg:path", SVG_NS)), 1_000)
                self.assertEqual(len(svg.findall("svg:g/svg:circle", SVG_NS)), 13_000)
                self.assertRegex(item["color"], r"^#[0-9a-fA-F]{6}$")
                self.assertTrue(all(item[field] for field in ("title", "subtitle", "description")))


class CommandLineTests(unittest.TestCase):
    def _run(self, cwd: Path, *args: str) -> subprocess.CompletedProcess:
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
        return subprocess.run([sys.executable, str(ROOT / "generator.py"), *args],
                              cwd=cwd, env=env, capture_output=True, text=True,
                              encoding="utf-8", timeout=90, check=True)

    def _check_output(self, output: Path) -> None:
        manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["count"], 52_000)
        self.assertEqual(tuple(item["id"] for item in manifest["bouquets"]), IDS)
        for key in IDS:
            self.assertEqual((output / f"{key}.bin").stat().st_size, 1_664_000)
            self.assertTrue((output / f"{key}.svg").is_file())

    def test_default_output_is_relative_to_current_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cwd = Path(directory)
            process = self._run(cwd)
            output = cwd / "site" / "assets"
            self._check_output(output)
            self.assertIn(str(output.resolve()), process.stdout)
            self.assertIn("52000", process.stdout)
            self.assertEqual(process.stderr, "")

    def test_custom_output_with_spaces_and_cli_determinism(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cwd = Path(directory)
            output = cwd / "a bouquet" / "assets"
            first = self._run(cwd, "--output", str(output))
            self._check_output(output)
            hashes = {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                      for path in output.iterdir()}
            second = self._run(cwd, "--output", str(output))
            self.assertEqual(hashes, {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                                      for path in output.iterdir()})
            self.assertEqual(first.stdout, second.stdout)
            self.assertIn(str(output.resolve()), second.stdout)
            self.assertFalse((cwd / "site").exists())

    def test_cli_help(self) -> None:
        process = self._run(ROOT, "--help")
        self.assertIn("--output PATH", process.stdout)
        self.assertIn("site/assets", process.stdout)


if __name__ == "__main__":
    unittest.main()
