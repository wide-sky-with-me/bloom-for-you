#!/usr/bin/env python3
"""Native choreography evidence; discrete pose studies and live motion stay distinct."""
import argparse,base64,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url',required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    out=args.output;out.mkdir(parents=True,exist_ok=True);report={'url':args.url,'nativeClock':True,'checks':[],'frames':[]};errors=[]
    def check(ok,name):
        if not ok:raise AssertionError(name)
        report['checks'].append(name);print('PASS:',name,flush=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        try:
            def page_for(width,height,motion='no-preference',touch=False,record=False):
                opts={'viewport':{'width':width,'height':height},'reduced_motion':motion,'has_touch':touch}
                if record:opts.update(record_video_dir=str(out/'raw-video'),record_video_size={'width':width,'height':height})
                ctx=browser.new_context(**opts);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(args.url,wait_until='networkidle')
                page.wait_for_function("window.__letterGarden?.getDiagnostics().sceneState==='ready' && __letterGarden.getDiagnostics().scene?.rendered",timeout=45000)
                return ctx,page
            def diag(page):return page.evaluate('__letterGarden.getDiagnostics()')
            def frame(page,label):
                d=page.evaluate('''()=>new Promise(resolve=>{const c=document.querySelector('#garden-canvas'),s=c.__gardenScene;s.requestFrame();requestAnimationFrame(()=>{const gl=c.getContext('webgl2'),a=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,a);let n=0;for(let i=3;i<a.length;i+=4)if(a[i]>20)n++;resolve({png:c.toDataURL('image/png').split(',')[1],coverage:n/(c.width*c.height),glError:gl.getError(),scene:s.getDiagnostics()})})})''')
                (out/(label+'-canvas.png')).write_bytes(base64.b64decode(d.pop('png')));page.screenshot(path=str(out/(label+'.png')),full_page=True)
                check(d['glError']==0 and d['coverage']>.005,label+': real nonempty GL frame');report['frames'].append({'label':label,**d});return d
            def layout(page,label):
                d=page.evaluate('''()=>{const c=document.querySelector('#garden-space').getBoundingClientRect(),copy=document.querySelector('#letter-copy').getBoundingClientRect();return {width:innerWidth,scroll:document.documentElement.scrollWidth,bottom:c.bottom,copy:copy.top}}''')
                check(d['scroll']<=d['width']+1 and d['copy']>d['bottom']+15,label+': portrait/text separation and no horizontal overflow')
            ctx,page=page_for(1200,900,record=True)
            try:
                page.screenshot(path=str(out/'desktop-closed.png'),full_page=True)
                page.evaluate('''()=>{window.__nativeSamples=[];let started=false;function observe(){const d=__letterGarden.getDiagnostics();if(d.state==='opening')started=true;const motion=d.scene?.specimens?.find(s=>s.role==='hero')?.motion;if(started)__nativeSamples.push({progress:d.sceneProgress,angles:motion?.angles,rest:motion?.restBypass});if(!started||d.state!=='open')requestAnimationFrame(observe)}requestAnimationFrame(observe)}''')
                page.locator('#open-letter').click();expect(page.locator('body')).to_have_attribute('data-state','open',timeout=14000)
                page.wait_for_function('!__letterGarden.getDiagnostics().scene.pendingFrame');samples=page.evaluate('__nativeSamples');report['liveOpeningSamples']=samples
                check(len(samples)>=3 and any(s.get('angles') and max(map(abs,s['angles']))>.25 for s in samples),'Native opening contains visibly substantial per-petal angles, not only opacity/scale')
                d=frame(page,'desktop-open');layout(page,'desktop-open');hero=next(s for s in d['scene']['specimens'] if s['role']=='hero')['motion']
                check(len(d['scene']['specimens'])>=2 and hero['petals']==25 and hero['sourceAttributesUnchanged'] and hero['restBypass'],'Two distinct real specimens and the intact mature source endpoint')
                count=diag(page)['scene']['renderCount'];page.wait_for_timeout(250);check(diag(page)['scene']['renderCount']==count,'Settled flower garden stops drawing')
                empty=page.locator('#garden-touch').bounding_box();page.locator('#garden-touch').click(position={'x':empty['width']*.01,'y':empty['height']*.01});page.wait_for_timeout(150)
                check(not diag(page)['scene']['reacting'],'Empty paper is not mistaken for a flower surface')
                target=next(t for t in d['scene']['reactCandidates'] if t['kind']=='petal' and t.get('hittable',True) and .1<t['x']<.9 and .1<t['y']<.9)
                box=page.locator('#garden-touch').bounding_box();page.locator('#garden-touch').click(position={'x':target['x']*box['width'],'y':target['y']*box['height']})
                page.wait_for_function('__letterGarden.getDiagnostics().scene.reacting',timeout=1500);reaction=diag(page)['scene'];report['reaction']=reaction
                check(1<=len(reaction['reactTargetIds'])<=3,'Trusted local touch reacts only on nearby real parts')
                page.wait_for_function('!__letterGarden.getDiagnostics().scene.reacting && !__letterGarden.getDiagnostics().scene.pendingFrame',timeout=5000)
                check(next(s for s in diag(page)['scene']['specimens'] if s['role']=='hero')['motion']['restBypass'],'Touch settles back to the exact mature bypass')
                def turntable():return diag(page)['scene']['turntable']
                box=page.locator('#garden-touch').bounding_box();cy=box['y']+box['height']*.5
                page.mouse.move(box['x']+box['width']*.35,cy);page.mouse.down();page.mouse.move(box['x']+box['width']*.65,cy,steps=12);page.mouse.up()
                page.wait_for_function("(()=>{const t=__letterGarden.getDiagnostics().scene;return !t.turntable.turning&&!t.turntable.velocity&&!t.pendingFrame})()",timeout=8000)
                turned=turntable();report['turntableAfterDrag']=turned
                check(abs(turned['yaw'])>.5 and not diag(page)['scene']['reacting'],'Horizontal drag turns the bouquet and does not count as a petal touch')
                count=diag(page)['scene']['renderCount'];page.wait_for_timeout(250);check(diag(page)['scene']['renderCount']==count,'Turned bouquet coasts to rest and stops drawing')
                page.locator('#garden-touch').focus();page.keyboard.press('Shift+ArrowRight');page.wait_for_function("!__letterGarden.getDiagnostics().scene.turntable.easing",timeout=6000)
                stepped=turntable()['yaw'];page.keyboard.press('Home');page.wait_for_function("!__letterGarden.getDiagnostics().scene.turntable.easing&&!__letterGarden.getDiagnostics().scene.pendingFrame",timeout=6000)
                check(abs(stepped-turned['yaw'])>.3 and abs(turntable()['yaw'])<1e-6,'Keyboard turns the bouquet and Home returns it to the front')
                page.locator('#replay').scroll_into_view_if_needed()
                before=page.evaluate("({text:document.querySelector('#letter-copy').innerText,scroll:scrollY,transform:getComputedStyle(document.querySelector('#letter')).transform})")
                page.locator('#replay').click();page.wait_for_function("__letterGarden.getDiagnostics().playback!=='idle'")
                during=page.evaluate("({text:document.querySelector('#letter-copy').innerText,scroll:scrollY,transform:getComputedStyle(document.querySelector('#letter')).transform})")
                check(before==during and diag(page)['state']=='open','Replay changes only the garden, preserving the open letter and reader position')
                page.wait_for_function("__letterGarden.getDiagnostics().playback==='idle'",timeout=14000)
                page.locator('#closer').click();page.wait_for_function('__letterGarden.getDiagnostics().scene.closeup===1',timeout=6000);frame(page,'desktop-closeup');layout(page,'desktop-closeup')
                page.evaluate('__letterGarden.dispose()');check(diag(page)['disposed'],'Experience disposal is explicit')
            finally:
                video=page.video;ctx.close()
                if video:video.save_as(str(out/'actual-opening-and-touch.webm'))
            ctx,page=page_for(390,844,'reduce',True)
            try:
                page.screenshot(path=str(out/'mobile-closed.png'),full_page=True);page.locator('#open-letter').tap();expect(page.locator('body')).to_have_attribute('data-state','open')
                check(diag(page)['sceneProgress']==1 and diag(page)['reducedMotion'],'Reduced motion opens directly to the mature state')
                frame(page,'mobile-open');layout(page,'mobile-open');page.locator('#replay').tap();check(diag(page)['state']=='open' and diag(page)['sceneProgress']==1,'Reduced replay never hides the letter')
                page.locator('#closer').tap();page.wait_for_function('__letterGarden.getDiagnostics().scene.closeup===1');frame(page,'mobile-closeup');layout(page,'mobile-closeup')
                gift=page.request.get(args.url.rstrip('/')+'/gift.json').json();check(page.locator('#letter-body').inner_text().replace('\n\n','\n')=='\n'.join(gift['letter']),'Original personal wording preserved literally')
                for width in (320,360,768):page.set_viewport_size({'width':width,'height':844});page.wait_for_timeout(80);layout(page,str(width)+'px')
                page.locator('#reread').click();page.locator('#open-letter').focus();page.keyboard.press('Enter');expect(page.locator('body')).to_have_attribute('data-state','open');check(diag(page)['sceneProgress']==1,'Native keyboard remains available')
            finally:ctx.close()
            ctx=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
            try:
                ctx.add_init_script("const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:get.call(this,type,...args)}")
                page=ctx.new_page();page.goto(args.url,wait_until='networkidle');page.wait_for_function("__letterGarden.getDiagnostics().sceneState==='error'");page.locator('#open-letter').click()
                check(page.locator('#letter-body').inner_text().strip() and page.locator('#closer').is_disabled(),'Without GL the full letter is still usable and unavailable flower controls are disabled')
            finally:ctx.close()
            check(not errors,'No uncaught page exceptions')
        finally:browser.close()
    report['status']='passed';report['pageErrors']=errors;(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print('Native choreography/gesture evidence saved; direct visual review is still required.')

if __name__=='__main__':main()
