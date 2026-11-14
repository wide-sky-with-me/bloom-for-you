#!/usr/bin/env python3
"""Build museum-grade sculpted & UV-textured Two-Story French Provençal Coastal Villa GLB (`coastal_villa.glb`).

Built in exact world-datum alignment (`Y-up glTF 2.0 via yup(x, y, z)`) so every 1F/2F room,
stairwell void, doorway cutout, furniture collider, camera preset, and keepsake letter spot
(`(-7.40, 3.40, -8.17)`) matches `world-spatial.js` 1:1 with zero interior clipping.

Named interactive subnodes preserved in hierarchy:
  - Villa_FrontDoor_L, Villa_FrontDoor_R
  - Fridge_Door
  - Armoire_Door_L, Armoire_Door_R
  - Gramophone_Disc, Study_Globe, Coffee_Lever

Usage:
  PATH=/usr/bin:/bin PYTHONPATH=/home/yhr/.local/lib/python3.12/site-packages \
    blender -b --factory-startup --python tools/blender/build_villa_estate_glb.py \
    -- --out-dir site/assets/models
"""

from __future__ import annotations

import argparse
import math
import random
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from blender_kit import (
    add_beveled_box,
    add_cylinder_part,
    add_lathe_part,
    add_tube_along_curve,
    add_uv_sphere_part,
    clamp01,
    create_mesh_object,
    ensure_uv_box,
    ensure_uv_planar_rect,
    export_glb,
    fbm2,
    make_packed_normal_texture,
    make_packed_roughness_texture,
    make_packed_texture,
    make_pbr_material,
    mix_rgb,
    reset_scene,
    yup,
)

TEX_CACHE = SCRIPT_DIR / "_tex_cache"


def _make_villa_textures():
    img_plaster = make_packed_texture(
        TEX_CACHE / "villa_plaster.png",
        256,
        256,
        lambda u, v: (*mix_rgb((0.95, 0.90, 0.82), (0.99, 0.96, 0.91), fbm2(u * 8, v * 8, seed=101, octaves=3)), 1.0),
    )
    img_stone = make_packed_texture(
        TEX_CACHE / "villa_limestone.png",
        256,
        256,
        lambda u, v: (
            lambda n, seam: (*mix_rgb(mix_rgb((0.83, 0.79, 0.72), (0.91, 0.88, 0.82), n), (0.64, 0.60, 0.54), seam * 0.55), 1.0)
        )(
            fbm2(u * 8, v * 8, seed=102, octaves=3),
            1.0 if ((v * 5.0) % 1.0) < 0.06 or (((u * 2.5 + (0.5 if int(v * 5.0) % 2 else 0.0)) % 1.0) < 0.05) else 0.0,
        ),
    )
    def _plank_tone_and_seam(u: float, v: float):
        col = int(u * 8.0)
        off = 0.5 if (col % 2) else 0.0
        row = int(v * 3.0 + off)
        fu = min((u * 8.0) % 1.0, 1.0 - (u * 8.0) % 1.0)
        fv = min(((v * 3.0 + off) % 1.0), 1.0 - ((v * 3.0 + off) % 1.0))
        seam = clamp01(min(fu * 22.0, fv * 14.0))
        grain = fbm2(u * 28.0 + (col * 1.7), v * 4.5 + (row * 2.3), seed=103 + (col % 5), octaves=3)
        board_shift = (((col * 37 + row * 19) % 7) - 3) * 0.025
        return seam, clamp01(0.45 + grain * 0.45 + board_shift)

    img_parquet = make_packed_texture(
        TEX_CACHE / "villa_parquet.png",
        256,
        256,
        lambda u, v: (
            lambda seam, g: (*mix_rgb((0.55, 0.37, 0.22), (0.74, 0.54, 0.35), clamp01(g - (1.0 - seam) * 0.24)), 1.0)
        )(*_plank_tone_and_seam(u, v)),
    )
    img_roof = make_packed_texture(
        TEX_CACHE / "villa_terracotta.png",
        256,
        256,
        lambda u, v: (
            lambda wave, n: (*mix_rgb((0.68, 0.31, 0.20), (0.86, 0.48, 0.33), clamp01(0.45 + 0.32 * wave + (n - 0.5) * 0.4)), 1.0)
        )(math.sin(u * math.tau * 8.0), fbm2(u * 10, v * 10, seed=104, octaves=3)),
    )
    img_zellige = make_packed_texture(
        TEX_CACHE / "villa_zellige.png",
        256,
        256,
        lambda u, v: (
            lambda checker, grout: (
                *mix_rgb(
                    mix_rgb((0.97, 0.94, 0.91), (0.87, 0.65, 0.69), checker),
                    (0.75, 0.72, 0.69),
                    grout,
                ),
                1.0,
            )
        )(
            1.0 if (int(u * 8.0) + int(v * 8.0)) % 2 == 0 else 0.0,
            1.0 if ((u * 8.0) % 1.0) < 0.07 or ((v * 8.0) % 1.0) < 0.07 else 0.0,
        ),
    )
    img_rug_rose = make_packed_texture(
        TEX_CACHE / "villa_aubusson_rose.png",
        256,
        256,
        lambda u, v: (
            lambda border, med, n: (
                *mix_rgb(
                    mix_rgb((0.88, 0.80, 0.74), (0.76, 0.45, 0.50), max(border, med)),
                    (0.60, 0.67, 0.56),
                    clamp01(0.45 * border * (0.5 + 0.5 * math.sin((u + v) * 28.0)) + (n - 0.5) * 0.12),
                ),
                1.0,
            )
        )(
            1.0 if min(u, 1 - u, v, 1 - v) < 0.14 and min(u, 1 - u, v, 1 - v) > 0.05 else 0.0,
            1.0 if math.hypot((u - 0.5) * 1.4, (v - 0.5) * 1.4) < 0.34 else 0.0,
            fbm2(u * 16, v * 16, seed=105),
        ),
    )
    img_rug_sage = make_packed_texture(
        TEX_CACHE / "villa_aubusson_sage.png",
        256,
        256,
        lambda u, v: (
            lambda border, med: (*mix_rgb((0.91, 0.87, 0.79), (0.49, 0.60, 0.52), max(border, med)), 1.0)
        )(
            1.0 if min(u, 1 - u, v, 1 - v) < 0.14 and min(u, 1 - u, v, 1 - v) > 0.05 else 0.0,
            1.0 if math.hypot((u - 0.5) * 1.4, (v - 0.5) * 1.4) < 0.32 else 0.0,
        ),
    )

    def _globe_pixel(u, v):
        lon = u * math.tau
        lat = (v - 0.5) * math.pi
        cx = math.cos(lat) * math.cos(lon)
        cy = math.sin(lat)
        cz = math.cos(lat) * math.sin(lon)
        cont = fbm2(cx * 2.1 + cy * 1.3 + 4.2, cz * 2.1 - cy * 1.1 + 1.7, seed=71)
        land = clamp01((cont - 0.48) * 10.0)
        sea = mix_rgb((0.88, 0.82, 0.68), (0.83, 0.77, 0.63), fbm2(u * 6.0, v * 6.0, seed=72))
        earth = mix_rgb((0.55, 0.62, 0.44), (0.68, 0.56, 0.38), fbm2(u * 9.0, v * 9.0, seed=73))
        col = mix_rgb(sea, earth, land)
        # Subtle engraved graticule & equator line
        grid = min(abs((u * 12.0) % 1.0 - 0.5), abs((v * 6.0) % 1.0 - 0.5))
        if abs(v - 0.5) < 0.012:
            col = mix_rgb(col, (0.58, 0.40, 0.22), 0.75)
        elif grid < 0.025:
            col = mix_rgb(col, (0.58, 0.48, 0.36), 0.35)
        return (*col, 1.0)

    img_globe = make_packed_texture(TEX_CACHE / "villa_antique_globe.png", 256, 128, _globe_pixel)
    return {
        "plaster": img_plaster,
        "stone": img_stone,
        "parquet": img_parquet,
        "roof": img_roof,
        "zellige": img_zellige,
        "rug_rose": img_rug_rose,
        "rug_sage": img_rug_sage,
        "globe": img_globe,
    }


def _new_empty(name: str, parent=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    if parent is not None:
        e.parent = parent
    return e


def _part(name: str, fn, mat, uv_scale: float = 0.5, parent=None):
    bm = bmesh.new()
    fn(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = create_mesh_object(name, bm, mat)
    ensure_uv_box(obj, scale=uv_scale)
    if parent is not None:
        obj.parent = parent
    return obj


def _add_roof_quad(bm, p_bl, p_br, p_tr, p_tl):
    v0 = bm.verts.new(yup(*p_bl))
    v1 = bm.verts.new(yup(*p_br))
    v2 = bm.verts.new(yup(*p_tr))
    v3 = bm.verts.new(yup(*p_tl))
    bm.faces.new((v0, v1, v2, v3))


def _add_roof_tri(bm, p_a, p_b, p_c):
    bm.faces.new((bm.verts.new(yup(*p_a)), bm.verts.new(yup(*p_b)), bm.verts.new(yup(*p_c))))


def _add_balustrade_seg(bm_stone, bm_iron, bm_brass, axis, u0, u1, fixed_pos, base_y):
    length = u1 - u0
    if length <= 0.12:
        return
    mid_u = (u0 + u1) * 0.5
    count = max(2, int(length / 0.25))
    if axis == "x":
        add_beveled_box(bm_stone, yup(mid_u, base_y + 0.92, fixed_pos), (length, 0.09, 0.055), bevel=0.01)
        add_beveled_box(bm_stone, yup(mid_u, base_y + 0.06, fixed_pos), (length, 0.115, 0.08), bevel=0.01)
        for i in range(count + 1):
            bx = u0 + 0.05 + (i / count) * (length - 0.10)
            add_beveled_box(bm_iron, yup(bx, base_y + 0.49, fixed_pos), (0.024, 0.024, 0.80), bevel=0.004)
            if i % 3 == 1:
                add_uv_sphere_part(bm_brass, yup(bx, base_y + 0.50, fixed_pos), (0.048, 0.018, 0.048), 10, 6)
    else:
        add_beveled_box(bm_stone, yup(fixed_pos, base_y + 0.92, mid_u), (0.09, length, 0.055), bevel=0.01)
        add_beveled_box(bm_stone, yup(fixed_pos, base_y + 0.06, mid_u), (0.115, length, 0.08), bevel=0.01)
        for i in range(count + 1):
            bz = u0 + 0.05 + (i / count) * (length - 0.10)
            add_beveled_box(bm_iron, yup(fixed_pos, base_y + 0.49, bz), (0.024, 0.024, 0.80), bevel=0.004)
            if i % 3 == 1:
                add_uv_sphere_part(bm_brass, yup(fixed_pos, base_y + 0.50, bz), (0.018, 0.048, 0.048), 10, 6)


def _add_window_assembly(
    bms: dict,
    axis: str,
    u0: float,
    u1: float,
    fixed_pos: float,
    int_sign: float,
    floor_base: float,
    floor_top: float,
    bays: int = 3,
    theme: str = "sage",
    shutters: bool = True,
    flower_box: bool = True,
    sill_off: float = 0.76,
    drop_to_y: float | None = None,
):
    span = u1 - u0
    mid_u = (u0 + u1) * 0.5
    sill_y = floor_base + sill_off
    head_y = floor_top - 0.52
    sill_h = sill_y - floor_base
    head_h = floor_top - head_y
    win_h = head_y - sill_y
    win_mid_y = (sill_y + head_y) * 0.5
    ext_sign = -int_sign
    bm_pl = bms["plaster"]
    bm_st = bms["stone"]
    bm_md = bms["molding"]
    bm_gl = bms["glass"]
    bm_sh = bms["shutter"]
    bm_ir = bms["iron"]
    bm_pot = bms["terracotta"]
    bm_lf = bms["vine_leaf"]
    bm_fl = bms["hydrangea"]
    bm_br = bms["brass"]
    bm_sh_curt = bms["sheer"]
    bm_dr_curt = bms["drape"]
    bm_bois = bms["boiserie_sage"] if theme == "sage" else (bms["boiserie_study"] if theme == "study" else bms["boiserie_rose"])

    curt_bot = drop_to_y if drop_to_y is not None else floor_base
    drop_h = max(0.6, head_y + 0.12 - curt_bot)

    if axis == "x":
        add_beveled_box(bm_pl, yup(mid_u, floor_base + sill_h * 0.5, fixed_pos), (span, 0.24, sill_h), bevel=0.008)
        add_beveled_box(bm_pl, yup(mid_u, head_y + head_h * 0.5, fixed_pos), (span, 0.24, head_h), bevel=0.008)
        add_beveled_box(bm_bois, yup(mid_u, floor_base + min(0.88, sill_h) * 0.45, fixed_pos + int_sign * 0.115), (span - 0.04, 0.03, min(0.88, sill_h) * 0.9), bevel=0.004)
        add_beveled_box(bm_st, yup(mid_u, sill_y - 0.02, fixed_pos), (span + 0.22, 0.36, 0.08), bevel=0.015)
        add_beveled_box(bm_st, yup(mid_u, head_y + 0.05, fixed_pos), (span + 0.24, 0.32, 0.12), bevel=0.015)
        add_beveled_box(bm_st, yup(mid_u, head_y + 0.08, fixed_pos), (0.18, 0.36, 0.18), bevel=0.015)

        add_beveled_box(bm_gl, yup(mid_u, win_mid_y, fixed_pos), (span - 0.08, 0.022, win_h - 0.08), bevel=0.0)
        for b in range(bays + 1):
            mx = u0 + 0.03 + (b / bays) * (span - 0.06)
            add_beveled_box(bm_md, yup(mx, win_mid_y, fixed_pos), (0.048, 0.08, win_h), bevel=0.006)
        add_beveled_box(bm_md, yup(mid_u, sill_y + win_h * 0.62, fixed_pos), (span, 0.075, 0.042), bevel=0.006)

        if shutters:
            sw = min(0.46, span * 0.22)
            for s in (-1.0, 1.0):
                sx = (u0 - sw * 0.5 - 0.04) if s < 0 else (u1 + sw * 0.5 + 0.04)
                sz = fixed_pos + ext_sign * 0.14
                add_beveled_box(bm_sh, yup(sx, win_mid_y, sz), (sw, 0.044, win_h), bevel=0.008)
                for luv in range(7):
                    ly = sill_y + 0.14 + (luv / 6.0) * (win_h - 0.28)
                    add_beveled_box(bm_sh, yup(sx, ly, sz + ext_sign * 0.015), (sw * 0.82, 0.016, 0.035), rot_euler=(0.35, 0.0, 0.0), bevel=0.003)

        if flower_box:
            bx_z = fixed_pos + ext_sign * 0.24
            add_beveled_box(bm_ir, yup(mid_u, sill_y - 0.12, bx_z), (span * 0.84, 0.22, 0.18), bevel=0.01)
            add_beveled_box(bm_pot, yup(mid_u, sill_y - 0.11, bx_z), (span * 0.80, 0.18, 0.14), bevel=0.01)
            for off in (-span * 0.24, 0.0, span * 0.24):
                add_uv_sphere_part(bm_lf, yup(mid_u + off, sill_y - 0.04, bx_z), (0.18, 0.15, 0.14), 8, 6, noise_amp=0.22)
                add_uv_sphere_part(bm_fl, yup(mid_u + off, sill_y + 0.04, bx_z), (0.14, 0.12, 0.11), 8, 6, noise_amp=0.24)

        cz = fixed_pos + int_sign * 0.19
        add_cylinder_part(bm_br, yup(mid_u, head_y + 0.14, cz), 0.015, 0.015, span + 0.50, segs=8, rot_euler=(0.0, math.pi * 0.5, 0.0))
        for s in (-1.0, 1.0):
            add_beveled_box(bm_sh_curt, yup(mid_u + s * (span * 0.5 - 0.28), head_y + 0.12 - drop_h * 0.5, cz), (0.52, 0.05, drop_h), bevel=0.015)
            add_beveled_box(bm_dr_curt, yup(mid_u + s * (span * 0.5 + 0.02), head_y + 0.12 - drop_h * 0.5, cz + int_sign * 0.03), (0.36, 0.08, drop_h), bevel=0.02)
    else:
        add_beveled_box(bm_pl, yup(fixed_pos, floor_base + sill_h * 0.5, mid_u), (0.24, span, sill_h), bevel=0.008)
        add_beveled_box(bm_pl, yup(fixed_pos, head_y + head_h * 0.5, mid_u), (0.24, span, head_h), bevel=0.008)
        add_beveled_box(bm_bois, yup(fixed_pos + int_sign * 0.115, floor_base + min(0.88, sill_h) * 0.45, mid_u), (0.03, span - 0.04, min(0.88, sill_h) * 0.9), bevel=0.004)
        add_beveled_box(bm_st, yup(fixed_pos, sill_y - 0.02, mid_u), (0.36, span + 0.22, 0.08), bevel=0.015)
        add_beveled_box(bm_st, yup(fixed_pos, head_y + 0.05, mid_u), (0.32, span + 0.24, 0.12), bevel=0.015)
        add_beveled_box(bm_gl, yup(fixed_pos, win_mid_y, mid_u), (0.022, span - 0.08, win_h - 0.08), bevel=0.0)
        for b in range(bays + 1):
            mz = u0 + 0.03 + (b / bays) * (span - 0.06)
            add_beveled_box(bm_md, yup(fixed_pos, win_mid_y, mz), (0.08, 0.048, win_h), bevel=0.006)
        add_beveled_box(bm_md, yup(fixed_pos, sill_y + win_h * 0.62, mid_u), (0.075, span, 0.042), bevel=0.006)

        if shutters:
            sw = min(0.46, span * 0.22)
            for s in (-1.0, 1.0):
                sz = (u0 - sw * 0.5 - 0.04) if s < 0 else (u1 + sw * 0.5 + 0.04)
                sx = fixed_pos + ext_sign * 0.14
                add_beveled_box(bm_sh, yup(sx, win_mid_y, sz), (0.044, sw, win_h), bevel=0.008)
                for luv in range(7):
                    ly = sill_y + 0.14 + (luv / 6.0) * (win_h - 0.28)
                    add_beveled_box(bm_sh, yup(sx + ext_sign * 0.015, ly, sz), (0.016, sw * 0.82, 0.035), rot_euler=(0.0, 0.35, 0.0), bevel=0.003)

        if flower_box:
            bx_x = fixed_pos + ext_sign * 0.24
            add_beveled_box(bm_ir, yup(bx_x, sill_y - 0.12, mid_u), (0.22, span * 0.84, 0.18), bevel=0.01)
            add_beveled_box(bm_pot, yup(bx_x, sill_y - 0.11, mid_u), (0.18, span * 0.80, 0.14), bevel=0.01)
            for off in (-span * 0.22, span * 0.22):
                add_uv_sphere_part(bm_lf, yup(bx_x, sill_y - 0.04, mid_u + off), (0.15, 0.18, 0.14), 8, 6, noise_amp=0.22)
                add_uv_sphere_part(bm_fl, yup(bx_x, sill_y + 0.04, mid_u + off), (0.12, 0.14, 0.11), 8, 6, noise_amp=0.24)

        cx = fixed_pos + int_sign * 0.19
        add_cylinder_part(bm_br, yup(cx, head_y + 0.14, mid_u), 0.015, 0.015, span + 0.50, segs=8, rot_euler=(math.pi * 0.5, 0.0, 0.0))
        for s in (-1.0, 1.0):
            add_beveled_box(bm_sh_curt, yup(cx, head_y + 0.12 - drop_h * 0.5, mid_u + s * (span * 0.5 - 0.28)), (0.05, 0.52, drop_h), bevel=0.015)
            add_beveled_box(bm_dr_curt, yup(cx + int_sign * 0.03, head_y + 0.12 - drop_h * 0.5, mid_u + s * (span * 0.5 + 0.02)), (0.08, 0.36, drop_h), bevel=0.02)


def _add_door_leaf_bmesh(bm_frame, bm_glass, bm_brass, width: float, height: float, hinge_sign: float):
    cx = hinge_sign * (width * 0.5)
    add_beveled_box(bm_frame, yup(cx, height * 0.5, 0.0), (width, 0.052, height), bevel=0.008)
    add_beveled_box(bm_glass, yup(cx, height * 0.58, 0.0), (width - 0.18, 0.022, height * 0.52), bevel=0.0)
    add_beveled_box(bm_frame, yup(cx, height * 0.58, 0.0), (0.035, 0.06, height * 0.52), bevel=0.004)
    add_beveled_box(bm_frame, yup(cx, height * 0.58, 0.0), (width - 0.18, 0.06, 0.035), bevel=0.004)
    handle_x = hinge_sign * (width - 0.10)
    add_uv_sphere_part(bm_brass, yup(handle_x, 1.02, 0.04), (0.024, 0.032, 0.024), 8, 6)
    add_uv_sphere_part(bm_brass, yup(handle_x, 1.02, -0.04), (0.024, 0.032, 0.024), 8, 6)


def build_villa_estate_glb(out_path: Path) -> None:
    reset_scene()
    tex = _make_villa_textures()

    def _h_plaster(u: float, v: float) -> float:
        return clamp01(0.45 + 0.55 * fbm2(u * 10.0, v * 10.0, seed=71, octaves=3) + 0.14 * (fbm2(u * 26.0, v * 26.0, seed=171, octaves=2) - 0.5))

    def _h_stone(u: float, v: float) -> float:
        row = int(v * 5.0)
        off = 0.5 if (row % 2) else 0.0
        dv = min((v * 5.0) % 1.0, 1.0 - (v * 5.0) % 1.0)
        du = min(((u * 2.5 + off) % 1.0), 1.0 - ((u * 2.5 + off) % 1.0))
        mortar = clamp01(min(dv, du * 0.85) * 14.0)
        return clamp01(mortar * (0.78 + 0.22 * fbm2(u * 10.0, v * 10.0, seed=11, octaves=3)))

    def _h_parquet(u: float, v: float) -> float:
        col = int(u * 8.0)
        off = 0.5 if (col % 2) else 0.0
        row = int(v * 3.0 + off)
        fu = min((u * 8.0) % 1.0, 1.0 - (u * 8.0) % 1.0)
        fv = min(((v * 3.0 + off) % 1.0), 1.0 - ((v * 3.0 + off) % 1.0))
        seam = clamp01(min(fu * 22.0, fv * 14.0))
        grain = fbm2(u * 28.0 + (col * 1.7), v * 4.5 + (row * 2.3), seed=103 + (col % 5), octaves=2)
        return clamp01(seam * (0.80 + 0.20 * grain))

    def _h_roof(u: float, v: float) -> float:
        wave = math.sin(u * math.tau * 8.0) * 0.5 + 0.5
        row_step = ((v * 6.0) % 1.0)
        lip = 1.0 - clamp01((0.12 - row_step) * 10.0) * 0.45
        return clamp01((0.35 + 0.55 * wave) * lip + (fbm2(u * 12.0, v * 12.0, seed=53, octaves=2) - 0.5) * 0.18)

    def _h_zellige(u: float, v: float) -> float:
        fu = min((u * 8.0) % 1.0, 1.0 - (u * 8.0) % 1.0)
        fv = min((v * 8.0) % 1.0, 1.0 - (v * 8.0) % 1.0)
        grout = clamp01(min(fu, fv) * 14.0)
        ripple = fbm2(u * 16.0, v * 16.0, seed=64, octaves=2)
        return clamp01(grout * (0.78 + 0.22 * ripple))

    nrm_plaster = make_packed_normal_texture(TEX_CACHE / "villa_plaster_nrm.png", 256, 256, _h_plaster, strength=1.2)
    nrm_stone = make_packed_normal_texture(TEX_CACHE / "villa_stone_nrm.png", 256, 256, _h_stone, strength=2.6)
    rgh_stone = make_packed_roughness_texture(TEX_CACHE / "villa_stone_rgh.png", 256, 256, lambda u, v: 0.90 - 0.22 * _h_stone(u, v))
    nrm_parquet = make_packed_normal_texture(TEX_CACHE / "villa_parquet_nrm.png", 256, 256, _h_parquet, strength=1.9)
    rgh_parquet = make_packed_roughness_texture(TEX_CACHE / "villa_parquet_rgh.png", 256, 256, lambda u, v: 0.68 - 0.30 * _h_parquet(u, v))
    nrm_roof = make_packed_normal_texture(TEX_CACHE / "villa_roof_nrm.png", 256, 256, _h_roof, strength=2.8)
    nrm_zellige = make_packed_normal_texture(TEX_CACHE / "villa_zellige_nrm.png", 256, 256, _h_zellige, strength=2.4)
    rgh_zellige = make_packed_roughness_texture(TEX_CACHE / "villa_zellige_rgh.png", 256, 256, lambda u, v: 0.72 - 0.56 * _h_zellige(u, v))

    def _make_aubusson_rug(filename: str, base_rgb, med_rgb, border_rgb, accent_rgb, seed: int):
        def _col(u: float, v: float) -> tuple:
            dx = (u - 0.5) * 2.0
            dy = (v - 0.5) * 2.0
            r_ell = math.sqrt((dx * 0.86) ** 2 + dy ** 2)
            box = max(abs(dx), abs(dy))
            weave = (math.sin(u * 260.0) * math.cos(v * 260.0)) * 0.04 + (fbm2(u * 24.0, v * 24.0, seed=seed, octaves=2) - 0.5) * 0.08
            c = base_rgb
            if 0.78 <= box <= 0.87 or 0.92 <= box <= 0.955:
                c = border_rgb
            elif 0.87 < box < 0.92:
                floral = 0.5 + 0.5 * math.cos((dx + dy) * 26.0)
                c = mix_rgb(border_rgb, accent_rgb, floral * 0.75)
            elif r_ell < 0.42:
                ring = math.exp(-((r_ell - 0.34) ** 2) / 0.0022)
                petals = 0.5 + 0.5 * math.cos(math.atan2(dy, dx) * 12.0)
                c = mix_rgb(med_rgb, accent_rgb, clamp01(ring * 0.72 + (1.0 - r_ell * 2.0) * petals * 0.45))
            if box > 0.968:
                fringe = 0.5 + 0.5 * math.sin((u + v) * 220.0)
                c = mix_rgb((0.92, 0.88, 0.80), (0.80, 0.74, 0.66), fringe * 0.45)
            return (clamp01(c[0] + weave), clamp01(c[1] + weave), clamp01(c[2] + weave), 1.0)
        return make_packed_texture(TEX_CACHE / filename, 256, 256, _col)

    img_rug_rose_hq = _make_aubusson_rug(
        "villa_aubusson_rose_hq.png",
        (0.92, 0.84, 0.82),
        (0.95, 0.89, 0.86),
        (0.76, 0.49, 0.54),
        (0.86, 0.67, 0.52),
        seed=801,
    )
    img_rug_sage_hq = _make_aubusson_rug(
        "villa_aubusson_sage_hq.png",
        (0.86, 0.88, 0.82),
        (0.92, 0.92, 0.86),
        (0.46, 0.58, 0.48),
        (0.82, 0.72, 0.50),
        seed=802,
    )
    nrm_rug = make_packed_normal_texture(
        TEX_CACHE / "villa_rug_nrm.png",
        256,
        256,
        lambda u, v: clamp01(0.5 + 0.3 * math.sin(u * 240.0) * math.cos(v * 240.0) + 0.2 * fbm2(u * 30.0, v * 30.0, seed=803, octaves=2)),
        strength=1.4,
    )

    m_plaster = make_pbr_material("Villa_Plaster", (0.97, 0.94, 0.88), roughness=0.78, image=tex["plaster"], normal_image=nrm_plaster, normal_strength=0.38)
    m_stone = make_pbr_material("Villa_Limestone", (0.87, 0.84, 0.77), roughness=0.76, image=tex["stone"], normal_image=nrm_stone, normal_strength=0.52, roughness_image=rgh_stone)
    m_coping = make_pbr_material("Villa_Coping", (0.93, 0.90, 0.84), roughness=0.68, image=tex["plaster"], normal_image=nrm_stone, normal_strength=0.28)
    m_parquet = make_pbr_material("Villa_Parquet", (0.74, 0.55, 0.37), roughness=0.42, image=tex["parquet"], normal_image=nrm_parquet, normal_strength=0.30, roughness_image=rgh_parquet, specular=0.48)
    m_cedar = make_pbr_material("Villa_Cedar", (0.60, 0.41, 0.25), roughness=0.56, image=tex["parquet"], normal_image=nrm_parquet, normal_strength=0.45, roughness_image=rgh_parquet)
    m_walnut = make_pbr_material("Villa_Walnut", (0.34, 0.21, 0.13), roughness=0.38, normal_image=nrm_parquet, normal_strength=0.22, specular=0.45)
    m_oak = make_pbr_material("Villa_NaturalOak", (0.76, 0.58, 0.38), roughness=0.46, normal_image=nrm_parquet, normal_strength=0.22)
    m_roof = make_pbr_material("Villa_TerracottaRoof", (0.81, 0.44, 0.30), roughness=0.70, image=tex["roof"], normal_image=nrm_roof, normal_strength=0.65, double_sided=True)
    m_pot = make_pbr_material("Villa_TerracottaPot", (0.74, 0.39, 0.27), roughness=0.70)
    m_shutter = make_pbr_material("Villa_SageShutter", (0.43, 0.55, 0.46), roughness=0.54)
    m_bois_sage = make_pbr_material("Villa_BoiserieSage", (0.76, 0.84, 0.76), roughness=0.60, normal_image=nrm_plaster, normal_strength=0.22)
    m_bois_study = make_pbr_material("Villa_BoiserieStudy", (0.86, 0.81, 0.72), roughness=0.62, normal_image=nrm_plaster, normal_strength=0.22)
    m_bois_rose = make_pbr_material("Villa_BoiserieRose", (0.92, 0.83, 0.85), roughness=0.60, normal_image=nrm_plaster, normal_strength=0.22)
    m_molding = make_pbr_material("Villa_CreamMolding", (0.98, 0.96, 0.91), roughness=0.48)
    m_ceil = make_pbr_material("Villa_CeilingPlaster", (0.98, 0.96, 0.93), roughness=0.80, normal_image=nrm_plaster, normal_strength=0.25, double_sided=True)
    m_iron = make_pbr_material("Villa_WroughtIron", (0.16, 0.18, 0.20), roughness=0.36, metallic=0.86)
    m_brass = make_pbr_material("Villa_Brass", (0.84, 0.67, 0.36), roughness=0.20, metallic=0.92)
    m_glass = make_pbr_material("Villa_Glass", (0.85, 0.94, 0.96), roughness=0.05, alpha=0.28, double_sided=True)
    m_sheer = make_pbr_material("Villa_SheerCurtain", (0.99, 0.97, 0.94), roughness=0.85, alpha=0.62, double_sided=True)
    m_drape = make_pbr_material("Villa_RoseDrape", (0.79, 0.49, 0.56), roughness=0.80, double_sided=True)
    m_velvet = make_pbr_material("Villa_RoseVelvet", (0.77, 0.43, 0.51), roughness=0.84)
    m_sage_vel = make_pbr_material("Villa_SageVelvet", (0.46, 0.60, 0.49), roughness=0.84)
    m_zellige = make_pbr_material("Villa_ZelligeTile", (0.95, 0.90, 0.89), roughness=0.22, image=tex["zellige"], normal_image=nrm_zellige, normal_strength=0.75, roughness_image=rgh_zellige, specular=0.65)
    m_smeg = make_pbr_material("Villa_SmegMint", (0.68, 0.84, 0.77), roughness=0.18, metallic=0.10, specular=0.65)
    m_marble = make_pbr_material("Villa_CalacattaMarble", (0.97, 0.96, 0.94), roughness=0.18, specular=0.62)
    m_linen = make_pbr_material("Villa_IvoryLinen", (0.98, 0.96, 0.91), roughness=0.76)
    m_rug_rose = make_pbr_material("Villa_RugRose", (0.94, 0.86, 0.86), roughness=0.92, image=img_rug_rose_hq, normal_image=nrm_rug, normal_strength=0.55)
    m_rug_sage = make_pbr_material("Villa_RugSage", (0.88, 0.90, 0.86), roughness=0.92, image=img_rug_sage_hq, normal_image=nrm_rug, normal_strength=0.55)
    m_leaf = make_pbr_material("Villa_VineLeaf", (0.27, 0.45, 0.22), roughness=0.78)
    m_hyd = make_pbr_material("Villa_HydrangeaPink", (0.96, 0.61, 0.73), roughness=0.65)
    m_amber = make_pbr_material("Villa_LampEmber", (1.0, 0.80, 0.44), roughness=0.25, emission=(1.0, 0.62, 0.24), emission_strength=0.42)
    m_emerald = make_pbr_material("Villa_EmeraliteGlass", (0.95, 0.90, 0.76), roughness=0.45, emission=(1.0, 0.82, 0.50), emission_strength=0.10)
    m_globe = make_pbr_material("Villa_AntiqueGlobe", (1.0, 1.0, 1.0), roughness=0.42, image=tex["globe"])
    m_soot = make_pbr_material("Villa_HearthSoot", (0.11, 0.11, 0.12), roughness=0.92, metallic=0.06)

    root = _new_empty("CoastalVillaRoot")

    # Shared accumulators by material
    bms = {
        k: bmesh.new()
        for k in (
            "plaster", "stone", "coping", "parquet", "cedar", "walnut", "oak",
            "roof", "terracotta", "shutter", "boiserie_sage", "boiserie_study", "boiserie_rose",
            "molding", "ceil", "iron", "brass", "glass", "sheer", "drape",
            "velvet", "sage_vel", "zellige", "smeg", "marble", "linen",
            "rug_rose", "rug_sage", "vine_leaf", "hydrangea", "ember", "emerald", "soot",
        )
    }

    y1_b, y1_t = 2.60, 6.00
    h1 = y1_t - y1_b
    m1 = 0.5 * (y1_b + y1_t)
    y2_b, y2_t = 6.12, 9.40
    h2 = y2_t - y2_b
    m2 = 0.5 * (y2_b + y2_t)

    # =========================================================================
    # 1. PLINTH, STAIRWAYS, VERANDA DECKS & FLOORS
    # =========================================================================
    # Zero-overlap floor architecture: plinth (top=2.515) < perimeter coping (top=2.596) < cedar (top=2.599) < SE stone patio (top=2.602) < 1F parquet (top=2.606)
    add_beveled_box(bms["stone"], yup(-14.0, 2.155, -2.0), (22.36, 17.16, 0.72), bevel=0.04)
    add_beveled_box(bms["coping"], yup(-14.0, 2.560, 6.56), (22.48, 0.16, 0.072), bevel=0.015)
    add_beveled_box(bms["coping"], yup(-14.0, 2.560, -10.56), (22.48, 0.16, 0.072), bevel=0.015)
    add_beveled_box(bms["coping"], yup(-25.16, 2.560, -2.0), (0.16, 16.96, 0.072), bevel=0.015)
    add_beveled_box(bms["coping"], yup(-2.84, 2.560, -2.0), (0.16, 16.96, 0.072), bevel=0.015)

    add_beveled_box(bms["cedar"], yup(-17.74, 2.565, 5.24), (14.68, 2.48, 0.068), bevel=0.008)
    add_beveled_box(bms["cedar"], yup(-14.0, 2.565, -10.14), (22.16, 0.68, 0.068), bevel=0.008)
    add_beveled_box(bms["cedar"], yup(-24.24, 2.565, -2.9), (1.68, 13.80, 0.068), bevel=0.008)
    add_beveled_box(bms["coping"], yup(-6.66, 2.566, 2.54), (7.48, 7.88, 0.072), bevel=0.01)

    # 1F Parquet + 2F Parquet (with Stairwell Void X in [-23.2, -20.0], Z in [-9.6, -3.2])
    add_beveled_box(bms["parquet"], yup(-16.9, 2.578, -2.9), (13.0, 13.8, 0.056), bevel=0.005)
    add_beveled_box(bms["parquet"], yup(-7.2, 2.578, -5.6), (6.4, 8.4, 0.056), bevel=0.005)

    # Disjoint 1F soffit ceilings (top <= 6.064) and 2F decks/parquet (bot >= 6.078, top = 6.122 / study = 6.118)
    add_beveled_box(bms["ceil"], yup(-15.2, 6.020, -2.9), (9.6, 13.8, 0.088), bevel=0.0)
    add_beveled_box(bms["ceil"], yup(-21.7, 6.020, 0.4), (3.4, 7.2, 0.088), bevel=0.0)
    add_beveled_box(bms["coping"], yup(-7.55, 6.052, -5.6), (7.3, 8.6, 0.132), bevel=0.015)
    add_beveled_box(bms["ceil"], yup(-7.2, 5.960, -5.6), (6.4, 8.4, 0.040), bevel=0.0)
    add_beveled_box(bms["parquet"], yup(-15.6, 6.100, -2.9), (8.8, 13.6, 0.044), bevel=0.0)
    add_beveled_box(bms["parquet"], yup(-21.65, 6.100, 0.35), (3.3, 7.1, 0.044), bevel=0.0)
    add_beveled_box(bms["parquet"], yup(-21.6, 6.100, -9.3), (3.2, 0.9, 0.044), bevel=0.0)
    add_beveled_box(bms["ceil"], yup(-17.3, 9.40, -2.9), (12.4, 14.0, 0.10), bevel=0.0)

    # Walnut Ceiling Beams 1F & 2F
    for bx in (-21.8, -19.2, -16.6, -14.0, -11.6):
        add_beveled_box(bms["walnut"], yup(bx, 5.90, 0.45), (0.15, 6.8, 0.20), bevel=0.01)
    for bx in (-18.6, -16.0, -13.4, -8.8, -6.2):
        add_beveled_box(bms["walnut"], yup(bx, 5.90, -5.6), (0.14, 7.8, 0.18), bevel=0.01)
    for bx in (-21.6, -19.4, -17.2, -15.0, -12.8):
        add_beveled_box(bms["walnut"], yup(bx, 9.26, -2.9), (0.15, 13.6, 0.20), bevel=0.01)

    # 3 Exterior Limestone Garden Stairways
    for i in range(4):
        top_y = 2.60 - (i + 0.5) * 0.095
        h = top_y - 1.95
        cz = 6.6 + (i + 0.5) * 0.55
        add_beveled_box(bms["stone"], yup(-14.0, 1.95 + h * 0.5, cz), (4.4, 0.57, h), bevel=0.015)
        add_beveled_box(bms["coping"], yup(-14.0, top_y, cz), (4.46, 0.59, 0.035), bevel=0.01)
    add_beveled_box(bms["stone"], yup(-16.3, 2.38, 7.72), (0.18, 2.24, 0.58), bevel=0.015)
    add_beveled_box(bms["stone"], yup(-11.7, 2.38, 7.72), (0.18, 2.24, 0.58), bevel=0.015)
    for i in range(4):
        top_y = 2.60 - (i + 0.5) * 0.095
        h = top_y - 1.95
        cx_w = -25.2 - (i + 0.5) * 0.55
        add_beveled_box(bms["stone"], yup(cx_w, 1.95 + h * 0.5, 1.1), (0.57, 2.4, h), bevel=0.015)
        add_beveled_box(bms["coping"], yup(cx_w, top_y, 1.1), (0.59, 2.46, 0.035), bevel=0.01)
        cx_e = -2.8 + (i + 0.5) * 0.55
        add_beveled_box(bms["stone"], yup(cx_e, 1.95 + h * 0.5, 0.9), (0.57, 2.2, h), bevel=0.015)
        add_beveled_box(bms["coping"], yup(cx_e, top_y, 0.9), (0.59, 2.26, 0.035), bevel=0.01)

    # Perimeter 1F & 2F Wrought Balustrades
    for args in [
        ("x", -25.1, -16.28, 6.48, 2.60), ("x", -11.72, -2.9, 6.48, 2.60),
        ("x", -25.1, -2.9, -10.48, 2.60), ("z", -10.48, -0.18, -25.1, 2.60),
        ("z", 2.38, 6.48, -25.1, 2.60), ("z", -10.48, -0.28, -2.9, 2.60),
        ("z", 2.08, 6.48, -2.9, 2.60),
        ("x", -17.1, -10.9, 6.30, 6.12), ("z", 4.08, 6.30, -17.1, 6.12), ("z", 4.08, 6.30, -10.9, 6.12),
        ("x", -11.1, -4.0, -1.42, 6.12), ("x", -11.1, -4.0, -9.78, 6.12), ("z", -9.78, -1.42, -4.02, 6.12),
        ("z", -8.55, -3.2, -20.02, 6.12), ("x", -23.2, -20.02, -3.2, 6.12),
    ]:
        _add_balustrade_seg(bms["coping"], bms["iron"], bms["brass"], *args)

    # Indoor Walnut & Brass Staircase
    steps = 16
    for i in range(steps):
        t = (i + 0.5) / steps
        sz = -3.35 + (-8.95 + 3.35) * t
        sy = 2.60 + (6.12 - 2.60) * ((i + 1) / steps)
        add_beveled_box(bms["walnut"], yup(-21.6, sy - 0.025, sz), (1.56, 0.38, 0.055), bevel=0.008)
        add_beveled_box(bms["molding"], yup(-21.6, sy - 0.12, sz + 0.17), (1.50, 0.03, 0.21), bevel=0.004)
        add_beveled_box(bms["molding"] if i % 2 == 0 else bms["brass"], yup(-20.84, sy + 0.42, sz), (0.028, 0.028, 0.88), bevel=0.004)
    add_tube_along_curve(bms["walnut"], [yup(-20.84, 3.55, -3.3), yup(-20.84, 7.04, -9.0)], [0.038, 0.038], 8)

    # Courtyard SE Pergola & 2F East Rooftop Terrace Pergola
    for base_y, posts, xb, z0, z1 in [
        (2.60, [(-9.6, 5.8), (-5.2, 5.8), (-9.6, 1.8), (-5.2, 1.8)], -7.4, 1.8, 5.8),
        (6.12, [(-9.8, -2.4), (-5.2, -2.4), (-9.8, -8.4), (-5.2, -8.4)], -7.5, -8.4, -2.4),
    ]:
        for px, pz in posts:
            add_beveled_box(bms["coping"], yup(px, base_y + 0.14, pz), (0.24, 0.24, 0.28), bevel=0.015)
            add_beveled_box(bms["cedar"], yup(px, base_y + 1.56, pz), (0.14, 0.14, 2.86), bevel=0.01)
        beam_top = base_y + 2.98
        for bz in (z0, z1):
            add_beveled_box(bms["cedar"], yup(xb, beam_top, bz), (5.0, 0.14, 0.12), bevel=0.01)
        r_len = abs(z1 - z0) + 0.6
        r_mid = 0.5 * (z0 + z1)
        for ri in range(8):
            rx = xb - 2.1 + ri * 0.6
            add_beveled_box(bms["cedar"], yup(rx, beam_top + 0.10, r_mid), (0.07, r_len, 0.09), bevel=0.008)

    # =========================================================================
    # 2. 1F & 2F TRUE-CUTOUT EXTERIOR WALLS, PORTICO, QUOINS & WINDOWS
    # =========================================================================
    # 1F South Wall (Z=4.0)
    add_beveled_box(bms["plaster"], yup(-22.5, m1, 4.0), (1.8, 0.24, h1), bevel=0.008)
    _add_window_assembly(bms, "x", -21.6, -17.6, 4.0, -1, y1_b, y1_t, bays=3, theme="sage")
    add_beveled_box(bms["plaster"], yup(-16.4, m1, 4.0), (2.4, 0.24, h1), bevel=0.008)
    add_beveled_box(bms["plaster"], yup(-14.0, 0.5 * (y1_t + 5.25), 4.0), (2.4, 0.24, y1_t - 5.25), bevel=0.008)
    add_beveled_box(bms["coping"], yup(-14.0, 5.26, 4.0), (2.58, 0.32, 0.12), bevel=0.015)
    add_beveled_box(bms["molding"], yup(-15.22, y1_b + 1.33, 3.96), (0.08, 0.32, 2.66), bevel=0.008)
    add_beveled_box(bms["molding"], yup(-12.78, y1_b + 1.33, 3.96), (0.08, 0.32, 2.66), bevel=0.008)
    add_beveled_box(bms["plaster"], yup(-11.6, m1, 4.0), (2.4, 0.24, h1), bevel=0.008)

    # 1F East Courtyard Wall (X=-10.4)
    add_beveled_box(bms["plaster"], yup(-10.4, m1, -0.6), (0.24, 1.6, h1), bevel=0.008)
    add_beveled_box(bms["plaster"], yup(-10.4, 0.5 * (y1_t + 5.22), 1.2), (0.24, 2.0, y1_t - 5.22), bevel=0.008)
    add_beveled_box(bms["coping"], yup(-10.4, 5.23, 1.2), (0.32, 2.16, 0.11), bevel=0.015)
    add_beveled_box(bms["plaster"], yup(-10.4, m1, 3.1), (0.24, 1.8, h1), bevel=0.008)

    # 1F NE Conservatory Study South (Z=-1.4) & East (X=-4.0)
    add_beveled_box(bms["plaster"], yup(-9.7, m1, -1.4), (1.4, 0.24, h1), bevel=0.008)
    _add_window_assembly(bms, "x", -9.0, -5.2, -1.4, -1, y1_b, y1_t, bays=3, theme="study", drop_to_y=3.42)
    add_beveled_box(bms["plaster"], yup(-4.6, m1, -1.4), (1.2, 0.24, h1), bevel=0.008)

    add_beveled_box(bms["plaster"], yup(-4.0, m1, -8.8), (0.24, 2.0, h1), bevel=0.008)
    _add_window_assembly(bms, "z", -7.8, -3.6, -4.0, -1, y1_b, y1_t, bays=3, theme="study", drop_to_y=3.42)
    add_beveled_box(bms["plaster"], yup(-4.0, m1, -2.5), (0.24, 2.2, h1), bevel=0.008)

    # 1F West Exterior Wall (X=-23.4)
    add_beveled_box(bms["plaster"], yup(-23.4, m1, -9.0), (0.24, 1.6, h1), bevel=0.008)
    _add_window_assembly(bms, "z", -8.2, -5.0, -23.4, 1, y1_b, y1_t, bays=2, theme="sage", drop_to_y=3.50)
    add_beveled_box(bms["plaster"], yup(-23.4, m1, -2.45), (0.24, 5.1, h1), bevel=0.008)
    add_beveled_box(bms["plaster"], yup(-23.4, 0.5 * (y1_t + 5.25), 1.1), (0.24, 2.0, y1_t - 5.25), bevel=0.008)
    add_beveled_box(bms["coping"], yup(-23.4, 5.26, 1.1), (0.32, 2.16, 0.11), bevel=0.015)
    add_beveled_box(bms["plaster"], yup(-23.4, m1, 3.05), (0.24, 1.9, h1), bevel=0.008)

    # 1F North Exterior Wall (Z=-9.8)
    add_beveled_box(bms["plaster"], yup(-20.5, m1, -9.8), (5.8, 0.24, h1), bevel=0.008)
    _add_window_assembly(bms, "x", -17.6, -14.8, -9.8, 1, y1_b, y1_t, bays=2, theme="sage", flower_box=False, sill_off=1.05, drop_to_y=3.72)
    add_beveled_box(bms["plaster"], yup(-12.0, m1, -9.8), (5.6, 0.24, h1), bevel=0.008)
    _add_window_assembly(bms, "x", -9.2, -5.4, -9.8, 1, y1_b, y1_t, bays=3, theme="study", flower_box=False, drop_to_y=3.45)
    add_beveled_box(bms["plaster"], yup(-4.7, m1, -9.8), (1.4, 0.24, h1), bevel=0.008)

    # 1F Interior Partitions (Fireplace wall + Study Archway)
    add_beveled_box(bms["plaster"], yup(-18.4, m1, -3.1), (3.2, 0.22, h1), bevel=0.008)
    add_beveled_box(bms["plaster"], yup(-10.4, m1, -7.95), (0.22, 3.5, h1), bevel=0.008)
    add_beveled_box(bms["plaster"], yup(-10.4, 0.5 * (y1_t + 5.20), -5.2), (0.22, 2.0, y1_t - 5.20), bevel=0.008)
    add_beveled_box(bms["molding"], yup(-10.4, 5.20, -5.2), (0.30, 2.16, 0.10), bevel=0.01)
    add_beveled_box(bms["plaster"], yup(-10.4, m1, -2.8), (0.22, 2.8, h1), bevel=0.008)

    # Static swung-open Courtyard/West/2F French Doors (Front South doors are animated named nodes!)
    for px, py, pz, w, h, ry, bm_in in [
        (-10.48, y1_b, 0.24, 0.96, 2.60, 0.14 + math.pi * 0.5, bms["boiserie_sage"]),
        (-10.48, y1_b, 2.16, 0.96, 2.60, -0.14 - math.pi * 0.5, bms["boiserie_sage"]),
        (-23.32, y1_b, 0.14, 0.96, 2.64, -0.12 + math.pi * 0.5, bms["boiserie_sage"]),
        (-23.32, y1_b, 2.06, 0.96, 2.64, 0.12 - math.pi * 0.5, bms["boiserie_sage"]),
        (-15.06, y2_b, 3.92, 1.06, 2.58, 1.45, bms["boiserie_rose"]),
        (-12.94, y2_b, 3.92, 1.06, 2.58, -1.45 + math.pi, bms["boiserie_rose"]),
        (-11.28, y2_b, -6.36, 1.06, 2.58, 0.15 + math.pi * 0.5, bms["boiserie_rose"]),
        (-11.28, y2_b, -4.24, 1.06, 2.58, -0.15 - math.pi * 0.5, bms["boiserie_rose"]),
    ]:
        bm_tmp_f, bm_tmp_g, bm_tmp_b = bmesh.new(), bmesh.new(), bmesh.new()
        _add_door_leaf_bmesh(bm_tmp_f, bm_tmp_g, bm_tmp_b, w, h, 1.0)
        rot_t = Euler((0.0, 0.0, ry), "XYZ").to_matrix().to_4x4()
        tr_t = Matrix.Translation(yup(px, py, pz))
        for dst, src in ((bm_in, bm_tmp_f), (bms["glass"], bm_tmp_g), (bms["brass"], bm_tmp_b)):
            bmesh.ops.transform(src, matrix=tr_t @ rot_t, verts=src.verts)
            m_tmp = bpy.data.meshes.new("_d")
            src.to_mesh(m_tmp)
            src.free()
            dst.from_mesh(m_tmp)
            bpy.data.meshes.remove(m_tmp)

    # South 3-Arch Portico & 2F Juliet Balcony
    for px in (-17.1, -15.05, -12.95, -10.9):
        add_beveled_box(bms["coping"], yup(px, 2.81, 6.28), (0.42, 0.42, 0.42), bevel=0.02)
        add_cylinder_part(bms["stone"], yup(px, 4.30, 6.28), 0.175, 0.15, 2.55, segs=16)
        add_beveled_box(bms["coping"], yup(px, 5.65, 6.28), (0.40, 0.40, 0.16), bevel=0.015)
    add_beveled_box(bms["coping"], yup(-14.0, 5.915, 5.14), (6.65, 2.52, 0.35), bevel=0.02)
    add_beveled_box(bms["stone"], yup(-14.0, 6.106, 5.19), (6.40, 2.38, 0.030), bevel=0.010)
    for ax in (-16.08, -14.0, -11.92):
        pts = [yup(ax + math.cos((i / 12) * math.pi) * 0.86, 5.02 + math.sin((i / 12) * math.pi) * 0.86, 6.28) for i in range(13)]
        add_tube_along_curve(bms["coping"], pts, [0.11] * 13, radial_segs=8)

    # 2F Exterior Walls (X[-23.4..-11.2], Z[-9.8..+4.0])
    add_beveled_box(bms["plaster"], yup(-22.4, m2, 4.0), (2.0, 0.24, h2), bevel=0.008)
    _add_window_assembly(bms, "x", -21.4, -18.2, 4.0, -1, y2_b, y2_t, bays=3, theme="rose")
    add_beveled_box(bms["plaster"], yup(-16.65, m2, 4.0), (3.1, 0.24, h2), bevel=0.008)
    add_beveled_box(bms["plaster"], yup(-14.0, 0.5 * (y2_t + 8.72), 4.0), (2.2, 0.24, y2_t - 8.72), bevel=0.008)
    add_beveled_box(bms["coping"], yup(-14.0, 8.73, 4.0), (2.38, 0.32, 0.11), bevel=0.015)
    add_beveled_box(bms["plaster"], yup(-12.05, m2, 4.0), (1.7, 0.24, h2), bevel=0.008)

    add_beveled_box(bms["plaster"], yup(-11.2, m2, -8.1), (0.24, 3.4, h2), bevel=0.008)
    add_beveled_box(bms["plaster"], yup(-11.2, 0.5 * (y2_t + 8.72), -5.3), (0.24, 2.2, y2_t - 8.72), bevel=0.008)
    add_beveled_box(bms["coping"], yup(-11.2, 8.73, -5.3), (0.32, 2.36, 0.11), bevel=0.015)
    add_beveled_box(bms["plaster"], yup(-11.2, m2, -3.0), (0.24, 2.4, h2), bevel=0.008)
    _add_window_assembly(bms, "z", -1.8, 1.8, -11.2, -1, y2_b, y2_t, bays=3, theme="rose", drop_to_y=6.95)
    add_beveled_box(bms["plaster"], yup(-11.2, m2, 2.9), (0.24, 2.2, h2), bevel=0.008)

    add_beveled_box(bms["plaster"], yup(-23.4, m2, -6.0), (0.24, 7.6, h2), bevel=0.008)
    _add_window_assembly(bms, "z", -2.2, 1.6, -23.4, 1, y2_b, y2_t, bays=3, theme="rose")
    add_beveled_box(bms["plaster"], yup(-23.4, m2, 2.8), (0.24, 2.4, h2), bevel=0.008)

    add_beveled_box(bms["plaster"], yup(-21.3, m2, -9.8), (4.2, 0.24, h2), bevel=0.008)
    _add_window_assembly(bms, "x", -19.2, -15.6, -9.8, 1, y2_b, y2_t, bays=3, theme="rose", flower_box=False, drop_to_y=6.95)
    add_beveled_box(bms["plaster"], yup(-13.4, m2, -9.8), (4.4, 0.24, h2), bevel=0.008)

    # Corner Quoins & Belt Course (pushed strictly outward from 0.24m wall centerline so zero stone enters interior rooms)
    for qx, qz, sx_out, sz_out, q_top in [
        (-23.4, 4.0, -1.0, 1.0, 9.4),
        (-11.2, 4.0, 1.0, 1.0, 9.4),
        (-23.4, -9.8, -1.0, -1.0, 9.4),
        (-11.2, -9.8, 1.0, -1.0, 9.4),
        (-4.0, -1.4, 1.0, 1.0, 6.0),
        (-4.0, -9.8, 1.0, -1.0, 6.0),
        (-10.4, 4.0, 1.0, 1.0, 6.0),
    ]:
        stones = int((q_top - 2.62) / 0.38)
        for i in range(stones):
            sy = 2.62 + (i + 0.5) * 0.38
            long_x = i % 2 == 0
            lx = 0.42 if long_x else 0.28
            lz = 0.28 if long_x else 0.42
            # Outer face proud by +0.06m outside 0.12m exterior plaster; inner face stops at wall core (-0.08m)
            # so quoins never penetrate the interior (-0.12m) drywall surface.
            cx = qx + sx_out * (0.18 - lx * 0.5)
            cz = qz + sz_out * (0.18 - lz * 0.5)
            add_beveled_box(bms["coping"], yup(cx, sy, cz), (lx, lz, 0.34), bevel=0.012)
    add_beveled_box(bms["coping"], yup(-17.3, 6.06, 4.10), (12.6, 0.18, 0.15), bevel=0.01)
    add_beveled_box(bms["coping"], yup(-17.3, 6.06, -9.90), (12.6, 0.18, 0.15), bevel=0.01)
    add_beveled_box(bms["coping"], yup(-23.50, 6.06, -2.90), (0.18, 14.18, 0.15), bevel=0.01)
    add_beveled_box(bms["coping"], yup(-11.10, 6.06, 1.32), (0.18, 5.56, 0.15), bevel=0.01)

    # =========================================================================
    # 3. CROSS-GABLE TERRACOTTA ROOFS + OCULUS DORMER + CHIMNEY
    # =========================================================================
    eave_y = 9.42
    pSW, pSE, pNE, pNW = (-24.2, eave_y, 4.75), (-10.4, eave_y, 4.75), (-10.4, eave_y, -10.55), (-24.2, eave_y, -10.55)
    rS, rN = (-17.3, 11.58, 0.2), (-17.3, 11.58, -6.0)
    add_beveled_box(bms["coping"], yup(-17.3, 9.48, -2.9), (13.88, 15.38, 0.14), bevel=0.02)
    _add_roof_quad(bms["roof"], pNW, pSW, rS, rN)
    _add_roof_quad(bms["roof"], pSE, pNE, rN, rS)
    _add_roof_tri(bms["roof"], pSW, pSE, rS)
    _add_roof_tri(bms["roof"], pNE, pNW, rN)
    for a, b in ((rS, rN), (pSW, rS), (pSE, rS), (pNW, rN), (pNE, rN)):
        add_tube_along_curve(bms["terracotta"], [yup(*a), yup(*b)], [0.095, 0.095], 8)

    # Front Dormer Gable Pediment + Oculus Rose Window
    gBL, gBR, gApex, gBack = (-16.6, 9.42, 4.82), (-11.4, 9.42, 4.82), (-14.0, 11.18, 4.82), (-14.0, 11.18, 1.2)
    _add_roof_tri(bms["plaster"], gBL, gBR, gApex)
    _add_roof_quad(bms["roof"], (-16.8, 9.38, 4.95), gApex, gBack, (-16.8, 9.38, 1.2))
    _add_roof_quad(bms["roof"], gApex, (-11.2, 9.38, 4.95), (-11.2, 9.38, 1.2), gBack)
    add_tube_along_curve(bms["coping"], [yup(-16.8, 9.38, 4.95), yup(*gApex), yup(-11.2, 9.38, 4.95)], [0.085, 0.085, 0.085], 8)
    add_tube_along_curve(bms["terracotta"], [yup(*gApex), yup(*gBack)], [0.09, 0.09], 8)

    oc_pts = [yup(-14.0 + math.cos((i / 24) * math.tau) * 0.46, 10.12 + math.sin((i / 24) * math.tau) * 0.46, 4.85) for i in range(25)]
    add_tube_along_curve(bms["coping"], oc_pts, [0.075] * 25, 8)
    add_cylinder_part(bms["glass"], yup(-14.0, 10.12, 4.83), 0.42, 0.42, 0.04, segs=20, rot_euler=(math.pi * 0.5, 0.0, 0.0))
    add_beveled_box(bms["brass"], yup(-14.0, 10.12, 4.86), (0.84, 0.06, 0.04), bevel=0.005)
    add_beveled_box(bms["brass"], yup(-14.0, 10.12, 4.86), (0.04, 0.06, 0.84), bevel=0.005)

    # Limestone Chimney
    add_beveled_box(bms["stone"], yup(-18.4, 11.0, -3.1), (1.12, 0.88, 2.75), bevel=0.025)
    add_beveled_box(bms["coping"], yup(-18.4, 12.42, -3.1), (1.28, 1.04, 0.14), bevel=0.02)
    for dx in (-0.26, 0.26):
        add_cylinder_part(bms["terracotta"], yup(-18.4 + dx, 12.68, -3.1), 0.14, 0.12, 0.40, segs=12)

    # =========================================================================
    # 4. SIGNATURE CUSTOM INTERIORS (Zero Overlap with 18 Poly Haven Props!)
    # =========================================================================
    # Aubusson Rugs (individual planar [0..1] UV-mapped meshes cleanly +3mm over parquet)
    for r_name, rx, ry, rz, rsx, rsz, r_mat in (
        ("Villa_RugLiving", -18.9, 2.616, 0.65, 4.4, 3.2, m_rug_rose),
        ("Villa_RugStudy", -7.25, 2.616, -5.65, 4.2, 3.4, m_rug_sage),
        ("Villa_RugMaster", -16.8, 6.132, -6.8, 4.2, 3.6, m_rug_rose),
    ):
        bm_r = bmesh.new()
        add_beveled_box(bm_r, yup(rx, ry, rz), (rsx, rsz, 0.014), bevel=0.003)
        bmesh.ops.recalc_face_normals(bm_r, faces=bm_r.faces)
        obj_r = create_mesh_object(r_name, bm_r, r_mat)
        ensure_uv_planar_rect(obj_r, rx, rz, rsx, rsz)
        obj_r.parent = root

    # Carved Limestone Fireplace & Mantel (-18.4, 2.61, -2.74 — hearth slab cleanly clear of 2.606 parquet)
    fx, fy, fz = -18.4, 2.61, -2.74
    add_beveled_box(bms["coping"], yup(fx, fy + 0.04, fz + 0.18), (2.25, 0.92, 0.08), bevel=0.02)
    for sx in (-0.78, 0.78):
        add_beveled_box(bms["stone"], yup(fx + sx, fy + 0.72, fz + 0.05), (0.34, 0.46, 1.32), bevel=0.02)
    add_beveled_box(bms["stone"], yup(fx, fy + 1.48, fz + 0.06), (2.18, 0.50, 0.22), bevel=0.025)
    add_beveled_box(bms["soot"], yup(fx, fy + 0.68, fz - 0.10), (1.20, 0.12, 1.18), bevel=0.01)
    add_uv_sphere_part(bms["soot"], yup(fx, fy + 0.09, fz + 0.04), (0.34, 0.04, 0.16), 12, 8, noise_amp=0.15)
    for cx in (-19.34, -17.46):
        add_lathe_part(bms["brass"], [(0.055, 0), (0.018, 0.08), (0.035, 0.21), (0.015, 0.22)], 12, yup(cx, 4.16, -2.64))
        add_cylinder_part(bms["linen"], yup(cx, 4.28, -2.64), 0.015, 0.014, 0.11, segs=8)
        add_uv_sphere_part(bms["ember"], yup(cx, 4.35, -2.64), (0.018, 0.018, 0.032), 8, 6)

    # Plush Button-Tufted Dusty-Rose Velvet Chesterfield Sofa (-18.8, 2.60, 2.18 facing -Z)
    sx0, sy0, sz0 = -18.8, 2.60, 2.18
    add_beveled_box(bms["walnut"], yup(sx0, sy0 + 0.16, sz0), (2.42, 0.90, 0.10), bevel=0.022)
    add_beveled_box(bms["walnut"], yup(sx0, sy0 + 0.22, sz0 - 0.42), (2.28, 0.06, 0.05), bevel=0.01)
    # 3 individual plush seat cushions
    for ci in (-0.68, 0.0, 0.68):
        add_beveled_box(bms["velvet"], yup(sx0 + ci, sy0 + 0.32, sz0 - 0.06), (0.67, 0.70, 0.18), bevel=0.06)
    # Deep curved tufted backrest + rolled top rail + 2 rows of button-tuft dimples
    add_beveled_box(bms["velvet"], yup(sx0, sy0 + 0.64, sz0 + 0.34), (2.28, 0.22, 0.60), bevel=0.07)
    add_cylinder_part(bms["velvet"], yup(sx0, sy0 + 0.91, sz0 + 0.35), 0.115, 0.115, 2.34, segs=14, rot_euler=(0.0, math.pi * 0.5, 0.0))
    for bi in range(-4, 5):
        for row_i, by_t in enumerate((0.52, 0.74)):
            bx_t = sx0 + bi * 0.21 + (0.10 if row_i % 2 else 0.0)
            if abs(bx_t - sx0) < 0.92:
                add_uv_sphere_part(bms["velvet"], yup(bx_t, sy0 + by_t, sz0 + 0.22), (0.042, 0.022, 0.042), u_segs=8, v_rings=6)
    # Rolled bolster armrests
    for side in (-1.12, 1.12):
        add_beveled_box(bms["velvet"], yup(sx0 + side, sy0 + 0.44, sz0 + 0.02), (0.24, 0.84, 0.44), bevel=0.06)
        add_cylinder_part(bms["velvet"], yup(sx0 + side, sy0 + 0.65, sz0 + 0.02), 0.135, 0.135, 0.86, segs=14, rot_euler=(math.pi * 0.5, 0.0, 0.0))
        add_cylinder_part(bms["brass"], yup(sx0 + side, sy0 + 0.65, sz0 - 0.41), 0.065, 0.065, 0.02, segs=10, rot_euler=(math.pi * 0.5, 0.0, 0.0))
    # Casual accent pillows in ivory linen & sage velvet
    add_uv_sphere_part(bms["linen"], yup(sx0 - 0.84, sy0 + 0.54, sz0 + 0.10), (0.17, 0.09, 0.17), u_segs=14, v_rings=10, rot_euler=(0.18, 0.0, -0.35))
    add_uv_sphere_part(bms["sage_vel"], yup(sx0 + 0.84, sy0 + 0.54, sz0 + 0.10), (0.17, 0.09, 0.17), u_segs=14, v_rings=10, rot_euler=(0.18, 0.0, 0.35))
    for lx in (-1.10, 1.10):
        for lz in (-0.37, 0.37):
            add_cylinder_part(bms["walnut"], yup(sx0 + lx, sy0 + 0.06, sz0 + lz), 0.036, 0.024, 0.12, segs=10)
            add_cylinder_part(bms["brass"], yup(sx0 + lx, sy0 + 0.015, sz0 + lz), 0.024, 0.020, 0.03, segs=10)

    # Louis XVI Dining Table & 4 Oval-Back Chairs (-12.65, 2.60, 1.15)
    dx, dy, dz = -12.65, 2.60, 1.15
    add_beveled_box(bms["walnut"], yup(dx, dy + 0.76, dz), (1.72, 1.04, 0.055), bevel=0.018)
    for lx in (-0.72, 0.72):
        for lz in (-0.38, 0.38):
            add_cylinder_part(bms["oak"], yup(dx + lx, dy + 0.37, dz + lz), 0.038, 0.022, 0.74, segs=10)
    for ox, oz, ry in ((-0.52, -0.78, 0.0), (0.52, -0.78, 0.0), (-0.52, 0.78, math.pi), (0.52, 0.78, math.pi)):
        cx, cz = dx + ox, dz + oz
        add_beveled_box(bms["sage_vel"], yup(cx, dy + 0.45, cz), (0.44, 0.44, 0.08), rot_euler=(0, 0, ry), bevel=0.025)
        add_uv_sphere_part(bms["sage_vel"], yup(cx + math.sin(ry) * 0.20, dy + 0.78, cz - math.cos(ry) * 0.20), (0.20, 0.06, 0.26), 14, 10, rot_euler=(0, 0, ry))
        for clx in (-0.16, 0.16):
            for clz in (-0.16, 0.16):
                add_cylinder_part(bms["oak"], yup(cx + clx, dy + 0.22, cz + clz), 0.02, 0.014, 0.44, segs=8)

    # Retro Country Kitchen (Backsplash, Shaker Cabinets, Calacatta Countertops, Belfast Sink, La Cornue Range, Kitchen Island & 3 Bar Stools)
    add_beveled_box(bms["zellige"], yup(-17.725, 3.98, -9.62), (0.25, 0.03, 0.96), bevel=0.005)
    add_beveled_box(bms["zellige"], yup(-16.20, 3.56, -9.62), (2.80, 0.03, 0.18), bevel=0.005)
    add_beveled_box(bms["zellige"], yup(-13.025, 3.98, -9.62), (3.55, 0.03, 0.96), bevel=0.005)
    add_beveled_box(bms["boiserie_sage"], yup(-16.095, 3.04, -9.28), (3.71, 0.68, 0.88), bevel=0.015)
    add_beveled_box(bms["boiserie_sage"], yup(-12.055, 3.04, -9.28), (1.81, 0.68, 0.88), bevel=0.015)
    for mx, mw in ((-17.28, 1.40), (-15.03, 1.58), (-12.04, 1.85)):
        add_beveled_box(bms["marble"], yup(mx, 3.504, -9.26), (mw, 0.74, 0.048), bevel=0.012)
    # Belfast Sink & Brass Faucet
    add_beveled_box(bms["linen"], yup(-16.20, 3.44, -9.24), (0.76, 0.56, 0.26), bevel=0.02)
    add_tube_along_curve(bms["brass"], [yup(-16.20, 3.52, -9.48), yup(-16.20, 3.78, -9.46), yup(-16.20, 3.82, -9.26), yup(-16.20, 3.68, -9.22)], [0.016] * 4, 8)
    # La Cornue Range Cooker + Bell Hood (-13.60, 2.60, -9.22)
    add_beveled_box(bms["velvet"], yup(-13.60, 3.04, -9.22), (1.24, 0.74, 0.88), bevel=0.02)
    add_beveled_box(bms["iron"], yup(-13.60, 3.50, -9.22), (1.26, 0.76, 0.05), bevel=0.01)
    add_cylinder_part(bms["iron"], yup(-13.60, 4.95, -9.38), 0.72, 0.28, 0.68, segs=4, rot_euler=(0, 0, math.pi * 0.25))
    # Shaker Kitchen Island & 3 Thonet Stools
    add_beveled_box(bms["boiserie_sage"], yup(-15.0, 3.03, -6.35), (2.42, 0.88, 0.86), bevel=0.02)
    add_beveled_box(bms["marble"], yup(-15.0, 3.49, -6.35), (2.68, 1.12, 0.058), bevel=0.02)
    add_beveled_box(bms["walnut"], yup(-14.28, 3.534, -6.32), (0.46, 0.32, 0.032), bevel=0.008)
    add_beveled_box(bms["brass"], yup(-15.0, 5.18, -6.35), (2.24, 0.56, 0.032), bevel=0.005)
    for rx in (-15.92, -14.08):
        add_cylinder_part(bms["brass"], yup(rx, 5.59, -6.35), 0.012, 0.012, 0.82, segs=6)
    for sx_st, bm_st in ((-15.76, bms["velvet"]), (-15.0, bms["sage_vel"]), (-14.24, bms["velvet"])):
        add_cylinder_part(bm_st, yup(sx_st, 3.22, -5.54), 0.19, 0.18, 0.07, segs=16)
        add_cylinder_part(bms["walnut"], yup(sx_st, 2.91, -5.54), 0.17, 0.09, 0.60, segs=8)

    # Conservatory Study Bookcase & Clothbound Books + Easel + Guitar + Bureau Plat Desk + Keepsake Letter
    add_beveled_box(bms["boiserie_sage"], yup(-10.22, 4.03, -7.95), (0.08, 2.96, 2.86), bevel=0.01)
    add_beveled_box(bms["boiserie_sage"], yup(-10.04, 4.03, -9.405), (0.44, 0.05, 2.86), bevel=0.008)
    add_beveled_box(bms["boiserie_sage"], yup(-10.04, 4.03, -6.495), (0.44, 0.05, 2.86), bevel=0.008)
    add_beveled_box(bms["molding"], yup(-10.02, 5.48, -7.95), (0.52, 3.08, 0.09), bevel=0.01)
    for s in range(6):
        add_beveled_box(bms["walnut"], yup(-10.02, 2.66 + s * 0.48, -7.95), (0.46, 2.92, 0.04), bevel=0.005)
    rng_bk = random.Random(8842)
    book_mats = [bms["sage_vel"], bms["velvet"], bms["linen"], bms["walnut"]]
    for s in range(5):
        sy_b = 2.68 + s * 0.48
        cz_b = -9.30
        while cz_b < -6.64:
            if s == 2 and -8.1 < cz_b < -7.5:
                cz_b += 0.55
                continue
            thk = rng_bk.uniform(0.032, 0.055)
            bh = rng_bk.uniform(0.24, 0.36)
            dp = rng_bk.uniform(0.16, 0.21)
            add_beveled_box(book_mats[rng_bk.randrange(4)], yup(-10.17 + dp * 0.5, sy_b + bh * 0.5, cz_b + thk * 0.5), (dp, thk, bh), bevel=0.003)
            cz_b += thk + 0.012

    # Artist Easel & Canvas (-5.65, 2.60, -2.55)
    add_beveled_box(bms["oak"], yup(-5.65, 3.48, -2.55), (0.08, 0.08, 1.78), bevel=0.008)
    add_beveled_box(bms["brass"], yup(-5.65, 3.82, -2.44), (0.78, 0.05, 0.62), rot_euler=(0, 0, -2.45), bevel=0.01)
    add_beveled_box(bms["linen"], yup(-5.65, 3.82, -2.43), (0.70, 0.055, 0.54), rot_euler=(0, 0, -2.45), bevel=0.005)

    # Bureau Plat Desk & Emeralite Lamp + Keepsake Love Letter (-7.40, 2.60, -8.25)
    bx, by, bz = -7.40, 2.60, -8.25
    add_beveled_box(bms["walnut"], yup(bx, by + 0.76, bz), (1.68, 0.84, 0.07), bevel=0.015)
    add_beveled_box(bms["sage_vel"], yup(bx, by + 0.798, bz), (1.34, 0.66, 0.008), bevel=0.003)
    for dlx in (-0.72, 0.72):
        for dlz in (-0.32, 0.32):
            add_cylinder_part(bms["walnut"], yup(bx + dlx, by + 0.36, bz + dlz), 0.04, 0.025, 0.72, segs=10)
    # Pleated silk & brass gooseneck study lamp on left corner (resting at desk top y=3.395)
    lx_m, ly_m, lz_m = -8.02, 3.395, -8.46
    add_lathe_part(bms["brass"], [(0.11, 0.0), (0.105, 0.022), (0.045, 0.045), (0.022, 0.065)], 18, yup(lx_m, ly_m, lz_m))
    add_tube_along_curve(
        bms["brass"],
        [
            yup(lx_m, ly_m + 0.05, lz_m),
            yup(lx_m, ly_m + 0.26, lz_m - 0.02),
            yup(lx_m + 0.02, ly_m + 0.43, lz_m + 0.02),
            yup(lx_m + 0.04, ly_m + 0.47, lz_m + 0.10),
        ],
        [0.016, 0.013, 0.011, 0.010],
        10,
    )
    # Continuous 16-pleat fluted silk empire shade (smooth contour, zero detached rib spikes)
    shade_rot = Euler((0.24, 0.0, 0.0), "XYZ").to_matrix()
    shade_piv = Vector(yup(lx_m + 0.04, ly_m + 0.39, lz_m + 0.11))
    shade_prof = [(-0.088, 0.165), (-0.025, 0.132), (0.045, 0.095), (0.092, 0.056), (0.102, 0.026)]
    pleat_segs = 32
    shade_rings = []
    for rz, rr in shade_prof:
        ring_v = []
        pleat_amp = 0.006 if rz < 0.09 else 0.002
        for si in range(pleat_segs):
            th = (si / pleat_segs) * math.tau
            r_eff = rr + pleat_amp * math.cos(th * 16)
            p_loc = Vector((math.cos(th) * r_eff, math.sin(th) * r_eff, rz))
            ring_v.append(bms["emerald"].verts.new(shade_piv + shade_rot @ p_loc))
        shade_rings.append(ring_v)
    for ri in range(len(shade_rings) - 1):
        r0, r1 = shade_rings[ri], shade_rings[ri + 1]
        for si in range(pleat_segs):
            sn = (si + 1) % pleat_segs
            bms["emerald"].faces.new((r0[si], r0[sn], r1[sn], r1[si]))
    bms["emerald"].faces.new(shade_rings[-1])
    add_uv_sphere_part(bms["ember"], yup(lx_m + 0.04, ly_m + 0.35, lz_m + 0.11), (0.036, 0.036, 0.042), 10, 8)
    add_cylinder_part(bms["brass"], yup(lx_m + 0.04, ly_m + 0.492, lz_m + 0.132), 0.030, 0.024, 0.020, segs=14, rot_euler=(0.24, 0.0, 0.0))
    add_uv_sphere_part(bms["brass"], yup(lx_m + 0.04, ly_m + 0.512, lz_m + 0.136), (0.016, 0.016, 0.020), 10, 8)
    # Cotton-Paper Love Letter & Wax-Sealed Envelope on center (-7.40, 3.40, -8.17)
    add_beveled_box(bms["linen"], yup(-7.42, 3.40, -8.17), (0.27, 0.20, 0.010), rot_euler=(0, 0, -0.14), bevel=0.002)
    add_beveled_box(bms["velvet"], yup(-7.38, 3.41, -8.17), (0.04, 0.04, 0.012), bevel=0.004)  # rose wax seal

    # 2F Master Four-Poster Canopy Bed (-16.8, 6.12, -7.45) + Vanity Pouf + Tripod Tea Table
    mx, my, mz = -16.8, y2_b, -7.45
    add_beveled_box(bms["walnut"], yup(mx, my + 0.32, mz), (1.98, 2.18, 0.16), bevel=0.02)
    add_beveled_box(bms["linen"], yup(mx, my + 0.48, mz), (1.86, 2.04, 0.24), bevel=0.05)
    add_beveled_box(bms["velvet"], yup(mx, my + 0.55, mz + 0.28), (1.88, 1.25, 0.14), bevel=0.04)
    for sx in (-0.94, 0.94):
        for sz in (-1.04, 1.04):
            add_cylinder_part(bms["walnut"], yup(mx + sx, my + 1.15, mz + sz), 0.052, 0.036, 2.28, segs=12)
    for tx in (-0.94, 0.94):
        add_beveled_box(bms["walnut"], yup(mx + tx, my + 2.28, mz), (0.06, 2.16, 0.06), bevel=0.01)
    for tz in (-1.04, 1.04):
        add_beveled_box(bms["walnut"], yup(mx, my + 2.28, mz + tz), (1.96, 0.06, 0.06), bevel=0.01)
    for sx in (-0.92, 0.92):
        for sz in (-1.02, 1.02):
            add_beveled_box(bms["sheer"], yup(mx + sx * 0.95, my + 1.26, mz + sz * 0.95), (0.28, 0.28, 1.98), bevel=0.04)
    add_uv_sphere_part(bms["velvet"], yup(-16.65, y2_b + 0.32, 2.86), (0.24, 0.24, 0.13), 16, 10)
    add_cylinder_part(bms["walnut"], yup(-22.05, y2_b + 0.565, -0.25), 0.32, 0.31, 0.035, segs=20)
    add_cylinder_part(bms["walnut"], yup(-22.05, y2_b + 0.28, -0.25), 0.09, 0.045, 0.55, segs=12)

    # Louis XV Armoire Carcass (-12.55, 6.12, -9.05) + Interior Clothes
    ax0, az0 = -12.55, -9.05
    add_beveled_box(bms["bois_sage" if "bois_sage" in bms else "boiserie_sage"], yup(ax0, y2_b + 1.28, az0 - 0.26), (1.56, 0.04, 2.24), bevel=0.01)
    add_beveled_box(bms["boiserie_sage"], yup(ax0 - 0.755, y2_b + 1.28, az0), (0.05, 0.56, 2.24), bevel=0.01)
    add_beveled_box(bms["boiserie_sage"], yup(ax0 + 0.755, y2_b + 1.28, az0), (0.05, 0.56, 2.24), bevel=0.01)
    add_beveled_box(bms["boiserie_sage"], yup(ax0, y2_b + 0.19, az0), (1.48, 0.52, 0.04), bevel=0.008)
    add_beveled_box(bms["boiserie_sage"], yup(ax0, y2_b + 2.38, az0), (1.48, 0.52, 0.04), bevel=0.008)
    add_beveled_box(bms["molding"], yup(ax0, y2_b + 2.46, az0), (1.70, 0.66, 0.11), bevel=0.02)
    add_cylinder_part(bms["brass"], yup(ax0 - 0.27, y2_b + 2.10, az0 - 0.02), 0.012, 0.012, 0.90, segs=8, rot_euler=(0, math.pi * 0.5, 0))
    for gi in range(4):
        bm_g = (bms["velvet"], bms["boiserie_rose"], bms["sage_vel"], bms["linen"])[gi]
        add_beveled_box(bm_g, yup(ax0 - 0.6 + gi * 0.2, y2_b + 1.56, az0 - 0.02), (0.07, 0.34, 0.84), bevel=0.02)

    # Smeg Retro Fridge Body (-18.75, 2.60, -9.18)
    add_beveled_box(bms["smeg"], yup(-18.75, 3.44, -9.22), (0.68, 0.60, 1.56), bevel=0.05)

    # Commit static mesh parts cleanly
    part_map = [
        ("Villa_Plaster", "plaster", m_plaster, 0.35),
        ("Villa_Limestone", "stone", m_stone, 0.35),
        ("Villa_Coping", "coping", m_coping, 0.4),
        ("Villa_Parquet", "parquet", m_parquet, 0.6),
        ("Villa_Cedar", "cedar", m_cedar, 0.6),
        ("Villa_Walnut", "walnut", m_walnut, 0.8),
        ("Villa_Oak", "oak", m_oak, 0.8),
        ("Villa_TerracottaRoof", "roof", m_roof, 0.32),
        ("Villa_TerracottaPots", "terracotta", m_pot, 0.8),
        ("Villa_Shutters", "shutter", m_shutter, 0.8),
        ("Villa_BoiserieSage", "boiserie_sage", m_bois_sage, 0.6),
        ("Villa_BoiserieStudy", "boiserie_study", m_bois_study, 0.6),
        ("Villa_BoiserieRose", "boiserie_rose", m_bois_rose, 0.6),
        ("Villa_CreamMolding", "molding", m_molding, 0.8),
        ("Villa_Ceilings", "ceil", m_ceil, 0.4),
        ("Villa_WroughtIron", "iron", m_iron, 1.0),
        ("Villa_Brass", "brass", m_brass, 1.0),
        ("Villa_Glass", "glass", m_glass, 1.0),
        ("Villa_SheerCurtains", "sheer", m_sheer, 0.8),
        ("Villa_RoseDrapes", "drape", m_drape, 0.8),
        ("Villa_VelvetRose", "velvet", m_velvet, 1.0),
        ("Villa_VelvetSage", "sage_vel", m_sage_vel, 1.0),
        ("Villa_KitchenZellige", "zellige", m_zellige, 0.9),
        ("Villa_SmegBody", "smeg", m_smeg, 0.8),
        ("Villa_MarbleCounters", "marble", m_marble, 0.6),
        ("Villa_IvoryLinen", "linen", m_linen, 0.8),
        ("Villa_RugRose", "rug_rose", m_rug_rose, 0.3),
        ("Villa_RugSage", "rug_sage", m_rug_sage, 0.3),
        ("Villa_VineFoliage", "vine_leaf", m_leaf, 1.0),
        ("Villa_Hydrangeas", "hydrangea", m_hyd, 1.0),
        ("Villa_WarmEmbers", "ember", m_amber, 1.0),
        ("Villa_EmeraliteShade", "emerald", m_emerald, 1.0),
        ("Villa_HearthSoot", "soot", m_soot, 1.0),
    ]
    for pname, bkey, mat, uvs in part_map:
        bm = bms[bkey]
        if len(bm.verts) == 0:
            bm.free()
            continue
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        obj = create_mesh_object(pname, bm, mat)
        ensure_uv_box(obj, scale=uvs)
        obj.parent = root

    # =========================================================================
    # 5. NAMED ANIMATED / INTERACTIVE SUBNODES
    # =========================================================================
    # (a) 1F Front French Double Doors
    for name, px, hs, rot_y in [
        ("Villa_FrontDoor_L", -15.16, 1.0, 1.48),
        ("Villa_FrontDoor_R", -12.84, -1.0, -1.48),
    ]:
        d_node = _new_empty(name, root)
        d_node.location = yup(px, y1_b, 3.92)
        d_node.rotation_euler = (0.0, 0.0, rot_y)
        bf, bg, bb = bmesh.new(), bmesh.new(), bmesh.new()
        _add_door_leaf_bmesh(bf, bg, bb, 1.16, 2.64, hs)
        for s_name, bm_s, mat_s in (("Frame", bf, m_bois_sage), ("Glass", bg, m_glass), ("Handle", bb, m_brass)):
            bmesh.ops.recalc_face_normals(bm_s, faces=bm_s.faces)
            o = create_mesh_object(f"{name}_{s_name}", bm_s, mat_s)
            ensure_uv_box(o, scale=0.8)
            o.parent = d_node

    # (b) Smeg Fridge Animated Door (`Fridge_Door`)
    f_door = _new_empty("Fridge_Door", root)
    f_door.location = yup(-19.08, 2.60, -8.90)
    _part("Fridge_DoorShell", lambda bm: add_beveled_box(bm, yup(0.33, 0.84, 0.03), (0.66, 0.07, 1.50), bevel=0.025), m_smeg, 1.0, f_door)
    _part("Fridge_Handle", lambda bm: add_cylinder_part(bm, yup(0.58, 1.02, 0.09), 0.016, 0.016, 0.28, segs=8), m_brass, 1.0, f_door)

    # (c) Louis XV Armoire Animated Doors (`Armoire_Door_L`, `Armoire_Door_R`)
    for dname, side in (("Armoire_Door_L", -1.0), ("Armoire_Door_R", 1.0)):
        ap = _new_empty(dname, root)
        ap.location = yup(-12.55 + side * 0.76, y2_b, -9.05 + 0.285)
        cx = -side * 0.38
        _part(f"{dname}_Frame", lambda bm, _cx=cx: add_beveled_box(bm, yup(_cx, 1.28, 0.0), (0.75, 0.032, 2.06), bevel=0.008), m_molding, 1.0, ap)
        _part(f"{dname}_Panel", lambda bm, _cx=cx: (add_beveled_box(bm, yup(_cx, 1.54, 0.008), (0.60, 0.034, 1.32), bevel=0.006), add_beveled_box(bm, yup(_cx, 0.56, 0.008), (0.60, 0.034, 0.46), bevel=0.006)), m_bois_rose, 1.0, ap)
        _part(f"{dname}_Bolt", lambda bm, _s=side: add_cylinder_part(bm, yup(-_s * 0.73, 1.28, 0.028), 0.01, 0.01, 2.04, segs=8), m_brass, 1.0, ap)

    # (d) Mahogany Pedestal Gramophone + Fluted Morning-Glory Horn + Spinning Disc at (-16.55, 2.60, -2.15)
    gram = _new_empty("Gramophone_Root", root)
    gram.location = yup(-16.55, 2.60, -2.15)
    gram.rotation_euler = (0.0, 0.0, 0.38)

    def _build_gram_cabinet(bm):
        # Stepped pedestal base + tapered column + upper record cabinet + molded top deck + door panels
        add_beveled_box(bm, yup(0.0, 0.055, 0.0), (0.54, 0.54, 0.11), bevel=0.018)
        add_beveled_box(bm, yup(0.0, 0.44, 0.0), (0.42, 0.42, 0.68), bevel=0.016)
        add_beveled_box(bm, yup(-0.10, 0.43, -0.215), (0.16, 0.022, 0.52), bevel=0.005)
        add_beveled_box(bm, yup(0.10, 0.43, -0.215), (0.16, 0.022, 0.52), bevel=0.005)
        add_beveled_box(bm, yup(0.0, 0.82, 0.0), (0.49, 0.49, 0.14), bevel=0.016)
        add_beveled_box(bm, yup(0.0, 0.94, 0.0), (0.52, 0.52, 0.10), bevel=0.014)

    def _build_gram_hardware(bm):
        # Brass platter rim, swan-neck tonearm, wind-up crank, cabinet knobs & continuous morning-glory fluted horn
        add_cylinder_part(bm, yup(0.0, 1.005, 0.0), 0.165, 0.165, 0.02, segs=24)
        add_cylinder_part(bm, yup(0.0, 1.032, 0.0), 0.018, 0.012, 0.036, segs=10)
        for kx in (-0.035, 0.035):
            add_uv_sphere_part(bm, yup(kx, 0.44, -0.232), (0.014, 0.014, 0.014), 8, 6)
        add_tube_along_curve(
            bm,
            [yup(0.16, 1.01, -0.14), yup(0.16, 1.12, -0.02), yup(0.10, 1.09, 0.04), yup(0.04, 1.035, 0.02)],
            [0.015, 0.012, 0.010, 0.008],
            8,
        )
        # Crank on side
        add_tube_along_curve(
            bm,
            [yup(0.25, 0.86, 0.02), yup(0.32, 0.86, 0.02), yup(0.32, 0.80, -0.04)],
            [0.008, 0.008, 0.011],
            6,
        )
        # Continuous 10-scallop fluted morning-glory horn bell (zero floating rim beads)
        add_tube_along_curve(
            bm,
            [yup(0.0, 1.00, 0.17), yup(0.0, 1.15, 0.22), yup(0.0, 1.28, 0.15)],
            [0.026, 0.032, 0.038],
            12,
        )
        horn_piv = Vector(yup(0.0, 1.28, 0.15))
        horn_rot = Euler((-0.95, 0.0, 0.0), "XYZ").to_matrix()
        horn_prof = [(0.0, 0.036, 0.0), (0.11, 0.056, 0.003), (0.23, 0.112, 0.010), (0.33, 0.215, 0.020), (0.39, 0.285, 0.030), (0.40, 0.295, 0.032)]
        h_segs = 40
        outer_rings, inner_rings = [], []
        for hz, hr, scall in horn_prof:
            o_ring, i_ring = [], []
            for si in range(h_segs):
                th = (si / h_segs) * math.tau
                wave = 0.5 + 0.5 * math.cos(th * 10)
                r_out = hr + scall * wave
                z_out = hz + scall * 0.45 * wave
                p_o = Vector((math.cos(th) * r_out, math.sin(th) * r_out, z_out))
                p_i = Vector((math.cos(th) * max(0.022, r_out - 0.006), math.sin(th) * max(0.022, r_out - 0.006), z_out - 0.003))
                o_ring.append(bm.verts.new(horn_piv + horn_rot @ p_o))
                i_ring.append(bm.verts.new(horn_piv + horn_rot @ p_i))
            outer_rings.append(o_ring)
            inner_rings.append(i_ring)
        for ri in range(len(outer_rings) - 1):
            ro0, ro1 = outer_rings[ri], outer_rings[ri + 1]
            ri0, ri1 = inner_rings[ri], inner_rings[ri + 1]
            for si in range(h_segs):
                sn = (si + 1) % h_segs
                bm.faces.new((ro0[si], ro0[sn], ro1[sn], ro1[si]))
                bm.faces.new((ri1[si], ri1[sn], ri0[sn], ri0[si]))
        for si in range(h_segs):
            sn = (si + 1) % h_segs
            bm.faces.new((outer_rings[-1][si], outer_rings[-1][sn], inner_rings[-1][sn], inner_rings[-1][si]))

    _part("Gramophone_Cabinet", _build_gram_cabinet, m_walnut, 0.8, gram)
    _part("Gramophone_Platter", lambda bm: add_cylinder_part(bm, yup(0, 1.016, 0), 0.158, 0.158, 0.008, segs=24), m_sage_vel, 1.0, gram)
    _part("Gramophone_HornAndTrim", _build_gram_hardware, m_brass, 1.0, gram)
    g_disc = _new_empty("Gramophone_Disc", gram)
    g_disc.location = yup(0.0, 1.024, 0.0)
    _part("Gramophone_VinylDisc", lambda bm: add_cylinder_part(bm, yup(0, 0, 0), 0.148, 0.148, 0.010, segs=24), m_iron, 1.0, g_disc)

    # (e) Spinning Antique Parchment & Brass Study Globe (`Study_Globe`) at (-6.80, 3.55, -8.10)
    globe_p = _new_empty("Study_Globe", root)
    globe_p.location = yup(-6.80, 3.56, -8.10)
    bm_gs = bmesh.new()
    u_n, v_n, rad_g = 24, 14, 0.128
    tilt_g = Euler((0.36, 0.0, 0.0), "XYZ").to_matrix()
    uv_l = bm_gs.loops.layers.uv.new("UVMap")
    g_verts = []
    for vi in range(v_n + 1):
        vv = vi / v_n
        phi = vv * math.pi
        row = []
        for ui in range(u_n + 1):
            uu = ui / u_n
            th = uu * math.tau
            pos_l = tilt_g @ Vector((math.sin(phi) * math.cos(th) * rad_g, math.sin(phi) * math.sin(th) * rad_g, -math.cos(phi) * rad_g))
            row.append(bm_gs.verts.new(pos_l))
        g_verts.append(row)
    for vi in range(v_n):
        for ui in range(u_n):
            f = bm_gs.faces.new((g_verts[vi][ui], g_verts[vi][ui + 1], g_verts[vi + 1][ui + 1], g_verts[vi + 1][ui]))
            f.smooth = True
            uvs = ((ui / u_n, vi / v_n), ((ui + 1) / u_n, vi / v_n), ((ui + 1) / u_n, (vi + 1) / v_n), (ui / u_n, (vi + 1) / v_n))
            for lp, uv_c in zip(f.loops, uvs):
                lp[uv_l].uv = uv_c
    bmesh.ops.recalc_face_normals(bm_gs, faces=bm_gs.faces)
    obj_gs = create_mesh_object("Study_GlobeSphere", bm_gs, m_globe)
    obj_gs.parent = globe_p

    def _build_globe_stand(bm):
        add_lathe_part(bm, [(0.082, -0.155), (0.072, -0.145), (0.025, -0.130), (0.018, -0.105)], 16, (0, 0, 0))
        arc_pts = [
            tilt_g @ Vector((0.0, -math.sin((k / 14) * math.pi) * 0.142, -math.cos((k / 14) * math.pi) * 0.142))
            for k in range(15)
        ]
        add_tube_along_curve(bm, arc_pts, [0.008] * 15, 6)
        add_cylinder_part(bm, (0, 0, 0), 0.007, 0.007, 0.285, segs=8, rot_euler=(0.36, 0.0, 0.0))

    _part("Study_GlobeMeridian", _build_globe_stand, m_brass, 1.0, globe_p)

    # (f) Coffee Bar Lever (`Coffee_Lever`) at (-15.55, 3.55, -9.20)
    c_lev = _new_empty("Coffee_Lever", root)
    c_lev.location = yup(-15.55, 3.74, -9.20)
    _part("Coffee_MachineBody", lambda bm: add_beveled_box(bm, yup(0, -0.10, -0.06), (0.32, 0.28, 0.34), bevel=0.025), m_iron, 1.0, c_lev)
    _part("Coffee_LeverArm", lambda bm: add_cylinder_part(bm, yup(0.08, 0.08, 0.08), 0.015, 0.012, 0.16, segs=8, rot_euler=(0.3, 0, 0)), m_brass, 1.0, c_lev)

    export_glb(out_path, with_anims=False)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", type=Path, default=Path("site/assets/models"))
    args = parser.parse_args(argv)
    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    TEX_CACHE.mkdir(parents=True, exist_ok=True)
    build_villa_estate_glb(out_dir / "coastal_villa.glb")


if __name__ == "__main__":
    main()
