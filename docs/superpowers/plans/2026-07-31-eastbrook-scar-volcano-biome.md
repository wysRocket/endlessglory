# Eastbrook Vale to Volcano Biome Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip the starter zone's biome to the already-wired `'volcano'` `BiomeId` and carry a consistent content-text rename pass across every zone name/POI/mob/NPC-title/quest string that reads as vale/forest/lake imagery, while leaving every id, stat, loot table, quest objective, and reward byte-identical.

**Architecture:** All changes land in one file, `src/sim/content/zone1.ts` (a `biome` flag flip plus text-only edits), followed by the generated-guide regen the CLAUDE.md content workflow requires, then verification and the gate. No render code changes — the volcano rendering pipeline (terrain palette, foliage density, sky, motes, fog) already exists and activates automatically once the flag flips.

**Tech Stack:** TypeScript content data, no new dependencies.

**Working directly on `main`** (continuing the session's established convention — no worktree, no branch). Commit after each task.

---

## Reference

Spec: [`docs/superpowers/specs/2026-07-31-eastbrook-scar-volcano-biome-design.md`](../specs/2026-07-31-eastbrook-scar-volcano-biome-design.md)

**The complete rename table** (derived by reading the entirety of `src/sim/content/zone1.ts`, all 1410 lines, during planning). This is the single source of truth for every task below — apply exactly these changes, nothing more:

### Zone
| Field | Old | New |
|---|---|---|
| `ZONE1_ZONE.biome` | `'vale'` | `'volcano'` |
| `ZONE1_ZONE.name` | `'Eastbrook Vale'` | `'Eastbrook Scar'` |

### POI labels (`ZONE1_ZONE.pois[].label`; ids never change)
| id | Old label | New label | Why |
|---|---|---|---|
| `boar_meadow` | Boar Meadow | Ashboar Flat | "Meadow" is grassland imagery |
| `mirror_lake` | Mirror Lake | Glasswater Lake | Confirmed anchor |
| `brightwood_glade` | Brightwood Glade | Emberwood Glade | Confirmed anchor |
| `the_sowfield` | The Sowfield | The Cinderfield | Confirmed anchor |
| everything else (`eastbrook`, `wolf_run`, `sableweb`, `copper_dig`, `bandit_camp`, `fallen_chapel`, `reliquary_hill`) | — | **unchanged** | Neutral or already fits (mining/ruins/camp/hill names aren't biome-specific) |

### Mob display names (`ZONE1_MOBS[id].name`; ids never change)
| id | Old name | New name | Why |
|---|---|---|---|
| `forest_wolf` | Forest Wolf | Ashfang Wolf | Confirmed anchor |
| `wild_boar` | Wild Boar | Ash Boar | Confirmed anchor |
| `vale_bandit` | Vale Bandit | Scar Bandit | "Vale" → "Scar" consistency (see below) |
| all other mobs (`warlock_imp`, `warlock_voidwalker`, `old_greyjaw`, `webwood_spider`, `mogger`, `mogger_lackey`, `mudfin_murloc`, `tunnel_rat`, `grix_the_tunnelking`, `restless_bones`, `captain_verlan`, `wraithbinder_maldrec`, `gorrak`, `amber_heart_golem`) | — | **unchanged** | Proper names, already-fitting names, or biome-neutral |

**New finding from the full read:** "the Vale" is used repeatedly in NPC dialogue and quest text as the *colloquial name for the whole region* (independent of the `ZONE1_ZONE.name` field), e.g. "The Vale is not what it was," "Bandits of the Vale," "the Vale's dead." Since the zone's proper name is becoming "Eastbrook Scar," every one of these in-world references to "the Vale" becomes "the Scar" for consistency — leaving them as "Vale" while the zone is officially "Eastbrook Scar" would read as an error, not a choice. This is captured per-instance in the quest/NPC tables below.

### NPC title/greeting edits (personal names — Marshal Redbrook, Smith Haldren, etc. — never change; most titles/greetings are unaffected and stay as-is)
| NPC id | Field | Old | New |
|---|---|---|---|
| `marshal_redbrook` | `greeting` | `'Keep your blade close, $C. The Vale is not what it was.'` | `'Keep your blade close, $C. The Scar is not what it was.'` |
| `apothecary_lin` | `greeting` | `'Careful where you step in the eastern woods, friend.'` | `'Careful where you step in the eastern ash scrub, friend.'` |
| `brother_aldric` | `title` | `'Priest of the Vale'` | `'Priest of the Scar'` |
| `groundskeeper_bram` | `title` | `'Keeper of the Sowfield'` | `'Keeper of the Cinderfield'` |
| `groundskeeper_bram` | `greeting` | `'The truce holds at the Sowfield, $C: boots and shoulders only. Care to play for the Copper Pail?'` | `'The truce holds at the Cinderfield, $C: boots and shoulders only. Care to play for the Copper Pail?'` |
| `chronicler_saul` | `title` | `'The Vale Chronicle'` | `'The Scar Chronicle'` |

**Resolved editorial call (per the spec's flagged item):** `fisherman_brandt` stays unchanged — role, greeting, and quest all untouched. "Glasswater Lake" is still a body of water; a mineral-hot lake plausibly still supports fish (and murlocs) in-fiction, so no NPC-role rework is needed, only the lake's own label (already in the POI table above) and the one quest line that names it (below).

### Quest name/text edits (`ZONE1_QUESTS`; ids, objectives, rewards, gates never change)
Only quests with an actual vale/forest/lake reference are touched. Every other quest (`q_prof_intro`, `q_bones`, `q_supplies`, `q_whispers`, `q_names_of_the_dead`, `q_silence_the_call`, `q_rite`, `q_sexton`, `q_gravecallers_trail`, `q_mine`, `q_prof_hobby_switch`) is **unchanged**.

| Quest id | Field | Old | New |
|---|---|---|---|
| `q_wolves` | `text` | `'The forest wolves grow bold, snapping at travelers on the north road. Thin their numbers, $N. Slay 8 Forest Wolves and Eastbrook will breathe easier.'` | `'The ashfang wolves grow bold, snapping at travelers on the north road. Thin their numbers, $N. Slay 8 Ashfang Wolves and Eastbrook will breathe easier.'` |
| `q_wolves` | `objectives[0].label` | `'Forest Wolf slain'` | `'Ashfang Wolf slain'` |
| `q_greyjaw` | `text` | `"There is one wolf no trap has held: Old Greyjaw. He has taken three hounds and a stable boy's arm. He prowls the deep woods north of the wolf runs. Bring me his fang."` | `"There is one wolf no trap has held: Old Greyjaw. He has taken three hounds and a stable boy's arm. He prowls the scorched hills north of the wolf runs. Bring me his fang."` |
| `q_boars` | `text` | `'Boar hide makes the finest travel packs, and the meadows west of town are crawling with the beasts. Bring me 5 Bristly Boar Hides and I will make it worth your time.'` | `'Boar hide makes the finest travel packs, and the ash flats west of town are crawling with the beasts. Bring me 5 Bristly Boar Hides and I will make it worth your time.'` |
| `q_spiders` | `text` | `'The lurkers in the eastern woods spin a silk I need for my poultices - and they have grown far too numerous besides. Cull 6 Sableweb Lurkers and cut 4 silk glands from their bellies.'` | `'The lurkers in the eastern ash scrub spin a silk I need for my poultices - and they have grown far too numerous besides. Cull 6 Sableweb Lurkers and cut 4 silk glands from their bellies.'` |
| `q_murlocs` | `text` | `'Twenty years I have fished Mirror Lake, and never lost a net until those gurgling fish-men crawled out of the shallows. Drive the Mudfin back - slay 8 of them. And watch yourself: where there is one mudfin, there are five.'` | `'Twenty years I have fished Glasswater Lake, and never lost a net until those gurgling fish-men crawled out of the shallows. Drive the Mudfin back - slay 8 of them. And watch yourself: where there is one mudfin, there are five.'` |
| `q_hollow` | `text` | `"Morthen the Gravecaller waits at the bottom of the Hollow Crypt, ringed by the elite dead he has raised. He is far beyond any one hero - take four companions, no fewer. End him, and the Vale's dead will finally sleep."` | `"Morthen the Gravecaller waits at the bottom of the Hollow Crypt, ringed by the elite dead he has raised. He is far beyond any one hero - take four companions, no fewer. End him, and the Scar's dead will finally sleep."` |
| `q_hollow` | `completionText` | `"The whispering has stopped. You have done what the whole Vale could not, $N - the dead sleep, and Eastbrook owes you everything it has."` | `"The whispering has stopped. You have done what the whole Scar could not, $N - the dead sleep, and Eastbrook owes you everything it has."` |
| `q_bandits` | `name` | `'Bandits of the Vale'` | `'Bandits of the Scar'` |
| `q_bandits` | `objectives[0].label` | `'Vale Bandit slain'` | `'Scar Bandit slain'` |
| `q_ringleader` | `completionText` | `'Gorrak is dead? Then the Vale is free of his shadow. You have done Eastbrook a great service.'` | `'Gorrak is dead? Then the Scar is free of his shadow. You have done Eastbrook a great service.'` |
| `q_mogger` | `text` | `'Mogger has split carts, flattened fences, and killed enough livestock to empty half the Vale. Do not face him alone. Take two strong companions into the eastern meadow and put the brute down for good.'` | `'Mogger has split carts, flattened fences, and killed enough livestock to empty half the Scar. Do not face him alone. Take two strong companions into the eastern ash flat and put the brute down for good.'` |
| `q_mogger` | `completionText` | `"Mogger dead at last. Eastbrook's fields are safer, and you leave the Vale with one more tale worth retelling."` | `"Mogger dead at last. Eastbrook's fields are safer, and you leave the Scar with one more tale worth retelling."` |
| `q_archetype_acceptance` | `text` | `'Skill is knowledge, $N, but attunement is a promise. Choose two neighboring crafts whose methods you will carry as your majors, then bring me ore worked from the Vale with your own hands.'` | `'Skill is knowledge, $N, but attunement is a promise. Choose two neighboring crafts whose methods you will carry as your majors, then bring me ore worked from the Scar with your own hands.'` |
| `q_prof_make_amends` | `text` | `'You have carried that pair before, $N. Returning is no fresh vow. Help keep the Vale road clear, and the work will remind your hands what they once knew.'` | `'You have carried that pair before, $N. Returning is no fresh vow. Help keep the Scar road clear, and the work will remind your hands what they once knew.'` |
| `q_prof_make_amends` | `objectives[0].label` | `'Forest Wolf slain'` | `'Ashfang Wolf slain'` |

Every `$N`/`$C` placeholder above is preserved verbatim in its original position. No `objectives[].type`, `targetMobId`, `itemId`, `count`, `xpReward`, `copperReward`, `itemRewards`, `requiresQuest`, `giverNpcId`, or `turnInNpcId` changes anywhere in this plan.

---

### Task 1: Zone flag + zone name + POI labels

**Files:**
- Modify: `src/sim/content/zone1.ts`

- [ ] **Step 1: Update the file-header comment**

At the top of `src/sim/content/zone1.ts`, the header comment names the old zone identity. Change:
```ts
// Zone 1 - Eastbrook Vale (levels 1-7). The starter zone: town of Eastbrook,
// wolves and boars, the bandit camp, and Brother Aldric's Gravecaller chain
// leading to the Hollow Crypt.
```
to:
```ts
// Zone 1 - Eastbrook Scar (levels 1-7). The starter zone: town of Eastbrook,
// wolves and boars, the bandit camp, and Brother Aldric's Gravecaller chain
// leading to the Hollow Crypt.
```
(Only the zone name in the first line changes; "wolves and boars" stays as the generic creature-family shorthand, it's not the mobs' specific display names.)

- [ ] **Step 2: Apply the zone-level edits**

In `src/sim/content/zone1.ts`, within the `ZONE1_ZONE` object (starts at line 21), make these exact edits:

```ts
export const ZONE1_ZONE: ZoneDef = {
  id: 'eastbrook_vale',
  name: 'Eastbrook Scar',
  zMin: -180,
  zMax: 180,
  levelRange: [1, 7],
  biome: 'volcano',
  hub: { x: 0, z: 0, radius: TOWN_RADIUS, name: 'Eastbrook' },
  graveyard: GRAVEYARD_POS,
  lakes: [LAKE],
  pois: [
    { x: 0, z: -3, label: 'Eastbrook', id: 'eastbrook' },
    { x: -2, z: 70, label: 'Wolf Run', id: 'wolf_run' },
    { x: 65, z: 0, label: 'Ashboar Flat', id: 'boar_meadow' },
    { x: -88, z: 82, label: 'Glasswater Lake', id: 'mirror_lake' },
    { x: -60, z: 4, label: 'Sableweb', id: 'sableweb' },
    { x: -84, z: -64, label: 'Copper Dig', id: 'copper_dig' },
    { x: 76, z: -76, label: 'Bandit Camp', id: 'bandit_camp' },
    { x: 80, z: 80, label: 'Fallen Chapel', id: 'fallen_chapel' },
    { x: -148, z: 120, label: 'Reliquary Hill', id: 'reliquary_hill' },
    { x: 40, z: 140, label: 'Emberwood Glade', id: 'brightwood_glade' },
    { x: -11, z: -112, label: 'The Cinderfield', id: 'the_sowfield' },
  ],
  welcome: 'Find Marshal Redbrook in town - he has work for you.',
  welcomeQuestId: 'q_wolves',
};
```

Note the `id` fields on every POI entry are untouched (`boar_meadow`, `mirror_lake`, `brightwood_glade`, `the_sowfield` all keep their original id despite the label change) — only `label` and the top-level `name`/`biome` change.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (`'volcano'` is already a valid `BiomeId` member).

- [ ] **Step 4: Run the referential-integrity test**

Run: `npx vitest run tests/progression.test.ts`
Expected: PASS (no id changed, so every loot table/vendor/camp/spawn reference still resolves).

- [ ] **Step 5: Commit**

```bash
git add src/sim/content/zone1.ts
git commit -m "$(cat <<'EOF'
feat(content): flip Eastbrook Vale to the volcano biome

ZONE1_ZONE.biome -> 'volcano' (already a fully-wired BiomeId with no
zone using it yet: terrain palette, rock-slope threshold, foliage
density, sky/fog, and mote color all activate automatically). Zone
renamed to Eastbrook Scar; POI labels that read as green/pastoral
(Boar Meadow, Mirror Lake, Brightwood Glade, The Sowfield) renamed to
fit. No id, stat, loot, or quest data changes.
EOF
)"
```

---

### Task 2: Mob display name renames

**Files:**
- Modify: `src/sim/content/zone1.ts`

- [ ] **Step 1: Rename the three mob display names**

In `ZONE1_MOBS`, apply these three edits (each is a single `name:` field inside its mob's object — the surrounding fields on each mob are unchanged, shown here only for anchoring):

```ts
  forest_wolf: {
    id: 'forest_wolf',
    name: 'Ashfang Wolf',
```

```ts
  wild_boar: {
    id: 'wild_boar',
    name: 'Ash Boar',
```

```ts
  vale_bandit: {
    id: 'vale_bandit',
    name: 'Scar Bandit',
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run the referential-integrity test**

Run: `npx vitest run tests/progression.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/sim/content/zone1.ts
git commit -m "$(cat <<'EOF'
feat(content): rename three Eastbrook Scar mob display names

Forest Wolf -> Ashfang Wolf, Wild Boar -> Ash Boar, Vale Bandit ->
Scar Bandit (the last for consistency now the zone is Eastbrook
Scar, not Eastbrook Vale). Ids, stats, and loot tables unchanged;
the matching quest text/objective labels are updated in a follow-up
commit.
EOF
)"
```

---

### Task 3: NPC title/greeting renames

**Files:**
- Modify: `src/sim/content/zone1.ts`

- [ ] **Step 1: Apply the five NPC edits**

In `ZONE1_NPCS`:

`marshal_redbrook.greeting`:
```ts
    greeting: 'Keep your blade close, $C. The Scar is not what it was.',
```

`apothecary_lin.greeting`:
```ts
    greeting: 'Careful where you step in the eastern ash scrub, friend.',
```

`brother_aldric.title`:
```ts
    title: 'Priest of the Scar',
```

`groundskeeper_bram.title` and `.greeting`:
```ts
    title: 'Keeper of the Cinderfield',
```
```ts
    greeting:
      'The truce holds at the Cinderfield, $C: boots and shoulders only. Care to play for the Copper Pail?',
```

`chronicler_saul.title`:
```ts
    title: 'The Scar Chronicle',
```

Every other NPC field (personal `name`, `pos`, `facing`, `color`, `questIds`, `vendorItems`) is untouched. Every other NPC record in `ZONE1_NPCS` is untouched.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/sim/content/zone1.ts
git commit -m "$(cat <<'EOF'
feat(content): retone five Eastbrook Scar NPC titles/greetings

Priest of the Vale -> Priest of the Scar, The Vale Chronicle -> The
Scar Chronicle, Keeper of the Sowfield -> Keeper of the Cinderfield
(matching the POI rename), plus two greeting lines that referenced
"the Vale" or "the eastern woods". Every personal name, position,
and quest-giver link is untouched.
EOF
)"
```

---

### Task 4: Quest name/text rewrites

**Files:**
- Modify: `src/sim/content/zone1.ts`

- [ ] **Step 1: Apply the eleven quest edits**

In `ZONE1_QUESTS`, apply each of these (only the shown field changes; every other field on each quest — `objectives` types/counts/ids beyond the shown `label`, `xpReward`, `copperReward`, `itemRewards`, `requiresQuest`, `giverNpcId`, `turnInNpcId`, `minLevel`, `suggestedPlayers` — is untouched):

`q_wolves`:
```ts
    text: 'The ashfang wolves grow bold, snapping at travelers on the north road. Thin their numbers, $N. Slay 8 Ashfang Wolves and Eastbrook will breathe easier.',
    completionText: 'Fine work. The road feels safer already.',
    objectives: [
      { type: 'kill', targetMobId: 'forest_wolf', count: 8, label: 'Ashfang Wolf slain' },
    ],
```

`q_greyjaw`:
```ts
    text: "There is one wolf no trap has held: Old Greyjaw. He has taken three hounds and a stable boy's arm. He prowls the scorched hills north of the wolf runs. Bring me his fang.",
```

`q_boars`:
```ts
    text: 'Boar hide makes the finest travel packs, and the ash flats west of town are crawling with the beasts. Bring me 5 Bristly Boar Hides and I will make it worth your time.',
```

`q_spiders`:
```ts
    text: 'The lurkers in the eastern ash scrub spin a silk I need for my poultices - and they have grown far too numerous besides. Cull 6 Sableweb Lurkers and cut 4 silk glands from their bellies.',
```

`q_murlocs`:
```ts
    text: 'Twenty years I have fished Glasswater Lake, and never lost a net until those gurgling fish-men crawled out of the shallows. Drive the Mudfin back - slay 8 of them. And watch yourself: where there is one mudfin, there are five.',
```

`q_hollow` (both `text` and `completionText` change):
```ts
    text: "Morthen the Gravecaller waits at the bottom of the Hollow Crypt, ringed by the elite dead he has raised. He is far beyond any one hero - take four companions, no fewer. End him, and the Scar's dead will finally sleep.",
    completionText:
      'The whispering has stopped. You have done what the whole Scar could not, $N - the dead sleep, and Eastbrook owes you everything it has.',
```

`q_bandits`:
```ts
    name: 'Bandits of the Scar',
    giverNpcId: 'marshal_redbrook',
    turnInNpcId: 'marshal_redbrook',
    text: 'A pack of cutthroats has made camp in the southwest hills. They have robbed three wagons this week. Drive them out - slay 10 Scar Bandits.',
    completionText: 'Ten fewer knives in the dark. Take this - you have earned it.',
    objectives: [
      { type: 'kill', targetMobId: 'vale_bandit', count: 10, label: 'Scar Bandit slain' },
    ],
```

`q_ringleader` (only `completionText` changes):
```ts
    completionText:
      'Gorrak is dead? Then the Scar is free of his shadow. You have done Eastbrook a great service.',
```

`q_mogger`:
```ts
    text: 'Mogger has split carts, flattened fences, and killed enough livestock to empty half the Scar. Do not face him alone. Take two strong companions into the eastern ash flat and put the brute down for good.',
    completionText:
      "Mogger dead at last. Eastbrook's fields are safer, and you leave the Scar with one more tale worth retelling.",
```

`q_archetype_acceptance` (only `text` changes):
```ts
    text: 'Skill is knowledge, $N, but attunement is a promise. Choose two neighboring crafts whose methods you will carry as your majors, then bring me ore worked from the Scar with your own hands.',
```

`q_prof_make_amends`:
```ts
    text: 'You have carried that pair before, $N. Returning is no fresh vow. Help keep the Scar road clear, and the work will remind your hands what they once knew.',
    completionText: 'The old rhythm returns. Your former pair is active once more.',
    objectives: [
      { type: 'kill', targetMobId: 'forest_wolf', count: 5, label: 'Ashfang Wolf slain' },
    ],
```

- [ ] **Step 2: Grep for any stray old-name references left behind**

Run:
```bash
grep -n "Forest Wolf\|Wild Boar\|Vale Bandit\|Mirror Lake\|Boar Meadow\|Brightwood Glade\|The Sowfield\|Eastbrook Vale\|the Vale \|the Vale'\|Priest of the Vale\|Vale Chronicle" src/sim/content/zone1.ts
```
(quoted as literal substrings, not regex word-boundary escapes, since macOS's default `grep` does not support `\b`)
Expected: no output (every occurrence was one of the edits above). If anything prints, it's a missed spot from this plan's table — fix it to match the rename table before continuing (do not invent a new rename not in the table; if you find a genuinely new spot, it means the table missed it, so apply the same word-for-word substitution pattern used elsewhere: "Vale" -> "Scar", "Forest Wolf" -> "Ashfang Wolf", etc.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Run the referential-integrity test**

Run: `npx vitest run tests/progression.test.ts`
Expected: PASS (every `targetMobId`/`itemId`/`giverNpcId`/`turnInNpcId`/`requiresQuest` value is untouched — only `text`/`completionText`/`name`/`objectives[].label` strings changed).

- [ ] **Step 5: Commit**

```bash
git add src/sim/content/zone1.ts
git commit -m "$(cat <<'EOF'
feat(content): retone Eastbrook Scar quest text for the volcano biome

Eleven quests get a prose pass (forest/meadow/lake imagery, and "the
Vale" as the region's colloquial name, updated to match the zone's
new volcanic identity) plus three objective-label updates matching
the prior mob-rename commit. Every objective type/target/count,
reward, and quest-chain gate (requiresQuest, giver/turn-in NPC) is
byte-identical to before this change.
EOF
)"
```

---

### Task 5: Guide content regen

**Files:**
- Modify: `src/guide/content.generated.ts` (regenerated, not hand-edited)

- [ ] **Step 1: Regenerate**

Run: `npm run wiki:content`

- [ ] **Step 2: Confirm the guide freshness test passes**

Run: `npx vitest run tests/guide.test.ts`
Expected: PASS.

- [ ] **Step 3: Review the diff**

Run: `git diff --stat src/guide/content.generated.ts`
Expected: a diff touching only the renamed strings (POI/mob/quest/zone names/labels) carried through into the generated guide content — no unrelated content should move.

- [ ] **Step 4: Commit**

```bash
git add src/guide/content.generated.ts
git commit -m "$(cat <<'EOF'
chore(guide): regenerate content for the Eastbrook Scar rename pass

npm run wiki:content, required by the guide freshness gate whenever
zone/mob/quest/NPC content changes.
EOF
)"
```

---

### Task 6: Manual verification + screenshots

**Files:**
- Create: `docs/screenshots/eastbrook-scar-volcano/after-desktop.png`
- Create: `docs/screenshots/eastbrook-scar-volcano/after-boundary.png`

- [ ] **Step 1: Start the dev server and enter the world**

Load the offline client, enter Eastbrook. Confirm:
- The town square and surrounding vale now read as scorched/volcanic: ground color, sparse bush-only vegetation (no forest canopy), the sky/fog tint.
- The plaza/banners/lantern dressing (from the prior spec, untouched by this change) still look correct against the new surrounding terrain.
- The minimap/zone name in the HUD shows "Eastbrook Scar."
- Talk to at least Marshal Redbrook, Brother Aldric, Apothecary Lin, and Groundskeeper Bram; confirm their new greeting/title text reads correctly and no `$C`/`$N` placeholder shows up unresolved (it should render as the character/class name, not literal `$C`/`$N`).
- Open the quest log for `q_wolves`, `q_bandits`, and `q_mogger`; confirm the objective labels read "Ashfang Wolf slain" / "Scar Bandit slain" and no stale "Forest Wolf"/"Vale Bandit" text remains anywhere in the UI.

Screenshot the town square at desktop size (1280x800): `docs/screenshots/eastbrook-scar-volcano/after-desktop.png`.

- [ ] **Step 2: Walk the zone1/zone2 boundary**

Travel to roughly `z = 170-190` (near `zMax = 180`) and look both directions along the boundary. Confirm the volcano-to-marsh blend reads as a coherent transition, not a hard seam or a broken color/height pop. Screenshot it: `docs/screenshots/eastbrook-scar-volcano/after-boundary.png`.

If the blend looks broken (not just "different," but visually wrong — a hard color seam, a height discontinuity, missing textures), stop and report it rather than trying to fix the shared cross-zone blend code — that system is out of scope for this plan per the spec's explicit decision to trust it as-is; a real defect there is a separate bug, not a follow-up task here.

- [ ] **Step 3: Run the localization guard**

Run: `npx vitest run tests/localization_fixes.test.ts`
Expected: PASS (sanity check per the spec's Section 5 — this change touches static content prose, not dynamic sim-emitted text, so it should be a no-op for this guard).

- [ ] **Step 4: Commit the screenshots**

```bash
git add docs/screenshots/eastbrook-scar-volcano/
git commit -m "$(cat <<'EOF'
docs(screenshots): add verification shots for the volcano biome flip

Town square and the zone1/zone2 boundary blend, confirming the
volcano biome pipeline (never exercised by a shipped zone before)
looks correct in practice.
EOF
)"
```

---

### Task 7: Full gate + final check

- [ ] **Step 1: Run the full pre-merge gate**

Run: `npm run gate`
Expected: PASS. (Note from the prior plan in this session: `npm run gate`'s changed-files biome check lints the WHOLE file once any part of it changes, not just new lines — if it flags an organize-imports or style fix in `zone1.ts` or `src/guide/content.generated.ts`, apply `npx @biomejs/biome check --write <file>` and re-verify the diff is still scoped to expected content before committing, rather than reverting the auto-fix.)

- [ ] **Step 2: Final status check**

```bash
git status --short
git log --oneline -10
```

Expected: clean working tree, all 6 content/verification commits from Tasks 1-6 present on `main`, each with the Conventional Commits body the repo requires.

---

## Notes for the executor

- **"Vale Cup" is a different, unrelated system — never touch it.** `social/vale_cup.ts` and its render/UI surface implement the Vale Cup boarball minigame (a shared cross-zone event, not part of Eastbrook's identity). It shares the word "Vale" by coincidence. `zone1.ts` has a couple of dev comments referencing it (e.g. near `groundskeeper_bram`, who spawns via `vale_cup_layout`); those comments and every "Vale Cup" reference anywhere in the codebase are out of scope for this plan. If a straggler-grep in Task 4 ever matches "Vale Cup," that is a false positive — leave it alone.
- No `IWorld`/`world_api` change, no new `SimEvent`, no i18n catalog surgery (see spec Section 5) — every non-English locale simply goes `pending` for the changed strings until a translator fills them at release, which is expected and not part of this change.
- If, during Task 4's grep-for-stragglers step, you find a vale/forest/lake reference this plan's table didn't anticipate, apply the SAME substitution pattern already established (Vale→Scar, Forest Wolf→Ashfang Wolf, meadow/woods→ash flat/ash scrub) rather than inventing a new term — consistency with the rest of the pass matters more than a locally clever rewrite.
- Do not touch `ZONE1_PROPS`, `ZONE1_CAMPS`, `ZONE1_CHAPEL_CAMPS`, `ZONE1_OBJECTS`, `ZONE1_ROADS`, or any position/radius/count field anywhere in `zone1.ts` — this plan is display-text and one biome flag, nothing spatial or mechanical.
- Do not touch item ids or item display names (e.g. `vale_carving_knife`, `brightwood_venison` sold by NPCs in this file) — item renames follow a different, stricter workflow (`src/ui/i18n.catalog/items.ts`) and were explicitly out of scope for this pass.
- Do not touch the town dressing (`src/render/town_dressing_core.ts`/`town_dressing.ts`) or `ZONE1_PROPS` — both are complete, shipped, and deliberately left as a contrasting "ordered outpost" amid the new terrain, per the spec.
