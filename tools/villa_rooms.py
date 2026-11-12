#!/usr/bin/env python3
"""Builds the cozy `两室一厅` clay interior & Finale Hero Bouquet for `bloom-for-you`."""

from __future__ import annotations

import math
import random
import bpy
from clay_kit import (
    PALETTE,
    add_clay_ball,
    add_rbox,
    add_rcyl,
    add_sculpted_rose_head,
    add_tapered_cone,
    clay_mat,
)


def build_villa_interior(
    origin: tuple[float, float, float],
    shell_bucket: list[bpy.types.Object],
    furn_bucket: list[bpy.types.Object],
    dynamic_nodes: dict[str, list[bpy.types.Object]],
    interior_lights: list[bpy.types.Object],
) -> None:
    """Populates interior parquet floors, cutaway partitions, and full `两室一厅` furniture."""
    ox, oy, oz = origin
    zf = oz + 0.08  # Finished oak floor surface

    m_plaster = clay_mat("IntPlaster", "#F6EDE0", 0.90)
    m_oak1 = clay_mat("OakFloorA", PALETTE["oak_light"], 0.84)
    m_oak2 = clay_mat("OakFloorB", "#C59365", 0.84)
    m_oak_trim = clay_mat("OakTrim", PALETTE["oak_mid"], 0.80)
    m_oak_dark = clay_mat("OakDark", PALETTE["oak_dark"], 0.82)
    m_cream = clay_mat("SofaCream", PALETTE["sofa_cream"], 0.90)
    m_white = clay_mat("LinenWhite", PALETTE["linen_white"], 0.88)
    m_blush = clay_mat("LinenBlush", PALETTE["linen_blush"], 0.86)
    m_lav = clay_mat("LinenLav", PALETTE["linen_lav"], 0.86)
    m_sage = clay_mat("FridgeSage", PALETTE["fridge_sage"], 0.78)
    m_blue = clay_mat("LinenBlue", PALETTE["linen_blue"], 0.88)
    m_butter = clay_mat("LinenButter", PALETTE["linen_butter"], 0.85)
    m_coral = clay_mat("RugCoral", PALETTE["rug_coral"], 0.90)
    m_rug = clay_mat("RugCream", PALETTE["rug_cream"], 0.92)
    m_brass = clay_mat("BrassClay", PALETTE["brass"], 0.42, metallic=0.65)
    m_copper = clay_mat("CopperClay", PALETTE["copper"], 0.46, metallic=0.60)
    m_iron = clay_mat("IronClay", PALETTE["iron_dark"], 0.65, metallic=0.35)
    m_lamp_glow = clay_mat("ShadeGlow", "#FFF2D6", 0.75, emission_hex="#FFD999", emission_strength=2.2)
    m_stone = clay_mat("HearthStone", PALETTE["limestone"], 0.88)

    # 1. Warm alternating oak plank floors across West Wing (`两室`) & East Wing (`一厅`)
    add_rbox("WestFloorBase", (ox - 1.62, oy + 0.06, oz + 0.04), (3.76, 4.64, 0.08), m_oak1, shell_bucket, bevel=0.01)
    add_rbox("EastFloorBase", (ox + 1.88, oy + 0.14, oz + 0.04), (3.44, 4.38, 0.08), m_oak1, shell_bucket, bevel=0.01)
    for idx in range(18):
        px = -3.35 + idx * 0.39
        span_y = 4.48 if px < 0.22 else 4.20
        cy = 0.06 if px < 0.22 else 0.14
        add_rbox(f"OakPlank_{idx}", (ox + px, oy + cy, zf + 0.004), (0.36, span_y, 0.012), m_oak2 if idx % 2 else m_oak1, shell_bucket, bevel=0.004)

    # 2. Waist-height (`1.04m`) `Pearl & Co.` cutaway interior partitions with honey-oak caps
    z_part = 1.04
    # Divider between `次卧` (front-west) and `主卧` (rear-west)
    add_rbox("PartBedrooms", (ox - 2.02, oy + 0.06, zf + z_part * 0.5), (2.86, 0.13, z_part), m_plaster, shell_bucket, bevel=0.02)
    add_rbox("PartBedroomsCap", (ox - 2.02, oy + 0.06, zf + z_part + 0.025), (2.92, 0.17, 0.05), m_oak_trim, shell_bucket, bevel=0.015)

    # Central spine divider between `两室` (west) and `一厅` (east), leaving front entry foyer & hallway
    add_rbox("PartSpineRear", (ox + 0.20, oy + 1.28, zf + z_part * 0.5), (0.14, 1.92, z_part), m_plaster, shell_bucket, bevel=0.02)
    add_rbox("PartSpineRearCap", (ox + 0.20, oy + 1.28, zf + z_part + 0.025), (0.18, 1.98, 0.05), m_oak_trim, shell_bucket, bevel=0.015)
    add_rbox("PartSpineFront", (ox + 0.20, oy - 0.82, zf + z_part * 0.5), (0.14, 1.02, z_part), m_plaster, shell_bucket, bevel=0.02)
    add_rbox("PartSpineFrontCap", (ox + 0.20, oy - 0.82, zf + z_part + 0.025), (0.18, 1.08, 0.05), m_oak_trim, shell_bucket, bevel=0.015)

    # =========================================================================
    # ROOM 1 (`一厅` — East Wing): Living Lounge + Fireplace + Open Cake Kitchen
    # =========================================================================
    # Patterned woven rug
    add_rbox("LivingRug", (ox + 1.78, oy - 0.78, zf + 0.012), (2.15, 1.68, 0.022), m_rug, furn_bucket, bevel=0.01)
    add_rbox("LivingRugBorder", (ox + 1.78, oy - 0.78, zf + 0.016), (1.82, 1.34, 0.018), m_coral, furn_bucket, bevel=0.008)
    add_rbox("LivingRugInner", (ox + 1.78, oy - 0.78, zf + 0.020), (1.56, 1.08, 0.018), m_rug, furn_bucket, bevel=0.008)

    # Plush rounded cream bouclé L-sectional sofa
    add_rbox("SofaBaseMain", (ox + 0.86, oy - 0.76, zf + 0.20), (0.82, 1.66, 0.34), m_cream, furn_bucket, bevel=0.08)
    add_rbox("SofaChaise", (ox + 1.48, oy - 1.38, zf + 0.20), (1.16, 0.72, 0.34), m_cream, furn_bucket, bevel=0.08)
    add_rbox("SofaBackWest", (ox + 0.54, oy - 0.76, zf + 0.46), (0.22, 1.66, 0.52), m_cream, furn_bucket, bevel=0.07)
    add_rbox("SofaArmNorth", (ox + 0.86, oy + 0.02, zf + 0.35), (0.82, 0.18, 0.38), m_cream, furn_bucket, bevel=0.06)
    add_rbox("SofaBackSouth", (ox + 1.36, oy - 1.66, zf + 0.42), (1.42, 0.20, 0.44), m_cream, furn_bucket, bevel=0.06)
    # Plump pastel throw pillows
    pillows = [
        (0.76, -0.18, 0.48, (0.18, 0.32, 0.26), m_blush, (0.1, 0.22, 0.2)),
        (0.76, -0.66, 0.48, (0.18, 0.32, 0.26), m_butter, (-0.08, 0.24, -0.1)),
        (0.78, -1.16, 0.48, (0.18, 0.32, 0.26), m_lav, (0.12, 0.20, 0.3)),
        (1.42, -1.46, 0.46, (0.30, 0.18, 0.24), m_sage, (-0.22, 0.06, 0.15)),
        (1.82, -1.36, 0.39, (0.38, 0.48, 0.08), m_blush, (0.0, 0.0, 0.0)),
    ]
    for k, (px, py, pz, sz, mp, rt) in enumerate(pillows):
        add_clay_ball(f"SofaPillow_{k}", (ox + px, oy + py, zf + pz), (sz[0] * 0.65, sz[1] * 0.65, sz[2] * 0.65), mp, furn_bucket, subdiv=2, rot=rt)

    # Oval honey-oak tea table with ceramic tea service & fresh rose vase
    add_rcyl("TeaTableTop", (ox + 1.88, oy - 0.66, zf + 0.36), 0.46, 0.055, m_oak_trim, furn_bucket, verts=28, bevel=0.02, scale_xy=(1.0, 0.84))
    for lx, ly in [(-0.24, -0.18), (0.24, -0.18), (-0.24, 0.18), (0.24, 0.18)]:
        add_rcyl(f"TeaLeg_{lx}_{ly}", (ox + 1.88 + lx, oy - 0.66 + ly, zf + 0.18), 0.032, 0.35, m_oak_dark, furn_bucket, verts=12)
    add_rcyl("TeaTray", (ox + 1.84, oy - 0.64, zf + 0.40), 0.20, 0.02, m_white, furn_bucket, verts=22)
    add_clay_ball("Teapot", (ox + 1.80, oy - 0.62, zf + 0.47), (0.085, 0.085, 0.075), m_white, furn_bucket, subdiv=2)
    add_rcyl("TeaCup1", (ox + 1.94, oy - 0.56, zf + 0.43), 0.038, 0.05, m_blush, furn_bucket, verts=14)
    add_rcyl("TeaCup2", (ox + 1.92, oy - 0.72, zf + 0.43), 0.038, 0.05, m_lav, furn_bucket, verts=14)
    add_rcyl("TableVase", (ox + 2.06, oy - 0.62, zf + 0.46), 0.048, 0.14, m_sage, furn_bucket, verts=16)
    add_clay_ball("VaseRose1", (ox + 2.05, oy - 0.60, zf + 0.56), (0.05, 0.05, 0.045), clay_mat("VRose", PALETTE["rose_crimson"], 0.80), furn_bucket, subdiv=2)
    add_clay_ball("VaseRose2", (ox + 2.09, oy - 0.65, zf + 0.55), (0.045, 0.045, 0.042), m_blush, furn_bucket, subdiv=2)

    # Carved limestone fireplace on East wall (`dx = +3.24, dy = -0.45`)
    add_rbox("FireplaceHearth", (ox + 3.16, oy - 0.45, zf + 0.06), (0.58, 1.18, 0.12), m_stone, furn_bucket, bevel=0.025)
    add_rbox("FireplacePillarL", (ox + 3.22, oy - 0.86, zf + 0.52), (0.36, 0.24, 0.84), m_stone, furn_bucket, bevel=0.03)
    add_rbox("FireplacePillarR", (ox + 3.22, oy - 0.04, zf + 0.52), (0.36, 0.24, 0.84), m_stone, furn_bucket, bevel=0.03)
    add_rbox("FireplaceLintel", (ox + 3.22, oy - 0.45, zf + 0.86), (0.38, 1.08, 0.20), m_stone, furn_bucket, bevel=0.03)
    add_rbox("FireplaceMantel", (ox + 3.18, oy - 0.45, zf + 0.99), (0.46, 1.24, 0.07), m_oak_trim, furn_bucket, bevel=0.02)
    add_rbox("FireboxBack", (ox + 3.34, oy - 0.45, zf + 0.44), (0.10, 0.62, 0.64), m_iron, furn_bucket, bevel=0.01)
    # Glowing fireplace embers (dynamic node!)
    m_ember = clay_mat("EmberGlow", "#FF9442", 0.60, emission_hex="#FF7B29", emission_strength=4.5)
    ember_objs: list[bpy.types.Object] = []
    add_clay_ball("FireplaceEmbers", (ox + 3.22, oy - 0.45, zf + 0.18), (0.12, 0.22, 0.09), m_ember, ember_objs, subdiv=2, wobble=0.18, seed=9)
    dynamic_nodes["FireplaceEmberNode"] = ember_objs

    # Vintage Gramophone on corner stand (`dx = +3.06, dy = -1.52`)
    add_rbox("GramoCabinet", (ox + 3.06, oy - 1.52, zf + 0.28), (0.48, 0.48, 0.56), m_oak_dark, furn_bucket, bevel=0.03)
    add_rbox("GramoPlinth", (ox + 3.06, oy - 1.52, zf + 0.60), (0.38, 0.38, 0.08), m_oak_trim, furn_bucket, bevel=0.02)
    add_rcyl("GramoHorn", (ox + 2.98, oy - 1.46, zf + 0.86), 0.19, 0.32, m_brass, furn_bucket, verts=22, bevel=0.02, rot=(0.55, -0.45, 0.0))
    disc_objs: list[bpy.types.Object] = []
    add_rcyl("VinylDisc", (ox + 3.06, oy - 1.52, zf + 0.655), 0.15, 0.012, m_iron, disc_objs, verts=28)
    add_rcyl("VinylLabel", (ox + 3.06, oy - 1.52, zf + 0.663), 0.052, 0.012, m_coral, disc_objs, verts=20)
    dynamic_nodes["GramophoneDiscNode"] = disc_objs

    # Pleated Floor Lamp (`dx = +0.58, dy = +0.36`)
    add_rcyl("FloorLampBase", (ox + 0.58, oy + 0.36, zf + 0.03), 0.16, 0.05, m_brass, furn_bucket, verts=20)
    add_rcyl("FloorLampPole", (ox + 0.58, oy + 0.36, zf + 0.68), 0.022, 1.26, m_brass, furn_bucket, verts=12)
    add_rcyl("FloorLampShade", (ox + 0.58, oy + 0.36, zf + 1.34), 0.23, 0.32, m_lamp_glow, furn_bucket, verts=24, bevel=0.02)

    # Open Kitchen & Bistro Strawberry-Cake Dining (`dy: +0.55 .. +2.10`)
    add_rbox("RetroFridge", (ox + 0.72, oy + 1.80, zf + 0.72), (0.66, 0.62, 1.44), m_sage, furn_bucket, bevel=0.08)
    add_rbox("FridgeHandle1", (ox + 0.98, oy + 1.48, zf + 1.05), (0.04, 0.05, 0.28), m_brass, furn_bucket, bevel=0.01)
    add_rbox("FridgeHandle2", (ox + 0.98, oy + 1.48, zf + 0.55), (0.04, 0.05, 0.28), m_brass, furn_bucket, bevel=0.01)

    add_rbox("KitchenBase", (ox + 2.24, oy + 1.84, zf + 0.42), (2.06, 0.62, 0.84), m_cream, furn_bucket, bevel=0.03)
    add_rbox("KitchenCounter", (ox + 2.24, oy + 1.84, zf + 0.86), (2.12, 0.66, 0.06), m_oak_trim, furn_bucket, bevel=0.02)
    add_rbox("FarmSink", (ox + 1.86, oy + 1.80, zf + 0.875), (0.52, 0.40, 0.05), m_white, furn_bucket, bevel=0.015)
    add_rcyl("SinkTap", (ox + 1.86, oy + 2.02, zf + 1.02), 0.018, 0.26, m_brass, furn_bucket, verts=12)
    add_rbox("HobPlate", (ox + 2.68, oy + 1.82, zf + 0.895), (0.52, 0.38, 0.02), m_iron, furn_bucket, bevel=0.008)
    add_rcyl("CopperKettle", (ox + 2.72, oy + 1.82, zf + 0.99), 0.10, 0.16, m_copper, furn_bucket, verts=20, bevel=0.03)

    # Floating spice shelves
    for sx in (1.38, 3.02):
        for sz in (1.36, 1.68):
            add_rbox(f"Shelf_{sx}_{sz}", (ox + sx, oy + 2.04, zf + sz), (0.48, 0.18, 0.035), m_oak_trim, furn_bucket, bevel=0.008)
            add_rcyl(f"JarA_{sx}_{sz}", (ox + sx - 0.10, oy + 2.02, zf + sz + 0.07), 0.04, 0.10, m_white, furn_bucket, verts=14)
            add_rcyl(f"JarB_{sx}_{sz}", (ox + sx + 0.10, oy + 2.02, zf + sz + 0.06), 0.04, 0.08, m_coral, furn_bucket, verts=14)

    # Round Bistro Table + Two-Tier Strawberry Cake + Brass Pendant
    bx, by = ox + 2.05, oy + 0.78
    add_rcyl("BistroTop", (bx, by, zf + 0.68), 0.52, 0.05, m_oak_trim, furn_bucket, verts=28, bevel=0.02)
    add_rcyl("BistroPedestal", (bx, by, zf + 0.34), 0.06, 0.66, m_oak_dark, furn_bucket, verts=16)
    add_rcyl("BistroFoot", (bx, by, zf + 0.025), 0.26, 0.045, m_oak_dark, furn_bucket, verts=22, bevel=0.015)
    # Cake stand + 2-tier berry cake
    add_rcyl("CakePlate", (bx, by, zf + 0.72), 0.16, 0.025, m_white, furn_bucket, verts=22)
    add_rcyl("CakeTier1", (bx, by, zf + 0.775), 0.125, 0.09, m_blush, furn_bucket, verts=22, bevel=0.02)
    add_rcyl("CakeTier2", (bx, by, zf + 0.845), 0.085, 0.07, m_white, furn_bucket, verts=20, bevel=0.018)
    add_clay_ball("CakeBerry", (bx, by, zf + 0.895), (0.032, 0.032, 0.032), clay_mat("Berry", PALETTE["wax_red"], 0.70), furn_bucket, subdiv=1)
    for sign in (-1, 1):
        cx_c = bx + sign * 0.62
        add_rbox(f"ChairSeat_{sign}", (cx_c, by, zf + 0.42), (0.40, 0.40, 0.06), m_white, furn_bucket, bevel=0.02)
        add_rbox(f"ChairBack_{sign}", (cx_c + sign * 0.17, by, zf + 0.68), (0.06, 0.38, 0.48), m_oak_trim, furn_bucket, bevel=0.02)
        for lx, ly in [(-0.15, -0.15), (0.15, -0.15), (-0.15, 0.15), (0.15, 0.15)]:
            add_rcyl(f"ChairLeg_{sign}_{lx}_{ly}", (cx_c + lx, by + ly, zf + 0.21), 0.022, 0.41, m_oak_dark, furn_bucket, verts=10)
    # Brass pendant lamp above dining table
    add_rcyl("DiningCord", (bx, by, zf + 1.88), 0.012, 0.68, m_brass, furn_bucket, verts=10)
    add_rcyl("DiningPendant", (bx, by, zf + 1.50), 0.25, 0.18, m_brass, furn_bucket, verts=24, bevel=0.03)
    add_clay_ball("DiningBulb", (bx, by, zf + 1.43), (0.07, 0.07, 0.06), m_lamp_glow, furn_bucket, subdiv=2)

    # =========================================================================
    # ROOM 2 (`主卧` — Northwest Rear Wing): Romantic Master Suite
    # =========================================================================
    mbx, mby = ox - 1.58, oy + 1.32
    add_rbox("MasterRug", (mbx, mby - 0.15, zf + 0.012), (2.25, 1.65, 0.02), m_rug, furn_bucket, bevel=0.01)
    add_rbox("BedFrame", (mbx, mby + 0.12, zf + 0.18), (1.66, 1.78, 0.28), m_oak_trim, furn_bucket, bevel=0.04)
    add_rbox("BedMattress", (mbx, mby + 0.10, zf + 0.36), (1.54, 1.68, 0.24), m_white, furn_bucket, bevel=0.07)
    add_rbox("BedDuvet", (mbx, mby - 0.16, zf + 0.40), (1.58, 1.12, 0.22), m_blush, furn_bucket, bevel=0.07)
    add_rbox("BedThrow", (mbx, mby - 0.46, zf + 0.42), (1.60, 0.44, 0.23), m_lav, furn_bucket, bevel=0.05)
    add_rbox("BedHeadboard", (mbx, mby + 0.94, zf + 0.68), (1.72, 0.16, 1.08), m_cream, furn_bucket, bevel=0.06)
    for sx, m_pil in [(-0.38, m_white), (0.38, m_white), (-0.36, m_blush), (0.36, m_butter)]:
        off_y = 0.68 if m_pil == m_white else 0.48
        add_clay_ball(f"MasterPil_{sx}_{off_y}", (mbx + sx, mby + off_y, zf + 0.54), (0.28, 0.18, 0.12), m_pil, furn_bucket, subdiv=2)

    # Twin nightstands + warm pleated bedside lamps
    for side in (-1, 1):
        nx = mbx + side * 1.08
        ny = mby + 0.72
        add_rbox(f"Nightstand_{side}", (nx, ny, zf + 0.24), (0.42, 0.38, 0.46), m_oak_trim, furn_bucket, bevel=0.03)
        add_rcyl(f"BedLampBase_{side}", (nx, ny, zf + 0.52), 0.07, 0.10, m_brass, furn_bucket, verts=16)
        add_rcyl(f"BedLampShade_{side}", (nx, ny, zf + 0.66), 0.13, 0.18, m_lamp_glow, furn_bucket, verts=20, bevel=0.02)

    # Framed botanical art above master bed
    add_rbox("MasterFrame", (mbx, oy + 2.24, zf + 1.56), (1.16, 0.05, 0.58), m_brass, furn_bucket, bevel=0.015)
    add_rbox("MasterArt", (mbx, oy + 2.21, zf + 1.56), (1.04, 0.03, 0.46), m_white, furn_bucket, bevel=0.008)
    add_clay_ball("ArtBlossom1", (mbx - 0.18, oy + 2.19, zf + 1.58), (0.14, 0.02, 0.12), m_blush, furn_bucket, subdiv=1)
    add_clay_ball("ArtBlossom2", (mbx + 0.16, oy + 2.19, zf + 1.54), (0.13, 0.02, 0.11), m_lav, furn_bucket, subdiv=1)

    # French Armoire Wardrobe + Bay-Window Reading Bench & Halo Vanity
    add_rbox("MasterWardrobe", (ox - 0.18, oy + 1.56, zf + 0.86), (0.56, 1.12, 1.72), m_cream, furn_bucket, bevel=0.04)
    add_rbox("WardrobeCrown", (ox - 0.18, oy + 1.56, zf + 1.74), (0.60, 1.18, 0.07), m_oak_trim, furn_bucket, bevel=0.02)
    add_rbox("BayBench", (ox - 3.12, oy + 1.16, zf + 0.22), (0.48, 1.24, 0.40), m_oak_trim, furn_bucket, bevel=0.03)
    add_rbox("BayCushion", (ox - 3.10, oy + 1.16, zf + 0.44), (0.44, 1.18, 0.08), m_cream, furn_bucket, bevel=0.03)
    # Halo Vanity (`dx = -2.92, dy = +0.34`)
    add_rbox("VanityDesk", (ox - 2.95, oy + 0.36, zf + 0.62), (0.44, 0.68, 0.10), m_oak_trim, furn_bucket, bevel=0.02)
    add_rcyl("VanityMirror", (ox - 3.16, oy + 0.36, zf + 0.96), 0.22, 0.03, m_lamp_glow, furn_bucket, verts=24, rot=(0.0, math.pi * 0.5, 0.0))

    # =========================================================================
    # ROOM 3 (`次卧` — Southwest Front Wing): Floral Art & Music Studio
    # =========================================================================
    # Cozy Daybed on left (`dx = -2.86, dy = -1.16`)
    add_rbox("StudioDaybedFrame", (ox - 2.84, oy - 1.14, zf + 0.18), (0.96, 1.68, 0.30), m_oak_trim, furn_bucket, bevel=0.04)
    add_rbox("StudioBackrest", (ox - 3.26, oy - 1.14, zf + 0.44), (0.14, 1.68, 0.52), m_oak_trim, furn_bucket, bevel=0.03)
    add_rbox("StudioMattress", (ox - 2.80, oy - 1.14, zf + 0.35), (0.86, 1.58, 0.18), m_blue, furn_bucket, bevel=0.06)
    add_rbox("StudioBlanket", (ox - 2.80, oy - 1.56, zf + 0.38), (0.88, 0.68, 0.19), m_white, furn_bucket, bevel=0.05)
    add_clay_ball("StudioPil1", (ox - 3.02, oy - 0.58, zf + 0.49), (0.18, 0.24, 0.14), m_coral, furn_bucket, subdiv=2)
    add_clay_ball("StudioPil2", (ox - 2.74, oy - 0.52, zf + 0.48), (0.20, 0.18, 0.13), m_butter, furn_bucket, subdiv=2)

    # Full-width 36-book Honey-Oak Bookcase against partition (`dy = -0.14`)
    bcx, bcy = ox - 1.46, oy - 0.14
    add_rbox("BookcaseBack", (bcx, bcy + 0.10, zf + 0.72), (1.36, 0.04, 1.42), m_oak_dark, furn_bucket, bevel=0.01)
    add_rbox("BookcaseSideL", (bcx - 0.66, bcy, zf + 0.72), (0.06, 0.28, 1.42), m_oak_trim, furn_bucket, bevel=0.015)
    add_rbox("BookcaseSideR", (bcx + 0.66, bcy, zf + 0.72), (0.06, 0.28, 1.42), m_oak_trim, furn_bucket, bevel=0.015)
    book_cols = [PALETTE["rose_crimson"], PALETTE["linen_blush"], PALETTE["linen_butter"], PALETTE["turf_sage"], PALETTE["hydrangea_blue"], PALETTE["awning_lav"], PALETTE["linen_white"]]
    rng = random.Random(42)
    for sh_i, sh_z in enumerate([0.08, 0.44, 0.80, 1.16, 1.42]):
        add_rbox(f"BookShelf_{sh_i}", (bcx, bcy, zf + sh_z), (1.36, 0.28, 0.04), m_oak_trim, furn_bucket, bevel=0.01)
        if sh_i < 3:
            bx_cur = bcx - 0.58
            b_idx = 0
            while bx_cur < bcx + 0.56:
                bw = rng.uniform(0.065, 0.095)
                bh = rng.uniform(0.24, 0.30)
                mc = clay_mat(f"Book_{b_idx%7}", book_cols[(sh_i * 5 + b_idx) % len(book_cols)], 0.84)
                add_rbox(f"Book_{sh_i}_{b_idx}", (bx_cur + bw * 0.5, bcy - 0.01, zf + sh_z + 0.02 + bh * 0.5), (bw * 0.92, 0.20, bh), mc, furn_bucket, bevel=0.008)
                bx_cur += bw + 0.006
                b_idx += 1
    add_clay_ball("BookcaseGlobe", (bcx + 0.44, bcy, zf + 1.56), (0.11, 0.11, 0.11), m_blue, furn_bucket, subdiv=2)

    # Wooden Easel with Floral Villa Canvas (`dx = -1.78, dy = -1.06`)
    ex, ey = ox - 1.78, oy - 1.06
    add_rbox("EaselLegL", (ex - 0.18, ey - 0.04, zf + 0.58), (0.04, 0.04, 1.18), m_oak_trim, furn_bucket, bevel=0.008, rot=(0.14, 0.08, 0.0))
    add_rbox("EaselLegR", (ex + 0.18, ey - 0.04, zf + 0.58), (0.04, 0.04, 1.18), m_oak_trim, furn_bucket, bevel=0.008, rot=(0.14, -0.08, 0.0))
    add_rbox("EaselLegBack", (ex, ey + 0.22, zf + 0.56), (0.04, 0.04, 1.14), m_oak_trim, furn_bucket, bevel=0.008, rot=(-0.22, 0.0, 0.0))
    add_rbox("EaselCanvas", (ex, ey - 0.08, zf + 0.76), (0.58, 0.04, 0.44), m_white, furn_bucket, bevel=0.01, rot=(0.14, 0.0, 0.0))
    add_clay_ball("CanvasHill", (ex, ey - 0.10, zf + 0.66), (0.24, 0.02, 0.09), m_sage, furn_bucket, subdiv=1)
    add_clay_ball("CanvasBloom", (ex - 0.10, ey - 0.10, zf + 0.80), (0.11, 0.02, 0.09), m_blush, furn_bucket, subdiv=1)
    add_clay_ball("CanvasSun", (ex + 0.14, ey - 0.10, zf + 0.84), (0.07, 0.02, 0.07), m_butter, furn_bucket, subdiv=1)

    # Oak Writing Desk + Love Letter + Brass Lamp + Acoustic Guitar
    dx_d, dy_d = ox - 1.08, oy - 1.62
    add_rbox("StudioDeskTop", (dx_d, dy_d, zf + 0.62), (0.86, 0.48, 0.05), m_oak_trim, furn_bucket, bevel=0.018)
    for lx, ly in [(-0.36, -0.18), (0.36, -0.18), (-0.36, 0.18), (0.36, 0.18)]:
        add_rcyl(f"DeskLeg_{lx}_{ly}", (dx_d + lx, dy_d + ly, zf + 0.31), 0.026, 0.60, m_oak_dark, furn_bucket, verts=10)
    add_rbox("DeskLetter", (dx_d - 0.08, dy_d + 0.02, zf + 0.655), (0.28, 0.20, 0.015), m_white, furn_bucket, bevel=0.004, rot=(0.0, 0.0, 0.16))
    add_rcyl("DeskSeal", (dx_d - 0.04, dy_d + 0.02, zf + 0.665), 0.028, 0.012, clay_mat("WaxSeal", PALETTE["wax_red"], 0.70), furn_bucket, verts=14)
    add_rcyl("DeskLampShade", (dx_d + 0.24, dy_d - 0.06, zf + 0.82), 0.10, 0.12, m_lamp_glow, furn_bucket, verts=18, bevel=0.015)
    add_rcyl("DeskLampStem", (dx_d + 0.24, dy_d - 0.06, zf + 0.72), 0.016, 0.16, m_brass, furn_bucket, verts=10)

    # Acoustic Guitar beside bookcase (`dx = -0.58, dy = -0.36`)
    add_clay_ball("GuitarBodyLow", (ox - 0.58, oy - 0.38, zf + 0.26), (0.17, 0.07, 0.20), m_copper, furn_bucket, subdiv=2, rot=(-0.18, 0.0, 0.25))
    add_clay_ball("GuitarBodyUp", (ox - 0.58, oy - 0.35, zf + 0.44), (0.13, 0.06, 0.15), m_copper, furn_bucket, subdiv=2, rot=(-0.18, 0.0, 0.25))
    add_rbox("GuitarNeck", (ox - 0.58, oy - 0.30, zf + 0.68), (0.045, 0.03, 0.38), m_oak_dark, furn_bucket, bevel=0.006, rot=(-0.18, 0.0, 0.25))

    # =========================================================================
    # Warm Interior Cycles Baking Lights (for cozy GI & soft furniture shadows)
    # =========================================================================
    room_lights = [
        ("Light_Living", (ox + 1.85, oy - 0.65, zf + 2.05), 145.0, 1.35, "#FFE5BE"),
        ("Light_Hearth", (ox + 3.05, oy - 0.45, zf + 0.45), 55.0, 0.45, "#FFAD66"),
        ("Light_Kitchen", (ox + 2.05, oy + 1.15, zf + 1.95), 135.0, 1.25, "#FFE8C6"),
        ("Light_Master", (ox - 1.58, oy + 1.20, zf + 2.05), 135.0, 1.35, "#FFE4C2"),
        ("Light_Studio", (ox - 1.85, oy - 1.05, zf + 2.00), 125.0, 1.25, "#FFE8CA"),
    ]
    for lname, lpos, energy, lsize, lhex in room_lights:
        ldata = bpy.data.lights.new(name=lname, type="AREA")
        ldata.energy = energy
        ldata.size = lsize
        ldata.color = (1.0, 0.89, 0.74) if lhex != "#FFAD66" else (1.0, 0.66, 0.36)
        lobj = bpy.data.objects.new(lname, ldata)
        lobj.location = lpos
        bpy.context.collection.objects.link(lobj)
        interior_lights.append(lobj)


def build_hero_bouquet(
    center: tuple[float, float, float],
    bouquet_bucket: list[bpy.types.Object],
    orbit_bucket: list[bpy.types.Object],
) -> None:
    """Builds a luxury French-florist conical hand-tied bouquet & wax-sealed letter (`06 / 06`)."""
    cx, cy, cz = center
    m_wrap_cream = clay_mat("WrapCream", "#F9F0E2", 0.86)
    m_wrap_ivory = clay_mat("WrapIvory", "#FFF9F0", 0.84)
    m_wrap_blush = clay_mat("WrapBlush", "#F2C6CE", 0.85)
    m_ribbon = clay_mat("RibbonRose", "#D16E7E", 0.72)
    m_ribbon_lav = clay_mat("RibbonLav", PALETTE["awning_lav"], 0.74)
    m_stem = clay_mat("StemGreen", PALETTE["foliage_deep"], 0.86)
    m_moss = clay_mat("BouquetFoliage", PALETTE["turf_moss"], 0.86)
    m_leaf = clay_mat("EucaLeaf", PALETTE["turf_sage"], 0.84)
    m_wax = clay_mat("EnvWax", PALETTE["wax_red"], 0.68)
    m_gold = clay_mat("OrbGold", PALETTE["brass"], 0.40, metallic=0.65)
    m_pearl = clay_mat("BabyBreath", "#FFFBF5", 0.78)

    # Graceful tilt toward the viewer (`-Y` in Blender = `+Z` in Three.js) so the full floral crown faces camera!
    tilt = (-0.42, 0.10, 0.0)

    # 1. True Conical Florist Wrapping: narrow pinched waist (`r=0.20`) flaring up to ruffled collar (`r=1.06`)!
    add_tapered_cone("WrapOuterCone", (cx, cy + 0.04, cz - 0.30), 0.21, 1.04, 1.48, m_wrap_cream, bouquet_bucket, verts=40, rot=tilt, scale_xy=(1.08, 0.86))
    add_tapered_cone("WrapInnerBlush", (cx, cy + 0.01, cz - 0.16), 0.19, 0.96, 1.28, m_wrap_blush, bouquet_bucket, verts=36, rot=tilt, scale_xy=(1.04, 0.84))
    # Lower flared skirt below ribbon waist (classic hand-tied paper cuff!)
    add_tapered_cone("WrapLowerSkirt", (cx - 0.08, cy + 0.36, cz - 1.06), 0.36, 0.19, 0.50, m_wrap_cream, bouquet_bucket, verts=32, rot=tilt, scale_xy=(1.04, 0.88))

    # Pleated back & side paper fan flaps rising behind the floral crown
    fan_flaps = [
        ((-0.56, 0.24, 0.48), (0.68, 0.04, 0.76), m_wrap_cream, (-0.34, -0.32, 0.28)),
        ((0.02, 0.36, 0.62), (0.82, 0.04, 0.82), m_wrap_blush, (-0.28, 0.05, -0.04)),
        ((0.58, 0.20, 0.44), (0.68, 0.04, 0.74), m_wrap_cream, (-0.34, 0.34, -0.28)),
        ((-0.78, -0.08, 0.22), (0.52, 0.035, 0.58), m_wrap_ivory, (-0.48, -0.46, 0.42)),
        ((0.76, -0.10, 0.20), (0.52, 0.035, 0.58), m_wrap_ivory, (-0.48, 0.46, -0.42)),
    ]
    for fi, (fpos, fsz, fmat, frot) in enumerate(fan_flaps):
        add_rbox(f"PaperFanFlap_{fi}", (cx + fpos[0], cy + fpos[1], cz + fpos[2]), fsz, fmat, bouquet_bucket, bevel=0.016, rot=frot)

    # Green rose stems peeking neatly out the bottom of the paper skirt
    for si in range(7):
        ang = (si / 7.0) * math.tau
        sx = -0.11 + math.cos(ang) * 0.09
        sy = 0.48 + math.sin(ang) * 0.08
        add_rcyl(f"RoseStemEnd_{si}", (cx + sx, cy + sy, cz - 1.30), 0.034, 0.44, m_stem, bouquet_bucket, verts=12, bevel=0.01, rot=tilt)

    # 2. Pinched Satin Ribbon Collar + Plump Double-Loop Bow & Flowing Tails at Waist
    wx, wy, wz = cx - 0.05, cy + 0.22, cz - 0.84
    add_rcyl("RibbonWaistBand", (wx, wy, wz), 0.24, 0.14, m_ribbon, bouquet_bucket, verts=28, bevel=0.025, rot=tilt)
    add_clay_ball("BowLoopL", (wx - 0.26, wy - 0.22, wz + 0.05), (0.23, 0.10, 0.14), m_ribbon, bouquet_bucket, subdiv=3, rot=(0.15, -0.24, 0.32))
    add_clay_ball("BowLoopR", (wx + 0.24, wy - 0.23, wz + 0.02), (0.23, 0.10, 0.14), m_ribbon, bouquet_bucket, subdiv=3, rot=(0.15, 0.24, -0.32))
    add_clay_ball("BowLoopSubL", (wx - 0.18, wy - 0.25, wz + 0.03), (0.15, 0.08, 0.10), m_ribbon_lav, bouquet_bucket, subdiv=3, rot=(0.18, -0.2, 0.28))
    add_clay_ball("BowLoopSubR", (wx + 0.16, wy - 0.26, wz + 0.01), (0.15, 0.08, 0.10), m_ribbon_lav, bouquet_bucket, subdiv=3, rot=(0.18, 0.2, -0.28))
    add_clay_ball("BowCenterKnot", (wx - 0.01, wy - 0.26, wz + 0.03), (0.09, 0.08, 0.09), m_ribbon, bouquet_bucket, subdiv=3)
    add_rbox("RibbonTailL", (wx - 0.18, wy - 0.28, wz - 0.30), (0.09, 0.024, 0.54), m_ribbon, bouquet_bucket, bevel=0.01, rot=(0.18, -0.26, 0.14))
    add_rbox("RibbonTailR", (wx + 0.14, wy - 0.30, wz - 0.32), (0.09, 0.024, 0.56), m_ribbon, bouquet_bucket, bevel=0.01, rot=(0.20, 0.26, -0.14))

    # 3. Lush High-Dome Botanical Mound Rising Proudly ABOVE the Paper Collar!
    add_clay_ball("FoliageDomeCore", (cx, cy - 0.12, cz + 0.36), (0.76, 0.64, 0.42), m_moss, bouquet_bucket, subdiv=3, rot=tilt)

    # 13 Multi-Petal Cupped Garden Roses arranged in an overflowing dome facing camera!
    rose_specs = [
        # Center Hero Rose
        ((0.00, -0.34, 0.56), 0.64, PALETTE["rose_crimson"], (-0.62, 0.00, 0.00)),
        # Inner Ring around Hero Rose
        ((-0.44, -0.28, 0.52), 0.56, PALETTE["rose_blush"], (-0.54, -0.34, 0.20)),
        ((0.46, -0.30, 0.50), 0.56, PALETTE["rose_coral"], (-0.54, 0.34, -0.20)),
        ((-0.22, -0.02, 0.78), 0.58, PALETTE["awning_cream"], (-0.36, -0.16, 0.12)),
        ((0.26, -0.04, 0.76), 0.56, PALETTE["rose_blush"], (-0.36, 0.18, -0.12)),
        ((-0.24, -0.58, 0.28), 0.52, PALETTE["awning_cream"], (-0.84, -0.18, 0.10)),
        ((0.24, -0.60, 0.26), 0.52, PALETTE["rose_crimson"], (-0.84, 0.18, -0.10)),
        # Outer Rim Crown Roses
        ((-0.72, -0.12, 0.38), 0.48, PALETTE["rose_crimson"], (-0.46, -0.56, 0.35)),
        ((0.72, -0.14, 0.36), 0.48, PALETTE["awning_cream"], (-0.46, 0.56, -0.35)),
        ((0.02, 0.22, 0.90), 0.54, PALETTE["rose_coral"], (-0.20, 0.04, 0.25)),
        ((-0.56, 0.16, 0.72), 0.46, PALETTE["rose_blush"], (-0.26, -0.42, 0.30)),
        ((0.56, 0.14, 0.70), 0.46, PALETTE["rose_crimson"], (-0.26, 0.42, -0.30)),
        ((0.00, -0.70, 0.12), 0.46, PALETTE["rose_blush"], (-0.98, 0.00, 0.00)),
    ]
    for idx, (roff, rsc, rcol, rrot) in enumerate(rose_specs):
        add_sculpted_rose_head(f"HeroRose_{idx}", (cx + roff[0], cy + roff[1], cz + roff[2]), rsc, rcol, bouquet_bucket, rot=rrot)

    # 6 Pastel Hydrangea Cloud Pom-Poms
    hyd_specs = [
        (-0.62, -0.44, 0.24, PALETTE["hydrangea_lav"]),
        (0.62, -0.46, 0.22, PALETTE["hydrangea_blue"]),
        (-0.42, 0.18, 0.82, PALETTE["hydrangea_blue"]),
        (0.44, 0.16, 0.80, PALETTE["hydrangea_lav"]),
        (-0.84, -0.22, 0.26, PALETTE["hydrangea_blue"]),
        (0.84, -0.24, 0.24, PALETTE["hydrangea_lav"]),
    ]
    for hi, (hx, hy, hz, hcol) in enumerate(hyd_specs):
        mh = clay_mat(f"HeroHyd_{hi}", hcol, 0.82)
        for sub_i in range(8):
            ang = sub_i * math.tau / 8.0
            rr = 0.09 if sub_i < 6 else 0.03
            zz = 0.05 if sub_i >= 6 else (sub_i % 2) * 0.03
            add_clay_ball(f"HydFloret_{hi}_{sub_i}", (cx + hx + math.cos(ang) * rr, cy + hy + math.sin(ang) * rr, cz + hz + zz), (0.085, 0.085, 0.075), mh, bouquet_bucket, subdiv=2)

    # 7 Airy Spring Tulips rising playfully from the dome
    tulip_specs = [
        (-0.46, -0.62, 0.22, PALETTE["tulip_gold"]),
        (0.48, -0.60, 0.20, PALETTE["tulip_peach"]),
        (-0.18, 0.30, 1.04, PALETTE["tulip_peach"]),
        (0.22, 0.28, 1.02, PALETTE["tulip_gold"]),
        (-0.82, 0.06, 0.56, PALETTE["tulip_gold"]),
        (0.82, 0.04, 0.54, PALETTE["tulip_peach"]),
        (0.02, -0.18, 0.92, PALETTE["tulip_gold"]),
    ]
    for ti, (tx, ty, tz, tcol) in enumerate(tulip_specs):
        mt = clay_mat(f"HeroTulip_{ti}", tcol, 0.80)
        add_clay_ball(f"HeroTulipCup_{ti}", (cx + tx, cy + ty, cz + tz), (0.11, 0.11, 0.17), mt, bouquet_bucket, subdiv=3, rot=(-0.42, tx * 0.45, 0.0))

    # 14 Eucalyptus Leaves & 12 Baby's-Breath Pearl Buds framing the collar
    for li in range(14):
        ang = (li / 14.0) * math.tau
        lx = math.cos(ang) * 0.90
        ly = math.sin(ang) * 0.68 - 0.14
        lz = 0.34 + math.sin(ang * 3) * 0.14
        add_clay_ball(f"BouquetLeaf_{li}", (cx + lx, cy + ly, cz + lz), (0.19, 0.095, 0.032), m_leaf, bouquet_bucket, subdiv=2, rot=(-0.25 + math.sin(ang) * 0.3, lx * 0.38, ang))
    for bi in range(12):
        ang = (bi / 12.0) * math.tau + 0.2
        bx_p = math.cos(ang) * 0.66
        by_p = math.sin(ang) * 0.50 - 0.20
        bz_p = 0.58 + (bi % 3) * 0.12
        add_clay_ball(f"BabyBreath_{bi}", (cx + bx_p, cy + by_p, cz + bz_p), (0.045, 0.045, 0.045), m_pearl, bouquet_bucket, subdiv=2)

    # 4. Tactile Keepsake Cotton-Paper Love Letter Envelope with Crimson Wax Seal nestled beside ribbon!
    ex, ey, ez = cx + 0.72, cy - 0.46, cz - 0.42
    env_rot = (-0.28, -0.22, -0.20)
    add_rbox("KeepsakeEnvelope", (ex, ey, ez), (0.64, 0.042, 0.42), m_wrap_ivory, bouquet_bucket, bevel=0.015, rot=env_rot)
    add_rbox("KeepsakeEnvFlap", (ex, ey - 0.012, ez + 0.09), (0.58, 0.02, 0.20), m_wrap_blush, bouquet_bucket, bevel=0.008, rot=env_rot)
    add_rcyl("KeepsakeWaxSeal", (ex - 0.01, ey - 0.030, ez + 0.01), 0.072, 0.022, m_wax, bouquet_bucket, verts=24, bevel=0.008, rot=(math.pi * 0.5 - 0.28, -0.22, -0.20))

    # 5. 16 Floating Orbiting Petals, Leaves & Golden Dew Pearls (`Pearl & Co. 06/06` signature look!)
    rng = random.Random(108)
    orb_mats = [
        clay_mat("OrbPetal1", PALETTE["rose_blush"], 0.80),
        clay_mat("OrbPetal2", PALETTE["rose_crimson"], 0.80),
        clay_mat("OrbPetal3", PALETTE["awning_lav"], 0.82),
        m_leaf,
        m_gold,
    ]
    for oi in range(16):
        ang = (oi / 16.0) * math.tau + rng.uniform(-0.15, 0.15)
        rad = rng.uniform(1.48, 2.35)
        ox_p = cx + math.cos(ang) * rad
        oy_p = cy + math.sin(ang) * rad * 0.68
        oz_p = cz + rng.uniform(-1.05, 1.25)
        if oi % 4 == 3:
            r_orb = rng.uniform(0.065, 0.115)
            add_clay_ball(f"OrbitPearl_{oi}", (ox_p, oy_p, oz_p), (r_orb, r_orb, r_orb), orb_mats[4 if oi % 8 == 3 else 2], orbit_bucket, subdiv=3)
        else:
            pm = orb_mats[oi % 4]
            add_clay_ball(
                f"OrbitPetal_{oi}",
                (ox_p, oy_p, oz_p),
                (rng.uniform(0.14, 0.22), rng.uniform(0.09, 0.14), 0.028),
                pm,
                orbit_bucket,
                subdiv=3,
                rot=(rng.uniform(-0.8, 0.8), rng.uniform(-0.8, 0.8), ang),
            )
