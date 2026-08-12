// The house surface-style policy: one stylization rule the whole creature roster
// obeys, so nine unrelated third-party art lineages (Quaternius, KayKit, two
// Meshy lineages, Tripo, procedural, and the rest) read as one cast instead of
// nine games in a trenchcoat. Pure numbers only: no three.js, no DOM, no i18n,
// no randomness or wall clock, so a plain Vitest drives it directly and the
// thin consumer (src/render/house_style_material.ts) just writes the result onto
// a three.js material.
//
// ONE policy, ONE applier, TWO consumers: the in-game material funnel
// (render/characters/assets.ts tintedMaterial) and the guide viewer
// (guide/viewer/model.ts buildModel, which also bakes the committed Dungeon
// Finder mob portraits and the wiki model stills). A creature must not look one
// way in game and another way in its own portrait, which is exactly what a
// second hand-rolled copy of this policy would produce.
//
// Three independent jobs, each separately testable:
//   a. SPECULAR NORMALIZATION. Roughness is clamped into a narrow house band and
//      metalness capped near zero for bodies. This is what kills the one glossy
//      painterly outlier that otherwise reads as a different game.
//   b. PALETTE HARMONIZATION. Saturation is capped and lightness pulled into a
//      band, in perceptual (sRGB-encoded) HSL. HUE IS NEVER TOUCHED: quantizing
//      hue to a fixed palette would erase the per-entity tint the game uses to
//      tell mob templates apart.
//   c. FLAT SHADING. Whether the surface should render faceted.
//
// ORDERING (deliberate, and the reason hue is preserved rather than quantized):
// tintedMaterial() lerps the per-entity template tint into the cloned material
// FIRST, and this policy runs on the result. Normalizing before the tint would
// let a loud template colour walk the palette straight back out of band, so the
// pass has to see the tinted colour. Running after is only safe because every
// palette operation here is a CLAMP, never a set: hue passes through untouched,
// and two tints that differ inside the band still differ afterwards, so no two
// differently tinted templates collapse into the same appearance. The two small
// role-specific readability offsets that follow in tintedMaterial (the weapon
// highlight and the low-tier Lambert lift) are deliberate bounded departures
// that need the final colour to derive their emissive from, so they stay last.
//
// Gameplay-neutral by construction: this is a global stylization applied
// identically on every graphics tier and every entity. It is not wired to the
// FPS governor, and it hides or delays nothing a player reacts to.

/** Which half of a character a material belongs to. Structurally identical to
 *  the MaterialRole in characters/assets.ts, redeclared here so this core stays
 *  a leaf module that imports nothing from src/render. */
export type HouseMaterialRole = 'body' | 'weapon';

/** A source material reduced to the numbers the policy reasons about. Colour
 *  components are LINEAR rgb (three's working colour space), each in 0..1. */
export interface HouseStyleSource {
  r: number;
  g: number;
  b: number;
  /** 0..1; pass HOUSE_ROUGHNESS_MAX for a non-PBR (Lambert/Basic) material. */
  roughness: number;
  /** 0..1; pass 0 for a non-PBR material. */
  metalness: number;
  /** True when the material carries an authored albedo map, which makes its
   *  colour a multiplier over that texture rather than the visible surface. */
  hasMap: boolean;
  role: HouseMaterialRole;
}

/** The normalized material, in the same units as the source. */
export interface HouseStyleResult {
  r: number;
  g: number;
  b: number;
  roughness: number;
  metalness: number;
  flatShading: boolean;
}

// --- The house bands. Widening any of these silently un-unifies the roster, so
// tests/house_style_core.test.ts pins every one to its literal. ---

/** No character surface is allowed to be glossier than this. */
export const HOUSE_ROUGHNESS_MIN = 0.55;
/** Nor chalkier: the ceiling keeps the key light readable on dark creatures. */
export const HOUSE_ROUGHNESS_MAX = 0.9;
/** Bodies are dielectric: flesh, cloth, hide, and bark are never metal. */
export const HOUSE_BODY_METALNESS_MAX = 0.06;
/** Weapons keep a little metal so blades still catch the one key light. */
export const HOUSE_WEAPON_METALNESS_MAX = 0.35;
/** The desaturated house palette ceiling (HSL saturation). */
export const HOUSE_SATURATION_MAX = 0.55;
/** Lightness band for an untextured surface, where the colour IS the surface. */
export const HOUSE_LIGHTNESS_MIN = 0.22;
export const HOUSE_LIGHTNESS_MAX = 0.78;
/** A mapped material's colour is a multiplier over authored art, so only the
 *  floor applies: a dark multiplier crushes the texture, while a near-white one
 *  is the correct neutral and must not be dimmed. */
export const HOUSE_MAPPED_LIGHTNESS_MIN = 0.35;

/** The default strength of the per-entity template tint lerp. Shared policy:
 *  both the in-game material funnel and the guide viewer read it from here so
 *  a creature cannot be tinted one way in game and another in its portrait. */
export const DEFAULT_TEMPLATE_TINT_STRENGTH = 0.4;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

// sRGB transfer functions, matching three's own linear <-> sRGB conversion. The
// palette work happens in encoded space because "saturation" and "lightness"
// are perceptual ideas: clamping them on raw linear components would crush
// mid-tones (linear 0.21 is already mid-grey to the eye).
function encodeSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

function decodeSrgb(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** Non-linear sRGB rgb (0..1) to HSL (h in 0..1, wrapping). */
export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s, l };
}

function hueToChannel(p: number, q: number, tRaw: number): number {
  const t = tRaw < 0 ? tRaw + 1 : tRaw > 1 ? tRaw - 1 : tRaw;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/** HSL back to non-linear sRGB rgb (0..1). Exact inverse of rgbToHsl. */
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hueToChannel(p, q, h + 1 / 3),
    g: hueToChannel(p, q, h),
    b: hueToChannel(p, q, h - 1 / 3),
  };
}

/** (a) Specular normalization: one narrow gloss band for the whole roster, and
 *  metalness pulled toward zero (bodies) or to a small blade highlight
 *  (weapons). Idempotent: both operations are clamps. */
export function houseSpecular(
  roughness: number,
  metalness: number,
  role: HouseMaterialRole,
): { roughness: number; metalness: number } {
  const metalMax = role === 'weapon' ? HOUSE_WEAPON_METALNESS_MAX : HOUSE_BODY_METALNESS_MAX;
  return {
    roughness: clamp(roughness, HOUSE_ROUGHNESS_MIN, HOUSE_ROUGHNESS_MAX),
    metalness: clamp(metalness, 0, metalMax),
  };
}

/** (b) Palette harmonization over LINEAR rgb. Saturation is capped and
 *  lightness clamped into the house band; hue passes through untouched so the
 *  per-entity template tint still separates one mob from the next. Idempotent:
 *  every operation is a clamp, and the space round-trips. */
export function houseColor(
  r: number,
  g: number,
  b: number,
  hasMap: boolean,
): { r: number; g: number; b: number } {
  const hsl = rgbToHsl(encodeSrgb(clamp01(r)), encodeSrgb(clamp01(g)), encodeSrgb(clamp01(b)));
  const lightMin = hasMap ? HOUSE_MAPPED_LIGHTNESS_MIN : HOUSE_LIGHTNESS_MIN;
  const lightMax = hasMap ? 1 : HOUSE_LIGHTNESS_MAX;
  const out = hslToRgb(
    hsl.h,
    Math.min(hsl.s, HOUSE_SATURATION_MAX),
    clamp(hsl.l, lightMin, lightMax),
  );
  return { r: decodeSrgb(out.r), g: decodeSrgb(out.g), b: decodeSrgb(out.b) };
}

/** (c) Flat shading: bodies carry the silhouette and the surface language, so
 *  they render faceted on every tier, which is what makes a textured Meshy body
 *  and an untextured Quaternius one read as the same material vocabulary.
 *  Weapons stay smooth: they are thin, high-frequency props whose bevels
 *  collapse into noise when faceted, and they already share one polish pass. */
export function houseFlatShading(role: HouseMaterialRole): boolean {
  return role === 'body';
}

/** The whole policy, as one derivation. Pure and total: same input, same
 *  output, and applying it to its own result changes nothing. */
export function houseStyle(src: HouseStyleSource): HouseStyleResult {
  const color = houseColor(src.r, src.g, src.b, src.hasMap);
  const spec = houseSpecular(src.roughness, src.metalness, src.role);
  return {
    r: color.r,
    g: color.g,
    b: color.b,
    roughness: spec.roughness,
    metalness: spec.metalness,
    flatShading: houseFlatShading(src.role),
  };
}
