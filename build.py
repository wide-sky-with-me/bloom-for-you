#!/usr/bin/env python3
"""Build the '予你花开 · Bloom for You' 3D Clay Diorama Scroll World static Pages artifact."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct

ROOT = Path(__file__).resolve().parent

REQUIRED_SITE_FILES = (
    "index.html",
    "style.css",
    "app.js",
    "diorama-stage.js",
    "scrub-world.js",
    "audio.js",
    "gift.json",
    "assets/flower-song.woff2",
    "assets/FONT-LICENSE.txt",
    "assets/flower.svg",
    "assets/models/bloom_scroll_world.glb",
    "vendor/three-0.186.1/three.module.js",
    "vendor/three-0.186.1/three.core.js",
    "vendor/three-0.186.1/addons/loaders/GLTFLoader.js",
    "vendor/three-0.186.1/addons/utils/BufferGeometryUtils.js",
    "vendor/three-0.186.1/addons/utils/SkeletonUtils.js",
    "vendor/three-0.186.1/LICENSE",
)

REQUIRED_GLB_NODES = (
    "ScrollWorldRoot",
    "VillaBaseNode",
    "VillaRoofNode",
    "VillaFrontUpperNode",
    "HeroBouquetNode",
    "BouquetOrbitNode",
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _parse_glb_json(glb_path: Path) -> dict:
    data = glb_path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError(f"Invalid glTF binary header in {glb_path.name}")
    version, total_len = struct.unpack_from("<II", data, 4)
    if version != 2 or total_len != len(data):
        raise ValueError(f"Malformed glTF 2.0 container in {glb_path.name}")
    chunk_len, chunk_type = struct.unpack_from("<II", data, 12)
    if chunk_type != 0x4E4F534A:  # JSON
        raise ValueError(f"Missing glTF JSON chunk in {glb_path.name}")
    return json.loads(data[20 : 20 + chunk_len].decode("utf-8"))


def verify_source(source: Path) -> dict:
    for rel in REQUIRED_SITE_FILES:
        target = source / rel
        if not target.is_file():
            raise FileNotFoundError(f"Missing required site asset: {rel}")

    # Validate preserved gift.json love letter
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

    # Validate Cycles-baked 3D diorama world GLB & required hierarchy nodes
    glb_doc = _parse_glb_json(source / "assets" / "models" / "bloom_scroll_world.glb")
    node_names = {n.get("name") for n in glb_doc.get("nodes", [])}
    for req_node in REQUIRED_GLB_NODES:
        if req_node not in node_names:
            raise ValueError(f"bloom_scroll_world.glb missing required node: {req_node}")

    return {"glbNodes": len(glb_doc.get("nodes", [])), "glbMeshes": len(glb_doc.get("meshes", []))}


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
        "schema": 3,
        "style": "clay-diorama-scroll-world-v1",
        "renderer": "three-0.186.1",
        "sections": [
            "brook",
            "plaza",
            "villa",
            "living",
            "bedrooms",
            "bouquet",
        ],
        "glbNodes": summary["glbNodes"],
        "glbMeshes": summary["glbMeshes"],
        "revision": os.environ.get("BLOOM_BUILD_REVISION", "local"),
        "files": file_hashes,
    }
    (output / "release.json").write_text(
        json.dumps(release, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Built Bloom for You 3D Scroll World: {output}")
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    args = parser.parse_args()
    build(args.output)


if __name__ == "__main__":
    main()
