import { describe, expect, it } from 'vitest';
import {
  lightingForTheme,
  lowTierLightingForTheme,
  outdoorFogForTheme,
} from '../src/render/emberwood/lighting';
import { foliagePaletteForTheme, terrainPaletteForTheme } from '../src/render/emberwood/palette';

describe('Emberwood render policy', () => {
  describe('lighting', () => {
    it('returns classic lighting unchanged', () => {
      const classic = lightingForTheme('classic');
      expect(classic.fogColor).toBe(0xa6c6e0);
      // the shipped BASE fog distances the scene is constructed with, preserved
      // exactly when the constructor stopped hardcoding them (see lighting.ts)
      expect(classic.fogNear).toBe(130);
      expect(classic.fogFar).toBe(470);
      expect(classic.sunColor).toBe(0xffedd0);
      expect(classic.sunIntensity).toBe(2.8);
      expect(classic.hemiColor).toBe(0xdcefff);
      expect(classic.hemiGround).toBe(0x465f39);
      expect(classic.hemiIntensity).toBe(0.45);
    });

    it('returns emberwood night lighting: dim cool key, teal sky over ember ground', () => {
      const emberwood = lightingForTheme('emberwood');
      expect(emberwood.fogColor).toBe(0x141d2b);
      expect(emberwood.fogNear).toBe(55);
      expect(emberwood.fogFar).toBe(210);
      expect(emberwood.sunColor).toBe(0xbcd2f0);
      expect(emberwood.sunIntensity).toBe(0.55);
      expect(emberwood.hemiColor).toBe(0x2a4a68);
      expect(emberwood.hemiGround).toBe(0x6b3520);
      expect(emberwood.hemiIntensity).toBe(0.85);
    });
  });

  describe('low graphics tier parity', () => {
    it('gives the low tier its own row per theme', () => {
      expect(lowTierLightingForTheme('classic').sunIntensity).toBe(2.65);
      expect(lowTierLightingForTheme('classic').hemiIntensity).toBe(0.98);
      expect(lowTierLightingForTheme('classic').fogColor).toBe(0xb6cddd);
    });

    it('keeps the low tier at night when the theme is night', () => {
      const low = lowTierLightingForTheme('emberwood');
      const high = lightingForTheme('emberwood');
      // low tier may be cheaper and flatter, but it must still be NIGHT: a daylight
      // low tier would both look wrong and hand low-spec players extra visibility.
      expect(low.sunIntensity).toBeLessThan(1);
      expect(low.fogColor).toBe(high.fogColor);
    });

    it('never lets a tier see substantially more than another', () => {
      for (const theme of ['classic', 'emberwood'] as const) {
        const low = lowTierLightingForTheme(theme);
        const high = lightingForTheme(theme);
        const lowTotal = low.sunIntensity + low.hemiIntensity;
        const highTotal = high.sunIntensity + high.hemiIntensity;
        // within 2x of each other; low is allowed to be flatter (it has no shadows)
        // but not to be a different time of day
        expect(Math.max(lowTotal, highTotal) / Math.min(lowTotal, highTotal), theme).toBeLessThan(
          2,
        );
      }
    });
  });

  describe('outdoor fog resolver', () => {
    const VOLCANO = { color: 0x8a7468, near: 50, far: 220 };
    const PEAKS = { color: 0xbdd3ec, near: 110, far: 390 };

    it('returns the biome preset untouched on classic', () => {
      expect(outdoorFogForTheme(VOLCANO, 'classic')).toEqual(VOLCANO);
      expect(outdoorFogForTheme(PEAKS, 'classic')).toEqual(PEAKS);
    });

    it('applies the night fog colour to every biome on emberwood, not just one', () => {
      expect(outdoorFogForTheme(VOLCANO, 'emberwood').color).toBe(0x141d2b);
      expect(outdoorFogForTheme(PEAKS, 'emberwood').color).toBe(0x141d2b);
    });

    it('tightens each biome distance while preserving its relative depth', () => {
      const volcano = outdoorFogForTheme(VOLCANO, 'emberwood');
      const peaks = outdoorFogForTheme(PEAKS, 'emberwood');
      expect(volcano.near).toBeCloseTo(36, 0);
      expect(volcano.far).toBeCloseTo(158.4, 1);
      // peaks is the airiest biome and must stay airier than volcano after tightening
      expect(peaks.far).toBeGreaterThan(volcano.far);
    });

    it('never returns a far plane inside the near plane', () => {
      for (const preset of [VOLCANO, PEAKS]) {
        const out = outdoorFogForTheme(preset, 'emberwood');
        expect(out.far).toBeGreaterThan(out.near);
      }
    });
  });

  describe('terrain palette', () => {
    it('returns classic Vale terrain colors unchanged', () => {
      const classic = terrainPaletteForTheme('classic').vale;
      expect(classic.grass).toBe(0x548545);
      expect(classic.dirt).toBe(0x8a6f47);
    });

    it('returns emberwood Vale terrain with oak-brown dirt and desaturated greens', () => {
      const emberwood = terrainPaletteForTheme('emberwood').vale;
      expect(emberwood.grass).toBe(0x5a7a4a);
      expect(emberwood.grassDark).toBe(0x3d5a33);
      expect(emberwood.grassYellow).toBe(0x7a8a4a);
      expect(emberwood.dirt).toBe(0x8a6845);
      expect(emberwood.sand).toBe(0xb8a080);
    });

    it('keeps non-Vale biomes at their classic values in emberwood mode', () => {
      const palette = terrainPaletteForTheme('emberwood');
      expect(palette.marsh.grass).toBe(0x3f4d28);
      expect(palette.peaks.grass).toBe(0x7a8878);
    });
  });

  describe('foliage palette', () => {
    it('returns classic Vale foliage tints unchanged', () => {
      const classic = foliagePaletteForTheme('classic');
      expect(classic.oak.vale).toBe(0xa7b886);
      expect(classic.pine.vale).toBe(0x9bb48d);
      expect(classic.rock.vale).toBe(0x8d8d85);
    });

    it('returns emberwood Vale foliage: autumn oak with muted green pine and grey rock', () => {
      const emberwood = foliagePaletteForTheme('emberwood');
      // Oak is a deliberate ember/autumn accent (warm brown) in the emberwood
      // theme; pine and rock stay muted green/grey (palette.ts oak/pine/rock vale).
      expect(emberwood.oak.vale).toBe(0xb8783c);
      expect(emberwood.pine.vale).toBe(0x7f9a78);
      expect(emberwood.rock.vale).toBe(0x8a8a88);
      expect(emberwood.trunk.vale).toBe(0xd4c0a8);
      expect(emberwood.grass.vale).toBe(0xc8d4a8);
    });

    it('keeps non-Vale biomes at classic tints in emberwood mode', () => {
      const palette = foliagePaletteForTheme('emberwood');
      expect(palette.oak.marsh).toBe(0x8d9865);
      expect(palette.pine.peaks).toBe(0x6f8a7a);
    });
  });
});
