import hashlib,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from studies.letter_garden import build as b

class GardenBuildTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/'project';self.root.mkdir();self.study=self.root/'studies/letter_garden';self.art=self.root/'artifacts/letter-garden/2026-10-26';self.output=self.art/'preview'
        for p in (self.study/'site',self.study/'assets',self.root/'site/assets',self.root/'site/vendor/three-0.186.1',self.root/'studies/letter_bloom/vendor/three-addons',self.art):p.mkdir(parents=True,exist_ok=True)
        self.patcher=patch.multiple(b,ROOT=self.root,STUDY=self.study,ARTIFACTS=self.art);self.patcher.start();self.addCleanup(self.patcher.stop)
        self.guard=patch.object(b.previous,'check_freeze');self.guard.start();self.addCleanup(self.guard.stop)
        old=self.root/'studies/letter_bloom/sentinel.txt';old.write_text('approved sample');self.old=old
        (self.art/'baseline-hashes.json').write_text(json.dumps({old.relative_to(self.root).as_posix():b.digest(old)}))
        for name in ('index.html','letter.css','app.js','garden-scene.js','petal-motion.js'):(self.study/'site'/name).write_text('fixture')
        for name in ('flower-song.woff2','FONT-LICENSE.txt'):(self.root/'site/assets'/name).write_text('fixture')
        (self.root/'site/gift.json').write_text('{}');(self.study/'ASSET_PROVENANCE.md').write_text('Fixture credits')
        vendor=self.root/'site/vendor/three-0.186.1';(vendor/'three.module.js').write_text('fixture');(vendor/'metadata.json').write_text(json.dumps({'files':{'three.module.js':{'sha256':b.digest(vendor/'three.module.js')}}}))
        specimens=[]
        for name in ('rose','orchid'):
            model=self.study/'assets'/f'{name}.gltf';model.write_text(json.dumps({'asset':{'version':'2.0'},'extras':name}))
            specimens.append({'id':name,'file':model.name,'author':'Fixture','license':'CC-BY-4.0','sourceURL':'https://example.test/'+name,'sha256':b.digest(model)})
        self.catalog={'schema':1,'visualPending':False,'specimens':specimens};self.save_catalog()
    def save_catalog(self):(self.study/'assets/catalog.json').write_text(json.dumps(self.catalog))
    def test_two_real_models_and_existing_operator_file(self):
        self.output.mkdir();(self.output/'operator.txt').write_text('keep')
        b.build(self.output);record=json.loads((self.output/'study.json').read_text())
        self.assertEqual(len(record['specimens']),2);self.assertEqual((self.output/'operator.txt').read_text(),'keep');self.assertTrue(record['prototype'])
        self.assertEqual(record['files']['assets/rose.gltf'],b.digest(self.output/'assets/rose.gltf'))
    def test_previous_sample_and_production_paths_are_readonly(self):
        for output in (self.root,self.root/'site',self.root/'studies/letter_bloom',self.art/'baseline'):
            with self.assertRaises(ValueError):b.build(output)
        self.old.write_text('changed')
        with self.assertRaisesRegex(ValueError,'Previous sample'):b.build(self.output)
    def test_pending_or_cloned_specimens_cannot_be_delivered(self):
        self.catalog['visualPending']=True;self.save_catalog()
        with self.assertRaisesRegex(ValueError,'private draft'):b.build(self.output)
        b.build(self.output,draft=True)
        self.catalog['visualPending']=False;self.catalog['specimens'][1].update(file='rose.gltf',sha256=self.catalog['specimens'][0]['sha256']);self.save_catalog()
        with self.assertRaisesRegex(ValueError,'Cloned'):b.build(self.output)
    def test_model_bytes_and_motion_binding_are_checked(self):
        (self.study/'assets/rose.gltf').write_text('{}')
        with self.assertRaisesRegex(ValueError,'differs'):b.build(self.output)
    def test_mapping_hash_and_source_identity_are_checked(self):
        self.catalog['specimens'][0]['motionFile']='rose-motion.json';self.save_catalog();motion=self.study/'assets/rose-motion.json'
        motion.write_text(json.dumps({'sourceSHA256':'0'*64}))
        with self.assertRaisesRegex(ValueError,'another model'):b.build(self.output)
        binary=self.study/'assets/parts.bin';binary.write_bytes(bytes([0,1]));motion.write_text(json.dumps({'sourceSHA256':self.catalog['specimens'][0]['sha256'],'mapping':{'file':'parts.bin','sha256':'0'*64}}))
        with self.assertRaisesRegex(ValueError,'mapping changed'):b.build(self.output)
    def test_release_targets_only_dist_and_needs_no_local_freeze(self):
        (self.art/'baseline-hashes.json').unlink();dist=self.root/'dist';dist.mkdir();(dist/'stale.txt').write_text('old gallery')
        b.build(dist,release=True);record=json.loads((dist/'study.json').read_text())
        self.assertFalse(record['prototype']);self.assertFalse((dist/'stale.txt').exists());self.assertTrue((dist/'index.html').is_file())
        for output in (self.output,self.root/'site'):
            with self.assertRaisesRegex(ValueError,'only into dist'):b.build(output,release=True)
        with self.assertRaisesRegex(ValueError,'never released'):b.build(dist,draft=True,release=True)
    def test_managed_symlink_cannot_overwrite_an_external_file(self):
        self.output.mkdir();outside=Path(self.tmp.name)/'outside';outside.mkdir();sentinel=outside/'rose.gltf';sentinel.write_text('keep');(self.output/'assets').symlink_to(outside,target_is_directory=True)
        with self.assertRaisesRegex(ValueError,'symlink'):b.build(self.output)
        self.assertEqual(sentinel.read_text(),'keep')

if __name__=='__main__':unittest.main()
