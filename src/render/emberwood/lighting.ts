import type { VisualThemeId } from '../../visual_theme_core';

export interface LightingPolicy {
  readonly fogColor: number;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly sunColor: number;
  readonly sunIntensity: number;
  readonly hemiColor: number;
  readonly hemiGround: number;
  readonly hemiIntensity: number;
}

// fogNear/fogFar are the scene's BASE fog distances, the value the fog is built with.
// They are deliberately the shipped 130/470 rather than BIOME_FOG.vale's 95/340: on the
// high tier the base only holds until the per-frame easing pulls fog to the current
// biome preset (~2s), but on the low tier there is no easing, so the base is what a
// low-tier player looks at all session. fog.far also drives terrain, prop, and foliage
// culling distance, so this is load-bearing rather than cosmetic. Classic is a shipped
// look and keeps its shipped numbers.
const CLASSIC_LIGHTING: LightingPolicy = {
  fogColor: 0xa6c6e0,
  fogNear: 130,
  fogFar: 470,
  sunColor: 0xffedd0,
  sunIntensity: 2.8,
  hemiColor: 0xdcefff,
  hemiGround: 0x465f39,
  hemiIntensity: 0.45,
};

// Night. The reference art for this theme is a night world: a dim cool key light
// with all the warmth coming from windows, lava, and firelight rather than the sky.
// sunIntensity is the value that actually makes it night; the rest supports it.
// hemiIntensity deliberately RISES as the sun falls. That is the readability floor,
// not a mistake: src/render/emberwood/CLAUDE.md requires presentation never hide
// actionable gameplay information, so ambient has to carry what the sun stops giving.
// tests/emberwood_render_policy.test.ts pins the floor.
const EMBERWOOD_LIGHTING: LightingPolicy = {
  fogColor: 0x141d2b,
  fogNear: 55,
  fogFar: 210,
  sunColor: 0xbcd2f0,
  sunIntensity: 0.55,
  hemiColor: 0x2a4a68,
  hemiGround: 0x6b3520,
  hemiIntensity: 0.85,
};

// The low graphics tier draws no shadows and a cheaper sky, so it has always used
// flatter, brighter light to compensate. Those numbers used to be hardcoded in the
// renderer, which meant a themed night applied to high tier only: low tier stayed at
// noon, looked like a different game, and handed low-spec players extra visibility.
// Keeping the low tier a ROW OF THE SAME POLICY means a theme cannot be added again
// without deciding what it looks like when shadows are off.
const CLASSIC_LOW_LIGHTING: LightingPolicy = {
  ...CLASSIC_LIGHTING,
  fogColor: 0xb6cddd,
  fogNear: 150,
  fogFar: 520,
  sunColor: 0xfff0d0,
  sunIntensity: 2.65,
  hemiIntensity: 0.98,
};

// Night, flattened: same palette and same fog as the high tier so the world reads as
// the same place and the same hour, with ambient carrying what the missing shadows and
// dimmer key would otherwise have shaped.
const EMBERWOOD_LOW_LIGHTING: LightingPolicy = {
  ...EMBERWOOD_LIGHTING,
  sunIntensity: 0.5,
  hemiIntensity: 1.05,
};

export function lowTierLightingForTheme(theme: VisualThemeId): LightingPolicy {
  return theme === 'emberwood' ? EMBERWOOD_LOW_LIGHTING : CLASSIC_LOW_LIGHTING;
}

// Night draws the world in closer. Applied to each biome's own distances so the
// relative depth character of each biome survives.
const NIGHT_FOG_TIGHTEN = 0.72;

export function lightingForTheme(theme: VisualThemeId): LightingPolicy {
  return theme === 'emberwood' ? EMBERWOOD_LIGHTING : CLASSIC_LIGHTING;
}

/**
 * Per-biome outdoor fog, adjusted for the active theme.
 *
 * Replaces a hardcoded `biome === 'vale'` equality test that used to live in
 * Renderer.outdoorFogPreset(). That test silently stopped firing when Eastbrook
 * became a volcano biome, leaving the zone on a brown daylight haze, which is
 * exactly the rot a biome-name equality invites. Keying on the THEME instead means
 * the next biome change cannot break it.
 *
 * Night unifies the fog colour across biomes (one sky, one night) but keeps each
 * biome's own near/far ratio so peaks still read airier than a volcano basin.
 */
export function outdoorFogForTheme(
  preset: { color: number; near: number; far: number },
  theme: VisualThemeId,
): { color: number; near: number; far: number } {
  if (theme !== 'emberwood') return preset;
  return {
    color: EMBERWOOD_LIGHTING.fogColor,
    near: preset.near * NIGHT_FOG_TIGHTEN,
    far: preset.far * NIGHT_FOG_TIGHTEN,
  };
}
