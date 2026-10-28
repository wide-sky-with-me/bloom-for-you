#!/usr/bin/env python3
"""Build the isolated layered letter garden, preserving the previous art sample.
Decision: .agents/notes/proposed/letter-garden/2026-10-26-layered-floral-choreography.md
"""
from __future__ import annotations
import argparse,json,os,shutil
from pathlib import Path
from studies.letter_bloom import build as previous

ROOT=Path(__file__).resolve().parents[2]
STUDY=Path(__file__).resolve().parent
ARTIFACTS=ROOT/'artifacts/letter-garden/2026-10-26'
digest=previous.digest


def check_freeze():
    previous.check_freeze()
    records=json.loads((ARTIFACTS/'baseline-hashes.json').read_text())
    for name,sha in records.items():
        path=ROOT/name
        if not path.is_file() or digest(path)!=sha:raise ValueError('Previous sample changed: '+name)


def build(output: Path,*,draft=False,release=False):
    """release=True publishes the site to ROOT/dist; the local study freeze lives in gitignored artifacts and is skipped."""
    output=output.resolve()
    if release:
        if draft:raise ValueError('A draft is never released')
        if output!=ROOT/'dist':raise ValueError('Releases are built only into dist')
    elif output==ROOT or output in ROOT.parents or (ROOT in output.parents and ARTIFACTS not in output.parents):
        raise ValueError('Output must be isolated from existing source and delivery')
    if any(part in ('baseline','baseline-source') for part in output.parts):raise ValueError('Frozen archive is not an output')
    if not release:check_freeze()
    assets=STUDY/'assets';catalog_path=assets/'catalog.json'
    catalog=json.loads(catalog_path.read_text(encoding='utf-8'))
    specimens=catalog.get('specimens',[])
    if not specimens or len({s['id'] for s in specimens})!=len(specimens):raise ValueError('A unique specimen catalog is required')
    if not draft and (len(specimens)<2 or catalog.get('visualPending')):raise ValueError('A single/pending specimen is private draft work, not the enriched deliverable')
    hashes=set()
    for specimen in specimens:
        path=previous.local_asset(assets,specimen['file']);previous.check_gltf(path,assets)
        if not all(specimen.get(k) for k in ('author','license','sourceURL','sha256')):raise ValueError('Missing specimen attribution')
        if digest(path)!=specimen['sha256']:raise ValueError('Specimen differs from its source: '+specimen['id'])
        hashes.add(specimen['sha256'])
        if specimen.get('motionFile'):
            motion=json.loads(previous.local_asset(assets,specimen['motionFile']).read_text())
            if motion.get('sourceSHA256')!=specimen['sha256']:raise ValueError('Motion map belongs to another model')
            mapping=motion.get('mapping',{})
            if mapping:
                binary=previous.local_asset(assets,mapping['file'])
                if mapping.get('sha256') and digest(binary)!=mapping['sha256']:raise ValueError('Motion mapping changed')
    if not draft and len(hashes)<2:raise ValueError('Cloned/recolored copies do not count as different flower silhouettes')
    site=STUDY/'site';runtime=('index.html','letter.css','app.js','garden-scene.js','petal-motion.js')
    for name in runtime:
        if not (site/name).is_file():raise ValueError('Implementation is not ready: '+name)
    if not (STUDY/'ASSET_PROVENANCE.md').is_file():raise ValueError('Current asset provenance is required')
    vendor=ROOT/'site/vendor/three-0.186.1';vendor_meta=json.loads((vendor/'metadata.json').read_text())
    for name,meta in vendor_meta['files'].items():
        if digest(vendor/name)!=meta['sha256']:raise ValueError('Pinned vendor mismatch: '+name)
    if release and output.exists():shutil.rmtree(output)
    output.mkdir(parents=True,exist_ok=True);managed=set()
    def copy(source,name):
        target=output/name
        if target.is_symlink() or not target.resolve().is_relative_to(output):raise ValueError('Output escapes via symlink: '+name)
        if name in managed and digest(source)!=digest(target):raise ValueError('Conflicting runtime file: '+name)
        target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target);managed.add(name)
    for name in runtime:copy(site/name,name)
    for folder,prefix in ((vendor,'vendor/three-0.186.1'),(ROOT/'studies/letter_bloom/vendor','vendor'),(assets,'assets')):
        for source in sorted(folder.rglob('*')):
            if source.is_file():copy(source,prefix+'/'+source.relative_to(folder).as_posix())
    for name in ('flower-song.woff2','FONT-LICENSE.txt'):copy(ROOT/'site/assets'/name,'assets/'+name)
    copy(ROOT/'site/gift.json','gift.json');copy(STUDY/'ASSET_PROVENANCE.md','ASSET_PROVENANCE.md')
    record={'prototype':not release,'name':'letter-garden','version':3,'revision':os.environ.get('BLOOM_BUILD_REVISION','local'),'specimens':[{'id':s['id'],'file':s['file'],'author':s['author'],'license':s['license'],'sha256':s['sha256']} for s in specimens],
            'visualPending':bool(catalog.get('visualPending')),'catalogSHA256':digest(catalog_path),'files':{name:digest(output/name) for name in sorted(managed)}}
    (output/'study.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');(output/'.nojekyll').touch()
    if not release:check_freeze()
    print('Built independent letter garden:',output,'specimens:',len(specimens),'files:',len(managed))
    return output


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,default=ARTIFACTS/'preview');parser.add_argument('--draft',action='store_true')
    parser.add_argument('--release',action='store_true',help='publish the live site into dist (used by the Pages workflow)')
    args=parser.parse_args();build(ROOT/'dist' if args.release else args.output,draft=args.draft,release=args.release)

if __name__=='__main__':main()
