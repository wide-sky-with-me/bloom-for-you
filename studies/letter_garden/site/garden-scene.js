// Decision: .agents/notes/proposed/letter-garden/2026-10-26-layered-floral-choreography.md
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {attachPetalMotion,ease} from './petal-motion.js';
const clamp=x=>Math.max(0,Math.min(1,Number(x)||0));
const OVERRIDE_KEYS=['transmission','transparent','alphaTest','depthWrite','roughness','metalness','side'];
function localURL(file,base){const url=new URL(file,base);if(url.origin!==new URL(base).origin||!/^https?:$/.test(url.protocol))throw new Error('Garden assets must be local same-origin files');return url;}
async function get(url,type,signal){const response=await fetch(url,{signal});if(!response.ok)throw new Error(`Asset ${response.status}: ${url}`);return type==='json'?response.json():response.arrayBuffer();}
async function hash(buffer){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function boxForMaterial(model,name){const box=new THREE.Box3();model.updateMatrixWorld(true);model.traverse(mesh=>{if(mesh.isMesh&&(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>m.name===name))box.union(new THREE.Box3().setFromObject(mesh,true));});return box;}
// Rest centreline of the hero's main stem: its foot, and its centre at a given height (where the companion is gathered).
function heroStem(model){
  const points=[];model.updateMatrixWorld(true);
  // Part 0 of the motion mapping is the unmoving main stem; leaf branches (26, 27) would pull the centre sideways.
  model.traverse(mesh=>{if(!mesh.isMesh||mesh.material?.name!=='m_stem')return;const p=mesh.geometry.attributes.position,part=mesh.geometry.attributes.aGardenPart;
    for(let i=0;i<p.count;i++)if(!part||part.getX(i)===0)points.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld));});
  if(!points.length)return null;const foot=points.reduce((a,b)=>b.y<a.y?b:a);
  return {foot,at(y,band=.05){const near=points.filter(v=>Math.abs(v.y-y)<band);return near.length?near.reduce((a,b)=>a.add(b),new THREE.Vector3()).divideScalar(near.length):foot.clone();}};
}
// TubeGeometry rings follow getPointAt(i/segments); rescale each ring about its centre so the stem thickens toward the foot.
function taperedTube(curve,segments,from,to,radial){
  const geometry=new THREE.TubeGeometry(curve,segments,1,radial,false),position=geometry.attributes.position,centre=new THREE.Vector3(),v=new THREE.Vector3();
  for(let i=0;i<=segments;i++){const t=i/segments,r=from+(to-from)*t*t;curve.getPointAt(t,centre);
    for(let j=0;j<=radial;j++){const k=i*(radial+1)+j;v.fromBufferAttribute(position,k).sub(centre).multiplyScalar(r).add(centre);position.setXYZ(k,v.x,v.y,v.z);}}
  // Tan where it meets the original orchid stem, greening toward the foot like a living spike.
  const colors=new Float32Array(position.count*3),top=new THREE.Color('#8a735c'),foot=new THREE.Color('#5d5f40'),c=new THREE.Color();
  for(let i=0;i<=segments;i++){c.lerpColors(top,foot,Math.min(1,i/segments*1.6));for(let j=0;j<=radial;j++)c.toArray(colors,(i*(radial+1)+j)*3);}
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  position.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
// Verified native raycast: assets/orchid-root-pick.json, Object_2 face 39473.
export function buildOrchidConnector(group,model,stem,gatherY){
  const node=model.getObjectByName('Object_2');if(!node?.isMesh)throw new Error('Verified orchid cut mesh Object_2 is missing');
  group.updateMatrixWorld(true);
  const localPoint=new THREE.Vector3(8.94546940815269,-3.063564626594143,-9.694663853503243),cut=node.localToWorld(localPoint.clone());
  const positions=node.geometry.attributes.position,index=node.geometry.index,face=39473;
  const points=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(positions,index?index.getX(face*3+j):face*3+j));
  const normal=new THREE.Vector3().crossVectors(points[1].clone().sub(points[0]),points[2].clone().sub(points[0])).normalize().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(node.matrixWorld));
  // From the gathering point down, the orchid stem lies alongside the rose stem (screen-right and just behind), following its curve to the foot.
  const beside=new THREE.Vector3(.06,0,-.06),gather=stem.at(gatherY).add(beside),end=stem.foot.clone().add(beside);
  const alongside=[1,2,3,4].map(k=>k<4?stem.at(gather.y+(end.y-gather.y)*k/4).add(beside):end);
  const towards=gather.clone().sub(cut).normalize();if(normal.dot(towards)<0)normal.negate();
  const exit=normal.clone().lerp(towards,.65).normalize();
  // One soft arc, bellied slightly outward and back so it passes behind the rose leaves before meeting the rose stem.
  const belly=cut.clone().lerp(gather,.55).add(new THREE.Vector3(.07,0,-.34));
  const worldPoints=[cut.clone().addScaledVector(normal,-.012),cut.clone().addScaledVector(exit,.18),belly,gather,...alongside];
  const curve=new THREE.CatmullRomCurve3(worldPoints.map(p=>group.worldToLocal(p.clone())),false,'centripetal');
  const scale=group.getWorldScale(new THREE.Vector3()).x,radius=[.019/scale,.027/scale];
  const mesh=new THREE.Mesh(taperedTube(curve,96,radius[0],radius[1],8),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.84,metalness:0}));
  mesh.name='original-orchid-branch-extension';mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);group.updateMatrixWorld(true);
  const samples=curve.getPoints(144).map(p=>group.localToWorld(p));let length=0;for(let i=1;i<samples.length;i++)length+=samples[i].distanceTo(samples[i-1]);
  return {mesh,node,localPoint,samples,stem,info:{kind:'original-single-curved-stem',verifiedCut:{mesh:'Object_2',face,local:localPoint.toArray(),world:cut.toArray()},curveStart:worldPoints[0].toArray(),paperEnd:end.toArray(),gatheredAt:gather.toArray(),length,radius:[.019,.027],triangles:mesh.geometry.index.count/3}};
}
function wholeBranchFade(model){
  const uniform={value:0},materials=new Map(),meshes=[];
  model.traverse(mesh=>{if(!mesh.isMesh)return;meshes.push(mesh);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    if(materials.has(material))continue;
    const original=material.onBeforeCompile,key=material.customProgramCacheKey();
    materials.set(material,{transparent:material.transparent,forceSinglePass:material.forceSinglePass,original,key});
    material.customProgramCacheKey=()=>key+'|complete-orchid-short-fade-v3';
    material.onBeforeCompile=(shader,renderer)=>{original.call(material,shader,renderer);shader.uniforms.uWholeBranchOpacity=uniform;
      shader.fragmentShader='uniform float uWholeBranchOpacity;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\ngl_FragColor.a*=uWholeBranchOpacity;');};
    material.needsUpdate=true;
  }});
  return {uniform,update(value){uniform.value=value;model.visible=value>0;const fading=value<1;
    for(const mesh of meshes)mesh.castShadow=!fading;
    for(const [material,base]of materials){const transparent=fading?true:base.transparent;if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}material.forceSinglePass=fading?true:base.forceSinglePass;}
  },dispose(){for(const [material,base]of materials){material.transparent=base.transparent;material.forceSinglePass=base.forceSinglePass;material.onBeforeCompile=base.original;material.customProgramCacheKey=()=>base.key;}}};
}
export function createCompanionPose(group,pivot){
  const pose=new THREE.Group(),parent=group.parent,point=new THREE.Vector3(...pivot);parent.add(pose);pose.add(group);pose.matrixAutoUpdate=false;pose.matrix.identity();
  let info={kind:'whole-branch-rigid-pose-not-orchid-petals',progress:1,pivot:[...pivot],euler:[0,0,0]};
  return {update(progress){const open=ease(.40,.82,progress),angles=[-.17*(1-open),.06*(1-open),-.05*(1-open)];
    if(open===1)pose.matrix.identity();else pose.matrix.makeTranslation(...pivot).multiply(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles)))).multiply(new THREE.Matrix4().makeTranslation(-point.x,-point.y,-point.z));
    pose.matrixWorldNeedsUpdate=true;info={...info,progress:open,euler:angles};
  },getDiagnostics(){return info;}};
}
// A few turns of linen where the two stems are gathered; static with the rose stem, it appears once the flowers have opened.
function buildTie(parent,connector,y){
  const rose=connector.stem.at(y),orchid=connector.samples.reduce((a,b)=>Math.abs(b.y-y)<Math.abs(a.y-y)?b:a);
  const across=new THREE.Vector3(orchid.x-rose.x,0,orchid.z-rose.z),gap=across.length(),centre=rose.clone().lerp(orchid,.5);centre.y=y;
  const material=new THREE.MeshStandardMaterial({color:'#cdbd9c',roughness:.95,metalness:0,transparent:true,opacity:0,depthWrite:false}),tie=new THREE.Group();
  // Each turn hugs both stems: an ellipse around the pair, slightly tilted so the wraps read as hand-tied rather than machined.
  const major=gap/2+.05,minor=.05;
  for(let i=0;i<3;i++){const tilt=(i-1)*.12,loop=new THREE.CatmullRomCurve3(Array.from({length:24},(_,k)=>{const a=k/24*Math.PI*2,x=Math.cos(a)*major;return new THREE.Vector3(x,(i-1)*.022+x*tilt,Math.sin(a)*minor);}),true);
    tie.add(new THREE.Mesh(new THREE.TubeGeometry(loop,48,.011,6,true),material));}
  tie.position.copy(centre);tie.rotation.y=-Math.atan2(across.z,across.x);tie.name='linen-tie';tie.visible=false;parent.add(tie);
  return {tie,update(value){material.opacity=value;tie.visible=value>0;const opaque=value>=1;if(material.transparent===opaque){material.transparent=!opaque;material.depthWrite=opaque;material.needsUpdate=true;}},info:{centre:centre.toArray(),gap}};
}
function overrideMaterials(model,rules){
  if(!rules)return [];
  const flat=OVERRIDE_KEYS.some(key=>Object.hasOwn(rules,key)),records=[],seen=new Set();
  model.traverse(mesh=>{for(const material of mesh.material?(Array.isArray(mesh.material)?mesh.material:[mesh.material]):[]){
    if(seen.has(material))continue;seen.add(material);const selected=flat?rules:{...rules['*'],...rules[material.name]},changes={};
    for(const key of OVERRIDE_KEYS)if(Object.hasOwn(selected,key)){
      const value=key==='side'?({double:THREE.DoubleSide,front:THREE.FrontSide,back:THREE.BackSide}[selected[key]]):selected[key];
      if(value===undefined)throw new Error('Unknown material side override');material[key]=value;changes[key]=selected[key];
    }
    if(Object.keys(changes).length){material.needsUpdate=true;records.push({material:material.name,changes});}
  }});return records;
}
function companionReveal(model,minY,maxY){
  const uniform={value:0},owners=new Set(),depths=[];
  function patch(material){const original=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.customProgramCacheKey=()=>key+'|garden-companion-height-reveal-v1';material.onBeforeCompile=(shader,renderer)=>{
      original.call(material,shader,renderer);shader.uniforms.uCompanionReveal=uniform;shader.uniforms.uCompanionRange={value:new THREE.Vector2(minY,Math.max(.0001,maxY-minY))};
      shader.vertexShader='varying float vCompanionY;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCompanionY=(modelMatrix*vec4(position,1.0)).y;');
      shader.fragmentShader='varying float vCompanionY;uniform float uCompanionReveal;uniform vec2 uCompanionRange;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(uCompanionReveal<.999999&&(uCompanionReveal<=0.0||(vCompanionY-uCompanionRange.x)/uCompanionRange.y>uCompanionReveal))discard;');
    };material.needsUpdate=true;
  }
  model.traverse(mesh=>{if(!mesh.isMesh)return;for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(!owners.has(material)){owners.add(material);patch(material);}
    const material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
    const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:material.side,map:material.map,alphaMap:material.alphaMap,alphaTest:material.alphaTest});patch(depth);mesh.customDepthMaterial=depth;depths.push(depth);
  });return {uniform,dispose(){for(const material of depths)material.dispose();}};
}
function release(scene){const geometries=new Set(),materials=new Set(),textures=new Set(),images=new Set();scene.traverse(object=>{
  if(object.geometry)geometries.add(object.geometry);for(const material of object.material?(Array.isArray(object.material)?object.material:[object.material]):[]){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}object.shadow?.dispose?.();
 });for(const value of textures)if(value.image?.close)images.add(value.image);for(const item of [...geometries,...materials,...textures])item.dispose();for(const image of images)image.close();scene.clear();scene.environment=null;}

export async function createGardenScene(canvas,{catalogURL='./assets/catalog.json',onStatus=()=>{}}={}){
  const status=(state,message,detail)=>{try{onStatus({state,message,kind:'layered-floral',...(detail?{detail}:{})});}catch{}};
  const abort=new AbortController(),instances=[],listeners=[];let renderer,scene,environmentTarget,observer,controller;
  let disposed=false,lost=false,raf=0,progress=0,reduced=false,closeup=0,targetCloseup=0,lastTime=0,renderCount=0,shaderError=null,response=null,lastReact=-Infinity;
  // Turntable: the viewer turns the bouquet about the vertical through its gathered stems; camera and lights stay put.
  let yaw=0,yawVelocity=0,yawTween=null,turning=false;
  status('loading','正在把花枝、叶脉和花瓣准备好…');
  try{
    const catalogPath=localURL(catalogURL,document.baseURI),catalog=await get(catalogPath,'json',abort.signal);
    if(catalog.schema!==1||!Array.isArray(catalog.specimens)||!catalog.specimens.some(s=>s.role==='hero'))throw new Error('Invalid flower catalog');
    renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:false});
    renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.94;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
    scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(35,1,.01,100),room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);
    try{environmentTarget=pmrem.fromScene(room,.04);scene.environment=environmentTarget.texture;scene.environmentIntensity=.55;}finally{room.dispose();pmrem.dispose();}
    scene.add(new THREE.HemisphereLight(0xffffff,0xa0a298,.40));
    const key=new THREE.DirectionalLight(0xfff4e9,2),fill=new THREE.DirectionalLight(0xe7eef1,.55);
    key.position.set(-9,15,12);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.intensity=.35;key.shadow.bias=-.0002;key.shadow.normalBias=.005;key.shadow.radius=5;
    Object.assign(key.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.5,far:60});key.shadow.camera.updateProjectionMatrix();fill.position.set(10,3,6);scene.add(key,key.target,fill,fill.target);
    const turntable=new THREE.Group();turntable.name='turntable';turntable.matrixAutoUpdate=false;scene.add(turntable);
    let hero=null;const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),warnings=[];
    for(const specimen of catalog.specimens.filter(s=>s.enabled!==false&&s.status!=='pending').sort((a,b)=>(a.role==='hero'?-1:0)-(b.role==='hero'?-1:0))){
      try{
        const assetPath=localURL(specimen.file,catalogPath),buffer=await get(assetPath,'buffer',abort.signal);
        let motionConfig=null,mapping=null;
        if(specimen.motionFile){const motionPath=localURL(specimen.motionFile,catalogPath);motionConfig=await get(motionPath,'json',abort.signal);
          // The delivered GLB is a meshopt/WebP derivative; the topology analysis is bound to its untouched original.
          if(await hash(buffer)!==specimen.sha256||(specimen.source?.sha256??specimen.sha256)!==motionConfig.sourceSHA256)throw new Error('Rose model does not match analysed topology');
          mapping=await get(localURL(motionConfig.mapping.file,motionPath),'buffer',abort.signal);if(await hash(mapping)!==motionConfig.mapping.sha256)throw new Error('Rose motion mapping hash mismatch');
        }
        const gltf=await loader.parseAsync(buffer,new URL('./',assetPath).href),model=gltf.scene;turntable.add(model);
        const overrides=overrideMaterials(model,specimen.materialOverrides),rig=motionConfig?attachPetalMotion(model,motionConfig,mapping):null;
        if(specimen.role==='hero'&&!rig)throw new Error('Hero requires the verified petal-motion sidecar');
        model.updateMatrixWorld(true);let anchor=specimen.role==='hero'?boxForMaterial(model,'m_petal'):new THREE.Box3().setFromObject(model,true);
        if(anchor.isEmpty())throw new Error('Flower specimen has no usable anchor');
        const center=anchor.getCenter(new THREE.Vector3()),size=anchor.getSize(new THREE.Vector3()),scale=(specimen.role==='hero'?2.6:2.25)/Math.max(size.x,size.y,size.z);
        model.position.sub(center).multiplyScalar(scale);model.scale.multiplyScalar(scale);
        const group=new THREE.Group();group.name='specimen-'+specimen.id;group.add(model);turntable.add(group);
        if(specimen.role==='hero'){group.position.set(-.48,-.12,.25);group.rotation.z=.12;hero={group,model,rig};}
        // Companion rises against the rose's right shoulder and slightly behind it, so the pair reads as one bouquet from every turn.
        else{group.position.set(.90,.95,-.70);group.rotation.set(-.05,.35,-.15);}
        if(specimen.position)group.position.fromArray(specimen.position);if(specimen.rotation)group.rotation.fromArray(specimen.rotation);
        group.updateMatrixWorld(true);model.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});
        const bounds=new THREE.Box3().setFromObject(model,true),revealer=rig?null:wholeBranchFade(model);
        let connector=null,connectorRevealer=null,wholePose=null;
        if(specimen.id==='orchid'){
          const stem=heroStem(hero.model),crown=boxForMaterial(hero.model,'m_petal');if(!stem)throw new Error('Hero stem is missing');
          // Matches the framing anchor below: the bottom edge of the portrait sits at crown.min.y-crownHeight*.88.
          connector=buildOrchidConnector(group,model,stem,crown.min.y-(crown.max.y-crown.min.y)*.62);
          const branchBounds=new THREE.Box3().setFromObject(connector.mesh,true);connectorRevealer=companionReveal(connector.mesh,branchBounds.min.y,branchBounds.max.y);
          wholePose=createCompanionPose(group,connector.info.paperEnd);
          const height=crown.max.y-crown.min.y;connector.tie=buildTie(turntable,connector,crown.min.y-height*.80);
        }
        instances.push({id:specimen.id,role:specimen.role,model,group,rig,revealer,connector,connectorRevealer,wholePose,bounds,overrides,sourceSHA256:motionConfig?.sourceSHA256??null});
      }catch(error){if(specimen.role==='hero')throw error;warnings.push(specimen.id+': '+error.message);}
    }
    if(!hero)throw new Error('No active hero specimen');
    scene.updateMatrixWorld(true);
    const crown=boxForMaterial(hero.model,'m_petal'),anchor=crown.clone(),crownSize=crown.getSize(new THREE.Vector3());
    anchor.min.y-=crownSize.y*.88;for(const instance of instances)if(instance.role!=='hero')anchor.union(instance.bounds);
    // Close-up centres on every bloom, so the companion stays on the paper instead of spilling past its edge.
    const blooms=crown.clone();for(const instance of instances)if(instance.role!=='hero')blooms.union(instance.bounds);
    const axis=new THREE.Vector3(...(instances.find(i=>i.connector)?.connector.info.gatheredAt??crown.getCenter(new THREE.Vector3()).toArray()));
    const fullBounds=new THREE.Box3().setFromObject(scene,true),responseValues=new Float32Array(28);let width=0,height=0,dpr=0,framing=null;
    const raycaster=new THREE.Raycaster(),heroMeshes=hero.rig.bindings.map(binding=>binding.mesh);let candidateCache={key:null,items:[]};
    function hitHero(x,y){raycaster.setFromCamera(new THREE.Vector2(2*x-1,1-2*y),camera);const hit=raycaster.intersectObjects(heroMeshes,false)[0];if(!hit?.face)return null;
      const id=hit.object.geometry.attributes.aGardenPart.getX(hit.face.a);return id>0&&hero.rig.parts[id].responseAngle>0?id:null;}
    function reactCandidates(){
      if(disposed||!renderCount)return [];
      const raw=hero.rig.targets(camera);if(progress!==1||response||raf)return raw.map(t=>({...t,hittable:false}));
      const key=camera.matrixWorld.elements.join(',')+'|'+camera.projectionMatrix.elements.join(',')+'|'+yaw;
      if(candidateCache.key!==key)candidateCache={key,items:raw.map(t=>({...t,hittable:t.x>=0&&t.x<=1&&t.y>=0&&t.y<=1&&hitHero(t.x,t.y)===t.id})).sort((a,b)=>Number(b.hittable)-Number(a.hittable))};
      return candidateCache.items;
    }
    const listen=(object,name,handler)=>{object.addEventListener(name,handler);listeners.push(()=>object.removeEventListener(name,handler));};
    const requestFrame=()=>{if(!disposed&&!lost&&!document.hidden&&!raf)raf=requestAnimationFrame(draw);};
    function draw(now){
      raf=0;if(disposed||lost||document.hidden)return;
      const dt=lastTime?Math.min(.05,(now-lastTime)/1000):.016;lastTime=now;
      closeup=reduced?targetCloseup:closeup+(targetCloseup-closeup)*(1-Math.exp(-dt*9));if(Math.abs(closeup-targetCloseup)<.001)closeup=targetCloseup;
      // Stepped turns run on wall-clock time, so they land on schedule even when frames are slow.
      if(yawTween){if(yawTween.start===null)yawTween.start=now;const t=reduced?1:Math.min(1,(now-yawTween.start)/450),k=t*t*(3-2*t);yaw=yawTween.from+(yawTween.to-yawTween.from)*k;if(t===1)yawTween=null;}
      else if(!turning&&yawVelocity){yaw+=yawVelocity*dt;yawVelocity*=Math.exp(-dt*3.4);if(Math.abs(yawVelocity)<.03)yawVelocity=0;}
      if(!turning&&!yawVelocity&&!yawTween)yaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));
      turntable.matrix.makeTranslation(axis.x,0,axis.z).multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().makeTranslation(-axis.x,0,-axis.z));turntable.matrixWorldNeedsUpdate=true;
      responseValues.fill(0);let responding=false;
      if(response&&!reduced){if(response.start===null)response.start=now;const age=(now-response.start)/900;
        if(age>=1)response=null;else{const amplitude=Math.sin(age*Math.PI*2)*Math.exp(-3*age);for(const target of response.targets)responseValues[target.id]=amplitude*target.weight;responding=true;}
      }
      for(const instance of instances){
        if(instance.rig)instance.rig.update(reduced?1:progress,responding?responseValues:null);
        else{instance.revealer.update(reduced?1:ease(.41,.45,progress));instance.wholePose?.update(reduced?1:progress);}
        if(instance.connectorRevealer)instance.connectorRevealer.uniform.value=reduced?1:ease(.12,.40,progress);
        instance.connector?.tie.update(reduced?1:ease(.84,.97,progress));
      }
      const rect=canvas.getBoundingClientRect(),w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height)),ratio=Math.min(1.8,window.devicePixelRatio||1);
      if(w!==width||h!==height||ratio!==dpr){renderer.setPixelRatio(ratio);renderer.setSize(w,h,false);width=w;height=h;dpr=ratio;}
      camera.aspect=w/h;const azimuth=THREE.MathUtils.degToRad(25),elevation=THREE.MathUtils.degToRad(30+12*(1-ease(.05,.30,reduced?1:progress)));
      const direction=new THREE.Vector3(Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation));
      const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right).normalize();
      const baseCenter=anchor.getCenter(new THREE.Vector3()),target=baseCenter.clone().lerp(blooms.getCenter(new THREE.Vector3()),closeup*.68);
      const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));let distance=0;
      for(const x of [anchor.min.x,anchor.max.x])for(const y of [anchor.min.y,anchor.max.y])for(const z of [anchor.min.z,anchor.max.z]){
        const point=new THREE.Vector3(x,y,z).sub(baseCenter),depth=point.dot(direction);distance=Math.max(distance,depth+Math.abs(point.dot(up))/tan,depth+Math.abs(point.dot(right))/(tan*camera.aspect));
      }
      distance*=(camera.aspect<1?1.12:1.08)*.91*(1-closeup*.19);camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);
      camera.near=Math.max(.01,distance/1000);camera.far=distance+fullBounds.getSize(new THREE.Vector3()).length()*3;camera.updateProjectionMatrix();
      framing={azimuth:25,elevation:THREE.MathUtils.radToDeg(elevation),target:target.toArray(),distance,portrait:camera.aspect<1?'mobile':'desktop'};
      try{renderer.render(scene,camera);}catch(error){lost=true;status('error','花景暂时无法绘制，信仍可以读。',error.message);return;}
      if(lost)return;renderCount++;canvas.dataset.rendered='true';canvas.dataset.progress=String(progress);
      if(responding||closeup!==targetCloseup||yawVelocity||yawTween)requestFrame();else lastTime=0;
    }
    renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{shaderError=[gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n');lost=true;cancelAnimationFrame(raf);raf=0;status('error','花景材质未能绘制，信仍可以读。',shaderError);};
    listen(canvas,'webglcontextlost',event=>{event.preventDefault();lost=true;cancelAnimationFrame(raf);raf=0;status('error','绘图已中断，信仍可以读。');});
    listen(document,'visibilitychange',()=>{cancelAnimationFrame(raf);raf=0;lastTime=0;response=null;if(!document.hidden)requestFrame();});listen(window,'resize',requestFrame);
    observer=new ResizeObserver(requestFrame);observer.observe(canvas);
    controller={
      setProgress(value){if(disposed||lost)return;progress=reduced?1:clamp(value);if(progress<.92)response=null;requestFrame();},
      setCloseup(value){if(disposed||lost)return;targetCloseup=value?1:0;requestFrame();},
      setReducedMotion(value){if(disposed||lost)return;reduced=!!value;if(reduced){progress=1;closeup=targetCloseup;response=null;}requestFrame();},
      react({x,y}){if(disposed||lost||reduced||progress!==1||response||renderCount===0||turning||yawVelocity||yawTween)return false;const now=performance.now();if(now-lastReact<100)return false;
        const id=hitHero(clamp(x),clamp(y));if(id===null)return false;lastReact=now;
        response={start:null,targets:[{id,weight:1}]};requestFrame();return true;
      },
      // Drag: turn(delta) while the pointer moves, release(velocity in rad/s) to coast; reduced motion never coasts.
      turn(delta){if(disposed||lost||!Number.isFinite(delta))return;turning=true;yawTween=null;yawVelocity=0;yaw+=delta;response=null;requestFrame();},
      release(velocity=0){if(disposed||lost)return;turning=false;yawVelocity=reduced||!Number.isFinite(velocity)?0:Math.max(-7,Math.min(7,velocity));requestFrame();},
      // Keyboard / button steps ease to the new angle instead of jumping.
      turnBy(delta){if(disposed||lost||!Number.isFinite(delta))return;turning=false;yawVelocity=0;yawTween={from:yaw,to:(yawTween?.to??yaw)+delta,start:null};response=null;requestFrame();},
      resetTurn(){if(disposed||lost)return;turning=false;yawVelocity=0;yawTween={from:yaw,to:Math.round(yaw/(Math.PI*2))*Math.PI*2,start:null};requestFrame();},
      requestFrame,
      getDiagnostics(){return {engine:'three-webgl2',kind:'layered-floral',turntable:{yaw,velocity:yawVelocity,turning,easing:!!yawTween,axis:axis.toArray()},progress,reducedMotion:reduced,closeup,targetCloseup,renderCount,rendered:renderCount>0&&!lost,
        disposed,lost,shaderError,pendingFrame:!!raf,reacting:!!response,reactTargetIds:response?.targets.map(t=>t.id)??[],reactPicking:'original mature hero triangle raycast; no reentry during response',
        reactCandidates:reactCandidates(),
        dpr,size:{width,height},framing,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,stemMode:'rest-height reveal, not growth',
        specimens:instances.map(i=>({id:i.id,role:i.role,sourceSHA256:i.sourceSHA256,materialOverrides:i.overrides,
          connector:i.connector?{...i.connector.info,tie:i.connector.tie.info,currentCutWorld:!disposed?i.connector.node.localToWorld(i.connector.localPoint.clone()).toArray():null}:null,
          motion:i.rig?.getDiagnostics()??{...i.wholePose?.getDiagnostics(),opacity:i.revealer.uniform.value,completeFlowers:true,heightDiscard:false}})),warnings};},
      dispose(){if(disposed)return;disposed=true;abort.abort();cancelAnimationFrame(raf);raf=0;observer.disconnect();for(const remove of listeners)remove();
        for(const instance of instances){instance.rig?.dispose();instance.revealer?.dispose();instance.connectorRevealer?.dispose();}release(scene);for(const instance of instances){instance.group.clear();instance.model.clear();}
        environmentTarget.dispose();renderer.dispose();if(canvas.__gardenScene===controller)delete canvas.__gardenScene;status('disposed','花景已收好。');},
    };
    canvas.__gardenScene=controller;requestFrame();status('ready','花枝与花瓣已准备好。',warnings.length?warnings:undefined);return controller;
  }catch(error){abort.abort();observer?.disconnect();for(const remove of listeners)remove();for(const instance of instances){instance.rig?.dispose();instance.revealer?.dispose();instance.connectorRevealer?.dispose();}if(scene)release(scene);environmentTarget?.dispose();renderer?.dispose();status('error','暂时无法准备花景，信仍可以读。',error.message);throw error;}
}
export default createGardenScene;
