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

const CLASSIC_LIGHTING: LightingPolicy = {
  fogColor: 0xa6c6e0,
  fogNear: 95,
  fogFar: 340,
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

export function lightingForTheme(theme: VisualThemeId): LightingPolicy {
  return theme === 'emberwood' ? EMBERWOOD_LIGHTING : CLASSIC_LIGHTING;
}
