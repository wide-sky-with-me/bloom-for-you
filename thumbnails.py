"""Small self-hosted PNG projections, encoded with only Python's standard library."""
from __future__ import annotations

import json
import math
from pathlib import Path
import struct
import zlib


def _chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload))


def render_png(data: bytes, width: int = 128, height: int = 144) -> bytes:
    if len(data) % 32:
        raise ValueError('Particle records must contain eight Float32 values')
    pixels = [0.0] * (width * height * 4)
    scale = min(width / 5.3, height / 5.95)
    records = sorted(struct.iter_unpack('<8f', data), key=lambda p: p[2])
    for x, y, _z, r, g, b, size, _phase in records:
        cx, cy = width / 2 + x * scale, (y * -1 + 3.12) * scale
        radius = max(.6, size * .7)
        for py in range(max(0, int(cy - radius)), min(height, math.ceil(cy + radius))):
            for px in range(max(0, int(cx - radius)), min(width, math.ceil(cx + radius))):
                distance = ((px + .5 - cx) ** 2 + (py + .5 - cy) ** 2) / radius ** 2
                if distance > 1:
                    continue
                alpha = (1 - distance) * .8
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
        (assets / f'{name}-thumb.png').write_bytes(render_png((assets / item['file']).read_bytes()))
