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
//   b. PALETTE HARMONIZATION. Saturation is pulled under a ceiling through a soft
//      knee and lightness clamped into a band, in perceptual (sRGB-encoded) HSL.
//      HUE IS NEVER TOUCHED: quantizing hue to a fixed palette would erase the
//      per-entity tint the game uses to tell mob templates apart.
//   c. FLAT SHADING. Whether the surface should render faceted.
//
// ORDERING (deliberate, and the reason hue is preserved rather than quantized):
// tintedMaterial() lerps the per-entity template tint into the cloned material
// FIRST, and this policy runs on the result. Normalizing before the tint would
// let a loud template colour walk the palette straight back out of band, so the
// pass has to see the tinted colour. Running after is only safe because every
// palette operation here is order-preserving, never a set: hue passes through
// untouched, and two tints that differ at all still differ afterwards, so no two
// differently tinted templates collapse into the same appearance. The two small
// role-specific readability offsets that follow in tintedMaterial (the weapon
// highlight and the low-tier Lambert lift) are deliberate bounded departures
// that need the final colour to derive their emissive from, so they stay last.
//
// WHY THE SATURATION CEILING IS A KNEE AND NOT A CLAMP. A hard clamp is
// order-preserving only as a non-strict inequality: every tint above the ceiling
// lands on exactly the ceiling, so any two loud templates come out with
// IDENTICAL chroma and only hue and lightness are left to separate them. This
// game distinguishes many templates that share one recoloured mesh purely by
// per-entity tint (the demonalt mesh carries five, the giant mesh six), so that
// is the one signal the policy must not spend. Measured on the real roster (the
// content tints lerped into the real glb base materials at the authored tint
// strength, CIE76 dE in Lab), the clamp cost the warfiend/pyre-colossus pair
// 26.02 -> 20.26 and the dragonkin pair 18.96 -> 10.12. The knee below leaves
// everything under HOUSE_SATURATION_KNEE untouched and compresses the rest
// asymptotically toward HOUSE_SATURATION_MAX, so spacing survives instead of
// collapsing to a point, and a screaming s=1.0 primary is still hauled to ~0.67.
//
// The one property this costs is exact idempotency of the palette half: a knee
// that is strictly increasing cannot also fix its own image pointwise (that is
// only possible for the identity), so re-applying moves saturation a bounded
// step further down. Nothing re-applies it: tintedMaterial() always clones from
// a pristine source material and caches the result, and the guide viewer builds
// from a fresh clone too. The specular, lightness and flat-shading halves stay
// exactly idempotent, and the knee's drift is bounded by the knee width and can
// never leave the band, which is what tests/house_style_core.test.ts pins.
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

/** No character surface is allowed to be glossier than this. Sits just under the
 *  0.415 the whole Meshy/Tripo creature lineage authors (stone, crystal, scale,
 *  fish hide and demon flesh alike), so the floor binds on the genuinely glossy
 *  outliers instead of flattening every hard surface in the roster: at 0.55 the
 *  GGX lobe of a 0.415 material widened by 76% (alpha 0.172 -> 0.3025) and the
 *  constructs lost their highlight, at 0.45 it widens by 18% while the painterly
 *  outlier (an authored 0.08) is still flattened ~32x in lobe area. */
export const HOUSE_ROUGHNESS_MIN = 0.45;
/** Nor chalkier: the ceiling keeps the key light readable on dark creatures. */
export const HOUSE_ROUGHNESS_MAX = 0.9;
/** Bodies are dielectric: flesh, cloth, hide, and bark are never metal. */
export const HOUSE_BODY_METALNESS_MAX = 0.06;
/** Weapons keep a little metal so blades still catch the one key light. */
export const HOUSE_WEAPON_METALNESS_MAX = 0.35;
/** Saturation at or below this passes through untouched: the house palette has
 *  no quarrel with a muted tint, and compressing those too would spend the very
 *  separation the knee exists to protect. */
export const HOUSE_SATURATION_KNEE = 0.5;
/** The desaturated house palette ceiling (HSL saturation). Asymptotic, not a
 *  clamp: `houseSaturation` approaches it but never reaches it, so two loud
 *  tints keep their ordering and their spacing instead of both landing here. */
export const HOUSE_SATURATION_MAX = 0.68;
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

/** The house saturation ceiling as a soft knee. Identity at or below
 *  HOUSE_SATURATION_KNEE, then an exponential approach to HOUSE_SATURATION_MAX
 *  that is continuous and slope-1 at the knee and never reaches the ceiling.
 *  STRICTLY increasing over the whole 0..1 domain, which is the point: unlike a
 *  clamp it maps two distinct loud tints to two distinct chromas, so templates
 *  that share a mesh and differ only by tint stay apart. */
export function houseSaturation(s: number): number {
  if (s <= HOUSE_SATURATION_KNEE) return s;
  const span = HOUSE_SATURATION_MAX - HOUSE_SATURATION_KNEE;
  return HOUSE_SATURATION_KNEE + span * (1 - Math.exp(-(s - HOUSE_SATURATION_KNEE) / span));
}

/** (b) Palette harmonization over LINEAR rgb. Saturation is pulled under the
 *  house ceiling through the soft knee and lightness clamped into the house
 *  band; hue passes through untouched so the per-entity template tint still
 *  separates one mob from the next. Order-preserving on every axis; the
 *  lightness half is a clamp and idempotent, the knee is not (see the header). */
export function houseColor(
  r: number,
  g: number,
  b: number,
  hasMap: boolean,
): { r: number; g: number; b: number } {
  const hsl = rgbToHsl(encodeSrgb(clamp01(r)), encodeSrgb(clamp01(g)), encodeSrgb(clamp01(b)));
  const lightMin = hasMap ? HOUSE_MAPPED_LIGHTNESS_MIN : HOUSE_LIGHTNESS_MIN;
  const lightMax = hasMap ? 1 : HOUSE_LIGHTNESS_MAX;
  const out = hslToRgb(hsl.h, houseSaturation(hsl.s), clamp(hsl.l, lightMin, lightMax));
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

/** The whole policy, as one derivation. Pure and total: same input, same output.
 *  Re-applying is a no-op on every axis except the saturation knee, whose second
 *  pass moves saturation by at most the knee width and never out of band. */
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
