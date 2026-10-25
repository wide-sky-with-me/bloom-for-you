"""Native-RAF functional QA for the production four closeups, not an art/FPS gate.

Uses the existing server. No shader, requestAnimationFrame, business API, asset or
clock replacements. The no-WebGL case changes only device context availability.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import struct
import traceback
from datetime import datetime
from urllib.parse import urlencode, urljoin, urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

VIEWS = ['champagne_ranunculus', 'garden_rose', 'anemone', 'sweet_pea']
FLAGS = ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
SNAPSHOT = r"""() => {
  const c=document.querySelector('#bouquet'),g=c.__bloomGarden;
  return {body:{...document.body.dataset},canvas:{...c.dataset},diagnostics:g?.diagnostics??null,
    actual:g?{webgl2:g.gl instanceof WebGL2RenderingContext,scene:g.scene.isScene,
      renderer:g.renderer.isWebGLRenderer,mesh:g.mesh?.isMesh??false,
      physical:g.mesh?.material?.isMeshPhysicalMaterial??false,
      meshVertices:g.mesh?.geometry.getAttribute('position').count??0,
      meshIndices:g.mesh?.geometry.index.count??0,
      pointRecords:g.points?.geometry.getAttribute('position').count??0,
      cpuRecords:(g.targetData?.length??0)/11,gpuRecords:(g.gpuTargetData?.length??0)/16,
      coreVisible:!!g.depthPoints?.visible,grainVisible:!!g.points?.visible}:null,
    selectedThemes:[...document.querySelectorAll('button[data-bouquet][aria-pressed="true"]')].map(b=>b.dataset.bouquet),
    selectedViews:[...document.querySelectorAll('button[data-view][aria-pressed="true"]')].map(b=>b.dataset.view),
    title:document.querySelector('#bouquet-title').textContent,busy:document.querySelector('#gallery').getAttribute('aria-busy')};
}"""
FRAME = r"""() => new Promise(resolve => {
  const c=document.querySelector('#bouquet'),g=c.__bloomGarden;
  // Schedule the existing renderer and inspect after it in the same native RAF.
  // No wrapper, synthetic timestamp, draw suppression or custom rendering path.
  g.requestFrame();
  requestAnimationFrame(()=>{
    const gl=g.gl,w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
    const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let visible=0,minX=w,minY=h,maxX=-1,maxY=-1;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(pixels[(y*w+x)*4+3]>180){visible++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    resolve({serial:g.lastRender?.serial,glError:gl.getError(),w,h,visible,minX,minY,maxX,maxY,
      calls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles});
  });
})"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    base = args.url.rstrip('/') + '/'
    args.output.mkdir(parents=True, exist_ok=True)
    report = {'url':base, 'startedAt':datetime.now().astimezone().isoformat(), 'flags':FLAGS,
              'clock':'native RAF; no replacement', 'checks':[], 'states':[], 'assets':{},
              'pageErrors':[], 'consoleErrors':[], 'requests':[], 'phase':'start'}
    contexts = []
    current = None

    def save():
        (args.output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')

    def check(name, value=True, evidence=None):
        report['checks'].append({'name':name,'passed':bool(value),'evidence':evidence})
        save()
        assert value, name
        print('PASS:', name, flush=True)

    def create_context(browser, name, **options):
        context = browser.new_context(**options)
        contexts.append(context)
        page = context.new_page()
        page.on('pageerror',lambda e:report['pageErrors'].append({'context':name,'error':str(e)}))
        page.on('console',lambda m:report['consoleErrors'].append({'context':name,'text':m.text}) if m.type=='error' else None)
        page.on('request',lambda r:report['requests'].append({'context':name,'url':r.url,'type':r.resource_type}))
        return context,page

    def ready(page, url):
        page.goto(url,wait_until='networkidle',timeout=60000)
        page.wait_for_function('document.body.dataset.ready==="true" && document.querySelector("#gallery").getAttribute("aria-busy")==="false"',timeout=60000)
        page.evaluate('()=>document.fonts.ready')
        # Reconnaissance after execution/network idle, before selector actions.
        controls=page.locator('button[data-view]').evaluate_all('(buttons)=>buttons.map(b=>({view:b.dataset.view,text:b.textContent.trim(),disabled:b.disabled}))')
        check('Five actual view controls are present',len(controls)==5,controls)

    def select(page, theme, view, *, tap=False, action='view'):
        selector=f'button[data-bouquet="{theme}"]' if action=='theme' else f'button[data-view="{view}"]'
        if tap:page.locator(selector).tap(timeout=60000)
        else:page.locator(selector).click(timeout=60000)
        page.wait_for_function('([theme,view])=>document.body.dataset.bouquet===theme&&document.body.dataset.view===view&&document.querySelector("#gallery").getAttribute("aria-busy")==="false"',arg=[theme,view],timeout=60000)

    def sample(page, label):
        frame=page.evaluate(FRAME)
        state=page.evaluate(SNAPSHOT)
        report['states'].append({'label':label,'frame':frame,**state})
        check(label+': genuine nonempty native GL frame',frame['visible']>1000 and frame['glError']==0,frame)
        d=state['diagnostics']
        check(label+': bounded prepared cache and active meshes',d['cacheSize']<=4 and d['meshCount']<=2 and d['geometries']<=2,{'cache':d['cacheSize'],'meshes':d['meshCount'],'gpuGeometries':d['geometries']})
        return state

    def asset_requests(context_name, prefix):
        return [r for r in report['requests'] if r['context']==context_name
                and urlparse(r['url']).path.rsplit('/',1)[-1] in [prefix+'.bin',prefix+'.mesh',prefix+'.growth']]

    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=FLAGS)
        report['browser']=browser.version
        try:
            report['phase']='desktop'
            desktop,page=create_context(browser,'desktop',viewport={'width':1440,'height':1100},device_scale_factor=1,permissions=['clipboard-read','clipboard-write'])
            current=page
            query=urlencode({'to':'小满','from':'一个爱你的人','message':'<b>把爱留给你</b>'})
            ready(page,base+'?'+query+'#rose')
            manifest_response=desktop.request.get(urljoin(base,'assets/manifest.json?v=7'))
            assert manifest_response.ok
            manifest=manifest_response.json()
            report['manifest']=manifest
            entries={r['id']:r for r in manifest.get('closeups',[])}
            check('Manifest declares four real 16000-record closeups',set(entries)==set(VIEWS) and all(r['pointCount']==16000 for r in entries.values()))
            report['servedSHA256']={}
            for file in ['index.html','app.js','style.css','particles.js','botanical-garden.js','botanical-materials.js','three-garden.js','prepare-client.js','prepare-data.js','prepare-worker.js']:
                response=desktop.request.get(urljoin(base,file+'?v=7'));assert response.ok,(file,response.status)
                report['servedSHA256'][file]=hashlib.sha256(response.body()).hexdigest()
            for id,entry in entries.items():
                payload={}
                for field in ['file','surface','growth']:
                    response=desktop.request.get(urljoin(base,'assets/'+entry[field]+'?v=7'));assert response.ok,(id,field,response.status)
                    body=response.body();payload[field]=body
                    report['assets'][entry[field]]={'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()}
                mesh_magic,vertices,indices=struct.unpack_from('<4sII',payload['surface'])
                growth_magic,points,growth_vertices=struct.unpack_from('<4sII',payload['growth'])
                entry['_meshVertices']=vertices;entry['_meshIndices']=indices
                check(id+': actual three assets bind 16k BFM1/BFG1 records',len(payload['file'])==16000*11*4 and mesh_magic==b'BFM1' and growth_magic==b'BFG1' and points==16000 and growth_vertices==vertices and len(payload['growth'])==12+(points+vertices)*14)
            check('Default theme and view are the complete rose bouquet',page.locator('body').get_attribute('data-bouquet')=='rose' and page.locator('body').get_attribute('data-view')=='bouquet')
            page.get_by_role('button',name='暂停花束动画').click()
            for id in VIEWS:
                select(page,'rose',id)
                state=sample(page,id)
                d,a=state['diagnostics'],state['actual']
                check(id+': actual Three physical Mesh, natural style and 16k input binding',
                      d['engine']=='three-webgl2' and d['style']=='natural-garden' and state['canvas']['style']=='natural-garden'
                      and a['webgl2'] and a['scene'] and a['renderer'] and a['mesh'] and a['physical']
                      and d['material']=='MeshPhysicalMaterial' and d['pointCount']==16000
                      and a['pointRecords']==16000 and a['cpuRecords']==16000 and a['gpuRecords']==16000
                      and a['meshVertices']==entries[id]['_meshVertices'] and a['meshIndices']==entries[id]['_meshIndices']
                      and d['renderedPointCount']==0 and not a['coreVisible'] and not a['grainVisible'])
                check(id+': static selection preserves pause, theme and committed title',d['paused'] and d['growth']==1 and state['selectedThemes']==['rose'] and state['selectedViews']==[id] and state['title']==entries[id]['title'])
                page.locator('#bouquet').screenshot(path=str(args.output/(id+'.png')))
            frozen=page.evaluate(SNAPSHOT)['diagnostics'];image=page.locator('#bouquet').screenshot()
            page.wait_for_timeout(350)
            later=page.evaluate(SNAPSHOT)['diagnostics']
            check('Native paused closeup freezes actual pixels and both clocks',image==page.locator('#bouquet').screenshot() and later['time']==frozen['time'] and later['elapsed']==frozen['elapsed'])
            select(page,'rose','bouquet')
            check('Return restores selected complete bouquet',page.evaluate(SNAPSHOT)['diagnostics']['pointCount']==120000)
            select(page,'tulip','bouquet',action='theme');select(page,'tulip','garden_rose')
            check('Cross-theme closeup retains the new theme and pause preference',page.evaluate(SNAPSHOT)['diagnostics']['paused'] and page.locator('body').get_attribute('data-bouquet')=='tulip')
            page.get_by_role('button',name='有封信给你').click()
            check('Personalized closeup keeps literal gift content',page.locator('#recipient').inner_text()=='小满' and page.locator('#letter-signature').inner_text()=='一个爱你的人' and page.locator('#letter-body').inner_text()=='<b>把爱留给你</b>' and page.locator('#letter-body b').count()==0)
            page.keyboard.press('Escape')
            page.get_by_role('button',name='把这份浪漫收藏').click()
            expect(page.locator('#toast')).to_contain_text('已复制',timeout=10000)
            shared=page.evaluate('navigator.clipboard.readText()')
            report['sharedURL']=shared
            parsed=urlparse(shared);params=parse_qs(parsed.query)
            check('Actual clipboard URL preserves theme, view and personalization',parsed.fragment=='tulip' and params.get('view')==['garden_rose'] and params.get('to')==['小满'] and params.get('from')==['一个爱你的人'] and params.get('message')==['<b>把爱留给你</b>'])
            page.get_by_role('button',name='播放花束动画').click()
            before=page.evaluate(SNAPSHOT)['diagnostics']['elapsed'];page.wait_for_timeout(250)
            check('Explicit play resumes the native clock',page.evaluate(SNAPSHOT)['diagnostics']['elapsed']>before)
            page.evaluate('''()=>{window.__closeupQAClicks=[];document.addEventListener('click',e=>{const b=e.target.closest('button[data-view],button[data-bouquet]');if(b)__closeupQAClicks.push({theme:b.dataset.bouquet,view:b.dataset.view,trusted:e.isTrusted,t:performance.now()})},true)}''')
            for kind,id in [('theme','rose'),('view','anemone'),('theme','peony'),('view','sweet_pea'),('theme','calla'),('view','champagne_ranunculus'),('theme','tulip'),('view','garden_rose')]:
                page.locator(f'button[data-{"bouquet" if kind=="theme" else "view"}="{id}"]').click(timeout=60000)
                page.wait_for_timeout(40)
            page.wait_for_function('document.body.dataset.bouquet==="tulip"&&document.body.dataset.view==="garden_rose"&&document.querySelector("#gallery").getAttribute("aria-busy")==="false"',timeout=60000)
            page.wait_for_timeout(500)
            state=sample(page,'mixed-latest')
            report['mixedClicks']=page.evaluate('__closeupQAClicks')
            check('Trusted mixed rapid clicks retain only the final theme/view',len(report['mixedClicks'])==8 and all(c['trusted'] for c in report['mixedClicks']) and state['body']['bouquet']=='tulip' and state['body']['view']=='garden_rose' and state['selectedThemes']==['tulip'] and state['selectedViews']==['garden_rose'] and state['title']==entries['garden_rose']['title'])
            page.get_by_role('button',name='暂停花束动画').click()
            count=len(asset_requests('desktop','closeup-garden_rose'))
            select(page,'tulip','garden_rose')
            check('Warm raw closeup reuses all three fetched assets',len(asset_requests('desktop','closeup-garden_rose'))==count)
            select(page,'calla','bouquet',action='theme')
            for id in VIEWS:select(page,'calla',id)
            count=len(asset_requests('desktop','calla'))
            select(page,'calla','bouquet',action='theme')
            check('Raw LRU evicts after four other distinct assets',len(asset_requests('desktop','calla'))==count+3)
            sample(page,'cache-cycle')
            page.screenshot(path=str(args.output/'desktop.png'),full_page=True)

            report['phase']='deeplink'
            deep,deep_page=create_context(browser,'deeplink',viewport={'width':1440,'height':1000},device_scale_factor=1,reduced_motion='reduce')
            current=deep_page;ready(deep_page,shared)
            state=sample(deep_page,'shared-deeplink')
            check('A fresh context resolves the shared view into actual geometry',state['body']['bouquet']=='tulip' and state['body']['view']=='garden_rose' and state['diagnostics']['pointCount']==16000 and state['actual']['physical'])
            deep_page.get_by_role('button',name='有封信给你').click()
            check('Deep-link restores literal personalized gift',deep_page.locator('#recipient').inner_text()=='小满' and deep_page.locator('#letter-body').inner_text()=='<b>把爱留给你</b>' and deep_page.locator('#letter-body b').count()==0)
            deep.close();contexts.remove(deep)

            report['phase']='mobile'
            mobile,phone=create_context(browser,'mobile',viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,reduced_motion='reduce')
            current=phone;ready(phone,base)
            for id in VIEWS:
                select(phone,'rose',id,tap=True)
                state=sample(phone,'mobile-'+id)
                check(id+': mobile touch selects the real near specimen',state['body']['bouquet']=='rose' and state['body']['view']==id and state['diagnostics']['pointCount']==16000 and state['actual']['physical'] and state['diagnostics']['paused'])
            layout=phone.evaluate('''()=>{const canvas=document.querySelector('#bouquet').getBoundingClientRect(),controls=document.querySelector('#view-selection').getBoundingClientRect();return {innerWidth,scrollWidth:document.documentElement.scrollWidth,canvasBottom:canvas.bottom,controlsTop:controls.top,controlsLeft:controls.left,controlsRight:controls.right}}''')
            check('390px layout has no horizontal overflow or controls over flower',layout['scrollWidth']<=390 and layout['innerWidth']==390 and layout['controlsTop']>=layout['canvasBottom'] and layout['controlsLeft']>=0 and layout['controlsRight']<=390,layout)
            phone.screenshot(path=str(args.output/'mobile.png'),full_page=True)
            mobile.close();contexts.remove(mobile)

            report['phase']='no-webgl'
            fallback=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
            contexts.append(fallback)
            fallback.add_init_script("const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args)}")
            svg=fallback.new_page();current=svg
            svg.on('pageerror',lambda e:report['pageErrors'].append({'context':'no-webgl','error':str(e)}))
            svg.on('console',lambda m:report['consoleErrors'].append({'context':'no-webgl','text':m.text}) if m.type=='error' else None)
            svg.on('request',lambda r:report['requests'].append({'context':'no-webgl','url':r.url,'type':r.resource_type}))
            ready(svg,base)
            for id in VIEWS:
                select(svg,'rose',id)
                svg.wait_for_function('(()=>{const i=document.querySelector("#fallback-art");return i.complete&&i.naturalWidth>0})()')
                actual=svg.locator('#fallback-art').evaluate('(image)=>({src:image.currentSrc,w:image.naturalWidth,h:image.naturalHeight,hidden:image.hidden})')
                check(id+': genuine SVG works with all WebGL contexts disabled',svg.locator('body').get_attribute('data-mode')=='illustration' and f'/closeup-{id}.svg' in urlparse(actual['src']).path and actual['w']>0 and not actual['hidden'],actual)
            select(svg,'calla','bouquet',action='theme')
            check('No-WebGL theme change returns to its original bouquet SVG',svg.locator('body').get_attribute('data-view')=='bouquet' and '/calla.svg' in svg.locator('#fallback-art').evaluate('(i)=>i.currentSrc'))
            check('SVG fallback does not fetch point/mesh/growth assets',not any(r['context']=='no-webgl' and urlparse(r['url']).path.endswith(('.bin','.mesh','.growth')) for r in report['requests']))
            svg.screenshot(path=str(args.output/'no-webgl.png'),full_page=True)
            fallback.close();contexts.remove(fallback)

            report['phase']='dispose'
            current=page
            disposed=page.evaluate('''()=>{const c=document.querySelector('#bouquet'),g=c.__bloomGarden;window.__closeupDisposed=g;g.dispose();g.dispose();g.requestFrame();return {disposed:g.disposed,raf:g.raf,listeners:g.listeners.length,cache:g.preparation?.cache.size??0,pending:!!g.pendingPrepared,active:!!g.preparation?.active,geometries:g.renderer.info.memory.geometries,sceneObjects:g.scene.children.length,linked:!!c.__bloomGarden,serial:g.renderSerial}}''')
            page.wait_for_timeout(300)
            serial=page.evaluate('__closeupDisposed.renderSerial')
            check('Idempotent dispose clears prepared/GPU resources and does not restart native frames',disposed['disposed'] and not disposed['raf'] and disposed['listeners']==0 and disposed['cache']==0 and not disposed['pending'] and not disposed['active'] and disposed['geometries']==0 and disposed['sceneObjects']==0 and not disposed['linked'] and serial==disposed['serial'],disposed)
            check('No uncaught page or shader/console errors',not report['pageErrors'] and not report['consoleErrors'],{'page':report['pageErrors'],'console':report['consoleErrors']})
            report['status']='passed';save()
            print(f"{len(report['checks'])} native closeup checks passed; output: {args.output}",flush=True)
        except Exception as error:
            report['status']='failed'
            report['failure']={'type':type(error).__name__,'message':str(error),'phase':report['phase'],'traceback':traceback.format_exc()}
            if current is not None and not current.is_closed():
                try:
                    report['failure']['dom']=current.evaluate(SNAPSHOT)
                    current.screenshot(path=str(args.output/'failure.png'),full_page=True,timeout=10000)
                except Exception as probe_error:report['failure']['captureError']=str(probe_error)
            save()
            raise
        finally:
            save()
            for context in reversed(contexts):
                context.close()
            browser.close()


if __name__ == '__main__':
    main()
