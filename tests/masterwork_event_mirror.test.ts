// Masterwork event mirror parity (Professions 2.0 Phase 2, the #2033 liveness
// class): the `masterwork` SimEvent must be a LIVE mirror on both hosts. The
// offline Sim stashes PlayerMeta.lastMasterwork when a craft procs, and the
// online ClientWorld rebuilds lastMasterwork from the event stream alone, so
// a dead stub (an applyMasterworkEvent the events loop never calls, or a
// mirror field nothing assigns) fails here.
import { describe, expect, it, vi } from 'vitest';
import { ClientWorld } from '../src/net/online';
import { Sim } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';

// NOT a hunted seed: any seed works, because the proc itself is no longer a
// single hunted draw (see craftMasterwork below). This file used to pin a
// specific seed hoping a fresh warrior's first craft rolled under the 3
// percent base masterwork chance; that seed (18), and every listed "spare"
// (23, 41, 46, 81, 109) tried across the life of this file, eventually
// stopped landing once an unrelated content change anywhere reshuffled the
// shared rng stream. Seed-hunting a probabilistic proc is the anti-pattern;
// the fix is a bounded retry (mirrors tests/parity/scenarios.ts
// professionsCraft's fix for the identical class of bug).
// Each proc test drives a BOUNDED RETRY that rebuilds a full Sim until the
// capped 0.15 masterwork chance fires, so its cost is a small multiple of Sim
// construction rather than a fixed one. That fits comfortably in vitest's 5s
// default when the file runs alone (the whole file takes about 3s), but not
// when the suite shards and several workers contend for the same cores: the
// two proc tests then time out at exactly 5000ms while asserting nothing new.
// Raising the ceiling for this file keeps the retry honest instead of trading
// it for a hunted seed, which the comment above explains is the anti-pattern
// this file exists to avoid.
vi.setConfig({ testTimeout: 30_000 });

const PROC_SEED = 18;
const RECIPE_ID = 'recipe_eastbrook_ritual_vestments';
const ITEM_ID = 'eastbrook_ritual_vestments';

// Bounded retry until the masterwork proc fires, exactly like
// tests/parity/scenarios.ts professionsCraft. Archetype acceptance
// (tailoring, tier-8 skill) plus a signed reagent push the proc chance to
// the capped 0.15 (masterworkProcChance, src/sim/professions/masterwork.ts:
// 0.03 base + 0.01/tier * 8 tiers above + 0.03 specialized + 0.02 signed =
// 0.16, capped at 0.15), so the odds of zero procs across
// MAX_MASTERWORK_ATTEMPTS real crafts are astronomically small (0.85^100 =
// ~1.4e-8): the cap is a runaway guard, never a coin flip. The #1301 output
// throttle (CRAFT_THROTTLE_MAX_PER_WINDOW = 10 per
// CRAFT_THROTTLE_WINDOW_SECONDS = 60, src/sim/content/professions.ts) caps
// REAL crafting attempts at 10 per rolling window, so every 10 attempts the
// clock is ticked past the window first, or later "attempts" would silently
// return `reason: 'throttled'` with no proc draw at all. A non-proc copy is
// discarded each time (the vestments are equippable, one bag slot) so only
// the winning copy survives for the assertions below.
function craftMasterwork() {
  const sim = new Sim({ seed: PROC_SEED, playerClass: 'warrior', autoEquip: false });
  const pid = sim.playerId;
  const meta = sim.players.get(pid);
  if (!meta) throw new Error('expected a primary player');
  sim.acceptArchetypeQuest('tailoring');
  meta.craftSkills.tailoring = 200;
  const MAX_MASTERWORK_ATTEMPTS = 100;
  const CRAFTS_PER_THROTTLE_WINDOW = 10;
  let attempts = 0;
  while (attempts < MAX_MASTERWORK_ATTEMPTS && !sim.lastMasterwork) {
    if (attempts > 0 && attempts % CRAFTS_PER_THROTTLE_WINDOW === 0) {
      for (let i = 0; i < 20 * 61; i++) sim.tick();
    }
    sim.addItemInstance('linen_scrap', { signer: meta.name }, pid);
    sim.addItem('spider_leg', 1, pid);
    sim.craftItem(RECIPE_ID, pid);
    attempts++;
    if (!sim.lastMasterwork) sim.removeItem(ITEM_ID, 1, pid);
  }
  const events = sim.drainEvents().filter((ev) => ev.type === 'masterwork');
  return { sim, pid, events };
}

// A ClientWorld with no constructor run (Object.create, the established
// bareClient pattern from tests/snapshots.test.ts). Class-field initializers
// do NOT run under Object.create, which is exactly the liveness point: the
// lastMasterwork property only comes to exist when the real event-apply path
// assigns it, so an unwired mirror cannot pass by initializer default.
function bareClient(): ClientWorld {
  const c = Object.create(ClientWorld.prototype) as ClientWorld;
  (c as unknown as { eventQueue: SimEvent[] }).eventQueue = [];
  return c;
}

// Feed one event through the real wire entry point (onMessage -> the
// 'events' branch -> applyMasterworkEvent), never by poking the field.
function feed(client: ClientWorld, ev: unknown): void {
  (client as unknown as { onMessage(raw: string): void }).onMessage(
    JSON.stringify({ t: 'events', list: [ev] }),
  );
}

describe('offline Sim host', () => {
  it('a procced craft emits the id-exact masterwork event and the getter reflects it (seed 18)', () => {
    const { sim, pid, events } = craftMasterwork();
    // Exactly one proc event, ids only, pid = crafter entity id on both keys.
    expect(events).toEqual([
      { type: 'masterwork', recipeId: RECIPE_ID, itemId: ITEM_ID, crafter: pid, pid },
    ]);
    // The IWorld getter (sim.ts, next to lastCraftResult) reflects the stash.
    expect(sim.lastMasterwork).toEqual({ recipeId: RECIPE_ID, itemId: ITEM_ID, crafter: pid });
    // The same craft's craftResult stash stays field-complete on the new flag.
    expect(sim.lastCraftResult?.masterwork).toBe(true);
  });
});

describe('online ClientWorld host', () => {
  it('mirrors lastMasterwork through the real event-apply path and updates on the next event', () => {
    const client = bareClient();
    // No initializer ran: the mirror must be ASSIGNED by the events loop.
    expect((client as unknown as { lastMasterwork?: unknown }).lastMasterwork).toBeUndefined();
    feed(client, { type: 'masterwork', recipeId: RECIPE_ID, itemId: ITEM_ID, crafter: 7, pid: 7 });
    expect(client.lastMasterwork).toEqual({ recipeId: RECIPE_ID, itemId: ITEM_ID, crafter: 7 });
    // Not a one-shot: a later proc replaces the mirror wholesale.
    feed(client, {
      type: 'masterwork',
      recipeId: 'recipe_eastbrook_druids_hide',
      itemId: 'eastbrook_druids_hide',
      crafter: 7,
      pid: 7,
    });
    expect(client.lastMasterwork).toEqual({
      recipeId: 'recipe_eastbrook_druids_hide',
      itemId: 'eastbrook_druids_hide',
      crafter: 7,
    });
    // A non-masterwork event never disturbs the mirror.
    feed(client, { type: 'craftResult', ok: true, recipeId: RECIPE_ID, pid: 7 });
    expect(client.lastMasterwork).toEqual({
      recipeId: 'recipe_eastbrook_druids_hide',
      itemId: 'eastbrook_druids_hide',
      crafter: 7,
    });
    // Both masterwork events still flowed on to the HUD drain untouched.
    const queued = (client as unknown as { eventQueue: SimEvent[] }).eventQueue;
    expect(queued.map((ev) => ev.type)).toEqual(['masterwork', 'masterwork', 'craftResult']);
  });

  it('the craftResult mirror carries the masterwork flag and rebuilds it per event', () => {
    // applyCraftResultEvent (online.ts) must copy the Phase 2 `masterwork`
    // field into the lastCraftResult mirror: a dropped field here would leave
    // the online HUD unable to distinguish a proc, with every other test
    // (Sim-side only) still green.
    const client = bareClient();
    feed(client, {
      type: 'craftResult',
      ok: true,
      recipeId: RECIPE_ID,
      itemId: ITEM_ID,
      count: 1,
      quality: 'uncommon',
      masterwork: true,
      pid: 7,
    });
    expect(client.lastCraftResult?.ok).toBe(true);
    expect(client.lastCraftResult?.quality).toBe('uncommon');
    expect(client.lastCraftResult?.masterwork).toBe(true);
    // The mirror is rebuilt wholesale per event: a later non-proc craft must
    // not inherit the flag from the previous proc.
    feed(client, {
      type: 'craftResult',
      ok: true,
      recipeId: RECIPE_ID,
      itemId: ITEM_ID,
      count: 1,
      quality: 'uncommon',
      pid: 7,
    });
    expect(client.lastCraftResult?.ok).toBe(true);
    expect(client.lastCraftResult?.masterwork).toBeUndefined();
  });
});

describe('host parity', () => {
  it('both hosts expose the identical lastMasterwork view for the same emitted payload', () => {
    const { sim, pid, events } = craftMasterwork();
    const client = bareClient();
    feed(client, events[0]);
    // Field-for-field: pinned literal on each host, then the cross-host check.
    const expected = { recipeId: RECIPE_ID, itemId: ITEM_ID, crafter: pid };
    expect(sim.lastMasterwork).toEqual(expected);
    expect(client.lastMasterwork).toEqual(expected);
    expect(client.lastMasterwork).toEqual(sim.lastMasterwork);
  });
});
