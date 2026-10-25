"""Small independent study-pipeline checks, not a rerun of the accepted gallery."""
from pathlib import Path
import json,random,struct,sys,tempfile,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import generator as g
from studies.natural_garden import build as b
from studies.natural_garden.arrangement import HEADS,composition

class NaturalGardenBuildTests(unittest.TestCase):
    def model(self):
        model=g.Geometry()
        model.add('flowers',1,lambda u,v:(u-.5,v-.5,.1*u*v),(.8,.6,.5),
                  mesh_steps=(5,5),closed_point=lambda u,v:((u-.5)*.2,(v-.5)*.2,.15*u),growth_delay=.2)
        return model

    def test_sampler_is_deterministic_and_leaves_global_rng_untouched(self):
        before=random.getstate();a=b.sample_geometry(self.model(),128,42)
        self.assertEqual(a,b.sample_geometry(self.model(),128,42))
        self.assertEqual(before,random.getstate())
        self.assertEqual((len(a[0]),len(a[1])),(128,128))
        self.assertTrue(all(len(row)==11 for row in a[0]))
        self.assertTrue(all(0<=row[7]<6.0 for row in a[0]))
        self.assertNotEqual(a,b.sample_geometry(self.model(),128,43))

    def test_sampler_rejects_nonpositive_counts(self):
        for count in (0,-1):
            with self.assertRaises(ValueError):b.sample_geometry(self.model(),count,42)

    def test_emitted_point_mesh_growth_counts_remain_bound(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder);entry=b.emit(self.model(),path,'fixture','标题','说明',128,42)
            self.assertEqual((path/'fixture.bin').stat().st_size,128*11*4)
            magic,vertices,indices=struct.unpack('<4sII',(path/'fixture.mesh').read_bytes()[:12])
            self.assertEqual(magic,b'BFM1');self.assertGreater(vertices,3);self.assertEqual(indices%3,0)
            self.assertEqual(struct.unpack('<4sII',(path/'fixture.growth').read_bytes()[:12]),(b'BFG1',128,vertices))
            self.assertEqual((path/'fixture.growth').stat().st_size,12+(128+vertices)*14)
            self.assertEqual(entry['meshVertices'],vertices)
            for suffix in ('mesh','growth'):self.assertLess(entry['bytes'][suffix],3000000)

    def test_composition_describes_actual_new_heads_not_original_theme_count(self):
        self.assertEqual(sum(x['count'] for x in composition()),len(HEADS))
        self.assertEqual(len(HEADS),27)
        self.assertEqual({x['species'] for x in composition()},{x[0] for x in HEADS})
        self.assertGreater(len({x[4] for x in HEADS}),5)

    def test_study_builder_refuses_live_source_and_archive_outputs(self):
        for path in (b.ROOT,b.ROOT/'site',b.ROOT/'dist',b.ROOT/'studies',
                     b.ROOT/'artifacts/three-refactor',
                     b.ROOT/'artifacts/natural-garden-study/2026-10-25/baseline'):
            with self.subTest(path=path),self.assertRaises(ValueError):b.build(path)

if __name__=='__main__':unittest.main()
