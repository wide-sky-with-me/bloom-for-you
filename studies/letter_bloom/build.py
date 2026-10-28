#!/usr/bin/env python3
"""Assemble the isolated letter-as-bloom study without touching production files.

Decision: .agents/notes/implemented/letter-bloom/2026-10-26-letter-as-bloom.md
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import struct

ROOT=Path(__file__).resolve().parents[2]
STUDY=Path(__file__).resolve().parent
ARTIFACTS=ROOT/'artifacts/letter-bloom/2026-10-26'
VERSION='0.186.1'


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_freeze() -> None:
    freeze=ARTIFACTS/'baseline-hashes.json'
    if freeze.is_file():
        for name,expected in json.loads(freeze.read_text())['files'].items():
            path=ROOT/name
            if not path.is_file() or digest(path)!=expected:
                raise ValueError('Protected original input changed: '+name)


def local_asset(root: Path,name: str) -> Path:
    if not isinstance(name,str) or not name or '\\' in name or ':' in name:
        raise ValueError('Asset must be a local relative path')
    relative=PurePosixPath(name)
    if relative.is_absolute() or '..' in relative.parts:
        raise ValueError('Asset must stay inside the study assets')
    path=(root/name).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError('Missing or unsafe asset: '+name)
    return path


def check_gltf(path: Path,assets: Path) -> None:
    if path.suffix.lower()=='.glb':
        raw=path.read_bytes()
        if len(raw)<20 or struct.unpack_from('<4sII',raw)!=(b'glTF',2,len(raw)):
            raise ValueError('Invalid GLB header')
        length,kind=struct.unpack_from('<II',raw,12)
        if kind!=0x4E4F534A or 20+length>len(raw):
            raise ValueError('Missing GLB JSON chunk')
        document=json.loads(raw[20:20+length].rstrip(b' \x00'))
    elif path.suffix.lower()=='.gltf':
        document=json.loads(path.read_text(encoding='utf-8'))
    else:
        raise ValueError('Hero must be GLB or glTF')
    for record in document.get('buffers',[])+document.get('images',[]):
        uri=record.get('uri')
        if uri and not uri.startswith('data:'):
            # glTF URIs are relative to the model, not the document root.
            target=(path.parent/uri).resolve()
            if ':' in uri or '\\' in uri or not target.is_relative_to(assets.resolve()) or not target.is_file():
                raise ValueError('Hero references missing/nonlocal media: '+uri)


def build(output: Path,*,draft=False) -> Path:
    output=output.resolve()
    # Only the new artifact subtree may be a destination inside this checkout.
    if output==ROOT or output in ROOT.parents or (ROOT in output.parents and ARTIFACTS not in output.parents):
        raise ValueError('Output must be an isolated study artifact or an external directory')
    if any(part in ('baseline','baseline-source') for part in output.parts):
        raise ValueError('Frozen baseline is not a build destination')
    check_freeze()
    source=STUDY/'site'
    files=('index.html','letter.css','app.js','flower-scene.js')
    for name in files:
        if not (source/name).is_file():raise ValueError('Study implementation not ready: '+name)
    assets=STUDY/'assets';metadata=assets/'hero.json'
    if metadata.is_file():
        hero=json.loads(metadata.read_text(encoding='utf-8'))
    elif draft:
        hero={'kind':'pending','file':None,'status':'asset-pending'}
    else:
        raise ValueError('Hero choice/provenance is not ready; use --draft only for private layout work')
    if hero.get('kind')=='gltf':
        model=local_asset(assets,hero.get('file'))
        check_gltf(model,assets)
        if hero.get('sha256') and digest(model)!=hero['sha256']:
            raise ValueError('Hero bytes no longer match the attributed source')
        if hero.get('sizeBytes') and model.stat().st_size!=hero['sizeBytes']:
            raise ValueError('Hero byte count does not match provenance')
        if hero.get('licenseFile'):local_asset(assets,hero['licenseFile'])
        if not all(hero.get(key) for key in ('sourceURL','author','license')):
            raise ValueError('External hero needs sourceURL, author and license')
    elif hero.get('kind') not in ('original-surface','pending'):
        raise ValueError('Unknown hero asset kind')
    elif hero.get('kind')=='pending' and not draft:
        raise ValueError('Pending hero is not a deliverable')
    provenance=STUDY/'ASSET_PROVENANCE.md'
    if not provenance.is_file() and not draft:raise ValueError('Asset provenance is required')
    gift=json.loads((ROOT/'site/gift.json').read_text(encoding='utf-8'))
    if not all(isinstance(gift.get(k),str) and gift[k].strip() for k in ('recipient','salutation','signature')):
        raise ValueError('Gift text is incomplete')
    if not isinstance(gift.get('letter'),list) or not gift['letter'] or not all(isinstance(x,str) for x in gift['letter']):
        raise ValueError('Gift paragraphs are invalid')
    vendor=ROOT/'site/vendor'/('three-'+VERSION)
    manifest=json.loads((vendor/'metadata.json').read_text(encoding='utf-8'))
    for name in ('three.module.js','three.core.js','LICENSE'):
        if digest(vendor/name)!=manifest['files'][name]['sha256']:
            raise ValueError('Pinned Three integrity failed: '+name)
    output.mkdir(parents=True,exist_ok=True);managed=[]
    def copy(path,relative):
        target=output/relative
        if not target.resolve().is_relative_to(output) or target.is_symlink():
            raise ValueError('Output resource escapes artifact directory: '+relative)
        if relative in managed and digest(path)!=digest(target):
            raise ValueError('Conflicting managed resource: '+relative)
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(path,target);managed.append(relative)
    for name in files:copy(source/name,name)
    for name in ('three.module.js','three.core.js','LICENSE','metadata.json'):
        copy(vendor/name,'vendor/three-'+VERSION+'/'+name)
    for directory,prefix in ((STUDY/'vendor','vendor'),(assets,'assets')):
        if directory.is_dir():
            for path in sorted(directory.rglob('*')):
                if path.is_file():copy(path,prefix+'/'+path.relative_to(directory).as_posix())
    for name in ('flower-song.woff2','FONT-LICENSE.txt'):
        copy(ROOT/'site/assets'/name,'assets/'+name)
    copy(ROOT/'site/gift.json','gift.json')
    copy(ROOT/'THIRD_PARTY_NOTICES.md','THIRD_PARTY_NOTICES.md')
    if provenance.is_file():copy(provenance,'ASSET_PROVENANCE.md')
    if not metadata.is_file():
        (output/'assets/hero.json').write_text(json.dumps(hero,indent=2)+'\n');managed.append('assets/hero.json')
    record={'name':'letter-as-bloom','prototype':True,'productionUnchanged':True,
            'hero':hero,'files':{name:digest(output/name) for name in sorted(set(managed))}}
    (output/'study.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (output/'.nojekyll').touch();check_freeze()
    print('Built independent art study:',output)
    print('Hero kind:',hero['kind'],'managed files:',len(record['files']))
    return output


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ARTIFACTS/'preview')
    parser.add_argument('--draft',action='store_true',help='Private pending-asset layout only, never an accepted deliverable')
    args=parser.parse_args();build(args.output,draft=args.draft)

if __name__=='__main__':main()
