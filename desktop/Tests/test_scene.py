"""Verify real exported geometry, units and asset boundaries without a UE installation."""
import json
import math
from pathlib import Path
import struct
import unittest

ROOT = Path(__file__).resolve().parents[1]


def read_glb(path):
    with path.open('rb') as f:
        magic, version, total, size, chunk = struct.unpack('<4sIIII', f.read(20))
        if (magic, version, total, chunk) != (b'glTF', 2, path.stat().st_size, 0x4e4f534a):
            raise ValueError('Invalid GLB container')
        return json.loads(f.read(size))


class RealCourt(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = read_glb(ROOT/'Art/WaterCourt.glb')
        cls.nodes = {n['name']:n for n in cls.doc['nodes']}
        cls.meshes = {k:cls.doc['meshes'][v['mesh']] for k,v in cls.nodes.items()}

    def test_no_external_resources_or_hidden_camera(self):
        self.assertEqual(set(self.nodes),{'CourtShell','CourtSwing','CourtPlanting','CalZero','CalEast','CalNorth'})
        self.assertFalse(self.doc.get('cameras'))
        for group in ('images','buffers'):
            for resource in self.doc.get(group,[]): self.assertNotIn('uri',resource)
        for node in self.nodes.values():
            for prop in ('matrix','translation','rotation','scale'): self.assertNotIn(prop,node)

    def bounds(self,k):
        acc=[self.doc['accessors'][p['attributes']['POSITION']] for p in self.meshes[k]['primitives']]
        return [min(a['min'][i] for a in acc) for i in range(3)], [max(a['max'][i] for a in acc) for i in range(3)]

    def test_marker_basis_survives_unit_and_axis_conversion(self):
        for name,expected in [('CalZero',(0,0,0)),('CalEast',(1,0,0)),('CalNorth',(0,0,-1))]:
            lo,hi=self.bounds(name)
            for i in range(3): self.assertAlmostEqual((lo[i]+hi[i])/2,expected[i],places=5)

    def test_meshes_for_both_play_spaces_and_local_swing(self):
        lo,hi=self.bounds('CourtShell'); self.assertLess(lo[2],-14); self.assertGreater(hi[2],10)
        lo,hi=self.bounds('CourtPlanting'); self.assertGreaterEqual(hi[1],1.45);self.assertGreater(hi[2],5);self.assertLess(lo[2],-7)
        lo,hi=self.bounds('CourtSwing'); self.assertLess(lo[1],-1.6);self.assertLess(hi[1],.55)
        pivot=json.loads((ROOT/'Art/layout.json').read_text())['swingPivotMeters']
        self.assertTrue(math.dist(pivot,(0,9,2.84)) < .05)
        for group in ('CourtShell','CourtSwing','CourtPlanting'):
            for p in self.meshes[group]['primitives']:
                self.assertIn('material',p);self.assertIn('NORMAL',p['attributes'])
                self.assertEqual(self.doc['accessors'][p['indices']]['count']%3,0)


    def test_meadow_visible_on_the_walk_and_petal_layers_share_one_flower(self):
        doc = self.doc
        groups = {}
        for p in self.meshes['CourtPlanting']['primitives']:
            name = doc['materials'][p['material']]['name']
            bounds = doc['accessors'][p['attributes']['POSITION']]
            for family in ('IB_WindGrass_', 'IB_WindStem_', 'IB_RoseOuter', 'IB_RoseMiddle', 'IB_RoseInner'):
                if name.startswith(family):
                    groups.setdefault(family, []).append(bounds)
        self.assertEqual(len(groups), 5, 'The viewer and UE require all five real motion families')
        for key in ('IB_WindGrass_', 'IB_WindStem_'):
            prim = groups[key]; self.assertGreater(max(p['max'][2] for p in prim), 9.)
            self.assertLess(min(p['min'][2] for p in prim), 4.)
        widths = []
        for key in ('IB_RoseOuter','IB_RoseMiddle','IB_RoseInner'):
            prim = groups[key]
            lo,hi = min(p['min'][0] for p in prim),max(p['max'][0] for p in prim)
            self.assertAlmostEqual((lo + hi)/2, 1.72, delta=.03)
            self.assertTrue(all(p['min'][1] >= .86 and p['max'][1] <= 1.04 for p in prim))
            self.assertTrue(all(p['min'][2] > 6.04 and p['max'][2] < 6.46 for p in prim))
            widths.append(hi - lo)
        self.assertGreater(widths[0],widths[1]); self.assertGreater(widths[1],widths[2])


if __name__=='__main__': unittest.main(verbosity=2)
