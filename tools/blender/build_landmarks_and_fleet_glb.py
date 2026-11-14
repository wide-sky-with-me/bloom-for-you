#!/usr/bin/env python3
"""Build high-craft Blender 4.0.2 GLB assets for landmarks, bridges, gazebos, gardens, and harbor fleet.

Outputs into `--out-dir` (default: `site/assets/models`):
  - garden_monet_pond.glb
  - garden_swing_arches.glb
  - coastal_lighthouse.glb
  - hilltop_windmill.glb
  - creek_bridge.glb
  - cliffside_gazebo.glb
  - provencal_cottage.glb
  - harbor_fleet.glb
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
    add_beveled_box,
    add_cylinder_part,
    add_lathe_part,
    add_tube_along_curve,
    add_uv_sphere_part,
    clamp01,
    create_mesh_object,
    ensure_uv_box,
    export_glb,
    fbm2,
    join_objects,
    make_packed_texture,
    make_pbr_material,
    mix_rgb,
    reset_scene,
    yup,
)

TEX_CACHE = SCRIPT_DIR / "_tex_cache"


def _make_shared_textures():
    """Create & cache procedural stone, plaster, terracotta, wood, fabric textures."""
    img_stone = make_packed_texture(
        TEX_CACHE / "stone_ashlar.png",
        256,
        256,
        lambda u, v: (
            lambda n, mortar: (
                *mix_rgb(
                    mix_rgb((0.72, 0.69, 0.63), (0.85, 0.82, 0.76), n),
                    (0.55, 0.52, 0.47),
                    mortar,
                ),
                1.0,
            )
        )(
            fbm2(u * 8.0, v * 8.0, seed=11, octaves=3),
            max(
                0.0,
                1.0 - min(abs((v * 6.0) % 1.0 - 0.5) * 14.0, abs(((u * 3.0 + (0.5 if int(v * 6.0) % 2 else 0.0)) % 1.0) - 0.5) * 14.0),
            )
            * 0.55,
        ),
    )
    img_rock = make_packed_texture(
        TEX_CACHE / "limestone_rock.png",
        256,
        256,
        lambda u, v: (
            lambda n1, n2: (
                *mix_rgb((0.48, 0.50, 0.45), (0.76, 0.74, 0.67), clamp01(n1 * 0.7 + n2 * 0.3)),
                1.0,
            )
        )(fbm2(u * 6.0, v * 6.0, seed=23, octaves=4), fbm2(u * 18.0, v * 18.0, seed=41, octaves=2)),
    )
    img_plaster = make_packed_texture(
        TEX_CACHE / "stucco_plaster.png",
        256,
        256,
        lambda u, v: (
            lambda n: (*mix_rgb((0.92, 0.87, 0.78), (0.98, 0.95, 0.90), n), 1.0)
        )(fbm2(u * 9.0, v * 9.0, seed=71, octaves=3)),
    )
    img_terracotta = make_packed_texture(
        TEX_CACHE / "terracotta_tiles.png",
        256,
        256,
        lambda u, v: (
            lambda wave, n: (
                *mix_rgb(
                    (0.68, 0.32, 0.21),
                    (0.84, 0.46, 0.32),
                    clamp01(0.45 + 0.35 * math.sin(u * math.tau * 8.0) + (n - 0.5) * 0.45 - 0.18 * (1.0 - ((v * 6.0) % 1.0))),
                ),
                1.0,
            )
        )(math.sin(u * math.tau * 8.0), fbm2(u * 10.0, v * 10.0, seed=53, octaves=3)),
    )
    img_wood = make_packed_texture(
        TEX_CACHE / "warm_cedar.png",
        256,
        256,
        lambda u, v: (
            lambda g, plank: (
                *mix_rgb(
                    mix_rgb((0.46, 0.29, 0.17), (0.64, 0.43, 0.26), g),
                    (0.28, 0.17, 0.09),
                    plank,
                ),
                1.0,
            )
        )(
            clamp01(0.5 + 0.5 * math.sin(u * 48.0 + fbm2(u * 6.0, v * 18.0, seed=88) * 3.0)),
            1.0 if ((u * 6.0) % 1.0) < 0.045 else 0.0,
        ),
    )
    img_teak = make_packed_texture(
        TEX_CACHE / "yacht_teak.png",
        256,
        256,
        lambda u, v: (
            lambda caulk, grain: (
                *mix_rgb(mix_rgb((0.68, 0.49, 0.30), (0.80, 0.61, 0.39), grain), (0.14, 0.11, 0.09), caulk),
                1.0,
            )
        )(
            1.0 if ((v * 12.0) % 1.0) < 0.09 else 0.0,
            fbm2(u * 20.0, v * 4.0, seed=91, octaves=2),
        ),
    )
    img_shingle = make_packed_texture(
        TEX_CACHE / "wood_shingle.png",
        256,
        256,
        lambda u, v: (
            lambda row, edge, n: (
                *mix_rgb((0.28, 0.21, 0.16), (0.44, 0.35, 0.28), clamp01(0.5 + (n - 0.5) * 0.6 - edge * 0.4)),
                1.0,
            )
        )(int(v * 10.0), 1.0 if ((v * 10.0) % 1.0) < 0.12 else 0.0, fbm2(u * 12.0, v * 12.0, seed=99)),
    )
    return {
        "stone": img_stone,
        "rock": img_rock,
        "plaster": img_plaster,
        "terracotta": img_terracotta,
        "wood": img_wood,
        "teak": img_teak,
        "shingle": img_shingle,
    }


def _new_empty(name: str, parent: bpy.types.Object | None = None) -> bpy.types.Object:
    empty = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(empty)
    if parent is not None:
        empty.parent = parent
    return empty


def _build_bmesh_part(name: str, builder_fn, mat, uv_scale: float = 0.5, parent: bpy.types.Object | None = None):
    bm = bmesh.new()
    builder_fn(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = create_mesh_object(name, bm, mat)
    ensure_uv_box(obj, scale=uv_scale)
    if parent is not None:
        obj.parent = parent
    return obj


# ---------------------------------------------------------------------------
# 1. Monet Waterfall Cliff + Sculpted Tiers + Sage Bridge (Local @ (-1.5, 0, 12.65))
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Geometric Sculpting Helpers (Stratified Basalt & Organic Vine Foliage)
# ---------------------------------------------------------------------------

def _add_faceted_rock_part(
    bm: bmesh.types.BMesh,
    center: Sequence[float],
    scale: Sequence[float],
    u_segs: int = 9,
    v_rings: int = 6,
    rot_euler: Sequence[float] = (0.0, 0.0, 0.0),
    noise_amp: float = 0.28,
    noise_freq: float = 2.4,
    seed: int = 1,
    strata: float = 0.09,
    flat_top: float = 0.35,
) -> None:
    """Create an angular faceted stratified rock outcrop with flat-shaded planes."""
    temp = bmesh.new()
    bmesh.ops.create_uvsphere(temp, u_segments=u_segs, v_segments=v_rings, radius=1.0)
    for v in temp.verts:
        p = v.co
        n = fbm2(p.x * noise_freq + p.z * 0.8, p.y * noise_freq - p.z * 0.6, seed=seed, octaves=3)
        ridge = math.sin(p.z * 7.5 + (seed % 7) * 0.9) * strata
        k = max(0.45, 1.0 + (n - 0.5) * 2.0 * noise_amp + ridge)
        # Anisotropic facet pull & terraced upper ledge
        px = p.x * k
        py = p.y * k
        pz = p.z * (0.92 + (n - 0.5) * 0.32)
        if pz > 0.42:
            pz = 0.42 + (pz - 0.42) * (1.0 - flat_top)
        v.co = Vector((px, py, pz))
    bmesh.ops.scale(temp, vec=scale, verts=temp.verts)
    rot_m = Euler(rot_euler, "XYZ").to_matrix().to_4x4()
    trans_m = Matrix.Translation(Vector(center))
    bmesh.ops.transform(temp, matrix=trans_m @ rot_m, verts=temp.verts)
    bmesh.ops.recalc_face_normals(temp, faces=temp.faces)
    for f in temp.faces:
        f.smooth = False
    tmp_mesh = bpy.data.meshes.new("_tmp_rock")
    temp.to_mesh(tmp_mesh)
    temp.free()
    bm.from_mesh(tmp_mesh)
    bpy.data.meshes.remove(tmp_mesh)


def _add_blade_quad(
    bm: bmesh.types.BMesh,
    origin: Vector,
    forward: Vector,
    side: Vector,
    up: Vector,
    length: float,
    width: float,
    cup: float = 0.18,
) -> None:
    """Add a cupped diamond-pointed leaf or bougainvillea bract quad."""
    v0 = bm.verts.new(origin)
    v1 = bm.verts.new(origin + forward * (length * 0.45) + side * (width * 0.5) + up * (length * cup))
    v2 = bm.verts.new(origin + forward * length - up * (length * cup * 0.35))
    v3 = bm.verts.new(origin + forward * (length * 0.45) - side * (width * 0.5) + up * (length * cup))
    f = bm.faces.new((v0, v1, v2, v3))
    f.smooth = False


def _add_leaf_sprig(bm: bmesh.types.BMesh, center: Vector, dir_bias: Vector, scale: float, seed: int) -> None:
    base_dir = dir_bias.normalized() if dir_bias.length > 1e-5 else Vector((0.0, -1.0, 0.2))
    side0 = base_dir.cross(Vector((0.0, 0.0, 1.0)))
    if side0.length < 1e-4:
        side0 = Vector((1.0, 0.0, 0.0))
    side0.normalize()
    up0 = side0.cross(base_dir).normalized()
    for li in range(5):
        ang = ((seed * 37 + li * 137) % 360) * (math.pi / 180.0)
        pitch = -0.35 + ((seed + li * 23) % 10) * 0.08
        fwd = (base_dir * math.cos(ang) * 0.4 + side0 * math.sin(ang) + up0 * pitch).normalized()
        s_vec = fwd.cross(up0)
        if s_vec.length < 1e-4:
            s_vec = Vector((1.0, 0.0, 0.0))
        s_vec.normalize()
        u_vec = s_vec.cross(fwd).normalized()
        l_len = scale * (0.78 + ((seed + li) % 5) * 0.11)
        _add_blade_quad(bm, center + fwd * (scale * 0.08), fwd, s_vec, u_vec, l_len, l_len * 0.52, cup=0.14)


def _add_blossom_cluster(bm: bmesh.types.BMesh, center: Vector, scale: float, seed: int) -> None:
    """Cluster of delicate papery triangular-bract florets along a vine stem."""
    for fi in range(3):
        phi = ((seed * 53 + fi * 119) % 360) * (math.pi / 180.0)
        elev = (((seed * 17 + fi * 41) % 100) / 100.0 - 0.5) * 0.7
        floret_ctr = center + Vector((math.cos(phi), math.sin(phi), elev)) * (scale * 0.55)
        for bi in range(3):
            ba = phi + (bi / 3.0) * math.tau
            fwd = Vector((math.cos(ba), math.sin(ba), 0.32 + 0.18 * math.sin(phi + bi))).normalized()
            side = Vector((-math.sin(ba), math.cos(ba), 0.0))
            up = side.cross(fwd).normalized()
            _add_blade_quad(bm, floret_ctr, fwd, side, up, scale * 0.72, scale * 0.62, cup=0.22)


def build_monet_pond_glb(out_path: Path) -> None:
    reset_scene()
    tex = _make_shared_textures()
    m_rock = make_pbr_material("Pond_Limestone", (0.58, 0.59, 0.56), roughness=0.88, image=tex["rock"])
    m_moss = make_pbr_material("Pond_Moss", (0.28, 0.48, 0.24), roughness=0.92)
    m_sage = make_pbr_material("Monet_SageWood", (0.48, 0.61, 0.51), roughness=0.58)
    m_deck = make_pbr_material("Monet_BridgeDeck", (0.56, 0.66, 0.57), roughness=0.64)
    m_shelf = make_pbr_material("Pond_ShelfStone", (0.76, 0.75, 0.70), roughness=0.74, image=tex["rock"])

    root = _new_empty("MonetPondRoot")

    # Tiered stratified slate/basalt waterfall outcrop centered at local (0, 0, 0) = world (-1.5, 0, 12.65)
    def build_cliff(bm):
        boulder_specs = [
            # Lower angular basalt plunge boulders
            (-2.55, 2.32, 0.35, 1.38, 0.88, 1.18, (0.08, -0.14, 0.25), 101),
            (2.50, 2.32, 0.35, 1.38, 0.88, 1.18, (-0.06, 0.12, -0.32), 102),
            (-1.35, 2.42, 0.15, 0.98, 0.78, 0.96, (0.12, 0.08, 0.45), 103),
            (1.35, 2.42, 0.15, 0.98, 0.78, 0.96, (-0.10, -0.06, -0.40), 104),
            (0.0, 2.48, 0.08, 1.28, 0.60, 0.92, (0.04, 0.02, 0.10), 105),
            # Mid-upper cliff tier
            (-2.18, 3.44, -0.35, 1.26, 0.98, 1.08, (-0.12, 0.16, 0.18), 106),
            (2.18, 3.44, -0.35, 1.26, 0.98, 1.08, (0.10, -0.14, -0.22), 107),
            (-1.12, 3.64, -0.45, 0.94, 0.86, 0.92, (0.06, 0.10, 0.35), 108),
            (1.12, 3.64, -0.45, 0.94, 0.86, 0.92, (-0.08, -0.08, -0.28), 109),
            (0.0, 3.55, -0.52, 1.38, 0.74, 0.88, (0.02, 0.0, 0.05), 110),
            # Wing shoulders & back terrace retention wall
            (-3.45, 2.62, 0.88, 1.16, 0.72, 1.06, (0.14, -0.10, 0.42), 111),
            (3.45, 2.62, 0.88, 1.16, 0.72, 1.06, (-0.12, 0.08, -0.38), 112),
            (0.0, 3.82, -1.35, 2.65, 0.82, 0.95, (0.0, 0.04, 0.02), 113),
        ]
        for bx, by, bz, sx, sy, sz, rot_e, seed in boulder_specs:
            _add_faceted_rock_part(
                bm,
                yup(bx, by, bz),
                (sx, sz, sy),
                u_segs=9,
                v_rings=6,
                rot_euler=rot_e,
                noise_amp=0.30,
                noise_freq=2.3,
                seed=seed,
                strata=0.10,
                flat_top=0.40,
            )

    _build_bmesh_part("Waterfall_Cliff", build_cliff, m_rock, uv_scale=0.35, parent=root)

    def build_moss(bm):
        for bx, by, bz, sx, sy, sz, seed in [
            (-2.55, 2.84, 0.35, 1.02, 0.16, 0.88, 201),
            (2.50, 2.84, 0.35, 1.02, 0.16, 0.88, 202),
            (-2.18, 3.98, -0.35, 0.90, 0.15, 0.80, 206),
            (2.18, 3.98, -0.35, 0.90, 0.15, 0.80, 207),
            (-1.12, 4.14, -0.45, 0.68, 0.14, 0.70, 208),
            (1.12, 4.14, -0.45, 0.68, 0.14, 0.70, 209),
            (-3.45, 3.00, 0.88, 0.86, 0.14, 0.80, 211),
            (3.45, 3.00, 0.88, 0.86, 0.14, 0.80, 212),
        ]:
            _add_faceted_rock_part(bm, yup(bx, by, bz), (sx, sz, sy), u_segs=8, v_rings=4, noise_amp=0.22, noise_freq=3.2, seed=seed, strata=0.04, flat_top=0.55)

    _build_bmesh_part("Waterfall_MossCaps", build_moss, m_moss, uv_scale=0.5, parent=root)

    # Underwater and poolside angular granite shelves (relative to cliff anchor (-1.5, 0, 12.65))
    def build_shelves(bm):
        for wx, wy, wz, rx, ry, rz, sd in [
            (-1.95, 1.62, 5.25, 0.90, 0.20, 0.66, 301),
            (2.05, 1.64, 5.15, 0.86, 0.20, 0.62, 302),
            (-0.20, 2.16, 8.75, 0.76, 0.16, 0.54, 303),
            (-2.45, 2.16, 7.65, 0.70, 0.16, 0.52, 304),
            (2.45, 2.16, 7.55, 0.70, 0.16, 0.52, 305),
        ]:
            _add_faceted_rock_part(bm, yup(wx, wy, wz), (rx, rz, ry), u_segs=8, v_rings=4, rot_euler=(0.0, 0.0, (sd % 5) * 0.4), noise_amp=0.18, seed=sd, strata=0.05, flat_top=0.65)

    _build_bmesh_part("Pond_ViewingBoulders", build_shelves, m_shelf, uv_scale=0.6, parent=root)

    # Arched Sage-Green Monet Footbridge at local (0, 4.24, -0.58)
    bridge_empty = _new_empty("Monet_Footbridge", root)
    bridge_empty.location = yup(0.0, 4.24, -0.58)
    span = 3.9

    def build_deck(bm):
        segs = 15
        for i in range(segs):
            u = i / (segs - 1) - 0.5
            px = u * span
            ay = math.cos(u * math.pi) * 0.22
            slope = -math.sin(u * math.pi) * 0.16
            add_beveled_box(bm, yup(px, ay, 0.0), (0.25, 1.14, 0.048), rot_euler=(0.0, -slope, 0.0), bevel=0.008)

    _build_bmesh_part("Bridge_Planks", build_deck, m_deck, uv_scale=1.2, parent=bridge_empty)

    def build_rails(bm):
        for sz in (-0.54, 0.54):
            arch_pts = []
            top_pts = []
            mid_pts = []
            for i in range(17):
                u = i / 16 - 0.5
                px = u * (span + 0.16)
                ay = math.cos(u * math.pi) * 0.22 - 0.03
                arch_pts.append(yup(px, ay, sz))
                top_pts.append(yup(px, ay + 0.80, sz))
                mid_pts.append(yup(px, ay + 0.43, sz))
            add_tube_along_curve(bm, arch_pts, [0.048] * len(arch_pts), radial_segs=8)
            add_tube_along_curve(bm, top_pts, [0.035] * len(top_pts), radial_segs=8)
            add_tube_along_curve(bm, mid_pts, [0.022] * len(mid_pts), radial_segs=6)
            for p in range(5):
                u = p / 4 - 0.5
                px = u * (span + 0.04)
                ay = math.cos(u * math.pi) * 0.22 - 0.03
                add_beveled_box(bm, yup(px, ay + 0.42, sz), (0.07, 0.07, 0.88), bevel=0.008)
                add_uv_sphere_part(bm, yup(px, ay + 0.88, sz), (0.046, 0.046, 0.042), u_segs=10, v_rings=6)

    _build_bmesh_part("Bridge_Rails", build_rails, m_sage, uv_scale=1.0, parent=bridge_empty)

    export_glb(out_path, with_anims=False)


# ---------------------------------------------------------------------------
# 2. Bougainvillea A-Frame Two-Person Swing + 3 Trellis Arches (@ (-28.5, 2.20, 14.0))
# ---------------------------------------------------------------------------

def build_swing_arches_glb(out_path: Path) -> None:
    reset_scene()
    tex = _make_shared_textures()
    m_steel = make_pbr_material("Swing_WhiteSteel", (0.98, 0.98, 0.99), roughness=0.22, metallic=0.18)
    m_chain = make_pbr_material("Swing_ChromeChain", (0.84, 0.83, 0.89), roughness=0.22, metallic=0.88)
    m_slat = make_pbr_material("Swing_WarmSlat", (0.96, 0.94, 0.90), roughness=0.40)
    m_cush = make_pbr_material("Swing_BlushCushion", (0.97, 0.86, 0.90), roughness=0.78)
    m_back = make_pbr_material("Swing_IvoryCushion", (0.99, 0.97, 0.95), roughness=0.76)
    m_pil_l = make_pbr_material("Swing_LilacPillow", (0.85, 0.72, 0.92), roughness=0.74)
    m_pil_c = make_pbr_material("Swing_CoralPillow", (0.96, 0.66, 0.64), roughness=0.74)
    m_iron = make_pbr_material("Arch_Iron", (0.22, 0.24, 0.26), roughness=0.38, metallic=0.82)
    m_vine = make_pbr_material("Bougainvillea_Stem", (0.31, 0.22, 0.16), roughness=0.88)
    m_leaf = make_pbr_material("Bougainvillea_Leaf", (0.26, 0.44, 0.21), roughness=0.76, double_sided=True)
    m_bloom_a = make_pbr_material("Bougainvillea_Magenta", (0.91, 0.16, 0.49), roughness=0.58, double_sided=True)
    m_bloom_b = make_pbr_material("Bougainvillea_Rose", (0.98, 0.44, 0.66), roughness=0.58, double_sided=True)

    root = _new_empty("SwingGardenRoot")

    half_span = 1.54
    top_y = 2.42
    foot_z = 0.94

    # Tubular A-frame structure
    def build_frame(bm):
        for sx in (-1.0, 1.0):
            x_top = sx * (half_span - 0.08)
            x_ft = sx * (half_span + 0.14)
            add_tube_along_curve(bm, [yup(x_ft, 0.02, foot_z), yup(x_top, top_y, 0.0)], [0.042, 0.042], 12)
            add_tube_along_curve(bm, [yup(x_ft, 0.02, -foot_z), yup(x_top, top_y, 0.0)], [0.042, 0.042], 12)
            # Mid brace
            bx0, by0, bz0 = x_ft + (x_top - x_ft) * 0.32, 0.02 + (top_y - 0.02) * 0.32, foot_z * 0.68
            add_tube_along_curve(bm, [yup(bx0, by0, bz0), yup(bx0, by0, -bz0)], [0.032, 0.032], 10)
            # Top gussets
            gx0, gy0, gz0 = x_ft + (x_top - x_ft) * 0.82, 0.02 + (top_y - 0.02) * 0.82, foot_z * 0.18
            tx_in = sx * (half_span - 0.48)
            add_tube_along_curve(bm, [yup(gx0, gy0, gz0), yup(tx_in, top_y, 0.0)], [0.028, 0.028], 10)
            add_tube_along_curve(bm, [yup(gx0, gy0, -gz0), yup(tx_in, top_y, 0.0)], [0.028, 0.028], 10)
            # Footpads & apex cap
            for fz in (-foot_z, foot_z):
                add_cylinder_part(bm, yup(x_ft, 0.02, fz), 0.085, 0.075, 0.045, segs=14)
            add_uv_sphere_part(bm, yup(x_top, top_y, 0.0), (0.056, 0.056, 0.056), 12, 8)
            add_uv_sphere_part(bm, yup(sx * (half_span + 0.18), top_y, 0.0), (0.062, 0.062, 0.062), 12, 8)
        # Overhead top beam
        add_tube_along_curve(bm, [yup(-half_span - 0.16, top_y, 0.0), yup(half_span + 0.16, top_y, 0.0)], [0.048, 0.048], 14)

    _build_bmesh_part("Swing_Frame", build_frame, m_steel, uv_scale=1.0, parent=root)

    # Named Animated Pivot (`Swing_Pivot`) at (0, 2.38, 0)
    pivot = _new_empty("Swing_Pivot", root)
    pivot.location = yup(0.0, top_y - 0.04, 0.0)
    seat_y = -1.78
    bench_w = 1.56
    chain_x = bench_w * 0.5 + 0.06

    def build_chains(bm):
        for sx in (-1.0, 1.0):
            px = sx * chain_x
            add_tube_along_curve(bm, [yup(px, 0.0, 0.0), yup(px, -1.08, 0.0)], [0.016, 0.016], 8)
            add_tube_along_curve(bm, [yup(px, -1.08, 0.0), yup(px, seat_y + 0.24, 0.25)], [0.014, 0.014], 8)
            add_tube_along_curve(bm, [yup(px, -1.08, 0.0), yup(px, seat_y + 0.44, -0.24)], [0.014, 0.014], 8)
            add_uv_sphere_part(bm, yup(px, -1.08, 0.0), (0.036, 0.036, 0.036), 10, 8)

    _build_bmesh_part("Swing_Chains", build_chains, m_chain, uv_scale=1.0, parent=pivot)

    def build_bench(bm):
        add_beveled_box(bm, yup(0.0, seat_y, 0.0), (bench_w + 0.16, 0.58, 0.055), bevel=0.015)
        for i in range(6):
            sz = -0.22 + (i / 5.0) * 0.44
            add_beveled_box(bm, yup(0.0, seat_y + 0.036, sz), (bench_w, 0.068, 0.028), bevel=0.006)
        # Curved armrests
        for sx in (-1.0, 1.0):
            ax = sx * (bench_w * 0.5 + 0.05)
            add_beveled_box(bm, yup(ax, seat_y + 0.24, 0.0), (0.055, 0.56, 0.045), bevel=0.012)
            add_cylinder_part(bm, yup(ax, seat_y + 0.12, 0.22), 0.022, 0.022, 0.22, segs=10)
            add_cylinder_part(bm, yup(ax, seat_y + 0.22, -0.24), 0.022, 0.022, 0.44, segs=10)
        # Backrest slats & top curved rail
        for bi in range(-4, 5):
            add_beveled_box(bm, yup(bi * 0.175, seat_y + 0.31, -0.28), (0.095, 0.028, 0.54), rot_euler=(-0.12, 0.0, 0.0), bevel=0.006)
        add_beveled_box(bm, yup(0.0, seat_y + 0.58, -0.32), (bench_w + 0.10, 0.055, 0.065), bevel=0.014)

    _build_bmesh_part("Swing_Bench", build_bench, m_slat, uv_scale=1.0, parent=pivot)

    def build_seat_cush(bm):
        add_uv_sphere_part(bm, yup(0.0, seat_y + 0.075, 0.03), (bench_w * 0.48, 0.26, 0.068), 24, 14)

    _build_bmesh_part("Swing_SeatCushion", build_seat_cush, m_cush, uv_scale=1.0, parent=pivot)

    def build_back_cush(bm):
        for sx in (-0.38, 0.38):
            add_uv_sphere_part(bm, yup(sx, seat_y + 0.28, -0.19), (0.34, 0.085, 0.21), 20, 12, rot_euler=(0.14, 0.0, 0.0))

    _build_bmesh_part("Swing_BackCushions", build_back_cush, m_back, uv_scale=1.0, parent=pivot)

    def build_lilac_pil(bm):
        add_uv_sphere_part(bm, yup(-0.56, seat_y + 0.23, -0.02), (0.14, 0.12, 0.16), 16, 10, rot_euler=(0.18, 0.25, 0.15))

    _build_bmesh_part("Swing_PillowLilac", build_lilac_pil, m_pil_l, uv_scale=1.0, parent=pivot)

    def build_coral_pil(bm):
        add_uv_sphere_part(bm, yup(0.56, seat_y + 0.23, -0.02), (0.14, 0.12, 0.16), 16, 10, rot_euler=(0.18, -0.25, -0.15))

    _build_bmesh_part("Swing_PillowCoral", build_coral_pil, m_pil_c, uv_scale=1.0, parent=pivot)

    # 3 Ornate Bougainvillea Rose Arches framing swing promenade (Z offsets: +2.55, -0.15, -2.65 relative to swing)
    arch_offsets = [2.55, -0.15, -2.65]
    arch_span = 1.98
    arch_post_h = 2.45
    arch_rise = 0.72

    def build_arches(bm):
        for az in arch_offsets:
            for sx in (-1.0, 1.0):
                px = sx * arch_span
                for oz in (-0.28, 0.28):
                    add_tube_along_curve(bm, [yup(px, 0.0, az + oz), yup(px, arch_post_h, az + oz)], [0.028, 0.028], 8)
                for h_lat in (0.65, 1.35, 2.05):
                    add_tube_along_curve(bm, [yup(px, h_lat, az - 0.28), yup(px, h_lat, az + 0.28)], [0.018, 0.018], 6)
            for oz in (-0.28, 0.28):
                pts = []
                for k in range(15):
                    u = k / 14
                    ang = u * math.pi
                    pts.append(yup(math.cos(ang) * -arch_span, arch_post_h + math.sin(ang) * arch_rise, az + oz))
                add_tube_along_curve(bm, pts, [0.028] * len(pts), 8)
            for k in range(1, 9):
                ang = (k / 9) * math.pi
                rx, ry = math.cos(ang) * -arch_span, arch_post_h + math.sin(ang) * arch_rise
                add_tube_along_curve(bm, [yup(rx, ry, az - 0.28), yup(rx, ry, az + 0.28)], [0.016, 0.016], 6)

    _build_bmesh_part("Bougainvillea_Arches", build_arches, m_iron, uv_scale=1.0, parent=root)

    def _arch_point(t: float):
        if t < 0.28:
            u = t / 0.28
            return -arch_span, 0.25 + u * (arch_post_h - 0.25)
        if t > 0.72:
            u = (1.0 - t) / 0.28
            return arch_span, 0.25 + u * (arch_post_h - 0.25)
        ang = ((t - 0.28) / 0.44) * math.pi
        return math.cos(ang) * -arch_span, arch_post_h + math.sin(ang) * arch_rise

    def build_vines(bm):
        for ai, az in enumerate(arch_offsets):
            for strand in (-1.0, 1.0):
                pts, rads = [], []
                for k in range(32):
                    t = k / 31
                    ax, ay = _arch_point(t)
                    spiral = t * 15.0 + ai * 1.4 + (0.0 if strand < 0 else math.pi)
                    pts.append(yup(ax + math.cos(spiral) * 0.055, ay + math.sin(spiral * 0.5) * 0.04, az + math.sin(spiral) * 0.24))
                    rads.append(0.022 - 0.011 * t)
                add_tube_along_curve(bm, pts, rads, 6)

    _build_bmesh_part("Bougainvillea_Vines", build_vines, m_vine, uv_scale=1.0, parent=root)

    def build_arch_foliage(bm):
        for ai, az in enumerate(arch_offsets):
            for k in range(38):
                t = 0.22 + (k / 37) * 0.56
                px, py = _arch_point(t)
                ox = math.cos(k * 2.1 + ai) * 0.085 + (-0.04 if px > 0 else 0.04)
                oy = math.sin(k * 1.7 + ai) * 0.075
                oz = math.sin(k * 2.4 + ai * 1.3) * 0.11
                origin = yup(px + ox, py + oy, az + oz)
                bias = yup(-0.35 if px < 0 else 0.35, 0.2, math.cos(k + ai) * 0.4)
                _add_leaf_sprig(bm, origin, bias, scale=0.095, seed=500 + ai * 60 + k)

    _build_bmesh_part("Bougainvillea_Foliage", build_arch_foliage, m_leaf, uv_scale=1.0, parent=root)

    def build_blooms(sub_mod: int, name: str, mat):
        def _fn(bm):
            for ai, az in enumerate(arch_offsets):
                for k in range(52):
                    if k % 2 != sub_mod:
                        continue
                    t = 0.23 + (k / 51) * 0.54
                    px, py = _arch_point(t)
                    ox = math.cos(k * 2.7 + ai * 1.7) * 0.095
                    oy = math.sin(k * 2.3 + ai) * 0.08 + 0.035
                    oz = math.sin(k * 2.1 + ai * 1.1) * 0.12
                    _add_blossom_cluster(bm, yup(px + ox, py + oy, az + oz), scale=0.044 + (k % 3) * 0.008, seed=700 + ai * 80 + k)
        _build_bmesh_part(name, _fn, mat, uv_scale=1.0, parent=root)

    build_blooms(0, "Bougainvillea_BloomsA", m_bloom_a)
    build_blooms(1, "Bougainvillea_BloomsB", m_bloom_b)

    export_glb(out_path, with_anims=False)


# ---------------------------------------------------------------------------
# 3. Breton-Style Coastal Lighthouse (@ (78, 1.38, 10))
# ---------------------------------------------------------------------------

def build_lighthouse_glb(out_path: Path) -> None:
    reset_scene()
    tex = _make_shared_textures()
    m_stone = make_pbr_material("LH_Stone", (0.76, 0.73, 0.68), roughness=0.82, image=tex["stone"])
    m_white = make_pbr_material("LH_White", (0.95, 0.93, 0.89), roughness=0.78, image=tex["plaster"])
    m_crimson = make_pbr_material("LH_Crimson", (0.68, 0.22, 0.18), roughness=0.76)
    m_iron = make_pbr_material("LH_Iron", (0.14, 0.16, 0.18), roughness=0.38, metallic=0.84)
    m_brass = make_pbr_material("LH_Brass", (0.85, 0.69, 0.36), roughness=0.20, metallic=0.90)
    m_oak = make_pbr_material("LH_Oak", (0.36, 0.23, 0.13), roughness=0.54, image=tex["wood"])
    m_glass = make_pbr_material("LH_Glass", (0.86, 0.96, 0.99), roughness=0.08, alpha=0.32)
    m_fresnel = make_pbr_material("LH_Fresnel", (1.0, 0.93, 0.68), roughness=0.14, emission=(1.0, 0.86, 0.45), emission_strength=0.95)

    root = _new_empty("LighthouseRoot")

    def build_stone(bm):
        add_cylinder_part(bm, yup(0, 1.55, 0), 2.48, 2.18, 3.10, segs=8)
        add_cylinder_part(bm, yup(0, 3.18, 0), 2.22, 2.34, 0.26, segs=8)
        add_beveled_box(bm, yup(-2.22, 1.08, 0.0), (0.48, 1.18, 2.15), bevel=0.025)
        add_cylinder_part(bm, yup(0, 10.55, 0), 1.56, 2.08, 0.36, segs=24)
        add_cylinder_part(bm, yup(0, 10.80, 0), 2.12, 2.16, 0.16, segs=24)

    _build_bmesh_part("LH_Stonework", build_stone, m_stone, uv_scale=0.4, parent=root)

    def build_oak(bm):
        add_beveled_box(bm, yup(-2.36, 1.00, 0.0), (0.18, 0.88, 1.92), bevel=0.02)

    _build_bmesh_part("LH_Door", build_oak, m_oak, uv_scale=1.0, parent=root)

    def build_white(bm):
        add_cylinder_part(bm, yup(0, 4.55, 0), 2.12, 1.94, 2.50, segs=28)
        add_cylinder_part(bm, yup(0, 9.30, 0), 1.74, 1.56, 2.20, segs=28)

    _build_bmesh_part("LH_WhiteBands", build_white, m_white, uv_scale=0.5, parent=root)

    def build_crimson(bm):
        add_cylinder_part(bm, yup(0, 7.00, 0), 1.94, 1.74, 2.40, segs=28)

    _build_bmesh_part("LH_CrimsonBand", build_crimson, m_crimson, uv_scale=0.5, parent=root)

    def build_iron(bm):
        # Balcony handrail & vertical stanchions
        for p in range(18):
            a = (p / 18) * math.tau
            add_cylinder_part(bm, yup(math.cos(a) * 2.06, 11.28, math.sin(a) * 2.06), 0.024, 0.024, 0.90, segs=8)
        ring_pts = [yup(math.cos((i / 36) * math.tau) * 2.06, 11.72, math.sin((i / 36) * math.tau) * 2.06) for i in range(37)]
        add_tube_along_curve(bm, ring_pts, [0.032] * len(ring_pts), radial_segs=8)
        # Window frames on shaft
        for wy in (4.6, 7.1, 9.2):
            add_beveled_box(bm, yup(-1.82 + (wy - 4.6) * 0.07, wy, 0.0), (0.20, 0.36, 0.66), bevel=0.015)
        # Lantern room base ring, mullions, & copper dome + weathervane
        add_cylinder_part(bm, yup(0, 11.08, 0), 1.48, 1.48, 0.44, segs=16)
        for p in range(8):
            a = (p / 8) * math.tau
            add_cylinder_part(bm, yup(math.cos(a) * 1.42, 11.95, math.sin(a) * 1.42), 0.04, 0.04, 1.45, segs=8)
        add_cylinder_part(bm, yup(0, 12.92, 0), 1.54, 0.08, 0.88, segs=16)
        add_cylinder_part(bm, yup(0, 13.52, 0), 0.035, 0.018, 0.62, segs=8)
        add_uv_sphere_part(bm, yup(0, 13.84, 0), (0.09, 0.09, 0.09), 10, 8)

    _build_bmesh_part("LH_IronLantern", build_iron, m_iron, uv_scale=1.0, parent=root)

    def build_glass(bm):
        add_cylinder_part(bm, yup(0, 11.95, 0), 1.38, 1.38, 1.38, segs=16, cap_ends=False)

    _build_bmesh_part("LH_LanternGlass", build_glass, m_glass, uv_scale=1.0, parent=root)

    # Named rotating Fresnel optic node inside lantern room
    rotor = _new_empty("Lighthouse_Rotor", root)
    rotor.location = yup(0.0, 11.95, 0.0)

    def build_optic(bm):
        add_cylinder_part(bm, yup(0, 0, 0), 0.42, 0.42, 0.72, segs=16)
        add_uv_sphere_part(bm, yup(0, 0, 0.38), (0.34, 0.22, 0.26), 14, 10)
        add_uv_sphere_part(bm, yup(0, 0, -0.38), (0.34, 0.22, 0.26), 14, 10)

    _build_bmesh_part("LH_FresnelOptic", build_optic, m_fresnel, uv_scale=1.0, parent=rotor)

    def build_brass_rings(bm):
        add_cylinder_part(bm, yup(0, 0.42, 0), 0.46, 0.46, 0.08, segs=16)
        add_cylinder_part(bm, yup(0, -0.42, 0), 0.46, 0.46, 0.08, segs=16)

    _build_bmesh_part("LH_FresnelBrass", build_brass_rings, m_brass, uv_scale=1.0, parent=rotor)

    export_glb(out_path, with_anims=False)


# ---------------------------------------------------------------------------
# 4. Provençal Stone & Timber Windmill (@ (-52, 14.2, -68), yaw=0.52)
# ---------------------------------------------------------------------------

def build_windmill_glb(out_path: Path) -> None:
    reset_scene()
    tex = _make_shared_textures()
    m_stone = make_pbr_material("WM_Stone", (0.82, 0.79, 0.72), roughness=0.84, image=tex["stone"])
    m_shingle = make_pbr_material("WM_Shingle", (0.38, 0.29, 0.22), roughness=0.76, image=tex["shingle"])
    m_cedar = make_pbr_material("WM_Cedar", (0.58, 0.38, 0.24), roughness=0.54, image=tex["wood"])
    m_sail = make_pbr_material("WM_SailCanvas", (0.96, 0.94, 0.89), roughness=0.86, double_sided=True)
    m_iron = make_pbr_material("WM_Iron", (0.16, 0.18, 0.20), roughness=0.40, metallic=0.82)

    root = _new_empty("WindmillRoot")

    def build_tower(bm):
        add_cylinder_part(bm, yup(0, -0.38, 0), 3.72, 3.30, 0.92, segs=24)
        add_cylinder_part(bm, yup(0, 5.25, 0), 3.28, 2.26, 10.50, segs=28)

    _build_bmesh_part("WM_StoneTower", build_tower, m_stone, uv_scale=0.32, parent=root)

    def build_timber(bm):
        add_beveled_box(bm, yup(3.16, 1.12, 0.0), (0.44, 1.32, 2.25), bevel=0.03)
        # Timber reefing gallery at Y=4.65
        add_cylinder_part(bm, yup(0, 4.65, 0), 3.85, 3.85, 0.14, segs=12)
        ring_pts = [yup(math.cos((i / 24) * math.tau) * 3.75, 5.58, math.sin((i / 24) * math.tau) * 3.75) for i in range(25)]
        add_tube_along_curve(bm, ring_pts, [0.048] * len(ring_pts), radial_segs=8)
        for b in range(12):
            a = (b / 12) * math.tau
            add_beveled_box(bm, yup(math.cos(a) * 3.74, 5.12, math.sin(a) * 3.74), (0.09, 0.09, 0.94), bevel=0.01)
            p_in = yup(math.cos(a) * 2.76, 3.45, math.sin(a) * 2.76)
            p_out = yup(math.cos(a) * 3.72, 4.60, math.sin(a) * 3.72)
            add_tube_along_curve(bm, [p_in, p_out], [0.055, 0.055], radial_segs=6)
        # Windshaft neck
        add_cylinder_part(bm, yup(1.50, 11.20, 0.0), 0.24, 0.20, 3.40, segs=12, rot_euler=(0.0, math.pi * 0.5 - 0.11, 0.0))

    _build_bmesh_part("WM_TimberGallery", build_timber, m_cedar, uv_scale=0.8, parent=root)

    def build_cap(bm):
        add_cylinder_part(bm, yup(0, 11.88, 0), 2.48, 0.10, 2.85, segs=24)

    _build_bmesh_part("WM_ShingleCap", build_cap, m_shingle, uv_scale=0.45, parent=root)

    def build_finial(bm):
        add_uv_sphere_part(bm, yup(0, 13.38, 0), (0.22, 0.22, 0.22), 12, 8)

    _build_bmesh_part("WM_CapFinial", build_finial, m_iron, uv_scale=1.0, parent=root)

    # Named rotating sails rotor (`Windmill_Rotor`)
    rotor = _new_empty("Windmill_Rotor", root)
    rotor.location = yup(2.96, 11.38, 0.0)
    rotor.rotation_euler = (0.0, 0.11, 0.0)

    def build_stocks(bm):
        add_cylinder_part(bm, yup(0, 0, 0), 0.28, 0.28, 0.45, segs=12, rot_euler=(0.0, math.pi * 0.5, 0.0))
        for s in range(4):
            a = (s / 4) * math.tau
            dy, dz = math.cos(a), math.sin(a)
            # Blade spar
            add_tube_along_curve(bm, [yup(0.0, 0.0, 0.0), yup(0.0, dy * 6.4, dz * 6.4)], [0.085, 0.055], 8)
            # Lattice rungs along blade
            for r in range(2, 13):
                rad = r * 0.50
                p0 = yup(0.05, dy * rad, dz * rad)
                p1 = yup(0.18, dy * rad - dz * 1.15, dz * rad + dy * 1.15)
                add_tube_along_curve(bm, [p0, p1], [0.022, 0.020], 5)
            # Outer rail
            q0 = yup(0.18, dy * 1.0 - dz * 1.15, dz * 1.0 + dy * 1.15)
            q1 = yup(0.18, dy * 6.2 - dz * 1.15, dz * 6.2 + dy * 1.15)
            add_tube_along_curve(bm, [q0, q1], [0.026, 0.022], 6)

    _build_bmesh_part("WM_SailFrames", build_stocks, m_cedar, uv_scale=0.8, parent=rotor)

    def build_sails(bm):
        for s in range(4):
            a = (s / 4) * math.tau
            dy, dz = math.cos(a), math.sin(a)
            # Slight wind belly curve across blade length
            verts = []
            for iu in range(9):
                rad = 1.05 + (iu / 8) * 5.05
                c0 = yup(0.07, dy * rad - dz * 0.08, dz * rad + dy * 0.08)
                c1 = yup(0.12 + 0.06 * math.sin((iu / 8) * math.pi), dy * rad - dz * 0.60, dz * rad + dy * 0.60)
                c2 = yup(0.18, dy * rad - dz * 1.12, dz * rad + dy * 1.12)
                verts.append((bm.verts.new(c0), bm.verts.new(c1), bm.verts.new(c2)))
            for iu in range(8):
                bm.faces.new((verts[iu][0], verts[iu][1], verts[iu + 1][1], verts[iu + 1][0]))
                bm.faces.new((verts[iu][1], verts[iu][2], verts[iu + 1][2], verts[iu + 1][1]))

    _build_bmesh_part("WM_SailCloth", build_sails, m_sail, uv_scale=0.5, parent=rotor)

    export_glb(out_path, with_anims=False)


# ---------------------------------------------------------------------------
# 5. Cedar & Stone Arched Creek Bridge (@ (8.4, 0, -44.0) world datum)
# ---------------------------------------------------------------------------

def build_creek_bridge_glb(out_path: Path) -> None:
    reset_scene()
    tex = _make_shared_textures()
    m_stone = make_pbr_material("Bridge_Stone", (0.78, 0.75, 0.69), roughness=0.82, image=tex["stone"])
    m_cedar = make_pbr_material("Bridge_Cedar", (0.60, 0.40, 0.25), roughness=0.50, image=tex["wood"])
    m_brass = make_pbr_material("Bridge_Brass", (0.80, 0.64, 0.34), roughness=0.28, metallic=0.86)

    root = _new_empty("CreekBridgeRoot")
    # Local Y=0 corresponds to average bank baseline; arch crown rises +1.82m cleanly matching creek_bridge walkZone!
    span = 10.5

    def get_arch_y(lx: float) -> float:
        t = clamp01((lx + span * 0.5) / span)
        return 1.82 * math.sin(t * math.pi)

    def build_abutments(bm):
        for ax in (-5.35, 5.35):
            add_beveled_box(bm, yup(ax, -1.10, 0.0), (1.20, 4.15, 2.50), bevel=0.04)
            add_beveled_box(bm, yup(ax, 0.16, 0.0), (1.34, 4.28, 0.16), bevel=0.025)

    _build_bmesh_part("Bridge_Abutments", build_abutments, m_stone, uv_scale=0.45, parent=root)

    def build_timber(bm):
        for rz in (-1.72, 1.72):
            beam_pts, rail_pts, mid_pts = [], [], []
            for i in range(19):
                lx = -5.25 + (i / 18) * span
                ly = get_arch_y(lx)
                beam_pts.append(yup(lx, ly - 0.16, rz))
                rail_pts.append(yup(lx, ly + 1.02, rz))
                mid_pts.append(yup(lx, ly + 0.50, rz))
            add_tube_along_curve(bm, beam_pts, [0.12] * len(beam_pts), 8)
            add_tube_along_curve(bm, rail_pts, [0.058] * len(rail_pts), 8)
            add_tube_along_curve(bm, mid_pts, [0.032] * len(mid_pts), 6)
            for p in range(7):
                px = -5.1 + (p / 6) * 10.2
                py = get_arch_y(px)
                add_beveled_box(bm, yup(px, py + 0.48, rz), (0.12, 0.12, 1.12), bevel=0.012)
        num_planks = 28
        for i in range(num_planks):
            x0 = -5.25 + (i / num_planks) * span
            x1 = -5.25 + ((i + 1) / num_planks) * span
            xm = 0.5 * (x0 + x1)
            ym = get_arch_y(xm)
            slope = math.atan2(get_arch_y(x1) - get_arch_y(x0), x1 - x0)
            add_beveled_box(bm, yup(xm, ym - 0.035, 0.0), (0.35, 3.58, 0.075), rot_euler=(0.0, -slope, 0.0), bevel=0.008)

    _build_bmesh_part("Bridge_CedarDeck", build_timber, m_cedar, uv_scale=0.75, parent=root)

    def build_caps(bm):
        for rz in (-1.72, 1.72):
            for p in range(7):
                px = -5.1 + (p / 6) * 10.2
                py = get_arch_y(px)
                add_beveled_box(bm, yup(px, py + 1.06, rz), (0.15, 0.15, 0.045), bevel=0.008)

    _build_bmesh_part("Bridge_BrassCaps", build_caps, m_brass, uv_scale=1.0, parent=root)

    export_glb(out_path, with_anims=False)


# ---------------------------------------------------------------------------
# 6. Classical White Carrara Marble & Rose Belvedere Gazebo (@ (-64, 7.80, 42))
# ---------------------------------------------------------------------------

def build_gazebo_glb(out_path: Path) -> None:
    reset_scene()
    tex = _make_shared_textures()
    m_marble = make_pbr_material("Gaz_Carrara", (0.95, 0.94, 0.90), roughness=0.48, image=tex["plaster"])
    m_trav = make_pbr_material("Gaz_Travertine", (0.91, 0.88, 0.82), roughness=0.58, image=tex["stone"])
    m_iron = make_pbr_material("Gaz_Iron", (0.16, 0.18, 0.20), roughness=0.36, metallic=0.84)
    m_brass = make_pbr_material("Gaz_Brass", (0.80, 0.64, 0.34), roughness=0.22, metallic=0.88)
    m_cedar = make_pbr_material("Gaz_Cedar", (0.61, 0.40, 0.25), roughness=0.46, image=tex["wood"])
    m_linen = make_pbr_material("Gaz_Linen", (0.96, 0.94, 0.89), roughness=0.82)
    m_blush = make_pbr_material("Gaz_Blush", (0.93, 0.77, 0.80), roughness=0.78)
    m_globe = make_pbr_material("Gaz_LanternGlow", (1.0, 0.94, 0.80), roughness=0.20, emission=(1.0, 0.78, 0.44), emission_strength=0.45)

    root = _new_empty("CliffsideGazeboRoot")

    def build_marble(bm):
        add_cylinder_part(bm, yup(0, -0.78, 0), 6.05, 5.68, 1.85, segs=36)
        add_cylinder_part(bm, yup(0, 0.07, 0), 5.66, 5.60, 0.14, segs=36)
        add_cylinder_part(bm, yup(0, 0.21, 0), 5.32, 5.26, 0.14, segs=36)
        entry_ang = math.atan2(-11.0, 7.0)
        bal_r = 5.02
        for i in range(28):
            a = (i / 28) * math.tau - math.pi
            diff = math.atan2(math.sin(a - entry_ang), math.cos(a - entry_ang))
            if abs(diff) < 0.48:
                continue
            bx, bz = math.cos(a) * bal_r, math.sin(a) * bal_r
            add_lathe_part(
                bm,
                [(0.10, -0.38), (0.09, -0.26), (0.055, -0.10), (0.085, 0.06), (0.06, 0.24), (0.09, 0.36)],
                segs=10,
                offset=yup(bx, 0.66, bz),
            )
            add_beveled_box(bm, yup(bx, 1.07, bz), (0.24, 1.18, 0.095), rot_euler=(0.0, 0.0, -a), bevel=0.015)

    _build_bmesh_part("Gaz_TerraceBalustrade", build_marble, m_marble, uv_scale=0.45, parent=root)

    # Interactive Crown + 8 Classical Columns + Dome Ribs
    crown = _new_empty("Gazebo_Crown", root)
    col_r = 3.92

    def build_cols(bm):
        for c in range(8):
            a = (c / 8) * math.tau + math.pi / 8
            cx, cz = math.cos(a) * col_r, math.sin(a) * col_r
            add_beveled_box(bm, yup(cx, 0.40, cz), (0.54, 0.54, 0.24), bevel=0.02)
            add_cylinder_part(bm, yup(cx, 2.04, cz), 0.21, 0.17, 3.05, segs=16)
            add_cylinder_part(bm, yup(cx, 3.68, cz), 0.18, 0.30, 0.25, segs=16)
        # Entablature ring
        ring_pts = [yup(math.cos((i / 36) * math.tau) * col_r, 3.90, math.sin((i / 36) * math.tau) * col_r) for i in range(37)]
        add_tube_along_curve(bm, ring_pts, [0.19] * len(ring_pts), radial_segs=10)

    _build_bmesh_part("Gaz_ColumnsEntablature", build_cols, m_trav, uv_scale=0.6, parent=crown)

    def build_iron_dome(bm):
        for c in range(8):
            a = (c / 8) * math.tau + math.pi / 8
            cx, cz = math.cos(a) * col_r, math.sin(a) * col_r
            pts = []
            for s in range(13):
                t = s / 12
                r_fac = 1.0 - t * 0.86
                py = 3.98 + math.sin(t * math.pi * 0.5) * 2.00
                pts.append(yup(cx * r_fac, py, cz * r_fac))
            add_tube_along_curve(bm, pts, [0.034] * len(pts), 8)
        cupola_pts = [yup(math.cos((i / 24) * math.tau) * 0.58, 5.98, math.sin((i / 24) * math.tau) * 0.58) for i in range(25)]
        add_tube_along_curve(bm, cupola_pts, [0.045] * len(cupola_pts), 8)
        add_beveled_box(bm, yup(0.0, 3.88, 0.0), (0.12, col_r * 1.92, 0.12), rot_euler=(0.0, 0.0, 0.65), bevel=0.012)

    _build_bmesh_part("Gaz_WroughtDome", build_iron_dome, m_iron, uv_scale=1.0, parent=crown)

    def build_brass_parts(bm):
        add_cylinder_part(bm, yup(0, 6.32, 0), 0.18, 0.02, 0.55, segs=12)
        add_cylinder_part(bm, yup(0, 5.38, 0), 0.016, 0.016, 1.15, segs=8)

    _build_bmesh_part("Gaz_BrassFinial", build_brass_parts, m_brass, uv_scale=1.0, parent=crown)

    def build_globe(bm):
        add_uv_sphere_part(bm, yup(0, 4.68, 0), (0.24, 0.24, 0.24), 16, 12)

    _build_bmesh_part("Gazebo_LanternGlobe", build_globe, m_globe, uv_scale=1.0, parent=crown)

    # Named Animated Swing Pivot (`Gazebo_SwingPivot`)
    gaz_swing = _new_empty("Gazebo_SwingPivot", crown)
    gaz_swing.location = yup(0.0, 3.86, 0.0)
    gaz_swing.rotation_euler = (0.0, 0.0, 0.65)
    gsy = -2.92

    def build_gs_chains(bm):
        for sz in (-0.88, 0.88):
            add_cylinder_part(bm, yup(0, gsy * 0.5, sz), 0.013, 0.013, 2.92, segs=8)

    _build_bmesh_part("GazSwing_Chains", build_gs_chains, m_brass, uv_scale=1.0, parent=gaz_swing)

    def build_gs_wood(bm):
        add_beveled_box(bm, yup(0, gsy, 0), (0.66, 1.88, 0.065), bevel=0.016)
        for s in range(-5, 6):
            add_beveled_box(bm, yup(-0.29, gsy + 0.30, s * 0.155), (0.032, 0.12, 0.54), rot_euler=(0.0, 0.14, 0.0), bevel=0.005)
        add_beveled_box(bm, yup(-0.33, gsy + 0.57, 0), (0.058, 1.88, 0.058), bevel=0.012)
        for sz in (-0.62, 0.62):
            add_beveled_box(bm, yup(0, gsy + 0.28, sz * 1.44), (0.62, 0.075, 0.048), bevel=0.012)
            add_cylinder_part(bm, yup(0.24, gsy + 0.14, sz * 1.44), 0.022, 0.022, 0.26, segs=8)

    _build_bmesh_part("GazSwing_CedarSeat", build_gs_wood, m_cedar, uv_scale=0.8, parent=gaz_swing)

    def build_gs_cush(bm):
        add_uv_sphere_part(bm, yup(0.02, gsy + 0.08, 0), (0.29, 0.86, 0.065), 18, 12)

    _build_bmesh_part("GazSwing_LinenCushion", build_gs_cush, m_linen, uv_scale=1.0, parent=gaz_swing)

    def build_gs_pil(bm):
        for sz in (-0.62, 0.62):
            add_uv_sphere_part(bm, yup(-0.14, gsy + 0.28, sz), (0.14, 0.20, 0.18), 14, 10)

    _build_bmesh_part("GazSwing_Pillows", build_gs_pil, m_blush, uv_scale=1.0, parent=gaz_swing)

    export_glb(out_path, with_anims=False)


# ---------------------------------------------------------------------------
# 7. Provençal Hillside Stone & Terracotta Cottage (`provencal_cottage.glb`)
# ---------------------------------------------------------------------------

def build_cottage_glb(out_path: Path) -> None:
    reset_scene()
    tex = _make_shared_textures()
    m_stone = make_pbr_material("Cot_Stone", (0.79, 0.76, 0.70), roughness=0.84, image=tex["stone"])
    m_plaster = make_pbr_material("Cot_Plaster", (0.95, 0.90, 0.82), roughness=0.82, image=tex["plaster"])
    m_roof = make_pbr_material("Cot_Terracotta", (0.78, 0.41, 0.28), roughness=0.72, image=tex["terracotta"])
    m_shutter = make_pbr_material("Cot_SageShutter", (0.42, 0.52, 0.44), roughness=0.60)
    m_wood = make_pbr_material("Cot_Oak", (0.46, 0.29, 0.17), roughness=0.58, image=tex["wood"])
    m_win = make_pbr_material("Cot_WarmWindow", (0.98, 0.90, 0.72), roughness=0.24, emission=(1.0, 0.72, 0.36), emission_strength=0.18)
    m_soil = make_pbr_material("Cot_Soil", (0.30, 0.22, 0.15), roughness=0.95)
    m_green = make_pbr_material("Cot_GardenGreen", (0.32, 0.48, 0.28), roughness=0.82)

    root = _new_empty("ProvencalCottageRoot")
    cw, cd = 8.2, 5.8
    pw, pd = cw + 0.96, cd + 1.05

    def build_stone_base(bm):
        add_beveled_box(bm, yup(0, -1.16, 0), (pw, pd, 2.38), bevel=0.04)
        add_beveled_box(bm, yup(0, 0.04, 0), (pw + 0.14, pd + 0.14, 0.14), bevel=0.025)
        add_beveled_box(bm, yup(0, 0.08, pd * 0.5 + 0.52), (2.6, 1.35, 0.16), bevel=0.025)
        for sx in (-1.45, 1.45):
            add_beveled_box(bm, yup(sx, 0.22, pd * 0.5 + 0.45), (0.28, 1.25, 0.44), bevel=0.02)
        for step_i in range(5):
            add_beveled_box(bm, yup(0, -0.02 - step_i * 0.18, pd * 0.5 + 1.15 + step_i * 0.38), (1.85, 0.44, 0.18), bevel=0.015)
        # Chimney & kitchen garden raised stone walls
        add_beveled_box(bm, yup(-2.4, 4.95, -1.4), (0.78, 0.78, 2.60), bevel=0.03)
        add_beveled_box(bm, yup(-2.4, 6.28, -1.4), (0.94, 0.94, 0.16), bevel=0.02)
        add_beveled_box(bm, yup(cw * 0.62, -1.16, -cd * 0.12), (2.25, 2.75, 2.38), bevel=0.03)
        add_beveled_box(bm, yup(cw * 0.62, 0.26, -cd * 0.12), (2.15, 2.60, 0.44), bevel=0.025)
        # Corner ashlar quoins
        for sx in (-1, 1):
            for sz in (-1, 1):
                for q in range(6):
                    w_q = 0.52 if q % 2 == 0 else 0.36
                    add_beveled_box(bm, yup(sx * (cw * 0.5 - 0.14), 0.36 + q * 0.56, sz * (cd * 0.5 - 0.14)), (w_q, 0.40, 0.42), bevel=0.015)

    _build_bmesh_part("Cot_StoneMasonry", build_stone_base, m_stone, uv_scale=0.35, parent=root)

    def build_walls(bm):
        add_beveled_box(bm, yup(0, 1.85, 0), (cw, cd, 3.55), bevel=0.03)

    _build_bmesh_part("Cot_PlasterWalls", build_walls, m_plaster, uv_scale=0.4, parent=root)

    def build_roof(bm):
        # Pitched terracotta gable roof + eaves overhang
        h_eave = 3.55
        h_peak = 5.42
        oh = 0.55
        for side in (-1.0, 1.0):
            slope_len = math.hypot(cd * 0.5 + oh, h_peak - h_eave)
            pitch = math.atan2(h_peak - h_eave, cd * 0.5 + oh)
            add_beveled_box(
                bm,
                yup(0, 0.5 * (h_eave + h_peak), side * (cd * 0.25 + oh * 0.5)),
                (cw + 1.1, slope_len, 0.16),
                rot_euler=(-side * pitch, 0.0, 0.0),
                bevel=0.02,
            )
            # Ridge tile row
        add_cylinder_part(bm, yup(0, h_peak + 0.06, 0), 0.14, 0.14, cw + 1.15, segs=10, rot_euler=(0.0, math.pi * 0.5, 0.0))

    _build_bmesh_part("Cot_TerracottaRoof", build_roof, m_roof, uv_scale=0.45, parent=root)

    def build_windows_and_door(bm):
        # Upper door glass transom + front/rear/gable window panes (solid oak door frame surrounds door bottom)
        add_beveled_box(bm, yup(0, 1.68, cd * 0.5 + 0.02), (0.86, 0.05, 0.74), bevel=0.01)
        for wx in (-2.45, 2.45):
            add_beveled_box(bm, yup(wx, 1.75, cd * 0.5 + 0.015), (0.98, 0.04, 1.24), bevel=0.01)
            add_beveled_box(bm, yup(wx, 1.75, -cd * 0.5 - 0.015), (0.98, 0.04, 1.24), bevel=0.01)
        # Side gable attic windows
        for sx in (-1.0, 1.0):
            add_beveled_box(bm, yup(sx * (cw * 0.5 + 0.015), 3.65, 0.0), (0.04, 0.74, 0.82), bevel=0.01)

    _build_bmesh_part("Cot_WarmWindows", build_windows_and_door, m_win, uv_scale=1.0, parent=root)

    def build_shutters(bm):
        for wx in (-2.45, 2.45):
            for s in (-1.0, 1.0):
                add_beveled_box(bm, yup(wx + s * 0.72, 1.75, cd * 0.5 + 0.05), (0.38, 0.06, 1.28), bevel=0.01)
                add_beveled_box(bm, yup(wx + s * 0.72, 1.75, -cd * 0.5 - 0.05), (0.38, 0.06, 1.28), bevel=0.01)

    _build_bmesh_part("Cot_Shutters", build_shutters, m_shutter, uv_scale=1.0, parent=root)

    def build_pergola(bm):
        # West stone-and-cedar veranda pergola + recessed oak door & multi-pane window frames/mullions
        add_beveled_box(bm, yup(-cw * 0.62, 2.95, 0), (2.4, 3.6, 0.12), bevel=0.015)
        for pz in (-1.55, 1.55):
            add_cylinder_part(bm, yup(-cw * 0.76, 1.52, pz), 0.11, 0.13, 2.95, segs=10)
        for r in range(7):
            add_beveled_box(bm, yup(-cw * 0.62, 3.06, -1.6 + r * 0.53), (2.6, 0.10, 0.14), bevel=0.01)
        # Oak front door leaf + door surround frame
        add_beveled_box(bm, yup(0, 1.18, cd * 0.5 + 0.015), (1.14, 0.08, 2.24), bevel=0.014)
        for sx in (-0.54, 0.54):
            add_beveled_box(bm, yup(sx, 1.18, cd * 0.5 + 0.06), (0.10, 0.08, 2.28), bevel=0.01)
        add_beveled_box(bm, yup(0, 2.28, cd * 0.5 + 0.06), (1.24, 0.10, 0.12), bevel=0.01)
        # Door glazing mullions
        add_beveled_box(bm, yup(0, 1.68, cd * 0.5 + 0.05), (0.04, 0.04, 0.74), bevel=0.004)
        add_beveled_box(bm, yup(0, 1.68, cd * 0.5 + 0.05), (0.86, 0.04, 0.04), bevel=0.004)
        # Front & back windows cedar frames, sills, lintels & cross mullions
        for z_side, fz in ((1.0, cd * 0.5), (-1.0, -cd * 0.5)):
            for wx in (-2.45, 2.45):
                # Left/right/top/bottom casing
                for ox in (-0.49, 0.49):
                    add_beveled_box(bm, yup(wx + ox, 1.75, fz + z_side * 0.045), (0.075, 0.08, 1.32), bevel=0.008)
                add_beveled_box(bm, yup(wx, 2.40, fz + z_side * 0.055), (1.14, 0.12, 0.10), bevel=0.01)
                add_beveled_box(bm, yup(wx, 1.09, fz + z_side * 0.070), (1.18, 0.16, 0.09), bevel=0.01)
                # Internal cross mullions
                add_beveled_box(bm, yup(wx, 1.75, fz + z_side * 0.04), (0.04, 0.04, 1.24), bevel=0.004)
                for hy in (1.50, 1.98):
                    add_beveled_box(bm, yup(wx, hy, fz + z_side * 0.04), (0.98, 0.04, 0.04), bevel=0.004)
        # Side attic gable window frames & mullions
        for sx in (-1.0, 1.0):
            fx = sx * (cw * 0.5)
            for oz in (-0.37, 0.37):
                add_beveled_box(bm, yup(fx + sx * 0.045, 3.65, oz), (0.08, 0.075, 0.88), bevel=0.008)
            add_beveled_box(bm, yup(fx + sx * 0.055, 4.08, 0.0), (0.11, 0.88, 0.09), bevel=0.01)
            add_beveled_box(bm, yup(fx + sx * 0.065, 3.21, 0.0), (0.14, 0.92, 0.08), bevel=0.01)
            add_beveled_box(bm, yup(fx + sx * 0.04, 3.65, 0.0), (0.04, 0.04, 0.82), bevel=0.004)
            add_beveled_box(bm, yup(fx + sx * 0.04, 3.65, 0.0), (0.04, 0.74, 0.04), bevel=0.004)

    _build_bmesh_part("Cot_PergolaWood", build_pergola, m_wood, uv_scale=0.8, parent=root)

    def build_garden_soil(bm):
        add_beveled_box(bm, yup(cw * 0.62, 0.46, -cd * 0.12), (1.85, 2.30, 0.08), bevel=0.01)

    _build_bmesh_part("Cot_GardenSoil", build_garden_soil, m_soil, uv_scale=1.0, parent=root)

    def build_garden_veg(bm):
        for gx in (-0.45, 0.05, 0.55):
            for gz in (-0.75, -0.25, 0.25, 0.75):
                add_uv_sphere_part(bm, yup(cw * 0.62 + gx, 0.64, -cd * 0.12 + gz), (0.20, 0.20, 0.18), 10, 8, noise_amp=0.22, seed=800 + int((gx + gz) * 10))
        add_uv_sphere_part(bm, yup(-cw * 0.62, 3.22, 0.0), (1.1, 1.6, 0.26), 14, 10, noise_amp=0.24, seed=850)

    _build_bmesh_part("Cot_GardenFoliage", build_garden_veg, m_green, uv_scale=1.0, parent=root)

    export_glb(out_path, with_anims=False)


# ---------------------------------------------------------------------------
# 8. Harbor Fleet: Cruiser Yacht, Coastal Sloop & Harbor Launch (`harbor_fleet.glb`)
# ---------------------------------------------------------------------------

def _build_flared_hull_bmesh(bm, length: float, beam: float, depth: float, sheer_bow: float, sheer_stern: float, transom_fac: float):
    """Build smooth flared hull ribs along X from stern (-L/2) to bow (+L/2)."""
    nx, nu = 22, 13
    rings = []
    for ix in range(nx):
        t = ix / (nx - 1)  # 0 stern -> 1 bow
        lx = (t - 0.5) * length
        # Half beam envelope
        if t < 0.25:
            bw = transom_fac + (1.0 - transom_fac) * math.sin((t / 0.25) * math.pi * 0.5)
        elif t > 0.52:
            u_b = (t - 0.52) / 0.48
            bw = max(0.02, math.cos(u_b * math.pi * 0.5) ** 0.78)
        else:
            bw = 1.0
        half_b = beam * 0.5 * bw
        sheer_y = sheer_stern * (1.0 - t) + sheer_bow * t - 0.12 * math.sin(t * math.pi)
        keel_y = -depth * (1.0 - max(0.0, t - 0.80) * 3.8)
        ring = []
        for iu in range(nu):
            s = (iu / (nu - 1)) * 2.0 - 1.0  # -1 port sheer -> 0 keel -> +1 stbd sheer
            abs_s = abs(s)
            z = math.copysign((abs_s ** 0.72) * half_b, s)
            y = keel_y + (abs_s ** 1.45) * (sheer_y - keel_y)
            ring.append(bm.verts.new(yup(lx, y, z)))
        rings.append(ring)
    for ix in range(nx - 1):
        for iu in range(nu - 1):
            bm.faces.new((rings[ix][iu], rings[ix + 1][iu], rings[ix + 1][iu + 1], rings[ix][iu + 1]))
    # Stern transom cap
    s_ring = rings[0]
    mid = nu // 2
    for iu in range(mid - 1):
        bm.faces.new((s_ring[iu], s_ring[iu + 1], s_ring[nu - 2 - iu], s_ring[nu - 1 - iu]))
    bm.faces.new((s_ring[mid - 1], s_ring[mid], s_ring[mid + 1]))


def _build_deck_bmesh(bm, length: float, beam: float, sheer_bow: float, sheer_stern: float, transom_fac: float):
    nx = 22
    pairs = []
    for ix in range(nx):
        t = ix / (nx - 1)
        lx = (t - 0.5) * length
        if t < 0.25:
            bw = transom_fac + (1.0 - transom_fac) * math.sin((t / 0.25) * math.pi * 0.5)
        elif t > 0.52:
            u_b = (t - 0.52) / 0.48
            bw = max(0.02, math.cos(u_b * math.pi * 0.5) ** 0.78)
        else:
            bw = 1.0
        half_b = max(0.03, beam * 0.48 * bw)
        sheer_y = sheer_stern * (1.0 - t) + sheer_bow * t - 0.12 * math.sin(t * math.pi)
        pairs.append((bm.verts.new(yup(lx, sheer_y - 0.04, -half_b)), bm.verts.new(yup(lx, sheer_y - 0.04, half_b))))
    for ix in range(nx - 1):
        bm.faces.new((pairs[ix][0], pairs[ix + 1][0], pairs[ix + 1][1], pairs[ix][1]))


def build_harbor_fleet_glb(out_path: Path) -> None:
    reset_scene()
    tex = _make_shared_textures()
    m_white = make_pbr_material("Fleet_WhiteHull", (0.97, 0.96, 0.94), roughness=0.16, metallic=0.04, double_sided=True)
    m_navy = make_pbr_material("Fleet_NavyHull", (0.10, 0.20, 0.33), roughness=0.28, double_sided=True)
    m_teak = make_pbr_material("Fleet_TeakDeck", (0.76, 0.56, 0.35), roughness=0.44, image=tex["teak"], double_sided=True)
    m_mahog = make_pbr_material("Fleet_Mahogany", (0.43, 0.20, 0.10), roughness=0.24, double_sided=True)
    m_steel = make_pbr_material("Fleet_Stainless", (0.90, 0.92, 0.94), roughness=0.15, metallic=0.92)
    m_brass = make_pbr_material("Fleet_Brass", (0.82, 0.65, 0.35), roughness=0.22, metallic=0.88)
    m_leather = make_pbr_material("Fleet_Leather", (0.95, 0.92, 0.87), roughness=0.52)
    m_canvas = make_pbr_material("Fleet_SailCanvas", (0.94, 0.92, 0.86), roughness=0.86, double_sided=True)
    m_glass = make_pbr_material("Fleet_Glass", (0.84, 0.93, 0.96), roughness=0.08, alpha=0.34, double_sided=True)

    # 1. Cabin Yacht (`Yacht_Cruiser`)
    yacht = _new_empty("Yacht_Cruiser")
    _build_flared_hull = lambda b: _build_flared_hull_bmesh(b, 11.5, 3.45, 0.95, 1.38, 0.96, 0.78)
    _build_bmesh_part(
        "Yacht_Hull",
        lambda bm: (
            _build_flared_hull_bmesh(bm, 11.5, 3.45, 0.95, 1.38, 0.96, 0.78),
            add_beveled_box(bm, yup(-0.1, 1.24, 0), (4.4, 2.35, 0.44), bevel=0.04),
            add_beveled_box(bm, yup(-0.32, 2.38, 0), (4.35, 2.32, 0.12), bevel=0.03),
            *[add_beveled_box(bm, yup(-1.65, 2.80, sz), (0.36, 0.12, 0.95), rot_euler=(0, -0.22, 0), bevel=0.02) for sz in (-1.06, 1.06)],
            add_beveled_box(bm, yup(-1.76, 3.26, 0), (0.48, 2.26, 0.10), bevel=0.02),
            add_cylinder_part(bm, yup(-1.76, 3.42, 0), 0.34, 0.32, 0.18, segs=16),
        ),
        m_white,
        uv_scale=0.35,
        parent=yacht,
    )
    _build_bmesh_part("Yacht_NavyStripe", lambda bm: _build_flared_hull_bmesh(bm, 11.54, 3.48, 0.24, 0.22, 0.16, 0.78), m_navy, uv_scale=0.4, parent=yacht)
    _build_bmesh_part("Yacht_TeakDeck", lambda bm: (_build_deck_bmesh(bm, 11.4, 3.38, 1.32, 0.92, 0.76), add_beveled_box(bm, yup(-6.05, 0.22, 0), (0.85, 2.55, 0.09), bevel=0.02)), m_teak, uv_scale=0.6, parent=yacht)
    _build_bmesh_part("Yacht_GlassCabin", lambda bm: add_beveled_box(bm, yup(-0.25, 1.88, 0), (3.85, 2.18, 0.92), bevel=0.03), m_glass, uv_scale=1.0, parent=yacht)
    _build_bmesh_part(
        "Yacht_Mahogany",
        lambda bm: (
            add_beveled_box(bm, yup(1.18, 1.48, 0), (0.68, 1.75, 0.78), bevel=0.025),
            add_beveled_box(bm, yup(-3.85, 1.38, 0), (0.75, 1.15, 0.06), bevel=0.015),
        ),
        m_mahog,
        uv_scale=1.0,
        parent=yacht,
    )
    _build_bmesh_part(
        "Yacht_LeatherSeats",
        lambda bm: (
            *[add_beveled_box(bm, yup(0.22, 1.52, sz), (0.52, 0.52, 0.56), bevel=0.04) for sz in (-0.46, 0.46)],
            add_beveled_box(bm, yup(-4.85, 1.18, 0), (0.68, 2.25, 0.42), bevel=0.04),
        ),
        m_leather,
        uv_scale=1.0,
        parent=yacht,
    )
    _build_bmesh_part(
        "Yacht_Stainless",
        lambda bm: (
            *[add_cylinder_part(bm, yup(fx, 1.88, fz), 0.032, 0.032, 0.94, segs=8) for fx in (-2.16, -0.35, 1.66) for fz in (-1.09, 1.09)],
            *[add_cylinder_part(bm, yup(rx, ry - 0.26, rz), 0.014, 0.014, 0.52, segs=6) for rx, ry, rz in ((1.8, 1.62, -1.48), (3.6, 1.72, -1.12), (5.55, 1.84, -0.18), (1.8, 1.62, 1.48), (3.6, 1.72, 1.12), (5.55, 1.84, 0.18))],
            add_tube_along_curve(bm, [yup(1.8, 1.62, -1.48), yup(3.6, 1.72, -1.12), yup(5.55, 1.84, -0.18), yup(5.55, 1.84, 0.18), yup(3.6, 1.72, 1.12), yup(1.8, 1.62, 1.48)], [0.015] * 6, 8),
        ),
        m_steel,
        uv_scale=1.0,
        parent=yacht,
    )

    # 2. Coastal Sloop (`Coastal_Sloop`)
    sloop = _new_empty("Coastal_Sloop")
    _build_bmesh_part("Sloop_Hull", lambda bm: (_build_flared_hull_bmesh(bm, 9.8, 2.78, 0.92, 1.12, 0.84, 0.58), add_beveled_box(bm, yup(0.45, 1.08, 0), (3.1, 1.55, 0.34), bevel=0.05)), m_white, uv_scale=0.35, parent=sloop)
    _build_bmesh_part("Sloop_NavyStripe", lambda bm: _build_flared_hull_bmesh(bm, 9.84, 2.81, 0.20, 0.16, 0.12, 0.58), m_navy, uv_scale=0.4, parent=sloop)
    _build_bmesh_part("Sloop_Teak", lambda bm: (_build_deck_bmesh(bm, 9.7, 2.72, 1.08, 0.80, 0.56), *[add_beveled_box(bm, yup(-2.55, 0.92, sz), (2.6, 0.42, 0.16), bevel=0.02) for sz in (-0.66, 0.66)]), m_teak, uv_scale=0.6, parent=sloop)
    _build_bmesh_part(
        "Sloop_MastRig",
        lambda bm: (
            add_cylinder_part(bm, yup(0.95, 7.20, 0), 0.095, 0.055, 12.5, segs=12),
            add_cylinder_part(bm, yup(0.95, 7.60, 0), 0.022, 0.022, 2.20, segs=8, rot_euler=(math.pi * 0.5, 0, 0)),
            add_cylinder_part(bm, yup(-1.25, 2.25, 0), 0.055, 0.048, 4.35, segs=10, rot_euler=(0, math.pi * 0.5, 0)),
            add_cylinder_part(bm, yup(-3.35, 1.24, 0), 0.09, 0.07, 0.78, segs=12),
            add_tube_along_curve(bm, [yup(math.cos((i / 20) * math.tau) * 0.01, 1.52 + math.sin((i / 20) * math.tau) * 0.42, math.cos((i / 20) * math.tau) * 0.42) + Vector((-3.45, 0, 0)) for i in range(21)], [0.016] * 21, 6),
            add_tube_along_curve(bm, [yup(0.95, 13.35, 0), yup(4.75, 1.15, 0)], [0.014, 0.014], 6),
            add_tube_along_curve(bm, [yup(0.95, 13.40, 0), yup(-4.72, 0.92, 0)], [0.008, 0.008], 6),
            *[add_tube_along_curve(bm, [yup(0.95, 1.02, sz), yup(0.95, 7.60, math.copysign(1.08, sz)), yup(0.95, 13.20, 0)], [0.008, 0.008, 0.008], 6) for sz in (-1.26, 1.26)],
        ),
        m_steel,
        uv_scale=1.0,
        parent=sloop,
    )
    _build_bmesh_part("Sloop_FurledSail", lambda bm: add_uv_sphere_part(bm, yup(-1.20, 2.42, 0), (2.10, 0.14, 0.18), 16, 10), m_canvas, uv_scale=1.0, parent=sloop)

    # 3. Harbor Clinker Launch (`Harbor_Launch`)
    launch = _new_empty("Harbor_Launch")
    _build_bmesh_part("Launch_Hull", lambda bm: _build_flared_hull_bmesh(bm, 7.6, 2.28, 0.68, 0.86, 0.66, 0.64), m_white, uv_scale=0.35, parent=launch)
    _build_bmesh_part(
        "Launch_Mahogany",
        lambda bm: (
            add_cylinder_part(bm, yup(2.65, 0.78, 0), 1.02, 0.12, 2.1, segs=12, rot_euler=(0, math.pi * 0.5, 0)),
            *[add_beveled_box(bm, yup(tx, 0.56, 0), (0.42, 1.88, 0.06), bevel=0.015) for tx in (-2.2, -0.65, 0.85)],
        ),
        m_mahog,
        uv_scale=0.8,
        parent=launch,
    )
    _build_bmesh_part("Launch_Teak", lambda bm: _build_deck_bmesh(bm, 7.45, 2.20, 0.42, 0.38, 0.62), m_teak, uv_scale=0.7, parent=launch)
    _build_bmesh_part("Launch_BiminiCanvas", lambda bm: add_beveled_box(bm, yup(-0.95, 1.86, 0), (2.85, 1.96, 0.06), bevel=0.025), m_canvas, uv_scale=1.0, parent=launch)
    _build_bmesh_part("Launch_BiminiTrim", lambda bm: add_beveled_box(bm, yup(-0.95, 1.83, 0), (2.89, 2.00, 0.09), bevel=0.02), m_navy, uv_scale=1.0, parent=launch)
    _build_bmesh_part(
        "Launch_Frame",
        lambda bm: (
            *[add_cylinder_part(bm, yup(bx, 1.26, bz), 0.014, 0.014, 1.16, segs=8) for bx in (-2.15, 0.25) for bz in (-0.92, 0.92)],
            add_cylinder_part(bm, yup(0.35, 0.76, 0), 0.055, 0.045, 0.68, segs=10),
        ),
        m_brass,
        uv_scale=1.0,
        parent=launch,
    )

    export_glb(out_path, with_anims=False)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", type=Path, default=Path("site/assets/models"))
    args = parser.parse_args(argv)
    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    TEX_CACHE.mkdir(parents=True, exist_ok=True)

    build_monet_pond_glb(out_dir / "garden_monet_pond.glb")
    build_swing_arches_glb(out_dir / "garden_swing_arches.glb")
    build_lighthouse_glb(out_dir / "coastal_lighthouse.glb")
    build_windmill_glb(out_dir / "hilltop_windmill.glb")
    build_creek_bridge_glb(out_dir / "creek_bridge.glb")
    build_gazebo_glb(out_dir / "cliffside_gazebo.glb")
    build_cottage_glb(out_dir / "provencal_cottage.glb")
    build_harbor_fleet_glb(out_dir / "harbor_fleet.glb")


if __name__ == "__main__":
    main()
