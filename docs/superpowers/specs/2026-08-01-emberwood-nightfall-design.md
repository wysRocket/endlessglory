# Emberwood Nightfall: world lighting and atmosphere

**Date:** 2026-08-01

**Status:** Approved design, ready for implementation planning

**Program:** sub-project 1 of 3 (see Section 8)

## 1. Purpose

The user supplied three reference images and asked that the game look like them.
Reading the current build against those references, the assets are largely already
present: the `emberwood` visual theme ships 66 mapped assets including
`amber_heart_golem.glb`, the Eastbrook building set, emberwood terrain textures,
foliage, NPCs, and HDR environment maps, and the live Vercel build already runs
`VITE_VISUAL_THEME=emberwood`.

What is missing is lighting. The references are all night scenes: deep teal-blue
ambient with warm amber light punching out of windows, heavy fog, strong contrast.
The current build renders as flat, washed-out midday. That single difference
accounts for most of the perceived gap, and it lives entirely in `src/render/`.

This sub-project closes that gap. It changes no sim state, no content, and no assets.

## 2. Art direction decision (resolved)

The references show a living dark-forest village. Eastbrook was converted earlier
the same week into Eastbrook Scar, a volcanic ash wasteland
(see [`2026-07-31-eastbrook-scar-volcano-biome-design.md`](2026-07-31-eastbrook-scar-volcano-biome-design.md)).
Those are competing art directions for one zone.

**Decision (user, 2026-08-01): keep the volcanic zone, borrow only mood.** Eastbrook
Scar stays scorched. From the references this sub-project takes the night lighting,
the teal-versus-amber contrast, the glowing windows, and the ember atmosphere, and
applies them over the ash and lava world rather than over a forest. Lava and ember
glow read better against a night palette than they ever did against daylight, so
the two directions reinforce each other once the light is right.

Explicitly NOT adopted from the references: the living tree canopy, moss, and green
forest floor. Those contradict the Scar and are out of scope here.

## 3. Key finding that shapes this spec

`src/render/emberwood/lighting.ts` already exists as exactly the right seam, and it
is already wired into `renderer.ts`. But its Emberwood row is barely distinguishable
from Classic:

| Field | Classic | Emberwood (today) |
|---|---|---|
| `sunIntensity` | 2.8 | 2.8 (identical) |
| `hemiColor` | 0xdcefff | 0xdcefff (identical) |
| `hemiGround` | 0x465f39 | 0x465f39 (identical) |
| `hemiIntensity` | 0.45 | 0.45 (identical) |
| `fogColor` | 0xa6c6e0 | 0x607487 |
| `sunColor` | 0xffedd0 | 0xffd6a3 |

Only two tint values differ, and neither changes brightness. That is why the theme
still reads as noon. **This sub-project is mostly about making an existing policy
module mean something, not about building new architecture.**

There is no day/night cycle in the codebase, so lighting is static and a "night
look" is a policy value, not a new system.

## 4. Second finding: the Emberwood fog override is now dead code

`Renderer.outdoorFogPreset()` contains:

```ts
if (ACTIVE_VISUAL_THEME === 'emberwood' && biome === 'vale') {
  return { ...preset, color: 0x607487 };
}
```

Eastbrook's biome became `volcano` on 2026-07-31. This branch keys on `vale`, so it
no longer fires for the zone it was written for, and Eastbrook silently falls through
to `BIOME_FOG.volcano` (`0x8a7468`, a brown haze). Nobody noticed because the biome
flip and this override were authored independently.

This also means there are TWO fog paths: `lightingForTheme().fogColor` seeds the
scene fog at construction, and `outdoorFogPreset()` overrides it per biome every
frame outdoors. The implementation plan MUST reconcile them rather than tuning one
and being silently overridden by the other. Preferred resolution: the theme policy
owns the night palette and `outdoorFogPreset()` consults it, so there is one source
of truth instead of a hardcoded biome equality test that rots on the next biome change.

## 5. Components

Four pieces, each small and independently revertible.

### 5.1 Night lighting policy
`src/render/emberwood/lighting.ts`. Rewrite the Emberwood row to a real night: sun
intensity down substantially, sun tint to a cool moon-amber, hemisphere sky to teal
blue over a warm ash-lit ground so bounce light reads as lava rather than grass, fog
nearer and darker so ridgelines fall away into blue depth. Pure data in an existing
table with an existing consumer.

### 5.2 Emissive amber windows
`src/render/props.ts` `MAT_OVERRIDES`. The entry `'village:Windows'` is currently
`{ emissive: 0x2a3c55, emissiveIntensity: 1.1 }`, a cold blue barely above black.
Emberwood retints it to hot amber at high intensity. This is the single highest
impact change in the sub-project: what makes references 2 and 3 read is dark mass
punched through with warm light, and the building set is already in place to carry it.

Because `MAT_OVERRIDES` is a flat global table, the plan must decide how to vary it
by theme without breaking Classic. Preferred: a theme-aware selector alongside the
existing palette selectors in `src/render/emberwood/`, consistent with that module's
stated contract ("Add new selectors here, not new methods on the Renderer class").

### 5.3 Ember atmosphere
`src/render/motes.ts` already defines `volcano: 0xe8a070` and scales count by tier
(`GFX.standardMaterials ? 80 : 30`). Raise density and drift for the volcano band so
embers rise through frame the way they do in all three references. Tier scaling stays.

### 5.4 Readability floor (a constraint, not a feature)
`src/render/emberwood/CLAUDE.md` requires that presentation "never hides actionable
gameplay information", and `renderer.ts` carries a matching comment that a healthy
hemisphere "keeps the whole competitive space readable". A night world must not hide
the wolf that is eating you.

Therefore: ambient gets a hard floor below which the policy may not go, and character
silhouette separation is preserved using the fresnel rim already implemented as
`addRimGlow()` in `gfx.ts`. Nameplates, cast bars, and health are HUD surfaces and
are unaffected by scene lighting, so they stay readable by construction.

This constraint outranks fidelity to the references. A screenshot that looks
magnificent and plays badly is a failure.

## 6. Scope

### In scope
- `src/render/emberwood/lighting.ts`: real night values for the Emberwood row.
- A theme-aware material-override selector in `src/render/emberwood/` for emissive windows.
- `src/render/props.ts`: consume that selector.
- `src/render/motes.ts`: ember density and drift for the volcano band.
- `Renderer.outdoorFogPreset()`: reconcile the two fog paths and remove the stale
  `biome === 'vale'` equality test.
- Tests: extend `tests/emberwood_render_policy.test.ts`, including a pin on the
  readability floor so a future tuning pass cannot quietly darken past it.

### Out of scope
- Any sim, content, quest, mob, or `ZONE1_PROPS` change.
- New GLB assets or textures. This uses what already ships.
- The HUD (sub-project 2) and creature emissives (sub-project 3).
- A day/night cycle. Lighting stays static.
- Camera angle. The references sit higher than the current third-person rig;
  changing camera framing affects controls and is deliberately deferred.

## 7. Verification

- `tests/emberwood_render_policy.test.ts` extended, plus the readability-floor pin.
- `npx tsc --noEmit`, the architecture guard, and `npm run gate`.
- Live before and after screenshots at a FIXED camera position and seed, so the
  comparison is honest rather than flattering. Both themes captured, since Classic
  must be provably unchanged.
- Explicit check that Classic is byte-identical in behavior: every change is either
  inside an `emberwood` branch or in a table row Classic does not read.

## 8. The wider program

| # | Sub-project | Reference | Surface | Status |
|---|---|---|---|---|
| 1 | Emberwood Nightfall | 2 and 3 (world) | `src/render/` | this spec |
| 2 | Isometric HUD | 3 (interface) | `src/ui/`, `src/styles/` | not started |
| 3 | Molten creatures | 1 | `src/render/characters/` | not started |

Order chosen by the user. Track 1 first because it is the largest visual payoff per
unit of work, it is pure presentation with no gameplay risk, and tracks 2 and 3 both
present better against a finished night world than against flat daylight.

Sub-projects 2 and 3 get their own spec, plan, and gate. Sub-project 2 in particular
is a large program governed by the staged rollout in the repo-root `DESIGN.md`.

## 9. Honest limitation

The references are AI concept paintings with hand-painted lighting and detail. A
real-time Three.js renderer drawing procedural geometry and instanced GLB kits will
not match them pixel for pixel, and this spec does not promise that. What it targets
is the mood: palette, contrast, light sources, density, and silhouette. That is what
actually makes a screenshot read like the reference.

## 10. Approval record

Gap analysis, decomposition, and the art-direction reconciliation were presented and
approved by the user on 2026-08-01. The user selected "keep volcanic, borrow only
mood and HUD" for art direction and "all three, in that order" for program scope.
