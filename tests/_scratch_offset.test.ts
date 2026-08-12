// SCRATCH: raw-stream replay to locate the draw offset. Deleted before commit.
import { describe, expect, it } from 'vitest';
import { FISHING_TABLES_BY_BAND } from '../src/sim/content/items';
import { Rng } from '../src/sim/rng';

const TROUT = 'raw_mirror_trout';
const PERCH = 'raw_river_perch';
const WEED = 'tangled_weed';
const KOI = 'glimmerfin_koi';

const OLD_B0 = [
  PERCH, TROUT, PERCH, PERCH, TROUT, TROUT, TROUT, TROUT, PERCH, TROUT,
  KOI, TROUT, TROUT, TROUT, TROUT, null, PERCH, TROUT, PERCH, TROUT,
  TROUT, TROUT, null, PERCH, TROUT, WEED, WEED, PERCH, TROUT, PERCH,
];
const OLD_B1 = [
  TROUT, TROUT, PERCH, PERCH, TROUT, TROUT, TROUT, TROUT, PERCH, TROUT,
  WEED, TROUT, TROUT, TROUT, TROUT, null, PERCH, TROUT, PERCH, TROUT,
  TROUT, TROUT, KOI, PERCH,
];
const OLD_B2 = [
  TROUT, TROUT, PERCH, PERCH, TROUT, TROUT, TROUT, TROUT, PERCH, TROUT,
  WEED, TROUT, TROUT, TROUT, TROUT, null, PERCH, TROUT, PERCH, TROUT,
  TROUT, TROUT, WEED, TROUT,
];

// Raw mulberry32 values at stream indices [0, n).
function stream(seed: number, n: number): number[] {
  const rng = new Rng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rng.next());
  return out;
}

// The completeFishing table walk, transcribed verbatim from the module.
function walk(band: 0 | 1 | 2, u: number): string | null {
  const table = FISHING_TABLES_BY_BAND[band].eastbrook_vale;
  const total = table.reduce((s, e) => s + e.weight, 0);
  let roll = u * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll < 0) return entry.itemId === 'none' ? null : entry.itemId;
  }
  return null;
}

// The LIVE loop consumes two draws per session: bite delay then table.
function replayLive(band: 0 | 1 | 2, us: number[], start: number, n: number): (string | null)[] {
  const out: (string | null)[] = [];
  for (let i = 0; i < n; i++) out.push(walk(band, us[start + 2 * i + 1]));
  return out;
}

// The DIRECT completeFishing walk consumes one draw per cast.
function replayDirect(band: 0 | 1 | 2, us: number[], start: number, n: number): (string | null)[] {
  const out: (string | null)[] = [];
  for (let i = 0; i < n; i++) out.push(walk(band, us[start + i]));
  return out;
}

describe('raw-stream offset', () => {
  const us = stream(4242, 4000);

  it('locates the live-loop start offset for every OLD and NEW literal', () => {
    const findLive = (band: 0 | 1 | 2, want: (string | null)[]) => {
      const hits: number[] = [];
      for (let s = 0; s + 2 * want.length + 2 < us.length; s++) {
        if (JSON.stringify(replayLive(band, us, s, want.length)) === JSON.stringify(want))
          hits.push(s);
      }
      return hits.slice(0, 5);
    };
    console.log('OLD_B0 live offsets', JSON.stringify(findLive(0, OLD_B0)));
    console.log('OLD_B1 live offsets', JSON.stringify(findLive(1, OLD_B1)));
    console.log('OLD_B2 live offsets', JSON.stringify(findLive(2, OLD_B2)));
    expect(true).toBe(true);
  });

  it('rebuilds the NEW sequences from the OLD offset plus 10 draws', () => {
    // If the merged sim simply starts 10 draws later, then replaying from the
    // OLD offset + 10 with the UNCHANGED walk must reproduce the new literals.
    console.log('B0@1540', JSON.stringify(replayLive(0, us, 1540, 30)));
    console.log('B1@1540', JSON.stringify(replayLive(1, us, 1540, 24)));
    console.log('B2@1540', JSON.stringify(replayLive(2, us, 1540, 24)));
    console.log('DIRECT@1530 koi', replayDirect(0, us, 1530, 30).indexOf(KOI));
    console.log('DIRECT@1540 koi', replayDirect(0, us, 1540, 30).indexOf(KOI));
    expect(true).toBe(true);
  });

  it('rhythm ticks from the raw first draw at offsets 1530 and 1540', () => {
    for (const off of [1530, 1540]) {
      const u = us[off];
      const t = (effMax: number) => Math.ceil((3 + u * (effMax - 3)) / 0.05);
      console.log(`rhythm@${off} u=${u} bare=${t(8)} t2=${t(6.5)} t3=${t(5)}`);
    }
    expect(true).toBe(true);
  });
});
