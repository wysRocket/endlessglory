// Gauntlet loop, baseline capture: in-world scenes for the world-props and
// lighting pieces. The roster contact sheet only judges creatures in isolation;
// these frames judge the dressed world the reviewer actually walked through.
//
// Reuses the shared offline-boot helper and the same teleport/camera control as
// scripts/voxel_terrain_tour_shot.mjs. Needs the dev server running; point
// GAME_URL at it (this repo's launch config uses :5321).
//
// Usage: GAME_URL=http://localhost:5321 node scripts/gauntlet_scene_shots.mjs

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

// Force the tier explicitly: headless runs on SwiftShader, which initGfxTier maps
// to `low` (Lambert, no PBR, no rim). Judging the house style on the low path
// would measure the fallback renderer, not the one players see.
const TIER = process.env.GFX_TIER ?? 'high';
const BASE = process.env.GAME_URL ?? 'http://localhost:5321';
const URL = `${BASE}${BASE.includes('?') ? '&' : '?'}gfx=${TIER}`;
const OUT = 'tmp/gauntlet/ours/scenes';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One frame per distinct dressing language, not one per zone: the question is
// whether the props and lighting hold together, so spread across the biomes and
// include a hub (dense prop dressing) and an interior door (kit geometry).
const LOCATIONS = [
  { name: '1_vale_hub', x: 20, z: 40 },
  { name: '2_vale_lake', x: -60, z: -80 },
  { name: '3_fenbridge_hub', x: 0, z: 300 },
  { name: '4_marsh_east', x: 130, z: 400 },
  { name: '5_highwatch_hub', x: 0, z: 660 },
  { name: '6_peaks_center', x: 0, z: 750 },
];

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: [
    '--window-size=1600,900',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
  ],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`);
});

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 90000 });
// enterOfflineGame already dismisses the intro cinematic, the tutorial card and
// the camera-mode prompt. Do NOT press Escape afterwards: with those overlays
// already gone it opens the Game Menu instead, straight over the frame.
await enterOfflineGame(page, { charClass: 'warrior', charName: 'Gauntlet', settleMs: 1800 });

await page.waitForFunction(() => Boolean(window.__game?.sim?.player), { timeout: 60000 });
await page.evaluate(() => {
  window.__game.sim.player.gm = true;
});

// Hide every piece of chrome: this piece judges the rendered world, and HUD in
// frame biases a blind comparison against a reference whose HUD is not in shot.
// #ui is the HUD root (index.html), #gpu-notice the software-renderer toast,
// #nameplates and #swingbar the overhead-text layers the nameplate painter owns
// (siblings of #ui, so hiding #ui alone leaves them painting over the frame).
await page.addStyleTag({
  content: '#ui, #gpu-notice, #perf-overlay, #nameplates, #swingbar { display: none !important; }',
});
await sleep(400);

for (const loc of LOCATIONS) {
  await page.evaluate((p) => {
    const g = window.__game;
    const player = g.sim.player;
    player.gm = true;
    player.hp = player.maxHp;
    player.pos.x = p.x;
    player.pos.z = p.z;
    player.facing = 0;
    g.input.camYaw = 0.6;
    g.input.camPitch = -0.28;
  }, loc);
  await sleep(1600);
  await page.screenshot({ path: `${OUT}/${loc.name}.png` });
  console.log('captured', loc.name);
}

await browser.close();
if (errors.length)
  console.log(`\n${errors.length} console/page errors:\n` + errors.slice(0, 10).join('\n'));
console.log(`\nwrote ${LOCATIONS.length} frames to ${OUT}`);
