#!/usr/bin/env python3
"""Safe, reproducible GLB optimizer for 《鸢尾湾·花与海之约》.

Two lossless-visual optimization passes requiring zero external runtime decoders
(100% native glTF 2.0 core compatible with Babylon.js & file:// offline HTML):
  1. Controlled Blender 4.0.2 decimation for severely over-tessellated small props
     (preserves UVs, materials, armature skins, vertex groups, and animations).
  2. Opaque non-normal PNG -> JPEG (quality=88) texture repacking in GLB binary chunk
     (preserves normal maps, alpha-cutout textures, all meshes, morph targets, and animations).
  3. Lossless glTF 2.0 animation/accessor/bufferView compaction:
     - Prunes animation channels that are globally invariant at rest pose across ALL clips in a GLB
     - Strips unreferenced UV sets (TEXCOORD_1+) and redundant Ryukin tangents
     - Garbage-collects orphaned accessors & bufferViews and deduplicates identical bufferViews

Usage:
  python3 tools/optimize_glbs.py --decimate --repack-textures --compact-glb
"""

from __future__ import annotations

import argparse
import io
import json
import os
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "site" / "assets" / "models"

# Target decimate ratios for severely over-tessellated small/background props.
# Skips hero characters (couple_*, npc_*), villa architecture, and stylized trees/critters.
DECIMATE_TARGETS: dict[str, dict] = {
    "hero_rose.glb": {"ratio": 0.10, "min_faces": 12000, "strip_tangents": True},
    "freshwater_shrimp.glb": {"ratio": 0.14, "min_faces": 8000, "strip_tangents": True},
    "ph_periwinkle.glb": {"ratio": 0.35, "min_faces": 4000, "strip_extra_attrs": True},
    "ph_tea_set.glb": {"ratio": 0.22, "min_faces": 6000},
    "ph_picture_frame.glb": {"ratio": 0.24, "min_faces": 6000},
    "ph_chandelier.glb": {"ratio": 0.28, "min_faces": 6000},
    "ph_mantel_clock.glb": {"ratio": 0.30, "min_faces": 6000},
    "ph_wicker_basket.glb": {"ratio": 0.38, "min_faces": 5000},
}

BLENDER_DECIMATE_SCRIPT = r"""
import json
import sys
import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
in_path, out_path, cfg_json = argv[0], argv[1], argv[2]
cfg = json.loads(cfg_json)
ratio = float(cfg.get("ratio", 0.3))
min_faces = int(cfg.get("min_faces", 4000))
strip_extra = bool(cfg.get("strip_extra_attrs", False))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=in_path)

total_before = 0
total_after = 0
mesh_objs = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
for obj in mesh_objs:
    total_before += len(obj.data.polygons)

if total_before > min_faces:
    for obj in mesh_objs:
        me = obj.data
        n_faces = len(me.polygons)
        if strip_extra:
            while len(me.color_attributes) > 0:
                me.color_attributes.remove(me.color_attributes[0])
            while len(me.uv_layers) > 1:
                me.uv_layers.remove(me.uv_layers[-1])
        if n_faces < 300:
            total_after += n_faces
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        if me.shape_keys is None:
            mod = obj.modifiers.new(name="OptDecimate", type="DECIMATE")
            mod.decimate_type = "COLLAPSE"
            mod.ratio = max(0.05, min(1.0, ratio))
            mod.use_collapse_triangulate = True
            # Move decimate before Armature modifier if present so skin weights stay valid
            arm_idx = next((i for i, m in enumerate(obj.modifiers) if m.type == "ARMATURE"), None)
            if arm_idx is not None:
                while obj.modifiers.find(mod.name) > arm_idx:
                    bpy.ops.object.modifier_move_up(modifier=mod.name)
            bpy.ops.object.modifier_apply(modifier=mod.name)
        total_after += len(obj.data.polygons)
else:
    total_after = total_before

print(f"[decimate] {in_path} faces: {total_before} -> {total_after}")

bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format="GLB",
    export_texcoords=True,
    export_normals=True,
    export_tangents=False,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_animations=True,
    export_skins=True,
    export_morph=True,
    export_morph_normal=True,
    export_yup=True,
)
"""


def _read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    magic, version, _ = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise ValueError(f"Not a glTF 2.0 GLB: {path}")
    json_len, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise ValueError(f"Missing JSON chunk in {path}")
    gltf = json.loads(data[20 : 20 + json_len].decode("utf-8"))
    bin_off = 20 + json_len
    bin_data = b""
    if bin_off + 8 <= len(data):
        bin_len, bin_type = struct.unpack_from("<II", data, bin_off)
        if bin_type == 0x004E4942:
            bin_data = data[bin_off + 8 : bin_off + 8 + bin_len]
    return gltf, bin_data


def _write_glb(path: Path, gltf: dict, bin_data: bytes) -> None:
    json_bytes = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    while len(json_bytes) % 4 != 0:
        json_bytes += b" "
    bin_padded = bin_data + (b"\x00" * ((4 - (len(bin_data) % 4)) % 4))
    total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_padded)
    header = struct.pack("<4sII", b"glTF", 2, total_len)
    json_chunk = struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    bin_chunk = struct.pack("<II", len(bin_padded), 0x004E4942) + bin_padded
    path.write_bytes(header + json_chunk + bin_chunk)


def run_blender_decimation() -> None:
    blender = shutil.which("blender")
    if not blender:
        raise RuntimeError("blender executable not found in PATH")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        script_path = tmp_dir / "decimate.py"
        script_path.write_text(BLENDER_DECIMATE_SCRIPT, encoding="utf-8")

        for filename, cfg in DECIMATE_TARGETS.items():
            src = MODELS_DIR / filename
            if not src.is_file():
                continue
            orig_size = src.stat().st_size
            orig_gltf, _ = _read_glb(src)
            orig_anims = len(orig_gltf.get("animations", []))
            out_tmp = tmp_dir / filename
            clean_env = {k: v for k, v in os.environ.items() if k not in ("PYTHONPATH", "PYTHONHOME")}
            clean_env["PATH"] = f"/usr/bin:/bin:{clean_env.get('PATH', '')}"
            proc = subprocess.run(
                [blender, "-b", "--factory-startup", "--python", str(script_path), "--", str(src), str(out_tmp), json.dumps(cfg)],
                capture_output=True,
                text=True,
                env=clean_env,
                check=False,
            )
            if proc.returncode != 0 or not out_tmp.is_file():
                print(f"[WARN] Blender decimate failed for {filename}: {proc.stderr[-400:]}")
                continue
            new_gltf, _ = _read_glb(out_tmp)
            new_anims = len(new_gltf.get("animations", []))
            new_size = out_tmp.stat().st_size
            if new_anims < orig_anims:
                print(f"[SKIP] {filename}: animation count dropped ({orig_anims} -> {new_anims})")
                continue
            if new_size < orig_size * 0.95:
                shutil.copy2(out_tmp, src)
                print(
                    f"[OK] decimated {filename:24s} {orig_size/1024:.0f} KB -> {new_size/1024:.0f} KB "
                    f"(-{(1 - new_size/orig_size)*100:.1f}%, anims={new_anims})"
                )
            else:
                print(f"[KEEP] {filename:24s} no significant gain ({orig_size/1024:.0f} KB -> {new_size/1024:.0f} KB)")


def _collect_protected_image_indices(gltf: dict) -> set[int]:
    """Never convert normal maps or alpha-masked/blended base textures to JPEG."""
    textures = gltf.get("textures", [])
    protected: set[int] = set()

    def mark_tex(tex_info: dict | None) -> None:
        if not isinstance(tex_info, dict):
            return
        ti = tex_info.get("index")
        if isinstance(ti, int) and 0 <= ti < len(textures):
            src = textures[ti].get("source")
            if isinstance(src, int):
                protected.add(src)

    for mat in gltf.get("materials", []):
        mark_tex(mat.get("normalTexture"))
        # Keep metallicRoughnessTexture as PNG when packed channels require exact precision
        pbr = mat.get("pbrMetallicRoughness") or {}
        if mat.get("alphaMode") in ("MASK", "BLEND"):
            mark_tex(pbr.get("baseColorTexture"))
    return protected


def repack_opaque_png_textures(jpeg_quality: int = 88) -> None:
    total_saved = 0
    for glb_path in sorted(MODELS_DIR.glob("*.glb")):
        gltf, bin_data = _read_glb(glb_path)
        images = gltf.get("images", [])
        bvs = gltf.get("bufferViews", [])
        if not images or not bvs:
            continue

        protected = _collect_protected_image_indices(gltf)
        replacements: dict[int, bytes] = {}

        for img_idx, img in enumerate(images):
            if img_idx in protected:
                continue
            if img.get("mimeType") != "image/png":
                continue
            bv_idx = img.get("bufferView")
            if not isinstance(bv_idx, int):
                continue
            bv = bvs[bv_idx]
            off = bv.get("byteOffset", 0)
            length = bv["byteLength"]
            raw_png = bin_data[off : off + length]
            try:
                im = Image.open(io.BytesIO(raw_png))
                if im.mode in ("RGBA", "LA") and im.getchannel("A").getextrema()[0] < 255:
                    continue
                rgb = im.convert("RGB")
                buf = io.BytesIO()
                rgb.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
                jpg_bytes = buf.getvalue()
                if len(jpg_bytes) < len(raw_png) * 0.85:
                    replacements[bv_idx] = jpg_bytes
                    img["mimeType"] = "image/jpeg"
            except (OSError, ValueError) as exc:
                print(f"[WARN] Skip texture {glb_path.name}[{img_idx}]: {exc}")
                continue

        if not replacements:
            continue

        # Rebuild binary buffer cleanly with 4-byte aligned bufferViews
        new_bin = bytearray()
        for bv_idx, bv in enumerate(bvs):
            while len(new_bin) % 4 != 0:
                new_bin.append(0)
            new_off = len(new_bin)
            if bv_idx in replacements:
                chunk = replacements[bv_idx]
            else:
                off = bv.get("byteOffset", 0)
                chunk = bin_data[off : off + bv["byteLength"]]
            new_bin.extend(chunk)
            bv["byteOffset"] = new_off
            bv["byteLength"] = len(chunk)

        if gltf.get("buffers"):
            gltf["buffers"][0]["byteLength"] = len(new_bin)

        orig_size = glb_path.stat().st_size
        _write_glb(glb_path, gltf, bytes(new_bin))
        new_size = glb_path.stat().st_size
        saved = orig_size - new_size
        total_saved += saved
        print(
            f"[TEX] {glb_path.name:28s} {orig_size/1024:.0f} KB -> {new_size/1024:.0f} KB "
            f"(-{saved/1024:.0f} KB, {len(replacements)} PNG->JPG)"
        )
    print(f"[TEX] Total texture savings: {total_saved/1024/1024:.2f} MB")


_TYPE_COMPONENTS = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
    "MAT2": 4,
    "MAT3": 9,
    "MAT4": 16,
}


def _has_secondary_texcoord_refs(obj: object) -> bool:
    if isinstance(obj, dict):
        tc = obj.get("texCoord")
        if isinstance(tc, int) and tc >= 1:
            return True
        return any(_has_secondary_texcoord_refs(v) for v in obj.values())
    if isinstance(obj, list):
        return any(_has_secondary_texcoord_refs(v) for v in obj)
    return False


def _read_float_accessor_frames(gltf: dict, bin_data: bytes, acc_idx: int) -> list[tuple[float, ...]] | None:
    accs = gltf.get("accessors", [])
    bvs = gltf.get("bufferViews", [])
    if not (0 <= acc_idx < len(accs)):
        return None
    acc = accs[acc_idx]
    if acc.get("componentType") != 5126 or "sparse" in acc or "bufferView" not in acc:
        return None
    comp = _TYPE_COMPONENTS.get(acc.get("type", ""))
    if not comp:
        return None
    bv = bvs[acc["bufferView"]]
    stride = bv.get("byteStride")
    elem_bytes = comp * 4
    if stride is not None and stride != elem_bytes:
        return None
    base_off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    count = acc["count"]
    if base_off + count * elem_bytes > len(bin_data):
        return None
    vals = struct.unpack_from(f"<{count * comp}f", bin_data, base_off)
    return [vals[i * comp : (i + 1) * comp] for i in range(count)]


def compact_glb_buffers_and_animations() -> None:
    """Losslessly prune globally rest-invariant TRS channels, dead UV sets, and unused/duplicate bufferViews."""
    total_saved = 0
    total_pruned_channels = 0

    for glb_path in sorted(MODELS_DIR.glob("*.glb")):
        gltf, bin_data = _read_glb(glb_path)
        exts = set(gltf.get("extensionsUsed", []))
        if any(k in exts for k in ("KHR_draco_mesh_compression", "EXT_meshopt_compression", "EXT_mesh_gpu_instancing")):
            continue

        orig_size = glb_path.stat().st_size
        nodes = gltf.get("nodes", [])
        anims = gltf.get("animations", [])
        pruned_in_file = 0

        # 1. Identify (node, path) pairs that are constant at rest pose across ALL clips in this GLB
        if anims:
            by_node_path: dict[tuple[int, str], list[list[tuple[float, ...]]]] = {}
            unreadable_keys: set[tuple[int, str]] = set()
            for anim in anims:
                samps = anim.get("samplers", [])
                for ch in anim.get("channels", []):
                    tgt = ch.get("target", {})
                    ni = tgt.get("node")
                    path = tgt.get("path")
                    if not isinstance(ni, int) or path not in ("translation", "rotation", "scale"):
                        continue
                    key = (ni, path)
                    s_idx = ch.get("sampler")
                    if not isinstance(s_idx, int) or not (0 <= s_idx < len(samps)):
                        unreadable_keys.add(key)
                        continue
                    frames = _read_float_accessor_frames(gltf, bin_data, samps[s_idx]["output"])
                    if not frames:
                        unreadable_keys.add(key)
                        continue
                    by_node_path.setdefault(key, []).append(frames)

            globally_rest_keys: set[tuple[int, str]] = set()
            for key, clip_frames_list in by_node_path.items():
                if key in unreadable_keys or not clip_frames_list:
                    continue
                ni, path = key
                if not (0 <= ni < len(nodes)):
                    continue
                nd = nodes[ni]
                default_rest = (0.0, 0.0, 0.0, 1.0) if path == "rotation" else ((1.0, 1.0, 1.0) if path == "scale" else (0.0, 0.0, 0.0))
                rest = tuple(float(x) for x in nd.get(path, default_rest))
                if len(rest) != len(clip_frames_list[0][0]):
                    continue
                if all(
                    all(max(abs(a - b) for a, b in zip(fr, rest)) < 1e-4 for fr in frames)
                    for frames in clip_frames_list
                ):
                    globally_rest_keys.add(key)

            if globally_rest_keys:
                for anim in anims:
                    orig_channels = anim.get("channels", [])
                    orig_samplers = anim.get("samplers", [])
                    kept_channels = []
                    for ch in orig_channels:
                        tgt = ch.get("target", {})
                        key = (tgt.get("node"), tgt.get("path"))
                        if key in globally_rest_keys:
                            pruned_in_file += 1
                        else:
                            kept_channels.append(ch)
                    if not kept_channels and orig_channels:
                        kept_channels = [orig_channels[0]]
                        pruned_in_file = max(0, pruned_in_file - 1)
                    sampler_remap: dict[int, int] = {}
                    new_samplers = []
                    for ch in kept_channels:
                        old_s = ch["sampler"]
                        if old_s not in sampler_remap:
                            sampler_remap[old_s] = len(new_samplers)
                            new_samplers.append(orig_samplers[old_s])
                        ch["sampler"] = sampler_remap[old_s]
                    anim["channels"] = kept_channels
                    anim["samplers"] = new_samplers

        # 2. Strip unused secondary UVs (and redundant Ryukin tangent buffers)
        uses_secondary_uv = _has_secondary_texcoord_refs(gltf.get("materials", []))
        strip_tangent = glb_path.name == "ryukin_goldfish.glb"
        for mesh in gltf.get("meshes", []):
            for prim in mesh.get("primitives", []):
                attrs = prim.get("attributes", {})
                if not uses_secondary_uv:
                    attrs.pop("TEXCOORD_1", None)
                    attrs.pop("TEXCOORD_2", None)
                if strip_tangent:
                    attrs.pop("TANGENT", None)

        # 3. Garbage-collect unreferenced accessors and remap indices cleanly
        old_accs = gltf.get("accessors", [])
        if not old_accs:
            continue

        live_acc_set: set[int] = set()
        for mesh in gltf.get("meshes", []):
            for prim in mesh.get("primitives", []):
                if isinstance(prim.get("indices"), int):
                    live_acc_set.add(prim["indices"])
                for ai in prim.get("attributes", {}).values():
                    if isinstance(ai, int):
                        live_acc_set.add(ai)
                for tgt in prim.get("targets", []):
                    for ai in tgt.values():
                        if isinstance(ai, int):
                            live_acc_set.add(ai)
        for skin in gltf.get("skins", []):
            if isinstance(skin.get("inverseBindMatrices"), int):
                live_acc_set.add(skin["inverseBindMatrices"])
        for anim in gltf.get("animations", []):
            for samp in anim.get("samplers", []):
                if isinstance(samp.get("input"), int):
                    live_acc_set.add(samp["input"])
                if isinstance(samp.get("output"), int):
                    live_acc_set.add(samp["output"])

        acc_remap: dict[int, int] = {}
        new_accs = []
        for old_i in sorted(live_acc_set):
            if 0 <= old_i < len(old_accs):
                acc_remap[old_i] = len(new_accs)
                new_accs.append(old_accs[old_i])
        gltf["accessors"] = new_accs

        for mesh in gltf.get("meshes", []):
            for prim in mesh.get("primitives", []):
                if isinstance(prim.get("indices"), int):
                    prim["indices"] = acc_remap[prim["indices"]]
                attrs = prim.get("attributes", {})
                for k in list(attrs.keys()):
                    attrs[k] = acc_remap[attrs[k]]
                for tgt in prim.get("targets", []):
                    for k in list(tgt.keys()):
                        tgt[k] = acc_remap[tgt[k]]
        for skin in gltf.get("skins", []):
            if isinstance(skin.get("inverseBindMatrices"), int):
                skin["inverseBindMatrices"] = acc_remap[skin["inverseBindMatrices"]]
        for anim in gltf.get("animations", []):
            for samp in anim.get("samplers", []):
                samp["input"] = acc_remap[samp["input"]]
                samp["output"] = acc_remap[samp["output"]]

        # 4. Garbage-collect unreferenced bufferViews & deduplicate identical (bytes, stride, target) slices
        old_bvs = gltf.get("bufferViews", [])
        live_bv_set: set[int] = set()
        for acc in new_accs:
            if isinstance(acc.get("bufferView"), int):
                live_bv_set.add(acc["bufferView"])
            sp = acc.get("sparse")
            if isinstance(sp, dict):
                if isinstance(sp.get("indices", {}).get("bufferView"), int):
                    live_bv_set.add(sp["indices"]["bufferView"])
                if isinstance(sp.get("values", {}).get("bufferView"), int):
                    live_bv_set.add(sp["values"]["bufferView"])
        for img in gltf.get("images", []):
            if isinstance(img.get("bufferView"), int):
                live_bv_set.add(img["bufferView"])

        bv_remap: dict[int, int] = {}
        dedup_map: dict[tuple[bytes, int | None, int | None], int] = {}
        new_bvs = []
        new_bin = bytearray()

        for old_bvi in sorted(live_bv_set):
            if not (0 <= old_bvi < len(old_bvs)):
                continue
            bv = old_bvs[old_bvi]
            off = bv.get("byteOffset", 0)
            length = bv["byteLength"]
            raw_slice = bytes(bin_data[off : off + length])
            stride = bv.get("byteStride")
            target = bv.get("target")
            sig = (raw_slice, stride, target)
            if sig in dedup_map:
                bv_remap[old_bvi] = dedup_map[sig]
                continue

            while len(new_bin) % 4 != 0:
                new_bin.append(0)
            new_off = len(new_bin)
            new_bin.extend(raw_slice)

            nbv: dict[str, int | str] = {
                "buffer": 0,
                "byteOffset": new_off,
                "byteLength": len(raw_slice),
            }
            if stride is not None:
                nbv["byteStride"] = stride
            if target is not None:
                nbv["target"] = target
            if "name" in bv:
                nbv["name"] = bv["name"]

            new_idx = len(new_bvs)
            new_bvs.append(nbv)
            dedup_map[sig] = new_idx
            bv_remap[old_bvi] = new_idx

        for acc in new_accs:
            if isinstance(acc.get("bufferView"), int):
                acc["bufferView"] = bv_remap[acc["bufferView"]]
            sp = acc.get("sparse")
            if isinstance(sp, dict):
                sp["indices"]["bufferView"] = bv_remap[sp["indices"]["bufferView"]]
                sp["values"]["bufferView"] = bv_remap[sp["values"]["bufferView"]]
        for img in gltf.get("images", []):
            if isinstance(img.get("bufferView"), int):
                img["bufferView"] = bv_remap[img["bufferView"]]

        gltf["bufferViews"] = new_bvs
        if gltf.get("buffers"):
            gltf["buffers"] = [{"byteLength": len(new_bin)}]

        # Write to memory first and only overwrite if meaningfully smaller
        tmp_buf = io.BytesIO()
        json_bytes = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        while len(json_bytes) % 4 != 0:
            json_bytes += b" "
        bin_padded = bytes(new_bin) + (b"\x00" * ((4 - (len(new_bin) % 4)) % 4))
        new_total = 12 + 8 + len(json_bytes) + 8 + len(bin_padded)

        if new_total < orig_size - 1024:
            _write_glb(glb_path, gltf, bytes(new_bin))
            saved = orig_size - new_total
            total_saved += saved
            total_pruned_channels += pruned_in_file
            print(
                f"[COMPACT] {glb_path.name:26s} {orig_size/1024:6.0f} KB -> {new_total/1024:6.0f} KB "
                f"(-{saved/1024:5.0f} KB, pruned_ch={pruned_in_file})"
            )
        void = tmp_buf
        del void

    print(
        f"[COMPACT] Total GLB compaction savings: {total_saved/1024/1024:.2f} MB "
        f"(pruned {total_pruned_channels} invariant channels)"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--decimate", action="store_true", help="Run Blender decimation pass")
    parser.add_argument("--repack-textures", action="store_true", help="Repack opaque non-normal PNGs to JPEG")
    parser.add_argument("--compact-glb", action="store_true", help="Losslessly prune invariant anim channels & unused bufferViews")
    args = parser.parse_args()
    if not args.decimate and not args.repack_textures and not args.compact_glb:
        args.decimate = True
        args.repack_textures = True
        args.compact_glb = True
    if args.decimate:
        run_blender_decimation()
    if args.repack_textures:
        repack_opaque_png_textures()
    if args.compact_glb:
        compact_glb_buffers_and_animations()


if __name__ == "__main__":
    main()
