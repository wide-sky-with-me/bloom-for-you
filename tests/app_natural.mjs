// Application-only contracts: fake DOM/network/GPU boundary, not visual or GL evidence.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../site/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../site/style.css', import.meta.url), 'utf8');
const themes = ['rose','tulip','hydrangea','wildflower','peony','lily','sunflower','calla'];
const views = ['champagne_ranunculus','garden_rose','anemone','sweet_pea'];
const deferred = () => {let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;});return {promise,resolve,reject};};
const abortError = () => new DOMException('Superseded', 'AbortError');
function fixture({legacy = false, svg = true} = {}) {
  const record = (id,prefix = id) => ({id,file:`${prefix}.bin`,surface:`${prefix}.mesh`,growth:`${prefix}.growth`,...(svg ? {svg:`${prefix}.svg`} : {})});
  return {version:2,count:120000,stride:11,style:'natural-garden-v1',defaultBouquet:'rose',
    bouquets: themes.map(id => ({...record(id),...(legacy ? {} : {headCount:27}),
      composition:[{species:legacy ? 'rose' : 'champagne_ranunculus',count:legacy ? 36 : 27}]})),
    closeups:views.map(id => ({...record(id,`closeup-${id}`),title:id,description:`花型 ${id}`,pointCount:16000}))};
}
class Element {
  constructor(id = '') {this.id=id;this.dataset={};this.attributes={};this.style={setProperty:(k,v)=>{this.style[k]=v;}};this.hidden=false;this.disabled=false;this.textContent='';this.listeners=new Map();this.children=[];
    const classes=new Set();this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>{const value=on??!classes.has(x);value?classes.add(x):classes.delete(x);return value;}};
  }
  setAttribute(k,v){this.attributes[k]=String(v);}
  getAttribute(k){return this.attributes[k]??null;}
  addEventListener(k,fn){if(!this.listeners.has(k))this.listeners.set(k,[]);this.listeners.get(k).push(fn);}
  async emit(k,event={}){return Promise.all((this.listeners.get(k)??[]).map(fn=>fn(event)));}
  replaceChildren(...children){this.children=children;}
  showModal(){this.open=true;}
  close(){this.open=false;void this.emit('close');}
  getBoundingClientRect(){return {left:0,top:0,right:100,bottom:100};}
  animate(){this.animated=true;}
}
async function until(predicate, label = 'condition') {
  for(let i=0;i<200;i++){if(predicate())return;await new Promise(setImmediate);}
  assert.fail(`Timed out waiting for ${label}`);
}
function rig(options = {}) {
  const manifest = options.manifest ?? fixture();
  const ids = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>[id,new Element(id)]));
  const buttons = [...themes.map(id=>Object.assign(new Element(),{dataset:{bouquet:id}})),
    ...['bouquet',...views].map(id=>Object.assign(new Element(),{dataset:{view:id}}))];
  const containers = new Map(['.site-header','.intro','.collection','.site-footer','.unread-dot'].map(x=>[x,new Element()]));
  const document = Object.assign(new Element(),{hidden:false,body:new Element('body'),documentElement:new Element('root'),
    getElementById:id=>{assert.ok(ids.has(id),`Known HTML id ${id}`);return ids.get(id);},
    querySelector:s=>containers.get(s),
    querySelectorAll:s=>s==='button[data-bouquet]'?buttons.filter(x=>x.dataset.bouquet):s==='button[data-view]'?buttons.filter(x=>x.dataset.view):[],
    createElement:()=>new Element()});
  const location = new URL(options.url??'http://gallery.test/');
  const window = new Element('window'), media = Object.assign(new Element(),{matches:options.reduced??false});
  const timers=new Map(), idle=[], requests=[], images=[], warnings=[];let nextTimer=0, garden;
  const setTimer=(fn,delay=0)=>{const id=++nextTimer;timers.set(id,{fn,delay});if(delay===0)setImmediate(()=>{if(timers.delete(id))fn();});return id;};
  const clearTimer=id=>timers.delete(id);
  window.requestIdleCallback=fn=>idle.push(fn);
  const raf=new Map();let nextFrame=0;
  const requestAnimationFrame=fn=>{const id=++nextFrame;raf.set(id,fn);setImmediate(()=>{if(raf.delete(id))fn(16);});return id;};
  const cancelAnimationFrame=id=>raf.delete(id);
  const manifestGate=options.holdManifest?deferred():null;
  const bodyGates=new Map();
  function waitWithAbort(gate,signal){return new Promise((resolve,reject)=>{
    const abort=()=>reject(abortError());
    if(signal.aborted)return abort();
    signal.addEventListener('abort',abort,{once:true});
    gate.promise.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},reject);
  });}
  const fetch=async(url,{signal}={})=>{
    const parsed=new URL(url), file=parsed.pathname.split('/').at(-1);
    requests.push({url:parsed.href,file,signal});
    return {ok:true,json:async()=>{
      if(file==='gift.json')return {recipient:'老婆',salutation:'亲爱的老婆：',signature:'老公',letter:['平凡的日子，也是花期。']};
      return manifestGate?waitWithAbort(manifestGate,signal):structuredClone(manifest);
    },arrayBuffer:async()=>{
      if(options.failBodies?.has(file))throw new Error('Fixture network failure');
      if(options.holdBodies?.has(file)){
        const gate=deferred();bodyGates.set(file,gate);return waitWithAbort(gate,signal);
      }
      return new ArrayBuffer(4);
    }};
  };
  class Image {
    set src(value){this._src=value;if(!value)return;images.push(this);setImmediate(()=>{
      if(options.failImages?.has(new URL(value).pathname.split('/').at(-1)))this.onerror?.();else this.onload?.();
    });}
    get src(){return this._src;}
  }
  class Garden {
    constructor(canvas,opts){if(options.noGL)throw new Error('No WebGL fixture');garden=this;this.options=opts;this.paused=opts.reducedMotion;this.reducedMotion=opts.reducedMotion;this.data=null;this.starts=[];this.commits=[];this.preparedCache=new Map();this.holdPrepare=new Set();this.holdQueue=new Set();this.prepares=new Map();}
    cancelPreparation(){if(this.activePrepare&&!this.uncancellable)this.activePrepare.reject(abortError());this.activePrepare=null;if(this.pending){this.pending.reject(abortError());this.pending=null;}}
    async prepareBouquet(key,input){
      this.starts.push({key,input});
      if(this.holdPrepare.has(key)){const gate=deferred();this.prepares.set(key,gate);this.activePrepare=gate;return gate.promise;}
      const result={key,input};this.preparedCache.delete(key);this.preparedCache.set(key,result);while(this.preparedCache.size>4)this.preparedCache.delete(this.preparedCache.keys().next().value);return result;
    }
    queuePrepared(prepared,immediate,onWaiting){
      if(this.holdQueue.has(prepared.key)){const gate=deferred();this.pending={...gate,prepared,immediate};onWaiting();return gate.promise;}
      this.data=prepared.input;this.commits.push({key:prepared.key,count:prepared.input.count,immediate,paused:this.paused});return Promise.resolve(true);
    }
    flush(){if(this.pending){const p=this.pending;this.pending=null;this.data=p.prepared.input;this.commits.push({key:p.prepared.key,count:p.prepared.input.count,immediate:p.immediate,paused:this.paused});p.resolve(true);}}
    setPaused(value){this.paused=value;if(value)this.flush();this.options.onMotionChange(value);}
    setReducedMotion(value){this.reducedMotion=value;this.setPaused(value);}
    bloom(){if(!this.reducedMotion)this.setPaused(false);}
    requestFrame(){}
    dispose(){this.disposed=true;this.cancelPreparation();this.preparedCache.clear();}
  }
  let clipboard='';
  const context=vm.createContext({document,window,location,history:{replaceState:(_a,_b,url)=>{location.href=new URL(url,location).href;}},
    navigator:{connection:options.connection??{saveData:true},clipboard:{writeText:async value=>{clipboard=value;}}},
    matchMedia:()=>media,URL,URLSearchParams,AbortController,DOMException,Image,fetch,ParticleGarden:Garden,
    setTimeout:setTimer,clearTimeout:clearTimer,requestAnimationFrame,cancelAnimationFrame,
    requestIdleCallback:window.requestIdleCallback,console:{warn:(...args)=>warnings.push(args)}});
  const initialized=vm.runInContext(source.replace(/^import[^\n]+\n/,''),context,{filename:'app.js'});
  return {context,initialized,document,ids,buttons,media,window,requests,timers,idle,images,bodyGates,manifestGate,warnings,
    get garden(){return garden;},get clipboard(){return clipboard;},run:text=>vm.runInContext(text,context),
    ready:async()=>{await initialized;await until(()=>document.body.dataset.ready==='true','app initialization');},
    triggerTimeout:delay=>{const item=[...timers.entries()].find(([,timer])=>timer.delay===delay);assert.ok(item,`Timeout ${delay}`);timers.delete(item[0]);item[1].fn();},
    close:()=>vm.runInContext('disposePage({persisted:false})',context)};
}

test('complete gift HTML keeps eight themes, five accessible views, v7 assets and quiet wrapping controls',()=>{
  assert.equal([...html.matchAll(/data-bouquet="/g)].length,9); // eight buttons + body theme
  assert.equal([...html.matchAll(/data-view="/g)].length,6); // five buttons + body view
  for(const id of ['letter-dialog','letter-body','recipient','share-button','fullscreen-toggle','retry-bouquet'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/把每一次心动/);assert.match(html,/往后的每一个春天/);
  assert.doesNotMatch(html,/独立样张|技术仪表盘/);
  for(const [,url] of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g))assert.equal(new URL(url,'http://gallery.test/').searchParams.get('v'),'7',url);
  assert.match(css,/--night:\s*#232b28/);assert.match(css,/\.view-choices\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css,/flower-song\.woff2\?v=7/);
});

test('variable actual composition and legacy36 validate; unsafe paths and count mismatches fail',async()=>{
  const r=rig();await r.ready();
  assert.equal(r.run('validComposition(manifest.bouquets[0])'),true);
  assert.equal(r.ids.get('bouquet-ingredients').textContent,'花材：洋牡丹');
  const legacy=fixture({legacy:true});r.context.candidate=legacy;
  assert.equal(r.run('validateManifest(candidate).bouquets[0].composition[0].count'),36);
  for(const mutate of [m=>m.bouquets[0].headCount=28,m=>m.closeups[0].pointCount=120000,m=>m.closeups[0].file='../outside.bin',m=>m.bouquets[1].id='rose']){
    const value=fixture();mutate(value);r.context.candidate=value;assert.throws(()=>r.run('validateManifest(candidate)'),/Invalid/);
  }
  assert.ok(r.requests.every(x=>new URL(x.url).searchParams.get('v')==='7'));
  r.close();
});

test('closeup keeps chosen theme, return restores it, theme selection resets view and URLs round-trip',async()=>{
  const r=rig({url:'http://gallery.test/?to=%E5%B0%8F%E6%BB%A1&from=%E6%88%91&message=%3Cb%3E%E7%88%B1%3C%2Fb%3E#tulip'});await r.ready();
  await r.context.selectView('garden_rose');
  assert.equal(r.document.body.dataset.bouquet,'tulip');assert.equal(r.document.body.dataset.view,'garden_rose');
  assert.equal(r.garden.commits.at(-1).count,16000);assert.equal(r.garden.commits.at(-1).immediate,true);
  await r.ids.get('share-button').emit('click');
  const share=new URL(r.clipboard);assert.equal(share.hash,'#tulip');assert.equal(share.searchParams.get('view'),'garden_rose');assert.equal(share.searchParams.get('to'),'小满');
  assert.equal(r.ids.get('letter-body').children[0].textContent,'<b>爱</b>');
  await r.context.selectView('bouquet');assert.equal(r.garden.commits.at(-1).key,'bouquet:tulip');
  assert.equal(r.run('location.search.includes("view=")'),false);
  await r.context.selectView('anemone');await r.context.selectBouquet('lily');
  assert.equal(r.document.body.dataset.bouquet,'lily');assert.equal(r.document.body.dataset.view,'bouquet');
  const deep=rig({url:share.href});await deep.ready();assert.equal(deep.document.body.dataset.bouquet,'tulip');assert.equal(deep.document.body.dataset.view,'garden_rose');deep.close();r.close();
});

test('fetch, prepare and queued selection share one latest-only version without early captions',async()=>{
  const r=rig({holdBodies:new Set(['closeup-garden_rose.bin'])});await r.ready();
  const original=r.ids.get('bouquet-title').textContent;
  const slow=r.context.selectView('garden_rose');await until(()=>r.bodyGates.has('closeup-garden_rose.bin'),'held fetch');
  assert.equal(r.ids.get('bouquet-title').textContent,original);
  await r.context.selectBouquet('tulip');await slow;
  assert.equal(r.document.body.dataset.view,'bouquet');assert.equal(r.document.body.dataset.bouquet,'tulip');
  assert.ok(r.requests.find(x=>x.file==='closeup-garden_rose.bin').signal.aborted);
  r.garden.uncancellable=true;r.garden.holdPrepare.add('closeup:anemone');
  const preparing=r.context.selectView('anemone');await until(()=>r.garden.prepares.has('closeup:anemone'),'held preparation');
  await r.context.selectBouquet('rose');
  r.garden.prepares.get('closeup:anemone').resolve({key:'closeup:anemone',input:{count:16000}});await preparing;
  assert.equal(r.garden.commits.at(-1).key,'bouquet:rose');
  r.garden.holdQueue.add('closeup:sweet_pea');
  const waiting=r.context.selectView('sweet_pea');await until(()=>r.garden.pending,'pending queue');
  assert.equal(r.ids.get('gallery').dataset.prepareState,'waiting');assert.equal(r.document.body.dataset.view,'bouquet');
  await r.context.selectBouquet('calla');await waiting;
  assert.equal(r.document.body.dataset.bouquet,'calla');assert.equal(r.document.body.dataset.view,'bouquet');
  assert.equal(r.ids.get('gallery').getAttribute('aria-busy'),'false');r.close();
});

test('slow startup retains combined theme/view intent and explicit pause survives all static views',async()=>{
  const r=rig({holdManifest:true});await r.context.selectBouquet('peony');await r.context.selectView('sweet_pea');
  await r.ids.get('motion-toggle').emit('click');
  assert.equal(r.garden.paused,true);
  r.manifestGate.resolve(fixture());await r.ready();
  assert.equal(r.document.body.dataset.bouquet,'peony');assert.equal(r.document.body.dataset.view,'sweet_pea');
  assert.equal(r.garden.paused,true);
  await r.context.selectView('bouquet');await r.context.selectView('garden_rose');
  assert.equal(r.garden.paused,true);assert.ok(r.garden.commits.every(x=>x.paused));
  await r.media.emit('change',{matches:true});await r.media.emit('change',{matches:false});assert.equal(r.garden.paused,true);
  r.close();
});

test('current timeout is recoverable, does not change old view and clears busy state',async()=>{
  const holds=new Set(['closeup-anemone.bin']);const r=rig({holdBodies:holds});await r.ready();
  const pending=r.context.selectView('anemone');await until(()=>r.bodyGates.has('closeup-anemone.bin'),'slow response body');
  r.triggerTimeout(45000);await pending;
  assert.equal(r.document.body.dataset.view,'bouquet');assert.equal(r.ids.get('gallery').dataset.prepareState,'error');
  assert.equal(r.ids.get('gallery').getAttribute('aria-busy'),'false');assert.match(r.ids.get('toast').textContent,/再试/);
  holds.clear();await r.ids.get('retry-bouquet').emit('click');
  assert.equal(r.document.body.dataset.view,'anemone');assert.equal(r.ids.get('gallery').dataset.prepareState,'committed');r.close();
});

test('no GL supports only existing closeup SVGs; absent SVG disables near view without blanking bouquet',async()=>{
  const r=rig({noGL:true,manifest:fixture({svg:false})});await r.ready();
  assert.equal(r.document.body.dataset.mode,'illustration');assert.match(r.ids.get('fallback-art').src,/rose\.svg\?v=7$/);
  assert.ok(r.buttons.filter(x=>x.dataset.view&&x.dataset.view!=='bouquet').every(x=>x.disabled));
  assert.match(r.ids.get('view-note').textContent,/暂不支持近看/);
  const before=r.ids.get('fallback-art').src;assert.equal(await r.context.selectView('garden_rose'),false);assert.equal(r.ids.get('fallback-art').src,before);
  await r.context.selectBouquet('sunflower');assert.equal(r.document.body.dataset.bouquet,'sunflower');r.close();
  const withSVG=rig({noGL:true});await withSVG.ready();await withSVG.context.selectView('garden_rose');
  assert.equal(withSVG.document.body.dataset.bouquet,'rose');assert.equal(withSVG.document.body.dataset.view,'garden_rose');
  assert.match(withSVG.ids.get('fallback-art').src,/closeup-garden_rose\.svg\?v=7$/);withSVG.close();
});

test('raw/prepared are bounded, fast prefetch is optional, gift immersive and dispose remain intact',async()=>{
  const r=rig();await r.ready();assert.equal(r.idle.length,0);
  for(const id of themes)await r.context.selectBouquet(id);
  for(const view of views)await r.context.selectView(view);
  assert.ok(r.run('cache.size')<=4);assert.ok(r.garden.preparedCache.size<=4);
  await r.ids.get('open-letter').emit('click');assert.equal(r.ids.get('letter-dialog').open,true);
  await r.ids.get('close-letter').emit('click');assert.equal(r.document.body.style.overflow,'');
  await r.ids.get('fullscreen-toggle').emit('click');assert.equal(r.document.body.classList.contains('is-immersive'),true);
  await r.document.emit('keydown',{key:'Escape'});assert.equal(r.document.body.classList.contains('is-immersive'),false);
  r.close();assert.equal(r.garden.disposed,true);assert.equal(r.run('cache.size'),0);
  const fast=rig({connection:{saveData:false,effectiveType:'4g'}});await fast.ready();assert.equal(fast.idle.length,1);await fast.idle[0]();
  assert.equal(fast.document.body.dataset.bouquet,'rose');assert.equal(fast.garden.starts.at(-1).key,'bouquet:tulip');fast.close();
});

test('initial timeout falls back atomically; illustration failure has an explicit retry instead of blank status',async()=>{
  const r=rig({holdBodies:new Set(['rose.bin'])});
  await until(()=>r.bodyGates.has('rose.bin'),'initial slow body');r.triggerTimeout(45000);await r.ready();
  assert.equal(r.document.body.dataset.mode,'illustration');assert.equal(r.garden.disposed,true);
  assert.equal(r.ids.get('gallery').getAttribute('aria-busy'),'false');r.close();
  const failures=new Set(['rose.svg']);const bad=rig({noGL:true,failImages:failures});await bad.ready();
  assert.equal(bad.ids.get('gallery-error').hidden,false);assert.equal(bad.ids.get('gallery').dataset.prepareState,'error');
  failures.clear();await bad.ids.get('retry-bouquet').emit('click');
  assert.equal(bad.ids.get('gallery-error').hidden,true);assert.equal(bad.ids.get('gallery').dataset.prepareState,'committed');bad.close();
});

test('context loss on a closeup without SVG restores its selected theme and disposal cancels late data',async()=>{
  const r=rig({manifest:fixture({svg:false})});await r.ready();await r.context.selectBouquet('lily');await r.context.selectView('garden_rose');
  r.garden.options.onLost();await until(()=>r.document.body.dataset.mode==='illustration'&&r.document.body.dataset.view==='bouquet'&&r.ids.get('gallery').getAttribute('aria-busy')==='false','fallback theme commit');
  assert.equal(r.document.body.dataset.bouquet,'lily');assert.match(r.ids.get('fallback-art').src,/lily\.svg\?v=7$/);r.close();
  const late=rig({holdBodies:new Set(['closeup-anemone.bin'])});await late.ready();
  const pending=late.context.selectView('anemone');await until(()=>late.bodyGates.has('closeup-anemone.bin'),'late body');
  const commits=late.garden.commits.length;late.close();await pending;
  assert.equal(late.garden.commits.length,commits);assert.equal(late.run('cache.size'),0);
  assert.ok(late.requests.find(x=>x.file==='closeup-anemone.bin').signal.aborted);
});
