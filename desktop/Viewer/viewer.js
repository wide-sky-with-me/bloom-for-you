import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { navigate } from './navigation.js';
import { setupMotion } from './motion.js';

const el = id => document.getElementById(id);
const view = el('view'), shot = el('shot');
const metres = ([x,y,z]) => new Vector3(x,z,-y);
// All art-directed camera positions stay in Blender coordinates alongside the layout.
const shots = {
  court: [[4.8,-12,4.9],[-.35,3.3,1.35],.87],
  rose: [[1.40,-6.65,1.27],[1.72,-6.25,.92],.62],
  lily: [[.65,-1.2,.85],[1.62,-.05,.09],.32],
  iris: [[-2.35,-6.85,1.02],[-2.86,-6.05,.75],.66],
  gardener: [[-1.35,-9,1.1],[-2,-5,.92],.58],
  swing: [[2.7,2.8,2.2],[-1.0,8.6,1.48],.79]
};

function atmosphere(scene, sunPosition) {
  const sky = CreateSphere('Sky', {diameter:300,segments:24}, scene);
  sky.infiniteDistance = true;
  sky.isPickable = false;
  const mat = new ShaderMaterial('Afterglow',scene,{
    vertexSource:'precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 ray;void main(){ray=position;gl_Position=worldViewProjection*vec4(position,1.);}',
    fragmentSource:'precision highp float;varying vec3 ray;uniform vec3 sun;void main(){vec3 d=normalize(ray);float h=max(d.y,0.);float facing=max(dot(d,sun),0.);vec3 horizon=mix(vec3(.83,.78,.80),vec3(.99,.82,.66),pow(facing,4.));vec3 c=mix(horizon,vec3(.46,.65,.80),smoothstep(0.,.74,h));c+=vec3(.12,.067,.028)*pow(facing,56.);gl_FragColor=vec4(c,1.);}'
  },{attributes:['position'],uniforms:['worldViewProjection','sun']});
  mat.setVector3('sun',sunPosition.normalizeToNew());mat.backFaceCulling=false;mat.disableDepthWrite=true;sky.material=mat;
  const fill = new HemisphericLight('Sky fill',new Vector3(0,1,0),scene);
  fill.diffuse=new Color3(.86,.92,1);fill.groundColor=new Color3(.34,.31,.29);fill.intensity=.82;
  const sun = new DirectionalLight('Late sun',sunPosition.negate().normalize(),scene);
  sun.position=sunPosition;sun.diffuse=new Color3(1,.85,.68);sun.intensity=2.1;
  sun.shadowMinZ=1;sun.shadowMaxZ=72;sun.shadowFrustumSize=38;
  scene.fogMode=Scene.FOGMODE_EXP2;scene.fogDensity=.0085;scene.fogColor=new Color3(.84,.76,.74);
  return sun;
}


async function openCourt(){
  const engine = new Engine(view,true,{powerPreference:'high-performance',stencil:true,antialias:true});
  const scene=new Scene(engine);scene.useRightHandedSystem=true;scene.skipPointerMovePicking=true;
  const camera=new ArcRotateCamera('View',0,1,10,Vector3.Zero(),scene);camera.minZ=.035;camera.maxZ=240;
  const light=atmosphere(scene,metres([-19,5,13]));
  const data=el('model');const bytes=Uint8Array.from(atob(data.textContent),c=>c.charCodeAt(0));data.remove();
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  await ImportMeshAsync(new Uint8Array(await new Response(stream).arrayBuffer()),scene,{pluginExtension:'.glb',name:'WaterCourt.glb'});
  for(const n of ['CalZero','CalEast','CalNorth'])scene.getNodeByName(n).setEnabled(false);
  scene.getNodeByName('CourtSwing').position.addInPlace(metres(SWING_PIVOT));
  const motion=setupMotion(scene);
  const shadows=new ShadowGenerator(2048,light);
  shadows.usePercentageCloserFiltering=true;shadows.filteringQuality=ShadowGenerator.QUALITY_LOW;
  shadows.bias=.00035;shadows.normalBias=.008;shadows.setDarkness(.19);
  for(const name of ['CourtShell','CourtPlanting','CourtSwing']){
    const root=scene.getNodeByName(name);
    for(const mesh of [root,...root.getChildMeshes()].filter(m=>m.getTotalVertices?.()>0)){
      mesh.receiveShadows=true;mesh.isPickable=false;
      // Sub-centimetre leaf movement receives the static light field; do not cast a frozen wind silhouette.
      if(!motion.isAnimatedMesh(mesh) || mesh.material?.name.startsWith('IB_Rose'))shadows.addShadowCaster(mesh,false);
    }
  }
  shadows.getShadowMap().refreshRate=0;
  let frame=0,timer=0,last=0,shadowStep=-1,ready=false;
  const tick=navigate(camera,shots,metres,draw);
  function render(now){frame=0;if(document.hidden)return;const {bloom,wind,active}=tick(now,Math.min(.12,(now-last)/1000));last=now;
    motion.update(now/1000,bloom,wind);const step=Math.round(bloom*14);if(step!==shadowStep){shadowStep=step;shadows.getShadowMap().resetRefreshCounter();}
    // A new morph shader can still be compiling after a pose change in reduced-motion mode.
    const canRender=scene.isReady();
    if(canRender){engine.beginFrame();scene.render();engine.endFrame();
      const state=wind?'breeze':'still';if(view.dataset.wind!==state)view.dataset.wind=state;
      if(view.dataset.shot!==shot.value)view.dataset.shot=shot.value;}
    if(active||!canRender)timer=setTimeout(draw,Math.max(0,1000/30-(performance.now()-now)));}
  function draw(){clearTimeout(timer);if(!ready||frame||document.hidden)return;frame=requestAnimationFrame(render);}
  function resize(){const width=view.clientWidth,height=view.clientHeight;
    const ratio=Math.min(devicePixelRatio,1.5,Math.sqrt(2400000/Math.max(1,width*height)));engine.setHardwareScalingLevel(1/ratio);engine.resize();draw();}
  new ResizeObserver(resize).observe(view);resize();
  const initial=tick(performance.now(),0);motion.update(0,initial.bloom,initial.wind);
  await scene.whenReadyAsync();ready=true;render(performance.now());
  el('notice').hidden=true;shot.disabled=el('reset').disabled=false;document.body.dataset.state='ready';
  document.addEventListener('visibilitychange',draw);
  engine.onContextRestoredObservable.add(()=>{shadows.getShadowMap().resetRefreshCounter();draw();});
}
openCourt().catch(error=>{console.error(error);document.body.dataset.state='error';el('status').textContent='水庭未能打开。请用新版 Chrome 或 Edge 启用图形加速，或重新生成看景文件。';el('retry').hidden=false;el('retry').onclick=()=>location.reload();});
