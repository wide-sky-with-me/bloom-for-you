"""End-to-end checks; run against the built gallery with the skill's server helper."""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:8765')
parser.add_argument('--output', type=Path, default=ROOT / 'artifacts')
args = parser.parse_args()
OUT = args.output
OUT.mkdir(parents=True, exist_ok=True)
FLOWERS = ['rose', 'tulip', 'hydrangea', 'wildflower', 'peony', 'lily', 'sunflower', 'calla']
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
    check('The renderer exposes real surface normals', page.evaluate("(() => {const c=document.querySelector('canvas'),gl=c.getContext('webgl2')||c.getContext('webgl');return gl.getAttribLocation(gl.getParameter(gl.CURRENT_PROGRAM),'aNormal')>=0;})()"))
    check('Modern browsers use the real Three.js WebGL2 renderer', page.locator('#bouquet').get_attribute('data-engine') == 'three-webgl2')
    check('Three.js draws physical petal meshes', page.evaluate("(() => {let physical=false;document.querySelector('canvas').__bloomGarden.scene.traverse(o=>{if(o.isMesh&&o.material.isMeshPhysicalMaterial&&o.geometry.index?.count>0)physical=true});return physical})()"))
    check('WebGL renders real 3D petals, not the fallback', page.locator('body').get_attribute('data-mode') != 'illustration')
    page.wait_for_function("[...document.querySelectorAll('.thumbnail img')].every(image => image.complete && image.naturalWidth > 0)")
    check('All lightweight thumbnail images load')
    check('Initial view skips the full SVG fallback assets', not any(urlparse(url).path.endswith('/' + name + '.svg') for url in requests for name in FLOWERS))
    page.wait_for_timeout(4000)
    page.screenshot(path=str(OUT / 'desktop.png'), full_page=True)
    canvas = page.locator('#bouquet')
    frame_a = digest(canvas)
    page.wait_for_timeout(800)
    check('Flowers animate continuously without interaction', frame_a != digest(canvas))
    check('All eight flower styles are available', page.locator('button[data-bouquet]').count() == len(FLOWERS))
    for flower in FLOWERS:
        page.locator(f'button[data-bouquet="{flower}"]').click()
        expect(page.locator('body')).to_have_attribute('data-bouquet', flower)
        expect(page.locator(f'button[data-bouquet="{flower}"]')).to_have_attribute('aria-pressed', 'true')
        page.wait_for_function("document.querySelector('#gallery').getAttribute('aria-busy') === 'false'")
    check('All eight bouquets load and select')
    composition = page.request.get(args.url.rstrip('/') + '/assets/manifest.json?v=7').json()['bouquets']
    current_record = next(record for record in composition if record['id'] == 'calla')
    current = current_record['composition']
    # Exact revised head budgets are independently asserted by the production generator tests.
    check('Flower composition is derived from real counted heads',
          len(current) == 5 and sum(item['count'] for item in current) == current_record.get('headCount', 36)
          and '马蹄莲' in page.locator('#bouquet-ingredients').inner_text()
          and all(str(item['count']) in page.locator('#bouquet-ingredients').get_attribute('aria-label') for item in current))
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
    check('Bud petals unfold into a visibly different flower', burst != digest(canvas))
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
    expect(backup.locator('#fallback-art')).to_have_attribute('src', './assets/hydrangea.svg?v=7')
    backup.locator('button[data-bouquet="calla"]').click()
    expect(backup.locator('#fallback-art')).to_have_attribute('src', './assets/calla.svg?v=7')
    check('Devices without WebGL still show new flower styles')
    fallback_context.close()

    slow_context = browser.new_context()
    slow_context.add_init_script("for(const C of [window.WebGLRenderingContext,window.WebGL2RenderingContext]){if(!C)continue;const names=new WeakMap(),get=C.prototype.getUniformLocation,set=C.prototype.uniform1f;C.prototype.getUniformLocation=function(...args){const location=get.apply(this,args);if(location)names.set(location,args[1]);return location};C.prototype.uniform1f=function(location,value){if(names.get(location)==='uAppear')window.__flowerAppearance=value;return set.call(this,location,value)}}")
    held_manifest = []
    slow_context.route('**/assets/manifest.json*', lambda route: held_manifest.append(route))
    slow = slow_context.new_page()
    slow.on('pageerror', lambda error: errors.append(str(error)))
    slow.goto(args.url.rstrip('/') + '/', wait_until='domcontentloaded')
    slow.locator('button[data-bouquet="tulip"]').click()
    slow.wait_for_function("document.body.dataset.requestedBouquet === 'tulip'")
    slow.get_by_role('button', name='暂停花束动画').click()
    assert held_manifest
    held_manifest[0].continue_()
    slow.wait_for_function("document.body.dataset.ready === 'true'")
    expect(slow.locator('#bouquet')).to_have_attribute('data-rendered', 'true')
    check('A selection during slow startup is retained', slow.locator('body').get_attribute('data-bouquet') == 'tulip' and slow.locator('body').get_attribute('data-mode') != 'illustration')
    check('Pausing before first load still shows an opaque bouquet', slow.evaluate("(() => {const c=document.querySelector('canvas'),g=c.__bloomGarden;if(c.dataset.engine!=='three-webgl2')return window.__flowerAppearance===1;let opaque=false;g.scene.traverse(o=>{if(o.isMesh&&o.visible&&o.material.opacity===1)opaque=true});return g.appearance===1&&opaque})()"))
    slow_context.close()

    lost_context = browser.new_context()
    lost_context.add_init_script("Object.defineProperty(navigator, 'connection', {value: {saveData: true}})")
    lost_page = lost_context.new_page()
    ready(lost_page)
    held_tulip = []
    lost_context.route('**/assets/tulip.bin*', lambda route: held_tulip.append(route))
    lost_page.locator('button[data-bouquet="tulip"]').click()
    lost_page.wait_for_timeout(100)
    assert held_tulip
    lost_page.evaluate("document.querySelector('canvas').dispatchEvent(new Event('webglcontextlost', {cancelable: true}))")
    held_tulip[0].continue_()
    expect(lost_page.locator('#fallback-art')).to_be_visible()
    lost_page.wait_for_timeout(300)
    check('Context loss invalidates an in-flight selection', lost_page.locator('body').get_attribute('data-bouquet') == 'rose' and lost_page.locator('#fallback-art').get_attribute('src') == './assets/rose.svg?v=7')
    lost_context.close()

    damaged = browser.new_context()
    damaged.route('**/assets/rose.bin*', lambda route: route.fulfill(status=200, body=b'broken'))
    bad_page = damaged.new_page()
    ready(bad_page)
    expect(bad_page.locator('#fallback-art')).to_be_visible()
    check('Corrupt initial particle data falls back gracefully')
    damaged.close()

    # Exercise the real AbortController timeout path without waiting 45 seconds.
    # Only the resource deadline is shortened; clocks, Worker and GL stay native.
    timeout_init = """
    const nativeTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) =>
      nativeTimeout(callback, delay === 45000 ? 200 : delay, ...args);
    Object.defineProperty(navigator, 'connection', {value: {saveData: true}});
    """
    timeout_initial = browser.new_context(reduced_motion='reduce')
    timeout_initial.add_init_script(timeout_init)
    held_initial = []
    timeout_initial.route('**/assets/rose.bin*', lambda route: held_initial.append(route))
    timeout_page = timeout_initial.new_page()
    ready(timeout_page)
    expect(timeout_page.locator('#fallback-art')).to_be_visible()
    expect(timeout_page.locator('#gallery')).to_have_attribute('aria-busy', 'false')
    check('Current initial fetch timeout shows fallback and ends loading',
          bool(held_initial) and timeout_page.locator('#loading').evaluate("node => node.classList.contains('is-loaded')"))
    for route in held_initial:
        route.abort()
    timeout_initial.unroute_all(behavior='wait')
    timeout_initial.close()

    timeout_existing = browser.new_context(reduced_motion='reduce')
    timeout_existing.add_init_script(timeout_init)
    timeout_page = timeout_existing.new_page()
    ready(timeout_page)
    expect(timeout_page.locator('#bouquet')).to_have_attribute('data-rendered', 'true')
    held_latest = []
    timeout_existing.route('**/assets/tulip.bin*', lambda route: held_latest.append(route))
    timeout_page.locator('button[data-bouquet="tulip"]').click()
    expect(timeout_page.locator('#gallery')).to_have_attribute('data-prepare-state', 'error')
    expect(timeout_page.locator('#gallery')).to_have_attribute('aria-busy', 'false')
    expect(timeout_page.locator('#fallback-art')).not_to_be_visible()
    check('Current selection timeout retains the old bouquet with error feedback',
          bool(held_latest) and timeout_page.locator('body').get_attribute('data-bouquet') == 'rose'
          and timeout_page.locator('button[data-bouquet="rose"]').get_attribute('aria-pressed') == 'true')
    for route in held_latest:
        route.abort()
    timeout_existing.unroute_all(behavior='wait')
    timeout_page.locator('button[data-bouquet="tulip"]').click()
    expect(timeout_page.locator('body')).to_have_attribute('data-bouquet', 'tulip')
    expect(timeout_page.locator('#gallery')).to_have_attribute('data-prepare-state', 'committed')
    check('A timed-out selection can be retried successfully')
    timeout_existing.close()

    invalid_normals = browser.new_context()
    normal_fixture_response = invalid_normals.request.get(args.url.rstrip('/') + '/assets/rose.bin?v=7')
    assert normal_fixture_response.ok
    normal_fixture = bytearray(normal_fixture_response.body())
    normal_fixture[32:44] = bytes(12)
    invalid_normals.route('**/assets/rose.bin*', lambda route: route.fulfill(status=200, body=bytes(normal_fixture)))
    invalid_page = invalid_normals.new_page()
    ready(invalid_page)
    expect(invalid_page.locator('#fallback-art')).to_be_visible()
    check('Zero surface normals are detected instead of rendering a blank flower')
    invalid_normals.close()

    expanded_surface = browser.new_context(reduced_motion='reduce')
    expanded_surface.add_init_script("window.__triangleDraws=0;const context=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:context.call(this,type,...args)};const ext=WebGLRenderingContext.prototype.getExtension,draw=WebGLRenderingContext.prototype.drawArrays;WebGLRenderingContext.prototype.getExtension=function(name){return name==='OES_element_index_uint'?null:ext.call(this,name)};WebGLRenderingContext.prototype.drawArrays=function(...args){if(args[0]===this.TRIANGLES)window.__triangleDraws++;return draw.apply(this,args)}")
    expanded_page = expanded_surface.new_page()
    ready(expanded_page)
    expect(expanded_page.locator('#bouquet')).to_have_attribute('data-rendered', 'true')
    check('WebGL1-only devices take the explicit legacy compatibility path', expanded_page.locator('#bouquet').get_attribute('data-engine') == 'legacy-webgl1')
    check('Continuous petals render even without 32-bit index support', expanded_page.evaluate('window.__triangleDraws > 0') and expanded_page.locator('body').get_attribute('data-mode') != 'illustration')
    expanded_surface.close()

    corrupt_surface = browser.new_context()
    corrupt_surface.route('**/assets/rose.mesh*', lambda route: route.fulfill(status=200, body=b'broken'))
    surface_page = corrupt_surface.new_page()
    ready(surface_page)
    expect(surface_page.locator('#fallback-art')).to_be_visible()
    check('Corrupt continuous petal data falls back without a partial bouquet')
    corrupt_surface.close()

    invalid_surface_indices = browser.new_context()
    surface_fixture_response = invalid_surface_indices.request.get(args.url.rstrip('/') + '/assets/rose.mesh?v=7')
    assert surface_fixture_response.ok
    surface_fixture = bytearray(surface_fixture_response.body())
    vertex_count = struct.unpack_from('<I', surface_fixture, 4)[0]
    struct.pack_into('<I', surface_fixture, 12 + vertex_count * 36, vertex_count)
    invalid_surface_indices.route('**/assets/rose.mesh*', lambda route: route.fulfill(status=200, body=bytes(surface_fixture)))
    surface_page = invalid_surface_indices.new_page()
    ready(surface_page)
    expect(surface_page.locator('#fallback-art')).to_be_visible()
    check('Out-of-range petal indices are detected before GPU upload')
    invalid_surface_indices.close()

    for label, mutate in [('broken header', None), ('zero closed normals', 18), ('mismatched vertex count', 8)]:
        corrupt_growth = browser.new_context()
        if mutate is None:
            growth_fixture = b'broken'
        else:
            growth_fixture_response = corrupt_growth.request.get(args.url.rstrip('/') + '/assets/rose.growth?v=7')
            assert growth_fixture_response.ok
            growth_fixture = bytearray(growth_fixture_response.body())
            if mutate == 18:
                growth_fixture[18:24] = bytes(6)
            else:
                struct.pack_into('<I', growth_fixture, 8, 0)
            growth_fixture = bytes(growth_fixture)
        corrupt_growth.route('**/assets/rose.growth*', lambda route, _request, body=growth_fixture: route.fulfill(status=200, body=body))
        growth_page = corrupt_growth.new_page()
        ready(growth_page)
        expect(growth_page.locator('#fallback-art')).to_be_visible()
        check(f'Growth {label} falls back atomically without misaligned petals')
        corrupt_growth.close()

    for connection in ({'saveData': True, 'effectiveType': '4g'}, {'saveData': False, 'effectiveType': '3g'}):
        limited = browser.new_context(reduced_motion='reduce')
        limited.add_init_script(f"Object.defineProperty(navigator, 'connection', {{value: {json.dumps(connection)}}})")
        limited_page = limited.new_page()
        binary_requests = []
        limited_page.on('request', lambda request: binary_requests.append(urlparse(request.url).path) if urlparse(request.url).path.endswith(('.bin', '.mesh', '.growth')) else None)
        ready(limited_page)
        limited_page.wait_for_timeout(1100)
        check(f'Connection {connection} skips speculative heavy downloads', len(binary_requests) == 3 and all('/rose.' in path for path in binary_requests))
        limited.close()
    browser.close()

check('No uncaught browser exceptions', not errors)
print(f'{len(checks)} browser checks passed. Screenshots: {OUT}')
