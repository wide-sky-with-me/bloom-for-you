#!/usr/bin/env python3
"""Build the '予你花开 · 写实海景花墅与漫山花海自由漫游世界' 3D PBR static Pages artifact."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent

REQUIRED_SITE_FILES = (
    "index.html",
    "style.css",
    "app.js",
    "audio.js",
    "gift.json",
    "modules/pbr-kit.js",
    "modules/exploration-controls.js",
    "modules/realistic-ocean-sky.js",
    "modules/harbor-and-estate.js",
    "modules/coastal-villa.js",
    "modules/botanical-flora.js",
    "assets/flower-song.woff2",
    "assets/FONT-LICENSE.txt",
    "assets/flower.svg",
    "vendor/three-0.186.1/three.module.js",
    "vendor/three-0.186.1/three.core.js",
    "vendor/three-0.186.1/addons/loaders/GLTFLoader.js",
    "vendor/three-0.186.1/addons/utils/BufferGeometryUtils.js",
    "vendor/three-0.186.1/addons/utils/SkeletonUtils.js",
    "vendor/three-0.186.1/LICENSE",
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_source(source: Path) -> dict:
    for rel in REQUIRED_SITE_FILES:
        target = source / rel
        if not target.is_file():
            raise FileNotFoundError(f"Missing required site asset: {rel}")

    gift = json.loads((source / "gift.json").read_text(encoding="utf-8"))
    for key in ("recipient", "salutation", "signature"):
        if not isinstance(gift.get(key), str) or not gift[key].strip():
            raise ValueError(f"gift.json: {key} must be a non-empty string")
    if (
        not isinstance(gift.get("letter"), list)
        or not gift["letter"]
        or not all(isinstance(p, str) and p.strip() for p in gift["letter"])
    ):
        raise ValueError("gift.json: letter must contain non-empty text paragraphs")

    three_dir = source / "vendor" / "three-0.186.1"
    three_meta = json.loads((three_dir / "metadata.json").read_text(encoding="utf-8"))
    if three_meta.get("name") != "three" or three_meta.get("version") != "0.186.1":
        raise ValueError("Unexpected Three.js vendor version")
    for name in (
        "three.module.js",
        "three.core.js",
        "LICENSE",
        "addons/loaders/GLTFLoader.js",
        "addons/utils/BufferGeometryUtils.js",
        "addons/utils/SkeletonUtils.js",
    ):
        record = three_meta.get("files", {}).get(name, {})
        path = three_dir / name
        if not path.is_file() or _sha256(path) != record.get("sha256"):
            raise ValueError(f"Three.js vendor integrity failed: {name}")

    module_files = sorted(p.name for p in (source / "modules").glob("*.js"))
    return {"modules": module_files}


def build(output: Path) -> Path:
    output = output.resolve()
    source = ROOT / "site"
    if output == ROOT or output == source or output in source.parents or source in output.parents:
        raise ValueError("Output must be separate from source and project directories")

    if output.exists():
        shutil.rmtree(output)

    summary = verify_source(source)
    shutil.copytree(source, output, dirs_exist_ok=True)
    shutil.copy2(ROOT / "THIRD_PARTY_NOTICES.md", output / "THIRD_PARTY_NOTICES.md")
    (output / ".nojekyll").touch()

    file_hashes = {}
    for file_path in sorted(output.rglob("*")):
        if file_path.is_file() and file_path.name != "release.json":
            rel = file_path.relative_to(output).as_posix()
            file_hashes[rel] = _sha256(file_path)

    release = {
        "schema": 6,
        "style": "realistic-coastal-villa-flower-estate-v3",
        "worldSizeMeters": 260,
        "renderer": "three-0.186.1",
        "navigation": "first-person-walk-inside-and-aerial-roam",
        "modules": summary["modules"],
        "revision": os.environ.get("BLOOM_BUILD_REVISION", "local"),
        "files": file_hashes,
    }
    (output / "release.json").write_text(
        json.dumps(release, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Built Realistic Coastal Villa & Flower Estate 3D World: {output}")
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    args = parser.parse_args()
    build(args.output)


if __name__ == "__main__":
    main()
