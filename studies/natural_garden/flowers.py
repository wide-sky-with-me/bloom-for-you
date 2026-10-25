"""Original natural-garden study surfaces; no production generator changes.

Floret photographs are a visual reference only, never textures or copied assets.
Public entry point: add_flower. detail=1 is a close-up; detail=.65 is bouquet LOD.
A conservative tessellation floor remains even for smaller detail values. Each
flower owns its rooted closed pose and normalizes its new weights to radius**2.
"""
from __future__ import annotations

from dataclasses import replace
import math
from typing import Callable

import generator as g

SPECIES = ('champagne_ranunculus', 'garden_rose', 'anemone', 'sweet_pea')
Vec3 = tuple[float, float, float]
Point = Callable[[float, float], Vec3]


def _smooth(t: float) -> float:
    return t*t*(3-2*t)


def _pin_root(opened: Point, target: Point) -> Point:
    """Keep an unchanged attachment collar, including its derivative normals."""
    def closed(u, v):
        if u <= .035:
            return opened(u,v)
        if u >= .275:
            return target(u,v)
        return g._mix(opened(u,v), target(u,v), _smooth((u-.035)/.24))
    return closed


def _detail_bud(point: Point, amount=.32) -> Point:
    return _pin_root(point, lambda u,v: g._mix(point(0.,v),point(u,v),amount))


def _steps(nu: int, nv: int, detail: float) -> tuple[int,int]:
    factor = max(.65, min(1.5,detail))
    return max(3,math.ceil(nu*factor)), max(3,math.ceil(nv*factor))


def _pigment(color: Vec3, phase: float, *, pale=.28, heart=.15):
    root = g._mix(color,(.65,.48,.27),heart)
    tip = g._mix(color,(1.,.96,.86),pale)
    def pigment(u,v):
        q = 2*v-1
        base = g._mix(root,color,min(1.,u*3.5))
        # Local botanical pigment, not directional light or world-space stripes.
        wash = .035*math.sin(phase+1.8*v)*math.sin(math.pi*u)
        edge = .35*u**5 + .18*q*q*u*u
        return tuple(g._clamp(c) for c in g._mix(g._mul(base,1+wash),tip,edge))
    return pigment


def _emit(model, point, closed, weight, pigment, steps, openness, *, kind='sheet', delay=.25):
    mature = point
    if openness < 1.:
        mature = lambda u,v,point=point,closed=closed: g._mix(closed(u,v),point(u,v),openness)
    model.add('flowers',weight,mature,pigment,.84,edge_bias=1.1,contour=kind=='sheet',
              kind=kind,resolution=24,mesh_steps=steps,closed_point=closed,growth_delay=delay)


def _pressed_blade(plan: g.PetalPlan, phase: float, transform, fold_scale=1.) -> Point:
    """Round blade with unequal broad compression folds, never sawtooth noise.

    Fold coordinates belong to this blade. Two broad lobes and a one-sided
    shoulder pinch vary per petal; no identical corrugation rings across a head.
    """
    sweep = g._petal_sweep(plan,lambda p:p)
    inward = g._unit(g._cross(plan.heading,plan.flank))
    def point(u,v):
        q = 2*v-1
        ease = u*u*(3-2*u)
        # Unequal low-frequency bends are intentionally much smaller than cup.
        fold = fold_scale*plan.width*(.035*math.sin(2.6*math.pi*v+phase)*u**3
                                      + .025*math.sin(1.3*math.pi*v-phase)*math.sin(math.pi*u))
        pinch = .035*plan.width*math.sin(phase)*q*math.sin(math.pi*u)
        shoulder = fold_scale*.025*plan.width*math.sin(2*math.pi*v+phase)*u**5
        offset = g._add(g._mul(inward,fold*ease),
                       g._add(g._mul(plan.flank,pinch*ease),g._mul(plan.heading,shoulder)))
        return transform(g._add(sweep(u,v),offset))
    return point


def _double_plan(species, petal, index):
    count = 30 if species == 'champagne_ranunculus' else 28
    outer = petal/(count-1)
    phase = index*.87 + petal*1.713
    angle = petal*math.pi*(3-math.sqrt(5)) + .18*math.sin(phase) + index*.39
    radial = (math.cos(angle),math.sin(angle),0.)
    flank = (-radial[1],radial[0],0.)
    if species == 'champagne_ranunculus':
        tilt = math.radians(6+52*outer+3.3*math.sin(phase))
        root = g._add(g._mul(radial,.026+.21*outer**1.15),
                      (0.,0.,.08-.43*outer+.028*math.sin(phase*1.43)))
        length = (.48+.56*outer)*(1+.045*math.sin(phase*.83))
        width = (.28+.77*outer**.8)*(1+.07*math.sin(phase*1.17))
        curl,roll,cup = -.73+.30*outer,.38*outer,1.03-.36*outer
    else:
        tilt = math.radians(7+48*outer+3.8*math.sin(phase))
        root = g._add(g._mul(radial,.028+.18*outer),
                      (0.,0.,.09-.46*outer+.035*math.sin(phase*1.43)))
        length = (.63+.55*outer)*(1+.035*math.sin(phase*.83))
        width = (.34+.82*outer**.75)*(1+.08*math.sin(phase*1.17))
        curl,roll,cup = -.82+.82*outer,1.14*outer**1.5,.92-.58*outer
    if petal >= 14:
        length *= 1+.075*math.sin(phase*.79)
        width *= 1+.10*math.cos(phase*.93)
        tilt += math.radians(4.5*math.sin(phase*.71))
        root = g._add(root,(0.,0.,.045*math.sin(phase*.87)))
        if petal >= count-6:
            roll += .22*math.sin(phase*.89)
            cup += .10*math.cos(phase*.67)
    heading = g._add(g._mul(radial,math.sin(tilt)),(0.,0.,math.cos(tilt)))
    return g.PetalPlan(root,heading,flank,length,width,curl,roll,cup,
                       .28+.025*math.sin(phase*.61),.025*math.sin(phase)),phase,count


def _embracing_inner(plan: g.PetalPlan, petal: int, phase: float, transform) -> Point:
    """Rooted curved wrappers, not wide blades swept through the flower axis."""
    root_radius=math.hypot(*plan.root[:2])
    theta=math.atan2(plan.root[1],plan.root[0])
    belly=.095+.019*petal
    lip=0. if petal<3 else .06+.022*(petal-3)
    tip_height=(.72-.065*petal if petal<3 else .55-.009*(petal-3))
    tip_height+=.009*math.sin(phase*.61)
    spread=1.28+.08*math.sin(phase*.73)
    root_spread=plan.width*.0225/root_radius
    twist=.42+.10*math.sin(phase*.81)
    def point(u,v):
        phi=(v-.5)*math.pi*.96
        q,cap=math.sin(phi),math.cos(phi)
        along=u*(1-.30*(1-cap))
        radius=(root_radius*(1-along)+belly*math.sin(math.pi*along)+lip*along)
        # Keep azimuth speed nonzero at the shoulder; the ellipse controls only
        # the outline, otherwise both UV tangents become almost parallel there.
        angle=theta+twist*along+(2*v-1)*(root_spread*(1-u)+spread*math.sin(math.pi*u/2))
        height=plan.root[2]+(tip_height-plan.root[2])*math.sin(math.pi*along/2)
        height+=.014*math.sin(2*math.pi*v+phase)*u**3-.025*q*q*math.sin(math.pi*u)
        return transform((radius*math.cos(angle),radius*math.sin(angle),height))
    return point


def _double(model,species,transform,color,index,openness,detail):
    count = 30 if species == 'champagne_ranunculus' else 28
    for petal in range(count):
        plan,phase,_ = _double_plan(species,petal,index)
        if petal < 14:
            point = _embracing_inner(plan,petal,phase,transform)
        else:
            point = _pressed_blade(plan,phase,transform,fold_scale=1.9 if petal>=count-5 else 1.15)
        closed = _pin_root(point,g._rose_bud(plan,petal/(count-1),transform))
        nu,nv = (8,8) if petal < 9 else (10,10)
        if species == 'garden_rose' and petal >= 22:
            nu,nv = 12,12
        steps = _steps(nu,nv,detail)
        if detail > 1.:
            scale=min(2.,detail)/1.5
            steps=(math.ceil((18 if petal<14 else 24)*scale),
                   math.ceil((20 if petal<14 else 26)*scale))
        pigment = _pigment(color,phase,pale=.23 if species=='garden_rose' else .32,
                           heart=.20*(1-petal/(count-1)))
        _emit(model,point,closed,plan.length*plan.width,pigment,steps,openness,
              delay=.12+.40*(1-petal/(count-1)))


def _ellipsoid(model,transform,center,radii,color,weight,openness,detail,delay=.2):
    def point(u,v):
        phi,theta=math.pi*u,g.TAU*v
        return transform(g._add(center,(radii[0]*math.sin(phi)*math.cos(theta),
                                        radii[1]*math.sin(phi)*math.sin(theta),
                                        radii[2]*math.cos(phi))))
    _emit(model,point,_detail_bud(point),weight,color,_steps(4,6,detail),openness,
          kind='sphere',delay=delay)


def _anemone(model,transform,color,index,openness,detail):
    for petal in range(7):
        phase = petal*1.71+index*.73
        angle = petal*g.TAU/7+.07*math.sin(phase)
        radial=(math.cos(angle),math.sin(angle),0.)
        tilt=math.radians(75+4*math.sin(phase))
        plan=g.PetalPlan(g._add(g._mul(radial,.07),(0.,0.,-.10)),
                         g._add(g._mul(radial,math.sin(tilt)),(0.,0.,math.cos(tilt))),
                         (-radial[1],radial[0],0.),.98+.055*math.sin(phase),
                         .78+.07*math.cos(phase),.09,.25,.34,.31,.025*math.sin(phase))
        point=_pressed_blade(plan,phase,transform)
        _emit(model,point,_pin_root(point,g._rose_bud(plan,.75,transform)),.85,
              _pigment(color,phase,pale=.22,heart=.10),_steps(10,10,detail),openness,
              delay=.14+petal*.025)
    # A real dark convex receptacle and separate filament/anther ring, not ink.
    def center(u,v):
        r=.22*math.sin(math.pi*u/2)
        return transform((r*math.cos(g.TAU*v),r*math.sin(g.TAU*v),.14+.20*math.cos(math.pi*u/2)))
    _emit(model,center,_detail_bud(center),.34,(.075,.060,.070),_steps(5,16,detail),openness)
    for j in range(24):
        angle=j*g.TAU/24+.04*math.sin(j*1.7+index)
        r=.275+.018*math.sin(j*2.1+index)
        end=(r*math.cos(angle),r*math.sin(angle),.23+.035*math.sin(j*1.41))
        start=(.17*math.cos(angle),.17*math.sin(angle),.14)
        side=(-math.sin(angle),math.cos(angle),0.)
        def filament(u,v,a=start,b=end,side=side):
            return transform(g._add(g._mix(a,b,u),g._mul(side,.006*(2*v-1))))
        _emit(model,filament,_detail_bud(filament),.008,(.15,.11,.12),(1,2),openness,delay=.18)
        _ellipsoid(model,transform,end,(.018,.018,.026),(.12,.09,.10),.012,
                   openness,detail,.18)


def _sweet_pea(model,transform,color,index,openness,detail):
    phase=index*.91
    def banner(u,v):
        phi=(v-.5)*math.pi*.96
        q,cap=math.sin(phi),math.cos(phi)
        along=u*(1-.26*(1-cap))
        x=.75*q*(.035+.965*math.sin(math.pi*u/2))*(1+.06*math.sin(phase+q))
        y=-.24+1.19*along-.08*math.exp(-q*q*12)*u**7
        z=-.12+.23*math.sin(math.pi*along)-.18*q*q*math.sin(math.pi*u)
        z+=.045*math.sin(2*math.pi*v+phase)*u**3
        return transform((x,y,z))
    banner_plan=g.PetalPlan((0.,-.24,-.12),(0.,.97,.243),(1.,0.,0.),1.1,1.5,.2,.2,.3)
    _emit(model,banner,_pin_root(banner,g._rose_bud(banner_plan,.8,transform)),1.4,
          _pigment(color,phase,pale=.34,heart=.06),_steps(14,14,detail),openness,delay=.20)
    for side in (-1,1):
        heading=g._unit((side*.90,.04,.42))
        flank=g._unit(g._cross(heading,(0.,0.,1.)))
        plan=g.PetalPlan((side*.065,-.18,-.04),heading,flank,.82,.77,
                         .35,.35,.56,.30,side*.04)
        point=_pressed_blade(plan,phase+side*1.3,transform)
        _emit(model,point,_pin_root(point,g._rose_bud(plan,.65,transform)),.7,
              _pigment(color,phase+side,pale=.20,heart=.12),_steps(10,10,detail),openness,delay=.28)
    for side in (-1,1):
        heading=g._unit((side*.15,-.31,.94))
        flank=g._unit(g._cross(heading,(0.,1.,0.)))
        plan=g.PetalPlan((side*.035,-.23,-.08),heading,flank,.69,.34,
                         -.10,.35,.85,.25,side*.015)
        point=_pressed_blade(plan,phase+side*.8,transform)
        _emit(model,point,_pin_root(point,g._rose_bud(plan,.45,transform)),.3,
              _pigment(g._mul(color,.93),phase+side,pale=.15),_steps(10,10,detail),openness,delay=.35)


def add_flower(model: g.Geometry, species: str, center: Vec3, radius: float,
               color: Vec3, index: int=0, *, axis: Vec3=(0.,0.,1.),
               openness: float=1., detail: float=1.) -> None:
    """Append only flower surfaces; never draw stems/leaves or mutate old heads.

    openness is individual maturity, independently of the later BFG bud-to-pose
    animation. index changes bounded local compression, not global random state.
    detail is a sampling scale with a .65 quality floor, not a petal-count knob.
    """
    if species not in SPECIES:
        raise ValueError(f'Unknown natural-garden species: {species}')
    if not math.isfinite(radius) or radius<=0 or not math.isfinite(detail) or detail<=0:
        raise ValueError('radius and detail must be positive finite values')
    if not math.isfinite(openness) or not 0<=openness<=1:
        raise ValueError('openness must be in [0,1]')
    if (len(center)!=3 or len(axis)!=3 or len(color)!=3
            or not all(math.isfinite(c) for c in (*center,*axis,*color))
            or sum(c*c for c in axis)<1e-12 or not all(0<=c<=1 for c in color)):
        raise ValueError('finite Vec3 center/axis and RGB pigments in [0,1] required')
    start=len(model.sections['flowers'])
    transform=g._frame(center,axis,radius)
    if species in ('champagne_ranunculus','garden_rose'):
        _double(model,species,transform,color,index,openness,detail)
    elif species=='anemone':
        _anemone(model,transform,color,index,openness,detail)
    else:
        _sweet_pea(model,transform,color,index,openness,detail)
    surfaces=model.sections['flowers'][start:]
    total=sum(s.weight for s in surfaces)
    model.sections['flowers'][start:]=[replace(s,weight=s.weight/total*radius**2) for s in surfaces]
    model.heads.append(g.FlowerHead(species,center,g._unit(axis),radius,'study'))
