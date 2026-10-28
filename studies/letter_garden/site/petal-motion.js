// Decision: .agents/notes/proposed/letter-garden/2026-10-26-layered-floral-choreography.md
import * as THREE from 'three';
export const PART_COUNT=28;
const clamp=x=>Math.max(0,Math.min(1,x));
export const ease=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const v3=a=>new THREE.Vector3(...a);

// F(p)=pivot+R(axis,theta*w)(p-pivot). The gradient term is part of
// J=R+[axis x Rq] outer(theta*grad(w)), not merely a blended normal.
export function sampleDeformation(point,normal,tangent,part,theta){
  if(theta===0)return {position:[...point],normal:normal&&[...normal],tangent:tangent&&[...tangent]};
  const pivot=v3(part.pivot),axis=v3(part.axis).normalize(),direction=v3(part.direction).normalize(),q=v3(point).sub(pivot);
  const t=clamp((q.dot(direction)-part.weightStart)/part.weightLength),rigid=part.kind==='petal',w=rigid?1:t*t*(3-2*t);
  const rotation=new THREE.Quaternion().setFromAxisAngle(axis,theta*w),rotated=q.clone().applyQuaternion(rotation);
  const gradient=direction.multiplyScalar(rigid?0:theta*6*t*(1-t)/part.weightLength),a=new THREE.Vector3().crossVectors(axis,q);
  const denominator=1+gradient.dot(a);
  const n=normal?v3(normal).addScaledVector(gradient,-a.dot(v3(normal))/denominator).applyQuaternion(rotation).normalize():null;
  const u=new THREE.Vector3().crossVectors(axis,rotated);
  const tangentOut=tangent?v3(tangent).applyQuaternion(rotation).addScaledVector(u,gradient.dot(v3(tangent))).normalize():null;
  return {position:rotated.add(pivot).toArray(),normal:n?.toArray(),tangent:tangentOut?.toArray(),denominator};
}

const VERTEX_SUPPORT=`
attribute float aGardenPart;
uniform float uLGRest;
uniform vec4 uLGAxis[28];
uniform vec4 uLGPivot[28];
uniform vec4 uLGField[28];
uniform vec4 uLGShape[28];
varying float vLGReveal;
varying float vLGAlong;
bool lgActive;
vec3 lgAxis,lgQ,lgRotated,lgPivot,lgGradient,lgCross;
float lgSin,lgCos,lgDenominator;
vec3 lgRotate(vec3 value){return value*lgCos+cross(lgAxis,value)*lgSin+lgAxis*dot(lgAxis,value)*(1.0-lgCos);}
void lgInit(vec3 point){
  int id=int(aGardenPart+.5);
  vec4 shape=uLGShape[id];vLGReveal=shape.z;vLGAlong=(point.z-shape.x)*shape.y;
  lgActive=false;
  if(uLGRest>.5||id==0)return;
  float theta=uLGAxis[id].w;if(abs(theta)<.0000001)return;
  lgAxis=uLGAxis[id].xyz;lgPivot=uLGPivot[id].xyz;lgQ=point-lgPivot;
  vec4 field=uLGField[id];
  float t=clamp((dot(lgQ,field.xyz)-uLGPivot[id].w)/field.w,0.0,1.0);
  bool rigid=shape.w>.5;
  float weight=rigid?1.0:t*t*(3.0-2.0*t),angle=theta*weight;
  lgSin=sin(angle);lgCos=cos(angle);lgRotated=lgRotate(lgQ);
  lgGradient=rigid?vec3(0.0):field.xyz*(theta*6.0*t*(1.0-t)/field.w);
  lgCross=cross(lgAxis,lgQ);lgDenominator=1.0+dot(lgGradient,lgCross);
  lgActive=true;
}
vec3 lgNormal(vec3 value){return normalize(lgRotate(value-lgGradient*(dot(lgCross,value)/lgDenominator)));}
vec3 lgTangent(vec3 value){return normalize(lgRotate(value)+cross(lgAxis,lgRotated)*dot(lgGradient,value));}
`;
const FRAGMENT_SUPPORT='uniform float uLGRest;\nvarying float vLGReveal;\nvarying float vLGAlong;\n';
function patchMaterial(material,uniforms,depth=false){
  const original=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.customProgramCacheKey=()=>key+'|letter-garden-root-jacobian-v1'+(depth?'|depth':'');
  material.onBeforeCompile=(shader,renderer)=>{
    original.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);
    for(const marker of ['#include <common>','void main() {','#include <begin_vertex>'])if(!shader.vertexShader.includes(marker))throw new Error('Unsupported Three vertex chunk: '+marker);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+VERTEX_SUPPORT)
      .replace('void main() {','void main() {\nlgInit(position);')
      .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        if(lgActive){objectNormal=lgNormal(objectNormal);
          #ifdef USE_TANGENT
            objectTangent=lgTangent(objectTangent);
          #endif
        }`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        if(lgActive){transformed=lgPivot+lgRotated;
          #ifdef USE_ALPHAHASH
            vPosition=transformed;
          #endif
        }`);
    shader.fragmentShader=FRAGMENT_SUPPORT+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
      if(uLGRest<.5&&(vLGReveal<=0.0||(vLGReveal<.999999&&vLGAlong>vLGReveal)))discard;`);
  };
  material.needsUpdate=true;
}

export function attachPetalMotion(model,config,mappingBuffer){
  if(config.schema!==1||config.parts?.length!==PART_COUNT||mappingBuffer.byteLength!==config.mapping.bytes)throw new Error('Invalid rose motion sidecar');
  const parts=config.parts.map(part=>({...part,axis:v3(part.axis).normalize().toArray(),direction:v3(part.direction).normalize().toArray()}));
  const uniforms={uLGRest:{value:1},uLGAxis:{value:parts.map(p=>new THREE.Vector4(...p.axis,0))},
    uLGPivot:{value:parts.map(p=>new THREE.Vector4(...p.pivot,p.weightStart))},
    uLGField:{value:parts.map(p=>new THREE.Vector4(...p.direction,p.weightLength))},
    uLGShape:{value:parts.map(p=>new THREE.Vector4(p.minZ,1/p.height,1,p.kind==='petal'?1:0))}};
  const bindings=[],depthMaterials=[],maxCoefficients=new Float64Array(PART_COUNT),counts=new Uint32Array(PART_COUNT),owners=new Set();
  let progress=1,activeResponse=false;
  model.updateMatrixWorld(true);let basis=null;
  model.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const material=mesh.material;if(Array.isArray(material))throw new Error('Motion source requires one material per primitive');
    const spec=config.meshes[material.name];if(!spec)return;
    const geometry=mesh.geometry,position=geometry.attributes.position;
    if(position.count!==spec.vertexCount)throw new Error('Motion vertex count mismatch: '+material.name);
    if(basis&&!basis.equals(mesh.matrixWorld))throw new Error('Motion primitives do not share the analysed local frame');
    basis??=mesh.matrixWorld.clone();
    const ids=new Uint8Array(mappingBuffer,spec.byteOffset,spec.vertexCount),q=new THREE.Vector3(),cross=new THREE.Vector3();
    for(let i=0;i<position.count;i++){
      const id=ids[i];if(id>=PART_COUNT)throw new Error('Invalid component ID');counts[id]++;
      if(!id||parts[id].kind==='petal')continue;
      const part=parts[id],axis=v3(part.axis),direction=v3(part.direction);
      q.fromBufferAttribute(position,i).sub(v3(part.pivot));
      const t=clamp((q.dot(direction)-part.weightStart)/part.weightLength);
      cross.crossVectors(axis,q);const coefficient=Math.abs(direction.dot(cross)*6*t*(1-t)/part.weightLength);
      maxCoefficients[id]=Math.max(maxCoefficients[id],coefficient);
    }
    const source={position,normal:geometry.attributes.normal,tangent:geometry.attributes.tangent,uv:geometry.attributes.uv,index:geometry.index};
    geometry.setAttribute('aGardenPart',new THREE.BufferAttribute(ids,1,false));
    bindings.push({mesh,geometry,source,oldFrustum:mesh.frustumCulled,oldDepth:mesh.customDepthMaterial});
    mesh.frustumCulled=false;
    if(!owners.has(material)){owners.add(material);patchMaterial(material,uniforms);}
    const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:material.side,map:material.map,alphaMap:material.alphaMap,alphaTest:material.alphaTest});
    patchMaterial(depth,uniforms,true);mesh.customDepthMaterial=depth;depthMaterials.push(depth);
  });
  for(const [name,spec]of Object.entries(config.meshes))if(!bindings.some(b=>b.mesh.material.name===name))throw new Error('Missing motion mesh '+name);
  // Petals are whole rigid shells: J=R, so no weighted-field limit applies.
  // Only the two linked branch groups need the rank-one Jacobian bound.
  const petalRank=new Map(parts.filter(p=>p.kind==='petal').sort((a,b)=>a.start-b.start).map((p,i)=>[p.id,i]));
  for(let id=1;id<PART_COUNT;id++){
    const part=parts[id],k=maxCoefficients[id];
    if(part.kind==='petal'){
      const rank=petalRank.get(id),degrees=rank<8?38-6*rank/7:rank<16?20-5*(rank-8)/7:0;
      part.actualClosedAngle=-THREE.MathUtils.degToRad(degrees);
      part.responseAngle=degrees?.075:0;
    }else{
      part.actualClosedAngle=Math.sign(part.closedAngle)*Math.min(Math.abs(part.closedAngle),k>1e-8?.40/k:1.0);
      part.responseAngle=Math.min(.06,k>1e-8?.25/k:1.0);
    }
  }
  function update(p,response=null){
    progress=clamp(p);activeResponse=false;
    for(let id=0;id<PART_COUNT;id++){
      const part=parts[id],rest=1-ease(part.start,part.end,progress);
      const impulse=response?.[id]??0;activeResponse||=Math.abs(impulse)>1e-7;
      uniforms.uLGAxis.value[id].w=id?(part.actualClosedAngle*rest+part.responseAngle*impulse):0;
      let reveal;
      if(progress===1)reveal=1;
      else if(part.kind==='petal')reveal=ease(.27,.35,progress);
      else if(part.kind==='branch')reveal=ease(.18,.43,progress);
      else reveal=ease(.12,.40,progress);
      uniforms.uLGShape.value[id].z=reveal;
    }
    uniforms.uLGRest.value=progress===1&&!activeResponse?1:0;
  }
  const surfaceSamples=new Map();
  for(const binding of bindings){
    const {geometry,mesh}=binding,position=geometry.attributes.position,index=geometry.index,ids=geometry.attributes.aGardenPart;
    const point=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    for(let t=0;t<index.count;t+=3){
      const ia=index.getX(t),id=ids.getX(ia),part=parts[id];
      if(!id||mesh.material.name!==(part.kind==='petal'?'m_petal':'m_leafs'))continue;
      point.copy(a.fromBufferAttribute(position,ia)).add(b.fromBufferAttribute(position,index.getX(t+1))).add(c.fromBufferAttribute(position,index.getX(t+2))).multiplyScalar(1/3);
      const score=point.distanceToSquared(v3(part.pick)),old=surfaceSamples.get(id);
      if(!old||score<old.score)surfaceSamples.set(id,{mesh,point:point.clone(),score});
    }
  }
  function targets(camera){return parts.slice(1).filter(part=>part.responseAngle>0).map(part=>{
    const sample=surfaceSamples.get(part.id),binding=bindings.find(b=>b.mesh.material.name===(part.kind==='petal'?'m_petal':'m_leafs'));
    const point=(sample?.point.clone()??v3(part.pick)).applyMatrix4((sample?.mesh??binding.mesh).matrixWorld).project(camera);
    return {id:part.id,x:(point.x+1)/2,y:(1-point.y)/2,kind:part.kind,surface:!!sample};
  });}
  update(1);
  return {parts,uniforms,bindings,update,targets,
    getDiagnostics(){return {petals:25,animatedPetals:parts.filter(p=>p.kind==='petal'&&p.actualClosedAngle!==0).length,preservedCorePetals:parts.filter(p=>p.kind==='petal'&&p.actualClosedAngle===0).length,
      movingPetals:parts.filter(p=>p.kind==='petal'&&Math.abs(uniforms.uLGAxis.value[p.id].w)>1e-7).length,largeLeaves:5,branches:2,smallShells:2,progress,restBypass:uniforms.uLGRest.value===1,
      activeResponse,attribute:'aGardenPart',deformation:'rigid whole-shell petals; weighted linked branches with inverse-transpose Jacobian normals',
      depthSynchronized:true,meshSubmissions:bindings.length,sourceAttributesUnchanged:bindings.every(b=>Object.entries(b.source).every(([key,value])=>key==='index'?b.geometry.index===value:b.geometry.attributes[key]===value)),
      counts:Array.from(counts),angles:uniforms.uLGAxis.value.map(v=>v.w),reveal:uniforms.uLGShape.value.map(v=>v.z),
      closedAngles:parts.map(p=>p.actualClosedAngle??0),minimumJacobianBound:.60,attachmentSemantics:'geometric branch groups, not authored bones'};},
    dispose(){for(const binding of bindings){binding.geometry.deleteAttribute('aGardenPart');binding.mesh.frustumCulled=binding.oldFrustum;binding.mesh.customDepthMaterial=binding.oldDepth;}for(const material of depthMaterials)material.dispose();},
  };
}
