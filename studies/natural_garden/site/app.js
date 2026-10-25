import { StudyGarden } from './study-garden.js?v=1';
import { decodeSurface } from './engine/surface-data.js?v=6';
import { decodeGrowth } from './engine/growth-data.js?v=6';

const $=id=>document.getElementById(id);
const canvas=$('bouquet'),media=matchMedia('(prefers-reduced-motion: reduce)');
const abortEvents=new AbortController(),rawCache=new Map();
let garden,manifest,selected='',version=0,fetching=null,disposed=false;
let userPaused=media.matches;
const revision=new URLSearchParams(location.search).get('revision')||'study-1';
const listen=(target,event,handler)=>target.addEventListener(event,handler,{signal:abortEvents.signal});
function updateMotion(){if(!garden)return;$('motion').textContent=garden.paused?'播放':'暂停';$('motion').setAttribute('aria-pressed',String(garden.paused));$('motion').setAttribute('aria-label',garden.paused?'播放花束动画':'暂停花束动画');}
function fail(error){
  if(disposed)return;
  $('failure').hidden=false;$('failure-message').textContent='这一页花型暂时没有准备好。可以重新加载，或回原来的花园看看。';
  $('loading-note').hidden=true;$('gallery').setAttribute('aria-busy','false');
  document.body.dataset.error=String(error?.message||error);
}
async function fetchPart(file,signal,json=false){
  const response=await fetch(new URL(`./assets/${file}?v=${encodeURIComponent(revision)}`,location.href),{signal,cache:'no-store'});
  if(!response.ok)throw new Error(`Study resource ${response.status}`);
  return json?response.json():response.arrayBuffer();
}
async function loadRaw(entry,signal){
  if(rawCache.has(entry.id)){const value=rawCache.get(entry.id);rawCache.delete(entry.id);rawCache.set(entry.id,value);return value;}
  const [binary,meshBuffer,growthBuffer]=await Promise.all([entry.file,entry.surface,entry.growth].map(file=>fetchPart(file,signal)));
  if(binary.byteLength!==entry.pointCount*11*4)throw new Error('Study point count mismatch');
  const particles=new Float32Array(binary),surface=decodeSurface(meshBuffer);
  const growth=decodeGrowth(growthBuffer,entry.pointCount,surface.vertices.length/9);
  const value={particles,surface,growth};rawCache.set(entry.id,value);
  while(rawCache.size>3)rawCache.delete(rawCache.keys().next().value);
  return value;
}
async function select(id){
  const entry=manifest?.specimens.find(item=>item.id===id);
  if(!entry||disposed||id===selected)return;
  const token=++version;fetching?.abort();garden.cancelPreparation();
  const controller=new AbortController();fetching=controller;
  const timeout=setTimeout(()=>controller.abort(new DOMException('Study fetch timed out','TimeoutError')),45000);
  $('gallery').setAttribute('aria-busy','true');$('loading-note').hidden=false;$('loading-note').textContent=selected?'换一个角度，看看新的花脸……':'在整理一束新花……';
  try{
    const raw=await loadRaw(entry,controller.signal);
    if(token!==version||disposed)return;
    const prepared=await garden.prepareBouquet(id,raw);
    if(token!==version||disposed)return;
    // First show the complete form. Replaying a real bud-to-bloom is explicit.
    garden.setPaused(true);
    await garden.queuePrepared(prepared,true);
    if(token!==version||disposed)return;
    selected=id;garden.rotation=[.24,-.06];garden.targetRotation=[.24,-.06];
    $('specimen-title').textContent=entry.title;$('specimen-description').textContent=entry.description;
    canvas.setAttribute('aria-label',`${entry.title}。拖动或用方向键旋转，轻点重新绽放。`);
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===id)));
    document.body.dataset.specimen=id;history.replaceState(null,'',`#${id}`);
    garden.requestFrame();
    requestAnimationFrame(()=>{if(token===version&&!disposed){garden.setPaused(userPaused);updateMotion();}});
  }catch(error){if(token===version&&!disposed&&error.name!=='AbortError')fail(error);else if(token===version&&!disposed&&controller.signal.aborted)fail(error);}
  finally{clearTimeout(timeout);if(token===version&&!disposed){$('gallery').setAttribute('aria-busy','false');$('loading-note').hidden=true;}}
}
function bloom(){
  if(!garden?.data)return;
  if(garden.reducedMotion)garden.setReducedMotion(false);
  userPaused=false;garden.setPaused(false);garden.bloom();updateMotion();
}
function dispose(){
  if(disposed)return;disposed=true;version++;fetching?.abort();abortEvents.abort();rawCache.clear();garden?.dispose();
  document.body.dataset.disposed='true';
}
async function init(){
  try{
    manifest=await fetchPart('manifest.json',undefined,true);
    if(!Array.isArray(manifest.specimens)||!manifest.specimens.length)throw new Error('Invalid study manifest');
    garden=new StudyGarden(canvas,{reducedMotion:media.matches,styleMode:new URLSearchParams(location.search).get('look')==='v6'?'v6':'botanical',onLost:()=>fail(new Error('WebGL context lost')),onMotionChange:updateMotion});
    window.__study={get garden(){return garden;},get selected(){return selected;},get rawCacheSize(){return rawCache.size;},select,bloom,dispose,
      setLook:mode=>garden.setStyleMode(mode),setPointLayers:layers=>garden.setPointLayers(layers)};
    for(const entry of manifest.specimens){
      const button=document.createElement('button');button.type='button';button.dataset.view=entry.id;button.setAttribute('aria-pressed','false');
      button.textContent=entry.id==='bouquet'?'看整束':`近看${entry.title}`;listen(button,'click',()=>select(entry.id));$('view-selection').append(button);
    }
    listen($('motion'),'click',()=>{userPaused=!garden.paused;if(!userPaused&&garden.reducedMotion)garden.setReducedMotion(false);garden.setPaused(userPaused);updateMotion();});
    listen($('bloom'),'click',bloom);
    listen($('reset-view'),'click',()=>{garden.targetRotation=[0,0];garden.requestFrame();});
    listen($('retry'),'click',()=>location.reload());
    listen(canvas,'pointerup',()=>{userPaused=garden.paused;updateMotion();});
    listen(media,'change',event=>{userPaused=event.matches;garden.setReducedMotion(event.matches);garden.setPaused(userPaused);updateMotion();});
    listen(window,'pagehide',dispose);
    const target=location.hash.slice(1);await select(manifest.specimens.some(e=>e.id===target)?target:manifest.defaultId);
    if(!disposed)document.body.dataset.ready='true';
  }catch(error){fail(error);}
}
init();
