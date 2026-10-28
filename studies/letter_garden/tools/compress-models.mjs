// Offline preparation, not part of the site build: derive the web GLBs from the untouched originals in source-models/.
// Geometry is meshopt-encoded without quantization or reordering, so every vertex attribute (and the rose petal mapping
// bound to vertex order) decodes byte-identical and triangles keep their order; only textures are lossy (WebP, small parts downsized).
// Usage (from this folder): npm ci && node compress-models.mjs
// Decision: .agents/notes/implemented/letter-garden/2026-10-28-compression-and-turntable.md
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression,EXTTextureWebP} from '@gltf-transform/extensions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const study=new URL('../',import.meta.url);
const path=(name)=>fileURLToPath(new URL(name,study));
// Longest texture edge per material: thorns and stem stay a few pixels wide on screen.
const MODELS=[
  {source:'source-models/rose-heliona.glb',output:'assets/rose-heliona-web.glb',size:{m_petal:1024,m_leafs:1024,m_stem:512,m_thorns:256}},
  {source:'source-models/orchid-rigsters.glb',output:'assets/orchid-rigsters-web.glb',size:{defaultMat:1024}},
];
// Normal maps keep full chroma; colour and ORM tolerate the usual 4:2:0.
const SLOT_QUALITY={normalTexture:{quality:92,smartSubsample:true},baseColorTexture:{quality:88},default:{quality:86}};

await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const sha=(bytes)=>createHash('sha256').update(bytes).digest('hex');

function accessorBytes(document){
  return document.getRoot().listMeshes().flatMap(mesh=>mesh.listPrimitives().flatMap(primitive=>
    [...primitive.listSemantics().map(name=>[name,primitive.getAttribute(name)]),['INDICES',primitive.getIndices()]].map(([name,accessor])=>
      ({key:`${mesh.getName()}/${name}`,array:Buffer.from(accessor.getArray().buffer,accessor.getArray().byteOffset,accessor.getArray().byteLength)}))));
}

// meshopt's triangle codec may start a triangle from another of its corners (a,b,c -> b,c,a). Order and winding are kept,
// and each triangle stays inside one petal shell, so the vertex-bound mapping and face normals are unaffected.
function triangleRotations(before,after){
  const a=new Uint32Array(before.array.buffer,before.array.byteOffset,before.array.byteLength/4),b=new Uint32Array(after.array.buffer,after.array.byteOffset,after.array.byteLength/4);
  if(before.array.byteLength!==after.array.byteLength)throw new Error('Index type changed: '+before.key);
  let count=0;
  for(let t=0;t<a.length;t+=3){if(a[t]===b[t]&&a[t+1]===b[t+1]&&a[t+2]===b[t+2])continue;
    if(!(a[t]===b[t+2]&&a[t+1]===b[t]&&a[t+2]===b[t+1])&&!(a[t]===b[t+1]&&a[t+1]===b[t+2]&&a[t+2]===b[t]))throw new Error('Triangle changed beyond rotation: '+before.key);count++;}
  return count;
}

for(const model of MODELS){
  const original=await readFile(path(model.source)),document=await io.readBinary(new Uint8Array(original)),before=accessorBytes(document);
  for(const material of document.getRoot().listMaterials()){
    const edge=model.size[material.getName()];if(!edge)throw new Error('No texture size for material '+material.getName());
    for(const slot of ['baseColorTexture','metallicRoughnessTexture','normalTexture','occlusionTexture','emissiveTexture']){
      const texture=material['get'+slot[0].toUpperCase()+slot.slice(1)]?.();if(!texture||texture.getMimeType()==='image/webp')continue;
      const options=SLOT_QUALITY[slot]??SLOT_QUALITY.default;
      const image=await sharp(texture.getImage()).resize(edge,edge,{fit:'inside',withoutEnlargement:true}).webp({...options,alphaQuality:100,effort:6}).toBuffer();
      texture.setImage(new Uint8Array(image)).setMimeType('image/webp').setURI(texture.getURI().replace(/\.\w+$/,'.webp'));
    }
  }
  // Textures no material references any more (the orchid's transmission map once transmission is overridden off) stay as-is.
  for(const texture of document.getRoot().listTextures())if(texture.getMimeType()!=='image/webp'&&texture.getImage().byteLength>64*1024)
    throw new Error('Large texture left uncompressed in '+model.source);
  document.createExtension(EXTTextureWebP).setRequired(true);
  document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
  const output=await io.writeBinary(document);
  const after=accessorBytes(await io.readBinary(output));
  if(after.length!==before.length)throw new Error('Accessor count changed');
  let rotated=0;
  for(let i=0;i<before.length;i++){
    if(before[i].key!==after[i].key)throw new Error('Accessor order changed');
    if(before[i].array.equals(after[i].array))continue;
    if(!before[i].key.endsWith('/INDICES'))throw new Error('Geometry is not lossless: '+before[i].key);
    rotated+=triangleRotations(before[i],after[i]);
  }
  await writeFile(path(model.output),output);
  console.log(JSON.stringify({output:model.output,sourceSHA256:sha(original),sha256:sha(output),bytes:output.byteLength,sourceBytes:original.byteLength,losslessAccessors:before.length,rotatedTriangles:rotated}));
}
