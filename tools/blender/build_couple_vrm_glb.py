#!/usr/bin/env python3
"""Build Genshin-styled anime couple glTF models (couple_xian.glb & couple_ran.glb)
from verified CC0 VRoid VRM bases with retargeted 17 NLA animations & facial morph targets.

Usage:
    PYTHONPATH=/usr/lib/python3.12:/usr/lib/python3.12/lib-dynload \
    blender --python-use-system-env -b -P tools/blender/build_couple_vrm_glb.py -- \
        --out-dir site/assets/models [--render-qa scratch/couple_vrm_qa.png]
"""
from __future__ import annotations

import argparse
import json
import math
import os
import struct
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Quaternion, Vector
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

REPO_ROOT = Path(__file__).resolve().parents[2]
VRM_CACHE = REPO_ROOT / "tools" / "blender" / "_vrm_cache"
TEX_BAKED = REPO_ROOT / "tools" / "blender" / "_tex_cache" / "vrm_baked"

VRM_SOURCES = {
    "xian": {
        "file": "Victoria_Rubin.vrm",
        "target_height": 1.58,
    },
    "ran": {
        "file": "Sakurada_Fumiriya.vrm",
        "target_height": 1.72,
    },
}


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def parse_vrm_json(vrm_path: Path) -> dict:
    raw = vrm_path.read_bytes()
    jlen = struct.unpack("<I", raw[12:16])[0]
    return json.loads(raw[20 : 20 + jlen].decode("utf-8"))


# ---------------------------------------------------------------------------
# PIL Texture Processing: MToon Tint Baking + Downscaling + Ran Genshin Outfit
# ---------------------------------------------------------------------------

def restyle_ran_image(tex_name: str, rgba: np.ndarray) -> np.ndarray:
    """Restyle Sakurada_Fumiriya's dark school uniform into a Fontaine/Mondstadt
    Royal Azure + Ivory + Gold Aristocrat Outfit while keeping fabric folds."""
    arr = rgba.astype(np.float32) / 255.0
    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3:4]
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    u = xx / max(1, w - 1)
    v = yy / max(1, h - 1)  # 0 at top, 1 at bottom

    if "Tops" in tex_name:
        lum = rgb.mean(axis=2, keepdims=True)
        lum2 = lum[:, :, 0]
        # Bottom half (v > 0.435) is knitted vest; top half is sleeves + collar
        is_vest = (v > 0.432) & ~((v < 0.68) & (u > 0.425) & (u < 0.575) & (lum2 > 0.50))
        # Preserve weave contrast inside vest, shift charcoal-navy -> rich Fontaine sapphire
        vest_shade = np.clip((lum - 0.14) / 0.22, 0.22, 1.0)
        sapphire_light = np.array([0.23, 0.42, 0.78], dtype=np.float32)
        sapphire_dark = np.array([0.09, 0.16, 0.36], dtype=np.float32)
        vest_col = sapphire_dark + (sapphire_light - sapphire_dark) * vest_shade

        # Add crisp gold trim border near hem ribbing (v in 0.892..0.900) and collar/arm borders
        gold = np.array([0.92, 0.75, 0.32], dtype=np.float32)
        rose_trim = np.array([0.78, 0.28, 0.40], dtype=np.float32)
        hem_gold = (v > 0.892) & (v < 0.900) & (lum2 < 0.48)
        waist_rose = (v >= 0.900) & (v < 0.906) & (lum2 < 0.48)

        # Sleeves + shirt: transform cool blue/black sleeve gradients into sunlit ivory-white sleeves w/ azure cuffs
        shirt_shade = np.clip(lum * 1.15 + 0.18, 0.42, 1.0)
        ivory = np.array([0.99, 0.97, 0.94], dtype=np.float32)
        sky_shadow = np.array([0.74, 0.82, 0.96], dtype=np.float32)
        shirt_col = sky_shadow + (ivory - sky_shadow) * shirt_shade

        # Outer black cuff strips on sleeve UV borders (u < 0.14 or u > 0.86 at v < 0.43)
        cuff_band = (v < 0.432) & ((u < 0.12) | (u > 0.88))
        cuff_gold = (v < 0.432) & (((u >= 0.115) & (u < 0.138)) | ((u > 0.862) & (u <= 0.885)))

        out = rgb.copy()
        out[~is_vest] = shirt_col[~is_vest]
        out[is_vest] = vest_col[is_vest]
        out[cuff_band] = sapphire_dark * 0.95
        out[cuff_gold] = gold
        out[hem_gold] = gold
        out[waist_rose] = rose_trim
        # Gold double-breast waistcoat buttons along front center (u ~ 0.455 / 0.545)
        for bx in (0.455, 0.545):
            for by in (0.66, 0.76, 0.85):
                dist = np.hypot((u - bx), (v - by))
                btn = dist < 0.011
                out[btn] = gold * (1.05 - dist[btn][:, None] * 18.0)
        rgb = np.clip(out, 0.0, 1.0)

    elif "Accessory" in tex_name:
        # Crimson-rose & gold Fontaine cravat replacing school orange tie
        lum = np.clip(rgb.mean(axis=2, keepdims=True) * 1.35, 0.25, 1.0)
        crimson = np.array([0.82, 0.20, 0.34], dtype=np.float32)
        out = crimson * lum
        diamond = (np.abs(u - 0.5) * 1.4 + np.abs(v - 0.20) * 1.6) < 0.11
        out[diamond] = np.array([0.94, 0.78, 0.34], dtype=np.float32)
        rgb = np.clip(out, 0.0, 1.0)

    elif "Bottoms" in tex_name:
        # Crisp midnight navy riding breeches + warm leather & gold buckle belt
        lum = rgb.mean(axis=2, keepdims=True)
        lum2 = lum[:, :, 0]
        in_belt = v < 0.095
        buckle = (v < 0.10) & (u > 0.45) & (u < 0.55) & (lum2 > 0.35)
        slate_navy = np.array([0.16, 0.22, 0.38], dtype=np.float32)
        pants_shade = np.clip(lum * 3.8 + 0.42, 0.38, 1.0)
        out = slate_navy * pants_shade
        leather = np.array([0.38, 0.22, 0.16], dtype=np.float32)
        gold = np.array([0.94, 0.76, 0.34], dtype=np.float32)
        out[in_belt] = leather * np.clip(lum[in_belt] * 1.8 + 0.45, 0.45, 1.0)
        out[buckle] = gold
        rgb = np.clip(out, 0.0, 1.0)

    elif "Shoes" in tex_name:
        lum = np.clip(rgb.mean(axis=2, keepdims=True) * 2.6 + 0.35, 0.35, 1.0)
        boot_col = np.array([0.36, 0.23, 0.19], dtype=np.float32)
        rgb = np.clip(boot_col * lum, 0.0, 1.0)

    elif "Face_00" in tex_name:
        # Warm gentle anime cheek blush under eyes
        for cx in (0.31, 0.69):
            d = np.hypot((u - cx) / 0.085, (v - 0.625) / 0.042)
            mask = np.clip(1.0 - d, 0.0, 1.0)[:, :, None] ** 1.7
            blush = np.array([0.98, 0.62, 0.63], dtype=np.float32)
            rgb = rgb * (1.0 - mask * 0.28) + blush * (mask * 0.28)

    return np.clip(np.concatenate([rgb, alpha], axis=2) * 255.0, 0, 255).astype(np.uint8)


def restyle_xian_image(tex_name: str, rgba: np.ndarray) -> np.ndarray:
    """Enhance Victoria_Rubin's anime textures for luminous Genshin tonal contrast:
    crisper plum-rose trim separation on dress/ribbons, warmer blush on face, richer hair gradient."""
    arr = rgba.astype(np.float32) / 255.0
    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3:4]
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    u = xx / max(1, w - 1)
    v = yy / max(1, h - 1)

    if "Face_00" in tex_name:
        for cx in (0.31, 0.69):
            d = np.hypot((u - cx) / 0.088, (v - 0.625) / 0.044)
            mask = np.clip(1.0 - d, 0.0, 1.0)[:, :, None] ** 1.65
            blush = np.array([1.00, 0.56, 0.64], dtype=np.float32)
            rgb = rgb * (1.0 - mask * 0.30) + blush * (mask * 0.30)
    elif any(k in tex_name for k in ("Onepiece", "Tops", "Bottoms", "Cloth", "Dress", "Ribbon")):
        mean_c = rgb.mean(axis=2, keepdims=True)
        # Boost chromatic richness without blowing highlights
        rgb = np.clip(mean_c + (rgb - mean_c) * 1.32, 0.0, 1.0)
        # Deepen dark fold/trim hues slightly toward Genshin plum-gold warmth
        dark = np.clip((0.55 - mean_c[:, :, 0]) / 0.35, 0.0, 1.0)[:, :, None]
        rgb = rgb * (1.0 - dark * 0.16) + np.array([0.42, 0.18, 0.34], dtype=np.float32) * (dark * 0.16)
    elif "Hair" in tex_name:
        mean_c = rgb.mean(axis=2, keepdims=True)
        rgb = np.clip(mean_c * 0.98 + (rgb - mean_c) * 1.24, 0.0, 1.0)

    return np.clip(np.concatenate([rgb, alpha], axis=2) * 255.0, 0, 255).astype(np.uint8)


def bake_and_rebuild_vrm_materials(char_id: str, vrm_json: dict) -> set[str]:
    """Multiply MToon _Color into textures, downscale <= 512px, and convert materials
    from KHR_materials_unlit to standard Principled BSDF for clean glTF + GenshinToon shading."""
    TEX_BAKED.mkdir(parents=True, exist_ok=True)
    mtoon_colors = {}
    for mp in vrm_json.get("extensions", {}).get("VRM", {}).get("materialProperties", []):
        col = mp.get("vectorProperties", {}).get("_Color", [1.0, 1.0, 1.0, 1.0])
        mtoon_colors[mp["name"]] = tuple(float(c) for c in col[:4])

    overlay_mat_names = set()

    for mat in list(bpy.data.materials):
        mname = mat.name
        if "EyeExtra" in mname:
            continue
        if any(k in mname for k in ("EyeHighlight", "FaceBrow", "FaceEyelash", "FaceEyeline")):
            overlay_mat_names.add(mname)

        tint = mtoon_colors.get(mname, (1.0, 1.0, 1.0, 1.0))
        src_img = None
        if mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image is not None:
                    src_img = n.image
                    break

        baked_img = None
        has_real_cutout = False
        has_partial_alpha = False
        if src_img is not None and src_img.size[0] > 0:
            w0, h0 = src_img.size[0], src_img.size[1]
            # Blender stores pixels bottom-to-top; flip vertically for PIL top-to-bottom
            px = np.array(src_img.pixels[:], dtype=np.float32).reshape(h0, w0, 4)
            px = np.flipud(px)
            # Bake MToon _Color tint directly in sRGB pixel space
            px[:, :, 0] *= tint[0]
            px[:, :, 1] *= tint[1]
            px[:, :, 2] *= tint[2]
            rgba_u8 = np.clip(px * 255.0, 0, 255).astype(np.uint8)

            if char_id == "ran":
                rgba_u8 = restyle_ran_image(src_img.name, rgba_u8)
            else:
                rgba_u8 = restyle_xian_image(src_img.name, rgba_u8)

            # Downscale proportionally to max 512px (keep crisp anime eyes/hair small & fast)
            max_side = 512
            if w0 > max_side or h0 > max_side:
                scale = max_side / max(w0, h0)
                nw = max(16, int(round(w0 * scale)))
                nh = max(16, int(round(h0 * scale)))
                pil = Image.fromarray(rgba_u8, "RGBA").resize((nw, nh), Image.Resampling.LANCZOS)
                rgba_u8 = np.array(pil, dtype=np.uint8)
            else:
                pil = Image.fromarray(rgba_u8, "RGBA")

            a_chan = rgba_u8[:, :, 3]
            has_real_cutout = bool(np.any(a_chan < 25))
            has_partial_alpha = bool(np.any((a_chan > 20) & (a_chan < 235)))

            safe_name = mname.replace("/", "_").replace(" ", "_")
            out_png = TEX_BAKED / f"{char_id}_{safe_name}.png"
            if not has_real_cutout and not has_partial_alpha:
                pil.convert("RGB").save(out_png, optimize=True)
            else:
                pil.save(out_png, optimize=True)
            baked_img = bpy.data.images.load(str(out_png))
            baked_img.colorspace_settings.name = "sRGB"

        # Rebuild material nodes cleanly as Principled BSDF
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out_node = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(bsdf.outputs["BSDF"], out_node.inputs["Surface"])

        is_eye_iris = "EyeIris" in mname or "EyeHighlight" in mname
        is_skin_or_face = "SKIN" in mname or "Face_00" in mname
        bsdf.inputs["Roughness"].default_value = 0.14 if is_eye_iris else (0.78 if is_skin_or_face else 0.72)
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.25 if is_eye_iris else 0.12

        if baked_img is not None:
            tex_node = nt.nodes.new("ShaderNodeTexImage")
            tex_node.image = baked_img
            nt.links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
            if mname in overlay_mat_names or ("HairBack" in mname and has_real_cutout):
                mat.blend_method = "CLIP"
                mat.alpha_threshold = 0.35
                nt.links.new(tex_node.outputs["Alpha"], bsdf.inputs["Alpha"])
            elif has_real_cutout:
                mat.blend_method = "CLIP"
                mat.alpha_threshold = 0.45
                nt.links.new(tex_node.outputs["Alpha"], bsdf.inputs["Alpha"])
            else:
                mat.blend_method = "OPAQUE"
        else:
            bsdf.inputs["Base Color"].default_value = tint
            mat.blend_method = "OPAQUE"

        # Double-sided on hair/cloth/overlays where VRM expects it
        if any(k in mname for k in ("Hair", "HAIR", "Tops", "Shoes", "Bottoms", "Accessory", "Lash", "Brow", "Eyeline", "Highlight")):
            mat.use_backface_culling = False
        else:
            mat.use_backface_culling = True

    return overlay_mat_names


def make_simple_pbr_mat(name: str, rgba, roughness: float = 0.62, metallic: float = 0.0, emission=None, emission_strength: float = 0.0, double_sided: bool = False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (rgba[0], rgba[1], rgba[2], 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.20
    if emission is not None and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (emission[0], emission[1], emission[2], 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mat.use_backface_culling = not double_sided
    return mat


# ---------------------------------------------------------------------------
# Normalize Orientation (-Y front, +X left, +Z up) & Height
# ---------------------------------------------------------------------------

def normalize_vrm_scene(target_height: float):
    """Scale and rotate all meshes + armature 180 deg around Z so character faces -Y
    with Left at +X, Up at +Z, feet on Z=0, matching glTF -> +Z in Babylon.js."""
    if "Icosphere" in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects["Icosphere"], do_unlink=True)

    arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    arm.name = f"Armature"
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]

    zs = [v.co.z for m in meshes for v in m.data.vertices]
    min_z, max_z = min(zs), max(zs)
    cur_h = max(0.2, max_z - min_z)
    scale = target_height / cur_h

    def xform(vec: Vector) -> Vector:
        # Rotate 180 deg around Z: (x, y, z) -> (-x, -y, z), shift z so min_z -> 0
        return Vector((-vec.x * scale, -vec.y * scale, (vec.z - min_z) * scale))

    # 1. Transform Armature EditBones cleanly with roll = 0
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    for b in eb:
        b.head = xform(b.head)
        b.tail = xform(b.tail)
        b.roll = 0.0
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.location = (0.0, 0.0, 0.0)
    arm.rotation_euler = (0.0, 0.0, 0.0)
    arm.scale = (1.0, 1.0, 1.0)

    # 2. Transform mesh vertices + shape keys cleanly (preserving exact normals & weights)
    for m in meshes:
        m.parent = arm
        m.matrix_parent_inverse.identity()
        m.location = (0.0, 0.0, 0.0)
        m.rotation_euler = (0.0, 0.0, 0.0)
        m.scale = (1.0, 1.0, 1.0)
        if m.data.shape_keys:
            for kb in m.data.shape_keys.key_blocks:
                for p in kb.data:
                    p.co = xform(p.co)
        for v in m.data.vertices:
            v.co = xform(v.co)
        m.data.update()

    bpy.context.view_layer.update()
    return arm


# ---------------------------------------------------------------------------
# Shape Keys Consolidation (EyeBlink, Smile, Kiss, ShyBlush) & Face Split
# ---------------------------------------------------------------------------

def _make_anime_blush_texture(char_id: str) -> bpy.types.Image:
    """Create a soft airbrushed anime cheek-blush + subtle slash-hatch texture with alpha."""
    TEX_BAKED.mkdir(parents=True, exist_ok=True)
    out_png = TEX_BAKED / f"{char_id}_anime_blush.png"
    w, h = 256, 128
    yy, xx = np.mgrid[0:h, 0:w]
    u = (xx / (w - 1)) * 2.0 - 1.0  # -1..1
    v = (yy / (h - 1)) * 2.0 - 1.0  # -1..1
    # Soft coral-pink oval blush radial falloff
    r2 = (u / 0.82) ** 2 + (v / 0.72) ** 2
    glow = np.clip(1.0 - np.sqrt(r2), 0.0, 1.0) ** 1.85
    # 3 delicate diagonal anime blush lines inside the oval
    lines = np.zeros_like(glow)
    for ox in (-0.34, 0.0, 0.34):
        dist = np.abs((u - ox) + v * 0.28)
        in_y = np.clip(1.0 - np.abs(v) / 0.42, 0.0, 1.0)
        lines += np.clip(1.0 - dist / 0.055, 0.0, 1.0) * in_y
    lines = np.clip(lines, 0.0, 1.0)

    alpha = np.clip(glow * 0.72 + lines * 0.36 * glow, 0.0, 0.92)
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    base_col = (255, 118, 146) if char_id == "xian" else (252, 128, 134)
    line_col = (242, 82, 116)
    mix_r = base_col[0] * (1.0 - lines * 0.5) + line_col[0] * (lines * 0.5)
    mix_g = base_col[1] * (1.0 - lines * 0.5) + line_col[1] * (lines * 0.5)
    mix_b = base_col[2] * (1.0 - lines * 0.5) + line_col[2] * (lines * 0.5)
    rgba[:, :, 0] = np.clip(mix_r, 0, 255).astype(np.uint8)
    rgba[:, :, 1] = np.clip(mix_g, 0, 255).astype(np.uint8)
    rgba[:, :, 2] = np.clip(mix_b, 0, 255).astype(np.uint8)
    rgba[:, :, 3] = np.clip(alpha * 255.0, 0, 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(out_png, optimize=True)
    img = bpy.data.images.load(str(out_png))
    img.colorspace_settings.name = "sRGB"
    return img


def add_blush_overlay_mesh(arm, face_skin_obj, char_id: str) -> None:
    """Create contoured curved cheek-blush patches hugging Face_Skin cheeks so
    ShyBlush intensity animates visibly and smoothly without clipping or Z-fighting."""
    if not face_skin_obj:
        return
    # Locate actual eye & cheek coordinates in normalized space
    mesh_data = face_skin_obj.data
    cheek_z = 1.394 if char_id == "xian" else 1.531
    cx_center = 0.041 if char_id == "xian" else 0.043
    rx, rz = 0.023, 0.0135

    bm_src = bmesh.new()
    bm_src.from_mesh(mesh_data)
    bm_src.verts.ensure_lookup_table()
    bm_src.verts.index_update()

    # Smoothly project curved grid over L and R cheeks via BVH raycast onto Face_Skin!
    from mathutils.bvhtree import BVHTree
    bvh = BVHTree.FromBMesh(bm_src)

    bm_b = bmesh.new()
    uv_layer = bm_b.loops.layers.uv.verify()
    nx, nz = 6, 4
    for side in (1.0, -1.0):
        grid = []
        for iz in range(nz + 1):
            tz = iz / nz
            zz = cheek_z + (tz - 0.5) * 2.0 * rz
            row = []
            for ix in range(nx + 1):
                tx = ix / nx
                xx = side * cx_center + (tx - 0.5) * 2.0 * rx
                origin = Vector((xx, -0.22, zz))
                direction = Vector((0.0, 1.0, 0.0))
                loc, nrm, _, _ = bvh.ray_cast(origin, direction, 0.30)
                if loc is None:
                    loc = Vector((xx, -0.072 if char_id == "xian" else -0.082, zz))
                    nrm = Vector((xx * 2.5, -1.0, 0.0)).normalized()
                else:
                    if nrm.y > 0:
                        nrm = -nrm
                pt = loc + nrm.normalized() * 0.0020
                row.append((bm_b.verts.new(pt), tx, 1.0 - tz))
            grid.append(row)
        for iz in range(nz):
            for ix in range(nx):
                p00, u00, v00 = grid[iz][ix]
                p10, u10, v10 = grid[iz][ix + 1]
                p11, u11, v11 = grid[iz + 1][ix + 1]
                p01, u01, v01 = grid[iz + 1][ix]
                f = bm_b.faces.new((p00, p10, p11, p01))
                for loop, uu, vv in zip(f.loops, (u00, u10, u11, u01), (v00, v10, v11, v01)):
                    loop[uv_layer].uv = (uu, vv)

    bm_src.free()
    bmesh.ops.recalc_face_normals(bm_b, faces=bm_b.faces)
    blush_mesh = bpy.data.meshes.new(f"{char_id}_Face_Blush")
    bm_b.to_mesh(blush_mesh)
    bm_b.free()

    blush_img = _make_anime_blush_texture(char_id)
    mat = bpy.data.materials.new(f"{char_id}_FaceBlush")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.85
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.02
    tex_node = nt.nodes.new("ShaderNodeTexImage")
    tex_node.image = blush_img
    nt.links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex_node.outputs["Alpha"], bsdf.inputs["Alpha"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mat.blend_method = "BLEND"
    mat.use_backface_culling = False

    bobj = bpy.data.objects.new(f"{char_id}_Face_Blush", blush_mesh)
    bpy.context.collection.objects.link(bobj)
    bobj.data.materials.append(mat)
    skin_mesh_by_nearest_z(bobj, arm, lambda _co: {"J_Bip_C_Head": 1.0})


def consolidate_face_morphs_and_split(arm, char_id: str, vrm_json: dict):
    """Decompose VRM blendShapeGroups cleanly by facial region (Eye/Brow/Mouth) into 17
    orthogonal morph targets; strip EyeExtra; split Face into Face_Skin + Face_Features + Face_Blush."""
    face_obj = bpy.data.objects.get("Face")
    if not face_obj:
        return []

    # Remove unused EyeExtra_01 polygons before splitting
    extra_idx = [i for i, m in enumerate(face_obj.data.materials) if m and "EyeExtra" in m.name]
    if extra_idx:
        bpy.context.view_layer.objects.active = face_obj
        bpy.ops.object.mode_set(mode="EDIT")
        bm = bmesh.from_edit_mesh(face_obj.data)
        to_del = [f for f in bm.faces if f.material_index in extra_idx]
        bmesh.ops.delete(bm, geom=to_del, context="FACES")
        bmesh.update_edit_mesh(face_obj.data)
        bpy.ops.object.mode_set(mode="OBJECT")
        for idx in reversed(extra_idx):
            face_obj.data.materials.pop(index=idx)

    # Build lookup preset -> list of (target_index, weight_0_to_1)
    preset_map = {}
    for bg in vrm_json.get("extensions", {}).get("VRM", {}).get("blendShapeMaster", {}).get("blendShapeGroups", []):
        pname = (bg.get("presetName") or bg.get("name") or "").lower()
        binds = []
        for b in bg.get("binds", []):
            binds.append((f"target_{b['index']}", float(b.get("weight", 100)) / 100.0))
        preset_map[pname] = binds

    # Build per-vertex region masks (1.0 / 0.0) in normalized space
    n_verts = len(face_obj.data.vertices)
    vert_mats = [set() for _ in range(n_verts)]
    for poly in face_obj.data.polygons:
        mn = face_obj.data.materials[poly.material_index].name if face_obj.data.materials[poly.material_index] else ""
        for vi in poly.vertices:
            vert_mats[vi].add(mn)

    brow_mask = np.zeros((n_verts, 1), dtype=np.float32)
    eye_mats = ("EyeWhite", "EyeIris", "EyeHighlight", "FaceEyelash", "FaceEyeline")
    # Locate eye vs mouth Y/Z band using actual EyeWhite & FaceMouth vertices
    eye_zs = [face_obj.data.vertices[vi].co.z for vi in range(n_verts) if any("EyeWhite" in m for m in vert_mats[vi])]
    mouth_zs = [face_obj.data.vertices[vi].co.z for vi in range(n_verts) if any("FaceMouth" in m for m in vert_mats[vi])]
    eye_min_z = (min(eye_zs) - 0.018) if eye_zs else (1.38 if char_id == "xian" else 1.52)
    mouth_max_z = (max(mouth_zs) + 0.016) if mouth_zs else (1.39 if char_id == "xian" else 1.53)
    split_nose_z = 0.5 * (eye_min_z + mouth_max_z)

    eye_mask = np.zeros((n_verts, 1), dtype=np.float32)
    mouth_mask = np.zeros((n_verts, 1), dtype=np.float32)
    for vi in range(n_verts):
        ms = vert_mats[vi]
        z_v = face_obj.data.vertices[vi].co.z
        is_brow = any("FaceBrow" in m for m in ms)
        is_mouth_mat = any("FaceMouth" in m for m in ms)
        is_eye_mat = any(k in m for m in ms for k in eye_mats)
        if is_brow:
            brow_mask[vi, 0] = 1.0
        elif is_eye_mat or (not is_mouth_mat and z_v >= split_nose_z):
            eye_mask[vi, 0] = 1.0
        if is_mouth_mat or (not is_brow and not is_eye_mat and z_v < split_nose_z):
            mouth_mask[vi, 0] = 1.0

    sk = face_obj.data.shape_keys
    if sk:
        basis_coords = np.array([p.co[:] for p in sk.key_blocks["Basis"].data], dtype=np.float32)

        def eval_delta(tname: str) -> np.ndarray:
            if tname not in sk.key_blocks:
                return np.zeros_like(basis_coords)
            arr = np.array([p.co[:] for p in sk.key_blocks[tname].data], dtype=np.float32)
            return arr - basis_coords

        def sum_preset(pname: str) -> np.ndarray:
            d = np.zeros_like(basis_coords)
            for tname, w in preset_map.get(pname, []):
                d += eval_delta(tname) * w
            return d

        d_joy = sum_preset("joy")
        d_fun = sum_preset("fun")
        d_sorrow = sum_preset("sorrow")
        d_angry = sum_preset("angry")
        d_surp = sum_preset("surprised")
        d_a = sum_preset("a")
        d_o = sum_preset("o")
        d_u = sum_preset("u")

        custom_morphs = {
            "EyeBlink": sum_preset("blink"),
            "BlinkL": sum_preset("blink_l"),
            "BlinkR": sum_preset("blink_r"),
            "EyeJoy": d_joy * eye_mask,
            "EyeSoft": (d_fun * 0.58 + d_sorrow * 0.24) * eye_mask,
            "EyeWide": d_surp * eye_mask,
            "BrowHappy": (d_fun * 0.65 + d_joy * 0.35) * brow_mask,
            "BrowShy": d_sorrow * 0.85 * brow_mask,
            "BrowPlayful": d_angry * 0.55 * brow_mask,
            "BrowUp": d_surp * 0.85 * brow_mask,
            "Smile": (d_fun * 0.58 + d_joy * 0.45) * mouth_mask,
            "GrinOpen": (d_joy * 0.88 + d_a * 0.22) * mouth_mask,
            "MouthA": d_a * 0.78 * mouth_mask,
            "MouthO": d_o * 0.72 * mouth_mask,
            "MouthPout": (d_sorrow * 0.62 + d_u * 0.22) * mouth_mask,
            "Kiss": d_u * 0.85 * mouth_mask + sum_preset("blink") * 0.14 * eye_mask,
            "ShyBlush": d_sorrow * 0.35 * brow_mask + (d_fun * 0.36 + d_u * 0.18) * mouth_mask,
        }

        # Remove all existing non-Basis VRM targets cleanly
        for kb in list(sk.key_blocks)[1:]:
            face_obj.shape_key_remove(kb)

        for cname, delta in custom_morphs.items():
            new_kb = face_obj.shape_key_add(name=cname, from_mix=False)
            coords = (basis_coords + delta).reshape(-1)
            new_kb.data.foreach_set("co", coords)

    # Split Face cleanly into Face_Skin vs Face_Features using edit-mode selection
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = face_obj
    face_obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bm = bmesh.from_edit_mesh(face_obj.data)
    skin_mat_idxs = {i for i, m in enumerate(face_obj.data.materials) if m and "Face_00_SKIN" in m.name}
    for f in bm.faces:
        f.select = f.material_index not in skin_mat_idxs
    bmesh.update_edit_mesh(face_obj.data)
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")

    split_objs = [o for o in bpy.context.selected_objects if o.type == "MESH"]
    face_obj.name = f"{char_id}_Face_Skin"
    for so in split_objs:
        if so != face_obj:
            so.name = f"{char_id}_Face_Features"
            so.parent = arm
            so.matrix_parent_inverse.identity()

    # Clean unused material slots on both
    for obj in (bpy.data.objects.get(f"{char_id}_Face_Skin"), bpy.data.objects.get(f"{char_id}_Face_Features")):
        if not obj:
            continue
        used = {f.material_index for f in obj.data.polygons}
        for idx in reversed(range(len(obj.data.materials))):
            if idx not in used:
                obj.data.materials.pop(index=idx)
        for mod in obj.modifiers:
            if mod.type == "ARMATURE":
                mod.object = arm

    # Add sculpted cheek blush decal mesh hugging Face_Skin
    add_blush_overlay_mesh(arm, bpy.data.objects.get(f"{char_id}_Face_Skin"), char_id)

    return [o for o in bpy.data.objects if o.type == "MESH"]


def strip_occluded_skin_faces(char_id: str) -> None:
    """Remove inner Body_00_SKIN faces completely hidden under trousers/bodice so thin anime
    outlines never bleed through close-fitting clothing during poses."""
    for obj in bpy.data.objects:
        if obj.type != "MESH" or "Body" not in obj.name:
            continue
        skin_idxs = {i for i, m in enumerate(obj.data.materials) if m and "SKIN" in m.name}
        if not skin_idxs:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bm = bmesh.from_edit_mesh(obj.data)
        z_min = 0.14 if char_id == "ran" else 0.86
        z_max = 1.38
        x_lim = 0.162 if char_id == "ran" else 0.155
        to_del = [
            f
            for f in bm.faces
            if f.material_index in skin_idxs
            and all(z_min < v.co.z < z_max and abs(v.co.x) < x_lim for v in f.verts)
        ]
        if to_del:
            bmesh.ops.delete(bm, geom=to_del, context="FACES")
            bmesh.update_edit_mesh(obj.data)
        bpy.ops.object.mode_set(mode="OBJECT")


# ---------------------------------------------------------------------------
# Genshin Outerwear Craft for Small Ran (Caplet, Coattails, Cuffs, Vision) & Xian Vision
# ---------------------------------------------------------------------------

def skin_mesh_by_nearest_z(obj, arm, weights_fn):
    """Assign smooth vertex weights + Armature modifier referencing VRM bones."""
    vg_cache = {}
    for v in obj.data.vertices:
        wmap = weights_fn(v.co)
        total = sum(wmap.values())
        if total <= 1e-6:
            wmap = {"J_Bip_C_UpperChest": 1.0}
            total = 1.0
        for bname, w in wmap.items():
            if w <= 1e-4 or bname not in arm.data.bones:
                continue
            if bname not in vg_cache:
                vg_cache[bname] = obj.vertex_groups.new(name=bname)
            vg_cache[bname].add([v.index], w / total, "REPLACE")
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    obj.parent = arm
    obj.matrix_parent_inverse.identity()


def _make_ran_coat_texture() -> bpy.types.Image:
    """Paint a 256x256 Genshin Fontaine Aristocrat sapphire filigree + champagne-gold trim texture."""
    TEX_BAKED.mkdir(parents=True, exist_ok=True)
    w, h = 256, 256
    yy, xx = np.mgrid[0:h, 0:w]
    u = xx / (w - 1.0)  # 0 = front lapel edge, 1 = center back
    v = yy / (h - 1.0)  # 0 = top collar, 1 = lower coattail hem (flipud-matched PIL y)

    base_top = np.array([0.21, 0.43, 0.82], dtype=np.float32)
    base_bot = np.array([0.09, 0.18, 0.44], dtype=np.float32)
    t_vert = v[:, :, None] ** 0.85
    col = base_top * (1.0 - t_vert) + base_bot * t_vert

    # Diagonal tailored herringbone + subtle Fontaine fleur diamond damask along lower tail
    weave = (np.sin(u * 140.0 + v * 90.0) * 0.025 + np.cos(u * 90.0 - v * 140.0) * 0.02)[:, :, None]
    damask = (np.sin(u * math.tau * 8.0) * np.sin(v * math.tau * 10.0)) > 0.55
    lower_panel = v > 0.58
    col = col + weave + (damask & lower_panel)[:, :, None] * np.array([0.07, 0.13, 0.24], dtype=np.float32)

    # Fine cyan-teal accent border + thick champagne-gold filigree stripe near coattail & lapel
    gold = np.array([0.95, 0.78, 0.34], dtype=np.float32)
    aqua = np.array([0.36, 0.84, 0.96], dtype=np.float32)
    border_hem = (v > 0.88) & (v < 0.94)
    border_lapel = (u > 0.035) & (u < 0.085)
    inner_line = ((v >= 0.845) & (v <= 0.865)) | ((u >= 0.105) & (u <= 0.120))
    col[border_hem | border_lapel] = gold
    col[inner_line] = aqua

    rgb_u8 = np.clip(col * 255.0, 0, 255).astype(np.uint8)
    out_png = TEX_BAKED / "ran_genshin_coat_albedo.png"
    Image.fromarray(rgb_u8, "RGB").save(out_png, optimize=True)
    img = bpy.data.images.load(str(out_png))
    img.colorspace_settings.name = "sRGB"
    return img


def make_textured_pbr_mat(name: str, image: bpy.types.Image, roughness: float = 0.58, metallic: float = 0.05, double_sided: bool = False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.28
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mat.use_backface_culling = not double_sided
    return mat


def add_secondary_bone_chains(arm, specs: list[tuple[str, str, tuple[float, float, float], tuple[float, float, float]]]) -> None:
    """Append real deformed secondary physics bones (coat tails, capelet, ribbons) in normalized space."""
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    for bname, parent_name, head, tail in specs:
        if bname in eb:
            b = eb[bname]
        else:
            b = eb.new(bname)
        b.head = Vector(head)
        b.tail = Vector(tail)
        b.roll = 0.0
        b.use_deform = True
        b.use_connect = False
        if parent_name in eb:
            b.parent = eb[parent_name]
    bpy.ops.object.mode_set(mode="OBJECT")


def add_ran_genshin_costume(arm):
    """Add textured Fontaine sapphire swallowtail coat + asymmetric shoulder capelet,
    gold-buckled waist sash with ribbon tails, forearm hero bracers, and starburst Hydro Vision,
    with 12 secondary spring-bone chains for real flowing cape, coattails, and sash physics."""
    add_secondary_bone_chains(
        arm,
        [
            ("J_Sec_RanCapeL0", "J_Bip_C_UpperChest", (0.15, 0.055, 1.32), (0.18, 0.085, 1.22)),
            ("J_Sec_RanCapeL1", "J_Sec_RanCapeL0", (0.18, 0.085, 1.22), (0.19, 0.115, 1.12)),
            ("J_Sec_RanCapeBack0", "J_Bip_C_UpperChest", (0.10, 0.09, 1.32), (0.12, 0.12, 1.22)),
            ("J_Sec_RanCapeBack1", "J_Sec_RanCapeBack0", (0.12, 0.12, 1.22), (0.14, 0.15, 1.12)),
            ("J_Sec_RanCoatL0", "J_Bip_C_Hips", (0.11, 0.06, 1.03), (0.14, 0.09, 0.88)),
            ("J_Sec_RanCoatL1", "J_Sec_RanCoatL0", (0.14, 0.09, 0.88), (0.17, 0.13, 0.75)),
            ("J_Sec_RanCoatL2", "J_Sec_RanCoatL1", (0.17, 0.13, 0.75), (0.20, 0.16, 0.63)),
            ("J_Sec_RanCoatR0", "J_Bip_C_Hips", (-0.11, 0.06, 1.03), (-0.14, 0.09, 0.88)),
            ("J_Sec_RanCoatR1", "J_Sec_RanCoatR0", (-0.14, 0.09, 0.88), (-0.17, 0.13, 0.75)),
            ("J_Sec_RanCoatR2", "J_Sec_RanCoatR1", (-0.17, 0.13, 0.75), (-0.20, 0.16, 0.63)),
            ("J_Sec_RanSash0", "J_Bip_C_Hips", (-0.115, -0.02, 1.05), (-0.135, 0.01, 0.88)),
            ("J_Sec_RanSash1", "J_Sec_RanSash0", (-0.135, 0.01, 0.88), (-0.16, 0.05, 0.66)),
        ],
    )
    coat_img = _make_ran_coat_texture()
    mat_coat = make_textured_pbr_mat("ran_GenshinCoat", coat_img, roughness=0.58, metallic=0.06, double_sided=False)
    mat_lining = make_simple_pbr_mat("ran_CoatLining", (0.86, 0.18, 0.34, 1.0), roughness=0.70, double_sided=True)
    mat_sash = make_simple_pbr_mat("ran_GenshinSash", (0.96, 0.94, 0.90, 1.0), roughness=0.55, double_sided=True)
    mat_gold = make_simple_pbr_mat("ran_GenshinGold", (0.92, 0.72, 0.28, 1.0), roughness=0.22, metallic=0.90, double_sided=True)
    mat_vision = make_simple_pbr_mat(
        "ran_GenshinVision",
        (0.28, 0.90, 1.0, 1.0),
        roughness=0.10,
        metallic=0.1,
        emission=(0.24, 0.86, 1.0),
        emission_strength=1.75,
    )

    # 1. Flowing Swallowtail Coat with explicit UV mapping for painted filigree & borders
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.verify()
    rings = [
        (1.410, 0.120, 0.082, 0.105, 0.0, 0.0),
        (1.345, 0.188, 0.104, 0.120, 0.0, 0.006),
        (1.225, 0.156, 0.102, 0.118, 0.0, 0.010),
        (1.090, 0.140, 0.105, 0.112, 0.0, 0.012),
        (0.960, 0.158, 0.124, 0.116, 0.018, 0.024),
        (0.815, 0.186, 0.150, 0.125, 0.055, 0.044),
        (0.715, 0.205, 0.172, 0.132, 0.088, 0.062),
        (0.675, 0.214, 0.180, 0.135, 0.098, 0.068),
    ]
    left_grid, right_grid = [], []
    half_steps = 14
    for r_idx, (z, rx, ry_b, ry_f, split_gap, flare) in enumerate(rings):
        for side_sign, grid in ((1.0, left_grid), (-1.0, right_grid)):
            row = []
            for j in range(half_steps + 1):
                t = j / half_steps
                if side_sign > 0:
                    ang = -0.82 + t * (math.pi * 0.5 + 0.82)
                else:
                    ang = (math.pi + 0.82) - t * (math.pi * 0.5 + 0.82)
                cx = math.cos(ang) * rx
                sy = math.sin(ang)
                cy = sy * (ry_b if sy >= 0 else ry_f) - 0.010
                cy += (flare if sy >= 0 else -flare * 0.25) * (0.4 + 0.6 * t)
                cx += side_sign * flare * 0.50 * (1.0 - t)
                if split_gap > 0 and t > 0.68:
                    sp = ((t - 0.68) / 0.32) ** 1.4
                    cx += side_sign * split_gap * sp
                    cy += split_gap * 0.32 * sp
                zv = z
                if r_idx >= len(rings) - 2:
                    zv -= (0.042 if r_idx == len(rings) - 1 else 0.036) * math.sin(t * math.pi)
                row.append((bm.verts.new((cx, cy, zv)), t, r_idx / (len(rings) - 1)))
            grid.append(row)

    for grid, flip in ((left_grid, False), (right_grid, True)):
        for r in range(len(rings) - 1):
            for c in range(len(grid[0]) - 1):
                a, u0, v0 = grid[r][c]
                b, u1, v1 = grid[r][c + 1]
                c_v, u2, v2 = grid[r + 1][c + 1]
                d, u3, v3 = grid[r + 1][c]
                mat_i = 1 if (r == len(rings) - 2 or c == 0) else 0
                pts = ((a, u0, 1 - v0), (d, u3, 1 - v3), (c_v, u2, 1 - v2), (b, u1, 1 - v1)) if flip else ((a, u0, 1 - v0), (b, u1, 1 - v1), (c_v, u2, 1 - v2), (d, u3, 1 - v3))
                f = bm.faces.new([p[0] for p in pts])
                f.material_index = mat_i
                for loop, (_, uu, vv) in zip(f.loops, pts):
                    loop[uv_layer].uv = (uu, vv)

    for r in range(3):
        al, u0, v0 = left_grid[r][-1]
        bl, u1, v1 = left_grid[r + 1][-1]
        ar, u2, v2 = right_grid[r][-1]
        br, u3, v3 = right_grid[r + 1][-1]
        if (al.co - ar.co).length > 1e-4:
            f = bm.faces.new((al, bl, br, ar))
            f.material_index = 0
            for loop, uu, vv in zip(f.loops, (1, 1, 1, 1), (1 - v0, 1 - v1, 1 - v3, 1 - v2)):
                loop[uv_layer].uv = (uu, vv)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    coat_mesh = bpy.data.meshes.new("ran_GenshinCoat")
    bm.to_mesh(coat_mesh)
    bm.free()

    coat_obj = bpy.data.objects.new("ran_GenshinCoat", coat_mesh)
    bpy.context.collection.objects.link(coat_obj)
    coat_obj.data.materials.append(mat_coat)
    coat_obj.data.materials.append(mat_gold)
    coat_obj.data.materials.append(mat_lining)
    solid = coat_obj.modifiers.new("Solidify", "SOLIDIFY")
    solid.thickness = 0.008
    solid.offset = -1.0
    solid.material_offset = 2
    bpy.context.view_layer.objects.active = coat_obj
    bpy.ops.object.modifier_apply(modifier="Solidify")
    for p in coat_obj.data.polygons:
        p.use_smooth = True

    def coat_weights(co: Vector):
        z = co.z
        w = {}
        if abs(co.x) > 0.165 and z >= 1.29:
            side = "L" if co.x >= 0 else "R"
            w[f"J_Bip_{side}_Shoulder"] = 0.45
            w["J_Bip_C_UpperChest"] = 0.55
        elif z >= 1.27:
            w["J_Bip_C_UpperChest"] = 0.85
            w["J_Bip_C_Chest"] = 0.15
        elif z >= 1.18:
            w["J_Bip_C_Chest"] = 0.72
            w["J_Bip_C_UpperChest"] = 0.28
        elif z >= 1.07:
            w["J_Bip_C_Spine"] = 0.65
            w["J_Bip_C_Chest"] = 0.20
            w["J_Bip_C_Hips"] = 0.15
        else:
            side = "L" if co.x >= 0.0 else "R"
            leg_b = f"J_Bip_{side}_UpperLeg"
            c0, c1, c2 = f"J_Sec_RanCoat{side}0", f"J_Sec_RanCoat{side}1", f"J_Sec_RanCoat{side}2"
            t_tail = max(0.0, min(1.0, (1.07 - z) / 0.41))
            if t_tail < 0.35:
                f = t_tail / 0.35
                w["J_Bip_C_Hips"] = 1.0 - f * 0.75
                w[c0] = f * 0.75
            elif t_tail < 0.72:
                f = (t_tail - 0.35) / 0.37
                w[c0] = (1.0 - f) * 0.65
                w[c1] = 0.35 + f * 0.50
                w[leg_b] = 0.12 if co.y > -0.02 else 0.06
            else:
                f = (t_tail - 0.72) / 0.28
                w[c1] = (1.0 - f) * 0.55
                w[c2] = 0.35 + f * 0.55
                w[leg_b] = 0.10
        return w

    skin_mesh_by_nearest_z(coat_obj, arm, coat_weights)

    # Asymmetric Knightly Left-Shoulder Mantle as its own clean skinned cape object
    bm_cape = bmesh.new()
    uv_cape = bm_cape.loops.layers.uv.verify()
    cape_rings = [
        (1.400, 0.065, 0.195, 0.015, 0.075),
        (1.335, 0.055, 0.228, 0.045, 0.115),
        (1.225, 0.040, 0.225, 0.070, 0.145),
        (1.105, 0.055, 0.195, 0.085, 0.175),
    ]
    c_rows = []
    for ri, (z_c, x0, x1, y_f, y_b) in enumerate(cape_rings):
        row = []
        v_uv = 1.0 - ri / (len(cape_rings) - 1)
        for j in range(11):
            t = j / 10.0
            th = -math.pi * 0.42 + t * math.pi * 1.12
            px = x0 + (x1 - x0) * (0.45 + 0.55 * math.sin(th * 0.8 + 0.4))
            py = y_f * (1.0 - math.sin(t * math.pi * 0.5)) + y_b * math.sin(t * math.pi * 0.5)
            pz = z_c - math.sin(t * math.pi) * 0.026 * (ri / 3.0)
            row.append((bm_cape.verts.new((px, py, pz)), t, v_uv))
        c_rows.append(row)
    for r in range(len(c_rows) - 1):
        for c in range(10):
            pts = (c_rows[r][c], c_rows[r][c + 1], c_rows[r + 1][c + 1], c_rows[r + 1][c])
            f = bm_cape.faces.new([p[0] for p in pts])
            f.material_index = 1 if r == len(c_rows) - 2 else 0
            for loop, (_, uu, vv) in zip(f.loops, pts):
                loop[uv_cape].uv = (uu, vv)
    bmesh.ops.recalc_face_normals(bm_cape, faces=bm_cape.faces)
    cape_mesh = bpy.data.meshes.new("ran_ShoulderCape")
    bm_cape.to_mesh(cape_mesh)
    bm_cape.free()
    cape_obj = bpy.data.objects.new("ran_ShoulderCape", cape_mesh)
    bpy.context.collection.objects.link(cape_obj)
    cape_obj.data.materials.append(mat_coat)
    cape_obj.data.materials.append(mat_gold)
    cape_obj.data.materials.append(mat_lining)
    solid_c = cape_obj.modifiers.new("Solidify", "SOLIDIFY")
    solid_c.thickness = 0.006
    solid_c.offset = -1.0
    solid_c.material_offset = 2
    bpy.context.view_layer.objects.active = cape_obj
    bpy.ops.object.modifier_apply(modifier="Solidify")
    for p in cape_obj.data.polygons:
        p.use_smooth = True

    def cape_weights(co: Vector):
        z = co.z
        outer = max(0.0, min(1.0, (co.x - 0.11) / 0.08))
        w = {}
        if z >= 1.345:
            w["J_Bip_C_UpperChest"] = 0.72 - 0.15 * outer
            w["J_Sec_RanCapeL0"] = 0.28 * outer
            w["J_Sec_RanCapeBack0"] = 0.28 * (1.0 - outer) + 0.15 * outer
        elif z >= 1.22:
            f = (1.345 - z) / 0.125
            w["J_Bip_C_UpperChest"] = 0.25 * (1.0 - f)
            w["J_Sec_RanCapeL0"] = (0.45 + 0.25 * (1.0 - f)) * outer + 0.15 * (1.0 - outer)
            w["J_Sec_RanCapeL1"] = 0.35 * f * outer
            w["J_Sec_RanCapeBack0"] = (0.45 + 0.25 * (1.0 - f)) * (1.0 - outer)
            w["J_Sec_RanCapeBack1"] = 0.35 * f * (1.0 - outer)
        else:
            w["J_Sec_RanCapeL1"] = 0.75 * outer + 0.15 * (1.0 - outer)
            w["J_Sec_RanCapeL0"] = 0.20 * outer
            w["J_Sec_RanCapeBack1"] = 0.70 * (1.0 - outer)
            w["J_Sec_RanCapeBack0"] = 0.20 * (1.0 - outer)
        return w

    skin_mesh_by_nearest_z(cape_obj, arm, cape_weights)

    # Flowing Waist Sash Ribbons + Left Shoulder Epaulet Cord
    bm_s = bmesh.new()
    for sx, side_bias in ((-0.125, -0.03), (-0.100, -0.02)):
        pts_r = [
            (sx, -0.02 + side_bias, 1.055),
            (sx - 0.020, 0.015 + side_bias, 0.92),
            (sx - 0.035, 0.050 + side_bias, 0.78),
            (sx - 0.042, 0.072 + side_bias, 0.66),
        ]
        rows = []
        for pz_i, (px, py, pz) in enumerate(pts_r):
            w_r = 0.022 + pz_i * 0.008
            rows.append((bm_s.verts.new((px - w_r, py, pz)), bm_s.verts.new((px + w_r, py, pz))))
        for ri in range(len(rows) - 1):
            f = bm_s.faces.new((rows[ri][0], rows[ri][1], rows[ri + 1][1], rows[ri + 1][0]))
            f.material_index = 1 if ri == len(rows) - 2 else 0
    bmesh.ops.recalc_face_normals(bm_s, faces=bm_s.faces)
    sash_mesh = bpy.data.meshes.new("ran_GenshinSash")
    bm_s.to_mesh(sash_mesh)
    bm_s.free()
    sash_obj = bpy.data.objects.new("ran_GenshinSash", sash_mesh)
    bpy.context.collection.objects.link(sash_obj)
    sash_obj.data.materials.append(mat_sash)
    sash_obj.data.materials.append(mat_gold)

    def sash_weights(co: Vector):
        if co.z >= 1.01:
            return {"J_Bip_C_Hips": 0.75, "J_Bip_C_Spine": 0.25}
        if co.z >= 0.85:
            f = (1.01 - co.z) / 0.16
            return {"J_Bip_C_Hips": (1.0 - f) * 0.55, "J_Sec_RanSash0": 0.45 + f * 0.55}
        f = min(1.0, (0.85 - co.z) / 0.19)
        return {"J_Sec_RanSash0": max(0.10, 0.75 * (1.0 - f)), "J_Sec_RanSash1": 0.25 + f * 0.75}

    skin_mesh_by_nearest_z(sash_obj, arm, sash_weights)

    # 2. Forearm Hero Cuffs / Bracers snugly fitted around L/R forearms in T-pose
    bm_c = bmesh.new()
    for s, _side in ((1.0, "L"), (-1.0, "R")):
        for seg, (x0, x1, r0, r1, mi) in enumerate((
            (0.425, 0.440, 0.039, 0.037, 1),  # narrow gold rim
            (0.440, 0.515, 0.037, 0.034, 0),  # royal sapphire bracer body
            (0.515, 0.526, 0.034, 0.036, 1),  # gold wrist band
        )):
            n_rad = 14
            ring0, ring1 = [], []
            for k in range(n_rad):
                a = k / n_rad * math.tau
                ring0.append(bm_c.verts.new((s * x0, -0.010 + math.cos(a) * r0, 1.372 + math.sin(a) * r0)))
                ring1.append(bm_c.verts.new((s * x1, -0.010 + math.cos(a) * r1, 1.372 + math.sin(a) * r1)))
            for k in range(n_rad):
                nk = (k + 1) % n_rad
                verts = (ring0[k], ring1[k], ring1[nk], ring0[nk]) if s > 0 else (ring0[k], ring0[nk], ring1[nk], ring1[k])
                f = bm_c.faces.new(verts)
                f.material_index = mi
    bmesh.ops.recalc_face_normals(bm_c, faces=bm_c.faces)
    cuff_mesh = bpy.data.meshes.new("ran_HeroCuffs")
    bm_c.to_mesh(cuff_mesh)
    bm_c.free()
    cuff_obj = bpy.data.objects.new("ran_HeroCuffs", cuff_mesh)
    bpy.context.collection.objects.link(cuff_obj)
    cuff_obj.data.materials.append(mat_coat)
    cuff_obj.data.materials.append(mat_gold)
    for p in cuff_obj.data.polygons:
        p.use_smooth = True
    skin_mesh_by_nearest_z(
        cuff_obj,
        arm,
        lambda co: {"J_Bip_L_LowerArm": 1.0} if co.x >= 0 else {"J_Bip_R_LowerArm": 1.0},
    )

    # 3. Chest Fontaine Vision Gem + Gold Star Frame + Gold Brooch
    bm_v = bmesh.new()
    vx, vy, vz = 0.088, -0.108, 1.318
    # Gold diamond bezel (mi=0)
    top = bm_v.verts.new((vx, vy - 0.012, vz + 0.026))
    bot = bm_v.verts.new((vx, vy - 0.012, vz - 0.026))
    lft = bm_v.verts.new((vx + 0.024, vy - 0.008, vz))
    rgt = bm_v.verts.new((vx - 0.024, vy - 0.008, vz))
    back = bm_v.verts.new((vx, vy + 0.012, vz))
    frt = bm_v.verts.new((vx, vy - 0.022, vz))
    for tri in ((top, lft, frt), (lft, bot, frt), (bot, rgt, frt), (rgt, top, frt), (top, back, lft), (lft, back, bot), (bot, back, rgt), (rgt, back, top)):
        bm_v.faces.new(tri).material_index = 0
    # Inner glowing Azure gem core pushed slightly forward (mi=1)
    g_pts = [
        bm_v.verts.new((vx, vy - 0.014, vz + 0.016)),
        bm_v.verts.new((vx + 0.015, vy - 0.011, vz)),
        bm_v.verts.new((vx, vy - 0.014, vz - 0.016)),
        bm_v.verts.new((vx - 0.015, vy - 0.011, vz)),
        bm_v.verts.new((vx, vy - 0.026, vz)),
    ]
    for a, b in ((0, 1), (1, 2), (2, 3), (3, 0)):
        bm_v.faces.new((g_pts[a], g_pts[b], g_pts[4])).material_index = 1
    bmesh.ops.recalc_face_normals(bm_v, faces=bm_v.faces)
    vis_mesh = bpy.data.meshes.new("ran_VisionBrooch")
    bm_v.to_mesh(vis_mesh)
    bm_v.free()
    vis_obj = bpy.data.objects.new("ran_VisionBrooch", vis_mesh)
    bpy.context.collection.objects.link(vis_obj)
    vis_obj.data.materials.append(mat_gold)
    vis_obj.data.materials.append(mat_vision)
    skin_mesh_by_nearest_z(vis_obj, arm, lambda _co: {"J_Bip_C_UpperChest": 1.0})


def add_xian_vision_charm(arm):
    """Add a glowing Sakura-Rose Vision charm, back silk trailing waist ribbons with 4 secondary
    ribbon physics bones, and a delicate gold & rose-crystal Genshin hairline brooch."""
    add_secondary_bone_chains(
        arm,
        [
            ("J_Sec_XianRibL0", "J_Bip_C_Hips", (0.028, 0.095, 0.995), (0.068, 0.135, 0.820)),
            ("J_Sec_XianRibL1", "J_Sec_XianRibL0", (0.068, 0.135, 0.820), (0.112, 0.175, 0.625)),
            ("J_Sec_XianRibR0", "J_Bip_C_Hips", (-0.028, 0.095, 0.995), (-0.068, 0.135, 0.820)),
            ("J_Sec_XianRibR1", "J_Sec_XianRibR0", (-0.068, 0.135, 0.820), (-0.112, 0.175, 0.625)),
        ],
    )
    mat_gold = make_simple_pbr_mat("xian_VisionGold", (0.96, 0.80, 0.38, 1.0), roughness=0.22, metallic=0.90)
    mat_gem = make_simple_pbr_mat(
        "xian_VisionGem",
        (1.0, 0.46, 0.78, 1.0),
        roughness=0.10,
        metallic=0.05,
        emission=(1.0, 0.40, 0.76),
        emission_strength=1.70,
    )
    mat_ribbon = make_simple_pbr_mat("xian_SilkRibbon", (0.98, 0.68, 0.84, 1.0), roughness=0.52, double_sided=True)

    bm = bmesh.new()
    vx, vy, vz = -0.105, -0.075, 0.995
    top = bm.verts.new((vx, vy - 0.008, vz + 0.026))
    bot = bm.verts.new((vx, vy - 0.008, vz - 0.026))
    lft = bm.verts.new((vx + 0.022, vy - 0.004, vz))
    rgt = bm.verts.new((vx - 0.022, vy - 0.004, vz))
    frt = bm.verts.new((vx, vy - 0.021, vz))
    back = bm.verts.new((vx, vy + 0.008, vz))
    for tri in ((top, lft, frt), (lft, bot, frt), (bot, rgt, frt), (rgt, top, frt), (top, back, lft), (lft, back, bot), (bot, back, rgt), (rgt, back, top)):
        bm.faces.new(tri).material_index = 0
    g_pts = [
        bm.verts.new((vx, vy - 0.010, vz + 0.017)),
        bm.verts.new((vx + 0.015, vy - 0.007, vz)),
        bm.verts.new((vx, vy - 0.010, vz - 0.017)),
        bm.verts.new((vx - 0.015, vy - 0.007, vz)),
        bm.verts.new((vx, vy - 0.026, vz)),
    ]
    for a, b in ((0, 1), (1, 2), (2, 3), (3, 0)):
        bm.faces.new((g_pts[a], g_pts[b], g_pts[4])).material_index = 1

    # Twin trailing sakura silk ribbons from lower back waist bow
    for side in (-1.0, 1.0):
        pts_rib = [
            (side * 0.024, 0.095, 1.005),
            (side * 0.055, 0.125, 0.880),
            (side * 0.088, 0.155, 0.745),
            (side * 0.112, 0.175, 0.625),
        ]
        r_pairs = []
        for idx_r, (px, py, pz) in enumerate(pts_rib):
            hw = 0.016 + idx_r * 0.006
            r_pairs.append((bm.verts.new((px - hw, py, pz)), bm.verts.new((px + hw, py, pz))))
        for ri in range(len(r_pairs) - 1):
            f = bm.faces.new((r_pairs[ri][0], r_pairs[ri][1], r_pairs[ri + 1][1], r_pairs[ri + 1][0]))
            f.material_index = 0 if ri == len(r_pairs) - 2 else 2

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    vm = bpy.data.meshes.new("xian_VisionCharm")
    bm.to_mesh(vm)
    bm.free()
    vobj = bpy.data.objects.new("xian_VisionCharm", vm)
    bpy.context.collection.objects.link(vobj)
    vobj.data.materials.append(mat_gold)
    vobj.data.materials.append(mat_gem)
    vobj.data.materials.append(mat_ribbon)

    def xian_charm_weights(co: Vector):
        # Ribbon tail sits at y > 0.08 on the back waist; hip gem sits on front/side (y < 0.0)
        if co.y > 0.08:
            side = "L" if co.x >= 0.0 else "R"
            r0, r1 = f"J_Sec_XianRib{side}0", f"J_Sec_XianRib{side}1"
            if co.z >= 0.96:
                return {"J_Bip_C_Hips": 0.72, "J_Bip_C_Spine": 0.16, r0: 0.12}
            if co.z >= 0.80:
                f = (0.96 - co.z) / 0.16
                return {"J_Bip_C_Hips": max(0.05, 0.45 * (1.0 - f)), r0: 0.55 + f * 0.40}
            f = min(1.0, (0.80 - co.z) / 0.18)
            return {r0: max(0.10, 0.70 * (1.0 - f)), r1: 0.30 + f * 0.70}
        return {"J_Bip_C_Hips": 0.65, "J_Bip_C_Spine": 0.35}

    skin_mesh_by_nearest_z(vobj, arm, xian_charm_weights)

    # Delicate Gold + Rose Starlight Hairline Ornament mounted to Head bone
    bm_h = bmesh.new()
    hx, hy, hz = 0.072, -0.064, 1.505
    ct_f = bm_h.verts.new((hx + 0.008, hy - 0.016, hz))
    ct_b = bm_h.verts.new((hx - 0.005, hy + 0.005, hz))
    for k in range(5):
        a0 = (k / 5.0) * math.tau
        a1 = ((k + 0.5) / 5.0) * math.tau
        v_o = bm_h.verts.new((hx + math.cos(a0) * 0.022, hy - 0.004, hz + math.sin(a0) * 0.022))
        v_n = bm_h.verts.new((hx + math.cos(a1) * 0.010, hy - 0.006, hz + math.sin(a1) * 0.010))
        a_prev = ((k - 0.5) / 5.0) * math.tau
        v_p = bm_h.verts.new((hx + math.cos(a_prev) * 0.010, hy - 0.006, hz + math.sin(a_prev) * 0.010))
        bm_h.faces.new((ct_f, v_p, v_o)).material_index = 1 if k % 2 == 0 else 0
        bm_h.faces.new((ct_f, v_o, v_n)).material_index = 1 if k % 2 == 0 else 0
        bm_h.faces.new((ct_b, v_o, v_p)).material_index = 0
        bm_h.faces.new((ct_b, v_n, v_o)).material_index = 0
    bmesh.ops.recalc_face_normals(bm_h, faces=bm_h.faces)
    hm = bpy.data.meshes.new("xian_HairCrown")
    bm_h.to_mesh(hm)
    bm_h.free()
    hobj = bpy.data.objects.new("xian_HairCrown", hm)
    bpy.context.collection.objects.link(hobj)
    hobj.data.materials.append(mat_gold)
    hobj.data.materials.append(mat_gem)
    skin_mesh_by_nearest_z(hobj, arm, lambda _co: {"J_Bip_C_Head": 1.0})


# ---------------------------------------------------------------------------
# VRM Retargeted FK Solver + 17 NLA Clips
# ---------------------------------------------------------------------------

BONE_ALIAS = {
    "Hips": "J_Bip_C_Hips",
    "Spine": "J_Bip_C_Spine",
    "Chest": "J_Bip_C_Chest",
    "UpperChest": "J_Bip_C_UpperChest",
    "Neck": "J_Bip_C_Neck",
    "Head": "J_Bip_C_Head",
    "Shoulder.L": "J_Bip_L_Shoulder",
    "UpperArm.L": "J_Bip_L_UpperArm",
    "Forearm.L": "J_Bip_L_LowerArm",
    "Hand.L": "J_Bip_L_Hand",
    "Shoulder.R": "J_Bip_R_Shoulder",
    "UpperArm.R": "J_Bip_R_UpperArm",
    "Forearm.R": "J_Bip_R_LowerArm",
    "Hand.R": "J_Bip_R_Hand",
    "Thigh.L": "J_Bip_L_UpperLeg",
    "Shin.L": "J_Bip_L_LowerLeg",
    "Foot.L": "J_Bip_L_Foot",
    "Toe.L": "J_Bip_L_ToeBase",
    "Thigh.R": "J_Bip_R_UpperLeg",
    "Shin.R": "J_Bip_R_LowerLeg",
    "Foot.R": "J_Bip_R_Foot",
    "Toe.R": "J_Bip_R_ToeBase",
}


def compute_anatomical_rest_dirs(arm) -> dict[str, Vector]:
    """Since VRM glTF imports child-offset bones pointing +Z regardless of limb direction,
    record each limb bone's true anatomical direction (child.head - self.head) in rest space."""
    dirs = {}
    pairs = {
        "J_Bip_L_Shoulder": "J_Bip_L_UpperArm",
        "J_Bip_L_UpperArm": "J_Bip_L_LowerArm",
        "J_Bip_L_LowerArm": "J_Bip_L_Hand",
        "J_Bip_L_Hand": "J_Bip_L_Middle1",
        "J_Bip_R_Shoulder": "J_Bip_R_UpperArm",
        "J_Bip_R_UpperArm": "J_Bip_R_LowerArm",
        "J_Bip_R_LowerArm": "J_Bip_R_Hand",
        "J_Bip_R_Hand": "J_Bip_R_Middle1",
        "J_Bip_L_UpperLeg": "J_Bip_L_LowerLeg",
        "J_Bip_L_LowerLeg": "J_Bip_L_Foot",
        "J_Bip_L_Foot": "J_Bip_L_ToeBase",
        "J_Bip_R_UpperLeg": "J_Bip_R_LowerLeg",
        "J_Bip_R_LowerLeg": "J_Bip_R_Foot",
        "J_Bip_R_Foot": "J_Bip_R_ToeBase",
    }
    bones = arm.data.bones
    for b, c in pairs.items():
        if b in bones and c in bones:
            d = bones[c].head_local - bones[b].head_local
            if d.length > 1e-5:
                dirs[b] = d.normalized()
    return dirs


def apply_vrm_fk(arm, pb_map, anat_dirs: dict[str, Vector], rel_euler_map: dict, aim_map: dict | None = None, finger_curl: float = 0.28, skirt_map: dict | None = None) -> None:
    resolved_rel = {}
    for k, v in rel_euler_map.items():
        bk = BONE_ALIAS.get(k, k)
        if bk in arm.data.bones:
            resolved_rel[bk] = v
    # Split Chest rotation across Spine/Chest/UpperChest naturally
    if "J_Bip_C_Chest" in resolved_rel and "J_Bip_C_UpperChest" not in resolved_rel and "J_Bip_C_UpperChest" in arm.data.bones:
        rx, ry, rz = resolved_rel["J_Bip_C_Chest"]
        resolved_rel["J_Bip_C_Chest"] = (rx * 0.55, ry * 0.55, rz * 0.55)
        resolved_rel["J_Bip_C_UpperChest"] = (rx * 0.45, ry * 0.45, rz * 0.45)

    resolved_aim = {}
    if aim_map:
        for k, v in aim_map.items():
            bk = BONE_ALIAS.get(k, k)
            if bk in arm.data.bones:
                resolved_aim[bk] = v

    # Apply subtle finger curl in anatomical grip axis (L curls around -Y, R curls around +Y when arms in T-pose, which in world local bone identity is X/Y -> wait: in T-pose facing -Y, Left hand points +X, palm down -Z, fingers curl toward -Z around +Y!)
    if finger_curl != 0.0:
        for side, s in (("L", 1.0), ("R", -1.0)):
            for fname in ("Index", "Middle", "Ring", "Little"):
                for seg, w in ((1, 0.75), (2, 1.05), (3, 0.85)):
                    bn = f"J_Bip_{side}_{fname}{seg}"
                    if bn in arm.data.bones and bn not in resolved_rel:
                        resolved_rel[bn] = (0.0, s * finger_curl * w, 0.0)
            for seg, w in ((1, 0.35), (2, 0.45)):
                bn = f"J_Bip_{side}_Thumb{seg}"
                if bn in arm.data.bones and bn not in resolved_rel:
                    resolved_rel[bn] = (-finger_curl * 0.5 * w, s * finger_curl * 0.35 * w, 0.0)

    # Apply Victoria skirt & Ran coat/cape drapes with clean per-pose overrides
    effective_skirt = dict(skirt_map or {})
    effective_skirt.setdefault("J_Sec_RanCapeL", (0.12, 0.24, 0.0))
    effective_skirt.setdefault("J_Sec_RanCapeBack", (0.10, 0.0, 0.0))
    for prefix, ang_euler in effective_skirt.items():
        for bn in arm.data.bones.keys():
            if bn.startswith(prefix) and not bn.endswith("_end"):
                step_w = 0.5 if bn.endswith("0") else (0.35 if bn.endswith("1") else 0.25)
                resolved_rel[bn] = tuple(a * step_w for a in ang_euler)

    world_rot = {}
    for bone in arm.data.bones:
        bname = bone.name
        pb = pb_map[bname]
        R_rest = bone.matrix_local.to_3x3()
        pb.rotation_mode = "QUATERNION"

        if bname in resolved_rel:
            M_rel = Euler(resolved_rel[bname], "XYZ").to_matrix()
            Q_local = (R_rest.transposed() @ M_rel @ R_rest).to_quaternion()
            pb.rotation_quaternion = Q_local
        else:
            Q_local = pb.rotation_quaternion

        if bone.parent:
            R_parent_rest = bone.parent.matrix_local.to_3x3()
            R_parent_world = world_rot[bone.parent.name]
            R_cur = R_parent_world @ (R_parent_rest.transposed() @ R_rest @ Q_local.to_matrix())
        else:
            R_cur = R_rest @ Q_local.to_matrix()

        if bname in resolved_aim:
            target_dir = Vector(resolved_aim[bname]).normalized()
            v_rest = anat_dirs.get(bname, R_rest.col[1].normalized())
            q_swing = v_rest.rotation_difference(target_dir)
            R_desired = q_swing.to_matrix() @ R_rest
            if bone.parent:
                R_parent_rest = bone.parent.matrix_local.to_3x3()
                R_parent_world = world_rot[bone.parent.name]
                R_local = R_rest.transposed() @ R_parent_rest @ R_parent_world.transposed() @ R_desired
            else:
                R_local = R_rest.transposed() @ R_desired
            pb.rotation_quaternion = R_local.to_quaternion()
            R_cur = R_desired

        world_rot[bname] = R_cur


def add_nla_action(arm_obj, clip_name: str, n_frames: int, pose_fn, looped: bool = True) -> None:
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="POSE")
    action = bpy.data.actions.new(name=clip_name)
    if not arm_obj.animation_data:
        arm_obj.animation_data_create()
    arm_obj.animation_data.action = action

    step = 1 if n_frames <= 36 else 2
    frames = list(range(1, n_frames + 1, step))
    if frames[-1] != n_frames:
        frames.append(n_frames)
    for fr in frames:
        u = (fr - 1) / max(1, n_frames - 1)
        for pb in arm_obj.pose.bones:
            pb.rotation_mode = "QUATERNION"
            pb.location = (0.0, 0.0, 0.0)
            pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pose_fn(arm_obj.pose.bones, u)
        for pb in arm_obj.pose.bones:
            # Keyframe main body & custom secondary base pose (HairJoint / Eye left clean for live physics!)
            if pb.name.startswith("J_Bip_") or pb.name.startswith("J_Sec_"):
                if pb.name == "J_Bip_C_Hips":
                    pb.keyframe_insert(data_path="location", frame=fr)
                pb.keyframe_insert(data_path="rotation_quaternion", frame=fr)

    for fc in action.fcurves:
        for kf in fc.keyframe_points:
            kf.interpolation = "BEZIER"
            kf.handle_left_type = "AUTO_CLAMPED"
            kf.handle_right_type = "AUTO_CLAMPED"

    bpy.ops.object.mode_set(mode="OBJECT")
    track = arm_obj.animation_data.nla_tracks.new()
    track.name = clip_name
    strip = track.strips.new(clip_name, 1, action)
    strip.name = clip_name
    strip.action_frame_start = 1
    strip.action_frame_end = n_frames
    arm_obj.animation_data.action = None


def author_all_17_clips(arm, char_id: str) -> None:
    female = char_id == "xian"
    anat_dirs = compute_anatomical_rest_dirs(arm)

    def _walk_leg(phase: float):
        """Biomechanical double-knee human walk cycle with heel strike, loading yield, and toe roll-off."""
        ph = phase % math.tau
        s = math.sin(ph)
        c = math.cos(ph)
        # Negative rx = Thigh forward (-Y); positive rx = Thigh backward (+Y)
        thigh_x = -0.43 * s - 0.045 * math.sin(2.0 * ph) + (0.015 if female else 0.025)
        # Double-knee action: peak swing clearance (~0.78 rad) + soft loading response (~0.21 rad) after heel strike
        swing_bend = (max(0.0, c) ** 1.2) * (0.76 if female else 0.72)
        load_yield = math.exp(-((ph - 2.15) ** 2) / 0.36) * 0.21
        shin_x = 0.07 + swing_bend + load_yield
        # Ankle dorsiflexes up (-rx) before heel strike (ph ~ pi/2), plantarflexes (+rx) at late stance push-off (ph ~ 4.35)
        foot_x = (
            -0.17 * math.exp(-((ph - 1.55) ** 2) / 0.24)
            + 0.31 * math.exp(-((ph - 4.35) ** 2) / 0.32)
            - 0.04 * max(0.0, c)
        )
        # Toe roll-off bends toes up (-rx) as heel rises
        toe_x = -0.44 * math.exp(-((ph - 4.45) ** 2) / 0.30)
        thigh_z = (0.032 if female else 0.012) * s
        return thigh_x, shin_x, foot_x, toe_x, thigh_z

    def _walk_arm(side_sign: float, back_s: float, lag_s: float, wrist_s: float):
        """Contralateral arm swing (back_s > 0 => +Y backward) with forward elbow flex & overlapping wrist lag."""
        lat = (0.145 if female else 0.195) + (0.035 if back_s > 0 else -0.040 * (-back_s))
        uy = back_s * (0.37 if female else 0.43) + 0.03
        uz = -math.sqrt(max(0.25, 1.0 - lat * lat - uy * uy))
        # Elbow strictly flexes forward (-Y relative to upper arm), stronger on forward swing
        flex = (0.28 if female else 0.24) + max(0.0, -lag_s) * 0.30 + 0.05
        fy = uy - flex
        fx = lat * (0.74 if female else 0.86)
        fz = uz * 0.92
        hy = fy - 0.10 - 0.08 * (-wrist_s)
        hx = fx * 0.86
        hz = fz - 0.08
        return (side_sign * lat, uy, uz), (side_sign * fx, fy, fz), (side_sign * hx, hy, hz)

    def _eval_walk(pb, u, hold_side: str | None = None):
        t = u * math.tau
        s1 = math.sin(t)
        # Double-frequency harmonic vertical bounce + smooth lateral weight shift over stance foot
        bob_z = -0.018 * math.cos(2.0 * t) - 0.008
        shift_x = (0.024 if female else 0.014) * (-s1)
        hip_roll = (0.055 if female else 0.032) * (-s1)
        pb["J_Bip_C_Hips"].location = (shift_x, 0.0, bob_z)

        l_th, l_sh, l_ft, l_toe, l_thz = _walk_leg(t)
        r_th, r_sh, r_ft, r_toe, r_thz = _walk_leg(t + math.pi)

        # True contralateral arm swing: Left leg forward (s1 > 0) => Left arm swings backward (+Y, +sin(t-0.14))
        l_arm_b = math.sin(t - 0.14)
        l_arm_e = math.sin(t - 0.55)
        l_arm_w = math.sin(t - 0.90)
        r_arm_b = math.sin(t + math.pi - 0.14)
        r_arm_e = math.sin(t + math.pi - 0.55)
        r_arm_w = math.sin(t + math.pi - 0.90)

        uaL, faL, hdL = _walk_arm(1.0, l_arm_b, l_arm_e, l_arm_w)
        uaR, faR, hdR = _walk_arm(-1.0, r_arm_b, r_arm_e, r_arm_w)
        aim = {
            "UpperArm.L": uaL,
            "Forearm.L": faL,
            "Hand.L": hdL,
            "UpperArm.R": uaR,
            "Forearm.R": faR,
            "Hand.R": hdR,
        }
        sway_bounce = math.sin(2.0 * t) * 0.025
        if hold_side == "L":
            aim["UpperArm.L"] = (0.32, -0.20 + l_arm_b * 0.04, -0.82)
            aim["Forearm.L"] = (0.26, -0.36 + sway_bounce, -0.76)
            aim["Hand.L"] = (0.22, -0.44 + sway_bounce, -0.74)
        elif hold_side == "R":
            aim["UpperArm.R"] = (-0.32, -0.20 + r_arm_b * 0.04, -0.82)
            aim["Forearm.R"] = (-0.26, -0.36 + sway_bounce, -0.76)
            aim["Hand.R"] = (-0.22, -0.44 + sway_bounce, -0.74)

        lean_chest_z = 0.06 if hold_side == "L" else (-0.06 if hold_side == "R" else 0.0)
        glance_head_z = 0.12 if hold_side == "L" else (-0.12 if hold_side == "R" else 0.0)

        apply_vrm_fk(
            arm, pb, anat_dirs,
            {
                "Hips": (0.035, hip_roll, -0.078 * s1),
                "Spine": (0.030, -hip_roll * 0.65, 0.048 * s1),
                "Chest": (0.025, -hip_roll * 0.35, 0.062 * s1 + lean_chest_z),
                "Neck": (-0.020, 0.0, -0.045 * s1 + glance_head_z * 0.45),
                "Head": (-0.020 + math.cos(2.0 * t) * 0.014, 0.0, -0.030 * s1 + glance_head_z * 0.55),
                "Shoulder.L": (0.0, 0.07, -0.04 * l_arm_b),
                "Shoulder.R": (0.0, -0.07, 0.04 * r_arm_b),
                "Thigh.L": (l_th, 0.0, l_thz),
                "Shin.L": (l_sh, 0.0, 0.0),
                "Foot.L": (l_ft, 0.0, 0.0),
                "Toe.L": (l_toe, 0.0, 0.0),
                "Thigh.R": (r_th, 0.0, r_thz),
                "Shin.R": (r_sh, 0.0, 0.0),
                "Foot.R": (r_ft, 0.0, 0.0),
                "Toe.R": (r_toe, 0.0, 0.0),
            },
            aim,
            finger_curl=0.45 if hold_side else 0.32,
            skirt_map={
                "J_Sec_L_SkirtFront": (-0.30 - abs(s1) * 0.22, 0.0, 0.0),
                "J_Sec_R_SkirtFront": (-0.30 - abs(s1) * 0.22, 0.0, 0.0),
                "J_Sec_L_SkirtBack": (0.24 + abs(s1) * 0.16, 0.0, 0.0),
                "J_Sec_R_SkirtBack": (0.24 + abs(s1) * 0.16, 0.0, 0.0),
                "J_Sec_RanCoatL": (0.16 + max(0.0, -s1) * 0.18, -0.05, 0.0),
                "J_Sec_RanCoatR": (0.16 + max(0.0, s1) * 0.18, 0.05, 0.0),
                "J_Sec_RanCapeL": (0.24 + abs(s1) * 0.12, 0.18, 0.0),
                "J_Sec_RanCapeBack": (0.22 + abs(s1) * 0.12, 0.0, 0.0),
            },
        )

    def pose_idle(pb, u):
        t = u * math.tau
        breath = math.sin(t * 2.0)
        sway = math.sin(t)
        shift_w = math.sin(t) * (0.018 if female else 0.012)
        pb["J_Bip_C_Hips"].location = (shift_w, 0.0, breath * 0.005 - abs(sway) * 0.004)
        l_relax = max(0.0, sway)
        r_relax = max(0.0, -sway)
        apply_vrm_fk(
            arm, pb, anat_dirs,
            {
                "Hips": (0.0, sway * (0.032 if female else 0.016), sway * 0.030),
                "Spine": (0.012 + breath * 0.014, -sway * 0.018, 0.0),
                "Chest": (breath * 0.022, -sway * 0.012, -sway * 0.025),
                "Neck": (-0.01 + breath * 0.010, 0.02 * math.sin(t * 0.5), sway * 0.025),
                "Head": (-0.015 + breath * 0.012, 0.04 * sway, sway * 0.055),
                "Shoulder.L": (0.0, 0.08 + breath * 0.015, 0.0),
                "Shoulder.R": (0.0, -0.08 - breath * 0.015, 0.0),
                "Thigh.L": (-0.06 * l_relax, 0.0, 0.02),
                "Shin.L": (0.12 * l_relax + 0.03, 0.0, 0.0),
                "Thigh.R": (-0.06 * r_relax, 0.0, -0.02),
                "Shin.R": (0.12 * r_relax + 0.03, 0.0, 0.0),
            },
            {
                "UpperArm.L": (0.21, -0.03 + sway * 0.04, -0.96),
                "Forearm.L": (0.20, -0.20 + breath * 0.03, -0.93),
                "Hand.L": (0.12, -0.14, -0.97),
                "UpperArm.R": (-0.21, -0.03 - sway * 0.04, -0.96),
                "Forearm.R": (-0.20, -0.20 + breath * 0.03, -0.93),
                "Hand.R": (-0.12, -0.14, -0.97),
            },
            finger_curl=0.28,
            skirt_map={"J_Sec_L_SkirtFront": (-0.08, 0.0, 0.0), "J_Sec_R_SkirtFront": (-0.08, 0.0, 0.0)},
        )

    def pose_walk(pb, u):
        _eval_walk(pb, u, hold_side=None)

    def pose_run(pb, u):
        t = u * math.tau
        s1 = math.sin(t)
        c1 = math.cos(t)
        # Smooth harmonic bounce + slight lateral shift
        bob_z = -0.034 * math.cos(2.0 * t) - 0.014
        pb["J_Bip_C_Hips"].location = (-s1 * 0.014, 0.0, bob_z)
        # True contralateral arm pump (Left leg forward when s1 > 0 => Left arm pumps BACK +Y)
        armL_b = math.sin(t - 0.10)
        armR_b = -armL_b
        # Double knee & spring ankle for lively anime sprint
        l_th = -0.78 * s1 - 0.14
        r_th = 0.78 * s1 - 0.14
        l_sh = max(0.0, c1) * 0.96 + math.exp(-((t % math.tau - 2.1) ** 2) / 0.32) * 0.24 + 0.14
        r_sh = max(0.0, -c1) * 0.96 + math.exp(-(((t + math.pi) % math.tau - 2.1) ** 2) / 0.32) * 0.24 + 0.14
        l_ft = -0.20 * max(0.0, s1) + 0.34 * max(0.0, -s1)
        r_ft = -0.20 * max(0.0, -s1) + 0.34 * max(0.0, s1)
        apply_vrm_fk(
            arm, pb, anat_dirs,
            {
                "Hips": (0.14, -0.05 * s1, -s1 * 0.10),
                "Spine": (0.10, 0.03 * s1, s1 * 0.07),
                "Chest": (0.08, 0.02 * s1, s1 * 0.08),
                "Neck": (-0.09, 0.0, -s1 * 0.05),
                "Head": (-0.08, 0.0, -s1 * 0.03),
                "Shoulder.L": (0.0, 0.10, -0.06 * armL_b),
                "Shoulder.R": (0.0, -0.10, 0.06 * armR_b),
                "Thigh.L": (l_th, 0.0, 0.02 * s1),
                "Shin.L": (l_sh, 0.0, 0.0),
                "Foot.L": (l_ft, 0.0, 0.0),
                "Toe.L": (-0.42 * max(0.0, -s1), 0.0, 0.0),
                "Thigh.R": (r_th, 0.0, -0.02 * s1),
                "Shin.R": (r_sh, 0.0, 0.0),
                "Foot.R": (r_ft, 0.0, 0.0),
                "Toe.R": (-0.42 * max(0.0, s1), 0.0, 0.0),
            },
            {
                "UpperArm.L": (0.20, armL_b * 0.62 + 0.08, -0.78),
                "Forearm.L": (0.10, armL_b * 0.55 - 0.72, -0.35),
                "Hand.L": (0.06, armL_b * 0.48 - 0.78, -0.25),
                "UpperArm.R": (-0.20, armR_b * 0.62 + 0.08, -0.78),
                "Forearm.R": (-0.10, armR_b * 0.55 - 0.72, -0.35),
                "Hand.R": (-0.06, armR_b * 0.48 - 0.78, -0.25),
            },
            finger_curl=0.52,
            skirt_map={
                "J_Sec_L_SkirtFront": (-0.65 - abs(s1) * 0.25, 0.0, 0.0),
                "J_Sec_R_SkirtFront": (-0.65 - abs(s1) * 0.25, 0.0, 0.0),
                "J_Sec_L_SkirtBack": (0.48 + abs(s1) * 0.20, 0.0, 0.0),
                "J_Sec_R_SkirtBack": (0.48 + abs(s1) * 0.20, 0.0, 0.0),
                "J_Sec_RanCoatL": (0.34 + abs(s1) * 0.22, -0.10, 0.0),
                "J_Sec_RanCoatR": (0.34 + abs(s1) * 0.22, 0.10, 0.0),
                "J_Sec_RanCapeL": (0.50 + abs(s1) * 0.18, 0.14, 0.0),
                "J_Sec_RanCapeBack": (0.45 + abs(s1) * 0.18, 0.0, 0.0),
            },
        )

    def pose_sit(pb, u):
        breath = math.sin(u * math.tau)
        pb["J_Bip_C_Hips"].location = (0.0, 0.0, -0.025)
        apply_vrm_fk(
            arm, pb, anat_dirs,
            {
                "Hips": (-0.05, 0.0, 0.0),
                "Spine": (0.04 + breath * 0.015, 0.0, 0.0),
                "Chest": (0.03 + breath * 0.015, 0.0, 0.0),
                "Head": (0.02 + breath * 0.015, 0.0, 0.04 * math.sin(u * math.tau * 0.5)),
                "Shoulder.L": (0.0, 0.08, 0.0),
                "Shoulder.R": (0.0, -0.08, 0.0),
                "Thigh.L": (-1.48, 0.05 if female else 0.10, 0.0),
                "Shin.L": (1.46, 0.0, 0.0),
                "Foot.L": (0.06, 0.0, 0.0),
                "Thigh.R": (-1.48, -0.05 if female else -0.10, 0.0),
                "Shin.R": (1.46, 0.0, 0.0),
                "Foot.R": (0.06, 0.0, 0.0),
            },
            {
                "UpperArm.L": (0.14, -0.22, -0.88),
                "Forearm.L": (-0.28, -0.78, -0.30),
                "UpperArm.R": (-0.14, -0.22, -0.88),
                "Forearm.R": (0.28, -0.78, -0.30),
            },
            finger_curl=0.35,
            skirt_map={
                "J_Sec_L_SkirtFront": (-1.36, 0.0, 0.0),
                "J_Sec_R_SkirtFront": (-1.36, 0.0, 0.0),
                "J_Sec_L_SkirtSide": (-0.60, 0.0, -0.20),
                "J_Sec_R_SkirtSide": (-0.60, 0.0, 0.20),
                "J_Sec_L_SkirtBack": (0.28, 0.0, 0.0),
                "J_Sec_R_SkirtBack": (0.28, 0.0, 0.0),
            },
        )

    def pose_lie(pb, u):
        breath = math.sin(u * math.tau)
        apply_vrm_fk(
            arm, pb, anat_dirs,
            {
                "Spine": (breath * 0.012, 0.0, 0.0),
                "Chest": (breath * 0.015, 0.0, 0.0),
                "Head": (0.04, 0.0, 0.06 * math.sin(u * math.tau * 0.5)),
                "Shoulder.L": (0.0, 0.08, 0.0),
                "Shoulder.R": (0.0, -0.08, 0.0),
                "Thigh.L": (-0.12, 0.08, 0.0),
                "Shin.L": (0.22, 0.0, 0.0),
                "Thigh.R": (-0.12, -0.08, 0.0),
                "Shin.R": (0.22, 0.0, 0.0),
            },
            {
                "UpperArm.L": (0.18, -0.10, -0.90),
                "Forearm.L": (-0.25, -0.45, -0.55),
                "UpperArm.R": (-0.18, -0.10, -0.90),
                "Forearm.R": (0.25, -0.45, -0.55),
            },
            finger_curl=0.22,
            skirt_map={"J_Sec_L_SkirtFront": (-0.20, 0.0, 0.0), "J_Sec_R_SkirtFront": (-0.20, 0.0, 0.0)},
        )

    def make_hold_hand(hold_left: bool):
        def _fn(pb, u):
            sway = math.sin(u * math.tau) * 0.02
            aim = {
                "UpperArm.L": (0.16, -0.06, -0.94),
                "Forearm.L": (0.08, -0.18, -0.94),
                "UpperArm.R": (-0.16, -0.06, -0.94),
                "Forearm.R": (-0.08, -0.18, -0.94),
            }
            if hold_left:
                aim["UpperArm.L"] = (0.34, -0.22 + sway, -0.82)
                aim["Forearm.L"] = (0.28, -0.36 + sway, -0.78)
            else:
                aim["UpperArm.R"] = (-0.34, -0.22 + sway, -0.82)
                aim["Forearm.R"] = (-0.28, -0.36 + sway, -0.78)
            apply_vrm_fk(
                arm, pb, anat_dirs,
                {
                    "Chest": (0.02, 0.0, 0.06 if hold_left else -0.06),
                    "Head": (-0.02, 0.0, 0.14 if hold_left else -0.14),
                    "Shoulder.L": (0.0, 0.08, 0.0),
                    "Shoulder.R": (0.0, -0.08, 0.0),
                },
                aim,
                finger_curl=0.52,
            )
        return _fn

    def pose_hug(pb, u):
        t = u * math.tau
        embrace = math.sin(min(1.0, u * 3.0) * math.pi * 0.5)
        sway = math.sin(t) * 0.05
        pb["J_Bip_C_Hips"].location = (0.0, 0.0, -0.02 * embrace)
        apply_vrm_fk(
            arm, pb, anat_dirs,
            {
                "Hips": (0.05 * embrace, 0.0, sway),
                "Spine": (0.08 * embrace, 0.0, sway),
                "Chest": (0.10 * embrace, 0.0, -sway * 0.5),
                "Head": (0.08 * embrace, 0.14 * embrace, 0.18 * embrace if female else -0.18 * embrace),
                "Shoulder.L": (0.0, 0.06, -0.06),
                "Shoulder.R": (0.0, -0.06, 0.06),
            },
            {
                "UpperArm.L": (0.28, -0.78, 0.25),
                "Forearm.L": (-0.75, -0.35, 0.22),
                "UpperArm.R": (-0.28, -0.78, -0.20),
                "Forearm.R": (0.75, -0.35, -0.18),
            },
            finger_curl=0.45,
        )

    def pose_kiss(pb, u):
        lean = math.sin(min(1.0, u * 2.5) * math.pi * 0.5)
        tiptoe = 0.028 * lean if female else 0.0
        pb["J_Bip_C_Hips"].location = (0.0, -0.03 * lean, tiptoe)
        apply_vrm_fk(
            arm, pb, anat_dirs,
            {
                "Spine": (0.12 * lean, 0.0, 0.0),
                "Chest": (0.14 * lean, 0.0, 0.0),
                "Head": (-0.20 * lean if female else 0.14 * lean, 0.10 * lean, 0.10 * lean),
                "Shoulder.L": (0.0, 0.06, -0.05),
                "Shoulder.R": (0.0, -0.06, 0.05),
                "Foot.L": (-0.34 * lean if female else 0.0, 0.0, 0.0),
                "Foot.R": (-0.34 * lean if female else 0.0, 0.0, 0.0),
            },
            {
                "UpperArm.L": (0.18, -0.82, 0.18 if female else -0.10),
                "Forearm.L": (-0.65, -0.42, 0.35 if female else -0.05),
                "UpperArm.R": (-0.18, -0.82, 0.18 if female else -0.10),
                "Forearm.R": (0.65, -0.42, 0.35 if female else -0.05),
            },
            finger_curl=0.40,
        )

    def pose_pat_give(pb, u):
        t = u * math.tau
        pat = math.sin(t * 2.5) * 0.10
        apply_vrm_fk(
            arm, pb, anat_dirs,
            {
                "Spine": (0.06, 0.0, 0.0),
                "Chest": (0.06, 0.0, -0.08),
                "Head": (0.06, -0.05, 0.08),
                "Shoulder.L": (0.0, 0.08, 0.0),
                "Shoulder.R": (0.0, -0.04, 0.06),
            },
            {
                "UpperArm.L": (0.16, -0.06, -0.94),
                "Forearm.L": (0.08, -0.18, -0.94),
                "UpperArm.R": (-0.20, -0.78, 0.42 + pat * 0.5),
                "Forearm.R": (0.28, -0.76, 0.05 + pat),
            },
            finger_curl=0.20,
        )

    def pose_pat_recv(pb, u):
        t = u * math.tau
        nod = math.sin(t * 2.5) * 0.06
        pb["J_Bip_C_Hips"].location = (0.0, 0.0, -0.018)
        apply_vrm_fk(
            arm, pb, anat_dirs,
            {
                "Spine": (0.04, 0.0, 0.0),
                "Chest": (0.04, 0.0, 0.0),
                "Head": (0.15 + nod, 0.14, 0.12),
                "Shoulder.L": (0.0, 0.08, 0.0),
                "Shoulder.R": (0.0, -0.08, 0.0),
                "Thigh.L": (-0.12, 0.0, 0.0),
                "Shin.L": (0.24, 0.0, 0.0),
                "Thigh.R": (-0.12, 0.0, 0.0),
                "Shin.R": (0.24, 0.0, 0.0),
            },
            {
                "UpperArm.L": (0.22, -0.45, -0.68),
                "Forearm.L": (-0.75, -0.45, 0.28),
                "UpperArm.R": (-0.22, -0.45, -0.68),
                "Forearm.R": (0.75, -0.45, 0.28),
            },
            finger_curl=0.35,
        )

    def pose_dance(pb, u):
        t = u * math.tau
        s1 = math.sin(t)
        c1 = math.cos(t)
        pb["J_Bip_C_Hips"].location = (s1 * 0.04, 0.0, abs(c1) * 0.036)
        apply_vrm_fk(
            arm, pb, anat_dirs,
            {
                "Hips": (0.0, 0.0, s1 * 0.24),
                "Spine": (0.04, s1 * 0.08, -s1 * 0.12),
                "Chest": (0.05, 0.0, -s1 * 0.14),
                "Head": (-0.06, -s1 * 0.10, s1 * 0.12),
                "Thigh.L": (-max(0.0, s1) * 0.36, 0.10, 0.0),
                "Shin.L": (max(0.0, s1) * 0.52, 0.0, 0.0),
                "Thigh.R": (-max(0.0, -s1) * 0.36, -0.10, 0.0),
                "Shin.R": (max(0.0, -s1) * 0.52, 0.0, 0.0),
            },
            {
                "UpperArm.L": (0.68, -0.58 + s1 * 0.12, 0.22),
                "Forearm.L": (0.15, -0.75, 0.55),
                "UpperArm.R": (-0.68, -0.58 - s1 * 0.12, 0.22),
                "Forearm.R": (-0.15, -0.75, 0.55),
            },
            finger_curl=0.22,
            skirt_map={
                "J_Sec_L_SkirtFront": (-0.50, 0.0, 0.0),
                "J_Sec_R_SkirtFront": (-0.50, 0.0, 0.0),
                "J_Sec_L_SkirtSide": (0.0, 0.0, -0.45),
                "J_Sec_R_SkirtSide": (0.0, 0.0, 0.45),
                "J_Sec_L_SkirtBack": (0.45, 0.0, 0.0),
                "J_Sec_R_SkirtBack": (0.45, 0.0, 0.0),
            },
        )

    def pose_heart(pb, u):
        t = u * math.tau
        lift = math.sin(min(1.0, u * 3.0) * math.pi * 0.5)
        pb["J_Bip_C_Hips"].location = (0.0, 0.0, math.sin(t) * 0.015)
        apply_vrm_fk(
            arm, pb, anat_dirs,
            {
                "Chest": (-0.05 * lift, 0.0, 0.0),
                "Head": (0.02, 0.08 * lift, 0.06 * math.sin(t * 0.5)),
            },
            {
                "UpperArm.L": (0.62, -0.25, 0.72),
                "Forearm.L": (-0.75, -0.18, 0.62),
                "UpperArm.R": (-0.62, -0.25, 0.72),
                "Forearm.R": (0.75, -0.18, 0.62),
            },
            finger_curl=0.18,
        )

    def pose_carry_hold(pb, u):
        breath = math.sin(u * math.tau)
        pb["J_Bip_C_Hips"].location = (0.0, 0.0, -0.028 + breath * 0.005)
        apply_vrm_fk(
            arm, pb, anat_dirs,
            {
                "Spine": (-0.10, 0.0, 0.0),
                "Chest": (-0.06 + breath * 0.015, 0.0, 0.0),
                "Head": (0.10, -0.08, -0.14),
                "Shoulder.L": (0.0, 0.06, -0.06),
                "Shoulder.R": (0.0, -0.06, 0.06),
                "Thigh.L": (-0.16, 0.10, 0.0),
                "Shin.L": (0.24, 0.0, 0.0),
                "Thigh.R": (-0.16, -0.10, 0.0),
                "Shin.R": (0.24, 0.0, 0.0),
            },
            {
                "UpperArm.L": (0.28, -0.82, -0.22),
                "Forearm.L": (-0.62, -0.68, 0.16),
                "UpperArm.R": (-0.28, -0.82, -0.26),
                "Forearm.R": (0.62, -0.68, 0.16),
            },
            finger_curl=0.42,
        )

    def pose_carry_pose(pb, u):
        breath = math.sin(u * math.tau)
        apply_vrm_fk(
            arm, pb, anat_dirs,
            {
                "Spine": (-0.04, 0.0, -0.05),
                "Chest": (-0.03 + breath * 0.015, 0.0, -0.06),
                "Head": (0.04, 0.10, 0.16),
                "Shoulder.L": (0.0, 0.06, 0.0),
                "Shoulder.R": (0.0, -0.06, 0.0),
                "Thigh.L": (-0.50, 0.06, 0.08),
                "Shin.L": (0.56, 0.0, 0.0),
                "Foot.L": (0.18, 0.0, 0.0),
                "Thigh.R": (-0.42, -0.04, 0.08),
                "Shin.R": (0.48, 0.0, 0.0),
                "Foot.R": (0.18, 0.0, 0.0),
            },
            {
                "UpperArm.L": (0.28, -0.68, 0.20),
                "Forearm.L": (-0.62, -0.36, 0.38),
                "UpperArm.R": (-0.16, -0.42, -0.45),
                "Forearm.R": (0.48, -0.32, -0.18),
            },
            finger_curl=0.35,
            skirt_map={
                "J_Sec_L_SkirtFront": (-0.58, 0.0, 0.0),
                "J_Sec_R_SkirtFront": (-0.58, 0.0, 0.0),
                "J_Sec_L_SkirtSide": (-0.34, 0.0, -0.22),
                "J_Sec_R_SkirtSide": (-0.34, 0.0, 0.22),
                "J_Sec_L_SkirtBack": (0.20, 0.0, 0.0),
                "J_Sec_R_SkirtBack": (0.20, 0.0, 0.0),
            },
        )

    def pose_hop(pb, u):
        hop = math.sin(u * math.pi)
        pb["J_Bip_C_Hips"].location = (0.0, 0.0, hop * 0.18)
        apply_vrm_fk(
            arm, pb, anat_dirs,
            {
                "Chest": (-0.08 * hop, 0.0, 0.0),
                "Head": (-0.08 * hop, 0.0, 0.08 * math.sin(u * math.tau)),
                "Thigh.L": (-0.36 * hop, 0.0, 0.0),
                "Shin.L": (0.64 * hop, 0.0, 0.0),
                "Thigh.R": (-0.36 * hop, 0.0, 0.0),
                "Shin.R": (0.64 * hop, 0.0, 0.0),
            },
            {
                "UpperArm.L": (0.64, -0.25, 0.72 * hop),
                "Forearm.L": (0.28, -0.20, 0.90),
                "UpperArm.R": (-0.64, -0.25, 0.72 * hop),
                "Forearm.R": (-0.28, -0.20, 0.90),
            },
            finger_curl=0.18,
        )

    def pose_wave(pb, u):
        t = u * math.tau
        w = math.sin(t * 2.0) * 0.24
        apply_vrm_fk(
            arm, pb, anat_dirs,
            {
                "Spine": (0.02, 0.0, -0.02),
                "Chest": (0.02, -0.05, 0.0),
                "Neck": (-0.02, 0.04, 0.05),
                "Head": (-0.03, 0.08, 0.08),
                "Shoulder.L": (0.0, 0.08, 0.0),
                "Shoulder.R": (0.0, -0.04, 0.05),
            },
            {
                "UpperArm.L": (0.16, -0.06, -0.94),
                "Forearm.L": (0.08, -0.18, -0.94),
                "UpperArm.R": (-0.75, -0.25, 0.56),
                "Forearm.R": (-0.15 + w * 0.7, -0.22, 0.94),
                "Hand.R": (-0.12 + w * 0.9, -0.22, 0.96),
            },
            finger_curl=0.10,
        )

    clips = [
        ("Idle", 60, pose_idle, True),
        ("Walk", 32, pose_walk, True),
        ("Run", 24, pose_run, True),
        ("Sit", 36, pose_sit, True),
        ("Lie", 36, pose_lie, True),
        ("HoldHand_L", 24, make_hold_hand(True), True),
        ("HoldHand_R", 24, make_hold_hand(False), True),
        ("Walk_HoldHand_L", 32, lambda pb, u: _eval_walk(pb, u, hold_side="L"), True),
        ("Walk_HoldHand_R", 32, lambda pb, u: _eval_walk(pb, u, hold_side="R"), True),
        ("Hug", 48, pose_hug, False),
        ("Kiss", 48, pose_kiss, False),
        ("Pat_Give", 48, pose_pat_give, False),
        ("Pat_Recv", 48, pose_pat_recv, False),
        ("Dance", 48, pose_dance, True),
        ("Heart", 48, pose_heart, False),
        ("Carry_Hold", 32, pose_carry_hold, True),
        ("Carry_Pose", 32, pose_carry_pose, True),
        ("Hop", 24, pose_hop, False),
        ("Wave", 32, pose_wave, True),
    ]

    for cname, nf, pfn, looped in clips:
        add_nla_action(arm, cname, nf, pfn, looped=looped)

    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.location = (0.0, 0.0, 0.0)
        pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
    bpy.ops.object.mode_set(mode="OBJECT")


def export_glb(filepath: Path, objects: list) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(filepath),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=88,
        export_texcoords=True,
        export_colors=True,
        export_skins=True,
        export_morph=True,
        export_morph_normal=False,
        export_animations=True,
        export_nla_strips=True,
        export_def_bones=True,
        export_optimize_animation_size=True,
    )


def build_character(char_id: str, out_glb: Path) -> None:
    reset_scene()
    cfg = VRM_SOURCES[char_id]
    vrm_path = VRM_CACHE / cfg["file"]
    if not vrm_path.exists():
        raise FileNotFoundError(f"Missing cached VRM file: {vrm_path}")

    vrm_json = parse_vrm_json(vrm_path)
    bpy.ops.import_scene.gltf(filepath=str(vrm_path))

    bake_and_rebuild_vrm_materials(char_id, vrm_json)
    arm = normalize_vrm_scene(cfg["target_height"])
    consolidate_face_morphs_and_split(arm, char_id, vrm_json)
    strip_occluded_skin_faces(char_id)

    if char_id == "ran":
        add_ran_genshin_costume(arm)
    else:
        add_xian_vision_charm(arm)

    author_all_17_clips(arm, char_id)
    export_objs = [arm] + [o for o in bpy.data.objects if o.type == "MESH"]
    export_glb(out_glb, export_objs)
    print(f"[vrm->glb] Exported {char_id}: {out_glb} ({out_glb.stat().st_size // 1024} KB)")


def render_qa_sheet(xian_glb: Path, ran_glb: Path, out_png: Path) -> None:
    """Render both exported GLBs side-by-side in Idle & Heart poses using EEVEE."""
    reset_scene()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 640
    scene.view_settings.view_transform = "Standard"

    world = bpy.data.worlds.new("QAWorld")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.48, 0.62, 0.78, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.75

    sun = bpy.data.lights.new("Sun", type="SUN")
    sun.energy = 1.65
    sun_o = bpy.data.objects.new("Sun", sun)
    bpy.context.collection.objects.link(sun_o)
    sun_o.rotation_euler = (math.radians(52), 0.0, math.radians(-28))

    bpy.ops.import_scene.gltf(filepath=str(xian_glb))
    xian_objs = list(bpy.context.selected_objects)
    for o in xian_objs:
        if o.parent is None:
            o.location.x = -0.38

    bpy.ops.import_scene.gltf(filepath=str(ran_glb))
    ran_objs = list(bpy.context.selected_objects)
    for o in ran_objs:
        if o.parent is None:
            o.location.x = 0.38

    # Evaluate Idle frame 12 (clear active action and solo Idle track cleanly)
    for arm in [o for o in bpy.data.objects if o.type == "ARMATURE"]:
        if arm.animation_data:
            arm.animation_data.action = None
            for tr in arm.animation_data.nla_tracks:
                tr.mute = tr.name != "Idle"
                if tr.name == "Idle":
                    tr.is_solo = True
    scene.frame_set(12)

    cam_d = bpy.data.cameras.new("Cam")
    cam_o = bpy.data.objects.new("Cam", cam_d)
    bpy.context.collection.objects.link(cam_o)
    cam_o.location = (0.0, -3.55, 0.88)
    cam_o.rotation_euler = (math.radians(89), 0.0, 0.0)
    scene.camera = cam_o

    out_png.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", type=Path, default=Path("site/assets/models"))
    parser.add_argument("--render-qa", type=Path, default=None)
    args = parser.parse_args(argv)
    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    xian_glb = out_dir / "couple_xian.glb"
    ran_glb = out_dir / "couple_ran.glb"
    build_character("xian", xian_glb)
    build_character("ran", ran_glb)

    if args.render_qa:
        render_qa_sheet(xian_glb, ran_glb, args.render_qa.resolve())


if __name__ == "__main__":
    main()
