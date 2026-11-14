"""Build compact rigged anime NPC GLBs (`npc_vita.glb`, `npc_shino.glb`, `npc_vivi.glb`)
from unused cached CC0 VRoid VRM files for Iris Bay's lively townsfolk.

Design priorities:
- Reuses clean orientation (-Y front -> +Z in Babylon, feet on Z=0), split Face_Skin / Face_Features,
  and MToon -> Principled BSDF baking from `build_couple_vrm_glb.py`.
- Aggressive size budget discipline (< 1.4 MB per GLB):
  * Exports ONLY 2 compact NLA clips (`Idle`, `Wave`) at step=2 keyframes.
  * Consolidates all VRM morphs down to ONLY `EyeBlink` and `Smile`.
  * Bakes opaque textures to compact <=320px JPEG (or 384px for face/hair) and alpha overlays
    to compact quantized PNG, exporting with `AUTO` so hair/lashes keep crisp cutout alpha.
- Strips unused hair spring-bones / secondary junk, keeps lightweight VRM humanoid + Skirt rig.

Run via Blender 4.0.2 with system Python:
  PYTHONPATH=/usr/lib/python3.12:/usr/lib/python3.12/lib-dynload \
    blender --python-use-system-env -b -P tools/blender/build_npcs_vrm_glb.py -- \
    --qa /tmp/npcs_qa.png
"""
from __future__ import annotations

import argparse
import json
import math
import struct
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Vector
from PIL import Image

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent.parent
VRM_CACHE = ROOT / "_vrm_cache"
TEX_BAKED = ROOT / "_tex_baked_npc"
OUT_DIR = REPO_ROOT / "site" / "assets" / "models"

NPC_SPECS = {
    "npc_vita": {
        "file": "Vita.vrm",
        "target_height": 1.58,
        "outfit_shift": "meadow_teal",
    },
    "npc_shino": {
        "file": "Sendagaya_Shino.vrm",
        "target_height": 1.63,
        "outfit_shift": "harbor_sailor",
    },
    "npc_vivi": {
        "file": "Vivi.vrm",
        "target_height": 1.65,
        "outfit_shift": "fontaine_azure",
    },
}

BONE_ALIAS = {
    "Hips": "J_Bip_C_Hips",
    "Spine": "J_Bip_C_Spine",
    "Chest": "J_Bip_C_Chest",
    "UpperChest": "J_Bip_C_UpperChest",
    "Neck": "J_Bip_C_Neck",
    "Head": "J_Bip_C_Head",
    "Shoulder.L": "J_Bip_L_Shoulder",
    "UpperArm.L": "J_Bip_L_UpperArm",
    "Forearm.L": "J_Bip_L_LowerArm",
    "Hand.L": "J_Bip_L_Hand",
    "Shoulder.R": "J_Bip_R_Shoulder",
    "UpperArm.R": "J_Bip_R_UpperArm",
    "Forearm.R": "J_Bip_R_LowerArm",
    "Hand.R": "J_Bip_R_Hand",
    "Thigh.L": "J_Bip_L_UpperLeg",
    "Shin.L": "J_Bip_L_LowerLeg",
    "Foot.L": "J_Bip_L_Foot",
    "Thigh.R": "J_Bip_R_UpperLeg",
    "Shin.R": "J_Bip_R_LowerLeg",
    "Foot.R": "J_Bip_R_Foot",
}


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0


def parse_vrm_json(vrm_path: Path) -> dict:
    with vrm_path.open("rb") as f:
        magic, _ver, _length = struct.unpack("<4sII", f.read(12))
        if magic != b"glTF":
            raise ValueError(f"Not a VRM/GLB file: {vrm_path}")
        chunk_len, chunk_type = struct.unpack("<II", f.read(8))
        if chunk_type != 0x4E4F534A:
            raise ValueError(f"Missing JSON chunk in {vrm_path}")
        return json.loads(f.read(chunk_len).decode("utf-8"))


def _restyle_npc_texture(npc_id: str, mat_name: str, rgba: np.ndarray) -> np.ndarray:
    rgb = rgba[:, :, :3].astype(np.float32) / 255.0
    alpha = rgba[:, :, 3:4].astype(np.float32) / 255.0

    # Mild blush warmth on cheeks for all anime town NPCs
    if "Face_00_SKIN" in mat_name:
        h, w = rgb.shape[:2]
        v = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
        u = np.linspace(0.0, 1.0, w, dtype=np.float32)[None, :]
        for cx in (0.31, 0.69):
            d = np.hypot((u - cx) / 0.085, (v - 0.62) / 0.042)
            mask = np.clip(1.0 - d, 0.0, 1.0)[:, :, None] ** 1.7
            blush = np.array([1.00, 0.60, 0.68], dtype=np.float32)
            rgb = rgb * (1.0 - mask * 0.24) + blush * (mask * 0.24)
    elif any(k in mat_name for k in ("Tops", "Bottoms", "Accessory")):
        if npc_id == "npc_shino":
            # Restyle dark school vest -> sunny coastal sky-navy & warm cream highlights
            lum = rgb.mean(axis=2, keepdims=True)
            is_dark = np.clip((0.36 - lum) / 0.22, 0.0, 1.0)
            navy_sky = np.array([0.24, 0.42, 0.68], dtype=np.float32)
            rgb = rgb * (1.0 - is_dark * 0.62) + navy_sky * (is_dark * 0.62)
        elif npc_id == "npc_vita":
            # Brighten pastoral apron tones slightly so runtime color cloning shifts cleanly
            mean_c = rgb.mean(axis=2, keepdims=True)
            rgb = np.clip(mean_c * 0.96 + (rgb - mean_c) * 1.15 + 0.04, 0.0, 1.0)
        elif npc_id == "npc_vivi":
            # Enrich teal-azure Fontaine vibrancy
            mean_c = rgb.mean(axis=2, keepdims=True)
            rgb = np.clip(mean_c + (rgb - mean_c) * 1.18, 0.0, 1.0)

    out = np.concatenate([rgb, alpha], axis=2)
    return np.clip(out * 255.0, 0, 255).astype(np.uint8)


def bake_and_rebuild_vrm_materials(npc_id: str, vrm_json: dict) -> None:
    TEX_BAKED.mkdir(parents=True, exist_ok=True)
    mtoon_colors = {}
    for mp in vrm_json.get("extensions", {}).get("VRM", {}).get("materialProperties", []):
        col = mp.get("vectorProperties", {}).get("_Color", [1.0, 1.0, 1.0, 1.0])
        mtoon_colors[mp["name"]] = tuple(float(c) for c in col[:4])

    overlay_keys = ("EyeHighlight", "FaceBrow", "FaceEyelash", "FaceEyeline")

    for mat in list(bpy.data.materials):
        mname = mat.name
        if "EyeExtra" in mname:
            continue

        tint = mtoon_colors.get(mname, (1.0, 1.0, 1.0, 1.0))
        src_img = None
        if mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image is not None:
                    src_img = n.image
                    break

        baked_img = None
        has_cutout = False
        if src_img is not None and src_img.size[0] > 0:
            w0, h0 = src_img.size[0], src_img.size[1]
            px = np.array(src_img.pixels[:], dtype=np.float32).reshape(h0, w0, 4)
            px = np.flipud(px)
            px[:, :, 0] *= tint[0]
            px[:, :, 1] *= tint[1]
            px[:, :, 2] *= tint[2]
            rgba_u8 = _restyle_npc_texture(npc_id, mname, np.clip(px * 255.0, 0, 255).astype(np.uint8))

            is_hi_detail = any(k in mname for k in ("Face", "EyeIris", "Hair", "HAIR"))
            max_side = 384 if is_hi_detail else 320
            if w0 > max_side or h0 > max_side:
                s = max_side / max(w0, h0)
                nw, nh = max(16, int(round(w0 * s))), max(16, int(round(h0 * s)))
                pil = Image.fromarray(rgba_u8, "RGBA").resize((nw, nh), Image.Resampling.LANCZOS)
                rgba_u8 = np.array(pil, dtype=np.uint8)
            else:
                pil = Image.fromarray(rgba_u8, "RGBA")

            a_chan = rgba_u8[:, :, 3]
            is_overlay = any(k in mname for k in overlay_keys)
            has_cutout = is_overlay or bool(np.any(a_chan < 40))

            safe_name = mname.replace("/", "_").replace(" ", "_")
            if has_cutout:
                out_file = TEX_BAKED / f"{npc_id}_{safe_name}.png"
                pil.quantize(colors=96, method=Image.Quantize.FASTOCTREE).save(out_file, optimize=True)
            else:
                out_file = TEX_BAKED / f"{npc_id}_{safe_name}.jpg"
                pil.convert("RGB").save(out_file, quality=84, optimize=True)

            baked_img = bpy.data.images.load(str(out_file), check_existing=False)
            try:
                baked_img.colorspace_settings.name = "sRGB"
            except Exception:
                pass
            baked_img.pack()

        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out_node = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(bsdf.outputs["BSDF"], out_node.inputs["Surface"])

        is_eye_iris = "EyeIris" in mname or "EyeHighlight" in mname
        is_skin_or_face = "SKIN" in mname or "Face_00" in mname
        bsdf.inputs["Roughness"].default_value = 0.16 if is_eye_iris else (0.78 if is_skin_or_face else 0.72)
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.24 if is_eye_iris else 0.12

        if baked_img is not None:
            tex_node = nt.nodes.new("ShaderNodeTexImage")
            tex_node.image = baked_img
            nt.links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
            if has_cutout:
                mat.blend_method = "CLIP"
                mat.alpha_threshold = 0.36
                nt.links.new(tex_node.outputs["Alpha"], bsdf.inputs["Alpha"])
            else:
                mat.blend_method = "OPAQUE"
        else:
            bsdf.inputs["Base Color"].default_value = tint
            mat.blend_method = "OPAQUE"

        if any(k in mname for k in ("Hair", "HAIR", "Tops", "Shoes", "Bottoms", "Accessory", "Lash", "Brow", "Eyeline", "Highlight")):
            mat.use_backface_culling = False
        else:
            mat.use_backface_culling = True


def normalize_vrm_scene(target_height: float):
    for o in list(bpy.data.objects):
        if "Icosphere" in o.name:
            bpy.data.objects.remove(o, do_unlink=True)

    arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    arm.name = "Armature"
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]

    zs = [v.co.z for m in meshes for v in m.data.vertices]
    min_z, max_z = min(zs), max(zs)
    cur_h = max(0.2, max_z - min_z)
    scale = target_height / cur_h

    def xform(vec: Vector) -> Vector:
        return Vector((-vec.x * scale, -vec.y * scale, (vec.z - min_z) * scale))

    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for b in arm.data.edit_bones:
        b.head = xform(b.head)
        b.tail = xform(b.tail)
        b.roll = 0.0
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.location = (0.0, 0.0, 0.0)
    arm.rotation_euler = (0.0, 0.0, 0.0)
    arm.scale = (1.0, 1.0, 1.0)

    for m in meshes:
        m.parent = arm
        m.matrix_parent_inverse.identity()
        m.location = (0.0, 0.0, 0.0)
        m.rotation_euler = (0.0, 0.0, 0.0)
        m.scale = (1.0, 1.0, 1.0)
        if m.data.shape_keys:
            for kb in m.data.shape_keys.key_blocks:
                for p in kb.data:
                    p.co = xform(p.co)
        for v in m.data.vertices:
            v.co = xform(v.co)
        m.data.update()

    bpy.context.view_layer.update()
    return arm


def consolidate_face_morphs_and_split(arm, char_id: str, vrm_json: dict) -> None:
    face_obj = next((o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("Face")), None)
    if not face_obj:
        return

    extra_idx = [i for i, m in enumerate(face_obj.data.materials) if m and "EyeExtra" in m.name]
    if extra_idx:
        bpy.context.view_layer.objects.active = face_obj
        bpy.ops.object.mode_set(mode="EDIT")
        bm = bmesh.from_edit_mesh(face_obj.data)
        to_del = [f for f in bm.faces if f.material_index in extra_idx]
        bmesh.ops.delete(bm, geom=to_del, context="FACES")
        bmesh.update_edit_mesh(face_obj.data)
        bpy.ops.object.mode_set(mode="OBJECT")
        for idx in reversed(extra_idx):
            face_obj.data.materials.pop(index=idx)

    preset_map = {}
    for bg in vrm_json.get("extensions", {}).get("VRM", {}).get("blendShapeMaster", {}).get("blendShapeGroups", []):
        pname = (bg.get("presetName") or bg.get("name") or "").lower()
        binds = []
        for b in bg.get("binds", []):
            binds.append((f"target_{b['index']}", float(b.get("weight", 100)) / 100.0))
        preset_map[pname] = binds

    sk = face_obj.data.shape_keys
    if sk:
        basis_coords = np.array([p.co[:] for p in sk.key_blocks["Basis"].data], dtype=np.float32)

        def eval_delta(tname: str) -> np.ndarray:
            if tname not in sk.key_blocks:
                return np.zeros_like(basis_coords)
            arr = np.array([p.co[:] for p in sk.key_blocks[tname].data], dtype=np.float32)
            return arr - basis_coords

        def sum_preset(pname: str) -> np.ndarray:
            d = np.zeros_like(basis_coords)
            for tname, w in preset_map.get(pname, []):
                d += eval_delta(tname) * w
            return d

        custom_morphs = {
            "EyeBlink": sum_preset("blink"),
            "Smile": sum_preset("joy") * 0.72 + sum_preset("fun") * 0.35,
        }
        for kb in list(sk.key_blocks)[1:]:
            face_obj.shape_key_remove(kb)
        for cname, delta in custom_morphs.items():
            new_kb = face_obj.shape_key_add(name=cname, from_mix=False)
            new_kb.data.foreach_set("co", (basis_coords + delta).reshape(-1))

    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = face_obj
    face_obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bm = bmesh.from_edit_mesh(face_obj.data)
    skin_mat_idxs = {i for i, m in enumerate(face_obj.data.materials) if m and "SKIN" in m.name}
    for f in bm.faces:
        f.select = f.material_index not in skin_mat_idxs
    bmesh.update_edit_mesh(face_obj.data)
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")

    split_objs = [o for o in bpy.context.selected_objects if o.type == "MESH"]
    face_obj.name = f"{char_id}_Face_Skin"
    for so in split_objs:
        if so != face_obj:
            so.name = f"{char_id}_Face_Features"
            so.parent = arm
            so.matrix_parent_inverse.identity()

    for obj in (bpy.data.objects.get(f"{char_id}_Face_Skin"), bpy.data.objects.get(f"{char_id}_Face_Features")):
        if not obj:
            continue
        used = {f.material_index for f in obj.data.polygons}
        for idx in reversed(range(len(obj.data.materials))):
            if idx not in used:
                obj.data.materials.pop(index=idx)
        for mod in obj.modifiers:
            if mod.type == "ARMATURE":
                mod.object = arm


def compute_anatomical_rest_dirs(arm) -> dict[str, Vector]:
    dirs = {}
    pairs = {
        "J_Bip_L_UpperArm": "J_Bip_L_LowerArm",
        "J_Bip_L_LowerArm": "J_Bip_L_Hand",
        "J_Bip_L_Hand": "J_Bip_L_Middle1",
        "J_Bip_R_Shoulder": "J_Bip_R_UpperArm",
        "J_Bip_R_UpperArm": "J_Bip_R_LowerArm",
        "J_Bip_R_LowerArm": "J_Bip_R_Hand",
        "J_Bip_R_Hand": "J_Bip_R_Middle1",
        "J_Bip_L_UpperLeg": "J_Bip_L_LowerLeg",
        "J_Bip_L_LowerLeg": "J_Bip_L_Foot",
        "J_Bip_L_Foot": "J_Bip_L_ToeBase",
        "J_Bip_R_UpperLeg": "J_Bip_R_LowerLeg",
        "J_Bip_R_LowerLeg": "J_Bip_R_Foot",
        "J_Bip_R_Foot": "J_Bip_R_ToeBase",
    }
    bones = arm.data.bones
    for b, c in pairs.items():
        if b in bones and c in bones:
            d = bones[c].head_local - bones[b].head_local
            if d.length > 1e-5:
                dirs[b] = d.normalized()
    return dirs


def apply_vrm_fk(arm, pb_map, anat_dirs: dict[str, Vector], rel_euler_map: dict, aim_map: dict | None = None, finger_curl: float = 0.28, skirt_map: dict | None = None) -> None:
    resolved_rel = {}
    for k, v in rel_euler_map.items():
        bk = BONE_ALIAS.get(k, k)
        if bk in arm.data.bones:
            resolved_rel[bk] = v
    if "J_Bip_C_Chest" in resolved_rel and "J_Bip_C_UpperChest" not in resolved_rel and "J_Bip_C_UpperChest" in arm.data.bones:
        rx, ry, rz = resolved_rel["J_Bip_C_Chest"]
        resolved_rel["J_Bip_C_Chest"] = (rx * 0.55, ry * 0.55, rz * 0.55)
        resolved_rel["J_Bip_C_UpperChest"] = (rx * 0.45, ry * 0.45, rz * 0.45)

    resolved_aim = {}
    if aim_map:
        for k, v in aim_map.items():
            bk = BONE_ALIAS.get(k, k)
            if bk in arm.data.bones:
                resolved_aim[bk] = v

    if finger_curl != 0.0:
        for side, s in (("L", 1.0), ("R", -1.0)):
            for fname in ("Index", "Middle", "Ring", "Little"):
                for seg, w in ((1, 0.75), (2, 1.05), (3, 0.85)):
                    bn = f"J_Bip_{side}_{fname}{seg}"
                    if bn in arm.data.bones and bn not in resolved_rel:
                        resolved_rel[bn] = (0.0, s * finger_curl * w, 0.0)
            for seg, w in ((1, 0.35), (2, 0.45)):
                bn = f"J_Bip_{side}_Thumb{seg}"
                if bn in arm.data.bones and bn not in resolved_rel:
                    resolved_rel[bn] = (-finger_curl * 0.5 * w, s * finger_curl * 0.35 * w, 0.0)

    if skirt_map:
        for prefix, ang_euler in skirt_map.items():
            for bn in arm.data.bones.keys():
                if bn.startswith(prefix) and not bn.endswith("_end"):
                    step_w = 0.5 if bn.endswith("0") else (0.35 if bn.endswith("1") else 0.25)
                    resolved_rel[bn] = tuple(a * step_w for a in ang_euler)

    world_rot = {}
    for bone in arm.data.bones:
        bname = bone.name
        pb = pb_map[bname]
        R_rest = bone.matrix_local.to_3x3()
        pb.rotation_mode = "QUATERNION"

        if bname in resolved_rel:
            M_rel = Euler(resolved_rel[bname], "XYZ").to_matrix()
            Q_local = (R_rest.transposed() @ M_rel @ R_rest).to_quaternion()
            pb.rotation_quaternion = Q_local
        else:
            Q_local = pb.rotation_quaternion

        if bone.parent:
            R_parent_rest = bone.parent.matrix_local.to_3x3()
            R_parent_world = world_rot[bone.parent.name]
            R_cur = R_parent_world @ (R_parent_rest.transposed() @ R_rest @ Q_local.to_matrix())
        else:
            R_cur = R_rest @ Q_local.to_matrix()

        if bname in resolved_aim:
            target_dir = Vector(resolved_aim[bname]).normalized()
            v_rest = anat_dirs.get(bname, R_rest.col[1].normalized())
            q_swing = v_rest.rotation_difference(target_dir)
            R_desired = q_swing.to_matrix() @ R_rest
            if bone.parent:
                R_parent_rest = bone.parent.matrix_local.to_3x3()
                R_parent_world = world_rot[bone.parent.name]
                R_local = R_rest.transposed() @ R_parent_rest @ R_parent_world.transposed() @ R_desired
            else:
                R_local = R_rest.transposed() @ R_desired
            pb.rotation_quaternion = R_local.to_quaternion()
            R_cur = R_desired

        world_rot[bname] = R_cur


def add_nla_action(arm_obj, clip_name: str, n_frames: int, pose_fn, step: int = 2) -> None:
    if arm_obj.animation_data is None:
        arm_obj.animation_data_create()
    action = bpy.data.actions.new(name=clip_name)
    arm_obj.animation_data.action = action
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="POSE")

    frames = list(range(1, n_frames + 1, step))
    if frames[-1] != n_frames:
        frames.append(n_frames)
    for fr in frames:
        u = (fr - 1) / max(1, n_frames - 1)
        for pb in arm_obj.pose.bones:
            pb.rotation_mode = "QUATERNION"
            pb.location = (0.0, 0.0, 0.0)
            pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pose_fn(arm_obj.pose.bones, u)
        for pb in arm_obj.pose.bones:
            if pb.name.startswith("J_Bip_") or "Skirt" in pb.name:
                if pb.name == "J_Bip_C_Hips":
                    pb.keyframe_insert(data_path="location", frame=fr)
                pb.keyframe_insert(data_path="rotation_quaternion", frame=fr)

    for fc in action.fcurves:
        for kf in fc.keyframe_points:
            kf.interpolation = "BEZIER"
            kf.handle_left_type = "AUTO_CLAMPED"
            kf.handle_right_type = "AUTO_CLAMPED"

    bpy.ops.object.mode_set(mode="OBJECT")
    track = arm_obj.animation_data.nla_tracks.new()
    track.name = clip_name
    strip = track.strips.new(clip_name, 1, action)
    strip.name = clip_name
    strip.action_frame_start = 1
    strip.action_frame_end = n_frames
    arm_obj.animation_data.action = None


def author_npc_clips(arm, npc_id: str) -> None:
    anat_dirs = compute_anatomical_rest_dirs(arm)

    def pose_idle(pb, u):
        t = u * math.tau
        breath = math.sin(t)
        sway = math.sin(t * 0.5)
        pb["J_Bip_C_Hips"].location = (sway * 0.004, 0.0, breath * 0.005)
        apply_vrm_fk(
            arm, pb, anat_dirs,
            {
                "Hips": (0.0, 0.0, sway * 0.028),
                "Spine": (0.015 + breath * 0.014, 0.0, 0.0),
                "Chest": (breath * 0.018, 0.0, -sway * 0.022),
                "Head": (-0.02 + breath * 0.015, 0.0, sway * 0.055),
                "Shoulder.L": (0.0, 0.08, 0.0),
                "Shoulder.R": (0.0, -0.08, 0.0),
            },
            {
                "UpperArm.L": (0.24, -0.04, -0.96),
                "Forearm.L": (0.24, -0.18, -0.94),
                "Hand.L": (0.12, -0.08, -0.98),
                "UpperArm.R": (-0.24, -0.04, -0.96),
                "Forearm.R": (-0.24, -0.18, -0.94),
                "Hand.R": (-0.12, -0.08, -0.98),
            },
            finger_curl=0.30,
            skirt_map={"J_Sec_L_SkirtFront": (-0.08, 0.0, 0.0), "J_Sec_R_SkirtFront": (-0.08, 0.0, 0.0)},
        )

    def pose_wave(pb, u):
        t = u * math.tau
        w = math.sin(t * 2.0) * 0.25
        apply_vrm_fk(
            arm, pb, anat_dirs,
            {
                "Chest": (0.02, -0.05, 0.0),
                "Head": (-0.04, 0.10, 0.08),
                "Shoulder.L": (0.0, 0.08, 0.0),
                "Shoulder.R": (0.0, -0.06, 0.0),
            },
            {
                "UpperArm.L": (0.16, -0.06, -0.94),
                "Forearm.L": (0.08, -0.18, -0.94),
                "UpperArm.R": (-0.84, -0.18, 0.14),
                "Forearm.R": (-0.22 + w * 0.68, -0.28, 0.92),
            },
            finger_curl=0.14,
            skirt_map={"J_Sec_L_SkirtFront": (-0.08, 0.0, 0.0), "J_Sec_R_SkirtFront": (-0.08, 0.0, 0.0)},
        )

    add_nla_action(arm, "Idle", 32, pose_idle, step=2)
    add_nla_action(arm, "Wave", 24, pose_wave, step=2)

    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.location = (0.0, 0.0, 0.0)
        pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
    bpy.ops.object.mode_set(mode="OBJECT")


def build_npc(npc_id: str) -> Path:
    reset_scene()
    cfg = NPC_SPECS[npc_id]
    vrm_path = VRM_CACHE / cfg["file"]
    if not vrm_path.exists():
        raise FileNotFoundError(f"Missing cached VRM file: {vrm_path}")

    vrm_json = parse_vrm_json(vrm_path)
    bpy.ops.import_scene.gltf(filepath=str(vrm_path))

    bake_and_rebuild_vrm_materials(npc_id, vrm_json)
    arm = normalize_vrm_scene(cfg["target_height"])
    consolidate_face_morphs_and_split(arm, npc_id, vrm_json)
    author_npc_clips(arm, npc_id)

    export_objs = [arm] + [o for o in bpy.data.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in export_objs:
        obj.select_set(True)
    out_glb = OUT_DIR / f"{npc_id}.glb"
    out_glb.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out_glb),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_texcoords=True,
        export_colors=True,
        export_skins=True,
        export_morph=True,
        export_morph_normal=False,
        export_animations=True,
        export_nla_strips=True,
        export_def_bones=True,
        export_optimize_animation_size=True,
    )
    print(f"[npc->glb] Exported {npc_id}: {out_glb} ({out_glb.stat().st_size // 1024} KB)")
    return out_glb


def render_qa_sheet(glbs: list[Path], out_png: Path) -> None:
    reset_scene()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 640
    scene.view_settings.view_transform = "Standard"

    world = bpy.data.worlds.new("NPCQAWorld")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.72, 0.88, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.85

    sun = bpy.data.lights.new("Sun", type="SUN")
    sun.energy = 1.75
    sun_o = bpy.data.objects.new("Sun", sun)
    bpy.context.collection.objects.link(sun_o)
    sun_o.rotation_euler = (math.radians(48), 0.0, math.radians(-24))

    for idx, gp in enumerate(glbs):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(gp))
        added = [o for o in bpy.data.objects if o not in before]
        for o in added:
            if o.parent is None:
                o.location = (-0.95 + idx * 0.95, 0.0, 0.0)
            if o.type == "ARMATURE" and o.animation_data and o.animation_data.nla_tracks:
                # Set mid-frame of Wave/Idle so QA shows natural posed arms instead of T-pose
                tr = o.animation_data.nla_tracks[1] if idx == 2 and len(o.animation_data.nla_tracks) > 1 else o.animation_data.nla_tracks[0]
                if tr.strips:
                    o.animation_data.action = tr.strips[0].action

    scene.frame_set(8)
    cam_d = bpy.data.cameras.new("Cam")
    cam_d.lens = 45
    cam_o = bpy.data.objects.new("Cam", cam_d)
    bpy.context.collection.objects.link(cam_o)
    cam_o.location = (0.0, -3.55, 1.0)
    cam_o.rotation_euler = (Vector((0.0, 0.0, 0.86)) - cam_o.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_o

    out_png.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--qa", default="")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    args = parser.parse_args(argv)

    built = [build_npc(nid) for nid in NPC_SPECS]
    if args.qa:
        render_qa_sheet(built, Path(args.qa))
        print(f"[npc->glb] QA render -> {args.qa}")


if __name__ == "__main__":
    main()
