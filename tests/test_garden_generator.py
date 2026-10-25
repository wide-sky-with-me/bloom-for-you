"""Formal natural-garden contracts, independent of the untouched legacy suite."""
from __future__ import annotations

from collections import Counter
import hashlib
import json
import math
import os
from pathlib import Path
import random
import struct
import sys
import tempfile
import unittest
from unittest import mock
import xml.etree.ElementTree as ET

sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import generator as g
import garden_generator as gg
from studies.natural_garden import flowers as f
from test_natural_garden_flowers import triangle_error

IDS=('rose','tulip','hydrangea','wildflower','peony','lily','sunflower','calla')


class GardenGeometryTests(unittest.TestCase):
    def test_actual_head_counts_species_and_native_heroes(self):
        self.assertEqual(gg.COUNT,120000)
        self.assertEqual(gg.CLOSEUP_COUNT,16000)
        self.assertEqual(gg.STRIDE,11)
        for key in IDS:
            heads=gg.arrange_heads(key)
            expected_count=27 if key in ('hydrangea','peony') else 31
            self.assertEqual(len(heads),expected_count)
            self.assertEqual(sum(h.radius>=.65 for h in heads),6)
            self.assertEqual(len({h.species for h in heads}),5)
            self.assertFalse(any(h.species in ('rose','ranunculus','dahlia') for h in heads))
            if key not in ('rose','wildflower'):
                self.assertTrue(all(h.species==key for h in heads if h.radius>=.65))
            for step in range(12):
                angle=step*math.tau/12
                facing=[h for h in heads if h.axis[0]*math.sin(angle)+h.axis[2]*math.cos(angle)>.60]
                self.assertGreaterEqual(len(facing),5,(key,step))
                self.assertGreaterEqual(len({h.species for h in facing}),2)
            self.assertTrue(all(h.layer!='inner' for h in heads))

    def test_determinism_pairing_global_random_and_small_budgets(self):
        before=random.getstate()
        for key in IDS:
            first=gg.generate_bouquet(key,257)
            points,poses=gg.generate_bouquet_with_growth(key,257)
            self.assertEqual(first,points)
            self.assertEqual(len(points),257)
            self.assertEqual(len(poses),257)
            self.assertEqual(g.encode_particles(first),g.encode_particles(gg.generate_bouquet(key,257)))
        self.assertEqual(random.getstate(),before)
        for key in ('bad',''):
            with self.assertRaises(ValueError):gg.generate_bouquet(key,7)
        with self.assertRaises(ValueError):gg.generate_bouquet('rose',0)

    def test_native_supports_are_replaced_by_thin_study_supports(self):
        value=gg._build_geometry('calla')
        self.assertEqual(len(value.heads),len(gg.arrange_heads('calla')))
        # Every head has the explicitly sampled study stem, rather than retaining
        # the native flower builder's coarse support in addition to another one.
        self.assertEqual(sum(s.mesh_steps==(12,6) for s in value.sections['stems']),len(value.heads))
        self.assertTrue(all(s.mesh_steps==(9,6) for s in value.sections['leaves']))
        self.assertEqual(len(value.sections['ribbon']),3)

    def test_short_sprigs_are_real_affine_geometry_not_framing_exclusion(self):
        raw,short=g.Geometry(),g.Geometry()
        gg._small_sprigs(raw)
        gg._release_sprigs(short)
        max_y=-math.inf
        for key in raw.sections:
            self.assertEqual(len(raw.sections[key]),len(short.sections[key]))
            for a,b in zip(raw.sections[key],short.sections[key]):
                self.assertEqual((a.kind,a.weight,a.mesh_steps),(b.kind,b.weight,b.mesh_steps))
                for u in (0.,.5,1.):
                    for v in (0.,.5,1.):
                        x,y,z=a.point(u,v)
                        expected=(.7*x,.5+.7*(y-.5),.7*z)
                        self.assertEqual(b.point(u,v),expected)
                        max_y=max(max_y,expected[1])
        self.assertLess(max_y,2.0)
        head=next(h for h in gg.arrange_heads('hydrangea') if h.species=='hydrangea')
        native=gg._native_flower(head,(.6,.7,.9),0)
        self.assertEqual(len(native),60*5)
        self.assertEqual(sum(s.mesh_steps==(5,2) for s in native),60*4)
        self.assertAlmostEqual(sum(s.weight for s in native),head.radius**2,places=12)

    def test_actual_arranged_flower_roots_and_triangle_error_keep_original_targets(self):
        for key in IDS:
            for index,head in enumerate(gg.arrange_heads(key)):
                value=g.Geometry()
                seed_index=gg._head_seed(key,index)
                color=gg._head_color(key,head.species,seed_index)
                if head.species in f.SPECIES:
                    openness=(1. if head.radius>=.65 or head.layer=='support' else
                              .65 if seed_index%9==8 else .87+.13*(seed_index%4)/3)
                    f.add_flower(value,head.species,head.center,head.radius,color,seed_index,
                                 axis=head.axis,openness=openness,detail=.65)
                    if head.species=='garden_rose':
                        from dataclasses import replace
                        for j in range(22,len(value.sections['flowers'])):
                            surface=value.sections['flowers'][j]
                            value.sections['flowers'][j]=replace(surface,mesh_steps=(max(9,surface.mesh_steps[0]),surface.mesh_steps[1]))
                else:
                    value.sections['flowers']=gg._native_flower(head,color,seed_index)
                surfaces=value.sections['flowers']
                # All actual anatomy remains rooted. Sample each native floret's
                # four blades, not only its compact centre detail.
                for surface_index,surface in enumerate(surfaces):
                    self.assertIsNotNone(surface.closed_point)
                    for v in (0.,.5,1.):
                        self.assertEqual(surface.point(0.,v),surface.closed_point(0.,v))
                        self.assertEqual(g._surface_normal(surface,0.,v),
                                         g._surface_normal(surface,0.,v,closed=True))
                    if surface.kind!='sheet':
                        continue
                    error,uv=triangle_error(surface,48,32)
                    self.assertLess(error,.02*(2*head.radius),
                                    (key,index,head.species,surface_index,uv,error/(2*head.radius)))


class GardenAssetContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        supplied=os.environ.get('GARDEN_TEST_ASSETS_DIR')
        cls.temporary=None
        if supplied:
            cls.assets=Path(supplied)
        else:
            cls.temporary=tempfile.TemporaryDirectory()
            cls.assets=Path(cls.temporary.name)
            gg.generate_assets(cls.assets)
        cls.manifest=json.loads((cls.assets/'manifest.json').read_text(encoding='utf-8'))

    @classmethod
    def tearDownClass(cls):
        if cls.temporary:cls.temporary.cleanup()

    def test_manifest_keeps_story_ids_and_declares_real_composition_and_closeups(self):
        m=self.manifest
        self.assertEqual((m['version'],m['count'],m['stride']),(2,120000,11))
        self.assertEqual(m['defaultBouquet'],'rose')
        self.assertEqual(m['style'],'natural-garden-v1')
        self.assertEqual(tuple(x['id'] for x in m['bouquets']),IDS)
        for entry in m['bouquets']:
            actual=Counter(h.species for h in gg.arrange_heads(entry['id']))
            self.assertEqual(entry['headCount'],sum(actual.values()))
            self.assertEqual({x['species']:x['count'] for x in entry['composition']},dict(actual))
            self.assertEqual(sum(x['count'] for x in entry['composition']),entry['headCount'])
            self.assertEqual(len(entry['composition']),5)
            self.assertEqual(entry['file'],entry['id']+'.bin')
            self.assertEqual(entry['svg'],entry['id']+'.svg')
            self.assertTrue(all(entry[k] for k in ('title','subtitle','description','color','surface','growth')))
        self.assertEqual(tuple(x['id'] for x in m['closeups']),f.SPECIES)
        for entry in m['closeups']:
            self.assertEqual(entry['pointCount'],16000)
            self.assertEqual(entry['file'],'closeup-'+entry['id']+'.bin')
            self.assertEqual(entry['svg'],'closeup-'+entry['id']+'.svg')

    def test_all_twelve_real_binary_resources_keep_layout_normalization_and_budgets(self):
        hashes=[]
        for entry in [*self.manifest['bouquets'],*self.manifest['closeups']]:
            count=entry.get('pointCount',120000)
            points=(self.assets/entry['file']).read_bytes()
            self.assertEqual(len(points),count*44)
            hashes.append(hashlib.sha256(points).digest())
            mesh=(self.assets/entry['surface']).read_bytes()
            magic,vertices,indices=g.MESH_HEADER.unpack_from(mesh)
            self.assertEqual(magic,b'BFM1')
            self.assertEqual(len(mesh),12+vertices*36+indices*4)
            self.assertLess(len(mesh),3_000_000)
            self.assertGreater(vertices,1000)
            self.assertEqual(indices%3,0)
            growth=(self.assets/entry['growth']).read_bytes()
            self.assertEqual(g.GROWTH_HEADER.unpack_from(growth),(b'BFG1',count,vertices))
            self.assertEqual(len(growth),12+(count+vertices)*14)
            self.assertLess(len(growth),3_000_000)
            for record in struct.iter_unpack('<11f',points):
                self.assertTrue(all(math.isfinite(v) for v in record))
                self.assertTrue(all(0<=v<=1 for v in record[3:6]))
                self.assertTrue(.6-1e-6<=record[6]<=1.8+1e-6)
                self.assertAlmostEqual(sum(v*v for v in record[8:]),1.,delta=2e-6)
            for vertex in struct.iter_unpack('<9f',mesh[12:12+vertices*36]):
                self.assertTrue(all(math.isfinite(v) for v in vertex))
                self.assertAlmostEqual(sum(v*v for v in vertex[6:]),1.,delta=2e-6)
        self.assertEqual(len(set(hashes)),12)

    def test_all_bouquets_and_closeups_have_self_contained_vector_fallback(self):
        ns={'svg':'http://www.w3.org/2000/svg'}
        for entry in [*self.manifest['bouquets'],*self.manifest['closeups']]:
            path=self.assets/entry['svg']
            xml=ET.fromstring(path.read_text(encoding='utf-8'))
            self.assertEqual(xml.find('svg:title',ns).text,entry['title'])
            geometry=(gg._build_geometry(entry['id']) if entry['id'] in IDS
                      else gg.build_single(entry['id'],detail=1.5))
            expected_paths=sum((1+(11 if section=='leaves' else 0) if s.kind=='sheet'
                                else 288 if s.kind=='sphere' else 64)+(2 if s.contour else 0)
                               for section,surfaces in geometry.sections.items() for s in surfaces)
            self.assertEqual(len(xml.findall('svg:g/svg:path',ns)),expected_paths)
            self.assertNotIn('<image',path.read_text(encoding='utf-8'))


class GardenWriterTests(unittest.TestCase):
    def test_optional_growth_omission_does_not_change_open_files(self):
        value=g.Geometry()
        value.add('flowers',1.,lambda u,v:(u,v,0.),(.9,.7,.6),mesh_steps=(3,3),
                  closed_point=lambda u,v:(u,v,.1*u))
        value.heads.append(g.FlowerHead('garden_rose',(0.,0.,0.),(0.,0.,1.),1.,'study'))
        with tempfile.TemporaryDirectory() as a,tempfile.TemporaryDirectory() as b,\
                mock.patch.object(gg,'_build_geometry',return_value=value),\
                mock.patch.object(gg,'build_single',return_value=value),\
                mock.patch.object(gg,'COUNT',31),mock.patch.object(gg,'CLOSEUP_COUNT',17):
            first=gg.generate_assets(a)
            second=gg.generate_assets(b,include_growth=False)
            for x,y in zip([*first['bouquets'],*first['closeups']],
                           [*second['bouquets'],*second['closeups']]):
                self.assertIn('growth',x)
                self.assertNotIn('growth',y)
                for key in ('file','surface','svg'):
                    self.assertEqual((Path(a)/x[key]).read_bytes(),(Path(b)/y[key]).read_bytes())
                self.assertFalse((Path(b)/x['growth']).exists())


if __name__=='__main__':
    unittest.main()
