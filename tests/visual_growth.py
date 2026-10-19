"""Capture deterministic real-WebGL bud, opening and mature flower stages."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

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

# Only the test clock is synthetic. Each step executes the production renderer,
# production shaders and actual uploaded assets in a real WebGL context.
MEASURE = r"""
let clock = 1000, next = 0;
const callbacks = new Map();
window.requestAnimationFrame = cb => { callbacks.set(++next, cb); return next; };
window.cancelAnimationFrame = id => callbacks.delete(id);
window.__advanceBloom = ms => {
  clock += ms;
  const pending = [...callbacks.values()]; callbacks.clear();
  for (const cb of pending) cb(clock);
};
const original = WebGLRenderingContext.prototype.drawArrays;
WebGLRenderingContext.prototype.drawArrays = function(...args) {
  const result = original.apply(this, args);
  if (args[0] === this.POINTS && args[2] === 120000) {
    const program = this.getParameter(this.CURRENT_PROGRAM);
    window.__growthMix = this.getUniform(program, this.getUniformLocation(program, 'uMix'));
  }
  if (args[0] !== this.POINTS || args[2] !== 360) return result;
  const w = this.drawingBufferWidth, h = this.drawingBufferHeight;
  const pixels = new Uint8Array(w*h*4);
  this.readPixels(0, 0, w, h, this.RGBA, this.UNSIGNED_BYTE, pixels);
  let minY=h, maxY=-1, minX=w, maxX=-1;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    if(pixels[(y*w+x)*4+3]>180) {
      minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);
    }
  }
  const cutoff=Math.round(minY+(maxY-minY)*.40);
  let flowers=0,crown=0;
  for(let y=cutoff;y<=maxY;y++) for(let x=0;x<w;x++) {
    const i=(y*w+x)*4;
    if(pixels[i+3]<=180) continue;
    crown++;
    const r=pixels[i], g=pixels[i+1], b=pixels[i+2];
    const neutral=Math.min(r,g,b)>140 && Math.max(r,g,b)-Math.min(r,g,b)<55;
    if((r>g*1.06&&r>85)||(b>g*1.08&&b>85)||neutral) flowers++;
  }
  window.__growthPixels={coloredArea:flowers/(w*h),flowerShare:flowers/Math.max(1,crown),minX,maxX,minY,maxY,w,h};
  return result;
};
"""
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
    page.wait_for_function("document.body.dataset.ready==='true'")
    canvas = page.locator('#bouquet')
    for flower in flowers:
        changing = page.locator('body').get_attribute('data-bouquet') != flower
        if changing:
            page.locator(f'button[data-bouquet="{flower}"]').click()
            expect(page.locator('body')).to_have_attribute('data-bouquet', flower, timeout=20000)
        page.wait_for_function("document.querySelector('#gallery').getAttribute('aria-busy')==='false'")
        page.evaluate('window.__advanceBloom(16)')
        expect(canvas).to_have_attribute('data-rendered', 'true')
        # Progress zero during a switch initially still shows the outgoing flower.
        # Capture the requested bud only after the actual GPU morph reaches one.
        if changing:
            for _ in range(35):
                if page.evaluate('window.__growthMix >= .99999'): break
                page.evaluate('window.__advanceBloom(100)')
            assert page.evaluate('window.__growthMix >= .99999'), flower
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
            assert canvas.evaluate("c=>c.getContext('webgl').getError()") == 0
            save()
        stages = report[flower]['stages']
        assert len({stage['sha256'] for stage in stages}) == 5, flower
        expansion = stages[-1]['coloredArea'] / stages[0]['coloredArea']
        if expansion <= 1.08:
            failures.append((flower, 'petal coverage must grow rather than merely fade', expansion))
        attributes = canvas.evaluate("c=>{const gl=c.getContext('webgl');return gl.getProgramParameter(gl.getParameter(gl.CURRENT_PROGRAM),gl.ACTIVE_ATTRIBUTES)}")
        assert attributes <= 8, attributes
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
