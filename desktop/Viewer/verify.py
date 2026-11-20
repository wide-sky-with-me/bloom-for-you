"""Exercise the actual file:// deliverable, with no adjacent files or network."""
from hashlib import sha256
from io import BytesIO
from itertools import combinations
from pathlib import Path
from shutil import copyfile
from tempfile import TemporaryDirectory

from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
SHOTS = ['court', 'lily', 'iris', 'gardener', 'swing', 'rose', 'walk']


def frame(view):
    # Compositor screenshot rather than reading a discarded WebGL backbuffer.
    return Image.open(BytesIO(view.screenshot())).convert('RGB').resize((160, 90))


def distance(left, right):
    return sum(ImageStat.Stat(ImageChops.difference(left, right)).mean) / 3


def main():
    errors, requests = [], []
    with TemporaryDirectory() as isolated, sync_playwright() as pw:
        html = Path(isolated) / '离线 看景.html'
        copyfile(HERE / '看景.html', html)
        browser = pw.chromium.launch(headless=True, args=['--disable-background-networking', '--enable-unsafe-swiftshader'])
        context = browser.new_context(offline=True, viewport={'width': 1440, 'height': 900})
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('request', lambda r: requests.append(r.url))
        page.goto(html.as_uri(), wait_until='networkidle')
        page.locator('body:not([data-state="loading"])').wait_for(timeout=60000)
        assert page.locator('body').get_attribute('data-state') == 'ready', errors
        assert page.locator('meta[name="watercourt-sha256"]').get_attribute('content') == sha256((HERE.parent/'Art'/'WaterCourt.glb').read_bytes()).hexdigest(), 'Rebuild 看景.html'
        view = page.locator('#view')
        gl = view.evaluate('''v=>{const g=v.getContext("webgl2");const e=g.getExtension("WEBGL_debug_renderer_info");return [g.getParameter(g.VERSION),g.getParameter(e?e.UNMASKED_RENDERER_WEBGL:g.RENDERER)]}''')
        assert page.locator('#shot').input_value() == 'walk', 'opening shot must be eye-level'
        assert page.locator('#back').is_disabled() and page.locator('#ahead').is_enabled()
        page.emulate_media(reduced_motion='reduce')
        page.locator('#quiet:checked').wait_for()
        page.locator('#view[data-wind="still"]').wait_for()
        entrance = page.screenshot(type='jpeg', quality=91)
        walk = frame(view)
        page.click('#ahead')
        assert distance(walk, frame(view)) > 3, 'advance stays in place'
        page.click('#back')
        assert distance(walk, frame(view)) < 1, 'return to entrance failed'
        for _ in range(4):
            page.click('#ahead')
        page.get_by_text('玫瑰已盛开', exact=True).wait_for(state='visible')
        for _ in range(4):
            page.click('#back')
        page.locator('#replay').wait_for(state='hidden')
        frames = {}
        for shot in SHOTS:
            page.select_option('#shot', shot)
            frames[shot] = frame(view)
            assert frames[shot].convert('L').entropy() > 4, (shot, 'flat image')
        for a, b in combinations(SHOTS, 2):
            assert distance(frames[a], frames[b]) > 7, (a, b, 'shots indistinguishable')
        # A close-up reached from a different distance must reproduce the same frame.
        for shot in reversed(SHOTS):
            page.select_option('#shot', shot)
            assert distance(frames[shot], frame(view)) < 1, (shot, 'depends on previous camera')
        page.mouse.move(720, 400); page.mouse.down(); page.mouse.move(830, 438, steps=5); page.mouse.up()
        dragged = frame(view)
        assert distance(frames['court'], dragged) > 4, 'drag did not orbit'
        page.mouse.wheel(0, -230)
        assert distance(dragged, frame(view)) > 4, 'wheel did not zoom'
        page.get_by_role('button', name='镜头复位').click()
        assert distance(frames['court'], frame(view)) < 1, 'reset did not recover the shot'
        panorama = page.screenshot(type='jpeg', quality=91)
        view.focus(); page.keyboard.press('ArrowRight')
        assert distance(frames['court'], frame(view)) > 3, 'keyboard did not orbit'
        page.select_option('#shot', 'rose')
        rose = page.screenshot(type='jpeg', quality=91)
        # Freeze only the browser clock, not WebGL: a slow screenshot cannot miss the bud.
        page.clock.install(time='2026-01-01T00:00:00Z')
        page.clock.pause_at('2026-01-01T00:00:10Z')
        page.locator('#replay').dispatch_event('click')
        page.clock.run_for(80)
        bud_preview = page.screenshot(type='jpeg', quality=91)
        h = view.bounding_box()['height']
        bud = Image.open(BytesIO(bud_preview)).crop((0,0,1440,int(h))).convert('RGB').resize((160,90))
        for increment, expected in [(2400,'中瓣展开'),(2700,'花心舒展'),(2000,'玫瑰已盛开')]:
            page.clock.fast_forward(increment)
            page.clock.run_for(80)
            assert page.locator('#phase').inner_text() == expected
        page.clock.resume()
        blooming = frame(view)
        bloom_delta = distance(bud, blooming)
        assert bloom_delta > 2, ('flower did not unfold', bloom_delta)
        assert distance(frames['rose'], blooming) < 1, 'replay failed to return to full bloom'
        page.select_option('#shot', 'walk')
        page.locator('#view[data-shot="walk"][data-wind="still"]').wait_for()
        # Compare the same focus state: the canvas has a visible keyboard-only focus ring.
        page.locator('#quiet').focus()
        still = frame(view)
        assert distance(still, frame(view)) < .01, 'reduced motion not at rest'
        page.uncheck('#quiet')
        # Compare real viewport pixels while camera and HUD remain stationary.
        dynamic = [frame(view) for _ in range(5)]
        wind_delta = max(distance(a,b) for a,b in combinations(dynamic,2))
        assert wind_delta > .07, ('wind did not deform the meadow', wind_delta)
        page.check('#quiet')
        page.locator('#view[data-wind="still"]').wait_for()
        assert distance(still, frame(view)) < .1, 'wind did not return to static pose'
        page.set_viewport_size({'width':390,'height':780})
        page.select_option('#shot', 'iris')
        assert page.evaluate('document.documentElement.scrollWidth===innerWidth'), 'narrow layout overflow'
        assert page.locator('#reset').is_visible()
        assert frame(view).convert('L').entropy() > 4
        assert requests == [html.as_uri()], requests
        assert not errors, errors
        print('PASS: Chromium', browser.version, *gl, sep=' | ')
        print('7 distinct reproducible shots; eye-level walk, approach/rearm, drag/wheel/keyboard/reset, explicit bloom replay, wind + reduced motion')
        print(f'Rose frame difference: {bloom_delta:.2f}; breeze frame difference: {wind_delta:.2f}; desktop + narrow layout; 1 file request, 0 network requests, 0 errors')
        browser.close()
        for name, data in [('视口预览.jpg', entrance), ('玫瑰预览.jpg', rose), ('花苞预览.jpg', bud_preview), ('全景预览.jpg', panorama)]:
            (HERE / name).write_bytes(data)


if __name__ == '__main__':
    main()
