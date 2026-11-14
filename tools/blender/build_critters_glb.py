"""Build `site/assets/models/stylized_critters.glb` — articulated anime-stylized small wildlife for Iris Bay.

Exports 8 articulated multi-part root hierarchies (each facing -Y in Blender -> +Z in Babylon,
feet resting cleanly on Z = 0, with local joint pivots for smooth real-time runtime animation):
  - Critter_Cat      : Head, Tail (calico/cream kitty with pink inner ears & glossy anime eyes)
  - Critter_Shiba    : Head, Tail, LegFL, LegFR, LegBL, LegBR (trotting honey Shiba/Corgi pup)
  - Critter_Bunny    : Head, EarL, EarR, Tail (hopping fluffy pastel rabbit)
  - Critter_Squirrel : Head, Tail (woodland squirrel cradling a shiny acorn)
  - Critter_Seagull  : Head, WingL, WingR (coastal white gull with dark slate wingtips)
  - Critter_Dove     : Head, WingL, WingR (plump pearl plaza dove)
  - Critter_Duck     : Head, Tail (swimming call duck with sunny orange bill)
  - Critter_Crab     : ClawL, ClawR (coastal coral crab with stalked eyes & animated pincers)

Run via Blender 4.0.2:
  PYTHONPATH=/usr/lib/python3.12:/usr/lib/python3.12/lib-dynload \
    blender --python-use-system-env -b -P tools/blender/build_critters_glb.py -- \
    --qa /tmp/critters_qa.png
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from blender_kit import (  # noqa: E402
    add_tube_along_curve,
    create_mesh_object,
    make_pbr_material,
    reset_scene,
)

REPO_ROOT = ROOT.parent.parent
OUT_GLB = REPO_ROOT / "site" / "assets" / "models" / "stylized_critters.glb"
TEX_DIR = ROOT / "_tex_critters"


# ---------------------------------------------------------------------------
# Compact Painted UV Atlas & Vertex Color Helpers
# ---------------------------------------------------------------------------

def _make_critter_palette_mat(
    name: str,
    color_rgba: tuple[float, float, float, float],
    roughness: float = 0.72,
    specular: float = 0.22,
    use_vcol: bool = True,
) -> bpy.types.Material:
    mat = make_pbr_material(
        name,
        base_color=color_rgba,
        roughness=roughness,
        specular=specular,
        use_vertex_color=False,
        tint_image=False,
    )
    if use_vcol and mat.use_nodes:
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is not None:
            vcol = nt.nodes.new("ShaderNodeVertexColor")
            vcol.layer_name = "Col"
            nt.links.new(vcol.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def _col_layer(bm: bmesh.types.BMesh):
    return bm.loops.layers.color.get("Col") or bm.loops.layers.color.new("Col")


def _add_ellipsoid(
    bm: bmesh.types.BMesh,
    center: tuple[float, float, float],
    scale_xyz: tuple[float, float, float],
    rot_euler: tuple[float, float, float] = (0.0, 0.0, 0.0),
    u_segs: int = 9,
    v_rings: int = 6,
    col_rgba: tuple[float, float, float, float] = (1.0, 1.0, 1.0, 1.0),
    top_highlight: tuple[float, float, float] | None = None,
    mat_idx: int = 0,
) -> None:
    temp = bmesh.new()
    bmesh.ops.create_uvsphere(temp, u_segments=u_segs, v_segments=v_rings, radius=1.0)
    bmesh.ops.scale(temp, vec=scale_xyz, verts=temp.verts)
    rm = Euler(rot_euler, "XYZ").to_matrix().to_4x4()
    tm = Matrix.Translation(Vector(center))
    bmesh.ops.transform(temp, matrix=tm @ rm, verts=temp.verts)
    col_layer = _col_layer(temp)
    _col_layer(bm)
    cz = center[2]
    rz = max(0.01, scale_xyz[2])
    for f in temp.faces:
        f.smooth = True
        f.material_index = mat_idx
        for lp in f.loops:
            if top_highlight is not None:
                t = max(0.0, min(1.0, (lp.vert.co.z - cz) / rz * 0.5 + 0.5))
                r = col_rgba[0] * (1.0 - t) + top_highlight[0] * t
                g = col_rgba[1] * (1.0 - t) + top_highlight[1] * t
                b = col_rgba[2] * (1.0 - t) + top_highlight[2] * t
                lp[col_layer] = (r, g, b, 1.0)
            else:
                lp[col_layer] = col_rgba
    tm_m = bpy.data.meshes.new("_tmp_ce")
    temp.to_mesh(tm_m)
    temp.free()
    bm.from_mesh(tm_m)
    bpy.data.meshes.remove(tm_m)


def _add_cone_part(
    bm: bmesh.types.BMesh,
    center: tuple[float, float, float],
    r1: float,
    r2: float,
    depth: float,
    rot_euler: tuple[float, float, float] = (0.0, 0.0, 0.0),
    segs: int = 10,
    col_rgba: tuple[float, float, float, float] = (1.0, 1.0, 1.0, 1.0),
    scale_xyz: tuple[float, float, float] = (1.0, 1.0, 1.0),
) -> None:
    temp = bmesh.new()
    bmesh.ops.create_cone(temp, cap_ends=True, cap_tris=True, segments=segs, radius1=r1, radius2=max(0.001, r2), depth=depth)
    bmesh.ops.scale(temp, vec=scale_xyz, verts=temp.verts)
    rm = Euler(rot_euler, "XYZ").to_matrix().to_4x4()
    tm = Matrix.Translation(Vector(center))
    bmesh.ops.transform(temp, matrix=tm @ rm, verts=temp.verts)
    col_layer = _col_layer(temp)
    _col_layer(bm)
    for f in temp.faces:
        f.smooth = True
        for lp in f.loops:
            lp[col_layer] = col_rgba
    tm_m = bpy.data.meshes.new("_tmp_cc")
    temp.to_mesh(tm_m)
    temp.free()
    bm.from_mesh(tm_m)
    bpy.data.meshes.remove(tm_m)


def _add_colored_tube(
    bm: bmesh.types.BMesh,
    pts: list[tuple[float, float, float]],
    radii: list[float],
    radial_segs: int = 8,
    col_start: tuple[float, float, float, float] = (1.0, 1.0, 1.0, 1.0),
    col_end: tuple[float, float, float, float] | None = None,
) -> None:
    temp = bmesh.new()
    add_tube_along_curve(temp, [Vector(p) for p in pts], radii, radial_segs=radial_segs, cap_start=True, cap_end=True, mat_idx=0)
    col_layer = _col_layer(temp)
    _col_layer(bm)
    c_end = col_end if col_end is not None else col_start
    p0 = Vector(pts[0])
    p1 = Vector(pts[-1])
    span = max(1e-4, (p1 - p0).length)
    for f in temp.faces:
        f.smooth = True
        for lp in f.loops:
            t = max(0.0, min(1.0, (lp.vert.co - p0).length / span))
            r = col_start[0] * (1.0 - t) + c_end[0] * t
            g = col_start[1] * (1.0 - t) + c_end[1] * t
            b = col_start[2] * (1.0 - t) + c_end[2] * t
            lp[col_layer] = (r, g, b, 1.0)
    tm_m = bpy.data.meshes.new("_tmp_ct")
    temp.to_mesh(tm_m)
    temp.free()
    bm.from_mesh(tm_m)
    bpy.data.meshes.remove(tm_m)


def _add_wing_blade(
    bm: bmesh.types.BMesh,
    side_sign: float,
    span: float,
    root_chord: float,
    tip_chord: float,
    col_inner: tuple[float, float, float, float],
    col_tip: tuple[float, float, float, float],
    arch_z: float = 0.035,
) -> None:
    """Create a smooth 3D cambered bird wing extending from x=0 out to x=side_sign*span."""
    temp = bmesh.new()
    col_layer = _col_layer(temp)
    _col_layer(bm)
    n_span = 5
    top_rows, bot_rows = [], []
    for i in range(n_span + 1):
        u = i / n_span
        x = side_sign * u * span
        z = math.sin(u * math.pi * 0.85) * arch_z - 0.02 * (u * u)
        chord = root_chord * (1.0 - 0.72 * (u ** 1.4)) + tip_chord * (u ** 1.4)
        sweep_y = 0.04 * (u ** 1.3)
        thick = 0.016 * (1.0 - 0.85 * u) + 0.003
        # Leading (-y) -> mid -> trailing (+y)
        ys = (-chord * 0.38 + sweep_y, sweep_y, chord * 0.62 + sweep_y)
        t_row = [
            temp.verts.new((x, ys[0], z)),
            temp.verts.new((x, ys[1], z + thick)),
            temp.verts.new((x, ys[2], z - 0.004)),
        ]
        b_row = [
            t_row[0],
            temp.verts.new((x, ys[1], z - thick * 0.45)),
            t_row[2],
        ]
        top_rows.append(t_row)
        bot_rows.append(b_row)

    for i in range(n_span):
        c0 = col_tip if (i / n_span) > 0.62 else col_inner
        c1 = col_tip if ((i + 1) / n_span) > 0.62 else col_inner
        for j in range(2):
            if side_sign > 0:
                ft = temp.faces.new((top_rows[i][j], top_rows[i + 1][j], top_rows[i + 1][j + 1], top_rows[i][j + 1]))
                fb = temp.faces.new((bot_rows[i][j], bot_rows[i][j + 1], bot_rows[i + 1][j + 1], bot_rows[i + 1][j]))
            else:
                ft = temp.faces.new((top_rows[i][j], top_rows[i][j + 1], top_rows[i + 1][j + 1], top_rows[i + 1][j]))
                fb = temp.faces.new((bot_rows[i][j], bot_rows[i + 1][j], bot_rows[i + 1][j + 1], bot_rows[i][j + 1]))
            for f in (ft, fb):
                f.smooth = True
                for lp in f.loops:
                    lp[col_layer] = c1 if abs(lp.vert.co.x) > (i + 0.5) / n_span * span else c0

    bmesh.ops.recalc_face_normals(temp, faces=temp.faces)
    tm_m = bpy.data.meshes.new("_tmp_wing")
    temp.to_mesh(tm_m)
    temp.free()
    bm.from_mesh(tm_m)
    bpy.data.meshes.remove(tm_m)


def _finalize_part(
    name: str,
    bm: bmesh.types.BMesh,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    pivot_loc: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    # Ensure UV layer exists & convert BMesh BYTE_COLOR "Col" -> linear FLOAT_COLOR "Col" so glTF2 exports COLOR_0
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    if mesh.color_attributes:
        old = mesh.color_attributes[0]
        vals = [c.color[:] for c in old.data]
        mesh.color_attributes.remove(old)
        ca = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
        for i, col in enumerate(vals):
            ca.data[i].color = col
        mesh.color_attributes.active_color_index = 0
        mesh.color_attributes.render_color_index = 0
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.location = pivot_loc
    obj.parent = parent
    return obj


def _add_eyes(bm: bmesh.types.BMesh, eye_positions: list[tuple[float, float, float]], r: float, highlight_offset=(0.005, -0.006, 0.006)) -> None:
    for ex, ey, ez in eye_positions:
        _add_ellipsoid(bm, (ex, ey, ez), (r, r * 0.72, r * 1.15), u_segs=8, v_rings=6, col_rgba=(0.06, 0.06, 0.08, 1.0))
        _add_ellipsoid(
            bm,
            (ex + (highlight_offset[0] if ex >= 0 else -highlight_offset[0]) * 0.4, ey + highlight_offset[1], ez + highlight_offset[2]),
            (r * 0.36, r * 0.32, r * 0.38),
            u_segs=6,
            v_rings=4,
            col_rgba=(1.0, 1.0, 1.0, 1.0),
        )


# ---------------------------------------------------------------------------
# 8 Articulated Stylized Critters (All facing -Y in Blender -> +Z in Babylon)
# ---------------------------------------------------------------------------

def build_cat(mat: bpy.types.Material) -> bpy.types.Object:
    root = bpy.data.objects.new("Critter_Cat", None)
    bpy.context.collection.objects.link(root)

    cream = (0.98, 0.94, 0.86, 1.0)
    ginger = (0.94, 0.60, 0.32, 1.0)
    patch = (0.86, 0.48, 0.24, 1.0)
    pink = (0.98, 0.66, 0.70, 1.0)

    # Plump cozy seated kitty Body
    bm_b = bmesh.new()
    _add_ellipsoid(bm_b, (0.0, 0.02, 0.115), (0.095, 0.135, 0.105), rot_euler=(-0.22, 0.0, 0.0), col_rgba=cream, top_highlight=ginger[:3])
    _add_ellipsoid(bm_b, (0.0, -0.065, 0.13), (0.072, 0.068, 0.085), col_rgba=cream)  # fluffy chest bib
    # Calico back patch
    _add_ellipsoid(bm_b, (0.032, 0.05, 0.165), (0.062, 0.078, 0.055), col_rgba=patch)
    # 4 cute paws
    for sx in (-0.048, 0.048):
        _add_ellipsoid(bm_b, (sx, -0.085, 0.028), (0.028, 0.036, 0.026), col_rgba=cream)
        _add_ellipsoid(bm_b, (sx * 1.15, 0.075, 0.038), (0.034, 0.048, 0.036), col_rgba=ginger)
    _finalize_part("Cat_Body", bm_b, mat, root, (0.0, 0.0, 0.0))

    # Expressive Head pivot at neck (0, -0.075, 0.215)
    bm_h = bmesh.new()
    _add_ellipsoid(bm_h, (0.0, -0.015, 0.052), (0.092, 0.084, 0.078), col_rgba=ginger, top_highlight=(0.98, 0.72, 0.44))
    _add_ellipsoid(bm_h, (0.0, -0.052, 0.032), (0.064, 0.046, 0.042), col_rgba=cream)  # puffy whisker muzzle
    _add_ellipsoid(bm_h, (0.0, -0.094, 0.034), (0.012, 0.008, 0.009), col_rgba=pink)    # pink nose
    _add_ellipsoid(bm_h, (-0.052, -0.062, 0.028), (0.020, 0.010, 0.012), col_rgba=pink) # blush L/R
    _add_ellipsoid(bm_h, (0.052, -0.062, 0.028), (0.020, 0.010, 0.012), col_rgba=pink)
    for sx in (-1.0, 1.0):
        _add_cone_part(bm_h, (sx * 0.054, -0.005, 0.118), 0.032, 0.004, 0.064, rot_euler=(0.15, sx * 0.28, 0.0), col_rgba=ginger)
        _add_cone_part(bm_h, (sx * 0.054, -0.014, 0.114), 0.018, 0.003, 0.044, rot_euler=(0.15, sx * 0.28, 0.0), col_rgba=pink)
    _add_eyes(bm_h, [(-0.038, -0.084, 0.056), (0.038, -0.084, 0.056)], r=0.016)
    _finalize_part("Cat_Head", bm_h, mat, root, (0.0, -0.075, 0.215))

    # Plumed smooth S-Tail pivot at rump (0, 0.135, 0.095)
    bm_t = bmesh.new()
    _add_colored_tube(
        bm_t,
        [
            (0.0, 0.0, 0.0),
            (0.0, 0.042, 0.022),
            (0.008, 0.082, 0.068),
            (0.012, 0.108, 0.124),
            (0.005, 0.104, 0.178),
            (-0.008, 0.082, 0.215),
        ],
        [0.022, 0.024, 0.025, 0.024, 0.022, 0.016],
        radial_segs=7,
        col_start=ginger,
        col_end=cream,
    )
    _finalize_part("Cat_Tail", bm_t, mat, root, (0.0, 0.135, 0.095))
    return root


def build_shiba(mat: bpy.types.Material) -> bpy.types.Object:
    root = bpy.data.objects.new("Critter_Shiba", None)
    bpy.context.collection.objects.link(root)

    honey = (0.92, 0.58, 0.26, 1.0)
    cream = (0.98, 0.94, 0.86, 1.0)
    red_collar = (0.88, 0.24, 0.30, 1.0)
    gold_bell = (0.98, 0.84, 0.30, 1.0)

    bm_b = bmesh.new()
    _add_ellipsoid(bm_b, (0.0, 0.0, 0.215), (0.105, 0.195, 0.102), u_segs=12, v_rings=8, col_rgba=cream, top_highlight=honey[:3])
    _add_ellipsoid(bm_b, (0.0, -0.105, 0.225), (0.084, 0.082, 0.092), u_segs=11, v_rings=7, col_rgba=cream)  # fluffy chest
    _add_colored_tube(
        bm_b,
        [(-0.078, -0.112, 0.262), (0.0, -0.175, 0.246), (0.078, -0.112, 0.262)],
        [0.014, 0.016, 0.014],
        radial_segs=6,
        col_start=red_collar,
    )
    _add_ellipsoid(bm_b, (0.0, -0.192, 0.236), (0.018, 0.018, 0.018), col_rgba=gold_bell)
    _finalize_part("Shiba_Body", bm_b, mat, root, (0.0, 0.0, 0.0))

    # 4 individually hinged legs so Shiba trots naturally!
    for lname, (lx, ly) in (("Shiba_LegFL", (0.056, -0.115)), ("Shiba_LegFR", (-0.056, -0.115)), ("Shiba_LegBL", (0.058, 0.115)), ("Shiba_LegBR", (-0.058, 0.115))):
        bm_l = bmesh.new()
        _add_colored_tube(bm_l, [(0.0, 0.0, 0.0), (0.0, 0.0, -0.095), (0.0, -0.012, -0.145)], [0.032, 0.026, 0.028], radial_segs=7, col_start=honey, col_end=cream)
        _finalize_part(lname, bm_l, mat, root, (lx, ly, 0.165))

    # Head pivot
    bm_h = bmesh.new()
    _add_ellipsoid(bm_h, (0.0, -0.025, 0.055), (0.098, 0.094, 0.086), col_rgba=honey)
    _add_ellipsoid(bm_h, (0.0, -0.068, 0.026), (0.076, 0.056, 0.048), col_rgba=cream)
    _add_ellipsoid(bm_h, (0.0, -0.112, 0.036), (0.042, 0.052, 0.036), col_rgba=cream)  # snout
    _add_ellipsoid(bm_h, (0.0, -0.162, 0.044), (0.015, 0.012, 0.012), col_rgba=(0.08, 0.06, 0.06, 1.0))  # black nose
    for sx in (-1.0, 1.0):
        _add_cone_part(bm_h, (sx * 0.060, -0.005, 0.128), 0.034, 0.005, 0.068, rot_euler=(0.12, sx * 0.25, 0.0), col_rgba=honey)
        _add_ellipsoid(bm_h, (sx * 0.030, -0.096, 0.082), (0.014, 0.010, 0.009), col_rgba=cream)  # iconic Shiba cream eyebrows!
    _add_eyes(bm_h, [(-0.042, -0.104, 0.058), (0.042, -0.104, 0.058)], r=0.016)
    _finalize_part("Shiba_Head", bm_h, mat, root, (0.0, -0.135, 0.285))

    # Curly Shiba donut tail pivot
    bm_t = bmesh.new()
    _add_colored_tube(
        bm_t,
        [(0.0, 0.0, 0.0), (0.0, 0.055, 0.055), (0.012, 0.042, 0.122), (0.008, -0.022, 0.118)],
        [0.030, 0.038, 0.036, 0.026],
        radial_segs=7,
        col_start=honey,
        col_end=cream,
    )
    _finalize_part("Shiba_Tail", bm_t, mat, root, (0.0, 0.175, 0.245))
    return root


def build_bunny(mat: bpy.types.Material) -> bpy.types.Object:
    root = bpy.data.objects.new("Critter_Bunny", None)
    bpy.context.collection.objects.link(root)

    snow = (0.99, 0.97, 0.96, 1.0)
    blush = (0.98, 0.72, 0.78, 1.0)

    bm_b = bmesh.new()
    _add_ellipsoid(bm_b, (0.0, 0.015, 0.088), (0.082, 0.108, 0.078), rot_euler=(-0.18, 0.0, 0.0), col_rgba=snow)
    for sx in (-0.055, 0.055):
        _add_ellipsoid(bm_b, (sx, 0.052, 0.042), (0.034, 0.056, 0.036), col_rgba=snow)
        _add_ellipsoid(bm_b, (sx * 0.65, -0.070, 0.022), (0.022, 0.028, 0.020), col_rgba=snow)
    _finalize_part("Bunny_Body", bm_b, mat, root, (0.0, 0.0, 0.0))

    bm_h = bmesh.new()
    _add_ellipsoid(bm_h, (0.0, -0.015, 0.038), (0.066, 0.068, 0.058), col_rgba=snow)
    _add_ellipsoid(bm_h, (0.0, -0.078, 0.030), (0.012, 0.008, 0.009), col_rgba=blush)
    _add_ellipsoid(bm_h, (-0.044, -0.055, 0.024), (0.018, 0.010, 0.012), col_rgba=blush)
    _add_ellipsoid(bm_h, (0.044, -0.055, 0.024), (0.018, 0.010, 0.012), col_rgba=blush)
    _add_eyes(bm_h, [(-0.034, -0.068, 0.046), (0.034, -0.068, 0.046)], r=0.013)
    _finalize_part("Bunny_Head", bm_h, mat, root, (0.0, -0.058, 0.140))

    for ename, sx, tilt_x in (("Bunny_EarL", 1.0, 0.12), ("Bunny_EarR", -1.0, -0.08)):
        bm_e = bmesh.new()
        _add_ellipsoid(bm_e, (0.0, 0.0, 0.062), (0.022, 0.014, 0.064), rot_euler=(-0.16, sx * 0.14, 0.0), col_rgba=snow)
        _add_ellipsoid(bm_e, (0.0, -0.009, 0.056), (0.012, 0.006, 0.048), rot_euler=(-0.16, sx * 0.14, 0.0), col_rgba=blush)
        _finalize_part(ename, bm_e, mat, root, (sx * 0.028, -0.052, 0.212 + (0.002 if sx > 0 else 0.0)))

    bm_t = bmesh.new()
    _add_ellipsoid(bm_t, (0.0, 0.0, 0.0), (0.036, 0.036, 0.036), col_rgba=snow)
    _finalize_part("Bunny_Tail", bm_t, mat, root, (0.0, 0.118, 0.068))
    return root


def build_squirrel(mat: bpy.types.Material) -> bpy.types.Object:
    root = bpy.data.objects.new("Critter_Squirrel", None)
    bpy.context.collection.objects.link(root)

    russet = (0.82, 0.44, 0.20, 1.0)
    cream = (0.98, 0.90, 0.78, 1.0)
    acorn_cap = (0.48, 0.28, 0.14, 1.0)
    acorn_nut = (0.84, 0.62, 0.30, 1.0)

    bm_b = bmesh.new()
    _add_ellipsoid(bm_b, (0.0, 0.01, 0.088), (0.056, 0.062, 0.074), rot_euler=(-0.28, 0.0, 0.0), col_rgba=russet)
    _add_ellipsoid(bm_b, (0.0, -0.028, 0.088), (0.038, 0.036, 0.052), col_rgba=cream)
    for sx in (-0.034, 0.034):
        _add_ellipsoid(bm_b, (sx, 0.018, 0.024), (0.022, 0.040, 0.018), col_rgba=russet)
        _add_ellipsoid(bm_b, (sx * 0.78, -0.054, 0.105), (0.016, 0.024, 0.014), col_rgba=russet)
    # Little golden acorn clutched in paws
    _add_ellipsoid(bm_b, (0.0, -0.072, 0.104), (0.020, 0.020, 0.024), col_rgba=acorn_nut)
    _add_ellipsoid(bm_b, (0.0, -0.072, 0.122), (0.022, 0.022, 0.012), col_rgba=acorn_cap)
    _finalize_part("Squirrel_Body", bm_b, mat, root, (0.0, 0.0, 0.0))

    bm_h = bmesh.new()
    _add_ellipsoid(bm_h, (0.0, -0.012, 0.032), (0.048, 0.052, 0.044), col_rgba=russet)
    _add_ellipsoid(bm_h, (0.0, -0.048, 0.024), (0.030, 0.028, 0.024), col_rgba=cream)
    for sx in (-1.0, 1.0):
        _add_cone_part(bm_h, (sx * 0.032, 0.002, 0.076), 0.018, 0.003, 0.042, rot_euler=(0.08, sx * 0.18, 0.0), col_rgba=russet)
    _add_eyes(bm_h, [(-0.028, -0.048, 0.038), (0.028, -0.048, 0.038)], r=0.012)
    _finalize_part("Squirrel_Head", bm_h, mat, root, (0.0, -0.028, 0.148))

    # Big signature fluffy S-tail
    bm_t = bmesh.new()
    _add_colored_tube(
        bm_t,
        [(0.0, 0.0, 0.0), (0.0, 0.068, 0.055), (0.0, 0.095, 0.165), (0.0, 0.048, 0.255), (0.0, -0.008, 0.220)],
        [0.028, 0.052, 0.068, 0.056, 0.030],
        radial_segs=8,
        col_start=russet,
        col_end=cream,
    )
    _finalize_part("Squirrel_Tail", bm_t, mat, root, (0.0, 0.055, 0.055))
    return root


def build_seagull(mat: bpy.types.Material) -> bpy.types.Object:
    root = bpy.data.objects.new("Critter_Seagull", None)
    bpy.context.collection.objects.link(root)

    white = (0.98, 0.99, 1.00, 1.0)
    slate = (0.58, 0.66, 0.76, 1.0)
    tip_dark = (0.20, 0.24, 0.30, 1.0)
    beak = (0.98, 0.72, 0.18, 1.0)

    bm_b = bmesh.new()
    _add_ellipsoid(bm_b, (0.0, 0.0, 0.082), (0.068, 0.145, 0.062), col_rgba=white, top_highlight=slate[:3])
    # Tail fan
    _add_cone_part(bm_b, (0.0, 0.165, 0.085), 0.052, 0.010, 0.095, rot_euler=(1.42, 0.0, 0.0), scale_xyz=(1.3, 0.25, 1.0), col_rgba=white)
    # Neat orange legs
    for sx in (-0.026, 0.026):
        _add_colored_tube(bm_b, [(sx, 0.0, 0.045), (sx, 0.0, 0.005)], [0.009, 0.008], radial_segs=5, col_start=beak)
    _finalize_part("Seagull_Body", bm_b, mat, root, (0.0, 0.0, 0.0))

    bm_h = bmesh.new()
    _add_ellipsoid(bm_h, (0.0, -0.020, 0.022), (0.044, 0.050, 0.042), col_rgba=white)
    _add_cone_part(bm_h, (0.0, -0.086, 0.016), 0.016, 0.004, 0.064, rot_euler=(math.pi * 0.52, 0.0, 0.0), col_rgba=beak)
    _add_eyes(bm_h, [(-0.032, -0.044, 0.030), (0.032, -0.044, 0.030)], r=0.009)
    _finalize_part("Seagull_Head", bm_h, mat, root, (0.0, -0.115, 0.112))

    for wname, sgn in (("Seagull_WingL", 1.0), ("Seagull_WingR", -1.0)):
        bm_w = bmesh.new()
        _add_wing_blade(bm_w, sgn, span=0.34, root_chord=0.145, tip_chord=0.042, col_inner=slate, col_tip=tip_dark, arch_z=0.042)
        _finalize_part(wname, bm_w, mat, root, (sgn * 0.055, -0.020, 0.115))
    return root


def build_dove(mat: bpy.types.Material) -> bpy.types.Object:
    root = bpy.data.objects.new("Critter_Dove", None)
    bpy.context.collection.objects.link(root)

    pearl = (0.99, 0.98, 0.96, 1.0)
    wing_soft = (0.92, 0.93, 0.96, 1.0)
    coral = (0.95, 0.56, 0.50, 1.0)

    bm_b = bmesh.new()
    _add_ellipsoid(bm_b, (0.0, 0.0, 0.072), (0.056, 0.092, 0.056), rot_euler=(-0.18, 0.0, 0.0), col_rgba=pearl)
    _add_cone_part(bm_b, (0.0, 0.105, 0.068), 0.038, 0.008, 0.068, rot_euler=(1.25, 0.0, 0.0), scale_xyz=(1.2, 0.25, 1.0), col_rgba=wing_soft)
    for sx in (-0.020, 0.020):
        _add_colored_tube(bm_b, [(sx, 0.0, 0.038), (sx, 0.0, 0.004)], [0.007, 0.007], radial_segs=5, col_start=coral)
    _finalize_part("Dove_Body", bm_b, mat, root, (0.0, 0.0, 0.0))

    bm_h = bmesh.new()
    _add_ellipsoid(bm_h, (0.0, -0.012, 0.024), (0.038, 0.040, 0.038), col_rgba=pearl)
    _add_cone_part(bm_h, (0.0, -0.055, 0.022), 0.010, 0.003, 0.032, rot_euler=(math.pi * 0.54, 0.0, 0.0), col_rgba=(0.96, 0.72, 0.42, 1.0))
    _add_eyes(bm_h, [(-0.026, -0.032, 0.028), (0.026, -0.032, 0.028)], r=0.008)
    _finalize_part("Dove_Head", bm_h, mat, root, (0.0, -0.072, 0.112))

    for wname, sgn in (("Dove_WingL", 1.0), ("Dove_WingR", -1.0)):
        bm_w = bmesh.new()
        _add_wing_blade(bm_w, sgn, span=0.20, root_chord=0.105, tip_chord=0.032, col_inner=pearl, col_tip=wing_soft, arch_z=0.024)
        _finalize_part(wname, bm_w, mat, root, (sgn * 0.046, -0.012, 0.095))
    return root


def build_duck(mat: bpy.types.Material) -> bpy.types.Object:
    root = bpy.data.objects.new("Critter_Duck", None)
    bpy.context.collection.objects.link(root)

    snow = (0.99, 0.98, 0.94, 1.0)
    cream = (0.96, 0.92, 0.80, 1.0)
    bill = (0.98, 0.62, 0.16, 1.0)

    bm_b = bmesh.new()
    _add_ellipsoid(bm_b, (0.0, 0.01, 0.068), (0.088, 0.135, 0.068), col_rgba=cream, top_highlight=snow[:3])
    # Cozy folded wing bumps on flanks
    for sx in (-0.072, 0.072):
        _add_ellipsoid(bm_b, (sx, 0.02, 0.086), (0.028, 0.085, 0.042), rot_euler=(-0.10, 0.0, 0.0), col_rgba=snow)
    _finalize_part("Duck_Body", bm_b, mat, root, (0.0, 0.0, 0.0))

    bm_h = bmesh.new()
    _add_colored_tube(bm_h, [(0.0, 0.0, 0.0), (0.0, -0.012, 0.052)], [0.038, 0.034], radial_segs=8, col_start=snow)
    _add_ellipsoid(bm_h, (0.0, -0.018, 0.084), (0.048, 0.052, 0.046), col_rgba=snow)
    _add_ellipsoid(bm_h, (0.0, -0.075, 0.072), (0.028, 0.036, 0.013), col_rgba=bill)  # cute flat orange duck bill
    _add_eyes(bm_h, [(-0.036, -0.045, 0.092), (0.036, -0.045, 0.092)], r=0.010)
    _finalize_part("Duck_Head", bm_h, mat, root, (0.0, -0.095, 0.095))

    bm_t = bmesh.new()
    _add_cone_part(bm_t, (0.0, 0.022, 0.016), 0.032, 0.008, 0.056, rot_euler=(0.72, 0.0, 0.0), col_rgba=snow)
    _finalize_part("Duck_Tail", bm_t, mat, root, (0.0, 0.125, 0.085))
    return root


def build_crab(mat: bpy.types.Material) -> bpy.types.Object:
    root = bpy.data.objects.new("Critter_Crab", None)
    bpy.context.collection.objects.link(root)

    coral = (0.94, 0.34, 0.24, 1.0)
    peach = (0.99, 0.66, 0.50, 1.0)

    bm_b = bmesh.new()
    _add_ellipsoid(bm_b, (0.0, 0.0, 0.044), (0.084, 0.064, 0.032), col_rgba=peach, top_highlight=coral[:3])
    # Cute compact eye stalks
    for sx in (-0.024, 0.024):
        _add_colored_tube(bm_b, [(sx, -0.040, 0.060), (sx * 1.05, -0.052, 0.084)], [0.006, 0.005], radial_segs=5, col_start=coral)
    _add_eyes(bm_b, [(-0.025, -0.056, 0.088), (0.025, -0.056, 0.088)], r=0.008)
    # 6 arched scuttling crab legs (3 per side)
    for sx in (-1.0, 1.0):
        for ly in (-0.020, 0.008, 0.034):
            _add_colored_tube(
                bm_b,
                [(sx * 0.066, ly, 0.038), (sx * 0.118, ly * 1.15, 0.046), (sx * 0.138, ly * 1.25, 0.004)],
                [0.010, 0.008, 0.005],
                radial_segs=5,
                col_start=coral,
                col_end=peach,
            )
    _finalize_part("Crab_Body", bm_b, mat, root, (0.0, 0.0, 0.0))

    # Cheerful waving forked pincer arms
    for cname, sgn in (("Crab_ClawL", 1.0), ("Crab_ClawR", -1.0)):
        bm_c = bmesh.new()
        _add_colored_tube(bm_c, [(0.0, 0.0, 0.0), (sgn * 0.036, -0.035, 0.018), (sgn * 0.024, -0.064, 0.045)], [0.011, 0.012, 0.015], radial_segs=6, col_start=coral)
        _add_cone_part(bm_c, (sgn * 0.012, -0.082, 0.056), 0.016, 0.004, 0.036, rot_euler=(1.1, 0.0, -sgn * 0.35), col_rgba=coral)
        _add_cone_part(bm_c, (sgn * 0.028, -0.078, 0.048), 0.011, 0.003, 0.028, rot_euler=(1.3, 0.0, sgn * 0.25), col_rgba=peach)
        _finalize_part(cname, bm_c, mat, root, (sgn * 0.060, -0.038, 0.044))
    return root


# ---------------------------------------------------------------------------
# Export & QA Render
# ---------------------------------------------------------------------------

def build_all_critters() -> list[bpy.types.Object]:
    reset_scene()
    mat = _make_critter_palette_mat("CritterMat_Base", (1.0, 1.0, 1.0, 1.0), roughness=0.70, specular=0.18, use_vcol=True)
    roots = [
        build_cat(mat),
        build_shiba(mat),
        build_bunny(mat),
        build_squirrel(mat),
        build_seagull(mat),
        build_dove(mat),
        build_duck(mat),
        build_crab(mat),
    ]
    return roots


def render_qa_sheet(roots: list[bpy.types.Object], out_png: Path) -> None:
    positions = [
        ("Critter_Cat", (-1.15, 0.0, 0.0)),
        ("Critter_Shiba", (-0.62, 0.0, 0.0)),
        ("Critter_Bunny", (-0.18, 0.0, 0.0)),
        ("Critter_Squirrel", (0.20, 0.0, 0.0)),
        ("Critter_Seagull", (0.68, 0.0, 0.14)),
        ("Critter_Dove", (1.16, 0.0, 0.0)),
        ("Critter_Duck", (-0.42, -0.58, 0.0)),
        ("Critter_Crab", (0.38, -0.58, 0.0)),
    ]
    for name, pos in positions:
        obj = bpy.data.objects.get(name)
        if obj:
            obj.location = pos
            obj.rotation_euler = (0.0, 0.0, math.radians(-28))

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 640
    scene.view_settings.view_transform = "Standard"

    world = bpy.data.worlds.new("CritterQA")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.80, 0.94, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9

    sun = bpy.data.lights.new("Sun", type="SUN")
    sun.energy = 1.65
    sun_o = bpy.data.objects.new("Sun", sun)
    bpy.context.collection.objects.link(sun_o)
    sun_o.rotation_euler = (math.radians(48), 0.0, math.radians(-30))

    cam_d = bpy.data.cameras.new("Cam")
    cam_d.lens = 38
    cam_o = bpy.data.objects.new("Cam", cam_d)
    bpy.context.collection.objects.link(cam_o)
    cam_o.location = (0.0, -3.55, 0.92)
    cam_o.rotation_euler = (Vector((0.0, -0.1, 0.12)) - cam_o.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_o

    out_png.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(OUT_GLB))
    parser.add_argument("--qa", default="")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    args = parser.parse_args(argv)

    roots = build_all_critters()
    export_objs = list(roots)
    for r in roots:
        export_objs.extend(list(r.children))

    out_path = Path(args.out)
    bpy.ops.object.select_all(action="DESELECT")
    for o in export_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = export_objs[0]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        use_selection=True,
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_normals=True,
        export_colors=True,
        export_attributes=True,
        export_materials="EXPORT",
    )
    print(f"[critters] Exported {out_path} -> {out_path.stat().st_size // 1024} KB ({out_path.stat().st_size:,} bytes)")

    if args.qa:
        render_qa_sheet(roots, Path(args.qa))
        print(f"[critters] QA render -> {args.qa}")


if __name__ == "__main__":
    main()
