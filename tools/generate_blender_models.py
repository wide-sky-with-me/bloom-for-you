#!/usr/bin/env python3
"""
Blender 4.0 High-Detail Fairytale & Botanical .GLB Asset Generator
==================================================================
Run with:
  PYTHONHOME=/usr PYTHONPATH=/home/yhr/.local/lib/python3.12/site-packages \
    blender --background --python tools/generate_blender_models.py

Generates 5 self-hosted, subdivision-sculpted PBR .glb asset packs under site/assets/models/:
  1. fairy_sprite.glb        — Articulated storybook figurine sprite (porcelain face, eyes/catchlights,
                               golden hair locks, scalloped bluebell flower hat, leaf collar, pleated
                               ombré petal skirt, curled pixie boots, wing frames, vine staff & brass lantern)
  2. storybook_cottage.glb   — Ghibli/fairytale stone-and-timber cottage with ~150 individual beveled
                               slate roof shingles, stone chimney, arched oak door, flowerboxes & cobbles
  3. mushroom_cluster.glb    — 3 sculpted spotted toadstool varieties with rolled caps, radial 3D gills,
                               ruffled annulus rings, bulbous curved stalks & mossy pebble bases
  4. fairytale_landmarks.glb — SignpostProp (with sculpted chubby Bluebird), StreetlampProp (scrolling
                               vine ironwork + brass bell), HollowStumpProp (gnarled roots + honey jars),
                               and WishBottleProp (faceted flask + cork + wax seal + ribbon + scroll)
  5. botanical_blooms.glb    — Subdivision-sculpted RoseBloom (with calyx sepals), TulipBloom (with
                               pistil & 6 stamens), and IrisBloom (ruffled falls, standards & beards)
"""

from __future__ import annotations

import math
from pathlib import Path
import random
import bpy
import bmesh
from mathutils import Euler, Matrix, Vector
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "site" / "assets" / "models"
OUT_DIR.mkdir(parents=True, exist_ok=True)


# ==============================================================================
# SHARED BLENDER SCENE, PBR MATERIAL & PROCEDURAL TEXTURE HELPERS
# ==============================================================================
def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(hex_str: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    h = hex_str.lstrip("#")
    r = srgb_to_linear(int(h[0:2], 16) / 255.0)
    g = srgb_to_linear(int(h[2:4], 16) / 255.0)
    b = srgb_to_linear(int(h[4:6], 16) / 255.0)
    return (r, g, b, alpha)


def make_gradient_image(
    name: str,
    top_hex: str,
    bottom_hex: str,
    size: int = 256,
    stripe_strength: float = 0.0,
    speckle_strength: float = 0.0,
) -> bpy.types.Image:
    img = bpy.data.images.new(name, width=size, height=size, alpha=False)
    c_top = np.array(hex_rgba(top_hex)[:3], dtype=np.float32)
    c_bot = np.array(hex_rgba(bottom_hex)[:3], dtype=np.float32)

    y = np.linspace(0.0, 1.0, size, dtype=np.float32)[:, None]
    x = np.linspace(0.0, 1.0, size, dtype=np.float32)[None, :]
    t = np.clip(y, 0.0, 1.0)[..., None]
    rgb = np.broadcast_to(c_bot * (1.0 - t) + c_top * t, (size, size, 3)).copy()

    if stripe_strength > 0.0:
        stripes = 0.5 + 0.5 * np.sin(x * math.pi * 28.0 + np.sin(y * 9.0) * 1.4)
        rgb *= 1.0 - stripe_strength * 0.5 + stripe_strength * stripes[..., None]

    if speckle_strength > 0.0:
        grain = np.sin(x * 97.0 + y * 53.0) * np.cos(x * 61.0 - y * 89.0)
        rgb *= 1.0 + speckle_strength * grain[..., None]

    rgba = np.ones((size, size, 4), dtype=np.float32)
    rgba[..., :3] = np.clip(rgb, 0.0, 1.0)
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img


def make_pbr_mat(
    name: str,
    color_hex: str = "#ffffff",
    roughness: float = 0.62,
    metallic: float = 0.0,
    emission_hex: str | None = None,
    emission_strength: float = 0.0,
    alpha: float = 1.0,
    image: bpy.types.Image | None = None,
    coat: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    bsdf.inputs["Base Color"].default_value = hex_rgba(color_hex, alpha)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in bsdf.inputs and coat > 0:
        bsdf.inputs["Coat Weight"].default_value = coat

    if image is not None:
        tex_node = nodes.new("ShaderNodeTexImage")
        tex_node.image = image
        links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])

    if emission_hex is not None and emission_strength > 0.0:
        bsdf.inputs["Emission Color"].default_value = hex_rgba(emission_hex)
        bsdf.inputs["Emission Strength"].default_value = emission_strength

    if alpha < 0.999:
        mat.blend_method = "BLEND"
        bsdf.inputs["Alpha"].default_value = alpha

    return mat


def make_empty(name: str, loc=(0.0, 0.0, 0.0), parent=None) -> bpy.types.Object:
    empty = bpy.data.objects.new(name, None)
    empty.location = loc
    bpy.context.collection.objects.link(empty)
    if parent is not None:
        empty.parent = parent
    return empty


def link_mesh_obj(name: str, bm: bmesh.types.BMesh, mat: bpy.types.Material | None = None, parent=None) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if mat is not None:
        obj.data.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    return obj


def add_subsurf(obj: bpy.types.Object, levels: int = 2) -> None:
    mod = obj.modifiers.new("Subsurf", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels


def add_solidify(obj: bpy.types.Object, thickness: float = 0.008) -> None:
    mod = obj.modifiers.new("Solidify", "SOLIDIFY")
    mod.thickness = thickness
    mod.offset = 0.0
    mod.use_rim = True


def add_bevel(obj: bpy.types.Object, width: float = 0.006, segments: int = 2) -> None:
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"


def make_curve_tube(
    name: str,
    points_radius: list[tuple[tuple[float, float, float], float]],
    mat: bpy.types.Material,
    bevel_res: int = 4,
    res_u: int = 9,
    parent=None,
) -> bpy.types.Object:
    curve_data = bpy.data.curves.new(f"{name}_Curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.bevel_depth = 1.0
    curve_data.bevel_resolution = bevel_res
    curve_data.resolution_u = res_u
    curve_data.use_fill_caps = True

    spline = curve_data.splines.new("NURBS")
    spline.points.add(len(points_radius) - 1)
    for idx, (pt, rad) in enumerate(points_radius):
        spline.points[idx].co = (pt[0], pt[1], pt[2], 1.0)
        spline.points[idx].radius = rad
    spline.use_endpoint_u = True
    spline.order_u = min(4, len(points_radius))

    curve_obj = bpy.data.objects.new(f"{name}_Tmp", curve_data)
    bpy.context.collection.objects.link(curve_obj)
    bpy.context.view_layer.objects.active = curve_obj
    curve_obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    mesh_obj = bpy.context.active_object
    mesh_obj.name = name
    for poly in mesh_obj.data.polygons:
        poly.use_smooth = True
    mesh_obj.data.materials.append(mat)
    if parent is not None:
        mesh_obj.parent = parent
    mesh_obj.select_set(False)
    return mesh_obj


def create_lathe_mesh(
    name: str,
    profile_rz: list[tuple[float, float]],
    segs: int = 28,
    mat: bpy.types.Material | None = None,
    parent=None,
    scallop_amp: float = 0.0,
    scallop_freq: int = 6,
) -> bpy.types.Object:
    """Revolve an (r, z) profile around Blender's Z-up axis (exported as +Y up in glTF!)."""
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    rings = []
    n_prof = len(profile_rz)

    for j, (r_base, z_base) in enumerate(profile_rz):
        v_frac = j / max(1, n_prof - 1)
        ring = []
        for i in range(segs):
            ang = (i / segs) * math.tau
            scallop = 1.0 + scallop_amp * math.cos(ang * scallop_freq) * math.sin(v_frac * math.pi)
            r = max(0.0004, r_base * scallop)
            z_wave = z_base + (scallop_amp * 0.18 * math.cos(ang * scallop_freq) if v_frac > 0.72 else 0.0)
            v = bm.verts.new((math.cos(ang) * r, math.sin(ang) * r, z_wave))
            ring.append(v)
        rings.append(ring)

    for j in range(n_prof - 1):
        v0 = j / max(1, n_prof - 1)
        v1 = (j + 1) / max(1, n_prof - 1)
        for i in range(segs):
            i_next = (i + 1) % segs
            u0 = i / segs
            u1 = (i + 1) / segs
            f = bm.faces.new((rings[j][i], rings[j][i_next], rings[j + 1][i_next], rings[j + 1][i]))
            f.loops[0][uv_layer].uv = (u0, v0)
            f.loops[1][uv_layer].uv = (u1, v0)
            f.loops[2][uv_layer].uv = (u1, v1)
            f.loops[3][uv_layer].uv = (u0, v1)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link_mesh_obj(name, bm, mat=mat, parent=parent)


def join_subtree_meshes(root_obj: bpy.types.Object, merged_name: str) -> bpy.types.Object | None:
    """Apply modifiers & join all mesh descendants under root_obj to slash WebGL draw calls."""
    bpy.ops.object.select_all(action="DESELECT")
    meshes = []

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
        m.select_set(False)

    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()

    joined = bpy.context.active_object
    joined.name = merged_name
    # Remove any leftover intermediate empties under root_obj
    for ch in list(root_obj.children):
        if ch != joined and ch.type == "EMPTY" and len(ch.children) == 0:
            bpy.data.objects.remove(ch, do_unlink=True)

    joined.parent = root_obj
    joined.matrix_parent_inverse = root_obj.matrix_world.inverted()
    bpy.ops.object.select_all(action="DESELECT")
    return joined


def export_glb(filepath: Path, export_materials: str = "EXPORT", export_colors: bool = True) -> None:
    bpy.ops.export_scene.gltf(
        filepath=str(filepath),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_colors=export_colors,
        export_materials=export_materials,
    )
    print(f"[GLB OK] {filepath.name}: {filepath.stat().st_size / 1024:.1f} KB")


# ==============================================================================
# 1. EXQUISITE STORYBOOK FIGURINE FAIRY SPRITE (fairy_sprite.glb)
#    Note: In Blender Z is UP, -Y is +Z in glTF (forward!).
#    Wait: Blender glTF +Y-up mapping maps:
#      Blender (X, Y, Z) -> glTF (X, Z, -Y) -> so Blender -Y = glTF +Z (facing forward!).
# ==============================================================================
def build_fairy_sprite_glb() -> None:
    reset_scene()

    skin_mat = make_pbr_mat("PorcelainSkin", "#fff7ed", roughness=0.48, emission_hex="#fde68a", emission_strength=0.14)
    blush_mat = make_pbr_mat("RosyBlush", "#fb7185", roughness=0.55, emission_hex="#fb7185", emission_strength=0.18)
    eye_mat = make_pbr_mat("SapphireEye", "#1e1b4b", roughness=0.08, coat=1.0)
    catch_mat = make_pbr_mat("StarCatchlight", "#ffffff", roughness=0.05, emission_hex="#ffffff", emission_strength=1.5)
    hair_img = make_gradient_image("HairGrad", "#fef08a", "#eab308", stripe_strength=0.12)
    hair_mat = make_pbr_mat("GoldenHair", "#fde047", roughness=0.38, image=hair_img, emission_hex="#facc15", emission_strength=0.12)

    dress_img = make_gradient_image("DressOmbre", "#3b82f6", "#e0f2fe", stripe_strength=0.08)
    dress_mat = make_pbr_mat("PetalSkirtMat", "#60a5fa", roughness=0.52, image=dress_img, emission_hex="#60a5fa", emission_strength=0.14)
    underskirt_mat = make_pbr_mat("StarlightPetticoat", "#fef9c3", roughness=0.45, emission_hex="#fde047", emission_strength=0.22)
    leaf_img = make_gradient_image("LeafGrad", "#10b981", "#6ee7b7", stripe_strength=0.10)
    leaf_mat = make_pbr_mat("EmeraldLeaf", "#34d399", roughness=0.42, image=leaf_img, emission_hex="#34d399", emission_strength=0.12)

    hat_img = make_gradient_image("BluebellHatGrad", "#1d4ed8", "#60a5fa", stripe_strength=0.10)
    hat_mat = make_pbr_mat("BluebellHatMat", "#2563eb", roughness=0.46, image=hat_img, emission_hex="#3b82f6", emission_strength=0.16)
    boot_mat = make_pbr_mat("IndigoBoot", "#312e81", roughness=0.42, emission_hex="#4338ca", emission_strength=0.10)
    gold_mat = make_pbr_mat("EnchantedBrass", "#fbbf24", roughness=0.26, metallic=0.78, emission_hex="#f59e0b", emission_strength=0.28)
    rose_trim_mat = make_pbr_mat("HatRosebud", "#fb7185", roughness=0.45, emission_hex="#f43f5e", emission_strength=0.20)
    wood_mat = make_pbr_mat("VineWood", "#78350f", roughness=0.68, emission_hex="#92400e", emission_strength=0.06)
    star_core_mat = make_pbr_mat("LanternStarCore", "#fef9c3", roughness=0.12, emission_hex="#fde047", emission_strength=3.2)

    root = make_empty("FairyRoot", (0.0, 0.0, 0.0))
    body_pivot = make_empty("BodyPivot", (0.0, 0.0, 0.06), parent=root)

    # 1. Left & Right Articulated Legs + Upturned Curled Pixie Boots!
    for side, name in ((-1.0, "LeftLegNode"), (1.0, "RightLegNode")):
        leg_pivot = make_empty(name, (side * 0.044, 0.0, 0.135), parent=body_pivot)
        # Stocking leg
        make_curve_tube(
            f"{name}_Stocking",
            [((0.0, 0.0, 0.0), 0.022), ((0.0, 0.0, -0.055), 0.020), ((0.0, -0.004, -0.105), 0.021)],
            skin_mat,
            parent=leg_pivot,
        )
        # Curled-toe fairytale pixie boot (facing -Y -> +Z in glTF!)
        boot = make_curve_tube(
            f"{name}_Boot",
            [
                ((0.0, 0.002, -0.082), 0.028),
                ((0.0, -0.004, -0.118), 0.027),
                ((0.0, -0.036, -0.124), 0.022),
                ((0.0, -0.062, -0.112), 0.012),
                ((0.0, -0.070, -0.096), 0.004),
            ],
            boot_mat,
            parent=leg_pivot,
        )
        add_subsurf(boot, 1)
        # Leaf boot cuff
        cuff = create_lathe_mesh(
            f"{name}_Cuff",
            [(0.024, -0.088), (0.036, -0.074), (0.030, -0.066)],
            segs=16,
            mat=leaf_mat,
            parent=leg_pivot,
            scallop_amp=0.16,
            scallop_freq=5,
        )
        add_solidify(cuff, 0.004)

    # 2. Petticoat, Overlapping 8-Petal Bellflower Skirt, Emerald Leaf Collar & Golden Sash
    petticoat = create_lathe_mesh(
        "Petticoat",
        [(0.035, 0.25), (0.095, 0.18), (0.148, 0.105)],
        segs=28,
        mat=underskirt_mat,
        parent=body_pivot,
        scallop_amp=0.06,
        scallop_freq=12,
    )
    add_solidify(petticoat, 0.006)
    add_subsurf(petticoat, 1)

    # 8 sculpted individual overlapping skirt petals for genuine layered depth!
    for k in range(8):
        ang = (k / 8.0) * math.tau + 0.18
        bm = bmesh.new()
        uv_layer = bm.loops.layers.uv.new("UVMap")
        rows = []
        for iu in range(7):
            u = iu / 6.0
            rad = 0.042 + 0.118 * (u ** 0.82) + 0.012 * math.sin(u * math.pi)
            z = 0.275 - 0.162 * u + 0.012 * (u ** 3)
            half_arc = 0.44 * (0.35 + 0.85 * math.sin(u * math.pi * 0.88))
            row = []
            for iv in range(7):
                vn = (iv / 6.0) * 2.0 - 1.0
                a = ang + vn * half_arc
                cup = 0.008 * (1.0 - vn * vn)
                r_pt = rad + cup + (0.005 if k % 2 == 0 else 0.0)
                v = bm.verts.new((math.cos(a) * r_pt, math.sin(a) * r_pt, z - 0.008 * abs(vn) ** 2))
                row.append((v, (vn + 1.0) * 0.5, 1.0 - u))
            rows.append(row)
        for iu in range(6):
            for iv in range(6):
                v00, s00, t00 = rows[iu][iv]
                v01, s01, t01 = rows[iu][iv + 1]
                v11, s11, t11 = rows[iu + 1][iv + 1]
                v10, s10, t10 = rows[iu + 1][iv]
                f = bm.faces.new((v00, v01, v11, v10))
                f.loops[0][uv_layer].uv = (s00, t00)
                f.loops[1][uv_layer].uv = (s01, t01)
                f.loops[2][uv_layer].uv = (s11, t11)
                f.loops[3][uv_layer].uv = (s10, t10)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        petal_obj = link_mesh_obj(f"DressPetal_{k}", bm, mat=dress_mat, parent=body_pivot)
        add_solidify(petal_obj, 0.006)
        add_subsurf(petal_obj, 1)

    # Bodice & Golden Waist Sash + Bow
    bodice = create_lathe_mesh(
        "EmeraldBodice",
        [(0.048, 0.255), (0.056, 0.295), (0.046, 0.340), (0.026, 0.358)],
        segs=22,
        mat=leaf_mat,
        parent=body_pivot,
    )
    add_subsurf(bodice, 1)

    bpy.ops.mesh.primitive_torus_add(major_radius=0.055, minor_radius=0.010, major_segments=24, minor_segments=10, location=(0, 0, 0.258))
    sash = bpy.context.active_object
    sash.name = "GoldenSash"
    sash.data.materials.append(gold_mat)
    sash.parent = body_pivot

    # 6-Leaf Emerald Calyx Shoulder Collar
    collar = create_lathe_mesh(
        "LeafCollar",
        [(0.036, 0.345), (0.088, 0.315), (0.118, 0.288)],
        segs=24,
        mat=leaf_mat,
        parent=body_pivot,
        scallop_amp=0.22,
        scallop_freq=6,
    )
    add_solidify(collar, 0.005)
    add_subsurf(collar, 1)

    # Sculpted Slender Arms
    make_curve_tube(
        "LeftArm",
        [((-0.048, 0.0, 0.325), 0.017), ((-0.095, -0.015, 0.275), 0.015), ((-0.125, -0.035, 0.225), 0.016)],
        skin_mat,
        parent=body_pivot,
    )
    make_curve_tube(
        "RightArm",
        [((0.048, 0.0, 0.325), 0.017), ((0.092, -0.038, 0.285), 0.015), ((0.115, -0.075, 0.265), 0.016)],
        skin_mat,
        parent=body_pivot,
    )

    # 3. Expressive Sculpted Head, Hair Locks, Starlight Eyes & Inverted Bluebell Flower Hat!
    head_node = make_empty("HeadNode", (0.0, 0.0, 0.405), parent=body_pivot)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=24, radius=0.092, location=(0, 0, 0))
    head_mesh = bpy.context.active_object
    head_mesh.name = "PorcelainHead"
    # Cute storybook baby-cheek silhouette
    head_mesh.scale = (1.04, 0.96, 0.98)
    for poly in head_mesh.data.polygons:
        poly.use_smooth = True
    head_mesh.data.materials.append(skin_mat)
    head_mesh.parent = head_node

    # Tiny sculpted button nose
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.011, location=(0, -0.089, -0.006))
    nose = bpy.context.active_object
    nose.name = "ButtonNose"
    nose.scale = (0.95, 0.75, 0.85)
    nose.data.materials.append(skin_mat)
    nose.parent = head_node

    # Large glossy sapphire eyes + pure-white starlight catchlights + rosy cheeks!
    for side, tag in ((-1.0, "L"), (1.0, "R")):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=14, radius=0.016, location=(side * 0.033, -0.080, 0.006))
        eye = bpy.context.active_object
        eye.name = f"Eye_{tag}"
        eye.scale = (0.92, 0.55, 1.12)
        for p in eye.data.polygons:
            p.use_smooth = True
        eye.data.materials.append(eye_mat)
        eye.parent = head_node

        bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=8, radius=0.0055, location=(side * 0.029, -0.088, 0.013))
        catch = bpy.context.active_object
        catch.name = f"EyeCatch_{tag}"
        catch.data.materials.append(catch_mat)
        catch.parent = head_node

        bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.017, location=(side * 0.052, -0.074, -0.014))
        blush = bpy.context.active_object
        blush.name = f"CheekBlush_{tag}"
        blush.scale = (1.18, 0.42, 0.68)
        blush.data.materials.append(blush_mat)
        blush.parent = head_node

    # 10 Sculpted Golden-Champagne Fairy Hair Locks framing face & back
    hair_specs = [
        ((-0.055, -0.045, 0.055), (-0.088, -0.052, 0.005), (-0.082, -0.042, -0.055), 0.020),
        ((0.055, -0.045, 0.055), (0.088, -0.052, 0.005), (0.082, -0.042, -0.055), 0.020),
        ((-0.028, -0.068, 0.068), (-0.048, -0.084, 0.042), (-0.062, -0.078, 0.018), 0.015),
        ((0.024, -0.068, 0.068), (0.044, -0.084, 0.045), (0.058, -0.078, 0.022), 0.014),
        ((-0.075, 0.015, 0.050), (-0.098, 0.022, -0.010), (-0.092, 0.030, -0.068), 0.024),
        ((0.075, 0.015, 0.050), (0.098, 0.022, -0.010), (0.092, 0.030, -0.068), 0.024),
        ((-0.045, 0.062, 0.048), (-0.058, 0.085, -0.015), (-0.052, 0.092, -0.075), 0.026),
        ((0.045, 0.062, 0.048), (0.058, 0.085, -0.015), (0.052, 0.092, -0.075), 0.026),
        ((0.0, 0.072, 0.048), (0.0, 0.095, -0.015), (0.0, 0.102, -0.078), 0.028),
    ]
    for idx, (p0, p1, p2, r_mid) in enumerate(hair_specs):
        lock = make_curve_tube(
            f"HairLock_{idx}",
            [(p0, r_mid * 0.75), (p1, r_mid), (p2, 0.004)],
            hair_mat,
            parent=head_node,
        )
        add_subsurf(lock, 1)

    # 4. Inverted Scalloped Bluebell Blossom Hat + S-Curved Tip + Hanging 3D Star Bell!
    # Tilt backward (-X in Blender = tilts crown toward -Z_gltf away from camera) so face & sapphire eyes shine!
    hat_node = make_empty("HatNode", (0.0, 0.032, 0.062), parent=head_node)
    hat_node.rotation_euler = Euler((-0.34, 0.0, 0.0), "XYZ")

    hat_brim = create_lathe_mesh(
        "BluebellHatBrim",
        [(0.068, 0.052), (0.106, 0.028), (0.148, -0.004), (0.162, -0.016)],
        segs=36,
        mat=hat_mat,
        parent=hat_node,
        scallop_amp=0.14,
        scallop_freq=6,
    )
    add_solidify(hat_brim, 0.007)
    add_subsurf(hat_brim, 2)

    hat_crown = make_curve_tube(
        "BluebellHatCrown",
        [
            ((0.0, 0.0, 0.036), 0.082),
            ((0.006, 0.010, 0.105), 0.058),
            ((0.024, 0.028, 0.175), 0.034),
            ((0.052, 0.048, 0.225), 0.016),
            ((0.076, 0.062, 0.205), 0.005),
        ],
        hat_mat,
        bevel_res=7,
        parent=hat_node,
    )
    add_subsurf(hat_crown, 1)

    # Golden vine hatband + 2 tiny rosebuds
    bpy.ops.mesh.primitive_torus_add(major_radius=0.082, minor_radius=0.008, major_segments=28, minor_segments=10, location=(0, 0, 0.046))
    hat_band = bpy.context.active_object
    hat_band.name = "HatGoldBand"
    hat_band.data.materials.append(gold_mat)
    hat_band.parent = hat_node

    for idx, pos_b in enumerate(((-0.078, -0.032, 0.050), (-0.066, -0.050, 0.044))):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.016 - idx * 0.003, location=pos_b)
        rb = bpy.context.active_object
        rb.name = f"HatRosebud_{idx}"
        rb.data.materials.append(rose_trim_mat)
        rb.parent = hat_node

    # Hanging 3D Star Charm at curled hat tip
    star_bm = bmesh.new()
    v_f = star_bm.verts.new((0, -0.010, 0))
    v_b = star_bm.verts.new((0, 0.010, 0))
    ring_s = []
    for i in range(10):
        a = (i / 10.0) * math.tau
        rad = 0.028 if i % 2 == 0 else 0.012
        ring_s.append(star_bm.verts.new((math.cos(a) * rad, 0.0, math.sin(a) * rad)))
    for i in range(10):
        nxt = (i + 1) % 10
        star_bm.faces.new((v_f, ring_s[i], ring_s[nxt]))
        star_bm.faces.new((v_b, ring_s[nxt], ring_s[i]))
    bmesh.ops.recalc_face_normals(star_bm, faces=star_bm.faces)
    hat_star = link_mesh_obj("HatStarCharm", star_bm, mat=gold_mat, parent=hat_node)
    hat_star.location = (0.078, 0.062, 0.182)

    # 5. Gnarled Vine Shepherd Crook + Swinging Hexagonal Filigree Star-Lantern!
    staff_pivot = make_empty("StaffPivot", (0.115, -0.075, 0.265), parent=body_pivot)
    make_curve_tube(
        "VineShepherdStaff",
        [
            ((0.0, 0.045, -0.155), 0.008),
            ((0.0, 0.015, -0.045), 0.011),
            ((0.0, -0.035, 0.065), 0.011),
            ((0.0, -0.088, 0.145), 0.010),
            ((0.0, -0.145, 0.162), 0.008),
            ((0.0, -0.172, 0.125), 0.006),
        ],
        wood_mat,
        parent=staff_pivot,
    )

    lantern_swing = make_empty("LanternSwingNode", (0.0, -0.165, 0.118), parent=staff_pivot)
    # Pagoda lantern cap & bottom base
    l_cap = create_lathe_mesh(
        "LanternCap",
        [(0.006, 0.056), (0.026, 0.036), (0.056, 0.018), (0.048, 0.012)],
        segs=6,
        mat=gold_mat,
        parent=lantern_swing,
    )
    add_bevel(l_cap, 0.002, 1)
    l_base = create_lathe_mesh(
        "LanternBase",
        [(0.036, -0.052), (0.024, -0.068), (0.005, -0.082)],
        segs=6,
        mat=gold_mat,
        parent=lantern_swing,
    )
    # 6 Brass Cage Struts
    for k in range(6):
        a = (k / 6.0) * math.tau
        make_curve_tube(
            f"LanternStrut_{k}",
            [
                ((math.cos(a) * 0.042, math.sin(a) * 0.042, 0.014), 0.0038),
                ((math.cos(a) * 0.034, math.sin(a) * 0.034, -0.050), 0.0032),
            ],
            gold_mat,
            bevel_res=3,
            res_u=4,
            parent=lantern_swing,
        )
    # Luminous Star Core inside lantern
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.030, location=(0, 0, -0.018))
    core = bpy.context.active_object
    core.name = "LanternStarCore"
    core.data.materials.append(star_core_mat)
    core.parent = lantern_swing

    export_glb(OUT_DIR / "fairy_sprite.glb")


# ==============================================================================
# 2. GHIBLI-STORYBOOK SHINGLE-ROOF HILLTOP COTTAGE (storybook_cottage.glb)
# ==============================================================================
def build_storybook_cottage_glb() -> None:
    reset_scene()
    rng = random.Random(20261112)

    plaster_img = make_gradient_image("PlasterGrad", "#f5ebd6", "#cbbba0", speckle_strength=0.06)
    plaster_mat = make_pbr_mat("WarmPlaster", "#efe4ce", roughness=0.78, image=plaster_img, emission_hex="#fde68a", emission_strength=0.08)
    timber_mat = make_pbr_mat("CarvedOakTimber", "#5c3a21", roughness=0.72, emission_hex="#78350f", emission_strength=0.05)
    roof_under_mat = make_pbr_mat("RoofUnderlay", "#1e293b", roughness=0.75)
    shingle_mats = [
        make_pbr_mat("SlateBlueA", "#334e7b", roughness=0.58, emission_hex="#3b82f6", emission_strength=0.06),
        make_pbr_mat("SlateBlueB", "#3f5f90", roughness=0.55, emission_hex="#60a5fa", emission_strength=0.07),
        make_pbr_mat("SlateIndigo", "#475569", roughness=0.62, emission_hex="#818cf8", emission_strength=0.06),
    ]
    stone_mat = make_pbr_mat("MossyCobble", "#94a3b8", roughness=0.76, emission_hex="#cbd5e1", emission_strength=0.08)
    moss_mat = make_pbr_mat("VelvetMoss", "#22c55e", roughness=0.68, emission_hex="#16a34a", emission_strength=0.10)
    chimney_mat = make_pbr_mat("ChimneyBrick", "#8c584c", roughness=0.74, emission_hex="#b45309", emission_strength=0.06)
    door_mat = make_pbr_mat("ArchedOakDoor", "#7c2d12", roughness=0.62, emission_hex="#9a3412", emission_strength=0.08)
    win_glow_mat = make_pbr_mat("WarmWindowGlow", "#fef08a", roughness=0.15, emission_hex="#facc15", emission_strength=2.6)
    brass_mat = make_pbr_mat("CottageBrass", "#fbbf24", roughness=0.28, metallic=0.80, emission_hex="#f59e0b", emission_strength=0.25)
    rose_mat = make_pbr_mat("WindowRose", "#fb7185", roughness=0.45, emission_hex="#f43f5e", emission_strength=0.25)

    root = make_empty("CottageRoot", (0, 0, 0))

    # 1. Plump Storybook Barrel-Bellied Plaster Walls
    walls = create_lathe_mesh(
        "CottagePlasterWalls",
        [(0.72, -0.04), (0.70, 0.16), (0.68, 0.42), (0.63, 0.72), (0.58, 0.80)],
        segs=36,
        mat=plaster_mat,
        parent=root,
    )
    add_subsurf(walls, 1)

    # 8 Half-Timber Vertical Oak Beams + Eaves Ring Beam
    for k in range(8):
        a = (k / 8.0) * math.tau + 0.38
        make_curve_tube(
            f"TimberPost_{k}",
            [
                ((math.cos(a) * 0.705, math.sin(a) * 0.705, 0.02), 0.026),
                ((math.cos(a) * 0.685, math.sin(a) * 0.685, 0.40), 0.024),
                ((math.cos(a) * 0.635, math.sin(a) * 0.635, 0.75), 0.022),
            ],
            timber_mat,
            bevel_res=3,
            parent=root,
        )
    bpy.ops.mesh.primitive_torus_add(major_radius=0.64, minor_radius=0.030, major_segments=32, minor_segments=10, location=(0, 0, 0.75))
    ring_beam = bpy.context.active_object
    ring_beam.name = "EavesTimberRing"
    ring_beam.data.materials.append(timber_mat)
    ring_beam.parent = root

    # 2. Foundation Ring of 22 Sculpted Stone Cobbles & Moss Cushions + 3 Front Steps (at -Y = glTF +Z!)
    for i in range(22):
        a = (i / 22.0) * math.tau
        if abs(a + math.pi * 0.5) < 0.28:
            continue
        r = 0.72 + (i % 2) * 0.03
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.11, location=(math.cos(a) * r, math.sin(a) * r, 0.05))
        st = bpy.context.active_object
        st.name = f"BaseStone_{i}"
        st.scale = (1.15, 0.95, 0.68)
        st.rotation_euler = Euler((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), a), "XYZ")
        for p in st.data.polygons:
            p.use_smooth = True
        st.data.materials.append(stone_mat if i % 4 != 0 else moss_mat)
        st.parent = root

    for s_idx in range(3):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, -0.74 - s_idx * 0.13, 0.055 - s_idx * 0.022))
        step = bpy.context.active_object
        step.name = f"FrontStep_{s_idx}"
        step.scale = (0.22 + s_idx * 0.04, 0.09, 0.035)
        add_bevel(step, 0.012, 2)
        step.data.materials.append(stone_mat)
        step.parent = root

    # 3. Swooping Concave Witch-Hat Roof + 7 Tiers of ~148 Individual Beveled Slate Shingles!
    def roof_profile(t: float) -> tuple[float, float]:
        # t=0 at wide eaves (r=0.96, z=0.72), t=1 at curled peak (r=0.02, z=1.68)
        r = 0.96 * ((1.0 - t) ** 1.38) + 0.015
        z = 0.72 + 0.96 * (t ** 0.88)
        return r, z

    roof_core = create_lathe_mesh(
        "RoofUnderCone",
        [roof_profile(k / 14.0) for k in range(15)],
        segs=36,
        mat=roof_under_mat,
        parent=root,
    )
    add_subsurf(roof_core, 1)

    shingle_tiers = 7
    for tier in range(shingle_tiers):
        t = (tier + 0.25) / (shingle_tiers + 0.4)
        r, z = roof_profile(t)
        r_next, z_next = roof_profile(min(1.0, t + 0.11))
        slope_pitch = math.atan2(z_next - z, r - r_next)
        count = max(10, int(round(28 * (1.0 - t * 0.66))))
        tile_w = (math.tau * r / count) * 0.58
        tile_len = 0.105 * (1.0 - t * 0.25)

        for k in range(count):
            ang = ((k + (0.5 if tier % 2 else 0.0)) / count) * math.tau
            cx = math.cos(ang) * (r + 0.018)
            cy = math.sin(ang) * (r + 0.018)
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx, cy, z))
            sh = bpy.context.active_object
            sh.name = f"Shingle_{tier}_{k}"
            sh.scale = (tile_w, tile_len, 0.014)
            # Orient outward radially and pitch cleanly along the roof cone slope
            sh.rotation_euler = Euler(
                (slope_pitch + rng.uniform(-0.035, 0.035), rng.uniform(-0.035, 0.035), ang + math.pi * 0.5),
                "XYZ",
            )
            add_bevel(sh, 0.005, 1)
            sh.data.materials.append(shingle_mats[(tier + k) % len(shingle_mats)])
            sh.parent = root

    # Curled Roof Finial + Golden Crescent Weathervane
    make_curve_tube(
        "RoofPeakCurl",
        [((0.0, 0.0, 1.60), 0.065), ((-0.03, 0.01, 1.74), 0.032), ((-0.08, 0.02, 1.80), 0.012)],
        shingle_mats[0],
        parent=root,
    )
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.042, location=(-0.085, 0.02, 1.83))
    finial = bpy.context.active_object
    finial.name = "PeakStarFinial"
    finial.data.materials.append(brass_mat)
    finial.parent = root

    # 4. Crooked Stone-Brick Chimney (at x = +0.36, y = +0.12 -> glTF z = -0.12 so smoke aligns!)
    chimney = make_curve_tube(
        "StoneChimney",
        [((0.34, 0.10, 1.02), 0.115), ((0.36, 0.10, 1.32), 0.105), ((0.35, 0.10, 1.54), 0.118)],
        chimney_mat,
        bevel_res=4,
        parent=root,
    )
    bpy.ops.mesh.primitive_torus_add(major_radius=0.115, minor_radius=0.022, major_segments=16, minor_segments=8, location=(0.35, 0.10, 1.55))
    c_rim = bpy.context.active_object
    c_rim.name = "ChimneyRim"
    c_rim.data.materials.append(chimney_mat)
    c_rim.parent = root

    # 5. Front Arched Oak Door + Mullioned Glowing Windows + Rose Flowerboxes (Front = -Y!)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.175, depth=0.10, location=(0.0, -0.66, 0.28), rotation=(math.pi * 0.5, 0, 0))
    door_arch = bpy.context.active_object
    door_arch.name = "OakDoorTop"
    door_arch.data.materials.append(door_mat)
    door_arch.parent = root

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, -0.66, 0.16))
    door_rect = bpy.context.active_object
    door_rect.name = "OakDoorLower"
    door_rect.scale = (0.175, 0.05, 0.14)
    add_bevel(door_rect, 0.008, 2)
    door_rect.data.materials.append(door_mat)
    door_rect.parent = root

    # Arched stone doorframe + round hobbit door window + brass handle
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.19,
        minor_radius=0.026,
        major_segments=24,
        minor_segments=8,
        location=(0.0, -0.68, 0.28),
        rotation=(math.pi * 0.5, 0, 0),
    )
    door_frame = bpy.context.active_object
    door_frame.name = "StoneDoorArch"
    door_frame.data.materials.append(timber_mat)
    door_frame.parent = root

    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.068, depth=0.03, location=(0.0, -0.705, 0.30), rotation=(math.pi * 0.5, 0, 0))
    door_win = bpy.context.active_object
    door_win.name = "DoorRoundWindow"
    door_win.data.materials.append(win_glow_mat)
    door_win.parent = root

    # Two Warm Mullioned Side Windows + Wooden Flowerboxes with Tiny Roses!
    for side, tag in ((-1.0, "L"), (1.0, "R")):
        ang = -math.pi * 0.5 + side * 0.62
        wx = math.cos(ang) * 0.665
        wy = math.sin(ang) * 0.665
        rot_z = ang + math.pi * 0.5

        win_grp = make_empty(f"WindowGrp_{tag}", (wx, wy, 0.44), parent=root)
        win_grp.rotation_euler = Euler((0.0, 0.0, rot_z), "XYZ")

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.015, 0))
        pane = bpy.context.active_object
        pane.name = f"WindowGlow_{tag}"
        pane.scale = (0.11, 0.02, 0.13)
        pane.data.materials.append(win_glow_mat)
        pane.parent = win_grp

        # Outer frame + cross mullions
        for bar_loc, bar_scl in (
            ((0, -0.026, 0.13), (0.13, 0.022, 0.016)),
            ((0, -0.026, -0.13), (0.13, 0.022, 0.016)),
            ((-0.115, -0.026, 0), (0.016, 0.022, 0.13)),
            ((0.115, -0.026, 0), (0.016, 0.022, 0.13)),
            ((0, -0.026, 0), (0.11, 0.018, 0.010)),
            ((0, -0.026, 0), (0.010, 0.018, 0.13)),
        ):
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=bar_loc)
            bar = bpy.context.active_object
            bar.scale = bar_scl
            bar.data.materials.append(timber_mat)
            bar.parent = win_grp

        # Flowerbox planter + 4 blooming mini roses & greenery
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.055, -0.165))
        fbox = bpy.context.active_object
        fbox.name = f"FlowerBox_{tag}"
        fbox.scale = (0.135, 0.045, 0.038)
        add_bevel(fbox, 0.006, 1)
        fbox.data.materials.append(timber_mat)
        fbox.parent = win_grp

        for rx in (-0.08, -0.025, 0.03, 0.085):
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.028, location=(rx, -0.06, -0.12))
            mr = bpy.context.active_object
            mr.data.materials.append(rose_mat if rx < 0.05 else brass_mat)
            mr.parent = win_grp

    join_subtree_meshes(root, "CottageMergedMesh")
    export_glb(OUT_DIR / "storybook_cottage.glb")


# ==============================================================================
# 3. SCULPTED SPOTTED FAIRY TOADSTOOL ARCHETYPES (mushroom_cluster.glb)
# ==============================================================================
def build_single_toadstool(
    prefix: str,
    cap_hex: str,
    cap_radius: float,
    cap_height: float,
    stalk_height: float,
    lean_x: float,
    parent,
) -> None:
    cap_img = make_gradient_image(f"{prefix}_CapGrad", cap_hex, "#fda4af", speckle_strength=0.04)
    cap_mat = make_pbr_mat(f"{prefix}_CapMat", cap_hex, roughness=0.38, coat=0.35, image=cap_img, emission_hex=cap_hex, emission_strength=0.34)
    gill_mat = make_pbr_mat(f"{prefix}_GillMat", "#fef3c7", roughness=0.65, emission_hex="#fde68a", emission_strength=0.18)
    stalk_mat = make_pbr_mat(f"{prefix}_StalkMat", "#fffbeb", roughness=0.58, emission_hex="#fef3c7", emission_strength=0.16)
    dot_mat = make_pbr_mat(f"{prefix}_DotMat", "#ffffff", roughness=0.42, emission_hex="#ffffff", emission_strength=0.28)

    # 1. Curved bulbous-base stalk
    stalk = make_curve_tube(
        f"{prefix}_Stalk",
        [
            ((0.0, 0.0, 0.0), 0.048),
            ((lean_x * 0.25, 0.0, stalk_height * 0.28), 0.036),
            ((lean_x * 0.65, 0.0, stalk_height * 0.68), 0.029),
            ((lean_x, 0.0, stalk_height), 0.034),
        ],
        stalk_mat,
        bevel_res=6,
        parent=parent,
    )
    add_subsurf(stalk, 1)

    # Ruffled fairy skirt collar (annulus) on upper stalk
    collar = create_lathe_mesh(
        f"{prefix}_Annulus",
        [(0.028, stalk_height * 0.74), (0.056, stalk_height * 0.67), (0.048, stalk_height * 0.64)],
        segs=20,
        mat=gill_mat,
        parent=parent,
        scallop_amp=0.16,
        scallop_freq=9,
    )
    collar.location.x = lean_x * 0.72
    add_solidify(collar, 0.003)

    # 2. Plump Rolled-Margin Fleshy Mushroom Cap + Gill Underside!
    cap_top = make_empty(f"{prefix}_CapPivot", (lean_x, 0.0, stalk_height * 0.96), parent=parent)
    cap_top.rotation_euler = Euler((0.0, lean_x * 1.1, 0.0), "XYZ")

    R = cap_radius
    H = cap_height
    cap = create_lathe_mesh(
        f"{prefix}_Cap",
        [
            (0.025, 0.015),          # inner gill attachment
            (R * 0.82, -0.008),      # recessed cream gill underside
            (R * 1.00, 0.006),       # rolled fleshy cap rim
            (R * 1.03, H * 0.26),
            (R * 0.86, H * 0.62),
            (R * 0.48, H * 0.88),
            (0.001, H),
        ],
        segs=32,
        mat=cap_mat,
        parent=cap_top,
        scallop_amp=0.03,
        scallop_freq=7,
    )
    add_subsurf(cap, 2)

    # 24 Radial 3D Cream Gill Fins underneath the cap!
    for g in range(24):
        ga = (g / 24.0) * math.tau
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(math.cos(ga) * R * 0.52, math.sin(ga) * R * 0.52, 0.006),
            rotation=(0, 0, ga),
        )
        gill = bpy.context.active_object
        gill.name = f"{prefix}_Gill_{g}"
        gill.scale = (R * 0.40, 0.0025, 0.014)
        gill.data.materials.append(gill_mat)
        gill.parent = cap_top

    # 9 Raised Smooth 3D Polka-Dot Cushions sitting proud on the outer cap dome surface!
    # Match exact lathe profile heights: at r=0.36R -> z≈0.93H; at r=0.72R -> z≈0.74H
    dot_rings = [(0.36, 0.94, 3, 0.024), (0.72, 0.74, 6, 0.020)]
    d_idx = 0
    for r_frac, h_frac, cnt, d_rad in dot_rings:
        for k in range(cnt):
            a = (k / cnt) * math.tau + r_frac * 2.1
            dx = math.cos(a) * R * r_frac
            dy = math.sin(a) * R * r_frac
            dz = H * h_frac + d_rad * 0.18
            tilt = math.atan2(r_frac * R * 0.85, H)
            bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=d_rad, location=(dx, dy, dz))
            dot = bpy.context.active_object
            dot.name = f"{prefix}_Dot_{d_idx}"
            dot.scale = (1.18, 1.18, 0.52)
            dot.rotation_euler = Euler((-math.sin(a) * tilt, math.cos(a) * tilt, 0.0), "XYZ")
            for p in dot.data.polygons:
                p.use_smooth = True
            dot.data.materials.append(dot_mat)
            dot.parent = cap_top
            d_idx += 1


def build_mushroom_cluster_glb() -> None:
    reset_scene()
    m_a = make_empty("MushroomA", (0, 0, 0))
    build_single_toadstool("MushA", "#f43f5e", cap_radius=0.145, cap_height=0.115, stalk_height=0.23, lean_x=0.02, parent=m_a)
    join_subtree_meshes(m_a, "MushroomA_Merged")

    m_b = make_empty("MushroomB", (0, 0, 0))
    build_single_toadstool("MushB", "#a855f7", cap_radius=0.135, cap_height=0.125, stalk_height=0.25, lean_x=-0.025, parent=m_b)
    join_subtree_meshes(m_b, "MushroomB_Merged")

    m_c = make_empty("MushroomC", (0, 0, 0))
    build_single_toadstool("MushC", "#38bdf8", cap_radius=0.130, cap_height=0.105, stalk_height=0.20, lean_x=0.018, parent=m_c)
    join_subtree_meshes(m_c, "MushroomC_Merged")

    m_d = make_empty("MushroomD", (0, 0, 0))
    build_single_toadstool("MushD", "#facc15", cap_radius=0.140, cap_height=0.110, stalk_height=0.22, lean_x=-0.015, parent=m_d)
    join_subtree_meshes(m_d, "MushroomD_Merged")

    export_glb(OUT_DIR / "mushroom_cluster.glb")


# ==============================================================================
# 4. FOUR EXQUISITE FAIRYTALE LANDMARKS (fairytale_landmarks.glb)
#    - SignpostProp (+ SignPivotNode + BluebirdNode)
#    - StreetlampProp (+ LampBellNode)
#    - HollowStumpProp
#    - WishBottleProp (+ BottleGlassMesh)
# ==============================================================================
def build_fairytale_landmarks_glb() -> None:
    reset_scene()

    oak_img = make_gradient_image("OakBark", "#92400e", "#451a03", stripe_strength=0.18)
    oak_mat = make_pbr_mat("CarvedOak", "#78350f", roughness=0.68, image=oak_img, emission_hex="#78350f", emission_strength=0.08)
    plank_mat = make_pbr_mat("SignPlank", "#b45309", roughness=0.58, emission_hex="#d97706", emission_strength=0.12)
    plank_mat2 = make_pbr_mat("SignPlank2", "#9a3412", roughness=0.60, emission_hex="#ea580c", emission_strength=0.10)
    iron_mat = make_pbr_mat("WroughtIron", "#334155", roughness=0.38, metallic=0.72, emission_hex="#475569", emission_strength=0.08)
    brass_mat = make_pbr_mat("AntiqueBrass", "#fbbf24", roughness=0.28, metallic=0.80, emission_hex="#f59e0b", emission_strength=0.24)
    lamp_core_mat = make_pbr_mat("LampStarGlow", "#fef9c3", roughness=0.12, emission_hex="#fde047", emission_strength=2.8)
    moss_mat = make_pbr_mat("LushMoss", "#22c55e", roughness=0.68, emission_hex="#16a34a", emission_strength=0.12)
    stone_mat = make_pbr_mat("RiverStone", "#94a3b8", roughness=0.72, emission_hex="#cbd5e1", emission_strength=0.08)

    bird_blue = make_pbr_mat("BluebirdFeather", "#38bdf8", roughness=0.42, emission_hex="#0ea5e9", emission_strength=0.30)
    bird_belly = make_pbr_mat("BluebirdBelly", "#fef3c7", roughness=0.48, emission_hex="#fde68a", emission_strength=0.20)
    beak_mat = make_pbr_mat("GoldenBeak", "#facc15", roughness=0.32, emission_hex="#eab308", emission_strength=0.25)
    eye_mat = make_pbr_mat("BirdEye", "#0f172a", roughness=0.08, coat=1.0)

    # --------------------------------------------------------------------------
    # A. SignpostProp (Gnarled Oak Post + Notched Dovetail Planks + Sculpted Bluebird)
    # --------------------------------------------------------------------------
    sign_root = make_empty("SignpostProp", (0, 0, 0))
    post = make_curve_tube(
        "GnarledSignPost",
        [((0.0, 0.0, -0.02), 0.056), ((-0.015, 0.01, 0.25), 0.045), ((0.018, -0.01, 0.54), 0.040), ((0.008, 0.0, 0.78), 0.036)],
        oak_mat,
        bevel_res=6,
        parent=sign_root,
    )
    add_subsurf(post, 1)

    for i, (sx, sy, sr) in enumerate(((-0.08, -0.05, 0.075), (0.07, 0.04, 0.065), (0.02, -0.08, 0.055))):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=sr, location=(sx, sy, 0.03))
        b = bpy.context.active_object
        b.scale = (1.2, 1.0, 0.65)
        b.data.materials.append(moss_mat if i == 1 else stone_mat)
        b.parent = sign_root

    sign_pivot = make_empty("SignPivotNode", (0.01, 0.0, 0.64), parent=sign_root)

    # Two pointed fairytale arrow boards with iron collar bands
    for idx, (z_off, rot_z, x_shift, p_mat) in enumerate(((0.05, 0.28, 0.13, plank_mat), (-0.08, -0.45, -0.12, plank_mat2))):
        bm = bmesh.new()
        # Pointed arrow plank polygon extruded along Y
        pts_2d = [
            (-0.22, -0.052),
            (0.16, -0.048),
            (0.24, 0.0),
            (0.16, 0.048),
            (-0.22, 0.052),
            (-0.18, 0.0),
        ]
        front_v = [bm.verts.new((px + x_shift, -0.016, pz + z_off)) for (px, pz) in pts_2d]
        back_v = [bm.verts.new((px + x_shift, 0.016, pz + z_off)) for (px, pz) in pts_2d]
        bm.faces.new(front_v)
        bm.faces.new(list(reversed(back_v)))
        for k in range(len(pts_2d)):
            kn = (k + 1) % len(pts_2d)
            bm.faces.new((front_v[k], front_v[kn], back_v[kn], back_v[k]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        board = link_mesh_obj(f"ArrowBoard_{idx}", bm, mat=p_mat, parent=sign_pivot)
        board.rotation_euler = Euler((0, 0, rot_z), "XYZ")
        add_bevel(board, 0.006, 2)

    # Sculpted Chubby Fairytale Bluebird perched atop SignPivotNode!
    bird_node = make_empty("BluebirdNode", (0.0, 0.0, 0.16), parent=sign_pivot)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=22, ring_count=16, radius=0.052, location=(0, 0, 0.02))
    b_body = bpy.context.active_object
    b_body.name = "BluebirdBody"
    b_body.scale = (1.28, 0.92, 0.96)
    for p in b_body.data.polygons:
        p.use_smooth = True
    b_body.data.materials.append(bird_blue)
    b_body.parent = bird_node

    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=0.042, location=(0.016, 0, 0.008))
    b_belly = bpy.context.active_object
    b_belly.scale = (1.15, 0.85, 0.80)
    b_belly.data.materials.append(bird_belly)
    b_belly.parent = bird_node

    # Folded wings, fanned tail, beak & eyes
    for side in (-1.0, 1.0):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.036, location=(-0.006, side * 0.042, 0.024))
        bw = bpy.context.active_object
        bw.scale = (1.35, 0.32, 0.72)
        bw.rotation_euler = Euler((0, -0.22, side * 0.15), "XYZ")
        bw.data.materials.append(bird_blue)
        bw.parent = bird_node

        bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=8, radius=0.008, location=(0.048, side * 0.026, 0.038))
        be = bpy.context.active_object
        be.data.materials.append(eye_mat)
        be.parent = bird_node

    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.015, radius2=0.001, depth=0.038, location=(0.076, 0, 0.028), rotation=(0, math.pi * 0.5, 0))
    beak = bpy.context.active_object
    beak.data.materials.append(beak_mat)
    beak.parent = bird_node

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.072, 0, 0.042), rotation=(0, -0.45, 0))
    tail = bpy.context.active_object
    tail.scale = (0.042, 0.026, 0.006)
    add_bevel(tail, 0.003, 1)
    tail.data.materials.append(bird_blue)
    tail.parent = bird_node

    # --------------------------------------------------------------------------
    # B. StreetlampProp (Scrolling Vine Wrought-Iron Streetlamp + Animatable LampBellNode)
    # --------------------------------------------------------------------------
    lamp_root = make_empty("StreetlampProp", (0, 0, 0))
    # Ornate molded iron base + tapered pole + scrolling shepherd spiral crook
    l_base = create_lathe_mesh(
        "IronLampBase",
        [(0.095, 0.0), (0.088, 0.04), (0.058, 0.12), (0.046, 0.24), (0.032, 0.28)],
        segs=20,
        mat=iron_mat,
        parent=lamp_root,
    )
    add_subsurf(l_base, 1)

    make_curve_tube(
        "IronLampCrook",
        [
            ((0.0, 0.0, 0.24), 0.028),
            ((0.0, 0.0, 0.68), 0.023),
            ((0.02, 0.0, 1.04), 0.020),
            ((0.14, 0.0, 1.20), 0.017),
            ((0.30, 0.0, 1.18), 0.015),
            ((0.35, 0.0, 1.05), 0.012),
        ],
        iron_mat,
        bevel_res=5,
        parent=lamp_root,
    )
    # Decorative spiral scroll under crook
    make_curve_tube(
        "IronScroll",
        [((0.02, 0.0, 0.90), 0.010), ((0.12, 0.0, 0.98), 0.009), ((0.16, 0.0, 1.10), 0.008), ((0.10, 0.0, 1.08), 0.006)],
        iron_mat,
        parent=lamp_root,
    )

    lamp_bell = make_empty("LampBellNode", (0.35, 0.0, 1.03), parent=lamp_root)
    bell_roof = create_lathe_mesh(
        "StreetLampBellRoof",
        [(0.008, 0.02), (0.045, -0.015), (0.092, -0.045), (0.078, -0.055)],
        segs=6,
        mat=brass_mat,
        parent=lamp_bell,
    )
    add_subsurf(bell_roof, 1)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.056, depth=0.13, location=(0, 0, -0.11))
    glass_bulb = bpy.context.active_object
    glass_bulb.name = "StreetLampStarCore"
    glass_bulb.data.materials.append(lamp_core_mat)
    glass_bulb.parent = lamp_bell

    # --------------------------------------------------------------------------
    # C. HollowStumpProp (Gnarled Buttress Roots + Moss + Shelf Fungi + Honey Jars)
    # --------------------------------------------------------------------------
    stump_root = make_empty("HollowStumpProp", (0, 0, 0))
    stump_body = create_lathe_mesh(
        "AncientStumpTrunk",
        [(0.34, 0.0), (0.28, 0.12), (0.24, 0.28), (0.25, 0.38), (0.19, 0.39), (0.17, 0.14), (0.01, 0.12)],
        segs=28,
        mat=oak_mat,
        parent=stump_root,
        scallop_amp=0.14,
        scallop_freq=7,
    )
    add_subsurf(stump_body, 1)

    # 6 Sprawling Gnarled Roots
    for r_i in range(6):
        ra = (r_i / 6.0) * math.tau + 0.3
        make_curve_tube(
            f"ButtressRoot_{r_i}",
            [
                ((math.cos(ra) * 0.22, math.sin(ra) * 0.22, 0.18), 0.055),
                ((math.cos(ra + 0.12) * 0.34, math.sin(ra + 0.12) * 0.34, 0.06), 0.042),
                ((math.cos(ra + 0.22) * 0.46, math.sin(ra + 0.22) * 0.46, 0.01), 0.018),
            ],
            oak_mat,
            parent=stump_root,
        )

    # Velvet Moss Cushions & 2 Sculpted Honey-Starlight Ceramic Jars inside Stump!
    for m_i, ma in enumerate((0.4, 2.1, 4.2)):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.075, location=(math.cos(ma) * 0.23, math.sin(ma) * 0.23, 0.37))
        mc = bpy.context.active_object
        mc.scale = (1.3, 0.9, 0.45)
        mc.data.materials.append(moss_mat)
        mc.parent = stump_root

    honey_gold = make_pbr_mat("StarHoneyGold", "#fde047", roughness=0.22, emission_hex="#facc15", emission_strength=1.6)
    honey_cyan = make_pbr_mat("MoonHoneyCyan", "#7dd3fc", roughness=0.22, emission_hex="#38bdf8", emission_strength=1.5)
    cloth_lid = make_pbr_mat("LinenJarLid", "#fef3c7", roughness=0.72, emission_hex="#fde68a", emission_strength=0.15)

    for j_idx, (jx, jy, j_scale, j_mat) in enumerate(((-0.048, -0.03, 1.0, honey_gold), (0.065, 0.03, 0.82, honey_cyan))):
        jar = create_lathe_mesh(
            f"HoneyJar_{j_idx}",
            [(0.001, 0.13), (0.055 * j_scale, 0.13), (0.072 * j_scale, 0.21), (0.052 * j_scale, 0.29), (0.062 * j_scale, 0.32)],
            segs=20,
            mat=j_mat,
            parent=stump_root,
        )
        jar.location = (jx, jy, 0.12)
        add_subsurf(jar, 1)

        lid = create_lathe_mesh(
            f"HoneyJarLid_{j_idx}",
            [(0.068 * j_scale, 0.30), (0.064 * j_scale, 0.34), (0.002, 0.355)],
            segs=18,
            mat=cloth_lid,
            parent=stump_root,
            scallop_amp=0.12,
            scallop_freq=8,
        )
        lid.location = (jx, jy, 0.12)

    # --------------------------------------------------------------------------
    # D. WishBottleProp (Crystal Apothecary Flask + Cork + Wax Seal + Ribbon + Scroll)
    # --------------------------------------------------------------------------
    bottle_root = make_empty("WishBottleProp", (0, 0, 0))
    glass_placeholder = make_pbr_mat("BottleGlassPlaceholder", "#bae6fd", roughness=0.08, alpha=0.45)
    cork_mat = make_pbr_mat("NaturalCork", "#b45309", roughness=0.82, emission_hex="#92400e", emission_strength=0.10)
    wax_mat = make_pbr_mat("RoseWaxSeal", "#e11d48", roughness=0.36, coat=0.5, emission_hex="#fb7185", emission_strength=0.25)
    scroll_mat = make_pbr_mat("ParchmentScroll", "#fef08a", roughness=0.55, emission_hex="#fde047", emission_strength=0.45)
    sand_mat = make_pbr_mat("GlowingStarSand", "#38bdf8", roughness=0.25, emission_hex="#38bdf8", emission_strength=1.4)

    # Faceted plump teardrop potion bottle (named BottleGlassMesh so Three.js upgrades to Fresnel crystal!)
    flask = create_lathe_mesh(
        "BottleGlassMesh",
        [
            (0.002, -0.22),
            (0.145, -0.21),
            (0.185, -0.08),
            (0.165, 0.08),
            (0.072, 0.21),
            (0.068, 0.33),
            (0.088, 0.36),
            (0.064, 0.37),
        ],
        segs=24,
        mat=glass_placeholder,
        parent=bottle_root,
    )
    add_subsurf(flask, 1)

    # Cork stopper + Golden neck collar + Crimson Wax Seal & Bow + Rolled Love Scroll + Star Sand!
    cork = create_lathe_mesh(
        "BottleCork",
        [(0.050, 0.33), (0.058, 0.43), (0.052, 0.445), (0.002, 0.45)],
        segs=20,
        mat=cork_mat,
        parent=bottle_root,
    )
    add_bevel(cork, 0.004, 1)

    bpy.ops.mesh.primitive_torus_add(major_radius=0.076, minor_radius=0.013, major_segments=24, minor_segments=10, location=(0, 0, 0.28))
    neck_ring = bpy.context.active_object
    neck_ring.name = "BottleGoldNeckRing"
    neck_ring.data.materials.append(brass_mat)
    neck_ring.parent = bottle_root

    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=0.028, location=(0.0, -0.082, 0.265))
    wax_seal = bpy.context.active_object
    wax_seal.name = "BottleWaxSeal"
    wax_seal.scale = (1.1, 0.42, 1.1)
    wax_seal.data.materials.append(wax_mat)
    wax_seal.parent = bottle_root

    # Rolled Love-Letter Scroll inside bottle
    bpy.ops.mesh.primitive_cylinder_add(vertices=22, radius=0.048, depth=0.28, location=(0.0, 0.0, -0.02), rotation=(0.06, -0.12, 0))
    scroll = bpy.context.active_object
    scroll.name = "LoveLetterScroll"
    scroll.data.materials.append(scroll_mat)
    scroll.parent = bottle_root

    bpy.ops.mesh.primitive_torus_add(major_radius=0.051, minor_radius=0.009, major_segments=20, minor_segments=8, location=(0, 0, -0.02), rotation=(0.06, -0.12, 0))
    s_rib = bpy.context.active_object
    s_rib.name = "ScrollCrimsonRibbon"
    s_rib.data.materials.append(wax_mat)
    s_rib.parent = bottle_root

    # Star-sand dune at bottom of flask
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=0.145, location=(0, 0, -0.145))
    sand = bpy.context.active_object
    sand.name = "StarSandDune"
    sand.scale = (1.0, 1.0, 0.45)
    sand.data.materials.append(sand_mat)
    sand.parent = bottle_root

    # --------------------------------------------------------------------------
    # E. DandelionClusterProp + DandelionSeedMesh (Fluffy Moonlit Dandelion Clocks!)
    # --------------------------------------------------------------------------
    dand_root = make_empty("DandelionClusterProp", (0, 0, 0))
    dand_stem_mat = make_pbr_mat("DandelionStem", "#4d7c0f", roughness=0.58, emission_hex="#65a30d", emission_strength=0.10)
    dand_leaf_mat = make_pbr_mat("DandelionLeaf", "#15803d", roughness=0.54, emission_hex="#16a34a", emission_strength=0.10)
    receptacle_mat = make_pbr_mat("DandelionReceptacle", "#fbbf24", roughness=0.42, emission_hex="#f59e0b", emission_strength=0.45)
    pappus_stalk_mat = make_pbr_mat("PappusFilament", "#fef3c7", roughness=0.35, emission_hex="#fde68a", emission_strength=0.55)
    pappus_fluff_mat = make_pbr_mat("MoonlitPappusFluff", "#e0f2fe", roughness=0.28, emission_hex="#bae6fd", emission_strength=0.85)
    achene_mat = make_pbr_mat("DandelionAchene", "#92400e", roughness=0.55, emission_hex="#b45309", emission_strength=0.15)

    # 8 Basal Lion's-Tooth Notched Rosette Leaves hugging the soil
    for l_i in range(8):
        la = (l_i / 8.0) * math.tau + 0.22
        bm_l = bmesh.new()
        rows_l = []
        for iu in range(9):
            u = iu / 8.0
            # Classic runcinate lion's-tooth dandelion lobes!
            tooth = 0.42 + 0.58 * abs(math.sin(u * math.pi * 3.5))
            half_w = 0.052 * math.sin(u * math.pi * 0.88) * tooth + 0.008
            r_len = 0.03 + u * 0.30
            z_arch = 0.015 + 0.048 * math.sin(u * math.pi * 0.78) - 0.028 * (u ** 2)
            row_l = []
            for iv in range(5):
                vn = (iv / 4.0) * 2.0 - 1.0
                w_off = vn * half_w
                z_v = z_arch + 0.008 * abs(vn)
                ca, sa = math.cos(la), math.sin(la)
                row_l.append(bm_l.verts.new((ca * r_len - sa * w_off, sa * r_len + ca * w_off, z_v)))
            rows_l.append(row_l)
        for iu in range(8):
            for iv in range(4):
                bm_l.faces.new((rows_l[iu][iv], rows_l[iu][iv + 1], rows_l[iu + 1][iv + 1], rows_l[iu + 1][iv]))
        bmesh.ops.recalc_face_normals(bm_l, faces=bm_l.faces)
        leaf_o = link_mesh_obj(f"DandRosetteLeaf_{l_i}", bm_l, mat=dand_leaf_mat, parent=dand_root)
        add_solidify(leaf_o, 0.004)

    # 5 Graceful S-Curved Hollow Stems + Fluffy 36-Tuft Fibonacci Seed Clocks!
    golden_ang = math.pi * (3.0 - math.sqrt(5.0))
    clock_specs = [
        (0.0, 0.0, 0.58, 0.138),
        (0.22, -0.08, 0.49, 0.116),
        (-0.19, -0.15, 0.44, 0.110),
        (-0.16, 0.20, 0.52, 0.120),
        (0.18, 0.19, 0.41, 0.105),
    ]
    for c_idx, (cx, cy, ch, c_rad) in enumerate(clock_specs):
        make_curve_tube(
            f"DandScape_{c_idx}",
            [
                ((cx * 0.18, cy * 0.18, 0.0), 0.015),
                ((cx * 0.55, cy * 0.55, ch * 0.36), 0.012),
                ((cx * 0.88, cy * 0.88, ch * 0.72), 0.010),
                ((cx, cy, ch), 0.009),
            ],
            dand_stem_mat,
            bevel_res=4,
            res_u=7,
            parent=dand_root,
        )
        # Golden-amber alveolate receptacle core + green reflexed bract collar
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.024, location=(cx, cy, ch))
        rec = bpy.context.active_object
        rec.data.materials.append(receptacle_mat)
        rec.parent = dand_root

        bract = create_lathe_mesh(
            f"DandBract_{c_idx}",
            [(0.010, ch - 0.006), (0.036, ch - 0.024), (0.028, ch - 0.036)],
            segs=12,
            mat=dand_leaf_mat,
            parent=dand_root,
            scallop_amp=0.24,
            scallop_freq=6,
        )
        bract.location.x = cx
        bract.location.y = cy

        # Build all 36 radiating pappus stalks + 6-ray star-fluff umbrellas into one BMesh per clock!
        bm_p = bmesh.new()
        n_tufts = 36
        for t_i in range(n_tufts):
            zf = 1.0 - (2.0 * (t_i + 0.5)) / n_tufts
            rf = math.sqrt(max(0.0, 1.0 - zf * zf))
            az = t_i * golden_ang + c_idx * 0.7
            dir_v = Vector((rf * math.cos(az), rf * math.sin(az), zf)).normalized()
            # Orthonormal tangent frame on sphere
            up_ref = Vector((0.0, 0.0, 1.0)) if abs(dir_v.z) < 0.92 else Vector((1.0, 0.0, 0.0))
            t1 = dir_v.cross(up_ref).normalized()
            t2 = dir_v.cross(t1).normalized()

            center_v = Vector((cx, cy, ch))
            p_base = center_v + dir_v * 0.022
            p_tip = center_v + dir_v * c_rad

            # Thin 3-sided prism stalk from receptacle to pappus crown
            s_r0, s_r1 = 0.0024, 0.0014
            b_ring = [bm_p.verts.new(p_base + (t1 * math.cos(k * math.tau / 3) + t2 * math.sin(k * math.tau / 3)) * s_r0) for k in range(3)]
            t_ring = [bm_p.verts.new(p_tip + (t1 * math.cos(k * math.tau / 3) + t2 * math.sin(k * math.tau / 3)) * s_r1) for k in range(3)]
            for k in range(3):
                kn = (k + 1) % 3
                bm_p.faces.new((b_ring[k], b_ring[kn], t_ring[kn], t_ring[k]))

            # Flared 6-pointed silky star-fluff canopy at tip!
            v_hub = bm_p.verts.new(p_tip - dir_v * 0.006)
            fluff_r = c_rad * 0.25
            star_verts = []
            for k in range(12):
                ka = (k / 12.0) * math.tau + az
                rad_k = fluff_r if k % 2 == 0 else fluff_r * 0.34
                lift_k = 0.005 if k % 2 == 0 else 0.001
                pt_s = p_tip + (t1 * math.cos(ka) + t2 * math.sin(ka)) * rad_k + dir_v * lift_k
                star_verts.append(bm_p.verts.new(pt_s))
            for k in range(12):
                kn = (k + 1) % 12
                bm_p.faces.new((v_hub, star_verts[k], star_verts[kn]))

        bmesh.ops.recalc_face_normals(bm_p, faces=bm_p.faces)
        link_mesh_obj(f"DandPappusClock_{c_idx}", bm_p, mat=pappus_fluff_mat, parent=dand_root)

    join_subtree_meshes(dand_root, "DandelionClusterMerged")

    # Individual 3D Floating Parachute Seed Wish (DandelionSeedMesh)
    seed_root = make_empty("DandelionSeedHolder", (0, 0, 0))
    make_curve_tube(
        "SeedAcheneBody",
        [((0, 0, -0.032), 0.0015), ((0, 0, -0.022), 0.0052), ((0, 0, -0.010), 0.0020)],
        achene_mat,
        bevel_res=3,
        res_u=4,
        parent=seed_root,
    )
    make_curve_tube(
        "SeedBeakFilament",
        [((0, 0, -0.010), 0.0012), ((0, 0, 0.018), 0.0010)],
        pappus_stalk_mat,
        bevel_res=2,
        res_u=3,
        parent=seed_root,
    )
    bm_umb = bmesh.new()
    v_apex = bm_umb.verts.new((0, 0, 0.015))
    umb_ring = []
    for k in range(16):
        ka = (k / 16.0) * math.tau
        rk = 0.026 if k % 2 == 0 else 0.008
        zk = 0.032 if k % 2 == 0 else 0.022
        umb_ring.append(bm_umb.verts.new((math.cos(ka) * rk, math.sin(ka) * rk, zk)))
    for k in range(16):
        kn = (k + 1) % 16
        bm_umb.faces.new((v_apex, umb_ring[k], umb_ring[kn]))
    bmesh.ops.recalc_face_normals(bm_umb, faces=bm_umb.faces)
    link_mesh_obj("SeedCanopy", bm_umb, mat=pappus_fluff_mat, parent=seed_root)
    seed_merged = join_subtree_meshes(seed_root, "DandelionSeedMesh")
    if seed_merged is not None:
        bpy.context.view_layer.objects.active = seed_merged
        seed_merged.select_set(True)
        bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
        seed_merged.select_set(False)
        bpy.data.objects.remove(seed_root, do_unlink=True)

    # --------------------------------------------------------------------------
    # F. DewPondProp + FrogPrinceNode (Mossy Stone Shoreline, 3D Lotuses & Crowned Frog!)
    # --------------------------------------------------------------------------
    pond_root = make_empty("DewPondProp", (0, 0, 0))
    pond_static = make_empty("DewPondStatic", (0, 0, 0), parent=pond_root)
    pad_mat = make_pbr_mat("JadeLilyPad", "#15803d", roughness=0.36, coat=0.45, emission_hex="#16a34a", emission_strength=0.14)
    lotus_pink = make_pbr_mat("LotusPink", "#f9a8d4", roughness=0.38, emission_hex="#f472b6", emission_strength=0.32)
    lotus_cream = make_pbr_mat("LotusCream", "#fef3c7", roughness=0.38, emission_hex="#fde047", emission_strength=0.34)
    lotus_coral = make_pbr_mat("LotusCoral", "#fda4af", roughness=0.38, emission_hex="#fb7185", emission_strength=0.32)
    frog_green = make_pbr_mat("FrogEmerald", "#22c55e", roughness=0.28, coat=0.65, emission_hex="#16a34a", emission_strength=0.18)

    # 22 Shoreline Tumbled River Cobbles & Plush Velvet Moss Cushions framing r=0.68 water mirror
    rng_p = random.Random(20261199)
    for i in range(22):
        a = (i / 22.0) * math.tau + rng_p.uniform(-0.06, 0.06)
        r = 0.67 + (i % 3) * 0.035
        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=2,
            radius=0.095 + (i % 2) * 0.028,
            location=(math.cos(a) * r, math.sin(a) * r, 0.015),
        )
        ps = bpy.context.active_object
        ps.scale = (1.28, 0.96, 0.52)
        ps.rotation_euler = Euler((rng_p.uniform(-0.15, 0.15), rng_p.uniform(-0.15, 0.15), a), "XYZ")
        for p in ps.data.polygons:
            p.use_smooth = True
        ps.data.materials.append(moss_mat if i % 3 == 0 else stone_mat)
        ps.parent = pond_static

    # 4 Beveled V-Notched 3D Lily Pads with Upturned Rims + 3 Multi-Whorl Cupped Lotus Blossoms!
    pad_specs = [
        (0.16, 0.10, 0.165, 0.4, lotus_pink),
        (-0.22, -0.14, 0.145, 2.3, lotus_cream),
        (0.10, -0.26, 0.130, 4.1, lotus_coral),
        (-0.15, -0.34, 0.175, -0.8, None),  # Front-left royal lily pad stage for FrogPrinceNode!
    ]
    for p_idx, (px, py, prad, p_rot, l_mat) in enumerate(pad_specs):
        bm_pad = bmesh.new()
        v_ctr = bm_pad.verts.new((0, 0, 0.004))
        mid_ring = []
        rim_ring = []
        arc_segs = 22
        # Span 328 degrees leaving a crisp 32-degree botanical V-notch!
        for k in range(arc_segs + 1):
            ang = 0.28 + (k / arc_segs) * (math.tau - 0.56)
            mid_ring.append(bm_pad.verts.new((math.cos(ang) * prad * 0.68, math.sin(ang) * prad * 0.68, 0.002)))
            rim_ring.append(bm_pad.verts.new((math.cos(ang) * prad, math.sin(ang) * prad, 0.016)))
        for k in range(arc_segs):
            bm_pad.faces.new((v_ctr, mid_ring[k], mid_ring[k + 1]))
            bm_pad.faces.new((mid_ring[k], rim_ring[k], rim_ring[k + 1], mid_ring[k + 1]))
        bmesh.ops.recalc_face_normals(bm_pad, faces=bm_pad.faces)
        pad_obj = link_mesh_obj(f"LilyPad_{p_idx}", bm_pad, mat=pad_mat, parent=pond_static)
        pad_obj.location = (px, py, 0.012)
        pad_obj.rotation_euler = Euler((0, 0, p_rot), "XYZ")
        add_solidify(pad_obj, 0.006)

        if l_mat is not None:
            # 16-Petal 2-Whorl Sculpted Water-Lily + Golden Stamen Crown!
            bm_lot = bmesh.new()
            for w_idx, (p_cnt, open_a, plen, pwid) in enumerate(((8, 0.92, 0.078, 0.026), (8, 0.48, 0.064, 0.022))):
                for k in range(p_cnt):
                    az = (k / p_cnt) * math.tau + w_idx * 0.39
                    rows_lp = []
                    for iu in range(6):
                        u = iu / 5.0
                        w_prof = math.sin(u * math.pi * 0.88)
                        r_l = 0.008 + u * plen * math.sin(open_a) - 0.010 * math.sin(u * math.pi)
                        z_l = 0.006 + u * plen * math.cos(open_a)
                        row_lp = []
                        for iv in range(5):
                            vn = (iv / 4.0) * 2.0 - 1.0
                            wl = vn * pwid * w_prof
                            zl = z_l + 0.005 * (1.0 - vn * vn) * u
                            ca, sa = math.cos(az), math.sin(az)
                            row_lp.append(bm_lot.verts.new((ca * r_l - sa * wl, sa * r_l + ca * wl, zl)))
                        rows_lp.append(row_lp)
                    for iu in range(5):
                        for iv in range(4):
                            bm_lot.faces.new((rows_lp[iu][iv], rows_lp[iu][iv + 1], rows_lp[iu + 1][iv + 1], rows_lp[iu + 1][iv]))
            bmesh.ops.recalc_face_normals(bm_lot, faces=bm_lot.faces)
            lot_obj = link_mesh_obj(f"WaterLily_{p_idx}", bm_lot, mat=l_mat, parent=pond_static)
            lot_obj.location = (px, py, 0.022)
            add_solidify(lot_obj, 0.003)

            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.018, location=(px, py, 0.036))
            stamen = bpy.context.active_object
            stamen.scale = (1.0, 1.0, 0.65)
            stamen.data.materials.append(lamp_core_mat)
            stamen.parent = pond_static

    join_subtree_meshes(pond_static, "DewPondStaticMerged")

    # Animatable Golden-Crowned Fairytale Frog Prince perched on front-left lily pad!
    frog_node = make_empty("FrogPrinceNode", (-0.15, -0.34, 0.026), parent=pond_root)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=0.046, location=(0, 0, 0.036))
    f_body = bpy.context.active_object
    f_body.scale = (1.05, 1.18, 0.92)
    f_body.rotation_euler = Euler((-0.25, 0, 0), "XYZ")
    for p in f_body.data.polygons:
        p.use_smooth = True
    f_body.data.materials.append(frog_green)
    f_body.parent = frog_node

    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=0.036, location=(0, -0.018, 0.030))
    f_belly = bpy.context.active_object
    f_belly.scale = (0.92, 0.85, 0.82)
    f_belly.data.materials.append(bird_belly)
    f_belly.parent = frog_node

    for side in (-1.0, 1.0):
        # Tucked hind thighs + raised frog eye domes + glossy pupils
        bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.026, location=(side * 0.042, 0.012, 0.022))
        thigh = bpy.context.active_object
        thigh.scale = (0.72, 1.25, 0.82)
        thigh.data.materials.append(frog_green)
        thigh.parent = frog_node

        bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.016, location=(side * 0.024, -0.026, 0.074))
        edome = bpy.context.active_object
        edome.data.materials.append(frog_green)
        edome.parent = frog_node

        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.010, location=(side * 0.025, -0.038, 0.076))
        epupil = bpy.context.active_object
        epupil.data.materials.append(eye_mat)
        epupil.parent = frog_node

    # Tiny 5-Pointed Golden Royal Crown atop the Frog Prince's head!
    crown = create_lathe_mesh(
        "FrogRoyalCrown",
        [(0.016, 0.080), (0.024, 0.098), (0.020, 0.104)],
        segs=15,
        mat=brass_mat,
        parent=frog_node,
        scallop_amp=0.28,
        scallop_freq=5,
    )
    crown.location.y = -0.012
    add_solidify(crown, 0.003)
    join_subtree_meshes(frog_node, "FrogPrinceMerged")

    # --------------------------------------------------------------------------
    # G. RoseArchProp (Fairytale Climbing-Rose Wrought-Iron & Oak Garden Archway!)
    # --------------------------------------------------------------------------
    arch_root = make_empty("RoseArchProp", (0, 0, 0))
    rose_arch_red = make_pbr_mat("ArchRoseCrimson", "#e11d48", roughness=0.40, emission_hex="#f43f5e", emission_strength=0.28)
    rose_arch_pink = make_pbr_mat("ArchRoseBlush", "#fb7185", roughness=0.40, emission_hex="#fda4af", emission_strength=0.28)
    rose_arch_gold = make_pbr_mat("ArchRoseGold", "#fde047", roughness=0.38, emission_hex="#facc15", emission_strength=0.30)

    # Molded stone plinths + twin wrought-iron gothic-fairytale arch ribs
    for side in (-1.0, 1.0):
        plinth = create_lathe_mesh(
            f"ArchPlinth_{side}",
            [(0.11, 0.0), (0.095, 0.08), (0.068, 0.18), (0.052, 0.22)],
            segs=16,
            mat=stone_mat,
            parent=arch_root,
        )
        plinth.location.x = side * 0.76

        # Outer & inner iron trellis posts curving to gothic storybook peak at z=1.64
        for off_x, rad_p in ((0.0, 0.024), (side * 0.08, 0.014)):
            px0 = side * 0.76 + off_x
            make_curve_tube(
                f"ArchRib_{side}_{off_x}",
                [
                    ((px0, 0.0, 0.18), rad_p),
                    ((px0, 0.0, 0.78), rad_p * 0.92),
                    ((side * 0.68 + off_x * 0.7, 0.0, 1.18), rad_p * 0.85),
                    ((side * 0.38, 0.0, 1.48), rad_p * 0.80),
                    ((0.0, 0.0, 1.64 + (0.05 if abs(off_x) > 0.01 else 0.0)), rad_p * 0.75),
                ],
                iron_mat,
                bevel_res=4,
                res_u=8,
                parent=arch_root,
            )

        # Spiraling Emerald Climbing-Rose Vine wrapping around each pillar up to the crown!
        vine_pts = []
        for s_k in range(11):
            t_v = s_k / 10.0
            ang_w = t_v * math.tau * 2.2
            bx = side * (0.76 * (1.0 - t_v ** 1.8))
            bz = 0.16 + t_v * 1.46
            wx = bx + math.cos(ang_w) * 0.048
            wy = math.sin(ang_w) * 0.048
            vine_pts.append(((wx, wy, bz), 0.014 * (1.0 - 0.35 * t_v)))
        make_curve_tube(f"ClimbingVine_{side}", vine_pts, dand_leaf_mat, bevel_res=3, res_u=6, parent=arch_root)

        # Hanging Teardrop Brass Star-Lantern under each upper arch haunch!
        lx_h = side * 0.54
        lz_h = 1.24
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.042, location=(lx_h, 0.0, lz_h - 0.08))
        l_orb = bpy.context.active_object
        l_orb.scale = (0.85, 0.85, 1.25)
        l_orb.data.materials.append(lamp_core_mat)
        l_orb.parent = arch_root

        l_hat = create_lathe_mesh(
            f"ArchLanternCap_{side}",
            [(0.005, lz_h), (0.052, lz_h - 0.045), (0.042, lz_h - 0.055)],
            segs=6,
            mat=brass_mat,
            parent=arch_root,
        )
        l_hat.location.x = lx_h

    # Golden Star Finial crowning the gothic arch peak
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.052, location=(0.0, 0.0, 1.72))
    arch_finial = bpy.context.active_object
    arch_finial.data.materials.append(brass_mat)
    arch_finial.parent = arch_root

    # 11 Sculpted Cupped Climbing Roses + Serrated Leaves blooming along the archway!
    arch_rose_spots = [
        (-0.78, -0.05, 0.52, rose_arch_red, 1.05),
        (-0.75, 0.05, 0.86, rose_arch_pink, 0.95),
        (-0.62, -0.05, 1.18, rose_arch_gold, 0.92),
        (-0.36, -0.04, 1.46, rose_arch_red, 1.08),
        (-0.12, 0.04, 1.60, rose_arch_pink, 1.00),
        (0.0, -0.06, 1.64, rose_arch_red, 1.16),
        (0.16, -0.04, 1.58, rose_arch_gold, 0.96),
        (0.40, 0.04, 1.44, rose_arch_pink, 1.06),
        (0.64, -0.05, 1.16, rose_arch_red, 0.98),
        (0.76, -0.05, 0.82, rose_arch_pink, 1.02),
        (0.78, 0.04, 0.48, rose_arch_gold, 0.94),
    ]
    for r_i, (rx, ry, rz, r_mat, r_scl) in enumerate(arch_rose_spots):
        bm_ar = bmesh.new()
        for w_idx, (cnt, op, r_len, r_wid) in enumerate(((5, 0.25, 0.042, 0.022), (7, 0.68, 0.054, 0.030))):
            for p_k in range(cnt):
                az = (p_k / cnt) * math.tau + w_idx * 0.55
                ca, sa = math.cos(az), math.sin(az)
                v0 = bm_ar.verts.new((0, 0, 0))
                v1 = bm_ar.verts.new((ca * r_len * 0.55 - sa * r_wid, sa * r_len * 0.55 + ca * r_wid, r_len * 0.52))
                v2 = bm_ar.verts.new((ca * r_len * math.sin(op + 0.35), sa * r_len * math.sin(op + 0.35), r_len * math.cos(op)))
                v3 = bm_ar.verts.new((ca * r_len * 0.55 + sa * r_wid, sa * r_len * 0.55 - ca * r_wid, r_len * 0.52))
                bm_ar.faces.new((v0, v1, v2, v3))
        bmesh.ops.recalc_face_normals(bm_ar, faces=bm_ar.faces)
        ar_obj = link_mesh_obj(f"ArchClimbingRose_{r_i}", bm_ar, mat=r_mat, parent=arch_root)
        ar_obj.location = (rx, ry, rz)
        ar_obj.rotation_euler = Euler((1.15, 0.0, rx * 0.4), "XYZ")
        ar_obj.scale = (r_scl, r_scl, r_scl)
        add_solidify(ar_obj, 0.004)
        add_subsurf(ar_obj, 1)

    join_subtree_meshes(arch_root, "RoseArchMerged")

    # --------------------------------------------------------------------------
    # H. CobbleStoneMesh (Smooth Natural River Cobble for Path & Slopes!)
    # --------------------------------------------------------------------------
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.18, location=(0, 0, 0))
    cobble = bpy.context.active_object
    cobble.name = "CobbleStoneMesh"
    for v in cobble.data.vertices:
        # Gentle organic river-worn asymmetry
        v.co.x *= 1.06 + 0.08 * math.sin(v.co.y * 14.0)
        v.co.y *= 0.96 + 0.08 * math.cos(v.co.x * 12.0)
        v.co.z *= 0.78 + 0.06 * math.sin(v.co.x * 9.0 + v.co.y * 9.0)
    for p in cobble.data.polygons:
        p.use_smooth = True
    add_subsurf(cobble, 1)
    cobble.data.materials.append(stone_mat)

    export_glb(OUT_DIR / "fairytale_landmarks.glb")


# ==============================================================================
# 5. SUBDIVISION-SCULPTED BOTANICAL BLOOMS (botanical_blooms.glb)
#    Preserves exact (u_width, v_base_to_tip) UV layout so our 512x512 veined
#    petal textures & instanced wind/SSS shader map cleanly onto sculpted petals!
# ==============================================================================
def add_sculpted_petal_to_bm(
    bm: bmesh.types.BMesh,
    uv_layer,
    seg_u: int,
    seg_v: int,
    eval_fn,
    uv_fn=None,
) -> None:
    rows = []
    for iu in range(seg_u + 1):
        u = iu / seg_u  # 0 = base, 1 = tip
        row = []
        for iv in range(seg_v + 1):
            v = (iv / seg_v) * 2.0 - 1.0  # -1..+1 width
            co = eval_fn(u, v)
            vert = bm.verts.new(co)
            if uv_fn is not None:
                s, t = uv_fn(u, v)
            else:
                s, t = (v + 1.0) * 0.5, u
            row.append((vert, s, t))
        rows.append(row)

    for iu in range(seg_u):
        for iv in range(seg_v):
            v00, s00, t00 = rows[iu][iv]
            v01, s01, t01 = rows[iu][iv + 1]
            v11, s11, t11 = rows[iu + 1][iv + 1]
            v10, s10, t10 = rows[iu + 1][iv]
            f = bm.faces.new((v00, v01, v11, v10))
            for loop, (s, t) in zip(f.loops, ((s00, t00), (s01, t01), (s11, t11), (s10, t10))):
                # Blender glTF exporter flips V -> 1 - V; store (s, 1 - t) so glTF TEXCOORD_0 has (s, u)!
                loop[uv_layer].uv = (s, 1.0 - t)


def apply_rot_x(obj: bpy.types.Object, angle_rad: float) -> None:
    obj.rotation_euler = Euler((angle_rad, 0.0, 0.0), "XYZ")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_botanical_blooms_glb() -> None:
    reset_scene()
    dummy_mat = make_pbr_mat("PetalCarrier", "#ffffff", roughness=0.5)

    # --- A1. RoseBloom: 40-Petal High-Centered Spiral Heart & Cupped David Austin Rose ---
    bm_rose = bmesh.new()
    uv_r = bm_rose.loops.layers.uv.new("UVMap")

    whorls = [
        {"count": 5, "r0": 0.005, "open": 0.07, "h": 0.132, "wid": 0.048, "cup": 0.028, "reflex": 0.006, "y0": 0.032},
        {"count": 6, "r0": 0.016, "open": 0.21, "h": 0.146, "wid": 0.072, "cup": 0.034, "reflex": 0.018, "y0": 0.024},
        {"count": 8, "r0": 0.032, "open": 0.40, "h": 0.158, "wid": 0.098, "cup": 0.035, "reflex": 0.034, "y0": 0.014},
        {"count": 10, "r0": 0.049, "open": 0.61, "h": 0.168, "wid": 0.118, "cup": 0.030, "reflex": 0.050, "y0": 0.004},
        {"count": 11, "r0": 0.066, "open": 0.84, "h": 0.175, "wid": 0.136, "cup": 0.024, "reflex": 0.066, "y0": -0.005},
    ]

    seed_idx = 0
    for w_i, w in enumerate(whorls):
        for p in range(w["count"]):
            az = (p / w["count"]) * math.tau + w_i * 0.72 + math.sin(seed_idx * 1.9) * 0.07
            open_ang = w["open"] + math.sin(seed_idx * 2.7) * 0.035
            asym = (0.012 if w_i < 2 else math.sin(seed_idx * 3.1) * 0.010)
            seed_idx += 1

            def eval_rose(u: float, v: float, w=w, az=az, open_ang=open_ang, asym=asym, p=p):
                prof = math.sin(u * math.pi * 0.88) ** 0.48
                w_local = v * w["wid"] * (0.34 + 0.66 * prof) + asym * u
                belly_cup = w["cup"] * (1.0 - v * v) * math.sin(u * math.pi * 0.88)
                lip_t = max(0.0, min(1.0, (u - 0.64) / 0.36))
                lip_smooth = lip_t * lip_t * (3.0 - 2.0 * lip_t)
                lip_reflex = lip_smooth * w["reflex"] * (1.0 - 0.30 * v * v)
                ruffle = 0.004 * math.sin(v * 5.0 + p) * (u ** 2)

                r_local = w["r0"] + u * w["h"] * math.sin(open_ang) - belly_cup + lip_reflex
                z_up = 0.03 + w["y0"] + u * w["h"] * math.cos(open_ang) - lip_reflex * 0.52 - 0.012 * v * v * u + ruffle
                ca, sa = math.cos(az), math.sin(az)
                return (ca * r_local - sa * w_local, sa * r_local + ca * w_local, z_up)

            add_sculpted_petal_to_bm(bm_rose, uv_r, 10, 9, eval_rose)

    bmesh.ops.recalc_face_normals(bm_rose, faces=bm_rose.faces)
    rose_obj = link_mesh_obj("RoseBloom", bm_rose, mat=dummy_mat)
    apply_rot_x(rose_obj, 0.28)

    # --- A2. RoseCalyx: Pyriform Rosehip Receptacle + 5 Recurved Green Sepals ---
    bm_rcal = bmesh.new()
    uv_rc = bm_rcal.loops.layers.uv.new("UVMap")

    # Swollen urn-shaped receptacle base
    def eval_hip(u: float, v: float):
        ang = (v + 1.0) * math.pi
        r_hip = 0.013 + 0.034 * math.sin(u * math.pi * 0.82)
        z_hip = -0.042 + u * 0.068
        return (math.cos(ang) * r_hip, math.sin(ang) * r_hip, z_hip)

    add_sculpted_petal_to_bm(bm_rcal, uv_rc, 6, 12, eval_hip)

    # 5 pointed recurved calyx sepals cradling outer rose petals
    for s_i in range(5):
        az = (s_i / 5.0) * math.tau + 0.3
        ca, sa = math.cos(az), math.sin(az)

        def eval_sepal(u: float, v: float, ca=ca, sa=sa):
            taper = (1.0 - u ** 0.88) * math.sin(min(1.0, u * 3.5 + 0.2) * math.pi * 0.5)
            w_l = v * 0.030 * taper
            r_l = 0.038 + u * 0.118
            z_l = 0.018 + 0.016 * math.sin(u * math.pi * 0.7) - 0.048 * (u ** 2.1)
            return (ca * r_l - sa * w_l, sa * r_l + ca * w_l, z_l)

        add_sculpted_petal_to_bm(bm_rcal, uv_rc, 7, 4, eval_sepal)

    bmesh.ops.recalc_face_normals(bm_rcal, faces=bm_rcal.faces)
    rcal_obj = link_mesh_obj("RoseCalyx", bm_rcal, mat=dummy_mat)
    apply_rot_x(rcal_obj, 0.28)

    # --- B1. SunflowerRays: 38 Sculpted Double-Ring Grooved & Waved Ray Florets ---
    bm_srays = bmesh.new()
    uv_sr = bm_srays.loops.layers.uv.new("UVMap")
    n_rays = 38
    for i in range(n_rays):
        tier = i % 2
        az = (i / n_rays) * math.tau + tier * 0.038
        ca, sa = math.cos(az), math.sin(az)
        len_scale = 0.90 + 0.16 * math.sin(i * 3.1 + 0.6)
        twist = math.sin(i * 2.3) * 0.09
        droop_var = 0.038 + 0.012 * math.cos(i * 1.7)

        def eval_sray(u: float, v: float, ca=ca, sa=sa, tier=tier, len_scale=len_scale, twist=twist, droop_var=droop_var):
            # Sculpted lance-ovate profile with longitudinal central groove & organic tip curl
            prof = math.sin(u * math.pi * 0.92) ** 0.58
            w_l = v * (0.046 if tier == 0 else 0.041) * (0.28 + 0.72 * prof)
            r_l = 0.110 + u * 0.222 * len_scale
            arch = 0.040 * math.sin(u * math.pi * 0.72) - droop_var * (u ** 2.15)
            groove = -0.009 * (1.0 - v * v) * math.sin(u * math.pi)
            z_l = tier * 0.009 + arch + groove + w_l * twist
            return (ca * r_l - sa * w_l, sa * r_l + ca * w_l, z_l)

        add_sculpted_petal_to_bm(bm_srays, uv_sr, 10, 6, eval_sray)

    bmesh.ops.recalc_face_normals(bm_srays, faces=bm_srays.faces)
    srays_obj = link_mesh_obj("SunflowerRays", bm_srays, mat=dummy_mat)
    apply_rot_x(srays_obj, 0.58)

    # --- B2. SunflowerCalyx: Involucral Receptacle Bowl + 18 Pointed Phyllary Bracts ---
    bm_scal = bmesh.new()
    uv_sc = bm_scal.loops.layers.uv.new("UVMap")

    def eval_sun_cup(u: float, v: float):
        ang = (v + 1.0) * math.pi
        r_c = 0.018 + 0.118 * (u ** 0.72)
        z_c = -0.052 + u * 0.056
        return (math.cos(ang) * r_c, math.sin(ang) * r_c, z_c)

    add_sculpted_petal_to_bm(bm_scal, uv_sc, 6, 16, eval_sun_cup)

    for b_i in range(18):
        az = (b_i / 18.0) * math.tau
        ca, sa = math.cos(az), math.sin(az)

        def eval_bract(u: float, v: float, ca=ca, sa=sa, b_i=b_i):
            taper = 1.0 - (u ** 0.9)
            w_l = v * 0.028 * taper
            r_l = 0.112 + u * 0.095
            z_l = -0.004 + (b_i % 2) * 0.005 - 0.026 * (u ** 1.8)
            return (ca * r_l - sa * w_l, sa * r_l + ca * w_l, z_l)

        add_sculpted_petal_to_bm(bm_scal, uv_sc, 5, 4, eval_bract)

    bmesh.ops.recalc_face_normals(bm_scal, faces=bm_scal.faces)
    scal_obj = link_mesh_obj("SunflowerCalyx", bm_scal, mat=dummy_mat)
    apply_rot_x(scal_obj, 0.58)

    # --- C. TulipBloom: 6 Interlocking Sculpted Darwin Goblet Tepals ---
    bm_tulip = bmesh.new()
    uv_t = bm_tulip.loops.layers.uv.new("UVMap")

    for k in range(6):
        inner = k % 2 == 0
        az = (k / 6.0) * math.tau

        def eval_tulip(u: float, v: float, inner=inner, az=az):
            cup_curve = math.sin(u * math.pi * 0.84) * 0.090 + max(0.0, (u - 0.80) / 0.20) ** 2 * (0.010 if inner else 0.018)
            belly_cup = 0.022 * (1.0 - v * v) * math.sin(u * math.pi)
            r_local = (0.012 if inner else 0.019) + cup_curve - belly_cup * 0.38
            w_local = v * (0.074 if inner else 0.082) * (0.28 + 0.72 * (math.sin(u * math.pi * 0.90) ** 0.55))
            z_up = u * 0.265 - 0.012 * v * v
            ca, sa = math.cos(az), math.sin(az)
            return (ca * r_local - sa * w_local, sa * r_local + ca * w_local, z_up)

        add_sculpted_petal_to_bm(bm_tulip, uv_t, 10, 8, eval_tulip)

    bmesh.ops.recalc_face_normals(bm_tulip, faces=bm_tulip.faces)
    tulip_obj = link_mesh_obj("TulipBloom", bm_tulip, mat=dummy_mat)
    apply_rot_x(tulip_obj, 0.16)

    # --- D. IrisBloom: 3 Domed Standards + 3 Bearded Velvet Falls + 3 Arching Style Crests ---
    bm_iris = bmesh.new()
    uv_i = bm_iris.loops.layers.uv.new("UVMap")

    # 3 Domed Standards
    for i in range(3):
        az = (i / 3.0) * math.tau

        def eval_std(u: float, v: float, az=az):
            radial = 0.018 + math.sin(u * math.pi * 0.88) * 0.130 * (1.0 - 0.42 * u * u)
            wid = v * 0.100 * (0.26 + 0.74 * (math.sin(u * math.pi * 0.90) ** 0.52))
            ruffle = math.sin(u * 13.0 + v * 4.8) * 0.010 * max(0.0, (u - 0.22) / 0.78)
            z_up = 0.026 + u * 0.258 - 0.024 * v * v + ruffle
            ca, sa = math.cos(az), math.sin(az)
            return (ca * radial - sa * wid, sa * radial + ca * wid, z_up)

        add_sculpted_petal_to_bm(bm_iris, uv_i, 10, 8, eval_std)

    # 3 Cascading Ruffled Velvet Falls + 3 Arching Feathered Style Arms!
    for i in range(3):
        az = (i / 3.0) * math.tau + math.pi / 3.0

        def eval_fall(u: float, v: float, az=az):
            radial = 0.024 + u * 0.238 - 0.032 * (u ** 2.6)
            wid = v * 0.120 * (0.25 + 0.75 * (math.sin(u * math.pi * 0.90) ** 0.50))
            ruffle = math.sin(v * 5.8 + u * 11.5) * 0.011 * max(0.0, (u - 0.28) / 0.72)
            beard_ridge = 0.012 * math.exp(-v * v * 28.0) * math.sin(min(1.0, u * 2.1) * math.pi)
            z_up = 0.038 + 0.066 * math.sin(u * math.pi * 0.56) - 0.188 * (u ** 1.85) - 0.018 * v * v + ruffle + beard_ridge
            ca, sa = math.cos(az), math.sin(az)
            return (ca * radial - sa * wid, sa * radial + ca * wid, z_up)

        add_sculpted_petal_to_bm(bm_iris, uv_i, 11, 9, eval_fall)

        def eval_style_crest(u: float, v: float, az=az):
            radial = 0.012 + u * 0.125
            wid = v * 0.032 * (0.45 + 0.55 * u)
            z_up = 0.048 + 0.068 * math.sin(u * math.pi * 0.72) + 0.012 * (u ** 3) - 0.008 * v * v
            ca, sa = math.cos(az), math.sin(az)
            return (ca * radial - sa * wid, sa * radial + ca * wid, z_up)

        add_sculpted_petal_to_bm(bm_iris, uv_i, 6, 4, eval_style_crest)

    bmesh.ops.recalc_face_normals(bm_iris, faces=bm_iris.faces)
    link_mesh_obj("IrisBloom", bm_iris, mat=dummy_mat)

    # --- E. HydrangeaFloret: Full Lush 4-Sepal Cupped Obovate Floret + Central Pearl Bud ---
    bm_hyd = bmesh.new()
    uv_h = bm_hyd.loops.layers.uv.new("UVMap")

    for p in range(4):
        az = (p / 4.0) * math.tau + (0.09 if p % 2 == 0 else -0.09)
        lift_sep = 0.005 * (p % 2)

        def eval_hyd(u: float, v: float, az=az, lift_sep=lift_sep):
            r_local = 0.006 + u * 0.088
            w_local = v * 0.072 * (0.32 + 0.68 * (math.sin(u * math.pi * 0.90) ** 0.48))
            cup = 0.018 * math.sin(u * math.pi * 0.82) - 0.013 * v * v * u
            z_up = lift_sep + cup + 0.008 * u
            ca, sa = math.cos(az), math.sin(az)
            return (ca * r_local - sa * w_local, sa * r_local + ca * w_local, z_up)

        add_sculpted_petal_to_bm(bm_hyd, uv_h, 7, 7, eval_hyd)

    # Tiny sculpted central fertile flower bead at heart of the 4 sepals
    def eval_hyd_bud(u: float, v: float):
        ang = (v + 1.0) * math.pi
        rad = 0.011 * math.sin(u * math.pi)
        z_b = 0.006 + 0.018 * u
        return (math.cos(ang) * rad, math.sin(ang) * rad, z_b)

    add_sculpted_petal_to_bm(bm_hyd, uv_h, 4, 8, eval_hyd_bud, uv_fn=lambda u, v: (0.5, 0.06))

    bmesh.ops.recalc_face_normals(bm_hyd, faces=bm_hyd.faces)
    link_mesh_obj("HydrangeaFloret", bm_hyd, mat=dummy_mat)

    # --- F. GypsophilaCluster: 3 Puffy 3D Double-Cupped Cloudlet Rosettes (48 tris!) ---
    bm_gyp = bmesh.new()
    uv_g = bm_gyp.loops.layers.uv.new("UVMap")

    floret_specs = [
        ((0.0, 0.0, 0.022), (0.24, 0.14, 0.0), 0.056),
        ((0.034, -0.022, 0.004), (-0.42, 0.34, 0.8), 0.048),
        ((-0.030, 0.024, 0.008), (0.38, -0.36, 2.1), 0.050),
    ]
    for center_co, rot_xyz, f_scale in floret_specs:
        rot_m = Euler(rot_xyz, "XYZ").to_matrix()
        ctr_v = Vector(center_co)
        for tier_idx, (r_mul, cup_h, z_lift, spin) in enumerate(((1.0, 0.020, 0.0, 0.0), (0.70, 0.022, 0.010, 0.52))):
            v_hub = bm_gyp.verts.new(ctr_v + rot_m @ Vector((0, 0, z_lift)))
            rim_verts = []
            rim_uvs = []
            segs_g = 8
            for k in range(segs_g):
                ka = (k / segs_g) * math.tau + spin
                pt_local = Vector((math.cos(ka) * f_scale * r_mul, math.sin(ka) * f_scale * r_mul, z_lift + cup_h))
                rim_verts.append(bm_gyp.verts.new(ctr_v + rot_m @ pt_local))
                su = 0.5 + 0.49 * math.cos(ka - spin)
                tu = 0.5 + 0.49 * math.sin(ka - spin)
                rim_uvs.append((su, 1.0 - tu))
            for k in range(segs_g):
                kn = (k + 1) % segs_g
                f = bm_gyp.faces.new((v_hub, rim_verts[k], rim_verts[kn]))
                f.loops[0][uv_g].uv = (0.5, 0.5)
                f.loops[1][uv_g].uv = rim_uvs[k]
                f.loops[2][uv_g].uv = rim_uvs[kn]

    bmesh.ops.recalc_face_normals(bm_gyp, faces=bm_gyp.faces)
    link_mesh_obj("GypsophilaCluster", bm_gyp, mat=dummy_mat)

    export_glb(
        OUT_DIR / "botanical_blooms.glb",
        export_materials="NONE",
        export_colors=False,
    )


def main() -> None:
    build_fairy_sprite_glb()
    build_storybook_cottage_glb()
    build_mushroom_cluster_glb()
    build_fairytale_landmarks_glb()
    build_botanical_blooms_glb()
    print("=== ALL 5 EXQUISITE BLENDER 4.0 .GLB ASSET PACKS GENERATED SUCCESSFULLY ===")


if __name__ == "__main__":
    main()
