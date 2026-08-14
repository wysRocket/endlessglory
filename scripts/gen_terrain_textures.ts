// Writes the stylized terrain splat textures to public/textures/terrain/.
//
// Thin consumer: every generation decision lives in the pure core
// (src/render/terrain_texture_core.ts), which is what the Vitest suite covers.
// This file only turns texel buffers into PNGs and reports what it wrote.
//
//   npm run terrain:textures
//
// PNG rather than JPEG on purpose. These are posterized flat-colour fields, and
// JPEG's ringing lands exactly on hard colour boundaries, which is the entire
// look. PNG also compresses large flat areas better than JPEG does, so the
// stylized set is smaller than the photographic set it replaces.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { TERRAIN_LAYERS, generateTerrainLayer } from '../src/render/terrain_texture_core';

const SIZE = 1024;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, '../public/textures/terrain');

async function writePng(buf: Uint8Array, size: number, file: string): Promise<number> {
  const png = await sharp(Buffer.from(buf), { raw: { width: size, height: size, channels: 3 } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  writeFileSync(file, png);
  return png.byteLength;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  let total = 0;
  for (const spec of TERRAIN_LAYERS) {
    const texels = generateTerrainLayer(spec, SIZE);
    const colorFile = path.join(OUT_DIR, `${spec.stem}_Color.png`);
    const colorBytes = await writePng(texels.albedo, SIZE, colorFile);
    total += colorBytes;
    let line = `${spec.stem}_Color.png ${(colorBytes / 1024).toFixed(0)}KB`;
    if (texels.normal) {
      const normalFile = path.join(OUT_DIR, `${spec.stem}_NormalGL.png`);
      const normalBytes = await writePng(texels.normal, SIZE, normalFile);
      total += normalBytes;
      line += `, ${spec.stem}_NormalGL.png ${(normalBytes / 1024).toFixed(0)}KB`;
    }
    console.log(line);
  }
  console.log(`total ${(total / 1024 / 1024).toFixed(2)}MB across ${TERRAIN_LAYERS.length} layers`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
