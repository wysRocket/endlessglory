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
