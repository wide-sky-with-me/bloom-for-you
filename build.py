#!/usr/bin/env python3
"""Build the Van Gogh Starry Night & Multi-Species Flower Meadow static Pages artifact."""

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
    "vangogh-sky.js",
    "flower-meadow.js",
    "botanical-assets.js",
    "fairytale-props.js",
    "audio.js",
    "gift.json",
    "assets/confessions.json",
    "assets/flower-song.woff2",
    "assets/FONT-LICENSE.txt",
    "assets/flower.svg",
    "assets/models/fairy_sprite.glb",
    "assets/models/storybook_cottage.glb",
    "assets/models/mushroom_cluster.glb",
    "assets/models/fairytale_landmarks.glb",
    "assets/models/botanical_blooms.glb",
    "vendor/three-0.186.1/three.module.js",
    "vendor/three-0.186.1/three.core.js",
    "vendor/three-0.186.1/addons/loaders/GLTFLoader.js",
    "vendor/three-0.186.1/addons/utils/BufferGeometryUtils.js",
    "vendor/three-0.186.1/addons/utils/SkeletonUtils.js",
    "vendor/three-0.186.1/LICENSE",
    "vendor/p5-1.9.4/p5.min.js",
    "vendor/p5-1.9.4/LICENSE",
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_source(source: Path) -> dict:
    for rel in REQUIRED_SITE_FILES:
        target = source / rel
        if not target.is_file():
            raise FileNotFoundError(f"Missing required site asset: {rel}")

    # Validate gift.json
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

    # Validate confessions.json
    confessions = json.loads((source / "assets" / "confessions.json").read_text(encoding="utf-8"))
    eggs = confessions.get("eggs")
    if not isinstance(eggs, list) or len(eggs) < 5:
        raise ValueError("confessions.json: must define at least 5 interactive Easter eggs")
    seen_ids = set()
    for egg in eggs:
        egg_id = egg.get("id")
        if not isinstance(egg_id, str) or not egg_id or egg_id in seen_ids:
            raise ValueError(f"confessions.json: invalid or duplicate egg id {egg_id!r}")
        seen_ids.add(egg_id)
        for field in ("title", "subtitle", "badge", "hint", "quote", "signature"):
            if not isinstance(egg.get(field), str) or not egg[field].strip():
                raise ValueError(f"confessions.json ({egg_id}): {field} must be non-empty string")
        paragraphs = egg.get("paragraphs")
        if not isinstance(paragraphs, list) or not paragraphs:
            raise ValueError(f"confessions.json ({egg_id}): paragraphs must be non-empty list")

    finale = confessions.get("finale")
    if not isinstance(finale, dict) or not isinstance(finale.get("title"), str):
        raise ValueError("confessions.json: finale object is required")

    # Validate Three.js 0.186.1 vendor bundle + GLTFLoader addons
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

    # Validate Blender 4.0 binary .glb 3D model packs
    for glb_rel in (
        "assets/models/fairy_sprite.glb",
        "assets/models/storybook_cottage.glb",
        "assets/models/mushroom_cluster.glb",
        "assets/models/fairytale_landmarks.glb",
        "assets/models/botanical_blooms.glb",
    ):
        glb_path = source / glb_rel
        header = glb_path.read_bytes()[:8]
        if len(header) < 8 or header[:4] != b"glTF":
            raise ValueError(f"Invalid glTF binary header in {glb_rel}")

    # Validate p5.js 1.9.4 vendor bundle
    p5_dir = source / "vendor" / "p5-1.9.4"
    p5_meta = json.loads((p5_dir / "metadata.json").read_text(encoding="utf-8"))
    if p5_meta.get("name") != "p5" or p5_meta.get("version") != "1.9.4":
        raise ValueError("Unexpected p5.js vendor version")
    p5_record = p5_meta.get("files", {}).get("p5.min.js", {})
    p5_path = p5_dir / "p5.min.js"
    if not p5_path.is_file() or _sha256(p5_path) != p5_record.get("sha256"):
        raise ValueError("p5.js vendor integrity failed: p5.min.js")

    return {"eggs": len(eggs)}


def build(output: Path) -> Path:
    output = output.resolve()
    source = ROOT / "site"
    if output == ROOT or output == source or output in source.parents or source in output.parents:
        raise ValueError("Output must be separate from source and project directories")

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
        "schema": 2,
        "style": "vangogh-starry-meadow-v1",
        "renderers": {
            "sky": "p5-1.9.4",
            "meadow": "three-0.186.1",
        },
        "species": [
            "hydrangea",
            "sunflower",
            "iris",
            "rose",
            "tulip",
            "gypsophila",
        ],
        "eggCount": summary["eggs"],
        "revision": os.environ.get("BLOOM_BUILD_REVISION", "local"),
        "files": file_hashes,
    }
    (output / "release.json").write_text(
        json.dumps(release, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Built Van Gogh Starry Night & Flower Meadow: {output}")
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    args = parser.parse_args()
    build(args.output)


if __name__ == "__main__":
    main()
