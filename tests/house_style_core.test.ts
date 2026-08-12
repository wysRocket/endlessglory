import { describe, expect, it } from 'vitest';
import {
  HOUSE_BODY_METALNESS_MAX,
  HOUSE_LIGHTNESS_MAX,
  HOUSE_LIGHTNESS_MIN,
  HOUSE_MAPPED_LIGHTNESS_MIN,
  HOUSE_ROUGHNESS_MAX,
  HOUSE_ROUGHNESS_MIN,
  HOUSE_SATURATION_MAX,
  HOUSE_WEAPON_METALNESS_MAX,
  type HouseStyleSource,
  houseColor,
  houseFlatShading,
  houseSpecular,
  houseStyle,
  rgbToHsl,
} from '../src/render/house_style_core';

// The core speaks LINEAR rgb (three's working colour space) but disciplines the
// palette in perceptual sRGB-encoded HSL, so the test re-encodes before reading
// hue/saturation/lightness back out. Same transfer function as the core.
function encodeSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

function decodeSrgb(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function hslOf(c: { r: number; g: number; b: number }) {
  return rgbToHsl(encodeSrgb(c.r), encodeSrgb(c.g), encodeSrgb(c.b));
}

/** A linear-rgb colour authored as perceptual HSL, the way an artist picks it. */
function linearFromHsl(h: number, s: number, l: number): { r: number; g: number; b: number } {
  // Reuse the core's own inverse via a round trip through houseColor's input
  // contract: build sRGB by hand so the fixture never depends on the policy.
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (tRaw: number): number => {
    const t = tRaw < 0 ? tRaw + 1 : tRaw > 1 ? tRaw - 1 : tRaw;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) return { r: decodeSrgb(l), g: decodeSrgb(l), b: decodeSrgb(l) };
  return {
    r: decodeSrgb(channel(h + 1 / 3)),
    g: decodeSrgb(channel(h)),
    b: decodeSrgb(channel(h - 1 / 3)),
  };
}

describe('house style band constants', () => {
  // Pinned to literals on purpose: these ARE the unified look. A silent widening
  // (someone "just" relaxing the gloss floor or the saturation cap) re-splits the
  // roster back into nine art lineages, and must fail here rather than on screen.
  it('pins every band to its literal', () => {
    expect(HOUSE_ROUGHNESS_MIN).toBe(0.55);
    expect(HOUSE_ROUGHNESS_MAX).toBe(0.9);
    expect(HOUSE_BODY_METALNESS_MAX).toBe(0.06);
    expect(HOUSE_WEAPON_METALNESS_MAX).toBe(0.35);
    expect(HOUSE_SATURATION_MAX).toBe(0.55);
    expect(HOUSE_LIGHTNESS_MIN).toBe(0.22);
    expect(HOUSE_LIGHTNESS_MAX).toBe(0.78);
    expect(HOUSE_MAPPED_LIGHTNESS_MIN).toBe(0.35);
  });

  it('keeps the bands non-degenerate (a floor below its ceiling)', () => {
    expect(HOUSE_ROUGHNESS_MIN).toBeLessThan(HOUSE_ROUGHNESS_MAX);
    expect(HOUSE_LIGHTNESS_MIN).toBeLessThan(HOUSE_LIGHTNESS_MAX);
    expect(HOUSE_BODY_METALNESS_MAX).toBeLessThan(HOUSE_WEAPON_METALNESS_MAX);
  });
});

describe('houseSpecular (a: specular normalization)', () => {
  it('drags the glossy painterly outlier up into the house gloss band', () => {
    const out = houseSpecular(0.05, 0.9, 'body');
    expect(out.roughness).toBe(HOUSE_ROUGHNESS_MIN);
    expect(out.metalness).toBe(HOUSE_BODY_METALNESS_MAX);
  });

  it('pulls a chalky flat-shaded kit material down under the ceiling', () => {
    expect(houseSpecular(1, 0, 'body').roughness).toBe(HOUSE_ROUGHNESS_MAX);
  });

  it('leaves an in-band value untouched', () => {
    const out = houseSpecular(0.7, 0.03, 'body');
    expect(out.roughness).toBe(0.7);
    expect(out.metalness).toBe(0.03);
  });

  it('lets weapons keep a blade highlight bodies never get', () => {
    expect(houseSpecular(0.4, 0.9, 'weapon').metalness).toBe(HOUSE_WEAPON_METALNESS_MAX);
    expect(houseSpecular(0.4, 0.9, 'body').metalness).toBe(HOUSE_BODY_METALNESS_MAX);
  });
});

describe('houseColor (b: palette harmonization)', () => {
  it('caps a screaming saturated colour and keeps lightness in band', () => {
    const loud = linearFromHsl(0.02, 1, 0.94);
    const out = hslOf(houseColor(loud.r, loud.g, loud.b, false));
    expect(out.s).toBeLessThanOrEqual(HOUSE_SATURATION_MAX + 1e-9);
    expect(out.l).toBeLessThanOrEqual(HOUSE_LIGHTNESS_MAX + 1e-9);
    expect(out.l).toBeGreaterThanOrEqual(HOUSE_LIGHTNESS_MIN - 1e-9);
  });

  it('lifts a crushed near-black colour off the floor', () => {
    const murk = linearFromHsl(0.6, 0.8, 0.03);
    const out = hslOf(houseColor(murk.r, murk.g, murk.b, false));
    expect(out.l).toBeCloseTo(HOUSE_LIGHTNESS_MIN, 6);
  });

  it('leaves a mapped material its neutral white multiplier (ceiling lifted)', () => {
    // A hand-painted albedo carries the surface; dimming its multiplier would
    // just darken the authored art, so only the floor applies to mapped colours.
    const out = houseColor(1, 1, 1, true);
    expect(out.r).toBeCloseTo(1, 9);
    expect(out.g).toBeCloseTo(1, 9);
    expect(out.b).toBeCloseTo(1, 9);
    // The same colour unmapped IS pulled down to the band ceiling.
    expect(hslOf(houseColor(1, 1, 1, false)).l).toBeCloseTo(HOUSE_LIGHTNESS_MAX, 6);
  });

  it('still floors a mapped multiplier so a dark tint cannot crush the texture', () => {
    const dark = linearFromHsl(0.1, 0.2, 0.04);
    expect(hslOf(houseColor(dark.r, dark.g, dark.b, true)).l).toBeCloseTo(
      HOUSE_MAPPED_LIGHTNESS_MIN,
      6,
    );
  });
});

describe('per-entity tint survives normalization (hue is never quantized)', () => {
  // The game tells mob templates apart by their tint. If the policy snapped hue
  // to a fixed palette, two templates would collapse into one appearance.
  it('keeps two inputs that differ only in hue distinct afterwards', () => {
    const a = linearFromHsl(0.05, 0.95, 0.9);
    const b = linearFromHsl(0.55, 0.95, 0.9);
    const outA = hslOf(houseColor(a.r, a.g, a.b, false));
    const outB = hslOf(houseColor(b.r, b.g, b.b, false));
    expect(outA.h).toBeCloseTo(0.05, 5);
    expect(outB.h).toBeCloseTo(0.55, 5);
    expect(Math.abs(outA.h - outB.h)).toBeGreaterThan(0.4);
  });

  it('preserves ordering between two tints that both sit inside the cap', () => {
    const dull = linearFromHsl(0.3, 0.18, 0.5);
    const richer = linearFromHsl(0.3, 0.42, 0.5);
    const outDull = hslOf(houseColor(dull.r, dull.g, dull.b, false));
    const outRicher = hslOf(houseColor(richer.r, richer.g, richer.b, false));
    expect(outDull.s).toBeCloseTo(0.18, 5);
    expect(outRicher.s).toBeCloseTo(0.42, 5);
  });

  it('never desaturates a hued colour all the way to grey (hue would be lost)', () => {
    const loud = linearFromHsl(0.77, 1, 0.5);
    expect(hslOf(houseColor(loud.r, loud.g, loud.b, false)).s).toBeGreaterThan(0.4);
  });
});

describe('houseFlatShading (c: flat shading)', () => {
  it('facets bodies and leaves weapons smooth', () => {
    expect(houseFlatShading('body')).toBe(true);
    expect(houseFlatShading('weapon')).toBe(false);
  });
});

describe('houseStyle (the whole policy)', () => {
  const GLOSSY_LOUD: HouseStyleSource = (() => {
    const c = linearFromHsl(0.08, 0.98, 0.93);
    return { ...c, roughness: 0.04, metalness: 0.85, hasMap: false, role: 'body' };
  })();

  it('lands a glossy, highly saturated input inside the house bands on every axis', () => {
    const out = houseStyle(GLOSSY_LOUD);
    expect(out.roughness).toBeGreaterThanOrEqual(HOUSE_ROUGHNESS_MIN);
    expect(out.roughness).toBeLessThanOrEqual(HOUSE_ROUGHNESS_MAX);
    expect(out.metalness).toBeLessThanOrEqual(HOUSE_BODY_METALNESS_MAX);
    const hsl = hslOf(out);
    expect(hsl.s).toBeLessThanOrEqual(HOUSE_SATURATION_MAX + 1e-9);
    expect(hsl.l).toBeGreaterThanOrEqual(HOUSE_LIGHTNESS_MIN - 1e-9);
    expect(hsl.l).toBeLessThanOrEqual(HOUSE_LIGHTNESS_MAX + 1e-9);
    expect(out.flatShading).toBe(true);
  });

  it('leaves an already-compliant input materially alone', () => {
    const compliant = linearFromHsl(0.42, 0.3, 0.5);
    const src: HouseStyleSource = {
      ...compliant,
      roughness: 0.72,
      metalness: 0.02,
      hasMap: false,
      role: 'body',
    };
    const out = houseStyle(src);
    expect(out.roughness).toBe(0.72);
    expect(out.metalness).toBe(0.02);
    expect(out.r).toBeCloseTo(src.r, 6);
    expect(out.g).toBeCloseTo(src.g, 6);
    expect(out.b).toBeCloseTo(src.b, 6);
  });

  it('is idempotent: a second application changes nothing', () => {
    for (const role of ['body', 'weapon'] as const) {
      for (const hasMap of [false, true]) {
        const once = houseStyle({ ...GLOSSY_LOUD, role, hasMap });
        const twice = houseStyle({ ...once, hasMap, role });
        expect(twice.roughness, `${role}/${hasMap}`).toBe(once.roughness);
        expect(twice.metalness, `${role}/${hasMap}`).toBe(once.metalness);
        expect(twice.flatShading, `${role}/${hasMap}`).toBe(once.flatShading);
        expect(twice.r, `${role}/${hasMap}`).toBeCloseTo(once.r, 6);
        expect(twice.g, `${role}/${hasMap}`).toBeCloseTo(once.g, 6);
        expect(twice.b, `${role}/${hasMap}`).toBeCloseTo(once.b, 6);
      }
    }
  });

  it('normalizes a pure grey without inventing a hue', () => {
    const out = houseStyle({
      r: 1,
      g: 1,
      b: 1,
      roughness: 0.1,
      metalness: 1,
      hasMap: false,
      role: 'body',
    });
    expect(out.r).toBeCloseTo(out.g, 9);
    expect(out.g).toBeCloseTo(out.b, 9);
    expect(hslOf(out).s).toBe(0);
  });
});
