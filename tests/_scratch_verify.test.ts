// SCRATCH: draw-order verification harness. Deleted before commit.
import { describe, expect, it } from 'vitest';
import { updateCasting } from '../src/sim/combat/casting_lifecycle';
import { LAKE } from '../src/sim/data';
import { completeFishing, startFishing } from '../src/sim/professions/fishing';
import { type PlayerMeta, Sim } from '../src/sim/sim';
import { FISHING_CAST_ID } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

const TROUT = 'raw_mirror_trout';
const PERCH = 'raw_river_perch';
const WEED = 'tangled_weed';
const KOI = 'glimmerfin_koi';
const IDS = [TROUT, PERCH, WEED, KOI];

const makeSim = (seed = 4242) => new Sim({ seed, playerClass: 'warrior', autoEquip: true });

function teleportToValeShore(sim: Sim): void {
  const pz = LAKE.z - LAKE.radius - 2;
  const p = sim.player;
  p.pos.x = LAKE.x;
  p.pos.z = pz;
  p.pos.y = terrainHeight(LAKE.x, pz, sim.cfg.seed);
  p.prevPos = { ...p.pos };
  p.facing = Math.atan2(0, LAKE.z - pz);
}

function castOnceLive(sim: Sim, meta: PlayerMeta): string | null {
  const before = new Map(IDS.map((id) => [id, sim.countItem(id)]));
  const p = sim.player;
  startFishing(sim.ctx, p, meta);
  if (p.castingAbility !== FISHING_CAST_ID) throw new Error('no cast');
  sim.tickCount = p.fishBiteAtTick;
  updateCasting(sim.ctx, p, meta);
  if (p.fishReelDeadlineTick <= 0) throw new Error('no arm');
  startFishing(sim.ctx, p, meta);
  if (p.castingAbility !== null) throw new Error('no reel');
  let caught: string | null = null;
  for (const id of IDS) if (sim.countItem(id) > (before.get(id) ?? 0)) caught = id;
  return caught;
}

function seqLive(sim: Sim, meta: PlayerMeta, n: number): (string | null)[] {
  const out: (string | null)[] = [];
  for (let i = 0; i < n; i++) out.push(castOnceLive(sim, meta));
  return out;
}

function castOnceDirect(sim: Sim, meta: PlayerMeta): string | null {
  const before = new Map(IDS.map((id) => [id, sim.countItem(id)]));
  completeFishing(sim.ctx, sim.player, meta);
  let caught: string | null = null;
  for (const id of IDS) if (sim.countItem(id) > (before.get(id) ?? 0)) caught = id;
  return caught;
}

// Build a band-configured sim. burn = extra rng draws consumed up front.
function rig(opts: { prof?: number; rod?: string | null; burn?: number }): {
  sim: Sim;
  meta: PlayerMeta;
} {
  const sim = makeSim(4242);
  const meta = sim.meta(sim.playerId) as PlayerMeta;
  for (let i = 0; i < (opts.burn ?? 0); i++) sim.rng.next();
  if (opts.prof !== undefined) meta.gatheringProficiency.fishing = opts.prof;
  if (opts.rod) sim.addItem(opts.rod, 1);
  teleportToValeShore(sim);
  return { sim, meta };
}

// ---- the OLD pinned literals (pre-merge recordings) ----
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

describe('SHIFT HYPOTHESIS', () => {
  it('finds the burn k reproducing every OLD literal', () => {
    const found: Record<string, number[]> = { b0: [], b1: [], b2: [], koi: [], rhythm: [] };
    for (let k = 0; k <= 40; k++) {
      const b0 = rig({ burn: k });
      if (JSON.stringify(seqLive(b0.sim, b0.meta, 30)) === JSON.stringify(OLD_B0))
        found.b0.push(k);
      const b1 = rig({ prof: 150, rod: 'ironreel_fishing_rod', burn: k });
      if (JSON.stringify(seqLive(b1.sim, b1.meta, 24)) === JSON.stringify(OLD_B1))
        found.b1.push(k);
      const b2 = rig({ prof: 200, rod: 'silverstream_fishing_rod', burn: k });
      if (JSON.stringify(seqLive(b2.sim, b2.meta, 24)) === JSON.stringify(OLD_B2))
        found.b2.push(k);
      // direct (one-draw) walk: old koi index 21
      const d = rig({ burn: k });
      let koiAt = -1;
      for (let i = 0; i < 30; i++) if (castOnceDirect(d.sim, d.meta) === KOI) { koiAt = i; break; }
      if (koiAt === 21) found.koi.push(k);
      // rhythm: bare 127
      const r = rig({ burn: k });
      startFishing(r.sim.ctx, r.sim.player, r.meta);
      if (r.sim.player.fishBiteAtTick - r.sim.tickCount === 127) found.rhythm.push(k);
    }
    console.log('SHIFT-K', JSON.stringify(found));
    expect(true).toBe(true);
  });
});

describe('STRUCTURAL INVARIANTS (literal-free)', () => {
  it('band 0 equivalence class: bare == pole == prof0+tier3rod == prof150+norod', () => {
    const bare = seqLive(...(([r]) => [r.sim, r.meta, 30] as const)([rig({})]));
    const pole = (() => { const r = rig({ rod: 'simple_fishing_pole' }); return seqLive(r.sim, r.meta, 30); })();
    const hiRod = (() => { const r = rig({ rod: 'silverstream_fishing_rod' }); return seqLive(r.sim, r.meta, 30); })();
    const noRod150 = (() => { const r = rig({ prof: 150 }); return seqLive(r.sim, r.meta, 30); })();
    expect(pole).toEqual(bare);
    expect(hiRod).toEqual(bare);
    expect(noRod150).toEqual(bare);
    console.log('NEW_B0', JSON.stringify(bare));
  });

  it('band 1 equivalence class: prof150+tier2 == prof250+tier2', () => {
    const a = (() => { const r = rig({ prof: 150, rod: 'ironreel_fishing_rod' }); return seqLive(r.sim, r.meta, 24); })();
    const b = (() => { const r = rig({ prof: 250, rod: 'ironreel_fishing_rod' }); return seqLive(r.sim, r.meta, 24); })();
    expect(b).toEqual(a);
    console.log('NEW_B1', JSON.stringify(a));
  });

  it('band 2 equivalence class: prof200+tier3 == prof250+tier3', () => {
    const a = (() => { const r = rig({ prof: 200, rod: 'silverstream_fishing_rod' }); return seqLive(r.sim, r.meta, 24); })();
    const b = (() => { const r = rig({ prof: 250, rod: 'silverstream_fishing_rod' }); return seqLive(r.sim, r.meta, 24); })();
    expect(b).toEqual(a);
    console.log('NEW_B2', JSON.stringify(a));
  });

  it('discriminators: B1 differs from B0 at index 0; B1 differs from B2 somewhere in 0..23', () => {
    const b0 = (() => { const r = rig({}); return seqLive(r.sim, r.meta, 24); })();
    const b1 = (() => { const r = rig({ prof: 150, rod: 'ironreel_fishing_rod' }); return seqLive(r.sim, r.meta, 24); })();
    const b2 = (() => { const r = rig({ prof: 200, rod: 'silverstream_fishing_rod' }); return seqLive(r.sim, r.meta, 24); })();
    const d01 = b0.findIndex((v, i) => v !== b1[i]);
    const d12 = b1.findIndex((v, i) => v !== b2[i]);
    console.log('DIVERGE b0-vs-b1', d01, 'b1-vs-b2', d12, 'b1@d12', b1[d12], 'b2@d12', b2[d12]);
    expect(d01).toBeGreaterThanOrEqual(0);
    expect(d12).toBeGreaterThanOrEqual(0);
  });

  it('direct-walk koi index (new)', () => {
    const r = rig({});
    let koiAt = -1;
    for (let i = 0; i < 30; i++) if (castOnceDirect(r.sim, r.meta) === KOI) { koiAt = i; break; }
    console.log('NEW_KOI_AT', koiAt);
    expect(koiAt).toBeGreaterThanOrEqual(0);
  });

  it('rhythm: three rod arms off the SAME first draw', () => {
    const out: Record<string, number> = {};
    for (const rod of [null, 'ironreel_fishing_rod', 'silverstream_fishing_rod']) {
      const r = rig({ rod });
      startFishing(r.sim.ctx, r.sim.player, r.meta);
      out[rod ?? 'bare'] = r.sim.player.fishBiteAtTick - r.sim.tickCount;
    }
    console.log('NEW_RHYTHM', JSON.stringify(out));
    expect(out.bare).toBeGreaterThan(out.ironreel_fishing_rod);
    expect(out.ironreel_fishing_rod).toBeGreaterThan(out.silverstream_fishing_rod);
  });

  it('draw contract: exactly 2 draws per live session', () => {
    const r = rig({});
    let draws = 0;
    r.sim.rng.setObserver(() => draws++);
    castOnceLive(r.sim, r.meta);
    r.sim.rng.setObserver(null);
    expect(draws).toBe(2);
  });

  it('construction draw count at seed 4242', () => {
    // How many draws does a fresh Sim consume? Count via observer on a
    // constructed sim is impossible retroactively, so probe the raw stream
    // value the first cast sees instead.
    const r = rig({});
    let first = -1;
    r.sim.rng.setObserver((v: number) => { if (first < 0) first = v; });
    startFishing(r.sim.ctx, r.sim.player, r.meta);
    r.sim.rng.setObserver(null);
    console.log('FIRST_DRAW_U', first);
    expect(true).toBe(true);
  });
});
