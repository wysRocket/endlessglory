# Eastbrook Town Square Visual Rebuild

**Date:** 2026-07-31

**Status:** Approved direction, ready for implementation planning

## 1. Purpose

Eastbrook (the starter zone's town hub, `zone1.ts`) currently reads as a bare
functional layout: four generic village-kit buildings, a well/statue, three
market stalls, and a bonfire, all built from the shared `village` GLB kit that
every town in the game reuses verbatim. The user wants Eastbrook to feel like a
distinct, dressed, lived-in town square, closer in mood to a reference concept
image (warm stone plaza, blue-and-gold banners and roof trim, a lit bonfire
square, awninged market stalls, soft golden-hour lighting), without touching
gameplay.

This is a presentation-only rebuild of one zone's town hub. It does not
replace or redesign the game's overall art direction (contrast with the
broader `2026-07-19-endlessglory-asset-redesign-design.md`), and it does not
touch `src/sim/`.

## 2. Scope

### In scope
- New Three.js decorative geometry/VFX around the existing Eastbrook hub:
  paved plaza + paths, banners/bunting, market awnings, lantern posts, a
  planter/seating ring around the statue and bonfire.
- Procedural cobblestone texture (canvas-generated, no image assets).
- A new render module pair (pure core + thin painter) that plans and paints
  this dressing, scoped to the Eastbrook hub only.

### Explicitly out of scope
- Any change to `ZONE1_PROPS` (`src/sim/content/zone1.ts`): building, well,
  stall, fence, campfire, and graveyard positions/sizes/rotations stay
  byte-identical. These double as collision data (`src/sim/colliders.ts`) and
  anchor fixed NPC positions; moving them was explicitly ruled out.
- Any change to quests, NPCs, mobs, or other zone1 sim content.
- Any change to the shared `village` kit's GLB assets or `MAT_OVERRIDES` in
  `src/render/props.ts` (`village:RoofTiles`, `village:Wood`, etc.), since
  those materials are deduped by `(kit, name)` across every town (Fenbridge,
  Highwatch) — changing them would restyle those towns too.
- Generating new custom 3D models (no Meshy/asset-pipeline work this pass).
- A distant castle silhouette (present in the reference image). Cut for this
  pass: least essential element, non-trivial to place well against the
  existing terrain/mountain-wall geometry at the zone edge. Candidate for a
  follow-up once the town square itself is validated.

## 3. Architecture

Two new sibling modules in `src/render/`, following the pure-core +
thin-painter recipe mandated by `src/render/CLAUDE.md` (reference pair:
`nameplate_view.ts` + `nameplate_painter.ts`):

- **`town_dressing_core.ts`** — pure, Three/DOM-free, deterministic. Given the
  Eastbrook hub `{x, z, radius}` and the zone's existing
  `buildings`/`stalls`/`wells` arrays (read from
  `getActiveWorldContent().props`, already merged and available), computes a
  placement *plan*: which building gets which banner/flower-box offset, where
  each stall's awning sits, where lantern posts and plaza-path segments go.
  Placement uses the same deterministic-hash convention already used for
  house-pool/graveyard variety (`keyRand`/`propRand` in `props.ts`), never
  `Math.random`, so the layout is stable across reloads. Registered in the
  `RENDER_PURE_CORES` allowlist (`tests/architecture.test.ts`) and covered by
  a plain Vitest.
- **`town_dressing.ts`** — thin painter. Consumes the plan from the core,
  builds the actual Three.js geometry/materials (reusing `surfaceMat`/
  `textures.ts` canvas-texture conventions from `gfx.ts`), and returns a
  `TownDressingView` shaped like the existing `TerrainView`/`WaterView`
  world-subsystem views: a `group` the renderer owns, plus an
  `update(dt)` for animated bits (banner sway, lantern flicker).

**Wiring:** `renderer.ts` calls `buildTownDressing(hub)` alongside its other
`build*()` calls (`buildTerrain`, `buildProps`, `buildFoliage`, ...). `hub` is
resolved by finding the `eastbrook_vale` zone in `ZONES` (`src/sim/data`,
already imported the same way by `terrain.ts`) and reading its `hub` field —
not by guessing positions. This makes the Eastbrook-only scoping structural:
the module is never invoked for any other zone's hub, so Fenbridge/Highwatch
are untouched by construction, independent of the shared-material concern
above.

## 4. Components

1. **Plaza ground overlay.** A terrain-following stone-paved disc under the
   hub (vertices sampled from `groundHeight`, same as every other prop
   placement, per the render CLAUDE.md's "terrain height = sim height"
   invariant), sized to a fraction of `TOWN_RADIUS`, plus narrower paved path
   segments connecting the well/statue plaza to each of the 4 existing
   buildings and 3 stalls. Cobblestone texture is a runtime canvas texture
   (`textures.ts` `makeCanvas` pattern), not an image asset.
2. **Building dressing.** For each of the 4 existing buildings: a blue/gold
   cloth banner/pennant at the roofline (a simple flag mesh with a wind-sway
   vertex shader driven by `sharedUniforms.uTime`, the same shared clock every
   other wind/water shader already reads) and a small flower box under a
   window. Both are new geometry anchored to the building's existing
   transform (`x/z/rot`) — no edits to the building's own GLB/materials.
3. **Market stalls.** A blue/gold cloth awning quad over each of the 3
   existing stalls, instanced/merged since it's a repeated element (same
   `instanceBatches` pattern `props.ts` already uses for fences/graves).
4. **Statue plaza + bonfire.** The existing statue (the well slot at (0,2),
   already special-cased in `props.ts` as `statueArchangel`) gets a low paved
   ring/planter border; the existing town bonfire gets a simple log-seating
   ring around it. Both purely decorative additions around already-fixed
   positions; no collider or footprint changes.
5. **Ambient lighting.** A small number of lantern posts along the new paved
   paths: warm `PointLight` + glow sprite, instanced. Gives the golden-hour/
   bonfire-lit warmth from the reference image without touching global sky or
   post-processing settings (which are shared across the whole game).

All new materials are dedicated to this module (never reusing/mutating
`village:*` `MAT_OVERRIDES`), so there is zero risk of visual bleed into other
towns.

## 5. Data flow

`buildTownDressing(hub)` runs once at world build time (same lifecycle as
`buildProps`/`buildFoliage`), reading already-resolved zone content
(`getActiveWorldContent().props`) — no new `IWorld` surface, no new sim data,
no new `SimEvent`. The returned `TownDressingView.update(dt)` is ticked from
`renderer.ts`'s `sync()` for the small set of animated elements (banner sway,
lantern flicker); everything else is static geometry frozen after build, per
the existing "reuse, don't allocate" performance discipline.

## 6. Performance

- Repeated elements (lanterns, awnings, banners) use the existing
  `instanceBatches`/merge-per-band pattern already in `props.ts` — no new
  per-frame allocations.
- Total new draw calls are bounded by construction: one town's worth of
  dressing (4 buildings, 3 stalls, 1 plaza, a handful of lanterns), not a
  per-tile or per-frame cost.
- No change to `render_budget.ts` tiers; this is unconditional extra geometry
  for one town, evaluated against the existing frame budget like any other
  prop addition. If it measurably regresses frame time, gate the density (not
  the correctness) behind `GFX` tiers the same way other decorative density
  already is.

## 7. i18n

No new player-visible strings — this is pure geometry/VFX. No `t()` keys, no
`src/ui/i18n.catalog/` changes, no Guide/wiki regen needed.

## 8. Testing & verification

- `town_dressing_core.ts` gets a plain Vitest: deterministic placement (same
  input plan twice → identical output), correct element counts per building/
  stall/lantern given the known Eastbrook prop data, and no placement that
  overlaps an existing building/stall footprint.
- Manual verification via the dev server: visually confirm the plaza reads as
  a coherent dressed square, banners/awnings don't clip through buildings, and
  performance stays smooth (no new stutter) walking around the hub.
- Before/after screenshots (desktop + mobile), committed under
  `docs/screenshots`, per the repo's default visual-change workflow (the
  `pr-screenshots` skill has the capture recipe).
- `npm run gate` before calling the change done.

## 9. Risks and mitigations

**Risk: new geometry clips through existing buildings/stalls given their
fixed positions/rotations.** Mitigation: the pure core's Vitest asserts no
placement overlaps an existing footprint; manual visual pass catches anything
the test misses.

**Risk: shared-clock wind-sway shader interacts oddly with other
`sharedUniforms.uTime` consumers.** Mitigation: reuse the existing pattern
(read-only consumption of the same uniform other wind/water shaders already
use), no new global state.

**Risk: scope creep back into "new layout" or "new zone" territory.**
Mitigation: this spec explicitly freezes `ZONE1_PROPS` and all zone1 sim
content as out of scope; any request to move a building or add a new
sim-content fixture is a different, separately-scoped change.

## 10. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-31 | Reskin Eastbrook only, not a new zone/world | User confirmed: keep existing zone data (mobs, quests, NPCs, layout data); redesign only the Three.js presentation. |
| 2026-07-31 | Reuse the existing village GLB kit; no new 3D models | Fast, safe, stays consistent with the rest of the game's art direction; avoids a Meshy/asset-pipeline pass. |
| 2026-07-31 | Keep `ZONE1_PROPS` positions fixed; add only render-layer decor | Building/well/stall/fence/campfire positions double as collision data and anchor fixed NPC spots. |
| 2026-07-31 | Match the reference image's mood via new banner/awning/lantern geometry, not by recoloring the shared kit | The shared `village:*` materials are deduped across every town; recoloring them would restyle Fenbridge/Highwatch too. |
| 2026-07-31 | Cut the distant castle silhouette from this pass | Least essential reference element; non-trivial placement against existing terrain/mountain geometry for comparatively little payoff. |

## 11. Approval record

Design proposed via brainstorming dialogue (scope, asset strategy, layout-data
constraints, and mood/palette each confirmed by the user in turn); user
approved the full design as presented before this spec was written.
