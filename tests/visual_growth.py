"""Capture deterministic real-WebGL bud, opening and mature flower stages."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from webgl_observation import OBSERVE, SYNTHETIC_CLOCK

ROOT = Path(__file__).resolve().parents[1]
FLOWERS = ('rose', 'tulip', 'hydrangea', 'wildflower', 'peony', 'lily', 'sunflower', 'calla')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:8780')
parser.add_argument('--flowers', default=','.join(FLOWERS))
parser.add_argument('--output', type=Path, default=ROOT / 'artifacts' / 'botanical-growth')
args = parser.parse_args()
flowers = args.flowers.split(',')
assert all(key in FLOWERS for key in flowers), flowers
args.output.mkdir(parents=True, exist_ok=True)

# Observe actual WebGL1/2 draws and pixels; only the animation clock is synthetic.
MEASURE = OBSERVE + SYNTHETIC_CLOCK
report = {}
errors = []
failures = []

def save():
    (args.output / 'growth.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=[
        '--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    ])
    context = browser.new_context(viewport={'width': 1440, 'height': 1100})
    context.add_init_script(MEASURE)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url, wait_until='networkidle')
    # Worker preparation can finish after network-idle while the test RAF is held.
    # Poll readiness on wall time; only animation progression uses the synthetic clock.
    page.wait_for_function("document.body.dataset.ready==='true'", polling=50)
    canvas = page.locator('#bouquet')
    for flower in flowers:
        changing = page.locator('body').get_attribute('data-bouquet') != flower
        if changing:
            page.locator(f'button[data-bouquet="{flower}"]').click()
            expect(page.locator('body')).to_have_attribute('data-bouquet', flower, timeout=20000)
        page.wait_for_function("document.querySelector('#gallery').getAttribute('aria-busy')==='false'", polling=50)
        page.evaluate('window.__advanceBloom(16)')
        expect(canvas).to_have_attribute('data-rendered', 'true')
        # Progress zero during a switch initially still shows the outgoing flower.
        # Capture the requested bud only after the actual GPU morph reaches one.
        if changing:
            for _ in range(35):
                if page.evaluate('window.__growthMix >= .99999'): break
                page.evaluate('window.__advanceBloom(100)')
            assert page.evaluate('window.__growthMix >= .99999'), flower
        # The approved release opens with a complete still-life; exercise its real
        # replay control to reach a bud instead of weakening the closed-pose check.
        page.get_by_role('button', name='让心意绽放').click()
        page.evaluate('window.__advanceBloom(16)')
        for _ in range(14):
            if float(canvas.get_attribute('data-bloom-progress')) <= .05: break
            page.evaluate('window.__advanceBloom(100)')
        start = float(canvas.get_attribute('data-bloom-progress'))
        assert 0 <= start <= .05, (flower, 'initial pose should be a bud', start)
        report[flower] = {'status': 'running', 'stages': []}
        for target, label in [(0, 'bud'), (.25, 'opening-25'), (.50, 'opening-50'), (.75, 'opening-75'), (1, 'open')]:
            for _ in range(100):
                progress = float(canvas.get_attribute('data-bloom-progress'))
                if progress >= target: break
                page.evaluate('window.__advanceBloom(100)')
            assert progress >= target, (flower, label, progress)
            image = canvas.screenshot(path=str(args.output / f'{flower}-{label}.png'))
            pixels = page.evaluate('window.__growthPixels')
            report[flower]['stages'].append({
                'label': label, 'progress': progress,
                'sha256': hashlib.sha256(image).hexdigest(), **pixels,
            })
            assert pixels['coloredArea'] > .005, (flower, label, 'empty flower', pixels)
            assert pixels['minX'] > 0 and pixels['maxX'] < pixels['w']-1, (flower, label, 'horizontal clipping', pixels)
            assert pixels['minY'] > 0 and pixels['maxY'] < pixels['h']-1, (flower, label, 'vertical clipping', pixels)
            assert canvas.evaluate("c=>(c.getContext('webgl2')||c.getContext('webgl')).getError()") == 0
            assert not page.evaluate('window.__flowerEvidence.errors'), 'real GL errors were observed'
            save()
        stages = report[flower]['stages']
        assert len({stage['sha256'] for stage in stages}) == 5, flower
        expansion = stages[-1]['coloredArea'] / stages[0]['coloredArea']
        if expansion <= 1.08:
            failures.append((flower, 'petal coverage must grow rather than merely fade', expansion))
        evidence = page.evaluate('({attributes:__flowerEvidence.attributes,maxAttributes:__flowerEvidence.maxAttributes,engine:__flowerEvidence.engine})')
        attributes = evidence['attributes']
        # Legacy must still fit the WebGL1 minimum. Three's physical materials
        # also use built-in attributes and must fit the WebGL2 guaranteed minimum.
        attribute_limit = 16 if evidence['engine'] == 'three-webgl2' else 8
        assert 0 < attributes <= min(attribute_limit, evidence['maxAttributes']), evidence
        status = 'passed' if expansion > 1.08 else 'failed'
        report[flower].update(status=status, coloredExpansion=expansion, attributes=attributes)
        print(f'{status.upper()}: {flower} five real-GL stages, colored expansion {expansion:.3f}, {attributes} attributes', flush=True)
        save()
    page.get_by_role('button', name='让心意绽放').click()
    page.evaluate('window.__advanceBloom(16)')
    timeline = []
    for _ in range(34):
        page.evaluate('window.__advanceBloom(200)')
        timeline.append(float(canvas.get_attribute('data-bloom-progress')))
    assert min(timeline) < .06 and timeline[-1] == 1, timeline
    page.get_by_role('button', name='让心意绽放').click()
    page.evaluate('window.__advanceBloom(16)')
    page.evaluate('window.__advanceBloom(400)')
    page.get_by_role('button', name='暂停花束动画').click()
    page.evaluate('window.__advanceBloom(16)')
    page.wait_for_timeout(220)  # Let only the overlaid button's CSS transition settle.
    before = canvas.screenshot()
    frozen = canvas.get_attribute('data-bloom-progress')
    page.evaluate('window.__advanceBloom(2000)')
    assert frozen == canvas.get_attribute('data-bloom-progress')
    assert before == canvas.screenshot(), 'paused growth should preserve exact pixels'
    report['lifecycle'] = {'replay': timeline, 'pausedProgress': frozen, 'status': 'passed'}
    assert not errors, errors
    assert not failures, failures
    save()
    browser.close()
print('PASS: replay closes before reopening; pause freezes actual growth pixels', flush=True)
