#!/usr/bin/env python3
"""Generate the flowers and build a portable, dependency-free Pages artifact."""

from __future__ import annotations

import argparse
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
    subprocess.run([sys.executable, str(ROOT / "generator.py"), "--output", str(source / "assets")], check=True)
    # Merge only our artifact names; never recursively delete an operator path.
    shutil.copytree(source, output, dirs_exist_ok=True)
    generate_thumbnails(output / "assets")
    (output / ".nojekyll").touch()
    print(f"Built gallery: {output}")
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    args = parser.parse_args()
    build(args.output)


if __name__ == "__main__":
    main()
