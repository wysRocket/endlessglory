import { describe, expect, it } from 'vitest';
import { moteProfileForTheme } from '../src/render/emberwood/motes';

describe('Emberwood mote profile', () => {
  it('leaves classic at the shipped density and low ceiling', () => {
    expect(moteProfileForTheme('classic')).toEqual({ countScale: 1, ceil: 3.4 });
  });

  it('raises emberwood density and lets embers climb higher', () => {
    expect(moteProfileForTheme('emberwood')).toEqual({ countScale: 1.6, ceil: 7 });
  });

  it('never returns a countScale below the classic baseline', () => {
    for (const theme of ['classic', 'emberwood'] as const) {
      expect(moteProfileForTheme(theme).countScale).toBeGreaterThanOrEqual(1);
    }
  });
});
