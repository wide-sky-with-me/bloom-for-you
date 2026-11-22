"""Build island.glb from the assembled Blender scene; never save the .blend.

From any directory: python3 /path/to/export_island.py
Requires Blender 4.0.2, Python/Pillow and gltfpack 0.25 (or Node/npx).
GLTFPACK and BLENDER may point to local binaries for an offline build.
Use --check to inspect an existing GLB without third-party dependencies.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import unquote
import json
import os
import shutil
import struct
import subprocess
import sys

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parents[1] / 'Manor/Remodel01/IrisBay-Remodel01.blend'
LANDMARKS = ('CoastalVillaEntry', 'DoubleSwing', 'Lighthouse', 'Windmill', 'MonetPond', 'StudyDesk')
PIVOTS = ('M02_Pendulum_X', 'M04.Rotor')
BACKGROUND = ('EstateTerrainPeninsula', 'EstateSeaOuterBay', 'EstateTerrainHorizon', 'EstateCoastalVilla', 'BayBouquet')


def blender_export(folder):
    import bpy
    s = bpy.context.scene
    s.frame_set(1)
    report = json.loads(s['R1 assembly report'])
    for i in range(1, 7):
        group = bpy.data.collections[f'M{i:02}_ASSET']
        assert len(group.all_objects) == report['installed'][f'M{i:02}']
    assert all(bpy.data.objects[n].hide_render for n in report['retired_objects'])
    layout = json.loads((SOURCE.parents[1] / 'Layout/landmarks.json').read_text())
    for i, name in enumerate(LANDMARKS, 1):
        mark = bpy.data.objects.new(f'Anchor.M{i:02}.{name}', None)
        s.collection.objects.link(mark)
        mark.location = layout['landmarks'][name]

    # Keep the paper and the tiny wax seal in separate primitives: the wider
    # villa uses the same fabrics, giving a decimator a 20 m error reference.
    house = bpy.data.objects['EstateCoastalVilla'].data
    centers = {'Villa_IvoryLinen': ('Study | letter paper', layout['studyLetterCenter']),
               'Villa_RoseVelvet': ('Study | wax seal', layout['studyWaxSealCenter'])}
    for source_mat, (name, (cx, cy, cz)) in centers.items():
        faces = [f for f in house.polygons if house.materials[f.material_index].name == source_mat
                 and abs(f.center.x - cx) < .20 and abs(f.center.y - cy) < .15
                 and abs(f.center.z - cz) < .020]
        assert len(faces) == 44, (name, len(faces))
        # Separate original faces; no overlaid copy and no re-created geometry.
        obj = bpy.data.objects['EstateCoastalVilla']
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        import bmesh
        chosen = [f.index for f in faces]
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_mode(type='FACE')
        bpy.ops.mesh.select_all(action='DESELECT')
        bm = bmesh.from_edit_mesh(house)
        bm.faces.ensure_lookup_table()
        for index in chosen:
            bm.faces[index].select_set(True)
        bmesh.update_edit_mesh(house)
        bpy.ops.mesh.separate(type='SELECTED')
        bpy.ops.object.mode_set(mode='OBJECT')
        part, = [o for o in bpy.context.selected_objects if o != obj]
        part.name = name
        assert len(part.data.polygons) == 44, name
        # The common 1:4 reduction is too coarse on these tiny beveled solids.
        # Linear subdivision increases their sample budget without rounding them.
        guard = part.modifiers.new('Preserve tabletop silhouettes', 'SUBSURF')
        guard.subdivision_type = 'SIMPLE'
        guard.levels = guard.render_levels = 2

    # Cycles noise / light-path nodes have no glTF representation. Use the
    # authored swatches, keeping distinct material courses and lily vertex paint.
    alpha = {'M05 • Freshwater • IOR 1.333': .28,
             'M05 • Cascade • broken aquamarine': .49,
             'M05 • Whitewater • pearled spray': .80,
             'M05 • Entrained air • silk rivulets': .72,
             'M03 · Low iron lantern glazing': .18,
             'M03 · Polished annular flint glass': .56,
             'Chandelier_03_glass': .24}
    for mat in bpy.data.materials:
        tree = mat.node_tree
        if not tree:
            continue
        bs = next((n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bs:
            continue
        base = bs.inputs['Base Color']
        if base.links and base.links[0].from_node.type in {'VALTORGB', 'MIX_RGB', 'MIX'}:
            tree.links.remove(base.links[0])
            base.default_value = mat.diffuse_color
        if mat.name in alpha:
            out = next(n for n in tree.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
            tree.links.new(bs.outputs[0], out.inputs['Surface'])
            bs.inputs['Transmission Weight'].default_value = 0
            bs.inputs['Alpha'].default_value = alpha[mat.name]
            mat.blend_method = 'BLEND'
    # Do not let the authoring camera's action get mapped onto the motions.
    objs = list(s.objects)
    for o in objs:
        if o.type in {'CAMERA', 'LIGHT'}:
            bpy.data.objects.remove(o, do_unlink=True)
    s.frame_end = max(int(bpy.data.objects[p].animation_data.action.frame_range[1]) for p in PIVOTS)
    for o in s.objects:
        if o.type == 'CURVE':
            o.data.resolution_u = min(o.data.resolution_u, 6)
            o.data.bevel_resolution = min(o.data.bevel_resolution, 2)
        for mod in o.modifiers:
            if mod.type == 'BEVEL':
                mod.segments = min(mod.segments, 2)
    # Two draw groups with distinct parents: never bake the pendulum rotation
    # into the timber frame or move either original shaft/pivot.
    swing = bpy.data.collections['M02_ASSET']
    for parent, name in [('M02_GroundDatum', 'M02.Static trellis and frame'),
                         ('M02_Pendulum_X', 'M02.Moving bench and ropes')]:
        parts = [o for o in swing.all_objects if o.parent and o.parent.name == parent and o.type in {'MESH', 'CURVE'}]
        bpy.ops.object.select_all(action='DESELECT')
        for o in parts:
            o.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        bpy.ops.object.convert(target='MESH')
        bpy.ops.object.join()
        bpy.context.view_layer.objects.active.name = name
    bpy.ops.export_scene.gltf(filepath=str(folder / 'scene.gltf'), export_format='GLTF_SEPARATE',
        use_visible=True, use_renderable=True, export_apply=True, export_yup=True,
        export_animations=True, export_animation_mode='ACTIONS', export_frame_range=False,
        export_anim_slide_to_zero=True, export_frame_step=2, export_skins=False,
        export_morph=False, export_colors=True, export_tangents=True, export_cameras=False, export_lights=False)


def resize_textures(folder):
    from PIL import Image
    path = folder / 'scene.gltf'
    doc = json.loads(path.read_text())
    for i, image in enumerate(doc['images']):
        source = folder / unquote(image['uri'])
        size = 1024 if 'Peninsula' in image['name'] or 'Estate Bay' in image['name'] else 256
        with Image.open(source) as original:
            bitmap = original.convert('RGBA')
        bitmap.thumbnail((size, size), Image.Resampling.LANCZOS)
        opaque = bitmap.getchannel('A').getextrema() == (255, 255)
        suffix = 'jpg' if opaque else 'png'
        dest = folder / f'inline_{i}.{suffix}'
        if opaque:
            bitmap.convert('RGB').save(dest, quality=85, subsampling=0)
        else:
            bitmap.save(dest, optimize=True)
        image['uri'] = dest.name
        image['mimeType'] = 'image/jpeg' if opaque else 'image/png'
    path.write_text(json.dumps(doc, ensure_ascii=False))


def finish_tangents(path):
    # Collapsed UV triangles can yield a zero MikkTSpace tangent. Pick an
    # orthogonal direction there, without changing valid frames or handedness.
    from math import hypot
    data = bytearray(path.read_bytes())
    jslen, = struct.unpack_from('<I', data, 12)
    doc = json.loads(data[20:20 + jslen]); start = 28 + jslen

    def attr(index):
        a = doc['accessors'][index]; view = doc['bufferViews'][a['bufferView']]
        assert a['componentType'] == 5120 and a['normalized']
        return start + view.get('byteOffset', 0) + a.get('byteOffset', 0), view['byteStride'], a['count']

    fixed = 0
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            attrs = primitive['attributes']
            if 'TANGENT' not in attrs:
                continue
            base, stride, count = attr(attrs['TANGENT'])
            normal, nstride, ncount = attr(attrs['NORMAL']); assert count == ncount
            for j in range(count):
                pos = base + j * stride
                if data[pos:pos + 3] != bytes(3):
                    continue
                x, y, z = struct.unpack_from('bbb', data, normal + j * nstride)
                t = (-y, x, 0) if abs(z) < 110 else (z, 0, -x)
                length = hypot(*t)
                struct.pack_into('bbb', data, pos, *(round(v * 127 / length) for v in t))
                fixed += 1
    if fixed:
        path.write_bytes(data)
    print('UV-degenerate tangent frames rebuilt:', fixed)


def check(path):
    b = path.read_bytes()
    magic, version, length, jslen, tag = struct.unpack_from('<4sIII4s', b)
    assert (magic, version, length, tag) == (b'glTF', 2, len(b), b'JSON') and length <= 75_000_000
    d = json.loads(b[20:20 + jslen]); binlen, tag = struct.unpack_from('<I4s', b, 20 + jslen)
    assert tag == b'BIN\0' and len(b) == 28 + jslen + binlen
    assert len(d['buffers']) == 1 and 'uri' not in d['buffers'][0]
    assert all('bufferView' in im and 'uri' not in im for im in d['images'])
    assert all(v.get('byteOffset', 0) + v['byteLength'] <= binlen for v in d['bufferViews'])
    names = {n.get('name'): n for n in d['nodes']}
    for name in (*BACKGROUND, 'Study | wax seal', 'Study | letter paper',
                 'M03 18 · Individual glass panes', *(f'M05.Nymphaea.{i:02}.Petals' for i in range(1, 5))):
        assert 'mesh' in names[name], name
    for i, name in enumerate(LANDMARKS, 1):
        prefix = f'M{i:02}'
        count = sum(1 for n in d['nodes'] if n.get('name', '').startswith(prefix) and 'mesh' in n)
        assert count == (25, 2, 27, 32, 38, 9)[i - 1], (prefix, count)
        print(prefix, 'meshes', count, 'anchor', names[f'Anchor.{prefix}.{name}']['translation'])
    targets = {d['nodes'][c['target']['node']].get('name') for a in d['animations'] for c in a['channels'] if c['target']['path'] == 'rotation'}
    assert set(PIVOTS) <= targets, targets
    print('GLB_OK', len(b), 'bytes;', len(d['images']), 'embedded images;', len(d['animations']), 'clips;', d.get('extensionsRequired', []))


def build():
    binary = os.environ.get('GLTFPACK') or shutil.which('gltfpack')
    pack = [binary] if binary else ['npx', '--yes', '--package=gltfpack@0.25.0', '--', 'gltfpack']
    # Staging on the output filesystem permits atomic replacement after validation.
    with TemporaryDirectory(dir=HERE) as tmp:
        folder = Path(tmp)
        blender = shutil.which(os.environ.get('BLENDER', 'blender'))
        if not blender:
            raise RuntimeError('Blender executable missing; set BLENDER to its path')
        # Distro builds resolve python3.X via PATH. Match the Blender install,
        # not an unrelated Python/uv environment lacking its C extensions.
        env = os.environ.copy()
        env['PATH'] = str(Path(blender).parent) + os.pathsep + env['PATH']
        subprocess.run([blender, '-b', str(SOURCE), '-t', '4', '--python-exit-code', '1',
            '-P', __file__, '--', '--blender-stage', tmp], check=True, env=env)
        resize_textures(folder)
        out = folder / 'island.glb'
        subprocess.run(pack + ['-i', str(folder / 'scene.gltf'), '-o', str(out), '-kn',
            '-si', '0.25', '-se', '0.0001', '-sp', '-vpf', '-vp', '16', '-af', '24'], check=True)
        finish_tangents(out)
        check(out)
        out.replace(HERE / 'island.glb')


if __name__ == '__main__':
    if '--blender-stage' in sys.argv:
        blender_export(Path(sys.argv[-1]))
    elif sys.argv[1:] == ['--check']:
        check(HERE / 'island.glb')
    else:
        build()
