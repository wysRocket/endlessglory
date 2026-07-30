// Billboard the golem as the EXACT concept art (guaranteed identical to the
// reference). Builds a GLB containing a single textured plane (the concept
// image) sized so the golem in the art reads ~3 world units tall. The renderer
// loads this GLB like any other visual and places it at the mob's position.
//
//   node scripts/gen_amber_golem_billboard.mjs
// Writes public/models/emberwood/creatures/amber_heart_golem.glb
import { Document, NodeIO } from '@gltf-transform/core';
import fs from 'node:fs';
import path from 'node:path';

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('Scene');

const CONCEPT = '/tmp/sculpt-work/concepts/golem.png';
const img = fs.readFileSync(CONCEPT);
const tex = doc.createTexture('golemConcept').setMimeType('image/png').setImage(img);

// Concept is 1408x768. The golem occupies ~70% of the height. To make the
// golem read ~3.0 world units tall, the full-plane height = 3.0 / 0.7 ≈ 4.3.
const H = 4.3;
const W = H * (1408 / 768);
const mat = doc.createMaterial('golemBillboard')
  .setBaseColorTexture(tex)
  .setBaseColorFactor([1, 1, 1, 1])
  .setMetallicFactor(0).setRoughnessFactor(1).setDoubleSided(true);
// alpha test so the (mostly opaque) painted art cuts cleanly against the world
mat.setAlphaMode('MASK').setAlphaCutoff(0.5);

// Plane in XY, centered, feet at y=0 → shift up by H/2.
const hw = W / 2, hh = H / 2;
const pos = [-hw, -hh, 0, hw, -hh, 0, hw, hh, 0, -hw, hh, 0];
const uv = [0, 0, 1, 0, 1, 1, 0, 1];
const idx = [0, 1, 2, 0, 2, 3];
const prim = doc.createPrimitive()
  .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer))
  .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buffer))
  .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(idx)).setBuffer(buffer))
  .setMaterial(mat);
const mesh = doc.createMesh('golemBillboardMesh').addPrimitive(prim);
// Node group so the plane sits with feet at ground (y offset) and faces +Z.
const node = doc.createNode('golemBillboard').setMesh(mesh).setTranslation([0, hh, 0]);
scene.addChild(node);

const glb = await new NodeIO().writeBinary(doc);
const out = path.resolve('public/models/emberwood/creatures/amber_heart_golem.glb');
fs.writeFileSync(out, glb);
console.log(`wrote ${out} (${(glb.length / 1024).toFixed(1)} KB), billboard of concept art, plane ${W.toFixed(2)}x${H.toFixed(2)}`);
