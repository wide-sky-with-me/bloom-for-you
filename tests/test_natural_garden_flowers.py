"""Independent natural-garden study contracts; frozen V6 tests stay untouched."""
from __future__ import annotations

import hashlib
import math
from pathlib import Path
import random
import struct
import sys
import unittest

sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import generator as g
from studies.natural_garden import flowers as f


def model(species, *, openness=1.,detail=1.,index=0,axis=(0.,0.,1.),center=(0.,0.,0.),radius=1.):
    value=g.Geometry()
    f.add_flower(value,species,center,radius,(.96,.81,.68),index,
                 axis=axis,openness=openness,detail=detail)
    return value


def triangle_error(surface, rows=48,columns=32):
    """True fixed-diagonal Float32 triangle interpolation, not bilinear quads."""
    nu,nv=surface.mesh_steps
    corners=[[struct.unpack('<3f',struct.pack('<3f',*surface.point(i/nu,j/nv)))
              for j in range(nv+1)] for i in range(nu+1)]
    worst=(0.,None)
    for i in range(rows+1):
        for j in range(columns+1):
            u,v=i/rows,j/columns
            iu,iv=min(int(u*nu),nu-1),min(int(v*nv),nv-1)
            fu,fv=u*nu-iu,v*nv-iv
            a,b,c,d=corners[iu][iv],corners[iu+1][iv],corners[iu+1][iv+1],corners[iu][iv+1]
            weights=(((a,1-fu),(b,fu-fv),(c,fv)) if fu>=fv else
                     ((a,1-fv),(c,fu),(d,fv-fu)))
            point=tuple(sum(p[k]*w for p,w in weights) for k in range(3))
            error=math.dist(point,surface.point(u,v))
            if error>worst[0]:
                worst=(error,(u,v))
    return worst


class NaturalGardenFlowerTests(unittest.TestCase):
    def test_api_appends_only_flower_sections_and_normalizes_each_head(self):
        value=g.Geometry()
        value.add('flowers',.2,lambda u,v:(u,v,0.),(.9,.8,.7),mesh_steps=(2,2))
        original=value.sections['flowers'][0]
        for index,species in enumerate(f.SPECIES):
            start=len(value.sections['flowers'])
            f.add_flower(value,species,(0.,.2*index,0.),.5,(.96,.81,.68),index)
            self.assertIs(value.sections['flowers'][0],original)
            self.assertAlmostEqual(sum(s.weight for s in value.sections['flowers'][start:]),.25,places=12)
        self.assertEqual(len(value.heads),4)
        self.assertTrue(all(not value.sections[key] for key in ('stems','leaves','ribbon')))

    def test_each_species_has_distinct_real_construction(self):
        counts={species:len(model(species).sections['flowers']) for species in f.SPECIES}
        self.assertEqual(counts,{'champagne_ranunculus':30,'garden_rose':28,'anemone':56,'sweet_pea':5})
        rose=model('garden_rose').sections['flowers'][-1]
        ranunculus=model('champagne_ranunculus').sections['flowers'][-1]
        self.assertLess(rose.point(1.,.5)[2],rose.point(.8,.5)[2]-.04)
        self.assertGreater(ranunculus.point(1.,.5)[2],ranunculus.point(.8,.5)[2]+.07)
        anemone=model('anemone').sections['flowers']
        self.assertTrue(all(max(s.pigment(.5,.5))>.6 for s in anemone[:7]))
        self.assertLess(max(anemone[7].pigment(.5,.5)),.1)
        self.assertGreater(anemone[7].point(0.,.5)[2],anemone[7].point(1.,.5)[2]+.15)
        self.assertEqual(sum(s.kind=='sphere' for s in anemone),24)
        pea=model('sweet_pea').sections['flowers']
        banner=[pea[0].point(1.,j/16) for j in range(17)]
        self.assertGreater(max(p[0] for p in banner)-min(p[0] for p in banner),1.3)
        self.assertGreater(pea[0].point(1.,.5)[1],.8)
        self.assertLess(pea[3].point(1.,.5)[1],-.35)
        self.assertGreater(pea[3].point(1.,.5)[2],.45)

    def test_double_flower_hearts_are_covered_by_blades_without_a_solid_cap(self):
        for species in f.SPECIES[:2]:
            surfaces=model(species).sections['flowers']
            self.assertTrue(all(s.kind=='sheet' for s in surfaces))
            covering=[]
            for index,s in enumerate(surfaces[:8]):
                one=g.Geometry()
                one.sections['flowers']=[s]
                vertices,indices=g._tessellate_geometry(one)
                for start in range(0,len(indices),3):
                    a,b,c=[vertices[i][:3] for i in indices[start:start+3]]
                    edge=lambda p,q:p[0]*q[1]-p[1]*q[0]
                    area=edge(a,b)+edge(b,c)+edge(c,a)
                    if abs(area)<1e-10:
                        continue
                    weights=edge(b,c)/area,edge(c,a)/area,edge(a,b)/area
                    if min(weights)>=-1e-10 and sum(w*p[2] for w,p in zip(weights,(a,b,c)))>.25:
                        covering.append(index)
                        break
            self.assertGreaterEqual(len(covering),3,species)

    def test_maturity_changes_bowl_and_lip_not_only_scale_or_petal_count(self):
        for species in f.SPECIES:
            opened=model(species).sections['flowers']
            half=model(species,openness=.55).sections['flowers']
            bud=model(species,openness=.15).sections['flowers']
            self.assertEqual(len(opened),len(half))
            self.assertEqual(len(opened),len(bud))
            for a,b,c in zip(opened,half,bud):
                for v in (0.,.25,.5,.75,1.):
                    self.assertEqual(a.point(0.,v),b.point(0.,v))
                    self.assertEqual(a.point(0.,v),c.point(0.,v))
            full_points=[s.point(i/16,j/8) for s in opened[:7] for i in range(17) for j in range(9)]
            bud_points=[s.point(i/16,j/8) for s in bud[:7] for i in range(17) for j in range(9)]
            radial=lambda points:max(math.hypot(*p[:2]) for p in points)
            self.assertGreater(radial(full_points),radial(bud_points)*1.35,species)

    def test_every_patch_closed_pose_preserves_root_positions_and_derivative_normals(self):
        for species in f.SPECIES:
            for openness in (.15,.55,1.):
                value=model(species,openness=openness,axis=g._unit((.3,.5,.8)),center=(.2,.4,-.1),radius=.7)
                for s in value.sections['flowers']:
                    self.assertIsNotNone(s.closed_point)
                    for v in (0.,.25,.5,.75,1.):
                        self.assertEqual(s.point(0.,v),s.closed_point(0.,v),species)
                        self.assertEqual(g._surface_normal(s,0.,v),g._surface_normal(s,0.,v,closed=True),species)
                    for u,v in ((.2,.1),(.6,.5),(1.,.9)):
                        normal=g._surface_normal(s,u,v,closed=True)
                        self.assertTrue(all(math.isfinite(c) for c in normal))
                        self.assertAlmostEqual(sum(c*c for c in normal),1.,places=10)

    def test_low_frequency_compression_is_continuous_and_not_identical_per_petal(self):
        for species in f.SPECIES[:2]:
            first=model(species,index=0).sections['flowers']
            other=model(species,index=3).sections['flowers']
            self.assertNotAlmostEqual(math.dist(first[-1].point(.7,.2),first[-1].point(.9,.7)),
                                      math.dist(other[-1].point(.7,.2),other[-1].point(.9,.7)),places=4)
            roots=[s.point(0.,.5)[2] for s in first]
            self.assertEqual(len({round(z,5) for z in roots}),len(first))
            for s in first:
                for u in (.1,.5,.9,1.):
                    for edge,near in ((0.,.0002),(1.,.9998)):
                        a,b=g._surface_normal(s,u,edge),g._surface_normal(s,u,near)
                        self.assertGreater(sum(x*y for x,y in zip(a,b)),.999)

    def test_inner_wrappers_do_not_sweep_through_axis_or_cross_tips(self):
        for species in f.SPECIES[:2]:
            for detail in (.65,1.5):
                surfaces=model(species,detail=detail).sections['flowers'][:14]
                for index,s in enumerate(surfaces):
                    plan,_,_=f._double_plan(species,index,0)
                    length=math.hypot(*plan.root[:2])
                    radial=tuple(c/length for c in plan.root[:2])
                    for i in range(49):
                        p=s.point(i/48,.5)
                        self.assertGreaterEqual(sum(a*b for a,b in zip(p[:2],radial)),-1e-10)
                    nu,nv=s.mesh_steps
                    for i in range(nu):
                        for j in range(nv):
                            a,b,c,d=[s.point(x/nu,y/nv) for x,y in
                                     ((i,j),(i+1,j),(i+1,j+1),(i,j+1))]
                            for triangle in ((a,b,c),(a,c,d)):
                                for p,q in ((triangle[0],triangle[1]),(triangle[1],triangle[2]),
                                            (triangle[2],triangle[0])):
                                    rp,rq=math.hypot(*p[:2]),math.hypot(*q[:2])
                                    if min(rp,rq)>.015:
                                        self.assertGreater((p[0]*q[0]+p[1]*q[1])/(rp*rq),0.)
                tips=[s.point(1.,.5) for s in surfaces[:3]]
                self.assertGreater(min(math.dist(tips[i],tips[j]) for i in range(3)
                                       for j in range(i)),.035)

    def test_real_triangles_stay_below_two_percent_at_both_lods_and_maturities(self):
        for species in f.SPECIES:
            for detail in ((.65,1.,1.5) if species in f.SPECIES[:2] else (.65,1.)):
                for openness in (0.,.15,.55,1.):
                    for variant in (0,3):
                        with self.subTest(species=species,detail=detail,openness=openness,variant=variant):
                            value=model(species,detail=detail,openness=openness,index=variant)
                            worst=(0.,None,None)
                            for index,s in enumerate(value.sections['flowers']):
                                error,uv=triangle_error(s)
                                if error>worst[0]:
                                    worst=error,index,uv
                            self.assertLess(worst[0],.02*2.,(worst[1],worst[2],worst[0]/2))

    def test_lod_changes_samples_not_anatomy_and_27_head_mesh_fits_three_mb(self):
        for species in f.SPECIES:
            close=model(species,detail=1.)
            low=model(species,detail=.65)
            self.assertEqual(len(close.sections['flowers']),len(low.sections['flowers']))
            for a,b in zip(close.sections['flowers'],low.sections['flowers']):
                self.assertEqual(a.point(.73,.41),b.point(.73,.41))
                self.assertEqual(a.closed_point(.73,.41),b.closed_point(.73,.41))
            self.assertLess(len(g.encode_mesh(low)),len(g.encode_mesh(close))*.75)
        bouquet=g.Geometry()
        for index in range(27):
            angle=index*2.39996
            center=(.95*math.cos(angle),.2+index*.045,.95*math.sin(angle))
            f.add_flower(bouquet,'champagne_ranunculus',center,.48,(.96,.81,.68),index,
                         axis=g._unit((math.cos(angle),.7,math.sin(angle))),detail=.65,
                         openness=.45+.55*(index%5)/4)
        poses=[]
        mesh=g.encode_mesh(bouquet,growth=poses)
        self.assertLess(len(mesh),3_000_000)
        self.assertLess(12+(g.COUNT+len(poses))*14,3_000_000)
        self.assertEqual(len(bouquet.heads),27)

    def test_protocol_normals_and_seeded_reproducibility(self):
        state=random.getstate()
        for species in f.SPECIES:
            value=model(species,index=2,detail=.65)
            poses=[]
            first=g.encode_mesh(value,growth=poses)
            second=g.encode_mesh(model(species,index=2,detail=.65))
            self.assertEqual(hashlib.sha256(first).digest(),hashlib.sha256(second).digest())
            magic,vertices,indices=g.MESH_HEADER.unpack_from(first)
            self.assertEqual(magic,b'BFM1')
            self.assertEqual(len(poses),vertices)
            self.assertGreater(indices,100)
            growth=g.encode_growth([],value,mesh_poses=poses)
            self.assertEqual(g.GROWTH_HEADER.unpack_from(growth),(b'BFG1',0,vertices))
            for vertex in struct.iter_unpack('<9f',first[12:12+vertices*36]):
                self.assertTrue(all(math.isfinite(c) for c in vertex))
                self.assertAlmostEqual(sum(c*c for c in vertex[6:]),1.,delta=2e-6)
        self.assertEqual(random.getstate(),state)

    def test_invalid_inputs_do_not_append_partial_flowers(self):
        for kwargs in ({'species':'unknown'},{'radius':0},{'axis':(0.,0.,0.)},
                       {'openness':1.1},{'detail':0},{'color':(1.,-1.,.5)}):
            value=g.Geometry()
            args=dict(species='garden_rose',center=(0.,0.,0.),radius=1.,color=(.9,.8,.7))
            args.update(kwargs)
            with self.assertRaises(ValueError):
                f.add_flower(value,**args)
            self.assertEqual(value.sections['flowers'],[])
            self.assertEqual(value.heads,[])


if __name__=='__main__':
    unittest.main()
