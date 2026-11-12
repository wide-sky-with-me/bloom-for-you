#!/usr/bin/env python3
"""
Blender 4.0 Cycles Global-Illumination Baked 3D Villa Generator (`storybook_cottage.glb`)
=========================================================================================
Builds an exquisite, architecturally complete Two-Bedroom, One-Living-Room ("两室一厅")
Fairytale Storybook Villa & Courtyard Diorama with Cycles ray-traced GI + AO lightmaps:

  - Node Hierarchy in exported `storybook_cottage.glb`:
      * `CottageRoot`
          - `CottageBaseNode` (Stone courtyard plinth, herringbone oak floors, cutaway-ready
             interior/exterior walls, front porch deck & steps, + full `两室一厅` furniture!)
          - `CottageRoofNode` (Gabled slate-shingle roof, timber rafters, dormer window,
             golden star weathervane & upper brick chimney — smoothly lifts open on scroll!)
          - `CottageFrontUpperNode` (Upper front window wall, oak front door upper leaf,
             flower boxes & porch canopy — lifts & fades with roof for unobstructed cutaway!)
          - `ChimneyTipNode` (Exact world emitter anchor for heart/starlight smoke)
          - `GramophoneDiscNode` (Animated spinning vinyl record in Living Room)
          - `FireplaceEmberNode` (Animated flickering warm hearth glow in Living Room)

  - Three Distinct Furnished Rooms ("两室一厅"):
      1. 一厅 · 暖火壁炉客厅与开放式餐厨 (`Living & Dining Hall`, X in [-0.14, +2.04]):
         Cream bouclé L-sofa + pillows, woven rug, walnut coffee table + tea set & love letter,
         stone fireplace + logs + couple painting, brass-horn gramophone, floor lamp, potted
         fiddle-leaf fig, honey-oak L-kitchen (sink, stove, kettle, retro fridge, wall shelves),
         and round bistro dining table for two under a warm brass pendant chandelier.
      2. 主卧 · 浪漫星空飘窗双人主卧 (`Master Bedroom`, X in [-2.04, -0.22], Y in [0.00, +1.39]):
         Queen upholstered walnut bed + tufted headboard + ivory duvet + rose throw & 4 pillows,
         twin nightstands + warm pleated bedside lamps, arched Starry Night bay window with
         cushioned bench & sheer curtains, 3-door oak wardrobe, and halo-mirror vanity table.
      3. 次卧 · 梵高星空画室与书房卧榻 (`Starry Studio / 2nd Bedroom`, X in [-2.04, -0.22], Y in [-1.24, -0.08]):
         Cozy single daybed + starry indigo quilt & cushions, tall 4-tier oak bookcase with 28
         colorful books & globe, beechwood A-frame easel holding a miniature painted Van Gogh
         Starry Night canvas + palette, solid oak study desk & chair + brass architect lamp,
         and wooden acoustic guitar on stand.
"""

from __future__ import annotations

import math
import os
import random
import tempfile
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = REPO_ROOT / "site" / "assets" / "models"
PREVIEW_DIR = Path(
    os.environ.get(
        "VILLA_PREVIEW_DIR",
        str(REPO_ROOT / "tools"),
    )
)


# ==============================================================================
# COLOR & PROCEDURAL TEXTURE HELPERS (Explicit `UVMap` node so `BakeUV` works!)
# ==============================================================================
def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(hex_str: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    h = hex_str.lstrip("#")
    r = srgb_to_linear(int(h[0:2], 16) / 255.0)
    g = srgb_to_linear(int(h[2:4], 16) / 255.0)
    b = srgb_to_linear(int(h[4:6], 16) / 255.0)
    return (r, g, b, alpha)


def hex_srgb_tuple(hex_str: str) -> tuple[float, float, float]:
    h = hex_str.lstrip("#")
    return (int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0)


def make_oak_plank_image(name: str = "HerringboneOakTex", size: int = 512) -> bpy.types.Image:
    """Rich warm honey-oak plank flooring texture with subtle plank seams & wood grain."""
    img = bpy.data.images.new(name=name, width=size, height=size, alpha=False)
    pixels = [1.0] * (size * size * 4)
    base_a = hex_srgb_tuple("#c89662")
    base_b = hex_srgb_tuple("#b5814e")
    seam_c = hex_srgb_tuple("#7d532d")

    for y in range(size):
        v = y / size
        plank_row = int(v * 14.0)
        row_frac = (v * 14.0) - plank_row
        row_shift = (plank_row * 0.37) % 1.0
        for x in range(size):
            u = (x / size + row_shift) % 1.0
            plank_col = int(u * 4.0)
            col_frac = (u * 4.0) - plank_col
            seed = ((plank_row * 31 + plank_col * 17) % 19) / 19.0
            grain = 0.5 + 0.5 * math.sin((u * 42.0 + math.sin(v * 90.0) * 0.12) * math.tau)
            tone = 0.88 + 0.18 * seed + 0.06 * grain

            is_seam = row_frac < 0.045 or col_frac < 0.018
            if is_seam:
                r, g, b = seam_c
            else:
                t = 0.35 + 0.45 * seed
                r = (base_a[0] * (1 - t) + base_b[0] * t) * tone
                g = (base_a[1] * (1 - t) + base_b[1] * t) * tone
                b = (base_a[2] * (1 - t) + base_b[2] * t) * tone

            idx = (y * size + x) * 4
            pixels[idx] = min(1.0, r)
            pixels[idx + 1] = min(1.0, g)
            pixels[idx + 2] = min(1.0, b)
            pixels[idx + 3] = 1.0
    img.pixels[:] = pixels
    img.pack()
    return img


def make_woven_rug_image(name: str = "NordicRugTex", size: int = 256) -> bpy.types.Image:
    """Warm cream, terracotta & starry-blue woven bohemian rug texture."""
    img = bpy.data.images.new(name=name, width=size, height=size, alpha=False)
    pixels = [1.0] * (size * size * 4)
    cream = hex_srgb_tuple("#f5ebe0")
    terra = hex_srgb_tuple("#d97757")
    gold = hex_srgb_tuple("#eab308")
    navy = hex_srgb_tuple("#3b5998")

    for y in range(size):
        ny = (y / (size - 1)) * 2.0 - 1.0
        for x in range(size):
            nx = (x / (size - 1)) * 2.0 - 1.0
            weave = 0.96 + 0.04 * math.sin(x * 1.9) * math.cos(y * 1.9)
            border = max(abs(nx), abs(ny))
            diamond = abs(nx) * 0.8 + abs(ny) * 1.1
            col = cream
            if 0.82 < border < 0.90:
                col = terra
            elif 0.74 < border < 0.78:
                col = navy
            elif abs(diamond - 0.46) < 0.045 or abs(diamond - 0.22) < 0.035:
                col = gold if abs(diamond - 0.22) < 0.035 else terra

            idx = (y * size + x) * 4
            pixels[idx] = min(1.0, col[0] * weave)
            pixels[idx + 1] = min(1.0, col[1] * weave)
            pixels[idx + 2] = min(1.0, col[2] * weave)
            pixels[idx + 3] = 1.0
    img.pixels[:] = pixels
    img.pack()
    return img


def make_starry_canvas_image(name: str = "StarryNightCanvasTex", size: int = 256) -> bpy.types.Image:
    """Miniature Van Gogh 'Starry Night' impasto painting for the bedroom studio easel!"""
    img = bpy.data.images.new(name=name, width=size, height=size, alpha=False)
    pixels = [1.0] * (size * size * 4)
    for y in range(size):
        v = y / (size - 1)
        for x in range(size):
            u = x / (size - 1)
            # Swirling Van Gogh cobalt/ultramarine sky + golden moon & stars + dark cypress!
            swirl = math.sin(u * 11.0 + math.cos(v * 9.0) * 2.2) * 0.5 + 0.5
            r = 0.08 + 0.22 * swirl
            g = 0.18 + 0.36 * swirl
            b = 0.46 + 0.42 * swirl

            # Crescent moon top-right
            dm = math.hypot(u - 0.78, v - 0.76)
            if dm < 0.14:
                glow = (1.0 - dm / 0.14) ** 1.4
                r = r * (1 - glow) + 1.0 * glow
                g = g * (1 - glow) + 0.88 * glow
                b = b * (1 - glow) + 0.28 * glow

            # Swirling central golden star halos
            for sx, sy, sr in ((0.36, 0.72, 0.09), (0.55, 0.62, 0.08), (0.22, 0.52, 0.07)):
                ds = math.hypot(u - sx, v - sy)
                if ds < sr:
                    sg = (1.0 - ds / sr) ** 1.6
                    r = min(1.0, r + 0.85 * sg)
                    g = min(1.0, g + 0.78 * sg)
                    b = min(1.0, b + 0.25 * sg)

            # Rolling flower hills & golden cottage at bottom
            hill = 0.24 + 0.06 * math.sin(u * 5.0)
            if v < hill:
                r, g, b = 0.10, 0.26 + 0.18 * swirl, 0.22
                if abs(u - 0.62) < 0.07 and abs(v - 0.16) < 0.05:
                    r, g, b = 0.98, 0.82, 0.36

            # Cypress silhouette on left
            cyp_w = 0.065 * (1.0 - v * 0.82) + 0.012 * math.sin(v * 28.0)
            if v < 0.82 and abs(u - 0.16) < cyp_w:
                r, g, b = 0.05, 0.11, 0.09

            idx = (y * size + x) * 4
            pixels[idx], pixels[idx + 1], pixels[idx + 2], pixels[idx + 3] = r, g, b, 1.0
    img.pixels[:] = pixels
    img.pack()
    return img


def make_warm_painting_image(name: str = "FloralArtTex", size: int = 192) -> bpy.types.Image:
    """Warm golden-rose botanical painting above the fireplace & headboard."""
    img = bpy.data.images.new(name=name, width=size, height=size, alpha=False)
    pixels = [1.0] * (size * size * 4)
    for y in range(size):
        v = y / (size - 1)
        for x in range(size):
            u = x / (size - 1)
            r = 0.96 - 0.10 * (1.0 - v)
            g = 0.91 - 0.12 * (1.0 - v)
            b = 0.82 - 0.10 * (1.0 - v)
            for bx, by, br, col in (
                (0.38, 0.56, 0.18, (0.94, 0.46, 0.54)),
                (0.62, 0.52, 0.16, (0.98, 0.76, 0.32)),
                (0.50, 0.38, 0.15, (0.38, 0.66, 0.92)),
                (0.50, 0.24, 0.14, (0.28, 0.62, 0.44)),
            ):
                d = math.hypot(u - bx, v - by)
                if d < br:
                    t = (1.0 - d / br) ** 1.2
                    r = r * (1 - t) + col[0] * t
                    g = g * (1 - t) + col[1] * t
                    b = b * (1 - t) + col[2] * t
            idx = (y * size + x) * 4
            pixels[idx], pixels[idx + 1], pixels[idx + 2], pixels[idx + 3] = r, g, b, 1.0
    img.pixels[:] = pixels
    img.pack()
    return img


def make_mat(
    name: str,
    color_hex: str,
    roughness: float = 0.62,
    metallic: float = 0.0,
    emission_hex: str | None = None,
    emission_strength: float = 0.0,
    image: bpy.types.Image | None = None,
    uv_scale: tuple[float, float] = (1.0, 1.0),
    alpha: float = 1.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hex_rgba(color_hex, alpha)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if alpha < 0.999:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND"

    if image is not None:
        uv_node = nodes.new("ShaderNodeUVMap")
        uv_node.uv_map = "UVMap"
        map_node = nodes.new("ShaderNodeMapping")
        map_node.inputs["Scale"].default_value = (uv_scale[0], uv_scale[1], 1.0)
        tex_node = nodes.new("ShaderNodeTexImage")
        tex_node.image = image
        links.new(uv_node.outputs["UV"], map_node.inputs["Vector"])
        links.new(map_node.outputs["Vector"], tex_node.inputs["Vector"])
        links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])

    if emission_hex and emission_strength > 0.0:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = hex_rgba(emission_hex)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = hex_rgba(emission_hex)
    return mat


# ==============================================================================
# CLEAN GEOMETRY PRIMITIVES (Beveled Clay/Timber Miniature Aesthetic!)
# ==============================================================================
def make_empty(name: str, loc: tuple[float, float, float] = (0, 0, 0), parent: bpy.types.Object | None = None) -> bpy.types.Object:
    o = bpy.data.objects.new(name, None)
    o.location = loc
    bpy.context.collection.objects.link(o)
    if parent is not None:
        o.parent = parent
    return o


def smooth_shade(obj: bpy.types.Object) -> None:
    if obj.type == "MESH":
        for p in obj.data.polygons:
            p.use_smooth = True


def add_box(
    name: str,
    center: tuple[float, float, float],
    size: tuple[float, float, float],
    mat: bpy.types.Material,
    parent: bpy.types.Object | None = None,
    bevel: float = 0.012,
    bevel_segs: int = 2,
    rot_euler: tuple[float, float, float] = (0.0, 0.0, 0.0),
    subsurf: int = 0,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    uv_layer = bm.loops.layers.uv.new("UVMap")
    # Box projection UVs so wood/rug/painting textures map cleanly without stretching!
    for f in bm.faces:
        n = f.normal
        for loop in f.loops:
            co = loop.vert.co
            if abs(n.z) > 0.7:
                loop[uv_layer].uv = (co.x / max(0.05, size[0]) + 0.5, co.y / max(0.05, size[1]) + 0.5)
            elif abs(n.y) > 0.7:
                loop[uv_layer].uv = (co.x / max(0.05, size[0]) + 0.5, co.z / max(0.05, size[2]) + 0.5)
            else:
                loop[uv_layer].uv = (co.y / max(0.05, size[1]) + 0.5, co.z / max(0.05, size[2]) + 0.5)

    mesh = bpy.data.meshes.new(f"{name}_m")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    obj.rotation_euler = rot_euler
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent

    if bevel > 0.0:
        bv = obj.modifiers.new("Bevel", "BEVEL")
        bv.width = min(bevel, min(size) * 0.32)
        bv.segments = bevel_segs
        bv.limit_method = "ANGLE"
        bv.angle_limit = math.radians(32.0)
    if subsurf > 0:
        ss = obj.modifiers.new("Subsurf", "SUBSURF")
        ss.levels = subsurf
        ss.render_levels = subsurf
    smooth_shade(obj)
    return obj


def add_cyl(
    name: str,
    center: tuple[float, float, float],
    radius: float,
    depth: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object | None = None,
    verts: int = 24,
    rot_euler: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.006,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=center, rotation=rot_euler)
    obj = bpy.context.active_object
    obj.name = name
    if obj.data.uv_layers:
        obj.data.uv_layers[0].name = "UVMap"
    obj.data.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    if bevel > 0.0:
        bv = obj.modifiers.new("Bevel", "BEVEL")
        bv.width = min(bevel, radius * 0.25, depth * 0.25)
        bv.segments = 2
    smooth_shade(obj)
    return obj


def add_cone(
    name: str,
    center: tuple[float, float, float],
    r1: float,
    r2: float,
    depth: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object | None = None,
    verts: int = 24,
    rot_euler: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=center, rotation=rot_euler)
    obj = bpy.context.active_object
    obj.name = name
    if obj.data.uv_layers:
        obj.data.uv_layers[0].name = "UVMap"
    obj.data.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    smooth_shade(obj)
    return obj


def add_sphere(
    name: str,
    center: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat: bpy.types.Material,
    parent: bpy.types.Object | None = None,
    segs: int = 20,
    rings: int = 14,
    rot_euler: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=1.0, location=center, rotation=rot_euler)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    if obj.data.uv_layers:
        obj.data.uv_layers[0].name = "UVMap"
    obj.data.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    smooth_shade(obj)
    return obj


def add_wall_with_opening(
    name: str,
    axis: str,
    fixed_coord: float,
    span_min: float,
    span_max: float,
    z_min: float,
    z_max: float,
    thickness: float,
    openings: list[tuple[float, float, float, float]],
    mat: bpy.types.Material,
    trim_mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> None:
    """
    Build a crisp solid wall along `axis` ('X' = constant Y wall spanning X; 'Y' = constant X wall spanning Y)
    with exact rectangular window/door openings `(o_min, o_max, oz_min, oz_max)` and oak frame trim!
    """
    cuts = sorted([span_min, span_max] + [c for op in openings for c in (op[0], op[1])])
    # Deduplicate close cuts
    pts = [cuts[0]]
    for c in cuts[1:]:
        if c - pts[-1] > 0.008:
            pts.append(c)

    def place_seg(s0: float, s1: float, z0: float, z1: float, m: bpy.types.Material, thick: float, tag: str) -> None:
        if s1 - s0 < 0.008 or z1 - z0 < 0.008:
            return
        sc = 0.5 * (s0 + s1)
        zc = 0.5 * (z0 + z1)
        sl = s1 - s0
        zl = z1 - z0
        if axis == "X":
            add_box(f"{name}_{tag}", (sc, fixed_coord, zc), (sl, thick, zl), m, parent=parent, bevel=0.006)
        else:
            add_box(f"{name}_{tag}", (fixed_coord, sc, zc), (thick, sl, zl), m, parent=parent, bevel=0.006)

    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        mid = 0.5 * (a + b)
        active_op = None
        for op in openings:
            if op[0] - 0.004 <= mid <= op[1] + 0.004:
                active_op = op
                break
        if active_op is None:
            place_seg(a, b, z_min, z_max, mat, thickness, f"s{i}")
        else:
            _, _, oz0, oz1 = active_op
            if oz0 > z_min + 0.01:
                place_seg(a, b, z_min, oz0, mat, thickness, f"s{i}_low")
            if oz1 < z_max - 0.01:
                place_seg(a, b, oz1, z_max, mat, thickness, f"s{i}_high")

    # Add warm oak door/window casing trim around every opening!
    ft = thickness + 0.024
    fw = 0.036
    for j, (oa, ob, oz0, oz1) in enumerate(openings):
        place_seg(oa - fw, oa, oz0, oz1 + fw, trim_mat, ft, f"trimL_{j}")
        place_seg(ob, ob + fw, oz0, oz1 + fw, trim_mat, ft, f"trimR_{j}")
        place_seg(oa - fw, ob + fw, oz1, oz1 + fw, trim_mat, ft, f"trimT_{j}")
        if oz0 > z_min + 0.05:
            place_seg(oa - fw * 1.3, ob + fw * 1.3, oz0 - 0.028, oz0, trim_mat, ft + 0.022, f"sill_{j}")


# ==============================================================================
# CYCLES MULTI-MATERIAL BAKE -> FILMIC ATLAS PACKER
# ==============================================================================
def join_and_prepare_bake_target(root_obj: bpy.types.Object, joined_name: str, island_margin: float = 0.010) -> bpy.types.Object | None:
    bpy.ops.object.select_all(action="DESELECT")
    meshes: list[bpy.types.Object] = []

    def collect(o: bpy.types.Object) -> None:
        for ch in list(o.children):
            if ch.type == "MESH":
                meshes.append(ch)
            collect(ch)

    collect(root_obj)
    if not meshes:
        return None

    for m in meshes:
        bpy.context.view_layer.objects.active = m
        m.select_set(True)
        bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
        bpy.ops.object.convert(target="MESH")
        if not m.data.uv_layers:
            m.data.uv_layers.new(name="UVMap")
        else:
            m.data.uv_layers[0].name = "UVMap"
        m.select_set(False)

    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()

    joined = bpy.context.active_object
    joined.name = joined_name

    # Clean up empty intermediate groups
    for ch in list(root_obj.children):
        if ch != joined and ch.type == "EMPTY" and len(ch.children) == 0:
            bpy.data.objects.remove(ch, do_unlink=True)

    joined.parent = root_obj
    joined.matrix_parent_inverse = root_obj.matrix_world.inverted()

    # Create non-overlapping `BakeUV` lightmap unwrap!
    bake_uv = joined.data.uv_layers.new(name="BakeUV")
    joined.data.uv_layers.active = bake_uv
    joined.data.uv_layers["UVMap"].active_render = True

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=island_margin, area_weight=0.15, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    return joined


def bake_object_to_filmic_jpeg(
    target_obj: bpy.types.Object,
    atlas_name: str,
    res: int,
    tmp_dir: Path,
    samples: int = 56,
) -> bpy.types.Image:
    scn = bpy.context.scene
    scn.cycles.samples = samples

    hdr_img = bpy.data.images.new(name=f"{atlas_name}_HDR", width=res, height=res, alpha=False, float_buffer=True)

    added_nodes: list[tuple[bpy.types.NodeTree, bpy.types.Node]] = []
    for slot in target_obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        nt = mat.node_tree
        for n in nt.nodes:
            n.select = False
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = hdr_img
        tn.select = True
        nt.nodes.active = tn
        added_nodes.append((nt, tn))

    target_obj.data.uv_layers["BakeUV"].active = True
    target_obj.data.uv_layers["UVMap"].active_render = True

    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = target_obj
    target_obj.select_set(True)
    bpy.ops.object.bake(type="COMBINED", margin=max(4, res // 256))

    # Clean up temporary bake nodes from shared materials!
    for nt, tn in added_nodes:
        nt.nodes.remove(tn)

    jpg_path = tmp_dir / f"{atlas_name}.jpg"
    hdr_img.save_render(str(jpg_path), scene=scn)
    bpy.data.images.remove(hdr_img)

    # Load Filmic-tonemapped sRGB JPEG & pack into .blend!
    baked_img = bpy.data.images.load(str(jpg_path))
    baked_img.name = atlas_name
    baked_img.pack()
    return baked_img


def finalize_baked_material(target_obj: bpy.types.Object, mat_name: str, baked_img: bpy.types.Image) -> None:
    """Replace multi-material slots with a single crisp baked atlas material using BakeUV."""
    uvs = target_obj.data.uv_layers
    if "UVMap" in uvs and "BakeUV" in uvs:
        uvs.remove(uvs["UVMap"])
    target_obj.data.uv_layers[0].name = "UVMap"
    target_obj.data.uv_layers[0].active = True
    target_obj.data.uv_layers[0].active_render = True

    mat = bpy.data.materials.new(name=mat_name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Metallic"].default_value = 0.0
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = baked_img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if "Emission Color" in bsdf.inputs:
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 1.0

    target_obj.data.materials.clear()
    target_obj.data.materials.append(mat)


# ==============================================================================
# MASTER BUILDER: TWO-BEDROOM ONE-LIVING-ROOM ("两室一厅") FAIRYTALE VILLA
# ==============================================================================
def build_storybook_cottage_glb() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rng = random.Random(20261112)

    # --------------------------------------------------------------------------
    # 1. Tactile Diorama Materials & Hand-Crafted Procedural Textures
    # --------------------------------------------------------------------------
    oak_floor_img = make_oak_plank_image("HerringboneOakTex", 512)
    rug_img = make_woven_rug_image("NordicRugTex", 256)
    starry_img = make_starry_canvas_image("StarryNightCanvasTex", 256)
    floral_img = make_warm_painting_image("FloralArtTex", 192)

    mat_plinth = make_mat("CourtyardStone", "#6b7280", roughness=0.78)
    mat_stone_light = make_mat("WarmLimestone", "#cbbfb0", roughness=0.72)
    mat_stone_moss = make_mat("MossyCobble", "#8da08e", roughness=0.76)
    mat_oak_floor = make_mat("HoneyOakFloor", "#c89662", roughness=0.44, image=oak_floor_img, uv_scale=(3.2, 2.4))
    mat_porch_deck = make_mat("CedarDeck", "#9a6338", roughness=0.58, image=oak_floor_img, uv_scale=(2.2, 1.2))

    mat_wall_ext = make_mat("CreamStuccoExt", "#eadcc6", roughness=0.74)
    mat_wall_int = make_mat("WarmIvoryInt", "#e8dcc8", roughness=0.72)
    mat_wainscot_hall = make_mat("SageWainscot", "#b8cab2", roughness=0.64)
    mat_wainscot_bed = make_mat("BlushWainscot", "#dfc4bd", roughness=0.64)
    mat_wainscot_studio = make_mat("PeriwinkleWainscot", "#b9cbe2", roughness=0.64)

    mat_timber_dark = make_mat("ExposedOakBeam", "#56351e", roughness=0.62)
    mat_timber_warm = make_mat("HoneyWalnut", "#8a5630", roughness=0.46)
    mat_timber_light = make_mat("NaturalBeech", "#c79865", roughness=0.50)

    mat_boucle = make_mat("CreamBoucleSofa", "#eadfce", roughness=0.86)
    mat_coral = make_mat("CoralVelvet", "#e26d58", roughness=0.72)
    mat_mustard = make_mat("MustardCushion", "#df9f18", roughness=0.74)
    mat_starblue = make_mat("StarryBlueQuilt", "#355e9e", roughness=0.74)
    mat_rose_fabric = make_mat("DustyRoseThrow", "#d97d8b", roughness=0.74)
    mat_sage_fabric = make_mat("SagePillow", "#6f997b", roughness=0.75)
    mat_linen_white = make_mat("CrispIvoryLinen", "#f0e7d8", roughness=0.82)
    mat_sheer_curtain = make_mat("SheerCurtain", "#efe6d5", roughness=0.68)

    mat_rug_living = make_mat("LivingRug", "#eadbc8", roughness=0.88, image=rug_img)
    mat_rug_bed = make_mat("BlushRoundRug", "#e8cbd1", roughness=0.88)
    mat_rug_studio = make_mat("JuteRoundRug", "#d5ba96", roughness=0.88)

    mat_brass = make_mat("BrushedBrass", "#dfa93e", roughness=0.30, metallic=0.80)
    mat_iron = make_mat("WroughtIron", "#2b303a", roughness=0.45, metallic=0.65)
    mat_ceramic_cream = make_mat("SageAppliance", "#cfe0d2", roughness=0.30)
    mat_porcelain = make_mat("WhitePorcelain", "#f5efe6", roughness=0.22)
    mat_vase_blue = make_mat("CeladonVase", "#7fb3d5", roughness=0.24)
    mat_copper = make_mat("WarmCopper", "#c86d44", roughness=0.30, metallic=0.78)
    mat_foliage = make_mat("LushPlantLeaf", "#356e42", roughness=0.52)
    mat_terracotta = make_mat("TerracottaPot", "#c26543", roughness=0.68)

    mat_lamp_shade = make_mat("WarmPleatedShade", "#ffe8a3", roughness=0.48, emission_hex="#ffd166", emission_strength=2.2)
    mat_fire_ember = make_mat("HearthEmbers", "#ff922b", roughness=0.35, emission_hex="#ff7b00", emission_strength=6.5)
    mat_mirror = make_mat("HaloMirrorFace", "#dce9f5", roughness=0.10, metallic=0.82, emission_hex="#fff2cc", emission_strength=0.25)
    mat_painting_starry = make_mat("StarryCanvas", "#ffffff", roughness=0.55, image=starry_img)
    mat_painting_floral = make_mat("FloralCanvas", "#ffffff", roughness=0.52, image=floral_img)
    mat_vinyl = make_mat("VinylRecord", "#1e2028", roughness=0.22, metallic=0.2)

    mat_slate_a = make_mat("SlateBlueA", "#3b4e6e", roughness=0.52)
    mat_slate_b = make_mat("SlateBlueB", "#495f85", roughness=0.50)
    mat_slate_c = make_mat("SlateLavender", "#58658c", roughness=0.54)
    mat_brick = make_mat("ChimneyBrick", "#9a4d3c", roughness=0.72)

    mat_glass_warm = make_mat(
        "WarmWindowGlass",
        "#dbeafe",
        roughness=0.12,
        emission_hex="#fde68a",
        emission_strength=0.12,
        alpha=0.16,
    )

    # --------------------------------------------------------------------------
    # 2. Scene Root & Export Hierarchy Nodes
    # --------------------------------------------------------------------------
    root = make_empty("CottageRoot", (0.0, 0.0, 0.0))
    base_node = make_empty("CottageBaseNode", (0.0, 0.0, 0.0), parent=root)
    roof_node = make_empty("CottageRoofNode", (0.0, 0.0, 0.0), parent=root)
    front_upper_node = make_empty("CottageFrontUpperNode", (0.0, 0.0, 0.0), parent=root)

    shell_grp = make_empty("ShellBakeGroup", (0.0, 0.0, 0.0), parent=base_node)
    furn_grp = make_empty("FurnitureBakeGroup", (0.0, 0.0, 0.0), parent=base_node)
    roof_grp = make_empty("RoofBakeGroup", (0.0, 0.0, 0.0), parent=roof_node)
    front_grp = make_empty("FrontUpperBakeGroup", (0.0, 0.0, 0.0), parent=front_upper_node)

    # Exact animated anchor nodes preserved directly under CottageRoot / CottageBaseNode!
    chimney_tip = make_empty("ChimneyTipNode", (2.06, -0.45, 2.78), parent=root)
    gramophone_disc_node = make_empty("GramophoneDiscNode", (1.72, -1.02, 0.565), parent=base_node)
    fireplace_ember_node = make_empty("FireplaceEmberNode", (1.76, -0.45, 0.28), parent=base_node)

    # Unbaked animated accents on those dynamic nodes:
    add_cyl("SpinningVinylDisc", (0, 0, 0), 0.105, 0.008, mat_vinyl, parent=gramophone_disc_node, verts=28, bevel=0.002)
    add_cyl("VinylGoldLabel", (0, 0, 0.005), 0.036, 0.004, mat_brass, parent=gramophone_disc_node, verts=20, bevel=0.0)
    add_sphere("GlowingFireCore", (0, 0, 0), (0.11, 0.18, 0.08), mat_fire_ember, parent=fireplace_ember_node, segs=16, rings=12)

    # ==========================================================================
    # 3. ARCHITECTURAL SHELL, COURTYARD TERRACE & `两室一厅` PARTITIONS
    # ==========================================================================
    # A. Rounded Stone Courtyard Plinth & Curb (sinks -0.22m into hillside so zero floating!)
    add_box("FoundationCore", (0.0, -0.10, -0.05), (4.76, 3.44, 0.34), mat_plinth, parent=shell_grp, bevel=0.045, bevel_segs=3)
    add_box("CourtyardTopSlab", (0.0, -0.06, 0.125), (4.58, 3.26, 0.04), mat_stone_light, parent=shell_grp, bevel=0.015)

    # Decorative stone border blocks around courtyard perimeter
    for ix in range(16):
        bx = -2.22 + ix * 0.296
        for by in (-1.70, 1.56):
            if by < 0 and -0.42 < bx < 0.72:
                continue  # Leave gap for front steps!
            m = mat_stone_light if (ix % 3 != 0) else mat_stone_moss
            add_box(f"CurbX_{ix}_{by:.1f}", (bx, by, 0.13), (0.27, 0.14, 0.08), m, parent=shell_grp, bevel=0.022)
    for iy in range(11):
        by = -1.52 + iy * 0.295
        for bx in (-2.30, 2.30):
            m = mat_stone_light if (iy % 2 == 0) else mat_stone_moss
            add_box(f"CurbY_{iy}_{bx:.1f}", (bx, by, 0.13), (0.14, 0.27, 0.08), m, parent=shell_grp, bevel=0.022)

    # B. Honey-Oak Interior Parquet Floor (`Z = 0.145` top) + Covered Cedar Front Porch!
    add_box("InteriorOakFloor", (0.0, 0.08, 0.135), (4.24, 2.80, 0.035), mat_oak_floor, parent=shell_grp, bevel=0.006)
    add_box("FrontPorchDeck", (0.18, -1.60, 0.132), (1.86, 0.56, 0.035), mat_porch_deck, parent=shell_grp, bevel=0.008)

    # 3 Wide Welcoming Limestone Entry Steps (`Y = -1.88 .. -2.30`, centered at `X = +0.16`)
    for st in range(3):
        sz = 0.09 - st * 0.065
        sy = -1.94 - st * 0.18
        sw = 0.92 + st * 0.10
        add_box(f"PorchStep_{st}", (0.16, sy, sz), (sw, 0.22, 0.08), mat_stone_light, parent=shell_grp, bevel=0.018)

    # Charming Low Timber Garden Picket Fence along Left & Right Front Yard!
    for side_seg, x0, x1 in (("FenceL", -2.18, -0.82), ("FenceR", 1.18, 2.18)):
        add_box(f"{side_seg}_RailTop", (0.5 * (x0 + x1), -1.66, 0.42), (x1 - x0, 0.032, 0.032), mat_wall_ext, parent=shell_grp, bevel=0.005)
        add_box(f"{side_seg}_RailBot", (0.5 * (x0 + x1), -1.66, 0.24), (x1 - x0, 0.032, 0.032), mat_wall_ext, parent=shell_grp, bevel=0.005)
        n_pickets = max(4, int((x1 - x0) / 0.13))
        for ip in range(n_pickets + 1):
            px = x0 + (x1 - x0) * (ip / n_pickets)
            add_box(f"{side_seg}_P_{ip}", (px, -1.66, 0.34), (0.042, 0.022, 0.36), mat_wall_ext, parent=shell_grp, bevel=0.006)

    # Red Fairytale Love-Letter Mailbox beside the front steps!
    add_cyl("MailboxPost", (-0.42, -1.92, 0.38), 0.028, 0.56, mat_timber_dark, parent=shell_grp, verts=12)
    add_box("MailboxBody", (-0.42, -1.92, 0.68), (0.16, 0.24, 0.14), mat_coral, parent=shell_grp, bevel=0.035)
    add_box("MailboxFlag", (-0.33, -1.96, 0.73), (0.018, 0.08, 0.09), mat_mustard, parent=shell_grp, bevel=0.004)

    # C. Exterior Walls (`Z = 0.15 .. 1.48` on Back, Left, Right; Split Cutaway on Front `Y = -1.32`!)
    Z_FLR = 0.15
    Z_TOP = 1.48
    Z_CUT = 0.48  # Front dado height when roof lifts open -> 100% unobstructed cutaway view!

    # 1) Back Wall (`Y = +1.46`, spanning `X in [-2.14, +2.14]`):
    add_wall_with_opening(
        "BackWall",
        axis="X",
        fixed_coord=1.46,
        span_min=-2.14,
        span_max=2.14,
        z_min=Z_FLR,
        z_max=Z_TOP,
        thickness=0.11,
        openings=[
            (0.96, 1.72, 0.72, 1.30),  # Bright Kitchen Window over sink!
        ],
        mat=mat_wall_int,
        trim_mat=mat_timber_warm,
        parent=shell_grp,
    )
    add_box("BackWallTopCap", (0.0, 1.46, Z_TOP + 0.014), (4.30, 0.13, 0.028), mat_timber_warm, parent=shell_grp, bevel=0.005)
    add_box("KitchenWinMullionV", (1.34, 1.46, 1.01), (0.022, 0.04, 0.58), mat_timber_dark, parent=shell_grp, bevel=0.003)

    # 2) Left Wall (`X = -2.12`, spanning `Y in [-1.32, +1.46]`):
    #    - Master Bedroom Bay Window (`Y in [+0.28, +1.02]`, `Z in [0.48, 1.30]`)
    #    - Starry Studio Window (`Y in [-0.96, -0.34]`, `Z in [0.56, 1.28]`)
    add_wall_with_opening(
        "LeftWall",
        axis="Y",
        fixed_coord=-2.12,
        span_min=-1.32,
        span_max=1.46,
        z_min=Z_FLR,
        z_max=Z_TOP,
        thickness=0.11,
        openings=[
            (-0.96, -0.34, 0.56, 1.28),
            (0.28, 1.02, 0.48, 1.30),
        ],
        mat=mat_wall_int,
        trim_mat=mat_timber_warm,
        parent=shell_grp,
    )
    add_box("LeftWallTopCap", (-2.12, 0.07, Z_TOP + 0.014), (0.13, 2.80, 0.028), mat_timber_warm, parent=shell_grp, bevel=0.005)
    add_box("StudioWinMullionV", (-2.12, -0.65, 0.92), (0.04, 0.022, 0.72), mat_timber_dark, parent=shell_grp, bevel=0.003)
    add_box("StudioWinMullionH", (-2.12, -0.65, 0.92), (0.04, 0.62, 0.022), mat_timber_dark, parent=shell_grp, bevel=0.003)
    add_box("BayWinMullionV", (-2.12, 0.65, 0.89), (0.04, 0.022, 0.82), mat_timber_dark, parent=shell_grp, bevel=0.003)
    # Bay window bump-out seat & cushion on Left Wall!
    add_box("MasterBaySeat", (-2.14, 0.65, 0.31), (0.34, 0.82, 0.30), mat_timber_warm, parent=shell_grp, bevel=0.014)
    add_box("MasterBayCushion", (-2.08, 0.65, 0.48), (0.26, 0.74, 0.06), mat_rose_fabric, parent=furn_grp, bevel=0.022)

    # 3) Right Wall (`X = +2.12`, spanning `Y in [-1.32, +1.46]`):
    #    - Dining Nook Panorama Window (`Y in [+0.16, +0.86]`, `Z in [0.54, 1.28]`)
    add_wall_with_opening(
        "RightWall",
        axis="Y",
        fixed_coord=2.12,
        span_min=-1.32,
        span_max=1.46,
        z_min=Z_FLR,
        z_max=Z_TOP,
        thickness=0.11,
        openings=[
            (0.16, 0.86, 0.54, 1.28),
        ],
        mat=mat_wall_int,
        trim_mat=mat_timber_warm,
        parent=shell_grp,
    )
    add_box("RightWallTopCap", (2.12, 0.07, Z_TOP + 0.014), (0.13, 2.80, 0.028), mat_timber_warm, parent=shell_grp, bevel=0.005)
    add_box("DiningWinMullionV", (2.12, 0.51, 0.91), (0.04, 0.022, 0.74), mat_timber_dark, parent=shell_grp, bevel=0.003)
    add_box("DiningWinMullionH", (2.12, 0.51, 0.91), (0.04, 0.70, 0.022), mat_timber_dark, parent=shell_grp, bevel=0.003)

    # 4) Front Wall Lower Cutaway Dado (`Y = -1.32`, `Z = 0.15 .. 0.48`, stays on `CottageBaseNode`!)
    #    Leaves front doorway opening at `X in [-0.10, +0.46]`!
    add_box("FrontDadoLeft", (-1.12, -1.32, 0.315), (2.04, 0.11, 0.33), mat_wall_ext, parent=shell_grp, bevel=0.010)
    add_box("FrontDadoRight", (1.30, -1.32, 0.315), (1.68, 0.11, 0.33), mat_wall_ext, parent=shell_grp, bevel=0.010)
    add_box("FrontDadoCapL", (-1.12, -1.32, 0.488), (2.06, 0.135, 0.028), mat_timber_warm, parent=shell_grp, bevel=0.006)
    add_box("FrontDadoCapR", (1.30, -1.32, 0.488), (1.70, 0.135, 0.028), mat_timber_warm, parent=shell_grp, bevel=0.006)
    add_box("FrontDoorThreshold", (0.18, -1.32, 0.162), (0.62, 0.15, 0.028), mat_timber_dark, parent=shell_grp, bevel=0.006)

    # Half-timber Tudor oak corner posts on `shell_grp` (back corners full height, front corners dado height)
    for cx in (-2.13, 2.13):
        add_box(f"CornerPostBack_{cx:.1f}", (cx, 1.47, 0.82), (0.13, 0.13, 1.36), mat_timber_dark, parent=shell_grp, bevel=0.010)
        add_box(f"CornerPostFrontLow_{cx:.1f}", (cx, -1.33, 0.32), (0.13, 0.13, 0.34), mat_timber_dark, parent=shell_grp, bevel=0.010)

    # D. Interior `两室一厅` Waist-Height Cutaway Partition Walls (`Z = 0.15 .. 1.04` with Warm Oak Cap!)
    #    Waist-height interior partitions (`Pearl & Co.` miniature dollhouse standard) let all 3 rooms
    #    be admired simultaneously from elevated cutaway angles with zero wall occlusion!
    Z_PART = 1.04
    # Central N-S Partition (`X = -0.18`, with open-top doorway passages into Studio & Master Bedroom!)
    for seg_tag, y0_p, y1_p in (
        ("South", -1.26, -0.84),
        ("Mid", -0.34, 0.24),
        ("North", 0.76, 1.41),
    ):
        add_box(
            f"CentralPart_{seg_tag}",
            (-0.18, 0.5 * (y0_p + y1_p), 0.5 * (Z_FLR + Z_PART)),
            (0.085, y1_p - y0_p, Z_PART - Z_FLR),
            mat_wall_int,
            parent=shell_grp,
            bevel=0.006,
        )
        add_box(
            f"CentralCap_{seg_tag}",
            (-0.18, 0.5 * (y0_p + y1_p), Z_PART + 0.014),
            (0.108, y1_p - y0_p + 0.02, 0.028),
            mat_timber_warm,
            parent=shell_grp,
            bevel=0.005,
        )
    for jamb_y in (-0.84, -0.34, 0.24, 0.76):
        add_box(
            f"DoorJamb_{jamb_y:.2f}",
            (-0.18, jamb_y, 0.5 * (Z_FLR + Z_PART)),
            (0.105, 0.032, Z_PART - Z_FLR + 0.02),
            mat_timber_warm,
            parent=shell_grp,
            bevel=0.004,
        )

    # Bedroom E-W Divider (`Y = -0.04`, separating Master Bedroom [back] & Starry Studio [front])
    add_box("BedroomDividerEW", (-1.15, -0.04, 0.5 * (Z_FLR + Z_PART)), (1.88, 0.085, Z_PART - Z_FLR), mat_wall_int, parent=shell_grp, bevel=0.006)
    add_box("BedroomDivCap", (-1.15, -0.04, Z_PART + 0.014), (1.90, 0.108, 0.028), mat_timber_warm, parent=shell_grp, bevel=0.006)

    # Interior Accent Wainscoting Panels (subtle pastel character per room!)
    add_box("WainscotMasterBack", (-1.15, 1.395, 0.42), (1.86, 0.018, 0.54), mat_wainscot_bed, parent=shell_grp, bevel=0.004)
    add_box("WainscotStudioDiv", (-1.15, -0.092, 0.42), (1.84, 0.018, 0.54), mat_wainscot_studio, parent=shell_grp, bevel=0.004)
    add_box("WainscotHallBack", (0.42, 1.395, 0.42), (1.12, 0.018, 0.54), mat_wainscot_hall, parent=shell_grp, bevel=0.004)

    # ==========================================================================
    # 4. ROOM 1 — 一厅：暖火壁炉客厅 + 开放式原木餐厨 (`X in [-0.14, +2.04]`)
    # ==========================================================================
    # 4A. Stone Hearth Fireplace & Sleek Chimney Breast (`X = +1.85, Y = -0.45`)
    add_box("HearthBaseSlab", (1.78, -0.45, 0.19), (0.58, 0.84, 0.08), mat_stone_light, parent=shell_grp, bevel=0.014)
    add_box("FireplacePillarL", (1.86, -0.74, 0.50), (0.38, 0.18, 0.58), mat_stone_light, parent=shell_grp, bevel=0.016)
    add_box("FireplacePillarR", (1.86, -0.16, 0.50), (0.38, 0.18, 0.58), mat_stone_light, parent=shell_grp, bevel=0.016)
    add_box("FireplaceBack", (1.99, -0.45, 0.50), (0.14, 0.44, 0.58), mat_iron, parent=shell_grp, bevel=0.008)
    add_box("FireplaceLintel", (1.86, -0.45, 0.72), (0.40, 0.80, 0.15), mat_stone_light, parent=shell_grp, bevel=0.016)
    add_box("FireplaceMantelOak", (1.82, -0.45, 0.82), (0.46, 0.88, 0.046), mat_timber_dark, parent=shell_grp, bevel=0.010)
    add_box("FireplaceChimneyBreast", (1.94, -0.45, 1.15), (0.24, 0.54, 0.64), mat_wall_int, parent=shell_grp, bevel=0.012)
    # Exterior brick chimney shaft rising flush to Z_TOP (`1.48`)
    add_box("ExtChimneyLower", (2.21, -0.45, 0.81), (0.26, 0.44, 1.34), mat_brick, parent=shell_grp, bevel=0.016)

    # Firewood logs + Mantel Clock + Framed Floral Painting above Fireplace!
    add_cyl("FireLog1", (1.80, -0.45, 0.26), 0.042, 0.32, mat_timber_dark, parent=furn_grp, rot_euler=(math.radians(82), 0.15, 0.0))
    add_cyl("FireLog2", (1.75, -0.44, 0.29), 0.038, 0.28, mat_timber_dark, parent=furn_grp, rot_euler=(math.radians(96), -0.22, 0.0))
    add_box("MantelClock", (1.80, -0.45, 0.90), (0.08, 0.15, 0.12), mat_brass, parent=furn_grp, bevel=0.018)
    add_cyl("MantelCandleL", (1.80, -0.74, 0.90), 0.018, 0.10, mat_porcelain, parent=furn_grp, verts=12)
    add_cyl("MantelCandleR", (1.80, -0.16, 0.90), 0.018, 0.10, mat_porcelain, parent=furn_grp, verts=12)
    # Framed Botanical Couple Painting above Mantel!
    add_box("MantelArtFrame", (1.81, -0.45, 1.16), (0.032, 0.42, 0.32), mat_timber_warm, parent=furn_grp, bevel=0.008)
    add_box("MantelArtCanvas", (1.792, -0.45, 1.16), (0.016, 0.36, 0.26), mat_painting_floral, parent=furn_grp, bevel=0.002)

    # 4B. Woven Nordic Living-Room Rug (`Z = 0.156`)
    add_box("LivingAreaRug", (0.94, -0.50, 0.156), (1.36, 1.16, 0.012), mat_rug_living, parent=furn_grp, bevel=0.004)

    # 4C. Plush Cream Bouclé L-Shaped Corner Sofa (`X in [+0.02, +1.06], Y in [-1.12, -0.06]`)
    add_box("SofaBaseMain", (0.28, -0.56, 0.24), (0.52, 1.02, 0.14), mat_timber_warm, parent=furn_grp, bevel=0.015)
    add_box("SofaBaseChaise", (0.76, -0.90, 0.24), (0.54, 0.48, 0.14), mat_timber_warm, parent=furn_grp, bevel=0.015)
    # Plump Seat Cushions
    for sy in (-0.82, -0.32):
        add_box(f"SofaSeat_{sy:.2f}", (0.31, sy, 0.35), (0.48, 0.49, 0.13), mat_boucle, parent=furn_grp, bevel=0.042, bevel_segs=3)
    add_box("SofaChaiseCushion", (0.76, -0.90, 0.35), (0.52, 0.46, 0.13), mat_boucle, parent=furn_grp, bevel=0.042, bevel_segs=3)
    # Rounded Backrest & Armrests
    add_box("SofaBackMain", (0.07, -0.58, 0.48), (0.14, 1.04, 0.36), mat_boucle, parent=furn_grp, bevel=0.045, bevel_segs=3)
    add_box("SofaBackChaise", (0.56, -1.10, 0.46), (0.98, 0.13, 0.32), mat_boucle, parent=furn_grp, bevel=0.042, bevel_segs=3)
    add_box("SofaArmNorth", (0.28, -0.06, 0.42), (0.50, 0.12, 0.24), mat_boucle, parent=furn_grp, bevel=0.040, bevel_segs=3)
    # 4 Plump Throw Pillows + Draped Rose Knit Blanket!
    for idx_p, (px, py, pz, rotz, pmat) in enumerate([
        (0.22, -0.22, 0.48, 0.25, mat_coral),
        (0.21, -0.54, 0.47, -0.12, mat_mustard),
        (0.24, -0.88, 0.48, 0.42, mat_starblue),
        (0.66, -0.96, 0.47, -0.35, mat_sage_fabric),
    ]):
        add_sphere(f"SofaPillow_{idx_p}", (px, py, pz), (0.07, 0.13, 0.12), pmat, parent=furn_grp, rot_euler=(0.18, -0.22, rotz))
    add_box("SofaDrapedBlanket", (0.88, -0.90, 0.37), (0.24, 0.48, 0.15), mat_rose_fabric, parent=furn_grp, bevel=0.045, bevel_segs=3)

    # 4D. Rounded Walnut Coffee Table + Tea Set, Rose Vase & Open Love Letter!
    add_cyl("CoffeeTableTop", (0.98, -0.46, 0.38), 0.28, 0.036, mat_timber_warm, parent=furn_grp, verts=32, bevel=0.012)
    for ang in (0.6, 2.2, 3.8, 5.3):
        add_cyl(
            f"CoffeeLeg_{ang:.1f}",
            (0.98 + math.cos(ang) * 0.18, -0.46 + math.sin(ang) * 0.18, 0.26),
            0.020,
            0.22,
            mat_timber_dark,
            parent=furn_grp,
            verts=10,
        )
    add_cyl("TeaTray", (0.95, -0.42, 0.405), 0.11, 0.014, mat_timber_light, parent=furn_grp, verts=20)
    add_sphere("CeramicTeapot", (0.93, -0.40, 0.45), (0.048, 0.048, 0.042), mat_porcelain, parent=furn_grp)
    add_cyl("Teacup1", (1.01, -0.45, 0.43), 0.022, 0.032, mat_porcelain, parent=furn_grp, verts=14)
    add_cyl("Teacup2", (0.91, -0.48, 0.43), 0.022, 0.032, mat_porcelain, parent=furn_grp, verts=14)
    add_cyl("TableRoseVase", (1.06, -0.35, 0.45), 0.028, 0.09, mat_vase_blue, parent=furn_grp, verts=14)
    add_sphere("TableRose1", (1.05, -0.34, 0.52), (0.032, 0.032, 0.028), mat_coral, parent=furn_grp)
    add_sphere("TableRose2", (1.08, -0.37, 0.51), (0.028, 0.028, 0.026), mat_rose_fabric, parent=furn_grp)
    add_box("OpenLoveBook", (0.94, -0.58, 0.41), (0.12, 0.09, 0.018), mat_linen_white, parent=furn_grp, bevel=0.004, rot_euler=(0, 0, 0.35))

    # 4E. Vintage Brass-Horn Gramophone Cabinet (`(1.72, -1.02)`) + Warm Floor Lamp + Fiddle-Leaf Fig
    add_box("GramophoneStand", (1.72, -1.02, 0.32), (0.34, 0.34, 0.34), mat_timber_dark, parent=furn_grp, bevel=0.014)
    add_box("GramophonePlinth", (1.72, -1.02, 0.525), (0.27, 0.27, 0.07), mat_timber_warm, parent=furn_grp, bevel=0.010)
    add_cone("GramophoneBrassHorn", (1.66, -0.96, 0.73), 0.022, 0.145, 0.24, mat_brass, parent=furn_grp, verts=22, rot_euler=(0.55, -0.62, 0.2))

    # Tall Warm Floor Lamp (`(0.14, +0.06)`)
    add_cyl("FloorLampBase", (0.14, 0.06, 0.165), 0.11, 0.025, mat_brass, parent=furn_grp, verts=20)
    add_cyl("FloorLampPole", (0.14, 0.06, 0.64), 0.014, 0.94, mat_brass, parent=furn_grp, verts=12)
    add_cone("FloorLampShade", (0.14, 0.06, 1.12), 0.15, 0.09, 0.22, mat_lamp_shade, parent=furn_grp, verts=24)

    # Potted Fiddle-Leaf Fig Tree (`(1.86, +0.02)`)
    add_cone("PlantPot", (1.86, 0.02, 0.27), 0.10, 0.135, 0.24, mat_terracotta, parent=furn_grp, verts=18)
    add_cyl("PlantTrunk", (1.86, 0.02, 0.52), 0.016, 0.38, mat_timber_dark, parent=furn_grp, verts=10)
    for il, (lx, ly, lz, lrz) in enumerate([
        (1.80, 0.08, 0.66, 0.4), (1.92, -0.04, 0.70, -0.6), (1.84, -0.06, 0.76, 1.4),
        (1.90, 0.09, 0.80, -1.8), (1.85, 0.02, 0.86, 0.9),
    ]):
        add_sphere(f"FigLeaf_{il}", (lx, ly, lz), (0.09, 0.06, 0.025), mat_foliage, parent=furn_grp, rot_euler=(0.25, -0.2, lrz))

    # 4F. Open Kitchen & Bistro Dining Nook (`X in [+0.20, +2.02], Y in [+0.24, +1.38]`)
    # Retro Rounded Cream Refrigerator (`(0.38, +1.18)`)
    add_box("RetroFridgeBody", (0.38, 1.18, 0.64), (0.44, 0.42, 0.98), mat_ceramic_cream, parent=furn_grp, bevel=0.048, bevel_segs=3)
    add_box("FridgeHandleTop", (0.54, 0.96, 0.88), (0.022, 0.022, 0.16), mat_brass, parent=furn_grp, bevel=0.005)
    add_box("FridgeHandleBot", (0.54, 0.96, 0.54), (0.022, 0.022, 0.24), mat_brass, parent=furn_grp, bevel=0.005)

    # Honey-Oak Kitchen Counter along Back Wall (`X in [+0.66, +2.02], Y in [+1.04, +1.38]`)
    add_box("KitchenBaseCab", (1.34, 1.21, 0.38), (1.34, 0.36, 0.46), mat_wainscot_hall, parent=furn_grp, bevel=0.012)
    add_box("KitchenOakCounter", (1.34, 1.20, 0.625), (1.38, 0.40, 0.038), mat_timber_light, parent=furn_grp, bevel=0.010)
    # Ceramic Sink + Brass Gooseneck Faucet + Cooktop + Copper Kettle
    add_box("FarmhouseSink", (1.26, 1.18, 0.615), (0.38, 0.26, 0.06), mat_porcelain, parent=furn_grp, bevel=0.012)
    add_cyl("SinkFaucetStem", (1.26, 1.32, 0.72), 0.012, 0.16, mat_brass, parent=furn_grp, verts=12)
    add_box("InductionCooktop", (1.74, 1.20, 0.648), (0.34, 0.26, 0.012), mat_iron, parent=furn_grp, bevel=0.004)
    add_cone("CopperKettle", (1.72, 1.18, 0.71), 0.065, 0.038, 0.11, mat_copper, parent=furn_grp, verts=18)

    # Floating Oak Kitchen Shelves & Jars (`X in [+0.68, +0.92]` and `[+1.76, +2.00]` flanking window!)
    for sx_s, tag_s in ((0.80, "L"), (1.88, "R")):
        add_box(f"KitchenShelf1_{tag_s}", (sx_s, 1.31, 0.94), (0.24, 0.15, 0.024), mat_timber_warm, parent=furn_grp, bevel=0.005)
        add_box(f"KitchenShelf2_{tag_s}", (sx_s, 1.31, 1.16), (0.24, 0.15, 0.024), mat_timber_warm, parent=furn_grp, bevel=0.005)
        add_cyl(f"SpiceJarA_{tag_s}", (sx_s - 0.05, 1.31, 1.00), 0.028, 0.08, mat_porcelain, parent=furn_grp, verts=12)
        add_cyl(f"SpiceJarB_{tag_s}", (sx_s + 0.05, 1.31, 1.00), 0.026, 0.07, mat_coral, parent=furn_grp, verts=12)

    # Bistro Round Dining Table for Two + Chairs + Cake + Brass Pendant Chandelier (`(1.22, +0.48)`)
    add_cyl("DiningTableTop", (1.22, 0.48, 0.56), 0.34, 0.036, mat_timber_light, parent=furn_grp, verts=32, bevel=0.012)
    add_cyl("DiningPedestal", (1.22, 0.48, 0.36), 0.042, 0.38, mat_timber_warm, parent=furn_grp, verts=16)
    add_cyl("DiningFoot", (1.22, 0.48, 0.165), 0.18, 0.028, mat_timber_warm, parent=furn_grp, verts=22)
    # Plates, Strawberry Cake & Wine Glasses
    add_cyl("CakeStand", (1.22, 0.48, 0.60), 0.085, 0.04, mat_porcelain, parent=furn_grp, verts=18)
    add_cyl("StrawberryCake", (1.22, 0.48, 0.64), 0.068, 0.055, mat_rose_fabric, parent=furn_grp, verts=18)
    add_cyl("PlateL", (1.02, 0.48, 0.585), 0.075, 0.012, mat_porcelain, parent=furn_grp, verts=18)
    add_cyl("PlateR", (1.42, 0.48, 0.585), 0.075, 0.012, mat_porcelain, parent=furn_grp, verts=18)

    for cx_d, dir_x, tag_c in ((0.76, -1.0, "ChairL"), (1.68, 1.0, "ChairR")):
        add_box(f"{tag_c}_Seat", (cx_d, 0.48, 0.38), (0.28, 0.28, 0.042), mat_boucle, parent=furn_grp, bevel=0.016)
        add_box(f"{tag_c}_Back", (cx_d + dir_x * 0.12, 0.48, 0.56), (0.04, 0.28, 0.32), mat_timber_warm, parent=furn_grp, bevel=0.012)
        for lx_o in (-0.11, 0.11):
            for ly_o in (-0.11, 0.11):
                add_cyl(f"{tag_c}_Leg_{lx_o}_{ly_o}", (cx_d + lx_o, 0.48 + ly_o, 0.265), 0.015, 0.22, mat_timber_warm, parent=furn_grp, verts=10)

    # Brass Pendant Lamp suspended over Dining Table (`Z = 1.24`)
    add_cyl("DiningLampCord", (1.22, 0.48, 1.42), 0.008, 0.34, mat_brass, parent=furn_grp, verts=8)
    add_cone("DiningPendantShade", (1.22, 0.48, 1.22), 0.17, 0.04, 0.14, mat_brass, parent=furn_grp, verts=24)
    add_sphere("DiningPendantBulb", (1.22, 0.48, 1.18), (0.055, 0.055, 0.055), mat_lamp_shade, parent=furn_grp)

    # ==========================================================================
    # 5. ROOM 2 — 主卧：浪漫星空飘窗双人卧室 (`X in [-2.04, -0.22], Y in [0.00, +1.39]`)
    # ==========================================================================
    # Plush Blush Round Bedroom Rug
    add_cyl("MasterRoundRug", (-1.12, 0.62, 0.156), 0.64, 0.012, mat_rug_bed, parent=furn_grp, verts=36, bevel=0.004)

    # Queen Upholstered Walnut Bed (`X = -1.12, Y in [+0.40, +1.36]`)
    add_box("BedWalnutFrame", (-1.12, 0.88, 0.26), (1.02, 0.98, 0.16), mat_timber_warm, parent=furn_grp, bevel=0.018)
    add_box("BedHeadboard", (-1.12, 1.35, 0.62), (1.06, 0.09, 0.68), mat_boucle, parent=furn_grp, bevel=0.036, bevel_segs=3)
    add_box("BedMattress", (-1.12, 0.86, 0.40), (0.96, 0.90, 0.16), mat_linen_white, parent=furn_grp, bevel=0.042, bevel_segs=3)
    add_box("BedFluffyDuvet", (-1.12, 0.76, 0.45), (0.98, 0.68, 0.14), mat_linen_white, parent=furn_grp, bevel=0.052, bevel_segs=3)
    add_box("BedRoseRunner", (-1.12, 0.52, 0.465), (1.00, 0.28, 0.13), mat_rose_fabric, parent=furn_grp, bevel=0.038, bevel_segs=3)
    # 4 Layered Plump Pillows + Heart Cushion
    for ip, (px_b, py_b, pz_b, p_mat) in enumerate([
        (-1.34, 1.18, 0.52, mat_linen_white),
        (-0.90, 1.18, 0.52, mat_linen_white),
        (-1.32, 1.05, 0.50, mat_rose_fabric),
        (-0.92, 1.05, 0.50, mat_mustard),
    ]):
        add_sphere(f"BedPillow_{ip}", (px_b, py_b, pz_b), (0.18, 0.10, 0.065), p_mat, parent=furn_grp, rot_euler=(0.32, 0, 0))

    # Framed Romantic Artwork above Headboard
    add_box("MasterArtFrame", (-1.12, 1.39, 1.15), (0.58, 0.03, 0.30), mat_brass, parent=furn_grp, bevel=0.006)
    add_box("MasterArtCanvas", (-1.12, 1.375, 1.15), (0.52, 0.015, 0.24), mat_painting_floral, parent=furn_grp, bevel=0.002)

    # Twin Walnut Nightstands + Glowing Pleated Bedside Lamps!
    for nx_b, ntag in ((-1.80, "L"), (-0.44, "R")):
        add_box(f"Nightstand_{ntag}", (nx_b, 1.20, 0.31), (0.28, 0.26, 0.30), mat_timber_warm, parent=furn_grp, bevel=0.014)
        add_cyl(f"BedLampBase_{ntag}", (nx_b, 1.20, 0.49), 0.045, 0.07, mat_brass, parent=furn_grp, verts=16)
        add_cone(f"BedLampShade_{ntag}", (nx_b, 1.20, 0.58), 0.085, 0.052, 0.12, mat_lamp_shade, parent=furn_grp, verts=20)

    # Soft Flowing Sheer Curtains flanking the Master Bay Window (`X = -2.02, Y = 0.26 & 1.04`)
    for cy_curt, ctag in ((0.26, "Front"), (1.04, "Back")):
        add_cyl(f"SheerCurtain_{ctag}", (-2.01, cy_curt, 0.86), 0.052, 0.90, mat_sheer_curtain, parent=furn_grp, verts=16)
    add_cyl("BayCurtainRod", (-2.01, 0.65, 1.34), 0.012, 0.96, mat_brass, parent=furn_grp, verts=10, rot_euler=(math.radians(90), 0, 0))

    # 3-Door Fluted Honey-Oak Wardrobe (`X in [-2.00, -1.36], Y in [+0.02, +0.26]`, tucked flush with waist-height partition!)
    add_box("MasterWardrobe", (-1.68, 0.14, 0.60), (0.62, 0.24, 0.88), mat_timber_light, parent=furn_grp, bevel=0.016)
    for wx_h in (-1.86, -1.66, -1.48):
        add_box(f"WardrobeDoorPanel_{wx_h:.2f}", (wx_h, 0.265, 0.60), (0.17, 0.016, 0.78), mat_boucle, parent=furn_grp, bevel=0.006)
        add_box(f"WardrobePull_{wx_h:.2f}", (wx_h + 0.06, 0.28, 0.60), (0.012, 0.018, 0.11), mat_brass, parent=furn_grp, bevel=0.003)

    # Halo-Mirror Vanity Dressing Table & Velvet Stool (`X in [-0.98, -0.46], Y in [+0.03, +0.25]`)
    add_box("VanityTableTop", (-0.72, 0.15, 0.50), (0.50, 0.24, 0.07), mat_timber_warm, parent=furn_grp, bevel=0.012)
    for vx_l in (-0.93, -0.51):
        add_cyl(f"VanityLegF_{vx_l:.2f}", (vx_l, 0.24, 0.31), 0.016, 0.32, mat_brass, parent=furn_grp, verts=10)
        add_cyl(f"VanityLegB_{vx_l:.2f}", (vx_l, 0.06, 0.31), 0.016, 0.32, mat_brass, parent=furn_grp, verts=10)
    add_cyl("VanityHaloMirror", (-0.72, 0.08, 0.73), 0.15, 0.022, mat_mirror, parent=furn_grp, verts=28, rot_euler=(math.radians(90), 0, 0))
    add_cyl("VanityVelvetStool", (-0.72, 0.34, 0.28), 0.11, 0.24, mat_coral, parent=furn_grp, verts=20)

    # ==========================================================================
    # 6. ROOM 3 — 次卧：梵高星空画室与书房卧榻 (`X in [-2.04, -0.22], Y in [-1.24, -0.08]`)
    # ==========================================================================
    add_cyl("StudioJuteRug", (-1.04, -0.68, 0.156), 0.50, 0.012, mat_rug_studio, parent=furn_grp, verts=32, bevel=0.004)

    # Cozy Single Daybed / Guest Bed along Left Wall (`X in [-2.00, -1.36], Y in [-1.18, -0.22]`)
    add_box("DaybedFrame", (-1.68, -0.70, 0.25), (0.62, 0.94, 0.16), mat_timber_light, parent=furn_grp, bevel=0.016)
    add_box("DaybedBackboardL", (-1.97, -0.70, 0.44), (0.06, 0.94, 0.34), mat_timber_light, parent=furn_grp, bevel=0.014)
    add_box("DaybedBackboardN", (-1.68, -0.25, 0.44), (0.62, 0.06, 0.34), mat_timber_light, parent=furn_grp, bevel=0.014)
    add_box("DaybedMattress", (-1.66, -0.71, 0.37), (0.56, 0.88, 0.12), mat_starblue, parent=furn_grp, bevel=0.036, bevel_segs=3)
    add_box("DaybedCreamFold", (-1.66, -0.92, 0.39), (0.57, 0.34, 0.11), mat_linen_white, parent=furn_grp, bevel=0.032, bevel_segs=3)
    add_sphere("DaybedPillow1", (-1.72, -0.36, 0.47), (0.16, 0.09, 0.07), mat_mustard, parent=furn_grp, rot_euler=(0.3, 0, 0.2))
    add_sphere("DaybedPillow2", (-1.84, -0.56, 0.46), (0.09, 0.14, 0.07), mat_coral, parent=furn_grp, rot_euler=(0.1, 0.3, 0))

    # 3-Tier Oak Bookcase with Colorful Books & Celestial Brass Globe (`Y = -0.18, X in [-1.30, -0.48]`, flush with 1.04m partition!)
    add_box("BookcaseBack", (-0.89, -0.13, 0.59), (0.80, 0.03, 0.86), mat_timber_warm, parent=furn_grp, bevel=0.006)
    for bx_s in (-1.28, -0.50):
        add_box(f"BookcaseSide_{bx_s:.2f}", (bx_s, -0.21, 0.59), (0.035, 0.20, 0.86), mat_timber_warm, parent=furn_grp, bevel=0.006)
    for sz_sh in (0.20, 0.46, 0.72, 1.01):
        add_box(f"BookShelf_{sz_sh:.2f}", (-0.89, -0.21, sz_sh), (0.80, 0.20, 0.026), mat_timber_warm, parent=furn_grp, bevel=0.005)

    book_mats = [mat_coral, mat_starblue, mat_mustard, mat_sage_fabric, mat_rose_fabric, mat_linen_white]
    for tier_idx, z_base in enumerate((0.22, 0.48, 0.74)):
        bx_cur = -1.23
        b_i = 0
        while bx_cur < -0.62:
            bw = 0.026 + rng.random() * 0.018
            bh = 0.15 + rng.random() * 0.05
            bm_c = book_mats[(tier_idx * 5 + b_i) % len(book_mats)]
            add_box(f"Book_{tier_idx}_{b_i}", (bx_cur + bw * 0.5, -0.21, z_base + bh * 0.5), (bw, 0.15, bh), bm_c, parent=furn_grp, bevel=0.004)
            bx_cur += bw + 0.006
            b_i += 1
    # Celestial Brass Globe on top of bookcase!
    add_sphere("CelestialGlobe", (-0.58, -0.21, 1.10), (0.055, 0.055, 0.055), mat_starblue, parent=furn_grp)
    add_cyl("GlobeBase", (-0.58, -0.21, 1.035), 0.038, 0.02, mat_brass, parent=furn_grp, verts=14)

    # Beechwood A-Frame Artist's Easel + Miniature Van Gogh 'Starry Night' Canvas! (`(-1.08, -0.82)`)
    easel_grp = make_empty("EaselSub", (-1.08, -0.82, 0.15), parent=furn_grp)
    easel_grp.rotation_euler = (0.0, 0.0, 0.42)
    add_box("EaselLegL", (-0.13, -0.04, 0.44), (0.028, 0.028, 0.90), mat_timber_light, parent=easel_grp, bevel=0.004, rot_euler=(0.14, 0.10, 0))
    add_box("EaselLegR", (0.13, -0.04, 0.44), (0.028, 0.028, 0.90), mat_timber_light, parent=easel_grp, bevel=0.004, rot_euler=(0.14, -0.10, 0))
    add_box("EaselLegBack", (0.0, 0.18, 0.42), (0.028, 0.028, 0.86), mat_timber_light, parent=easel_grp, bevel=0.004, rot_euler=(-0.28, 0, 0))
    add_box("EaselLedge", (0.0, -0.08, 0.44), (0.38, 0.055, 0.028), mat_timber_warm, parent=easel_grp, bevel=0.005)
    add_box("StarryCanvasBoard", (0.0, -0.06, 0.62), (0.36, 0.024, 0.32), mat_painting_starry, parent=easel_grp, bevel=0.004, rot_euler=(0.14, 0, 0))

    # Solid Oak Study Desk, Chair & Warm Brass Architect Lamp (`(-0.54, -1.00)`)
    add_box("StudyDeskTop", (-0.56, -1.02, 0.52), (0.58, 0.34, 0.036), mat_timber_light, parent=furn_grp, bevel=0.010)
    for dx_l in (-0.81, -0.31):
        for dy_l in (-1.15, -0.89):
            add_cyl(f"DeskLeg_{dx_l:.2f}_{dy_l:.2f}", (dx_l, dy_l, 0.33), 0.016, 0.35, mat_timber_warm, parent=furn_grp, verts=10)
    add_box("OpenSketchbook", (-0.56, -1.00, 0.548), (0.20, 0.14, 0.016), mat_linen_white, parent=furn_grp, bevel=0.003)
    add_cyl("DeskLampBase", (-0.36, -1.08, 0.55), 0.042, 0.02, mat_brass, parent=furn_grp, verts=14)
    add_cyl("DeskLampArm", (-0.36, -1.06, 0.65), 0.009, 0.20, mat_brass, parent=furn_grp, verts=8, rot_euler=(0.25, -0.2, 0))
    add_cone("DeskLampShade", (-0.40, -1.02, 0.72), 0.068, 0.028, 0.09, mat_lamp_shade, parent=furn_grp, verts=18, rot_euler=(0.45, -0.3, 0))
    # Desk Chair
    add_box("DeskChairSeat", (-0.56, -0.74, 0.36), (0.26, 0.25, 0.038), mat_starblue, parent=furn_grp, bevel=0.014)
    add_box("DeskChairBack", (-0.56, -0.62, 0.52), (0.26, 0.035, 0.28), mat_timber_warm, parent=furn_grp, bevel=0.010)
    for clx in (-0.66, -0.46):
        for cly in (-0.84, -0.64):
            add_cyl(f"ChairLegS_{clx:.2f}_{cly:.2f}", (clx, cly, 0.25), 0.014, 0.21, mat_timber_warm, parent=furn_grp, verts=8)

    # Wooden Acoustic Guitar leaning beside Daybed (`(-1.32, -1.10)`)
    add_sphere("GuitarBodyLow", (-1.30, -1.10, 0.32), (0.11, 0.045, 0.13), mat_timber_warm, parent=furn_grp, rot_euler=(-0.2, 0, 0.3))
    add_sphere("GuitarBodyUp", (-1.30, -1.08, 0.44), (0.085, 0.042, 0.095), mat_timber_warm, parent=furn_grp, rot_euler=(-0.2, 0, 0.3))
    add_box("GuitarNeck", (-1.30, -1.04, 0.62), (0.028, 0.022, 0.28), mat_timber_dark, parent=furn_grp, bevel=0.004, rot_euler=(-0.2, 0, 0.3))

    # ==========================================================================
    # 7. UPPER FRONT FACADE & PORCH CANOPY (`CottageFrontUpperNode` — Lifts Open!)
    # ==========================================================================
    add_wall_with_opening(
        "FrontWallUpper",
        axis="X",
        fixed_coord=-1.32,
        span_min=-2.14,
        span_max=2.14,
        z_min=Z_CUT,
        z_max=Z_TOP,
        thickness=0.11,
        openings=[
            (-1.58, -0.78, 0.60, 1.28),  # Studio Front Mullioned Window
            (-0.10, 0.46, Z_CUT, 1.34),  # Front Doorway Upper Frame
            (0.88, 1.72, 0.60, 1.28),    # Living Room Front Mullioned Window
        ],
        mat=mat_wall_ext,
        trim_mat=mat_timber_warm,
        parent=front_grp,
    )
    # Front Corner Upper Timber Posts & Mullion Crossbars!
    for cx_u in (-2.13, 2.13):
        add_box(f"CornerPostFrontUp_{cx_u:.1f}", (cx_u, -1.33, 0.985), (0.13, 0.13, 1.01), mat_timber_dark, parent=front_grp, bevel=0.010)
    for wmx, wmw in ((-1.18, 0.80), (1.30, 0.84)):
        add_box(f"FrontMullV_{wmx:.1f}", (wmx, -1.32, 0.94), (0.022, 0.04, 0.68), mat_timber_dark, parent=front_grp, bevel=0.003)
        add_box(f"FrontMullH_{wmx:.1f}", (wmx, -1.32, 0.94), (wmw, 0.04, 0.022), mat_timber_dark, parent=front_grp, bevel=0.003)

    # Sculpted Arched Oak Front Door Panel + Brass Handle + Flower Boxes + Porch Posts & Canopy!
    add_box("OakFrontDoorPanel", (0.18, -1.31, 0.75), (0.52, 0.055, 1.12), mat_timber_warm, parent=front_grp, bevel=0.012)
    add_cyl("DoorRoundWindowFrame", (0.18, -1.345, 1.02), 0.11, 0.03, mat_timber_dark, parent=front_grp, verts=22, rot_euler=(math.radians(90), 0, 0))
    add_cyl("DoorRoundGlow", (0.18, -1.352, 1.02), 0.082, 0.02, mat_lamp_shade, parent=front_grp, verts=20, rot_euler=(math.radians(90), 0, 0))
    add_sphere("DoorBrassKnob", (0.36, -1.35, 0.72), (0.022, 0.026, 0.022), mat_brass, parent=front_grp)

    # Exterior Window Flower Boxes with Blooming Roses!
    for wbx, wbtag in ((-1.18, "L"), (1.30, "R")):
        add_box(f"WindowBox_{wbtag}", (wbx, -1.43, 0.54), (0.82, 0.16, 0.12), mat_timber_dark, parent=front_grp, bevel=0.012)
        for ir in range(5):
            rx = wbx - 0.30 + ir * 0.15
            rm = mat_coral if ir % 2 == 0 else (mat_mustard if ir == 1 else mat_rose_fabric)
            add_sphere(f"BoxBloom_{wbtag}_{ir}", (rx, -1.44, 0.63), (0.065, 0.065, 0.055), rm, parent=front_grp)

    # Covered Front Porch Posts, Gabled Canopy & Twin Warm Brass Porch Lanterns!
    for ppx in (-0.64, 1.00):
        add_box(f"PorchPost_{ppx:.2f}", (ppx, -1.82, 0.76), (0.075, 0.075, 1.22), mat_timber_dark, parent=front_grp, bevel=0.008)
        add_sphere(f"PorchLantern_{ppx:.2f}", (ppx, -1.89, 1.12), (0.055, 0.055, 0.075), mat_lamp_shade, parent=front_grp)
    add_box("PorchCanopyGable", (0.18, -1.58, 1.42), (0.52, 0.54, 0.10), mat_wall_ext, parent=front_grp, bevel=0.008)
    add_box("PorchCanopySlopeL", (-0.24, -1.60, 1.48), (1.02, 0.66, 0.06), mat_slate_a, parent=front_grp, bevel=0.012, rot_euler=(0, -0.34, 0))
    add_box("PorchCanopySlopeR", (0.60, -1.60, 1.48), (1.02, 0.66, 0.06), mat_slate_b, parent=front_grp, bevel=0.012, rot_euler=(0, 0.34, 0))

    # ==========================================================================
    # 8. GABLED SLATE-SHINGLE ROOF, DORMER & UPPER CHIMNEY (`CottageRoofNode`)
    # ==========================================================================
    # Left & Right Gable Triangles (`X = -2.14` and `X = +2.14`, rising from `Z = 1.48` to ridge `Z = 2.56` at `Y = +0.07`)
    for gx, gtag in ((-2.14, "GableL"), (2.14, "GableR")):
        bm = bmesh.new()
        uv_l = bm.loops.layers.uv.new("UVMap")
        v0 = bm.verts.new((-0.055, -1.42, 1.47))
        v1 = bm.verts.new((-0.055, 1.56, 1.47))
        v2 = bm.verts.new((-0.055, 0.07, 2.54))
        v3 = bm.verts.new((0.055, -1.42, 1.47))
        v4 = bm.verts.new((0.055, 1.56, 1.47))
        v5 = bm.verts.new((0.055, 0.07, 2.54))
        faces = [
            (v0, v2, v1),
            (v3, v4, v5),
            (v0, v1, v4, v3),
            (v0, v3, v5, v2),
            (v1, v2, v5, v4),
        ]
        for fverts in faces:
            f = bm.faces.new(fverts)
            for lp in f.loops:
                lp[uv_l].uv = ((lp.vert.co.y + 1.5) / 3.0, (lp.vert.co.z - 1.47) / 1.1)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        m_g = bpy.data.meshes.new(gtag)
        bm.to_mesh(m_g)
        bm.free()
        go = bpy.data.objects.new(gtag, m_g)
        go.location = (gx, 0.0, 0.0)
        go.data.materials.append(mat_wall_ext)
        bpy.context.collection.objects.link(go)
        go.parent = roof_grp
        smooth_shade(go)

    # Front & Back Pitched Roof Decks + 168 Individual Beveled Overlapping Slate Shingles!
    # Ridge runs along X at `Y = +0.07, Z = 2.56`; eaves at `Y = -1.56, Z = 1.40` (front) & `Y = +1.70, Z = 1.40` (back)
    pitch_ang = math.atan2(2.56 - 1.40, 1.63)  # ~35.4 deg
    slope_len = math.hypot(1.63, 2.56 - 1.40)  # ~2.00 m
    add_box(
        "RoofDeckFront",
        (0.0, -0.745, 1.98),
        (4.68, slope_len, 0.075),
        mat_timber_dark,
        parent=roof_grp,
        bevel=0.014,
        rot_euler=(pitch_ang, 0, 0),
    )
    add_box(
        "RoofDeckBack",
        (0.0, 0.885, 1.98),
        (4.68, slope_len, 0.075),
        mat_timber_dark,
        parent=roof_grp,
        bevel=0.014,
        rot_euler=(-pitch_ang, 0, 0),
    )
    add_cyl("RoofRidgeBeam", (0.0, 0.07, 2.59), 0.055, 4.74, mat_brass, parent=roof_grp, verts=16, rot_euler=(0, math.radians(90), 0))

    slate_mats = [mat_slate_a, mat_slate_b, mat_slate_c]
    for side_s in (-1, 1):
        for row in range(6):
            t = (row + 0.5) / 6.0
            yc = 0.07 + side_s * (0.18 + t * 1.38)
            zc = 2.56 - (0.18 + t * 1.38) * math.tan(pitch_ang) + 0.052
            n_tiles = 15
            stagger = 0.14 if row % 2 == 1 else 0.0
            for col in range(n_tiles):
                xc = -2.12 + col * (4.24 / (n_tiles - 1)) + (stagger if col < n_tiles - 1 else 0.0)
                if abs(xc) > 2.26:
                    continue
                smat = slate_mats[(row * 7 + col) % 3]
                add_box(
                    f"Slate_{side_s}_{row}_{col}",
                    (xc, yc, zc),
                    (0.28, 0.30, 0.032),
                    smat,
                    parent=roof_grp,
                    bevel=0.009,
                    rot_euler=(-side_s * (pitch_ang - 0.05), 0, 0),
                )

    # Charming Front Dormer Window ("童话老虎窗") + Golden Star Weathervane + Upper Brick Chimney!
    add_box("DormerBody", (-1.12, -0.82, 2.10), (0.68, 0.64, 0.48), mat_wall_ext, parent=roof_grp, bevel=0.012)
    add_box("DormerGablePeak", (-1.12, -0.82, 2.35), (0.24, 0.60, 0.12), mat_wall_ext, parent=roof_grp, bevel=0.008)
    add_box("DormerWinFrame", (-1.12, -1.14, 2.10), (0.42, 0.035, 0.32), mat_timber_dark, parent=roof_grp, bevel=0.004)
    add_box("DormerGlowWin", (-1.12, -1.152, 2.10), (0.36, 0.02, 0.26), mat_lamp_shade, parent=roof_grp, bevel=0.004)
    add_box("DormerMullV", (-1.12, -1.162, 2.10), (0.020, 0.02, 0.28), mat_timber_dark, parent=roof_grp, bevel=0.002)
    add_box("DormerMullH", (-1.12, -1.162, 2.10), (0.38, 0.02, 0.020), mat_timber_dark, parent=roof_grp, bevel=0.002)
    add_box("DormerRoofL", (-1.30, -0.82, 2.40), (0.44, 0.74, 0.05), mat_slate_b, parent=roof_grp, bevel=0.010, rot_euler=(0, -0.45, 0))
    add_box("DormerRoofR", (-0.94, -0.82, 2.40), (0.44, 0.74, 0.05), mat_slate_a, parent=roof_grp, bevel=0.010, rot_euler=(0, 0.45, 0))

    add_box("ExtChimneyUpper", (2.08, -0.45, 2.08), (0.32, 0.44, 1.08), mat_brick, parent=roof_grp, bevel=0.016)
    add_box("ExtChimneyCrown", (2.08, -0.45, 2.63), (0.40, 0.52, 0.08), mat_stone_light, parent=roof_grp, bevel=0.014)
    chimney_tip.location = (2.08, -0.45, 2.68)

    add_cyl("WeathervaneMast", (0.18, 0.07, 2.76), 0.012, 0.34, mat_brass, parent=roof_grp, verts=10)
    add_sphere("WeathervaneStar", (0.18, 0.07, 2.94), (0.065, 0.025, 0.065), mat_lamp_shade, parent=roof_grp)

    # Crystal-Clear Warm Glass Panes (kept outside bake so window openings admit sky GI!)
    glass_specs = [
        ("GlassBayMaster", (-2.12, 0.65, 0.89), (0.016, 0.72, 0.80), base_node),
        ("GlassStudioSide", (-2.12, -0.65, 0.92), (0.016, 0.60, 0.70), base_node),
        ("GlassDiningSide", (2.12, 0.51, 0.91), (0.016, 0.68, 0.72), base_node),
        ("GlassKitchenBack", (1.34, 1.46, 1.01), (0.74, 0.016, 0.56), base_node),
        ("GlassFrontStudio", (-1.18, -1.32, 0.94), (0.78, 0.016, 0.66), front_upper_node),
        ("GlassFrontLiving", (1.30, -1.32, 0.94), (0.82, 0.016, 0.66), front_upper_node),
    ]
    for gname, gloc, gsz, gpar in glass_specs:
        add_box(gname, gloc, gsz, mat_glass_warm, parent=gpar, bevel=0.0)

    # ==========================================================================
    # 9. CYCLES STUDIO + WARM INTERIOR GLOBAL ILLUMINATION LIGHTING SETUP
    # ==========================================================================
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.use_denoising = False
    scn.cycles.use_adaptive_sampling = True
    scn.cycles.adaptive_threshold = 0.014
    scn.cycles.max_bounces = 3
    scn.cycles.diffuse_bounces = 2
    scn.cycles.glossy_bounces = 1
    scn.cycles.transmission_bounces = 2
    scn.cycles.sample_clamp_direct = 4.5
    scn.cycles.sample_clamp_indirect = 1.8
    scn.view_settings.view_transform = "Filmic"
    scn.view_settings.look = "Medium High Contrast"
    scn.view_settings.exposure = -0.34
    scn.render.image_settings.file_format = "JPEG"
    scn.render.image_settings.quality = 93

    # Soft Starry-Twilight Sky GI World so exterior & cutaway edges have silky blue-gold AO!
    world = bpy.data.worlds.new("FairytaleGIWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = hex_rgba("#4c6eb0")
    bg.inputs["Strength"].default_value = 0.58
    scn.world = world

    def add_area_light(lname: str, loc: tuple[float, float, float], rot: tuple[float, float, float], energy: float, size: float, col_hex: str) -> bpy.types.Object:
        bpy.ops.object.light_add(type="AREA", location=loc, rotation=rot)
        lt = bpy.context.active_object
        lt.name = lname
        lt.data.energy = energy
        lt.data.size = size
        lt.data.color = hex_rgba(col_hex)[:3]
        return lt

    def add_pt_light(lname: str, loc: tuple[float, float, float], energy: float, radius: float, col_hex: str) -> bpy.types.Object:
        bpy.ops.object.light_add(type="POINT", location=loc)
        lt = bpy.context.active_object
        lt.name = lname
        lt.data.energy = energy
        lt.data.shadow_soft_size = radius
        lt.data.color = hex_rgba(col_hex)[:3]
        return lt

    lights: list[bpy.types.Object] = [
        # Exterior Moonlit Diorama Key & Warm Fill
        add_area_light("MoonKey", (4.0, -5.0, 5.8), (0.70, 0.0, 0.62), 118.0, 4.0, "#dbeafe"),
        add_area_light("GardenWarmFill", (-4.2, -3.6, 4.0), (0.80, 0.0, -0.68), 62.0, 3.6, "#fde68a"),
        # Interior Warm Ceiling Softboxes (calibrated so zero white blowout — pure `Pearl & Co.` clay midtones!)
        add_area_light("LivingRoomSoftGI", (0.85, -0.45, 1.58), (0.0, 0.0, 0.0), 25.0, 1.45, "#ffe6ad"),
        add_area_light("KitchenDiningGI", (1.22, 0.78, 1.58), (0.0, 0.0, 0.0), 22.0, 1.25, "#ffebb8"),
        add_area_light("MasterBedroomGI", (-1.12, 0.68, 1.58), (0.0, 0.0, 0.0), 23.0, 1.30, "#ffe4b5"),
        add_area_light("StudioBedroomGI", (-1.10, -0.66, 1.58), (0.0, 0.0, 0.0), 21.0, 1.20, "#fff0c2"),
        # Cozy Focal Accent Point Lights (fireplace, bedside lamps, dining pendant, desk lamp, porch!)
        add_pt_light("FireplaceWarmPt", (1.56, -0.45, 0.42), 20.0, 0.22, "#ff9f43"),
        add_pt_light("DiningPendantPt", (1.22, 0.48, 1.06), 13.0, 0.18, "#ffd97d"),
        add_pt_light("BedLampLPt", (-1.80, 1.12, 0.66), 11.0, 0.16, "#ffd166"),
        add_pt_light("BedLampRPt", (-0.44, 1.12, 0.66), 11.0, 0.16, "#ffd166"),
        add_pt_light("StudioDeskPt", (-0.48, -0.96, 0.76), 11.0, 0.16, "#ffe082"),
        add_pt_light("PorchWelcomePt", (0.18, -1.68, 1.12), 20.0, 0.25, "#ffd166"),
    ]

    # ==========================================================================
    # 10. JOIN, BAKE CYCLES GI ATLASES & RENDER VERIFICATION PREVIEWS!
    # ==========================================================================
    shell_mesh = join_and_prepare_bake_target(shell_grp, "VillaShellBaked", island_margin=0.010)
    furn_mesh = join_and_prepare_bake_target(furn_grp, "VillaFurnitureBaked", island_margin=0.008)
    roof_mesh = join_and_prepare_bake_target(roof_grp, "VillaRoofBaked", island_margin=0.010)
    front_mesh = join_and_prepare_bake_target(front_grp, "VillaFrontUpperBaked", island_margin=0.010)

    # Re-parent joined meshes cleanly onto `CottageBaseNode` / `CottageRoofNode` / `CottageFrontUpperNode`
    for m_obj, par_node, grp_node in (
        (shell_mesh, base_node, shell_grp),
        (furn_mesh, base_node, furn_grp),
        (roof_mesh, roof_node, roof_grp),
        (front_mesh, front_upper_node, front_grp),
    ):
        m_obj.parent = par_node
        m_obj.matrix_parent_inverse = par_node.matrix_world.inverted()
        bpy.data.objects.remove(grp_node, do_unlink=True)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)

        # 1) Bake Cutaway Interior (`Shell` + `Furniture`) with Roof & FrontUpper hidden so
        #    cutaway walls & furniture receive silky skylight AO + warm indoor lamp GI!
        roof_mesh.hide_render = True
        front_mesh.hide_render = True
        for ch in list(base_node.children) + list(front_upper_node.children):
            if ch.name.startswith("Glass"):
                ch.hide_render = True

        print("[Cycles Bake 1/4] Baking 2048x2048 VillaShellAtlas...")
        shell_atlas = bake_object_to_filmic_jpeg(shell_mesh, "VillaShellAtlas", 2048, tmp_path, samples=96)

        print("[Cycles Bake 2/4] Baking 2048x2048 VillaFurnitureAtlas...")
        furn_atlas = bake_object_to_filmic_jpeg(furn_mesh, "VillaFurnitureAtlas", 2048, tmp_path, samples=96)

        # 2) Bake Exterior Roof & Front Upper Facade with full exterior silhouette active!
        roof_mesh.hide_render = False
        front_mesh.hide_render = False
        print("[Cycles Bake 3/4] Baking 1024x1024 VillaRoofAtlas...")
        roof_atlas = bake_object_to_filmic_jpeg(roof_mesh, "VillaRoofAtlas", 1024, tmp_path, samples=72)

        print("[Cycles Bake 4/4] Baking 1024x1024 VillaFrontUpperAtlas...")
        front_atlas = bake_object_to_filmic_jpeg(front_mesh, "VillaFrontUpperAtlas", 1024, tmp_path, samples=72)

        for ch in list(base_node.children) + list(front_upper_node.children):
            if ch.name.startswith("Glass"):
                ch.hide_render = False

        finalize_baked_material(shell_mesh, "VillaShellBakedMat", shell_atlas)
        finalize_baked_material(furn_mesh, "VillaFurnitureBakedMat", furn_atlas)
        finalize_baked_material(roof_mesh, "VillaRoofBakedMat", roof_atlas)
        finalize_baked_material(front_mesh, "VillaFrontUpperBakedMat", front_atlas)

        # Remove scene lights & reset ViewTransform to Standard before previewing the already Filmic-baked atlases!
        for lt in lights:
            bpy.data.objects.remove(lt, do_unlink=True)
        bg.inputs["Strength"].default_value = 0.05
        scn.view_settings.view_transform = "Standard"
        scn.view_settings.look = "None"
        scn.view_settings.exposure = 0.0

        # Render two crisp verification previews (1: Cutaway `两室一厅` Isometric, 2: Exterior Closed Roof)
        PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
        bpy.ops.object.camera_add(location=(1.65, -4.55, 4.35))
        cam = bpy.context.active_object
        direction = Vector((-0.05, 0.14, 0.42)) - cam.location
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = 35
        scn.camera = cam
        scn.render.resolution_x = 1280
        scn.render.resolution_y = 840
        scn.cycles.samples = 8
        scn.render.image_settings.file_format = "PNG"

        # Preview 1: Cutaway `两室一厅` Dollhouse Overview!
        roof_mesh.hide_render = True
        front_mesh.hide_render = True
        for ch in list(front_upper_node.children):
            ch.hide_render = True
        scn.render.filepath = str(PREVIEW_DIR / "villa_cutaway_preview.png")
        bpy.ops.render.render(write_still=True)

        # Preview 2: Closed Storybook Villa Exterior!
        roof_mesh.hide_render = False
        front_mesh.hide_render = False
        for ch in list(front_upper_node.children):
            ch.hide_render = False
        cam.location = (-2.65, -4.95, 2.35)
        direction2 = Vector((0.05, -0.15, 0.95)) - cam.location
        cam.rotation_euler = direction2.to_track_quat("-Z", "Y").to_euler()
        scn.render.filepath = str(PREVIEW_DIR / "villa_exterior_preview.png")
        bpy.ops.render.render(write_still=True)

        # Remove preview camera before clean `.glb` export!
        bpy.data.objects.remove(cam, do_unlink=True)

        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        out_glb = MODELS_DIR / "storybook_cottage.glb"
        bpy.ops.export_scene.gltf(
            filepath=str(out_glb),
            export_format="GLB",
            export_apply=True,
            export_yup=True,
            export_texcoords=True,
            export_normals=True,
            export_materials="EXPORT",
            export_image_format="AUTO",
        )
        print(f"[VILLA GLB OK] {out_glb}: {out_glb.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    build_storybook_cottage_glb()
