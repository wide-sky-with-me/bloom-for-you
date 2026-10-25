"""Inspect real WebGL flower coverage and capture the entire bouquet orbit."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from urllib.parse import urljoin
from webgl_observation import OBSERVE

from playwright.sync_api import expect, sync_playwright

FLOWERS = ('rose', 'tulip', 'hydrangea', 'wildflower', 'peony', 'lily', 'sunflower', 'calla')
ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:8780')
parser.add_argument('--flowers', default=','.join(FLOWERS))
parser.add_argument('--views', type=int, choices=(4, 12), default=12)
parser.add_argument('--output', type=Path, default=ROOT / 'artifacts' / 'round-bouquets')
args = parser.parse_args()
flowers = args.flowers.split(',')
assert all(flower in FLOWERS for flower in flowers), flowers
args.output.mkdir(parents=True, exist_ok=True)
errors = []
failures = []
report = {}


def save_report():
    (args.output / 'coverage.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')

# Keep the existing color/coverage thresholds; sample after a real renderer frame.
MEASURE = OBSERVE

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=[
        '--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    ])
    context = browser.new_context(viewport={'width': 1440, 'height': 1100}, reduced_motion='reduce')
    context.add_init_script(MEASURE)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url, wait_until='networkidle')
    page.wait_for_function("document.body.dataset.ready === 'true'")
    canvas = page.locator('#bouquet')
    expect(canvas).to_have_attribute('data-rendered', 'true')
    manifest = page.request.get(urljoin(page.url, 'assets/manifest.json?v=7')).json()
    assert manifest['count'] == 120_000 and manifest['stride'] == 11, manifest
    passes = page.evaluate('window.__renderPasses')
    if canvas.get_attribute('data-style') == 'natural-garden':
        assert page.evaluate('''() => {const g=document.querySelector('#bouquet').__bloomGarden;
          return g.mesh?.material.isMeshPhysicalMaterial && g.mesh.material.depthTest && g.mesh.material.depthWrite
            && !g.points.visible && !g.depthPoints.visible}'''), 'natural petals must own opaque depth'
        assert any(item['indexed'] and all(item['color']) and item['writeDepth'] and item['testDepth'] for item in passes), passes
        assert not any(not any(item['color']) for item in passes), 'disabled point-core must not leak a depth draw'
        print('PASS: real opaque physical petals own depth; point layers are explicitly disabled', flush=True)
    else:
        # The retained compatibility renderer still must satisfy its original core contract.
        assert any(not any(item['color']) and item['writeDepth'] and item['testDepth'] for item in passes), passes
        assert any(all(item['color']) and not item['writeDepth'] and item['testDepth'] and item['count'] == manifest['count'] for item in passes), passes
        print('PASS: real 120k compatibility particles and a no-color depth prepass', flush=True)
    assert page.evaluate('window.__surfaceDraws > 0'), 'continuous flower surfaces were not drawn'
    steps = 0
    for flower in flowers:
        page.locator(f'button[data-bouquet="{flower}"]').click()
        expect(page.locator('body')).to_have_attribute('data-bouquet', flower)
        page.wait_for_function("document.querySelector('#gallery').getAttribute('aria-busy') === 'false'")
        page.mouse.move(0, 0)
        canvas.focus()
        views = []
        report[flower] = {'status': 'running', 'views': views}
        save_report()
        hashes = []
        for index in range(args.views):
            angle = index * 360 / args.views
            target = round(math.radians(angle) / .15)
            key = 'ArrowRight' if target >= steps else 'ArrowLeft'
            for _ in range(abs(target - steps)):
                page.keyboard.press(key)
            steps = target
            page.wait_for_timeout(150)
            label = {0: 'front', 90: 'side', 180: 'back', 270: 'left'}.get(angle, f'{int(angle):03d}')
            image = canvas.screenshot(path=str(args.output / f'{flower}-{label}.png'))
            hashes.append(hashlib.sha256(image).hexdigest())
            bounds = page.evaluate('window.__flowerBounds')
            views.append({'angle': angle, **bounds})
            save_report()
            gl_error = canvas.evaluate("element => (element.getContext('webgl2')||element.getContext('webgl')).getError()")
            assert not page.evaluate('window.__flowerEvidence.errors'), 'real GL errors were observed'
            assert gl_error == 0, (flower, angle, 'WebGL error', gl_error)
            assert .70 < bounds['height'] < .93, (flower, angle, bounds)
            assert bounds['minX'] > 0 and bounds['maxX'] < bounds['w'] - 1, (flower, angle, bounds)
            assert bounds['crownFill'] >= .36, (flower, angle, 'sparse flower crown', bounds)
            assert bounds['flowerShare'] >= .45, (flower, angle, 'mostly leaves rather than flowers', bounds)
        assert len(set(hashes)) == args.views, (flower, 'orbit views must be genuinely different')
        area_ratio = min(view['coloredArea'] for view in views) / max(view['coloredArea'] for view in views)
        width_ratio = min(view['coloredWidth'] for view in views) / max(view['coloredWidth'] for view in views)
        report[flower].update(areaRatio=area_ratio, widthRatio=width_ratio)
        save_report()
        if area_ratio < .72:
            failures.append((flower, 'flower area collapses from the back', area_ratio))
        if width_ratio < .82:
            failures.append((flower, 'flower crown becomes a thin side panel', width_ratio))
        report[flower]['status'] = 'passed' if area_ratio >= .72 and width_ratio >= .82 else 'failed'
        save_report()
        status = report[flower]['status'].upper()
        print(f'{status}: {flower}: {args.views} views, colored crown area ratio {area_ratio:.3f}, width ratio {width_ratio:.3f}', flush=True)
    assert not errors, errors
    assert not failures, failures
    browser.close()
save_report()
print(f'Visual evidence: {args.output}', flush=True)
