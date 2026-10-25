"""Build only the approved independent study, never the eight-theme distribution."""
from __future__ import annotations
import argparse
import hashlib
import json
import random
import shutil
import struct
from pathlib import Path
import generator as g
from .arrangement import LABELS, build_bouquet, build_single, composition

ROOT=Path(__file__).resolve().parents[2]
STUDY=Path(__file__).resolve().parent
DEFAULT=ROOT/'artifacts/natural-garden-study/2026-10-25/preview'


def sample_geometry(model,count,seed):
    if count<1:raise ValueError('Point count must be positive')
    rng=random.Random(seed)
    active=[(key,surfaces) for key,surfaces in model.sections.items() if surfaces]
    shares={'flowers':.91,'leaves':.055,'stems':.025,'ribbon':.01}
    budgets=g._allocate(count,[shares[key] for key,_ in active])
    particles=[];poses=[]
    for (_,surfaces),budget in zip(active,budgets):
        for surface,n in zip(surfaces,g._allocate(budget,[s.weight for s in surfaces])):
            for u,v in g._stratified_uv(n,rng):
                p=surface.point(u,v);normal=g._surface_normal(surface,u,v)
                pigment=g._surface_color(surface,u,v)
                # No travelling stars; these records describe the actual specimen.
                particles.append((*p,*pigment,surface.size,rng.random()*6.0,*normal))
                poses.append(g._growth_pose(surface,u,v,(*p,*normal)))
    order=list(range(count));rng.shuffle(order)
    return [particles[i] for i in order],[poses[i] for i in order]


def emit(model,path,key,title,description,count,seed):
    particles,poses=sample_geometry(model,count,seed)
    mesh_poses=[]
    payloads={'bin':g.encode_particles(particles),'mesh':g.encode_mesh(model,growth=mesh_poses),
              'growth':g.encode_growth(poses,model,mesh_poses=mesh_poses)}
    hashes={}
    for suffix,data in payloads.items():
        filename=f'{key}.{suffix}';(path/filename).write_bytes(data)
        hashes[filename]=hashlib.sha256(data).hexdigest()
    vertices,indices=struct.unpack_from('<II',payloads['mesh'],4)
    return {'id':key,'title':title,'description':description,'pointCount':count,
            'file':f'{key}.bin','surface':f'{key}.mesh','growth':f'{key}.growth',
            'meshVertices':vertices,'triangles':indices//3,'hashes':hashes,
            'bytes':{suffix:len(data) for suffix,data in payloads.items()}}


def build(output=DEFAULT,only=None):
    output=Path(output).resolve()
    # An isolated study output must not overwrite live source or accepted archives.
    protected=[ROOT/'site',ROOT/'dist',ROOT/'studies',ROOT/'artifacts/three-refactor',
               ROOT/'artifacts/natural-garden-study/2026-10-25/baseline',
               ROOT/'artifacts/natural-garden-study/2026-10-25/baseline-source']
    if output==ROOT or output in ROOT.parents or any(output==p or p in output.parents or output in p.parents for p in protected):
        raise ValueError('Study output overlaps protected source/distribution/archive')
    output.mkdir(parents=True,exist_ok=True)
    inputs={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(STUDY.rglob('*')) if p.is_file() and '__pycache__' not in p.parts}
    for p in (STUDY/'site').iterdir():
        if p.is_file():shutil.copy2(p,output/p.name)
    engine=output/'engine';engine.mkdir(exist_ok=True)
    for name in ('three-garden.js','three-materials.js','legacy-garden.js','prepare-client.js','prepare-data.js','prepare-worker.js','surface-data.js','growth-data.js'):
        shutil.copy2(ROOT/'site'/name,engine/name)
    shutil.copytree(ROOT/'site/vendor',engine/'vendor',dirs_exist_ok=True)
    assets=output/'assets';assets.mkdir(exist_ok=True)
    for name in ('flower-song.woff2','FONT-LICENSE.txt'):
        shutil.copy2(ROOT/'site/assets'/name,assets/name)
    shutil.copy2(ROOT/'THIRD_PARTY_NOTICES.md',output/'THIRD_PARTY_NOTICES.md')
    keys=['bouquet',*LABELS]
    if only:
        if any(key not in keys for key in only):raise ValueError('Unknown study specimen')
        keys=[key for key in keys if key in only]
    entries=[]
    for i,key in enumerate(keys):
        model=build_bouquet() if key=='bouquet' else build_single(key)
        title='奶油香槟的花园' if key=='bouquet' else LABELS[key]
        descriptions={'bouquet':'把盛开、半开与花苞，放在同一阵温柔的风里。',
                      'champagne_ranunculus':'圆瓣轻轻卷抱，香槟色由花心慢慢铺开。',
                      'garden_rose':'深一些的花心，与轻轻翻起的外瓣。',
                      'anemone':'奶白宽瓣之间，留一枚深色花心。',
                      'sweet_pea':'不一样的蝶形花脸，轻一些，也自在一些。'}
        entry=emit(model,assets,key,title,descriptions[key],120000 if key=='bouquet' else 16000,20261025+['bouquet',*LABELS].index(key)*7919)
        if key=='bouquet':entry['composition']=composition()
        entries.append(entry)
        print(key,entry['bytes'],flush=True)
    manifest={'version':1,'study':'natural-garden','stride':11,'defaultId':'bouquet' if 'bouquet' in keys else keys[0],
              'specimens':entries,'scope':'Independent prototype; accepted gallery unchanged',
              'originalPreview':'http://127.0.0.1:8911/'}
    (assets/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    current={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()
             for p in sorted(STUDY.rglob('*')) if p.is_file() and '__pycache__' not in p.parts}
    if current!=inputs:raise RuntimeError('Study source changed during build; freeze writers and rebuild')
    (output/'study-inputs.json').write_text(json.dumps(inputs,indent=2)+'\n')
    print('Built isolated study:',output)
    return manifest


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=DEFAULT)
    parser.add_argument('--only',nargs='+')
    args=parser.parse_args();build(args.output,args.only)
