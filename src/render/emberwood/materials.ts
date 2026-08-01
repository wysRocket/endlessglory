// Theme-aware material overrides. Presentation only, same contract as the sibling
// lighting and palette policies: pure data in, pure data out, no asset handles and
// no new methods on the Renderer.
//
// Only one entry differs today. The window emissive is what makes the reference art
// read: a dark building mass punched through with warm light. Classic keeps its cold
// blue; Emberwood burns amber.

import type { VisualThemeId } from '../../visual_theme_core';
import { MAT_OVERRIDES, type MatOverride } from '../prop_materials';

const EMBERWOOD_WINDOW: MatOverride = {
  emissive: 0xff9a3c,
  emissiveIntensity: 3.2,
  roughness: 0.4,
};

const EMBERWOOD_OVERRIDES: Record<string, MatOverride> = {
  ...MAT_OVERRIDES,
  'village:Windows': EMBERWOOD_WINDOW,
};

export function materialOverridesForTheme(theme: VisualThemeId): Record<string, MatOverride> {
  return theme === 'emberwood' ? EMBERWOOD_OVERRIDES : MAT_OVERRIDES;
}
