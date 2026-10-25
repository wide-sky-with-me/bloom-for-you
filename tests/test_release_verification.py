"""Release marker and public-byte verification logic; no network or credentials."""
from pathlib import Path
import hashlib,io,json,sys,tempfile,unittest
from unittest.mock import patch
from urllib.parse import urlsplit
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts import verify_release as release

class Response(io.BytesIO):
    status=200

class ReleaseVerificationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.output=self.root/'report.json'
        self.revision='a'*40;self.calls=[]
        themes=('rose','tulip','hydrangea','wildflower','peony','lily','sunflower','calla')
        near=('champagne_ranunculus','garden_rose','anemone','sweet_pea')
        def item(key,close=False):
            name=('closeup-' if close else '')+key
            return {'id':key,'file':name+'.bin','surface':name+'.mesh','growth':name+'.growth','svg':name+'.svg'}
        self.manifest={'count':120000,'stride':11,'style':'natural-garden-v1',
                       'bouquets':[item(x) for x in themes],'closeups':[item(x,True) for x in near]}
        self.manifest_bytes=json.dumps(self.manifest).encode()
        (self.root/'assets').mkdir();(self.root/'assets/manifest.json').write_bytes(self.manifest_bytes)
        self.marker={'revision':self.revision,'assetVersion':7,'style':'natural-garden-v1',
                     'manifestSha256':hashlib.sha256(self.manifest_bytes).hexdigest()}
        self.tamper=None

    def fetch(self,request,timeout):
        name=urlsplit(request.full_url).path.removeprefix('/garden/')
        self.calls.append(name)
        if name=='release.json':return Response(json.dumps(self.marker).encode())
        if name=='assets/manifest.json':return Response(self.manifest_bytes)
        data=('fixture:'+name).encode();path=self.root/name
        path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
        return Response(data+b'changed' if name==self.tamper else data)

    def run_verifier(self):
        with patch.object(release,'urlopen',side_effect=self.fetch):
            return release.verify('https://example.test/garden/',self.revision,self.root,self.output)

    def test_exact_public_marker_manifest_and_all_resources_are_checked(self):
        result=self.run_verifier();self.assertEqual(result['status'],'passed')
        self.assertEqual(result['revision'],self.revision)
        self.assertIn('assets/rose.growth',self.calls)
        self.assertIn('assets/closeup-sweet_pea.mesh',self.calls)
        self.assertIn('vendor/three-0.186.1/LICENSE',self.calls)
        self.assertEqual(json.loads(self.output.read_text())['status'],'passed')

    def test_stale_public_revision_fails_before_any_asset(self):
        self.marker['revision']='b'*40
        with self.assertRaisesRegex(ValueError,'marker'):self.run_verifier()
        self.assertEqual(self.calls,['release.json'])
        self.assertEqual(json.loads(self.output.read_text())['status'],'failed')

    def test_public_manifest_must_match_both_marker_and_local_artifact(self):
        self.marker['manifestSha256']='0'*64
        with self.assertRaisesRegex(ValueError,'manifest'):self.run_verifier()
        self.assertEqual(self.calls,['release.json','assets/manifest.json'])

    def test_modified_public_module_is_rejected(self):
        self.tamper='app.js'
        with self.assertRaisesRegex(ValueError,'app.js'):self.run_verifier()
        self.assertEqual(json.loads(self.output.read_text())['status'],'failed')

    def test_short_or_nonhex_revision_is_not_accepted(self):
        with patch.object(release,'urlopen') as fetch:
            for bad in ('main','a'*7,'z'*40):
                with self.assertRaises(ValueError):release.verify('https://example.test/',bad,self.root,self.output)
            fetch.assert_not_called()

if __name__=='__main__':unittest.main()
