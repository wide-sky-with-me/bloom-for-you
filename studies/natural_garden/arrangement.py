"""Original botanical study composition, separate from the accepted generator presets.

Decision: .agents/notes/proposed/floral-style/2026-10-25-natural-garden-study.md
"""
from __future__ import annotations
from collections import Counter
from dataclasses import replace
import math
import generator as g
from .flowers import add_flower

LABELS = {'champagne_ranunculus': '洋牡丹', 'garden_rose': '花园玫瑰',
          'anemone': '银莲花', 'sweet_pea': '香豌豆'}
PALETTES = {
    'champagne_ranunculus': ((.90,.69,.55),(.93,.74,.65),(.86,.58,.55),(.94,.83,.67)),
    'garden_rose': ((.91,.76,.70),(.93,.84,.73),(.86,.66,.65)),
    'anemone': ((.93,.87,.80),(.87,.82,.86),(.94,.82,.77)),
    'sweet_pea': ((.77,.72,.81),(.89,.78,.82),(.92,.87,.82)),
}
# Deliberately non-ring positions: low drooping faces, tall half-open heads,
# substantial front flowers and a real back/side, rather than a copied front card.
HEADS = (
    ('champagne_ranunculus',(-.98,1.15,.70),.64,(-.12,.20,1),1.0),
    ('champagne_ranunculus',(-.12,1.65,.70),.56,(.10,.32,1),.85),
    ('champagne_ranunculus',(.80,1.12,.72),.59,(.28,-.05,.96),1.0),
    ('champagne_ranunculus',(-.38,.57,.95),.54,(-.25,-.19,.96),.91),
    ('champagne_ranunculus',(.43,.08,.78),.49,(.38,-.29,.87),.78),
    ('champagne_ranunculus',(-1.42,.65,.12),.43,(-.73,.10,.67),.73),
    ('champagne_ranunculus',(1.42,1.62,-.15),.43,(.69,.43,.55),.61),
    ('champagne_ranunculus',(-.92,2.05,-.18),.40,(-.45,.58,.68),.79),
    ('champagne_ranunculus',(.08,2.30,-.30),.41,(.10,.68,.72),.62),
    ('champagne_ranunculus',(.64,1.99,-.16),.43,(.42,.57,.70),1.0),
    ('champagne_ranunculus',(.96,.44,-.06),.44,(.74,-.22,.63),.90),
    ('champagne_ranunculus',(-.88,.02,.15),.40,(-.34,-.54,.77),.69),
    ('garden_rose',(-.28,1.07,-.26),.56,(-.06,.18,-.98),.96),
    ('garden_rose',(.94,.82,-.54),.55,(.54,.13,-.83),.91),
    ('garden_rose',(-1.03,.91,-.60),.55,(-.52,.24,-.82),1.0),
    ('garden_rose',(.31,1.73,-.63),.49,(.23,.51,-.83),.80),
    ('garden_rose',(.08,.37,-.49),.52,(.02,-.21,-.98),.88),
    ('garden_rose',(1.44,1.03,.12),.40,(.78,.06,.62),.96),
    ('anemone',(-1.26,1.78,.35),.33,(-.35,.25,.90),1.0),
    ('anemone',(.99,1.95,.30),.33,(.25,.35,.90),.92),
    ('anemone',(-1.02,.24,.68),.30,(-.17,-.31,.94),1.0),
    ('anemone',(1.13,.14,.59),.31,(.35,-.22,.91),.88),
    ('anemone',(-.32,1.45,-.89),.33,(-.21,.33,-.92),.95),
    ('sweet_pea',(-1.63,1.25,-.20),.31,(-.55,.30,.78),.95),
    ('sweet_pea',(1.63,.48,.14),.29,(.61,.16,.77),1.0),
    ('sweet_pea',(-.71,2.48,-.33),.25,(-.29,.55,.78),.81),
    ('sweet_pea',(.82,2.55,-.10),.25,(.21,.49,.85),.92),
)


def _leaf(model, start, end, width, phase, color=(.32,.43,.32)):
    axis = tuple(b-a for a,b in zip(start,end))
    side = g._unit(g._cross(axis,(.17,.12,1)))
    normal = g._unit(g._cross(side,axis))
    def point(u,v):
        q=2*v-1
        # One soft midrib, not stacked corrugated/fern-like plates.
        outline=math.sin(math.pi*u)**.82
        bend=width*(.19*(1-q*q)*math.sin(math.pi*u)+.15*u*u)
        bend+=width*.045*math.sin(2.2*math.pi*u+phase)*q*math.sin(math.pi*u)
        return g._add(g._add(start,g._mul(axis,u)),g._add(g._mul(side,width*q*outline),g._mul(normal,bend)))
    def pigment(u,v):
        mid=math.exp(-abs(2*v-1)*32)
        return g._mix(color,(.45,.54,.38),.08*mid+.025*math.sin(math.pi*u))
    model.add('leaves',width*math.dist(start,end),point,pigment,.65,mesh_steps=(9,6))


def _stem(model, center, axis, radius, index):
    root=g._add(center,g._mul(g._unit(axis),-radius*.18))
    angle=index*2.399963
    start=(.09*math.cos(angle),-1.95+.05*math.sin(angle),.08*math.sin(angle))
    curve=g._bezier(start,(start[0]+.10*math.sin(angle),-.85,start[2]),
                    (root[0]*.83,root[1]-.42,root[2]-.08),root)
    g._tube(model,'stems',curve,.012 if radius<.36 else .016,
            (.30,.39,.25),.07,.65)
    model.sections['stems'][-1]=replace(model.sections['stems'][-1],mesh_steps=(12,6))
    if index%2==0:
        base=curve(.62)
        side=-1 if index%4 else 1
        tip=(base[0]+side*(.31+.07*math.sin(angle)),base[1]+.35,base[2]+.06*math.cos(angle))
        _leaf(model,base,tip,.075 if radius<.4 else .11,angle)


def _small_sprigs(model):
    for branch,(side,height,z) in enumerate(((-1,2.25,-.40),(1,2.53,-.48),(-1,1.20,-.72))):
        start=(side*.30,-.62,z*.45)
        end=(side*(1.45+.14*branch),height,z)
        curve=g._bezier(start,(side*.67,.2,z),(side*1.2,height-.22,z),end)
        g._tube(model,'stems',curve,.007,(.34,.43,.30),.025,.55)
        model.sections['stems'][-1]=replace(model.sections['stems'][-1],mesh_steps=(12,5))
        for i in range(5):
            t=.53+i*.105
            p=curve(t)
            tip=(p[0]+side*(.12+.035*math.sin(i+branch)),p[1]+.09,p[2]+.07*math.cos(i*2))
            g._tube(model,'stems',g._bezier(p,p,tip,tip),.003,(.39,.47,.33),.005,.45)
            # Small, distinct four-petal sprig flowers; not labelled as larkspur.
            first=len(model.sections['flowers'])
            g._floret(model,tip,g._unit((side*.3,.4,.85)),.046+.006*(i%2),(.85,.83,.82),i+branch*7)
            for j in range(first,len(model.sections['flowers'])):
                s=model.sections['flowers'][j]
                model.sections['flowers'][j]=replace(s,weight=s.weight*.18,mesh_steps=(4,4) if s.kind=='sheet' else (3,5))


def _linen_tie(model):
    # A quiet soft tie and narrow tails, not the old oversized angular bow.
    def band(u,v):
        a=g.TAU*u
        return (.14*math.cos(a),-1.29+.085*(v-.5)+.025*math.sin(a),.10*math.sin(a))
    model.add('ribbon',.06,band,(.71,.65,.52),.6,mesh_steps=(28,3))
    for sign in (-1,1):
        def tail(u,v,sign=sign):
            q=2*v-1
            return (sign*(.055+.17*u)+q*.045*(1-.2*u),
                    -1.31-.51*u+.025*math.cos(q*math.pi)*u,
                    .10+.07*math.sin(u*math.pi)+q*.02*math.sin(u*4))
        model.add('ribbon',.035,tail,(.75,.70,.58),.6,mesh_steps=(12,5))


def build_bouquet(detail=.65):
    model=g.Geometry()
    for index,(species,center,radius,axis,openness) in enumerate(HEADS):
        palette=PALETTES[species]
        add_flower(model,species,center,radius,palette[index%len(palette)],index,
                   axis=g._unit(axis),openness=openness,detail=detail)
        _stem(model,center,axis,radius,index)
    _small_sprigs(model)
    _linen_tie(model)
    return model


def build_single(species, detail=1.5):
    if species not in LABELS:
        raise ValueError('Unknown study flower')
    model=g.Geometry()
    # Large enough to genuinely inspect curves with the retained 6.8 camera.
    add_flower(model,species,(0,0,0),1.80,PALETTES[species][0],0,
               axis=(0,0,1),openness=1,detail=detail)
    return model


def composition():
    return [{'species':key,'label':LABELS[key],'count':value}
            for key,value in Counter(item[0] for item in HEADS).items()]
