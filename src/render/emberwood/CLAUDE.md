# Emberwood render policy modules

Presentation-only: these modules provide theme-aware lighting, terrain, and foliage
color policies. They never mutate the sim, fetch assets, or add new methods to the
renderer coordinator.

## Invariants
- **No sim mutation.** Lighting and palette values are pure data consumed by the
  renderer for aesthetic presentation only.
- **Low-tier information parity.** All policy values preserve readability at every
  graphics tier. A tier knob may shed cosmetic richness but never hides actionable
  gameplay information.
- **No raw asset fetching.** Policies return color/lighting values, never URLs or
  asset handles. Asset replacement is handled by the visual theme catalog.
- **No new renderer methods.** Consumers swap a `lightingForTheme()` call at existing
  construction/assignment points in `renderer.ts`, `terrain.ts`, and `foliage.ts`.
  Add new selectors here, not new methods on the Renderer class.

## Exports
- `lighting.ts`:
  - `lightingForTheme(theme)` returns fog, hemi, and sun values for the normal tier.
  - `lowTierLightingForTheme(theme)` returns the same shape for the LOW graphics tier.
    The low tier draws no shadows and a cheaper sky, so it has always used flatter,
    brighter light. Those numbers used to be hardcoded in `renderer.ts`, which meant a
    themed night reached the high tier only while low tier stayed at noon: an obvious
    inconsistency, and extra visibility for whoever runs the cheap preset. Keeping the
    low tier a ROW OF THE SAME POLICY means a new theme cannot be added without
    deciding what it looks like with shadows off.
  - `outdoorFogForTheme(preset, theme)` adjusts a per-biome fog preset for the theme.
    It replaced a hardcoded `biome === 'vale'` test in `Renderer.outdoorFogPreset()`
    that silently stopped firing when Eastbrook became a volcano biome, leaving the
    zone on a brown daylight haze. Key on the THEME, never on a biome name.
- `materials.ts`: `materialOverridesForTheme(theme)` returns the per-material look
  overrides. The table itself lives in the LEAF module `src/render/prop_materials.ts`,
  imported by both this and `props.ts`. That is deliberate: having this module import
  the table from `props.ts` while `props.ts` imported the selector back formed a cycle
  that Vitest resolved lazily and Rollup did not, shipping 1 override instead of 19.
- `motes.ts`: `moteProfileForTheme(theme)` returns the ambient-speck count multiplier
  and height ceiling. It multiplies the tier-derived count rather than replacing it.
- `palette.ts`: `terrainPaletteForTheme(theme)` and `foliagePaletteForTheme(theme)`
  return per-biome color tables with Vale overrides for Emberwood.

## Adding a selector
Keep every new module here a LEAF or near-leaf: import types and sibling policy only,
never `renderer.ts` or a module that imports you back. A cycle inside `src/render/`
does not fail the test suite (Vitest resolves it lazily through Vite's SSR transform)
and can still break the shipped Rollup bundle silently.
