// Theme-aware ambient mote profile. The reference art has embers rising through
// frame, not pollen hugging the ground, so the night theme gets more specks and a
// higher ceiling. Density still scales by graphics tier at the consumption point;
// this multiplies that, it does not replace it.
//
// A leaf module by design: it imports only a type. src/render/motes.ts imports THIS,
// never the reverse, so there is no cycle for the bundler to resolve in the wrong
// order (see src/render/prop_materials.ts for why that matters here).

import type { VisualThemeId } from '../../visual_theme_core';

export interface MoteProfile {
  /** multiplier on the tier-derived mote count */
  readonly countScale: number;
  /** max height above sampled ground a mote may occupy */
  readonly ceil: number;
}

const CLASSIC_MOTES: MoteProfile = { countScale: 1, ceil: 3.4 };
const EMBERWOOD_MOTES: MoteProfile = { countScale: 1.6, ceil: 7 };

export function moteProfileForTheme(theme: VisualThemeId): MoteProfile {
  return theme === 'emberwood' ? EMBERWOOD_MOTES : CLASSIC_MOTES;
}
