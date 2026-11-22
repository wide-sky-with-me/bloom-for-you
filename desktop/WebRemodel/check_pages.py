"""Release gate: a real, self-contained glTF and both archived editions must ship."""
import hashlib
import json
from pathlib import Path
import struct
import sys


def validate(directory):
    index = (directory / 'index.html').read_text(encoding='utf-8')
    if '花墅与水庭' not in index or '1.0.1' not in index:
        raise ValueError('Homepage is not the reviewed browser edition')
    for relative in ('flower-path/index.html', 'classic/index.html', 'credits.txt'):
        if (directory / relative).stat().st_size < 1024:
            raise ValueError(f'Missing or empty legacy edition / credits: {relative}')
    models = list(directory.rglob('*.glb'))
    if len(models) != 1:
        raise ValueError(f'Expected one self-contained island, found {models}')
    content = models[0].read_bytes()
    magic, version, size, json_size, chunk_type = struct.unpack_from('<4s3I4s', content)
    if (magic, version, size, chunk_type) != (b'glTF', 2, len(content), b'JSON'):
        raise ValueError('Invalid GLB v2 container')
    doc = json.loads(content[20:20+json_size]); nodes = doc['nodes']
    if not nodes or not doc['meshes'] or not doc['scenes']:
        raise ValueError('Empty island geometry')
    for prefix in ('M01', 'M02', 'M03', 'M04', 'M05', 'M06'):
        if not any(node.get('name', '').startswith(prefix) and 'mesh' in node for node in nodes):
            raise ValueError(f'Missing remodel mesh group: {prefix}')
    for prefix in ('M02', 'M04'):
        if not any(anim.get('name', '').startswith(prefix) and anim.get('channels') for anim in doc.get('animations', [])):
            raise ValueError(f'Missing swing or rotor animation: {prefix}')
    if any('uri' in obj and not obj['uri'].startswith('data:') for obj in [*doc['buffers'], *doc.get('images', [])]):
        raise ValueError('Unexpected external mesh / texture dependency')
    print('Verified browser island:', models[0].relative_to(directory), size, hashlib.sha256(content).hexdigest())


if __name__ == '__main__':
    validate(Path(sys.argv[1]))
