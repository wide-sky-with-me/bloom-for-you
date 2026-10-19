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

IDS = ("rose", "tulip", "hydrangea", "wildflower", "peony", "lily", "sunflower", "calla")
SVG_NS = {"svg": "http://www.w3.org/2000/svg"}


class ParticleContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.particles = {key: generator.generate_bouquet(key) for key in IDS}
        cls.binaries = {key: generator.encode_particles(value)
                        for key, value in cls.particles.items()}

    def test_exact_equal_lengths_and_little_endian_layout(self) -> None:
        self.assertEqual(generator.COUNT, 120_000)
        self.assertEqual(generator.STRIDE, 11)
        self.assertEqual(generator.RECORD.format, "<11f")
        self.assertEqual(generator.RECORD.size, 44)
        for key in IDS:
            with self.subTest(bouquet=key):
                self.assertEqual(len(self.particles[key]), 120_000)
                self.assertEqual(len(self.binaries[key]), 120_000 * 11 * 4)
                decoded = struct.unpack_from("<11f", self.binaries[key])
                for actual, expected in zip(decoded, self.particles[key][0]):
                    self.assertAlmostEqual(actual, expected, places=5)
        known = [(1.0, -2.0, 0.25, 1.0, 0.5, 0.0, 1.5, math.pi, 0.0, 0.0, 1.0)]
        self.assertEqual(generator.encode_particles(known)[:4], b"\x00\x00\x80\x3f")

    def test_every_float_is_finite_and_within_contract(self) -> None:
        bounds = ((-2.5, 2.5), (-2.4, 3.2), (-2.5, 2.5),
                  (0.0, 1.0), (0.0, 1.0), (0.0, 1.0),
                  (0.6 - 1e-6, 1.8 + 1e-6), (0.0, math.tau + 1e-6),
                  (-1.000001, 1.000001), (-1.000001, 1.000001), (-1.000001, 1.000001))
        for key in IDS:
            with self.subTest(bouquet=key):
                extrema = [[math.inf, -math.inf] for _ in range(11)]
                for record in struct.iter_unpack("<11f", self.binaries[key]):
                    self.assertAlmostEqual(sum(c * c for c in record[8:11]), 1.0, delta=2e-6)
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
                              for data in self.binaries.values()}), 8)
        before = random.getstate()
        generator.generate_bouquet("rose", 113)
        self.assertEqual(random.getstate(), before)

    def test_shuffled_prefix_preserves_heads_stems_and_depth(self) -> None:
        for key, particles in self.particles.items():
            with self.subTest(bouquet=key):
                sample = particles[:2_000]
                self.assertGreater(sum(p[1] > 0.5 for p in sample), 900)
                self.assertGreater(sum(p[1] < -0.55 for p in sample), 100)
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

    def test_surface_normals_follow_true_derivatives_including_edges(self) -> None:
        surface = generator.Surface(1.0, lambda u, v: (u, v, 0.35 * u * u + 0.2 * math.sin(math.pi * v)),
                                    lambda u, v: (0.8, 0.6, 0.4))
        for u, v in ((0.0, 0.0), (0.25, 0.37), (0.7, 0.8), (1.0, 1.0)):
            actual = generator._surface_normal(surface, u, v)
            expected = generator._unit((-0.7 * u, -0.2 * math.pi * math.cos(math.pi * v), 1.0))
            self.assertGreater(sum(a * b for a, b in zip(actual, expected)), 0.999999)
        for point in (lambda u, v: (2.0, 3.0, 4.0), lambda u, v: (u, 0.0, 0.0)):
            collapsed = generator.Surface(1.0, point, lambda u, v: (1.0, 1.0, 1.0))
            self.assertEqual(generator._surface_normal(collapsed, 0.0, 0.0), (0.0, 0.0, 1.0))
            self.assertEqual(generator._surface_normal(collapsed, 1.0, 1.0), (0.0, 0.0, 1.0))

    def test_normals_transform_with_the_real_surface_and_leaf_backs_are_opposed(self) -> None:
        frame = generator._frame((0.0, 0.0, 0.0), (0.4, -0.3, 0.8), 2.0, 0.4)
        surface = generator.Surface(1.0, lambda u, v: frame((u, v, 0.0)),
                                    lambda u, v: (0.7, 0.5, 0.4))
        normal = generator._surface_normal(surface, 0.3, 0.8)
        expected = generator._unit((0.4, -0.3, 0.8))
        self.assertGreater(sum(a * b for a, b in zip(normal, expected)), 0.999999)
        model = generator.Geometry()
        generator._leaf(model, (-0.2, 0.0, 0.1), (0.7, 1.2, -0.3), 0.3, roll=0.6)
        front, back = model.sections["leaves"]
        for u, v in ((0.17, 0.3), (0.5, 0.75), (0.85, 0.1)):
            nf = generator._surface_normal(front, u, v)
            nb = generator._surface_normal(back, u, 1.0 - v)
            self.assertLess(sum(a * b for a, b in zip(nf, nb)), -0.999999)
            distance = math.dist(front.point(u, v), back.point(u, 1.0 - v))
            self.assertAlmostEqual(distance, 0.014, places=7)

    def test_particle_pigments_are_not_prebaked_directional_lighting(self) -> None:
        pigment = (0.83, 0.62, 0.48)
        for point in (lambda u, v: (u, v, 0.0), lambda u, v: (0.0, u, v)):
            surface = generator.Surface(1.0, point, lambda u, v: pigment)
            self.assertEqual(generator._surface_color(surface, 0.5, 0.5), pigment)
            self.assertNotEqual(generator._surface_color(surface, 0.5, 0.5, preview=True), pigment)

    def test_new_flower_silhouettes_have_distinct_construction_and_real_depth(self) -> None:
        surfaces = {}
        expected_counts = {"peony": 72, "lily": 19, "sunflower": 176, "calla": 2}
        for key in expected_counts:
            model = generator.Geometry()
            getattr(generator, "_" + key)(model, (0.0, 0.0, 0.0), 1.0, (0.96, 0.80, 0.72))
            surfaces[key] = model.sections["flowers"]
            self.assertEqual(len(surfaces[key]), expected_counts[key])
        peony = surfaces["peony"][-1]
        self.assertGreater(math.dist(peony.point(0.0, 0.5), peony.point(1.0, 0.5)), 0.8)
        self.assertGreater(max(peony.point(u / 20, 0.5)[2] for u in range(21))
                           - min(peony.point(u / 20, 0.5)[2] for u in range(21)), 0.5)
        lily = surfaces["lily"][0]
        self.assertGreater(lily.point(0.6, 0.5)[2] - lily.point(0.0, 0.5)[2], 0.6)
        self.assertLess(lily.point(1.0, 0.5)[2], lily.point(0.6, 0.5)[2] - 0.3)
        spathe = surfaces["calla"][0]
        rim = [spathe.point(1.0, j / 24) for j in range(25)]
        self.assertGreater(max(p[1] for p in rim) - min(p[1] for p in rim), 0.45)
        self.assertGreater(max(p[2] for p in rim) - min(p[2] for p in rim), 1.1)
        sunflower = surfaces["sunflower"]
        self.assertTrue(all(s.kind == "sheet" for s in sunflower))
        self.assertGreater(sunflower[48].point(0.0, 0.5)[2], sunflower[-1].point(0.0, 0.5)[2] + 0.15)
        rose = generator.Geometry()
        generator._rose(rose, (0.0, 0.0, 0.0), 1.0, (0.9, 0.6, 0.7))
        outer = rose.sections["flowers"][-2]
        self.assertGreater(outer.point(0.8, 0.5)[2] - outer.point(0.0, 0.5)[2], 0.4)

    def test_all_themes_are_mixed_filled_crowns_with_outward_heads_at_every_yaw(self) -> None:
        for key in IDS:
            with self.subTest(bouquet=key):
                heads = generator._arrange_heads(key)
                self.assertEqual(len(heads), 36)
                primary = "rose" if key == "wildflower" else key
                anchors = [head for head in heads if head.radius >= 0.65]
                self.assertEqual(len(anchors), 6)
                self.assertTrue(all(0.65 <= head.radius <= 0.72 for head in anchors))
                self.assertTrue(all(0.40 <= head.radius <=
                                    (0.58 if key in ("rose", "calla", "peony", "sunflower")
                                     and head.layer in ("middle", "top")
                                     and head.species in ("rose", "peony", "ranunculus", "dahlia", "lisianthus")
                                     else 0.52)
                                    for head in heads if head.radius < 0.65 and head.species != "cosmos"))
                self.assertTrue(all(0.25 <= head.radius <= 0.34 for head in heads if head.species == "cosmos"))
                if key in ("rose", "wildflower"):
                    low, high = (0.50, 0.58) if key == "rose" else (0.46, 0.52)
                    self.assertTrue(all(low <= head.radius <= high for head in heads
                                        if head.layer in ("middle", "top") and head.species != "cosmos"))
                if key in ("calla", "peony", "sunflower"):
                    self.assertTrue(all(0.50 <= head.radius <= 0.58 for head in heads
                                        if head.layer in ("middle", "top")
                                        and head.species in ("rose", "peony", "ranunculus", "dahlia", "lisianthus")))
                if key in ("rose", "calla"):
                    self.assertTrue(all(0.60 <= math.hypot(head.center[0], head.center[2]) <= 0.75
                                        for head in heads if head.layer == "top"))
                if key == "peony":
                    self.assertTrue(all(1.12 <= math.hypot(head.center[0], head.center[2]) <= 1.34
                                        for head in heads if head.layer == "middle"))
                if key == "wildflower":
                    self.assertEqual(sorted(h.species for h in anchors),
                                     ["dahlia", "dahlia", "ranunculus", "ranunculus", "rose", "rose"])
                for step in range(24):
                    angle = math.tau * step / 24
                    self.assertTrue(any(h.axis[0] * math.sin(angle) + h.axis[2] * math.cos(angle) > 0.6
                                        for h in anchors))
                self.assertGreaterEqual(len({head.species for head in heads}), 5)
                self.assertEqual(sum(head.layer == "inner" for head in heads), 5)
                self.assertEqual(sum(head.layer == "outer" for head in heads), 12)
                self.assertEqual(sum(head.layer == "middle" for head in heads), 12)
                self.assertEqual(sum(head.layer == "top" for head in heads), 7)
                self.assertTrue(all(math.hypot(h.center[0], h.center[2]) < 0.61
                                    for h in heads if h.layer == "inner"))
                self.assertGreaterEqual(sum(h.center[2] > 0.0 for h in heads), 12)
                self.assertGreaterEqual(sum(h.center[2] < 0.0 for h in heads), 12)
                for step in range(12):
                    angle = math.tau * step / 12
                    direction = (math.sin(angle), 0.0, math.cos(angle))
                    facing = [h for h in heads if sum(a * b for a, b in zip(h.axis, direction)) > 0.60]
                    self.assertGreaterEqual(len(facing), 5)
                    self.assertGreaterEqual(len({h.species for h in facing}), 2)
                    self.assertTrue(any(h.layer == "outer" for h in facing))
                    self.assertTrue(any(h.layer == "middle" for h in facing))
                for head in heads:
                    self.assertAlmostEqual(sum(n * n for n in head.axis), 1.0, places=7)
                    self.assertGreater(head.axis[1], 0.0)
                    self.assertGreater(head.axis[0] * head.center[0] + head.axis[2] * head.center[2], 0.0)

    def test_upper_crown_has_dense_area_and_front_back_thickness_in_all_projections(self) -> None:
        for key, particles in self.particles.items():
            with self.subTest(bouquet=key):
                flowers = [p for p in particles if 0.1 < p[1] < 2.95
                           and (p[3] > p[4] * 1.02 or p[5] > p[3] * 1.03)]
                self.assertGreater(len(flowers), 80_000)
                areas = []
                for step in range(12):
                    angle = math.tau * step / 12
                    c, s = math.cos(angle), math.sin(angle)
                    cells, depths = {}, []
                    for p in flowers:
                        horizontal, depth = p[0] * c - p[2] * s, p[0] * s + p[2] * c
                        cell = (math.floor(horizontal / 0.12), math.floor(p[1] / 0.12))
                        cells[cell] = cells.get(cell, 0) + 1
                        if abs(horizontal) < 0.7 and 0.45 < p[1] < 1.95:
                            depths.append(depth)
                    areas.append(sum(count >= 5 for count in cells.values()))
                    self.assertGreater(areas[-1], 400)
                    depths.sort()
                    self.assertGreater(len(depths), 12_000)
                    self.assertGreater(depths[len(depths) * 9 // 10] - depths[len(depths) // 10], 1.8)
                self.assertGreater(min(areas) / max(areas), 0.78)
                self.assertGreater(sum(p[1] > -0.2 for p in particles) / len(particles), 0.85)

    def test_new_companion_flower_types_keep_distinct_petal_structures(self) -> None:
        counts = {}
        for name in ("ranunculus", "dahlia", "lisianthus"):
            model = generator.Geometry()
            getattr(generator, "_" + name)(model, (0.0, 0.0, 0.0), 1.0,
                                           (0.98, 0.84, 0.70), normal=(0.0, 0.0, 1.0))
            counts[name] = len(model.sections["flowers"])
            points = [s.point(u, v) for s in model.sections["flowers"]
                      for u, v in ((0.1, 0.3), (0.6, 0.7), (1.0, 0.5))]
            self.assertGreater(max(p[2] for p in points) - min(p[2] for p in points), 0.4)
        self.assertEqual(counts, {"ranunculus": 98, "dahlia": 70, "lisianthus": 17})

    def test_growth_sampling_preserves_the_exact_open_particle_stream(self) -> None:
        for key in IDS:
            with self.subTest(bouquet=key):
                expected = generator.encode_particles(generator.generate_bouquet(key, 257))
                points, poses = generator.generate_bouquet_with_growth(key, 257)
                self.assertEqual(generator.encode_particles(points), expected)
                self.assertEqual(len(poses), len(points))

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
                self.assertEqual(len(circles), 60_000)
                self.assertEqual(root.find("svg:title", SVG_NS).text, "<花束 & 投影>")
                expected = sorted(source[::2], key=lambda p: p[2])
                for i in (0, 57, 5_000, 25_999, 59_999):
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

    def test_wildflower_keeps_original_cups_without_disabling_other_themes(self) -> None:
        with mock.patch.object(generator, "_cupped_surface", wraps=generator._cupped_surface) as cup:
            generator._build_geometry("wildflower")
            cup.assert_not_called()
            generator._build_geometry("rose")
            self.assertGreater(cup.call_count, 0)

    def test_wildflower_thin_sector_adjustment_preserves_heroes_and_other_heads(self) -> None:
        with mock.patch.object(generator, "replace", side_effect=lambda head, **kwargs: head):
            baseline = generator._arrange_heads("wildflower")
        actual = generator._arrange_heads("wildflower")
        self.assertEqual(len(actual), 36)
        self.assertEqual(sum(head.radius >= .65 for head in actual), 6)
        for index, (before, after) in enumerate(zip(baseline, actual)):
            if index != 11:
                self.assertEqual(after, before)
                continue
            self.assertEqual(after.species, "rose")
            self.assertEqual(after.center, before.center)
            self.assertEqual(after.radius, min(.52, before.radius * 1.15))
            self.assertLessEqual(after.radius, .52)
            c, s = math.cos(math.radians(-40)), math.sin(math.radians(-40))
            x, y, z = before.axis
            self.assertEqual(after.axis, (x * c - z * s, y, x * s + z * c))

    def test_calla_middle_spread_fills_sectors_without_enlarging_petals(self) -> None:
        heads = generator._arrange_heads("calla")
        middle = [head for head in heads if head.layer == "middle"]
        self.assertEqual(len(middle), 12)
        self.assertTrue(all(1.15 <= math.hypot(head.center[0], head.center[2]) <= 1.34 for head in middle))
        self.assertTrue(all(head.radius < .65 for head in middle))
        self.assertEqual(sum(head.radius >= .65 for head in heads), 6)
        self.assertTrue(all(head.layer == "outer" for head in heads if head.radius >= .65))

    def test_manifest_and_asset_paths(self) -> None:
        # Exercise the paired growth writer against the independently sampled open stream.
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "nested" / "assets"
            result = generator.generate_assets(output)
            manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(result, manifest)
            self.assertEqual(set(manifest), {"version", "count", "stride", "bouquets"})
            self.assertEqual((manifest["version"], manifest["count"], manifest["stride"]),
                             (2, 120_000, 11))
            self.assertEqual(tuple(item["id"] for item in manifest["bouquets"]), IDS)
            self.assertEqual({p.name for p in output.iterdir()}, {"manifest.json"} |
                             {f"{key}.{suffix}" for key in IDS for suffix in ("bin", "mesh", "svg", "growth")})
            for item in manifest["bouquets"]:
                self.assertEqual(set(item), {"id", "file", "surface", "title", "subtitle",
                                             "description", "color", "growth"})
                filename = item["file"]
                self.assertEqual(filename, f'{item["id"]}.bin')
                self.assertEqual(Path(filename).name, filename)
                self.assertEqual((output / filename).read_bytes(), self.binaries[item["id"]])
                self.assertEqual(item["surface"], f'{item["id"]}.mesh')
                self.assertEqual(item["growth"], f'{item["id"]}.growth')
                self.assertEqual(Path(item["growth"]).name, item["growth"])
                mesh = (output / item["surface"]).read_bytes()
                magic, vertices, indices = generator.MESH_HEADER.unpack_from(mesh)
                self.assertEqual(magic, b"BFM1")
                self.assertEqual(len(mesh), 12 + vertices * 36 + indices * 4)
                svg_path = output / f'{item["id"]}.svg'
                self.assertTrue(svg_path.is_file())
                svg = ET.parse(svg_path).getroot()
                self.assertGreater(len(svg.findall("svg:g/svg:path", SVG_NS)), 1_000)
                self.assertEqual(len(svg.findall("svg:g/svg:circle", SVG_NS)), 30_000)
                self.assertRegex(item["color"], r"^#[0-9a-fA-F]{6}$")
                self.assertTrue(all(item[field] for field in ("title", "subtitle", "description")))


class MeshContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.meshes = {key: generator.encode_mesh(generator._build_geometry(key)) for key in IDS}

    @staticmethod
    def _decode(data: bytes) -> tuple[list[tuple[float, ...]], tuple[int, ...]]:
        _, vertex_count, index_count = struct.unpack_from("<4sII", data)
        end = 12 + vertex_count * 36
        vertices = list(struct.iter_unpack("<9f", data[12:end]))
        indices = struct.unpack_from(f"<{index_count}I", data, end)
        return vertices, indices

    def test_bfm1_header_little_endian_layout_size_and_budget(self) -> None:
        self.assertEqual(generator.MESH_HEADER.format, "<4sII")
        self.assertEqual(generator.MESH_VERTEX.format, "<9f")
        self.assertEqual(generator.MESH_HEADER.size, 12)
        self.assertEqual(generator.MESH_VERTEX.size, 36)
        for key, data in self.meshes.items():
            with self.subTest(bouquet=key):
                magic, vertex_count, index_count = struct.unpack_from("<4sII", data)
                self.assertEqual(magic, b"BFM1")
                self.assertGreater(vertex_count, 10_000)
                self.assertGreater(index_count, 30_000)
                self.assertEqual(index_count % 3, 0)
                self.assertEqual(len(data), 12 + vertex_count * 36 + index_count * 4)
                self.assertLess(len(data), 3_000_000)

    def test_every_stored_vertex_and_triangle_is_finite_normalized_and_valid(self) -> None:
        for key, data in self.meshes.items():
            with self.subTest(bouquet=key):
                vertices, indices = self._decode(data)
                self.assertGreaterEqual(min(indices), 0)
                self.assertLess(max(indices), len(vertices))
                self.assertEqual(len(set(indices)), len(vertices))
                for vertex in vertices:
                    self.assertTrue(all(math.isfinite(value) for value in vertex))
                    self.assertTrue(all(0 <= value <= 1 for value in vertex[3:6]))
                    self.assertAlmostEqual(sum(value * value for value in vertex[6:9]), 1.0, delta=2e-6)
                for start in range(0, len(indices), 3):
                    p, q, r = (vertices[index][:3] for index in indices[start:start + 3])
                    cross = generator._cross(tuple(y - x for x, y in zip(p, q)),
                                             tuple(y - x for x, y in zip(p, r)))
                    self.assertGreater(sum(value * value for value in cross), 1e-18)

    def test_mesh_samples_exact_same_surface_pigments_and_normals_in_uv_order(self) -> None:
        model = generator.Geometry()
        point = lambda u, v: (u, v, 0.2 * u * u + 0.1 * math.sin(math.pi * v))
        pigment = lambda u, v: (0.2 + 0.4 * u, 0.3 + 0.2 * v, 0.6)
        model.add("flowers", 1.0, point, pigment, mesh_steps=(4, 3))
        vertices, indices = self._decode(generator.encode_mesh(model))
        self.assertEqual(len(vertices), 20)
        self.assertEqual(len(indices), 72)
        surface = model.sections["flowers"][0]
        for i in range(5):
            for j in range(4):
                u, v = i / 4, j / 3
                expected = (*point(u, v), *pigment(u, v), *generator._surface_normal(surface, u, v))
                for actual, value in zip(vertices[i * 4 + j], expected):
                    self.assertAlmostEqual(actual, value, delta=8e-8)
        self.assertEqual(indices[:6], (0, 4, 5, 0, 5, 1))

    def test_welding_preserves_color_and_normal_seams(self) -> None:
        model = generator.Geometry()
        point = lambda u, v: (u, v, 0.0)
        for pigment in ((0.8, 0.4, 0.3), (0.8, 0.4, 0.3), (0.3, 0.6, 0.8)):
            model.add("flowers", 1.0, point, pigment, mesh_steps=(2, 2))
        model.add("flowers", 1.0, lambda u, v: (u, 1.0 - v, 0.0),
                  (0.8, 0.4, 0.3), mesh_steps=(2, 2))
        vertices, indices = self._decode(generator.encode_mesh(model))
        self.assertEqual(len(vertices), 27)
        self.assertEqual(len(indices), 96)
        self.assertEqual(len(set(vertices)), len(vertices))
        self.assertEqual(len([v for v in vertices if v[:3] == (0.0, 0.0, 0.0)]), 3)
        self.assertEqual(indices[:24], indices[24:48])

    def test_real_rotated_petals_keep_exact_source_positions_pigments_and_normals(self) -> None:
        for species, surface_index in (("rose", 30), ("peony", 50), ("calla", 0),
                                       ("dahlia", 50), ("ranunculus", 90)):
            with self.subTest(species=species):
                model = generator.Geometry()
                head = generator.FlowerHead(species, (1.2, 0.8, -0.7),
                                            generator._unit((0.2, 0.5, 0.8)), 0.70, "outer")
                generator._add_head(model, head, (0.98, 0.84, 0.70), 0)
                surface = model.sections["flowers"][surface_index]
                self.assertEqual(surface.mesh_steps, (16, 20) if species == "calla" else (6, 4))
                source = generator.Geometry()
                source.sections["flowers"] = [surface]
                vertices, indices = self._decode(generator.encode_mesh(source))
                expected = []
                nu, nv = surface.mesh_steps
                for i in range(nu + 1):
                    for j in range(nv + 1):
                        u, v = i / nu, j / nv
                        values = (*surface.point(u, v), *generator._surface_color(surface, u, v),
                                  *generator._surface_normal(surface, u, v))
                        expected.append(struct.unpack("<9f", struct.pack("<9f", *values)))
                reference = []
                for i in range(nu):
                    for j in range(nv):
                        a = i * (nv + 1) + j
                        for triangle in ((a, a + nv + 1, a + nv + 2), (a, a + nv + 2, a + 1)):
                            p, q, r = (expected[index][:3] for index in triangle)
                            cross = generator._cross(tuple(y - x for x, y in zip(p, q)),
                                                     tuple(y - x for x, y in zip(p, r)))
                            if sum(value * value for value in cross) > 1e-18:
                                reference.extend(triangle)
                used, unique, remap, ordered = set(reference), {}, {}, []
                for index, vertex in enumerate(expected):
                    if index not in used:
                        continue
                    if vertex not in unique:
                        unique[vertex] = len(ordered)
                        ordered.append(vertex)
                    remap[index] = unique[vertex]
                self.assertEqual(vertices, ordered)
                self.assertEqual(indices, tuple(remap[index] for index in reference))

    def test_hero_petals_and_medium_broad_petals_keep_their_detail(self) -> None:
        counts = {"rose": 45, "peony": 72, "dahlia": 70, "ranunculus": 98, "sunflower": 48}
        for key in IDS:
            for index, head in enumerate(generator._arrange_heads(key)):
                if head.radius < 0.65 or head.species not in counts:
                    continue
                with self.subTest(bouquet=key, species=head.species, head=index):
                    model = generator.Geometry()
                    generator._add_head(model, head, (0.98, 0.84, 0.70), index)
                    petals = model.sections["flowers"][:counts[head.species]]
                    self.assertTrue(all(surface.mesh_steps == (6, 4) for surface in petals))
        for species, micro, count in (("rose", 12, 45), ("peony", 16, 72), ("dahlia", 19, 70)):
            model = generator.Geometry()
            head = generator.FlowerHead(species, (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), 0.52, "middle")
            generator._add_head(model, head, (0.98, 0.84, 0.70), 0)
            self.assertTrue(all(surface.mesh_steps == (5, 3)
                                for surface in model.sections["flowers"][micro:count]))
        for radius, steps in ((0.70, (16, 20)), (0.52, (12, 16))):
            model = generator.Geometry()
            head = generator.FlowerHead("calla", (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), radius, "outer")
            generator._add_head(model, head, (0.98, 0.84, 0.70), 0)
            self.assertEqual(model.sections["flowers"][0].mesh_steps, steps)
        for radius, steps in ((0.70, (3, 2)), (0.65, (3, 2)), (0.52, (2, 2))):
            model = generator.Geometry()
            head = generator.FlowerHead("hydrangea", (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), radius, "outer")
            generator._add_head(model, head, (0.65, 0.76, 0.90), 0)
            self.assertTrue(all(surface.mesh_steps == ((1, 4) if i % 5 == 4 else steps)
                                for i, surface in enumerate(model.sections["flowers"])))

    def test_narrow_micro_petals_keep_sampled_triangle_deviation_below_two_percent(self) -> None:
        model = generator.Geometry()
        head = generator.FlowerHead("ranunculus", (0.0, 0.0, 0.0),
                                    generator._unit((0.3, 0.5, 0.8)), 0.52, "middle")
        generator._add_head(model, head, (0.98, 0.84, 0.70), 0)
        for surface in model.sections["flowers"]:
            nu, nv = surface.mesh_steps
            for i in range(1, 24):
                for j in range(1, 16):
                    u, v = i / 24, j / 16
                    iu, iv = min(int(u * nu), nu - 1), min(int(v * nv), nv - 1)
                    fu, fv = u * nu - iu, v * nv - iv
                    a, b, c, d = (surface.point(x / nu, y / nv) for x, y in
                                  ((iu, iv), (iu + 1, iv), (iu + 1, iv + 1), (iu, iv + 1)))
                    weights = (((a, 1 - fu), (b, fu - fv), (c, fv)) if fu >= fv
                               else ((a, 1 - fv), (c, fu), (d, fv - fu)))
                    actual = tuple(sum(p[k] * weight for p, weight in weights) for k in range(3))
                    self.assertLess(math.dist(actual, surface.point(u, v)), 0.02 * (2 * head.radius))

    def test_secondary_detail_savings_do_not_flatten_curved_stems_or_leaf_fronts(self) -> None:
        model = generator.Geometry()
        generator._tube(model, "stems", lambda t: (t, 0.0, 0.0), 0.003, (0.3, 0.5, 0.3), 0.01)
        curve = generator._bezier((0.0, 0.0, 0.0), (0.0, 1.0, 0.0),
                                   (1.0, 1.0, 0.0), (1.0, 0.0, 0.0))
        generator._tube(model, "stems", curve, 0.003, (0.3, 0.5, 0.3), 0.01)
        generator._tube(model, "stems", lambda t: (t, 0.0, 0.0), 0.016, (0.3, 0.5, 0.3), 0.30)
        self.assertEqual(model.sections["stems"][0].mesh_steps, (1, 4))
        self.assertIsNone(model.sections["stems"][1].mesh_steps)
        self.assertIsNone(model.sections["stems"][2].mesh_steps)
        generator._leaf(model, (0.0, 0.0, 0.0), (0.3, 0.5, 0.0), 0.12)
        front, back = model.sections["leaves"]
        self.assertEqual(front.mesh_steps, (3, 2))
        self.assertEqual(back.mesh_steps, (2, 2))

    def test_poles_drop_degenerate_triangles_and_meshes_are_deterministic(self) -> None:
        model = generator.Geometry()
        generator._berry(model, (0.0, 0.0, 0.0), 0.1, (0.8, 0.4, 0.3))
        vertices, indices = self._decode(generator.encode_mesh(model))
        self.assertEqual(len(vertices), 54)
        self.assertEqual(len(indices), 240)
        for key, data in self.meshes.items():
            with self.subTest(bouquet=key):
                again = generator.encode_mesh(generator._build_geometry(key))
                self.assertEqual(hashlib.sha256(data).digest(), hashlib.sha256(again).digest())


class CommandLineTests(unittest.TestCase):
    def _run(self, cwd: Path, *args: str) -> subprocess.CompletedProcess:
        # Full eight-theme growth generation exceeds 90s on hosted CPUs.
        # Bound a hung subprocess, not the machine-dependent generation speed.
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
        return subprocess.run([sys.executable, str(ROOT / "generator.py"), *args],
                              cwd=cwd, env=env, capture_output=True, text=True,
                              encoding="utf-8", timeout=180, check=True)

    def _check_output(self, output: Path) -> None:
        manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["count"], 120_000)
        self.assertEqual(tuple(item["id"] for item in manifest["bouquets"]), IDS)
        for key in IDS:
            self.assertEqual((output / f"{key}.bin").stat().st_size, 5_280_000)
            self.assertTrue((output / f"{key}.svg").is_file())
            self.assertTrue((output / f"{key}.mesh").is_file())
            data = (output / f"{key}.growth").read_bytes()
            mesh = (output / f"{key}.mesh").read_bytes()
            _, vertices, _ = struct.unpack_from("<4sII", mesh)
            self.assertEqual(struct.unpack_from("<4sII", data), (b"BFG1", 120_000, vertices))
            self.assertEqual(len(data), 12 + (120_000 + vertices) * 14)
            self.assertLessEqual(len(data), 3_000_000)
        self.assertTrue(all(item["growth"] == f'{item["id"]}.growth' for item in manifest["bouquets"]))

    def test_default_output_is_relative_to_current_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cwd = Path(directory)
            process = self._run(cwd)
            output = cwd / "site" / "assets"
            self._check_output(output)
            self.assertIn(str(output.resolve()), process.stdout)
            self.assertIn("120000", process.stdout)
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


class GrowthContractTests(unittest.TestCase):
    def test_optional_growth_can_be_omitted_without_changing_legacy_files(self) -> None:
        model = generator.Geometry()
        model.add("flowers", 1., lambda u, v: (u, v, 0.), (.9, .6, .7), mesh_steps=(1, 1))
        point = (0., 0., 0., .9, .6, .7, 1., 0., 0., 0., 1.)
        with tempfile.TemporaryDirectory() as directory, \
                mock.patch.object(generator, "BOUQUETS", (generator.BOUQUETS[0],)), \
                mock.patch.object(generator, "generate_bouquet", return_value=[point]), \
                mock.patch.object(generator, "_build_geometry", return_value=model), \
                mock.patch.object(generator, "generate_bouquet_with_growth", side_effect=AssertionError("optional sampler called")):
            output = Path(directory)
            manifest = generator.generate_assets(output, include_growth=False)
            self.assertNotIn("growth", manifest["bouquets"][0])
            self.assertFalse((output / "rose.growth").exists())
            self.assertEqual((output / "rose.bin").read_bytes(), generator.encode_particles([point]))
            self.assertEqual((output / "rose.mesh").read_bytes(), generator.encode_mesh(model))

    def test_mesh_pose_collection_is_byte_identical_without_a_second_tessellation(self) -> None:
        model = generator.Geometry()
        model.add("flowers", 1., lambda u, v: (u, v, 0.), (.9, .6, .7), mesh_steps=(2, 2),
                  closed_point=lambda u, v: (u, v, .2 * u), growth_delay=.3)
        poses = []
        generator.encode_mesh(model, growth=poses)
        expected = generator.encode_growth([], model)
        with mock.patch.object(generator, "_tessellate_geometry", side_effect=AssertionError("duplicate tessellation")):
            self.assertEqual(generator.encode_growth([], model, mesh_poses=poses), expected)

    def test_record_layout_rounding_range_and_header(self) -> None:
        self.assertEqual(generator.GROWTH_HEADER.format, "<4sII")
        self.assertEqual(generator.GROWTH_RECORD.format, "<hhhhhhH")
        self.assertEqual(generator.GROWTH_RECORD.size, 14)
        pose = (1.25, -2.5, .125, 0., 0., 1., .5)
        self.assertEqual(generator._quantized_growth(pose), (5120, -10240, 512, 0, 0, 32767, 32768))
        with self.assertRaises(ValueError):
            generator._quantized_growth((8., 0., 0., 0., 0., 1., 0.))
        model = generator.Geometry()
        model.add("flowers", 1., lambda u, v: (u, v, 0.), (.9, .5, .6), mesh_steps=(1, 1))
        data = generator.encode_growth([pose], model)
        self.assertEqual(struct.unpack_from("<4sII", data), (b"BFG1", 1, 4))
        self.assertEqual(len(data), 12 + 5 * 14)
        self.assertEqual(struct.unpack_from("<hhhhhhH", data, 12), generator._quantized_growth(pose))

    def test_two_dimensional_strata_cover_each_cell_once(self) -> None:
        samples = list(generator._stratified_uv(100, random.Random(17)))
        self.assertEqual(len(samples), 100)
        self.assertEqual({(int(u * 10), int(v * 10)) for u, v in samples},
                         {(i, j) for i in range(10) for j in range(10)})
        self.assertEqual(len(list(generator._stratified_uv(113, random.Random(17)))), 113)
        self.assertEqual(list(generator._stratified_uv(0, random.Random(17))), [])

    def test_particle_growth_stays_paired_after_shuffle_and_nonflowers_are_static(self) -> None:
        model = generator.Geometry()
        for index, section in enumerate(model.sections):
            model.add(section, 1., lambda u, v, k=index: (u, v, float(k)), (.9, .6, .7),
                      closed_point=(lambda u, v: (u, v, .2 * u * u + .15 * v)) if index == 0 else None,
                      growth_delay=.4 if index == 0 else 0.)
        with mock.patch.object(generator, "_build_geometry", return_value=model):
            points, poses = generator.generate_bouquet_with_growth("rose", 257)
            self.assertEqual(points, generator.generate_bouquet("rose", 257))
        data = generator.encode_growth(poses, model)
        records = list(struct.iter_unpack("<hhhhhhH", data[12:12 + len(points) * 14]))
        self.assertEqual(len(records), len(points))
        self.assertGreater(sum(p[2] == 0 for p in points), 215)
        self.assertTrue(any(p[2] != 0 for p in points[:20]))
        for point, pose, record in zip(points, poses, records):
            u, v, tag = point[:3]
            if tag == 0:
                expected = generator._unit((-.4 * u, -.15, 1.))
                self.assertLess(math.dist(pose[:3], (u, v, .2 * u * u + .15 * v)), 1e-12)
                self.assertGreater(sum(a * b for a, b in zip(pose[3:6], expected)), .999999)
                self.assertEqual(record[6], round(.4 * 65535))
            else:
                opened = struct.unpack("<11f", struct.pack("<11f", *point))
                self.assertEqual(record, generator._quantized_growth((*opened[:3], *opened[8:11], 0.)))

    def test_closed_normals_are_the_actual_closed_surface_derivatives(self) -> None:
        surface = generator.Surface(1., lambda u, v: (u, v, 0.), lambda u, v: (.9, .6, .7),
                                    closed_point=lambda u, v: (u, v, .35 * u * u + .2 * v))
        for u, v in ((0., 0.), (.25, .6), (.8, .4), (1., 1.)):
            expected = generator._unit((-.7 * u, -.2, 1.))
            normal = generator._surface_normal(surface, u, v, closed=True)
            self.assertGreater(sum(a * b for a, b in zip(normal, expected)), .999999)
            self.assertNotEqual(normal, generator._surface_normal(surface, u, v))

    def test_growth_seams_split_welds_but_stationary_delays_do_not(self) -> None:
        point = lambda u, v: (u, v, 0.)
        model = generator.Geometry()
        for sign in (-1, 1):
            model.add("flowers", 1., point, (.9, .6, .7), mesh_steps=(2, 2),
                      closed_point=lambda u, v, s=sign: (u, v, s * .2 * u), growth_delay=.3)
        poses = []
        vertices, indices = generator._tessellate_geometry(model, growth=poses)
        self.assertEqual((len(vertices), len(indices), len(poses)), (18, 48, 18))
        self.assertEqual(len(set(vertices)), 9)
        self.assertEqual(len(set(zip(vertices, poses))), 18)
        stationary = generator.Geometry()
        for delay in (.2, .9):
            stationary.add("flowers", 1., point, (.9, .6, .7), mesh_steps=(2, 2),
                           closed_point=point, growth_delay=delay)
        poses = []
        vertices, indices = generator._tessellate_geometry(stationary, growth=poses)
        self.assertEqual((len(vertices), len(indices)), (9, 48))
        self.assertTrue(all(pose[6] == 0 for pose in poses))

    def test_real_buds_keep_roots_fixed_and_hydrangea_stays_local(self) -> None:
        for species in ("rose", "hydrangea", "calla"):
            model = generator.Geometry()
            head = generator.FlowerHead(species, (.2, 1., -.4), generator._unit((.3, .5, .8)), .70, "outer")
            generator._add_head(model, head, (.9, .6, .7), 0)
            roots, closed_tips = [], []
            for surface in model.sections["flowers"]:
                self.assertIsNotNone(surface.closed_point)
                for v in (0., .25, .5, .75, 1.):
                    self.assertEqual(surface.closed_point(0., v), surface.point(0., v))
                    self.assertEqual(generator._surface_normal(surface, 0., v, closed=True),
                                     generator._surface_normal(surface, 0., v))
                root, tip = surface.point(0., .5), surface.point(1., .5)
                closed = surface.closed_point(1., .5)
                self.assertLessEqual(math.dist(root, closed), 1.5 * math.dist(root, tip) + .005)
                roots.append(root); closed_tips.append(closed)
            self.assertGreater(len({surface.growth_delay for surface in model.sections["flowers"]}),
                               min(5, len(model.sections["flowers"]) - 1))
            if species == "hydrangea":
                for axis in range(3):
                    spread = max(p[axis] for p in roots) - min(p[axis] for p in roots)
                    self.assertGreater(max(p[axis] for p in closed_tips) - min(p[axis] for p in closed_tips), spread * .8)
            self.assertTrue(all(s.closed_point is None and s.growth_delay == 0 for s in model.sections["stems"]))

    def test_mesh_growth_order_and_quantization_match_every_welded_vertex(self) -> None:
        model = generator.Geometry()
        model.add("flowers", 1., lambda u, v: (u, v, 0.), (.9, .6, .7), mesh_steps=(3, 2),
                  closed_point=lambda u, v: (u, v, .25 * u * u), growth_delay=.37)
        mesh = generator.encode_mesh(model)
        _, count, _ = struct.unpack_from("<4sII", mesh)
        vertices = list(struct.iter_unpack("<9f", mesh[12:12 + count * 36]))
        growth = generator.encode_growth([], model)
        self.assertEqual(struct.unpack_from("<4sII", growth), (b"BFG1", 0, count))
        for vertex, record in zip(vertices, struct.iter_unpack("<hhhhhhH", growth[12:])):
            u, v = vertex[:2]
            normal = generator._unit((-.5 * u, 0., 1.))
            expected = (u, v, .25 * u * u, *normal, .37)
            for actual, value in zip(record[:6], generator._quantized_growth(expected)[:6]):
                self.assertLessEqual(abs(actual - value), 1)
            stationary = record[:6] == generator._quantized_growth((*vertex[:3], *vertex[6:9], 0.))[:6]
            self.assertEqual(record[6], 0 if stationary else round(.37 * 65535))

    def test_accent_palettes_follow_the_theme_instead_of_rainbow_branches(self) -> None:
        for key in IDS:
            model = generator.Geometry()
            generator._accent_sprigs(model, IDS.index(key))
            for surface in model.sections["flowers"]:
                if surface.mesh_steps == (1, 4):
                    continue
                color = surface.pigment(.6, .5)
                if max(color) - min(color) < .16:
                    continue
                if key in ("hydrangea", "calla"):
                    self.assertGreaterEqual(color[2], color[0])
                else:
                    self.assertGreaterEqual(color[0], color[2])


if __name__ == "__main__":
    unittest.main()
