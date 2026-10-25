"""Actual study GL/interaction checks; controlled-clock growth is not a speed test."""
from pathlib import Path
import argparse,hashlib,json,sys
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests'))
from webgl_observation import OBSERVE,SYNTHETIC_CLOCK
p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--output',type=Path,required=True)
a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
report={'checks':[],'views':[],'growth':{},'pageErrors':[],'consoleErrors':[]}
def check(name,value=True):
    assert value,name
    report['checks'].append(name);print('PASS:',name,flush=True)
def save(): (a.output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,args=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1440,'height':1100},device_scale_factor=1,reduced_motion='reduce')
    context.add_init_script(OBSERVE+SYNTHETIC_CLOCK)
    page=context.new_page();page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
    page.on('console',lambda m:report['consoleErrors'].append(m.text) if m.type=='error' else None)
    def step(ms=16):page.evaluate('ms=>window.__advanceBloom(ms)',ms)
    def state():return page.evaluate('''()=>{const g=__study.garden;return {engine:g.diagnostics.engine,study:g.diagnostics.study,points:g.count,meshes:g.diagnostics.meshCount,paused:g.paused,growth:g.bloomProgress,mix:g.mix,time:g.time,elapsed:g.elapsed,render:g.renderSerial,glError:g.gl.getError(),core:g.depthPoints.visible,grain:g.points.visible,material:g.mesh.material.type,geometries:g.renderer.info.memory.geometries,raw:__study.rawCacheSize,prepared:g.preparation.cache.size,bounds:__flowerBounds}}''')
    def select(key):
        page.locator(f'[data-view="{key}"]').click();expect(page.locator('body')).to_have_attribute('data-specimen',key,timeout=60000)
        page.wait_for_function('document.querySelector("#gallery").getAttribute("aria-busy")==="false"',polling=50);step();step()
    try:
        page.goto(a.url,wait_until='networkidle',timeout=60000)
        page.wait_for_function('document.body.dataset.ready==="true"||document.body.dataset.error',polling=50,timeout=60000)
        check('Initial asset preparation succeeds',not page.locator('body').get_attribute('data-error'));step();step()
        check('Real Three.js WebGL2 physical mesh owns study depth',state()['engine']=='three-webgl2' and state()['material']=='MeshPhysicalMaterial' and not state()['core'] and not state()['grain'])
        check('Reduced motion starts at a complete static specimen',state()['paused'] and state()['growth']==1)
        keys=page.locator('[data-view]').evaluate_all('(buttons)=>buttons.map(b=>b.dataset.view)')
        check('One bouquet and four genuinely selectable flower studies',len(keys)==5 and len(set(keys))==5)
        for key in keys:
            select(key)
            for label,yaw in (('front',0),('quarter',.785398),('side',1.570796),('back',3.141593)):
                page.evaluate('yaw=>{const g=__study.garden;g.rotation=[yaw,0];g.targetRotation=[yaw,0];g.requestFrame()}',yaw);step()
                s=state();image=page.locator('#bouquet').screenshot(path=str(a.output/f'{key}-{label}.png'))
                bounds=s['bounds'];assert bounds and bounds['coloredArea']>.003,(key,label,bounds)
                assert bounds['minX']>0 and bounds['maxX']<bounds['w']-1 and bounds['minY']>0 and bounds['maxY']<bounds['h']-1,(key,label,bounds)
                assert s['glError']==0 and not page.evaluate('__flowerEvidence.errors'),(key,label,s)
                report['views'].append({'specimen':key,'view':label,'sha256':hashlib.sha256(image).hexdigest(),**s});save()
            check(f'{key}: real front/quarter/side/back remain visible and unclipped')
            page.evaluate('()=>{const g=__study.garden;g.rotation=[.24,-.06];g.targetRotation=[.24,-.06];g.requestFrame()}');step()
            page.locator('#bloom').click();step(100)
            stages=[]
            cycle=page.evaluate('({...__study.garden.growthCycle})')
            targets=(('closing',cycle['close']*.4),('bud',cycle['close']+.01),
                     ('opening',cycle['close']+cycle['duration']*.5),
                     ('open',cycle['close']+cycle['duration']+.1))
            for label,target in targets:
                age=page.evaluate('()=>{const g=__study.garden;return g.elapsed-g.growthCycle.at}')
                remaining=max(0,(target-age)*1000)
                while remaining>60:step(60);remaining-=60
                if remaining>0:step(remaining)
                s=state();image=page.locator('#bouquet').screenshot(path=str(a.output/f'{key}-{label}.png'))
                assert s['glError']==0 and s['bounds']['coloredArea']>.002,(key,label,s)
                stages.append({'stage':label,'sha256':hashlib.sha256(image).hexdigest(),**s})
            report['growth'][key]=stages;save()
            check(f'{key}: actual GPU closes and reopens',min(x['growth'] for x in stages)<.08 and stages[-1]['growth']>.999 and len({x['sha256'] for x in stages})==4)
            page.locator('#motion').click();step();save()
        select('bouquet');page.locator('#bouquet').focus()
        before=page.evaluate('__study.garden.targetRotation[0]');page.keyboard.press('ArrowRight');step(200)
        check('Keyboard rotation changes the actual camera target',page.evaluate('__study.garden.targetRotation[0]')!=before)
        for _ in range(12):step(100)
        old=page.locator('#bouquet').screenshot();step(500)
        check('Paused actual pixels and clocks remain stable',old==page.locator('#bouquet').screenshot())
        for width in (320,390,768,1024):
            page.set_viewport_size({'width':width,'height':844});step();step()
            check(f'Layout fits {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
            if width==390:page.screenshot(path=str(a.output/'mobile.png'),full_page=True)
        page.set_viewport_size({'width':1440,'height':1100});step();step()
        page.screenshot(path=str(a.output/'desktop.png'),full_page=True)
        page.evaluate("['garden_rose','anemone','sweet_pea'].forEach(id=>__study.select(id))")
        expect(page.locator('body')).to_have_attribute('data-specimen','sweet_pea',timeout=60000);step();step()
        check('Rapid choices retain the latest specimen',page.evaluate('__study.selected')=='sweet_pea')
        check('Raw/prepared caches remain bounded',state()['raw']<=3 and state()['prepared']<=4)
        check('No accumulated active GPU geometry',state()['geometries']<=2)
        page.locator('#motion').click();step(100)
        page.evaluate("window.dispatchEvent(new Event('blur'))");step()
        frozen=state();step(1200)
        check('Blur freezes renderer time and stops continuous rendering',state()['time']==frozen['time'] and state()['render']==frozen['render'])
        page.evaluate("window.dispatchEvent(new Event('focus'))");step(100)
        check('Focus resumes without counting background wall time',state()['elapsed']-frozen['elapsed']<.2)
        page.evaluate('__study.dispose();__study.dispose()')
        check('Dispose is idempotent and clears owned renderer resources',page.evaluate('document.body.dataset.disposed==="true"&&__study.garden.disposed&&__study.garden.listeners.length===0&&__study.rawCacheSize===0'))
        check('No uncaught browser or shader errors',not report['pageErrors'] and not report['consoleErrors']);save()
    finally:save();context.close();browser.close()
