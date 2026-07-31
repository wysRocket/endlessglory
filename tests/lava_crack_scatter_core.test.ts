import { describe, expect, it } from 'vitest';
import { planLavaCracks } from '../src/render/lava_crack_scatter_core';

const BASE_INPUT = {
  zMin: -180,
  zMax: 180,
  xHalfWidth: 150,
  cellSize: 42,
  spawnChance: 0.22,
  exclusions: [{ x: 0, z: 0, radius: 36 }],
};

describe('planLavaCracks', () => {
  it('is deterministic for the same input', () => {
    expect(planLavaCracks(BASE_INPUT)).toEqual(planLavaCracks(BASE_INPUT));
  });

  it('produces a modest, non-empty scatter across the given bounds', () => {
    const plan = planLavaCracks(BASE_INPUT);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.length).toBeLessThan(80);
    for (const p of plan) {
      expect(p.x).toBeGreaterThanOrEqual(-BASE_INPUT.xHalfWidth);
      expect(p.x).toBeLessThanOrEqual(BASE_INPUT.xHalfWidth);
      expect(p.z).toBeGreaterThanOrEqual(BASE_INPUT.zMin);
      expect(p.z).toBeLessThanOrEqual(BASE_INPUT.zMax);
    }
  });

  it('never places a crack inside an exclusion circle', () => {
    const plan = planLavaCracks(BASE_INPUT);
    for (const p of plan) {
      for (const ex of BASE_INPUT.exclusions) {
        expect(Math.hypot(p.x - ex.x, p.z - ex.z)).toBeGreaterThanOrEqual(ex.radius);
      }
    }
  });

  it('produces no cracks at all when spawnChance is 0', () => {
    const plan = planLavaCracks({ ...BASE_INPUT, spawnChance: 0 });
    expect(plan).toHaveLength(0);
  });

  it('produces a rotation and scale for every crack', () => {
    const plan = planLavaCracks(BASE_INPUT);
    for (const p of plan) {
      expect(Number.isFinite(p.rot)).toBe(true);
      expect(p.scale).toBeGreaterThan(0);
    }
  });

  it('defaults to the original 1.4-3.2 scale range when scaleMin/scaleRange are omitted', () => {
    const plan = planLavaCracks(BASE_INPUT);
    for (const p of plan) {
      expect(p.scale).toBeGreaterThanOrEqual(1.4);
      expect(p.scale).toBeLessThanOrEqual(3.2);
    }
  });

  it('honors a custom scaleMin/scaleRange for larger decals (e.g. lava pools)', () => {
    const plan = planLavaCracks({ ...BASE_INPUT, scaleMin: 4.5, scaleRange: 3.0 });
    expect(plan.length).toBeGreaterThan(0);
    for (const p of plan) {
      expect(p.scale).toBeGreaterThanOrEqual(4.5);
      expect(p.scale).toBeLessThanOrEqual(7.5);
    }
  });
});
