#!/usr/bin/env python3
"""Walk the actual playable homepage. Supply a running Pages-style project URL."""
import argparse
import json
import math
from pathlib import Path
import tempfile
from urllib.parse import urljoin, urlsplit

from playwright.sync_api import TimeoutError as PlaywrightTimeout, sync_playwright


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def capture(page, path, report):
    try:
        page.screenshot(path=str(path), timeout=10_000)
    except PlaywrightTimeout as error:
        report.setdefault('captureErrors', []).append(f'{path.name}: {error}')


def motion(page):
    return page.evaluate("""() => {
      const w=window.__fairytaleWorld;
      return {time:w.getState().simTime, ...Object.fromEntries(['M02.Moving bench and ropes','M02.Static trellis and frame',
        'M04.Sail 1 • billowed flax','M04.Coursed shell limestone'].map(prefix=>{
          const m=w.scene.meshes.find(m=>m.name.startsWith(prefix)&&m.getTotalVertices());
          return [prefix,Array.from(m.computeWorldMatrix(true).asArray())];
        }))};
    }""")


def state(page):
    return page.evaluate('() => window.__fairytaleWorld.getState()')


def measure_scene(page):
    # Read real Babylon render candidates and world-space bounds, not app feature flags.
    return page.evaluate("""() => {
        const scene = window.__fairytaleWorld.scene;
        const active = scene.getActiveMeshes();
        const drawn = new Set(active.data.slice(0, active.length));
        const visible = m => m.isEnabled() && m.isVisible && m.visibility > 0 &&
            m.getTotalVertices() > 0 && (m.material?.alpha ?? 1) > 0;
        const meshes = scene.meshes.filter(visible);
        const geometry = prefix => {
            const group = meshes.filter(m => m.name.startsWith(prefix));
            return {meshes:group.length, vertices:group.reduce((n,m)=> n+m.getTotalVertices(),0),
                    active: group.filter(m=>drawn.has(m)).length};
        };
        const actors = Object.fromEntries(scene.transformNodes.filter(n =>
            n.name.startsWith('CoupleGLBHolder_') || n.name.startsWith('NPCGLBHolder_')
        ).map(n => {
            const skin = n.getChildMeshes().filter(visible);
            return [n.name, {meshes:skin.length, active:skin.filter(m=>drawn.has(m)).length}];
        }));
        const paper = meshes.find(m=>m.name.startsWith('Study | letter paper'));
        // Mixed villa materials also cover retained rooms. Only the old dedicated roof
        // (not all shutters, mouldings or limestone) should disappear as a whole.
        const retired = /EstateTerrainPeninsula|EstateSeaOuterBay|EstateCoastalVilla|Villa_TerracottaRoof|LH_(Stonework|CrimsonBand)|WM_(StoneTower|ShingleCap)|Swing_Frame|PondWaterSurface/;
        return {landmarks: Array.from({length:6}, (_,i)=>geometry('M0'+(i+1))),
            wall:geometry('M01.Walls | shell limestone courses'), desk:geometry('M06 01 | Writing board'),
            paper:paper?.getBoundingInfo().boundingBox.centerWorld.asArray(), actors,
            visibleOldShells:meshes.filter(m=>retired.test(m.name)).map(m=>m.name)};
    }""")


def mesh_click(page, pattern):
    # Project bounds, then verify the *nearest pickable mesh* at the exact CSS
    # pixel. The subsequent Playwright mouse click is the only activation.
    hit = page.evaluate("""pattern => {
        const {scene,camera} = window.__fairytaleWorld, re = new RegExp(pattern);
        const canvas = document.querySelector('#diorama-canvas'), r = canvas.getBoundingClientRect();
        const matrix = scene.getTransformMatrix(), vp = camera.viewport.toGlobal(r.width,r.height);
        const identity = matrix.constructor.Identity();
        const diagnostics = [];
        for(const m of scene.meshes.filter(m => re.test(m.name) && m.isEnabled() && m.isVisible && m.getTotalVertices())) {
            const v = m.getBoundingInfo().boundingBox.centerWorld;
            const p = v.constructor.Project(v, identity, matrix, vp);
            const x = Math.round(p.x), y = Math.round(p.y);
            if(p.z < 0 || p.z > 1 || document.elementFromPoint(x+r.left,y+r.top) !== canvas) {
                const el=document.elementFromPoint(x+r.left,y+r.top);
                diagnostics.push([m.name, x, y, el ? el.tagName+'#'+el.id+'.'+el.className : 'offscreen']); continue;
            }
            const pick = scene.pick(x, y, n => n.isEnabled() && n.isVisible && n.isPickable &&
                !(n.hasThinInstances && !n.metadata?.interactive) && !/^(SkyDome|BeerLambertOcean|FX_|CoupleTag_)/.test(n.name));
            if(pick?.hit && re.test(pick.pickedMesh.name))
                return {x:x+r.left,y:y+r.top,element:canvas.tagName+'#'+canvas.id,mesh:pick.pickedMesh.name,world:pick.pickedPoint.asArray()};
            diagnostics.push([m.name,x,y,pick?.pickedMesh?.name]);
        }
        return {diagnostics};
    }""", pattern)
    require('x' in hit, f'Physical mesh not pickable: {hit}')
    page.mouse.click(hit['x'], hit['y'])
    return hit


def walk_until(page, key, expression, route, stage):
    page.keyboard.down(key)
    try:
        page.wait_for_function('() => ' + expression, timeout=90_000)
    finally:
        page.keyboard.up(key)
        s = state(page)
        c = s['couple']
        pos = c[c['controlledId'] + 'Pos'] if c['active'] else s['walkPosition']
        route.append({'stage':stage, 'key':key, 'position':pos, 'xian':c['xianPos'], 'ran':c['ranPos'], 'letter':s['letterVisible']})
        print(route[-1], flush=True)
    return pos


def play_route(page, output, report):
    start = report['arrival'] = state(page)
    scene = report['arrivalGeometry'] = measure_scene(page)
    route = report['route'] = []
    require(start['mode'] == 'walk' and not start['letterVisible'], f'Not walking outdoors: {start}')
    origin = start['walkPosition']
    require(origin[2] > 10 and 1 < start['cameraPosition'][1] - origin[1] < 2.5, f'Wrong eye level: {start}')
    require(not start['failedModels'], f"Models failed: {start['failedModels']}")
    require(all(g['vertices'] > 0 for g in scene['landmarks']) and scene['wall']['active'] > 0,
            f'Remodel meshes missing, or no wall in arrival view: {scene}')
    require(not scene['visibleOldShells'], f"Superseded shells visible: {scene['visibleOldShells']}")
    require(all(scene['actors'].get('CoupleGLBHolder_' + name, {}).get('active', 0) for name in ('xian','ran')),
            f"Couple is not in arrival view: {scene['actors']}")
    require(any(name.startswith('NPCGLBHolder_') and a['meshes'] for name, a in scene['actors'].items()),
            f"No visible NPC actor: {scene['actors']}")
    report['renderer'] = page.evaluate('() => window.__fairytaleWorld.getSimState()')
    print('ready:', report['renderer'], flush=True)

    page.evaluate("""() => {window.__routeInput=[]; for(const event of ['keydown','keyup','blur']) window.addEventListener(event,e=>{
      if(event!=='blur' && e.code!=='KeyW') return;
      const w=window.__fairytaleWorld,s=w.getState(); window.__routeInput.push({event,ms:performance.now(),time:s.simTime,
        frame:w.scene.getFrameId(),visible:document.visibilityState,focus:document.hasFocus(),trusted:e.isTrusted,position:s.walkPosition});
    },true)}""")
    before_motion = motion(page)
    try:
        walk_until(page, 'w', 'window.__fairytaleWorld.getState().walkPosition[2] < 18', route, 'from pond')
    finally:
        report['pondInput'] = page.evaluate('() => window.__routeInput')
    after_motion = motion(page)
    delta = report['animatedWorldMatrixDelta'] = {name: max(abs(a-b) for a,b in zip(before_motion[name],values))
                for name,values in after_motion.items() if name != 'time'}
    require(all(d > .00001 if name.startswith(('M02.Moving','M04.Sail')) else d == 0 for name,d in delta.items()),
            f'Expected bench/rope assembly and sails to move, not trellis or tower: {delta}')
    capture(page, output / '01-arrival.png', report)
    if report['routeType'] == 'couple':
        page.locator('#btn-couple').click()
        page.locator('#couple-panel').wait_for(state='visible')
        before = state(page)['couple']
        page.keyboard.press('Tab')
        page.keyboard.press('f')
        after = report['playedCouple'] = state(page)['couple']
        require(after['active'] and after['controlledId'] != before['controlledId'] and
                before['holdingHands'] != after['holdingHands'], f'Character switch or hand-hold failed: {after}')
        couple_door(page, output, report)
        pos = 'window.__fairytaleWorld.getState().couple.' + after['controlledId'] + 'Pos'
    else:
        # Independent desk route keeps the door open. This cannot pass the couple collision gate.
        pos = 'window.__fairytaleWorld.getState().walkPosition'
        page.keyboard.down('Shift')
        try:
            walk_until(page, 'w', f'{pos}[2] <= 7.6', route, 'front porch')
        finally:
            page.keyboard.up('Shift')
        walk_until(page, 'w', f'{pos}[2] <= 2.8', route, 'inside open front door')
    for stage, key, coord, sign, value in [
        # Stay between the open left door leaf and the dining table corner.
        ('past bench', 'a', 0, '<=', -14.42), ('hall aisle', 'w', 2, '<=', -2.5),
        ('towards study', 'd', 0, '>=', -12.2), ('study doorway', 'w', 2, '<=', -5.05),
        ('in study', 'd', 0, '>=', -7.55),
    ]:
        point = walk_until(page, key, f'{pos}[{coord}] {sign} {value}', route, stage)
        require(not route[-1]['letter'], f'Letter opened before desk approach at {stage}')
    # Lower the player's gaze to the tabletop above the bottom HUD.
    page.mouse.move(425, 170)
    page.mouse.down()
    page.mouse.move(425, 240, steps=6)
    page.mouse.up()
    page.wait_for_function('() => {const c=window.__fairytaleWorld.camera;return c.getTarget().y < c.position.y - 0.16}')
    desk = report['studyGeometry'] = measure_scene(page)
    require(desk['desk']['active'] and desk['paper'], 'Writing board/paper not in study')
    capture(page, output / '03-desk.png', report)
    at_desk = page.evaluate(pos)
    distance = report['distanceToPaperXZ'] = math.dist(at_desk[::2], desk['paper'][::2])
    require(1.55 < distance < 3.5 and abs(at_desk[1] - 2.6) < 0.4, f'Not beside the desk: {distance}')
    require(not state(page)['letterVisible'], 'Letter already open before picking physical paper')
    report['letterClick'] = mesh_click(page, '^Study [|] (letter paper|wax seal)')
    page.locator('#letter-modal').wait_for(state='visible')
    require(math.dist(origin[::2], at_desk[::2]) > 10, 'No nontrivial walking displacement')
    letter = page.get_by_role('dialog')
    require(letter.is_visible() and letter.locator('#letter-body p').count() >= 2, 'No readable letter')
    report['letterExcerpt'] = letter.locator('#letter-body p').first.inner_text()
    require('想送你一束花' in report['letterExcerpt'], 'Wrong gift content')
    capture(page, output / '04-letter.png', report)
    letter.locator('#letter-close').click()
    letter.wait_for(state='hidden')


def couple_door(page, output, report):
    c = 'window.__fairytaleWorld.getState().couple'
    actor = state(page)['couple']['controlledId'] + 'Pos'
    page.locator('[data-couple-view="first"]').click()
    # Align the player to the door using an ordinary drag. Characters have
    # random idle headings, so read the real camera rather than assuming one.
    yaw = "(() => {const c=window.__fairytaleWorld.camera,d=c.getTarget().subtract(c.position);return Math.atan2(-d.x,-d.z)})()"
    dx = round(page.evaluate(yaw) / .0052)
    begin = 427 - dx / 2
    page.mouse.move(begin, 185)
    page.mouse.down()
    page.mouse.move(begin + dx, 185, steps=5)
    page.mouse.up()
    page.wait_for_function(f'() => Math.abs({yaw}) < 0.03')

    def move(key, condition):
        page.keyboard.down(key)
        try:
            page.wait_for_function('() => ' + condition, timeout=90_000)
        finally:
            page.keyboard.up(key)
        return state(page)['couple']

    pos = f'{c}.{actor}'
    x = state(page)['couple'][actor][0]
    if abs(x + 14) > 0.05:
        move('a' if x > -14 else 'd', f'{pos}[0] {"<=" if x > -14 else ">="} -14')
    page.keyboard.down('Shift')
    try:
        move('w', f'{pos}[2] <= 5.25')
    finally:
        page.keyboard.up('Shift')
    door = report['door'] = {'outside': state(page)['couple']}
    require(abs(door['outside'][actor][0] + 14) < .45, f'Missed door corridor: {door}')
    page.wait_for_function(f'() => {c}.nearestId === "villa-front-doors"')
    page.keyboard.press('e')
    hinge = 'Math.abs(window.__fairytaleWorld.scene.getTransformNodeByName("VillaGLB_Villa_FrontDoor_L").rotationQuaternion.y)'
    page.wait_for_function(f'() => {hinge} < 0.02')
    # More than enough simulation time to traverse both sides if the door is
    # only decorative. W stays down throughout; sample both live actor roots.
    t = state(page)['simTime']
    door['blocked'] = move('w', f'window.__fairytaleWorld.getState().simTime >= {t + 1.65}')
    for name in ('xianPos','ranPos'):
        require(door['blocked'][name][2] >= 3.92, f'Walked through closed door: {door}')
    require(door['outside'][actor][2] - door['blocked'][actor][2] > .35, f'Never approached the closed door: {door}')
    capture(page, output / '05-closed-door.png', report)
    page.keyboard.press('e')
    page.wait_for_function(f'() => {hinge} > 0.55')
    door['inside'] = move('w', f'{c}.xianPos[2] < 3.3 && {c}.ranPos[2] < 3.3')
    capture(page, output / '06-couple-inside.png', report)


def verify(page, url, output, report):
    nav = report['documents'] = []
    errors = report['errors'] = []
    photos = report['photos'] = []
    island = report['island'] = []
    page.on('framenavigated', lambda f: nav.append(f.url) if f == page.main_frame else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('requestfailed', lambda r: errors.append(f'{r.url}: {r.failure}'))

    def response(r):
        path = urlsplit(r.url).path.lower()
        if '/plates/' in path or (r.request.resource_type == 'image' and path.endswith(('.jpg', '.jpeg'))):
            photos.append(r.url)
        if r.request.resource_type == 'script':
            report.setdefault('scripts', []).append({'url':r.url, 'status':r.status})
        if r.url == urljoin(url, 'island.glb'):
            island.append({'url': r.url, 'status': r.status})
        if r.status >= 400:
            errors.append(f'{r.status}: {r.url}')

    page.on('response', response)
    page.goto(url, wait_until='domcontentloaded', timeout=120_000)
    require(not photos and not page.locator('#plate:visible').count(), f'Gallery/photo fallback: {photos}')
    require(page.locator('#diorama-canvas').is_visible(), 'Missing playable canvas')
    page.wait_for_function("() => window.__fairytaleWorld?.ready === true || document.querySelector('.loading-error')", timeout=180_000)
    fatal = page.locator('.loading-error')
    require(not fatal.count(), f'World failed to boot: {fatal.all_text_contents()}')
    page.wait_for_load_state('networkidle', timeout=30_000)
    page.locator('#loading-overlay').wait_for(state='hidden')
    require(island and all(r['status'] == 200 for r in island), f'Missing live island GLB: {island}')
    if report['quality'] == 'low':
        page.keyboard.press('F3')
        page.locator('[data-quality="low"]').click()
        page.keyboard.press('F3')
    play_route(page, output, report)
    require(nav == [url] and len(page.context.pages) == 1, f'Unexpected navigation: {nav}')
    require(not photos, f'Photo fallback: {photos}')
    require(not errors, f'Browser or resource errors: {errors}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True, help='Playable homepage URL including trailing slash')
    parser.add_argument('--evidence', type=Path, help='Destination directory for screenshots and report.json')
    parser.add_argument('--channel', default='chromium', choices=('chromium','chrome','msedge'))
    parser.add_argument('--angle', choices=('default','gl','swiftshader','d3d11'), default='default',
                        help='Chromium ANGLE backend; choose gl for accelerated Linux/WSLg')
    parser.add_argument('--quality', choices=('auto','low'), default='auto', help='Select game quality via normal F3 HUD')
    parser.add_argument('--route', choices=('couple','desk'), default='couple', help='Full couple/collision route or independent solo desk route')
    args = parser.parse_args()
    if urlsplit(args.url).scheme not in ('http', 'https') or urlsplit(args.url).query:
        parser.error('Supply an HTTP(S) homepage without query parameters (production input, not a QA mode)')
    output = args.evidence or Path(tempfile.mkdtemp(prefix='playable-qa-'))
    output.mkdir(parents=True, exist_ok=True)
    report = {'url': args.url, 'passed': False, 'quality':args.quality, 'routeType':args.route}
    try:
        flags = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=' + args.angle]
        if args.angle == 'swiftshader':
            flags.append('--enable-unsafe-swiftshader')
        with sync_playwright() as p, p.chromium.launch(headless=True, channel=args.channel, args=flags) as browser:
            page = browser.new_page(viewport={'width': 854, 'height': 480})
            try:
                verify(page, args.url, output, report)
                report['passed'] = True
            except Exception as e:
                report['failure'] = str(e)
                if not page.is_closed() and 'arrival' in report:
                    report['lastState'] = state(page)
                    capture(page, output / 'failure.png', report)
                raise
    finally:
        (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f"{'PASS' if report['passed'] else 'FAIL'}: {output.resolve()}", flush=True)


if __name__ == '__main__':
    main()
