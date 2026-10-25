#!/usr/bin/env python3
"""Reproduce the unmodified official Three ESM distribution (not a site build).

Online refresh: python3 scripts/vendor_three.py
Offline audit:  python3 scripts/vendor_three.py --check
The Python static site build only copies site/vendor; Node/npm are not required.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.186.1"
TARBALL = f"https://registry.npmjs.org/three/-/three-{VERSION}.tgz"
INTEGRITY = "sha512-blFeqb49wRCSGUGj7gtpfnSGHy2lwDk94RhUmS1c/hTby70kvChbWpkJ4Pm1390LqzzvTmzgXKHPEafJwCb8jA=="
DEST = ROOT / "site" / "vendor" / f"three-{VERSION}"
MEMBERS = {"three.module.js": "build/three.module.js", "three.core.js": "build/three.core.js", "LICENSE": "LICENSE"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--tarball", type=Path, help="Use an already downloaded official npm tarball")
    args = parser.parse_args()
    if args.check:
        metadata = json.loads((DEST / "metadata.json").read_text())
        assert metadata["version"] == VERSION and metadata["integrity"] == INTEGRITY
        for name, info in metadata["files"].items():
            data = (DEST / name).read_bytes()
            assert len(data) == info["bytes"], name
            assert hashlib.sha256(data).hexdigest() == info["sha256"], name
        print(f"Three {VERSION}: official ESM and MIT hashes verified")
        return
    if args.tarball:
        data = args.tarball.read_bytes()
    else:
        with urllib.request.urlopen(TARBALL, timeout=60) as response:
            data = response.read()
    assert "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode() == INTEGRITY, "npm tarball integrity mismatch"
    metadata = {"name": "three", "version": VERSION, "revision": "186", "license": "MIT", "registry": "https://registry.npmjs.org/three/0.186.1", "tarball": TARBALL, "integrity": INTEGRITY, "gitHead": "9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8", "upstream": "https://github.com/mrdoob/three.js/tree/9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8", "modified": False, "files": {}}
    DEST.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        package = json.load(archive.extractfile("package/package.json"))
        assert package["version"] == VERSION and package["license"] == "MIT"
        for name, member in MEMBERS.items():
            body = archive.extractfile("package/" + member).read()
            (DEST / name).write_bytes(body)
            metadata["files"][name] = {"source": member, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}
    (DEST / "metadata.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Vendored Three {VERSION}: {sum(item['bytes'] for item in metadata['files'].values())} bytes; official ESM untouched")


if __name__ == "__main__":
    main()
