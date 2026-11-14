"""Build `site/assets/models/stylized_trees.glb` — Genshin / Teyvat-inspired lush stylized trees.

Visual design:
1. Sculpted organic sweeping trunks with soft root flares, cylindrical bark UVs (no box seams),
   and asymmetric multi-height boughs that taper seamlessly into upper twigs.
2. True 2-layer Teyvat painterly crown:
   - Compact `0.80x` inner `CanopyCloud` core (opaque, non-glare velvety gradient + smoothed
     spherical outward normals) eliminating all hollow gaps or see-through X-planes.
   - Lush overlapping `1.0x..1.20x` outer `CanopyTufts` cloak (bright multi-petal blossom
     and layered leaf clusters with matched palette + radial outward normals) hiding inner
     sphere contours and creating a soft, feathery Genshin silhouette from every camera angle.
3. Tactile 3D Italian Cypress flame spires & 3D V-ribbed arched feathered Palms.

Exports all 12 prototype TransformNodes expected by `site/modules/flora-and-fx.js`:
`Tree_Cherry_A/B`, `Tree_Oak_A/B`, `Tree_Birch_A/B`, `Tree_Olive_A/B`, `Tree_Cypress_A/B`, `Tree_Palm_A/B`.

Run via Blender 4.0.2 with system Python:
  PYTHONPATH=/usr/lib/python3.12:/usr/lib/python3.12/lib-dynload \
    blender --python-use-system-env -b -P tools/blender/build_trees_and_flora_glb.py -- \
    --qa /tmp/trees_qa.png
"""
from __future__ import annotations

import argparse
import math
import random
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
    fbm2,
    make_packed_normal_texture,
    make_packed_texture,
    make_pbr_material,
    reset_scene,
)

REPO_ROOT = ROOT.parent.parent
OUT_GLB = REPO_ROOT / "site" / "assets" / "models" / "stylized_trees.glb"
TEX_DIR = ROOT / "_tex_trees"


# ---------------------------------------------------------------------------
# Compact Painterly Textures (Bark, Dappled Inner Cloud & Feathery Outer Tufts)
# ---------------------------------------------------------------------------

def smoothstep_edge(e0: float, e1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - e0) / max(1e-6, e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


def _save_packed_pil(name: str, img: Image.Image, opaque_rgb: bool = False) -> bpy.types.Image:
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    out_png = TEX_DIR / f"{name}.png"
    if opaque_rgb:
        q = img.convert("RGB").quantize(colors=96, method=Image.Quantize.MEDIANCUT)
        q.save(out_png, optimize=True)
    else:
        q = img.convert("RGBA").quantize(colors=96, method=Image.Quantize.FASTOCTREE)
        q.save(out_png, optimize=True)
    bimg = bpy.data.images.load(str(out_png), check_existing=True)
    try:
        bimg.colorspace_settings.name = "sRGB"
    except Exception:
        pass
    bimg.pack()
    return bimg


def _make_bark_textures(
    name: str,
    base_rgb: tuple[int, int, int],
    dark_rgb: tuple[int, int, int],
    hi_rgb: tuple[int, int, int],
    seed: int = 1,
    birch: bool = False,
    palm_rings: bool = False,
):
    w, h = 192, 192
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    b0 = (base_rgb[0] / 255.0, base_rgb[1] / 255.0, base_rgb[2] / 255.0)
    d0 = (dark_rgb[0] / 255.0, dark_rgb[1] / 255.0, dark_rgb[2] / 255.0)
    h0 = (hi_rgb[0] / 255.0, hi_rgb[1] / 255.0, hi_rgb[2] / 255.0)

    def albedo_fn(u: float, v: float):
        n_coarse = fbm2(u * 5.0, v * 2.0, seed=seed, octaves=3)
        if birch:
            # Crisp horizontal lenticel stripes + dark diamond bark scars
            band = math.sin((v * 14.0 + (n_coarse - 0.5) * 1.4) * math.tau)
            lent = max(0.0, band - 0.58) / 0.42
            spot = max(0.0, fbm2(u * 4.5, v * 11.0, seed=seed + 19, octaves=2) - 0.54) * 2.2
            scar = min(1.0, lent * 0.85 + max(0.0, fbm2(u * 3.2, v * 3.8, seed=seed + 7) - 0.64) * 3.2)
            mask = min(1.0, scar * (0.45 + 0.55 * min(1.0, spot + 0.35)))
            r = b0[0] * (1.0 - mask) + d0[0] * mask
            g = b0[1] * (1.0 - mask) + d0[1] * mask
            b = b0[2] * (1.0 - mask) + d0[2] * mask
            return (max(0.0, min(1.0, r)), max(0.0, min(1.0, g)), max(0.0, min(1.0, b)), 1.0)
        if palm_rings:
            ring_v = (v * 14.0 + (n_coarse - 0.5) * 0.6) % 1.0
            band = 0.28 + 0.72 * smoothstep_edge(0.10, 0.36, ring_v) * (1.0 - 0.32 * smoothstep_edge(0.75, 1.0, ring_v))
            t = max(0.0, min(1.0, band * 0.78 + n_coarse * 0.22))
            return (
                d0[0] + (h0[0] - d0[0]) * t,
                d0[1] + (h0[1] - d0[1]) * t,
                d0[2] + (h0[2] - d0[2]) * t,
                1.0,
            )
        ridge = 0.5 + 0.5 * math.sin((u * 8.0 + (n_coarse - 0.5) * 1.9) * math.tau)
        ridge = ridge ** 1.1
        fine = fbm2(u * 12.0, v * 5.0, seed=seed + 13, octaves=2)
        t = max(0.0, min(1.0, 0.25 + ridge * 0.50 + (fine - 0.5) * 0.28))
        if t < 0.5:
            k = t * 2.0
            r = d0[0] + (b0[0] - d0[0]) * k
            g = d0[1] + (b0[1] - d0[1]) * k
            b = d0[2] + (b0[2] - d0[2]) * k
        else:
            k = (t - 0.5) * 2.0
            r = b0[0] + (h0[0] - b0[0]) * k
            g = b0[1] + (h0[1] - b0[1]) * k
            b = b0[2] + (h0[2] - b0[2]) * k
        return (max(0.0, min(1.0, r)), max(0.0, min(1.0, g)), max(0.0, min(1.0, b)), 1.0)

    def height_fn(u: float, v: float) -> float:
        n_c = fbm2(u * 5.0, v * 2.0, seed=seed, octaves=3)
        if palm_rings:
            return 0.4 + 0.5 * ((v * 14.0) % 1.0)
        return 0.5 + 0.35 * math.sin((u * 8.0 + (n_c - 0.5) * 1.9) * math.tau)

    alb = make_packed_texture(TEX_DIR / f"bark_{name}_alb.png", w, h, albedo_fn)
    nrm = make_packed_normal_texture(TEX_DIR / f"bark_{name}_nrm.png", 96, 96, height_fn, strength=1.2 if not birch else 0.6)
    return alb, nrm


def _draw_stylized_leaf(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    ang: float,
    rx: float,
    ry: float,
    col: tuple[int, int, int, int],
    blossom: bool = False,
) -> None:
    if blossom:
        for p in range(5):
            pa = ang + p * (math.tau / 5.0)
            px = cx + math.cos(pa) * rx * 0.58
            py = cy + math.sin(pa) * rx * 0.58
            ca, sa = math.cos(pa), math.sin(pa)
            pts = []
            for k in range(8):
                a = k / 8.0 * math.tau
                lx = math.cos(a) * rx * 0.52
                ly = math.sin(a) * ry * 0.48
                pts.append((px + lx * ca - ly * sa, py + lx * sa + ly * ca))
            draw.polygon(pts, fill=col)
        sr = max(1.6, rx * 0.22)
        draw.ellipse((cx - sr, cy - sr, cx + sr, cy + sr), fill=(255, 224, 188, col[3]))
        return

    pts = []
    steps = 10
    ca, sa = math.cos(ang), math.sin(ang)
    for k in range(steps):
        a = k / steps * math.tau
        u = math.cos(a)
        v = math.sin(a) * (1.0 - 0.36 * abs(u))
        lx = u * rx
        ly = v * ry
        pts.append((cx + lx * ca - ly * sa, cy + lx * sa + ly * ca))
    draw.polygon(pts, fill=col)


def _make_cloud_foliage_texture(
    name: str,
    shadow_rgb: tuple[int, int, int],
    mid_rgb: tuple[int, int, int],
    hi_rgb: tuple[int, int, int],
    seed: int = 1,
    blossom: bool = False,
) -> bpy.types.Image:
    """Isotropic fine-dappled 192x192 foliage texture for the inner cloud core (zero streaking)."""
    sz = 192
    img = Image.new("RGBA", (sz, sz), (mid_rgb[0], mid_rgb[1], mid_rgb[2], 255))
    draw = ImageDraw.Draw(img, "RGBA")
    rng = random.Random(seed * 733 + 17)

    tiers = [
        (210, shadow_rgb, 1.05),
        (260, mid_rgb, 0.92),
        (170, hi_rgb, 0.78),
    ]
    for count, col, s_mul in tiers:
        for _ in range(count):
            cx = rng.uniform(0, sz)
            cy = rng.uniform(0, sz)
            ang = rng.uniform(0, math.tau)
            rx = rng.uniform(7.5, 12.5) * s_mul
            ry = rng.uniform(5.8, 9.6) * s_mul
            jitter = rng.randint(-8, 8)
            c = (
                max(0, min(255, col[0] + jitter)),
                max(0, min(255, col[1] + jitter)),
                max(0, min(255, col[2] + jitter)),
                245,
            )
            for ox in (-sz, 0, sz):
                if not (-rx <= cx + ox <= sz + rx):
                    continue
                for oy in (-sz, 0, sz):
                    if not (-rx <= cy + oy <= sz + rx):
                        continue
                    _draw_stylized_leaf(draw, cx + ox, cy + oy, ang, rx, ry, c, blossom=blossom)

    return _save_packed_pil(f"cloud_{name}", img, opaque_rgb=True)


def _make_sprig_cutout_texture(
    name: str,
    shadow_rgb: tuple[int, int, int],
    mid_rgb: tuple[int, int, int],
    hi_rgb: tuple[int, int, int],
    seed: int = 1,
    blossom: bool = False,
) -> bpy.types.Image:
    """Airy overlapping 224x224 RGBA foliage puff for outer silhouette cards (matched to inner cloud palette!)."""
    sz = 224
    img = Image.new("RGBA", (sz, sz), (mid_rgb[0], mid_rgb[1], mid_rgb[2], 0))
    draw = ImageDraw.Draw(img, "RGBA")
    rng = random.Random(seed * 919 + 41)

    cx0, cy0 = sz * 0.5, sz * 0.52
    for layer_idx, (n_items, col, rad_span, l_scale) in enumerate((
        (36, shadow_rgb, 0.34, 1.06),
        (52, mid_rgb, 0.32, 0.96),
        (38, hi_rgb, 0.27, 0.84),
    )):
        for _ in range(n_items):
            a = rng.uniform(0, math.tau)
            d = (rng.random() ** 0.62) * sz * rad_span
            cx = cx0 + math.cos(a) * d
            cy = cy0 + math.sin(a) * d * 0.94 - (0.04 * sz if layer_idx == 2 else 0.0)
            leaf_ang = a + rng.uniform(-0.65, 0.65)
            rx = rng.uniform(14.5, 22.5) * l_scale
            ry = rng.uniform(10.0, 15.5) * l_scale
            jitter = rng.randint(-8, 8)
            c = (
                max(0, min(255, col[0] + jitter)),
                max(0, min(255, col[1] + jitter)),
                max(0, min(255, col[2] + jitter)),
                255,
            )
            _draw_stylized_leaf(draw, cx, cy, leaf_ang, rx, ry, c, blossom=blossom)

    return _save_packed_pil(f"sprig_{name}", img, opaque_rgb=False)


# ---------------------------------------------------------------------------
# Geometry Helpers: Smooth Cylindrical Bark UVs, Sculpted Limbs & Layered Clouds
# ---------------------------------------------------------------------------

def _eval_cubic_bezier(p0: Vector, p1: Vector, p2: Vector, p3: Vector, t: float) -> Vector:
    u = 1.0 - t
    return (u * u * u) * p0 + (3.0 * u * u * t) * p1 + (3.0 * u * t * t) * p2 + (t * t * t) * p3


def _build_curved_limb(
    bm: bmesh.types.BMesh,
    p0: Vector,
    p1: Vector,
    p2: Vector,
    p3: Vector,
    r0: float,
    r1: float,
    steps: int = 8,
    radial_segs: int = 8,
    root_flare: bool = False,
) -> list[Vector]:
    pts = []
    radii = []
    for i in range(steps + 1):
        t = i / steps
        pt = _eval_cubic_bezier(p0, p1, p2, p3, t)
        pts.append(pt)
        r = r0 * ((1.0 - t) ** 0.85) + r1 * t
        if root_flare and t < 0.25:
            r *= 1.0 + 0.55 * ((1.0 - t / 0.25) ** 1.8)
        radii.append(max(0.018, r))
    add_tube_along_curve(bm, pts, radii, radial_segs=radial_segs, cap_start=True, cap_end=True, mat_idx=0)
    return pts


def _apply_cylindrical_bark_uvs(obj: bpy.types.Object, v_scale: float = 0.55) -> None:
    """Clean continuous cylindrical-vertical bark UVs so grain & birch bands wrap seamlessly without box seams."""
    mesh = obj.data
    uv_layer = mesh.uv_layers.new(name="UVMap") if not mesh.uv_layers else mesh.uv_layers.active
    verts = mesh.vertices
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vco = verts[mesh.loops[li].vertex_index].co
            ang = math.atan2(vco.y, vco.x)
            u = ang / math.tau + 0.5
            v = vco.z * v_scale + 0.08 * math.hypot(vco.x, vco.y)
            uv_layer.data[li].uv = (u, v)


def _add_cloud_lobe(
    bm: bmesh.types.BMesh,
    center: Vector,
    radii_xyz: tuple[float, float, float],
    rot_z: float = 0.0,
    noise_amp: float = 0.14,
    seed: int = 1,
    u_segs: int = 10,
    v_rings: int = 7,
) -> None:
    """Compact puffy inner core billow (flatter belly, spherical isotropic UVs to eliminate streak seams)."""
    temp = bmesh.new()
    bmesh.ops.create_uvsphere(temp, u_segments=u_segs, v_segments=v_rings, radius=1.0)
    uv_layer = temp.loops.layers.uv.verify()

    for v in temp.verts:
        p = v.co
        # Smooth spherical UV before non-uniform scaling -> isotropic foliage grain!
        u_uv = math.atan2(p.y, p.x) / math.tau + 0.5
        v_uv = math.asin(max(-1.0, min(1.0, p.z))) / math.pi + 0.5
        if p.z < 0.0:
            p.z *= 0.72
        n = fbm2(p.x * 1.8 + p.z * 0.9, p.y * 1.8 - p.z * 0.7, seed=seed, octaves=3)
        k = 1.0 + (n - 0.5) * 2.0 * noise_amp
        v.co = Vector((p.x * k * radii_xyz[0], p.y * k * radii_xyz[1], p.z * k * radii_xyz[2]))
        # Store temporary UV via tag-free post lookup isn't needed if we set loop UVs cleanly below
        _ = (u_uv, v_uv)

    rot_m = Euler((0.0, 0.0, rot_z), "XYZ").to_matrix().to_4x4()
    trans_m = Matrix.Translation(center)
    bmesh.ops.transform(temp, matrix=trans_m @ rot_m, verts=temp.verts)

    for f in temp.faces:
        f.smooth = True
        for loop in f.loops:
            # Local sphere offset relative to lobe center -> isotropic multi-direction UV (zero directional shear)
            rel = loop.vert.co - center
            r_len = max(0.05, rel.length)
            u_l = math.atan2(rel.y, rel.x) / math.tau + 0.5
            v_l = (rel.z / r_len) * 0.5 + 0.5
            loop[uv_layer].uv = (u_l * 2.2, v_l * 1.6)

    tmp_mesh = bpy.data.meshes.new("_tmp_lobe")
    temp.to_mesh(tmp_mesh)
    temp.free()
    bm.from_mesh(tmp_mesh)
    bpy.data.meshes.remove(tmp_mesh)


def _add_rim_tuft(
    bm: bmesh.types.BMesh,
    pos: Vector,
    outward_dir: Vector,
    size: float,
    tilt: float = 0.0,
) -> None:
    """Cupped broad multi-leaf spray cluster wrapped around/proud of the inner cloud core."""
    temp = bmesh.new()
    uv_layer = temp.loops.layers.uv.verify()

    d = outward_dir.normalized()
    up_ref = Vector((0, 0, 1)) if abs(d.z) < 0.92 else Vector((1, 0, 0))
    right = d.cross(up_ref).normalized()
    up = right.cross(d).normalized()
    cr, sr = math.cos(tilt), math.sin(tilt)
    rx = right * cr + up * sr
    ry = -right * sr + up * cr

    grid = []
    hs = size * 0.5
    for iy in range(3):
        row = []
        ty = iy - 1
        for ix in range(3):
            tx = ix - 1
            cup = -0.18 * hs * (tx * tx + ty * ty)
            co = pos + rx * (tx * hs) + ry * (ty * hs) + d * cup
            row.append(temp.verts.new(co))
        grid.append(row)

    for iy in range(2):
        for ix in range(2):
            v00 = grid[iy][ix]
            v10 = grid[iy][ix + 1]
            v11 = grid[iy + 1][ix + 1]
            v01 = grid[iy + 1][ix]
            f = temp.faces.new((v00, v10, v11, v01))
            f.smooth = True
            u0, u1 = ix * 0.5, (ix + 1) * 0.5
            v0, v1 = iy * 0.5, (iy + 1) * 0.5
            f.loops[0][uv_layer].uv = (u0, v0)
            f.loops[1][uv_layer].uv = (u1, v0)
            f.loops[2][uv_layer].uv = (u1, v1)
            f.loops[3][uv_layer].uv = (u0, v1)

    tmp_mesh = bpy.data.meshes.new("_tmp_tuft")
    temp.to_mesh(tmp_mesh)
    temp.free()
    bm.from_mesh(tmp_mesh)
    bpy.data.meshes.remove(tmp_mesh)


def _apply_radial_normals_and_ao(
    obj: bpy.types.Object,
    crown_center: Vector,
    radial_blend: float,
    top_rgb: tuple[float, float, float],
    bot_rgb: tuple[float, float, float],
    crown_radius_z: float,
) -> None:
    mesh = obj.data
    mesh.calc_normals_split()
    verts = mesh.vertices
    nrm_out = []
    for v in verts:
        to_out = v.co - crown_center
        biased = Vector((to_out.x, to_out.y, to_out.z * 1.12 + 0.14))
        rad_n = biased.normalized() if biased.length > 1e-5 else Vector((0.0, 0.0, 1.0))
        loc_n = v.normal.normalized() if v.normal.length > 1e-5 else Vector((0.0, 0.0, 1.0))
        mixed = (rad_n * radial_blend + loc_n * (1.0 - radial_blend)).normalized()
        nrm_out.append(tuple(mixed))
    mesh.normals_split_custom_set_from_vertices(nrm_out)
    if hasattr(mesh, "use_auto_smooth"):
        mesh.use_auto_smooth = True

    col_attr = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
    z_min = crown_center.z - crown_radius_z * 0.92
    z_span = max(0.35, crown_radius_z * 1.85)
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vco = verts[mesh.loops[li].vertex_index].co
            hz = max(0.0, min(1.0, (vco.z - z_min) / z_span))
            dist_xy = math.hypot(vco.x - crown_center.x, vco.y - crown_center.y)
            radial_fade = max(0.86, min(1.02, 0.86 + 0.16 * min(1.0, dist_xy / max(0.4, crown_radius_z))))
            t = hz * hz * (3.0 - 2.0 * hz)
            r = (bot_rgb[0] + (top_rgb[0] - bot_rgb[0]) * t) * radial_fade
            g = (bot_rgb[1] + (top_rgb[1] - bot_rgb[1]) * t) * radial_fade
            b = (bot_rgb[2] + (top_rgb[2] - bot_rgb[2]) * t) * radial_fade
            col_attr.data[li].color = (min(1.0, r), min(1.0, g), min(1.0, b), 1.0)


def _apply_trunk_ao(obj: bpy.types.Object) -> None:
    mesh = obj.data
    verts = mesh.vertices
    zs = [v.co.z for v in verts] or [0.0]
    max_z = max(0.8, max(zs))
    col_attr = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            z = verts[mesh.loops[li].vertex_index].co.z
            base_ao = 0.78 + 0.22 * min(1.0, max(0.0, z / 0.55))
            top_ao = 1.0 - 0.18 * max(0.0, min(1.0, (z - max_z * 0.58) / max(0.3, max_z * 0.42)))
            c = base_ao * top_ao
            col_attr.data[li].color = (c, c * 0.99, c * 0.98, 1.0)


# ---------------------------------------------------------------------------
# Species Builders
# ---------------------------------------------------------------------------

def _build_hero_canopy_tree(
    name: str,
    seed: int,
    bark_mat: bpy.types.Material,
    cloud_mat: bpy.types.Material,
    tuft_mat: bpy.types.Material,
    height: float,
    trunk_r: float,
    lean: tuple[float, float],
    bough_specs: list[tuple[float, float, float, float]],
    lobe_scale_xy: float,
    lobe_scale_z: float,
    top_ao: tuple[float, float, float],
    bot_ao: tuple[float, float, float],
    tufts_per_lobe: int = 12,
    tuft_size: float = 1.12,
    dual_stem: bool = False,
) -> bpy.types.Object:
    rng = random.Random(seed)
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)

    # 1. Continuous Sinuous Trunk flowing seamlessly into leader crown limb + embedded staggered boughs
    bm_tr = bmesh.new()
    h = height
    fork_z = h * 0.44
    lx, ly = lean

    # Continuous main stem tapering smoothly up into upper canopy dome (zero fork step!)
    leader_top = Vector((lx * 1.15, ly * 1.15, h * 0.72))
    _build_curved_limb(
        bm_tr,
        Vector((0.0, 0.0, -0.06)),
        Vector((lx * 0.18, ly * 0.18, fork_z * 0.42)),
        Vector((lx * 0.78, ly * 0.78, fork_z * 0.88)),
        leader_top,
        trunk_r * 1.16,
        trunk_r * 0.22,
        steps=11,
        radial_segs=9,
        root_flare=True,
    )

    if dual_stem:
        c_ang = rng.uniform(0.6, 2.2)
        dx, dy = math.cos(c_ang), math.sin(c_ang)
        _build_curved_limb(
            bm_tr,
            Vector((dx * 0.05, dy * 0.05, -0.06)),
            Vector((dx * 0.15, dy * 0.15, fork_z * 0.48)),
            Vector((dx * 0.34, dy * 0.34, fork_z * 0.96)),
            Vector((dx * 0.46, dy * 0.46, h * 0.66)),
            trunk_r * 0.76,
            trunk_r * 0.18,
            steps=9,
            radial_segs=7,
            root_flare=True,
        )

    # Soft ground-hugging root toes curving cleanly into earth without sticking up
    for ri in range(4):
        ra = ri * (math.tau / 4.0) + rng.uniform(-0.26, 0.26)
        ca, sa = math.cos(ra), math.sin(ra)
        root_out = trunk_r * rng.uniform(1.85, 2.35)
        _build_curved_limb(
            bm_tr,
            Vector((ca * trunk_r * 0.22, sa * trunk_r * 0.22, 0.18)),
            Vector((ca * root_out * 0.42, sa * root_out * 0.42, 0.07)),
            Vector((ca * root_out * 0.80, sa * root_out * 0.80, -0.01)),
            Vector((ca * root_out, sa * root_out, -0.08)),
            trunk_r * 0.42,
            trunk_r * 0.11,
            steps=4,
            radial_segs=6,
        )

    cloud_lobes: list[tuple[Vector, tuple[float, float, float]]] = []
    # Compact inner core dome + 2 crown summit puffs
    dome_c = Vector((lx * 0.88, ly * 0.88, h * 0.76))
    cloud_lobes.append((dome_c, (0.94 * lobe_scale_xy, 0.92 * lobe_scale_xy, 0.72 * lobe_scale_z)))
    cloud_lobes.append((dome_c + Vector((0.12, -0.10, 0.34 * lobe_scale_z)), (0.72 * lobe_scale_xy, 0.70 * lobe_scale_xy, 0.56 * lobe_scale_z)))
    cloud_lobes.append((dome_c + Vector((-0.24, 0.16, 0.26 * lobe_scale_z)), (0.64 * lobe_scale_xy, 0.62 * lobe_scale_xy, 0.52 * lobe_scale_z)))

    for idx, (ang_deg, reach, z_norm, lobe_r) in enumerate(bough_specs):
        ang = math.radians(ang_deg) + rng.uniform(-0.14, 0.14)
        ca, sa = math.cos(ang), math.sin(ang)
        # Stagger takeoff heights along main stem & embed cleanly inside stem thickness
        t_stem = 0.62 + 0.24 * ((idx % 3) / 2.0)
        stem_z = h * 0.72 * t_stem
        stem_xy = Vector((lx * 1.15 * t_stem, ly * 1.15 * t_stem, stem_z))
        end_pt = Vector((lx * 0.45 + ca * reach, ly * 0.45 + sa * reach, h * z_norm))
        mid1 = stem_xy.lerp(end_pt, 0.34) + Vector((-sa * 0.14, ca * 0.14, 0.16))
        mid2 = stem_xy.lerp(end_pt, 0.72) + Vector((0.0, 0.0, 0.18))
        _build_curved_limb(bm_tr, stem_xy, mid1, mid2, end_pt, trunk_r * 0.34, trunk_r * 0.11, steps=7, radial_segs=7)

        twig_end = end_pt + Vector((-ca * 0.18 - sa * 0.22, -sa * 0.18 + ca * 0.22, 0.40 * lobe_scale_z))
        _build_curved_limb(
            bm_tr,
            mid2,
            mid2.lerp(twig_end, 0.5) + Vector((0.0, 0.0, 0.09)),
            mid2.lerp(twig_end, 0.84),
            twig_end,
            trunk_r * 0.18,
            trunk_r * 0.06,
            steps=4,
            radial_segs=5,
        )

        # Compact 0.82x inner cloud lobes so outer tuft cloak creates soft feathery edges
        lobe_rx = lobe_r * 0.82 * lobe_scale_xy * rng.uniform(0.94, 1.08)
        lobe_ry = lobe_r * 0.82 * lobe_scale_xy * rng.uniform(0.92, 1.06)
        lobe_rz = lobe_r * 0.80 * lobe_scale_z * rng.uniform(0.70, 0.84)
        lobe_pos = end_pt + Vector((ca * 0.10, sa * 0.10, 0.10))
        cloud_lobes.append((lobe_pos, (lobe_rx, lobe_ry, lobe_rz)))
        cloud_lobes.append((twig_end, (lobe_rx * 0.84, lobe_ry * 0.82, lobe_rz * 0.88)))

    trunk_obj = create_mesh_object(f"{name}_Trunk", bm_tr, bark_mat, sharp_angle_deg=None)
    _apply_cylindrical_bark_uvs(trunk_obj, v_scale=0.62)
    _apply_trunk_ao(trunk_obj)
    trunk_obj.parent = root

    # 2. Inner Solid Dappled Cloud Core (0.82x radius — prevents hollow sky gaps)
    bm_cloud = bmesh.new()
    for i, (pos, rads) in enumerate(cloud_lobes):
        _add_cloud_lobe(
            bm_cloud,
            pos,
            rads,
            rot_z=rng.uniform(0.0, math.tau),
            noise_amp=0.14,
            seed=seed * 31 + i,
            u_segs=10,
            v_rings=7,
        )

    crown_center = sum((p for p, _ in cloud_lobes), Vector((0, 0, 0))) / len(cloud_lobes)
    crown_rad_z = max(1.1, max(p.z + r[2] - crown_center.z for p, r in cloud_lobes))

    cloud_obj = create_mesh_object(f"{name}_Cloud", bm_cloud, cloud_mat, sharp_angle_deg=None)
    _apply_radial_normals_and_ao(cloud_obj, crown_center, 0.88, top_ao, bot_ao, crown_rad_z)
    cloud_obj.parent = root

    # 3. Lush Fluffy Outer Canopy Cloak (proud of inner core, big overlapping feathery puffs!)
    bm_tuft = bmesh.new()
    golden_angle = math.pi * (3.0 - math.sqrt(5.0))
    for i, (pos, rads) in enumerate(cloud_lobes):
        for k in range(tufts_per_lobe):
            t = (k + 0.5) / tufts_per_lobe
            phi = golden_angle * (i * 23 + k) + rng.uniform(-0.22, 0.22)
            z_unit = -0.28 + 1.24 * t
            xy_unit = math.sqrt(max(0.04, 1.0 - z_unit * z_unit))
            dir_local = Vector((xy_unit * math.cos(phi), xy_unit * math.sin(phi), z_unit))
            surf_pt = pos + Vector((dir_local.x * rads[0] * 1.04, dir_local.y * rads[1] * 1.04, dir_local.z * rads[2] * 1.02))
            out_dir = (surf_pt - crown_center).normalized()
            _add_rim_tuft(
                bm_tuft,
                surf_pt + out_dir * rng.uniform(0.08, 0.16),
                out_dir,
                size=tuft_size * rng.uniform(0.86, 1.22),
                tilt=rng.uniform(0.0, math.tau),
            )

    tuft_obj = create_mesh_object(f"{name}_Tufts", bm_tuft, tuft_mat, sharp_angle_deg=None)
    _apply_radial_normals_and_ao(tuft_obj, crown_center, 0.96, top_ao, bot_ao, crown_rad_z)
    tuft_obj.parent = root
    return root


def _build_flame_cypress(
    name: str,
    seed: int,
    bark_mat: bpy.types.Material,
    cloud_mat: bpy.types.Material,
    tuft_mat: bpy.types.Material,
    height: float,
) -> bpy.types.Object:
    """Symmetrical tapering Mediterranean Italian Cypress flame spire wrapped in upright tufts."""
    rng = random.Random(seed)
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)

    bm_tr = bmesh.new()
    _build_curved_limb(
        bm_tr,
        Vector((0.0, 0.0, -0.06)),
        Vector((0.01, -0.01, height * 0.28)),
        Vector((-0.01, 0.01, height * 0.56)),
        Vector((0.0, 0.0, height * 0.88)),
        0.20,
        0.04,
        steps=7,
        radial_segs=8,
        root_flare=True,
    )
    trunk_obj = create_mesh_object(f"{name}_Trunk", bm_tr, bark_mat, sharp_angle_deg=None)
    _apply_cylindrical_bark_uvs(trunk_obj, v_scale=0.6)
    _apply_trunk_ao(trunk_obj)
    trunk_obj.parent = root

    bm_cloud = bmesh.new()
    bm_tuft = bmesh.new()
    n_tiers = 9
    crown_center = Vector((0.0, 0.0, height * 0.56))
    for i in range(n_tiers):
        u = i / (n_tiers - 1)
        z = height * (0.21 + 0.74 * u)
        # Smooth sculpted flame envelope: fuller belly at u~0.26 then crisp needle taper at top
        env = (math.sin((u * 0.85 + 0.15) * math.pi) ** 0.85) * (1.0 - 0.58 * (u ** 1.15)) + 0.10 * (1.0 - u)
        r_xy = max(0.14, env * 0.78)
        r_z = height * (0.12 - 0.04 * u)
        ang = i * 2.399
        c_pos = Vector((0.0, 0.0, z))
        _add_cloud_lobe(bm_cloud, c_pos, (r_xy, r_xy, r_z), rot_z=ang, noise_amp=0.10, seed=seed + i * 7, u_segs=10, v_rings=7)

        n_t = 7 if u < 0.65 else 4
        for k in range(n_t):
            ta = ang + k * (math.tau / n_t)
            out_dir = Vector((math.cos(ta), math.sin(ta), 0.30)).normalized()
            pt = c_pos + Vector((out_dir.x * r_xy * 0.96, out_dir.y * r_xy * 0.96, 0.05))
            _add_rim_tuft(bm_tuft, pt, out_dir, size=0.72 * (1.0 - 0.42 * u), tilt=rng.uniform(0.0, math.tau))

    top_ao = (0.98, 1.00, 0.94)
    bot_ao = (0.58, 0.68, 0.62)
    cloud_obj = create_mesh_object(f"{name}_Cloud", bm_cloud, cloud_mat, sharp_angle_deg=None)
    _apply_radial_normals_and_ao(cloud_obj, crown_center, 0.88, top_ao, bot_ao, height * 0.45)
    cloud_obj.parent = root

    tuft_obj = create_mesh_object(f"{name}_Tufts", bm_tuft, tuft_mat, sharp_angle_deg=None)
    _apply_radial_normals_and_ao(tuft_obj, crown_center, 0.95, top_ao, bot_ao, height * 0.45)
    tuft_obj.parent = root
    return root


def _build_3d_palm(
    name: str,
    seed: int,
    bark_mat: bpy.types.Material,
    frond_mat: bpy.types.Material,
    coconut_mat: bpy.types.Material,
    height: float,
    lean_x: float,
    lean_y: float,
) -> bpy.types.Object:
    """Coastal Riviera Palm with curved ringed trunk, coconuts, and 13 genuinely 3D arched feathery fronds."""
    rng = random.Random(seed)
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)

    bm_tr = bmesh.new()
    top = Vector((lean_x, lean_y, height))
    _build_curved_limb(
        bm_tr,
        Vector((0.0, 0.0, -0.06)),
        Vector((lean_x * 0.14, lean_y * 0.14, height * 0.34)),
        Vector((lean_x * 0.56, lean_y * 0.56, height * 0.72)),
        top,
        0.23,
        0.13,
        steps=11,
        radial_segs=9,
        root_flare=True,
    )
    trunk_obj = create_mesh_object(f"{name}_Trunk", bm_tr, bark_mat, sharp_angle_deg=None)
    _apply_cylindrical_bark_uvs(trunk_obj, v_scale=0.55)
    _apply_trunk_ao(trunk_obj)
    trunk_obj.parent = root

    bm_coco = bmesh.new()
    for ci in range(4):
        ca = ci * (math.tau / 4.0) + rng.uniform(-0.2, 0.2)
        cpos = top + Vector((math.cos(ca) * 0.15, math.sin(ca) * 0.15, -0.10))
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=8, v_segments=6, radius=0.095)
        bmesh.ops.transform(tmp, matrix=Matrix.Translation(cpos), verts=tmp.verts)
        for f in tmp.faces:
            f.smooth = True
        tm = bpy.data.meshes.new("_tmp_coco")
        tmp.to_mesh(tm)
        tmp.free()
        bm_coco.from_mesh(tm)
        bpy.data.meshes.remove(tm)
    coco_obj = create_mesh_object(f"{name}_Coconuts", bm_coco, coconut_mat, sharp_angle_deg=None)
    coco_obj.parent = root

    bm_fr = bmesh.new()
    uv_layer = bm_fr.loops.layers.uv.verify()
    tiers = [
        (5, 0.58, 1.95, 0.52),
        (8, 0.24, 2.55, 0.92),
    ]
    for tier_idx, (n_fronds, lift_z, length, droop) in enumerate(tiers):
        for fi in range(n_fronds):
            az = (fi / n_fronds) * math.tau + tier_idx * 0.42 + rng.uniform(-0.12, 0.12)
            fwd = Vector((math.cos(az), math.sin(az), 0.0))
            side = Vector((-fwd.y, fwd.x, 0.0))

            spine_pts: list[Vector] = []
            n_seg = 12
            for si in range(n_seg + 1):
                u = si / n_seg
                arc_z = lift_z * (1.0 - (u * 0.85)) * math.sin(u * math.pi * 0.72 + 0.25) - droop * (u ** 1.85)
                arc_r = u * length
                spine_pts.append(top + fwd * arc_r + Vector((0.0, 0.0, arc_z)))

            left_ribs, right_ribs, mid_ribs = [], [], []
            for si, pt in enumerate(spine_pts):
                u = si / n_seg
                w_stem = 0.032 * (1.0 - 0.75 * u)
                mid_ribs.append(bm_fr.verts.new(pt + Vector((0, 0, 0.015))))
                left_ribs.append(bm_fr.verts.new(pt - side * w_stem))
                right_ribs.append(bm_fr.verts.new(pt + side * w_stem))
            for si in range(n_seg):
                f1 = bm_fr.faces.new((left_ribs[si], left_ribs[si + 1], mid_ribs[si + 1], mid_ribs[si]))
                f2 = bm_fr.faces.new((mid_ribs[si], mid_ribs[si + 1], right_ribs[si + 1], right_ribs[si]))
                for f in (f1, f2):
                    f.smooth = True
                    for lp in f.loops:
                        lp[uv_layer].uv = (0.5, si / n_seg)

            for si in range(1, n_seg):
                u = si / n_seg
                p_cur = spine_pts[si]
                t_dir = (spine_pts[min(n_seg, si + 1)] - spine_pts[max(0, si - 1)]).normalized()
                env = math.sin(min(1.0, (u - 0.04) / 0.94) * math.pi) ** 0.75
                leaf_len = 0.56 * env + 0.08
                leaf_w = 0.048 * env + 0.014
                for sgn in (-1.0, 1.0):
                    lat = (side * sgn * 0.84 + t_dir * 0.45 + Vector((0, 0, -0.22 - 0.24 * u))).normalized()
                    p_mid = p_cur + lat * (leaf_len * 0.52) + Vector((0, 0, 0.03))
                    p_tip = p_cur + lat * leaf_len + Vector((0, 0, -0.06 * env))
                    w_vec = t_dir * leaf_w
                    v0 = bm_fr.verts.new(p_cur - w_vec * 0.5)
                    v1 = bm_fr.verts.new(p_cur + w_vec * 0.5)
                    v2 = bm_fr.verts.new(p_mid + w_vec * 0.55)
                    v3 = bm_fr.verts.new(p_mid - w_vec * 0.55)
                    vt = bm_fr.verts.new(p_tip)
                    va = (v0, v1, v2, v3) if sgn > 0 else (v0, v3, v2, v1)
                    fa = bm_fr.faces.new(va)
                    tb = (v3, v2, vt) if sgn > 0 else (v3, vt, v2)
                    fb = bm_fr.faces.new(tb)
                    for f in (fa, fb):
                        f.smooth = True
                        for lp in f.loops:
                            lp[uv_layer].uv = (0.5 + sgn * 0.25, u)

    frond_obj = create_mesh_object(f"{name}_Fronds", bm_fr, frond_mat, sharp_angle_deg=None)
    crown_c = top + Vector((0.0, 0.0, 0.15))
    _apply_radial_normals_and_ao(frond_obj, crown_c, 0.60, (1.00, 1.00, 0.92), (0.64, 0.74, 0.62), 1.35)
    frond_obj.parent = root
    return root


# ---------------------------------------------------------------------------
# Build All 12 Species Prototypes
# ---------------------------------------------------------------------------

def build_all_trees() -> list[bpy.types.Object]:
    reset_scene()

    # 1. Sakura Cherry (velvety pastel sakura pink -> soft petal cream, ZERO greyish purple shadow!)
    ch_alb, ch_nrm = _make_bark_textures("Cherry", (134, 98, 86), (96, 68, 60), (164, 124, 108), seed=11)
    mat_ch_bark = make_pbr_material("Mat_Bark_Cherry", image=ch_alb, normal_image=ch_nrm, roughness=0.84, use_vertex_color=True)
    ch_sh, ch_md, ch_hi = (232, 134, 166), (252, 178, 202), (255, 224, 234)
    mat_ch_cloud = make_pbr_material(
        "Mat_Cloud_Cherry",
        image=_make_cloud_foliage_texture("Cherry", ch_sh, ch_md, ch_hi, seed=12, blossom=True),
        roughness=0.88,
        specular=0.14,
        double_sided=False,
        use_vertex_color=True,
    )
    mat_ch_tuft = make_pbr_material(
        "Mat_Tuft_Cherry",
        image=_make_sprig_cutout_texture("Cherry", ch_sh, ch_md, ch_hi, seed=13, blossom=True),
        roughness=0.88,
        specular=0.14,
        alpha_cutoff=0.38,
        double_sided=True,
        use_vertex_color=True,
    )

    # 2. Meadow Oak (Mondstadt luminous jade -> warm meadow spring highlights)
    ok_alb, ok_nrm = _make_bark_textures("Oak", (148, 112, 82), (108, 78, 56), (178, 138, 102), seed=21)
    mat_ok_bark = make_pbr_material("Mat_Bark_Oak", image=ok_alb, normal_image=ok_nrm, roughness=0.86, use_vertex_color=True)
    ok_sh, ok_md, ok_hi = (66, 132, 82), (104, 180, 100), (162, 218, 122)
    mat_ok_cloud = make_pbr_material(
        "Mat_Cloud_Oak",
        image=_make_cloud_foliage_texture("Oak", ok_sh, ok_md, ok_hi, seed=22),
        roughness=0.88,
        specular=0.16,
        double_sided=False,
        use_vertex_color=True,
    )
    mat_ok_tuft = make_pbr_material(
        "Mat_Tuft_Oak",
        image=_make_sprig_cutout_texture("Oak", ok_sh, ok_md, ok_hi, seed=23),
        roughness=0.88,
        specular=0.16,
        alpha_cutoff=0.38,
        double_sided=True,
        use_vertex_color=True,
    )

    # 3. Silver Birch (crisp birch bands + sunlit golden-mint leaves)
    bi_alb, bi_nrm = _make_bark_textures("Birch", (232, 228, 220), (62, 56, 52), (246, 244, 238), seed=31, birch=True)
    mat_bi_bark = make_pbr_material("Mat_Bark_Birch", image=bi_alb, normal_image=bi_nrm, roughness=0.82, use_vertex_color=True)
    bi_sh, bi_md, bi_hi = (128, 174, 82), (186, 214, 96), (236, 240, 132)
    mat_bi_cloud = make_pbr_material(
        "Mat_Cloud_Birch",
        image=_make_cloud_foliage_texture("Birch", bi_sh, bi_md, bi_hi, seed=32),
        roughness=0.86,
        specular=0.16,
        double_sided=False,
        use_vertex_color=True,
    )
    mat_bi_tuft = make_pbr_material(
        "Mat_Tuft_Birch",
        image=_make_sprig_cutout_texture("Birch", bi_sh, bi_md, bi_hi, seed=33),
        roughness=0.86,
        specular=0.16,
        alpha_cutoff=0.38,
        double_sided=True,
        use_vertex_color=True,
    )

    # 4. Mediterranean Olive (silvery-sage pastoral shelves)
    ol_alb, ol_nrm = _make_bark_textures("Olive", (156, 144, 124), (114, 104, 88), (186, 174, 152), seed=41)
    mat_ol_bark = make_pbr_material("Mat_Bark_Olive", image=ol_alb, normal_image=ol_nrm, roughness=0.86, use_vertex_color=True)
    ol_sh, ol_md, ol_hi = (102, 140, 112), (148, 182, 142), (198, 222, 178)
    mat_ol_cloud = make_pbr_material(
        "Mat_Cloud_Olive",
        image=_make_cloud_foliage_texture("Olive", ol_sh, ol_md, ol_hi, seed=42),
        roughness=0.88,
        specular=0.16,
        double_sided=False,
        use_vertex_color=True,
    )
    mat_ol_tuft = make_pbr_material(
        "Mat_Tuft_Olive",
        image=_make_sprig_cutout_texture("Olive", ol_sh, ol_md, ol_hi, seed=43),
        roughness=0.88,
        specular=0.16,
        alpha_cutoff=0.38,
        double_sided=True,
        use_vertex_color=True,
    )

    # 5. Italian Cypress (deep pine-emerald spire)
    cy_alb, cy_nrm = _make_bark_textures("Cypress", (128, 100, 76), (92, 70, 54), (156, 124, 94), seed=51)
    mat_cy_bark = make_pbr_material("Mat_Bark_Cypress", image=cy_alb, normal_image=cy_nrm, roughness=0.88, use_vertex_color=True)
    cy_sh, cy_md, cy_hi = (46, 104, 78), (74, 142, 98), (116, 184, 122)
    mat_cy_cloud = make_pbr_material(
        "Mat_Cloud_Cypress",
        image=_make_cloud_foliage_texture("Cypress", cy_sh, cy_md, cy_hi, seed=52),
        roughness=0.88,
        specular=0.16,
        double_sided=False,
        use_vertex_color=True,
    )
    mat_cy_tuft = make_pbr_material(
        "Mat_Tuft_Cypress",
        image=_make_sprig_cutout_texture("Cypress", cy_sh, cy_md, cy_hi, seed=53),
        roughness=0.88,
        specular=0.16,
        alpha_cutoff=0.38,
        double_sided=True,
        use_vertex_color=True,
    )

    # 6. Coastal Palm
    pm_alb, pm_nrm = _make_bark_textures("Palm", (158, 124, 92), (118, 88, 62), (188, 154, 118), seed=61, palm_rings=True)
    mat_pm_bark = make_pbr_material("Mat_Bark_Palm", image=pm_alb, normal_image=pm_nrm, roughness=0.84, use_vertex_color=True)
    mat_pm_frond = make_pbr_material(
        "Mat_Frond_Palm",
        image=_make_cloud_foliage_texture("Palm", (58, 128, 68), (94, 176, 84), (156, 214, 104), seed=62),
        roughness=0.78,
        specular=0.18,
        double_sided=True,
        use_vertex_color=True,
    )
    mat_coco = make_pbr_material(
        "Mat_Bark_Coco",
        image=_save_packed_pil("coco", Image.new("RGBA", (32, 32), (118, 76, 46, 255)), opaque_rgb=True),
        roughness=0.78,
    )

    roots: list[bpy.types.Object] = []

    cherry_boughs_a = [(0.0, 1.50, 0.72, 1.05), (68.0, 1.35, 0.80, 0.96), (138.0, 1.62, 0.70, 1.08), (216.0, 1.42, 0.84, 0.94), (294.0, 1.48, 0.68, 1.02)]
    roots.append(_build_hero_canopy_tree(
        "Tree_Cherry_A", 101, mat_ch_bark, mat_ch_cloud, mat_ch_tuft,
        height=4.8, trunk_r=0.25, lean=(0.24, -0.10), bough_specs=cherry_boughs_a,
        lobe_scale_xy=1.20, lobe_scale_z=0.78, top_ao=(1.00, 0.97, 0.99), bot_ao=(0.74, 0.68, 0.80),
        tufts_per_lobe=13, tuft_size=1.12,
    ))
    cherry_boughs_b = [(25.0, 1.44, 0.74, 1.00), (110.0, 1.64, 0.82, 1.05), (195.0, 1.38, 0.69, 0.94), (278.0, 1.52, 0.78, 1.02)]
    roots.append(_build_hero_canopy_tree(
        "Tree_Cherry_B", 102, mat_ch_bark, mat_ch_cloud, mat_ch_tuft,
        height=4.4, trunk_r=0.23, lean=(-0.22, 0.14), bough_specs=cherry_boughs_b,
        lobe_scale_xy=1.16, lobe_scale_z=0.76, top_ao=(1.00, 0.97, 0.99), bot_ao=(0.74, 0.68, 0.80),
        tufts_per_lobe=12, tuft_size=1.08,
    ))

    oak_boughs_a = [(12.0, 1.42, 0.72, 1.08), (84.0, 1.34, 0.80, 1.02), (156.0, 1.48, 0.74, 1.10), (232.0, 1.38, 0.82, 1.00), (306.0, 1.44, 0.68, 1.04)]
    roots.append(_build_hero_canopy_tree(
        "Tree_Oak_A", 201, mat_ok_bark, mat_ok_cloud, mat_ok_tuft,
        height=5.2, trunk_r=0.28, lean=(0.14, 0.12), bough_specs=oak_boughs_a,
        lobe_scale_xy=1.12, lobe_scale_z=0.94, top_ao=(1.00, 1.00, 0.90), bot_ao=(0.60, 0.70, 0.68),
        tufts_per_lobe=13, tuft_size=1.16,
    ))
    oak_boughs_b = [(40.0, 1.38, 0.76, 1.02), (128.0, 1.48, 0.72, 1.06), (216.0, 1.34, 0.82, 0.98), (302.0, 1.46, 0.70, 1.02)]
    roots.append(_build_hero_canopy_tree(
        "Tree_Oak_B", 202, mat_ok_bark, mat_ok_cloud, mat_ok_tuft,
        height=4.7, trunk_r=0.25, lean=(-0.16, -0.10), bough_specs=oak_boughs_b,
        lobe_scale_xy=1.10, lobe_scale_z=0.92, top_ao=(1.00, 1.00, 0.90), bot_ao=(0.60, 0.70, 0.68),
        tufts_per_lobe=12, tuft_size=1.12,
    ))

    birch_boughs_a = [(15.0, 1.04, 0.74, 0.88), (105.0, 1.14, 0.82, 0.92), (195.0, 1.06, 0.72, 0.86), (285.0, 1.10, 0.80, 0.90)]
    roots.append(_build_hero_canopy_tree(
        "Tree_Birch_A", 301, mat_bi_bark, mat_bi_cloud, mat_bi_tuft,
        height=5.4, trunk_r=0.17, lean=(0.12, -0.06), bough_specs=birch_boughs_a,
        lobe_scale_xy=0.95, lobe_scale_z=0.96, top_ao=(1.00, 0.99, 0.88), bot_ao=(0.68, 0.75, 0.62),
        tufts_per_lobe=12, tuft_size=0.98, dual_stem=True,
    ))
    birch_boughs_b = [(45.0, 1.00, 0.76, 0.84), (165.0, 1.12, 0.82, 0.90), (275.0, 1.02, 0.72, 0.84)]
    roots.append(_build_hero_canopy_tree(
        "Tree_Birch_B", 302, mat_bi_bark, mat_bi_cloud, mat_bi_tuft,
        height=4.8, trunk_r=0.16, lean=(-0.10, 0.08), bough_specs=birch_boughs_b,
        lobe_scale_xy=0.92, lobe_scale_z=0.94, top_ao=(1.00, 0.99, 0.88), bot_ao=(0.68, 0.75, 0.62),
        tufts_per_lobe=11, tuft_size=0.95, dual_stem=False,
    ))

    olive_boughs_a = [(0.0, 1.34, 0.70, 0.94), (92.0, 1.24, 0.78, 0.90), (184.0, 1.38, 0.72, 0.96), (276.0, 1.28, 0.80, 0.88)]
    roots.append(_build_hero_canopy_tree(
        "Tree_Olive_A", 401, mat_ol_bark, mat_ol_cloud, mat_ol_tuft,
        height=4.2, trunk_r=0.22, lean=(0.20, 0.10), bough_specs=olive_boughs_a,
        lobe_scale_xy=1.06, lobe_scale_z=0.72, top_ao=(0.99, 1.00, 0.94), bot_ao=(0.62, 0.72, 0.68),
        tufts_per_lobe=11, tuft_size=0.96,
    ))
    olive_boughs_b = [(35.0, 1.30, 0.72, 0.92), (155.0, 1.36, 0.78, 0.94), (268.0, 1.26, 0.70, 0.88)]
    roots.append(_build_hero_canopy_tree(
        "Tree_Olive_B", 402, mat_ol_bark, mat_ol_cloud, mat_ol_tuft,
        height=3.9, trunk_r=0.20, lean=(-0.18, 0.12), bough_specs=olive_boughs_b,
        lobe_scale_xy=1.04, lobe_scale_z=0.70, top_ao=(0.99, 1.00, 0.94), bot_ao=(0.62, 0.72, 0.68),
        tufts_per_lobe=11, tuft_size=0.94,
    ))

    roots.append(_build_flame_cypress("Tree_Cypress_A", 501, mat_cy_bark, mat_cy_cloud, mat_cy_tuft, height=6.4))
    roots.append(_build_flame_cypress("Tree_Cypress_B", 502, mat_cy_bark, mat_cy_cloud, mat_cy_tuft, height=5.5))

    roots.append(_build_3d_palm("Tree_Palm_A", 601, mat_pm_bark, mat_pm_frond, mat_coco, height=6.2, lean_x=0.72, lean_y=-0.22))
    roots.append(_build_3d_palm("Tree_Palm_B", 602, mat_pm_bark, mat_pm_frond, mat_coco, height=5.3, lean_x=-0.56, lean_y=0.34))

    return roots


def render_qa_sheet(roots: list[bpy.types.Object], out_png: Path) -> None:
    showcase = [
        ("Tree_Palm_A", (-9.4, 0.2, 0.0)),
        ("Tree_Cherry_A", (-5.4, 0.4, 0.0)),
        ("Tree_Oak_A", (-1.5, -0.3, 0.0)),
        ("Tree_Birch_A", (2.4, 0.2, 0.0)),
        ("Tree_Olive_A", (5.8, -0.3, 0.0)),
        ("Tree_Cypress_A", (8.8, 0.4, 0.0)),
    ]
    for r in roots:
        r.location = (0.0, 50.0, 0.0)
    for name, pos in showcase:
        obj = bpy.data.objects.get(name)
        if obj:
            obj.location = pos

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1520
    scene.render.resolution_y = 660
    scene.view_settings.view_transform = "Standard"

    world = bpy.data.worlds.new("TreeQAWorld")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.58, 0.78, 0.96, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.85

    sun = bpy.data.lights.new("Sun", type="SUN")
    sun.energy = 2.4
    sun_o = bpy.data.objects.new("Sun", sun)
    bpy.context.collection.objects.link(sun_o)
    sun_o.rotation_euler = (math.radians(42), math.radians(15), math.radians(-30))

    cam_d = bpy.data.cameras.new("Cam")
    cam_d.lens = 30
    cam_o = bpy.data.objects.new("Cam", cam_d)
    bpy.context.collection.objects.link(cam_o)
    cam_o.location = (0.0, -18.5, 4.2)
    direction = Vector((-0.2, 0.0, 3.2)) - cam_o.location
    cam_o.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
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

    roots = build_all_trees()
    export_objs = list(roots)
    for r in roots:
        export_objs.extend(list(r.children))

    out_path = Path(args.out)
    bpy.ops.object.select_all(action="DESELECT")
    for o in export_objs:
        o.select_set(True)
    if export_objs:
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
        export_materials="EXPORT",
        export_image_format="AUTO",
    )
    print(f"[trees] Exported {out_path} -> {out_path.stat().st_size // 1024} KB ({out_path.stat().st_size:,} bytes)")

    if args.qa:
        render_qa_sheet(roots, Path(args.qa))
        print(f"[trees] QA render -> {args.qa}")


if __name__ == "__main__":
    main()
