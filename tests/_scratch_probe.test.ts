// SCRATCH probe: how many rng draws does a fresh Sim consume at seed 4242?
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/rng';
import { Sim } from '../src/sim/sim';

describe('construction draw count', () => {
  it('reports it', () => {
    const sim = new Sim({ seed: 4242, playerClass: 'warrior', autoEquip: true });
    const target = (sim.rng as unknown as { s: number }).s >>> 0;
    const probe = new Rng(4242);
    let n = -1;
    for (let i = 0; i <= 200000; i++) {
      if (((probe as unknown as { s: number }).s >>> 0) === target) {
        n = i;
        break;
      }
      probe.next();
    }
    console.log('CONSTRUCTION_DRAWS', n);
    expect(n).toBeGreaterThanOrEqual(0);
  });
});
