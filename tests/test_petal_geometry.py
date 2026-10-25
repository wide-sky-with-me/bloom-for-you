"""Rooted rose regression: geometry quality as well as protocol byte budgets.

The 28 broad blades replace 45 polar sectors and a spiral strip. Exact new
sampling allocations are intentional: exposed shoulders get transverse samples,
while companion roses stay within their previous aggregate byte allowance.
"""
from __future__ import annotations

from dataclasses import replace
import math
from pathlib import Path
import random
import sys
import unittest
from unittest import mock

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import generator as g


class RootedRoseGeometryTests(unittest.TestCase):
    @staticmethod
    def rose(radius=1.0):
        model = g.Geometry()
        g._rose(model, (0., 0., 0.), radius, (.9, .6, .7), normal=(0., 0., 1.))
        return model

    def test_each_blade_has_an_orthonormal_root_frame_and_deterministic_plan(self):
        state = random.getstate()
        plans = [g._rose_petal_plan(i) for i in range(28)]
        self.assertEqual(plans, [g._rose_petal_plan(i) for i in range(28)])
        self.assertEqual(random.getstate(), state)
        self.assertEqual(len({p.root for p in plans}), 28)
        for plan in plans:
            self.assertAlmostEqual(sum(c*c for c in plan.heading), 1., places=12)
            self.assertAlmostEqual(sum(c*c for c in plan.flank), 1., places=12)
            self.assertAlmostEqual(sum(a*b for a,b in zip(plan.heading, plan.flank)), 0., places=12)
        self.assertLess(plans[0].width, plans[-1].width * .35)
        self.assertGreater(plans[0].heading[2], .98)
        self.assertGreater(plans[-1].root[2] * -1, .35)

    def test_roll_changes_only_the_distal_half_not_the_rooted_heading(self):
        plan = g._rose_petal_plan(27)
        curled = g._petal_sweep(plan, lambda p:p)
        unrolled = g._petal_sweep(replace(plan, roll=0.), lambda p:p)
        for u in (0., .1, .3, .49, .5):
            for v in (.0, .25, .5, .75, 1.):
                self.assertEqual(curled(u,v), unrolled(u,v))
        self.assertGreater(math.dist(curled(1.,.5), unrolled(1.,.5)), .25)
        self.assertLess(curled(1.,.5)[2], curled(.8,.5)[2] - .08)

    def test_inner_blades_overlap_the_axis_without_a_solid_centre_cap(self):
        model = self.rose()
        self.assertEqual(len(model.sections['flowers']), 28)
        self.assertTrue(all(s.kind == 'sheet' for s in model.sections['flowers']))
        covering = []
        for petal_index, surface in enumerate(model.sections['flowers'][:5]):
            one = g.Geometry()
            one.sections['flowers'] = [surface]
            vertices, indices = g._tessellate_geometry(one)
            for start in range(0, len(indices), 3):
                a,b,c = [vertices[i][:3] for i in indices[start:start+3]]
                edge = lambda p,q: p[0]*q[1]-p[1]*q[0]
                area = edge(a,b)+edge(b,c)+edge(c,a)
                if abs(area) < 1e-10:
                    continue  # An edge-on projected triangle does not close a hole.
                weights = (edge(b,c)/area,edge(c,a)/area,edge(a,b)/area)
                depth = sum(weight*p[2] for weight,p in zip(weights,(a,b,c)))
                if min(weights) >= -1e-10 and depth > .4:
                    covering.append(petal_index)
                    break
        self.assertGreaterEqual(len(set(covering)), 3)
        points = [s.point(i/24,j/16) for s in model.sections['flowers'] for i in range(25) for j in range(17)]
        self.assertGreater(max(p[2] for p in points)-min(p[2] for p in points), 1.05)
        self.assertGreater(model.sections['flowers'][0].point(.8,.5)[2], .6)

    def test_spine_and_shoulder_normals_have_no_row_jumps_or_edge_flips(self):
        for surface in self.rose().sections['flowers']:
            for u in (0., .1, .5, .8, 1.):
                for edge, near in ((0.,.0002),(1.,.9998)):
                    a,b = g._surface_normal(surface,u,edge),g._surface_normal(surface,u,near)
                    self.assertGreater(sum(x*y for x,y in zip(a,b)), .999)
            for row in range(1,32):
                u = row/32
                eps = 1e-6
                a,b,c = (surface.point(t,.5) for t in (u-eps,u,u+eps))
                before = g._unit(tuple(y-x for x,y in zip(a,b)))
                after = g._unit(tuple(y-x for x,y in zip(b,c)))
                self.assertGreater(sum(x*y for x,y in zip(before,after)), .999999)

    def test_actual_rose_triangle_interpolation_stays_below_two_percent(self):
        for radius in (.52,.70):
            model = self.rose(radius)
            for petal_index, surface in enumerate(model.sections['flowers']):
                nu,nv = surface.mesh_steps
                for i in range(1,25):
                    for j in range(17):
                        u,v = i/24,j/16
                        iu,iv = min(int(u*nu),nu-1),min(int(v*nv),nv-1)
                        fu,fv = u*nu-iu,v*nv-iv
                        a,b,c,d = (surface.point(x/nu,y/nv) for x,y in
                                   ((iu,iv),(iu+1,iv),(iu+1,iv+1),(iu,iv+1)))
                        weights = (((a,1-fu),(b,fu-fv),(c,fv)) if fu>=fv else
                                   ((a,1-fv),(c,fu),(d,fv-fu)))
                        interpolated = tuple(sum(p[k]*w for p,w in weights) for k in range(3))
                        self.assertLess(math.dist(interpolated,surface.point(u,v)), .02*(2*radius),
                                        (radius,petal_index,u,v))

    def test_rose_bud_is_rooted_nested_and_not_a_shrunken_open_disc(self):
        model = self.rose()
        for surface in model.sections['flowers']:
            for v in (0.,.25,.5,.75,1.):
                self.assertEqual(surface.point(0.,v),surface.closed_point(0.,v))
                self.assertEqual(g._surface_normal(surface,0.,v),g._surface_normal(surface,0.,v,closed=True))
            for i in range(4,25):
                for j in range(17):
                    point = surface.closed_point(i/24,j/16)
                    self.assertLess(math.hypot(*point[:2]), .34)
                    normal = g._surface_normal(surface,i/24,j/16,closed=True)
                    self.assertTrue(all(math.isfinite(c) for c in normal))
                    self.assertAlmostEqual(sum(c*c for c in normal),1.,places=10)
            self.assertLess(math.hypot(*surface.closed_point(1.,.5)[:2]), .025)
        head = g.FlowerHead('rose',(.2,1.,-.4),g._unit((.3,.5,.8)),.70,'outer')
        with mock.patch.object(g,'_closed_petal',side_effect=AssertionError('generic bud')):
            with mock.patch.object(g,'_cupped_surface',side_effect=AssertionError('generic cup')):
                g._add_head(g.Geometry(),head,(.9,.6,.7),0)

    def test_sampling_allocations_preserve_hero_detail_and_companion_byte_allowance(self):
        companion_steps = ([(3,4)]*13+[(4,4)]*3+[(5,4)]+[(5,5)]*5
                           +[(6,6)]*2+[(7,7)]*2+[(8,8)]*2)
        for radius, expected in ((.70,[(6,6)]*8+[(8,8)]*12+[(10,12)]*8),
                                 (.52,companion_steps)):
            surfaces = self.rose(radius).sections['flowers']
            self.assertEqual([s.mesh_steps for s in surfaces],expected)
        companion = self.rose(.52)
        vertices,indices = g._tessellate_geometry(companion)
        self.assertEqual((len(vertices),len(indices)),(933,3882))
        # The old 45 blades + spiral cost 1011 vertices and 3690 indices.
        self.assertLessEqual(len(vertices)*36+len(indices)*4,1011*36+3690*4)


if __name__ == '__main__':
    unittest.main()
