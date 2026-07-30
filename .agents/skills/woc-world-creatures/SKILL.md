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
  `openmmoClips()` already exist; a donor rig whose clip names match none of them
  needs a new `ClipMap` factory, and if its clips were grafted on via `addClipsFrom`,
  that factory names the clips in the grafted library, not the ones in the donor
  mesh, per `openmmoClips()`'s own header comment), optionally `show` (an allowlist
  of non-skinned node names to keep; KayKit ships every accessory visible by
  default), `attach` (a separate weapon/prop model plus a bone name), and
  `tint`/`tintStrength` (`tint: 'entity'` reads the mob/NPC's own `color:` field
  from its content record, for a family-shared model where each instance keeps its
  own hue).
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
