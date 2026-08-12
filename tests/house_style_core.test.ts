import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HOUSE_BODY_METALNESS_MAX,
  HOUSE_LIGHTNESS_MAX,
  HOUSE_LIGHTNESS_MIN,
  HOUSE_MAPPED_LIGHTNESS_MIN,
  HOUSE_ROUGHNESS_MAX,
  HOUSE_ROUGHNESS_MIN,
  HOUSE_SATURATION_KNEE,
  HOUSE_SATURATION_MAX,
  HOUSE_WEAPON_METALNESS_MAX,
  type HouseStyleSource,
  houseColor,
  houseFlatShading,
  houseSaturation,
  houseSpecular,
  houseStyle,
  hslToRgb,
  rgbToHsl,
} from '../src/render/house_style_core';
import { MOBS } from '../src/sim/data';

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
    expect(HOUSE_ROUGHNESS_MIN).toBe(0.45);
    expect(HOUSE_ROUGHNESS_MAX).toBe(0.9);
    expect(HOUSE_BODY_METALNESS_MAX).toBe(0.06);
    expect(HOUSE_WEAPON_METALNESS_MAX).toBe(0.35);
    expect(HOUSE_SATURATION_KNEE).toBe(0.5);
    expect(HOUSE_SATURATION_MAX).toBe(0.68);
    expect(HOUSE_LIGHTNESS_MIN).toBe(0.22);
    expect(HOUSE_LIGHTNESS_MAX).toBe(0.78);
    expect(HOUSE_MAPPED_LIGHTNESS_MIN).toBe(0.35);
  });

  it('keeps the bands non-degenerate (a floor below its ceiling)', () => {
    expect(HOUSE_ROUGHNESS_MIN).toBeLessThan(HOUSE_ROUGHNESS_MAX);
    expect(HOUSE_LIGHTNESS_MIN).toBeLessThan(HOUSE_LIGHTNESS_MAX);
    expect(HOUSE_BODY_METALNESS_MAX).toBeLessThan(HOUSE_WEAPON_METALNESS_MAX);
    expect(HOUSE_SATURATION_KNEE).toBeLessThan(HOUSE_SATURATION_MAX);
  });

  it('keeps the gloss floor under the roster it disciplines', () => {
    // The Meshy/Tripo creature lineage (demon, demonalt, frog/murloc, orc/troll,
    // yeti/bear, goleling/elemental, dragon, spearjaw) all author roughness
    // 0.415087..., and the KayKit humanoids author 0.5. A floor above those does
    // not unify anything; it just deletes every hard surface's highlight, which
    // is exactly the specular cue the stone/crystal/metal constructs read by.
    // Pinned to the authored value: the floor may nudge that lineage, never
    // haul it. At the old 0.55 the lift was 0.135 and the GGX lobe widened 76%.
    const MESHY_AUTHORED_ROUGHNESS = 0.415087103843689;
    expect(HOUSE_ROUGHNESS_MIN - MESHY_AUTHORED_ROUGHNESS).toBeLessThan(0.05);
    // But it must still be far above the one painterly outlier (the water
    // elemental authors 0.08), which is what the floor exists for.
    expect(HOUSE_ROUGHNESS_MIN).toBeGreaterThan(0.08 * 4);
  });
});

describe('houseSaturation (the soft ceiling)', () => {
  it('passes a muted tint through untouched', () => {
    for (const s of [0, 0.1, 0.25, 0.42, HOUSE_SATURATION_KNEE]) {
      expect(houseSaturation(s)).toBe(s);
    }
  });

  it('never reaches the ceiling, however loud the input', () => {
    for (const s of [0.6, 0.8, 0.95, 1]) {
      expect(houseSaturation(s)).toBeLessThan(HOUSE_SATURATION_MAX);
      expect(houseSaturation(s)).toBeGreaterThan(HOUSE_SATURATION_KNEE);
    }
    // and it really does discipline a screaming primary
    expect(houseSaturation(1)).toBeLessThan(0.7);
  });

  it('is STRICTLY increasing, which a clamp is not', () => {
    // The whole point: two loud tints must not land on the same chroma. A hard
    // clamp maps every s above the cap to one value; the knee never does.
    let prev = -1;
    for (let s = 0; s <= 1.0000001; s += 0.005) {
      const out = houseSaturation(Math.min(s, 1));
      expect(out).toBeGreaterThan(prev);
      prev = out;
    }
    // Teeth: two distinct loud inputs keep a real, not merely nonzero, gap.
    expect(houseSaturation(0.95) - houseSaturation(0.7)).toBeGreaterThan(0.01);
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

  it('keeps two LOUD tints apart in chroma, where a hard clamp merged them', () => {
    // The regression this replaced: with a clamp, every tint above the ceiling
    // came out at exactly the ceiling, so two templates sharing a mesh and
    // differing only in how saturated their tint is became the same colour.
    const loud = linearFromHsl(0.05, 0.72, 0.5);
    const louder = linearFromHsl(0.05, 0.98, 0.5);
    const outLoud = hslOf(houseColor(loud.r, loud.g, loud.b, false));
    const outLouder = hslOf(houseColor(louder.r, louder.g, louder.b, false));
    expect(outLoud.s).toBeLessThan(outLouder.s);
    expect(outLouder.s - outLoud.s).toBeGreaterThan(0.02);
    // both still disciplined: neither escapes the house ceiling
    expect(outLouder.s).toBeLessThan(HOUSE_SATURATION_MAX);
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

  it('is idempotent on the specular, faceting and hue axes', () => {
    for (const role of ['body', 'weapon'] as const) {
      for (const hasMap of [false, true]) {
        const once = houseStyle({ ...GLOSSY_LOUD, role, hasMap });
        const twice = houseStyle({ ...once, hasMap, role });
        expect(twice.roughness, `${role}/${hasMap}`).toBe(once.roughness);
        expect(twice.metalness, `${role}/${hasMap}`).toBe(once.metalness);
        expect(twice.flatShading, `${role}/${hasMap}`).toBe(once.flatShading);
        // hue is never touched by either pass
        expect(hslOf(twice).h, `${role}/${hasMap}`).toBeCloseTo(hslOf(once).h, 6);
      }
    }
  });

  it('is idempotent on colour too whenever the saturation sits under the knee', () => {
    // Which is the entire muted majority of the roster: the knee only bites the
    // handful of loud tints, and everything below it is still a pure clamp.
    const muted = linearFromHsl(0.42, 0.31, 0.62);
    for (const hasMap of [false, true]) {
      const once = houseStyle({ ...muted, roughness: 0.6, metalness: 0.02, hasMap, role: 'body' });
      const twice = houseStyle({ ...once, hasMap, role: 'body' });
      expect(twice.r, `${hasMap}`).toBeCloseTo(once.r, 9);
      expect(twice.g, `${hasMap}`).toBeCloseTo(once.g, 9);
      expect(twice.b, `${hasMap}`).toBeCloseTo(once.b, 9);
    }
  });

  it('bounds the knee drift when a loud colour IS re-styled, and stays in band', () => {
    // A strictly increasing ceiling cannot also fix its own image, so a second
    // pass on an already-styled loud colour walks it a little further down.
    // Nothing in the codebase re-applies (both consumers style a fresh clone of
    // a pristine source), so the guarantee that matters is that the drift is
    // small, one-directional, and can never leave the band.
    const once = houseStyle(GLOSSY_LOUD);
    const twice = houseStyle({ ...once, hasMap: false, role: 'body' });
    const s1 = hslOf(once).s;
    const s2 = hslOf(twice).s;
    expect(s2).toBeLessThan(s1);
    expect(s1 - s2).toBeLessThan(HOUSE_SATURATION_MAX - HOUSE_SATURATION_KNEE);
    expect(s2).toBeGreaterThan(HOUSE_SATURATION_KNEE);
    expect(hslOf(twice).l).toBeGreaterThanOrEqual(HOUSE_LIGHTNESS_MIN - 1e-9);
    expect(hslOf(twice).l).toBeLessThanOrEqual(HOUSE_LIGHTNESS_MAX + 1e-9);
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

// ---------------------------------------------------------------------------
// The regression pin: shared-mesh templates must stay TELLABLE APART.
//
// Many mob templates are one recoloured mesh, and the per-entity tint is the
// ONLY thing that separates them: the demonalt glb carries five demons, the
// giant glb carries six ogres. A palette rule that squeezes those tints toward
// each other is not a stylization, it is a readability bug, so this measures the
// real thing end to end: the real template colours out of src/sim/content,
// lerped into the real glb base materials at the real authored tint strength,
// through the real policy, scored as CIE76 dE in CIELAB.
// ---------------------------------------------------------------------------

/** The glb json chunk carries the authored material factors; that is all this
 *  needs, so it parses the header rather than pulling in a gltf loader. */
function glbBodyMaterials(rel: string): {
  name: string;
  r: number;
  g: number;
  b: number;
  hasMap: boolean;
}[] {
  const buf = readFileSync(join(__dirname, '..', rel));
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')) as {
    materials?: {
      name?: string;
      pbrMetallicRoughness?: { baseColorFactor?: number[]; baseColorTexture?: unknown };
    }[];
  };
  return (json.materials ?? []).map((m) => {
    const p = m.pbrMetallicRoughness ?? {};
    const f = p.baseColorFactor ?? [1, 1, 1, 1];
    return {
      name: m.name ?? '(unnamed)',
      r: f[0],
      g: f[1],
      b: f[2],
      hasMap: p.baseColorTexture != null,
    };
  });
}

/** CIELAB (D65) from LINEAR rgb, and the CIE76 distance over it. dE76 of ~2.3 is
 *  the just-noticeable difference; ~10 is "obviously two different colours". */
function toLab(c: { r: number; g: number; b: number }): { L: number; a: number; b: number } {
  const x = 0.4124564 * c.r + 0.3575761 * c.g + 0.1804375 * c.b;
  const y = 0.2126729 * c.r + 0.7151522 * c.g + 0.072175 * c.b;
  const z = 0.0193339 * c.r + 0.119192 * c.g + 0.9503041 * c.b;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const fx = f(x / 0.95047);
  const fy = f(y);
  const fz = f(z / 1.08883);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function deltaE76(
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number },
) {
  const a = toLab(c1);
  const b = toLab(c2);
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}

const linearFromHex = (hex: number) => ({
  r: decodeSrgb(((hex >> 16) & 255) / 255),
  g: decodeSrgb(((hex >> 8) & 255) / 255),
  b: decodeSrgb((hex & 255) / 255),
});

/** The same lerp `applyTemplateTint` does, in the same linear space. */
function tinted(
  base: { r: number; g: number; b: number },
  hex: number,
  strength: number,
): { r: number; g: number; b: number } {
  const t = linearFromHex(hex);
  return {
    r: base.r + (t.r - base.r) * strength,
    g: base.g + (t.g - base.g) * strength,
    b: base.b + (t.b - base.b) * strength,
  };
}

/** The policy as it stood before the knee: saturation HARD CLAMPED to 0.55.
 *  Kept here only so the assertions below can be shown to have teeth. */
function hardClampedColor(
  r: number,
  g: number,
  b: number,
  hasMap: boolean,
): { r: number; g: number; b: number } {
  const hsl = rgbToHsl(encodeSrgb(r), encodeSrgb(g), encodeSrgb(b));
  const lightMin = hasMap ? HOUSE_MAPPED_LIGHTNESS_MIN : HOUSE_LIGHTNESS_MIN;
  const lightMax = hasMap ? 1 : HOUSE_LIGHTNESS_MAX;
  const out = hslToRgb(hsl.h, Math.min(hsl.s, 0.55), Math.min(lightMax, Math.max(lightMin, hsl.l)));
  return { r: decodeSrgb(out.r), g: decodeSrgb(out.g), b: decodeSrgb(out.b) };
}

// The two shared meshes named in src/render/characters/manifest.ts: every demon
// falls to `mob_demonalt` (demonalt.glb) and every ogre to `mob_ogre`
// (giant.glb). The tint strengths are the VisualDef values from that manifest.
const SHARED_MESHES = [
  {
    visualKey: 'mob_demonalt',
    glb: 'public/models/creatures/demonalt.glb',
    tintStrength: 0.35,
    // The body surface: untextured, so its colour IS what the player sees.
    bodyMaterial: 'Demon_Main',
    templates: ['warlock_voidwalker', 'spellhound', 'warfiend', 'pyre_colossus', 'wraithborn'],
  },
  {
    visualKey: 'mob_ogre',
    glb: 'public/models/creatures/giant.glb',
    tintStrength: 0.2,
    bodyMaterial: 'Atlas.001',
    templates: [
      'thornpeak_ogre',
      'ogre_crusher',
      'warlord_drogmar',
      'brutok_skullsmasher',
      'korgath_the_bound',
      'grave_silt_bulwark',
    ],
  },
] as const;

/** The floor an UNTEXTURED shared-mesh pair must clear after the policy runs.
 *  Well over the ~2.3 dE76 just-noticeable difference, because these have to
 *  read apart at Dungeon Finder portrait size, not under a loupe. */
const MIN_SHARED_MESH_SEPARATION = 8;
/** And no pair, textured or not, may lose more than this share of the
 *  separation its authored tints started with. */
const MIN_SEPARATION_RETENTION = 0.85;

describe('real shared-mesh templates stay perceptually separable', () => {
  for (const mesh of SHARED_MESHES) {
    const mats = glbBodyMaterials(mesh.glb);
    const body = mats.find((m) => m.name === mesh.bodyMaterial);

    it(`${mesh.visualKey}: the glb still has its ${mesh.bodyMaterial} surface`, () => {
      expect(body, `${mesh.glb} lost ${mesh.bodyMaterial}`).toBeDefined();
    });

    it(`${mesh.visualKey}: every template still exists with a colour`, () => {
      for (const id of mesh.templates) {
        expect(MOBS[id], id).toBeDefined();
        expect(typeof MOBS[id].color, id).toBe('number');
      }
    });

    it(`${mesh.visualKey}: the policy keeps every tint pair apart`, () => {
      const surface = body ?? mats[0];
      const styled = mesh.templates.map((id) => {
        const before = tinted(surface, MOBS[id].color as number, mesh.tintStrength);
        return { id, before, after: houseColor(before.r, before.g, before.b, surface.hasMap) };
      });
      for (let i = 0; i < styled.length; i++) {
        for (let j = i + 1; j < styled.length; j++) {
          const label = `${styled[i].id} vs ${styled[j].id}`;
          const before = deltaE76(styled[i].before, styled[j].before);
          const after = deltaE76(styled[i].after, styled[j].after);
          expect(after / before, `${label} retention`).toBeGreaterThanOrEqual(
            MIN_SEPARATION_RETENTION,
          );
          // On an untextured surface the material colour IS the visible colour,
          // so an absolute floor is meaningful there. A mapped material's colour
          // is only a multiplier over the authored atlas, so its dE is not the
          // separation the player sees and only the retention bound applies.
          if (!surface.hasMap) {
            expect(after, `${label} dE76`).toBeGreaterThanOrEqual(MIN_SHARED_MESH_SEPARATION);
          }
        }
      }
    });
  }

  it('has teeth: the old hard-clamped ceiling fails the retention bound', () => {
    // Guards against the assertion above passing vacuously. The demonalt trio
    // the critique named (the brown warfiend against the red pyre colossus) is
    // exactly the pair a clamp at 0.55 squeezed, and it must be caught.
    const mesh = SHARED_MESHES[0];
    const surface = glbBodyMaterials(mesh.glb).find((m) => m.name === mesh.bodyMaterial);
    expect(surface).toBeDefined();
    if (!surface) return;
    const pair = ['warfiend', 'pyre_colossus'].map((id) =>
      tinted(surface, MOBS[id].color as number, mesh.tintStrength),
    );
    const before = deltaE76(pair[0], pair[1]);
    const clamped = pair.map((c) => hardClampedColor(c.r, c.g, c.b, surface.hasMap));
    expect(deltaE76(clamped[0], clamped[1]) / before).toBeLessThan(MIN_SEPARATION_RETENTION);
    // and the live policy clears the bar the old one failed
    const live = pair.map((c) => houseColor(c.r, c.g, c.b, surface.hasMap));
    expect(deltaE76(live[0], live[1]) / before).toBeGreaterThanOrEqual(MIN_SEPARATION_RETENTION);
  });
});
