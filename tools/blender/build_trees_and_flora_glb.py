#!/usr/bin/env python3
"""Build sculpted multi-material stylized botanical tree & weeping palm library (`stylized_trees.glb`).

Contains 12 distinct named species/variant hierarchies at local origin `(0, 0, 0)` with
flared roots descending to `Y = -0.08m` so hillside slopes never expose floating trunks:
  - Tree_Cherry_A, Tree_Cherry_B    (Sakura cherry blossom clouds + twisted dark bark)
  - Tree_Oak_A, Tree_Oak_B          (Sunlit coastal umbrella oak)
  - Tree_Birch_A, Tree_Birch_B      (Slender silver-barked white birch + golden-green foliage)
  - Tree_Olive_A, Tree_Olive_B      (Gnarled Mediterranean olive + silvery sage canopy)
  - Tree_Cypress_A, Tree_Cypress_B  (Tall sculpted columnar Italian cypress tiers)
  - Tree_Palm_A, Tree_Palm_B        (Curved ringed weeping waterside date palms + 3D feathery fronds + coconuts!)
"""

from __future__ import annotations

import argparse
import math
import random
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from blender_kit import (
    add_tube_along_curve,
    add_uv_sphere_part,
    clamp01,
    create_mesh_object,
    ensure_uv_box,
    export_glb,
    fbm2,
    make_packed_normal_texture,
    make_packed_texture,
    make_pbr_material,
    mix_rgb,
    reset_scene,
    yup,
)

TEX_CACHE = SCRIPT_DIR / "_tex_cache"


def _make_bark_textures():
    def _bark(path, c0, c1, rings_y=False, seed=1):
        return make_packed_texture(
            path,
            128,
            128,
            lambda u, v: (
                lambda n, stripe: (
                    *mix_rgb(c0, c1, clamp01(n * 0.72 + stripe * 0.28)),
                    1.0,
                )
            )(
                fbm2(u * 14.0, v * 5.0, seed=seed, octaves=3),
                1.0 if (rings_y and math.sin(v * math.tau * 18.0) > 0.65) else 0.0,
            ),
        )

    nrm_bark = make_packed_normal_texture(
        TEX_CACHE / "bark_nrm.png",
        128,
        128,
        lambda u, v: clamp01(0.65 * fbm2(u * 16.0, v * 6.0, seed=77, octaves=3) + 0.35 * (0.5 + 0.5 * math.sin(u * math.tau * 9.0))),
        strength=2.4,
    )

    return {
        "nrm": nrm_bark,
        "cherry": _bark(TEX_CACHE / "bark_cherry.png", (0.24, 0.14, 0.12), (0.40, 0.25, 0.21), rings_y=True, seed=11),
        "oak": _bark(TEX_CACHE / "bark_oak.png", (0.24, 0.19, 0.14), (0.39, 0.31, 0.23), seed=22),
        "birch": make_packed_texture(
            TEX_CACHE / "bark_birch.png",
            128,
            128,
            lambda u, v: (
                lambda band, n: (
                    *mix_rgb((0.88, 0.86, 0.81), (0.16, 0.15, 0.14), 1.0 if band > 0.80 else n * 0.18),
                    1.0,
                )
            )(fbm2(u * 3.0, v * 28.0, seed=33, octaves=2), fbm2(u * 12.0, v * 12.0, seed=34)),
        ),
        "olive": _bark(TEX_CACHE / "bark_olive.png", (0.35, 0.31, 0.26), (0.52, 0.47, 0.40), seed=44),
        "palm": make_packed_texture(
            TEX_CACHE / "bark_palm.png",
            128,
            128,
            lambda u, v: (
                lambda ring, n: (
                    *mix_rgb((0.36, 0.24, 0.16), (0.55, 0.40, 0.28), clamp01(0.45 + 0.38 * ring + (n - 0.5) * 0.3)),
                    1.0,
                )
            )(math.sin(v * math.tau * 22.0), fbm2(u * 10.0, v * 8.0, seed=55)),
        ),
    }


def _make_foliage_textures():
    """Paint lush multi-layered Genshin Teyvat leaf/blossom cluster cards."""
    # Broadleaf 14-leaf overlapping painterly cluster card (dense, zero sparse triangles)
    leaves = [
        (0.50, 0.78, 0.0, 0.25, 0.14, 0.98),
        (0.32, 0.70, -0.52, 0.24, 0.14, 0.92),
        (0.68, 0.70, 0.52, 0.24, 0.14, 0.94),
        (0.20, 0.54, -0.95, 0.24, 0.14, 0.88),
        (0.80, 0.54, 0.95, 0.24, 0.14, 0.90),
        (0.42, 0.58, -0.24, 0.24, 0.15, 0.99),
        (0.59, 0.56, 0.26, 0.24, 0.15, 0.99),
        (0.30, 0.39, -0.78, 0.23, 0.14, 0.84),
        (0.70, 0.39, 0.78, 0.23, 0.14, 0.86),
        (0.50, 0.43, 0.05, 0.25, 0.15, 0.96),
        (0.22, 0.28, -1.18, 0.21, 0.13, 0.78),
        (0.78, 0.28, 1.18, 0.21, 0.13, 0.80),
        (0.41, 0.23, -0.45, 0.22, 0.13, 0.80),
        (0.60, 0.23, 0.45, 0.22, 0.13, 0.82),
    ]

    def _broadleaf_px(u: float, v: float, base_rgb: tuple, tip_rgb: tuple) -> tuple:
        best_d = 9.0
        best_shade = 0.82
        best_tip = 0.5
        for cx, cy, ang, lw, lh, val in leaves:
            dx = u - cx
            dy = v - cy
            ca, sa = math.cos(ang), math.sin(ang)
            lx = (dx * ca + dy * sa) / lh
            ly = (-dx * sa + dy * ca) / lw
            taper = 1.0 - 0.34 * clamp01(lx * 0.5 + 0.5)
            d = math.sqrt(lx * lx + (ly / max(0.36, taper)) ** 2)
            if d < best_d:
                best_d = d
                best_tip = clamp01(lx * 0.5 + 0.5)
                midrib = math.exp(-abs(ly) * 14.0) * 0.10
                edge_rim = clamp01((d - 0.65) * 1.4) * 0.14
                best_shade = val * (0.76 + 0.24 * best_tip) + midrib + edge_rim
        alpha = 1.0 - clamp01((best_d - 0.95) / 0.10)
        n = (fbm2(u * 12.0, v * 12.0, seed=108, octaves=2) - 0.5) * 0.08
        s = clamp01(best_shade + n)
        c = mix_rgb(base_rgb, tip_rgb, best_tip * 0.72)
        return (clamp01(c[0] * s), clamp01(c[1] * s), clamp01(c[2] * s), alpha)

    # Blossom 13-cluster fluffy Teyvat sakura cloud sprite card
    florets = [
        (0.50, 0.76, 0.21, 0.98),
        (0.31, 0.68, 0.20, 0.94),
        (0.69, 0.68, 0.20, 0.95),
        (0.21, 0.51, 0.19, 0.90),
        (0.79, 0.51, 0.19, 0.91),
        (0.42, 0.56, 0.22, 1.00),
        (0.58, 0.55, 0.22, 1.00),
        (0.32, 0.38, 0.20, 0.88),
        (0.68, 0.38, 0.20, 0.90),
        (0.50, 0.41, 0.21, 0.97),
        (0.23, 0.25, 0.18, 0.82),
        (0.77, 0.25, 0.18, 0.84),
        (0.50, 0.22, 0.19, 0.86),
    ]

    def _blossom_px(u: float, v: float, outer_rgb: tuple, center_rgb: tuple) -> tuple:
        best_d = 9.0
        col = outer_rgb
        for idx, (cx, cy, rad, lum) in enumerate(florets):
            dx = u - cx
            dy = v - cy
            r = math.hypot(dx, dy) / rad
            ang = math.atan2(dy, dx) + idx * 0.65
            petal_r = 0.88 + 0.20 * math.cos(ang * 5.0)
            d = r / petal_r
            if d < best_d:
                best_d = d
                center_mask = math.exp(-(r * r) * 12.0)
                rim_bright = 1.0 + 0.08 * clamp01(r - 0.55)
                pcol = (
                    clamp01(lum * rim_bright * outer_rgb[0]),
                    clamp01(lum * rim_bright * outer_rgb[1]),
                    clamp01(lum * rim_bright * outer_rgb[2]),
                )
                col = mix_rgb(pcol, center_rgb, clamp01((1.0 - r) * 0.44 + center_mask * 0.72))
        alpha = 1.0 - clamp01((best_d - 0.95) / 0.10)
        return (*col, alpha)

    # Cypress feathery plume sprite card
    def _cypress_px(u: float, v: float, base_rgb: tuple, tip_rgb: tuple) -> tuple:
        dx = abs(u - 0.5)
        plume_w = 0.46 * math.sin(clamp01(v) * math.pi) ** 0.58
        fringe = 0.05 * math.sin(v * 58.0 + dx * 26.0) + 0.03 * math.sin(u * 68.0)
        d = (dx + fringe) / max(0.08, plume_w)
        alpha = 1.0 - clamp01((d - 0.92) / 0.14) if (0.04 < v < 0.96) else 0.0
        n = fbm2(u * 18.0, v * 22.0, seed=211, octaves=2)
        s = clamp01(0.72 + 0.26 * v + (n - 0.5) * 0.18)
        c = mix_rgb(base_rgb, tip_rgb, clamp01(v * 0.7 + (0.5 - dx) * 0.3))
        return (clamp01(c[0] * s), clamp01(c[1] * s), clamp01(c[2] * s), alpha)

    # Dense opaque dappled inner core texture (ensures zero hollow sees-through gaps)
    def _core_px(u: float, v: float, dark_rgb: tuple, light_rgb: tuple) -> tuple:
        n1 = fbm2(u * 10.0, v * 10.0, seed=301, octaves=3)
        n2 = fbm2(u * 24.0, v * 24.0, seed=307, octaves=2)
        t = clamp01(0.25 + 0.60 * n1 + 0.18 * (n2 - 0.5))
        c = mix_rgb(dark_rgb, light_rgb, t)
        return (*c, 1.0)

    imgs = {
        "cherry_a": make_packed_texture(TEX_CACHE / "foliage_cherry_a.png", 128, 128, lambda u, v: _blossom_px(u, v, (1.00, 0.80, 0.91), (0.95, 0.38, 0.66))),
        "cherry_b": make_packed_texture(TEX_CACHE / "foliage_cherry_b.png", 128, 128, lambda u, v: _blossom_px(u, v, (1.00, 0.90, 0.96), (0.97, 0.52, 0.76))),
        "cherry_core": make_packed_texture(TEX_CACHE / "foliage_cherry_core.png", 128, 128, lambda u, v: _core_px(u, v, (0.74, 0.34, 0.56), (0.98, 0.62, 0.80))),
    }

    species_greens = {
        "oak": ((0.20, 0.58, 0.24), (0.48, 0.90, 0.34), (0.30, 0.72, 0.28), (0.62, 0.96, 0.40), (0.12, 0.36, 0.18), (0.24, 0.58, 0.26)),
        "birch": ((0.86, 0.58, 0.14), (1.00, 0.84, 0.28), (0.92, 0.68, 0.18), (1.00, 0.91, 0.38), (0.54, 0.34, 0.10), (0.78, 0.54, 0.16)),
        "olive": ((0.22, 0.62, 0.44), (0.46, 0.86, 0.62), (0.32, 0.72, 0.52), (0.56, 0.92, 0.68), (0.14, 0.38, 0.30), (0.26, 0.56, 0.42)),
    }
    for sp, (a0, a1, b0, b1, c0, c1) in species_greens.items():
        imgs[f"{sp}_a"] = make_packed_texture(TEX_CACHE / f"foliage_{sp}_a.png", 128, 128, lambda u, v, d0=a0, d1=a1: _broadleaf_px(u, v, d0, d1))
        imgs[f"{sp}_b"] = make_packed_texture(TEX_CACHE / f"foliage_{sp}_b.png", 128, 128, lambda u, v, d0=b0, d1=b1: _broadleaf_px(u, v, d0, d1))
        imgs[f"{sp}_core"] = make_packed_texture(TEX_CACHE / f"foliage_{sp}_core.png", 128, 128, lambda u, v, d0=c0, d1=c1: _core_px(u, v, d0, d1))

    imgs["cyp_a"] = make_packed_texture(TEX_CACHE / "foliage_cyp_a.png", 128, 128, lambda u, v: _cypress_px(u, v, (0.16, 0.46, 0.36), (0.28, 0.66, 0.48)))
    imgs["cyp_b"] = make_packed_texture(TEX_CACHE / "foliage_cyp_b.png", 128, 128, lambda u, v: _cypress_px(u, v, (0.20, 0.54, 0.40), (0.34, 0.74, 0.52)))
    imgs["cyp_core"] = make_packed_texture(TEX_CACHE / "foliage_cyp_core.png", 128, 128, lambda u, v: _core_px(u, v, (0.10, 0.30, 0.24), (0.18, 0.46, 0.34)))
    return imgs


def _new_empty(name: str) -> bpy.types.Object:
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    return e


def _mesh_part(name: str, builder_fn, mat, uv_scale: float | None, parent: bpy.types.Object, sharp_angle_deg: float | None = 38.0) -> bpy.types.Object:
    bm = bmesh.new()
    builder_fn(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = create_mesh_object(name, bm, mat, sharp_angle_deg=sharp_angle_deg)
    if uv_scale is not None:
        ensure_uv_box(obj, scale=uv_scale)
    obj.parent = parent
    return obj


def _add_cupped_leaf_card(
    bm: bmesh.types.BMesh,
    center: Vector,
    normal_dir: Vector,
    size_u: float,
    size_v: float,
    cup_depth: float,
    roll_rad: float,
    ao_lo: float,
    ao_hi: float,
    uv_layer,
    col_layer,
) -> None:
    """Create a sculpted 3x3 cupped botanical foliage card with explicit [0..1] UVs and AO vertex color."""
    n = normal_dir.normalized()
    ref = Vector((0.0, 0.0, 1.0)) if abs(n.z) < 0.9 else Vector((1.0, 0.0, 0.0))
    u0 = n.cross(ref).normalized()
    v0 = n.cross(u0).normalized()
    cr, sr = math.cos(roll_rad), math.sin(roll_rad)
    u_dir = u0 * cr + v0 * sr
    v_dir = -u0 * sr + v0 * cr

    grid = []
    for iy in range(3):
        row = []
        sv = iy - 1.0
        for ix in range(3):
            su = ix - 1.0
            dome = cup_depth * (1.0 - 0.65 * (su * su + sv * sv))
            pos = center + u_dir * (su * size_u * 0.5) + v_dir * (sv * size_v * 0.5) + n * dome
            vert = bm.verts.new(pos)
            # Subtle warm top lighting gradient across each rosette
            shade = ao_lo + (ao_hi - ao_lo) * (0.5 + 0.5 * sv)
            row.append((vert, ix * 0.5, iy * 0.5, shade))
        grid.append(row)

    for iy in range(2):
        for ix in range(2):
            v00, u00, w00, s00 = grid[iy][ix]
            v10, u10, w10, s10 = grid[iy][ix + 1]
            v11, u11, w11, s11 = grid[iy + 1][ix + 1]
            v01, u01, w01, s01 = grid[iy + 1][ix]
            f = bm.faces.new((v00, v10, v11, v01))
            f.smooth = True
            uvs = ((u00, w00), (u10, w10), (u11, w11), (u01, w01))
            shades = (s00, s10, s11, s01)
            for idx_l, loop in enumerate(f.loops):
                loop[uv_layer].uv = uvs[idx_l]
                s = clamp01(shades[idx_l])
                loop[col_layer] = (s, s, s, 1.0)


def _sample_branch(p0: Vector, p1: Vector, bend: Vector, r0: float, r1: float, steps: int = 6):
    pts = []
    radii = []
    for i in range(steps + 1):
        t = i / steps
        # Quadratic bezier from p0 -> mid+bend -> p1
        mid = p0.lerp(p1, 0.5) + bend
        pos = ((1.0 - t) ** 2) * p0 + 2.0 * (1.0 - t) * t * mid + (t ** 2) * p1
        flare = 0.08 * r0 * ((1.0 - t) ** 3) if t < 0.35 else 0.0
        pts.append(pos)
        radii.append(r0 * (1.0 - t) + r1 * t + flare)
    return pts, radii


def _build_canopy_tree(name: str, sp: str, seed: int, bark_mat, leaf_mat_a, leaf_mat_b=None, core_mat=None):
    rng = random.Random(seed)
    root = _new_empty(name)

    if sp == "cherry":
        h_trunk, spread, n_boughs = 2.55, 2.35, 5
        r_base = 0.24
    elif sp == "oak":
        h_trunk, spread, n_boughs = 2.85, 2.75, 5
        r_base = 0.32
    elif sp == "birch":
        h_trunk, spread, n_boughs = 3.85, 1.55, 4
        r_base = 0.16
    elif sp == "olive":
        h_trunk, spread, n_boughs = 2.05, 2.45, 5
        r_base = 0.29
    else:  # cypress
        h_trunk, spread, n_boughs = 6.20, 0.72, 1
        r_base = 0.19

    trunk_tips = []

    def build_wood(bm):
        if sp == "cypress":
            pts, rads = _sample_branch(
                yup(0.0, -0.08, 0.0),
                yup((rng.random() - 0.5) * 0.15, h_trunk * 0.88, (rng.random() - 0.5) * 0.15),
                yup((rng.random() - 0.5) * 0.10, 0.0, (rng.random() - 0.5) * 0.10),
                r_base * 1.15,
                0.045,
                steps=7,
            )
            add_tube_along_curve(bm, pts, rads, radial_segs=8)
            trunk_tips.append(yup(0.0, h_trunk * 0.55, 0.0))
            return

        lean_x = (rng.random() - 0.5) * 0.55
        lean_z = (rng.random() - 0.5) * 0.55
        fork_p = yup(lean_x, h_trunk, lean_z)
        pts, rads = _sample_branch(yup(0.0, -0.08, 0.0), fork_p, yup(lean_x * 0.4, 0.15, lean_z * 0.4), r_base * 1.25, r_base * 0.58, steps=6)
        add_tube_along_curve(bm, pts, rads, radial_segs=9)
        # Exposed gnarled root spurs
        for ri in range(4):
            ra = (ri / 4.0) * math.tau + rng.random() * 0.5
            rp0 = yup(math.cos(ra) * r_base * 0.5, 0.24, math.sin(ra) * r_base * 0.5)
            rp1 = yup(math.cos(ra) * r_base * 1.65, -0.10, math.sin(ra) * r_base * 1.65)
            add_tube_along_curve(bm, [rp0, rp1], [r_base * 0.42, r_base * 0.16], radial_segs=6)

        for bi in range(n_boughs):
            ang = (bi / n_boughs) * math.tau + rng.uniform(-0.35, 0.35)
            dist = spread * rng.uniform(0.70, 1.05)
            by = h_trunk + rng.uniform(1.15, 1.95)
            p1 = yup(lean_x + math.cos(ang) * dist, by, lean_z + math.sin(ang) * dist)
            bend = yup(math.cos(ang) * 0.25, 0.42, math.sin(ang) * 0.25)
            b_pts, b_rads = _sample_branch(fork_p, p1, bend, r_base * 0.48, r_base * 0.13, steps=5)
            add_tube_along_curve(bm, b_pts, b_rads, radial_segs=7)
            trunk_tips.append(p1)
            # Sub-twig
            ang2 = ang + rng.choice([-0.65, 0.65])
            p_sub = p1 + yup(math.cos(ang2) * 0.72, rng.uniform(0.35, 0.75), math.sin(ang2) * 0.72)
            s_pts, s_rads = _sample_branch(b_pts[3], p_sub, yup(0, 0.18, 0), r_base * 0.22, r_base * 0.08, steps=4)
            add_tube_along_curve(bm, s_pts, s_rads, radial_segs=6)
            trunk_tips.append(p_sub)

    _mesh_part(f"{name}_Trunk", build_wood, bark_mat, uv_scale=0.8, parent=root)

    def build_foliage_core(bm):
        if sp == "cypress":
            for tier in range(7):
                t = tier / 6.0
                ty = 1.25 + t * 5.2
                profile = math.sin((0.14 + t * 0.86) * math.pi) ** 0.78
                rad = 0.44 * profile + 0.08
                add_uv_sphere_part(bm, yup(0.0, ty, 0.0), (rad, rad, 0.72), u_segs=8, v_rings=6, noise_amp=0.14, noise_freq=2.6, seed=seed + tier)
            return

        r_core = 0.34 if sp == "birch" else (0.48 if sp == "oak" else 0.40)
        tips_core = list(trunk_tips[:6]) + [yup(0.0, h_trunk + 1.85, 0.0)]
        for idx, tip in enumerate(tips_core):
            sc = 0.82 + 0.22 * ((idx * 37 + seed) % 5) / 4.0
            add_uv_sphere_part(bm, tip, (r_core * sc, r_core * sc, r_core * 0.62 * sc), u_segs=8, v_rings=6, noise_amp=0.14, noise_freq=2.4, seed=seed + idx)

    def build_foliage(bm, subset: int):
        uv_layer = bm.loops.layers.uv.verify()
        col_layer = bm.loops.layers.color.verify()
        if sp == "cypress":
            n_plumes = 44
            for pi in range(n_plumes):
                if leaf_mat_b is not None and (pi % 2 != subset):
                    continue
                t = pi / max(1, n_plumes - 1)
                ty = 1.05 + t * 5.65
                profile = math.sin((0.10 + t * 0.90) * math.pi) ** 0.72
                rad = 0.44 * profile + 0.08
                az = pi * 2.39996 + (seed % 7) * 0.4
                dir_out = Vector((math.cos(az), -math.sin(az), 0.34)).normalized()
                ctr = yup(math.cos(az) * rad, ty, math.sin(az) * rad)
                w_c = (0.58 + 0.22 * profile) * (1.0 - 0.14 * t)
                h_c = 0.84 + 0.24 * profile
                ao_lo = 0.62 + 0.16 * t
                ao_hi = 0.88 + 0.12 * t
                _add_cupped_leaf_card(bm, ctr, dir_out, w_c, h_c, 0.16, (rng.random() - 0.5) * 0.28, ao_lo, ao_hi, uv_layer, col_layer)
            return

        if sp == "cherry":
            card_sz = 1.68
        elif sp == "oak":
            card_sz = 1.94
        elif sp == "birch":
            card_sz = 1.54
        else:
            card_sz = 1.74

        tips = list(trunk_tips) + [
            yup(0.0, h_trunk + 2.15, 0.0),
            yup(0.62, h_trunk + 1.88, -0.46),
            yup(-0.62, h_trunk + 1.82, 0.52),
            yup(0.28, h_trunk + 1.65, 0.66),
            yup(-0.34, h_trunk + 1.55, -0.58),
        ]
        # 7 layered cloud normals per tip (crown cap + 4 upper billows + 2 lower skirt billows)
        rosette_dirs = [
            Vector((0.0, 0.0, 1.0)),
            Vector((0.78, 0.28, 0.56)).normalized(),
            Vector((-0.78, 0.30, 0.55)).normalized(),
            Vector((0.26, -0.80, 0.54)).normalized(),
            Vector((-0.30, 0.78, 0.55)).normalized(),
            Vector((0.68, -0.62, 0.39)).normalized(),
            Vector((-0.64, -0.66, 0.39)).normalized(),
        ]
        for idx, tip in enumerate(tips):
            base_yaw = rng.random() * math.tau
            cy, sy = math.cos(base_yaw), math.sin(base_yaw)
            tip_h = clamp01((tip.z - h_trunk) / 2.4)
            ao_base = 0.58 + 0.20 * tip_h
            for ri, d_loc in enumerate(rosette_dirs):
                card_id = idx * len(rosette_dirs) + ri
                if leaf_mat_b is not None and (card_id % 2 != subset):
                    continue
                d_rot = Vector((d_loc.x * cy - d_loc.y * sy, d_loc.x * sy + d_loc.y * cy, d_loc.z)).normalized()
                offset_dist = 0.20 * card_sz if ri == 0 else (0.30 * card_sz if ri < 5 else 0.27 * card_sz)
                ctr = tip + d_rot * offset_dist
                sz = card_sz * rng.uniform(0.86, 1.18)
                _add_cupped_leaf_card(
                    bm,
                    ctr,
                    d_rot,
                    sz,
                    sz * rng.uniform(0.92, 1.12),
                    sz * 0.18,
                    rng.uniform(-0.8, 0.8),
                    ao_base,
                    clamp01(ao_base + 0.34),
                    uv_layer,
                    col_layer,
                )

    if core_mat is not None:
        _mesh_part(f"{name}_CanopyCore", build_foliage_core, core_mat, uv_scale=0.75, parent=root)
    _mesh_part(f"{name}_CanopyA", lambda bm: build_foliage(bm, 0), leaf_mat_a, uv_scale=None, parent=root, sharp_angle_deg=None)
    if leaf_mat_b is not None:
        _mesh_part(f"{name}_CanopyB", lambda bm: build_foliage(bm, 1), leaf_mat_b, uv_scale=None, parent=root, sharp_angle_deg=None)
    return root


def _build_weeping_palm(name: str, seed: int, palm_bark_mat, frond_mat, coconut_mat):
    rng = random.Random(seed)
    root = _new_empty(name)
    h = 3.55 if seed % 2 == 0 else 4.05
    lean_x = 0.34 + rng.uniform(-0.12, 0.12)
    lean_z = 0.24 + rng.uniform(-0.12, 0.12)

    trunk_pts = [
        yup(0.0, -0.08, 0.0),
        yup(lean_x * 0.25, h * 0.32, lean_z * 0.25),
        yup(lean_x * 0.68, h * 0.68, lean_z * 0.68),
        yup(lean_x, h, lean_z),
    ]
    trunk_rads = [0.16, 0.115, 0.095, 0.082]

    _mesh_part(
        f"{name}_Trunk",
        lambda bm: add_tube_along_curve(bm, trunk_pts, trunk_rads, radial_segs=10),
        palm_bark_mat,
        uv_scale=0.8,
        parent=root,
    )

    crown_pt = yup(lean_x, h, lean_z)

    def build_fronds(bm):
        frond_count = 13
        for i in range(frond_count):
            az = (i / frond_count) * math.tau + rng.uniform(-0.12, 0.12)
            fl = rng.uniform(1.48, 1.98)
            arch = 0.38 + (i % 3) * 0.18
            dir_v = yup(math.sin(az), 0.0, math.cos(az))
            perp_v = yup(math.cos(az), 0.0, -math.sin(az))
            up_v = yup(0.0, 1.0, 0.0)

            spine = []
            rads = []
            segs = 10
            for k in range(segs + 1):
                u = k / segs
                p = crown_pt + dir_v * (u * fl) + up_v * (math.sin(u * math.pi * 0.85) * arch - (u ** 2.2) * 0.56)
                spine.append(p)
                rads.append(0.022 * (1.0 - u * 0.72))
            add_tube_along_curve(bm, spine, rads, radial_segs=6)

            # Feathered 3D triangular pinnate leaflets along both sides of rachis (never flat planes!)
            for k in range(1, segs):
                u = k / segs
                p0 = spine[k]
                p_next = spine[k + 1]
                w_leaf = math.sin(u * math.pi) * 0.44
                for side in (-1.0, 1.0):
                    v0 = bm.verts.new(p0)
                    v1 = bm.verts.new(p_next)
                    v_tip = bm.verts.new(p0 + perp_v * (side * w_leaf) + dir_v * 0.12 - up_v * (0.14 + u * 0.22))
                    bm.faces.new((v0, v1, v_tip))

    _mesh_part(f"{name}_Fronds", build_fronds, frond_mat, uv_scale=0.8, parent=root)

    def build_coconuts(bm):
        for ci in range(5):
            a = (ci / 5.0) * math.tau + 0.3
            cpos = crown_pt + yup(math.cos(a) * 0.13, -0.10 - (ci % 2) * 0.06, math.sin(a) * 0.13)
            add_uv_sphere_part(bm, cpos, (0.075, 0.075, 0.088), u_segs=10, v_rings=8)

    _mesh_part(f"{name}_Coconuts", build_coconuts, coconut_mat, uv_scale=1.0, parent=root)
    return root


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", type=Path, default=Path("site/assets/models"))
    args = parser.parse_args(argv)
    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    TEX_CACHE.mkdir(parents=True, exist_ok=True)

    reset_scene()
    barks = _make_bark_textures()
    foliage = _make_foliage_textures()

    m_bark_cherry = make_pbr_material("Tree_CherryBark", (0.34, 0.21, 0.18), roughness=0.82, image=barks["cherry"], normal_image=barks["nrm"], normal_strength=0.85)
    m_bark_oak = make_pbr_material("Tree_OakBark", (0.33, 0.26, 0.19), roughness=0.88, image=barks["oak"], normal_image=barks["nrm"], normal_strength=0.95)
    m_bark_birch = make_pbr_material("Tree_BirchBark", (0.90, 0.88, 0.83), roughness=0.72, image=barks["birch"], normal_image=barks["nrm"], normal_strength=0.55)
    m_bark_olive = make_pbr_material("Tree_OliveBark", (0.45, 0.40, 0.33), roughness=0.86, image=barks["olive"], normal_image=barks["nrm"], normal_strength=0.90)
    m_bark_palm = make_pbr_material("Tree_PalmBark", (0.48, 0.35, 0.24), roughness=0.86, image=barks["palm"], normal_image=barks["nrm"], normal_strength=0.85)

    m_cherry_a = make_pbr_material("Tree_CherryBlossomA", (1.0, 1.0, 1.0), roughness=0.68, emission=(0.98, 0.74, 0.82), emission_strength=0.05, image=foliage["cherry_a"], double_sided=True, alpha_cutoff=0.38, use_vertex_color=True)
    m_cherry_b = make_pbr_material("Tree_CherryBlossomB", (1.0, 1.0, 1.0), roughness=0.68, emission=(1.0, 0.85, 0.88), emission_strength=0.04, image=foliage["cherry_b"], double_sided=True, alpha_cutoff=0.38, use_vertex_color=True)
    m_cherry_core = make_pbr_material("Tree_CherryCore", (1.0, 1.0, 1.0), roughness=0.78, image=foliage["cherry_core"])

    m_oak_a = make_pbr_material("Tree_OakLeafA", (1.0, 1.0, 1.0), roughness=0.70, image=foliage["oak_a"], double_sided=True, alpha_cutoff=0.38, use_vertex_color=True)
    m_oak_b = make_pbr_material("Tree_OakLeafB", (1.0, 1.0, 1.0), roughness=0.68, image=foliage["oak_b"], double_sided=True, alpha_cutoff=0.38, use_vertex_color=True)
    m_oak_core = make_pbr_material("Tree_OakCore", (1.0, 1.0, 1.0), roughness=0.82, image=foliage["oak_core"])

    m_birch_a = make_pbr_material("Tree_BirchLeafA", (1.0, 1.0, 1.0), roughness=0.66, image=foliage["birch_a"], double_sided=True, alpha_cutoff=0.38, use_vertex_color=True)
    m_birch_b = make_pbr_material("Tree_BirchLeafB", (1.0, 1.0, 1.0), roughness=0.64, image=foliage["birch_b"], double_sided=True, alpha_cutoff=0.38, use_vertex_color=True)
    m_birch_core = make_pbr_material("Tree_BirchCore", (1.0, 1.0, 1.0), roughness=0.76, image=foliage["birch_core"])

    m_olive_a = make_pbr_material("Tree_OliveLeafA", (1.0, 1.0, 1.0), roughness=0.70, image=foliage["olive_a"], double_sided=True, alpha_cutoff=0.38, use_vertex_color=True)
    m_olive_b = make_pbr_material("Tree_OliveLeafB", (1.0, 1.0, 1.0), roughness=0.68, image=foliage["olive_b"], double_sided=True, alpha_cutoff=0.38, use_vertex_color=True)
    m_olive_core = make_pbr_material("Tree_OliveCore", (1.0, 1.0, 1.0), roughness=0.80, image=foliage["olive_core"])

    m_cyp_a = make_pbr_material("Tree_CypressLeafA", (1.0, 1.0, 1.0), roughness=0.74, image=foliage["cyp_a"], double_sided=True, alpha_cutoff=0.36, use_vertex_color=True)
    m_cyp_b = make_pbr_material("Tree_CypressLeafB", (1.0, 1.0, 1.0), roughness=0.72, image=foliage["cyp_b"], double_sided=True, alpha_cutoff=0.36, use_vertex_color=True)
    m_cyp_core = make_pbr_material("Tree_CypressCore", (1.0, 1.0, 1.0), roughness=0.84, image=foliage["cyp_core"])

    m_palm_frond = make_pbr_material("Tree_PalmFrond", (0.34, 0.80, 0.34), roughness=0.46, specular=0.55, double_sided=True)
    m_coconut = make_pbr_material("Tree_Coconut", (0.34, 0.21, 0.11), roughness=0.76)

    _build_canopy_tree("Tree_Cherry_A", "cherry", 101, m_bark_cherry, m_cherry_a, m_cherry_b, m_cherry_core)
    _build_canopy_tree("Tree_Cherry_B", "cherry", 102, m_bark_cherry, m_cherry_a, m_cherry_b, m_cherry_core)
    _build_canopy_tree("Tree_Oak_A", "oak", 201, m_bark_oak, m_oak_a, m_oak_b, m_oak_core)
    _build_canopy_tree("Tree_Oak_B", "oak", 202, m_bark_oak, m_oak_a, m_oak_b, m_oak_core)
    _build_canopy_tree("Tree_Birch_A", "birch", 301, m_bark_birch, m_birch_a, m_birch_b, m_birch_core)
    _build_canopy_tree("Tree_Birch_B", "birch", 302, m_bark_birch, m_birch_a, m_birch_b, m_birch_core)
    _build_canopy_tree("Tree_Olive_A", "olive", 401, m_bark_olive, m_olive_a, m_olive_b, m_olive_core)
    _build_canopy_tree("Tree_Olive_B", "olive", 402, m_bark_olive, m_olive_a, m_olive_b, m_olive_core)
    _build_canopy_tree("Tree_Cypress_A", "cypress", 501, m_bark_oak, m_cyp_a, m_cyp_b, m_cyp_core)
    _build_canopy_tree("Tree_Cypress_B", "cypress", 502, m_bark_oak, m_cyp_a, m_cyp_b, m_cyp_core)
    _build_weeping_palm("Tree_Palm_A", 600, m_bark_palm, m_palm_frond, m_coconut)
    _build_weeping_palm("Tree_Palm_B", 601, m_bark_palm, m_palm_frond, m_coconut)

    export_glb(out_dir / "stylized_trees.glb", with_anims=False)


if __name__ == "__main__":
    main()
