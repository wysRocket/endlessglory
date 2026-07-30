# World-Redesign Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three reusable skills, `woc-world-structures`, `woc-world-mechanics`,
and `woc-world-creatures`, giving a future session the tooling to redesign World of
ClaudeCraft's internal world (structures, zone/dungeon mechanics, and creature/NPC
visuals), each with a Claude-facing entry and a Codex-parity companion.

**Architecture:** Each skill is a short, pointer-heavy `SKILL.md` (matching the
existing `woc-feature-plan` house style: reference canonical instructions instead of
restating them), registered three ways: `.claude/skills/woc-world-<name>/SKILL.md`
for Claude, and both `SKILL.md` and `agents/openai.yaml` under
`.agents/skills/woc-world-<name>/` for Codex, mirroring how every other `woc-*` skill
is laid out. There is no application code and no traditional
unit test here; "verification" means confirming every file path, script, and function
name the skill text references actually exists in the live repo, so the content is
never hallucinated or stale by the time it ships.

**Tech Stack:** Markdown (SKILL.md, YAML frontmatter), YAML (openai.yaml), grep/ls for
reference verification, git for commits.

---

## Spec reference

Full design rationale, precedent, and decision log:
[`docs/superpowers/specs/2026-07-21-world-redesign-skills-design.md`](../specs/2026-07-21-world-redesign-skills-design.md).
Read it if any task below is unclear about *why*, not just *what*.

## Scope check

This plan covers exactly the three skills the spec defines; it does not touch Slice
A's outstanding wiring (the unwired Emberwood NPC/building assets) or write the
Slice B/C/D redesign plans themselves. Those are follow-on work the finished skills
are *for*, not part of building them.

## File structure

| File | Responsibility |
|---|---|
| `.claude/skills/woc-world-structures/SKILL.md` | Claude-facing entry: static buildings/props/dressing/weapons |
| `.claude/skills/woc-world-mechanics/SKILL.md` | Claude-facing entry: zone/dungeon room layout and mechanics |
| `.claude/skills/woc-world-creatures/SKILL.md` | Claude-facing entry: NPC/mob visual sourcing |
| `.agents/skills/woc-world-structures/SKILL.md` | Codex-side body (copy of the Claude-facing one) |
| `.agents/skills/woc-world-mechanics/SKILL.md` | Codex-side body (copy of the Claude-facing one) |
| `.agents/skills/woc-world-creatures/SKILL.md` | Codex-side body (copy of the Claude-facing one) |
| `.agents/skills/woc-world-structures/agents/openai.yaml` | Codex manifest |
| `.agents/skills/woc-world-mechanics/agents/openai.yaml` | Codex manifest |
| `.agents/skills/woc-world-creatures/agents/openai.yaml` | Codex manifest |

**Nine files, three per skill, not six.** Every one of the 8 pre-existing `woc-*`
skills registers as `.agents/skills/<name>/SKILL.md` (the body Codex actually reads)
PLUS `agents/openai.yaml` (the manifest). An openai.yaml alone gives Codex a display
name and a `default_prompt` pointing at a skill with no instructions behind it. The
`.claude/skills/<name>/SKILL.md` entry is new with these three skills; the existing
eight are Codex-only.

Each skill's `SKILL.md` and `openai.yaml` are written and verified together as one
task, then committed, so the working tree is never left with a Claude-only or
Codex-only half of a skill.

---

### Task 1: `woc-world-structures`

**Files:**
- Create: `.claude/skills/woc-world-structures/SKILL.md`
- Create: `.agents/skills/woc-world-structures/agents/openai.yaml`

- [ ] **Step 1: Write the SKILL.md**

```markdown
---
name: woc-world-structures
description: "Add or redesign static, non-animated World of ClaudeCraft world content: buildings, props, terrain dressing, and weapons. Use when a change needs a new building, prop, or static decoration in the game world, or a texture/material fix for an existing one."
---

# World Structures

Add or redesign static-mesh world content: buildings, props, terrain dressing, and
weapons. This is the static-geometry half of world redesign; for zone/dungeon layout
and mechanics use `woc-world-mechanics`, for NPC/mob visuals use `woc-world-creatures`.

## Design authority

If the work is Emberwood-themed, read `docs/superpowers/specs/2026-07-19-endlessglory-asset-redesign-design.md`
section 6.3 (Settlements and architecture), 6.5 (Props, resources, tools, weapons),
and 5.3 to 5.4 (material and color language) before picking a shape or color. That
document is the design authority for what things should look like; this skill covers
how to build and wire them.

## Two pipelines, use the one that fits

1. **New geometry from scratch:** the `$cad` skill (build123d Python to STEP to raw
   GLB export). This is how the Eastbrook house/inn/sword/shield/anvil source
   models were built. Use `$dxf` for a 2D profile input and `$cad-viewer` to review
   the result before committing to it.
2. **Optimizing an existing raw export:** `node scripts/assets/build_assets.mjs
   scripts/assets/specs/<spec>.json`. This resamples, prunes, dedups, and
   texture-compresses a raw DCC/CAD export from `tmp/asset_src/` (gitignored) into the
   shipped, optimized GLB under `public/models/...`. A new asset pack is a NEW spec
   JSON under `scripts/assets/specs/` (see `scripts/assets/CLAUDE.md`), never a
   hardcoded path added to the script itself. Never add `simplify` to a
   `character`/`static` item type: that corrupts hard edges, which is exactly why
   `build_foliage.mjs` exists as a separate script for foliage only.

## Wiring a new or changed asset

- **The asset entry:** `src/render/props.ts`'s `PROP_ASSET_DEFS` record. Each entry
  needs a `url` (under `public/models/...`), a `kit` (a material-dedup namespace
  shared across files in the same pack), and optionally `yaw` (pre-rotation baked into
  geometry), `strip` (a regex to drop unwanted material parts), `color` (a hex tint),
  and `texture` (see below).
- **Placement:** `src/sim/content/zone*.ts`'s `buildings:` array
  (`{ kind, x, z, w, d, rot }`) or `stalls:` array for market stalls. Position (`x`/
  `z`), footprint (`w`/`d`), and rotation (`rot`, radians) all live here.
- **Theme awareness:** check `src/visual_theme_catalog.generated.ts` (generated by
  `scripts/build_visual_theme_manifest.mjs`, never hand-edited) for an existing
  base-to-Emberwood mapping before assuming a new asset needs manual theme wiring.
  Most props already have one.

## The flat-fill trap (read this before tinting anything)

A single-material CAD prop (a `PROP_ASSET_DEFS` entry build123d generates: one mesh,
one material named `o1`) has exactly one color slot. A `color:` tint alone always
renders as a flat, single-hue wash, no matter how much geometric detail the mesh has.

Fix it by ALSO setting `texture:` on the `PropAssetDef` to one of the existing
procedural textures in `src/render/textures.ts`: `plasterTexture()` for a
weathered/patchy wall, `wallTexture()`, `plankTexture()` for wood siding, or
`thatchTexture()` for a roof. `color` still multiplies over the texture as a hue, so
each building keeps its own distinct color while reading as a real painted or
plastered surface. Default to this pairing for any new or retextured static
structure; a bare `color:` with no `texture:` is the mistake to avoid.

## Verification

- `npx tsc --noEmit` after any `props.ts`/`zone*.ts` change.
- `npx vitest run tests/progression.test.ts` if you touched `zone*.ts` placement data
  (it fails CI on a dangling reference; camps/buildings resolve by array position for
  determinism, so APPEND, never insert mid-array, per `src/sim/content/CLAUDE.md`).
- Look at it in the actual running game (`npm run dev`, then a browser) before calling
  a structure change done. A flat-color regression or a stretched/distorted texture
  only shows up visually, never in a type check.
```

- [ ] **Step 2: Verify every path the skill references actually exists**

Run:
```bash
test -f scripts/assets/build_assets.mjs && echo OK-build-assets
test -d scripts/assets/specs && echo OK-specs-dir
test -f scripts/assets/CLAUDE.md && echo OK-assets-claude
test -f scripts/assets/build_foliage.mjs && echo OK-build-foliage
test -f src/render/props.ts && grep -q "PROP_ASSET_DEFS" src/render/props.ts && echo OK-prop-defs
grep -q "buildings:" src/sim/content/zone1.ts && echo OK-buildings-array
test -f src/visual_theme_catalog.generated.ts && echo OK-theme-catalog
test -f scripts/build_visual_theme_manifest.mjs && echo OK-theme-manifest-script
grep -q "export function plasterTexture" src/render/textures.ts && echo OK-plaster
grep -q "export function wallTexture" src/render/textures.ts && echo OK-wall
grep -q "export function plankTexture" src/render/textures.ts && echo OK-plank
grep -q "export function thatchTexture" src/render/textures.ts && echo OK-thatch
test -f docs/superpowers/specs/2026-07-19-endlessglory-asset-redesign-design.md && echo OK-design-doc
test -f src/sim/content/CLAUDE.md && echo OK-sim-content-claude
```

Expected: 14 `OK-*` lines, one per check, no missing ones. If any line is missing,
fix the corresponding claim in the SKILL.md before continuing (the referenced file
moved, was renamed, or never existed, and the skill must not ship a stale pointer).

Note (found during the final full-branch review): this step originally also checked
`.agents/skills/cad/scripts/generators`, a path that never existed in this repo.
`$cad`/`$dxf`/`$cad-viewer` are user-level global skills (`~/.agents/skills/cad/...`,
outside this repo entirely), and even there no `generators` subdirectory exists; the
shipped SKILL.md text was already corrected to drop the specific path claim
(`608fefece`), this verification snippet just hadn't caught up.

- [ ] **Step 3: Write the openai.yaml companion**

```yaml
interface:
  display_name: "World of ClaudeCraft World Structures"
  short_description: "Add or redesign static buildings, props, and dressing"
  default_prompt: "Use $woc-world-structures to add or redesign static World of ClaudeCraft world content: a building, prop, or piece of terrain dressing."
policy:
  allow_implicit_invocation: false
```

- [ ] **Step 4: Verify the YAML parses and the frontmatter is well-formed**

Run:
```bash
node -e "const fs=require('fs'); const yaml=fs.readFileSync('.agents/skills/woc-world-structures/agents/openai.yaml','utf8'); if(!yaml.includes('display_name') || !yaml.includes('default_prompt')) throw new Error('missing required field'); console.log('YAML-OK')"
node -e "const fs=require('fs'); const md=fs.readFileSync('.claude/skills/woc-world-structures/SKILL.md','utf8'); const fm=md.match(/^---\n([\s\S]*?)\n---/); if(!fm || !fm[1].includes('name: woc-world-structures') || !fm[1].includes('description:')) throw new Error('bad frontmatter'); console.log('FRONTMATTER-OK')"
```

Expected: `YAML-OK` then `FRONTMATTER-OK`.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/woc-world-structures/SKILL.md .agents/skills/woc-world-structures/agents/openai.yaml
git commit -m "$(cat <<'EOF'
feat(skills): add woc-world-structures

Adds the Claude-facing skill plus its Codex-parity companion for
adding or redesigning static World of ClaudeCraft world content
(buildings, props, dressing, weapons), per the design spec at
docs/superpowers/specs/2026-07-21-world-redesign-skills-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `woc-world-mechanics`

**Files:**
- Create: `.claude/skills/woc-world-mechanics/SKILL.md`
- Create: `.agents/skills/woc-world-mechanics/agents/openai.yaml`

- [ ] **Step 1: Write the SKILL.md**

```markdown
---
name: woc-world-mechanics
description: "Redesign an existing World of ClaudeCraft zone, dungeon, or delve's room layout, hazards, or boss mechanics. Use when a change reshapes gameplay space or adds a new encounter mechanic, not just its visuals."
---

# World Mechanics

Redesign zone, dungeon, or delve room layout and mechanics: shapes, hazards,
difficulty curves, and boss behavior. This is the gameplay-layer half of world
redesign; for the static geometry/props use `woc-world-structures`, for NPC/mob
visuals use `woc-world-creatures`.

## Design authority and precedent

If the work is Emberwood-themed, `docs/superpowers/specs/2026-07-19-endlessglory-asset-redesign-design.md`
still governs how things should look once this skill has decided how they should
play. For the actual staged METHODOLOGY, read `docs/prd/drowned-litany-redesign.md`
in full: it is the one real precedent in this repo for a room/boss redesign, written
as a live status board plus a "Design summary (agreed with the user)" section plus
a coordinate spec plus per-stage implementation notes. Use its shape as a template,
not just its content.

## The staged template

A redesign of this kind spans sessions, so structure it as a resumable document with
a status table at the top (Stage / Scope / Status columns), updated as each stage
lands, so a fresh session can pick up cold from the "Resume note" left at an
interruption point:

- **Stage 0:** quick prep (a recolor, a simple visual flag) if the redesign needs one.
- **Stage 1 (sim only, no render):** room layout, hazard tiers, a written coordinate
  spec. Convention: room centered at x=0, entry at the low-z end, exit/dais at the
  high-z end. Hazards are typed shallow/deep (or the zone's own hazard-tier
  vocabulary); islands/platforms are visual-only, non-collider dressing anchors.
- **Stage 2 (render):** materials, dressing, anything visual the sim doesn't own.
- **Stage 3 (mechanic):** a new boss ability or sim behavior, sized to the existing
  `SimContext` seam (see below).
- **Stage 4 (verify):** the acceptance checklist below, plus an actual in-game look.

Each stage ends at a green, committable state. That resumability is the actual point:
if a session is interrupted mid-redesign, the next one reads the status board and the
stage's "Resume note," not the whole conversation history.

## Where the behavior lives

Read `src/sim/CLAUDE.md` before touching sim code. Key facts:

- A new self-contained mechanic (a boss ability, a room hazard tick) is a sibling
  module behind the `SimContext` seam (`src/sim/sim_context.ts`), never a new method
  cluster on the `sim.ts` coordinator. Add the callbacks it needs to `sim_context.ts`
  (append-only: never rename or repurpose an existing one) and bind them in
  `Sim.buildSimContext()`.
- Determinism: all randomness through `this.rng`/`ctx.rng`, never `Math.random`. Tick
  phase order is rng-draw-order load-bearing; don't reorder `tick()` casually.
- **Camp/spawn ordering:** append new `{ mobId, center, radius, count }` entries at
  the END of the merged `CAMPS` array in `src/sim/data.ts`. Camps spawn in array
  order, each drawing world-gen RNG, so inserting one earlier moves every later
  camp's spawn position. Never insert mid-array.
- Every new piece of conquerable content (a dungeon, delve, raid, world boss, zone,
  or rare) authors its Book of Deeds records in the SAME change, following
  `docs/design/deeds.md`'s authoring contract. Deeds are cosmetic-only (titles,
  Renown), never power.

## Acceptance checklist

- `npx tsc --noEmit`.
- `npx vitest run tests/architecture.test.ts` (sim purity and determinism backstop).
- `npx vitest run tests/parity` if any rng draw site changed
  (`UPDATE_PARITY=1 npx vitest run tests/parity` to regenerate the golden trace
  deliberately, in its own reviewed commit, never as a side effect).
- `npx vitest run tests/localization_fixes.test.ts` if any player-visible string
  changed (the S3 guard: a new sim-emitted string needs a matching EXACT/RULES entry
  in `src/ui/sim_i18n.ts` in the same change).
- `npm run wiki:content` if any zone/dungeon/mob/NPC name or narrative changed.
- **An actual in-game pass, not just unit tests.** The Drowned Litany redesign's own
  account: a real bug (bells spawning thousands of yards from the fight, because a
  spawn site used the room-local coordinate directly instead of adding
  `run.origin.x`, unlike every other spawn site in the delve) was found by driving the
  live encounter, not by the unit test suite. Screenshot or drive the actual redesigned
  space before calling it done.
```

- [ ] **Step 2: Verify every path the skill references actually exists**

Run:
```bash
test -f docs/prd/drowned-litany-redesign.md && echo OK-litany-doc
test -f src/sim/CLAUDE.md && echo OK-sim-claude
test -f src/sim/sim_context.ts && echo OK-sim-context
grep -q "buildSimContext" src/sim/sim.ts && echo OK-build-sim-context
grep -q "CAMPS" src/sim/data.ts && echo OK-camps
test -f docs/design/deeds.md && echo OK-deeds-doc
test -f tests/architecture.test.ts && echo OK-architecture-test
test -d tests/parity && echo OK-parity-dir
test -f tests/localization_fixes.test.ts && echo OK-localization-test
test -f src/ui/sim_i18n.ts && echo OK-sim-i18n
test -f docs/superpowers/specs/2026-07-19-endlessglory-asset-redesign-design.md && echo OK-design-doc
```

Expected: 11 `OK-*` lines, no missing ones. Fix the SKILL.md before continuing if any
are missing.

- [ ] **Step 3: Write the openai.yaml companion**

```yaml
interface:
  display_name: "World of ClaudeCraft World Mechanics"
  short_description: "Redesign zone/dungeon room layout and mechanics"
  default_prompt: "Use $woc-world-mechanics to redesign a World of ClaudeCraft zone, dungeon, or delve's room layout, hazards, or boss mechanics."
policy:
  allow_implicit_invocation: false
```

- [ ] **Step 4: Verify the YAML parses and the frontmatter is well-formed**

Run:
```bash
node -e "const fs=require('fs'); const yaml=fs.readFileSync('.agents/skills/woc-world-mechanics/agents/openai.yaml','utf8'); if(!yaml.includes('display_name') || !yaml.includes('default_prompt')) throw new Error('missing required field'); console.log('YAML-OK')"
node -e "const fs=require('fs'); const md=fs.readFileSync('.claude/skills/woc-world-mechanics/SKILL.md','utf8'); const fm=md.match(/^---\n([\s\S]*?)\n---/); if(!fm || !fm[1].includes('name: woc-world-mechanics') || !fm[1].includes('description:')) throw new Error('bad frontmatter'); console.log('FRONTMATTER-OK')"
```

Expected: `YAML-OK` then `FRONTMATTER-OK`.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/woc-world-mechanics/SKILL.md .agents/skills/woc-world-mechanics/agents/openai.yaml
git commit -m "$(cat <<'EOF'
feat(skills): add woc-world-mechanics

Adds the Claude-facing skill plus its Codex-parity companion for
redesigning World of ClaudeCraft zone/dungeon/delve room layout and
mechanics, per the design spec at
docs/superpowers/specs/2026-07-21-world-redesign-skills-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `woc-world-creatures`

**Files:**
- Create: `.claude/skills/woc-world-creatures/SKILL.md`
- Create: `.agents/skills/woc-world-creatures/SKILL.md` (a byte-identical copy of the
  `.claude` one; see the File structure note on why all three files are needed)
- Create: `.agents/skills/woc-world-creatures/agents/openai.yaml`

- [ ] **Step 1: Write the SKILL.md**

```markdown
---
name: woc-world-creatures
description: "Source or generate a World of ClaudeCraft NPC or mob visual. Use when a mob or NPC needs a distinct look instead of falling back to a shared family model, or when deciding how to get a new creature model into the game."
---

# World Creatures

Source or generate a distinct visual for an NPC or mob, instead of it falling back to
a shared family model. This is the character-visual half of world redesign; for
buildings/props use `woc-world-structures`, for zone/dungeon layout use
`woc-world-mechanics`.

## Read this first

`src/render/characters/CLAUDE.md` in full before touching anything here. The load-
bearing fact: every mob/NPC visual is a rigged, animated GLB (a `SkeletonUtils` clone
of a manifest asset with its own `AnimationMixer`). There is no procedural-rig
rendering path in the current contract.

## Design authority

If the work is Emberwood-themed, `docs/superpowers/specs/2026-07-19-endlessglory-asset-redesign-design.md`
section 6.1 (Playable characters and NPCs) and 6.2 (Creatures and enemies) set the
silhouette, material-zone, and role-readability requirements a new visual must meet.

## Asset provenance and licensing (check before reusing anything)

Commit messages in this repo are NOT reliable provenance. Two examples confirmed by
tracing the actual files:

- The 9 Emberwood NPC visuals (`public/models/emberwood/npcs/emberwood_*.glb`) are
  built from `public/models/chars/players/*.glb`, which trace to commit `2133845ed`,
  whose own message says they integrate the **paid KayKit Adventurers 2.0 +
  Character Animations 1.1 packs**. Two later commits describe these same assets as
  "OpenMMO models"; that label does not match the file history.
- The Amber-Heart Golem's commit (`d42b5a05d`) claims an "OpenMMO orc base". That
  could be neither confirmed nor ruled out from the repo alone. Treat it as unverified.

**Licensing:** `github.com/Julian-adv/OpenMMO` is **PolyForm Noncommercial 1.0.0**
(confirmed by fetching its LICENSE). This game is commercial (Credits currency, a
paid store). Anything sourced from that repo needs the owner's explicit permission
before it ships; do not assume prior use establishes a precedent. Record what you
actually verified in `CREDITS.md`, including "unverified" when that is the truth.

## The options, in the order to actually try them

This order comes from the Amber-Heart Golem's real history (read via `git log`/
`git show`, not guessed): three approaches were tried in one session, and the LAST
one shipped, not the first.

1. **Free reuse first.** Check `public/models/creatures/` and every
   `public/models/emberwood/*/` subdirectory for an already-present, unused GLB that
   fits before generating anything. Free and instant if it fits.
2. **Reskin an existing rigged asset.** Take an existing rigged model from the asset
   packs already in the repo and retexture/rebuild its materials in Blender. This is
   what the Golem's FINAL, shipped version does: a rigged humanoid base retextured to
   obsidian rock, an emissive amber core, and crystal spikes. It beat both
   alternatives tried before it in the same session.

   **Do not assume a donor mesh carries its own animations.** Verify before building
   anything on it, by reading the GLB's JSON chunk directly:

   ```bash
   node -e "
   const fs=require('fs');const b=fs.readFileSync(process.argv[1]);
   const j=JSON.parse(b.slice(20,20+b.readUInt32LE(12)).toString('utf8'));
   console.log('animations:',(j.animations||[]).map(a=>a.name));
   const s=(j.skins||[])[0];
   console.log('joints:',s?s.joints.map(i=>j.nodes[i].name).slice(0,10):'NO SKIN');
   " <path-to.glb>
   ```

   OpenMMO's character meshes ship with **zero** animations: its clips live in a
   SEPARATE `client/public/models/animations/` set (`locomotion.glb`,
   `combat_melee.glb`, `offhand.glb`, `social.glb`). Graft them on at build time with
   `addClipsFrom` in the asset spec (see `scripts/assets/build_assets.mjs`), listing
   each library GLB; the pipeline retargets channels onto the character's bones by
   name and warns about any that do not match.

   **Clip libraries do not cross rigs.** Bone naming differs per source and there is
   no automatic retarget between them: OpenMMO uses Mixamo naming (`Hips`, `Spine1`,
   `LeftForeArm`), KayKit uses `hips`/`spine`/`upperarm.l`/`handslot.l`, and the Golem
   carries a third convention (`Shoulder_L`/`UpperArm_L`). Confirm the donor mesh and
   the clip library share a naming scheme (the snippet above prints both) before
   assuming a clip set will apply.
3. **True image-to-3D generation**, only if neither of the above fits: the real,
   already-built `scripts/image_to_3d.mjs` harness (Meshy, Tripo, and Rodin providers;
   `node scripts/image_to_3d.mjs --provider <name> --key <API_KEY> --image <path>
   [--out <path>]`). It polls the provider, downloads the result, and re-centers/
   normalizes it via gltf-transform to the game's height convention. This is a Node
   script, not an MCP tool, and no provider key is connected by default in this
   environment. Confirm a key is actually available AND confirm the credit cost with
   the user before running it (Meshy alone runs 5 to 20 credits per generation).
4. **A procedural node-rig** (`scripts/gen_<creature>.mjs`: hand-authored materials
   and geometry, an articulated node hierarchy with no bone skinning, animated by
   node-transform clips) was the Golem's FIRST attempt in the same session and was
   superseded twice (next by a concept-art billboard, then by option 2 above). Name it
   here as a documented dead end: it predates the current GLB-only contract in
   `src/render/characters/CLAUDE.md` and should not be the default choice for new work.

## Wiring

- A `VisualDef` entry in `src/render/characters/manifest.ts`'s `VISUALS` record:
  `url`, `height`, `clips` (a `ClipMap` factory: `kaykit([...])`, `mixamoClips()`, and
  `openmmoClips()` already exist; a rig with different clip names needs a new factory,
  and `openmmoClips()` is the worked example of one added for a donor rig whose clips
  were grafted on via `addClipsFrom`), optionally
  `show` (an allowlist of non-skinned node names to keep; KayKit ships every
  accessory visible by default), `attach` (a separate weapon/prop model plus a bone
  name), and `tint`/`tintStrength` (`tint: 'entity'` reads the mob/NPC's own `color:`
  field from its content record, for a family-shared model where each instance keeps
  its own hue).
- A `MOB_KEYS[templateId]` or `NPC_KEYS[templateId]` line pointing at that key.
  Dispatch precedence (`visualKeyFor` in `manifest.ts`): players to `player_<class>`;
  mobs to `MOB_KEYS[templateId]`, then `FAMILY_KEYS[family]`, then `mob_bandit`; NPCs
  to `NPC_KEYS[templateId]`.
- `manifestUrls()` auto-preloads `url` plus `attach[].url` plus `animUrls`, so dropping
  the GLB under `public/models/...` and running the media-manifest build
  (`node scripts/build_media_manifest.mjs generate`, automatic in `npm run build`) is
  the only asset-registration step needed beyond the `VISUALS` entry itself.
- `npm run wiki:stills` if this is a new mob or class visual the public Guide's
  bestiary should show (not part of `pretest`/`build`; needs a headless browser).

## Verification

- `npx vitest run tests/visual_manifest.test.ts` (pins the `VISUALS`/clip contract).
- `npx tsc --noEmit`.
- Look at it in the actual running game before calling it done. There is no automated
  check for "does this mesh look right"; the Golem's own three-iteration history is
  the proof that the first attempt is often not the one that ships.
```

- [ ] **Step 2: Verify every path the skill references actually exists**

Run:
```bash
test -f src/render/characters/CLAUDE.md && echo OK-characters-claude
grep -q "export const VISUALS" src/render/characters/manifest.ts && echo OK-visuals
grep -q "MOB_KEYS" src/render/characters/manifest.ts && echo OK-mob-keys
grep -q "NPC_KEYS" src/render/characters/manifest.ts && echo OK-npc-keys
grep -q "FAMILY_KEYS" src/render/characters/manifest.ts && echo OK-family-keys
grep -q "const kaykit = " src/render/characters/manifest.ts && echo OK-kaykit
grep -q "const mixamoClips = " src/render/characters/manifest.ts && echo OK-mixamo-clips
grep -q "function visualKeyFor" src/render/characters/manifest.ts && echo OK-visual-key-for
test -f scripts/image_to_3d.mjs && echo OK-image-to-3d
test -f tests/visual_manifest.test.ts && echo OK-visual-manifest-test
test -f docs/superpowers/specs/2026-07-19-endlessglory-asset-redesign-design.md && echo OK-design-doc
```

Expected: 11 `OK-*` lines, no missing ones. Fix the SKILL.md before continuing if any
are missing (in particular, `mixamoClips`/`kaykit` are function names inside
`manifest.ts`, not separate files: confirm by reading the matching line, not just the
grep hit, since a stale or renamed function is exactly the kind of drift this step
exists to catch).

- [ ] **Step 3: Write the openai.yaml companion**

```yaml
interface:
  display_name: "World of ClaudeCraft World Creatures"
  short_description: "Source or generate an NPC or mob visual"
  default_prompt: "Use $woc-world-creatures to source or generate a distinct World of ClaudeCraft NPC or mob visual."
policy:
  allow_implicit_invocation: false
```

- [ ] **Step 4: Verify the YAML parses and the frontmatter is well-formed**

Run:
```bash
node -e "const fs=require('fs'); const yaml=fs.readFileSync('.agents/skills/woc-world-creatures/agents/openai.yaml','utf8'); if(!yaml.includes('display_name') || !yaml.includes('default_prompt')) throw new Error('missing required field'); console.log('YAML-OK')"
node -e "const fs=require('fs'); const md=fs.readFileSync('.claude/skills/woc-world-creatures/SKILL.md','utf8'); const fm=md.match(/^---\n([\s\S]*?)\n---/); if(!fm || !fm[1].includes('name: woc-world-creatures') || !fm[1].includes('description:')) throw new Error('bad frontmatter'); console.log('FRONTMATTER-OK')"
```

Expected: `YAML-OK` then `FRONTMATTER-OK`.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/woc-world-creatures/SKILL.md .agents/skills/woc-world-creatures/agents/openai.yaml
git commit -m "$(cat <<'EOF'
feat(skills): add woc-world-creatures

Adds the Claude-facing skill plus its Codex-parity companion for
sourcing or generating World of ClaudeCraft NPC/mob visuals, per the
design spec at
docs/superpowers/specs/2026-07-21-world-redesign-skills-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Cross-check all three skills together

**Files:**
- None created; this task only verifies Tasks 1 to 3 together.

- [ ] **Step 1: Confirm all nine files exist and are non-empty**

Run:
```bash
for f in \
  .claude/skills/woc-world-structures/SKILL.md \
  .claude/skills/woc-world-mechanics/SKILL.md \
  .claude/skills/woc-world-creatures/SKILL.md \
  .agents/skills/woc-world-structures/agents/openai.yaml \
  .agents/skills/woc-world-mechanics/agents/openai.yaml \
  .agents/skills/woc-world-creatures/agents/openai.yaml \
; do
  if [ -s "$f" ]; then echo "OK: $f"; else echo "MISSING OR EMPTY: $f"; fi
done
```

Expected: six `OK:` lines, no `MISSING OR EMPTY` lines.

- [ ] **Step 2: Confirm each skill's cross-references to its siblings are consistent**

Run:
```bash
grep -l "woc-world-mechanics" .claude/skills/woc-world-structures/SKILL.md .claude/skills/woc-world-creatures/SKILL.md
grep -l "woc-world-structures" .claude/skills/woc-world-mechanics/SKILL.md .claude/skills/woc-world-creatures/SKILL.md
grep -l "woc-world-creatures" .claude/skills/woc-world-structures/SKILL.md .claude/skills/woc-world-mechanics/SKILL.md
```

Expected: each command lists both files passed to it (each skill names both of its
siblings at least once, so a session reading only one of the three still finds the
other two).

- [ ] **Step 3: Confirm no em dashes, en dashes, or emoji crept into any of the nine files**

Run:
```bash
grep -rlP '\x{2014}|\x{2013}|[\x{2705}\x{274C}\x{2753}\x{2757}\x{2B50}\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' \
  .claude/skills/woc-world-structures/SKILL.md \
  .claude/skills/woc-world-mechanics/SKILL.md \
  .claude/skills/woc-world-creatures/SKILL.md \
  .agents/skills/woc-world-structures/agents/openai.yaml \
  .agents/skills/woc-world-mechanics/agents/openai.yaml \
  .agents/skills/woc-world-creatures/agents/openai.yaml \
  || echo CLEAN
```

Expected: `CLEAN` (no filenames printed). This repo hard-fails a PR on any of these
characters anywhere, including docs; fix inline and re-run if anything prints.

- [ ] **Step 4: No commit needed**

Task 4 is verification only; Tasks 1 to 3 already committed their own files. If Step 3
required a fix, amend the affected task's commit is NOT the move (this repo's
convention is a new commit, never amend); instead stage and commit the fix directly:

```bash
git add -A
git status --short
```

Only run `git commit` here if Step 3 actually found and fixed something; otherwise
there is nothing to commit and this step is a no-op check.

## Completion definition

This plan is complete when:

- All nine files exist, matching the content in Tasks 1 to 3 exactly.
- Every verification command in Steps 2/4 of Tasks 1 to 3 and every command in Task 4
  printed its expected `OK`/`CLEAN` output with nothing missing.
- Three commits exist (one per skill), each containing exactly that skill's two files.
- No em dash, en dash, or emoji appears in any of the nine files.

## Follow-on work (not part of this plan)

- Using `woc-world-mechanics` to write the actual Slice B/C/D redesign plans the
  Eastbrook implementation plan calls for, once Slice A passes its own completion
  definition.
- Using `woc-world-creatures`/`woc-world-structures` to finish wiring the
  already-generated but currently unwired Emberwood NPC and building assets, if that
  work is wanted before Slice A is called complete.
