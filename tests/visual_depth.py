"""Inspect real WebGL flower coverage and capture the entire bouquet orbit."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from urllib.parse import urljoin

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

MEASURE = r"""
window.__renderPasses = [];
window.__surfaceDraws = 0;
const drawElements = WebGLRenderingContext.prototype.drawElements;
WebGLRenderingContext.prototype.drawElements = function(...args) {
    if (args[0] === this.TRIANGLES) window.__surfaceDraws++;
    return drawElements.apply(this, args);
};
const original = WebGLRenderingContext.prototype.drawArrays;
WebGLRenderingContext.prototype.drawArrays = function(...args) {
    window.__renderPasses.push({
        color: Array.from(this.getParameter(this.COLOR_WRITEMASK)),
        writeDepth: this.getParameter(this.DEPTH_WRITEMASK),
        testDepth: this.isEnabled(this.DEPTH_TEST), count: args[2]
    });
    window.__renderPasses = window.__renderPasses.slice(-24);
    if (args[0] === this.TRIANGLES) window.__surfaceDraws++;
    const result = original.apply(this, args);
    if (args[2] !== 360) return result;
    const w = this.drawingBufferWidth, h = this.drawingBufferHeight;
    const pixels = new Uint8Array(w * h * 4);
    this.readPixels(0, 0, w, h, this.RGBA, this.UNSIGNED_BYTE, pixels);
    let minY = h, maxY = -1, minX = w, maxX = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (pixels[(y * w + x) * 4 + 3] > 180) {
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        }
    }
    // The upper crown excludes the ribbon and stem bundle. Greenery may occlude
    // blossoms, but cannot pass the colored-flower fullness check on its own.
    const cutoff = Math.round(minY + (maxY - minY) * .40);
    const rows = new Uint32Array(h), cols = new Uint32Array(w);
    let flowers = 0, crown = 0;
    for (let y = cutoff; y <= maxY; y++) for (let x = 0; x < w; x++) {
        const offset = (y * w + x) * 4;
        if (pixels[offset + 3] <= 180) continue;
        crown++;
        const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
        const neutral = Math.min(r, g, b) > 140 && Math.max(r, g, b) - Math.min(r, g, b) < 55;
        if ((r > g * 1.06 && r > 85) || (b > g * 1.08 && b > 85) || neutral) {
            flowers++; rows[y]++; cols[x]++;
        }
    }
    const quantile = (counts, fraction) => {
        let sum = 0;
        for (let i = 0; i < counts.length; i++) {
            sum += counts[i];
            if (sum >= flowers * fraction) return i;
        }
        return counts.length - 1;
    };
    const left = quantile(cols, .02), right = quantile(cols, .98);
    const bottom = quantile(rows, .02), top = quantile(rows, .98);
    window.__flowerBounds = {
        height: (maxY - minY + 1) / h, width: (maxX - minX + 1) / w,
        minX, maxX, minY, maxY, w, h,
        coloredArea: flowers / (w * h), coloredWidth: (right - left + 1) / w,
        crownFill: flowers * .92 / Math.max(1, (right - left + 1) * (top - bottom + 1)),
        flowerShare: flowers / Math.max(1, crown)
    };
    return result;
};
"""

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
    manifest = page.request.get(urljoin(page.url, 'assets/manifest.json?v=4')).json()
    assert manifest['count'] == 120_000 and manifest['stride'] == 11, manifest
    passes = page.evaluate('window.__renderPasses')
    assert any(not any(item['color']) and item['writeDepth'] and item['testDepth'] for item in passes), passes
    assert any(all(item['color']) and not item['writeDepth'] and item['testDepth'] and item['count'] == manifest['count'] for item in passes), passes
    assert page.evaluate('window.__surfaceDraws > 0'), 'continuous flower surfaces were not drawn'
    print('PASS: real 120k particles, continuous petals, and a no-color depth prepass', flush=True)
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
            gl_error = canvas.evaluate("element => element.getContext('webgl').getError()")
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
