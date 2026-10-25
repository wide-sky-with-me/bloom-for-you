#!/usr/bin/env python3
"""Deterministic, dependency-free botanical surfaces for the particle gallery.

Coordinates are world-space: +y is up and +z faces the viewer. Every record is
exactly eleven little-endian float32 values:
x, y, z, r, g, b, size, phase, nx, ny, nz. Colors are unlit surface pigments.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, replace
import html
import json
import math
from pathlib import Path
import random
import struct
from typing import Callable

COUNT = 120_000
STRIDE = 11
SEED = 20_260_214
RECORD = struct.Struct("<11f")
MESH_HEADER = struct.Struct("<4sII")
MESH_VERTEX = struct.Struct("<9f")
GROWTH_HEADER = struct.Struct("<4sII")
GROWTH_RECORD = struct.Struct("<hhhhhhH")
GrowthPose = tuple[float, float, float, float, float, float, float]
TAU = math.tau
Vec3 = tuple[float, float, float]
Particle = tuple[float, float, float, float, float, float, float, float,
                 float, float, float]
PointFn = Callable[[float, float], Vec3]
PigmentFn = Callable[[float, float], Vec3]

BOUQUETS = (
    {
        "id": "rose",
        "file": "rose.bin",
        "surface": "rose.mesh",
        "title": "把偏爱，都给你",
        "subtitle": "粉色多头玫瑰",
        "description": "粉玫瑰与洋牡丹、大丽花、洋桔梗环绕相拥，雾蓝枝花、尤加利和蕨叶穿插成圆润花冠。",
        "color": "#e6a0b8",
    },
    {
        "id": "tulip",
        "file": "tulip.bin",
        "surface": "tulip.mesh",
        "title": "和你慢慢盛开",
        "subtitle": "奶油粉郁金香",
        "description": "奶油粉郁金香与洋牡丹、洋桔梗和浅色玫瑰前后交错，细枝小花与尤加利向四周舒展。",
        "color": "#efc4b9",
    },
    {
        "id": "hydrangea",
        "file": "hydrangea.bin",
        "surface": "hydrangea.mesh",
        "title": "温柔，有了形状",
        "subtitle": "淡蓝紫绣球",
        "description": "雾蓝绣球穿插浅粉玫瑰、奶油洋牡丹和淡紫洋桔梗，蓬松小花与蕨叶织成环绕花冠。",
        "color": "#a9b9e6",
    },
    {
        "id": "wildflower",
        "file": "wildflower.bin",
        "surface": "wildflower.mesh",
        "title": "你在，就是花园",
        "subtitle": "香槟粉混合花园",
        "description": "桃粉玫瑰、奶油与淡黄洋牡丹、珊瑚大丽花和洋桔梗密密相拥，少量雾蓝枝花与尤加利自然外伸。",
        "color": "#e8bea3",
    },
    {
        "id": "peony",
        "file": "peony.bin",
        "surface": "peony.mesh",
        "title": "把盛大留给你",
        "subtitle": "绯粉重瓣牡丹",
        "description": "重瓣牡丹与玫瑰、洋牡丹、大丽花和洋桔梗高低错落，叶材与细枝在整圈花冠间舒展。",
        "color": "#efafc2",
    },
    {
        "id": "lily",
        "file": "lily.bin",
        "surface": "lily.mesh",
        "title": "白昼的情书",
        "subtitle": "奶油白星形百合",
        "description": "反卷百合与奶油玫瑰、洋桔梗、洋牡丹相映，金色花药与细小枝花从圆润花冠中探出。",
        "color": "#f2ddcb",
    },
    {
        "id": "sunflower",
        "file": "sunflower.bin",
        "surface": "sunflower.mesh",
        "title": "只向着你",
        "subtitle": "金色向日葵",
        "description": "金黄向日葵交错珊瑚大丽花、浅黄洋牡丹和波斯菊，棕金小籽与尤加利衬出丰盛夏日。",
        "color": "#efc55b",
    },
    {
        "id": "calla",
        "file": "calla.bin",
        "surface": "calla.mesh",
        "title": "温柔的回声",
        "subtitle": "月白淡紫马蹄莲",
        "description": "月白淡紫马蹄莲与浅色玫瑰、洋桔梗、洋牡丹交错围合，纤细枝花与蕨叶轻轻探出花冠。",
        "color": "#e6d8ef",
    },
)


def _add(a: Vec3, b: Vec3) -> Vec3:
    return a[0] + b[0], a[1] + b[1], a[2] + b[2]


def _mul(a: Vec3, s: float) -> Vec3:
    return a[0] * s, a[1] * s, a[2] * s


def _cross(a: Vec3, b: Vec3) -> Vec3:
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _unit(a: Vec3) -> Vec3:
    length = math.sqrt(sum(c * c for c in a))
    return _mul(a, 1.0 / length) if length > 1e-12 else (0.0, 0.0, 1.0)


def _mix(a: Vec3, b: Vec3, t: float) -> Vec3:
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def _frame(center: Vec3, normal: Vec3 = (0.0, 0.0, 1.0),
           scale: float = 1.0, roll: float = 0.0) -> Callable[[Vec3], Vec3]:
    z = _unit(normal)
    reference = (0.0, 1.0, 0.0) if abs(z[1]) < 0.95 else (1.0, 0.0, 0.0)
    x = _unit(_cross(reference, z))
    y = _cross(z, x)
    x, y = (_add(_mul(x, math.cos(roll)), _mul(y, math.sin(roll))),
            _add(_mul(y, math.cos(roll)), _mul(x, -math.sin(roll))))

    def transform(p: Vec3) -> Vec3:
        return tuple(center[i] + scale * (x[i] * p[0] + y[i] * p[1] + z[i] * p[2])
                     for i in range(3))

    return transform


@dataclass(frozen=True)
class Surface:
    weight: float
    point: PointFn
    pigment: PigmentFn
    size: float = 1.0
    shade: bool = True
    edge_bias: float = 1.0
    contour: bool = False
    kind: str = "sheet"
    resolution: int = 12
    mesh_steps: tuple[int, int] | None = None
    closed_point: PointFn | None = None
    growth_delay: float = 0.0


@dataclass(frozen=True)
class FlowerHead:
    species: str
    center: Vec3
    axis: Vec3
    radius: float
    layer: str


class Geometry:
    def __init__(self) -> None:
        self.heads: list[FlowerHead] = []
        self.sections: dict[str, list[Surface]] = {
            "flowers": [], "leaves": [], "stems": [], "ribbon": [],
        }

    def add(self, section: str, weight: float, point: PointFn,
            pigment: PigmentFn | Vec3, size: float = 1.0, shade: bool = True,
            edge_bias: float = 1.0, contour: bool = False,
            kind: str = "sheet", resolution: int = 12,
            mesh_steps: tuple[int, int] | None = None,
            closed_point: PointFn | None = None, growth_delay: float = 0.0) -> None:
        if not callable(pigment):
            color = pigment
            pigment = lambda u, v, color=color: color
        self.sections[section].append(
            Surface(weight, point, pigment, size, shade, edge_bias, contour, kind,
                    resolution, mesh_steps, closed_point, growth_delay))


def _allocate(count: int, weights: list[float]) -> list[int]:
    """Largest remainders preserve the exact budget, including small previews."""
    total = sum(weights)
    exact = [count * weight / total for weight in weights]
    result = [math.floor(value) for value in exact]
    order = sorted(range(len(weights)), key=lambda i: (-(exact[i] - result[i]), i))
    for i in order[:count - sum(result)]:
        result[i] += 1
    return result


def _petal_color(base: Vec3, tip: Vec3, root: Vec3 | None = None) -> PigmentFn:
    root = root or _mul(base, 0.88)

    def pigment(u: float, v: float) -> Vec3:
        color = _mix(root, base, min(1.0, u * 3.0))
        rim = max(u ** 6, abs(2.0 * v - 1.0) ** 12 * u * 0.46)
        return _mix(color, tip, rim * 0.72)

    return pigment


@dataclass(frozen=True)
class PetalPlan:
    """A rooted blade, not a sector of the flower's global polar coordinates.

    Adapted from tantaneity/rose-gen Petals.cs and Blade.cs (MIT, 2026).
    See THIRD_PARTY_NOTICES.md and the frozen modeling research proposal.
    Angles are radians; roll is confined to the distal half of the blade.
    """
    root: Vec3
    heading: Vec3
    flank: Vec3
    length: float
    width: float
    curl: float
    roll: float
    cup: float
    shoulder: float = 0.28
    sweep: float = 0.0


def _rose_petal_plan(index: int, count: int = 28) -> PetalPlan:
    # Inside-out ordering retains the existing outer-first growth delays.
    outer = index / max(1, count - 1)
    angle = index * math.pi * (3.0 - math.sqrt(5.0)) + .065 * math.sin(index * 1.7)
    radial = (math.cos(angle), math.sin(angle), 0.0)
    flank = (-radial[1], radial[0], 0.0)
    tilt = math.radians(8 + 38 * outer ** .8 + 1.4 * math.sin(index * 2.3))
    root = _add(_mul(radial, .028 + .13 * outer ** .65), (0., 0., -.025 - .34 * outer))
    return PetalPlan(
        root, _add(_mul(radial, math.sin(tilt)), (0., 0., math.cos(tilt))), flank,
        (.82 + .30 * outer) * (1 + .022 * math.sin(index * 1.13)),
        (.32 + .78 * outer) * (1 + .028 * math.cos(index * 1.91)),
        -.60 + .73 * outer, 1.30 * outer ** 1.8, .82 - .58 * outer,
        .28 + .020 * math.sin(index * .73), .024 * (1 - outer))


def _petal_sweep(plan: PetalPlan, transform: Callable[[Vec3], Vec3]) -> PointFn:
    """Arc-length sweep with a C1 spine and an elliptical, round shoulder cap.

    Simpson integration + Hermite evaluation avoids row-wise tangent jumps from
    the reference's discrete sweep. The tiny table is built once per petal, not
    per particle. All samplers and derivative normals use this same evaluator.
    The distal boundary is an ellipse, so no rectangular/pointed paper corners
    remain. Cup and roll are independent; there is deliberately no noise ruffle.
    """
    heading, flank = plan.heading, plan.flank
    inward = _unit(_cross(heading, flank))
    rows = 32

    def bend(t: float) -> float:
        late = max(0.0, 2 * t - 1)
        return plan.curl * t + plan.roll * late * late * (3 - 2 * late)

    def tangent(t: float) -> tuple[float, float]:
        angle = bend(t)
        return plan.length * math.cos(angle), -plan.length * math.sin(angle)

    x = y = 0.0
    spine = [(x, y, *tangent(0.0))]
    for row in range(rows):
        a, mid, b = (tangent(t / rows) for t in (row, row + .5, row + 1))
        x += (a[0] + 4 * mid[0] + b[0]) / (6 * rows)
        y += (a[1] + 4 * mid[1] + b[1]) / (6 * rows)
        spine.append((x, y, *b))

    def point(u: float, v: float) -> Vec3:
        # Leave a 3.6-degree collar at either shoulder: a perfect square-to-disk
        # corner has a singular Jacobian and an arbitrary derivative normal.
        phi = (v - .5) * math.pi * .96
        across, cap = math.sin(phi), math.cos(phi)
        along = u * (1 - plan.shoulder * (1 - cap))
        at = min(rows - 1, int(along * rows))
        t = along * rows - at
        a, b = spine[at], spine[at + 1]
        h0, h1 = 2 * t ** 3 - 3 * t * t + 1, -2 * t ** 3 + 3 * t * t
        h2, h3 = (t ** 3 - 2 * t * t + t) / rows, (t ** 3 - t * t) / rows
        forward = h0 * a[0] + h1 * b[0] + h2 * a[2] + h3 * b[2]
        bendward = h0 * a[1] + h1 * b[1] + h2 * a[3] + h3 * b[3]
        half = plan.width * .5 * (.045 + .955 * math.sin(math.pi * u / 2))
        angle = bend(along)
        lift = plan.cup * (1 - cap) * half
        forward += math.sin(angle) * lift
        bendward += math.cos(angle) * lift
        side = across * half + plan.sweep * along * along
        return transform(tuple(plan.root[k] + heading[k] * forward
                               + inward[k] * bendward + flank[k] * side for k in range(3)))

    return point


def _rose_bud(plan: PetalPlan, outer: float, transform: Callable[[Vec3], Vec3]) -> PointFn:
    """Overlapping ovoid wrappers in each petal's own root/flank frame.

    Full-width upright open blades cross the centre: a shredded paper ball.
    Bud wrappers instead follow a narrow nested envelope, without a solid cap.
    """
    root_radius = math.hypot(*plan.root[:2])
    radial = (plan.root[0] / root_radius, plan.root[1] / root_radius, 0.)
    root_spread = plan.width * .0225 / root_radius

    def point(u: float, v: float) -> Vec3:
        q = 2 * v - 1
        radius = (root_radius * (1 - u) + .022 * u
                  + (.045 + .17 * outer) * math.sin(math.pi * u) ** .85)
        spread = root_spread * (1 - u) + 1.12 * math.sin(math.pi * u / 2)
        angle = q * spread + .10 * u * (1 - outer)
        height = (plan.root[2] + plan.length * .88 * math.sin(math.pi * u / 2)
                  - .035 * (1 - math.cos(q * math.pi / 2)) * u)
        local = tuple(radial[k] * radius * math.cos(angle)
                      + plan.flank[k] * radius * math.sin(angle) for k in range(2))
        return transform((*local, height))

    return point


def _rose(model: Geometry, center: Vec3, radius: float, color: Vec3,
          roll: float = 0.0, normal: Vec3 | None = None) -> None:
    # Decision: .agents/notes/implemented/floral-refinement/2026-10-20-rooted-petals-and-prepared-switching.md
    # Fewer, broader individually rooted petals buy real curvature within BFM1's
    # existing byte budget. No central spiral strip or repeated concentric fans.
    transform = _frame(center, normal or (center[0] * .42, .18, 1.0), radius, roll)
    pale = _mix(color, (1.0, .93, .89), .55)
    # Rank-aware companion allocation: maximum sampled triangle error remains
    # below 2% of head diameter, while a rose costs less than its old 46 sheets.
    companion_steps = ((3, 4),) * 13 + ((4, 4),) * 3 + ((5, 4),) + ((5, 5),) * 5 + (
        ((6, 6),) * 2 + ((7, 7),) * 2 + ((8, 8),) * 2)
    for index in range(28):
        plan = _rose_petal_plan(index)
        point = _petal_sweep(plan, transform)
        # Preserve the original attachment collar and its derivative normals.
        closed_sweep = _rose_bud(plan, index / 27, transform)

        def closed(u: float, v: float, opened=point, target=closed_sweep) -> Vec3:
            if u <= .03:
                return opened(u, v)
            if u >= .13:
                return target(u, v)
            t = (u - .03) / .10
            return _mix(opened(u, v), target(u, v), t * t * (3 - 2 * t))

        pigment = _petal_color(_mix(color, (.72, .22, .37), .12 * (1 - index / 27)), pale)
        if radius >= .65:
            steps = (6, 6) if index < 8 else (8, 8) if index < 20 else (10, 12)
        else:
            steps = companion_steps[index]
        model.add("flowers", radius * radius * plan.length * plan.width,
                  point, pigment, .91, edge_bias=1.4, contour=True, resolution=24,
                  mesh_steps=steps, closed_point=closed)


def _tulip(model: Geometry, center: Vec3, radius: float, color: Vec3,
           roll: float = 0.0, normal: Vec3 | None = None) -> None:
    frame = _frame(center, normal or (center[0] * 0.30, -0.20, 1.0), radius, roll)
    transform = (lambda p: frame((p[0], -p[2], p[1]))) if normal else frame
    for j in range(6):
        # Three outer tepals alternate with three slightly taller inner tepals.
        theta = j * TAU / 6.0 + .024 * math.sin(j * 2.1)
        inner = j % 2 == 0

        def point(u: float, v: float, theta=theta, inner=inner, j=j) -> Vec3:
            phi = (v - .5) * math.pi * .96
            q, cap = math.sin(phi), math.cos(phi)
            along = u * (1 - .17 * (1 - cap))
            angle = theta + q * .74 * (.40 + .60 * math.sin(u * math.pi / 2))
            r = (.10 + .63 * math.sin(along * math.pi * .73)
                 + (.075 if inner else .13) * along ** 6)
            r *= .94 if inner else 1.04
            height = (-.60 + (1.54 if inner else 1.47) * along
                      + .035 * math.sin(j * 1.9) * along ** 2)
            # A rounded shoulder and a gently splayed lip leave a real open mouth.
            r += .028 * q * along ** 3 + .035 * q * q * along ** 4
            return transform((r * math.sin(angle), height, r * math.cos(angle)))

        pale = _mix(color, (1.0, 0.97, 0.87), 0.62)
        root = _mix(color, (0.56, 0.63, 0.34), 0.38)
        base_pigment = _petal_color(color, pale, root)

        def pigment(u: float, v: float, base=base_pigment) -> Vec3:
            q = v * 2 - 1
            seam = 0.04 * abs(q) ** 10 * u ** 2
            vein = 0.018 * (1 - math.cos(q * 11 * math.pi)) * math.sin(math.pi * u)
            return _mul(base(u, v), 1.0 - seam - vein)

        model.add("flowers", radius * radius * (0.90 if inner else 1.0), point,
                  pigment, 1.03, edge_bias=1.2, contour=True,
                  mesh_steps=(10, 8) if radius >= .65 else (8, 6))
    # Separate slender filaments and dark elongated anthers below the six lips.
    for j in range(6):
        angle = TAU * j / 6.0
        start = transform((.065 * math.cos(angle), -.42, .065 * math.sin(angle)))
        end = transform((.19 * math.cos(angle), .34 + .025 * math.sin(j), .19 * math.sin(angle)))
        _tube(model, "flowers", lambda t, a=start, b=end: _mix(a, b, t),
              radius * .011, (.68, .63, .35), radius * radius * .025, .69)
        a = transform((.19 * math.cos(angle), .28 + .025 * math.sin(j), .19 * math.sin(angle)))
        b = transform((.21 * math.cos(angle), .44 + .025 * math.sin(j), .21 * math.sin(angle)))
        _tube(model, "flowers", lambda t, a=a, b=b: _mix(a, b, t),
              radius * .032, (.31, .22, .12), radius * radius * .04, .78)
    a, b = transform((0., -.42, 0.)), transform((0., .47, 0.))
    _tube(model, "flowers", lambda t: _mix(a, b, t), radius * .021,
          (.64, .70, .36), radius * radius * .035, .73)

    def stigma(u: float, v: float) -> Vec3:
        phi, theta = math.pi * u, TAU * v
        r = .065 * math.sin(phi) * (1 + .16 * math.cos(3 * theta))
        return transform((r * math.cos(theta), .48 + .035 * math.cos(phi), r * math.sin(theta)))

    model.add("flowers", radius * radius * .035, stigma, (.76, .76, .43), .72,
              kind="sphere", mesh_steps=(3, 6))


def _floret(model: Geometry, center: Vec3, normal: Vec3, radius: float,
            color: Vec3, roll: float = 0.0) -> None:
    transform = _frame(center, normal, radius, roll)
    for petal in range(4):
        angle = petal * math.pi / 2

        def point(u: float, v: float, angle=angle) -> Vec3:
            q = 2.0 * v - 1.0
            length = 0.045 + 0.92 * u
            width = q * 0.49 * max(0.0, math.sin(math.pi * u)) ** 0.62
            z = (0.22 * math.sin(math.pi * u) + 0.15 * u ** 6
                 - 0.12 * q * q * math.sin(math.pi * u))
            return transform((length * math.cos(angle) - width * math.sin(angle),
                              length * math.sin(angle) + width * math.cos(angle), z))

        pale = _mix(color, (0.98, 0.98, 1.0), 0.53)
        model.add("flowers", radius * radius, point, _petal_color(color, pale),
                  0.78, edge_bias=1.3, resolution=8)

    def eye(u: float, v: float) -> Vec3:
        r = 0.11 * math.sqrt(u)
        return transform((r * math.cos(TAU * v), r * math.sin(TAU * v),
                          0.10 + 0.06 * (1.0 - u)))

    model.add("flowers", radius * radius * 0.06, eye, (0.83, 0.87, 0.69), 0.67,
              mesh_steps=(1, 4))


def _hydrangea(model: Geometry, center: Vec3, radius: float, index: int) -> None:
    florets = max(60, round(190 * radius * radius))
    for j in range(florets):
        nz = 1.0 - 2.0 * (j + 0.5) / florets
        theta = j * math.pi * (3.0 - math.sqrt(5.0)) + index * 0.71
        transverse = math.sqrt(1.0 - nz * nz)
        normal = _unit((transverse * math.cos(theta), transverse * math.sin(theta), nz * 1.2))
        # Uneven branch lengths and staggered depth prevent a smooth spherical shell.
        reach = radius * (0.80 + 0.18 * math.sin(j * 2.17) + 0.07 * math.cos(j * 0.73))
        p = _add(center, (reach * normal[0], reach * normal[1],
                          reach * nz * 0.96 + 0.08 * math.sin(j * 1.31)))
        blend = 0.5 + 0.5 * math.sin(j * 1.79 + index * 2.13)
        color = _mix((0.48, 0.65, 0.91), (0.71, 0.59, 0.86), blend)
        _floret(model, p, normal, 0.175 + 0.030 * (0.5 + 0.5 * math.sin(j * 2.3)),
                color, theta * 0.31)


def _cosmos(model: Geometry, center: Vec3, radius: float, color: Vec3,
            roll: float = 0.0, normal: Vec3 | None = None) -> None:
    transform = _frame(center, normal or (center[0] * 0.34, 0.22, 1.0), radius, roll)
    for j in range(9):
        angle = TAU * j / 9.0

        def point(u: float, v: float, angle=angle) -> Vec3:
            q = v * 2 - 1
            r = 0.13 + 0.87 * u - 0.055 * math.cos(q * 3 * math.pi) * u ** 8
            width = q * 0.29 * math.sin(math.pi * u) ** 0.55
            z = (-0.12 + 0.36 * math.sin(math.pi * u * 0.90)
                 - 0.24 * u ** 6 + 0.10 * q * q * math.sin(math.pi * u))
            return transform((r * math.cos(angle) - width * math.sin(angle),
                              r * math.sin(angle) + width * math.cos(angle), z))

        model.add("flowers", radius * radius * 0.23, point,
                  _petal_color(color, _mix(color, (1.0, 0.91, 0.79), 0.30)),
                  0.87, edge_bias=1.7, contour=True)

    def center_point(u: float, v: float) -> Vec3:
        r = 0.235 * math.sqrt(u)
        angle = TAU * v
        corrugation = 0.018 * math.sin(angle * 17 + u * 28)
        return transform((r * math.cos(angle), r * math.sin(angle),
                          0.15 * math.sqrt(1 - u) + corrugation))

    model.add("flowers", radius * radius * 0.20, center_point,
              lambda u, v: _mix((0.60, 0.35, 0.10), (0.99, 0.78, 0.35), u), 0.77,
              mesh_steps=(2, 8))


def _double_petal_plan(species: str, index: int, count: int = 42) -> PetalPlan:
    """Independent spoon blades: irregular peony bowl versus nested ranunculus.

    Phyllotactic attachments vary continuously in depth and radius, not in
    repeated equal-height rings. Fewer blades spend the budget on round lips.
    """
    outer = index / (count - 1)
    theta = index * math.pi * (3 - math.sqrt(5)) + .11 * math.sin(index * 1.83)
    radial = (math.cos(theta), math.sin(theta), 0.)
    flank = (-radial[1], radial[0], 0.)
    if species == "peony":
        tilt = math.radians(9 + 48 * outer + 4 * math.sin(index * 1.71))
        root = _add(_mul(radial, .035 + .17 * outer),
                    (0., 0., .12 - .53 * outer + .035 * math.sin(index * 2.17)))
        return PetalPlan(root, _add(_mul(radial, math.sin(tilt)), (0., 0., math.cos(tilt))),
                         flank, (.48 + .76 * outer) * (1 + .045 * math.sin(index * 1.13)),
                         (.24 + .88 * outer ** .75) * (1 + .075 * math.cos(index * 1.91)),
                         -.62 + .73 * outer, 1.04 * outer ** 1.6, .90 - .48 * outer,
                         .24 + .045 * math.sin(index * .73), .035 * math.sin(index * 1.37))
    tilt = math.radians(7 + 40 * outer + 2 * math.sin(index * 1.71))
    root = _add(_mul(radial, .025 + .40 * outer ** 1.3),
                (0., 0., .16 - .43 * outer + .018 * math.sin(index * 2.17)))
    return PetalPlan(root, _add(_mul(radial, math.sin(tilt)), (0., 0., math.cos(tilt))),
                     flank, .36 + .48 * outer, .22 + .67 * outer,
                     -.62 + .28 * outer, .10 * outer, .98 - .20 * outer,
                     .30, .015 * math.sin(index * 1.37))


def _double_flower(model: Geometry, species: str, transform: Callable[[Vec3], Vec3],
                   radius: float, color: Vec3) -> None:
    pale = _mix(color, (1.0, .95, .88) if species == "ranunculus" else (1., .91, .91), .44)
    for index in range(42):
        plan = _double_petal_plan(species, index)
        opened = _petal_sweep(plan, transform)
        target = _rose_bud(plan, index / 41, transform)

        def closed(u: float, v: float, opened=opened, target=target) -> Vec3:
            if u <= .03:
                return opened(u, v)
            if u >= .13:
                return target(u, v)
            t = (u - .03) / .10
            return _mix(opened(u, v), target(u, v), t * t * (3 - 2 * t))

        if radius >= .65:
            steps = (6, 6) if index < 12 else (7, 6) if index < 30 else (9, 8)
        elif species == "peony":
            # The broad reflexed shoulders need their own transverse samples.
            steps = ((3, 3) if index < 10 else (4, 4) if index < 14 else
                     (5, 5) if index < 28 else (6, 6) if index < 36 else (7, 7))
        else:
            steps = (3, 3) if index < 14 else (4, 4) if index < 28 else (5, 5)
        pigment = _petal_color(_mix(color, (.74, .29, .39),
                                    .12 * (1 - index / 41) if species == "peony" else .025), pale)
        model.add("flowers", radius * radius * plan.length * plan.width,
                  opened, pigment, .94, edge_bias=1.35, contour=True, resolution=20,
                  mesh_steps=steps, closed_point=closed)


def _peony(model: Geometry, center: Vec3, radius: float, color: Vec3,
           roll: float = 0.0, normal: Vec3 | None = None) -> None:
    transform = _frame(center, normal or (center[0] * .40, .24, 1.0), radius, roll)
    _double_flower(model, "peony", transform, radius, color)


def _lily(model: Geometry, center: Vec3, radius: float, color: Vec3,
          roll: float = 0.0, normal: Vec3 | None = None) -> None:
    transform = _frame(center, normal or (center[0] * 0.36, 0.27, 1.0), radius, roll)
    for j in range(6):
        theta = j * TAU / 6.0

        def point(u: float, v: float, theta=theta, j=j) -> Vec3:
            q = 2.0 * v - 1.0
            r = 0.035 + (1.20 if j % 2 else 1.13) * u
            width = q * (0.31 if j % 2 else 0.38) * math.sin(math.pi * u) ** 0.82
            z = (-0.44 + 0.94 * math.sin(math.pi * u * 0.79) - 0.59 * u ** 5
                 + 0.14 * q * q * math.sin(math.pi * u))
            return transform((r * math.cos(theta) - width * math.sin(theta),
                              r * math.sin(theta) + width * math.cos(theta), z))

        def pigment(u: float, v: float) -> Vec3:
            q = 2.0 * v - 1.0
            vein = 0.12 * math.exp(-q * q * 85) * (1 - u)
            return _mix(_petal_color(color, (1.0, 0.98, 0.91),
                                    (0.77, 0.81, 0.50))(u, v), (0.75, 0.72, 0.40), vein)

        model.add("flowers", radius * radius, point, pigment, 1.02,
                  contour=True, edge_bias=1.12, resolution=20)
    for j in range(6):
        theta = TAU * j / 6.0
        start = transform((0.025 * math.cos(theta), 0.025 * math.sin(theta), -0.37))
        end = transform((0.27 * math.cos(theta), 0.27 * math.sin(theta), 0.43))
        _tube(model, "flowers", lambda u, a=start, b=end: _mix(a, b, u),
              radius * 0.013, (0.76, 0.73, 0.45), radius * radius * 0.045, 0.73)
        a = _add(end, _mul(_unit((math.cos(theta), math.sin(theta), 0.0)), -radius * 0.09))
        b = _add(end, _mul(_unit((math.cos(theta), math.sin(theta), 0.0)), radius * 0.09))
        _tube(model, "flowers", lambda u, a=a, b=b: _mix(a, b, u),
              radius * 0.034, (0.64, 0.32, 0.12), radius * radius * 0.065, 0.85)
    a, b = transform((0.0, 0.0, -0.40)), transform((0.02, 0.01, 0.56))
    _tube(model, "flowers", lambda u, a=a, b=b: _mix(a, b, u),
          radius * 0.026, (0.69, 0.76, 0.43), radius * radius * 0.05, 0.78)


def _sunflower(model: Geometry, center: Vec3, radius: float, color: Vec3,
               roll: float = 0.0, normal: Vec3 | None = None) -> None:
    transform = _frame(center, normal or (center[0] * 0.42, 0.18, 1.0), radius, roll)
    for layer, petals in enumerate((14, 18)):
        for j in range(petals):
            theta = j * TAU / petals + layer * .17 + .028 * math.sin(j * 2.3)
            length = (.66 + layer * .13) * (1 + .09 * math.sin(j * 1.7 + layer))

            def point(u: float, v: float, theta=theta, layer=layer, length=length) -> Vec3:
                q = 2 * v - 1
                r = .40 + length * u - .035 * q * q * u ** 5
                width = q * (.155 + layer * .018) * math.sin(math.pi * u) ** .78
                z = (.04 - layer * .10 + .26 * math.sin(math.pi * u)
                     - .24 * u * u + .11 * q * q * math.sin(math.pi * u)
                     + .065 * math.cos(theta * 3) * u ** 3 + .035 * q * u * u)
                return transform((r * math.cos(theta) - width * math.sin(theta),
                                  r * math.sin(theta) + width * math.cos(theta), z))

            model.add("flowers", radius * radius * .67 / petals, point,
                      _petal_color(color, (1.0, .90, .40), (.85, .47, .10)),
                      .96, contour=True, resolution=14,
                      mesh_steps=(8, 4) if radius >= .65 else (6, 4))
    # The raised brown phyllotactic disc meets, but does not hide, the ray roots.
    for j in range(128):
        t = (j + .5) / 128
        theta = j * math.pi * (3.0 - math.sqrt(5.0))
        r = .43 * math.sqrt(t)
        cx, cy = r * math.cos(theta), r * math.sin(theta)
        cz = .09 + .21 * (1.0 - t) ** .75

        def seed(u: float, v: float, cx=cx, cy=cy, cz=cz, theta=theta) -> Vec3:
            reach = .032 * math.sqrt(u)
            angle = TAU * v + theta
            return transform((cx + reach * math.cos(angle), cy + reach * math.sin(angle),
                              cz + .040 * math.sqrt(1 - u)))

        model.add("flowers", radius * radius * .005, seed,
                  _mix((.23, .13, .075), (.62, .39, .13), t),
                  .83, resolution=6, mesh_steps=(1, 4))


def _calla(model: Geometry, center: Vec3, radius: float, color: Vec3,
           roll: float = 0.0, normal: Vec3 | None = None) -> None:
    frame = _frame(center, normal or (center[0] * 0.31, -0.26, 1.0), radius, roll)
    transform = (lambda p: frame((p[0], -p[2], p[1]))) if normal else frame

    def spathe(u: float, v: float) -> Vec3:
        theta = (v - 0.5) * TAU * 0.94 + 0.48 * u
        flare = math.sin(u * math.pi / 2.0)
        r = 0.055 + 0.66 * flare ** 1.4
        peak = (0.5 + 0.5 * math.cos(theta - 0.55)) ** 5
        y = -0.78 + 1.68 * u + 0.68 * peak * u ** 6
        x = r * math.sin(theta) * (1.0 - 0.25 * peak * u ** 6)
        z = r * math.cos(theta) + 0.11 * math.sin(math.pi * u)
        return transform((x, y, z))

    model.add("flowers", radius * radius * 3.8, spathe,
              _petal_color(color, _mix(color, (0.84, 0.69, 0.90), 0.45),
                           (0.70, 0.79, 0.48)), 1.02, contour=True, resolution=32)
    a, b = transform((0.015, -0.46, 0.045)), transform((0.035, 0.86, 0.06))
    _tube(model, "flowers", lambda u, a=a, b=b: _mix(a, b, u), radius * 0.070,
          (0.94, 0.71, 0.24), radius * radius * 0.56, 0.87)


def _bezier(a: Vec3, b: Vec3, c: Vec3, d: Vec3) -> Callable[[float], Vec3]:
    def curve(t: float) -> Vec3:
        s = 1.0 - t
        return tuple(s ** 3 * a[i] + 3 * s * s * t * b[i]
                     + 3 * s * t * t * c[i] + t ** 3 * d[i] for i in range(3))
    return curve


def _tube(model: Geometry, section: str, curve: Callable[[float], Vec3],
          radius: float, color: Vec3, weight: float, size: float = 0.85) -> None:
    def point(u: float, v: float) -> Vec3:
        p = curve(u)
        tangent = _unit(tuple(b - a for a, b in zip(
            curve(max(0.0, u - 0.001)), curve(min(1.0, u + 0.001)))))
        reference = (0.0, 0.0, 1.0) if abs(tangent[2]) < 0.95 else (1.0, 0.0, 0.0)
        x = _unit(_cross(tangent, reference))
        y = _cross(tangent, x)
        angle = TAU * v
        return _add(p, _add(_mul(x, radius * math.cos(angle)),
                            _mul(y, radius * math.sin(angle))))

    # Straight hairline branches need no intermediate axial rings.
    a, b = curve(0.0), curve(1.0)
    straight = radius <= 0.012 and all(math.dist(curve(t), _mix(a, b, t)) < 1e-9
                                      for t in (0.25, 0.5, 0.75))
    model.add(section, weight, point, color, size, kind="tube",
              mesh_steps=(1, 4) if straight else None)


def _leaf(model: Geometry, start: Vec3, end: Vec3, width: float,
          color: Vec3 = (0.27, 0.45, 0.34), roll: float = 0.0) -> None:
    axis = tuple(b - a for a, b in zip(start, end))
    side = _unit(_cross(axis, (0.16, 0.0, 1.0)))
    normal = _unit(_cross(side, axis))
    side, normal = (_add(_mul(side, math.cos(roll)), _mul(normal, math.sin(roll))),
                    _add(_mul(normal, math.cos(roll)), _mul(side, -math.sin(roll))))

    def point(u: float, v: float) -> Vec3:
        q = 2 * v - 1
        outline = math.sin(math.pi * u) ** 0.78
        fold = width * (0.52 * (1 - abs(q)) + 0.10 * math.sin(u * 9 * math.pi))
        fold *= math.sin(math.pi * u)
        fold += width * 0.32 * u * u
        return _add(_add(start, _mul(axis, u)),
                    _add(_mul(side, width * q * outline), _mul(normal, fold)))

    def pigment(u: float, v: float) -> Vec3:
        q = abs(2 * v - 1)
        vein = math.exp(-q * 34)
        branches = max(0.0, math.cos((u - q * 0.18) * 35 * math.pi)) ** 20
        return _mix(color, (0.60, 0.68, 0.45), 0.32 * vein + 0.10 * branches)

    length = math.sqrt(sum(a * a for a in axis))
    model.add("leaves", width * length, point, pigment, 0.88,
              mesh_steps=(2 if width <= 0.05 else 3, 2))

    def backside(u: float, v: float) -> Vec3:
        return _add(point(u, 1.0 - v), _mul(normal, -0.014))

    model.add("leaves", width * length * 0.55, backside,
              lambda u, v: _mix(pigment(u, 1.0 - v), (0.47, 0.57, 0.42), 0.30), 0.86,
              mesh_steps=(2, 2))


def _stem(model: Geometry, head: Vec3, index: int, long_leaves: bool = False,
          axis: Vec3 = (0.0, 1.0, 0.0)) -> None:
    phase = index * 2.39996
    base = (0.24 * math.sin(phase), -1.58 + 0.06 * math.cos(phase),
            0.23 * math.cos(phase))
    end = _add(head, _mul(axis, -0.23))
    curve = _bezier(base, (base[0] * 0.8, -0.80, base[2] * 0.8),
                    (end[0] * 0.65, end[1] - 0.35, end[2] * 0.65), end)
    _tube(model, "stems", curve, 0.013 if long_leaves else 0.016,
          (0.28, 0.41, 0.25), 0.30)
    if index % 3:
        return
    for k, t in enumerate((0.45, 0.60)):
        start = curve(t)
        angle = phase + k * 1.1
        reach = 0.43 if long_leaves else 0.30
        end = _add(start, (reach * math.cos(angle), 0.42 + 0.13 * k,
                           reach * math.sin(angle)))
        _leaf(model, start, end, 0.10 if long_leaves else 0.15,
              (0.27, 0.44, 0.33), roll=0.58 * math.sin(phase))


def _filler_sprig(model: Geometry, side: int, color: Vec3, shift: float = 0.0) -> None:
    a = (side * 0.12, -1.02, -0.15)
    b = (side * 1.74, 1.38 + shift, -0.13)
    main = _bezier(a, (side * 0.62, -0.1, -0.18),
                   (side * 1.45, 0.65 + shift, -0.28), b)
    _tube(model, "stems", main, 0.009, (0.41, 0.53, 0.35), 0.25, 0.68)
    for j in range(10):
        t = 0.37 + j * 0.060
        root = main(t)
        tip = _add(root, (side * (0.15 + 0.12 * math.sin(j * 2.1)),
                          0.15 + 0.12 * math.sin(j * 1.7), 0.10 * math.cos(j)))
        _tube(model, "stems", lambda t, a=root, b=tip: _mix(a, b, t),
              0.005, (0.45, 0.56, 0.38), 0.035, 0.63)
        _floret(model, tip, (side * 0.22, 0.14, 1.0),
                0.055 + 0.014 * math.sin(j), color, j * 1.4)
        if j % 3 == 0:
            _leaf(model, root, _add(root, (side * 0.25, 0.16, 0.02)), 0.055)


def _ribbon(model: Geometry, color: Vec3) -> None:
    def strip(curve: Callable[[float], Vec3], width: float, tail: bool = False) -> PointFn:
        def point(u: float, v: float) -> Vec3:
            q = v * 2 - 1
            p = curve(u)
            a, b = curve(max(0.0, u - 0.001)), curve(min(1.0, u + 0.001))
            side = _unit((-(b[1] - a[1]), b[0] - a[0], 0.08 * math.sin(TAU * u)))
            p = _add(p, _mul(side, q * width * (0.76 + 0.24 * math.sin(math.pi * u))))
            return (p[0], p[1] + (0.11 * abs(q) * u ** 12 if tail else 0.0),
                    p[2] + 0.035 * math.sin(math.pi * v))
        return point

    for side in (-1, 1):
        def loop(t: float, side=side) -> Vec3:
            return (side * (0.07 + 0.73 * math.sin(math.pi * t)),
                    -1.00 + 0.23 * math.sin(TAU * t) + 0.08 * math.sin(math.pi * t),
                    0.42 + 0.18 * math.sin(math.pi * t) + 0.07 * math.cos(TAU * t))
        model.add("ribbon", 1.0, strip(loop, 0.105),
                  _petal_color(color, _mix(color, (1.0, 0.94, 0.88), 0.55)),
                  0.88, resolution=32)
        tail = _bezier((side * 0.05, -1.08, 0.52),
                       (side * 0.12, -1.48, 0.61),
                       (side * 0.64, -1.56, 0.32),
                       (side * 0.44, -1.78, 0.51))
        model.add("ribbon", 0.8, strip(tail, 0.10, True),
                  _petal_color(color, _mix(color, (1.0, 0.94, 0.88), 0.35)),
                  0.91, resolution=32)

    def knot(u: float, v: float) -> Vec3:
        theta, phi = TAU * u, math.pi * v
        return (0.14 * math.sin(phi) * math.cos(theta),
                -1.03 + 0.115 * math.cos(phi),
                0.58 + 0.09 * math.sin(phi) * math.sin(theta))

    model.add("ribbon", 0.38, knot, _mix(color, (1.0, 0.90, 0.85), 0.22),
              0.90, kind="sphere")


def _ranunculus(model: Geometry, center: Vec3, radius: float, color: Vec3,
                roll: float = 0.0, normal: Vec3 = (0.0, 0.0, 1.0)) -> None:
    _double_flower(model, "ranunculus", _frame(center, normal, radius, roll), radius, color)


def _dahlia(model: Geometry, center: Vec3, radius: float, color: Vec3,
            roll: float = 0.0, normal: Vec3 = (0.0, 0.0, 1.0)) -> None:
    transform = _frame(center, normal, radius, roll)
    for layer, petals in enumerate((8, 11, 14, 17, 20)):
        for j in range(petals):
            theta = j * TAU / petals + layer * 0.48

            def point(u: float, v: float, layer=layer, theta=theta) -> Vec3:
                q = 2 * v - 1
                r = 0.025 + layer * 0.11 + (0.22 + layer * 0.09) * u
                width = q * (0.075 + layer * 0.021) * math.sin(math.pi * u) ** 0.75
                z = (0.43 - layer * 0.12 + 0.30 * math.sin(math.pi * u)
                     - 0.15 * u ** 6 + 0.19 * q * q * math.sin(math.pi * u))
                return transform((r * math.cos(theta) - width * math.sin(theta),
                                  r * math.sin(theta) + width * math.cos(theta), z))

            model.add("flowers", radius * radius * (0.24 + layer * 0.15) / petals,
                      point, _petal_color(_mul(color, 0.96), _mix(color, (1.0, 0.85, 0.75), 0.23)),
                      0.92, contour=True, resolution=10)


def _lisianthus(model: Geometry, center: Vec3, radius: float, color: Vec3,
                roll: float = 0.0, normal: Vec3 = (0.0, 0.0, 1.0)) -> None:
    transform = _frame(center, normal, radius, roll)
    for layer, petals in enumerate((5, 7)):
        for j in range(petals):
            theta = j * TAU / petals + layer * 0.50

            def point(u: float, v: float, theta=theta, layer=layer) -> Vec3:
                q = 2 * v - 1
                r = 0.035 + (0.73 + layer * 0.14) * u
                width = q * (0.40 + layer * 0.09) * math.sin(math.pi * u) ** 0.55
                z = (-0.40 + 0.70 * u ** 0.65 - layer * 0.11
                     + 0.10 * q * q * math.sin(math.pi * u)
                     + 0.060 * math.sin(q * 5 * math.pi + theta) * u ** 5)
                return transform((r * math.cos(theta) - width * math.sin(theta),
                                  r * math.sin(theta) + width * math.cos(theta), z))

            model.add("flowers", radius * radius / petals, point,
                      _petal_color(color, _mix(color, (1.0, 0.97, 0.90), 0.45),
                                   (0.77, 0.79, 0.45)), 1.02, contour=True, resolution=14)
    _floret(model, _add(center, _mul(_unit(normal), -radius * 0.17)), normal,
            radius * 0.15, (0.89, 0.76, 0.35), roll)


_THEME_MIX = {
    "rose": (("rose", 13), ("ranunculus", 8), ("lisianthus", 6), ("dahlia", 5), ("cosmos", 4)),
    "tulip": (("tulip", 12), ("ranunculus", 8), ("lisianthus", 8), ("cosmos", 4), ("rose", 4)),
    "hydrangea": (("hydrangea", 8), ("rose", 8), ("ranunculus", 8), ("lisianthus", 8), ("cosmos", 4)),
    "wildflower": (("rose", 8), ("ranunculus", 8), ("dahlia", 6), ("cosmos", 7), ("lisianthus", 7)),
    "peony": (("peony", 10), ("rose", 8), ("ranunculus", 8), ("dahlia", 6), ("lisianthus", 4)),
    "lily": (("lily", 10), ("rose", 8), ("lisianthus", 8), ("ranunculus", 6), ("cosmos", 4)),
    "sunflower": (("sunflower", 10), ("dahlia", 8), ("cosmos", 8), ("ranunculus", 6), ("lisianthus", 4)),
    "calla": (("calla", 10), ("rose", 8), ("lisianthus", 8), ("ranunculus", 6), ("cosmos", 4)),
}


_THEME_COLORS = {
    "rose": (0.94, 0.58, 0.72), "tulip": (0.98, 0.75, 0.74),
    "hydrangea": (0.61, 0.71, 0.94), "wildflower": (0.97, 0.72, 0.59),
    "peony": (0.94, 0.55, 0.69), "lily": (0.98, 0.92, 0.83),
    "sunflower": (0.99, 0.78, 0.26), "calla": (0.89, 0.82, 0.95),
}


def _head_color(theme: str, species: str, index: int) -> Vec3:
    base = _THEME_COLORS[theme]
    if index % 9 == 8:
        return (0.99, 0.95, 0.88)
    return _mix(base, (1.0, 0.96, 0.93), (index % 4) * 0.055)


def _tonal_pigment(pigment: PigmentFn, color: Vec3) -> PigmentFn:
    def tonal(u: float, v: float) -> Vec3:
        level = max(pigment(u, v))
        target = _mix(color, (1.0, 0.97, 0.93), 0.22 * u ** 4)
        return tuple(_clamp(c * level / max(color)) for c in target)
    return tonal


def _arrange_heads(bouquet_id: str) -> list[FlowerHead]:
    """A filled, staggered floral crown, not a shell with an empty rear hemisphere."""
    if bouquet_id not in _THEME_MIX:
        raise ValueError(f"Unknown bouquet id: {bouquet_id}")
    theme_index = tuple(_THEME_MIX).index(bouquet_id)
    rng = random.Random(SEED + theme_index * 431)
    species = [kind for kind, count in _THEME_MIX[bouquet_id] for _ in range(count)]
    rng.shuffle(species)
    primary = "rose" if bouquet_id == "wildflower" else bouquet_id
    anchor_species = (("rose", "ranunculus", "dahlia") * 2 if bouquet_id == "wildflower"
                      else (primary,) * 6)
    for kind in anchor_species:
        species.remove(kind)
    anchors = {0, 2, 4, 6, 8, 10}
    ordered_species = [anchor_species[i // 2] if i in anchors else species.pop()
                       for i in range(36)]
    heads = []
    layers = (("outer", 12), ("middle", 12), ("top", 7), ("inner", 5))
    for layer, count in layers:
        phase = rng.uniform(0, TAU)
        for j in range(count):
            angle = phase + j * TAU / count + rng.uniform(-0.12, 0.12)
            if layer == "outer":
                radial, height, tilt = rng.uniform(1.12, 1.36), rng.uniform(0.44, 0.83), rng.uniform(0.12, 0.30)
            elif layer == "middle":
                radial, height, tilt = rng.uniform(0.95, 1.18), rng.uniform(1.15, 1.55), rng.uniform(0.35, 0.65)
            elif layer == "top":
                top_min = 0.60 if bouquet_id in ("rose", "calla") else 0.22
                radial, height, tilt = rng.uniform(top_min, 0.75), rng.uniform(1.90, 2.20), rng.uniform(0.70, 1.15)
            else:
                radial, height, tilt = rng.uniform(0.16, 0.60), 0.85 + j * 0.18, rng.uniform(0.45, 1.10)
            center = (radial * math.cos(angle), height, radial * math.sin(angle))
            axis = _unit((math.cos(angle + rng.uniform(-0.16, 0.16)), tilt,
                          math.sin(angle + rng.uniform(-0.16, 0.16))))
            if bouquet_id in ("rose", "wildflower") and layer == "middle":
                c, s = math.cos(math.pi / 12), math.sin(math.pi / 12)
                center = (center[0] * c - center[2] * s, center[1], center[0] * s + center[2] * c)
                axis = (axis[0] * c - axis[2] * s, axis[1], axis[0] * s + axis[2] * c)
            kind = ordered_species[len(heads)]
            if len(heads) in anchors:
                radius = rng.uniform(0.65, 0.72)
            elif kind == "cosmos":
                radius = rng.uniform(0.25, 0.34)
            elif bouquet_id == "rose" and layer in ("middle", "top"):
                radius = rng.uniform(0.50, 0.58)
            elif bouquet_id == "wildflower" and layer in ("middle", "top"):
                radius = rng.uniform(0.46, 0.52)
            else:
                radius = rng.uniform(0.40, 0.52)
            if bouquet_id == "calla" and layer in ("middle", "top") and kind not in ("calla", "cosmos"):
                radius = 0.50 + (radius - 0.40) * (2 / 3)
            if bouquet_id == "calla" and layer == "middle":
                c, s = math.cos(math.radians(30.0)), math.sin(math.radians(30.0))
                center = (center[0] * c - center[2] * s, center[1], center[0] * s + center[2] * c)
                axis = (axis[0] * c - axis[2] * s, axis[1], axis[0] * s + axis[2] * c)
                radial = math.hypot(center[0], center[2])
                fraction = max(0., min(1., (radial - .95) / .23))
                scale = (1.15 + (1.34 - 1.15) * fraction) / radial
                center = (center[0] * scale, center[1], center[2] * scale)
            heads.append(FlowerHead(kind, center, axis, radius, layer))
    # Preserve sampling order and the fitted transform sequence.
    if bouquet_id in ("peony", "sunflower"):
        adjusted = []
        for head in heads:
            radius, center, axis = head.radius, head.center, head.axis
            if (head.layer in ("middle", "top")
                    and head.species in ("peony", "rose", "ranunculus", "dahlia", "lisianthus")):
                radius = 0.5 + (0.58 - 0.5) * max(0.0, min(1.0, (radius - 0.40) / 0.12))
            angle = {'peony': 30.0, 'sunflower': 0}[bouquet_id]
            if angle and head.layer == "middle":
                c, s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
                x, y, z = center
                nx, ny, nz = axis
                center = (x * c - z * s, y, x * s + z * c)
                axis = (nx * c - nz * s, ny, nx * s + nz * c)
            minimum = 1.12
            if bouquet_id == "peony" and minimum is not None and head.layer == "middle":
                radial = math.hypot(center[0], center[2])
                fraction = max(0.0, min(1.0, (radial - 0.95) / (1.18 - 0.95)))
                target = minimum + (1.34 - minimum) * fraction
                scale = target / radial
                center = (center[0] * scale, center[1], center[2] * scale)
            adjusted.append(replace(head, radius=radius, center=center, axis=axis))
        heads = adjusted
    if bouquet_id == "wildflower":
        # Open one supporting back-left rose toward the thin sector, not the six hero heads.
        head = heads[11]
        c, s = math.cos(math.radians(-40)), math.sin(math.radians(-40))
        x, y, z = head.axis
        heads[11] = replace(head, radius=min(.52, head.radius * 1.15),
                            axis=(x * c - z * s, y, x * s + z * c))
    return heads


def _cupped_surface(surface: Surface, head: FlowerHead) -> PointFn:
    point, axis = surface.point, head.axis
    if head.species == "ranunculus" and head.radius < .65:
        return point  # Existing micro-cups already use the full 2% triangulation error budget.
    amount = head.radius * .06
    if head.species == "hydrangea":
        root, tip = point(0.0, .5), point(1.0, .5)
        axis = _unit(tuple(a - b for a, b in zip(root, head.center)))
        amount = .06 * math.dist(root, tip)
    def cupped(u: float, v: float) -> Vec3:
        bend = amount * math.sin(math.pi * u) ** 2 * ((2 * v - 1) ** 2 - .35)
        return _add(point(u, v), _mul(axis, bend))
    return cupped


def _closed_petal(surface: Surface, head: FlowerHead, index: int, count: int,
                  floret_frame: tuple[Vec3, Vec3] | None = None) -> PointFn:
    """Rooted cupped bud sheets; each hydrangea floret keeps its own axis/base."""
    point = surface.point
    root, tip = point(0.0, .5), point(1.0, .5)
    hydro = head.species == "hydrangea"
    origin = floret_frame[0] if floret_frame else (root if hydro else head.center)
    axis = floret_frame[1] if floret_frame else (
        _unit(tuple(a - b for a, b in zip(root, head.center))) if hydro else head.axis)
    length = max(.005, math.dist(root, tip))
    radius = length if hydro else min(head.radius, length)
    delta = tuple(a - b for a, b in zip(tip, origin))
    radial = _add(delta, _mul(axis, -sum(a * b for a, b in zip(delta, axis))))
    if sum(x * x for x in radial) < 1e-12:
        radial = _cross(axis, (0.0, 1.0, 0.0) if abs(axis[1]) < .95 else (1.0, 0.0, 0.0))
    radial = _unit(radial)
    tangent = _unit(_cross(axis, radial))
    fraction = index / max(1, count - 1)
    root_delta = tuple(a - b for a, b in zip(root, origin))
    root_height = sum(a * b for a, b in zip(root_delta, axis))
    root_radial = _add(root_delta, _mul(axis, -root_height))
    width = min(radius * .20, math.dist(point(.5, .1), point(.5, .9)) * .30)
    detail = surface.kind != "sheet" or surface.mesh_steps in ((1, 4), (24, 2))
    def closed(u: float, v: float) -> Vec3:
        # The unchanged collar also preserves derivatives at shared root vertices.
        if u <= .03:
            return point(u, v)
        if detail:
            base = point(0.0, v)
            target = _add(base, _mul(tuple(a - b for a, b in zip(point(u, v), base)), .25))
        else:
            q, arc = 2 * v - 1, math.sin(math.pi * u)
            reach = radius * ((.20 + .11 * fraction) * arc + (.035 + .04 * fraction) * u
                              + .045 * q * q * arc)
            lift = (.90 if head.species == "calla" else .64) * length
            height = root_height + lift * (1 + .10 * fraction) * math.sin(math.pi * u / 2)
            height += length * .035 * (1 - q * q) * arc
            target = _add(origin, _add(_mul(axis, height),
                     _add(_mul(root_radial, 1 - u), _add(_mul(radial, reach),
                          _mul(tangent, q * width * arc * (1 - .55 * u))))))
        if u >= .13:
            return target
        t = (u - .03) / .10
        return _mix(point(u, v), target, t * t * (3 - 2 * t))
    return closed


def _add_head(model: Geometry, head: FlowerHead, color: Vec3, index: int, *, extra_cup: bool = True) -> None:
    start = len(model.sections["flowers"])
    if head.species == "hydrangea":
        _hydrangea(model, head.center, head.radius, index)
    else:
        flower = {"rose": _rose, "tulip": _tulip, "peony": _peony, "lily": _lily,
                  "sunflower": _sunflower, "calla": _calla, "cosmos": _cosmos,
                  "ranunculus": _ranunculus, "dahlia": _dahlia, "lisianthus": _lisianthus}[head.species]
        roll = index * 2.39996
        if head.species == "calla":
            roll = math.pi + 0.18 * math.sin(roll)
        flower(model, head.center, head.radius, color, roll, normal=head.axis)
    surfaces = model.sections["flowers"][start:]
    total = sum(surface.weight for surface in surfaces)
    def mesh_steps(surface: Surface, surface_index: int) -> tuple[int, int] | None:
        if surface.mesh_steps is not None:
            return surface.mesh_steps
        if surface.kind != "sheet":
            return None
        if head.species == "hydrangea":
            if surface_index % 5 == 4:
                return (1, 4)
            return (3, 2) if head.radius >= 0.65 else (2, 2)
        if head.species in ("calla", "lily", "tulip"):
            if head.radius >= 0.65:
                return (16, 20) if head.species == "calla" else (7, 4)
            return (12, 16) if head.species == "calla" else (6, 3)
        if head.radius >= 0.65:
            return (6, 4)
        if head.species == "ranunculus":
            # Narrow cupped florets retain their outer-ring longitudinal curvature.
            return (3, 2) if surface_index < 30 else (4, 2)
        micro_petals = {"rose": 12, "dahlia": 19, "peony": 16}
        if surface_index < micro_petals.get(head.species, 0):
            return (3, 2)
        return (5, 3) if head.radius >= 0.40 else (3, 2)

    # Allocate by head area, not by the number of petals/florets in that species.
    shaped = []
    floret_frame = None
    for j, surface in enumerate(surfaces):
        if head.species == "hydrangea" and j % 5 == 0:
            group = surfaces[j:j + 5]
            base = tuple(sum(s.point(0., .5)[k] for s in group[:4]) / 4 for k in range(3))
            eye = group[4].point(0., .5)
            floret_frame = (base, _unit(tuple(a - b for a, b in zip(eye, base))))
        steps = mesh_steps(surface, j)
        pigment = (surface.pigment if surface.kind == "tube" or steps == (1, 4)
                   else _tonal_pigment(surface.pigment, color))
        # Root-axis flowers own both their transverse cup and matching bud sweep.
        # A second global-axis bend would separate their attachment collars.
        if (extra_cup and surface.closed_point is None and surface.kind == "sheet"
                and steps != (1, 4)):
            surface = replace(surface, point=_cupped_surface(surface, head))
        surface = replace(surface, pigment=pigment, mesh_steps=steps)
        delay = .08 + .46 * (1 - j / max(1, len(surfaces) - 1)) + .05 * ((index * 3) % 7) / 6
        shaped.append(replace(surface, weight=surface.weight / total * head.radius ** 2,
                              closed_point=surface.closed_point or _closed_petal(surface, head, j, len(surfaces), floret_frame),
                              growth_delay=delay))
    model.sections["flowers"][start:] = shaped
    model.heads.append(head)
    _stem(model, head.center, index, head.species in ("tulip", "lily", "calla"), head.axis)


def _berry(model: Geometry, center: Vec3, radius: float, color: Vec3) -> None:
    def point(u: float, v: float) -> Vec3:
        phi, theta = math.pi * u, TAU * v
        return _add(center, (radius * math.sin(phi) * math.cos(theta),
                             radius * math.cos(phi), radius * math.sin(phi) * math.sin(theta)))
    model.add("flowers", radius * radius * 1.1, point, color, 0.83, kind="sphere",
              mesh_steps=(6, 8))


def _greenery(model: Geometry, theme_index: int) -> None:
    for j in range(12):
        angle = j * TAU / 12 + theme_index * 0.19
        radial = (math.cos(angle), 0.0, math.sin(angle))
        side = (-radial[2], 0.0, radial[0])
        start = _add(_mul(radial, 0.30), (0.0, -0.62, 0.0))
        end = _add(_mul(radial, 1.92 + 0.08 * math.sin(j * 2.7)),
                   (0.0, 0.08 + 0.09 * math.sin(j * 1.7), 0.0))
        curve = _bezier(start, _add(start, (0.0, 0.5, 0.0)),
                        _add(end, (0.0, -0.20, 0.0)), end)
        _tube(model, "stems", curve, 0.009, (0.40, 0.52, 0.39), 0.09, 0.72)
        for k in range(5):
            root = curve(0.42 + k * 0.12)
            for sign in (-1, 1):
                tip = _add(root, _add(_mul(side, sign * (0.23 - k * 0.016)),
                                      _add(_mul(radial, 0.12), (0.0, 0.12, 0.0))))
                _leaf(model, root, tip, 0.12 - k * 0.007, (0.42, 0.56, 0.48),
                      roll=sign * 0.48 + j * 0.17)
    for j in range(6):
        angle = j * TAU / 6 + 0.47 + theme_index * 0.13
        radial = (math.cos(angle), 0.0, math.sin(angle))
        side = (-radial[2], 0.0, radial[0])
        a, b = _add(_mul(radial, 0.48), (0.0, 0.12, 0.0)), _add(_mul(radial, 2.10), (0.0, 1.28 + 0.24 * math.sin(j), 0.0))
        curve = _bezier(a, _add(a, (0.0, 0.8, 0.0)), _add(b, (0.0, 0.25, 0.0)), b)
        _tube(model, "stems", curve, 0.005, (0.38, 0.49, 0.32), 0.06, 0.65)
        for k in range(9):
            root = curve(0.22 + k * 0.085)
            length = 0.28 * (1.0 - k / 11)
            for sign in (-1, 1):
                tip = _add(root, _add(_mul(side, sign * length), _mul(radial, 0.10)))
                _leaf(model, root, tip, 0.035, (0.35, 0.49, 0.32), sign * 0.30)


def _bud(model: Geometry, center: Vec3, axis: Vec3, radius: float, color: Vec3) -> None:
    transform = _frame(center, axis, radius)
    for j in range(4):
        def point(u: float, v: float, j=j) -> Vec3:
            theta = (j + v * 1.05) * math.pi / 2
            r = 0.58 * math.sin(math.pi * u) * (1.0 - 0.12 * abs(v * 2 - 1))
            return transform((r * math.cos(theta), r * math.sin(theta), 2 * u - 1))

        model.add("flowers", radius * radius * 0.18, point,
                  lambda u, v, color=color: _mix((0.45, 0.57, 0.32), color, min(1.0, u * 3)),
                  0.83, contour=True, resolution=8)


def _accent_sprigs(model: Geometry, theme_index: int) -> None:
    for j in range(12):
        angle = j * TAU / 12 + 0.22 + theme_index * 0.21
        radial = (math.cos(angle), 0.0, math.sin(angle))
        side = (-radial[2], 0.0, radial[0])
        root = _add(_mul(radial, 0.70), (0.0, 0.72, 0.0))
        tip = _add(_mul(radial, 1.65 + 0.12 * math.sin(j * 2.1)),
                   (0.0, 2.25 + 0.35 * math.sin(j * 1.7), 0.0))
        curve = _bezier(root, _add(root, (0.0, 0.7, 0.0)), _add(tip, (0.0, -0.18, 0.0)), tip)
        _tube(model, "stems", curve, 0.006, (0.40, 0.51, 0.34), 0.07, 0.65)
        for k in range(5):
            base = curve(0.58 + k * 0.095)
            end = _add(base, _add(_mul(side, (1 if k % 2 else -1) * 0.14), (0.0, 0.08, 0.0)))
            _tube(model, "stems", lambda u, a=base, b=end: _mix(a, b, u),
                  0.003, (0.46, 0.57, 0.38), 0.015, 0.60)
            theme = tuple(_THEME_MIX)[theme_index]
            color = ((0.99, 0.95, 0.88) if j % 6 == 0 else _head_color(theme, "floret", j + k))
            axis = _unit(_add(radial, (0.0, 0.45, 0.0)))
            if k == 4 and j % 2 == 0:
                _bud(model, end, axis, 0.085, color)
            else:
                _floret(model, end, axis, 0.065 + 0.009 * (k % 3), color, j + k * 0.7)
        if j % 3 == 0:
            for k in range(5):
                base = curve(0.30 + k * 0.10)
                end = _add(base, _add(_mul(side, (k % 2 * 2 - 1) * 0.17), (0.0, 0.10, 0.0)))
                _tube(model, "stems", lambda u, a=base, b=end: _mix(a, b, u),
                      0.003, (0.40, 0.46, 0.28), 0.01, 0.60)
                _berry(model, end, 0.047, _mul(_THEME_COLORS[tuple(_THEME_MIX)[theme_index]], .72))


def _build_geometry(bouquet_id: str) -> Geometry:
    model = Geometry()
    heads = _arrange_heads(bouquet_id)
    for i, head in enumerate(heads):
        _add_head(model, head, _head_color(bouquet_id, head.species, i), i,
                  extra_cup=bouquet_id != "wildflower")
    theme_index = tuple(_THEME_MIX).index(bouquet_id)
    _greenery(model, theme_index)
    _accent_sprigs(model, theme_index)
    ribbon = ((0.72, 0.42, 0.52), (0.77, 0.62, 0.48), (0.59, 0.57, 0.74),
              (0.76, 0.56, 0.43), (0.76, 0.45, 0.56), (0.73, 0.64, 0.51),
              (0.72, 0.54, 0.29), (0.69, 0.58, 0.75))[theme_index]
    _ribbon(model, ribbon)
    return model


_LIGHT = _unit((-0.35, 0.55, 0.76))


def _surface_normal(surface: Surface, u: float, v: float, *, closed: bool = False) -> Vec3:
    """World-space partial derivatives; one-sided differences at domain edges.

    Dividing by the positive parameter interval avoids flipping normals at u/v=1.
    A collapsed pole/point has no unique normal and uses the stable +z fallback.
    """
    step = 0.0001
    ua, ub = max(0.0, u - step), min(1.0, u + step)
    va, vb = max(0.0, v - step), min(1.0, v + step)
    point = surface.closed_point if closed and surface.closed_point is not None else surface.point
    a, b = point(ua, v), point(ub, v)
    c, d = point(u, va), point(u, vb)
    du = tuple((y - x) / (ub - ua) for x, y in zip(a, b))
    dv = tuple((y - x) / (vb - va) for x, y in zip(c, d))
    return _unit(_cross(du, dv))


def _surface_color(surface: Surface, u: float, v: float, p: Vec3 | None = None,
                   *, preview: bool = False) -> Vec3:
    # Binary pigments stay unlit; only static SVG previews bake a gentle light.
    color = surface.pigment(u, v)
    shade = 1.0
    if preview and surface.shade:
        normal = _surface_normal(surface, u, v)
        shade = 0.72 + 0.28 * abs(sum(a * b for a, b in zip(normal, _LIGHT)))
    return tuple(_clamp(c * shade) for c in color)


def _quantized_growth(pose: GrowthPose) -> tuple[int, ...]:
    values = tuple(round(c * 4096) for c in pose[:3]) + tuple(round(c * 32767) for c in pose[3:6])
    if not all(-32768 <= value <= 32767 for value in values):
        raise ValueError("growth position/normal exceeds Int16 range")
    return (*values, round(_clamp(pose[6]) * 65535))


def _growth_pose(surface: Surface, u: float, v: float, opened: tuple[float, ...]) -> GrowthPose:
    opened = struct.unpack("<6f", struct.pack("<6f", *opened))
    if surface.closed_point is None:
        return (*opened, 0.0)
    point = surface.closed_point(u, v)
    normal = _surface_normal(surface, u, v, closed=True)
    closed = (*point, *normal)
    if struct.unpack("<6f", struct.pack("<6f", *closed)) == opened:
        return (*opened, 0.0)
    pose = (*closed, surface.growth_delay)
    if _quantized_growth(pose)[:6] == _quantized_growth((*opened, 0.0))[:6]:
        return (*opened, 0.0)
    return pose


def _stratified_uv(count: int, rng: random.Random):
    """Jitter both axes in balanced 2-D cells, without piling samples on the rim."""
    rows = max(1, math.isqrt(count))
    for row, columns in enumerate(_allocate(count, [1.0] * rows)):
        for column in range(columns):
            yield (row + rng.random()) / rows, (column + rng.random()) / columns


def _sample_bouquet(bouquet_id: str, count: int, with_growth: bool):
    if count < 1:
        raise ValueError("count must be positive")
    ids = [item["id"] for item in BOUQUETS]
    if bouquet_id not in ids:
        raise ValueError(f"Unknown bouquet id: {bouquet_id}")
    rng = random.Random(SEED + ids.index(bouquet_id) * 7_919)
    model = _build_geometry(bouquet_id)
    budgets = _allocate(count, [0.850, 0.060, 0.025, 0.065])
    particles, growth = [], []
    for surfaces, budget in zip(model.sections.values(), budgets):
        allocations = _allocate(budget, [surface.weight for surface in surfaces])
        for surface, n in zip(surfaces, allocations):
            for u, v in _stratified_uv(n, rng):
                p = surface.point(u, v)
                color = _surface_color(surface, u, v, p)
                size = max(.60, min(1.80, surface.size * rng.uniform(.78, 1.02)))
                normal = _surface_normal(surface, u, v)
                particles.append((*p, *color, size, rng.random() * TAU, *normal))
                if with_growth:
                    growth.append(_growth_pose(surface, u, v, (*p, *normal)))
    order = list(range(len(particles)))
    rng.shuffle(order)
    return [particles[i] for i in order], [growth[i] for i in order] if with_growth else []


def generate_bouquet(bouquet_id: str, count: int = COUNT) -> list[Particle]:
    return _sample_bouquet(bouquet_id, count, False)[0]


def generate_bouquet_with_growth(bouquet_id: str, count: int = COUNT) -> tuple[list[Particle], list[GrowthPose]]:
    return _sample_bouquet(bouquet_id, count, True)

def encode_particles(particles: list[Particle]) -> bytes:
    data = bytearray(len(particles) * RECORD.size)
    for index, particle in enumerate(particles):
        RECORD.pack_into(data, index * RECORD.size, *particle)
    return bytes(data)


def _tessellate_geometry(geometry: Geometry, *, growth: list[tuple[int, ...]] | None = None) -> tuple[list[tuple[float, ...]], list[int]]:
    """Evaluate the very same sheets as a compact, indexed, unlit triangle mesh."""
    vertices: list[tuple[float, ...]] = []
    indices: list[int] = []
    poses: list[tuple[int, ...]] = []
    for surfaces in geometry.sections.values():
        for surface in surfaces:
            nu, nv = surface.mesh_steps or (
                ((8, 6) if surface.weight >= 0.15 else (4, 4)) if surface.kind == "tube" else
                (8, 10) if surface.kind == "sphere" else
                (6, 4) if surface.weight >= 0.02 else (3, 2))
            base = len(vertices)
            for i in range(nu + 1):
                u = i / nu
                for j in range(nv + 1):
                    v = j / nv
                    values = (*surface.point(u, v), *_surface_color(surface, u, v),
                              *_surface_normal(surface, u, v))
                    # Reject pole/seam triangles using the actual stored Float32 positions.
                    vertex = MESH_VERTEX.unpack(MESH_VERTEX.pack(*values))
                    vertices.append(vertex)
                    poses.append(_quantized_growth(_growth_pose(surface, u, v, (*vertex[:3], *vertex[6:9]))))
            for i in range(nu):
                for j in range(nv):
                    a = base + i * (nv + 1) + j
                    b, d = a + nv + 1, a + 1
                    c = b + 1
                    for triangle in ((a, b, c), (a, c, d)):
                        p, q, r = (vertices[index][:3] for index in triangle)
                        cross = _cross(tuple(y - x for x, y in zip(p, q)),
                                       tuple(y - x for x, y in zip(p, r)))
                        if sum(value * value for value in cross) > 1e-18:
                            indices.extend(triangle)
    # Weld only identical stored open fields AND quantized closed position/normal/delay.
    used = set(indices)
    remap = {}
    packed = []
    unique = {}
    for old_index, vertex in enumerate(vertices):
        if old_index in used:
            key = (*vertex, *poses[old_index])
            new_index = unique.get(key)
            if new_index is None:
                new_index = len(packed)
                unique[key] = new_index
                packed.append(vertex)
                if growth is not None:
                    growth.append(poses[old_index])
            remap[old_index] = new_index
    return packed, [remap[index] for index in indices]


def encode_mesh(geometry: Geometry, *, growth: list[tuple[int, ...]] | None = None) -> bytes:
    vertices, indices = _tessellate_geometry(geometry, growth=growth)
    size = MESH_HEADER.size + len(vertices) * MESH_VERTEX.size + len(indices) * 4
    if size >= 3_000_000:
        raise ValueError(f"mesh asset exceeds 3 MB: {size}")
    data = bytearray(size)
    MESH_HEADER.pack_into(data, 0, b"BFM1", len(vertices), len(indices))
    offset = MESH_HEADER.size
    for vertex in vertices:
        MESH_VERTEX.pack_into(data, offset, *vertex)
        offset += MESH_VERTEX.size
    for index in indices:
        struct.pack_into("<I", data, offset, index)
        offset += 4
    return bytes(data)


def encode_growth(particle_poses: list[GrowthPose], geometry: Geometry, *,
                  mesh_poses: list[tuple[int, ...]] | None = None) -> bytes:
    if mesh_poses is None:
        mesh_poses = []
        _tessellate_geometry(geometry, growth=mesh_poses)
    size = GROWTH_HEADER.size + GROWTH_RECORD.size * (len(particle_poses) + len(mesh_poses))
    if size > 3_000_000:
        raise ValueError(f"growth asset exceeds 3 MB: {size}")
    data = bytearray(size)
    GROWTH_HEADER.pack_into(data, 0, b"BFG1", len(particle_poses), len(mesh_poses))
    offset = GROWTH_HEADER.size
    for pose in particle_poses:
        GROWTH_RECORD.pack_into(data, offset, *_quantized_growth(pose))
        offset += GROWTH_RECORD.size
    for pose in mesh_poses:
        GROWTH_RECORD.pack_into(data, offset, *pose)
        offset += GROWTH_RECORD.size
    return bytes(data)


def _hex(color: Vec3) -> str:
    return "#" + "".join(f"{round(_clamp(c) * 255):02x}" for c in color)


def _project_mesh(geometry: Geometry) -> list[str]:
    """Project real sheet boundaries and closed tube patches in depth order."""
    fragments: list[tuple[float, str]] = []
    gradients: list[str] = []
    serial = 0

    def path(points: list[Vec3], close: bool = False) -> str:
        return ("M" + "L".join(f"{p[0]:.4f},{-p[1]:.4f}" for p in points)
                + ("Z" if close else ""))

    for section, surfaces in geometry.sections.items():
        for surface in surfaces:
            serial += 1
            if surface.kind == "sheet":
                n = surface.resolution
                boundary = ([surface.point(i / n, 0.0) for i in range(n + 1)]
                            + [surface.point(1.0, j / n) for j in range(1, n + 1)]
                            + [surface.point(1.0 - i / n, 1.0) for i in range(1, n + 1)]
                            + [surface.point(0.0, 1.0 - j / n) for j in range(1, n)])
                a, b = surface.point(0.0, 0.5), surface.point(1.0, 0.5)
                name = f"s{serial}"
                gradients.append(f'<linearGradient id="{name}" gradientUnits="userSpaceOnUse" '
                                 f'x1="{a[0]:.4f}" y1="{-a[1]:.4f}" '
                                 f'x2="{b[0]:.4f}" y2="{-b[1]:.4f}">')
                for u in (0.0, 0.40, 0.78, 1.0):
                    color = _hex(_surface_color(surface, u, 0.25 if section == "leaves" else 0.5,
                                                preview=True))
                    gradients.append(f'<stop offset="{u}" stop-color="{color}"/>')
                gradients.append('</linearGradient>')
                z = sum(p[2] for p in boundary) / len(boundary)
                fragments.append((z, f'<path d="{path(boundary, True)}" fill="url(#{name})"/>'))
                if section == "leaves":
                    vein = [surface.point(i / 20, 0.5) for i in range(21)]
                    color = _hex(_mix(surface.pigment(0.5, 0.2), (0.60, 0.70, 0.46), 0.35))
                    fragments.append((z + 0.004, f'<path d="{path(vein)}" fill="none" '
                                      f'stroke="{color}" stroke-width=".004" opacity=".7"/>'))
                    for u in (0.22, 0.38, 0.54, 0.70, 0.83):
                        for side in (0.05, 0.95):
                            branch = [surface.point(u + t * 0.10, 0.5 + (side - 0.5) * t)
                                      for t in (0.0, 0.25, 0.5, 0.75, 1.0)]
                            fragments.append((z + 0.003, f'<path d="{path(branch)}" fill="none" '
                                              f'stroke="{color}" stroke-width=".002" opacity=".35"/>'))
            else:
                # A wrapped tube has no useful silhouette in parameter-space:
                # retain small surface patches for stems, anthers and the knot.
                nu, nv = (24, 12) if surface.kind == "sphere" else (16, 4)
                grid = [[surface.point(i / nu, j / nv) for j in range(nv + 1)]
                        for i in range(nu + 1)]
                for i in range(nu):
                    for j in range(nv):
                        corners = [grid[i][j], grid[i + 1][j],
                                   grid[i + 1][j + 1], grid[i][j + 1]]
                        color = _hex(_surface_color(surface, (i + 0.5) / nu, (j + 0.5) / nv,
                                                    preview=True))
                        z = sum(p[2] for p in corners) / 4
                        fragments.append((z, f'<path d="{path(corners, True)}" fill="{color}" '
                                          f'stroke="{color}" stroke-width=".0015"/>'))
            if surface.contour:
                for u, shade, width in ((0.88, 0.90, 0.0025), (1.0, 1.06, 0.0025)):
                    points = [surface.point(u, j / 24) for j in range(25)]
                    color = _hex(_mul(surface.pigment(u, 0.5), shade))
                    fragments.append((sum(p[2] for p in points) / len(points) + 0.003,
                                      f'<path d="{path(points)}" fill="none" stroke="{color}" '
                                      f'stroke-width="{width}" stroke-linecap="round"/>'))
    return (["<defs>", *gradients, "</defs>"]
            + [fragment for _, fragment in sorted(fragments, key=lambda item: item[0])])


def render_svg(particles: list[Particle], title: str, description: str,
               geometry: Geometry | None = None) -> str:
    """Orthographic +z projection, with optional same-surface vector underpainting.

    A mesh uses exactly the same surface evaluators, colors and world coordinates
    as the binary particles. The texture is a subset of those actual particles;
    no separately composed illustration or external image is involved.
    """
    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="636" height="714" '
        'viewBox="-2.65 -3.30 5.3 5.85" role="img" aria-labelledby="title desc">',
        f'<title id="title">{html.escape(title)}</title>',
        f'<desc id="desc">{html.escape(description)}</desc>',
    ]
    if geometry is not None:
        lines.append('<g stroke-linejoin="round">')
        lines.extend(_project_mesh(geometry))
        lines.append('</g><g stroke="none" opacity=".24">')
    else:
        lines.append('<g stroke="none">')
    step, radius = (4, 0.0065) if geometry is not None else (2, 0.012)
    for p in sorted(particles[::step], key=lambda point: point[2]):
        lines.append(f'<circle cx="{p[0]:.4f}" cy="{-p[1]:.4f}" '
                     f'r="{p[6] * radius:.4f}" fill="{_hex(p[3:6])}"/>')
    lines.extend(("</g>", "</svg>", ""))
    return "\n".join(lines)


def _head_composition(bouquet_id: str) -> list[dict[str, str | int]]:
    """Manifest metadata follows actual arranged heads, not marketing copy."""
    counts: dict[str, int] = {}
    for head in _arrange_heads(bouquet_id):
        counts[head.species] = counts.get(head.species, 0) + 1
    return [{"species": species, "count": count} for species, count in counts.items()]


def generate_assets(output: str | Path = Path("site/assets"), *, include_growth: bool = True) -> dict:
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    manifest = {"version": 2, "count": COUNT, "stride": STRIDE,
                "bouquets": [dict(item, composition=_head_composition(item["id"]),
                                  **({"growth": f'{item["id"]}.growth'} if include_growth else {}))
                             for item in BOUQUETS]}
    for item in BOUQUETS:
        if include_growth:
            particles, poses = generate_bouquet_with_growth(item["id"])
        else:
            particles = generate_bouquet(item["id"])
        (output / item["file"]).write_bytes(encode_particles(particles))
        geometry = _build_geometry(item["id"])
        mesh_poses: list[tuple[int, ...]] = []
        (output / item["surface"]).write_bytes(encode_mesh(geometry, growth=mesh_poses if include_growth else None))
        if include_growth:
            (output / f'{item["id"]}.growth').write_bytes(encode_growth(poses, geometry, mesh_poses=mesh_poses))
        (output / f'{item["id"]}.svg').write_text(
            render_svg(particles, item["title"], item["description"], geometry), encoding="utf-8")
    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="生成可复现的立体粒子花束与同源 SVG 投影")
    parser.add_argument("--output", type=Path, default=Path("site/assets"),
                        metavar="PATH", help="资源输出目录（默认：site/assets）")
    parser.add_argument("--without-growth", action="store_true", help="省略可选 BFG1 生长姿态")
    args = parser.parse_args(argv)
    manifest = generate_assets(args.output, include_growth=not args.without_growth)
    print(f'已生成 {len(manifest["bouquets"])} 组花束，每组 {COUNT} 粒子，'
          f'{STRIDE} 个 Float32LE：{args.output.resolve()}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
