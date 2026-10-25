#!/usr/bin/env python3
"""Verify a deployed Pages artifact against the exact local release, without credentials."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import quote, urljoin
from urllib.request import Request, urlopen


def verify(url: str, revision: str, reference: Path, report_path: Path) -> dict:
    if not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise ValueError('Expected a complete Git commit SHA')
    base=url.rstrip('/')+'/'
    report={'url':base,'revision':revision,'resources':[],'status':'running'}
    def save():
        report_path.parent.mkdir(parents=True,exist_ok=True)
        report_path.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    def fetch(name):
        if name.startswith('/') or '..' in Path(name).parts:
            raise ValueError('Unexpected release resource path')
        request=Request(urljoin(base,quote(name,safe='/'))+'?release='+revision,
                        headers={'Cache-Control':'no-cache','User-Agent':'bloom-for-you-release-check/1'})
        with urlopen(request,timeout=90) as response:
            if response.status!=200:raise ValueError(f'{name}: HTTP {response.status}')
            return response.read()
    sha=lambda data:hashlib.sha256(data).hexdigest()
    try:
        release=json.loads(fetch('release.json'))
        if (release.get('revision')!=revision or release.get('assetVersion')!=7
                or release.get('style')!='natural-garden-v1'):
            raise ValueError('Public release marker is not the requested revision/style')
        remote_manifest=fetch('assets/manifest.json')
        expected=(reference/'assets/manifest.json').read_bytes()
        if sha(remote_manifest)!=release.get('manifestSha256') or remote_manifest!=expected:
            raise ValueError('Public manifest differs from the exact local release')
        manifest=json.loads(remote_manifest)
        if manifest.get('count')!=120000 or manifest.get('stride')!=11 or manifest.get('style')!='natural-garden-v1':
            raise ValueError('Unexpected public garden protocol')
        if {r['id'] for r in manifest['bouquets']}!={'rose','tulip','hydrangea','wildflower','peony','lily','sunflower','calla'}:
            raise ValueError('Incomplete public theme collection')
        if {r['id'] for r in manifest['closeups']}!={'champagne_ranunculus','garden_rose','anemone','sweet_pea'}:
            raise ValueError('Incomplete public close-up collection')
        names={'index.html','app.js','style.css','particles.js','botanical-garden.js','botanical-materials.js',
               'three-garden.js','three-materials.js','legacy-garden.js','prepare-client.js','prepare-data.js',
               'prepare-worker.js','surface-data.js','growth-data.js','gift.json','THIRD_PARTY_NOTICES.md',
               'assets/flower-song.woff2','assets/FONT-LICENSE.txt',
               'vendor/three-0.186.1/three.module.js','vendor/three-0.186.1/three.core.js',
               'vendor/three-0.186.1/LICENSE','vendor/three-0.186.1/metadata.json'}
        names.update('assets/'+item['id']+'-thumb.png' for item in manifest['bouquets'])
        for item in manifest['bouquets']+manifest['closeups']:
            for key in ('file','surface','growth','svg','thumbnail'):
                name=item.get(key)
                if not name:continue
                if Path(name).name!=name:raise ValueError('Non-flat asset path in verified manifest')
                names.add('assets/'+name)
        save()
        for name in sorted(names):
            data=fetch(name);local=(reference/name).read_bytes()
            if data!=local:raise ValueError(f'Public resource differs: {name}')
            report['resources'].append({'path':name,'sha256':sha(data),'bytes':len(data)})
            save();print('PASS:',name,flush=True)
        report.update(status='passed',manifestSha256=sha(remote_manifest));save()
        return report
    except Exception as exc:
        report.update(status='failed',error=str(exc));save();raise


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',required=True)
    parser.add_argument('--revision',required=True)
    parser.add_argument('--reference',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();result=verify(args.url,args.revision,args.reference,args.output)
    print('Verified public revision',result['revision'],'with',len(result['resources']),'identical resources')

if __name__=='__main__':main()
