#!/usr/bin/env python3
"""Formal natural-garden assets; the original generator remains a legacy base.

Reuses the accepted study v4 flowers and thin botanical supports read-only.
Eight story ids retain their native hero flowers; manifests describe actual
arranged heads rather than assuming the legacy 36-head composition.

Decision: .agents/notes/proposed/floral-style/2026-10-25-natural-garden-release.md
"""
from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import replace
import json
import math
from pathlib import Path
import random

import generator as g
from studies.natural_garden.flowers import SPECIES,add_flower
from studies.natural_garden.arrangement import (
    LABELS,PALETTES,_stem,_small_sprigs,_linen_tie,build_single,
)

COUNT=g.COUNT
STRIDE=g.STRIDE
SEED=g.SEED
Geometry=g.Geometry
encode_particles=g.encode_particles
encode_mesh=g.encode_mesh
encode_growth=g.encode_growth
render_svg=g.render_svg
STYLE='natural-garden-v1'
CLOSEUP_COUNT=16_000
_IDS=tuple(item['id'] for item in g.BOUQUETS)
_REPLACE={'rose':'garden_rose','ranunculus':'champagne_ranunculus',
          'lisianthus':'anemone','cosmos':'sweet_pea','dahlia':'cosmos'}
_DESCRIPTIONS={
    'rose':'粉色花园玫瑰与香槟洋牡丹层叠，银莲花、蝶形香豌豆与细弯枝叶环绕相拥。',
    'tulip':'奶油粉郁金香保留六瓣杯形，与洋牡丹、花园玫瑰和黑心银莲花前后交错。',
    'hydrangea':'雾蓝绣球大花头围成完整花冠，间有花园玫瑰、洋牡丹和轻盈的蝶形配花。',
    'wildflower':'花园玫瑰、洋牡丹、波斯菊与黑心银莲花高低错落，香豌豆与细枝自然外伸。',
    'peony':'绯粉牡丹与花园玫瑰、洋牡丹相拥，波斯菊和少片宽瓣银莲花织成完整花冠。',
    'lily':'反卷奶油百合和金色花药映衬花园玫瑰、洋牡丹，蝶形配花穿插细叶弯茎。',
    'sunflower':'金色向日葵保留射线花瓣与深色花盘，交错波斯菊、洋牡丹和轻盈配花。',
    'calla':'月白马蹄莲的卷曲佛焰苞与花园玫瑰、洋牡丹前后围合，细枝小花从间隙探出。',
}
BOUQUETS=tuple(dict(item,description=_DESCRIPTIONS[item['id']]) for item in g.BOUQUETS)
_CLOSEUP_DESCRIPTIONS={
    'champagne_ranunculus':'宽圆薄瓣沿着花心包抱，香槟色与不等的轻褶慢慢展开。',
    'garden_rose':'层叠花心与圆肩外瓣，几处轻轻翻起的瓣缘。',
    'anemone':'少片奶白宽瓣之间，凸起的深色花心和细小花药。',
    'sweet_pea':'向上的旗瓣、两侧翼瓣和舟形龙骨，形成轻盈蝶形花脸。',
}


def _base_heads(bouquet_id: str) -> list[g.FlowerHead]:
    if bouquet_id not in _IDS:
        raise ValueError(f'Unknown bouquet id: {bouquet_id}')
    result=[]
    for head in g._arrange_heads(bouquet_id):
        # Keep the established outward crown and hero directions, but open its
        # hidden inner tier instead of packing extra oversized opaque blossoms.
        if head.layer=='inner':
            continue
        # Dense native clusters spend more geometry per head. Six full-size
        # native anchors remain; remove secondary copies, not their detail.
        if bouquet_id in ('hydrangea','peony') and head.species==bouquet_id and head.radius<.65:
            continue
        result.append(replace(head,species=_REPLACE.get(head.species,head.species)))
    if bouquet_id=='hydrangea':
        # One light butterfly face offsets the exceptionally dense native heads;
        # preserve their six hero clusters and every retained petal's LOD.
        for index in range(len(result)-1,-1,-1):
            if result[index].species=='anemone' and result[index].layer in ('middle','top'):
                result[index]=replace(result[index],species='sweet_pea')
                break
        # Five axial rows for all native florets would otherwise cost 3,105,288
        # bytes. Remove one real pair of secondary roses, never a native anchor.
        drop=set([i for i,h in enumerate(result) if h.species=='garden_rose' and h.radius<.65][-2:])
        result=[h for i,h in enumerate(result) if i not in drop]
    if bouquet_id=='peony':
        target=8*math.tau/12
        candidates=[i for i,h in enumerate(result) if h.species=='cosmos' and h.layer=='middle'
                    and .1<h.axis[0]*math.sin(target)+h.axis[2]*math.cos(target)<.6]
        if candidates:
            index=max(candidates,key=lambda i:result[i].axis[0]*math.sin(target)+result[i].axis[2]*math.cos(target))
            head=result[index]
            c,s=math.cos(math.radians(4)),math.sin(math.radians(4))
            x,y,z=head.axis
            result[index]=replace(head,axis=(x*c-z*s,y,x*s+z*c))
    return result


_BALANCED_THEMES=set(_IDS)


def _balanced_heads(theme,base):
    counts=Counter(h.species for h in base)
    odd=[kind for kind,n in counts.items() if n%2]
    center=next((kind for kind in ('champagne_ranunculus','garden_rose') if kind in odd),odd[0])
    if center=='sweet_pea':
        counts['sweet_pea']-=1;counts['champagne_ranunculus']+=1
        center='champagne_ranunculus'
    while True:
        other=[kind for kind,n in counts.items() if n%2 and kind!=center]
        if not other:break
        donor=next((kind for kind in ('sweet_pea','cosmos') if kind in other),other[-1])
        receiver=next(kind for kind in other if kind!=donor)
        counts[donor]-=1;counts[receiver]+=1
    pairs={kind:(n-(1 if kind==center else 0))//2 for kind,n in counts.items()}
    primary=_REPLACE.get(theme,theme)
    hero=(['garden_rose','champagne_ranunculus','cosmos'] if theme=='wildflower' else [primary]*3)
    for kind in hero:pairs[kind]-=1
    priority=list(dict.fromkeys(kind for kind in ('garden_rose','champagne_ranunculus',primary,
                                                  'cosmos','anemone','sweet_pea') if kind in pairs))
    cursor=0
    def take():
        nonlocal cursor
        for _ in range(len(priority)):
            kind=priority[cursor%len(priority)];cursor+=1
            if pairs[kind]>0:
                pairs[kind]-=1
                return kind
        raise ValueError('Unbalanced flower-pair inventory')
    result=[]
    phase=.22+_IDS.index(theme)*.11
    middle_pairs=5 if len(base)==27 else 6
    top_pairs=(len(base)-1)//2-6-middle_pairs
    for layer,n,radial,height,tilt in (('outer',6,1.18,.64,.24),
                                      ('middle',middle_pairs,.98,1.44,.52),
                                      ('top',top_pairs,.55,2.06,1.02)):
        for j in range(n):
            angle=phase+j*math.pi/n+(.0 if layer=='outer' else .13)
            anchor=layer=='outer' and j%2==0
            kind=hero[j//2] if anchor else take()
            radius=(.68 if anchor else .31 if kind=='sweet_pea' else
                    .45 if kind in ('anemone','cosmos') else .51)
            reach=radial+.025*math.sin(j*1.7)
            y=height+.065*math.sin(j*2.1)
            for sign in (1,-1):
                center_point=(sign*reach*math.cos(angle),y,sign*reach*math.sin(angle))
                axis=g._unit((sign*math.cos(angle),tilt,sign*math.sin(angle)))
                result.append(g.FlowerHead(kind,center_point,axis,radius,layer))
    result.append(g.FlowerHead(center,(0.,1.36,0.),(0.,1.,0.),.53,'support'))
    if any(pairs.values()):raise ValueError('Unused flower pairs')
    return result


def arrange_heads(bouquet_id: str) -> list[g.FlowerHead]:
    base=_base_heads(bouquet_id)
    return _balanced_heads(bouquet_id,base) if bouquet_id in _BALANCED_THEMES else base


def _head_seed(theme,index):
    return index//2 if theme in _BALANCED_THEMES else index


def _head_color(theme,species,index):
    base=g._THEME_COLORS[theme]
    if index%9==8:
        return (.97,.93,.84)
    if species=='sweet_pea':
        return g._mix(base,(.88,.83,.87),.28)
    return g._mix(base,(.98,.92,.83),.12+.045*(index%3))


def _native_flower(head,color,index):
    native=g.Geometry()
    g._add_head(native,head,color,index)
    original=native.sections['flowers']
    if head.species=='hydrangea':
        # A real, airier cluster: sixty complete native four-petal florets, not
        # discarded petal strips. Keep the same six full-radius hero clusters.
        florets=len(original)//5
        selected={round(j*(florets-1)/59) for j in range(60)}
        original=[s for j,s in enumerate(original) if j//5 in selected]
    weight_scale=(head.radius**2/sum(s.weight for s in original) if head.species=='hydrangea' else 1.)
    surfaces=[]
    for petal,surface in enumerate(original):
        steps=surface.mesh_steps
        # Measured fixed-diagonal interpolation, not a blanket polygon budget.
        # Native florets, disk endpoints and reflexed lilies need distinct grids.
        if head.species=='cosmos':
            steps=(10,12) if petal<9 else (12,16)
        elif head.species=='hydrangea' and surface.kind=='sheet' and steps!=(1,4):
            steps=(5,2)
        elif head.species=='lily' and petal<6:
            steps=(10,6) if head.radius>=.65 else (12,6)
        elif head.species=='calla' and petal==0:
            steps=(max(14,steps[0]),steps[1])
        surfaces.append(replace(surface,mesh_steps=steps,weight=surface.weight*weight_scale))
    return surfaces


def _release_sprigs(model):
    starts={key:len(surfaces) for key,surfaces in model.sections.items()}
    _small_sprigs(model)
    def scale(point):
        def mapped(u,v):
            x,y,z=point(u,v)
            return .7*x,.5+.7*(y-.5),.7*z
        return mapped
    for key,surfaces in model.sections.items():
        for index in range(starts[key],len(surfaces)):
            surface=surfaces[index]
            surfaces[index]=replace(surface,point=scale(surface.point),
                                     closed_point=scale(surface.closed_point) if surface.closed_point else None)


def _build_geometry(bouquet_id: str) -> g.Geometry:
    model=g.Geometry()
    for index,head in enumerate(arrange_heads(bouquet_id)):
        seed_index=_head_seed(bouquet_id,index)
        color=_head_color(bouquet_id,head.species,seed_index)
        if head.species in SPECIES:
            openness=(1. if head.radius>=.65 or head.layer=='support' else
                      .65 if seed_index%9==8 else .87+.13*(seed_index%4)/3)
            first=len(model.sections['flowers'])
            add_flower(model,head.species,head.center,head.radius,color,seed_index,
                       axis=head.axis,openness=openness,detail=.65)
            if head.species=='garden_rose':
                for j in range(first+22,len(model.sections['flowers'])):
                    s=model.sections['flowers'][j]
                    model.sections['flowers'][j]=replace(s,mesh_steps=(max(9,s.mesh_steps[0]),s.mesh_steps[1]))
        else:
            # Retain only flower anatomy, with measured native-petal detail;
            # discard legacy coarse supports in favor of the study stems below.
            model.sections['flowers'].extend(_native_flower(head,color,seed_index))
            model.heads.append(head)
        _stem(model,head.center,head.axis,head.radius,index)
    _release_sprigs(model)
    _linen_tie(model)
    return model


def _sample_geometry(model,count,seed,with_growth=True):
    if count<1:
        raise ValueError('Point count must be positive')
    rng=random.Random(seed)
    active=[(key,surfaces) for key,surfaces in model.sections.items() if surfaces]
    shares={'flowers':.91,'leaves':.055,'stems':.025,'ribbon':.01}
    budgets=g._allocate(count,[shares[key] for key,_ in active])
    particles=[];poses=[]
    for (_,surfaces),budget in zip(active,budgets):
        for surface,n in zip(surfaces,g._allocate(budget,[s.weight for s in surfaces])):
            for u,v in g._stratified_uv(n,rng):
                p=surface.point(u,v)
                normal=g._surface_normal(surface,u,v)
                pigment=g._surface_color(surface,u,v)
                size=max(.6,min(1.8,surface.size))
                particles.append((*p,*pigment,size,rng.random()*6.,*normal))
                if with_growth:
                    poses.append(g._growth_pose(surface,u,v,(*p,*normal)))
    order=list(range(count));rng.shuffle(order)
    return [particles[i] for i in order],([poses[i] for i in order] if with_growth else [])


def generate_bouquet(bouquet_id: str,count: int=COUNT):
    return _sample_geometry(_build_geometry(bouquet_id),count,SEED+_IDS.index(bouquet_id)*7919,False)[0]


def generate_bouquet_with_growth(bouquet_id: str,count: int=COUNT):
    return _sample_geometry(_build_geometry(bouquet_id),count,SEED+_IDS.index(bouquet_id)*7919,True)


def _composition(heads):
    return [{'species':species,'count':count} for species,count in Counter(h.species for h in heads).items()]


def _emit(model,output,stem,title,description,count,seed,include_growth):
    particles,poses=_sample_geometry(model,count,seed,include_growth)
    (output/f'{stem}.bin').write_bytes(g.encode_particles(particles))
    mesh_poses=[]
    (output/f'{stem}.mesh').write_bytes(g.encode_mesh(model,growth=mesh_poses if include_growth else None))
    if include_growth:
        (output/f'{stem}.growth').write_bytes(g.encode_growth(poses,model,mesh_poses=mesh_poses))
    (output/f'{stem}.svg').write_text(g.render_svg(particles,title,description,model),encoding='utf-8')
    return dict(file=f'{stem}.bin',surface=f'{stem}.mesh',svg=f'{stem}.svg',
                **({'growth':f'{stem}.growth'} if include_growth else {}))


def generate_assets(output: str|Path=Path('site/assets'),*,include_growth=True):
    output=Path(output)
    output.mkdir(parents=True,exist_ok=True)
    manifest={'version':2,'count':COUNT,'stride':STRIDE,'style':STYLE,
              'defaultBouquet':'rose','bouquets':[],'closeups':[]}
    for index,item in enumerate(BOUQUETS):
        model=_build_geometry(item['id'])
        paths=_emit(model,output,item['id'],item['title'],item['description'],COUNT,
                    SEED+index*7919,include_growth)
        manifest['bouquets'].append(dict(item,**paths,headCount=len(model.heads),
                                          composition=_composition(model.heads)))
    for index,species in enumerate(SPECIES):
        model=build_single(species,detail=1.5)
        paths=_emit(model,output,f'closeup-{species}',LABELS[species],_CLOSEUP_DESCRIPTIONS[species],
                    CLOSEUP_COUNT,20261025+(index+1)*7919,include_growth)
        manifest['closeups'].append(dict(id=species,title=LABELS[species],
                                          description=_CLOSEUP_DESCRIPTIONS[species],
                                          pointCount=CLOSEUP_COUNT,**paths))
    (output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return manifest


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=Path('site/assets'),metavar='PATH')
    parser.add_argument('--without-growth',action='store_true')
    args=parser.parse_args(argv)
    result=generate_assets(args.output,include_growth=not args.without_growth)
    print(f"已生成 {len(result['bouquets'])} 束自然花园与 {len(result['closeups'])} 个近景：{args.output.resolve()}")
    return 0


if __name__=='__main__':
    raise SystemExit(main())
