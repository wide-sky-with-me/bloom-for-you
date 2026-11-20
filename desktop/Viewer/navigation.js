// Centreline of the accessible paving in Art/landscape.py (north, east in metres).
const route = [[-10,0],[-7,-.65],[-5,-1.04],[-3.3,-.56],[-1.7,-.23],[-.5,-.49],[1.5,-1.14],[3.5,-1.4],[5.5,-1.27],[7.3,-.58]];
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
function pathX(y){for(let i=1;i<route.length;i++){const [a,x]=route[i-1],[b,end]=route[i];if(y<=b){const u=clamp((y-a)/(b-a),0,1);return x+(end-x)*u*u*(3-2*u);}}return route.at(-1)[1];}
const el=id=>document.getElementById(id);

export function navigate(camera,shots,metres,draw){
  const view=el('view'),shot=el('shot'),quiet=el('quiet'),phase=el('phase');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');quiet.checked=reduced.matches;
  const walking=()=>shot.value==='walk';
  let y=-10,goal=y,yaw=0,pitch=-.13,held=0;
  let bloom=0,armed=true,started=null;
  function flower(start,explicit){armed=false;started=quiet.checked&&!explicit?null:start;bloom=started===null?1:0;}
  function point(eye,target,fov){camera.lowerRadiusLimit=camera.upperRadiusLimit=null;camera.setTarget(metres(target));camera.setPosition(metres(eye));camera.fov=fov;}
  function pose(){const x=pathX(y),z=1.55,cp=Math.cos(pitch);point([x,y,z],[x+Math.sin(yaw)*cp,y+Math.cos(yaw)*cp,z+Math.sin(pitch)],.89);}
  function caption(){const near=!armed&&(walking()||shot.value==='rose');el('replay').hidden=shot.value!=='rose'&&!near;
    const text=!near?'':started===null?'玫瑰已盛开':bloom<.22?'外瓣舒展':bloom<.52?'中瓣展开':'花心舒展';if(phase.textContent!==text)phase.textContent=text;}
  function reset(){held=0;el('steps').hidden=!walking();el('help').textContent=walking()?'W / S 行走，拖动环顾':'拖动环视，滚轮缩放';
    if(walking()){y=goal=route[0][0];yaw=.045;pitch=-.14;pose();}
    else{point(...shots[shot.value]);camera.lowerRadiusLimit=Math.max(.09,camera.radius*.23);camera.upperRadiusLimit=camera.radius*2.3;}
    armed=true;started=null;bloom=0;if(shot.value==='rose')flower(performance.now(),false);caption();draw();}
  function walkBy(step){goal=clamp(goal+step,route[0][0],route.at(-1)[0]);if(quiet.checked){y=goal;pose();}draw();}
  function orbit(dx,dy){if(walking()){yaw-=dx*.005;pitch=clamp(pitch+dy*.005,-1.30,1.30);pose();}
    else{camera.alpha-=dx*.006;camera.beta=clamp(camera.beta-dy*.006,.15,1.555);}draw();}
  function zoom(factor){if(walking())walkBy(factor<1?.65:-.65);else{camera.radius=clamp(camera.radius*factor,camera.lowerRadiusLimit,camera.upperRadiusLimit);draw();}}
  el('reset').onclick=shot.onchange=reset;
  el('ahead').onclick=()=>walkBy(.9);el('back').onclick=()=>walkBy(-.9);
  el('replay').onclick=()=>{if(walking()){shot.value='rose';reset();}flower(performance.now(),true);caption();draw();};
  quiet.onchange=()=>{if(quiet.checked&&started!==null){started=null;bloom=1;}draw();};
  reduced.addEventListener('change',e=>{quiet.checked=e.matches;quiet.onchange();});
  const pointers=new Map();view.onpointerdown=e=>{if(e.button!==0)return;view.focus({preventScroll:true});view.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);};
  const span=()=>{const [a,b]=pointers.values();return Math.hypot(a[0]-b[0],a[1]-b[1]);};
  view.onpointermove=e=>{const p=pointers.get(e.pointerId);if(!p)return;const single=pointers.size===1,old=single?0:span();pointers.set(e.pointerId,[e.clientX,e.clientY]);
    if(single)orbit(e.clientX-p[0],e.clientY-p[1]);else if(!walking()&&pointers.size===2&&old>1&&span()>1)zoom(old/span());};
  view.onlostpointercapture=e=>pointers.delete(e.pointerId);
  view.addEventListener('wheel',e=>{e.preventDefault();const dy=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?view.clientHeight:1);if(walking())walkBy(-clamp(dy,-240,240)*.004);else zoom(Math.exp(clamp(dy,-240,240)*.0016));},{passive:false});
  window.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||!walking()||e.target===shot)return;const k=e.key.toLowerCase();if(k!=='w'&&k!=='s')return;e.preventDefault();if(!e.repeat){held=k==='w'?1:-1;walkBy(held*.14);}});
  window.addEventListener('keyup',e=>{if(['w','s'].includes(e.key.toLowerCase()))held=0;});window.addEventListener('blur',()=>held=0);
  view.onkeydown=e=>{switch(e.key){case 'ArrowLeft':orbit(-12,0);break;case 'ArrowRight':orbit(12,0);break;case 'ArrowUp':walking()?walkBy(.9):orbit(0,12);break;case 'ArrowDown':walking()?walkBy(-.9):orbit(0,-12);break;case '+':case '=':zoom(.84);break;case '-':zoom(1/.84);break;case 'Home':reset();break;default:return;}e.preventDefault();};
  let hiddenAt=null;document.addEventListener('visibilitychange',()=>{held=0;if(document.hidden)hiddenAt=performance.now();else if(hiddenAt!==null){if(started!==null)started+=performance.now()-hiddenAt;hiddenAt=null;draw();}});
  reset();
  return (now,dt)=>{
    if(walking()){
      if(held)goal=clamp(goal+held*1.65*dt,route[0][0],route.at(-1)[0]);
      if(y!==goal){y+=Math.sign(goal-y)*Math.min(Math.abs(goal-y),dt*2.6);pose();}
      const d=Math.hypot(pathX(y)-1.72,y+6.25);
      if(armed&&d<=2.7)flower(now,false);
      else if(!armed&&d>=3.6){armed=true;started=null;bloom=0;}
      el('back').disabled=goal<=route[0][0];el('ahead').disabled=goal>=route.at(-1)[0];
    }
    if(started!==null){bloom=clamp((now-started)/7000,0,1);if(bloom===1)started=null;}
    caption();const wind=!quiet.checked;
    return {bloom,wind,active:wind||started!==null||(walking()&&(held||goal!==y))};
  };
}
