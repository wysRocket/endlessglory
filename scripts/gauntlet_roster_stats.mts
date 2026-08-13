// Gauntlet loop: exact roster duplication metrics.
//
// Why this exists: the loop's other instrument is a contact sheet judged blind by
// a critic. That is the right tool for STYLE and the wrong one for COUNTING. An
// evenly spaced 35-cell sample of a 120-template roster contained only 1 of 7
// newly distinguished mobs, so it reported "distinct models unchanged" after a
// change that provably increased them. A critic squinting at thumbnails also
// cannot tell two tints of one mesh from two meshes.
//
// So: count exactly here, judge style there.
//
// This IMPORTS the real modules rather than parsing the TypeScript. A first
// attempt used regexes over manifest.ts and silently mis-read `tint: 'entity'`
// as a template mapping while missing several def blocks, which is exactly the
// class of quiet wrongness this file is supposed to eliminate.
//
// Run: npx tsx scripts/gauntlet_roster_stats.mts [--json]

import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { MOBS } from '../src/sim/data';

const templates = Object.keys(MOBS);
const byGlb = new Map<string, string[]>();
const noUrl: string[] = [];

for (const templateId of templates) {
  const mob = (MOBS as Record<string, { family?: string }>)[templateId];
  // visualKeyFor is the real dispatch: MOB_KEYS, then FAMILY_KEYS, then fallback.
  const key = visualKeyFor({ kind: 'mob', templateId, family: mob?.family } as never);
  const def = (VISUALS as Record<string, { url?: string }>)[key];
  const url = def?.url;
  if (!url) {
    noUrl.push(`${templateId} -> ${key}`);
    continue;
  }
  const glb = url.split('/').pop() as string;
  if (!byGlb.has(glb)) byGlb.set(glb, []);
  (byGlb.get(glb) as string[]).push(templateId);
}

const shared = [...byGlb.entries()]
  .filter(([, t]) => t.length > 1)
  .sort((a, b) => b[1].length - a[1].length);
const onShared = shared.reduce((s, [, t]) => s + t.length, 0);

const report = {
  templates: templates.length,
  resolved: templates.length - noUrl.length,
  distinctBodies: byGlb.size,
  templatesPerBody: Number(((templates.length - noUrl.length) / byGlb.size).toFixed(2)),
  bodiesUsedOnce: byGlb.size - shared.length,
  templatesOnSharedBodies: onShared,
  duplicationRatio: Number((onShared / (templates.length - noUrl.length)).toFixed(3)),
  unresolved: noUrl,
  worstOffenders: shared.slice(0, 10).map(([glb, t]) => ({ glb, count: t.length, templates: t })),
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`mob templates:            ${report.templates}`);
  console.log(`resolved to a body:       ${report.resolved}`);
  console.log(`distinct body GLBs:       ${report.distinctBodies}`);
  console.log(`templates per body:       ${report.templatesPerBody}`);
  console.log(`bodies used exactly once: ${report.bodiesUsedOnce}`);
  console.log(
    `sharing a body:           ${report.templatesOnSharedBodies} (${(report.duplicationRatio * 100).toFixed(1)}%)`,
  );
  if (report.unresolved.length) {
    console.log(
      `unresolved:               ${report.unresolved.length} -> ${report.unresolved.slice(0, 3).join('; ')}`,
    );
  }
  console.log('\nworst offenders:');
  for (const o of report.worstOffenders) {
    const list = o.templates.slice(0, 5).join(', ');
    console.log(
      `  ${String(o.count).padStart(2)}  ${o.glb.padEnd(26)} ${list}${o.templates.length > 5 ? ' ...' : ''}`,
    );
  }
}
