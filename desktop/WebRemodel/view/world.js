import {Engine} from '@babylonjs/core/Engines/engine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {Color3,Color4} from '@babylonjs/core/Maths/math.color.js';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight.js';
import {DirectionalLight} from '@babylonjs/core/Lights/directionalLight.js';
import {ImportMeshAsync} from '@babylonjs/core/Loading/sceneLoader.js';
import '@babylonjs/core/Animations/animatable.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_mesh_quantization.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_texture_transform.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_specular.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_emissive_strength.js';

const toGltf=([x,y,z])=>new Vector3(x,z,-y);
export async function openWorld(canvas, start, progress) {
  let engine;
  try { engine=new Engine(canvas,true,{stencil:true,powerPreference:'high-performance'}); }
  catch(cause){throw Object.assign(new Error('WebGL initialization failed',{cause}),{code:'WEBGL'});}
  try {
    const scene=new Scene(engine); scene.useRightHandedSystem=true;
    scene.clearColor=new Color4(.68,.83,.94,1); scene.skipPointerMovePicking=true;
    const sky=new HemisphericLight('Bay skylight',Vector3.Up(),scene);
    sky.diffuse=new Color3(.95,.98,1); sky.groundColor=new Color3(.42,.46,.37); sky.intensity=1.25;
    const sun=new DirectionalLight('Afternoon',new Vector3(.52,-.76,-.53),scene);
    sun.diffuse=new Color3(1,.93,.83); sun.intensity=2.2;
    const camera=new ArcRotateCamera('At the garden',0,1,10,Vector3.Zero(),scene);
    camera.maxZ=2200;camera.minZ=.03;camera.lowerBetaLimit=.07;camera.upperBetaLimit=Math.PI*.54;
    camera.panningSensibility=0;camera.wheelDeltaPercentage=.012;camera.pinchDeltaPercentage=.012;camera.inertia=.68;
    camera.attachControl(canvas,false);
    let spot;
    const setPlace=p=>{
      spot=p;camera.inertialAlphaOffset=camera.inertialBetaOffset=camera.inertialRadiusOffset=0;
      camera.lowerRadiusLimit=null;camera.upperRadiusLimit=null;
      camera.setTarget(toGltf(p.target));camera.setPosition(toGltf(p.eye));
      // A balanced vertical crop in portrait avoids pulling the camera into trees or interior walls.
      camera.fov=2*Math.atan((canvas.clientWidth<canvas.clientHeight?33:24)/(2*p.lens));
      camera.lowerRadiusLimit=Math.max(.2,camera.radius*.15);camera.upperRadiusLimit=Math.min(280,camera.radius*3.5);
      camera.getViewMatrix(true);
    };
    setPlace(start);
    const imported=await ImportMeshAsync('./island.glb',scene,{onProgress:progress});
    if(!imported.meshes.some(m=>m.getTotalVertices()>0)) throw Error('Empty island');
    for(const g of imported.animationGroups){if(matchMedia('(prefers-reduced-motion: reduce)').matches) g.stop(); else g.start(true);}
    await scene.whenReadyAsync();engine.resize();scene.render();
    const render=()=>scene.render(); const resize=new ResizeObserver(()=>engine.resize());resize.observe(canvas);
    return {setPlace, resume(){engine.resize();engine.runRenderLoop(render)},pause(){engine.stopRenderLoop(render)},dispose(){resize.disconnect();engine.dispose()},
      control(action){switch(action){case 'left':camera.alpha-=.14;break;case 'right':camera.alpha+=.14;break;case 'in':camera.radius=Math.max(camera.lowerRadiusLimit,camera.radius*.82);break;case 'out':camera.radius=Math.min(camera.upperRadiusLimit,camera.radius/.82);break;case 'reset':setPlace(spot);}}
    };
  } catch(error){engine.dispose();throw error;}
}
