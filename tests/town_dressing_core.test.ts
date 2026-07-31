import { describe, expect, it } from 'vitest';
import { planTownDressing } from '../src/render/town_dressing_core';
import { ZONE1_PROPS, ZONE1_ZONE } from '../src/sim/content/zone1';

const HUB = ZONE1_ZONE.hub;

function plan() {
  return planTownDressing({
    hub: HUB,
    buildings: ZONE1_PROPS.buildings,
    stalls: ZONE1_PROPS.stalls,
    wells: ZONE1_PROPS.wells,
    campfires: ZONE1_PROPS.campfires,
  });
}

describe('planTownDressing', () => {
  it('is deterministic for the same input', () => {
    expect(plan()).toEqual(plan());
  });

  it('builds a plaza smaller than the town hub radius', () => {
    const p = plan();
    expect(p.plaza.radius).toBeGreaterThan(0);
    expect(p.plaza.radius).toBeLessThan(HUB.radius);
  });

  it('only paths anchors outside the plaza, each ending at a real building or stall', () => {
    const p = plan();
    const anchors = [
      ...ZONE1_PROPS.buildings.map((b) => ({ x: b.x, z: b.z })),
      ...ZONE1_PROPS.stalls.map((s) => ({ x: s.x, z: s.z })),
    ];
    expect(p.paths.length).toBeGreaterThan(0);
    for (const path of p.paths) {
      const distFromHub = Math.hypot(path.to.x - HUB.x, path.to.z - HUB.z);
      expect(distFromHub).toBeGreaterThan(p.plaza.radius);
      expect(anchors.some((a) => a.x === path.to.x && a.z === path.to.z)).toBe(true);
    }
  });

  it('keeps every lantern at least 3 units from every building and stall', () => {
    const p = plan();
    const obstacles = [
      ...ZONE1_PROPS.buildings.map((b) => ({ x: b.x, z: b.z })),
      ...ZONE1_PROPS.stalls.map((s) => ({ x: s.x, z: s.z })),
    ];
    expect(p.lanterns.length).toBeGreaterThan(0);
    for (const lantern of p.lanterns) {
      for (const o of obstacles) {
        expect(Math.hypot(o.x - lantern.x, o.z - lantern.z)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("produces one dressing entry per in-hub building, at that building's own position", () => {
    const p = plan();
    expect(p.buildingDressing).toHaveLength(ZONE1_PROPS.buildings.length);
    for (const dressing of p.buildingDressing) {
      const source = ZONE1_PROPS.buildings.find((b) => b.x === dressing.x && b.z === dressing.z);
      expect(source).toBeDefined();
      expect(dressing.kind).toBe(source!.kind);
    }
  });

  it("keeps every building's banner/flower-box offset clear of every OTHER building's footprint", () => {
    const p = plan();
    for (const d of p.buildingDressing) {
      const cos = Math.cos(d.rot);
      const sin = Math.sin(d.rot);
      const toWorld = (local: { x: number; z: number }) => ({
        x: d.x + local.x * cos + local.z * sin,
        z: d.z - local.x * sin + local.z * cos,
      });
      const bannerWorld = toWorld(d.bannerLocal);
      const flowerWorld = toWorld(d.flowerBoxLocal);
      for (const other of ZONE1_PROPS.buildings) {
        if (other.x === d.x && other.z === d.z) continue;
        const otherHalfDiag = Math.hypot(other.w, other.d) / 2;
        expect(Math.hypot(bannerWorld.x - other.x, bannerWorld.z - other.z)).toBeGreaterThan(
          otherHalfDiag,
        );
        expect(Math.hypot(flowerWorld.x - other.x, flowerWorld.z - other.z)).toBeGreaterThan(
          otherHalfDiag,
        );
      }
    }
  });

  it('only rings the one in-town campfire, not the far-away camp/mine fires', () => {
    const p = plan();
    expect(p.campfireRings).toHaveLength(1);
    expect(p.campfireRings[0].x).toBe(3);
    expect(p.campfireRings[0].z).toBe(-4);
  });

  it('produces one well ring per in-hub well, radius offset from the well radius', () => {
    const p = plan();
    expect(p.wellRings).toHaveLength(ZONE1_PROPS.wells.length);
    for (const ring of p.wellRings) {
      const source = ZONE1_PROPS.wells.find((w) => w.x === ring.x && w.z === ring.z);
      expect(source).toBeDefined();
      expect(ring.radius).toBeCloseTo(source!.r + 1.4);
    }
  });

  it("produces one awning per in-hub stall, at that stall's own position and rotation", () => {
    const p = plan();
    expect(p.stallAwnings).toHaveLength(ZONE1_PROPS.stalls.length);
    for (const awning of p.stallAwnings) {
      const source = ZONE1_PROPS.stalls.find((s) => s.x === awning.x && s.z === awning.z);
      expect(source).toBeDefined();
      expect(awning.rot).toBe(source!.rot);
    }
  });

  it('assigns each building dressing entry the roof height for its own kind', () => {
    const p = plan();
    const expectedHeight: Record<string, number> = { house: 7.4, inn: 7.0, chapel: 9.6 };
    for (const dressing of p.buildingDressing) {
      expect(dressing.bannerHeight).toBe(expectedHeight[dressing.kind]);
    }
  });
});
