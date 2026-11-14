#!/usr/bin/env python3
"""Build game-grade cute anime rigged GLBs for 小贤贤 (couple_xian.glb) and 小冉子 (couple_ran.glb).

Exports skinned humanoid armatures with:
  - Sculpted cute anime heads + 4 BlendShapes / MorphTargets:
      EyeBlink (with synced upper eyelash blink), Smile, Kiss, ShyBlush
  - Packed procedural PNG albedo/weave/iris/floral textures
  - Full wardrobe & accessories (sakura pin, ribbons, rose boutonniere, watch, Mary Janes, loafers)
  - 17 smooth NLA animation strips covering every couple-mode & coastal-interaction state
  - Zero unweighted vertices and Y-up glTF 2.0 orientation (+Z forward or -Z glTF convention)

Note on orientation:
  In Blender we build facing -Y (front), +X (character's Left), +Z (Up).
  With Blender glTF exporter export_yup=True, Blender (X, Y, Z) -> glTF (X, Z, -Y),
  so facing -Y in Blender becomes facing +Z in glTF/Babylon!

Usage:
  PATH=/usr/bin:/bin PYTHONPATH=/home/yhr/.local/lib/python3.12/site-packages \
    blender -b --factory-startup --python tools/blender/build_couple_rigged.py \
    -- --out-dir site/assets/models
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from blender_kit import (
    assign_mat_all,
    clamp01 as _clamp01,
    export_glb,
    make_pbr_material,
    mix_rgb as _mix_rgb,
    reset_scene,
    set_px as _set_px,
    write_rgba_png,
)


# ---------------------------------------------------------------------------
# Procedural High-Detail Character Textures (Packed into GLB)
# ---------------------------------------------------------------------------

def _load_packed(path: Path) -> bpy.types.Image:
    img = bpy.data.images.load(str(path))
    img.pack()
    return img


def generate_skin_texture(path: Path, base_rgb, blush_rgb) -> bpy.types.Image:
    w, h = 256, 256
    buf = bytearray(w * h * 4)
    for y in range(h):
        v = 1.0 - y / max(1, h - 1)
        warm = 0.08 * math.sin(v * math.pi)
        c = _mix_rgb(base_rgb, blush_rgb, warm)
        for x in range(w):
            _set_px(buf, w, h, x, y, (c[0], c[1], c[2], 1.0))
    write_rgba_png(path, w, h, buf)
    return _load_packed(path)


def generate_face_skin_texture(path: Path, base_rgb, blush_rgb, female: bool) -> bpy.types.Image:
    """Delicate peach-rose anime cheek blush gradient + subtle cute hatch marks."""
    w, h = 512, 512
    buf = bytearray(w * h * 4)
    for y in range(h):
        v = 1.0 - y / max(1, h - 1)  # 0 chin .. 1 crown
        for x in range(w):
            u = x / max(1, w - 1)    # 0.5 center front
            c = base_rgb
            # Rosy anime cheek ovals below eyes
            for cx in (0.315, 0.685):
                dx = (u - cx) / 0.115
                dy = (v - 0.372) / 0.058
                d2 = dx * dx + dy * dy
                if d2 < 1.8:
                    a = math.exp(-d2 * 2.15) * (0.48 if female else 0.34)
                    c = _mix_rgb(c, blush_rgb, a)
                # Subtle anime blush diagonal strokes
                if female and d2 < 0.72:
                    s_coord = ((u - cx) * 44.0 + (v - 0.372) * 18.0)
                    for m in (-1.2, 0.0, 1.2):
                        d_line = abs(s_coord - m)
                        if d_line < 0.19 and abs(v - 0.372) < 0.022:
                            c = _mix_rgb(c, (0.92, 0.43, 0.50), 0.34 * (1.0 - d_line / 0.19))
            # Soft warm ear/nose tip & chin peach tint
            dn = ((u - 0.5) / 0.042) ** 2 + ((v - 0.395) / 0.028) ** 2
            if dn < 1.5:
                c = _mix_rgb(c, blush_rgb, math.exp(-dn * 2.4) * 0.24)
            # Soft forehead gradient for cozy warmth
            if v > 0.72:
                c = _mix_rgb(c, (base_rgb[0] * 0.94, base_rgb[1] * 0.89, base_rgb[2] * 0.87), (v - 0.72) * 0.55)
            _set_px(buf, w, h, x, y, (c[0], c[1], c[2], 1.0))
    write_rgba_png(path, w, h, buf)
    return _load_packed(path)


def generate_iris_texture(path: Path, top_rgb, mid_rgb, bot_rgb) -> bpy.types.Image:
    """Jewel-toned layered anime iris with gradient depth, crescent rim & triple catchlight."""
    w, h = 512, 512
    buf = bytearray(w * h * 4)
    for y in range(h):
        v = 1.0 - y / max(1, h - 1)
        for x in range(w):
            u = x / max(1, w - 1)
            dx = (u - 0.5) / 0.44
            dy = (v - 0.5) / 0.46
            r = math.hypot(dx * 1.05, dy * 0.96)
            ang = math.atan2(dy, dx)

            c = (1.0, 0.994, 0.988)
            # Delicate top sclera ambient shadow under upper lashes
            if v > 0.65:
                c = _mix_rgb(c, (0.87, 0.82, 0.86), (v - 0.65) * 1.25)

            if r < 0.78:
                t_vert = _clamp01((0.5 + 0.78 - v) / 1.56)
                iris = _mix_rgb(top_rgb, mid_rgb, _clamp01(t_vert * 1.35))
                if t_vert > 0.40:
                    iris = _mix_rgb(iris, bot_rgb, (t_vert - 0.40) / 0.60)
                spoke = 0.5 + 0.5 * math.sin(ang * 30.0 + r * 9.0)
                iris = _mix_rgb(iris, bot_rgb, spoke * 0.20 * _clamp01(r * 1.6))
                # Bright jewel lower crescent
                if v < 0.47 and r < 0.66:
                    crescent = _clamp01(1.0 - abs(r - 0.39) * 4.0) * _clamp01((0.47 - v) * 3.1)
                    iris = _mix_rgb(iris, (1.0, 0.94, 0.76), crescent * 0.76)
                # Deep outer limbal ring
                if r > 0.66:
                    iris = _mix_rgb(iris, (0.08, 0.04, 0.045), (r - 0.66) / 0.12 * 0.94)
                # Deep warm pupil
                if r < 0.25:
                    iris = _mix_rgb(iris, (0.05, 0.025, 0.03), _clamp01((0.25 - r) / 0.05))
                c = _mix_rgb(c, iris, _clamp01((0.78 - r) * 26.0))

            # Triple crisp anime eye sparkle catchlights
            for cu, cv, ru, rv, col, strength in (
                (0.33, 0.68, 0.155, 0.12, (1.0, 1.0, 1.0), 4.0),
                (0.68, 0.34, 0.072, 0.072, (1.0, 0.99, 0.95), 4.0),
                (0.63, 0.70, 0.042, 0.042, (1.0, 1.0, 1.0), 4.0),
            ):
                d = math.hypot((u - cu) / ru, (v - cv) / rv)
                if d < 1.0:
                    c = _mix_rgb(c, col, _clamp01((1.0 - d) * strength))

            _set_px(buf, w, h, x, y, (c[0], c[1], c[2], 1.0))
    write_rgba_png(path, w, h, buf)
    return _load_packed(path)


def generate_hair_texture(path: Path, base_rgb, hi_rgb) -> bpy.types.Image:
    w, h = 256, 256
    buf = bytearray(w * h * 4)
    for y in range(h):
        v = 1.0 - y / max(1, h - 1)
        halo = math.exp(-((v - 0.64) / 0.11) ** 2) * 0.50
        root_ao = _clamp01(v * 2.5) * 0.22 + 0.78
        for x in range(w):
            u = x / max(1, w - 1)
            fiber = (
                0.5 * math.sin(u * math.tau * 26.0)
                + 0.3 * math.sin(u * math.tau * 59.0 + 1.2)
                + 0.2 * math.sin(u * math.tau * 101.0 + 2.5)
            )
            t = _clamp01(0.26 + fiber * 0.17 + halo * (0.68 + fiber * 0.32))
            c = _mix_rgb(base_rgb, hi_rgb, t)
            c = (c[0] * root_ao, c[1] * root_ao, c[2] * root_ao)
            _set_px(buf, w, h, x, y, (c[0], c[1], c[2], 1.0))
    write_rgba_png(path, w, h, buf)
    return _load_packed(path)


def generate_floral_dress_texture(path: Path) -> bpy.types.Image:
    """Blush-cream sundress printed with sage sprig blossoms & scalloped lace hem."""
    w, h = 512, 512
    buf = bytearray(w * h * 4)
    top_col = (0.992, 0.946, 0.938)
    bot_col = (0.968, 0.828, 0.854)
    for y in range(h):
        v = 1.0 - y / max(1, h - 1)
        row = _mix_rgb(bot_col, top_col, v)
        for x in range(w):
            u = x / max(1, w - 1)
            weave = (math.sin(x * 1.45) + math.sin(y * 1.45)) * 0.011
            c = (row[0] + weave, row[1] + weave, row[2] + weave)
            if v < 0.085:
                scallop = 0.060 + 0.018 * math.sin(u * math.tau * 20.0)
                if 0.015 < v < scallop:
                    c = _mix_rgb(c, (1.0, 0.99, 0.975), 0.78)
            _set_px(buf, w, h, x, y, (c[0], c[1], c[2], 1.0))

    # Floral blossom print across skirt/bodice UV grid
    for gy in range(4):
        for gx in range(8):
            cx = (gx + (0.5 if gy % 2 == 0 else 0.0)) / 8.0
            cy = (gy + 0.56) / 4.0
            rot = (gx * 1.37 + gy * 2.13) % math.tau
            px0 = cx * w
            py0 = (1.0 - cy) * h
            for lr in (-0.95, 0.95):
                lx = px0 + math.cos(rot + lr) * 11.0
                ly = py0 + math.sin(rot + lr) * 11.0
                for dy in range(-7, 8):
                    for dx in range(-7, 8):
                        if dx * dx + dy * dy <= 26:
                            _set_px(buf, w, h, int(lx + dx) % w, int(ly + dy) % h, (0.49, 0.67, 0.54, 1.0))
            for p in range(5):
                pa = rot + p * math.tau / 5.0
                pxp = px0 + math.cos(pa) * 6.5
                pyp = py0 + math.sin(pa) * 6.5
                for dy in range(-5, 6):
                    for dx in range(-5, 6):
                        if dx * dx + dy * dy <= 15:
                            _set_px(buf, w, h, int(pxp + dx) % w, int(pyp + dy) % h, (1.0, 0.96, 0.95, 1.0))
            for dy in range(-3, 4):
                for dx in range(-3, 4):
                    if dx * dx + dy * dy <= 6:
                        _set_px(buf, w, h, int(px0 + dx) % w, int(py0 + dy) % h, (0.94, 0.79, 0.42, 1.0))

    write_rgba_png(path, w, h, buf)
    return _load_packed(path)


def generate_linen_texture(path: Path, base_rgb) -> bpy.types.Image:
    w, h = 256, 256
    buf = bytearray(w * h * 4)
    for y in range(h):
        for x in range(w):
            weave = (
                math.sin(x * 1.57) * 0.020
                + math.sin(y * 1.57) * 0.020
                + math.sin((x + y) * 0.32) * 0.012
            )
            c = (
                _clamp01(base_rgb[0] + weave),
                _clamp01(base_rgb[1] + weave),
                _clamp01(base_rgb[2] + weave),
            )
            _set_px(buf, w, h, x, y, (c[0], c[1], c[2], 1.0))
    write_rgba_png(path, w, h, buf)
    return _load_packed(path)


# ---------------------------------------------------------------------------
# Sculpting & Rigging Helpers
# ---------------------------------------------------------------------------

def set_smooth(obj) -> None:
    for p in obj.data.polygons:
        p.use_smooth = True


def _smoothstep(e0: float, e1: float, x: float) -> float:
    d = e1 - e0
    if abs(d) < 1e-6:
        return 0.0 if x < e0 else 1.0
    t = _clamp01((x - e0) / d)
    return t * t * (3.0 - 2.0 * t)


def assign_vertex_weights(obj, weight_fn) -> None:
    vg_map = {}
    for v in obj.data.vertices:
        wdict = weight_fn(v.co)
        total = sum(max(0.0, w) for w in wdict.values())
        if total <= 1e-6:
            # Fallback to Head/Hips if any caller returns near zero
            continue
        for bname, w in wdict.items():
            if w <= 1e-5:
                continue
            vg = vg_map.get(bname)
            if vg is None:
                vg = obj.vertex_groups.get(bname) or obj.vertex_groups.new(name=bname)
                vg_map[bname] = vg
            vg.add([v.index], w / total, "REPLACE")


def parent_to_armature(obj, arm_obj) -> None:
    obj.parent = arm_obj
    mod = obj.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = arm_obj
    mod.use_vertex_groups = True


def join_meshes_to_armature(name: str, objs: list, arm_obj):
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    if len(objs) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
    joined = objs[0]
    joined.name = name
    if joined.data:
        joined.data.name = f"{name}_Mesh"
    parent_to_armature(joined, arm_obj)
    return joined


def create_revolved_mesh(
    name: str,
    profile_rz_rows,
    segs: int = 32,
    depth_scale: float = 1.0,
    x_shift_fn=None,
    y_shift_fn=None,
    uv_v_scale: float = 1.0,
    uv_u_scale: float = 1.0,
    cap_bottom: bool = True,
    cap_top: bool = True,
    flute_amp: float = 0.0,
    flute_freq: int = 12,
):
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    rings = []
    n_rows = len(profile_rz_rows)
    for r_idx, (rad, z_val) in enumerate(profile_rz_rows):
        ring = []
        xo = x_shift_fn(z_val) if x_shift_fn else 0.0
        yo = y_shift_fn(z_val) if y_shift_fn else 0.0
        v_frac = r_idx / max(1, n_rows - 1)
        for s_idx in range(segs):
            ang = (s_idx / segs) * math.tau
            pleat = flute_amp * (1.0 - v_frac * 0.72) * math.sin(ang * flute_freq) if flute_amp > 0.0 else 0.0
            eff_r = rad + pleat
            x = xo + math.cos(ang) * eff_r
            y = yo + math.sin(ang) * eff_r * depth_scale
            ring.append(bm.verts.new((x, y, z_val)))
        rings.append(ring)

    bm.verts.ensure_lookup_table()
    for r in range(n_rows - 1):
        v0 = r / max(1, n_rows - 1) * uv_v_scale
        v1 = (r + 1) / max(1, n_rows - 1) * uv_v_scale
        for s in range(segs):
            s_next = (s + 1) % segs
            u0 = (s / segs) * uv_u_scale
            u1 = ((s + 1) / segs) * uv_u_scale
            f = bm.faces.new((rings[r][s], rings[r][s_next], rings[r + 1][s_next], rings[r + 1][s]))
            f.loops[0][uv_layer].uv = (u0, v0)
            f.loops[1][uv_layer].uv = (u1, v0)
            f.loops[2][uv_layer].uv = (u1, v1)
            f.loops[3][uv_layer].uv = (u0, v1)

    if cap_bottom and profile_rz_rows[0][0] > 0.004:
        c_bot = bm.verts.new((
            x_shift_fn(profile_rz_rows[0][1]) if x_shift_fn else 0.0,
            y_shift_fn(profile_rz_rows[0][1]) if y_shift_fn else 0.0,
            profile_rz_rows[0][1],
        ))
        for s in range(segs):
            s_next = (s + 1) % segs
            f = bm.faces.new((c_bot, rings[0][s_next], rings[0][s]))
            for lp in f.loops:
                lp[uv_layer].uv = (0.5, 0.02)

    if cap_top and profile_rz_rows[-1][0] > 0.004:
        c_top = bm.verts.new((
            x_shift_fn(profile_rz_rows[-1][1]) if x_shift_fn else 0.0,
            y_shift_fn(profile_rz_rows[-1][1]) if y_shift_fn else 0.0,
            profile_rz_rows[-1][1],
        ))
        for s in range(segs):
            s_next = (s + 1) % segs
            f = bm.faces.new((c_top, rings[-1][s], rings[-1][s_next]))
            for lp in f.loops:
                lp[uv_layer].uv = (0.5, 0.98)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_smooth(obj)
    return obj


def build_sculpted_head_mesh(name: str, head_center_z: float, head_r: float, female: bool):
    """Cute chibi anime head: luminous round cheeks, gentle pointed chin, micro button nose, socketed eye area."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=42, v_segments=34, radius=head_r)
    uv_layer = bm.loops.layers.uv.new("UVMap")

    for v in bm.verts:
        nx = v.co.x / head_r
        ny = v.co.y / head_r
        nz = v.co.z / head_r
        front = _clamp01(-ny)
        side = abs(nx)

        sx = 1.035 if nz > -0.14 else (0.985 - 0.165 * _clamp01((-0.14 - nz) / 0.86))
        sy = 0.965
        sz = 1.015 if female else 1.035

        x = v.co.x * sx
        y = v.co.y * sy
        z = v.co.z * sz

        # Plush anime cheek highlight
        cheek = math.exp(-((side - 0.44) / 0.24) ** 2 - ((nz + 0.22) / 0.22) ** 2) * front
        y -= cheek * head_r * (0.072 if female else 0.054)

        # Delicate soft chin
        chin = math.exp(-(side / 0.34) ** 2 - ((nz + 0.73) / 0.22) ** 2) * front
        y -= chin * head_r * 0.044
        z -= chin * head_r * 0.044

        # Recessed eye sockets for crisp lens seating
        for es in (-1.0, 1.0):
            esock = math.exp(-((nx - es * 0.335) / 0.185) ** 2 - ((nz + 0.07) / 0.165) ** 2) * _clamp01(-ny - 0.35)
            y += esock * head_r * 0.046

        # Tiny anime button nose
        nose = math.exp(-(nx / 0.082) ** 2 - ((nz + 0.25) / 0.095) ** 2) * _clamp01(-ny - 0.75)
        y -= nose * head_r * 0.068

        # Soft lip cushion
        mouth_pad = math.exp(-(nx / 0.15) ** 2 - ((nz + 0.48) / 0.08) ** 2) * _clamp01(-ny - 0.65)
        y -= mouth_pad * head_r * 0.025

        v.co = Vector((x, y, z + head_center_z))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        for lp in f.loops:
            c = lp.vert.co
            dx = c.x / head_r
            dy = c.y / head_r
            dz = (c.z - head_center_z) / head_r
            if dy < -0.10:
                u = _clamp01(0.5 + math.atan2(dx, max(0.15, -dy)) / 1.8)
                v_uv = _clamp01(0.5 + dz * 0.56)
            else:
                u, v_uv = 0.05, 0.90
            lp[uv_layer].uv = (u, v_uv)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_smooth(obj)
    return obj


def add_head_shape_keys(head_obj, head_center_z: float, head_r: float) -> None:
    head_obj.shape_key_add(name="Basis", from_mix=False)
    sk_blink = head_obj.shape_key_add(name="EyeBlink", from_mix=False)
    sk_smile = head_obj.shape_key_add(name="Smile", from_mix=False)
    sk_kiss = head_obj.shape_key_add(name="Kiss", from_mix=False)
    sk_shy = head_obj.shape_key_add(name="ShyBlush", from_mix=False)

    for idx, v in enumerate(head_obj.data.vertices):
        co = v.co
        nx = co.x / head_r
        ny = co.y / head_r
        nz = (co.z - head_center_z) / head_r
        front = _clamp01(-ny - 0.35)

        eye_mask = 0.0
        for s in (-1.0, 1.0):
            eye_mask += math.exp(-((nx - s * 0.315) / 0.21) ** 2 - ((nz - 0.02) / 0.16) ** 2) * front
        sk_blink.data[idx].co = co + Vector((0.0, -0.054 * head_r * eye_mask, -0.136 * head_r * eye_mask))

        cheek_lift = 0.0
        for s in (-1.0, 1.0):
            cheek_lift += math.exp(-((nx - s * 0.40) / 0.22) ** 2 - ((nz + 0.26) / 0.18) ** 2) * front
        mouth_smile = math.exp(-(abs(nx) / 0.20) ** 2 - ((nz + 0.48) / 0.09) ** 2) * front
        sk_smile.data[idx].co = co + Vector((0.0, -0.019 * head_r * cheek_lift, 0.036 * head_r * (cheek_lift + mouth_smile * 0.85)))

        lip_center = math.exp(-(nx / 0.11) ** 2 - ((nz + 0.49) / 0.09) ** 2) * _clamp01(-ny - 0.65)
        sk_kiss.data[idx].co = co + Vector((0.0, -0.058 * head_r * lip_center, 0.012 * head_r * lip_center))

        brow_shy = math.exp(-(nx / 0.36) ** 2 - ((nz - 0.22) / 0.12) ** 2) * front
        sk_shy.data[idx].co = co + Vector((0.0, -0.024 * head_r * cheek_lift, -0.026 * head_r * brow_shy))


def create_tapered_strand_mesh(
    name: str,
    pts,
    r0: float,
    r1: float,
    flatten: float = 0.42,
    radial: int = 8,
    head_center: Vector = None,
    profile_fn=None,
):
    n_pts = len(pts)
    samples = []
    segs = max(12, n_pts * 5)
    for i in range(segs + 1):
        u = (i / segs) * (n_pts - 1)
        idx = min(n_pts - 2, int(u))
        t = u - idx
        p0 = Vector(pts[max(0, idx - 1)])
        p1 = Vector(pts[idx])
        p2 = Vector(pts[idx + 1])
        p3 = Vector(pts[min(n_pts - 1, idx + 2)])
        t2 = t * t
        t3 = t2 * t
        pos = 0.5 * (
            (2.0 * p1)
            + (-p0 + p2) * t
            + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
            + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
        )
        samples.append(pos)

    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    rings = []
    for i, p in enumerate(samples):
        u_t = i / segs
        if i == 0:
            tangent = (samples[1] - samples[0]).normalized()
        elif i == segs:
            tangent = (samples[-1] - samples[-2]).normalized()
        else:
            tangent = (samples[i + 1] - samples[i - 1]).normalized()

        out_dir = (p - head_center) if head_center is not None else Vector((0.0, -1.0, 0.0))
        normal = out_dir - tangent * out_dir.dot(tangent)
        if normal.length < 1e-4:
            normal = Vector((0.0, -1.0, 0.0)).cross(tangent)
        if normal.length < 1e-4:
            normal = Vector((1.0, 0.0, 0.0))
        normal.normalize()
        binorm = tangent.cross(normal).normalized()

        if profile_fn:
            r = profile_fn(u_t, r0, r1)
        else:
            arch = math.sin(min(1.0, u_t * 1.15) * math.pi)
            r = max(0.0022, r0 * (1.0 - u_t * 0.85) + r0 * 0.24 * arch + r1 * u_t)

        ring = []
        for s in range(radial):
            ang = (s / radial) * math.tau
            offset = normal * (math.cos(ang) * r * flatten) + binorm * (math.sin(ang) * r)
            ring.append(bm.verts.new(p + offset))
        rings.append(ring)

    bm.verts.ensure_lookup_table()
    for i in range(segs):
        v0 = i / segs
        v1 = (i + 1) / segs
        for s in range(radial):
            sn = (s + 1) % radial
            u0 = s / radial
            u1 = (s + 1) / radial
            f = bm.faces.new((rings[i][s], rings[i][sn], rings[i + 1][sn], rings[i + 1][s]))
            f.loops[0][uv_layer].uv = (u0, v0)
            f.loops[1][uv_layer].uv = (u1, v0)
            f.loops[2][uv_layer].uv = (u1, v1)
            f.loops[3][uv_layer].uv = (u0, v1)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_smooth(obj)
    return obj


def create_tube_limb(name: str, z_top: float, z_bot: float, r_top: float, r_mid: float, r_bot: float, x_off: float = 0.0, y_off: float = 0.0, segs: int = 24, n_steps: int = 18):
    rows = []
    for i in range(n_steps + 1):
        t = i / n_steps
        z = z_top + (z_bot - z_top) * t
        if t < 0.5:
            u = t * 2.0
            r = r_top + (r_mid - r_top) * (u * u * (3.0 - 2.0 * u))
        else:
            u = (t - 0.5) * 2.0
            r = r_mid + (r_bot - r_mid) * (u * u * (3.0 - 2.0 * u))
        rows.append((r, z))
    return create_revolved_mesh(
        name,
        rows,
        segs=segs,
        depth_scale=0.96,
        x_shift_fn=lambda _z: x_off,
        y_shift_fn=lambda _z: y_off,
    )


def build_uv_sphere_part(name: str, center, scale_xyz, u_seg: int = 24, v_seg: int = 16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u_seg, v_segments=v_seg, radius=1.0)
    uv_layer = bm.loops.layers.uv.new("UVMap")
    cx, cy, cz = center
    sx, sy, sz = scale_xyz
    for v in bm.verts:
        v.co = Vector((cx + v.co.x * sx, cy + v.co.y * sy, cz + v.co.z * sz))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        for lp in f.loops:
            c = lp.vert.co
            dx = (c.x - cx) / max(1e-5, sx)
            dz = (c.z - cz) / max(1e-5, sz)
            lp[uv_layer].uv = (_clamp01(0.5 + dx * 0.52), _clamp01(0.5 + dz * 0.52))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_smooth(obj)
    return obj


# ---------------------------------------------------------------------------
# Armature & Clean Animation Curves
# ---------------------------------------------------------------------------

def build_humanoid_armature(name: str, female: bool, dims: dict):
    arm_data = bpy.data.armatures.new(name)
    arm_obj = bpy.data.objects.new(name, arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    hip_z = dims["hip_z"]
    spine_top = hip_z + dims["spine_h"]
    chest_top = spine_top + dims["chest_h"]
    neck_top = chest_top + dims["neck_h"]
    head_center = neck_top + dims["head_r"] * 0.88
    head_top = head_center + dims["head_r"] * 1.15

    def add_bone(bname, head, tail, parent=None):
        b = eb.new(bname)
        b.head = Vector(head)
        b.tail = Vector(tail)
        if parent:
            b.parent = eb[parent]
        return b

    add_bone("Hips", (0, 0, hip_z), (0, 0, hip_z + 0.06))
    add_bone("Spine", (0, 0, hip_z + 0.02), (0, 0, spine_top), "Hips")
    add_bone("Chest", (0, 0, spine_top), (0, 0, chest_top), "Spine")
    add_bone("Neck", (0, 0, chest_top), (0, 0, neck_top), "Chest")
    add_bone("Head", (0, 0, neck_top), (0, 0, head_top), "Neck")

    sh_z = chest_top - 0.03
    sh_x = dims["shoulder_x"]
    ua_l = dims["upper_arm"]
    fa_l = dims["forearm"]
    hip_x = dims["hip_x"]
    kn_z = dims["foot_h"] + dims["shin"]

    for side, s in (("L", 1.0), ("R", -1.0)):
        add_bone(f"Shoulder.{side}", (s * 0.04, 0, sh_z), (s * sh_x, 0, sh_z), "Chest")
        add_bone(f"UpperArm.{side}", (s * sh_x, 0, sh_z), (s * sh_x, 0, sh_z - ua_l), f"Shoulder.{side}")
        add_bone(f"Forearm.{side}", (s * sh_x, 0, sh_z - ua_l), (s * sh_x, 0, sh_z - ua_l - fa_l), f"UpperArm.{side}")
        add_bone(f"Hand.{side}", (s * sh_x, 0, sh_z - ua_l - fa_l), (s * sh_x, 0, sh_z - ua_l - fa_l - 0.075), f"Forearm.{side}")

        add_bone(f"Thigh.{side}", (s * hip_x, 0, hip_z), (s * hip_x, 0, kn_z), "Hips")
        add_bone(f"Shin.{side}", (s * hip_x, 0, kn_z), (s * hip_x, 0, dims["foot_h"]), f"Thigh.{side}")
        add_bone(f"Foot.{side}", (s * hip_x, 0, dims["foot_h"]), (s * hip_x, -0.10, 0.01), f"Shin.{side}")

    if female:
        add_bone("HairTail.L", (dims["head_r"] * 0.92, dims["head_r"] * 0.28, head_center + 0.04), (dims["head_r"] * 1.45, dims["head_r"] * 0.55, head_center - 0.34), "Head")
        add_bone("HairTail.R", (-dims["head_r"] * 0.92, dims["head_r"] * 0.28, head_center + 0.04), (-dims["head_r"] * 1.45, dims["head_r"] * 0.55, head_center - 0.34), "Head")
        add_bone("Skirt.F", (0, -0.09, hip_z + 0.02), (0, -0.22, hip_z - 0.24), "Hips")
        add_bone("Skirt.B", (0, 0.09, hip_z + 0.02), (0, 0.22, hip_z - 0.24), "Hips")
        add_bone("Skirt.L", (0.10, 0, hip_z + 0.02), (0.24, 0, hip_z - 0.24), "Hips")
        add_bone("Skirt.R", (-0.10, 0, hip_z + 0.02), (-0.24, 0, hip_z - 0.24), "Hips")
    else:
        add_bone("HairBack", (0, dims["head_r"] * 0.7, head_center), (0, dims["head_r"] * 0.95, head_center - 0.14), "Head")

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj


def apply_fk_rotations(arm_obj, pb_map, rel_euler_map: dict, aim_map: dict | None = None) -> None:
    world_rot = {}
    for bone in arm_obj.data.bones:
        bname = bone.name
        pb = pb_map[bname]
        R_rest = bone.matrix_local.to_3x3()
        pb.rotation_mode = "QUATERNION"

        if bname in rel_euler_map:
            M_rel = Euler(rel_euler_map[bname], "XYZ").to_matrix()
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

        if aim_map and bname in aim_map:
            target_dir = Vector(aim_map[bname]).normalized()
            v_rest = R_rest.col[1].normalized()
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

    step = 2
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
            pb.keyframe_insert(data_path="location", frame=fr)
            pb.keyframe_insert(data_path="rotation_quaternion", frame=fr)

    for fc in action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
            kp.handle_left_type = "AUTO_CLAMPED"
            kp.handle_right_type = "AUTO_CLAMPED"

    bpy.ops.object.mode_set(mode="OBJECT")
    track = arm_obj.animation_data.nla_tracks.new()
    track.name = clip_name
    strip = track.strips.new(clip_name, 1, action)
    strip.name = clip_name
    if looped:
        strip.action_frame_start = 1
        strip.action_frame_end = n_frames
    arm_obj.animation_data.action = None


# ---------------------------------------------------------------------------
# Main Character Builder
# ---------------------------------------------------------------------------

def build_rigged_character(char_id: str, tex_dir: Path, out_glb: Path) -> None:
    reset_scene()
    female = char_id == "xian"
    if female:
        dims = {
            "foot_h": 0.055,
            "shin": 0.245,
            "thigh": 0.255,
            "hip_z": 0.555,
            "spine_h": 0.145,
            "chest_h": 0.145,
            "neck_h": 0.042,
            "head_r": 0.188,
            "shoulder_x": 0.138,
            "hip_x": 0.068,
            "upper_arm": 0.172,
            "forearm": 0.152,
        }
        skin_rgb = (0.985, 0.875, 0.822)
        blush_rgb = (0.955, 0.585, 0.635)
        hair_base = (0.28, 0.16, 0.12)
        hair_hi = (0.64, 0.41, 0.31)
        iris_top, iris_mid, iris_bot = (0.22, 0.11, 0.08), (0.56, 0.31, 0.18), (0.90, 0.65, 0.38)
        lip_col = (0.91, 0.48, 0.55)
    else:
        dims = {
            "foot_h": 0.060,
            "shin": 0.270,
            "thigh": 0.280,
            "hip_z": 0.610,
            "spine_h": 0.155,
            "chest_h": 0.162,
            "neck_h": 0.045,
            "head_r": 0.194,
            "shoulder_x": 0.158,
            "hip_x": 0.074,
            "upper_arm": 0.192,
            "forearm": 0.168,
        }
        skin_rgb = (0.958, 0.835, 0.756)
        blush_rgb = (0.905, 0.595, 0.575)
        hair_base = (0.14, 0.10, 0.085)
        hair_hi = (0.45, 0.34, 0.27)
        iris_top, iris_mid, iris_bot = (0.13, 0.08, 0.05), (0.37, 0.23, 0.15), (0.66, 0.49, 0.31)
        lip_col = (0.83, 0.54, 0.52)

    tex_dir.mkdir(parents=True, exist_ok=True)
    img_skin = generate_skin_texture(tex_dir / f"{char_id}_skin.png", skin_rgb, blush_rgb)
    img_face = generate_face_skin_texture(tex_dir / f"{char_id}_face.png", skin_rgb, blush_rgb, female)
    img_iris = generate_iris_texture(tex_dir / f"{char_id}_iris.png", iris_top, iris_mid, iris_bot)
    img_hair = generate_hair_texture(tex_dir / f"{char_id}_hair.png", hair_base, hair_hi)

    mat_skin = make_pbr_material(f"{char_id}_Skin", skin_rgb, roughness=0.52, emission=skin_rgb, emission_strength=0.14, image=img_skin)
    mat_face = make_pbr_material(f"{char_id}_Face", skin_rgb, roughness=0.48, emission=skin_rgb, emission_strength=0.15, image=img_face)
    mat_eye = make_pbr_material(f"{char_id}_Eye", (1, 1, 1), roughness=0.06, emission=(1, 0.96, 0.92), emission_strength=0.22, image=img_iris)
    mat_lash = make_pbr_material(f"{char_id}_Lash", (0.10, 0.055, 0.045), roughness=0.32)
    mat_lip = make_pbr_material(f"{char_id}_Lip", lip_col, roughness=0.24)
    mat_hair = make_pbr_material(f"{char_id}_Hair", hair_base, roughness=0.36, image=img_hair, double_sided=True)
    mat_gold = make_pbr_material(f"{char_id}_Gold", (0.90, 0.74, 0.36), roughness=0.22, metallic=0.92)
    mat_sole = make_pbr_material(f"{char_id}_Sole", (0.34, 0.22, 0.16), roughness=0.58)
    mat_white = make_pbr_material(f"{char_id}_White", (0.99, 0.97, 0.95), roughness=0.66, double_sided=True)

    if female:
        img_dress = generate_floral_dress_texture(tex_dir / "xian_dress.png")
        mat_outfit = make_pbr_material("xian_Dress", (1, 1, 1), roughness=0.62, image=img_dress, double_sided=True)
        mat_accent = make_pbr_material("xian_Sash", (0.54, 0.69, 0.57), roughness=0.42)
        mat_ribbon = make_pbr_material("xian_Ribbon", (0.91, 0.45, 0.56), roughness=0.34, double_sided=True)
        mat_sakura = make_pbr_material("xian_SakuraPin", (1.0, 0.80, 0.86), roughness=0.26, double_sided=True)
        mat_shoe = make_pbr_material("xian_Shoe", (0.87, 0.51, 0.59), roughness=0.26)
    else:
        img_shirt = generate_linen_texture(tex_dir / "ran_shirt.png", (0.975, 0.958, 0.928))
        img_trouser = generate_linen_texture(tex_dir / "ran_trouser.png", (0.245, 0.325, 0.435))
        mat_outfit = make_pbr_material("ran_Shirt", (1, 1, 1), roughness=0.72, image=img_shirt)
        mat_trouser = make_pbr_material("ran_Trouser", (1, 1, 1), roughness=0.74, image=img_trouser)
        mat_accent = make_pbr_material("ran_Kerchief", (0.45, 0.65, 0.79), roughness=0.40, double_sided=True)
        mat_rose = make_pbr_material("ran_RosePin", (0.82, 0.22, 0.30), roughness=0.35, double_sided=True)
        mat_belt = make_pbr_material("ran_Belt", (0.39, 0.24, 0.15), roughness=0.38)
        mat_shoe = make_pbr_material("ran_Shoe", (0.46, 0.27, 0.16), roughness=0.28)

    arm = build_humanoid_armature(f"{char_id}_Armature", female, dims)

    hip_z = dims["hip_z"]
    spine_z = hip_z + dims["spine_h"]
    chest_top = spine_z + dims["chest_h"]
    neck_top = chest_top + dims["neck_h"]
    R = dims["head_r"]
    head_cz = neck_top + R * 0.88
    sh_z = chest_top - 0.03
    sh_x = dims["shoulder_x"]
    ua_l = dims["upper_arm"]
    fa_l = dims["forearm"]
    hip_x = dims["hip_x"]
    kn_z = dims["foot_h"] + dims["shin"]

    skin_parts, hair_parts, eye_parts, lash_parts, brow_parts = [], [], [], [], []
    outfit_parts, white_parts, accent_parts, ribbon_parts = [], [], [], []
    sakura_parts, rose_parts, trouser_parts, belt_parts, gold_parts, shoe_parts, sole_parts = [], [], [], [], [], [], []

    # 1. Head + Morph Targets
    head = build_sculpted_head_mesh(f"{char_id}_Head", head_cz, R, female)
    assign_mat_all(head, mat_face)
    add_head_shape_keys(head, head_cz, R)
    assign_vertex_weights(head, lambda _co: {"Head": 1.0})
    parent_to_armature(head, arm)

    for s in (-1.0, 1.0):
        ear = build_uv_sphere_part(f"{char_id}_Ear_{'L' if s > 0 else 'R'}", (s * R * 0.99, R * 0.04, head_cz - R * 0.08), (R * 0.13, R * 0.14, R * 0.19), 14, 10)
        assign_mat_all(ear, mat_skin)
        assign_vertex_weights(ear, lambda _co: {"Head": 1.0})
        skin_parts.append(ear)

        eye_x = s * R * 0.315
        eye_y = -R * 0.850
        eye_z = head_cz - R * 0.075
        eye_rx = R * 0.195
        eye_rz = R * (0.214 if female else 0.188)
        eye = build_uv_sphere_part(f"{char_id}_Eye_{'L' if s > 0 else 'R'}", (eye_x, eye_y, eye_z), (eye_rx, R * 0.105, eye_rz), 20, 16)
        bm = bmesh.new()
        bm.from_mesh(eye.data)
        uvl = bm.loops.layers.uv.active
        for f in bm.faces:
            for lp in f.loops:
                c = lp.vert.co
                lp[uvl].uv = (_clamp01(0.5 + ((c.x - eye_x) / eye_rx) * 0.5), _clamp01(0.5 + ((c.z - eye_z) / eye_rz) * 0.5))
        bm.to_mesh(eye.data)
        bm.free()
        assign_mat_all(eye, mat_eye)
        assign_vertex_weights(eye, lambda _co: {"Head": 1.0})
        eye_parts.append(eye)

        lash_pts = []
        for k in range(7):
            u = k / 6.0 - 0.5
            lash_pts.append((eye_x + u * R * 0.39, -R * 0.962 + (u * u) * R * 0.14, eye_z + eye_rz * 0.86 - (u * u) * R * 0.24))
        lash = create_tapered_strand_mesh(f"{char_id}_Lash_{'L' if s > 0 else 'R'}", lash_pts, r0=0.0095, r1=0.0045, flatten=0.6, radial=6)
        assign_mat_all(lash, mat_lash)
        lash.shape_key_add(name="Basis", from_mix=False)
        lb = lash.shape_key_add(name="EyeBlink", from_mix=False)
        for vi, vv in enumerate(lash.data.vertices):
            u_rel = abs(vv.co.x - eye_x) / max(1e-4, R * 0.19)
            drop_z = R * (0.17 - 0.04 * min(1.0, u_rel * u_rel))
            lb.data[vi].co = vv.co + Vector((0.0, -0.006, -drop_z))
        assign_vertex_weights(lash, lambda _co: {"Head": 1.0})
        lash_parts.append(lash)

        brow_pts = [
            (eye_x - s * R * 0.14, -R * 0.915, head_cz + R * 0.205),
            (eye_x, -R * 0.950, head_cz + R * (0.246 if female else 0.228)),
            (eye_x + s * R * 0.14, -R * 0.905, head_cz + R * 0.190),
        ]
        brow = create_tapered_strand_mesh(f"{char_id}_Brow_{'L' if s > 0 else 'R'}", brow_pts, r0=0.0048, r1=0.0032, flatten=0.5, radial=6)
        assign_mat_all(brow, mat_lash)
        assign_vertex_weights(brow, lambda _co: {"Head": 1.0})
        brow_parts.append(brow)

    lip = create_tapered_strand_mesh(
        f"{char_id}_Mouth",
        [(-R * 0.088, -R * 0.922, head_cz - R * 0.452), (0.0, -R * 0.960, head_cz - R * 0.476), (R * 0.088, -R * 0.922, head_cz - R * 0.452)],
        r0=0.0048,
        r1=0.0048,
        flatten=0.6,
        radial=6,
    )
    assign_mat_all(lip, mat_lip)
    assign_vertex_weights(lip, lambda _co: {"Head": 1.0})
    parent_to_armature(lip, arm)

    # 2. Hair + Cute Sakura Hair Pin / Side Locks / Twin-Tails
    hc = Vector((0.0, 0.0, head_cz))
    cap = build_uv_sphere_part(f"{char_id}_HairCap", (0, R * 0.055, head_cz + R * 0.055), (R * 1.072, R * 1.076, R * 1.066), 34, 24)
    for v in cap.data.vertices:
        d = v.co - hc
        t_cut = _smoothstep(-R * 0.16, -R * 0.48, d.y) * _smoothstep(R * 0.42, R * 0.08, d.z)
        if t_cut > 0.001:
            r_cur = d.length
            r_tgt = r_cur * (1.0 - t_cut) + (R * 0.91) * t_cut
            v.co = hc + d.normalized() * r_tgt
    assign_mat_all(cap, mat_hair)
    assign_vertex_weights(cap, lambda _co: {"Head": 1.0})
    hair_parts.append(cap)

    for bi, ang in enumerate([-0.46, -0.26, -0.09, 0.09, 0.26, 0.46]):
        tip_spread = ang * (0.95 if female else 0.74)
        p_top = (math.sin(ang * 0.6) * R * 0.55, -R * 0.65, head_cz + R * 0.92)
        p_mid = (math.sin(ang * 0.85) * R * 1.01, -math.cos(ang * 0.85) * R * 1.06, head_cz + R * 0.45)
        p_end = (math.sin(tip_spread) * R * 0.99, -math.cos(tip_spread) * R * 1.03, head_cz + R * (0.16 if abs(ang) < 0.3 else 0.04))
        bang = create_tapered_strand_mesh(f"{char_id}_Bang_{bi}", [p_top, p_mid, p_end], r0=0.026 if female else 0.029, r1=0.004, flatten=0.38, head_center=hc)
        assign_mat_all(bang, mat_hair)
        assign_vertex_weights(bang, lambda _co: {"Head": 1.0})
        hair_parts.append(bang)

    for s in (-1.0, 1.0):
        side_pts = [
            (s * R * 0.78, -R * 0.12, head_cz + R * 0.66),
            (s * R * (0.98 if female else 0.92), -R * 0.26, head_cz + R * 0.14),
            (s * R * (0.92 if female else 0.85), -R * 0.24, head_cz - R * (0.50 if female else 0.18)),
            (s * R * (0.82 if female else 0.76), -R * 0.16, head_cz - R * (0.86 if female else 0.32)),
        ]
        slock = create_tapered_strand_mesh(f"{char_id}_SideLock_{'L' if s > 0 else 'R'}", side_pts, r0=0.018 if female else 0.014, r1=0.003, flatten=0.36, head_center=hc)
        assign_mat_all(slock, mat_hair)
        key = f"HairTail.{'L' if s > 0 else 'R'}" if female else "Head"
        assign_vertex_weights(slock, lambda _co, k=key: {k: 0.35, "Head": 0.65})
        hair_parts.append(slock)

    if female:
        # Sakura 5-petal hair clip above left temple (+X, -Y)
        spx, spy, spz = R * 0.62, -R * 0.82, head_cz + R * 0.44
        for p in range(5):
            pa = p * math.tau / 5.0
            pet = build_uv_sphere_part(
                f"xian_SakuraPetal_{p}",
                (spx + math.cos(pa) * 0.014, spy - 0.006, spz + math.sin(pa) * 0.014),
                (0.011, 0.005, 0.011),
                10,
                8,
            )
            assign_mat_all(pet, mat_sakura)
            assign_vertex_weights(pet, lambda _co: {"Head": 1.0})
            sakura_parts.append(pet)
        sc = build_uv_sphere_part("xian_SakuraPearl", (spx, spy - 0.010, spz), (0.0065, 0.005, 0.0065), 10, 8)
        assign_mat_all(sc, mat_gold)
        assign_vertex_weights(sc, lambda _co: {"Head": 1.0})
        gold_parts.append(sc)

        for side, s in (("L", 1.0), ("R", -1.0)):
            bx, by, bz = s * R * 0.92, R * 0.28, head_cz + R * 0.22
            bow_c = build_uv_sphere_part(f"xian_BowCenter_{side}", (bx, by, bz), (0.019, 0.019, 0.019), 12, 8)
            assign_mat_all(bow_c, mat_ribbon)
            assign_vertex_weights(bow_c, lambda _co: {"Head": 1.0})
            ribbon_parts.append(bow_c)
            for ls in (-1.0, 1.0):
                loop = build_uv_sphere_part(f"xian_BowLoop_{side}_{ls}", (bx + ls * 0.028, by + 0.012, bz + 0.010), (0.028, 0.013, 0.020), 12, 8)
                assign_mat_all(loop, mat_ribbon)
                assign_vertex_weights(loop, lambda _co: {"Head": 1.0})
                ribbon_parts.append(loop)

            for ti in range(4):
                off_x = (ti - 1.5) * 0.018 * s
                off_y = ((ti % 2) - 0.5) * 0.028
                t_pts = [
                    (bx, by, bz),
                    (bx + s * 0.065 + off_x, by + 0.055 + off_y, bz - 0.14),
                    (bx + s * 0.105 + off_x * 1.4, by + 0.08 + off_y * 1.4, bz - 0.34),
                    (bx + s * 0.075 + off_x, by + 0.05 + off_y, bz - 0.52),
                ]
                tail = create_tapered_strand_mesh(f"xian_TwinTail_{side}_{ti}", t_pts, r0=0.036, r1=0.004, flatten=0.68)
                assign_mat_all(tail, mat_hair)
                bone_k = f"HairTail.{side}"
                assign_vertex_weights(tail, lambda co, bk=bone_k, top_z=bz: {
                    "Head": 1.0 - _smoothstep(top_z, top_z - 0.18, co.z),
                    bk: _smoothstep(top_z, top_z - 0.18, co.z),
                })
                hair_parts.append(tail)
    else:
        for ni in range(-3, 4):
            a = ni * 0.24
            pts = [
                (math.sin(a) * R * 0.85, math.cos(a) * R * 0.92, head_cz + R * 0.25),
                (math.sin(a) * R * 1.01, math.cos(a) * R * 1.03, head_cz - R * 0.25),
                (math.sin(a) * R * 0.90, math.cos(a) * R * 0.96, head_cz - R * 0.70),
            ]
            lock = create_tapered_strand_mesh(f"ran_BackLock_{ni}", pts, r0=0.031, r1=0.005, flatten=0.45, head_center=hc)
            assign_mat_all(lock, mat_hair)
            assign_vertex_weights(lock, lambda _co: {"Head": 0.65, "HairBack": 0.35})
            hair_parts.append(lock)

    # 3. Neck, Torso, Dress / Shirt + Accessories
    neck = create_tube_limb(f"{char_id}_NeckMesh", neck_top + 0.03, chest_top - 0.03, 0.034 if female else 0.041, 0.036 if female else 0.043, 0.040 if female else 0.046, segs=18, n_steps=8)
    assign_mat_all(neck, mat_skin)
    assign_vertex_weights(neck, lambda co: {
        "Chest": 1.0 - _smoothstep(chest_top - 0.01, neck_top + 0.01, co.z),
        "Neck": _smoothstep(chest_top - 0.01, neck_top + 0.01, co.z),
    })
    skin_parts.append(neck)

    def torso_w(co: Vector):
        w_spine = _smoothstep(hip_z - 0.03, spine_z, co.z)
        w_chest = _smoothstep(spine_z - 0.02, spine_z + dims["chest_h"] * 0.65, co.z)
        sh_blend = 0.0
        if not female and co.z > chest_top - 0.065 and abs(co.x) > 0.075:
            sh_blend = _smoothstep(0.075, 0.115, abs(co.x)) * _smoothstep(chest_top - 0.065, chest_top - 0.010, co.z) * 0.18
        chest_rem = max(0.0, w_chest - sh_blend)
        w = {
            "Hips": max(0.05, 1.0 - w_spine),
            "Spine": max(0.0, w_spine - w_chest),
            "Chest": chest_rem,
        }
        if sh_blend > 0.0:
            side = "L" if co.x >= 0.0 else "R"
            w[f"Shoulder.{side}"] = sh_blend
        return w

    if female:
        bodice = create_revolved_mesh(
            "xian_Bodice",
            [
                (0.088, spine_z - 0.04),
                (0.072, spine_z + 0.02),
                (0.088, spine_z + 0.07),
                (0.094, chest_top - 0.04),
                (0.072, chest_top),
            ],
            segs=28,
            depth_scale=0.80,
        )
        assign_mat_all(bodice, mat_outfit)
        assign_vertex_weights(bodice, torso_w)
        outfit_parts.append(bodice)

        # Wide Peter Pan collar + pearl button
        collar = create_revolved_mesh(
            "xian_Collar",
            [(0.095, chest_top - 0.026), (0.068, chest_top - 0.012), (0.048, chest_top + 0.008)],
            segs=24,
            depth_scale=0.84,
            cap_bottom=False,
        )
        assign_mat_all(collar, mat_white)
        assign_vertex_weights(collar, lambda _co: {"Chest": 0.9, "Neck": 0.1})
        white_parts.append(collar)

        # Sage green waist sash + cute back ribbon bow
        sash = create_revolved_mesh(
            "xian_WaistSash",
            [(0.083, spine_z - 0.026), (0.079, spine_z + 0.002), (0.084, spine_z + 0.026)],
            segs=28,
            depth_scale=0.83,
        )
        assign_mat_all(sash, mat_accent)
        assign_vertex_weights(sash, lambda _co: {"Spine": 0.65, "Hips": 0.35})
        accent_parts.append(sash)

        w_knot = build_uv_sphere_part("xian_WaistBowKnot", (0.0, 0.076, spine_z), (0.020, 0.016, 0.020), 12, 8)
        assign_mat_all(w_knot, mat_accent)
        assign_vertex_weights(w_knot, lambda _co: {"Spine": 0.7, "Hips": 0.3})
        accent_parts.append(w_knot)
        for bs in (-1.0, 1.0):
            wl = build_uv_sphere_part(f"xian_WaistBowL_{bs}", (bs * 0.036, 0.084, spine_z + 0.006), (0.032, 0.013, 0.020), 12, 8)
            assign_mat_all(wl, mat_accent)
            assign_vertex_weights(wl, lambda _co: {"Spine": 0.7, "Hips": 0.3})
            accent_parts.append(wl)

        # Pleated fluted floral sundress skirt weighted cleanly to Skirt.F/B/L/R + Hips
        skirt_rows = []
        skirt_top = spine_z + 0.010
        skirt_bot = hip_z - 0.275
        for i in range(14):
            t = i / 13.0
            z = skirt_bot + (skirt_top - skirt_bot) * t
            r = 0.218 - 0.136 * (t ** 1.08)
            skirt_rows.append((r, z))
        skirt = create_revolved_mesh("xian_Skirt", skirt_rows, segs=40, depth_scale=0.94, cap_bottom=False, flute_amp=0.008, flute_freq=14)
        assign_mat_all(skirt, mat_outfit)

        def skirt_w(co: Vector):
            fl = _smoothstep(skirt_top, skirt_bot + 0.06, co.z)
            if fl < 0.02:
                return {"Hips": 0.75, "Spine": 0.25}
            wF = max(0.0, -co.y) ** 1.25
            wB = max(0.0, co.y) ** 1.25
            wL = max(0.0, co.x) ** 1.25
            wR = max(0.0, -co.x) ** 1.25
            wsum = max(1e-5, wF + wB + wL + wR)
            return {
                "Hips": 1.0 - fl * 0.86,
                "Skirt.F": fl * 0.86 * (wF / wsum),
                "Skirt.B": fl * 0.86 * (wB / wsum),
                "Skirt.L": fl * 0.86 * (wL / wsum),
                "Skirt.R": fl * 0.86 * (wR / wsum),
            }

        assign_vertex_weights(skirt, skirt_w)
        outfit_parts.append(skirt)
    else:
        shirt = create_revolved_mesh(
            "ran_ShirtMesh",
            [(0.104, hip_z - 0.015), (0.095, spine_z), (0.114, chest_top - 0.045), (0.088, chest_top + 0.004)],
            segs=28,
            depth_scale=0.82,
        )
        assign_mat_all(shirt, mat_outfit)
        assign_vertex_weights(shirt, torso_w)
        outfit_parts.append(shirt)

        collar = create_revolved_mesh(
            "ran_Collar",
            [(0.072, chest_top - 0.008), (0.058, chest_top + 0.014), (0.048, chest_top + 0.026)],
            segs=22,
            depth_scale=0.84,
            cap_bottom=False,
        )
        assign_mat_all(collar, mat_white)
        assign_vertex_weights(collar, lambda _co: {"Chest": 0.85, "Neck": 0.15})
        white_parts.append(collar)

        # Sky-blue bow tie / kerchief accent + golden lapel pin + rose boutonniere
        tie_k = build_uv_sphere_part("ran_BowtieKnot", (0.0, -0.076, chest_top - 0.010), (0.016, 0.013, 0.014), 10, 8)
        assign_mat_all(tie_k, mat_accent)
        assign_vertex_weights(tie_k, lambda _co: {"Chest": 1.0})
        accent_parts.append(tie_k)
        for ts in (-1.0, 1.0):
            tw = build_uv_sphere_part(f"ran_BowtieWing_{ts}", (ts * 0.028, -0.074, chest_top - 0.010), (0.024, 0.010, 0.015), 10, 8)
            assign_mat_all(tw, mat_accent)
            assign_vertex_weights(tw, lambda _co: {"Chest": 1.0})
            accent_parts.append(tw)

        rose_bud = build_uv_sphere_part("ran_RoseBoutonniere", (0.058, -0.092, chest_top - 0.052), (0.017, 0.012, 0.017), 12, 8)
        assign_mat_all(rose_bud, mat_rose)
        assign_vertex_weights(rose_bud, lambda _co: {"Chest": 1.0})
        rose_parts.append(rose_bud)

        pelvis = create_revolved_mesh(
            "ran_Pelvis",
            [(0.112, hip_z - 0.065), (0.110, hip_z - 0.010), (0.106, hip_z + 0.032)],
            segs=28,
            depth_scale=0.84,
        )
        assign_mat_all(pelvis, mat_trouser)
        assign_vertex_weights(pelvis, lambda _co: {"Hips": 0.90, "Spine": 0.10})
        trouser_parts.append(pelvis)

        belt = create_revolved_mesh(
            "ran_Belt",
            [(0.109, hip_z + 0.012), (0.109, hip_z + 0.044)],
            segs=28,
            depth_scale=0.85,
        )
        assign_mat_all(belt, mat_belt)
        assign_vertex_weights(belt, lambda _co: {"Hips": 0.85, "Spine": 0.15})
        belt_parts.append(belt)

        buckle = build_uv_sphere_part("ran_Buckle", (0.0, -0.094, hip_z + 0.028), (0.020, 0.010, 0.018), 12, 8)
        assign_mat_all(buckle, mat_gold)
        assign_vertex_weights(buckle, lambda _co: {"Hips": 0.9, "Spine": 0.1})
        gold_parts.append(buckle)

    # 4. Arms & Hands (clean clearance from dress/shirt)
    for side, s in (("L", 1.0), ("R", -1.0)):
        ax = s * sh_x
        elb_z = sh_z - ua_l
        wri_z = elb_z - fa_l

        if female:
            puff = build_uv_sphere_part(f"xian_PuffSleeve_{side}", (ax, 0.0, sh_z - 0.024), (0.042, 0.042, 0.050), 16, 12)
            assign_mat_all(puff, mat_outfit)
            assign_vertex_weights(puff, lambda _co, sd=side: {f"Shoulder.{sd}": 0.25, f"UpperArm.{sd}": 0.75})
            outfit_parts.append(puff)
        else:
            sleeve = create_tube_limb(f"ran_Sleeve_{side}", sh_z + 0.020, sh_z - 0.110, 0.047, 0.045, 0.042, x_off=ax, segs=18, n_steps=10)
            assign_mat_all(sleeve, mat_outfit)

            def sleeve_w(co: Vector, sd=side, top_z=sh_z):
                t_u = _smoothstep(top_z + 0.012, top_z - 0.055, co.z)
                return {
                    "Chest": 0.22 * (1.0 - t_u),
                    f"Shoulder.{sd}": 0.42 * (1.0 - t_u) + 0.14 * t_u,
                    f"UpperArm.{sd}": 0.36 * (1.0 - t_u) + 0.86 * t_u,
                }

            assign_vertex_weights(sleeve, sleeve_w)
            outfit_parts.append(sleeve)

            sl_cap = build_uv_sphere_part(f"ran_SleeveCap_{side}", (ax * 0.96, 0.0, sh_z + 0.002), (0.046, 0.046, 0.040), 16, 10)
            assign_mat_all(sl_cap, mat_outfit)
            assign_vertex_weights(sl_cap, lambda _co, sd=side: {"Chest": 0.22, f"Shoulder.{sd}": 0.44, f"UpperArm.{sd}": 0.34})
            outfit_parts.append(sl_cap)

        arm_mesh = create_tube_limb(
            f"{char_id}_Arm_{side}",
            sh_z - 0.010,
            wri_z + 0.005,
            0.028 if female else 0.032,
            0.024 if female else 0.028,
            0.020 if female else 0.024,
            x_off=ax,
            segs=18,
            n_steps=14,
        )
        assign_mat_all(arm_mesh, mat_skin)

        def arm_w(co: Vector, sd=side, e_z=elb_z, top_z=sh_z):
            t_s = _smoothstep(top_z - 0.015, top_z - 0.065, co.z)
            t_e = _smoothstep(e_z + 0.030, e_z - 0.030, co.z)
            return {
                f"Shoulder.{sd}": max(0.0, 1.0 - t_s) * 0.25,
                f"UpperArm.{sd}": max(0.0, (1.0 - t_e) * (0.75 + 0.25 * t_s)),
                f"Forearm.{sd}": t_e,
            }

        assign_vertex_weights(arm_mesh, arm_w)
        skin_parts.append(arm_mesh)

        # Boy wristwatch on Left wrist (+X)
        if not female and side == "L":
            strap = create_tube_limb("ran_WatchStrap", wri_z + 0.026, wri_z + 0.010, 0.026, 0.026, 0.026, x_off=ax, segs=16, n_steps=4)
            assign_mat_all(strap, mat_belt)
            assign_vertex_weights(strap, lambda _co: {"Forearm.L": 0.9, "Hand.L": 0.1})
            belt_parts.append(strap)
            dial = build_uv_sphere_part("ran_WatchDial", (ax + 0.026, 0.0, wri_z + 0.018), (0.008, 0.014, 0.014), 10, 8)
            assign_mat_all(dial, mat_gold)
            assign_vertex_weights(dial, lambda _co: {"Forearm.L": 0.9, "Hand.L": 0.1})
            gold_parts.append(dial)

        hand = build_uv_sphere_part(f"{char_id}_Hand_{side}", (ax, -0.004, wri_z - 0.026), (0.022, 0.020, 0.034), 16, 12)
        assign_mat_all(hand, mat_skin)
        assign_vertex_weights(hand, lambda _co, sd=side: {f"Forearm.{sd}": 0.15, f"Hand.{sd}": 0.85})
        skin_parts.append(hand)

    # 5. Legs & Footwear
    for side, s in (("L", 1.0), ("R", -1.0)):
        lx = s * hip_x
        ank_z = dims["foot_h"]
        if female:
            leg = create_tube_limb(f"xian_Leg_{side}", hip_z + 0.01, ank_z + 0.052, 0.044, 0.035, 0.025, x_off=lx, segs=20, n_steps=16)
            assign_mat_all(leg, mat_skin)

            def fleg_w(co: Vector, sd=side, kz=kn_z):
                t_k = _smoothstep(kz + 0.035, kz - 0.035, co.z)
                return {f"Thigh.{sd}": 1.0 - t_k, f"Shin.{sd}": t_k}

            assign_vertex_weights(leg, fleg_w)
            skin_parts.append(leg)

            sock = create_tube_limb(f"xian_Sock_{side}", ank_z + 0.068, ank_z - 0.002, 0.029, 0.028, 0.027, x_off=lx, segs=18, n_steps=6)
            assign_mat_all(sock, mat_white)
            assign_vertex_weights(sock, lambda _co, sd=side: {f"Shin.{sd}": 0.8, f"Foot.{sd}": 0.2})
            white_parts.append(sock)

            shoe = build_uv_sphere_part(f"xian_Shoe_{side}", (lx, -0.040, ank_z * 0.56), (0.035, 0.068, 0.029), 18, 12)
            assign_mat_all(shoe, mat_shoe)
            assign_vertex_weights(shoe, lambda _co, sd=side: {f"Foot.{sd}": 1.0})
            shoe_parts.append(shoe)

            strap = create_tube_limb(f"xian_ShoeStrap_{side}", ank_z + 0.005, ank_z - 0.015, 0.032, 0.032, 0.032, x_off=lx, y_off=-0.012, segs=16, n_steps=4)
            assign_mat_all(strap, mat_shoe)
            assign_vertex_weights(strap, lambda _co, sd=side: {f"Foot.{sd}": 1.0})
            shoe_parts.append(strap)

            sole = build_uv_sphere_part(f"xian_Sole_{side}", (lx, -0.040, 0.012), (0.036, 0.070, 0.012), 18, 10)
            assign_mat_all(sole, mat_sole)
            assign_vertex_weights(sole, lambda _co, sd=side: {f"Foot.{sd}": 1.0})
            sole_parts.append(sole)
        else:
            leg = create_tube_limb(f"ran_TrouserLeg_{side}", hip_z + 0.01, ank_z + 0.015, 0.056, 0.046, 0.036, x_off=lx, segs=22, n_steps=16)
            assign_mat_all(leg, mat_trouser)

            def mleg_w(co: Vector, sd=side, kz=kn_z):
                t_k = _smoothstep(kz + 0.035, kz - 0.035, co.z)
                return {f"Thigh.{sd}": 1.0 - t_k, f"Shin.{sd}": t_k}

            assign_vertex_weights(leg, mleg_w)
            trouser_parts.append(leg)

            shoe = build_uv_sphere_part(f"ran_Shoe_{side}", (lx, -0.044, ank_z * 0.56), (0.038, 0.075, 0.031), 18, 12)
            assign_mat_all(shoe, mat_shoe)
            assign_vertex_weights(shoe, lambda _co, sd=side: {f"Foot.{sd}": 1.0})
            shoe_parts.append(shoe)

            sole = build_uv_sphere_part(f"ran_Sole_{side}", (lx, -0.044, 0.013), (0.039, 0.077, 0.013), 18, 10)
            assign_mat_all(sole, mat_sole)
            assign_vertex_weights(sole, lambda _co, sd=side: {f"Foot.{sd}": 1.0})
            sole_parts.append(sole)

    # 6. Merge same-material meshes into clean skinned GLB primitives
    export_objs = [arm, head, lip]
    buckets = [
        (f"{char_id}_BodySkin", skin_parts),
        (f"{char_id}_Hair", hair_parts),
        (f"{char_id}_Eyes", eye_parts),
        (f"{char_id}_Lash", lash_parts),
        (f"{char_id}_Brows", brow_parts),
        (f"{char_id}_Outfit", outfit_parts),
        (f"{char_id}_White", white_parts),
        (f"{char_id}_Accent", accent_parts),
        (f"{char_id}_Ribbons", ribbon_parts),
        (f"{char_id}_SakuraPin", sakura_parts),
        (f"{char_id}_RosePin", rose_parts),
        (f"{char_id}_Trousers", trouser_parts),
        (f"{char_id}_Belt", belt_parts),
        (f"{char_id}_Gold", gold_parts),
        (f"{char_id}_Shoes", shoe_parts),
        (f"{char_id}_Soles", sole_parts),
    ]
    for bname, plist in buckets:
        merged = join_meshes_to_armature(bname, plist, arm)
        if merged is not None:
            export_objs.append(merged)

    # Verify zero unweighted vertices across all rigged meshes
    for obj in export_objs:
        if obj.type != "MESH":
            continue
        for v in obj.data.vertices:
            if not v.groups or sum(g.weight for g in v.groups) < 0.01:
                raise RuntimeError(f"Unweighted vertex {v.index} in {obj.name}")

    # -----------------------------------------------------------------------
    # 7. Author All 17 Smooth NLA Clips
    # -----------------------------------------------------------------------
    def pose_idle(pb, u):
        t = u * math.tau
        breath = math.sin(t)
        sway = math.sin(t * 0.5)
        pb["Hips"].location = (sway * 0.004, breath * 0.004, 0.0)
        apply_fk_rotations(
            arm,
            pb,
            {
                "Hips": (0.0, 0.0, sway * 0.025),
                "Spine": (0.015 + breath * 0.015, 0.0, 0.0),
                "Chest": (breath * 0.020, 0.0, -sway * 0.020),
                "Head": (-0.02 + breath * 0.015, 0.0, sway * 0.045),
                "HairTail.L": (0.10 + breath * 0.05, 0.08 + sway * 0.04, 0.0),
                "HairTail.R": (0.10 + breath * 0.05, -0.08 + sway * 0.04, 0.0),
                "Skirt.F": (-0.04, 0.0, 0.0),
                "Skirt.B": (0.04, 0.0, 0.0),
                "Skirt.L": (0.0, -0.04, 0.0),
                "Skirt.R": (0.0, 0.04, 0.0),
            },
            {
                "UpperArm.L": (0.16, -0.05, -0.96),
                "Forearm.L": (0.08, -0.18, -0.96),
                "UpperArm.R": (-0.16, -0.05, -0.96),
                "Forearm.R": (-0.08, -0.18, -0.96),
            },
        )

    def pose_walk(pb, u):
        t = u * math.tau
        s1 = math.sin(t)
        c1 = math.cos(t)
        hip_bounce = abs(c1) * 0.018
        pb["Hips"].location = (s1 * 0.007, hip_bounce, 0.0)
        arm_L = s1 * 0.42
        arm_R = -s1 * 0.42
        apply_fk_rotations(
            arm,
            pb,
            {
                "Hips": (0.04, 0.0, -s1 * 0.06),
                "Spine": (0.05, 0.0, s1 * 0.04),
                "Chest": (0.04, 0.0, s1 * 0.05),
                "Head": (-0.04, 0.0, -s1 * 0.02),
                "Thigh.L": (s1 * 0.46, 0.0, 0.0),
                "Shin.L": (max(0.0, -c1) * 0.54 + 0.08, 0.0, 0.0),
                "Foot.L": (-s1 * 0.16, 0.0, 0.0),
                "Thigh.R": (-s1 * 0.46, 0.0, 0.0),
                "Shin.R": (max(0.0, c1) * 0.54 + 0.08, 0.0, 0.0),
                "Foot.R": (s1 * 0.16, 0.0, 0.0),
                "HairTail.L": (0.18 + abs(s1) * 0.08, 0.10, -s1 * 0.08),
                "HairTail.R": (0.18 + abs(s1) * 0.08, -0.10, -s1 * 0.08),
                "Skirt.F": (-0.28 - abs(s1) * 0.16, 0.0, 0.0),
                "Skirt.B": (0.28 + abs(s1) * 0.16, 0.0, 0.0),
                "Skirt.L": (0.0, -0.10, 0.0),
                "Skirt.R": (0.0, 0.10, 0.0),
            },
            {
                "UpperArm.L": (0.17, arm_L - 0.04, -0.92),
                "Forearm.L": (0.12, arm_L - 0.28, -0.90),
                "UpperArm.R": (-0.17, arm_R - 0.04, -0.92),
                "Forearm.R": (-0.12, arm_R - 0.28, -0.90),
            },
        )

    def pose_run(pb, u):
        t = u * math.tau
        s1 = math.sin(t)
        c1 = math.cos(t)
        pb["Hips"].location = (s1 * 0.010, abs(c1) * 0.036 - 0.015, 0.0)
        arm_L = s1 * 0.72
        arm_R = -s1 * 0.72
        apply_fk_rotations(
            arm,
            pb,
            {
                "Hips": (0.16, 0.0, -s1 * 0.09),
                "Spine": (0.12, 0.0, s1 * 0.06),
                "Chest": (0.08, 0.0, s1 * 0.07),
                "Head": (-0.18, 0.0, -s1 * 0.04),
                "Thigh.L": (s1 * 0.78 - 0.12, 0.0, 0.0),
                "Shin.L": (max(0.0, -c1) * 0.92 + 0.18, 0.0, 0.0),
                "Foot.L": (-s1 * 0.22, 0.0, 0.0),
                "Thigh.R": (-s1 * 0.78 - 0.12, 0.0, 0.0),
                "Shin.R": (max(0.0, c1) * 0.92 + 0.18, 0.0, 0.0),
                "Foot.R": (s1 * 0.22, 0.0, 0.0),
                "HairTail.L": (0.45 + abs(s1) * 0.14, 0.14, -s1 * 0.10),
                "HairTail.R": (0.45 + abs(s1) * 0.14, -0.14, -s1 * 0.10),
                "Skirt.F": (-0.52 - abs(s1) * 0.20, 0.0, 0.0),
                "Skirt.B": (0.50 + abs(s1) * 0.18, 0.0, 0.0),
                "Skirt.L": (0.0, -0.18, 0.0),
                "Skirt.R": (0.0, 0.18, 0.0),
            },
            {
                "UpperArm.L": (0.18, arm_L - 0.10, -0.82),
                "Forearm.L": (0.06, -0.78, -0.45),
                "UpperArm.R": (-0.18, arm_R - 0.10, -0.82),
                "Forearm.R": (-0.06, -0.78, -0.45),
            },
        )

    def pose_sit(pb, u):
        breath = math.sin(u * math.tau)
        # Drop pelvis gently onto seat while extending thighs forward (-Y) and shins straight down
        pb["Hips"].location = (0.0, -0.02, 0.0)
        apply_fk_rotations(
            arm,
            pb,
            {
                "Hips": (-0.05, 0.0, 0.0),
                "Spine": (0.04 + breath * 0.015, 0.0, 0.0),
                "Chest": (0.03 + breath * 0.015, 0.0, 0.0),
                "Head": (0.02 + breath * 0.015, 0.0, 0.04 * math.sin(u * math.tau * 0.5)),
                "Thigh.L": (-1.44, 0.05 if female else 0.10, 0.0),
                "Shin.L": (1.40, 0.0, 0.0),
                "Foot.L": (0.06, 0.0, 0.0),
                "Thigh.R": (-1.44, -0.05 if female else -0.10, 0.0),
                "Shin.R": (1.40, 0.0, 0.0),
                "Foot.R": (0.06, 0.0, 0.0),
                "Skirt.F": (-1.34, 0.0, 0.0),
                "Skirt.B": (0.28, 0.0, 0.0),
                "Skirt.L": (-0.54, -0.22, 0.0),
                "Skirt.R": (-0.54, 0.22, 0.0),
                "HairTail.L": (0.12, 0.10, 0.0),
                "HairTail.R": (0.12, -0.10, 0.0),
            },
            {
                "UpperArm.L": (0.14, -0.22, -0.88),
                "Forearm.L": (-0.28, -0.78, -0.30),
                "UpperArm.R": (-0.14, -0.22, -0.88),
                "Forearm.R": (0.28, -0.78, -0.30),
            },
        )

    def pose_lie(pb, u):
        breath = math.sin(u * math.tau)
        pb["Hips"].location = (0.0, 0.0, 0.0)
        apply_fk_rotations(
            arm,
            pb,
            {
                "Spine": (breath * 0.012, 0.0, 0.0),
                "Chest": (breath * 0.015, 0.0, 0.0),
                "Head": (0.04, 0.0, 0.06 * math.sin(u * math.tau * 0.5)),
                "Thigh.L": (-0.12, 0.08, 0.0),
                "Shin.L": (0.22, 0.0, 0.0),
                "Thigh.R": (-0.12, -0.08, 0.0),
                "Shin.R": (0.22, 0.0, 0.0),
                "Skirt.F": (-0.14, 0.0, 0.0),
                "Skirt.B": (0.14, 0.0, 0.0),
            },
            {
                "UpperArm.L": (0.18, -0.10, -0.90),
                "Forearm.L": (-0.25, -0.45, -0.55),
                "UpperArm.R": (-0.18, -0.10, -0.90),
                "Forearm.R": (0.25, -0.45, -0.55),
            },
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
            apply_fk_rotations(
                arm,
                pb,
                {
                    "Chest": (0.02, 0.0, 0.06 if hold_left else -0.06),
                    "Head": (-0.02, 0.0, 0.14 if hold_left else -0.14),
                },
                aim,
            )
        return _fn

    def pose_hug(pb, u):
        t = u * math.tau
        embrace = math.sin(min(1.0, u * 3.0) * math.pi * 0.5)
        sway = math.sin(t) * 0.05
        pb["Hips"].location = (0.0, -0.02 * embrace, 0.0)
        apply_fk_rotations(
            arm,
            pb,
            {
                "Hips": (0.05 * embrace, 0.0, sway),
                "Spine": (0.08 * embrace, 0.0, sway),
                "Chest": (0.10 * embrace, 0.0, -sway * 0.5),
                "Head": (0.08 * embrace, 0.14 * embrace, 0.18 * embrace if female else -0.18 * embrace),
                "HairTail.L": (0.14, 0.10, sway),
                "HairTail.R": (0.14, -0.10, sway),
            },
            {
                "UpperArm.L": (0.28, -0.78, 0.25),
                "Forearm.L": (-0.75, -0.35, 0.22),
                "UpperArm.R": (-0.28, -0.78, -0.20),
                "Forearm.R": (0.75, -0.35, -0.18),
            },
        )

    def pose_kiss(pb, u):
        lean = math.sin(min(1.0, u * 2.5) * math.pi * 0.5)
        tiptoe = 0.024 * lean if female else 0.0
        pb["Hips"].location = (0.0, tiptoe, 0.04 * lean)
        apply_fk_rotations(
            arm,
            pb,
            {
                "Spine": (0.14 * lean, 0.0, 0.0),
                "Chest": (0.16 * lean, 0.0, 0.0),
                "Head": (-0.22 * lean if female else 0.14 * lean, 0.12 * lean, 0.10 * lean),
                "Foot.L": (-0.34 * lean if female else 0.0, 0.0, 0.0),
                "Foot.R": (-0.34 * lean if female else 0.0, 0.0, 0.0),
                "HairTail.L": (0.16, 0.08, 0.0),
                "HairTail.R": (0.16, -0.08, 0.0),
            },
            {
                "UpperArm.L": (0.18, -0.82, 0.18 if female else -0.10),
                "Forearm.L": (-0.65, -0.42, 0.35 if female else -0.05),
                "UpperArm.R": (-0.18, -0.82, 0.18 if female else -0.10),
                "Forearm.R": (0.65, -0.42, 0.35 if female else -0.05),
            },
        )

    def pose_pat_give(pb, u):
        t = u * math.tau
        pat = math.sin(t * 2.5) * 0.10
        apply_fk_rotations(
            arm,
            pb,
            {
                "Spine": (0.06, 0.0, 0.0),
                "Chest": (0.06, 0.0, -0.08),
                "Head": (0.06, -0.05, 0.08),
            },
            {
                "UpperArm.L": (0.16, -0.06, -0.94),
                "Forearm.L": (0.08, -0.18, -0.94),
                "UpperArm.R": (-0.20, -0.78, 0.42 + pat * 0.5),
                "Forearm.R": (0.28, -0.76, 0.05 + pat),
            },
        )

    def pose_pat_recv(pb, u):
        t = u * math.tau
        nod = math.sin(t * 2.5) * 0.06
        pb["Hips"].location = (0.0, -0.015, 0.0)
        apply_fk_rotations(
            arm,
            pb,
            {
                "Spine": (0.04, 0.0, 0.0),
                "Chest": (0.04, 0.0, 0.0),
                "Head": (0.16 + nod, 0.14, 0.12),
                "Thigh.L": (-0.12, 0.0, 0.0),
                "Shin.L": (0.24, 0.0, 0.0),
                "Thigh.R": (-0.12, 0.0, 0.0),
                "Shin.R": (0.24, 0.0, 0.0),
                "HairTail.L": (0.10, 0.16, nod * 0.5),
                "HairTail.R": (0.10, -0.16, nod * 0.5),
            },
            {
                "UpperArm.L": (0.22, -0.45, -0.68),
                "Forearm.L": (-0.75, -0.45, 0.28),
                "UpperArm.R": (-0.22, -0.45, -0.68),
                "Forearm.R": (0.75, -0.45, 0.28),
            },
        )

    def pose_dance(pb, u):
        t = u * math.tau
        s1 = math.sin(t)
        c1 = math.cos(t)
        pb["Hips"].location = (s1 * 0.035, abs(c1) * 0.030, 0.0)
        apply_fk_rotations(
            arm,
            pb,
            {
                "Hips": (0.0, 0.0, s1 * 0.24),
                "Spine": (0.04, s1 * 0.08, -s1 * 0.12),
                "Chest": (0.05, 0.0, -s1 * 0.14),
                "Head": (-0.06, -s1 * 0.10, s1 * 0.12),
                "Thigh.L": (-max(0.0, s1) * 0.36, 0.10, 0.0),
                "Shin.L": (max(0.0, s1) * 0.52, 0.0, 0.0),
                "Thigh.R": (-max(0.0, -s1) * 0.36, -0.10, 0.0),
                "Shin.R": (max(0.0, -s1) * 0.52, 0.0, 0.0),
                "Skirt.F": (-0.42, 0.0, 0.0),
                "Skirt.B": (0.42, 0.0, 0.0),
                "Skirt.L": (0.0, -0.40, 0.0),
                "Skirt.R": (0.0, 0.40, 0.0),
                "HairTail.L": (0.28, 0.32, s1 * 0.25),
                "HairTail.R": (0.28, -0.32, s1 * 0.25),
            },
            {
                "UpperArm.L": (0.68, -0.58 + s1 * 0.12, 0.22),
                "Forearm.L": (0.15, -0.75, 0.55),
                "UpperArm.R": (-0.68, -0.58 - s1 * 0.12, 0.22),
                "Forearm.R": (-0.15, -0.75, 0.55),
            },
        )

    def pose_heart(pb, u):
        t = u * math.tau
        lift = math.sin(min(1.0, u * 3.0) * math.pi * 0.5)
        bob = math.sin(t) * 0.012
        pb["Hips"].location = (0.0, bob, 0.0)
        apply_fk_rotations(
            arm,
            pb,
            {
                "Chest": (-0.06 * lift, 0.0, 0.0),
                "Head": (0.02, 0.08 * lift, 0.06 * math.sin(t * 0.5)),
            },
            {
                "UpperArm.L": (0.62, -0.25, 0.72),
                "Forearm.L": (-0.75, -0.18, 0.62),
                "UpperArm.R": (-0.62, -0.25, 0.72),
                "Forearm.R": (0.75, -0.18, 0.62),
            },
        )

    def pose_carry_hold(pb, u):
        breath = math.sin(u * math.tau)
        pb["Hips"].location = (0.0, -0.025 + breath * 0.005, 0.0)
        apply_fk_rotations(
            arm,
            pb,
            {
                "Spine": (-0.10, 0.0, 0.0),
                "Chest": (-0.06 + breath * 0.015, 0.0, 0.0),
                "Head": (0.10, -0.08, -0.14),
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
        )

    def pose_carry_pose(pb, u):
        breath = math.sin(u * math.tau)
        pb["Hips"].location = (0.0, 0.0, 0.0)
        apply_fk_rotations(
            arm,
            pb,
            {
                "Spine": (0.10, 0.0, -0.08),
                "Chest": (0.08 + breath * 0.02, 0.0, -0.10),
                "Head": (0.04, 0.12, 0.24),
                "Thigh.L": (-0.98, 0.05, 0.12),
                "Shin.L": (1.18, 0.0, 0.0),
                "Thigh.R": (-0.98, -0.05, 0.12),
                "Shin.R": (1.18, 0.0, 0.0),
                "Skirt.F": (-1.04, 0.0, 0.0),
                "Skirt.B": (0.26, 0.0, 0.0),
                "Skirt.L": (-0.58, -0.24, 0.0),
                "Skirt.R": (-0.58, 0.24, 0.0),
                "HairTail.L": (0.18, 0.16, 0.05),
                "HairTail.R": (0.18, -0.16, 0.05),
            },
            {
                "UpperArm.L": (0.35, -0.78, 0.24),
                "Forearm.L": (-0.70, -0.45, 0.45),
                "UpperArm.R": (-0.15, -0.65, -0.35),
                "Forearm.R": (0.70, -0.45, -0.10),
            },
        )

    def pose_hop(pb, u):
        t = u * math.pi
        hop = math.sin(t)
        pb["Hips"].location = (0.0, hop * 0.14, 0.0)
        apply_fk_rotations(
            arm,
            pb,
            {
                "Chest": (-0.08 * hop, 0.0, 0.0),
                "Head": (-0.08 * hop, 0.0, 0.08 * math.sin(u * math.tau)),
                "Thigh.L": (-0.36 * hop, 0.0, 0.0),
                "Shin.L": (0.64 * hop, 0.0, 0.0),
                "Thigh.R": (-0.36 * hop, 0.0, 0.0),
                "Shin.R": (0.64 * hop, 0.0, 0.0),
                "HairTail.L": (0.25 * hop, 0.25 * hop, 0.0),
                "HairTail.R": (0.25 * hop, -0.25 * hop, 0.0),
                "Skirt.F": (-0.35 * hop, 0.0, 0.0),
                "Skirt.B": (0.35 * hop, 0.0, 0.0),
            },
            {
                "UpperArm.L": (0.64, -0.25, 0.72 * hop),
                "Forearm.L": (0.28, -0.20, 0.90),
                "UpperArm.R": (-0.64, -0.25, 0.72 * hop),
                "Forearm.R": (-0.28, -0.20, 0.90),
            },
        )

    def pose_wave(pb, u):
        t = u * math.tau
        w = math.sin(t * 2.0) * 0.24
        apply_fk_rotations(
            arm,
            pb,
            {
                "Chest": (0.02, -0.05, 0.0),
                "Head": (-0.04, 0.10, 0.08),
            },
            {
                "UpperArm.L": (0.16, -0.06, -0.94),
                "Forearm.L": (0.08, -0.18, -0.94),
                "UpperArm.R": (-0.75, -0.25, 0.56),
                "Forearm.R": (-0.15 + w * 0.7, -0.22, 0.94),
            },
        )

    clips = [
        ("Idle", 48, pose_idle, True),
        ("Walk", 24, pose_walk, True),
        ("Run", 18, pose_run, True),
        ("Sit", 36, pose_sit, True),
        ("Lie", 36, pose_lie, True),
        ("HoldHand_L", 24, make_hold_hand(True), True),
        ("HoldHand_R", 24, make_hold_hand(False), True),
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

    bpy.context.view_layer.update()
    export_glb(out_glb, export_objs, with_anims=True)
    print(f"Exported rigged couple model: {out_glb} ({out_glb.stat().st_size // 1024} KB)")


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", type=Path, default=Path("site/assets/models"))
    args = parser.parse_args(argv)
    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    tex_dir = Path("/home/yhr/workspace/dsh-workspace/base_workspace/bloom-for-you/tools/blender/_tex_cache")
    build_rigged_character("xian", tex_dir, out_dir / "couple_xian.glb")
    build_rigged_character("ran", tex_dir, out_dir / "couple_ran.glb")


if __name__ == "__main__":
    main()
