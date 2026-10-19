"""Small self-hosted PNG projections, encoded with only Python's standard library."""
from __future__ import annotations

import json
import math
from pathlib import Path
import struct
import zlib


def _chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload))


def _shade(color: tuple[float, float, float], normal: tuple[float, float, float]) -> tuple[float, float, float]:
    nx, ny, nz = normal
    back = nz < 0
    if back:
        nx, ny, nz = -nx, -ny, -nz
    key = max(0.0, -.423 * nx + .553 * ny + .716 * nz)
    side = max(0.0, .898 * nx + .113 * ny - .425 * nz)
    rim = (1 - max(0.0, nz)) ** 3
    light = tuple(ambient + warm * key * .78 + cool * side * .32 + edge * rim * .18
                  for ambient, warm, cool, edge in zip(
                      (.26, .245, .27), (1.0, .86, .80), (.62, .76, 1.0), (.86, .65, .72)))
    return tuple(min(1.0, pigment * (value * (.91 if back else 1.0)) ** (1 / 2.2))
                 for pigment, value in zip(color, light))


def _paint_surface(data: bytes, pixels: list[float], width: int, height: int,
                   scale: float) -> list[float]:
    if len(data) < 12:
        raise ValueError('Invalid surface header')
    magic, vertex_count, index_count = struct.unpack_from('<4sII', data)
    index_offset = 12 + vertex_count * 36
    if (magic != b'BFM1' or vertex_count < 3 or index_count < 3 or index_count % 3
            or len(data) != index_offset + index_count * 4):
        raise ValueError('Invalid indexed surface')
    vertices = []
    for x, y, z, r, g, b, nx, ny, nz in struct.iter_unpack('<9f', memoryview(data)[12:index_offset]):
        vertices.append((width / 2 + x * scale, (3.12 - y) * scale, z,
                         *_shade((r, g, b), (nx, ny, nz))))
    depth = [-math.inf] * (width * height)
    for indices in struct.iter_unpack('<III', memoryview(data)[index_offset:]):
        if any(index >= vertex_count for index in indices):
            raise ValueError('Invalid surface index')
        a, b, c = (vertices[index] for index in indices)
        denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(denominator) < 1e-10:
            continue
        left = max(0, math.floor(min(a[0], b[0], c[0])))
        right = min(width, math.ceil(max(a[0], b[0], c[0])))
        top = max(0, math.floor(min(a[1], b[1], c[1])))
        bottom = min(height, math.ceil(max(a[1], b[1], c[1])))
        for py in range(top, bottom):
            for px in range(left, right):
                x, y = px + .5, py + .5
                wa = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / denominator
                wb = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / denominator
                wc = 1 - wa - wb
                if min(wa, wb, wc) < -1e-7:
                    continue
                z = wa * a[2] + wb * b[2] + wc * c[2]
                index = py * width + px
                if z <= depth[index]:
                    continue
                depth[index] = z
                for channel in range(3):
                    pixels[index * 4 + channel] = wa * a[channel + 3] + wb * b[channel + 3] + wc * c[channel + 3]
                pixels[index * 4 + 3] = 1.0
    return depth


def render_png(data: bytes, width: int = 128, height: int = 144,
               surface: bytes | None = None) -> bytes:
    if len(data) % 44:
        raise ValueError('Particle records must contain eleven Float32 values')
    pixels = [0.0] * (width * height * 4)
    scale = min(width / 5.3, height / 5.95)
    depth = _paint_surface(surface, pixels, width, height, scale) if surface is not None else None
    records = sorted(struct.iter_unpack('<11f', data), key=lambda p: p[2])
    for x, y, _z, r, g, b, size, _phase, nx, ny, nz in records:
        r, g, b = _shade((r, g, b), (nx, ny, nz))
        cx, cy = width / 2 + x * scale, (y * -1 + 3.12) * scale
        radius = max(.6, size * .7)
        for py in range(max(0, int(cy - radius)), min(height, math.ceil(cy + radius))):
            for px in range(max(0, int(cx - radius)), min(width, math.ceil(cx + radius))):
                distance = ((px + .5 - cx) ** 2 + (py + .5 - cy) ** 2) / radius ** 2
                if distance > 1:
                    continue
                if depth is not None and _z < depth[py * width + px] - .025:
                    continue
                alpha = (1 - distance) * (.20 if surface is not None else .8)
                i = (py * width + px) * 4
                for channel, color in enumerate((r, g, b)):
                    pixels[i + channel] = color * alpha + pixels[i + channel] * (1 - alpha)
                pixels[i + 3] = alpha + pixels[i + 3] * (1 - alpha)
    scanlines = bytearray()
    for row in range(height):
        scanlines.append(0)
        for column in range(width):
            i = (row * width + column) * 4
            alpha = pixels[i + 3]
            for value in pixels[i:i + 3]:
                scanlines.append(round(max(0, min(1, value / alpha if alpha else 0)) * 255))
            scanlines.append(round(alpha * 255))
    header = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + _chunk(b'IHDR', header) + _chunk(b'IDAT', zlib.compress(scanlines, 9)) + _chunk(b'IEND', b'')


def generate_thumbnails(assets: Path) -> None:
    manifest = json.loads((assets / 'manifest.json').read_text(encoding='utf-8'))
    for item in manifest['bouquets']:
        name = item['id']
        surface = (assets / item['surface']).read_bytes() if 'surface' in item else None
        (assets / f'{name}-thumb.png').write_bytes(
            render_png((assets / item['file']).read_bytes(), surface=surface))
