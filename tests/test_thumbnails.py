"""PNG structure and projection contracts for the standard-library rasterizer."""
from pathlib import Path
import json
import struct
import sys
import tempfile
import unittest
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import thumbnails


class ThumbnailTests(unittest.TestCase):
    def test_png_signature_chunks_and_transparent_canvas(self):
        png = thumbnails.render_png(b'', 12, 14)
        self.assertEqual(png[:8], b'\x89PNG\r\n\x1a\n')
        offset, chunks = 8, {}
        while offset < len(png):
            length = struct.unpack_from('>I', png, offset)[0]
            kind = png[offset + 4:offset + 8]
            data = png[offset + 8:offset + 8 + length]
            crc = struct.unpack_from('>I', png, offset + 8 + length)[0]
            self.assertEqual(crc, zlib.crc32(kind + data))
            chunks[kind] = data
            offset += 12 + length
        self.assertEqual(struct.unpack('>IIBBBBB', chunks[b'IHDR']), (12, 14, 8, 6, 0, 0, 0))
        self.assertEqual(zlib.decompress(chunks[b'IDAT']), bytes(14 * (12 * 4 + 1)))

    def test_real_particles_change_pixels_and_are_deterministic(self):
        particle = struct.pack('<11f', 0, 0, .5, 1, .5, .7, 1.2, 2, 0, 0, 1)
        rendered = thumbnails.render_png(particle)
        self.assertNotEqual(rendered, thumbnails.render_png(b''))
        self.assertEqual(rendered, thumbnails.render_png(particle))
        with self.assertRaises(ValueError):
            thumbnails.render_png(b'bad')

    def test_continuous_surface_has_real_coverage_and_depth(self):
        def surface(z, color):
            vertices = [(-1, 0, z, *color, 0, 0, 1),
                        (1, 0, z, *color, 0, 0, 1), (0, 2, z, *color, 0, 0, 1)]
            return (struct.pack('<4sII', b'BFM1', 3, 3)
                    + b''.join(struct.pack('<9f', *vertex) for vertex in vertices)
                    + struct.pack('<III', 0, 1, 2))
        mesh = surface(.5, (1, .5, .6))
        rendered = thumbnails.render_png(b'', 64, 72, surface=mesh)
        self.assertNotEqual(rendered, thumbnails.render_png(b'', 64, 72))
        self.assertEqual(rendered, thumbnails.render_png(b'', 64, 72, surface=mesh))
        behind = struct.pack('<11f', 0, 1, -1, 0, 0, 1, 1.2, 0, 0, 0, 1)
        self.assertEqual(rendered, thumbnails.render_png(behind, 64, 72, surface=mesh))
        for invalid in (b'bad', mesh[:-4], b'WRNG' + mesh[4:]):
            with self.assertRaises(ValueError):
                thumbnails.render_png(b'', surface=invalid)

    def test_surface_depth_is_independent_of_triangle_order(self):
        positions = ((-1, 0), (1, 0), (0, 2))
        vertices = [(x, y, z, *color, 0, 0, 1)
                    for z, color in ((.5, (1, .4, .5)), (-.5, (.3, .6, 1)))
                    for x, y in positions]
        body = struct.pack('<4sII', b'BFM1', 6, 6) + b''.join(
            struct.pack('<9f', *vertex) for vertex in vertices)
        near_then_far = body + struct.pack('<6I', 0, 1, 2, 3, 4, 5)
        far_then_near = body + struct.pack('<6I', 3, 4, 5, 0, 1, 2)
        self.assertEqual(thumbnails.render_png(b'', surface=near_then_far),
                         thumbnails.render_png(b'', surface=far_then_near))

    def test_surface_normals_change_directional_lighting(self):
        facing = struct.pack('<11f', 0, 0, 0, 1, .8, .7, 1, 0, 0, 0, 1)
        side = struct.pack('<11f', 0, 0, 0, 1, .8, .7, 1, 0, 1, 0, 0)
        self.assertNotEqual(thumbnails.render_png(facing), thumbnails.render_png(side))

    def test_manifest_assets_produce_small_named_previews(self):
        with tempfile.TemporaryDirectory() as directory:
            assets = Path(directory)
            (assets / 'rose.bin').write_bytes(struct.pack('<11f', 0, 1, 0, 1, .6, .8, 1, 0, 0, 0, 1))
            (assets / 'manifest.json').write_text(json.dumps({'bouquets':[{'id':'rose','file':'rose.bin'}]}))
            thumbnails.generate_thumbnails(assets)
            preview = assets / 'rose-thumb.png'
            self.assertTrue(preview.is_file())
            self.assertLess(preview.stat().st_size, 50_000)


if __name__ == '__main__':
    unittest.main()
