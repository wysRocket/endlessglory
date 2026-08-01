# Emberwood Nightfall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Emberwood visual theme from flat daylight into the night world of the reference images, using only presentation policy values.

**Architecture:** Every change is a value in a theme policy table under `src/render/emberwood/`, or a consumption point that reads one. No new renderer methods, no sim changes, no new assets. `src/render/emberwood/CLAUDE.md` requires new selectors live in that module rather than as methods on the Renderer, so the two new behaviors (material overrides, mote profile) become selectors alongside the existing `lightingForTheme` and `terrainPaletteForTheme`.

**Tech Stack:** TypeScript (ESM, strict), Three.js, Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-01-emberwood-nightfall-design.md`](../specs/2026-08-01-emberwood-nightfall-design.md)

---

## Working agreement

**Work directly on `main`.** No worktree, no branch. This continues the convention used for the town dressing and Eastbrook Scar work in this session. Commit after each task.

**Copy rules are enforced at push time.** No em dashes, en dashes, or emojis anywhere, including code comments and commit messages. A `.githooks/pre-push` scan blocks the push otherwise. Use commas, colons, or parentheses.

**The changed-files biome gate lints the WHOLE file** once any line in it changes, not just your new lines. If `npm run gate` flags an organize-imports or style fix in a file this plan touches, run `npx @biomejs/biome check --write <file>` and keep the result. Do NOT revert an auto-fix as "unrelated"; that mistake cost two extra commits earlier in this session.

## File structure

| File | Responsibility | Action |
|---|---|---|
| `src/render/emberwood/lighting.ts` | Night lighting values plus the outdoor fog resolver | Modify |
| `src/render/emberwood/materials.ts` | Theme-aware material overrides (emissive windows) | Create |
| `src/render/emberwood/motes.ts` | Theme-aware mote density and ceiling | Create |
| `src/render/emberwood/index.ts` | Barrel re-export of the new selectors | Modify |
| `src/render/props.ts` | Consume the material-override selector | Modify |
| `src/render/motes.ts` | Consume the mote profile selector | Modify |
| `src/render/renderer.ts` | Use the fog resolver, drop the stale biome equality | Modify |
| `tests/emberwood_render_policy.test.ts` | Extend: night values, fog resolver, readability floor | Modify |
| `tests/emberwood_materials.test.ts` | New paired test for the material selector | Create |
| `tests/emberwood_motes_profile.test.ts` | New paired test for the mote profile | Create |

Per `tests/CLAUDE.md`, a NEW module gets its OWN paired test file rather than having cases appended to an existing suite. That is why tasks 2 and 3 add test files instead of growing `emberwood_render_policy.test.ts`.

## The values (single source of truth for this plan)

Every task below uses these exact numbers. They are collected here so a later tuning pass changes one table, not six code blocks.

| Field | Classic (unchanged) | Emberwood today | Emberwood target |
|---|---|---|---|
| `fogColor` | 0xa6c6e0 | 0x607487 | 0x141d2b |
| `fogNear` | 95 | 95 | 55 |
| `fogFar` | 340 | 340 | 210 |
| `sunColor` | 0xffedd0 | 0xffd6a3 | 0xbcd2f0 |
| `sunIntensity` | 2.8 | 2.8 | 0.55 |
| `hemiColor` | 0xdcefff | 0xdcefff | 0x2a4a68 |
| `hemiGround` | 0x465f39 | 0x465f39 | 0x6b3520 |
| `hemiIntensity` | 0.45 | 0.45 | 0.85 |

Reasoning, so a later reader can retune with intent rather than guessing:

- `sunIntensity` 2.8 to 0.55 is the change that makes it night. Everything else supports it.
- `sunColor` goes cool because the key light is now moonlight. Warmth comes from windows and lava, not the sky.
- `hemiColor` teal over `hemiGround` warm ash reproduces the reference contrast: cool from above, ember bounce from below.
- `hemiIntensity` RISES from 0.45 to 0.85. This is deliberate and is the readability floor: as the sun drops, ambient must rise or mobs become invisible. Task 5 pins it.
- Fog pulls in from 95/340 to 55/210 so ridgelines fall into blue depth instead of standing crisp.

`NIGHT_FOG_TIGHTEN = 0.72` scales each biome's own fog distances for the night theme while preserving per-biome character.

`EMBERWOOD_WINDOW_EMISSIVE = 0xff9a3c` at `emissiveIntensity: 3.2`.

`EMBERWOOD_MOTE_COUNT_SCALE = 1.6`, `EMBERWOOD_MOTE_CEIL = 7.0`.

---

### Task 1: Night lighting values

**Files:**
- Modify: `src/render/emberwood/lighting.ts`
- Test: `tests/emberwood_render_policy.test.ts`

- [ ] **Step 1: Update the failing test**

In `tests/emberwood_render_policy.test.ts`, replace the whole `it('returns emberwood lighting with smoke-blue fog and warmer sun', ...)` block with:

```ts
    it('returns emberwood night lighting: dim cool key, teal sky over ember ground', () => {
      const emberwood = lightingForTheme('emberwood');
      expect(emberwood.fogColor).toBe(0x141d2b);
      expect(emberwood.fogNear).toBe(55);
      expect(emberwood.fogFar).toBe(210);
      expect(emberwood.sunColor).toBe(0xbcd2f0);
      expect(emberwood.sunIntensity).toBe(0.55);
      expect(emberwood.hemiColor).toBe(0x2a4a68);
      expect(emberwood.hemiGround).toBe(0x6b3520);
      expect(emberwood.hemiIntensity).toBe(0.85);
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/emberwood_render_policy.test.ts`

Expected: FAIL, `expected 0x607487 to be 0x141d2b` (reported in decimal, `expected 6321799 to be 1318187`).

- [ ] **Step 3: Write the implementation**

In `src/render/emberwood/lighting.ts`, replace the `EMBERWOOD_LIGHTING` constant with:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/emberwood_render_policy.test.ts`

Expected: PASS, all tests in the file green (the classic-unchanged test must still pass).

- [ ] **Step 5: Commit**

```bash
git add src/render/emberwood/lighting.ts tests/emberwood_render_policy.test.ts
git commit -m "feat(render): make the Emberwood lighting policy an actual night

Every brightness field in the Emberwood row was identical to Classic, so the
theme still rendered as flat noon. Drops the key light to moonlight, swaps the
hemisphere to teal sky over warm ash bounce, and pulls fog in so ridgelines fall
away into blue depth.

hemiIntensity rises as the sun falls, on purpose: the emberwood policy contract
forbids hiding actionable gameplay information, so ambient carries what the sun
stops giving."
```

---

### Task 2: Theme-aware emissive windows

**Files:**
- Create: `src/render/emberwood/materials.ts`
- Modify: `src/render/emberwood/index.ts`
- Modify: `src/render/props.ts:306`
- Test: `tests/emberwood_materials.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/emberwood_materials.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { materialOverridesForTheme } from '../src/render/emberwood/materials';

describe('Emberwood material overrides', () => {
  it('leaves classic overrides untouched: windows stay the cold blue', () => {
    const classic = materialOverridesForTheme('classic');
    expect(classic['village:Windows']).toEqual({
      emissive: 0x2a3c55,
      emissiveIntensity: 1.1,
      roughness: 0.4,
    });
  });

  it('retints emberwood windows to hot amber so dark mass reads as lit from within', () => {
    const ember = materialOverridesForTheme('emberwood');
    expect(ember['village:Windows']).toEqual({
      emissive: 0xff9a3c,
      emissiveIntensity: 3.2,
      roughness: 0.4,
    });
  });

  it('carries every non-window classic entry through unchanged on emberwood', () => {
    const classic = materialOverridesForTheme('classic');
    const ember = materialOverridesForTheme('emberwood');
    for (const key of Object.keys(classic)) {
      if (key === 'village:Windows') continue;
      expect(ember[key], key).toEqual(classic[key]);
    }
  });

  it('adds no keys that classic does not have', () => {
    expect(Object.keys(materialOverridesForTheme('emberwood')).sort()).toEqual(
      Object.keys(materialOverridesForTheme('classic')).sort(),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/emberwood_materials.test.ts`

Expected: FAIL, `Cannot find module '../src/render/emberwood/materials'`.

- [ ] **Step 3: Write the implementation**

First, in `src/render/props.ts`, EXPORT the existing table so the selector can build on it without duplicating it. Change the declaration at line 227 from `const MAT_OVERRIDES: Record<` to:

```ts
export const MAT_OVERRIDES: Record<
```

Leave the table contents exactly as they are.

Then create `src/render/emberwood/materials.ts`:

```ts
// Theme-aware material overrides. Presentation only, same contract as the sibling
// lighting and palette policies: pure data in, pure data out, no asset handles and
// no new methods on the Renderer.
//
// Only one entry differs today. The window emissive is what makes the reference art
// read: a dark building mass punched through with warm light. Classic keeps its cold
// blue; Emberwood burns amber.

import { MAT_OVERRIDES, type MatOverride } from '../props';
import type { VisualThemeId } from '../../visual_theme_core';

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
```

That references a `MatOverride` type which does not exist yet. In `src/render/props.ts`, extract the inline type on the `MAT_OVERRIDES` declaration into a named exported type directly above it, and use it. Replace lines 227 through 236 (the `const MAT_OVERRIDES: Record<...> = {` opening including its inline value type) with:

```ts
export interface MatOverride {
  color?: number;
  emissive?: number;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
}

export const MAT_OVERRIDES: Record<string, MatOverride> = {
```

The table body and its closing `};` stay exactly as they are.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/emberwood_materials.test.ts`

Expected: PASS, 4 tests.

- [ ] **Step 5: Consume the selector in props.ts**

In `src/render/props.ts`, add to the existing import block from `./emberwood` if one exists, otherwise add this import next to the other local imports:

```ts
import { materialOverridesForTheme } from './emberwood/materials';
import { ACTIVE_VISUAL_THEME } from '../visual_theme';
```

Then replace line 306:

```ts
  const ov = MAT_OVERRIDES[`${kit}:${s.name}`] ?? MAT_OVERRIDES[s.name];
```

with:

```ts
  const overrides = materialOverridesForTheme(ACTIVE_VISUAL_THEME);
  const ov = overrides[`${kit}:${s.name}`] ?? overrides[s.name];
```

The material cache key on the following line does NOT need the theme added: `ACTIVE_VISUAL_THEME` is resolved once at boot and never changes during a session, so one process only ever sees one theme's overrides.

- [ ] **Step 6: Typecheck and run the render suites**

Run: `npx tsc --noEmit && npx vitest run tests/emberwood_materials.test.ts tests/emberwood_render_policy.test.ts tests/architecture.test.ts`

Expected: no type errors; all suites PASS.

- [ ] **Step 7: Commit**

```bash
git add src/render/emberwood/materials.ts src/render/emberwood/index.ts src/render/props.ts tests/emberwood_materials.test.ts
git commit -m "feat(render): burn the Emberwood windows amber

The village window override was a cold 0x2a3c55 barely above black, so buildings
read as flat dark blocks at night. Emberwood now retints it to hot amber at high
emissive intensity, which is what makes the reference art read: dark mass punched
through with warm light.

Adds materialOverridesForTheme alongside the existing lighting and palette
selectors, per the emberwood module contract that new selectors live there rather
than as methods on the Renderer. Classic is byte-identical: it returns the same
table object it always did."
```

Note: `src/render/emberwood/index.ts` is in the add list because Step 8 edits it.

- [ ] **Step 8: Re-export from the barrel**

In `src/render/emberwood/index.ts`, add:

```ts
export { materialOverridesForTheme } from './materials';
export type { MatOverride } from '../props';
```

Amend the previous commit so the barrel ships with its module:

```bash
git add src/render/emberwood/index.ts
git commit --amend --no-edit
```

---

### Task 3: Ember atmosphere

**Files:**
- Create: `src/render/emberwood/motes.ts`
- Modify: `src/render/emberwood/index.ts`
- Modify: `src/render/motes.ts:73` and the `CEIL` usage
- Test: `tests/emberwood_motes_profile.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/emberwood_motes_profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { moteProfileForTheme } from '../src/render/emberwood/motes';

describe('Emberwood mote profile', () => {
  it('leaves classic at the shipped density and low ceiling', () => {
    expect(moteProfileForTheme('classic')).toEqual({ countScale: 1, ceil: 3.4 });
  });

  it('raises emberwood density and lets embers climb higher', () => {
    expect(moteProfileForTheme('emberwood')).toEqual({ countScale: 1.6, ceil: 7 });
  });

  it('never returns a countScale below the classic baseline', () => {
    for (const theme of ['classic', 'emberwood'] as const) {
      expect(moteProfileForTheme(theme).countScale).toBeGreaterThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/emberwood_motes_profile.test.ts`

Expected: FAIL, `Cannot find module '../src/render/emberwood/motes'`.

- [ ] **Step 3: Write the implementation**

Create `src/render/emberwood/motes.ts`:

```ts
// Theme-aware ambient mote profile. The reference art has embers rising through
// frame, not pollen hugging the ground, so the night theme gets more specks and a
// higher ceiling. Density still scales by graphics tier at the consumption point;
// this multiplies that, it does not replace it.

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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/emberwood_motes_profile.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Consume the profile in motes.ts**

In `src/render/motes.ts`, add these imports alongside the existing ones:

```ts
import { ACTIVE_VISUAL_THEME } from '../visual_theme';
import { moteProfileForTheme } from './emberwood/motes';
```

Replace the `CEIL` constant line:

```ts
const CEIL = 3.4; // max height above the sampled ground
```

with:

```ts
// Classic ceiling. The live value comes from the theme profile so the night theme
// can let embers climb; see src/render/emberwood/motes.ts.
const CEIL = 3.4; // max height above the sampled ground (classic baseline)
```

Then inside `buildMotes`, replace:

```ts
  const count = GFX.standardMaterials ? 80 : 30;
```

with:

```ts
  const profile = moteProfileForTheme(ACTIVE_VISUAL_THEME);
  const count = Math.round((GFX.standardMaterials ? 80 : 30) * profile.countScale);
```

Then find every use of `CEIL` inside `buildMotes` and its nested helpers and replace the identifier `CEIL` with `profile.ceil`. Locate them with:

```bash
grep -n "CEIL" src/render/motes.ts
```

Leave the `const CEIL` declaration in place as the documented classic baseline that `moteProfileForTheme('classic')` returns.

- [ ] **Step 6: Typecheck and run the suites**

Run: `npx tsc --noEmit && npx vitest run tests/emberwood_motes_profile.test.ts tests/architecture.test.ts`

Expected: no type errors; both suites PASS.

- [ ] **Step 7: Commit**

```bash
git add src/render/emberwood/motes.ts src/render/emberwood/index.ts src/render/motes.ts tests/emberwood_motes_profile.test.ts
git commit -m "feat(render): raise Emberwood ember density and ceiling

Motes hugged the ground at a fixed 3.4 ceiling, which reads as pollen rather than
the embers rising through frame in the reference art. The night theme gets 1.6x the
tier-derived count and a 7.0 ceiling; classic keeps both baselines exactly.

Tier scaling is untouched: the profile multiplies the tier count rather than
replacing it, so low stays cheap."
```

- [ ] **Step 8: Re-export from the barrel**

In `src/render/emberwood/index.ts`, add:

```ts
export { moteProfileForTheme } from './motes';
export type { MoteProfile } from './motes';
```

Amend:

```bash
git add src/render/emberwood/index.ts
git commit --amend --no-edit
```

---

### Task 4: Reconcile the two fog paths

This task fixes the dead code found during specification. `Renderer.outdoorFogPreset()` special-cases `biome === 'vale'`, which stopped matching Eastbrook when that zone became `volcano` on 2026-07-31.

**Files:**
- Modify: `src/render/emberwood/lighting.ts`
- Modify: `src/render/renderer.ts:4413-4419`
- Test: `tests/emberwood_render_policy.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/emberwood_render_policy.test.ts`, inside the top-level `describe('Emberwood render policy', ...)`:

```ts
  describe('outdoor fog resolver', () => {
    const VOLCANO = { color: 0x8a7468, near: 50, far: 220 };
    const PEAKS = { color: 0xbdd3ec, near: 110, far: 390 };

    it('returns the biome preset untouched on classic', () => {
      expect(outdoorFogForTheme(VOLCANO, 'classic')).toEqual(VOLCANO);
      expect(outdoorFogForTheme(PEAKS, 'classic')).toEqual(PEAKS);
    });

    it('applies the night fog colour to every biome on emberwood, not just one', () => {
      expect(outdoorFogForTheme(VOLCANO, 'emberwood').color).toBe(0x141d2b);
      expect(outdoorFogForTheme(PEAKS, 'emberwood').color).toBe(0x141d2b);
    });

    it('tightens each biome distance while preserving its relative depth', () => {
      const volcano = outdoorFogForTheme(VOLCANO, 'emberwood');
      const peaks = outdoorFogForTheme(PEAKS, 'emberwood');
      expect(volcano.near).toBeCloseTo(36, 0);
      expect(volcano.far).toBeCloseTo(158.4, 1);
      // peaks is the airiest biome and must stay airier than volcano after tightening
      expect(peaks.far).toBeGreaterThan(volcano.far);
    });

    it('never returns a far plane inside the near plane', () => {
      for (const preset of [VOLCANO, PEAKS]) {
        const out = outdoorFogForTheme(preset, 'emberwood');
        expect(out.far).toBeGreaterThan(out.near);
      }
    });
  });
```

Add `outdoorFogForTheme` to the existing import from `../src/render/emberwood/lighting` at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/emberwood_render_policy.test.ts`

Expected: FAIL, `outdoorFogForTheme is not a function` (or a TypeScript import error).

- [ ] **Step 3: Write the implementation**

Append to `src/render/emberwood/lighting.ts`:

```ts
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
```

And add this constant next to `EMBERWOOD_LIGHTING`:

```ts
// Night draws the world in closer. Applied to each biome's own distances so the
// relative depth character of each biome survives.
const NIGHT_FOG_TIGHTEN = 0.72;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/emberwood_render_policy.test.ts`

Expected: PASS, every test in the file.

- [ ] **Step 5: Consume it in the renderer and delete the stale branch**

In `src/render/renderer.ts`, replace the body of `outdoorFogPreset()`:

```ts
  private outdoorFogPreset(): { color: number; near: number; far: number } {
    if (this.lowGfx) return Renderer.LOW_FOG;
    const biome = zoneBiomeAt(this.sim.player.pos.z);
    const preset = Renderer.BIOME_FOG[biome];
    if (ACTIVE_VISUAL_THEME === 'emberwood' && biome === 'vale') {
      return { ...preset, color: 0x607487 };
    }
    return preset;
```

with:

```ts
  private outdoorFogPreset(): { color: number; near: number; far: number } {
    if (this.lowGfx) return Renderer.LOW_FOG;
    const biome = zoneBiomeAt(this.sim.player.pos.z);
    return outdoorFogForTheme(Renderer.BIOME_FOG[biome], ACTIVE_VISUAL_THEME);
```

Keep whatever follows the original `return preset;` line (the closing brace and any trailing code) intact.

Add `outdoorFogForTheme` to the existing import from `./emberwood/lighting` at line 82.

- [ ] **Step 6: Typecheck and verify**

Run: `npx tsc --noEmit && npx vitest run tests/emberwood_render_policy.test.ts tests/architecture.test.ts`

Expected: no type errors; both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/render/emberwood/lighting.ts src/render/renderer.ts tests/emberwood_render_policy.test.ts
git commit -m "fix(render): key Emberwood fog on the theme, not a biome name

outdoorFogPreset special-cased biome === 'vale'. Eastbrook became a volcano biome
on 2026-07-31, so that branch stopped firing for the zone it was written for and
the town fell through to a brown daylight haze nobody noticed.

Moves the decision into outdoorFogForTheme next to the other emberwood policy, keyed
on the theme so the next biome change cannot rot it. Night unifies fog colour across
biomes but scales each biome's own distances, so peaks still reads airier than a
volcano basin."
```

---

### Task 5: Pin the readability floor

The spec makes readability a hard constraint that outranks fidelity to the references. Without a pin, a future tuning pass can quietly darken the world until mobs vanish, and no test would object.

**Files:**
- Test: `tests/emberwood_render_policy.test.ts`

- [ ] **Step 1: Write the test**

Add inside the top-level describe:

```ts
  // A night world must not hide the wolf that is eating you.
  // src/render/emberwood/CLAUDE.md: presentation "never hides actionable gameplay
  // information". These are floors, not style preferences. If a future tuning pass
  // needs to cross one, that is a deliberate decision that changes this test on
  // purpose, not a silent drift.
  describe('readability floor', () => {
    const MIN_AMBIENT = 0.7;

    it('keeps every theme above the minimum ambient contribution', () => {
      for (const theme of ['classic', 'emberwood'] as const) {
        const light = lightingForTheme(theme);
        const ambient = light.hemiIntensity + light.sunIntensity;
        expect(ambient, `${theme} total ambient`).toBeGreaterThanOrEqual(MIN_AMBIENT);
      }
    });

    it('compensates a dimmer key light with a stronger hemisphere', () => {
      const classic = lightingForTheme('classic');
      const ember = lightingForTheme('emberwood');
      expect(ember.sunIntensity).toBeLessThan(classic.sunIntensity);
      expect(ember.hemiIntensity).toBeGreaterThan(classic.hemiIntensity);
    });

    it('never lets fog close inside melee range', () => {
      for (const theme of ['classic', 'emberwood'] as const) {
        // melee and interact ranges sit under 30 units; fog starting inside that
        // would grey out the thing you are hitting
        expect(lightingForTheme(theme).fogNear, theme).toBeGreaterThan(30);
      }
    });
  });
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/emberwood_render_policy.test.ts`

Expected: PASS. These assert the values Task 1 already set (0.85 + 0.55 = 1.4, above 0.7; fogNear 55, above 30). If any FAILS, Task 1's values were mistyped; fix Task 1 rather than loosening the floor.

- [ ] **Step 3: Commit**

```bash
git add tests/emberwood_render_policy.test.ts
git commit -m "test(render): pin the Emberwood readability floor

The night values are only safe while ambient stays high enough to see mobs and fog
stays outside melee range. Pins both, plus the invariant that a dimmer key light is
compensated by a stronger hemisphere, so a later tuning pass cannot quietly darken
the world past playable."
```

---

### Task 6: Live visual verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Use the Browser pane preview (`preview_start` with `{name: "dev"}`), never a bare `npm run dev` in Bash.

- [ ] **Step 2: Capture Classic at a fixed camera**

Open `http://localhost:5321/?visual=classic`, create an offline character, enter the world, then pin the camera by running in the page console:

```js
const p = window.__game.sim.player;
p.pos.x = 0; p.pos.z = -40; p.pos.y = 8; p.onGround = true;
p.prevPos = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
p.hp = p.stats?.maxHp ?? 100;
```

Screenshot. This is the control.

- [ ] **Step 3: Capture Emberwood at the SAME camera**

Open `http://localhost:5321/?visual=emberwood`, repeat the identical teleport, screenshot.

The position and seed MUST match step 2. A comparison at different camera positions proves nothing and flatters the change.

- [ ] **Step 4: Judge against the acceptance criteria**

The Emberwood capture passes only if ALL of these hold:

1. The scene reads as night, not as dimmed day.
2. Building windows glow warm and are the brightest thing in frame.
3. Distant terrain falls into blue fog rather than standing crisp.
4. The player character is clearly readable against the ground.
5. Nearby mobs are identifiable as mobs at normal camera distance.

Criteria 4 and 5 are the readability floor. If either fails, RAISE `hemiIntensity` in `src/render/emberwood/lighting.ts` and update the pinned value in `tests/emberwood_render_policy.test.ts`, then recapture. Do not proceed with a build that fails them.

- [ ] **Step 5: Confirm Classic is visually unchanged**

Compare the step 2 capture against `git stash`-ed pre-change Classic, or simply confirm it looks like the daylight build shipped before this plan. Every change in tasks 1 through 4 is inside an `emberwood` branch, so any visible Classic change is a bug.

- [ ] **Step 6: Commit the screenshots**

```bash
mkdir -p docs/screenshots
# save the captures as emberwood-nightfall-before.png and emberwood-nightfall-after.png
git add docs/screenshots/emberwood-nightfall-*.png
git commit -m "docs(screenshots): before and after for Emberwood Nightfall

Same seed and camera position in both captures so the comparison is honest."
```

If screenshots cannot be persisted to disk in this environment (a known limitation hit earlier in this session), skip this step and say so explicitly in the final report rather than claiming screenshots exist.

---

### Task 7: Full gate

**Files:** none (verification only)

- [ ] **Step 1: Format every changed file**

```bash
npx @biomejs/biome check --write src/render/emberwood/lighting.ts src/render/emberwood/materials.ts src/render/emberwood/motes.ts src/render/emberwood/index.ts src/render/props.ts src/render/motes.ts src/render/renderer.ts tests/emberwood_render_policy.test.ts tests/emberwood_materials.test.ts tests/emberwood_motes_profile.test.ts
```

- [ ] **Step 2: Scan for copy-rule violations before the hook does**

```bash
git diff origin/main...HEAD | perl -CSD -ne 'next unless /^\+/ && !/^\+\+\+/; my $c=substr($_,1); print "VIOLATION: $c" if $c =~ /[\x{2013}\x{2014}\x{2015}\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{FE0F}]/'
```

Expected: no output. Any hit blocks the push; fix it now rather than after a failed push.

- [ ] **Step 3: Run the gate**

```bash
npm run gate > /tmp/gate-nightfall.log 2>&1; echo "GATE_EXIT_CODE=$?" >> /tmp/gate-nightfall.log
```

Never pipe this through `tee` or `tail`: that reports the pipe's exit code, not the gate's, and has already masked a real failure once in this session.

- [ ] **Step 4: Read the result**

```bash
tail -3 /tmp/gate-nightfall.log; grep -n "\[gate\]" /tmp/gate-nightfall.log
```

Expected: `GATE_EXIT_CODE=0`.

If the vitest step fails, check whether the failures are `Test timed out` with no assertion failures. That is the documented full-suite contention flakiness, not a regression: confirm by re-running the named files in isolation with `npx vitest run tests/<file>.test.ts`. Only assertion failures indicate a real problem.

- [ ] **Step 5: Commit any gate-required fixes**

```bash
git add -A
git commit -m "style(render): satisfy the changed-files biome gate"
```

Skip if the gate was clean.

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 5.1 Night lighting policy | Task 1 |
| 5.2 Emissive amber windows | Task 2 |
| 5.3 Ember atmosphere | Task 3 |
| 5.4 Readability floor | Task 1 (value), Task 5 (pin), Task 6 step 4 (live check) |
| Section 4 fog reconciliation | Task 4 |
| Section 7 verification | Tasks 6 and 7 |
| Section 6 "Classic provably unchanged" | Task 2 test 3 and 4, Task 6 step 5 |

No spec requirement is unimplemented.

**Type consistency:** `MatOverride` is defined in Task 2 step 3 and used in that same task and the barrel. `MoteProfile` is defined in Task 3 step 3 and re-exported in step 8. `outdoorFogForTheme` has one signature, introduced in Task 4 step 3 and consumed in step 5. `LightingPolicy` is unchanged: Task 1 only alters values, adding no fields.

**Ordering note:** Task 2 must precede Task 3, because Task 2 exports `MAT_OVERRIDES` and creates the pattern the later selectors follow. Task 4 is independent and could run at any point. Tasks 6 and 7 must be last.

**Known risk:** Task 2 exports a previously private constant from `src/render/props.ts`. That widens that module's public surface by one table. The alternative, duplicating the whole table inside `emberwood/materials.ts`, would guarantee the two copies drift, which is worse. The `adds no keys that classic does not have` test in Task 2 catches accidental divergence.
