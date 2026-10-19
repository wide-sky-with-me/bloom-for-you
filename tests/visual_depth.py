"""Capture each bouquet at two real 3D angles and inspect the live WebGL passes."""
from __future__ import annotations
import argparse
import hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

FLOWERS = ('rose', 'tulip', 'hydrangea', 'wildflower', 'peony', 'lily', 'sunflower', 'calla')
parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:8780')
args = parser.parse_args()
out = Path(__file__).resolve().parents[1] / 'artifacts' / 'depth'
out.mkdir(parents=True, exist_ok=True)
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width':1440, 'height':1100}, reduced_motion='reduce')
    context.add_init_script("""
        window.__renderPasses = [];
        const original = WebGLRenderingContext.prototype.drawArrays;
        WebGLRenderingContext.prototype.drawArrays = function(...args) {
            window.__renderPasses.push({
                color: Array.from(this.getParameter(this.COLOR_WRITEMASK)),
                writeDepth: this.getParameter(this.DEPTH_WRITEMASK),
                testDepth: this.isEnabled(this.DEPTH_TEST), count: args[2]
            });
            window.__renderPasses = window.__renderPasses.slice(-24);
            const result = original.apply(this, args);
            if (args[2] === 360) {
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
                window.__flowerBounds = {height: (maxY - minY + 1) / h,
                    width: (maxX - minX + 1) / w, minX, maxX, minY, maxY, w, h};
            }
            return result;
        };
    """)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url, wait_until='networkidle')
    page.wait_for_function("document.body.dataset.ready === 'true'")
    canvas = page.locator('#bouquet')
    expect(canvas).to_have_attribute('data-rendered', 'true')
    passes = page.evaluate('window.__renderPasses')
    assert any(not any(item['color']) and item['writeDepth'] and item['testDepth'] for item in passes), passes
    assert any(all(item['color']) and not item['writeDepth'] and item['testDepth'] and item['count'] == 52000 for item in passes), passes
    print('PASS: a real no-color depth prepass and depth-tested visible surfaces', flush=True)
    for flower in FLOWERS:
        page.locator(f'button[data-bouquet="{flower}"]').click()
        expect(page.locator('body')).to_have_attribute('data-bouquet', flower)
        page.wait_for_function("document.querySelector('#gallery').getAttribute('aria-busy') === 'false'")
        page.mouse.move(0, 0)
        page.wait_for_timeout(150)
        front = canvas.screenshot(path=str(out / f'{flower}-front.png'))
        bounds = page.evaluate('window.__flowerBounds')
        assert .70 < bounds['height'] < .93, (flower, bounds)
        assert bounds['minX'] > 0 and bounds['maxX'] < bounds['w'] - 1, (flower, bounds)
        print(f"PASS: {flower} occupies {bounds['height']:.1%} of the canvas height", flush=True)
        canvas.focus()
        for _ in range(9):
            page.keyboard.press('ArrowRight')
        page.wait_for_timeout(150)
        side = canvas.screenshot(path=str(out / f'{flower}-side.png'))
        assert hashlib.sha256(front).digest() != hashlib.sha256(side).digest(), flower
        for _ in range(9):
            page.keyboard.press('ArrowLeft')
        print(f'PASS: {flower} front/side views differ, screenshots captured', flush=True)
    assert not errors, errors
    browser.close()
print(f'Visual evidence: {out}')
