# Eastbrook Vale to Volcano Biome Conversion

**Date:** 2026-07-31

**Status:** Approved direction, ready for implementation planning

## 1. Purpose

The starter zone (`zone1.ts`, id `eastbrook_vale`) currently renders as a green
pastoral vale (`biome: 'vale'`). The user wants it converted to a volcanic
biome: scorched ground, sparse vegetation, ember-toned sky and light, while
preserving every mechanic (mob stats, loot, quest objectives, NPC roles, item
rewards) exactly as they are today. This follows immediately after
[`2026-07-31-eastbrook-town-dressing-design.md`](2026-07-31-eastbrook-town-dressing-design.md)
(now shipped): that spec's town-square dressing (plaza, banners, lantern
warmth, a standalone volcanic skyline landmark) stays as-is and is left
untouched by this change.

## 2. Key finding that shapes this spec

`BiomeId` (`src/sim/types.ts`) already includes `'volcano'` as a full member,
and it is **already wired end to end** through the renderer and sim, just
never assigned to any zone:

- `src/render/terrain.ts`: `BIOME_PALETTE.volcano` (ground color), `ROCK_SLOPE_START.volcano = 0.35` (rock creeps in earliest of any biome), splat blending treats `volcano` like `peaks`/`cave` (rockier, less grass).
- `src/sim/world.ts`: `BIOME_SHAPE.volcano` (terrain height/hub shape), a `biome === 'volcano'` branch in the heightfield generator.
- `src/render/foliage.ts`: `volcano` gets the lowest tree density of any biome (`0.05`) and its non-tree decoration defaults to `'bush'` — sparse scrub, no forest canopy.
- `src/render/sky.ts`: `volcano` has its own HDR environment maps, fog gain/clamp, and sun-angle constants.
- `src/render/motes.ts`: `volcano: 0xe8a070` — warm ember-orange ambient motes already defined.
- `src/render/renderer.ts`: `volcano: { color: 0x8a7468, near: 50, far: 220 }` fog band already defined.

So the render-layer change is structurally a **one-line biome flag flip**, not
new rendering code. This spec is almost entirely about the CONTENT (text)
pass that goes with it, and verifying the existing volcano pipeline actually
looks good applied to a real, played zone (it has never been exercised by any
shipped zone before).

## 3. Scope

### In scope
- `src/sim/content/zone1.ts`: `ZONE1_ZONE.biome: 'vale' → 'volcano'`.
- Rename `ZONE1_ZONE.name` ("Eastbrook Vale" → **"Eastbrook Scar"**).
- Rename POI labels (the `pois[].label` fields) that read as incongruous
  against scorched/volcanic terrain. Ids never change.
- Rename mob/NPC display `name` fields that reference greenery, water, or
  forest imagery that no longer fits. Ids never change; stats, loot tables,
  spawn logic, aggro, everything mechanical is untouched.
- Rewrite quest `text`/`completionText`/NPC `greeting` prose for tone where it
  actively references vale/forest/water imagery that no longer makes sense.
  `objectives`, `xpReward`, `copperReward`, `itemRewards`, `giverNpcId`,
  `turnInNpcId(s)`, `requiresQuest`, ids: byte-identical. Every `$N`/`$C`
  placeholder preserved verbatim.
- `npm run wiki:content` regen (guide freshness gate) in the same change.
- Manual verification of the zone1/zone2 (marsh) boundary blend and the
  volcano foliage/terrain look in the live client.

### Explicitly out of scope
- Any change to mob/NPC/quest/zone **ids**, stats, loot, spawn counts,
  aggro/AI, quest objectives, item rewards, or XP/copper values. This is a
  reskin of display text and one render flag, not a content or balance pass.
- Reskinning mob VISUALS (models/colors) — the "also reskin the mobs" option
  was explicitly declined. A wolf mob keeps its wolf model; only its display
  name may change (e.g. "Forest Wolf" → "Ashfang Wolf").
- Any change to `ZONE1_PROPS` (building/well/stall/fence/campfire/graveyard
  positions) or the town dressing built in the prior spec — both stay exactly
  as shipped. The town's blue/gold palette is a deliberate contrast (an
  ordered outpost amid a transformed wasteland), not an inconsistency to fix.
- Any change to zone2's `biome: 'marsh'` or the cross-zone blend logic itself
  — per the approved decision, the existing blend is trusted as-is.
- New GLB assets, new textures, new render code. This spec uses only the
  already-wired volcano biome pipeline plus content-file text edits.

## 4. Content rename plan

### Rule
Rename a label/name only when it actively clashes with scorched/volcanic
terrain (green, forest, or "fresh water" imagery). Leave it alone when it's
biome-neutral (a person's name, an occupation, a structure, or content that
already fits or reads fine ambiguously). When in doubt, prefer the smaller
edit — this is a tone pass, not a rewrite.

### Confirmed anchors (already agreed)
| Field | Current | New |
|---|---|---|
| `ZONE1_ZONE.name` | "Eastbrook Vale" | "Eastbrook Scar" |
| POI label (`mirror_lake`) | "Mirror Lake" | "Glasswater Lake" |
| POI label (`brightwood_glade`) | "Brightwood Glade" | "Emberwood Glade" |
| POI label (`the_sowfield`) | "The Sowfield" | "The Cinderfield" |
| Mob name (`forest_wolf`) | "Forest Wolf" | "Ashfang Wolf" |
| Mob name (`wild_boar`) | "Wild Boar" | "Ash Boar" |

Mob name `warlock_imp` → "Fire Demon" and `warlock_voidwalker` → "Void Demon"
already fit a volcanic vale and need no change — a nice pre-existing
coincidence. `hub.name: 'Eastbrook'` (the town itself) is unchanged, per
Section 3.

### What the implementation plan still needs to enumerate
`zone1.ts` has ~15 mobs, ~14 NPCs, and roughly a dozen quests with flavor
text (`ZONE1_MOBS` lines 52-533, `ZONE1_NPCS` lines 534-818, `ZONE1_QUESTS`
lines 819-1209 as of this writing — anchor by content, these line numbers
will drift). The plan's job is a full pass over each, applying the rule
above, keeping a running table of "keep as-is" vs "renamed to X" so the
change is auditable. Expect most NPC names to survive unchanged (people and
occupations: "Marshal Redbrook," "Smith Haldren," "Trader Wilkes," "Apothecary
Lin," "Brother Aldric," "Cook Marlow" — a smith arguably fits BETTER next to
volcanic ore/heat). Content most likely to need a pass: anything mentioning
"the lake," "the woods/forest," "green," "the vale's fields," or wildlife
grazing/foraging language dependent on live vegetation. `fisherman_brandt`
and the lake-adjacent quests need a specific editorial call in the plan: does
"Glasswater Lake" still support fishing narratively (a hot, mineral-glassed
lake can still have fish/eels in-fiction), or does that NPC's role need a
lighter adjustment? Flag it, don't presuppose it here.

### Bonus consistency win
`src/render/props.ts` already places a `lavaHouse` landmark (a Meshy-generated
molten dwelling) near `(-5, -52)` with a comment noting it's a leftover from
an older layout, sitting oddly in the currently-green vale. Once the zone is
volcanic this stops being an anomaly and starts being a natural fit — no
change needed there, just noting it resolves itself.

## 5. i18n

Mechanically free. Per `src/sim/content/CLAUDE.md`, the canonical English
source for mob/NPC/quest/zone display names is `src/ui/world_entity_i18n.ts`,
which reads the live `MOBS`/`NPCS`/`QUESTS`/`ZONES` tables by a fixed **id**
list — since no id changes, no catalog surgery is needed; changed English
text in the content file IS the new source of truth automatically. Every
other locale simply goes stale/`pending` for the changed strings until a
translator fills them at release time, which is the existing, expected
lazy-locale workflow (see `docs/i18n-scaling/translation-workflow.md`) — not
something this change needs to author.

The S3 guard (`tests/localization_fixes.test.ts`) governs DYNAMIC sim-emitted
text (`this.error`/`this.notice` runtime strings in `sim.ts`/combat modules),
not static content-table prose, so it is not expected to be touched by this
change; run it anyway as part of verification since it's cheap and would
catch a surprise.

## 6. Testing & verification

- `npx vitest run tests/progression.test.ts`: referential integrity (every
  loot table, vendor stock, camp, and dungeon spawn resolves) — must stay
  green since no id changes; this is the primary regression gate for this
  change.
- `npx vitest run tests/localization_fixes.test.ts`: cheap sanity check per
  Section 5.
- `npm run wiki:content` regen, committed in the same change (guide freshness
  gate fails CI on a stale `src/guide/content.generated.ts` otherwise).
- Manual verification via the dev server: walk the zone1/zone2 boundary and
  confirm the blend reads as intentional, not broken; confirm the volcano
  foliage (sparse bush, no forest canopy) doesn't leave anything looking
  obviously unfinished (e.g. a quest camp that assumed forest cover for
  ambush flavor); confirm the town square (built in the prior spec) still
  reads correctly against the new surrounding terrain.
- Before/after screenshots (desktop + mobile) of the town square and at least
  one wilderness POI, per the repo's visual-change convention.
- `npm run gate` before calling the change done.

## 7. Risks and mitigations

**Risk: a quest's flavor text implies terrain/vegetation the volcano biome no
longer has** (e.g. "hidden in the underbrush," "the loggers' trail"). *Mitigation:* the plan's per-entity pass is explicitly scoped to catch this category; flag anything ambiguous rather than guessing.

**Risk: renamed POI labels look inconsistent with quest text that still
refers to the OLD name in prose** (label renamed, but a quest's narrative text
still says "head to Mirror Lake"). *Mitigation:* the plan greps for the old
label strings across `zone1.ts` after each rename to catch stale references
in the same change.

**Risk: the volcano biome pipeline, never exercised by a shipped zone before,
has a rough edge** (a bad color blend, a missing HDR asset, foliage that pops
oddly at the vale/marsh seam). *Mitigation:* this is exactly why Section 6
calls for live manual verification and boundary walking before calling this
done — the render code is trusted but unproven in practice.

## 8. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-31 | Flip `ZONE1_ZONE.biome` to `'volcano'`, reuse the existing (unused) volcano render pipeline | Fully wired already; the alternative (new biome code) would be redundant work. |
| 2026-07-31 | Rename POI labels and flavor text, but preserve every mob/quest/NPC id and all mechanics | User's explicit choice: a tone pass, not a content/mechanics rewrite. |
| 2026-07-31 | Do not reskin mob visuals | User declined the larger "also reskin the mobs" option; models/colors stay. |
| 2026-07-31 | Trust the existing zone1/zone2 cross-zone blend as-is | User's explicit choice; no new blend-tuning work. |
| 2026-07-31 | Leave the town's blue/gold dressing palette unchanged | Deliberate "ordered outpost vs. transformed wasteland" contrast, not corrected as an inconsistency; open to revisiting if it reads badly in practice. |

## 9. Escalation addendum (2026-07-31, post-content-pass): real lava ground

Live verification after the content rename pass (Section 6) surfaced a real gap: the
`'volcano'` `BiomeId`'s sky/backdrop assets are placeholders borrowed from other biomes
(`sky.ts` points `volcano` at `marsh_overcast.hdr` and the `peaks` mountain backdrop; no
fire/lava-toned environment map exists anywhere under `public/env/`), and the terrain's
texture-blend system only leans away from the grass splat texture on steep slopes or
near water/roads/hub-dirt — a flat starter-town zone stays mostly grass-textured (just
recolored dark) everywhere else. The ground palette change (Section 2) is real and
confirmed live, but on its own it reads as "darker vale," not "lava world."

User confirmed (2026-07-31) wanting a genuine lava-ground look, scoped as two small,
low-risk additions (explicitly NOT a sky/atmosphere rework, which stays out of scope
per this addendum, same as the original spec deferred it):

1. **Rock-leaning ground texture.** A single new `else if (biome === 'volcano')` branch
   in `src/render/terrain.ts`'s `sampleVertex`, added strictly alongside the existing
   `if (painted)` branch (never inside it), so it only ever fires for a zone whose OWN
   base biome is volcano - currently only zone1. Vale/marsh/peaks/beach/desert/cave
   zone-level behavior is provably untouched (the new branch's condition never matches
   their biome). Existing slope/road/hub/shore layering still applies on top unchanged.
2. **Scattered lava-crack ground decals.** A new pure-core + thin-painter pair
   (`lava_crack_scatter_core.ts` + `lava_crack_scatter.ts`), following the same
   module-first recipe as the town dressing: a deterministic grid-jittered scatter
   (hash2, never `Math.random`) across zone1's ground, excluding the town hub (kept
   clean, per the original spec's "ordered outpost" contrast) and the zone's lake. Each
   decal is an instanced flat rock-and-crack textured quad (one draw call for every
   instance) plus one small warm glow sprite per decal, reusing the exact
   `radialGlowTexture()` + additive-sprite pattern already shipped for the town's
   lanterns and skyline landmark - no new material capability, no shared-shader change.

Both pieces are new, additive, zone1-scoped code; neither touches `ZONE1_PROPS`, sim
content, or any other zone's rendering.

## 10. Approval record

Proposed via brainstorming dialogue after the town-dressing spec shipped;
scope (existing-content handling, zone-boundary handling) confirmed by the
user via two explicit choices before this spec was written. User approved
the full design as presented.
