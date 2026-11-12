#!/usr/bin/env python3
"""Generates the complete Cycles GI+AO-baked `bloom_scroll_world.glb` diorama world."""

from __future__ import annotations

import math
import os
from pathlib import Path
import sys
import tempfile
import bpy
from mathutils import Euler, Vector

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from clay_kit import (
    PALETTE,
    add_clay_ball,
    add_clay_tree,
    add_flower_bush,
    add_gable_prism,
    add_rbox,
    add_rcyl,
    add_terracotta_barrel_slope,
    build_scalloped_island,
    clay_mat,
    clear_material_cache,
    hex_rgba,
    join_and_bake_group,
    strip_bake_backface_nodes,
)
from villa_rooms import build_hero_bouquet, build_villa_interior

ROOT_DIR = TOOLS_DIR.parent
OUT_GLB = ROOT_DIR / "site" / "assets" / "models" / "bloom_scroll_world.glb"

# Key Zone Centers in Blender `(bx, by, bz)` -> glTF `(bx, bz, -by)`
BROOK_ORIGIN = (-14.0, -10.0, 0.0)
PLAZA_ORIGIN = (-4.5, -3.5, 0.25)
VILLA_ORIGIN = (4.5, 5.5, 0.65)
BOUQUET_ORIGIN = (18.5, 14.5, 2.2)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    clear_material_cache()
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.use_denoising = False
    scn.cycles.samples = 38
    scn.cycles.filter_width = 1.80
    scn.cycles.max_bounces = 3
    scn.cycles.diffuse_bounces = 2
    scn.cycles.glossy_bounces = 1
    scn.cycles.transmission_bounces = 1
    scn.cycles.sample_clamp_direct = 6.0
    scn.cycles.sample_clamp_indirect = 2.4

    scn.view_settings.view_transform = "Filmic"
    scn.view_settings.look = "Medium High Contrast"
    scn.view_settings.exposure = -0.18

    # Warm `#F5EDE0` Studio Sky Dome
    world = bpy.data.worlds.new("ClayStudioWorld")
    scn.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = hex_rgba("#F7EFE3", 1.0)
    bg.inputs["Strength"].default_value = 0.72


def add_studio_lights() -> list[bpy.types.Object]:
    lights: list[bpy.types.Object] = []
    # Soft Golden-Hour Key Sun (wide angle for creamy clay shadows like Pearl & Co.)
    sun_d = bpy.data.lights.new("StudioSun", type="SUN")
    sun_d.energy = 2.65
    sun_d.angle = math.radians(17.0)
    sun_d.color = (1.0, 0.94, 0.85)
    sun = bpy.data.objects.new("StudioSun", sun_d)
    sun.rotation_euler = Euler((math.radians(46.0), math.radians(-18.0), math.radians(-38.0)), "XYZ")
    bpy.context.collection.objects.link(sun)
    lights.append(sun)

    # Soft Lavender-Cream Fill Area Light from front-left
    fill_d = bpy.data.lights.new("StudioFill", type="AREA")
    fill_d.energy = 950.0
    fill_d.size = 18.0
    fill_d.color = (0.96, 0.93, 1.0)
    fill = bpy.data.objects.new("StudioFill", fill_d)
    fill.location = (-12.0, -20.0, 15.0)
    fill.rotation_euler = Euler((math.radians(52.0), 0.0, math.radians(-26.0)), "XYZ")
    bpy.context.collection.objects.link(fill)
    lights.append(fill)

    # Dedicated Studio Key Light on Hero Bouquet (`06 / 06`)
    bq_d = bpy.data.lights.new("BouquetKey", type="AREA")
    bq_d.energy = 240.0
    bq_d.size = 5.5
    bq_d.color = (1.0, 0.96, 0.90)
    bq = bpy.data.objects.new("BouquetKey", bq_d)
    bq.location = (BOUQUET_ORIGIN[0] - 2.5, BOUQUET_ORIGIN[1] - 4.8, BOUQUET_ORIGIN[2] + 3.6)
    bq.rotation_euler = Euler((math.radians(54.0), 0.0, math.radians(-24.0)), "XYZ")
    bpy.context.collection.objects.link(bq)
    lights.append(bq)
    return lights


def add_french_window(
    prefix: str,
    center: tuple[float, float, float],
    width: float,
    height: float,
    rot_z: float,
    wall_bucket: list[bpy.types.Object],
    glass_bucket: list[bpy.types.Object],
    with_shutters: bool = True,
    with_flowerbox: bool = True,
) -> None:
    """Sculpted honey-oak mullion window + sage-green louvered shutters + terracotta rose box."""
    cx, cy, cz = center
    m_oak = clay_mat("WinOak", PALETTE["oak_dark"], 0.80)
    m_sill = clay_mat("WinStone", PALETTE["limestone"], 0.86)
    m_shutter = clay_mat("WinShutter", PALETTE["shutter_sage"], 0.84)
    m_terra = clay_mat("WinBoxTerra", PALETTE["terra_1"], 0.86)
    m_glass = clay_mat("WarmGlass", "#FFF1D4", 0.18, emission_hex="#FFE3B3", emission_strength=0.55, alpha=0.42)

    def place_local(lx: float, ly: float, lz: float) -> tuple[float, float, float]:
        c, s = math.cos(rot_z), math.sin(rot_z)
        return (cx + lx * c - ly * s, cy + lx * s + ly * c, cz + lz)

    # Outer oak casing + top arch lintel + stone sill
    add_rbox(f"{prefix}_Top", place_local(0, 0, height * 0.5), (width + 0.12, 0.14, 0.09), m_oak, wall_bucket, bevel=0.015, rot=(0, 0, rot_z))
    add_rbox(f"{prefix}_ArchCrown", place_local(0, -0.02, height * 0.5 + 0.08), (width + 0.18, 0.16, 0.10), m_sill, wall_bucket, bevel=0.025, rot=(0, 0, rot_z))
    add_rbox(f"{prefix}_Sill", place_local(0, -0.04, -height * 0.5 - 0.03), (width + 0.22, 0.22, 0.08), m_sill, wall_bucket, bevel=0.02, rot=(0, 0, rot_z))
    for sx in (-width * 0.5, width * 0.5):
        add_rbox(f"{prefix}_Jamb_{sx:.2f}", place_local(sx, 0, 0), (0.08, 0.14, height), m_oak, wall_bucket, bevel=0.012, rot=(0, 0, rot_z))
    # Mullion crossbars
    add_rbox(f"{prefix}_MulV", place_local(0, -0.01, 0), (0.045, 0.08, height), m_oak, wall_bucket, bevel=0.008, rot=(0, 0, rot_z))
    add_rbox(f"{prefix}_MulH", place_local(0, -0.01, 0.06), (width, 0.08, 0.045), m_oak, wall_bucket, bevel=0.008, rot=(0, 0, rot_z))
    # Translucent glass pane
    add_rbox(f"{prefix}_Glass", place_local(0, 0.0, 0), (width - 0.06, 0.02, height - 0.06), m_glass, glass_bucket, bevel=0.002, rot=(0, 0, rot_z))

    if with_shutters:
        sh_w = max(0.22, width * 0.30)
        for sign in (-1, 1):
            add_rbox(
                f"{prefix}_Shut_{sign}",
                place_local(sign * (width * 0.5 + sh_w * 0.5 + 0.05), -0.05, 0),
                (sh_w, 0.05, height + 0.02),
                m_shutter,
                wall_bucket,
                bevel=0.012,
                rot=(0, 0, rot_z),
            )
    if with_flowerbox:
        add_rbox(f"{prefix}_FBox", place_local(0, -0.15, -height * 0.5 - 0.12), (width + 0.08, 0.22, 0.16), m_terra, wall_bucket, bevel=0.025, rot=(0, 0, rot_z))
        for bi in range(4):
            bx_l = -width * 0.36 + bi * (width * 0.24)
            col = PALETTE["rose_blush"] if bi % 2 == 0 else PALETTE["awning_lav"]
            add_clay_ball(f"{prefix}_FBloom_{bi}", place_local(bx_l, -0.16, -height * 0.5 - 0.01), (0.09, 0.09, 0.08), clay_mat(f"FB_{col}", col, 0.82), wall_bucket, subdiv=2)


def build_zone1_brook_island(outdoor_bucket: list[bpy.types.Object], water_bucket: list[bpy.types.Object]) -> None:
    """01 / 06 花溪梯田 (`Pearl & Co. The Farms` terraced floral hillside + crystal brook + baskets)."""
    cx, cy, cz = BROOK_ORIGIN
    build_scalloped_island("BrookIsl", (cx, cy, cz), rx=4.35, ry=3.65, thickness=1.15, bucket=outdoor_bucket, lobes=12, seed=17)

    m_stone = clay_mat("TerraceStone", PALETTE["limestone"], 0.88)
    m_turf = clay_mat("TerraceTurf", PALETTE["turf_light"], 0.88)
    m_oak = clay_mat("BridgeOak", PALETTE["oak_mid"], 0.84)
    m_rattan = clay_mat("Rattan", "#C99663", 0.86)
    m_water = clay_mat("CrystalBrook", "#88C9C2", 0.14, alpha=0.78)

    # 3 stepped flower terraces rising toward back-left (`-X, +Y`)
    for ti in range(3):
        tx = cx - 1.15 - ti * 0.55
        ty = cy + 0.55 + ti * 0.68
        tz = cz + 0.22 + ti * 0.28
        w = 3.2 - ti * 0.45
        add_rbox(f"TerraceStone_{ti}", (tx, ty, tz - 0.12), (w + 0.14, 0.92, 0.28), m_stone, outdoor_bucket, bevel=0.05)
        add_rbox(f"TerraceSoil_{ti}", (tx, ty, tz + 0.03), (w, 0.82, 0.10), m_turf, outdoor_bucket, bevel=0.04)
        for bi in range(4 - ti):
            bx = tx - w * 0.36 + bi * (w * 0.26)
            kind = ["lavender", "hydrangea", "rose"][(ti + bi) % 3]
            add_flower_bush(f"TerrBush_{ti}_{bi}", (bx, ty - 0.05, tz + 0.06), 0.78, kind, outdoor_bucket, seed=ti * 10 + bi)

    # Stone garden steps beside terraces
    for si in range(5):
        add_rbox(f"HillStep_{si}", (cx + 0.45, cy - 0.65 + si * 0.44, cz + 0.06 + si * 0.14), (0.76, 0.38, 0.12), m_stone, outdoor_bucket, bevel=0.03)

    # Sparkling diagonal crystal brook + Arched stone/oak footbridge
    add_rbox("BrookBed", (cx + 1.15, cy - 0.35, cz - 0.03), (1.35, 4.65, 0.06), clay_mat("BrookSand", "#DFCBB5", 0.90), outdoor_bucket, bevel=0.02, rot=(0, 0, 0.32))
    add_rbox("BrookWater", (cx + 1.15, cy - 0.35, cz + 0.02), (1.22, 4.50, 0.03), m_water, water_bucket, bevel=0.01, rot=(0, 0, 0.32))

    # Arched footbridge across the brook
    bx_b, by_b = cx + 1.05, cy - 0.45
    for k in range(7):
        u = (k - 3) / 3.0
        arch_z = cz + 0.26 - u * u * 0.16
        add_rbox(f"BridgePlank_{k}", (bx_b + u * 0.82, by_b - u * 0.26, arch_z), (0.24, 0.98, 0.06), m_oak, outdoor_bucket, bevel=0.015, rot=(0, 0, 0.32))
    for side in (-0.44, 0.44):
        add_rbox(f"BridgeRail_{side:.2f}", (bx_b - side * 0.3, by_b + side * 0.95, cz + 0.46), (1.76, 0.06, 0.06), m_oak, outdoor_bucket, bevel=0.015, rot=(0, 0, 0.32))

    # Woven flower harvest baskets overflowing with blooms (`Pearl & Co. frame_01` touch!)
    baskets = [(cx - 0.45, cy - 1.35, cz), (cx - 0.95, cy - 1.05, cz), (cx + 2.25, cy - 1.10, cz), (cx + 2.55, cy + 0.45, cz)]
    for idx, (kx, ky, kz) in enumerate(baskets):
        add_rcyl(f"HarvestBasket_{idx}", (kx, ky, kz + 0.20), 0.26, 0.38, m_rattan, outdoor_bucket, verts=20, bevel=0.03)
        add_flower_bush(f"BasketBlooms_{idx}", (kx, ky, kz + 0.24), 0.58, "rose" if idx % 2 == 0 else "hydrangea", outdoor_bucket, seed=70 + idx)

    add_clay_tree("BrookTree1", (cx - 2.65, cy + 1.85, cz + 0.45), 1.25, outdoor_bucket, style="olive", seed=101)
    add_clay_tree("BrookTree2", (cx + 2.75, cy + 1.55, cz), 1.18, outdoor_bucket, style="cypress", seed=102)
    add_clay_tree("BrookTree3", (cx + 2.85, cy - 1.85, cz), 1.05, outdoor_bucket, style="blossom", seed=103)


def build_zone2_plaza_island(
    outdoor_bucket: list[bpy.types.Object],
    water_bucket: list[bpy.types.Object],
    bulb_bucket: list[bpy.types.Object],
) -> None:
    """02 / 06 星灯花廊 (`Pearl & Co. The People` fountain plaza + string-light pergola + floral cart)."""
    cx, cy, cz = PLAZA_ORIGIN
    build_scalloped_island("PlazaIsl", (cx, cy, cz), rx=4.45, ry=3.85, thickness=1.20, bucket=outdoor_bucket, lobes=14, seed=29, has_rim_wall=True)

    m_pave = clay_mat("PlazaPave", "#EFE4D4", 0.88)
    m_stone = clay_mat("FountainStone", PALETTE["stucco_light"], 0.84)
    m_oak = clay_mat("PergolaOak", PALETTE["oak_mid"], 0.82)
    m_canopy = clay_mat("PergolaCanopy", PALETTE["awning_lav"], 0.84)
    m_cream = clay_mat("CartCream", PALETTE["awning_cream"], 0.84)
    m_iron = clay_mat("PlazaIron", PALETTE["iron_dark"], 0.65, metallic=0.35)
    m_water = clay_mat("FountainWater", "#98AEE0", 0.14, alpha=0.80)
    m_bulb = clay_mat("StringBulb", "#FFF3D1", 0.40, emission_hex="#FFD88A", emission_strength=3.8)

    # Cream paved courtyard center
    add_rcyl("PlazaPavement", (cx, cy, cz + 0.02), 1.0, 0.05, m_pave, outdoor_bucket, verts=40, bevel=0.02, scale_xy=(3.85, 3.25))

    # Central Two-Tier Carved Rose Fountain + Wreath of Flowers (`frame_04.jpg`!)
    add_rcyl("FountainOuterRing", (cx + 0.15, cy - 0.10, cz + 0.20), 1.12, 0.34, m_stone, outdoor_bucket, verts=32, bevel=0.05)
    add_rcyl("FountainWaterPool", (cx + 0.15, cy - 0.10, cz + 0.30), 0.94, 0.06, m_water, water_bucket, verts=30)
    add_rcyl("FountainPedestal", (cx + 0.15, cy - 0.10, cz + 0.48), 0.22, 0.56, m_stone, outdoor_bucket, verts=20, bevel=0.03)
    add_rcyl("FountainUpperBowl", (cx + 0.15, cy - 0.10, cz + 0.74), 0.52, 0.14, m_stone, outdoor_bucket, verts=26, bevel=0.04)
    add_clay_ball("FountainSpout", (cx + 0.15, cy - 0.10, cz + 0.92), (0.12, 0.12, 0.16), m_water, water_bucket, subdiv=2)
    for wi in range(10):
        ang = (wi / 10.0) * math.tau
        wx = cx + 0.15 + math.cos(ang) * 1.36
        wy = cy - 0.10 + math.sin(ang) * 1.36
        add_flower_bush(f"FountainWreath_{wi}", (wx, wy, cz + 0.03), 0.62, ["lavender", "rose", "hydrangea"][wi % 3], outdoor_bucket, seed=200 + wi)

    # Draped String-Light Pergola on Left-Back (`frame_04.jpg` signature element!)
    px, py = cx - 2.05, cy + 0.65
    for dx_p in (-1.05, 1.05):
        for dy_p in (-0.95, 0.95):
            add_rcyl(f"PergPost_{dx_p}_{dy_p}", (px + dx_p, py + dy_p, cz + 1.05), 0.07, 2.10, m_oak, outdoor_bucket, verts=12)
    add_rbox("PergCanopy", (px, py, cz + 2.12), (2.32, 2.12, 0.10), m_canopy, outdoor_bucket, bevel=0.04)
    # Warm glowing string lights around pergola eaves
    for bi in range(8):
        t = bi / 7.0
        bx_s = px - 1.02 + t * 2.04
        sag = math.sin(t * math.pi) * 0.14
        add_clay_ball(f"PergBulbF_{bi}", (bx_s, py - 0.98, cz + 2.02 - sag), (0.045, 0.045, 0.055), m_bulb, bulb_bucket, subdiv=1)
        add_clay_ball(f"PergBulbR_{bi}", (px + 1.06, py - 0.92 + t * 1.84, cz + 2.02 - sag), (0.045, 0.045, 0.055), m_bulb, bulb_bucket, subdiv=1)
    # Café tables under pergola
    for ty_off in (-0.38, 0.42):
        add_rcyl(f"PergTable_{ty_off}", (px, py + ty_off, cz + 0.56), 0.36, 0.05, m_oak, outdoor_bucket, verts=20, bevel=0.015)
        add_rcyl(f"PergLeg_{ty_off}", (px, py + ty_off, cz + 0.28), 0.045, 0.54, m_oak, outdoor_bucket, verts=12)

    # Striped-Awning Floral & Tea Cart on Right (`frame_04.jpg`!)
    kx, ky = cx + 2.38, cy + 0.25
    add_rbox("CartBody", (kx, ky, cz + 0.52), (0.92, 1.48, 0.72), m_canopy, outdoor_bucket, bevel=0.04)
    add_rbox("CartCounter", (kx, ky, cz + 0.90), (0.98, 1.56, 0.06), m_oak, outdoor_bucket, bevel=0.02)
    for si in range(5):
        sy = ky - 0.64 + si * 0.32
        add_rbox(f"CartStripe_{si}", (kx, sy, cz + 1.66), (1.08, 0.30, 0.14), m_canopy if si % 2 == 0 else m_cream, outdoor_bucket, bevel=0.03)
    for wy_w in (-0.45, 0.45):
        add_rcyl(f"CartWheel_{wy_w}", (kx + 0.48, ky + wy_w, cz + 0.24), 0.24, 0.06, m_oak, outdoor_bucket, verts=20, rot=(0, math.pi * 0.5, 0))
    for bi in range(3):
        add_flower_bush(f"CartBlooms_{bi}", (kx - 0.12, ky - 0.45 + bi * 0.45, cz + 0.92), 0.46, "rose" if bi != 1 else "lavender", outdoor_bucket, seed=230 + bi)

    # Curved Wooden Benches + Wrought-Iron Streetlamp + Clay Trees
    for b_idx, (bx_p, by_p, rz) in enumerate([(cx - 0.55, cy - 2.15, 0.12), (cx + 1.55, cy - 1.95, -0.32)]):
        add_rbox(f"PlazaBenchSeat_{b_idx}", (bx_p, by_p, cz + 0.32), (1.06, 0.38, 0.06), m_oak, outdoor_bucket, bevel=0.02, rot=(0, 0, rz))
        add_rbox(f"PlazaBenchBack_{b_idx}", (bx_p, by_p - 0.16, cz + 0.54), (1.06, 0.06, 0.36), m_oak, outdoor_bucket, bevel=0.02, rot=(0, 0, rz))
    add_rcyl("PlazaLampPole", (cx + 2.95, cy + 1.35, cz + 1.15), 0.045, 2.25, m_iron, outdoor_bucket, verts=12)
    add_clay_ball("PlazaLampGlow", (cx + 2.95, cy + 1.35, cz + 2.34), (0.14, 0.14, 0.18), m_bulb, bulb_bucket, subdiv=2)

    add_clay_tree("PlazaTree1", (cx - 0.35, cy + 2.55, cz), 1.32, outdoor_bucket, style="olive", seed=205)
    add_clay_tree("PlazaTree2", (cx + 2.05, cy + 2.35, cz), 1.18, outdoor_bucket, style="cypress", seed=206)
    add_clay_tree("PlazaTree3", (cx - 3.15, cy + 2.05, cz), 1.15, outdoor_bucket, style="blossom", seed=207)


def build_stepping_trails(outdoor_bucket: list[bpy.types.Object]) -> None:
    """Floating clay stepping-stone islets connecting Brook -> Plaza -> Villa."""
    waypoints = [
        (-10.6, -7.8, 0.08, 0.85),
        (-8.6, -6.3, 0.14, 0.72),
        (-1.4, -0.6, 0.38, 0.88),
        (0.8, 1.1, 0.50, 0.78),
    ]
    for idx, (wx, wy, wz, sc) in enumerate(waypoints):
        build_scalloped_island(f"StepIsle_{idx}", (wx, wy, wz), rx=1.15 * sc, ry=0.95 * sc, thickness=0.55 * sc, bucket=outdoor_bucket, lobes=6, seed=300 + idx)
        add_flower_bush(f"StepBloom_{idx}", (wx + 0.25 * sc, wy + 0.15 * sc, wz + 0.02), 0.52 * sc, "lavender" if idx % 2 else "rose", outdoor_bucket, seed=320 + idx)


def build_zone3_multiwing_villa(
    outdoor_bucket: list[bpy.types.Object],
    roof_bucket: list[bpy.types.Object],
    front_upper_bucket: list[bpy.types.Object],
    int_shell_bucket: list[bpy.types.Object],
    furn_bucket: list[bpy.types.Object],
    glass_roof_bucket: list[bpy.types.Object],
    glass_upper_bucket: list[bpy.types.Object],
    glass_base_bucket: list[bpy.types.Object],
    bulb_bucket: list[bpy.types.Object],
    dynamic_nodes: dict[str, list[bpy.types.Object]],
    interior_lights: list[bpy.types.Object],
) -> None:
    """Builds the redesigned 3-Volume Provençal-French Garden Villa + Rooftop Terrace + `两室一厅`."""
    ox, oy, oz = VILLA_ORIGIN

    # 1. Sculpted Scalloped Estate Island & Front Courtyard Garden
    build_scalloped_island("VillaIsl", (ox, oy - 0.55, oz), rx=5.85, ry=5.15, thickness=1.45, bucket=outdoor_bucket, lobes=16, seed=55)

    m_stucco = clay_mat("VillaStucco", PALETTE["stucco_light"], 0.88)
    m_stucco_w = clay_mat("VillaStuccoWarm", PALETTE["stucco_warm"], 0.88)
    m_stone = clay_mat("VillaStone", PALETTE["limestone"], 0.86)
    m_quoin = clay_mat("VillaQuoin", PALETTE["quoin_stone"], 0.86)
    m_oak = clay_mat("VillaOak", PALETTE["oak_mid"], 0.82)
    m_oak_dark = clay_mat("VillaOakDark", PALETTE["oak_dark"], 0.80)
    m_rose_awn = clay_mat("AwningRose", PALETTE["awning_rose"], 0.84)
    m_lav_awn = clay_mat("AwningLav", PALETTE["awning_lav"], 0.84)
    m_cream_awn = clay_mat("AwningCream", PALETTE["awning_cream"], 0.84)
    m_terra = clay_mat("VillaTerra", PALETTE["terra_1"], 0.84)
    m_iron = clay_mat("VillaIron", PALETTE["iron_dark"], 0.60, metallic=0.40)
    m_bulb = clay_mat("VillaBulb", "#FFF3D1", 0.40, emission_hex="#FFD88A", emission_strength=3.8)
    m_ivy = clay_mat("TrailingIvy", PALETTE["foliage_deep"], 0.86)

    # Curved Travertine Courtyard Path, Low Courtyard Wall & Wrought-Iron Rose Gate
    for si in range(7):
        t = si / 6.0
        px = ox + 0.05 - math.sin(t * math.pi) * 0.35
        py = oy - 4.75 + t * 2.25
        add_rbox(f"PathSlab_{si}", (px, py, oz + 0.025), (0.92, 0.32, 0.05), m_stone, outdoor_bucket, bevel=0.02, rot=(0, 0, math.cos(t * 2.5) * 0.08))

    # Front courtyard low cream wall + arched rose gate
    for side, x_seg in [(-1, -2.25), (1, 2.35)]:
        add_rbox(f"YardWall_{side}", (ox + x_seg, oy - 4.45, oz + 0.28), (2.55, 0.20, 0.52), m_stucco_w, outdoor_bucket, bevel=0.03)
        add_rbox(f"YardWallCap_{side}", (ox + x_seg, oy - 4.45, oz + 0.56), (2.64, 0.26, 0.07), m_stone, outdoor_bucket, bevel=0.02)
    for gx in (-0.82, 0.88):
        add_rbox(f"GatePier_{gx:.2f}", (ox + gx, oy - 4.45, oz + 0.56), (0.34, 0.34, 1.12), m_stone, outdoor_bucket, bevel=0.03)
        add_clay_ball(f"GateFinial_{gx:.2f}", (ox + gx, oy - 4.45, oz + 1.20), (0.13, 0.13, 0.15), m_stone, outdoor_bucket, subdiv=2)
    # Climbing-rose timber & stone arch over courtyard gate
    for ai in range(13):
        ang = (ai / 12.0) * math.pi
        ax = ox + 0.03 - math.cos(ang) * 0.85
        az = oz + 1.12 + math.sin(ang) * 0.72
        add_rbox(f"GateArchTimber_{ai}", (ax, oy - 4.45, az), (0.20, 0.16, 0.09), m_oak_dark, outdoor_bucket, bevel=0.02, rot=(0, -(ang - math.pi * 0.5), 0))
        add_clay_ball(f"GateRoseVine_{ai}", (ax, oy - 4.45, az + 0.06), (0.15, 0.14, 0.12), m_ivy, outdoor_bucket, subdiv=3)
        if ai % 2 == 1:
            add_clay_ball(f"GateArchRose_{ai}", (ax, oy - 4.55, az + 0.09), (0.075, 0.075, 0.065), clay_mat("GAR", PALETTE["rose_blush"], 0.80), outdoor_bucket, subdiv=2)

    # Courtyard Landscaping: Blossom Tree, Lavender/Hydrangea Beds, Vintage Postbox & Stone Bench
    add_clay_tree("VillaBlossomTree", (ox - 4.15, oy - 2.65, oz), 1.38, outdoor_bucket, style="blossom", seed=301)
    add_clay_tree("VillaCypressBackL", (ox - 4.35, oy + 2.45, oz), 1.48, outdoor_bucket, style="cypress", seed=302)
    add_clay_tree("VillaOliveRight", (ox + 4.45, oy + 1.65, oz), 1.32, outdoor_bucket, style="olive", seed=303)
    for idx, (fx, fy, fkind) in enumerate([
        (-2.85, -3.55, "lavender"), (-1.65, -3.65, "hydrangea"), (1.65, -3.55, "rose"),
        (2.95, -3.35, "lavender"), (4.05, -1.65, "hydrangea"), (-4.15, -0.35, "rose"),
    ]):
        add_flower_bush(f"VillaGarden_{idx}", (ox + fx, oy + fy, oz + 0.02), 0.88, fkind, outdoor_bucket, seed=350 + idx)

    # Dusty-rose vintage postbox + Stone courtyard bench + Courtyard string lights
    add_rcyl("PostboxPole", (ox - 0.92, oy - 3.65, oz + 0.42), 0.045, 0.84, m_oak_dark, outdoor_bucket, verts=12)
    add_rbox("PostboxBody", (ox - 0.92, oy - 3.65, oz + 0.92), (0.28, 0.36, 0.26), m_rose_awn, outdoor_bucket, bevel=0.06)
    add_rbox("VillaBench", (ox + 2.55, oy - 3.15, oz + 0.26), (1.12, 0.42, 0.08), m_stone, outdoor_bucket, bevel=0.025, rot=(0, 0, -0.25))

    # =========================================================================
    # 2. ASYMMETRIC 3-VOLUME VILLA SHELL (Base vs Front-Upper Cutaway Split!)
    # =========================================================================
    zf = oz + 0.08
    z_cut = zf + 1.06  # Waist-height cutaway plane when roof opens (`1.06m` above floor)
    z_eave_w = zf + 2.52  # West Gabled Main Wing eave height
    z_eave_e = zf + 2.34  # East Rooftop-Terrace Wing cornice height

    # Stone foundation plinth around the stepped multi-wing footprint
    add_rbox("PlinthWest", (ox - 1.66, oy + 0.08, oz + 0.14), (3.92, 4.78, 0.28), m_stone, outdoor_bucket, bevel=0.03)
    add_rbox("PlinthBay", (ox - 2.02, oy - 2.36, oz + 0.14), (2.46, 0.38, 0.28), m_stone, outdoor_bucket, bevel=0.03)
    add_rbox("PlinthEast", (ox + 1.92, oy + 0.16, oz + 0.14), (3.56, 4.52, 0.28), m_stone, outdoor_bucket, bevel=0.03)

    # --- Permanent Backdrop Walls (Rear North Wall + Rear West/East Side Walls) ---
    # Rear North wall (full height so rooms have a warm sunlit backdrop with art & kitchen window!)
    add_rbox("WallRearWest", (ox - 1.66, oy + 2.36, (zf + z_eave_w) * 0.5), (3.84, 0.18, z_eave_w - zf), m_stucco, int_shell_bucket, bevel=0.02)
    add_rbox("WallRearEast", (ox + 1.92, oy + 2.30, (zf + z_eave_e) * 0.5), (3.48, 0.18, z_eave_e - zf), m_stucco, int_shell_bucket, bevel=0.02)
    add_french_window("KitchenRearWin", (ox + 2.18, oy + 2.38, zf + 1.48), 1.06, 0.82, math.pi, outdoor_bucket, glass_base_bucket, with_shutters=True, with_flowerbox=False)

    # West Side Wall: Rear half (`主卧` bay window backdrop) stays full height; Front half splits at `z_cut`!
    add_rbox("WallWestRear", (ox - 3.52, oy + 1.22, (zf + z_eave_w) * 0.5), (0.18, 2.38, z_eave_w - zf), m_stucco, int_shell_bucket, bevel=0.02)
    add_french_window("MasterSideWin", (ox - 3.56, oy + 1.18, zf + 1.38), 1.08, 1.02, -math.pi * 0.5, outdoor_bucket, glass_base_bucket, with_shutters=True, with_flowerbox=True)
    add_rbox("WallWestFrontLow", (ox - 3.52, oy - 1.08, (zf + z_cut) * 0.5), (0.18, 2.36, z_cut - zf), m_stucco, int_shell_bucket, bevel=0.02)
    add_rbox("WallWestFrontCap", (ox - 3.52, oy - 1.08, z_cut + 0.02), (0.22, 2.38, 0.045), m_oak, int_shell_bucket, bevel=0.012)
    add_rbox("WallWestFrontUp", (ox - 3.52, oy - 1.08, (z_cut + z_eave_w) * 0.5), (0.18, 2.36, z_eave_w - z_cut), m_stucco, front_upper_bucket, bevel=0.02)

    # East Side Wall (`一厅` fireplace & dining side): Rear stays full height; Front half splits at `z_cut` or stays `1.45m`!
    add_rbox("WallEastRear", (ox + 3.58, oy + 1.16, (zf + z_eave_e) * 0.5), (0.18, 2.36, z_eave_e - zf), m_stucco, int_shell_bucket, bevel=0.02)
    add_french_window("DiningSideWin", (ox + 3.62, oy + 1.05, zf + 1.38), 1.04, 1.02, math.pi * 0.5, outdoor_bucket, glass_base_bucket, with_shutters=True, with_flowerbox=True)
    add_rbox("WallEastFrontLow", (ox + 3.58, oy - 0.96, (zf + z_cut) * 0.5), (0.18, 2.02, z_cut - zf), m_stucco, int_shell_bucket, bevel=0.02)
    add_rbox("WallEastFrontCap", (ox + 3.58, oy - 0.96, z_cut + 0.02), (0.22, 2.04, 0.045), m_oak, int_shell_bucket, bevel=0.012)
    add_rbox("WallEastFrontUp", (ox + 3.58, oy - 0.96, (z_cut + z_eave_e) * 0.5), (0.18, 2.02, z_eave_e - z_cut), m_stucco, front_upper_bucket, bevel=0.02)

    # --- Front Facade (3 Stepped Architectural Volumes: Projecting Cross-Gable Bay + Arched Portico + Conservatory!) ---
    # A. Lower Front Cutaway Sill Walls (`zf -> z_cut`, remain visible when roof lifts!)
    # Volume A Front Bay (`dx: -3.52 .. -0.78`, `dy = -2.44`)
    add_rbox("FrontBayLow", (ox - 2.15, oy - 2.42, (zf + z_cut) * 0.5), (2.78, 0.22, z_cut - zf), m_stucco, int_shell_bucket, bevel=0.02)
    add_rbox("FrontBayLowCap", (ox - 2.15, oy - 2.42, z_cut + 0.02), (2.82, 0.26, 0.045), m_oak, int_shell_bucket, bevel=0.012)
    # Volume C Stepped-Back Conservatory Front (`dx: +0.86 .. +3.58`, `dy = -1.98`)
    add_rbox("FrontEastLow", (ox + 2.22, oy - 1.98, (zf + z_cut) * 0.5), (2.74, 0.20, z_cut - zf), m_stucco, int_shell_bucket, bevel=0.02)
    add_rbox("FrontEastLowCap", (ox + 2.22, oy - 1.98, z_cut + 0.02), (2.78, 0.24, 0.045), m_oak, int_shell_bucket, bevel=0.012)

    # Volume B Center Arched Portico Steps & Threshold (`dx: -0.78 .. +0.86`, `dy = -2.22`)
    for st_i in range(3):
        add_rbox(f"PorchStep_{st_i}", (ox + 0.04, oy - 2.52 - st_i * 0.26, oz + 0.06 + (2 - st_i) * 0.08), (1.76 + st_i * 0.14, 0.30, 0.12), m_stone, outdoor_bucket, bevel=0.025)
    # Lower French Entry Door Jambs & Threshold
    for px_c in (-0.72, 0.80):
        add_rbox(f"PorticoColLow_{px_c:.2f}", (ox + px_c, oy - 2.32, (zf + z_cut) * 0.5), (0.28, 0.28, z_cut - zf), m_stone, outdoor_bucket, bevel=0.03)

    # B. Upper Front Facade (`z_cut -> eaves`, in `VillaFrontUpperNode` so it lifts cleanly with the roof!)
    # Volume A Upper Front Cross-Gable Bay + Arched French Window + Bullseye Oculus!
    add_rbox("FrontBayUp", (ox - 2.15, oy - 2.42, (z_cut + z_eave_w) * 0.5), (2.78, 0.22, z_eave_w - z_cut), m_stucco, front_upper_bucket, bevel=0.02)
    add_french_window("StudioFrontWin", (ox - 2.12, oy - 2.48, zf + 1.42), 1.18, 1.12, 0.0, front_upper_bucket, glass_upper_bucket, with_shutters=True, with_flowerbox=True)
    # Alternating Sandstone Corner Quoins (`转角隅石`) on West Gable Wing
    for qi in range(5):
        qz = z_cut + 0.18 + qi * 0.28
        qw = 0.26 if qi % 2 == 0 else 0.18
        add_rbox(f"QuoinFL_{qi}", (ox - 3.48, oy - 2.42, qz), (qw, 0.26, 0.18), m_quoin, front_upper_bucket, bevel=0.02)

    # Volume B Upper Portico Stone Archway + French Double Doors + Scalloped Dusty-Rose Awning (`f_04.jpg`!)
    for px_c in (-0.72, 0.80):
        add_rbox(f"PorticoColUp_{px_c:.2f}", (ox + px_c, oy - 2.32, (z_cut + z_eave_e) * 0.5), (0.28, 0.28, z_eave_e - z_cut), m_stone, front_upper_bucket, bevel=0.03)
    add_rbox("PorticoLintel", (ox + 0.04, oy - 2.32, z_eave_e - 0.18), (1.84, 0.32, 0.34), m_stone, front_upper_bucket, bevel=0.04)
    add_rbox("FrenchDoorFull", (ox + 0.04, oy - 2.22, zf + 1.05), (1.18, 0.10, 2.06), m_oak_dark, front_upper_bucket, bevel=0.02)
    add_french_window("EntryDoorGlass", (ox + 0.04, oy - 2.24, zf + 1.38), 0.86, 1.02, 0.0, front_upper_bucket, glass_upper_bucket, with_shutters=False, with_flowerbox=False)
    # Scalloped Dusty-Rose & Cream Striped Café Awning over Entrance (`f_04.jpg` signature!)
    for aw_i in range(7):
        ax_s = ox - 0.74 + aw_i * 0.26
        m_str = m_rose_awn if aw_i % 2 == 0 else m_cream_awn
        add_rbox(f"PorticoAwning_{aw_i}", (ax_s, oy - 2.66, zf + 2.08), (0.25, 0.68, 0.10), m_str, front_upper_bucket, bevel=0.03, rot=(0.36, 0, 0))
        add_rcyl(f"AwningScallop_{aw_i}", (ax_s, oy - 2.96, zf + 1.94), 0.125, 0.12, m_str, front_upper_bucket, verts=16, bevel=0.02)
    # Twin Warm Glowing Carriage Lanterns flanking portico (parented to VillaFrontUpperNode via glass_upper_bucket!)
    for lx_s in (-0.74, 0.82):
        add_rbox(f"PorticoLanternCap_{lx_s:.2f}", (ox + lx_s, oy - 2.52, zf + 1.77), (0.14, 0.14, 0.04), m_oak_dark, front_upper_bucket, bevel=0.01)
        add_clay_ball(f"PorticoLantern_{lx_s:.2f}", (ox + lx_s, oy - 2.52, zf + 1.66), (0.075, 0.075, 0.10), m_bulb, glass_upper_bucket, subdiv=2)

    # Volume C Upper Conservatory Front + Tall Arched French Windows
    add_rbox("FrontEastUp", (ox + 2.22, oy - 1.98, (z_cut + z_eave_e) * 0.5), (2.74, 0.20, z_eave_e - z_cut), m_stucco, front_upper_bucket, bevel=0.02)
    add_rbox("EastCorniceFrieze", (ox + 1.92, oy + 0.16, z_eave_e + 0.05), (3.68, 4.62, 0.12), m_stone, front_upper_bucket, bevel=0.03)
    add_french_window("LivingFrontWin", (ox + 2.26, oy - 2.04, zf + 1.38), 1.36, 1.08, 0.0, front_upper_bucket, glass_upper_bucket, with_shutters=True, with_flowerbox=True)

    # =========================================================================
    # 3. SCULPTED MULTI-VOLUME ROOF & ROOFTOP GARDEN TERRACE (`VillaRoofNode`)
    # =========================================================================
    z_ridge = zf + 4.12
    # West Wing Main Gable Prism + Terracotta Barrel-Tile Slopes
    add_gable_prism("WestRoofGable", (ox - 1.66, oy + 0.06), 3.92, 4.92, z_eave_w - 0.04, z_ridge - 0.08, m_stucco, roof_bucket, ridge_along_x=True)
    add_rbox("WestSlopeDeckF", (ox - 1.66, oy - 1.24, (z_eave_w + z_ridge) * 0.5), (4.16, 2.98, 0.10), m_oak_dark, roof_bucket, bevel=0.02, rot=(0.56, 0, 0))
    add_rbox("WestSlopeDeckB", (ox - 1.66, oy + 1.36, (z_eave_w + z_ridge) * 0.5), (4.16, 2.98, 0.10), m_oak_dark, roof_bucket, bevel=0.02, rot=(-0.56, 0, 0))
    add_terracotta_barrel_slope("WestTileF", ox - 3.68, ox + 0.36, oy - 2.52, oy + 0.06, z_eave_w - 0.02, z_ridge, roof_bucket, seed=401)
    add_terracotta_barrel_slope("WestTileB", ox - 3.68, ox + 0.36, oy + 2.64, oy + 0.06, z_eave_w - 0.02, z_ridge, roof_bucket, seed=402)
    # Mortar Ridge Tiles
    for ri in range(16):
        add_rcyl(f"RidgeCap_{ri}", (ox - 3.55 + ri * 0.255, oy + 0.06, z_ridge + 0.06), 0.11, 0.27, m_stone, roof_bucket, verts=14, bevel=0.02, rot=(0, math.pi * 0.5, 0))

    # Projecting Front Cross-Gable Pediment + Bullseye Attic Window (`圆花窗`)
    z_cross_peak = zf + 3.62
    add_gable_prism("CrossGablePediment", (ox - 2.15, oy - 1.95), 2.74, 1.12, z_eave_w - 0.04, z_cross_peak, m_stucco, roof_bucket, ridge_along_x=False)
    add_rbox("CrossBargeL", (ox - 2.86, oy - 2.02, (z_eave_w + z_cross_peak) * 0.5 + 0.04), (1.66, 1.24, 0.10), m_terra, roof_bucket, bevel=0.02, rot=(0, -0.66, 0))
    add_rbox("CrossBargeR", (ox - 1.44, oy - 2.02, (z_eave_w + z_cross_peak) * 0.5 + 0.04), (1.66, 1.24, 0.10), m_terra, roof_bucket, bevel=0.02, rot=(0, 0.66, 0))
    add_rcyl("AtticOculusRing", (ox - 2.15, oy - 2.52, zf + 2.98), 0.28, 0.10, m_stone, roof_bucket, verts=24, bevel=0.02, rot=(math.pi * 0.5, 0, 0))
    add_rcyl("AtticOculusGlass", (ox - 2.15, oy - 2.50, zf + 2.98), 0.21, 0.04, clay_mat("AtticGlow", "#FFE8BC", 0.25, emission_hex="#FFD996", emission_strength=1.4, alpha=0.65), glass_roof_bucket, verts=20, rot=(math.pi * 0.5, 0, 0))

    # Stone & Terracotta Chimney Stack on Northwest Slope
    chx, chy = ox - 2.95, oy + 1.15
    add_rbox("ChimneyShaft", (chx, chy, z_ridge + 0.22), (0.62, 0.62, 1.28), m_stone, roof_bucket, bevel=0.03)
    add_rbox("ChimneyCap", (chx, chy, z_ridge + 0.88), (0.72, 0.72, 0.10), m_quoin, roof_bucket, bevel=0.02)
    for px_p in (-0.14, 0.14):
        add_rcyl(f"ChimneyPot_{px_p:.2f}", (chx + px_p, chy, z_ridge + 1.06), 0.09, 0.28, m_terra, roof_bucket, verts=16, bevel=0.015)

    # Volume C Balustraded Rooftop Flower Terrace (`f_04.jpg` & `frame_03.jpg` crowning jewel!)
    zt = z_eave_e + 0.10
    add_rbox("TerraceDeck", (ox + 1.92, oy + 0.16, zt - 0.04), (3.52, 4.48, 0.10), m_terra, roof_bucket, bevel=0.02)
    # Carved cream limestone balusters & coping rails around front, east, and rear of rooftop terrace
    for bx_i in range(8):
        add_rcyl(f"BalusterF_{bx_i}", (ox + 0.48 + bx_i * 0.42, oy - 1.98, zt + 0.26), 0.045, 0.48, m_stone, roof_bucket, verts=12, bevel=0.01)
        add_rcyl(f"BalusterB_{bx_i}", (ox + 0.48 + bx_i * 0.42, oy + 2.30, zt + 0.26), 0.045, 0.48, m_stone, roof_bucket, verts=12, bevel=0.01)
    for by_i in range(9):
        add_rcyl(f"BalusterE_{by_i}", (ox + 3.58, oy - 1.72 + by_i * 0.48, zt + 0.26), 0.045, 0.48, m_stone, roof_bucket, verts=12, bevel=0.01)
    add_rbox("BalRailF", (ox + 1.95, oy - 1.98, zt + 0.52), (3.42, 0.16, 0.07), m_stone, roof_bucket, bevel=0.02)
    add_rbox("BalRailB", (ox + 1.95, oy + 2.30, zt + 0.52), (3.42, 0.16, 0.07), m_stone, roof_bucket, bevel=0.02)
    add_rbox("BalRailE", (ox + 3.58, oy + 0.16, zt + 0.52), (0.16, 4.42, 0.07), m_stone, roof_bucket, bevel=0.02)
    for cx_p, cy_p in [(3.58, -1.98), (3.58, 2.30), (0.36, -1.98)]:
        add_rbox(f"BalPier_{cx_p}_{cy_p}", (ox + cx_p, oy + cy_p, zt + 0.30), (0.26, 0.26, 0.62), m_stone, roof_bucket, bevel=0.025)
        add_clay_ball(f"BalOrb_{cx_p}_{cy_p}", (ox + cx_p, oy + cy_p, zt + 0.68), (0.10, 0.10, 0.11), m_stone, roof_bucket, subdiv=2)

    # Rooftop Café Parasol Umbrella + Bistro Set + Cascading Ivy Planters (`f_04.jpg`!)
    ux, uy = ox + 2.15, oy + 0.25
    add_rcyl("RoofUmbrellaPole", (ux, uy, zt + 0.88), 0.035, 1.72, m_oak_dark, roof_bucket, verts=12)
    add_rcyl("RoofUmbrellaCanopy", (ux, uy, zt + 1.68), 1.12, 0.32, m_lav_awn, roof_bucket, verts=8, bevel=0.04)
    add_rcyl("RoofUmbrellaCap", (ux, uy, zt + 1.86), 0.22, 0.12, m_cream_awn, roof_bucket, verts=8, bevel=0.02)
    add_rcyl("RoofCafeTable", (ux, uy, zt + 0.52), 0.42, 0.05, m_oak, roof_bucket, verts=22, bevel=0.015)
    for side in (-0.52, 0.52):
        add_rbox(f"RoofChair_{side:.2f}", (ux + side, uy, zt + 0.32), (0.34, 0.34, 0.06), m_cream_awn, roof_bucket, bevel=0.02)
    # Cascading trailing ivy over rooftop front & east cornice
    for iv_i in range(9):
        ix = ox + 1.05 + iv_i * 0.28
        drop = 0.18 + (iv_i % 3) * 0.14
        add_clay_ball(f"CascadingIvy_{iv_i}", (ix, oy - 2.08, zt - drop * 0.5), (0.12, 0.09, drop), m_ivy, roof_bucket, subdiv=2, wobble=0.15, seed=500 + iv_i)
    add_flower_bush("RoofPlanter1", (ox + 0.85, oy + 1.65, zt + 0.02), 0.72, "lavender", roof_bucket, seed=520)
    add_flower_bush("RoofPlanter2", (ox + 3.05, oy - 1.45, zt + 0.02), 0.68, "rose", roof_bucket, seed=521)

    # 4. Populate Complete `两室一厅` Interior!
    build_villa_interior(VILLA_ORIGIN, int_shell_bucket, furn_bucket, dynamic_nodes, interior_lights)


def render_verification_stills(preview_dir: Path, roof_empty: bpy.types.Object, upper_empty: bpy.types.Object) -> None:
    """Renders Cycles verification PNGs of the actual baked UV atlases before GLB export."""
    preview_dir.mkdir(parents=True, exist_ok=True)
    scn = bpy.context.scene
    prev_samples = scn.cycles.samples
    scn.cycles.samples = 16
    scn.render.resolution_x = 1280
    scn.render.resolution_y = 800
    scn.render.image_settings.file_format = "PNG"

    # Temporarily route *BakedMat directly to Surface Emission (strength 1.0) + Standard view transform
    # so the preview matches Three.js unlit MeshBasicMaterial 1:1 and exposes any UV/bake artifact!
    prev_vt = scn.view_settings.view_transform
    prev_look = scn.view_settings.look
    scn.view_settings.view_transform = "Standard"
    scn.view_settings.look = "None"
    restore_links: list[tuple[bpy.types.NodeTree, bpy.types.Node, bpy.types.NodeSocket, bpy.types.NodeSocket]] = []
    for mat in bpy.data.materials:
        if mat.name.endswith("BakedMat") and mat.use_nodes:
            nt = mat.node_tree
            out_n = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
            tex_n = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None)
            bsdf_n = nt.nodes.get("Principled BSDF")
            if out_n and tex_n and bsdf_n:
                em = nt.nodes.new("ShaderNodeEmission")
                nt.links.new(tex_n.outputs["Color"], em.inputs["Color"])
                nt.links.new(em.outputs["Emission"], out_n.inputs["Surface"])
                restore_links.append((nt, em, bsdf_n.outputs["BSDF"], out_n.inputs["Surface"]))

    cam_d = bpy.data.cameras.new("QACam")
    cam_d.lens = 38.0
    cam = bpy.data.objects.new("QACam", cam_d)
    bpy.context.collection.objects.link(cam)
    scn.camera = cam

    def look_at(pos: tuple[float, float, float], target: tuple[float, float, float]) -> None:
        cam.location = Vector(pos)
        direction = Vector(target) - Vector(pos)
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    ox, oy, oz = VILLA_ORIGIN
    # 1. Redesigned Multi-Volume Villa Exterior (`03 / 06`)
    look_at((ox + 5.8, oy - 11.2, oz + 5.8), (ox - 0.2, oy - 0.3, oz + 1.6))
    scn.render.filepath = str(preview_dir / "sw_preview_villa_ext.png")
    bpy.ops.render.render(write_still=True)

    # 2. Cutaway `两室一厅` Interior (`04 / 06` & `05 / 06`)
    for child in list(roof_empty.children) + list(upper_empty.children):
        child.hide_render = True
    look_at((ox + 3.4, oy - 6.8, oz + 6.2), (ox + 0.0, oy + 0.2, oz + 0.8))
    scn.render.filepath = str(preview_dir / "sw_preview_villa_cutaway.png")
    bpy.ops.render.render(write_still=True)
    for child in list(roof_empty.children) + list(upper_empty.children):
        child.hide_render = False

    # 3. Finale Hero Bouquet (`06 / 06`)
    bx, by, bz = BOUQUET_ORIGIN
    look_at((bx + 0.25, by - 5.2, bz + 0.65), (bx - 0.05, by - 0.1, bz + 0.05))
    scn.render.filepath = str(preview_dir / "sw_preview_bouquet.png")
    bpy.ops.render.render(write_still=True)

    for nt, em, bsdf_out, surf_in in restore_links:
        nt.links.new(bsdf_out, surf_in)
        nt.nodes.remove(em)
    scn.view_settings.view_transform = prev_vt
    scn.view_settings.look = prev_look
    bpy.data.objects.remove(cam, do_unlink=True)
    scn.cycles.samples = prev_samples


def main() -> None:
    reset_scene()
    studio_lights = add_studio_lights()

    # Temporary `#F5EDE0` shadow-bounce floor under islands for authentic Cycles under-cliff GI!
    bounce_bucket: list[bpy.types.Object] = []
    bounce_floor = add_rbox("TempStudioBounceFloor", (-2.0, -1.0, -1.95), (48.0, 42.0, 0.10), clay_mat("BounceCream", PALETTE["bg_cream"], 0.95), bounce_bucket, bevel=0.0)

    outdoor_bucket: list[bpy.types.Object] = []
    roof_bucket: list[bpy.types.Object] = []
    front_upper_bucket: list[bpy.types.Object] = []
    int_shell_bucket: list[bpy.types.Object] = []
    furn_bucket: list[bpy.types.Object] = []
    bouquet_bucket: list[bpy.types.Object] = []
    orbit_bucket: list[bpy.types.Object] = []
    water_bucket: list[bpy.types.Object] = []
    bulb_bucket: list[bpy.types.Object] = []
    glass_roof_bucket: list[bpy.types.Object] = []
    glass_upper_bucket: list[bpy.types.Object] = []
    glass_base_bucket: list[bpy.types.Object] = []
    dynamic_nodes: dict[str, list[bpy.types.Object]] = {}
    interior_lights: list[bpy.types.Object] = []

    build_zone1_brook_island(outdoor_bucket, water_bucket)
    build_zone2_plaza_island(outdoor_bucket, water_bucket, bulb_bucket)
    build_stepping_trails(outdoor_bucket)
    build_zone3_multiwing_villa(
        outdoor_bucket,
        roof_bucket,
        front_upper_bucket,
        int_shell_bucket,
        furn_bucket,
        glass_roof_bucket,
        glass_upper_bucket,
        glass_base_bucket,
        bulb_bucket,
        dynamic_nodes,
        interior_lights,
    )
    build_hero_bouquet(BOUQUET_ORIGIN, bouquet_bucket, orbit_bucket)

    # Hierarchical Root Empties for Clean Three.js Animation & Cutaway Control
    world_root = bpy.data.objects.new("ScrollWorldRoot", None)
    bpy.context.collection.objects.link(world_root)

    villa_base_node = bpy.data.objects.new("VillaBaseNode", None)
    villa_roof_node = bpy.data.objects.new("VillaRoofNode", None)
    villa_upper_node = bpy.data.objects.new("VillaFrontUpperNode", None)
    bouquet_root_node = bpy.data.objects.new("HeroBouquetNode", None)
    bouquet_orbit_node = bpy.data.objects.new("BouquetOrbitNode", None)
    bouquet_orbit_node.location = BOUQUET_ORIGIN

    for node in (villa_base_node, villa_roof_node, villa_upper_node, bouquet_root_node):
        bpy.context.collection.objects.link(node)
        node.parent = world_root
    bpy.context.collection.objects.link(bouquet_orbit_node)
    bouquet_orbit_node.parent = bouquet_root_node

    with tempfile.TemporaryDirectory() as tmp_str:
        tmp_dir = Path(tmp_str)

        # PASS 1: Exterior Closed Bake (Roof & Upper Front visible!)
        join_and_bake_group("OutdoorIslandsBaked", outdoor_bucket, "OutdoorIslandsAtlas", 2048, world_root, tmp_dir)
        roof_baked = join_and_bake_group("VillaRoofBaked", roof_bucket, "VillaRoofAtlas", 2048, villa_roof_node, tmp_dir)
        upper_baked = join_and_bake_group("VillaFrontUpperBaked", front_upper_bucket, "VillaFrontUpperAtlas", 1024, villa_upper_node, tmp_dir)
        join_and_bake_group("HeroBouquetBaked", bouquet_bucket, "HeroBouquetAtlas", 1536, bouquet_root_node, tmp_dir)

        # Attach glass panes to their respective moving/static hierarchies
        for g_obj in glass_roof_bucket:
            g_obj.parent = villa_roof_node
        for g_obj in glass_upper_bucket:
            g_obj.parent = villa_upper_node
        for g_obj in glass_base_bucket:
            g_obj.parent = villa_base_node

        # PASS 2: Cutaway Interior Bake (Hide Roof & Upper Front so warm sky + room lights flood `两室一厅`!)
        roof_baked.hide_render = True
        upper_baked.hide_render = True
        for g_obj in glass_roof_bucket + glass_upper_bucket:
            g_obj.hide_render = True

        join_and_bake_group("VillaInteriorShellBaked", int_shell_bucket, "VillaIntShellAtlas", 2048, villa_base_node, tmp_dir)
        join_and_bake_group("VillaFurnitureBaked", furn_bucket, "VillaFurnitureAtlas", 2048, villa_base_node, tmp_dir)

        roof_baked.hide_render = False
        upper_baked.hide_render = False
        for g_obj in glass_roof_bucket + glass_upper_bucket:
            g_obj.hide_render = False

        # Parent dynamic / translucent / glowing elements cleanly
        for w_obj in water_bucket:
            w_obj.parent = world_root
        for b_obj in bulb_bucket:
            b_obj.parent = world_root
        for o_obj in orbit_bucket:
            # Convert world coords to local relative to BOUQUET_ORIGIN so rotating `BouquetOrbitNode` orbits smoothly!
            o_obj.location = Vector(o_obj.location) - Vector(BOUQUET_ORIGIN)
            o_obj.parent = bouquet_orbit_node
        for dyn_name, dyn_objs in dynamic_nodes.items():
            dyn_empty = bpy.data.objects.new(dyn_name, None)
            bpy.context.collection.objects.link(dyn_empty)
            if dyn_objs:
                piv = dyn_objs[0].location.copy()
                dyn_empty.location = piv
                for dobj in dyn_objs:
                    dobj.location = dobj.location - piv
                    dobj.parent = dyn_empty
            dyn_empty.parent = villa_base_node

        # Optional preview renders
        preview_env = os.environ.get("VILLA_PREVIEW_DIR", "").strip()
        if preview_env:
            render_verification_stills(Path(preview_env), villa_roof_node, villa_upper_node)

        # Remove temporary bounce floor & baking lights, and restore direct BSDF links before glTF export
        bpy.data.objects.remove(bounce_floor, do_unlink=True)
        for l_obj in studio_lights + interior_lights:
            bpy.data.objects.remove(l_obj, do_unlink=True)
        strip_bake_backface_nodes()

        OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=str(OUT_GLB),
            export_format="GLB",
            export_yup=True,
            export_apply=False,
            export_texcoords=True,
            export_normals=True,
            export_materials="EXPORT",
            export_image_format="AUTO",
        )
        size_kb = OUT_GLB.stat().st_size / 1024.0
        print(f"[SCROLL WORLD GLB OK] {OUT_GLB}: {size_kb:.1f} KB")


if __name__ == "__main__":
    main()
