"""End-to-end checks; run against the built gallery with the skill's server helper."""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts'
OUT.mkdir(exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:8765')
args = parser.parse_args()
errors: list[str] = []
checks: list[str] = []


def ready(page, query=''):
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url.rstrip('/') + '/' + query, wait_until='networkidle')
    page.wait_for_function("document.body.dataset.ready === 'true'")


def check(name, condition=True):
    assert condition, name
    checks.append(name)
    print('PASS:', name, flush=True)


def digest(locator):
    return hashlib.sha256(locator.screenshot()).hexdigest()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1, permissions=['clipboard-write', 'clipboard-read'])
    page = context.new_page()
    requests = []
    page.on('request', lambda request: requests.append(request.url))
    ready(page)
    expect(page.locator('#bouquet')).to_have_attribute('data-rendered', 'true', timeout=15000)
    check('WebGL renders real particles, not the fallback', page.locator('body').get_attribute('data-mode') != 'illustration')
    page.wait_for_function("[...document.querySelectorAll('.thumbnail img')].every(image => image.complete && image.naturalWidth > 0)")
    check('All lightweight thumbnail images load')
    check('Initial view skips the full SVG fallback assets', not any(url.endswith('/' + name + '.svg') for url in requests for name in ['rose','tulip','hydrangea','wildflower']))
    page.wait_for_timeout(4000)
    page.screenshot(path=str(OUT / 'desktop.png'), full_page=True)
    canvas = page.locator('#bouquet')
    frame_a = digest(canvas)
    page.wait_for_timeout(800)
    check('Flowers animate continuously without interaction', frame_a != digest(canvas))
    for flower in ['tulip', 'hydrangea', 'wildflower', 'rose']:
        page.locator(f'button[data-bouquet="{flower}"]').click()
        expect(page.locator('body')).to_have_attribute('data-bouquet', flower)
        expect(page.locator(f'button[data-bouquet="{flower}"]')).to_have_attribute('aria-pressed', 'true')
    check('All four bouquets load and select')
    page.evaluate("['rose','tulip','hydrangea','wildflower'].forEach(id => document.querySelector('button[data-bouquet='+id+']').click())")
    expect(page.locator('body')).to_have_attribute('data-bouquet', 'wildflower')
    check('Rapid selection keeps the final choice')
    page.wait_for_timeout(3200)
    page.get_by_role('button', name='暂停花束动画').click()
    page.wait_for_timeout(1200)
    still = digest(canvas)
    page.wait_for_timeout(700)
    check('Pause produces stable frames', still == digest(canvas))
    page.get_by_role('button', name='播放花束动画').click()
    page.get_by_role('button', name='让心意绽放').click()
    page.wait_for_timeout(200)
    page.get_by_role('button', name='暂停花束动画').click()
    page.wait_for_timeout(100)
    frozen_burst = digest(canvas)
    page.wait_for_timeout(500)
    check('Pause freezes an in-progress bloom', frozen_burst == digest(canvas))
    canvas.click()
    expect(page.get_by_role('button', name='暂停花束动画')).to_be_visible()
    check('Touching a paused flower resumes motion and updates controls')
    page.get_by_role('button', name='让心意绽放').click()
    page.wait_for_timeout(600)
    burst = digest(canvas)
    page.wait_for_timeout(800)
    check('Bloom and regroup change the particle field', burst != digest(canvas))
    box = canvas.bounding_box()
    page.mouse.move(box['x'] + box['width'] * .5, box['y'] + box['height'] * .5)
    page.mouse.down()
    page.mouse.move(box['x'] + box['width'] * .65, box['y'] + box['height'] * .53, steps=12)
    page.mouse.up()
    canvas.focus()
    page.keyboard.press('ArrowRight')
    page.keyboard.press('Space')
    check('Drag and keyboard interactions work')
    page.get_by_role('button', name='有封信给你').click()
    expect(page.get_by_role('dialog')).to_be_visible()
    expect(page.locator('#letter-body')).to_contain_text('平凡的日子')
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).not_to_be_visible()
    check('Letter opens, displays, and closes with Escape', page.locator('body').evaluate('(b) => b.style.overflow') == '')
    page.get_by_role('button', name='进入沉浸模式').click()
    expect(page.locator('body')).to_have_class('is-immersive')
    check('Immersive mode removes background focus targets', page.locator('.site-header').evaluate('(e) => e.inert'))
    page.keyboard.press('Escape')
    check('Escape exits immersive mode', 'is-immersive' not in (page.locator('body').get_attribute('class') or ''))
    page.get_by_role('button', name='把这份浪漫收藏').click()
    expect(page.locator('#toast')).to_contain_text('链接已复制')
    check('Share copies a working gallery URL')
    context.close()

    mobile = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    phone = mobile.new_page()
    ready(phone)
    expect(phone.locator('#bouquet')).to_have_attribute('data-rendered', 'true')
    phone.wait_for_timeout(4000)
    phone.screenshot(path=str(OUT / 'mobile.png'), full_page=True)
    check('Phone viewport has no horizontal overflow', phone.evaluate('document.documentElement.scrollWidth <= 390 && innerWidth === 390'))
    phone.get_by_role('button', name='让心意绽放').tap()
    phone.locator('button[data-bouquet="tulip"]').tap()
    expect(phone.locator('body')).to_have_attribute('data-bouquet', 'tulip')
    check('Touch bloom and bouquet selection work')
    for width in [320, 360, 768, 1024]:
        phone.set_viewport_size({'width': width, 'height': 844})
        check(f'Layout fits {width}px', phone.evaluate(f'document.documentElement.scrollWidth <= {width} && innerWidth === {width}'))
    mobile.close()

    reduced = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
    quiet = reduced.new_page()
    ready(quiet, '?to=%E5%B0%8F%E6%BB%A1&message=%3Cb%3E%E5%96%9C%E6%AC%A2%E4%BD%A0%3C%2Fb%3E#hydrangea')
    expect(quiet.locator('#bouquet')).to_have_attribute('data-rendered', 'true')
    expect(quiet.get_by_role('button', name='播放花束动画')).to_be_visible()
    check('Reduced motion starts paused and honors deep links', quiet.locator('body').get_attribute('data-bouquet') == 'hydrangea')
    quiet.wait_for_timeout(100)
    quiet_frame = digest(quiet.locator('#bouquet'))
    quiet.wait_for_timeout(500)
    check('Reduced-motion frame stays static', quiet_frame == digest(quiet.locator('#bouquet')))
    expect(quiet.locator('#recipient')).to_have_text('小满')
    quiet.get_by_role('button', name='有封信给你').click()
    expect(quiet.locator('#letter-body')).to_have_text('<b>喜欢你</b>')
    check('Personalization is text, never injected markup', quiet.locator('#letter-body b').count() == 0)
    reduced.close()

    fallback_context = browser.new_context()
    fallback_context.add_init_script("const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:original.call(this,type,...args)}")
    backup = fallback_context.new_page()
    ready(backup)
    expect(backup.locator('#fallback-art')).to_be_visible()
    backup.locator('button[data-bouquet="hydrangea"]').click()
    expect(backup.locator('#fallback-art')).to_have_attribute('src', './assets/hydrangea.svg')
    check('Devices without WebGL still show all bouquets')
    fallback_context.close()

    slow_context = browser.new_context()
    slow_context.add_init_script("const names=new WeakMap();const get=WebGLRenderingContext.prototype.getUniformLocation;const set=WebGLRenderingContext.prototype.uniform1f;WebGLRenderingContext.prototype.getUniformLocation=function(...args){const location=get.apply(this,args);if(location)names.set(location,args[1]);return location;};WebGLRenderingContext.prototype.uniform1f=function(location,value){if(names.get(location)==='uAppear')window.__flowerAppearance=value;return set.call(this,location,value);};")
    held_manifest = []
    slow_context.route('**/assets/manifest.json', lambda route: held_manifest.append(route))
    slow = slow_context.new_page()
    slow.on('pageerror', lambda error: errors.append(str(error)))
    slow.goto(args.url.rstrip('/') + '/', wait_until='domcontentloaded')
    slow.locator('button[data-bouquet="tulip"]').click()
    slow.wait_for_function("document.body.dataset.bouquet === 'tulip'")
    slow.get_by_role('button', name='暂停花束动画').click()
    assert held_manifest
    held_manifest[0].continue_()
    slow.wait_for_function("document.body.dataset.ready === 'true'")
    expect(slow.locator('#bouquet')).to_have_attribute('data-rendered', 'true')
    check('A selection during slow startup is retained', slow.locator('body').get_attribute('data-bouquet') == 'tulip' and slow.locator('body').get_attribute('data-mode') != 'illustration')
    check('Pausing before first load still shows an opaque bouquet', slow.evaluate('window.__flowerAppearance === 1'))
    slow_context.close()

    lost_context = browser.new_context()
    lost_context.add_init_script("Object.defineProperty(navigator, 'connection', {value: {saveData: true}})")
    lost_page = lost_context.new_page()
    ready(lost_page)
    held_tulip = []
    lost_context.route('**/assets/tulip.bin', lambda route: held_tulip.append(route))
    lost_page.locator('button[data-bouquet="tulip"]').click()
    lost_page.wait_for_timeout(100)
    assert held_tulip
    lost_page.evaluate("document.querySelector('canvas').dispatchEvent(new Event('webglcontextlost', {cancelable: true}))")
    held_tulip[0].continue_()
    expect(lost_page.locator('#fallback-art')).to_be_visible()
    lost_page.wait_for_timeout(300)
    check('Context loss invalidates an in-flight selection', lost_page.locator('body').get_attribute('data-bouquet') == 'rose' and lost_page.locator('#fallback-art').get_attribute('src') == './assets/rose.svg')
    lost_context.close()

    damaged = browser.new_context()
    damaged.route('**/assets/rose.bin', lambda route: route.fulfill(status=200, body=b'broken'))
    bad_page = damaged.new_page()
    ready(bad_page)
    expect(bad_page.locator('#fallback-art')).to_be_visible()
    check('Corrupt initial particle data falls back gracefully')
    browser.close()

check('No uncaught browser exceptions', not errors)
print(f'{len(checks)} browser checks passed. Screenshots: {OUT}')
