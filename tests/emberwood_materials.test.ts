import { describe, expect, it } from 'vitest';
import { materialOverridesForTheme } from '../src/render/emberwood/materials';

describe('Emberwood material overrides', () => {
  it('leaves classic overrides untouched: windows stay the cold blue', () => {
    const classic = materialOverridesForTheme('classic');
    expect(classic['village:Windows']).toEqual({
      emissive: 0x2a3c55,
      emissiveIntensity: 1.1,
      roughness: 0.4,
    });
  });

  it('retints emberwood windows to hot amber so dark mass reads as lit from within', () => {
    const ember = materialOverridesForTheme('emberwood');
    expect(ember['village:Windows']).toEqual({
      emissive: 0xff9a3c,
      emissiveIntensity: 3.2,
      roughness: 0.4,
    });
  });

  it('carries every non-window classic entry through unchanged on emberwood', () => {
    const classic = materialOverridesForTheme('classic');
    const ember = materialOverridesForTheme('emberwood');
    for (const key of Object.keys(classic)) {
      if (key === 'village:Windows') continue;
      expect(ember[key], key).toEqual(classic[key]);
    }
  });

  it('adds no keys that classic does not have', () => {
    expect(Object.keys(materialOverridesForTheme('emberwood')).sort()).toEqual(
      Object.keys(materialOverridesForTheme('classic')).sort(),
    );
  });
});
