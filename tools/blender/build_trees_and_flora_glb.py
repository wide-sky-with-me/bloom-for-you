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

    return {
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


def _new_empty(name: str) -> bpy.types.Object:
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    return e


def _mesh_part(name: str, builder_fn, mat, uv_scale: float, parent: bpy.types.Object) -> bpy.types.Object:
    bm = bmesh.new()
    builder_fn(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = create_mesh_object(name, bm, mat)
    ensure_uv_box(obj, scale=uv_scale)
    obj.parent = parent
    return obj


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


def _build_canopy_tree(name: str, sp: str, seed: int, bark_mat, leaf_mat_a, leaf_mat_b=None):
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

    def build_foliage(bm, subset: int):
        if sp == "cypress":
            # Layered dense Italian cypress flame column (from Y = 0.9m up to 6.8m)
            for tier in range(11):
                if leaf_mat_b is not None and (tier % 2 != subset):
                    continue
                t = tier / 10.0
                ty = 1.15 + t * 5.65
                profile = math.sin((0.12 + t * 0.88) * math.pi) ** 0.75
                rad = 0.78 * profile + 0.14
                ox = math.sin(tier * 2.3 + seed) * 0.09
                oz = math.cos(tier * 2.1 + seed) * 0.09
                add_uv_sphere_part(bm, yup(ox, ty, oz), (rad, rad * 0.96, 0.68), u_segs=14, v_rings=10, noise_amp=0.22, noise_freq=2.8, seed=seed + tier)
            return

        # Canopy clusters perched cleanly at outer bough tips + crown apex
        if sp == "cherry":
            cluster_r = (0.85, 0.78, 0.56)
        elif sp == "oak":
            cluster_r = (1.12, 1.05, 0.68)
        elif sp == "birch":
            cluster_r = (0.72, 0.68, 0.60)
        else:
            cluster_r = (0.95, 0.92, 0.52)

        tips = list(trunk_tips) + [yup(0.0, h_trunk + 2.05, 0.0), yup(0.45, h_trunk + 1.85, -0.35), yup(-0.45, h_trunk + 1.75, 0.42)]
        for idx, tip in enumerate(tips):
            if leaf_mat_b is not None and (idx % 2 != subset):
                continue
            sc = rng.uniform(0.82, 1.18)
            add_uv_sphere_part(
                bm,
                tip,
                (cluster_r[0] * sc, cluster_r[1] * sc, cluster_r[2] * sc),
                u_segs=14,
                v_rings=10,
                noise_amp=0.24,
                noise_freq=2.4,
                seed=seed + idx * 7,
            )

    _mesh_part(f"{name}_CanopyA", lambda bm: build_foliage(bm, 0), leaf_mat_a, uv_scale=0.6, parent=root)
    if leaf_mat_b is not None:
        _mesh_part(f"{name}_CanopyB", lambda bm: build_foliage(bm, 1), leaf_mat_b, uv_scale=0.6, parent=root)
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

    m_bark_cherry = make_pbr_material("Tree_CherryBark", (0.34, 0.21, 0.18), roughness=0.82, image=barks["cherry"])
    m_bark_oak = make_pbr_material("Tree_OakBark", (0.33, 0.26, 0.19), roughness=0.88, image=barks["oak"])
    m_bark_birch = make_pbr_material("Tree_BirchBark", (0.90, 0.88, 0.83), roughness=0.72, image=barks["birch"])
    m_bark_olive = make_pbr_material("Tree_OliveBark", (0.45, 0.40, 0.33), roughness=0.86, image=barks["olive"])
    m_bark_palm = make_pbr_material("Tree_PalmBark", (0.48, 0.35, 0.24), roughness=0.86, image=barks["palm"])

    m_cherry_a = make_pbr_material("Tree_CherryBlossomA", (0.99, 0.78, 0.86), roughness=0.72, emission=(0.98, 0.74, 0.82), emission_strength=0.10)
    m_cherry_b = make_pbr_material("Tree_CherryBlossomB", (0.99, 0.89, 0.92), roughness=0.72, emission=(1.0, 0.85, 0.88), emission_strength=0.08)
    m_oak_a = make_pbr_material("Tree_OakLeafA", (0.28, 0.48, 0.22), roughness=0.76)
    m_oak_b = make_pbr_material("Tree_OakLeafB", (0.39, 0.58, 0.26), roughness=0.74)
    m_birch_a = make_pbr_material("Tree_BirchLeafA", (0.56, 0.71, 0.30), roughness=0.72)
    m_birch_b = make_pbr_material("Tree_BirchLeafB", (0.72, 0.76, 0.34), roughness=0.70)
    m_olive_a = make_pbr_material("Tree_OliveLeafA", (0.42, 0.51, 0.37), roughness=0.74)
    m_olive_b = make_pbr_material("Tree_OliveLeafB", (0.53, 0.61, 0.47), roughness=0.74)
    m_cyp_a = make_pbr_material("Tree_CypressLeafA", (0.16, 0.30, 0.17), roughness=0.80)
    m_cyp_b = make_pbr_material("Tree_CypressLeafB", (0.21, 0.36, 0.20), roughness=0.78)
    m_palm_frond = make_pbr_material("Tree_PalmFrond", (0.34, 0.56, 0.22), roughness=0.58, double_sided=True)
    m_coconut = make_pbr_material("Tree_Coconut", (0.34, 0.21, 0.11), roughness=0.78)

    _build_canopy_tree("Tree_Cherry_A", "cherry", 101, m_bark_cherry, m_cherry_a, m_cherry_b)
    _build_canopy_tree("Tree_Cherry_B", "cherry", 102, m_bark_cherry, m_cherry_a, m_cherry_b)
    _build_canopy_tree("Tree_Oak_A", "oak", 201, m_bark_oak, m_oak_a, m_oak_b)
    _build_canopy_tree("Tree_Oak_B", "oak", 202, m_bark_oak, m_oak_a, m_oak_b)
    _build_canopy_tree("Tree_Birch_A", "birch", 301, m_bark_birch, m_birch_a, m_birch_b)
    _build_canopy_tree("Tree_Birch_B", "birch", 302, m_bark_birch, m_birch_a, m_birch_b)
    _build_canopy_tree("Tree_Olive_A", "olive", 401, m_bark_olive, m_olive_a, m_olive_b)
    _build_canopy_tree("Tree_Olive_B", "olive", 402, m_bark_olive, m_olive_a, m_olive_b)
    _build_canopy_tree("Tree_Cypress_A", "cypress", 501, m_bark_oak, m_cyp_a, m_cyp_b)
    _build_canopy_tree("Tree_Cypress_B", "cypress", 502, m_bark_oak, m_cyp_a, m_cyp_b)
    _build_weeping_palm("Tree_Palm_A", 600, m_bark_palm, m_palm_frond, m_coconut)
    _build_weeping_palm("Tree_Palm_B", 601, m_bark_palm, m_palm_frond, m_coconut)

    export_glb(out_dir / "stylized_trees.glb", with_anims=False)


if __name__ == "__main__":
    main()
