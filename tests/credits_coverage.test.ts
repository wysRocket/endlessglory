// Every shipped model must be accounted for in CREDITS.md.
//
// Why this guard exists: nothing enforced attribution before it. The asset
// pipeline updates CREDITS.md by convention (scripts/asset_pipeline/CLAUDE.md),
// but any GLB added by hand, by a one-off script, or by a spec outside that
// pipeline escaped silently. That is how a whole set of models came to ship
// uncredited, and how the Quaternius row came to credit a `wolf` that had been
// deleted while the two files actually rendering every wolf in the game sat
// under no row at all.
//
// The rule, in two directions:
//   1. Every GLB under public/models is covered, either by its own filename
//      appearing in CREDITS.md or by living in a directory whose bulk pack has a
//      row (PACK_COVERED_DIRS below).
//   2. Every anchor this test relies on still exists in CREDITS.md, so a row
//      cannot be deleted or reworded out from under the guard and leave it
//      passing on nothing.
//
// Filenames, not common names. CREDITS used to say "wolf" and "dragon" while
// shipping wolf_basic.glb and dragonevolved.glb. Informal names are what let
// crabenemy.glb sit uncredited unnoticed, so per-file rows cite the real file.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const MODELS = path.join(ROOT, 'public/models');
const CREDITS = readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');

/** Directories whose contents are third-party packs credited as a whole, rather
 *  than per file. Each value is a literal that MUST still appear in CREDITS.md,
 *  so deleting the row fails this test rather than silently widening the
 *  exemption. Bespoke, individually sourced models do NOT belong here: that is
 *  the entire class of asset this guard is protecting. */
const PACK_COVERED_DIRS: Record<string, string> = {
  biome: 'Terrain PBR textures, biome set',
  dungeon: 'Dungeon modular kit',
  foliage: 'Stylized Nature MegaKit',
  props: 'Fantasy Props MegaKit',
  quest: 'Generated prop model',
  resources: 'Fantasy Props MegaKit',
  tools: 'Fantasy Props MegaKit',
  weapons: 'Season 1 Armory weapon models',
};

/** Directories where every file must be named individually in CREDITS.md. */
const PER_FILE_DIRS = ['creatures', 'chars'];

/** CREDITS.md groups sibling files as `dir/{a,b,c}.glb` to stay readable. Expand
 *  those into the individual filenames so both directions of this guard compare
 *  real names, not the shorthand. */
function creditedFilenames(md: string): Set<string> {
  const out = new Set<string>();
  for (const m of md.matchAll(/\{([^{}]+)\}\.glb/g)) {
    for (const stem of m[1].split(',')) out.add(`${stem.trim()}.glb`);
  }
  for (const m of md.matchAll(/([A-Za-z0-9_]+)\.glb/g)) out.add(m[1]);
  return new Set([...out].map((f) => (f.endsWith('.glb') ? f : `${f}.glb`)));
}

const credited = creditedFilenames(CREDITS);

function walkGlb(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkGlb(full));
    else if (entry.endsWith('.glb')) out.push(full);
  }
  return out;
}

const allGlb = walkGlb(MODELS).map((p) => path.relative(MODELS, p));

describe('CREDITS.md coverage', () => {
  it('finds models to check, so the sweep can never pass vacuously', () => {
    expect(allGlb.length).toBeGreaterThan(500);
    for (const dir of PER_FILE_DIRS) {
      expect(allGlb.filter((f) => f.startsWith(`${dir}/`)).length).toBeGreaterThan(0);
    }
  });

  it('names every individually sourced model', () => {
    const uncredited = allGlb
      .filter((f) => PER_FILE_DIRS.some((d) => f.startsWith(`${d}/`)))
      .filter((f) => !credited.has(path.basename(f)));
    expect(
      uncredited,
      `uncredited models, add a CREDITS.md row naming each file:\n${uncredited.join('\n')}`,
    ).toEqual([]);
  });

  it('covers every remaining model by a pack row', () => {
    const orphans = allGlb
      .filter((f) => !PER_FILE_DIRS.some((d) => f.startsWith(`${d}/`)))
      .filter((f) => {
        const top = f.split('/')[0];
        return !(top in PACK_COVERED_DIRS) && !credited.has(path.basename(f));
      });
    expect(
      orphans,
      `models in a directory with no pack row:\n${orphans.slice(0, 20).join('\n')}`,
    ).toEqual([]);
  });

  it('keeps every pack anchor it relies on present in CREDITS.md', () => {
    const missing = Object.entries(PACK_COVERED_DIRS)
      .filter(([, anchor]) => !CREDITS.includes(anchor))
      .map(([dir, anchor]) => `${dir}: "${anchor}"`);
    expect(
      missing,
      `pack rows referenced by this guard no longer exist:\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('does not exempt a directory that no longer ships models', () => {
    const stale = Object.keys(PACK_COVERED_DIRS).filter(
      (dir) => !allGlb.some((f) => f.startsWith(`${dir}/`)),
    );
    expect(stale, `exempt directories with no models left:\n${stale.join('\n')}`).toEqual([]);
  });

  it('keeps the unresolved-provenance section, and every asset it names still ships', () => {
    expect(CREDITS).toContain('## Unresolved provenance');
    // Anything parked as unresolved must still exist; once a file is deleted its
    // row should go with it, or the section rots into a list of ghosts.
    for (const file of [
      'wolf_basic.glb',
      'greyjaw.glb',
      'wild_boar.glb',
      'CombatMech.glb',
      'skeleton_dagger.glb',
    ]) {
      expect(
        allGlb.some((f) => path.basename(f) === file),
        `${file} is listed under Unresolved provenance but no longer ships`,
      ).toBe(true);
    }
  });

  it('does not credit a model that no longer ships', () => {
    // The Quaternius row once credited a wolf.glb deleted months earlier. Any
    // filename cited in CREDITS.md must resolve to something on disk.
    const shipped = new Set(allGlb.map((f) => path.basename(f)));
    const ghosts = [...credited].filter((f) => !shipped.has(f));
    expect(ghosts, `CREDITS.md cites models that are not on disk:\n${ghosts.join('\n')}`).toEqual(
      [],
    );
  });
});
