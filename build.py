#!/usr/bin/env python3
"""Generate the flowers and build a portable, self-hosted Pages artifact."""

from __future__ import annotations

import argparse
import os
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

from thumbnails import generate_thumbnails

ROOT = Path(__file__).resolve().parent


def build(output: Path) -> Path:
    output = output.resolve()
    source = ROOT / "site"
    if output == ROOT or output == source or output in source.parents or source in output.parents:
        raise ValueError("Output must be separate from source and project directories")
    gift = json.loads((source / "gift.json").read_text(encoding="utf-8"))
    for key in ("recipient", "salutation", "signature"):
        if not isinstance(gift.get(key), str) or not gift[key].strip():
            raise ValueError(f"gift.json: {key} must be a non-empty string")
    if not isinstance(gift.get("letter"), list) or not gift["letter"] or not all(isinstance(p, str) for p in gift["letter"]):
        raise ValueError("gift.json: letter must contain text paragraphs")
    # Decision: .agents/notes/implemented/three-gallery/2026-10-25-three-scene-and-floral-richness.md
    # Fail before expensive generation if the pinned renderer bundle is incomplete.
    vendor = source / 'vendor' / 'three-0.186.1'
    metadata = json.loads((vendor / 'metadata.json').read_text(encoding='utf-8'))
    if metadata.get('name') != 'three' or metadata.get('version') != '0.186.1':
        raise ValueError('Unexpected Three.js vendor version')
    for name in ('three.module.js', 'three.core.js', 'LICENSE'):
        record = metadata.get('files', {}).get(name, {})
        path = vendor / name
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != record.get('sha256'):
            raise ValueError(f'Three.js vendor integrity failed: {name}')
    subprocess.run([sys.executable, str(ROOT / "garden_generator.py"), "--output", str(source / "assets")], check=True)
    # Merge only our artifact names; never recursively delete an operator path.
    shutil.copytree(source, output, dirs_exist_ok=True)
    # Keep the adapted petal code's notices with both source and the Pages artifact.
    shutil.copy2(ROOT / "THIRD_PARTY_NOTICES.md", output / "THIRD_PARTY_NOTICES.md")
    generate_thumbnails(output / "assets")
    (output / ".nojekyll").touch()
    manifest = output / 'assets' / 'manifest.json'
    release = {'schema': 1, 'style': 'natural-garden-v1', 'assetVersion': 7,
               'revision': os.environ.get('BLOOM_BUILD_REVISION', 'local'),
               'manifestSha256': hashlib.sha256(manifest.read_bytes()).hexdigest()}
    (output / 'release.json').write_text(json.dumps(release, indent=2) + '\n', encoding='utf-8')
    print(f"Built gallery: {output}")
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    args = parser.parse_args()
    build(args.output)


if __name__ == "__main__":
    main()
