#!/usr/bin/env python3
"""Shared Blender 4.0.2 procedural texture, bmesh sculpting, material, and GLB
export toolkit for Iris Bay Route 2 overhaul (`bloom-for-you`).
"""

from __future__ import annotations

import math
import random
import struct
import zlib
from pathlib import Path
from typing import Callable, Iterable, Sequence

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector


# ---------------------------------------------------------------------------
# Pure-Python RGBA PNG Writer + Procedural 2D Texture Bakers (Zero External Deps)
# ---------------------------------------------------------------------------

def _png_chunk(tag: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)


def write_rgba_png(path: Path, width: int, height: int, rows_rgba: bytearray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        start = y * stride
        raw.extend(rows_rgba[start : start + stride])
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    compressed = zlib.compress(bytes(raw), level=6)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", compressed)
        + _png_chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def clamp01(v: float) -> float:
    return 0.0 if v < 0.0 else (1.0 if v > 1.0 else v)


def mix_rgb(c0, c1, t: float):
    t = clamp01(t)
    return (
        c0[0] + (c1[0] - c0[0]) * t,
        c0[1] + (c1[1] - c0[1]) * t,
        c0[2] + (c1[2] - c0[2]) * t,
    )


def set_px(buf: bytearray, w: int, h: int, x: int, y: int, rgba) -> None:
    if x < 0 or x >= w or y < 0 or y >= h:
        return
    i = (y * w + x) * 4
    r, g, b, a = rgba
    buf[i + 0] = max(0, min(255, int(r * 255)))
    buf[i + 1] = max(0, min(255, int(g * 255)))
    buf[i + 2] = max(0, min(255, int(b * 255)))
    buf[i + 3] = max(0, min(255, int(a * 255)))


def _hash2(ix: int, iy: int, seed: int = 17) -> float:
    n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) & 0x7FFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0x7FFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0


def vnoise(x: float, y: float, seed: int = 17) -> float:
    ix = math.floor(x)
    iy = math.floor(y)
    fx = x - ix
    fy = y - iy
    ux = fx * fx * (3.0 - 2.0 * fx)
    uy = fy * fy * (3.0 - 2.0 * fy)
    a = _hash2(ix, iy, seed)
    b = _hash2(ix + 1, iy, seed)
    c = _hash2(ix, iy + 1, seed)
    d = _hash2(ix + 1, iy + 1, seed)
    return (a * (1.0 - ux) + b * ux) * (1.0 - uy) + (c * (1.0 - ux) + d * ux) * uy


def fbm2(x: float, y: float, seed: int = 17, octaves: int = 3) -> float:
    val = 0.0
    amp = 0.5
    freq = 1.0
    norm = 0.0
    for o in range(octaves):
        val += amp * vnoise(x * freq, y * freq, seed + o * 31)
        norm += amp
        amp *= 0.5
        freq *= 2.04
    return val / max(1e-6, norm)


def make_packed_texture(path: Path, w: int, h: int, fn: Callable[[float, float], tuple]) -> bpy.types.Image:
    buf = bytearray(w * h * 4)
    for y in range(h):
        v = 1.0 - y / max(1, h - 1)
        for x in range(w):
            u = x / max(1, w - 1)
            set_px(buf, w, h, x, y, fn(u, v))
    write_rgba_png(path, w, h, buf)
    img = bpy.data.images.load(str(path), check_existing=True)
    img.pack()
    return img


# ---------------------------------------------------------------------------
# Blender Scene & Material Helpers (Blender 4.0 Principled BSDF Compatible)
# ---------------------------------------------------------------------------

def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def _set_bsdf_input(bsdf, names: Sequence[str], value) -> None:
    for name in names:
        sock = bsdf.inputs.get(name)
        if sock is not None:
            sock.default_value = value
            return


def make_pbr_material(
    name: str,
    base_color=(0.8, 0.8, 0.8, 1.0),
    roughness: float = 0.65,
    metallic: float = 0.0,
    emission=None,
    emission_strength: float = 0.0,
    alpha: float = 1.0,
    image: bpy.types.Image | None = None,
    double_sided: bool = False,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    mat.use_backface_culling = not double_sided
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    col4 = base_color if len(base_color) == 4 else (*base_color, 1.0)
    bsdf.inputs["Base Color"].default_value = col4
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    _set_bsdf_input(bsdf, ("Specular IOR Level", "Specular"), 0.38)

    if alpha < 0.999:
        mat.blend_method = "BLEND"
        bsdf.inputs["Alpha"].default_value = alpha
    if emission is not None and emission_strength > 0.0:
        em4 = emission if len(emission) == 4 else (*emission, 1.0)
        _set_bsdf_input(bsdf, ("Emission Color", "Emission"), em4)
        _set_bsdf_input(bsdf, ("Emission Strength",), emission_strength)

    if image is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha < 0.999:
            nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    return mat


def create_mesh_object(name: str, bm: bmesh.types.BMesh, mat: bpy.types.Material | None = None) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for p in mesh.polygons:
        p.use_smooth = True
    if mat is not None:
        mesh.materials.append(mat)
    return obj


def assign_mat_all(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.material_index = 0


def ensure_uv_box(obj: bpy.types.Object, scale: float = 0.5) -> None:
    """Fast cubic UV projection directly in bmesh so packed textures tile crisply."""
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in f.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                loop[uv_layer].uv = (co.x * scale, co.y * scale)
            elif ax >= ay:
                loop[uv_layer].uv = (co.y * scale, co.z * scale)
            else:
                loop[uv_layer].uv = (co.x * scale, co.z * scale)
    bm.to_mesh(mesh)
    bm.free()


def join_objects(name: str, objs: Sequence[bpy.types.Object], parent: bpy.types.Object | None = None) -> bpy.types.Object | None:
    valid = [o for o in objs if o is not None and o.type == "MESH"]
    if not valid:
        return None
    if len(valid) == 1:
        obj = valid[0]
        obj.name = name
    else:
        bpy.ops.object.select_all(action="DESELECT")
        for o in valid:
            o.select_set(True)
        bpy.context.view_layer.objects.active = valid[0]
        bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        obj.name = name
    if parent is not None:
        obj.parent = parent
    return obj


# ---------------------------------------------------------------------------
# Architectural & Organic Sculpting Builders
# ---------------------------------------------------------------------------

def add_beveled_box(
    bm: bmesh.types.BMesh,
    center: Sequence[float],
    size: Sequence[float],
    rot_euler: Sequence[float] = (0.0, 0.0, 0.0),
    bevel: float = 0.015,
    bevel_segs: int = 1,
    mat_idx: int = 0,
    flat_faces: bool = False,
) -> list[bmesh.types.BMesh]:
    """Create a crisply beveled box into an existing BMesh."""
    sx, sy, sz = size
    temp = bmesh.new()
    bmesh.ops.create_cube(temp, size=1.0)
    bmesh.ops.scale(temp, vec=(sx, sy, sz), verts=temp.verts)
    if bevel > 1e-4:
        b = min(bevel, min(sx, sy, sz) * 0.25)
        bmesh.ops.bevel(
            temp,
            geom=list(temp.edges),
            offset=b,
            segments=bevel_segs,
            profile=0.5,
            affect="EDGES",
            clamp_overlap=True,
        )
    rot_m = Euler(rot_euler, "XYZ").to_matrix().to_4x4()
    trans_m = Matrix.Translation(Vector(center))
    bmesh.ops.transform(temp, matrix=trans_m @ rot_m, verts=temp.verts)
    for f in temp.faces:
        f.material_index = mat_idx
        f.smooth = not flat_faces
    tmp_mesh = bpy.data.meshes.new("_tmp_box")
    temp.to_mesh(tmp_mesh)
    temp.free()
    bm.from_mesh(tmp_mesh)
    bpy.data.meshes.remove(tmp_mesh)
    return []


def add_cylinder_part(
    bm: bmesh.types.BMesh,
    center: Sequence[float],
    r1: float,
    r2: float,
    height: float,
    segs: int = 20,
    rot_euler: Sequence[float] = (0.0, 0.0, 0.0),
    cap_ends: bool = True,
    mat_idx: int = 0,
) -> None:
    temp = bmesh.new()
    bmesh.ops.create_cone(
        temp,
        cap_ends=cap_ends,
        cap_tris=False,
        segments=segs,
        radius1=r1,
        radius2=r2,
        depth=height,
    )
    rot_m = Euler(rot_euler, "XYZ").to_matrix().to_4x4()
    trans_m = Matrix.Translation(Vector(center))
    bmesh.ops.transform(temp, matrix=trans_m @ rot_m, verts=temp.verts)
    for f in temp.faces:
        f.material_index = mat_idx
        f.smooth = True
    tmp_mesh = bpy.data.meshes.new("_tmp_cyl")
    temp.to_mesh(tmp_mesh)
    temp.free()
    bm.from_mesh(tmp_mesh)
    bpy.data.meshes.remove(tmp_mesh)


def add_uv_sphere_part(
    bm: bmesh.types.BMesh,
    center: Sequence[float],
    scale: Sequence[float],
    u_segs: int = 20,
    v_rings: int = 12,
    rot_euler: Sequence[float] = (0.0, 0.0, 0.0),
    noise_amp: float = 0.0,
    noise_freq: float = 2.0,
    seed: int = 1,
    mat_idx: int = 0,
) -> None:
    temp = bmesh.new()
    bmesh.ops.create_uvsphere(temp, u_segments=u_segs, v_segments=v_rings, radius=1.0)
    if noise_amp > 0.0:
        for v in temp.verts:
            p = v.co
            n = fbm2(p.x * noise_freq + p.z * 0.7, p.y * noise_freq - p.z * 0.5, seed=seed, octaves=3)
            k = 1.0 + (n - 0.5) * 2.0 * noise_amp
            v.co *= k
    bmesh.ops.scale(temp, vec=scale, verts=temp.verts)
    rot_m = Euler(rot_euler, "XYZ").to_matrix().to_4x4()
    trans_m = Matrix.Translation(Vector(center))
    bmesh.ops.transform(temp, matrix=trans_m @ rot_m, verts=temp.verts)
    for f in temp.faces:
        f.material_index = mat_idx
        f.smooth = True
    tmp_mesh = bpy.data.meshes.new("_tmp_sph")
    temp.to_mesh(tmp_mesh)
    temp.free()
    bm.from_mesh(tmp_mesh)
    bpy.data.meshes.remove(tmp_mesh)


def add_lathe_part(
    bm: bmesh.types.BMesh,
    profile_rz: Sequence[tuple[float, float]],
    segs: int = 28,
    offset: Sequence[float] = (0.0, 0.0, 0.0),
    scale_xy: tuple[float, float] = (1.0, 1.0),
    rot_euler: Sequence[float] = (0.0, 0.0, 0.0),
    mat_idx: int = 0,
) -> None:
    """Revolve a (radius, z) profile into BMesh with clean quad faces & outward normals."""
    temp = bmesh.new()
    rings = []
    for r, z in profile_rz:
        rr = max(0.0005, r)
        ring = []
        for s in range(segs):
            a = (s / segs) * math.tau
            ring.append(temp.verts.new((math.cos(a) * rr * scale_xy[0], math.sin(a) * rr * scale_xy[1], z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        r0, r1 = rings[i], rings[i + 1]
        for s in range(segs):
            ns = (s + 1) % segs
            f = temp.faces.new((r0[s], r0[ns], r1[ns], r1[s]))
            f.material_index = mat_idx
            f.smooth = True
    bmesh.ops.recalc_face_normals(temp, faces=temp.faces)
    rot_m = Euler(rot_euler, "XYZ").to_matrix().to_4x4()
    trans_m = Matrix.Translation(Vector(offset))
    bmesh.ops.transform(temp, matrix=trans_m @ rot_m, verts=temp.verts)
    tmp_mesh = bpy.data.meshes.new("_tmp_lathe")
    temp.to_mesh(tmp_mesh)
    temp.free()
    bm.from_mesh(tmp_mesh)
    bpy.data.meshes.remove(tmp_mesh)


def add_tube_along_curve(
    bm: bmesh.types.BMesh,
    pts: Sequence[Vector],
    radii: Sequence[float],
    radial_segs: int = 10,
    cap_start: bool = True,
    cap_end: bool = True,
    mat_idx: int = 0,
) -> None:
    """Swept circular cross-section along 3D polyline with parallel-transport frames."""
    if len(pts) < 2:
        return
    temp = bmesh.new()
    rings = []
    prev_n = None
    for idx, p in enumerate(pts):
        if idx == 0:
            t = (pts[1] - pts[0]).normalized()
        elif idx == len(pts) - 1:
            t = (pts[-1] - pts[-2]).normalized()
        else:
            t = (pts[idx + 1] - pts[idx - 1]).normalized()
        if prev_n is None:
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            n = t.cross(ref).normalized()
        else:
            n = (prev_n - t * prev_n.dot(t))
            n = n.normalized() if n.length > 1e-6 else t.orthogonal().normalized()
        prev_n = n
        b = t.cross(n).normalized()
        r = radii[idx]
        ring = []
        for s in range(radial_segs):
            a = (s / radial_segs) * math.tau
            vco = p + (n * math.cos(a) + b * math.sin(a)) * r
            ring.append(temp.verts.new(vco))
        rings.append(ring)
    for i in range(len(rings) - 1):
        r0, r1 = rings[i], rings[i + 1]
        for s in range(radial_segs):
            ns = (s + 1) % radial_segs
            f = temp.faces.new((r0[s], r0[ns], r1[ns], r1[s]))
            f.material_index = mat_idx
            f.smooth = True
    if cap_start:
        f = temp.faces.new(list(reversed(rings[0])))
        f.material_index = mat_idx
    if cap_end:
        f = temp.faces.new(rings[-1])
        f.material_index = mat_idx
    bmesh.ops.recalc_face_normals(temp, faces=temp.faces)
    tmp_mesh = bpy.data.meshes.new("_tmp_tube")
    temp.to_mesh(tmp_mesh)
    temp.free()
    bm.from_mesh(tmp_mesh)
    bpy.data.meshes.remove(tmp_mesh)


# ---------------------------------------------------------------------------
# Coordinate Conversion (Babylon / Three.js Y-up <-> Blender Z-up)
# ---------------------------------------------------------------------------
# Note: glTF export (`export_yup=True`) converts Blender (x, y, z) -> glTF (x, z, -y)!
# Therefore:
#   blender_x = target_x
#   blender_y = -target_z
#   blender_z = target_y
# Verify: when glTF exports Y-up, target_x -> x, target_y -> y, target_z -> z!
def yup(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


def export_glb(filepath: Path, objs: Sequence[bpy.types.Object] | None = None, with_anims: bool = False) -> Path:
    filepath.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    targets = list(objs) if objs is not None else list(bpy.context.scene.objects)
    for o in targets:
        if o is not None:
            o.select_set(True)
    if targets:
        bpy.context.view_layer.objects.active = targets[0]
    bpy.ops.export_scene.gltf(
        filepath=str(filepath),
        use_selection=(objs is not None),
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_animations=with_anims,
        export_nla_strips=with_anims,
        export_morph=with_anims,
        export_morph_normal=False,
        export_skins=with_anims,
        export_materials="EXPORT",
    )
    print(f"[blender] Exported {filepath.name} -> {filepath.stat().st_size:,} bytes")
    return filepath
