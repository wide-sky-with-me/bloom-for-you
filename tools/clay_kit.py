#!/usr/bin/env python3
"""Reusable soft-matte clay diorama primitives, botanicals & Cycles lightmap baker."""

from __future__ import annotations

import math
from pathlib import Path
import random
import bpy
import bmesh
from mathutils import Euler, Vector

# Cohesive `Pearl & Co.`-inspired Romantic Clay Diorama Palette
PALETTE = {
    "bg_cream": "#F5EDE0",
    "stucco_light": "#F8F1E6",
    "stucco_warm": "#EFE3D2",
    "limestone": "#E4D3BE",
    "quoin_stone": "#D7C1A7",
    "cliff_sand": "#D3A47E",
    "cliff_terra": "#C68367",
    "cliff_rock": "#B8957E",
    "turf_sage": "#8FB98A",
    "turf_moss": "#7CA679",
    "turf_light": "#A5CA9B",
    "shutter_sage": "#7BA380",
    "foliage_deep": "#658E67",
    "foliage_olive": "#84A97C",
    "blossom_pink": "#EDA9B6",
    "terra_1": "#C96D53",
    "terra_2": "#D87F63",
    "terra_3": "#B95D46",
    "terra_4": "#E19175",
    "awning_rose": "#C9717E",
    "awning_lav": "#A589C2",
    "awning_cream": "#FAF3E9",
    "oak_light": "#CFA072",
    "oak_mid": "#B98557",
    "oak_dark": "#7B5336",
    "iron_dark": "#3E353F",
    "brass": "#E0B45C",
    "copper": "#C97850",
    "sofa_cream": "#F6EFE5",
    "linen_white": "#FAF5EE",
    "linen_blush": "#E5A3AE",
    "linen_lav": "#B6A1D4",
    "linen_blue": "#9DB2CC",
    "linen_butter": "#F2CE74",
    "fridge_sage": "#9BB99B",
    "rug_cream": "#F0E5D5",
    "rug_coral": "#D88977",
    "rose_crimson": "#C45B6C",
    "rose_blush": "#E89CA9",
    "rose_coral": "#DF8375",
    "hydrangea_lav": "#9F8AC7",
    "hydrangea_blue": "#8B9FD1",
    "tulip_gold": "#F4CA6D",
    "tulip_peach": "#ECA085",
    "wax_red": "#B84353",
}


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(hex_str: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    h = hex_str.lstrip("#")
    r = srgb_to_linear(int(h[0:2], 16) / 255.0)
    g = srgb_to_linear(int(h[2:4], 16) / 255.0)
    b = srgb_to_linear(int(h[4:6], 16) / 255.0)
    return (r, g, b, alpha)


_MAT_CACHE: dict[str, bpy.types.Material] = {}


def clear_material_cache() -> None:
    _MAT_CACHE.clear()


def clay_mat(
    name: str,
    hex_color: str,
    roughness: float = 0.88,
    metallic: float = 0.0,
    emission_hex: str | None = None,
    emission_strength: float = 0.0,
    alpha: float = 1.0,
) -> bpy.types.Material:
    key = f"{name}_{hex_color}_{roughness:.2f}_{metallic:.2f}_{emission_hex}_{emission_strength:.2f}_{alpha:.2f}"
    if key in _MAT_CACHE:
        return _MAT_CACHE[key]
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hex_rgba(hex_color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.22
    if emission_hex and emission_strength > 0:
        bsdf.inputs["Emission Color"].default_value = hex_rgba(emission_hex, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 0.999:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND"
    else:
        # Backface transparency during Cycles GI+AO baking prevents any intersecting/embedded
        # geometry edge from baking black `(0,0,0)` seam lines while preserving 100% front-face AO & shadows!
        nt = mat.node_tree
        out_n = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
        if out_n:
            geom = nt.nodes.new("ShaderNodeNewGeometry")
            transp = nt.nodes.new("ShaderNodeBsdfTransparent")
            mix_s = nt.nodes.new("ShaderNodeMixShader")
            nt.links.new(geom.outputs["Backfacing"], mix_s.inputs["Fac"])
            nt.links.new(bsdf.outputs["BSDF"], mix_s.inputs[1])
            nt.links.new(transp.outputs["BSDF"], mix_s.inputs[2])
            nt.links.new(mix_s.outputs["Shader"], out_n.inputs["Surface"])
    _MAT_CACHE[key] = mat
    return mat


def strip_bake_backface_nodes() -> None:
    """Restores direct Principled BSDF -> Surface links on remaining unbaked materials before glTF export."""
    for mat in bpy.data.materials:
        if not mat.use_nodes or mat.name.endswith("BakedMat"):
            continue
        nt = mat.node_tree
        bsdf = nt.nodes.get("Principled BSDF")
        out_n = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
        if bsdf and out_n:
            nt.links.new(bsdf.outputs["BSDF"], out_n.inputs["Surface"])


def link_obj(name: str, bm: bmesh.types.BMesh, mat: bpy.types.Material, bucket: list[bpy.types.Object]) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name + "_m")
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bucket.append(obj)
    return obj


def add_rbox(
    name: str,
    center: tuple[float, float, float],
    size: tuple[float, float, float],
    mat: bpy.types.Material,
    bucket: list[bpy.types.Object],
    bevel: float = 0.03,
    segs: int = 1,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    if bevel > 0:
        limit_b = min(bevel, min(size) * 0.34)
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=limit_b, segments=segs, affect="EDGES")
    if any(abs(a) > 1e-5 for a in rot):
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Euler(rot, "XYZ").to_matrix(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    return link_obj(name, bm, mat, bucket)


def add_tapered_cone(
    name: str,
    center: tuple[float, float, float],
    r_bottom: float,
    r_top: float,
    height: float,
    mat: bpy.types.Material,
    bucket: list[bpy.types.Object],
    verts: int = 36,
    cap_ends: bool = True,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
    scale_xy: tuple[float, float] = (1.0, 1.0),
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=cap_ends,
        cap_tris=False,
        segments=verts,
        radius1=r_bottom,
        radius2=r_top,
        depth=height,
    )
    if scale_xy != (1.0, 1.0):
        bmesh.ops.scale(bm, vec=(scale_xy[0], scale_xy[1], 1.0), verts=bm.verts)
    if any(abs(a) > 1e-5 for a in rot):
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Euler(rot, "XYZ").to_matrix(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    return link_obj(name, bm, mat, bucket)


def add_rcyl(
    name: str,
    center: tuple[float, float, float],
    radius: float,
    height: float,
    mat: bpy.types.Material,
    bucket: list[bpy.types.Object],
    verts: int = 24,
    bevel: float = 0.02,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
    scale_xy: tuple[float, float] = (1.0, 1.0),
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=verts,
        radius1=radius,
        radius2=radius,
        depth=height,
    )
    if scale_xy != (1.0, 1.0):
        bmesh.ops.scale(bm, vec=(scale_xy[0], scale_xy[1], 1.0), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(
            bm,
            geom=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4],
            offset=min(bevel, radius * 0.32, height * 0.32),
            segments=2,
            affect="EDGES",
        )
    if any(abs(a) > 1e-5 for a in rot):
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Euler(rot, "XYZ").to_matrix(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    return link_obj(name, bm, mat, bucket)


def add_clay_ball(
    name: str,
    center: tuple[float, float, float],
    radii: tuple[float, float, float],
    mat: bpy.types.Material,
    bucket: list[bpy.types.Object],
    subdiv: int = 2,
    wobble: float = 0.0,
    seed: int = 0,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
    flat_shade: bool = False,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    if wobble > 0:
        rng = random.Random(seed)
        for v in bm.verts:
            f = 1.0 + rng.uniform(-wobble, wobble)
            v.co *= f
    bmesh.ops.scale(bm, vec=radii, verts=bm.verts)
    if any(abs(a) > 1e-5 for a in rot):
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Euler(rot, "XYZ").to_matrix(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    obj = link_obj(name, bm, mat, bucket)
    if flat_shade:
        for poly in obj.data.polygons:
            poly.use_smooth = False
    return obj


def add_gable_prism(
    name: str,
    center_xy: tuple[float, float],
    width_x: float,
    depth_y: float,
    z_base: float,
    z_peak: float,
    mat: bpy.types.Material,
    bucket: list[bpy.types.Object],
    ridge_along_x: bool = True,
) -> bpy.types.Object:
    """Triangular gable wall prism."""
    bm = bmesh.new()
    hx, hy = width_x * 0.5, depth_y * 0.5
    cx, cy = center_xy
    if ridge_along_x:
        pts = [
            (-hx, -hy, z_base), (hx, -hy, z_base), (hx, 0.0, z_peak), (-hx, 0.0, z_peak),
            (-hx, hy, z_base), (hx, hy, z_base),
        ]
        verts = [bm.verts.new((cx + px, cy + py, pz)) for px, py, pz in pts]
        bm.faces.new([verts[0], verts[1], verts[2], verts[3]])
        bm.faces.new([verts[5], verts[4], verts[3], verts[2]])
        bm.faces.new([verts[4], verts[0], verts[3]])
        bm.faces.new([verts[1], verts[5], verts[2]])
        bm.faces.new([verts[4], verts[5], verts[1], verts[0]])
    else:
        pts = [
            (-hx, -hy, z_base), (hx, -hy, z_base), (0.0, -hy, z_peak),
            (-hx, hy, z_base), (hx, hy, z_base), (0.0, hy, z_peak),
        ]
        verts = [bm.verts.new((cx + px, cy + py, pz)) for px, py, pz in pts]
        bm.faces.new([verts[0], verts[1], verts[2]])
        bm.faces.new([verts[4], verts[3], verts[5]])
        bm.faces.new([verts[0], verts[2], verts[5], verts[3]])
        bm.faces.new([verts[2], verts[1], verts[4], verts[5]])
        bm.faces.new([verts[3], verts[4], verts[1], verts[0]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link_obj(name, bm, mat, bucket)


def build_scalloped_island(
    prefix: str,
    center: tuple[float, float, float],
    rx: float,
    ry: float,
    thickness: float,
    bucket: list[bpy.types.Object],
    lobes: int = 10,
    seed: int = 11,
    has_rim_wall: bool = False,
) -> None:
    """Builds a Pearl & Co.-style multi-layered rounded floating clay island base."""
    cx, cy, cz = center
    m_sand = clay_mat("CliffSand", PALETTE["cliff_sand"], 0.92)
    m_terra = clay_mat("CliffTerra", PALETTE["cliff_terra"], 0.90)
    m_rock = clay_mat("CliffRock", PALETTE["cliff_rock"], 0.90)
    m_stone = clay_mat("IslandRim", PALETTE["limestone"], 0.88)
    m_turf = clay_mat("TurfSage", PALETTE["turf_sage"], 0.90)

    # Smooth central turf cap
    add_rcyl(f"{prefix}_TurfCap", (cx, cy, cz - 0.11), 1.0, 0.22, m_turf, bucket, verts=40, bevel=0.07, scale_xy=(rx, ry))
    # Cream/limestone middle curb tier (just like Pearl & Co. frame_04!)
    add_rcyl(f"{prefix}_StoneTier", (cx, cy, cz - 0.30), 1.0, 0.26, m_stone, bucket, verts=40, bevel=0.06, scale_xy=(rx * 1.02, ry * 1.02))
    # Warm sandstone/terracotta tapered under-cliff
    add_rcyl(f"{prefix}_UnderCliff", (cx, cy, cz - 0.30 - thickness * 0.48), 1.0, thickness, m_sand, bucket, verts=36, bevel=0.10, scale_xy=(rx * 0.92, ry * 0.92))
    add_rcyl(f"{prefix}_BottomBelly", (cx, cy, cz - 0.36 - thickness * 0.82), 1.0, thickness * 0.45, m_terra, bucket, verts=32, bevel=0.10, scale_xy=(rx * 0.72, ry * 0.72))

    # Sculpted rounded perimeter rock & turf lobes
    rng = random.Random(seed)
    for i in range(lobes):
        ang = (i / lobes) * math.tau + rng.uniform(-0.12, 0.12)
        lx = cx + math.cos(ang) * rx * rng.uniform(0.86, 0.98)
        ly = cy + math.sin(ang) * ry * rng.uniform(0.86, 0.98)
        mat_choice = [m_sand, m_terra, m_rock][i % 3]
        add_clay_ball(
            f"{prefix}_CliffLobe_{i}",
            (lx, ly, cz - rng.uniform(0.36, 0.62)),
            (rng.uniform(0.46, 0.78), rng.uniform(0.42, 0.72), rng.uniform(0.28, 0.45)),
            mat_choice,
            bucket,
            subdiv=2,
            wobble=0.12,
            seed=seed * 31 + i,
            flat_shade=True,
        )
    if has_rim_wall:
        add_rcyl(f"{prefix}_LowCurb", (cx, cy, cz + 0.02), 1.0, 0.08, m_stone, bucket, verts=40, bevel=0.03, scale_xy=(rx * 0.97, ry * 0.97))


def add_clay_tree(
    prefix: str,
    pos: tuple[float, float, float],
    scale: float,
    bucket: list[bpy.types.Object],
    style: str = "olive",
    seed: int = 7,
) -> None:
    """Faceted-soft clay miniature tree matching Pearl & Co. frames."""
    x, y, z = pos
    m_trunk = clay_mat("TreeTrunk", PALETTE["oak_dark"], 0.90)
    add_rcyl(f"{prefix}_Trunk", (x, y, z + 0.48 * scale), 0.11 * scale, 0.96 * scale, m_trunk, bucket, verts=12, bevel=0.02)

    if style == "cypress":
        m_leaf = clay_mat("CypressLeaf", PALETTE["foliage_deep"], 0.88)
        add_clay_ball(f"{prefix}_Crown0", (x, y, z + 1.18 * scale), (0.42 * scale, 0.42 * scale, 0.72 * scale), m_leaf, bucket, subdiv=3, wobble=0.05, seed=seed, flat_shade=False)
        add_clay_ball(f"{prefix}_Crown1", (x, y, z + 1.68 * scale), (0.30 * scale, 0.30 * scale, 0.54 * scale), m_leaf, bucket, subdiv=3, wobble=0.05, seed=seed + 1, flat_shade=False)
        add_clay_ball(f"{prefix}_Crown2", (x, y, z + 2.06 * scale), (0.17 * scale, 0.17 * scale, 0.34 * scale), m_leaf, bucket, subdiv=3, wobble=0.04, seed=seed + 2, flat_shade=False)
    elif style == "blossom":
        m_pink = clay_mat("BlossomPink", PALETTE["blossom_pink"], 0.86)
        m_rose = clay_mat("BlossomRose", PALETTE["rose_blush"], 0.86)
        m_light = clay_mat("BlossomCream", PALETTE["stucco_light"], 0.86)
        offs = [
            (0.0, 0.0, 1.30, 0.52, m_pink),
            (-0.34, 0.14, 1.10, 0.38, m_rose),
            (0.35, -0.14, 1.12, 0.40, m_light),
            (0.06, 0.32, 1.15, 0.36, m_pink),
            (-0.14, -0.30, 1.14, 0.36, m_light),
            (0.18, 0.12, 1.48, 0.32, m_rose),
        ]
        for k, (ox, oy, oz, r, m) in enumerate(offs):
            add_clay_ball(f"{prefix}_Puff_{k}", (x + ox * scale, y + oy * scale, z + oz * scale), (r * scale, r * scale, r * 0.86 * scale), m, bucket, subdiv=3, wobble=0.05, seed=seed + k, flat_shade=False)
    else:
        m_leaf1 = clay_mat("OliveLeaf1", PALETTE["foliage_olive"], 0.88)
        m_leaf2 = clay_mat("OliveLeaf2", PALETTE["turf_light"], 0.88)
        offs = [
            (0.0, 0.0, 1.28, 0.52, m_leaf1),
            (-0.32, -0.18, 1.08, 0.38, m_leaf2),
            (0.34, 0.18, 1.10, 0.40, m_leaf1),
            (-0.10, 0.30, 1.14, 0.36, m_leaf2),
            (0.16, -0.26, 1.12, 0.35, m_leaf1),
            (-0.08, 0.04, 1.48, 0.33, m_leaf2),
        ]
        for k, (ox, oy, oz, r, m) in enumerate(offs):
            add_clay_ball(f"{prefix}_Puff_{k}", (x + ox * scale, y + oy * scale, z + oz * scale), (r * scale, r * scale, r * 0.84 * scale), m, bucket, subdiv=3, wobble=0.05, seed=seed + k, flat_shade=False)


def add_flower_bush(
    prefix: str,
    pos: tuple[float, float, float],
    scale: float,
    kind: str,
    bucket: list[bpy.types.Object],
    seed: int = 3,
) -> None:
    """Lush clay shrub studded with sculpted roses, hydrangeas, or lavender spikes."""
    x, y, z = pos
    rng = random.Random(seed)
    m_bush = clay_mat("BushGreen", PALETTE["turf_moss"], 0.90)
    add_clay_ball(f"{prefix}_Mound", (x, y, z + 0.16 * scale), (0.36 * scale, 0.32 * scale, 0.22 * scale), m_bush, bucket, subdiv=2, wobble=0.10, seed=seed, flat_shade=True)

    if kind == "lavender":
        m_lav = clay_mat("LavSpike", PALETTE["awning_lav"], 0.85)
        for i in range(7):
            ang = (i / 7) * math.tau + rng.uniform(-0.2, 0.2)
            rr = rng.uniform(0.05, 0.22) * scale
            add_clay_ball(
                f"{prefix}_Lav_{i}",
                (x + math.cos(ang) * rr, y + math.sin(ang) * rr, z + (0.34 + rng.uniform(0, 0.10)) * scale),
                (0.055 * scale, 0.055 * scale, 0.16 * scale),
                m_lav,
                bucket,
                subdiv=1,
                rot=(rng.uniform(-0.18, 0.18), rng.uniform(-0.18, 0.18), 0.0),
            )
    elif kind == "hydrangea":
        cols = [PALETTE["hydrangea_lav"], PALETTE["hydrangea_blue"], PALETTE["linen_lav"]]
        for i in range(5):
            ang = (i / 5) * math.tau + rng.uniform(-0.2, 0.2)
            rr = rng.uniform(0.06, 0.22) * scale
            mc = clay_mat(f"Hyd_{i%3}", cols[i % 3], 0.84)
            add_clay_ball(
                f"{prefix}_Hyd_{i}",
                (x + math.cos(ang) * rr, y + math.sin(ang) * rr, z + 0.28 * scale),
                (0.11 * scale, 0.11 * scale, 0.095 * scale),
                mc,
                bucket,
                subdiv=2,
                wobble=0.08,
                seed=seed + i,
            )
    else:
        cols = [PALETTE["rose_blush"], PALETTE["rose_crimson"], PALETTE["rose_coral"], PALETTE["awning_cream"]]
        for i in range(6):
            ang = (i / 6) * math.tau + rng.uniform(-0.2, 0.2)
            rr = rng.uniform(0.05, 0.24) * scale
            mc = clay_mat(f"RoseC_{i%4}", cols[i % 4], 0.82)
            bx = x + math.cos(ang) * rr
            by = y + math.sin(ang) * rr
            bz = z + 0.28 * scale
            add_clay_ball(f"{prefix}_R_{i}", (bx, by, bz), (0.075 * scale, 0.075 * scale, 0.062 * scale), mc, bucket, subdiv=2)
            add_clay_ball(f"{prefix}_RC_{i}", (bx, by, bz + 0.03 * scale), (0.042 * scale, 0.042 * scale, 0.04 * scale), mc, bucket, subdiv=1)


def add_sculpted_rose_head(
    prefix: str,
    center: tuple[float, float, float],
    scale: float,
    hex_col: str,
    bucket: list[bpy.types.Object],
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> None:
    """High-detail cupped clay garden rose with layered petals for hero bouquet."""
    mat = clay_mat(f"HeroRose_{hex_col}", hex_col, 0.78)
    bm = bmesh.new()
    # Core bud
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.22 * scale)
    # 3 concentric rings of cupped clay petals
    rings = [(5, 0.24, 0.26, 0.35), (7, 0.38, 0.32, 0.62), (9, 0.52, 0.36, 0.88)]
    for count, dist, p_rad, tilt in rings:
        for k in range(count):
            ang = (k / count) * math.tau + dist * 3.1
            sub = bmesh.new()
            bmesh.ops.create_icosphere(sub, subdivisions=2, radius=1.0)
            bmesh.ops.scale(sub, vec=(p_rad * scale, p_rad * 0.32 * scale, p_rad * 0.82 * scale), verts=sub.verts)
            mat_r = Euler((tilt, 0.0, ang + math.pi * 0.5), "XYZ").to_matrix()
            bmesh.ops.rotate(sub, cent=(0, 0, 0), matrix=mat_r, verts=sub.verts)
            bmesh.ops.translate(sub, vec=(math.cos(ang) * dist * scale, math.sin(ang) * dist * scale, 0.04 * scale), verts=sub.verts)
            # Merge into bm
            vmap = {v: bm.verts.new(v.co) for v in sub.verts}
            for f in sub.faces:
                bm.faces.new([vmap[v] for v in f.verts])
            sub.free()
    if any(abs(a) > 1e-5 for a in rot):
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Euler(rot, "XYZ").to_matrix(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    link_obj(prefix, bm, mat, bucket)


def add_terracotta_barrel_slope(
    prefix: str,
    x_min: float,
    x_max: float,
    y_eave: float,
    y_ridge: float,
    z_eave: float,
    z_ridge: float,
    bucket: list[bpy.types.Object],
    seed: int = 21,
) -> None:
    """Populates overlapping South-of-France terracotta clay barrel tiles along a roof slope."""
    rng = random.Random(seed)
    mats = [
        clay_mat("Terra1", PALETTE["terra_1"], 0.84),
        clay_mat("Terra2", PALETTE["terra_2"], 0.84),
        clay_mat("Terra3", PALETTE["terra_3"], 0.84),
        clay_mat("Terra4", PALETTE["terra_4"], 0.84),
    ]
    dy = y_ridge - y_eave
    dz = z_ridge - z_eave
    slope_len = math.hypot(dy, dz)
    pitch = math.atan2(dz, abs(dy))
    sign_y = 1.0 if dy >= 0 else -1.0
    rot_x = pitch if sign_y > 0 else -pitch

    n_rows = max(4, int(slope_len / 0.30))
    col_step = 0.24
    n_cols = max(4, int((x_max - x_min) / col_step))
    actual_step = (x_max - x_min) / n_cols

    for r in range(n_rows):
        t0 = (r + 0.5) / n_rows
        yc = y_eave + dy * t0
        zc = z_eave + dz * t0 + 0.045
        for c in range(n_cols):
            xc = x_min + (c + 0.5) * actual_step
            m = mats[(r * 5 + c * 3 + rng.randint(0, 2)) % len(mats)]
            add_rcyl(
                f"{prefix}_Tile_{r}_{c}",
                (xc, yc, zc),
                0.095,
                (slope_len / n_rows) * 1.14,
                m,
                bucket,
                verts=10,
                bevel=0.012,
                rot=(math.pi * 0.5 - rot_x, 0.0, rng.uniform(-0.025, 0.025)),
                scale_xy=(1.0, 0.62),
            )


def join_and_bake_group(
    merged_name: str,
    objs: list[bpy.types.Object],
    atlas_name: str,
    res: int,
    parent_empty: bpy.types.Object,
    temp_dir: Path,
) -> bpy.types.Object:
    """Joins `objs`, creates a Smart UV lightmap layout, bakes Cycles COMBINED (GI+AO), and assigns baked atlas."""
    bpy.ops.object.select_all(action="DESELECT")
    valid = [o for o in objs if o.type == "MESH" and len(o.data.polygons) > 0]
    for o in valid:
        o.select_set(True)
    bpy.context.view_layer.objects.active = valid[0]
    if len(valid) > 1:
        bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    merged.name = merged_name
    merged.data.name = merged_name + "_Mesh"

    # Smart UV unwrap onto primary UV map so exported glTF needs only 1 UV set
    bpy.ops.object.mode_set(mode="EDIT")
    # Smart UV unwrap with 89° angle threshold so 45° bevel chamfers stay attached to main faces
    # (preventing sub-pixel orphan bevel islands), plus warm clay atlas pre-fill with use_clear=False!
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(89.0), island_margin=0.003, area_weight=0.35, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    img = bpy.data.images.new(atlas_name, width=res, height=res, alpha=False, float_buffer=True)
    img.generated_color = (0.68, 0.60, 0.52, 1.0)
    img.colorspace_settings.name = "Linear Rec.709" if "Linear Rec.709" in [e.identifier for e in img.colorspace_settings.bl_rna.properties["name"].enum_items] else "Linear"

    # Attach non-connected Image Texture node as active bake target in every slot material
    bake_nodes: list[tuple[bpy.types.NodeTree, bpy.types.Node]] = []
    seen_mats: set[bpy.types.Material] = set()
    for slot in merged.material_slots:
        mat = slot.material
        if not mat or mat in seen_mats:
            continue
        seen_mats.add(mat)
        mat.use_nodes = True
        nt = mat.node_tree
        tex_node = nt.nodes.new("ShaderNodeTexImage")
        tex_node.image = img
        tex_node.select = True
        nt.nodes.active = tex_node
        bake_nodes.append((nt, tex_node))

    bpy.ops.object.select_all(action="DESELECT")
    merged.select_set(True)
    bpy.context.view_layer.objects.active = merged

    scn = bpy.context.scene
    scn.render.bake.margin = 16
    print(f"[Cycles Bake] Baking {merged_name} -> {atlas_name} ({res}x{res})...")
    bpy.ops.object.bake(type="COMBINED", margin=16, use_clear=False)

    # Save with Filmic view transform into JPEG so glTF embeds crisp ~350-650KB JPEG instead of huge PNG!
    jpg_path = temp_dir / f"{atlas_name}.jpg"
    prev_fmt = scn.render.image_settings.file_format
    prev_qual = scn.render.image_settings.quality
    scn.render.image_settings.file_format = "JPEG"
    scn.render.image_settings.quality = 93
    img.save_render(filepath=str(jpg_path), scene=scn)
    scn.render.image_settings.file_format = prev_fmt
    scn.render.image_settings.quality = prev_qual

    # Clean temporary bake target nodes from procedural clay materials so other groups remain clean
    for nt, tex_node in bake_nodes:
        nt.nodes.remove(tex_node)
    bpy.data.images.remove(img)

    packed_img = bpy.data.images.load(str(jpg_path))
    packed_img.name = atlas_name
    packed_img.pack()

    baked_mat = bpy.data.materials.new(name=f"{merged_name}BakedMat")
    baked_mat.use_nodes = True
    nt = baked_mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.92
    bsdf.inputs["Metallic"].default_value = 0.0
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.08
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = packed_img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

    merged.data.materials.clear()
    merged.data.materials.append(baked_mat)
    merged.parent = parent_empty
    return merged
