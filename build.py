#!/usr/bin/env python3
"""Build the '鸢尾湾·花与海之约' Babylon 9.36 static Pages artifact."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent

REQUIRED_SITE_FILES = (
    "index.html",
    "style.css",
    "app.js",
    "audio.js",
    "gift.json",
    "modules/world-spatial.js",
    "modules/assets-loader.js",
    "modules/ocean-sky-stage.js",
    "modules/island-terrain-and-horizon.js",
    "modules/flora-and-fx.js",
    "modules/glb-helpers.js",
    "modules/world-villa.js",
    "modules/world-gardens-pond.js",
    "modules/world-harbor-estate.js",
    "modules/world-town-life.js",
    "modules/harbor-villa-world.js",
    "modules/couple-rigged-controller.js",
    "modules/couple-mode-babylon.js",
    "modules/genshin-toon-plugin.js",
    "modules/exploration-camera.js",
    "modules/gift-config.js",
    "assets/flower-song.woff2",
    "assets/FONT-LICENSE.txt",
    "assets/flower.svg",
    "assets/models/couple_xian.glb",
    "assets/models/couple_ran.glb",
    "assets/models/coastal_villa.glb",
    "assets/models/garden_monet_pond.glb",
    "assets/models/garden_swing_arches.glb",
    "assets/models/coastal_lighthouse.glb",
    "assets/models/hilltop_windmill.glb",
    "assets/models/creek_bridge.glb",
    "assets/models/cliffside_gazebo.glb",
    "assets/models/provencal_cottage.glb",
    "assets/models/harbor_fleet.glb",
    "assets/models/stylized_trees.glb",
    "assets/models/stylized_critters.glb",
    "assets/models/npc_vita.glb",
    "assets/models/npc_shino.glb",
    "assets/models/npc_vivi.glb",
    "assets/models/freshwater_shrimp.glb",
    "assets/models/ryukin_goldfish.glb",
    "assets/models/pond_koi.glb",
    "assets/models/waterlily.glb",
    "assets/models/rose_bush.glb",
    "assets/models/margarita_bush.glb",
    "assets/models/wisteria_cascade.glb",
    "assets/models/ph_fern.glb",
    "assets/models/ph_periwinkle.glb",
    "assets/models/hero_rose.glb",
    "assets/models/ph_sofa.glb",
    "assets/models/ph_green_chair.glb",
    "assets/models/ph_armchair.glb",
    "assets/models/ph_chandelier.glb",
    "assets/models/ph_ornate_mirror.glb",
    "assets/models/ph_console.glb",
    "assets/models/ph_nightstand.glb",
    "assets/models/ph_coffee_table.glb",
    "assets/models/ph_tea_set.glb",
    "assets/models/ph_mantel_clock.glb",
    "assets/models/ph_picture_frame.glb",
    "assets/models/ph_bistro_set.glb",
    "assets/models/ph_brass_pan.glb",
    "assets/models/ph_croissant.glb",
    "assets/models/ph_wicker_basket.glb",
    "assets/models/ph_watering_can.glb",
    "assets/models/ph_alarm_clock.glb",
    "assets/models/ph_oil_lamp.glb",
    "assets/models/ph_cliff_01.glb",
    "assets/models/ph_cliff_02.glb",
    "assets/models/ph_coast_rocks.glb",
    "assets/models/ph_coast_rocks_b.glb",
    "assets/models/ph_moss_boulder.glb",
    "assets/models/ph_lifebuoy.glb",
    "assets/models/ph_picnic_table.glb",
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

    module_files = sorted(p.name for p in (source / "modules").glob("*.js"))
    return {"modules": module_files}


def _latest_source_mtime(source: Path) -> float:
    latest = 0.0
    for p in source.rglob("*"):
        if p.is_file():
            latest = max(latest, p.stat().st_mtime)
    for cfg in (ROOT / "vite.config.js", ROOT / "package.json", ROOT / "THIRD_PARTY_NOTICES.md"):
        if cfg.is_file():
            latest = max(latest, cfg.stat().st_mtime)
    return latest


def _is_vite_dist_stale(vite_dist: Path, source: Path) -> bool:
    index_html = vite_dist / "index.html"
    if not index_html.is_file():
        return True
    return _latest_source_mtime(source) > index_html.stat().st_mtime


def _ensure_vite_dist(source: Path, *, force_rebuild: bool = False) -> Path:
    vite_dist = ROOT / "dist-vite"
    if force_rebuild or _is_vite_dist_stale(vite_dist, source):
        npm = shutil.which("npm")
        if not npm:
            raise FileNotFoundError("dist-vite is missing or stale and npm is not installed")
        subprocess.run([npm, "run", "build:web"], cwd=str(ROOT), check=True)
    return vite_dist


def build(output: Path, *, force_rebuild: bool = False) -> Path:
    output = output.resolve()
    source = ROOT / "site"
    if output == ROOT or output == source or output in source.parents or source in output.parents:
        raise ValueError("Output must be separate from source and project directories")

    if output.exists():
        shutil.rmtree(output)

    summary = verify_source(source)
    vite_dist = _ensure_vite_dist(source, force_rebuild=force_rebuild)

    shutil.copytree(vite_dist, output, dirs_exist_ok=True)
    shutil.copy2(ROOT / "THIRD_PARTY_NOTICES.md", output / "THIRD_PARTY_NOTICES.md")
    (output / ".nojekyll").touch()

    file_hashes = {}
    for file_path in sorted(output.rglob("*")):
        if file_path.is_file() and file_path.name != "release.json":
            rel = file_path.relative_to(output).as_posix()
            file_hashes[rel] = _sha256(file_path)

    release = {
        "schema": 10,
        "title": "鸢尾湾·花与海之约",
        "style": "iris-bay-monet-garden-coastal-estate-babylon9",
        "worldSizeMeters": 260,
        "renderer": "babylon-9.36.0",
        "navigation": "default-aerial-overlook-click-to-dive-and-walk-inside",
        "modules": summary["modules"],
        "revision": os.environ.get("BLOOM_BUILD_REVISION", "local"),
        "files": file_hashes,
    }
    (output / "release.json").write_text(
        json.dumps(release, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Built Iris Bay Babylon 9 Static World: {output}")
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    parser.add_argument("--force-rebuild", action="store_true", help="Always rerun vite build before packaging")
    args = parser.parse_args()
    build(args.output, force_rebuild=args.force_rebuild)


if __name__ == "__main__":
    main()
