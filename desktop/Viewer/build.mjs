import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const [art = path.join(here, '../Art'), output = path.join(here, '看景.html')] = process.argv.slice(2);
if (process.argv.length > 4) throw Error('Usage: node build.mjs [art-directory [output.html]]');
const [glb, layoutText, template, license] = await Promise.all([
  readFile(path.join(art, 'WaterCourt.glb')), readFile(path.join(art, 'layout.json'), 'utf8'),
  readFile(path.join(here, 'page.html'), 'utf8'),
  readFile(path.join(here, '../../node_modules/@babylonjs/core/license.md'), 'utf8')
]);
const pivot = JSON.parse(layoutText).swingPivotMeters;
if (!Array.isArray(pivot) || pivot.length !== 3 || !pivot.every(Number.isFinite)) {
  throw Error('layout.json: swingPivotMeters must be three finite Blender coordinates in metres');
}
if (glb.length < 20 || glb.toString('ascii', 0, 4) !== 'glTF' || glb.readUInt32LE(4) !== 2 ||
    glb.readUInt32LE(8) !== glb.length || glb.toString('ascii', 16, 20) !== 'JSON') throw Error('Invalid glTF 2 GLB header');
const doc = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
for (const obj of [...doc.buffers, ...(doc.images || [])]) {
  if (obj.uri && !obj.uri.startsWith('data:')) throw Error('External subresource in GLB: ' + obj.uri);
}
for (const name of ['CourtShell','CourtPlanting','CourtSwing','CalZero','CalEast','CalNorth']) {
  const matching = doc.nodes.filter(n => n.name === name && doc.meshes[n.mesh]?.primitives.length);
  if (matching.length !== 1) throw Error('Expected exactly one named mesh node: ' + name);
}
const planting = doc.meshes[doc.nodes.find(n => n.name === 'CourtPlanting').mesh];
const materialNames = planting.primitives.map(p=>doc.materials[p.material]?.name || '');
for(const prefix of ['IB_WindGrass_','IB_WindStem_','IB_RoseOuter','IB_RoseMiddle','IB_RoseInner']) {
  if(!materialNames.some(n=>n.startsWith(prefix))) throw Error('Rebuild WaterCourt.glb: missing CourtPlanting material ' + prefix);
}
const packed = gzipSync(glb, { level: 9 }).toString('base64');
const bundle = await build({ entryPoints: [path.join(here, 'viewer.js')], bundle: true, format: 'iife',
  target: 'es2022', minify: true, write: false, legalComments: 'inline',
  define: { SWING_PIVOT: JSON.stringify(pivot) } });
const code = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const hash = createHash('sha256').update(glb).digest('hex');
const html = template.replace('</head>', () => '<!-- Babylon.js core & glTF loader; Copyright Babylon.js contributors / Microsoft.\n' + license + '\n-->\n</head>').replace('@@GLB_SHA256@@', hash).replace('@@GLB@@', () => packed).replace('@@APP@@', () => code);
const temp = output + '.' + process.pid + '.tmp';
try { await writeFile(temp, html, {flag:'wx'}); await rename(temp, output); }
finally { await rm(temp, { force: true }); }
console.log(output, (Buffer.byteLength(html)/1048576).toFixed(2) + ' MiB', 'WaterCourt.glb SHA-256:', hash);
