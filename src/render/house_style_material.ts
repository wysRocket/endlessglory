// The three.js half of the house surface style: the ONE place the policy in
// `house_style_core.ts` is written onto a real material, plus the ONE place the
// per-entity template tint is lerped in. Deliberately tiny and stateless.
//
// Two consumers share it, which is the whole point of it existing:
//   - `render/characters/assets.ts` `tintedMaterial()`, the in-game character
//     and creature material funnel;
//   - `guide/viewer/model.ts` `buildModel()`, the guide viewer turntable, which
//     also renders the committed Dungeon Finder mob portraits and the wiki
//     model stills through the headless still scripts.
// Those two used to reimplement the tint by hand, so a creature could look one
// way in game and another way in its own portrait. One core, one applier, two
// consumers: they cannot drift again.
//
// Imports three and nothing else from src/render, so the guide's lazy viewer
// chunk can use it without pulling in renderer state or the boot preload.
import * as THREE from 'three';
import { HOUSE_ROUGHNESS_MAX, type HouseMaterialRole, houseStyle } from './house_style_core';

/** Anything with a colour we style: MeshStandard / MeshLambert / MeshBasic. */
export type StyleableMaterial = THREE.Material & {
  color?: THREE.Color;
  map?: THREE.Texture | null;
  flatShading?: boolean;
  roughness?: number;
  metalness?: number;
};

const tintScratch = new THREE.Color();

/** The subtle pull toward the template colour. A hard multiply turns the
 *  hand-painted textures muddy, so this stays a gentle lerp. Runs BEFORE the
 *  house pass: see the ordering note in `house_style_core.ts`. */
export function applyTemplateTint(
  mat: StyleableMaterial,
  tint: number | null,
  strength: number,
): void {
  if (tint === null || !mat.color) return;
  mat.color.lerp(tintScratch.set(tint), strength);
}

/** The environment half of the same policy, for props, dungeon dressing, and
 *  scenery: everything that is NOT a character.
 *
 *  Why a second entry point instead of reusing applyHouseStyleMaterial with the
 *  'body' role: the faceting half does not transfer. A creature body is faceted
 *  on purpose, because that is what makes a textured Meshy mesh and an
 *  untextured Quaternius one read as one material vocabulary. A kit prop is
 *  different: its bevels ARE its silhouette language, and forcing flatShading on
 *  a barrel band or a smooth-shaded roof reads as damage rather than as style.
 *  So this applies the specular and palette halves and leaves authored shading
 *  alone.
 *
 *  This exists because the policy had already been reinvented by hand three
 *  times (dungeon.ts, jail_scene.ts, weapon_vfx.ts each carried their own
 *  `metalness = 0; roughness = max(0.85, ...)` pair) while props, foliage, and
 *  biome scenery got no correction at all beyond a metalness cap of 0.85, which
 *  is still very nearly full metal. */
export function applyHouseSurfaceMaterial(mat: StyleableMaterial): void {
  if (!mat.color) return;
  const isStandard = (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial === true;
  const plan = houseStyle({
    r: mat.color.r,
    g: mat.color.g,
    b: mat.color.b,
    roughness: isStandard ? (mat.roughness ?? HOUSE_ROUGHNESS_MAX) : HOUSE_ROUGHNESS_MAX,
    metalness: isStandard ? (mat.metalness ?? 0) : 0,
    hasMap: mat.map != null,
    role: 'body',
  });
  mat.color.setRGB(plan.r, plan.g, plan.b, THREE.LinearSRGBColorSpace);
  if (isStandard) {
    mat.roughness = plan.roughness;
    mat.metalness = plan.metalness;
  }
}

/** Write the house surface style onto a material. Runs on EVERY graphics tier:
 *  a Lambert or Basic material has no roughness or metalness, so only the
 *  palette and faceting halves land there. Never wired to the FPS governor, and
 *  it hides or delays nothing a player reacts to. */
export function applyHouseStyleMaterial(mat: StyleableMaterial, role: HouseMaterialRole): void {
  if (!mat.color) return;
  const isStandard = (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial === true;
  const plan = houseStyle({
    r: mat.color.r,
    g: mat.color.g,
    b: mat.color.b,
    roughness: isStandard ? (mat.roughness ?? HOUSE_ROUGHNESS_MAX) : HOUSE_ROUGHNESS_MAX,
    metalness: isStandard ? (mat.metalness ?? 0) : 0,
    hasMap: mat.map != null,
    role,
  });
  mat.color.setRGB(plan.r, plan.g, plan.b, THREE.LinearSRGBColorSpace);
  if (isStandard) {
    mat.roughness = plan.roughness;
    mat.metalness = plan.metalness;
  }
  if (mat.flatShading !== plan.flatShading) {
    mat.flatShading = plan.flatShading;
    // Fresh clones have not been compiled yet, but the flag is a program key:
    // mark it so a material that HAS been compiled picks the change up.
    mat.needsUpdate = true;
  }
}
