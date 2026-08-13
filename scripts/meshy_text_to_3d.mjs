// Meshy text-to-3D: prompt straight to a raw mesh GLB, no concept image needed.
//
// Why this exists alongside scripts/image_to_3d.mjs: that harness is image-to-3D
// only, and both concept-image routes (gpt-image-2 and the local generators) can
// be unavailable, which blocks the whole chain on an input we do not actually
// need. Meshy generates from text directly.
//
// This deliberately stops at the RAW mesh. Rigging is done afterwards, for free
// and locally, by:
//   node scripts/asset_pipeline/pipeline.mjs rig-manual --raw <out.glb> --name <key>
// which binds the mesh onto the real KayKit skeleton so the result inherits the
// full 22-clip KayKit library and the handslot bones natively. Generating a rig
// at the provider instead would cost credits AND produce an animation style that
// does not match the shipped cast.
//
// Usage:
//   node scripts/meshy_text_to_3d.mjs --name drowned_cantor --prompt "..." \
//     [--art-style realistic] [--refine] [--out tmp/raw/<name>.glb]
//
// MESHY_API_KEY comes from the repo-root .env (gitignored). NOTE: a git worktree
// does NOT get .env, since it is ignored and therefore not checked out; source it
// from the primary working tree when running there.

import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : null))
    .filter(Boolean),
);

try {
  process.loadEnvFile();
} catch {
  // fall through to a real environment variable
}

const KEY = process.env.MESHY_API_KEY;
const NAME = args.name;
const PROMPT = args.prompt;
const ART_STYLE = args['art-style'] ?? 'realistic';
const REFINE = 'refine' in args;
const OUT = args.out ?? `tmp/raw/${NAME}.glb`;

if (!KEY) {
  console.error('NO KEY: set MESHY_API_KEY in the repo-root .env or the environment');
  process.exit(2);
}
if (!NAME || !PROMPT) {
  console.error('usage: --name <snake_case> --prompt "..." [--art-style x] [--refine] [--out p]');
  process.exit(2);
}

const API = 'https://api.meshy.ai/openapi/v2/text-to-3d';
const auth = { Authorization: `Bearer ${KEY}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function submit(body) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`submit ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
  return j.result ?? j.task_id ?? j.id;
}

async function poll(id, label) {
  for (let i = 0; i < 240; i += 1) {
    const r = await fetch(`${API}/${id}`, { headers: auth });
    const j = await r.json().catch(() => ({}));
    const status = j.status ?? j.state;
    if (status === 'SUCCEEDED') return j;
    if (status === 'FAILED' || status === 'CANCELED') {
      throw new Error(`${label} ${status}: ${JSON.stringify(j.task_error ?? j).slice(0, 300)}`);
    }
    if (i % 6 === 0) console.log(`  ${label} ${status ?? 'pending'} ${j.progress ?? 0}%`);
    await sleep(5000);
  }
  throw new Error(`${label} timed out`);
}

console.log(`meshy text-to-3d: ${NAME}`);
const previewId = await submit({
  mode: 'preview',
  prompt: PROMPT,
  art_style: ART_STYLE,
  should_remesh: true,
});
console.log(`  preview task ${previewId}`);
let task = await poll(previewId, 'preview');

if (REFINE) {
  const refineId = await submit({ mode: 'refine', preview_task_id: previewId });
  console.log(`  refine task ${refineId}`);
  task = await poll(refineId, 'refine');
}

const url = task.model_urls?.glb ?? task.model_url;
if (!url) throw new Error(`no glb url in result: ${JSON.stringify(task).slice(0, 300)}`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const bin = Buffer.from(await (await fetch(url)).arrayBuffer());
fs.writeFileSync(OUT, bin);
console.log(`wrote ${OUT} (${(bin.length / 1024).toFixed(0)} KB)`);
console.log(
  `next: node scripts/asset_pipeline/pipeline.mjs rig-manual --raw ${OUT} --name ${NAME}`,
);
