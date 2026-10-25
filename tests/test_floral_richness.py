"""Shape contracts for the Three refactor's deliberately smaller floral topology.

Peony 72 -> 42 and ranunculus 98 -> 42 replace repeated polar rings with rooted
spoons; sunflower 48 -> 32 broad rays retains its 128 disc florets. Tulip still
has exactly six tepals: its extra surfaces are reproductive organs, not petals.
These assertions supplement, never relax, the original 2%/3MB/growth contracts.
"""
from __future__ import annotations

import hashlib
import math
from pathlib import Path
import random
import sys
import unittest

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import generator as g


class FloralRichnessTests(unittest.TestCase):
    @staticmethod
    def flower(species, radius=1., rotated=False):
        model = g.Geometry()
        axis = g._unit((.3, .5, .8)) if rotated else (0., 0., 1.)
        head = g.FlowerHead(species, (.2, .8, -.4) if rotated else (0., 0., 0.),
                            axis, radius, 'outer')
        g._add_head(model, head, (.96, .74, .60), 0)
        return model

    def test_double_blooms_have_independent_deep_attachments_not_six_equal_rings(self):
        for species in ('peony', 'ranunculus'):
            plans = [g._double_petal_plan(species, i) for i in range(42)]
            self.assertEqual(len({p.root for p in plans}), 42)
            self.assertEqual(len({round(p.root[2], 5) for p in plans}), 42)
            self.assertGreater(max(p.root[2] for p in plans) - min(p.root[2] for p in plans), .40)
            for plan in plans:
                self.assertAlmostEqual(sum(c*c for c in plan.heading), 1., places=12)
                self.assertAlmostEqual(sum(c*c for c in plan.flank), 1., places=12)
                self.assertAlmostEqual(sum(a*b for a,b in zip(plan.heading, plan.flank)), 0., places=12)
            surfaces = self.flower(species).sections['flowers']
            self.assertEqual(len(surfaces), 42)
            for plan,s in zip(plans[:30], surfaces[:30]):
                # Project away the blade width: a curled outer shoulder can be
                # farther from its root in Euclidean distance, despite its cap.
                root = s.point(0., .5)
                forward = lambda p: sum((a-b)*c for a,b,c in zip(p,root,plan.heading))
                self.assertGreater(forward(s.point(1., .5)), forward(s.point(1., 0.)) * 1.035)

    def test_double_flower_centres_overlap_with_real_blades_not_solid_caps(self):
        for species in ('peony', 'ranunculus'):
            surfaces = self.flower(species, .70).sections['flowers']
            self.assertTrue(all(s.kind == 'sheet' for s in surfaces))
            covering = []
            for index,s in enumerate(surfaces[:8]):
                one = g.Geometry()
                one.sections['flowers'] = [s]
                vertices,indices = g._tessellate_geometry(one)
                for start in range(0,len(indices),3):
                    a,b,c = [vertices[i][:3] for i in indices[start:start+3]]
                    edge = lambda p,q: p[0]*q[1]-p[1]*q[0]
                    area = edge(a,b)+edge(b,c)+edge(c,a)
                    if abs(area) < 1e-10:
                        continue
                    weights = (edge(b,c)/area,edge(c,a)/area,edge(a,b)/area)
                    if min(weights) >= -1e-10 and sum(w*p[2] for w,p in zip(weights,(a,b,c))) > .12:
                        covering.append(index)
                        break
            self.assertGreaterEqual(len(covering), 3, species)

    def test_peony_reflexes_but_ranunculus_keeps_upright_nested_spoons(self):
        peony = self.flower('peony').sections['flowers']
        ranunculus = self.flower('ranunculus').sections['flowers']
        # The outer peony opens back; ranunculus retains its high enclosing lip.
        self.assertLess(peony[-1].point(1., .5)[2], peony[-1].point(.8, .5)[2] - .04)
        self.assertGreater(ranunculus[-1].point(1., .5)[2], ranunculus[-1].point(.8, .5)[2] + .08)
        self.assertGreater(math.hypot(*peony[-1].point(1., .5)[:2]),
                           math.hypot(*ranunculus[-1].point(1., .5)[:2]) * 1.18)
        for species, surfaces in (('peony', peony), ('ranunculus', ranunculus)):
            points = [s.point(i/16, j/8) for s in surfaces for i in range(17) for j in range(9)]
            self.assertGreater(max(p[2] for p in points) - min(p[2] for p in points), .65, species)

    def test_tulip_has_three_plus_three_round_tepals_and_a_clear_open_mouth(self):
        surfaces = self.flower('tulip').sections['flowers']
        petals = [s for s in surfaces if s.kind == 'sheet']
        self.assertEqual(len(petals), 6)
        self.assertEqual(len(surfaces), 20)
        lips = [s.point(1., .5) for s in petals]
        self.assertTrue(all(math.hypot(*p[:2]) > .55 for p in lips))
        self.assertGreater(min(p[2] for p in lips[::2]), max(p[2] for p in lips[1::2]))
        for s in petals:
            self.assertLess(math.hypot(*s.point(0., .5)[:2]), .11)
            self.assertGreater(s.point(1., .5)[2] - s.point(1., 0.)[2], .20)
            self.assertGreater(s.point(1., .5)[2] - s.point(0., .5)[2], 1.4)
        anthers = surfaces[7:18:2]
        self.assertEqual(len(anthers), 6)
        for s in anthers:
            self.assertEqual(s.kind, 'tube')
            self.assertLess(max(s.pigment(.5, .5)), .4)
            self.assertLess(max(s.point(u, v)[2] for u in (0., 1.) for v in (0., .5)),
                            min(p[2] for p in lips) - .25)
            self.assertGreater(math.dist(s.point(0., .5), s.point(1., .5)), .15)
        self.assertEqual(surfaces[-1].kind, 'sphere')
        self.assertLess(max(math.hypot(*surfaces[-1].point(.5, v)[:2])
                            for v in (0., .25, .5, .75)), .08)

    def test_sunflower_has_broad_separated_rays_and_a_legible_raised_disc(self):
        surfaces = self.flower('sunflower').sections['flowers']
        rays, disc = surfaces[:32], surfaces[32:]
        self.assertEqual((len(rays), len(disc)), (32, 128))
        self.assertTrue(all(s.mesh_steps == (1, 4) for s in disc))
        self.assertGreater(max(math.hypot(*s.point(0., .5)[:2]) for s in disc), .42)
        self.assertLess(max(math.hypot(*s.point(1., v)[:2]) for s in disc for v in (0., .25, .5, .75)), .47)
        self.assertGreater(disc[0].point(0., .5)[2] - disc[-1].point(0., .5)[2], .18)
        lengths = []
        for s in rays:
            self.assertAlmostEqual(math.hypot(*s.point(0., .5)[:2]), .40, places=10)
            self.assertGreater(math.hypot(*s.point(1., .5)[:2]), 1.)
            width = math.dist(s.point(.5, 0.), s.point(.5, 1.))
            self.assertGreater(width, .30)
            lengths.append(math.dist(s.point(0., .5), s.point(1., .5)))
        self.assertGreater(max(lengths) - min(lengths), .18)
        self.assertGreater(min(max(s.pigment(.5, .5)) for s in rays),
                           max(max(s.pigment(.5, .5)) for s in disc))

    def test_every_changed_species_keeps_open_and_closed_root_positions_and_normals(self):
        for species in ('peony', 'ranunculus', 'tulip', 'sunflower'):
            for s in self.flower(species, .70, rotated=True).sections['flowers']:
                self.assertIsNotNone(s.closed_point)
                for v in (0., .25, .5, .75, 1.):
                    self.assertEqual(s.point(0., v), s.closed_point(0., v), species)
                    self.assertEqual(g._surface_normal(s, 0., v),
                                     g._surface_normal(s, 0., v, closed=True), species)
                root,tip = s.point(0., .5),s.point(1., .5)
                self.assertLessEqual(math.dist(root,s.closed_point(1., .5)),
                                     1.5 * math.dist(root,tip) + .005, species)
                for u,v in ((.2,.1),(.6,.5),(1.,.9)):
                    normal = g._surface_normal(s, u, v, closed=True)
                    self.assertTrue(all(math.isfinite(c) for c in normal))
                    self.assertAlmostEqual(sum(c*c for c in normal), 1., places=10)

    def test_actual_changed_flower_triangles_stay_below_two_percent_of_head_diameter(self):
        for species in ('peony', 'ranunculus', 'tulip', 'sunflower'):
            for radius in (.52, .70):
                for index,s in enumerate(self.flower(species, radius, rotated=True).sections['flowers']):
                    if s.kind != 'sheet':
                        continue
                    nu,nv = s.mesh_steps
                    for i in range(1,49):
                        for j in range(33):
                            u,v = i/48,j/32
                            iu,iv = min(int(u*nu),nu-1),min(int(v*nv),nv-1)
                            fu,fv = u*nu-iu,v*nv-iv
                            a,b,c,d = (s.point(x/nu,y/nv) for x,y in
                                       ((iu,iv),(iu+1,iv),(iu+1,iv+1),(iu,iv+1)))
                            weights = (((a,1-fu),(b,fu-fv),(c,fv)) if fu>=fv else
                                       ((a,1-fv),(c,fu),(d,fv-fu)))
                            interpolated = tuple(sum(p[k]*w for p,w in weights) for k in range(3))
                            self.assertLess(math.dist(interpolated,s.point(u,v)), .02*(2*radius),
                                            (species,radius,index,u,v))

    def test_all_eight_themes_share_the_new_companion_without_adding_heads_or_sprigs(self):
        for item in g.BOUQUETS:
            heads = g._arrange_heads(item['id'])
            self.assertEqual(len(heads), 36)
            self.assertEqual(sum(h.radius >= .65 for h in heads), 6)
            self.assertGreaterEqual(sum(h.species == 'ranunculus' for h in heads), 6)
            composition = g._head_composition(item['id'])
            self.assertEqual(len(composition), 5)
            self.assertEqual(sum(entry['count'] for entry in composition), 36)
            self.assertEqual({entry['species']: entry['count'] for entry in composition},
                             {species: sum(h.species == species for h in heads)
                              for species in {h.species for h in heads}})
            model = g.Geometry()
            g._accent_sprigs(model, tuple(g._THEME_MIX).index(item['id']))
            # Fixed twelve branch lines contain 54 four-petal florets + six buds.
            self.assertEqual(len(model.sections['flowers']), 54*5 + 6*4 + 20)
            self.assertEqual(len(model.sections['stems']), 12 + 60 + 20)

    def test_redesigned_plans_and_meshes_are_deterministic_without_global_random(self):
        state = random.getstate()
        for species in ('peony', 'ranunculus', 'tulip', 'sunflower'):
            first = g.encode_mesh(self.flower(species, .70))
            second = g.encode_mesh(self.flower(species, .70))
            self.assertEqual(hashlib.sha256(first).digest(), hashlib.sha256(second).digest())
        self.assertEqual(random.getstate(), state)


if __name__ == '__main__':
    unittest.main()
