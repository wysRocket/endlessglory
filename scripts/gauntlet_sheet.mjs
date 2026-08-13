// Gauntlet loop: build a matched contact sheet from a directory of creature
// renders, so ours and the bar can be judged side by side under identical
// presentation (same cell size, same background, same grid, no labels).
//
// Labels are deliberately absent: the critic compares blind.
//
// Usage: node scripts/gauntlet_sheet.mjs <srcDir> <outPath> [count] [cols] [cell]

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [srcDir, out, countArg, colsArg, cellArg] = process.argv.slice(2);
if (!srcDir || !out) {
  console.error('usage: gauntlet_sheet.mjs <srcDir> <outPath> [count] [cols] [cell]');
  process.exit(1);
}
const cols = Number(colsArg ?? 6);
const cell = Number(cellArg ?? 200);
const BG = { r: 24, g: 24, b: 28, alpha: 1 };

const all = fs
  .readdirSync(srcDir)
  .filter((f) => /\.(png|webp|jpe?g)$/i.test(f))
  .sort();

// Evenly spaced sample, so duplicate models appear at their true frequency
// rather than being deduped into a flattering subset.
const count = Math.min(Number(countArg ?? all.length), all.length);
const files =
  count === all.length
    ? all
    : Array.from(
        { length: count },
        (_, i) => all[Math.round((i * (all.length - 1)) / (count - 1))],
      );

const rows = Math.ceil(files.length / cols);
const tiles = await Promise.all(
  files.map(async (f, i) => ({
    input: await sharp(path.join(srcDir, f))
      .resize(cell, cell, { fit: 'contain', background: BG })
      .flatten({ background: BG })
      .png()
      .toBuffer(),
    left: (i % cols) * cell,
    top: Math.floor(i / cols) * cell,
  })),
);

fs.mkdirSync(path.dirname(out), { recursive: true });
await sharp({
  create: { width: cols * cell, height: rows * cell, channels: 3, background: BG },
})
  .composite(tiles)
  .png()
  .toFile(out);

console.log(`wrote ${out}  ${files.length} tiles (of ${all.length}), ${cols}x${rows} at ${cell}px`);
