#!/usr/bin/env python3
"""Deterministic, dependency-free botanical surfaces for the particle gallery.

Coordinates are world-space: +y is up and +z faces the viewer. Every record is
exactly eight little-endian float32 values: x, y, z, r, g, b, size, phase.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import html
import json
import math
from pathlib import Path
import random
import struct
from typing import Callable

COUNT = 52_000
STRIDE = 8
SEED = 20_260_214
RECORD = struct.Struct("<8f")
TAU = math.tau
Vec3 = tuple[float, float, float]
Particle = tuple[float, float, float, float, float, float, float, float]
PointFn = Callable[[float, float], Vec3]
PigmentFn = Callable[[float, float], Vec3]

BOUQUETS = (
    {
        "id": "rose",
        "file": "rose.bin",
        "title": "把偏爱，都给你",
        "subtitle": "粉色多头玫瑰",
        "description": "八朵层层舒展的粉玫瑰，藏着细小白花与一枚柔软的蝴蝶结。",
        "color": "#e6a0b8",
    },
    {
        "id": "tulip",
        "file": "tulip.bin",
        "title": "和你慢慢盛开",
        "subtitle": "奶油粉郁金香",
        "description": "奶油白与浅粉的郁金香相拥成束，杯口微开，长叶轻轻绕过花茎。",
        "color": "#efc4b9",
    },
    {
        "id": "hydrangea",
        "file": "hydrangea.bin",
        "title": "温柔，有了形状",
        "subtitle": "淡蓝紫绣球",
        "description": "数百朵四瓣小花簇成蓝紫色的绣球，连同叶脉与缎带一起收藏。",
        "color": "#a9b9e6",
    },
    {
        "id": "wildflower",
        "file": "wildflower.bin",
        "title": "你在，就是花园",
        "subtitle": "香槟粉混合花园",
        "description": "香槟玫瑰、粉色波斯菊与小郁金香，像把两个人的春天摘成一束。",
        "color": "#e8bea3",
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


class Geometry:
    def __init__(self) -> None:
        self.sections: dict[str, list[Surface]] = {
            "flowers": [], "leaves": [], "stems": [], "ribbon": [],
        }

    def add(self, section: str, weight: float, point: PointFn,
            pigment: PigmentFn | Vec3, size: float = 1.0, shade: bool = True,
            edge_bias: float = 1.0, contour: bool = False,
            kind: str = "sheet", resolution: int = 12) -> None:
        if not callable(pigment):
            color = pigment
            pigment = lambda u, v, color=color: color
        self.sections[section].append(
            Surface(weight, point, pigment, size, shade, edge_bias, contour, kind, resolution))


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
    root = root or _mul(base, 0.72)

    def pigment(u: float, v: float) -> Vec3:
        color = _mix(root, base, min(1.0, u * 3.0))
        rim = max(u ** 6, abs(2.0 * v - 1.0) ** 12 * u * 0.46)
        return _mix(color, tip, rim * 0.72)

    return pigment


def _rose(model: Geometry, center: Vec3, radius: float, color: Vec3,
          roll: float = 0.0) -> None:
    transform = _frame(center, (center[0] * 0.23, 0.12, 1.0), radius, roll)
    pale = _mix(color, (1.0, 0.93, 0.89), 0.55)
    # Each ring has separate overlapping, cupped petals; the rim curls forward.
    for layer, petals in enumerate((5, 7, 9, 11, 13)):
        outer = 0.20 + layer * 0.185
        inner = 0.015 + layer * 0.061
        depth = 0.34 - layer * 0.065
        spread = math.pi / petals * 1.37
        for j in range(petals):
            theta = j * TAU / petals + layer * 1.13

            def point(u: float, v: float, outer=outer, inner=inner, depth=depth,
                      spread=spread, theta=theta, layer=layer) -> Vec3:
                q = 2.0 * v - 1.0
                opening = math.sin(u * math.pi / 2.0)
                r = inner + (outer - inner) * opening * (1.0 - 0.22 * q * q)
                angle = (theta + q * spread * (0.30 + 0.70 * opening)
                         + 0.28 * u + 0.10 * q * q * u)
                z = (depth + 0.15 * (1.0 - u) ** 2
                     + (0.07 + layer * 0.015) * u ** 7
                     + 0.075 * q * q * math.sin(math.pi * u)
                     + 0.012 * math.cos(3.0 * q) * u ** 4)
                return transform((r * math.cos(angle), r * math.sin(angle), z))

            base_pigment = _petal_color(
                _mix(color, (0.72, 0.22, 0.37), 0.045 * (4 - layer)), pale)

            def pigment(u: float, v: float, base=base_pigment) -> Vec3:
                crease = 0.22 * math.exp(-((u - 0.875) / 0.045) ** 2)
                side = 0.17 * abs(2 * v - 1) ** 10 * u
                return _mul(base(u, v), 1.0 - crease - side)

            model.add("flowers", radius * radius * (0.34 + layer * 0.19) / petals,
                      point, pigment, 0.91, edge_bias=2.25, contour=True)

    def spiral(u: float, v: float) -> Vec3:
        angle = 5.5 * math.pi * u
        r = 0.018 + 0.19 * u + (v - 0.5) * 0.056
        z = 0.55 - 0.06 * u + 0.025 * math.sin(math.pi * v)
        return transform((r * math.cos(angle), r * math.sin(angle), z))

    model.add("flowers", radius * radius * 0.17, spiral,
              _petal_color(_mul(color, 0.88), pale), 0.84, resolution=72)


def _tulip(model: Geometry, center: Vec3, radius: float, color: Vec3,
           roll: float = 0.0) -> None:
    transform = _frame(center, (center[0] * 0.12, -0.34, 1.0), radius, roll)
    for j in range(6):
        theta = j * TAU / 6.0
        inner = j % 2 == 0

        def point(u: float, v: float, theta=theta, inner=inner) -> Vec3:
            q = v * 2.0 - 1.0
            angle = theta + q * 0.68 * (0.58 + 0.42 * math.sin(u * math.pi / 2))
            r = (0.13 + 0.65 * math.sin(u * math.pi * 0.67)
                 + 0.09 * u ** 8 + 0.055 * q * q * u ** 4)
            r *= 0.92 if inner else 1.02
            height = -0.60 + 1.48 * u - 0.17 * q * q * u ** 3
            height += 0.045 * math.cos(q * math.pi) * u ** 6
            if inner:
                height += 0.045 * u
            return transform((r * math.sin(angle), height, r * math.cos(angle)))

        pale = _mix(color, (1.0, 0.97, 0.87), 0.62)
        root = _mix(color, (0.56, 0.63, 0.34), 0.38)
        base_pigment = _petal_color(color, pale, root)

        def pigment(u: float, v: float, base=base_pigment) -> Vec3:
            q = v * 2 - 1
            seam = 0.18 * abs(q) ** 10 * u ** 2
            vein = 0.035 * (1 - math.cos(q * 11 * math.pi)) * math.sin(math.pi * u)
            return _mul(base(u, v), 1.0 - seam - vein)

        model.add("flowers", radius * radius * (0.90 if inner else 1.0), point,
                  pigment, 1.03, edge_bias=1.2, contour=True)
    # Visible anthers live inside the open cup, rather than a solid sphere cap.
    for j in range(6):
        angle = TAU * j / 6.0
        start = transform((0.08 * math.cos(angle), -0.15, 0.08 * math.sin(angle)))
        end = transform((0.16 * math.cos(angle), 0.40, 0.16 * math.sin(angle)))
        _tube(model, "flowers", lambda t, a=start, b=end: _mix(a, b, t),
              radius * 0.024, (0.61, 0.46, 0.16), weight=radius * radius * 0.04,
              size=0.72)


def _floret(model: Geometry, center: Vec3, normal: Vec3, radius: float,
            color: Vec3, roll: float = 0.0) -> None:
    transform = _frame(center, normal, radius, roll)
    for petal in range(4):
        angle = petal * math.pi / 2

        def point(u: float, v: float, angle=angle) -> Vec3:
            q = 2.0 * v - 1.0
            length = 0.045 + 0.92 * u
            width = q * 0.49 * max(0.0, math.sin(math.pi * u)) ** 0.62
            z = 0.10 * math.sin(math.pi * u) + 0.13 * u ** 6 - 0.07 * q * q
            return transform((length * math.cos(angle) - width * math.sin(angle),
                              length * math.sin(angle) + width * math.cos(angle), z))

        pale = _mix(color, (0.98, 0.98, 1.0), 0.53)
        model.add("flowers", radius * radius, point, _petal_color(color, pale),
                  0.78, edge_bias=1.3, resolution=8)

    def eye(u: float, v: float) -> Vec3:
        r = 0.11 * math.sqrt(u)
        return transform((r * math.cos(TAU * v), r * math.sin(TAU * v), 0.10))

    model.add("flowers", radius * radius * 0.06, eye, (0.83, 0.87, 0.69), 0.67)


def _hydrangea(model: Geometry, center: Vec3, radius: float, index: int) -> None:
    florets = max(60, round(190 * radius * radius))
    for j in range(florets):
        nz = 1.0 - 2.0 * (j + 0.5) / florets
        theta = j * math.pi * (3.0 - math.sqrt(5.0)) + index * 0.71
        transverse = math.sqrt(1.0 - nz * nz)
        normal = (transverse * math.cos(theta), transverse * math.sin(theta), nz)
        p = _add(center, (radius * normal[0], radius * normal[1], radius * nz * 0.76))
        blend = 0.5 + 0.5 * math.sin(j * 1.79 + index * 2.13)
        color = _mix((0.48, 0.65, 0.91), (0.71, 0.59, 0.86), blend)
        _floret(model, p, normal, 0.175 + 0.030 * (0.5 + 0.5 * math.sin(j * 2.3)),
                color, theta * 0.31)


def _cosmos(model: Geometry, center: Vec3, radius: float, color: Vec3,
            roll: float = 0.0) -> None:
    transform = _frame(center, (center[0] * 0.18, 0.18, 1.0), radius, roll)
    for j in range(9):
        angle = TAU * j / 9.0

        def point(u: float, v: float, angle=angle) -> Vec3:
            q = v * 2 - 1
            r = 0.13 + 0.87 * u - 0.055 * math.cos(q * 3 * math.pi) * u ** 8
            width = q * 0.29 * math.sin(math.pi * u) ** 0.55
            z = 0.10 * math.sin(math.pi * u) - 0.12 * u * u + 0.05 * q * q
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
              lambda u, v: _mix((0.60, 0.35, 0.10), (0.99, 0.78, 0.35), u), 0.77)


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
        x = _unit(_cross(tangent, (0.0, 0.0, 1.0)))
        y = _cross(tangent, x)
        angle = TAU * v
        return _add(p, _add(_mul(x, radius * math.cos(angle)),
                            _mul(y, radius * math.sin(angle))))

    model.add(section, weight, point, color, size, kind="tube")


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
        fold = width * (0.38 * (1 - abs(q)) + 0.07 * math.sin(u * 9 * math.pi))
        fold *= math.sin(math.pi * u)
        return _add(_add(start, _mul(axis, u)),
                    _add(_mul(side, width * q * outline), _mul(normal, fold)))

    def pigment(u: float, v: float) -> Vec3:
        q = abs(2 * v - 1)
        vein = math.exp(-q * 34)
        branches = max(0.0, math.cos((u - q * 0.18) * 35 * math.pi)) ** 20
        return _mix(color, (0.60, 0.68, 0.45), 0.32 * vein + 0.10 * branches)

    length = math.sqrt(sum(a * a for a in axis))
    model.add("leaves", width * length, point, pigment, 0.88)


def _stem(model: Geometry, head: Vec3, index: int, long_leaves: bool = False) -> None:
    phase = index * 2.39996
    base = (0.27 * math.sin(phase), -2.55 + 0.12 * math.cos(phase),
            0.12 * math.cos(phase))
    curve = _bezier(base, (0.02 * math.sin(phase), -1.20, 0.02),
                    (head[0] * 0.62, head[1] * 0.25 - 0.06, head[2] - 0.18),
                    (head[0], head[1] - 0.16, head[2] - 0.22))
    _tube(model, "stems", curve, 0.016 if long_leaves else 0.018,
          (0.27, 0.40, 0.23), 1.0)
    for k, t in enumerate((0.54, 0.75)):
        start = curve(t)
        sign = (1 if head[0] >= 0 else -1) * (-1 if k == 0 and index % 3 == 0 else 1)
        reach = 0.52 + 0.14 * math.sin(phase + k)
        end = (start[0] + sign * reach,
               start[1] + (1.05 if long_leaves else 0.43 + 0.14 * k),
               start[2] + 0.12 + 0.13 * math.sin(phase))
        _leaf(model, start, end, 0.13 if long_leaves else 0.20 + 0.035 * k,
              (0.25, 0.43, 0.32), roll=0.16 * math.sin(phase))


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
                    -1.40 + 0.27 * math.sin(TAU * t) + 0.10 * math.sin(math.pi * t),
                    0.42 + 0.18 * math.sin(math.pi * t) + 0.07 * math.cos(TAU * t))
        model.add("ribbon", 1.0, strip(loop, 0.105),
                  _petal_color(color, _mix(color, (1.0, 0.94, 0.88), 0.55)),
                  0.88, resolution=32)
        tail = _bezier((side * 0.05, -1.48, 0.52),
                       (side * 0.12, -1.94, 0.61),
                       (side * 0.64, -2.02, 0.32),
                       (side * 0.44, -2.48, 0.51))
        model.add("ribbon", 0.8, strip(tail, 0.10, True),
                  _petal_color(color, _mix(color, (1.0, 0.94, 0.88), 0.35)),
                  0.91, resolution=32)

    def knot(u: float, v: float) -> Vec3:
        theta, phi = TAU * u, math.pi * v
        return (0.14 * math.sin(phi) * math.cos(theta),
                -1.43 + 0.115 * math.cos(phi),
                0.58 + 0.09 * math.sin(phi) * math.sin(theta))

    model.add("ribbon", 0.38, knot, _mix(color, (1.0, 0.90, 0.85), 0.22),
              0.90, kind="sphere")


def _build_geometry(bouquet_id: str) -> Geometry:
    model = Geometry()
    if bouquet_id == "rose":
        heads = ((0.0, 1.05, 0.44, 0.77), (-0.92, 1.27, 0.05, 0.70),
                 (0.92, 1.30, 0.02, 0.70), (-0.61, 2.04, -0.26, 0.61),
                 (0.64, 2.06, -0.29, 0.60), (-1.48, 0.54, -0.10, 0.55),
                 (1.46, 0.55, -0.14, 0.55), (0.03, 2.38, -0.48, 0.46))
        for i, (x, y, z, r) in enumerate(heads):
            color = _mix((0.91, 0.47, 0.64), (0.99, 0.70, 0.75), (i % 4) / 3)
            _rose(model, (x, y, z), r, color, i * 0.93)
            _stem(model, (x, y, z), i)
        _filler_sprig(model, -1, (0.94, 0.92, 0.80), 0.19)
        _filler_sprig(model, 1, (0.98, 0.89, 0.85), 0.0)
        ribbon = (0.68, 0.36, 0.45)
    elif bouquet_id == "tulip":
        heads = ((-0.12, 1.05, 0.46, 0.61), (-0.83, 1.43, 0.14, 0.62),
                 (0.80, 1.49, 0.12, 0.61), (-0.37, 2.22, -0.30, 0.57),
                 (0.44, 2.13, -0.36, 0.58), (-1.43, 0.70, -0.16, 0.55),
                 (1.43, 0.80, -0.20, 0.54), (0.02, 1.77, -0.58, 0.57),
                 (-0.69, 0.52, 0.48, 0.48), (0.66, 0.48, 0.46, 0.49))
        for i, (x, y, z, r) in enumerate(heads):
            color = _mix((0.99, 0.87, 0.68), (0.98, 0.64, 0.70), (i % 5) / 4)
            _tulip(model, (x, y, z), r, color, x * -0.13)
            _stem(model, (x, y, z), i, True)
        ribbon = (0.78, 0.60, 0.47)
    elif bouquet_id == "hydrangea":
        heads = ((0.0, 1.04, 0.24, 0.86), (-0.91, 1.55, -0.23, 0.72),
                 (0.92, 1.59, -0.25, 0.73), (-0.75, 0.40, 0.02, 0.64),
                 (0.82, 0.38, 0.00, 0.63), (0.02, 2.12, -0.40, 0.60))
        for i, (x, y, z, r) in enumerate(heads):
            _hydrangea(model, (x, y, z), r, i)
            _stem(model, (x, y, z), i)
        for side in (-1, 1):
            _leaf(model, (side * 0.55, 0.12, -0.12),
                  (side * 1.95, 0.80, -0.10), 0.33, (0.26, 0.43, 0.35), side * 0.2)
        ribbon = (0.54, 0.53, 0.70)
    elif bouquet_id == "wildflower":
        roses = ((-0.54, 1.15, 0.39, 0.60), (0.67, 1.48, 0.06, 0.56),
                 (0.04, 2.10, -0.27, 0.54), (-1.18, 0.53, 0.14, 0.49),
                 (1.19, 0.43, 0.17, 0.48))
        for i, (x, y, z, r) in enumerate(roses):
            _rose(model, (x, y, z), r,
                  _mix((0.96, 0.72, 0.52), (0.98, 0.80, 0.70), i / 5), i * 1.5)
            _stem(model, (x, y, z), i)
        daisies = ((-1.20, 1.58, 0.13, 0.39), (1.27, 1.96, -0.14, 0.38),
                   (0.12, 0.74, 0.70, 0.46), (-0.65, 2.47, -0.30, 0.34),
                   (-1.65, 1.03, -0.04, 0.31), (1.72, 0.98, -0.13, 0.33),
                   (0.65, 2.43, -0.25, 0.30))
        for i, (x, y, z, r) in enumerate(daisies):
            _cosmos(model, (x, y, z), r,
                    _mix((0.94, 0.53, 0.65), (1.0, 0.88, 0.72), (i % 3) / 2), i)
            _stem(model, (x, y, z), i + 5)
        for i, (x, y, z) in enumerate(((-0.15, 1.57, -0.15), (0.66, 0.57, 0.50),
                                      (-0.92, 2.03, -0.43))):
            _tulip(model, (x, y, z), 0.39, (0.99, 0.87, 0.72), x * -0.2)
            _stem(model, (x, y, z), i + 12, True)
        _filler_sprig(model, -1, (0.98, 0.89, 0.70), 0.28)
        _filler_sprig(model, 1, (0.99, 0.91, 0.82), -0.08)
        ribbon = (0.70, 0.46, 0.40)
    else:
        raise ValueError(f"Unknown bouquet id: {bouquet_id}")
    _ribbon(model, ribbon)
    return model


_LIGHT = _unit((-0.35, 0.55, 0.76))


def _surface_color(surface: Surface, u: float, v: float, p: Vec3 | None = None) -> Vec3:
    p = p if p is not None else surface.point(u, v)
    color = surface.pigment(u, v)
    shade = 1.0
    if surface.shade:
        du = 0.0005 if u < 0.9995 else -0.0005
        dv = 0.0005 if v < 0.9995 else -0.0005
        a = surface.point(u + du, v)
        b = surface.point(u, v + dv)
        normal = _unit(_cross(tuple(x - y for x, y in zip(a, p)),
                              tuple(x - y for x, y in zip(b, p))))
        shade = 0.66 + 0.34 * abs(sum(a * b for a, b in zip(normal, _LIGHT)))
    return tuple(_clamp(c * shade) for c in color)


def generate_bouquet(bouquet_id: str, count: int = COUNT) -> list[Particle]:
    """Sample real surfaces, with a fixed local seed and an unbiased final order."""
    if count < 1:
        raise ValueError("count must be positive")
    ids = [item["id"] for item in BOUQUETS]
    if bouquet_id not in ids:
        raise ValueError(f"Unknown bouquet id: {bouquet_id}")
    rng = random.Random(SEED + ids.index(bouquet_id) * 7_919)
    model = _build_geometry(bouquet_id)
    section_weights = (0.745, 0.125, 0.065, 0.065)
    budgets = _allocate(count, list(section_weights))
    particles: list[Particle] = []
    for surfaces, budget in zip(model.sections.values(), budgets):
        allocations = _allocate(budget, [surface.weight for surface in surfaces])
        for surface, n in zip(surfaces, allocations):
            for i in range(n):
                u, v = (i + rng.random()) / n, rng.random()
                u = 1.0 - (1.0 - u) ** surface.edge_bias
                p = surface.point(u, v)
                color = _surface_color(surface, u, v, p)
                size = max(0.60, min(1.80, surface.size * rng.uniform(0.86, 1.22)))
                particles.append((*p, *color, size, rng.random() * TAU))
    rng.shuffle(particles)
    return particles


def encode_particles(particles: list[Particle]) -> bytes:
    data = bytearray(len(particles) * RECORD.size)
    for index, particle in enumerate(particles):
        RECORD.pack_into(data, index * RECORD.size, *particle)
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
                    color = _hex(_surface_color(surface, u, 0.25 if section == "leaves" else 0.5))
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
                        color = _hex(_surface_color(surface, (i + 0.5) / nu, (j + 0.5) / nv))
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
        'viewBox="-2.65 -3.12 5.3 5.95" role="img" aria-labelledby="title desc">',
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


def generate_assets(output: str | Path = Path("site/assets")) -> dict:
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    manifest = {"version": 1, "count": COUNT, "stride": STRIDE,
                "bouquets": [dict(item) for item in BOUQUETS]}
    for item in BOUQUETS:
        particles = generate_bouquet(item["id"])
        (output / item["file"]).write_bytes(encode_particles(particles))
        (output / f'{item["id"]}.svg').write_text(
            render_svg(particles, item["title"], item["description"],
                       _build_geometry(item["id"])), encoding="utf-8")
    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="生成可复现的立体粒子花束与同源 SVG 投影")
    parser.add_argument("--output", type=Path, default=Path("site/assets"),
                        metavar="PATH", help="资源输出目录（默认：site/assets）")
    args = parser.parse_args(argv)
    manifest = generate_assets(args.output)
    print(f'已生成 {len(manifest["bouquets"])} 组花束，每组 {COUNT} 粒子，'
          f'{STRIDE} 个 Float32LE：{args.output.resolve()}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
