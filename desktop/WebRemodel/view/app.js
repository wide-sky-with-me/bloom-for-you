import {places} from './places.mjs';
const $=id=>document.getElementById(id), body=document.body,guide=$('guide'),enter=$('enter'),status=$('status');
let current=places[0],world, loading=false, wantLive=false;
const picture=p=>'./plates/'+p.id+'.jpg';
function showPlace(p){
  current=p;body.dataset.spot=p.id;$('title').textContent='鸢尾湾·'+p.name;$('note').textContent=p.note;
  $('plate').src=picture(p);$('plate').alt=p.name+'的工作版实渲图';
  for(const b of $('places').children) b.setAttribute('aria-current',String(b.dataset.spot===p.id));
  if(world)world.setPlace(p);
}
function mode(value,message){
  body.dataset.mode=value;$('medium').textContent=value==='live'?'实时 3D':value==='loading'?'实渲图 · 正在载入 3D':'工作版实渲图';
  $('cameraTools').hidden=value!=='live';enter.disabled=value==='loading';
  enter.textContent=value==='live'?'看实渲图':value==='loading'?'正在进入…':'进入 3D';status.textContent=message;
}
function photo(message='当前是静态实渲图，可选择其他景点。'){
  wantLive=false;world?.pause();showPlace(current);mode('photo',message);
}
async function enter3D(){
  wantLive=true;
  if(loading){mode('loading','正在准备三维场景…');return;}
  try{
    if(!world){loading=true;mode('loading','正在载入岛屿模型…');
      const {openWorld}=await import(new URL('./world.js',import.meta.url).href);
      world=await openWorld($('island'),current,e=>{if(wantLive && e.lengthComputable && e.total)status.textContent=e.loaded===e.total?'模型已下载，正在准备场景…':'下载岛屿模型：'+Math.round(100*e.loaded/e.total)+'%';});
    }
    if(wantLive){world.setPlace(current);world.resume();showPlace(current);mode('live','拖动旋转，滚轮或双指缩放。');$('island').focus({preventScroll:true});}
  }catch(error){console.error('Island view:',error);if(wantLive)photo(error.code==='WEBGL'?'此浏览器未能启动 WebGL，已切换实渲图。':'3D 模型未载入，已切换实渲图；可重试进入。');}
  finally{loading=false;}
}
enter.onclick=()=>body.dataset.mode==='live'?photo():enter3D();
for(const p of places){const b=document.createElement('button');b.dataset.spot=p.id;b.setAttribute('aria-current',String(p===current));
  const img=document.createElement('img');img.alt='';img.loading='lazy';img.src=picture(p);b.append(img,p.name);$('places').append(b);
  b.onclick=()=>{guide.close();showPlace(p);if(body.dataset.mode==='cover')enter3D();};
}
$('spots').onclick=()=>guide.showModal();$('close').onclick=()=>guide.close();guide.onclick=e=>{if(e.target===guide && !e.target.matches(':hover'))guide.close();};
$('gallery').onclick=()=>{guide.close();photo();};
$('cameraTools').onclick=e=>{const action=e.target.closest('button')?.dataset.control;if(action)world?.control(action);};
$('island').addEventListener('webglcontextlost',()=>{if(body.dataset.mode==='live'){world?.dispose();world=undefined;photo('图形连接已断开，已切换实渲图。');}});
