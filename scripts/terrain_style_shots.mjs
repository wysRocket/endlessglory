// Before/after proof for the stylized terrain splat layers.
//
//   GAME_URL=http://localhost:5323 node scripts/terrain_style_shots.mjs after
//
// Boots the offline world, hides the HUD, walks the camera to a set of fixed
// vantages, and writes one PNG per vantage. Run it once on the branch and once
// with terrain.ts reverted to the ambientCG scans to get a matched pair; the
// vantages are fixed world coordinates and the sim seed is fixed, so the two
// runs are comparable frame for frame.
//
// Layer coverage is PARTIAL and deliberately stated rather than implied: these
// four vantages show dirt, grass, rock and snow. The sand and mud layers live
// in the beach and marsh biomes, which are editor-painted rather than present
// in the walkable zone strip, so they are not reachable by teleport here and
// are covered by the texture-sheet review instead.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';

const LABEL = process.argv[2] ?? 'after';
// ?gfx=high is LOAD-BEARING, not a preference. Headless runs under
// --use-angle=swiftshader, software GL maps to the `low` tier, and on low
// GFX.terrainSplat is false: terrain falls back to the legacy vertex-colour
// Lambert path that samples no splat texture at all. Without this the script
// happily produces a before/after pair that is identical because NEITHER
// texture set was ever fetched.
const BASE = process.env.GAME_URL ?? 'http://localhost:5173';
const URL = `${BASE}${BASE.includes('?') ? '&' : '?'}gfx=high`;
const OUT = 'docs/screenshots/terrain-style';
fs.mkdirSync(OUT, { recursive: true });

// Fixed world vantages. Chosen for layer coverage, not for prettiness.
// The rock vantage sits just south of the zone1/zone2 ridge wall (z = 180, per
// ZONES in src/sim/data.ts) and well off x = 0, because the ridge is pierced by
// the road pass at passX = 0 and there is no cliff to photograph there.
const VANTAGES = [
  { name: 'town-dirt', x: 0, z: -2 },
  { name: 'open-grass', x: 40, z: -60 },
  { name: 'ridge-rock', x: 60, z: 172 },
  { name: 'rim-snow', x: -120, z: -150 },
];

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

// Record which splat textures actually got fetched. The shots are only
// evidence if the layer under test was really loaded, so this is asserted
// below rather than assumed.
const terrainRequests = new Set();
page.on('request', (r) => {
  const file = r.url().split('/').pop() ?? '';
  if (/_Color\.|_NormalGL\./.test(file)) terrainRequests.add(file.split('.')[0]);
});

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
const jsClick = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) throw new Error(`missing ${s}`);
    el.click();
  }, sel);
await new Promise((r) => setTimeout(r, 400));
await jsClick('#btn-offline');
await new Promise((r) => setTimeout(r, 300));
await page.type('#char-name', 'Terra');
await jsClick('#offline-select .mini-class[data-class="warrior"]');
await jsClick('#btn-start-offline');
// Generous: on the splat tier under software GL the preload gate has to pull
// the whole albedo/normal set before startGame resolves, and the photographic
// scans this replaces are ~15MB, which alone can outlast a 60s budget.
await page.waitForFunction(() => window.__game?.sim?.player, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 2500));

// Entry raises three separate overlays, and they do not all appear at once:
// the GPU notice, the camera-style chooser (src/ui/camera_prompt.ts, which
// paints a full-frame backdrop that dims everything behind it), and the
// tutorial. Dismiss by real selector rather than by matching button text, and
// keep sweeping, because the later ones only appear seconds after the player
// exists.
async function dismissOverlays() {
  return page.evaluate(() => {
    let hit = 0;
    const confirm = document.querySelector('.camera-prompt-confirm');
    if (confirm) {
      confirm.click();
      hit++;
    }
    document.querySelector('.gpu-notice-dismiss')?.click();
    const skip = [...document.querySelectorAll('button')].find((b) =>
      /skip tutorial/i.test(b.textContent || ''),
    );
    if (skip) {
      skip.click();
      hit++;
    }
    return hit;
  });
}
for (let pass = 0; pass < 12; pass++) {
  await dismissOverlays();
  await new Promise((r) => setTimeout(r, 700));
}
// Fail loudly rather than silently shipping dimmed frames.
const stillUp = await page.$('.camera-prompt-backdrop');
if (stillUp) throw new Error('camera prompt still up after dismissal sweeps');

// The splat tier has to be live or the shots show the Lambert fallback and
// prove nothing about the textures.
if (terrainRequests.size === 0) {
  throw new Error('no splat textures were fetched: terrain is on the Lambert tier, shots are void');
}
console.log(`splat layers loaded: ${[...terrainRequests].sort().join(', ')}`);

// Hide the HUD so the shots are about the ground, not the chrome.
await page.addStyleTag({
  content: `#hud, #chat-panel, #minimap, #action-bar, #target-frame, #player-frame,
            .hud-window, .nameplate, #tutorial, #zone-banner { display: none !important; }`,
});
await new Promise((r) => setTimeout(r, 600));

for (const v of VANTAGES) {
  // Position lives on player.pos, NOT player.x/player.z (there are no such
  // fields). Writing the flat names silently creates dead own-properties the
  // sim never reads, which produced a "successful" tour of three identical
  // frames.
  await page.evaluate(
    ({ x, z }) => {
      const p = window.__game?.sim?.player;
      if (!p?.pos) throw new Error('no player.pos');
      p.pos.x = x;
      p.pos.z = z;
    },
    { x: v.x, z: v.z },
  );
  // Let terrain chunks stream in and the camera settle at the new position.
  await new Promise((r) => setTimeout(r, 3000));

  // Verify against the CAMERA, not against the value just written. Reading back
  // your own write proves only that the assignment happened; the camera moving
  // is what proves the world actually followed.
  const cam = await page.evaluate(() => {
    const c = window.__game?.renderer?.camera?.position;
    return c ? { x: c.x, z: c.z } : null;
  });
  if (!cam || Math.hypot(cam.x - v.x, cam.z - v.z) > 40) {
    throw new Error(`camera did not follow to ${v.name}: at ${cam?.x},${cam?.z}`);
  }
  const file = `${OUT}/${v.name}-${LABEL}.png`;
  await page.screenshot({ path: file });
  console.log(`wrote ${file}`);
}

await browser.close();
